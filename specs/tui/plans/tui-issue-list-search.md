# Implementation Plan: `tui-issue-list-search`

This document outlines the step-by-step implementation plan for the inline search feature within the Issue List screen of the Codeplane TUI.

## Phase 1: Core Search Utilities and State

### Step 1: Define Search Types and Constants
**File:** `apps/tui/src/screens/Issues/search-types.ts`
- **Action:** Create the file to define the `SearchState` interface and export necessary constants (`SEARCH_MAX_LENGTH`, `SEARCH_DEBOUNCE_MS`, etc.).
- **Details:** Include the `formatMatchCount` utility function to standardise results rendering.

### Step 2: Implement Client-Side Filtering Utility
**File:** `apps/tui/src/screens/Issues/search-filter.ts`
- **Action:** Implement pure functions for client-side matching.
- **Details:**
  - `escapeRegex(str: string): string` to prevent regex injection.
  - `filterIssuesClientSide(issues: Issue[], query: string): Issue[]` to match issue title, body, labels, and author login using case-insensitive substring checks.
  - `mergeSearchResults(client: Issue[], server: Issue[]): Issue[]` to deduplicate results by ID and sort.
  - `computeHighlightSegments(text: string, query: string): HighlightSegment[]` to generate text segments for highlighting in the UI.

### Step 3: Implement Debounced Server-Side Search Hook
**File:** `apps/tui/src/screens/Issues/useIssueSearch.ts`
- **Action:** Create the custom hook `useIssueSearch`.
- **Details:**
  - Utilize `useAPIClient()` from `@codeplane/ui-core` to execute GET requests to `/api/repos/:owner/:repo/issues?q={query}`.
  - Manage a debounce timer (default 300ms via `SEARCH_DEBOUNCE_MS`).
  - Use `AbortController` to cancel in-flight requests on new keystrokes or unmount.
  - Handle HTTP status codes appropriately: `401` (throw auth expired), `429` (rate limit message), and `500` (server error message) with a 3-second auto-clearing error state.

## Phase 2: UI Components

### Step 4: Implement HighlightedText Component
**File:** `apps/tui/src/screens/Issues/components/HighlightedText.tsx`
- **Action:** Create a component to render search matches.
- **Details:** 
  - Use OpenTUI's `<box>` and `<text>` components.
  - Call `computeHighlightSegments` to split text.
  - Render matching segments with `theme.primary` and `bold`, leaving non-matching segments in the default/base color.
  - Use the `truncateText` utility to respect `maxWidth` column limits.

### Step 5: Implement SearchInput Component
**File:** `apps/tui/src/screens/Issues/components/SearchInput.tsx`
- **Action:** Create the inline search input.
- **Details:**
  - Use OpenTUI's `<input>` component.
  - Display a `/ ` prefix in `theme.muted`.
  - Calculate the width dynamically using `useLayout()` from `apps/tui/src/hooks/useLayout.js`.
  - Render the match count badge right-aligned, accounting for `isSearching` and `serverError` states.
  - Ensure `maxLength` clamping is enforced in the `onChange` handler.

### Step 6: Implement IssueRow Component
**File:** `apps/tui/src/screens/Issues/components/IssueRow.tsx`
- **Action:** Create the issue list row rendering component.
- **Details:**
  - Consume `useLayout()` to adapt column visibility and widths (minimum 80x24 vs standard 120x40 vs large 200x60).
  - If `searchQuery` is provided, wrap the issue title in `<HighlightedText>`. Otherwise, render simple truncated text.
  - Format relative timestamps.

## Phase 3: Screen Integration and Wiring

### Step 7: Implement IssueListScreen
**File:** `apps/tui/src/screens/Issues/IssueListScreen.tsx`
- **Action:** Build the main list screen, integrating data loading, search, and the new components.
- **Details:**
  - Create the component since `tui-issue-list-screen` may be unimplemented. 
  - Use `useIssues(owner, repo, { state })` from `@codeplane/ui-core` to load base issues.
  - Manage local search state (`searchActive`, `searchQuery`, etc.).
  - Combine `filterIssuesClientSide` and `useIssueSearch` to create `displayIssues`.
  - Define keybindings via `useScreenKeybindings`: `/` activates search, `j`/`k` navigates list, `Enter` opens detail view.
  - Wire up `apps/tui/src/lib/telemetry.ts` and `apps/tui/src/lib/logger.ts` for lifecycle tracking (e.g., `tui.issues.search.activated`, `tui.issues.search.submitted`).

### Step 8: Update the Screen Registry
**File:** `apps/tui/src/router/registry.ts`
**File:** `apps/tui/src/screens/Issues/index.ts`
- **Action:** Export the new screen and register it in the router.
- **Details:**
  - Export `IssueListScreen` from the `Issues/index.ts` file.
  - In `registry.ts`, import `IssueListScreen` and swap out the `PlaceholderScreen` mapped to `ScreenName.Issues`.

## Phase 4: Testing

### Step 9: Create Unit Tests
**File:** `e2e/tui/issues-search-unit.test.ts`
- **Action:** Test all pure utility functions from `search-filter.ts` and `search-types.ts`.
- **Details:**
  - Tests for `escapeRegex`, `filterIssuesClientSide`, `mergeSearchResults`, and `computeHighlightSegments`.
  - Ensure tests cover various edge cases (null body, regex characters in query).

### Step 10: Create End-to-End Tests
**File:** `e2e/tui/issues.test.ts`
- **Action:** Create TUI E2E tests using `@microsoft/tui-test`.
- **Details:**
  - Import `launchTUI` from `helpers.ts`.
  - Add snapshot tests mapping to different terminal sizes (minimum, standard, large).
  - Add keyboard interaction tests simulating keystrokes (`/`, typing query, `Escape`, `Enter`).
  - Ensure tests that hit currently unimplemented backend routes (e.g., API searching, base issue fetching) are correctly defined and **left failing** without `.skip()` per the repository guidelines.

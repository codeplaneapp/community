# Implementation Plan: TUI_WIKI_SEARCH

This document outlines the step-by-step implementation plan for the Wiki Search feature in the Codeplane TUI, ensuring alignment with the engineering specification and existing repository patterns.

## Phase 1: Shared Utilities and Hooks

### Step 1.1: Create `HighlightedText` Component
**File:** `apps/tui/src/components/HighlightedText.tsx`
- Create a reusable functional component (`React.memo`) that accepts `text` (string) and `query` (string) props.
- If `query` is empty, render the plain text inside an OpenTUI `<text>` component.
- If `query` is present, use a case-insensitive regular expression (`new RegExp(escapeRegExp(query), 'gi')`) to find matches.
- Split the text into an array of segments (matched and unmatched).
- Map over segments and render them within `<text>`. Apply `color="primary"` to segments that match the query.
- Ensure it supports truncation natively or interacts correctly with parent flex constraints.

### Step 1.2: Implement `useWikiPages` Data Fetching Hook
**File:** `apps/tui/src/hooks/useWikiPages.ts`
- Create a hook to manage fetching wiki pages using `useRepoFetch`.
- Accept `owner`, `repo`, and an options object containing `q` (query), `page`, and `per_page`.
- Utilize `AbortController` to cancel in-flight requests when the query changes.
- Fetch from `GET /api/repos/:owner/:repo/wiki?q=${encodeURIComponent(q)}&page=${page}&per_page=30`.
- If `q` is undefined or whitespace-only, omit the `q` parameter from the URL to fetch the unfiltered list.
- Extract and return `X-Total-Count` from the response headers alongside the parsed page items.
- Implement pagination state management (appending new pages to existing items, resetting to page 1 when `q` changes).
- Enforce the 500-item memory cap.

## Phase 2: Search Specific State and UI Components

### Step 2.1: Implement `useWikiSearch` Hook
**File:** `apps/tui/src/screens/Wiki/hooks/useWikiSearch.ts`
- Initialize `searchQuery` (string) for raw input state.
- Initialize `activeQuery` (string) for debounced/submitted query state.
- Initialize `isSearchFocused` (boolean) to control input focus.
- Implement a 120-character limit inside the `setSearchQuery` updater.
- Add a `useEffect` to synchronize `searchQuery` to `activeQuery` after a 300ms debounce (`setTimeout`).
- Return `clearTimeout` in the cleanup function to prevent memory leaks and cancel pending debounces on rapid typing.
- Expose `submitImmediate()` to bypass the debounce (set `activeQuery` immediately and clear timeout).
- Expose `clearSearch()` to reset both queries to `""`.

### Step 2.2: Implement `WikiSearchInput` Component
**File:** `apps/tui/src/screens/Wiki/components/WikiSearchInput.tsx`
- Build a responsive layout using OpenTUI's `<box flexDirection="row">`.
- Use `useTerminalDimensions` to calculate width: full width at < 120 cols, 70% at 120-199 cols, 60% at 200+ cols.
- Render a static prefix: `<text color="muted">/ </text>`.
- Render the OpenTUI `<input>` component bound to `searchQuery` and `setSearchQuery`.
- Add custom keyboard event handling (via `useKeyboard` scoped to the input or input's `onKeyPress` equivalent):
  - `Enter`: Call `submitImmediate()` and blur input.
  - `Esc`: If `searchQuery` is not empty, call `clearSearch()`. Otherwise, blur input.
  - `Ctrl+U`: Set `searchQuery` to `""` (maintain focus).
  - `Ctrl+W`: Regex-based deletion of the last word (maintain focus).
- Render the match count badge `<text>` to the right of the input based on `totalCount` and `isLoading` props. Use `warning` color (ANSI 178) for "No results". Hide the badge on small terminals if space is constrained.

### Step 2.3: Implement `WikiListRow` Component
**File:** `apps/tui/src/screens/Wiki/components/WikiListRow.tsx`
- Create a component to render individual wiki page rows.
- Accept `page` object, `isFocused` boolean, and `activeQuery` string.
- Use `HighlightedText` for the page title.
- Use `useTerminalDimensions` to conditionally render columns:
  - Minimum (< 120): Show Title + Timestamp.
  - Standard (120-199): Show Title (max 45ch) + Slug (max 25ch, with `HighlightedText`) + Author (max 12ch) + Timestamp (max 4ch).
  - Large (200+): Show Title (max 70ch) + Slug (max 35ch) + Author (max 15ch) + Timestamp.
- Apply reverse video or accent styling when `isFocused` is true.

## Phase 3: Screen Integration

### Step 3.1: Scaffold and Integrate `WikiListScreen`
**File:** `apps/tui/src/screens/Wiki/WikiListScreen.tsx`
- Mount `useWikiSearch` and `useWikiPages` hooks.
- Use `useScreenKeybindings` to register global screen shortcuts:
  - `/`: Call `focusSearchInput()` (only if not already focused).
  - `Esc`: Handle back navigation or clearing active search if the input is empty but a search was previously active.
- Update the Breadcrumb/Header logic to display "Wiki (N)" where N is the `totalCount` from the search response.
- Render the `WikiSearchInput` inside a persistent toolbar container below the header.
- Render the list of `WikiListRow` components inside a `<scrollbox>`.
- Handle pagination triggers when the scrollbox reaches 80% height.
- Render a fallback `<box>` with a centered `<text color="muted">No wiki pages match '{activeQuery}'</text>` when results are empty and not loading.

## Phase 4: Testing

### Step 4.1: Write E2E Tests
**File:** `e2e/tui/wiki.test.ts`
- Using `@microsoft/tui-test`, implement the comprehensive test suite defined in the spec.
- **Snapshot Tests:** Cover 80x24, 120x40, 200x60 dimensions for search input states, loading, error, and highlighted results.
- **Keyboard Interactions:** Simulate typing, debounce timing, `Enter`, `Esc`, `Ctrl+U`, `Ctrl+W`, and navigation within filtered results.
- **Responsive Tests:** Simulate terminal resizes and verify UI recalculations, visibility of columns, and text truncations.
- **Integration & Edge Cases:** Mock the API server to return `X-Total-Count`, specific ranked results, and test pagination limits (500 items).
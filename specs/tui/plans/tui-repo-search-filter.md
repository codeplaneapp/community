# Implementation Plan: `tui-repo-search-filter`

This document outlines the step-by-step implementation plan for the repository-scoped search and filter surface in the Codeplane TUI.

## Phase 1: Core Types and Configuration

### Step 1: Define Types and Constants
**File:** `apps/tui/src/screens/Repository/search/types.ts`
- Export generic types for `RepoSubScreen`, `FilterDimension`, `FilterValue`, `SearchFilterState`, `SearchError`, and `SubScreenSearchConfig`.
- Export layout and threshold constants: `SEARCH_MAX_LENGTH` (120), `SEARCH_DEBOUNCE_MS` (300), `SERVER_SEARCH_THRESHOLD` (200), and max width configurations for truncation.

### Step 2: Implement Static Filter Configurations
**File:** `apps/tui/src/screens/Repository/search/filter-config.ts`
- Create a registry or factory function returning a `SubScreenSearchConfig` for each tab (`issues`, `landings`, `bookmarks`, `changes`, `code`, `conflicts`, `operations`, `wiki`, `settings`).
- Configure `f` (state), `l` (label), `a` (assignee/reviewer), and `o` (sort) keys per the spec.
- Set `supportsServerSearch` based on the backend capabilities of each domain.

## Phase 2: State Management and Data Hooks

### Step 3: Extend `@codeplane/ui-core` Hooks
**Files:** 
- `specs/tui/packages/ui-core/src/hooks/useIssues.ts`
- `specs/tui/packages/ui-core/src/hooks/useLandings.ts`
- Extend the query options (`IssuesOptions`, `LandingsOptions`) to accept a `q` (string) parameter for text search and generic structured filters if missing.
- Ensure these parameters are passed correctly to the API client to support server-side text searches.

### Step 4: Implement Dynamic Filter Hook
**File:** `apps/tui/src/screens/Repository/search/useFilterConfig.ts`
- Build a custom hook that accepts `owner`, `repo`, and `subScreen`.
- Conditionally fetch `useRepoLabels` and `useRepoCollaborators` depending on the active `subScreen`.
- Merge the fetched dynamic data into the static `filter-config.ts` blueprint to return a fully hydrated `SubScreenSearchConfig`.

### Step 5: Build the Core Search Hook
**File:** `apps/tui/src/screens/Repository/search/useRepoSearchFilter.ts`
- Initialize internal state for `query`, `inputFocused`, `filters`, `sortIndex`, and `isSearching`.
- Implement a filtering strategy using the `SERVER_SEARCH_THRESHOLD` (200).
- **Client-side**: Use `useMemo` for synchronous filtering via the caller-provided `clientMatch` and `sortComparator` functions.
- **Server-side**: Use `useEffect` with `setTimeout` for 300ms debouncing, invoking `onServerSearch(params)` and managing an `AbortController` for stale requests.
- Export state setters: `setQuery`, `clearQuery`, `cycleFilter`, `cycleSort`, `setInputFocused`, and `resetFilters`.

## Phase 3: Telemetry & Keybindings

### Step 6: Telemetry Integration
**File:** `apps/tui/src/screens/Repository/search/telemetry.ts`
- Create semantic wrapper functions for search/filter telemetry events (e.g., `searchActivated`, `searchQueryChanged`, `filterStateChanged`).
- Wire these up to invoke the core `apps/tui/src/lib/telemetry.ts` exporter.

### Step 7: Search Keybindings Hook
**File:** `apps/tui/src/screens/Repository/search/useSearchKeybindings.ts`
- Consume `KeybindingContext` from `apps/tui/src/providers/` directly to manage multiple priorities.
- When `state.inputFocused` is `true`, register `MODAL` (priority 2) bindings for `Esc`, `Enter`, and `Ctrl+U`.
- When `state.inputFocused` is `false`, register `SCREEN` (priority 4) bindings for `/`, `f`, `l`, `a`, `o`, and `R`.
- Connect actions to update status bar hints using `StatusBarHintsContext`.

## Phase 4: UI Components

### Step 8: Inline Search Input
**File:** `apps/tui/src/screens/Repository/search/RepoSearchInput.tsx`
- Render `<box flexDirection="row">` with OpenTUI's `<input>`, passing `focused={state.inputFocused}` and wiring `onInput` / `onSubmit`.
- Render match counts (e.g., "3 of 42"), formatting `>9999` as `10k+`.
- Add visibility logic (return `null` if total repo item count is `0`).

### Step 9: Responsive Filter Toolbar
**File:** `apps/tui/src/screens/Repository/search/FilterToolbar.tsx`
- Use `useLayout()` to read the current layout breakpoint (`minimum`, `standard`, `large`).
- Implement responsive rendering for active filters:
  - Minimum: `[open] [alice]` (wrap enabled via `<box flexWrap="wrap">`).
  - Standard: `State: Open │ Assignee: alice`.
  - Large: `State: Open (15) │ Assignee: alice (3)`.
- Utilize `truncateText` to ensure labels and badges don't break flex layouts.

### Step 10: Empty and Error States
**File:** `apps/tui/src/screens/Repository/search/FilterEmptyState.tsx`
- Handle missing results vs. API failures.
- Map `searchError` to corresponding user-visible `<text>` items in `theme.error` color, providing appropriate actionable hints (`Press R to retry` or `codeplane auth login`).

### Step 11: Composition Container & Export
**File:** `apps/tui/src/screens/Repository/search/RepoSearchFilterContainer.tsx`
- Assemble `RepoSearchInput`, `FilterToolbar`, `FilterEmptyState`, and `{children}`.
- Provide the wrapper implementation so each tab file stays clean.
**File:** `apps/tui/src/screens/Repository/search/index.ts`
- Re-export hooks, types, and the main container.

## Phase 5: Screen Integration

### Step 12: Embed in Repository Sub-screens
**Files:** `apps/tui/src/screens/Repository/tabs/*.tsx` (e.g., `IssuesTab.tsx`, `LandingsTab.tsx`)
- Wrap the list content of each tab inside `<RepoSearchFilterContainer>`.
- Pass the relevant `clientMatch` functions.
- Map the `filteredItems` to the respective `<ScrollableList>` or tree components.

## Phase 6: E2E Testing

### Step 13: End-to-End Test Scenarios
**File:** `e2e/tui/repository.test.ts`
- Add the `TUI_REPO_SEARCH_FILTER` describe block.
- Implement terminal snapshot tests verifying visuals at 120x40, 80x24, and 200x60 dimensions.
- Implement keyboard interaction tests (`/` focus, `Esc` clear, `Enter` commit, `f/l/a/o` cycles).
- Implement server/client filtering integration assertions, including debouncing simulation, cancellation on navigation, and auth/rate-limit error propagations.
- Run tests against the mock `@microsoft/tui-test` to ensure output precisely matches expected constraints (e.g. tests that fail due to missing backends should run and legitimately fail per spec).
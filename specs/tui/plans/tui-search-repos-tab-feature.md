# Implementation Plan: TUI_SEARCH_REPOS_TAB

This plan details the implementation of the Repositories tab within the TUI Search screen. Note that this plan assumes prerequisite tickets (`tui-list-component`, `tui-search-screen-feature`, and `tui-search-data-hooks`) have been merged. If they are not present at implementation time, stubs must be provided.

## Step 1: Implement Telemetry Events
**File:** `apps/tui/src/lib/telemetry/searchEvents.ts`
**Action:** Create the telemetry definitions for the search flow.
- Import the core telemetry `emit` function from `apps/tui/src/lib/telemetry.ts` (create a stub if it doesn't exist yet).
- Export a `trackSearchEvent` function that accepts strongly-typed event names and properties.
- Define the 11 business events: `search.query_submitted`, `search.repos_tab_viewed`, `search.result_clicked`, `search.pagination_triggered`, `search.query_cleared`, `search.tab_switched`, `search.zero_results`, `search.error_displayed`, `search.retry_triggered`, `search.debounce_cancelled`, `search.session_duration`.
- Include type definitions for the properties: `query`, `tab`, `timestamp`, `repo_id`, `position`, `error_type`, `page`.

## Step 2: Implement String Utilities
**File:** `apps/tui/src/utils/string.ts`
**Action:** Create string manipulation utilities for terminal display constraints.
- Implement `truncateMiddle(str: string, maxLength: number): string` to handle long repository names (e.g., returning `owner/very-long-repo-n...`).
- Implement `truncateEnd(str: string, maxLength: number): string` for repository descriptions.
- Add a helper to escape/decode HTML entities returned by the API so they render safely in the terminal.

## Step 3: Create `RepoResultRow` Component
**File:** `apps/tui/src/screens/search/components/RepoResultRow.tsx`
**Action:** Create the responsive row component for repository search results.
- Import `<box>` and `<text>` from OpenTUI.
- Import `useTerminalDimensions` and `useTheme` hooks.
- Define `RepoResultRowProps` with `repo` data, `focused` (boolean), and `index`.
- Implement responsive rendering logic based on terminal breakpoints:
  - **Minimum (80x24):** Render `owner/name` (truncated to 40 chars) and `stars`. Hide description and language.
  - **Standard (120x40):** Render `owner/name` (truncated to 50 chars), `description` (truncated dynamically), `language`, `stars`, and `updatedAt`.
  - **Large (200x60):** Allocate more flex space to the `description` column (up to 120 chars).
- Style the row with reverse video or the theme's `primary` background when `focused` is true.

## Step 4: Create `RepoResultsList` Component
**File:** `apps/tui/src/screens/search/components/RepoResultsList.tsx`
**Action:** Create the paginated and navigable list component.
- Import `ScrollableList` (from `apps/tui/src/components/ScrollableList.tsx`).
- Import `useSearch` hook (from `@codeplane/ui-core` or stub it if missing).
- Import `trackSearchEvent` and navigation hooks.
- Define props accepting `query: string`.
- Implement a 300ms debounce on the `query` prop. Invoke `useSearch(debouncedQuery, { type: 'repositories', limit: 30 })`.
- **Empty State:** If `!isLoading` and `results.length === 0`, render a helpful message inside a `<box>` and emit `search.zero_results`.
- **Error State:** Handle API errors (timeout, 401, 429, 500), render an inline error with a "Press R to retry" prompt, and emit `search.error_displayed`.
- **Pagination:** Pass `fetchNextPage` from the hook to the list's `onFetchMore`. Cap at 300 results. Emit `search.pagination_triggered`.
- **Action:** On item selection (`Enter`), push the `RepoOverview` screen with the item's `owner` and `repo` parameters, and emit `search.result_clicked`.

## Step 5: Integrate into `SearchScreen` Shell
**File:** `apps/tui/src/screens/search/SearchScreen.tsx`
**Action:** Modify the existing search screen shell to wire up the Repositories tab.
- Import `RepoResultsList`.
- Manage the active tab state (`activeTab === 'repos'`). Emit `search.tab_switched` on changes.
- Manage the search `query` state via an `<input>` component with `onChange={setQuery}`.
- Render `<RepoResultsList query={query} />` when the Repos tab is active.
- Ensure keyboard bindings:
  - `/` focuses the search `<input>`.
  - `Esc` blurs or clears the input.
  - `q` pops the navigation stack, ensuring the query state is preserved if navigated back.

## Step 6: Implement End-to-End Tests
**File:** `e2e/tui/search.test.ts`
**Action:** Initialize and write the test suite using `@microsoft/tui-test` covering all 83 test cases outlined in the spec.
- **Snapshot Tests (19 tests):** Validate empty state, single/multiple results, loading states, pagination indicators, truncation across all three breakpoints (80x24, 120x40, 200x60), and layout rendering (badges, times).
- **Keyboard Tests (33 tests):** Verify vim-style navigation (`j`, `k`, `G`, `gg`), pagination (`Ctrl+D`, `Ctrl+U`), tab switching, input focus (`/`, `Esc`), and navigation stack popping (`q`).
- **Responsive Tests (15 tests):** Verify column hiding and dynamic width calculations upon `SIGWINCH` resize events, specifically testing the 80x24 constraint boundary.
- **Integration Tests (16 tests):** Mock the API to verify `useSearch` calls with correct parameters, test the 300ms debounce, verify error retry behavior (`R` key), 300 item cap limit handling, and SSE stream resilience during search operations.
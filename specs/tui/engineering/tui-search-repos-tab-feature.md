# Engineering Specification: TUI_SEARCH_REPOS_TAB

## Overview
This specification details the implementation of the Repositories tab within the TUI Search screen. It introduces a responsive, paginated, and keyboard-driven list of repository search results populated from the `@codeplane/ui-core` `useSearch` hook. It handles responsive layouts across three distinct terminal breakpoints, implements strict vim-style keyboard navigation (`j`/`k`, `Enter`, `G`, `gg`, etc.), and integrates comprehensive telemetry and observability according to the product requirements.

## Implementation Plan

### 1. Telemetry and Analytics Definitions
**File**: `apps/tui/src/lib/telemetry/searchEvents.ts` (Create or update)
Define the strongly-typed telemetry events for the search flow.
*   **Changes**:
    *   Export `trackSearchEvent` with the 11 business events: `search.query_submitted`, `search.repos_tab_viewed`, `search.result_clicked`, `search.pagination_triggered`, `search.query_cleared`, `search.tab_switched`, `search.zero_results`, `search.error_displayed`, `search.retry_triggered`, `search.debounce_cancelled`, `search.session_duration`.
    *   Include properties: `query`, `tab`, `timestamp`, `repo_id`, `position`, `error_type`, `page`.

### 2. Component: RepoResultRow
**File**: `apps/tui/src/screens/search/components/RepoResultRow.tsx` (New)
Creates the responsive row component for repository search results.
*   **Changes**:
    *   Import OpenTUI components (`<box>`, `<text>`) and the `useLayout`, `useTheme` hooks.
    *   Define `RepoResultRowProps` including `repo`, `focused` (boolean), `index`.
    *   Implement breakpoint-specific rendering:
        *   **Minimum (80x24)**: Render `owner/name` (truncated to 40 characters) and `stars` (with `★` symbol). Hide description and language.
        *   **Standard (120x40)**: Render `owner/name` (truncated to 50 characters), `description` (truncated to remaining space minus fixed columns), `language` (colored text), `stars`, and `updatedAt` (relative time).
        *   **Large (200x60)**: Same as Standard but allocate more flex space to the `description` column, allowing up to 120 characters before truncation.
    *   Apply reverse video (or theme's `primary` background) when `focused === true`.

### 3. Component: RepoResultsList
**File**: `apps/tui/src/screens/search/components/RepoResultsList.tsx` (New)
Creates the paginated, navigable list component.
*   **Changes**:
    *   Import `ScrollableList` from `apps/tui/src/components/ScrollableList.tsx`.
    *   Import `useSearch` from `@codeplane/ui-core`.
    *   Import `useNavigation` and `useTelemetry` hooks.
    *   Define props: `query: string`.
    *   Implement `useSearch(query, { type: 'repositories', limit: 30 })` hook to fetch data. Ensure a 300ms debounce on the `query` prop before invoking the hook.
    *   Handle zero-results state: If `!isLoading` and `results.length === 0`, render an empty state `<box>` with a helpful message. Emit `search.zero_results` telemetry event.
    *   Implement pagination: Attach `onFetchMore` to `fetchNextPage()` from `useSearch`. Cap total results at 300 by checking `if (results.length >= 300) return`. Emit `search.pagination_triggered`.
    *   Implement `onSelect`: Trigger `navigation.push('RepoOverview', { owner: item.owner, repo: item.name })`. Emit `search.result_clicked`.
    *   Handle error states (timeout, 401, 429, 500) mapped to `search.error_displayed` telemetry. Show an inline error with an "R to retry" prompt using `refetch()`.

### 4. Integration: SearchScreen Updates
**File**: `apps/tui/src/screens/search/SearchScreen.tsx` (Modify)
Integrate the repos tab into the main search screen shell (assumes shell exists from `tui-search-screen-feature`).
*   **Changes**:
    *   Import `RepoResultsList`.
    *   Manage tab state (`activeTab === 'repos'`). Emit `search.tab_switched` when toggling.
    *   Manage `query` state via `<input>` element with `onChange={setQuery}`. 
    *   Render `<RepoResultsList query={debouncedQuery} />` when the Repos tab is active.
    *   Ensure the `q` keybinding pops the navigation stack (`navigation.pop()`), while preserving the query in a local component state or URL parameter to allow persistence across back-navigation.
    *   Implement the `/` keybinding to focus the search `<input>`, and `Esc` to blur/clear.

### 5. Utilities: Text Truncation and Formatting
**File**: `apps/tui/src/utils/string.ts` (Modify)
*   **Changes**:
    *   Add or update a `truncateMiddle(str: string, maxLength: number)` function for repository names (e.g., `owner/very-long-repo-n...`).
    *   Add `truncateEnd(str: string, maxLength: number)` for descriptions.
    *   Ensure HTML entities returned by the API are escaped/decoded safely for the terminal.

## Unit & Integration Tests

**File**: `e2e/tui/search.test.ts`
Implement the 83 tests defined in the Verification section using `@microsoft/tui-test`.

### Snapshot Tests (19 tests)
*   `renders empty state when query is blank`
*   `renders single result correctly`
*   `renders multiple results in list format`
*   `renders zero results state with helpful message`
*   `renders inline error state with retry prompt`
*   `renders loading spinner during initial fetch`
*   `renders 'Loading more...' pagination indicator at bottom`
*   `highlights focused row with reverse video`
*   `truncates repo name correctly at 80x24 (minimum breakpoint)`
*   `truncates repo name correctly at 120x40 (standard breakpoint)`
*   `renders extended descriptions at 200x60 (large breakpoint)`
*   `renders tab bar active state for Repositories`
*   `renders search input with active query text`
*   `renders status bar keybinding hints for search screen`
*   `adjusts modal overlay interaction within search context`
*   `renders header breadcrumb showing 'Search'`
*   `escapes and renders special characters in results correctly`
*   `renders starred repo indicator correctly`
*   `renders language color badge based on repo language`
*   `renders updated-at relative time format correctly`

### Keyboard Tests (33 tests)
*   `j and Down arrow move focus down the result list`
*   `k and Up arrow move focus up the result list`
*   `Enter on a selected row opens RepoOverview`
*   `G jumps to the bottom of the loaded results list`
*   `gg jumps to the top of the results list`
*   `Ctrl+D pages down half a viewport height`
*   `Ctrl+U pages up half a viewport height`
*   `/ focuses the search input`
*   `Esc clears the search input when focused`
*   `Tab cycles focus forward between input and tab bar`
*   `Shift+Tab cycles focus backward between tab bar and input`
*   `Number keys (1-9) jump to respective search tabs`
*   `q pops the navigation stack to go back`
*   `: opens the command palette`
*   `? opens the help overlay with search keybindings`
*   `Space is a no-op in the repository search list`
*   `typing in query input triggers debounce timer`
*   `backspace removes characters and updates query state`
*   `Enter while focused in input immediately submits search`
*   `Left/Right arrow keys in input move text cursor`
*   `Ctrl+C quits the TUI from the search screen`
*   *(...and 12 more standard navigation/input permutations to complete the 33 keyboard tests).*

### Responsive Tests (15 tests)
*   `hides description and language columns at 80x24`
*   `shows all metadata columns at 120x40`
*   `expands description width dynamically at 200x60`
*   `collapses sidebar and adjusts search layout at 80x24`
*   `dynamically adjusts truncation lengths on SIGWINCH resize`
*   `adjusts search modal width constraint at minimum size`
*   `truncates header breadcrumb path at minimum size`
*   `limits status bar keybinding hints at minimum size`
*   *(...and 7 additional structural boundary tests mapping to window resizes).*

### Integration Tests (16 tests)
*   `calls GET /api/search/repositories with correct query and type parameters`
*   `fetches next page with cursor when scrolling past 80% threshold`
*   `re-triggers API call on R keypress when in error state`
*   `includes CLI auth token in search API requests`
*   `cancels and restarts 300ms debounce timer on rapid typing`
*   `preserves tab selection and scroll position when navigating back from RepoOverview`
*   `cancels concurrent in-flight queries when a new query is typed`
*   `bypasses API call and shows empty prompt if query is empty`
*   `clears results list and shows new results on query change`
*   `pushes RepoOverview to navigation stack on Enter keypress`
*   `displays non-blocking loading indicator during cursor pagination fetch`
*   `returns cached result instantaneously for identical repeated queries`
*   `reconnects SSE notification stream seamlessly if dropped during active search`
*   `displays rate limit backoff timer when receiving 429 response`
*   `url-encodes special characters in query string correctly`
*   `stops paginating when reaching the 300 item cap limit`

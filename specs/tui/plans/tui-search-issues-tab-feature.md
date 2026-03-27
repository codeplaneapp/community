# Implementation Plan: TUI_SEARCH_ISSUES_TAB

## 1. Overview
This implementation plan details the necessary steps to build the `TUI_SEARCH_ISSUES_TAB` feature in the Codeplane TUI. It involves defining types, building the search data hook integration, creating responsive UI components using OpenTUI, wiring up keyboard navigation, and adding E2E tests.

## 2. Step-by-Step Implementation

### Step 1: Define Types for Issue Search
**File**: `apps/tui/src/hooks/useSearchTabs.types.ts` (Create or update)
- Define the `IssueStateFilter` type: `'all' | 'open' | 'closed'`.
- Define the `IssueSearchResult` interface containing:
  - `id: string`
  - `number: number`
  - `title: string`
  - `state: 'open' | 'closed'`
  - `repository: { owner: string; name: string }`
  - `createdAt: string`
- Export these types for use in hooks and components.

### Step 2: Update Search Hooks
**File**: `apps/tui/src/hooks/useSearchTabs.ts` (Create or update)
- Integrate `@codeplane/ui-core`'s `useSearch()` to fetch `searchIssues`.
- Add local state for `issueStateFilter` (default: `'all'`).
- Implement a function to cycle the filter state (`'all'` -> `'open'` -> `'closed'` -> `'all'`).
- Expose `{ searchIssues: { data, loading, error, loadMore }, issueStateFilter, cycleIssueStateFilter }` from the hook.

### Step 3: Create Responsive Issue Row Component
**File**: `apps/tui/src/screens/search/IssueSearchRow.tsx` (Create)
- Create a component that receives props: `issue: IssueSearchResult`, `isFocused: boolean`, `terminalWidth: number`.
- Implement conditional layout based on `terminalWidth`:
  - **Minimum (< 120)**: Show `#number`, truncated `title`, and state icon (green `●` or red `○`). Hide repository context and timestamp.
  - **Standard (120 - 199)**: Show `owner/repo`, `#number`, `title`, state badge, and `timestamp`.
  - **Large (>= 200)**: Show expanded format without aggressive title truncation.
- Apply styling: reverse video background when `isFocused` is true, blue for issue number, green/red for state, muted gray for repository/timestamp.

### Step 4: Create the Issues Tab Component
**File**: `apps/tui/src/screens/search/SearchIssuesTab.tsx` (Create)
- Consume `useSearchTabs()` to get issue data, loading/error states, and filter functions.
- Implement keyboard navigation using OpenTUI's `useKeyboard` (only active when this tab is visible):
  - `j` / `k` / `Down` / `Up`: Move focus index up/down.
  - `Enter`: Use `useNavigation().push(ScreenName.IssueDetail, { owner, repo, number })` to open the focused issue.
  - `g g` / `G`: Jump focus to top/bottom of the list.
  - `Ctrl+U` / `Ctrl+D`: Page up/down (adjust focus index by ~10).
  - `o`: Call `cycleIssueStateFilter()`.
  - `R`: Retry if in error state.
- Track telemetry using internal analytics utilities, dispatching:
  - `tui.search.issues_tab.viewed` on mount.
  - `tui.search.issues_tab.filter_changed` when `o` is pressed.
  - `tui.search.issues_tab.result_opened` on `Enter`.
  - `tui.search.issues_tab.error` / `retry` / `zero_results` as appropriate.
- Render a `<box flexDirection="column">` containing:
  - Optional: Filter indicator bar (visible if width >= 120).
  - A `<scrollbox onScrollEnd={loadMore}>` rendering the list of `IssueSearchRow` components.
  - Loading/Error indicators as fallback views.

### Step 5: Integrate into the Main Search Screen
**File**: `apps/tui/src/screens/search/SearchScreen.tsx` (Update)
- Ensure the global search input (`/` to focus) remains functional.
- Verify the tab header correctly displays the `Issues` tab at index 1.
- Conditionally render `<SearchIssuesTab />` when the active tab index corresponds to Issues.
- Ensure `q` correctly pops the screen from the navigation stack without losing the internal state if returning later.

### Step 6: Add E2E Tests
**File**: `e2e/tui/search.test.ts` (Update)
- Add a test suite for the Issues Search Tab:
  - **Navigation**: Verify pressing `2` or `Tab` switches to the Issues tab.
  - **Rendering**: Snapshot test the tab layout at `minimum` and `standard` terminal sizes.
  - **Filtering**: Simulate pressing `o` and assert that the API is re-queried and the visual filter indicator updates.
  - **Pagination**: Simulate scrolling to the end of the list and verify the `loadMore` action is triggered.
  - **Interaction**: Simulate `j`/`k` to focus an item, press `Enter`, and assert that the screen transitions to the Issue Detail view.
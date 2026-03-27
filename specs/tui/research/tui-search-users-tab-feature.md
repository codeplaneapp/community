# Research: `tui-search-users-tab-feature` (TUI_SEARCH_USERS_TAB)

## 1. Ticket Overview
**Ticket ID**: `tui-search-users-tab-feature`
**Feature**: `TUI_SEARCH_USERS_TAB` (User discovery search results tab)
**Description**: Implement the Users tab (tab 3) on the search screen. Render user results from `GET /api/search/users` using `UserResultRow`. Handle `j`/`k` navigation, `Enter` pushes the user profile, `q` returns with state preserved. Includes pagination at 80% (30/page, 300 cap). Does not support inline filters. Handles zero results properly. Implements per-tab state preservation and all tests from the spec.

## 2. Directory & Files Context
Currently, `apps/tui/src/screens/Search` does not exist in the repository, implying that the foundational search scaffold (`tui-search-screen-scaffold`) either precedes this or must be built alongside it. The relevant files to be created/updated for this specific ticket are:
- `apps/tui/src/screens/Search/results/UserResultRow.tsx` (New)
- `apps/tui/src/screens/Search/tabs/UsersTab.tsx` (New)
- `e2e/tui/search.test.ts` (New/Update)

## 3. UI and Display Specifications
Based on `specs/tui/TUI_SEARCH_USERS_TAB.md`, the TUI has the following rendering constraints for this tab:
- **Component Structure**: `UserResultRow` renders as a single line with the `username` in `primary` color (ANSI 33) and the `display_name` (if present) in `muted` color (ANSI 245) wrapped in parentheses.
- **Empty States**: If no results match, the content area displays `No users match '{query}'.` along with `Try a different query or check spelling.`
- **Loading States**: During pagination, `Loading more…` is appended to the bottom. During initial search, `Searching…` is displayed.
- **Error States**: Display `Search error. Press R to retry.` or `Rate limited. Retry in {N}s.` based on API response.
- **Focus**: The focused row is highlighted with reverse video (`attributes={REVERSE}` in OpenTUI). Prefix focused items with `► ` and unfocused with `  `.

## 4. API & Data Layer
- **Endpoint**: `GET /api/search/users` with parameters `q` (required), `page` (default 1), `per_page` (default 30).
- **Hooks**: Consumes `useSearch()` from `@codeplane/ui-core` which should return `{ searchUsers, data: UserSearchResultPage, loading, error, loadMore }`.
- **Pagination Rule**: Paginates when scrolling past 80% of loaded content. Hard cap of 300 items (10 pages) loaded.
- **Count Badge**: Shows the server's `total_count` (abbreviated if > 9999 as `10k+`), not just the loaded item count.

## 5. Keyboard Interactions
The following keybindings are specific to the Users tab:
- `3`: Switch to Users tab from the results list.
- `Tab` / `Shift+Tab`: Tab cycling.
- `j` / `k` (or `Down` / `Up`): Move cursor down/up.
- `Enter`: Navigate to the user profile screen via `push({ screen: "user-profile", params: { username: user.username } })`.
- `G` / `g g`: Jump to bottom/top of the list.
- `Ctrl+D` / `Ctrl+U`: Page down/up.
- `/`: Return focus to search input.
- `Esc` / `q`: Pop search screen.
- `R`: Retry failed request.

## 6. Responsive Behavior
- **80x24 (minimum)**: Tab label `Users(N)`. Result rows show username only (up to 76 chars to fit row), no display name.
- **120x40 (standard) to 200x60 (large)**: Tab label `Users (N)`. Result rows show `username` (max 20 chars) and `display_name` (max 30 chars). Truncate excess with `…`.

## 7. Testing Requirements
Tests should be written in `e2e/tui/search.test.ts` utilizing `@microsoft/tui-test`. Coverage required for:
- Snapshot tests (`SNAP-USERS-001` through `014`) for minimum, standard, and large screens.
- Keyboard interaction tests (`KEY-USERS-001` through `024`).
- Responsive tests (`RESIZE-USERS-001` through `010`).
- Integration tests covering API limits, pagination caps, auto-selection, error recovery, and query debounce.
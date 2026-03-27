# TUI_SEARCH_USERS_TAB

**Title**: User discovery search results tab
**Type**: feature
**Dependencies**: tui-search-screen-feature

## High-Level User POV

When using the Codeplane TUI to search, the Users tab (tab 3) provides a fast, keyboard-driven way to discover other users in the system. After entering a search query on the main search screen, users can navigate to the Users tab to see a list of accounts matching their query.

The results are rendered as a clean list of user profiles. Users can quickly scroll through the results using standard `j`/`k` (or arrow keys) navigation. When a specific user is highlighted, pressing `Enter` immediately pushes that user's profile view onto the TUI stack. Pressing `q` or `Esc` from the profile view returns the user to the exact same position in the search results, preserving their search query, the active tab, and the cursor position.

Since user discovery is straightforward, there are no complex inline filters to manage; pressing `f` (the standard filter shortcut) is a no-op on this tab. If a query matches many users, the list automatically paginates as the user scrolls down, loading more results seamlessly up to a reasonable cap. If no users match the query, a clear "No users match query" message is displayed instead of an empty list.

## Acceptance Criteria

- **Tab Integration**: The Users tab must be accessible as the third tab on the main search screen.
- **Data Fetching**: Results must be fetched from the `GET /api/search/users` endpoint.
- **Rendering**: Results must be rendered using a `UserResultRow` component (or equivalent TUI representation), displaying relevant user information (e.g., username, display name).
- **Navigation**:
  - `j` or `Down Arrow` moves the selection down the list.
  - `k` or `Up Arrow` moves the selection up the list.
- **Actions**:
  - Pressing `Enter` on a selected user must push the user profile view to the screen stack.
  - Pressing `q` or `Esc` from the pushed user profile view must return to the search screen with the Users tab active, the search query preserved, and the list cursor at the same position.
- **Filtering**: Inline filtering must be disabled for this tab. Pressing `f` must be a no-op.
- **Pagination**:
  - The UI must fetch 30 results per page.
  - Pagination must trigger automatically when the cursor reaches 80% of the currently loaded list length.
  - A maximum of 300 results (10 pages) can be loaded.
- **Empty State**: When the API returns 0 results for a query, the tab must display exactly: "No users match query".
- **State Preservation**: The tab's internal state (loaded results, pagination offset, cursor position) must be preserved when switching to other tabs (e.g., Repositories or Issues) and switching back, as well as when pushing/popping views.

## Implementation Plan

1. **State Management**:
   - Extend the search screen state to include a dedicated state object for the Users tab.
   - This state should track: `items` (array of user results), `totalCount` (from API), `page` (current page number), `cursor` (selected index in the list), `isLoading`, and `error`.
2. **Data Fetching Logic**:
   - Implement a fetch method for the Users tab that calls `GET /api/search/users?q=<query>&page=<page>&per_page=30`.
   - Handle appending new items to the `items` array on subsequent page loads.
   - Enforce the 300 item cap (if `items.length >= 300`, do not fetch more).
3. **Rendering the Tab Content**:
   - Create or utilize a `UserResultRow` component for rendering individual list items.
   - If `items.length === 0` and not loading, render the centered text "No users match query".
   - If `items` exist, render a selectable list (e.g., using `ink` or the chosen TUI framework's list component).
4. **Input Handling**:
   - Bind `j`/`k` (and arrows) to update the `cursor` state and scroll the view.
   - Bind `Enter` to dispatch a navigation event (e.g., `navigation.push({ type: 'UserProfile', username: items[cursor].username })`).
   - Ensure the `f` key event is intercepted and ignored when the Users tab is active.
5. **Pagination Logic**:
   - Inside the input handler for `j`/`Down`, check if the new cursor position is `>= Math.floor(items.length * 0.8)`.
   - If true, and not currently loading, and `items.length < Math.min(totalCount, 300)`, trigger the fetch method for `page + 1`.
6. **State Preservation**:
   - Ensure that the parent search screen retains the Users tab state in memory rather than unmounting/destroying it when the active tab changes or when a new view is pushed over the search screen.

## Unit & Integration Tests

| Test Name | Description |
|-----------|-------------|
| `renders user results correctly` | Mock `GET /api/search/users` to return a list of users. Mount the search screen, switch to tab 3, and verify that the `UserResultRow` components are rendered with correct data. |
| `displays empty state when no users match` | Mock the API to return 0 results. Verify that the text "No users match query" is displayed. |
| `navigates list with j and k keys` | Mock a response with multiple users. Send `j` key events and verify the selection moves down. Send `k` key events and verify the selection moves up. |
| `pushes user profile on Enter` | Select a user and send an `Enter` key event. Verify that the navigation stack is updated to push the user profile view for the selected user. |
| `preserves state when popping back from profile` | Push a user profile, then simulate a `q` key event to pop the view. Verify the search screen is visible, the Users tab is active, and the cursor is on the previously selected user. |
| `f key is a no-op` | With the Users tab active, send an `f` key event. Verify that no filter UI is opened and no state changes occur. |
| `paginates at 80 percent scroll depth` | Mock the API to return 30 items initially with a total count of 100. Send `j` key events to move the cursor to index 24 (80% of 30). Verify a new API call is made for page 2. |
| `respects pagination cap of 300 items` | Mock the state to have 300 loaded items. Move the cursor past the 80% mark. Verify no additional API calls are made. |
| `preserves tab state across tab switches` | Load users in the Users tab, move the cursor to index 5. Switch to the Issues tab, then switch back to the Users tab. Verify the cursor is still at index 5 and no new initial API call is made for the same query. |

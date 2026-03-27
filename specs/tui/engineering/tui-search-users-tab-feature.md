# Engineering Specification: TUI_SEARCH_USERS_TAB

## Overview
This specification details the implementation of the Users tab for the global search screen in the Codeplane TUI. The Users tab allows terminal users to search for Codeplane users across the instance, view results in a responsive list, and navigate to user profiles. It is built strictly for terminal-native, keyboard-driven workflows using the OpenTUI framework.

## Implementation Plan

### 1. Create `UserResultRow` Component
**File:** `apps/tui/src/screens/search/components/UserResultRow.tsx`
- **Purpose:** A sub-component rendering a single line result for a user.
- **Props:** `user` (`UserSearchResult`), `focused` (`boolean`), and `breakpoint` (`"minimum" | "standard" | "large"`).
- **Truncation Logic:** 
  - **Minimum Breakpoint (<120 cols):** Render username only. Dynamically truncate it up to 76 characters (terminal width minus 4 chars for side padding).
  - **Standard/Large Breakpoints (≥120 cols):** Render username (max 20 chars, truncated with `…`) and `display_name` in muted parentheses (max 30 chars, truncated with `…`). If `display_name` is absent, do not render empty parentheses.
- **Styling & Interaction:** 
  - Prefix the row with `► ` if `focused` is true, otherwise `  ` (two spaces).
  - Use `REVERSE` video attribute for the focused row container.
  - Username text is colored using `theme.primary`, display name using `theme.muted`.

### 2. Implement `UsersTabContent` Component
**File:** `apps/tui/src/screens/search/components/UsersTabContent.tsx`
- **Purpose:** Render the main scrollable list of users and handle pagination and interaction.
- **Data Hook:** Consume the `useSearch` hook (`@codeplane/ui-core`) grabbing `userResults`, `usersLoading`, `usersError`, `usersLoadingMore`, and `loadMoreUsers`.
- **List & Focus State:** Use an OpenTUI `<scrollbox>` (or the common `<ScrollableList>` if extensible enough) and maintain a localized `focusedIndex`.
- **Keyboard Navigation:** Register the following via `useScreenKeybindings`:
  - `j`/`Down`, `k`/`Up`: Move `focusedIndex` within bounds.
  - `Enter`: Navigate to the profile via `push({ screen: 'user-profile', params: { username: user.username } })`.
  - `g g` / `G`: Jump to the first/last loaded user.
  - `Ctrl+D` / `Ctrl+U`: Page down/up by half the visible viewport height.
  - `q` / `Esc`: Pop the search screen off the navigation stack.
  - `R`: Trigger retry when `usersError` is active.
- **State Handling (Empty / Error / Loading):**
  - **Loading:** Centered `Searching…` in `muted` text.
  - **Error:** Centered `Search error. Press R to retry.` (or rate-limit equivalent) in `error` text.
  - **Empty Results:** If query > 0 and no users match, center `No users match '{query}'.`
- **Pagination:** Wire `onScrollEnd` from the `<scrollbox>` to `loadMoreUsers()`. Track loaded count and disable further loads when `userResults.length >= 300` or `userResults.length >= total_count`. Render `Loading more…` at the bottom of the list when fetching.

### 3. Update `SearchScreen` and Tab Bar
**File:** `apps/tui/src/screens/search/SearchScreen.tsx`
- **Tab Integration:** Add `'users'` to the `activeTab` states, positioned as the 3rd tab.
- **Keybindings:** Add `'3'` as a key binding (when input is unfocused) to switch to the Users tab. Update `Tab` and `Shift+Tab` to correctly cycle over this tab.
- **State Preservation:** Add `users` specific state keys to `tabScrollPositions` and `tabFocusedIndices` so returning from a user profile retains exact scroll position and cursor location.
- **Header Formatting:** Display the tab count using `total_count`. Format the tab label conditionally based on layout breakpoint (e.g., `Users(N)` at minimum, `Users (N)` at standard+). Format large numbers natively (e.g. `10k+`).

### 4. Validate Data Layer Requirements
**File:** `packages/ui-core/src/hooks/useSearch.ts`
- Ensure `useSearch` correctly processes `GET /api/search/users` in parallel with other search fetches, respecting the 300ms debounce.
- Ensure the API response correctly returns `items` arrays, `total_count`, `page`, and `per_page` for TUI consumption.

## Unit & Integration Tests

All tests should target `e2e/tui/search.test.ts` utilizing `@microsoft/tui-test`. 

### 1. Terminal Snapshot Tests
- **SNAP-USERS-001:** Launch at 120x40. Search "alice" → `3` → Wait. Assert Standard label format `Users (3)`, standard row content (username + display name), and focus indicator.
- **SNAP-USERS-002:** Launch at 80x24. Search "alice" → `3` → Wait. Assert Minimum label format `Users(3)` and single-line username row content (no display name).
- **SNAP-USERS-004:** Test a 0-result query "xyznonexistent". Assert tab shows `(0)` and the content reads `No users match 'xyznonexistent'.`
- **SNAP-USERS-007/008:** Force an API failure (500 or 429). Assert the appropriate inline retry message and error states format correctly.

### 2. Keyboard Interaction Tests
- **KEY-USERS-001 to 005:** Verify pressing `3` shifts to the Users tab, and `Tab`/`Shift+Tab` cycle correctly.
- **KEY-USERS-006 to 013:** Emulate `j`/`k`, `g g`, `G`, `Ctrl+D`, `Ctrl+U` to verify the internal `focusedIndex` updates correctly. Validate list bounds limits.
- **KEY-USERS-008 to 009:** Ensure that hitting `Enter` on a focused user correctly pushes `user-profile` on the stack, and hitting `q` returns gracefully, preserving active tab and scroll position.

### 3. Responsive Edge-case Tests
- **RESIZE-USERS-004 & 005:** Load 120x40 standard view, then invoke `terminal.resize(80, 24)`. Assert that the UI hides the `display_name` parameter dynamically. Resize back to verify parameter reappearance.

### 4. Integration & E2E Validation
- **INT-USERS-006 & 007:** Dispatch a broad query. Scroll down to the 80% mark, triggering pagination. Assert "Loading more..." flashes, and items increment by 30. Verify the 300 maximum item cap halts subsequent pages.
- **INT-USERS-018:** Validate that rapid keystrokes trigger request debouncing and properly abort in-flight user search calls, preventing stale results mapping.
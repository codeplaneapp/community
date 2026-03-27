# Implementation Plan: TUI Search Users Tab (TUI_SEARCH_USERS_TAB)

## 1. Overview
This document outlines the exact implementation steps for the Users tab (tab 3) within the global search screen of the Codeplane TUI. It leverages React 19, OpenTUI primitives, and the `@codeplane/ui-core` data layer to deliver a highly responsive, keyboard-driven user discovery interface.

## 2. File Structure Changes
- **New File**: `apps/tui/src/screens/search/results/UserResultRow.tsx`
- **New File**: `apps/tui/src/screens/search/tabs/UsersTab.tsx`
- **Modified File**: `apps/tui/src/screens/search/SearchScreen.tsx` (Integration)
- **Modified File**: `e2e/tui/search.test.ts` (Testing)

## 3. Implementation Steps

### Step 1: Create the UserResultRow Component
**File**: `apps/tui/src/screens/search/results/UserResultRow.tsx`
- **Purpose**: Render a single user search result, reacting to focus state and terminal dimensions.
- **Implementation Details**:
  - Use the `useTerminalDimensions()` hook to determine the current viewport width.
  - **Responsive Logic**:
    - Width < 120 (Minimum): Render only the `username` (truncate at 76 chars).
    - Width >= 120 (Standard/Large): Render `username` (truncate at 20 chars) and `display_name` (truncate at 30 chars).
  - **Styling & Focus**:
    - Wrap in an OpenTUI `<box flexDirection="row">`.
    - Prefix: Render `► ` if `isFocused` is true, otherwise `  `.
    - Apply `reverse={true}` attribute to the row if `isFocused`.
    - Colors: `<text color="primary">` (ANSI 33) for username, `<text color="muted">` (ANSI 245) for display name.

### Step 2: Create the UsersTab Component
**File**: `apps/tui/src/screens/search/tabs/UsersTab.tsx`
- **Purpose**: Manage the list of users, pagination, keyboard navigation, and loading/error states.
- **Data Fetching**:
  - Consume `useSearch({ query, type: 'users' })` from `@codeplane/ui-core`.
  - Extract `data` (UserSearchResultPage), `loading`, `error`, `loadMore`, and `total_count`.
- **State Management**:
  - Track `focusedIndex` (number) internally using React `useState`.
- **Keyboard Interactions** (`useKeyboard` hook):
  - `j` / `Down`: Increment `focusedIndex` (clamp to `items.length - 1`).
  - `k` / `Up`: Decrement `focusedIndex` (clamp to `0`).
  - `G`: Set `focusedIndex` to `items.length - 1`.
  - `g` + `g`: Set `focusedIndex` to `0`.
  - `Ctrl+D` / `Ctrl+U`: Adjust `focusedIndex` by +15 / -15.
  - `Enter`: Trigger `push({ screen: 'user-profile', params: { username: items[focusedIndex].username } })`.
  - `R`: Trigger retry function if in an error state.
- **Render Logic**:
  - **Empty State**: If `!loading && items.length === 0`, render `<box>No users match '{query}'. Try a different query or check spelling.</box>`.
  - **Error State**: If `error`, render `<text color="error">Search error. Press R to retry.</text>`.
  - **List View**: Render an OpenTUI `<scrollbox>`.
    - Set `onScroll` listener. If `scrollTop + height >= scrollHeight * 0.8` (80% threshold) and `items.length < 300` and `!loading`, trigger `loadMore()`.
    - Map over `items` to render `UserResultRow` components, passing `isFocused={index === focusedIndex}`.
  - **Loading Indicators**: Append `<text>Searching...</text>` (initial) or `<text>Loading more...</text>` (pagination) as appropriate.

### Step 3: Integrate into SearchScreen
**File**: `apps/tui/src/screens/search/SearchScreen.tsx`
- **Tab Header Update**: Render the tab label as `Users (${formatCount(total_count)})` where `formatCount` abbreviates > 9999 as `10k+`.
  - Ensure responsive truncation: If terminal width is < 80x24, simplify to `Users(N)` without spaces.
- **Tab Content**: When the active tab index is `2` (3rd tab), mount `<UsersTab query={debouncedQuery} />`.
- Ensure `q` / `Esc` properly unmounts or pops the Search screen without losing historical stack context.

### Step 4: Write End-to-End Tests
**File**: `e2e/tui/search.test.ts`
- Leverage `@microsoft/tui-test` framework.
- **Mock Setup**: Intercept `/api/search/users` to return a deterministic list of 35 mocked users.
- **Test Cases**:
  1. `KEY-USERS-001` to `024`: Assert `j`/`k`/`Enter` navigation correctness. Verify `Enter` correctly pushes the `user-profile` screen with the selected username.
  2. `SNAP-USERS-001` to `014`: Capture terminal snapshots for the Users tab at 80x24 (minimum) and 120x40 (standard) to guarantee responsive truncation logic in `UserResultRow`.
  3. `PAGINATION-USERS`: Simulate scroll events to hit the 80% boundary. Assert `GET` is called for `page=2`. Mock 300 results and assert pagination strictly stops at the 300 cap.
  4. `STATE-USERS-EMPTY`: Assert correct rendering of the `No users match '{query}'` message.
  5. `STATE-USERS-ERROR`: Mock a 500 response, assert the `Press R to retry` text appears in `error` color, and simulate `R` keystroke to ensure refetch.

## 4. Edge Cases & Constraints Addressed
- **Memory Management**: The hard cap of 300 items ensures the `<scrollbox>` does not cause unbounded memory growth or reconciliation lag in the terminal.
- **Degraded UI**: Enforces strict ANSI 256 color tokens (`primary`, `muted`, `error`) mapped to OpenTUI props, ensuring visibility on both Truecolor and 16-color terminals.
- **Stateless Resilience**: Keyboard focus index (`focusedIndex`) is clamped during data mutations to prevent out-of-bounds selection when the query changes or results shrink.
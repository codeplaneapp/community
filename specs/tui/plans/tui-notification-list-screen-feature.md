# Implementation Plan: TUI_NOTIFICATION_LIST_SCREEN

This document outlines the step-by-step implementation plan for the Codeplane TUI Notification List Screen, providing a keyboard-driven, responsive, and real-time notification inbox using React 19 and OpenTUI.

## Phase 1: Scaffolding and Routing

**Goal**: Establish the foundational files and connect the new screen to the TUI navigation router.

1. **Create Directory Structure:**
   - Create folder `apps/tui/src/screens/notifications/`.

2. **Create Stub Components:**
   - Create `apps/tui/src/screens/notifications/NotificationRow.tsx`.
   - Create `apps/tui/src/screens/notifications/NotificationListScreen.tsx`.

3. **Register Screen in Router:**
   - **File**: `apps/tui/src/router/registry.ts`
   - **Action**: Import `NotificationListScreen` and replace the existing `PlaceholderScreen` mapped to `ScreenName.Notifications`.

## Phase 2: Data Hooks and State Management

**Goal**: Integrate with `@codeplane/ui-core` or create local adapter hooks for data fetching, SSE, and local UI state.

1. **Implement/Wire Data Adapters:**
   - **File**: `apps/tui/src/screens/notifications/NotificationListScreen.tsx`
   - **Action**: Import `useNotifications` and `useSSEChannel` from the shared UI core (or create `apps/tui/src/hooks/useNotificationsAdapter.ts` if a TUI-specific adapter is required).
   - Expose `{ notifications, fetchMore, isLoading, isError, markRead, markAllRead, totalCount }`.

2. **Establish Local State:**
   - **File**: `apps/tui/src/screens/notifications/NotificationListScreen.tsx`
   - **Action**: Use React state for:
     - `filter`: `'all' | 'unread'`
     - `searchText`: `string`
     - `searchFocused`: `boolean`
     - `focusedIndex`: `number` (to track the currently highlighted row)
     - `selectedIds`: `Set<string>` (for multi-selection operations)

## Phase 3: UI Components and Responsive Layout

**Goal**: Build the individual visual components using OpenTUI primitives (`<box>`, `<text>`, `<input>`, `<scrollbox>`).

1. **Build NotificationRow Component:**
   - **File**: `apps/tui/src/screens/notifications/NotificationRow.tsx`
   - **Action**: Implement a stateless functional component using `<box flexDirection="row">`.
   - **Props**: `notification`, `isFocused`, `isSelected`, `breakpoint`.
   - **Responsive Logic** (utilizing `useBreakpoint` or passing dimensions):
     - `minimum` (80x24): Unread indicator, Subject (truncated), Timestamp.
     - `standard` (120x40): Unread indicator, Source Icon, Subject (40ch), Body preview (remaining space), Timestamp.
     - `large` (200x60): Extended Subject (55ch), expanded Body preview.
   - **Styling**: Use `color="primary"` or reverse video for `isFocused`. Use `bold` for unread items.

2. **Build Header and Filter Toolbar:**
   - **File**: `apps/tui/src/screens/notifications/NotificationListScreen.tsx`
   - **Action**: Create inline components `TitleRow` (showing unread count) and `FilterToolbar`.
   - Use OpenTUI `<input>` for the search field, controlled by `searchText` and `searchFocused`.

## Phase 4: Main Screen Assembly & Keyboard Navigation

**Goal**: Assemble the screen, implement vim-style keyboard navigation, and wire up SSE reactivity.

1. **Assemble the Screen Layout:**
   - **File**: `apps/tui/src/screens/notifications/NotificationListScreen.tsx`
   - **Action**: Wrap the UI in `<box flexDirection="column" width="100%" height="100%">`.
   - Render `TitleRow`, `FilterToolbar`, and a `<scrollbox>` containing the mapped `NotificationRow` components.
   - Implement scroll-to-end detection on `<scrollbox>` to trigger `fetchMore()`.
   - Add `LoadingState` and `ErrorState` fallbacks.

2. **Implement Keybindings:**
   - **Action**: Use `useScreenKeybindings` to register:
     - `j` / `k`: Increment/decrement `focusedIndex` (bounded by list length).
     - `Enter`: Trigger `push(ScreenName.Detail, { id: notifications[focusedIndex].source_id })`.
     - `/`: Set `searchFocused(true)`.
     - `Esc`: If `searchFocused`, clear search and blur; otherwise `popScreen()`.
     - `g g` / `G`: Jump to top/bottom of the list.
     - `Ctrl+D` / `Ctrl+U`: Page down/up.
     - `r`: Call `markRead(notifications[focusedIndex].id)`.
     - `R`: Call `markAllRead()`.
     - `f`: Toggle `filter` between `'all'` and `'unread'`.
     - `Space`: Toggle `selectedIds.has(notifications[focusedIndex].id)`.

3. **Wire SSE Subscriptions:**
   - **Action**: Implement `useSSEChannel("notifications", (event) => { ... })`.
   - On new notification event, prepend to the local list (if not handled natively by `useNotifications`) and trigger a brief reverse-video flash on the new row.

## Phase 5: Comprehensive E2E Testing

**Goal**: Write `@microsoft/tui-test` assertions ensuring UI stability, responsive bounds, and correct interactions.

1. **Setup Test File:**
   - **File**: `e2e/tui/notifications.test.ts`
   - **Action**: Import `launchTUI`, `TERMINAL_SIZES`, and `createMockAPIEnv` from `e2e/tui/helpers.ts`.

2. **Implement Snapshot & Responsive Tests:**
   - Write `SNAP-NOTIF-*` tests capturing layout states (loading, empty, populated, error).
   - Write `RESP-NOTIF-*` tests executing `launchTUI` with `TERMINAL_SIZES.minimum`, `standard`, and `large`, asserting that column truncation logic functions correctly without overflow.

3. **Implement Keyboard Interaction Tests:**
   - Write `KEY-NOTIF-*` tests simulating keystrokes (`j`, `k`, `/`, `Enter`, `r`, `R`, `Esc`).
   - Assert that focus indexes update, input modes toggle, and navigation pushes the correct route payload.

4. **Implement Integration & Edge Case Tests:**
   - Write `INT-NOTIF-*` tests simulating SSE events injecting new data and asserting the UI updates.
   - Write `EDGE-NOTIF-*` tests verifying behavior on API 500s, rapid pagination scrolls, and empty state resolutions.
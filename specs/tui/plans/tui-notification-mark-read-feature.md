# Implementation Plan: TUI_NOTIFICATION_MARK_READ

This plan outlines the steps to implement the single and batch mark-read feature for the Codeplane TUI notifications screen, including optimistic updates, global badge integration, and comprehensive e2e testing.

## Phase 1: Data Layer & Global Shell Integration

### 1. Update UI Core Hooks
**File:** `packages/ui-core/src/hooks/useNotifications.ts` (or appropriate file in `@codeplane/ui-core`)
- **Action:** Export `useMarkNotificationRead(id: string)` and `useMarkAllNotificationsRead()` hooks.
- **Details:** These should wrap the respective API calls (`PATCH /api/notifications/:id` and `PUT /api/notifications/mark-read`) and expose standard mutation properties so the TUI can hook into them for optimistic updates.

### 2. Wire Up Global Badges
**Files:** `apps/tui/src/components/AppShell/HeaderBar.tsx` & `apps/tui/src/components/AppShell/StatusBar.tsx`
- **Action:** Replace hardcoded `unreadCount = 0` placeholders.
- **Details:** 
  - Import `useNotifications()` from `@codeplane/ui-core`.
  - Calculate `unreadCount` based on the fetched notifications or read it directly if provided by the hook.
  - Ensure the header badge and status bar badge dynamically reflect this count. This ensures optimistic local cache updates automatically trickle up.

## Phase 2: Notification Screen State & Actions

### 1. Create Action Hook
**File:** `apps/tui/src/screens/Notifications/useNotificationActions.ts`
- **Action:** Implement state management for mark-read operations.
- **Details:**
  - Import `useOptimisticMutation` from `apps/tui/src/hooks/useOptimisticMutation.ts`.
  - Maintain local state: `inFlightIds` (`Set<string>`) and `isMarkingAll` (`boolean`).
  - **`markRead` function:** Wraps `useMarkNotificationRead` with `useOptimisticMutation`.
    - `onOptimistic`: Update the targeted notification's status to `'read'` in the query cache. Decrement unread count. Add to `inFlightIds`.
    - `onRevert`: Restore previous state, remove from `inFlightIds`. Show error in status bar.
    - `onSuccess`: Remove from `inFlightIds`.
  - **`markAllRead` function:** Wraps `useMarkAllNotificationsRead` with `useOptimisticMutation`.
    - `onOptimistic`: Set `isMarkingAll` to true. Update all cached unread notifications to `'read'`. Set unread count to 0.
    - `onRevert`: Restore previous state. Set `isMarkingAll` to false.
    - `onSuccess`: Set `isMarkingAll` to false.

## Phase 3: Screen & Row Components

### 1. Create Notification Row
**File:** `apps/tui/src/screens/Notifications/NotificationRow.tsx`
- **Action:** Build the UI for a single notification item.
- **Details:**
  - Accept props: `notification`, `isFocused`.
  - Use `<text color="primary">` for the unread indicator (`●` if unread, ` ` if read).
  - Use `<text bold={status === 'unread'}>` for the subject/title.
  - Apply highlight styling when `isFocused` is true.

### 2. Create Notification List Screen
**File:** `apps/tui/src/screens/Notifications/NotificationListScreen.tsx`
- **Action:** Assemble the main screen, layout, and keybindings.
- **Details:**
  - Layout using `<box>` and `<scrollbox>` from `@opentui/react`.
  - Use `useNotifications()` to fetch data and derive the `unreadCount` for the header (`Notifications (${unreadCount} unread)`).
  - Map over notifications and render `NotificationRow` components.
  - Integrate `useScreenKeybindings`:
    - **`r` Handler:** Check `!isSearchFocused`, not in `inFlightIds`, `status === 'unread'`. If active filter is 'unread', trigger optimistic update, delay 200ms, adjust focus index. Call `markRead(id)`.
    - **`R` Handler:** Check `!isSearchFocused`, `unreadCount > 0`, `!isMarkingAll`. Call `markAllRead()`.
  - Integrate `useStatusBarHints` and `useLayout`:
    - Provide transient status bar messages on success/error based on the current breakpoint (Minimum, Standard, Large).

## Phase 4: End-to-End Testing

### 1. Create E2E Test Suite
**File:** `e2e/tui/notifications.test.ts`
- **Action:** Implement comprehensive tests using `@microsoft/tui-test`.
- **Details:**
  - **Terminal Snapshot Tests:** Implement SNAP-MARKREAD-001 through SNAP-MARKREAD-015 to verify indicators, text weights, transient messages at different breakpoints, filter behaviors, optimistic reverts, and global badge updates.
  - **Keyboard Interaction Tests:** Implement KEY-MARKREAD-001 through KEY-MARKREAD-025 to validate `r` and `R` functionality, filter interactions, in-flight guards, input focus guards, and navigation edge cases (e.g., `q` pop).
  - **Responsive Tests:** Implement RESP-MARKREAD-001 through RESP-MARKREAD-008 to verify behavior at different viewport dimensions and during `SIGWINCH` resize events.
  - **Integration Tests:** Implement INT-MARKREAD-001 through INT-MARKREAD-015 to validate API calls, server error handling (404, 429, 500, 401), and SSE interplay.
  - **Edge Case Tests:** Implement EDGE-MARKREAD-001 through EDGE-MARKREAD-012 for network limits, SSE race conditions, null source processing, concurrent reverts, and transient message timeouts.
# Engineering Specification: TUI_NOTIFICATION_MARK_READ

## 1. Overview

The `TUI_NOTIFICATION_MARK_READ` feature enables keyboard-driven control over notification read states in the Codeplane TUI notification inbox. It introduces optimistic UI updates for both single (`r`) and batch (`R`) operations, providing immediate visual feedback by updating unread indicators, text weights, and badge counts. The system must gracefully handle server errors with automated optimistic reverts, respect terminal sizing for status bar messages, avoid double-firing through in-flight guards, and conditionally transition focused rows based on the active filter.

## 2. Implementation Plan

### 2.1. State Management & Hooks (`apps/tui/src/screens/Notifications/useNotificationActions.ts`)
1.  **Consume Data Hooks:** Utilize `useMarkNotificationRead(id)` and `useMarkAllNotificationsRead()` from `@codeplane/ui-core`.
2.  **In-flight Tracking:** Introduce local state `inFlightIds` (`Set<string>`) and `isMarkingAll` (`boolean`) to guard against rapid duplicate keypresses.
3.  **Optimistic Engine:**
    -   **Single (`r`):** On execution, immediately update the targeted notification's `status` to `'read'` in the local `useNotifications()` cache. Decrement the local unread count.
    -   **Batch (`R`):** On execution, iterate the cache and set all notifications with `status === 'unread'` to `'read'`. Set the unread count to 0.
4.  **Revert Logic:**
    -   Capture the pre-mutation state.
    -   If the API call yields a 404, remove the row from the local cache entirely.
    -   If the API call yields 429 or 500, revert the cache to the pre-mutation state and propagate the error string to the UI.

### 2.2. Screen Interaction & Keybindings (`apps/tui/src/screens/Notifications/NotificationListScreen.tsx`)
1.  **Register Keybindings:** Use `useScreenKeybindings` (from the `BaseScreen` abstraction) to register `r` and `R`.
    -   **`r` Handler:**
        -   Check if search input is focused (if so, no-op).
        -   Get the currently focused notification based on `ScrollableList` focus index.
        -   If `status === 'read'` or `inFlightIds.has(id)`, no-op.
        -   If active filter is `'unread'`, trigger the optimistic update, then use `setTimeout` (200ms) to remove the item from the visible list and clamp the focus index.
        -   Trigger `useMarkNotificationRead(id).mutate()`. 
    -   **`R` Handler:**
        -   Check if search input is focused (if so, no-op).
        -   If unread count is 0 or `isMarkingAll` is true, no-op.
        -   Trigger `useMarkAllNotificationsRead().mutate()`.
2.  **Status Bar Integration:**
    -   Use `useStatusBarHints()` context to temporarily override hints with confirmation or error messages for 3 seconds.
    -   Use `useLayout().breakpoint` to determine string length:
        -   Minimum (80x24): "Read" / "All read (N)" / "Error: {reason}"
        -   Standard (120x40): "Marked read" / "All marked read (N)" / "Failed: {reason}"
        -   Large (200x60): "Notification marked as read" / "All N notifications marked as read" / "Failed to mark read: {reason}"

### 2.3. Component Rendering (`apps/tui/src/screens/Notifications/NotificationRow.tsx`)
1.  **Unread Indicator:** Render a 2ch wide `<text color="primary">` element. Display `●` if `status === 'unread'`, else ` ` (space).
2.  **Row Styling:** Apply `bold={status === 'unread'}` to the notification subject `<text>` component.
3.  **Header Title:** Bind the `unreadCount` derived from the hook to the title: `Notifications (${unreadCount} unread)`.

### 2.4. Global Integration (`apps/tui/src/components/AppShell/HeaderBar.tsx` & `StatusBar.tsx`)
1.  Ensure the global notification badge subscribes to the same `useNotifications()` cache or a shared global unread count context, so that optimistic updates in the list screen automatically trickle up to the header and status bar badges.
2.  SSE stream events arriving via `useNotificationStream()` should continue to append to the list and increment the count appropriately even if a mark-all operation just concluded.

## 3. Unit & Integration Tests

All tests will be placed in `e2e/tui/notifications.test.ts` using `@microsoft/tui-test`. Each test will run against a real/mocked API server responding appropriately.

### 3.1. Terminal Snapshot Tests
-   **SNAP-MARKREAD-001/002/003:** Verify `●` indicators and bold weights before/after `r` and `R` at 120x40.
-   **SNAP-MARKREAD-004/005/006:** Validate transient status bar messages (Success green, Error red) at 120x40.
-   **SNAP-MARKREAD-007/008:** Validate Unread filter behaviors (item removed after `r`, empty state "No unread notifications..." after `R`) at 120x40.
-   **SNAP-MARKREAD-009/010/011/012:** Verify responsive status bar message truncations across 80x24 and 200x60 breakpoints.
-   **SNAP-MARKREAD-013:** Verify optimistic revert restores `●`, bold text, and unread counts correctly.
-   **SNAP-MARKREAD-014/015:** Validate Header and Status Bar badge counts reflect mark read interactions.

### 3.2. Keyboard Interaction Tests
-   **KEY-MARKREAD-001 to 006:** General `r` and `R` assertions including no-ops on already read items or 0 unread counts.
-   **KEY-MARKREAD-007 to 010:** Filter interaction validations (Unread vs All filters).
-   **KEY-MARKREAD-011 to 014:** In-flight guard checks. Verify rapid `r` keys are ignored while waiting for the first request; verify multiple distinct `r` requests process concurrently.
-   **KEY-MARKREAD-015 to 018:** Input focus guards (`r`/`R` does not trigger when search is focused, empty list, loading state).
-   **KEY-MARKREAD-019 to 025:** Navigation edge cases (`q` pop completes mutation, scroll position preserved, correct focus index retention).

### 3.3. Responsive Tests
-   **RESP-MARKREAD-001 to 006:** Keybinding outputs at specific viewport dimensions.
-   **RESP-MARKREAD-007/008:** Trigger resize (`SIGWINCH` simulation) from 120x40 to 80x24 during in-flight `r` to verify synchronous layout recalculation without mutation interruption.

### 3.4. Integration Tests
-   **INT-MARKREAD-001 to 004:** E2E validation ensuring `PATCH /api/notifications/:id` and `PUT /api/notifications/mark-read` are sent and local cache aligns with subsequent refetches.
-   **INT-MARKREAD-005 to 010:** Server error handling mapping (404 removes row, 429 sets rate limit status message, 500 triggers visual revert, 401 triggers auth screen).
-   **INT-MARKREAD-011 to 015:** SSE interplay (SSE incoming after `R` triggers +1 count), background completion on screen pop, and source navigation retention.

### 3.5. Edge Case Tests
-   **EDGE-MARKREAD-001 to 004:** Network limits and SSE race conditions.
-   **EDGE-MARKREAD-005:** `null` `source_id` processing.
-   **EDGE-MARKREAD-006 to 009:** Concurrent optimistic reverts and overlapping `R` then `r` presses.
-   **EDGE-MARKREAD-010 to 012:** Transient message timeouts and search text interactions.
# Implementation Plan: TUI_NOTIFICATION_BADGE

This plan details the implementation steps for the persistent notification badge feature across the Codeplane TUI, ensuring seamless integration with the existing architecture and comprehensive E2E test coverage.

## 1. Create Badge Components

### 1.1 HeaderBadge Component
**File:** `apps/tui/src/components/NotificationBadge/HeaderBadge.tsx`
**Task:** Implement the notification badge for the header.
*   Import `useNotifications` from `@codeplane/ui-core` and `useTheme` from local hooks.
*   Extract `unreadCount`. Treat values `< 0`, `null`, or `undefined` as `0`.
*   If `unreadCount <= 0`, return `null`.
*   Format the display string: use `"99+"` if `unreadCount > 99`, otherwise the number.
*   Render inside a `<box flexShrink={0}>` containing a `<text fg={theme.warning}>` component to display ` [{displayCount}]` (with a leading space).

### 1.2 StatusBarBadge Component
**File:** `apps/tui/src/components/NotificationBadge/StatusBarBadge.tsx`
**Task:** Implement the stateful notification badge for the status bar.
*   Import `useNotifications` from `@codeplane/ui-core`, `useTheme`, `TextAttributes` (for bold styling), and React hooks (`useState`, `useEffect`, `useRef`).
*   Track `prevUnreadCount` using a `useRef`.
*   Maintain a `isBoldPulseActive` boolean state.
*   Create a `useEffect` that checks if `unreadCount > prevUnreadCount.current`. If true, set `isBoldPulseActive(true)` and initiate a 2000ms timeout to reset it. Clear timeout on unmount or re-trigger.
*   If `unreadCount > 0`: Render `<box flexShrink={0}>` with a primary-colored (`theme.primary`) `<text>` showing `◆ {displayCount}` (capped at 99+). Apply `TextAttributes.BOLD` if `isBoldPulseActive` is true.
*   If `unreadCount <= 0`: Render `<box flexShrink={0}>` with a muted-colored (`theme.muted`) `<text>` showing `◆`.

## 2. Integrate into Layout

### 2.1 Update HeaderBar
**File:** `apps/tui/src/components/AppShell/HeaderBar.tsx` (or `apps/tui/src/components/HeaderBar.tsx`)
**Task:** Inject `HeaderBadge` into the application header.
*   Remove the hardcoded `const unreadCount = 0; // placeholder` and the corresponding conditional render.
*   Import `<HeaderBadge />`.
*   Place it directly inside the right-aligned `<box>` beside the connection status indicator (`●`).

### 2.2 Update StatusBar
**File:** `apps/tui/src/components/AppShell/StatusBar.tsx` (or `apps/tui/src/components/StatusBar.tsx`)
**Task:** Inject `StatusBarBadge` into the application status bar.
*   Locate the right-side container (the `<box>` holding the `?:help` text).
*   Import `<StatusBarBadge />`.
*   Prepend the component immediately to the left of the help indicator, maintaining the max 6 character visual constraint.

## 3. Implement End-to-End Tests

### 3.1 AppShell Layout Tests
**File:** `e2e/tui/app-shell.test.ts`
**Task:** Add rendering, snapshot, and resize tests.
*   Append the 12 snapshot tests (`SNAP-NB-001` through `SNAP-NB-012`) verifying badge rendering at various counts (0, >0, >99) and terminal sizes (120x40, 80x24, 200x60).
*   Append the 5 resize tests (`RESIZE-NB-001` through `RESIZE-NB-005`) simulating terminal dimension changes and asserting badge visibility and adaptation.

### 3.2 Notifications Interaction Tests
**File:** `e2e/tui/notifications.test.ts`
**Task:** Create a new test suite for data flow, SSE, and edge cases.
*   **Scaffold:** Create the file and import necessary utilities from `@microsoft/tui-test` and local test helpers (e.g., `launchTUI`).
*   **Keyboard Interactions:** Implement the 7 `KEY-NB-*` tests handling mark-read toggles and persistence across navigation.
*   **SSE Updates:** Implement the 7 `SSE-NB-*` tests to verify real-time increments, the bold pulse behavior, disconnection resilience, and reconnection fetching.
*   **Edge Cases:** Implement the 9 `EDGE-NB-*` tests handling unauthenticated rendering, boundary numbers (99, 100), and optimistic UI failure revert scenarios.
*   **Integration:** Implement the 3 `INT-NB-*` tests testing complex sequences of mark-all-read mixed with new SSE arrivals.
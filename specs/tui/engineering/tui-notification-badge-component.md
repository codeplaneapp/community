# Engineering Specification: Notification Badge Components

## 1. Overview
This specification details the implementation of the notification badge components for the Codeplane TUI. These components (`HeaderBadge` and `StatusBarBadge`) provide real-time visibility into the user's unread notification count, utilizing Server-Sent Events (SSE) for updates.

## 2. Component Design

### 2.1 `NotificationBadge.tsx`
We will create a new file `apps/tui/src/components/NotificationBadge.tsx` exporting two distinct components: `HeaderBadge` and `StatusBarBadge`.

Both components share the following requirements:
- Consume `unreadCount` from the `@codeplane/ui-core` `useNotifications()` hook.
- Gracefully handle SSE disconnections by retaining the last known count (handled inherently by the hook's cache).
- Support optimistic decrements (when a user performs an action that clears a notification, the count updates immediately via optimistic mutation).
- Maintain a rigid layout footprint (`flexShrink={0}`, max width of `6ch`) to prevent layout shifts during terminal resizing.
- Format counts greater than 99 as `99+`.

### 2.2 `HeaderBadge`
- **Location:** Right side of the `HeaderBar`, next to the connection indicator.
- **Rendering:**
  - When `count > 0`: Renders `[N]` (e.g., `[5]`, `[99+]`).
  - When `count === 0`: Returns `null` (hidden).
- **Styling:** Uses the theme's `warning` color token (resolving to ANSI 178).

### 2.3 `StatusBarBadge`
- **Location:** Right side of the `StatusBar`, before the help hint.
- **Rendering:**
  - Always visible.
  - Renders a diamond symbol followed by the count: `◆ N`.
- **Styling:**
  - When `count > 0`: Uses the theme's `primary` color token (resolving to ANSI 33).
  - When `count === 0`: Uses the theme's `muted` color token (resolving to ANSI 245).
- **Animation:** Upon an increase in the unread count, the text briefly pulses (applies bold formatting) for 2 seconds.

## Implementation Plan

### Step 1: Create `NotificationBadge.tsx`
**File:** `apps/tui/src/components/NotificationBadge.tsx`

1. Import OpenTUI components (`<box>`, `<text>`).
2. Import React hooks (`useEffect`, `useState`, `useRef`).
3. Import `useTheme` from the TUI theme provider, and `useNotifications` from `@codeplane/ui-core`.
4. Create a formatting helper:
   ```ts
   const formatCount = (count: number): string => (count > 99 ? '99+' : count.toString());
   ```
5. Implement `HeaderBadge`:
   - Retrieve `unreadCount` from `useNotifications()`.
   - Return `null` if `unreadCount === 0`.
   - Render:
     ```tsx
     <box flexShrink={0}>
       <text fg={theme.warning}>[{formatCount(unreadCount)}]</text>
     </box>
     ```
6. Implement `StatusBarBadge`:
   - Retrieve `unreadCount` from `useNotifications()`.
   - Maintain an `isPulsing` state (`boolean`) and a `previousCount` ref to detect increments.
   - Use `useEffect` to compare `unreadCount` with `previousCount.current`. If it increased, set `isPulsing` to `true` and clear it after 2000ms using a timeout.
   - Determine color: `const color = unreadCount > 0 ? theme.primary : theme.muted;`
   - Render:
     ```tsx
     <box flexShrink={0} width={6}>
       <text fg={color} bold={isPulsing}>◆ {formatCount(unreadCount)}</text>
     </box>
     ```

### Step 2: Integrate `HeaderBadge` into `HeaderBar`
**File:** `apps/tui/src/components/HeaderBar.tsx`

1. Import `HeaderBadge` from `./NotificationBadge`.
2. Locate the right-side section of the header layout.
3. Insert `<HeaderBadge />` immediately to the right of the connection status indicator.

### Step 3: Integrate `StatusBarBadge` into `StatusBar`
**File:** `apps/tui/src/components/StatusBar.tsx`

1. Import `StatusBarBadge` from `./NotificationBadge`.
2. Locate the right-side section of the status bar.
3. Replace any placeholder notification counts with the `<StatusBarBadge />` component, positioning it right before the `? help` hint.

## Unit & Integration Tests

**File:** `e2e/tui/notifications.test.ts`

These tests use `@microsoft/tui-test` to validate user-visible behavior against real test fixtures. Components and hooks are not mocked.

### 1. `HeaderBadge` Rendering and Hiding
- **Scenario:** User with 0 notifications.
  - **Action:** Launch the TUI against a test fixture where `unreadCount` is 0.
  - **Assertion:** Verify the header row (e.g., `terminal.getLine(0)`) does not contain a count pattern (`[\d+]`).
- **Scenario:** User with active notifications.
  - **Action:** Launch the TUI against a test fixture where `unreadCount` is 5.
  - **Assertion:** Verify the header row contains `[5]` and includes the warning color ANSI sequence (e.g., `\x1b[38;5;178m`).
- **Scenario:** User with >99 notifications.
  - **Action:** Launch the TUI against a fixture where `unreadCount` is 150.
  - **Assertion:** Verify the header row contains `[99+]`.

### 2. `StatusBarBadge` Rendering and Styling
- **Scenario:** User with 0 notifications.
  - **Action:** Launch the TUI with 0 notifications.
  - **Assertion:** Verify the status bar row (e.g., `terminal.getLine(terminal.rows - 1)`) contains `◆ 0` and includes the muted color ANSI sequence (e.g., `\x1b[38;5;245m`).
- **Scenario:** User with active notifications.
  - **Action:** Launch the TUI with 12 notifications.
  - **Assertion:** Verify the status bar row contains `◆ 12` and includes the primary color ANSI sequence (e.g., `\x1b[38;5;33m`).

### 3. `StatusBarBadge` Pulse Animation
- **Scenario:** Unread count increases via SSE.
  - **Action:** Launch the TUI with 2 notifications. Trigger a server-side test helper to emit an SSE event adding a new notification.
  - **Assertion:** Immediately verify the status bar row updates to `◆ 3` and contains the bold escape sequence (`\x1b[1m`).
  - **Assertion:** Wait 2100ms, then verify the bold sequence is no longer present on `◆ 3`.

### 4. Layout Constraints (Terminal Resize)
- **Scenario:** Terminal size changes to minimum bounds.
  - **Action:** Launch the TUI with 150 notifications. Resize terminal via `terminal.resize(80, 24)`.
  - **Assertion:** Verify both badges do not collapse or truncate. `HeaderBadge` must fully display `[99+]` and `StatusBarBadge` must display `◆ 99+` without being squished.

### 5. Optimistic Decrements
- **Scenario:** User marks a notification as read.
  - **Action:** Navigate to the notifications screen (`g n`) with 3 notifications. Select a notification and trigger the "mark as read" shortcut.
  - **Assertion:** Verify the rendered count in both the header and status bar immediately drops to `2` before the server finishes processing the request.

### 6. SSE Disconnect Retainment
- **Scenario:** SSE connection is lost.
  - **Action:** Launch the TUI with 5 notifications. Force a disconnect on the test backend's SSE channel.
  - **Assertion:** Verify both badges still display `5` and do not reset to `0` or disappear.
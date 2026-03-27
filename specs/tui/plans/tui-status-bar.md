# Implementation Plan: TUI Status Bar (tui-status-bar)

## Overview
This plan outlines the implementation of the `StatusBar` component for the Codeplane TUI, replacing the current placeholder. The new status bar will feature context-sensitive keybinding hints, a real-time daemon sync status indicator, and a real-time notification count badge. It will gracefully handle responsive layouts across various terminal sizes and include comprehensive error handling and telemetry.

## Step-by-Step Implementation

### Step 1: Implement Data Hooks

Create the necessary hooks to provide state to the status bar components. Since the SSE provider and `@codeplane/ui-core` notification hooks are currently stubs or unavailable, these hooks will serve as integration layers that degrade gracefully.

**1.1 Create `apps/tui/src/hooks/useSyncState.ts`**
*   **Purpose:** Provides daemon sync status.
*   **Behavior:** Checks auth status (`useAuth`). Returns `"disconnected"` if unauthenticated or daemon unreachable. Emits telemetry `tui.status_bar.sync_state_changed` on transitions. Logs transitions via `logger.info`.
*   **Types:** Export `SyncStatus` and `SyncState`.

**1.2 Create `apps/tui/src/hooks/useNotificationCount.ts`**
*   **Purpose:** Provides unread notification count and flash state for new notifications.
*   **Behavior:** Returns `count` and `isFlashing` boolean. Uses `useRef` to track previous counts. Triggers `isFlashing = true` for 2000ms when count increases. Emits `tui.status_bar.notification_received`. Returns 0 if not authenticated.

**1.3 Create `apps/tui/src/hooks/useSSEConnectionState.ts`**
*   **Purpose:** Exposes SSE connection health for sync indicator.
*   **Behavior:** Currently returns stub data `{ connected: false, reconnecting: false, backoffMs: 0 }`. Will later connect to the real `SSEProvider`. Emits telemetry for disconnects/reconnects.

### Step 2: Implement UI Sub-components

**2.1 Create `apps/tui/src/components/SyncStatusIndicator.tsx`**
*   **Purpose:** Pure rendering component for the center sync status.
*   **Props:** `{ syncState: SyncState }`
*   **Behavior:** Uses `useTheme`, `useLayout`, and `useSpinner` (for `"syncing"` state). Renders icons (`●`, `⠋`, `▲`) and optional text depending on `breakpoint` (`minimum` = icon only, `standard` = icon + label, `large` = icon + label + timestamp).

**2.2 Create `apps/tui/src/components/NotificationBadge.tsx`**
*   **Purpose:** Pure rendering component for the right-side notification count.
*   **Props:** `{ state: NotificationCountState }`
*   **Behavior:** Uses `useTheme`. Renders `◆ N` or fallback `* N`. Applies `TextAttributes.BOLD` if `state.isFlashing`. Uses `theme.muted` when count is 0 (no number shown). Displays `99+` if count exceeds 99.

**2.3 Create `apps/tui/src/components/StatusBarErrorBoundary.tsx`**
*   **Purpose:** Isolates rendering errors in the status bar to prevent full app crashes.
*   **Behavior:** A React class component. On `componentDidCatch`, logs error via `logger.error`. Renders fallback `<text fg={theme.error}>[status bar error — press ? for help]</text>`.

### Step 3: Implement Navigation Utilities

**3.1 Create `apps/tui/src/navigation/goToHints.ts`**
*   **Purpose:** Generates status bar hints for go-to mode based on existing keybindings.
*   **Behavior:** Imports `goToBindings` from `./goToBindings.js`. Exports `getGoToHints()` which maps bindings to `StatusBarHint` objects with the `g+` prefix.

### Step 4: Refactor the Main StatusBar Component

**4.1 Rewrite `apps/tui/src/components/StatusBar.tsx`**
*   **Layout:** Single `<box>` with `flexDirection="row"`, `height={1}`, `justifyContent="space-between"`, using `theme.surface` for background and `theme.border` for top border (`border={["top"]}`).
*   **Left Section (Hints):** Uses `computeVisibleHints` to calculate how many hints fit based on available terminal width, ensuring truncation with `…` if necessary. Displays `useLoading().statusBarError` if present.
*   **Center Section (Sync):** Renders the `<SyncStatusIndicator syncState={syncState} />`. Preserves auth confirmation flash logic.
*   **Right Section (Notifications & Help):** Renders `<NotificationBadge state={notifState} />` and `?:help`.
*   **Telemetry:** Emits `tui.status_bar.rendered` on mount with state dimensions and details. Emits `tui.status_bar.resize_relayout` when the breakpoint changes.

### Step 5: Integration and Barrel Exports

**5.1 Update `apps/tui/src/hooks/index.ts`**
*   Export `useSyncState`, `useNotificationCount`, and `useSSEConnectionState` along with their types.

**5.2 Update `apps/tui/src/navigation/index.ts`**
*   Export `getGoToHints`.

**5.3 Update `apps/tui/src/components/AppShell.tsx`**
*   Wrap the `<StatusBar />` component with `<StatusBarErrorBoundary theme={theme}>`.

### Step 6: Implement End-to-End Tests

**6.1 Update `e2e/tui/app-shell.test.ts`**
*   **Action:** Add a new `describe("TUI_STATUS_BAR")` block.
*   **Helpers:** Add `getStatusBarLine` and `getStatusBarBorderLine` utility functions to extract the bottom lines of the terminal via `terminal.getLine(terminal.rows - 1)`.
*   **Test Cases:** Implement all test cases detailed in the engineering specification:
    *   **Core rendering:** Snapshots at 80x24, 120x40, 200x60, full-width span validation, surface background presence.
    *   **Keybinding hints:** Key/action format, screen navigation updates, go-to mode updates, help/command palette overlay verification.
    *   **Sync status indicator:** Disconnected state, syncing spinner (expected to fail until daemon integration), conflict state (expected to fail).
    *   **Notification badge:** Zero state (muted diamond), count display (expected to fail), overflow (99+, expected to fail).
    *   **Responsive resize:** Expanding/collapsing sync labels, full-width verification after resize, rapid resize stability.
    *   **Edge cases:** Missing auth token handling, exact 80 column handling, non-truncated help hint.
    *   **Real-time updates:** SSE disconnect/reconnect tests, new notification bold flash (expected to fail).
*   **Philosophy:** Tests that require unimplemented backends (SSE, daemon) MUST be left to fail natively, never skipped.

## Future Considerations
Once the `SSEProvider` and `@codeplane/ui-core` packages are fully implemented, the local data hooks (`useSyncState`, `useNotificationCount`, `useSSEConnectionState`) will be updated to subscribe to real data streams. The core `StatusBar` UI component will require zero changes during that upgrade.
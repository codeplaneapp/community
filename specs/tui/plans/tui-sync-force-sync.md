# Implementation Plan: TUI Force Sync Action

This document outlines the step-by-step implementation plan for the `TUI_SYNC_FORCE_SYNC` feature. It covers adding the necessary data hooks to the shared `@codeplane/ui-core` package, building the state management hook for the TUI, implementing the UI components in the `SyncStatusScreen`, integrating it into the router, and writing the comprehensive E2E test suite.

## 1. Create Shared Data Hooks (`@codeplane/ui-core`)

First, we need to implement the core API hook that communicates with the local daemon to trigger the force sync.

### 1.1 Create `useSyncForce` Hook
**File:** `packages/ui-core/src/hooks/sync/useSyncForce.ts`

- Define the response type for the sync API: `{ total: number, synced: number, conflicts: number, failed: number }`.
- Implement a hook that returns a `mutateAsync` function. This function should accept an optional `AbortSignal` for the 30-second timeout.
- Handle standard API client errors (e.g., 400, 401, 429) and throw them so the consuming TUI hook can catch and display them.

```typescript
import { useAPIClient } from "../../client/APIClientProvider.js";

export interface SyncForceResponse {
  total: number;
  synced: number;
  conflicts: number;
  failed: number;
}

export function useSyncForce() {
  const { fetch } = useAPIClient();

  const syncForce = async (signal?: AbortSignal): Promise<SyncForceResponse> => {
    const response = await fetch("/api/daemon/sync", {
      method: "POST",
      signal,
    });
    if (!response.ok) {
      // Throw appropriate error based on status (400, 401, 429, 500)
      throw new Error(`Sync failed: ${response.statusText}`);
    }
    return response.json();
  };

  return { syncForce };
}
```

### 1.2 Export the Hook
**File:** `packages/ui-core/src/index.ts`
- Export `useSyncForce` and `SyncForceResponse` to make them available to the TUI application.

## 2. Create TUI State Management Hook

We need a hook to manage the complex orchestration of the force sync action: preventing concurrent syncs, handling timeouts, formatting responsive toast messages, and managing transient status bar flashes.

### 2.1 Implement `useForceSyncAction`
**File:** `apps/tui/src/screens/Sync/hooks/useForceSyncAction.ts`

- **State:**
  - `isSyncing: boolean`
  - `toast: { visible: boolean, message: string, type: 'success' | 'warning' | 'error' } | null`
  - `flashMessage: string | null`
- **Dependencies:**
  - Import `useSyncForce`, `useDaemonStatus`, and `useSyncConflicts` from `@codeplane/ui-core`.
  - Import `useTerminalDimensions` from `@opentui/react`.
- **Logic:**
  - `triggerSync(pendingCount: number)`:
    - Guard: If `isSyncing`, set `flashMessage` to "Sync already in progress" for 2s.
    - Guard: If `pendingCount === 0`, set `flashMessage` to "Nothing to sync" for 2s.
    - Set `isSyncing(true)`, clear existing toast.
    - Create an `AbortController` and a `setTimeout` for 30,000ms. If the timeout hits, call `controller.abort()`, catch the `AbortError`, and show the timeout toast.
    - Await `syncForce(controller.signal)`.
    - On success, format the toast message conditionally based on the `width` from `useTerminalDimensions()`. If `width < 120`, use the abbreviated format (`"Synced {n} ({c} conf, {f} fail)"`). Set the toast type based on `conflicts` and `failed` counts.
    - On catch, parse the error (network, abort, server) and set the error toast.
    - In `finally`, set `isSyncing(false)`, trigger `refetchStatus()` and `refetchConflicts()`, and set a 5-second timeout to clear the toast.

## 3. Implement the Sync Status Screen

Now we integrate the action hook and the UI components into the screen.

### 3.1 Build `SyncStatusScreen.tsx`
**File:** `apps/tui/src/screens/Sync/SyncStatusScreen.tsx`

- **Setup:**
  - Call `useForceSyncAction()`.
  - Call `useTimeline(80)` to get the `spinnerFrame` index. Map it to `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]`.
  - Call `useKeyboard()` to listen for `S` (Shift+S). Ensure it ignores events if an input field (like a filter) is focused.
- **Status Banner UI:**
  - Render the banner. If `isSyncing`, show `<text color="warning" bold>◐ Syncing… {spinnerChar}</text>`.
  - At `standard` and `large` breakpoints, render a second line: `<text color="muted">Flushing {pendingCount} pending items…</text>`.
- **Toast UI:**
  - If `toast?.visible` is true, render a `<box height={1}>` below the banner. Apply colors based on `toast.type` (`success` -> green 34, `warning` -> yellow 178, `error` -> red 196).
- **Status Bar UI:**
  - In the global status bar layout, override the keybinding hints. If `flashMessage` is active, show it (`<text color="muted" italic>`). Else, if `isSyncing`, show `syncing…`. Else, show the standard hints including `S:sync`.

## 4. Update the Router Registry

Replace the placeholder screen with the real implementation.

### 4.1 Update `registry.ts`
**File:** `apps/tui/src/router/registry.ts`

- Import `SyncStatusScreen` from `../screens/Sync/SyncStatusScreen.js`.
- Update the `ScreenName.Sync` entry to point to the `SyncStatusScreen` component instead of the `PlaceholderScreen`.

## 5. Implement End-to-End Tests

Create the test file to verify all acceptance criteria using the `@microsoft/tui-test` framework.

### 5.1 Create `sync.test.ts`
**File:** `e2e/tui/sync.test.ts`

- **Setup:** Mock the `@codeplane/ui-core` hooks or set up the mock API server to respond to `POST /api/daemon/sync`.
- **Snapshot Tests (`SNAP-FORCE-*`):**
  - Use `terminal.snapshot()` to verify the exact visual layout of the status banner, braille spinner, and the 3 types of toasts across `80x24`, `120x40`, and `200x60` dimensions.
- **Keyboard Interaction Tests (`KEY-FORCE-*`):**
  - Use `terminal.sendKeys('S')` to trigger syncs under various conditions (pending > 0, pending = 0, during an active sync).
  - Verify the status bar text updates using `.getLine()` assertions.
  - Verify other keybindings (`q`, `j`, `k`, `/`) are not blocked during sync.
- **Responsive Tests (`RESP-FORCE-*`):**
  - Use `terminal.resize(w, h)` while a mocked long-running sync is in flight to ensure layout recalculates without crashing.
- **Integration Tests (`INT-FORCE-*`):**
  - Mock different API responses (clean success, partial success, timeout, 400, 401, 500) and verify the correct toast is displayed and the queues are refreshed.
- **Edge Case Tests (`EDGE-FORCE-*`):**
  - Test rapid sequential `S` key presses to ensure debouncing/guarding works.
  - Test very large queue sizes and verify truncation logic.

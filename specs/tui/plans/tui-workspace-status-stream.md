# Implementation Plan: Real-Time Workspace Status Streaming via SSE (`tui-workspace-status-stream`)

This plan details the steps to implement the `TUI_WORKSPACE_STATUS_STREAM` feature based on the engineering specification and research findings.

## Phase 1: Core State & Providers

### Step 1: Upgrade `SSEProvider`
**File:** `apps/tui/src/providers/SSEProvider.tsx`
- Replace the placeholder implementation with a real registry that tracks `workspaceConnectionHealth`.
- Implement `registerStreamState`, `unregisterStream`, and connection health aggregation.
- Keep the `useSSE(channel)` stub for backwards compatibility.

### Step 2: Implement Flash Message Hook
**File:** `apps/tui/src/hooks/useFlashMessage.ts` (New)
- Create a hook to manage flash message state with a 3-second auto-dismiss timer.
- Ensure all `setTimeout` calls are cleared on unmount to prevent memory leaks.
- **File:** `apps/tui/src/hooks/index.ts` - Export the hook and types.

### Step 3: Implement Flash Message Provider
**File:** `apps/tui/src/providers/FlashMessageProvider.tsx` (New)
- Create a context provider for flash messages using `useFlashMessage`.
- **File:** `apps/tui/src/providers/index.ts` - Export the provider.
- **File:** `apps/tui/src/index.tsx` - Insert `FlashMessageProvider` between `SSEProvider` and `NavigationProvider`.

## Phase 2: Signals & Reconnection

### Step 4: Add Process Resume Handler
**File:** `apps/tui/src/lib/signals.ts`
- Implement `onProcessResume` and a `SIGCONT` listener.
- This allows SSE connections to automatically recover immediately after a process is resumed from suspension (`Ctrl+Z`).

## Phase 3: UI Components

### Step 5: Create SSE Connection Indicator
**File:** `apps/tui/src/components/SSEConnectionIndicator.tsx` (New)
- Build a responsive component to display connection health.
- Read the terminal `breakpoint` from `useLayout()` to adjust text detail.
- Map statuses to frozen theme colors (`success`, `warning`, `error`, `muted`).
- **File:** `apps/tui/src/components/index.ts` - Export the component.

### Step 6: Update StatusBar
**File:** `apps/tui/src/components/StatusBar.tsx`
- Replace the hardcoded `"connected"` sync state with `<SSEConnectionIndicator />`, keeping a fallback if no workspace streams are active.
- Modify the left section to conditionally render the `flash` message from `useFlashMessageContext`, taking visual precedence over keybinding hints.

## Phase 4: Workspace Hooks

### Step 7: Workspace Flash Message Hook
**File:** `apps/tui/src/hooks/useWorkspaceStatusFlash.ts` (New)
- Map workspace statuses to flash message colors and format text dynamically based on the terminal `breakpoint`.
- **File:** `apps/tui/src/hooks/index.ts` - Export the hook.

### Step 8: Workspace Reconnect Hook
**File:** `apps/tui/src/hooks/useWorkspaceReconnect.ts` (New)
- Implement manual reconnect logic bound to the `R` key, with a 2-second debounce.
- *Research Adjustment:* Since `useScreenKeybindings` doesn't accept a `when` property or `ScreenName`, implement the `canReconnect` check directly inside the returned `handleReconnect` function to drop execution if unavailable.
- **File:** `apps/tui/src/hooks/index.ts` - Export the hook.

### Step 9: Workspace Telemetry Hook
**File:** `apps/tui/src/hooks/useWorkspaceSSETelemetry.ts` (New)
- Wrap connection state transitions and emit lifecycle telemetry using `emit` from `apps/tui/src/lib/telemetry.ts`.
- **File:** `apps/tui/src/hooks/index.ts` - Export the hook.

## Phase 5: Workspace Screens Integration

### Step 10: Wire Workspace Detail Screen
**File:** `apps/tui/src/screens/Workspaces/WorkspaceDetailScreen.tsx`
- Integrate `useWorkspaceStatusStream`.
- Register the stream state with `useSSEContext()`.
- Wire up `WorkspaceStatusBadge`, `useWorkspaceStatusFlash`, and `useWorkspaceReconnect`.
- Register the `R` keybinding via `useScreenKeybindings` using its current actual signature.

### Step 11: Wire Workspace List Screen
**File:** `apps/tui/src/screens/Workspaces/WorkspaceListScreen.tsx`
- Integrate `useWorkspaceListStatusStream`.
- Register the aggregate state using a synthetic `"__workspace_list__"` ID in `useSSEContext()`.
- Register the `R` keybinding via `useScreenKeybindings`.

### Step 12: Integrate Resume into SSE Hook
**File:** `apps/tui/src/hooks/useWorkspaceStatusStream.ts`
- Add a `useEffect` utilizing `onProcessResume` from `signals.ts` to trigger a REST `reconcile()` when the TUI process resumes.

## Phase 6: E2E Testing

### Step 13: Create Workspace E2E Tests
**File:** `e2e/tui/workspaces.test.ts`
- Build out full test coverage using ` @microsoft/tui-test`.
- Validate SSE Connection Lifecycle, Real-Time Status Updates, Reconnection logic, Connection Health Indicator, and Responsive Behavior.
- Include snapshot matching for key visual states (e.g., braille spinners, flash messages, 80x24 indicators).
- Respect the directive that tests failing due to unimplemented backends must remain failing (never skipped or commented out).
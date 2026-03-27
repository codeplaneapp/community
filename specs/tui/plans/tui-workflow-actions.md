# Engineering Implementation Plan: TUI Workflow Actions

## 1. Overview and Scope
This document outlines the step-by-step implementation of the cross-cutting workflow action system for the Codeplane TUI. The system supports three primary actions—`cancel`, `rerun`, and `resume`—accessible from two contexts:
1. **Workflow Run Detail Screen:** Uses a confirmation overlay for actions (`c`, `r`, `R`).
2. **Workflow Run List Screen:** Uses immediate, optimistic updates without an overlay (`c`, `r`, `m`).

## 2. Phase 1: Shared Action Hooks & State Management

### 2.1. `useRunActions.ts` (Overlay State Machine)
**Path:** `apps/tui/src/screens/Workflows/hooks/useRunActions.ts`
- **Purpose:** Manage the state machine for the confirmation overlay used in the detail screen.
- **Implementation:**
  - Export a helper function `isActionAvailable(action, status)`:
    - `cancel`: `running`, `queued`
    - `rerun`: `success`, `failure`, `cancelled`, `timeout`
    - `resume`: `cancelled`, `failure`
  - Manage local state: `pendingAction` (action type or null), `actionLoading` (boolean), `actionError` (string | null).
  - Wrap API hooks from `@codeplane/ui-core` (`useWorkflowRunCancel`, `useWorkflowRunRerun`, `useWorkflowRunResume`).
  - Implement handlers: `requestAction()`, `confirmAction()`, `dismissAction()`.
  - **Side-effects:** On `resume` success, call the `reconnect()` method on the SSE stream; on `rerun` success, navigate to the newly created run.
  - Dispatch telemetry events (`tui.workflow_action.initiated`, `.confirmed`, `.success`, etc.).

### 2.2. `useOptimisticRunAction.ts` (List Optimistic Updates)
**Path:** `apps/tui/src/screens/Workflows/hooks/useOptimisticRunAction.ts`
- **Purpose:** Manage immediate updates for list rows, skipping the confirmation overlay.
- **Implementation:**
  - Leverage `useOptimisticMutation`.
  - Maintain a local `useRef<boolean>` in-flight guard to prevent double execution.
  - **Optimistic Update:** Immediately transition the local state (e.g., change the status icon/color to `cancelled`).
  - **Success:** Maintain the state, trigger a silent list refetch, and show a 3s success flash message.
  - **Error:** Revert the list row to its previous state and show a 3s error flash message.

## 3. Phase 2: UI Components & Infrastructure

### 3.1. Flash Message System
**Path:** `apps/tui/src/providers/FlashMessageProvider.tsx` (New) or update `LoadingProvider.tsx`
- **Purpose:** The current `LoadingProvider` hardcodes a 5s error duration and doesn't handle success messages. The spec requires 3s auto-dismissing messages for both.
- **Implementation:**
  - Build a mechanism to render flash messages temporarily over the `StatusBar` keybinding hints.
  - Implement a hook `useFlashMessage()` exposing `showFlash(message, type: 'success' | 'error' | 'warning' | 'info')`.
  - Automatically clear the message and restore keybindings after 3000ms.
  - Handle rate limits (e.g., extracting the `Retry-After` header for 429s).

### 3.2. `ActionConfirmOverlay.tsx`
**Path:** `apps/tui/src/screens/Workflows/components/ActionConfirmOverlay.tsx`
- **Purpose:** A responsive confirmation modal component for destructive actions.
- **Implementation:**
  - Use `useTerminalDimensions` to adapt size:
    - Minimum (80x24): 90% width, compact layout.
    - Standard (120x40): 40% width.
    - Large (200x60): 35% width, expanded context (trigger ref, commit SHA).
  - Implement semantic coloring: `cancel` -> error (red), `rerun` -> primary (blue), `resume` -> success (green).
  - Trap focus using `useKeyboard` to allow `Tab`/`Shift+Tab` cycling between Confirm/Cancel buttons.
  - Integrate `useTimeline` to render an 80ms braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) when `isLoading` is true.

## 4. Phase 3: Screen Integration

### 4.1. `WorkflowRunDetailScreen.tsx`
**Path:** `apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx`
- **Implementation:**
  - Integrate `useRunActions` and render `ActionConfirmOverlay` when `pendingAction` is truthy.
  - Bind keys using `useScreenKeybindings`:
    - `c`: request cancel
    - `r`: request rerun
    - `R`: request resume
  - Use the `when` predicate to dynamically gate these keys based on the run's current status and user permissions.
  - **Edge case:** If an SSE status update invalidates the currently open overlay (e.g., a queued run finishes while the cancel overlay is open), auto-dismiss it and flash "Run state changed".

### 4.2. `WorkflowRunListScreen.tsx`
**Path:** `apps/tui/src/screens/Workflows/WorkflowRunListScreen.tsx`
- **Implementation:**
  - Integrate `useOptimisticRunAction` to apply updates to the currently focused row.
  - Bind keys using `useScreenKeybindings`:
    - `c`: optimistic cancel
    - `r`: optimistic rerun
    - `m`: optimistic resume (`m` is used instead of `R` to prevent conflicts with refresh).
  - Ensure status bar hints update dynamically as the user scrolls through the list (dimming unavailable actions).

## 5. Phase 4: Testing & E2E Validation

### 5.1. Test Suite (`workflows.test.ts`)
**Path:** `e2e/tui/workflows.test.ts`
- Implement the 129 tests prescribed by the spec using `@microsoft/tui-test`.
- **Snapshot Tests (30):** Validate the overlay UI across the 3 terminal dimensions (80x24, 120x40, 200x60) and verify flash message rendering.
- **Keyboard Interaction (48):** Test key bindings (`c`, `r`, `R`, `m`). Ensure `Tab`/`Shift+Tab` works in the overlay, and `Esc` dismisses it.
- **Integration Tests (22):** Mock API responses including 403 (Permission denied), 404 (Not found), 409 (Conflict/Invalid state), and 429 (Rate limited). Validate optimistic reverts.
- **Responsive & Edge Cases (29):** Test layout recalculations on resize, extremely long workflow names, rapid key inputs, and SSE updates arriving during active overlays.
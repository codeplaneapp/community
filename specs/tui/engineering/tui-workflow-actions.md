# Engineering Specification: TUI Workflow Actions

## 1. Overview
This specification details the implementation of the cross-cutting workflow action system for the Codeplane TUI. The system supports three primary actions: `cancel`, `rerun`, and `resume`, which are accessible from both the Workflow Run Detail and Workflow Run List screens. The implementation involves distinct interaction models (confirmation overlays vs. immediate optimistic updates) based on the screen context, and must respect state gating, user permissions, rate limits, and terminal size constraints.

## 2. Architecture & Components

### 2.1 Action Confirmation Overlay (`<ActionConfirmationOverlay>`)
A reusable modal component used on the Run Detail screen to confirm destructive/state-changing actions before execution.
- **Props**: `action` ("cancel" | "rerun" | "resume"), `runId` (number), `workflowName` (string), `onConfirm` (function), `onDismiss` (function), `isLoading` (boolean), `error` (string | null).
- **Layout**: Uses OpenTUI's absolute positioning to center. Adapts width/height based on breakpoints (`useTerminalDimensions`).
- **Focus**: Traps focus between "Confirm" and "Cancel" buttons using `Tab`/`Shift+Tab`.
- **Loading State**: Swaps "Confirm" text with animated spinner (`useTimeline`).

### 2.2 Optimistic Action Hook (`useOptimisticAction`)
A custom hook for the Run List screen to provide immediate visual feedback.
- Intercepts action intent, validates against current state.
- Updates local state optimistically (e.g., changes run status icon).
- Dispatches API call in the background.
- On success: Retains state and triggers a silent data refresh.
- On failure: Reverts state and shows an error flash message in the status bar.

### 2.3 Status Bar Integration
- **Keybinding Hints**: Conditionally renders hints (`c:cancel`, `r:rerun`, `R:resume`/`m:resume`) based on current run state and user permissions. Read-only hints are dimmed (ANSI 245).
- **Flash Messages**: A system to temporarily replace keybinding hints with success/error/info messages (e.g., "✓ Run #42 cancelled", "⚠ Rate limited"). Auto-dismisses after 3 seconds.

### 2.4 Hooks and Data Access
- **API Hooks**: Consume `@codeplane/ui-core` hooks:
  - `useWorkflowRunCancel(repo, runId)`
  - `useWorkflowRunRerun(repo, runId)`
  - `useWorkflowRunResume(repo, runId)`
- **Event Listeners**: Register global keyboard shortcuts within the context of the run list/detail screens via `useScreenKeybindings`.

## 3. Implementation Plan

### Step 1: Core Action Hook & API Integration
1. Update `@codeplane/ui-core` hooks (if not already existing) to ensure `useWorkflowRunCancel`, `useWorkflowRunRerun`, and `useWorkflowRunResume` are available.
2. Implement the `useOptimisticAction` hook in `apps/tui/src/hooks/useOptimisticAction.ts` to manage state transitions, API calls, error handling, and rollback for list-view actions.

### Step 2: Shared UI Components
1. Create `ActionConfirmationOverlay` component in `apps/tui/src/components/ActionConfirmationOverlay.tsx`.
   - Implement focus trapping and keyboard navigation (`Tab`, `Shift+Tab`, `Enter`, `Esc`).
   - Implement responsive sizing logic based on terminal breakpoints (80x24 vs 120x40 vs 200x60).
   - Add spinner animation using `useTimeline`.
2. Enhance `StatusBar` in `apps/tui/src/components/AppShell/StatusBar.tsx` to support temporary flash messages with semantic coloring and 3-second auto-dismiss.

### Step 3: Run Detail Screen Integration
1. In `apps/tui/src/screens/WorkflowRunDetailScreen.tsx`:
   - Add state for tracking the currently open overlay (`activeAction: "cancel" | "rerun" | "resume" | null`).
   - Integrate `ActionConfirmationOverlay`.
   - Add `useScreenKeybindings` for `c`, `r`, `R`. Include state-gating logic (e.g., `c` only valid if `running` | `queued`).
   - Implement API success handlers (e.g., navigate to new run ID on rerun, close SSE on cancel, reconnect SSE on resume).
   - Add telemetry event dispatches for initiation, success, failure.

### Step 4: Run List Screen Integration
1. In `apps/tui/src/screens/WorkflowRunListScreen.tsx`:
   - Integrate `useOptimisticAction` for list rows.
   - Add `useScreenKeybindings` for `c`, `r`, `m` corresponding to the currently focused row.
   - Handle immediate optimistic UI updates (e.g., swapping `◎` to `✕` for cancel).
   - Implement state reversion and flash message display on API failure.
   - Trigger silent refetch of the list on API success.

### Step 5: State Gating & Permissions
1. Inject the user's role from `AuthProvider` into the keybinding hint logic.
2. Ensure invalid state or insufficient permission immediately triggers a flash message ("Permission denied", "Run is not active") without making API calls or opening overlays.

## 4. Unit & Integration Tests

### 4.1 Implementation of `e2e/tui/workflows.test.ts`
Implement the 129 tests defined in the Product Spec using `@microsoft/tui-test`. 

**Terminal Snapshot Tests (30 tests):**
- SNAP-WA-001 to SNAP-WA-030 covering all sizes, states, and error messages for overlays and status bars.

**Keyboard Interaction Tests (48 tests):**
- KEY-WA-001 to KEY-WA-048 verifying precise key-to-action mappings. Example:
  - Test that `c` opens cancel overlay on a running run.
  - Test that `Tab` cycles focus in the overlay.
  - Test that optimistic cancel updates list row immediately.

**Responsive Tests (14 tests):**
- RESP-WA-001 to RESP-WA-014 verifying correct layout adaptations when `useTerminalDimensions` values change (e.g., overlay shrinking, hints abbreviating).

**Integration Tests (22 tests):**
- INT-WA-001 to INT-WA-022 validating integration with the mocked API server.
  - Verify 403, 404, 409, 429 responses correctly update UI.
  - Verify navigation on successful rerun.
  - Verify SSE reconnection on resume.

**Edge Case Tests (15 tests):**
- EDGE-WA-001 to EDGE-WA-015 covering boundary conditions like:
  - Rapid key presses (debouncing/ignoring).
  - SSE state updates occurring while an overlay is open.
  - Concurrent action attempts.
  - Long workflow names truncating properly with emojis.

### 4.2 Unit Tests for Hooks/Components
- `useOptimisticAction.test.ts`: Verify state machine correctly tracks `idle -> in_flight -> success | error`, correctly invokes callbacks, and triggers state reversions.
- `ActionConfirmationOverlay.test.tsx`: Test internal state logic independent of TUI runner (e.g., verify focus cycling).

## 5. Security & Observability Considerations
- **Permissions**: Enforce client-side role checks before rendering active hints; server remains the authoritative enforcer. 
- **Rate Limiting**: Handle HTTP 429 elegantly by extracting `Retry-After` header and displaying in the flash message.
- **Telemetry**: Hook up analytics for `tui.workflow_action.initiated`, `tui.workflow_action.confirmed`, `tui.workflow_action.success`, `tui.workflow_action.failure`, etc., capturing terminal size and execution contexts.
- **Logging**: Emit robust `debug`, `info`, `warn`, and `error` logs to stderr for action lifecycle tracking.
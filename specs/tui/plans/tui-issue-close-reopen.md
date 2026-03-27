# Implementation Plan: TUI Issue Close/Reopen (tui-issue-close-reopen)

This implementation plan details the steps required to add single-key close/reopen toggle functionality with optimistic updates, bulk operations, and error handling to the Codeplane TUI.

## Step 1: Create Shared Utility Functions

**File:** `apps/tui/src/util/issue-status-messages.ts`

1.  **Extract Status Bar Formatting**: Implement `formatCloseReopenSuccess` and `formatCloseReopenError` functions to adapt success and error messages based on terminal width as outlined in the spec.
2.  **HTTP Status to Reason**: Implement the `httpStatusToReason` function to translate raw HTTP status codes (like 403, 404, 422, 429) into human-readable strings, supporting optional `retryAfterSeconds`.
3.  **Dependencies**: Use the existing `truncateText` utility from `apps/tui/src/util/text.ts` for capping string lengths.

## Step 2: Implement Status Bar Message Hook

**File:** `apps/tui/src/hooks/useCloseReopenStatusBar.ts`

1.  **State Management**: Create a hook `useCloseReopenStatusBar` that uses `useState` to track the current `message` (text and color) and a `useRef` to manage the timeout timer.
2.  **`showMessage` Callback**: Implement the `showMessage` function to cap text length using `useLayout().width` and manage a timed auto-clear using `setTimeout`.
3.  **Hint Label Logic**: Implement `getHintLabel(currentState, isInFlight)` to return contextual keybinding hints (e.g., `x:close`, `x:reopen`, `x:closing…`).

## Step 3: Implement Core Lifecycle Hook

**File:** `apps/tui/src/hooks/useIssueCloseReopen.ts`

1.  **Error Classification**: Implement `classifyError` utility inside the file to parse error responses, handle raw `Response` objects from `@codeplane/ui-core`, extract `Retry-After` headers, and map them to `CloseReopenError` objects.
2.  **State and Refs**: Setup `isInFlightRef`, `inFlightIssueRef`, `lastFailedRef`, `consecutiveFailuresRef`, and `lastError` state.
3.  **Execute Toggle**: Implement `executeToggle` with:
    *   In-flight guard check.
    *   Optimistic state application (calling `onOptimistic` and `loading.registerMutation`).
    *   10-second timeout to handle network drops (calls `onRevert`, sets `timeout` error, and clears state).
    *   Mutation execution (`mutate`), clearing timeout on resolution.
    *   Success handling (calls `onSuccess`, clears errors, logs info, emits telemetry, shows status message).
    *   Error handling (classifies error, tracks consecutive failures, reverts state via `onRevert`, logs warnings, emits telemetry, shows error status message).
4.  **Retry Function**: Implement `retry` to replay the last failed mutation using `lastFailedRef`.

## Step 4: Implement Bulk Close/Reopen Hook

**File:** `apps/tui/src/hooks/useBulkIssueCloseReopen.ts`

1.  **Bulk Execution**: Create `useBulkIssueCloseReopen` accepting `owner`, `repo`, and the `toggle` function from `useIssueCloseReopen`.
2.  **Confirmation Overlay**: Use `useOverlay().showConfirm` to prompt the user if more than 5 issues are selected.
3.  **Sequential Processing**: Loop over selected issues and invoke `toggle` sequentially with a small delay (~200ms) to respect rate limits, managing an `isExecutingRef` to block concurrent runs.

## Step 5: Integrate into Issue List Screen

**File:** `apps/tui/src/screens/Issues/IssueListScreen.tsx`

1.  **Setup Hooks**: Initialize `useCloseReopenStatusBar`, `useUpdateIssue`, and `useIssueCloseReopen`.
2.  **Manage Optimistic State**: Add `optimisticOverrides` (Map) and `optimisticCountDelta` state variables.
    *   *onOptimistic*: Set override map and calculate delta based on active `stateFilter`.
    *   *onRevert* / *onSuccess*: Clear override map and reset delta.
3.  **Resolve Effective State**: Create a `resolveIssueState` helper to prefer the optimistic override over the server state.
4.  **Keybindings**: Add `x` (close/reopen/bulk) and `R` (retry) to `useScreenKeybindings`.
5.  **Render Updates**: Update the state icon color (`●`) based on `resolveIssueState(issue)` and update the list header count with `totalCount + optimisticCountDelta`.

## Step 6: Integrate into Issue Detail Screen

**File:** `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`

1.  **Setup Hooks**: Initialize `useCloseReopenStatusBar`, `useUpdateIssue`, and `useIssueCloseReopen`.
2.  **Manage Optimistic State**: Add `optimisticState` and `optimisticTimelineEvent` state variables.
    *   *onOptimistic*: Set new state and create a fake timeline event payload using the current user's login.
    *   *onRevert* / *onSuccess*: Clear optimistic state and timeline event.
3.  **Resolve Effective State**: Calculate `effectiveState = optimisticState ?? issue?.state ?? "open"`.
4.  **Keybindings**: Add `o` (close/reopen) and `R` (retry) to `useScreenKeybindings`.
5.  **Render Updates**: Update the state badge (`[open]` / `[closed]`), handle `closed_at` formatting ("closed just now"), and conditionally append the `optimisticTimelineEvent` to the timeline container.

## Step 7: Testing

**File:** `e2e/tui/issue-status-messages.test.ts`

1.  **Unit Tests**: Implement the 13 unit tests outlined in the spec for `formatCloseReopenSuccess`, `formatCloseReopenError`, and `httpStatusToReason` ensuring exact terminal width truncation and fallback logic.

**File:** `e2e/tui/issues.test.ts`

1.  **Snapshot Tests**: Add `SNAP-CLOSE-001` through `SNAP-CLOSE-012` verifying list updates, detail updates, state icon color changes, timeline events, and responsive truncation.
2.  **Keyboard Interaction Tests**: Add `KEY-CLOSE-001` through `KEY-CLOSE-015` testing happy paths, optimistic updates, count decrements, double-press guards, and the `R` retry key.
3.  **Error Handling Tests**: Add `ERR-CLOSE-001` through `ERR-CLOSE-008` mocking/asserting HTTP 403, 404, 429, timeouts, and ensuring error states revert the optimistic UI.
4.  **Responsive & Integration Tests**: Add `RESP-CLOSE-001` to `RESP-CLOSE-005` and `INT-CLOSE-001` to `INT-CLOSE-010` testing resize events during mutations and cross-screen state persistence.
# Implementation Plan: TUI Workflow SSE Hooks

**Ticket**: `tui-workflow-sse-hooks`

This document outlines the step-by-step implementation plan for adding Server-Sent Events (SSE) streaming hooks for workflow logs and run statuses in the Codeplane TUI. It covers core logic in `@codeplane/ui-core`, TUI wrappers in `apps/tui/src/hooks`, and End-to-End (E2E) tests.

## 1. Setup & Bookmark

1. Check out the latest main branch.
2. Create a new jj bookmark for this work:
   ```bash
   jj bookmark create tui-workflow-sse-hooks
   ```

## 2. Define Types

**Target File**: `apps/tui/src/hooks/workflow-stream-types.ts`

Create a pure types file encapsulating the SSE event shapes, connection states, and hook return signatures.

*   **Event Types**: `LogLine`, `StatusEvent`, `DoneEvent`, `WorkflowLogStreamEvent`, `WorkflowRunSSEEvent`.
*   **Connection State**: `WorkflowStreamConnectionState`, `ConnectionHealth`.
*   **Hook States**: `WorkflowLogStreamState`, `StepState`, `WorkflowRunSSEState`.
*   **Constants**: Export `VIRTUAL_SCROLL_WINDOW = 10_000`.

## 3. Implement Core Logic in `@codeplane/ui-core`

### 3.1 Core Hook: `useWorkflowLogStream`

**Target File**: `packages/ui-core/src/hooks/workflows/useWorkflowLogStream.ts`

Implement the framework-agnostic core logic for streaming workflow logs. Model the structure heavily after `useAgentStream`.

*   **Refs**: Use `useRef` for tracking `abortController`, `backoff`, `keepaliveTimer`, `seenLogIds`, `seenLogIdsOrder`, and `pendingLogs` (for batching).
*   **Reactive State**: Track `logs`, `steps`, `runStatus`, `connectionState`, `lastEventId` via `useState`.
*   **Event Loop**:
    *   Fetch SSE ticket via `getSSETicket` (fallback to Bearer).
    *   Connect via `createSSEReader` to `/api/repos/:owner/:repo/runs/:id/logs`.
    *   Parse text events, mapping to `log`, `status`, `done`, or `error`.
*   **Log Processing**:
    *   Push new logs to `pendingLogs` ref.
    *   Deduplicate using `seenLogIds` (Drop lines with duplicate `log_id`).
    *   Prune `seenLogIds` if it exceeds 50,000 entries.
*   **Batch Flushing & Memory Limit**:
    *   Flush logs every 100 lines or 200ms.
    *   Limit `logs` map to `VIRTUAL_SCROLL_WINDOW` per `step_id` using a FIFO shift.
*   **Lifecycle & Backoff**:
    *   Implement exponential backoff (max 30s) and a max of 20 attempts.
    *   Implement 45s keepalive timeout (auto-reconnect if no events or `":"` comments arrive).

### 3.2 Core Hook: `useWorkflowRunSSE`

**Target File**: `packages/ui-core/src/hooks/workflows/useWorkflowRunSSE.ts`

Implement a lightweight multi-run status listener.

*   **Target URL**: `/api/repos/:owner/:repo/runs/status?run_ids=X,Y,Z`.
*   **Reconnection**: Auto-reconnect when the `runIds` dependency array changes.
*   **Auto-Disconnect**: Scan `runStatuses` on every event. If all tracked `runIds` have statuses within `TERMINAL_STATUSES`, terminate the connection and set status to `"completed"`.
*   No log line parsing, flushing, or FIFO limits are required.

### 3.3 Core Barrels

**Target File**: `packages/ui-core/src/hooks/workflows/index.ts`

*   Export `useWorkflowLogStream` and `useWorkflowRunSSE`.

## 4. Implement TUI Wrappers

### 4.1 Log Stream Wrapper

**Target File**: `apps/tui/src/hooks/useWorkflowLogStream.ts`

*   Import `useWorkflowLogStream` from `@codeplane/ui-core`.
*   Import `useSpinner` from `./useSpinner.js`.
*   Pass the `owner`, `repo`, `runId`, and `options`.
*   Compute `isStreaming = connectionHealth.state === "connected" || connectionHealth.state === "reconnecting"`.
*   Return the stream object spread with `spinnerFrame: useSpinner(isStreaming)` wrapped in `useMemo`.

### 4.2 Run SSE Wrapper

**Target File**: `apps/tui/src/hooks/useWorkflowRunSSE.ts`

*   Re-export `useWorkflowRunSSE` directly from `@codeplane/ui-core/hooks/workflows`.

### 4.3 TUI Barrels

**Target File**: `apps/tui/src/hooks/index.ts`

*   Export the new TUI wrappers and all types from `workflow-stream-types.ts`.

## 5. E2E Test Implementation

### 5.1 Test Helpers

**Target File**: `e2e/tui/helpers/workflows.ts`

*   Add `navigateToWorkflowRunDetail(terminal, runIndex)`.
*   Add `waitForLogStreaming(terminal, timeoutMs)`.
*   Add `createSSEInjectFile(dir)` to mock real-time events locally if needed.
*   Ensure exports are added to `e2e/tui/helpers/index.ts`.

### 5.2 End-to-End Tests

**Target File**: `e2e/tui/workflow-sse.test.ts`

Create a new test file covering the spec's requirement matrix:

*   **`useWorkflowLogStream` - Connection**: Verify spinner shows on connection (HOOK-WFSS-001), doesn't show on terminal runs (HOOK-WFSS-002), and correctly displays connection health (HOOK-WFSS-003).
*   **`useWorkflowLogStream` - Logs**: Test incremental rendering (HOOK-WFSS-010), ANSI color code passthrough (HOOK-WFSS-011), deduplication (HOOK-WFSS-013), and memory bounding (HOOK-WFVS-001).
*   **`useWorkflowLogStream` - Status**: Test step status indicator inline updates (HOOK-WFSS-020) and terminal state disconnects (HOOK-WFSS-022).
*   **`useWorkflowLogStream` - Reconnect & Auth**: Check manual reconnection behavior (HOOK-WFSS-032), Bearer auth fallback (HOOK-WFSS-AUTH-002), and Reconnect states (HOOK-WFSS-030/031).
*   **`useWorkflowRunSSE`**: Test multi-run state inline updates (HOOK-WFRSSE-001/002), auto-disconnect (HOOK-WFRSSE-003), and query param adjustments on pagination (HOOK-WFRSSE-004).

## 6. Review and Commit

1. Verify memory limits (FIFO eviction at 10k lines) and `AbortController` unmount cleanups.
2. Run E2E tests: `bun test e2e/tui/workflow-sse.test.ts` (Ensure they fail gracefully as the backend is unimplemented, capturing snapshots properly).
3. Review code against the OpenTUI constraints and verify correct path usage.
4. Commit the changes to the JJ bookmark.
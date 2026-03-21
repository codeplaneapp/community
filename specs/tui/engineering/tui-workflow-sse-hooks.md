# Engineering Specification: `tui-workflow-sse-hooks`

## Implement workflow SSE streaming hooks for log streaming and run status events

**Ticket:** `tui-workflow-sse-hooks`
**Type:** Engineering
**Dependencies:** `tui-theme-provider`, `tui-workflow-data-hooks`
**Target Directory:** `apps/tui/src/`
**Test Directory:** `e2e/tui/`
**Feature Flag:** `TUI_WORKFLOW_LOG_STREAM` (from `TUI_WORKFLOWS` group in `specs/tui/features.ts`)

---

## 1. Overview

This ticket implements two SSE streaming hooks for real-time workflow data:

1. **`useWorkflowLogStream`** — Connects to the log streaming endpoint for a single workflow run, providing incremental log lines, step status updates, and run completion events.
2. **`useWorkflowRunSSE`** — A lighter SSE hook for the run list screen, listening for status transitions across multiple runs simultaneously.

Both hooks follow the proven SSE patterns established by `useAgentStream` in `@codeplane/ui-core` (see `packages/ui-core/src/hooks/agents/useAgentStream.ts`) and directly manage their own `createSSEReader` connections — they do **not** multiplex through `SSEProvider`.

---

## 2. Architecture Context

### 2.1 Existing SSE Infrastructure

The codebase already provides:

| Component | Location | Role |
|-----------|----------|------|
| `getSSETicket()` | `packages/ui-core/src/sse/getSSETicket.ts` | Exchanges auth token for short-lived SSE ticket via `POST /api/auth/sse-ticket`. Returns `SSETicket \| null`. Uses `client.request()` internally. Returns `null` on any error for graceful degradation. |
| `createSSEReader()` | `packages/ui-core/src/sse/createSSEReader.ts` | Fetch-based SSE connection using `eventsource-parser`'s `createParser`. Supports custom headers, `AbortSignal`, `Last-Event-ID` header. Returns `Promise<void>` (callbacks drive the interface). |
| `SSEProvider` | `apps/tui/src/providers/SSEProvider.tsx` | React context with channel-based subscribe/dispatch and test-mode file injection via `CODEPLANE_SSE_INJECT_FILE`. **Not used by per-endpoint hooks.** |
| `useAgentStream()` | `packages/ui-core/src/hooks/agents/useAgentStream.ts` | Reference implementation of a per-endpoint SSE hook with reconnection, keepalive, deduplication via monotonic position counter. |
| TUI `useAgentStream()` | `apps/tui/src/hooks/useAgentStream.ts` | Thin TUI wrapper adding braille spinner animation via `useSpinner()`. |

### 2.2 Existing Workflow Data Hooks (from `tui-workflow-data-hooks`)

| Hook | Location | Role |
|------|----------|------|
| `useWorkflowDefinitions()` | `apps/tui/src/hooks/useWorkflowDefinitions.ts` | Paginated workflow definition list |
| `useWorkflowRuns()` | `apps/tui/src/hooks/useWorkflowRuns.ts` | Paginated run list with `WorkflowRunFilters` |
| `useWorkflowRunDetail()` | `apps/tui/src/hooks/useWorkflowRunDetail.ts` | Single run detail with nodes |
| `workflow-types.ts` | `apps/tui/src/hooks/workflow-types.ts` | Domain types: `WorkflowRun`, `WorkflowRunNode`, `WorkflowRunStatus`, `TERMINAL_STATUSES`, `RepoIdentifier` |

### 2.3 Design Pattern: Per-Endpoint SSE Hooks

This ticket follows the same pattern as `useAgentStream` — each hook manages its own SSE connection lifecycle directly via `createSSEReader()` rather than multiplexing through `SSEProvider`. This is because:

- Workflow log streams are endpoint-specific (`GET /api/repos/:owner/:repo/runs/:id/logs`), not a shared global channel
- The run status SSE endpoint accepts multiple run IDs as query parameters
- Connection lifecycle is tightly coupled to component mount/unmount
- This matches the proven architecture of `useAgentStream` which also directly manages its own `createSSEReader` connection

### 2.4 Key Differences from `useAgentStream` Reference

| Aspect | `useAgentStream` | `useWorkflowLogStream` | `useWorkflowRunSSE` |
|--------|-----------------|----------------------|--------------------|
| Dedup mechanism | Monotonic `positionRef` counter | `Set<string>` of `log_id` values with LRU pruning | Idempotent status overwrites (no dedup needed) |
| Replay mechanism | Fetches `/messages` endpoint and diffs content | Uses `Last-Event-ID` header — server replays from cursor | Uses `Last-Event-ID` header |
| Event types | `token`, `done`, `error` | `log`, `status`, `done`, `error`, `keep-alive` | `status`, `done`, `error`, `keep-alive` |
| State accumulation | Single string (`currentTokens`) | `Map<stepId, LogLine[]>` + `Map<stepId, StepState>` | `Map<runId, WorkflowRunStatus>` |
| Batching | None (per-token setState) | Flush every 100 lines or 200ms | None (status events are infrequent) |
| Memory cap | Unbounded | 10,000 lines/step FIFO + 50,000 dedup set | None needed |
| Subscribe model | Manual `subscribe(sessionId)` / `unsubscribe()` | Auto-connect on mount when `enabled && runId` | Auto-connect; reconnects on `runIds` change |
| Auth | `getSSETicket` → ticket URL param \| bearer fallback | Same | Same |

---

## 3. Types

### File: `apps/tui/src/hooks/workflow-stream-types.ts`

This file exists and contains all necessary type definitions. No changes required. Key types:

```typescript
// SSE Event Payloads
interface LogLine {
  log_id: string;           // Unique ID for deduplication
  step_id: string;          // Which step emitted this line
  timestamp: string;        // ISO-8601
  content: string;          // Raw log text (may contain ANSI escape codes)
  stream: "stdout" | "stderr";
}

interface StatusEvent {
  run_id: number;
  run_status: WorkflowRunStatus;
  step_id?: string;
  step_status?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

interface DoneEvent {
  run_id: number;
  final_status: WorkflowRunStatus;
  completed_at: string;
}

// Union types for discriminated dispatch
type WorkflowLogStreamEvent =
  | { type: "log"; data: LogLine }
  | { type: "status"; data: StatusEvent }
  | { type: "done"; data: DoneEvent }
  | { type: "error"; data: { message: string } };

type WorkflowRunSSEEvent =
  | { type: "status"; data: StatusEvent }
  | { type: "done"; data: DoneEvent }
  | { type: "error"; data: { message: string } };

// Connection state machine
type WorkflowStreamConnectionState =
  | "idle" | "connecting" | "connected" | "reconnecting"
  | "completed" | "errored" | "failed";

interface ConnectionHealth {
  state: WorkflowStreamConnectionState;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  lastConnectedAt: string | null;
  lastError: Error | null;
}

// Hook return types
interface WorkflowLogStreamState {
  logs: Map<string, LogLine[]>;      // step_id → LogLine[], capped at VIRTUAL_SCROLL_WINDOW
  steps: Map<string, StepState>;     // step_id → status metadata
  runStatus: WorkflowRunStatus | null;
  connectionHealth: ConnectionHealth;
  reconnect: () => void;
  lastEventId: string | null;
  spinnerFrame: string;              // TUI-only: braille animation frame
}

interface StepState {
  step_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  log_count: number;
}

interface WorkflowRunSSEState {
  runStatuses: Map<number, WorkflowRunStatus>;
  connectionHealth: ConnectionHealth;
  reconnect: () => void;
}

const VIRTUAL_SCROLL_WINDOW = 10_000;
```

---

## 4. Implementation Plan

### Step 1: Verify type definitions exist

**File:** `apps/tui/src/hooks/workflow-stream-types.ts`

**Status:** ✅ Already exists (116 lines). Pure types with one constant (`VIRTUAL_SCROLL_WINDOW`). No changes needed.

### Step 2: Implement `useWorkflowLogStream` core hook in `@codeplane/ui-core`

**File:** `packages/ui-core/src/hooks/workflows/useWorkflowLogStream.ts`

**Status:** ✅ Already exists (383 lines). Full implementation present.

This hook manages the SSE connection for a single workflow run's log stream. It mirrors the architecture of `useAgentStream` with the following key implementation details:

#### 2.1 Constants

```typescript
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 20;
const KEEPALIVE_TIMEOUT_MS = 45_000;
const DEDUP_SET_MAX = 50_000;
const DEDUP_SET_PRUNE_TARGET = 25_000;
const FLUSH_BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 200;
const VIRTUAL_SCROLL_WINDOW = 10_000;
```

#### 2.2 Signature

```typescript
export interface WorkflowLogStreamOptions {
  enabled?: boolean;
  onLog?: (line: LogLine) => void;
  onStatusChange?: (event: StatusEvent) => void;
  onDone?: (event: DoneEvent) => void;
  onError?: (error: Error) => void;
}

export function useWorkflowLogStream(
  owner: string,
  repo: string,
  runId: number,
  options?: WorkflowLogStreamOptions,
): Omit<WorkflowLogStreamState, "spinnerFrame">;
```

Note: The core hook returns `Omit<WorkflowLogStreamState, "spinnerFrame">` — the TUI wrapper adds `spinnerFrame`.

#### 2.3 Refs (non-reactive mutable state)

| Ref | Type | Purpose |
|-----|------|--------|
| `isMounted` | `boolean` | Guard against state updates after unmount |
| `abortControllerRef` | `AbortController \| null` | Abort current SSE connection |
| `backoffRef` | `number` | Current backoff delay in ms |
| `reconnectAttemptsRef` | `number` | Consecutive failed reconnect count |
| `keepaliveTimerRef` | `ReturnType<typeof setTimeout> \| null` | 45s dead-connection detector |
| `backoffTimerRef` | `ReturnType<typeof setTimeout> \| null` | Scheduled reconnect delay |
| `lastEventIdRef` | `string \| null` | Most recent SSE event ID for reconnect replay |
| `logsRef` | `Map<string, LogLine[]>` | Mutable log storage (flushed to state periodically) |
| `seenLogIdsRef` | `Set<string>` | Dedup set for log_id values |
| `seenLogIdsOrderRef` | `string[]` | Insertion-order tracking for dedup set pruning |
| `pendingLogsRef` | `LogLine[]` | Batch buffer for flush optimization |
| `flushTimerRef` | `ReturnType<typeof setTimeout> \| null` | Periodic flush timer |
| `optionsRef` | `Options` | Fresh options ref for callbacks (updated via useEffect) |
| `lastConnectedAtRef` | `string \| null` | ISO timestamp of last successful connection |

#### 2.4 Reactive state (triggers re-render)

| State | Type | Initial |
|-------|------|--------|
| `logs` | `Map<string, LogLine[]>` | `new Map()` |
| `steps` | `Map<string, StepState>` | `new Map()` |
| `runStatus` | `WorkflowRunStatus \| null` | `null` |
| `connectionState` | `WorkflowStreamConnectionState` | `"idle"` |
| `error` | `Error \| null` | `null` |
| `lastEventId` | `string \| null` | `null` |

#### 2.5 Connection lifecycle

```
Mount (enabled=true, runId truthy)
  → POST /api/auth/sse-ticket (via getSSETicket, returns null on failure)
  → Build URL: /api/repos/{owner}/{repo}/runs/{runId}/logs
  → If ticket: append ?ticket= query param
  → Else: set Authorization: Bearer header via client.getToken()
  → Open createSSEReader() with lastEventId from ref
  → onOpen: set state="connected", reset backoff to 1s, reset attempts to 0, start keepalive timer
  → onEvent: reset keepalive timer, parse JSON, dispatch by event.event field
  → onError: clear keepalive, initiate reconnection (if not aborted)
  → onClose: clear keepalive, initiate reconnection (if not aborted)
  → On unmount: abort AbortController, clear all timers
```

#### 2.6 Event processing

**`processLogEvent(data: LogLine)`:**
1. Check `seenLogIdsRef` for duplicate `log_id` — if seen, silently return
2. Add to dedup set and order tracking array
3. If dedup set exceeds 50,000: prune oldest 25,000 entries from both set and order array
4. Call `queueLogLine()` to add to pending batch
5. Fire `onLog` callback from optionsRef

**`processStatusEvent(data: StatusEvent)`:**
1. Update `runStatus` state with `data.run_status`
2. If `step_id` and `step_status` present: update `steps` Map (merge with existing StepState, preserving earlier timestamps)
3. Fire `onStatusChange` callback

**`processDoneEvent(data: DoneEvent)`:**
1. Set `runStatus` to `data.final_status`
2. Set `connectionState` to `"completed"`
3. Clear keepalive timer
4. Abort current connection
5. Fire `onDone` callback

**`keep-alive` events:** Silently ignored (keepalive timer reset happens before event type dispatch).

**Malformed JSON:** `JSON.parse` wrapped in try/catch — malformed events silently dropped.

**Unknown event types:** Default case is a no-op (forward compatibility).

#### 2.7 Flush batching

Log lines are accumulated in `pendingLogsRef` and flushed to React state in batches to avoid re-render storms:

```typescript
function queueLogLine(line: LogLine) {
  pendingLogsRef.current.push(line);
  if (pendingLogsRef.current.length >= FLUSH_BATCH_SIZE) {  // 100 lines
    flushLogs();
  } else if (!flushTimerRef.current) {
    flushTimerRef.current = setTimeout(flushLogs, FLUSH_INTERVAL_MS);  // 200ms
  }
}

function flushLogs() {
  // Clear timer
  // Take pending batch, reset to []
  // Create new Map from logsRef.current
  // For each line: spread existing step array, push line, FIFO evict while > 10,000
  // Update logsRef.current, call setLogs() if mounted
}
```

**Important implementation detail:** The flush creates new arrays per step via spread (`[...(nextLogs.get(line.step_id) ?? [])]`) to ensure React detects the change. Inner arrays are copied only for modified steps.

#### 2.8 FIFO eviction

Each step's log array is capped at `VIRTUAL_SCROLL_WINDOW` (10,000 lines):
```typescript
while (stepLines.length > VIRTUAL_SCROLL_WINDOW) {
  stepLines.shift();
}
```

#### 2.9 Dedup set pruning

When `seenLogIdsRef.size` exceeds 50,000:
1. Splice first 25,000 entries from `seenLogIdsOrderRef`
2. Delete them from `seenLogIdsRef`

O(n) but runs infrequently. Prevents unbounded memory growth during very long runs.

#### 2.10 Reconnection with exponential backoff

```typescript
function initiateReconnection() {
  if (attempts >= MAX_RECONNECT_ATTEMPTS) {
    setConnectionState("failed");
    setError(new Error("Max reconnection attempts reached"));
    return;
  }
  setConnectionState("reconnecting");
  attempts += 1;
  const delay = backoffRef.current;
  schedule connectToStream(true) after delay;
  backoffRef.current = min(delay * 2, 30_000);
}
```

On successful reconnect (`onOpen`): reset backoff to 1s and attempts to 0.

#### 2.11 Keepalive timeout

Server sends keep-alive comments every 15s. Client resets a 45s timer on every received event (including keep-alive). If timer fires: abort connection, initiate reconnection.

#### 2.12 `Last-Event-ID` on reconnect

The `lastEventIdRef` is updated on every event that carries an `id` field. On reconnect, it's passed to `createSSEReader` which sets the `Last-Event-ID` header. The server replays events from that cursor.

#### 2.13 Unmount cleanup

Two `useEffect` hooks handle cleanup:

1. **Auto-connect effect** (depends on `enabled`, `owner`, `repo`, `runId`): Cleanup aborts controller, clears keepalive and backoff timers.
2. **Mount lifecycle effect** (deps: `[]`): Sets `isMounted.current = false`, clears flush timer, and performs a final synchronous flush of any pending logs to `logsRef` (not to state, since unmounted).

#### 2.14 Public `reconnect()` method

Manually trigger reconnection: aborts current connection, resets attempt counter and backoff to initial values, calls `connectToStream(false)`.

#### 2.15 `connectionHealth` derivation

Memoized via `useMemo` from `connectionState` and `error` reactive state, plus current values from refs (`reconnectAttemptsRef.current`, `lastConnectedAtRef.current`).

### Step 3: Implement `useWorkflowRunSSE` core hook in `@codeplane/ui-core`

**File:** `packages/ui-core/src/hooks/workflows/useWorkflowRunSSE.ts`

**Status:** ✅ Already exists (312 lines). Full implementation present.

#### 3.1 Signature

```typescript
export interface WorkflowRunSSEOptions {
  enabled?: boolean;
  onStatusChange?: (runId: number, status: WorkflowRunStatus) => void;
  onDone?: (runId: number, status: WorkflowRunStatus) => void;
}

export function useWorkflowRunSSE(
  owner: string,
  repo: string,
  runIds: number[],
  options?: WorkflowRunSSEOptions,
): WorkflowRunSSEState;
```

#### 3.2 Key differences from `useWorkflowLogStream`

| Aspect | `useWorkflowLogStream` | `useWorkflowRunSSE` |
|--------|----------------------|--------------------|
| Endpoint | `/api/repos/:owner/:repo/runs/:id/logs` | `/api/repos/:owner/:repo/runs/status?run_ids=...` |
| Event types | log, status, done, error, keep-alive | status, done, error, keep-alive |
| State | `Map<stepId, LogLine[]>` + steps + runStatus | `Map<runId, WorkflowRunStatus>` |
| FIFO eviction | Yes (10K per step) | No |
| Flush batching | Yes (100 lines / 200ms) | No (status events are infrequent) |
| Dedup set | Yes (by log_id, 50K max) | No (status overwrites are idempotent) |
| Auto-disconnect | On run completion (`done` event) | When ALL monitored runs are terminal |
| Input cardinality | Single `runId: number` | Array `runIds: number[]` |

#### 3.3 RunIds change handling

Detected via serialized comparison: `[...runIds].sort().join(",")`

When the serialized value changes:
1. Update `runIdsRef.current` to new array
2. If `!enabled || runIds.length === 0`: abort connection, clear timers, return
3. Reset reconnection counters (attempts to 0, backoff to 1s)
4. Open new connection with `connectToStream(false)`
5. Existing `runStatuses` Map entries are preserved (don't clear known statuses)

#### 3.4 Auto-disconnect

`checkAutoDisconnect(currentStatuses)` is called after every `processStatusEvent` and `processDoneEvent`:

```typescript
function checkAutoDisconnect(currentStatuses: Map<number, WorkflowRunStatus>): boolean {
  if (runIdsRef.current.length === 0) return false;
  const allTerminal = runIdsRef.current.every(id => {
    const status = currentStatuses.get(id);
    return status && TERMINAL_STATUSES.has(status);
  });
  if (allTerminal) {
    setConnectionState("completed");
    clearKeepaliveTimer();
    abortController.abort();
    return true;
  }
  return false;
}
```

`TERMINAL_STATUSES` imported from `workflow-types.ts`: `Set(["success", "failure", "cancelled", "error"])`.

Also checked at the start of `connectToStream` to avoid opening a connection when all runs are already terminal.

#### 3.5 SSE connection details

- URL: `${client.baseUrl}/api/repos/${owner}/${repo}/runs/status`
- Query params: `run_ids={sorted,comma,separated}` + optional `ticket=`
- Same keepalive, backoff, and `Last-Event-ID` behavior as `useWorkflowLogStream`
- Same 20-attempt max reconnection cap

### Step 4: Create TUI wrappers

**File:** `apps/tui/src/hooks/useWorkflowLogStream.ts`

**Status:** ✅ Already exists (29 lines).

Thin wrapper around the core hook adding braille spinner frame via `useSpinner()` from `./useSpinner.js`. Uses `useMemo` to create stable return object:

```typescript
import { useMemo } from "react";
import { useWorkflowLogStream as useWorkflowLogStreamCore } from "@codeplane/ui-core/hooks/workflows";
import { useSpinner } from "./useSpinner.js";
import type { WorkflowLogStreamState } from "./workflow-stream-types.js";

export function useWorkflowLogStream(
  owner: string,
  repo: string,
  runId: number,
  options?: Parameters<typeof useWorkflowLogStreamCore>[3],
): WorkflowLogStreamState {
  const stream = useWorkflowLogStreamCore(owner, repo, runId, options);
  const isStreaming = stream.connectionHealth.state === "connected" ||
                     stream.connectionHealth.state === "reconnecting";
  const spinnerFrame = useSpinner(isStreaming);

  return useMemo(() => ({
    ...stream,
    spinnerFrame,
  }), [
    stream.logs, stream.steps, stream.runStatus,
    stream.connectionHealth, stream.reconnect,
    stream.lastEventId, spinnerFrame,
  ]);
}
```

**Spinner behavior:** The `useSpinner` hook uses OpenTUI's `Timeline` engine (not `setInterval`) for animation. Braille frames (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) at 80ms intervals on Unicode terminals, ASCII frames (`-\|/`) at 120ms on non-Unicode. All concurrent spinners are frame-synchronized via module-level state.

**File:** `apps/tui/src/hooks/useWorkflowRunSSE.ts`

**Status:** ✅ Already exists (7 lines).

Direct re-export of core hook (no spinner needed for run list — status changes are instant visual updates):

```typescript
import { useWorkflowRunSSE as useWorkflowRunSSECore } from "@codeplane/ui-core/hooks/workflows";
import type { WorkflowRunSSEState } from "./workflow-stream-types.js";

export { useWorkflowRunSSECore as useWorkflowRunSSE };
export type { WorkflowRunSSEState };
```

### Step 5: Verify barrel exports

**File:** `packages/ui-core/src/hooks/workflows/index.ts`

**Status:** ✅ Already exists.

```typescript
export { useWorkflowLogStream } from "./useWorkflowLogStream.js";
export { useWorkflowRunSSE } from "./useWorkflowRunSSE.js";
```

**File:** `apps/tui/src/hooks/index.ts`

**Status:** ✅ Already exists with all exports (lines 61–75):

```typescript
export { useWorkflowLogStream } from "./useWorkflowLogStream.js";
export { useWorkflowRunSSE } from "./useWorkflowRunSSE.js";
export type {
  LogLine, StatusEvent, DoneEvent,
  WorkflowLogStreamEvent, WorkflowRunSSEEvent,
  WorkflowStreamConnectionState, ConnectionHealth,
  WorkflowLogStreamState, StepState, WorkflowRunSSEState,
} from "./workflow-stream-types.js";
export { VIRTUAL_SCROLL_WINDOW } from "./workflow-stream-types.js";
```

### Step 6: Integration with existing workflow screens (preparation only)

This ticket does NOT implement screen-level UI changes. It provides the hooks that workflow screens will consume. The hooks are designed for the following integration points (to be implemented in subsequent tickets):

1. **Workflow Run Detail screen** (`apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx` — future) will call `useWorkflowLogStream(owner, repo, runId)` to stream logs in real-time. The screen should:
   - Pass `enabled: !TERMINAL_STATUSES.has(initialRunStatus)` to avoid connecting for completed runs
   - Render `spinnerFrame` in the header or status bar next to the connection state
   - Use `logs` Map to render per-step log sections with ANSI passthrough
   - Use `steps` Map to render step status indicators alongside step headers
   - Bind `R` key to `reconnect()` for manual retry
   - Show `connectionHealth.state` in the status bar

2. **Workflow Run List screen** (`apps/tui/src/screens/Workflows/WorkflowRunListScreen.tsx` — future) will call `useWorkflowRunSSE(owner, repo, visibleRunIds)` to update status badges in real-time. The screen should:
   - Extract `runIds` from the paginated run list data
   - Merge `runStatuses` from SSE with initial data from `useWorkflowRuns()`
   - Update `runIds` when pagination loads new pages (triggers SSE reconnect with updated query params)

3. **Status bar** will read `connectionHealth.state` to show connection status indicator.

4. **Utility integration:** `getRunStatusIcon()` and `getStepStatusIcon()` from `apps/tui/src/screens/Workflows/utils.ts` should be used by consuming screens to render status indicators with theme-appropriate colors.

---

## 5. Detailed Implementation: `useWorkflowLogStream` (core)

**File:** `packages/ui-core/src/hooks/workflows/useWorkflowLogStream.ts`

### 5.1 Import structure

```typescript
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAPIClient } from "../../client/context.js";
import { getSSETicket } from "../../sse/getSSETicket.js";
import { createSSEReader } from "../../sse/createSSEReader.js";
import type {
  LogLine, StatusEvent, DoneEvent,
  WorkflowStreamConnectionState, ConnectionHealth,
  WorkflowLogStreamState, StepState,
} from "../../../../apps/tui/src/hooks/workflow-stream-types.js";
import type { WorkflowRunStatus } from "../../../../apps/tui/src/hooks/workflow-types.js";
```

**Note on cross-package type imports:** The core hook imports types from `apps/tui/src/hooks/` via relative path. This is an intentional architectural decision — the types are defined in the TUI package and consumed by ui-core. This avoids circular dependencies since the types are pure interfaces with no runtime code. In a future refactoring pass, these types could be moved to `@codeplane/sdk` for cleaner layering.

### 5.2 `connectToStream(isReconnect: boolean)` — full flow

```
1. Abort any existing connection (abortControllerRef.current?.abort())
2. Create new AbortController, store in ref
3. If not reconnect and mounted: setConnectionState("connecting")
4. Try getSSETicket(client, signal) — catch returns null
5. If aborted: return early
6. Build URL: new URL(`/api/repos/${owner}/${repo}/runs/${runId}/logs`, client.baseUrl)
7. Set Accept: text/event-stream header
8. If ticket: url.searchParams.set("ticket", ticket)
9. Else: headers.Authorization = `Bearer ${client.getToken()}`
10. Call createSSEReader({ url, signal, headers, lastEventId, onOpen, onEvent, onError, onClose })
```

### 5.3 Effect dependencies

**Auto-connect effect:** `[enabled, owner, repo, runId, connectToStream, clearKeepaliveTimer]`
- Runs when any of these change
- Guard: `if (!enabled || !runId) return`
- Cleanup: abort controller, clear keepalive timer, clear backoff timer

**Unmount lifecycle effect:** `[]` (runs once)
- Mount: `isMounted.current = true`
- Unmount: `isMounted.current = false`, clear flush timer, synchronously flush pending logs to `logsRef` (not to state)

---

## 6. Detailed Implementation: `useWorkflowRunSSE` (core)

**File:** `packages/ui-core/src/hooks/workflows/useWorkflowRunSSE.ts`

### 6.1 Import structure

Same pattern as `useWorkflowLogStream`, additionally imports `TERMINAL_STATUSES` (value, not just type) from `workflow-types.ts`.

### 6.2 State

| State | Type | Initial |
|-------|------|--------|
| `runStatuses` | `Map<number, WorkflowRunStatus>` | `new Map()` |
| `connectionState` | `WorkflowStreamConnectionState` | `"idle"` |
| `error` | `Error \| null` | `null` |

Additional refs: `runIdsRef` for stable access to current run IDs inside callbacks.

### 6.3 `connectToStream` differences

1. Before opening connection: calls `checkAutoDisconnect(runStatuses)` — returns early if all already terminal
2. URL: `/api/repos/${owner}/${repo}/runs/status` with `?run_ids=` query param
3. `onEvent`: only handles `status`, `done`, and `error` events (no `log`)
4. Does not track `lastEventId` in reactive state (only in ref)

### 6.4 Effect dependencies

Main effect depends on: `[enabled, owner, repo, runIdsSerialized, connectToStream, clearKeepaliveTimer]`

Where `runIdsSerialized = [...runIds].sort().join(",")` — computed outside the effect to provide a stable dependency.

---

## 7. E2E Test Helpers

### File: `e2e/tui/helpers/workflows.ts`

**Status:** ✅ Already exists (63 lines).

Provides three helpers:

#### `navigateToWorkflowRunDetail(terminal, runIndex?)`

Navigates from dashboard to a specific workflow run detail screen:
1. `sendKeys("g", "f")` — go-to workflows
2. `waitForText("Workflows")`
3. `sendKeys("Enter")` — enter first workflow definition
4. `waitForText("Runs")`
5. For `runIndex` iterations: `sendKeys("j")` — move cursor down
6. `sendKeys("Enter")` — enter run detail

#### `waitForLogStreaming(terminal, timeoutMs?)`

Polls terminal snapshot every 100ms looking for streaming indicators:
- `"Connected"`, `"Streaming"`, braille spinner characters (`⣾`, `⣷`), or `"Log"` text
- Throws after timeout (default 10s)

#### `createSSEInjectFile(dir)`

Creates a test-mode SSE event injection file:
- Returns `{ path, appendEvent }` where `appendEvent` writes newline-delimited JSON
- Used with `CODEPLANE_SSE_INJECT_FILE` env var for `SSEProvider` test mode
- **Note:** Not directly applicable to these hooks since they use `createSSEReader` directly, but useful for integration tests that need global SSE events alongside workflow streams

---

## 8. Unit & Integration Tests

### File: `e2e/tui/workflow-sse.test.ts`

**Status:** ✅ Already exists (396 lines). All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`.

Tests run against a real API server with test fixtures. **Tests that fail due to unimplemented backend endpoints are left failing — never skipped or commented out.**

#### Test Groups and Coverage

##### 8.1 `useWorkflowLogStream — Connection` (4 tests)

| Test ID | Behavior | Strategy |
|---------|----------|----------|
| HOOK-WFSS-001 | Log stream connects on run detail mount and shows streaming indicator | Launch TUI at 120×40, navigate to workflows → runs → run detail. Wait for `#` in header. Snapshot match. |
| HOOK-WFSS-002 | Log stream does not connect when run is in terminal state | Navigate to a completed run (j,j to skip active runs). Verify snapshot does NOT match `/Connecting\|Streaming/`. |
| HOOK-WFSS-003 | Connection health shows in status bar during streaming | Use `navigateToWorkflowRunDetail` helper. Assert last line matches `/●\|◆\|⣾\|connected\|streaming/i`. Snapshot match. |
| HOOK-WFSS-004 | Connection cleans up on screen back-navigation (q) | Navigate to run detail, then `sendKeys("q")`. Wait for "Runs" text. Verify snapshot does NOT match `/Streaming logs/i`. |

##### 8.2 `useWorkflowLogStream — Log Events` (4 tests)

| Test ID | Behavior | Strategy |
|---------|----------|----------|
| HOOK-WFSS-010 | Incremental log lines render as they arrive | Navigate to run detail. `waitForText("Step", 15000)`. Snapshot match. |
| HOOK-WFSS-011 | ANSI color codes in log lines pass through to terminal | Navigate to run detail. Wait for step output. Assert snapshot matches `/\x1b\[/` (ANSI escape sequences present). |
| HOOK-WFSS-012 | Logs are grouped by step_id with step headers | Navigate to run detail. Wait for step output. Snapshot match (verifies visual grouping). |
| HOOK-WFSS-013 | Duplicate log_ids from replay are silently dropped | Navigate to run detail. Wait for output. Scan snapshot lines for exact consecutive duplicates matching `/^\s*\[\d/` (timestamped log lines). Assert none found. |

##### 8.3 `useWorkflowLogStream — Status Events` (3 tests)

| Test ID | Behavior | Strategy |
|---------|----------|----------|
| HOOK-WFSS-020 | Step status change updates step indicator inline | Navigate to run detail. Wait for step output. Snapshot match (captures status transition). |
| HOOK-WFSS-021 | Run status change updates header status badge | Navigate to run detail. Assert header line (line 0) matches `/#\d+/`. Snapshot match. |
| HOOK-WFSS-022 | Done event stops streaming and shows final status | Navigate to run detail. Wait for `#`. Snapshot match. |

##### 8.4 `useWorkflowLogStream — Reconnection` (3 tests)

| Test ID | Behavior | Strategy |
|---------|----------|----------|
| HOOK-WFSS-030 | Reconnecting indicator in status bar | Launch with `CODEPLANE_API_URL: "http://localhost:1"` (unreachable). Navigate to runs. Wait for "error" text (15s timeout). |
| HOOK-WFSS-031 | Failed state after max reconnection attempts | Launch with unreachable API. Wait for "error" (30s timeout for backoff exhaustion). Snapshot match. |
| HOOK-WFSS-032 | Manual reconnect via R key resets backoff and retries | Navigate to run detail. `sendKeys("R")`. Snapshot match (brief reconnection indicator). |

##### 8.5 `useWorkflowRunSSE` (4 tests)

| Test ID | Behavior | Strategy |
|---------|----------|----------|
| HOOK-WFRSSE-001 | Run list shows live status updates without manual refresh | Navigate to workflows → runs. Verify "Runs" visible. Snapshot match. |
| HOOK-WFRSSE-002 | Status transition updates run row inline without flicker | Navigate to run list. Assert snapshot matches `/queued\|running\|success\|failure/i`. |
| HOOK-WFRSSE-003 | SSE auto-disconnects when all visible runs are terminal | Navigate to run list. Check status bar does NOT show active connection indicator when all runs are done. Snapshot match. |
| HOOK-WFRSSE-004 | Pagination loads new runs and SSE reconnects with updated run_ids | Launch with large repo. Navigate to runs. `sendKeys("G")` to scroll to bottom (trigger pagination). Snapshot match after loading more. |

##### 8.6 Virtual Scroll Window (1 test)

| Test ID | Behavior | Strategy |
|---------|----------|----------|
| HOOK-WFVS-001 | Memory stays bounded during long-running log output | Navigate to run detail. Wait 15s. TUI should not crash or freeze. Snapshot match. |

##### 8.7 Responsive Behavior (2 tests)

| Test ID | Behavior | Strategy |
|---------|----------|----------|
| HOOK-WFSS-RSP-001 | Log streaming at 80×24 shows minimal chrome | Launch at 80×24. Navigate through to run detail. Snapshot match (verifies sidebar collapsed, truncated metadata). |
| HOOK-WFSS-RSP-002 | Log streaming at 200×60 shows expanded metadata | Launch at 200×60. Navigate through to run detail. Snapshot match (verifies expanded layout). |

##### 8.8 SSE Ticket Auth (2 tests)

| Test ID | Behavior | Strategy |
|---------|----------|----------|
| HOOK-WFSS-AUTH-001 | Stream connects with ticket-based auth | Navigate to run detail. Assert snapshot does NOT match `/auth.*error/i`. |
| HOOK-WFSS-AUTH-002 | Stream falls back to bearer auth when ticket endpoint unavailable | Navigate to run detail. Snapshot match (should still connect). |

---

## 9. Test IDs Reference

| Test ID | Hook | Behavior |
|---------|------|----------|
| HOOK-WFSS-001 | `useWorkflowLogStream` | Connects on mount, shows streaming indicator |
| HOOK-WFSS-002 | `useWorkflowLogStream` | Does not connect for terminal-state runs |
| HOOK-WFSS-003 | `useWorkflowLogStream` | Connection health shown in status bar |
| HOOK-WFSS-004 | `useWorkflowLogStream` | Connection cleanup on back-navigation |
| HOOK-WFSS-010 | `useWorkflowLogStream` | Incremental log line rendering |
| HOOK-WFSS-011 | `useWorkflowLogStream` | ANSI color passthrough in logs |
| HOOK-WFSS-012 | `useWorkflowLogStream` | Logs grouped by step_id with headers |
| HOOK-WFSS-013 | `useWorkflowLogStream` | Duplicate log_id deduplication |
| HOOK-WFSS-020 | `useWorkflowLogStream` | Step status inline update |
| HOOK-WFSS-021 | `useWorkflowLogStream` | Run status badge update |
| HOOK-WFSS-022 | `useWorkflowLogStream` | Done event stops streaming |
| HOOK-WFSS-030 | `useWorkflowLogStream` | Reconnecting indicator |
| HOOK-WFSS-031 | `useWorkflowLogStream` | Failed state after max attempts |
| HOOK-WFSS-032 | `useWorkflowLogStream` | Manual reconnect via R key |
| HOOK-WFRSSE-001 | `useWorkflowRunSSE` | Live status updates in run list |
| HOOK-WFRSSE-002 | `useWorkflowRunSSE` | Inline status transition |
| HOOK-WFRSSE-003 | `useWorkflowRunSSE` | Auto-disconnect when all terminal |
| HOOK-WFRSSE-004 | `useWorkflowRunSSE` | Pagination updates SSE subscription |
| HOOK-WFVS-001 | `useWorkflowLogStream` | Memory bounded under high volume |
| HOOK-WFSS-RSP-001 | `useWorkflowLogStream` | 80×24 responsive layout |
| HOOK-WFSS-RSP-002 | `useWorkflowLogStream` | 200×60 responsive layout |
| HOOK-WFSS-AUTH-001 | `useWorkflowLogStream` | Ticket-based auth |
| HOOK-WFSS-AUTH-002 | `useWorkflowLogStream` | Bearer auth fallback |

---

## 10. File Inventory

### Files (all verified as existing)

| File | Purpose | Lines |
|------|---------|------|
| `apps/tui/src/hooks/workflow-stream-types.ts` | Type definitions for SSE events, connection state, hook return types | 116 |
| `packages/ui-core/src/hooks/workflows/useWorkflowLogStream.ts` | Core log stream SSE hook | 383 |
| `packages/ui-core/src/hooks/workflows/useWorkflowRunSSE.ts` | Core multi-run status SSE hook | 312 |
| `packages/ui-core/src/hooks/workflows/index.ts` | Barrel export for workflow hooks | 2 |
| `apps/tui/src/hooks/useWorkflowLogStream.ts` | TUI wrapper with spinner | 29 |
| `apps/tui/src/hooks/useWorkflowRunSSE.ts` | TUI re-export wrapper | 7 |
| `e2e/tui/workflow-sse.test.ts` | E2E tests for SSE streaming hooks | 396 |
| `e2e/tui/helpers/workflows.ts` | Test navigation helpers for workflow screens | 63 |

### Supporting files (pre-existing, not modified by this ticket)

| File | Role |
|------|------|
| `packages/ui-core/src/sse/getSSETicket.ts` | SSE ticket acquisition (35 lines) |
| `packages/ui-core/src/sse/createSSEReader.ts` | Fetch-based SSE connection with eventsource-parser (88 lines) |
| `packages/ui-core/src/hooks/agents/useAgentStream.ts` | Reference implementation pattern (371 lines) |
| `apps/tui/src/hooks/useSpinner.ts` | Braille/ASCII spinner using OpenTUI Timeline (139 lines) |
| `apps/tui/src/hooks/workflow-types.ts` | Domain types: WorkflowRun, WorkflowRunStatus, TERMINAL_STATUSES (174 lines) |
| `apps/tui/src/hooks/index.ts` | TUI hooks barrel with all exports (85 lines) |
| `apps/tui/src/screens/Workflows/utils.ts` | Status icons, formatting utilities (156 lines) |
| `e2e/tui/helpers.ts` | Main test helpers: launchTUI, TUITestInstance (353 lines) |

---

## 11. Productionization Checklist

All code in this ticket is production code, not PoC. It follows the proven patterns established by `useAgentStream`. No PoC graduation needed.

### 11.1 Memory Safety

| Mechanism | Bound | Implementation |
|-----------|-------|---------------|
| FIFO log eviction | 10,000 lines per step | `while (stepLines.length > VIRTUAL_SCROLL_WINDOW) stepLines.shift()` in `flushLogs()` |
| Dedup set pruning | 50,000 entries max, prunes to 25,000 | `seenLogIdsOrderRef.current.splice(0, DEDUP_SET_PRUNE_TARGET)` then `delete` from Set |
| Flush batching | 100 lines or 200ms, whichever first | `queueLogLine()` checks batch size, schedules timer |
| Map copying | New Map wrapper per flush | `new Map(logsRef.current)` — inner arrays are spread only for modified steps |
| Pending logs on unmount | Synchronous flush to ref only | Final effect flushes `pendingLogsRef` to `logsRef` but does NOT call `setLogs` |

### 11.2 Connection Safety

| Mechanism | Implementation |
|-----------|---------------|
| AbortController per connection | Each `connectToStream` call creates new `AbortController`, aborts previous |
| isMounted guard | All `setState` calls guarded by `isMounted.current` check |
| Timer cleanup | All `setTimeout` handles (keepalive, backoff, flush) cleared in cleanup effects |
| Max reconnection cap | 20 attempts maximum, then `connectionState = "failed"` |
| Abort signal propagation | Passed to `getSSETicket()` and `createSSEReader()` |

### 11.3 Error Resilience

| Error Case | Handling |
|------------|----------|
| Malformed JSON in event data | `JSON.parse` wrapped in try/catch — event silently dropped |
| Unknown event types | Default switch case is no-op (forward compatibility) |
| SSE ticket acquisition failure | `getSSETicket` returns null → falls back to bearer auth header |
| Network errors during ticket exchange | Caught by `.catch(() => null)` — non-fatal |
| AbortError during fetch | Caught and returned early — no reconnection triggered |
| HTTP error on SSE connection | `createSSEReader` calls `onError(new Error("SSE connection failed: HTTP {status}"))` → reconnection |
| Response body missing | `createSSEReader` calls `onError(new Error("SSE response has no body"))` → reconnection |

### 11.4 Performance

| Concern | Mitigation |
|---------|------------|
| Re-render storms from rapid log output | Flush batching: max 5 flushes/second (200ms interval) |
| Stable function references | `reconnect` via `useCallback`; return value via `useMemo` |
| Array copying in hot path | Log lines pushed to existing arrays during accumulation; spread only at flush boundary |
| Map identity for React | `new Map(...)` creates new reference for React's comparison; unchanged steps share array references |
| Spinner frame sync | Module-level singleton Timeline — one animation tick drives all spinners |

### 11.5 Testing Seam

- **E2E tests run against real API server** — these hooks use `createSSEReader` directly (not `SSEProvider`), so the file-based injection mechanism does not apply
- **Connection state observability:** `connectionHealth` exposes `state`, `reconnectAttempts`, `lastConnectedAt`, and `lastError` for status bar rendering and test assertions
- **Snapshot tests at 3 breakpoints:** 80×24 (minimum), 120×40 (standard), 200×60 (large)
- **Tests left failing if backend endpoints don't exist** — per project testing philosophy

---

## 12. API Contract Assumptions

These hooks assume the following server-side endpoints exist (or will exist). If the endpoints are not yet implemented, the hooks will fail at the HTTP level and the E2E tests will fail — as intended per the testing philosophy.

### 12.1 Log Stream Endpoint

```
GET /api/repos/:owner/:repo/runs/:id/logs
Accept: text/event-stream
Authorization: Bearer {token}  OR  ?ticket={sse-ticket}
Last-Event-ID: {last-event-id}   (on reconnect)

Response: text/event-stream
Events:
  event: log
  data: {"log_id": "...", "step_id": "...", "timestamp": "...", "content": "...", "stream": "stdout|stderr"}
  id: {monotonic-event-id}

  event: status
  data: {"run_id": N, "run_status": "...", "step_id": "...", "step_status": "..."}
  id: {monotonic-event-id}

  event: done
  data: {"run_id": N, "final_status": "...", "completed_at": "..."}
  id: {monotonic-event-id}

  event: error
  data: {"message": "..."}
  id: {monotonic-event-id}

  event: keep-alive
  data: (empty or comment)
  (sent every ~15s)
```

### 12.2 Multi-Run Status Endpoint

```
GET /api/repos/:owner/:repo/runs/status?run_ids=1,2,3
Accept: text/event-stream
Authorization: Bearer {token}  OR  ?ticket={sse-ticket}
Last-Event-ID: {last-event-id}   (on reconnect)

Response: text/event-stream
Events:
  event: status
  data: {"run_id": N, "run_status": "..."}
  id: {monotonic-event-id}

  event: done
  data: {"run_id": N, "final_status": "...", "completed_at": "..."}
  id: {monotonic-event-id}

  event: keep-alive
  (sent every ~15s)
```

### 12.3 SSE Ticket Endpoint (existing)

```
POST /api/auth/sse-ticket
Authorization: Bearer {token}

Response 200: {"ticket": "...", "expiresAt": "..."}
Response 4xx/5xx: treated as unavailable → bearer auth fallback
```

---

## 13. Dependency Graph

```
tui-workflow-sse-hooks
├── tui-theme-provider (resolved — provides useTheme for status colors in consuming screens)
├── tui-workflow-data-hooks (resolved — provides domain types, TERMINAL_STATUSES, run detail hook)
│
├── @codeplane/ui-core (existing infrastructure)
│   ├── sse/getSSETicket.ts         — ticket acquisition
│   ├── sse/createSSEReader.ts       — fetch-based SSE with eventsource-parser
│   └── client/context.ts            — useAPIClient() hook
│
├── apps/tui/src/hooks (existing TUI utilities)
│   ├── useSpinner.ts                — braille/ASCII spinner via OpenTUI Timeline
│   ├── workflow-types.ts            — WorkflowRunStatus, TERMINAL_STATUSES
│   └── workflow-stream-types.ts     — LogLine, StatusEvent, ConnectionHealth, etc.
│
└── External packages
    ├── react@19.2.4                 — hooks (useState, useRef, useEffect, useCallback, useMemo)
    ├── eventsource-parser            — SSE protocol parsing (used by createSSEReader)
    └── @opentui/core                — Timeline, engine (used by useSpinner)
```

---

## 14. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Server SSE endpoints not yet implemented | E2E tests fail | High | Tests left failing per policy. Hooks are structurally complete. |
| High-volume log output causes render lag | Degraded UX during fast output (>500 lines/sec) | Medium | Flush batching limits to 5 re-renders/sec. FIFO eviction caps memory at 10K lines/step. |
| `eventsource-parser` compatibility with Bun | Build or runtime failure | Low | Already proven in production by `useAgentStream` using same parser. |
| SSE ticket TTL (30s) expires during backoff | Reconnection fails with 401 | Low | Each reconnection attempt acquires a fresh ticket before opening the stream. |
| Multiple concurrent run detail mounts leak connections | Resource exhaustion | Low | Each hook instance owns its AbortController; stale connections aborted on param change or unmount. |
| `useCallback` dependency cycles | Stale closures or infinite re-renders | Medium | Verified: `initiateReconnection` called inside `connectToStream` closure. Both use `useCallback` with stable dependency chains. Options accessed via `optionsRef` to avoid closure staleness. |
| Dedup set pruning during active reconnect replay | Replayed events after pruning threshold slip through | Very Low | Dedup set is 50K which accommodates ~5 full reconnect replays. Server replays are bounded by cursor. |
| Cross-package type imports (ui-core importing from apps/tui) | Build fragility if paths change | Low | Types are pure interfaces with no runtime code. Future: consider moving to `@codeplane/sdk`. |

---

## 15. State Machine Diagrams

### 15.1 `useWorkflowLogStream` Connection State

```
                    ┌──────┐
                    │ idle │
                    └──┬───┘
               mount + enabled
                    │
               ┌────▼──────┐
          ┌────│ connecting │
          │    └────┬───────┘
     error/close    │ onOpen
          │    ┌────▼──────┐
          │    │ connected  │◄──────────────────────┐
          │    └────┬───┬───┘                       │
          │   error/│   │ done event                │ onOpen (after retry)
          │  close/ │   │                           │
          │  timeout│   ▼                           │
          │    ┌────▼──────┐     ┌──────────────┐   │
          └───►│reconnecting├────►│ connectToStream│──┘
               └────┬───────┘     └──────────────┘
            attempts > 20
               ┌────▼───┐
               │ failed  │
               └─────────┘

     ┌───────────┐
     │ completed  │  ◄── done event received
     └───────────┘
```

### 15.2 `useWorkflowRunSSE` Auto-Disconnect

```
     connected ──► onStatusChange ──► checkAutoDisconnect()
                                         │
                                 all terminal? ──► yes ──► completed
                                         │
                                        no ──► stay connected
```

---

## 16. Consumer Integration Guide

For future tickets implementing workflow screens, here is the recommended integration pattern:

### 16.1 Run Detail Screen

```typescript
function WorkflowRunDetailScreen({ owner, repo, runId }: Props) {
  const { data: detail } = useWorkflowRunDetail({ owner, repo }, runId);
  const isTerminal = detail?.run.status && TERMINAL_STATUSES.has(detail.run.status);

  const {
    logs, steps, runStatus, connectionHealth, reconnect, spinnerFrame,
  } = useWorkflowLogStream(owner, repo, runId, {
    enabled: !isTerminal,
    onDone: (event) => { /* update detail cache */ },
  });

  // Register R key for manual reconnect
  useScreenKeybindings([
    { key: "R", description: "Reconnect", handler: reconnect,
      when: () => connectionHealth.state === "failed" || connectionHealth.state === "errored" },
  ]);

  // Render log sections per step
  // Render status bar with connectionHealth.state + spinnerFrame
}
```

### 16.2 Run List Screen

```typescript
function WorkflowRunListScreen({ owner, repo }: Props) {
  const { data: runs, hasMore, loadMore } = useWorkflowRuns({ owner, repo });
  const runIds = runs.map(r => r.id);

  const { runStatuses } = useWorkflowRunSSE(owner, repo, runIds, {
    enabled: runIds.length > 0,
  });

  // Merge SSE statuses with initial data
  const enrichedRuns = runs.map(run => ({
    ...run,
    status: runStatuses.get(run.id) ?? run.status,
  }));

  // Render ScrollableList with enrichedRuns
}
```
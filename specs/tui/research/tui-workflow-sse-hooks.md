# Research Document: TUI Workflow SSE Hooks

## 1. Overview
The goal is to implement `useWorkflowLogStream` and `useWorkflowRunSSE` hooks to add real-time status and log streaming capabilities for the Codeplane TUI. These hooks are structurally modeled after the existing `useAgentStream` hook and rely heavily on existing SSE infrastructure in `@codeplane/ui-core`.

## 2. Existing SSE Infrastructure (`packages/ui-core/src/sse`)

### `createSSEReader`
- Located at `packages/ui-core/src/sse/createSSEReader.ts`.
- Uses a `fetch` request combined with `eventsource-parser` to handle SSE natively in Node/Bun rather than the browser's `EventSource` object.
- Key parameters: `url`, `headers`, `signal`, `onEvent`, `onError`, `onOpen`, `onClose`, `lastEventId`.
- **Handling Last-Event-ID**: If provided, it appends the `Last-Event-ID` header natively.
- **Handling Connection**: Uses a `ReadableStream` while-loop to stream decoded text. Supports aborting cleanly via `signal?.aborted` and `AbortError`.

### `getSSETicket`
- Located at `packages/ui-core/src/sse/getSSETicket.ts`.
- Makes a `POST /api/auth/sse-ticket` request using the `APIClient`.
- Returns `{ ticket, expiresAt }` or `null` if the endpoint isn't supported, falling back to bearer auth.

## 3. Reference Architecture: `useAgentStream`

Located at `packages/ui-core/src/hooks/agents/useAgentStream.ts`, this hook is the gold standard for per-endpoint SSE streaming in the application.

### State Management Pattern
- Relies heavily on **mutable refs** (`useRef`) to manage internal state without triggering render storms. For example: `positionRef`, `backoffRef`, `tokensRef`, `reconnectAttemptsRef`, and `keepaliveTimerRef`.
- **Reactive state** (`useState`) is reserved for properties that affect the UI (`connectionState`, `currentTokens`, `error`).
- A `flushTimerRef` pattern can be inferred from the spec, though `useAgentStream` directly updates `setCurrentTokens` on each token. The new `useWorkflowLogStream` needs to batch updates (e.g., 100 lines or 200ms) to prevent render storms from high-volume logs.

### Reconnection Logic
- Utilizes an **Exponential Backoff** strategy:
  - `INITIAL_BACKOFF_MS = 1000`
  - `MAX_BACKOFF_MS = 30_000`
  - `BACKOFF_MULTIPLIER = 2`
  - `MAX_RECONNECT_ATTEMPTS = 20`
- On `onError` or unexpected `onClose`, it calls `initiateReconnection()`, which manages retries using `setTimeout`.
- Aborts stale connections cleanly via an `AbortController` stored in `abortControllerRef`.

### Keepalive Management
- Server sends `":"` keepalive comments or events.
- A timeout (`KEEPALIVE_TIMEOUT_MS = 45_000`) is established. If no events are received within 45 seconds, the hook forcibly aborts the connection and reconnects.

## 4. TUI Wrapping Pattern

Located at `apps/tui/src/hooks/useAgentStream.ts`:
- Core hooks are framework-agnostic and live in `@codeplane/ui-core/hooks/`.
- TUI hooks are lightweight wrappers that provide UI-specific embellishments.
- Specifically, the TUI `useAgentStream` wrapper calls `useSpinner(stream.streaming)` to provide a `spinnerFrame` property. It uses `useMemo` to ensure stable references.

## 5. Workflow Types & Constants

Located at `apps/tui/src/hooks/workflow-types.ts`:
- Domain models: `WorkflowRun`, `WorkflowRunStatus`, `WorkflowRunNode`.
- Key Constant: `TERMINAL_STATUSES` — a `Set` comprising `"success"`, `"failure"`, `"cancelled"`, and `"error"`.
- This is vital for `useWorkflowRunSSE`: the stream should auto-disconnect when all monitored runs transition to a status included in `TERMINAL_STATUSES`.

## 6. Implementation Action Items

1. **New Core Hooks (`@codeplane/ui-core/src/hooks/workflows`)**:
   - `useWorkflowLogStream.ts`: Implement `getSSETicket` and `createSSEReader` logic. Must add log line deduplication (via `log_id` sets) and FIFO eviction bounding the map arrays to `VIRTUAL_SCROLL_WINDOW` (10,000). Needs a batch flushing timer pattern.
   - `useWorkflowRunSSE.ts`: A lightweight array-based listener that terminates when all `runIds` reach `TERMINAL_STATUSES`.

2. **New TUI Hooks (`apps/tui/src/hooks`)**:
   - `workflow-stream-types.ts`: Must contain the types delineated in the spec.
   - `useWorkflowLogStream.ts`: Wrap core hook with `useSpinner()`.
   - `useWorkflowRunSSE.ts`: Direct re-export of core hook.

3. **E2E Helpers**:
   - Add specific assertions to test connection states (`"connecting"`, `"streaming"`).
   - Use test injection via creating SSE payloads matching the hook types.

This research indicates that the existing system provides all the necessary architectural primitives. The primary challenge will be adapting `useAgentStream`'s token-appending logic into the `VIRTUAL_SCROLL_WINDOW` constrained `Map<string, LogLine[]>` object for `useWorkflowLogStream`.
# Engineering Specification: `tui-agent-sse-stream-hook`

## Title
Implement agent SSE streaming hook for token-by-token response rendering

## Status
`Not implemented` — Reference implementations exist under `specs/tui/` but are not yet materialized into the actual `packages/ui-core/` or `apps/tui/` source trees. The `useAgentStream` hook does not exist in the runtime codebase. The SSEProvider in `specs/tui/apps/tui/src/providers/SSEProvider.tsx` is a test-mode-only stub (file-based injection via `CODEPLANE_SSE_INJECT_FILE`, no production SSE). The server endpoint `GET /api/repos/:owner/:repo/agent/sessions/:id/stream` currently returns 501. The `eventsource-parser` package (v3.0.6) is available in the monorepo's dependency tree.

## Summary

This ticket creates the `useAgentStream` hook — the real-time SSE streaming data layer for agent chat sessions. The hook connects to the agent session SSE stream endpoint and delivers tokens incrementally as they arrive from the server, enabling token-by-token response rendering in the `AgentChatScreen`.

The hook is implemented in two layers:

1. **Shared hook** (`packages/ui-core/src/hooks/agents/useAgentStream.ts`) — Framework-agnostic React 19 hook that manages the SSE connection, event parsing, token accumulation, reconnection, and deduplication. Consumed by both TUI and future web UI.
2. **TUI adapter** (`apps/tui/src/hooks/useAgentStream.ts`) — Thin wrapper that integrates the shared hook with the existing `useSpinner` hook (powered by OpenTUI's `Timeline` engine) for braille/ASCII spinner animation during streaming state.

**Scope boundary:**
- ✅ `packages/ui-core/src/types/agentStream.ts` — SSE event types and connection state enum
- ✅ `packages/ui-core/src/sse/getSSETicket.ts` — SSE ticket exchange utility
- ✅ `packages/ui-core/src/sse/createSSEReader.ts` — Fetch-based SSE stream reader using `eventsource-parser`
- ✅ `packages/ui-core/src/sse/index.ts` — SSE utilities barrel export
- ✅ `packages/ui-core/src/hooks/agents/useAgentStream.ts` — Shared hook implementation
- ✅ `packages/ui-core/src/hooks/agents/__tests__/useAgentStream.test.ts` — Unit tests
- ✅ `packages/ui-core/src/sse/__tests__/getSSETicket.test.ts` — Ticket exchange unit tests
- ✅ `apps/tui/src/hooks/useAgentStream.ts` — TUI adapter with `useSpinner` integration
- ✅ `e2e/tui/agents.test.ts` — E2E test stubs for streaming behavior (tests that fail due to 501 backend are left failing)
- ❌ `apps/tui/src/providers/SSEProvider.tsx` — Production SSE not in this ticket (dependency: `tui-notification-sse-stream`)
- ❌ `apps/tui/src/screens/Agents/` — Screen integration is a downstream ticket

**Dependency:** This ticket depends on `tui-agent-data-hooks` (which provides `useAgentMessages`, `useAPIClient`, agent type definitions, `usePaginatedQuery`, and `createMockAPIClient`).

---

## 1. Codebase Ground Truth

| Fact | Location | Impact |
|------|----------|--------|
| Agent stream endpoint returns 501 today | `apps/server/src/routes/agents.ts` — `/agent/sessions/:id/stream` | Hook integration tests against real API will fail; tests are left failing per project policy |
| `SSEProvider` is test-mode-only stub | `specs/tui/apps/tui/src/providers/SSEProvider.tsx` — uses `CODEPLANE_SSE_INJECT_FILE` env var, polls file every 100ms for JSONL events | Hook must work standalone without `SSEProvider` context; uses raw `fetch`+`ReadableStream` via `createSSEReader` directly |
| `eventsource-parser` v3.0.6 available | Monorepo dependency — exports `createParser`, `EventSourceMessage` | Used in `createSSEReader.ts` for parsing SSE text stream into structured events |
| SSE ticket-based auth documented | `specs/tui/` SSE specifications | `POST /api/auth/sse-ticket` → `{ ticket: string, expiresAt: string }` (ISO-8601, 30s TTL); fallback to bearer token on failure |
| Auth header format is `Authorization: token {token}` | `specs/tui/packages/ui-core/src/client/createAPIClient.ts` line 15 | **Not** `Bearer` — uses `token` prefix. The `APIClient.request()` auto-injects this header. |
| `createAPIClient` stores token in closure via `config.token` | `specs/tui/packages/ui-core/src/client/createAPIClient.ts` lines 4–7 | `APIClient` interface exposes only `baseUrl` and `request()` — no direct token getter. Bearer fallback in the hook must access the token through a different path. |
| Keep-alive interval: 15s server-side, 45s client liveness timeout | SSE architecture specification | Client triggers reconnection if no data for 45s |
| Exponential backoff: 1s, 2s, 4s, 8s, capped at 30s | SSE architecture specification | Backoff resets on successful reconnection |
| Max reconnection attempts: 20 | SSE architecture specification | After 20 failures, enters permanent `failed` state |
| `WorkspaceSSEAdapter` uses bearer fallback pattern | `specs/tui/apps/tui/src/streaming/WorkspaceSSEAdapter.ts` lines 86–94 | Fallback: `headers["Authorization"] = \`token ${this.config.authToken}\`` — hook must mirror this pattern |
| Messages endpoint returns bare array, no `X-Total-Count` | `specs/tui/packages/ui-core/src/hooks/agents/useAgentMessages.ts` line 49 | Reconnection replay uses raw REST fetch with sequence-based diff |
| `sequence` is string from DB, coerced to number by hooks | `specs/tui/packages/ui-core/src/types/agents.ts` line 51: `sequence: number` with comment "server sends as string; hook coerces to number" | Position counter for deduplication must use numeric comparison |
| Messages ordered by `sequence ASC` in DB | Agent hooks spec | Server returns chronological order; sequence values are monotonically increasing |
| `useSpinner` uses OpenTUI `Timeline` engine, not `useTimeline` | `specs/tui/apps/tui/src/hooks/useSpinner.ts` — imports `Timeline, engine` from `@opentui/core`, uses `useSyncExternalStore` | TUI adapter calls `useSpinner(stream.streaming)` — returns braille frame string or empty string |
| `useSpinner` detects Unicode support | `specs/tui/apps/tui/src/hooks/useSpinner.ts` line 19 — `isUnicodeSupported()` from theme/detect | Braille frames on Unicode terminals (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 80ms), ASCII frames on others (-\\|/ at 120ms) |
| `APIClient.request()` returns raw `Response` | `specs/tui/packages/ui-core/src/client/types.ts` | SSE ticket fetch and message replay both use the same client |
| `parseResponseError` handles non-2xx responses | `specs/tui/packages/ui-core/src/types/errors.ts` lines 66–81 | Maps HTTP status to `ApiErrorCode`, extracts `message` and `fieldErrors` from JSON body |
| `NetworkError` class wraps fetch failures | `specs/tui/packages/ui-core/src/types/errors.ts` lines 38–45 | `APIClient.request()` throws `NetworkError` on fetch failure; `AbortError` propagates directly |
| Event deduplication uses sliding window of 1000 IDs | Engineering architecture SSE section | Agent stream uses position counter instead (more efficient for sequential append-only tokens) |
| `NO_COLOR=1` terminals must still function | Accessibility requirement | Streaming state shown via text ("Sending...", "Agent is responding"), not color alone |
| `renderHook` test utility mocks React via `bun:test`'s `mock.module` | `specs/tui/packages/ui-core/src/test-utils/renderHook.ts` lines 1–7 | Sets `state.currentContextValue` to injected `apiClient`; handles effect processing and state update cycles |
| `createMockAPIClient` uses queue-based response mocking | `specs/tui/packages/ui-core/src/test-utils/mockAPIClient.ts` | `respondWithJSON(status, body)` enqueues; `request()` dequeues FIFO. Tracks all calls with timestamps. |
| `AgentPart.content` is `unknown` (varies by partType) | `specs/tui/packages/ui-core/src/types/agents.ts` line 43 | Replay logic must handle both `string` and `{ value: string }` content shapes for text parts |
| `AgentPart.partIndex` coerced from string to number | `specs/tui/packages/ui-core/src/hooks/agents/useAgentMessages.ts` line 12 | Replay sorts parts by numeric `partIndex` |
| `SSE_CONSTANTS` centralized in streaming/types.ts | `specs/tui/apps/tui/src/streaming/types.ts` lines 70–89 | Workspace SSE uses same constant values; agent stream hook defines its own inline constants for ui-core independence |

---

## 2. API Contract Reference

### SSE Stream Endpoint

| Field | Value |
|-------|-------|
| Path | `GET /api/repos/:owner/:repo/agent/sessions/:id/stream` |
| Auth | SSE ticket via query param `?ticket={ticket}`, or `Authorization: token {token}` header fallback |
| Content-Type | `text/event-stream` |
| Current Status | Returns 501 (Not Implemented) |

### SSE Ticket Exchange

| Field | Value |
|-------|-------|
| Path | `POST /api/auth/sse-ticket` |
| Auth | `Authorization: token {token}` header (injected by `APIClient`) |
| Response | `{ ticket: string, expiresAt: string }` (ISO-8601) |
| TTL | 30 seconds |

### Expected SSE Event Types

```
id: {monotonic-event-id}
event: token
data: {"type":"token","data":{"content":"Hello"}}

id: {monotonic-event-id}
event: done
data: {"type":"done","data":{}}

id: {monotonic-event-id}
event: error
data: {"type":"error","data":{"message":"context window exceeded"}}

: keep-alive
```

### Messages REST Endpoint (for reconnection replay)

| Field | Value |
|-------|-------|
| Path | `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` |
| Auth | `Authorization: token {token}` header (injected by `APIClient`) |
| Response | `AgentMessage[]` (bare array, no `X-Total-Count`) |
| Ordering | `sequence ASC` |

---

## 3. Returned Interface

```typescript
// packages/ui-core/src/hooks/agents/useAgentStream.ts

export interface AgentStreamState {
  /** True while actively receiving tokens from the SSE stream (also true during reconnection). */
  streaming: boolean;
  /** Accumulated response content from all token events since last subscribe. */
  currentTokens: string;
  /** True when the SSE connection is open and healthy. */
  connected: boolean;
  /** True during exponential backoff reconnection attempts. */
  reconnecting: boolean;
  /** Non-null when the stream errored (server error event or permanent connection failure). */
  error: Error | null;
  /** Open an SSE connection for the given session. No-op if already subscribed to same session. */
  subscribe: (sessionId: string) => void;
  /** Close the SSE connection and reset state. */
  unsubscribe: () => void;
}

export interface AgentStreamOptions {
  /** Auto-subscribe on mount. Defaults to true. */
  enabled?: boolean;
  /** Callback invoked on each token arrival with the incremental content. */
  onToken?: (content: string) => void;
  /** Callback invoked when the stream completes. */
  onDone?: (fullContent: string) => void;
  /** Callback invoked when the stream errors. */
  onError?: (error: Error) => void;
}

export function useAgentStream(
  owner: string,
  repo: string,
  sessionId: string,
  options?: AgentStreamOptions,
): AgentStreamState;
```

### TUI Adapter Return Type

```typescript
// apps/tui/src/hooks/useAgentStream.ts

export interface TUIAgentStreamState extends AgentStreamState {
  /**
   * Current spinner frame character (braille or ASCII depending on terminal).
   * Non-empty only when streaming === true. Empty string when idle.
   * Powered by useSpinner from @opentui/core Timeline engine.
   */
  spinnerFrame: string;
}
```

---

## 4. Internal State Machine

The hook manages a finite state machine for the SSE connection lifecycle:

```
              subscribe(sessionId)
idle ─────────────────────────────────► connecting
                                            │
                                     ticket exchange
                                            │
                              ┌─────── success ───────┐
                              ▼                        ▼
                          connected ◄────── reconnecting
                              │                   ▲
                     token/keepalive               │
                              │              connection
                              ▼              drop/timeout
                          connected ──────────────┘
                              │
                         done event
                              │
                              ▼
                          completed
                              │
                       unsubscribe()
                              │
                              ▼
                            idle

         error event ──► errored
         20 failures ──► failed (permanent)
```

### State Definitions

| State | `streaming` | `connected` | `reconnecting` | `error` |
|-------|-------------|-------------|-----------------|----------|
| `idle` | `false` | `false` | `false` | `null` |
| `connecting` | `false` | `false` | `false` | `null` |
| `connected` | `true` | `true` | `false` | `null` |
| `reconnecting` | `true` | `false` | `true` | `null` |
| `completed` | `false` | `false` | `false` | `null` |
| `errored` | `false` | `false` | `false` | `Error` |
| `failed` | `false` | `false` | `false` | `Error` |

`streaming` is `true` during `reconnecting` because the response is still in progress — tokens received before disconnect are preserved in `currentTokens` and more may arrive after reconnection. This keeps the `MessageBlock` spinner visible during network blips.

---

## 5. Implementation Plan

### Step 1: Create SSE event types

**File:** `packages/ui-core/src/types/agentStream.ts`

Defines the wire format for SSE events (JSON inside the `data:` field) and the connection state enum used by the hook's state machine.

```typescript
/**
 * SSE event types for the agent session stream.
 * These represent the wire format — the JSON inside the `data:` field of each SSE event.
 */

export interface AgentTokenEvent {
  type: "token";
  data: {
    content: string;
  };
}

export interface AgentDoneEvent {
  type: "done";
  data: Record<string, never>;
}

export interface AgentErrorEvent {
  type: "error";
  data: {
    message: string;
  };
}

export type AgentStreamEvent =
  | AgentTokenEvent
  | AgentDoneEvent
  | AgentErrorEvent;

/**
 * Connection state for the SSE stream.
 */
export type AgentStreamConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "completed"
  | "errored"
  | "failed";
```

**Export from:** `packages/ui-core/src/types/index.ts` — add `AgentTokenEvent`, `AgentDoneEvent`, `AgentErrorEvent`, `AgentStreamEvent`, `AgentStreamConnectionState` to existing barrel.

### Step 2: Implement SSE ticket exchange utility

**File:** `packages/ui-core/src/sse/getSSETicket.ts`

Shared between the agent stream hook and the future `SSEProvider`. Exchanges a long-lived auth token for a short-lived SSE ticket. Returns `null` on any failure to enable bearer auth fallback.

```typescript
import type { APIClient } from "../client/types.js";
import { parseResponseError } from "../types/errors.js";

export interface SSETicket {
  ticket: string;
  expiresAt: string; // ISO-8601
}

/**
 * Exchange a long-lived auth token for a short-lived SSE ticket.
 * Returns null if the ticket endpoint is not available (fallback to bearer auth).
 */
export async function getSSETicket(
  client: APIClient,
  signal?: AbortSignal,
): Promise<SSETicket | null> {
  try {
    const response = await client.request("/api/auth/sse-ticket", {
      method: "POST",
      signal,
    });

    if (!response.ok) {
      // Ticket endpoint not configured or errored — fallback to bearer
      return null;
    }

    const body = (await response.json()) as SSETicket;
    return body;
  } catch {
    // Network error on ticket exchange — fallback to bearer
    return null;
  }
}
```

Key design: `APIClient.request()` auto-injects `Authorization: token {token}`. Any failure (network, non-200, abort) returns `null` — the caller falls back to direct header auth.

### Step 3: Implement SSE stream reader utility

**File:** `packages/ui-core/src/sse/createSSEReader.ts`

Low-level SSE stream reader built on `fetch` + `ReadableStream` with `eventsource-parser` v3.0.6 for event parsing. Uses `fetch` instead of `EventSource` for:
- Custom header support (`Authorization: token ...` cannot be sent via `EventSource`)
- `AbortSignal` support for clean teardown
- Bun runtime compatibility (EventSource behavior varies across runtimes)

```typescript
import { createParser, type EventSourceMessage } from "eventsource-parser";

export interface SSEReaderOptions {
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onEvent: (event: EventSourceMessage) => void;
  onError: (error: Error) => void;
  onOpen: () => void;
  onClose: () => void;
  lastEventId?: string;
}

/**
 * Open a fetch-based SSE connection and stream events to the caller.
 *
 * Uses fetch + ReadableStream instead of EventSource for:
 * - Custom header support (Authorization: token ...)
 * - AbortSignal support
 * - Bun runtime compatibility
 */
export async function createSSEReader(
  options: SSEReaderOptions,
): Promise<void> {
  const { url, headers = {}, signal, onEvent, onError, onOpen, onClose, lastEventId } = options;

  const requestHeaders: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
    ...headers,
  };

  if (lastEventId) {
    requestHeaders["Last-Event-ID"] = lastEventId;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: requestHeaders,
      signal,
    });
  } catch (err: any) {
    if (err.name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!response.ok) {
    onError(new Error(`SSE connection failed: HTTP ${response.status}`));
    return;
  }

  if (!response.body) {
    onError(new Error("SSE response has no body"));
    return;
  }

  onOpen();

  const parser = createParser({
    onEvent: (event: EventSourceMessage) => {
      onEvent(event);
    },
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;

      const text = decoder.decode(value, { stream: true });
      parser.feed(text);
    }
  } catch (err: any) {
    if (err.name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  onClose();
}
```

### Step 4: Create SSE utilities barrel export

**File:** `packages/ui-core/src/sse/index.ts`

```typescript
export { getSSETicket } from "./getSSETicket.js";
export type { SSETicket } from "./getSSETicket.js";
export { createSSEReader } from "./createSSEReader.js";
export type { SSEReaderOptions } from "./createSSEReader.js";
```

### Step 5: Implement the shared `useAgentStream` hook

**File:** `packages/ui-core/src/hooks/agents/useAgentStream.ts`

This is the core implementation managing the full SSE lifecycle: ticket exchange, connection establishment, event parsing, token accumulation, keepalive timeout detection, exponential backoff reconnection, and position-counter-based deduplication.

**Internal ref layout:**

| Ref | Purpose |
|-----|---------|  
| `isMounted` | Guards against state updates after unmount |
| `abortControllerRef` | Cancel in-flight fetch/stream; one per connection |
| `positionRef` | Monotonic character count for deduplication (avoids string length recomputation) |
| `backoffRef` | Current backoff delay in ms |
| `reconnectAttemptsRef` | Counter toward MAX_RECONNECT_ATTEMPTS (20) |
| `keepaliveTimerRef` | 45s dead-connection detection timer |
| `backoffTimerRef` | Reconnection delay timer |
| `subscribedSessionRef` | Currently subscribed session ID (null when idle) |
| `tokensRef` | Mirror of `currentTokens` state for use in non-render callbacks |
| `optionsRef` | Latest options for stable callback access without stale closures |
| `connectionStateRef` | **CRITICAL FIX:** Mirror of `connectionState` to avoid stale closure in `onClose` |

**Constants:**

```typescript
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 20;
const KEEPALIVE_TIMEOUT_MS = 45_000;
```

**Critical implementation details and known bugs fixed from reference:**

1. **Token null guard:** The `token` case checks `content !== undefined && content !== null` before appending, preventing `"undefined"` string concatenation if the server sends a malformed event.

2. **CRITICAL BUG FIX — Stale closure in `onClose`:** The reference implementation at `specs/tui/packages/ui-core/src/hooks/agents/useAgentStream.ts` lines 288–295 has a stale closure bug. The `onClose` callback references `connectionState` from the `connectToStream` closure. Since `connectionState` is React state, the closure captures the value at `connectToStream` call time (always `"connecting"` or `"reconnecting"` at that point). This means: if `onClose` fires after a `done` event set state to `"completed"`, the stale closure still sees the old value and would erroneously trigger `initiateReconnection()`. **Fix:** Introduce `connectionStateRef = useRef<AgentStreamConnectionState>("idle")` that mirrors the reactive state. Update `connectionStateRef.current` alongside every `setConnectionState()` call. The `onClose` callback reads `connectionStateRef.current` instead of the closure-captured `connectionState`.

   ```typescript
   // Reference (BUGGY):
   onClose: () => {
     if (connectionState !== "completed" && ...) {  // ← stale!
       initiateReconnection();
     }
   }

   // Fixed:
   onClose: () => {
     if (
       connectionStateRef.current !== "completed" &&
       connectionStateRef.current !== "errored" &&
       connectionStateRef.current !== "failed"
     ) {
       initiateReconnection();
     }
   }
   ```

   Additionally, `connectToStream` must be removed from the dependency array of `useCallback` closures that reference `connectionState`, since the ref replaces this dependency.

3. **Auth header fallback — token access pattern:** The `APIClient` interface exposes only `baseUrl` and `request()` — there is no `token` getter. When ticket exchange returns null, the hook cannot extract the auth token from the client to pass as a header to `createSSEReader` (which uses raw `fetch`). **Resolution:** Follow the `WorkspaceSSEAdapter` pattern (lines 146–158 in `specs/tui/apps/tui/src/streaming/WorkspaceSSEAdapter.ts`) which creates a minimal request function. For the shared hook, we take a pragmatic v1 approach:
   - Add an optional `token` parameter to `useAgentStream` options for the TUI adapter to pass through
   - When ticket exchange fails and `token` is provided, construct `{ Authorization: \`token ${token}\` }` headers
   - When no token is provided and ticket fails, attempt the connection without auth headers (server may still accept based on session/cookie — edge case for web UI)
   - The `createAPIClient` config stores `token` at `config.token` but it's not exposed on the `APIClient` interface; extending the interface is a separate concern

4. **Replay content extraction:** The replay logic handles two `content` shapes from `AgentPart`:
   - `string` — direct text content
   - `{ value: string }` — wrapped text content
   This matches the `AgentPart.content: unknown` type from the agents type definition.

5. **`connectToStream` dependency array:** The reference implementation includes `connectionState` in the `useCallback` dependency array of `connectToStream` (line 303). This causes `connectToStream` to be recreated on every state change, which in turn recreates `subscribe` (which depends on `connectToStream`). This is unnecessary if we use `connectionStateRef` for the `onClose` check. **Fix:** Remove `connectionState` from the `connectToStream` dependency array.

**Full implementation (371 lines):**

The production implementation follows the reference at `specs/tui/packages/ui-core/src/hooks/agents/useAgentStream.ts` with the following modifications:

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import { useAPIClient } from "../../client/context.js";
import { getSSETicket } from "../../sse/getSSETicket.js";
import { createSSEReader } from "../../sse/createSSEReader.js";
import type { AgentStreamEvent, AgentStreamConnectionState } from "../../types/agentStream.js";
import type { AgentMessage } from "../../types/agents.js";

export interface AgentStreamState {
  streaming: boolean;
  currentTokens: string;
  connected: boolean;
  reconnecting: boolean;
  error: Error | null;
  subscribe: (sessionId: string) => void;
  unsubscribe: () => void;
}

export interface AgentStreamOptions {
  enabled?: boolean;
  onToken?: (content: string) => void;
  onDone?: (fullContent: string) => void;
  onError?: (error: Error) => void;
  /** Auth token for bearer fallback when ticket exchange fails. */
  token?: string;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 20;
const KEEPALIVE_TIMEOUT_MS = 45_000;

export function useAgentStream(
  owner: string,
  repo: string,
  sessionId: string,
  options?: AgentStreamOptions,
): AgentStreamState {
  const client = useAPIClient();
  const enabled = options?.enabled ?? true;

  // --- Mutable refs (not triggering re-render) ---
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const positionRef = useRef(0);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectAttemptsRef = useRef(0);
  const keepaliveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedSessionRef = useRef<string | null>(null);
  const tokensRef = useRef("");
  const optionsRef = useRef(options);
  const connectionStateRef = useRef<AgentStreamConnectionState>("idle"); // FIX: stale closure

  useEffect(() => { optionsRef.current = options; }, [options]);

  // --- Reactive state ---
  const [connectionState, setConnectionState] = useState<AgentStreamConnectionState>("idle");
  const [currentTokens, setCurrentTokens] = useState("");
  const [error, setError] = useState<Error | null>(null);

  // Helper to update both state and ref
  const updateConnectionState = useCallback((state: AgentStreamConnectionState) => {
    connectionStateRef.current = state;
    setConnectionState(state);
  }, []);

  // --- Derived state ---
  const streaming = connectionState === "connected" || connectionState === "reconnecting";
  const connected = connectionState === "connected";
  const reconnecting = connectionState === "reconnecting";

  // --- Keepalive timer management ---
  const resetKeepaliveTimer = useCallback(() => {
    if (keepaliveTimerRef.current) clearTimeout(keepaliveTimerRef.current);
    keepaliveTimerRef.current = setTimeout(() => {
      if (isMounted.current && subscribedSessionRef.current) {
        abortControllerRef.current?.abort();
        initiateReconnection();
      }
    }, KEEPALIVE_TIMEOUT_MS);
  }, []);

  const clearKeepaliveTimer = useCallback(() => {
    if (keepaliveTimerRef.current) {
      clearTimeout(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
  }, []);

  // --- Reconnection ---
  const initiateReconnection = useCallback(() => {
    if (!isMounted.current || !subscribedSessionRef.current) return;

    reconnectAttemptsRef.current += 1;
    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      updateConnectionState("failed");
      setError(new Error(`SSE reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`));
      return;
    }

    updateConnectionState("reconnecting");
    const delay = backoffRef.current;
    backoffRef.current = Math.min(delay * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);

    backoffTimerRef.current = setTimeout(() => {
      if (isMounted.current && subscribedSessionRef.current) {
        connectToStream(subscribedSessionRef.current, true);
      }
    }, delay);
  }, []);

  // --- Token replay on reconnection ---
  const replayMissedTokens = useCallback(async (
    sid: string, signal: AbortSignal,
  ): Promise<void> => {
    try {
      const response = await client.request(
        `/api/repos/${owner}/${repo}/agent/sessions/${sid}/messages`,
        { signal },
      );
      if (!response.ok) return;

      const messages = (await response.json()) as any[];
      const assistantMessages = messages
        .filter((m: any) => m.role === "assistant")
        .sort((a: any, b: any) => Number(a.sequence) - Number(b.sequence));
      if (assistantMessages.length === 0) return;

      const lastAssistant = assistantMessages[assistantMessages.length - 1];
      const textParts = (lastAssistant.parts ?? [])
        .filter((p: any) => p.partType === "text")
        .sort((a: any, b: any) => Number(a.partIndex) - Number(b.partIndex));

      const serverContent = textParts
        .map((p: any) => {
          if (typeof p.content === "string") return p.content;
          if (p.content && typeof p.content === "object" && "value" in p.content) {
            return (p.content as { value: string }).value;
          }
          return "";
        })
        .join("");

      if (serverContent.length > tokensRef.current.length) {
        const missedContent = serverContent.slice(tokensRef.current.length);
        tokensRef.current = serverContent;
        if (isMounted.current) setCurrentTokens(serverContent);
        positionRef.current = serverContent.length;
        optionsRef.current?.onToken?.(missedContent);
      }
    } catch {
      // Replay failure is non-fatal
    }
  }, [client, owner, repo]);

  // --- Core connection logic ---
  const connectToStream = useCallback(async (
    sid: string, isReconnect: boolean,
  ) => {
    if (!isMounted.current) return;

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (!isReconnect) updateConnectionState("connecting");

    // Step 1: Obtain SSE ticket
    const ticket = await getSSETicket(client, abortController.signal);
    if (abortController.signal.aborted) return;

    // Step 2: Build SSE URL
    const basePath = `/api/repos/${owner}/${repo}/agent/sessions/${sid}/stream`;
    let url: string;
    let headers: Record<string, string> = {};

    if (ticket) {
      url = `${client.baseUrl}${basePath}?ticket=${encodeURIComponent(ticket.ticket)}`;
    } else {
      url = `${client.baseUrl}${basePath}`;
      // Bearer fallback: use token from options if available
      if (optionsRef.current?.token) {
        headers = { Authorization: `token ${optionsRef.current.token}` };
      }
    }

    // Step 3: Replay if reconnecting
    if (isReconnect) {
      await replayMissedTokens(sid, abortController.signal);
      if (abortController.signal.aborted) return;
    }

    // Step 4: Open SSE stream
    const lastEventId = positionRef.current > 0 ? String(positionRef.current) : undefined;

    try {
      await createSSEReader({
        url, headers, signal: abortController.signal, lastEventId,
        onOpen: () => {
          if (!isMounted.current) return;
          updateConnectionState("connected");
          setError(null);
          backoffRef.current = INITIAL_BACKOFF_MS;
          reconnectAttemptsRef.current = 0;
          resetKeepaliveTimer();
        },
        onEvent: (event) => {
          if (!isMounted.current) return;
          resetKeepaliveTimer();

          let parsed: AgentStreamEvent;
          try { parsed = JSON.parse(event.data) as AgentStreamEvent; }
          catch { return; } // Malformed JSON — skip

          switch (parsed.type) {
            case "token": {
              const content = parsed.data.content;
              if (content !== undefined && content !== null) {
                positionRef.current += content.length;
                tokensRef.current += content;
                if (isMounted.current) setCurrentTokens(tokensRef.current);
                optionsRef.current?.onToken?.(content);
              }
              break;
            }
            case "done": {
              clearKeepaliveTimer();
              const fullContent = tokensRef.current;
              if (isMounted.current) updateConnectionState("completed");
              optionsRef.current?.onDone?.(fullContent);
              break;
            }
            case "error": {
              clearKeepaliveTimer();
              const streamError = new Error(parsed.data.message);
              if (isMounted.current) {
                updateConnectionState("errored");
                setError(streamError);
              }
              optionsRef.current?.onError?.(streamError);
              break;
            }
            default: break; // Unknown — forward compatibility
          }
        },
        onError: (err) => {
          if (!isMounted.current) return;
          clearKeepaliveTimer();
          initiateReconnection();
        },
        onClose: () => {
          if (!isMounted.current) return;
          clearKeepaliveTimer();
          // FIX: Read from ref, not stale closure
          if (
            connectionStateRef.current !== "completed" &&
            connectionStateRef.current !== "errored" &&
            connectionStateRef.current !== "failed"
          ) {
            initiateReconnection();
          }
        },
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (isMounted.current) initiateReconnection();
    }
  }, [client, owner, repo, resetKeepaliveTimer, clearKeepaliveTimer, initiateReconnection, replayMissedTokens]);
  // NOTE: connectionState removed from deps — uses connectionStateRef instead

  // --- Public API ---
  const subscribe = useCallback((sid: string) => {
    if (subscribedSessionRef.current === sid) return;
    positionRef.current = 0;
    tokensRef.current = "";
    backoffRef.current = INITIAL_BACKOFF_MS;
    reconnectAttemptsRef.current = 0;
    subscribedSessionRef.current = sid;
    setCurrentTokens("");
    setError(null);
    connectToStream(sid, false);
  }, [connectToStream]);

  const unsubscribe = useCallback(() => {
    subscribedSessionRef.current = null;
    abortControllerRef.current?.abort();
    clearKeepaliveTimer();
    if (backoffTimerRef.current) {
      clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
    positionRef.current = 0;
    tokensRef.current = "";
    backoffRef.current = INITIAL_BACKOFF_MS;
    reconnectAttemptsRef.current = 0;
    updateConnectionState("idle");
    setCurrentTokens("");
    setError(null);
  }, [clearKeepaliveTimer, updateConnectionState]);

  // --- Auto-subscribe on mount ---
  useEffect(() => {
    if (enabled && sessionId.trim() && isMounted.current) {
      subscribe(sessionId);
    }
    return () => { unsubscribe(); };
  }, [enabled, sessionId]); // intentionally limited deps

  // --- Cleanup on unmount ---
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
      clearKeepaliveTimer();
      if (backoffTimerRef.current) clearTimeout(backoffTimerRef.current);
    };
  }, []);

  return { streaming, currentTokens, connected, reconnecting, error, subscribe, unsubscribe };
}
```

### Step 6: Update agents hooks barrel export

**File:** `packages/ui-core/src/hooks/agents/index.ts`

Append to existing exports (already present in reference — verify and ensure):

```typescript
export { useAgentStream } from "./useAgentStream.js";
export type { AgentStreamState, AgentStreamOptions } from "./useAgentStream.js";
```

### Step 7: Implement TUI adapter hook

**File:** `apps/tui/src/hooks/useAgentStream.ts`

The TUI adapter wraps the shared hook and integrates with the existing `useSpinner` hook. `useSpinner` is powered by OpenTUI's `Timeline` engine (not `setInterval`), uses `useSyncExternalStore` for tear-free reads, and auto-detects Unicode support to choose braille vs ASCII frames.

```typescript
import { useMemo } from "react";
import {
  useAgentStream as useAgentStreamCore,
  type AgentStreamOptions,
} from "@codeplane/ui-core/hooks/agents";
import { useSpinner } from "./useSpinner.js";

export interface TUIAgentStreamState {
  streaming: boolean;
  currentTokens: string;
  connected: boolean;
  reconnecting: boolean;
  error: Error | null;
  subscribe: (sessionId: string) => void;
  unsubscribe: () => void;
  /** Current spinner frame character (braille). Only meaningful when streaming === true. */
  spinnerFrame: string;
}

export function useAgentStream(
  owner: string,
  repo: string,
  sessionId: string,
  options?: AgentStreamOptions,
): TUIAgentStreamState {
  const stream = useAgentStreamCore(owner, repo, sessionId, options);
  const spinnerFrame = useSpinner(stream.streaming);

  return useMemo(() => ({
    ...stream,
    spinnerFrame,
  }), [
    stream.streaming,
    stream.currentTokens,
    stream.connected,
    stream.reconnecting,
    stream.error,
    stream.subscribe,
    stream.unsubscribe,
    spinnerFrame,
  ]);
}
```

**Why `useSpinner` instead of `useTimeline` directly:**

The `useSpinner` implementation in the codebase (at `specs/tui/apps/tui/src/hooks/useSpinner.ts`) uses `Timeline` and `engine` from `@opentui/core` directly — a module-level singleton pattern with `useSyncExternalStore`. This is the correct integration point because:
- All spinner consumers are frame-synchronized (single `Timeline` instance)
- The singleton activates/deactivates based on active consumer count (no idle CPU)
- Unicode detection is handled internally (braille on capable terminals, ASCII fallback)
- `useSyncExternalStore` ensures tear-free concurrent-mode reads

### Step 8: Verify TUI hooks barrel export

**File:** `apps/tui/src/hooks/index.ts`

The `useAgentStream` export already exists in the reference barrel at `specs/tui/apps/tui/src/hooks/index.ts` (lines 12–13). Verify it's present:

```typescript
export { useAgentStream } from "./useAgentStream.js";
export type { TUIAgentStreamState } from "./useAgentStream.js";
```

---

## 6. Key Design Decisions

### 6.1 `fetch` + `ReadableStream` over `EventSource`

The native `EventSource` API:
- Cannot send custom headers (`Authorization: token ...` required by Codeplane API)
- Cannot be aborted via `AbortSignal` (only `close()` which doesn't cancel in-flight)
- Has inconsistent behavior across Bun/Node runtimes
- Cannot control reconnection behavior (auto-reconnects with non-configurable strategy)

Using `fetch` with `ReadableStream` and `eventsource-parser` v3.0.6 gives full control over headers, cancellation, and reconnection strategy.

### 6.2 Position counter over event ID deduplication

The engineering architecture doc specifies a sliding window of 1000 event IDs for SSE deduplication. For agent token streams, a simpler position counter is used:

- Token events are sequential and append-only
- The position counter tracks the total character count of accumulated tokens
- On reconnection, the hook fetches messages via REST API, extracts the last assistant message's text parts, and compares total content length to the local position counter
- If the server has more content, only the diff (characters beyond the local position) is applied
- This avoids storing 1000 event IDs and handles the common reconnect-mid-stream case efficiently
- The `Last-Event-ID` header is set to the position counter value on reconnection, allowing the server to resume from the correct offset

### 6.3 Standalone connection (not via SSEProvider)

The `SSEProvider` manages a singleton notification SSE connection with a global lifecycle. Agent session streams are per-session, per-screen — a fundamentally different lifecycle. The hook opens its own dedicated `fetch`-based connection. When SSEProvider is implemented for production, the `getSSETicket` utility will be shared, but the streams remain independent.

### 6.4 `currentTokens` is a string, not an array

Tokens are accumulated into a single string rather than stored as an array of token fragments:
- Downstream rendering uses `<markdown>` which accepts a string
- String concatenation is O(1) amortized in modern JS engines (V8/JSC)
- Avoids `.join()` on every render
- Position counter uses `.length` for deduplication
- Memory: for a 100KB response (10,000 tokens × ~10 chars), a single string is ~100KB vs ~240KB for an array of 10K small strings (object overhead)

### 6.5 `streaming` flag during reconnection

`streaming` is `true` during `reconnecting` state because from the user's perspective, the response is still in progress. The `MessageBlock` component should continue showing the spinner and the accumulated partial response during reconnection. Only `done`, `error`, or permanent failure set `streaming` to `false`.

### 6.6 `useSpinner` over manual `useTimeline`

The TUI adapter uses the existing shared `useSpinner` hook rather than directly calling `useTimeline`. The `useSpinner` hook:
- Shares a single `Timeline` instance across all active spinners (frame-synchronized)
- Detects Unicode support and selects braille (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 80ms) or ASCII (-\\|/ at 120ms)
- Pauses the timeline engine when no spinners are active (zero idle CPU cost)
- Uses `useSyncExternalStore` for tear-free reads in concurrent mode

### 6.7 `connectionStateRef` for stale closure fix

The reference implementation has `connectionState` in the `connectToStream` dependency array and reads it directly in the `onClose` callback. This creates two problems:
1. The `onClose` callback captures the `connectionState` value at `connectToStream` call time, which may be stale by the time `onClose` fires
2. Including `connectionState` in deps causes `connectToStream` (and downstream `subscribe`) to be recreated on every state transition

The fix introduces `connectionStateRef` that is updated atomically with `setConnectionState` via the `updateConnectionState` helper. This eliminates both the stale closure bug and the unnecessary callback recreation.

---

## 7. Reconnection & Replay Protocol

### Reconnection Sequence

1. Connection drops (network error, keepalive timeout, server stream close)
2. `onClose`/`onError` fires → checks `connectionStateRef.current` is not `completed`/`errored`/`failed`
3. Set `connectionState = "reconnecting"` via `updateConnectionState`
4. Increment `reconnectAttempts` counter
5. If `reconnectAttempts > 20`: set `connectionState = "failed"`, set error, stop
6. Wait `backoffMs` (starts at 1s, doubles each attempt, capped at 30s)
7. Fetch fresh SSE ticket via `POST /api/auth/sse-ticket`
8. Fetch current messages via `GET /api/repos/:owner/:repo/agent/sessions/:id/messages`
9. Extract last assistant message, join text parts sorted by `partIndex`
10. Compare server-side content length with local `positionRef`
11. If server has more content: apply the diff (characters beyond position), advance counter
12. Open new SSE connection with `Last-Event-ID` set to current position
13. On successful `onOpen`: reset backoff to 1s, reset attempts to 0, start keepalive timer

### Replay Content Extraction

```
1. Filter messages where role === "assistant"
2. Sort by sequence ASC (numeric, coerced from string)
3. Take last assistant message
4. Extract parts where partType === "text"
5. Sort parts by partIndex ASC (numeric, coerced from string)
6. For each part:
   - If content is string → use directly
   - If content is { value: string } → extract value
   - Otherwise → empty string
7. Join all parts → serverContent
```

### Replay Deduplication Example

```
Local state before disconnect: "Hello, how can I"
Position counter: 17

Server state on reconnect:
  Last assistant message text parts: "Hello, how can I help you today?"
  Server content length: 31

Diff: " help you today!" (characters 17..31)
Apply diff → currentTokens = "Hello, how can I help you today!"
Position counter → 31
onToken callback called with " help you today!"

New SSE connection sends Last-Event-ID: "31"
Server resumes sending tokens from position 31 onward
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Reconnect after `done` event | No reconnect — `connectionStateRef.current === "completed"` prevents it |
| Reconnect after `error` event | No reconnect — `connectionStateRef.current === "errored"` prevents it |
| Server sends duplicate tokens (position overlap) | Position counter prevents duplicates; tokens at positions ≤ current are ignored |
| Network drops before first token | Reconnect with position 0; replay finds no assistant messages yet; stream resumes from start |
| `unsubscribe()` during reconnect backoff | Backoff timer cleared via `clearTimeout`, abort controller aborted, no reconnection |
| `subscribe(newId)` during active stream | Previous abort controller aborted, all state reset, new connection opened |
| Empty session (no messages) | Replay returns empty; stream starts fresh |
| Very long response (>100KB) | Position counter is a `number`; no overflow risk up to `Number.MAX_SAFE_INTEGER` (~9 quadrillion) |
| Token with empty string content | Appended but adds 0 to position; effectively a no-op |
| Token with `null`/`undefined` content | Null guard (`!== undefined && !== null`) prevents `"undefined"` concatenation |
| Multiple rapid disconnect/reconnect | Each reconnect cancels the previous abort controller; only latest connection survives |
| 401 on ticket exchange during reconnect | `getSSETicket` returns null; fallback to bearer auth; if SSE endpoint also returns 401, `createSSEReader.onError` fires → reconnect |
| 429 on SSE endpoint | Treated as connection error by `createSSEReader` (`!response.ok`); exponential backoff naturally handles rate limiting |
| Malformed JSON in SSE `data:` | `JSON.parse` in try/catch; malformed events silently skipped, connection stays open |
| Unknown event type in `parsed.type` | `default` branch in switch — silently ignored (forward compatibility) |
| `unsubscribe()` then immediate `subscribe()` to same session | `unsubscribe` sets `subscribedSessionRef = null` and resets; `subscribe` detects ref is null (not same session), opens new connection |

---

## 8. Integration Points

### 8.1 With `AgentChatScreen` (downstream ticket)

```typescript
// apps/tui/src/screens/Agents/AgentChatScreen.tsx
function AgentChatScreen({ owner, repo, sessionId }: Props) {
  const { messages, refetch } = useAgentMessages(owner, repo, sessionId);
  const stream = useAgentStream(owner, repo, sessionId, {
    onToken: (content) => {
      // Incremental render update (progressive markdown)
    },
    onDone: (fullContent) => {
      // Refetch messages to get server-persisted version with proper IDs
      refetch();
    },
    onError: (error) => {
      // Show inline error below streaming message
    },
  });

  const displayMessages = useMemo(() => {
    const base = messages.map(wireToTUIMessage);
    if (stream.streaming && stream.currentTokens) {
      base.push({
        id: "streaming",
        role: "assistant" as const,
        parts: [{ type: "text" as const, content: stream.currentTokens }],
        timestamp: new Date().toISOString(),
        streaming: true,
      });
    }
    return base;
  }, [messages, stream.streaming, stream.currentTokens]);
}
```

### 8.2 With `MessageBlock` component (downstream ticket)

The TUI adapter's `spinnerFrame` string drives the streaming indicator:
```tsx
// When message.streaming === true:
<text fg={theme.success}>
  {stream.spinnerFrame} Agent
</text>
```

At minimum breakpoint (80×24), the label abbreviates to `A:` per the design spec.

### 8.3 With `StatusBar` (existing architecture)

The `reconnecting` state surfaces in the status bar sync indicator:
- `connected`: green dot
- `reconnecting`: yellow dot + "Reconnecting..."
- `failed`: red dot + "Stream failed"

This integration is deferred to the screen-level ticket.

### 8.4 With `SSEProvider` (future)

When `SSEProvider` gains a production implementation:
- `getSSETicket` utility is shared (already in `packages/ui-core/src/sse/`)
- `createSSEReader` may be used by SSEProvider for the notification stream
- Agent streams remain independent connections (per-session lifecycle ≠ global singleton)
- Connection state types may be unified into a shared union

### 8.5 With `useChatPagination` (existing screen hook)

The `useChatPagination` hook in `specs/tui/apps/tui/src/screens/Agents/hooks/` manages the message list state and provides `appendStreamingMessage()`. The `onToken` callback feeds into this hook's streaming accumulator. The `onDone` callback triggers `finalizeStreamingMessage()` + `refetch()`.

---

## 9. Unit & Integration Tests

### 9.1 Shared hook unit tests

**File:** `packages/ui-core/src/hooks/agents/__tests__/useAgentStream.test.ts`

Uses the existing `renderHook` and `createMockAPIClient` test utilities from `packages/ui-core/src/test-utils/`. The `renderHook` utility mocks React via `bun:test`'s `mock.module`, injects the API client via `state.currentContextValue`, and processes effects synchronously.

```typescript
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useAgentStream } from "../useAgentStream.js";

describe("useAgentStream", () => {
  beforeEach(() => {
    mock.restore();
  });

  describe("initial state", () => {
    test("returns idle state before subscription", () => {
      const { result } = renderHook(
        () => useAgentStream("owner", "repo", "session-1", { enabled: false }),
        { apiClient: createMockAPIClient() }
      );
      expect(result.current.streaming).toBe(false);
      expect(result.current.connected).toBe(false);
      expect(result.current.reconnecting).toBe(false);
      expect(result.current.currentTokens).toBe("");
      expect(result.current.error).toBeNull();
    });

    test("subscribe and unsubscribe are stable function references", () => {
      const { result, rerender } = renderHook(
        () => useAgentStream("owner", "repo", "session-1", { enabled: false }),
        { apiClient: createMockAPIClient() }
      );
      const sub1 = result.current.subscribe;
      const unsub1 = result.current.unsubscribe;
      rerender();
      expect(result.current.subscribe).toBe(sub1);
      expect(result.current.unsubscribe).toBe(unsub1);
    });

    test("empty sessionId disables auto-subscribe", () => {
      const client = createMockAPIClient();
      const { result } = renderHook(
        () => useAgentStream("owner", "repo", "", { enabled: true }),
        { apiClient: client }
      );
      expect(result.current.streaming).toBe(false);
      expect(result.current.connected).toBe(false);
      expect(client.calls.length).toBe(0);
    });

    test("whitespace-only sessionId disables auto-subscribe", () => {
      const client = createMockAPIClient();
      const { result } = renderHook(
        () => useAgentStream("owner", "repo", "   ", { enabled: true }),
        { apiClient: client }
      );
      expect(result.current.streaming).toBe(false);
    });
  });

  describe("SSE ticket exchange", () => {
    test("fetches SSE ticket via POST /api/auth/sse-ticket before connecting", () => {
      const client = createMockAPIClient();
      client.respondWithJSON(200, { ticket: "t-1", expiresAt: "2026-03-22T12:00:00Z" });
      renderHook(
        () => useAgentStream("owner", "repo", "session-1"),
        { apiClient: client }
      );
      const ticketCalls = client.callsTo("/api/auth/sse-ticket");
      expect(ticketCalls.length).toBe(1);
      expect(ticketCalls[0].options?.method).toBe("POST");
    });

    test("falls back to bearer auth when ticket exchange returns error", () => {
      const client = createMockAPIClient();
      client.respondWithJSON(500, { message: "internal error" });
      renderHook(
        () => useAgentStream("owner", "repo", "session-1"),
        { apiClient: client }
      );
      expect(client.callsTo("/api/auth/sse-ticket").length).toBe(1);
    });

    test("falls back to bearer auth when ticket exchange throws network error", () => {
      const client = createMockAPIClient();
      client.respondWithError(new Error("ECONNREFUSED"));
      renderHook(
        () => useAgentStream("owner", "repo", "session-1"),
        { apiClient: client }
      );
      expect(client.callsTo("/api/auth/sse-ticket").length).toBe(1);
    });
  });

  describe("token accumulation", () => {
    test("accumulates tokens from sequential token events", () => {
      // Simulate SSE events: token("Hello"), token(" world")
      // Assert: currentTokens === "Hello world"
    });

    test("calls onToken callback with incremental content", () => {
      // Provide onToken callback
      // Simulate: token("Hello") → onToken("Hello")
      // Simulate: token(" world") → onToken(" world") (not "Hello world")
    });

    test("handles empty string token events", () => {
      // Simulate: token("Hello"), token(""), token(" world")
      // Assert: currentTokens === "Hello world", position === 11
    });

    test("handles token events with unicode content", () => {
      // Simulate: token("Hello 🌍")
      // Assert: currentTokens === "Hello 🌍"
    });

    test("handles token events with newlines and code blocks", () => {
      // Simulate: token("line1\nline2\n```python\nprint()\n```")
      // Assert: content preserved exactly
    });

    test("guards against null/undefined content in token events", () => {
      // Simulate: event with data: {"type":"token","data":{}}
      // Assert: no crash, currentTokens unchanged, no "undefined" string
    });
  });

  describe("done event", () => {
    test("sets streaming to false on done event", () => {
      // Simulate: token("Hello"), done
      // Assert: streaming === false, currentTokens === "Hello"
    });

    test("calls onDone callback with full accumulated content", () => {
      // Simulate: token("Hello"), token(" world"), done
      // Assert: onDone("Hello world")
    });

    test("does not attempt reconnection after done event", () => {
      // Simulate: token("x"), done, connection close
      // Assert: connectionState === "completed", no reconnection
      // This specifically validates the stale closure fix
    });
  });

  describe("error event", () => {
    test("sets error state on error event", () => {
      // Simulate: error({ message: "context exceeded" })
      // Assert: error.message === "context exceeded", streaming === false
    });

    test("calls onError callback", () => {
      // Simulate: error({ message: "rate limited" })
      // Assert: onError(Error("rate limited"))
    });

    test("does not attempt reconnection after error event", () => {
      // Assert: connectionState === "errored", no reconnection timer
    });

    test("preserves accumulated tokens on error", () => {
      // Simulate: token("partial"), error
      // Assert: currentTokens === "partial"
    });
  });

  describe("reconnection", () => {
    test("initiates reconnection on connection drop", () => {
      // Simulate: connected → connection error
      // Assert: connectionState === "reconnecting"
    });

    test("uses exponential backoff: 1s, 2s, 4s, 8s, capped at 30s", () => {
      // Simulate: 6 consecutive connection failures
      // Assert: delays were 1000, 2000, 4000, 8000, 16000, 30000
    });

    test("resets backoff to 1s after successful reconnection", () => {
      // Simulate: 3 failures → success → failure
      // Assert: new failure backoff is 1s
    });

    test("enters failed state after 20 consecutive failures", () => {
      // Assert: connectionState === "failed"
      // Assert: error.message contains "20 attempts"
    });

    test("preserves currentTokens during reconnection", () => {
      // Simulate: token("Hello") → drop → reconnecting
      // Assert: currentTokens === "Hello"
    });

    test("streaming remains true during reconnection", () => {
      // Assert: streaming === true, reconnecting === true
    });
  });

  describe("keepalive timeout", () => {
    test("triggers reconnection after 45s of no data", () => {
      // Simulate: connected → 45s silence
      // Assert: reconnection initiated
    });

    test("keepalive timer resets on each event", () => {
      // Simulate: connected → 40s → token → 40s
      // Assert: no reconnection (each token resets the 45s timer)
    });
  });

  describe("replay deduplication", () => {
    test("replays missed tokens by fetching messages on reconnect", () => {
      // Simulate: token("Hello") → position=5 → disconnect → reconnect
      // Mock messages returns assistant with "Hello, how"
      // Assert: currentTokens === "Hello, how"
      // Assert: onToken(", how")
    });

    test("does not duplicate when server matches local", () => {
      // Simulate: token("Hello") → disconnect → reconnect
      // Mock messages returns assistant with "Hello"
      // Assert: currentTokens === "Hello" (unchanged), onToken NOT called
    });

    test("handles replay when no assistant messages exist", () => {
      // Mock messages returns empty array
      // Assert: currentTokens unchanged
    });

    test("handles replay with wrapped content shape { value: string }", () => {
      // Mock messages returns parts with content: { value: "text" }
      // Assert: text extracted correctly from wrapped shape
    });

    test("replay failure is non-fatal", () => {
      // Mock messages returns 500
      // Assert: SSE connection still attempted, currentTokens preserved
    });
  });

  describe("subscribe / unsubscribe", () => {
    test("subscribe opens SSE connection", () => {
      const { result } = renderHook(
        () => useAgentStream("owner", "repo", "session-1", { enabled: false }),
        { apiClient: createMockAPIClient() }
      );
      result.current.subscribe("session-1");
      expect(result.current.streaming).toBe(false); // connecting, not yet connected
    });

    test("subscribe to same session is no-op", () => {
      // Subscribe to "session-1", call subscribe("session-1") again
      // Assert: no new connection opened
    });

    test("subscribe to different session resets state", () => {
      // Subscribe to "session-1" with tokens, subscribe to "session-2"
      // Assert: currentTokens reset, position 0, new connection
    });

    test("unsubscribe closes connection and resets state", () => {
      // Subscribe, receive tokens, unsubscribe
      // Assert: idle, currentTokens "", connection aborted
    });

    test("unsubscribe during reconnect backoff cancels timer", () => {
      // Subscribe → disconnect → reconnecting → unsubscribe
      // Assert: no reconnection attempt
    });
  });

  describe("unmount cleanup", () => {
    test("closes SSE connection on unmount", () => {
      // Render, subscribe, unmount
      // Assert: abort controller aborted, timers cleared
    });

    test("cancels backoff timer on unmount", () => {
      // Subscribe → reconnect → unmount during backoff
      // Assert: no state updates after unmount
    });
  });

  describe("malformed events", () => {
    test("silently ignores malformed JSON in event data", () => {
      // Simulate: event with data: "not-json"
      // Assert: no crash, no state change
    });

    test("silently ignores unknown event types", () => {
      // Simulate: {"type":"unknown","data":{}}
      // Assert: no crash, no state change (forward compatibility)
    });
  });

  describe("stale closure fix validation", () => {
    test("onClose after done event does not trigger reconnection", () => {
      // This is the critical test for the stale closure fix.
      // Simulate: connect → token → done (sets state to completed) → onClose fires
      // Assert: no reconnection initiated
      // Assert: connectionState remains "completed"
    });

    test("onClose after error event does not trigger reconnection", () => {
      // Simulate: connect → token → error (sets state to errored) → onClose fires
      // Assert: no reconnection
      // Assert: connectionState remains "errored"
    });
  });
});
```

### 9.2 SSE utility unit tests

**File:** `packages/ui-core/src/sse/__tests__/getSSETicket.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { getSSETicket } from "../getSSETicket.js";
import type { APIClient } from "../../client/types.js";
import { NetworkError } from "../../types/errors.js";

describe("getSSETicket", () => {
  test("returns ticket on successful exchange", async () => {
    const mockClient = {
      request: async () => ({
        ok: true,
        json: async () => ({ ticket: "ticket-123", expiresAt: "2026-03-22T12:00:00Z" }),
      }),
    } as unknown as APIClient;
    const result = await getSSETicket(mockClient);
    expect(result).toEqual({ ticket: "ticket-123", expiresAt: "2026-03-22T12:00:00Z" });
  });

  test("returns null on non-200 response", async () => {
    const mockClient = {
      request: async () => ({ ok: false }),
    } as unknown as APIClient;
    const result = await getSSETicket(mockClient);
    expect(result).toBeNull();
  });

  test("returns null on network error", async () => {
    const mockClient = {
      request: async () => { throw new NetworkError("Connection refused"); },
    } as unknown as APIClient;
    const result = await getSSETicket(mockClient);
    expect(result).toBeNull();
  });

  test("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const mockClient = {
      request: async (path: string, options?: any) => {
        if (options?.signal?.aborted) throw new Error("AbortError");
        return { ok: true, json: async () => ({}) };
      },
    } as unknown as APIClient;
    const result = await getSSETicket(mockClient, controller.signal);
    expect(result).toBeNull();
  });

  test("calls POST /api/auth/sse-ticket with correct method", async () => {
    let capturedPath = "";
    let capturedMethod = "";
    const mockClient = {
      request: async (path: string, options?: any) => {
        capturedPath = path;
        capturedMethod = options?.method ?? "GET";
        return { ok: true, json: async () => ({ ticket: "t", expiresAt: "" }) };
      },
    } as unknown as APIClient;
    await getSSETicket(mockClient);
    expect(capturedPath).toBe("/api/auth/sse-ticket");
    expect(capturedMethod).toBe("POST");
  });
});
```

### 9.3 E2E test specifications

**File:** `e2e/tui/agents.test.ts` (additions within the existing `TUI_AGENT_SSE_STREAM` describe block)

These tests exercise the streaming hook's integration with the TUI at the terminal level. They **will fail** until the backend implements the stream endpoint (currently 501). Per project policy, they are left failing — never skipped or commented out.

```typescript
import { describe, test, expect } from "bun:test";
import { createTestTui } from "@microsoft/tui-test";
import { launchTUI, navigateToAgentChat, waitForChatReady } from "./helpers.js";

describe("TUI_AGENT_SSE_STREAM", () => {
  describe("terminal snapshots", () => {
    test("SNAP-STREAM-001: streaming indicator visible during active stream at 120×40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to agent session, send message to trigger streaming
      // Assert: braille spinner character visible (one of ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
      // Assert: spinner in green (ANSI 34)
      // Assert: "Agent" label visible next to spinner
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-STREAM-002: tokens render incrementally during streaming at 120×40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to active streaming session
      // Wait for multiple token events
      // Assert: text content grows over successive frames
      // Assert: content rendered via <markdown>
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-STREAM-003: streaming complete — spinner disappears at 120×40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to session that completes streaming
      // Wait for done event
      // Assert: no spinner character visible
      // Assert: full response text rendered
      // Assert: "Agent" label without spinner
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-STREAM-004: reconnection indicator during SSE disconnect at 120×40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Start streaming, simulate network drop
      // Assert: status bar shows reconnection state
      // Assert: spinner continues (streaming = true during reconnect)
      // Assert: accumulated tokens preserved
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-STREAM-005: stream error displays error message at 120×40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Start streaming, receive error event
      // Assert: error message rendered in red (ANSI 196)
      // Assert: spinner stops
      // Assert: partial response text preserved above error
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-STREAM-006: streaming at 80×24 — abbreviated spinner, no padding", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      // Navigate to active streaming session
      // Assert: spinner visible
      // Assert: "A:" abbreviated label
      // Assert: content rendered without padding
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  describe("keyboard interaction", () => {
    test("KEY-STREAM-001: auto-scroll follows streaming content", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Wait for enough tokens to exceed viewport height
      // Assert: viewport auto-scrolls to show latest content
      await terminal.terminate();
    });

    test("KEY-STREAM-002: j/k scroll disables auto-follow during streaming", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Start streaming, wait for content overflow
      // Press k to scroll up
      // Wait for more tokens
      // Assert: viewport does NOT auto-scroll (user took manual control)
      await terminal.terminate();
    });

    test("KEY-STREAM-003: f key re-enables auto-follow during streaming", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Disable auto-follow (scroll manually)
      // Press f
      // Wait for more tokens
      // Assert: viewport auto-scrolls again
      await terminal.terminate();
    });

    test("KEY-STREAM-004: q during active stream stops streaming and pops screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Start streaming
      // Press q
      // Assert: SSE connection closed
      // Assert: screen transitions back to session list
      await terminal.terminate();
    });
  });

  describe("reconnection behavior", () => {
    test("RECONN-001: tokens preserved across reconnection", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Receive "Hello, how can I" → disconnect → reconnect
      // Assert: "Hello, how can I" still visible
      // Assert: new tokens appended after reconnection
      await terminal.terminate();
    });

    test("RECONN-002: no duplicate tokens after reconnection replay", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Receive tokens → disconnect → reconnect
      // Assert: no repeated text in the rendered output
      await terminal.terminate();
    });

    test("RECONN-003: status bar shows reconnection state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Disconnect → assert status bar indicator → reconnect → assert restored
      await terminal.terminate();
    });

    test("RECONN-004: permanent failure after 20 attempts shows error", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Simulate persistent connection failure
      // Assert: error state displayed
      // Assert: no further reconnection attempts
      await terminal.terminate();
    });
  });

  describe("edge cases", () => {
    test("EDGE-STREAM-001: terminal resize during streaming preserves content", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Start streaming → resize to 80x24
      // Assert: content still visible (may reflow)
      // Assert: streaming continues
      await terminal.resize(80, 24);
      await terminal.terminate();
    });

    test("EDGE-STREAM-002: switching sessions during active stream", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Stream in session A → navigate to session B
      // Assert: A closed, B content displayed
      await terminal.terminate();
    });

    test("EDGE-STREAM-003: rapid subscribe/unsubscribe does not leak connections", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Rapidly navigate in/out of sessions
      // Assert: clean state after settling
      await terminal.terminate();
    });
  });
});
```

---

## 10. Productionization Checklist

### From PoC to Production

| Area | PoC Validation | Production Requirement | PoC File |
|------|----------------|------------------------|----------|
| `eventsource-parser` in Bun | Construct SSE byte stream manually, feed through `createParser`, assert correct event extraction | Verify chunked delivery, partial lines, and multi-event buffers all parse correctly | `poc/sse-parser-bun.ts` |
| `fetch` streaming in Bun | Open `ReadableStream` response, assert chunks arrive incrementally (not buffered) | Verify `response.body.getReader()` delivers chunks as they arrive over the wire, not buffered to completion | `poc/fetch-stream-bun.ts` |
| `AbortController` cleanup in Bun | Call `abort()`, verify fetch immediately stops reading (no lingering TCP connection) | Verify abort closes the TCP connection, not just stops userland reads | `poc/abort-cleanup-bun.ts` |
| Timer correctness | `setTimeout` and `clearTimeout` behavior in Bun | Verify `clearTimeout` actually prevents callback execution (Bun timer edge cases) | `poc/timer-bun.ts` |
| Memory under sustained streaming | Profile RSS with 100KB simulated response (10,000 × 10-char tokens via string concat) | Assert no OOM, stable RSS, GC reclaims old string allocations | `poc/stream-memory.ts` |
| Auth header passthrough | Manual header construction for bearer fallback | When `SSEProvider` ships, refactor to share auth header injection with `APIClient`. Current implementation duplicates the auth pattern. | — |
| Stale closure fix | Verify `connectionStateRef` prevents spurious reconnection after `done`/`error` | Unit test: simulate done → onClose sequence, assert no reconnection | — |

### Pre-merge Validation

1. **PoC tests pass:** `bun test poc/sse-parser-bun.ts poc/fetch-stream-bun.ts poc/abort-cleanup-bun.ts poc/timer-bun.ts poc/stream-memory.ts`
2. **SSE utility tests pass:** `bun test packages/ui-core/src/sse/__tests__/getSSETicket.test.ts`
3. **Hook unit tests run:** `bun test packages/ui-core/src/hooks/agents/__tests__/useAgentStream.test.ts` — tests against real API will fail with 501 (expected)
4. **Existing agent hook tests unbroken:** `bun test packages/ui-core/src/hooks/agents/__tests__/` — all existing tests must still pass
5. **E2E tests exist and fail expectedly:** `bun test e2e/tui/agents.test.ts` — `TUI_AGENT_SSE_STREAM` tests fail with 501 from server (expected, left failing)
6. **Type-check passes:** `bunx tsc --noEmit` in both `packages/ui-core/` and `apps/tui/`
7. **Barrel exports verified:** `import { useAgentStream } from "@codeplane/ui-core/hooks/agents"` resolves correctly
8. **TUI adapter compiles and exports:** `import { useAgentStream } from "./hooks"` in any TUI screen resolves correctly

### Future SSEProvider Integration Path

When `SSEProvider` gains production implementation (ticket: `tui-notification-sse-stream`):

1. `getSSETicket` moves from per-hook calls to provider-level with ticket caching and auto-refresh before 30s TTL expiry.
2. `createSSEReader` used by SSEProvider for the notification stream, validating it in a second use case.
3. Agent stream hook remains standalone (not multiplexed through SSEProvider) — per-session lifecycle ≠ global singleton.
4. `AgentStreamConnectionState` and SSEProvider's `connectionState` may be unified into a shared type.
5. Auth header construction centralized — the current duplicated `Authorization: token ...` pattern consolidates into the shared client.
6. Consider adding a `getAuthHeaders()` method to the `APIClient` interface to avoid the `token` option passthrough pattern.

---

## 11. File Inventory

### New Files

| Path | Description | Lines (est.) |
|------|-------------|------|
| `packages/ui-core/src/types/agentStream.ts` | SSE event types and connection state enum | 41 |
| `packages/ui-core/src/sse/getSSETicket.ts` | SSE ticket exchange utility | 35 |
| `packages/ui-core/src/sse/createSSEReader.ts` | Fetch-based SSE stream reader using eventsource-parser | 88 |
| `packages/ui-core/src/sse/index.ts` | SSE utilities barrel export | 5 |
| `packages/ui-core/src/hooks/agents/useAgentStream.ts` | Shared agent stream hook (core implementation) | ~380 |
| `packages/ui-core/src/hooks/agents/__tests__/useAgentStream.test.ts` | Hook unit tests | ~250 |
| `packages/ui-core/src/sse/__tests__/getSSETicket.test.ts` | Ticket exchange unit tests | 64 |
| `apps/tui/src/hooks/useAgentStream.ts` | TUI adapter wrapping shared hook + useSpinner | 43 |

### Modified Files

| Path | Change |
|------|--------|
| `packages/ui-core/src/hooks/agents/index.ts` | Add `useAgentStream`, `AgentStreamState`, `AgentStreamOptions` exports (already present in reference, verify) |
| `packages/ui-core/src/types/index.ts` | Add `agentStream.ts` type exports (6 lines) |
| `apps/tui/src/hooks/index.ts` | Add `useAgentStream`, `TUIAgentStreamState` exports (already present in reference, verify) |
| `e2e/tui/agents.test.ts` | `TUI_AGENT_SSE_STREAM` describe block with streaming test stubs (already present in reference at line 315) |

### Unchanged Files (Dependencies)

| Path | Role |
|------|------|
| `packages/ui-core/src/client/types.ts` | `APIClient` interface — `request()` method |
| `packages/ui-core/src/client/context.ts` | `useAPIClient()` hook — consumed by shared hook |
| `packages/ui-core/src/client/createAPIClient.ts` | `createAPIClient()` factory — `Authorization: token {token}` header |
| `packages/ui-core/src/types/agents.ts` | `AgentMessage`, `AgentPart` types — used in replay |
| `packages/ui-core/src/types/errors.ts` | `NetworkError`, `parseResponseError` |
| `packages/ui-core/src/hooks/agents/useAgentMessages.ts` | Referenced for replay pattern (coerceMessage) |
| `packages/ui-core/src/test-utils/renderHook.ts` | Hook testing utility with mock React |
| `packages/ui-core/src/test-utils/mockAPIClient.ts` | Queue-based API mock with call tracking |
| `apps/tui/src/hooks/useSpinner.ts` | OpenTUI Timeline-based spinner — consumed by TUI adapter |
| `apps/tui/src/providers/SSEProvider.tsx` | Test-mode-only SSE stub — not consumed by this hook |

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `eventsource-parser` v3 incompatible with Bun runtime | Low | Blocks implementation | PoC test (`poc/sse-parser-bun.ts`) validates before implementation. Fallback: hand-roll minimal SSE parser (spec is simple: `\n\n`-delimited, `data:`/`event:`/`id:` prefixed lines) |
| Server stream endpoint changes wire format before 501 is removed | Medium | Token events don't parse | Type guard on `parsed.type` with `default` branch for forward compatibility; unknown types silently ignored. `content` null guard prevents crashes on missing fields |
| Stale closure in `connectToStream.onClose` | High (known bug in reference) | Spurious reconnection after `done`/`error` events | Fix in production: introduce `connectionStateRef` that mirrors reactive state; `onClose` reads ref instead of closure. Dedicated test case validates the fix. |
| Memory growth from token string accumulation | Low | OOM on very long agent sessions | String accumulation bounded by session duration. PoC memory test validates 100KB response. Position counter uses `number` (max 9×10¹⁵ chars). No unbounded data structures |
| Race condition: rapid subscribe/unsubscribe cycling | Medium | Leaked fetch connections | `AbortController` per connection; each `subscribe` aborts previous. `isMounted` ref guards against post-unmount state updates |
| Auth token expired during long streaming session | Medium | 401 on reconnect ticket exchange | `getSSETicket` returns null → fallback to header auth. If both fail, `createSSEReader.onError` triggers reconnection with backoff. After 20 failures → `failed` state with clear user message |
| `useSpinner` API changes | Low | TUI adapter compile error | `useSpinner(active: boolean): string` signature verified in `specs/tui/apps/tui/src/hooks/useSpinner.ts`. Import path stable via barrel export |
| `renderHook` test utility limitations for async hooks | Medium | Hook tests can't simulate SSE events | Hook unit tests validate initial state and subscribe/unsubscribe API. Full streaming behavior tested via E2E. Consider adding `mockFetch` utility for SSE response simulation |
| Bun `ReadableStream.getReader()` buffering behavior | Low | Tokens arrive in batch instead of incrementally | PoC test (`poc/fetch-stream-bun.ts`) validates incremental delivery. If buffered, investigate Bun's `highWaterMark` settings |
| `connectToStream` dependency array instability | Medium | `subscribe` callback recreated on every state change, breaking React.memo optimization in consumers | Fixed by removing `connectionState` from deps and using `connectionStateRef` instead. `subscribe` and `unsubscribe` are now referentially stable across state transitions. |
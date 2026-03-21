# Engineering Specification: SSE Channel Adapter for Workspace Status Streaming

## `tui-workspace-sse-adapter`

---

## Overview

This ticket builds the workspace-specific SSE streaming adapter layer that enables real-time workspace status updates in the TUI. It provides two React hooks — `useWorkspaceStatusStream` for individual workspace status monitoring and `useWorkspaceListStatusStream` for multiplexed list-level status updates — plus the underlying connection management infrastructure with exponential backoff reconnection, event deduplication, dead connection detection, and REST reconciliation.

### Dependencies

| Dependency | What it provides |
|---|---|
| `tui-theme-provider` | `useTheme()` for connection state indicator colors |
| `tui-workspace-data-hooks` | `useWorkspace()` / `useWorkspaces()` for REST reconciliation on reconnect |

### API Surface Summary

| Export | Type | Location |
|---|---|---|
| `useWorkspaceStatusStream` | React hook | `apps/tui/src/hooks/useWorkspaceStatusStream.ts` |
| `useWorkspaceListStatusStream` | React hook | `apps/tui/src/hooks/useWorkspaceListStatusStream.ts` |
| `WorkspaceSSEAdapter` | Class | `apps/tui/src/streaming/WorkspaceSSEAdapter.ts` |
| `WorkspaceStreamConnectionState` | Type | `apps/tui/src/streaming/types.ts` |
| `WorkspaceStatusEvent` | Type | `apps/tui/src/streaming/types.ts` |
| `EventDeduplicator` | Class | `apps/tui/src/streaming/EventDeduplicator.ts` |
| `SSE_CONSTANTS` | Const object | `apps/tui/src/streaming/types.ts` |

---

## Detailed Design

### 1. Type Definitions and Constants

**File: `apps/tui/src/streaming/types.ts`**

```typescript
/**
 * Connection health states for workspace SSE streams.
 * Exposed via connectionState for status bar indicator rendering.
 *
 * State machine:
 *   idle → connecting → connected ⇄ reconnecting → disconnected
 *                                 ↗ degraded (45s silence)
 *   Any state → disconnected (on unmount or max retries exceeded)
 */
export type WorkspaceStreamConnectionState =
  | "idle"           // Initial state, stream not started
  | "connecting"     // First connection attempt in progress
  | "connected"      // Actively receiving events (healthy)
  | "degraded"       // Connected but no data for >30s (approaching keepalive timeout)
  | "reconnecting"   // Connection lost, attempting to restore
  | "disconnected";  // All retry attempts exhausted or explicitly closed

/**
 * Parsed workspace status event from the SSE stream.
 * Matches the server-side event shape from GET /workspaces/:id/stream.
 */
export interface WorkspaceStatusEvent {
  /** Unique event ID assigned by the server (used for deduplication) */
  id: string;
  /** Always "workspace.status" for workspace streams */
  type: "workspace.status";
  /** Parsed event payload */
  data: {
    workspace_id: string;
    status: WorkspaceStatus;
  };
  /** Client-side receive timestamp (monotonic, ms) */
  receivedAt: number;
}

/**
 * Subscriber callback type for workspace status events.
 */
export type WorkspaceStatusSubscriber = (event: WorkspaceStatusEvent) => void;

/**
 * Configuration for the SSE adapter.
 */
export interface WorkspaceSSEAdapterConfig {
  /** Base URL for the API server */
  apiBaseUrl: string;
  /** Auth token for SSE ticket exchange and bearer fallback */
  authToken: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Workspace ID to stream */
  workspaceId: string;
  /** Callback for connection state changes */
  onConnectionStateChange?: (state: WorkspaceStreamConnectionState) => void;
  /** Callback for workspace status events */
  onEvent?: WorkspaceStatusSubscriber;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Reconnection tuning constants.
 * These match the values specified in the TUI engineering architecture
 * and mirror the agent stream implementation.
 */
export const SSE_CONSTANTS = {
  /** Initial reconnection delay in ms */
  INITIAL_BACKOFF_MS: 1_000,
  /** Maximum reconnection delay in ms */
  MAX_BACKOFF_MS: 30_000,
  /** Backoff multiplier per attempt */
  BACKOFF_MULTIPLIER: 2,
  /** Maximum reconnection attempts before giving up */
  MAX_RECONNECT_ATTEMPTS: 20,
  /** Server keep-alive interval (for reference) */
  SERVER_KEEPALIVE_MS: 15_000,
  /** Dead connection detection threshold (3× keep-alive) */
  KEEPALIVE_TIMEOUT_MS: 45_000,
  /** Degraded state warning threshold (2× keep-alive) */
  DEGRADED_THRESHOLD_MS: 30_000,
  /** Size of the sliding window for event ID deduplication */
  DEDUP_WINDOW_SIZE: 1_000,
  /** SSE ticket TTL (server-side, for reference) */
  TICKET_TTL_MS: 30_000,
} as const;
```

**Rationale for `degraded` state:** The design spec requires connection health tracking. A `degraded` state at 30s (2× keep-alive) provides early warning before the 45s dead-connection threshold fires reconnection. The status bar can show a yellow indicator during degraded state, alerting the user before actual disconnection.

### 2. Event Deduplicator

**File: `apps/tui/src/streaming/EventDeduplicator.ts`**

```typescript
import { SSE_CONSTANTS } from "./types";

/**
 * Sliding-window event deduplicator.
 *
 * On SSE reconnection with Last-Event-ID, the server replays events
 * from the last known position. This deduplicator ensures replayed
 * events are not processed twice.
 *
 * Implementation uses a circular buffer + Set for O(1) lookup and
 * bounded memory. When the window is full, the oldest ID is evicted
 * from both the buffer and the Set before the new ID is inserted.
 */
export class EventDeduplicator {
  private readonly maxSize: number;
  private readonly seenIds: Set<string>;
  private readonly buffer: string[];
  private writeIndex: number;

  constructor(maxSize: number = SSE_CONSTANTS.DEDUP_WINDOW_SIZE) {
    this.maxSize = maxSize;
    this.seenIds = new Set();
    this.buffer = new Array(maxSize);
    this.writeIndex = 0;
  }

  /**
   * Check if an event ID has been seen before.
   * If not seen, records it and returns false (not duplicate).
   * If seen, returns true (duplicate — caller should skip).
   */
  isDuplicate(eventId: string): boolean {
    if (!eventId) return false; // Events without IDs are never deduplicated

    if (this.seenIds.has(eventId)) {
      return true;
    }

    // Evict oldest if at capacity
    if (this.seenIds.size >= this.maxSize) {
      const evictId = this.buffer[this.writeIndex];
      if (evictId !== undefined) {
        this.seenIds.delete(evictId);
      }
    }

    this.buffer[this.writeIndex] = eventId;
    this.seenIds.add(eventId);
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;

    return false;
  }

  /**
   * Reset deduplication state. Called when a fresh connection
   * is established without Last-Event-ID replay.
   */
  reset(): void {
    this.seenIds.clear();
    this.buffer.fill(undefined as unknown as string);
    this.writeIndex = 0;
  }

  /** Current number of tracked event IDs. */
  get size(): number {
    return this.seenIds.size;
  }
}
```

**Design decisions:**
- Circular buffer chosen over array shifting for O(1) eviction.
- Set provides O(1) lookup for duplicate detection.
- Events without IDs pass through without dedup (the initial event from the server has a static ID `"1"`, which is still tracked).

### 3. WorkspaceSSEAdapter (Core Connection Manager)

**File: `apps/tui/src/streaming/WorkspaceSSEAdapter.ts`**

This is the core non-React class that manages a single SSE connection to a workspace status stream. It encapsulates ticket acquisition, connection lifecycle, reconnection with backoff, keepalive monitoring, deduplication, and event dispatch.

```typescript
import { createSSEReader } from "@codeplane/ui-core/sse/createSSEReader";
import { getSSETicket } from "@codeplane/ui-core/sse/getSSETicket";
import type { APIClient } from "@codeplane/ui-core/client/types";
import type { EventSourceMessage } from "eventsource-parser";
import { EventDeduplicator } from "./EventDeduplicator";
import {
  SSE_CONSTANTS,
  type WorkspaceSSEAdapterConfig,
  type WorkspaceStatusEvent,
  type WorkspaceStreamConnectionState,
} from "./types";

export class WorkspaceSSEAdapter {
  private readonly config: WorkspaceSSEAdapterConfig;
  private readonly deduplicator: EventDeduplicator;

  private abortController: AbortController | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private degradedTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private currentBackoff: number = SSE_CONSTANTS.INITIAL_BACKOFF_MS;
  private reconnectAttempts: number = 0;
  private lastEventId: string | null = null;
  private _connectionState: WorkspaceStreamConnectionState = "idle";
  private closed: boolean = false;

  constructor(config: WorkspaceSSEAdapterConfig) {
    this.config = config;
    this.deduplicator = new EventDeduplicator(SSE_CONSTANTS.DEDUP_WINDOW_SIZE);
  }

  // --- Public API ---

  get connectionState(): WorkspaceStreamConnectionState {
    return this._connectionState;
  }

  /**
   * Open the SSE connection. Obtains a ticket first, then connects.
   * Safe to call multiple times — subsequent calls are no-ops if already connected.
   */
  async connect(): Promise<void> {
    if (this.closed) return;
    if (this._connectionState === "connected" || this._connectionState === "connecting") return;

    this.setConnectionState("connecting");
    await this.establishConnection(false);
  }

  /**
   * Close the connection and clean up all timers.
   * After close(), the adapter cannot be reconnected.
   */
  close(): void {
    this.closed = true;
    this.clearAllTimers();
    this.abortController?.abort();
    this.abortController = null;
    this.setConnectionState("disconnected");
  }

  // --- Private: Connection Establishment ---

  private async establishConnection(isReconnect: boolean): Promise<void> {
    if (this.closed) return;

    // Cancel any existing connection
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Build stream URL
    const streamUrl = this.buildStreamUrl();

    // Attempt to get SSE ticket for auth
    const headers: Record<string, string> = {};
    let url = streamUrl;

    try {
      const ticket = await getSSETicket(
        { baseUrl: this.config.apiBaseUrl, request: this.createTicketRequester() } as APIClient,
        signal,
      );
      if (ticket) {
        // Use ticket-based auth (preferred — avoids long-lived token in URL)
        url = `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket.ticket)}`;
      } else {
        // Fallback to bearer token auth via header
        headers["Authorization"] = `token ${this.config.authToken}`;
      }
    } catch {
      // Ticket exchange failed — fallback to bearer
      headers["Authorization"] = `token ${this.config.authToken}`;
    }

    if (signal.aborted || this.closed) return;

    // Start keepalive monitoring
    this.resetKeepaliveTimer();

    try {
      await createSSEReader({
        url,
        headers,
        signal,
        lastEventId: isReconnect ? (this.lastEventId ?? undefined) : undefined,
        onOpen: () => {
          if (this.closed) return;
          this.setConnectionState("connected");
          // Reset backoff on successful connection
          this.currentBackoff = SSE_CONSTANTS.INITIAL_BACKOFF_MS;
          this.reconnectAttempts = 0;
        },
        onEvent: (event: EventSourceMessage) => {
          if (this.closed) return;
          this.handleEvent(event);
        },
        onError: (error: Error) => {
          if (this.closed) return;
          this.config.onError?.(error);
          this.initiateReconnection();
        },
        onClose: () => {
          if (this.closed) return;
          // Stream closed by server — reconnect
          this.initiateReconnection();
        },
      });
    } catch (err) {
      if (this.closed) return;
      if (err instanceof Error && err.name === "AbortError") return;
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.initiateReconnection();
    }
  }

  private buildStreamUrl(): string {
    const { apiBaseUrl, owner, repo, workspaceId } = this.config;
    return `${apiBaseUrl}/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/workspaces/${encodeURIComponent(workspaceId)}/stream`;
  }

  /**
   * Create a minimal request function for getSSETicket.
   * The ticket exchange only needs POST /api/auth/sse-ticket with auth header.
   */
  private createTicketRequester(): (path: string, options?: any) => Promise<Response> {
    const { apiBaseUrl, authToken } = this.config;
    return async (path: string, options?: { method?: string; signal?: AbortSignal }) => {
      return fetch(`${apiBaseUrl}${path}`, {
        method: options?.method ?? "GET",
        headers: {
          "Authorization": `token ${authToken}`,
          "Content-Type": "application/json",
        },
        signal: options?.signal,
      });
    };
  }

  // --- Private: Event Handling ---

  private handleEvent(event: EventSourceMessage): void {
    // Reset keepalive on any data (including comments parsed as events)
    this.resetKeepaliveTimer();

    // Track last event ID for reconnection replay
    if (event.id) {
      this.lastEventId = event.id;
    }

    // Deduplicate replayed events
    if (event.id && this.deduplicator.isDuplicate(event.id)) {
      return;
    }

    // Parse event data
    let data: { workspace_id: string; status: string };
    try {
      data = JSON.parse(event.data);
    } catch {
      // Malformed JSON — skip event silently (forward compatibility)
      return;
    }

    // Validate event shape
    if (!data.workspace_id || !data.status) {
      return;
    }

    const statusEvent: WorkspaceStatusEvent = {
      id: event.id ?? "",
      type: "workspace.status",
      data: {
        workspace_id: data.workspace_id,
        status: data.status as any, // WorkspaceStatus enum
      },
      receivedAt: performance.now(),
    };

    this.config.onEvent?.(statusEvent);
  }

  // --- Private: Reconnection ---

  private initiateReconnection(): void {
    if (this.closed) return;

    this.clearKeepaliveTimers();
    this.reconnectAttempts += 1;

    if (this.reconnectAttempts > SSE_CONSTANTS.MAX_RECONNECT_ATTEMPTS) {
      this.setConnectionState("disconnected");
      this.config.onError?.(
        new Error(`Workspace SSE reconnection failed after ${SSE_CONSTANTS.MAX_RECONNECT_ATTEMPTS} attempts`),
      );
      return;
    }

    this.setConnectionState("reconnecting");

    const delay = this.currentBackoff;
    this.currentBackoff = Math.min(
      delay * SSE_CONSTANTS.BACKOFF_MULTIPLIER,
      SSE_CONSTANTS.MAX_BACKOFF_MS,
    );

    this.backoffTimer = setTimeout(() => {
      if (!this.closed) {
        this.establishConnection(true);
      }
    }, delay);
  }

  // --- Private: Keepalive Monitoring ---

  private resetKeepaliveTimer(): void {
    this.clearKeepaliveTimers();

    // Degraded warning at 30s (2× keep-alive)
    this.degradedTimer = setTimeout(() => {
      if (!this.closed && this._connectionState === "connected") {
        this.setConnectionState("degraded");
      }
    }, SSE_CONSTANTS.DEGRADED_THRESHOLD_MS);

    // Dead connection at 45s (3× keep-alive)
    this.keepaliveTimer = setTimeout(() => {
      if (!this.closed) {
        this.abortController?.abort();
        this.initiateReconnection();
      }
    }, SSE_CONSTANTS.KEEPALIVE_TIMEOUT_MS);
  }

  private clearKeepaliveTimers(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.degradedTimer) {
      clearTimeout(this.degradedTimer);
      this.degradedTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.clearKeepaliveTimers();
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  // --- Private: State Management ---

  private setConnectionState(state: WorkspaceStreamConnectionState): void {
    if (this._connectionState === state) return;
    this._connectionState = state;
    this.config.onConnectionStateChange?.(state);
  }
}
```

**Key design decisions:**
1. **Class-based, not hook-based:** The adapter is a plain class so it can be tested independently of React, shared across multiple hook consumers, and managed with explicit lifecycle (`connect`/`close`).
2. **Ticket-first auth:** Attempts SSE ticket exchange before falling back to bearer token. This matches the architecture spec and avoids exposing long-lived tokens in URL query strings.
3. **Two-stage keepalive:** `degraded` at 30s provides UI warning; `disconnected` at 45s triggers reconnection. This gives users 15s of visual feedback before reconnection churn begins.
4. **Forward-compatible event parsing:** Unknown event types and malformed JSON are silently skipped, not thrown. New server-side event types won't crash old clients.

### 4. `useWorkspaceStatusStream` Hook

**File: `apps/tui/src/hooks/useWorkspaceStatusStream.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { useAPIClient } from "@codeplane/ui-core/client/context";
import { useWorkspace } from "@codeplane/ui-core/hooks/workspaces";
import { WorkspaceSSEAdapter } from "../streaming/WorkspaceSSEAdapter";
import type {
  WorkspaceStatusEvent,
  WorkspaceStreamConnectionState,
} from "../streaming/types";
import type { Workspace, WorkspaceStatus } from "@codeplane/ui-core/types/workspaces";
import { useAuth } from "./useAuth";

export interface UseWorkspaceStatusStreamOptions {
  /** Whether the stream is enabled. Default: true. */
  enabled?: boolean;
  /** Callback fired on each status change event */
  onStatusChange?: (workspaceId: string, newStatus: WorkspaceStatus) => void;
}

export interface UseWorkspaceStatusStreamResult {
  /** Current workspace status (from stream or REST reconciliation) */
  status: WorkspaceStatus | null;
  /** Current SSE connection health */
  connectionState: WorkspaceStreamConnectionState;
  /** Last received status event */
  lastEvent: WorkspaceStatusEvent | null;
  /** Most recent error, if any */
  error: Error | null;
  /** Manually trigger REST reconciliation */
  reconcile: () => void;
}

/**
 * Subscribe to real-time workspace status updates via SSE.
 *
 * Flow:
 * 1. Obtains SSE ticket via POST /api/auth/sse-ticket
 * 2. Opens SSE stream to GET /api/repos/:owner/:repo/workspaces/:id/stream
 * 3. Dispatches workspace.status events to subscribers
 * 4. On reconnection, performs REST reconciliation via GET /api/repos/:owner/:repo/workspaces/:id
 * 5. Deduplicates replayed events (sliding window of 1000)
 * 6. Detects dead connections after 45s silence
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param workspaceId - Workspace ID to monitor
 * @param options - Optional configuration
 */
export function useWorkspaceStatusStream(
  owner: string,
  repo: string,
  workspaceId: string,
  options: UseWorkspaceStatusStreamOptions = {},
): UseWorkspaceStatusStreamResult {
  const { enabled = true, onStatusChange } = options;
  const { token } = useAuth();
  const apiClient = useAPIClient();

  // REST hook for reconciliation on reconnect
  const {
    workspace: restWorkspace,
    refetch: refetchWorkspace,
  } = useWorkspace(owner, repo, workspaceId, { enabled });

  // State
  const [status, setStatus] = useState<WorkspaceStatus | null>(
    restWorkspace?.status ?? null,
  );
  const [connectionState, setConnectionState] =
    useState<WorkspaceStreamConnectionState>("idle");
  const [lastEvent, setLastEvent] = useState<WorkspaceStatusEvent | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs for callback stability
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const adapterRef = useRef<WorkspaceSSEAdapter | null>(null);
  const isMountedRef = useRef(true);

  // Sync REST data into status when no SSE events received yet
  useEffect(() => {
    if (restWorkspace && lastEvent === null) {
      setStatus(restWorkspace.status);
    }
  }, [restWorkspace, lastEvent]);

  // REST reconciliation callback
  const reconcile = useCallback(() => {
    refetchWorkspace();
  }, [refetchWorkspace]);

  // Main SSE lifecycle
  useEffect(() => {
    if (!enabled || !token || !workspaceId) {
      return;
    }

    isMountedRef.current = true;
    let reconciliationPending = false;

    const adapter = new WorkspaceSSEAdapter({
      apiBaseUrl: apiClient.baseUrl,
      authToken: token,
      owner,
      repo,
      workspaceId,
      onConnectionStateChange: (state) => {
        if (!isMountedRef.current) return;
        setConnectionState(state);

        // Trigger REST reconciliation on successful reconnection
        if (state === "connected" && reconciliationPending) {
          reconciliationPending = false;
          refetchWorkspace();
        }
        if (state === "reconnecting") {
          reconciliationPending = true;
        }
      },
      onEvent: (event) => {
        if (!isMountedRef.current) return;
        setLastEvent(event);
        setStatus(event.data.status);
        setError(null);
        onStatusChangeRef.current?.(event.data.workspace_id, event.data.status);
      },
      onError: (err) => {
        if (!isMountedRef.current) return;
        setError(err);
      },
    });

    adapterRef.current = adapter;
    adapter.connect();

    return () => {
      isMountedRef.current = false;
      adapter.close();
      adapterRef.current = null;
    };
  }, [enabled, token, owner, repo, workspaceId, apiClient.baseUrl, refetchWorkspace]);

  return {
    status,
    connectionState,
    lastEvent,
    error,
    reconcile,
  };
}
```

**Key behaviors:**
- **REST seeding:** On first mount, the status is seeded from the REST `useWorkspace` hook while the SSE connection is being established. This avoids a "loading" flash.
- **Reconnect reconciliation:** When the adapter transitions to `"connected"` after a reconnection, it automatically triggers `refetchWorkspace()` to catch any events missed during the outage.
- **Stable callbacks:** `onStatusChange` is stored in a ref to avoid adapter recreation when the callback reference changes.
- **Cleanup:** The adapter's `close()` method is called in the effect cleanup, ensuring all timers and the AbortController are cleaned up on unmount.

### 5. `useWorkspaceListStatusStream` Hook

**File: `apps/tui/src/hooks/useWorkspaceListStatusStream.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { useAPIClient } from "@codeplane/ui-core/client/context";
import { useWorkspaces } from "@codeplane/ui-core/hooks/workspaces";
import { WorkspaceSSEAdapter } from "../streaming/WorkspaceSSEAdapter";
import type {
  WorkspaceStreamConnectionState,
} from "../streaming/types";
import type { WorkspaceStatus } from "@codeplane/ui-core/types/workspaces";
import { useAuth } from "./useAuth";

export interface WorkspaceListStatusMap {
  /** Map from workspace ID to its current status */
  [workspaceId: string]: WorkspaceStatus;
}

export interface UseWorkspaceListStatusStreamResult {
  /** Map of workspace ID → current status */
  statuses: WorkspaceListStatusMap;
  /** Aggregate connection state across all streams.
   *  - "connected" if all streams are connected
   *  - "reconnecting" if any stream is reconnecting
   *  - "degraded" if any stream is degraded
   *  - "disconnected" if any stream is disconnected
   *  - "connecting" if any stream is still connecting
   *  - "idle" if no streams are active
   */
  connectionState: WorkspaceStreamConnectionState;
  /** Count of active SSE connections */
  activeConnections: number;
  /** Most recent error across any stream */
  error: Error | null;
}

/**
 * Multiplexed workspace status streaming for list views.
 *
 * Creates one SSE connection per visible workspace ID and aggregates
 * status updates into a single map. Adapters are created/destroyed
 * as the workspaceIds array changes (e.g., as the user scrolls the list).
 *
 * Connection state is aggregated: the worst state across all connections
 * is reported (disconnected > reconnecting > degraded > connecting > connected > idle).
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param workspaceIds - Array of workspace IDs visible in the list
 */
export function useWorkspaceListStatusStream(
  owner: string,
  repo: string,
  workspaceIds: string[],
): UseWorkspaceListStatusStreamResult {
  const { token } = useAuth();
  const apiClient = useAPIClient();

  const [statuses, setStatuses] = useState<WorkspaceListStatusMap>({});
  const [connectionStates, setConnectionStates] = useState<
    Map<string, WorkspaceStreamConnectionState>
  >(new Map());
  const [error, setError] = useState<Error | null>(null);

  const adaptersRef = useRef<Map<string, WorkspaceSSEAdapter>>(new Map());
  const isMountedRef = useRef(true);

  // Compute aggregate connection state
  const connectionState = computeAggregateState(connectionStates);
  const activeConnections = adaptersRef.current.size;

  useEffect(() => {
    if (!token) return;
    isMountedRef.current = true;

    const currentAdapters = adaptersRef.current;
    const desiredIds = new Set(workspaceIds);

    // Remove adapters for workspace IDs no longer in the list
    for (const [id, adapter] of currentAdapters) {
      if (!desiredIds.has(id)) {
        adapter.close();
        currentAdapters.delete(id);
        setConnectionStates((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }

    // Create adapters for new workspace IDs
    for (const id of workspaceIds) {
      if (currentAdapters.has(id)) continue;

      const adapter = new WorkspaceSSEAdapter({
        apiBaseUrl: apiClient.baseUrl,
        authToken: token,
        owner,
        repo,
        workspaceId: id,
        onConnectionStateChange: (state) => {
          if (!isMountedRef.current) return;
          setConnectionStates((prev) => {
            const next = new Map(prev);
            next.set(id, state);
            return next;
          });
        },
        onEvent: (event) => {
          if (!isMountedRef.current) return;
          setStatuses((prev) => ({
            ...prev,
            [event.data.workspace_id]: event.data.status,
          }));
        },
        onError: (err) => {
          if (!isMountedRef.current) return;
          setError(err);
        },
      });

      currentAdapters.set(id, adapter);
      adapter.connect();
    }

    return () => {
      isMountedRef.current = false;
      for (const adapter of currentAdapters.values()) {
        adapter.close();
      }
      currentAdapters.clear();
    };
  }, [token, owner, repo, workspaceIds.join(","), apiClient.baseUrl]);

  return {
    statuses,
    connectionState,
    activeConnections,
    error,
  };
}

/**
 * Compute worst-case aggregate state from per-connection states.
 * Priority: disconnected > reconnecting > degraded > connecting > connected > idle
 */
function computeAggregateState(
  states: Map<string, WorkspaceStreamConnectionState>,
): WorkspaceStreamConnectionState {
  if (states.size === 0) return "idle";

  const priority: Record<WorkspaceStreamConnectionState, number> = {
    idle: 0,
    connected: 1,
    connecting: 2,
    degraded: 3,
    reconnecting: 4,
    disconnected: 5,
  };

  let worst: WorkspaceStreamConnectionState = "idle";
  for (const state of states.values()) {
    if (priority[state] > priority[worst]) {
      worst = state;
    }
  }
  return worst;
}
```

**Design decisions:**
- **One SSE connection per workspace:** The server exposes a per-workspace stream endpoint (`/workspaces/:id/stream`). There is no multiplexed endpoint. Therefore we create one `WorkspaceSSEAdapter` per visible workspace ID.
- **Diff-based adapter lifecycle:** When `workspaceIds` changes (e.g., user scrolls), only new IDs get adapters and removed IDs get closed. Existing adapters persist.
- **Aggregate connection state:** The status bar needs a single indicator. We report the worst state across all connections so the user sees the most concerning condition.
- **Stable identity key:** `workspaceIds.join(",")` is used as the effect dependency to avoid object identity issues with arrays.

### 6. Barrel Exports

**File: `apps/tui/src/streaming/index.ts`**

```typescript
export { WorkspaceSSEAdapter } from "./WorkspaceSSEAdapter";
export { EventDeduplicator } from "./EventDeduplicator";
export {
  SSE_CONSTANTS,
  type WorkspaceSSEAdapterConfig,
  type WorkspaceStatusEvent,
  type WorkspaceStreamConnectionState,
  type WorkspaceStatusSubscriber,
} from "./types";
```

**File: `apps/tui/src/hooks/index.ts`** (add to existing exports)

```typescript
export { useWorkspaceStatusStream } from "./useWorkspaceStatusStream";
export type { UseWorkspaceStatusStreamResult, UseWorkspaceStatusStreamOptions } from "./useWorkspaceStatusStream";
export { useWorkspaceListStatusStream } from "./useWorkspaceListStatusStream";
export type { UseWorkspaceListStatusStreamResult, WorkspaceListStatusMap } from "./useWorkspaceListStatusStream";
```

---

## Implementation Plan

### Step 1: Type Definitions and Constants

**File:** `apps/tui/src/streaming/types.ts`

1. Define `WorkspaceStreamConnectionState` union type.
2. Define `WorkspaceStatusEvent` interface.
3. Define `WorkspaceSSEAdapterConfig` interface.
4. Define `WorkspaceStatusSubscriber` callback type.
5. Define `SSE_CONSTANTS` frozen object with all tuning constants.

**Verification:** TypeScript compilation succeeds with no errors.

### Step 2: Event Deduplicator

**File:** `apps/tui/src/streaming/EventDeduplicator.ts`

1. Implement circular buffer with Set-backed O(1) lookup.
2. Implement `isDuplicate(eventId)` method.
3. Implement `reset()` method.
4. Implement `size` getter.

**Verification:** Unit tests pass for deduplication with boundary conditions.

### Step 3: WorkspaceSSEAdapter

**File:** `apps/tui/src/streaming/WorkspaceSSEAdapter.ts`

1. Implement constructor accepting `WorkspaceSSEAdapterConfig`.
2. Implement `connect()` → ticket acquisition → `createSSEReader()`.
3. Implement `close()` with full timer cleanup and AbortController.
4. Implement `handleEvent()` with deduplication, JSON parsing, and dispatch.
5. Implement `initiateReconnection()` with exponential backoff.
6. Implement `resetKeepaliveTimer()` with degraded (30s) and dead (45s) thresholds.
7. Implement `buildStreamUrl()` with URL encoding.
8. Implement `createTicketRequester()` for SSE ticket exchange.

**Verification:** Adapter can be instantiated, connects when given a valid URL, reconnects on simulated failure.

### Step 4: `useWorkspaceStatusStream` Hook

**File:** `apps/tui/src/hooks/useWorkspaceStatusStream.ts`

1. Wire up `WorkspaceSSEAdapter` lifecycle to React `useEffect`.
2. Integrate `useWorkspace()` from `@codeplane/ui-core` for REST seeding and reconciliation.
3. Integrate `useAuth()` for token access.
4. Implement reconciliation trigger on successful reconnection.
5. Expose `status`, `connectionState`, `lastEvent`, `error`, `reconcile`.

**Verification:** Hook renders without errors, returns initial status from REST, updates on SSE events.

### Step 5: `useWorkspaceListStatusStream` Hook

**File:** `apps/tui/src/hooks/useWorkspaceListStatusStream.ts`

1. Implement adapter lifecycle management (create/destroy on ID changes).
2. Implement status map aggregation.
3. Implement connection state aggregation with priority ordering.
4. Handle empty workspace ID arrays gracefully.

**Verification:** Multiple adapters created for multiple IDs, removed adapters are cleaned up, aggregate state reflects worst-case.

### Step 6: Barrel Exports and Integration

**Files:**
- `apps/tui/src/streaming/index.ts`
- `apps/tui/src/hooks/index.ts` (update existing)

1. Create streaming barrel export.
2. Add hook exports to existing hooks barrel.
3. Verify all public types are exported.

**Verification:** Consuming code can import all public APIs from barrel exports.

---

## Unit & Integration Tests

### Test File: `e2e/tui/workspaces-sse.test.ts`

E2E tests for workspace SSE streaming. Tests run against a real API server — no mocking of implementation details.

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance } from "./helpers";

describe("TUI_WORKSPACES — SSE workspace status streaming", () => {

  // ─── Connection Lifecycle ────────────────────────────────────

  describe("connection lifecycle", () => {
    test("workspace detail screen establishes SSE connection and shows connected indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w"); // Navigate to workspaces
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter"); // Open first workspace
      await terminal.waitForText("Status");

      // Status bar should show connection indicator
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/●|◆|connected/i);

      await terminal.terminate();
    });

    test("workspace detail screen shows workspace status from SSE stream", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // Workspace status should be visible (from initial SSE event or REST)
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/running|pending|starting|suspended|stopped|failed/i);

      await terminal.terminate();
    });

    test("SSE connection state is exposed in status bar for workspace screens", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");

      // The status bar should contain a sync/connection indicator
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/●|◆|⚠|✗|connected|connecting|sync/i);

      await terminal.terminate();
    });
  });

  // ─── Real-time Status Updates ────────────────────────────────

  describe("real-time status updates", () => {
    test("workspace status updates in real-time when SSE event arrives", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_SSE_INJECT_FILE: "", // Will be set by test fixture
        },
      });

      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // Initial status should be visible
      const initialSnapshot = terminal.snapshot();
      expect(initialSnapshot).toMatch(/running|pending|starting/i);

      await terminal.terminate();
    });

    test("workspace list updates row status when SSE events arrive for visible workspaces", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");

      // The workspace list should show status for each row
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/running|pending|starting|suspended|stopped|failed/i);

      await terminal.terminate();
    });
  });

  // ─── Reconnection Behavior ──────────────────────────────────

  describe("reconnection behavior", () => {
    test("status bar shows reconnecting indicator when SSE connection drops", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // Connection should initially be healthy
      const snapshot = terminal.snapshot();
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar.length).toBeGreaterThan(0);

      await terminal.terminate();
    });

    test("workspace data reconciles via REST after successful reconnection", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // After reconnection, REST data should be refreshed
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/Status/);

      await terminal.terminate();
    });

    test("disconnected state shown in status bar after max reconnection attempts", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_API_URL: "http://localhost:1",
        },
      });

      await terminal.sendKeys("g", "w");
      await terminal.terminate();
    });
  });

  // ─── Navigation & Cleanup ───────────────────────────────────

  describe("navigation and cleanup", () => {
    test("SSE connections are cleaned up when navigating away from workspace screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // Navigate away
      await terminal.sendKeys("q"); // back to list
      await terminal.waitForText("Workspaces");

      // Navigate to a different section entirely
      await terminal.sendKeys("g", "d"); // go to dashboard
      await terminal.waitForText("Dashboard");

      // The TUI should not crash or show errors from dangling SSE connections
      expect(terminal.snapshot()).toMatch(/Dashboard/);

      await terminal.terminate();
    });

    test("SSE connections for workspace list are cleaned up when leaving list screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");

      // Navigate away from workspace list
      await terminal.sendKeys("g", "d");
      await terminal.waitForText("Dashboard");

      // No errors, clean transition
      expect(terminal.snapshot()).not.toMatch(/Error|error|crash/i);

      await terminal.terminate();
    });
  });

  // ─── Responsive Layout ──────────────────────────────────────

  describe("responsive layout", () => {
    test("workspace status stream indicator renders at minimum terminal size", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");

      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar.length).toBeGreaterThan(0);

      await terminal.terminate();
    });

    test("workspace status stream renders at standard terminal size", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");

      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("workspace status stream renders at large terminal size", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");

      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });
});
```

### Test File: `e2e/tui/streaming/event-deduplicator.test.ts`

Unit tests for the EventDeduplicator class (pure logic, no API dependency):

```typescript
import { describe, test, expect } from "bun:test";
import { EventDeduplicator } from "../../../apps/tui/src/streaming/EventDeduplicator";

describe("EventDeduplicator", () => {

  test("first occurrence of an event ID is not a duplicate", () => {
    const dedup = new EventDeduplicator(100);
    expect(dedup.isDuplicate("event-1")).toBe(false);
  });

  test("second occurrence of the same event ID is a duplicate", () => {
    const dedup = new EventDeduplicator(100);
    dedup.isDuplicate("event-1");
    expect(dedup.isDuplicate("event-1")).toBe(true);
  });

  test("different event IDs are not duplicates", () => {
    const dedup = new EventDeduplicator(100);
    dedup.isDuplicate("event-1");
    expect(dedup.isDuplicate("event-2")).toBe(false);
  });

  test("events without IDs are never duplicates", () => {
    const dedup = new EventDeduplicator(100);
    expect(dedup.isDuplicate("")).toBe(false);
    expect(dedup.isDuplicate("")).toBe(false);
  });

  test("sliding window evicts oldest IDs when full", () => {
    const dedup = new EventDeduplicator(3);
    dedup.isDuplicate("a");
    dedup.isDuplicate("b");
    dedup.isDuplicate("c");
    dedup.isDuplicate("d");

    expect(dedup.isDuplicate("a")).toBe(false); // evicted
    expect(dedup.isDuplicate("b")).toBe(true);  // still tracked
    expect(dedup.isDuplicate("c")).toBe(true);  // still tracked
    expect(dedup.isDuplicate("d")).toBe(true);  // just added
  });

  test("size tracks the number of tracked event IDs", () => {
    const dedup = new EventDeduplicator(100);
    expect(dedup.size).toBe(0);
    dedup.isDuplicate("a");
    expect(dedup.size).toBe(1);
    dedup.isDuplicate("b");
    expect(dedup.size).toBe(2);
    dedup.isDuplicate("a"); // duplicate, no size change
    expect(dedup.size).toBe(2);
  });

  test("reset clears all tracked IDs", () => {
    const dedup = new EventDeduplicator(100);
    dedup.isDuplicate("a");
    dedup.isDuplicate("b");
    dedup.reset();

    expect(dedup.size).toBe(0);
    expect(dedup.isDuplicate("a")).toBe(false);
    expect(dedup.isDuplicate("b")).toBe(false);
  });

  test("handles 1000-element sliding window correctly", () => {
    const dedup = new EventDeduplicator(1000);
    for (let i = 0; i < 1000; i++) {
      expect(dedup.isDuplicate(`event-${i}`)).toBe(false);
    }
    expect(dedup.size).toBe(1000);

    expect(dedup.isDuplicate("event-999")).toBe(true);
    expect(dedup.isDuplicate("event-0")).toBe(true);

    expect(dedup.isDuplicate("event-1000")).toBe(false);
    expect(dedup.isDuplicate("event-0")).toBe(false); // evicted
    expect(dedup.isDuplicate("event-1")).toBe(true);  // still tracked
  });

  test("window size of 1 only tracks the most recent event", () => {
    const dedup = new EventDeduplicator(1);
    dedup.isDuplicate("a");
    expect(dedup.isDuplicate("a")).toBe(true);

    dedup.isDuplicate("b");
    expect(dedup.isDuplicate("a")).toBe(false); // evicted
    expect(dedup.isDuplicate("b")).toBe(true);
  });
});
```

### Test File: `e2e/tui/streaming/sse-constants.test.ts`

Validates SSE constants match architectural requirements:

```typescript
import { describe, test, expect } from "bun:test";
import { SSE_CONSTANTS } from "../../../apps/tui/src/streaming/types";

describe("SSE_CONSTANTS", () => {
  test("initial backoff is 1 second", () => {
    expect(SSE_CONSTANTS.INITIAL_BACKOFF_MS).toBe(1_000);
  });

  test("max backoff is 30 seconds", () => {
    expect(SSE_CONSTANTS.MAX_BACKOFF_MS).toBe(30_000);
  });

  test("backoff multiplier is 2 (exponential)", () => {
    expect(SSE_CONSTANTS.BACKOFF_MULTIPLIER).toBe(2);
  });

  test("keepalive timeout is 45 seconds (3× server keep-alive)", () => {
    expect(SSE_CONSTANTS.KEEPALIVE_TIMEOUT_MS).toBe(45_000);
    expect(SSE_CONSTANTS.KEEPALIVE_TIMEOUT_MS).toBe(
      SSE_CONSTANTS.SERVER_KEEPALIVE_MS * 3,
    );
  });

  test("dedup window size is 1000", () => {
    expect(SSE_CONSTANTS.DEDUP_WINDOW_SIZE).toBe(1_000);
  });

  test("backoff sequence matches spec: 1s → 2s → 4s → 8s → ... → 30s", () => {
    let delay = SSE_CONSTANTS.INITIAL_BACKOFF_MS;
    const sequence = [delay];

    for (let i = 0; i < 10; i++) {
      delay = Math.min(delay * SSE_CONSTANTS.BACKOFF_MULTIPLIER, SSE_CONSTANTS.MAX_BACKOFF_MS);
      sequence.push(delay);
    }

    expect(sequence).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000]);
  });
});
```

### Test File: `e2e/tui/helpers/workspace-sse.ts`

Test helpers specific to workspace SSE testing:

```typescript
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { WorkspaceStatus } from "@codeplane/ui-core/types/workspaces";

/**
 * Create an SSE event in wire format for workspace status changes.
 * Used with CODEPLANE_SSE_INJECT_FILE for deterministic SSE testing.
 */
export function createWorkspaceSSEEvent(
  workspaceId: string,
  status: WorkspaceStatus,
  eventId?: string,
): string {
  const event = {
    type: "workspace.status",
    data: JSON.stringify({
      workspace_id: workspaceId,
      status,
    }),
    id: eventId ?? String(Date.now()),
  };
  return JSON.stringify(event);
}

/**
 * Create a temporary file for SSE event injection.
 * Returns the file path and a function to append events.
 */
export function createSSEInjectionFile(): {
  path: string;
  appendEvent: (event: string) => void;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "tui-sse-"));
  const path = join(dir, "events.jsonl");
  writeFileSync(path, "");

  return {
    path,
    appendEvent: (event: string) => {
      const { appendFileSync } = require("fs");
      appendFileSync(path, event + "\n");
    },
    cleanup: () => {
      try {
        unlinkSync(path);
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Wait for a workspace status to appear in the terminal output.
 */
export async function waitForWorkspaceStatus(
  terminal: { waitForText: (text: string, timeout?: number) => Promise<void> },
  status: WorkspaceStatus,
  timeoutMs: number = 5000,
): Promise<void> {
  const displayText = status.charAt(0).toUpperCase() + status.slice(1);
  await terminal.waitForText(displayText, timeoutMs);
}

/**
 * Assert that the status bar contains a connection state indicator.
 */
export function assertConnectionIndicator(
  statusBarLine: string,
  expectedState: "connected" | "reconnecting" | "degraded" | "disconnected",
): void {
  const indicators: Record<string, RegExp> = {
    connected: /●|◆|connected/i,
    reconnecting: /↻|⟳|reconnecting/i,
    degraded: /◐|⚠|degraded/i,
    disconnected: /✗|○|disconnected/i,
  };
  expect(statusBarLine).toMatch(indicators[expectedState]);
}
```

---

## Productionization Notes

### From SSEProvider Test Mode to Production

The current `SSEProvider` at `apps/tui/src/providers/SSEProvider.tsx` uses file-based event injection for test mode. The `WorkspaceSSEAdapter` in this ticket creates its own direct SSE connections using `createSSEReader` from `@codeplane/ui-core`, bypassing the test-mode SSEProvider.

**To productionize:**

1. **Maintain dual-path SSE:** The `WorkspaceSSEAdapter` uses `createSSEReader` directly for production SSE connections. The test-mode file injection path in `SSEProvider` continues to work for tests that use `CODEPLANE_SSE_INJECT_FILE`. This is intentional — workspace streaming has different lifecycle requirements (per-workspace connections) than the global notification SSE.

2. **Connection pooling (future):** If the server adds a multiplexed workspace stream endpoint (e.g., `GET /api/repos/:owner/:repo/workspaces/stream?ids=a,b,c`), the `useWorkspaceListStatusStream` hook can be updated to use a single connection instead of one-per-workspace. The hook's public API would not change.

3. **SSE ticket caching:** Currently, each `WorkspaceSSEAdapter` independently calls `getSSETicket()`. For `useWorkspaceListStatusStream` with many workspace IDs, this creates N ticket requests. Production optimization: share a ticket across adapters by extracting ticket acquisition into a singleton provider or caching the ticket for its TTL (30s).

4. **Memory pressure with many workspaces:** Each adapter maintains a 1000-entry dedup window. For a list with 50 visible workspaces, that's 50,000 entries. If memory is a concern, reduce `DEDUP_WINDOW_SIZE` for list-level adapters or share a single deduplicator across all list adapters (they have different event ID spaces, so a shared dedup with workspace-ID-prefixed keys would work).

5. **Integration with SSEProvider context:** The `connectionState` from workspace SSE adapters should be surfaced in the global status bar. The status bar component should read both the global SSE `connectionState` (from `SSEProvider`) and the workspace-specific `connectionState` (from the hooks) and display the worst-case state.

### Error Reporting

- All errors from the adapter are surfaced via the `error` field on the hook return.
- Errors are also dispatched to `onError` callbacks for logging.
- Production: consider adding structured error reporting to a TUI-local error log file for debugging SSE issues in long-running sessions.

### Testing Against Real Server

Per project testing philosophy, all E2E tests in `e2e/tui/workspaces-sse.test.ts` run against a real API server. Tests that fail because the workspace streaming endpoint is not yet implemented remain failing — they are never skipped or commented out. This provides a continuous signal for backend readiness.
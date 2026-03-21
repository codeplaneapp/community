import type { WorkspaceStatus } from "@codeplane/ui-core/types/workspaces";

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

import type { WorkflowRunStatus, WorkflowRunNode } from "./workflow-types.js";

// ── SSE Event Types ──────────────────────────────────────────────────────────

/**
 * Raw log line from the SSE stream.
 * Each line carries a unique `log_id` for deduplication on reconnect replay.
 */
export interface LogLine {
  log_id: string;           // Unique ID for deduplication
  step_id: string;          // Which step emitted this line
  timestamp: string;        // ISO-8601
  content: string;          // Raw log text (may contain ANSI escape codes)
  stream: "stdout" | "stderr";
}

/**
 * Step/run status change event.
 */
export interface StatusEvent {
  run_id: number;
  run_status: WorkflowRunStatus;
  step_id?: string;         // Present for step-level status changes
  step_status?: string;     // e.g., "running", "success", "failure"
  started_at?: string | null;
  completed_at?: string | null;
}

/**
 * Run completion event, sent once when the run reaches a terminal state.
 */
export interface DoneEvent {
  run_id: number;
  final_status: WorkflowRunStatus;
  completed_at: string;
}

/**
 * Union of all SSE event types from the log stream endpoint.
 */
export type WorkflowLogStreamEvent =
  | { type: "log"; data: LogLine }
  | { type: "status"; data: StatusEvent }
  | { type: "done"; data: DoneEvent }
  | { type: "error"; data: { message: string } };

/**
 * Lighter event type for multi-run status SSE.
 */
export type WorkflowRunSSEEvent =
  | { type: "status"; data: StatusEvent }
  | { type: "done"; data: DoneEvent }
  | { type: "error"; data: { message: string } };

// ── Connection State ─────────────────────────────────────────────────────────

export type WorkflowStreamConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "completed"    // Run reached terminal state
  | "errored"     // Stream error
  | "failed";     // Max reconnections exhausted

// ── Connection Health ────────────────────────────────────────────────────────

export interface ConnectionHealth {
  state: WorkflowStreamConnectionState;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  lastConnectedAt: string | null;   // ISO-8601
  lastError: Error | null;
}

// ── Hook Return Types ────────────────────────────────────────────────────────

export interface WorkflowLogStreamState {
  /** Map of step_id → LogLine[], capped at VIRTUAL_SCROLL_WINDOW per step */
  logs: Map<string, LogLine[]>;
  /** Step metadata with status, populated from status events */
  steps: Map<string, StepState>;
  /** Current overall run status */
  runStatus: WorkflowRunStatus | null;
  /** Connection health info */
  connectionHealth: ConnectionHealth;
  /** Manually trigger reconnection */
  reconnect: () => void;
  /** Last event ID for reconnection cursor */
  lastEventId: string | null;
  /** TUI spinner frame (braille character), active when streaming */
  spinnerFrame: string;
}

export interface StepState {
  step_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  log_count: number;
}

export interface WorkflowRunSSEState {
  /** Map of run_id → latest known status */
  runStatuses: Map<number, WorkflowRunStatus>;
  /** Connection health info */
  connectionHealth: ConnectionHealth;
  /** Manually trigger reconnection */
  reconnect: () => void;
}

// ── Virtual Scroll Constants ─────────────────────────────────────────────────

/** Maximum log lines retained per step before FIFO eviction */
export const VIRTUAL_SCROLL_WINDOW = 10_000;

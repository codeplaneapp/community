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

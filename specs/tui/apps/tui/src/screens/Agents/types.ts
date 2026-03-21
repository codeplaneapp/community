import type { AgentSessionStatus } from "@codeplane/ui-core";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; input: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      output: string;
      isError: boolean;
    };

export interface AgentMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  timestamp: string; // ISO-8601
  /** True when this message is still being streamed (assistant only) */
  streaming?: boolean;
}

export type { Breakpoint } from "../../types/breakpoint.js";

export type SessionStatusFilter = "all" | "active" | "completed" | "failed" | "timed_out";

export const STATUS_FILTER_CYCLE: readonly SessionStatusFilter[] = [
  "all", "active", "completed", "failed", "timed_out",
] as const;

export const STATUS_FILTER_LABELS: Record<SessionStatusFilter, string> = {
  all: "All", active: "Active", completed: "Completed",
  failed: "Failed", timed_out: "Timed Out",
};

export interface StatusIconConfig {
  icon: string;
  fallback: string;
  color: string;
  bold: boolean;
}

/** Status of a sent message for optimistic UI */
export type MessageSendStatus = "pending" | "sent" | "failed";

/** Extended message with client-side metadata */
export interface ChatMessage extends AgentMessage {
  sendStatus?: MessageSendStatus;
  clientId?: string; // for optimistic dedup
}

/** Chat screen mode derived from session status */
export type ChatMode = "active" | "replay";

export interface SessionListColumn {
  field: "icon" | "idPrefix" | "title" | "messageCount" | "duration" | "timestamp";
  width: number;
  visible: boolean;
}

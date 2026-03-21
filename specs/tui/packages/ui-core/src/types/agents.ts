/**
 * Agent domain types — canonical JSON shapes as returned by the Codeplane API.
 * These are the wire types. TUI/web display types may wrap or narrow them.
 */

export type AgentSessionStatus =
  | "active"
  | "completed"
  | "failed"
  | "timed_out"
  | "pending";

export type AgentMessageRole =
  | "user"
  | "assistant"
  | "system"
  | "tool";

export type AgentPartType =
  | "text"
  | "tool_call"
  | "tool_result";

export interface AgentSession {
  id: string;
  repositoryId: string;
  userId: string;
  workflowRunId: string | null;
  title: string;
  status: AgentSessionStatus;
  startedAt: string | null;    // ISO-8601 or null
  finishedAt: string | null;   // ISO-8601 or null
  createdAt: string;           // ISO-8601
  updatedAt: string;           // ISO-8601
  messageCount?: number;       // present when using list-with-count endpoint
}

export interface AgentPart {
  id: string;
  messageId: string;
  partIndex: number;           // server sends as string; hook coerces to number
  partType: AgentPartType;
  content: unknown;            // shape varies by partType
  createdAt: string;           // ISO-8601
}

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  sequence: number;            // server sends as string; hook coerces to number
  createdAt: string;           // ISO-8601
  parts?: AgentPart[];         // populated when server includes inline parts
}

export interface CreateAgentSessionRequest {
  title: string;
}

export interface CreateAgentMessageRequest {
  role: AgentMessageRole;
  parts: Array<{
    type: AgentPartType;
    content: unknown;
  }>;
}

export interface AgentSessionsOptions {
  page?: number;
  perPage?: number;            // capped at 50 client-side
  status?: AgentSessionStatus; // future: server ignores this param today
  enabled?: boolean;           // defaults to true; false skips initial fetch
}

export interface AgentMessagesOptions {
  page?: number;
  perPage?: number;            // capped at 50 client-side
  enabled?: boolean;
  autoPaginate?: boolean;      // fetch all pages sequentially (for replay mode)
}
export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; input: string }
  | { type: "tool_result"; id: string; name: string; output: string; isError: boolean };

export interface AgentMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  timestamp: string; // ISO-8601
  streaming?: boolean;
}

export type Breakpoint = "minimum" | "standard" | "large";

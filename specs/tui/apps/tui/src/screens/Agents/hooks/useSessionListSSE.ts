import type { AgentSessionStatus } from "@codeplane/ui-core";

export interface SSESessionUpdate {
  sessionId: string;
  newStatus: AgentSessionStatus;
  updatedAt: string;
  messageCount?: number;
}

/**
 * Subscribes to SSE channel `agent_session_{repoId}` for real-time
 * session status changes. Stub until SSEProvider ships.
 *
 * Integration: replace body with useSSEChannel(channelName, handler)
 * from SSEProvider. Signature is stable.
 */
export function useSessionListSSE(
  repoId: string | undefined,
  onSessionUpdate: (update: SSESessionUpdate) => void,
): void {
  // No-op stub. Will integrate with SSEProvider's useSSEChannel hook.
  // Channel: `agent_session_${repoId}`
}

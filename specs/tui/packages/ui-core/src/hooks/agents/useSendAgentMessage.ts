import { useAPIClient } from "../../client/context.js";
import type { AgentMessage, CreateAgentMessageRequest } from "../../types/agents.js";
import type { HookError } from "../../types/errors.js";
import { useMutation } from "../internal/useMutation.js";
import { ApiError, parseResponseError } from "../../types/errors.js";

export interface SendAgentMessageCallbacks {
  onOptimistic?: (tempMessage: AgentMessage) => void;
  onSettled?: (tempId: string, serverMessage: AgentMessage | null) => void;
  onRevert?: (tempId: string) => void;
  onError?: (error: HookError, tempId: string) => void;
}

const VALID_AGENT_MESSAGE_ROLES = ["user", "assistant", "system", "tool"];
const VALID_AGENT_MESSAGE_PART_TYPES = ["text", "tool_call", "tool_result"];

export function useSendAgentMessage(
  owner: string,
  repo: string,
  sessionId: string,
  callbacks?: SendAgentMessageCallbacks,
): {
  send: (input: CreateAgentMessageRequest) => Promise<AgentMessage>;
  sending: boolean;
  error: HookError | null;
} {
  const client = useAPIClient();

  const validateInput = (input: CreateAgentMessageRequest) => {
    const role = (input.role ?? "").trim();
    if (!VALID_AGENT_MESSAGE_ROLES.includes(role)) {
      throw new ApiError(400, "invalid role");
    }

    if (!input.parts || !Array.isArray(input.parts) || input.parts.length === 0) {
      throw new ApiError(400, "parts are required");
    }

    for (const part of input.parts) {
      if (!VALID_AGENT_MESSAGE_PART_TYPES.includes(part.type)) {
        throw new ApiError(400, "invalid part type");
      }
      if (part.content === null || part.content === undefined) {
        throw new ApiError(400, "part content is required");
      }
    }
  };

  const mutation = useMutation<
    { input: CreateAgentMessageRequest; tempId: string; tempMessage: AgentMessage },
    AgentMessage
  >({
    onOptimistic: ({ tempMessage }) => {
      callbacks?.onOptimistic?.(tempMessage);
    },
    mutationFn: async ({ input }, signal) => {
      const response = await client.request(
        `/api/repos/${owner}/${repo}/agent/sessions/${sessionId}/messages`,
        {
          method: "POST",
          body: { role: input.role.trim(), parts: input.parts },
          signal,
        }
      );

      if (response.status !== 201) {
        throw await parseResponseError(response);
      }

      const raw = await response.json();
      return { ...raw, sequence: Number(raw.sequence) };
    },
    onSuccess: (serverMessage, { tempId }) => {
      callbacks?.onSettled?.(tempId, serverMessage);
    },
    onError: (error, { tempId }) => {
      callbacks?.onRevert?.(tempId);
      callbacks?.onError?.(error, tempId);
      callbacks?.onSettled?.(tempId, null);
    },
  });

  return {
    send: (input: CreateAgentMessageRequest) => {
      // Synchronous validation before any network call
      validateInput(input);

      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tempMessage: AgentMessage = {
        id: tempId,
        sessionId,
        role: input.role.trim() as any,
        sequence: -1,
        createdAt: new Date().toISOString(),
      };

      return mutation.mutate({ input, tempId, tempMessage });
    },
    sending: mutation.isLoading,
    error: mutation.error,
  };
}
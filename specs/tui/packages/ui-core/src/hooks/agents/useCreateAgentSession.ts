import { useAPIClient } from "../../client/context.js";
import type { AgentSession } from "../../types/agents.js";
import type { HookError } from "../../types/errors.js";
import { useMutation } from "../internal/useMutation.js";
import { ApiError, parseResponseError } from "../../types/errors.js";

export function useCreateAgentSession(
  owner: string,
  repo: string,
): {
  mutate: (input: { title: string }) => Promise<AgentSession>;
  isLoading: boolean;
  error: HookError | null;
} {
  const client = useAPIClient();

  const mutation = useMutation<{ title: string }, AgentSession>({
    mutationFn: async (input, signal) => {
      const title = input.title.trim();
      if (!title) {
        throw new ApiError(400, "title is required");
      }

      const response = await client.request(
        `/api/repos/${owner}/${repo}/agent/sessions`,
        {
          method: "POST",
          body: { title },
          signal,
        }
      );

      if (response.status !== 201) {
        throw await parseResponseError(response);
      }

      return response.json();
    },
  });

  return {
    mutate: (input) => {
      const title = input.title.trim();
      if (!title) {
        // Return rejected promise immediately to avoid entering loading state
        // but we also want it to throw synchronously per tests, so we throw.
        throw new ApiError(400, "title is required");
      }
      return mutation.mutate(input);
    },
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}
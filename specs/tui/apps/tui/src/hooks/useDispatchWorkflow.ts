import { useMutation } from "@codeplane/ui-core/src/hooks/internal/useMutation.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import { parseResponseError } from "@codeplane/ui-core/src/types/errors.js";
import type { RepoIdentifier, MutationResult, HookError } from "./workflow-types.js";

export interface DispatchInput {
  workflowId: number;
  ref?: string;              // defaults to "main"
  inputs?: Record<string, unknown>;
}

export function useDispatchWorkflow(
  repo: RepoIdentifier,
  callbacks?: {
    onSuccess?: (input: DispatchInput) => void;
    onError?: (error: HookError, input: DispatchInput) => void;
  },
): MutationResult<DispatchInput, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<DispatchInput, void>({
    mutationFn: async (input, signal) => {
      const response = await client.request(
        `/api/repos/${repo.owner}/${repo.repo}/workflows/${input.workflowId}/dispatches`,
        { 
          method: "POST",
          body: JSON.stringify({ ref: input.ref || "main", inputs: input.inputs }),
          headers: { "Content-Type": "application/json" },
          signal 
        }
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
    onSuccess: (result, input) => {
      callbacks?.onSuccess?.(input);
    },
    onError: (err, input) => {
      callbacks?.onError?.(err, input);
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

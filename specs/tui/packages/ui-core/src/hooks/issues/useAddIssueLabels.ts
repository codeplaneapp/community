import { useMutation } from "../internal/useMutation.js";
import { useAPIClient } from "../../client/context.js";
import { ApiError } from "../../types/errors.js";
import type { HookError } from "../../types/errors.js";
import type { Label } from "../../types/issues.js";

interface AddLabelsInput {
  issueNumber: number;
  labelNames: string[];
}

export function useAddIssueLabels(owner: string, repo: string) {
  const client = useAPIClient();

  const mutation = useMutation<AddLabelsInput, Label[]>({
    mutationFn: async (input, signal) => {
      if (input.labelNames.length === 0) {
        throw new ApiError(400, "at least one label name is required");
      }

      const response = await client.request(`/api/repos/${owner}/${repo}/issues/${input.issueNumber}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: input.labelNames }),
        headers: {
          "Content-Type": "application/json",
        },
        signal,
      });

      if (response.status !== 200) {
        throw response;
      }

      const data = await response.json();
      return data as Label[];
    },
  });

  return {
    mutate: (issueNumber: number, labelNames: string[]) => mutation.mutate({ issueNumber, labelNames }),
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

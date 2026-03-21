import { useMutation } from "../internal/useMutation.js";
import { useAPIClient } from "../../client/context.js";
import { ApiError } from "../../types/errors.js";
import type { HookError } from "../../types/errors.js";
import type { Issue, CreateIssueRequest } from "../../types/issues.js";

export function useCreateIssue(owner: string, repo: string) {
  const client = useAPIClient();

  const mutation = useMutation<CreateIssueRequest, Issue>({
    mutationFn: async (input, signal) => {
      const trimmedTitle = input.title.trim();
      if (trimmedTitle === "") {
        throw new ApiError(400, "title is required");
      }

      const body: Record<string, unknown> = {
        title: trimmedTitle,
        body: input.body,
      };

      if (input.assignees !== undefined) body.assignees = input.assignees;
      if (input.labels !== undefined) body.labels = input.labels;
      if (input.milestone !== undefined) body.milestone = input.milestone;

      const response = await client.request(`/api/repos/${owner}/${repo}/issues`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        signal,
      });

      if (response.status !== 201) {
        throw response; // handled by useMutation parseResponseError
      }

      const data = await response.json();
      return data as Issue;
    },
  });

  return {
    mutate: mutation.mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

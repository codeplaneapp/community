import { useCallback } from "react";
import { useMutation } from "../internal/useMutation.js";
import { useAPIClient } from "../../client/context.js";
import type { HookError } from "../../types/errors.js";
import type { Issue, UpdateIssueRequest } from "../../types/issues.js";

export interface UpdateIssueCallbacks {
  onOptimistic?: (issueNumber: number, patch: UpdateIssueRequest) => void;
  onRevert?: (issueNumber: number) => void;
  onError?: (error: HookError, issueNumber: number) => void;
  onSettled?: (issueNumber: number) => void;
}

interface UpdateIssueInput {
  issueNumber: number;
  patch: UpdateIssueRequest;
}

export function useUpdateIssue(
  owner: string,
  repo: string,
  callbacks?: UpdateIssueCallbacks
) {
  const client = useAPIClient();

  const mutation = useMutation<UpdateIssueInput, Issue>({
    mutationFn: async (input, signal) => {
      const { issueNumber, patch } = input;

      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.body !== undefined) body.body = patch.body;
      if (patch.state !== undefined) body.state = patch.state;
      if (patch.assignees !== undefined) body.assignees = patch.assignees;
      if (patch.labels !== undefined) body.labels = patch.labels;
      if (patch.milestone !== undefined) body.milestone = patch.milestone; // null means clear

      const response = await client.request(`/api/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        signal,
      });

      if (response.status !== 200) {
        throw response;
      }

      const data = await response.json();
      return data as Issue;
    },
    onOptimistic: (input) => {
      callbacks?.onOptimistic?.(input.issueNumber, input.patch);
    },
    onSuccess: (data, input) => {
      callbacks?.onSettled?.(input.issueNumber);
    },
    onError: (error, input) => {
      callbacks?.onRevert?.(input.issueNumber);
      callbacks?.onError?.(error, input.issueNumber);
      callbacks?.onSettled?.(input.issueNumber);
    },
  });

  const mutate = useCallback(
    (issueNumber: number, patch: UpdateIssueRequest) => mutation.mutate({ issueNumber, patch }),
    [mutation.mutate]
  );

  return {
    mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

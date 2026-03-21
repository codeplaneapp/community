import { useCallback } from "react";
import { useMutation } from "../internal/useMutation.js";
import { useAPIClient } from "../../client/context.js";
import { ApiError } from "../../types/errors.js";
import type { HookError } from "../../types/errors.js";

export interface RemoveIssueLabelCallbacks {
  onOptimistic?: (issueNumber: number, labelName: string) => void;
  onRevert?: (issueNumber: number, labelName: string) => void;
  onError?: (error: HookError, issueNumber: number, labelName: string) => void;
  onSettled?: (issueNumber: number, labelName: string) => void;
}

interface RemoveLabelInput {
  issueNumber: number;
  labelName: string;
}

export function useRemoveIssueLabel(
  owner: string,
  repo: string,
  callbacks?: RemoveIssueLabelCallbacks
) {
  const client = useAPIClient();

  const mutation = useMutation<RemoveLabelInput, void>({
    mutationFn: async (input, signal) => {
      const trimmedLabelName = input.labelName.trim();
      if (trimmedLabelName === "") {
        throw new ApiError(400, "label name is required");
      }

      const response = await client.request(
        `/api/repos/${owner}/${repo}/issues/${input.issueNumber}/labels/${encodeURIComponent(trimmedLabelName)}`,
        { method: "DELETE", signal }
      );

      if (response.status !== 204) {
        throw response;
      }
    },
    onOptimistic: (input) => {
      callbacks?.onOptimistic?.(input.issueNumber, input.labelName);
    },
    onSuccess: (data, input) => {
      callbacks?.onSettled?.(input.issueNumber, input.labelName);
    },
    onError: (error, input) => {
      callbacks?.onRevert?.(input.issueNumber, input.labelName);
      callbacks?.onError?.(error, input.issueNumber, input.labelName);
      callbacks?.onSettled?.(input.issueNumber, input.labelName);
    },
  });

  const mutate = useCallback(
    async (issueNumber: number, labelName: string) => {
      return mutation.mutate({ issueNumber, labelName });
    },
    [mutation.mutate]
  );

  return {
    mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

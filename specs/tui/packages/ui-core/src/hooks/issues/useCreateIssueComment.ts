import { useCallback } from "react";
import { useMutation } from "../internal/useMutation.js";
import { useAPIClient } from "../../client/context.js";
import { ApiError } from "../../types/errors.js";
import type { HookError } from "../../types/errors.js";
import type { IssueComment, CreateIssueCommentRequest } from "../../types/issues.js";

export interface CreateIssueCommentCallbacks {
  onOptimistic?: (issueNumber: number, tempComment: IssueComment) => void;
  onSettled?: (issueNumber: number, tempId: number, serverComment: IssueComment | null) => void;
  onRevert?: (issueNumber: number, tempId: number) => void;
  onError?: (error: HookError, issueNumber: number, tempId: number) => void;
}

interface CreateCommentInput {
  issueNumber: number;
  input: CreateIssueCommentRequest;
  tempId: number;
}

export function useCreateIssueComment(
  owner: string,
  repo: string,
  callbacks?: CreateIssueCommentCallbacks
) {
  const client = useAPIClient();

  const mutation = useMutation<CreateCommentInput, IssueComment>({
    mutationFn: async (payload, signal) => {
      const { issueNumber, input } = payload;
      const body = { body: input.body };

      const response = await client.request(`/api/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        signal,
      });

      if (response.status !== 201) {
        throw response;
      }

      const data = await response.json();
      return data as IssueComment;
    },
    onOptimistic: (payload) => {
      const tempComment: IssueComment = {
        id: payload.tempId,
        issue_id: 0,
        user_id: 0,
        commenter: "",
        body: payload.input.body,
        type: "comment",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      callbacks?.onOptimistic?.(payload.issueNumber, tempComment);
    },
    onSuccess: (data, payload) => {
      callbacks?.onSettled?.(payload.issueNumber, payload.tempId, data);
    },
    onError: (error, payload) => {
      callbacks?.onRevert?.(payload.issueNumber, payload.tempId);
      callbacks?.onError?.(error, payload.issueNumber, payload.tempId);
      callbacks?.onSettled?.(payload.issueNumber, payload.tempId, null);
    },
  });

  const mutate = useCallback(
    async (issueNumber: number, input: CreateIssueCommentRequest) => {
      const trimmedBody = input.body.trim();
      if (trimmedBody === "") {
        throw new ApiError(400, "comment body is required");
      }
      
      const tempId = -(Date.now());
      return mutation.mutate({ issueNumber, input: { body: trimmedBody }, tempId });
    },
    [mutation.mutate]
  );

  return {
    mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

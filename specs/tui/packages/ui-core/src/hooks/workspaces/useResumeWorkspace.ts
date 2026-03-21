import { useMutation } from "../internal/useMutation.js";
import { Workspace } from "../../types/workspaces.js";
import { ApiError, HookError } from "../../types/errors.js";

export interface ResumeWorkspaceCallbacks {
  onOptimistic?: (workspaceId: string) => void;
  onRevert?: (workspaceId: string) => void;
  onError?: (error: HookError, workspaceId: string) => void;
  onSettled?: (workspaceId: string) => void;
}

export function useResumeWorkspace(
  owner: string,
  repo: string,
  callbacks?: ResumeWorkspaceCallbacks,
) {
  const { mutate, isLoading, error } = useMutation<Workspace, string>({
    mutationFn: async (workspaceId, { fetch }) => {
      if (!workspaceId) {
        throw new ApiError(400, "workspace id is required");
      }

      const res = await fetch(`/api/repos/${owner}/${repo}/workspaces/${workspaceId}/resume`, {
        method: "POST",
      });
      return res;
    },
    onOptimistic: callbacks?.onOptimistic,
    onRevert: callbacks?.onRevert,
    onError: callbacks?.onError,
    onSettled: callbacks?.onSettled,
  });

  return { mutate, isLoading, error };
}

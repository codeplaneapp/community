import { useMutation } from "../internal/useMutation.js";
import { CreateWorkspaceSessionRequest, WorkspaceSession } from "../../types/workspaces.js";
import { ApiError } from "../../types/errors.js";

export function useCreateWorkspaceSession(owner: string, repo: string) {
  const { mutate, isLoading, error } = useMutation<WorkspaceSession, CreateWorkspaceSessionRequest>({
    mutationFn: async (input, { fetch }) => {
      const workspace_id = input.workspace_id.trim();
      if (!workspace_id) {
        throw new ApiError(400, "workspace_id is required");
      }
      
      if (input.cols !== undefined) {
        if (!Number.isInteger(input.cols) || input.cols < 0) {
          throw new ApiError(400, "cols must be a non-negative integer");
        }
      }
      
      if (input.rows !== undefined) {
        if (!Number.isInteger(input.rows) || input.rows < 0) {
          throw new ApiError(400, "rows must be a non-negative integer");
        }
      }

      const res = await fetch(`/api/repos/${owner}/${repo}/workspace/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id, cols: input.cols, rows: input.rows }),
      });

      return res;
    },
  });

  return { mutate, isLoading, error };
}

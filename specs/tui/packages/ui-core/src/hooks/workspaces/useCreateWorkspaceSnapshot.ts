import { useMutation } from "../internal/useMutation.js";
import { CreateWorkspaceSnapshotRequest, WorkspaceSnapshot } from "../../types/workspaces.js";
import { ApiError } from "../../types/errors.js";

export function useCreateWorkspaceSnapshot(owner: string, repo: string) {
  const { mutate, isLoading, error } = useMutation<WorkspaceSnapshot, CreateWorkspaceSnapshotRequest>({
    mutationFn: async (input, { fetch }) => {
      const workspace_id = input.workspace_id.trim();
      if (!workspace_id) {
        throw new ApiError(400, "workspace_id is required");
      }
      
      const body: any = {};
      if (input.name !== undefined) {
        body.name = input.name;
      }

      const res = await fetch(`/api/repos/${owner}/${repo}/workspaces/${workspace_id}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });

      return res;
    },
  });

  return { mutate, isLoading, error };
}

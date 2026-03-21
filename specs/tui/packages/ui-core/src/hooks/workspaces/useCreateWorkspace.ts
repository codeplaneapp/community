import { useMutation } from "../internal/useMutation.js";
import { CreateWorkspaceRequest, Workspace } from "../../types/workspaces.js";
import { ApiError } from "../../types/errors.js";

export function useCreateWorkspace(owner: string, repo: string) {
  const { mutate, isLoading, error } = useMutation<Workspace, CreateWorkspaceRequest>({
    mutationFn: async (input, { fetch }) => {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new ApiError(400, "name is required");
      }
      
      const nameRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
      if (trimmedName.length > 63 || !nameRegex.test(trimmedName)) {
        throw new ApiError(400, "name must be 1-63 lowercase alphanumeric characters or hyphens, starting and ending with alphanumeric");
      }

      const body: any = { name: trimmedName };
      if (input.snapshot_id !== undefined) {
        body.snapshot_id = input.snapshot_id;
      }

      const res = await fetch(`/api/repos/${owner}/${repo}/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return res;
    },
  });

  return { mutate, isLoading, error };
}

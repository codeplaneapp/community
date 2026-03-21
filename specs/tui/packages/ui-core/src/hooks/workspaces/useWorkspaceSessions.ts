import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import { WorkspaceSession, WorkspaceSessionsOptions } from "../../types/workspaces.js";

export function useWorkspaceSessions(
  owner: string,
  repo: string,
  workspaceId: string,
  options?: WorkspaceSessionsOptions,
) {
  const perPage = Math.min(options?.perPage ?? 30, 100);
  const cacheKey = JSON.stringify({ owner, repo, workspaceId, perPage });
  const isEnabled = workspaceId !== "" && (options?.enabled ?? true);

  const query = usePaginatedQuery<WorkspaceSession>({
    path: `/api/repos/${owner}/${repo}/workspace/sessions`,
    cacheKey,
    perPage,
    maxItems: 500,
    autoPaginate: false,
    enabled: isEnabled,
    parseResponse: async (res) => {
      const items: WorkspaceSession[] = await res.json();
      const totalCountHeader = res.headers.get("X-Total-Count");
      const totalCount = parseInt(totalCountHeader ?? "0", 10);
      return { items, totalCount };
    },
  });

  const filteredItems = workspaceId === ""
    ? query.items
    : query.items.filter((s) => s.workspace_id === workspaceId);

  return {
    sessions: filteredItems,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}

import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import { WorkspaceSnapshot, WorkspaceSnapshotsOptions } from "../../types/workspaces.js";

export function useWorkspaceSnapshots(
  owner: string,
  repo: string,
  options?: WorkspaceSnapshotsOptions,
) {
  const perPage = Math.min(options?.perPage ?? 30, 100);
  const cacheKey = JSON.stringify({ owner, repo, perPage });

  const query = usePaginatedQuery<WorkspaceSnapshot>({
    path: `/api/repos/${owner}/${repo}/workspace-snapshots`,
    cacheKey,
    perPage,
    maxItems: 500,
    autoPaginate: false,
    enabled: options?.enabled ?? true,
    parseResponse: async (res) => {
      const items = await res.json();
      const totalCountHeader = res.headers.get("X-Total-Count");
      const totalCount = parseInt(totalCountHeader ?? "0", 10);
      return { items, totalCount };
    },
  });

  return {
    snapshots: query.items,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}

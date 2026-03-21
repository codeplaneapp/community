import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import { Workspace, WorkspacesOptions } from "../../types/workspaces.js";

export function useWorkspaces(
  owner: string,
  repo: string,
  options?: WorkspacesOptions,
) {
  const perPage = Math.min(options?.perPage ?? 30, 100);
  const cacheKey = JSON.stringify({ owner, repo, perPage, status: options?.status });

  const query = usePaginatedQuery<Workspace>({
    path: `/api/repos/${owner}/${repo}/workspaces`,
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

  const filteredItems = options?.status 
    ? query.items.filter((w) => w.status === options.status)
    : query.items;

  return {
    workspaces: filteredItems,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}

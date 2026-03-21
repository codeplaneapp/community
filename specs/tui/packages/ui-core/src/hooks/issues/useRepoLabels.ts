import { useAPIClient } from "../../client/context.js";
import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import type { Label, RepoLabelsOptions } from "../../types/issues.js";

export function useRepoLabels(
  owner: string,
  repo: string,
  options?: RepoLabelsOptions
) {
  const client = useAPIClient();

  const perPage = Math.min(options?.perPage ?? 30, 100);
  const path = `/api/repos/${owner}/${repo}/labels`;
  const cacheKey = JSON.stringify({ owner, repo, perPage });

  const query = usePaginatedQuery<Label>({
    client,
    path,
    cacheKey,
    perPage,
    enabled: options?.enabled ?? true,
    maxItems: 500,
    autoPaginate: false,
    parseResponse: (data, headers) => {
      const items = data as Label[];
      const totalCountHeader = headers.get("X-Total-Count");
      const totalCount = totalCountHeader ? parseInt(totalCountHeader, 10) : 0;
      return { items, totalCount };
    },
  });

  return {
    labels: query.items,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}

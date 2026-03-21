import { useAPIClient } from "../../client/context.js";
import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import type { Milestone, RepoMilestonesOptions } from "../../types/issues.js";

export function useRepoMilestones(
  owner: string,
  repo: string,
  options?: RepoMilestonesOptions
) {
  const client = useAPIClient();

  const perPage = Math.min(options?.perPage ?? 30, 100);
  const state = options?.state ?? "";
  
  let path = `/api/repos/${owner}/${repo}/milestones`;
  if (state !== "") {
    path += `?state=${state}`;
  }

  const cacheKey = JSON.stringify({ owner, repo, perPage, state });

  const query = usePaginatedQuery<Milestone>({
    client,
    path,
    cacheKey,
    perPage,
    enabled: options?.enabled ?? true,
    maxItems: 500,
    autoPaginate: false,
    parseResponse: (data, headers) => {
      const items = data as Milestone[];
      const totalCountHeader = headers.get("X-Total-Count");
      const totalCount = totalCountHeader ? parseInt(totalCountHeader, 10) : 0;
      return { items, totalCount };
    },
  });

  return {
    milestones: query.items,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}

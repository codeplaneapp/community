import { usePaginatedQuery } from "@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js";
import { useQuery } from "./useQuery.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import type { 
  RepoIdentifier, 
  WorkflowCache, 
  WorkflowCacheStats, 
  PaginatedQueryResult, 
  QueryResult,
  WorkflowCacheFilters 
} from "./workflow-types.js";
import { MAX_CACHES } from "./workflow-types.js";

export function useWorkflowCaches(
  repo: RepoIdentifier,
  filters?: WorkflowCacheFilters,
): PaginatedQueryResult<WorkflowCache> {
  const client = useAPIClient();

  const searchParams = new URLSearchParams();
  if (filters?.bookmark) searchParams.set("bookmark", filters.bookmark);
  if (filters?.key) searchParams.set("key", filters.key);
  
  const queryString = searchParams.toString();
  const path = `/api/repos/${repo.owner}/${repo.repo}/actions/cache${queryString ? `?${queryString}` : ""}`;
  const cacheKey = `workflow-caches:${repo.owner}:${repo.repo}:${queryString}`;

  const {
    items,
    totalCount,
    isLoading,
    error,
    hasMore,
    fetchMore,
    refetch,
  } = usePaginatedQuery<WorkflowCache>({
    client,
    path,
    cacheKey,
    perPage: filters?.per_page ?? 30,
    enabled: true,
    maxItems: MAX_CACHES,
    autoPaginate: false,
    parseResponse: (data: any) => {
      return {
        items: Array.isArray(data) ? data : [],
        totalCount: Array.isArray(data) ? data.length : 0,
      };
    },
  });

  return {
    data: items,
    totalCount,
    loading: isLoading,
    error,
    hasMore,
    loadMore: fetchMore,
    refetch,
  };
}

export function useWorkflowCacheStats(
  repo: RepoIdentifier,
): QueryResult<WorkflowCacheStats> {
  return useQuery<WorkflowCacheStats>({
    path: `/api/repos/${repo.owner}/${repo.repo}/actions/cache/stats`,
    transform: (res: any) => ({
      total_count: res?.total_count || 0,
      total_size_bytes: res?.total_size_bytes || 0,
    }),
  });
}

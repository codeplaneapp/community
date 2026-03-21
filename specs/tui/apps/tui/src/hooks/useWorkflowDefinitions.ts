import { usePaginatedQuery } from "@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import type { RepoIdentifier, WorkflowDefinition, PaginatedQueryResult } from "./workflow-types.js";
import { MAX_DEFINITIONS } from "./workflow-types.js";

export function useWorkflowDefinitions(
  repo: RepoIdentifier,
  options?: { page?: number; perPage?: number; enabled?: boolean },
): PaginatedQueryResult<WorkflowDefinition> {
  const client = useAPIClient();

  const {
    items,
    totalCount,
    isLoading,
    error,
    hasMore,
    fetchMore,
    refetch,
  } = usePaginatedQuery<WorkflowDefinition>({
    client,
    path: `/api/repos/${repo.owner}/${repo.repo}/workflows`,
    cacheKey: `workflows:${repo.owner}:${repo.repo}`,
    perPage: options?.perPage ?? 30,
    enabled: options?.enabled ?? true,
    maxItems: MAX_DEFINITIONS,
    autoPaginate: false,
    parseResponse: (data: any) => {
      return {
        items: data?.workflows || [],
        totalCount: data?.total_count ?? null,
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

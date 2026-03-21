import { usePaginatedQuery } from "@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import type { RepoIdentifier, WorkflowRun, PaginatedQueryResult, WorkflowRunFilters } from "./workflow-types.js";
import { MAX_RUNS } from "./workflow-types.js";

export function useWorkflowRuns(
  repo: RepoIdentifier,
  filters?: WorkflowRunFilters,
): PaginatedQueryResult<WorkflowRun> {
  const client = useAPIClient();

  const searchParams = new URLSearchParams();
  if (filters?.state) {
    searchParams.set("state", filters.state);
  }
  if (filters?.definition_id !== undefined) {
    searchParams.set("definition_id", String(filters.definition_id));
  }
  const queryString = searchParams.toString();
  const path = `/api/repos/${repo.owner}/${repo.repo}/workflows/runs${queryString ? `?${queryString}` : ""}`;
  const cacheKey = `workflow-runs:${repo.owner}:${repo.repo}:${queryString}`;

  const {
    items,
    totalCount,
    isLoading,
    error,
    hasMore,
    fetchMore,
    refetch,
  } = usePaginatedQuery<WorkflowRun>({
    client,
    path,
    cacheKey,
    perPage: filters?.per_page ?? 30,
    enabled: true,
    maxItems: MAX_RUNS,
    autoPaginate: false,
    parseResponse: (data: any) => {
      return {
        items: data?.runs || [],
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

import { useCallback } from "react";
import { useAPIClient } from "../../client/context.js";
import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import type { Issue, IssuesOptions } from "../../types/issues.js";

export function useIssues(
  owner: string,
  repo: string,
  options?: IssuesOptions
) {
  const client = useAPIClient();

  const perPage = Math.min(options?.perPage ?? 30, 100);
  const state = options?.state ?? "";
  
  let path = `/api/repos/${owner}/${repo}/issues`;
  if (state !== "") {
    path += `?state=${state}`;
  }

  const cacheKey = JSON.stringify({ owner, repo, perPage, state });

  const query = usePaginatedQuery<Issue>({
    client,
    path,
    cacheKey,
    perPage,
    enabled: options?.enabled ?? true,
    maxItems: 500,
    autoPaginate: false,
    parseResponse: (data, headers) => {
      const items = (data as any[]).map(item => ({
        ...item,
        state: item.state as Issue["state"],
      }));
      const totalCountHeader = headers.get("X-Total-Count");
      const totalCount = totalCountHeader ? parseInt(totalCountHeader, 10) : 0;
      return { items, totalCount };
    },
  });

  return {
    issues: query.items,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}

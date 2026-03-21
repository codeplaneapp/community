import { useAPIClient } from "../../client/context.js";
import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import type { IssueComment, IssueCommentsOptions } from "../../types/issues.js";

export function useIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  options?: IssueCommentsOptions
) {
  const client = useAPIClient();

  const perPage = Math.min(options?.perPage ?? 30, 100);
  const path = `/api/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  const cacheKey = JSON.stringify({ owner, repo, issueNumber, perPage });

  const query = usePaginatedQuery<IssueComment>({
    client,
    path,
    cacheKey,
    perPage,
    enabled: issueNumber > 0 && (options?.enabled ?? true),
    maxItems: 500,
    autoPaginate: false,
    parseResponse: (data, headers) => {
      const items = data as IssueComment[];
      const totalCountHeader = headers.get("X-Total-Count");
      const totalCount = totalCountHeader ? parseInt(totalCountHeader, 10) : 0;
      return { items, totalCount };
    },
  });

  return {
    comments: query.items,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}

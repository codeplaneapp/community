import { useMemo } from "react";
import { useAPIClient } from "../../client/context.js";
import type { AgentSession, AgentSessionsOptions } from "../../types/agents.js";
import type { HookError } from "../../types/errors.js";
import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";

function coerceSession(raw: any): AgentSession {
  return {
    ...raw,
    messageCount: raw.messageCount != null ? Number(raw.messageCount) : undefined,
  };
}

export function useAgentSessions(
  owner: string,
  repo: string,
  options?: AgentSessionsOptions,
): {
  sessions: AgentSession[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
} {
  const client = useAPIClient();
  const perPage = Math.min(options?.perPage ?? 30, 50);
  const status = options?.status;
  const enabled = options?.enabled ?? true;

  const cacheKey = JSON.stringify({ owner, repo, perPage, status });

  const query = usePaginatedQuery<AgentSession>({
    client,
    path: `/api/repos/${owner}/${repo}/agent/sessions`,
    cacheKey,
    perPage,
    enabled,
    maxItems: 500,
    autoPaginate: false,
    parseResponse: (data: any, headers: Headers) => {
      const totalCountHeader = headers.get("X-Total-Count");
      const totalCount = totalCountHeader ? parseInt(totalCountHeader, 10) : 0;
      
      const items = Array.isArray(data) ? data.map(coerceSession) : [];
      return { items, totalCount };
    },
  });

  return {
    sessions: query.items,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}
import { useAPIClient } from "../../client/context.js";
import type { AgentMessage, AgentMessagesOptions } from "../../types/agents.js";
import type { HookError } from "../../types/errors.js";
import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";

function coerceMessage(raw: any): AgentMessage {
  return {
    ...raw,
    sequence: Number(raw.sequence),
    parts: raw.parts?.map((p: any) => ({
      ...p,
      partIndex: Number(p.partIndex),
    })),
  };
}

export function useAgentMessages(
  owner: string,
  repo: string,
  sessionId: string,
  options?: AgentMessagesOptions,
): {
  messages: AgentMessage[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
} {
  const client = useAPIClient();
  const perPage = Math.min(options?.perPage ?? 30, 50);
  const autoPaginate = options?.autoPaginate ?? false;
  // If sessionId is empty, override enabled to false
  const enabled = (!sessionId.trim()) ? false : (options?.enabled ?? true);

  const cacheKey = JSON.stringify({ owner, repo, sessionId, perPage });

  const query = usePaginatedQuery<AgentMessage>({
    client,
    path: `/api/repos/${owner}/${repo}/agent/sessions/${sessionId}/messages`,
    cacheKey,
    perPage,
    enabled,
    maxItems: 10_000,
    autoPaginate,
    parseResponse: (data: any) => {
      const items = Array.isArray(data) ? data.map(coerceMessage) : [];
      // No X-Total-Count header, use running count logic handled by internal hook
      return { items, totalCount: null };
    },
  });

  return {
    messages: query.items,
    totalCount: query.items.length, // running count
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}
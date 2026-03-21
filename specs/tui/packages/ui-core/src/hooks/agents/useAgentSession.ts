import { useState, useEffect, useRef, useCallback } from "react";
import { useAPIClient } from "../../client/context.js";
import type { AgentSession } from "../../types/agents.js";
import type { HookError } from "../../types/errors.js";
import { parseResponseError, NetworkError } from "../../types/errors.js";

export function useAgentSession(
  owner: string,
  repo: string,
  sessionId: string,
): {
  session: AgentSession | null;
  isLoading: boolean;
  error: HookError | null;
  refetch: () => void;
} {
  const client = useAPIClient();
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<HookError | null>(null);
  
  const [refetchCounter, setRefetchCounter] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchSession = useCallback(async () => {
    if (!isMounted.current) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!sessionId.trim()) {
      setSession(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await client.request(
        `/api/repos/${owner}/${repo}/agent/sessions/${sessionId}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        const parsedError = await parseResponseError(response);
        if (isMounted.current) {
          setError(parsedError);
          setIsLoading(false);
        }
        return;
      }

      const raw = await response.json();
      const newSession: AgentSession = {
        ...raw,
        messageCount: raw.messageCount != null ? Number(raw.messageCount) : undefined,
      };

      if (isMounted.current) {
        setSession(newSession);
        setError(null);
        setIsLoading(false);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return;
      }
      if (isMounted.current) {
        setError(err instanceof NetworkError ? err : new NetworkError("Fetch failed", err));
        setIsLoading(false);
      }
    }
  }, [client, owner, repo, sessionId]);

  // Handle parameter changes
  const lastParams = useRef({ owner, repo, sessionId });
  useEffect(() => {
    if (
      lastParams.current.owner !== owner ||
      lastParams.current.repo !== repo ||
      lastParams.current.sessionId !== sessionId
    ) {
      lastParams.current = { owner, repo, sessionId };
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Re-trigger fetch with new params
      fetchSession();
    }
  }, [owner, repo, sessionId, fetchSession]);

  // Handle refetches
  useEffect(() => {
    fetchSession();
  }, [fetchSession, refetchCounter]);

  const refetch = useCallback(() => {
    setRefetchCounter(c => c + 1);
  }, []);

  return { session, isLoading, error, refetch };
}
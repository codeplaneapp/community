import { useState, useEffect, useRef, useCallback } from "react";
import { useAPIClient } from "../../client/context.js";
import { parseResponseError, NetworkError } from "../../types/errors.js";
import type { HookError } from "../../types/errors.js";
import type { Issue } from "../../types/issues.js";

export function useIssue(owner: string, repo: string, issueNumber: number) {
  const client = useAPIClient();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<HookError | null>(null);

  const lastFetchTimestamp = useRef<number>(0);
  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [refetchCounter, setRefetchCounter] = useState(0);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!isMounted.current) return;

    if (issueNumber <= 0) {
      setIssue(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const now = Date.now();
    // Cache validation only on mount/param change, not on refetch
    // refetchCounter changes bypass cache
    // We check if it's the SAME params and within 30s
    if (refetchCounter === 0 && now - lastFetchTimestamp.current < 30_000 && issue) {
      // Use cache
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const fetchIssue = async () => {
      try {
        const response = await client.request(`/api/repos/${owner}/${repo}/issues/${issueNumber}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          const parsedError = await parseResponseError(response);
          if (isMounted.current) {
            setError(parsedError);
            setIsLoading(false);
          }
          return;
        }

        const data = await response.json();
        
        if (isMounted.current) {
          setIssue(data as Issue);
          setError(null);
          setIsLoading(false);
          lastFetchTimestamp.current = Date.now();
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
    };

    fetchIssue();

    // cleanup is handled globally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, issueNumber, refetchCounter, client]);

  // Reset cache timestamp if params change
  useEffect(() => {
    lastFetchTimestamp.current = 0;
  }, [owner, repo, issueNumber]);

  const refetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setRefetchCounter(c => c + 1);
  }, []);

  return {
    issue,
    isLoading,
    error,
    refetch,
  };
}

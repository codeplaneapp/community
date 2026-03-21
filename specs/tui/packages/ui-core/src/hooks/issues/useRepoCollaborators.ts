import { useState, useEffect, useRef, useCallback } from "react";
import { useAPIClient } from "../../client/context.js";
import { parseResponseError, NetworkError } from "../../types/errors.js";
import type { HookError } from "../../types/errors.js";
import type { UserSearchResult, RepoCollaboratorsOptions } from "../../types/issues.js";

export function useRepoCollaborators(
  owner: string, // Unused, for future compatibility
  repo: string,  // Unused, for future compatibility
  options: RepoCollaboratorsOptions
) {
  const client = useAPIClient();

  const query = options.query;
  const enabled = options.enabled ?? true;

  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled && query !== "");
  const [error, setError] = useState<HookError | null>(null);

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

    if (!enabled || query === "") {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setUsers([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const fetchUsers = async () => {
      try {
        const response = await client.request(
          `/api/search/users?q=${encodeURIComponent(query)}&limit=20`,
          { signal: abortController.signal }
        );

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
          setUsers(data.items as UserSearchResult[]);
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
    };

    fetchUsers();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, enabled, refetchCounter, client]);

  const refetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setRefetchCounter(c => c + 1);
  }, []);

  return {
    users,
    isLoading,
    error,
    refetch,
  };
}

import { useState, useEffect, useRef, useCallback } from "react";
import { useAPIClient } from "../../client/APIClientProvider.js";
import { Workspace } from "../../types/workspaces.js";
import { HookError, NetworkError, parseResponseError } from "../../types/errors.js";

export function useWorkspace(
  owner: string,
  repo: string,
  workspaceId: string,
) {
  const { fetch } = useAPIClient();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<HookError | null>(null);
  const refetchCounter = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => {
    refetchCounter.current += 1;
    setWorkspace((prev) => prev); // dummy update
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (workspaceId === "") {
      setWorkspace(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);

    fetch(`/api/repos/${owner}/${repo}/workspaces/${workspaceId}`, {
      signal: abortController.signal,
    })
      .then(async (res) => {
        if (!isMounted) return;
        if (!res.ok) {
          throw await parseResponseError(res);
        }
        const data = await res.json();
        setWorkspace(data);
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err.name === "AbortError") return;
        
        setError(err instanceof Error ? err as HookError : new NetworkError(err.message));
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [owner, repo, workspaceId, refetchCounter.current, fetch]);

  return { workspace, isLoading, error, refetch };
}

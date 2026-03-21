import { useState, useEffect, useRef, useCallback } from "react";
import { useAPIClient } from "../../client/APIClientProvider.js";
import { WorkspaceSSHInfo } from "../../types/workspaces.js";
import { HookError, NetworkError, parseResponseError } from "../../types/errors.js";

const SANDBOX_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;

export function useWorkspaceSSH(
  owner: string,
  repo: string,
  workspaceId: string,
) {
  const { fetch } = useAPIClient();
  const [sshInfo, setSshInfo] = useState<WorkspaceSSHInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<HookError | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const refetchCounter = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => {
    refetchCounter.current += 1;
    setTokenExpiresAt(null);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (workspaceId === "") {
      setSshInfo(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);

    fetch(`/api/repos/${owner}/${repo}/workspaces/${workspaceId}/ssh`, {
      signal: abortController.signal,
    })
      .then(async (res) => {
        if (!isMounted) return;
        if (!res.ok) {
          throw await parseResponseError(res);
        }
        const data = await res.json();
        setSshInfo(data);
        setTokenExpiresAt(Date.now() + SANDBOX_ACCESS_TOKEN_TTL_MS);
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

  const isTokenExpired = tokenExpiresAt !== null && now > tokenExpiresAt;

  return { sshInfo, isLoading, error, refetch, tokenExpiresAt, isTokenExpired };
}

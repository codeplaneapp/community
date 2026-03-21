import { useState, useRef, useCallback, useEffect } from "react";
import { useAPIClient } from "../../client/APIClientProvider.js";
import { ApiError, HookError, NetworkError, parseResponseError } from "../../types/errors.js";

export interface DeleteWorkspaceCallbacks {
  onOptimistic?: (workspaceId: string) => void;
  onRevert?: (workspaceId: string) => void;
  onError?: (error: HookError, workspaceId: string) => void;
  onSettled?: (workspaceId: string) => void;
}

export function useDeleteWorkspace(
  owner: string,
  repo: string,
  callbacks?: DeleteWorkspaceCallbacks,
) {
  const { fetch } = useAPIClient();
  const inflight = useRef(new Map<string, Promise<void>>());
  const abortControllers = useRef(new Map<string, AbortController>());
  const [error, setError] = useState<HookError | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(0);

  const mutate = useCallback((workspaceId: string) => {
    if (!workspaceId) {
      const err = new ApiError(400, "workspace id is required");
      setError(err);
      return Promise.reject(err);
    }

    if (inflight.current.has(workspaceId)) {
      return inflight.current.get(workspaceId)!;
    }

    const abortController = new AbortController();
    abortControllers.current.set(workspaceId, abortController);

    setIsLoadingCount((c) => c + 1);
    
    if (callbacks?.onOptimistic) {
      callbacks.onOptimistic(workspaceId);
    }

    const promise = fetch(`/api/repos/${owner}/${repo}/workspaces/${workspaceId}`, {
      method: "DELETE",
      signal: abortController.signal,
    })
      .then(async (res) => {
        if (res.status !== 204) {
          throw await parseResponseError(res);
        }
        inflight.current.delete(workspaceId);
        abortControllers.current.delete(workspaceId);
        setIsLoadingCount((c) => Math.max(0, c - 1));
        setError(null);
        if (callbacks?.onSettled) {
          callbacks.onSettled(workspaceId);
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          return;
        }
        const hookError = err instanceof Error ? err as HookError : new NetworkError(err.message);
        setError(hookError);
        inflight.current.delete(workspaceId);
        abortControllers.current.delete(workspaceId);
        setIsLoadingCount((c) => Math.max(0, c - 1));
        
        if (callbacks?.onRevert) {
          callbacks.onRevert(workspaceId);
        }
        if (callbacks?.onError) {
          callbacks.onError(hookError, workspaceId);
        }
        if (callbacks?.onSettled) {
          callbacks.onSettled(workspaceId);
        }
        throw hookError;
      });

    inflight.current.set(workspaceId, promise);
    return promise;
  }, [owner, repo, fetch, callbacks]);

  useEffect(() => {
    return () => {
      for (const ac of abortControllers.current.values()) {
        ac.abort();
      }
      abortControllers.current.clear();
      inflight.current.clear();
    };
  }, []);

  return { mutate, isLoading: isLoadingCount > 0, error };
}

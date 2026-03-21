import { useState, useRef, useCallback, useEffect } from "react";
import { useAPIClient } from "../../client/APIClientProvider.js";
import { ApiError, HookError, NetworkError, parseResponseError } from "../../types/errors.js";

export interface DestroyWorkspaceSessionCallbacks {
  onOptimistic?: (sessionId: string) => void;
  onRevert?: (sessionId: string) => void;
  onError?: (error: HookError, sessionId: string) => void;
  onSettled?: (sessionId: string) => void;
}

export function useDestroyWorkspaceSession(
  owner: string,
  repo: string,
  callbacks?: DestroyWorkspaceSessionCallbacks,
) {
  const { fetch } = useAPIClient();
  const inflight = useRef(new Map<string, Promise<void>>());
  const abortControllers = useRef(new Map<string, AbortController>());
  const [error, setError] = useState<HookError | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(0);

  const mutate = useCallback((sessionId: string) => {
    if (!sessionId) {
      const err = new ApiError(400, "session id is required");
      setError(err);
      return Promise.reject(err);
    }

    if (inflight.current.has(sessionId)) {
      return inflight.current.get(sessionId)!;
    }

    const abortController = new AbortController();
    abortControllers.current.set(sessionId, abortController);

    setIsLoadingCount((c) => c + 1);
    
    if (callbacks?.onOptimistic) {
      callbacks.onOptimistic(sessionId);
    }

    const promise = fetch(`/api/repos/${owner}/${repo}/workspace/sessions/${sessionId}/destroy`, {
      method: "POST", // POST instead of DELETE
      signal: abortController.signal,
    })
      .then(async (res) => {
        if (res.status !== 204) {
          throw await parseResponseError(res);
        }
        inflight.current.delete(sessionId);
        abortControllers.current.delete(sessionId);
        setIsLoadingCount((c) => Math.max(0, c - 1));
        setError(null);
        if (callbacks?.onSettled) {
          callbacks.onSettled(sessionId);
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          return;
        }
        const hookError = err instanceof Error ? err as HookError : new NetworkError(err.message);
        setError(hookError);
        inflight.current.delete(sessionId);
        abortControllers.current.delete(sessionId);
        setIsLoadingCount((c) => Math.max(0, c - 1));
        
        if (callbacks?.onRevert) {
          callbacks.onRevert(sessionId);
        }
        if (callbacks?.onError) {
          callbacks.onError(hookError, sessionId);
        }
        if (callbacks?.onSettled) {
          callbacks.onSettled(sessionId);
        }
        throw hookError;
      });

    inflight.current.set(sessionId, promise);
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

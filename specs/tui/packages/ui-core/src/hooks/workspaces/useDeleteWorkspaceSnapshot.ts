import { useState, useRef, useCallback, useEffect } from "react";
import { useAPIClient } from "../../client/APIClientProvider.js";
import { ApiError, HookError, NetworkError, parseResponseError } from "../../types/errors.js";

export interface DeleteWorkspaceSnapshotCallbacks {
  onOptimistic?: (snapshotId: string) => void;
  onRevert?: (snapshotId: string) => void;
  onError?: (error: HookError, snapshotId: string) => void;
  onSettled?: (snapshotId: string) => void;
}

export function useDeleteWorkspaceSnapshot(
  owner: string,
  repo: string,
  callbacks?: DeleteWorkspaceSnapshotCallbacks,
) {
  const { fetch } = useAPIClient();
  const inflight = useRef(new Map<string, Promise<void>>());
  const abortControllers = useRef(new Map<string, AbortController>());
  const [error, setError] = useState<HookError | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(0);

  const mutate = useCallback((snapshotId: string) => {
    if (!snapshotId) {
      const err = new ApiError(400, "snapshot id is required");
      setError(err);
      return Promise.reject(err);
    }

    if (inflight.current.has(snapshotId)) {
      return inflight.current.get(snapshotId)!;
    }

    const abortController = new AbortController();
    abortControllers.current.set(snapshotId, abortController);

    setIsLoadingCount((c) => c + 1);
    
    if (callbacks?.onOptimistic) {
      callbacks.onOptimistic(snapshotId);
    }

    const promise = fetch(`/api/repos/${owner}/${repo}/workspace-snapshots/${snapshotId}`, {
      method: "DELETE",
      signal: abortController.signal,
    })
      .then(async (res) => {
        if (res.status !== 204) {
          throw await parseResponseError(res);
        }
        inflight.current.delete(snapshotId);
        abortControllers.current.delete(snapshotId);
        setIsLoadingCount((c) => Math.max(0, c - 1));
        setError(null);
        if (callbacks?.onSettled) {
          callbacks.onSettled(snapshotId);
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          return;
        }
        const hookError = err instanceof Error ? err as HookError : new NetworkError(err.message);
        setError(hookError);
        inflight.current.delete(snapshotId);
        abortControllers.current.delete(snapshotId);
        setIsLoadingCount((c) => Math.max(0, c - 1));
        
        if (callbacks?.onRevert) {
          callbacks.onRevert(snapshotId);
        }
        if (callbacks?.onError) {
          callbacks.onError(hookError, snapshotId);
        }
        if (callbacks?.onSettled) {
          callbacks.onSettled(snapshotId);
        }
        throw hookError;
      });

    inflight.current.set(snapshotId, promise);
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

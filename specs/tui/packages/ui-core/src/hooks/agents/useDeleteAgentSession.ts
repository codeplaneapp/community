import { useState, useRef, useCallback, useEffect } from "react";
import { useAPIClient } from "../../client/context.js";
import type { HookError } from "../../types/errors.js";
import { parseResponseError, NetworkError } from "../../types/errors.js";

export interface DeleteAgentSessionCallbacks {
  onOptimistic?: (sessionId: string) => void;
  onRevert?: (sessionId: string) => void;
  onError?: (error: HookError, sessionId: string) => void;
  onSettled?: (sessionId: string) => void;
}

export function useDeleteAgentSession(
  owner: string,
  repo: string,
  callbacks?: DeleteAgentSessionCallbacks,
): {
  mutate: (sessionId: string) => Promise<void>;
  isLoading: boolean;
  error: HookError | null;
} {
  const client = useAPIClient();
  const [error, setError] = useState<HookError | null>(null);
  
  // Deduplication map
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isMounted = useRef(true);
  
  // Keep track of active requests to determine `isLoading`
  const [activeCount, setActiveCount] = useState(0);

  // Store callbacks in ref to avoid stale closures
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      for (const controller of abortControllersRef.current.values()) {
        controller.abort();
      }
      abortControllersRef.current.clear();
      inflightRef.current.clear();
    };
  }, []);

  const mutate = useCallback((sessionId: string): Promise<void> => {
    if (inflightRef.current.has(sessionId)) {
      return inflightRef.current.get(sessionId)!;
    }

    if (!sessionId.trim()) {
       return Promise.reject(new Error("session id is required"));
    }

    setError(null);
    setActiveCount(c => c + 1);

    const controller = new AbortController();
    abortControllersRef.current.set(sessionId, controller);

    const cbs = callbacksRef.current;
    if (cbs?.onOptimistic) {
      cbs.onOptimistic(sessionId);
    }

    const promise = (async () => {
      try {
        const response = await client.request(
          `/api/repos/${owner}/${repo}/agent/sessions/${sessionId}`,
          { method: "DELETE", signal: controller.signal }
        );

        if (response.status !== 204) {
          throw await parseResponseError(response);
        }

        if (isMounted.current) {
          if (cbs?.onSettled) cbs.onSettled(sessionId);
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          throw err;
        }

        const hookError = err instanceof Error && "code" in err 
          ? err as HookError 
          : new NetworkError("Delete failed", err);
          
        if (isMounted.current) {
          setError(hookError);
          if (cbs?.onRevert) cbs.onRevert(sessionId);
          if (cbs?.onError) cbs.onError(hookError, sessionId);
          if (cbs?.onSettled) cbs.onSettled(sessionId);
        }
        
        throw hookError;
      } finally {
        if (isMounted.current) {
          inflightRef.current.delete(sessionId);
          abortControllersRef.current.delete(sessionId);
          setActiveCount(c => c - 1);
        }
      }
    })();

    inflightRef.current.set(sessionId, promise);
    return promise;
  }, [client, owner, repo]);

  return {
    mutate,
    isLoading: activeCount > 0,
    error,
  };
}
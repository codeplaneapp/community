import { createContext, useCallback, useRef, useState, useEffect } from "react";
import { useSpinner } from "../hooks/useSpinner.js";
import type {
  LoadingContextValue,
  ScreenLoadingState,
  MutationState,
  LoadingError,
} from "../loading/types.js";
import {
  LOADING_TIMEOUT_MS,
  STATUS_BAR_ERROR_DURATION_MS,
} from "../loading/constants.js";

export const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [screenLoadingStates, setScreenLoadingStates] = useState<
    Map<string, ScreenLoadingState>
  >(new Map());
  const [mutationStates, setMutationStates] = useState<
    Map<string, MutationState>
  >(new Map());
  const [statusBarError, setStatusBarError] = useState<string | null>(null);
  const [retryCallback, setRetryCallbackState] = useState<(() => void) | null>(null);
  const statusBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // Determine if any screen loading is active to drive the shared spinner
  const hasActiveScreenLoading = Array.from(screenLoadingStates.values()).some(
    (s) => s.status === "loading"
  );
  const hasActiveMutation = Array.from(mutationStates.values()).some(
    (m) => m.status === "loading"
  );
  const spinnerFrame = useSpinner(hasActiveScreenLoading || hasActiveMutation);

  const registerLoading = useCallback(
    (id: string, label: string): AbortController => {
      const abortController = new AbortController();
      const state: ScreenLoadingState = {
        id,
        label,
        status: "loading",
        startedAt: Date.now(),
        abortController,
      };

      setScreenLoadingStates((prev) => {
        const next = new Map(prev);
        next.set(id, state);
        return next;
      });

      // Set 30s timeout
      const timer = setTimeout(() => {
        setScreenLoadingStates((prev) => {
          const entry = prev.get(id);
          if (!entry || entry.status !== "loading") return prev;
          const next = new Map(prev);
          next.set(id, {
            ...entry,
            status: "timeout",
            error: {
              type: "timeout",
              summary: "Request timed out",
            },
          });
          return next;
        });
        abortController.abort();
      }, LOADING_TIMEOUT_MS);

      timeoutTimersRef.current.set(id, timer);

      // Emit telemetry event
      emitLoadingEvent("tui.loading.screen_started", { screen: id, label });

      return abortController;
    },
    []
  );

  const completeLoading = useCallback((id: string) => {
    clearTimeoutTimer(id);
    setScreenLoadingStates((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const failLoading = useCallback((id: string, error: LoadingError) => {
    clearTimeoutTimer(id);
    setScreenLoadingStates((prev) => {
      const entry = prev.get(id);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(id, { ...entry, status: "error", error });
      return next;
    });
  }, []);

  const unregisterLoading = useCallback((id: string) => {
    clearTimeoutTimer(id);
    setScreenLoadingStates((prev) => {
      const entry = prev.get(id);
      if (entry) {
        entry.abortController.abort();
      }
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const registerMutation = useCallback(
    (id: string, action: string, entityType: string) => {
      setMutationStates((prev) => {
        const next = new Map(prev);
        next.set(id, {
          id,
          entityType,
          action,
          status: "loading",
          startedAt: Date.now(),
        });
        return next;
      });
    },
    []
  );

  const completeMutation = useCallback((id: string) => {
    setMutationStates((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const failMutation = useCallback(
    (id: string, errorMessage: string) => {
      setMutationStates((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      // Show error in status bar for 5 seconds
      setStatusBarError(errorMessage);
      if (statusBarTimerRef.current) {
        clearTimeout(statusBarTimerRef.current);
      }
      statusBarTimerRef.current = setTimeout(() => {
        setStatusBarError(null);
      }, STATUS_BAR_ERROR_DURATION_MS);
    },
    []
  );

  const setRetryCallback = useCallback((callback: (() => void) | null) => {
    setRetryCallbackState(() => callback);
  }, []);

  function clearTimeoutTimer(id: string) {
    const timer = timeoutTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutTimersRef.current.delete(id);
    }
  }

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timeoutTimersRef.current.values()) {
        clearTimeout(timer);
      }
      if (statusBarTimerRef.current) {
        clearTimeout(statusBarTimerRef.current);
      }
    };
  }, []);

  // Find the most recent screen loading state
  const currentScreenLoading =
    Array.from(screenLoadingStates.values()).find(
      (s) => s.status === "loading" || s.status === "error" || s.status === "timeout"
    ) ?? null;

  const value: LoadingContextValue = {
    registerLoading,
    completeLoading,
    failLoading,
    unregisterLoading,
    registerMutation,
    completeMutation,
    failMutation,
    setRetryCallback,
    retryCallback,
    spinnerFrame,
    isScreenLoading: hasActiveScreenLoading,
    currentScreenLoading,
    activeMutations: mutationStates,
    statusBarError,
  };

  return (
    <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
  );
}

/** Emit a structured telemetry event to stderr. */
function emitLoadingEvent(
  name: string,
  properties: Record<string, unknown>
): void {
  if (process.env.CODEPLANE_TUI_DEBUG === "true") {
    process.stderr.write(
      JSON.stringify({
        component: "tui",
        event: name,
        ...properties,
        timestamp: Date.now(),
      }) + "\n"
    );
  }
}

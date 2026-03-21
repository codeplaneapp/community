import { useEffect, useRef, useCallback, useState } from "react";
import { useLoading } from "./useLoading.js";
import type { UseScreenLoadingOptions, LoadingError } from "../loading/types.js";
import { SPINNER_SKIP_THRESHOLD_MS, RETRY_DEBOUNCE_MS } from "../loading/constants.js";

interface UseScreenLoadingReturn {
  /**
   * AbortSignal to pass to data fetching hooks.
   * Aborted on screen unmount or when user navigates away.
   */
  signal: AbortSignal | undefined;

  /**
   * Whether to show the full-screen spinner.
   * False if data arrived before the skip threshold.
   */
  showSpinner: boolean;

  /**
   * Whether to show skeleton rendering instead of spinner.
   * True when the screen layout is deterministic and loading is active.
   */
  showSkeleton: boolean;

  /**
   * Whether to show the full-screen error state.
   */
  showError: boolean;

  /**
   * The loading error details (if in error state).
   */
  loadingError: LoadingError | null;

  /**
   * Retry handler. Debounced at 1 second.
   */
  retry: () => void;

  /**
   * Spinner frame character from the shared context.
   */
  spinnerFrame: string;
}

/**
 * Hook that manages a screen-level loading lifecycle.
 *
 * Integrates with LoadingProvider to register/unregister loading states,
 * handles the sub-80ms spinner skip, 30s timeout, AbortController
 * cancellation on unmount, and debounced retry.
 *
 * @param options - Screen loading configuration
 * @returns Loading state and controls for the screen
 */
export function useScreenLoading(
  options: UseScreenLoadingOptions
): UseScreenLoadingReturn {
  const { id, label, isLoading, error, onRetry } = options;
  const loading = useLoading();

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingStartRef = useRef<number | null>(null);
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRetryRef = useRef<number>(0);

  // Register loading on mount or when isLoading transitions to true
  useEffect(() => {
    if (isLoading) {
      loadingStartRef.current = Date.now();
      const controller = loading.registerLoading(id, label);
      abortControllerRef.current = controller;

      // Delay spinner visibility by SPINNER_SKIP_THRESHOLD_MS
      // If data arrives before this, spinner is never shown
      spinnerTimerRef.current = setTimeout(() => {
        setShowSpinner(true);
      }, SPINNER_SKIP_THRESHOLD_MS);

      return () => {
        if (spinnerTimerRef.current) {
          clearTimeout(spinnerTimerRef.current);
        }
        setShowSpinner(false);
      };
    } else {
      // Loading completed or was never active
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current);
      }
      setShowSpinner(false);
      loading.completeLoading(id);
      loadingStartRef.current = null;
    }
  }, [isLoading, id, label]);

  // Handle error state
  useEffect(() => {
    if (error && !isLoading) {
      const loadingError = parseToLoadingError(error);
      loading.failLoading(id, loadingError);
    }
  }, [error, isLoading, id]);

  // Cleanup on unmount — cancel in-flight fetches
  useEffect(() => {
    return () => {
      loading.unregisterLoading(id);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [id]);

  // Debounced retry
  const retry = useCallback(() => {
    const now = Date.now();
    if (now - lastRetryRef.current < RETRY_DEBOUNCE_MS) {
      return; // Debounced
    }
    lastRetryRef.current = now;
    onRetry?.();
  }, [onRetry]);

  // Register retry callback with context
  useEffect(() => {
    loading.setRetryCallback(retry);
    return () => loading.setRetryCallback(null);
  }, [retry]);

  const currentState = loading.currentScreenLoading;
  const hasError =
    currentState?.id === id &&
    (currentState.status === "error" || currentState.status === "timeout");

  return {
    signal: abortControllerRef.current?.signal,
    showSpinner: showSpinner && isLoading,
    showSkeleton: isLoading && !showSpinner,
    showError: hasError,
    loadingError: hasError ? (currentState?.error ?? null) : null,
    retry,
    spinnerFrame: loading.spinnerFrame,
  };
}

/**
 * Convert a data hook error into a structured LoadingError.
 */
function parseToLoadingError(error: {
  message: string;
  status?: number;
}): LoadingError {
  const status = error.status;

  if (status === 401) {
    return {
      type: "auth_error",
      httpStatus: 401,
      summary: "Session expired. Run `codeplane auth login`",
    };
  }

  if (status === 429) {
    return {
      type: "rate_limited",
      httpStatus: 429,
      summary: "Rate limited — try again later",
    };
  }

  if (status && status >= 500) {
    return {
      type: "http_error",
      httpStatus: status,
      summary: truncateErrorSummary(
        `Internal Server Error (${status})`
      ),
    };
  }

  if (status && status >= 400) {
    return {
      type: "http_error",
      httpStatus: status,
      summary: truncateErrorSummary(error.message),
    };
  }

  return {
    type: "network",
    summary: truncateErrorSummary(error.message || "Network error"),
  };
}

function truncateErrorSummary(message: string): string {
  if (message.length <= 60) return message;
  return message.slice(0, 57) + "…";
}

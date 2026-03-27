import { useCallback, useRef, useState, useEffect } from "react";
import { useLoading } from "./useLoading.js";
import type { PaginationStatus, LoadingError } from "../loading/types.js";
import { RETRY_DEBOUNCE_MS } from "../loading/constants.js";

interface UsePaginationLoadingOptions {
  /** Screen identifier for telemetry. */
  screen: string;
  /** Whether more pages are available. */
  hasMore: boolean;
  /** Function to fetch the next page. */
  fetchMore: () => Promise<void>;
}

interface UsePaginationLoadingReturn {
  /** Current pagination status. */
  status: PaginationStatus;
  /** Error details if pagination failed. */
  error: LoadingError | null;
  /** Trigger loading the next page. Deduplicates in-flight requests. */
  loadMore: () => void;
  /** Retry a failed pagination request. Debounced at 1 second. */
  retry: () => void;
  /** Spinner frame from shared context. */
  spinnerFrame: string;
}

/**
 * Manages inline pagination loading state.
 *
 * Prevents duplicate in-flight pagination requests,
 * provides debounced retry on failure, and exposes the
 * shared spinner frame for the loading indicator.
 */
export function usePaginationLoading(
  options: UsePaginationLoadingOptions
): UsePaginationLoadingReturn {
  const { screen, hasMore, fetchMore } = options;
  const loading = useLoading();
  const [status, setStatus] = useState<PaginationStatus>("idle");
  const [error, setError] = useState<LoadingError | null>(null);
  const isInFlightRef = useRef(false);
  const lastRetryRef = useRef<number>(0);
  const pageNumberRef = useRef(1);

  const loadMore = useCallback(() => {
    if (!hasMore || isInFlightRef.current) return;

    isInFlightRef.current = true;
    setStatus("loading");
    setError(null);
    pageNumberRef.current++;

    fetchMore()
      .then(() => {
        isInFlightRef.current = false;
        setStatus("idle");
      })
      .catch((err: Error & { status?: number }) => {
        isInFlightRef.current = false;
        const loadingError: LoadingError = {
          type:
            err.status === 429
              ? "rate_limited"
              : err.status
                ? "http_error"
                : "network",
          httpStatus: err.status,
          summary:
            err.status === 429
              ? "Rate limited — try again later"
              : err.message?.slice(0, 60) || "Failed to load",
        };
        setStatus("error");
        setError(loadingError);
      });
  }, [hasMore, fetchMore, screen]);

  const retry = useCallback(() => {
    const now = Date.now();
    if (now - lastRetryRef.current < RETRY_DEBOUNCE_MS) return;
    lastRetryRef.current = now;
    setStatus("idle");
    setError(null);
    loadMore();
  }, [loadMore]);

  // Register retry callback with the LoadingProvider if there's an error
  useEffect(() => {
    if (status === "error") {
      loading.setRetryCallback(retry);
    } else {
      // Avoid clearing another screen's retry if we're not the active error
      // Note: This simple approach assumes only one active pagination error
      // that is currently being interacted with.
      // We don't strictly set to null on success because useScreenLoading
      // might also have registered a retry. This is fine for simple usage.
    }
  }, [status, retry, loading]);

  return {
    status,
    error,
    loadMore,
    retry,
    spinnerFrame: loading.spinnerFrame,
  };
}

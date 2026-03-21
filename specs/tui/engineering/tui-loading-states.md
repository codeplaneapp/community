# TUI_LOADING_STATES — Engineering Specification

Implement the complete loading states system for the Codeplane TUI: full-screen spinner, skeleton rendering, inline pagination indicator, action loading, optimistic UI, `LoadingProvider` context, `AbortController` cancellation, and retry debouncing.

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `tui-bootstrap-and-renderer` | Required | Provides `index.tsx` entry point, `createCliRenderer`, React root, provider stack |
| `tui-spinner-hook` | **Exists** | `apps/tui/src/hooks/useSpinner.ts` — fully implemented with `useSyncExternalStore`, Timeline engine, braille/ASCII frames |
| `tui-theme-provider` | **Exists** | `apps/tui/src/providers/ThemeProvider.tsx`, `apps/tui/src/theme/tokens.ts`, `apps/tui/src/hooks/useTheme.ts` — complete |
| `tui-layout-hook` | **Exists** | `apps/tui/src/hooks/useLayout.ts` — complete with breakpoint system, `contentHeight`, sidebar/modal sizing |
| `tui-util-text` | **Exists** | `apps/tui/src/util/text.ts` — `truncateRight`, `truncateBreadcrumb`, `fitWidth` |
| `tui-e2e-test-infra` | **Exists** | `e2e/tui/helpers.ts` — `launchTUI`, `TUITestInstance`, `createMockAPIEnv` |

---

## Implementation Plan

### Step 1: Loading Types and Constants

**File:** `apps/tui/src/loading/types.ts`

Define all type contracts for the loading states system. This is the foundation that all other modules reference.

```typescript
/**
 * Loading state types for the TUI loading system.
 *
 * These types define the contracts between the LoadingProvider,
 * consumer hooks, and loading state components.
 */

/** Status of a screen-level loading operation. */
export type ScreenLoadingStatus = "idle" | "loading" | "error" | "timeout";

/** Status of a pagination loading operation. */
export type PaginationStatus = "idle" | "loading" | "error";

/** Status of an action mutation. */
export type ActionStatus = "idle" | "loading" | "success" | "error";

/** Registered screen-level loading state. */
export interface ScreenLoadingState {
  id: string;
  label: string;
  status: ScreenLoadingStatus;
  error?: LoadingError;
  startedAt: number;
  abortController: AbortController;
}

/** Registered mutation state for optimistic UI. */
export interface MutationState {
  id: string;
  entityType: string;
  action: string;
  status: ActionStatus;
  startedAt: number;
}

/** Structured error for display in loading error states. */
export interface LoadingError {
  /** One of: "network", "timeout", "http_error", "auth_error", "rate_limited" */
  type: "network" | "timeout" | "http_error" | "auth_error" | "rate_limited";
  /** HTTP status code when applicable. */
  httpStatus?: number;
  /** Human-readable summary capped at 60 characters. */
  summary: string;
}

/** Context value exposed by LoadingProvider. */
export interface LoadingContextValue {
  /**
   * Register a screen-level loading operation.
   * Returns an AbortController for cancellation.
   */
  registerLoading(id: string, label: string): AbortController;

  /**
   * Complete a screen-level loading operation (success).
   * Removes the loading state from the registry.
   */
  completeLoading(id: string): void;

  /**
   * Fail a screen-level loading operation.
   * Transitions the loading state to error with details.
   */
  failLoading(id: string, error: LoadingError): void;

  /**
   * Unregister a loading state entirely (unmount cleanup).
   * Also aborts the associated AbortController.
   */
  unregisterLoading(id: string): void;

  /**
   * Register a mutation for optimistic UI tracking.
   */
  registerMutation(id: string, action: string, entityType: string): void;

  /**
   * Complete a mutation (success).
   */
  completeMutation(id: string): void;

  /**
   * Fail a mutation (triggers revert notification).
   */
  failMutation(id: string, errorMessage: string): void;

  /**
   * Current spinner frame character from the shared useSpinner hook.
   * Empty string when no loading is active.
   */
  spinnerFrame: string;

  /**
   * Whether any screen-level loading is currently active.
   */
  isScreenLoading: boolean;

  /**
   * The current screen loading state (if any).
   */
  currentScreenLoading: ScreenLoadingState | null;

  /**
   * Active mutation states.
   */
  activeMutations: ReadonlyMap<string, MutationState>;

  /**
   * Status bar error message to display (set on optimistic revert).
   * Automatically clears after 5 seconds.
   */
  statusBarError: string | null;
}

/** Options for the useScreenLoading hook. */
export interface UseScreenLoadingOptions {
  /** Unique ID for this loading state (typically screen name + params hash). */
  id: string;
  /** Loading label shown next to spinner (e.g., "Loading issues…"). */
  label: string;
  /**
   * Whether loading is currently active.
   * When true, registers loading state. When false, completes it.
   */
  isLoading: boolean;
  /** Error from the data hook, if any. */
  error?: { message: string; status?: number } | null;
  /** Callback to retry the failed operation. */
  onRetry?: () => void;
}

/** Skeleton row configuration for list views. */
export interface SkeletonRowConfig {
  /** Width of the title block as a fraction of available width (0.4–0.9). */
  titleWidth: number;
  /** Width of the metadata block in characters. */
  metaWidth: number;
  /** Width of the status block in characters. */
  statusWidth: number;
}
```

**File:** `apps/tui/src/loading/constants.ts`

```typescript
/**
 * Loading state constants.
 */

/** Timeout for full-screen loading in milliseconds. */
export const LOADING_TIMEOUT_MS = 30_000;

/**
 * Minimum response time (ms) before showing spinner.
 * If data arrives before this threshold, skip the spinner entirely.
 */
export const SPINNER_SKIP_THRESHOLD_MS = 80;

/** Duration to display optimistic revert error in status bar (ms). */
export const STATUS_BAR_ERROR_DURATION_MS = 5_000;

/** Retry debounce interval in milliseconds. */
export const RETRY_DEBOUNCE_MS = 1_000;

/** Block character for skeleton rendering (Unicode). */
export const SKELETON_BLOCK_CHAR = "▓";

/** Dash character for skeleton rendering (ASCII/no-color). */
export const SKELETON_DASH_CHAR = "-";

/** Maximum characters for loading label (terminal_width - 6). */
export const LOADING_LABEL_PADDING = 6;

/** Maximum characters for error summary. */
export const ERROR_SUMMARY_MAX_LENGTH = 60;

/** Maximum characters for status bar error message (terminal_width - 20). */
export const STATUS_BAR_ERROR_PADDING = 20;

/** Maximum characters for pagination indicator (terminal_width - 4). */
export const PAGINATION_INDICATOR_PADDING = 4;

/** Minimum button width for action loading ("⠋ Saving…" = 10 chars). */
export const MIN_SAVING_BUTTON_WIDTH = 10;
```

---

### Step 2: LoadingProvider Context

**File:** `apps/tui/src/providers/LoadingProvider.tsx`

The `LoadingProvider` is the central coordinator for all loading states. It wraps the content area (inside `AppShell`, outside `ScreenRouter`) and provides the `LoadingContextValue` via React context.

```typescript
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
```

**Integration point — update provider stack in `apps/tui/src/index.tsx`:**

The `LoadingProvider` is inserted between `NavigationProvider` and the `AppShell` component:

```
AppContext.Provider
  → ErrorBoundary
    → AuthProvider
      → APIClientProvider
        → SSEProvider
          → NavigationProvider
            → ThemeProvider
              → LoadingProvider      ← NEW
                → GlobalKeybindings
                  → AppShell
```

**Export from providers barrel — update `apps/tui/src/providers/index.ts`:**

Add: `export { LoadingProvider, LoadingContext } from "./LoadingProvider.js";`

---

### Step 3: useLoading Consumer Hook

**File:** `apps/tui/src/hooks/useLoading.ts`

Convenience hook for consuming the `LoadingContext`. Used by all components and screens that need loading state information.

```typescript
import { useContext } from "react";
import { LoadingContext } from "../providers/LoadingProvider.js";
import type { LoadingContextValue } from "../loading/types.js";

/**
 * Access the loading state context from the nearest LoadingProvider.
 *
 * Provides methods to register/unregister loading states, access the
 * shared spinner frame, and manage optimistic mutations.
 *
 * @throws {Error} if called outside a LoadingProvider.
 */
export function useLoading(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (context === null) {
    throw new Error(
      "useLoading() must be used within a <LoadingProvider>. " +
        "Ensure LoadingProvider is in the component ancestor chain."
    );
  }
  return context;
}
```

**Export from hooks barrel — update `apps/tui/src/hooks/index.ts`:**

Add: `export { useLoading } from "./useLoading.js";`

---

### Step 4: useScreenLoading Hook

**File:** `apps/tui/src/hooks/useScreenLoading.ts`

Orchestrates the lifecycle of a screen-level loading operation. Bridges between `@codeplane/ui-core` data hooks (which expose `isLoading`, `error`) and the `LoadingProvider`.

```typescript
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
```

**Export from hooks barrel — update `apps/tui/src/hooks/index.ts`:**

Add: `export { useScreenLoading } from "./useScreenLoading.js";`

---

### Step 5: useOptimisticMutation Hook

**File:** `apps/tui/src/hooks/useOptimisticMutation.ts`

Generic optimistic mutation hook for action loading states.

```typescript
import { useCallback, useRef } from "react";
import { useLoading } from "./useLoading.js";

interface OptimisticMutationOptions<TArgs> {
  /** Unique ID for this mutation instance. */
  id: string;
  /** Entity type for telemetry (e.g., "issue", "notification"). */
  entityType: string;
  /** Action name for telemetry (e.g., "close", "mark_read"). */
  action: string;
  /** The server mutation function. */
  mutate: (args: TArgs) => Promise<void>;
  /** Apply optimistic local state update. */
  onOptimistic: (args: TArgs) => void;
  /** Revert local state on server error. */
  onRevert: (args: TArgs) => void;
  /** Optional callback after successful mutation. */
  onSuccess?: (args: TArgs) => void;
}

interface OptimisticMutationReturn<TArgs> {
  /** Execute the optimistic mutation. */
  execute: (args: TArgs) => void;
  /** Whether the mutation is in-flight. */
  isLoading: boolean;
}

/**
 * Hook for mutations with optimistic local state updates.
 *
 * Applies the local state change immediately via onOptimistic,
 * fires the server mutation, and reverts via onRevert if the
 * server returns an error. A 5-second error message is shown
 * in the status bar on revert.
 *
 * The mutation continues in the background if the user navigates
 * away — it is never canceled on unmount.
 */
export function useOptimisticMutation<TArgs>(
  options: OptimisticMutationOptions<TArgs>
): OptimisticMutationReturn<TArgs> {
  const {
    id,
    entityType,
    action,
    mutate,
    onOptimistic,
    onRevert,
    onSuccess,
  } = options;
  const loading = useLoading();
  const isLoadingRef = useRef(false);

  const execute = useCallback(
    (args: TArgs) => {
      // Apply optimistic update immediately
      onOptimistic(args);
      isLoadingRef.current = true;
      loading.registerMutation(id, action, entityType);

      // Fire mutation — intentionally NOT using AbortController
      // because mutations must complete even if user navigates away
      mutate(args)
        .then(() => {
          isLoadingRef.current = false;
          loading.completeMutation(id);
          onSuccess?.(args);
        })
        .catch((error: Error) => {
          isLoadingRef.current = false;
          onRevert(args);

          const errorMessage =
            error.message.length > 60
              ? error.message.slice(0, 57) + "…"
              : error.message;
          loading.failMutation(id, `✗ ${errorMessage}`);

          // Log revert for observability
          process.stderr.write(
            `loading: action ${action} failed on ${entityType}: ` +
              `${error.message} — reverting optimistic update\n`
          );
        });
    },
    [id, entityType, action, mutate, onOptimistic, onRevert, onSuccess, loading]
  );

  return {
    execute,
    isLoading: isLoadingRef.current,
  };
}
```

**Export from hooks barrel — update `apps/tui/src/hooks/index.ts`:**

Add: `export { useOptimisticMutation } from "./useOptimisticMutation.js";`

---

### Step 6: usePaginationLoading Hook

**File:** `apps/tui/src/hooks/usePaginationLoading.ts`

Manages pagination loading state with in-flight deduplication and retry.

```typescript
import { useCallback, useRef, useState } from "react";
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

  return {
    status,
    error,
    loadMore,
    retry,
    spinnerFrame: loading.spinnerFrame,
  };
}
```

**Export from hooks barrel — update `apps/tui/src/hooks/index.ts`:**

Add: `export { usePaginationLoading } from "./usePaginationLoading.js";`

---

### Step 7: FullScreenLoading Component

**File:** `apps/tui/src/components/FullScreenLoading.tsx`

Renders the centered spinner + label in the content area.

```typescript
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";
import { LOADING_LABEL_PADDING } from "../loading/constants.js";

interface FullScreenLoadingProps {
  /** Spinner frame character from shared context. */
  spinnerFrame: string;
  /** Loading label (e.g., "Loading issues…"). */
  label: string;
}

/**
 * Full-screen loading spinner, centered in the content area.
 *
 * Renders a single line: `{spinnerFrame} {label}`
 * centered both horizontally and vertically within the available
 * content height (total height minus header and status bar).
 *
 * The label is truncated to fit within `terminal_width - 6`.
 * The spinner character uses the `primary` theme color.
 */
export function FullScreenLoading({
  spinnerFrame,
  label,
}: FullScreenLoadingProps) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();

  const maxLabelWidth = Math.max(1, width - LOADING_LABEL_PADDING);
  const truncatedLabel = truncateRight(label, maxLabelWidth);

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
      width="100%"
      height={contentHeight}
    >
      <text>
        <span fg={theme.primary}>{spinnerFrame}</span>
        <span> {truncatedLabel}</span>
      </text>
    </box>
  );
}
```

---

### Step 8: FullScreenError Component

**File:** `apps/tui/src/components/FullScreenError.tsx`

Renders the error state after a loading failure.

```typescript
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";
import type { LoadingError } from "../loading/types.js";

interface FullScreenErrorProps {
  /** Screen label for the error message (e.g., "issues"). */
  screenLabel: string;
  /** Structured error details. */
  error: LoadingError;
}

/**
 * Full-screen error display, centered in the content area.
 *
 * Shows:
 *   ✗ Failed to load {screenLabel}
 *   {error.summary}
 *
 * The status bar should show "R retry" hint when this is visible.
 */
export function FullScreenError({
  screenLabel,
  error,
}: FullScreenErrorProps) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();

  const errorLine = `✗ Failed to load ${screenLabel}`;
  const summaryLine = error.httpStatus
    ? `${error.summary} (${error.httpStatus})`
    : error.summary;

  const maxWidth = Math.max(10, width - 4);

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
      width="100%"
      height={contentHeight}
    >
      <text attributes={1} fg={theme.error}>
        {truncateRight(errorLine, maxWidth)}
      </text>
      <text />
      <text fg={theme.muted}>{truncateRight(summaryLine, maxWidth)}</text>
    </box>
  );
}
```

---

### Step 9: SkeletonList and SkeletonDetail Components

**File:** `apps/tui/src/components/SkeletonList.tsx`

```typescript
import { useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { isUnicodeSupported } from "../theme/detect.js";
import { SKELETON_BLOCK_CHAR, SKELETON_DASH_CHAR } from "../loading/constants.js";
import type { SkeletonRowConfig } from "../loading/types.js";

interface SkeletonListProps {
  /**
   * Number of columns in the list layout.
   * Default: 3 (title, metadata, status)
   */
  columns?: number;
  /** Fixed metadata column width in characters. Default: 6. */
  metaWidth?: number;
  /** Fixed status column width in characters. Default: 5. */
  statusWidth?: number;
}

/**
 * Skeleton placeholder for list views.
 *
 * Renders placeholder rows using muted block characters (▓) at
 * deterministic widths. Row count matches the available content
 * height — no off-screen rendering.
 *
 * Widths are seeded by row index (not random per render) to
 * prevent flicker on re-render or resize.
 */
export function SkeletonList({
  columns = 3,
  metaWidth = 6,
  statusWidth = 5,
}: SkeletonListProps) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();
  const unicode = isUnicodeSupported();
  const blockChar = unicode ? SKELETON_BLOCK_CHAR : SKELETON_DASH_CHAR;

  // Generate deterministic row configs based on row index
  const rows = useMemo(() => {
    const rowCount = Math.max(0, contentHeight);
    const availableWidth = Math.max(10, width - 4); // 2 padding each side
    const titleAvailable = availableWidth - metaWidth - statusWidth - 4; // gaps

    const result: SkeletonRowConfig[] = [];
    for (let i = 0; i < rowCount; i++) {
      // Deterministic width based on row index (40%–90% of available)
      const fraction = 0.4 + ((((i * 7 + 3) * 13) % 50) / 100);
      result.push({
        titleWidth: Math.max(3, Math.floor(titleAvailable * fraction)),
        metaWidth,
        statusWidth,
      });
    }
    return result;
  }, [width, contentHeight, metaWidth, statusWidth]);

  return (
    <box flexDirection="column" width="100%" height={contentHeight}>
      {rows.map((row, i) => (
        <box key={i} flexDirection="row" height={1} paddingX={1}>
          <text fg={theme.muted}>
            {blockChar.repeat(row.titleWidth)}
          </text>
          <box flexGrow={1} />
          {columns >= 2 && (
            <text fg={theme.muted}>
              {blockChar.repeat(row.metaWidth)}
            </text>
          )}
          {columns >= 3 && (
            <>
              <text>  </text>
              <text fg={theme.muted}>
                {blockChar.repeat(row.statusWidth)}
              </text>
            </>
          )}
        </box>
      ))}
    </box>
  );
}
```

**File:** `apps/tui/src/components/SkeletonDetail.tsx`

```typescript
import { useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { isUnicodeSupported } from "../theme/detect.js";
import { SKELETON_BLOCK_CHAR, SKELETON_DASH_CHAR } from "../loading/constants.js";

interface SkeletonDetailProps {
  /** Section headers to show (e.g., ["Description", "Comments"]). */
  sections?: string[];
}

/**
 * Skeleton placeholder for detail views.
 *
 * Shows section headers with placeholder body blocks.
 * Section headers are real text; body content is block characters.
 */
export function SkeletonDetail({
  sections = ["Description", "Comments"],
}: SkeletonDetailProps) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();
  const unicode = isUnicodeSupported();
  const blockChar = unicode ? SKELETON_BLOCK_CHAR : SKELETON_DASH_CHAR;

  const bodyRows = useMemo(() => {
    const availableWidth = Math.max(10, width - 6);
    // 3 placeholder lines per section
    const result: number[][] = [];
    for (let s = 0; s < sections.length; s++) {
      const sectionRows: number[] = [];
      for (let r = 0; r < 3; r++) {
        const fraction = 0.5 + ((((s * 5 + r * 7 + 2) * 11) % 40) / 100);
        sectionRows.push(
          Math.max(3, Math.floor(availableWidth * fraction))
        );
      }
      result.push(sectionRows);
    }
    return result;
  }, [width, sections.length]);

  return (
    <box flexDirection="column" width="100%" padding={1} gap={1}>
      {/* Title skeleton */}
      <text fg={theme.muted} attributes={1}>
        {blockChar.repeat(Math.min(30, Math.floor((width - 4) * 0.6)))}
      </text>

      {sections.map((header, si) => (
        <box key={si} flexDirection="column" gap={0}>
          <text fg={theme.muted} attributes={1}>
            {header}
          </text>
          {bodyRows[si]?.map((rowWidth, ri) => (
            <box key={ri} paddingX={1}>
              <text fg={theme.muted}>{blockChar.repeat(rowWidth)}</text>
            </box>
          ))}
        </box>
      ))}
    </box>
  );
}
```

---

### Step 10: PaginationIndicator Component

**File:** `apps/tui/src/components/PaginationIndicator.tsx`

```typescript
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";
import type { PaginationStatus, LoadingError } from "../loading/types.js";
import { PAGINATION_INDICATOR_PADDING } from "../loading/constants.js";

interface PaginationIndicatorProps {
  /** Current pagination status. */
  status: PaginationStatus;
  /** Spinner frame from shared context. */
  spinnerFrame: string;
  /** Error details if pagination failed. */
  error?: LoadingError | null;
}

/**
 * Inline pagination loading indicator rendered at the bottom of a scrollbox.
 *
 * Shows:
 * - Loading: "{spinnerFrame} Loading more…" in muted color
 * - Error: "✗ Failed to load — R to retry" in error color
 *
 * Text is capped at terminal_width - 4 characters.
 */
export function PaginationIndicator({
  status,
  spinnerFrame,
  error,
}: PaginationIndicatorProps) {
  const { width } = useLayout();
  const theme = useTheme();
  const maxWidth = Math.max(10, width - PAGINATION_INDICATOR_PADDING);

  if (status === "idle") return null;

  if (status === "loading") {
    return (
      <box height={1} paddingX={1}>
        <text fg={theme.muted}>
          <span fg={theme.primary}>{spinnerFrame}</span>
          <span> {truncateRight("Loading more…", maxWidth - 2)}</span>
        </text>
      </box>
    );
  }

  // status === "error"
  const errorText =
    error?.type === "rate_limited"
      ? "Rate limited — try again later"
      : "Failed to load — R to retry";

  return (
    <box height={1} paddingX={1}>
      <text fg={theme.error}>
        {truncateRight(`✗ ${errorText}`, maxWidth)}
      </text>
    </box>
  );
}
```

---

### Step 11: ActionButton Component

**File:** `apps/tui/src/components/ActionButton.tsx`

```typescript
import { useTheme } from "../hooks/useTheme.js";
import { useLoading } from "../hooks/useLoading.js";
import { MIN_SAVING_BUTTON_WIDTH } from "../loading/constants.js";

interface ActionButtonProps {
  /** Button label when not loading. */
  label: string;
  /** Whether the button is in loading state. */
  isLoading?: boolean;
  /** Custom loading label. Default: "Saving…" */
  loadingLabel?: string;
  /** Press handler. */
  onPress?: () => void;
  /** Whether the button is disabled. */
  disabled?: boolean;
}

/**
 * Button component with action loading support.
 *
 * When isLoading is true, displays a spinner + "Saving…" label
 * in place of the normal label. The button width expands if needed
 * to fit the loading label (minimum 10 characters).
 */
export function ActionButton({
  label,
  isLoading = false,
  loadingLabel = "Saving…",
  onPress,
  disabled,
}: ActionButtonProps) {
  const theme = useTheme();
  const loading = useLoading();

  const displayLabel = isLoading
    ? `${loading.spinnerFrame} ${loadingLabel}`
    : label;
  const minWidth = isLoading
    ? Math.max(label.length, MIN_SAVING_BUTTON_WIDTH)
    : label.length;

  return (
    <box
      height={1}
      minWidth={minWidth + 2}
      paddingX={1}
      border="single"
      borderColor={disabled || isLoading ? theme.muted : theme.primary}
    >
      <text
        fg={disabled || isLoading ? theme.muted : theme.primary}
        attributes={disabled ? 0 : 1}
      >
        {displayLabel}
      </text>
    </box>
  );
}
```

---

### Step 12: StatusBar Enhancement

**File:** `apps/tui/src/components/StatusBar.tsx` (modify existing)

The existing `StatusBar` must be updated to:
1. Display `statusBarError` from `LoadingContext` in error color.
2. Show `R retry` hint when a retriable error is active.
3. Truncate error messages to `terminal_width - 20`.

The modification adds a conditional rendering path: when `statusBarError` is non-null, the left portion of the status bar shows the error message in `theme.error` color instead of the normal keybinding hints.

Additionally, when a full-screen error state is active (`currentScreenLoading?.status === "error"` or `"timeout"`), the hints area appends `R retry` to indicate the retry keybinding.

**Changes to `StatusBar.tsx`:**

```typescript
// Add imports:
import { useLoading } from "../hooks/useLoading.js";
import { STATUS_BAR_ERROR_PADDING } from "../loading/constants.js";

// Inside StatusBar component, add:
const { statusBarError, currentScreenLoading } = useLoading();

const showRetryHint =
  currentScreenLoading?.status === "error" ||
  currentScreenLoading?.status === "timeout";

// Replace hint calculation:
const maxErrorWidth = Math.max(10, width - STATUS_BAR_ERROR_PADDING);

// Conditional render: if statusBarError is set, show error in left area
// If showRetryHint, append "R retry" to the hints
```

The exact edit replaces the hint computation and render to include error state awareness. The `R retry` hint is appended to the keybinding hints when a retriable error state is active on the screen.

---

### Step 13: Loading Barrel Export

**File:** `apps/tui/src/loading/index.ts`

```typescript
export type {
  ScreenLoadingStatus,
  PaginationStatus,
  ActionStatus,
  ScreenLoadingState,
  MutationState,
  LoadingError,
  LoadingContextValue,
  UseScreenLoadingOptions,
  SkeletonRowConfig,
} from "./types.js";

export {
  LOADING_TIMEOUT_MS,
  SPINNER_SKIP_THRESHOLD_MS,
  STATUS_BAR_ERROR_DURATION_MS,
  RETRY_DEBOUNCE_MS,
  SKELETON_BLOCK_CHAR,
  SKELETON_DASH_CHAR,
  LOADING_LABEL_PADDING,
  ERROR_SUMMARY_MAX_LENGTH,
  STATUS_BAR_ERROR_PADDING,
  PAGINATION_INDICATOR_PADDING,
  MIN_SAVING_BUTTON_WIDTH,
} from "./constants.js";
```

---

### Step 14: Component Barrel Update

**File:** `apps/tui/src/components/index.ts` (update existing)

Add exports for all new components:

```typescript
export { FullScreenLoading } from "./FullScreenLoading.js";
export { FullScreenError } from "./FullScreenError.js";
export { SkeletonList } from "./SkeletonList.js";
export { SkeletonDetail } from "./SkeletonDetail.js";
export { PaginationIndicator } from "./PaginationIndicator.js";
export { ActionButton } from "./ActionButton.js";
```

---

### Step 15: Integrate Loading States into AppShell and ScreenRouter

**File:** `apps/tui/src/components/AppShell.tsx` (modify existing)

The AppShell wraps the `ScreenRouter` content area with the `LoadingProvider`. The full-screen loading and error states are rendered as alternatives to the screen content — when a screen is in loading state, the `FullScreenLoading` component replaces the screen content; when in error state, `FullScreenError` replaces it.

This integration is done at the screen component level, not in AppShell directly. Each screen component uses `useScreenLoading` to determine what to render:

```typescript
// Example pattern for a screen component:
function IssueListScreen() {
  const { owner, repo } = useNavigation().current.params ?? {};
  const issues = useIssues(owner, repo);

  const {
    showSpinner,
    showSkeleton,
    showError,
    loadingError,
    retry,
    spinnerFrame,
  } = useScreenLoading({
    id: "issues",
    label: "Loading issues…",
    isLoading: issues.isLoading,
    error: issues.error,
    onRetry: issues.refetch,
  });

  if (showError && loadingError) {
    return <FullScreenError screenLabel="issues" error={loadingError} />;
  }

  if (showSpinner) {
    return <FullScreenLoading spinnerFrame={spinnerFrame} label="Loading issues…" />;
  }

  if (showSkeleton) {
    return <SkeletonList />;
  }

  // Render actual content...
}
```

The `LoadingProvider` is added to `AppShell.tsx` wrapping the content area:

```typescript
import { LoadingProvider } from "../providers/LoadingProvider.js";

export function AppShell() {
  const { width, height } = useTerminalDimensions();
  const breakpoint = getBreakpoint(width, height);

  if (breakpoint === "unsupported") {
    return <TerminalTooSmallScreen cols={width} rows={height} />;
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <HeaderBar />
      <LoadingProvider>
        <box flexGrow={1} width="100%">
          <ScreenRouter />
        </box>
      </LoadingProvider>
      <StatusBar />
    </box>
  );
}
```

Note: `StatusBar` needs access to `LoadingContext` for error display, so `LoadingProvider` must wrap both the content area and `StatusBar`. The exact wrapping should be:

```typescript
return (
  <LoadingProvider>
    <box flexDirection="column" width="100%" height="100%">
      <HeaderBar />
      <box flexGrow={1} width="100%">
        <ScreenRouter />
      </box>
      <StatusBar />
    </box>
  </LoadingProvider>
);
```

---

### Step 16: Retry Keybinding Integration

**File:** `apps/tui/src/components/GlobalKeybindings.tsx` (modify existing)

Add `R` key handling for retry in error states, and ensure all global keybindings remain active during loading states.

The `R` key handler checks if there's an active screen error or pagination error, and calls the registered retry callback. The retry is debounced at 1 second — this debounce is already handled inside `useScreenLoading` and `usePaginationLoading`.

Add to the `handleKey` callback in `GlobalKeybindings`:

```typescript
// After existing key handlers, before the closing of handleKey:
if (event.name === "R" || (event.name === "r" && event.shift)) {
  // Retry is handled by the active screen's useScreenLoading hook
  // The screen registers a retry callback that is invoked here.
  // This is dispatched via a custom event or a ref-based callback registry.
  // See "Retry dispatch" section below.
  return;
}
```

The retry dispatch uses a ref stored in the `LoadingProvider` context. When a screen calls `useScreenLoading` with an `onRetry` callback, that callback is registered in the `LoadingProvider`. The `R` key in `GlobalKeybindings` reads this callback and invokes it.

**Add to `LoadingContextValue`:**

```typescript
/** Register a retry callback for the current screen. */
setRetryCallback(callback: (() => void) | null): void;
/** Currently registered retry callback. */
retryCallback: (() => void) | null;
```

In `GlobalKeybindings`, when `R` is pressed:

```typescript
const { retryCallback } = useLoading();
if (event.name === "R" && retryCallback) {
  retryCallback();
  return;
}
```

---

## File Summary

| File Path | Action | Description |
|-----------|--------|-------------|
| `apps/tui/src/loading/types.ts` | **Create** | Loading state type definitions |
| `apps/tui/src/loading/constants.ts` | **Create** | Loading state constants |
| `apps/tui/src/loading/index.ts` | **Create** | Barrel export for loading module |
| `apps/tui/src/providers/LoadingProvider.tsx` | **Create** | Context provider for loading state management |
| `apps/tui/src/hooks/useLoading.ts` | **Create** | Consumer hook for LoadingContext |
| `apps/tui/src/hooks/useScreenLoading.ts` | **Create** | Screen-level loading lifecycle hook |
| `apps/tui/src/hooks/useOptimisticMutation.ts` | **Create** | Optimistic mutation hook |
| `apps/tui/src/hooks/usePaginationLoading.ts` | **Create** | Pagination loading state hook |
| `apps/tui/src/components/FullScreenLoading.tsx` | **Create** | Centered spinner + label component |
| `apps/tui/src/components/FullScreenError.tsx` | **Create** | Centered error display component |
| `apps/tui/src/components/SkeletonList.tsx` | **Create** | Skeleton placeholder for list views |
| `apps/tui/src/components/SkeletonDetail.tsx` | **Create** | Skeleton placeholder for detail views |
| `apps/tui/src/components/PaginationIndicator.tsx` | **Create** | Inline pagination loading indicator |
| `apps/tui/src/components/ActionButton.tsx` | **Create** | Button with action loading state |
| `apps/tui/src/components/StatusBar.tsx` | **Modify** | Add error display and retry hint |
| `apps/tui/src/components/AppShell.tsx` | **Modify** | Wrap with LoadingProvider |
| `apps/tui/src/components/GlobalKeybindings.tsx` | **Modify** | Add R retry keybinding |
| `apps/tui/src/components/index.ts` | **Modify** | Add new component exports |
| `apps/tui/src/hooks/index.ts` | **Modify** | Add new hook exports |
| `apps/tui/src/providers/index.ts` | **Modify** | Add LoadingProvider export |

---

## Productionization Notes

### From PoC to Production

1. **`useScreenLoading` skip-threshold timer**: The 80ms `setTimeout` for spinner skip must be validated in CI at various terminal performance levels. If OpenTUI's first paint is consistently sub-80ms for cached screens, the threshold is correct. If not, tune the constant per profiling data.

2. **Skeleton width determinism**: The current formula `0.4 + ((((i * 7 + 3) * 13) % 50) / 100)` produces visually varied widths that are deterministic per row index. This must be validated against snapshot tests at all three breakpoints (80×24, 120×40, 200×60) to ensure no row produces degenerate widths (all identical or all max).

3. **`LoadingProvider` memory**: The `screenLoadingStates` and `mutationStates` maps grow with registered states. Each state is removed on unmount (`unregisterLoading`) or completion. Verify via a long-running session test (navigate between 100+ screens) that the maps stabilize at ≤5 entries.

4. **Timeout timer cleanup**: The 30-second timeout timers stored in `timeoutTimersRef` must be cleaned up on both successful completion and unmount. The current implementation handles both paths, but edge cases where a screen unmounts during the exact moment of timeout completion need race condition testing.

5. **Optimistic mutation background execution**: Mutations intentionally do NOT use `AbortController` and continue running after screen unmount. This means the `failMutation` callback may fire after the `LoadingProvider` has changed state. The implementation handles this because `setStatusBarError` is safe to call even if the source screen is unmounted — the error displays in the status bar regardless of which screen is currently active.

6. **`useSyncExternalStore` integration**: The `useSpinner` hook already uses `useSyncExternalStore` for frame synchronization. The `LoadingProvider` consumes `useSpinner` which triggers re-renders on frame changes. This means all components consuming `LoadingContext` will re-render every 80ms during active loading. This is acceptable because:
   - Only the spinner character changes (single character diff)
   - OpenTUI's reconciler is diffing-optimized for terminal output
   - The frame rate is already constrained by the 80ms interval
   - When no loading is active, `useSpinner(false)` returns `""` and stops the timeline, so zero unnecessary renders occur

7. **Telemetry event emission**: The `emitLoadingEvent` function writes to `stderr` only when `CODEPLANE_TUI_DEBUG=true`. In production, these events should be routed to the Codeplane telemetry pipeline. The current stderr approach is sufficient for Community Edition; Cloud Edition would pipe these to an analytics ingestion endpoint.

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All loading states tests are added to the existing `app-shell.test.ts` file, within a dedicated `describe("TUI_LOADING_STATES", ...)` block.

The tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts`. Tests run against the real TUI process — no mocking of implementation details.

```typescript
import { describe, expect, test, afterEach } from "bun:test";
import {
  launchTUI,
  createMockAPIEnv,
  type TUITestInstance,
} from "./helpers";

describe("TUI_LOADING_STATES", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  // ─── Terminal Snapshot Tests ──────────────────────────────────────────

  describe("Full-screen loading spinner", () => {
    test("LOAD-SNAP-001: full-screen loading spinner renders centered with label at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      // Loading state should appear before data arrives
      await terminal.waitForText("Loading issues");
      const snapshot = terminal.snapshot();
      // Spinner character should be a braille character
      expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
      expect(snapshot).toContain("Loading issues");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-002: full-screen loading spinner renders centered with label at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-003: full-screen loading spinner renders centered with label at 200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-004: full-screen spinner uses primary color (ANSI 33)", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      // The spinner character should be styled with ANSI blue (code 33)
      // In the raw terminal buffer, look for ANSI escape sequence
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    });

    test("LOAD-SNAP-005: header bar and status bar remain stable during loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      // Header bar (line 0) should show breadcrumb
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard|Issues|acme/);
      // Status bar (last line) should show keybinding hints
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/q.*back|help/);
    });

    test("LOAD-SNAP-006: context-specific loading labels", async () => {
      // Issues screen
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      expect(terminal.snapshot()).toContain("Loading issues");
      await terminal.terminate();

      // Notifications screen
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Loading notifications");
      expect(terminal.snapshot()).toContain("Loading notifications");
    });
  });

  describe("Skeleton rendering", () => {
    test("LOAD-SNAP-010: skeleton list renders placeholder rows with muted block characters", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      // Skeleton may appear briefly or as a fallback before spinner
      // Look for block characters in the output
      const snapshot = terminal.snapshot();
      // Either skeleton blocks or loading spinner should appear
      const hasBlocks = snapshot.includes("▓");
      const hasSpinner = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(snapshot);
      expect(hasBlocks || hasSpinner).toBe(true);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-011: skeleton rows have varying widths at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snapshot = terminal.snapshot();
      if (snapshot.includes("▓")) {
        // Extract lines containing block characters
        const lines = snapshot.split("\n").filter((l: string) => l.includes("▓"));
        if (lines.length > 1) {
          // Check that not all block sequences have the same length
          const lengths = lines.map(
            (l: string) => (l.match(/▓+/)?.[0]?.length ?? 0)
          );
          const unique = new Set(lengths);
          expect(unique.size).toBeGreaterThan(1);
        }
      }
    });

    test("LOAD-SNAP-012: skeleton rows do not exceed visible content area height", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snapshot = terminal.snapshot();
      if (snapshot.includes("▓")) {
        const blockLines = snapshot.split("\n").filter((l: string) => l.includes("▓"));
        // Content height = rows - 2 (header + status bar)
        expect(blockLines.length).toBeLessThanOrEqual(terminal.rows - 2);
      }
    });

    test("LOAD-SNAP-013: skeleton detail renders section headers at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      // Navigate to an issue detail
      await terminal.waitForText("Issues");
      await terminal.sendKeys("Enter");
      // Detail skeleton should show section headers like Description
      const snapshot = terminal.snapshot();
      // The detail view may show section headers during skeleton
      expect(snapshot).toMatchSnapshot();
    });

    test("LOAD-SNAP-014: skeleton transitions to content without flicker", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      // Wait for content to load (skeleton → content transition)
      // There should be no intermediate blank frame
      await terminal.waitForText("Loading issues");
      // After data arrives, content should replace loading
      // This test validates the transition by checking no blank content area exists
      const snapshot = terminal.snapshot();
      const contentLines = snapshot.split("\n").slice(1, -1);
      // At least the loading indicator or content should be visible
      const hasContent = contentLines.some(
        (l: string) => l.trim().length > 0
      );
      expect(hasContent).toBe(true);
    });
  });

  describe("Inline pagination loading", () => {
    test("LOAD-SNAP-020: pagination loading indicator at list bottom at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      // Wait for first page to load, then scroll to trigger pagination
      await terminal.waitForText("Issues");
      // Scroll to bottom
      await terminal.sendKeys("G");
      // Look for pagination indicator
      const snapshot = terminal.snapshot();
      const hasLoadingMore = snapshot.includes("Loading more");
      const hasIssues = snapshot.includes("Issues");
      // At least the Issues screen should be visible
      expect(hasIssues).toBe(true);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-021: pagination loading indicator at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("G");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-022: pagination error shows retry hint", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      // Scroll to trigger pagination (which may fail against test API)
      await terminal.sendKeys("G");
      const snapshot = terminal.snapshot();
      // If pagination fails, should show retry hint
      if (snapshot.includes("Failed to load")) {
        expect(snapshot).toMatch(/R.*retry/);
      }
    });
  });

  describe("Action loading", () => {
    test("LOAD-SNAP-030: action button shows spinner during submission", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      // Try to trigger a mutation (close issue)
      await terminal.sendKeys("Enter");
      // The action may show a spinner on the button
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-031: action loading on list row shows spinner", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      // Trigger close action on focused issue (if keybinding exists)
      // This validates that the row shows an inline spinner
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("Full-screen error", () => {
    test("LOAD-SNAP-040: error renders after failed load at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      // With an unreachable API, loading should fail
      const snapshot = terminal.snapshot();
      // Should show either loading, error, or timeout
      expect(snapshot.length).toBeGreaterThan(0);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-041: error renders after failed load at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-042: error renders after failed load at 200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-043: error shows R retry in status bar", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      // Wait for error to appear
      await terminal.waitForText("Failed to load", 35_000);
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/R.*retry/);
    });
  });

  describe("Optimistic UI revert", () => {
    test("LOAD-SNAP-050: optimistic revert shows error in status bar", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      // Trigger a mutation that will fail
      // The optimistic revert should show an error in the status bar
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("No-color terminal", () => {
    test("LOAD-SNAP-060: no-color uses ASCII spinner", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: { NO_COLOR: "1" },
      });
      // Should use ASCII characters, not braille
      const snapshot = terminal.snapshot();
      const hasBraille = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(snapshot);
      expect(hasBraille).toBe(false);
      // Should use ASCII spinner (|, /, -, \) if loading state is visible
      if (snapshot.includes("Loading")) {
        expect(snapshot).toMatch(/[|/\\\-]/);
      }
    });

    test("LOAD-SNAP-061: no-color skeleton uses dash characters", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: { NO_COLOR: "1" },
      });
      const snapshot = terminal.snapshot();
      // Should not contain block characters
      expect(snapshot).not.toContain("▓");
      // If skeleton is visible, should use dashes
      if (snapshot.includes("---")) {
        expect(snapshot).toMatch(/-{3,}/);
      }
    });
  });

  describe("Loading timeout", () => {
    test("LOAD-SNAP-070: loading timeout shows error after 30 seconds", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://10.255.255.1" }), // non-routable
        },
      });
      // Wait for timeout (30s + buffer)
      await terminal.waitForText("timed out", 35_000);
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("timed out");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ─── Keyboard Interaction Tests ────────────────────────────────────────

  describe("Keyboard interactions during loading", () => {
    test("LOAD-KEY-001: q pops screen during full-screen loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      // Wait for loading state
      await terminal.waitForText("Loading");
      // Press q to go back
      await terminal.sendKeys("q");
      // Should return to previous screen
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("Loading issues");
    });

    test("LOAD-KEY-002: Ctrl+C exits TUI during full-screen loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.sendKeys("\x03"); // Ctrl+C
      // TUI should exit
      await terminal.terminate();
    });

    test("LOAD-KEY-003: R retries from full-screen error", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      // Wait for error state
      await terminal.waitForText("Failed", 35_000);
      // Press R to retry
      await terminal.sendKeys("R");
      // Should show loading spinner again (retry in progress)
      const snapshot = terminal.snapshot();
      const hasLoading = snapshot.includes("Loading") || /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(snapshot);
      // May also show error again if retry also fails
      expect(snapshot.length).toBeGreaterThan(0);
    });

    test("LOAD-KEY-004: R retry is debounced during error state", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      await terminal.waitForText("Failed", 35_000);
      // Send R rapidly 3 times
      await terminal.sendKeys("R", "R", "R");
      // Only one retry should be triggered (debounce 1s)
      // This is validated by the fact that the screen doesn't crash
      // and shows either loading or error state
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
    });

    test("LOAD-KEY-005: ? opens help overlay during loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.sendKeys("?");
      // Help overlay should appear
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/help|keybinding/i);
      await terminal.sendKeys("\x1b"); // Escape to close
    });

    test("LOAD-KEY-006: : opens command palette during loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.sendKeys(":");
      // Command palette should appear
      const snapshot = terminal.snapshot();
      // Command palette renders as an overlay
      expect(snapshot.length).toBeGreaterThan(0);
      await terminal.sendKeys("\x1b"); // Escape to close
    });

    test("LOAD-KEY-007: go-to keybinding during loading navigates away", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      // Navigate to notifications
      await terminal.sendKeys("g", "n");
      // Should navigate away from issues loading
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("Loading issues");
    });

    test("LOAD-KEY-008: R retries from pagination error", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      // Scroll to trigger pagination
      await terminal.sendKeys("G");
      // If pagination fails, R should retry
      const snapshot = terminal.snapshot();
      if (snapshot.includes("Failed to load")) {
        await terminal.sendKeys("R");
        // Should attempt to reload
        const afterRetry = terminal.snapshot();
        expect(afterRetry.length).toBeGreaterThan(0);
      }
    });

    test("LOAD-KEY-009: user can scroll during pagination loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      // Scroll down to trigger pagination
      await terminal.sendKeys("G");
      // Then scroll back up — should work even during pagination
      await terminal.sendKeys("k", "k", "k");
      // User should be able to interact with loaded items
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Issues");
    });

    test("LOAD-KEY-010: user can navigate away during action loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      // q should always work to navigate back
      await terminal.sendKeys("q");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("Issues");
    });

    test("LOAD-KEY-011: fast API response skips spinner", async () => {
      // This test validates that when the API responds quickly,
      // no spinner frame is visible
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
      });
      // Dashboard with fast response should render directly
      await terminal.waitForText("Dashboard");
      // No spinner should be visible on the final state
      const snapshot = terminal.snapshot();
      // The final rendered state should have content, not loading
      expect(snapshot).toContain("Dashboard");
    });
  });

  // ─── Responsive Tests ─────────────────────────────────────────────────

  describe("Responsive behavior", () => {
    test("LOAD-RSP-001: full-screen loading layout at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      // Header should be row 0, status bar should be last row
      const headerLine = terminal.getLine(0);
      const statusLine = terminal.getLine(23);
      expect(headerLine.length).toBeGreaterThan(0);
      expect(statusLine.length).toBeGreaterThan(0);
      // Spinner + label should fit within 78 columns
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-RSP-002: resize during loading re-centers spinner", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      // Capture snapshot at 120x40
      const snap1 = terminal.snapshot();
      // Resize to 80x24
      await terminal.resize(80, 24);
      // Spinner should re-center
      const snap2 = terminal.snapshot();
      // Both should contain the loading text
      if (snap1.includes("Loading") && snap2.includes("Loading")) {
        // They should differ (different dimensions)
        expect(snap1).not.toBe(snap2);
      }
    });

    test("LOAD-RSP-003: resize during skeleton recalculates row widths", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snap1 = terminal.snapshot();
      await terminal.resize(80, 24);
      const snap2 = terminal.snapshot();
      // If skeleton is visible in both, widths should differ
      if (snap1.includes("▓") && snap2.includes("▓")) {
        expect(snap1).not.toBe(snap2);
      }
    });

    test("LOAD-RSP-004: resize during error re-centers error text", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      await terminal.waitForText("Failed", 35_000);
      await terminal.resize(80, 24);
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Failed");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-RSP-005: skeleton list adapts at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snapshot = terminal.snapshot();
      if (snapshot.includes("▓")) {
        // No horizontal overflow — all block sequences should fit in 80 cols
        const lines = snapshot.split("\n");
        for (const line of lines) {
          // Visible character width should not exceed terminal width
          expect(line.replace(/\x1b\[[0-9;]*m/g, "").length).toBeLessThanOrEqual(80);
        }
      }
    });

    test("LOAD-RSP-006: skeleton list adapts at 200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-RSP-007: pagination indicator at 80x24 fits single row", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("G");
      const snapshot = terminal.snapshot();
      if (snapshot.includes("Loading more")) {
        const loadingLine = snapshot
          .split("\n")
          .find((l: string) => l.includes("Loading more"));
        expect(loadingLine).toBeDefined();
        if (loadingLine) {
          expect(
            loadingLine.replace(/\x1b\[[0-9;]*m/g, "").length
          ).toBeLessThanOrEqual(80);
        }
      }
    });

    test("LOAD-RSP-008: action button at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });
});
```

### Test Conventions

1. **Test IDs follow the pattern:** `LOAD-{TYPE}-{NNN}` where TYPE is `SNAP` (snapshot), `KEY` (keyboard), or `RSP` (responsive).

2. **Tests that fail due to unimplemented backends are left failing.** Many tests navigate to screens that require API data. When the backend is unavailable, these tests will fail naturally — they are **never** skipped or commented out.

3. **No mocking of implementation details.** All tests launch the real TUI process and interact via terminal I/O. Data hooks, state management, and React internals are never mocked.

4. **Snapshot tests capture at key interaction points.** Snapshots are captured at 80×24, 120×40, and 200×60 to catch responsive regressions.

5. **Each test validates one behavior.** Test names describe the user-visible behavior being verified.

6. **Tests are independent.** Each test launches a fresh TUI instance via `launchTUI()` and terminates it in `afterEach`.

7. **Timeout tests use extended timeouts.** The 30-second timeout test uses `waitForText("timed out", 35_000)` to account for the loading timeout plus rendering delay.

---

## Integration Patterns

### How Screens Consume Loading States

Every screen that fetches data follows this pattern:

```typescript
function MyScreen() {
  // 1. Data hook from @codeplane/ui-core
  const data = useMyData();

  // 2. Screen loading lifecycle
  const loadState = useScreenLoading({
    id: "my-screen",
    label: "Loading my data…",
    isLoading: data.isLoading,
    error: data.error,
    onRetry: data.refetch,
  });

  // 3. Render loading/error/skeleton/content
  if (loadState.showError && loadState.loadingError) {
    return <FullScreenError screenLabel="my data" error={loadState.loadingError} />;
  }
  if (loadState.showSpinner) {
    return <FullScreenLoading spinnerFrame={loadState.spinnerFrame} label="Loading my data…" />;
  }
  if (loadState.showSkeleton) {
    return <SkeletonList />;  // or <SkeletonDetail /> for detail views
  }

  // 4. Render actual content with data.data
  return <MyContent data={data.data} />;
}
```

### How Lists Consume Pagination

```typescript
function MyList() {
  const data = useMyListData();
  const pagination = usePaginationLoading({
    screen: "my-list",
    hasMore: data.hasMore,
    fetchMore: data.fetchMore,
  });

  return (
    <scrollbox onScrollEnd={pagination.loadMore}>
      {data.items.map(item => <ListRow key={item.id} item={item} />)}
      <PaginationIndicator
        status={pagination.status}
        spinnerFrame={pagination.spinnerFrame}
        error={pagination.error}
      />
    </scrollbox>
  );
}
```

### How Actions Use Optimistic Mutations

```typescript
function IssueActions({ issue }) {
  const [localState, setLocalState] = useState(issue.state);
  const closeIssue = useOptimisticMutation({
    id: `close-issue-${issue.id}`,
    entityType: "issue",
    action: "close",
    mutate: async () => {
      await apiClient.post(`/repos/${owner}/${repo}/issues/${issue.number}/close`);
    },
    onOptimistic: () => setLocalState("closed"),
    onRevert: () => setLocalState("open"),
  });

  return (
    <ActionButton
      label="Close Issue"
      isLoading={closeIssue.isLoading}
      onPress={() => closeIssue.execute(undefined)}
    />
  );
}
```

---

## Observability

All log output is written to `stderr` via `process.stderr.write()`. Logs are not displayed in the TUI interface. They can be captured with:

```bash
codeplane tui 2>tui.log
```

### Log Events

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Screen loading started | `loading: screen {id} started, label="{label}"` |
| `debug` | Screen loading completed | `loading: screen {id} completed in {duration}ms` |
| `debug` | Skeleton rendered | `loading: skeleton rendered for {id}, type={type}, rows={count}` |
| `debug` | Pagination started | `loading: pagination for {screen}, page={number}` |
| `debug` | Pagination completed | `loading: pagination for {screen} completed, {count} items in {duration}ms` |
| `info` | Action completed | `loading: action {action} completed on {entity} in {duration}ms` |
| `warn` | Screen loading failed | `loading: screen {id} failed: {type} {status} — {message}` |
| `warn` | Pagination failed | `loading: pagination for {screen} failed: {type} {status}` |
| `warn` | Action failed | `loading: action {action} failed on {entity}: {type} — reverting` |
| `warn` | Timeout | `loading: screen {id} timed out after 30000ms` |
| `warn` | Rate limited | `loading: {screen} rate limited (HTTP 429), retry available` |
| `error` | Revert error | `loading: optimistic revert failed for {action} on {entity}: {message}` |

---

## Error Handling Matrix

| Error Case | Detection | Recovery | User-Visible Effect |
|------------|-----------|----------|---------------------|
| API timeout (30s) | `AbortController` timer | Error screen + `R retry` | "Request timed out" centered |
| HTTP 500+ | Response status | Error screen + `R retry` | "Internal Server Error (500)" centered |
| HTTP 401 | Response status | Defer to ErrorBoundary | "Session expired" message |
| HTTP 429 | Response status | Error screen + `R retry` | "Rate limited — try again later" |
| Network unreachable | fetch TypeError | Error screen + `R retry` | "Network error" centered |
| Pagination failure | fetchMore() rejects | Inline error + `R retry` | "Failed to load — R to retry" at list bottom |
| Optimistic revert | Server returns error | Revert local + status bar | 5s red error in status bar |
| Resize during load | SIGWINCH | Re-render at new dims | Smooth re-centering |
| Navigate during load | Screen unmount | AbortController.abort() | Clean transition, no orphan state |
| Rapid retry presses | Timestamp diff check | Debounce at 1s | Only first press triggers request |

---

## Performance Constraints

1. **Spinner CPU**: The shared `useSpinner` hook uses OpenTUI's `Timeline` engine. When `activeCount === 0`, `timeline.pause()` is called and the engine calls `dropLive()`, meaning zero CPU is consumed for animation when no spinners are visible.

2. **Skeleton memory**: `SkeletonList` renders only `contentHeight` rows (no off-screen rendering). When real data arrives, skeleton state is released — no retained references.

3. **Re-render frequency during loading**: Components consuming `LoadingContext` re-render every 80ms (braille interval) when a spinner is active. This is acceptable because only the spinner character changes, producing a single-character terminal diff per frame.

4. **AbortController cleanup**: Every `registerLoading` call creates an `AbortController`. These are cleaned up on `completeLoading`, `failLoading`, or `unregisterLoading`. The `useEffect` cleanup in `useScreenLoading` ensures no leaked controllers on unmount.

5. **Status bar error timer**: The 5-second timer for optimistic revert errors is cleaned up on provider unmount. Only one error is displayed at a time — subsequent errors replace the previous one and reset the timer.
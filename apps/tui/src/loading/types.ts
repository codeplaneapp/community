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
   * Register a retry callback for the current screen.
   */
  setRetryCallback(callback: (() => void) | null): void;

  /**
   * Currently registered retry callback.
   */
  retryCallback: (() => void) | null;

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

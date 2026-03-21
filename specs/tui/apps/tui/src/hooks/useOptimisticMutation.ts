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
          if (process.env.CODEPLANE_TUI_DEBUG === "true") {
            process.stderr.write(
              `loading: action ${action} failed on ${entityType}: ` +
                `${error.message} — reverting optimistic update\n`
            );
          }
        });
    },
    [id, entityType, action, mutate, onOptimistic, onRevert, onSuccess, loading]
  );

  return {
    execute,
    isLoading: isLoadingRef.current,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useAPIClient } from "@codeplane/ui-core/client/context";
import { useWorkspaces } from "@codeplane/ui-core/hooks/workspaces";
import { WorkspaceSSEAdapter } from "../streaming/WorkspaceSSEAdapter";
import type {
  WorkspaceStreamConnectionState,
} from "../streaming/types";
import type { WorkspaceStatus } from "@codeplane/ui-core/types/workspaces";
import { useAuth } from "./useAuth";

export interface WorkspaceListStatusMap {
  /** Map from workspace ID to its current status */
  [workspaceId: string]: WorkspaceStatus;
}

export interface UseWorkspaceListStatusStreamResult {
  /** Map of workspace ID → current status */
  statuses: WorkspaceListStatusMap;
  /** Aggregate connection state across all streams.
   *  - "connected" if all streams are connected
   *  - "reconnecting" if any stream is reconnecting
   *  - "degraded" if any stream is degraded
   *  - "disconnected" if any stream is disconnected
   *  - "connecting" if any stream is still connecting
   *  - "idle" if no streams are active
   */
  connectionState: WorkspaceStreamConnectionState;
  /** Count of active SSE connections */
  activeConnections: number;
  /** Most recent error across any stream */
  error: Error | null;
}

/**
 * Multiplexed workspace status streaming for list views.
 *
 * Creates one SSE connection per visible workspace ID and aggregates
 * status updates into a single map. Adapters are created/destroyed
 * as the workspaceIds array changes (e.g., as the user scrolls the list).
 *
 * Connection state is aggregated: the worst state across all connections
 * is reported (disconnected > reconnecting > degraded > connecting > connected > idle).
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param workspaceIds - Array of workspace IDs visible in the list
 */
export function useWorkspaceListStatusStream(
  owner: string,
  repo: string,
  workspaceIds: string[],
): UseWorkspaceListStatusStreamResult {
  const { token } = useAuth();
  const apiClient = useAPIClient();

  const [statuses, setStatuses] = useState<WorkspaceListStatusMap>({});
  const [connectionStates, setConnectionStates] = useState<
    Map<string, WorkspaceStreamConnectionState>
  >(new Map());
  const [error, setError] = useState<Error | null>(null);

  const adaptersRef = useRef<Map<string, WorkspaceSSEAdapter>>(new Map());
  const isMountedRef = useRef(true);

  // Compute aggregate connection state
  const connectionState = computeAggregateState(connectionStates);
  const activeConnections = adaptersRef.current.size;

  useEffect(() => {
    if (!token) return;
    isMountedRef.current = true;

    const currentAdapters = adaptersRef.current;
    const desiredIds = new Set(workspaceIds);

    // Remove adapters for workspace IDs no longer in the list
    for (const [id, adapter] of currentAdapters) {
      if (!desiredIds.has(id)) {
        adapter.close();
        currentAdapters.delete(id);
        setConnectionStates((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }

    // Create adapters for new workspace IDs
    for (const id of workspaceIds) {
      if (currentAdapters.has(id)) continue;

      const adapter = new WorkspaceSSEAdapter({
        apiBaseUrl: apiClient.baseUrl,
        authToken: token,
        owner,
        repo,
        workspaceId: id,
        onConnectionStateChange: (state) => {
          if (!isMountedRef.current) return;
          setConnectionStates((prev) => {
            const next = new Map(prev);
            next.set(id, state);
            return next;
          });
        },
        onEvent: (event) => {
          if (!isMountedRef.current) return;
          setStatuses((prev) => ({
            ...prev,
            [event.data.workspace_id]: event.data.status,
          }));
        },
        onError: (err) => {
          if (!isMountedRef.current) return;
          setError(err);
        },
      });

      currentAdapters.set(id, adapter);
      adapter.connect();
    }

    return () => {
      isMountedRef.current = false;
      for (const adapter of currentAdapters.values()) {
        adapter.close();
      }
      currentAdapters.clear();
    };
  }, [token, owner, repo, workspaceIds.join(","), apiClient.baseUrl]);

  return {
    statuses,
    connectionState,
    activeConnections,
    error,
  };
}

/**
 * Compute worst-case aggregate state from per-connection states.
 * Priority: disconnected > reconnecting > degraded > connecting > connected > idle
 */
function computeAggregateState(
  states: Map<string, WorkspaceStreamConnectionState>,
): WorkspaceStreamConnectionState {
  if (states.size === 0) return "idle";

  const priority: Record<WorkspaceStreamConnectionState, number> = {
    idle: 0,
    connected: 1,
    connecting: 2,
    degraded: 3,
    reconnecting: 4,
    disconnected: 5,
  };

  let worst: WorkspaceStreamConnectionState = "idle";
  for (const state of states.values()) {
    if (priority[state] > priority[worst]) {
      worst = state;
    }
  }
  return worst;
}

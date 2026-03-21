import { useCallback, useEffect, useRef, useState } from "react";
import { useAPIClient } from "@codeplane/ui-core/client/context";
import { useWorkspace } from "@codeplane/ui-core/hooks/workspaces";
import { WorkspaceSSEAdapter } from "../streaming/WorkspaceSSEAdapter";
import type {
  WorkspaceStatusEvent,
  WorkspaceStreamConnectionState,
} from "../streaming/types";
import type { Workspace, WorkspaceStatus } from "@codeplane/ui-core/types/workspaces";
import { useAuth } from "./useAuth";

export interface UseWorkspaceStatusStreamOptions {
  /** Whether the stream is enabled. Default: true. */
  enabled?: boolean;
  /** Callback fired on each status change event */
  onStatusChange?: (workspaceId: string, newStatus: WorkspaceStatus) => void;
}

export interface UseWorkspaceStatusStreamResult {
  /** Current workspace status (from stream or REST reconciliation) */
  status: WorkspaceStatus | null;
  /** Current SSE connection health */
  connectionState: WorkspaceStreamConnectionState;
  /** Last received status event */
  lastEvent: WorkspaceStatusEvent | null;
  /** Most recent error, if any */
  error: Error | null;
  /** Manually trigger REST reconciliation */
  reconcile: () => void;
}

/**
 * Subscribe to real-time workspace status updates via SSE.
 *
 * Flow:
 * 1. Obtains SSE ticket via POST /api/auth/sse-ticket
 * 2. Opens SSE stream to GET /api/repos/:owner/:repo/workspaces/:id/stream
 * 3. Dispatches workspace.status events to subscribers
 * 4. On reconnection, performs REST reconciliation via GET /api/repos/:owner/:repo/workspaces/:id
 * 5. Deduplicates replayed events (sliding window of 1000)
 * 6. Detects dead connections after 45s silence
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param workspaceId - Workspace ID to monitor
 * @param options - Optional configuration
 */
export function useWorkspaceStatusStream(
  owner: string,
  repo: string,
  workspaceId: string,
  options: UseWorkspaceStatusStreamOptions = {},
): UseWorkspaceStatusStreamResult {
  const { enabled = true, onStatusChange } = options;
  const { token } = useAuth();
  const apiClient = useAPIClient();

  // REST hook for reconciliation on reconnect
  const {
    workspace: restWorkspace,
    refetch: refetchWorkspace,
  } = useWorkspace(owner, repo, workspaceId, { enabled });

  // State
  const [status, setStatus] = useState<WorkspaceStatus | null>(
    restWorkspace?.status ?? null,
  );
  const [connectionState, setConnectionState] =
    useState<WorkspaceStreamConnectionState>("idle");
  const [lastEvent, setLastEvent] = useState<WorkspaceStatusEvent | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs for callback stability
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const adapterRef = useRef<WorkspaceSSEAdapter | null>(null);
  const isMountedRef = useRef(true);

  // Sync REST data into status when no SSE events received yet
  useEffect(() => {
    if (restWorkspace && lastEvent === null) {
      setStatus(restWorkspace.status);
    }
  }, [restWorkspace, lastEvent]);

  // REST reconciliation callback
  const reconcile = useCallback(() => {
    refetchWorkspace();
  }, [refetchWorkspace]);

  // Main SSE lifecycle
  useEffect(() => {
    if (!enabled || !token || !workspaceId) {
      return;
    }

    isMountedRef.current = true;
    let reconciliationPending = false;

    const adapter = new WorkspaceSSEAdapter({
      apiBaseUrl: apiClient.baseUrl,
      authToken: token,
      owner,
      repo,
      workspaceId,
      onConnectionStateChange: (state) => {
        if (!isMountedRef.current) return;
        setConnectionState(state);

        // Trigger REST reconciliation on successful reconnection
        if (state === "connected" && reconciliationPending) {
          reconciliationPending = false;
          refetchWorkspace();
        }
        if (state === "reconnecting") {
          reconciliationPending = true;
        }
      },
      onEvent: (event) => {
        if (!isMountedRef.current) return;
        setLastEvent(event);
        setStatus(event.data.status);
        setError(null);
        onStatusChangeRef.current?.(event.data.workspace_id, event.data.status);
      },
      onError: (err) => {
        if (!isMountedRef.current) return;
        setError(err);
      },
    });

    adapterRef.current = adapter;
    adapter.connect();

    return () => {
      isMountedRef.current = false;
      adapter.close();
      adapterRef.current = null;
    };
  }, [enabled, token, owner, repo, workspaceId, apiClient.baseUrl, refetchWorkspace]);

  return {
    status,
    connectionState,
    lastEvent,
    error,
    reconcile,
  };
}

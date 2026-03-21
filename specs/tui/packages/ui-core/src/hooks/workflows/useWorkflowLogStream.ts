import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAPIClient } from "../../client/context.js";
import { getSSETicket } from "../../sse/getSSETicket.js";
import { createSSEReader } from "../../sse/createSSEReader.js";
import type {
  LogLine,
  StatusEvent,
  DoneEvent,
  WorkflowStreamConnectionState,
  ConnectionHealth,
  WorkflowLogStreamState,
  StepState,
} from "../../../../apps/tui/src/hooks/workflow-stream-types.js";
import type { WorkflowRunStatus } from "../../../../apps/tui/src/hooks/workflow-types.js";

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 20;
const KEEPALIVE_TIMEOUT_MS = 45_000;
const DEDUP_SET_MAX = 50_000;
const DEDUP_SET_PRUNE_TARGET = 25_000;
const FLUSH_BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 200;
const VIRTUAL_SCROLL_WINDOW = 10_000;

export interface WorkflowLogStreamOptions {
  enabled?: boolean;
  onLog?: (line: LogLine) => void;
  onStatusChange?: (event: StatusEvent) => void;
  onDone?: (event: DoneEvent) => void;
  onError?: (error: Error) => void;
}

export function useWorkflowLogStream(
  owner: string,
  repo: string,
  runId: number,
  options?: WorkflowLogStreamOptions,
): Omit<WorkflowLogStreamState, "spinnerFrame"> {
  const client = useAPIClient();
  const enabled = options?.enabled ?? true;

  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectAttemptsRef = useRef(0);
  const keepaliveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  
  const logsRef = useRef<Map<string, LogLine[]>>(new Map());
  const seenLogIdsRef = useRef<Set<string>>(new Set());
  const seenLogIdsOrderRef = useRef<string[]>([]);
  const pendingLogsRef = useRef<LogLine[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  const lastConnectedAtRef = useRef<string | null>(null);

  const [logs, setLogs] = useState<Map<string, LogLine[]>>(new Map());
  const [steps, setSteps] = useState<Map<string, StepState>>(new Map());
  const [runStatus, setRunStatus] = useState<WorkflowRunStatus | null>(null);
  const [connectionState, setConnectionState] = useState<WorkflowStreamConnectionState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const clearKeepaliveTimer = useCallback(() => {
    if (keepaliveTimerRef.current) {
      clearTimeout(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
  }, []);

  const initiateReconnection = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      const err = new Error("Max reconnection attempts reached");
      if (isMounted.current) {
        setConnectionState("failed");
        setError(err);
      }
      return;
    }

    if (isMounted.current) {
      setConnectionState("reconnecting");
    }

    if (backoffTimerRef.current) {
      clearTimeout(backoffTimerRef.current);
    }

    reconnectAttemptsRef.current += 1;
    const currentBackoff = backoffRef.current;
    
    backoffTimerRef.current = setTimeout(() => {
      backoffTimerRef.current = null;
      connectToStream(true);
    }, currentBackoff);

    backoffRef.current = Math.min(currentBackoff * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
  }, []);

  const resetKeepaliveTimer = useCallback(() => {
    clearKeepaliveTimer();
    keepaliveTimerRef.current = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      initiateReconnection();
    }, KEEPALIVE_TIMEOUT_MS);
  }, [clearKeepaliveTimer, initiateReconnection]);

  const flushLogs = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const batch = pendingLogsRef.current;
    if (batch.length === 0) return;
    pendingLogsRef.current = [];

    const nextLogs = new Map(logsRef.current);
    for (const line of batch) {
      const stepLines = [...(nextLogs.get(line.step_id) ?? [])];
      stepLines.push(line);
      while (stepLines.length > VIRTUAL_SCROLL_WINDOW) {
        stepLines.shift();
      }
      nextLogs.set(line.step_id, stepLines);
    }
    logsRef.current = nextLogs;
    if (isMounted.current) {
      setLogs(nextLogs);
    }
  }, []);

  const queueLogLine = useCallback((line: LogLine) => {
    pendingLogsRef.current.push(line);
    if (pendingLogsRef.current.length >= FLUSH_BATCH_SIZE) {
      flushLogs();
    } else if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(flushLogs, FLUSH_INTERVAL_MS);
    }
  }, [flushLogs]);

  const processLogEvent = useCallback((data: LogLine) => {
    if (seenLogIdsRef.current.has(data.log_id)) {
      return;
    }

    seenLogIdsRef.current.add(data.log_id);
    seenLogIdsOrderRef.current.push(data.log_id);

    if (seenLogIdsRef.current.size > DEDUP_SET_MAX) {
      const toRemove = seenLogIdsOrderRef.current.splice(0, DEDUP_SET_PRUNE_TARGET);
      for (const id of toRemove) {
        seenLogIdsRef.current.delete(id);
      }
    }

    queueLogLine(data);
    optionsRef.current?.onLog?.(data);
  }, [queueLogLine]);

  const processStatusEvent = useCallback((data: StatusEvent) => {
    if (isMounted.current) {
      setRunStatus(data.run_status);
      if (data.step_id && data.step_status) {
        setSteps((prev) => {
          const next = new Map(prev);
          const current = next.get(data.step_id!) ?? {
            step_id: data.step_id!,
            status: data.step_status!,
            started_at: data.started_at ?? null,
            completed_at: data.completed_at ?? null,
            log_count: 0
          };
          next.set(data.step_id!, {
            ...current,
            status: data.step_status!,
            started_at: data.started_at ?? current.started_at,
            completed_at: data.completed_at ?? current.completed_at,
          });
          return next;
        });
      }
    }
    optionsRef.current?.onStatusChange?.(data);
  }, []);

  const processDoneEvent = useCallback((data: DoneEvent) => {
    if (isMounted.current) {
      setRunStatus(data.final_status);
      setConnectionState("completed");
    }
    clearKeepaliveTimer();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    optionsRef.current?.onDone?.(data);
  }, [clearKeepaliveTimer]);

  const connectToStream = useCallback(async (isReconnect: boolean) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (!isReconnect && isMounted.current) {
      setConnectionState("connecting");
    }

    try {
      const ticketResult = await getSSETicket(client, abortController.signal).catch(() => null);
      
      if (abortController.signal.aborted) return;

      const url = new URL(`/api/repos/${owner}/${repo}/runs/${runId}/logs`, client.baseUrl);
      const headers: Record<string, string> = {
        Accept: "text/event-stream"
      };

      if (ticketResult?.ticket) {
        url.searchParams.set("ticket", ticketResult.ticket);
      } else {
        const token = client.getToken?.();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      await createSSEReader({
        url: url.toString(),
        signal: abortController.signal,
        headers,
        lastEventId: lastEventIdRef.current ?? undefined,
        onOpen: () => {
          if (isMounted.current) {
            setConnectionState("connected");
            setError(null);
            const now = new Date().toISOString();
            lastConnectedAtRef.current = now;
          }
          backoffRef.current = INITIAL_BACKOFF_MS;
          reconnectAttemptsRef.current = 0;
          resetKeepaliveTimer();
        },
        onEvent: (event) => {
          resetKeepaliveTimer();
          if (event.id && isMounted.current) {
            lastEventIdRef.current = event.id;
            setLastEventId(event.id);
          }
          if (event.event === "keep-alive") return;

          try {
            const parsed = JSON.parse(event.data);
            switch (event.event) {
              case "log":
                processLogEvent(parsed);
                break;
              case "status":
                processStatusEvent(parsed);
                break;
              case "done":
                processDoneEvent(parsed);
                break;
              case "error":
                if (isMounted.current) {
                  setError(new Error(parsed.message || "Unknown stream error"));
                }
                optionsRef.current?.onError?.(new Error(parsed.message || "Unknown stream error"));
                break;
            }
          } catch (e) {
            // Drop malformed events
          }
        },
        onError: (err) => {
          clearKeepaliveTimer();
          if (!abortController.signal.aborted) {
            initiateReconnection();
          }
        },
        onClose: () => {
          clearKeepaliveTimer();
          if (!abortController.signal.aborted && isMounted.current) {
             // Let initiateReconnection check the state if needed, or just do it
             initiateReconnection();
          }
        }
      });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      clearKeepaliveTimer();
      initiateReconnection();
    }
  }, [
    client, owner, repo, runId, 
    clearKeepaliveTimer, resetKeepaliveTimer, 
    initiateReconnection, 
    processLogEvent, processStatusEvent, processDoneEvent
  ]);

  useEffect(() => {
    if (!enabled || !runId) return;

    connectToStream(false);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      clearKeepaliveTimer();
      if (backoffTimerRef.current) {
        clearTimeout(backoffTimerRef.current);
        backoffTimerRef.current = null;
      }
    };
  }, [enabled, owner, repo, runId, connectToStream, clearKeepaliveTimer]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (pendingLogsRef.current.length > 0) {
        const batch = pendingLogsRef.current;
        pendingLogsRef.current = [];
        const nextLogs = new Map(logsRef.current);
        for (const line of batch) {
          const stepLines = [...(nextLogs.get(line.step_id) ?? [])];
          stepLines.push(line);
          while (stepLines.length > VIRTUAL_SCROLL_WINDOW) {
            stepLines.shift();
          }
          nextLogs.set(line.step_id, stepLines);
        }
        logsRef.current = nextLogs;
      }
    };
  }, []);

  const reconnect = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    backoffRef.current = INITIAL_BACKOFF_MS;
    connectToStream(false);
  }, [connectToStream]);

  const connectionHealth: ConnectionHealth = useMemo(() => ({
    state: connectionState,
    reconnectAttempts: reconnectAttemptsRef.current,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    lastConnectedAt: lastConnectedAtRef.current,
    lastError: error
  }), [connectionState, error]);

  return {
    logs,
    steps,
    runStatus,
    connectionHealth,
    reconnect,
    lastEventId
  };
}

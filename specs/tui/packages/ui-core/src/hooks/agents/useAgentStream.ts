import { useState, useRef, useCallback, useEffect } from "react";
import { useAPIClient } from "../../client/context.js";
import { getSSETicket } from "../../sse/getSSETicket.js";
import { createSSEReader } from "../../sse/createSSEReader.js";
import type { AgentStreamEvent, AgentStreamConnectionState } from "../../types/agentStream.js";
import type { AgentMessage } from "../../types/agents.js";

export interface AgentStreamState {
  streaming: boolean;
  currentTokens: string;
  connected: boolean;
  reconnecting: boolean;
  error: Error | null;
  subscribe: (sessionId: string) => void;
  unsubscribe: () => void;
}

export interface AgentStreamOptions {
  enabled?: boolean;
  onToken?: (content: string) => void;
  onDone?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

// Reconnection constants
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 20;
const KEEPALIVE_TIMEOUT_MS = 45_000;

export function useAgentStream(
  owner: string,
  repo: string,
  sessionId: string,
  options?: AgentStreamOptions,
): AgentStreamState {
  const client = useAPIClient();
  const enabled = options?.enabled ?? true;

  // --- Mutable refs (not triggering re-render) ---
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const positionRef = useRef(0);           // monotonic token counter for dedup
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectAttemptsRef = useRef(0);
  const keepaliveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedSessionRef = useRef<string | null>(null);
  const tokensRef = useRef("");            // mirror of currentTokens for callbacks
  const optionsRef = useRef(options);

  // Keep options ref fresh
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // --- Reactive state ---
  const [connectionState, setConnectionState] = useState<AgentStreamConnectionState>("idle");
  const [currentTokens, setCurrentTokens] = useState("");
  const [error, setError] = useState<Error | null>(null);

  // --- Derived state ---
  const streaming = connectionState === "connected" || connectionState === "reconnecting";
  const connected = connectionState === "connected";
  const reconnecting = connectionState === "reconnecting";

  // --- Keepalive timer management ---
  const resetKeepaliveTimer = useCallback(() => {
    if (keepaliveTimerRef.current) {
      clearTimeout(keepaliveTimerRef.current);
    }
    keepaliveTimerRef.current = setTimeout(() => {
      // No data received for 45s — treat as dead connection
      if (isMounted.current && subscribedSessionRef.current) {
        abortControllerRef.current?.abort();
        initiateReconnection();
      }
    }, KEEPALIVE_TIMEOUT_MS);
  }, []);

  const clearKeepaliveTimer = useCallback(() => {
    if (keepaliveTimerRef.current) {
      clearTimeout(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
  }, []);

  // --- Reconnection ---
  const initiateReconnection = useCallback(() => {
    if (!isMounted.current || !subscribedSessionRef.current) return;

    reconnectAttemptsRef.current += 1;

    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      setConnectionState("failed");
      setError(new Error(`SSE reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`));
      return;
    }

    setConnectionState("reconnecting");

    const delay = backoffRef.current;
    backoffRef.current = Math.min(delay * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);

    backoffTimerRef.current = setTimeout(() => {
      if (isMounted.current && subscribedSessionRef.current) {
        connectToStream(subscribedSessionRef.current, true);
      }
    }, delay);
  }, []);

  // --- Token replay on reconnection ---
  const replayMissedTokens = useCallback(async (
    sid: string,
    signal: AbortSignal,
  ): Promise<void> => {
    try {
      const response = await client.request(
        `/api/repos/${owner}/${repo}/agent/sessions/${sid}/messages`,
        { signal },
      );

      if (!response.ok) return; // Non-critical; stream will continue

      const messages = (await response.json()) as any[];

      // Find the last assistant message and extract its full text content
      const assistantMessages = messages
        .filter((m: any) => m.role === "assistant")
        .sort((a: any, b: any) => Number(a.sequence) - Number(b.sequence));

      if (assistantMessages.length === 0) return;

      const lastAssistant = assistantMessages[assistantMessages.length - 1];
      const textParts = (lastAssistant.parts ?? [])
        .filter((p: any) => p.partType === "text")
        .sort((a: any, b: any) => Number(a.partIndex) - Number(b.partIndex));

      const serverContent = textParts
        .map((p: any) => {
          if (typeof p.content === "string") return p.content;
          if (p.content && typeof p.content === "object" && "value" in p.content) {
            return (p.content as { value: string }).value;
          }
          return "";
        })
        .join("");

      // Only update if server has more content than our local accumulation
      if (serverContent.length > tokensRef.current.length) {
        const missedContent = serverContent.slice(tokensRef.current.length);
        tokensRef.current = serverContent;
        if (isMounted.current) {
          setCurrentTokens(serverContent);
        }
        // Advance position counter to match server state
        positionRef.current = serverContent.length;

        optionsRef.current?.onToken?.(missedContent);
      }
    } catch {
      // Replay failure is non-fatal; stream will continue delivering new tokens
    }
  }, [client, owner, repo]);

  // --- Core connection logic ---
  const connectToStream = useCallback(async (
    sid: string,
    isReconnect: boolean,
  ) => {
    if (!isMounted.current) return;

    // Abort any existing connection
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (!isReconnect) {
      setConnectionState("connecting");
    }

    // Step 1: Obtain SSE ticket (or fallback to direct auth)
    const ticket = await getSSETicket(client, abortController.signal);
    if (abortController.signal.aborted) return;

    // Step 2: Build SSE URL
    const basePath = `/api/repos/${owner}/${repo}/agent/sessions/${sid}/stream`;
    let url: string;
    let headers: Record<string, string> = {};

    if (ticket) {
      url = `${client.baseUrl}${basePath}?ticket=${encodeURIComponent(ticket.ticket)}`;
    } else {
      // Fallback: bearer auth via header
      url = `${client.baseUrl}${basePath}`;
      // The APIClient adds auth headers; for raw fetch we need to pass them manually.
      // We do a dummy request to extract the auth header pattern.
      // In practice, the client.baseUrl and token are available.
      headers = {}; // Auth handled by fetch interceptor or via direct token
    }

    // Step 3: Replay missed tokens if reconnecting
    if (isReconnect) {
      await replayMissedTokens(sid, abortController.signal);
      if (abortController.signal.aborted) return;
    }

    // Step 4: Open SSE stream
    const lastEventId = positionRef.current > 0 ? String(positionRef.current) : undefined;

    try {
      await createSSEReader({
        url,
        headers,
        signal: abortController.signal,
        lastEventId,
        onOpen: () => {
          if (!isMounted.current) return;
          setConnectionState("connected");
          setError(null);
          backoffRef.current = INITIAL_BACKOFF_MS;
          reconnectAttemptsRef.current = 0;
          resetKeepaliveTimer();
        },
        onEvent: (event) => {
          if (!isMounted.current) return;
          resetKeepaliveTimer();

          // Parse event data
          let parsed: AgentStreamEvent;
          try {
            parsed = JSON.parse(event.data) as AgentStreamEvent;
          } catch {
            // Malformed JSON — skip event, no crash
            return;
          }

          // Process by type
          switch (parsed.type) {
            case "token": {
              const content = parsed.data.content;
              if (content !== undefined && content !== null) {
                positionRef.current += content.length;
                tokensRef.current += content;
                if (isMounted.current) {
                  setCurrentTokens(tokensRef.current);
                }
                optionsRef.current?.onToken?.(content);
              }
              break;
            }
            case "done": {
              clearKeepaliveTimer();
              const fullContent = tokensRef.current;
              if (isMounted.current) {
                setConnectionState("completed");
              }
              optionsRef.current?.onDone?.(fullContent);
              break;
            }
            case "error": {
              clearKeepaliveTimer();
              const streamError = new Error(parsed.data.message);
              if (isMounted.current) {
                setConnectionState("errored");
                setError(streamError);
              }
              optionsRef.current?.onError?.(streamError);
              break;
            }
            default: {
              // Unknown event type — silently ignore (forward compatibility)
              break;
            }
          }
        },
        onError: (err) => {
          if (!isMounted.current) return;
          clearKeepaliveTimer();
          // Connection-level error — attempt reconnection
          initiateReconnection();
        },
        onClose: () => {
          if (!isMounted.current) return;
          clearKeepaliveTimer();
          // Stream closed by server — if not completed/errored, reconnect
          if (
            connectionState !== "completed" &&
            connectionState !== "errored" &&
            connectionState !== "failed"
          ) {
            initiateReconnection();
          }
        },
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (isMounted.current) {
        initiateReconnection();
      }
    }
  }, [client, owner, repo, resetKeepaliveTimer, clearKeepaliveTimer, initiateReconnection, replayMissedTokens, connectionState]);

  // --- Public API ---
  const subscribe = useCallback((sid: string) => {
    if (subscribedSessionRef.current === sid) return; // Already subscribed

    // Reset state
    positionRef.current = 0;
    tokensRef.current = "";
    backoffRef.current = INITIAL_BACKOFF_MS;
    reconnectAttemptsRef.current = 0;
    subscribedSessionRef.current = sid;
    setCurrentTokens("");
    setError(null);

    connectToStream(sid, false);
  }, [connectToStream]);

  const unsubscribe = useCallback(() => {
    subscribedSessionRef.current = null;
    abortControllerRef.current?.abort();
    clearKeepaliveTimer();
    if (backoffTimerRef.current) {
      clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
    positionRef.current = 0;
    tokensRef.current = "";
    backoffRef.current = INITIAL_BACKOFF_MS;
    reconnectAttemptsRef.current = 0;
    setConnectionState("idle");
    setCurrentTokens("");
    setError(null);
  }, [clearKeepaliveTimer]);

  // --- Auto-subscribe on mount ---
  useEffect(() => {
    if (enabled && sessionId.trim() && isMounted.current) {
      subscribe(sessionId);
    }
    return () => {
      unsubscribe();
    };
  }, [enabled, sessionId]); // intentionally limited deps

  // --- Cleanup on unmount ---
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
      clearKeepaliveTimer();
      if (backoffTimerRef.current) {
        clearTimeout(backoffTimerRef.current);
      }
    };
  }, []);

  return {
    streaming,
    currentTokens,
    connected,
    reconnecting,
    error,
    subscribe,
    unsubscribe,
  };
}

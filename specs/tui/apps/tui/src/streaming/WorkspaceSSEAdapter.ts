import { createSSEReader } from "@codeplane/ui-core/sse/createSSEReader";
import { getSSETicket } from "@codeplane/ui-core/sse/getSSETicket";
import type { APIClient } from "@codeplane/ui-core/client/types";
import type { EventSourceMessage } from "eventsource-parser";
import { EventDeduplicator } from "./EventDeduplicator";
import {
  SSE_CONSTANTS,
  type WorkspaceSSEAdapterConfig,
  type WorkspaceStatusEvent,
  type WorkspaceStreamConnectionState,
} from "./types";

export class WorkspaceSSEAdapter {
  private readonly config: WorkspaceSSEAdapterConfig;
  private readonly deduplicator: EventDeduplicator;

  private abortController: AbortController | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private degradedTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private currentBackoff: number = SSE_CONSTANTS.INITIAL_BACKOFF_MS;
  private reconnectAttempts: number = 0;
  private lastEventId: string | null = null;
  private _connectionState: WorkspaceStreamConnectionState = "idle";
  private closed: boolean = false;

  constructor(config: WorkspaceSSEAdapterConfig) {
    this.config = config;
    this.deduplicator = new EventDeduplicator(SSE_CONSTANTS.DEDUP_WINDOW_SIZE);
  }

  // --- Public API ---

  get connectionState(): WorkspaceStreamConnectionState {
    return this._connectionState;
  }

  /**
   * Open the SSE connection. Obtains a ticket first, then connects.
   * Safe to call multiple times — subsequent calls are no-ops if already connected.
   */
  async connect(): Promise<void> {
    if (this.closed) return;
    if (this._connectionState === "connected" || this._connectionState === "connecting") return;

    this.setConnectionState("connecting");
    await this.establishConnection(false);
  }

  /**
   * Close the connection and clean up all timers.
   * After close(), the adapter cannot be reconnected.
   */
  close(): void {
    this.closed = true;
    this.clearAllTimers();
    this.abortController?.abort();
    this.abortController = null;
    this.setConnectionState("disconnected");
  }

  // --- Private: Connection Establishment ---

  private async establishConnection(isReconnect: boolean): Promise<void> {
    if (this.closed) return;

    // Cancel any existing connection
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Build stream URL
    const streamUrl = this.buildStreamUrl();

    // Attempt to get SSE ticket for auth
    const headers: Record<string, string> = {};
    let url = streamUrl;

    try {
      const ticket = await getSSETicket(
        { baseUrl: this.config.apiBaseUrl, request: this.createTicketRequester() } as APIClient,
        signal,
      );
      if (ticket) {
        // Use ticket-based auth (preferred — avoids long-lived token in URL)
        url = `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket.ticket)}`;
      } else {
        // Fallback to bearer token auth via header
        headers["Authorization"] = `token ${this.config.authToken}`;
      }
    } catch {
      // Ticket exchange failed — fallback to bearer
      headers["Authorization"] = `token ${this.config.authToken}`;
    }

    if (signal.aborted || this.closed) return;

    // Start keepalive monitoring
    this.resetKeepaliveTimer();

    try {
      await createSSEReader({
        url,
        headers,
        signal,
        lastEventId: isReconnect ? (this.lastEventId ?? undefined) : undefined,
        onOpen: () => {
          if (this.closed) return;
          this.setConnectionState("connected");
          // Reset backoff on successful connection
          this.currentBackoff = SSE_CONSTANTS.INITIAL_BACKOFF_MS;
          this.reconnectAttempts = 0;
        },
        onEvent: (event: EventSourceMessage) => {
          if (this.closed) return;
          this.handleEvent(event);
        },
        onError: (error: Error) => {
          if (this.closed) return;
          this.config.onError?.(error);
          this.initiateReconnection();
        },
        onClose: () => {
          if (this.closed) return;
          // Stream closed by server — reconnect
          this.initiateReconnection();
        },
      });
    } catch (err) {
      if (this.closed) return;
      if (err instanceof Error && err.name === "AbortError") return;
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.initiateReconnection();
    }
  }

  private buildStreamUrl(): string {
    const { apiBaseUrl, owner, repo, workspaceId } = this.config;
    return `${apiBaseUrl}/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/workspaces/${encodeURIComponent(workspaceId)}/stream`;
  }

  /**
   * Create a minimal request function for getSSETicket.
   * The ticket exchange only needs POST /api/auth/sse-ticket with auth header.
   */
  private createTicketRequester(): (path: string, options?: any) => Promise<Response> {
    const { apiBaseUrl, authToken } = this.config;
    return async (path: string, options?: { method?: string; signal?: AbortSignal }) => {
      return fetch(`${apiBaseUrl}${path}`, {
        method: options?.method ?? "GET",
        headers: {
          "Authorization": `token ${authToken}`,
          "Content-Type": "application/json",
        },
        signal: options?.signal,
      });
    };
  }

  // --- Private: Event Handling ---

  private handleEvent(event: EventSourceMessage): void {
    // Reset keepalive on any data (including comments parsed as events)
    this.resetKeepaliveTimer();

    // Track last event ID for reconnection replay
    if (event.id) {
      this.lastEventId = event.id;
    }

    // Deduplicate replayed events
    if (event.id && this.deduplicator.isDuplicate(event.id)) {
      return;
    }

    // Parse event data
    let data: { workspace_id: string; status: string };
    try {
      data = JSON.parse(event.data);
    } catch {
      // Malformed JSON — skip event silently (forward compatibility)
      return;
    }

    // Validate event shape
    if (!data.workspace_id || !data.status) {
      return;
    }

    const statusEvent: WorkspaceStatusEvent = {
      id: event.id ?? "",
      type: "workspace.status",
      data: {
        workspace_id: data.workspace_id,
        status: data.status as any, // WorkspaceStatus enum
      },
      receivedAt: performance.now(),
    };

    this.config.onEvent?.(statusEvent);
  }

  // --- Private: Reconnection ---

  private initiateReconnection(): void {
    if (this.closed) return;

    this.clearKeepaliveTimers();
    this.reconnectAttempts += 1;

    if (this.reconnectAttempts > SSE_CONSTANTS.MAX_RECONNECT_ATTEMPTS) {
      this.setConnectionState("disconnected");
      this.config.onError?.(
        new Error(`Workspace SSE reconnection failed after ${SSE_CONSTANTS.MAX_RECONNECT_ATTEMPTS} attempts`),
      );
      return;
    }

    this.setConnectionState("reconnecting");

    const delay = this.currentBackoff;
    this.currentBackoff = Math.min(
      delay * SSE_CONSTANTS.BACKOFF_MULTIPLIER,
      SSE_CONSTANTS.MAX_BACKOFF_MS,
    );

    this.backoffTimer = setTimeout(() => {
      if (!this.closed) {
        this.establishConnection(true);
      }
    }, delay);
  }

  // --- Private: Keepalive Monitoring ---

  private resetKeepaliveTimer(): void {
    this.clearKeepaliveTimers();

    // Degraded warning at 30s (2× keep-alive)
    this.degradedTimer = setTimeout(() => {
      if (!this.closed && this._connectionState === "connected") {
        this.setConnectionState("degraded");
      }
    }, SSE_CONSTANTS.DEGRADED_THRESHOLD_MS);

    // Dead connection at 45s (3× keep-alive)
    this.keepaliveTimer = setTimeout(() => {
      if (!this.closed) {
        this.abortController?.abort();
        this.initiateReconnection();
      }
    }, SSE_CONSTANTS.KEEPALIVE_TIMEOUT_MS);
  }

  private clearKeepaliveTimers(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.degradedTimer) {
      clearTimeout(this.degradedTimer);
      this.degradedTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.clearKeepaliveTimers();
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  // --- Private: State Management ---

  private setConnectionState(state: WorkspaceStreamConnectionState): void {
    if (this._connectionState === state) return;
    this._connectionState = state;
    this.config.onConnectionStateChange?.(state);
  }
}

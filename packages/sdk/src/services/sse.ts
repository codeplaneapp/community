/**
 * SSE fan-out manager backed by PostgreSQL LISTEN/NOTIFY.
 *
 * This mirrors the Go implementation in internal/sse/listener.go.
 * It acquires a dedicated postgres.js subscription for each PG channel
 * and distributes incoming notifications to all connected SSE clients.
 *
 * Channel naming conventions (from sqlc queries):
 *   - user_notifications_{userId}  -- per-user notification events
 *   - workspace_status_{id}        -- workspace/session state changes
 *   - workflow_run_events_{runId}  -- workflow run status changes
 *   - workflow_step_logs_{stepId}  -- workflow step log lines
 *   - release_{repositoryId}      -- release events
 */

import type { Sql } from "postgres";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single SSE event to be sent to a client. Mirrors Go sse.Event. */
export interface SSEEvent {
  /** SSE event type (e.g. "message", "log", "status", "done"). */
  type?: string;
  /** JSON payload. */
  data: string;
  /** Optional event ID for Last-Event-ID reconnection tracking. */
  id?: string;
}

/** A subscriber is a function that receives SSE events. Returns false to unsubscribe. */
type Subscriber = {
  push: (event: SSEEvent) => void;
  filter?: (payload: unknown) => boolean;
  closed: boolean;
};

// ---------------------------------------------------------------------------
// SSE Event formatting (mirrors Go sse.FormatEvent)
// ---------------------------------------------------------------------------

/**
 * Format an SSEEvent into the SSE wire format.
 *
 * Output example:
 *   id: 42
 *   event: notification
 *   data: {"id":42}
 *
 * Terminated by a double newline.
 */
export function formatSSEEvent(e: SSEEvent): string {
  let result = "";
  if (e.id) {
    result += `id: ${e.id}\n`;
  }
  if (e.type) {
    result += `event: ${e.type}\n`;
  }
  result += `data: ${e.data}\n`;
  result += "\n";
  return result;
}

// ---------------------------------------------------------------------------
// Channel name validation (mirrors Go validateChannel)
// ---------------------------------------------------------------------------

const CHANNEL_CHAR_REGEX = /^[a-zA-Z0-9_]+$/;

/**
 * Validate a PostgreSQL channel name.
 * Only ASCII letters, digits, and underscores are allowed to prevent SQL injection.
 */
export function validateChannel(channel: string): boolean {
  if (!channel) return false;
  return CHANNEL_CHAR_REGEX.test(channel);
}

// ---------------------------------------------------------------------------
// SSEManager
// ---------------------------------------------------------------------------

/**
 * SSEManager listens on PostgreSQL NOTIFY channels and distributes events
 * to connected SSE clients via ReadableStream.
 *
 * Usage:
 *   const manager = new SSEManager(sql);
 *   await manager.start();
 *
 *   // In a route handler:
 *   const stream = manager.subscribe("user_notifications_42");
 *   return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
 *
 *   // On shutdown:
 *   await manager.stop();
 */
export class SSEManager {
  private sql: Sql;
  private channels: Map<string, Set<Subscriber>> = new Map();
  private unlistenFns: Map<string, () => Promise<void>> = new Map();
  private started = false;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  /**
   * Subscribe to a PostgreSQL NOTIFY channel.
   * Returns a ReadableStream that emits SSE-formatted text.
   *
   * The stream includes:
   *   - A keep-alive comment every 15 seconds
   *   - SSE events from PG NOTIFY on the given channel
   *   - Automatic cleanup when the client disconnects
   *
   * @param channel  The PG NOTIFY channel name (e.g. "user_notifications_42")
   * @param options  Optional event type override and filter function
   */
  subscribe(
    channel: string,
    options?: {
      /** SSE event type to use (defaults to "message"). */
      eventType?: string;
      /** Filter function: return true to forward the event, false to skip. */
      filter?: (payload: unknown) => boolean;
    },
  ): ReadableStream<string> {
    if (!validateChannel(channel)) {
      throw new Error(`SSE: invalid channel name: ${channel}`);
    }

    const eventType = options?.eventType ?? "message";
    const filter = options?.filter;

    let subscriber: Subscriber;

    const stream = new ReadableStream<string>({
      start: async (controller) => {
        subscriber = {
          push: (event: SSEEvent) => {
            try {
              controller.enqueue(formatSSEEvent(event));
            } catch {
              // Controller may be closed
              subscriber.closed = true;
            }
          },
          filter,
          closed: false,
        };

        // Register subscriber
        this.addSubscriber(channel, subscriber);

        // Ensure we are listening on this channel
        await this.ensureListening(channel, eventType);

        // Start keep-alive
        const keepAliveInterval = setInterval(() => {
          if (subscriber.closed) {
            clearInterval(keepAliveInterval);
            return;
          }
          try {
            controller.enqueue(": keep-alive\n\n");
          } catch {
            subscriber.closed = true;
            clearInterval(keepAliveInterval);
          }
        }, 15_000);

        // Store interval ref for cleanup
        (subscriber as any)._keepAlive = keepAliveInterval;
      },
      cancel: () => {
        if (subscriber) {
          subscriber.closed = true;
          if ((subscriber as any)._keepAlive) {
            clearInterval((subscriber as any)._keepAlive);
          }
          this.removeSubscriber(channel, subscriber);
        }
      },
    });

    return stream;
  }

  /**
   * Subscribe to multiple PostgreSQL NOTIFY channels on a single ReadableStream.
   * The SSE event type is set to the channel name so clients can distinguish sources.
   * Mirrors Go's MultiListener.
   *
   * @param channels  Array of PG NOTIFY channel names
   * @param options   Optional filter function applied to all events
   */
  subscribeMulti(
    channels: string[],
    options?: {
      /** Filter function: receives { channel, payload }. Return true to forward. */
      filter?: (data: { channel: string; payload: unknown }) => boolean;
    },
  ): ReadableStream<string> {
    for (const ch of channels) {
      if (!validateChannel(ch)) {
        throw new Error(`SSE: invalid channel name: ${ch}`);
      }
    }

    const filter = options?.filter;
    const subscribers: { channel: string; subscriber: Subscriber }[] = [];

    const stream = new ReadableStream<string>({
      start: async (controller) => {
        for (const channel of channels) {
          const subscriber: Subscriber = {
            push: (event: SSEEvent) => {
              // Apply multi-channel filter
              if (filter) {
                try {
                  const payload = JSON.parse(event.data);
                  if (!filter({ channel, payload })) return;
                } catch {
                  // If payload isn't valid JSON, skip filter
                }
              }
              try {
                controller.enqueue(formatSSEEvent(event));
              } catch {
                subscriber.closed = true;
              }
            },
            closed: false,
          };

          subscribers.push({ channel, subscriber });
          this.addSubscriber(channel, subscriber);
          await this.ensureListening(channel, channel);
        }

        // Single keep-alive for the multi-channel stream
        const keepAliveInterval = setInterval(() => {
          const allClosed = subscribers.every((s) => s.subscriber.closed);
          if (allClosed) {
            clearInterval(keepAliveInterval);
            return;
          }
          try {
            controller.enqueue(": keep-alive\n\n");
          } catch {
            for (const s of subscribers) {
              s.subscriber.closed = true;
            }
            clearInterval(keepAliveInterval);
          }
        }, 15_000);

        // Store for cleanup
        for (const s of subscribers) {
          (s.subscriber as any)._keepAlive = keepAliveInterval;
        }
      },
      cancel: () => {
        for (const { channel, subscriber } of subscribers) {
          subscriber.closed = true;
          if ((subscriber as any)._keepAlive) {
            clearInterval((subscriber as any)._keepAlive);
            (subscriber as any)._keepAlive = null;
          }
          this.removeSubscriber(channel, subscriber);
        }
      },
    });

    return stream;
  }

  /**
   * Start the SSE manager. Currently a no-op since channels are lazily subscribed.
   * Call this at server startup for forward compatibility.
   */
  async start(): Promise<void> {
    this.started = true;
  }

  /**
   * Stop listening on all channels and clean up.
   * Call this during server shutdown.
   */
  async stop(): Promise<void> {
    this.started = false;

    // Unlisten from all PG channels
    for (const [channel, unlisten] of this.unlistenFns) {
      try {
        await unlisten();
      } catch {
        // Best-effort cleanup
      }
    }
    this.unlistenFns.clear();

    // Close all subscribers
    for (const [, subs] of this.channels) {
      for (const sub of subs) {
        sub.closed = true;
        if ((sub as any)._keepAlive) {
          clearInterval((sub as any)._keepAlive);
        }
      }
      subs.clear();
    }
    this.channels.clear();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private addSubscriber(channel: string, subscriber: Subscriber): void {
    let subs = this.channels.get(channel);
    if (!subs) {
      subs = new Set();
      this.channels.set(channel, subs);
    }
    subs.add(subscriber);
  }

  private removeSubscriber(channel: string, subscriber: Subscriber): void {
    const subs = this.channels.get(channel);
    if (!subs) return;
    subs.delete(subscriber);

    // If no more subscribers on this channel, stop listening
    if (subs.size === 0) {
      this.channels.delete(channel);
      const unlisten = this.unlistenFns.get(channel);
      if (unlisten) {
        this.unlistenFns.delete(channel);
        unlisten().catch(() => {
          // Best-effort cleanup
        });
      }
    }
  }

  /**
   * Ensure we have a PG LISTEN subscription for the given channel.
   * postgres.js provides sql.listen(channel, callback) which returns
   * an unlisten function. We deduplicate so multiple subscribers
   * share one PG connection per channel.
   */
  private async ensureListening(
    channel: string,
    eventType: string,
  ): Promise<void> {
    if (this.unlistenFns.has(channel)) {
      return; // Already listening
    }

    try {
      // postgres.js LISTEN API:
      //   const unlisten = await sql.listen(channel, (payload) => { ... });
      //   await unlisten(); // to stop
      // postgres.js sql.listen() returns { state, unlisten } — extract the function.
      const result = await (this.sql as any).listen(
        channel,
        (payload: string) => {
          this.broadcast(channel, eventType, payload);
        },
      );
      const unlistenFn = typeof result === "function" ? result : result?.unlisten;
      if (typeof unlistenFn === "function") {
        this.unlistenFns.set(channel, unlistenFn);
      }
    } catch (err) {
      // If LISTEN fails (e.g. PGLite mode), log and continue.
      // Subscribers will still get initial data and keep-alive pings.
      console.warn(`SSE: failed to LISTEN on channel ${channel}:`, err);
    }
  }

  /**
   * Broadcast a PG NOTIFY payload to all subscribers on a channel.
   */
  private broadcast(
    channel: string,
    eventType: string,
    rawPayload: string,
  ): void {
    const subs = this.channels.get(channel);
    if (!subs || subs.size === 0) return;

    // Parse payload for filter evaluation
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(rawPayload);
    } catch {
      parsedPayload = rawPayload;
    }

    const event: SSEEvent = {
      type: eventType,
      data: rawPayload,
    };

    // Collect closed subscribers for removal
    const toRemove: Subscriber[] = [];

    for (const sub of subs) {
      if (sub.closed) {
        toRemove.push(sub);
        continue;
      }

      // Apply subscriber-level filter
      if (sub.filter && !sub.filter(parsedPayload)) {
        continue;
      }

      sub.push(event);
    }

    // Clean up closed subscribers
    for (const sub of toRemove) {
      subs.delete(sub);
    }
  }
}

// ---------------------------------------------------------------------------
// SSE Response helpers for Hono route handlers
// ---------------------------------------------------------------------------

/**
 * Create SSE response headers.
 */
export function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  };
}

/**
 * Create an SSE Response from a ReadableStream.
 * Convenience for Hono route handlers.
 *
 * Usage:
 *   const stream = sseManager.subscribe("user_notifications_42");
 *   return sseResponse(stream);
 */
export function sseResponse(
  stream: ReadableStream<string>,
  init?: { status?: number },
): Response {
  return new Response(stream, {
    status: init?.status ?? 200,
    headers: sseHeaders(),
  });
}

/**
 * Create a one-shot SSE response that sends initial data and optionally closes.
 * Useful for terminal states where no live streaming is needed.
 *
 * @param events  Array of SSE events to send immediately
 */
export function sseStaticResponse(events: SSEEvent[]): Response {
  const body = events.map(formatSSEEvent).join("");
  return new Response(body, {
    status: 200,
    headers: sseHeaders(),
  });
}

/**
 * Prepend initial events to a live SSE stream.
 * Returns a new ReadableStream that first emits the initial events,
 * then pipes from the live stream.
 *
 * @param initialEvents  Events to emit before live data (e.g. replay, initial status)
 * @param liveStream     The live SSE stream from SSEManager.subscribe()
 */
export function sseStreamWithInitial(
  initialEvents: SSEEvent[],
  liveStream: ReadableStream<string>,
): ReadableStream<string> {
  const initialData = initialEvents.map(formatSSEEvent).join("");
  const reader = liveStream.getReader();

  return new ReadableStream<string>({
    start(controller) {
      // Emit initial events first
      if (initialData) {
        controller.enqueue(initialData);
      }
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch {
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

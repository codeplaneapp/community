import { createParser, type EventSourceMessage } from "eventsource-parser";

export interface SSEReaderOptions {
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onEvent: (event: EventSourceMessage) => void;
  onError: (error: Error) => void;
  onOpen: () => void;
  onClose: () => void;
  lastEventId?: string;
}

/**
 * Open a fetch-based SSE connection and stream events to the caller.
 * Returns an abort function to close the connection.
 *
 * Uses fetch + ReadableStream instead of EventSource for:
 * - Custom header support (Authorization: token ...)
 * - AbortSignal support
 * - Bun runtime compatibility
 */
export async function createSSEReader(
  options: SSEReaderOptions,
): Promise<void> {
  const { url, headers = {}, signal, onEvent, onError, onOpen, onClose, lastEventId } = options;

  const requestHeaders: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
    ...headers,
  };

  if (lastEventId) {
    requestHeaders["Last-Event-ID"] = lastEventId;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: requestHeaders,
      signal,
    });
  } catch (err: any) {
    if (err.name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!response.ok) {
    onError(new Error(`SSE connection failed: HTTP ${response.status}`));
    return;
  }

  if (!response.body) {
    onError(new Error("SSE response has no body"));
    return;
  }

  onOpen();

  const parser = createParser({
    onEvent: (event: EventSourceMessage) => {
      onEvent(event);
    },
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;

      const text = decoder.decode(value, { stream: true });
      parser.feed(text);
    }
  } catch (err: any) {
    if (err.name === "AbortError") return;
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  onClose();
}

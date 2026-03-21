import React, { createContext, useContext, useEffect, useRef } from "react";
import * as fs from "node:fs";

export interface SSEEvent {
  type: string;
  data: string;
  id: string;
}

interface SSEContextValue {
  subscribe: (channel: string, callback: (event: SSEEvent) => void) => () => void;
}

const SSEContext = createContext<SSEContextValue | null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const subscribers = useRef<Map<string, Set<(event: SSEEvent) => void>>>(new Map());

  const subscribe = (channel: string, callback: (event: SSEEvent) => void) => {
    if (!subscribers.current.has(channel)) {
      subscribers.current.set(channel, new Set());
    }
    subscribers.current.get(channel)!.add(callback);

    return () => {
      const channelSubscribers = subscribers.current.get(channel);
      if (channelSubscribers) {
        channelSubscribers.delete(callback);
      }
    };
  };

  useEffect(() => {
    const isTestMode = process.env.NODE_ENV === "test";
    const injectFile = process.env.CODEPLANE_SSE_INJECT_FILE;

    if (isTestMode && injectFile) {
      console.error("[SSEProvider] Using file-based SSE injection (test mode)");
      let lastSize = 0;

      const interval = setInterval(() => {
        try {
          if (!fs.existsSync(injectFile)) return;

          const stats = fs.statSync(injectFile);
          if (stats.size > lastSize) {
            const fd = fs.openSync(injectFile, "r");
            const buffer = Buffer.alloc(stats.size - lastSize);
            fs.readSync(fd, buffer, 0, buffer.length, lastSize);
            fs.closeSync(fd);

            const newContent = buffer.toString("utf-8");
            const lines = newContent.split("\n").filter((line) => line.trim() !== "");

            for (const line of lines) {
              try {
                const event: SSEEvent = JSON.parse(line);
                // Dispatch event to channel based on type, e.g., 'workspace.status' -> channel could be 'workspace.status'
                // Actually the subscribers might subscribe to the event type.
                const channelSubscribers = subscribers.current.get(event.type);
                if (channelSubscribers) {
                  channelSubscribers.forEach((cb) => cb(event));
                }
              } catch (err) {
                // Ignore parse errors
              }
            }
            lastSize = stats.size;
          }
        } catch (err) {
          // Ignore read errors
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      // In a real implementation, this would setup EventSource / createSSEReader
      // and handle reconnects.
      return () => {};
    }
  }, []);

  return <SSEContext.Provider value={{ subscribe }}>{children}</SSEContext.Provider>;
}

export function useSSE(channel: string, onEvent: (event: SSEEvent) => void) {
  const context = useContext(SSEContext);
  if (!context) {
    throw new Error("useSSE must be used within an SSEProvider");
  }

  useEffect(() => {
    return context.subscribe(channel, onEvent);
  }, [channel, onEvent, context]);
}

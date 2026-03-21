import { useState, useCallback, useEffect, useRef } from "react";
import { useAgentMessages } from "@codeplane/ui-core";
import type { AgentMessage } from "@codeplane/ui-core";
import type { ChatMessage } from "../types.js";

export interface ChatPaginationState {
  messages: ChatMessage[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  hasOlderMessages: boolean;
  loadEarlier: () => void;
  atMemoryCap: boolean;
  insertOptimistic: (message: ChatMessage) => void;
  updateMessage: (id: string, update: Partial<ChatMessage>) => void;
  appendStreamingTokens: (tokens: string) => void;
  finalizeStreamingMessage: (message: AgentMessage) => void;
}

export function useChatPagination(
  owner: string,
  repo: string,
  sessionId: string
): ChatPaginationState {
  const {
    messages: initialMessages,
    totalCount,
    isLoading,
    error,
    hasMore,
    fetchMore,
  } = useAgentMessages(sessionId, { perPage: 30 });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const atMemoryCap = messages.length >= 500;
  const hasOlderMessages = hasMore || (atMemoryCap && totalCount > 500);

  // Sync initial fetch
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages((prev) => {
        // Simple merge, favoring existing (like optimistic) if IDs match
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = initialMessages.filter((m) => !existingIds.has(m.id));
        
        let combined = [...newMsgs, ...prev];
        // Sort by timestamp if needed, but assuming server returns ordered
        // Usually, server returns earliest to latest or latest to earliest.
        // Let's assume we prepend older messages.
        
        // Ensure cap
        if (combined.length > 500) {
          combined = combined.slice(combined.length - 500); // keep latest
        }
        return combined as ChatMessage[];
      });
    }
  }, [initialMessages]);

  const loadEarlier = useCallback(() => {
    if (!atMemoryCap && hasMore && !isLoading) {
      fetchMore();
    }
  }, [atMemoryCap, hasMore, isLoading, fetchMore]);

  const insertOptimistic = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, message];
      if (next.length > 500) {
        return next.slice(next.length - 500);
      }
      return next;
    });
  }, []);

  const updateMessage = useCallback((clientIdOrId: string, update: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.clientId === clientIdOrId || msg.id === clientIdOrId
          ? { ...msg, ...update }
          : msg
      )
    );
  }, []);

  const streamingMessageRef = useRef<ChatMessage | null>(null);

  const appendStreamingTokens = useCallback((tokens: string) => {
    setMessages((prev) => {
      const next = [...prev];
      let lastMsg = next[next.length - 1];

      if (!lastMsg || lastMsg.role !== "assistant" || (lastMsg.sendStatus !== undefined && !lastMsg.streaming)) {
        // Create new streaming message if one doesn't exist
        lastMsg = {
          id: `stream-${Date.now()}`,
          role: "assistant",
          parts: [{ type: "text", content: tokens }],
          createdAt: new Date().toISOString(),
          streaming: true,
        };
        next.push(lastMsg);
      } else {
        // Update existing streaming message
        const lastPart = lastMsg.parts[lastMsg.parts.length - 1];
        if (lastPart && lastPart.type === "text") {
          const updatedParts = [...lastMsg.parts];
          updatedParts[updatedParts.length - 1] = { ...lastPart, content: tokens };
          lastMsg = { ...lastMsg, parts: updatedParts, streaming: true };
        } else {
          lastMsg = { ...lastMsg, parts: [...lastMsg.parts, { type: "text", content: tokens }], streaming: true };
        }
        next[next.length - 1] = lastMsg;
      }
      streamingMessageRef.current = lastMsg;
      return next;
    });
  }, []);

  const finalizeStreamingMessage = useCallback((message: AgentMessage) => {
    setMessages((prev) => {
      const next = [...prev];
      if (streamingMessageRef.current) {
        const idx = next.findIndex((m) => m.id === streamingMessageRef.current?.id);
        if (idx !== -1) {
          next[idx] = { ...message, streaming: false };
        } else {
          next.push({ ...message, streaming: false });
        }
        streamingMessageRef.current = null;
      } else {
        // Just push if not found
        if (!next.find((m) => m.id === message.id)) {
           next.push({ ...message, streaming: false });
        }
      }
      return next;
    });
  }, []);

  return {
    messages,
    totalCount,
    isLoading,
    error,
    hasOlderMessages,
    loadEarlier,
    atMemoryCap,
    insertOptimistic,
    updateMessage,
    appendStreamingTokens,
    finalizeStreamingMessage,
  };
}

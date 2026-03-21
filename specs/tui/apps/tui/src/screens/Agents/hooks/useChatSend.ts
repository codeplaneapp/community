import { useState, useCallback, useRef } from "react";
import { useSendAgentMessage } from "@codeplane/ui-core";
import type { AgentMessage } from "@codeplane/ui-core";
import type { ChatMessage } from "../types.js";

export interface ChatSendState {
  send: (text: string) => void;
  sending: boolean;
  error: Error | null;
  lastSendTime: number;
  canSend: boolean; // false during cooldown or streaming
  retry: (clientId: string) => void;
}

export function useChatSend(
  owner: string,
  repo: string,
  sessionId: string,
  options: {
    isStreaming: boolean;
    onOptimisticInsert: (message: ChatMessage) => void;
    onSendSuccess: (clientId: string, serverMessage: AgentMessage) => void;
    onSendFailure: (clientId: string, error: Error) => void;
  }
): ChatSendState {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastSendTimeRef = useRef<number>(0);
  
  const { sendMessage } = useSendAgentMessage(owner, repo, sessionId);

  const canSend = !options.isStreaming && Date.now() - lastSendTimeRef.current >= 2000;

  const performSend = useCallback(
    async (text: string, clientId?: string) => {
      const trimmedText = text.trim();
      if (!trimmedText || trimmedText.length > 4000) return;
      if (!canSend && !clientId) return; // Allow retry to bypass time check for simplicity, or we can check

      const idToUse = clientId || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (!clientId) {
        options.onOptimisticInsert({
          id: idToUse,
          clientId: idToUse,
          role: "user",
          parts: [{ type: "text", content: trimmedText }],
          createdAt: new Date().toISOString(),
          sendStatus: "pending",
        });
      } else {
        // If it's a retry, we need to find the message content. We assume the caller manages the content or we just update the status to pending.
        // Wait, for retry we need the text. We will pass it in.
      }

      setSending(true);
      setError(null);
      lastSendTimeRef.current = Date.now();

      try {
        const response = await sendMessage(trimmedText);
        options.onSendSuccess(idToUse, response as AgentMessage);
      } catch (err: any) {
        setError(err);
        options.onSendFailure(idToUse, err);
      } finally {
        setSending(false);
      }
    },
    [canSend, sendMessage, options]
  );

  const send = useCallback(
    (text: string) => {
      performSend(text);
    },
    [performSend]
  );

  const retry = useCallback(
    (clientId: string, text: string) => {
      options.onOptimisticInsert({
        id: clientId,
        clientId,
        role: "user",
        parts: [{ type: "text", content: text }],
        createdAt: new Date().toISOString(),
        sendStatus: "pending",
      });
      performSend(text, clientId);
    },
    [performSend, options]
  );

  return {
    send,
    sending,
    error,
    lastSendTime: lastSendTimeRef.current,
    canSend,
    retry,
  };
}

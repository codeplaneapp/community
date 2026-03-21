import { useEffect, useRef } from "react";
import { useAgentMessages } from "@codeplane/ui-core";
import type { ChatMessage } from "../types.js";

export function useChatPollingFallback(
  owner: string,
  repo: string,
  sessionId: string,
  sseAvailable: boolean,
  onNewMessages: (messages: ChatMessage[]) => void,
  isActive: boolean
): void {
  const { refetch } = useAgentMessages(sessionId, { perPage: 30 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (sseAvailable || !isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const { data } = await refetch();
        if (data?.messages) {
          onNewMessages(data.messages as ChatMessage[]);
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sseAvailable, isActive, refetch, onNewMessages]);
}

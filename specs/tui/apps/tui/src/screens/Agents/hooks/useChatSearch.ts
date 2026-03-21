import { useState, useCallback, useMemo } from "react";
import type { AgentMessage } from "../types.js";

export interface ChatSearchState {
  isActive: boolean;
  query: string;
  matchCount: number;
  currentMatchIndex: number;
  matchedMessageIds: string[];
  activate: () => void;
  deactivate: () => void;
  setQuery: (q: string) => void;
  nextMatch: () => void;
  prevMatch: () => void;
}

export function useChatSearch(messages: AgentMessage[]): ChatSearchState {
  const [isActive, setIsActive] = useState(false);
  const [query, setQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const activate = useCallback(() => {
    setIsActive(true);
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
    setQuery("");
    setCurrentMatchIndex(0);
  }, []);

  const matchedMessageIds = useMemo(() => {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return messages
      .filter((msg) =>
        msg.parts.some((part) => part.type === "text" && part.content.toLowerCase().includes(lowerQuery))
      )
      .map((msg) => msg.id);
  }, [messages, query]);

  const matchCount = matchedMessageIds.length;

  const nextMatch = useCallback(() => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const prevMatch = useCallback(() => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  return {
    isActive,
    query,
    matchCount,
    currentMatchIndex,
    matchedMessageIds,
    activate,
    deactivate,
    setQuery: (q: string) => {
      setQuery(q);
      setCurrentMatchIndex(0);
    },
    nextMatch,
    prevMatch,
  };
}

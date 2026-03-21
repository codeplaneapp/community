import { useState, useMemo, useCallback } from "react";
import type { AgentSession } from "@codeplane/ui-core";
import { STATUS_FILTER_CYCLE } from "../types.js";
import type { SessionStatusFilter } from "../types.js";

export interface UseSessionFilterResult {
  filteredSessions: AgentSession[];
  activeFilter: SessionStatusFilter;
  searchQuery: string;
  isSearchFocused: boolean;
  cycleFilter: () => void;
  setSearchQuery: (query: string) => void;
  setSearchFocused: (focused: boolean) => void;
  clearSearch: () => void;
  emptyReason: "none" | "zero_sessions" | "filter_empty" | "search_empty";
}

export function useSessionFilter(sessions: AgentSession[]): UseSessionFilterResult {
  const [activeFilter, setActiveFilter] = useState<SessionStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setSearchFocused] = useState(false);

  const cycleFilter = useCallback(() => {
    setActiveFilter(current => {
      const idx = STATUS_FILTER_CYCLE.indexOf(current);
      return STATUS_FILTER_CYCLE[(idx + 1) % STATUS_FILTER_CYCLE.length];
    });
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchFocused(false);
  }, []);

  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (activeFilter !== "all") {
      result = result.filter(s => s.status === activeFilter);
    }
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => (s.title || "").toLowerCase().includes(query));
    }
    return result;
  }, [sessions, activeFilter, searchQuery]);

  const emptyReason = useMemo((): UseSessionFilterResult["emptyReason"] => {
    if (filteredSessions.length > 0) return "none";
    if (sessions.length === 0) return "zero_sessions";
    if (searchQuery.trim().length > 0) return "search_empty";
    if (activeFilter !== "all") return "filter_empty";
    return "zero_sessions";
  }, [filteredSessions.length, sessions.length, searchQuery, activeFilter]);

  return {
    filteredSessions, activeFilter, searchQuery, isSearchFocused,
    cycleFilter, setSearchQuery, setSearchFocused, clearSearch, emptyReason,
  };
}

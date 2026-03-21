import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useAgentSessions, useDeleteAgentSession } from "@codeplane/ui-core";
import type { AgentSession, AgentSessionStatus } from "@codeplane/ui-core";

import type { Breakpoint } from "./types.js";
import { useSessionFilter } from "./hooks/useSessionFilter.js";
import { useSessionListSSE } from "./hooks/useSessionListSSE.js";
import { useSessionListKeybindings } from "./hooks/useSessionListKeybindings.js";
import { getSessionListColumns } from "./utils/sessionListColumns.js";
import { formatTotalCount } from "./utils/formatTotalCount.js";
import { SessionRow } from "./components/SessionRow.js";
import { SessionFilterToolbar } from "./components/SessionFilterToolbar.js";
import { DeleteConfirmationOverlay } from "./components/DeleteConfirmationOverlay.js";
import { SessionEmptyState } from "./components/SessionEmptyState.js";
import { useNavigation } from "../../providers/NavigationProvider.js";

interface AgentSessionListScreenProps {
  owner: string;
  repo: string;
  repoId?: string;
}

export function AgentSessionListScreen({
  owner, repo, repoId,
}: AgentSessionListScreenProps): React.ReactElement {
  const { push } = useNavigation();

  // ── Data ──
  const {
    sessions, totalCount, isLoading, error, hasMore, fetchMore, refetch,
  } = useAgentSessions(owner, repo, { perPage: 30 });

  // ── Local State ──
  const [focusIndex, setFocusIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AgentSession | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Terminal Dimensions (stub until provider ships) ──
  // const { width, height } = useTerminalDimensions();
  const width = 120;
  const height = 40;

  const breakpoint: Breakpoint = useMemo(() => {
    if (width < 120 || height < 40) return "minimum";
    if (width < 200 || height < 60) return "standard";
    return "large";
  }, [width, height]);

  const columns = useMemo(
    () => getSessionListColumns(breakpoint, width),
    [breakpoint, width],
  );

  // ── Filtering ──
  const filter = useSessionFilter(sessions);
  const { filteredSessions } = filter;

  // ── Focus Clamping ──
  useEffect(() => {
    if (focusIndex >= filteredSessions.length && filteredSessions.length > 0) {
      setFocusIndex(filteredSessions.length - 1);
    }
  }, [filteredSessions.length, focusIndex]);

  const focusedSession = filteredSessions[focusIndex] ?? null;

  // ── Flash Helper ──
  const showFlash = useCallback((msg: string) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashMessage(msg);
    flashTimeoutRef.current = setTimeout(() => setFlashMessage(null), 3000);
  }, []);

  // ── Delete ──
  const deleteHook = useDeleteAgentSession(owner, repo, {
    onRevert: () => showFlash("Delete failed — session restored"),
    onError: (err) => {
      if (err && typeof err === "object" && "code" in err) {
        const code = (err as any).code;
        if (code === 403) showFlash("Cannot delete: not your session");
        else if (code === 429) showFlash("Rate limited. Try again later.");
      }
    },
  });

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    deleteHook.mutate(deleteTarget.id).catch(() => {});
    setDeleteTarget(null);
  }, [deleteTarget, deleteHook]);

  const handleDeleteCancel = useCallback(() => setDeleteTarget(null), []);

  // ── SSE ──
  useSessionListSSE(repoId, () => {
    // Stub: inline state mutation when SSEProvider ships.
  });

  // ── Pagination ──
  const handleScrollNearEnd = useCallback(() => {
    if (hasMore && !isLoading && sessions.length < 500) fetchMore();
  }, [hasMore, isLoading, sessions.length, fetchMore]);

  // ── Navigation Actions ──
  const handleOpen = useCallback(() => {
    if (!focusedSession || isLoading) return;
    push("AgentChat", { owner, repo, sessionId: focusedSession.id });
  }, [focusedSession, isLoading, push, owner, repo]);

  const handleCreate = useCallback(() => {
    // Check write access; if read-only → showFlash("Write access required")
    // push("agent-session-create", { owner, repo })
  }, []);

  const handleReplay = useCallback(() => {
    if (!focusedSession) return;
    const replayable: AgentSessionStatus[] = ["completed", "failed", "timed_out"];
    if (!replayable.includes(focusedSession.status)) {
      if (focusedSession.status === "active") showFlash("Session still active");
      return;
    }
    push("AgentChat", { owner, repo, sessionId: focusedSession.id });
  }, [focusedSession, showFlash, push, owner, repo]);

  const handleDelete = useCallback(() => {
    if (!focusedSession || deleteTarget !== null) return;
    setDeleteTarget(focusedSession);
  }, [focusedSession, deleteTarget]);

  // ── Keybindings (stub) ──
  useSessionListKeybindings({
    moveFocusDown: () => setFocusIndex(i => Math.min(i + 1, filteredSessions.length - 1)),
    moveFocusUp: () => setFocusIndex(i => Math.max(i - 1, 0)),
    jumpToFirst: () => setFocusIndex(0),
    jumpToLast: () => setFocusIndex(filteredSessions.length - 1),
    pageDown: () => setFocusIndex(i => Math.min(i + Math.floor(height / 2), filteredSessions.length - 1)),
    pageUp: () => setFocusIndex(i => Math.max(i - Math.floor(height / 2), 0)),
    openSession: handleOpen,
    createSession: handleCreate,
    deleteSession: handleDelete,
    replaySession: handleReplay,
    cycleFilter: filter.cycleFilter,
    focusSearch: () => filter.setSearchFocused(true),
    toggleSelection: () => {
      if (!focusedSession) return;
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(focusedSession.id) ? next.delete(focusedSession.id) : next.add(focusedSession.id);
        return next;
      });
    },
    retryFetch: refetch,
    popScreen: () => { /* pop() */ },
    isSearchFocused: filter.isSearchFocused,
    isOverlayOpen: deleteTarget !== null,
    isErrorState: error !== null && sessions.length === 0,
    hasSearchText: filter.searchQuery.length > 0,
  }, "j/k:nav Enter:open n:new d:del r:replay q:back");

  // ── Pagination Cap ──
  const showCap = sessions.length >= 500 && totalCount > 500;
  const capFooter = showCap ? `Showing 500 of ${formatTotalCount(totalCount)}` : null;

  // ── Render: Error State ──
  if (error && sessions.length === 0) {
    return (
      <box flexDirection="column" width="100%" flexGrow={1}>
        <text bold>Agent Sessions</text>
        <box justifyContent="center" alignItems="center" flexGrow={1}>
          <text>Error loading sessions. Press R to retry.</text>
        </box>
      </box>
    );
  }

  // ── Render: Loading State ──
  if (isLoading && sessions.length === 0) {
    return (
      <box flexDirection="column" width="100%" flexGrow={1}>
        <text bold>Agent Sessions</text>
        <SessionFilterToolbar
          activeFilter={filter.activeFilter} searchQuery={filter.searchQuery}
          isSearchFocused={filter.isSearchFocused}
          onSearchChange={filter.setSearchQuery}
          onSearchFocus={() => filter.setSearchFocused(true)}
          onSearchBlur={() => filter.setSearchFocused(false)}
          terminalWidth={width}
        />
        <box justifyContent="center" alignItems="center" flexGrow={1}>
          <text>Loading agent sessions…</text>
        </box>
      </box>
    );
  }

  // ── Render: Main ──
  return (
    <box flexDirection="column" width="100%" flexGrow={1}>
      <text bold>Agent Sessions ({formatTotalCount(totalCount)})</text>
      {flashMessage && <text color="yellow">{flashMessage}</text>}

      <SessionFilterToolbar
        activeFilter={filter.activeFilter} searchQuery={filter.searchQuery}
        isSearchFocused={filter.isSearchFocused}
        onSearchChange={filter.setSearchQuery}
        onSearchFocus={() => filter.setSearchFocused(true)}
        onSearchBlur={() => filter.setSearchFocused(false)}
        terminalWidth={width}
      />

      {filter.emptyReason !== "none" ? (
        <SessionEmptyState
          reason={filter.emptyReason}
          activeFilter={filter.activeFilter}
          searchQuery={filter.searchQuery}
        />
      ) : (
        <scrollbox flexGrow={1}>
          <box flexDirection="column">
            {filteredSessions.map((session, idx) => (
              <SessionRow
                key={session.id} session={session}
                focused={idx === focusIndex}
                selected={selectedIds.has(session.id)}
                columns={columns} breakpoint={breakpoint}
              />
            ))}
            {isLoading && hasMore && <text>Loading more…</text>}
            {capFooter && <text>{capFooter}</text>}
          </box>
        </scrollbox>
      )}

      {deleteTarget && (
        <DeleteConfirmationOverlay
          session={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </box>
  );
}

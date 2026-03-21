import React, { useState, useCallback, useEffect } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { useNavigation } from "../../providers/NavigationProvider.js";
import { useAgentStream } from "../../hooks/useAgentStream.js";
import { useAgentSession } from "@codeplane/ui-core";
import { getBreakpoint } from "../../types/breakpoint.js";
import { MessageBlock } from "./components/MessageBlock.js";
import { useTheme } from "../../hooks/useTheme.js";
import { truncateTitle } from "./utils/truncateTitle.js";
import { useChatKeybindings } from "./hooks/useChatKeybindings.js";
import { useChatSearch } from "./hooks/useChatSearch.js";
import { useAutoScroll } from "./hooks/useAutoScroll.js";
import { useChatSend } from "./hooks/useChatSend.js";
import { useChatPagination } from "./hooks/useChatPagination.js";
import { useChatInput } from "./hooks/useChatInput.js";
import { useChatPollingFallback } from "./hooks/useChatPollingFallback.js";
import type { Breakpoint, ChatMode } from "./types.js";

// Dummy useSSEChannel since it's not fully implemented globally
const useSSEChannel = (channel: string, callback: (event: any) => void) => {};

export function AgentChatScreen() {
  // --- Navigation & Params ---
  const { current, pop } = useNavigation();
  const theme = useTheme();

  const owner = current.params?.owner ?? "";
  const repo = current.params?.repo ?? "";
  const sessionId = current.params?.sessionId ?? "";

  // --- Terminal Dimensions ---
  const dims = useTerminalDimensions();
  const width = dims?.width ?? 120;
  const height = dims?.height ?? 40;
  const breakpoint = getBreakpoint(width, height) as Breakpoint;

  // --- Session Data ---
  const { session, isLoading: sessionLoading, error: sessionError, refetch: refetchSession } = useAgentSession(owner, repo, sessionId);

  // --- Mode ---
  const chatMode: ChatMode = session?.status === "active" ? "active" : "replay";

  // --- Pagination & Messages ---
  const pagination = useChatPagination(owner, repo, sessionId);

  // --- Streaming ---
  const stream = useAgentStream(owner, repo, sessionId);

  // Wire streaming tokens into pagination state
  useEffect(() => {
    if (stream.streaming && stream.currentTokens) {
      pagination.appendStreamingTokens(stream.currentTokens);
    }
  }, [stream.currentTokens]); // We deliberately only depend on stream.currentTokens here

  useEffect(() => {
    if (!stream.streaming && stream.finalMessage) {
       pagination.finalizeStreamingMessage(stream.finalMessage);
    }
  }, [stream.streaming, stream.finalMessage]);

  // --- Auto-scroll ---
  const autoScroll = useAutoScroll();

  // --- Input ---
  const input = useChatInput(breakpoint);

  // --- Send ---
  const send = useChatSend(owner, repo, sessionId, {
    isStreaming: stream.streaming,
    onOptimisticInsert: pagination.insertOptimistic,
    onSendSuccess: (clientId, serverMsg) => {
      pagination.updateMessage(clientId, { sendStatus: "sent", id: serverMsg.id });
    },
    onSendFailure: (clientId, error) => {
      pagination.updateMessage(clientId, { sendStatus: "failed" });
    },
  });

  // --- Tool Block Expansion ---
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());
  const toggleToolExpand = useCallback((toolId: string) => {
    // At minimum breakpoint, tool blocks are always collapsed
    if (breakpoint === "minimum") return;
    setExpandedToolIds(prev => {
      const next = new Set(prev);
      next.has(toolId) ? next.delete(toolId) : next.add(toolId);
      return next;
    });
  }, [breakpoint]);

  // --- Search ---
  const search = useChatSearch(pagination.messages);

  // --- SSE Session Status ---
  useSSEChannel(`agent.session.${sessionId}`, (event) => {
    if (event.type === "status_changed") {
      if (["completed", "timed_out", "failed"].includes(event.data.status)) {
        refetchSession();
      }
    }
  });

  // --- Fallback Polling (if SSE not available) ---
  useChatPollingFallback(owner, repo, sessionId, true, () => {}, chatMode === "active");

  // --- Keybindings ---
  useChatKeybindings({
    scrollDown: () => { autoScroll.onUserScroll("down"); },
    scrollUp: () => { autoScroll.onUserScroll("up"); autoScroll.disable(); },
    jumpToBottom: () => { autoScroll.enable(); autoScroll.resetNewMessages(); },
    jumpToTop: () => { autoScroll.disable(); pagination.loadEarlier(); },
    pageDown: () => { /* scrollbox page down */ },
    pageUp: () => { /* scrollbox page up */ },
    focusInput: () => { if (chatMode === "active") input.setFocused(true); },
    unfocusInput: () => { input.setFocused(false); },
    sendMessage: () => {
      if (!input.text.trim() || !send.canSend) return;
      send.send(input.text);
      input.clear();
      input.setFocused(false);
    },
    toggleAutoScroll: () => { autoScroll.toggle(); },
    toggleToolBlock: () => { /* delegate to focused tool block */ },
    activateSearch: () => { search.activate(); },
    deactivateSearch: () => { search.deactivate(); },
    nextSearchMatch: () => { search.nextMatch(); },
    prevSearchMatch: () => { search.prevMatch(); },
    retryMessage: () => {
      // Find last failed message
      const failedMsg = [...pagination.messages].reverse().find(m => m.sendStatus === "failed");
      if (failedMsg && failedMsg.clientId) {
         // find original text parts
         const textParts = failedMsg.parts.filter((p: any) => p.type === "text").map((p: any) => p.content).join("\n");
         send.retry(failedMsg.clientId, textParts);
      }
    },
    popScreen: () => { pop(); },
    isInputFocused: input.isFocused,
    isSearchActive: search.isActive,
    isStreaming: stream.streaming,
    sessionStatus: session?.status ?? "active",
  }, "Enter:send  i:input  j/k:scroll  /:search  q:back");

  // --- Computed Layout ---
  const titleMaxWidth = 40;
  const messagePadding = breakpoint === "minimum" ? 2 : breakpoint === "standard" ? 4 : 8;
  const inputHeight = chatMode === "active" ? (input.isMultiline ? input.inputHeight + 1 : 2) : 1;

  // --- Error States ---
  if (sessionError?.status === 404) {
    return (
      <box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
        <text color={theme.error}>Session not found. Press q to go back.</text>
      </box>
    );
  }

  if (sessionError?.status === 401) {
    return (
      <box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
        <text color={theme.error}>Session expired. Run `codeplane auth login` to re-authenticate.</text>
      </box>
    );
  }

  if (sessionLoading) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box height={1} paddingX={1}>
          <text bold color={theme.primary}>Loading messages…</text>
        </box>
      </box>
    );
  }

  // --- Status badge color ---
  const statusColor = {
    active: theme.success,
    completed: theme.muted,
    failed: theme.error,
    timed_out: theme.warning,
  }[session?.status ?? "active"] ?? theme.muted;

  // --- Session title ---
  const titleText = truncateTitle(session?.title ?? "", titleMaxWidth);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Session title bar */}
      <box flexDirection="row" height={1} paddingX={1}>
        <text bold color={theme.primary}>{titleText}</text>
        <box flexGrow={1} />
        <text color={statusColor}>◆ {session?.status ?? "unknown"}</text>
      </box>

      {/* Message history */}
      <scrollbox
        flexGrow={1}
        stickyScroll={autoScroll.enabled}
        stickyStart="bottom"
        viewportCulling={true}
        paddingX={messagePadding}
        onScrollTop={pagination.loadEarlier}
      >
        <box flexDirection="column" gap={1}>
          {/* Load earlier messages trigger */}
          {pagination.atMemoryCap && (
            <text color={theme.muted} align="center">Showing latest 500 messages</text>
          )}
          {pagination.hasOlderMessages && !pagination.atMemoryCap && (
            <text color={theme.muted} align="center">Load earlier messages</text>
          )}

          {/* Empty state */}
          {pagination.messages.length === 0 && !pagination.isLoading && (
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text color={theme.muted}>Send a message to start the conversation.</text>
            </box>
          )}

          {/* Messages */}
          {pagination.messages.map((msg, idx) => (
            <box key={msg.clientId ?? msg.id} flexDirection="column" gap={0}>
              <MessageBlock
                message={msg}
                breakpoint={breakpoint}
                showSeparator={false}
                expandedToolIds={expandedToolIds}
                onToggleToolExpand={toggleToolExpand}
              />
              {msg.sendStatus === "failed" && (
                <text color={theme.error}>Message failed to send. Press R to retry.</text>
              )}
              {msg.sendStatus === "pending" && (
                <text color={theme.muted}>Sending…</text>
              )}
              {idx < pagination.messages.length - 1 && (
                <box height={1} width="100%">
                  <text color={theme.border}>{"─".repeat(Math.max(0, width - messagePadding * 2))}</text>
                </box>
              )}
            </box>
          ))}

          {/* New messages indicator */}
          {autoScroll.hasNewMessages && !autoScroll.enabled && (
            <box position="absolute" bottom={1} right={2}>
              <text color={theme.primary} bold>↓ New messages</text>
            </box>
          )}
        </box>
      </scrollbox>

      {search.isActive && (
        <box height={1} paddingX={1} borderTop="single">
          <text color={theme.muted}>/</text>
          <input
            value={search.query}
            onChange={search.setQuery}
            focused={true}
            placeholder="Search messages…"
          />
          <text color={theme.muted}>
            {search.matchCount > 0
              ? ` ${search.currentMatchIndex + 1}/${search.matchCount}`
              : search.query ? " No matches" : ""}
          </text>
        </box>
      )}

      {/* Message input or replay banner */}
      {chatMode === "active" ? (
        <box flexDirection="column" height={inputHeight} borderTop="single" paddingX={1}>
          <box flexDirection="row" alignItems="center" gap={1}>
            <text color={theme.muted}>{'>'}</text>
            <input
              value={input.text}
              onChange={input.setText}
              placeholder={stream.streaming ? "Agent is responding…" : "Type a message…"}
              focused={input.isFocused && !search.isActive}
              disabled={stream.streaming}
              maxLength={4000}
              multiline={input.isMultiline}
            />
          </box>
          {input.isMultiline && breakpoint !== "minimum" && (
            <text color={theme.muted} align="right">Ctrl+Enter to send · Esc to cancel</text>
          )}
          {!send.canSend && send.error?.message === "Rate limited" && (
            <text color={theme.warning}>Rate limited</text>
          )}
        </box>
      ) : (
        <box height={1} borderTop="single" paddingX={1} justifyContent="center">
          <text color={theme.muted}>
            Session {session?.status === "completed" ? "completed" : session?.status === "timed_out" ? "timed out" : session?.status}. Read-only replay mode.
          </text>
        </box>
      )}
    </box>
  );
}

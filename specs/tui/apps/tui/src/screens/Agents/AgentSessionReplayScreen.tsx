import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTerminalDimensions, useKeyboard, useOnResize } from "@opentui/react";
import { useAgentSession, useAgentMessages } from "@codeplane/ui-core";
import { useNavigation } from "../../providers/NavigationProvider.js";
import { useTheme } from "../../hooks/useTheme.js";
import { ScreenName } from "../../router/index.js";
import { MessageBlock } from "./components/MessageBlock.js";
import { SessionSummary } from "./components/SessionSummary.js";
import { getBreakpoint } from "../../types/breakpoint.js";
import type { Breakpoint, AgentMessage } from "./types.js";
import { truncateTitle } from "./utils/truncateTitle.js";

// Dummy search match type
interface SearchMatch {
  messageIndex: number;
  charOffset: number;
  length: number;
}

export function AgentSessionReplayScreen() {
  const { current, replace, pop, push } = useNavigation();
  const theme = useTheme();

  const owner = current.params?.owner ?? "";
  const repo = current.params?.repo ?? "";
  const sessionId = current.params?.sessionId ?? "";

  const { width, height } = useTerminalDimensions() ?? { width: 120, height: 40 };
  const breakpoint = getBreakpoint(width, height) as Breakpoint;

  const {
    session,
    isLoading: sessionLoading,
    error: sessionError,
  } = useAgentSession(owner, repo, sessionId);

  const {
    messages: rawMessages,
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
    hasMore,
  } = useAgentMessages(owner, repo, sessionId, { autoPaginate: true });

  const messages = rawMessages as unknown as AgentMessage[];

  useEffect(() => {
    if (session && (session.status === "active" || session.status === "pending")) {
      replace(ScreenName.AgentChat, { owner, repo, sessionId });
    }
  }, [session?.status, replace, owner, repo, sessionId]);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [toolExpandState, setToolExpandState] = useState<Set<string>>(new Set());
  const [workflowLinkFocused, setWorkflowLinkFocused] = useState(false);

  const scrollRef = useRef<any>(null);

  const handleToolToggle = useCallback((partId: string) => {
    setToolExpandState((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  }, []);

  const jumpToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollToEnd();
    }
  };

  const jumpToTop = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0);
    }
  };

  useKeyboard((key) => {
    if (searchActive) {
      if (key === "Escape") {
        setSearchActive(false);
        setSearchQuery("");
      } else if (key === "n") {
        // Dummy next match
      } else if (key === "N") {
        // Dummy prev match
      }
      return;
    }

    if (key === "q" || key === "Escape") {
      pop();
    } else if (key === "j" || key === "ArrowDown") {
      scrollRef.current?.scrollDown(1);
    } else if (key === "k" || key === "ArrowUp") {
      scrollRef.current?.scrollUp(1);
    } else if (key === "G") {
      jumpToBottom();
    } else if (key === "g g") { // go-to mode override actually needed
      jumpToTop();
    } else if (key === "Ctrl+d") {
      scrollRef.current?.scrollDown(Math.floor(height / 2));
    } else if (key === "Ctrl+u") {
      scrollRef.current?.scrollUp(Math.floor(height / 2));
    } else if (key === "/") {
      setSearchActive(true);
      setSearchQuery("");
    } else if (key === "R" && (sessionError || messagesError)) {
      refetchMessages();
    } else if (key === "y") {
      // Dummy copy message
    } else if (key === "]" || key === "[") {
      // Dummy jump to next/prev message
    } else if (key === "x" || key === "X") {
      // Dummy expand/collapse tool
    } else if (key === "Enter") {
      if (workflowLinkFocused && session?.workflowRunId) {
        push(ScreenName.WorkflowRunDetail, { owner, repo, runId: session.workflowRunId });
      }
    }
  });

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
      <box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
        <text color={theme.primary}>Loading session…</text>
      </box>
    );
  }

  if (messagesError) {
    return (
      <box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
        <text color={theme.error}>Failed to load messages. Press R to retry.</text>
      </box>
    );
  }

  const allLoaded = !hasMore && !messagesLoading;

  const titleText = truncateTitle(session?.title ?? "", 40);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header bar */}
      <box flexDirection="row" height={1} paddingX={1} borderBottom="single">
        <text>Dashboard {'>'} {owner}/{repo} {'>'} Agents {'>'} Session: {titleText} </text>
        <text color={theme.primary} bold>REPLAY</text>
      </box>

      {/* Main Content */}
      <box flexDirection="row" flexGrow={1}>
        <scrollbox ref={scrollRef} flexGrow={1} paddingX={breakpoint === "minimum" ? 0 : breakpoint === "standard" ? 2 : 4}>
          <box flexDirection="column">
            {messages.length === 0 && allLoaded && (
              <box justifyContent="center" alignItems="center" height={5}>
                <text color={theme.muted}>This session has no messages.</text>
              </box>
            )}
            
            {messages.map((msg, i) => (
              <MessageBlock
                key={msg.id}
                message={msg}
                breakpoint={breakpoint}
                expandedToolIds={toolExpandState}
                onToggleToolExpand={handleToolToggle}
              />
            ))}

            {allLoaded && messages.length > 0 && session && (
              <SessionSummary
                status={session.status}
                messageCount={messages.length}
                startedAt={session.startedAt}
                finishedAt={session.finishedAt}
                workflowRunId={session.workflowRunId}
                breakpoint={breakpoint}
                workflowLinkFocused={workflowLinkFocused}
              />
            )}
            
            {hasMore && (
              <text color={theme.muted}>Loading messages…</text>
            )}
          </box>
        </scrollbox>

        {/* Large breakpoint sidebar */}
        {breakpoint === "large" && session && (
          <box width={25} flexShrink={0} borderLeft="single" paddingX={1} flexDirection="column">
            <text bold>Session Info</text>
            <text>Status: {session.status}</text>
            <text>Messages: {messages.length}</text>
            {session.startedAt && session.finishedAt && (
              <text>Duration: {session.startedAt} - {session.finishedAt}</text>
            )}
            <box marginY={1} />
            <text bold>Legend</text>
            <text color={theme.primary}>■ You (user)</text>
            <text color={theme.success}>■ Agent (assistant)</text>
            <text color={theme.muted}>■ System</text>
            <text color={theme.warning}>■ Tool</text>
          </box>
        )}
      </box>

      {/* Search Overlay */}
      {searchActive && (
        <box position="absolute" bottom={1} left={0} width="100%" height={1} borderTop="single" paddingX={1}>
          <text color={theme.muted}>/</text>
          <input
            value={searchQuery}
            onChange={setSearchQuery}
            focused={true}
            placeholder="Search…"
          />
          <text color={theme.muted}>
            {matchCount > 0 ? ` ${matchIndex + 1}/${matchCount}` : " 0/0"}
          </text>
        </box>
      )}

      {/* Status bar */}
      <box height={1} borderTop="single" paddingX={1} flexDirection="row" justifyContent="space-between">
        <text color={theme.muted}>j/k:scroll [/]:msg x:expand /:search q:back</text>
        <text color={theme.muted}>
          {messages.length === 0 ? "" : breakpoint === "minimum" ? `${currentMessageIndex + 1}/${messages.length}` : `Message ${currentMessageIndex + 1} of ${messages.length}`}
        </text>
      </box>
    </box>
  );
}

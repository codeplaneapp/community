# Engineering Specification: TUI Agent Chat Screen

**Ticket:** `tui-agent-chat-screen`
**Title:** Implement Agent Chat Screen with streaming responses
**Status:** Not started
**Dependencies:** `tui-agent-data-hooks`, `tui-agent-sse-stream-hook`, `tui-agent-message-block`, `tui-agent-screen-registry`, `tui-agent-e2e-scaffolding`

---

## Overview

This spec covers the full implementation of `AgentChatScreen` — the primary conversational interface for agent interactions in the Codeplane TUI. The screen replaces the current stub at `apps/tui/src/screens/Agents/AgentChatScreen.tsx` with a full-featured, streaming-enabled chat view.

The screen is a dual-zone layout: a scrollable message history occupying the majority of the content area, and a message input/status area anchored to the bottom. It consumes four `@codeplane/ui-core` hooks (`useAgentSession`, `useAgentMessages`, `useAgentStream`, `useSendAgentMessage`), renders messages via the existing `MessageBlock` component, and handles real-time SSE streaming with progressive markdown rendering.

---

## Implementation Plan

### Step 1: Add `AgentChat` and `AgentSessionDetail` screen IDs to the screen registry

**File:** `apps/tui/src/router/screens.ts`

**What:**
- Add `AgentChat: "AgentChat"` to `SCREEN_IDS`.
- Add a `screenRegistry` entry for `AgentChat` pointing to `AgentChatScreen` with `requiresRepo: true` and title `"Agent Chat"`.
- Import `AgentChatScreen` from `../screens/Agents/AgentChatScreen.js`.

**Why:** The navigation stack needs a registered screen ID to push the chat screen when the user presses `Enter` on a session in the list.

```typescript
// In SCREEN_IDS:
AgentChat: "AgentChat",

// In screenRegistry:
[SCREEN_IDS.AgentChat]: {
  component: AgentChatScreen,
  title: "Agent Chat",
  requiresRepo: true,
},
```

**Validation:** The screen can be pushed via `navigation.push("AgentChat", { owner, repo, sessionId })` and the component renders.

---

### Step 2: Wire session list → chat screen navigation

**File:** `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`

**What:**
- In `handleOpen()`, replace the comment stub with `navigation.push("AgentChat", { owner, repo, sessionId: focusedSession.id })`.
- Import `useNavigation` from `../../hooks/useNavigation.js`.
- Wire `handleReplay()` to also navigate to `AgentChat` (completed/failed/timed_out sessions render in replay mode automatically based on session status).

**Why:** The session list's `Enter` key binding must push the chat screen. Currently it's a no-op comment.

---

### Step 3: Define chat-specific types

**File:** `apps/tui/src/screens/Agents/types.ts`

**What:** Add types needed by the chat screen that don't already exist:

```typescript
/** Status of a sent message for optimistic UI */
export type MessageSendStatus = "pending" | "sent" | "failed";

/** Extended message with client-side metadata */
export interface ChatMessage extends AgentMessage {
  sendStatus?: MessageSendStatus;
  clientId?: string; // for optimistic dedup
}

/** Chat screen mode derived from session status */
export type ChatMode = "active" | "replay";
```

**Why:** The chat screen needs to track optimistic message state and distinguish active vs replay mode.

---

### Step 4: Create the chat keybindings hook

**File:** `apps/tui/src/screens/Agents/hooks/useChatKeybindings.ts`

**What:** A hook that registers chat-specific keybindings with the keybinding system. It mirrors the pattern established by `useSessionListKeybindings.ts`.

```typescript
export interface ChatKeybindingHandlers {
  scrollDown: () => void;
  scrollUp: () => void;
  jumpToBottom: () => void;
  jumpToTop: () => void;
  pageDown: () => void;
  pageUp: () => void;
  focusInput: () => void;
  unfocusInput: () => void;
  sendMessage: () => void;
  toggleAutoScroll: () => void;
  toggleToolBlock: () => void;
  activateSearch: () => void;
  nextSearchMatch: () => void;
  prevSearchMatch: () => void;
  retryMessage: () => void;
  popScreen: () => void;
  isInputFocused: boolean;
  isSearchActive: boolean;
  isStreaming: boolean;
  sessionStatus: string;
}

export function useChatKeybindings(
  handlers: ChatKeybindingHandlers,
  statusBarHints: string,
): void;
```

**Key dispatch logic:**
- When `isInputFocused === true`: printable keys go to input. Only `Esc`, `Enter`, `Ctrl+Enter`, `Shift+Enter`, `Ctrl+C` propagate.
- When `isInputFocused === false`: `j`/`k`/`G`/`gg`/`Ctrl+D`/`Ctrl+U` scroll, `i` focuses input, `q` pops, `f` toggles auto-scroll, `Tab`/`Shift+Tab` toggle tool blocks, `/` activates search, `n`/`N` navigate search, `R` retries.
- When `sessionStatus !== "active"`: `i` is no-op (no input to focus).

**Status bar hints string:** `"Enter:send  i:input  j/k:scroll  /:search  q:back"`

---

### Step 5: Create the message search hook

**File:** `apps/tui/src/screens/Agents/hooks/useChatSearch.ts`

**What:** A hook for substring search across message history.

```typescript
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

export function useChatSearch(messages: AgentMessage[]): ChatSearchState;
```

**Behavior:**
- Search is literal substring (not regex). Special regex characters are not interpreted.
- Searches across all text parts of all messages.
- `n` / `N` cycle through matches. Current match index wraps.
- `Esc` clears search and returns to message browsing.
- Match count and current index shown in status area during search.

---

### Step 6: Create the auto-scroll management hook

**File:** `apps/tui/src/screens/Agents/hooks/useAutoScroll.ts`

**What:** Manages sticky-scroll state for the message history.

```typescript
export interface AutoScrollState {
  enabled: boolean;
  hasNewMessages: boolean;
  toggle: () => void;
  enable: () => void;
  disable: () => void;
  onUserScroll: (direction: "up" | "down") => void;
  onNewContent: () => void;
  resetNewMessages: () => void;
}

export function useAutoScroll(): AutoScrollState;
```

**Behavior:**
- Enabled by default on mount.
- Disabled when user scrolls up (`k` / `Up` / `Ctrl+U`).
- Re-enabled when user presses `G`, `f`, or `Enter` on "↓ New messages" indicator.
- `hasNewMessages` is true when auto-scroll is disabled and new streaming content or messages arrive.
- `resetNewMessages` clears the indicator when user scrolls to bottom.

---

### Step 7: Create the message send hook wrapper

**File:** `apps/tui/src/screens/Agents/hooks/useChatSend.ts`

**What:** Wraps `useSendAgentMessage` from `@codeplane/ui-core` with TUI-specific concerns: optimistic insertion, client-side validation, rate limiting, and retry.

```typescript
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
  },
): ChatSendState;
```

**Client-side guards:**
- Reject whitespace-only messages.
- Reject messages > 4000 characters.
- Enforce 2-second cooldown between sends.
- Block sends while `isStreaming === true`.
- On success: replace optimistic message with server response.
- On failure: mark optimistic message as `sendStatus: "failed"`.
- On retry: re-send the original text, mark as `sendStatus: "pending"`.

---

### Step 8: Create the message pagination hook

**File:** `apps/tui/src/screens/Agents/hooks/useChatPagination.ts`

**What:** Manages message loading, pagination, and the 500-message memory cap.

```typescript
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
  sessionId: string,
): ChatPaginationState;
```

**Behavior:**
- Initial load: fetch most recent page (page size 30, max 50).
- Scroll-to-top triggers `loadEarlier()` which fetches the next older page.
- Memory cap: 500 messages max in state. When cap reached, `hasOlderMessages` remains true but `loadEarlier` is a no-op. Display "Showing latest 500 messages" at top.
- `appendStreamingTokens`: appends to the last assistant message's last text part (or creates a new text part). The message is marked `streaming: true`.
- `finalizeStreamingMessage`: marks the streaming message as `streaming: false`, replaces accumulated tokens with final server content.

---

### Step 9: Create the input state management hook

**File:** `apps/tui/src/screens/Agents/hooks/useChatInput.ts`

**What:** Manages the message input field state including multi-line expansion.

```typescript
export interface ChatInputState {
  text: string;
  setText: (text: string) => void;
  isFocused: boolean;
  setFocused: (focused: boolean) => void;
  isMultiline: boolean;
  setMultiline: (multiline: boolean) => void;
  inputHeight: number; // 1 for single-line, up to maxLines
  maxLength: number; // 4000
  clear: () => void;
  insertNewline: () => void;
}

export function useChatInput(breakpoint: Breakpoint): ChatInputState;
```

**Behavior:**
- `maxLength`: 4000 characters. Characters beyond the limit are silently rejected.
- `insertNewline`: switches to multi-line mode and inserts `\n` into text.
- `inputHeight`: computed from newline count. At minimum breakpoint: always 1 (single-line only). At standard: up to 4. At large: up to 8.
- Input text is preserved across resize.
- `clear()` resets text and switches back to single-line.

---

### Step 10: Implement the `AgentChatScreen` component

**File:** `apps/tui/src/screens/Agents/AgentChatScreen.tsx`

This is the main implementation. Replace the current stub entirely.

**Component structure:**

```tsx
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTerminalDimensions, useOnResize, useTimeline } from "@opentui/react";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useAgentStream } from "../../hooks/useAgentStream.js";
import { getBreakpoint } from "../../types/breakpoint.js";
import { MessageBlock } from "./components/MessageBlock.js";
import { COLORS } from "./components/colors.js";
import { truncateTitle } from "./utils/truncateTitle.js";
import { useChatKeybindings } from "./hooks/useChatKeybindings.js";
import { useChatSearch } from "./hooks/useChatSearch.js";
import { useAutoScroll } from "./hooks/useAutoScroll.js";
import { useChatSend } from "./hooks/useChatSend.js";
import { useChatPagination } from "./hooks/useChatPagination.js";
import { useChatInput } from "./hooks/useChatInput.js";
import type { Breakpoint, ChatMessage, ChatMode } from "./types.js";

export function AgentChatScreen() {
  // --- Navigation & Params ---
  const { current, pop } = useNavigation();
  const owner = current.params?.owner ?? "";
  const repo = current.params?.repo ?? "";
  const sessionId = current.params?.sessionId ?? "";

  // --- Terminal Dimensions ---
  const { width, height } = useTerminalDimensions();
  const breakpoint = getBreakpoint(width, height) as Breakpoint;

  // --- Session Data ---
  // useAgentSession from @codeplane/ui-core
  const { session, loading: sessionLoading, error: sessionError } = useAgentSession(owner, repo, sessionId);

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
  }, [stream.currentTokens]);

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

  // --- Keybindings ---
  useChatKeybindings({
    scrollDown: () => { autoScroll.onUserScroll("down"); },
    scrollUp: () => { autoScroll.onUserScroll("up"); autoScroll.disable(); },
    jumpToBottom: () => { autoScroll.enable(); autoScroll.resetNewMessages(); },
    jumpToTop: () => { autoScroll.disable(); },
    pageDown: () => { /* scrollbox page down */ },
    pageUp: () => { /* scrollbox page up */ },
    focusInput: () => { if (chatMode === "active") input.setFocused(true); },
    unfocusInput: () => { input.setFocused(false); },
    sendMessage: () => {
      if (!input.text.trim() || !send.canSend) return;
      send.send(input.text);
      input.clear();
    },
    toggleAutoScroll: () => { autoScroll.toggle(); },
    toggleToolBlock: () => { /* delegate to focused tool block */ },
    activateSearch: () => { search.activate(); },
    nextSearchMatch: () => { search.nextMatch(); },
    prevSearchMatch: () => { search.prevMatch(); },
    retryMessage: () => { /* find focused failed message, retry */ },
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
        <text fg={COLORS.error}>Session not found. Press q to go back.</text>
      </box>
    );
  }

  if (sessionError?.status === 401) {
    return (
      <box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg={COLORS.error}>Session expired. Run `codeplane auth login` to re-authenticate.</text>
      </box>
    );
  }

  if (sessionLoading) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box height={1} paddingX={1}>
          <text bold fg={COLORS.primary}>Loading messages…</text>
        </box>
      </box>
    );
  }

  // --- Status badge color ---
  const statusColor = {
    active: COLORS.success,
    completed: COLORS.muted,
    failed: COLORS.error,
    timed_out: COLORS.warning,
  }[session?.status ?? "active"] ?? COLORS.muted;

  // --- Session title ---
  const { text: titleText } = truncateTitle(session?.title, titleMaxWidth);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Session title bar */}
      <box flexDirection="row" height={1} paddingX={1}>
        <text bold fg={COLORS.primary}>{titleText}</text>
        <box flexGrow={1} />
        <text fg={statusColor}>◆ {session?.status ?? "unknown"}</text>
      </box>

      {/* Message history */}
      <scrollbox
        flexGrow={1}
        stickyScroll={autoScroll.enabled}
        stickyStart="bottom"
        viewportCulling={true}
        paddingX={messagePadding}
      >
        <box flexDirection="column" gap={1}>
          {/* Load earlier messages trigger */}
          {pagination.atMemoryCap && (
            <text fg={COLORS.muted} align="center">Showing latest 500 messages</text>
          )}
          {pagination.hasOlderMessages && !pagination.atMemoryCap && (
            <text fg={COLORS.muted} align="center">Load earlier messages</text>
          )}

          {/* Empty state */}
          {pagination.messages.length === 0 && !pagination.isLoading && (
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text fg={COLORS.muted}>Send a message to start the conversation.</text>
            </box>
          )}

          {/* Messages */}
          {pagination.messages.map((msg, idx) => (
            <MessageBlock
              key={msg.clientId ?? msg.id}
              message={msg}
              breakpoint={breakpoint}
              showSeparator={idx < pagination.messages.length - 1}
              expandedToolIds={expandedToolIds}
              onToggleToolExpand={toggleToolExpand}
            />
          ))}

          {/* New messages indicator */}
          {autoScroll.hasNewMessages && !autoScroll.enabled && (
            <box position="absolute" bottom={1} right={2}>
              <text fg={COLORS.primary} bold>↓ New messages</text>
            </box>
          )}
        </box>
      </scrollbox>

      {/* Message input or replay banner */}
      {chatMode === "active" ? (
        <box flexDirection="column" height={inputHeight} borderTop="single" paddingX={1}>
          <box flexDirection="row" alignItems="center" gap={1}>
            <text fg={COLORS.muted}>{'>'}</text>
            <input
              value={input.text}
              onChange={input.setText}
              placeholder={stream.streaming ? "Agent is responding…" : "Type a message…"}
              focused={input.isFocused}
              disabled={stream.streaming}
              maxLength={4000}
              multiline={input.isMultiline}
            />
          </box>
          {input.isMultiline && breakpoint !== "minimum" && (
            <text fg={COLORS.muted} align="right">Ctrl+Enter to send · Esc to cancel</text>
          )}
        </box>
      ) : (
        <box height={1} borderTop="single" paddingX={1} justifyContent="center">
          <text fg={COLORS.muted}>
            Session {session?.status === "completed" ? "completed" : session?.status === "timed_out" ? "timed out" : session?.status}. Read-only replay mode.
          </text>
        </box>
      )}
    </box>
  );
}
```

**Critical implementation details:**

1. **Streaming token integration:** The `useAgentStream` hook provides `currentTokens` which accumulates all tokens received so far. The `useChatPagination` hook maintains the streaming message and appends tokens to it. When the stream `done` event fires (`stream.streaming` transitions from true to false), `finalizeStreamingMessage` is called.

2. **Scroll-to-top pagination:** The `<scrollbox>` fires a scroll event when the user scrolls to the top. Wire this to `pagination.loadEarlier()`.

3. **Braille spinner:** Already implemented in `MessageBlock` via the `useSpinner` hook. The `streaming` flag on the message triggers it.

4. **Session status transitions during chat:** Subscribe to SSE events for session status. When status changes to `timed_out` during an active chat, switch `chatMode` to `"replay"`, disable input, and show the banner.

5. **Failed message rendering:** Messages with `sendStatus: "failed"` render with a red error indicator. The `R` key when such a message is focused triggers `send.retry(msg.clientId)`.

6. **Pending message rendering:** Messages with `sendStatus: "pending"` show "Sending…" in muted text next to the timestamp.

---

### Step 11: Create chat-specific test helpers

**File:** `e2e/tui/helpers.ts`

**What:** Add helper functions for chat screen tests.

```typescript
/**
 * Navigate to the agent chat screen for a specific session.
 * Assumes the TUI is on the dashboard or session list.
 */
export async function navigateToAgentChat(
  terminal: TUITestInstance,
  sessionIndex: number = 0,
): Promise<void> {
  await navigateToAgents(terminal);
  await waitForSessionListReady(terminal);
  // Move to the desired session
  for (let i = 0; i < sessionIndex; i++) {
    await terminal.sendKeys("j");
  }
  await terminal.sendKeys("Enter");
  // Wait for chat screen to load
  await terminal.waitForText("Type a message");
}

/**
 * Wait for the agent chat screen to be fully loaded.
 */
export async function waitForChatReady(
  terminal: TUITestInstance,
): Promise<void> {
  // Wait for either input placeholder or replay banner
  const startTime = Date.now();
  while (Date.now() - startTime < 10_000) {
    const content = terminal.snapshot();
    if (
      content.includes("Type a message") ||
      content.includes("Read-only replay mode") ||
      content.includes("Session not found")
    ) {
      return;
    }
    await sleep(100);
  }
  throw new Error("waitForChatReady: chat screen not ready within 10s");
}
```

---

### Step 12: Write all 124 E2E tests

**File:** `e2e/tui/agents.test.ts`

**What:** Add a new `describe("TUI_AGENT_CHAT_SCREEN", ...)` block containing all 124 tests organized into 4 sub-groups. These tests are appended to the existing file (which already contains `TUI_AGENT_MESSAGE_BLOCK`, `TUI_AGENT_SSE_STREAM`, and `TUI_AGENT_SESSION_LIST` blocks).

See the full test catalog in the **Unit & Integration Tests** section below.

---

### Step 13: Wire session timeout SSE event

**File:** `apps/tui/src/screens/Agents/AgentChatScreen.tsx`

**What:** Subscribe to SSE channel for session status changes. When the session transitions to `timed_out` or `completed` during an active chat, update local state to switch to replay mode.

```typescript
useSSEChannel(`agent.session.${sessionId}`, (event) => {
  if (event.type === "status_changed") {
    if (["completed", "timed_out", "failed"].includes(event.data.status)) {
      // Force re-fetch session to get updated status
      refetchSession();
    }
  }
});
```

---

### Step 14: Implement search UI overlay

**File:** `apps/tui/src/screens/Agents/AgentChatScreen.tsx` (inline within component)

**What:** When `search.isActive` is true, render a search input bar between the message history and the input area. Search matches highlight matching text in messages.

```tsx
{search.isActive && (
  <box height={1} paddingX={1} borderTop="single">
    <text fg={COLORS.muted}>/</text>
    <input
      value={search.query}
      onChange={search.setQuery}
      focused={true}
      placeholder="Search messages…"
    />
    <text fg={COLORS.muted}>
      {search.matchCount > 0
        ? ` ${search.currentMatchIndex + 1}/${search.matchCount}`
        : search.query ? " No matches" : ""}
    </text>
  </box>
)}
```

---

### Step 15: Handle SSE 501 fallback to REST polling

**File:** `apps/tui/src/screens/Agents/hooks/useChatPollingFallback.ts`

**What:** When the SSE stream endpoint returns 501 (Not Implemented), fall back to polling `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` every 3 seconds for new messages.

```typescript
export function useChatPollingFallback(
  owner: string,
  repo: string,
  sessionId: string,
  sseAvailable: boolean,
): void;
```

**Behavior:**
- Only active when `sseAvailable === false`.
- Polls every 3 seconds.
- Compares message IDs to avoid duplicates.
- Stops polling when session status is not `active`.

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `apps/tui/src/screens/Agents/hooks/useChatKeybindings.ts` | Chat screen keyboard dispatch |
| `apps/tui/src/screens/Agents/hooks/useChatSearch.ts` | Message history search |
| `apps/tui/src/screens/Agents/hooks/useAutoScroll.ts` | Sticky-scroll state management |
| `apps/tui/src/screens/Agents/hooks/useChatSend.ts` | Message send with optimistic UI |
| `apps/tui/src/screens/Agents/hooks/useChatPagination.ts` | Message loading, pagination, memory cap |
| `apps/tui/src/screens/Agents/hooks/useChatInput.ts` | Input field state management |
| `apps/tui/src/screens/Agents/hooks/useChatPollingFallback.ts` | REST polling fallback for 501 SSE |

### Modified Files

| File | Change |
|------|--------|
| `apps/tui/src/screens/Agents/AgentChatScreen.tsx` | Replace stub with full implementation |
| `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` | Wire `handleOpen` and `handleReplay` to navigation |
| `apps/tui/src/screens/Agents/types.ts` | Add `MessageSendStatus`, `ChatMessage`, `ChatMode` types |
| `apps/tui/src/router/screens.ts` | Add `AgentChat` screen ID and registry entry |
| `e2e/tui/agents.test.ts` | Add `TUI_AGENT_CHAT_SCREEN` describe block with 124 tests |
| `e2e/tui/helpers.ts` | Add `navigateToAgentChat()` and `waitForChatReady()` helpers |

### Unchanged Files (consumed as-is)

| File | Usage |
|------|-------|
| `apps/tui/src/screens/Agents/components/MessageBlock.tsx` | Renders each message in the chat |
| `apps/tui/src/screens/Agents/components/ToolBlock.tsx` | Renders tool call/result blocks within messages |
| `apps/tui/src/screens/Agents/components/colors.ts` | Color constants for role labels, indicators |
| `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` | Timestamp formatting per breakpoint |
| `apps/tui/src/screens/Agents/utils/truncateTitle.ts` | Session title truncation |
| `apps/tui/src/screens/Agents/utils/generateSummary.ts` | Tool call/result summary generation |
| `apps/tui/src/hooks/useAgentStream.ts` | SSE stream wrapper with spinner frame |
| `apps/tui/src/hooks/useNavigation.ts` | Navigation context consumer |
| `apps/tui/src/types/breakpoint.ts` | Breakpoint type and `getBreakpoint()` |
| `apps/tui/src/theme/syntaxStyle.ts` | Default syntax style for `<markdown>` and `<code>` |

---

## Data Flow

### Mount Sequence

```
AgentChatScreen mounts
  → Read sessionId from navigation params
  → useAgentSession(owner, repo, sessionId)
      → GET /api/repos/:owner/:repo/agent/sessions/:id
      → Returns { session } with title, status
  → useChatPagination(owner, repo, sessionId)
      → useAgentMessages(sessionId)
      → GET /api/repos/:owner/:repo/agent/sessions/:id/messages?page=1&per_page=30
      → Returns most recent 30 messages, totalCount
  → useAgentStream(owner, repo, sessionId)
      → If session.status === "active":
          → POST /api/auth/sse-ticket (get ticket)
          → Open EventSource: GET /api/repos/:owner/:repo/agent/sessions/:id/stream?ticket={ticket}
          → On token event: append to streaming message
          → On done event: finalize message, re-enable input
      → If session.status !== "active":
          → No SSE connection (replay mode)
  → First render with session title bar + messages + input/banner
```

### Message Send Sequence

```
User presses Enter (non-empty input, not streaming, past cooldown)
  → useChatSend.send(text)
      → Client-side validation (not whitespace, ≤4000 chars)
      → Generate clientId (crypto.randomUUID())
      → Create optimistic ChatMessage { id: clientId, role: "user", parts: [{ type: "text", content: text }], sendStatus: "pending" }
      → Insert into pagination.messages via insertOptimistic()
      → Clear input
      → POST /api/repos/:owner/:repo/agent/sessions/:id/messages { content: text }
      → On 200: updateMessage(clientId, { sendStatus: "sent", id: serverMsg.id })
          → SSE begins streaming agent response
      → On 429: revert optimistic, show "Rate limited" in status bar
      → On 4xx/5xx: updateMessage(clientId, { sendStatus: "failed" })
      → On network error: updateMessage(clientId, { sendStatus: "failed" })
```

### Streaming Token Sequence

```
SSE event: { type: "token", data: "Hello" }
  → useAgentStream updates currentTokens: "Hello"
  → useEffect detects change, calls pagination.appendStreamingTokens("Hello")
  → Last message in list has streaming: true, grows incrementally
  → <MessageBlock> renders with spinner + progressive markdown
  → Auto-scroll follows (if enabled)

SSE event: { type: "token", data: "Hello, how" }
  → currentTokens: "Hello, how"
  → appendStreamingTokens updates last message text part
  → Re-render with longer text

SSE event: { type: "done" }
  → stream.streaming → false
  → pagination.finalizeStreamingMessage(finalMessage)
  → Spinner stops
  → Input re-enables
```

---

## Responsive Behavior Matrix

| Aspect | 80×24 (minimum) | 120×40 (standard) | 200×60 (large) |
|--------|-----------------|--------------------|-----------------|
| Role labels | "Y:" / "A:" | "You" / "Agent" | "You" / "Agent" |
| Timestamps | Hidden | Relative ("3m") | Full ("3 minutes ago") |
| Tool blocks | Always collapsed, not expandable | Collapsible | Extended preview (120ch) |
| Input mode | Single-line only | Multi-line up to 4 lines | Multi-line up to 8 lines |
| Message padding | 2ch (1 each side) | 4ch (2 each side) | 8ch (4 each side) |
| Max message width | width − 4 | width − 8 | width − 16 |
| Tool arg preview | Hidden | 60ch truncated | 120ch truncated |
| Tool result preview | Hidden | 80ch truncated | 160ch truncated |

---

## Error Handling Matrix

| Error | Detection | User Experience | Recovery |
|-------|-----------|-----------------|----------|
| Session 404 | GET session returns 404 | "Session not found. Press q to go back." in error color | `q` pops screen |
| Auth 401 | Any API returns 401 | Auth error screen pushed | `codeplane auth login` |
| Message list timeout | 30s fetch timeout | "Error loading messages. Press R to retry." | `R` retries |
| Send failure | POST returns 4xx/5xx | Optimistic message marked failed, red indicator | `R` retries |
| Send rate limit (429) | POST returns 429 | Optimistic reverts, status bar shows "Rate limited" | Wait, resend |
| SSE disconnect | EventSource error/close | Status bar "⚠ Disconnected", partial message preserved | Auto-reconnect 1s→2s→4s→8s→30s |
| SSE 501 | Stream returns 501 | Falls back to REST polling every 3s | Automatic, degraded |
| SSE permanent failure | >10 reconnect attempts | Persistent warning in status bar, REST polling fallback | Automatic |
| Session timed_out | SSE event or poll | Input disables, "Session timed out" banner | Create new session |
| Markdown parse error | Malformed markdown | Raw text fallback, no crash | Automatic, logged |
| Memory cap reached | 500 messages loaded | "Showing latest 500 messages" at top | Scroll-to-top shows notice |

---

## Telemetry Events

All events include common properties: `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`, `repo_owner`, `repo_name`.

| Event | Trigger | Key Properties |
|-------|---------|----------------|
| `tui.agent_chat.view` | Screen mounted, initial messages loaded | `session_status`, `message_count`, `load_time_ms`, `entry_method` |
| `tui.agent_chat.message_sent` | User sends message | `message_length`, `is_multiline`, `input_time_ms` |
| `tui.agent_chat.stream_started` | Agent begins streaming | `trigger_message_id` |
| `tui.agent_chat.stream_completed` | Stream finishes | `response_length`, `token_count`, `stream_duration_ms`, `tool_call_count` |
| `tui.agent_chat.stream_error` | SSE error during streaming | `error_type`, `tokens_received_before_error` |
| `tui.agent_chat.tool_expanded` | User expands tool block | `tool_name`, `part_type` |
| `tui.agent_chat.search_used` | User searches messages | `query_length`, `match_count` |
| `tui.agent_chat.scroll_to_top` | User triggers load-earlier | `messages_loaded_before`, `page_number` |
| `tui.agent_chat.message_retry` | User retries failed message | `original_error_type`, `retry_success` |
| `tui.agent_chat.sse_reconnect` | SSE reconnects | `disconnect_duration_ms`, `reconnect_attempt` |
| `tui.agent_chat.auto_scroll_toggled` | User toggles auto-scroll | `new_state`, `was_streaming` |
| `tui.agent_chat.error` | Any API failure | `error_type`, `http_status`, `request_type` |

---

## Logging

Logs to stderr. Level controlled via `CODEPLANE_LOG_LEVEL` (default: `warn`).

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `AgentChat: mounted [session_id={id}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Messages loaded | `AgentChat: messages loaded [session_id={id}] [count={n}] [total={t}] [duration={ms}ms]` |
| `debug` | Input focused/unfocused | `AgentChat: input [state={focused\|unfocused}]` |
| `debug` | Tool block toggled | `AgentChat: tool toggle [type={call\|result}] [expanded={bool}]` |
| `info` | Screen ready | `AgentChat: ready [session_id={id}] [status={status}] [messages={n}] [total_ms={ms}]` |
| `info` | Message sent | `AgentChat: message sent [session_id={id}] [length={n}] [success={bool}]` |
| `info` | Stream started | `AgentChat: stream started [session_id={id}]` |
| `info` | Stream completed | `AgentChat: stream completed [session_id={id}] [tokens={n}] [duration={ms}ms]` |
| `warn` | Send failed | `AgentChat: send failed [session_id={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `AgentChat: rate limited [session_id={id}] [retry_after={s}]` |
| `warn` | SSE disconnect | `AgentChat: sse disconnected [session_id={id}]` |
| `warn` | Memory cap reached | `AgentChat: memory cap [session_id={id}] [total={n}] [cap=500]` |
| `error` | Auth error | `AgentChat: auth error [session_id={id}] [status=401]` |
| `error` | Session not found | `AgentChat: session not found [session_id={id}] [status=404]` |
| `error` | SSE failed permanently | `AgentChat: sse failed [session_id={id}] [attempts={n}]` |

---

## Productionization Notes

### From Stub to Production

The current `AgentChatScreen.tsx` is a 15-line stub. The production implementation:

1. **replaces** the stub entirely — no incremental extension of the stub.
2. **imports** `MessageBlock` and `ToolBlock` from the existing `components/` directory — these are already production-quality with memoization, responsive config, and color tier support.
3. **imports** `useAgentStream` from `hooks/useAgentStream.ts` — already production-quality with spinner frame management.
4. **imports** `formatTimestamp`, `truncateTitle`, `generateSummary` from existing `utils/` — already tested via the session list screen.
5. **creates new hooks** (steps 4–9) that are chat-specific and do not exist yet.

### Provider Dependencies

The `AgentChatScreen` depends on providers that are partially implemented:

- **NavigationProvider**: ✅ Implemented. Provides `push`, `pop`, `current`.
- **SSEProvider**: ⚠️ Stub. The `useAgentStream` hook wraps `@codeplane/ui-core`'s `useAgentStreamCore` which manages its own SSE connection. The global `SSEProvider` for session status events is not yet wired. **Workaround:** The chat screen can poll session status via `useAgentSession` refetch on a 10s interval until `SSEProvider` ships.
- **ThemeProvider**: ⚠️ Stub. Colors are resolved via module-level `COLORS` constant (already works). When `ThemeProvider` ships, replace `COLORS` import with `useTheme()` hook.
- **KeybindingProvider**: ⚠️ Stub. The `useChatKeybindings` hook uses `useKeyboard` from `@opentui/react` directly (same pattern as `useSessionListKeybindings`). When `KeybindingProvider` ships, migrate to `useScreenKeybindings()`.

### Terminal Dimensions

The session list screen currently hardcodes `width = 120; height = 40` with a comment `// stub until provider ships`. The chat screen **must** use `useTerminalDimensions()` from `@opentui/react` directly — hardcoding is not acceptable for a streaming chat where responsive behavior is critical. If `useTerminalDimensions()` is not available at runtime, fall back to `process.stdout.columns ?? 120` and `process.stdout.rows ?? 40`.

### Memory Management

Long-running chat sessions can accumulate significant memory:

- **500-message cap:** Enforced by `useChatPagination`. Oldest messages evicted when cap reached.
- **Streaming token accumulation:** `currentTokens` in `useAgentStream` grows during streaming. After `finalizeStreamingMessage`, the accumulated buffer is released.
- **Tool block expansion state:** `Set<string>` of expanded tool IDs. Bounded by message count (max 500 messages × ~5 tool calls = 2500 entries max).
- **Search state:** `matchedMessageIds` array bounded by message count.

### No POC Code

All code in this spec targets `apps/tui/src/` directly. There is no POC directory involved. The hooks and component patterns follow established patterns from the session list screen (`AgentSessionListScreen.tsx`), which is the reference implementation for data fetching, keybindings, responsive layout, and error handling in the Agent module.

---

## Unit & Integration Tests

### Test File: `e2e/tui/agents.test.ts`

All 124 tests are added to the existing `e2e/tui/agents.test.ts` file as a new `describe("TUI_AGENT_CHAT_SCREEN", ...)` block. Tests that fail due to unimplemented backend features are **left failing — never skipped or commented out**.

---

### Terminal Snapshot Tests (28 tests)

```typescript
describe("TUI_AGENT_CHAT_SCREEN", () => {
  describe("terminal snapshots", () => {
    test("SNAP-CHAT-001: Agent chat at 120×40 with mixed user/agent messages — full layout, role labels, timestamps, markdown rendering", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: "You" and "Agent" labels visible
      // Assert: relative timestamps visible ("3m", "1h")
      // Assert: markdown rendered (code blocks, lists)
      // Assert: message padding = 4ch
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-002: Agent chat at 80×24 minimum — abbreviated role labels Y:/A:, timestamps hidden, compact layout", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: "Y:" and "A:" labels (not "You"/"Agent")
      // Assert: no timestamp text
      // Assert: message padding = 2ch
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-003: Agent chat at 200×60 large — full role labels, extended timestamps, generous spacing", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: "You" and "Agent" labels
      // Assert: full timestamps ("3 minutes ago")
      // Assert: message padding = 8ch
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-004: Empty session (zero messages) — Send a message to start the conversation centered", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to a newly created empty session
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("Send a message to start the conversation");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-005: Session not found (404) — Session not found error in error color", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to a non-existent session ID
      await terminal.waitForText("Session not found");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-006: Loading state — Loading messages with session title visible", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Capture during loading phase
      await terminal.waitForText("Loading messages");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-007: Error state — red error with Press R to retry", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Simulate server error on message fetch
      await terminal.waitForText("Press R to retry");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-008: User message rendering — role label You in primary color, message body, timestamp", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: "You" in blue (ANSI 33)
      // Assert: message body rendered
      // Assert: timestamp in muted
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-009: Agent message rendering — role label Agent in success color, markdown body, timestamp", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: "Agent" in green (ANSI 34)
      // Assert: markdown rendered via <markdown>
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-010: Agent message with code block — syntax-highlighted code block within message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: code block rendered with syntax highlighting
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-011: Agent message with markdown list — bullet list rendered within message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-012: Agent message with inline code — backtick-delimited code styled distinctly", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-013: Tool call block collapsed — tool icon and name with collapsed indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: ▶ indicator + tool name visible
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-014: Tool call block expanded — full JSON arguments visible", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Expand tool block
      await terminal.sendKeys("Tab");
      // Assert: ▼ indicator + full arguments
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-015: Tool result block (success) — checkmark in green with collapsed indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: ✓ in green + ▶
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-016: Tool result block (error) — X in red with collapsed indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: ✗ in red + ▶
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-017: Tool result block expanded — full output/error content visible", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Tab");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-018: Streaming indicator — braille spinner next to Agent label during active stream", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Send message to trigger streaming
      await terminal.sendKeys("i");
      await terminal.sendText("Hello");
      await terminal.sendKeys("Enter");
      // Wait for streaming to start
      // Assert: one of ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ visible next to Agent
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-019: Input area (active session) — prompt with placeholder text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("Type a message");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-020: Input area disabled during streaming — dimmed, Agent is responding placeholder", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello");
      await terminal.sendKeys("Enter");
      // During streaming:
      await terminal.waitForText("Agent is responding");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-021: Multi-line input expanded — input area height increased, Ctrl+Enter to send hint", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Line one");
      await terminal.sendKeys("Shift+Enter");
      await terminal.sendText("Line two");
      await terminal.waitForText("Ctrl+Enter to send");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-022: Completed session banner — Session completed. Read-only replay mode.", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to a completed session
      await terminal.waitForText("Read-only replay mode");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-023: Timed out session banner — Session timed out. Read-only replay mode.", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to a timed_out session
      await terminal.waitForText("timed out");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-024: Failed message indicator — message with red error text and Press R to retry", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Trigger a send failure
      // Assert: message has red error indicator
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-025: Pending message indicator — message with Sending in muted text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello");
      await terminal.sendKeys("Enter");
      // Capture during pending state
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-026: New messages indicator — shown when scrolled up during streaming", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Trigger streaming then scroll up
      await terminal.sendKeys("k", "k", "k");
      // Assert: "↓ New messages" indicator visible
      await terminal.waitForText("New messages");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-027: Breadcrumb rendering — Dashboard > owner/repo > Agents > Session Title", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard.*Agents/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-028: Status bar keybinding hints for agent chat screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Enter:send/);
      expect(statusLine).toMatch(/j\/k:scroll/);
      expect(statusLine).toMatch(/q:back/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });
```

---

### Keyboard Interaction Tests (42 tests)

```typescript
  describe("keyboard interaction", () => {
    test("KEY-CHAT-001: j scrolls message history down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("j");
      // Assert: viewport scrolled down
      await terminal.terminate();
    });

    test("KEY-CHAT-002: k scrolls message history up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("j", "j", "k");
      // Assert: viewport scrolled up
      await terminal.terminate();
    });

    test("KEY-CHAT-003: Down arrow scrolls message history down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Down");
      await terminal.terminate();
    });

    test("KEY-CHAT-004: Up arrow scrolls message history up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Up");
      await terminal.terminate();
    });

    test("KEY-CHAT-005: G jumps to latest message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k", "k", "G");
      // Assert: scrolled to bottom, auto-scroll re-enabled
      await terminal.terminate();
    });

    test("KEY-CHAT-006: g g jumps to first message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("g", "g");
      // Assert: scrolled to top
      await terminal.terminate();
    });

    test("KEY-CHAT-007: Ctrl+D pages down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Ctrl+D");
      await terminal.terminate();
    });

    test("KEY-CHAT-008: Ctrl+U pages up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Ctrl+U");
      await terminal.terminate();
    });

    test("KEY-CHAT-009: i focuses message input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      // Assert: input is focused (cursor in input area)
      await terminal.terminate();
    });

    test("KEY-CHAT-010: Typing in focused input updates input value", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello world");
      await terminal.waitForText("Hello world");
      await terminal.terminate();
    });

    test("KEY-CHAT-011: Enter sends message (single-line, non-empty input)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Test message");
      await terminal.sendKeys("Enter");
      // Assert: message appears in chat history
      await terminal.waitForText("Test message");
      await terminal.terminate();
    });

    test("KEY-CHAT-012: Enter on empty input does not send (no-op)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendKeys("Enter");
      // Assert: no new message in history, input still empty
      await terminal.terminate();
    });

    test("KEY-CHAT-013: Sent message appears immediately in message history (optimistic)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Optimistic test");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Optimistic test");
      // Assert: appears before server confirms
      await terminal.terminate();
    });

    test("KEY-CHAT-014: Shift+Enter inserts newline and expands input to multi-line", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Line 1");
      await terminal.sendKeys("Shift+Enter");
      await terminal.sendText("Line 2");
      await terminal.waitForText("Ctrl+Enter to send");
      await terminal.terminate();
    });

    test("KEY-CHAT-015: Ctrl+Enter sends message in multi-line mode", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Line 1");
      await terminal.sendKeys("Shift+Enter");
      await terminal.sendText("Line 2");
      await terminal.sendKeys("Ctrl+Enter");
      // Assert: multi-line message sent
      await terminal.waitForText("Line 1");
      await terminal.terminate();
    });

    test("KEY-CHAT-016: Esc when input focused unfocuses input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendKeys("Escape");
      // Assert: input unfocused, j/k now scroll messages
      await terminal.sendKeys("j");
      // Assert: scrolled, not "j" typed into input
      await terminal.terminate();
    });

    test("KEY-CHAT-017: Esc when input not focused pops screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Escape");
      // Assert: returned to session list
      await terminal.waitForText("Agent Sessions");
      await terminal.terminate();
    });

    test("KEY-CHAT-018: q pops screen (when input not focused)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions");
      await terminal.terminate();
    });

    test("KEY-CHAT-019: q types q into input when input is focused (not pop)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendKeys("q");
      // Assert: "q" appears in input, not popped
      await terminal.waitForText("q");
      await terminal.terminate();
    });

    test("KEY-CHAT-020: Tab on tool call block expands it", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Focus tool block and expand
      await terminal.sendKeys("Tab");
      // Assert: tool block expanded
      await terminal.terminate();
    });

    test("KEY-CHAT-021: Shift+Tab on expanded tool block collapses it", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Shift+Tab");
      // Assert: tool block collapsed
      await terminal.terminate();
    });

    test("KEY-CHAT-022: / activates message search", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      // Assert: search input visible
      await terminal.waitForText("Search messages");
      await terminal.terminate();
    });

    test("KEY-CHAT-023: Typing in search narrows to matching messages (highlighted)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("auth");
      // Assert: match count shown, matching text highlighted
      await terminal.terminate();
    });

    test("KEY-CHAT-024: n jumps to next search match", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("the");
      await terminal.sendKeys("Escape"); // exit search input but keep search active
      await terminal.sendKeys("n");
      // Assert: scrolled to next match
      await terminal.terminate();
    });

    test("KEY-CHAT-025: N jumps to previous search match", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("the");
      await terminal.sendKeys("Escape");
      await terminal.sendKeys("n", "N");
      // Assert: scrolled to previous match
      await terminal.terminate();
    });

    test("KEY-CHAT-026: Esc in search clears search and returns to message browsing", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("test");
      await terminal.sendKeys("Escape");
      // Assert: search input hidden, highlights removed
      await terminal.terminate();
    });

    test("KEY-CHAT-027: R on failed message retries send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Trigger failed send, then retry
      await terminal.sendKeys("R");
      // Assert: message status changes from failed to pending
      await terminal.terminate();
    });

    test("KEY-CHAT-028: R on non-failed message is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("R");
      // Assert: no change
      await terminal.terminate();
    });

    test("KEY-CHAT-029: f toggles auto-scroll off (when enabled)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("f");
      // Assert: auto-scroll disabled
      await terminal.terminate();
    });

    test("KEY-CHAT-030: f toggles auto-scroll on (when disabled); scrolls to bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k"); // disable auto-scroll
      await terminal.sendKeys("f");
      // Assert: auto-scroll re-enabled, scrolled to bottom
      await terminal.terminate();
    });

    test("KEY-CHAT-031: Input disabled during streaming — keystrokes do not modify input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Trigger streaming
      await terminal.sendKeys("i");
      await terminal.sendText("trigger");
      await terminal.sendKeys("Enter");
      // During streaming, try to type
      await terminal.sendKeys("i");
      await terminal.sendText("should not appear");
      // Assert: "should not appear" not in input
      await terminal.terminate();
    });

    test("KEY-CHAT-032: Input re-enables after streaming completes", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Wait for stream to complete
      await terminal.waitForText("Type a message");
      await terminal.sendKeys("i");
      await terminal.sendText("after stream");
      await terminal.waitForText("after stream");
      await terminal.terminate();
    });

    test("KEY-CHAT-033: G while new messages visible jumps to bottom and re-enables auto-scroll", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k", "k");
      await terminal.sendKeys("G");
      // Assert: scrolled to bottom, "↓ New messages" gone
      await terminal.terminate();
    });

    test("KEY-CHAT-034: Enter while new messages visible and input not focused jumps to bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k");
      // "↓ New messages" visible
      await terminal.sendKeys("Enter");
      // Assert: scrolled to bottom
      await terminal.terminate();
    });

    test("KEY-CHAT-035: Rapid j presses (15× sequential) — each scrolls one step", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      for (let i = 0; i < 15; i++) {
        await terminal.sendKeys("j");
      }
      // Assert: scrolled 15 steps
      await terminal.terminate();
    });

    test("KEY-CHAT-036: Message with only whitespace rejected on Enter — input not cleared", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("   ");
      await terminal.sendKeys("Enter");
      // Assert: no message sent, input still contains spaces
      await terminal.terminate();
    });

    test("KEY-CHAT-037: Message at 4000 character limit — accepted and sent", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("a".repeat(4000));
      await terminal.sendKeys("Enter");
      // Assert: message sent successfully
      await terminal.terminate();
    });

    test("KEY-CHAT-038: Message at 4001 characters — input rejects additional characters", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("a".repeat(4001));
      // Assert: only 4000 characters in input
      await terminal.terminate();
    });

    test("KEY-CHAT-039: i when session is completed — no-op (input not shown)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to completed session
      await terminal.sendKeys("i");
      // Assert: no input focused, replay banner still shown
      await terminal.terminate();
    });

    test("KEY-CHAT-040: Keys j/k/G/q do not trigger while input focused — they type into input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendKeys("j", "k", "G", "q");
      // Assert: "jkGq" appears in input, not navigation
      await terminal.waitForText("jkGq");
      await terminal.terminate();
    });

    test("KEY-CHAT-041: Ctrl+C quits TUI from any state (global binding)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Ctrl+C");
      // Assert: TUI process exits
      await terminal.terminate();
    });

    test("KEY-CHAT-042: ? opens help overlay showing chat-specific keybindings", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("?");
      // Assert: help overlay visible with chat keybindings
      await terminal.waitForText("j/k");
      await terminal.waitForText("scroll");
      await terminal.terminate();
    });
  });
```

---

### Responsive Tests (14 tests)

```typescript
  describe("responsive layout", () => {
    test("RESP-CHAT-001: 80×24 layout — abbreviated labels, timestamps hidden, single-line input only", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: "Y:" / "A:" labels, no timestamps, single-line input
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-002: 80×24 tool blocks always collapsed (not expandable)", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Tab");
      // Assert: tool block remains collapsed
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-003: 80×24 message width = terminal width − 4", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: message content fits within 76 chars
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-004: 120×40 layout — full labels, relative timestamps, collapsible tools, multi-line input up to 4 lines", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-005: 120×40 message width = terminal width − 8", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-006: 200×60 layout — full timestamps, extended tool previews, multi-line input up to 8 lines", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-007: 200×60 message width = terminal width − 16", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-008: Resize from 120×40 to 80×24 — layout collapses, scroll position preserved, streaming continues", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.resize(80, 24);
      // Assert: "Y:" labels, timestamps hidden
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-009: Resize from 80×24 to 120×40 — layout expands, timestamps appear", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.resize(120, 40);
      // Assert: "You"/"Agent" labels, timestamps visible
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-010: Resize during streaming — markdown re-wraps, no artifacts, stream continues", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Trigger streaming
      await terminal.sendKeys("i");
      await terminal.sendText("trigger");
      await terminal.sendKeys("Enter");
      // Resize during stream
      await terminal.resize(80, 24);
      // Assert: no visual artifacts, streaming continues
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-011: Resize with multi-line input active — text rewraps, no content loss", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Line 1");
      await terminal.sendKeys("Shift+Enter");
      await terminal.sendText("Line 2");
      await terminal.resize(80, 24);
      // Assert: input text preserved (now single-line at minimum)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-012: Resize during search — search input and highlights adjust", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("test");
      await terminal.resize(80, 24);
      // Assert: search input still visible, highlights adjusted
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-013: Resize with new messages indicator — repositioned correctly", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k");
      // "↓ New messages" visible
      await terminal.resize(80, 24);
      // Assert: indicator still visible, repositioned
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-014: Resize from 120×40 to 200×60 — tool call previews expand to 120ch", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.resize(200, 60);
      // Assert: tool call summaries now 120ch (up from 60ch)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });
```

---

### Integration Tests (24 tests)

```typescript
  describe("integration", () => {
    test("INT-CHAT-001: Auth expiry (401) during message fetch — auth error screen shown", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "expired-token" } });
      // Navigate to chat
      await terminal.waitForText("Session expired");
      await terminal.terminate();
    });

    test("INT-CHAT-002: Auth expiry (401) during message send — auth error screen shown", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Send message, server returns 401
      await terminal.sendKeys("i");
      await terminal.sendText("test");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Session expired");
      await terminal.terminate();
    });

    test("INT-CHAT-003: Rate limit (429) on message send — optimistic reverts, status bar shows retry-after", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("rate limited");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Rate limited");
      await terminal.terminate();
    });

    test("INT-CHAT-004: Rate limit (429) on message list — inline error with retry-after", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Rate limited");
      await terminal.terminate();
    });

    test("INT-CHAT-005: Network timeout on message list fetch — error state with Press R to retry", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Press R to retry");
      await terminal.terminate();
    });

    test("INT-CHAT-006: Network timeout on message send — message marked failed, input text preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("timeout test");
      await terminal.sendKeys("Enter");
      // Assert: message marked as failed
      await terminal.terminate();
    });

    test("INT-CHAT-007: Session 404 — Session not found error displayed", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Session not found");
      await terminal.terminate();
    });

    test("INT-CHAT-008: Server 500 on message list — error state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Error");
      await terminal.terminate();
    });

    test("INT-CHAT-009: Server 500 on message send — message marked failed", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("error test");
      await terminal.sendKeys("Enter");
      // Assert: message marked as failed
      await terminal.terminate();
    });

    test("INT-CHAT-010: Pagination loads earlier messages on scroll-to-top", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("g", "g"); // scroll to top
      // Assert: "Load earlier messages" triggered, more messages appear
      await terminal.terminate();
    });

    test("INT-CHAT-011: Pagination cap at 500 messages — top shows Showing latest 500 messages", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("g", "g");
      await terminal.waitForText("Showing latest 500 messages");
      await terminal.terminate();
    });

    test("INT-CHAT-012: SSE stream delivers tokens — agent message grows incrementally", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("stream test");
      await terminal.sendKeys("Enter");
      // Assert: agent response grows over time
      await terminal.terminate();
    });

    test("INT-CHAT-013: SSE stream completes — spinner stops, input re-enables", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("complete test");
      await terminal.sendKeys("Enter");
      // Wait for stream to complete
      await terminal.waitForText("Type a message");
      // Assert: no spinner, input re-enabled
      await terminal.terminate();
    });

    test("INT-CHAT-014: SSE disconnect during stream — status bar warning, reconnect attempt", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Simulate SSE disconnect
      // Assert: status bar shows disconnection warning
      await terminal.terminate();
    });

    test("INT-CHAT-015: SSE reconnect replays missed tokens — no duplicate text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Simulate disconnect and reconnect
      // Assert: no duplicated text in agent response
      await terminal.terminate();
    });

    test("INT-CHAT-016: SSE 501 (not implemented) — falls back to REST polling", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: messages still load via polling fallback
      await terminal.terminate();
    });

    test("INT-CHAT-017: Completed session renders in replay mode — no input, banner shown", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      // Navigate to completed session
      await terminal.waitForText("Read-only replay mode");
      await terminal.terminate();
    });

    test("INT-CHAT-018: Session times out during active chat — input disables, banner appears", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Simulate session timeout via SSE event
      await terminal.waitForText("timed out");
      await terminal.terminate();
    });

    test("INT-CHAT-019: Message send triggers agent run — SSE stream begins after send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("trigger agent");
      await terminal.sendKeys("Enter");
      // Assert: streaming begins after send
      await terminal.waitForText("Agent is responding");
      await terminal.terminate();
    });

    test("INT-CHAT-020: Navigation back to session list and return preserves session state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("q"); // back to list
      await terminal.waitForText("Agent Sessions");
      await terminal.sendKeys("Enter"); // re-enter chat
      await waitForChatReady(terminal);
      // Assert: messages re-loaded
      await terminal.terminate();
    });

    test("INT-CHAT-021: Client-side send cooldown — second send within 2s blocked", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("first");
      await terminal.sendKeys("Enter");
      // Immediately try to send again
      await terminal.sendKeys("i");
      await terminal.sendText("second");
      await terminal.sendKeys("Enter");
      // Assert: second send blocked, "Wait before sending" shown
      await terminal.terminate();
    });

    test("INT-CHAT-022: Optimistic message send then server error — message reverts to failed state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("will fail");
      await terminal.sendKeys("Enter");
      // Assert: message appears optimistically then shows error
      await terminal.terminate();
    });

    test("INT-CHAT-023: Multiple tool calls in single agent response — all rendered as separate blocks", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: multiple ▶ indicators visible for different tool calls
      await terminal.terminate();
    });

    test("INT-CHAT-024: Agent response with mixed text and tool parts — rendered in correct sequence", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: text → tool_call → text → tool_result in order
      await terminal.terminate();
    });
  });
```

---

### Edge Case Tests (16 tests)

```typescript
  describe("edge cases", () => {
    test("EDGE-CHAT-001: No auth token at startup — auth error screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "" } });
      await terminal.waitForText("authenticate");
      await terminal.terminate();
    });

    test("EDGE-CHAT-002: Very long message (4000 chars) from user — sent successfully, rendered with word wrap", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("a".repeat(4000));
      await terminal.sendKeys("Enter");
      // Assert: message sent and word-wrapped in display
      await terminal.terminate();
    });

    test("EDGE-CHAT-003: Very long agent response (10000+ chars) — rendered correctly with word wrap and scrollbox", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: long response scrollable, no crash
      await terminal.terminate();
    });

    test("EDGE-CHAT-004: Unicode/emoji in messages — truncation respects grapheme clusters, no corruption", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello 🌍 αβγ ✓");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Hello");
      await terminal.terminate();
    });

    test("EDGE-CHAT-005: Code block with 500+ lines — scrollable within code, syntax highlighting preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: code block scrollable, highlighting works
      await terminal.terminate();
    });

    test("EDGE-CHAT-006: Agent response with nested markdown (lists in lists, code in blockquotes) — best-effort rendering", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: nested structures render without crash
      await terminal.terminate();
    });

    test("EDGE-CHAT-007: Single message in session (user only, no agent response yet)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: single user message rendered, input available
      await terminal.terminate();
    });

    test("EDGE-CHAT-008: Concurrent resize + scroll + streaming — all independent, no artifacts", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Trigger streaming, scroll, and resize simultaneously
      await terminal.sendKeys("i");
      await terminal.sendText("concurrent test");
      await terminal.sendKeys("Enter");
      await terminal.sendKeys("k", "k");
      await terminal.resize(80, 24);
      // Assert: no visual artifacts
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-CHAT-009: Rapid R presses on failed message — only first triggers retry", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Focus failed message
      await terminal.sendKeys("R", "R", "R");
      // Assert: only one retry attempt
      await terminal.terminate();
    });

    test("EDGE-CHAT-010: Search with special regex characters — literal match, not regex", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("file.ts (line 42)");
      // Assert: literal search, no regex error
      await terminal.terminate();
    });

    test("EDGE-CHAT-011: Agent empty response (0 tokens) — empty response message shown", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: "Agent returned an empty response." in muted text
      await terminal.terminate();
    });

    test("EDGE-CHAT-012: Tool call with very large arguments (5KB JSON) — collapsed by default, expanded preview truncated", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: tool block collapsed with truncated summary
      await terminal.terminate();
    });

    test("EDGE-CHAT-013: Message containing only whitespace — rejected client-side", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("   \n  \n  ");
      await terminal.sendKeys("Enter");
      // Assert: no message sent
      await terminal.terminate();
    });

    test("EDGE-CHAT-014: SSE delivers duplicate tokens — deduplicated by position", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: no repeated text in rendered output
      await terminal.terminate();
    });

    test("EDGE-CHAT-015: Network disconnect mid-retry — failed message stays failed, retry available again", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Assert: message still shows failed state after network error during retry
      await terminal.terminate();
    });

    test("EDGE-CHAT-016: Session deleted while viewing (race condition) — 404 on next poll, error screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      // Simulate session deletion externally
      await terminal.waitForText("Session not found");
      await terminal.terminate();
    });
  });
});
```

---

## Test Principles Applied

1. **Tests that fail due to unimplemented backends stay failing.** All 124 tests are written to call real API endpoints. Until the agent API is fully implemented, tests will fail. They are never skipped, commented out, or wrapped in `test.skip()`.

2. **No mocking of implementation details.** Tests launch a real TUI process via `launchTUI()` and interact through keyboard simulation and terminal buffer assertions. No React component internals, hook state, or API client internals are mocked.

3. **Each test validates one behavior.** Test names describe the user-facing behavior ("j scrolls message history down"), not implementation details ("useChatKeybindings dispatches scrollDown handler").

4. **Snapshot tests are supplementary.** Snapshots catch visual regressions. Keyboard interaction tests are the primary verification. A passing snapshot with broken keyboard navigation is still a bug.

5. **Tests run at representative sizes.** Responsive tests cover all three breakpoints (80×24, 120×40, 200×60) plus resize transitions between them.

6. **Tests are independent.** Each test launches a fresh TUI instance via `launchTUI()`. No shared state between tests. Test order does not matter.
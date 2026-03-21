# TUI_AGENT_CHAT_SCREEN

Specification for TUI_AGENT_CHAT_SCREEN.

## High-Level User POV

The Agent Chat screen is the primary conversational interface for AI agent interactions in the Codeplane TUI. It provides a full-screen, real-time chat experience where developers can send messages to an AI agent scoped to a repository and receive streaming responses — all without leaving the terminal. The screen is reached by pressing `Enter` on a session in the agent session list (`TUI_AGENT_SESSION_LIST`), by navigating via `g a` and selecting a session, or by creating a new session via `TUI_AGENT_SESSION_CREATE`. The screen requires a repository context because agent sessions are scoped to a specific repository.

The screen is divided into two vertical zones: a scrollable message history occupying the majority of the content area, and a fixed message input region anchored to the bottom. The message history displays the full conversation thread between the user and the agent. User messages appear right-aligned with a distinct accent color, while agent responses appear left-aligned with default text styling. Each message shows the sender role label ("You" or "Agent"), the message content rendered as markdown (including code blocks with syntax highlighting, inline code, bold, italic, lists, and links), and a relative timestamp in muted text. Tool call and tool result parts render as collapsible summary blocks — tool calls show the tool name and a truncated argument preview, while tool results show a success/failure indicator and truncated output. The message history auto-scrolls to the bottom as new content arrives (sticky scroll), but the user can scroll up to review earlier messages, at which point auto-scroll pauses. A "↓ New messages" indicator appears at the bottom of the message area when the user is scrolled up and new content arrives; pressing `Enter` or `G` while this indicator is visible jumps back to the latest message and re-enables auto-scroll.

Agent responses stream token-by-token via SSE. As tokens arrive, the current agent message grows incrementally with markdown formatting applied progressively — headings, code blocks, and lists render as soon as their syntax is complete. This creates a natural "typing" feel in the terminal. During streaming, a pulsing indicator (braille spinner ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 100ms) appears next to the agent's role label to indicate the response is in progress. The streaming indicator disappears when the response completes. If the SSE connection drops during streaming, the status bar shows a disconnection warning and the TUI attempts automatic reconnection with exponential backoff; on reconnection, any missed tokens are replayed from the last received position.

The message input area at the bottom is a single-line text input by default, expanding to a multi-line editor (up to 8 lines) when the user presses `Shift+Enter` or when the text wraps beyond the terminal width. The input shows a placeholder "Type a message…" when empty. Pressing `Enter` on a non-empty single-line input sends the message; in multi-line mode, `Ctrl+Enter` sends. The message is sent optimistically — it appears immediately in the chat history with a pending indicator while the API call is in-flight. If the send fails, the message is marked with an error indicator and the user can press `R` on the failed message to retry. While the agent is actively streaming a response, the input is disabled (dimmed) and shows "Agent is responding…" as the placeholder; the user cannot send until the current response completes.

The header breadcrumb reads "Dashboard > owner/repo > Agents > Session Title" (truncated from the left at narrow widths). The status bar shows context-sensitive keybinding hints: `Enter:send`, `Esc:back`, `/:search`, `Ctrl+B:sidebar`. For completed sessions, the screen enters replay mode — the message input is hidden, a "Session completed" banner replaces it, and the user can only scroll through the historical conversation. The session status (active, completed, timed_out) is displayed as a badge next to the session title in the header area.

## Acceptance Criteria

### Definition of Done
- [ ] The Agent Chat screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable by pressing `Enter` on a session in the agent session list
- [ ] The screen is reachable by creating a new session via `TUI_AGENT_SESSION_CREATE` and immediately entering the chat
- [ ] The breadcrumb reads "Dashboard > owner/repo > Agents > {session_title}" (or truncated form at narrow widths)
- [ ] Pressing `q` or `Esc` pops the screen and returns to the agent session list
- [ ] The session title and status badge are displayed in the title area below the header
- [ ] Messages are fetched via `useAgentMessages()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with page-based pagination (default page size 30, max 50)
- [ ] The message list renders user messages and agent messages with distinct visual alignment and color treatment
- [ ] Agent responses stream in real-time via SSE from `GET /api/repos/:owner/:repo/agent/sessions/:id/stream`
- [ ] The message input is functional: typing, sending, multi-line expansion, and pending state
- [ ] Completed sessions display in replay mode with the input area replaced by a "Session completed" banner

### Message Display
- [ ] User messages: left-aligned with "You" role label in `primary` color (ANSI 33), message body in default text, timestamp in `muted` (ANSI 245)
- [ ] Agent messages: left-aligned with "Agent" role label in `success` color (ANSI 34), body rendered via `<markdown>`, timestamp in `muted`
- [ ] System messages (if present): centered, rendered in `muted` color with italic styling
- [ ] Tool call parts: collapsible block showing `🔧 {tool_name}({truncated_args})` in `muted` with `warning` color icon (ANSI 178)
- [ ] Tool result parts: collapsible block showing `✓ Result` (green) or `✗ Error` (red) with truncated output preview
- [ ] Each message block has 1 line of vertical spacing between messages
- [ ] Code blocks within agent messages use `<code>` with syntax highlighting
- [ ] Links render as underlined text with URL shown inline

### Keyboard Interactions
- [ ] `j` / `Down`: Scroll message history down
- [ ] `k` / `Up`: Scroll message history up
- [ ] `G`: Jump to latest message (re-enables auto-scroll)
- [ ] `g g`: Jump to first message
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up through message history
- [ ] `i`: Focus message input (from message history browsing mode)
- [ ] `Esc`: If input focused → unfocus input and return to message browsing; if no input focused → pop screen
- [ ] `Enter`: Send message (single-line mode); jump to latest message (when "↓ New messages" indicator visible and input not focused)
- [ ] `Ctrl+Enter`: Send message (multi-line mode)
- [ ] `Shift+Enter`: Insert newline in input (switch to multi-line if needed)
- [ ] `Tab` / `Shift+Tab`: Expand/collapse focused tool call or tool result block
- [ ] `/`: Focus search within message history (substring search across all message text)
- [ ] `n` / `N`: Next / previous search match
- [ ] `R`: Retry failed message send (when failed message is focused)
- [ ] `q`: Pop screen (when input not focused)
- [ ] `f`: Toggle auto-scroll on/off

### Streaming Behavior
- [ ] Agent responses stream token-by-token via SSE
- [ ] Streaming tokens append to the current agent message incrementally
- [ ] Markdown formatting is applied progressively as tokens arrive
- [ ] A braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 100ms interval) shows next to "Agent" label during streaming
- [ ] Auto-scroll follows new content during streaming (when enabled)
- [ ] User scrolling up during streaming pauses auto-scroll and shows "↓ New messages" indicator
- [ ] SSE disconnect during streaming shows status bar warning; auto-reconnect with backoff (1s, 2s, 4s, 8s, max 30s)
- [ ] SSE reconnection replays missed tokens from last received position
- [ ] Streaming completes when the server sends a `done` event; spinner stops, input re-enables
- [ ] Input area is disabled (dimmed) during active streaming

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Message input is single-line only (multi-line disabled). Role labels abbreviated ("Y:" / "A:"). Timestamps hidden. Tool call blocks always collapsed. Max message width = terminal width − 4 (2ch padding each side)
- [ ] 120×40 – 199×59: Full layout. Role labels "You" / "Agent". Timestamps shown as relative ("3m", "1h"). Tool call blocks collapsible. Max message width = terminal width − 8. Multi-line input up to 4 lines
- [ ] 200×60+: Full layout with generous spacing. Timestamps shown as "3 minutes ago". Tool call blocks show extended argument previews. Max message width = terminal width − 16. Multi-line input up to 8 lines

### Truncation & Boundary Constraints
- [ ] Session title in breadcrumb: truncated at 40 characters with `…`
- [ ] Message input: max 4000 characters per message
- [ ] Tool call argument preview: truncated at 60 characters with `…` (120 at large breakpoint)
- [ ] Tool result output preview: truncated at 80 characters with `…` (160 at large breakpoint)
- [ ] Tool name: max 50 characters, truncated with `…`
- [ ] Timestamps: max 4ch standard ("3m", "1h"), 6ch+ large ("3 min ago")
- [ ] Code blocks in messages: horizontal scroll within `<code>` when exceeding available width
- [ ] Message history memory cap: 500 messages loaded in memory at once
- [ ] Older messages beyond cap: "Load earlier messages" shown at top, triggered by scrolling to top
- [ ] Max visible messages per render cycle: virtualized via `<scrollbox>` viewport culling

### Edge Cases
- [ ] Terminal resize while streaming: layout re-renders, stream continues, auto-scroll preserved
- [ ] Terminal resize while composing multi-line message: input re-wraps, no text loss
- [ ] Rapid message sends: queued sequentially, each appears in order
- [ ] SSE disconnect and reconnect during streaming: missed tokens replayed, no duplicate text
- [ ] Empty session (zero messages, just created): "Send a message to start the conversation." centered placeholder
- [ ] Agent returns empty response (0 tokens): "Agent returned an empty response." shown in muted text
- [ ] Unicode/emoji in messages: rendered correctly, no terminal corruption, truncation respects grapheme clusters
- [ ] Very long single-line message from agent (10000+ chars): word-wrapped within message bubble, scrollbox handles
- [ ] Very long code block (500+ lines): rendered within `<code>`, scrollable, syntax highlighting preserved
- [ ] Concurrent resize + scroll + streaming: all three operations are independent, no artifacts
- [ ] Network disconnect mid-send: optimistic message marked with error indicator, retry available
- [ ] Session not found (deleted): error screen "Session not found. Press q to go back."
- [ ] Session timed out during chat: input disables, "Session timed out" banner replaces input
- [ ] Tool call with very large arguments (JSON blob): collapsed by default, expandable, truncated preview
- [ ] Rapid `j`/`k` presses: sequential scroll, one step per keypress, no debounce
- [ ] Message containing only whitespace: rejected client-side, input not cleared
- [ ] Markdown rendering of nested lists, tables, blockquotes: best-effort terminal rendering via `<markdown>`
- [ ] 500+ messages in session: pagination loads older messages on scroll-to-top, 500-message memory cap

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Agents > Session Title │ ●  │
├──────────────────────────────────────────────────────────────┤
│ Chat: "Fix authentication bug"              ◆ active         │
├──────────────────────────────────────────────────────────────┤
│                    Load earlier messages                      │
│                                                              │
│ You                                                     3m   │
│ Can you look at the login timeout issue in auth.ts?          │
│                                                              │
│ ⠋ Agent                                                 2m   │
│ I'll investigate the login timeout. Let me check the file:   │
│                                                              │
│ 🔧 read_file(path="src/auth.ts")                      ▸     │
│ ✓ Result (245 lines)                                   ▸     │
│                                                              │
│ Looking at `auth.ts`, I found the issue. The session         │
│ timeout is hardcoded to 30 seconds on line 42:               │
│                                                              │
│ ```typescript                                                │
│ const SESSION_TIMEOUT = 30_000; // 30s                       │
│ ```                                                          │
│                                                              │
│ This should be configurable. Here's what I suggest...█       │
│                                                              │
│                                        ↓ New messages        │
├──────────────────────────────────────────────────────────────┤
│ > Type a message…                                            │
├──────────────────────────────────────────────────────────────┤
│ Status: Enter:send  i:input  j/k:scroll  /:search  q:back   │
└──────────────────────────────────────────────────────────────┘
```

### Component Tree

```tsx
<box flexDirection="column" width="100%" height="100%">
  {/* Session title bar */}
  <box flexDirection="row" height={1} paddingX={1}>
    <text bold color="primary">{truncate(session.title, titleMaxWidth)}</text>
    <box flexGrow={1} />
    <text color={statusColor(session.status)}>◆ {session.status}</text>
  </box>

  {/* Message history */}
  <scrollbox flexGrow={1} stickyScroll={autoScrollEnabled} stickyStart="bottom" viewportCulling={true} paddingX={messagePadding}>
    <box flexDirection="column" gap={1}>
      {hasOlderMessages && <text color="muted" align="center">Load earlier messages</text>}
      {messages.length === 0 && !isLoading && (
        <box justifyContent="center" alignItems="center" flexGrow={1}>
          <text color="muted">Send a message to start the conversation.</text>
        </box>
      )}
      {messages.map((msg) => <MessageBlock key={msg.id} message={msg} breakpoint={breakpoint} />)}
      {hasNewMessages && !autoScrollEnabled && (
        <box position="absolute" bottom={1} right={2}>
          <text color="primary" bold>↓ New messages</text>
        </box>
      )}
    </box>
  </scrollbox>

  {/* Message input (active sessions only) */}
  {session.status === "active" ? (
    <box flexDirection="column" height={inputHeight} borderTop="single" paddingX={1}>
      <box flexDirection="row" alignItems="center" gap={1}>
        <text color="muted">{">"}"</text>
        <input value={inputText} onChange={setInputText}
          placeholder={isStreaming ? "Agent is responding…" : "Type a message…"}
          focused={inputFocused} disabled={isStreaming} maxLength={4000} multiline={isMultiline} />
      </box>
      {isMultiline && breakpoint !== "minimum" && (
        <text color="muted" align="right">Ctrl+Enter to send · Esc to cancel</text>
      )}
    </box>
  ) : (
    <box height={1} borderTop="single" paddingX={1} justifyContent="center">
      <text color="muted">Session {session.status === "completed" ? "completed" : "timed out"}. Read-only replay mode.</text>
    </box>
  )}
</box>
```

### MessageBlock Sub-component

Each message renders a role label + timestamp row, then message parts. User messages show "You" in primary (ANSI 33), agent messages show "Agent" in success (ANSI 34) with a braille spinner during streaming. System messages are centered in muted italic. Tool calls show `🔧 {name}({args})` with collapsible ▸/▾ toggle. Tool results show `✓ Result`/`✗ Error` with collapsible content.

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, message blocks, input area
- `<scrollbox>` — Scrollable message history with sticky-scroll (bottom) and viewport culling
- `<text>` — Role labels, timestamps, status indicators, placeholders, tool summaries
- `<input>` — Message text input with single-line and multi-line modes
- `<markdown>` — Agent message body rendering with headings, lists, code blocks, links
- `<code>` — Syntax-highlighted code blocks within agent messages, tool result display

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `j` / `Down` | Message history | Scroll down |
| `k` / `Up` | Message history | Scroll up |
| `G` | Message history | Jump to latest message (re-enable auto-scroll) |
| `g g` | Message history | Jump to first message |
| `Ctrl+D` / `Ctrl+U` | Message history | Page down / page up |
| `i` | Message history | Focus message input |
| `Enter` | Input focused, single-line | Send message |
| `Ctrl+Enter` | Input focused, multi-line | Send message |
| `Shift+Enter` | Input focused | Insert newline / expand to multi-line |
| `Esc` | Input focused | Unfocus input, return to message browsing |
| `Esc` | Message history | Pop screen (back to session list) |
| `Tab` | Tool call/result focused | Expand block |
| `Shift+Tab` | Tool call/result focused | Collapse block |
| `/` | Message history | Focus message search input |
| `n` | Search active | Next search match |
| `N` | Search active | Previous search match |
| `R` | Failed message focused | Retry send |
| `f` | Message history | Toggle auto-scroll |
| `q` | Input not focused | Pop screen |

### Responsive Behavior

| Breakpoint | Role Labels | Timestamps | Tool Blocks | Input Mode | Message Padding |
|-----------|-------------|-----------|-------------|-----------|----------------|
| 80×24 min | "Y:" / "A:" | Hidden | Always collapsed | Single-line only | 2ch |
| 120×40 std | "You" / "Agent" | Relative ("3m") | Collapsible | Up to 4 lines | 4ch |
| 200×60 lg | "You" / "Agent" | Full ("3 minutes ago") | Extended preview | Up to 8 lines | 8ch |

Resize triggers synchronous re-layout. Scroll position preserved. Auto-scroll state preserved. Input text preserved. Streaming continues uninterrupted.

### Data Hooks Consumed

| Hook | Source | Data |
|------|--------|------|
| `useAgentSession(sessionId)` | `@codeplane/ui-core` | `{ session: AgentSession, loading, error }` |
| `useAgentMessages(sessionId)` | `@codeplane/ui-core` | `{ messages: AgentMessage[], totalCount, loading, error, loadMore, loadEarlier }` |
| `useAgentStream(sessionId)` | `@codeplane/ui-core` | `{ streaming: boolean, currentTokens: string, connected: boolean, reconnecting: boolean }` |
| `useSendAgentMessage(sessionId)` | `@codeplane/ui-core` | `{ send: (text: string) => Promise<void>, sending: boolean, error: Error | null }` |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler |
| `useTimeline({ fps: 10 })` | `@opentui/react` | Frame counter for spinner animation |
| `useStatusBarHints()` | local TUI | Chat keybinding hints |
| `useNavigation()` | local TUI | `{ push, pop }` |

### API Endpoints Consumed

| Endpoint | Purpose |
|----------|--------|
| `GET /api/repos/:owner/:repo/agent/sessions/:id` | Fetch session metadata (title, status) |
| `GET /api/repos/:owner/:repo/agent/sessions/:id/messages?page=N&per_page=30` | Paginated message list |
| `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` | Send user message |
| `GET /api/repos/:owner/:repo/agent/sessions/:id/stream` | SSE stream for agent responses |

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (session owner) | Authenticated (non-owner) |
|--------|-----------|-------------------------------|---------------------------|
| View agent chat | ❌ | ✅ | ❌ |
| Send message | ❌ | ✅ | ❌ |
| View message history | ❌ | ✅ | ❌ |
| Connect to SSE stream | ❌ | ✅ | ❌ |

- The Agent Chat screen requires authentication. Unauthenticated users are redirected to the auth error screen ("Run `codeplane auth login` to authenticate.")
- Agent sessions are scoped to the repository and the user who created them. Only the session owner can view and interact with a session
- The screen requires a repository context. Attempting to access without one shows "Repository context required. Navigate to a repository first."
- All API endpoints (`/api/repos/:owner/:repo/agent/sessions/*`) enforce both repository access and session ownership on the server side
- Messages may contain repository file contents, code snippets, and issue references. These are already accessible to the session owner through their repository permissions

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- SSE stream endpoint uses ticket-based authentication: a one-time ticket is obtained via the auth API, then used to establish the SSE connection
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen ("Session expired. Run `codeplane auth login` to re-authenticate.")

### Rate Limiting
- `GET /api/repos/:owner/:repo/agent/sessions/:id/messages`: 300 req/min (list endpoint)
- `POST /api/repos/:owner/:repo/agent/sessions/:id/messages`: 30 req/min (send is computationally expensive — triggers agent run)
- `GET /api/repos/:owner/:repo/agent/sessions/:id/stream`: 10 connections/min (SSE reconnection limiter)
- `GET /api/repos/:owner/:repo/agent/sessions/:id`: 300 req/min (session metadata)
- 429 responses show inline "Rate limited. Retry in {Retry-After}s." in the status bar
- Send rate limit: client-side guard prevents more than 1 message per 2 seconds
- Optimistic message that hits rate limit reverts with error indicator on the message

### Data Sensitivity
- Agent messages may contain source code, file contents, and repository-specific information
- Tool call arguments may contain file paths and configuration values
- Tool results may contain file contents, command outputs, and error traces
- All content is scoped to the authenticated user's repository access — no cross-user or cross-repo leakage
- Message content is not cached to disk by the TUI; only held in memory during the session

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.agent_chat.view` | Screen mounted, initial messages loaded | `session_id`, `session_status`, `message_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` ("session_list", "create", "deeplink") |
| `tui.agent_chat.message_sent` | User sends a message | `session_id`, `message_length`, `is_multiline`, `input_time_ms` (time from first keystroke to send), `message_count_before` |
| `tui.agent_chat.stream_started` | Agent begins streaming response | `session_id`, `trigger_message_id` |
| `tui.agent_chat.stream_completed` | Agent finishes streaming | `session_id`, `response_length`, `token_count`, `stream_duration_ms`, `tool_call_count` |
| `tui.agent_chat.stream_error` | SSE error during streaming | `session_id`, `error_type`, `tokens_received_before_error`, `duration_before_error_ms` |
| `tui.agent_chat.tool_expanded` | User expands a tool call/result block | `session_id`, `tool_name`, `part_type` ("tool_call", "tool_result") |
| `tui.agent_chat.search_used` | User searches message history | `session_id`, `query_length`, `match_count`, `message_count` |
| `tui.agent_chat.scroll_to_top` | User scrolls to top and triggers load-earlier | `session_id`, `messages_loaded_before`, `page_number` |
| `tui.agent_chat.message_retry` | User retries a failed message | `session_id`, `original_error_type`, `retry_success` |
| `tui.agent_chat.sse_reconnect` | SSE reconnects after disconnect | `session_id`, `disconnect_duration_ms`, `reconnect_attempt`, `tokens_replayed` |
| `tui.agent_chat.replay_view` | User views a completed session | `session_id`, `message_count`, `session_duration_original_ms` |
| `tui.agent_chat.session_timeout` | Session times out during active chat | `session_id`, `messages_sent`, `session_duration_ms` |
| `tui.agent_chat.auto_scroll_toggled` | User toggles auto-scroll | `session_id`, `new_state` ("on", "off"), `was_streaming` |
| `tui.agent_chat.error` | Any API failure | `session_id`, `error_type`, `http_status`, `request_type` ("messages", "send", "session", "stream") |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`, `repo_owner`, `repo_name`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Message send success rate | >95% |
| Stream completion rate (started → finished without error) | >90% |
| Average messages per session | >3 |
| Tool expansion rate | >30% of sessions with tool calls |
| Search usage | >10% of sessions with 10+ messages |
| SSE connection uptime during streaming | >95% |
| Time to first token (send → first SSE token) | <3s p50, <8s p95 |
| Error rate (all API calls) | <2% |
| Retry success rate | >80% |
| Return rate (users who open agent chat again within 7 days) | >40% |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `AgentChat: mounted [session_id={id}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Messages loaded | `AgentChat: messages loaded [session_id={id}] [count={n}] [total={t}] [duration={ms}ms]` |
| `debug` | Input focused/unfocused | `AgentChat: input [state={focused|unfocused}]` |
| `debug` | Scroll position changed | `AgentChat: scroll [position={pos}] [auto_scroll={bool}]` |
| `debug` | Tool block toggled | `AgentChat: tool toggle [type={tool_call|tool_result}] [expanded={bool}]` |
| `debug` | Search activated | `AgentChat: search [query_length={n}] [matches={m}]` |
| `info` | Screen ready | `AgentChat: ready [session_id={id}] [status={status}] [messages={n}] [total_ms={ms}]` |
| `info` | Message sent | `AgentChat: message sent [session_id={id}] [length={n}] [success={bool}]` |
| `info` | Stream started | `AgentChat: stream started [session_id={id}]` |
| `info` | Stream completed | `AgentChat: stream completed [session_id={id}] [tokens={n}] [duration={ms}ms]` |
| `info` | SSE connected | `AgentChat: sse connected [session_id={id}]` |
| `warn` | Message send failed | `AgentChat: send failed [session_id={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `AgentChat: rate limited [session_id={id}] [retry_after={s}] [endpoint={ep}]` |
| `warn` | SSE disconnect | `AgentChat: sse disconnected [session_id={id}] [duration={ms}ms]` |
| `warn` | Slow message load (>3s) | `AgentChat: slow load [session_id={id}] [duration={ms}ms]` |
| `warn` | Stream error | `AgentChat: stream error [session_id={id}] [error={msg}] [tokens_received={n}]` |
| `warn` | Memory cap reached | `AgentChat: memory cap [session_id={id}] [total={n}] [cap=500]` |
| `error` | Auth error | `AgentChat: auth error [session_id={id}] [status=401]` |
| `error` | Session not found | `AgentChat: session not found [session_id={id}] [status=404]` |
| `error` | SSE failed permanently | `AgentChat: sse failed [session_id={id}] [attempts={n}] [last_error={msg}]` |
| `error` | Render error | `AgentChat: render error [session_id={id}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Resize during streaming | `useOnResize` fires while SSE active | Layout re-renders; stream continues; markdown re-wraps | Independent; no coordination needed |
| Resize during multi-line input | `useOnResize` fires while input has text | Input re-wraps; text content preserved; cursor position adjusted | Synchronous re-layout |
| SSE disconnect during streaming | SSE `error`/`close` event | Status bar shows "⚠ Disconnected"; partial message preserved with "…" indicator | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s); replay missed tokens |
| SSE reconnect replay | SSE reconnects with last token position | Replayed tokens deduplicated, appended to partial message | Automatic; no user action |
| Auth expiry | 401 from any API call | Auth error screen pushed | Re-auth via CLI (`codeplane auth login`) |
| Network timeout on message load (30s) | Fetch promise timeout | Loading → error state with "Press R to retry" | User retries |
| Network timeout on message send (30s) | Send promise timeout | Optimistic message marked "failed"; input text preserved | User presses R to retry or re-sends |
| Send 429 (rate limited) | `POST` returns 429 | Optimistic reverts; status bar shows "Rate limited" with countdown | User waits, sends again |
| Session 404 | `GET` session returns 404 | "Session not found. Press q to go back." | User navigates away |
| Session status changes to timed_out | SSE event or poll | Input disables; "Session timed out" banner replaces input | Read-only replay; create new session from session list |
| Stream 501 (not implemented) | SSE returns 501 | Message history loads via REST; polling every 3s for new messages | Degraded but functional |
| Rapid message sends | Client-side guard (2s cooldown) | Second send blocked; status bar flash "Wait before sending" | Cooldown timer expires |
| No color support | `TERM`/`COLORTERM` detection | Role labels use bold/underline instead of color; tool icons use text abbreviations `[T]`, `[R]` | Theme detection at startup |
| Memory cap (500 messages) | Client-side count check | Stop loading earlier; top shows "Showing latest 500 messages" | Client-side cap; scroll to top shows notice |
| Markdown parse error | Malformed markdown in agent response | Raw text fallback; no crash | Automatic; logs warning |
| Very large response (>50KB) | Content size check | Render continues; viewport culling prevents performance degradation | `<scrollbox>` with viewportCulling handles this |

### Failure Modes
- Component crash → global error boundary → "Press `r` to restart"
- All API fails → error state displayed; `q` key still works for navigation away
- SSE permanently fails (>10 reconnect attempts) → status bar shows persistent warning; falls back to REST polling (3s interval) for new messages
- Slow network → spinner shown during load; streaming may appear choppy with token batching
- Session deleted while viewing → 404 on next API call → "Session not found" error displayed

## Verification

### Test File: `e2e/tui/agents.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-CHAT-001: Agent chat at 120×40 with mixed user/agent messages — full layout, role labels, timestamps, markdown rendering
- SNAP-CHAT-002: Agent chat at 80×24 minimum — abbreviated role labels "Y:"/"A:", timestamps hidden, compact layout
- SNAP-CHAT-003: Agent chat at 200×60 large — full role labels, extended timestamps, generous spacing
- SNAP-CHAT-004: Empty session (zero messages) — "Send a message to start the conversation." centered
- SNAP-CHAT-005: Session not found (404) — "Session not found. Press q to go back." in error color
- SNAP-CHAT-006: Loading state — "Loading messages…" with session title visible
- SNAP-CHAT-007: Error state — red error with "Press R to retry"
- SNAP-CHAT-008: User message rendering — role label "You" in primary color, message body, timestamp
- SNAP-CHAT-009: Agent message rendering — role label "Agent" in success color, markdown body, timestamp
- SNAP-CHAT-010: Agent message with code block — syntax-highlighted `<code>` block within message
- SNAP-CHAT-011: Agent message with markdown list — bullet list rendered within message
- SNAP-CHAT-012: Agent message with inline code — backtick-delimited code styled distinctly
- SNAP-CHAT-013: Tool call block collapsed — "🔧 read_file(path=\"src/auth.ts\")" with ▸ indicator
- SNAP-CHAT-014: Tool call block expanded — full JSON arguments visible
- SNAP-CHAT-015: Tool result block (success) — "✓ Result" in green with ▸ indicator
- SNAP-CHAT-016: Tool result block (error) — "✗ Error" in red with ▸ indicator
- SNAP-CHAT-017: Tool result block expanded — full output/error content visible
- SNAP-CHAT-018: Streaming indicator — braille spinner next to "Agent" label during active stream
- SNAP-CHAT-019: Input area (active session) — "> Type a message…" placeholder
- SNAP-CHAT-020: Input area disabled during streaming — dimmed, "Agent is responding…" placeholder
- SNAP-CHAT-021: Multi-line input expanded — input area height increased, "Ctrl+Enter to send" hint
- SNAP-CHAT-022: Completed session banner — "Session completed. Read-only replay mode." replaces input
- SNAP-CHAT-023: Timed out session banner — "Session timed out. Read-only replay mode." replaces input
- SNAP-CHAT-024: Failed message indicator — message with red error text and "Press R to retry"
- SNAP-CHAT-025: Pending message indicator — message with "Sending…" in muted text
- SNAP-CHAT-026: "↓ New messages" indicator — shown when scrolled up during streaming
- SNAP-CHAT-027: Breadcrumb rendering — "Dashboard > owner/repo > Agents > Session Title"
- SNAP-CHAT-028: Status bar keybinding hints for agent chat screen

### Keyboard Interaction Tests (42 tests)

- KEY-CHAT-001: j scrolls message history down
- KEY-CHAT-002: k scrolls message history up
- KEY-CHAT-003: Down arrow scrolls message history down
- KEY-CHAT-004: Up arrow scrolls message history up
- KEY-CHAT-005: G jumps to latest message
- KEY-CHAT-006: g g jumps to first message
- KEY-CHAT-007: Ctrl+D pages down
- KEY-CHAT-008: Ctrl+U pages up
- KEY-CHAT-009: i focuses message input
- KEY-CHAT-010: Typing in focused input updates input value
- KEY-CHAT-011: Enter sends message (single-line, non-empty input)
- KEY-CHAT-012: Enter on empty input does not send (no-op)
- KEY-CHAT-013: Sent message appears immediately in message history (optimistic)
- KEY-CHAT-014: Shift+Enter inserts newline and expands input to multi-line
- KEY-CHAT-015: Ctrl+Enter sends message in multi-line mode
- KEY-CHAT-016: Esc when input focused unfocuses input
- KEY-CHAT-017: Esc when input not focused pops screen
- KEY-CHAT-018: q pops screen (when input not focused)
- KEY-CHAT-019: q types "q" into input when input is focused (not pop)
- KEY-CHAT-020: Tab on tool call block expands it
- KEY-CHAT-021: Shift+Tab on expanded tool block collapses it
- KEY-CHAT-022: / activates message search
- KEY-CHAT-023: Typing in search narrows to matching messages (highlighted)
- KEY-CHAT-024: n jumps to next search match
- KEY-CHAT-025: N jumps to previous search match
- KEY-CHAT-026: Esc in search clears search and returns to message browsing
- KEY-CHAT-027: R on failed message retries send
- KEY-CHAT-028: R on non-failed message is no-op
- KEY-CHAT-029: f toggles auto-scroll off (when enabled)
- KEY-CHAT-030: f toggles auto-scroll on (when disabled); scrolls to bottom
- KEY-CHAT-031: Input disabled during streaming — keystrokes do not modify input
- KEY-CHAT-032: Input re-enables after streaming completes
- KEY-CHAT-033: G while "↓ New messages" visible jumps to bottom and re-enables auto-scroll
- KEY-CHAT-034: Enter while "↓ New messages" visible and input not focused jumps to bottom
- KEY-CHAT-035: Rapid j presses (15× sequential) — each scrolls one step
- KEY-CHAT-036: Message with only whitespace rejected on Enter — input not cleared
- KEY-CHAT-037: Message at 4000 character limit — accepted and sent
- KEY-CHAT-038: Message at 4001 characters — input rejects additional characters
- KEY-CHAT-039: i when session is completed — no-op (input not shown)
- KEY-CHAT-040: Keys j/k/G/q do not trigger while input focused — they type into input
- KEY-CHAT-041: Ctrl+C quits TUI from any state (global binding)
- KEY-CHAT-042: ? opens help overlay showing chat-specific keybindings

### Responsive Tests (14 tests)

- RESP-CHAT-001: 80×24 layout — abbreviated labels, timestamps hidden, single-line input only
- RESP-CHAT-002: 80×24 tool blocks always collapsed (not expandable)
- RESP-CHAT-003: 80×24 message width = terminal width − 4
- RESP-CHAT-004: 120×40 layout — full labels, relative timestamps, collapsible tools, multi-line input up to 4 lines
- RESP-CHAT-005: 120×40 message width = terminal width − 8
- RESP-CHAT-006: 200×60 layout — full timestamps, extended tool previews, multi-line input up to 8 lines
- RESP-CHAT-007: 200×60 message width = terminal width − 16
- RESP-CHAT-008: Resize from 120×40 to 80×24 — layout collapses, scroll position preserved, streaming continues
- RESP-CHAT-009: Resize from 80×24 to 120×40 — layout expands, timestamps appear
- RESP-CHAT-010: Resize during streaming — markdown re-wraps, no artifacts, stream continues
- RESP-CHAT-011: Resize with multi-line input active — text rewraps, no content loss
- RESP-CHAT-012: Resize during search — search input and highlights adjust
- RESP-CHAT-013: Resize with "↓ New messages" indicator — repositioned correctly
- RESP-CHAT-014: Resize from 120×40 to 200×60 — tool call previews expand to 120ch

### Integration Tests (24 tests)

- INT-CHAT-001: Auth expiry (401) during message fetch — auth error screen shown
- INT-CHAT-002: Auth expiry (401) during message send — auth error screen shown
- INT-CHAT-003: Rate limit (429) on message send — optimistic reverts, status bar shows retry-after
- INT-CHAT-004: Rate limit (429) on message list — inline error with retry-after
- INT-CHAT-005: Network timeout on message list fetch — error state with "Press R to retry"
- INT-CHAT-006: Network timeout on message send — message marked failed, input text preserved
- INT-CHAT-007: Session 404 — "Session not found" error displayed
- INT-CHAT-008: Server 500 on message list — error state
- INT-CHAT-009: Server 500 on message send — message marked failed
- INT-CHAT-010: Pagination loads earlier messages on scroll-to-top
- INT-CHAT-011: Pagination cap at 500 messages — top shows "Showing latest 500 messages"
- INT-CHAT-012: SSE stream delivers tokens — agent message grows incrementally
- INT-CHAT-013: SSE stream completes — spinner stops, input re-enables
- INT-CHAT-014: SSE disconnect during stream — status bar warning, reconnect attempt
- INT-CHAT-015: SSE reconnect replays missed tokens — no duplicate text
- INT-CHAT-016: SSE 501 (not implemented) — falls back to REST polling
- INT-CHAT-017: Completed session renders in replay mode — no input, banner shown
- INT-CHAT-018: Session times out during active chat — input disables, banner appears
- INT-CHAT-019: Message send triggers agent run — SSE stream begins after send
- INT-CHAT-020: Navigation back to session list and return preserves session state
- INT-CHAT-021: Client-side send cooldown — second send within 2s blocked
- INT-CHAT-022: Optimistic message send then server error — message reverts to failed state
- INT-CHAT-023: Multiple tool calls in single agent response — all rendered as separate blocks
- INT-CHAT-024: Agent response with mixed text and tool parts — rendered in correct sequence

### Edge Case Tests (16 tests)

- EDGE-CHAT-001: No auth token at startup — auth error screen
- EDGE-CHAT-002: Very long message (4000 chars) from user — sent successfully, rendered with word wrap
- EDGE-CHAT-003: Very long agent response (10000+ chars) — rendered correctly with word wrap and scrollbox
- EDGE-CHAT-004: Unicode/emoji in messages — truncation respects grapheme clusters, no corruption
- EDGE-CHAT-005: Code block with 500+ lines — scrollable within `<code>`, syntax highlighting preserved
- EDGE-CHAT-006: Agent response with nested markdown (lists in lists, code in blockquotes) — best-effort rendering
- EDGE-CHAT-007: Single message in session (user only, no agent response yet)
- EDGE-CHAT-008: Concurrent resize + scroll + streaming — all independent, no artifacts
- EDGE-CHAT-009: Rapid R presses on failed message — only first triggers retry
- EDGE-CHAT-010: Search with special regex characters — literal match, not regex
- EDGE-CHAT-011: Agent empty response (0 tokens) — empty response message shown
- EDGE-CHAT-012: Tool call with very large arguments (5KB JSON) — collapsed by default, expanded preview truncated
- EDGE-CHAT-013: Message containing only whitespace — rejected client-side
- EDGE-CHAT-014: SSE delivers duplicate tokens — deduplicated by position
- EDGE-CHAT-015: Network disconnect mid-retry — failed message stays failed, retry available again
- EDGE-CHAT-016: Session deleted while viewing (race condition) — 404 on next poll, error screen

All 124 tests left failing if backend is unimplemented — never skipped or commented out.

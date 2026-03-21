# TUI_AGENT_MESSAGE_SEND

Specification for TUI_AGENT_MESSAGE_SEND.

## High-Level User POV

When a developer is working in an active agent chat session and wants to send a message, they type directly into the message input at the bottom of the chat screen. The agent chat screen has a persistent message input bar anchored to the bottom edge of the content area, always visible below the scrollable conversation history. This input bar is the primary way users interact with the agent — it is pre-focused when the chat screen opens, so the developer can begin typing immediately without any activation keybinding.

The message input is a single-line text field that expands to multi-line when the content wraps or when the user presses `Shift+Enter` to insert a newline. It grows upward from the bottom, consuming up to 30% of the content area height before becoming internally scrollable. A placeholder reads "Send a message…" in muted text when the field is empty. The input is bordered with a single-line box border in the `primary` color when focused, and a `border` color when blurred. To the right of the input, a submit indicator shows `Enter:send` in muted text.

The user composes their message in plain text. Markdown formatting is supported — the agent will receive the raw text, and any markdown in the agent's response will be rendered via the `<markdown>` component in the conversation history. While typing, the conversation history above remains visible and scrollable independently. The user can scroll up through the history with `Ctrl+U`/`Ctrl+D` while the input is focused, then return focus to the input by pressing `Esc` or simply starting to type again.

Pressing `Enter` sends the message. The message is immediately appended to the conversation history as a user bubble — right-aligned with the user's display name, rendered in the `primary` accent color. The input clears and returns to its single-line empty state. The conversation auto-scrolls to the bottom to show the newly sent message. A "thinking" indicator appears below the user message — an animated braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) with "Agent is thinking…" in muted text — signaling that the agent is processing the request.

The message is sent via `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with role `"user"` and a single text part. When the server confirms and dispatches the agent run, the TUI subscribes (or is already subscribed) to the SSE stream for the session. As the agent's response tokens arrive over SSE, they render incrementally in an assistant bubble below the thinking indicator. The thinking indicator is replaced by the streaming content. Markdown formatting is applied progressively as tokens arrive — headings, code blocks, and lists render in real-time. The conversation auto-scrolls to follow the streaming output unless the user has manually scrolled up, in which case auto-scroll is paused and a "↓ New messages" indicator appears at the bottom of the scrollbox above the input.

If the message fails to send (network error, server error), the failed message remains in the conversation history with a red `✗` indicator and an inline hint: "Failed to send. Press `r` to retry." The input does not clear on failure so the user can edit and resend. Pressing `r` while the failed message is the most recent message retries the send. The user can also press `Ctrl+S` from within the input to force-retry without clearing.

At the minimum terminal size (80×24), the input bar takes 3 rows (1 border top, 1 input line, 1 border bottom/hint) and the conversation history fills the remaining space. At standard size (120×40), the input can expand to 6 rows before scrolling. At large sizes (200×60+), the input can grow to 10 rows. The entire layout adapts fluidly to terminal resize — the conversation history adjusts, the input retains its content, and no state is lost.

## Acceptance Criteria

### Message input lifecycle
- [ ] The message input is rendered as a persistent panel at the bottom of the agent chat screen.
- [ ] The input is pre-focused when the chat screen opens or when a new session is created.
- [ ] The input shows placeholder text "Send a message…" in `muted` color when empty.
- [ ] The input border is `primary` color when focused, `border` color when blurred.
- [ ] The input accepts multi-line content: `Shift+Enter` inserts a newline.
- [ ] `Enter` (without Shift) submits the message.
- [ ] The input grows upward as content wraps, up to 30% of the content area height.
- [ ] Beyond 30% height, the input becomes internally scrollable.
- [ ] The input is not rendered when the session status is `"completed"`, `"failed"`, or `"timed_out"` — a read-only status banner replaces it.
- [ ] The input is disabled (greyed out) while a message is being sent (submission in flight).

### Text input behavior
- [ ] Standard text editing keys: `Backspace`, `Delete`, `Left`, `Right`, `Up`, `Down`, `Home`/`Ctrl+A`, `End`/`Ctrl+E`, `Ctrl+K` (kill to end), `Ctrl+U` (kill to start of line within input).
- [ ] Text wraps at available width minus 2 (for borders).
- [ ] Tab characters are not inserted (reserved for form navigation).
- [ ] Pasted content (bracketed paste mode) is accepted and inserted at cursor.
- [ ] Rapid key input is buffered and processed in order; no keystrokes are dropped.
- [ ] `Ctrl+U` within the input kills to start of current line (not page-up when input is focused).

### Message submission
- [ ] `Enter` sends the message body to `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with `{ role: "user", parts: [{ type: "text", content: "<body>" }] }`.
- [ ] Submitting an empty or whitespace-only body is a no-op — `Enter` on empty input does nothing (no validation error shown, no API call).
- [ ] On submission, the input becomes non-interactive (disabled) and a subtle "Sending…" indicator replaces the `Enter:send` hint.
- [ ] Double-submit prevention: `Enter` while a submission is in flight is ignored.
- [ ] On successful submission (201), the input clears, becomes interactive again, and the optimistic message is finalized with the server-assigned ID.
- [ ] On server error (4xx except 401/403, 5xx, network error), the message is marked as failed in the conversation, the input retains the original content, and the error is shown inline.
- [ ] On 401 error, the auth error is shown: "Session expired. Run `codeplane auth login` to re-authenticate."
- [ ] On 403 error, "Permission denied. You cannot send messages in this session." is shown in `error` color.
- [ ] On 429 rate limit, the input retains content and "Rate limit exceeded. Please wait and try again." is shown.
- [ ] Message body is trimmed (leading/trailing whitespace removed) before submission.
- [ ] Message body is sent as a single text part with `{ type: "text", content: trimmedBody }`.

### Optimistic UI and conversation update
- [ ] On submission, the user message is optimistically appended to the conversation history immediately (within 16ms).
- [ ] The optimistic message renders with `@currentUser` name, the message body, and a subtle pending indicator.
- [ ] On server success, the pending indicator is removed and the server-assigned message ID replaces the optimistic ID.
- [ ] On server error, the message is marked with a red `✗` and "Failed to send. Press `r` to retry." hint.
- [ ] After a successful user message, a "thinking" indicator appears: animated braille spinner with "Agent is thinking…" in `muted` text.
- [ ] The thinking indicator is removed when the first SSE token of the agent's response arrives.

### Streaming response rendering
- [ ] Agent response tokens arriving via SSE render incrementally in an assistant bubble.
- [ ] Markdown formatting is applied progressively as tokens accumulate (headings, code blocks, lists, bold, italic, links).
- [ ] The conversation auto-scrolls to follow streaming output when the user is at the bottom.
- [ ] If the user has scrolled up (not at bottom), auto-scroll is paused and a "↓ New messages" indicator appears above the input.
- [ ] Clicking or pressing `G` jumps to the bottom and resumes auto-scroll.
- [ ] When the SSE stream emits a `"done"` event, the assistant message is finalized and the thinking/streaming state ends.
- [ ] If the SSE stream disconnects during streaming, a "Connection lost — reconnecting…" indicator appears. On reconnection, missed content is fetched via the messages API.

### Retry on failure
- [ ] Pressing `r` when the most recent message is a failed user message retries the send.
- [ ] Retry sends the same body to the same API endpoint.
- [ ] Retry replaces the failed indicator with the sending state.
- [ ] The user can also edit the message in the input (which retains content on failure) and press `Enter` to send the edited version.
- [ ] `r` is only active when the input is empty and the last message is failed; otherwise `r` is a normal text input character.

### Focus management
- [ ] The message input captures all keyboard input when focused, except: `?` (help overlay), `Ctrl+C` (quit TUI), `q` (only when input is empty — pops screen), `Esc` (blur input / switch to conversation scroll mode).
- [ ] `Esc` when the input is focused and not empty blurs the input and switches focus to the conversation scrollbox for navigation.
- [ ] `Esc` when the input is focused and empty pops the chat screen (returns to session list).
- [ ] When the conversation scrollbox is focused, `j`/`k` scroll the history and `i` or any printable character returns focus to the input.
- [ ] Global go-to keybindings (`g d`, `g r`, etc.) are active when the input is empty and unfocused.
- [ ] `:` (command palette) is active when the input is empty.

### Boundary constraints
- [ ] No client-side character limit on message body. Server-side limits are enforced; server 422 errors are shown inline.
- [ ] Input scrollbox supports up to 5,000 lines of content without performance degradation.
- [ ] Conversation history supports up to 10,000 messages without layout degradation (virtualized rendering).
- [ ] Individual message bodies truncated at 100,000 characters in the conversation display with a "Show more" affordance.
- [ ] User display name truncated to 20 characters with ellipsis in message bubbles.
- [ ] Timestamps shown as relative time (e.g., "2m ago"), truncated to fit available width.

### Responsive behavior
- [ ] At 80×24: input bar = 3 rows (single line + borders), max expansion = 5 rows. Conversation fills remaining rows.
- [ ] At 120×40: input bar = 3 rows default, max expansion = 8 rows.
- [ ] At 200×60+: input bar = 3 rows default, max expansion = 12 rows.
- [ ] Below 80×24: "Terminal too small" message; chat screen is not rendered.
- [ ] Terminal resize while typing preserves input content and cursor position.
- [ ] Terminal resize during streaming response continues rendering without interruption.
- [ ] Input width always fills available content width minus 2 (for borders).

### Performance
- [ ] Input keystroke-to-render latency: <16ms.
- [ ] Message submission to optimistic display: <16ms.
- [ ] SSE token-to-render latency: <16ms (incremental, no buffer-then-flush).
- [ ] Conversation scroll at 60fps equivalent for terminal refresh.
- [ ] Memory stable during long streaming responses (no token accumulation leak).

## Design

### Layout structure

The agent chat screen uses a two-region vertical split: a scrollable conversation history above and a fixed message input panel below. The input panel is always anchored to the bottom of the content area (between the global header bar and status bar).

At standard size (120×40), with the 2-row header and 1-row status bar, the content area is 37 rows. The input panel occupies 3 rows by default (top border, input line, bottom border/hints), leaving 34 rows for conversation history. As the user types multi-line content, the input grows upward, reducing the conversation area proportionally up to 30% of the content height.

### Component tree (OpenTUI)

```jsx
<box flexDirection="column" width="100%" height="100%">
  {/* Conversation history */}
  <scrollbox flexGrow={1} paddingX={1} ref={conversationRef}
    onScrollEnd={handleScrollEnd} focused={!inputFocused}>
    <box flexDirection="column" gap={1}>
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} currentUser={user}
          isStreaming={msg.id === streamingMessageId} />
      ))}
      {isThinking && (
        <box flexDirection="row" gap={1}>
          <text fg={ANSI_MUTED}>{spinnerFrame}</text>
          <text fg={ANSI_MUTED}>Agent is thinking…</text>
        </box>
      )}
      {showNewMessagesIndicator && (
        <box paddingX={1}>
          <text fg={ANSI_PRIMARY}>↓ New messages</text>
        </box>
      )}
    </box>
  </scrollbox>

  {/* Message input panel */}
  {session.status === "active" ? (
    <box flexDirection="column" paddingX={1}>
      <box border="single" borderColor={inputFocused ? ANSI_PRIMARY : ANSI_BORDER}>
        <scrollbox maxHeight={maxInputHeight}>
          <input
            multiline
            value={messageBody}
            onChange={setMessageBody}
            placeholder="Send a message…"
            focused={inputFocused}
            disabled={isSending}
          />
        </scrollbox>
      </box>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={ANSI_MUTED}>
          {isSending ? "Sending…" : sendError ? sendError : ""}
        </text>
        <text fg={ANSI_MUTED}>Enter:send │ Shift+Enter:newline</text>
      </box>
    </box>
  ) : (
    <box paddingX={1} paddingY={0}>
      <text fg={ANSI_MUTED}>
        Session {session.status}. This conversation is read-only.
      </text>
    </box>
  )}
</box>
```

### MessageBubble component

```jsx
{/* User message */}
<box flexDirection="column" gap={0}>
  <box flexDirection="row" gap={2}>
    <text fg={ANSI_PRIMARY} bold>@{message.user.login}</text>
    <text fg={ANSI_MUTED}>{relativeTime(message.created_at)}</text>
    {message.failed && <text fg={ANSI_ERROR}>✗ Failed</text>}
    {message.pending && <text fg={ANSI_MUTED}>⏳</text>}
  </box>
  <markdown content={message.parts[0].content} />
  {message.failed && (
    <text fg={ANSI_ERROR}>Failed to send. Press r to retry.</text>
  )}
</box>

{/* Assistant message */}
<box flexDirection="column" gap={0}>
  <box flexDirection="row" gap={2}>
    <text fg={ANSI_SUCCESS} bold>Agent</text>
    <text fg={ANSI_MUTED}>{relativeTime(message.created_at)}</text>
  </box>
  <markdown content={isStreaming ? streamingContent : message.parts[0].content} />
</box>
```

### Keybindings

**When input is focused (typing mode):**

| Key | Action |
|-----|--------|
| `Enter` | Send message (if not empty) |
| `Shift+Enter` | Insert newline |
| `Backspace` | Delete character before cursor |
| `Delete` | Delete character after cursor |
| `Left` / `Right` | Move cursor horizontally |
| `Up` / `Down` | Move cursor vertically (multi-line) |
| `Home` / `Ctrl+A` | Move to start of line |
| `End` / `Ctrl+E` | Move to end of line |
| `Ctrl+K` | Kill to end of line |
| `Ctrl+U` | Kill to start of line |
| `Esc` | Blur input (empty: pop screen; non-empty: switch to scroll mode) |
| `?` | Toggle help overlay |
| `Ctrl+C` | Quit TUI |

**When conversation scrollbox is focused (scroll mode):**

| Key | Action |
|-----|--------|
| `j` / `Down` | Scroll down |
| `k` / `Up` | Scroll up |
| `G` | Jump to bottom, resume auto-scroll |
| `g g` | Jump to top |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |
| `i` | Return focus to input |
| `r` | Retry failed message (if last message failed) |
| `q` | Pop screen (back to session list) |
| `Esc` | Pop screen |
| `?` | Toggle help overlay |
| `:` | Open command palette |
| `g` prefix | Go-to keybindings |
| `f` | Toggle auto-scroll follow mode |
| `Ctrl+C` | Quit TUI |

**When input is focused and empty:**

| Key | Action |
|-----|--------|
| `q` | Pop screen (back to session list) |

### Status bar hints

**Input focused:** `Enter:send │ Shift+Enter:newline │ Esc:scroll mode │ ?:help`

**Scroll mode:** `j/k:scroll │ G:bottom │ i:type │ r:retry │ q:back │ ?:help`

**Sending in progress:** `Sending… │ Esc:cancel`

**Streaming response:** `Streaming… │ f:toggle follow │ q:back │ ?:help`

### Terminal resize behavior

| Width × Height | Input Default Height | Input Max Height | Conversation Rows |
|----------------|---------------------|------------------|-------------------|
| 80×24 – 119×39 | 3 rows | 5 rows | height - 8 |
| 120×40 – 199×59 | 3 rows | 8 rows | height - 7 |
| 200×60+ | 3 rows | 12 rows | height - 7 |

Resize triggers synchronous re-layout via `useOnResize()`. Input content, cursor position, streaming state, and conversation scroll position are all preserved.

### Data hooks consumed

| Hook | Source | Purpose |
|------|--------|--------|
| `useSendAgentMessage(owner, repo, sessionId)` | `@codeplane/ui-core` | Mutation: `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` |
| `useAgentMessages(owner, repo, sessionId)` | `@codeplane/ui-core` | Read: paginated message list for conversation history |
| `useAgentSession(owner, repo, sessionId)` | `@codeplane/ui-core` | Read: session metadata (status, title) |
| `useSSE("agent_session_<sessionId>")` | `@codeplane/ui-core` / SSEProvider | Subscribe: streaming agent response tokens |
| `useUser()` | `@codeplane/ui-core` | Read: current user for message attribution |
| `useKeyboard()` | `@opentui/react` | Input and scroll mode keybinding handlers |
| `useTerminalDimensions()` | `@opentui/react` | Responsive input sizing and layout |
| `useOnResize()` | `@opentui/react` | Re-layout on terminal resize |
| `useTimeline()` | `@opentui/react` | Braille spinner animation for thinking indicator |
| `useStatusBarHints()` | local TUI | Updates status bar for input/scroll modes |
| `useNavigation()` | local TUI | Pop screen on `q`/`Esc` |

### API endpoints

**Send message:**
`POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with body:
```json
{
  "role": "user",
  "parts": [{ "type": "text", "content": "message text" }]
}
```
Returns `201: AgentMessageResponse { id, session_id, role, sequence, created_at }`.

Server-side side effect: when role is `"user"`, the server dispatches an agent run via `dispatchAgentRun()`.

**Stream response:**
`GET /api/repos/:owner/:repo/agent/sessions/:id/stream` (SSE).
Events: `{ type: "token", data: { content: "..." } }`, `{ type: "done", data: {} }`, `{ type: "error", data: { message: "..." } }`.

**Fetch messages (for reconnection/pagination):**
`GET /api/repos/:owner/:repo/agent/sessions/:id/messages?page=N&per_page=30`

### Optimistic UI flow

1. User presses `Enter` → client validates body not empty/whitespace
2. Input becomes disabled → optimistic user message appended with pending indicator
3. POST request fires
4. Success: replace optimistic with server response, show thinking indicator, await SSE stream
5. SSE tokens arrive: render assistant bubble incrementally, remove thinking indicator
6. SSE done event: finalize assistant message
7. Failure: mark message as failed with `✗`, reopen input with content, show retry hint

### Auto-scroll behavior

Auto-scroll is enabled by default. The conversation scrollbox follows new content (both optimistic messages and streaming tokens). Auto-scroll is paused when the user scrolls up away from the bottom (detected by scrollbox position). A "↓ New messages" badge appears when auto-scroll is paused and new content arrives. Pressing `G` or `f` re-enables auto-scroll and jumps to the bottom.

## Permissions & Security

### Authorization
- Sending messages requires authentication. Any authenticated user who owns the session or has write access to the repository can send messages.
- The message input is hidden for unauthenticated sessions. The chat screen shows "Sign in to interact. Run `codeplane auth login`." in place of the input.
- Server returns 403 if user lacks permission. TUI shows "Permission denied. You cannot send messages in this session."
- Session must be in `"active"` status. Server returns 400/422 if the session is completed, failed, or timed out. TUI disables the input and shows read-only banner for non-active sessions.

### Token-based auth
- TUI authenticates via token from CLI keychain (`codeplane auth login`) or `CODEPLANE_TOKEN` environment variable.
- Token injected by `<APIClientProvider>` as `Authorization: token <token>` on the POST request.
- SSE stream uses ticket-based authentication: TUI first obtains an SSE ticket via the auth API, then passes it as a query parameter on the SSE connection.
- 401 response triggers: "Session expired. Run `codeplane auth login` to re-authenticate." Input closes.
- TUI does not retry 401s; user must re-authenticate via CLI.

### Rate limiting
- Message sending subject to server-side rate limiting.
- 429 response shows: "Rate limit exceeded. Please wait and try again." with `Retry-After` value if present.
- Input retains content on 429.
- No auto-retry. User manually retries with `Enter`.
- Consider rate limiting guidance: typical agent interactions have natural pauses between messages; rapid automated sends may trigger limits.

### Input safety
- Message body sent as-is to server. Server-side sanitization handles injection.
- No HTML rendering in TUI. ANSI escape codes in message body or agent responses escaped during rendering.
- Agent responses rendered through `<markdown>` which sanitizes content.
- No PII beyond username displayed in message bubbles.
- SSE stream content is treated as untrusted; malformed SSE events are logged and skipped.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.agent_message.input_focused` | Input receives focus | `owner`, `repo`, `session_id`, `session_status`, `message_count`, `terminal_width`, `terminal_height`, `layout` |
| `tui.agent_message.submitted` | User presses Enter to send | `owner`, `repo`, `session_id`, `body_length`, `line_count`, `time_to_submit_ms`, `has_code_block`, `has_markdown_formatting`, `is_retry` |
| `tui.agent_message.succeeded` | Server returns 201 | `owner`, `repo`, `session_id`, `message_id`, `server_response_ms`, `total_duration_ms` |
| `tui.agent_message.failed` | Server returns non-2xx or network error | `owner`, `repo`, `session_id`, `error_code`, `error_message`, `body_length`, `retry_count` |
| `tui.agent_message.retried` | User presses `r` to retry | `owner`, `repo`, `session_id`, `original_message_id`, `retry_count`, `time_since_failure_ms` |
| `tui.agent_message.stream_started` | First SSE token received | `owner`, `repo`, `session_id`, `time_since_send_ms` (thinking duration) |
| `tui.agent_message.stream_completed` | SSE done event received | `owner`, `repo`, `session_id`, `response_length`, `stream_duration_ms`, `token_count` |
| `tui.agent_message.stream_error` | SSE error event or disconnect | `owner`, `repo`, `session_id`, `error_type`, `tokens_received_before_error` |
| `tui.agent_message.scroll_mode_entered` | User presses Esc to scroll | `owner`, `repo`, `session_id`, `message_count`, `was_streaming` |
| `tui.agent_message.autoscroll_paused` | User scrolls up during streaming | `owner`, `repo`, `session_id`, `scroll_position_pct` |
| `tui.agent_message.autoscroll_resumed` | User presses G or f | `owner`, `repo`, `session_id` |

### Common event properties
All events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `color_mode` ("truecolor" | "256" | "16"), `layout` ("compact" | "standard" | "expanded").

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Message send success rate | > 98% | % of submitted → succeeded |
| Retry success rate | > 90% | % of retried → succeeded on retry |
| Agent response rate | > 95% | % of succeeded → stream_completed |
| Time to first token (median) | < 3 seconds | From send to first SSE token |
| Stream completion rate | > 95% | % of stream_started → stream_completed |
| Mean message length | > 30 chars | Indicates substantive queries |
| Messages per session (mean) | > 3 | Indicates multi-turn engagement |
| Scroll mode usage rate | < 30% | Most users read inline without scrolling back |
| Retry rate after failure | > 70% | Users recover from errors |

## Observability

### Logging requirements

| Log level | Event | Message format |
|-----------|-------|----------------|
| `debug` | Input focused | `AgentMessageSend: input focused [session={id}] [status={s}]` |
| `debug` | Typing | `AgentMessageSend: typing [length={len}] [lines={n}]` (debounced 1/sec) |
| `debug` | Input resized | `AgentMessageSend: input resize [height={h}] [maxHeight={max}]` |
| `debug` | Auto-scroll toggled | `AgentMessageSend: autoscroll [enabled={bool}] [position={pct}%]` |
| `info` | Message submitted | `AgentMessageSend: submitted [session={id}] [body_length={len}]` |
| `info` | Message created | `AgentMessageSend: created [session={id}] [message_id={mid}] [duration={ms}ms]` |
| `info` | Stream started | `AgentMessageSend: stream started [session={id}] [thinking_ms={ms}]` |
| `info` | Stream completed | `AgentMessageSend: stream completed [session={id}] [tokens={n}] [duration={ms}ms]` |
| `info` | Retry attempted | `AgentMessageSend: retry [session={id}] [attempt={n}] [original_error={code}]` |
| `warn` | Slow submission | `AgentMessageSend: slow submit [duration={ms}ms]` (>2000ms) |
| `warn` | Slow first token | `AgentMessageSend: slow first token [thinking_ms={ms}]` (>5000ms) |
| `warn` | Rate limited | `AgentMessageSend: rate limited [retry_after={s}s]` |
| `warn` | SSE reconnecting | `AgentMessageSend: SSE reconnecting [session={id}] [attempt={n}] [backoff={ms}ms]` |
| `error` | Submission failed | `AgentMessageSend: failed [session={id}] [status={code}] [error={msg}]` |
| `error` | Auth error | `AgentMessageSend: auth error [status=401]` |
| `error` | Permission denied | `AgentMessageSend: permission denied [status=403]` |
| `error` | Stream error | `AgentMessageSend: stream error [session={id}] [error={msg}] [tokens_received={n}]` |
| `error` | SSE disconnect | `AgentMessageSend: SSE disconnect [session={id}] [was_streaming={bool}]` |
| `error` | Render error | `AgentMessageSend: render error [component={name}] [error={msg}]` |

### Error cases specific to TUI

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize while typing | Layout recalculates synchronously; input content/cursor preserved | Automatic |
| Terminal resize below 80×24 while typing | "Terminal too small" shown; input content preserved in memory | Resize back above 80×24 restores input |
| Terminal resize during streaming response | Layout adjusts; streaming continues; tokens render normally | Automatic |
| SSE disconnect during streaming | "Connection lost — reconnecting…" indicator appears below partial response | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s); fetch missed messages on reconnect |
| SSE disconnect before response starts | Thinking indicator persists; on reconnect, check for response via messages API | Auto-reconnect; poll messages API as fallback |
| Auth token expires while typing | Next Enter fails with 401; auth error shown; input retains content | Re-authenticate via CLI, relaunch TUI |
| Auth token expires during streaming | SSE disconnects; "Session expired" shown; partial response preserved | Re-authenticate via CLI |
| Network timeout during submission | Fails after 10s timeout; message marked failed; input retains content | Retry with `r` or `Enter` |
| Server 500 during submission | Message marked failed with `✗`; error hint shown | Retry with `r` |
| Session becomes inactive during typing | Server returns 400/422 on next send; input disabled; status banner shown | User reads banner; cannot send more messages |
| Agent run times out (session status → timed_out) | SSE emits timeout event; session status updates; input disabled | User creates new session |
| Very long message (100k+ chars) | Server may return 413/422; error displayed inline | User shortens content |
| Very long agent response (100k+ tokens) | Virtualized rendering; memory stable; conversation scrollbox handles it | Automatic |
| Rapid Enter presses | Only first send executes; subsequent ignored while in-flight | First submission completes normally |
| Ctrl+C while typing | TUI quits immediately; draft lost | Relaunch TUI |
| Ctrl+C during streaming | TUI quits; partial response lost (server-side agent run continues) | Relaunch TUI; session history shows messages up to disconnect |
| Terminal has no color support | Borders use ASCII `+`, `-`, `|`; roles use bold/underline instead of color | Detected by TUI_THEME_AND_COLOR_TOKENS |
| SSE event with malformed JSON | Event skipped; logged as warning | Next valid event renders normally |
| Agent response contains raw ANSI codes | Passed through to terminal (agent output is trusted for ANSI) | Automatic |
| Multiple concurrent SSE reconnection attempts | Deduplicated; only one reconnection in progress at a time | Manager handles dedup |

### Failure modes and recovery
- **Input component crash**: Wrapped in error boundary within chat screen. Shows "Input error — press `i` to try again." Conversation history remains visible.
- **Streaming render crash**: Error boundary catches markdown rendering failure. Partial response shown as plain text. "Rendering error — content may be incomplete." shown.
- **SSE manager failure**: Falls back to polling messages API every 2 seconds. Status bar shows "Polling mode" instead of "Connected".
- **Optimistic update inconsistency**: Server response replaces optimistic message. If server returns different content (shouldn't for user messages), server content wins.
- **Memory pressure from long streaming**: Virtualized conversation rendering for 500+ messages. Older messages outside viewport are not kept in DOM.
- **Network disconnect during typing**: No immediate effect. Submission fails on Enter. Error directs user to check connection.

## Verification

### Terminal snapshot tests

```
SNAP-MSG-SEND-001: Chat screen with empty input at 120x40
  → Open agent chat session
  → Assert input panel at bottom with "Send a message…" placeholder, primary border, "Enter:send" hint

SNAP-MSG-SEND-002: Chat screen with empty input at 80x24
  → Open agent chat at 80×24
  → Assert compact layout: input 3 rows, conversation fills remaining space

SNAP-MSG-SEND-003: Chat screen with empty input at 200x60
  → Open agent chat at 200×60
  → Assert expanded layout with generous spacing

SNAP-MSG-SEND-004: Input with single-line text
  → Type "What is jj rebase?"
  → Assert text in input, cursor at end, border primary

SNAP-MSG-SEND-005: Input with multi-line text
  → Type "Please review this code:" Shift+Enter "fn main() {}" Shift+Enter "Is it correct?"
  → Assert 3-line input, expanded height, content wraps

SNAP-MSG-SEND-006: Input at maximum expansion height
  → Type 20 lines of text
  → Assert input capped at 30% of content area, internal scrollbar visible

SNAP-MSG-SEND-007: User message bubble after send
  → Type "Hello agent", Enter
  → Assert user bubble with @username, message body, pending indicator, thinking spinner below

SNAP-MSG-SEND-008: Thinking indicator while waiting for response
  → Send message, before SSE tokens
  → Assert braille spinner with "Agent is thinking…" in muted color

SNAP-MSG-SEND-009: Streaming assistant response
  → Send message, receive partial SSE tokens "Here is the" "answer to"
  → Assert assistant bubble with incrementally rendered markdown content

SNAP-MSG-SEND-010: Completed assistant response
  → Full response streamed, done event received
  → Assert finalized assistant bubble, no spinner, input re-enabled

SNAP-MSG-SEND-011: Failed message with retry hint
  → Send message, API returns 500
  → Assert user bubble with red ✗, "Failed to send. Press r to retry."

SNAP-MSG-SEND-012: Auth error (401)
  → Send message, API returns 401
  → Assert "Session expired" message, input area shows auth error

SNAP-MSG-SEND-013: Permission denied (403)
  → Send message, API returns 403
  → Assert "Permission denied" message in error color

SNAP-MSG-SEND-014: Rate limit error (429)
  → Send message, API returns 429
  → Assert "Rate limit exceeded" message, input retains content

SNAP-MSG-SEND-015: Sending state (input disabled)
  → Press Enter on non-empty input
  → Assert input greyed out, "Sending…" replaces hint

SNAP-MSG-SEND-016: Read-only session (completed)
  → Open completed session
  → Assert no input panel, status banner "Session completed. This conversation is read-only."

SNAP-MSG-SEND-017: Read-only session (failed)
  → Open failed session
  → Assert no input panel, status banner "Session failed."

SNAP-MSG-SEND-018: Read-only session (timed_out)
  → Open timed-out session
  → Assert no input panel, status banner "Session timed out."

SNAP-MSG-SEND-019: New messages indicator when scrolled up
  → Send message, receive streaming response, scroll up
  → Assert "↓ New messages" indicator above input

SNAP-MSG-SEND-020: Help overlay from chat screen
  → Press ?
  → Assert help overlay with chat-specific keybindings

SNAP-MSG-SEND-021: Scroll mode status bar
  → Press Esc to enter scroll mode
  → Assert status bar shows scroll mode hints "j/k:scroll │ G:bottom │ i:type"

SNAP-MSG-SEND-022: Unauthenticated user view
  → No auth token, open chat screen
  → Assert "Sign in to interact. Run codeplane auth login." in place of input

SNAP-MSG-SEND-023: SSE disconnect indicator
  → SSE connection drops during streaming
  → Assert "Connection lost — reconnecting…" below partial response

SNAP-MSG-SEND-024: Multi-turn conversation layout
  → Send 3 messages with 3 responses
  → Assert alternating user/assistant bubbles, proper spacing, scroll position at bottom

SNAP-MSG-SEND-025: Empty input Enter is no-op
  → Focus on empty input, press Enter
  → Assert no change, no API call, no new message bubble
```

### Keyboard interaction tests

```
KEY-MSG-SEND-001: Enter sends non-empty message → type "hello", Enter → Assert POST fired, input clears
KEY-MSG-SEND-002: Enter on empty input → no-op, no API call, no state change
KEY-MSG-SEND-003: Enter on whitespace-only → no-op, no API call
KEY-MSG-SEND-004: Shift+Enter inserts newline → "line1" Shift+Enter "line2" → Assert "line1\nline2" in input
KEY-MSG-SEND-005: Double-submit prevention → type "test", Enter, Enter → Assert only one POST
KEY-MSG-SEND-006: Esc on empty input → pops screen to session list
KEY-MSG-SEND-007: Esc on non-empty input → switches to scroll mode, input retains content
KEY-MSG-SEND-008: i from scroll mode → returns focus to input
KEY-MSG-SEND-009: j/k in scroll mode → scrolls conversation up/down
KEY-MSG-SEND-010: G in scroll mode → jumps to bottom, resumes auto-scroll
KEY-MSG-SEND-011: g g in scroll mode → jumps to top of conversation
KEY-MSG-SEND-012: Ctrl+D in scroll mode → page down
KEY-MSG-SEND-013: Ctrl+U in scroll mode → page up
KEY-MSG-SEND-014: r retries failed message → Assert POST fired with same body
KEY-MSG-SEND-015: r when no failed message → types 'r' in input (normal character)
KEY-MSG-SEND-016: q on empty input → pops screen
KEY-MSG-SEND-017: q on non-empty input → types 'q' in input (normal character)
KEY-MSG-SEND-018: ? shows help overlay → Assert overlay visible, Esc closes it, input still active
KEY-MSG-SEND-019: : on empty unfocused input → opens command palette
KEY-MSG-SEND-020: Ctrl+C quits TUI from any state
KEY-MSG-SEND-021: f toggles auto-scroll follow mode
KEY-MSG-SEND-022: Text editing: Home moves to start of line
KEY-MSG-SEND-023: Text editing: End moves to end of line
KEY-MSG-SEND-024: Text editing: Ctrl+K kills to end of line
KEY-MSG-SEND-025: Text editing: Ctrl+A moves to start of line
KEY-MSG-SEND-026: Text editing: Ctrl+E moves to end of line
KEY-MSG-SEND-027: Backspace deletes character before cursor
KEY-MSG-SEND-028: Delete deletes character after cursor
KEY-MSG-SEND-029: Arrow keys navigate within multi-line input
KEY-MSG-SEND-030: Input clears after successful send
KEY-MSG-SEND-031: Input retains content after failed send
KEY-MSG-SEND-032: Optimistic message appears immediately after Enter
KEY-MSG-SEND-033: Thinking indicator appears after successful send
KEY-MSG-SEND-034: Thinking indicator replaced by streaming content
KEY-MSG-SEND-035: Failed message marked with ✗ on error
KEY-MSG-SEND-036: Retry replaces failed indicator with sending state
KEY-MSG-SEND-037: Go-to keybindings (g d, g r, etc.) work in scroll mode
KEY-MSG-SEND-038: Tab does not insert tab character in input
KEY-MSG-SEND-039: Printable character from scroll mode → focuses input and types character
KEY-MSG-SEND-040: Body trimmed before send → "  hello  " becomes "hello"
```

### Responsive tests

```
RESIZE-MSG-SEND-001: Input 3 rows default at 80×24
RESIZE-MSG-SEND-002: Input 3 rows default at 120×40
RESIZE-MSG-SEND-003: Input 3 rows default at 200×60
RESIZE-MSG-SEND-004: Input max 5 rows at 80×24 with long content
RESIZE-MSG-SEND-005: Input max 8 rows at 120×40 with long content
RESIZE-MSG-SEND-006: Input max 12 rows at 200×60 with long content
RESIZE-MSG-SEND-007: 120×40 → 80×24 while typing → content preserved, height shrinks
RESIZE-MSG-SEND-008: 80×24 → 120×40 while typing → content preserved, height can grow
RESIZE-MSG-SEND-009: Below minimum while typing → "too small", resize back restores
RESIZE-MSG-SEND-010: Rapid resize sequence → clean layout, content and cursor preserved
RESIZE-MSG-SEND-011: Resize during sending state → "Sending…" preserved, completes normally
RESIZE-MSG-SEND-012: Resize during streaming response → tokens continue rendering
RESIZE-MSG-SEND-013: Resize during thinking indicator → spinner continues
RESIZE-MSG-SEND-014: Input width fills available space at each breakpoint
RESIZE-MSG-SEND-015: Conversation area adjusts when input expands/contracts
RESIZE-MSG-SEND-016: 200×60 → 80×24 during streaming → conversation compressed, stream continues
```

### Edge case tests

```
EDGE-MSG-SEND-001: 10k+ character single-line message → wraps in input, sends correctly
EDGE-MSG-SEND-002: 1000+ line message → input scrollbox handles, sends correctly
EDGE-MSG-SEND-003: Unicode/emoji in message → renders correctly in input and bubble
EDGE-MSG-SEND-004: Markdown in message → plain text in input, raw markdown sent to server
EDGE-MSG-SEND-005: Raw ANSI codes in user message → treated as literal text in input
EDGE-MSG-SEND-006: Agent response with code blocks → markdown rendered with syntax highlighting
EDGE-MSG-SEND-007: Agent response with very long code block → scrollable within bubble
EDGE-MSG-SEND-008: Immediate Enter after opening chat → no-op (input is empty)
EDGE-MSG-SEND-009: Multiple rapid Enter presses → only first send, others ignored
EDGE-MSG-SEND-010: Paste + immediate Enter → processes correctly, sends pasted content
EDGE-MSG-SEND-011: NO_COLOR=1 → bold/underline instead of color for message roles
EDGE-MSG-SEND-012: SSE reconnect during streaming → missed tokens fetched via messages API
EDGE-MSG-SEND-013: SSE timeout (no events for 30s) → reconnect triggered
EDGE-MSG-SEND-014: Agent response empty (done event with no tokens) → empty assistant bubble shown
EDGE-MSG-SEND-015: Session transitions to completed during typing → input disabled on next server interaction
EDGE-MSG-SEND-016: Send message to session with 1000 existing messages → appends correctly, history paginated
EDGE-MSG-SEND-017: Conversation with mixed tool_call/tool_result messages → renders appropriately
EDGE-MSG-SEND-018: Server returns different message content → server content wins over optimistic
EDGE-MSG-SEND-019: Network disconnect then reconnect → submit succeeds after reconnect
EDGE-MSG-SEND-020: Ctrl+S as force-retry from input with retained content after failure
```

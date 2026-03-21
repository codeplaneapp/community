# AGENT_SESSION_REPLAY_UI

Specification for AGENT_SESSION_REPLAY_UI.

## High-Level User POV

When an agent session in Codeplane finishes — whether it completed successfully, failed, or timed out — users need a way to go back and review the full conversation that took place. The Agent Session Replay UI is that experience: a read-only, richly rendered transcript viewer that lets anyone with repository access revisit what happened during an agent session after it has ended.

Imagine a developer who kicked off an agent session from the CLI at the start of the day to investigate a tricky authentication bug. Hours later, they return to the web UI, navigate to the repository's agent sessions page, and open the completed session. The replay presents the entire conversation as a navigable document: the developer's original prompt, the agent's reasoning, every tool the agent called along the way (file reads, code searches, test executions), the results those tools returned, and the agent's final conclusions. Tool invocations are shown as collapsible blocks so the developer can skim the high-level flow or drill into the details of any specific step. A session summary at the top shows the session status, how long it ran, how many messages were exchanged, and whether it was linked to a workflow run.

For team leads reviewing agent work before approving a landing request, the replay UI provides the audit trail. They can search within the transcript to find specific tool calls or keywords, navigate between messages using keyboard shortcuts, and expand or collapse tool blocks to control the level of detail. The replay makes agent behavior transparent and reviewable — it turns what would otherwise be a black box into an open book.

The replay experience is consistent across every Codeplane client surface. In the web UI, it is a dedicated page with markdown rendering, syntax highlighting, and responsive layout. In the TUI, it is a vim-navigable screen with collapsible tool blocks and full-text search. In the CLI, a `--messages` flag on the session view command prints the full transcript. In editor integrations, users can jump directly from a status indicator to the web replay view. Regardless of the surface, the replay always shows the same data, in the same order, with the same tool-transparency guarantees.

The replay UI automatically recognizes when a session is in a terminal state (completed, failed, or timed out) and presents the read-only experience. If a user accidentally navigates to a replay URL for an active session, they are seamlessly redirected to the live chat view instead. Conversely, if a user is on the live chat screen when a session ends, the view transitions smoothly into replay mode without requiring a page refresh.

The core value of the replay UI is trust and accountability. Without it, agent-produced changes are suggestions with no visible provenance. With it, every step the agent took is permanently reviewable, searchable, and shareable — giving teams the confidence to act on agent work.

## Acceptance Criteria

### Definition of Done

- The replay UI is accessible at `/:owner/:repo/agents/sessions/:sessionId` in the web UI when the session status is `completed`, `failed`, or `timed_out`
- The TUI `AgentSessionReplayScreen` renders a complete, read-only transcript for terminal-state sessions
- The CLI `codeplane agent session view <id> --messages` outputs the full transcript for terminal-state sessions
- All messages are loaded via auto-pagination (sequentially fetching all pages) and displayed in sequence order
- The feature is gated behind the `AGENT_SESSION_REPLAY_UI` feature flag
- All acceptance criteria below are validated by passing integration and e2e tests

### Session Metadata and Summary

- [ ] Session title is displayed, truncated with ellipsis at display boundary (stored max: 255 characters), with tooltip showing full title on hover (web) or on expand (TUI)
- [ ] Session status is displayed with a visual badge: `completed` (✓ green), `failed` (✗ red), `timed_out` (⏱ yellow)
- [ ] A "REPLAY" badge or indicator is displayed in the header to clearly signal read-only mode
- [ ] Session duration is computed and displayed as `finished_at − started_at` in human-friendly format ("5m 22s", "1h 3m")
- [ ] If `finished_at` is null (edge case for terminal states), duration shows "—"
- [ ] Message count is displayed as an integer
- [ ] If `workflow_run_id` is non-null, a clickable link to the associated workflow run detail page is shown
- [ ] If `workflow_run_id` is null, no workflow link is shown
- [ ] Session creator user ID or username is displayed
- [ ] Creation timestamp is shown in relative format with exact ISO-8601 available on hover/demand

### Message Display

- [ ] All messages from the session are loaded automatically via sequential page fetching (auto-pagination)
- [ ] Messages are displayed in `sequence` ascending order
- [ ] Each message shows its role with a visual label: "You" for user, "Agent" for assistant, "System" for system, "Tool" for tool
- [ ] Each message shows a relative timestamp
- [ ] Text parts render as markdown with syntax-highlighted fenced code blocks
- [ ] Tool call parts display the tool name, a collapsed summary (60–120 characters depending on viewport), and expand on user action to reveal full JSON input
- [ ] Tool result parts display the tool name, a success (✓) or error (✗) indicator, a collapsed summary, and expand to reveal full output
- [ ] Tool call/result content exceeding 64KB is truncated with a visible "Content truncated (64KB limit)" indicator
- [ ] Messages with an empty `parts` array render with a placeholder ("Empty message") or are skipped
- [ ] Malformed parts (unknown `partType`) are rendered as raw JSON with a warning indicator
- [ ] No message input area is displayed — the transcript is strictly read-only

### Navigation and Interaction

- [ ] Users can scroll through the full transcript
- [ ] Full-text search within the transcript is available (Ctrl+F / Cmd+F on web; `/` on TUI)
- [ ] Search highlights matches in-context and supports next/previous navigation
- [ ] Tool blocks can be individually expanded/collapsed by clicking (web) or pressing `x` (TUI)
- [ ] A "toggle all tool blocks" action expands or collapses all tool blocks at once (`X` in TUI; button in web)
- [ ] Keyboard navigation is supported in the TUI: `j`/`k` for line scroll, `]`/`[` to jump between messages, `G` to jump to end, `gg` to jump to start

### State Transitions

- [ ] If a user navigates to the replay URL for a session that is `active` or `pending`, they are redirected to the live chat view
- [ ] If a session transitions from `active` to a terminal state while the live chat is open, the view transitions to replay mode without requiring a full page reload
- [ ] The transition from chat to replay adds the session summary block, removes the input area, and loads any remaining messages

### Auto-Pagination and Performance

- [ ] Auto-pagination fetches all pages sequentially with a default page size of 30 per request
- [ ] A loading indicator is shown while pages are being fetched
- [ ] Progress is indicated: "Loading messages… (120 of 342)" or equivalent
- [ ] Auto-pagination stops at a memory cap of 10,000 messages
- [ ] If a session has more than 10,000 messages, a warning is shown: "Showing first 10,000 messages. Use the API to access the full transcript."
- [ ] Sessions with 0 messages display an empty state: "This session has no messages."
- [ ] Auto-pagination handles network errors gracefully: retries the failed page up to 3 times with exponential backoff (1s, 2s, 4s) before showing an error with a manual retry button

### Edge Cases

- [ ] Sessions with exactly 1 message display correctly without layout issues
- [ ] Sessions with 500+ messages render with smooth scrolling and no perceptible lag
- [ ] Tool call parts with deeply nested JSON input (10+ levels) render without crash
- [ ] Messages containing Unicode, emoji, RTL text, zero-width characters, and HTML entities display correctly without XSS
- [ ] Title with 255 characters (maximum) displays correctly with truncation
- [ ] Title with 1 character (minimum) displays correctly
- [ ] Title with special characters (`<script>alert('xss')</script>`, `"quotes"`, `back\slashes`) displays safely
- [ ] A session that was deleted while the replay page is open shows a "Session not found" error on next data fetch
- [ ] Network timeout during auto-pagination shows a clear error and allows manual retry
- [ ] Replay of a `failed` session shows the failure status prominently
- [ ] Replay of a `timed_out` session shows a distinct timeout indicator

### Boundary Constraints

- Session title: 1–255 characters, trimmed, UTF-8
- Session ID: UUID v4 format (36 characters including hyphens)
- Message role: one of `user`, `assistant`, `system`, `tool`
- Part type: one of `text`, `tool_call`, `tool_result`
- Tool block content truncation threshold: 64KB per block
- Messages per API page: 1–50 (default 30)
- Auto-pagination memory cap: 10,000 messages
- Search query: 1–500 characters
- Minimum viewport for replay: 80×24 (TUI), 360px width (web)

## Design

### Web UI Design

**Route**: `/:owner/:repo/agents/sessions/:sessionId`

**Behavior**: When the session's status is `completed`, `failed`, or `timed_out`, the page renders in replay mode. When the session is `active` or `pending`, the same route renders the live chat view.

**Header Bar**:
- Left: Back arrow (returns to `/:owner/:repo/agents`), session title (truncated with tooltip), status badge (colored pill), "REPLAY" badge (muted/outlined)
- Right: Session ID (copyable on click), creation timestamp, workflow run link (if applicable)

**Session Summary Card** (below header, above transcript):
- Status icon and label
- Duration: `finished_at − started_at` formatted as "Xh Ym Zs"
- Message count
- Workflow run link (if applicable)
- Creator username/avatar

**Message Transcript Area**:
- Full-height scrollable region
- User messages: right-aligned bubble, primary background
- Assistant messages: left-aligned, subtle background, agent icon
- System messages: centered, muted styling
- Tool messages: left-aligned, collapsible detail blocks
- Markdown rendering: headings, bold, italic, code spans, fenced code blocks with syntax highlighting, lists, links, blockquotes
- Tool call blocks: collapsed showing `🔧 tool_name — summary…`, expandable to full JSON input
- Tool result blocks: collapsed showing `✓ tool_name — summary…` (or `✗` for errors), expandable to full output
- Content truncation: blocks exceeding 64KB show "Content truncated" with byte count

**Search Overlay** (Ctrl+F / Cmd+F):
- Search input pinned to top of transcript area
- Matches highlighted in transcript with current-match emphasis
- Navigation arrows: previous (↑) and next (↓) match
- Match count: "3 of 17 matches"
- Escape closes search and clears highlights

**Responsive Behavior**:
- ≤768px: Full-width messages (no offset alignment), tool summaries shortened to 60 chars, session ID hidden (copy icon only)
- 769–1200px: Standard layout with message alignment, tool summaries 90 chars
- ≥1201px: Full layout with tool summaries 120 chars, metadata sidebar

**No Input Area**: The bottom of the page shows the session summary card. No message input is rendered.

### API Shape

The replay UI consumes two existing API endpoints. No new API endpoints are required.

**Get Session Detail**:
```
GET /api/repos/:owner/:repo/agent/sessions/:id
```
Returns session metadata including `status`, `title`, `messageCount`, timestamps, and `workflowRunId`. The replay UI uses the `status` field to determine whether to render in replay mode.

**List Session Messages** (auto-paginated):
```
GET /api/repos/:owner/:repo/agent/sessions/:id/messages?page=N&per_page=30
```
Returns paginated messages in `sequence ASC` order with parts. The replay UI fetches all pages sequentially.

### SDK Shape (ui-core)

The replay UI consumes existing hooks from `@codeplane/ui-core`:

**`useAgentSession(owner, repo, sessionId)`** — Fetches session metadata. The replay UI checks `session.status` to decide between replay and chat rendering.

**`useAgentMessages(owner, repo, sessionId, { autoPaginate: true })`** — Fetches all messages sequentially. When `autoPaginate` is `true`, the hook fetches page 1, then page 2, etc., until an empty page is returned or the 10,000-message cap is reached.

No new hooks are required. The replay screen is a composition of existing data hooks with a read-only rendering layer.

### CLI Command

```
codeplane agent session view <id> --messages [--repo OWNER/REPO] [--page N] [--per-page N]
```

When `--messages` is passed and the session status is a terminal state, the CLI outputs the full transcript:

```
Session:  a1b2c3d4-e5f6-7890-abcd-ef1234567890
Title:    Fix authentication race condition
Status:   ✓ completed (REPLAY)
Started:  2026-03-22T10:30:00Z
Finished: 2026-03-22T10:35:22Z
Duration: 5m 22s
Messages: 14

─── Transcript ───────────────────────────────────────

[YOU] 10:30:05
Fix the login redirect bug in the auth middleware.

[AGENT] 10:30:08
I'll investigate the auth middleware. Let me start by reading the relevant files.

  🔧 read_file (input: {"path": "src/auth/middleware.ts"})
  ✓ read_file (output: 142 lines)

I found the issue. The redirect URL is not being URL-encoded...

[SYSTEM] 10:35:20
Session completed.
```

**JSON output** (`--json --messages`): Outputs the full messages array as valid JSON.

### TUI UI

**Screen**: `AgentSessionReplayScreen`

**Header**: Session title (truncated to terminal width − 30), status badge, "REPLAY" indicator, repo context

**Session Summary Block** (top of screen):
```
┌─ Session Summary ─────────────────────────────────┐
│ ✓ Completed  │  14 messages  │  5m 22s  │  Run #42 │
└───────────────────────────────────────────────────┘
```

**Transcript Area**: Full message history, scrollable, vim-navigable

**Message Rendering**:
- Role labels with color: `[YOU]` (blue), `[AGENT]` (green), `[SYS]` (gray), `[TOOL]` (cyan)
- Text parts: inline markdown (bold, code spans, code blocks)
- Tool blocks: collapsed by default showing `▸ tool_name — summary…`, expanded showing `▾ tool_name` with indented content

**Responsive Layout**:

| Element | 80×24 (minimum) | 120×40 (standard) | 200×60+ (large) |
|---------|:---:|:---:|:---:|
| Padding | 0 | 2ch | 4ch |
| Timestamps | hidden | relative | relative |
| Tool summaries | tool name only | 60 chars | 120 chars |
| Position indicator | "N/M" | "Message N of M" | "Message N of M" |
| Metadata sidebar | hidden | hidden | 25ch right column |

**Keybindings**:

| Key | Action |
|-----|--------|
| `j` / `↓` | Scroll down one line |
| `k` / `↑` | Scroll up one line |
| `Ctrl+D` | Scroll down half page |
| `Ctrl+U` | Scroll up half page |
| `G` | Jump to end of transcript |
| `gg` | Jump to start of transcript |
| `]` | Jump to next message |
| `[` | Jump to previous message |
| `x` | Toggle current tool block expand/collapse |
| `X` | Toggle all tool blocks expand/collapse |
| `/` | Open search overlay |
| `n` | Next search match |
| `N` | Previous search match |
| `y` | Copy current message to clipboard (OSC 52) |
| `q` / `Esc` | Back to session list |

**Deep-Link**: `--screen agent-replay --repo owner/repo --session-id {id}`

### Neovim Plugin API

```vim
:Codeplane agent session replay <id>
```

Opens the session replay in the user's default browser, navigating to the web UI replay page. Alternatively, displays a Telescope picker with session messages for quick metadata review.

### VS Code Extension

- "Replay Agent Session" command available from the agent sessions tree view
- Opens the replay page in the embedded Codeplane webview
- Context menu on completed/failed/timed-out sessions in the tree view

### Documentation

1. **"Reviewing Agent Sessions with Replay"** guide — Explains what replay mode is, when it activates (session in terminal state), how to navigate the transcript, how to search, how to expand/collapse tool blocks, and how to read the session summary. Covers Web UI, CLI, and TUI with screenshots/examples.
2. **"Agent Session Keyboard Shortcuts"** reference — Full table of replay keybindings for web and TUI, including search, navigation, and tool block controls.
3. **CLI reference update** — Document the `--messages` flag on `agent session view`, with an example showing replay output for a completed session.
4. **API reference** — No new endpoints, but document the auto-pagination pattern (sequential page fetching) as a recommended client integration pattern for replay.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member | Admin | Owner |
|--------|:---------:|:---------:|:------:|:-----:|:-----:|
| View replay transcript | ✗ | ✓ | ✓ | ✓ | ✓ |
| Search within transcript | ✗ | ✓ | ✓ | ✓ | ✓ |
| Copy message content | ✗ | ✓ | ✓ | ✓ | ✓ |
| Delete session from replay | ✗ | ✗ | Own only | ✓ | ✓ |

- **Authentication required**: All replay endpoints require an authenticated user (session cookie, PAT, or OAuth token). Unauthenticated requests receive `401 Unauthorized`.
- **Repository read access required**: The user must have at least read access to the parent repository. Requests without sufficient access receive `404 Not Found` (not 403, to avoid leaking repository existence).
- **Session scoping**: Sessions are scoped to a repository. A session ID that exists in a different repository than the one specified in the URL path returns 404, preventing cross-repository session enumeration.
- **No write operations**: The replay UI is strictly read-only. The only mutation available is session deletion, which follows the same ownership rules as other deletion flows.

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| GET session detail | 300 req | 1 minute | per user per repo |
| GET session messages | 300 req | 1 minute | per user per repo |

Auto-pagination for replay will typically make 1 + ceil(messageCount / 30) requests in rapid succession. The 300 req/min limit accommodates sessions up to ~9,000 messages before hitting the limit. For sessions approaching the 10,000-message cap, clients should insert a 200ms delay between page fetches to avoid transient rate limiting.

### Data Privacy

- Agent session messages may contain PII, proprietary code, secrets, or sensitive repository content. The replay must enforce the same access controls as the parent repository.
- Session transcripts are not indexed by the global search service. Only intra-transcript search (client-side) is available.
- Tool call inputs and tool result outputs may contain file contents, shell outputs, or API responses stored as JSONB — these must not be leaked outside the repository's access boundary.
- Clipboard copy (OSC 52 in TUI, navigator.clipboard in web) operates on content the user can already see; no additional privacy concern.
- Content is rendered with XSS protections: HTML entities in tool outputs and message text are escaped before DOM insertion (web) or rendered as literal text (TUI/CLI).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `AgentSessionReplayOpened` | User opens a terminal-state session in replay mode | `sessionId`, `sessionStatus` (completed/failed/timed_out), `repositoryId`, `userId`, `clientSurface` (web/tui/cli/editor), `messageCount`, `sessionDurationSeconds` |
| `AgentSessionReplayCompleted` | User scrolls to or navigates to the last message in the transcript | `sessionId`, `repositoryId`, `userId`, `clientSurface`, `messageCount`, `viewDurationSeconds`, `toolBlocksExpanded` (count) |
| `AgentSessionReplaySearchUsed` | User performs a search within the replay transcript | `sessionId`, `repositoryId`, `clientSurface`, `queryLength`, `matchCount` |
| `AgentSessionReplayToolBlockExpanded` | User expands a tool call or tool result block | `sessionId`, `toolName`, `partType` (tool_call/tool_result), `clientSurface`, `contentSizeBytes` |
| `AgentSessionReplayToolBlockToggleAll` | User toggles all tool blocks at once | `sessionId`, `clientSurface`, `action` (expand/collapse), `toolBlockCount` |
| `AgentSessionReplayMessageCopied` | User copies a message to clipboard | `sessionId`, `clientSurface`, `messageRole`, `contentLength` |
| `AgentSessionReplayAutoPaginationCompleted` | All message pages have been fetched | `sessionId`, `totalMessages`, `totalPages`, `totalLoadTimeMs`, `hitMemoryCap` (boolean) |
| `AgentSessionReplayError` | An error occurs during replay (load failure, pagination error) | `sessionId`, `clientSurface`, `errorType`, `errorMessage`, `retryAttempt` |
| `AgentSessionReplayTransitionFromChat` | User's view transitions from live chat to replay after session ends | `sessionId`, `clientSurface`, `messagesAlreadyLoaded`, `additionalMessagesLoaded` |

### Funnel Metrics

1. **Session List → Replay open rate**: % of completed/failed/timed_out sessions that are viewed in replay at least once. Target: >30%.
2. **Replay completion rate**: % of replay opens where the user reaches the last message. Target: >50%. Low completion suggests transcripts are too long or users find what they need early.
3. **Tool block inspection rate**: % of replays where at least one tool block is expanded. Target: >40%. Low rates may indicate tool blocks are not discoverable or users don't need tool details.
4. **Search usage rate**: % of replays where search is used. Expected: 10–20% for short sessions, higher for long sessions. Track correlation with message count.
5. **Cross-client distribution**: Breakdown of replay opens by client surface. Expect web to dominate, with meaningful TUI and CLI usage.
6. **Time-to-replay**: Median time between session completion and first replay view. Short times suggest replay is part of the workflow; long times suggest it's used for audit/review.

### Success Indicators

- Users who view replays are more likely to create new agent sessions (replay builds trust → more agent usage)
- Average tool block expansion count per replay session increases over time (users are learning to inspect agent behavior)
- Fewer than 1% of replay auto-pagination sequences encounter errors
- Replay load time (full auto-pagination) is under 3 seconds for sessions with ≤100 messages

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Replay page loaded | `info` | `sessionId`, `userId`, `repositoryId`, `status`, `clientSurface` |
| Session metadata fetched for replay | `info` | `sessionId`, `userId`, `status`, `messageCount`, `durationMs` |
| Session not found during replay | `warn` | `sessionId`, `userId`, `repositoryId` |
| Session access denied for replay | `warn` | `sessionId`, `userId`, `repositoryId`, `requiredPermission` |
| Messages page fetched (auto-pagination) | `debug` | `sessionId`, `userId`, `page`, `perPage`, `resultCount`, `durationMs` |
| Auto-pagination completed | `info` | `sessionId`, `userId`, `totalMessages`, `totalPages`, `totalDurationMs`, `hitCap` |
| Auto-pagination page fetch failed | `error` | `sessionId`, `userId`, `page`, `errorCode`, `errorMessage`, `retryAttempt` |
| Auto-pagination hit memory cap | `warn` | `sessionId`, `userId`, `totalMessages`, `cap` (10000) |
| Replay session deleted | `info` | `sessionId`, `userId`, `deletedByUserId`, `messageCount` |
| Rate limit exceeded during replay pagination | `warn` | `userId`, `sessionId`, `endpoint`, `currentRate`, `limit` |
| Redirect from replay to chat (active session) | `info` | `sessionId`, `userId`, `clientSurface` |
| Transition from chat to replay (session ended) | `info` | `sessionId`, `userId`, `clientSurface`, `previousStatus`, `newStatus` |

### Prometheus Metrics

**Counters**:
- `codeplane_agent_replay_opens_total{session_status, client_surface}` — Total replay page opens
- `codeplane_agent_replay_completions_total{client_surface}` — Total replays where user reached end of transcript
- `codeplane_agent_replay_searches_total{client_surface}` — Total search operations within replay
- `codeplane_agent_replay_tool_expansions_total{part_type, client_surface}` — Total tool block expansions
- `codeplane_agent_replay_message_copies_total{client_surface}` — Total message copy actions
- `codeplane_agent_replay_pagination_errors_total{error_type}` — Total auto-pagination errors
- `codeplane_agent_replay_redirects_total{direction}` — Total redirects (replay→chat, chat→replay)

**Gauges**:
- `codeplane_agent_replay_active_viewers` — Currently active replay viewers (approximated by in-flight pagination sequences)

**Histograms**:
- `codeplane_agent_replay_load_duration_seconds{client_surface}` — Total time to complete auto-pagination (all pages)
- `codeplane_agent_replay_page_fetch_duration_seconds` — Per-page fetch latency during auto-pagination
- `codeplane_agent_replay_message_count{session_status}` — Distribution of message counts in replayed sessions
- `codeplane_agent_replay_view_duration_seconds{client_surface}` — Time spent on the replay screen

### Alerts & Runbooks

#### Alert: `AgentReplayLoadErrorRateHigh`

**Condition**: `rate(codeplane_agent_replay_pagination_errors_total[5m]) > 0.05 * rate(codeplane_agent_replay_opens_total[5m])`

**Severity**: Warning (>5%), Critical (>20%)

**Runbook**:
1. Check structured logs filtered by `error` level and `auto-pagination page fetch failed` events for patterns (specific session IDs, repositories, error codes).
2. Verify database connectivity — the messages list query joins `agent_messages` with `agent_parts`, which can fail under load.
3. Check for query timeouts on the `listAgentMessages` query. If sessions with high message counts are causing timeouts, consider adding an index on `agent_parts(message_id, part_index)`.
4. Verify rate limiting is not triggering during auto-pagination bursts. Check `Rate limit exceeded during replay pagination` log entries. If so, increase the per-user rate limit for the messages endpoint or add inter-page delays to the client.
5. If errors are concentrated on specific sessions, check for data corruption (orphaned parts, invalid JSONB in content column).
6. Escalate to database team if query execution plans have regressed.

#### Alert: `AgentReplayLoadLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_agent_replay_load_duration_seconds_bucket[5m])) > 10`

**Severity**: Warning (>10s p95), Critical (>30s p95)

**Runbook**:
1. Check `codeplane_agent_replay_message_count` distribution — latency correlates with message count. If a few very large sessions are skewing p95, this may be acceptable.
2. Check per-page fetch latency via `codeplane_agent_replay_page_fetch_duration_seconds` — if individual pages are slow, the issue is in the database query.
3. Verify database connection pool is not saturated (auto-pagination makes many sequential requests).
4. Check for lock contention on `agent_messages` — concurrent appends to active sessions can conflict with reads on the same table.
5. If the database is healthy but latency is high, consider implementing a server-side "export full transcript" endpoint that returns all messages in a single response, bypassing pagination overhead.
6. For sessions at the 10,000-message cap, latency up to 30s may be acceptable; consider adjusting the alert threshold based on the message count distribution.

#### Alert: `AgentReplayMemoryCapHitRate`

**Condition**: `rate(codeplane_agent_replay_pagination_errors_total{error_type="memory_cap_hit"}[1h]) > 10`

**Severity**: Warning

**Runbook**:
1. This alert fires when many users are hitting the 10,000-message cap. This is informational — the cap prevents OOM on the client.
2. Check which sessions are exceeding 10,000 messages. These are likely runaway agent sessions that should be investigated for timeout configuration.
3. If the cap is routinely hit, consider whether the stale session cleanup scheduler needs tighter timeout bounds.
4. Consider implementing a server-side transcript export (e.g., downloadable JSON or text file) for users who need full transcripts beyond the cap.
5. No immediate action required unless users report data loss or confusion from the truncation warning.

### Error Cases and Failure Modes

| Error | Manifestation | Cause | Recovery |
|-------|---------------|-------|----------|
| Session not found | 404 page with "Session not found" | Session deleted, wrong repo, or invalid ID | Show error with "Back to sessions" link |
| Authentication expired | Redirect to login | Session/token expired during replay | Re-authenticate and return to replay URL |
| Repository access revoked | 404 page | Permission changed between navigation and load | Show error, return to repo list |
| Auto-pagination page failure | Inline error with retry button | Network timeout, database error, or rate limit | Retry button fetches the failed page; 3 auto-retries first |
| Rate limit during pagination | Pause and resume | Too many pages fetched too quickly | Client pauses 1s, then retries with exponential backoff |
| Memory cap reached | Warning banner: "Showing first 10,000 messages" | Session has >10,000 messages | Informational; suggest API access for full transcript |
| Malformed message part | Part rendered as raw JSON with ⚠️ | Unknown partType or corrupt content field | Defensive rendering; no crash |
| XSS in content | Content escaped and rendered as literal text | User or agent included HTML/script in messages | Framework-level escaping |
| Session status changed to active | Redirect to chat view | Session was restarted or status was corrected | Automatic redirect; no user action needed |

## Verification

### API Integration Tests

- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` for a completed session returns status `completed`, non-null `finishedAt`, and `messageCount`
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` for a failed session returns status `failed`
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` for a timed_out session returns status `timed_out`
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages?page=1&per_page=30` returns first 30 messages in sequence order
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages?page=2&per_page=30` returns the next page of messages
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` for a session with 0 messages returns empty array
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` for a session with exactly 1 message returns array of length 1
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` messages include `parts` array with correct `partType` values
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` parts within each message are ordered by `partIndex` ascending
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with `per_page=50` (maximum valid) returns up to 50 messages
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with `per_page=51` clamps to 50
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` sequential page fetching retrieves all messages (auto-pagination simulation: fetch page 1, 2, … until empty)
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` for a session with exactly 30 messages returns 30 on page 1 and 0 on page 2
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` for a session with 31 messages returns 30 on page 1 and 1 on page 2
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with invalid (non-UUID) session ID returns 400
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with non-existent UUID returns 404
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` without auth returns 401
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` for session in different repo returns 404
- [ ] Messages with `text` parts containing markdown (headings, code blocks, links) are returned verbatim
- [ ] Messages with `tool_call` parts include `id`, `name`, and `input` fields in content
- [ ] Messages with `tool_result` parts include `id`, `name`, `output`, and `isError` fields in content
- [ ] Messages with Unicode, emoji, and HTML entities in content are returned verbatim without server-side escaping
- [ ] Messages with tool_call content exceeding 64KB are stored and returned in full (truncation is client-side)
- [ ] Session with maximum title length (255 characters) returns full title in session detail
- [ ] Session with 1-character title returns correctly
- [ ] Session with special characters in title (`<>&"'`) returns without mutation
- [ ] Concurrent reads during session message append return consistent sequence ordering

### CLI E2E Tests

- [ ] `codeplane agent session view <completed-session-id> --repo owner/repo` outputs session metadata with "completed" status
- [ ] `codeplane agent session view <completed-session-id> --repo owner/repo --messages` outputs full transcript with role labels and tool blocks
- [ ] `codeplane agent session view <failed-session-id> --repo owner/repo --messages` outputs transcript with "failed" status
- [ ] `codeplane agent session view <timed-out-session-id> --repo owner/repo --messages` outputs transcript with "timed_out" status
- [ ] `codeplane agent session view <id> --messages --json` outputs messages array as valid JSON
- [ ] `codeplane agent session view <id> --messages --page 1 --per-page 5` paginates correctly
- [ ] `codeplane agent session view <id> --messages` for session with 0 messages outputs "No messages" indicator
- [ ] `codeplane agent session view <id> --messages` for session with 100+ messages outputs all messages across pages
- [ ] `codeplane agent session view <non-existent-id> --repo owner/repo` exits with non-zero code and error message
- [ ] `codeplane agent session view <id>` without auth exits with non-zero code and "Authentication required" message
- [ ] `codeplane agent session view <id> --messages` with messages containing emoji and Unicode renders correctly in terminal

### TUI E2E Tests

- [ ] `AgentSessionReplayScreen` renders loading state on mount with spinner
- [ ] `AgentSessionReplayScreen` renders session summary block after data loads (status, duration, message count)
- [ ] `AgentSessionReplayScreen` renders "REPLAY" badge in header
- [ ] `AgentSessionReplayScreen` renders all messages in sequence order after auto-pagination
- [ ] `AgentSessionReplayScreen` renders user messages with `[YOU]` role label
- [ ] `AgentSessionReplayScreen` renders assistant messages with `[AGENT]` role label
- [ ] `AgentSessionReplayScreen` renders system messages with `[SYS]` role label
- [ ] `AgentSessionReplayScreen` renders tool call parts as collapsed blocks with tool name
- [ ] `AgentSessionReplayScreen` renders tool result parts with success/error indicator
- [ ] `x` key toggles expand/collapse on focused tool block
- [ ] `X` key toggles all tool blocks at once
- [ ] `j`/`k` keys scroll transcript up/down
- [ ] `G` jumps to end of transcript
- [ ] `gg` jumps to start of transcript
- [ ] `]` jumps to next message boundary
- [ ] `[` jumps to previous message boundary
- [ ] `Ctrl+D` scrolls down half page
- [ ] `Ctrl+U` scrolls up half page
- [ ] `/` opens search overlay
- [ ] Search with matching text highlights matches and shows count
- [ ] `n` moves to next search match
- [ ] `N` moves to previous search match
- [ ] `Escape` closes search and clears highlights
- [ ] `y` copies current message content (verify OSC 52 escape sequence emitted)
- [ ] `q` navigates back to session list
- [ ] Empty session (0 messages) shows "This session has no messages." empty state
- [ ] Session with 500+ messages renders without perceptible lag
- [ ] Responsive layout at 80×24: timestamps hidden, no padding, tool name only
- [ ] Responsive layout at 120×40: 2ch padding, relative timestamps, 60ch tool summaries
- [ ] Responsive layout at 200×60: 4ch padding, 120ch tool summaries, metadata sidebar
- [ ] Tool block content exceeding 64KB shows truncation indicator
- [ ] Navigation to replay screen for an active session redirects to chat screen
- [ ] Transition from chat to replay when session status changes (mock SSE status event)

### Web UI (Playwright) E2E Tests

- [ ] Navigate to `/:owner/:repo/agents/sessions/:completedSessionId` — replay page loads with "REPLAY" badge
- [ ] Session summary card displays correct status, duration, message count
- [ ] All messages render in correct sequence order
- [ ] User messages appear right-aligned with primary background
- [ ] Assistant messages appear left-aligned with agent icon
- [ ] Tool call blocks render collapsed with tool name and summary
- [ ] Clicking a tool call block expands it to show full JSON input
- [ ] Clicking an expanded tool block collapses it
- [ ] "Toggle all" button expands all tool blocks; clicking again collapses all
- [ ] Ctrl+F / Cmd+F opens search overlay
- [ ] Typing a search query highlights matches in transcript
- [ ] Search arrow buttons navigate between matches
- [ ] Escape closes search overlay
- [ ] No message input area is rendered on the page
- [ ] Session summary card shows workflow run link when `workflowRunId` is set
- [ ] Session summary card hides workflow run link when `workflowRunId` is null
- [ ] Navigate to replay URL for an active session — redirected to chat view
- [ ] Navigate to `/:owner/:repo/agents/sessions/:nonExistentId` — "Session not found" error shown
- [ ] Navigate to replay without login — redirected to login page
- [ ] Replay for a session with 0 messages shows "This session has no messages" empty state
- [ ] Replay for a failed session shows red ✗ status badge prominently
- [ ] Replay for a timed_out session shows yellow ⏱ status badge
- [ ] Responsive: at mobile width (≤768px), messages use full width, session ID collapses to icon
- [ ] Page does not exhibit XSS when session title contains `<script>alert(1)</script>`
- [ ] Page does not exhibit XSS when message content contains HTML tags
- [ ] Loading state with spinner is displayed during auto-pagination
- [ ] Progress indicator shows message loading count during auto-pagination
- [ ] Session with 100+ messages loads all messages (verify last message is visible after scroll)
- [ ] Back arrow navigates to session list at `/:owner/:repo/agents`
- [ ] Session ID is copyable (click copies to clipboard)
- [ ] Clicking workflow run link navigates to correct workflow run detail page

# AGENT_SESSION_VIEW

Specification for AGENT_SESSION_VIEW.

## High-Level User POV

When a user navigates to a specific agent session within a repository, they should see a comprehensive, real-time view of that session's full context. This is the "session detail" experience — the single place where a user can understand what an agent has been doing, what it said, what tools it used, what results those tools produced, and how the session relates to the broader repository workflow.

The agent session view gives both humans and agent-augmented teams transparency into AI-assisted work. A developer might start an agent session from the CLI to investigate a bug, then later open the session view in the web UI to review what the agent discovered, inspect the tool calls it made, and decide whether to approve a resulting landing request. A team lead might open completed sessions to audit agent behavior, understand where an agent got stuck, or confirm that the right repository context was used before merging agent-produced changes.

The session view adapts to the session's lifecycle. For active sessions, it shows a live chat interface with real-time streaming of agent responses, a message input for continuing the conversation, and visual indicators of in-progress tool execution. For completed, failed, or timed-out sessions, it transitions into a read-only replay mode that presents the full transcript as a navigable document, complete with expandable tool call details and a session summary showing duration, message count, status, and any linked workflow run. Across all states, messages are displayed chronologically with clear role attribution (user, assistant, system, tool), markdown rendering for text content, syntax-highlighted code blocks, and collapsible tool invocation details.

The session view is accessible from every Codeplane client surface. In the web UI, it is a dedicated page under the repository's agent section. In the TUI, it maps to both the Agent Chat screen (for active sessions) and the Agent Session Replay screen (for terminal-state sessions). In the CLI, the `agent session view` command retrieves session metadata while `agent session chat` provides the interactive message flow. Editor integrations surface session status and provide quick navigation to the web-based session view.

The value of the session view is auditability, continuity, and trust. Users can verify agent work before acting on it, pick up where an agent left off, and build confidence that agents are operating within expected boundaries. Without this view, agent sessions would be black boxes — with it, they become transparent, reviewable, and actionable.

## Acceptance Criteria

### Definition of Done

- [ ] A user can retrieve a single agent session by ID from the API and receive all session metadata including title, status, timestamps, linked workflow run, and message count
- [ ] A user can view the full message transcript of a session with all messages returned in sequence order, each including its content parts
- [ ] Active sessions display a live chat interface with real-time streaming of agent responses and a message input area
- [ ] Completed, failed, and timed-out sessions display a read-only replay transcript with no input area
- [ ] The session view is accessible from web UI, TUI, CLI, and editor integrations
- [ ] The feature is gated behind the `AGENT_SESSION_VIEW` feature flag
- [ ] All acceptance criteria below are validated by passing integration and e2e tests

### Session Metadata

- [ ] Session ID is displayed and copyable (UUID format)
- [ ] Session title is displayed, truncated with ellipsis if exceeding display width (max stored length: 255 characters)
- [ ] Session status is displayed with a visual indicator: `pending` (○), `active` (●), `completed` (✓), `failed` (✗), `timed_out` (⏱)
- [ ] Status indicators use color coding: active → primary/blue, completed → success/green, failed → error/red, timed_out → warning/yellow, pending → muted/gray
- [ ] `started_at` and `finished_at` timestamps are displayed in relative format ("2 minutes ago", "1 hour ago") with full ISO-8601 tooltip on hover (web) or on demand (TUI)
- [ ] `created_at` is displayed as session creation time
- [ ] Message count is displayed as an integer (aggregated from the messages sub-resource)
- [ ] If `workflow_run_id` is non-null, a clickable link to the associated workflow run is displayed
- [ ] If `workflow_run_id` is null, no workflow link is shown

### Message Display

- [ ] Messages are displayed in `sequence` order (ascending)
- [ ] Each message displays its `role` with a label: "You" / "User" for user, "Agent" / "Assistant" for assistant, "System" for system, "Tool" for tool
- [ ] Each message displays a relative timestamp
- [ ] Text parts render as markdown with code block syntax highlighting
- [ ] Tool call parts display the tool name and a collapsible input section showing the invocation parameters
- [ ] Tool result parts display the tool name, a success/error indicator, and a collapsible output section
- [ ] Tool call/result content exceeding 64KB is truncated with a "Content truncated" indicator
- [ ] Tool blocks have a collapsed summary (60–120 characters depending on viewport) and expand on user action
- [ ] User messages are visually distinguished from assistant messages (e.g., right-aligned vs left-aligned, different background colors)
- [ ] System messages are visually de-emphasized (muted color, smaller text or different styling)

### Active Session (Live Chat)

- [ ] Messages stream in real-time via SSE when the session is `active`
- [ ] Streaming assistant messages show an animated progress indicator (spinner)
- [ ] A message input area is displayed at the bottom of the view
- [ ] Sending a message appends a user message to the session and triggers agent dispatch
- [ ] Message input validates: non-empty after trim, maximum 4,000 characters
- [ ] After sending, the message appears optimistically in the transcript before server confirmation
- [ ] Failed sends are indicated inline with a retry option
- [ ] A 2-second cooldown prevents rapid successive sends (rate limiting on client)
- [ ] Auto-scroll follows new messages; scrolling up pauses auto-scroll and shows a "New messages" indicator; jumping to bottom re-enables auto-scroll
- [ ] If SSE streaming is unavailable (501), the view falls back to 3-second polling

### Read-Only Replay (Terminal States)

- [ ] When session status is `completed`, `failed`, or `timed_out`, no message input is displayed
- [ ] A "REPLAY" badge or indicator is shown in the header
- [ ] All messages from the session are fetched (auto-pagination until all messages are loaded)
- [ ] A session summary section shows: status icon/label, message count, duration (finished_at − started_at), and workflow run link if applicable
- [ ] Users can navigate between messages (previous/next) using keyboard shortcuts
- [ ] Users can search within the transcript using a text search overlay
- [ ] Tool blocks are collapsible/expandable individually or all-at-once

### Pagination & Performance

- [ ] Messages are paginated with a default page size of 30 and a maximum of 50 per request
- [ ] The view supports loading older messages on scroll-to-top or explicit "Load older" action
- [ ] A maximum of 500 messages are held in memory at any time for active chat; replay mode auto-paginates up to 10,000
- [ ] If a session has zero messages, an empty state is displayed with appropriate messaging

### Edge Cases

- [ ] Requesting a session with an invalid UUID format returns a 400 error
- [ ] Requesting a session that does not exist returns a 404 error with "Session not found"
- [ ] Requesting a session in a repository the user cannot access returns a 403 error
- [ ] Requesting a session with an empty string ID returns a 400 error ("session id is required")
- [ ] If the session transitions from `active` to a terminal state while the user is viewing it, the view updates to replay mode without requiring a page refresh
- [ ] Viewing a session with exactly the maximum title length (255 characters) displays correctly without layout breakage
- [ ] Viewing a session with a title containing special characters (emoji, unicode, HTML entities, angle brackets) displays correctly without XSS or rendering issues
- [ ] Viewing a message with empty parts array renders the message with a placeholder or empty state
- [ ] Viewing a message where a tool_call part has deeply nested JSON input (>10 levels) renders without crashing
- [ ] Network disconnection during an active session shows a reconnection indicator; on reconnect, missed messages are fetched and displayed
- [ ] If the streaming endpoint returns 501, the client seamlessly falls back to polling without user intervention

### Boundary Constraints

- Session title: 1–255 characters, trimmed, UTF-8
- Session ID: UUID v4 format (36 characters including hyphens)
- Message role: one of `user`, `assistant`, `system`, `tool`
- Message part type: one of `text`, `tool_call`, `tool_result`
- Text part content maximum: no explicit server limit; client truncates display at 64KB per part
- Tool call/result content maximum: no explicit server limit; client truncates display at 64KB per part
- Messages per page: 1–50 (default 30)
- Sessions per page: 1–50 (default 30)
- Client message input maximum: 4,000 characters
- Client send cooldown: 2 seconds
- SSE reconnection: exponential backoff 1s → 30s, maximum 20 attempts
- SSE keepalive: 45-second timeout detection
- Memory cap for messages: 500 (chat), 10,000 (replay)

## Design

### Web UI Design

**Route**: `/:owner/:repo/agents/sessions/:sessionId`

**Layout**: Full-width content area within the repository layout shell. The session view occupies the main content area below the repository header and navigation tabs.

**Header Bar**:
- Left: Back arrow (returns to session list), session title (truncated with tooltip for overflow), status badge (colored pill: "Active", "Completed", "Failed", "Timed Out", "Pending")
- Right: Session ID (copyable on click), created timestamp, workflow run link (if applicable), delete button (with confirmation dialog)

**Message Transcript Area**:
- Occupies the central scrollable region
- User messages: right-aligned bubble with primary/blue background
- Assistant messages: left-aligned with a subtle background, agent avatar/icon
- System messages: centered, muted, smaller
- Tool messages: left-aligned, same column as assistant, with collapsible tool detail blocks
- Each message shows role label, timestamp (relative), and content parts rendered in order
- Markdown rendering: headings, bold, italic, code spans, fenced code blocks (with language-specific syntax highlighting), lists, links, blockquotes
- Tool call blocks: collapsed by default showing `🔧 tool_name — summary...`, expand to show full JSON input
- Tool result blocks: collapsed by default showing `✓ tool_name — summary...` (or `✗` for errors), expand to show full output
- Streaming messages: partial text with a blinking cursor or spinner at the end

**Message Input Area** (active sessions only):
- Fixed at the bottom of the view
- Single-line input that expands to multi-line (up to 8 lines) as the user types
- Character count indicator showing `N / 4000`
- Send button (primary action) and keyboard shortcut hint (Enter to send, Shift+Enter for newline)
- Disabled state during cooldown (2s after send) with visual countdown
- Error state: red border + inline error message if send fails, with retry button

**Empty State** (no messages):
- Centered message: "No messages yet. Send a message to start the conversation."
- Prominent input area

**Replay Mode Additions**:
- "REPLAY" badge in header next to status
- Session summary card at the bottom of the transcript: status, duration, message count, workflow link
- No message input area
- Search overlay (Ctrl+F / Cmd+F): highlights matches in transcript, navigation arrows for next/previous match

**Responsive Behavior**:
- On narrow viewports, message bubbles use full width instead of offset alignment
- Tool block summaries shorten from 120 to 60 characters
- Session ID in header collapses to a copy icon only

### API Shape

**Get Session Detail**

```
GET /api/repos/:owner/:repo/agent/sessions/:id
```

Response (200):
```json
{
  "id": "uuid",
  "repositoryId": "uuid",
  "userId": "uuid",
  "workflowRunId": "uuid | null",
  "title": "string",
  "status": "pending | active | completed | failed | timed_out",
  "startedAt": "ISO-8601 | null",
  "finishedAt": "ISO-8601 | null",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "messageCount": 42
}
```

Error responses:
- `400` — `{ "error": "session id is required" }` (empty/whitespace ID)
- `401` — `{ "error": "authentication required" }`
- `403` — `{ "error": "insufficient permissions" }` (no repo read access)
- `404` — `{ "error": "session not found" }`

**List Session Messages**

```
GET /api/repos/:owner/:repo/agent/sessions/:id/messages?page=1&per_page=30
```

Response (200):
```json
[
  {
    "id": "uuid",
    "sessionId": "uuid",
    "role": "user | assistant | system | tool",
    "sequence": 0,
    "createdAt": "ISO-8601",
    "parts": [
      {
        "id": "uuid",
        "messageId": "uuid",
        "partIndex": 0,
        "partType": "text | tool_call | tool_result",
        "content": { "..." },
        "createdAt": "ISO-8601"
      }
    ]
  }
]
```

**Stream Session Events (SSE)**

```
GET /api/repos/:owner/:repo/agent/sessions/:id/stream
```

Event types:
- `token` — `{ "content": "string" }` (streaming text fragment)
- `done` — `{}` (stream completed for current assistant turn)
- `error` — `{ "message": "string" }` (stream error)
- Keep-alive comment every 15 seconds

Note: Community Edition currently returns 501; clients must fall back to polling.

### SDK Shape

**Types** (from `@codeplane/ui-core`):

```typescript
type AgentSessionStatus = "pending" | "active" | "completed" | "failed" | "timed_out";
type AgentMessageRole = "user" | "assistant" | "system" | "tool";
type AgentPartType = "text" | "tool_call" | "tool_result";

interface AgentSession {
  id: string;
  repositoryId: string;
  userId: string;
  workflowRunId: string | null;
  title: string;
  status: AgentSessionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

interface AgentMessage {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  sequence: number;
  createdAt: string;
  parts?: AgentPart[];
}

interface AgentPart {
  id: string;
  messageId: string;
  partIndex: number;
  partType: AgentPartType;
  content: unknown;
  createdAt: string;
}
```

**Hooks** (from `@codeplane/ui-core`):

- `useAgentSession(owner, repo, sessionId)` — Fetch single session with loading/error states, refetch trigger
- `useAgentMessages(owner, repo, sessionId, options)` — Paginated messages with auto-pagination mode for replay
- `useAgentStream(owner, repo, sessionId)` — SSE connection with auto-reconnection, exponential backoff, token accumulation
- `useSendAgentMessage(owner, repo, sessionId)` — Mutation hook with optimistic insert, retry support, rate limiting

### CLI Command

```
codeplane agent session view <id> [--repo OWNER/REPO]
```

**Output (default)**:
```
Session:  a1b2c3d4-e5f6-7890-abcd-ef1234567890
Title:    Fix authentication race condition
Status:   ✓ completed
Started:  2026-03-22T10:30:00Z
Finished: 2026-03-22T10:35:22Z
Duration: 5m 22s
Messages: 14
Workflow: Run #42 (if linked)
```

**Output (--json)**:
Full JSON session object as returned by the API.

```
codeplane agent session view <id> --messages [--repo OWNER/REPO] [--page N] [--per-page N]
```

When `--messages` is passed, also prints the message transcript below the session metadata.

### TUI UI

**Agent Chat Screen** (active sessions):
- Header: session title (truncated), status badge, repo context
- Message area: scrollable, keyboard navigable (`j`/`k` scroll, `G` jump to bottom, `gg` jump to top)
- Message rendering: role-colored labels, markdown text, collapsible tool blocks (`Tab` to toggle)
- Input: bottom-fixed, single/multi-line with `Enter` to send, `Shift+Enter` for newline, `Ctrl+Enter` for multi-line send
- Streaming: animated spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏), auto-scroll enabled by default
- Keybindings: `i` focus input, `Esc` unfocus, `/` search, `q` back to list
- Responsive: minimum (120×40), standard (200×60), large (200+×60+) breakpoints

**Agent Session Replay Screen** (terminal states):
- Header: session title, status badge, "REPLAY" indicator
- Full transcript: auto-fetches all pages on entry
- Session summary: status, message count, duration, workflow link
- Navigation: `j`/`k` line scroll, `]`/`[` jump between messages, `/` search, `x` toggle tool block, `X` toggle all
- Read-only: no input area
- Keybindings: `q`/`Esc` back to list

**Deep-link support**:
- `--screen agent-chat --repo owner/repo --session-id {id}` (active sessions)
- `--screen agent-replay --repo owner/repo --session-id {id}` (terminal sessions)

### Editor Integrations

**VS Code**:
- "View Agent Session" command available from the agent sessions tree view
- Opens the session detail page in the embedded Codeplane webview
- Status bar indicator updates when a linked agent session changes state

**Neovim**:
- `:Codeplane agent session view <id>` command
- Opens session detail in a Telescope picker or floating window for metadata, with a link to open the web view for full transcript

### Documentation

The following end-user documentation should be written:

1. **"Viewing Agent Sessions"** guide — How to access and navigate the session view in web, CLI, and TUI. Explains the session lifecycle (pending → active → completed/failed/timed_out), what each status means, and how the view adapts.
2. **"Agent Session Chat"** guide — How to interact with an active agent session: sending messages, reading streaming responses, understanding tool calls, and handling errors.
3. **"Agent Session Replay"** guide — How to review completed sessions: navigating the transcript, searching, expanding tool details, and understanding the session summary.
4. **CLI reference** — `agent session view` command with all flags and output formats documented.
5. **API reference** — GET session detail, GET messages, GET stream endpoints with request/response schemas and error codes.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member | Admin | Owner |
|--------|-----------|-----------|--------|-------|-------|
| View session metadata | ✗ | ✓ | ✓ | ✓ | ✓ |
| View session messages | ✗ | ✓ | ✓ | ✓ | ✓ |
| Subscribe to session stream | ✗ | ✓ | ✓ | ✓ | ✓ |
| Send message to session | ✗ | ✗ | ✓ | ✓ | ✓ |
| Delete session | ✗ | ✗ | Own only | ✓ | ✓ |

- **Authentication required**: All agent session view endpoints require an authenticated user (session cookie, PAT, or OAuth token). Unauthenticated requests receive 401.
- **Repository read access required**: The user must have at least read access to the parent repository. Requests without sufficient access receive 403.
- **Session scoping**: Sessions are scoped to a repository. A session ID that exists in a different repository than the one specified in the URL path returns 404 (not 403), preventing session ID enumeration across repos.
- **Delete ownership**: Non-admin users can only delete sessions they created (`user_id` must match). Admin and Owner roles can delete any session in their repository.

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| GET session detail | 300 req | 1 minute | per user per repo |
| GET session messages | 300 req | 1 minute | per user per repo |
| GET session stream (SSE) | 10 connections | concurrent | per user per repo |
| POST message | 60 req | 1 minute | per user per repo |
| DELETE session | 30 req | 1 minute | per user per repo |

Rate limit exceeded responses return `429 Too Many Requests` with a `Retry-After` header (seconds).

### Data Privacy

- Agent session messages may contain PII, code, secrets, or sensitive repository content. Sessions must respect the same access controls as the repository they belong to.
- Session messages are not indexed by the global search service.
- Tool call inputs and tool result outputs may contain file contents, shell command outputs, or API responses — these are stored as-is in JSONB and must not be leaked outside the repository's access boundary.
- Session deletion must be hard-delete (no soft-delete/tombstone) to ensure PII removal compliance.
- SSE stream channels use session-ID-derived channel names with hyphens stripped to prevent injection into PostgreSQL NOTIFY channel names.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `AgentSessionViewed` | User opens session detail view | `sessionId`, `sessionStatus`, `repositoryId`, `userId`, `clientSurface` (web/tui/cli/editor), `messageCount`, `hasWorkflowRun` |
| `AgentSessionReplayStarted` | User opens a terminal-state session in replay mode | `sessionId`, `sessionStatus`, `repositoryId`, `userId`, `clientSurface`, `messageCount`, `sessionDurationSeconds` |
| `AgentSessionMessageSent` | User sends a message within session view | `sessionId`, `repositoryId`, `userId`, `clientSurface`, `messageLength`, `isRetry` |
| `AgentSessionStreamConnected` | SSE connection established | `sessionId`, `repositoryId`, `userId`, `clientSurface`, `connectionAttempt` |
| `AgentSessionStreamFallbackToPolling` | Client falls back from SSE to polling | `sessionId`, `repositoryId`, `userId`, `clientSurface`, `reason` (501/timeout/error) |
| `AgentSessionToolBlockExpanded` | User expands a tool call/result block | `sessionId`, `toolName`, `partType` (tool_call/tool_result), `clientSurface` |
| `AgentSessionSearchUsed` | User searches within session transcript | `sessionId`, `clientSurface`, `matchCount` |
| `AgentSessionDeleted` | User deletes a session from the view | `sessionId`, `sessionStatus`, `repositoryId`, `userId`, `clientSurface`, `messageCount` |

### Funnel Metrics & Success Indicators

- **Session view rate**: % of created sessions that are subsequently viewed at least once
- **Replay completion rate**: % of replay views where the user scrolls to the end of the transcript
- **Active chat engagement**: average messages sent per active chat session view
- **Tool block inspection rate**: % of tool blocks that are expanded by users
- **Stream reliability**: % of SSE connections that remain stable for the session duration vs. fallback to polling
- **Cross-client usage**: distribution of session views across web, TUI, CLI, and editor clients
- **Time-to-view**: median time between session creation and first session view
- **Session view duration**: median time spent on a session view (active chat vs. replay)

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Session detail fetched | `info` | `sessionId`, `userId`, `repositoryId`, `status`, `durationMs` |
| Session not found | `warn` | `sessionId`, `userId`, `repositoryId` |
| Session access denied | `warn` | `sessionId`, `userId`, `repositoryId`, `requiredPermission` |
| Message list fetched | `info` | `sessionId`, `userId`, `page`, `perPage`, `resultCount`, `durationMs` |
| Message sent to session | `info` | `sessionId`, `userId`, `role`, `partCount`, `durationMs` |
| Message send failed | `error` | `sessionId`, `userId`, `role`, `errorCode`, `errorMessage` |
| Agent dispatch triggered | `info` | `sessionId`, `userId`, `triggerMessageId` |
| Agent dispatch failed | `error` | `sessionId`, `userId`, `triggerMessageId`, `errorCode`, `errorMessage` |
| SSE stream opened | `info` | `sessionId`, `userId`, `connectionId` |
| SSE stream closed | `info` | `sessionId`, `userId`, `connectionId`, `reason`, `durationMs` |
| SSE stream error | `error` | `sessionId`, `userId`, `connectionId`, `errorCode`, `errorMessage` |
| Session deleted | `info` | `sessionId`, `userId`, `deletedByUserId`, `messageCount` |
| Rate limit exceeded | `warn` | `userId`, `endpoint`, `currentRate`, `limit` |

### Prometheus Metrics

**Counters**:
- `codeplane_agent_session_views_total{status, client_surface}` — Total session view requests
- `codeplane_agent_session_messages_fetched_total{client_surface}` — Total message list fetches
- `codeplane_agent_session_messages_sent_total{client_surface, role}` — Total messages sent
- `codeplane_agent_session_stream_connections_total{client_surface}` — Total SSE connections opened
- `codeplane_agent_session_stream_fallbacks_total{client_surface, reason}` — Total SSE fallbacks to polling
- `codeplane_agent_session_deletes_total` — Total sessions deleted from session view
- `codeplane_agent_session_view_errors_total{error_code}` — Total errors by status code
- `codeplane_agent_dispatch_failures_total` — Total agent dispatch failures

**Gauges**:
- `codeplane_agent_session_stream_active_connections` — Currently active SSE connections

**Histograms**:
- `codeplane_agent_session_view_duration_seconds` — Request duration for GET session detail
- `codeplane_agent_session_messages_fetch_duration_seconds` — Request duration for GET messages
- `codeplane_agent_session_message_send_duration_seconds` — Request duration for POST message
- `codeplane_agent_session_stream_connection_duration_seconds` — Total SSE connection duration

### Alerts & Runbooks

**Alert: `AgentSessionViewErrorRateHigh`**
- Condition: `rate(codeplane_agent_session_view_errors_total{error_code=~"5.."}[5m]) > 0.05 * rate(codeplane_agent_session_views_total[5m])`
- Severity: `warning` (>5%), `critical` (>20%)
- **Runbook**:
  1. Check `codeplane_agent_session_view_duration_seconds` p99 for latency spikes
  2. Inspect structured logs filtered by `error` level and `sessionId` for patterns
  3. Check database connection pool health and query latency
  4. Verify the agent_sessions table is accessible and not locked
  5. If database-related, check for long-running transactions or locks via `pg_stat_activity`
  6. If isolated to a single repository, check for data corruption in that repo's sessions
  7. Escalate to platform team if database health is degraded

**Alert: `AgentSessionStreamConnectionsExhausted`**
- Condition: `codeplane_agent_session_stream_active_connections > 1000`
- Severity: `warning` (>1000), `critical` (>5000)
- **Runbook**:
  1. Check if connections are concentrated on a few sessions or broadly distributed
  2. Look for connection leak patterns: sessions that have ended but connections remain open
  3. Verify SSE keepalive timeout (45s) is functioning and stale connections are being closed
  4. Check for client-side reconnection storms (look for high `stream_connections_total` rate)
  5. If concentrated, check whether specific sessions are stuck in `active` state
  6. Consider temporarily increasing the per-user concurrent SSE limit or adding connection pooling
  7. If systemic, restart the SSE manager service to clear stale connections

**Alert: `AgentDispatchFailureRateHigh`**
- Condition: `rate(codeplane_agent_dispatch_failures_total[5m]) > 0.1 * rate(codeplane_agent_session_messages_sent_total{role="user"}[5m])`
- Severity: `warning` (>10%), `critical` (>50%)
- **Runbook**:
  1. Check structured logs for dispatch error messages — common causes: agent backend unavailable, session in terminal state, repository access revoked
  2. Verify the agent execution backends (local/workspace) are healthy
  3. Check if workspace container provisioning is functional (for sandbox backends)
  4. Verify workflow service is running if dispatch depends on workflow integration
  5. Check for session state races: message sent to session that transitioned to `completed` between the send and the dispatch
  6. If workspace-related, check container runtime health and SSH connectivity

**Alert: `AgentSessionViewLatencyHigh`**
- Condition: `histogram_quantile(0.99, rate(codeplane_agent_session_view_duration_seconds_bucket[5m])) > 2`
- Severity: `warning` (>2s p99), `critical` (>5s p99)
- **Runbook**:
  1. Check database query latency for `getAgentSessionWithMessageCount` query
  2. Look for slow queries in PostgreSQL logs
  3. Check if the `agent_sessions` table needs VACUUM or index maintenance
  4. Verify the LEFT JOIN for message count is not causing sequential scans on large message tables
  5. Check overall database load and connection pool saturation
  6. If isolated to sessions with high message counts, consider caching message counts

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Invalid session ID format | 400 | Non-UUID or empty ID | Client-side validation before request |
| Authentication expired | 401 | Session/token expired | Redirect to login, re-authenticate |
| Repository access revoked | 403 | Permission change mid-session | Show error, return to repo list |
| Session not found | 404 | Deleted session or wrong repo | Show "Session not found" with back link |
| Rate limited | 429 | Too many requests | Honor Retry-After, show countdown |
| SSE not implemented | 501 | Community Edition placeholder | Automatic fallback to polling |
| Database connection failure | 500 | PostgreSQL unavailable | Retry with backoff, show error state |
| Agent dispatch failure | 500 | Backend unavailable | Message sent but agent won't respond; show inline error with retry |
| Session locked for append | 409 | Concurrent message append race | Retry after short delay |
| Message normalization failure | 400 | Invalid part type or missing content | Show validation error in input |

## Verification

### API Integration Tests

- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` returns 200 with full session object for a valid session
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` returns `messageCount` field as a number
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` returns null for `workflowRunId` when no workflow is linked
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` returns a valid UUID for `workflowRunId` when a workflow is linked
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` returns correct `status` for each of the 5 statuses (pending, active, completed, failed, timed_out)
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` returns `startedAt` as null for pending sessions
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` returns `finishedAt` as null for active sessions
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` returns both `startedAt` and `finishedAt` for completed sessions
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` with empty ID returns 400
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` with whitespace-only ID returns 400
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` with non-existent UUID returns 404
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` without auth returns 401
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id` for a session in a different repository returns 404
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` returns paginated messages in sequence order
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with `page=1&per_page=5` returns at most 5 messages
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with `per_page=100` clamps to 50
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with `per_page=0` uses default of 30
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` for a session with 0 messages returns empty array
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` returns messages with parts array populated (joined from agent_parts)
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` parts are ordered by `partIndex` ascending
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` without auth returns 401
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` with empty session ID returns 400
- [ ] `GET /api/repos/:owner/:repo/agent/sessions/:id/stream` returns 501 with appropriate error message in Community Edition
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with valid user message returns 201
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with role=user triggers agent dispatch
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with role=assistant does not trigger agent dispatch
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with invalid role returns 400
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with empty parts array returns 400
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with invalid part type returns 400
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with text part as bare string normalizes to `{ value: string }`
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with text part as object passes through
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with non-text part as string returns 400
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with null part content returns 400
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` returns message with assigned sequence number
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` sequence numbers are monotonically increasing per session
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` with maximum valid input (4000 chars text content) succeeds
- [ ] `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` concurrent sends to same session produce unique sequential sequence numbers (no duplicates)

### CLI Integration Tests

- [ ] `codeplane agent session view <valid-id> --repo owner/repo` prints session metadata in human-readable format
- [ ] `codeplane agent session view <valid-id> --repo owner/repo --json` prints full JSON session object
- [ ] `codeplane agent session view <non-existent-id> --repo owner/repo` prints error and exits with non-zero code
- [ ] `codeplane agent session view <valid-id> --repo owner/repo --messages` prints session metadata followed by message transcript
- [ ] `codeplane agent session view <valid-id> --repo owner/repo --messages --page 2 --per-page 10` paginates messages correctly

### Web UI End-to-End Tests (Playwright)

- [ ] Navigate to `/:owner/:repo/agents/sessions/:id` for an active session and verify the header shows title, status badge "Active", and session ID
- [ ] Navigate to `/:owner/:repo/agents/sessions/:id` for a completed session and verify "REPLAY" badge appears and no input area is visible
- [ ] Navigate to `/:owner/:repo/agents/sessions/:id` for a failed session and verify status badge shows "Failed" with red color
- [ ] Navigate to `/:owner/:repo/agents/sessions/:id` for a timed-out session and verify status badge shows "Timed Out" with yellow color
- [ ] Verify message transcript displays user messages with right alignment and assistant messages with left alignment
- [ ] Verify tool call blocks appear collapsed by default and expand on click
- [ ] Verify tool result blocks show success indicator (✓) for successful results and error indicator (✗) for errors
- [ ] Verify clicking the session ID copies it to clipboard
- [ ] Verify the workflow run link navigates to the correct workflow run page when clicked
- [ ] Verify the workflow run link is not visible when `workflowRunId` is null
- [ ] Verify sending a message in an active session appends it to the transcript immediately (optimistic)
- [ ] Verify the message input enforces the 4,000 character limit (character counter turns red, send button disabled)
- [ ] Verify the send button is disabled during the 2-second cooldown after sending
- [ ] Verify pressing Enter in the input sends the message
- [ ] Verify pressing Shift+Enter in the input inserts a newline
- [ ] Verify an empty input (whitespace only) cannot be sent
- [ ] Verify the back arrow returns to the session list
- [ ] Verify navigating to a non-existent session ID shows "Session not found" error
- [ ] Verify navigating to a session without authentication redirects to login
- [ ] Verify the delete button shows a confirmation dialog before deleting
- [ ] Verify deleting a session redirects to the session list
- [ ] Verify a session with 255-character title displays without layout breakage
- [ ] Verify a session title containing `<script>alert('xss')</script>` renders as text, not executed
- [ ] Verify a session title containing emoji (🚀🔧) renders correctly
- [ ] Verify the empty state displays correctly for a session with zero messages
- [ ] Verify scrolling up in an active session pauses auto-scroll and shows "New messages" indicator
- [ ] Verify clicking "New messages" indicator or pressing a jump-to-bottom action re-enables auto-scroll
- [ ] Verify the search overlay (Ctrl+F) in replay mode highlights matching text in the transcript
- [ ] Verify session summary in replay mode shows correct duration, message count, and status
- [ ] Verify a message with deeply nested tool call JSON (10+ levels) renders without crashing

### TUI End-to-End Tests

- [ ] `--screen agent-chat --repo owner/repo --session-id <active-id>` opens the chat screen with correct session title in header
- [ ] `--screen agent-replay --repo owner/repo --session-id <completed-id>` opens the replay screen with "REPLAY" badge
- [ ] Chat screen shows message input area at bottom; replay screen does not
- [ ] Pressing `j`/`k` in chat screen scrolls the message transcript
- [ ] Pressing `i` in chat screen focuses the input area
- [ ] Pressing `Esc` in chat screen unfocuses the input area
- [ ] Pressing `Enter` in focused input sends the message (non-empty)
- [ ] Pressing `q` or `Esc` (when input not focused) returns to session list
- [ ] Replay screen: pressing `]` jumps to next message, `[` jumps to previous
- [ ] Replay screen: pressing `/` opens search, matching text is highlighted
- [ ] Replay screen: pressing `x` on a tool block toggles expansion, `X` toggles all
- [ ] Replay screen: session summary shows status, message count, duration
- [ ] Chat screen: streaming messages show animated spinner character
- [ ] Chat screen: sending a message longer than 4000 characters is rejected with inline error
- [ ] Both screens: status icons use correct symbols (●/✓/✗/⏱/○)
- [ ] Responsive: minimum breakpoint (120×40) renders without overflow or crash
- [ ] Responsive: large breakpoint (200+×60+) shows full session ID and expanded tool summaries

### Edge Case & Boundary Tests

- [ ] Viewing a session where all messages have empty `parts` arrays renders messages with empty content (no crash)
- [ ] Viewing a session with exactly 500 messages loads correctly in chat mode (memory cap boundary)
- [ ] Viewing a session with exactly 10,000 messages loads correctly in replay mode (memory cap boundary)
- [ ] Viewing a session with 10,001 messages in replay mode does not exceed memory cap (oldest messages evicted or pagination stops)
- [ ] Sending a message with exactly 4,000 characters succeeds
- [ ] Sending a message with 4,001 characters is rejected client-side before API call
- [ ] A tool call part with a 64KB content field displays with truncation indicator
- [ ] A tool call part with a 65KB content field displays with truncation indicator (just above boundary)
- [ ] A session transitioning from `active` to `completed` while the user is on the chat screen updates the view to replay mode
- [ ] Two concurrent users viewing the same active session both receive streamed messages
- [ ] Rapid message sends (within 2-second cooldown) are blocked client-side with visual feedback
- [ ] Network disconnection during SSE shows reconnection indicator; reconnection restores missed messages
- [ ] SSE 501 response triggers immediate fallback to polling without error flash

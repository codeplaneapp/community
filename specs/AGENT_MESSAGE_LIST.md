# AGENT_MESSAGE_LIST

Specification for AGENT_MESSAGE_LIST.

## High-Level User POV

When a user opens an agent session in Codeplane — whether to continue a live conversation, review what happened in a completed session, or understand what an agent did on a teammate's behalf — they need to see the full history of messages exchanged between humans, agents, and tools within that session.

The Agent Message List is the read path that surfaces every message in an agent session as an ordered conversation. Messages appear in the sequence they were exchanged: user prompts, agent responses, system instructions, and tool call/result pairs. Each message carries its role (who sent it), its content (what was said or done), and its timestamp (when it happened). This gives users a clear, chronological narrative of the entire agent interaction.

In the web UI and TUI, the message list forms the backbone of the chat screen. Users scroll through the conversation, see earlier messages at the top and newer messages at the bottom, and can load older messages by scrolling up. In replay mode for completed or failed sessions, all messages are loaded so the user can review the full history without interaction. In the CLI, users can view session details that include the message history, and the chat command displays messages as they are exchanged.

For long-running sessions that accumulate hundreds or even thousands of messages, the message list is paginated. The most recent messages load first in a chat context, and users can page backward to see earlier exchanges. The system is designed so that clients never need to hold more than a reasonable number of messages in memory at once, while still allowing full session replay when needed.

The message list also powers the reconnection experience during live agent sessions. If a user's connection drops while an agent is responding, the message list provides the recovery mechanism — the client fetches messages it missed and resumes where it left off, ensuring the user never loses context.

For teams, the message list provides transparency. Any authenticated member with read access to the repository can view the messages in any agent session, regardless of who started the session. This is essential for understanding what agents have done, reviewing agent-generated suggestions, and maintaining accountability in agent-augmented workflows.

## Acceptance Criteria

- **Messages are scoped to a session.** The list returns only messages belonging to the specified agent session.
- **Session is scoped to a repository.** The session ID must belong to the specified repository. Attempting to list messages for a session that belongs to a different repository returns 404.
- **Authentication is required.** Unauthenticated users cannot list messages. A `401 Unauthorized` response is returned for unauthenticated requests.
- **Repository read access is required.** Users without read access to the repository receive a `404 Not Found` response (not 403, to avoid leaking repository existence).
- **Pagination is supported.** The default page size is 30 messages. The maximum page size is 50. `page` and `per_page` query parameters are accepted.
- **Messages are ordered by sequence number ascending.** Sequence is an auto-incrementing integer within the session, ensuring logical conversation order regardless of insertion timestamps.
- **Each message in the list includes:** `id`, `sessionId`, `role`, `sequence`, `createdAt`, and optionally `parts` (the structured content of the message).
- **Role values are one of:** `user`, `assistant`, `system`, `tool`.
- **Message parts, when included, each contain:** `id`, `messageId`, `partIndex`, `partType`, `content`, `createdAt`.
- **Part type values are one of:** `text`, `tool_call`, `tool_result`.
- **Part content is a JSON object** whose shape varies by `partType`. Text parts contain `{ value: string }`. Tool call and tool result parts contain structured objects specific to the tool interaction.
- **Page number defaults to 1.** Invalid or non-numeric page values are treated as page 1.
- **Per-page defaults to 30.** Values above 50 are clamped to 50. Values below 1 are treated as 1.
- **Empty sessions return an empty array.** A valid session with zero messages returns `200 OK` with `[]`.
- **Non-existent session returns 404.** If the session ID does not exist or does not belong to the given repository, the response is `404 Not Found`.
- **Empty session ID is rejected.** A blank or whitespace-only session ID in the path returns `400 Bad Request`.
- **Sequence numbers are coerced to numbers on the client.** The server may transmit sequence as a string (from bigint SQL columns); clients must coerce to `number` for display and ordering.
- **Part indices are coerced to numbers on the client.** Same coercion requirement as sequence.
- **Client-side memory cap for chat mode.** Clients using "load more" pagination in chat mode cap accumulated messages at 500 items. Older messages are evicted when the cap is exceeded.
- **Client-side memory cap for replay mode.** Clients using auto-pagination for replay mode cap accumulated messages at 10,000 items.
- **Auto-pagination for replay mode.** In replay mode, clients sequentially fetch all pages until no more data is returned, up to the memory cap.
- **Messages after a specific ID can be fetched.** The `listAgentMessagesAfterID` query supports reconnection scenarios where the client needs to catch up on missed messages using a cursor-style approach.
- **The list is available on all primary client surfaces:** API, Web UI, TUI, and indirectly through CLI session view/chat.
- **Messages with Unicode, emoji, HTML, and special characters in content are returned verbatim.** No server-side sanitization or escaping of message content.
- **Concurrent message appends during listing do not corrupt the list.** Messages appended while a list request is in flight appear on subsequent requests in correct sequence order.

### Definition of Done

1. The API endpoint `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` returns paginated message data with parts in sequence order.
2. The Web UI agent chat screen renders messages from the list with role-appropriate formatting, tool block rendering, and scroll-to-load-more behavior.
3. The Web UI agent replay screen uses auto-pagination to load all messages for read-only review.
4. The TUI agent chat screen renders messages with role labels, tool blocks, timestamps, and supports loading earlier messages on scroll-to-top.
5. The TUI agent replay screen loads all messages sequentially and provides navigation controls.
6. The CLI `agent session view` and `agent session chat` commands display message history.
7. The `useAgentMessages` hook in ui-core provides the shared data-fetching contract with coercion, pagination, and memory caps.
8. All acceptance criteria above are verified by passing integration and e2e tests.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/agent/sessions/:id/messages`

**Authentication:** Required (session cookie or PAT)

**Path Parameters:**

| Parameter | Type   | Description                          |
|-----------|--------|--------------------------------------|
| `owner`   | string | Repository owner (user or org name)  |
| `repo`    | string | Repository name                      |
| `id`      | string | Agent session ID (UUID)              |

**Query Parameters:**

| Parameter  | Type    | Default | Constraints       | Description                   |
|------------|---------|---------|-------------------|-------------------------------|
| `page`     | integer | 1       | ≥ 1               | Page number (1-indexed)       |
| `per_page` | integer | 30      | 1–50, clamped     | Number of messages per page   |

**Response:** `200 OK`

**Response Body:** JSON array of message objects, ordered by `sequence ASC`:

```json
[
  {
    "id": "01HXYZ...",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "role": "user",
    "sequence": 0,
    "createdAt": "2026-03-22T10:30:05Z",
    "parts": [
      {
        "id": "01HABC...",
        "messageId": "01HXYZ...",
        "partIndex": 0,
        "partType": "text",
        "content": { "value": "Fix the login redirect bug" },
        "createdAt": "2026-03-22T10:30:05Z"
      }
    ]
  },
  {
    "id": "01HXYZ2...",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "role": "assistant",
    "sequence": 1,
    "createdAt": "2026-03-22T10:30:08Z",
    "parts": [
      {
        "id": "01HDEF...",
        "messageId": "01HXYZ2...",
        "partIndex": 0,
        "partType": "text",
        "content": { "value": "I'll look into the login flow. Let me check the auth middleware first." },
        "createdAt": "2026-03-22T10:30:08Z"
      },
      {
        "id": "01HGHI...",
        "messageId": "01HXYZ2...",
        "partIndex": 1,
        "partType": "tool_call",
        "content": { "tool": "read_file", "args": { "path": "src/auth/middleware.ts" } },
        "createdAt": "2026-03-22T10:30:09Z"
      }
    ]
  }
]
```

**Error Responses:**

| Status | Condition                                      | Body                                              |
|--------|------------------------------------------------|---------------------------------------------------|
| 400    | Empty or whitespace-only session ID            | `{ "message": "session id is required" }`         |
| 401    | No/invalid authentication                      | `{ "message": "authentication required" }`        |
| 404    | Repository not found or no read access         | `{ "message": "repository not found" }`           |
| 404    | Session not found or not in this repository    | `{ "message": "session not found" }`              |
| 500    | Database or service failure                    | `{ "message": "internal server error" }`          |

**Design Notes:**
- Unlike the session list endpoint, the message list endpoint does **not** return an `X-Total-Count` header. Client-side pagination relies on whether the returned page has fewer items than `per_page` to determine `hasMore`.
- Messages are ordered by `sequence ASC` to preserve conversation order. Sequence is a per-session auto-incrementing integer starting from 0.
- Parts are included inline with each message to avoid requiring a separate parts-fetch round-trip.

### SDK Shape (ui-core)

The `useAgentMessages` hook is the shared data-fetching primitive consumed by both the Web UI and the TUI.

```typescript
function useAgentMessages(
  owner: string,
  repo: string,
  sessionId: string,
  options?: {
    perPage?: number;       // default 30, max 50
    enabled?: boolean;      // default true; set false to defer fetching
    autoPaginate?: boolean; // default false; when true, fetches all pages sequentially
  }
): {
  messages: AgentMessage[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
};
```

**Behavior:**
- On mount (when `enabled` is true), fetches the first page.
- `fetchMore()` fetches the next page and appends results to the accumulated list.
- `refetch()` clears accumulated data and re-fetches from page 1.
- When `owner`, `repo`, or `sessionId` changes, aborts in-flight requests and refetches.
- Coerces `sequence` from string to number on every message. Coerces `partIndex` from string to number on every part.
- Cache key is derived from `JSON.stringify({ owner, repo, sessionId, perPage })`.
- In normal chat mode (`autoPaginate: false`), accumulated items are capped at 500. Oldest messages are evicted when the cap is exceeded.
- In replay mode (`autoPaginate: true`), accumulated items are capped at 10,000. The hook sequentially fetches page after page until a page returns fewer than `perPage` items or the cap is reached.
- `hasMore` is derived from `page.items.length === perPage` (no server-side total count header).
- `totalCount` is the running count of accumulated messages (not a server-provided value).

### CLI Command

The CLI does not have a dedicated `agent session messages` list subcommand. Messages are accessed through:

**`codeplane agent session view <id>`** — Displays session details including the most recent messages.

**`codeplane agent session chat <id> <message>`** — Displays the running conversation and appends a new message.

**Options applicable to message display:**

| Flag         | Type    | Default | Description                      |
|--------------|---------|---------|----------------------------------|
| `--repo`     | string  | (auto)  | Repository override (OWNER/REPO) |
| `--json`     | flag    | false   | Output raw JSON array            |

**Default output** (conversation format):

```
Session: Fix the login redirect bug (completed)
Messages: 14

[You] 10:30 AM
Fix the login redirect bug

[Agent] 10:30 AM
I'll look into the login flow. Let me check the auth middleware first.

  ▶ Tool: read_file src/auth/middleware.ts
  ◀ Result: [content shown]

[Agent] 10:31 AM
I found the issue. The redirect URL is not being URL-encoded...
```

### Web UI Design

**Route:** `/:owner/:repo/agents/:sessionId` (within the repository view)

**Chat Screen (live session):**
- Messages render as a scrollable conversation view, newest at bottom.
- User messages are right-aligned with "You" label in the user's theme color.
- Agent messages are left-aligned with "Agent" label in accent/success color.
- System messages are centered with muted styling.
- Tool messages render as collapsible blocks showing tool name and arguments, with result expandable on click.
- "Load earlier messages" button/trigger appears at the top of the conversation when `hasMore` is true. Clicking or scrolling to top loads the previous page.
- Auto-scroll to bottom when new messages arrive, unless the user has scrolled up.
- "↓ New messages" indicator appears when scrolled up and new messages arrive.

**Replay Screen (completed/failed session):**
- Read-only view with no input area.
- All messages loaded via auto-pagination.
- Session summary header showing status, duration, and total message count.
- Full conversation rendered as a document.
- "Message N of M" position indicator when navigating.

**Agent Dock Integration:**
- The shell's Agent Dock can show the most recent messages from an active session.

### TUI UI

**Agent Chat Screen:**

The TUI chat screen renders messages from `useAgentMessages` with `autoPaginate: false`.

**Layout (120×40):**
```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Agent: Fix the login redirect bug   │
├──────────────────────────────────────────────────────────────┤
│ ▲ Load earlier messages                                      │
│                                                              │
│ You                                              10:30 AM    │
│ Fix the login redirect bug                                   │
│                                                              │
│ Agent                                            10:30 AM    │
│ I'll look into the login flow. Let me check the auth         │
│ middleware first.                                             │
│                                                              │
│  ▶ Tool: read_file                                          │
│  │ path: src/auth/middleware.ts                              │
│  ◀ Result: [42 lines]                                       │
│                                                              │
│ Agent                                            10:31 AM    │
│ I found the issue. The redirect URL is not being encoded...  │
├──────────────────────────────────────────────────────────────┤
│ > Type a message...                                          │
├──────────────────────────────────────────────────────────────┤
│ j/k:scroll  G:latest  Enter:send  Tab:expand  /:search  q:back│
└──────────────────────────────────────────────────────────────┘
```

**Message Rendering:**
- User messages: right-aligned, "You" label in primary color with timestamp.
- Agent messages: left-aligned, "Agent" label in success/green color with timestamp.
- System messages: centered, "System" label in muted/gray color.
- Tool messages: indented block with collapse/expand toggle.
  - Tool call: `▶ Tool: {name}` with arguments listed below.
  - Tool result: `◀ Result: {summary}` with full content expandable.
- Timestamps shown as relative time (e.g., "3m ago") in minimum breakpoint, and absolute time (e.g., "10:30 AM") in standard and large breakpoints.

**Keybindings:**

| Key         | Action                                   |
|-------------|------------------------------------------|
| `j` / `↓`  | Scroll down one message                  |
| `k` / `↑`  | Scroll up one message                    |
| `G`         | Jump to latest message                   |
| `gg`        | Jump to first loaded message             |
| `Tab`       | Expand/collapse focused tool block       |
| `x`         | Toggle expand/collapse focused tool block |
| `X`         | Expand/collapse all tool blocks          |
| `/`         | Search within messages                   |
| `Enter`     | Focus message input (compose mode)       |
| `q`         | Navigate back to session list            |

**Scroll-to-load behavior:**
- When the user scrolls to the top and `hasMore` is true, a "Loading earlier messages…" indicator appears and `fetchMore()` is called.
- After loading, scroll position is preserved.

**Auto-scroll behavior:**
- When at the bottom, new messages auto-scroll into view.
- When scrolled up, "↓ New messages" indicator appears. `G` jumps to latest.

**Empty State:**
- "No messages yet. Press Enter to send the first message."

**Agent Session Replay Screen:**
- No message input area (read-only).
- Session summary block: status badge, duration, total message count.
- Position indicator: "Message N of M".
- `]` / `[` keys for next/previous message navigation.

### Documentation

1. **"Viewing Agent Session Messages"** guide — Explains how to browse and navigate message history across Web UI, CLI, and TUI. Covers pagination, scrolling, tool block expansion, and replay mode.
2. **CLI reference for `codeplane agent session view`** — Message display behavior, output format, `--json` option.
3. **CLI reference for `codeplane agent session chat`** — Live message history and conversation format.
4. **API reference for `GET /api/repos/:owner/:repo/agent/sessions/:id/messages`** — Request/response schema, query parameters, error codes, pagination behavior, absence of `X-Total-Count`.
5. **TUI keybinding reference** — Chat screen and replay screen keybindings for message navigation and tool block interaction.
6. **Agent Session Replay guide** — Replay mode, auto-pagination, full history loading, and read-only navigation controls.

## Permissions & Security

### Authorization

| Role         | Can list messages? | Notes                                                     |
|-------------|:-:|-----------------------------------------------------------|
| Anonymous    | ❌ | Must be authenticated (401)                                |
| Read-only    | ✅ | Can view all messages in sessions they can access          |
| Member       | ✅ | Full read access to all session messages in the repository |
| Admin        | ✅ | Full read access                                          |
| Owner        | ✅ | Full read access                                          |

- **Authentication**: Enforced server-side. Missing or invalid credentials return 401.
- **Authorization**: Read access to the repository is sufficient to list messages. Write access is not required.
- **Repository scope**: Messages can only be listed for sessions belonging to the specified repository. Cross-repository session access is not possible.
- **Session existence check**: The session must exist and belong to the specified repository. If the session does not exist or belongs to a different repository, the response is 404.
- **Org/team permissions**: Organization and team-level read access grants message listing. Team-level restrictions are respected.

### Rate Limiting

- The `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` endpoint is subject to the global rate limiter applied to all API routes.
- Recommended rate limit: **120 requests per minute per authenticated user** for this endpoint (higher than session list because chat screens may poll or paginate rapidly).
- Automated polling for live chat should prefer SSE streaming over message list polling. If polling is necessary, a minimum interval of 5 seconds between requests is recommended.
- Burst allowance: Up to 20 requests in a 1-second burst window within the per-minute limit (to support rapid page-through in replay mode).
- 429 responses include a `Retry-After` header.

### Data Privacy

- **Message content may contain sensitive information.** Agent messages can include code snippets, file contents, error messages, credentials mentioned in conversation, and other repository-specific data. Message content is scoped to the repository and visible only to users with repository read access.
- **PII in messages**: Messages may reference user names, email addresses, or other PII as part of natural conversation. These are part of the conversation content and are not separately indexed or extracted.
- **Message content must not be logged at levels above `debug`.** Structured logs should include message IDs and counts, but never message body content.
- **Tool call content may contain file paths, function names, and arguments.** These are repository-scoped and treated with the same access control as message text.
- **Token handling**: Auth tokens are never included in error messages, client-side logs, or telemetry payloads.
- **Repository access revocation**: If a user loses access to a repository, they can no longer list messages in its sessions. The access check is performed on every request.

## Telemetry & Product Analytics

### Business Events

| Event Name                       | Trigger                                                    | Properties                                                                                                              |
|----------------------------------|------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `AgentMessageListViewed`          | User opens a session and messages are loaded (first page)  | `repo_id`, `owner`, `repo`, `session_id`, `session_status`, `client` (web/cli/tui/desktop), `message_count_loaded`, `mode` (chat/replay) |
| `AgentMessageListPaginated`       | User loads more messages (next page in chat or auto-page in replay) | `repo_id`, `session_id`, `client`, `page_number`, `accumulated_count`, `mode`                                            |
| `AgentMessageListReplayCompleted` | All messages loaded in replay mode (auto-pagination finishes) | `repo_id`, `session_id`, `client`, `total_messages_loaded`, `total_pages_fetched`, `total_load_time_ms`                  |
| `AgentMessageToolBlockExpanded`   | User expands a tool call/result block                      | `repo_id`, `session_id`, `client`, `part_type` (tool_call/tool_result), `tool_name`                                     |
| `AgentMessageSearched`            | User searches within messages (TUI `/` key)                | `repo_id`, `session_id`, `client`, `query_length`, `result_count`                                                        |
| `AgentMessageScrollToTop`         | User scrolls to the top and triggers load-earlier          | `repo_id`, `session_id`, `client`, `messages_before_load`, `load_latency_ms`                                             |

### Funnel Metrics

1. **Session open → Message list loaded rate**: What percentage of session opens result in a successfully loaded message list? Target: >99%.
2. **Replay completion rate**: What percentage of replay mode loads successfully fetch all messages? Target: >95%.
3. **Pages loaded per session view**: Average number of pages fetched per session view. High values in chat mode may indicate users need to frequently review older context.
4. **Tool block expansion rate**: What percentage of tool call/result blocks are expanded by users? Indicates engagement with tool interaction details.
5. **Time from session open to first message render** (client-side): Target: <500ms for first page, <2s for full replay of ≤100 messages.
6. **Memory cap hit rate**: How often do clients hit the 500/10,000 message memory caps? Should be <1%.

### Success Indicators

- Users who view agent message lists spend more time engaging with agent sessions overall.
- Replay mode adoption: at least 20% of completed session views use replay mode.
- Fewer than 1% of message list API calls result in errors.
- Average message list API latency is under 200ms at p95 for pages of 30.

## Observability

### Logging

| Log Point                                 | Level   | Structured Context                                                          |
|-------------------------------------------|---------|-----------------------------------------------------------------------------|
| Message list request received             | `info`  | `session_id`, `repo_id`, `user_id`, `page`, `per_page`                     |
| Message list returned successfully        | `info`  | `session_id`, `repo_id`, `user_id`, `message_count`, `page`, `latency_ms`  |
| Message list query failed                 | `error` | `session_id`, `repo_id`, `user_id`, `error_message`, `error_code`          |
| Message list auth rejected                | `warn`  | `request_id`, `ip_address`                                                  |
| Message list rate limited                 | `warn`  | `user_id`, `ip_address`, `endpoint`                                         |
| Session not found during message list     | `warn`  | `session_id`, `repo_id`, `user_id`                                          |
| Message list returned empty for session   | `debug` | `session_id`, `repo_id`, `page`                                             |
| Message parts query failed for message    | `error` | `message_id`, `session_id`, `error_message`                                 |
| Replay auto-pagination page fetched       | `debug` | `session_id`, `client`, `page_number`, `items_fetched`, `accumulated_count` |
| Replay auto-pagination completed          | `info`  | `session_id`, `client`, `total_pages`, `total_items`, `total_duration_ms`   |
| Client memory cap reached                 | `warn`  | `session_id`, `client`, `cap_type` (chat/replay), `cap_value`              |

### Prometheus Metrics

| Metric Name                                           | Type      | Labels                                       | Description                                         |
|-------------------------------------------------------|-----------|----------------------------------------------|-----------------------------------------------------|
| `codeplane_agent_message_list_requests_total`         | Counter   | `repo_id`, `status_code`                     | Total number of message list requests               |
| `codeplane_agent_message_list_latency_seconds`        | Histogram | `repo_id`                                    | Request latency for message list endpoint           |
| `codeplane_agent_message_list_result_count`           | Histogram | `repo_id`                                    | Number of messages returned per request             |
| `codeplane_agent_message_list_empty_total`            | Counter   | `repo_id`                                    | Requests returning zero messages                    |
| `codeplane_agent_message_parts_per_message`           | Histogram | `part_type`                                  | Distribution of parts per message                   |
| `codeplane_agent_message_list_session_not_found_total`| Counter   | `repo_id`                                    | Requests for non-existent sessions                  |

**Histogram buckets for latency:** 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0

**Histogram buckets for result count:** 0, 1, 5, 10, 20, 30, 50

### Alerts

#### Alert: High Message List Error Rate

**Condition:** `rate(codeplane_agent_message_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_agent_message_list_requests_total[5m]) > 0.05`

**Severity:** Warning (>5%), Critical (>20%)

**Runbook:**
1. Check server logs for `error_message` context on message list failures. Filter by `session_id` and `repo_id` to identify if failures are concentrated on specific sessions or repositories.
2. Verify database connectivity — the message list query reads from `agent_messages` and joins `agent_parts`. Check database health with a simple `SELECT 1`.
3. Check for query timeouts. The message list query uses `ORDER BY sequence ASC LIMIT/OFFSET`. If `agent_messages` has grown very large for a specific session (>100k messages), this query may time out. Verify index on `agent_messages(session_id, sequence)`.
4. Check if the `agent_parts` subquery is failing independently. If parts retrieval fails but message metadata succeeds, the response may still return 500 if parts are loaded inline.
5. Review database connection pool utilization. If the pool is exhausted, message list queries will queue behind other operations.
6. If errors are concentrated on a single session, inspect that session's data for corruption (e.g., orphaned messages, invalid part_type values).
7. Escalate to the database team if query plans have regressed or if the agent_messages table needs vacuuming.

#### Alert: High Message List Latency

**Condition:** `histogram_quantile(0.95, rate(codeplane_agent_message_list_latency_seconds_bucket[5m])) > 1.0`

**Severity:** Warning (>1s p95), Critical (>3s p95)

**Runbook:**
1. Check database query execution plans for the message list query (`EXPLAIN ANALYZE SELECT ... FROM agent_messages WHERE session_id = ? ORDER BY sequence ASC LIMIT ? OFFSET ?`).
2. Verify index on `agent_messages(session_id, sequence)` exists and is being used. If a sequential scan is occurring, create the index.
3. Check if high-offset pagination is the cause. Requests for `page=100` with `per_page=30` require scanning 3,000 rows. If this is common, consider cursor-based pagination.
4. Look for lock contention on `agent_messages`. Concurrent message appends (from agent runs) while listing can cause row-level locks.
5. Check if the inline parts join is the bottleneck. If parts have large `content` payloads (e.g., full file contents in tool results), the response serialization may be slow.
6. Monitor database memory and I/O. Large message content stored as JSONB can cause significant I/O pressure.
7. If a specific session has an unusually large number of messages (>10,000), verify that the query plan handles OFFSET efficiently.

#### Alert: High Session Not Found Rate

**Condition:** `rate(codeplane_agent_message_list_session_not_found_total[5m]) > 50`

**Severity:** Warning

**Runbook:**
1. Check if a client is polling with stale session IDs. A common cause is a client caching a session ID after the session has been deleted.
2. Review access logs to identify the user or API token generating the 404 requests.
3. If the requests are coming from automated tools or scripts, verify they are handling session deletion properly and clearing cached session IDs.
4. If the requests are cross-repository (session ID belongs to a different repo), investigate whether the client has a routing bug.
5. If the volume is from a single IP/user, consider whether it is a bug or potential enumeration attack. Rate limiting should mitigate enumeration.

#### Alert: Message List Rate Limiting Spike

**Condition:** `rate(codeplane_agent_message_list_requests_total{status_code="429"}[5m]) > 20`

**Severity:** Warning

**Runbook:**
1. Identify the user(s) being rate-limited from structured logs.
2. Check if a client is polling the message list endpoint in a tight loop instead of using SSE streaming for live updates.
3. If the traffic is from replay mode auto-pagination, verify that the client is using sequential fetching (not parallel), and check if the burst allowance is sufficient.
4. If the traffic is legitimate heavy usage, consider raising the per-user rate limit or recommending SSE-based updates for live sessions.
5. If the traffic is abusive, consider temporary IP-level blocking via the admin API.

### Error Cases and Failure Modes

| Error Case                                    | HTTP Code | User-Facing Message                  | Recovery                                        |
|-----------------------------------------------|-----------|--------------------------------------|-------------------------------------------------|
| Unauthenticated request                       | 401       | "Authentication required"            | User must log in                                |
| Repository not found                          | 404       | "Repository not found"               | Verify owner/repo path                          |
| No read access to repository                  | 404       | "Repository not found"               | Request access from repository admin            |
| Session not found                             | 404       | "Session not found"                  | Verify session ID; session may have been deleted|
| Session belongs to different repository       | 404       | "Session not found"                  | Use correct repository context                  |
| Empty session ID in path                      | 400       | "Session id is required"             | Provide valid session ID                        |
| Database connection failure                   | 500       | "Internal server error"              | Retry; check server health                      |
| Query timeout                                 | 500       | "Internal server error"              | Reduce page size; retry                         |
| Parts query failure for a message             | 500       | "Internal server error"              | Retry; check database health                    |
| Invalid page parameter (non-numeric)          | (clamped) | Uses default page 1                 | N/A (graceful degradation)                      |
| Invalid per_page parameter                    | (clamped) | Clamped to 50                        | N/A (graceful degradation)                      |
| Rate limited                                  | 429       | "Rate limit exceeded"                | Wait for Retry-After period; use SSE instead    |

## Verification

### API Integration Tests

- **List messages for a session with no messages** — Returns `200 OK` with empty array `[]`.
- **List messages for a session with one message** — Returns array of 1 message with all expected fields: `id`, `sessionId`, `role`, `sequence`, `createdAt`, `parts`.
- **List messages returns messages in sequence-ascending order** — Create 5 messages with known sequence values, verify ordering is 0, 1, 2, 3, 4.
- **List messages includes parts inline** — Create a message with 3 parts, verify parts array has 3 entries with correct `partIndex`, `partType`, and `content`.
- **List messages with text part** — Verify part has `partType: "text"` and `content` with `value` string.
- **List messages with tool_call part** — Verify part has `partType: "tool_call"` and `content` is a structured object.
- **List messages with tool_result part** — Verify part has `partType: "tool_result"` and `content` is a structured object.
- **List messages for a message with no parts** — Verify `parts` is an empty array `[]`.
- **List messages respects default pagination (page=1, per_page=30)** — Create 35 messages, request without params, verify 30 returned.
- **List messages respects explicit `per_page` parameter** — Request with `per_page=5`, verify 5 returned.
- **List messages clamps `per_page` to 50** — Request with `per_page=100`, verify at most 50 returned.
- **List messages with `per_page=1`** — Request with `per_page=1`, verify exactly 1 returned (the first message by sequence).
- **List messages with `per_page=50` (maximum valid)** — Create 50 messages, request with `per_page=50`, verify all 50 returned.
- **List messages with `per_page=51` is clamped to 50** — Create 51 messages, request with `per_page=51`, verify only 50 returned.
- **List messages page 2** — Create 35 messages, request page=2 with per_page=30, verify 5 returned with sequences 30–34.
- **List messages with `page=0`** — Verify graceful handling (treated as page 1).
- **List messages with `page` exceeding available pages** — Returns empty array `[]`.
- **List messages with non-numeric `page` parameter** — Verify graceful fallback to page 1.
- **List messages with non-numeric `per_page` parameter** — Verify graceful fallback to 30.
- **List messages with negative `per_page`** — Verify graceful fallback to default (30) or 1.
- **List messages requires authentication** — Request without auth returns 401.
- **List messages with invalid PAT returns 401**.
- **List messages for non-existent repository returns 404**.
- **List messages for a repository the user cannot access returns 404** (not 403).
- **List messages for non-existent session returns 404**.
- **List messages for a session belonging to a different repository returns 404**.
- **List messages with empty session ID in path returns 400** with "session id is required".
- **List messages with whitespace-only session ID returns 400**.
- **List messages does not return X-Total-Count header** — Verify the response does NOT include an `X-Total-Count` header.
- **List messages with user role messages** — Create a user message, verify `role` is `"user"`.
- **List messages with assistant role messages** — Create an assistant message, verify `role` is `"assistant"`.
- **List messages with system role messages** — Create a system message, verify `role` is `"system"`.
- **List messages with tool role messages** — Create a tool message, verify `role` is `"tool"`.
- **List messages with Unicode/emoji in content** — Create a message with emoji text content, verify returned verbatim.
- **List messages with HTML in content** — Create a message with `<script>alert('xss')</script>` in text, verify stored and returned as literal text.
- **List messages with very large text content (10KB)** — Create a text message with 10,000 characters, verify full content returned.
- **List messages with maximum page size (50 messages × multiple parts)** — Create 50 messages each with 5 parts, verify all messages and parts returned correctly in one request.
- **List messages with concurrent appends** — While a list request is in flight, append a message. Verify the newly appended message appears in the next list request at the correct sequence position.
- **List messages cross-session isolation** — Create messages in session A and session B. Verify listing session A returns only session A's messages.
- **List messages sequence correctness after interleaved writes** — Create messages by 2 different users in the same session, verify sequences are strictly monotonic.
- **Pagination consistency** — Fetch page 1 and page 2 in sequence. Verify no overlap and no gaps in sequence numbers across pages.
- **List messages after session deletion returns 404** — Delete a session, then attempt to list its messages. Verify 404.
- **List messages for each session status** — Verify messages can be listed for sessions with status `active`, `completed`, `failed`, `timed_out`, and `pending`.

### CLI E2E Tests

- **`codeplane agent session view <id>` displays messages** — Create a session with 3 messages, run `session view`, verify conversation output includes all 3 messages.
- **`codeplane agent session view <id> --json` includes messages array** — Verify JSON output includes a `messages` field with correct structure.
- **`codeplane agent session chat <id> <msg>` shows message history** — Create a session with 2 messages, run `session chat`, verify existing messages appear before the new message.
- **`codeplane agent session view` for session with tool calls** — Verify tool call/result parts are rendered in the conversation output.
- **`codeplane agent session view` for session with no messages** — Verify appropriate output indicating no messages.
- **`codeplane agent session view` without authentication** — Prints error message and exits non-zero.
- **`codeplane agent session view` with non-existent session ID** — Prints error message and exits non-zero.
- **`codeplane agent session view --repo owner/repo`** — Uses the specified repository context.
- **`codeplane agent session view` with auto-detected repo** — Correctly resolves from CWD.

### TUI E2E Tests — Chat Screen Message Rendering

- **Chat screen renders loading state on mount** — Shows spinner/loading indicator while messages are being fetched.
- **Chat screen renders empty state when session has no messages** — Shows "No messages yet. Press Enter to send the first message."
- **Chat screen renders user message with "You" label and primary color** — Verify role label and styling.
- **Chat screen renders assistant message with "Agent" label and success color** — Verify role label and styling.
- **Chat screen renders system message with "System" label and muted color** — Verify role label and styling.
- **Chat screen renders message timestamps** — Verify timestamps are shown in the appropriate format for terminal width.
- **Chat screen renders text part content** — Verify text content of a message is displayed.
- **Chat screen renders tool_call part as collapsible block** — Verify tool name and collapsed indicator.
- **Chat screen renders tool_result part as collapsible block** — Verify result summary and collapsed indicator.
- **Chat screen renders multiple parts per message** — Verify a message with text + tool_call + tool_result renders all parts in order.
- **Tab key expands/collapses focused tool block** — Verify toggle behavior.
- **`x` key toggles focused tool block** — Verify toggle behavior.
- **`X` key expands/collapses all tool blocks** — Verify batch toggle.
- **Messages appear in sequence order** — Create messages with known sequences, verify rendering order matches.
- **Auto-scroll to bottom for new messages** — When at bottom and new message arrives, view scrolls to show it.
- **"↓ New messages" indicator when scrolled up** — Scroll up, then verify indicator appears when new messages are added.
- **`G` key jumps to latest message** — Verify scroll position is at the newest message.
- **`gg` key jumps to first loaded message** — Verify scroll position is at the oldest loaded message.
- **`j`/`k` keys scroll through messages** — Verify focus moves between messages.
- **`/` key opens search within messages** — Verify search input appears and filters visible messages.
- **`q` key navigates back to session list** — Verify screen transition.
- **Unicode and emoji in messages render correctly** — Create messages with various Unicode content, verify rendering.

### TUI E2E Tests — Chat Screen Pagination

- **"Load earlier messages" appears when `hasMore` is true** — Create 35 messages, load chat, verify indicator at top.
- **Scrolling to top triggers `fetchMore()`** — Scroll to top, verify additional messages load.
- **Scroll position preserved after loading earlier messages** — After fetching more, verify the user is still looking at the same message, not jumped to top.
- **"Load earlier messages" disappears when all messages are loaded** — Fetch all pages, verify indicator is gone.
- **Memory cap at 500 messages in chat mode** — Create 600 messages, load all pages, verify only 500 most recent are in memory.
- **No "Load earlier messages" for sessions with ≤30 messages** — Create 20 messages, verify no load-more indicator.

### TUI E2E Tests — Replay Screen

- **Replay screen loads all messages via auto-pagination** — Create 100 messages, open replay, verify all 100 are loaded.
- **Replay screen shows loading progress during auto-pagination** — Verify "Loading messages… N loaded" indicator during fetch.
- **Replay screen is read-only (no input area)** — Verify no message input is rendered.
- **Replay screen shows session summary** — Verify status badge, duration, and message count.
- **Replay screen shows position indicator "Message N of M"** — Verify indicator updates as user navigates.
- **`]` key navigates to next message** — Verify position indicator advances.
- **`[` key navigates to previous message** — Verify position indicator retreats.
- **Replay handles 10,000 message cap** — Create 10,001 messages, verify replay loads 10,000 and displays a cap warning.
- **Replay screen for session with 1 message** — Verify renders correctly without navigation confusion.

### Web UI (Playwright) E2E Tests

- **Chat page loads and displays messages** — Navigate to `/:owner/:repo/agents/:sessionId`, verify message conversation renders.
- **Chat page renders user messages right-aligned** — Verify styling/layout of user messages.
- **Chat page renders agent messages left-aligned** — Verify styling/layout of agent messages.
- **Chat page renders tool blocks as collapsible** — Verify tool call/result blocks are present and clickable.
- **Expanding a tool block shows content** — Click a collapsed tool block, verify content becomes visible.
- **"Load earlier messages" trigger at top of conversation** — Scroll to top of a long session, verify load-more trigger fires and additional messages appear.
- **Auto-scroll on new message (when at bottom)** — Verify page scrolls to newest message.
- **"New messages" indicator when scrolled up** — Scroll up, trigger a new message, verify indicator appears.
- **Replay page loads all messages** — Navigate to a completed session, verify all messages are rendered without input area.
- **Replay page shows session summary** — Verify status, duration, and message count.
- **Chat page shows empty state for session with no messages** — Verify empty state message.
- **Chat page is not accessible without login** — Navigate while logged out, verify redirect to login.
- **Chat page for non-existent session shows 404** — Navigate to invalid session ID, verify error page.
- **Messages with special characters render correctly** — Verify HTML entities, Unicode, and emoji are displayed properly.
- **Pagination works across multiple pages** — Create 60+ messages, verify all can be loaded by scrolling/clicking "load more".

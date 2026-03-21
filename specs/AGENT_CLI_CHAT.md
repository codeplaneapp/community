# AGENT_CLI_CHAT

Specification for AGENT_CLI_CHAT.

## High-Level User POV

When you've kicked off a remote agent session — whether through `codeplane agent run`, the web UI, the TUI, or a workflow — the conversation doesn't have to end with the first prompt. `codeplane agent session chat` (or the shorthand `codeplane agent chat`) lets you continue the conversation directly from your terminal, sending follow-up messages to an existing agent session and seeing the agent's response.

This is the multi-turn conversation primitive for Codeplane's remote agent system. You already have a session running — maybe the agent is investigating a bug, triaging an issue, or drafting a change. Now you want to give it more context, redirect its approach, ask a clarifying question, or simply nudge it forward. You type `codeplane agent chat <session-id> "Actually, focus on the auth middleware instead"` and the message is appended to the session's conversation thread, the agent is dispatched to process it, and you get back confirmation that your follow-up was delivered.

The command is designed to feel like a natural continuation of the `run` → `view` → `chat` lifecycle. You fire off a task with `run`, check progress with `view`, and steer the conversation with `chat`. Each `chat` message you send appears in the session's timeline across all Codeplane surfaces — the web UI's agent dock, the TUI's agent chat screen, and the CLI's `view --messages` output. It's the same conversation no matter where you look at it.

For scripting and automation, `chat` supports structured output formats (`--json`, `--toon`, `--yaml`) so you can capture the response metadata programmatically. A CI pipeline might use `chat` to send status updates to an agent session, or a monitoring script might feed new context into an ongoing investigation. The command is composable: it accepts a session ID (which you can extract from `run --json` or `list --json` output) and a message string, making it straightforward to chain with other CLI commands and standard Unix tools.

If the session no longer exists, has completed, or you lack access, the command tells you clearly what went wrong and exits with a non-zero code. Your message text is never silently lost — if delivery fails, you know immediately and can retry or take a different approach.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane agent session chat <id> <message>` appends a user message to the specified remote agent session and returns the created message object to stdout.
- [ ] `codeplane agent chat <id> <message>` works as a shorthand (the argument rewriting logic in `main.ts` does **not** intercept `chat` as it is a reserved subcommand, and the `createRemoteSessionCommands` mixin attaches `chat` to both the `session` and `agent` command groups).
- [ ] The command returns a structured message object containing at minimum: `id`, `sessionId`, `role`, `sequence`, `createdAt`.
- [ ] The command exits with code 0 on success and non-zero on any failure.
- [ ] The `AGENT_CLI_CHAT` feature flag in `specs/features.ts` accurately reflects the maturity of this command.

### Input Constraints

- [ ] `id` is a required positional argument of type `string`. It identifies the target agent session.
- [ ] `id` must be a non-empty string after trimming. An empty or whitespace-only ID must produce a validation error.
- [ ] `id` is passed as-is to the API — the CLI does not perform client-side UUID format validation. The server's error response (400 or 404) is surfaced if the format is invalid.
- [ ] `message` is a required positional argument of type `string`.
- [ ] `message` must be at least 1 character after trimming. An empty string or whitespace-only string must produce a client-side validation error with a clear message.
- [ ] `message` must be at most 100,000 characters (100 KB). A message exceeding this limit must produce a client-side validation error.
- [ ] `message` may contain any valid UTF-8 characters including newlines, special characters, quotes, emoji, and multi-byte codepoints.
- [ ] `--repo` / `-R` is an optional string in `OWNER/REPO` format. When omitted, repo is resolved from the current working directory using the standard `resolveRepoRef` logic.
- [ ] If `--repo` is provided but malformed (missing slash, empty segments), the CLI must exit with a clear validation error before making any API calls.

### Behavioral Constraints

- [ ] The command performs exactly one API call: `POST /api/repos/:owner/:repo/agent/sessions/:id/messages`.
- [ ] The message is sent with `role: "user"` and a single part of `type: "text"` with `content` set to the message string.
- [ ] When the message is appended with `role: "user"`, the server dispatches an agent run for the session. This dispatch is fire-and-forget from the CLI's perspective.
- [ ] The command respects the `--format` global flag (`json`, `toon`, `yaml`, `md`, `jsonl`). Default output is the CLI's standard human-readable format.
- [ ] The command respects the `--filter-output` global flag for JSON field selection.
- [ ] Authentication is required. If no valid auth token is available, the command must exit with a clear error directing the user to `codeplane auth login`.
- [ ] The response includes the full message object with server-assigned `id`, `sessionId`, `role`, `sequence`, `createdAt`, and the `parts` array.

### Edge Cases

- [ ] Message consisting entirely of whitespace is rejected client-side with a validation error.
- [ ] Message containing only control characters (e.g., `\x00`, `\x01`) is sent as-is — the server is responsible for any sanitization.
- [ ] If the session does not exist, the API returns 404 and the CLI surfaces the error.
- [ ] If the session exists but belongs to a different repository than the resolved `--repo`, the API returns 404 and the CLI surfaces "agent session not found".
- [ ] If the session is in a terminal state (`completed`, `failed`, `timed_out`), the server may accept or reject the message — the CLI surfaces whatever the server returns without special handling.
- [ ] If the user is not authenticated, the API returns 401 and the CLI surfaces the error.
- [ ] If the user lacks write access to the repository, the API returns 403 and the CLI surfaces the error.
- [ ] Network timeouts and connection errors produce a clear error message (not a raw stack trace).
- [ ] Running the command from a directory that is not inside a Codeplane-linked repository, without providing `--repo`, produces a clear error.
- [ ] Concurrent `chat` calls against the same session are allowed and produce messages with distinct, contiguous sequence numbers.
- [ ] Sending multiple messages rapidly (within 2 seconds) is governed by server-side rate limiting, not client-side throttling.
- [ ] Messages containing shell metacharacters (`$`, `` ` ``, `\`, `!`) are not interpreted by the CLI — they are passed as literal content to the API.
- [ ] Messages containing embedded JSON strings are sent as literal text, not parsed as structured input.
- [ ] A message of exactly 100,000 characters succeeds.
- [ ] A message of 100,001 characters fails with a size error.

## Design

### CLI Command

**Command path:** `codeplane agent session chat <id> <message>` or `codeplane agent chat <id> <message>`

**Synopsis:**
```
codeplane agent chat <id> <message> [--repo <OWNER/REPO>] [--format <format>]
codeplane agent session chat <id> <message> [--repo <OWNER/REPO>]
```

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | The UUID of the target agent session. |
| `message` | string | Yes | The message text to send to the agent. |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo`, `-R` | string | Auto-detected from cwd | Target repository in `OWNER/REPO` format. |
| `--format` | string | CLI default | Output format: `json`, `toon`, `yaml`, `md`, `jsonl`. |
| `--filter-output` | string | — | JSON path filter for structured output. |

**Example usage:**

```bash
# Basic chat follow-up
codeplane agent chat a1b2c3d4-e5f6-7890-abcd-ef1234567890 "Focus on the auth middleware instead"

# With explicit repo
codeplane agent chat a1b2c3d4 "Also check the rate limiter" --repo myorg/myrepo

# JSON output for scripting
codeplane agent chat a1b2c3d4 "What did you find?" --format json

# Extract the sequence number
codeplane agent chat a1b2c3d4 "Continue" --format json --filter-output ".sequence"

# Full path via session subcommand
codeplane agent session chat a1b2c3d4 "Try a different approach"

# Multiline message (shell heredoc)
codeplane agent chat a1b2c3d4 "$(cat <<'EOF'
Here is additional context:
- The bug only happens on login
- It was introduced in v2.3.0
- See issue #42 for details
EOF
)"

# Chained with run
SESSION_ID=$(codeplane agent run "Fix bug #42" --format json --filter-output ".id")
codeplane agent chat "$SESSION_ID" "Also add test coverage for the fix"
```

**Standard output (human-readable):**

```
Message sent.

  Session: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Message: msg-uuid-here
  Sequence: 3
  Sent:    2026-03-22T10:35:00Z

Use 'codeplane agent session view a1b2c3d4 --messages' to see the conversation.
```

**Structured output (JSON):**

```json
{
  "id": "msg-uuid-here",
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "role": "user",
  "sequence": 3,
  "createdAt": "2026-03-22T10:35:00.000Z",
  "parts": [
    {
      "id": "part-uuid",
      "messageId": "msg-uuid-here",
      "partIndex": 0,
      "partType": "text",
      "content": { "value": "Focus on the auth middleware instead" },
      "createdAt": "2026-03-22T10:35:00.000Z"
    }
  ]
}
```

**Error output examples:**

```
Error: Message cannot be empty.

Error: Agent session not found.

Error: Not authenticated. Run 'codeplane auth login' first.

Error: Repository not found. Specify --repo OWNER/REPO or run from inside a Codeplane-linked repository.

Error: Message too long (100,532 characters). Maximum is 100,000 characters.

Error: Permission denied. You need write access to this repository.
```

### API Shape

The `chat` command uses a single existing API endpoint:

```
POST /api/repos/:owner/:repo/agent/sessions/:id/messages
Content-Type: application/json
Authorization: Bearer <token>

{
  "role": "user",
  "parts": [
    {
      "type": "text",
      "content": "Focus on the auth middleware instead"
    }
  ]
}

Response 201:
{
  "id": "msg-uuid",
  "sessionId": "session-uuid",
  "role": "user",
  "sequence": 3,
  "createdAt": "2026-03-22T10:35:00.000Z",
  "parts": [
    {
      "id": "part-uuid",
      "messageId": "msg-uuid",
      "partIndex": 0,
      "partType": "text",
      "content": { "value": "Focus on the auth middleware instead" },
      "createdAt": "2026-03-22T10:35:00.000Z"
    }
  ]
}
```

The message append with `role: "user"` triggers the server-side `dispatchAgentRun` call, which starts/continues the agent's execution for this session.

### Argument Rewriting Behavior

The `rewriteAgentArgv` function in `main.ts` has `"chat"` in its reserved set. This means:

- `codeplane agent chat <id> "msg"` → recognized as `agent` + reserved subcommand `chat` → argv passes through unchanged → dispatched to the `chat` command on the `agent` command group (via the `createRemoteSessionCommands` mixin).
- `codeplane agent session chat <id> "msg"` → `agent` + reserved subcommand `session` → passes through → `session` subcommand → `chat` subcommand.

Both paths reach the same handler. No rewriting to `ask` occurs.

### Output Formatting

A `formatAgentChatResponse` function is added to `apps/cli/src/output.ts`, following the same structural pattern as other CLI output formatters.

```typescript
export function formatAgentChatResponse(message: JsonRecord): string
```

This function:
- Returns a "Message sent." header line
- Renders key fields: Session (ID), Message (ID), Sequence, and Sent timestamp
- Appends a hint line pointing the user to `agent session view <id> --messages`

### SDK Shape

No new SDK service method is required. The CLI chat command consumes the existing:

- `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` — message append

### TUI Integration

The TUI's agent chat screen reflects messages sent via `agent chat`. No special TUI work is needed for `AGENT_CLI_CHAT` itself — the TUI reads from the same message list endpoint and SSE stream. Messages sent by the CLI appear in real-time in the TUI agent chat view (if connected via SSE) or on the next poll/refresh.

### Web UI Integration

Messages sent via `agent chat` appear in the web UI's agent dock and agent session detail page. The dock receives the message via SSE or polling fallback, maintaining conversation continuity across surfaces.

### Documentation

1. **CLI Reference — `agent chat`**: Command synopsis, arguments, options, examples (basic follow-up, with repo, JSON output, scripting with heredoc, chaining with `run`). Include a note that this command sends a single message and returns immediately — it does not stream the agent's response.
2. **CLI Reference — `agent session chat`**: Cross-reference to `agent chat` noting they are equivalent.
3. **Guide — "Working with Agent Sessions"**: Add a "Continuing a conversation" subsection covering the `run` → `view` → `chat` lifecycle with examples showing the full flow from session creation to multi-turn conversation.
4. **Guide — "Scripting with Agent Sessions"**: Examples of extracting the session ID from `run --json` and passing it to `chat`, using shell variables and pipes for automated multi-step agent workflows.

## Permissions & Security

### Authorization

| Role | Can run `agent chat`? | Notes |
|------|----------------------|-------|
| Owner | ✅ | Full access to agent sessions on owned repos. |
| Admin | ✅ | Full access to agent sessions on administered repos. |
| Member (Write) | ✅ | Can send messages to any session in the repo. |
| Member (Read) | ❌ | Cannot send messages. Receives 403. |
| Anonymous | ❌ | Must authenticate. Receives 401. |

- Sessions are scoped to a repository. The user must have at minimum write access to the repository to send messages.
- Any user with write access can send messages to any session in the repository — messages are not restricted to the session creator. This is consistent with how issue comments work on other Codeplane resources.
- PAT-based auth must include agent session scopes (if scoped tokens are implemented).
- Deploy keys are NOT permitted to send agent messages.

### Rate Limiting

| Scope | Limit | Window | Notes |
|-------|-------|--------|-------|
| Message append | 120 messages | per user per hour | Prevents flooding a session. |
| Per-session | 60 messages | per session per 10 minutes | Prevents single-session flooding. |
| Per-repository | 300 messages | per repo per hour | Prevents abuse across all sessions. |

Rate limit responses must include `Retry-After` header and return HTTP 429 with a clear message. The CLI must surface the `Retry-After` value to the user.

### Data Privacy

- Messages may contain PII, code, secrets, or sensitive business context. Messages must be stored encrypted at rest alongside all other agent message content.
- Message content is not logged at INFO level. Only session IDs, message IDs, user IDs, and repository IDs may appear in standard logs.
- The CLI must not echo the full message content in error messages sent to external telemetry systems.
- Agent session data (including messages sent via `chat`) must be included in any user data export or deletion (GDPR right to erasure) flows.
- The CLI writes message content to stdout, which may be captured in shell history or log files. No additional redaction is applied — the user is assumed to be in a trusted terminal environment.

## Telemetry & Product Analytics

### Business Events

| Event | When Fired | Properties |
|-------|------------|------------|
| `AgentMessageSent` | Message append API returns 201 | `sessionId`, `messageId`, `repositoryId`, `userId`, `sequence`, `messageLength`, `source: "cli"`, `repoResolutionMethod: "flag" \| "cwd"` |
| `AgentChatFailed` | Message append API call fails | `sessionId`, `repositoryId`, `userId`, `errorType: "not_found" \| "auth" \| "permission" \| "rate_limit" \| "server_error" \| "network"`, `httpStatus`, `source: "cli"` |
| `AgentChatValidationFailed` | Client-side validation rejects input | `reason: "empty_message" \| "message_too_long" \| "empty_session_id" \| "invalid_repo" \| "no_auth"`, `source: "cli"` |

### Funnel Metrics

1. **Chat-to-view conversion**: % of `chat` messages followed by a `view` or `view --messages` call within 5 minutes. Indicates users are checking agent responses.
2. **Run-to-chat conversion**: % of sessions created via `run` that receive at least one `chat` follow-up within 1 hour. Target >30%. Indicates multi-turn value.
3. **Messages per session**: Average number of `chat` messages per session (across all sessions that receive at least one `chat`). Indicates depth of conversation.
4. **Chat error rate**: % of `chat` invocations that fail. Target <2% under normal conditions.
5. **Repeat chat within session**: % of sessions that receive 3+ `chat` messages. Indicates sustained multi-turn usage.
6. **Message length distribution**: P50/P90/P99 message lengths, informing whether the 100K limit is appropriate.

### Success Indicators

- Run-to-chat conversion >30% (users are engaging in multi-turn conversations).
- Average messages per session >2 for sessions with any `chat` usage.
- Chat error rate below 2% under normal operating conditions.
- Increasing weekly `chat` usage alongside increasing `run` usage indicates the full agent lifecycle is being adopted.

## Observability

### Logging

| Log Event | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Chat message request | INFO | `userId`, `sessionId`, `repositoryId`, `source: "cli"`, `messageLength` | Never log message content. |
| Chat message created | INFO | `sessionId`, `messageId`, `role`, `sequence`, `userId` | |
| Agent run dispatched | INFO | `sessionId`, `userId`, `repositoryId`, `triggerMessageId` | |
| Chat message failed | WARN | `sessionId`, `userId`, `repositoryId`, `httpStatus`, `errorCode` | |
| Validation rejected | DEBUG | `reason`, `field` | CLI-side only. |
| Rate limit hit | WARN | `userId`, `repositoryId`, `sessionId`, `endpoint`, `retryAfter` | |
| Session not found | WARN | `sessionId`, `userId`, `repositoryId` | |
| Permission denied | WARN | `userId`, `repositoryId`, `sessionId` | |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_agent_messages_appended_total` | Counter | `source` (`cli`, `web`, `tui`, `api`), `role`, `repository` | Total messages appended across all sources. |
| `codeplane_agent_message_append_duration_seconds` | Histogram | `source`, `status` (`success`, `error`) | Latency of message append API call. |
| `codeplane_agent_chat_message_length_bytes` | Histogram | `source` | Distribution of chat message sizes in bytes. |
| `codeplane_agent_chat_sequence_number` | Histogram | `repository` | Distribution of sequence numbers, indicating conversation depth. |
| `codeplane_agent_run_dispatches_total` | Counter | `repository`, `source` | Total agent run dispatches triggered by user messages. |
| `codeplane_agent_run_dispatch_errors_total` | Counter | `repository`, `error_type` | Failed dispatches after successful message creation. |
| `codeplane_agent_cli_chat_errors_total` | Counter | `error_stage` (`validation`, `message_append`, `network`) | CLI-side error breakdown. |
| `codeplane_agent_messages_per_session` | Histogram | `repository` | Messages per session at time of new message append. |

### Alerts

#### Alert 1: High Agent Chat Message Error Rate
- **Condition:** `rate(codeplane_agent_cli_chat_errors_total{error_stage="message_append"}[5m]) / rate(codeplane_agent_messages_appended_total{source="cli"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_agent_message_append_duration_seconds` for latency spikes — if P99 > 5s, the database may be under load.
  2. Check database connection pool metrics. If saturated, investigate concurrent load sources.
  3. Check for 404 errors — if dominant, users may be referencing deleted or expired sessions. Check session cleanup/TTL settings.
  4. Check for 429 errors — if dominant, review whether rate limits are too aggressive for current usage patterns. Check `retryAfter` values in logs.
  5. Review server logs for `chat message failed` entries filtered by the last 10 minutes. Look for consistent HTTP error codes (500 = server bug, 503 = capacity).
  6. If 403 errors dominate, check for a permission model regression in a recent deployment.

#### Alert 2: Agent Run Dispatch Failures After Chat
- **Condition:** `rate(codeplane_agent_run_dispatch_errors_total[5m]) > 5`
- **Severity:** Critical
- **Runbook:**
  1. The dispatch step runs after message append succeeds. Check if the agent execution backend is healthy.
  2. Check for workspace provisioning failures if the agent backend uses workspace sandboxes.
  3. Review the `dispatchAgentRun` service logs for errors. Look for missing repository context, permission denials, or infrastructure failures.
  4. If the dispatch is async, check the agent worker queue for backlogs or stuck items.
  5. Verify the PostgreSQL NOTIFY pipeline is operational — dispatch relies on `notifyAgentMessage` to signal downstream consumers.
  6. Check if specific sessions are stuck in `active` state with no progress — may indicate a deadlock in the sequence lock.

#### Alert 3: Message Sequence Contention
- **Condition:** `histogram_quantile(0.99, rate(codeplane_agent_message_append_duration_seconds_bucket{source="cli"}[5m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. High P99 latency on message append often indicates `FOR UPDATE` lock contention on the session row.
  2. Check for concurrent `chat` or `run` calls to the same session — high concurrency can cause sequence lock waits.
  3. Check PostgreSQL lock stats for the `agent_sessions` table: `SELECT * FROM pg_locks WHERE relation = 'agent_sessions'::regclass`.
  4. If a single session has extreme contention, check if an automated script is flooding it.
  5. Consider whether the lock strategy needs optimization (e.g., advisory locks or sequence table).

#### Alert 4: Elevated CLI Validation Failures
- **Condition:** `rate(codeplane_agent_cli_chat_errors_total{error_stage="validation"}[1h]) > 50`
- **Severity:** Info
- **Runbook:**
  1. Check the `reason` label distribution: if `message_too_long` dominates, consider whether the 100K limit should be increased.
  2. If `empty_message` dominates, check for broken automation scripts sending empty payloads.
  3. If `empty_session_id` dominates, check if users are confused about the argument order (id before message).
  4. Review CLI version distribution — old CLI versions may not enforce client-side validation.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | CLI Behavior | Recovery |
|---|---|---|---|
| User not authenticated | 401 | Exit 1, print auth instructions | `codeplane auth login` |
| Repository not found | 404 | Exit 1, print repo resolution help | Verify `--repo` or cwd |
| Insufficient permissions | 403 | Exit 1, print permission error | Request write access |
| Session not found | 404 | Exit 1, print "agent session not found" | Verify session ID with `agent list` |
| Session in terminal state | Varies | Exit per server response | Create a new session with `agent run` |
| Rate limit exceeded | 429 | Exit 1, print retry-after time | Wait and retry |
| Message append server error | 500 | Exit 1, print error details | Retry or file issue |
| Network timeout | — | Exit 1, print timeout message | Check connectivity |
| DNS resolution failure | — | Exit 1, print host unreachable | Check server URL config |
| Message too long | — (client-side) | Exit 1, print max length + actual length | Shorten message |
| Empty message | — (client-side) | Exit 1, print non-empty requirement | Provide a message |
| Empty session ID | — (client-side) | Exit 1, print session ID required | Provide session ID |
| Invalid repo format | — (client-side) | Exit 1, print expected format | Use `OWNER/REPO` |
| Server unreachable | — | Exit 1, print connection refused | Check server status |
| Sequence lock timeout | 500 or 503 | Exit 1, print error | Retry after brief wait |

## Verification

### API Integration Tests

| # | Test | Expected |
|---|------|----------|
| 1 | `POST /agent/sessions/:id/messages` with valid user message to existing session | 201, returns message with `id`, `role: "user"`, `sequence`, `createdAt`, and `parts` array |
| 2 | `POST /agent/sessions/:id/messages` without auth returns 401 | 401 Unauthorized |
| 3 | `POST /agent/sessions/:id/messages` on non-existent session returns 404 | 404 Not Found |
| 4 | `POST /agent/sessions/:id/messages` by read-only user returns 403 | 403 Forbidden |
| 5 | `POST /agent/sessions/:id/messages` with text content of exactly 100,000 characters succeeds | 201 |
| 6 | `POST /agent/sessions/:id/messages` with text content of 100,001 characters returns 400 | 400 Bad Request |
| 7 | `POST /agent/sessions/:id/messages` with empty body returns 400 | 400 with "invalid request body" |
| 8 | `POST /agent/sessions/:id/messages` with missing `role` returns 400 | 400 with "invalid role" |
| 9 | `POST /agent/sessions/:id/messages` with invalid `role` value returns 400 | 400 with "invalid role" |
| 10 | `POST /agent/sessions/:id/messages` with empty `parts` array returns 400 | 400 with "parts are required" |
| 11 | `POST /agent/sessions/:id/messages` with bare string text content is normalized to `{ value: string }` | 201, content stored as object |
| 12 | Sequential chat messages produce incrementing sequence numbers | Sequences 0, 1, 2, ... |
| 13 | Concurrent chat messages to the same session produce unique, contiguous sequence numbers | All sequences unique, no gaps |
| 14 | Message with `role: "user"` triggers `dispatchAgentRun` | Dispatch is called with correct session/user/repo IDs |
| 15 | Message with `role: "assistant"` does NOT trigger `dispatchAgentRun` | No dispatch |
| 16 | Chat message appears in `GET /agent/sessions/:id/messages` list | Message present in paginated results with correct sequence |
| 17 | Rate limit returns 429 after exceeding threshold | 429 with `Retry-After` header |
| 18 | Message containing emoji, newlines, and special characters round-trips correctly | Content matches on retrieval |
| 19 | Message containing null bytes (`\x00`) is handled without crashing | Either accepted or rejected with 400 (not 500) |
| 20 | Chat to a session belonging to a different repository returns 404 | 404 Not Found |
| 21 | Chat with 101 parts returns 400 | 400 with parts count error |
| 22 | Chat with tool_call part as bare string returns 400 | 400 with "part content must be an object" |
| 23 | Chat message increments session's `messageCount` in list/view endpoints | Count increases by 1 |
| 24 | Multiple messages from different users to the same session produce correct, non-overlapping sequences | Sequences are unique and monotonic |
| 25 | Request body exceeding 5 MB returns 413 | 413 Payload Too Large |
| 26 | Chat to a completed session — verify server behavior (accept or reject) | Consistent, non-500 response |
| 27 | Chat to a failed session — verify server behavior | Consistent, non-500 response |
| 28 | Chat to a timed_out session — verify server behavior | Consistent, non-500 response |

### CLI Integration Tests

| # | Test | Expected |
|---|------|----------|
| 29 | `codeplane agent chat <id> "hello"` sends message and returns message object | Exit 0, output contains message ID and sequence number |
| 30 | `codeplane agent session chat <id> "hello"` produces identical behavior | Exit 0, same output structure |
| 31 | `codeplane agent chat <id> "hello" --repo owner/repo` targets specified repo | Message created in correct repo's session |
| 32 | `codeplane agent chat <id> "hello" -R owner/repo` works with alias | Same as --repo |
| 33 | `codeplane agent chat <id> "hello" --format json` outputs valid JSON | Exit 0, parseable JSON with `id`, `sessionId`, `role`, `sequence`, `createdAt` fields |
| 34 | `codeplane agent chat <id> "hello" --format json --filter-output ".sequence"` returns only the sequence number | Exit 0, output is just the sequence integer |
| 35 | `codeplane agent chat <id> ""` (empty message) fails with validation error | Exit non-zero, error message mentions empty message |
| 36 | `codeplane agent chat <id> "  "` (whitespace-only message) fails with validation error | Exit non-zero |
| 37 | `codeplane agent chat <id>` without message argument fails with usage error | Exit non-zero, shows usage |
| 38 | `codeplane agent chat` without id or message argument fails with usage error | Exit non-zero |
| 39 | `codeplane agent chat <id> "hello" --repo "invalid"` (no slash) fails with validation error | Exit non-zero |
| 40 | `codeplane agent chat <id> "hello" --repo "/repo"` (empty owner) fails | Exit non-zero |
| 41 | `codeplane agent chat <id> "hello" --repo "owner/"` (empty repo) fails | Exit non-zero |
| 42 | `codeplane agent chat <id> "hello"` without auth token fails with auth error | Exit non-zero, mentions `codeplane auth login` |
| 43 | `codeplane agent chat <nonexistent-uuid> "hello"` returns 404 error | Exit non-zero, error mentions "not found" |
| 44 | Message of exactly 100,000 characters succeeds | Exit 0 |
| 45 | Message of 100,001 characters fails with size error | Exit non-zero, error mentions maximum length |
| 46 | `codeplane agent chat <id> "hello" --format toon` outputs valid TOON | Exit 0, parseable TOON |
| 47 | `codeplane agent chat <id> "hello" --format yaml` outputs valid YAML | Exit 0, parseable YAML |
| 48 | Message sent via `chat` is visible via `codeplane agent session view <id> --messages` | Message text appears in transcript |
| 49 | Message sent via `chat` is visible via `codeplane agent session view <id> --messages --json` | Message object appears in messages array |
| 50 | Multiple `chat` messages to the same session produce incrementing sequences | Sequences increase monotonically |
| 51 | `codeplane agent chat <id> "prompt with 'quotes' and \"double quotes\""` handles shell quoting | Message created with correct content |
| 52 | `codeplane agent chat <id> "prompt\nwith\nnewlines"` preserves newlines | Message content contains newlines |
| 53 | `codeplane agent chat <id> "emoji 🚀 and CJK 日本語"` preserves multi-byte characters | Message content preserved exactly |
| 54 | Two rapid sequential `chat` calls return different sequence numbers | Both succeed, sequences are distinct |

### End-to-End Playwright Tests (Web UI Verification)

| # | Test | Expected |
|---|------|----------|
| 55 | Create session via API, send message via CLI `agent chat`, verify message appears in web UI agent session detail page | User message text visible in conversation timeline |
| 56 | Create session via CLI `agent run`, send follow-up via CLI `agent chat`, verify both messages appear in web UI session replay | Initial prompt and follow-up both visible in order |
| 57 | Send message via CLI `agent chat`, verify message count updates in web UI session list | Message count incremented |

### End-to-End Workflow Tests

| # | Test | Expected |
|---|------|----------|
| 58 | Full lifecycle: `agent run` → `agent chat` → `agent session view --messages` | All commands succeed, message count reflects all messages, transcript includes both prompt and follow-up |
| 59 | Full lifecycle: `agent run --format json` → extract session ID → `agent chat <id> "follow-up"` → `agent session view <id> --json` | Chained commands work, session has 2+ messages |
| 60 | `agent chat` output is pipe-able: `codeplane agent chat <id> "hello" --format json | jq .sequence` | Valid integer output |
| 61 | Create session, send 5 `chat` messages, verify `agent session view <id>` shows correct message count | Message count is 6 (1 from run + 5 from chat) |
| 62 | Create session via `agent run`, send `chat` message, delete session via API, verify `agent chat <id> "more"` returns 404 | Exit non-zero, 404 error |
| 63 | Send `chat` to a session in repo A while specifying `--repo` for repo B | Exit non-zero, 404 error (session not found in repo B) |
| 64 | Create session and send `chat` messages from two different authenticated users with write access | Both succeed, sequences are contiguous and unique |
| 65 | `agent chat` followed immediately by `agent session view --messages --json` shows the chat message in the messages array | Message present with correct role, content, and sequence |

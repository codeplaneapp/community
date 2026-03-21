# AGENT_CLI_VIEW

Specification for AGENT_CLI_VIEW.

## High-Level User POV

When you're working with Codeplane's agent sessions — whether you kicked off an automated issue-resolution flow, asked the agent a question from the CLI, or started a session from the web UI — you need a quick way to check on a session's status and see what happened in it, right from your terminal.

`codeplane agent session view` is how you do that. You give it a session ID, and it shows you everything important about that session at a glance: its title, current status, when it started and finished, how long it ran, how many messages were exchanged, and whether it's linked to a workflow run. If you want to dig deeper and read the full conversation transcript — the user prompts, the agent's responses, and the tool calls it made — you add the `--messages` flag and the entire exchange is printed below the session summary.

This command is the CLI equivalent of opening a session detail page in the web UI. It gives you the same information without leaving your terminal, and it works identically whether Codeplane is running as a remote server or a local daemon. It's also the natural next step after running `agent session list` — you spot the session you care about, copy its ID, and view it.

For automation and scripting, the command supports `--json` output, which returns the full session object (and optionally its messages) as structured JSON that can be piped into `jq`, stored, or consumed by other tools. This makes agent session inspection composable with other CLI workflows, dashboards, and notification scripts.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane agent session view <id>` displays a human-readable session summary to stdout and exits with code 0.
- [ ] `codeplane agent session view <id> --json` returns the session object as structured JSON to stdout and exits with code 0.
- [ ] `codeplane agent session view <id> --messages` appends the full message transcript below the session summary.
- [ ] `codeplane agent session view <id> --messages --json` returns a JSON object containing both the session and its messages array.
- [ ] A dedicated `formatAgentSessionView` function exists in `apps/cli/src/output.ts` and follows the same structural pattern as `formatIssueView`, `formatLandingView`, and `formatWikiView`.
- [ ] A dedicated `formatAgentMessageTranscript` function exists in `apps/cli/src/output.ts` for rendering the message list in human-readable form.
- [ ] The command resolves repository context via `--repo` option or automatic detection from the local working directory, consistent with all other CLI commands.
- [ ] All E2E CLI tests pass.
- [ ] All API-level integration tests pass.

### Input Validation and Edge Cases

- [ ] **Missing session ID**: If no `<id>` argument is provided, the CLI prints a usage error and exits with a non-zero code. The error message must indicate that a session ID is required.
- [ ] **Empty/whitespace-only session ID**: If the session ID is empty or only whitespace (e.g., `"  "`), the CLI exits with a non-zero code and prints a "session id is required" error.
- [ ] **Non-existent session ID**: If the API returns 404, the CLI prints "agent session not found" and exits with a non-zero code.
- [ ] **Malformed UUID session ID**: If the provided ID is not a valid UUID, the server returns 400 or 404, and the CLI prints a descriptive error and exits with a non-zero code.
- [ ] **Session belonging to a different repository**: If the session exists but belongs to a different repository than the resolved `--repo`, the API returns 404 and the CLI prints "agent session not found".
- [ ] **Unauthenticated request**: If no valid auth token or session cookie is present, the CLI prints "authentication required" and exits with a non-zero code.
- [ ] **Repository not found**: If the `--repo` value does not resolve to a valid repository, the CLI prints an appropriate repository-not-found error and exits with a non-zero code.

### Boundary Constraints

- [ ] **Session ID format**: Must be a valid UUID v4 string (36 characters including hyphens). The CLI does not perform client-side UUID validation — it passes the value to the API and surfaces the server's error response.
- [ ] **`--repo` format**: Must be `OWNER/REPO` when explicitly provided. Follows the same resolution rules as all other Codeplane CLI commands.
- [ ] **Message pagination with `--messages`**: When `--messages` is used, the CLI fetches all messages by paginating through the messages endpoint (page size 50, maximum per_page allowed by the server). The CLI continues fetching until all pages are retrieved or a hard cap of 500 messages is reached. If the cap is reached, a note is appended: `"(showing first 500 of N messages)"`.
- [ ] **Message transcript memory cap**: The rendered transcript must not exceed 500 messages in human-readable mode. In `--json` mode, the 500-message cap still applies.
- [ ] **Title display**: Session titles longer than 120 characters are displayed in full (no truncation) in the view command — truncation is only a concern in list views.
- [ ] **Timestamp display**: All timestamps are displayed in ISO-8601 format in the default human-readable output. The `--json` output preserves the original server timestamp format.
- [ ] **Duration calculation**: Duration is computed client-side from `started_at` and `finished_at` (or current time if `finished_at` is null and status is `active`). If `started_at` is null, duration is omitted.

### Status Display

- [ ] The session status must be displayed with a visual indicator:
  - `pending` → `◌ pending`
  - `active` → `● active`
  - `completed` → `✓ completed`
  - `failed` → `✗ failed`
  - `timed_out` → `⏱ timed_out`
- [ ] Unknown or future status values are displayed as-is without an indicator prefix, ensuring forward compatibility.

## Design

### CLI Command

**Invocation:**
```
codeplane agent session view <id> [--repo OWNER/REPO] [--messages] [--json]
```

**Also accessible via the flattened agent command path:**
```
codeplane agent view <id> [--repo OWNER/REPO] [--messages] [--json]
```

**Arguments:**

| Argument | Type   | Required | Description          |
|----------|--------|----------|----------------------|
| `id`     | string | Yes      | Agent session UUID   |

**Options:**

| Option       | Type    | Default | Description                                          |
|--------------|---------|---------|------------------------------------------------------|
| `--repo`     | string  | auto    | Repository in OWNER/REPO format                      |
| `--messages` | boolean | false   | Include full message transcript in output             |
| `--json`     | boolean | false   | Output structured JSON instead of human-readable text |

### API Shape

**Primary call (always):**
```
GET /api/repos/{owner}/{repo}/agent/sessions/{id}
```

**Secondary call (only when `--messages` is set):**
```
GET /api/repos/{owner}/{repo}/agent/sessions/{id}/messages?page={n}&per_page=50
```
Paginated until all messages are fetched or the 500-message cap is reached.

When both calls are needed, the session fetch fires first. If it fails, the messages call is skipped entirely. If the session fetch succeeds, the messages call begins paginating.

### Human-Readable Output Format

```
Session:  a1b2c3d4-e5f6-7890-abcd-ef1234567890
Title:    Fix authentication race condition
Status:   ✓ completed
Started:  2026-03-22T10:30:00Z
Finished: 2026-03-22T10:35:22Z
Duration: 5m 22s
Messages: 14
Workflow: Run #42
```

**Field rules:**

- `Session`: Always displayed. The full UUID.
- `Title`: Always displayed. Full text, no truncation.
- `Status`: Always displayed. Status string prefixed with visual indicator.
- `Started`: Displayed only if `started_at` is non-null.
- `Finished`: Displayed only if `finished_at` is non-null.
- `Duration`: Displayed only if `started_at` is non-null. Format: `Xh Ym Zs`, omitting zero leading units (e.g., `5m 22s`, `1h 0m 3s`, `45s`). If the session is still `active`, uses current time for the end bound and appends `(ongoing)`.
- `Messages`: Always displayed. Integer count.
- `Workflow`: Displayed only if `workflow_run_id` is non-null. Format: `Run #<id>`.

**With `--messages`:**

A blank line separator, then a `Messages:` header, then each message rendered as:

```

Messages:

[user] 2026-03-22T10:30:00Z
Fix the authentication race condition in the session middleware. The bug
is described in issue #42.

[assistant] 2026-03-22T10:30:05Z
I'll look into the session middleware to identify the race condition.
Let me start by examining the relevant code.

[tool_call] 2026-03-22T10:30:06Z
read_file({"path":"src/middleware/session.ts"})

[tool_result] 2026-03-22T10:30:06Z
(tool result, 2847 bytes)

[assistant] 2026-03-22T10:30:12Z
I found the issue. The session lookup and session creation are not
atomic...
```

**Message rendering rules:**

- Each message is preceded by a blank line (except the first).
- The header line is `[role] timestamp`.
- Text parts are rendered as their content value.
- `tool_call` parts are rendered as `function_name(args_summary)` on a single line. If the args JSON exceeds 200 characters when stringified, it is truncated to 200 characters with a trailing `…`.
- `tool_result` parts are rendered as `(tool result, N bytes)` showing the byte length of the content, not the full content (which can be very large).
- Multiple parts within one message are separated by a single newline.
- System messages are rendered identically to user/assistant messages with `[system]` role tag.

### JSON Output Format

**Without `--messages`:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Fix authentication race condition",
  "status": "completed",
  "started_at": "2026-03-22T10:30:00Z",
  "finished_at": "2026-03-22T10:35:22Z",
  "message_count": 14,
  "workflow_run_id": "run-uuid-here",
  "created_at": "2026-03-22T10:29:58Z",
  "updated_at": "2026-03-22T10:35:22Z"
}
```

This is the raw session object as returned by the API, passed through without transformation.

**With `--messages --json`:**
```json
{
  "session": { },
  "messages": [
    {
      "id": "msg-uuid",
      "session_id": "a1b2c3d4-...",
      "role": "user",
      "sequence": 1,
      "created_at": "2026-03-22T10:30:00Z",
      "parts": [
        { "part_type": "text", "content": { "value": "Fix the authentication..." } }
      ]
    }
  ]
}
```

When `--messages` is combined with `--json`, the output wraps both the session and the messages into a single top-level object. The `messages` array preserves the full part structure as returned by the API, with no summarization.

### SDK Shape

No new SDK service method is required. The CLI view command consumes the existing:

- `GET /api/repos/:owner/:repo/agent/sessions/:id` — session detail
- `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` — paginated message list

### Output Formatting Functions (in `apps/cli/src/output.ts`)

**`formatAgentSessionView(session: JsonRecord): string`**

Renders the session summary block. Follows the same line-building pattern as `formatIssueView` and `formatLandingView`. Uses the visual status indicators. Computes duration client-side.

**`formatAgentMessageTranscript(messages: JsonRecord[]): string`**

Renders the message transcript. Each message is rendered with role tag, timestamp, and part content according to the rendering rules above.

**`formatAgentSessionList(sessions: JsonRecord[]): string`**

*(For completeness — referenced by the `AGENT_CLI_LIST` feature but should be implemented alongside this feature to share helpers.)*

Table format with columns: ID (first 8 chars), Status, Title (truncated to 50 chars), Messages, Created.

### Error Output

All errors are printed to stderr. The exit code is non-zero for any error.

| Condition                      | stderr message                        | Exit code |
|--------------------------------|---------------------------------------|-----------|
| Missing session ID argument    | CLI usage error (from `incur`)        | 1         |
| Empty/whitespace session ID    | `Error: session id is required`       | 1         |
| Session not found (404)        | `Error: agent session not found`      | 1         |
| Authentication failure (401)   | `Error: authentication required`      | 1         |
| Repository not found (404)     | `Error: repository not found`         | 1         |
| Permission denied (403)        | `Error: permission denied`            | 1         |
| Server error (5xx)             | `Error: <server error detail>`        | 1         |
| Network failure                | `Error: <connection error message>`   | 1         |

### Documentation

The following end-user documentation should be written:

1. **CLI Reference entry** for `agent session view`: Synopsis, arguments, options table, description. Two example invocations: basic view and view with messages. Cross-reference to `agent session list` and `agent session run`.
2. **CLI Reference entry update** for `agent view` (flattened alias): Note that `agent view` is equivalent to `agent session view`.
3. **Agent Sessions guide section**: Add a "Viewing session details" subsection to the existing agent sessions documentation. Show the expected output format. Explain the `--messages` flag and when to use it. Explain the `--json` flag for scripting use cases.

## Permissions & Security

### Authorization

| Role       | Can view own sessions | Can view others' sessions | Can view messages |
|------------|----------------------|--------------------------|-------------------|
| Owner      | Yes                  | Yes (all repo sessions)  | Yes               |
| Admin      | Yes                  | Yes (all repo sessions)  | Yes               |
| Member     | Yes                  | Yes (all repo sessions)  | Yes               |
| Read-Only  | Yes (own only)       | No                       | Yes (own only)    |
| Anonymous  | No                   | No                       | No                |

- Authentication is required. Unauthenticated requests receive a 401 response.
- Repository read access is required. Users without access to the repository receive a 404 (not 403) to avoid leaking repository existence.
- Session visibility follows repository membership: any authenticated member of the repository can view any session in that repository. This is consistent with how issues, landing requests, and other repo-scoped resources work.
- Read-only collaborators can only see their own sessions to prevent leaking agent conversation content they shouldn't have access to.

### Rate Limiting

- The `GET /api/repos/:owner/:repo/agent/sessions/:id` endpoint is subject to the standard API rate limit (shared with all GET endpoints).
- The `GET /api/repos/:owner/:repo/agent/sessions/:id/messages` endpoint is subject to the same standard rate limit.
- When `--messages` triggers paginated fetching (multiple sequential API calls), each page counts as one rate-limited request. The CLI should respect `Retry-After` headers if rate-limited mid-pagination and surface the rate limit error to the user.
- No elevated or reduced rate limit is needed for this feature specifically.

### Data Privacy

- Agent session messages may contain sensitive content: code snippets, file contents, error messages, environment references, or tool call arguments that include paths/URLs.
- The `--json` output includes the full unredacted session and message content. This is intentional — the user has already been authenticated and authorized.
- CLI output is written to stdout and may be captured in shell history, log files, or piped to other processes. No additional redaction is applied by the CLI.
- Tool result content (which may contain file contents or command output) is intentionally summarized as `(tool result, N bytes)` in human-readable mode to avoid flooding the terminal with potentially sensitive bulk content. Users who need the full content should use `--json`.

## Telemetry & Product Analytics

### Business Events

| Event Name                     | Trigger                                                | Properties                                                                                                      |
|--------------------------------|--------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `AgentSessionViewed`           | Successful session view (HTTP 200 returned to CLI)     | `session_id`, `session_status`, `message_count`, `include_messages` (boolean), `output_format` ("text" or "json"), `client` ("cli"), `repo_owner`, `repo_name` |
| `AgentSessionViewFailed`       | Session view request failed (non-200 response)         | `error_code` (HTTP status), `error_message`, `client` ("cli"), `repo_owner`, `repo_name`                       |
| `AgentSessionTranscriptFetched`| Messages successfully fetched with `--messages` flag   | `session_id`, `message_count`, `pages_fetched`, `hit_cap` (boolean), `client` ("cli")                          |

### Funnel Metrics and Success Indicators

- **Session list → session view conversion rate**: Of users who run `agent session list`, what percentage subsequently run `agent session view` within the same CLI session? This measures discoverability and usefulness of the list→view flow.
- **View → chat conversion rate**: Of users who run `agent session view`, what percentage subsequently run `agent session chat` on the same session? This measures whether viewing a session drives continued interaction.
- **`--messages` adoption rate**: Percentage of `agent session view` invocations that include the `--messages` flag. High adoption suggests users find the transcript valuable; low adoption may indicate the summary is sufficient or that users prefer the web UI for transcripts.
- **`--json` adoption rate**: Percentage of invocations using `--json`. High adoption indicates scripting/automation use cases.
- **Error rate**: Percentage of `agent session view` invocations that result in a non-zero exit code. Sustained rates above 10% may indicate UX issues (e.g., users pasting wrong IDs from list output).

## Observability

### Logging

**Client-side (CLI):**

| Log Point                              | Level | Structured Context                                                  |
|----------------------------------------|-------|---------------------------------------------------------------------|
| Session view request initiated         | DEBUG | `session_id`, `repo_ref`, `include_messages`, `output_format`       |
| Session fetched successfully           | DEBUG | `session_id`, `status`, `message_count`, `latency_ms`              |
| Messages page fetched                  | DEBUG | `session_id`, `page`, `messages_in_page`, `latency_ms`             |
| Messages pagination complete           | DEBUG | `session_id`, `total_messages_fetched`, `pages_fetched`, `hit_cap` |
| Session not found                      | WARN  | `session_id`, `repo_ref`, `http_status`                            |
| Authentication failure                 | WARN  | `repo_ref`, `http_status`                                          |
| Rate limit hit during pagination       | WARN  | `session_id`, `page`, `retry_after_seconds`                        |
| Network error during fetch             | ERROR | `session_id`, `repo_ref`, `error_message`, `error_code`            |
| Server error (5xx) from API            | ERROR | `session_id`, `repo_ref`, `http_status`, `error_detail`            |

**Server-side (API route handler):**

| Log Point                              | Level | Structured Context                                                  |
|----------------------------------------|-------|---------------------------------------------------------------------|
| Agent session detail requested         | INFO  | `session_id`, `user_id`, `repo_id`, `request_id`                   |
| Agent session not found                | WARN  | `session_id`, `user_id`, `repo_id`, `request_id`                   |
| Agent messages list requested          | INFO  | `session_id`, `user_id`, `page`, `per_page`, `request_id`          |
| Service error during session fetch     | ERROR | `session_id`, `user_id`, `error_message`, `request_id`             |

### Prometheus Metrics

| Metric                                           | Type      | Labels                                        | Description                                                    |
|--------------------------------------------------|-----------|-----------------------------------------------|----------------------------------------------------------------|
| `codeplane_agent_session_view_total`             | Counter   | `status` (success/error), `output_format`     | Total agent session view requests from CLI                     |
| `codeplane_agent_session_view_duration_seconds`  | Histogram | `include_messages`                            | End-to-end latency of the view command (including msg fetch)   |
| `codeplane_api_agent_session_get_total`          | Counter   | `http_status`, `repo_owner`                   | Server-side counter for GET session detail endpoint            |
| `codeplane_api_agent_session_get_duration_seconds` | Histogram | —                                           | Server-side latency for GET session detail                     |
| `codeplane_api_agent_messages_list_total`        | Counter   | `http_status`                                 | Server-side counter for GET messages list endpoint             |
| `codeplane_api_agent_messages_list_duration_seconds` | Histogram | —                                         | Server-side latency for GET messages list                      |
| `codeplane_agent_session_view_messages_cap_hit_total` | Counter | —                                          | Number of times the 500-message cap was reached                |

### Alerts

#### Alert: `AgentSessionViewHighErrorRate`
- **Condition**: `rate(codeplane_agent_session_view_total{status="error"}[5m]) / rate(codeplane_agent_session_view_total[5m]) > 0.25` for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_api_agent_session_get_total` by `http_status` to identify which HTTP error codes dominate.
  2. If 404s dominate: Check if there's a deployment that changed session ID format or a data migration that deleted sessions. Review recent schema changes. This may be a client-side issue (users passing wrong IDs).
  3. If 401s dominate: Check auth service health and token expiry configuration. Verify no auth middleware regression.
  4. If 5xx dominate: Check API server logs filtered by `request_id` for stack traces. Check database connectivity and agent-related query performance. Escalate to on-call backend engineer.
  5. If network errors dominate: Check DNS resolution and TLS certificate validity for the API host. Verify load balancer health.

#### Alert: `AgentSessionViewHighLatency`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_agent_session_view_duration_seconds_bucket[5m])) > 5` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if `include_messages=true` requests are dominant — message pagination naturally adds latency.
  2. Check `codeplane_api_agent_session_get_duration_seconds` and `codeplane_api_agent_messages_list_duration_seconds` to identify which API call is slow.
  3. If session get is slow: Check database query plan for `getAgentSessionWithMessageCount`. Look for missing indexes on `agent_sessions(id)` or join performance with message count aggregation.
  4. If messages list is slow: Check database query plan for `listAgentMessages`. Look for missing indexes on `agent_messages(session_id, sequence)`. Check if a specific session has an unusually large number of messages/parts.
  5. Check overall database connection pool health and active query count.

#### Alert: `AgentSessionViewMessageCapFrequent`
- **Condition**: `rate(codeplane_agent_session_view_messages_cap_hit_total[1h]) > 5`.
- **Severity**: Info
- **Runbook**:
  1. This is informational — it means users are frequently viewing sessions with 500+ messages.
  2. Review whether the 500-message cap should be increased or whether a streaming/cursor-based approach should be prioritized.
  3. Check if a specific repo or user is generating unusually long agent sessions (may indicate a runaway agent loop).

### Error Cases and Failure Modes

| Error Case                                 | Detection                        | User Impact                                   | Mitigation                                      |
|--------------------------------------------|----------------------------------|-----------------------------------------------|--------------------------------------------------|
| API server unreachable                     | Network error / connection refused | CLI prints connection error, exits non-zero    | User retries; check server health                |
| Session deleted between list and view      | 404 response                     | CLI prints "not found", exits non-zero         | Expected race condition; user re-lists           |
| Rate limited mid-pagination                | 429 response                     | CLI prints rate limit error with retry hint    | User waits and retries                           |
| Extremely large message (near 100KB text)  | Slow rendering                   | CLI may be slow to print but completes         | Tool result summarization limits output volume   |
| Server returns malformed JSON              | JSON parse error                 | CLI prints parse error, exits non-zero         | Indicates server bug; escalate                   |
| Session exists but no messages yet         | Empty messages array             | `Messages: 0` displayed; `--messages` shows empty transcript | Expected for `pending` sessions      |

## Verification

### API Integration Tests

1. **`GET /api/repos/:owner/:repo/agent/sessions/:id` returns session detail with message count** — Create a session, post 3 messages, fetch session, assert response contains `id`, `title`, `status`, `message_count: 3`, `created_at`, `updated_at`.
2. **`GET /api/repos/:owner/:repo/agent/sessions/:id` returns 404 for nonexistent session** — Request a random UUID, assert 404 status and error body.
3. **`GET /api/repos/:owner/:repo/agent/sessions/:id` returns 404 for session in different repository** — Create session in repo A, attempt to fetch it via repo B's path, assert 404.
4. **`GET /api/repos/:owner/:repo/agent/sessions/:id` returns 401 for unauthenticated request** — Send request without auth header, assert 401.
5. **`GET /api/repos/:owner/:repo/agent/sessions/:id` returns 400 for empty session ID** — Send request with whitespace-only ID parameter, assert 400.
6. **`GET /api/repos/:owner/:repo/agent/sessions/:id` returns correct status for each session state** — Create sessions and move them through `pending`, `active`, `completed`, `failed`, `timed_out` states; verify each returns the correct status value.
7. **`GET /api/repos/:owner/:repo/agent/sessions/:id` includes `started_at` and `finished_at` when set** — Create a session, advance it to `active` (sets `started_at`), then `completed` (sets `finished_at`), verify both timestamps are present and valid ISO-8601.
8. **`GET /api/repos/:owner/:repo/agent/sessions/:id` returns null `started_at` for pending session** — Create a session (no messages), fetch it, assert `started_at` is null.
9. **`GET /api/repos/:owner/:repo/agent/sessions/:id` includes `workflow_run_id` when linked** — Create a session with a workflow run association, verify the field is present in the response.
10. **`GET /api/repos/:owner/:repo/agent/sessions/:id/messages` returns paginated messages in sequence order** — Create a session, post 5 messages, fetch page 1 with `per_page=2`, assert 2 messages returned with sequences 1 and 2.
11. **`GET /api/repos/:owner/:repo/agent/sessions/:id/messages` returns empty array for session with no messages** — Create a session, fetch messages, assert empty array.
12. **`GET /api/repos/:owner/:repo/agent/sessions/:id/messages` includes message parts** — Create a message with 2 parts (text + tool_call), fetch messages, assert parts array has 2 entries with correct `part_type` and `content`.
13. **`GET /api/repos/:owner/:repo/agent/sessions/:id/messages` respects `per_page` maximum of 50** — Request with `per_page=100`, assert response contains at most 50 messages.
14. **`GET /api/repos/:owner/:repo/agent/sessions/:id/messages` returns 404 for nonexistent session** — Request messages for a random UUID, assert 404.
15. **`GET /api/repos/:owner/:repo/agent/sessions/:id/messages` returns 401 for unauthenticated request** — Assert 401.

### CLI Integration Tests

16. **`codeplane agent session view <id> --json` returns valid JSON with session fields** — Create a session via `agent session run`, capture session ID, run view with `--json`, parse output, assert `id`, `title`, `status` fields exist.
17. **`codeplane agent session view <id>` returns human-readable output with session ID line** — Run view without `--json`, assert stdout contains `Session:` followed by the session UUID.
18. **`codeplane agent session view <id>` displays title** — Assert stdout contains `Title:` followed by the session title.
19. **`codeplane agent session view <id>` displays status with visual indicator** — Create a session (status `pending`), view it, assert stdout contains `◌ pending`.
20. **`codeplane agent session view <id>` displays message count** — Create a session, send 2 messages, view it, assert stdout contains `Messages:` with the appropriate count.
21. **`codeplane agent session view <id> --messages --json` includes messages array** — Create a session, send a message, view with `--messages --json`, parse output, assert top-level `session` and `messages` keys exist, `messages` is a non-empty array.
22. **`codeplane agent session view <id> --messages` includes message transcript in human-readable output** — Create a session, send a user message, view with `--messages`, assert stdout contains `[user]` and the message text.
23. **`codeplane agent session view <nonexistent-uuid>` exits with non-zero code** — Assert exit code is non-zero and stderr contains "not found".
24. **`codeplane agent session view <id> --repo WRONG/REPO` exits with non-zero code** — Assert exit code is non-zero when the session doesn't belong to the specified repo.
25. **`codeplane agent session view` without ID argument exits with non-zero code** — Assert exit code is non-zero and stderr contains usage or "required" text.
26. **`codeplane agent view <id> --json` works as alias** — Verify the flattened command path produces the same output as `agent session view`.
27. **`codeplane agent session view <id>` with session title of exactly 255 characters** — Create a session with a 255-character title, view it, assert the full title is displayed without truncation.
28. **`codeplane agent session view <id>` with session title of 1 character** — Create a session with a single-character title, view it, assert the title is displayed.
29. **`codeplane agent session view <id> --messages` with session containing zero messages** — Create a session (no messages posted), view with `--messages`, assert human-readable output shows `Messages: 0` and the transcript section is empty or absent.
30. **`codeplane agent session view <id> --messages --json` with empty messages** — Assert `messages` is an empty array `[]`.
31. **`codeplane agent session view <id>` displays duration for active sessions** — Create a session, advance to active, view it, assert `Duration:` line is present and contains `(ongoing)`.
32. **`codeplane agent session view <id>` displays duration for completed sessions** — Create and complete a session, view it, assert `Duration:` line is present and does not contain `(ongoing)`.
33. **`codeplane agent session view <id>` omits duration for pending sessions** — Create a pending session (no `started_at`), view it, assert `Duration:` line is absent.
34. **`codeplane agent session view <id>` omits Started line for pending sessions** — Assert `Started:` is not in stdout.
35. **`codeplane agent session view <id>` omits Finished line for active sessions** — Assert `Finished:` is not in stdout for an active session.
36. **`codeplane agent session view <id>` omits Workflow line when not linked** — Assert `Workflow:` is not in stdout when `workflow_run_id` is null.

### CLI Output Formatting Tests

37. **`formatAgentSessionView` renders all fields for a completed session** — Pass a mock session object with all fields populated, assert output contains Session, Title, Status, Started, Finished, Duration, Messages, Workflow lines.
38. **`formatAgentSessionView` omits optional fields when null** — Pass a session with null `started_at`, `finished_at`, `workflow_run_id`, assert those lines are absent.
39. **`formatAgentSessionView` renders each status indicator correctly** — Test all 5 known statuses (`pending`, `active`, `completed`, `failed`, `timed_out`) and verify the correct icon prefix.
40. **`formatAgentSessionView` handles unknown status gracefully** — Pass status `"unknown_future_status"`, assert it renders without icon and without error.
41. **`formatAgentSessionView` computes duration correctly** — Pass `started_at` and `finished_at` 3723 seconds apart, assert duration is `1h 2m 3s`.
42. **`formatAgentSessionView` computes duration for sub-minute sessions** — Pass a 45-second session, assert duration is `45s`.
43. **`formatAgentSessionView` computes duration for multi-hour sessions** — Pass a 2h 0m 0s session, assert duration is `2h 0m 0s`.
44. **`formatAgentMessageTranscript` renders user text message** — Pass a message with role `user` and text part, assert output contains `[user]` tag and text content.
45. **`formatAgentMessageTranscript` renders assistant text message** — Assert `[assistant]` tag and content.
46. **`formatAgentMessageTranscript` renders tool_call part with function name and args** — Pass a tool_call part with `{ name: "read_file", arguments: { path: "foo.ts" } }`, assert output contains `read_file({"path":"foo.ts"})`.
47. **`formatAgentMessageTranscript` truncates tool_call args exceeding 200 characters** — Pass tool_call with 300-character args JSON, assert output is truncated with `…`.
48. **`formatAgentMessageTranscript` summarizes tool_result part** — Pass a tool_result with 5000-byte content, assert output contains `(tool result, 5000 bytes)`.
49. **`formatAgentMessageTranscript` renders system messages** — Assert `[system]` tag appears.
50. **`formatAgentMessageTranscript` renders multiple parts within one message** — Pass a message with text + tool_call parts, assert both appear separated by a newline.
51. **`formatAgentMessageTranscript` handles empty messages array** — Pass empty array, assert empty string output.
52. **`formatAgentMessageTranscript` renders messages in sequence order** — Pass 3 messages with sequences 1, 2, 3, assert they appear in order.
53. **`formatAgentMessageTranscript` handles message with empty parts array** — Pass a message with `parts: []`, assert role header is rendered but no content body.

### E2E End-to-End Tests (Playwright — Web UI)

54. **Navigate to agent session detail page and verify metadata display** — Create a session via API, navigate to `/:owner/:repo/agents/sessions/:id`, assert session ID, title, status badge, message count, and timestamps are visible.
55. **Agent session detail page shows message transcript** — Create a session with messages via API, navigate to detail page, assert user and assistant messages are rendered with correct role badges.
56. **Agent session detail page shows tool call expansion** — Assert tool call messages have an expandable detail view showing function name and arguments.
57. **Agent session detail page handles session not found** — Navigate to a nonexistent session URL, assert a "session not found" or 404 message is displayed.

### E2E End-to-End Tests (CLI full flow)

58. **Full lifecycle: create session → send message → view session → view with messages** — Run `agent session run "test prompt"`, capture ID, run `agent session view <id> --json`, assert status and message count, run `agent session view <id> --messages --json`, assert messages array is non-empty.
59. **Full lifecycle: list sessions → view specific session** — Run `agent session list --json`, extract first session ID, run `agent session view <id> --json`, assert the session ID matches.
60. **View immediately after creation (pending state)** — Run session create, immediately view before any processing, assert status is `pending` or `active`.
61. **View with `--messages` flag on session with many messages** — Create a session, post 10 user messages, view with `--messages --json`, assert all messages are present in the output.
62. **JSON output is valid parseable JSON** — Run view with `--json`, pipe through `jq .`, assert exit code 0 from `jq`.
63. **JSON output with `--messages` is valid parseable JSON** — Run view with `--messages --json`, pipe through `jq .`, assert exit code 0.
64. **Human-readable output does not contain raw JSON** — Run view without `--json`, assert stdout does not start with `{` or `[`.
65. **Error output goes to stderr, not stdout** — Run view with nonexistent ID, assert stdout is empty and stderr contains the error.

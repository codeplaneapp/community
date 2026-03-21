# AGENT_CLI_RUN

Specification for AGENT_CLI_RUN.

## High-Level User POV

When a developer wants to kick off a task for a remote Codeplane agent, they use `codeplane agent session run` (or the shorthand `codeplane agent run`) from their terminal. This command creates a new agent session scoped to a repository and sends an initial prompt in a single step. It is the "fire" part of a fire-and-follow workflow: you tell the agent what to do, it starts working, and you get back a session identifier that lets you check on progress, view the conversation, or send follow-up messages later.

The typical workflow looks like this: a developer is working in a repository and has a task they want to hand off to a Codeplane agent — fixing a bug, writing tests, triaging an issue, or exploring a question about the codebase. Rather than switching to the web UI, they type something like `codeplane agent run "Write unit tests for the auth middleware"` directly from the terminal. The command creates a remote agent session on the Codeplane server, sends the prompt as the first user message, and immediately returns the session details — including the session ID, title, and status. From there, the developer can follow up with `codeplane agent session view <id>` to read the agent's response, `codeplane agent session chat <id> "..."` to continue the conversation, or check the session in the web UI or TUI's agent session replay view.

The `run` command is intentionally lightweight and non-blocking. It does not stream the agent's response back to the terminal (that responsibility belongs to the SSE streaming layer and the `view`/`chat` commands once streaming is fully wired). Instead, it confirms that the session was created and the prompt was dispatched, and returns structured output that works well in both human-readable and machine-readable (JSON/TOON) contexts. This makes `run` composable with other CLI commands and scriptable in automation pipelines — for example, a CI step could use `codeplane agent run` to dispatch a task and then poll the session status in a subsequent step.

The command defaults the session title to the first 60 characters of the prompt if no explicit title is provided, giving sessions a natural human-readable label without requiring extra input. It resolves the target repository from the current working directory, the `--repo` flag, or the `-R` alias, following the same conventions as all other Codeplane CLI commands.

## Acceptance Criteria

## Definition of Done

- [ ] `codeplane agent session run <prompt>` creates a new remote agent session and sends the prompt as the initial user message, returning the session object to stdout.
- [ ] `codeplane agent run <prompt>` works as a shorthand (the argument rewriting logic in `main.ts` does **not** intercept `run` as it is a reserved subcommand, and the `createRemoteSessionCommands` mixin attaches `run` to both the `session` and `agent` command groups).
- [ ] The command returns a structured session object containing at minimum: `id`, `title`, `status`, `createdAt`.
- [ ] The command exits with code 0 on success and non-zero on any failure.
- [ ] The `AGENT_CLI_RUN` feature flag in `specs/features.ts` accurately reflects the maturity of this command.

## Input Constraints

- [ ] `prompt` is a required positional argument of type `string`.
- [ ] `prompt` must be at least 1 character and at most 100,000 characters (100 KB). An empty string after trimming must produce a validation error with a clear message.
- [ ] `prompt` may contain any valid UTF-8 characters including newlines, special characters, quotes, and emoji.
- [ ] `--title` is an optional string flag. When provided, it must be between 1 and 255 characters. When omitted, it defaults to the first 60 characters of the prompt (truncated cleanly, no mid-codepoint breaks).
- [ ] `--repo` / `-R` is an optional string in `OWNER/REPO` format. When omitted, repo is resolved from the current working directory using the standard `resolveRepoRef` logic.
- [ ] If `--repo` is provided but malformed (missing slash, empty segments), the CLI must exit with a clear validation error before making any API calls.

## Behavioral Constraints

- [ ] The command performs exactly two API calls in sequence: one `POST` to create the session, one `POST` to append the initial user message.
- [ ] If the session creation call fails, no message creation call is attempted. The error from the session creation call is surfaced.
- [ ] If the session creation succeeds but the message append fails, the session still exists on the server. The error message must include the session ID so the user can clean up or retry with `chat`.
- [ ] The message is sent with `role: "user"` and a single part of `type: "text"` with `content` set to the prompt string.
- [ ] When the message is appended with `role: "user"`, the server dispatches an agent run for the session. This dispatch is fire-and-forget from the CLI's perspective.
- [ ] The command respects the `--format` global flag (`json`, `toon`, `yaml`, `md`, `jsonl`). Default output is the CLI's standard human-readable format.
- [ ] The command respects the `--filter-output` global flag for JSON field selection.
- [ ] Authentication is required. If no valid auth token is available, the command must exit with a clear error directing the user to `codeplane auth login`.

## Edge Cases

- [ ] Prompt consisting entirely of whitespace is rejected client-side with a validation error.
- [ ] Prompt containing only control characters (e.g., `\x00`, `\x01`) is sent as-is — the server is responsible for any sanitization.
- [ ] A `--title` longer than 255 characters is rejected client-side.
- [ ] A `--title` that is an empty string after trimming is rejected client-side.
- [ ] If the repository does not exist or the user lacks access, the API returns 404 and the CLI surfaces the error.
- [ ] If the user is not authenticated, the API returns 401 and the CLI surfaces the error.
- [ ] Network timeouts and connection errors produce a clear error message (not a raw stack trace).
- [ ] Running the command from a directory that is not inside a Codeplane-linked repository, without providing `--repo`, produces a clear error.
- [ ] Concurrent `run` calls against the same repository are allowed and produce independent sessions.
- [ ] Duplicate titles across sessions are allowed; titles are not unique identifiers.

## Design

## CLI Command

**Command path:** `codeplane agent session run <prompt>` or `codeplane agent run <prompt>`

**Synopsis:**
```
codeplane agent run <prompt> [--title <title>] [--repo <OWNER/REPO>] [--format <format>]
codeplane agent session run <prompt> [--title <title>] [--repo <OWNER/REPO>]
```

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prompt` | string | Yes | The prompt to send to the remote agent. |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--title` | string | First 60 chars of prompt | Human-readable session title. |
| `--repo`, `-R` | string | Auto-detected from cwd | Target repository in `OWNER/REPO` format. |
| `--format` | string | CLI default | Output format: `json`, `toon`, `yaml`, `md`, `jsonl`. |
| `--filter-output` | string | — | JSON path filter for structured output. |

**Example usage:**

```bash
# Basic run
codeplane agent run "Write integration tests for the billing service"

# With explicit title
codeplane agent run "Investigate flaky test in CI" --title "Flaky test investigation"

# Targeting a specific repo
codeplane agent run "Add input validation to the webhook handler" --repo myorg/myrepo

# JSON output for scripting
codeplane agent run "Fix lint errors" --format json

# Extract just the session ID
codeplane agent run "Triage open issues" --format json --filter-output ".id"

# Full path via session subcommand
codeplane agent session run "Refactor the auth middleware" --title "Auth refactor"
```

**Standard output (human-readable):**

```
Agent session created.

  ID:      a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Title:   Write integration tests for the billing service
  Status:  active
  Repo:    myorg/myrepo
  Created: 2026-03-22T10:30:00Z

Prompt dispatched. Use 'codeplane agent session view a1b2c3d4' to check progress.
```

**Structured output (JSON):**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Write integration tests for the billing service",
  "status": "active",
  "repositoryId": "repo-uuid",
  "userId": "user-uuid",
  "workflowRunId": null,
  "createdAt": "2026-03-22T10:30:00.000Z",
  "updatedAt": "2026-03-22T10:30:00.000Z",
  "startedAt": null,
  "finishedAt": null
}
```

**Error output examples:**

```
Error: Prompt cannot be empty.

Error: Repository not found. Specify --repo OWNER/REPO or run from inside a Codeplane-linked repository.

Error: Not authenticated. Run 'codeplane auth login' first.

Error: Session created (ID: a1b2c3d4) but message dispatch failed: 500 Internal Server Error.
       Use 'codeplane agent session chat a1b2c3d4 "your prompt"' to retry.
```

## API Shape

The `run` command uses two existing API endpoints in sequence:

**1. Create session:**
```
POST /api/repos/:owner/:repo/agent/sessions
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Write integration tests for the billing service"
}

Response 201:
{
  "id": "uuid",
  "title": "...",
  "status": "active",
  "repositoryId": "...",
  "userId": "...",
  "workflowRunId": null,
  "startedAt": null,
  "finishedAt": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

**2. Append initial message:**
```
POST /api/repos/:owner/:repo/agent/sessions/:id/messages
Content-Type: application/json
Authorization: Bearer <token>

{
  "role": "user",
  "parts": [
    {
      "type": "text",
      "content": "Write integration tests for the billing service"
    }
  ]
}

Response 201:
{
  "id": "msg-uuid",
  "sessionId": "session-uuid",
  "role": "user",
  "sequence": 0,
  "createdAt": "..."
}
```

The message append with `role: "user"` triggers the server-side `dispatchAgentRun` call, which starts the agent's execution.

## Argument Rewriting Behavior

The `rewriteAgentArgv` function in `main.ts` has `"run"` in its reserved set. This means:

- `codeplane agent run "prompt"` → recognized as `agent` + reserved subcommand `run` → argv passes through unchanged → dispatched to the `run` command on the `agent` command group (via the `createRemoteSessionCommands` mixin).
- `codeplane agent session run "prompt"` → `agent` + reserved subcommand `session` → passes through → `session` subcommand → `run` subcommand.

Both paths reach the same handler. No rewriting to `ask` occurs.

## TUI Integration

The TUI's agent session list screen reflects sessions created via `agent run`. No special TUI work is needed for `AGENT_CLI_RUN` itself — the TUI reads from the same `GET /api/repos/:owner/:repo/agent/sessions` endpoint. Sessions created by the CLI appear in the TUI session list with their title and status.

## Documentation

1. **CLI Reference — `agent run`**: Command synopsis, arguments, options, examples (basic, with title, with repo, JSON output, scripting). Include a note that this command is non-blocking and returns immediately after dispatching.
2. **CLI Reference — `agent session run`**: Cross-reference to `agent run` noting they are equivalent.
3. **Guide — "Working with Agent Sessions"**: A short guide covering the full lifecycle: `run` → `view` → `chat`, with examples showing how to create a session, check on it, and continue the conversation.
4. **Guide — "Scripting with Agent Sessions"**: Examples of using `--format json` and `--filter-output` to extract the session ID for use in scripts and CI pipelines.

## Permissions & Security

## Authorization

| Role | Can run `agent run`? | Notes |
|------|---------------------|-------|
| Owner | ✅ | Full access to agent sessions on owned repos. |
| Admin | ✅ | Full access to agent sessions on administered repos. |
| Member (Write) | ✅ | Can create and interact with own sessions. |
| Member (Read) | ❌ | Cannot create sessions. Receives 403. |
| Anonymous | ❌ | Must authenticate. Receives 401. |

- Sessions are scoped to the authenticated user. A user can only create sessions under their own identity.
- Sessions are scoped to a repository. The user must have at minimum write access to the repository to create agent sessions.
- PAT-based auth must include agent session scopes (if scoped tokens are implemented).

## Rate Limiting

| Scope | Limit | Window | Notes |
|-------|-------|--------|-------|
| Session creation | 30 sessions | per user per hour | Prevents runaway session creation. |
| Message append | 120 messages | per user per hour | Prevents flooding a session. |
| Per-repository | 100 sessions | per repo per hour | Prevents abuse of shared repos. |

Rate limit responses must include `Retry-After` header and return HTTP 429 with a clear message.

## Data Privacy

- Prompts may contain PII, code, secrets, or sensitive business context. Prompts must be stored encrypted at rest alongside all other agent message content.
- Session titles derived from prompts (first 60 chars) may also contain sensitive content. They must receive the same at-rest encryption treatment.
- Agent session data must be included in any user data export or deletion (GDPR right to erasure) flows.
- Session content must not be logged at INFO level. Only session IDs, user IDs, and repository IDs may appear in standard logs.
- The CLI must not echo the full prompt in error messages sent to external telemetry systems.

## Telemetry & Product Analytics

## Business Events

| Event | When Fired | Properties |
|-------|------------|------------|
| `AgentSessionCreated` | Session creation API returns 201 | `sessionId`, `repositoryId`, `userId`, `source: "cli"`, `titleLength`, `promptLength`, `hasExplicitTitle: boolean`, `repoResolutionMethod: "flag" \| "cwd"` |
| `AgentSessionRunDispatched` | Message append with `role: "user"` returns 201 after session creation | `sessionId`, `repositoryId`, `userId`, `messageId`, `promptLength`, `source: "cli"` |
| `AgentSessionRunFailed` | Either API call fails | `sessionId` (if created), `repositoryId`, `userId`, `errorType: "session_creation" \| "message_dispatch"`, `httpStatus`, `source: "cli"` |
| `AgentSessionRunValidationFailed` | Client-side validation rejects input | `reason: "empty_prompt" \| "prompt_too_long" \| "title_too_long" \| "invalid_repo" \| "no_auth"`, `source: "cli"` |

## Funnel Metrics

1. **Session creation rate**: How many `agent run` commands are executed per day/week.
2. **Run-to-view conversion**: % of sessions created via `run` that are subsequently viewed via `view` or the web UI within 1 hour.
3. **Run-to-chat conversion**: % of sessions created via `run` that receive a follow-up `chat` message.
4. **Error rate**: % of `agent run` invocations that fail (split by session creation failure vs. message dispatch failure).
5. **Prompt length distribution**: P50/P90/P99 prompt lengths, informing whether the 100K limit is appropriate.
6. **Title override rate**: % of runs using explicit `--title` vs. auto-derived title.

## Success Indicators

- A healthy feature shows >80% run-to-view conversion (users are checking agent results).
- Error rate below 2% under normal operating conditions.
- Increasing weekly session creation rate indicates adoption.
- Run-to-chat conversion >30% indicates users find multi-turn valuable.

## Observability

## Logging

| Log Event | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Session creation request | INFO | `userId`, `repositoryId`, `source: "cli"`, `titleLength` | Never log the title content. |
| Session created | INFO | `sessionId`, `userId`, `repositoryId`, `status` | |
| Message appended | INFO | `sessionId`, `messageId`, `role`, `partCount`, `promptLength` | Never log prompt content. |
| Agent run dispatched | INFO | `sessionId`, `userId`, `repositoryId`, `triggerMessageId` | |
| Session creation failed | WARN | `userId`, `repositoryId`, `httpStatus`, `errorCode` | |
| Message append failed | WARN | `sessionId`, `userId`, `httpStatus`, `errorCode` | |
| Validation rejected | DEBUG | `reason`, `field` | CLI-side only. |
| Rate limit hit | WARN | `userId`, `repositoryId`, `endpoint`, `retryAfter` | |

## Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_agent_sessions_created_total` | Counter | `source` (`cli`, `web`, `tui`, `api`), `repository` | Total sessions created. |
| `codeplane_agent_session_create_duration_seconds` | Histogram | `source`, `status` (`success`, `error`) | Latency of session creation API call. |
| `codeplane_agent_messages_appended_total` | Counter | `source`, `role`, `repository` | Total messages appended. |
| `codeplane_agent_message_append_duration_seconds` | Histogram | `source`, `status` | Latency of message append API call. |
| `codeplane_agent_run_dispatches_total` | Counter | `repository` | Total agent run dispatches triggered. |
| `codeplane_agent_run_dispatch_errors_total` | Counter | `repository`, `error_type` | Failed dispatches. |
| `codeplane_agent_session_prompt_length_bytes` | Histogram | `source` | Distribution of prompt sizes in bytes. |
| `codeplane_agent_cli_run_errors_total` | Counter | `error_stage` (`validation`, `session_create`, `message_append`, `network`) | CLI-side error breakdown. |
| `codeplane_agent_active_sessions` | Gauge | `repository` | Currently active agent sessions. |

## Alerts

### Alert 1: High Agent Session Creation Error Rate
- **Condition:** `rate(codeplane_agent_cli_run_errors_total{error_stage="session_create"}[5m]) / rate(codeplane_agent_sessions_created_total{source="cli"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_agent_session_create_duration_seconds` for latency spikes — if P99 > 5s, the database may be under load.
  2. Check database connection pool metrics. If saturated, investigate concurrent load sources.
  3. Check for recent deployments that may have broken the session creation route.
  4. Review server logs for `session creation failed` entries filtered by the last 10 minutes. Look for consistent error codes (e.g., 500 = server bug, 503 = capacity).
  5. If 429 errors dominate, check whether rate limits are too aggressive for current usage patterns.

### Alert 2: Agent Run Dispatch Failures
- **Condition:** `rate(codeplane_agent_run_dispatch_errors_total[5m]) > 5`
- **Severity:** Critical
- **Runbook:**
  1. The dispatch step runs after message append. Check if the agent execution backend is healthy.
  2. Check for workspace provisioning failures if the agent backend uses workspace sandboxes.
  3. Review the `dispatchAgentRun` service logs for errors. Look for missing repository context, permission denials, or infrastructure failures.
  4. If the dispatch is async (fire-and-forget from the route handler), check the agent worker queue for backlogs.
  5. Verify the SSE/NOTIFY pipeline is operational — dispatch relies on `notifyAgentMessage` to signal downstream consumers.

### Alert 3: Elevated CLI Validation Failures
- **Condition:** `rate(codeplane_agent_cli_run_errors_total{error_stage="validation"}[1h]) > 50`
- **Severity:** Info
- **Runbook:**
  1. This indicates users are hitting validation boundaries frequently.
  2. Check the `reason` label distribution: if `prompt_too_long` dominates, consider whether the 100K limit should be increased.
  3. If `empty_prompt` dominates, check for broken automation scripts sending empty payloads.
  4. Review CLI version distribution — old CLI versions may not enforce client-side validation, causing server-side rejections.

### Alert 4: Agent Session Creation Latency Degradation
- **Condition:** `histogram_quantile(0.99, rate(codeplane_agent_session_create_duration_seconds_bucket[5m])) > 3`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency for `CreateAgentSession` queries.
  2. Check if `agent_sessions` table needs vacuuming or index maintenance.
  3. Check overall database CPU/memory/IO metrics.
  4. If latency correlates with high `codeplane_agent_active_sessions` gauge, the table may need partitioning or cleanup of stale sessions.

## Error Cases and Failure Modes

| Failure Mode | HTTP Status | CLI Behavior | Recovery |
|---|---|---|---|
| User not authenticated | 401 | Exit 1, print auth instructions | `codeplane auth login` |
| Repository not found | 404 | Exit 1, print repo resolution help | Verify `--repo` or cwd |
| Insufficient permissions | 403 | Exit 1, print permission error | Request write access |
| Rate limit exceeded | 429 | Exit 1, print retry-after time | Wait and retry |
| Session creation server error | 500 | Exit 1, print error details | Retry or file issue |
| Message append server error | 500 | Exit 1, print session ID + retry instructions | `codeplane agent session chat <id>` |
| Network timeout | — | Exit 1, print timeout message | Check connectivity |
| DNS resolution failure | — | Exit 1, print host unreachable | Check server URL config |
| Prompt too long | — (client-side) | Exit 1, print max length message | Shorten prompt |
| Empty prompt | — (client-side) | Exit 1, print non-empty requirement | Provide a prompt |
| Invalid repo format | — (client-side) | Exit 1, print expected format | Use `OWNER/REPO` |
| Server unreachable | — | Exit 1, print connection refused | Check server status |

## Verification

## API Integration Tests

| # | Test | Expected |
|---|------|----------|
| 1 | `POST /agent/sessions` with valid title creates session | 201, returns session with `id`, `title`, `status: "active"`, `createdAt` |
| 2 | `POST /agent/sessions` without auth returns 401 | 401 Unauthorized |
| 3 | `POST /agent/sessions` on non-existent repo returns 404 | 404 Not Found |
| 4 | `POST /agent/sessions` by read-only user returns 403 | 403 Forbidden |
| 5 | `POST /agent/sessions` with title of exactly 255 characters succeeds | 201 |
| 6 | `POST /agent/sessions` with title of 256 characters returns 400 | 400 Bad Request with validation message |
| 7 | `POST /agent/sessions` with empty title returns 400 | 400 Bad Request |
| 8 | `POST /agent/sessions/:id/messages` with valid user message returns 201 | 201, returns message with `id`, `role: "user"`, `sequence: 0` |
| 9 | `POST /agent/sessions/:id/messages` with text part containing 100,000 characters succeeds | 201 |
| 10 | `POST /agent/sessions/:id/messages` with text part containing 100,001 characters returns 400 | 400 Bad Request |
| 11 | `POST /agent/sessions/:id/messages` on non-existent session returns 404 | 404 |
| 12 | `POST /agent/sessions/:id/messages` with invalid role returns 400 | 400 with validation error |
| 13 | `POST /agent/sessions/:id/messages` with invalid part type returns 400 | 400 |
| 14 | `POST /agent/sessions/:id/messages` with empty parts array returns 400 | 400 |
| 15 | `POST /agent/sessions/:id/messages` with bare string content is normalized to `{ value: string }` | 201, content stored as object |
| 16 | Sequential message appends produce incrementing sequence numbers | Sequences 0, 1, 2, ... |
| 17 | Concurrent message appends to the same session produce unique sequence numbers (no gaps, no duplicates) | All sequences unique and contiguous |
| 18 | Message with `role: "user"` triggers `dispatchAgentRun` | Dispatch is called with correct session/user/repo IDs |
| 19 | Message with `role: "assistant"` does NOT trigger `dispatchAgentRun` | No dispatch |
| 20 | Created session appears in `GET /agent/sessions` list | Session present in paginated results |
| 21 | Rate limit returns 429 after exceeding threshold | 429 with `Retry-After` header |
| 22 | Prompt containing emoji, newlines, and special characters round-trips correctly | Content matches on retrieval |
| 23 | Prompt containing null bytes (`\x00`) is handled without crashing | Either accepted or rejected with 400 (not 500) |

## CLI Integration Tests

| # | Test | Expected |
|---|------|----------|
| 24 | `codeplane agent run "hello"` creates session and returns session object | Exit 0, output contains session ID |
| 25 | `codeplane agent session run "hello"` produces identical behavior | Exit 0, same output structure |
| 26 | `codeplane agent run "hello" --title "My Session"` uses explicit title | Session title is "My Session" |
| 27 | `codeplane agent run "hello" --repo owner/repo` targets specified repo | Session created in owner/repo |
| 28 | `codeplane agent run "hello" -R owner/repo` works with alias | Same as --repo |
| 29 | `codeplane agent run "hello" --format json` outputs valid JSON | Exit 0, parseable JSON with correct fields |
| 30 | `codeplane agent run "hello" --format json --filter-output ".id"` returns only the ID | Exit 0, output is just the session ID string |
| 31 | `codeplane agent run ""` (empty prompt) fails with validation error | Exit non-zero, error message mentions empty prompt |
| 32 | `codeplane agent run "  "` (whitespace-only prompt) fails with validation error | Exit non-zero |
| 33 | `codeplane agent run` without prompt argument fails with usage error | Exit non-zero, shows usage |
| 34 | `codeplane agent run "hello" --title ""` (empty title) fails with validation error | Exit non-zero |
| 35 | `codeplane agent run "hello" --repo "invalid"` (no slash) fails with validation error | Exit non-zero |
| 36 | `codeplane agent run "hello" --repo "/repo"` (empty owner) fails | Exit non-zero |
| 37 | `codeplane agent run "hello" --repo "owner/"` (empty repo) fails | Exit non-zero |
| 38 | `codeplane agent run "hello"` without auth token fails with auth error | Exit non-zero, mentions `codeplane auth login` |
| 39 | Title auto-derivation truncates at 60 characters | Session title is exactly first 60 chars |
| 40 | Title auto-derivation with prompt shorter than 60 chars uses full prompt | Title equals prompt |
| 41 | Title auto-derivation with multi-byte UTF-8 does not break mid-codepoint | Title is valid UTF-8 |
| 42 | Prompt of exactly 100,000 characters succeeds | Exit 0 |
| 43 | Prompt of 100,001 characters fails with size error | Exit non-zero |
| 44 | `codeplane agent run "hello" --format toon` outputs valid TOON | Exit 0, parseable TOON |
| 45 | `codeplane agent run "hello" --format yaml` outputs valid YAML | Exit 0, parseable YAML |
| 46 | Session created by `run` is visible via `codeplane agent session list` | Session appears in list output |
| 47 | Session created by `run` is viewable via `codeplane agent session view <id>` | Session details match |
| 48 | Multiple concurrent `run` calls create independent sessions | All sessions have unique IDs |
| 49 | `codeplane agent run "prompt with 'quotes' and \"double quotes\""` handles shell quoting | Session created with correct prompt content |
| 50 | `codeplane agent run "prompt\nwith\nnewlines"` preserves newlines | Message content contains newlines |

## End-to-End Playwright Tests (Web UI Verification)

| # | Test | Expected |
|---|------|----------|
| 51 | Create session via CLI `agent run`, verify it appears in web UI agent session list | Session row visible with correct title and "active" status |
| 52 | Create session via CLI `agent run`, verify the initial user message is visible in session replay view | Message with prompt text displayed |
| 53 | Create session via CLI with explicit title, verify title displays correctly in web UI | Title matches `--title` flag value |

## End-to-End Workflow Tests

| # | Test | Expected |
|---|------|----------|
| 54 | Full lifecycle: `agent run` → `agent session view` → `agent session chat` → `agent session view` | All commands succeed, message count increases |
| 55 | `agent run` followed by `agent session list --format json` includes the new session | JSON array contains session with matching ID |
| 56 | `agent run` with `--format json` output is pipe-able: `codeplane agent run "x" --format json | jq .id` extracts ID | Valid UUID output |
| 57 | Create session via `agent run`, delete via API, verify `agent session view <id>` returns 404 | Exit non-zero, 404 error |
| 58 | Run `agent run` against two different repos, verify sessions are scoped correctly | Each session appears only in its repo's list |

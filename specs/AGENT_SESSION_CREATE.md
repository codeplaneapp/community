# AGENT_SESSION_CREATE

Specification for AGENT_SESSION_CREATE.

## High-Level User POV

An agent session is how a user begins an AI-assisted conversation scoped to a specific repository in Codeplane. When a user has a question, a task to delegate, or a problem to explore within a repository, they create an agent session — a named conversation space — and immediately start talking to the agent.

Creating an agent session is intentionally lightweight. The user provides only a session title — a short description like "Fix auth timeout in login flow" or "Investigate CI flake in build step 3" — and Codeplane creates the session and opens the chat interface. There is no multi-step wizard, no configuration form, and no required settings. The goal is to make the path from "I want help" to "I am talking to the agent" as short as possible.

Agent sessions are always tied to a repository. This scoping gives the agent repository context — it knows which codebase, which issues, which bookmarks, and which changes are relevant. Users can have multiple concurrent sessions per repository, each focused on a different task. Sessions are identified by a unique ID, so duplicate titles are perfectly acceptable.

The feature is accessible from every major Codeplane surface. In the web UI and TUI, the user navigates to the agent session list for a repository and creates a new session with a single text input. In the CLI, the user runs a command that creates the session and optionally posts the first message in one step. In the TUI specifically, the user can press a single key from the session list to open an inline title input, type a name, and land directly in the chat. The command palette provides an alternative creation path for users who prefer modal workflows.

Once created, the session appears in the session list with a "pending" status and zero messages. The user is immediately routed to the chat interface where they can type their first message. From that point, the conversation proceeds as a sequence of messages between the user and the agent.

If something goes wrong during creation — a network issue, a permissions problem, or a rate limit — the user sees a clear, actionable error message. The title they typed is preserved so they can retry without starting over.

## Acceptance Criteria

### Definition of Done

- An authenticated user with write access to a repository can create a new agent session by providing a title.
- The newly created session is immediately visible in the session list and accessible by its unique ID.
- After creation, the user is navigated to the chat interface for the new session.
- All clients (API, CLI, TUI, web) converge on the same creation contract.
- All error cases are handled gracefully with user-facing messages and retry affordances.
- The feature is covered by comprehensive integration and end-to-end tests.

### Input Constraints

- **Title**: Required. Must be a non-empty string after trimming whitespace.
- **Title minimum length**: 1 character (after trimming).
- **Title maximum length**: 255 characters. Inputs exceeding 255 characters must be rejected or truncated at the input boundary.
- **Title character set**: Any valid UTF-8 string including Unicode, emoji, and special characters. No character restrictions beyond length.
- **Title uniqueness**: Not required. Duplicate titles within the same repository are allowed. Sessions are identified by UUID.
- **Whitespace-only titles**: Rejected. A title consisting entirely of spaces, tabs, or newlines is treated as empty and must not be accepted.

### Behavioral Constraints

- [ ] Session creation requires a valid repository context (owner + repo name).
- [ ] Session creation requires authentication (valid session cookie or PAT).
- [ ] Session creation requires write access to the repository.
- [ ] The created session has initial status `"pending"`.
- [ ] The created session has `started_at` and `finished_at` as `null`.
- [ ] The created session has a server-generated UUID `id`.
- [ ] The created session has `workflow_run_id` as `null`.
- [ ] The response includes all session fields: `id`, `repositoryId`, `userId`, `workflowRunId`, `title`, `status`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt`.
- [ ] Timestamps (`createdAt`, `updatedAt`) are server-generated ISO-8601 values.
- [ ] Empty request body returns 400.
- [ ] Request body with missing `title` field returns 400.
- [ ] Request body with non-JSON content returns 400.
- [ ] Unauthenticated request returns 401.
- [ ] Authenticated user without write access returns 403.
- [ ] Rate-limited request returns 429 with a `Retry-After` header.
- [ ] Server error returns 500 with a structured error payload.
- [ ] Double-submit prevention: concurrent identical requests should each create separate sessions (idempotency is not required).
- [ ] After successful creation, the session is returned in subsequent list queries for the same repository.
- [ ] Title is stored exactly as submitted (after server-side trim), including Unicode and special characters.

### Edge Cases

- [ ] Title at exactly 255 characters: accepted and created successfully.
- [ ] Title at 256 characters: rejected with 400 or truncated client-side before submission.
- [ ] Title containing only emoji: accepted.
- [ ] Title containing newline characters: server trims and accepts if non-empty result remains.
- [ ] Title containing HTML/script tags: stored as literal text, not interpreted.
- [ ] Title containing null bytes: rejected with 400.
- [ ] Concurrent session creation for the same repo by the same user: both succeed.
- [ ] Session creation for a non-existent repository: returns 404.
- [ ] Session creation for an archived repository: returns 403 or appropriate error.
- [ ] Request with extra unknown fields in the body: ignored (extra fields do not cause errors).

## Design

### API Shape

**Endpoint**: `POST /api/repos/:owner/:repo/agent/sessions`

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner (user or org name) |
| `repo` | string | Repository name |

**Request Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `Authorization` | Yes | `token <PAT>` or session cookie |

**Request Body**:
```json
{
  "title": "Fix auth timeout in login flow"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `title` | string | Yes | 1–255 characters after trim, non-empty |

**Success Response**: `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "repositoryId": "123",
  "userId": "456",
  "workflowRunId": null,
  "title": "Fix auth timeout in login flow",
  "status": "pending",
  "startedAt": null,
  "finishedAt": null,
  "createdAt": "2026-03-22T10:30:00.000Z",
  "updatedAt": "2026-03-22T10:30:00.000Z"
}
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid/missing body or title | `{ "message": "invalid request body" }` or `{ "message": "title is required" }` |
| 401 | No/invalid authentication | `{ "message": "authentication required" }` |
| 403 | No write access to repo | `{ "message": "forbidden" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| 500 | Server error | `{ "message": "internal server error" }` |

### SDK Shape

**Hook**: `useCreateAgentSession(owner: string, repo: string)`

Returns:
```typescript
{
  mutate: (input: { title: string }) => Promise<AgentSession>;
  isLoading: boolean;
  error: HookError | null;
}
```

- `mutate` trims the title client-side before submission.
- `mutate` validates that the trimmed title is non-empty before making the API call.
- On success, returns the full `AgentSession` object.
- On failure, throws an `ApiError` with `code`, `message`, and optionally `headers`.

### CLI Command

**Create via `session run`** (creates session + posts first message):
```
codeplane agent session run <prompt> [--title "session title"] [--repo OWNER/REPO]
```

- If `--title` is omitted, the title defaults to the first 60 characters of the prompt.
- Creates the session via `POST /api/repos/:owner/:repo/agent/sessions`.
- Posts the prompt as a user message via `POST /api/repos/:owner/:repo/agent/sessions/:id/messages`.
- Returns the created session object as JSON.
- Exit code 0 on success, 1 on error with error message on stderr.

### TUI UI

**Inline Creation Mode** (primary flow):

1. User presses `n` from the Agent Session List screen.
2. An inline text input appears between the toolbar and session list rows, bordered in primary color.
3. Session list rows dim to 50% opacity.
4. All list navigation keys (`j`, `k`, `G`, `gg`, `/`, `d`, `f`) are intercepted by the input.
5. Placeholder: "Session title…" in muted text.
6. User types title and presses `Enter`.
7. Input text changes to "Creating…" in muted italic. Input is disabled.
8. On success, TUI navigates to Agent Chat screen with chat input pre-focused.
9. On failure, red error message below input; title preserved for retry.
10. `Esc` cancels and returns focus to session list.

Inline layout (120×40):
```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Agent Sessions             │
├──────────────────────────────────────────────────────────────┤
│ Agent Sessions (12)                              / search    │
│ Filter: All │ Active │ Completed │ Failed                    │
├──────────────────────────────────────────────────────────────┤
│ ┌─ New Session ──────────────────────────────────────────┐   │
│ │ Fix auth timeout in login flow█                        │   │
│ └────────────────────────────────────────────────────────┘   │
│ ░ Fix authentication bug in login flow       12 msg      3m  │
│ ░ Refactor database queries for perf          8 msg      1h  │
├──────────────────────────────────────────────────────────────┤
│ Status: Enter:create  Esc:cancel                    ?:help   │
└──────────────────────────────────────────────────────────────┘
```

**Modal Creation Mode** (via command palette):

1. User opens command palette (`:`) and selects "New Agent Session".
2. Centered modal overlay: title, text input, Create/Cancel buttons.
3. Focus trapped: `Tab` cycles Input → Create → Cancel.
4. `Enter`/`Ctrl+S` submits. `Esc` or Cancel dismisses.
5. On success, navigates to chat screen.

Modal layout (120×40):
```
┌─── New Agent Session ──────────────────────────┐
│                                                │
│  Title:                                        │
│  ┌────────────────────────────────────────────┐│
│  │ Session title…                             ││
│  └────────────────────────────────────────────┘│
│                                                │
│    [ Create ]    [ Cancel ]                     │
└────────────────────────────────────────────────┘
```

**Responsive behavior**:
| Breakpoint | Inline Padding | Modal Width | Modal Height |
|-----------|---------------|-------------|-------------|
| 80×24 min | 2ch/side | 90% terminal | 7 rows |
| 120×40 std | 4ch/side | 60% terminal | 9 rows |
| 200×60+ lg | 8ch/side | 50% terminal | 11 rows |

**Keybindings**:
| Key | Inline Mode | Modal Mode |
|-----|-------------|------------|
| `Enter` | Submit (non-empty) | Submit/dismiss (context-dependent) |
| `Esc` | Cancel | Dismiss |
| `Ctrl+S` | — | Submit from any element |
| `Tab` | — | Cycle focus forward |
| `Shift+Tab` | — | Cycle focus backward |
| Standard text editing | `Backspace`, `Delete`, `Left`, `Right`, `Home`/`Ctrl+A`, `End`/`Ctrl+E`, `Ctrl+K`, `Ctrl+U` | Same |

### Web UI Design

The web UI agent session creation is part of the Agent Sessions view at `/:owner/:repo/agents`. A "New Session" button in the toolbar opens a create dialog with a single title input. On success, navigates to `/:owner/:repo/agents/:sessionId`.

### Documentation

1. **Agent Sessions guide**: What sessions are, how they relate to repos, and the workflow of create → chat → review.
2. **CLI reference for `codeplane agent session run`**: Syntax, flags, `--title` default behavior, example output.
3. **CLI reference for `codeplane agent session list`**: Listing and pagination.
4. **TUI keybinding reference**: `n` for new session, `Enter` to submit, `Esc` to cancel.
5. **API reference for `POST /api/repos/:owner/:repo/agent/sessions`**: Request/response shapes, status codes, error formats.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Read-Only) | Authenticated (Write) | Admin | Owner |
|--------|-----------|---------------------------|----------------------|-------|-------|
| Create agent session | ❌ 401 | ❌ 403 | ✅ 201 | ✅ 201 | ✅ 201 |
| See "New Session" UI affordance | ❌ | ❌ | ✅ | ✅ | ✅ |

- **Authentication**: Enforced server-side. Missing or invalid credentials return 401.
- **Authorization**: Write access to the repository is required. Read-only collaborators receive 403.
- **Repository scope**: Sessions can only be created for repositories the user has access to. Cross-repository session creation is not possible.
- **Org/team permissions**: Organization-level write access grants session creation. Team-level read-only restrictions are respected.

### Rate Limiting

- **Endpoint rate limit**: 60 requests per minute per authenticated user for `POST /api/repos/:owner/:repo/agent/sessions`.
- **429 response** includes `Retry-After` header with seconds until the limit resets.
- **No auto-retry**: Clients show the rate limit message and let the user retry manually.
- **Burst allowance**: Up to 10 requests in a 1-second burst window within the per-minute limit.
- Rapid `Enter` presses during rate limit cooldown are no-ops (double-submit prevention handles this).

### Data Privacy

- **Session titles**: May contain repository-specific context (file names, function names, issue references). These are scoped to the repository and visible only to users with repository access.
- **PII**: No additional PII is collected beyond the user's existing identity. Titles should not be logged at levels above `debug`.
- **Token handling**: Auth tokens are never included in error messages, client-side logs, or telemetry payloads.
- **Audit trail**: Session creation is associated with the creating user's ID, providing accountability.

### Token-based Auth

- Token loaded from CLI keychain (stored by `codeplane auth login`) or `CODEPLANE_TOKEN` environment variable.
- Passed as `Authorization: token <token>` on the POST request.
- Token is never displayed, logged, or included in error messages.
- No interactive login flow in the TUI; auth failures require CLI re-authentication.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `agent.session.created` | Successful session creation (server-side) | `session_id`, `repository_id`, `user_id`, `title_length`, `client_type` ("api" \| "cli" \| "tui" \| "web"), `response_time_ms` |
| `agent.session.create_failed` | Failed creation attempt (server-side) | `repository_id`, `user_id`, `error_code` (400/403/429/500), `error_type`, `client_type` |
| `tui.agents.create.opened` | TUI create input/modal shown | `entry_point` ("keybinding" \| "command_palette"), `mode` ("inline" \| "modal"), `terminal_width`, `terminal_height`, `breakpoint`, `repo_owner`, `repo_name` |
| `tui.agents.create.submitted` | TUI user presses Enter to create | `title_length`, `mode`, `entry_point`, `input_time_ms`, `repo_owner`, `repo_name` |
| `tui.agents.create.succeeded` | TUI receives 201 | `session_id`, `title_length`, `mode`, `entry_point`, `round_trip_ms`, `repo_owner`, `repo_name` |
| `tui.agents.create.failed` | TUI receives error | `error_type` ("auth" \| "permission" \| "rate_limit" \| "validation" \| "server" \| "network"), `http_status`, `mode`, `entry_point`, `title_length`, `repo_owner`, `repo_name` |
| `tui.agents.create.cancelled` | TUI user presses Esc | `had_title` (boolean), `title_length`, `mode`, `entry_point`, `input_time_ms`, `repo_owner`, `repo_name` |
| `tui.agents.create.retried` | TUI user retries after failure | `previous_error_type`, `retry_success`, `retry_round_trip_ms`, `repo_owner`, `repo_name` |
| `tui.agents.create.validation_rejected` | TUI Enter on empty input | `mode`, `repo_owner`, `repo_name` |
| `cli.agent.session.run` | CLI `agent session run` invoked | `title_length`, `prompt_length`, `title_source` ("explicit" \| "auto_from_prompt"), `repo_owner`, `repo_name` |

### Common Properties (all events)

- `session_id` (analytics), `timestamp`, `client_version`, `client_type`

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Session creation success rate | >98% | `submitted` → `succeeded` |
| TUI create completion rate | >75% | `opened` → `succeeded` |
| TUI abandonment with title | <15% | `opened` → `cancelled` where `had_title=true` |
| Error rate | <2% | `submitted` → `failed` |
| Retry success rate | >80% | `failed` → `retried` → `succeeded` |
| Time from open to submit (TUI, median) | <10s | Input speed |
| Time from submit to chat screen (TUI, p95) | <2s | Perceived creation latency |
| CLI create latency (p95) | <3s | Round-trip time |
| Sessions created per active user per week | >2 | Adoption depth |
| Keybinding vs palette entry split | >80% keybinding | UX preference signal |
| Inline vs modal mode split | >90% inline | UX preference signal |

## Observability

### Logging Requirements

**Server-side logging** (structured JSON to stdout):

| Level | Event | Structured Fields |
|-------|-------|-------------------|
| `info` | Session created | `event=agent_session_created`, `session_id`, `repository_id`, `user_id`, `title_length`, `duration_ms` |
| `warn` | Creation failed (client error) | `event=agent_session_create_failed`, `repository_id`, `user_id`, `status_code`, `error_message` |
| `warn` | Rate limited | `event=agent_session_create_rate_limited`, `user_id`, `repository_id`, `retry_after_s` |
| `error` | Creation failed (server error) | `event=agent_session_create_error`, `repository_id`, `user_id`, `error_message`, `stack_trace` |

**Client-side logging** (TUI, stderr, level via `CODEPLANE_LOG_LEVEL`, default: `warn`):

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Create input opened | `AgentSessionCreate: opened [mode={inline|modal}] [entry_point={keybinding|palette}]` |
| `debug` | Title input changed | `AgentSessionCreate: input [length={n}]` |
| `debug` | Validation rejected | `AgentSessionCreate: validation rejected [reason={empty|whitespace}]` |
| `info` | Submission started | `AgentSessionCreate: submitting [title_length={n}] [mode={mode}]` |
| `info` | Session created | `AgentSessionCreate: created [session_id={id}] [duration={ms}ms]` |
| `info` | Navigated to chat | `AgentSessionCreate: navigated [session_id={id}]` |
| `info` | Cancelled | `AgentSessionCreate: cancelled [had_title={bool}] [mode={mode}]` |
| `warn` | Create failed | `AgentSessionCreate: failed [status={code}] [error={msg}] [mode={mode}]` |
| `warn` | Rate limited | `AgentSessionCreate: rate limited [retry_after={s}]` |
| `warn` | Permission denied | `AgentSessionCreate: permission denied [status=403]` |
| `error` | Auth error | `AgentSessionCreate: auth error [status=401]` |
| `error` | Render error | `AgentSessionCreate: render error [error={msg}]` |
| `error` | Unexpected response | `AgentSessionCreate: unexpected response [status={code}] [body_preview={first_100_chars}]` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_agent_session_create_total` | Counter | `status` (success/failure), `error_code` | Total session creation attempts |
| `codeplane_agent_session_create_duration_seconds` | Histogram | `status` | Processing time (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_agent_sessions_active_total` | Gauge | `repository_id` | Active sessions count |
| `codeplane_agent_session_create_rate_limited_total` | Counter | `user_id` | Rate-limited creation attempts |
| `codeplane_agent_session_create_title_length` | Histogram | — | Title length distribution (buckets: 10, 25, 50, 100, 150, 200, 255) |

### Alerts

**Alert 1: High agent session creation error rate**
- **Condition**: `rate(codeplane_agent_session_create_total{status="failure"}[5m]) / rate(codeplane_agent_session_create_total[5m]) > 0.05` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `event=agent_session_create_error` in the last 10 minutes.
  2. Identify the most common `error_message` and `status_code`.
  3. If 500 errors dominate: check database connectivity (`SELECT 1 FROM agent_sessions LIMIT 1`), check connection pool utilization, check for recent migrations.
  4. If 400 errors dominate: check if a specific client version is sending malformed requests. Review recent client deploys.
  5. If 403 errors spike: check if a permission policy or role change was deployed.
  6. If database is healthy and errors persist: restart the server process and monitor for 5 minutes.
  7. Escalate if error rate persists after restart.

**Alert 2: Agent session creation latency spike**
- **Condition**: `histogram_quantile(0.95, codeplane_agent_session_create_duration_seconds) > 2` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency for `agent_sessions` table INSERTs.
  2. Check database connection pool utilization and active query count.
  3. Check if `agent_sessions` table needs vacuuming (`SELECT n_dead_tup FROM pg_stat_user_tables WHERE relname = 'agent_sessions'`).
  4. Verify indexes exist on `(repository_id, created_at DESC)` and `(id)`.
  5. Check server CPU and memory utilization.
  6. If a specific repository has disproportionate session count, investigate hotspot behavior.
  7. Escalate if latency persists after verifying all of the above.

**Alert 3: Unusual rate limit volume**
- **Condition**: `rate(codeplane_agent_session_create_rate_limited_total[5m]) > 10` for 5 minutes.
- **Severity**: Info
- **Runbook**:
  1. Identify rate-limited users from logs (`event=agent_session_create_rate_limited`).
  2. Check if a script or CI automation is creating sessions in a tight loop.
  3. If legitimate usage (e.g., workflow orchestration): consider increasing per-user rate limit or adding a service account exemption.
  4. If abusive: consider temporary user suspension via admin API.

### Error Cases and Failure Modes

| Error Case | Detection | Impact | Recovery |
|------------|-----------|--------|----------|
| Database connection failure | INSERT throws connection error | 500 returned, session not created | Auto-reconnect via pool; user retries |
| UUID collision | Unique constraint violation on `id` | 500 returned | Retry with new UUID (astronomically rare) |
| Auth service unavailable | User lookup fails | 401 returned incorrectly | Restart auth service; user retries |
| Repository lookup failure | Repo resolution returns null | 404 returned | Verify repo exists in database |
| Request body too large | Body parser rejects | 413 returned | Client reduces payload |
| TUI component crash | React error boundary catches | "Press r to restart" shown | User restarts TUI |
| Network timeout (client) | Fetch promise exceeds 30s | Error shown, title preserved | User retries when connectivity returns |
| Server OOM | Process crash | Connection reset | Auto-restart via process manager |

## Verification

### API Integration Tests (33 tests)

| Test ID | Description |
|---------|-------------|
| API-CREATE-001 | `POST /api/repos/:owner/:repo/agent/sessions` with valid title returns 201 and `AgentSession` object |
| API-CREATE-002 | Response includes `id`, `repositoryId`, `userId`, `title`, `status`, `createdAt`, `updatedAt` |
| API-CREATE-003 | Response `status` is `"pending"` |
| API-CREATE-004 | Response `startedAt` is `null` |
| API-CREATE-005 | Response `finishedAt` is `null` |
| API-CREATE-006 | Response `workflowRunId` is `null` |
| API-CREATE-007 | Response `title` matches submitted title (after trim) |
| API-CREATE-008 | Response `id` is a valid UUID |
| API-CREATE-009 | Title with leading/trailing whitespace is trimmed |
| API-CREATE-010 | Title at exactly 1 character: accepted |
| API-CREATE-011 | Title at exactly 255 characters: accepted |
| API-CREATE-012 | Title at 256 characters: returns 400 |
| API-CREATE-013 | Empty title `""`: returns 400 |
| API-CREATE-014 | Whitespace-only title `"   "`: returns 400 |
| API-CREATE-015 | Missing `title` field: returns 400 |
| API-CREATE-016 | Empty body `{}`: returns 400 |
| API-CREATE-017 | Non-JSON body: returns 400 |
| API-CREATE-018 | No Content-Type header: returns 400 |
| API-CREATE-019 | No authentication: returns 401 |
| API-CREATE-020 | Invalid PAT: returns 401 |
| API-CREATE-021 | Expired session cookie: returns 401 |
| API-CREATE-022 | Read-only user: returns 403 |
| API-CREATE-023 | Non-existent repository: returns 404 |
| API-CREATE-024 | Unicode title (emoji, CJK, Arabic): accepted and stored correctly |
| API-CREATE-025 | Title with HTML tags: stored as literal string |
| API-CREATE-026 | Title with special characters: accepted |
| API-CREATE-027 | Two sessions with same title: both succeed, different IDs |
| API-CREATE-028 | Concurrent creation (10 parallel): all succeed with unique IDs |
| API-CREATE-029 | Created session in subsequent GET list |
| API-CREATE-030 | Created session retrievable via GET by ID |
| API-CREATE-031 | Extra unknown fields in body: ignored |
| API-CREATE-032 | `X-Total-Count` increases by 1 after creation |
| API-CREATE-033 | Title with null byte: returns 400 |

### CLI E2E Tests (11 tests)

| Test ID | Description |
|---------|-------------|
| CLI-CREATE-001 | `agent session run` with `--title` creates session, returns JSON with `id` |
| CLI-CREATE-002 | Exit code 0 on success |
| CLI-CREATE-003 | Without `--title`, title defaults to first 60 chars of prompt |
| CLI-CREATE-004 | Title > 255 chars: error, exit code 1 |
| CLI-CREATE-005 | Without `--repo`, resolves from current directory |
| CLI-CREATE-006 | Invalid `--repo`: error, exit code 1 |
| CLI-CREATE-007 | Without auth: error mentioning `codeplane auth login` |
| CLI-CREATE-008 | `session list` shows session from previous `run` |
| CLI-CREATE-009 | `session view <id>` returns created session |
| CLI-CREATE-010 | JSON output includes all expected fields |
| CLI-CREATE-011 | `--json` flag formats output correctly |

### TUI E2E Tests — Snapshot Tests (14 tests)

| Test ID | Description |
|---------|-------------|
| TUI-SNAP-001 | Inline create input at 120×40: bordered input with placeholder, list dimmed |
| TUI-SNAP-002 | Inline create input at 80×24: compact layout |
| TUI-SNAP-003 | Inline create input at 200×60: generous spacing |
| TUI-SNAP-004 | Inline input with user-typed title visible |
| TUI-SNAP-005 | Inline "Creating…" state |
| TUI-SNAP-006 | Inline error state: red error, title preserved |
| TUI-SNAP-007 | Modal at 120×40: centered with title/input/buttons |
| TUI-SNAP-008 | Modal at 80×24: compact |
| TUI-SNAP-009 | Modal at 200×60: generous |
| TUI-SNAP-010 | Modal error state |
| TUI-SNAP-011 | Modal "Creating…" state |
| TUI-SNAP-012 | Status bar: "Enter:create Esc:cancel" (inline) |
| TUI-SNAP-013 | Status bar: "Enter:create Tab:next Esc:cancel" (modal) |
| TUI-SNAP-014 | NO_COLOR: reverse video borders |

### TUI E2E Tests — Keyboard Interaction (28 tests)

| Test ID | Description |
|---------|-------------|
| TUI-KEY-001 | `n` from session list opens inline create input |
| TUI-KEY-002 | Typing updates title text |
| TUI-KEY-003 | Enter on non-empty submits |
| TUI-KEY-004 | Enter on empty is no-op |
| TUI-KEY-005 | Esc cancels, returns focus to list |
| TUI-KEY-006 | Esc restores previously focused row |
| TUI-KEY-007 | `n` while input open is ignored |
| TUI-KEY-008 | j/k type into input, don't move list |
| TUI-KEY-009 | `/` types into input, doesn't open search |
| TUI-KEY-010 | `d` types into input, no delete |
| TUI-KEY-011 | `f` types into input, no filter cycle |
| TUI-KEY-012 | Success navigates to chat screen |
| TUI-KEY-013 | Failure shows error, retains text |
| TUI-KEY-014 | Enter retry re-submits |
| TUI-KEY-015 | Backspace deletes last char |
| TUI-KEY-016 | Ctrl+A/Home to start |
| TUI-KEY-017 | Ctrl+E/End to end |
| TUI-KEY-018 | Ctrl+K kills to end |
| TUI-KEY-019 | Ctrl+U kills to start |
| TUI-KEY-020 | Command palette "New Agent Session" opens modal |
| TUI-KEY-021 | Enter in modal input submits |
| TUI-KEY-022 | Esc in modal dismisses |
| TUI-KEY-023 | Tab cycles Input→Create→Cancel→Input |
| TUI-KEY-024 | Shift+Tab cycles backward |
| TUI-KEY-025 | Ctrl+S submits from any element |
| TUI-KEY-026 | Enter on Cancel dismisses |
| TUI-KEY-027 | Enter on Create submits |
| TUI-KEY-028 | Rapid 30 chars in 500ms all captured |

### TUI E2E Tests — Responsive (10 tests)

| Test ID | Description |
|---------|-------------|
| TUI-RESP-001 | 80×24 inline: width fills available - 4ch |
| TUI-RESP-002 | 120×40 inline: width fills available - 8ch |
| TUI-RESP-003 | 200×60 inline: width fills available - 16ch |
| TUI-RESP-004 | 80×24 modal: 90% width |
| TUI-RESP-005 | 120×40 modal: 60% width |
| TUI-RESP-006 | 200×60 modal: 50% width |
| TUI-RESP-007 | Resize 120→80 during inline: text preserved |
| TUI-RESP-008 | Resize 80→120 during modal: width expands |
| TUI-RESP-009 | Resize below 80×24: "too small"; back restores |
| TUI-RESP-010 | Resize during "Creating…": continues normally |

### TUI E2E Tests — Integration (16 tests)

| Test ID | Description |
|---------|-------------|
| TUI-INT-001 | Success → chat screen with correct session ID |
| TUI-INT-002 | Chat after create has empty pre-focused input |
| TUI-INT-003 | Back from chat → list shows new session at top |
| TUI-INT-004 | 401 → auth error screen pushed |
| TUI-INT-005 | 403 → "Insufficient permissions" inline |
| TUI-INT-006 | 429 → "Rate limited. Retry in Ns." |
| TUI-INT-007 | 500 → "Failed to create session. Press Enter to retry." |
| TUI-INT-008 | Network timeout → error after 30s, text preserved |
| TUI-INT-009 | 400 → inline error with server message |
| TUI-INT-010 | Double-submit: rapid Enter×3 creates one session |
| TUI-INT-011 | Create then q in chat → list shows session |
| TUI-INT-012 | Palette entry hidden without repo context |
| TUI-INT-013 | `n` no-op without repo context |
| TUI-INT-014 | `n` hidden from status bar for read-only users |
| TUI-INT-015 | Modal create navigates through to chat |
| TUI-INT-016 | 255-char title accepted and created |

### TUI E2E Tests — Edge Cases (10 tests)

| Test ID | Description |
|---------|-------------|
| TUI-EDGE-001 | Only spaces → Enter is no-op |
| TUI-EDGE-002 | Only tabs → not inserted, Enter no-op |
| TUI-EDGE-003 | Exactly 255 chars → accepted, created |
| TUI-EDGE-004 | 256th char → not inserted |
| TUI-EDGE-005 | Unicode/emoji → rendered and submitted correctly |
| TUI-EDGE-006 | Rapid n→Esc→n→Esc 5× → no leaked state |
| TUI-EDGE-007 | Fail then retry succeeds → error clears, navigates |
| TUI-EDGE-008 | Ctrl+C during "Creating…" → TUI quits |
| TUI-EDGE-009 | Paste 500 chars → truncated to 255 |
| TUI-EDGE-010 | "Creating…" minimum 100ms display time |

**Total: 122 tests** (33 API + 11 CLI + 78 TUI). All tests run against a real API server with test fixtures — no mocking of implementation details. Tests are left failing if backend is unimplemented — never skipped or commented out.

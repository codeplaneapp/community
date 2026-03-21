# WORKSPACE_SESSION_VIEW

Specification for WORKSPACE_SESSION_VIEW.

## High-Level User POV

When a developer has an active workspace session — a live terminal connection into a Codeplane cloud development environment — they need a way to inspect everything about that individual session. The workspace session view is the detail screen for a single session: its current status, terminal dimensions, activity history, idle timeout countdown, and SSH connection access.

From the web UI, a user clicks a session row in the workspace detail's sessions tab and sees the full session dashboard. From the TUI, they press Enter on a session in the sessions list. From the CLI, they run `codeplane workspace session view <id>`. In every case, the session view answers the fundamental questions: "Is this session still running? When was it last active? How do I connect to it? Is it about to time out from inactivity?"

The session view is particularly valuable for workspace resource management. A developer debugging a stuck workspace can inspect individual sessions to see which ones are still active and which have gone idle. For agent-assisted workflows, the session view reveals whether an agent-spawned terminal is still running or has completed its work. The idle timeout countdown gives the user a clear signal about how much time remains before the session is automatically cleaned up and — if it's the last session — the workspace is suspended.

When the session is in a running state, the view provides direct access to SSH connection details: a ready-to-copy SSH command, the connection host and port, and a short-lived access token that refreshes automatically. The user can copy the SSH command with a single keystroke and immediately open a terminal connection. When the session is stopped or failed, the view shows the final status with timestamps so the user can understand what happened and when.

The session view updates in real time. If the session transitions from pending to running, the status badge updates live without a page refresh. If the session is destroyed by another client or by idle timeout cleanup, the view reflects the change immediately via SSE streaming. This real-time behavior is essential because sessions represent active compute connections, and users need reliable status to decide whether to reconnect, destroy, or investigate.

The session view also serves as an action surface. From the detail screen, a user can destroy the session (with confirmation), copy SSH credentials, or refresh connection details. If this is the last active session on the workspace, the view warns the user that destroying it will trigger automatic workspace suspension.

## Acceptance Criteria

### Definition of Done

- A user can retrieve full details of a single workspace session by ID from the API, Web UI, CLI, and TUI.
- The view displays all session metadata: session ID, parent workspace ID, status, terminal dimensions (cols×rows), last activity timestamp, idle timeout, and creation/update timestamps.
- SSH connection information is accessible from the session view when the session is in a running state.
- The view supports session lifecycle actions: destroy session (with confirmation showing workspace auto-suspend warning when applicable).
- Real-time status updates are delivered via SSE on channel `workspace_status_{uuid_no_dashes}` so the view reflects session state transitions without manual refresh.
- All clients handle error states (not found, forbidden, server error) with clear, actionable messaging.
- The session view is accessible from the workspace detail sessions tab, the command palette, and direct navigation.

### Functional Constraints

- **Scope**: The session view is always accessed by a specific session ID within a repository context (`/api/repos/:owner/:repo/workspace/sessions/:id`).
- **Response payload**: The session detail response includes all fields: `id`, `workspace_id`, `repository_id`, `user_id`, `status`, `cols`, `rows`, `last_activity_at`, `idle_timeout_secs`, `created_at`, `updated_at`.
- **Status values**: Session `status` is one of: `pending`, `running`, `stopped`, `failed`.
- **Session ID format**: Must be a valid UUID (36 characters with dashes). Empty or whitespace-only values return HTTP 400 with `"session id is required"`.
- **SSH info availability**: SSH connection info is available via a separate endpoint (`/api/repos/:owner/:repo/workspace/sessions/:id/ssh`). It auto-starts the workspace VM if not running, generates a fresh 5-minute access token, and marks the session as `running`.
- **Idle timeout display**: The view must show both the configured idle timeout (in seconds or human-readable minutes) and the time remaining before idle cleanup (derived from `last_activity_at + idle_timeout_secs - now`).
- **Real-time updates**: The SSE stream for session status uses PostgreSQL LISTEN/NOTIFY on channel `workspace_status_{sessionId_no_dashes}`. The initial event includes the current session status.
- **Lifecycle actions from the view**: Destroy (from any non-stopped, non-failed state). Destroying a stopped or failed session is a no-op. The destroy action returns 204 No Content.
- **No SSH info in session detail**: The `GET /api/repos/:owner/:repo/workspace/sessions/:id` response does NOT include SSH connection info. SSH info requires a separate request to the `/ssh` sub-endpoint.

### Boundary Constraints

- **Session ID**: UUID v4 format, exactly 36 characters including hyphens (pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`). Non-matching values are handled gracefully: empty/whitespace returns 400; malformed UUID returns 404 (no DB match).
- **Workspace ID**: UUID format, 36 characters. Displayed in the session view as context linking back to the parent workspace.
- **cols field**: Non-negative integer. Typical range 1–500. Value of 0 indicates a non-interactive session. Display as-is.
- **rows field**: Non-negative integer. Typical range 1–200. Value of 0 indicates a non-interactive session. Display as-is.
- **idle_timeout_secs**: Non-negative integer. Default 1800 (30 minutes). Displayed as human-readable duration (e.g., "30m").
- **last_activity_at**: ISO-8601 timestamp string. Used to compute idle time remaining.
- **SSH access token**: UUID v4, 36 characters, 5-minute TTL. Masked by default in all display surfaces. Generated fresh on each `/ssh` request.
- **SSH command string**: Variable length up to ~512 characters. Must be fully copyable from all surfaces.
- **Timestamps**: All timestamp fields (`last_activity_at`, `created_at`, `updated_at`) are ISO-8601 strings. Displayed as relative time with absolute time available on hover/tooltip.

### Edge Cases

- **Session not found**: Returns HTTP 404 with `"workspace session not found"`. Clients show "Session not found" with back-navigation.
- **Session destroyed while viewing**: SSE stream delivers `{"status": "stopped"}` event. View updates status badge, disables destroy action, and shows "Session has been stopped" indicator.
- **Session transitions from pending to running**: Status badge updates, SSH section becomes available, idle countdown begins.
- **Session transitions to failed**: Status badge updates to red `failed`, SSH section hidden, destroy action remains available.
- **Idle timeout countdown reaches zero while viewing**: View shows "Idle timeout expired" warning. Session may be cleaned up by the background scheduler — SSE delivers the `stopped` event when this happens.
- **Workspace suspended while session is being viewed**: Session transitions to `stopped` via workspace suspension cascade. SSE delivers event.
- **Workspace deleted while session exists**: Session transitions to `stopped`. View shows "Parent workspace has been deleted" context.
- **Session belongs to a different user**: Returns HTTP 404 (not 403) to prevent information leakage about other users' sessions.
- **Network disconnection during SSE stream**: Client shows "Disconnected" indicator and reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s). Maximum 20 reconnection attempts.
- **SSH info request when sandbox client is unavailable**: Returns HTTP 500 with `"sandbox client unavailable"`. View shows "SSH unavailable — container runtime not configured."
- **Concurrent SSH info requests for the same session**: Each generates a distinct token. All are valid until their respective expiry times.
- **Session with zero terminal dimensions (cols=0, rows=0)**: Display as "0×0" — indicates a non-interactive session (e.g., agent-spawned).

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspace/sessions/:id`

**Authentication**: Required (session cookie or PAT).

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Repository owner username or organization slug |
| `repo` | string | Yes | Repository name |
| `id` | string (UUID) | Yes | Workspace session ID |

**Response**: HTTP 200

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "workspace_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "repository_id": 1,
  "user_id": 7,
  "status": "running",
  "cols": 120,
  "rows": 40,
  "last_activity_at": "2026-03-22T14:30:00.000Z",
  "idle_timeout_secs": 1800,
  "created_at": "2026-03-22T10:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses**:

| Status | Body | Condition |
|--------|------|----------|
| 400 | `{"message": "session id is required"}` | Missing or empty `id` parameter |
| 401 | `{"message": "authentication required"}` | No valid session or PAT |
| 403 | `{"message": "forbidden"}` | User lacks repository access |
| 404 | `{"message": "workspace session not found"}` | Session doesn't exist or user lacks ownership |
| 404 | `{"message": "repository not found"}` | Owner or repo does not exist |
| 500 | `{"message": "internal server error"}` | Unhandled service error |

**Related Endpoints**:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/repos/:owner/:repo/workspace/sessions` | GET | List all sessions |
| `/api/repos/:owner/:repo/workspace/sessions/:id/ssh` | GET | Get SSH connection info (auto-starts VM, generates token) |
| `/api/repos/:owner/:repo/workspace/sessions/:id/destroy` | POST | Destroy session (204 No Content) |
| `/api/repos/:owner/:repo/workspace/sessions/:id/stream` | GET | SSE status stream |

### SDK Shape

**Service method**: `WorkspaceService.getSession(sessionID: string, repositoryID: number, userID: number): Promise<WorkspaceSessionResponse | null>`

**Returns**: A `WorkspaceSessionResponse` object if found, or `null` if the session does not exist for the given user/repo scope.

**Response interface**:

```typescript
interface WorkspaceSessionResponse {
  id: string;
  workspace_id: string;
  repository_id: number;
  user_id: number;
  status: string;       // "pending" | "running" | "stopped" | "failed"
  cols: number;
  rows: number;
  last_activity_at: string;   // ISO-8601
  idle_timeout_secs: number;
  created_at: string;         // ISO-8601
  updated_at: string;         // ISO-8601
}
```

**Behavior**:
- Queries the database for the session scoped to `(sessionID, repositoryID, userID)`.
- Returns `null` if no matching row is found.
- Maps database row to `WorkspaceSessionResponse` via `toSessionResponse()`.
- Converts `Date` fields to ISO-8601 strings.
- Does not touch activity timestamps (read-only view).

### UI-Core Hook Shape

```typescript
function useWorkspaceSession(options: {
  owner: string;
  repo: string;
  sessionId: string;
  enabled?: boolean;
}): {
  session: WorkspaceSession | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

### CLI Command

**Command**: `codeplane workspace session view <id>`

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Workspace session UUID |

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--repo`, `-R` | string | No | Auto-detected from cwd | Repository in `OWNER/REPO` format |
| `--json` | boolean | No | false | Output as structured JSON |

**Output (default)**:
```
Session: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Workspace: f47ac10b-58cc-4372-a567-0e02b2c3d479
Status: running
Terminal: 120×40
Idle Timeout: 30m
Last Active: 2 minutes ago
Created: 4 hours ago
Updated: 2 minutes ago
```

**Exit Codes**: 0 = success, 1 = error (not found, auth failure, network error, missing argument).

### TUI UI

**Screen name**: Session Detail Screen

**Entry points**: Press `Enter` on a session row in the workspace detail Sessions tab. `:session <id>` command palette. `codeplane tui --screen session --repo owner/repo --session <id>`.

**Layout** (top to bottom):
1. **Header row**: Session ID in bold (full 36-character UUID), status badge (colored, with spinner for `pending`).
2. **Metadata section**: Workspace (truncated/full based on terminal width, clickable), Status, Terminal (`cols×rows`), Idle Timeout (`Nm`), Time Remaining (live countdown, yellow <5m, red <1m), Last Active, Created, Updated.
3. **SSH section** (only when running): SSH command in bordered code block, copy with `c`. Host/Port/Username fields. Access token masked by default, revealed with `v`. Token countdown with auto-refresh.
4. **Action bar**: Context-sensitive — running: `c:copy ssh  D:destroy  v:toggle token  r:refresh ssh  q:back` | pending: `D:destroy  q:back` | stopped/failed: `q:back`.

**Destroy confirmation overlay**: "Destroy session 'a1b2c3d4'? This will end the terminal connection." + "Workspace will be suspended." if last active session. `[y] Confirm  [n/Esc] Cancel`.

**Responsive breakpoints**: 80×24 (truncated IDs, wrapping SSH), 120×40 (full metadata, expanded SSH), 200×60+ (full UUIDs, dual timestamps).

**Real-time**: SSE subscription to `workspace_status_{sessionId_no_dashes}`. Status badge updates, SSH section shows/hides, countdown pauses on stop/fail.

### Web UI Design

**Route**: `/:owner/:repo/workspaces/:workspaceId/sessions/:sessionId` (or slide-out panel from workspace detail sessions tab).

1. **Session header**: Session ID (truncated + copy icon), status badge.
2. **Metadata card**: Grid — Workspace (linked), Status, Terminal Size, Idle Timeout, Time Remaining (live countdown), Last Active, Created, Updated.
3. **SSH connection card** (only when running): SSH command in monospace code block with Copy button. Expandable details: Host, Port, Username, Access Token (masked + reveal toggle). Token countdown + auto-refresh.
4. **Actions**: "Destroy Session" button (red, with confirmation modal). Disabled for stopped/failed.

**Confirmation modal**: Title: "Destroy Session". Body: "Are you sure you want to destroy session {id}? The terminal connection will be ended." + last-session workspace suspension warning. Primary: "Destroy Session" (red). Secondary: "Cancel". Loading spinner during API call.

**Post-destroy**: Success toast, workspace suspension info toast if applicable, navigate back to workspace detail.

**Real-time**: EventSource on `/stream` endpoint. Status badge, SSH section, countdown update live.

### Documentation

- **"Viewing Workspace Session Details" guide**: What sessions are, how to navigate to the session detail view from web UI, TUI, and CLI, and what each metadata field means.
- **CLI reference for `codeplane workspace session view <id>`**: Command, arguments, flags, output formats, examples.
- **API reference for `GET /api/repos/:owner/:repo/workspace/sessions/:id`**: Path parameters, response schema, error codes, relationship to SSH/destroy/stream endpoints.
- **TUI keyboard reference**: Session detail screen keybindings — `c`, `v`, `D`, `w`, `r`, `q`.
- **"Session Lifecycle and Idle Timeout" guide**: Status model (pending → running → stopped/failed), idle timeout mechanics, activity tracking, automatic cleanup.

## Permissions & Security

### Authorization Roles

| Role | Can View Session? | Notes |
|------|-------------------|-------|
| Session Owner | ✅ Yes | Always can view their own sessions |
| Repository Owner | ✅ Yes | Can view all sessions in the repository |
| Repository Admin | ✅ Yes | Can view all sessions in the repository |
| Organization Owner | ✅ Yes | Inherits admin over all org repositories |
| Member (write) | ✅ Yes | Sees only their own sessions |
| Member (read-only) | ✅ Yes | Sees only their own sessions |
| Anonymous | ❌ No | Returns 401 |

- Session detail queries are scoped to `(sessionID, repositoryID, userID)` at the database level. A user cannot view another user's session unless they are a repository admin or organization owner.
- Non-existent sessions and sessions belonging to other users both return 404 (no information leakage about existence).
- The destroy action from the session view follows the same authorization model as WORKSPACE_SESSION_DESTROY (session owner, repo admin, org owner).

### Rate Limiting

| Endpoint | Limit | Scope |
|----------|-------|-------|
| `GET /workspace/sessions/:id` | 60 requests/minute | Per authenticated user |
| `GET /workspace/sessions/:id/ssh` | 5,000 requests/hour | Per authenticated user |
| `GET /workspace/sessions/:id/stream` | 10 concurrent connections | Per authenticated user |
| `POST /workspace/sessions/:id/destroy` | 20 requests/minute | Per authenticated user |

- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in responses.
- HTTP 429 returned when rate limit is exceeded, with `Retry-After` header.
- SSE connections count against connection limits, not request rate limits.

### Data Privacy

- Session detail responses include `user_id` and `repository_id`, which are internal numeric identifiers — acceptable in authenticated, user-scoped contexts.
- SSH connection info (host, port, access token, command) is **never** included in the session detail response. It requires a separate authenticated request to `/ssh`.
- The access token returned by `/ssh` is a short-lived credential (5-minute TTL, single-use). It is SHA-256 hashed before database storage. The plaintext token is returned exactly once.
- `last_activity_at` reveals activity patterns but only to the session owner or repository admins.
- Session IDs are UUIDs and do not encode user, repository, or infrastructure information.
- Logs must **never** include: access tokens, SSH connection strings, authorization headers, or cookie values.
- The `ssh_connection_info` column persisted to the session record contains the raw token — this is an implementation detail that poses a screen-sharing/log-scraping risk; clients should mask the token by default.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workspace_session.detail.viewed` | User fetches session detail | `session_id`, `workspace_id`, `repository_id`, `user_id`, `session_status`, `client` (web/cli/tui/api), `response_time_ms` |
| `workspace_session.detail.ssh_copied` | User copies SSH command from session view | `session_id`, `workspace_id`, `repository_id`, `user_id`, `client` |
| `workspace_session.detail.ssh_fetched` | User fetches SSH info from session view | `session_id`, `workspace_id`, `repository_id`, `user_id`, `client`, `vm_auto_started` (boolean), `response_time_ms` |
| `workspace_session.detail.token_revealed` | User toggles access token visibility | `session_id`, `user_id`, `client` |
| `workspace_session.detail.destroyed` | User destroys session from session view | `session_id`, `workspace_id`, `repository_id`, `user_id`, `client`, `session_age_seconds`, `was_last_active_session`, `workspace_auto_suspended` |
| `workspace_session.detail.navigated_to_workspace` | User navigates from session view to parent workspace | `session_id`, `workspace_id`, `user_id`, `client` |
| `workspace_session.detail.sse_connected` | Client connects to session SSE stream | `session_id`, `user_id`, `client` |
| `workspace_session.detail.sse_disconnected` | Client disconnects from session SSE stream | `session_id`, `user_id`, `client`, `duration_seconds`, `events_received` |
| `workspace_session.detail.error` | Session detail request fails | `session_id`, `user_id`, `client`, `error_type` (not_found/forbidden/server_error), `status_code` |

### Never Include in Events

- `access_token`, `command`, `ssh_connection_info`, `token_hash`, or any raw credential material.

### Funnel Metrics & Success Indicators

- **Session view → SSH copy conversion**: Percentage of users who view session detail and then copy the SSH command. Target: > 30% for running sessions.
- **Session view → Destroy conversion**: Percentage of session views that result in session destruction. Indicates active resource management.
- **Session view → Workspace navigation**: Percentage of users who navigate from session detail to parent workspace. Indicates effective cross-navigation.
- **SSE stream connection rate**: Percentage of session detail views that establish an SSE connection. Target: > 80% for web/TUI clients.
- **Session view load time P95**: Time from request to response render. Target: < 500ms.
- **SSH info fetch success rate**: Percentage of `/ssh` requests from the session view that return 200. Target: > 85%.
- **Token refresh rate**: How often tokens are auto-refreshed during a single session view visit. Indicates how long users spend on the session detail screen.
- **Daily active session viewers**: Unique users viewing at least one session detail per day. Tracks feature adoption.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Trigger |
|-----------|-------|-------------------|--------|
| Session detail request received | `info` | `request_id`, `session_id`, `repository_id`, `user_id`, `client_ip` | Every detail request |
| Session detail response sent | `info` | `request_id`, `session_id`, `status`, `duration_ms` | Every successful response |
| Session detail not found | `debug` | `request_id`, `session_id`, `repository_id`, `user_id` | Session not found or user lacks access |
| Session detail auth failure | `warn` | `request_id`, `client_ip`, `reason` | 401 or 403 response |
| Session detail service error | `error` | `request_id`, `session_id`, `error_message`, `stack_trace` | 500 response |
| Session detail database timeout | `error` | `request_id`, `query_name`, `duration_ms`, `session_id` | DB query exceeds 5s |
| Session SSE stream connected | `info` | `session_id`, `user_id`, `channel` | SSE connection established |
| Session SSE stream disconnected | `info` | `session_id`, `user_id`, `channel`, `duration_seconds` | SSE connection closed |
| Session SSH info requested from detail view | `info` | `request_id`, `session_id`, `workspace_id`, `user_id` | SSH info fetch from view |
| Session SSH info token generated | `info` | `session_id`, `workspace_id`, `vm_id`, `expires_at` | New token created |
| Session SSH info VM auto-started | `info` | `session_id`, `workspace_id`, `vm_id`, `start_duration_ms` | VM auto-started for SSH |
| Session SSH info sandbox unavailable | `warn` | `session_id`, `user_id` | Sandbox client not configured |
| Session destroy requested from detail view | `info` | `request_id`, `session_id`, `user_id` | Destroy action from view |

**Critical rule**: Raw `access_token`, `command`, and `ssh_connection_info` JSON are **never** logged at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_session_detail_requests_total` | Counter | `status_code` (200/400/401/403/404/500), `client` | Total session detail requests |
| `codeplane_workspace_session_detail_duration_seconds` | Histogram | `client` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_workspace_session_detail_errors_total` | Counter | `error_type` (auth/not_found/internal) | Total errors by category |
| `codeplane_workspace_session_sse_connections_active` | Gauge | — | Currently active SSE connections for session streams |
| `codeplane_workspace_session_sse_events_emitted_total` | Counter | `event_type` (workspace.session) | Total SSE events emitted for session streams |
| `codeplane_workspace_session_sse_reconnections_total` | Counter | — | Total SSE client reconnections |
| `codeplane_workspace_session_ssh_info_from_detail_total` | Counter | `status_code`, `vm_auto_started` (true/false) | SSH info requests originating from session detail view |
| `codeplane_workspace_session_detail_actions_total` | Counter | `action` (destroy/copy_ssh/refresh_ssh/toggle_token/navigate_workspace) | Actions taken from session detail view |

### Alerts

#### Alert: Session Detail Endpoint Error Rate > 5%
- **Condition**: `rate(codeplane_workspace_session_detail_errors_total{error_type="internal"}[5m]) / rate(codeplane_workspace_session_detail_requests_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check Grafana dashboard for session detail error rate panel.
  2. Query logs: filter by `level=error` and `event=session_detail_service_error` for the last 15 minutes.
  3. Check database connectivity: verify PostgreSQL is accepting connections and not under connection pool exhaustion.
  4. Check for recent deployments that may have introduced a regression in `WorkspaceService.getSession()`.
  5. If database is the root cause, check `pg_stat_activity` for long-running queries or lock contention on the `workspace_sessions` table.
  6. Verify the `getWorkspaceSessionForUserRepo` query executes correctly with manual test parameters.
  7. Check for null pointer exceptions in `toSessionResponse()` — common when DB rows have unexpected null values for `lastActivityAt` or `idleTimeoutSecs`.
  8. Escalate to platform team if not resolved within 15 minutes.

#### Alert: Session Detail Latency P95 > 2s
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_session_detail_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check Grafana dashboard for P95 latency trend.
  2. Verify database query plan: run `EXPLAIN ANALYZE` on `getWorkspaceSessionForUserRepo` with the affected session/repo/user IDs.
  3. Check if the composite index on `workspace_sessions(id, repository_id, user_id)` exists and is being used.
  4. Check database connection pool saturation in the database adapter layer.
  5. Check for competing background jobs (idle session cleanup, workspace cleanup scheduler).
  6. If latency is across the board, check overall database load and consider read replica routing.

#### Alert: SSE Connection Count Exceeds Capacity
- **Condition**: `codeplane_workspace_session_sse_connections_active > 500`
- **Severity**: Warning
- **Runbook**:
  1. Check if a specific user or automation is opening excessive SSE connections.
  2. Review `codeplane_workspace_session_sse_reconnections_total` for reconnection storms.
  3. Check for SSE connections that are not being closed properly (leaked connections).
  4. Verify that clients implement exponential backoff on reconnection.
  5. Check PostgreSQL LISTEN/NOTIFY queue depth — excessive notifications can cause backpressure.
  6. Consider implementing a per-user SSE connection limit if not already in place.
  7. If capacity is genuinely needed, scale the server or add load balancing for SSE connections.

#### Alert: Session Detail 404 Rate Spike
- **Condition**: `rate(codeplane_workspace_session_detail_requests_total{status_code="404"}[5m]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Check if there's a client bug generating requests for stale or invalid session IDs.
  2. Check if a mass session cleanup just ran (idle timeout cleanup), causing cached client-side session IDs to become stale.
  3. Review structured logs for patterns in the session IDs being requested — are they malformed, or valid UUIDs for deleted sessions?
  4. If a specific client version is the source, consider fixing the client to handle 404s gracefully and stop retrying.
  5. No infrastructure action needed — 404s are normal for recently destroyed sessions.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User Impact | Recovery |
|------------|-------------|-------------|----------|
| Session not found | 404 | Cannot view details | Navigate back; session may have been destroyed |
| Session belongs to different user | 404 | Cannot view (no leakage) | Navigate to own sessions |
| Repository not found | 404 | Cannot access | Verify repository path |
| Repository access revoked | 403 | Blocked | Contact repository admin |
| Unauthenticated | 401 | Blocked | Re-authenticate |
| Database connection lost | 500 | Temporary failure | Automatic retry; alert fires if sustained |
| Database query timeout | 500 | Slow/failed load | Query cancelled; investigate slow queries |
| `toSessionResponse` null field | 500 | Failed render | Fix DB row or add null guard in mapper |
| SSE connection dropped | Stream interrupt | Stale status display | Client auto-reconnects with backoff |
| SSH info sandbox unavailable | 500 | Cannot get SSH info | Admin must configure container runtime |
| SSH info VM auto-start fails | 500 | Cannot connect | Admin checks container runtime; user retries |

## Verification

### API Integration Tests

- **Get session detail for a running session**: Create workspace, create session, GET `/workspace/sessions/:id` → 200 with all required fields populated, `status: "running"`.
- **Response includes all required fields**: Assert presence and correct types for: `id` (UUID), `workspace_id` (UUID), `repository_id` (number), `user_id` (number), `status` (string enum), `cols` (number), `rows` (number), `last_activity_at` (ISO-8601), `idle_timeout_secs` (number), `created_at` (ISO-8601), `updated_at` (ISO-8601).
- **Response does NOT include SSH connection info**: Assert no `ssh_connection_info`, `host`, `port`, `access_token`, `command`, or `ssh_host` fields in the response.
- **Get session detail for a pending session**: Create session (before workspace starts), GET → 200, `status: "pending"`.
- **Get session detail for a stopped session**: Create then destroy session, GET → 200, `status: "stopped"`.
- **Get session detail for a failed session**: Trigger a session failure, GET → 200, `status: "failed"`.
- **Session with default terminal dimensions (80×24)**: Create session with no cols/rows, GET → `cols: 80`, `rows: 24`.
- **Session with custom terminal dimensions (120×40)**: Create session with `cols: 120, rows: 40`, GET → `cols: 120`, `rows: 40`.
- **Session with zero terminal dimensions (0×0)**: Create session with `cols: 0, rows: 0`, GET → `cols: 0`, `rows: 0`.
- **Session with maximum valid terminal dimensions (500×500)**: Create session with `cols: 500, rows: 500`, GET → `cols: 500`, `rows: 500`.
- **Session with dimensions exceeding maximum (501×501)**: Create session with `cols: 501, rows: 501`, verify behavior (400 or clamped).
- **Session idle_timeout_secs is correct (default 1800)**: GET → `idle_timeout_secs: 1800`.
- **Session timestamps are ISO-8601 strings**: Assert `last_activity_at`, `created_at`, and `updated_at` all parse as valid ISO-8601 dates.
- **Session workspace_id matches the parent workspace**: GET session → `workspace_id` matches created workspace.
- **Session repository_id is correct**: GET → `repository_id` matches the target repository.
- **Session user_id matches the authenticated user**: GET → `user_id` matches the requesting user.
- **404 for non-existent session ID**: GET with random UUID → 404, `"workspace session not found"`.
- **404 for session belonging to different user**: User A creates session, User B GETs → 404.
- **404 for session in different repository**: Session in repo A, GET scoped to repo B → 404.
- **400 for empty session ID**: GET with empty `id` → 400, `"session id is required"`.
- **400 for whitespace-only session ID**: GET with `id` = `"   "` → 400, `"session id is required"`.
- **404 for malformed UUID**: GET with `id` = `"not-a-uuid"` → 404 (no DB match).
- **401 for unauthenticated request**: GET without auth → 401.
- **403 for user without repository access**: GET with non-member user → 403.
- **404 for non-existent repository**: GET with invalid `owner/repo` → 404.
- **Response Content-Type is application/json**: Assert `Content-Type: application/json` header.
- **Session detail reflects activity touch**: Create session, fetch SSH info, GET session → `last_activity_at` is updated.
- **Session detail reflects status transitions**: Create session, transition to running, GET → `status: "running"`. Destroy, GET → `status: "stopped"`.
- **Maximum UUID length session ID (36 chars) succeeds**: GET with valid 36-char UUID → success or 404 (not 400).
- **Session ID longer than 36 characters**: GET with oversized ID → 404 (no crash).

### SSE Stream Tests

- **SSE stream connects and delivers initial event**: Subscribe to `/workspace/sessions/:id/stream` → receive initial `workspace.session` event with current status.
- **SSE stream delivers status change event**: Destroy session while subscribed → receive `workspace.session` event with `{"status": "stopped"}`.
- **SSE stream delivers event within 2 seconds of status change**: Time from API destroy call to SSE event receipt < 2s.
- **Multiple SSE clients receive the same event**: Connect two SSE clients, destroy session → both receive `stopped` event.
- **SSE channel uses session UUID without dashes**: Verify channel name format.
- **SSE stream for non-existent session**: Subscribe for invalid ID → stream connects without crash.
- **SSE reconnection after disconnect**: Disconnect, reconnect → receive current status as initial event.

### CLI E2E Tests

- **`codeplane workspace session view <valid-id>` displays session info**: Assert output contains Session ID, Status, Terminal size, Idle Timeout.
- **`codeplane workspace session view <valid-id> --json` returns valid JSON**: Assert output parses as JSON with all required fields.
- **`codeplane workspace session view <valid-id> --repo owner/repo`**: Assert succeeds with explicit repo context.
- **`codeplane workspace session view` without ID**: Assert usage help, exit code 1.
- **`codeplane workspace session view <nonexistent-id>`**: Assert error message, exit code 1.
- **`codeplane workspace session view <id>` without auth**: Assert auth error, exit code 1.
- **`codeplane workspace session view <id>` auto-detects repo from cwd**: Assert resolves correctly.
- **`codeplane workspace session view <id>` shows correct status**: Create and destroy, view → shows `stopped`.
- **`codeplane workspace session view <id> --json` field validation**: Assert JSON has all required fields.

### TUI E2E Tests

- **Session detail screen renders from workspace sessions tab**: Navigate to workspace Sessions tab, press Enter → detail screen with session ID in header.
- **Session detail screen shows status badge with correct color**: Running = green, pending = yellow+spinner, stopped = gray, failed = red.
- **Session detail screen shows metadata section**: Assert Workspace ID, Status, Terminal, Idle Timeout, Last Active, Created, Updated displayed.
- **Session detail screen SSH section visible when running**: Running session → SSH block visible.
- **Session detail screen SSH section hidden when stopped**: Stopped session → SSH section not visible.
- **Session detail screen `c` copies SSH command**: Press `c` → clipboard contains SSH command.
- **Session detail screen `v` toggles token visibility**: Press `v` → token revealed, press again → masked.
- **Session detail screen `D` opens destroy confirmation**: Press `D` → confirmation overlay with session ID.
- **Session detail screen destroy shows workspace warning for last session**: Single session, press `D` → "Workspace will be suspended."
- **Session detail screen `y` confirms destroy**: `D` then `y` → status updates to stopped.
- **Session detail screen `n` cancels destroy**: `D` then `n` → overlay dismissed.
- **Session detail screen `Esc` cancels destroy**: `D` then `Esc` → overlay dismissed.
- **Session detail screen `w` navigates to workspace**: `w` → workspace detail screen.
- **Session detail screen `q` pops screen**: `q` → return to previous screen.
- **Session detail screen SSE updates status badge**: Destroy via API → badge updates live.
- **Session detail screen idle countdown**: Running session → "Time Remaining" visible.
- **Session detail screen responsive at 80×24**: Truncated IDs, wrapping SSH.
- **Session detail screen responsive at 120×40**: Full metadata.
- **Session detail screen responsive at 200×60**: Full UUIDs and timestamps.

### Playwright (Web UI) E2E Tests

- **Session detail opens from workspace sessions tab**: Click session row → detail view loads.
- **Session detail shows all metadata fields**: Assert Session ID, Workspace, Status, Terminal, Idle Timeout, Last Active, Created, Updated.
- **Session detail shows correct status badge color**: Running=green, stopped=gray, failed=red, pending=yellow.
- **Session detail SSH section visible for running session**: SSH command block, Copy button, connection details present.
- **Session detail SSH section hidden for stopped session**: SSH section not rendered.
- **Session detail Copy SSH button works**: Click Copy → verify clipboard or toast.
- **Session detail access token masked by default**: Token field shows mask.
- **Session detail access token reveal toggle**: Click reveal → visible, click again → masked.
- **Session detail Destroy button opens confirmation modal**: Click "Destroy Session" → modal appears.
- **Session detail confirmation modal shows workspace warning**: Last active session → additional warning.
- **Session detail Destroy confirms via modal**: Click confirm → status updates, toast appears.
- **Session detail Destroy cancel via modal**: Click Cancel → dismissed.
- **Session detail Destroy cancel via Escape**: Escape → dismissed.
- **Session detail Destroy button disabled during API call**: Click → spinner, button disabled.
- **Session detail Destroy button hidden for stopped/failed**: Not visible.
- **Session detail real-time SSE status update**: Destroy via API → badge updates without refresh.
- **Session detail SSE reconnection**: Disconnect/reconnect → updates resume.
- **Session detail 404 for non-existent session**: Invalid URL → "Session not found" message.
- **Session detail workspace link navigation**: Click workspace → navigates to workspace detail.
- **Session detail idle countdown**: Running session → countdown visible.
- **Session detail token auto-refresh**: Token expiry → new token fetched.

### Cross-Surface Consistency Tests

- **View session via API → verify same data via CLI**: GET vs `session view --json` → same fields.
- **Destroy via Web UI → verify stopped via CLI**: Destroy in browser → CLI shows `stopped`.
- **Destroy via CLI → verify stopped in Web UI**: Destroy via CLI → browser shows `stopped`.
- **Create multiple sessions → view each → verify unique IDs, shared workspace_id**: 3 sessions → unique `id`, same `workspace_id`.

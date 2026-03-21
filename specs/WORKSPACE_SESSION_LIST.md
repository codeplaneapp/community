# WORKSPACE_SESSION_LIST

Specification for WORKSPACE_SESSION_LIST.

## High-Level User POV

When a developer is working within a Codeplane workspace — a cloud-backed coding environment tied to a repository — they interact with the workspace through sessions. A session represents an active terminal connection into the workspace's container: each open terminal tab, each SSH tunnel, each agent-spawned shell is a distinct session. The session list is how a user answers the question: "Who and what is currently connected to this workspace, and what are those connections doing?"

From the web UI, CLI, or TUI, a user navigates to a workspace's detail view and sees a list of all sessions associated with that workspace. Each session in the list shows its unique identifier, current status (pending, running, stopped, or failed), terminal dimensions, how recently it was active, and its idle timeout. The list is ordered newest-first so the most recently opened sessions appear at the top.

This view is essential for workspace resource management. A developer debugging a stuck workspace can see if there are orphaned sessions holding it open. A team lead reviewing compute costs can see how many concurrent sessions are active. When a session has gone idle beyond its timeout, the list makes it visible so the user can destroy it or understand why the workspace hasn't auto-suspended. For agent-assisted development workflows, the session list reveals how many agent-spawned terminals are active alongside human terminals, giving full visibility into what's happening inside the workspace sandbox.

The session list supports pagination so that even workspaces with many accumulated sessions (including historical stopped/failed sessions) remain performant and navigable. Combined with the session status stream, users can watch session state transitions in real time directly from the list view.

## Acceptance Criteria

### Definition of Done

- A user can retrieve a paginated list of workspace sessions scoped to a specific repository from API, CLI, TUI, and web surfaces.
- The list returns accurate status for each session, reflecting the real-time lifecycle state.
- Pagination behaves consistently across all clients using the same dual-mode pagination model as other list endpoints.
- Empty states are handled gracefully with clear messaging across all surfaces.
- Error states are handled with actionable error messages.
- The session list is scoped to the authenticated user's sessions only (unless the user is a repository admin or organization owner).
- Sessions in all lifecycle states (pending, running, stopped, failed) are included in the list by default.

### Functional Constraints

- **Scope**: Session list is always scoped to a single repository (`/api/repos/:owner/:repo/workspace/sessions`). There is no cross-repository or cross-workspace session listing endpoint. The list returns all sessions for the authenticated user across all workspaces in the repository.
- **Ordering**: Results are always ordered by `created_at DESC` (newest first). No user-configurable sort order.
- **Pagination**: Supports two pagination modes:
  - Legacy page-based: `page` (default 1, must be ≥ 1) and `per_page` (default 30, must be 1–100).
  - Cursor-based: `limit` (default 30, capped at 100) and `cursor` (zero-based offset, must be ≥ 0).
  - Both modes are simultaneously supported; legacy parameters take precedence if both are supplied.
- **Total count**: Every list response includes an `X-Total-Count` response header with the total number of matching sessions.
- **Response payload**: Each session object in the array includes: `id`, `workspace_id`, `repository_id`, `user_id`, `status`, `cols`, `rows`, `last_activity_at`, `idle_timeout_secs`, `created_at`, `updated_at`.
- **Status values**: Session `status` is one of: `pending`, `running`, `stopped`, `failed`.
- **Empty list**: When a repository has no sessions, the API returns an empty JSON array `[]` with `X-Total-Count: 0` and HTTP 200.
- **Page beyond range**: Requesting a page number beyond the total number of pages returns an empty array with the correct `X-Total-Count`.
- **No SSH info in list**: SSH connection details (host, port, access token) are never included in the list response. They require a separate authenticated request to the session SSH endpoint.

### Boundary Constraints

- **Page parameter**: Must be a positive integer. Non-numeric or ≤ 0 values return HTTP 400 with `"invalid page value"`.
- **Per-page parameter**: Must be a positive integer ≤ 100. Values > 100 return HTTP 400 with `"per_page must not exceed 100"`. Non-numeric or ≤ 0 values return HTTP 400 with `"invalid per_page value"`.
- **Limit parameter**: Must be a positive integer. Silently capped at 100. Non-numeric or ≤ 0 values return HTTP 400 with `"invalid limit value"`.
- **Cursor parameter**: Must be a non-negative integer. Non-numeric values are silently ignored (cursor defaults to 0).
- **Session ID**: UUID format (36 characters including dashes).
- **Workspace ID**: UUID format (36 characters including dashes).
- **cols field**: Integer representing terminal column count (typically 1–500). Display as-is; no validation needed on the list endpoint.
- **rows field**: Integer representing terminal row count (typically 1–200). Display as-is; no validation needed on the list endpoint.
- **idle_timeout_secs**: Non-negative integer. Default is 1800 (30 minutes).
- **Maximum sessions per repository**: No enforced hard limit at the listing layer. Pagination handles arbitrarily large session counts.
- **TUI memory cap**: The TUI displays a notice ("Showing first 200 of N") when a repository has more than 200 sessions, to prevent excessive memory consumption.

### Edge Cases

- **Repository does not exist**: Returns HTTP 404 with `"repository not found"`.
- **User has no access to repository**: Returns HTTP 403 with `"forbidden"`.
- **Unauthenticated request**: Returns HTTP 401 with `"authentication required"`.
- **Concurrent session status change**: A session's status may change between the list query and when the client renders it. Clients should handle stale status gracefully and refresh on interaction.
- **Session destroyed between list and detail fetch**: Attempting to view a session that was destroyed after listing returns 404 on the detail endpoint; the list view should remove stale entries on refresh.
- **Workspace suspended while sessions exist**: When a workspace is suspended, its running sessions transition to `stopped`. The list still includes these stopped sessions.
- **Workspace deleted while sessions exist**: All sessions for a deleted workspace should be marked as `stopped`. If cascade delete is used, they may be removed entirely and the list should reflect the new count.
- **High session churn**: Rapid session creation and destruction (e.g., agent workflows) may cause count to change between requests. Clients should not assume count stability across paginated requests.
- **Session with zero terminal dimensions**: Sessions created with `cols=0` or `rows=0` (e.g., non-interactive sessions) should still appear in the list with those values displayed.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspace/sessions`

**Authentication**: Required (session cookie or PAT).

**Query Parameters**:

| Parameter | Type | Default | Constraints | Description |
|-----------|------|---------|-------------|-------------|
| `page` | integer | 1 | ≥ 1 | Page number (legacy pagination) |
| `per_page` | integer | 30 | 1–100 | Items per page (legacy pagination) |
| `limit` | integer | 30 | 1–100 (silently capped) | Page size (cursor pagination) |
| `cursor` | integer | 0 | ≥ 0 | Offset (cursor pagination) |

**Response**: HTTP 200

```
X-Total-Count: 12
Content-Type: application/json

[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "workspace_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "repository_id": 1,
    "user_id": 7,
    "status": "running",
    "cols": 120,
    "rows": 40,
    "last_activity_at": "2026-03-22T14:15:00.000Z",
    "idle_timeout_secs": 1800,
    "created_at": "2026-03-22T10:30:00.000Z",
    "updated_at": "2026-03-22T14:15:00.000Z"
  },
  {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "workspace_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "repository_id": 1,
    "user_id": 7,
    "status": "stopped",
    "cols": 80,
    "rows": 24,
    "last_activity_at": "2026-03-22T09:00:00.000Z",
    "idle_timeout_secs": 1800,
    "created_at": "2026-03-22T08:00:00.000Z",
    "updated_at": "2026-03-22T09:30:00.000Z"
  }
]
```

**Error Responses**:

| Status | Body | Trigger |
|--------|------|--------|
| 400 | `{"message": "invalid page value"}` | `page` is non-numeric or ≤ 0 |
| 400 | `{"message": "invalid per_page value"}` | `per_page` is non-numeric or ≤ 0 |
| 400 | `{"message": "per_page must not exceed 100"}` | `per_page` > 100 |
| 400 | `{"message": "invalid limit value"}` | `limit` is non-numeric or ≤ 0 |
| 401 | `{"message": "authentication required"}` | No valid session or PAT |
| 403 | `{"message": "forbidden"}` | User lacks repository access |
| 404 | `{"message": "repository not found"}` | Owner or repo does not exist |
| 500 | `{"message": "internal server error"}` | Unhandled service error |

### SDK Shape

**Service method**: `WorkspaceService.listSessions(repositoryID: number, userID: number, page: number, perPage: number)`

**Returns**: `Promise<{ sessions: WorkspaceSessionResponse[]; total: number }>`

**Behavior**:
- Clamps `page` to minimum 1.
- Clamps `perPage` to 30 if outside 1–100.
- Calculates offset as `(page - 1) * perPage`.
- Runs list query and count query in parallel for performance.
- Maps database rows to `WorkspaceSessionResponse` objects via `toSessionResponse()`.
- Converts `Date` fields to ISO-8601 strings.
- Parses `repositoryId` and `userId` from string to integer.

**Response interface**:

```typescript
interface WorkspaceSessionResponse {
  id: string;
  workspace_id: string;
  repository_id: number;
  user_id: number;
  status: string;
  cols: number;
  rows: number;
  last_activity_at: string;
  idle_timeout_secs: number;
  created_at: string;
  updated_at: string;
}
```

### CLI Command

**Command**: `codeplane workspace sessions`

**Options**:

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--repo`, `-R` | string | No (auto-detected from cwd) | Repository in `OWNER/REPO` format |
| `--page` | integer | No (default 1) | Page number for pagination |
| `--per-page` | integer | No (default 30) | Items per page |

**Output (default)**: Tabular format with columns: ID (truncated to 8 chars), Workspace (truncated to 8 chars), Status, Cols×Rows, Last Active (relative time), Created (relative time).

```
ID        WORKSPACE  STATUS   SIZE    LAST ACTIVE    CREATED
a1b2c3d4  f47ac10b   running  120×40  2 minutes ago  4 hours ago
b2c3d4e5  f47ac10b   stopped  80×24   5 hours ago    6 hours ago
```

**Output (--json)**: Raw JSON array from the API.

**Behavior**:
- Resolves the repository reference from `--repo` flag or from the current working directory's jj/git remote.
- Makes a single `GET` request to `/api/repos/:owner/:repo/workspace/sessions`.
- Passes pagination parameters when provided.
- Exits with code 0 on success, non-zero on error.
- Displays total count from `X-Total-Count` in table footer when more results exist: `"Showing 30 of 42 sessions"`.

### TUI UI

**Screen name**: Workspace Sessions Screen

**Entry points**:
- From workspace detail screen, select "Sessions" tab or press `s`.
- `:workspace-sessions` command palette command.

**Header**: `"Sessions (N)"` where N is the total count from `X-Total-Count`.

**List columns** (responsive to terminal width):

| Breakpoint | Columns |
|------------|--------|
| 80×24 (minimum) | Status icon (2ch), ID (8ch truncated), Workspace (8ch truncated), Last Active (relative, remaining width) |
| 120×40 (standard) | Status icon, ID (8ch), Workspace (8ch), Status label (10ch), Size (7ch, e.g. "120×40"), Idle Timeout (6ch), Last Active (relative) |
| 200×60+ (large) | All above + Full Session ID (36ch), Full Workspace ID (36ch), Created at (relative), Updated at (relative) |

**Status icons**:
- `●` Green: `running`
- `●` Yellow: `pending`
- `●` Gray: `stopped`
- `●` Red: `failed`

**Key bindings**:

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | Open session detail / status stream |
| `d` | Destroy focused session (with confirmation) |
| `S` | Copy session SSH command to clipboard |
| `f` | Cycle status filter (All → Running → Pending → Stopped → Failed → All) |
| `/` | Focus search input (filters by workspace ID prefix) |
| `g g` | Jump to first row |
| `G` | Jump to last row |
| `Ctrl+D` / `Ctrl+U` | Page down / up |
| `q` | Pop screen |
| `R` | Retry fetch on error |

**Empty state**: Centered message `"No sessions"` with hint `"Sessions are created when you open a terminal in a workspace."`.

**Error state**: Centered error message with `"Press R to retry."`.

**Pagination notice**: `"Showing first 200 of N"` when total exceeds 200.

### Web UI Design

**Route**: `/:owner/:repo/workspaces/:id` (sessions tab within workspace detail)

**Layout**: Repository workbench with workspace detail as the main content area. Sessions appear as a tabbed section within the workspace detail view.

**List table columns**: Status indicator (colored dot), Session ID (truncated with copy button), Status label, Terminal Size (cols×rows), Last Active (relative time with tooltip for absolute), Idle Timeout (human-readable), Created (relative time), Actions dropdown.

**Actions dropdown per row**: View details, Copy SSH command, Destroy session.

**Filter bar**: Status dropdown filter (All, Running, Pending, Stopped, Failed).

**Empty state**: Text `"No active sessions"` with explanation `"Sessions are created when you open a terminal or connect via SSH."`.

**Pagination**: Standard page-size selector (10, 25, 50, 100) with page navigation controls. Total count displayed.

**Real-time updates**: Session statuses update in real-time via SSE for any session currently visible in the list. When a session transitions to `stopped` or `failed`, the status indicator and label update without requiring a page refresh.

### Documentation

The following user-facing documentation should be written:

- **"Managing Workspace Sessions" guide**: Explains what sessions are (terminal connections into a workspace), their lifecycle states, how to list them, and how to interpret session data like idle timeouts and terminal dimensions.
- **CLI reference for `codeplane workspace sessions`**: Documents the command, flags, output formats, and examples including JSON output and repo resolution.
- **API reference for `GET /api/repos/:owner/:repo/workspace/sessions`**: Documents request parameters, response schema, pagination, headers, and error responses.
- **TUI keyboard reference**: Documents session list keybindings within the workspace sessions screen.

## Permissions & Security

### Authorization Roles

| Role | Can list sessions? | Notes |
|------|-------------------|-------|
| Owner | ✅ Yes | Sees all sessions in the repository |
| Admin | ✅ Yes | Sees all sessions in the repository |
| Member (write) | ✅ Yes | Sees only their own sessions |
| Member (read-only) | ✅ Yes | Sees only their own sessions |
| Anonymous | ❌ No | Returns 401 |

- Session listing is always filtered by the authenticated user's ID at the database query level. A user cannot see another user's sessions unless they are an organization owner or repository admin.
- The repository must exist and the user must have at least read access to the repository.

### Rate Limiting

- **Standard rate limit**: 60 requests per minute per authenticated user for workspace session list endpoints.
- **Burst allowance**: Up to 10 requests in a 1-second window.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be included in responses.
- HTTP 429 returned when rate limit is exceeded, with `Retry-After` header.

### Data Privacy

- Session responses include `user_id`, which is an internal numeric identifier. This is acceptable as the endpoint is authenticated and scoped to the requesting user.
- `workspace_id` is a UUID that does not expose sensitive infrastructure details.
- SSH connection info (host, port, access token) is **never** included in the list response. It requires a separate authenticated request to the `/ssh` endpoint.
- Terminal dimensions (`cols`, `rows`) do not constitute PII.
- `last_activity_at` reveals activity patterns but only to the session owner or repository admins. This is acceptable for workspace management purposes.
- No PII beyond user IDs is exposed in the list response.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workspace_session.list.viewed` | User fetches workspace session list | `repository_id`, `owner`, `repo`, `user_id`, `client` (web/cli/tui/api), `result_count`, `total_count`, `page`, `per_page` |
| `workspace_session.list.filtered` | User applies a status filter (TUI/web) | `repository_id`, `user_id`, `client`, `filter_status`, `result_count` |
| `workspace_session.list.empty` | List returns zero results | `repository_id`, `user_id`, `client` |
| `workspace_session.list.paginated` | User navigates beyond page 1 | `repository_id`, `user_id`, `client`, `page`, `total_pages` |
| `workspace_session.list.action` | User takes action from session list row | `repository_id`, `user_id`, `client`, `action` (destroy/copy_ssh/view_detail), `session_id`, `session_status` |

### Funnel Metrics

- **List → Detail conversion**: Percentage of users who view session list and then open a session detail or SSH info view. Target: > 40%.
- **List → Destroy conversion**: Percentage of sessions viewed in the list that are subsequently destroyed. Indicates active resource management behavior.
- **Active session ratio**: Percentage of listed sessions in `running` status versus `stopped`/`failed`. Healthy workspace environments should show predominantly `running` sessions with periodic `stopped` cleanup.
- **List load time P95**: Time from request to response render. Target: < 500ms.
- **Session visibility**: Percentage of users with active workspaces who view the session list at least once per week. Target: > 20%. Low values may indicate the feature is undiscoverable.

### Never Log

- SSH access tokens
- Session SSH connection details (host, port)
- Raw Authorization headers or cookie values

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Trigger |
|-----------|-------|-------------------|--------|
| Session list request received | `info` | `request_id`, `repository_id`, `user_id`, `page`, `per_page`, `client_ip` | Every list request |
| Session list response sent | `info` | `request_id`, `result_count`, `total_count`, `duration_ms` | Every successful response |
| Session list pagination error | `warn` | `request_id`, `parameter`, `value`, `error_message` | Invalid pagination parameters |
| Session list auth failure | `warn` | `request_id`, `client_ip`, `reason` | 401 or 403 response |
| Session list service error | `error` | `request_id`, `error_message`, `stack_trace`, `repository_id` | 500 response |
| Session list database timeout | `error` | `request_id`, `query_name`, `duration_ms`, `repository_id` | DB query exceeds 5s |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_session_list_requests_total` | Counter | `status_code`, `client` | Total workspace session list requests |
| `codeplane_workspace_session_list_duration_seconds` | Histogram | `client` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_workspace_session_list_result_count` | Histogram | — | Number of sessions returned per request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_workspace_session_list_total_count` | Gauge | `repository_id` | Total session count per repository (sampled) |
| `codeplane_workspace_session_list_errors_total` | Counter | `error_type` (`auth`, `validation`, `internal`) | Total errors by category |

### Alerts

#### Alert: High Session List Error Rate
- **Condition**: `rate(codeplane_workspace_session_list_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check Grafana dashboard for workspace session list error rate panel.
  2. Query logs: filter by `level=error` and `event=session_list_service_error` for the last 15 minutes.
  3. Check database connectivity: verify PostgreSQL is accepting connections and not under connection pool exhaustion.
  4. Check for recent deployments that may have introduced a regression in the workspace service.
  5. If database is the root cause, check `pg_stat_activity` for long-running queries or lock contention on the `workspace_sessions` table.
  6. If the error is in the service layer, check for null pointer exceptions in `toSessionResponse` — common when DB rows have unexpected null values for `lastActivityAt` or `idleTimeoutSecs`.
  7. Verify the `listWorkspaceSessionsByRepoQuery` and `countWorkspaceSessionsByRepoQuery` execute correctly with manual test parameters.
  8. Escalate to platform team if not resolved within 15 minutes.

#### Alert: Session List Latency Degradation
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_session_list_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check Grafana dashboard for P95 latency trend.
  2. Check `codeplane_workspace_session_list_total_count` for repositories with unusually high session counts (> 5000).
  3. Verify database query plans: run `EXPLAIN ANALYZE` on `listWorkspaceSessionsByRepoQuery` with the affected `repository_id` and `user_id`.
  4. Check if the composite index on `workspace_sessions(repository_id, user_id, created_at DESC)` exists and is being used.
  5. If a specific repository is the outlier, check for session cleanup — repositories with many accumulated stopped/failed sessions may benefit from archival or purging of old sessions.
  6. Check for connection pool saturation in the database adapter layer.
  7. If latency is correlated with a specific time window, check for competing background jobs (idle session cleanup, workspace cleanup scheduler).

#### Alert: Session List Rate Limit Spike
- **Condition**: `rate(codeplane_workspace_session_list_requests_total{status_code="429"}[5m]) > 1`
- **Severity**: Warning
- **Runbook**:
  1. Identify the user(s) triggering rate limits by checking structured logs with `status_code=429`.
  2. Determine if it's a legitimate use case (agent workflow polling for session readiness) or potential abuse.
  3. If legitimate: advise the user to use the session status SSE stream (`/api/repos/:owner/:repo/workspace/sessions/:id/stream`) instead of polling the list endpoint.
  4. If abuse: review the user's account and consider temporary suspension if terms-of-service violation.
  5. Evaluate whether the rate limit threshold (60/min) needs adjustment.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Database connection lost | 500 | Internal server error | Automatic connection pool retry; alert fires if sustained |
| Database query timeout | 500 | Internal server error after 30s | Query is cancelled; investigate slow queries |
| Invalid repository owner/repo path | 404 | Repository not found | Client shows error; user corrects input |
| Repository access revoked mid-session | 403 | Forbidden on next request | Client redirects to auth or shows access denied |
| Service registry not initialized | 500 | Internal server error | Server restart required; indicates boot failure |
| Malformed pagination parameters | 400 | Validation error with specific message | Client corrects parameters |
| Repository/user ID placeholder still 0 (TODO) | 200 | Returns empty results or wrong user's sessions | Deploy fix for repo context and auth middleware wiring in workspace routes |
| `toSessionResponse` null field | 500 | Internal server error from null `.toISOString()` call | Fix DB row or add null guard in mapper |

## Verification

### API Integration Tests

- **List sessions for a repository with zero sessions**: Assert HTTP 200, empty array `[]`, `X-Total-Count: 0`.
- **List sessions for a repository with one session**: Assert HTTP 200, array with one element, all required fields present, `X-Total-Count: 1`.
- **List sessions for a repository with 5 sessions across 2 workspaces**: Assert HTTP 200, array length 5, sessions from both workspaces present, ordered by `created_at` descending, `X-Total-Count: 5`.
- **List sessions returns correct session fields**: For each session in response, verify: `id` is a UUID, `workspace_id` is a UUID, `status` is one of the valid enum values (`pending`, `running`, `stopped`, `failed`), `repository_id` is correct, `user_id` is correct, `cols` is a non-negative integer, `rows` is a non-negative integer, `idle_timeout_secs` is a non-negative integer, `last_activity_at`, `created_at`, and `updated_at` are ISO-8601 strings.
- **List sessions does NOT include SSH connection info**: Assert no `ssh_connection_info`, `host`, `port`, or `access_token` fields in any response object.
- **Default pagination returns 30 items**: Create 35 sessions, list without pagination params, assert array length is 30 and `X-Total-Count: 35`.
- **Custom per_page=10 returns 10 items**: Create 15 sessions, request with `per_page=10`, assert array length 10.
- **per_page=100 (maximum valid) returns up to 100 items**: Create 105 sessions, request with `per_page=100`, assert array length 100 and `X-Total-Count: 105`.
- **per_page=101 (exceeds maximum) returns 400**: Assert HTTP 400, message `"per_page must not exceed 100"`.
- **page=2 returns second page**: Create 35 sessions, request page 2 with per_page 30, assert 5 items returned, none overlap with page 1 results.
- **page=999 beyond range returns empty array**: Assert HTTP 200, empty array, `X-Total-Count` is correct total.
- **page=0 returns 400**: Assert HTTP 400 with `"invalid page value"`.
- **page=-1 returns 400**: Assert HTTP 400 with `"invalid page value"`.
- **page=abc (non-numeric) returns 400**: Assert HTTP 400 with `"invalid page value"`.
- **per_page=0 returns 400**: Assert HTTP 400 with `"invalid per_page value"`.
- **per_page=-5 returns 400**: Assert HTTP 400 with `"invalid per_page value"`.
- **per_page=abc returns 400**: Assert HTTP 400 with `"invalid per_page value"`.
- **Cursor-based pagination with limit=10**: Create 15 sessions, request with `limit=10&cursor=0`, assert 10 items.
- **Cursor-based pagination with cursor=10**: Request with `limit=10&cursor=10`, assert remaining 5 items.
- **limit=200 is capped to 100**: Create 105 sessions, request with `limit=200`, assert response contains at most 100 items.
- **limit=0 returns 400**: Assert HTTP 400 with `"invalid limit value"`.
- **limit=-1 returns 400**: Assert HTTP 400 with `"invalid limit value"`.
- **Legacy params take precedence over cursor params**: Send `page=1&per_page=5&limit=10`, assert only 5 items.
- **Sessions ordered by created_at DESC**: Create sessions with known order (sequential creation), assert response array order matches newest-first.
- **List only shows authenticated user's sessions**: Create sessions as user A and user B, list as user A, assert no user B sessions appear.
- **Admin user can see all sessions**: Create sessions as user A, list as repository admin, assert user A sessions are visible (if admin override is implemented).
- **Unauthenticated request returns 401**: Make request without auth, assert HTTP 401.
- **Request to non-existent repository returns 404**: Assert HTTP 404 for invalid `:owner/:repo`.
- **Session with each status appears correctly**: Create or transition sessions to each status (`pending`, `running`, `stopped`, `failed`), list, assert each status appears correctly in the response.
- **X-Total-Count header is always present**: Assert header exists on every 200 response, even for empty results.
- **X-Total-Count header is a string representation of an integer**: Parse header value, assert it's a valid non-negative integer.
- **Response Content-Type is application/json**: Assert `Content-Type` header on all responses.
- **Session last_activity_at reflects latest activity**: Create session, touch activity, list, assert `last_activity_at` is updated to the touch time.
- **Sessions across multiple workspaces in same repo all appear**: Create workspace A and workspace B in same repo, create sessions in each, list, assert sessions from both appear.
- **Destroyed session still appears in list with stopped status**: Create session, destroy it, list, assert session appears with `status: "stopped"`.
- **Session with non-standard terminal dimensions (cols=0, rows=0)**: Create a session with zero dimensions, list, assert it appears with `cols: 0` and `rows: 0`.
- **Session with large terminal dimensions (cols=500, rows=200)**: Create a session with maximum-ish dimensions, list, assert it appears with correct values.
- **Concurrent session creation during list**: Begin a list request, create a new session, verify subsequent list request includes the new session (eventual consistency check).

### CLI E2E Tests

- **`codeplane workspace sessions` with --json returns valid JSON array**: Create a session, run `codeplane workspace sessions --json`, parse output as JSON, assert it's an array containing the created session.
- **`codeplane workspace sessions` includes created session**: Create workspace and session, list sessions, assert result contains session with matching ID and workspace_id.
- **`codeplane workspace sessions` with --repo flag**: Run `codeplane workspace sessions --repo owner/repo --json`, assert successful output.
- **`codeplane workspace sessions` auto-detects repo from cwd**: From inside a cloned repository directory, run `codeplane workspace sessions`, assert it resolves the correct repository.
- **`codeplane workspace sessions` exits with code 0 on success**: Assert exit code 0.
- **`codeplane workspace sessions` exits with non-zero on auth failure**: Run without valid auth, assert non-zero exit code and error message.
- **`codeplane workspace sessions` with invalid --repo format**: Run with `--repo invalid`, assert error message about repository format.
- **`codeplane workspace sessions` displays table format by default**: Assert output contains column headers (ID, WORKSPACE, STATUS, SIZE, LAST ACTIVE, CREATED).
- **`codeplane workspace sessions` shows session count footer**: Create 35 sessions, list with default pagination, assert footer shows `"Showing 30 of 35 sessions"`.
- **`codeplane workspace sessions` reflects lifecycle changes**: Create session, list (assert running), destroy session, list (assert stopped).
- **`codeplane workspace sessions --page 2 --per-page 5`**: Create 10 sessions, assert page 2 returns 5 sessions different from page 1.

### TUI E2E Tests

- **Sessions screen renders with correct header**: Navigate to workspace sessions screen, assert `"Sessions (N)"` header with correct count.
- **Sessions screen shows session rows**: Assert each session row displays ID (truncated), status icon, and last active time.
- **Empty sessions list shows empty state message**: Navigate to sessions for a workspace with no sessions, assert `"No sessions"` message.
- **Status filter cycles through values**: Press `f` repeatedly, assert filter label changes through All → Running → Pending → Stopped → Failed → All.
- **Status filter filters the displayed list**: Create sessions in different states, apply "Running" filter, assert only running sessions are shown.
- **Navigation with j/k moves selection**: Press `j` to move down, `k` to move up, assert selection indicator moves.
- **Enter opens session detail**: Select a session, press Enter, assert session detail/stream screen is shown.
- **'d' key triggers destroy confirmation**: Press `d` on a session, assert confirmation prompt appears.
- **'S' key copies SSH command**: Press `S` on a running session, assert clipboard contains SSH command.
- **Pagination notice appears for large lists**: With > 200 sessions, assert `"Showing first 200 of N"` notice.
- **'q' key pops screen**: Press `q`, assert return to previous screen.
- **'R' key retries on error**: Simulate error, press `R`, assert retry fetch is triggered.

### Playwright (Web UI) E2E Tests

- **Session list tab loads within workspace detail**: Navigate to `/:owner/:repo/workspaces/:id`, click Sessions tab, assert session table renders.
- **Session list shows total count**: Assert session count is displayed near the table header.
- **Session list shows empty state for workspace with no sessions**: Assert empty state message and explanation text.
- **Status filter dropdown filters the list**: Select "Running" from filter, assert only running sessions visible.
- **Pagination controls navigate pages**: Click "Next page", assert new page of results loads.
- **Page size selector changes results per page**: Change page size to 10, assert 10 rows displayed.
- **Session row shows correct status indicator color**: Assert running session has green indicator, stopped has gray, failed has red.
- **Actions dropdown opens on click**: Click actions button on a session row, assert dropdown with View/Copy SSH/Destroy options.
- **Destroy action shows confirmation dialog**: Click Destroy in actions dropdown, assert confirmation dialog appears with session ID.
- **Copy SSH command action**: Click "Copy SSH command" in actions dropdown, assert clipboard populated (or toast confirmation shown).
- **Real-time status update via SSE**: Destroy a session via API, assert the list view updates status to "stopped" without page refresh.
- **Session ID has copy button**: Hover over truncated session ID, assert copy icon appears and clicking copies full UUID.

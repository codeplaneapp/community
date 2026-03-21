# WORKSPACE_LIST

Specification for WORKSPACE_LIST.

## High-Level User POV

When working on a repository in Codeplane, developers need to see all the development workspaces associated with that repository. A workspace is a cloud-backed coding environment — like having a persistent dev machine that can be started, paused, resumed, and shared. The workspace list is the central inventory that answers the question: "What workspaces exist for this repo, and what state are they in?"

From the web, TUI, or CLI, a user navigates to a repository's workspaces view and sees a list of all workspaces they have access to. Each workspace in the list shows its name, current status (running, suspended, pending, failed, stopped), how long ago it was last active, and key configuration like its idle timeout and persistence mode. The list is ordered newest-first so the most recently created workspaces appear at the top.

Users can filter the list by workspace status — for example, showing only running workspaces to find which ones are consuming resources, or only suspended workspaces to find one to resume. A text search further narrows the view by workspace name. From the list, users can take quick actions: open a workspace's detail view, suspend or resume it, delete it, or copy its SSH connection command.

For teams using AI agents or working across multiple feature branches, the workspace list is the control panel that prevents resource sprawl and provides situational awareness over all active coding environments. The list supports pagination so that even repositories with many workspaces remain performant and navigable.

## Acceptance Criteria

### Definition of Done

- A user can retrieve a paginated list of workspaces scoped to a specific repository from API, CLI, TUI, and web surfaces.
- The list returns accurate, real-time status for each workspace.
- Pagination, filtering, and sorting behave consistently across all clients.
- Empty states are handled gracefully with clear messaging.
- Error states are handled with actionable error messages.

### Functional Constraints

- **Scope**: Workspace list is always scoped to a single repository (`/:owner/:repo/workspaces`). There is no cross-repository workspace listing endpoint.
- **Ordering**: Results are always ordered by `created_at DESC` (newest first). No user-configurable sort order.
- **Pagination**: Supports two pagination modes:
  - Legacy page-based: `page` (default 1, must be ≥ 1) and `per_page` (default 30, must be 1–100).
  - Cursor-based: `limit` (default 30, capped at 100) and `cursor` (zero-based offset, must be ≥ 0).
  - Both modes are simultaneously supported; legacy parameters take precedence if both are supplied.
- **Total count**: Every list response includes an `X-Total-Count` response header with the total number of matching workspaces.
- **Response payload**: Each workspace object in the array includes: `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`. Optional fields (`parent_workspace_id`, `ssh_host`, `snapshot_id`) are included only when non-empty.
- **Status values**: Workspace `status` is one of: `pending`, `starting`, `running`, `suspended`, `stopped`, `failed`.
- **Empty list**: When a repository has no workspaces, the API returns an empty JSON array `[]` with `X-Total-Count: 0` and HTTP 200.
- **Page beyond range**: Requesting a page number beyond the total number of pages returns an empty array with the correct `X-Total-Count`.

### Boundary Constraints

- **Page parameter**: Must be a positive integer. Non-numeric or ≤ 0 values return HTTP 400 with `"invalid page value"`.
- **Per-page parameter**: Must be a positive integer ≤ 100. Values > 100 return HTTP 400 with `"per_page must not exceed 100"`. Non-numeric or ≤ 0 values return HTTP 400 with `"invalid per_page value"`.
- **Limit parameter**: Must be a positive integer. Silently capped at 100. Non-numeric or ≤ 0 values return HTTP 400 with `"invalid limit value"`.
- **Cursor parameter**: Must be a non-negative integer. Non-numeric values are silently ignored (cursor defaults to 0).
- **Workspace name**: 1–63 characters, pattern `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`. (Relevant for display truncation in list views.)
- **Workspace ID**: UUID format (36 characters including dashes).
- **Maximum workspaces per repository**: No enforced hard limit at the listing layer. Pagination handles arbitrarily large workspace counts.
- **TUI memory cap**: The TUI displays a notice ("Showing first 200 of N") when a repository has more than 200 workspaces, to prevent excessive memory consumption.

### Edge Cases

- **Repository does not exist**: Returns HTTP 404 with `"repository not found"`.
- **User has no access to repository**: Returns HTTP 403 with `"forbidden"`.
- **Unauthenticated request**: Returns HTTP 401 with `"authentication required"`.
- **Concurrent workspace status change**: A workspace's status may change between the list query and when the client renders it. Clients should handle stale status gracefully and refresh on interaction.
- **Workspace deleted between list and detail fetch**: Attempting to view a workspace that was deleted after listing returns 404 on the detail endpoint; the list view should remove stale entries on refresh.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspaces`

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
X-Total-Count: 42
Content-Type: application/json

[
  {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "repository_id": 1,
    "user_id": 7,
    "name": "feature-auth",
    "status": "running",
    "is_fork": false,
    "freestyle_vm_id": "vm-abc123def456",
    "persistence": "persistent",
    "idle_timeout_seconds": 1800,
    "suspended_at": null,
    "created_at": "2026-03-22T10:30:00.000Z",
    "updated_at": "2026-03-22T14:15:00.000Z",
    "ssh_host": "vm-abc123def456@ssh.codeplane.dev",
    "parent_workspace_id": "e23dc10b-48bb-4372-a567-0e02b2c3d480",
    "snapshot_id": "snap-001"
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

**Service method**: `WorkspaceService.listWorkspaces(repositoryID: number, userID: number, page: number, perPage: number)`

**Returns**: `Promise<{ workspaces: WorkspaceResponse[]; total: number }>`

**Behavior**:
- Clamps `page` to minimum 1.
- Clamps `perPage` to 30 if outside 1–100.
- Calculates offset as `(page - 1) * perPage`.
- Runs list query and count query in parallel for performance.
- Maps database rows to `WorkspaceResponse` objects including conditional optional fields.

### CLI Command

**Command**: `codeplane workspace list`

**Options**:

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--repo`, `-R` | string | No (auto-detected from cwd) | Repository in `OWNER/REPO` format |

**Output (default)**: Tabular format with columns: Name, Status, ID (truncated), Created.

**Output (--json)**: Raw JSON array from the API.

**Behavior**:
- Resolves the repository reference from `--repo` flag or from the current working directory's jj/git remote.
- Makes a single `GET` request to `/api/repos/:owner/:repo/workspaces`.
- Does not currently pass pagination parameters (fetches the first page of 30).
- Exits with code 0 on success, non-zero on error.

### TUI UI

**Screen name**: Workspace List Screen

**Entry points**:
- `g w` go-to navigation keybinding
- `:workspaces` command palette command
- `--screen workspaces --repo owner/repo` deep-link argument

**Header**: `"Workspaces (N)"` where N is the total count from `X-Total-Count`.

**Filter toolbar**:
- Status cycle filter (toggled with `f`): All → Running → Suspended → Pending → Failed → Stopped → All.
- Text search input (activated with `/`): Client-side substring match on workspace name.

**List columns** (responsive to terminal width):

| Breakpoint | Columns |
|------------|--------|
| 80×24 (minimum) | Status icon (2ch), Name (remaining, truncated with `…`), Timestamp (4ch relative) |
| 120×40 (standard) | Status icon, Name (30ch), Status label (12ch), Owner (15ch), Idle timeout (8ch), Timestamp (4ch) |
| 200×60+ (large) | All above + Workspace ID (12ch truncated), Suspended at (12ch), Created at (12ch) |

**Status icons**:
- `●` Green: `running`
- `●` Yellow: `pending`, `starting`
- `●` Gray: `suspended`
- `●` Red: `failed`, `stopped`

**Key bindings**:

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | Open workspace detail |
| `/` | Focus search input |
| `f` | Cycle status filter |
| `c` | Create new workspace |
| `p` | Suspend focused workspace |
| `r` | Resume focused workspace |
| `d` | Delete focused workspace (with confirmation) |
| `S` | Copy SSH command to clipboard |
| `g g` | Jump to first row |
| `G` | Jump to last row |
| `Ctrl+D` / `Ctrl+U` | Page down / up |
| `q` | Pop screen |
| `R` | Retry fetch on error |

**Empty state**: Centered message `"No workspaces"` with hint `"Press c to create one."`.

**Error state**: Centered error message with `"Press R to retry."`.

**Pagination notice**: `"Showing first 200 of N"` when total exceeds 200.

### Web UI Design

**Route**: `/:owner/:repo/workspaces`

**Layout**: Repository workbench with workspace list as the main content area.

**List table columns**: Status indicator, Name, Status label, Persistence mode, Idle timeout, Created (relative time), Actions dropdown.

**Actions dropdown per row**: View details, Suspend/Resume (context-sensitive), Copy SSH command, Delete.

**Filter bar**: Status dropdown filter, text search input.

**Empty state**: Illustration with text `"No workspaces yet"` and a prominent "Create workspace" button.

**Pagination**: Standard page-size selector (10, 25, 50, 100) with page navigation controls. Total count displayed.

**Real-time updates**: Workspace statuses update in real-time via SSE for any workspace currently visible in the list.

### Documentation

The following user-facing documentation should be written:

- **"Managing Workspaces" guide**: Explains what workspaces are, how to list them, and how to interpret status values.
- **CLI reference for `codeplane workspace list`**: Documents the command, flags, output formats, and examples including JSON output and repo resolution.
- **API reference for `GET /api/repos/:owner/:repo/workspaces`**: Documents request parameters, response schema, pagination, headers, and error responses.
- **TUI keyboard reference**: Documents workspace list keybindings.

## Permissions & Security

### Authorization Roles

| Role | Can list workspaces? | Notes |
|------|---------------------|-------|
| Owner | ✅ Yes | Sees all workspaces in the repository |
| Admin | ✅ Yes | Sees all workspaces in the repository |
| Member (write) | ✅ Yes | Sees only their own workspaces |
| Member (read-only) | ✅ Yes | Sees only their own workspaces |
| Anonymous | ❌ No | Returns 401 |

- Workspace listing is always filtered by the authenticated user's ID. A user cannot see another user's workspaces unless they are an organization owner or repository admin.
- The repository must exist and the user must have at least read access to the repository.

### Rate Limiting

- **Standard rate limit**: 60 requests per minute per authenticated user for workspace list endpoints.
- **Burst allowance**: Up to 10 requests in a 1-second window.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be included in responses.
- HTTP 429 returned when rate limit is exceeded, with `Retry-After` header.

### Data Privacy

- Workspace responses include `user_id`, which is an internal numeric identifier. This is acceptable as the endpoint is authenticated and scoped to the requesting user.
- `freestyle_vm_id` is an opaque infrastructure identifier. It does not expose sensitive infrastructure topology.
- SSH connection info (host, port, access token) is NOT included in the list response. It requires a separate authenticated request to the `/ssh` endpoint.
- No PII beyond user IDs and workspace names is exposed in the list response.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workspace.list.viewed` | User fetches workspace list | `repository_id`, `owner`, `repo`, `user_id`, `client` (web/cli/tui/api), `result_count`, `total_count`, `page`, `per_page`, `has_filter` |
| `workspace.list.filtered` | User applies a status filter (TUI/web) | `repository_id`, `user_id`, `client`, `filter_status`, `result_count` |
| `workspace.list.searched` | User performs text search (TUI/web) | `repository_id`, `user_id`, `client`, `query_length`, `result_count` |
| `workspace.list.empty` | List returns zero results | `repository_id`, `user_id`, `client`, `has_filter` |
| `workspace.list.paginated` | User navigates beyond page 1 | `repository_id`, `user_id`, `client`, `page`, `total_pages` |

### Funnel Metrics

- **List → Detail conversion**: Percentage of users who view workspace list and then open a workspace detail view. Target: > 60%.
- **List → Create conversion**: Percentage of users who view an empty workspace list and then create a workspace. Target: > 30%.
- **Active workspace ratio**: Percentage of listed workspaces in `running` status. Indicates platform utilization health.
- **List load time P95**: Time from request to response render. Target: < 500ms.
- **Pagination depth**: Average and P95 page number accessed. High values may indicate need for better search/filter.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Trigger |
|-----------|-------|-------------------|--------|
| Workspace list request received | `info` | `request_id`, `repository_id`, `user_id`, `page`, `per_page`, `client_ip` | Every list request |
| Workspace list response sent | `info` | `request_id`, `result_count`, `total_count`, `duration_ms` | Every successful response |
| Workspace list pagination error | `warn` | `request_id`, `parameter`, `value`, `error_message` | Invalid pagination parameters |
| Workspace list auth failure | `warn` | `request_id`, `client_ip`, `reason` | 401 or 403 response |
| Workspace list service error | `error` | `request_id`, `error_message`, `stack_trace`, `repository_id` | 500 response |
| Workspace list database timeout | `error` | `request_id`, `query`, `duration_ms`, `repository_id` | DB query exceeds 5s |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_list_requests_total` | Counter | `status_code`, `client` | Total workspace list requests |
| `codeplane_workspace_list_duration_seconds` | Histogram | `client` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_workspace_list_result_count` | Histogram | — | Number of workspaces returned per request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_workspace_list_total_count` | Gauge | `repository_id` | Total workspace count per repository (sampled) |
| `codeplane_workspace_list_errors_total` | Counter | `error_type` (`auth`, `validation`, `internal`) | Total errors by category |

### Alerts

#### Alert: High Workspace List Error Rate
- **Condition**: `rate(codeplane_workspace_list_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check Grafana dashboard for workspace list error rate panel.
  2. Query logs: filter by `level=error` and `event=workspace_list_service_error` for the last 15 minutes.
  3. Check database connectivity: verify PostgreSQL is accepting connections and not under connection pool exhaustion.
  4. Check for recent deployments that may have introduced a regression.
  5. If database is the root cause, check `pg_stat_activity` for long-running queries or lock contention.
  6. If the error is in the workspace service layer, check for null pointer exceptions in `toWorkspaceResponse` (common when DB migration adds a new non-nullable column).
  7. Escalate to platform team if not resolved within 15 minutes.

#### Alert: Workspace List Latency Degradation
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_list_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check Grafana dashboard for P95 latency trend.
  2. Check `codeplane_workspace_list_total_count` for repositories with unusually high workspace counts (> 1000).
  3. Verify database query plans: run `EXPLAIN ANALYZE` on `listWorkspacesByRepoQuery` with the affected `repository_id`.
  4. Check if the `idx_workspaces_repo_user_created` index exists and is being used.
  5. If a specific repository is the outlier, consider whether a workspace cleanup (stale/stopped workspaces) is needed.
  6. Check for connection pool saturation in the database adapter layer.

#### Alert: Workspace List Rate Limit Spike
- **Condition**: `rate(codeplane_workspace_list_requests_total{status_code="429"}[5m]) > 1`
- **Severity**: Warning
- **Runbook**:
  1. Identify the user(s) triggering rate limits by checking structured logs with `status_code=429`.
  2. Determine if it's a legitimate use case (CI automation polling) or potential abuse.
  3. If legitimate: consider providing the user with webhook-based workspace status notifications instead of polling.
  4. If abuse: review the user's account and consider temporary suspension if terms-of-service violation.
  5. Evaluate whether the rate limit threshold (60/min) needs adjustment based on usage patterns.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Database connection lost | 500 | Internal server error | Automatic connection pool retry; alert fires if sustained |
| Database query timeout | 500 | Internal server error after 30s | Query is cancelled; investigate slow queries |
| Invalid repository owner/repo path | 404 | Repository not found | Client shows error; user corrects input |
| Repository access revoked mid-session | 403 | Forbidden on next request | Client redirects to auth or shows access denied |
| Service registry not initialized | 500 | Internal server error | Server restart required; indicates boot failure |
| Malformed pagination parameters | 400 | Validation error with specific message | Client corrects parameters |
| SSE connection dropped (TUI/web real-time) | — | Client reconnects with exponential backoff | Automatic; user sees brief "reconnecting" indicator |

## Verification

### API Integration Tests

- **List workspaces for a repository with zero workspaces**: Assert HTTP 200, empty array `[]`, `X-Total-Count: 0`.
- **List workspaces for a repository with one workspace**: Assert HTTP 200, array with one element, all required fields present, `X-Total-Count: 1`.
- **List workspaces for a repository with 5 workspaces**: Assert HTTP 200, array length 5, ordered by `created_at` descending, `X-Total-Count: 5`.
- **List workspaces returns correct workspace fields**: For each workspace in response, verify: `id` is a UUID, `name` matches creation name, `status` is one of the valid enum values, `repository_id` is correct, `user_id` is correct, `is_fork` is boolean, `persistence` is a string, `idle_timeout_seconds` is a number, `created_at` and `updated_at` are ISO-8601 strings, `suspended_at` is null or ISO-8601.
- **List workspaces includes optional fields only when non-empty**: Create a workspace with no parent — assert `parent_workspace_id` is absent. Fork a workspace — assert `parent_workspace_id` is present.
- **List workspaces includes `ssh_host` only when VM ID is set**: Assert `ssh_host` is present when `freestyle_vm_id` is non-empty.
- **List workspaces includes `snapshot_id` only when source snapshot exists**: Create workspace from snapshot — assert `snapshot_id` is present. Create workspace without snapshot — assert `snapshot_id` is absent.
- **Default pagination returns 30 items**: Create 35 workspaces, list without pagination params, assert array length is 30 and `X-Total-Count: 35`.
- **Custom per_page=10 returns 10 items**: Create 15 workspaces, request with `per_page=10`, assert array length 10.
- **per_page=100 (maximum valid) returns up to 100 items**: Create 105 workspaces, request with `per_page=100`, assert array length 100 and `X-Total-Count: 105`.
- **per_page=101 (exceeds maximum) returns 400**: Assert HTTP 400, message `"per_page must not exceed 100"`.
- **page=2 returns second page**: Create 35 workspaces, request page 2 with per_page 30, assert 5 items returned, none overlap with page 1.
- **page=999 beyond range returns empty array**: Assert HTTP 200, empty array, `X-Total-Count` is correct total.
- **page=0 returns 400**: Assert HTTP 400 with `"invalid page value"`.
- **page=-1 returns 400**: Assert HTTP 400 with `"invalid page value"`.
- **page=abc (non-numeric) returns 400**: Assert HTTP 400 with `"invalid page value"`.
- **per_page=0 returns 400**: Assert HTTP 400 with `"invalid per_page value"`.
- **per_page=-5 returns 400**: Assert HTTP 400 with `"invalid per_page value"`.
- **per_page=abc returns 400**: Assert HTTP 400 with `"invalid per_page value"`.
- **Cursor-based pagination with limit=10**: Create 15 workspaces, request with `limit=10&cursor=0`, assert 10 items.
- **Cursor-based pagination with cursor=10**: Request with `limit=10&cursor=10`, assert remaining items.
- **limit=200 is capped to 100**: Assert response contains at most 100 items.
- **limit=0 returns 400**: Assert HTTP 400 with `"invalid limit value"`.
- **limit=-1 returns 400**: Assert HTTP 400 with `"invalid limit value"`.
- **Legacy params take precedence over cursor params**: Send `page=1&per_page=5&limit=10`, assert only 5 items.
- **Workspaces ordered by created_at DESC**: Create workspaces with known order, assert response array order matches newest-first.
- **List only shows authenticated user's workspaces**: Create workspaces as user A and user B, list as user A, assert no user B workspaces appear.
- **Unauthenticated request returns 401**: Make request without auth, assert HTTP 401.
- **Request to non-existent repository returns 404**: Assert HTTP 404 for invalid `:owner/:repo`.
- **Workspace with each status appears correctly**: Create or transition workspaces to each status (`pending`, `starting`, `running`, `suspended`, `stopped`, `failed`), list, assert each status appears correctly.
- **X-Total-Count header is always present**: Assert header exists on every 200 response, even for empty results.
- **X-Total-Count header is a string representation of an integer**: Parse header value, assert it's a valid non-negative integer.
- **Response Content-Type is application/json**: Assert `Content-Type` header.
- **Suspended workspace shows suspended_at timestamp**: Suspend a workspace, list, assert `suspended_at` is a non-null ISO-8601 string.
- **Running workspace shows suspended_at as null**: Assert `suspended_at` is `null` for running workspaces.

### CLI E2E Tests

- **`codeplane workspace list` with --json returns valid JSON array**: Create a workspace, run `codeplane workspace list --json`, parse output as JSON, assert it's an array containing the created workspace.
- **`codeplane workspace list` includes created workspace**: Create workspace with name "cli-ws", list, assert result contains workspace with matching name and ID.
- **`codeplane workspace list` with --repo flag**: Run `codeplane workspace list --repo owner/repo --json`, assert successful output.
- **`codeplane workspace list` auto-detects repo from cwd**: From inside a cloned repository directory, run `codeplane workspace list`, assert it resolves the correct repository.
- **`codeplane workspace list` exits with code 0 on success**: Assert exit code 0.
- **`codeplane workspace list` exits with non-zero on auth failure**: Run without valid auth, assert non-zero exit code and error message.
- **`codeplane workspace list` with invalid --repo format**: Run with `--repo invalid`, assert error message about repository format.
- **`codeplane workspace list` reflects lifecycle changes**: Create workspace, list (assert running), suspend, list (assert suspended), resume, list (assert running), delete, list (assert workspace absent).

### TUI E2E Tests

- **Workspace list screen renders with correct header**: Navigate to workspaces screen, assert `"Workspaces (N)"` header with correct count.
- **Workspace list screen shows workspace rows**: Assert each workspace row displays name, status icon, and timestamp.
- **Empty workspace list shows empty state message**: Navigate to workspaces for a repo with no workspaces, assert `"No workspaces"` message.
- **Status filter cycles through values**: Press `f` repeatedly, assert filter label changes through All → Running → Suspended → Pending → Failed → Stopped → All.
- **Status filter filters the displayed list**: Create workspaces in different states, apply "Running" filter, assert only running workspaces are shown.
- **Text search filters by workspace name**: Type in search, assert only workspaces matching the substring are displayed.
- **Navigation with j/k moves selection**: Press `j` to move down, `k` to move up, assert selection indicator moves.
- **Enter opens workspace detail**: Select a workspace, press Enter, assert workspace detail screen is shown.
- **'c' key opens create workspace form**: Press `c`, assert create workspace form is displayed.
- **'d' key triggers delete confirmation**: Press `d` on a workspace, assert confirmation prompt appears.
- **'S' key copies SSH command**: Press `S` on a running workspace, assert clipboard contains SSH command.
- **Pagination notice appears for large lists**: With > 200 workspaces, assert `"Showing first 200 of N"` notice.

### Playwright (Web UI) E2E Tests

- **Workspace list page loads**: Navigate to `/:owner/:repo/workspaces`, assert page renders with workspace table.
- **Workspace list page shows total count**: Assert workspace count is displayed.
- **Workspace list page shows empty state for new repo**: Assert empty state illustration and "Create workspace" CTA.
- **Status filter dropdown filters the list**: Select "Running" from filter, assert only running workspaces visible.
- **Text search filters by name**: Type a workspace name in search, assert filtered results.
- **Pagination controls navigate pages**: Click "Next page", assert new page of results loads.
- **Page size selector changes results per page**: Change page size to 10, assert 10 rows displayed.
- **Workspace row shows correct status indicator color**: Assert running workspace has green indicator, suspended has gray.
- **Actions dropdown opens on click**: Click actions button on a workspace row, assert dropdown with View/Suspend/Resume/Delete options.
- **Clicking workspace name navigates to detail**: Click a workspace name, assert navigation to `/:owner/:repo/workspaces/:id`.
- **Real-time status update via SSE**: Suspend a workspace via API, assert the list view updates status without page refresh.

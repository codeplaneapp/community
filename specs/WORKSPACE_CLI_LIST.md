# WORKSPACE_CLI_LIST

Specification for WORKSPACE_CLI_LIST.

## High-Level User POV

When working with Codeplane workspaces from the command line, developers need a quick way to see all their active workspaces for a given repository. The `codeplane workspace list` command gives users a clear, scannable view of every workspace associated with a repository — showing its name, current status, whether it's a fork, and when it was last updated.

Today, this command exists but returns raw JSON without pagination controls, filtering, or human-friendly formatting. The improved experience should match the polish level of other list commands in the CLI (like `issue list` and `repo list`), giving users a formatted table by default, optional JSON output for scripting, pagination for repositories with many workspaces, and status-based filtering so they can quickly find running workspaces or suspended ones they may want to clean up.

A typical workflow looks like this: a developer runs `codeplane workspace list` from inside their repository checkout, immediately sees a table of their workspaces, spots the one that's running, and then follows up with `codeplane workspace ssh <id>` to connect. For automation scripts or agent-driven workflows, the developer uses `codeplane workspace list --json` to get structured output that's easy to parse programmatically.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane workspace list` displays a formatted table of workspaces for the resolved repository
- [ ] The table columns are: **ID**, **Name**, **Status**, **Fork**, **Created**
- [ ] When no workspaces exist, the command prints `No workspaces found` and exits with code 0
- [ ] The command supports `--page` (default: 1) and `--limit` (default: 30) pagination flags
- [ ] The command supports `--status` filtering (values: `running`, `suspended`, `starting`, `stopped`, `failed`, `all`; default: `all`)
- [ ] The command supports `--repo OWNER/REPO` to target a specific repository
- [ ] When `--repo` is omitted, the repository is resolved from the local jj/git remote
- [ ] When `--json` or `--format json` is provided, the command returns the raw API JSON array
- [ ] When `--json <field>` is provided, the output is filtered to the specified field path
- [ ] The `X-Total-Count` response header is used to display pagination context when results are paginated
- [ ] The command exits with code 0 on success and non-zero on error
- [ ] Auth errors (401/403) produce a clear message directing the user to `codeplane auth login`
- [ ] Network errors produce a clear, actionable error message
- [ ] The `--limit` value is clamped to a maximum of 100 (server-enforced); values above 100 are rejected by the server with a clear error message
- [ ] The `--page` value must be ≥ 1; values ≤ 0 produce a validation error before the request is sent

### Edge Cases

- [ ] Repository with zero workspaces → prints `No workspaces found`
- [ ] Repository with exactly 1 workspace → prints a single-row table (no off-by-one in formatting)
- [ ] Repository with exactly 100 workspaces and `--limit 100` → all displayed in one page
- [ ] `--limit 101` → server returns 400 error; CLI surfaces the error message clearly
- [ ] `--limit 0` → CLI validation error before sending request
- [ ] `--limit -1` → CLI validation error before sending request
- [ ] `--page 0` → CLI validation error before sending request
- [ ] `--page 999` (beyond total pages) → empty result, prints `No workspaces found`
- [ ] Workspace names containing special characters (quotes, newlines, unicode) → table renders without breaking alignment
- [ ] Workspace names that are empty strings → table renders with empty cell
- [ ] Workspace names at maximum length (255 characters) → table renders (column width adjusts)
- [ ] Mixed statuses in result set → all statuses rendered correctly
- [ ] `--status running` when no running workspaces exist → prints `No workspaces found`
- [ ] `--repo` pointing to a non-existent repository → 404 error with clear message
- [ ] `--repo` pointing to a repository the user doesn't have access to → 403 error with clear message
- [ ] Unauthenticated user → 401 error with login prompt message
- [ ] Network timeout → descriptive error, non-zero exit code
- [ ] Server returns 500 → descriptive error, non-zero exit code

### Boundary Constraints

- `--limit`: integer, minimum 1, maximum 100, default 30
- `--page`: integer, minimum 1, no maximum (server returns empty if out of range), default 1
- `--status`: one of `running`, `suspended`, `starting`, `stopped`, `failed`, `all`; default `all`
- `--repo`: string in `OWNER/REPO` format, or omitted for auto-detection
- Workspace name display: no truncation; table auto-sizes columns
- Workspace ID display: full UUID string

## Design

### CLI Command

**Command**: `codeplane workspace list`

**Synopsis**:
```
codeplane workspace list [--repo OWNER/REPO] [--status STATUS] [--page N] [--limit N] [--json [FIELD]]
```

**Options**:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | auto-detect | Repository in `OWNER/REPO` format |
| `--status` | enum | `all` | Filter by workspace status: `running`, `suspended`, `starting`, `stopped`, `failed`, `all` |
| `--page` | number | `1` | Page number for pagination |
| `--limit` | number | `30` | Maximum results per page (max: 100) |
| `--json` | flag/string | — | Output raw JSON; optionally filter to a field path |
| `--format` | string | `table` | Output format (`table`, `json`, `toon`) |

**Table Output** (default):

```
ID                                    Name           Status     Fork   Created
------------------------------------  -------------  ---------  -----  --------------------
a1b2c3d4-e5f6-7890-abcd-ef1234567890  my-workspace   running    no     2026-03-22T10:30:00Z
b2c3d4e5-f6a7-8901-bcde-f12345678901  feature-ws     suspended  no     2026-03-21T14:15:00Z
c3d4e5f6-a7b8-9012-cdef-123456789012  fork-of-main   running    yes    2026-03-20T09:00:00Z
```

**Empty Output**:
```
No workspaces found
```

**JSON Output** (`--json`):
```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "my-workspace",
    "status": "running",
    "is_fork": false,
    "repository_id": 42,
    "user_id": 7,
    "persistence": "persistent",
    "idle_timeout_seconds": 1800,
    "suspended_at": null,
    "created_at": "2026-03-22T10:30:00Z",
    "updated_at": "2026-03-22T10:30:00Z"
  }
]
```

**Pagination Footer** (displayed when total exceeds displayed count, in table mode only):
```
Showing 1-30 of 45 workspaces (page 1)
```

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspaces`

**Query Parameters**:
- `page` (integer, optional): Page number, default 1
- `per_page` (integer, optional): Items per page, default 30, max 100
- `status` (string, optional): Filter by workspace status (`running`, `suspended`, `starting`, `stopped`, `failed`; omit for all)

**Response Headers**:
- `X-Total-Count`: Total number of workspaces matching the query

**Response Body**: JSON array of `WorkspaceResponse` objects.

**Error Responses**:
- `400`: Invalid pagination parameters
- `401`: Not authenticated
- `403`: Insufficient permissions
- `404`: Repository not found

### SDK Shape

The `@codeplane/sdk` workspace service method signature should be extended to:
```
listWorkspaces(repositoryID, userID, page, perPage, statusFilter?) → { workspaces: WorkspaceResponse[]; total: number }
```

The optional `statusFilter` parameter adds a `WHERE status = $N` clause when provided and not `"all"`.

### Output Formatter

A new `formatWorkspaceList` function should be added to `apps/cli/src/output.ts`:

- Accept an array of workspace JSON records
- Return `No workspaces found` for empty arrays
- Map each workspace to a row: `[id, name, status, is_fork ? "yes" : "no", created_at]`
- Render via the existing `formatTable` utility with headers: `["ID", "Name", "Status", "Fork", "Created"]`

### Documentation

**CLI help text** (via `--help`):
```
List workspaces for a repository

Usage: codeplane workspace list [options]

Options:
  --repo <OWNER/REPO>   Repository (default: auto-detect from local checkout)
  --status <STATUS>     Filter by status: running, suspended, starting, stopped, failed, all (default: all)
  --page <N>            Page number (default: 1)
  --limit <N>           Results per page, max 100 (default: 30)
  --json [FIELD]        Output as JSON, optionally filtered to FIELD
  --format <FORMAT>     Output format: table, json, toon (default: table)
```

**User documentation** should include:
- A "Listing workspaces" section in the CLI workspace documentation
- Examples: basic usage, status filtering, pagination, JSON output for scripting
- A note that workspaces are scoped to the authenticated user and specified repository

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Repository Owner** | Can list all their own workspaces for the repository |
| **Repository Admin** | Can list all their own workspaces for the repository |
| **Repository Member (Write)** | Can list their own workspaces for the repository |
| **Repository Member (Read)** | Can list their own workspaces for the repository |
| **Anonymous / Unauthenticated** | Denied (401) |
| **Authenticated, no repo access** | Denied (403) |

Workspace listing is scoped to the authenticated user. A user cannot see another user's workspaces for the same repository. This is enforced at the service layer via the `user_id` parameter in the database query.

### Rate Limiting

- Standard API rate limit applies (shared with other API endpoints)
- No special elevated or reduced rate limit for workspace listing
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be respected by the CLI and surfaced to the user when limits are approached

### Data Privacy

- Workspace IDs are UUIDs and not considered PII
- Workspace names are user-generated and may contain PII; they should not be logged at INFO level on the server
- The `freestyle_vm_id` is an internal infrastructure identifier and should be included in the response (needed for SSH flows) but should not be logged in telemetry events
- The `ssh_host` field may expose internal infrastructure hostnames; acceptable for authenticated users who own the workspace

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceListViewed` | Successful workspace list API response | `repository_id`, `user_id`, `total_count`, `page`, `per_page`, `status_filter`, `client` (`cli`, `web`, `tui`), `output_format` (`table`, `json`, `toon`) |
| `WorkspaceListEmpty` | Successful response with zero results | `repository_id`, `user_id`, `status_filter`, `client` |
| `WorkspaceListError` | Error response from workspace list | `repository_id`, `user_id`, `error_code`, `error_message`, `client` |

### Funnel Metrics

- **Workspace discovery rate**: % of `WorkspaceListViewed` events followed by `WorkspaceViewed`, `WorkspaceSSHConnected`, or `WorkspaceResumed` within 5 minutes
- **Empty list follow-through**: % of `WorkspaceListEmpty` events followed by `WorkspaceCreated` within 10 minutes
- **CLI workspace adoption**: Weekly active users who invoke `workspace list` at least once
- **Status filter usage**: Distribution of `status_filter` values across all `WorkspaceListViewed` events
- **Pagination depth**: Distribution of `page` values to understand if users navigate beyond page 1

### Success Indicators

- The command is used by ≥ 30% of active CLI users who also use `workspace create` or `workspace ssh`
- Fewer than 5% of `WorkspaceListViewed` events have `page > 1` (default limit is sufficient)
- `WorkspaceListError` rate is below 1% of total workspace list requests

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Workspace list request received | `DEBUG` | `repository_id`, `user_id`, `page`, `per_page`, `status_filter`, `request_id` | Every request |
| Workspace list response | `DEBUG` | `repository_id`, `user_id`, `total_count`, `returned_count`, `duration_ms`, `request_id` | Successful response |
| Workspace list pagination error | `WARN` | `error`, `raw_page`, `raw_per_page`, `request_id` | Invalid pagination params |
| Workspace list service error | `ERROR` | `error`, `repository_id`, `user_id`, `request_id`, `stack_trace` | Service/DB failure |
| Workspace list DB query slow | `WARN` | `repository_id`, `user_id`, `duration_ms`, `request_id` | Query takes > 500ms |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_list_requests_total` | Counter | `status_code`, `status_filter` | Total workspace list requests |
| `codeplane_workspace_list_duration_seconds` | Histogram | `status_code` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_workspace_list_results_total` | Histogram | — | Number of workspaces returned per request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_workspace_list_errors_total` | Counter | `error_type` (`auth`, `pagination`, `not_found`, `internal`) | Total errors by type |

### Alerts

#### Alert: WorkspaceListHighErrorRate

- **Condition**: `rate(codeplane_workspace_list_errors_total{error_type="internal"}[5m]) / rate(codeplane_workspace_list_requests_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `workspace list service error` entries in the last 5 minutes.
  2. Verify database connectivity: run `SELECT 1` against the primary database.
  3. Check if the `workspaces` table is locked or has high lock contention (`pg_stat_activity`).
  4. Check if there's a recent deployment that may have introduced a regression.
  5. If database is healthy, check for OOM or resource exhaustion on the server pod.
  6. Escalate to the workspace team if unresolved after 15 minutes.

#### Alert: WorkspaceListHighLatency

- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_list_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check if the `codeplane_workspace_list_results_total` histogram shows unusually large result sets.
  2. Run `EXPLAIN ANALYZE` on the workspace list query for the affected repositories.
  3. Check if the `workspaces` table index on `(repository_id, user_id, created_at)` exists and is not bloated.
  4. Check server CPU and memory utilization.
  5. If a specific repository has an abnormal number of workspaces (>1000), consider whether the idle/stale cleanup job is running.
  6. Escalate to the platform team if p95 latency remains above 2s after investigation.

#### Alert: WorkspaceListAuthFailureSpike

- **Condition**: `rate(codeplane_workspace_list_errors_total{error_type="auth"}[5m]) > 50`
- **Severity**: Critical
- **Runbook**:
  1. Check if the auth service or session store is down.
  2. Check if a token revocation event occurred recently.
  3. Verify the auth middleware is correctly loading session/token context.
  4. Check for brute-force or credential stuffing patterns in access logs.
  5. If the spike correlates with a deployment, roll back immediately.
  6. Notify the security team if the pattern suggests an attack.

### Error Cases and Failure Modes

| Error Case | HTTP Status | CLI Behavior | Recovery |
|------------|-------------|-------------|----------|
| Invalid `--page` value | — (client-side) | Print validation error, exit 1 | User corrects the flag value |
| Invalid `--limit` value | — (client-side) | Print validation error, exit 1 | User corrects the flag value |
| `--limit` > 100 | 400 | Print server error message, exit 1 | User reduces limit to ≤ 100 |
| Unauthenticated | 401 | Print auth prompt message, exit 1 | User authenticates |
| No repository access | 403 | Print permission denied message, exit 1 | User requests access |
| Repository not found | 404 | Print not found message, exit 1 | User checks repo name |
| Server error | 500 | Print server error with detail, exit 1 | Retry; check server health |
| Network unreachable | — | Print connection error with server URL, exit 1 | Check network, server URL config |
| Request timeout | — | Print timeout message, exit 1 | Retry with smaller `--limit` |
| Cannot resolve repo from local checkout | — (client-side) | Print detection error with `--repo` hint, exit 1 | User provides `--repo` flag |

## Verification

### API Integration Tests

1. **List workspaces — basic success**: Create 3 workspaces for a repo, call `GET /api/repos/:owner/:repo/workspaces`, verify 200 status, response is an array of 3 workspace objects with correct fields (`id`, `name`, `status`, `is_fork`, `created_at`, etc.)
2. **List workspaces — empty repository**: Call list on a repo with no workspaces, verify 200 status, response is an empty array `[]`, `X-Total-Count` is `0`
3. **List workspaces — pagination page 1**: Create 5 workspaces, request `?page=1&per_page=2`, verify response contains 2 workspaces, `X-Total-Count` is `5`
4. **List workspaces — pagination page 2**: Create 5 workspaces, request `?page=2&per_page=2`, verify response contains 2 different workspaces from page 1
5. **List workspaces — pagination last page**: Create 5 workspaces, request `?page=3&per_page=2`, verify response contains 1 workspace
6. **List workspaces — pagination beyond range**: Create 3 workspaces, request `?page=100&per_page=30`, verify 200 status, response is an empty array
7. **List workspaces — per_page=100 (maximum valid)**: Create 100 workspaces, request `?per_page=100`, verify all 100 returned
8. **List workspaces — per_page=101 (exceeds max)**: Request `?per_page=101`, verify 400 error with message `per_page must not exceed 100`
9. **List workspaces — per_page=0**: Request `?per_page=0`, verify 400 error with message `invalid per_page value`
10. **List workspaces — per_page=-1**: Request `?per_page=-1`, verify 400 error with message `invalid per_page value`
11. **List workspaces — page=0**: Request `?page=0`, verify 400 error with message `invalid page value`
12. **List workspaces — page=-1**: Request `?page=-1`, verify 400 error with message `invalid page value`
13. **List workspaces — page=NaN**: Request `?page=abc`, verify 400 error
14. **List workspaces — cursor-based pagination**: Create 5 workspaces, request `?limit=2&cursor=0`, verify 2 returned; request `?limit=2&cursor=2`, verify next 2 returned
15. **List workspaces — user scoping**: Create workspaces as user A and user B for the same repo, list as user A, verify only user A's workspaces are returned
16. **List workspaces — repo scoping**: Create workspaces in repo X and repo Y, list for repo X, verify only repo X's workspaces are returned
17. **List workspaces — ordering**: Create 3 workspaces at different times, verify they are returned in `created_at DESC` order
18. **List workspaces — status filter running**: Create workspaces with mixed statuses, request `?status=running`, verify only running workspaces returned
19. **List workspaces — status filter suspended**: Create workspaces with mixed statuses, request `?status=suspended`, verify only suspended workspaces returned
20. **List workspaces — status filter all**: Request `?status=all` (or no status param), verify all workspaces returned regardless of status
21. **List workspaces — unauthenticated**: Call without auth token, verify 401
22. **List workspaces — no repo access**: Call as a user without access to the repo, verify 403
23. **List workspaces — nonexistent repo**: Call for `nonexistent-owner/nonexistent-repo`, verify 404
24. **List workspaces — response shape**: Verify each workspace object contains all expected fields with correct types (string id, number repository_id, string status, boolean is_fork, string or null suspended_at, etc.)
25. **List workspaces — X-Total-Count header**: Create 15 workspaces, request `?per_page=5`, verify `X-Total-Count` header equals `15`

### CLI Integration Tests

26. **CLI list — basic table output**: Create workspaces via API, run `codeplane workspace list --repo OWNER/REPO`, verify stdout contains table with headers `ID`, `Name`, `Status`, `Fork`, `Created` and correct data rows
27. **CLI list — empty output**: Run against repo with no workspaces, verify stdout is `No workspaces found`, exit code 0
28. **CLI list — JSON output**: Run `codeplane workspace list --repo OWNER/REPO --json`, verify stdout is valid JSON array with workspace objects
29. **CLI list — JSON field filter**: Run `codeplane workspace list --repo OWNER/REPO --json name`, verify stdout contains only workspace names
30. **CLI list — pagination flags**: Run `codeplane workspace list --repo OWNER/REPO --page 1 --limit 2`, verify only 2 workspaces displayed
31. **CLI list — status filter**: Create running and suspended workspaces, run with `--status running`, verify only running workspaces displayed
32. **CLI list — status=all filter**: Run with `--status all`, verify all workspaces displayed
33. **CLI list — auto-detect repo**: From inside a cloned repo directory, run without `--repo`, verify it resolves correctly and lists workspaces
34. **CLI list — invalid repo format**: Run with `--repo invalid-format`, verify error message and non-zero exit code
35. **CLI list — limit exceeds max**: Run with `--limit 101`, verify error message about exceeding maximum
36. **CLI list — limit 100 (max valid)**: Create 100 workspaces, run with `--limit 100`, verify 100 rows displayed
37. **CLI list — page 0**: Run with `--page 0`, verify validation error
38. **CLI list — unauthenticated**: Run without authentication, verify error message mentioning `codeplane auth login`, exit code 1
39. **CLI list — workspace with special characters in name**: Create workspace named `test "workspace" <special>`, list workspaces, verify table renders without corruption
40. **CLI list — workspace with unicode name**: Create workspace named `工作区-テスト-🚀`, list workspaces, verify name appears correctly
41. **CLI list — workspace with 255-char name**: Create workspace with 255-character name, list workspaces, verify full name displayed
42. **CLI list — fork column display**: Create a forked workspace, verify `Fork` column shows `yes` for fork and `no` for non-forks
43. **CLI list — exit code on success**: Verify exit code is 0
44. **CLI list — exit code on error**: Verify exit code is non-zero for any error condition
45. **CLI list — network error handling**: Point CLI at unreachable server, verify descriptive error message

### End-to-End Tests (Playwright — Web UI Cross-Validation)

46. **E2E: Workspace list consistency**: Create workspaces via CLI, verify they appear in web UI workspace list with matching data
47. **E2E: Workspace list after create/delete lifecycle**: Create via CLI, verify in list; delete, verify removed from list
48. **E2E: Workspace list after suspend/resume**: Suspend a workspace, verify list shows `suspended`; resume, verify list shows `running`

### TUI Integration Tests

49. **TUI: Workspace list screen**: Navigate to workspace list, verify workspaces displayed correctly
50. **TUI: Workspace list empty state**: Navigate to workspace list for repo with no workspaces, verify empty state message

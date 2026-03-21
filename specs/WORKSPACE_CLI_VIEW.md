# WORKSPACE_CLI_VIEW

Specification for WORKSPACE_CLI_VIEW.

## High-Level User POV

When a developer is working with Codeplane workspaces — container-backed development environments tied to a repository — they need a fast, reliable way to inspect the current state of a specific workspace from their terminal. The `codeplane workspace view` command provides this.

A developer invokes `codeplane workspace view <workspace-id>` (optionally passing `--repo owner/repo` if they're not inside a recognized repository directory) and immediately sees a structured summary of that workspace. The output tells them the workspace's current lifecycle status (pending, starting, running, suspended, stopped, or failed), how long it has been running, what SSH connection details are available for connecting, whether it was created from a snapshot, its persistence mode, and its idle timeout configuration.

If the workspace is currently running, the command enriches its output with live SSH connection information — including a ready-to-copy SSH command, the host, port, and username — so the developer can connect immediately without a separate lookup step. If the workspace is not yet running or SSH details are temporarily unavailable, the command gracefully degrades by omitting the SSH section rather than failing.

The output is structured JSON by default, making it composable with other CLI tools, scripts, and automation pipelines. Developers can pipe it through `jq`, feed it into their own tooling, or simply read it directly. The command is designed to be the single source of truth for "what is this workspace right now?" from the terminal.

This feature is particularly valuable for agent-assisted workflows where automation scripts need to poll workspace state, extract SSH commands programmatically, or make decisions based on workspace status before proceeding with further orchestration steps like running tests, deploying code, or creating landing requests.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane workspace view <id>` returns a complete workspace detail object as structured JSON to stdout
- [ ] The command exits with code 0 on success and non-zero on any error
- [ ] The output includes all workspace metadata fields: `id`, `status`, `ssh_host`, `persistence`, `snapshot_id`, `idle_timeout_seconds`, `created_at`, `updated_at`, `suspended_at`
- [ ] When the workspace status is `running`, the command fetches and includes SSH connection details as a nested `ssh` object with `command`, `host`, `port`, and `username`
- [ ] When the workspace status is not `running`, the `ssh` field is `null` or falls back to a minimal `ssh_host`-derived object if `ssh_host` is present on the workspace
- [ ] When the workspace is `running` but the SSH info endpoint fails or is temporarily unavailable, the command does not crash; it falls back gracefully
- [ ] When the workspace is `running`, a computed `uptime` field is included as a human-readable string (e.g., `"2h 15m"`, `"45m"`, `"0m"`)
- [ ] When the workspace is not `running`, the `uptime` field is `null`
- [ ] The `persistence` field defaults to `"sticky"` if not returned by the API
- [ ] The `idle_timeout_seconds` field defaults to `1800` if not returned by the API
- [ ] The `snapshot_id` field defaults to `null` if not returned by the API

### Argument and Option Constraints

- [ ] The `id` positional argument is required; omitting it produces a usage error
- [ ] The `id` must be a valid UUID string (standard 8-4-4-4-12 format); malformed IDs are passed through to the API which returns a 400 or 404
- [ ] The `--repo` option accepts `OWNER/REPO` format; if omitted, the CLI resolves the repository from the current working directory's jj/git context
- [ ] If `--repo` is omitted and the current directory is not inside a recognized repository, the command produces a clear error message
- [ ] Repository names follow standard Codeplane constraints: alphanumeric with hyphens and underscores, no spaces, maximum 255 characters per segment
- [ ] The `--repo` option rejects formats without a slash separator (e.g., just `myrepo` without an owner)

### Edge Cases

- [ ] Viewing a workspace that does not exist returns a clear "workspace not found" error with exit code 1
- [ ] Viewing a workspace in a repository the user does not have access to returns a 403 or 404 (no information leak)
- [ ] Viewing a workspace while unauthenticated returns an authentication error
- [ ] The workspace ID is treated as case-insensitive for UUID matching
- [ ] If the server is unreachable, the command fails with a network-level error, not an unhandled exception
- [ ] An empty string for `id` is rejected before making an API call
- [ ] Extremely long or malformed workspace ID strings (>1000 characters) do not cause buffer overflows or hangs; the API returns a 400

### Output Contract

- [ ] The output is valid JSON when the command succeeds
- [ ] All timestamp fields are ISO 8601 format
- [ ] The `ssh.port` is always an integer (not a string)
- [ ] The `ssh.command` is a ready-to-execute SSH command string
- [ ] The `idle_timeout_seconds` is always an integer
- [ ] The `status` field is one of: `"pending"`, `"starting"`, `"running"`, `"suspended"`, `"stopped"`, `"failed"`
- [ ] `suspended_at` is either an ISO 8601 string or `null`
- [ ] The output does not include the `access_token` from SSH info (security: the token is used internally to construct the command, but not exposed as a separate field)

## Design

### CLI Command

**Command signature:**

```
codeplane workspace view <id> [--repo OWNER/REPO]
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | The UUID of the workspace to view |

**Options:**

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--repo` | `string` | No | Auto-detected from cwd | Repository in `OWNER/REPO` format |

**Successful output shape (JSON):**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "running",
  "ssh_host": "vmid+developer@ssh.codeplane.dev",
  "persistence": "sticky",
  "snapshot_id": null,
  "idle_timeout_seconds": 1800,
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T12:15:00.000Z",
  "suspended_at": null,
  "ssh": {
    "command": "ssh vmid+developer:token@ssh.codeplane.dev",
    "host": "ssh.codeplane.dev",
    "port": 22,
    "username": "developer"
  },
  "uptime": "2h 15m"
}
```

**Output when workspace is suspended:**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "suspended",
  "ssh_host": "vmid+developer@ssh.codeplane.dev",
  "persistence": "sticky",
  "snapshot_id": null,
  "idle_timeout_seconds": 1800,
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T11:30:00.000Z",
  "suspended_at": "2026-03-22T11:30:00.000Z",
  "ssh": {
    "command": "ssh vmid+developer@ssh.codeplane.dev",
    "host": "ssh.codeplane.dev",
    "port": 22
  },
  "uptime": null
}
```

**Output when workspace has no SSH info at all:**

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "status": "pending",
  "persistence": "sticky",
  "snapshot_id": null,
  "idle_timeout_seconds": 1800,
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z",
  "suspended_at": null,
  "ssh": null,
  "uptime": null
}
```

**Error output shape:**

```json
{
  "error": "workspace not found",
  "status": 404
}
```

### SSH Info Enrichment Logic

The view command follows a cascading SSH resolution strategy:

1. **If workspace is `running`**: fetch SSH connection info from the dedicated `/ssh` endpoint. If successful, build the `ssh` object from `command`, `host`, `port`, and `username` fields. The `command` field is resolved with a preference chain: `sshInfo.command` → `sshInfo.ssh_command` → `ssh {sshInfo.ssh_host}` → `ssh {workspace.ssh_host}` → `"SSH details available"`.
2. **If workspace is `running` but SSH fetch fails**: silently fall back. If the workspace has an `ssh_host` field, construct a minimal SSH object. Otherwise, `ssh` is `null`.
3. **If workspace is not `running`**: if the workspace has an `ssh_host`, construct a minimal `{ command, host, port }` object. Otherwise, `ssh` is `null`.

### Uptime Calculation Logic

- **If `running` and `created_at` is present**: compute elapsed time from the most appropriate start time to now.
  - If the workspace has a `suspended_at` value (meaning it was previously suspended and then resumed), use `updated_at` as the start time (approximating the resume timestamp).
  - Otherwise, use `created_at` as the start time.
- **Format**: `"Xh Ym"` if hours > 0, otherwise `"Ym"`.
- **If not running**: `uptime` is `null`.

### API Shape

The view command consumes two API endpoints:

**1. Get Workspace**

```
GET /api/repos/:owner/:repo/workspaces/:id
```

Response: `WorkspaceResponse` (200) or error (400, 404)

Fields:
- `id` (string, UUID)
- `repository_id` (number)
- `user_id` (number)
- `name` (string)
- `status` (string: "pending" | "starting" | "running" | "suspended" | "stopped" | "failed")
- `is_fork` (boolean)
- `parent_workspace_id` (string, optional)
- `freestyle_vm_id` (string)
- `persistence` (string)
- `ssh_host` (string, optional)
- `snapshot_id` (string, optional)
- `idle_timeout_seconds` (number)
- `suspended_at` (string | null, ISO 8601)
- `created_at` (string, ISO 8601)
- `updated_at` (string, ISO 8601)

**2. Get Workspace SSH Connection Info**

```
GET /api/repos/:owner/:repo/workspaces/:id/ssh
```

Response: `WorkspaceSSHConnectionInfo` (200) or error (400, 404, 409, 503)

Fields:
- `workspace_id` (string)
- `session_id` (string)
- `vm_id` (string)
- `host` (string)
- `ssh_host` (string)
- `username` (string)
- `port` (number)
- `access_token` (string, 5-minute TTL)
- `command` (string, ready-to-execute SSH command)

This endpoint is only called when the workspace status is `"running"`.

### SDK Shape

The CLI uses `api<T>()` — a typed HTTP client that attaches the auth token from local state, parses JSON responses, and throws `ApiError` with `status` and `detail` on non-2xx responses. No additional SDK service methods are needed beyond the existing `getWorkspace` and `getWorkspaceSSHConnectionInfo`.

### Documentation

The following documentation should be written for end users:

1. **CLI Reference — `workspace view`**: Document the command signature, arguments, options, output shape, and examples. Include examples for: viewing a running workspace, viewing a suspended workspace, viewing from outside a repo directory with `--repo`, and piping output to `jq` for field extraction (e.g., `codeplane workspace view abc123 | jq '.ssh.command'`).

2. **Workspace Lifecycle Guide**: A section explaining the workspace status state machine (`pending` → `starting` → `running` → `suspended`/`stopped`/`failed`) so users understand what each status in the view output means.

3. **SSH Connection Guide**: A short section explaining that the `ssh.command` in the view output is copy-pasteable and that SSH tokens are short-lived (5 minutes), so re-running `workspace view` refreshes the token.

## Permissions & Security

### Authorization Roles

| Role | Can View Own Workspaces | Can View Others' Workspaces | Notes |
|------|------------------------|----------------------------|-------|
| Owner | ✅ | ✅ | Repository owners see all workspaces |
| Admin | ✅ | ✅ | Repository admins see all workspaces |
| Member (Write) | ✅ | ❌ | Can only view workspaces they created |
| Member (Read) | ✅ | ❌ | Can only view workspaces they created |
| Anonymous | ❌ | ❌ | Must be authenticated |

### Authentication Requirements

- A valid session cookie or Personal Access Token (PAT) with `Authorization: Bearer <token>` header is required.
- CLI auth state is resolved from the local auth state file managed by `codeplane auth login`.
- Unauthenticated requests receive a `401 Unauthorized` response.

### Rate Limiting

- The workspace view endpoint inherits the global API rate limit.
- The SSH info endpoint is rate-limited more conservatively because it generates short-lived access tokens:
  - **Suggested limit**: 30 requests per minute per user per workspace.
  - Exceeding this returns `429 Too Many Requests`.
- Automated scripts polling workspace status should prefer the `workspace watch` (SSE stream) command over repeated `workspace view` calls.

### Data Privacy Constraints

- The `access_token` from SSH connection info is embedded inside the `ssh.command` string but is **not** exposed as a separate field in the CLI output. This limits accidental token leakage to log files.
- SSH access tokens have a 5-minute TTL. A stale token in captured output becomes useless after expiry.
- The workspace `user_id` is present in the raw API response but the CLI output does not separately highlight it, reducing PII surface in automation logs.
- Workspace IDs are UUIDs and are not sequential, preventing enumeration attacks.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceViewed` | `workspace view` command completes successfully | `workspace_id`, `workspace_status`, `repo_owner`, `repo_name`, `has_ssh_info` (boolean), `client` ("cli"), `uptime_seconds` (nullable int) |
| `WorkspaceViewFailed` | `workspace view` command fails | `workspace_id`, `repo_owner`, `repo_name`, `error_type` ("not_found" / "auth" / "network" / "server"), `http_status`, `client` ("cli") |
| `WorkspaceSSHInfoFetched` | SSH info sub-request succeeds | `workspace_id`, `repo_owner`, `repo_name`, `client` ("cli") |
| `WorkspaceSSHInfoFailed` | SSH info sub-request fails (silently swallowed) | `workspace_id`, `repo_owner`, `repo_name`, `error_type`, `http_status`, `client` ("cli") |

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| **View-to-SSH ratio** | Fraction of `WorkspaceViewed` events where `has_ssh_info=true` | > 70% for running workspaces indicates healthy SSH provisioning |
| **View error rate** | `WorkspaceViewFailed` / (`WorkspaceViewed` + `WorkspaceViewFailed`) | < 2% under normal operation |
| **SSH info failure rate** | `WorkspaceSSHInfoFailed` / `WorkspaceSSHInfoFetched` | < 5%; higher indicates sandbox token generation issues |
| **View command latency** | Time from CLI invocation to output | P50 < 500ms, P95 < 2s |
| **Repeat view rate** | Number of `WorkspaceViewed` events per unique workspace per 10-minute window | High repeat rate (>5) suggests users should be guided toward `workspace watch` |

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|--------------------|-------------|
| Workspace fetch start | `DEBUG` | `workspace_id`, `owner`, `repo` | Before API call to get workspace |
| Workspace fetch success | `INFO` | `workspace_id`, `status`, `latency_ms` | After successful workspace fetch |
| Workspace fetch failure | `ERROR` | `workspace_id`, `http_status`, `error_detail`, `latency_ms` | After failed workspace fetch |
| SSH info fetch start | `DEBUG` | `workspace_id` | Before SSH info API call (only for running workspaces) |
| SSH info fetch success | `INFO` | `workspace_id`, `latency_ms` | After successful SSH info fetch |
| SSH info fetch failure | `WARN` | `workspace_id`, `http_status`, `error_detail`, `latency_ms` | After failed SSH info fetch (gracefully handled) |
| Repo resolution from cwd | `DEBUG` | `resolved_owner`, `resolved_repo`, `cwd` | When `--repo` is not provided |
| Repo resolution failure | `ERROR` | `cwd`, `error_detail` | When cwd repo detection fails |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_workspace_view_total` | Counter | `status` (success/error), `workspace_status` | Total workspace view invocations |
| `codeplane_cli_workspace_view_duration_seconds` | Histogram | `workspace_status`, `has_ssh_info` | End-to-end command latency |
| `codeplane_api_workspace_get_total` | Counter | `http_status`, `owner`, `repo` | Server-side workspace GET request count |
| `codeplane_api_workspace_get_duration_seconds` | Histogram | `http_status` | Server-side workspace GET latency |
| `codeplane_api_workspace_ssh_info_total` | Counter | `http_status` | Server-side SSH info request count |
| `codeplane_api_workspace_ssh_info_duration_seconds` | Histogram | `http_status` | Server-side SSH info latency |
| `codeplane_workspace_ssh_token_generated_total` | Counter | `workspace_id` | SSH access tokens generated |

### Alerts

**Alert 1: High Workspace View Error Rate**

- **Condition**: `rate(codeplane_api_workspace_get_total{http_status=~"5.."}[5m]) / rate(codeplane_api_workspace_get_total[5m]) > 0.05`
- **Severity**: Warning (>5%), Critical (>20%)
- **Runbook**:
  1. Check database connectivity: `SELECT 1` against the primary database.
  2. Check workspace table health: `SELECT count(*) FROM workspaces WHERE status NOT IN ('deleted')`.
  3. Review server logs for workspace service exceptions: filter by `service=workspace` and `method=getWorkspace`.
  4. If DB is healthy, check for resource exhaustion (memory, connection pool) on the API server.
  5. If isolated to specific repositories, check for data corruption on those workspace rows.
  6. Escalate to platform team if database or service-level issue persists beyond 10 minutes.

**Alert 2: SSH Info Endpoint Elevated Latency**

- **Condition**: `histogram_quantile(0.95, rate(codeplane_api_workspace_ssh_info_duration_seconds_bucket[5m])) > 3`
- **Severity**: Warning
- **Runbook**:
  1. Check sandbox/container runtime health: verify the FreestyleVM API or container daemon is responding.
  2. Check if token generation (SHA256 hash) is bottlenecked — unlikely but check CPU.
  3. Review database write latency for the access token insert.
  4. If the sandbox runtime is slow, check its resource allocation and queue depth.
  5. Consider if a downstream dependency (sandbox API) has degraded. Check its health endpoint.
  6. If persistent, page the infrastructure team.

**Alert 3: SSH Token Generation Spike**

- **Condition**: `rate(codeplane_workspace_ssh_token_generated_total[5m]) > 100`
- **Severity**: Warning
- **Runbook**:
  1. Identify if a single user/workspace is generating excessive tokens (possible automation loop).
  2. Check CLI telemetry for repeat-view patterns (same workspace viewed >5x in 10 minutes).
  3. If caused by a script, recommend the user switch to `workspace watch` for real-time updates.
  4. If token generation is distributed across many users, this may indicate a legitimate usage spike.
  5. Monitor the access_tokens table size; old tokens should be cleaned up by the TTL.

**Alert 4: Workspace View 404 Spike**

- **Condition**: `rate(codeplane_api_workspace_get_total{http_status="404"}[10m]) > 50`
- **Severity**: Warning
- **Runbook**:
  1. Check if workspaces are being deleted or cleaned up by the idle workspace cleaner more aggressively than expected.
  2. Review the `cleanupIdleWorkspaces` and `cleanupStalePendingWorkspaces` scheduler jobs for configuration drift.
  3. Check if users are referencing stale workspace IDs from cached CLI output.
  4. If correlated with a deploy, check for migration issues affecting workspace rows.

### Error Cases and Failure Modes

| Error Case | HTTP Status | CLI Behavior | Recovery |
|------------|-------------|--------------|----------|
| Workspace not found | 404 | Print error, exit 1 | User should verify workspace ID; may have been deleted |
| Repository not found | 404 | Print error, exit 1 | User should check `--repo` value or cwd context |
| Not authenticated | 401 | Print auth error, exit 1 | User should run `codeplane auth login` |
| Forbidden (no access) | 403 | Print permission error, exit 1 | User needs repository access |
| Invalid workspace ID format | 400 | Print validation error, exit 1 | User should provide valid UUID |
| SSH info temporarily unavailable | 409/503 | Silently omit SSH info | Workspace may still be provisioning; retry in a few seconds |
| Server unreachable | N/A (network) | Print connection error, exit 1 | Check network, server status |
| Rate limited | 429 | Print rate limit error, exit 1 | Wait and retry; consider `workspace watch` |
| Server error | 500 | Print server error, exit 1 | Report bug; check server logs |
| Repo resolution from cwd fails | N/A (local) | Print "could not detect repository" error, exit 1 | Use `--repo` flag explicitly |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-WV-001` | GET `/api/repos/:owner/:repo/workspaces/:id` with valid running workspace | 200 with full `WorkspaceResponse` JSON; all fields present and correctly typed |
| `API-WV-002` | GET `/api/repos/:owner/:repo/workspaces/:id` with valid suspended workspace | 200; `status` is `"suspended"`, `suspended_at` is non-null ISO 8601 |
| `API-WV-003` | GET `/api/repos/:owner/:repo/workspaces/:id` with valid pending workspace | 200; `status` is `"pending"`, `ssh_host` may be absent |
| `API-WV-004` | GET `/api/repos/:owner/:repo/workspaces/:id` with valid failed workspace | 200; `status` is `"failed"` |
| `API-WV-005` | GET `/api/repos/:owner/:repo/workspaces/:id` with non-existent UUID | 404 with `{ "message": "workspace not found" }` |
| `API-WV-006` | GET `/api/repos/:owner/:repo/workspaces/:id` with malformed UUID (too short) | 400 or 404 |
| `API-WV-007` | GET `/api/repos/:owner/:repo/workspaces/:id` with empty string ID | 400 with `{ "message": "workspace id is required" }` |
| `API-WV-008` | GET `/api/repos/:owner/:repo/workspaces/:id` with 1000-character string | 400 or 404; no server crash |
| `API-WV-009` | GET `/api/repos/:owner/:repo/workspaces/:id` without auth token | 401 |
| `API-WV-010` | GET `/api/repos/:owner/:repo/workspaces/:id` for workspace owned by another user | 404 (no information leak) |
| `API-WV-011` | GET `/api/repos/:owner/:repo/workspaces/:id` for non-existent repository | 404 |
| `API-WV-012` | GET `/api/repos/:owner/:repo/workspaces/:id/ssh` for running workspace | 200 with `WorkspaceSSHConnectionInfo`; all fields present |
| `API-WV-013` | GET `/api/repos/:owner/:repo/workspaces/:id/ssh` for suspended workspace | 404 or 409 |
| `API-WV-014` | GET `/api/repos/:owner/:repo/workspaces/:id/ssh` for non-existent workspace | 404 |
| `API-WV-015` | GET `/api/repos/:owner/:repo/workspaces/:id/ssh` without auth | 401 |
| `API-WV-016` | Verify `WorkspaceSSHConnectionInfo.command` contains a valid SSH command pattern | `command` matches `ssh .+@.+` regex |
| `API-WV-017` | Verify SSH `access_token` has 5-minute TTL | Token works within 5 min; fails after (or TTL field indicates expiry) |
| `API-WV-018` | Verify `WorkspaceResponse.created_at` is valid ISO 8601 | Parseable by `new Date()` |
| `API-WV-019` | Verify `WorkspaceResponse.idle_timeout_seconds` is a positive integer | Type check; > 0 |
| `API-WV-020` | Verify `WorkspaceResponse.id` is a valid UUID v4 | Matches UUID format regex |

### CLI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CLI-WV-001` | `codeplane workspace view <valid-running-id> --repo owner/repo` | Exits 0; stdout is valid JSON; contains `id`, `status`, `ssh`, `uptime` fields |
| `CLI-WV-002` | `codeplane workspace view <valid-suspended-id> --repo owner/repo` | Exits 0; `status` is `"suspended"`; `uptime` is `null`; `suspended_at` is non-null |
| `CLI-WV-003` | `codeplane workspace view <valid-pending-id> --repo owner/repo` | Exits 0; `status` is `"pending"`; `ssh` is `null`; `uptime` is `null` |
| `CLI-WV-004` | `codeplane workspace view <valid-failed-id> --repo owner/repo` | Exits 0; `status` is `"failed"`; `ssh` is `null`; `uptime` is `null` |
| `CLI-WV-005` | `codeplane workspace view <non-existent-id> --repo owner/repo` | Exits non-zero; stderr contains error message |
| `CLI-WV-006` | `codeplane workspace view` (no ID argument) | Exits non-zero; prints usage/help |
| `CLI-WV-007` | `codeplane workspace view <id>` without `--repo` inside a repo directory | Exits 0; resolves repo from cwd |
| `CLI-WV-008` | `codeplane workspace view <id>` without `--repo` outside any repo directory | Exits non-zero; prints repo resolution error |
| `CLI-WV-009` | `codeplane workspace view <id> --repo invalidformat` (no slash) | Exits non-zero; prints format error |
| `CLI-WV-010` | Verify `ssh.port` is integer `22` in JSON output for running workspace | `typeof output.ssh.port === 'number'` |
| `CLI-WV-011` | Verify `persistence` defaults to `"sticky"` when API omits it | Output `persistence` === `"sticky"` |
| `CLI-WV-012` | Verify `idle_timeout_seconds` defaults to `1800` when API omits it | Output `idle_timeout_seconds` === `1800` |
| `CLI-WV-013` | Verify `snapshot_id` defaults to `null` when API omits it | Output `snapshot_id` === `null` |
| `CLI-WV-014` | Verify uptime calculation for a workspace running for 2.5 hours | `uptime` === `"2h 30m"` (approximately) |
| `CLI-WV-015` | Verify uptime calculation for a workspace running for 10 minutes | `uptime` === `"10m"` (approximately) |
| `CLI-WV-016` | Verify uptime shows `"0m"` for a just-created running workspace | `uptime` === `"0m"` |
| `CLI-WV-017` | Verify resumed workspace uptime uses `updated_at` not `created_at` | `uptime` reflects time since resume, not total lifecycle |
| `CLI-WV-018` | Verify `access_token` is NOT exposed as a top-level field in output | `output.access_token` is `undefined` |
| `CLI-WV-019` | Verify `ssh.command` is present and non-empty for running workspace with SSH | `typeof output.ssh.command === 'string' && output.ssh.command.length > 0` |
| `CLI-WV-020` | Verify output is valid JSON (parseable by `JSON.parse`) | No parse error |
| `CLI-WV-021` | `codeplane workspace view <id> --repo owner/repo` when unauthenticated | Exits non-zero; prints auth error |
| `CLI-WV-022` | Verify `--repo` with maximum-length owner (255 chars) and repo (255 chars) | Works correctly; no truncation |
| `CLI-WV-023` | Verify workspace ID with uppercase UUID is accepted | Works correctly (case insensitive) |
| `CLI-WV-024` | `codeplane workspace view <id> --repo owner/repo` when server returns 500 | Exits non-zero; prints server error |
| `CLI-WV-025` | Verify output includes `is_fork` and `parent_workspace_id` when workspace is a fork | Fields present and correct |

### End-to-End (E2E) Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `E2E-WV-001` | Full lifecycle: create workspace → view it while pending → wait for running → view it with SSH info → suspend → view while suspended → resume → view with refreshed SSH | All status transitions reflected correctly in view output |
| `E2E-WV-002` | Create workspace from snapshot → view → verify `snapshot_id` is populated | `snapshot_id` matches the source snapshot ID |
| `E2E-WV-003` | Create workspace → delete it → view → confirm 404 | View fails gracefully after deletion |
| `E2E-WV-004` | Fork a workspace → view the fork → verify `is_fork` is `true` and `parent_workspace_id` matches | Fork metadata correct in view output |
| `E2E-WV-005` | Create workspace → let it idle past timeout → view → confirm status changed to `suspended` | Idle timeout reflected in view output |
| `E2E-WV-006` | User A creates workspace → User B attempts `workspace view` → confirm 404/403 | Cross-user isolation works |
| `E2E-WV-007` | Workspace view → pipe to `jq '.ssh.command'` → use extracted command to SSH into workspace | SSH command from view output is functional |
| `E2E-WV-008` | Run `workspace view` 50 times rapidly for the same running workspace → all return valid JSON with SSH info | No rate limit hit for reasonable usage; tokens generated correctly |
| `E2E-WV-009` | View workspace with `--repo` flag vs auto-detected repo from cwd → outputs are identical | Both resolution paths produce the same result |
| `E2E-WV-010` | Create workspace → wait for `running` → view → verify `uptime` is positive and increases on subsequent views | Uptime is dynamic and progresses |

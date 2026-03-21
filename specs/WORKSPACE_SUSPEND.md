# WORKSPACE_SUSPEND

Specification for WORKSPACE_SUSPEND.

## High-Level User POV

When working with Codeplane workspaces, users frequently need to pause their compute environments without losing filesystem state. The suspend feature lets a user stop a running workspace's container while keeping all files, installed dependencies, and repository state intact on disk. This is the primary tool for managing compute costs — a suspended workspace consumes no CPU or memory resources, only disk storage.

Suspending a workspace is a single action: from the CLI, TUI, or API, the user tells Codeplane to suspend a specific workspace. The workspace transitions through a brief "suspending" phase and then settles into a "suspended" state. While suspended, the workspace cannot accept SSH connections, terminal sessions, or agent interactions. The user sees a clear indicator that the workspace is suspended and that SSH is unavailable.

To bring the workspace back, the user resumes it. Resuming restarts the container from its preserved filesystem state — this is a cold start, so in-memory process state from before the suspend is not preserved, but all files, git/jj state, installed packages, and configuration remain exactly as they were. Resume takes a few seconds while the container boots and passes its health check, after which SSH access is restored and the workspace is fully operational again.

Codeplane also suspends workspaces automatically. When a workspace sits idle past its configured timeout (default 30 minutes), the background cleanup scheduler suspends it to save resources. When the last active terminal session on a workspace is destroyed, the workspace auto-suspends as well. Users receive real-time status updates about these transitions through SSE streams, so connected clients (TUI, web, CLI watch mode) reflect the current state without polling.

The suspend/resume lifecycle is designed to be safe and reversible. Suspending an already-suspended workspace is a harmless no-op. Resuming an already-running workspace simply confirms the running state. There is no destructive data loss from either operation — the only thing lost on suspend is in-memory process state, which is clearly communicated as a product expectation of the Community Edition's container-based model.

## Acceptance Criteria

### Definition of Done

- [ ] A user can suspend a running workspace, transitioning its status from `running` to `suspended`
- [ ] A user can resume a suspended workspace, transitioning its status from `suspended` to `running`
- [ ] The workspace's container filesystem is fully preserved across suspend/resume cycles
- [ ] SSH connections are unavailable while a workspace is suspended and are restored on resume
- [ ] The `suspended_at` timestamp is recorded when a workspace is suspended and is visible to clients
- [ ] Real-time SSE notifications are published for both suspend and resume transitions
- [ ] The background cleanup scheduler automatically suspends idle workspaces based on `idle_timeout_seconds`
- [ ] Destroying the last active session on a workspace triggers auto-suspend
- [ ] The CLI `workspace suspend` and `workspace resume` commands work end-to-end
- [ ] The CLI `workspace status` command accurately reflects suspended state including `suspended_at`
- [ ] The API returns the full updated workspace object after suspend or resume

### State Machine Constraints

- [ ] Only workspaces in `running` status can be suspended
- [ ] Only workspaces in `suspended` status can be resumed
- [ ] Suspending an already-suspended workspace is a no-op (returns current state, no error)
- [ ] Suspending a workspace in `stopped` status is a no-op (returns current state, no error)
- [ ] Resuming an already-running workspace detects the running container and reconciles status (no error)
- [ ] Resuming a workspace with no provisioned VM ID returns `409 Conflict`
- [ ] Resuming when the sandbox client is unavailable returns `500 Internal Server Error`
- [ ] Workspaces in `pending`, `starting`, or `failed` status cannot be meaningfully suspended or resumed

### Boundary Constraints

- [ ] Workspace ID must be a valid UUID (36 characters including dashes)
- [ ] Workspace names may be up to 255 characters; names longer than 20 characters are truncated with `…` in TUI status bar messages
- [ ] The `idle_timeout_seconds` field must be a positive integer; default is 1800 (30 minutes)
- [ ] The healthcheck timeout for resume is 30 seconds by default; if the container does not become healthy within this window, the resume fails
- [ ] SSE channel names use UUID without dashes: `workspace_status_{uuid_no_dashes}`
- [ ] The cleanup scheduler runs every 60 seconds by default (`workspaceIntervalMs`)
- [ ] Stale pending workspaces (stuck in `pending` for >5 minutes) are marked as `failed`, not suspended

### Edge Cases

- [ ] Suspending a workspace whose container has already been externally stopped: sandbox `suspendVM` may fail, but DB status is still updated to `suspended` (best-effort)
- [ ] Resuming a workspace whose container was externally deleted: `getVM` returns `not_found`, `startVM` fails, error propagated to user
- [ ] Concurrent suspend requests for the same workspace: both hit the service; the first performs the stop, the second is a no-op because status is already `suspended`
- [ ] Network timeout during container stop: operation may hang; container runtime timeout applies
- [ ] Workspace deleted by another user while suspend is in flight: subsequent DB reload returns null, 404 returned
- [ ] Empty workspace ID in request: returns `400 Bad Request` with message "workspace id is required"
- [ ] Non-existent workspace ID: returns `404 Not Found`
- [ ] Unauthenticated request: returns `401 Unauthorized`
- [ ] Auto-suspend during active session: does not occur; auto-suspend only triggers when active session count reaches zero
- [ ] Multiple workspaces suspended in quick succession from the same repository: each operates independently

## Design

### API Shape

**Suspend Workspace**

```
POST /api/repos/:owner/:repo/workspaces/:id/suspend
```

Request: No body required.

Response (200):
```json
{
  "id": "uuid",
  "repository_id": 1,
  "user_id": 1,
  "name": "my-workspace",
  "status": "suspended",
  "is_fork": false,
  "freestyle_vm_id": "container-id",
  "persistence": "sticky",
  "idle_timeout_seconds": 1800,
  "suspended_at": "2026-03-22T10:30:00.000Z",
  "created_at": "2026-03-22T08:00:00.000Z",
  "updated_at": "2026-03-22T10:30:00.000Z"
}
```

Error responses:
- `400`: `{ "message": "workspace id is required" }` — missing or empty `:id` param
- `401`: Unauthenticated
- `403`: User does not own the workspace or lacks repository permissions
- `404`: `{ "message": "workspace not found" }` — workspace does not exist or is not scoped to this user/repo
- `500`: `{ "message": "internal server error" }` — sandbox client failure

**Resume Workspace**

```
POST /api/repos/:owner/:repo/workspaces/:id/resume
```

Request: No body required.

Response (200):
```json
{
  "id": "uuid",
  "repository_id": 1,
  "user_id": 1,
  "name": "my-workspace",
  "status": "running",
  "is_fork": false,
  "freestyle_vm_id": "container-id",
  "persistence": "sticky",
  "idle_timeout_seconds": 1800,
  "suspended_at": null,
  "created_at": "2026-03-22T08:00:00.000Z",
  "updated_at": "2026-03-22T10:35:00.000Z"
}
```

Error responses:
- `400`: `{ "message": "workspace id is required" }`
- `401`: Unauthenticated
- `403`: Insufficient permissions
- `404`: `{ "message": "workspace not found" }`
- `409`: `{ "message": "workspace VM has not been provisioned" }` — no `freestyle_vm_id`
- `500`: `{ "message": "internal server error" }` — sandbox client unavailable or container start failure

**Workspace Status SSE Stream**

```
GET /api/repos/:owner/:repo/workspaces/:id/stream
Accept: text/event-stream
```

Emits events on channel `workspace_status_{uuid_no_dashes}`:
```
event: workspace.status
data: {"workspace_id":"uuid","status":"suspended"}

event: workspace.status
data: {"workspace_id":"uuid","status":"running"}
```

Initial event is sent immediately upon connection with current status.

### SDK Shape

The workspace service in `@codeplane/sdk` exposes:

```typescript
suspendWorkspace(workspaceID: string, repositoryID: number, userID: number): Promise<WorkspaceResponse | null>
resumeWorkspace(workspaceID: string, repositoryID: number, userID: number): Promise<WorkspaceResponse | null>
```

Internal helper:
```typescript
private doSuspendWorkspace(workspace: { id: string; freestyleVmId: string; status: string }): Promise<void>
```

Auto-suspend integration points:
- `cleanupIdleWorkspaces()` — called by cleanup scheduler every 60s
- `destroySession()` — triggers auto-suspend when last session ends

The container sandbox client provides:
```typescript
suspendVM(vmId: string): Promise<{ vmId: string; suspendedAt: string }>
startVM(vmId: string, healthcheckTimeoutSecs?: number): Promise<{ vmId: string; ports: PortMapping[] }>
getVM(vmId: string): Promise<{ state: "running" | "stopped" | "not_found" | "paused" }>
```

### CLI Commands

**Suspend:**
```bash
codeplane workspace suspend <id> [--repo OWNER/REPO] [--json]
```
Sends `POST /api/repos/:owner/:repo/workspaces/:id/suspend`. Outputs the updated workspace object. In JSON mode, returns the full response body. In human mode, prints a confirmation like `Workspace 'my-ws' suspended`.

**Resume:**
```bash
codeplane workspace resume <id> [--repo OWNER/REPO] [--json]
```
Sends `POST /api/repos/:owner/:repo/workspaces/:id/resume`. Outputs the updated workspace object. In JSON mode, returns the full response body. In human mode, prints a confirmation like `Workspace 'my-ws' resumed`.

**Status (suspend-aware):**
```bash
codeplane workspace status <id> [--repo OWNER/REPO] [--json]
```
Returns workspace details. When suspended, includes `suspended_at` timestamp and does not attempt to fetch SSH info. Uptime calculation uses `updated_at` (time of last resume) as the start time if the workspace was previously suspended.

**Watch (suspend-aware):**
```bash
codeplane workspace watch <id> [--repo OWNER/REPO] [--json]
```
Connects to the SSE stream. Prints status transitions including `suspended` and `running` in real-time.

### TUI UI

**Workspace List Screen:**
- `s` key on a focused running workspace row: sends suspend request
- `r` key on a focused suspended workspace row: sends resume request
- Status badge transitions: `[running]` → `[suspending…]` (optimistic, yellow, with braille spinner) → `[suspended]` (gray, on server confirm)
- Resume transitions: `[suspended]` → `[resuming…]` (optimistic, yellow, with braille spinner) → `[running]` (green, on server confirm)
- Keys are no-op when workspace is in an invalid state for the action
- Keys are disabled while a mutation is in-flight (no double-fire)
- Status bar shows success/error messages for 3 seconds
- Error messages include mapped reason: 403→"Permission denied", 404→"Workspace not found", 409→"Invalid state transition", 429→"Rate limited", 500→"Server error"

**Workspace Detail Screen:**
- `s` to suspend, `r` to resume (same guards as list)
- Shows "Suspended at" timestamp (relative for <30 days, absolute ISO otherwise)
- SSH connection info section shows "(unavailable while suspended)" when status is `suspended`
- SSH info refreshes when workspace resumes

**Status Badge Colors:**
- `[running]` — ANSI 34 (green/success)
- `[suspended]` — ANSI 245 (muted gray)
- `[suspending…]` / `[resuming…]` — ANSI 178 (yellow/warning) with braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms intervals
- `[failed]` — ANSI 196 (red/error)

**Responsive Behavior:**
- Status badge is always visible at every terminal size (80×24 through 200×60+)
- Status bar messages truncate at narrow widths: `"'{name}' suspended"` at 80 cols vs. `"Workspace '{name}' suspended successfully"` at 120+ cols
- Workspace names >20 chars truncated with `…` in status bar messages

### Documentation

The following end-user documentation should be written:

1. **CLI Reference — `workspace suspend`**: Usage, arguments, options, examples including `--json` output, error cases
2. **CLI Reference — `workspace resume`**: Same structure as suspend
3. **Workspace Lifecycle Guide**: Explains the full status model (`pending` → `starting` → `running` ⇄ `suspended` → `stopped`), when auto-suspend triggers, how idle timeout works, what is preserved across suspend/resume, and what is lost (in-memory process state)
4. **TUI Keyboard Reference**: Updated to include `s` (suspend) and `r` (resume) in workspace screens
5. **API Reference — Suspend/Resume Endpoints**: Request/response shapes, error codes, SSE stream format

## Permissions & Security

### Authorization

| Role | Suspend Own Workspace | Resume Own Workspace | Suspend Others' Workspace | Resume Others' Workspace |
|------|----------------------|---------------------|--------------------------|-------------------------|
| Owner (repo) | ✅ | ✅ | ✅ | ✅ |
| Admin (repo) | ✅ | ✅ | ✅ | ✅ |
| Member (repo write) | ✅ | ✅ | ❌ | ❌ |
| Read-Only | ❌ | ❌ | ❌ | ❌ |
| Anonymous | ❌ | ❌ | ❌ | ❌ |

Workspace operations are scoped to `(workspaceID, repositoryID, userID)`. The service layer queries workspaces filtered by all three, so a user can only operate on their own workspaces unless they have admin/owner privileges on the repository.

### Rate Limiting

- Suspend and resume endpoints should be rate-limited to **10 requests per minute per user per workspace** to prevent abuse (rapid suspend/resume toggling)
- Global workspace mutation rate limit: **60 requests per minute per user** across all workspace operations
- Auto-suspend from the cleanup scheduler is not rate-limited (it is server-internal)

### Data Privacy

- Workspace IDs are UUIDs and do not contain PII
- SSH access tokens and connection credentials are only returned when the workspace is running; they are not exposed while suspended
- The `suspended_at` timestamp is not PII
- Container filesystem contents may contain user code and secrets; suspend preserves these on disk — the same security boundary that applies to a running workspace applies to a suspended one
- SSE stream channels use workspace IDs without dashes; no PII is transmitted over the SSE channel name

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceSuspended` | Workspace status transitions to `suspended` | `workspace_id`, `repository_id`, `user_id`, `trigger` (`manual` \| `idle_timeout` \| `session_end`), `uptime_seconds` (time since last resume or creation), `timestamp` |
| `WorkspaceResumed` | Workspace status transitions to `running` from `suspended` | `workspace_id`, `repository_id`, `user_id`, `suspended_duration_seconds`, `resume_latency_ms` (time from API call to container healthy), `timestamp` |
| `WorkspaceSuspendFailed` | Suspend operation fails | `workspace_id`, `repository_id`, `user_id`, `error_type` (`container_stop_failed` \| `db_error` \| `not_found`), `error_message`, `timestamp` |
| `WorkspaceResumeFailed` | Resume operation fails | `workspace_id`, `repository_id`, `user_id`, `error_type` (`no_vm` \| `sandbox_unavailable` \| `container_start_failed` \| `healthcheck_timeout` \| `not_found`), `error_message`, `timestamp` |
| `WorkspaceAutoSuspended` | Cleanup scheduler suspends idle workspace | `workspace_id`, `repository_id`, `idle_duration_seconds`, `idle_timeout_seconds`, `timestamp` |

### Funnel Metrics

- **Suspend-to-resume conversion rate**: % of suspended workspaces that are eventually resumed (vs. deleted while suspended). High conversion indicates the feature is used for cost management, not as a precursor to deletion.
- **Mean time suspended**: Average duration workspaces spend in suspended state. Indicates whether users are using suspend for short breaks or long-term parking.
- **Auto-suspend ratio**: % of suspends triggered by idle timeout vs. manual. High auto-suspend ratio indicates the idle timeout is well-calibrated.
- **Resume success rate**: % of resume attempts that succeed. Should be >99%. Low rates indicate container runtime issues.
- **Resume latency p50/p95/p99**: Time from resume API call to container healthy. Target: p50 <5s, p95 <15s, p99 <30s.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields |
|-----------|-------|-------------------|
| Workspace suspend initiated | `info` | `workspace_id`, `repository_id`, `user_id`, `trigger` |
| Container stop called | `debug` | `workspace_id`, `vm_id`, `runtime` (docker/podman) |
| Container stop succeeded | `info` | `workspace_id`, `vm_id`, `duration_ms` |
| Container stop failed | `error` | `workspace_id`, `vm_id`, `error`, `runtime` |
| Workspace status updated to suspended | `info` | `workspace_id`, `previous_status`, `new_status` |
| SSE notification published (suspend) | `debug` | `workspace_id`, `channel`, `status` |
| Workspace resume initiated | `info` | `workspace_id`, `repository_id`, `user_id` |
| Container start called | `debug` | `workspace_id`, `vm_id` |
| Container healthcheck passed | `info` | `workspace_id`, `vm_id`, `duration_ms` |
| Container healthcheck failed/timeout | `error` | `workspace_id`, `vm_id`, `timeout_seconds`, `error` |
| Workspace status updated to running | `info` | `workspace_id`, `previous_status`, `new_status` |
| Idle workspace cleanup sweep | `info` | `idle_sessions_closed`, `workspaces_suspended`, `stale_workspaces_failed` |
| Cleanup sweep error | `error` | `job`, `workspace_id`, `error` |
| Auto-suspend triggered (last session ended) | `info` | `workspace_id`, `session_id` |

### Prometheus Metrics

**Counters:**
- `codeplane_workspace_suspends_total{trigger="manual|idle_timeout|session_end",status="success|error"}` — Total suspend operations
- `codeplane_workspace_resumes_total{status="success|error",error_type="none|no_vm|sandbox_unavailable|container_start_failed|healthcheck_timeout"}` — Total resume operations
- `codeplane_workspace_auto_suspend_total` — Total auto-suspends from cleanup scheduler

**Gauges:**
- `codeplane_workspaces_by_status{status="pending|starting|running|suspended|stopped|failed"}` — Current workspace count by status
- `codeplane_workspace_cleanup_last_sweep_timestamp` — Unix timestamp of last cleanup sweep

**Histograms:**
- `codeplane_workspace_suspend_duration_seconds` — Time to complete a suspend (container stop)
- `codeplane_workspace_resume_duration_seconds` — Time to complete a resume (container start + healthcheck)
- `codeplane_workspace_suspended_duration_seconds` — Duration workspaces spend in suspended state (observed at resume time)

### Alerts

**Alert: WorkspaceSuspendErrorRateHigh**
- Condition: `rate(codeplane_workspace_suspends_total{status="error"}[5m]) / rate(codeplane_workspace_suspends_total[5m]) > 0.1`
- Severity: Warning
- Runbook:
  1. Check `codeplane_workspace_suspends_total{status="error"}` for error breakdown
  2. Check server logs for `container stop failed` entries — look for `vm_id` and `error` fields
  3. Verify container runtime (Docker/Podman) is healthy: `docker ps`, `docker info`
  4. Check disk space on the container host — full disk can prevent container operations
  5. If errors are confined to specific workspaces, inspect those containers directly: `docker inspect {vm_id}`
  6. If the container runtime daemon itself is unhealthy, restart it and monitor

**Alert: WorkspaceResumeLatencyHigh**
- Condition: `histogram_quantile(0.95, rate(codeplane_workspace_resume_duration_seconds_bucket[5m])) > 30`
- Severity: Warning
- Runbook:
  1. Check `codeplane_workspace_resume_duration_seconds` histogram for distribution
  2. Identify if latency is in container start or healthcheck phase via logs (`container start called` vs. `healthcheck passed` timestamps)
  3. Check container host CPU/memory load — high load slows container starts
  4. Check if many workspaces are resuming simultaneously (thundering herd after maintenance)
  5. Increase `healthcheckTimeoutSecs` if containers legitimately need more boot time
  6. Check container images for bloated entrypoint scripts

**Alert: WorkspaceResumeErrorRateHigh**
- Condition: `rate(codeplane_workspace_resumes_total{status="error"}[5m]) / rate(codeplane_workspace_resumes_total[5m]) > 0.1`
- Severity: Critical
- Runbook:
  1. Check error type breakdown in `codeplane_workspace_resumes_total{error_type=...}`
  2. `no_vm`: Workspaces missing VM IDs — check DB for orphaned workspace records
  3. `sandbox_unavailable`: Container sandbox client not initialized — check server startup logs for sandbox init errors
  4. `container_start_failed`: Docker start failing — run `docker start {vm_id}` manually to get detailed error
  5. `healthcheck_timeout`: Container starts but doesn't become healthy — check container logs: `docker logs {vm_id}`
  6. If widespread, check container runtime daemon health and host resource availability

**Alert: CleanupSchedulerStale**
- Condition: `time() - codeplane_workspace_cleanup_last_sweep_timestamp > 300`
- Severity: Warning
- Runbook:
  1. Check if the server process is still running
  2. Check server logs for `[cleanup] unhandled error in sweep` entries
  3. Verify the cleanup scheduler was started (look for `[cleanup] scheduler started` in logs)
  4. If the server is running but sweeps aren't firing, the event loop may be blocked — check for long-running synchronous operations
  5. Restart the server process if the scheduler appears stuck

**Alert: SuspendedWorkspaceAccumulation**
- Condition: `codeplane_workspaces_by_status{status="suspended"} > 500`
- Severity: Info
- Runbook:
  1. This is informational — many suspended workspaces consume disk but not compute
  2. Review if users are creating workspaces and abandoning them in suspended state
  3. Consider implementing a policy to auto-delete workspaces suspended for >N days
  4. Check disk usage on container storage volumes

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Message | Recovery |
|------------|-------------|---------------|----------|
| Workspace not found | 404 | "workspace not found" | Verify workspace ID and repo scope |
| Missing workspace ID | 400 | "workspace id is required" | Provide a valid UUID |
| VM not provisioned (resume) | 409 | "workspace VM has not been provisioned" | Workspace was never fully created; delete and recreate |
| Sandbox client unavailable (resume) | 500 | "internal server error" | Server configuration issue; check container runtime |
| Container stop fails | 500 | "internal server error" | Container may be in a bad state; try again or force-delete |
| Container start fails (resume) | 500 | "internal server error" | Check container logs; container may be corrupted |
| Healthcheck timeout (resume) | 500 | "internal server error" | Container boots too slowly; check entrypoint and resources |
| DB update fails | 500 | "internal server error" | Database connectivity issue; transient, retry |
| Unauthenticated | 401 | "unauthorized" | Provide valid auth token or session |
| Insufficient permissions | 403 | "forbidden" | User lacks write access to repository |

## Verification

### API Integration Tests

- [ ] `POST /suspend` on a running workspace returns 200 with `status: "suspended"` and non-null `suspended_at`
- [ ] `POST /suspend` on a running workspace returns the full workspace object with all expected fields
- [ ] `POST /resume` on a suspended workspace returns 200 with `status: "running"` and null `suspended_at`
- [ ] `POST /resume` on a suspended workspace returns the full workspace object with all expected fields
- [ ] `POST /suspend` on an already-suspended workspace returns 200 with `status: "suspended"` (idempotent)
- [ ] `POST /suspend` on a stopped workspace returns 200 with current state (no-op)
- [ ] `POST /resume` on an already-running workspace returns 200 with `status: "running"` (idempotent)
- [ ] `POST /resume` on a workspace with no VM ID returns 409 with `"workspace VM has not been provisioned"`
- [ ] `POST /suspend` with empty `:id` param returns 400 with `"workspace id is required"`
- [ ] `POST /resume` with empty `:id` param returns 400 with `"workspace id is required"`
- [ ] `POST /suspend` with non-existent workspace ID returns 404
- [ ] `POST /resume` with non-existent workspace ID returns 404
- [ ] `POST /suspend` without authentication returns 401
- [ ] `POST /resume` without authentication returns 401
- [ ] `POST /suspend` updates `updated_at` timestamp
- [ ] `POST /resume` updates `updated_at` and `last_activity_at` timestamps
- [ ] `POST /resume` clears the `suspended_at` field (returns null)
- [ ] `GET /workspaces/:id` after suspend shows `status: "suspended"` and `suspended_at` is set
- [ ] `GET /workspaces/:id` after resume shows `status: "running"` and `suspended_at` is null
- [ ] `GET /workspaces/:id/ssh` after suspend: SSH info is not available (workspace is not running)
- [ ] `GET /workspaces/:id/ssh` after resume: SSH info is available with fresh connection details
- [ ] Suspend → Resume → Suspend → Resume cycle completes without error (multi-cycle)
- [ ] Suspend a workspace, then list workspaces: suspended workspace appears in list with correct status
- [ ] Concurrent suspend requests for the same workspace: both return 200, no error, final state is `suspended`
- [ ] Workspace name with 255 characters can be suspended and resumed without truncation issues
- [ ] Workspace name with unicode characters (emoji, CJK, RTL) can be suspended and resumed

### SSE Stream Integration Tests

- [ ] Connect to `/workspaces/:id/stream` before suspend: receive initial status event with current state
- [ ] Suspend workspace while SSE stream is connected: receive `workspace.status` event with `"suspended"` status
- [ ] Resume workspace while SSE stream is connected: receive `workspace.status` event with `"running"` status
- [ ] SSE event `data` field contains valid JSON with `workspace_id` and `status` fields
- [ ] SSE stream sends keep-alive comments (`:` lines) when no events are fired
- [ ] Multiple SSE clients connected to the same workspace all receive the suspend/resume events

### Auto-Suspend Integration Tests

- [ ] Create workspace, wait for idle timeout to expire, verify workspace auto-suspends
- [ ] Create workspace, create session, destroy session, verify workspace auto-suspends when active session count hits 0
- [ ] Create workspace with 2 sessions, destroy one session: workspace remains running
- [ ] Create workspace with 2 sessions, destroy both sessions: workspace auto-suspends
- [ ] Auto-suspended workspace can be manually resumed via API
- [ ] Cleanup scheduler marks stale pending workspaces (>5 min) as `failed`, not `suspended`

### CLI End-to-End Tests

- [ ] `codeplane workspace suspend <id> --repo OWNER/REPO --json` returns JSON with `status: "suspended"`
- [ ] `codeplane workspace resume <id> --repo OWNER/REPO --json` returns JSON with `status: "running"`
- [ ] `codeplane workspace status <id> --repo OWNER/REPO --json` shows `suspended_at` when suspended
- [ ] `codeplane workspace status <id> --repo OWNER/REPO --json` shows null `suspended_at` when running
- [ ] `codeplane workspace suspend` without auth fails with non-zero exit code
- [ ] `codeplane workspace resume` without auth fails with non-zero exit code
- [ ] `codeplane workspace suspend <invalid-id>` returns 404 error
- [ ] `codeplane workspace resume <invalid-id>` returns 404 error
- [ ] Full lifecycle: create → suspend → resume → delete (all via CLI, all succeed)
- [ ] Full lifecycle with `--json`: output is valid JSON at every step
- [ ] `codeplane workspace list --json` includes suspended workspaces with correct status
- [ ] `codeplane workspace watch <id>` receives status events for suspend/resume transitions
- [ ] `codeplane workspace ssh <id>` on a suspended workspace: behavior is defined (either auto-resumes or returns error)

### TUI End-to-End Tests (Playwright/Ink snapshot)

- [ ] Workspace list renders `[running]` badge for a running workspace
- [ ] Pressing `s` on a running workspace shows `[suspending…]` transitional badge
- [ ] After suspend API succeeds, badge shows `[suspended]`
- [ ] Pressing `r` on a suspended workspace shows `[resuming…]` transitional badge
- [ ] After resume API succeeds, badge shows `[running]`
- [ ] Pressing `s` on a suspended workspace is a no-op (no visual change, no API call)
- [ ] Pressing `r` on a running workspace is a no-op (no visual change, no API call)
- [ ] Pressing `s` twice quickly: second press is ignored (in-flight guard)
- [ ] Error from suspend API: badge reverts to `[running]`, error shown in status bar
- [ ] Error from resume API: badge reverts to `[suspended]`, error shown in status bar
- [ ] Workspace detail screen: "Suspended at" timestamp appears when suspended
- [ ] Workspace detail screen: SSH info shows "(unavailable while suspended)"
- [ ] Workspace detail screen: SSH info restores after resume
- [ ] Status bar message for suspend: `"Workspace '{name}' suspended"` in success color
- [ ] Status bar message for resume: `"Workspace '{name}' resumed"` in success color
- [ ] 403 error: status bar shows `"Permission denied"`
- [ ] 404 error: status bar shows `"Workspace not found"`
- [ ] 409 error: status bar shows `"Invalid state transition"`
- [ ] Workspace name >20 chars truncated with `…` in status bar messages
- [ ] Terminal resize during in-flight mutation: operation completes normally

### Cleanup Scheduler Integration Tests

- [ ] Cleanup scheduler starts and runs the idle workspace sweep
- [ ] Idle workspaces past timeout are suspended by the sweep
- [ ] Sweep logs idle session close count, workspace suspend count, and stale workspace fail count
- [ ] VM suspend failure during sweep is non-fatal: DB status still updates to `suspended`
- [ ] Sweep handles empty idle workspace list (no-op, no errors)
- [ ] Sweep handles DB query failure gracefully (error captured in SweepResult, scheduler continues)
- [ ] Scheduler can be stopped and restarted without issues

### Boundary and Load Tests

- [ ] Suspend a workspace with maximum-length name (255 characters): succeeds
- [ ] Resume a workspace whose container takes exactly 30 seconds to become healthy (boundary of healthcheck timeout): succeeds
- [ ] Resume a workspace whose container takes 31 seconds to become healthy: fails with timeout error
- [ ] Suspend 50 workspaces simultaneously via concurrent API calls: all succeed or are handled gracefully
- [ ] Cleanup sweep with 100 idle workspaces: all are suspended within one sweep cycle

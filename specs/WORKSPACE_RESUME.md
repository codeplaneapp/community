# WORKSPACE_RESUME

Specification for WORKSPACE_RESUME.

## High-Level User POV

When a Codeplane workspace has been suspended — whether by the user themselves, by the idle timeout, or because the last terminal session disconnected — it sits dormant on disk consuming no compute. All the user's files, installed packages, repository state, and configuration remain intact in the container's filesystem. Resuming is how the user brings that workspace back to life.

From any Codeplane surface — the CLI, TUI, web UI, or an editor — the user triggers a resume on their suspended workspace. The workspace transitions through a brief "resuming" phase while the container restarts and passes its health check, then settles into a fully operational "running" state. SSH access is restored, terminal sessions can be created again, and agent interactions become available. The whole process typically takes a few seconds.

The resume experience is designed to feel like reopening a laptop lid. Everything is where the user left it on the filesystem — their code changes, build artifacts, database files, shell history, and tooling configuration. The only thing not preserved is in-memory process state: running servers, background jobs, and open file handles from before the suspend are gone. The container goes through its normal startup sequence, which is fast because all the heavy dependency installation work is already done on disk.

Resume is safe to call at any time. If the workspace is already running, resume simply confirms the running state without performing redundant work. If the workspace was suspended minutes ago or days ago, the resume path is the same. This means automation scripts, editor integrations, and the CLI can call resume defensively without worrying about whether the workspace is actually suspended.

One particularly valuable pattern is the auto-resume workflow: when a user runs `codeplane workspace ssh` against a suspended workspace, or when an editor integration attempts to connect, the system can detect the suspended state and offer to resume the workspace before establishing the connection. This eliminates the friction of having to manually check workspace status before reconnecting after a break.

Real-time status updates flow to all connected clients during resume. If the TUI is open, the workspace badge transitions from "[suspended]" through "[resuming…]" with a spinner to "[running]" in green. If the CLI is in watch mode, the status event streams in live. This gives the user confidence that the resume is progressing and tells them exactly when SSH is available again.

## Acceptance Criteria

### Definition of Done

- [ ] A user can resume a suspended workspace, transitioning its status from `suspended` to `running`
- [ ] The container's filesystem is fully intact after resume — files, packages, jj/git state, and configuration are exactly as they were before suspend
- [ ] SSH access is restored after resume and the connection info endpoint returns valid credentials
- [ ] The `suspended_at` timestamp is cleared (set to null) upon successful resume
- [ ] The `last_activity_at` timestamp is touched upon successful resume to reset the idle timeout window
- [ ] Real-time SSE notifications are published for the `suspended` → `running` transition
- [ ] Resuming an already-running workspace is a safe no-op that returns the current running state
- [ ] The CLI `workspace resume` command works end-to-end with both human-readable and JSON output
- [ ] The TUI workspace screens support resume via the `r` keyboard shortcut with optimistic UI updates
- [ ] The web UI workspace detail page provides a "Resume" button when the workspace is suspended
- [ ] The API returns the full updated workspace object after a successful resume
- [ ] Resume latency (from API call to container healthy) is under 30 seconds at p95

### State Machine Constraints

- [ ] Only workspaces in `suspended` status are the primary target for resume
- [ ] Resuming an already-running workspace is an idempotent no-op — the service detects the running container and returns the current state without error
- [ ] Resuming a workspace with no provisioned VM ID (never fully created) returns `409 Conflict` with message `"workspace VM has not been provisioned"`
- [ ] Resuming a workspace whose container has been externally deleted returns an error (the container is `not_found`)
- [ ] Workspaces in `pending`, `starting`, or `failed` status cannot be resumed — these are not valid source states
- [ ] Resuming a workspace in `stopped` status is not supported — the container has been removed and must be recreated
- [ ] The status transitions during resume are: `suspended` → (container start) → `running`
- [ ] If the container health check fails during resume, the workspace status should reflect the failure rather than remaining in a stale `suspended` state

### Boundary Constraints

- [ ] Workspace ID must be a valid UUID (36 characters including dashes, lowercase hex with dashes in the pattern `8-4-4-4-12`)
- [ ] An invalid UUID format in the `:id` route parameter returns `400 Bad Request`
- [ ] An empty `:id` route parameter returns `400 Bad Request` with message `"workspace id is required"`
- [ ] The health check timeout for resume is 30 seconds by default — if the container does not become healthy (SSH port 22 ready) within this window, the resume fails
- [ ] The `idle_timeout_seconds` field on the workspace is a positive integer; its default of 1800 (30 minutes) is not modified by resume
- [ ] SSE channel names use UUID without dashes: `workspace_status_{uuid_no_dashes}`
- [ ] The workspace name may be up to 255 characters; resume does not validate or modify the name
- [ ] Resume does not modify `idle_timeout_seconds`, `name`, `persistence`, or `is_fork` — only `status`, `suspended_at`, `last_activity_at`, and `updated_at` are changed

### Edge Cases

- [ ] Container was externally stopped (e.g., `docker stop` run by an admin): `getVM` returns `stopped`, `startVM` restarts it — resume succeeds
- [ ] Container was externally deleted (e.g., `docker rm`): `getVM` returns `not_found`, `startVM` fails — resume returns an error with a clear message that the container no longer exists
- [ ] Container was externally started (e.g., `docker start` run manually): `getVM` returns `running` — resume detects this, reconciles DB status to `running`, clears `suspended_at`, and returns success
- [ ] Concurrent resume requests for the same workspace: both enter the service layer; the first performs the container start, the second sees the container already running and reconciles — both return `200` with `running` status
- [ ] Network timeout during container start: the health check timeout (30s) applies; if exceeded, resume fails
- [ ] Workspace deleted by another user while resume is in-flight: subsequent DB reload returns null, `404` returned
- [ ] Server shutdown (SIGTERM) during resume: container may be left running but DB may not be updated — on restart, the next status check should reconcile
- [ ] Resume immediately after suspend (rapid cycle): safe because suspend is synchronous — by the time the 200 for suspend returns, the container is stopped and the DB is updated
- [ ] Workspace with very large filesystem (tens of GB): container start time depends on Docker/Podman internals, not filesystem size — resume is not slower
- [ ] Workspace whose container image was pruned while suspended: `startVM` fails — resume returns error
- [ ] Multiple workspaces resumed in quick succession from the same repository: each operates independently on separate containers
- [ ] Resume called by a different user than the one who suspended the workspace: authorization check applies — only the workspace owner, repo admin, or repo owner can resume

## Design

### API Shape

**Resume Workspace**

```
POST /api/repos/:owner/:repo/workspaces/:id/resume
```

Request: No body required. Authentication required via session cookie or PAT.

**Response (200 — Success):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "repository_id": 42,
  "user_id": 7,
  "name": "my-workspace",
  "status": "running",
  "is_fork": false,
  "freestyle_vm_id": "codeplane-workspace-a1b2c3d4",
  "persistence": "sticky",
  "idle_timeout_seconds": 1800,
  "suspended_at": null,
  "last_activity_at": "2026-03-22T14:30:00.000Z",
  "created_at": "2026-03-22T08:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| HTTP Status | Condition | Response Body |
|-------------|-----------|---------------|
| 400 | Missing or empty `:id` param | `{ "message": "workspace id is required" }` |
| 400 | Invalid UUID format | `{ "message": "invalid workspace id format" }` |
| 401 | Unauthenticated | `{ "message": "unauthorized" }` |
| 403 | User does not own workspace or lacks repo write access | `{ "message": "forbidden" }` |
| 404 | Workspace not found or not scoped to user/repo | `{ "message": "workspace not found" }` |
| 409 | Workspace has no provisioned VM ID | `{ "message": "workspace VM has not been provisioned" }` |
| 409 | Workspace is in `pending`, `starting`, `failed`, or `stopped` state | `{ "message": "workspace cannot be resumed from current state" }` |
| 500 | Sandbox client unavailable | `{ "message": "internal server error" }` |
| 500 | Container start failed | `{ "message": "internal server error" }` |
| 500 | Health check timeout | `{ "message": "internal server error" }` |

**Workspace Status SSE Stream (resume-aware)**

```
GET /api/repos/:owner/:repo/workspaces/:id/stream
Accept: text/event-stream
```

Emits on channel `workspace_status_{uuid_no_dashes}`:
```
event: workspace.status
data: {"workspace_id":"uuid","status":"running"}
```

### SDK Shape

The workspace service in `@codeplane/sdk` exposes:

```typescript
resumeWorkspace(
  workspaceID: string,
  repositoryID: number,
  userID: number
): Promise<WorkspaceResponse | null>
```

The method performs:
1. Load workspace by `(workspaceID, repositoryID, userID)` — returns null if not found
2. Get VM ID from workspace record — return 409 if missing
3. Query container state via `sandbox.getVM(vmId)`
4. If container is already running: reconcile DB status to `running`, clear `suspended_at`, return
5. If container is stopped: call `sandbox.startVM(vmId)` with healthcheck timeout
6. Update DB: `status = "running"`, `suspended_at = null`, `last_activity_at = NOW()`, `updated_at = NOW()`
7. Publish SSE notification on workspace channel
8. Reload and return full workspace response

The container sandbox client provides:
```typescript
getVM(vmId: string): Promise<ContainerStatus>
startVM(vmId: string, healthcheckTimeoutSecs?: number): Promise<{ vmId: string; ports: PortMapping[] }>
```

### CLI Command

**Resume:**
```bash
codeplane workspace resume <id> [--repo OWNER/REPO] [--json]
```

Arguments:
- `<id>` (required): The workspace UUID to resume.

Options:
- `--repo OWNER/REPO`: Repository scope. If omitted, inferred from the current directory's remote.
- `--json`: Output the full workspace response as JSON.

**Human-readable output:**
```
✓ Workspace 'my-workspace' resumed
  Status:  running
  SSH:     ssh codeplane@localhost -p 2222
```

**JSON output (`--json`):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "my-workspace",
  "status": "running",
  "suspended_at": null,
  "last_activity_at": "2026-03-22T14:30:00.000Z"
}
```

Exit codes: `0` success, `1` error.

**SSH auto-resume behavior:** `codeplane workspace ssh <id>` on a suspended workspace detects the suspended state and prompts `"Workspace is suspended. Resume? [Y/n]"` — if confirmed, calls resume first, then connects.

### TUI UI

**Workspace List Screen:**
- `r` key on a focused suspended workspace: sends resume request
- `r` on a running workspace: no-op
- `r` while mutation is in-flight: no-op (double-fire prevention)

**Status badge transitions:**
- `[suspended]` (ANSI 245, muted gray) → `[resuming…]` (ANSI 178, yellow, braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms) → `[running]` (ANSI 34, green)
- Optimistic: `[resuming…]` applied immediately on keypress; reverts to `[suspended]` on API error (<16ms)

**Status bar messages:**
- Success: `"Workspace 'my-ws' resumed"` (green, 3s)
- 120+ cols: `"Workspace 'my-ws' resumed successfully"`
- Error 403: `"Permission denied"` (red)
- Error 404: `"Workspace not found"` (red)
- Error 409: `"Invalid state transition"` (red)
- Error 429: `"Rate limited"` (red)
- Error 500: `"Server error"` (red)
- Names >20 chars truncated with `…`

**Workspace Detail Screen:**
- `r` to resume (same guards)
- "Suspended at" row disappears on resume
- SSH info transitions from "(unavailable while suspended)" to live SSH command

### Web UI Design

**Suspended state:** Primary "Resume" button with play icon (▶), SSH info grayed out with "SSH unavailable while workspace is suspended", relative "Suspended at" timestamp.

**Resuming state:** Button disabled with spinner and "Resuming…", status badge pulses, SSE subscription active.

**Running state:** Badge green "Running", "Resume" replaced by "Suspend", SSH info active with Copy button, success toast.

**Error state:** Badge stays "Suspended", red error banner with reason, Resume button re-enables for retry. 409 (no VM) includes guidance to delete and recreate.

**Workspace List:** Resume action button per row for suspended workspaces, inline optimistic status update.

### Neovim Plugin API

- `:CodeplaneWorkspaceResume [id]` command
- Statusline suspended icon with keymap hint
- `require('codeplane').workspace.resume(id)` Lua API

### VS Code Extension

- `Codeplane: Resume Workspace` command palette entry
- Context menu "Resume" on suspended workspaces in tree view
- Status bar quick action to resume when suspended

### Documentation

1. **CLI Reference — `workspace resume`**: Usage, arguments, options, examples, error messages
2. **Workspace Lifecycle Guide — "Resuming a Workspace" section**: What happens during resume, typical latency, failure recovery, idle timeout reset behavior
3. **FAQ: "What happens to my running processes when a workspace is suspended and resumed?"**: In-memory state lost, filesystem preserved, use process managers for auto-restart
4. **FAQ: "My workspace won't resume / resume timed out"**: Troubleshooting — container deleted, Docker restarted, timeout too short, resource exhaustion
5. **TUI Keyboard Reference**: `r` (resume) in workspace list and detail screens
6. **API Reference — Resume Endpoint**: Request/response shapes, error codes, SSE stream format

## Permissions & Security

### Authorization

| Role | Resume Own Workspace | Resume Others' Workspace |
|------|---------------------|---------------------------|
| Repository Owner | ✅ | ✅ |
| Repository Admin | ✅ | ✅ |
| Repository Member (write) | ✅ | ❌ |
| Repository Read-Only | ❌ | ❌ |
| Anonymous / Unauthenticated | ❌ | ❌ |

Workspace operations are scoped to `(workspaceID, repositoryID, userID)`. The service layer queries workspaces filtered by all three dimensions, ensuring a user can only operate on their own workspaces. Repository owners and admins bypass the `userID` filter and can resume any workspace in the repository.

### Rate Limiting

- **Per-workspace rate limit**: 10 resume requests per minute per user per workspace. Prevents abuse from rapid resume/suspend cycling that could strain the container runtime.
- **Per-user global limit**: 60 workspace mutation requests per minute across all workspace operations (create, suspend, resume, delete). Protects against automated scripts manipulating many workspaces simultaneously.
- **429 response**: When rate-limited, the API returns `429 Too Many Requests` with a `Retry-After` header indicating seconds until the next allowed request.
- Auto-resume triggered by server-internal paths (e.g., CLI `workspace ssh` auto-detection) counts against the user's rate limit.

### Data Privacy

- Workspace IDs are UUIDs and do not contain PII.
- The resume response does not include SSH credentials — those must be fetched separately via `GET /workspaces/:id/ssh`, which has its own auth check and returns time-limited tokens (5-minute TTL).
- The `suspended_at` timestamp being cleared is not a privacy event.
- Container filesystem contents may contain user code and secrets; resume does not expose these through the API — they are only accessible via SSH after authentication.
- SSE stream channels use workspace IDs without dashes; no PII is transmitted over the channel name or in event payloads.
- Resume logs include `workspace_id`, `repository_id`, `user_id`, and `vm_id` — `user_id` is internal and not exposed to other users.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceResumed` | Workspace status transitions from `suspended` to `running` | `workspace_id`, `repository_id`, `user_id`, `suspended_duration_seconds` (time workspace was suspended), `resume_latency_ms` (time from API call to container healthy), `trigger_source` (`cli` \| `tui` \| `web_ui` \| `api` \| `vscode` \| `neovim` \| `ssh_auto`), `timestamp` |
| `WorkspaceResumeFailed` | Resume operation fails at any stage | `workspace_id`, `repository_id`, `user_id`, `error_type` (`no_vm` \| `sandbox_unavailable` \| `container_not_found` \| `container_start_failed` \| `healthcheck_timeout` \| `container_deleted`), `error_message`, `suspended_duration_seconds`, `timestamp` |
| `WorkspaceResumeIdempotent` | Resume called on an already-running workspace (reconciliation path) | `workspace_id`, `repository_id`, `user_id`, `trigger_source`, `timestamp` |

### Funnel Metrics and Success Indicators

| Metric | Description | Target |
|--------|-------------|--------|
| **Resume success rate** | `WorkspaceResumed` / (`WorkspaceResumed` + `WorkspaceResumeFailed`) | > 99% |
| **Resume latency p50** | p50 of `resume_latency_ms` across successful resumes | < 5 seconds |
| **Resume latency p95** | p95 of `resume_latency_ms` across successful resumes | < 15 seconds |
| **Resume latency p99** | p99 of `resume_latency_ms` across successful resumes | < 30 seconds |
| **Suspended-to-resumed conversion** | % of suspended workspaces eventually resumed (vs. deleted while suspended) | > 70% (indicates users value resume over recreate) |
| **Mean time suspended before resume** | Average of `suspended_duration_seconds` | Informational — indicates typical break patterns |
| **Idempotent resume ratio** | `WorkspaceResumeIdempotent` / total resume calls | Informational — high values suggest defensive calling, which is fine |
| **Error type distribution** | Breakdown of `WorkspaceResumeFailed` by `error_type` | `healthcheck_timeout` should be < 5% of failures; `container_not_found` should dominate (expected after host maintenance) |
| **Trigger source distribution** | Breakdown of `WorkspaceResumed` by `trigger_source` | Informational — indicates which clients drive resume usage |

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields |
|-----------|-------|-------------------|
| Workspace resume initiated | `info` | `workspace_id`, `repository_id`, `user_id`, `current_status`, `trigger_source` |
| Container state checked | `debug` | `workspace_id`, `vm_id`, `container_state` (`running` \| `stopped` \| `not_found`) |
| Container already running (reconciliation) | `info` | `workspace_id`, `vm_id`, `db_status`, `container_state` |
| Container start requested | `debug` | `workspace_id`, `vm_id`, `healthcheck_timeout_seconds` |
| Container health check passed | `info` | `workspace_id`, `vm_id`, `start_duration_ms`, `ports` |
| Container health check failed/timeout | `error` | `workspace_id`, `vm_id`, `timeout_seconds`, `error`, `elapsed_ms` |
| Container start failed | `error` | `workspace_id`, `vm_id`, `error`, `container_state` |
| Container not found during resume | `error` | `workspace_id`, `vm_id`, `expected_state` |
| Workspace status updated to running | `info` | `workspace_id`, `previous_status`, `new_status`, `suspended_duration_seconds` |
| SSE notification published (resume) | `debug` | `workspace_id`, `channel`, `status` |
| Resume called with no VM ID | `warn` | `workspace_id`, `repository_id`, `user_id` |
| Resume called on invalid source state | `warn` | `workspace_id`, `current_status`, `user_id` |
| Resume API error response | `warn` | `workspace_id`, `http_status`, `error_message`, `user_id` |

### Prometheus Metrics

**Counters:**
- `codeplane_workspace_resumes_total{status="success|error",error_type="none|no_vm|sandbox_unavailable|container_not_found|container_start_failed|healthcheck_timeout"}` — Total resume operations by outcome
- `codeplane_workspace_resume_idempotent_total` — Count of resume calls that found the workspace already running (reconciliation path)

**Gauges:**
- `codeplane_workspaces_by_status{status="pending|starting|running|suspended|stopped|failed"}` — Current workspace count by status

**Histograms:**
- `codeplane_workspace_resume_duration_seconds` — Time from resume API call to container healthy. Buckets: 1s, 2s, 5s, 10s, 15s, 20s, 30s
- `codeplane_workspace_suspended_duration_seconds` — How long the workspace was suspended before resume. Buckets: 1m, 5m, 15m, 30m, 1h, 2h, 6h, 12h, 24h, 72h

### Alerts

**Alert: WorkspaceResumeErrorRateHigh**
- Condition: `rate(codeplane_workspace_resumes_total{status="error"}[5m]) / rate(codeplane_workspace_resumes_total[5m]) > 0.1`
- Severity: Critical
- Runbook:
  1. Check error type breakdown: query `codeplane_workspace_resumes_total{status="error"}` by `error_type` label
  2. If `error_type="container_not_found"` dominates: containers were removed while suspended. Check if Docker/Podman was restarted (`systemctl status docker`). Check if `docker system prune` was run. This is expected after host maintenance — affected users must recreate workspaces.
  3. If `error_type="sandbox_unavailable"`: the container sandbox client was not initialized. Check server startup logs for sandbox init errors. Verify Docker socket is accessible by the server process.
  4. If `error_type="container_start_failed"`: containers exist but won't start. Pick a failing workspace from logs, run `docker start <vm_id>` manually, check `docker logs <vm_id>`. Common causes: host out of disk (`df -h`), OOM (`dmesg | grep -i oom`), corrupted container.
  5. If `error_type="healthcheck_timeout"`: containers start but SSH port doesn't become ready. Check `docker logs <vm_id>` for SSH daemon errors. Check if the workspace base image's SSH service is configured correctly. Consider increasing the healthcheck timeout.
  6. If `error_type="no_vm"`: workspaces exist in DB but were never provisioned. Check for orphaned workspace records from failed creation flows.

**Alert: WorkspaceResumeLatencyHigh**
- Condition: `histogram_quantile(0.95, rate(codeplane_workspace_resume_duration_seconds_bucket[5m])) > 20`
- Severity: Warning
- Runbook:
  1. Check histogram distribution — bimodal (some fast, some slow) or uniformly slow?
  2. If uniformly slow: check container host CPU/memory load (`top`, `free -m`). High host load slows all container starts.
  3. If bimodal: some containers have heavier startup sequences. Check `docker logs` for slow-starting containers.
  4. Check if many workspaces are resuming simultaneously (thundering herd after maintenance). Latency recovers as queue drains.
  5. Check Docker storage driver performance: `docker system df`, `iostat`. Slow I/O causes slow starts.
  6. If latency is in healthcheck phase: SSH daemon may be slow to start. Verify container's `sshd` configuration.

**Alert: WorkspaceResumeContainerNotFoundSpike**
- Condition: `rate(codeplane_workspace_resumes_total{error_type="container_not_found"}[10m]) > 5`
- Severity: Warning
- Runbook:
  1. A spike of "container not found" errors indicates bulk container removal. Check if `docker system prune` or Docker daemon restart occurred.
  2. Run `docker ps -a --filter label=tech.codeplane.workspace` to verify which containers still exist.
  3. Cross-reference with `codeplane_workspaces_by_status{status="suspended"}` gauge.
  4. Communicate to affected users that workspaces need to be recreated.
  5. Consider implementing a reconciliation sweep that proactively detects missing containers.

**Alert: WorkspaceResumeHealthcheckTimeoutSpike**
- Condition: `rate(codeplane_workspace_resumes_total{error_type="healthcheck_timeout"}[10m]) > 3`
- Severity: Warning
- Runbook:
  1. Multiple healthcheck timeouts suggest SSH daemon failing to start.
  2. Pick a failing workspace from logs. Run `docker start <vm_id>` manually, then `docker exec <vm_id> ss -tlnp | grep 22`.
  3. Check `docker logs <vm_id>` for sshd startup errors.
  4. If workspace base image was recently updated, verify SSH configuration.
  5. If transient (host load), it should resolve. If persistent, investigate the image.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Message | Recovery |
|------------|-------------|---------------|----------|
| Workspace not found | 404 | "workspace not found" | Verify workspace ID and repo scope |
| Missing workspace ID | 400 | "workspace id is required" | Provide a valid UUID |
| VM not provisioned | 409 | "workspace VM has not been provisioned" | Delete workspace and create a new one |
| Container externally deleted | 500 | "internal server error" | Delete workspace and create a new one |
| Container start fails | 500 | "internal server error" | Check container logs; may need to recreate |
| Health check timeout | 500 | "internal server error" | Check container's SSH daemon; may need longer timeout |
| Sandbox client unavailable | 500 | "internal server error" | Server config issue; check Docker socket |
| DB update fails | 500 | "internal server error" | Transient; retry. Status reconciles on next check. |
| Unauthenticated | 401 | "unauthorized" | Provide valid auth credentials |
| Insufficient permissions | 403 | "forbidden" | Request repo write access from admin |
| Rate limited | 429 | "too many requests" | Wait and retry after `Retry-After` header |

## Verification

### API Integration Tests

- [ ] `POST /resume` on a suspended workspace returns 200 with `status: "running"` and `suspended_at: null`
- [ ] `POST /resume` on a suspended workspace returns the full workspace object with all expected fields (`id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`)
- [ ] `POST /resume` clears the `suspended_at` field (response shows `null`)
- [ ] `POST /resume` updates the `updated_at` timestamp to current time
- [ ] `POST /resume` updates the `last_activity_at` timestamp to current time
- [ ] `POST /resume` on an already-running workspace returns 200 with `status: "running"` (idempotent, no error)
- [ ] `POST /resume` on a workspace with no VM ID returns 409 with `"workspace VM has not been provisioned"`
- [ ] `POST /resume` with empty `:id` param returns 400 with `"workspace id is required"`
- [ ] `POST /resume` with a non-UUID string returns 400
- [ ] `POST /resume` with non-existent workspace UUID returns 404
- [ ] `POST /resume` without authentication returns 401
- [ ] `POST /resume` by a user who does not own the workspace (and is not repo admin/owner) returns 403
- [ ] `POST /resume` by a repo admin on another user's workspace returns 200 (admin override)
- [ ] `POST /resume` by a repo owner on another user's workspace returns 200 (owner override)
- [ ] `GET /workspaces/:id` after resume shows `status: "running"` and `suspended_at: null`
- [ ] `GET /workspaces/:id/ssh` after resume returns valid SSH connection info with a token
- [ ] `GET /workspaces/:id/ssh` while workspace is suspended returns an error or empty SSH info
- [ ] Suspend → Resume → Suspend → Resume cycle completes without error (multi-cycle stability)
- [ ] Resume a workspace, then list workspaces: resumed workspace appears with `status: "running"` in list
- [ ] Concurrent resume requests for the same workspace: both return 200, final state is `running`
- [ ] Resume a workspace whose container was externally started: reconciles DB to `running`, returns 200
- [ ] Resume a workspace whose container was externally deleted: returns an error (not silent success)
- [ ] Resume a workspace with maximum-length name (255 characters): succeeds without truncation
- [ ] Resume a workspace with unicode name (emoji, CJK, RTL characters): succeeds
- [ ] Resume response does not include SSH credentials (credentials only via `/ssh` endpoint)
- [ ] `POST /resume` does not modify `idle_timeout_seconds`, `name`, `persistence`, or `is_fork`
- [ ] Resume a workspace that was auto-suspended by idle timeout: succeeds identically to manual resume
- [ ] Resume a workspace that was auto-suspended by last session ending: succeeds identically

### SSE Stream Integration Tests

- [ ] Connect to `/workspaces/:id/stream` before resume: receive initial status event with `"suspended"` status
- [ ] Resume workspace while SSE stream is connected: receive `workspace.status` event with `"running"` status
- [ ] SSE event `data` field contains valid JSON with `workspace_id` and `status` fields
- [ ] Multiple SSE clients connected to the same workspace all receive the resume event
- [ ] SSE stream sends keep-alive comments (`:` lines) between events
- [ ] SSE stream reconnection after disconnect: client receives current status on reconnect

### CLI End-to-End Tests

- [ ] `codeplane workspace resume <id> --repo OWNER/REPO` prints success message and exits 0
- [ ] `codeplane workspace resume <id> --repo OWNER/REPO --json` returns valid JSON with `status: "running"` and `suspended_at: null`
- [ ] `codeplane workspace resume <invalid-uuid>` returns non-zero exit code with error message
- [ ] `codeplane workspace resume <nonexistent-uuid> --repo OWNER/REPO` returns non-zero exit code with 404 message
- [ ] `codeplane workspace resume` without auth fails with non-zero exit code
- [ ] `codeplane workspace status <id> --repo OWNER/REPO --json` after resume shows `suspended_at: null` and `status: "running"`
- [ ] `codeplane workspace watch <id> --repo OWNER/REPO` receives `running` status event after resume
- [ ] Full lifecycle via CLI: `create` → `suspend` → `resume` → `delete` — all succeed sequentially
- [ ] Full lifecycle via CLI with `--json`: output is valid JSON at every step
- [ ] `codeplane workspace list --repo OWNER/REPO --json` after resume: workspace status is `"running"`
- [ ] `codeplane workspace ssh <id>` on a suspended workspace: prompts to resume, then connects
- [ ] CLI resume on a workspace the user does not own: fails with 403 error

### TUI End-to-End Tests

- [ ] Workspace list renders `[suspended]` badge for a suspended workspace in muted gray
- [ ] Pressing `r` on a suspended workspace shows `[resuming…]` transitional badge with spinner
- [ ] After resume API succeeds and SSE confirms, badge shows `[running]` in green
- [ ] Pressing `r` on a running workspace is a no-op (no visual change, no API call)
- [ ] Pressing `r` on a `pending` workspace is a no-op
- [ ] Pressing `r` on a `failed` workspace is a no-op
- [ ] Pressing `r` twice quickly on a suspended workspace: second press is ignored (in-flight guard)
- [ ] Error from resume API: badge reverts to `[suspended]`, error shown in status bar
- [ ] Error 403: status bar shows `"Permission denied"` in red
- [ ] Error 404: status bar shows `"Workspace not found"` in red
- [ ] Error 409: status bar shows `"Invalid state transition"` in red
- [ ] Workspace detail screen: "Suspended at" row disappears after resume
- [ ] Workspace detail screen: SSH info transitions from "(unavailable while suspended)" to showing SSH command
- [ ] Status bar message: `"Workspace 'my-ws' resumed"` in success color
- [ ] Workspace name >20 chars truncated with `…` in status bar messages
- [ ] Terminal resize during in-flight resume: operation completes normally
- [ ] Keybinding hint footer shows `r:resume` when focused on a suspended workspace
- [ ] Keybinding hint footer does not show `r:resume` when focused on a running workspace

### Web UI Playwright Tests

- [ ] Workspace detail page shows "Resume" button when workspace is suspended
- [ ] Clicking "Resume" disables the button and shows "Resuming…" spinner
- [ ] After resume succeeds, status badge shows "Running" in green
- [ ] After resume succeeds, "Resume" button is replaced by "Suspend" button
- [ ] After resume succeeds, SSH connection info section becomes active
- [ ] Success toast "Workspace resumed" appears after resume
- [ ] If resume fails, status badge remains "Suspended" and error banner is displayed
- [ ] If resume fails with 409 (no VM), error message includes guidance to recreate
- [ ] "Resume" button is not shown when workspace is already running
- [ ] Workspace list page shows "Resume" action for suspended workspaces
- [ ] Clicking "Resume" on workspace list updates the row status inline
- [ ] Navigating away and back during resume: status is accurate on return

### Boundary and Load Tests

- [ ] Resume a workspace whose container takes exactly 29 seconds to become healthy (within 30s timeout): succeeds
- [ ] Resume a workspace whose container takes 31 seconds to become healthy (exceeds 30s timeout): fails with timeout error
- [ ] Resume 20 workspaces simultaneously via concurrent API calls: all succeed or return appropriate errors (no crashes)
- [ ] Resume a workspace with maximum-length name (255 characters): API and CLI handle it correctly
- [ ] Resume with a workspace ID that is exactly 36 characters (valid UUID): succeeds
- [ ] Resume with a workspace ID that is 37 characters (one char too long): returns 400
- [ ] Resume with a workspace ID that is 35 characters (one char too short): returns 400
- [ ] Rate limit test: send 11 resume requests in rapid succession for the same workspace: 10 succeed, 11th returns 429
- [ ] Rate limit `Retry-After` header is present and contains a positive integer on 429 response

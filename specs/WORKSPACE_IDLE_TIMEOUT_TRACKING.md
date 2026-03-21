# WORKSPACE_IDLE_TIMEOUT_TRACKING

Specification for WORKSPACE_IDLE_TIMEOUT_TRACKING.

## High-Level User POV

When you create a workspace in Codeplane, you don't want to think about whether it's wasting compute while you step away for lunch, switch tasks, or go home for the day. Idle timeout tracking is the system that watches workspace activity and automatically suspends workspaces that haven't been used recently, saving compute resources without any manual intervention.

Every workspace has a configurable idle timeout — by default, 30 minutes. Codeplane continuously tracks the last meaningful activity on each workspace: when you open an SSH connection, start a terminal session, resume a suspended workspace, or first provision it. If 30 minutes pass with no new activity, the background cleanup system automatically suspends the workspace. Your files, installed packages, jj repository state, and configuration remain fully intact on disk. Only in-memory process state — running servers, background jobs, open file handles — is lost, exactly as if you had manually suspended the workspace yourself.

The idle timeout is configurable at the repository level. Repository administrators can set a custom timeout in the `.codeplane/config.yml` file, and all new workspaces created for that repository will inherit the configured value. This means a repository with long-running build processes can have a longer timeout, while a repository used for quick code reviews might use a shorter one to aggressively reclaim resources.

Users can see the idle timeout value and the last activity timestamp for any workspace they own. The workspace detail view in the CLI, TUI, and web UI surfaces both values, letting the user understand when their workspace will be auto-suspended and how much idle time remains. When a workspace is auto-suspended due to idle timeout, connected clients receive a real-time status notification, so the user isn't surprised by a sudden SSH disconnection — they see the workspace transition to "suspended" in their TUI, editor status bar, or web dashboard.

Session-level idle tracking adds a second layer. Each terminal session within a workspace also has an idle timeout. When a session sits idle past its timeout, the system closes it. If that was the last active session on the workspace, the workspace itself auto-suspends. This means a workspace that a user connected to, opened a terminal, then forgot about will efficiently clean itself up without any human action.

The idle timeout system also handles edge cases gracefully. Workspaces stuck in a "pending" or "starting" state for more than 5 minutes are automatically marked as "failed" rather than left hanging indefinitely. This prevents phantom workspaces from consuming provisioning resources forever.

The overall experience is that workspaces feel self-managing. Users create them, use them, and walk away. The idle timeout system ensures resources are reclaimed automatically, and resume is always one action away when the user returns.

## Acceptance Criteria

### Definition of Done

- [ ] Workspaces track a `last_activity_at` timestamp that is updated on every meaningful activity event (provision, session create, resume, SSH info access)
- [ ] Each workspace stores an `idle_timeout_seconds` value (positive integer, default 1800 = 30 minutes)
- [ ] A background cleanup scheduler runs at a configurable interval (default every 60 seconds) and detects workspaces where `now > last_activity_at + idle_timeout_seconds`
- [ ] Idle workspaces detected by the cleanup scheduler are automatically suspended (container suspended, DB status set to `suspended`, `suspended_at` recorded)
- [ ] Each workspace session tracks its own `last_activity_at` and `idle_timeout_secs` independently
- [ ] Idle sessions detected by the cleanup scheduler are automatically closed
- [ ] When the last active session on a workspace is destroyed or closed, the workspace auto-suspends
- [ ] Workspaces stuck in `pending` or `starting` status for longer than the configurable stale threshold (default 300 seconds / 5 minutes) are automatically marked as `failed`
- [ ] The `idle_timeout_seconds` value is visible in the workspace detail response across API, CLI, and TUI
- [ ] The `last_activity_at` timestamp is visible in the workspace session response
- [ ] Repository-level idle timeout configuration via `.codeplane/config.yml` is supported and inherited by new workspaces created for that repository
- [ ] Real-time SSE notifications are published when a workspace is auto-suspended due to idle timeout
- [ ] The cleanup scheduler publishes structured logs for each sweep including counts of idle sessions closed, workspaces suspended, and stale workspaces failed
- [ ] Container suspend failures during idle cleanup are non-fatal — the DB status is still updated to `suspended`

### Boundary Constraints

- [ ] `idle_timeout_seconds` must be a positive integer (minimum 1, no upper bound enforced, but values above 86400 / 24 hours should produce a warning in configuration validation)
- [ ] `idle_timeout_seconds` default is exactly 1800 (30 minutes)
- [ ] Cleanup scheduler interval must be a positive integer in milliseconds; default is 60,000 ms (1 minute)
- [ ] Stale pending threshold must be a positive integer in seconds; default is 300 (5 minutes)
- [ ] `last_activity_at` is always a valid ISO 8601 timestamp
- [ ] `suspended_at` is null when workspace is running, or a valid ISO 8601 timestamp when suspended
- [ ] Workspace ID is a valid UUID (36 characters, format `8-4-4-4-12`)
- [ ] Session ID is a valid UUID
- [ ] Workspace name may be up to 255 characters
- [ ] Workspace name may contain unicode characters (emoji, CJK, RTL)
- [ ] SSE channel name uses UUID without dashes: `workspace_status_{uuid_no_dashes}` — this is a fixed format, not user-configurable
- [ ] Repository-level `workspace.idle_timeout_seconds` in `.codeplane/config.yml` must be a positive integer when specified
- [ ] If `.codeplane/config.yml` omits `workspace.idle_timeout_seconds`, the system default (1800) applies

### Edge Cases

- [ ] Workspace has zero active sessions and no recent activity: auto-suspends on next cleanup sweep
- [ ] Workspace has one active session and that session goes idle: session is closed, then workspace auto-suspends because active session count drops to zero
- [ ] Workspace has two active sessions, one goes idle: idle session is closed, workspace remains running because one active session remains
- [ ] Workspace has two active sessions, both go idle in the same sweep: both sessions closed, workspace auto-suspends
- [ ] Cleanup sweep finds no idle workspaces: no-op, no errors
- [ ] Cleanup sweep finds 100+ idle workspaces: all are processed in a single sweep
- [ ] Container suspend fails during cleanup (e.g., container already stopped externally): DB status is still updated to `suspended`; error is logged but does not halt the sweep
- [ ] DB query fails during cleanup sweep: error is captured and logged; scheduler continues running and retries on next interval
- [ ] Workspace is deleted by another user while cleanup sweep is processing it: delete wins; no crash
- [ ] Workspace is manually suspended by the user moments before the idle sweep runs: sweep sees status as already `suspended` and skips it
- [ ] Workspace is manually resumed moments after an idle sweep suspends it: resume works normally; `last_activity_at` is reset
- [ ] `idle_timeout_seconds` is set to 1 (minimum): workspace is auto-suspended within the next sweep after 1 second of inactivity
- [ ] `idle_timeout_seconds` is set to a very large value (e.g., 999999): workspace effectively never auto-suspends
- [ ] Two cleanup scheduler instances running concurrently (e.g., during server restart overlap): both may attempt to suspend the same workspace; this is idempotent
- [ ] Server shutdown occurs while cleanup sweep is running: sweep may not complete; next server start resumes normal scheduling
- [ ] Workspace with no container provisioned (no `freestyle_vm_id`): suspend attempt skips the container operation, updates DB status only
- [ ] Stale pending workspace has no container: marked as `failed` without attempting container operations
- [ ] `.codeplane/config.yml` contains a non-integer or negative `idle_timeout_seconds`: configuration sync should reject the invalid value and keep the previous setting
- [ ] `.codeplane/config.yml` is deleted: workspaces keep their existing timeout; new workspaces get the system default
- [ ] A session's `idle_timeout_secs` and its parent workspace's `idle_timeout_secs` differ: each is evaluated independently against its own `last_activity_at`

## Design

### API Shape

**Workspace Detail Response (idle-timeout-aware fields)**

`GET /api/repos/:owner/:repo/workspaces/:id` includes:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "running",
  "idle_timeout_seconds": 1800,
  "suspended_at": null,
  "created_at": "2026-03-22T08:00:00.000Z",
  "updated_at": "2026-03-22T10:30:00.000Z"
}
```

When auto-suspended due to idle timeout:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "suspended",
  "idle_timeout_seconds": 1800,
  "suspended_at": "2026-03-22T10:30:00.000Z",
  "created_at": "2026-03-22T08:00:00.000Z",
  "updated_at": "2026-03-22T10:30:00.000Z"
}
```

**Workspace Session Response (idle-timeout-aware fields)**

`GET /api/repos/:owner/:repo/workspace/sessions/:id` includes:
```json
{
  "id": "session-uuid",
  "workspace_id": "workspace-uuid",
  "status": "running",
  "last_activity_at": "2026-03-22T10:25:00.000Z",
  "idle_timeout_secs": 1800,
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:25:00.000Z"
}
```

**Workspace Status SSE Stream**

`GET /api/repos/:owner/:repo/workspaces/:id/stream`

When idle timeout triggers auto-suspend:
```
event: workspace.status
data: {"workspace_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","status":"suspended"}
```

**Health / Status Endpoint (cleanup scheduler awareness)**

`GET /api/health` should reflect whether the cleanup scheduler is running (informational, not blocking).

### SDK Shape

The `@codeplane/sdk` workspace service exposes:

```typescript
// Activity tracking
touchWorkspaceActivity(workspaceId: string): Promise<void>
touchWorkspaceSessionActivity(sessionId: string): Promise<void>

// Idle detection (called by cleanup scheduler)
listIdleWorkspaces(): Promise<IdleWorkspace[]>
listIdleWorkspaceSessions(): Promise<IdleSession[]>
listStalePendingWorkspaces(staleSecs: number): Promise<StaleWorkspace[]>

// Cleanup scheduler integration
cleanupIdleWorkspaces(): Promise<SweepResult>
failStalePendingWorkspaces(): Promise<number>
```

The `CleanupScheduler` exposes:
```typescript
interface CleanupSchedulerConfig {
  workspaceIntervalMs?: number;       // Default: 60_000
  stalePendingWorkspaceSecs?: number;  // Default: 300
  containerClient?: ContainerSandboxClient;
}

start(): void
stop(): void
```

Workspace response types:
```typescript
interface WorkspaceResponse {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  status: "pending" | "starting" | "running" | "suspended" | "stopped" | "failed";
  idle_timeout_seconds: number;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkspaceSessionResponse {
  id: string;
  workspace_id: string;
  status: string;
  last_activity_at: string;
  idle_timeout_secs: number;
  created_at: string;
  updated_at: string;
}
```

### CLI Command

**Workspace View (idle-timeout-aware):**
```bash
codeplane workspace view <id> [--repo OWNER/REPO] [--json]
```

Human-readable output includes:
```
Workspace: my-workspace
Status:              running
Idle Timeout:        30 minutes
Uptime:              2h 15m
Persistence:         sticky
Created:             2h ago
```

When suspended due to idle timeout:
```
Workspace: my-workspace
Status:              suspended
Idle Timeout:        30 minutes
Suspended At:        5m ago
Persistence:         sticky
Created:             3h ago
```

JSON output includes the raw `idle_timeout_seconds` integer and ISO timestamps.

**Workspace Watch (idle-timeout-aware):**
```bash
codeplane workspace watch <id> [--repo OWNER/REPO] [--json]
```

Streams status events including auto-suspend transitions.

**Workspace SSH (auto-resume aware):**
```bash
codeplane workspace ssh <id> [--repo OWNER/REPO]
```

If the workspace is suspended (potentially due to idle timeout), the CLI detects this and prompts: `"Workspace is suspended. Resume? [Y/n]"`. On confirmation, it calls resume and then connects.

### TUI UI

**Workspace List Screen:**
- Each workspace row displays the status badge reflecting auto-suspend state
- `[suspended]` badge (ANSI 245, muted gray) appears for idle-timeout-suspended workspaces
- Status bar shows `"Workspace 'name' auto-suspended (idle timeout)"` when an SSE event arrives

**Workspace Detail Screen:**
- Displays `Idle Timeout: 30 minutes` (human-readable conversion)
- Shows `Suspended at: 5m ago` when workspace is suspended
- SSH info shows `(unavailable while suspended)` when auto-suspended
- Pressing `r` triggers resume with the standard resume flow

**Status Badge Colors:**
- `[running]` — green (ANSI 34)
- `[suspended]` — muted gray (ANSI 245)
- Transitional states use yellow (ANSI 178) with braille spinner

### Web UI Design

**Workspace Detail Page:**
- Displays idle timeout value in workspace metadata: "Idle timeout: 30 minutes"
- Shows "Last activity" relative timestamp that updates in real-time
- When auto-suspended, shows informational banner: "This workspace was automatically suspended after 30 minutes of inactivity. Resume to continue working."
- Resume button prominently displayed for suspended workspaces

**Workspace List Page:**
- Status column reflects current state including `suspended`
- Tooltip on suspended workspaces: "Suspended due to inactivity"

### Repository Configuration

**`.codeplane/config.yml` workspace section:**
```yaml
workspace:
  idle_timeout_seconds: 3600  # 1 hour
```

When committed and synced, new workspaces for this repository inherit the configured timeout. Existing workspaces retain their creation-time timeout.

### Documentation

1. **Workspace Lifecycle Guide — "Idle Timeout" section**: Explains what idle timeout is, the default value, how activity is tracked, what triggers a reset, and what happens when a workspace is auto-suspended. Includes a clear statement that in-memory state is lost but filesystem is preserved.
2. **Repository Configuration Guide — `workspace.idle_timeout_seconds`**: How to set a custom idle timeout per-repository via `.codeplane/config.yml`. Includes examples for common values (15 minutes for aggressive cleanup, 2 hours for long builds).
3. **CLI Reference — `workspace view`**: Documents the `idle_timeout_seconds` field in output.
4. **FAQ: "Why was my workspace suspended?"**: Explains auto-suspend due to idle timeout and last-session-end triggers. Includes how to check the timeout value and how to resume.
5. **FAQ: "How do I change the idle timeout?"**: Points to `.codeplane/config.yml` configuration.
6. **Admin Operations Guide — "Cleanup Scheduler"**: Documents the cleanup scheduler's role, interval, and behavior for idle workspaces, stale pending workspaces, and idle sessions.

## Permissions & Security

### Authorization

| Role | View Idle Timeout Settings | Configure Repo Timeout | Benefit from Auto-Suspend | Resume After Auto-Suspend |
|------|--------------------------|----------------------|--------------------------|---------------------------|
| Repository Owner | ✅ | ✅ | ✅ (own workspaces) | ✅ (any workspace) |
| Repository Admin | ✅ | ✅ | ✅ (own workspaces) | ✅ (any workspace) |
| Repository Member (write) | ✅ | ❌ | ✅ (own workspaces) | ✅ (own workspaces only) |
| Repository Read-Only | ✅ (view only) | ❌ | N/A (cannot create workspaces) | N/A |
| Anonymous | ❌ | ❌ | N/A | N/A |

The cleanup scheduler is a server-internal process and does not require user-level authorization. It operates with system-level access to all workspaces across all repositories.

### Rate Limiting

- The cleanup scheduler itself is server-internal and not rate-limited
- API calls to view workspace details (which include idle timeout info) follow the standard API rate limit (configurable per route family)
- Resume operations after auto-suspend follow the existing workspace mutation rate limits: 10 requests per minute per user per workspace, 60 requests per minute per user globally
- The cleanup scheduler processes workspaces sequentially within a sweep to avoid overwhelming the container runtime

### Data Privacy

- `idle_timeout_seconds` is a numeric configuration value, not PII
- `last_activity_at` is a timestamp associated with a workspace/session ID, not directly with a user identity in the API response
- The cleanup scheduler logs include `workspace_id`, `repository_id`, and counts — no user PII is emitted in cleanup logs
- SSE notifications for auto-suspend include `workspace_id` and `status` — no PII
- Repository-level configuration in `.codeplane/config.yml` is committed to the repository and visible to all repository collaborators

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceAutoSuspended` | Cleanup scheduler suspends an idle workspace | `workspace_id`, `repository_id`, `idle_duration_seconds` (actual time since last activity), `idle_timeout_seconds` (configured timeout), `active_session_count_at_suspend` (should be 0), `timestamp` |
| `WorkspaceSessionIdleClosed` | Cleanup scheduler closes an idle session | `session_id`, `workspace_id`, `repository_id`, `idle_duration_seconds`, `idle_timeout_secs`, `remaining_active_sessions` (count after close), `timestamp` |
| `WorkspaceAutoSuspendedLastSessionEnd` | Workspace auto-suspends because the last active session was destroyed | `workspace_id`, `repository_id`, `session_id` (the destroyed session), `total_sessions_created` (lifetime count), `timestamp` |
| `WorkspaceStalePendingFailed` | Cleanup marks a stale pending workspace as failed | `workspace_id`, `repository_id`, `pending_duration_seconds`, `stale_threshold_seconds`, `timestamp` |
| `WorkspaceActivityTouched` | Activity timestamp is updated | `workspace_id`, `trigger` (`provision` | `session_create` | `resume` | `ssh_info`), `timestamp` |
| `CleanupSweepCompleted` | A cleanup sweep finishes | `idle_sessions_closed`, `workspaces_suspended`, `stale_workspaces_failed`, `sweep_duration_ms`, `timestamp` |

### Funnel Metrics and Success Indicators

| Metric | Description | Target |
|--------|-------------|--------|
| **Auto-suspend ratio** | % of workspace suspends triggered by idle timeout vs. manual | Informational — high ratio indicates the timeout is well-calibrated and users trust it |
| **Resume-after-auto-suspend rate** | % of auto-suspended workspaces eventually resumed | > 60% (indicates users return to their work rather than abandoning workspaces) |
| **Mean idle duration before auto-suspend** | Average of `idle_duration_seconds` from `WorkspaceAutoSuspended` events | Should cluster around the configured timeout value; significantly lower values indicate a bug |
| **Stale pending failure rate** | `WorkspaceStalePendingFailed` count / total workspace creates | < 2% (high rates indicate provisioning reliability problems) |
| **Cleanup sweep duration p95** | p95 of `sweep_duration_ms` | < 10 seconds |
| **Idle timeout configuration adoption** | % of repositories with a custom `workspace.idle_timeout_seconds` | Informational — rising adoption indicates users are tuning the feature |
| **Compute hours saved** | Estimated compute time saved by auto-suspend | Informational — key value metric for the feature |

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields |
|-----------|-------|-------------------|
| Cleanup scheduler started | `info` | `workspace_interval_ms`, `stale_pending_secs`, `has_container_client` |
| Cleanup scheduler stopped | `info` | `uptime_ms` |
| Idle workspace sweep started | `debug` | `timestamp` |
| Idle sessions found | `info` | `count`, `session_ids[]` |
| Idle session closed | `info` | `session_id`, `workspace_id`, `idle_duration_seconds` |
| Idle workspaces found | `info` | `count`, `workspace_ids[]` |
| Idle workspace container suspend attempted | `debug` | `workspace_id`, `vm_id` |
| Idle workspace container suspend succeeded | `info` | `workspace_id`, `vm_id`, `duration_ms` |
| Idle workspace container suspend failed (non-fatal) | `warn` | `workspace_id`, `vm_id`, `error` |
| Idle workspace DB status updated to suspended | `info` | `workspace_id`, `previous_status`, `new_status` |
| Stale pending workspaces found | `info` | `count`, `workspace_ids[]` |
| Stale pending workspace marked failed | `info` | `workspace_id`, `pending_duration_seconds` |
| Workspace activity touched | `debug` | `workspace_id`, `trigger` |
| Session activity touched | `debug` | `session_id`, `trigger` |
| Cleanup sweep completed | `info` | `idle_sessions_closed`, `workspaces_suspended`, `stale_workspaces_failed`, `sweep_duration_ms` |
| Cleanup sweep error (unhandled) | `error` | `job`, `error`, `stack` |
| Auto-suspend triggered by last session end | `info` | `workspace_id`, `session_id` |
| Auto-suspend skipped (no VM ID) | `debug` | `workspace_id` |
| Auto-suspend skipped (already suspended/stopped) | `debug` | `workspace_id`, `current_status` |
| SSE notification published (auto-suspend) | `debug` | `workspace_id`, `channel`, `status` |

### Prometheus Metrics

**Counters:**
- `codeplane_workspace_auto_suspends_total{trigger="idle_timeout|session_end"}` — Total auto-suspend operations by trigger type
- `codeplane_workspace_idle_sessions_closed_total` — Total idle sessions closed by the cleanup scheduler
- `codeplane_workspace_stale_pending_failed_total` — Total stale pending workspaces marked as failed
- `codeplane_workspace_activity_touches_total{trigger="provision|session_create|resume|ssh_info"}` — Total activity touch events by trigger
- `codeplane_cleanup_sweep_total{status="success|error"}` — Total cleanup sweeps completed

**Gauges:**
- `codeplane_workspaces_by_status{status="pending|starting|running|suspended|stopped|failed"}` — Current workspace count by status
- `codeplane_workspace_cleanup_last_sweep_timestamp` — Unix timestamp of last completed sweep
- `codeplane_workspace_cleanup_scheduler_running` — Boolean gauge (1 = running, 0 = stopped)

**Histograms:**
- `codeplane_cleanup_sweep_duration_seconds` — Duration of each cleanup sweep. Buckets: 0.1s, 0.5s, 1s, 2s, 5s, 10s, 30s, 60s
- `codeplane_workspace_idle_duration_at_suspend_seconds` — Actual idle duration when auto-suspended. Buckets: 60s, 300s, 600s, 1200s, 1800s, 3600s, 7200s, 14400s, 43200s, 86400s
- `codeplane_workspace_container_suspend_duration_seconds` — Time to complete container suspend during cleanup. Buckets: 0.5s, 1s, 2s, 5s, 10s, 30s

### Alerts

**Alert: CleanupSchedulerStopped**
- Condition: `codeplane_workspace_cleanup_scheduler_running == 0` for 5 minutes
- Severity: Warning
- Runbook:
  1. Check if the Codeplane server process is running: `ps aux | grep codeplane`
  2. Check server logs for `cleanup scheduler stopped` or crash entries
  3. If the server is running but the scheduler is not, look for `[cleanup] unhandled error` entries
  4. Restart the server process: `systemctl restart codeplane`
  5. After restart, verify `codeplane_workspace_cleanup_scheduler_running` returns to 1
  6. If the scheduler keeps stopping, investigate error logs for root cause (likely persistent DB or container client failure)

**Alert: CleanupSweepStale**
- Condition: `time() - codeplane_workspace_cleanup_last_sweep_timestamp > 300`
- Severity: Warning
- Runbook:
  1. No sweep has completed in 5 minutes (default interval is 60s)
  2. Check if server process is alive: `ps aux | grep codeplane`
  3. Check server logs for `[cleanup]` entries — last sweep may have a very long duration or unhandled error
  4. If event loop is blocked, look for CPU-bound operations in server logs
  5. If DB queries timeout, check database connectivity and query performance
  6. Restart server if scheduler appears stuck. Monitor after restart.

**Alert: CleanupSweepDurationHigh**
- Condition: `histogram_quantile(0.95, rate(codeplane_cleanup_sweep_duration_seconds_bucket[5m])) > 30`
- Severity: Warning
- Runbook:
  1. Sweep taking >30s at p95 suggests many idle workspaces or slow container operations
  2. Check `codeplane_workspaces_by_status{status="running"}` — large count means more work per sweep
  3. Check `codeplane_workspace_container_suspend_duration_seconds` — slow container suspend calls inflate sweep time
  4. If container suspend is slow, check runtime health: `docker info`, `docker system df`, host I/O
  5. Consider increasing `workspaceIntervalMs` to give more time between sweeps
  6. If running workspace count is very high (>500), consider batching or parallelizing the sweep

**Alert: AutoSuspendContainerFailureRateHigh**
- Condition: Log-based detection: >20% of container suspend calls during cleanup fail within a 10-minute window
- Severity: Warning
- Runbook:
  1. Container suspend failures during cleanup are non-fatal (DB status still updates), but indicate container runtime issues
  2. Check server logs for `idle workspace container suspend failed` — look at `error` and `vm_id` fields
  3. Verify container runtime health: `docker ps`, `docker info`, `systemctl status docker`
  4. Check if failing containers still exist: `docker inspect {vm_id}`
  5. If containers were externally removed, this is expected — DB cleanup still works
  6. If container runtime is unhealthy, restart it and monitor

**Alert: StalePendingWorkspacesSpike**
- Condition: `rate(codeplane_workspace_stale_pending_failed_total[10m]) > 5`
- Severity: Warning
- Runbook:
  1. Spike of stale pending failures indicates workspaces being created but never reaching `running`
  2. Check recent workspace creation logs for provisioning errors
  3. Verify container runtime can create new containers: `docker run --rm hello-world`
  4. Check if sandbox client is properly configured in server's service registry
  5. Check disk space on container host — full disk prevents container creation
  6. Check network connectivity if workspace provisioning involves pulling images
  7. If transient (e.g., after container runtime restart), rate should settle

### Error Cases and Failure Modes

| Error Case | Impact | Detection | Recovery |
|------------|--------|-----------|----------|
| Cleanup scheduler fails to start | No idle workspace cleanup | `codeplane_workspace_cleanup_scheduler_running == 0` at startup | Check server startup logs; restart server |
| Cleanup scheduler crashes mid-sweep | Current sweep lost; scheduler may stop | `CleanupSweepStale` alert | Server restart recovers; unprocessed workspaces caught on next sweep |
| DB query for idle workspaces times out | Sweep cannot detect idle workspaces | Error log; sweep duration spike | Check DB connectivity; optimize query |
| Container suspend call hangs | Sweep blocks, delaying others | Sweep duration spike | Container runtime timeout applies; consider per-workspace timeout cap |
| Container runtime unavailable | Auto-suspend cannot stop containers (DB still updates) | Log warnings for container suspend failures | Container runtime restart; workspaces marked `suspended` in DB regardless |
| Race between manual resume and idle sweep | Both may run concurrently | No error — resume resets `last_activity_at` | Naturally resolved by activity tracking |
| Stale pending workspace has no container | Marked as `failed` without container ops | Log entry | User must recreate workspace |
| `.codeplane/config.yml` has invalid timeout | Config sync rejects value | Config sync error log | Fix config file; previous valid setting preserved |

## Verification

### API Integration Tests

- [ ] `GET /workspaces/:id` returns `idle_timeout_seconds` as a positive integer
- [ ] `GET /workspaces/:id` returns `idle_timeout_seconds` with default value of 1800 when no custom timeout is configured
- [ ] `GET /workspaces/:id` returns `last_activity_at` as a valid ISO 8601 timestamp (via session response if applicable)
- [ ] Creating a workspace returns `idle_timeout_seconds` in the response
- [ ] Creating a workspace in a repo with custom `workspace_idle_timeout_secs` returns the custom value
- [ ] Creating a workspace in a repo without custom config returns the default 1800
- [ ] Workspace response `suspended_at` is `null` when workspace is `running`
- [ ] Workspace response `suspended_at` is a valid ISO 8601 timestamp when workspace is `suspended`
- [ ] Session response includes `last_activity_at` and `idle_timeout_secs`
- [ ] `POST /workspaces/:id/resume` resets `last_activity_at` to approximately current time
- [ ] `POST /workspace/sessions` (create session) touches `last_activity_at` on the parent workspace
- [ ] After auto-suspend, `GET /workspaces/:id` returns `status: "suspended"` and non-null `suspended_at`
- [ ] After auto-suspend, `GET /workspaces/:id/ssh` returns error or empty (workspace not running)
- [ ] SSE stream receives `workspace.status` event with `"suspended"` when idle timeout triggers
- [ ] SSE event data is valid JSON with `workspace_id` and `status` fields
- [ ] Multiple SSE clients connected to the same workspace all receive the auto-suspend event
- [ ] Workspace with `idle_timeout_seconds: 1` is auto-suspended within 2 sweep intervals (≤120 seconds with 60s default interval)
- [ ] Workspace with very large `idle_timeout_seconds` (86400) is NOT auto-suspended after one sweep interval
- [ ] After resume following auto-suspend, `idle_timeout_seconds` retains its configured value (not reset)
- [ ] After resume following auto-suspend, `suspended_at` is cleared to `null`

### Cleanup Scheduler Integration Tests

- [ ] Cleanup scheduler starts when the server boots
- [ ] Cleanup scheduler runs the idle workspace sweep at the configured interval
- [ ] Sweep detects a workspace that has been idle for longer than `idle_timeout_seconds` and suspends it
- [ ] Sweep ignores workspaces that have been active within the timeout window
- [ ] Sweep ignores workspaces in `suspended`, `stopped`, or `failed` status
- [ ] Sweep only targets workspaces in `running` status
- [ ] Sweep closes idle sessions where `now > last_activity_at + idle_timeout_secs`
- [ ] Sweep ignores sessions in `closed` or `stopped` status
- [ ] Closing the last active session on a workspace triggers auto-suspend of that workspace
- [ ] Closing one of two active sessions on a workspace does NOT trigger auto-suspend
- [ ] Sweep marks workspaces in `pending` status for longer than stale threshold as `failed`
- [ ] Sweep marks workspaces in `starting` status for longer than stale threshold as `failed`
- [ ] Sweep does NOT mark `running` workspaces as `failed` (only `pending`/`starting`)
- [ ] Container suspend failure during sweep is non-fatal: DB status still updates to `suspended`
- [ ] Container suspend failure is logged as a warning (not an error that halts the sweep)
- [ ] Sweep with no idle workspaces, no idle sessions, no stale workspaces: completes successfully with zero counts
- [ ] Sweep logs include `idle_sessions_closed`, `workspaces_suspended`, `stale_workspaces_failed` counts
- [ ] Cleanup scheduler can be stopped and restarted without duplicate sweeps or missed intervals
- [ ] Sweep handles DB connection failure gracefully (error captured, scheduler continues)
- [ ] Sweep processes all idle workspaces in a single pass (not just one per interval)

### Session-to-Workspace Auto-Suspend Tests

- [ ] Destroy the only active session on a running workspace → workspace auto-suspends
- [ ] Destroy one of two active sessions → workspace remains running
- [ ] Destroy both sessions (sequentially) → workspace auto-suspends after the second destroy
- [ ] Destroy a session on a workspace that is already suspended → no error, no change
- [ ] Create a session (touches workspace activity), wait for session idle timeout, session closes, workspace auto-suspends
- [ ] Create two sessions, one goes idle and is closed by sweep, other remains active → workspace stays running
- [ ] Create two sessions, both go idle, sweep closes both → workspace auto-suspends

### CLI End-to-End Tests

- [ ] `codeplane workspace view <id> --repo OWNER/REPO --json` includes `idle_timeout_seconds` field
- [ ] `codeplane workspace view <id> --repo OWNER/REPO` displays "Idle Timeout: 30 minutes" in human-readable format
- [ ] `codeplane workspace view <id> --repo OWNER/REPO --json` after auto-suspend shows `status: "suspended"` and non-null `suspended_at`
- [ ] `codeplane workspace list --repo OWNER/REPO --json` includes idle-timeout-suspended workspaces with correct status
- [ ] `codeplane workspace watch <id> --repo OWNER/REPO` receives the auto-suspend status event
- [ ] `codeplane workspace ssh <id>` on an idle-timeout-suspended workspace prompts to resume
- [ ] Full lifecycle: `create` → wait for idle timeout → verify `suspended` → `resume` → verify `running` (all via CLI)

### TUI End-to-End Tests

- [ ] Workspace list shows `[suspended]` badge for an auto-suspended workspace
- [ ] Pressing `r` on an auto-suspended workspace triggers resume flow
- [ ] Status bar shows workspace auto-suspend notification when SSE event arrives
- [ ] Workspace detail screen displays `Idle Timeout: 30 minutes` value
- [ ] Workspace detail screen displays `Suspended at` timestamp for auto-suspended workspace
- [ ] SSH info section shows `(unavailable while suspended)` for auto-suspended workspace

### Boundary and Load Tests

- [ ] Workspace with `idle_timeout_seconds: 1` (minimum valid value): auto-suspended within 2 sweep intervals
- [ ] Workspace with `idle_timeout_seconds: 86400` (24 hours): NOT auto-suspended within 10 sweep intervals
- [ ] Workspace with `idle_timeout_seconds: 0`: rejected at creation time or treated as "never auto-suspend"
- [ ] Workspace with `idle_timeout_seconds: -1`: rejected at creation time
- [ ] Workspace with `idle_timeout_seconds: 2147483647` (max int32): accepted, effectively never auto-suspends
- [ ] 100 idle workspaces all past their timeout: all suspended in a single sweep
- [ ] 500 idle workspaces: sweep completes within 60 seconds (before next interval)
- [ ] Sweep running concurrently with manual suspend: no crash, no data corruption, idempotent outcome
- [ ] Sweep running concurrently with manual resume: resume wins (activity is touched, next sweep won't re-suspend)
- [ ] Stale pending threshold at exact boundary (workspace pending for exactly 300 seconds): verify behavior (should fail)
- [ ] Stale pending threshold just under boundary (299 seconds): workspace NOT marked as failed
- [ ] Workspace name with 255 characters: correctly handled by cleanup and status updates
- [ ] Workspace name with unicode (emoji, CJK): correctly handled by cleanup logs and status notifications
- [ ] Cleanup sweep with container client unavailable (nil): skips container operations, updates DB only
- [ ] Cleanup sweep with DB returning duplicate idle workspaces: handles gracefully (dedup or process idempotently)

### Web UI Playwright Tests

- [ ] Workspace detail page displays `Idle Timeout: 30 minutes` in the metadata section
- [ ] When workspace is auto-suspended while the detail page is open, the status badge transitions to `Suspended`
- [ ] Auto-suspend informational banner appears with correct timeout duration text
- [ ] Resume button is enabled after auto-suspend
- [ ] Clicking Resume after auto-suspend follows the standard resume flow
- [ ] Workspace list page shows updated `Suspended` status after auto-suspend
- [ ] Navigating to workspace detail after auto-suspend: page loads with `Suspended` state and `Suspended at` timestamp

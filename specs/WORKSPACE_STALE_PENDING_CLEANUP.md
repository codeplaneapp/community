# WORKSPACE_STALE_PENDING_CLEANUP

Specification for WORKSPACE_STALE_PENDING_CLEANUP.

## High-Level User POV

When a user creates a workspace in Codeplane — whether from the web UI, CLI, TUI, or an automated flow like the issue-to-workspace pipeline — the workspace enters a "pending" or "starting" state while Codeplane provisions the underlying compute environment. Under normal conditions this takes seconds. However, if something goes wrong during provisioning — a network partition, a container runtime failure, a resource exhaustion event — the workspace can become stuck indefinitely in this transitional state. Without automatic intervention, the user would see a workspace that appears to be perpetually loading, never becoming usable, and potentially blocking them from creating a new workspace for the same repository.

The Stale Pending Workspace Cleanup feature ensures that workspaces which remain stuck in "pending" or "starting" for longer than a configurable timeout (default: 5 minutes) are automatically detected, marked as failed, and reported to the user. This happens in two complementary ways.

First, a background cleanup process runs on a regular schedule (every 60 seconds) and scans for any workspace that has been in a provisioning state without a VM allocation for too long. When it finds one, it transitions the workspace to a "failed" state. Any client that is watching that workspace's status stream — whether the web UI, TUI, or CLI — receives an immediate notification that the workspace has failed, rather than being left to wait indefinitely.

Second, whenever a user attempts to create a new workspace, the system proactively checks for any existing "zombie" workspaces — those stuck in pending/starting without a VM — and fails them before proceeding. This means that even if the background cleanup hasn't run yet, the user is never blocked from creating a new workspace because of a stale one.

From the user's perspective, the experience is: if workspace creation fails or gets stuck, within a few minutes the workspace shows as "failed" and the user can retry or create a new one without manual intervention. The user is never left staring at an infinite spinner. The status transitions are visible everywhere — in workspace list views, detail views, status badges, and real-time streams — so the user always has an honest picture of what happened.

## Acceptance Criteria

### Definition of Done

- [ ] Workspaces in `pending` or `starting` state without a VM allocation (`freestyle_vm_id` is empty) that have not been updated within the stale threshold are automatically transitioned to `failed` status.
- [ ] The stale threshold is configurable and defaults to 300 seconds (5 minutes).
- [ ] The background sweep runs at a configurable interval, defaulting to every 60 seconds.
- [ ] When a stale workspace is marked as failed, an SSE notification is emitted on the workspace's status channel so all connected clients receive the transition in real time.
- [ ] When a user attempts to create a new workspace, any existing zombie workspaces for the same repository and user are proactively failed before the new workspace is created.
- [ ] A workspace that has a VM allocated (`freestyle_vm_id` is non-empty) is never considered stale, even if it is in `pending` or `starting` state.
- [ ] The cleanup process is idempotent — running it multiple times with no new stale workspaces produces no side effects.
- [ ] The cleanup process is resilient — a failure to mark one workspace as failed does not prevent the sweep from continuing to process other stale workspaces.
- [ ] The sweep logs a summary line when it transitions any workspaces, including the count of workspaces transitioned.
- [ ] The sweep silently completes (no summary log) when there are zero stale workspaces to process.
- [ ] Workspace status in all client surfaces (web workspace list, workspace detail, TUI workspace views, CLI workspace list/view, desktop sync status) reflects the `failed` status accurately.
- [ ] The feature is listed in the `WORKSPACES_AND_TERMINALS` feature group in `specs/features.ts` as `WORKSPACE_STALE_PENDING_CLEANUP`.

### Edge Cases

- [ ] A workspace that transitions from `pending` to `starting` resets its `updated_at`, which restarts the stale timer.
- [ ] A workspace whose `updated_at` is null falls back to `created_at` for staleness calculation.
- [ ] A workspace in `running`, `suspended`, `stopped`, or `failed` state is never selected by the stale pending query, regardless of its `updated_at` age.
- [ ] If the database is temporarily unreachable during a sweep, the error is caught, logged, and the scheduler continues its next interval without crashing.
- [ ] Concurrent sweep executions (e.g., from multiple server instances) do not cause duplicate status-update errors; the status update is idempotent (setting `failed` on an already-`failed` workspace is a no-op).
- [ ] Workspaces that are forks follow the same stale detection rules as primary workspaces.
- [ ] The proactive zombie check during workspace creation only fails non-fork zombies for the requesting user and repository scope; it does not affect other users' or other repositories' workspaces.

### Boundary Constraints

- [ ] Stale threshold minimum: 60 seconds (values below this are clamped to 60).
- [ ] Stale threshold maximum: 86,400 seconds (24 hours).
- [ ] Sweep interval minimum: 10,000 milliseconds (10 seconds).
- [ ] Sweep interval maximum: 600,000 milliseconds (10 minutes).
- [ ] The stale pending query orders results by `updated_at ASC` to process the oldest stuck workspaces first.

## Design

### Background Cleanup Scheduler

The stale pending cleanup is one of six background jobs managed by the `CleanupScheduler`. It runs within the `sweepIdleWorkspaces` job alongside idle workspace suspension and idle session closure.

**Sweep behavior:**

1. Query all workspaces where `status IN ('pending', 'starting')` AND `freestyle_vm_id = ''` AND `updated_at < NOW() - stalePendingWorkspaceSecs`.
2. For each result, update `status` to `failed`.
3. Emit a `pg_notify` on `workspace_status_{workspaceID}` with payload `"failed"`.
4. Log a summary line: `[cleanup] workspace sweep: N stale workspaces failed`.

**Proactive zombie detection on workspace creation:**

1. Before creating a new primary workspace, list all workspaces for the given `(repositoryId, userId)`.
2. For each non-fork workspace in `pending` or `starting` state with an empty `freestyle_vm_id` and `elapsed > STALE_AFTER_SECONDS * 1000`, mark it as `failed` and notify.
3. Proceed with new workspace creation.

### API Shape

No new API endpoints are introduced for this feature. The cleanup is entirely server-side and automatic. The effects are visible through existing endpoints:

- `GET /api/repos/:owner/:repo/workspaces` — workspace list includes `status: "failed"` for cleaned-up workspaces.
- `GET /api/repos/:owner/:repo/workspaces/:id` — workspace detail returns `status: "failed"`.
- `GET /api/repos/:owner/:repo/workspaces/:id/stream` — SSE stream delivers `"failed"` status payload in real time when the cleanup fires.
- `POST /api/repos/:owner/:repo/workspaces` — creation endpoint proactively fails zombies before creating a new workspace.

### SDK Shape

The `WorkspaceService` exposes the following method for the cleanup scheduler:

```
cleanupStalePendingWorkspaces(): Promise<void>
```

This method queries stale workspaces using the configured threshold, transitions them to `failed`, and emits SSE notifications.

The `CleanupSchedulerConfig` exposes:

```
stalePendingWorkspaceSecs?: number  // Default: 300
```

### Web UI Design

No new UI screens or components are required. The existing workspace list and detail views already display workspace status badges. When a workspace transitions to `failed`:

- The workspace list shows the workspace with a red/error status badge reading "Failed".
- The workspace detail view updates in real time (via the existing SSE subscription) to show the failed state.
- If the user was watching a workspace spinner waiting for provisioning, the spinner is replaced by a failure indicator with a prompt to retry.
- Failed workspaces remain in the list until explicitly deleted by the user.

### CLI Command

No new CLI commands are introduced. Existing commands reflect the cleanup behavior:

- `codeplane workspace list` — shows `failed` status for cleaned-up workspaces.
- `codeplane workspace view <id>` — shows `failed` status.
- `codeplane workspace create` — proactively fails zombie workspaces before creating a new one, so the user never encounters "workspace already exists" errors due to stuck provisioning.
- `codeplane workspace watch <id>` — the status stream delivers the `failed` event in real time.

### TUI UI

No new TUI screens are required. The existing workspace screens display status. When a workspace transitions to `failed`, the TUI workspace list and detail views update accordingly via the shared data hooks.

### Desktop

The desktop app benefits automatically since it embeds the daemon (which runs the cleanup scheduler) and renders the web UI (which subscribes to SSE streams). No desktop-specific changes are required.

### Editor Integrations

VS Code and Neovim workspace-related views reflect workspace status from the API. Failed workspaces appear with their correct status. No editor-specific changes are required.

### Documentation

The following documentation should be written for end users:

- **Workspace lifecycle documentation**: Explain the workspace states (`pending` → `starting` → `running` → `suspended` / `failed` / `stopped`) and note that workspaces stuck in provisioning are automatically failed after 5 minutes.
- **Self-hosting operations guide**: Document the `stalePendingWorkspaceSecs` configuration option for administrators who want to adjust the timeout threshold.
- **Troubleshooting guide**: Add a section explaining what it means when a workspace shows as "Failed" shortly after creation, with guidance to check container runtime availability, resource quotas, and network connectivity to the sandbox provider.

## Permissions & Security

### Authorization

- **Workspace creation (which triggers proactive zombie cleanup)**: Requires the creating user to be authenticated and have at least `Member` (write) access to the repository. The zombie cleanup is scoped to the requesting user's own workspaces only.
- **Background cleanup scheduler**: Runs as a system-level process with database access. It operates across all users and repositories — this is intentional since stale workspaces from any user need to be cleaned up for system health.
- **Reading workspace status (to see the `failed` state)**: Follows existing workspace visibility rules — workspace owners and repository members can see workspace status.

### Rate Limiting

- The background sweep is self-rate-limited by its interval timer (default: 60 seconds). There is no external API trigger for the sweep, so abuse through external requests is not possible.
- The proactive zombie check during workspace creation is scoped to the requesting user's workspaces for a single repository, which bounds the query scope.
- Workspace creation itself is subject to existing rate limiting middleware on the API layer.

### Data Privacy

- No PII is exposed through the cleanup process. Workspace status transitions do not include user-identifying information in the SSE payload (only the status string).
- Log messages include workspace IDs (UUIDs) but not user emails, names, or other PII.
- The stale pending query does not expose workspace contents, environment variables, or secrets.

## Telemetry & Product Analytics

### Business Events

| Event | Description |
|---|---|
| `WorkspaceStalePendingCleaned` | Fired each time the background sweep transitions a workspace from pending/starting to failed. |
| `WorkspaceZombieDetectedOnCreate` | Fired when the proactive zombie check during workspace creation detects and fails a zombie workspace. |

### Event Properties

**`WorkspaceStalePendingCleaned`:**
- `workspace_id` (string) — UUID of the workspace.
- `repository_id` (string) — Repository the workspace belonged to.
- `user_id` (string) — Owner of the workspace.
- `previous_status` (string) — `"pending"` or `"starting"`.
- `age_seconds` (number) — How long the workspace was stuck before cleanup.
- `source` (string) — `"background_sweep"`.

**`WorkspaceZombieDetectedOnCreate`:**
- `zombie_workspace_id` (string) — UUID of the zombie workspace.
- `new_workspace_name` (string) — Name of the workspace being created.
- `repository_id` (string) — Repository context.
- `user_id` (string) — User who triggered the creation.
- `zombie_age_seconds` (number) — How long the zombie had been stuck.

### Success Indicators

- **Stale workspace count trending toward zero**: Over time, the number of `WorkspaceStalePendingCleaned` events per day should be low and stable. A spike indicates a systemic provisioning problem.
- **Mean time to cleanup**: The average `age_seconds` across cleaned workspaces should be close to `stalePendingWorkspaceSecs` (300s), indicating the sweep is running promptly.
- **Zero user-reported "stuck workspace" issues**: Users should never need to file a support request about a workspace that won't start.
- **Workspace creation success rate**: The ratio of successful workspace creations to total attempts should remain high (>95%). Zombie cleanup on create should prevent creation failures due to stale state.
- **Retry rate after cleanup**: Users who experience a cleaned-up workspace should successfully create a new one on their next attempt (>90% retry success).

## Observability

### Logging Requirements

| Log Line | Level | Structured Context | Trigger |
|---|---|---|---|
| `[cleanup] workspace sweep: N idle sessions closed, M workspaces suspended, K stale workspaces failed` | `info` | `{ idle_sessions: N, suspended: M, stale_failed: K }` | When any workspace/session cleanup occurs. |
| `[cleanup] unhandled error in sweep: <error>` | `error` | `{ error: string, job: string }` | When the top-level sweep promise rejects. |
| `failed to mark stale workspace <id> as failed: <error>` | `warn` | `{ workspace_id: string, error: string }` | When an individual workspace status update fails within the sweep. |
| Proactive zombie detection during creation | `debug` | `{ repository_id, user_id, zombie_count: N }` | When `failStalePendingWorkspaces` finds and cleans zombies. |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workspace_stale_pending_cleaned_total` | Counter | `source=background_sweep\|on_create` | Total number of workspaces transitioned from pending/starting to failed due to stale cleanup. |
| `codeplane_workspace_stale_pending_age_seconds` | Histogram | `source` | Distribution of how long workspaces were stuck before cleanup. Buckets: 60, 120, 180, 300, 600, 900, 1800. |
| `codeplane_workspace_sweep_duration_seconds` | Histogram | `job=idle-workspaces` | Duration of each sweep cycle. Buckets: 0.01, 0.05, 0.1, 0.5, 1, 5, 10. |
| `codeplane_workspace_sweep_errors_total` | Counter | `job=idle-workspaces` | Total number of errors encountered during sweeps. |
| `codeplane_workspace_pending_current` | Gauge | — | Current number of workspaces in pending/starting state. Useful for alerting before they become stale. |

### Alerts

#### Alert: HighStalePendingWorkspaceRate

**Condition**: `rate(codeplane_workspace_stale_pending_cleaned_total[15m]) > 0.1` (more than ~6 stale workspaces per hour).

**Severity**: Warning

**Runbook**:
1. Check if the container sandbox runtime is healthy: verify the sandbox client can connect and list VMs.
2. Check system resource utilization (CPU, memory, disk) on the host running the sandbox runtime.
3. Check for recent deployments or configuration changes that may have broken VM provisioning.
4. Inspect the server logs for `failed to mark stale workspace` entries to see if there's a pattern (specific repository, specific user, all workspaces).
5. Verify network connectivity between the Codeplane server and the sandbox provider.
6. If the sandbox runtime is down, restart it. If resources are exhausted, scale up or throttle new workspace creation.
7. If the issue persists after sandbox recovery, check the workspace creation code path for regressions.

#### Alert: WorkspaceSweepConsistentErrors

**Condition**: `increase(codeplane_workspace_sweep_errors_total{job="idle-workspaces"}[30m]) > 10`

**Severity**: Warning

**Runbook**:
1. Check server logs for `[cleanup] unhandled error in sweep` and `failed to mark stale workspace` entries.
2. Verify database connectivity — the sweep queries require DB access. Check connection pool health.
3. Check for table locks or long-running transactions that might be blocking the workspace status update.
4. Verify the `workspaces` table schema hasn't been altered in a way that breaks the stale pending query.
5. If errors are transient (network blips), they should self-resolve. Monitor for 15 more minutes.
6. If errors persist, restart the server process to reinitialize the cleanup scheduler and DB connections.

#### Alert: WorkspaceSweepNotRunning

**Condition**: `absent(codeplane_workspace_sweep_duration_seconds_count{job="idle-workspaces"}[5m])` or `increase(codeplane_workspace_sweep_duration_seconds_count{job="idle-workspaces"}[5m]) == 0`

**Severity**: Critical

**Runbook**:
1. Check if the Codeplane server process is running. If crashed, check crash logs and restart.
2. Check for deadlocks or event-loop stalls in the Bun process (high CPU, unresponsive health endpoint).
3. Verify the cleanup scheduler was started: look for `[cleanup] scheduler started with 6 background workers` in recent startup logs.
4. Check if a misconfigured interval (e.g., extremely large `workspaceIntervalMs`) is preventing the sweep from firing.
5. Restart the server process. If the sweep resumes, check historical logs for what caused the previous stall.

#### Alert: LargeBacklogOfPendingWorkspaces

**Condition**: `codeplane_workspace_pending_current > 20` for 10 minutes.

**Severity**: Warning

**Runbook**:
1. A large backlog of pending workspaces suggests the provisioning pipeline is bottlenecked.
2. Check the sandbox runtime for capacity limits (max concurrent VMs, resource quotas).
3. Check if workspace creation is being triggered in bulk (e.g., by an automated pipeline or agent storm).
4. Review workspace creation logs for repeated provisioning failures that are not being caught by the stale cleanup.
5. Consider temporarily increasing the stale threshold if provisioning is legitimately slow, or scale up sandbox capacity.

### Error Cases and Failure Modes

| Failure Mode | Impact | Detection | Mitigation |
|---|---|---|---|
| Database unreachable during sweep | Stale workspaces are not cleaned up until the next successful sweep. | `codeplane_workspace_sweep_errors_total` increment. | Sweep retries on next interval. Error is logged and does not crash the process. |
| Individual workspace status update fails | That specific workspace remains in stale pending state until the next sweep. | Error logged with workspace ID. | Next sweep iteration retries the same workspace. |
| SSE notification fails after status update | Workspace is marked failed in DB but connected clients don't see the update until they refresh. | Silent failure (pg_notify is fire-and-forget). | Clients should poll or reconnect SSE to get accurate state. |
| Cleanup scheduler fails to start | No background cleanup runs. Stale workspaces accumulate. | `WorkspaceSweepNotRunning` alert. | Restart server process. |
| Clock skew between app server and DB | Workspaces may be cleaned up too early or too late relative to the intended threshold. | Stale age histogram showing unexpected distribution. | Ensure NTP sync between app server and database. |
| Concurrent sweeps from multiple server instances | Same workspace may be updated by multiple processes. | Duplicate log entries. | Status update is idempotent — setting `failed` on an already-`failed` workspace is harmless. |

## Verification

### Integration Tests — Background Sweep

- **Test: Workspace in `pending` state with empty `freestyle_vm_id` older than threshold is transitioned to `failed`.**
  - Create a workspace with status `pending`, empty `freestyle_vm_id`, and `updated_at` set to 6 minutes ago.
  - Run `sweepIdleWorkspaces()`.
  - Assert workspace status is now `failed`.

- **Test: Workspace in `starting` state with empty `freestyle_vm_id` older than threshold is transitioned to `failed`.**
  - Create a workspace with status `starting`, empty `freestyle_vm_id`, and `updated_at` set to 6 minutes ago.
  - Run `sweepIdleWorkspaces()`.
  - Assert workspace status is now `failed`.

- **Test: Workspace in `pending` state with a non-empty `freestyle_vm_id` is NOT transitioned, regardless of age.**
  - Create a workspace with status `pending`, `freestyle_vm_id = "vm-123"`, and `updated_at` set to 1 hour ago.
  - Run `sweepIdleWorkspaces()`.
  - Assert workspace status is still `pending`.

- **Test: Workspace in `pending` state with empty `freestyle_vm_id` but `updated_at` within threshold is NOT transitioned.**
  - Create a workspace with status `pending`, empty `freestyle_vm_id`, and `updated_at` set to 2 minutes ago.
  - Run `sweepIdleWorkspaces()`.
  - Assert workspace status is still `pending`.

- **Test: Workspace in `running` state is never considered stale, regardless of `updated_at` age.**
  - Create a workspace with status `running` and `updated_at` set to 1 hour ago.
  - Run `sweepIdleWorkspaces()`.
  - Assert workspace status is still `running`.

- **Test: Workspace in `suspended` state is never considered stale.**
  - Create a workspace with status `suspended` and `updated_at` set to 1 hour ago.
  - Run `sweepIdleWorkspaces()`.
  - Assert workspace status is still `suspended`.

- **Test: Workspace in `failed` state is not re-processed (idempotency).**
  - Create a workspace with status `failed`.
  - Run `sweepIdleWorkspaces()`.
  - Assert no errors, no status change, no log output.

- **Test: Multiple stale workspaces are all transitioned in a single sweep.**
  - Create 5 workspaces in `pending` state, all stale.
  - Run `sweepIdleWorkspaces()`.
  - Assert all 5 are now `failed`.

- **Test: If one workspace fails to update, remaining workspaces are still processed.**
  - Create 3 stale workspaces. Simulate a DB error on the second workspace's update.
  - Run `sweepIdleWorkspaces()`.
  - Assert first and third workspaces are `failed`. Assert error is recorded in `SweepResult.errors`.

- **Test: Sweep with zero stale workspaces produces no log output and no errors.**
  - Ensure no stale workspaces exist.
  - Run `sweepIdleWorkspaces()`.
  - Assert `SweepResult.errors` is empty. Assert no `[cleanup]` log line is emitted.

- **Test: Custom `stalePendingWorkspaceSecs` configuration is respected.**
  - Configure cleanup with `stalePendingWorkspaceSecs: 60`.
  - Create a workspace with `updated_at` set to 90 seconds ago.
  - Run `sweepIdleWorkspaces()`.
  - Assert workspace is transitioned to `failed`.

- **Test: SSE notification is emitted when a stale workspace is failed.**
  - Create a stale workspace.
  - Subscribe to the workspace's SSE status channel.
  - Run `sweepIdleWorkspaces()` (or `cleanupStalePendingWorkspaces()`).
  - Assert an SSE event with payload `"failed"` is received.

- **Test: Workspaces ordered by `updated_at ASC` — oldest stale workspace is processed first.**
  - Create workspace A (stale for 10 minutes) and workspace B (stale for 6 minutes).
  - Run sweep.
  - Assert both are failed, with A processed before B (verify via log or processing order).

### Integration Tests — Proactive Zombie Detection on Create

- **Test: Creating a workspace when a zombie exists for the same user/repo fails the zombie first.**
  - Create a zombie workspace (pending, no VM, stale).
  - Call workspace creation for the same user and repo.
  - Assert the zombie is now `failed`.
  - Assert a new workspace is successfully created.

- **Test: Creating a workspace when a non-stale pending workspace exists does not fail it.**
  - Create a pending workspace with `updated_at` set to 1 minute ago.
  - Call workspace creation for the same user and repo.
  - Assert the existing pending workspace is NOT failed (it's still within the threshold).

- **Test: Zombie detection does not affect other users' workspaces.**
  - Create a zombie workspace for User A.
  - Call workspace creation for User B on the same repo.
  - Assert User A's zombie is NOT failed.

- **Test: Zombie detection does not affect workspaces in other repositories.**
  - Create a zombie workspace for User A in Repo X.
  - Call workspace creation for User A in Repo Y.
  - Assert the zombie in Repo X is NOT failed.

- **Test: Zombie detection skips fork workspaces.**
  - Create a zombie workspace that is a fork (`is_fork = true`).
  - Call workspace creation for the same user and repo.
  - Assert the fork zombie is NOT failed.

- **Test: `isZombieWorkspace` returns false for workspace with non-empty `freestyle_vm_id`.**
  - Create a workspace in `pending` state with `freestyle_vm_id = "vm-abc"` and stale `updated_at`.
  - Assert `isZombieWorkspace()` returns `false`.

- **Test: `isZombieWorkspace` falls back to `created_at` when `updated_at` is null.**
  - Create a workspace in `pending` state with `updated_at = null` and `created_at` set to 10 minutes ago.
  - Assert `isZombieWorkspace()` returns `true`.

### Integration Tests — Cleanup Scheduler Lifecycle

- **Test: `CleanupScheduler.start()` is idempotent — calling twice does not create duplicate timers.**
  - Call `start()` twice.
  - Assert only one set of timers is active (verify via internal state or by counting sweep executions over a short period).

- **Test: `CleanupScheduler.stop()` halts all background sweeps.**
  - Start the scheduler.
  - Stop the scheduler.
  - Wait for two sweep intervals.
  - Assert no sweeps executed after stop.

- **Test: `CleanupScheduler.stop()` is safe to call multiple times.**
  - Call `stop()` three times.
  - Assert no errors.

### API E2E Tests

- **Test: `GET /api/repos/:owner/:repo/workspaces` returns `status: "failed"` for a cleaned-up workspace.**
  - Create a workspace, simulate it becoming stale, run cleanup.
  - Call the list endpoint.
  - Assert the workspace appears with `status: "failed"`.

- **Test: `GET /api/repos/:owner/:repo/workspaces/:id` returns `status: "failed"` for a cleaned-up workspace.**
  - Same setup as above.
  - Call the detail endpoint.
  - Assert `status: "failed"` in the response.

- **Test: `GET /api/repos/:owner/:repo/workspaces/:id/stream` delivers `"failed"` event when cleanup runs.**
  - Create a stale workspace.
  - Open an SSE connection to the stream endpoint.
  - Trigger cleanup.
  - Assert a `"failed"` event is received on the stream.

- **Test: `POST /api/repos/:owner/:repo/workspaces` succeeds after a zombie is cleaned up.**
  - Create a zombie workspace.
  - POST to create a new workspace.
  - Assert 200/201 response with a new workspace in `starting` state.
  - Assert the old zombie is `failed` when retrieved.

### CLI E2E Tests

- **Test: `codeplane workspace list` displays "failed" status for cleaned-up workspaces.**
  - Set up a stale workspace and run cleanup.
  - Run `codeplane workspace list --repo owner/repo`.
  - Assert the output includes the workspace with a `failed` status indicator.

- **Test: `codeplane workspace view <id>` shows "failed" status for a cleaned-up workspace.**
  - Same setup.
  - Run `codeplane workspace view <id> --repo owner/repo`.
  - Assert the output shows `status: failed`.

- **Test: `codeplane workspace create` succeeds when a zombie exists, and the zombie is cleaned up.**
  - Create a zombie workspace.
  - Run `codeplane workspace create --repo owner/repo`.
  - Assert successful creation output.
  - Run `codeplane workspace list` and assert the old workspace is `failed`.

### Boundary and Stress Tests

- **Test: 100 stale workspaces are all cleaned up in a single sweep without errors.**
  - Create 100 workspaces in `pending` state, all stale.
  - Run `sweepIdleWorkspaces()`.
  - Assert all 100 are transitioned to `failed`.
  - Assert `SweepResult.errors` is empty.

- **Test: 1000 stale workspaces are cleaned up across multiple sweeps.**
  - Create 1000 stale workspaces.
  - Run sweep.
  - Assert all are eventually transitioned (may take multiple sweeps if batching is added).

- **Test: Workspace with `updated_at` exactly at the threshold boundary is NOT cleaned up.**
  - Create a workspace with `updated_at` exactly `stalePendingWorkspaceSecs` ago (boundary).
  - Run sweep.
  - Assert workspace is NOT transitioned (strict `<` comparison means exactly-at-boundary is not stale).

- **Test: Workspace with `updated_at` one second past the threshold IS cleaned up.**
  - Create a workspace with `updated_at` set to `stalePendingWorkspaceSecs + 1` seconds ago.
  - Run sweep.
  - Assert workspace IS transitioned to `failed`.

- **Test: Minimum stale threshold (60 seconds) is enforced.**
  - Configure `stalePendingWorkspaceSecs: 30`.
  - Assert it is clamped to 60.

- **Test: Maximum stale threshold (86400 seconds) is enforced.**
  - Configure `stalePendingWorkspaceSecs: 100000`.
  - Assert it is clamped to 86400.

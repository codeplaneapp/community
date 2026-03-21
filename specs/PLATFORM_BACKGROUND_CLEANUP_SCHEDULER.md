# PLATFORM_BACKGROUND_CLEANUP_SCHEDULER

Specification for PLATFORM_BACKGROUND_CLEANUP_SCHEDULER.

## High-Level User POV

Codeplane is a self-hosted forge that manages a significant amount of transient state — workspace sessions spin up and wind down, authentication tokens expire, workflow runs complete or stall, artifacts age out, and sync queues accumulate processed entries. Without active housekeeping, this ephemeral data would pile up, degrading performance, consuming storage, and leaving users staring at stale "running" statuses for workspaces and workflows that silently died hours ago.

The Background Cleanup Scheduler is Codeplane's automatic custodian. From the moment the server starts, it silently runs six independent background jobs on configurable intervals. Users never interact with the scheduler directly — instead, they experience its effects: idle workspaces are automatically suspended to conserve resources, expired login sessions and OAuth tokens are scrubbed so stale credentials cannot be reused, workspace sessions and workflow runs that got stuck in a "pending" or "running" state are detected and marked as failed so the UI reflects reality, old sync queue entries are purged to keep the local-first sync pipeline lean, and expired artifacts are deleted along with their backing blob storage to reclaim disk and object-store space.

For self-hosting administrators, the scheduler is a critical operational component. It starts automatically with the server, runs without manual intervention, and shuts down cleanly when the server receives a termination signal. If any individual cleanup sweep encounters an error — say, a single workspace fails to suspend — the scheduler logs the issue and continues processing the rest of the batch. No single failure cascades to halt other cleanup jobs or crash the server.

The net result is that Codeplane stays healthy, responsive, and honest about the state of every resource it manages, without requiring administrators to build external cron jobs or manual garbage-collection scripts.

## Acceptance Criteria

### Definition of Done

- [ ] The cleanup scheduler starts automatically when the Codeplane server boots, after database and service initialization are complete.
- [ ] The scheduler runs six independent background sweep jobs concurrently and on independent intervals.
- [ ] The scheduler stops all background jobs cleanly when the server receives SIGINT or SIGTERM, before database connections are closed.
- [ ] Calling `start()` when the scheduler is already running is a safe no-op (idempotent).
- [ ] Calling `stop()` when the scheduler is already stopped is a safe no-op (idempotent).

### Idle Workspace Cleanup Job

- [ ] Idle workspace sessions (sessions past their idle timeout) are marked as `closed`.
- [ ] Idle workspaces (workspaces past their idle timeout) are marked as `suspended`.
- [ ] If a container sandbox client is available and the workspace has a VM ID, the scheduler attempts to suspend the VM before updating the database status.
- [ ] VM suspension failure is non-fatal: the workspace is still marked as `suspended` in the database even if the VM suspend call fails.
- [ ] Workspaces stuck in `pending` or `starting` status for longer than the stale-pending threshold (default: 5 minutes) are marked as `failed`.
- [ ] Default sweep interval: 60 seconds.

### Expired Token Cleanup Job

- [ ] Expired auth sessions are deleted.
- [ ] Expired auth nonces are deleted.
- [ ] Expired OAuth states are deleted.
- [ ] Expired email verification tokens are deleted.
- [ ] Expired SSE tickets are deleted.
- [ ] Expired OAuth2 access tokens are deleted.
- [ ] Expired OAuth2 refresh tokens are deleted.
- [ ] Expired OAuth2 authorization codes are deleted.
- [ ] Expired Linear OAuth setups are deleted.
- [ ] Failure to delete one token category does not prevent deletion of other categories.
- [ ] Default sweep interval: 60 seconds.

### Stale Session Cleanup Job

- [ ] Workspace sessions stuck in `pending` or `starting` status for longer than 5 minutes are marked as `failed`.
- [ ] Default sweep interval: 60 seconds.

### Stale Workflow Run Cleanup Job

- [ ] Workflow runs stuck in `running` status for longer than the stale threshold (default: 1 hour) are marked as `failure` with `completed_at` and `updated_at` set to the current time.
- [ ] Default sweep interval: 60 seconds.

### Sync Queue Cleanup Job

- [ ] Synced items in the `_sync_queue` table older than the retention period (default: 7 days) are deleted.
- [ ] If the `_sync_queue` table does not exist (sync mode not in use), the sweep silently succeeds without logging an error.
- [ ] Default sweep interval: 60 seconds.

### Artifact Expiry Cleanup Job

- [ ] Expired workflow artifacts are deleted from the database in batches (default batch size: 100 per sweep).
- [ ] Expired issue artifacts are deleted from the database in batches (default batch size: 100 per sweep).
- [ ] If a blob store is available, backing blobs for pruned artifacts are deleted from the blob store.
- [ ] Blob deletion failure is non-fatal: the artifact is still considered pruned even if the blob delete fails (blob may already be gone).
- [ ] Default sweep interval: 300 seconds (5 minutes).

### Error Handling and Resilience

- [ ] Each sweep job catches and logs errors independently; a failure in one sweep does not stop other sweeps.
- [ ] Within each sweep, per-item errors (e.g., failing to suspend a single workspace) are collected into a `SweepResult.errors` array and logged, but do not abort processing of remaining items in the batch.
- [ ] Unhandled exceptions thrown by a sweep function are caught at the timer callback level and logged to stderr.

### Configuration Boundary Constraints

- [ ] All interval values are specified in milliseconds and must be positive integers. A value of `0` is invalid.
- [ ] `stalePendingWorkspaceSecs` must be a positive integer. Default: 300.
- [ ] `staleWorkflowRunSecs` must be a positive integer. Default: 3600.
- [ ] `syncQueueRetentionSecs` must be a positive integer. Default: 604,800 (7 days).
- [ ] `artifactBatchSize` must be a positive integer ≥ 1 and ≤ 10,000. Default: 100.
- [ ] `containerClient` is optional. When `null` or omitted, VM suspension is skipped for idle workspaces but database status updates still occur.
- [ ] `blobStore` is optional. When `null` or omitted, blob deletion is skipped for expired artifacts but database pruning still occurs.

### Edge Cases

- [ ] If the database connection is lost during a sweep, the sweep's error is logged and the scheduler continues to attempt future sweeps (the connection may recover).
- [ ] If zero items match a sweep query, no log output is produced and the sweep returns a clean `SweepResult` with an empty errors array.
- [ ] If the server shuts down during an active sweep, the timer is cleared and the sweep's in-flight database operations complete or fail naturally (no forced abortion of queries).
- [ ] Concurrent sweeps of the same type cannot overlap because each timer fires only after the interval elapses from the previous invocation's start (though sweeps of different types run in parallel).

## Design

### SDK Shape

The cleanup scheduler is exposed from `@codeplane/sdk` as a first-class service class.

**Exported types:**

- `CleanupScheduler` — the main class, instantiated with a database connection and optional configuration.
- `CleanupSchedulerConfig` — configuration interface with optional overrides for all intervals, thresholds, batch sizes, and optional infrastructure dependencies.
- `SweepResult` — return type from each sweep method, containing the job name and an array of non-fatal error strings.

**Constructor signature:**

```
new CleanupScheduler(sql, config?)
```

- `sql`: Active database connection (Postgres.js `Sql` instance).
- `config`: Optional `CleanupSchedulerConfig` with all fields optional and sensible defaults.

**Public methods:**

- `start(): void` — Starts all six background timer loops. Idempotent.
- `stop(): void` — Stops all timer loops and clears internal timer state. Idempotent.

**Individual sweep methods (public for testing and manual invocation):**

- `sweepIdleWorkspaces(): Promise<SweepResult>`
- `sweepExpiredTokens(): Promise<SweepResult>`
- `sweepStaleSessions(): Promise<SweepResult>`
- `sweepStaleWorkflowRuns(): Promise<SweepResult>`
- `sweepSyncQueue(): Promise<SweepResult>`
- `sweepExpiredArtifacts(): Promise<SweepResult>`

**Configuration options with defaults:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `workspaceIntervalMs` | `number` | `60000` | Idle workspace sweep interval |
| `tokenIntervalMs` | `number` | `60000` | Expired token sweep interval |
| `staleSessionIntervalMs` | `number` | `60000` | Stale session sweep interval |
| `staleWorkflowRunIntervalMs` | `number` | `60000` | Stale workflow run sweep interval |
| `syncQueueIntervalMs` | `number` | `60000` | Sync queue sweep interval |
| `artifactIntervalMs` | `number` | `300000` | Artifact expiry sweep interval |
| `stalePendingWorkspaceSecs` | `number` | `300` | Seconds before a pending workspace is stale |
| `staleWorkflowRunSecs` | `number` | `3600` | Seconds before a running workflow run is stale |
| `syncQueueRetentionSecs` | `number` | `604800` | Seconds to retain synced queue items |
| `artifactBatchSize` | `number` | `100` | Max artifacts pruned per sweep |
| `containerClient` | `ContainerSandboxClient \| null` | `null` | Optional container client for VM operations |
| `blobStore` | `BlobStore \| null` | `null` | Optional blob store for artifact blob cleanup |

### Server Bootstrap Integration

The scheduler is instantiated and started during server bootstrap, after database initialization and service registry initialization, and before HTTP route mounting. The instantiation receives the shared database connection and the blob store from the SDK.

On graceful shutdown (SIGINT or SIGTERM), the scheduler is the **first** thing stopped, before preview cleanup, SSH server shutdown, and database connection closing.

### Admin API Shape

`GET /api/admin/system/health` should include a `cleanup` section in its response:

```json
{
  "database": { "latencyMs": 2 },
  "cleanup": {
    "running": true,
    "jobs": [
      "idle-workspaces",
      "expired-tokens",
      "stale-sessions",
      "stale-workflow-runs",
      "sync-queue",
      "expired-artifacts"
    ]
  }
}
```

### CLI Command

The `codeplane admin health` CLI command should surface whether the background cleanup scheduler is running as part of its system health report. This is a read-only informational surface — administrators do not start, stop, or configure the scheduler through the CLI.

Example output:
```
System Health
  Database:  healthy (2ms)
  Cleanup:   running (6 jobs)
```

### Web UI Design

No dedicated web UI is required for the cleanup scheduler. The scheduler's effects are visible throughout the product:

- Workspaces that were idle show `suspended` status in the workspace list.
- Workspace sessions that were stale show `failed` status.
- Workflow runs that were stale show `failure` status with a `completed_at` timestamp.
- Expired artifacts no longer appear in artifact listings.

The admin system health page (if present) should display a simple indicator confirming the cleanup scheduler is active.

### Documentation

1. **Self-Hosting Administration Guide — Background Cleanup**: A section explaining what the cleanup scheduler does, which six jobs it runs, their default intervals, and what administrators should expect to see in server logs. This section should explicitly state that no external cron job is needed for routine data hygiene.

2. **Configuration Reference — Cleanup Scheduler**: Documentation of all configurable parameters (intervals, thresholds, batch sizes), their defaults, and acceptable value ranges. Should note that configuration is currently code-level (constructor parameters) and that environment-variable-based configuration is a future enhancement.

3. **Troubleshooting — Stale Workspaces and Workflow Runs**: A FAQ entry explaining why a workspace or workflow run might suddenly transition to `failed`/`failure` status, and confirming this is expected behavior from the cleanup scheduler detecting stuck resources.

## Permissions & Security

### Authorization

- The cleanup scheduler is an **internal server process**. It is not triggered by any user-facing API endpoint. No user role (Owner, Admin, Member, Read-Only, or Anonymous) can directly invoke cleanup sweeps through the API.
- The admin system health endpoint (`GET /api/admin/system/health`) that reports cleanup scheduler status requires the **Admin** role.
- The CLI `admin health` command inherits admin authorization requirements.

### Rate Limiting

- The cleanup scheduler is not subject to HTTP rate limiting because it operates as an internal process, not through the HTTP middleware stack.
- Each sweep job self-limits through its configured interval (minimum 60 seconds for most jobs, 300 seconds for artifact cleanup). This prevents runaway query storms.
- Artifact deletion is batch-limited (default 100 per sweep) to prevent a single sweep from holding database locks for extended periods.

### Data Privacy and PII

- The expired token cleanup job deletes authentication sessions, OAuth tokens, and verification tokens. This is a **privacy-positive** behavior — it ensures that expired credentials are not retained beyond their intended lifetime.
- Sweep log messages include resource IDs (workspace IDs, session IDs, artifact IDs) but **never** include user PII such as usernames, emails, or token values.
- Error messages from sweep failures may include database error strings. These must be sanitized before being exposed to any external monitoring system to avoid leaking schema details.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `CleanupSchedulerStarted` | Scheduler `start()` called successfully | `jobCount: number`, `timestamp: string` |
| `CleanupSchedulerStopped` | Scheduler `stop()` called successfully | `timestamp: string` |
| `CleanupSweepCompleted` | A single sweep job finishes | `job: string`, `durationMs: number`, `itemsProcessed: number`, `errorCount: number` |
| `WorkspaceAutoSuspended` | Idle workspace moved to `suspended` | `workspaceId: string`, `repoId: string`, `idleDurationSecs: number` |
| `WorkspaceAutoFailed` | Stale pending workspace moved to `failed` | `workspaceId: string`, `staleDurationSecs: number` |
| `WorkflowRunAutoFailed` | Stale workflow run moved to `failure` | `runId: string`, `repoId: string`, `staleDurationSecs: number` |
| `ArtifactsExpired` | Batch of artifacts pruned | `workflowArtifactCount: number`, `issueArtifactCount: number`, `blobsDeleted: number`, `blobDeleteErrors: number` |
| `ExpiredTokensPurged` | Token cleanup sweep finishes | `categories: string[]`, `errorCount: number` |
| `SyncQueuePurged` | Sync queue cleanup sweep finishes | `itemsPurged: number` |

### Funnel Metrics and Success Indicators

- **Scheduler Uptime Ratio**: Percentage of time the scheduler is running vs. total server uptime. Target: 100%.
- **Sweep Success Rate**: Percentage of sweep executions that complete with zero errors, measured per job type. Target: > 99%.
- **Stale Resource Detection Latency**: Time between a resource becoming stale and the sweep detecting it. Bounded by the sweep interval. Target: ≤ configured interval + sweep execution time.
- **Artifact Storage Reclamation**: Total bytes of blob storage freed by artifact expiry over time. Monotonically increasing trend indicates healthy artifact lifecycle.
- **Zero Expired Token Carryover**: After a token cleanup sweep, the count of expired tokens remaining should be zero (all expired tokens were successfully deleted).

## Observability

### Logging Requirements

All log messages from the cleanup scheduler use the `[cleanup]` prefix for easy filtering.

| Log Event | Level | Structured Context | Condition |
|---|---|---|---|
| Scheduler started | `info` | `{ workerCount: 6 }` | On `start()` |
| Scheduler stopped | `info` | `{}` | On `stop()` |
| Workspace sweep summary | `info` | `{ idleSessionsClosed: number, workspacesSuspended: number, staleWorkspacesFailed: number }` | When any count > 0 |
| Stale session sweep summary | `info` | `{ sessionsMarkedFailed: number }` | When count > 0 |
| Stale workflow run sweep summary | `info` | `{ runsMarkedFailure: number }` | When count > 0 |
| Sync queue sweep summary | `info` | `{ itemsPurged: number }` | When count > 0 |
| Workflow artifact sweep summary | `info` | `{ artifactsDeleted: number }` | When count > 0 |
| Issue artifact sweep summary | `info` | `{ artifactsDeleted: number }` | When count > 0 |
| Per-item error in sweep | `warn` | `{ job: string, resourceId: string, error: string }` | When a single item fails within a batch |
| Entire sweep failure | `error` | `{ job: string, error: string }` | When the top-level sweep query fails |
| Unhandled sweep exception | `error` | `{ error: string, stack: string }` | When the timer callback's catch fires |

### Prometheus Metrics

**Counters:**

- `codeplane_cleanup_sweep_total{job="<job-name>", status="success|error"}` — Total number of sweep executions per job, partitioned by success/error.
- `codeplane_cleanup_items_processed_total{job="<job-name>", action="suspended|closed|failed|deleted|purged"}` — Total items processed by each sweep, partitioned by the action taken.
- `codeplane_cleanup_sweep_errors_total{job="<job-name>"}` — Total number of per-item non-fatal errors encountered across all sweeps.
- `codeplane_cleanup_blobs_deleted_total` — Total number of blob store objects deleted during artifact expiry.
- `codeplane_cleanup_blob_delete_errors_total` — Total number of blob store deletion failures.

**Gauges:**

- `codeplane_cleanup_scheduler_running` — `1` if the scheduler is running, `0` if stopped.
- `codeplane_cleanup_last_sweep_timestamp{job="<job-name>"}` — Unix timestamp of the last completed sweep per job.
- `codeplane_cleanup_last_sweep_items{job="<job-name>"}` — Number of items processed in the most recent sweep per job.
- `codeplane_cleanup_last_sweep_errors{job="<job-name>"}` — Number of errors in the most recent sweep per job.

**Histograms:**

- `codeplane_cleanup_sweep_duration_seconds{job="<job-name>"}` — Duration of each sweep execution. Buckets: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60]`.

### Alerts

#### Alert: CleanupSchedulerDown

- **Condition:** `codeplane_cleanup_scheduler_running == 0` for > 5 minutes while the server process is up.
- **Severity:** Critical
- **Runbook:**
  1. Check server logs for `[cleanup] scheduler stopped` — was a shutdown initiated?
  2. If the server is still running, check for unhandled exceptions in the bootstrap sequence that may have prevented scheduler startup.
  3. Check that the database connection is healthy (`GET /api/admin/system/health`).
  4. Restart the server process if the scheduler cannot recover.

#### Alert: CleanupSweepConsistentFailure

- **Condition:** `rate(codeplane_cleanup_sweep_total{status="error"}[15m]) > 0.5` for any single job (more than half of sweeps failing).
- **Severity:** Warning
- **Runbook:**
  1. Identify which job is failing from the `job` label.
  2. Check server logs filtered by `[cleanup]` for error messages corresponding to that job.
  3. For workspace/session sweeps: verify the container sandbox runtime is reachable.
  4. For token/artifact sweeps: verify database connectivity and check for schema migration issues.
  5. For sync queue sweeps: verify the `_sync_queue` table exists if sync mode is enabled.
  6. If errors are per-item (e.g., single workspace suspend failures), investigate the specific resources listed in log entries.

#### Alert: CleanupSweepSlow

- **Condition:** `histogram_quantile(0.95, codeplane_cleanup_sweep_duration_seconds{job="<any>"}) > 30` sustained for 10 minutes.
- **Severity:** Warning
- **Runbook:**
  1. Identify which sweep job is slow from the metric label.
  2. Check database query performance — long sweep durations typically indicate table bloat, missing indexes, or lock contention.
  3. For artifact expiry: check if the batch size is appropriate for the current volume. Consider reducing `artifactBatchSize` if the blob store is slow.
  4. For workspace sweeps: check if the container client's `suspendVM` call is timing out.
  5. Review database connection pool saturation.

#### Alert: CleanupSweepStale

- **Condition:** `time() - codeplane_cleanup_last_sweep_timestamp{job="<any>"} > 300` (no sweep for any job in 5 minutes, given 60s default intervals).
- **Severity:** Warning
- **Runbook:**
  1. This indicates the timer loop may have stopped for a specific job without the scheduler itself reporting as down.
  2. Check if the event loop is blocked by a long-running synchronous operation.
  3. Check server CPU and memory utilization — a resource-starved process may delay timer callbacks.
  4. Review if a previous sweep invocation is still running (a sweep that takes longer than its interval will delay the next invocation).

#### Alert: HighArtifactBlobDeleteFailureRate

- **Condition:** `rate(codeplane_cleanup_blob_delete_errors_total[1h]) / rate(codeplane_cleanup_blobs_deleted_total[1h]) > 0.1` (more than 10% blob deletes failing).
- **Severity:** Warning
- **Runbook:**
  1. Check blob store connectivity and authentication credentials.
  2. Verify blob store quota/rate limits are not being hit.
  3. Check if the blobs have already been deleted externally (this is non-fatal but indicates a lifecycle mismatch).
  4. Review blob store error responses in server logs for specific error codes.

### Error Cases and Predictable Failure Modes

| Failure Mode | Impact | Behavior |
|---|---|---|
| Database connection lost | All sweeps fail until connection recovers | Each sweep logs an error; scheduler continues retrying on next interval |
| Container sandbox client unreachable | Idle workspace VM suspension fails | VM suspension error logged; workspace still marked as `suspended` in DB |
| Blob store unreachable | Artifact blob deletion fails | Blob delete error logged; artifact still pruned from DB (orphaned blob) |
| `_sync_queue` table does not exist | Sync queue sweep has no work | Silently succeeds with no error logged |
| Extremely large backlog of expired items | Single sweep takes longer than interval | Next invocation of that sweep is simply delayed; no overlap occurs |
| Server shutdown during active sweep | In-flight DB queries may complete or fail | Timer cleared; no new queries issued; existing queries resolve naturally |
| Schema migration not applied | SQL queries return errors | Sweep error logged; scheduler continues attempting future sweeps |

## Verification

### Integration Tests — CleanupScheduler Lifecycle

- **TEST: Scheduler starts successfully with default configuration** — Instantiate `CleanupScheduler` with a test database and call `start()`. Verify that `start()` returns without error and that the scheduler reports as running.
- **TEST: Scheduler start is idempotent** — Call `start()` twice. Verify no error is thrown and that only one set of timers is created (no duplicate sweep executions).
- **TEST: Scheduler stops successfully** — Start the scheduler, then call `stop()`. Verify no further sweep executions occur after a wait period exceeding the configured interval.
- **TEST: Scheduler stop is idempotent** — Call `stop()` twice. Verify no error is thrown.
- **TEST: Scheduler starts and stops cleanly in rapid succession** — Call `start()`, `stop()`, `start()`, `stop()` in sequence. Verify no errors or leaked timers.

### Integration Tests — Idle Workspace Cleanup Sweep

- **TEST: Idle workspace sessions are closed** — Create a workspace session with `status = 'running'` and a `last_active_at` timestamp older than the idle timeout. Run `sweepIdleWorkspaces()`. Verify the session status is updated to `closed`.
- **TEST: Active workspace sessions are not closed** — Create a workspace session with a recent `last_active_at`. Run `sweepIdleWorkspaces()`. Verify the session status remains `running`.
- **TEST: Idle workspaces are suspended** — Create a workspace with `status = 'running'` and a `last_active_at` older than the idle timeout. Run `sweepIdleWorkspaces()`. Verify the workspace status is updated to `suspended`.
- **TEST: Idle workspace with VM ID attempts VM suspension** — Create an idle workspace with a `freestyle_vm_id`. Provide a mock container client. Run `sweepIdleWorkspaces()`. Verify `suspendVM()` was called with the correct VM ID.
- **TEST: VM suspension failure is non-fatal** — Create an idle workspace with a VM ID. Provide a mock container client that throws on `suspendVM()`. Run `sweepIdleWorkspaces()`. Verify the workspace is still marked as `suspended` in the database and the error appears in `SweepResult.errors`.
- **TEST: Idle workspace without VM ID skips VM suspension** — Create an idle workspace with no `freestyle_vm_id`. Run `sweepIdleWorkspaces()`. Verify the workspace is marked `suspended` without attempting VM suspension.
- **TEST: Stale pending workspaces are marked as failed** — Create a workspace with `status = 'pending'` and `created_at` older than the stale-pending threshold. Run `sweepIdleWorkspaces()`. Verify the workspace status is `failed`.
- **TEST: Recently-created pending workspaces are not marked as failed** — Create a workspace with `status = 'pending'` and `created_at` within the stale-pending threshold. Run `sweepIdleWorkspaces()`. Verify the workspace status remains `pending`.
- **TEST: Stale starting workspaces are marked as failed** — Create a workspace with `status = 'starting'` and `created_at` older than the stale-pending threshold. Run `sweepIdleWorkspaces()`. Verify the workspace status is `failed`.
- **TEST: Sweep with zero idle resources returns clean result** — Run `sweepIdleWorkspaces()` with no idle workspaces or sessions. Verify the result has an empty errors array and no log output is produced.
- **TEST: Mixed batch with one failing item continues processing** — Create three idle workspaces. Make the database `updateWorkspaceStatus` call fail for the second workspace (e.g., by deleting it concurrently). Run `sweepIdleWorkspaces()`. Verify the first and third workspaces are suspended and the error for the second appears in `SweepResult.errors`.

### Integration Tests — Expired Token Cleanup Sweep

- **TEST: Expired auth sessions are deleted** — Create an auth session with an expiry in the past. Run `sweepExpiredTokens()`. Verify the session row no longer exists.
- **TEST: Valid (non-expired) auth sessions are preserved** — Create an auth session with a future expiry. Run `sweepExpiredTokens()`. Verify the session row still exists.
- **TEST: Expired auth nonces are deleted** — Create an expired nonce. Run `sweepExpiredTokens()`. Verify deletion.
- **TEST: Expired OAuth states are deleted** — Create an expired OAuth state. Run `sweepExpiredTokens()`. Verify deletion.
- **TEST: Expired verification tokens are deleted** — Create an expired verification token. Run `sweepExpiredTokens()`. Verify deletion.
- **TEST: Expired SSE tickets are deleted** — Create an expired SSE ticket. Run `sweepExpiredTokens()`. Verify deletion.
- **TEST: Expired OAuth2 access tokens are deleted** — Create an expired OAuth2 access token. Run `sweepExpiredTokens()`. Verify deletion.
- **TEST: Expired OAuth2 refresh tokens are deleted** — Create an expired OAuth2 refresh token. Run `sweepExpiredTokens()`. Verify deletion.
- **TEST: Expired OAuth2 authorization codes are deleted** — Create an expired OAuth2 authorization code. Run `sweepExpiredTokens()`. Verify deletion.
- **TEST: Expired Linear OAuth setups are deleted** — Create an expired Linear OAuth setup. Run `sweepExpiredTokens()`. Verify deletion.
- **TEST: Failure in one token category does not block others** — Simulate a database error for `deleteExpiredSessions`. Run `sweepExpiredTokens()`. Verify that other categories (nonces, OAuth states, etc.) are still cleaned up, and the error for sessions appears in `SweepResult.errors`.
- **TEST: Sweep with no expired tokens returns clean result** — Run `sweepExpiredTokens()` with no expired tokens of any type. Verify the result has an empty errors array.

### Integration Tests — Stale Session Cleanup Sweep

- **TEST: Sessions stuck in pending for over 5 minutes are marked failed** — Create a workspace session with `status = 'pending'` and `created_at` 6 minutes ago. Run `sweepStaleSessions()`. Verify the session status is `failed`.
- **TEST: Sessions stuck in starting for over 5 minutes are marked failed** — Create a workspace session with `status = 'starting'` and `created_at` 6 minutes ago. Run `sweepStaleSessions()`. Verify the session status is `failed`.
- **TEST: Recently-created pending sessions are not marked failed** — Create a session with `status = 'pending'` and `created_at` 2 minutes ago. Run `sweepStaleSessions()`. Verify status remains `pending`.
- **TEST: Running sessions are not affected** — Create a session with `status = 'running'` and `created_at` 10 minutes ago. Run `sweepStaleSessions()`. Verify status remains `running`.

### Integration Tests — Stale Workflow Run Cleanup Sweep

- **TEST: Workflow runs stuck in running for over 1 hour are marked as failure** — Create a workflow run with `status = 'running'` and `updated_at` 2 hours ago. Run `sweepStaleWorkflowRuns()`. Verify status is `failure` and `completed_at` is set.
- **TEST: Recently-updated running workflow runs are not affected** — Create a workflow run with `status = 'running'` and `updated_at` 30 minutes ago. Run `sweepStaleWorkflowRuns()`. Verify status remains `running`.
- **TEST: Completed workflow runs are not affected** — Create a workflow run with `status = 'success'` and `updated_at` 2 hours ago. Run `sweepStaleWorkflowRuns()`. Verify status remains `success`.
- **TEST: Custom stale threshold is respected** — Instantiate scheduler with `staleWorkflowRunSecs = 1800` (30 min). Create a run with `updated_at` 45 minutes ago. Run `sweepStaleWorkflowRuns()`. Verify it is marked as `failure`.
- **TEST: Boundary — run exactly at threshold is not affected** — Create a workflow run with `updated_at` exactly 1 hour ago (within a small tolerance). Verify the boundary behavior is correct and the run is only marked stale if strictly past the threshold.

### Integration Tests — Sync Queue Cleanup Sweep

- **TEST: Synced items older than retention period are purged** — Insert a `_sync_queue` row with `status = 'synced'` and `synced_at` 8 days ago. Run `sweepSyncQueue()`. Verify the row is deleted.
- **TEST: Synced items within retention period are preserved** — Insert a row with `synced_at` 3 days ago. Run `sweepSyncQueue()`. Verify the row still exists.
- **TEST: Non-synced items are not purged regardless of age** — Insert a row with `status = 'pending'` and `synced_at` 10 days ago. Run `sweepSyncQueue()`. Verify the row still exists.
- **TEST: Missing _sync_queue table does not produce an error** — Run `sweepSyncQueue()` against a database where the `_sync_queue` table does not exist. Verify the result has an empty errors array.
- **TEST: Custom retention period is respected** — Instantiate with `syncQueueRetentionSecs = 86400` (1 day). Insert a row synced 2 days ago. Run `sweepSyncQueue()`. Verify it is deleted.

### Integration Tests — Artifact Expiry Cleanup Sweep

- **TEST: Expired workflow artifacts are deleted** — Create a workflow artifact with `expires_at` in the past. Run `sweepExpiredArtifacts()`. Verify the artifact row is deleted.
- **TEST: Non-expired workflow artifacts are preserved** — Create a workflow artifact with `expires_at` in the future. Run `sweepExpiredArtifacts()`. Verify the artifact row still exists.
- **TEST: Expired issue artifacts are deleted** — Create an issue artifact with `expires_at` in the past. Run `sweepExpiredArtifacts()`. Verify deletion.
- **TEST: Blob store delete is called for pruned workflow artifacts** — Create an expired workflow artifact with a `gcs_key`. Provide a mock blob store. Run `sweepExpiredArtifacts()`. Verify `blobStore.delete()` was called with the correct key.
- **TEST: Blob store delete is called for pruned issue artifacts** — Create an expired issue artifact with a `gcs_key`. Provide a mock blob store. Run `sweepExpiredArtifacts()`. Verify `blobStore.delete()` was called.
- **TEST: Artifacts without a gcs_key skip blob deletion** — Create an expired artifact with `gcs_key = null`. Run `sweepExpiredArtifacts()`. Verify the artifact is pruned from the database and no blob store call is made.
- **TEST: Blob store failure is non-fatal** — Provide a mock blob store that throws. Create an expired artifact with a `gcs_key`. Run `sweepExpiredArtifacts()`. Verify the artifact is still pruned from the database and the error appears in `SweepResult.errors`.
- **TEST: Batch size limits the number of artifacts pruned per sweep** — Create 150 expired workflow artifacts. Instantiate scheduler with `artifactBatchSize = 100`. Run `sweepExpiredArtifacts()`. Verify exactly 100 are pruned and 50 remain.
- **TEST: Maximum batch size (10,000) processes correctly** — Create a dataset and instantiate with `artifactBatchSize = 10000`. Verify the sweep executes without error.
- **TEST: Batch size of 1 processes one artifact at a time** — Create 5 expired artifacts. Instantiate with `artifactBatchSize = 1`. Run `sweepExpiredArtifacts()`. Verify exactly 1 workflow artifact and 1 issue artifact are pruned per sweep.
- **TEST: No blob store provided skips all blob deletions** — Instantiate with `blobStore = null`. Create expired artifacts with `gcs_key` values. Run `sweepExpiredArtifacts()`. Verify artifacts are pruned from the database and no blob deletion errors occur.

### Integration Tests — Configuration

- **TEST: Default configuration values are applied** — Instantiate `CleanupScheduler` with no config. Verify all defaults match the documented values (60s intervals, 300s artifact interval, 300s stale pending threshold, 3600s stale run threshold, 604800s sync retention, 100 artifact batch size).
- **TEST: Custom configuration values override defaults** — Instantiate with all config values overridden. Verify the custom values are used in sweep behavior.

### End-to-End Tests — Server Integration

- **E2E: Server boot starts cleanup scheduler** — Start the Codeplane server. Check server logs for `[cleanup] scheduler started with 6 background workers`.
- **E2E: Server shutdown stops cleanup scheduler** — Start the server, then send SIGTERM. Check logs for `[cleanup] scheduler stopped` appearing before `Shutting down...` completes.
- **E2E: Idle workspace is auto-suspended after timeout** — Via the API, create a workspace. Wait for it to become idle past the timeout. Verify via `GET /api/workspaces/:id` that the workspace status transitions to `suspended`.
- **E2E: Stale workflow run is auto-failed** — Via the API, create and start a workflow run, then do not complete it. After the stale threshold, verify via `GET /api/repos/:owner/:repo/workflow-runs/:id` that the run status is `failure`.
- **E2E: Expired artifact is pruned** — Via the API, create a workflow artifact with a short expiry. Wait for the artifact expiry sweep. Verify the artifact is no longer returned by the artifact listing endpoint.
- **E2E: Admin health endpoint reports scheduler status** — Call `GET /api/admin/system/health` with admin credentials. Verify the response includes a `cleanup` section indicating the scheduler is running.
- **E2E: CLI admin health reports scheduler status** — Run `codeplane admin health`. Verify the output includes confirmation that the background cleanup scheduler is active.

# WORKFLOW_RUN_STATUS_PROPAGATION

Specification for WORKFLOW_RUN_STATUS_PROPAGATION.

## High-Level User POV

When you trigger a workflow in Codeplane — by pushing a change, opening a landing request, dispatching manually, or through any other trigger — the workflow engine orchestrates a series of jobs and tasks. As those tasks execute, the workflow run's overall status needs to ripple outward across every surface you interact with so that you always have a single, consistent answer to "did my workflow pass?"

Workflow Run Status Propagation is the system that takes the raw results of individual tasks — done, failed, cancelled, skipped, blocked — and continuously aggregates them into the run-level status that you see everywhere: on the workflow run detail page, in the CLI watch output, in the TUI dashboard, on landing request check indicators, in commit status badges, in your notification inbox, and as triggers for downstream workflows. It is the connective tissue between "a task just finished" and "the entire system knows what happened."

From your perspective as a developer, this means several things. First, you never need to poll or refresh. When a task inside your CI run completes, the run's status badge updates within moments — on the web, in the CLI, and in the TUI. If you're watching a landing request, the checks section shows your workflow's latest result as soon as it's available. If a required check fails, you know immediately that your landing request cannot be merged.

Second, downstream workflows chain automatically. If you've configured a deploy workflow to run when your build workflow succeeds, the status propagation system is what detects the build's terminal state and kicks off the deploy. If the build fails, the deploy never starts. If multiple downstream workflows match, they all dispatch concurrently.

Third, you get notified. When a workflow run you initiated reaches a terminal state — success, failure, or cancellation — you receive a notification in your Codeplane inbox with the workflow name and outcome. You don't need to keep a browser tab open.

Fourth, commit statuses are updated. When a workflow run is associated with a specific change or commit, the run's outcome is written back as a commit status. This is what allows landing requests to enforce required checks: the system looks at commit statuses for the landing request's changes and compares them against the repository's required check contexts. If any required context is not in a success state, the landing request is blocked from merging.

The aggregation is deterministic and priority-ordered: if any task is still active, the run is "running"; if any task failed, the run is "failure"; if all tasks were cancelled with none completing, the run is "cancelled"; if all tasks finished successfully or were skipped, the run is "success." This logic runs every time a task changes state, and the result is immediately broadcast to all connected clients and written to the database.

## Acceptance Criteria

### Definition of Done

- [ ] When any workflow task changes state (pending → running, running → done, running → failed, etc.), the run-level status is recomputed from all task states
- [ ] The run status aggregation follows deterministic priority: active > 0 → `running`; failed > 0 → `failure`; cancelled > 0 AND done = 0 → `cancelled`; done = total AND total > 0 → `success`; else → `failure`
- [ ] `started_at` is set on the run when it first transitions away from `queued` (using COALESCE to preserve first-set value)
- [ ] `completed_at` is set on the run when it first reaches a terminal status (`success`, `failure`, `cancelled`)
- [ ] A PostgreSQL NOTIFY event is emitted on `workflow_run_events_{runId}` after every status recomputation (best-effort, non-fatal)
- [ ] All connected SSE subscribers to the run's event stream receive the updated status within the NOTIFY delivery window
- [ ] When the run reaches a terminal status, downstream `workflow_run` triggers are evaluated and matching workflows are dispatched
- [ ] When the run reaches a terminal status, a `WorkflowRunCompletedEvent` notification is emitted to the run's initiator
- [ ] When the run is associated with a commit/change, the corresponding commit status record is updated to reflect the run's terminal status
- [ ] Commit statuses written by workflow runs are queryable by change ID and commit SHA for landing request required-check evaluation
- [ ] The landing request checks surface correctly shows the latest commit status for each required check context
- [ ] Landing requests with required checks cannot be enqueued/merged until all required contexts report `success`
- [ ] The web UI run detail page receives live status updates without manual refresh
- [ ] The CLI `workflow watch` command prints status transitions and exits on terminal status
- [ ] The TUI run detail screen updates step badges and run status in real time via SSE
- [ ] Status recomputation is idempotent — re-running the aggregation on an unchanged task set produces the same result
- [ ] Status recomputation is safe under concurrent task completions — no race conditions produce incorrect aggregate status

### Edge Cases

- [ ] A run with zero tasks returns no status row (aggregation produces null, caller treats as "unknown")
- [ ] A run where all tasks are `skipped` is treated as `success` (done includes skipped in the count)
- [ ] A run where some tasks are `done` and some are `cancelled` (but none failed) is treated as `success` if done > 0
- [ ] A run where all tasks are `cancelled` with none `done` or `skipped` is treated as `cancelled`
- [ ] A task transitions directly from `pending` to `cancelled` (never ran) — status recomputation handles this correctly
- [ ] Multiple tasks complete within the same millisecond — each triggers an independent recomputation, all producing correct results
- [ ] The run is deleted while SSE subscribers are connected — NOTIFY stops, subscribers receive no more events, keep-alive continues until client timeout
- [ ] The run's workflow definition is deleted after the run starts — status propagation continues based on the run's own record
- [ ] A task fails and is retried — the recomputation reflects the retry's state, not the original failure
- [ ] The NOTIFY payload exceeds PostgreSQL's 8KB limit — the notification silently fails, but the status is correctly persisted in the database; subscribers pick up the state on their next poll or reconnection
- [ ] The notification fanout service is unavailable — run status and commit status are still correctly computed; only user notifications are skipped
- [ ] Downstream workflow dispatch fails for one of multiple matched workflows — other dispatches proceed independently; errors are logged but not propagated
- [ ] A workflow run trigger chain reaches depth 5 — further dispatch is skipped with a warning log
- [ ] The commit status table has no existing row for the workflow run — update returns null, no error
- [ ] Required checks are configured on the repository but no workflow has run for the landing request's changes — checks show as missing/pending

### Boundary Constraints

- [ ] Run ID: PostgreSQL bigint, max 2^63 - 1
- [ ] Task statuses recognized by aggregation: `pending`, `assigned`, `running`, `blocked`, `failed`, `cancelled`, `done`, `skipped`
- [ ] Run statuses produced by aggregation: `queued`, `running`, `success`, `failure`, `cancelled`
- [ ] Terminal run statuses (trigger downstream dispatch): `success`, `failure`, `cancelled`
- [ ] Commit status `context` field: max 255 characters
- [ ] Commit status `description` field: max 1024 characters
- [ ] Commit status `target_url` field: max 2048 characters
- [ ] Commit status `status` values: `pending`, `success`, `failure`, `error`
- [ ] Maximum downstream workflow dispatches per completion event: 10
- [ ] Maximum trigger chain depth: 5
- [ ] Maximum required check contexts per repository: 50
- [ ] NOTIFY payload maximum: 8000 bytes (PostgreSQL limit)
- [ ] SSE keep-alive interval: 15 seconds
- [ ] Notification fanout: best-effort, non-blocking, failure does not affect status computation

## Design

### System Behavior Overview

Workflow Run Status Propagation is not a single endpoint or UI screen — it is a cross-cutting system behavior that connects task-level state changes to every downstream consumer. The propagation pipeline is:

1. **Task state change** → 2. **Aggregate run status recomputation** → 3. **Database update (run record)** → 4. **PostgreSQL NOTIFY** → 5. **SSE broadcast to subscribers** → 6. **Downstream trigger evaluation** → 7. **Commit status update** → 8. **Notification fanout** → 9. **Landing request check evaluation (on demand)**

### Status Aggregation Rules

The run status is derived from all tasks belonging to the run:

| Condition | Resulting Run Status |
|-----------|---------------------|
| Any task is `pending`, `assigned`, `running`, or `blocked` | `running` |
| No active tasks, any task is `failed` | `failure` |
| No active tasks, no failures, any `cancelled` AND zero `done`/`skipped` | `cancelled` |
| No active tasks, `done` + `skipped` = total AND total > 0 | `success` |
| None of the above (fallback) | `failure` |

### Commit Status Propagation

When a workflow run is created against a specific change ID and/or commit SHA, a commit status record is created with `status: pending` and a `context` derived from the workflow definition name. As the run progresses to terminal status, the commit status is updated:

| Run Status | Commit Status |
|-----------|---------------|
| `success` | `success` |
| `failure` | `failure` |
| `cancelled` | `error` |

The `target_url` field on the commit status points to the workflow run detail page, allowing users to click through from a landing request checks view to the originating run.

### Landing Request Required Checks

Repositories may configure an array of required check context names. When a landing request is evaluated for merge eligibility:

1. Collect all change IDs from the landing request
2. For each required context, query the latest commit status matching any of those change IDs
3. If every required context has a latest status of `success`, the checks pass
4. If any required context is missing or not `success`, the checks fail and the landing request cannot be enqueued

### API Shape

#### Commit Status Endpoints

```
POST /api/repos/:owner/:repo/commits/:sha/status
```
Creates a commit status. Used internally by the workflow engine and available for external integrations.

Request body:
```json
{
  "context": "ci/build",
  "status": "pending" | "success" | "failure" | "error",
  "description": "Build in progress",
  "target_url": "https://codeplane.example/owner/repo/workflows/runs/42"
}
```

```
GET /api/repos/:owner/:repo/commits/:ref/statuses
```
Lists commit statuses for a change ID or commit SHA. Supports pagination via `page` and `per_page` query parameters.

Response:
```json
{
  "statuses": [
    {
      "id": "1",
      "context": "ci/build",
      "status": "success",
      "description": "Build passed",
      "target_url": "...",
      "workflow_run_id": "42",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "total": 1
}
```

```
GET /api/repos/:owner/:repo/landings/:number/checks
```
Returns the aggregated check status for a landing request, evaluating all required check contexts against the latest commit statuses for the landing request's changes.

Response:
```json
{
  "checks": [
    {
      "context": "ci/build",
      "status": "success",
      "required": true,
      "workflow_run_id": "42",
      "target_url": "..."
    },
    {
      "context": "ci/deploy",
      "status": "pending",
      "required": true,
      "workflow_run_id": null,
      "target_url": null
    }
  ],
  "all_passed": false
}
```

#### Workflow Run Status in Event Stream

The existing `GET /api/repos/:owner/:repo/workflows/runs/:id/events` endpoint emits `status` events whenever the run status is recomputed. The `done` event is emitted when the run reaches a terminal state. This is documented in the WORKFLOW_RUN_EVENT_STREAM spec.

### Web UI Design

**Workflow run detail page**: The run status badge, step status indicators, and elapsed timer update in real time via the SSE event stream. No additional UI changes are required beyond what WORKFLOW_RUN_EVENT_STREAM specifies.

**Landing request detail page — Checks tab**: The checks section displays a list of all configured required check contexts for the repository. Each check shows:
- The context name (e.g., "ci/build")
- A status icon: ✓ green for success, ✗ red for failure, ⏳ amber for pending, ⚠ gray for missing/error
- The description text from the commit status
- A link to the workflow run (if `target_url` is set)
- The timestamp of the last update

A summary line at the top states: "All checks passed" (green) or "N of M required checks passed" (amber/red). If no required checks are configured, the section shows "No required checks configured."

**Repository settings — Checks configuration**: Under repository settings, administrators can configure the list of required check contexts. An autocomplete field suggests context names from previously-seen commit statuses in the repository.

### CLI Command

```
codeplane land checks <number> [--repo OWNER/REPO] [--json]
```

Displays the check status for a landing request. Output:

```
Checks for landing request #42:
  ✓ ci/build         Build passed                    (2s ago)
  ✗ ci/test          3 tests failed                  (5s ago)
  ⏳ ci/deploy        Waiting for deployment           —

1 of 3 required checks passed
```

With `--json`, outputs the full checks response as structured JSON.

```
codeplane repo checks <ref> [--repo OWNER/REPO] [--json]
```

Lists commit statuses for a change or commit ref.

### TUI UI

**Landing request detail screen**: A "Checks" tab shows the same information as the web UI checks section: context name, status icon, description, and link to the run. The tab shows a summary count of passed/total required checks.

**Workflow run detail screen**: Status propagation is visible through the existing real-time step/run status updates. No additional TUI screen is required.

### SDK Shape

The `@codeplane/sdk` workflow service exposes:

- `handleRunCompletion(workflowRunId)` — The main propagation entry point. Recomputes aggregate status, emits NOTIFY, dispatches downstream triggers if terminal.
- `isTerminalWorkflowRunStatus(status)` — Returns `true` for `success`, `failure`, `cancelled`.
- `workflowRunStatusToAction(status)` — Maps run status to trigger action string (`completed`, `success`, `failure`, `cancelled`).

The commit status queries in `@codeplane/sdk` include:
- `createCommitStatus(args)` — Creates a new commit status record.
- `updateLatestCommitStatusByWorkflowRunID(args)` — Updates the most recent commit status for a given workflow run.
- `listCommitStatusesByRef(args)` — Lists commit statuses by change ID or commit SHA.
- `getLatestCommitStatusesByChangeIDsAndContexts(args)` — Used for landing request required check evaluation.

### Documentation

End-user documentation should cover:

1. **Workflow Status Lifecycle Guide** — Explain the run status values (`queued`, `running`, `success`, `failure`, `cancelled`), how they are derived from task states, and what each means for the user.
2. **Required Checks Configuration Guide** — How to set up required check contexts on a repository, how commit statuses are automatically created by workflow runs, and how they gate landing request merges.
3. **Downstream Workflow Triggers** — How terminal run status drives `on: { workflow_run }` triggers, including chain depth limits and self-trigger exclusion (cross-reference WORKFLOW_TRIGGER_WORKFLOW_RUN spec).
4. **Notification Reference** — Document the `WorkflowRunCompleted` notification type and when it fires.
5. **CLI Reference** — `land checks` and `repo checks` command documentation.
6. **API Reference — Commit Statuses** — Document the `POST /commits/:sha/status` and `GET /commits/:ref/statuses` endpoints.
7. **API Reference — Landing Request Checks** — Document the `GET /landings/:number/checks` endpoint.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View run status (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View run status (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| View commit statuses (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View commit statuses (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create commit status (external) | ❌ | ❌ | ✅ | ✅ | ✅ |
| View landing request checks (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View landing request checks (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Configure required check contexts | ❌ | ❌ | ❌ | ✅ | ✅ |

- Status propagation itself (task → run status aggregation, NOTIFY, downstream trigger dispatch, commit status update, notification fanout) is a system-internal operation. It is not initiated by any user action beyond the original workflow dispatch or task completion.
- Commit status creation from workflow runs is performed by the system, not impersonating any user. The `workflow_run_id` FK provides audit traceability.
- External commit status creation (via the API) requires at least Write/Member access to the repository.
- Required check context configuration requires Admin or Owner access.

### Rate Limiting

| Resource | Limit | Window |
|----------|-------|--------|
| Commit status creation (external, per user) | 120 | per minute |
| Commit status listing (per user) | 300 | per minute |
| Landing request checks listing (per user) | 300 | per minute |
| Required check context updates (per repo) | 10 | per minute |

- System-internal commit status updates (from workflow runs) are not subject to per-user rate limits but are bounded by the rate of task completions.
- Downstream workflow dispatch is rate-limited at 60 triggered dispatches per repo per minute (defined in WORKFLOW_TRIGGER_WORKFLOW_RUN spec).

### Data Privacy

- Commit status `context`, `description`, and `target_url` fields are user/system-defined repository metadata, not PII.
- Notification fanout for workflow completion includes workflow name and status. It does not include log content, secret values, or environment variables.
- PostgreSQL NOTIFY payloads contain only run IDs and source identifiers, not PII or secrets.
- The `target_url` on commit statuses may include internal hostnames; care should be taken not to expose internal infrastructure URLs in public-facing commit statuses.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|-----------|---------|------------|
| `workflow_run.status_recomputed` | Run status aggregation completes | `repo_id`, `run_id`, `previous_status`, `new_status`, `task_count`, `active_count`, `failed_count`, `done_count`, `cancelled_count`, `is_terminal`, `recomputation_duration_ms` |
| `workflow_run.commit_status_created` | Commit status record created for a workflow run | `repo_id`, `run_id`, `change_id`, `commit_sha`, `context`, `status` |
| `workflow_run.commit_status_updated` | Commit status record updated to reflect terminal run status | `repo_id`, `run_id`, `context`, `previous_status`, `new_status` |
| `workflow_run.notification_sent` | Workflow completion notification delivered to initiator | `repo_id`, `run_id`, `workflow_name`, `status`, `initiator_id` |
| `workflow_run.downstream_dispatched` | Downstream workflow triggered by run completion | `repo_id`, `triggering_run_id`, `triggered_run_id`, `chain_depth`, `action` |
| `landing_request.checks_evaluated` | Required checks evaluated for a landing request | `repo_id`, `lr_number`, `required_count`, `passed_count`, `all_passed` |
| `landing_request.blocked_by_checks` | Landing request enqueue/merge blocked by failing checks | `repo_id`, `lr_number`, `failing_contexts[]` |

### Common Properties (All Events)

`request_id`, `timestamp`, `server_instance_id`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Status recomputation latency (task complete → run status persisted) | P95 < 50ms | Status should update near-instantly |
| End-to-end propagation latency (task complete → SSE event delivered) | P95 < 200ms | Users watching runs should see updates within a blink |
| Commit status write success rate | ≥ 99.9% | Every terminal run should produce a commit status |
| Notification delivery rate | ≥ 99% | Initiators should almost always be notified |
| Downstream dispatch success rate | ≥ 99.5% | Trigger chains should be highly reliable |
| Landing request check accuracy | 100% | Checks evaluation must never produce false positives (allow merge when checks actually fail) |
| Required checks adoption | Track repos configuring ≥1 required context over time | Indicates feature adoption |

## Observability

### Logging Requirements

| Log Level | Event | Structured Context |
|-----------|-------|--------------------||
| `debug` | Status recomputation started | `{ run_id, trigger: "task_complete" }` |
| `debug` | Status recomputation result (no change) | `{ run_id, status, task_counts }` |
| `info` | Status recomputation result (status changed) | `{ run_id, previous_status, new_status, task_counts: { active, failed, cancelled, done, total } }` |
| `info` | Run reached terminal status | `{ run_id, status, started_at, completed_at, duration_ms }` |
| `info` | Commit status created for workflow run | `{ run_id, commit_status_id, context, status, change_id, commit_sha }` |
| `info` | Commit status updated for workflow run | `{ run_id, commit_status_id, context, previous_status, new_status }` |
| `info` | Downstream workflow_run triggers evaluated | `{ run_id, matched_count, dispatched_count }` |
| `info` | Notification sent for workflow completion | `{ run_id, workflow_name, status, initiator_id }` |
| `info` | Landing request checks evaluated | `{ lr_id, lr_number, required_count, passed_count, all_passed }` |
| `warn` | NOTIFY failed (best-effort, non-fatal) | `{ run_id, error_message }` |
| `warn` | Commit status update returned null (no existing row) | `{ run_id, workflow_run_id }` |
| `warn` | Notification fanout failed for initiator | `{ run_id, initiator_id, error_message }` |
| `warn` | Downstream dispatch skipped (chain depth exceeded) | `{ run_id, chain_depth, max_depth }` |
| `error` | Status recomputation query failed | `{ run_id, error_message, error_code }` |
| `error` | Downstream dispatch failed | `{ triggering_run_id, target_workflow_id, error_message }` |
| `error` | Commit status creation failed | `{ run_id, context, change_id, error_message }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_run_status_recomputations_total` | Counter | `repo_id`, `result` (changed/unchanged/error) | Total status recomputation attempts |
| `codeplane_workflow_run_status_recomputation_duration_seconds` | Histogram | — | Duration of the status aggregation query |
| `codeplane_workflow_run_terminal_total` | Counter | `repo_id`, `status` (success/failure/cancelled) | Total runs reaching terminal status |
| `codeplane_workflow_run_duration_seconds` | Histogram | `repo_id`, `status` | Duration from run start to terminal status |
| `codeplane_commit_status_writes_total` | Counter | `repo_id`, `operation` (create/update), `status` (success/failure/error/pending) | Total commit status write operations |
| `codeplane_commit_status_write_errors_total` | Counter | `repo_id`, `error_type` | Failed commit status writes |
| `codeplane_workflow_run_notify_total` | Counter | `source` (runner.complete_task) | Total PG NOTIFY calls for run events |
| `codeplane_workflow_run_notify_errors_total` | Counter | — | Failed PG NOTIFY calls |
| `codeplane_workflow_downstream_dispatches_total` | Counter | `repo_id`, `result` (dispatched/skipped_depth/skipped_self/error) | Downstream trigger dispatch outcomes |
| `codeplane_workflow_notification_fanout_total` | Counter | `repo_id`, `result` (sent/failed) | Workflow completion notification delivery |
| `codeplane_landing_request_checks_evaluations_total` | Counter | `repo_id`, `result` (all_passed/blocked) | Landing request check evaluations |
| `codeplane_landing_request_checks_duration_seconds` | Histogram | — | Duration of checks evaluation query |
| `codeplane_propagation_end_to_end_duration_seconds` | Histogram | `stage` (task_to_status/status_to_sse/status_to_commit_status) | End-to-end propagation latency by stage |

### Alerts

#### Alert: `WorkflowStatusRecomputationErrorRate`
- **Condition**: `rate(codeplane_workflow_run_status_recomputations_total{result="error"}[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check server error logs for `status recomputation query failed` entries. Look at the `error_code` and `error_message` fields.
  2. Verify PostgreSQL connectivity and query performance. Run `SELECT count(*) FROM workflow_tasks WHERE workflow_run_id = '<recent_run_id>'` to check if the table is accessible.
  3. Check for schema migration issues — the `updateWorkflowRunStatusBasedOnTasks` query uses CTEs with FILTER clauses that require PostgreSQL 9.4+.
  4. Look for lock contention on the `workflow_runs` table — concurrent task completions may cause row-level lock waits. Check `pg_stat_activity` for waiting queries.
  5. If the error is transient, the next task completion will re-trigger recomputation. Verify that runs are eventually reaching correct terminal states.

#### Alert: `CommitStatusWriteFailureRate`
- **Condition**: `rate(codeplane_commit_status_write_errors_total[5m]) > 0.01`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `commit status creation failed` or `commit status update returned null` entries.
  2. If updates return null, the commit status row may not exist yet — check if the initial `createCommitStatus` call succeeded when the run was created.
  3. Verify the `commit_statuses` table exists and has correct indexes on `(repository_id, change_id)` and `(workflow_run_id)`.
  4. Check for unique constraint violations — a duplicate `(repository_id, change_id, context, workflow_run_id)` combination may indicate duplicate processing.
  5. If the error is a connection issue, verify the database connection pool is not exhausted.

#### Alert: `WorkflowRunNotifyFailureRate`
- **Condition**: `rate(codeplane_workflow_run_notify_errors_total[5m]) / rate(codeplane_workflow_run_notify_total[5m]) > 0.1` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check if PG NOTIFY payloads are exceeding the 8KB limit. Examine the payload content — it should contain only `{ run_id, source }`, which is well under the limit.
  2. Verify PostgreSQL LISTEN/NOTIFY subsystem is functioning: `SELECT pg_notify('test_channel', 'test')`.
  3. Check if the database connection used for NOTIFY is healthy. The NOTIFY call uses the same connection pool as other queries.
  4. In PGLite/daemon mode, LISTEN/NOTIFY is degraded by design — suppress this alert for daemon deployments.
  5. NOTIFY failures are non-fatal. Verify that SSE subscribers are still receiving data via initial-state polling on reconnect.

#### Alert: `DownstreamDispatchErrorRate`
- **Condition**: `rate(codeplane_workflow_downstream_dispatches_total{result="error"}[10m]) > 0`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `downstream dispatch failed` entries. Identify the `target_workflow_id` and `triggering_run_id`.
  2. Verify the target workflow definition still exists and has valid configuration.
  3. Check if the dispatch is failing due to rate limiting (60 dispatches/repo/minute). Look at `codeplane_workflow_downstream_dispatches_total{result="skipped_depth"}` to see if chain depth limits are being hit.
  4. Verify that the trigger matching logic is not throwing on malformed workflow configs — check for JSON parse errors in the trigger evaluation.
  5. Downstream dispatch errors are non-fatal and do not affect the triggering run's status. However, they mean dependent workflows are not being triggered. Consider manual dispatch as a temporary workaround.

#### Alert: `LandingRequestChecksEvaluationSlow`
- **Condition**: `histogram_quantile(0.95, codeplane_landing_request_checks_duration_seconds) > 2` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check the number of required check contexts configured on repositories. The query joins across change IDs × contexts, which can be slow with many contexts.
  2. Verify indexes on `commit_statuses (repository_id, change_id, context, created_at DESC)` exist and are being used. Run `EXPLAIN ANALYZE` on the `GetLatestCommitStatusesByChangeIDsAndContexts` query.
  3. Check if landing requests have an unusually large number of changes (stacked changes). Many change IDs in the ANY() clause can slow the query.
  4. Consider adding a materialized view or cache for frequently-evaluated landing request checks if the query volume is high.

#### Alert: `StatusPropagationEndToEndLatencyHigh`
- **Condition**: `histogram_quantile(0.95, codeplane_propagation_end_to_end_duration_seconds{stage="task_to_sse"}) > 1` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Break down latency by stage: `task_to_status` (aggregation query), `status_to_sse` (NOTIFY → SSE delivery). Identify which stage is slow.
  2. If `task_to_status` is slow, follow the `WorkflowStatusRecomputationErrorRate` runbook for database performance analysis.
  3. If `status_to_sse` is slow, follow the SSE delivery latency runbook from the WORKFLOW_RUN_EVENT_STREAM spec.
  4. Check overall server CPU and memory. High GC pressure in the Bun runtime can delay NOTIFY processing.
  5. Check PostgreSQL replication lag if using a read replica for SSE LISTEN.

### Error Cases and Failure Modes

| Error Case | Detection | Impact | Recovery |
|-----------|-----------|--------|----------|
| Status aggregation query fails | Error log + metric | Run status not updated; may appear stuck | Next task completion retriggers aggregation |
| NOTIFY fails | Warn log + metric | SSE subscribers don't get live update | Subscribers reconnect and get current state via initial status event |
| Commit status write fails | Error log + metric | Landing request checks may show stale data | Manual commit status creation via API; or re-trigger workflow |
| Notification fanout fails | Warn log + metric | User not notified of completion | User can check inbox/run list manually |
| Downstream dispatch fails | Error log + metric | Dependent workflows not triggered | Manual dispatch of dependent workflow |
| Chain depth exceeded | Warn log + metric | Deeply chained workflow skipped | Review workflow configuration to reduce chain depth |
| Concurrent task completions cause lock wait | PG lock wait timeout | Delayed status update | Retried automatically on next task completion |
| Run has no tasks (orphaned) | Aggregation returns null | Run status shows as "unknown" | Admin cleanup; investigate why run was created without tasks |

## Verification

### API Integration Tests (`e2e/api/workflow-status-propagation.test.ts`)

#### Status Aggregation (12 tests)

- **PROP-API-001**: A run with one task transitioning `pending` → `running` → `done` produces status transitions `queued` → `running` → `success`
- **PROP-API-002**: A run with one task transitioning `pending` → `running` → `failed` produces status transitions `queued` → `running` → `failure`
- **PROP-API-003**: A run with one task transitioning `pending` → `cancelled` (never started) produces status `cancelled`
- **PROP-API-004**: A run with two tasks, one `done` and one `failed`, produces `failure`
- **PROP-API-005**: A run with two tasks, one `done` and one `cancelled`, produces `success` (done > 0)
- **PROP-API-006**: A run with all tasks `skipped` produces `success`
- **PROP-API-007**: A run with tasks in mixed states (`done`, `skipped`, all complete) produces `success`
- **PROP-API-008**: A run with one task `running` and one `failed` produces `running` (active takes priority)
- **PROP-API-009**: A run with one task `blocked` and all others `done` produces `running` (blocked is active)
- **PROP-API-010**: A run with zero tasks — aggregation endpoint returns appropriate handling (no crash)
- **PROP-API-011**: `started_at` is set on first transition away from `queued` and is preserved on subsequent recomputations
- **PROP-API-012**: `completed_at` is set when run first reaches terminal status and is preserved if recomputed again

#### Commit Status Propagation (10 tests)

- **PROP-API-013**: Creating a workflow run with a change ID creates a `pending` commit status with the workflow name as context
- **PROP-API-014**: When a run reaches `success`, the commit status is updated to `success`
- **PROP-API-015**: When a run reaches `failure`, the commit status is updated to `failure`
- **PROP-API-016**: When a run reaches `cancelled`, the commit status is updated to `error`
- **PROP-API-017**: The commit status `target_url` points to the workflow run detail page
- **PROP-API-018**: `GET /commits/:ref/statuses` returns commit statuses ordered by `created_at` DESC
- **PROP-API-019**: `GET /commits/:ref/statuses` returns statuses matching by change ID
- **PROP-API-020**: `GET /commits/:ref/statuses` returns statuses matching by commit SHA
- **PROP-API-021**: Commit status `context` at exactly 255 characters is accepted
- **PROP-API-022**: Commit status `context` exceeding 255 characters returns 400

#### Landing Request Checks (10 tests)

- **PROP-API-023**: `GET /landings/:number/checks` returns all required contexts with their latest status
- **PROP-API-024**: A landing request with all required checks as `success` returns `all_passed: true`
- **PROP-API-025**: A landing request with one required check as `failure` returns `all_passed: false`
- **PROP-API-026**: A landing request with a required check context that has no commit status returns the context as `missing`
- **PROP-API-027**: A landing request with no required checks configured returns empty checks array with `all_passed: true`
- **PROP-API-028**: Enqueuing a landing request with failing required checks returns 409 or appropriate error
- **PROP-API-029**: Enqueuing a landing request with all required checks passing succeeds
- **PROP-API-030**: Required checks evaluate the *latest* commit status per context (not oldest)
- **PROP-API-031**: Required checks evaluate across all change IDs in the landing request (stacked changes)
- **PROP-API-032**: Repository with 50 required check contexts evaluates correctly (boundary)

#### SSE Event Delivery on Status Change (6 tests)

- **PROP-API-033**: SSE subscriber receives a `status` event when a task completes and run status changes
- **PROP-API-034**: SSE subscriber receives a `done` event when run reaches `success`
- **PROP-API-035**: SSE subscriber receives a `done` event when run reaches `failure`
- **PROP-API-036**: SSE subscriber receives a `done` event when run reaches `cancelled`
- **PROP-API-037**: Multiple concurrent SSE subscribers each receive status events independently
- **PROP-API-038**: If NOTIFY fails (simulated), the run status is still correctly persisted in the database

#### Downstream Trigger Dispatch (8 tests)

- **PROP-API-039**: A run reaching `success` dispatches matching `workflow_run` triggers with type `success`
- **PROP-API-040**: A run reaching `failure` dispatches matching `workflow_run` triggers with type `failure`
- **PROP-API-041**: A run reaching `cancelled` dispatches matching `workflow_run` triggers with type `cancelled`
- **PROP-API-042**: All terminal statuses dispatch `completed` type triggers
- **PROP-API-043**: Non-matching workflow_run triggers are not dispatched
- **PROP-API-044**: Chain depth at 5 prevents further dispatch (depth limit enforcement)
- **PROP-API-045**: Self-trigger exclusion prevents a workflow from triggering itself
- **PROP-API-046**: Multiple matching downstream workflows are dispatched concurrently

#### Notification Fanout (4 tests)

- **PROP-API-047**: When a run reaches `success`, the initiator receives a notification with the workflow name and "succeeded"
- **PROP-API-048**: When a run reaches `failure`, the initiator receives a notification with the workflow name and "failure"
- **PROP-API-049**: When a run reaches `cancelled`, the initiator receives a notification with "cancelled"
- **PROP-API-050**: A workflow run triggered by the system (no initiator) does not produce a notification error

#### Idempotency and Concurrency (5 tests)

- **PROP-API-051**: Recomputing status on an unchanged task set produces the same result (idempotent)
- **PROP-API-052**: Two tasks completing near-simultaneously both trigger recomputation; final status is correct
- **PROP-API-053**: Recomputing status after a run is already terminal does not change `completed_at`
- **PROP-API-054**: Duplicate NOTIFY events do not cause duplicate downstream dispatches (idempotency key)
- **PROP-API-055**: A run with 100 tasks (stress) correctly aggregates status

#### Permission and Error Handling (6 tests)

- **PROP-API-056**: `GET /commits/:ref/statuses` on a private repo without auth returns 401
- **PROP-API-057**: `GET /commits/:ref/statuses` on a private repo with read-only token returns 200
- **PROP-API-058**: `POST /commits/:sha/status` without write access returns 403
- **PROP-API-059**: `POST /commits/:sha/status` with empty `context` field returns 400
- **PROP-API-060**: `POST /commits/:sha/status` with `status` value outside allowed enum returns 400
- **PROP-API-061**: `GET /landings/:number/checks` for nonexistent landing request returns 404

### CLI E2E Tests (`e2e/cli/workflow-status-propagation.test.ts`)

- **PROP-CLI-001**: `codeplane land checks <number>` displays check statuses with correct formatting
- **PROP-CLI-002**: `codeplane land checks <number> --json` outputs structured JSON with checks array
- **PROP-CLI-003**: `codeplane land checks <number>` for a landing request with all checks passing shows "All checks passed"
- **PROP-CLI-004**: `codeplane land checks <number>` for a landing request with failing checks shows count of passed/total
- **PROP-CLI-005**: `codeplane repo checks <ref>` lists commit statuses for a change
- **PROP-CLI-006**: `codeplane repo checks <ref> --json` outputs structured JSON
- **PROP-CLI-007**: `codeplane workflow watch <id>` shows status transitions as they occur and exits on terminal
- **PROP-CLI-008**: `codeplane land checks` for nonexistent landing request prints error and exits non-zero

### Playwright E2E Tests (`e2e/ui/workflow-status-propagation.test.ts`)

- **PROP-UI-001**: Workflow run detail page shows run status updating in real time as tasks complete
- **PROP-UI-002**: Workflow run detail page shows `completed_at` timestamp when run reaches terminal status
- **PROP-UI-003**: Landing request detail page checks tab shows all required check contexts
- **PROP-UI-004**: Landing request checks tab shows green checkmark for passed checks and red X for failed
- **PROP-UI-005**: Landing request checks tab shows "All checks passed" summary when all pass
- **PROP-UI-006**: Landing request checks tab shows pending indicator for checks that have not yet reported
- **PROP-UI-007**: Landing request merge button is disabled when required checks have not all passed
- **PROP-UI-008**: Landing request merge button is enabled when all required checks pass
- **PROP-UI-009**: Clicking a check's target URL navigates to the workflow run detail page
- **PROP-UI-010**: Repository settings page shows required check context configuration
- **PROP-UI-011**: Repository settings allows adding and removing required check contexts
- **PROP-UI-012**: Notification inbox shows workflow completion notification with correct status text

### TUI E2E Tests (`e2e/tui/workflow-status-propagation.test.ts`)

- **PROP-TUI-001**: Workflow run detail screen shows status transitions in real time
- **PROP-TUI-002**: Landing request detail checks tab shows required check statuses
- **PROP-TUI-003**: Landing request detail checks tab shows summary of passed/total
- **PROP-TUI-004**: Notification list shows workflow completion notifications

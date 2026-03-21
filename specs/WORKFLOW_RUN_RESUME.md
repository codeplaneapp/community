# WORKFLOW_RUN_RESUME

Specification for WORKFLOW_RUN_RESUME.

## High-Level User POV

When a workflow run fails or is cancelled, a developer often wants to retry that exact run from where it stopped rather than creating an entirely new run from scratch. Workflow Run Resume lets a developer pick up a failed or cancelled run and put it back into the execution queue, preserving the original trigger context, dispatch inputs, and run identity. This is fundamentally different from a rerun, which creates a brand-new run with a new ID — resume reactivates the *same* run so that its history, log trail, and run number remain intact.

From the developer's perspective, the experience is straightforward. When viewing a workflow run that ended in failure or was cancelled, a "Resume" action is available — as a button in the web UI, a keybinding in the TUI, and a subcommand in the CLI. Triggering it puts the run back into a queued state. Steps that had failed or been cancelled are reset and re-queued for execution. Steps that had already completed successfully are preserved. The run then proceeds through the workflow engine just as if it were freshly dispatched, but it carries its full prior context. Live log streaming reconnects automatically in clients that support SSE, so the developer sees step progression resume in real time.

Resume is valuable in several common scenarios: transient infrastructure failures that caused a step to error out, accidental cancellations, external dependency outages that have since been resolved, and iterative debugging where a developer fixes a workflow definition and wants to retry without losing the audit trail of the prior attempt. It reduces noise in the run list by avoiding duplicate run entries for what is logically the same execution, and it preserves the association between the run and its original trigger event (push, landing request, manual dispatch, etc.).

The feature is available across all Codeplane clients: the web UI, TUI, CLI, and API. In each surface, resume is strictly gated — it is only offered when the run is in a `cancelled` or `failure` state, and it requires write access to the repository.

## Acceptance Criteria

### Definition of Done

- [ ] A cancelled workflow run can be resumed, transitioning it back to `queued` status
- [ ] A failed workflow run can be resumed, transitioning it back to `queued` status
- [ ] Resuming a run resets only cancelled/failed steps and tasks — successfully completed steps are preserved
- [ ] Resuming a run clears the `completed_at` timestamp and sets `updated_at` to the current time
- [ ] Resuming a run preserves the original trigger event, trigger ref, trigger commit SHA, and dispatch inputs
- [ ] The resumed run retains its original run ID (no new run is created)
- [ ] After resume, the workflow engine picks up the run from the queue and begins executing reset steps
- [ ] A PG LISTEN/NOTIFY event is emitted on successful resume with source `workflow.resume`
- [ ] SSE-connected clients receive status updates when a run is resumed and steps begin executing
- [ ] Resume is available via API endpoint `POST /api/repos/:owner/:repo/workflows/runs/:id/resume`
- [ ] Resume is available via web UI "Resume" button on the run detail page
- [ ] Resume is available via TUI keybinding `R` on run detail screen and `m` on run list screen
- [ ] Resume is available via CLI command `codeplane run resume <id>`
- [ ] Resume returns 204 No Content on success
- [ ] Resume returns 400 for invalid (non-positive-integer) run IDs
- [ ] Resume returns 404 when the run does not exist or belongs to a different repository
- [ ] Resume returns 409 when the run is in a state other than `cancelled` or `failure` (with descriptive message including the current status)
- [ ] Resume returns 403 for users without write access to the repository
- [ ] Resume returns 401 for unauthenticated requests on private repositories

### State Gating

- [ ] Resume is disabled/hidden for runs in `queued` state
- [ ] Resume is disabled/hidden for runs in `running` state
- [ ] Resume is disabled/hidden for runs in `success` state
- [ ] Resume is disabled/hidden for runs in `timeout` state
- [ ] Resume is enabled only for runs in `cancelled` or `failure` state
- [ ] Attempting to resume a run that has transitioned state between client render and API call returns 409 and is handled gracefully

### Boundary Constraints

- [ ] Run ID must be a positive integer (int64 range: 1 to 9,223,372,036,854,775,807)
- [ ] Run ID value `0` returns 400
- [ ] Negative run ID values return 400
- [ ] Non-numeric run ID values return 400
- [ ] Run ID at maximum int64 boundary (9223372036854775807) is accepted if the run exists
- [ ] Run ID exceeding int64 maximum returns 400
- [ ] Resume request body is ignored — the endpoint accepts no request body
- [ ] Concurrent resume requests on the same run are safe (idempotent — second resume on an already-queued run returns 409)
- [ ] Resume on a run whose workflow definition has been deleted still succeeds (resume operates on the run, not the definition)
- [ ] Resume on a run in a repository that the user has been removed from returns 403/404

### Edge Cases

- [ ] Resuming a run that was cancelled immediately after creation (zero completed steps) resets all steps
- [ ] Resuming a run where all steps failed resets all steps
- [ ] Resuming a run where some steps succeeded and some failed resets only the failed steps
- [ ] Resuming a run multiple times in succession (cancel → resume → cancel → resume) works correctly each time
- [ ] Resuming a run during server restart/shutdown is safe (operation is atomic at the database level)
- [ ] Resume of a run with associated artifacts does not delete or modify existing artifacts
- [ ] Resume of a run with associated logs does not delete or modify existing log entries

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/workflows/runs/:id/resume`

**Request:**
- Method: `POST`
- Path parameters:
  - `owner` (string): Repository owner username or organization name
  - `repo` (string): Repository name
  - `id` (integer): Workflow run ID (positive int64)
- Headers: `Authorization: Bearer <token>` or session cookie
- Body: None (empty body)

**Success Response:** `204 No Content` (empty body)

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "message": "invalid run id" }` | Run ID is not a valid positive integer |
| 401 | `{ "message": "unauthorized" }` | No valid authentication |
| 403 | `{ "message": "forbidden" }` | User lacks write access to the repository |
| 404 | `{ "message": "workflow run not found" }` | Run does not exist or belongs to a different repository |
| 409 | `{ "message": "cannot resume workflow run with status \"<status>\"; only cancelled or failed runs can be resumed" }` | Run is not in `cancelled` or `failure` state |
| 429 | `{ "message": "rate limited" }` | Rate limit exceeded |

**Rate Limit Headers (all responses):**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

### SDK Shape

**Service method:** `WorkflowService.resumeRun(repositoryId: string, runId: string): Promise<Result<void, APIError>>`

**UI-core hook:** `useWorkflowRunResume(repo: RepoContext, runId: number)` — returns a mutation function that calls the resume endpoint and handles success/error states.

### Web UI Design

**Location:** Repository workflow run detail page (`/:owner/:repo/workflows/runs/:id`)

**Resume button:**
- Displayed in the action button group in the run detail header, right-aligned alongside "Cancel" and "Rerun" buttons
- Label: "Resume"
- Style: constructive/success color variant (green-tinted)
- Visibility: Only rendered when the run's status is `cancelled` or `failure`
- Disabled state: Button is hidden (not shown at all) for users without write access
- On click: Calls the resume API endpoint
- Loading state: Button shows a spinner and "Resuming…" text while the API call is in flight; button is disabled to prevent double-submission
- Success: Run status updates to `queued` in the UI; SSE connection re-establishes; step statuses begin updating in real-time
- Error: Toast notification with the error message from the API response

**State transitions visible after resume:**
- Run status badge changes from "Failed" (red) or "Cancelled" (gray) to "Queued" (yellow/amber)
- Duration counter resets (shows "—" while queued, then resumes counting when run transitions to `running`)
- `completed_at` timestamp disappears
- Failed/cancelled step cards reset their status badges to "Queued"
- Successfully completed step cards remain unchanged

### CLI Command

**Command:** `codeplane run resume <id>`

**Arguments:**
- `<id>` (required): Workflow run ID (positive integer)

**Flags:**
- `--repo, -R <owner/repo>`: Repository (defaults to current repo context)
- `--json`: Output result as JSON
- `--quiet, -q`: Suppress output on success

**Output (default):**
```
✓ Workflow run #1047 resumed
```

**Output (--json):**
```json
{ "run_id": 1047, "status": "queued" }
```

**Error output (stderr):**
```
Error: cannot resume workflow run with status "success"; only cancelled or failed runs can be resumed
```

**Exit codes:**
- `0`: Success
- `1`: API error (with message printed to stderr)

### TUI Design

**Run Detail Screen:**
- Keybinding: `R` (uppercase) — opens a confirmation overlay
- Confirmation overlay text: "Resume run #N from where it stopped?" with workflow name and Confirm/Cancel buttons
- Overlay color: success (ANSI 34, green-accented Confirm button)
- On confirm success: overlay dismisses, SSE reconnects, step statuses begin updating
- Only available when run status is `cancelled` or `failure`

**Run List Screen:**
- Keybinding: `m` — triggers immediate optimistic resume (no confirmation overlay)
- Optimistic update: row icon changes from `✕` (cancelled, muted) to `◎` (running, yellow)
- On API success: optimistic state preserved, silent data refresh
- On API failure: row reverts to original state, status bar flash with error message
- Only available when focused run status is `cancelled` or `failure`

**Invalid state behavior:**
- `R`/`m` on successful run → status bar: "Run completed successfully" (3s auto-dismiss)
- `R`/`m` on running/queued run → status bar: "Run cannot be resumed in current state" (3s auto-dismiss)

**Status bar hints:** `c:cancel r:rerun R:resume` — resume hint is highlighted when run is `cancelled` or `failure`, dimmed otherwise

### Documentation

1. **"Managing Workflow Runs"** — How to cancel, rerun, and resume runs from the web UI, CLI, and TUI. Explains the preconditions for each action, the difference between resume and rerun, and what happens to steps and logs.
2. **"CLI Reference: `codeplane run resume`"** — Full argument, flag, and output documentation with examples.
3. **"API Reference: Resume Workflow Run"** — Endpoint documentation with request/response schemas, error codes, and curl examples.
4. **"Workflow Run Lifecycle"** — State diagram showing all valid run state transitions including the resume path (`cancelled`/`failure` → `queued` → `running` → terminal state).

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View resume button/hint | ❌ | ✅ (dimmed) | ✅ | ✅ | ✅ |
| Resume a run | ❌ | ❌ (403) | ✅ | ✅ | ✅ |

- Resume requires **write access** to the repository.
- Read-only users see resume UI affordances in a dimmed/disabled state. Attempting the action returns 403 "forbidden".
- Anonymous users on public repositories can view run detail but cannot see or trigger resume.
- Admin users can resume runs triggered by any user in the repository.
- Repository visibility rules apply: private repo runs are not accessible to users without at least read access.
- Action buttons/keybindings are visible to all users with view access but only functional for users with write access. Users without write access who attempt an action receive 403 with `"forbidden"`.
- SSE connections for private repos require authentication via the existing SSE ticket mechanism.

### Rate Limiting

| Endpoint | Per-User Limit | Per-IP Limit | Window |
|----------|---------------|-------------|--------|
| `POST .../workflows/runs/:id/resume` | 30 requests/minute | N/A | Per user |

- Rate limit is shared across cancel, rerun, and resume action endpoints.
- 429 responses include `Retry-After` header with seconds until the limit resets.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in every response.
- No auto-retry on rate limit; user must wait and re-initiate the action.

### Data Privacy & PII

- The resume endpoint accepts no user-supplied content (no body, no query parameters beyond the path).
- No PII is exposed in the resume response (204 empty body).
- Error messages do not leak internal state beyond the run's current status string.
- The PG NOTIFY payload contains only the numeric run ID and event source string — no user data.
- Audit logs for resume actions should record the acting user ID and run ID but not expose them in public-facing APIs.
- Tokens are never displayed, logged, or included in error messages.
- Run ID is not considered PII.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workflow_run.resume_initiated` | User triggers resume from any surface | `repo_id`, `run_id`, `workflow_name`, `run_status_before`, `client` (web/cli/tui/api), `source_screen` (detail/list, for TUI) |
| `workflow_run.resume_completed` | Resume API call returns success | `repo_id`, `run_id`, `workflow_name`, `client`, `action_time_ms` |
| `workflow_run.resume_failed` | Resume API call returns error | `repo_id`, `run_id`, `workflow_name`, `client`, `http_status`, `error_type` (conflict/forbidden/not_found/rate_limited/network), `action_time_ms` |
| `workflow_run.resume_confirmed` | User confirms in TUI/web confirmation dialog | `repo_id`, `run_id`, `client`, `time_to_confirm_ms` |
| `workflow_run.resume_dismissed` | User dismisses confirmation dialog | `repo_id`, `run_id`, `client`, `time_to_dismiss_ms` |
| `workflow_run.resume_invalid_state` | User attempts resume on incompatible run | `repo_id`, `run_id`, `run_status`, `client` |
| `workflow_run.resume_sse_reconnect` | SSE reconnects after resume (TUI/web) | `repo_id`, `run_id`, `reconnect_success`, `reconnect_time_ms` |

### Common Properties (all events)
- `session_id`, `timestamp`, `user_id`, `org_id` (if applicable)

### Funnel Metrics & Success Indicators

| Metric | Target | Interpretation |
|--------|--------|----------------|
| Resume success rate | >90% | High success means users are resuming appropriately |
| Resume-to-completion rate | >60% | Resumed runs that eventually reach `success` — indicates resume is solving the user's problem |
| Resume vs. rerun ratio | 20-50% of retries use resume | Resume is being adopted as an alternative to rerun where appropriate |
| Confirmation-to-action rate (TUI/web) | >80% | Users who open the confirmation dialog follow through |
| Invalid state press rate | <10% | UI state gating is clear enough to prevent confusion |
| Time from failure to resume | Median <10 minutes | Developers resume quickly after investigating failures |
| Resumed runs that fail again | <40% | If consistently high, may indicate resume is being used for permanent failures |
| Permission denied rate | <3% | UI correctly hides/dims for unauthorized users |
| Action rate (resume from detail view) | >5% of detail views on resumable runs | Detail view is an effective launchpad for resume |
| Error rate | <2% | Low error rate indicates reliable backend |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------|
| `info` | Resume initiated | `{"event": "workflow_run.resume", "repo_id": N, "run_id": N, "user_id": N, "status_before": "cancelled|failure"}` |
| `info` | Resume completed | `{"event": "workflow_run.resume.completed", "repo_id": N, "run_id": N, "tasks_reset": N, "steps_reset": N, "duration_ms": N}` |
| `warn` | Resume rejected (409) | `{"event": "workflow_run.resume.conflict", "repo_id": N, "run_id": N, "current_status": "...", "user_id": N}` |
| `warn` | Resume rejected (403) | `{"event": "workflow_run.resume.forbidden", "repo_id": N, "run_id": N, "user_id": N}` |
| `warn` | Resume rate limited | `{"event": "workflow_run.resume.rate_limited", "repo_id": N, "run_id": N, "user_id": N}` |
| `warn` | PG NOTIFY failed (non-fatal) | `{"event": "workflow_run.resume.notify_failed", "repo_id": N, "run_id": N, "error": "..."}` |
| `error` | Resume DB error | `{"event": "workflow_run.resume.db_error", "repo_id": N, "run_id": N, "error": "...", "step": "tasks|steps|run"}` |
| `error` | Resume 404 | `{"event": "workflow_run.resume.not_found", "repo_id": N, "run_id": N}` |
| `debug` | Resume request received | `{"event": "workflow_run.resume.request", "repo_id": N, "run_id": N, "user_id": N}` |

All logs emitted with structured JSON context. Level controlled via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Prometheus Metrics

**Counters:**
- `codeplane_workflow_run_resume_total{status}` — Total resume requests by HTTP response status (204, 400, 403, 404, 409, 429, 500)
- `codeplane_workflow_run_action_total{action, status}` — Total cancel/rerun/resume requests (shared counter). Labels: action (`cancel`/`rerun`/`resume`), HTTP status

**Histograms:**
- `codeplane_workflow_run_resume_duration_seconds` — Time to process resume request (from handler entry to response). Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5

**Gauges:**
- `codeplane_workflow_runs_queued_total` — Current number of queued runs (existing metric; should increase by 1 after each successful resume)

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `WorkflowResumeHighErrorRate` | `rate(codeplane_workflow_run_resume_total{status=~"5.."}[5m]) / rate(codeplane_workflow_run_resume_total[5m]) > 0.1` for 5 minutes | Critical |
| `WorkflowResumeHighLatency` | `histogram_quantile(0.99, codeplane_workflow_run_resume_duration_seconds) > 2.0` for 5 minutes | Warning |
| `WorkflowResumeNotifyFailures` | `increase(codeplane_workflow_run_resume_notify_failed_total[15m]) > 10` | Warning |
| `WorkflowResumeHighConflictRate` | `rate(codeplane_workflow_run_resume_total{status="409"}[10m]) / rate(codeplane_workflow_run_resume_total[10m]) > 0.5` for 10 minutes | Info |

### Runbooks

**WorkflowResumeHighErrorRate:**
1. Check `codeplane_workflow_run_resume_total` metric grouped by status to identify the dominant error type.
2. If 500 errors dominate: check server logs for `workflow_run.resume.db_error` entries. Likely causes: database connectivity loss, table lock contention, or schema migration in progress.
3. Verify database health: check connection pool utilization, query latencies, and PostgreSQL error logs.
4. If the issue is transient (e.g., brief DB failover), monitor for automatic recovery. If sustained, check for recent deployments that may have introduced a regression.
5. Escalate to the platform team if database infrastructure appears unhealthy.

**WorkflowResumeHighLatency:**
1. Check database query latency for the `resumeWorkflowRun`, `resumeWorkflowTasks`, and `resumeWorkflowSteps` queries.
2. Look for table lock contention on `workflow_runs`, `workflow_tasks`, or `workflow_steps` tables.
3. Check if a large batch of runs is being resumed simultaneously (e.g., automated retry system).
4. Verify index health on the `workflow_run_id` and `status` columns in the tasks and steps tables.
5. If latency is localized to PG NOTIFY, the non-fatal notification step may be timing out — this is acceptable but should be monitored.

**WorkflowResumeNotifyFailures:**
1. Check PostgreSQL LISTEN/NOTIFY channel health. The `workflow_run_events` channel may be saturated.
2. Verify that PG connections used for NOTIFY are not being exhausted.
3. Note: NOTIFY failures are non-fatal — the resume operation itself succeeded. The impact is that SSE clients may not receive immediate status updates and will rely on polling or reconnection.
4. If failures are sustained, check for PG parameter `max_notify_queue_size` limits.

**WorkflowResumeHighConflictRate:**
1. A high 409 rate means users are frequently attempting to resume runs not in `cancelled` or `failure` state. This suggests UI rendering lag or race conditions.
2. Check if SSE status updates are being delivered to clients. If clients are not receiving real-time status updates, their displayed state may be stale.
3. Check if an automated system (bot, CI integration) is issuing resume requests without checking run state first.
4. If the issue is client-side staleness, verify SSE connection health and reconnection logic.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Invalid run ID | 400 | Non-numeric, zero, or negative ID | Client-side validation before API call |
| Run not found | 404 | ID does not exist or cross-repo access | User navigates back; check run ID |
| State conflict | 409 | Run is not cancelled/failed | Client refreshes run state; action button state updates |
| Permission denied | 403 | User lacks write access | User requests access or contacts admin |
| Unauthenticated | 401 | No valid session/token | Re-authenticate |
| Rate limited | 429 | Too many action requests | Wait for Retry-After period |
| Database error | 500 | DB connectivity or query failure | Retry; escalate if persistent |
| PG NOTIFY failure | Non-visible | Channel saturation | Non-fatal; SSE clients fall back to polling/reconnection |
| Partial reset (task reset succeeds, step reset fails) | 500 | DB error mid-operation | Investigate; may require manual intervention to reconcile state |

## Verification

### API Tests (`e2e/api/workflow-run-resume.test.ts`)

| ID | Test | Expected |
|----|------|----------|
| API-RES-001 | Resume a cancelled run | 204, run transitions to `queued` |
| API-RES-002 | Resume a failed run | 204, run transitions to `queued` |
| API-RES-003 | Resume a successful run | 409 with descriptive conflict message |
| API-RES-004 | Resume a running run | 409 |
| API-RES-005 | Resume a queued run | 409 |
| API-RES-006 | Resume a timed-out run | 409 |
| API-RES-007 | Resume with invalid run ID (string) | 400 |
| API-RES-008 | Resume with run ID 0 | 400 |
| API-RES-009 | Resume with negative run ID | 400 |
| API-RES-010 | Resume with run ID at max int64 boundary (9223372036854775807), run does not exist | 404 |
| API-RES-011 | Resume with run ID exceeding max int64 | 400 |
| API-RES-012 | Resume non-existent run | 404 |
| API-RES-013 | Resume run belonging to different repository | 404 |
| API-RES-014 | Resume without authentication on private repo | 401 |
| API-RES-015 | Resume as read-only user | 403 |
| API-RES-016 | Resume as write-access user | 204 |
| API-RES-017 | Resume as admin user | 204 |
| API-RES-018 | Resume as owner | 204 |
| API-RES-019 | Verify run status changes to `queued` after resume (GET run detail) | `status: "queued"`, `completed_at: null` |
| API-RES-020 | Verify failed tasks reset to `pending` after resume | task status is `pending`, `runner_id` is null, timing fields are null |
| API-RES-021 | Verify cancelled tasks reset to `pending` after resume | task status is `pending` |
| API-RES-022 | Verify successfully completed tasks are NOT reset after resume | task retains `success` status and timing fields |
| API-RES-023 | Verify failed steps reset to `queued` after resume | step status is `queued`, `started_at` is null, `completed_at` is null |
| API-RES-024 | Verify cancelled steps reset to `queued` after resume | step status is `queued` |
| API-RES-025 | Verify successfully completed steps are NOT reset after resume | step retains `success` status and timing fields |
| API-RES-026 | Resume preserves original trigger event | GET run after resume shows original `trigger_event` |
| API-RES-027 | Resume preserves original trigger ref | GET run after resume shows original `trigger_ref` |
| API-RES-028 | Resume preserves original dispatch inputs | GET run after resume shows original `dispatch_inputs` |
| API-RES-029 | Resume preserves original run ID | Run ID in response matches original |
| API-RES-030 | Resume does not create new run (run count unchanged) | GET run list before and after has same count |
| API-RES-031 | Concurrent resume requests on same run — second returns 409 | First returns 204, second returns 409 (run is now `queued`) |
| API-RES-032 | Resume → cancel → resume cycle works correctly | Each transition succeeds with expected status |
| API-RES-033 | Resume run with no body in request | 204 (body is ignored) |
| API-RES-034 | Resume run with unexpected body in request | 204 (body is ignored) |
| API-RES-035 | Resume response includes rate limit headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` present |
| API-RES-036 | Exceed rate limit on resume | 429 with `Retry-After` header |
| API-RES-037 | Resume run whose workflow definition has been deleted | 204 (resume operates on the run, not the definition) |
| API-RES-038 | Resume does not delete existing artifacts | Artifacts accessible after resume |
| API-RES-039 | Resume does not delete existing log entries | Logs accessible after resume |
| API-RES-040 | Resume run with very large run ID (close to int64 max, but valid) | 404 if run doesn't exist, 204 if it does |

### CLI Tests (`e2e/cli/workflow-run-resume.test.ts`)

| ID | Test | Expected |
|----|------|----------|
| CLI-RES-001 | `codeplane run resume <valid-cancelled-run-id>` | Exit 0, stdout: "✓ Workflow run #N resumed" |
| CLI-RES-002 | `codeplane run resume <valid-failed-run-id>` | Exit 0, stdout: "✓ Workflow run #N resumed" |
| CLI-RES-003 | `codeplane run resume <valid-success-run-id>` | Exit 1, stderr contains "cannot resume" and "only cancelled or failed" |
| CLI-RES-004 | `codeplane run resume <nonexistent-id>` | Exit 1, stderr: "workflow run not found" |
| CLI-RES-005 | `codeplane run resume` (no ID) | Exit 1, stderr: usage/help message |
| CLI-RES-006 | `codeplane run resume abc` (non-numeric) | Exit 1, stderr: "invalid run id" |
| CLI-RES-007 | `codeplane run resume <id> --json` | Exit 0, stdout: `{"run_id": N, "status": "queued"}` |
| CLI-RES-008 | `codeplane run resume <id> --quiet` | Exit 0, no stdout |
| CLI-RES-009 | `codeplane run resume <id> -R owner/repo` | Exit 0, targets specified repo |
| CLI-RES-010 | `codeplane run resume <id>` as read-only user | Exit 1, stderr: "forbidden" |
| CLI-RES-011 | Verify run is queryable as `queued` after CLI resume | `codeplane run view <id> --json` shows `status: "queued"` |

### Web UI Playwright Tests (`e2e/ui/workflow-run-resume.test.ts`)

| ID | Test | Expected |
|----|------|----------|
| WEB-RES-001 | Resume button visible on failed run detail page | Button labeled "Resume" is visible |
| WEB-RES-002 | Resume button visible on cancelled run detail page | Button labeled "Resume" is visible |
| WEB-RES-003 | Resume button NOT visible on successful run detail page | Button not in DOM or hidden |
| WEB-RES-004 | Resume button NOT visible on running run detail page | Button not in DOM or hidden |
| WEB-RES-005 | Resume button NOT visible on queued run detail page | Button not in DOM or hidden |
| WEB-RES-006 | Resume button NOT visible for read-only users | Button hidden for insufficient permissions |
| WEB-RES-007 | Click resume button → loading state | Button shows spinner, becomes disabled |
| WEB-RES-008 | Click resume button → success | Run status badge changes to "Queued", toast shows success |
| WEB-RES-009 | Click resume button → 409 conflict | Toast shows conflict error message |
| WEB-RES-010 | Click resume button → 403 forbidden | Toast shows permission denied message |
| WEB-RES-011 | After successful resume, failed step badges reset to "Queued" | Step status badges update |
| WEB-RES-012 | After successful resume, completed step badges remain unchanged | Successful step badges preserved |
| WEB-RES-013 | After successful resume, SSE reconnects and step statuses update in real-time | Live updates visible |
| WEB-RES-014 | Resume button double-click protection | Second click during loading state is no-op |

### TUI Tests (`e2e/tui/workflow-run-resume.test.ts`)

| ID | Test | Expected |
|----|------|----------|
| TUI-RES-001 | `R` on cancelled run detail → opens resume confirmation overlay | Overlay visible with "Resume run #N?" |
| TUI-RES-002 | `R` on failed run detail → opens resume confirmation overlay | Overlay visible |
| TUI-RES-003 | `R` on successful run detail → status bar "Run completed successfully" | No overlay, flash message |
| TUI-RES-004 | `R` on running run detail → status bar "Run cannot be resumed in current state" | No overlay, flash message |
| TUI-RES-005 | `Enter` in resume overlay → API call, spinner, success | Overlay dismisses, status updates |
| TUI-RES-006 | `Esc` in resume overlay → dismisses | No API call |
| TUI-RES-007 | Resume overlay 403 error → inline error message | "Permission denied" shown in overlay |
| TUI-RES-008 | Resume overlay 409 error → inline error message | "Run cannot be resumed in current state" |
| TUI-RES-009 | `m` on cancelled run in list → optimistic resume | Row icon changes from ✕ to ◎ |
| TUI-RES-010 | `m` on failed run in list → optimistic resume | Row icon changes |
| TUI-RES-011 | `m` on successful run in list → status bar flash | "Run cannot be resumed in current state" |
| TUI-RES-012 | Optimistic resume reverts on API error | Row returns to original state |
| TUI-RES-013 | Resume overlay at 80×24 → compact layout | 90% width, no workflow name |
| TUI-RES-014 | Resume overlay at 120×40 → standard layout | 40% width, workflow name visible |
| TUI-RES-015 | Status bar shows `R:resume` highlighted for cancelled/failed run | Hint visible and active |
| TUI-RES-016 | Status bar shows `R:resume` dimmed for running/successful run | Hint visible but dimmed |
| TUI-RES-017 | Read-only user: `R` → "Permission denied" flash | No overlay, no API call |
| TUI-RES-018 | SSE reconnects after resume on detail screen | Log streaming resumes |
| TUI-RES-019 | SSE status event during overlay → "Run state changed" → auto-dismiss | Overlay handles race condition |
| TUI-RES-020 | Rapid `R` presses → only first opens overlay | Subsequent presses are no-ops |

### Integration/E2E Lifecycle Tests (`e2e/integration/workflow-run-resume-lifecycle.test.ts`)

| ID | Test | Expected |
|----|------|----------|
| LIFE-RES-001 | Full lifecycle: dispatch → fail → resume → succeed | Run ends in `success` after resume |
| LIFE-RES-002 | Full lifecycle: dispatch → cancel → resume → succeed | Run ends in `success` after resume |
| LIFE-RES-003 | Full lifecycle: dispatch → fail → resume → fail again → resume → succeed | Multiple resume cycles work |
| LIFE-RES-004 | Resume vs. rerun comparison: same trigger context, different IDs | Resume retains ID, rerun creates new ID |
| LIFE-RES-005 | Verify PG NOTIFY fires on resume | Event listener receives `workflow.resume` source |
| LIFE-RES-006 | Verify SSE stream receives status update after resume | SSE event with new status is received |
| LIFE-RES-007 | Resume a run with 50 steps (10 failed, 40 success) | Only 10 steps reset; 40 preserved |
| LIFE-RES-008 | Resume a run and verify workflow engine picks it up within 30s | Run transitions from `queued` to `running` |

All 93 tests are left failing if backend is unimplemented — never skipped or commented out.

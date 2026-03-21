# WORKFLOW_RUN_CANCEL

Specification for WORKFLOW_RUN_CANCEL.

## High-Level User POV

When a developer triggers a workflow run — whether through a push event, a manual dispatch, or an automated trigger — there are many situations where that run needs to be stopped before it completes naturally. Perhaps the developer realized they pushed the wrong ref, or the run is executing against a stale commit, or a higher-priority workflow needs the runner capacity, or the run is simply stuck and consuming resources unnecessarily.

Workflow Run Cancel gives the developer immediate control to halt any active workflow run across every Codeplane surface — the web UI, CLI, TUI, and editor integrations. The cancellation is authoritative: once a user confirms the cancel action, the run transitions to a "cancelled" terminal state, all in-progress and pending tasks within that run are halted, and any associated streaming connections (logs, events, status) finalize gracefully. The developer sees clear, real-time feedback that the cancellation took effect.

The cancel action is context-aware and state-gated. It is only available when a run is in an active state (running or queued). Attempting to cancel a run that has already reached a terminal state (succeeded, failed, or already cancelled) produces a clear, human-readable explanation rather than a confusing error. This prevents accidental double-cancellations and makes the feature safe to use in fast-paced, multi-user workflows where run states may change between the time a user sees a run and the time they act on it.

After cancellation, the run remains fully visible in the run history with its "cancelled" status clearly indicated. The developer can then choose to rerun the workflow (creating a fresh run) or resume it (picking up where it left off), making cancel a non-destructive, reversible operation in the workflow lifecycle. This cancel → rerun/resume flow is central to how Codeplane treats workflow runs as first-class, auditable objects rather than fire-and-forget background jobs.

For agent-augmented teams, workflow cancellation is equally important. Agents may dispatch workflows programmatically, and the ability to cancel those runs through the same API ensures that both human operators and automated systems share a consistent control plane for workflow lifecycle management.

## Acceptance Criteria

### Definition of Done

- [ ] A user with write access to a repository can cancel any workflow run that is in `running` or `queued` status
- [ ] Cancellation transitions the run's status to `cancelled` and sets `completed_at` to the current timestamp
- [ ] All tasks belonging to the cancelled run that are in `pending`, `assigned`, `running`, or `blocked` status are transitioned to `cancelled` with `finished_at` set to the current timestamp
- [ ] Tasks that have already reached a terminal state (`success`, `failure`, `cancelled`) are not modified by the cancel operation
- [ ] Runs that are already in a terminal state (`success`, `failure`, `cancelled`) are not modified by the cancel operation (no-op at the database level)
- [ ] The cancel action is available and functional from: API, CLI, TUI (detail and list screens), and web UI
- [ ] After cancellation, SSE streams associated with the run (log streams, event streams, status streams) close gracefully
- [ ] After cancellation, the run can be rerun (creating a new run) or resumed (continuing from where it stopped)
- [ ] The cancel operation is idempotent — cancelling an already-cancelled run returns success (204) without error
- [ ] Appropriate telemetry events are fired on cancel initiation, success, and failure

### State Gating Constraints

- [ ] Cancel is only offered/enabled in UI surfaces when run status is `running` or `queued`
- [ ] Attempting to cancel a run in a terminal state via the API returns HTTP 204 (idempotent no-op — the SQL WHERE clause excludes terminal statuses)
- [ ] CLI reports "Run is not active" when attempting to cancel a terminal run and the response indicates no rows were modified
- [ ] TUI shows "Run is not active" in the status bar (3-second auto-dismiss) when pressing `c` on a terminal run
- [ ] Web UI disables or hides the Cancel button for runs not in `running` or `queued` status

### Input Validation & Boundary Constraints

- [ ] Run ID must be a positive integer (int64 range: 1 to 9,223,372,036,854,775,807)
- [ ] Run ID value of 0, negative numbers, non-numeric strings, or empty string returns HTTP 400 with `{"message": "invalid run id"}`
- [ ] Run ID values exceeding int64 max return HTTP 400
- [ ] Repository `owner` path parameter: 1–39 characters, alphanumeric plus hyphens, must not start/end with hyphen
- [ ] Repository `repo` path parameter: 1–100 characters, alphanumeric plus hyphens/underscores/dots
- [ ] Non-existent run ID for a valid repository returns HTTP 404 with `{"message": "workflow run not found"}`
- [ ] Non-existent repository returns HTTP 404

### Edge Cases

- [ ] Cancelling a run while another user simultaneously cancels the same run: both requests succeed (idempotent)
- [ ] Cancelling a run that transitions to a terminal state between request receipt and database write: no-op (SQL WHERE clause guards)
- [ ] Cancelling a run in a repository the user has read-only access to: HTTP 403
- [ ] Cancelling a run with no tasks (edge case — freshly created, no tasks dispatched yet): run transitions to cancelled, no task updates needed
- [ ] Cancelling a run where some tasks have completed and some are still running: only active tasks are cancelled; completed tasks retain their status
- [ ] Network timeout during cancel request: client should allow retry; server-side operation is atomic
- [ ] Cancel request with unexpected JSON body: request body is ignored (cancel takes no payload)
- [ ] Cancel request with query parameters: query parameters are ignored

## Design

### API Shape

#### Cancel a Workflow Run

Two equivalent endpoints exist (legacy and v2 path):

**Legacy Path:**
```
POST /api/repos/:owner/:repo/actions/runs/:id/cancel
```

**V2 Path (preferred):**
```
POST /api/repos/:owner/:repo/workflows/runs/:id/cancel
```

**Request:**
- Method: `POST`
- Content-Type: not required (no body)
- Authentication: session cookie, PAT (`Authorization: Bearer <token>`), or OAuth2 token
- Path parameters:
  - `owner` — repository owner username or organization name
  - `repo` — repository name
  - `id` — workflow run ID (positive integer)
- Body: none (any body content is ignored)

**Response — Success:**
- Status: `204 No Content`
- Body: empty

**Response — Invalid Run ID:**
- Status: `400 Bad Request`
- Body: `{"message": "invalid run id"}`

**Response — Run Not Found:**
- Status: `404 Not Found`
- Body: `{"message": "workflow run not found"}`

**Response — Unauthorized:**
- Status: `401 Unauthorized`
- Body: `{"message": "authentication required"}`

**Response — Forbidden:**
- Status: `403 Forbidden`
- Body: `{"message": "write access required"}`

**Response — Rate Limited:**
- Status: `429 Too Many Requests`
- Headers: `Retry-After: <seconds>`
- Body: `{"message": "rate limit exceeded"}`

### SDK Shape

The `WorkflowService` class in `@codeplane/sdk` exposes:

```typescript
class WorkflowService {
  async cancelRun(
    repositoryId: string,
    runId: string
  ): Promise<Result<void, APIError>>;
}
```

Behavior:
1. Fetches the workflow run by `runId` and `repositoryId` to verify existence
2. Returns `notFound` error if run does not exist
3. Executes `cancelWorkflowRun` — updates run status to `cancelled`, sets `completed_at = NOW()`, only for runs not already in terminal state
4. Executes `cancelWorkflowTasks` — updates all active tasks (`pending`, `assigned`, `running`, `blocked`) to `cancelled`, sets `finished_at = NOW()`
5. Returns `Result.ok(undefined)` on success

### CLI Command

```
codeplane workflow run cancel <id> [--repo OWNER/REPO]
```

**Arguments:**
- `id` (required) — The numeric workflow run ID to cancel

**Options:**
- `--repo OWNER/REPO` (optional) — Target repository. If omitted, resolved from the current working directory's repository context.

**Output (JSON mode):**
```json
{
  "id": 42,
  "status": "cancelled"
}
```

**Output (human-readable mode):**
```
✕ Workflow run #42 cancelled
```

**Error output:**
```
Error: workflow run not found
Error: invalid run id
Error: write access required
```

### TUI Design

#### Run Detail Screen

- Keybinding: `c` opens a confirmation overlay
- Confirmation overlay displays: "Cancel run #42?" with workflow name, Confirm and Cancel buttons
- Confirm button color: `error` (ANSI 196) — indicates destructive action
- During API call: spinner replaces Confirm button text (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms)
- On success: overlay dismisses, run status updates to `cancelled`, SSE connection closes, log panels finalize
- On error: error message shown inside overlay with retry option
- Keybinding hint in status bar: `c:cancel` (normal color when applicable, ANSI 245 dimmed when not)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows > ci > #42          │
├─────────────────────────────────────────────────────────────────┤
│ ◎ Running  #42  ci                                              │
│ push to main  abc1234  started 2m ago  elapsed 1m 45s           │
├───────────────────┬─────────────────────────────────────────────┤
│                   │                                             │
│     step list     │  ┌──────────────────────────┐              │
│     (dimmed)      │  │   Cancel run #42?         │              │
│                   │  │   ci                       │              │
│                   │  │                            │              │
│                   │  │   [Confirm]    [Cancel]    │              │
│                   │  └──────────────────────────┘              │
│                   │                                             │
├───────────────────┴─────────────────────────────────────────────┤
│ j/k:steps Enter:confirm Esc:dismiss                q:back       │
└─────────────────────────────────────────────────────────────────┘
```

#### Run List Screen

- Keybinding: `c` on focused row triggers immediate optimistic cancel (no confirmation overlay)
- Row status icon updates instantly to `✕` (gray)
- On API error: row reverts to previous state, status bar shows flash error message (3-second auto-dismiss)
- Status bar shows: `c:cancel r:rerun m:resume` keybinding hints

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows > ci > Runs           │
├──────────────────────────────────────────────────────────────────┤
│ ci › Runs (47)                                         / search  │
├──────────────────────────────────────────────────────────────────┤
│ ✓  #47  push      main         abc1234  1m 23s  3h              │
│ ✕  #46  push      main         def5678  45s     1d   ← cancel  │
│ ◎  #45  manual    feature/x    012abcd  2m 10s  2d              │
├──────────────────────────────────────────────────────────────────┤
│ j/k:nav Enter:detail c:cancel r:rerun m:resume f:filter q:back  │
│                              ⚡ Run #46 cancelled                │
└──────────────────────────────────────────────────────────────────┘
```

#### State Gating

- `c` key only active when focused run is `running` or `queued`
- `c` on terminal run: status bar shows "Run is not active" (3-second auto-dismiss), no API call
- `c` on already-cancelled run: status bar shows "Run is already cancelled" (3-second auto-dismiss)

#### Responsive Behavior

| Terminal Size | Overlay Width | Overlay Height | Content |
|---|---|---|---|
| 80×24 – 119×39 | 90% | 30% | Action label + buttons only |
| 120×40 – 199×59 | 40% | 20% | Full text with workflow name and run number |
| 200×60+ | 35% | 18% | Includes trigger ref and commit SHA |
| Minimum | 30ch | 5 rows | Action label, blank line, buttons |

#### Truncation & Boundary Constraints

- Workflow name in confirmation overlay: truncated at 35ch with `…`
- Run number in overlay: `#N` format, max 10ch
- Status bar flash messages: truncated at available width, with `…`
- Status bar flash messages auto-dismiss after 3 seconds
- Confirmation overlay minimum width: 30ch
- Confirmation overlay minimum height: 5 rows
- Error messages in overlay: max 60ch, wrapped to 2 lines if needed

### Web UI Design

The web UI displays a **Cancel** button on the workflow run detail page:

- Appears as a destructive-styled button (red outline or red fill) in the run header actions area
- Is visible only when the run status is `running` or `queued`
- Is hidden or disabled for terminal run states
- Opens a confirmation dialog on click: "Cancel run #42?" with Cancel and Confirm buttons
- Shows a loading spinner on the Confirm button during the API call
- On success: dialog closes, run status badge updates to "Cancelled" (gray), streaming panels stop
- On error: dialog shows inline error message

On the workflow runs list page:
- Each active run row includes a cancel icon/button in the actions column
- Clicking triggers a brief confirmation tooltip or inline confirmation
- On success: row status updates optimistically

### Documentation

1. **Workflow Run Lifecycle** — A guide explaining run states (queued → running → success/failure/cancelled) and the transitions between them, with cancel as a key user-initiated transition
2. **CLI Reference: `workflow run cancel`** — Command signature, arguments, options, output examples, and error cases
3. **API Reference: Cancel Workflow Run** — Endpoint documentation with request/response examples for both legacy and v2 paths
4. **TUI Keybinding Reference** — Document `c` key behavior on run detail and run list screens, including confirmation overlay interaction

## Permissions & Security

### Authorization Requirements

| Role | Can Cancel? | Notes |
|---|---|---|
| Repository Owner | ✅ Yes | Full access |
| Organization Admin | ✅ Yes | Admin-level access to all org repos |
| Repository Admin | ✅ Yes | Repository-scoped admin |
| Write Member (Team/Collaborator) | ✅ Yes | Standard write access |
| Read-Only Member | ❌ No | Returns 403 Forbidden |
| Anonymous / Unauthenticated | ❌ No | Returns 401 Unauthorized |

### Rate Limiting

- **Cancel endpoint**: 60 requests per minute per authenticated user per repository
- **Rationale**: Cancel is a mutation endpoint; 60/min is generous for human use but prevents automated abuse (e.g., a script rapidly cancelling all runs in a repository)
- Rate limit applies identically to both legacy and v2 endpoint paths
- Rate-limited responses include `Retry-After` header with seconds until reset

### Security Considerations

- **No PII exposure**: The cancel operation does not return or expose any user PII. It operates solely on run/task status fields.
- **Audit trail**: All cancel operations should be recorded in the repository audit log with: actor identity, run ID, previous run status, timestamp.
- **CSRF protection**: Web UI cancel requests must include CSRF token via session cookie mechanism.
- **Idempotency**: The cancel operation is safe to retry — no double-mutation risk.
- **No escalation path**: Cancelling a run does not grant the actor any additional access to run outputs, logs, artifacts, or secrets.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `workflow_run.cancel.initiated` | User initiates cancel action (before confirmation) | `repo_owner`, `repo_name`, `run_id`, `workflow_name`, `run_status_before`, `client` (web/cli/tui/api), `user_id` |
| `workflow_run.cancel.confirmed` | User confirms cancel (API call sent) | `repo_owner`, `repo_name`, `run_id`, `workflow_name`, `run_status_before`, `client`, `user_id` |
| `workflow_run.cancel.succeeded` | API returns 204 | `repo_owner`, `repo_name`, `run_id`, `workflow_name`, `run_status_before`, `client`, `user_id`, `action_time_ms` |
| `workflow_run.cancel.failed` | API returns error | `repo_owner`, `repo_name`, `run_id`, `workflow_name`, `run_status_before`, `client`, `user_id`, `error_code`, `error_message` |
| `workflow_run.cancel.denied` | 403 returned (insufficient permissions) | `repo_owner`, `repo_name`, `run_id`, `workflow_name`, `client`, `user_id` |
| `workflow_run.cancel.state_gated` | User attempted cancel on incompatible state | `repo_owner`, `repo_name`, `run_id`, `workflow_name`, `run_status`, `client`, `user_id` |

### TUI-Specific Events

| Event Name | Properties |
|---|---|
| `tui.workflow_run.cancel` | `repo`, `run_id`, `workflow_name`, `success`, `action_time_ms` |
| `tui.workflow_run.cancel_denied` | `repo`, `run_id`, `workflow_name` |

### Funnel Metrics & Success Indicators

- **Cancel initiation rate**: % of active workflow runs that receive a cancel request → indicates how often users need to intervene in runs
- **Cancel success rate**: % of cancel requests that succeed (204) vs. fail (4xx/5xx) → should be >99%
- **Cancel-to-rerun rate**: % of cancelled runs that are subsequently rerun → indicates cancel is used as a "restart" mechanism
- **Cancel-to-resume rate**: % of cancelled runs that are subsequently resumed → indicates cancel is used as a "pause" mechanism
- **Time-to-cancel**: Median time from run creation to cancel request → indicates how quickly users identify problematic runs
- **Client distribution**: Breakdown of cancel requests by client (web/cli/tui/api) → indicates which surfaces are most used for workflow management
- **Permission denial rate**: % of cancel attempts that return 403 → if high, indicates permission model confusion

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Cancel request received | `INFO` | `run_id`, `repository_id`, `user_id`, `client_ip`, `endpoint_path` |
| Cancel request validated (run found) | `DEBUG` | `run_id`, `repository_id`, `current_run_status` |
| Cancel executed successfully | `INFO` | `run_id`, `repository_id`, `user_id`, `previous_status`, `tasks_cancelled_count`, `duration_ms` |
| Cancel no-op (already terminal) | `INFO` | `run_id`, `repository_id`, `user_id`, `current_status` |
| Cancel failed (run not found) | `WARN` | `run_id`, `repository_id`, `user_id` |
| Cancel failed (invalid run ID) | `WARN` | `raw_id_param`, `client_ip` |
| Cancel failed (permission denied) | `WARN` | `run_id`, `repository_id`, `user_id`, `user_role` |
| Cancel failed (database error) | `ERROR` | `run_id`, `repository_id`, `error_message`, `error_stack` |
| Cancel rate limited | `WARN` | `user_id`, `client_ip`, `repository_id`, `requests_in_window` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workflow_run_cancel_total` | Counter | `repository_id`, `status` (`success`, `not_found`, `invalid_id`, `forbidden`, `error`, `noop`) | Total cancel requests by outcome |
| `codeplane_workflow_run_cancel_duration_seconds` | Histogram | `repository_id` | Time to process cancel request (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_workflow_run_cancel_tasks_affected` | Histogram | `repository_id` | Number of tasks transitioned to cancelled per cancel request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_workflow_runs_cancelled_total` | Counter | `repository_id`, `trigger_event` | Total runs that entered cancelled state (incremented on actual state transition) |
| `codeplane_workflow_run_cancel_errors_total` | Counter | `repository_id`, `error_type` (`db_error`, `timeout`, `connection_error`) | Total cancel errors by error category |

### Alerts & Runbooks

#### Alert: High Cancel Error Rate

- **Condition**: `rate(codeplane_workflow_run_cancel_errors_total[5m]) / rate(codeplane_workflow_run_cancel_total[5m]) > 0.05` sustained for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workflow_run_cancel_errors_total` by `error_type` to identify the dominant error category
  2. If `db_error`: Check database connectivity and query performance. Run `SELECT pg_stat_activity WHERE state = 'active'` to identify long-running queries. Check disk space and connection pool exhaustion.
  3. If `timeout`: Check database latency metrics. The cancel operation involves two UPDATE queries — check if either is blocked by row-level locks from concurrent workflow task execution.
  4. If `connection_error`: Verify database host reachability, check for network partitions, verify connection pool configuration.
  5. Check application logs for ERROR-level entries with `cancel` context in the last 15 minutes.
  6. If the issue is transient and self-resolving, monitor for 15 more minutes then resolve.

#### Alert: Cancel Latency Spike

- **Condition**: `histogram_quantile(0.99, rate(codeplane_workflow_run_cancel_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workflow_run_cancel_duration_seconds` histogram to identify the percentile distribution.
  2. Check database query latency for `CancelWorkflowRun` and `CancelWorkflowTasks` queries specifically.
  3. Look for runs with very large task counts (>100 tasks) — the `cancelWorkflowTasks` UPDATE may be slow if many rows match.
  4. Check for table bloat or missing indexes on `workflow_tasks.workflow_run_id` and `workflow_tasks.status`.
  5. Check for lock contention: `SELECT * FROM pg_locks WHERE NOT granted`.
  6. If isolated to specific repositories with very large runs, consider adding batch cancellation for task counts >100.

#### Alert: Anomalous Cancel Volume

- **Condition**: `rate(codeplane_workflow_run_cancel_total{status="success"}[15m]) > 3 * avg_over_time(rate(codeplane_workflow_run_cancel_total{status="success"}[15m])[7d:15m])` sustained for 15 minutes
- **Severity**: Info
- **Runbook**:
  1. Check if a single user or API token accounts for the majority of cancels (check `user_id` in logs).
  2. Determine if this correlates with a known incident (bad deployment triggering many workflow failures, leading to mass cancellation).
  3. If automated: identify the automation source and verify it's authorized behavior.
  4. If a single user is cancelling hundreds of runs, verify this is intentional (e.g., cleaning up after a misconfigured trigger).
  5. No immediate action required unless paired with elevated error rates.

#### Alert: Cancel Permission Denial Spike

- **Condition**: `rate(codeplane_workflow_run_cancel_total{status="forbidden"}[5m]) > 10` sustained for 5 minutes
- **Severity**: Info
- **Runbook**:
  1. Check logs for `user_id` and `repository_id` patterns — is a single user hitting permission errors repeatedly?
  2. Verify the user's repository access level hasn't been inadvertently downgraded.
  3. If multiple users: check if a recent permission change (team removal, repository transfer) affected access.
  4. If from a bot/token: verify the token's scope includes write access to the target repository.
  5. No action needed if the denial rate is proportional to normal traffic — this is the security model working correctly.

### Error Cases & Failure Modes

| Error Case | HTTP Status | Detection | Recovery |
|---|---|---|---|
| Invalid run ID format | 400 | Input validation | Client fixes input |
| Run not found | 404 | Database lookup | Client verifies run ID |
| Insufficient permissions | 403 | Auth middleware | User requests access |
| Rate limited | 429 | Rate limiter | Client waits and retries |
| Database connection failure | 500 | Connection pool | Automatic retry / alert |
| Database query timeout | 500 | Query timeout | Investigate locks / performance |
| Concurrent modification race | No error (idempotent) | SQL WHERE clause | No recovery needed |
| Auth token expired | 401 | Auth middleware | Client re-authenticates |

## Verification

### API Integration Tests

#### Happy Path
- [ ] **Cancel a running workflow run** — Dispatch a workflow, verify status is `running` or `queued`, send `POST .../workflows/runs/:id/cancel`, assert HTTP 204, fetch run detail, assert status is `cancelled` and `completed_at` is set
- [ ] **Cancel a queued workflow run** — Create a run that remains in `queued` state, cancel it, verify transition to `cancelled`
- [ ] **Cancel via legacy endpoint** — Send `POST .../actions/runs/:id/cancel`, assert HTTP 204, verify same behavior as v2 path
- [ ] **Cancel via v2 endpoint** — Send `POST .../workflows/runs/:id/cancel`, assert HTTP 204
- [ ] **Verify tasks are cancelled** — Dispatch a workflow with multiple tasks, cancel the run, fetch task list, assert all previously-active tasks have status `cancelled` and `finished_at` set
- [ ] **Verify completed tasks are preserved** — Dispatch a workflow where some tasks complete before cancel, cancel the run, verify completed tasks retain their `success` status while active tasks are `cancelled`
- [ ] **Cancelled run appears in run list** — Cancel a run, list runs, verify cancelled run appears with `cancelled` status
- [ ] **Cancelled run can be rerun** — Cancel a run, send rerun request, verify new run is created
- [ ] **Cancelled run can be resumed** — Cancel a run, send resume request, verify run transitions to `queued`

#### Idempotency & State Guards
- [ ] **Cancel an already-cancelled run** — Cancel a run, cancel it again, assert HTTP 204 (idempotent, no error)
- [ ] **Cancel a successful run** — Wait for a run to succeed, attempt cancel, assert HTTP 204 (no-op), verify status remains `success`
- [ ] **Cancel a failed run** — Wait for a run to fail, attempt cancel, assert HTTP 204 (no-op), verify status remains `failure`
- [ ] **Concurrent cancel requests** — Send two cancel requests simultaneously for the same run, assert both return HTTP 204, verify run is cancelled exactly once (no database errors)

#### Input Validation
- [ ] **Invalid run ID: zero** — Send cancel with run ID `0`, assert HTTP 400, body contains "invalid run id"
- [ ] **Invalid run ID: negative** — Send cancel with run ID `-1`, assert HTTP 400
- [ ] **Invalid run ID: non-numeric string** — Send cancel with run ID `abc`, assert HTTP 400
- [ ] **Invalid run ID: float** — Send cancel with run ID `42.5`, assert HTTP 400
- [ ] **Invalid run ID: empty** — Send cancel with empty ID path segment, assert HTTP 400 or 404
- [ ] **Maximum valid run ID** — Send cancel with run ID `9223372036854775807` (int64 max), assert HTTP 404 (not found, not 400)
- [ ] **Run ID exceeding int64 max** — Send cancel with run ID `9223372036854775808`, assert HTTP 400
- [ ] **Run not found** — Send cancel with a valid-format but non-existent run ID, assert HTTP 404, body contains "workflow run not found"
- [ ] **Non-existent repository** — Send cancel to a non-existent `owner/repo`, assert HTTP 404
- [ ] **Cancel with unexpected JSON body** — Send cancel with `{"foo": "bar"}` body, assert HTTP 204 (body ignored)
- [ ] **Cancel with empty body** — Send cancel with no body, assert HTTP 204

#### Authentication & Authorization
- [ ] **Unauthenticated cancel** — Send cancel without auth header/cookie, assert HTTP 401
- [ ] **Cancel with expired PAT** — Send cancel with revoked/expired token, assert HTTP 401
- [ ] **Cancel with read-only access** — Authenticate as read-only collaborator, send cancel, assert HTTP 403
- [ ] **Cancel with write access** — Authenticate as write collaborator, send cancel, assert HTTP 204
- [ ] **Cancel with admin access** — Authenticate as repo admin, send cancel, assert HTTP 204
- [ ] **Cancel with owner access** — Authenticate as repo owner, send cancel, assert HTTP 204

#### Rate Limiting
- [ ] **Exceed rate limit** — Send 61 cancel requests in under 60 seconds, assert the 61st returns HTTP 429 with `Retry-After` header

### CLI E2E Tests

- [ ] **CLI cancel a running workflow** — `codeplane workflow run cancel <id> --repo OWNER/REPO`, assert output contains run ID and status `cancelled`
- [ ] **CLI cancel with JSON output** — `codeplane workflow run cancel <id> --repo OWNER/REPO --json`, assert valid JSON with `id` and `status` fields
- [ ] **CLI cancel non-existent run** — `codeplane workflow run cancel 999999 --repo OWNER/REPO`, assert error message "workflow run not found"
- [ ] **CLI cancel invalid run ID** — `codeplane workflow run cancel abc --repo OWNER/REPO`, assert error about invalid ID
- [ ] **CLI cancel without --repo in repo context** — Run cancel from within a cloned repository directory, assert it resolves the repo automatically
- [ ] **CLI cancel without --repo outside repo context** — Run cancel from a non-repo directory without `--repo`, assert helpful error message
- [ ] **CLI workflow lifecycle: dispatch → cancel → rerun** — Full lifecycle test: dispatch a workflow, cancel it, verify cancelled, rerun it, verify new run created (existing test in `e2e/cli/workflow-lifecycle.test.ts`)

### TUI E2E Tests

- [ ] **TUI run detail: cancel keybinding shows for active run** — Navigate to a running workflow run detail, verify `c:cancel` appears in status bar in normal color
- [ ] **TUI run detail: cancel keybinding dimmed for terminal run** — Navigate to a completed workflow run detail, verify `c:cancel` appears dimmed (ANSI 245)
- [ ] **TUI run detail: cancel confirmation overlay** — Press `c` on a running run, verify confirmation overlay appears with "Cancel run #N?" text
- [ ] **TUI run detail: cancel confirmation overlay dismiss** — Press `c` then `Esc`, verify overlay dismisses and run state is unchanged
- [ ] **TUI run detail: cancel confirmation overlay confirm** — Press `c` then `Enter`, verify run transitions to cancelled
- [ ] **TUI run detail: cancel on terminal run shows status message** — Press `c` on a succeeded run, verify "Run is not active" appears in status bar
- [ ] **TUI run list: cancel optimistic update** — Focus a running run, press `c`, verify row icon changes to `✕` immediately
- [ ] **TUI run list: cancel on terminal run shows message** — Focus a completed run, press `c`, verify "Run is not active" status bar message
- [ ] **TUI run list: cancel error reverts optimistic update** — Simulate API error, verify row reverts to previous state and error flash appears
- [ ] **TUI cancel with read-only access** — Authenticate as read-only user, attempt cancel, verify "Permission denied" message
- [ ] **TUI rapid cancel key presses** — Press `c` multiple times rapidly on run detail, verify only one overlay opens
- [ ] **TUI cancel during SSE stream** — Cancel a run with active log streaming, verify stream closes gracefully

### Web UI (Playwright) E2E Tests

- [ ] **Web UI: Cancel button visible for running run** — Navigate to running workflow run detail, assert Cancel button is visible and enabled
- [ ] **Web UI: Cancel button hidden for completed run** — Navigate to succeeded workflow run detail, assert Cancel button is not present or disabled
- [ ] **Web UI: Cancel confirmation dialog** — Click Cancel button, assert confirmation dialog appears with run number and workflow name
- [ ] **Web UI: Cancel confirmation dialog dismiss** — Click Cancel button, then click Cancel in dialog, assert dialog closes and run state unchanged
- [ ] **Web UI: Cancel confirmation dialog confirm** — Click Cancel button, then click Confirm, assert run status updates to "Cancelled"
- [ ] **Web UI: Cancel button loading state** — Click Confirm, assert spinner appears on Confirm button during API call
- [ ] **Web UI: Cancel updates run list** — Cancel a run from detail page, navigate to runs list, verify run shows as cancelled
- [ ] **Web UI: Cancel on run list page** — Click cancel action on a run in the runs list, verify status updates
- [ ] **Web UI: Cancel permission check** — Log in as read-only user, navigate to running run, assert Cancel button is not present

### Cross-Surface Consistency Tests

- [ ] **Cancel via API, verify in CLI** — Cancel a run via direct API call, then use CLI to view the run, assert status is `cancelled`
- [ ] **Cancel via CLI, verify in API** — Cancel a run via CLI, then fetch via API, assert status is `cancelled` and `completed_at` is set
- [ ] **Cancel via CLI, verify tasks via API** — Cancel a run via CLI, fetch tasks via API, assert all previously-active tasks are `cancelled`

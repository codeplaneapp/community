# WORKFLOW_RUN_CLI_CANCEL

Specification for WORKFLOW_RUN_CLI_CANCEL.

## High-Level User POV

When a developer dispatches a workflow run — through a push event, manual trigger, or automated pipeline — they sometimes need to stop it before it finishes. Maybe they pushed the wrong branch, realized the workflow is running against stale code, or need to free up runner capacity for something more urgent.

The `codeplane workflow run cancel` command gives developers immediate, terminal-native control to halt any active workflow run without leaving their development flow. A single command with the run ID is all it takes. The developer gets instant confirmation that the run has been cancelled, and they can immediately follow up with a rerun or resume if needed.

The cancel command respects context. When run from inside a cloned Codeplane repository, it automatically resolves which repository the developer means — no need to type out `--repo owner/name` every time. When piped into other tools or used in scripts, the `--json` flag produces machine-readable output that automation can consume reliably.

The command is safe and predictable. Cancelling an already-cancelled or already-completed run does not produce an error — it simply acknowledges the current state. Cancelling a run that does not exist produces a clear, actionable error message rather than a cryptic stack trace. This makes the CLI cancel command equally useful for interactive developer use and for scripted CI/CD cleanup flows.

For agent-augmented teams, the CLI cancel command is a key building block. Agents that dispatch workflows programmatically can also cancel them programmatically, using the same command interface. This means human operators and automated agents share a single, consistent control surface for the entire workflow lifecycle — dispatch, monitor, cancel, rerun.

## Acceptance Criteria

### Definition of Done

- [ ] The command `codeplane workflow run cancel <id>` successfully cancels an active workflow run and produces output confirming the cancellation
- [ ] The command accepts `--repo OWNER/REPO` to explicitly target a repository
- [ ] When `--repo` is omitted, the command resolves the repository from the current working directory's jj/git context
- [ ] When `--repo` is omitted and no repository context is available, the command exits with a clear error message
- [ ] The command supports `--json` output mode returning structured JSON with `id` and `status` fields
- [ ] In human-readable mode, the command prints a concise confirmation line (e.g., `✕ Workflow run #42 cancelled`)
- [ ] The cancel API call transitions the run's status to `cancelled` and sets `completed_at`
- [ ] All tasks belonging to the run in `pending`, `assigned`, `running`, or `blocked` status are transitioned to `cancelled`
- [ ] Tasks already in terminal states (`success`, `failure`, `cancelled`) are not modified
- [ ] The command is idempotent — cancelling an already-cancelled run succeeds without error
- [ ] The command exits with a non-zero exit code and a clear error message when the run does not exist
- [ ] The command exits with a non-zero exit code and a clear error message when authentication is missing or invalid
- [ ] The command exits with a non-zero exit code and a clear error message when the user lacks write access

### Input Validation & Boundary Constraints

- [ ] Run ID argument is required — omitting it produces a usage error
- [ ] Run ID must be a positive integer in int64 range (1 to 9,223,372,036,854,775,807)
- [ ] Run ID value of `0` produces an "invalid run id" error
- [ ] Negative run IDs produce an "invalid run id" error
- [ ] Non-numeric run IDs (e.g., `abc`, `#42`, `run-42`) produce a parse/validation error
- [ ] Floating-point run IDs (e.g., `42.5`) produce a parse/validation error
- [ ] Run IDs exceeding int64 max produce an "invalid run id" error
- [ ] `--repo` value must be in `OWNER/REPO` format — missing slash, empty owner, or empty repo produce a validation error
- [ ] Repository owner: 1–39 characters, alphanumeric plus hyphens, must not start or end with hyphen
- [ ] Repository name: 1–100 characters, alphanumeric plus hyphens, underscores, and dots

### Edge Cases

- [ ] Cancelling a run while another user simultaneously cancels the same run via a different client: both succeed (idempotent at the database level)
- [ ] Cancelling a run that transitions to a terminal state between the CLI sending the request and the server processing it: succeeds as a no-op
- [ ] Cancelling a run with zero tasks (freshly created, no tasks dispatched yet): run transitions to cancelled, no task updates needed
- [ ] Cancelling a run where some tasks completed and some are still running: only active tasks are cancelled; completed tasks retain their original status
- [ ] Network timeout during the cancel request: CLI should report the timeout error; the server-side operation may have completed
- [ ] Extremely large run IDs at the int64 boundary (9,223,372,036,854,775,807): accepted as valid input and sent to the API
- [ ] Run ID with leading zeros (e.g., `0042`): coerced to `42` by numeric parsing
- [ ] Run ID with whitespace padding: handled by argument parsing (trimmed)
- [ ] Cancel request body content: the server ignores any body sent with the cancel request

## Design

### CLI Command

```
codeplane workflow run cancel <id> [--repo OWNER/REPO] [--json]
```

**Arguments:**

| Argument | Required | Type | Description |
|----------|----------|------|-------------|
| `id` | Yes | Positive integer | The numeric workflow run ID to cancel |

**Options:**

| Option | Required | Type | Default | Description |
|--------|----------|------|---------|-------------|
| `--repo` | No | `OWNER/REPO` | Resolved from CWD | Target repository in `OWNER/REPO` format |
| `--json` | No | Boolean flag | `false` | Output structured JSON instead of human-readable text |

**Human-readable output (default):**

Successful cancellation:
```
✕ Workflow run #42 cancelled
```

**JSON output (`--json`):**

```json
{
  "id": 42,
  "status": "cancelled"
}
```

**Error output (stderr, non-zero exit code):**

| Scenario | Output |
|----------|--------|
| Run not found | `Error: workflow run not found` |
| Invalid run ID | `Error: invalid run id` |
| Permission denied | `Error: write access required` |
| Auth required | `Error: authentication required` |
| Repo not resolvable | `Error: could not determine repository — use --repo OWNER/REPO or run from within a repository` |
| Rate limited | `Error: rate limit exceeded — retry after N seconds` |

**Exit codes:**

| Exit Code | Meaning |
|-----------|---------|
| `0` | Cancellation succeeded (or idempotent no-op on terminal run) |
| `1` | General error (not found, permission denied, network error, etc.) |

### API Shape

The CLI invokes the following API endpoint:

**V2 Path (preferred):**
```
POST /api/repos/:owner/:repo/workflows/runs/:id/cancel
```

**Legacy Path (also supported):**
```
POST /api/repos/:owner/:repo/actions/runs/:id/cancel
```

Note: The current CLI implementation uses the path `/api/repos/:owner/:repo/runs/:id/cancel`. All three path variants are equivalent.

**Request:**
- Method: `POST`
- Authentication: `Authorization: token <PAT>` header
- Body: none

**Response — Success:** HTTP 204 No Content (empty body)

**Response — Errors:**

| Status | Body | Meaning |
|--------|------|---------|
| `400` | `{"message": "invalid run id"}` | Run ID failed validation |
| `401` | `{"message": "authentication required"}` | Missing or invalid credentials |
| `403` | `{"message": "write access required"}` | User lacks write access to the repository |
| `404` | `{"message": "workflow run not found"}` | Run ID does not exist in the repository |
| `429` | `{"message": "rate limit exceeded"}` | Rate limit hit; `Retry-After` header present |

**Important behavioral note:** The server returns HTTP 204 with an empty body on success. The CLI's `api()` helper returns `undefined` for 204 responses. The CLI command must handle the `undefined` return value and synthesize the appropriate output from the known inputs (run ID and the inferred `cancelled` status).

### SDK Shape

The `WorkflowService` class in `@codeplane/sdk`:

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
2. Returns `Result.err(notFound("workflow run not found"))` if the run does not exist
3. Executes `cancelWorkflowRun(sql, { id: run.id })` — updates run status to `cancelled`, sets `completed_at = NOW()`, guarded by `WHERE status NOT IN ('success', 'failure', 'cancelled')`
4. Executes `cancelWorkflowTasks(sql, { workflowRunId: run.id })` — updates active tasks to `cancelled`, sets `finished_at = NOW()`, guarded by `WHERE status IN ('pending', 'assigned', 'running', 'blocked')`
5. Returns `Result.ok(undefined)` on success

### Documentation

1. **CLI Reference: `workflow run cancel`** — Full command signature, arguments, options, output examples (both human-readable and JSON), all error cases with example messages, exit code table, and usage examples including piping and scripting patterns.
2. **Workflow Run Lifecycle Guide** — A conceptual guide explaining run states (`queued` → `running` → `success`/`failure`/`cancelled`), what happens when a run is cancelled, and the cancel → rerun / cancel → resume patterns.
3. **API Reference: Cancel Workflow Run** — Endpoint documentation covering both legacy and v2 paths, request/response examples, authentication requirements, and error codes.

## Permissions & Security

### Authorization Requirements

| Role | Can Cancel? | HTTP Response |
|------|-------------|---------------|
| Repository Owner | ✅ Yes | 204 |
| Organization Admin | ✅ Yes | 204 |
| Repository Admin | ✅ Yes | 204 |
| Write Member (team or collaborator) | ✅ Yes | 204 |
| Read-Only Member | ❌ No | 403 Forbidden |
| Anonymous / Unauthenticated | ❌ No | 401 Unauthorized |

### Rate Limiting

- **Limit:** 60 cancel requests per minute per authenticated user per repository
- **Scope:** Rate limit applies identically to both legacy and v2 endpoint paths
- **Response:** HTTP 429 with `Retry-After` header indicating seconds until the rate window resets
- **Rationale:** 60/minute is generous for interactive human use but prevents automated abuse (e.g., a script rapidly cancelling all runs across a repository)

### Security Considerations

- **No PII exposure:** The cancel operation does not return or expose any user PII. It operates solely on run/task status fields. The CLI output contains only the run ID and status.
- **Audit trail:** All cancel operations are recorded in the repository audit log with: actor identity, run ID, previous run status, timestamp.
- **Token scope:** PATs used for the cancel command must have write access to the target repository. Read-only tokens are rejected with 403.
- **Idempotency safety:** The cancel operation is safe to retry — no double-mutation risk, no data loss.
- **No escalation path:** Cancelling a run does not grant the actor any additional access to run outputs, logs, artifacts, or secrets.
- **Credential handling:** The CLI reads PAT from the local auth state file. The token is sent over HTTPS in the `Authorization` header and never logged or echoed to stdout/stderr.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workflow_run.cancel.succeeded` | CLI cancel command completes with HTTP 204 | `repo_owner`, `repo_name`, `run_id`, `client: "cli"`, `user_id`, `action_time_ms`, `json_mode: boolean` |
| `workflow_run.cancel.failed` | CLI cancel command receives error HTTP status | `repo_owner`, `repo_name`, `run_id`, `client: "cli"`, `user_id`, `error_code`, `error_message` |
| `workflow_run.cancel.denied` | CLI cancel command receives 403 | `repo_owner`, `repo_name`, `run_id`, `client: "cli"`, `user_id` |
| `workflow_run.cancel.state_gated` | Cancel sent for a terminal-state run (server returns 204 as no-op) | `repo_owner`, `repo_name`, `run_id`, `client: "cli"`, `user_id` |
| `workflow_run.cancel.invalid_input` | CLI rejects input before API call (invalid run ID format) | `client: "cli"`, `raw_input`, `error_type` |

### Funnel Metrics & Success Indicators

- **CLI cancel usage rate:** Number of `workflow run cancel` invocations per day/week, compared to total workflow run count — indicates how often CLI users need to intervene in runs
- **CLI cancel success rate:** % of CLI cancel attempts that succeed vs. fail — target >99%
- **CLI cancel-to-rerun rate:** % of CLI-cancelled runs that are subsequently rerun (via any client) — indicates cancel is used as a "restart" pattern
- **CLI cancel-to-resume rate:** % of CLI-cancelled runs that are subsequently resumed — indicates cancel is used as a "pause" pattern
- **CLI cancel error breakdown:** Distribution of error types (not found, forbidden, rate limited, network error) — identifies UX friction points
- **Time-to-cancel from CLI:** Median time from run creation to CLI cancel — indicates how quickly developers identify and act on problematic runs
- **JSON mode adoption:** % of CLI cancel invocations using `--json` — indicates scripting/automation usage vs. interactive usage

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-----------------------|
| Cancel request received | `INFO` | `run_id`, `repository_id`, `user_id`, `client_ip`, `endpoint_path` |
| Cancel request validated (run exists) | `DEBUG` | `run_id`, `repository_id`, `current_run_status` |
| Cancel executed successfully (state transition) | `INFO` | `run_id`, `repository_id`, `user_id`, `previous_status`, `tasks_cancelled_count`, `duration_ms` |
| Cancel no-op (already terminal) | `INFO` | `run_id`, `repository_id`, `user_id`, `current_status` |
| Cancel failed — run not found | `WARN` | `run_id`, `repository_id`, `user_id` |
| Cancel failed — invalid run ID | `WARN` | `raw_id_param`, `client_ip` |
| Cancel failed — permission denied | `WARN` | `run_id`, `repository_id`, `user_id`, `user_role` |
| Cancel failed — database error | `ERROR` | `run_id`, `repository_id`, `error_message`, `error_stack` |
| Cancel rate limited | `WARN` | `user_id`, `client_ip`, `repository_id`, `requests_in_window` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_run_cancel_total` | Counter | `repository_id`, `status` (`success`, `not_found`, `invalid_id`, `forbidden`, `error`, `noop`) | Total cancel requests by outcome |
| `codeplane_workflow_run_cancel_duration_seconds` | Histogram | `repository_id` | Time to process cancel request. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 seconds |
| `codeplane_workflow_run_cancel_tasks_affected` | Histogram | `repository_id` | Number of tasks transitioned to cancelled per request. Buckets: 0, 1, 5, 10, 25, 50, 100 |
| `codeplane_workflow_runs_cancelled_total` | Counter | `repository_id`, `trigger_event` | Total runs that entered cancelled state (incremented only on actual state transition, not no-ops) |
| `codeplane_workflow_run_cancel_errors_total` | Counter | `repository_id`, `error_type` (`db_error`, `timeout`, `connection_error`) | Total cancel errors by error category |

### Alerts & Runbooks

#### Alert: High Cancel Error Rate

- **Condition:** `rate(codeplane_workflow_run_cancel_errors_total[5m]) / rate(codeplane_workflow_run_cancel_total[5m]) > 0.05` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_run_cancel_errors_total` by `error_type` label to identify the dominant error category.
  2. If `db_error`: Check database connectivity and query performance. Run `SELECT * FROM pg_stat_activity WHERE state = 'active'` to identify long-running queries. Check disk space and connection pool exhaustion.
  3. If `timeout`: Check database latency metrics. The cancel operation involves two UPDATE queries — check if either is blocked by row-level locks from concurrent workflow task execution.
  4. If `connection_error`: Verify database host reachability, check for network partitions, verify connection pool configuration.
  5. Check application logs for ERROR-level entries with `cancel` context in the last 15 minutes.
  6. If the issue is transient and self-resolving, monitor for 15 more minutes then resolve.

#### Alert: Cancel Latency Spike

- **Condition:** `histogram_quantile(0.99, rate(codeplane_workflow_run_cancel_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_run_cancel_duration_seconds` histogram to identify the percentile distribution.
  2. Check database query latency for `cancelWorkflowRun` and `cancelWorkflowTasks` queries specifically.
  3. Look for runs with very large task counts (>100 tasks) — the `cancelWorkflowTasks` UPDATE may be slow if many rows match.
  4. Check for table bloat or missing indexes on `workflow_tasks.workflow_run_id` and `workflow_tasks.status`.
  5. Check for lock contention: `SELECT * FROM pg_locks WHERE NOT granted`.
  6. If isolated to specific repositories with very large runs, consider adding batch cancellation for task counts >100.

#### Alert: Anomalous Cancel Volume

- **Condition:** `rate(codeplane_workflow_run_cancel_total{status="success"}[15m]) > 3 * avg_over_time(rate(codeplane_workflow_run_cancel_total{status="success"}[15m])[7d:15m])` sustained for 15 minutes
- **Severity:** Info
- **Runbook:**
  1. Check if a single user or API token accounts for the majority of cancels (filter logs by `user_id`).
  2. Determine if this correlates with a known incident (bad deployment triggering many workflow failures, leading to mass cancellation).
  3. If automated: identify the automation source and verify it's authorized behavior.
  4. If a single user is cancelling hundreds of runs, verify this is intentional (e.g., cleaning up after a misconfigured trigger).
  5. No immediate action required unless paired with elevated error rates.

#### Alert: Cancel Permission Denial Spike

- **Condition:** `rate(codeplane_workflow_run_cancel_total{status="forbidden"}[5m]) > 10` sustained for 5 minutes
- **Severity:** Info
- **Runbook:**
  1. Check logs for `user_id` and `repository_id` patterns — is a single user hitting permission errors repeatedly?
  2. Verify the user's repository access level hasn't been inadvertently downgraded.
  3. If multiple users: check if a recent permission change (team removal, repository transfer) affected access.
  4. If from a bot/token: verify the token's scope includes write access to the target repository.
  5. No action needed if the denial rate is proportional to normal traffic — this is the security model working correctly.

### Error Cases & Failure Modes

| Error Case | HTTP Status | CLI Exit Code | CLI Output | Recovery |
|------------|-------------|---------------|------------|----------|
| Invalid run ID format | 400 | 1 | `Error: invalid run id` | User fixes the run ID argument |
| Run not found | 404 | 1 | `Error: workflow run not found` | User verifies the run ID and repository |
| Insufficient permissions | 403 | 1 | `Error: write access required` | User requests write access or uses a different token |
| Not authenticated | 401 | 1 | `Error: authentication required` | User runs `codeplane auth login` |
| Rate limited | 429 | 1 | `Error: rate limit exceeded — retry after N seconds` | User waits and retries |
| Network error / timeout | N/A | 1 | `Error: request failed — <details>` | User retries; check network connectivity |
| Database error (server-side) | 500 | 1 | `Error: internal server error` | Ops team investigates via alerts and logs |
| Concurrent modification race | 204 (no-op) | 0 | `✕ Workflow run #N cancelled` | No recovery needed — idempotent |
| Cancel on terminal run | 204 (no-op) | 0 | `✕ Workflow run #N cancelled` | Informational — no action needed |

## Verification

### API Integration Tests

#### Happy Path
- [ ] **Cancel a running workflow run** — Dispatch a workflow, verify status is `running` or `queued`, send `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel`, assert HTTP 204, fetch run detail via GET, assert status is `cancelled` and `completed_at` is set
- [ ] **Cancel a queued workflow run** — Create a run that remains in `queued` state, cancel it, verify transition to `cancelled`
- [ ] **Cancel via legacy endpoint** — Send `POST /api/repos/:owner/:repo/actions/runs/:id/cancel`, assert HTTP 204, fetch run detail, verify status is `cancelled`
- [ ] **Cancel via v2 endpoint** — Send `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel`, assert HTTP 204
- [ ] **Verify tasks are cancelled** — Dispatch a workflow with multiple tasks, cancel the run, fetch task/step list, assert all previously-active tasks have status `cancelled` and `finished_at` set
- [ ] **Verify completed tasks are preserved** — Dispatch a workflow where some tasks complete before cancel, cancel the run, verify completed tasks retain their `success` status while only active tasks are `cancelled`
- [ ] **Cancelled run appears in run list** — Cancel a run, list runs for the repository, verify the cancelled run appears with `cancelled` status
- [ ] **Cancelled run can be rerun** — Cancel a run, send rerun request, verify a new run is created with `queued` status
- [ ] **Cancelled run can be resumed** — Cancel a run, send resume request, verify run transitions back to `queued`

#### Idempotency & State Guards
- [ ] **Cancel an already-cancelled run** — Cancel a run, cancel it again, assert HTTP 204 both times, verify run status is still `cancelled` with original `completed_at` timestamp unchanged
- [ ] **Cancel a successful run** — Wait for a run to succeed, attempt cancel, assert HTTP 204 (idempotent no-op), verify status remains `success` and `completed_at` unchanged
- [ ] **Cancel a failed run** — Wait for a run to fail, attempt cancel, assert HTTP 204, verify status remains `failure`
- [ ] **Concurrent cancel requests** — Send two cancel requests simultaneously for the same run, assert both return HTTP 204, verify run is cancelled exactly once (no database constraint violations)

#### Input Validation
- [ ] **Invalid run ID: zero** — Send cancel with run ID `0`, assert HTTP 400, body contains `"invalid run id"`
- [ ] **Invalid run ID: negative** — Send cancel with run ID `-1`, assert HTTP 400
- [ ] **Invalid run ID: non-numeric string** — Send cancel with run ID `abc`, assert HTTP 400
- [ ] **Invalid run ID: float** — Send cancel with run ID `42.5`, assert HTTP 400
- [ ] **Invalid run ID: empty** — Send cancel with empty ID path segment, assert HTTP 400 or 404 (route mismatch)
- [ ] **Maximum valid run ID (int64 max)** — Send cancel with run ID `9223372036854775807`, assert HTTP 404 (valid format, no such run)
- [ ] **Run ID exceeding int64 max** — Send cancel with run ID `9223372036854775808`, assert HTTP 400
- [ ] **Run ID as very large number** — Send cancel with run ID `99999999999999999999999`, assert HTTP 400
- [ ] **Non-existent run ID** — Send cancel with a valid-format but non-existent run ID (e.g., `999999`), assert HTTP 404, body contains `"workflow run not found"`
- [ ] **Non-existent repository** — Send cancel to a non-existent `owner/repo`, assert HTTP 404
- [ ] **Cancel with unexpected JSON body** — Send cancel with `{"foo": "bar"}` body and `Content-Type: application/json`, assert HTTP 204 (body ignored)
- [ ] **Cancel with empty body** — Send cancel with no body, assert HTTP 204

#### Authentication & Authorization
- [ ] **Unauthenticated cancel** — Send cancel without auth header/cookie, assert HTTP 401
- [ ] **Cancel with expired/revoked PAT** — Send cancel with an invalid token, assert HTTP 401
- [ ] **Cancel with read-only access** — Authenticate as a read-only collaborator, send cancel, assert HTTP 403
- [ ] **Cancel with write access** — Authenticate as a write collaborator, send cancel, assert HTTP 204
- [ ] **Cancel with admin access** — Authenticate as a repo admin, send cancel, assert HTTP 204
- [ ] **Cancel with owner access** — Authenticate as the repo owner, send cancel, assert HTTP 204
- [ ] **Cancel with org admin access** — Authenticate as an org admin (not direct repo member), send cancel for an org repo, assert HTTP 204

#### Rate Limiting
- [ ] **Exceed rate limit** — Send 61 cancel requests for the same repo in under 60 seconds, assert the 61st returns HTTP 429 with `Retry-After` header

### CLI E2E Tests

- [ ] **CLI cancel a running workflow** — `codeplane workflow run cancel <id> --repo OWNER/REPO`, assert exit code 0, output contains run ID and indicates cancellation
- [ ] **CLI cancel with JSON output** — `codeplane workflow run cancel <id> --repo OWNER/REPO --json`, assert exit code 0, assert valid JSON output with `id` (number) and `status` (`"cancelled"`) fields
- [ ] **CLI cancel non-existent run** — `codeplane workflow run cancel 999999 --repo OWNER/REPO`, assert exit code 1, stderr contains `"workflow run not found"`
- [ ] **CLI cancel with invalid run ID (non-numeric)** — `codeplane workflow run cancel abc --repo OWNER/REPO`, assert exit code 1, stderr contains error about invalid ID
- [ ] **CLI cancel with invalid run ID (zero)** — `codeplane workflow run cancel 0 --repo OWNER/REPO`, assert exit code 1
- [ ] **CLI cancel with invalid run ID (negative)** — `codeplane workflow run cancel -1 --repo OWNER/REPO`, assert exit code 1
- [ ] **CLI cancel without --repo in repo context** — Run cancel from within a cloned Codeplane repository directory without `--repo` flag, assert it resolves the repo automatically and succeeds
- [ ] **CLI cancel without --repo outside repo context** — Run cancel from `/tmp` or another non-repo directory without `--repo`, assert exit code 1 with helpful error message about providing `--repo`
- [ ] **CLI cancel with --repo in wrong format** — `codeplane workflow run cancel 1 --repo "just-a-name"`, assert exit code 1 with error about `OWNER/REPO` format
- [ ] **CLI cancel unauthenticated** — Run cancel without prior `codeplane auth login`, assert exit code 1 with authentication error
- [ ] **CLI workflow lifecycle: dispatch → cancel → rerun** — Full lifecycle test: dispatch a workflow, cancel the resulting run, verify cancelled status, rerun it, verify new run is created
- [ ] **CLI cancel idempotent — cancel already-cancelled run** — Cancel a run, then cancel it again, assert exit code 0 both times without error
- [ ] **CLI cancel with maximum valid int64 run ID** — `codeplane workflow run cancel 9223372036854775807 --repo OWNER/REPO`, assert either HTTP 404 error (not found) or graceful handling — no crash or panic
- [ ] **CLI cancel with run ID exceeding int64 max** — `codeplane workflow run cancel 9223372036854775808 --repo OWNER/REPO`, assert exit code 1 with "invalid run id" error

### Cross-Surface Consistency Tests

- [ ] **Cancel via CLI, verify via API** — Cancel a run using the CLI, then fetch the run via direct API GET request, assert status is `cancelled` and `completed_at` is set
- [ ] **Cancel via CLI, verify tasks via API** — Cancel a run via CLI, fetch the run's tasks via API, assert all previously-active tasks are `cancelled` with `finished_at` set, and previously-completed tasks are unchanged
- [ ] **Cancel via API, verify via CLI** — Cancel a run via direct API POST, then use `codeplane workflow run view <id> --repo OWNER/REPO --json` to view the run, assert status is `cancelled`
- [ ] **Cancel via CLI, verify in run list via CLI** — Cancel a run, then `codeplane workflow runs --repo OWNER/REPO --json`, verify the cancelled run appears in the list with `cancelled` status
- [ ] **Cancel via CLI, verify SSE stream terminates** — Start streaming logs for a running workflow via SSE, cancel the run via CLI in parallel, verify the SSE stream closes gracefully

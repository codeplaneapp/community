# WORKFLOW_CLI_WATCH

Specification for WORKFLOW_CLI_WATCH.

## High-Level User POV

When a developer dispatches a workflow or wants to observe a running workflow execution, they run `codeplane workflow watch <run-id>` from their terminal. This command connects to the live workflow run and streams real-time output directly into the terminal — step-by-step log lines, status transitions, and a final completion summary. The developer sees their CI pipeline, deploy script, or agent task execute in real time without leaving the CLI or switching to a browser.

The watch command is designed to feel like sitting in front of a live build log. As each workflow step begins, the user sees a status header. As the step emits output, each log line is printed with a step prefix so multi-step workflows remain readable. When a step finishes (success or failure), its completion status is announced. When the entire run reaches a terminal state — completed, failed, or cancelled — the command prints a final summary line and exits with a process exit code that reflects the outcome: 0 for success, 1 for failure or cancellation. This makes the watch command composable in shell scripts and CI-over-CI scenarios where a Codeplane workflow is invoked from an outer orchestration layer.

If the developer invokes `workflow watch` on a run that has already finished, the command immediately prints the run's final status and exits without opening a streaming connection — no dangling process, no confusion. If the run is still queued and hasn't started producing logs yet, the command stays connected, showing a waiting indicator until the first events arrive.

The watch command works seamlessly whether the developer is inside a cloned repository directory (auto-detecting the repo context) or specifying a remote repository explicitly with `--repo`. For scripting and agent consumption, the `--json` flag captures every SSE event — logs, status changes, and the done signal — as structured JSON on stdout, while human-readable log output flows to stderr. This separation makes it trivial for agents to parse run outcomes while still giving human operators a rich terminal experience.

The natural workflow is: `codeplane workflow dispatch 42` to trigger a workflow, note the returned run ID, then `codeplane workflow watch <run-id>` to follow its progress. For teams that automate this, the dispatch command's JSON output includes the run ID that feeds directly into the watch command.

## Acceptance Criteria

### Core Behavior
- [ ] `codeplane workflow watch <run-id>` connects to the SSE log stream for the specified workflow run
- [ ] The command immediately fetches the current run status before opening the stream
- [ ] If the run status is terminal (`completed`, `failed`, `cancelled`, `success`, `failure`, `error`), the command prints the final status and exits without opening an SSE connection
- [ ] If the run is non-terminal (`queued`, `running`), the command opens an SSE connection and streams events in real time
- [ ] The command prints `Watching run #<id> (status: <status>)...` to stderr when it begins watching
- [ ] Log events are printed to stderr with the format `[step <step>] <content>`
- [ ] Status change events are printed to stderr with the format `Status: <status>` (optionally with step context)
- [ ] When a `done` event is received, the command prints `Run completed: <status>` to stderr and exits
- [ ] The command exits with code 0 when the run completes with status `success` or `completed`
- [ ] The command exits with code 1 when the run completes with status `failed`, `failure`, `error`, or `cancelled`
- [ ] The command cleanly disconnects from the SSE stream on Ctrl+C (SIGINT) and exits with code 130
- [ ] If the SSE connection drops unexpectedly, the command exits with code 1 and prints a connection error

### Repository Resolution
- [ ] The command resolves the repository from the `--repo` flag first, then from the current directory's git/jj remote context if `--repo` is omitted
- [ ] If `--repo` is not provided and the current directory has no detectable repository context, the command prints an error and exits with code 1

### Structured Output
- [ ] `--json` flag outputs all collected SSE events as a JSON array to stdout upon completion
- [ ] Each event object in the JSON array has the shape `{ "type": string, "data": object, "id"?: string }`
- [ ] Human-readable log output continues to flow to stderr even when `--json` is active
- [ ] When `--json` is combined with a field selector (e.g., `--json type,data`), only the selected fields are included per event

### Input Validation
- [ ] `<run-id>` must be a positive integer; non-numeric values are rejected by the CLI argument parser before making an API call
- [ ] `<run-id>` of 0 or negative values are rejected by the CLI argument parser
- [ ] Run IDs up to 2^53 - 1 (Number.MAX_SAFE_INTEGER) are accepted
- [ ] Run IDs exceeding Number.MAX_SAFE_INTEGER are rejected with an error
- [ ] `--repo` must be in `OWNER/REPO` format; invalid formats are rejected by `resolveRepoRef()`

### Edge Cases
- [ ] Watching a run ID that does not exist returns exit code 1 with error `workflow run not found`
- [ ] Watching a run that belongs to a different repository than specified returns exit code 1 with error `workflow run not found`
- [ ] If the SSE stream sends a keep-alive comment (`:` prefix), it is silently ignored
- [ ] If the SSE stream sends a malformed JSON data payload, the raw string is printed as-is rather than crashing
- [ ] If the run transitions from `queued` to `running` during the watch, the status change event is displayed
- [ ] Multi-step workflows interleave log lines from different steps correctly, each prefixed with their step identifier
- [ ] Empty log content lines are printed as blank lines with the step prefix
- [ ] Log lines containing ANSI color codes are passed through unmodified
- [ ] Log lines containing Unicode characters are displayed correctly

### Boundary Constraints
- [ ] Log lines up to 64KB in length are displayed without truncation
- [ ] The command can handle workflow runs with up to 100 steps without degradation
- [ ] The command can handle workflow runs that emit up to 1 million log lines without running out of memory in non-`--json` mode
- [ ] In `--json` mode, the command accumulates events in memory; runs exceeding 500MB of accumulated event data should print a warning to stderr

### Definition of Done
- [ ] `workflow watch` command exists with `<run-id>` positional argument and `--repo` option
- [ ] The command delegates to `watchWorkflowRun()` which fetches status then conditionally streams
- [ ] SSE parsing handles `log`, `status`, and `done` event types correctly
- [ ] Keep-alive comments are silently consumed
- [ ] Exit code reflects run outcome (0 for success, 1 for failure/cancellation)
- [ ] E2E tests for CLI workflow watch pass
- [ ] The command is documented in the CLI help output

## Design

### CLI Command

**Command:** `codeplane workflow watch <run-id>`

**Positional Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `run-id` | positive integer | Yes | The numeric ID of the workflow run to watch |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | Auto-detected from cwd | Repository in `OWNER/REPO` format |

**Implicit flags (provided by framework):**

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean/string | Output collected events as JSON (may include field selector) |
| `--format` | string | Output format override |

**Human-readable output (non-terminal run, streaming):**

```
Watching run #87 (status: queued)...
Status: running
[step 1] Installing dependencies...
[step 1] added 423 packages in 12s
[step 1]
Status: running (step 2)
[step 2] Running tests...
[step 2] ✓ 47 tests passed
[step 2] ✗ 2 tests failed
Status: failure (step 2)
Run completed: failure
```

**Human-readable output (already terminal):**

```
Watching run #87 (status: completed)...
Run #87 already completed.
```

**JSON output (`--json`):**

stderr still shows the human-readable streaming output. stdout receives the final JSON after the run completes:

```json
{
  "id": 87,
  "status": "failure",
  "workflow_definition_id": 42,
  "trigger_event": "push",
  "trigger_ref": "main",
  "started_at": "2026-03-22T10:00:01.000Z",
  "completed_at": "2026-03-22T10:02:15.000Z",
  "events": [
    { "type": "status", "data": { "status": "running" } },
    { "type": "log", "data": { "step": 1, "content": "Installing dependencies...", "line": 1 }, "id": "1001" },
    { "type": "done", "data": { "status": "failure" } }
  ]
}
```

**Exit codes:**

| Scenario | Exit Code |
|----------|----------|
| Run completed with `success` / `completed` | 0 |
| Run completed with `failed` / `failure` / `error` | 1 |
| Run completed with `cancelled` | 1 |
| Already-terminal run (success) | 0 |
| Already-terminal run (failure/cancelled) | 1 |
| Run not found | 1 |
| Auth error | 1 |
| Network error / SSE disconnect | 1 |
| Ctrl+C (SIGINT) | 130 |

**Error behavior:**

| Scenario | Output (stderr) | Exit Code |
|----------|-----------------|----------|
| No repo context | `Error: Could not determine repository. Use --repo OWNER/REPO or run from inside a repository.` | 1 |
| Repository not found | `Error: repository not found` | 1 |
| Run not found | `Error: workflow run not found` | 1 |
| Not authenticated | `Error: Not authenticated. Run 'codeplane auth login' to sign in.` | 1 |
| Network failure | `Error: Failed to connect to <url>` | 1 |
| SSE stream disconnected | `Error: Connection to run stream lost` | 1 |
| API error (4xx/5xx) | `Error: <message from response body>` | 1 |

### API Shape

The CLI command consumes two existing API endpoints sequentially:

**1. Initial status fetch:**

`GET /api/repos/:owner/:repo/runs/:id`

Returns the current run object with status, timestamps, and metadata.

**2. SSE log stream (only if non-terminal):**

`GET /api/repos/:owner/:repo/runs/:id/logs`

**Request Headers:**
- `Authorization: token <pat>`
- `Accept: text/event-stream`

**SSE Event Types Received:**

| Event Type | Payload Shape | Description |
|------------|---------------|-------------|
| `status` | `{ "run": {...}, "steps": [...] }` | Current run and step status snapshot |
| `log` | `{ "log_id": number, "step": number, "line": number, "content": string, "stream": "stdout"\|"stderr" }` | Individual log line from a workflow step |
| `done` | `{ "run": {...}, "steps": [...] }` | Run has reached terminal state |

No new API endpoints are required.

### SDK Shape

The CLI consumes the API via the `api()` helper for the initial status fetch and raw `fetch()` for the SSE stream. No new SDK methods are required.

### Documentation

- **CLI Reference — `workflow watch`:** Document the command's purpose, the `<run-id>` positional argument, `--repo` flag, `--json` output behavior, exit code semantics, and example terminal output.
- **Workflows Quickstart Guide:** Show the dispatch-then-watch workflow as the primary interaction pattern.
- **CLI Streaming Guide:** Document how `workflow watch` and `run logs` differ (watch includes initial status check and exit code semantics; logs is raw streaming only).
- **Exit Code Reference:** Document that `workflow watch` uses exit codes to communicate run outcomes for shell script conditionals.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Repository Owner** | Can watch any workflow run in the repository |
| **Repository Admin** | Can watch any workflow run in the repository |
| **Repository Write Member** | Can watch any workflow run in the repository |
| **Repository Read Member** | Can watch any workflow run in the repository |
| **Organization Member** (non-repo member, public repo) | Can watch workflow runs |
| **Authenticated User** (public repo) | Can watch workflow runs |
| **Authenticated User** (private repo, no access) | CLI prints "repository not found", exit code 1 (HTTP 404 — no existence leak) |
| **Unauthenticated** | CLI prints authentication error, exit code 1 (HTTP 401) |

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `GET /api/repos/:owner/:repo/runs/:id` | 300 requests | Per minute, per authenticated user |
| `GET /api/repos/:owner/:repo/runs/:id/logs` (SSE) | 30 concurrent connections | Per authenticated user |

When the server returns HTTP 429, the CLI prints: `Error: Rate limit exceeded. Try again later.` and exits with code 1.

The SSE endpoint enforces a per-user concurrent connection limit because each watch command holds an open connection for the duration of the run. A limit of 30 concurrent SSE connections per user prevents resource exhaustion from automated agents that might spawn many parallel watch commands.

### Data Privacy

- The CLI does not log or cache credentials beyond the stored auth token managed by `codeplane auth login`.
- Workflow log content may contain sensitive output (environment variable echoes, build artifact paths, secret-masked values). The CLI passes this through unmodified. Server-side secret masking must be applied before log emission.
- The `--json` output includes full event payloads. If piped to a file, the file inherits the sensitivity of the workflow logs.
- No PII is present in the run metadata (IDs, status, timestamps). Log content sensitivity depends on the workflow definition.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `cli.workflow.watch.started` | CLI `workflow watch` command begins execution | `repository_id`, `owner`, `repo`, `run_id`, `initial_status`, `repo_detection_method` (flag/auto), `output_format` (json/human) |
| `cli.workflow.watch.already_terminal` | Watch invoked on an already-terminal run | `repository_id`, `run_id`, `terminal_status`, `output_format` |
| `cli.workflow.watch.completed` | SSE stream delivers a `done` event and command exits | `repository_id`, `run_id`, `final_status`, `duration_seconds`, `event_count`, `log_event_count`, `status_event_count`, `output_format`, `exit_code` |
| `cli.workflow.watch.disconnected` | SSE stream drops before a `done` event | `repository_id`, `run_id`, `duration_seconds`, `event_count`, `disconnect_reason` (network/sigint/timeout) |
| `cli.workflow.watch.error` | Command fails with an error | `error_type` (auth/not_found/network/rate_limit/api_error), `error_message`, `run_id`, `owner`, `repo` |

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| **Watch completion rate** | > 80% | Percentage of `watch.started` events that produce a `watch.completed` event (vs. disconnect/error) |
| **Dispatch-to-watch conversion** | > 40% | Percentage of `workflow dispatch` invocations followed by `workflow watch` within 60 seconds |
| **JSON output adoption** | > 25% | Percentage of watch invocations using `--json` (indicates agent/scripting usage) |
| **Already-terminal rate** | < 30% | Percentage of invocations hitting an already-finished run (high rate may indicate UX gap in surfacing run ID at dispatch time) |
| **Median watch duration** | 30s–300s | Typical wall-clock time watching a run |
| **Disconnection rate** | < 10% | Percentage of sessions ending in disconnect rather than clean completion |
| **Exit code 0 rate** | > 60% | Percentage of completed watches where the run succeeded (overall CI health indicator) |

## Observability

### Logging Requirements

| Log Level | Event | Structured Context |
|-----------|-------|-----------------------|
| `DEBUG` | CLI resolving repository context | `repo_flag`, `detected_owner`, `detected_repo`, `detection_method` |
| `DEBUG` | Initial run status fetch request | `method` (GET), `url`, `run_id` |
| `DEBUG` | Initial run status fetch response | `status_code`, `run_status`, `duration_ms` |
| `DEBUG` | SSE connection opening | `url`, `run_id` |
| `DEBUG` | SSE event received | `event_type`, `event_id`, `data_size_bytes` |
| `DEBUG` | SSE keep-alive received | `run_id`, `elapsed_since_last_event_ms` |
| `INFO` | Watch command started | `run_id`, `initial_status`, `output_format` |
| `INFO` | Watch command completed | `run_id`, `final_status`, `duration_seconds`, `total_events`, `exit_code` |
| `INFO` | Watch exiting for already-terminal run | `run_id`, `terminal_status` |
| `WARN` | SSE stream unexpectedly closed | `run_id`, `events_received`, `elapsed_seconds`, `last_event_type` |
| `WARN` | Malformed SSE data payload (JSON parse failure) | `run_id`, `raw_data_preview` (first 256 chars), `event_type` |
| `ERROR` | Initial run status fetch failed | `run_id`, `status_code`, `error_message`, `url` |
| `ERROR` | SSE connection failed to establish | `run_id`, `status_code`, `error_message`, `url` |
| `ERROR` | Network error during SSE stream | `run_id`, `error_message`, `events_received_before_error` |

Note: CLI logging is controlled by the CLI's verbosity level. Only `ERROR` level messages are shown by default; `DEBUG` and `INFO` require `--verbose`.

### Prometheus Metrics

Server-side metrics covering the API endpoints consumed by the watch command:

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_run_get_requests_total` | `status`, `client` | Total initial status fetch requests |
| `codeplane_workflow_run_logs_sse_connections_total` | `status`, `client` | Total SSE connection attempts |
| `codeplane_workflow_run_logs_sse_events_emitted_total` | `event_type`, `run_id` | Total SSE events emitted |
| `codeplane_workflow_run_logs_sse_disconnects_total` | `reason` (client_close, server_close, timeout, error) | Total SSE disconnections |

**Gauges:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_run_logs_sse_active_connections` | `user_id` | Currently active SSE connections |

**Histograms:**

| Metric | Buckets | Labels | Description |
|--------|---------|--------|-------------|
| `codeplane_workflow_run_get_duration_seconds` | 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 | `status`, `client` | Duration of initial run status fetch |
| `codeplane_workflow_run_logs_sse_session_duration_seconds` | 1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600 | `final_status`, `disconnect_reason` | Duration of SSE sessions |
| `codeplane_workflow_run_logs_sse_events_per_session` | 10, 50, 100, 500, 1000, 5000, 10000, 50000 | `final_status` | Number of events emitted per SSE session |

### Alerts & Runbooks

#### Alert 1: High SSE Connection Count Per User

- **Condition:** `max by (user_id) (codeplane_workflow_run_logs_sse_active_connections) > 25`
- **Severity:** Warning
- **Runbook:**
  1. Identify the user with excessive connections from the `user_id` label.
  2. Check if the user is running an automated script that spawns many parallel watch commands.
  3. If the connections are from an agent/bot account, contact the team operating the bot and recommend serial watch invocations or using webhooks instead.
  4. If connections are growing unboundedly, check for leaked connections (client disconnected but server didn't clean up). Verify SSEManager cleanup logic.
  5. If approaching the per-user limit of 30, the server will start returning 429s.

#### Alert 2: High SSE Disconnection Rate

- **Condition:** `rate(codeplane_workflow_run_logs_sse_disconnects_total{reason=~"timeout|error"}[5m]) / rate(codeplane_workflow_run_logs_sse_connections_total{status="200"}[5m]) > 0.15`
- **Severity:** Warning
- **Runbook:**
  1. Check the `reason` label breakdown. If mostly `timeout`, the keep-alive interval may not be reaching clients — check for reverse proxy idle timeouts (nginx, cloudflare) that close connections before the 15-second keep-alive fires.
  2. If mostly `error`, check server error logs for stack traces. Common causes: PostgreSQL LISTEN connection dropped, SSEManager restarted, OOM kill.
  3. Check if the issue correlates with deployment events (rolling restarts drop all SSE connections).
  4. Verify network path: run a test SSE connection from an external client.
  5. If reverse proxy is the issue, increase its idle timeout to at least 30 seconds.

#### Alert 3: SSE Events Not Being Emitted for Active Runs

- **Condition:** `increase(codeplane_workflow_run_logs_sse_events_emitted_total[5m]) == 0` AND `codeplane_workflow_run_logs_sse_active_connections > 0`
- **Severity:** Critical
- **Runbook:**
  1. Active SSE connections exist but no events are being emitted. This suggests the PostgreSQL LISTEN/NOTIFY pipeline is broken.
  2. Check PostgreSQL connectivity from the SSEManager: review logs for "SSE manager failed to start" or LISTEN subscription errors.
  3. Verify that workflow runners are still emitting `pg_notify` calls by checking `workflow_logs` table for recent inserts.
  4. If logs are being inserted but notifications aren't firing, check PostgreSQL's `pg_stat_activity` for the LISTEN connection.
  5. Restart the SSEManager by restarting the Codeplane server process.
  6. If the issue persists, check PostgreSQL max_connections.

#### Alert 4: Workflow Watch Initial Fetch High Error Rate

- **Condition:** `rate(codeplane_workflow_run_get_requests_total{status=~"5..",client="cli"}[5m]) / rate(codeplane_workflow_run_get_requests_total{client="cli"}[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Open Grafana and filter by `client=cli`, `status=5xx`.
  2. Check server error logs for stack traces correlated by `request_id`.
  3. Verify database health — `getWorkflowRun` and `listWorkflowSteps` are the key queries.
  4. Check if the issue is isolated to a specific repository or run ID.
  5. If caused by a recent deployment, roll back and investigate.
  6. Escalate to backend on-call if not resolved within 15 minutes.

### Error Cases & Failure Modes

| Error Case | Expected CLI Behavior | Detection |
|------------|----------------------|----------|
| No auth token configured | Print auth error, exit 1 | `requireAuthToken()` throws |
| `--repo` format invalid | Print validation error, exit 1 | `resolveRepoRef()` throws |
| No repo context and no `--repo` | Print repo detection error, exit 1 | `resolveRepoRef()` throws |
| Run ID non-numeric | CLI parser rejects, exit 1 | Zod coerce validation |
| Run ID zero or negative | CLI parser rejects, exit 1 | Zod positive integer validation |
| Repository not found | Print "repository not found", exit 1 | API returns 404 |
| Private repo, no access | Print "repository not found", exit 1 | API returns 404 |
| Run not found | Print "workflow run not found", exit 1 | API returns 404 |
| Auth token expired/revoked | Print auth error, exit 1 | API returns 401 |
| Rate limit exceeded | Print rate limit message, exit 1 | API returns 429 |
| Server internal error | Print server error, exit 1 | API returns 500 |
| SSE connection refused | Print connection error, exit 1 | `fetch()` rejects |
| SSE response non-200 | Print stream error, exit 1 | Response status check |
| SSE stream body missing | Print error, exit 1 | `res.body?.getReader()` returns null |
| SSE connection dropped mid-stream | Print disconnect error, exit 1 | `reader.read()` returns done prematurely |
| DNS resolution failure | Print connection error, exit 1 | `fetch()` rejects |
| Malformed JSON in SSE data | Print raw data as-is, continue | `JSON.parse` catch |
| SIGINT (Ctrl+C) | Clean disconnect, exit 130 | Process signal handler |

## Verification

### Core Functionality Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.watch.success_run` | Dispatch a workflow that succeeds, then `codeplane workflow watch <id>` | Command streams log events and status changes to stderr, prints `Run completed: success`, exits with code 0 |
| `cli.wf.watch.failed_run` | Dispatch a workflow that fails (exit code 1 in a step), then watch it | Command streams logs including failure output, prints `Run completed: failure`, exits with code 1 |
| `cli.wf.watch.cancelled_run` | Dispatch a workflow, cancel it via `codeplane run cancel`, then watch it | If cancel arrives before watch connects: "already cancelled" and exit 1. If during watch: status change to cancelled, then done, exit 1 |
| `cli.wf.watch.already_completed` | Dispatch a workflow, wait for it to finish, then run `workflow watch <id>` | Prints `Watching run #<id> (status: completed)...` then `Run #<id> already completed.`, exits with code 0 |
| `cli.wf.watch.already_failed` | Watch a previously failed run | Prints already-failed message, exits with code 1 |
| `cli.wf.watch.already_cancelled` | Watch a previously cancelled run | Prints already-cancelled message, exits with code 1 |
| `cli.wf.watch.queued_to_running` | Dispatch a workflow and immediately watch before it starts | Shows `Watching run #<id> (status: queued)...` then receives status events as run transitions through queued → running → completed |
| `cli.wf.watch.multi_step` | Watch a workflow with 3+ steps | Log lines from different steps appear with correct `[step X]` prefixes |
| `cli.wf.watch.stderr_output` | Capture stderr during a successful watch | All human-readable output appears on stderr |

### Structured Output Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.watch.json.default` | Run `codeplane workflow watch <id> --json` on a completing run | stdout is valid JSON with `id`, `status`, and `events` array; stderr shows human-readable output |
| `cli.wf.watch.json.events_shape` | Verify JSON events array | Each event has `type` (string), `data` (object), and optionally `id` (string) |
| `cli.wf.watch.json.event_types` | Watch a run with logs, status changes, and completion | JSON events contains at least one of each: `log`, `status`, `done` |
| `cli.wf.watch.json.already_terminal` | Run `--json` on already-completed run | stdout is valid JSON with run data |
| `cli.wf.watch.json.field_filter` | Run `--json type,data` | Each event contains only `type` and `data` keys |

### Repository Resolution Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.watch.repo_flag` | Run `codeplane workflow watch <id> --repo owner/repo` | Uses the explicit repo |
| `cli.wf.watch.auto_repo` | Run from inside a cloned repo directory | Auto-detects the repo |
| `cli.wf.watch.no_repo_context` | Run from `/tmp` without `--repo` | Exit code 1, error about repository detection |
| `cli.wf.watch.invalid_repo_format` | Run with `--repo no-slash` | Exit code 1, validation error |

### Auth & Permissions Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.watch.auth.no_token` | Run without configured auth token | Exit code 1, authentication error |
| `cli.wf.watch.auth.valid_pat` | Run with valid PAT | Exit code 0 (assuming run succeeds) |
| `cli.wf.watch.auth.expired_pat` | Run with expired PAT | Exit code 1, auth error |
| `cli.wf.watch.auth.public_repo_other_user` | Watch run on public repo user doesn't own | Exit code 0, events streamed |
| `cli.wf.watch.auth.private_repo_no_access` | Watch run on private repo without access | Exit code 1, "repository not found" |
| `cli.wf.watch.auth.private_repo_read_access` | User with read access | Exit code 0, events streamed |

### Input Validation Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.watch.input.valid_id` | `codeplane workflow watch 42` | Accepted, command proceeds |
| `cli.wf.watch.input.zero_id` | `codeplane workflow watch 0` | Exit code 1, validation error |
| `cli.wf.watch.input.negative_id` | `codeplane workflow watch -1` | Exit code 1, validation error |
| `cli.wf.watch.input.string_id` | `codeplane workflow watch abc` | Exit code 1, validation error |
| `cli.wf.watch.input.float_id` | `codeplane workflow watch 3.14` | Coerced to 3 or rejected consistently |
| `cli.wf.watch.input.large_valid_id` | `codeplane workflow watch 9007199254740991` | Accepted by parser, API returns 404 |
| `cli.wf.watch.input.missing_id` | `codeplane workflow watch` (no arg) | Exit code 1, missing argument error |
| `cli.wf.watch.input.nonexistent_run` | `codeplane workflow watch 999999` | Exit code 1, "workflow run not found" |

### SSE Streaming Behavior Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.watch.sse.keepalive` | Server sends keep-alive comments during slow workflow | No visible output; stream stays connected |
| `cli.wf.watch.sse.log_prefix` | Watch a run where step 3 emits logs | Lines appear as `[step 3] <content>` |
| `cli.wf.watch.sse.empty_content` | Step emits empty string content | Output shows `[step X] ` |
| `cli.wf.watch.sse.unicode_content` | Step emits `日本語テスト 🚀` | Characters render correctly |
| `cli.wf.watch.sse.ansi_passthrough` | Step emits ANSI escape codes | Codes passed through to terminal |
| `cli.wf.watch.sse.malformed_json` | Server emits invalid JSON data | Raw data printed; command does not crash |
| `cli.wf.watch.sse.rapid_events` | Workflow emits 1000 log lines rapidly | All 1000 lines appear without loss |

### Exit Code Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.watch.exit.success` | Watch run completing with `success` | Exit code 0 |
| `cli.wf.watch.exit.failure` | Watch run completing with `failure` | Exit code 1 |
| `cli.wf.watch.exit.cancelled` | Watch run completing with `cancelled` | Exit code 1 |
| `cli.wf.watch.exit.error_status` | Watch run completing with `error` | Exit code 1 |
| `cli.wf.watch.exit.not_found` | Watch nonexistent run | Exit code 1 |
| `cli.wf.watch.exit.auth_error` | Watch without valid auth | Exit code 1 |

### Edge Case & Boundary Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.watch.edge.long_log_line` | Step emits a 64KB log line | Full line appears without truncation |
| `cli.wf.watch.edge.many_steps` | Watch a run with 50 steps | All step prefixes render correctly |
| `cli.wf.watch.edge.repo_with_hyphens` | Watch in repo `my-org/my-repo` | Resolves correctly |
| `cli.wf.watch.edge.repo_with_dots` | Watch in repo `org/repo.js` | Resolves correctly |
| `cli.wf.watch.edge.concurrent_watch` | Two terminals watching the same run | Both receive the same events independently |

### End-to-End Workflow Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `e2e.wf.dispatch_then_watch` | Dispatch workflow, extract run ID, then watch | Full flow succeeds; watch streams until completion |
| `e2e.wf.dispatch_watch_json_pipe` | Dispatch with `--json`, pipe run ID to watch with `--json` | JSON output contains complete event history |
| `e2e.wf.watch_cancel_during` | Start watching, cancel from another terminal | Watch receives cancellation event, exits with code 1 |
| `e2e.wf.watch_rerun_then_watch` | Rerun a failed workflow, then watch new run | New run watched to completion |

# WORKFLOW_RUN_CLI_LOGS

Specification for WORKFLOW_RUN_CLI_LOGS.

## High-Level User POV

When a developer needs to see exactly what a workflow run is producing — or produced — they type `codeplane run logs <id>` in their terminal. This command opens a live stream of every log line emitted by every step in the workflow and prints them directly to the terminal as they arrive. It is the rawest, most immediate way to observe a workflow's output from the command line.

Unlike `workflow watch`, which focuses on the overall lifecycle of a run and includes status transitions and exit code semantics, `run logs` is purely about log content. It streams every stdout and stderr line from every step, prefixed with the step identifier so multi-step workflows remain readable, and exits silently when the run finishes. It is the CLI equivalent of tailing a build log.

For workflows that are still running, `run logs` connects to a live Server-Sent Events stream and prints output as it arrives — line by line, in real time. If the workflow has already finished, the command delivers the complete historical log output instantly and exits. There is no need for the user to check the run status first; `run logs` handles both live and historical scenarios transparently.

The command supports step-level filtering so a developer debugging a specific step can focus on just that step's output rather than sifting through interleaved lines from all steps. It also supports a follow mode that keeps the connection alive and waits for new output, and a plain-text mode that strips step prefixes for clean piping into other tools like `grep`, `jq`, or file redirects.

For scripting, agent-driven automation, and programmatic consumption, the `--json` flag captures every SSE event as a structured JSON array on stdout, while human-readable output continues to flow to stderr. This makes `run logs` composable: a developer can pipe the JSON to `jq` to filter specific step output, or an agent can parse the structured events to extract test results, build timing, or error messages.

The natural workflow is: check `codeplane run list` to find recent runs, then `codeplane run logs <id>` to inspect a specific run's output. For deeper lifecycle awareness, `codeplane run watch <id>` provides status transitions and exit code semantics. For a quick summary without streaming, `codeplane run view <id>` shows the run metadata and step table. Together, these three commands give developers complete terminal-native visibility into workflow execution.

## Acceptance Criteria

### Core Behavior
- [ ] `codeplane run logs <id>` connects to the SSE log stream endpoint and prints all log events to the terminal
- [ ] The command resolves the repository from the `--repo` flag first, then from the current directory's git/jj remote context if `--repo` is omitted
- [ ] Log events are printed to stderr in the format `[step <stepId>] <content>`
- [ ] Status change events are printed to stderr in the format `Status: <status>` with optional step context
- [ ] When a `done` event is received, the command prints `Run completed: <status>` to stderr and exits
- [ ] If the run is already in a terminal state (success, failure, failed, cancelled, timeout), the command receives all historical log output as a one-shot SSE response, prints it, and exits immediately
- [ ] SSE keep-alive comments (lines starting with `:`) are silently ignored and produce no visible output
- [ ] The command exits with code 0 in all successful execution paths (both live and historical)
- [ ] The command exits with code 1 on any error (auth, not found, network, stream failure)
- [ ] The `run logs` command does NOT use exit code to communicate run outcome (unlike `workflow watch`); it always exits 0 if log delivery succeeded, regardless of whether the run itself succeeded or failed

### Step Filtering
- [ ] `--step <number>` filters output to only show log lines from the specified step position
- [ ] When `--step` is specified, log events from other steps are silently discarded
- [ ] Status and done events are still printed regardless of `--step` filtering
- [ ] `--step 0` or negative values are rejected with a validation error
- [ ] `--step` values that do not match any step in the run produce no log output but still print status and done events
- [ ] Multiple `--step` flags are not supported; only a single step can be filtered at a time

### Follow Mode
- [ ] `--follow` (alias: `-f`) is the default behavior for non-terminal runs — the command streams until the `done` event arrives
- [ ] `--no-follow` causes the command to fetch all currently available logs and exit immediately, even if the run is still in progress
- [ ] For terminal runs, `--follow` and `--no-follow` behave identically (all logs delivered, then exit)

### Output Formatting
- [ ] `--plain` suppresses the `[step N]` prefix and prints only the raw log content, one line per event
- [ ] `--plain` output is suitable for piping to `grep`, `less`, or file redirect without step-prefix noise
- [ ] Without `--plain`, the step prefix is always present, even for single-step workflows
- [ ] ANSI color codes in log content are passed through unmodified to the terminal
- [ ] Unicode characters in log content are displayed correctly
- [ ] Empty log content lines are printed as blank lines (with or without step prefix depending on `--plain`)

### Structured Output
- [ ] `--json` outputs all collected SSE events as a JSON array to stdout upon completion or stream end
- [ ] Each event object in the JSON array has the shape `{ "type": string, "data": object, "id"?: string }`
- [ ] Human-readable log output continues to flow to stderr even when `--json` is active
- [ ] When `--json` is combined with `--step`, only log events matching the step filter are included in the JSON array (status/done events always included)
- [ ] When `--json` is used and the run returns undefined (no events), stdout receives an empty JSON array `[]`
- [ ] When `--json` is combined with a field selector (e.g., `--json type,data`), only the selected fields are included per event

### Input Validation
- [ ] `<id>` must be a positive integer; non-numeric values are rejected by the CLI argument parser before making an API call
- [ ] `<id>` of 0 or negative values are rejected by the CLI argument parser
- [ ] Run IDs up to 2^53 - 1 (Number.MAX_SAFE_INTEGER) are accepted
- [ ] Run IDs exceeding Number.MAX_SAFE_INTEGER are rejected with an error
- [ ] `--repo` must be in `OWNER/REPO` format; invalid formats are rejected by `resolveRepoRef()`
- [ ] `--step` must be a positive integer; non-numeric, zero, or negative values are rejected

### Edge Cases
- [ ] Streaming a run ID that does not exist returns exit code 1 with error message from the API
- [ ] Streaming a run that belongs to a different repository than specified returns exit code 1 with `workflow run not found`
- [ ] If the SSE stream sends a malformed JSON data payload, the raw string is printed as-is rather than crashing the command
- [ ] Multi-step workflows interleave log lines from different steps correctly, each prefixed with their step identifier
- [ ] Log lines containing ANSI color codes are passed through unmodified
- [ ] Log lines containing embedded newlines in the JSON payload are printed as received (single write per event)
- [ ] Runs with zero steps produce status and done events but no log events
- [ ] Runs with steps that have produced zero log lines produce status and done events without any log lines
- [ ] Ctrl+C (SIGINT) causes the command to cleanly disconnect and exit with code 130

### Boundary Constraints
- [ ] Log lines up to 64KB in length are displayed without truncation
- [ ] Log lines up to 1MB in length are displayed without truncation (matching API contract)
- [ ] The command can handle workflow runs with up to 100 steps without degradation
- [ ] The command can handle workflow runs that emit up to 1 million log lines without running out of memory in non-`--json` mode (logs are streamed, not accumulated)
- [ ] In `--json` mode, the command accumulates events in memory; runs exceeding 500MB of accumulated event data print a warning to stderr
- [ ] Step prefix `[step N]` handles step IDs up to 6 digits without layout issues
- [ ] The command handles runs with interleaved stdout and stderr log lines correctly

### Definition of Done
- [ ] `run logs` command exists with `<id>` positional argument, `--repo`, `--step`, `--follow`/`--no-follow`, `--plain`, and `--json` options
- [ ] The command delegates to `streamWorkflowRunEvents()` which handles SSE parsing, event dispatch, and stream lifecycle
- [ ] SSE parsing correctly handles `log`, `status`, and `done` event types
- [ ] SSE keep-alive comments are silently consumed
- [ ] `--step` filtering works correctly for both live and historical runs
- [ ] `--plain` output is clean for piping
- [ ] `--json` output is valid JSON
- [ ] E2E tests for CLI run logs pass
- [ ] The command is documented in the CLI help output

## Design

### CLI Command

**Command:** `codeplane run logs <id>`

**Positional Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | positive integer | Yes | The numeric ID of the workflow run whose logs to stream |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | Auto-detected from cwd | Repository in `OWNER/REPO` format |
| `--step` | number | None (all steps) | Filter output to a specific step position |
| `--follow` / `-f` | boolean | `true` | Stream logs in real-time until completion |
| `--no-follow` | boolean | `false` | Fetch available logs and exit immediately |
| `--plain` | boolean | `false` | Suppress `[step N]` prefixes for clean piping |

**Implicit flags (provided by framework):**

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean/string | Output collected events as JSON (may include field selector) |
| `--format` | string | Output format override |

**Human-readable output (live run, default):**

```
[step 1] Installing dependencies...
[step 1] added 423 packages in 12s
[step 1]
[step 2] Running tests...
[step 2] ✓ 47 tests passed
[step 2] ✗ 2 tests failed
Status: failure
Run completed: failure
```

**Human-readable output with `--step 2`:**

```
[step 2] Running tests...
[step 2] ✓ 47 tests passed
[step 2] ✗ 2 tests failed
Status: failure
Run completed: failure
```

**Plain output (`--plain`):**

```
Installing dependencies...
added 423 packages in 12s

Running tests...
✓ 47 tests passed
✗ 2 tests failed
```

**JSON output (`--json`):**

stderr still shows the human-readable streaming output. stdout receives the final JSON after the stream ends:

```json
[
  { "type": "status", "data": { "run": { "id": 87, "status": "running" }, "steps": [...] } },
  { "type": "log", "data": { "log_id": 1001, "step": 1, "line": 1, "content": "Installing dependencies...", "stream": "stdout" }, "id": "1001" },
  { "type": "log", "data": { "log_id": 1002, "step": 1, "line": 2, "content": "added 423 packages in 12s", "stream": "stdout" }, "id": "1002" },
  { "type": "done", "data": { "run": { "id": 87, "status": "failure" }, "steps": [...] } }
]
```

**Exit codes:**

| Scenario | Exit Code |
|----------|----------|
| Logs delivered successfully (run succeeded) | 0 |
| Logs delivered successfully (run failed) | 0 |
| Logs delivered successfully (run cancelled) | 0 |
| Already-terminal run, logs delivered | 0 |
| `--no-follow` fetch succeeded | 0 |
| Run not found | 1 |
| Auth error | 1 |
| Network error / SSE connection failure | 1 |
| Repository not found or no access | 1 |
| Ctrl+C (SIGINT) | 130 |

**Error behavior:**

| Scenario | Output (stderr) | Exit Code |
|----------|-----------------|----------|
| No repo context | `Error: Could not determine repository. Use --repo OWNER/REPO or run from inside a repository.` | 1 |
| Repository not found | `Error: repository not found` | 1 |
| Run not found | `Error: workflow run not found` | 1 |
| Not authenticated | `Error: Not authenticated. Run 'codeplane auth login' to sign in.` | 1 |
| Network failure | `Error: Failed to connect to run stream: <status> <statusText>` | 1 |
| SSE stream body missing | `Error: No response body from SSE stream` | 1 |
| API error (4xx/5xx) | `Error: <message from response body>` | 1 |
| Invalid step number | `Error: --step must be a positive integer` | 1 |

### API Shape

The CLI command consumes the existing SSE log stream endpoint:

**Endpoint:**

```
GET /api/repos/:owner/:repo/runs/:id/logs
```

**Request Headers:**
- `Authorization: token <PAT>` or session cookie
- `Accept: text/event-stream`
- `Last-Event-ID: <integer>` (optional, for reconnection replay)

**SSE Event Types Received:**

| Event Type | Payload Shape | Description |
|------------|---------------|-------------|
| `status` | `{ "run": {...}, "steps": [...] }` | Current run and step status snapshot |
| `log` | `{ "log_id": number, "step": number, "line": number, "content": string, "stream": "stdout" \| "stderr" }` | Individual log line from a workflow step |
| `done` | `{ "run": {...}, "steps": [...] }` | Run has reached terminal state |

**Error Responses:**
- `400 { "message": "invalid run id" }` — non-numeric, negative, or zero run ID
- `404 { "message": "workflow run not found" }` — valid ID but no matching run

No new API endpoints are required for this feature.

### SDK Shape

The CLI consumes the API via raw `fetch()` for the SSE stream and the `api()` helper for any REST calls. The `streamWorkflowRunEvents()` function in `apps/cli/src/commands/workflow.ts` is the shared SSE parsing utility. No new SDK surface is required.

### CLI Command Registration

The command is registered under the `run` command group using the `incur` CLI framework:

```typescript
.command("logs", {
  description: "Stream logs for a workflow run",
  args: z.object({
    id: z.coerce.number().positive().describe("Run ID"),
  }),
  options: z.object({
    repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    step: z.coerce.number().positive().optional().describe("Filter to a specific step"),
    follow: z.boolean().default(true).describe("Stream logs in real-time until completion"),
    plain: z.boolean().default(false).describe("Suppress step prefixes for clean piping"),
  }),
  async run(c) { ... },
})
```

### Documentation

- **CLI Reference — `run logs`:** Document the command's purpose, the `<id>` positional argument, `--repo`, `--step`, `--follow`/`--no-follow`, `--plain`, and `--json` flags. Include examples showing typical usage patterns.
- **"Streaming logs from the CLI" guide:** Show `codeplane run logs <id>` as the primary log inspection command. Include examples of piping with `--plain` (e.g., `codeplane run logs 42 --plain | grep ERROR`), filtering by step (`--step 3`), and capturing JSON output.
- **"CLI Streaming Commands" reference:** Explain the difference between `run logs` (pure log streaming, exit 0 on delivery) and `run watch` (lifecycle awareness, exit code reflects run outcome). Clarify when to use each.
- **"Workflow debugging" guide:** Show the progression from `run list` → `run view <id>` → `run logs <id>` → `run logs <id> --step N` as a debugging workflow.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Repository Owner** | Can stream logs for any workflow run in the repository |
| **Repository Admin** | Can stream logs for any workflow run in the repository |
| **Repository Write Member** | Can stream logs for any workflow run in the repository |
| **Repository Read Member** | Can stream logs for any workflow run in the repository |
| **Organization Member** (non-repo member, public repo) | Can stream logs for workflow runs |
| **Authenticated User** (public repo) | Can stream logs for workflow runs |
| **Authenticated User** (private repo, no access) | CLI prints "repository not found", exit code 1 (HTTP 404 — no existence leak) |
| **Unauthenticated** | CLI prints authentication error, exit code 1 (HTTP 401) |

Authorization is enforced at the repository resolution layer (`resolveRepoId`). The workflow service receives a repository ID only after the repo service has confirmed the actor has at least read access to the repository.

### Rate Limiting

| Surface | Limit | Scope | Description |
|---------|-------|-------|-------------|
| SSE connection establishment | 30 connections/minute | Per user per repository | Prevents reconnection storms |
| Concurrent SSE connections | 10 simultaneous | Per user globally | Prevents resource exhaustion from parallel log tailing |
| `Last-Event-ID` replay queries | 60/minute | Per user per repository | Prevents replay abuse |

When the server returns HTTP 429, the CLI prints: `Error: Rate limit exceeded. Try again later.` and exits with code 1.

### Data Privacy

- Workflow log content may contain sensitive output (accidentally echoed secrets, file paths, environment variables). The CLI passes all log content through unmodified. Server-side secret masking must be applied before log emission by the workflow execution runtime.
- The CLI does not cache or persist log content to disk. All output goes directly to stderr (human-readable) or stdout (JSON).
- The `Authorization` header is never echoed in SSE event payloads or CLI output.
- `--json` output includes full event payloads. If piped to a file, the file inherits the sensitivity classification of the workflow logs.
- Channel names derived from internal numeric IDs do not leak PII.
- `Cache-Control: no-cache` on the SSE response prevents proxy caching of log streams.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `cli.run.logs.started` | CLI `run logs` command begins execution | `repository_id`, `owner`, `repo`, `run_id`, `has_step_filter`, `step_filter_value`, `follow_mode`, `plain_mode`, `output_format` (json/human), `repo_detection_method` (flag/auto) |
| `cli.run.logs.completed` | SSE stream delivers a `done` event or static response is fully consumed | `repository_id`, `run_id`, `final_status`, `total_events`, `log_event_count`, `status_event_count`, `stream_duration_ms`, `output_format`, `was_terminal_run`, `step_filter_active` |
| `cli.run.logs.disconnected` | SSE stream drops before a `done` event (excludes SIGINT) | `repository_id`, `run_id`, `events_received`, `stream_duration_ms`, `disconnect_reason` (network/timeout/error) |
| `cli.run.logs.interrupted` | User sends SIGINT (Ctrl+C) | `repository_id`, `run_id`, `events_received`, `stream_duration_ms` |
| `cli.run.logs.error` | Command fails before or during streaming | `error_type` (auth/not_found/network/rate_limit/validation/api_error), `error_message`, `run_id`, `owner`, `repo` |
| `cli.run.logs.no_follow_fetch` | `--no-follow` used and fetch completed | `repository_id`, `run_id`, `log_event_count`, `fetch_duration_ms` |

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| **Log command usage** | Tracked, growing | Weekly active users of `run logs` |
| **Completion rate** | > 85% | Percentage of `logs.started` events that produce a `logs.completed` event |
| **Step filter adoption** | > 15% | Percentage of invocations using `--step` (indicates multi-step workflow debugging) |
| **Plain mode adoption** | > 10% | Percentage of invocations using `--plain` (indicates pipe/grep usage patterns) |
| **JSON output adoption** | > 20% | Percentage of invocations using `--json` (indicates agent/scripting usage) |
| **No-follow usage** | Tracked | Percentage of invocations using `--no-follow` |
| **Disconnection rate** | < 10% | Percentage of sessions ending in unexpected disconnect (excludes SIGINT) |
| **Median stream duration** | 15s–180s | Typical wall-clock time tailing logs |
| **logs-after-view conversion** | > 30% | Percentage of `run view` invocations followed by `run logs` within 120 seconds |

## Observability

### Logging Requirements

| Log Level | Event | Structured Context |
|-----------|-------|-----------------------|
| `DEBUG` | CLI resolving repository context | `repo_flag`, `detected_owner`, `detected_repo`, `detection_method` |
| `DEBUG` | SSE connection opening | `url`, `run_id`, `step_filter`, `follow_mode` |
| `DEBUG` | SSE event received | `event_type`, `event_id`, `data_size_bytes` |
| `DEBUG` | SSE keep-alive comment received | `run_id`, `elapsed_since_last_event_ms` |
| `DEBUG` | Log event filtered by --step | `run_id`, `event_step`, `filter_step`, `discarded` |
| `INFO` | Logs command started | `run_id`, `step_filter`, `follow_mode`, `plain_mode`, `output_format` |
| `INFO` | Logs command completed | `run_id`, `total_events`, `log_events`, `stream_duration_ms`, `final_status` |
| `WARN` | SSE stream unexpectedly closed | `run_id`, `events_received`, `elapsed_seconds`, `last_event_type` |
| `WARN` | Malformed SSE data payload (JSON parse failure) | `run_id`, `raw_data_preview` (first 256 chars), `event_type` |
| `WARN` | JSON mode memory approaching limit | `run_id`, `accumulated_bytes`, `event_count` |
| `ERROR` | SSE connection failed to establish | `run_id`, `status_code`, `error_message`, `url` |
| `ERROR` | Network error during SSE stream | `run_id`, `error_message`, `events_received_before_error` |

Note: CLI logging is controlled by verbosity level. Only `ERROR` messages are shown by default; `DEBUG` and `INFO` require `--verbose`.

### Prometheus Metrics

Server-side metrics covering the API endpoint consumed by the logs command:

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_log_stream_connections_total` | `status` (opened, reconnected, static_served), `client` | Total log stream connection attempts |
| `codeplane_workflow_log_stream_events_sent_total` | `event_type` (log, status, done) | Total SSE events sent across all connections |
| `codeplane_workflow_log_stream_disconnects_total` | `reason` (done, client_close, error, timeout) | Total SSE disconnections |
| `codeplane_workflow_log_stream_keepalive_failures_total` | — | Keep-alive write failures (stale connections) |

**Gauges:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_log_stream_active_connections` | — | Currently open SSE connections for workflow logs |

**Histograms:**

| Metric | Buckets | Labels | Description |
|--------|---------|--------|-------------|
| `codeplane_workflow_log_stream_connection_duration_seconds` | 1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600 | `final_reason` (done, client_disconnect, error) | Duration of SSE connections |
| `codeplane_workflow_log_replay_count` | 1, 10, 50, 100, 500, 1000 | — | Number of events replayed per Last-Event-ID reconnection |
| `codeplane_workflow_log_replay_duration_seconds` | 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 | — | Time spent executing replay queries |
| `codeplane_workflow_log_stream_events_per_session` | 10, 50, 100, 500, 1000, 5000, 10000, 50000 | `final_status` | Number of events emitted per SSE session |

### Alerts & Runbooks

#### Alert 1: `WorkflowLogStreamHighConnectionCount`
- **Condition:** `codeplane_workflow_log_stream_active_connections > 500` for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_log_stream_active_connections` in Grafana to confirm the alert and view the trend.
  2. Run `SELECT count(*) FROM pg_stat_activity WHERE state = 'idle' AND query LIKE '%LISTEN%'` to check PG connection count.
  3. Identify if a specific user or repository is responsible: check access logs for high-frequency SSE connections from a single source.
  4. If a single client is misbehaving (reconnection loop), consider temporarily rate-limiting that user/IP via the admin panel.
  5. If organic growth, consider increasing the concurrent SSE connection limit or adding connection pooling at the load balancer.
  6. Verify keep-alive is working correctly — stale connections that don't get cleaned up inflate the gauge.

#### Alert 2: `WorkflowLogStreamReplayLatencyHigh`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_log_replay_duration_seconds_bucket[5m])) > 2.0` for 10 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check slow query logs for `listWorkflowLogsSince` queries.
  2. Verify the `workflow_logs` table has an appropriate index on `(workflow_run_id, id)` — this is the access pattern for replay.
  3. Check if a specific run has an unusually large number of log entries: `SELECT count(*) FROM workflow_logs WHERE workflow_run_id = ?`.
  4. If a specific run is the outlier, it may be a runaway workflow. Consider cancelling it via `codeplane run cancel`.
  5. If systemic, check PostgreSQL connection pool saturation and overall DB load metrics.

#### Alert 3: `PGListenFailuresElevated`
- **Condition:** `rate(codeplane_sse_pg_listen_failures_total[5m]) > 1` for 5 minutes
- **Severity:** Critical
- **Runbook:**
  1. Check PostgreSQL connectivity: `SELECT 1` from the application.
  2. Check `pg_stat_activity` for connection count — may be hitting `max_connections`.
  3. Review server logs for `SSE: failed to LISTEN on channel` warnings with specific error messages.
  4. If PGLite mode (daemon/desktop), LISTEN/NOTIFY has limitations. Verify the deployment mode and suppress the alert for non-server deployments.
  5. If server mode, check PostgreSQL replication status if running a replica setup — LISTEN/NOTIFY only works on the primary.
  6. Restart the SSE manager if connections are in a bad state: the server graceful shutdown path calls `sse.stop()`.

#### Alert 4: `WorkflowLogStreamZeroEventsLongRunning`
- **Condition:** `codeplane_workflow_log_stream_active_connections > 0` AND `rate(codeplane_workflow_log_stream_events_sent_total[10m]) == 0` for 10 minutes
- **Severity:** Warning
- **Runbook:**
  1. This suggests active connections are receiving no events — possible PG NOTIFY pipeline break.
  2. Verify that workflow runners are actively producing logs: check `workflow_logs` table for recent inserts.
  3. Verify that `pg_notify` is being called after log insertion: check runner task completion logs.
  4. Test the NOTIFY pipeline manually: `SELECT pg_notify('workflow_step_logs_1', '{"test":true}')` and check if the SSE manager receives it.
  5. Check for PG connection leaks or exhaustion that might prevent new LISTEN subscriptions.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| Invalid run ID (non-numeric, ≤0) | CLI parser rejects before API call, exit 1 | User provides valid numeric ID |
| Run not found (valid ID, no match) | API returns 404, CLI prints error, exit 1 | User checks `run list` for valid IDs |
| Repository not found / no access | API returns 404, CLI prints "repository not found", exit 1 | User verifies repo name and permissions |
| Not authenticated | `requireAuthToken()` throws, exit 1 | User runs `codeplane auth login` |
| SSE connection refused / network error | `fetch()` rejects, CLI prints connection error, exit 1 | User checks network connectivity and server URL |
| SSE response non-200 | CLI checks `res.ok`, throws with status details, exit 1 | User checks error message for resolution |
| SSE stream body missing | `res.body?.getReader()` returns null, exit 1 | Likely server misconfiguration; escalate |
| SSE connection dropped mid-stream | `reader.read()` returns done prematurely, exit 1 | User retries; connection drop is transient |
| Malformed JSON in SSE data payload | `JSON.parse()` catch, raw data printed as-is, continue | Non-fatal; stream continues |
| Rate limit exceeded (429) | CLI prints rate limit error, exit 1 | User waits and retries |
| Server internal error (500) | CLI prints server error, exit 1 | Escalate if persistent |
| SIGINT (Ctrl+C) | Clean disconnect, exit 130 | Intentional user action |
| PG LISTEN fails (server-side) | Stream opens but only serves initial data + keep-alive; no live events | Client sees stale data; reconnect may succeed if PG recovers |
| Extremely large log volume (>1M lines, --json) | Memory grows; warning printed at 500MB | Use non-json mode or --step filter for large runs |
| `--step` with nonexistent step number | No log output, only status/done events printed | User checks available steps with `run view` |

## Verification

### Core Functionality Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.streams_running_run` | Dispatch a workflow that emits log output, then `codeplane run logs <id>` | stderr contains `[step N] ...` formatted log output, command exits after `done` event |
| `cli.run.logs.exits_on_done` | Run `codeplane run logs <id>` against a workflow that completes | Command exits with code 0 after `Run completed: <status>` message |
| `cli.run.logs.terminal_run_delivers_history` | Dispatch a workflow, wait for completion, then `codeplane run logs <id>` | All historical log output is delivered immediately, command exits with code 0 |
| `cli.run.logs.exit_code_zero_on_failed_run` | Run `codeplane run logs <id>` against a run that fails | Command exits with code 0 (not 1 — logs were delivered successfully) |
| `cli.run.logs.exit_code_zero_on_cancelled_run` | Run `codeplane run logs <id>` against a cancelled run | Command exits with code 0 |
| `cli.run.logs.multi_step_interleaved` | Dispatch a workflow with 3+ steps that emit logs concurrently | Log lines from different steps appear with correct `[step N]` prefixes |
| `cli.run.logs.empty_run_no_steps` | Create a run with zero steps, then `run logs <id>` | Status and done events are printed, no log lines, exit 0 |
| `cli.run.logs.steps_no_output` | Create a run with steps that produce no log output | Status and done events are printed, no log lines between them, exit 0 |

### Step Filtering Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.step_filter_single` | `codeplane run logs <id> --step 2` on a 3-step workflow | Only log lines from step 2 appear; step 1 and 3 lines are absent |
| `cli.run.logs.step_filter_status_still_shown` | `codeplane run logs <id> --step 2` | Status and done events are still printed regardless of step filter |
| `cli.run.logs.step_filter_nonexistent_step` | `codeplane run logs <id> --step 99` on a 3-step workflow | No log lines appear; status and done events still printed; exit 0 |
| `cli.run.logs.step_filter_zero` | `codeplane run logs <id> --step 0` | Validation error, exit 1 |
| `cli.run.logs.step_filter_negative` | `codeplane run logs <id> --step -1` | Validation error, exit 1 |
| `cli.run.logs.step_filter_non_numeric` | `codeplane run logs <id> --step abc` | Validation error, exit 1 |
| `cli.run.logs.step_filter_with_json` | `codeplane run logs <id> --step 2 --json` | JSON array on stdout contains only step 2 log events plus status/done events |

### Follow Mode Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.follow_default_live` | `codeplane run logs <id>` on a running workflow (no explicit --follow) | Streams until done event, exit 0 |
| `cli.run.logs.no_follow_live_run` | `codeplane run logs <id> --no-follow` on a running workflow | Fetches currently available logs and exits immediately (may not include done event) |
| `cli.run.logs.no_follow_terminal_run` | `codeplane run logs <id> --no-follow` on a completed workflow | All logs delivered, identical to default behavior for terminal runs |
| `cli.run.logs.follow_explicit` | `codeplane run logs <id> --follow` | Behaves same as default (follow is already default true) |

### Plain Output Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.plain_no_prefix` | `codeplane run logs <id> --plain` | Log content appears without `[step N]` prefix |
| `cli.run.logs.plain_empty_content` | `codeplane run logs <id> --plain` where a log has empty content | Blank line printed (no prefix artifacts) |
| `cli.run.logs.plain_pipe_grep` | `codeplane run logs <id> --plain 2>/dev/null \| grep ERROR` | grep receives clean log lines without step prefix noise |
| `cli.run.logs.plain_with_step_filter` | `codeplane run logs <id> --plain --step 2` | Only step 2 content, no prefixes |
| `cli.run.logs.plain_status_events_suppressed` | `codeplane run logs <id> --plain` | Status and done events are NOT printed in plain mode (only raw log content) |

### Structured Output Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.json_valid_array` | `codeplane run logs <id> --json` on a completing run | stdout is a valid JSON array |
| `cli.run.logs.json_event_shape` | Verify JSON events array | Each event has `type` (string), `data` (object), and optionally `id` (string) |
| `cli.run.logs.json_event_types` | Stream a run with logs, status changes, and completion | JSON array contains at least one `log`, one `status`, and one `done` event |
| `cli.run.logs.json_empty_run` | `--json` on a run with no log output | JSON array contains `status` and `done` events but no `log` events |
| `cli.run.logs.json_field_filter` | `--json type,data` | Each event contains only `type` and `data` keys |
| `cli.run.logs.json_stderr_separation` | `codeplane run logs <id> --json` | Human-readable log output goes to stderr; JSON goes to stdout |
| `cli.run.logs.json_no_events` | Edge case where stream closes immediately | stdout receives `[]` empty JSON array |

### Input Validation Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.input.valid_id` | `codeplane run logs 42` | Accepted, command proceeds |
| `cli.run.logs.input.zero_id` | `codeplane run logs 0` | Exit code 1, validation error |
| `cli.run.logs.input.negative_id` | `codeplane run logs -1` | Exit code 1, validation error |
| `cli.run.logs.input.string_id` | `codeplane run logs abc` | Exit code 1, validation error |
| `cli.run.logs.input.float_id` | `codeplane run logs 3.14` | Coerced to 3 or rejected consistently |
| `cli.run.logs.input.large_valid_id` | `codeplane run logs 9007199254740991` | Accepted by parser, API returns 404 (likely no such run) |
| `cli.run.logs.input.missing_id` | `codeplane run logs` (no arg) | Exit code 1, missing argument error |
| `cli.run.logs.input.nonexistent_run` | `codeplane run logs 999999` | Exit code 1, "workflow run not found" |

### Repository Resolution Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.repo_flag` | `codeplane run logs <id> --repo owner/repo` | Uses the explicit repo |
| `cli.run.logs.auto_repo` | Run from inside a cloned repo directory | Auto-detects the repo |
| `cli.run.logs.no_repo_context` | Run from `/tmp` without `--repo` | Exit code 1, error about repository detection |
| `cli.run.logs.invalid_repo_format` | `--repo no-slash` | Exit code 1, validation error |
| `cli.run.logs.repo_with_hyphens` | `--repo my-org/my-repo` | Resolves correctly |
| `cli.run.logs.repo_with_dots` | `--repo org/repo.js` | Resolves correctly |

### Auth & Permissions Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.auth.no_token` | Run without configured auth token | Exit code 1, authentication error |
| `cli.run.logs.auth.valid_pat` | Run with valid PAT | Stream connects, logs delivered |
| `cli.run.logs.auth.expired_pat` | Run with expired PAT | Exit code 1, auth error |
| `cli.run.logs.auth.public_repo_other_user` | Stream logs from public repo user doesn't own | Logs delivered successfully |
| `cli.run.logs.auth.private_repo_no_access` | Stream logs from private repo without access | Exit code 1, "repository not found" |
| `cli.run.logs.auth.private_repo_read_access` | User with read access to private repo | Logs delivered successfully |

### SSE Behavior Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.sse.keepalive_ignored` | Server sends keep-alive comments during slow workflow | No visible output; stream stays connected |
| `cli.run.logs.sse.log_prefix_format` | Watch a run where step 3 emits logs | Lines appear as `[step 3] <content>` |
| `cli.run.logs.sse.empty_content` | Step emits empty string content | Output shows `[step N] ` (blank after prefix) |
| `cli.run.logs.sse.unicode_content` | Step emits `日本語テスト 🚀` | Characters render correctly |
| `cli.run.logs.sse.ansi_passthrough` | Step emits ANSI escape codes (colors, bold) | Codes passed through to terminal unmodified |
| `cli.run.logs.sse.malformed_json` | Server emits invalid JSON data payload | Raw data printed as-is; command does not crash |
| `cli.run.logs.sse.rapid_events` | Workflow emits 1000 log lines in rapid succession | All 1000 lines appear without loss |
| `cli.run.logs.sse.stdout_stderr_interleaved` | Step emits alternating stdout and stderr | Both are displayed with correct step prefixes |

### Boundary & Edge Case Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.logs.edge.log_line_64kb` | Step emits a single log line of exactly 64KB | Full line appears without truncation |
| `cli.run.logs.edge.log_line_1mb` | Step emits a single log line of 1MB | Full line appears without truncation (matches API contract) |
| `cli.run.logs.edge.log_line_over_1mb` | Step emits a log line larger than 1MB | Line is either delivered intact or truncated with a clear indicator; command does not crash |
| `cli.run.logs.edge.many_steps` | Watch a run with 50 steps | All step prefixes render correctly |
| `cli.run.logs.edge.concurrent_streams` | Two terminals running `run logs` on the same run | Both receive the same events independently |
| `cli.run.logs.edge.special_chars_in_content` | Log content contains backslashes, quotes, angle brackets, curly braces | All characters appear correctly in both human and JSON output |
| `cli.run.logs.edge.newlines_in_content` | Log content JSON payload contains embedded `\n` | Printed as received (newlines in output) |
| `cli.run.logs.edge.sigint_cleanup` | Press Ctrl+C during active streaming | Clean disconnect, exit 130, no error message |
| `cli.run.logs.edge.step_id_large_number` | Run has step IDs in the thousands range | `[step 1234]` prefix formats correctly without truncation |

### End-to-End Workflow Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `e2e.run.logs.dispatch_then_logs` | Dispatch a workflow, extract run ID from output, then `run logs <id>` | Full flow succeeds; all logs streamed until completion |
| `e2e.run.logs.dispatch_logs_json_pipe` | `codeplane workflow dispatch 1 --json`, extract run ID, then `run logs <id> --json` | JSON output contains complete event history |
| `e2e.run.logs.logs_then_view` | Stream logs for a completed run, then `run view <id>` | Both commands return consistent data about the same run |
| `e2e.run.logs.plain_pipe_to_grep` | `codeplane run logs <id> --plain 2>/dev/null \| grep -c "test"` | grep receives clean lines and produces correct count |
| `e2e.run.logs.step_filter_matches_view` | `run view <id>` shows step 2 failed; `run logs <id> --step 2` shows error output | Step 2's log content includes the failure details |
| `e2e.run.logs.cancel_during_stream` | Start `run logs`, cancel the run from another terminal | Logs command receives `done` event with `cancelled` status and exits 0 |
| `e2e.run.logs.rerun_then_logs` | Rerun a failed workflow, then `run logs <new-id>` | New run's logs are streamed correctly |

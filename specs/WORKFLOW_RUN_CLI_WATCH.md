# WORKFLOW_RUN_CLI_WATCH

Specification for WORKFLOW_RUN_CLI_WATCH.

## High-Level User POV

When a developer dispatches a workflow or wants to monitor a currently-executing run, they need to stay in their terminal and follow along in real time — watching each step start, seeing log output scroll by, and knowing immediately whether the run succeeds or fails. `codeplane run watch <id>` and its alias `codeplane workflow watch <id>` provide exactly this experience.

The user types a single command and the CLI becomes a live dashboard for that workflow run. First, it prints a summary header showing the run number, current status, and the workflow that triggered it. If the run is still active, the CLI opens a persistent streaming connection to the server and begins printing log output as each step produces it. Every line is prefixed with the step number so the user can follow multi-step workflows without confusion. When a step's status changes — from queued to running, from running to success or failure — the CLI prints a clear status update inline with the log stream. When the run reaches a terminal state, the CLI prints a final completion line and exits cleanly.

If the run has already finished by the time the user invokes the command, there is no wasted time waiting. The CLI detects the terminal status, prints a concise message (`Run #42 already completed.`), and returns immediately. This makes `run watch` safe to use in scripts that dispatch a workflow and then wait for it — the command is idempotent and handles every lifecycle state.

For scripting and automation, the `--json` flag captures the entire watch session as structured data: the run metadata, the collected SSE events, and the final status. This output goes to stdout while all human-readable log lines and status messages stay on stderr, so a pipeline like `codeplane run watch 42 --json > result.json` captures machine-readable output without contaminating it with human text.

The experience is designed to feel like `docker logs -f` or `kubectl logs -f` — instant, low-ceremony, and reliable. Connection drops are invisible to the user because the underlying SSE stream supports resume-from-last-event. The user doesn't need to know about Server-Sent Events, reconnection protocols, or channel multiplexing. They type `run watch`, they see their workflow execute, and they get on with their work.

## Acceptance Criteria

### Core Behavior

- [ ] `codeplane run watch <id>` streams real-time log output and status changes for the specified workflow run
- [ ] `codeplane workflow watch <id>` behaves identically to `codeplane run watch <id>` (alias)
- [ ] The positional `<id>` argument is a required positive integer representing the workflow run ID
- [ ] The command resolves the repository from the `--repo` flag first, then from the current directory's jj/git remote context if `--repo` is omitted
- [ ] On invocation, the command first fetches the run's current state via REST (`GET /api/repos/:owner/:repo/runs/:id`)
- [ ] If the run is in a terminal state (`completed`, `failed`, `cancelled`), the command prints `Run #<id> already <status>.` to stderr and exits immediately with code 0
- [ ] If the run is active (queued, pending, running, assigned, blocked), the command prints `Watching run #<id> (status: <status>)...` to stderr and opens an SSE connection
- [ ] Log events from the SSE stream are printed to stderr in the format `[step <N>] <content>` where `<N>` is the step identifier and `<content>` is the log line
- [ ] Status change events are printed to stderr in the format `Status: <status>` with optional step context `(step <N>)`
- [ ] The `done` event causes the command to print `Run completed: <status>` to stderr and exit with code 0
- [ ] If the SSE stream closes unexpectedly (server closes connection without `done` event), the command exits with code 1
- [ ] All human-readable output goes to stderr; stdout is reserved for structured JSON output
- [ ] With `--json`, the command returns the merged run metadata and collected events array as a JSON object on stdout
- [ ] Without `--json`, the command returns the run data object (for framework-level formatting)
- [ ] The command exits with code 0 on successful completion or when a terminal run is detected
- [ ] The command exits with code 1 on authentication errors, network errors, not-found errors, or unexpected stream closure

### SSE Stream Behavior

- [ ] The command connects to `GET /api/repos/:owner/:repo/runs/:id/logs` with `Accept: text/event-stream` and `Authorization: token <PAT>` headers
- [ ] The SSE parser handles three event types: `log`, `status`, and `done`
- [ ] SSE keep-alive comments (lines starting with `:`) are silently ignored
- [ ] The `done` event terminates the streaming loop and causes the command to return
- [ ] Multi-line SSE data fields are accumulated correctly before parsing
- [ ] Event IDs are captured and attached to the collected events array
- [ ] Log event content may contain ANSI escape sequences, unicode characters, embedded newlines (within the JSON payload), and special characters — all are passed through to stderr without modification
- [ ] An empty `data` field in an SSE event is parsed as an empty string, not discarded

### Error Handling

- [ ] If `--repo` is not provided and the current directory has no detectable repository context, the command prints `Could not determine repository. Use -R OWNER/REPO or run from within a repo.` to stderr and exits with code 1
- [ ] If the specified repository does not exist, the command surfaces the API error message and exits with code 1
- [ ] If the user is not authenticated, the command prints an authentication error and exits with code 1
- [ ] If the user lacks read access to a private repository, the command receives HTTP 404 and surfaces the error
- [ ] If the run ID does not exist in the repository, the command prints the server's not-found error and exits with code 1
- [ ] If the SSE endpoint returns a non-2xx status, the command prints `Failed to connect to run stream: <status> <statusText>` and exits with code 1
- [ ] If the response body is null or unreadable, the command prints `No response body from SSE stream` and exits with code 1
- [ ] Invalid run IDs (non-numeric, zero, negative, float) are rejected by the CLI argument parser (`z.coerce.number()`) before making any API call
- [ ] Network errors (DNS failure, connection refused, timeout) produce a human-readable error message, not a raw stack trace

### Boundary Constraints

- Run IDs are positive integers; the maximum valid run ID is 2^53 - 1 (JavaScript safe integer range)
- Step identifiers in log prefixes may be numeric or string values
- Log event content has no maximum length constraint at the CLI layer
- The `--repo` flag accepts `OWNER/REPO` format or a clone URL matching the configured Codeplane host
- Owner names: 1–39 characters, alphanumeric and hyphens
- Repository names: 1–100 characters, alphanumeric, hyphens, dots, and underscores
- The command does not impose a timeout on the SSE connection; it streams until `done` or stream closure
- The collected events array for `--json` output is limited only by available memory

### Definition of Done

- [ ] `run watch` command accepts `<id>` positional argument and `--repo` option with correct types and defaults
- [ ] `workflow watch` command is implemented as an alias with identical behavior
- [ ] The command first performs a REST status check, then conditionally connects to the SSE stream
- [ ] Human-readable log/status/done output follows the specified formats on stderr
- [ ] JSON structured output returns merged run data + events when `--json` is specified
- [ ] Terminal-state runs are detected and handled without opening an SSE connection
- [ ] All CLI E2E tests for `run watch` pass
- [ ] All API integration tests for the underlying SSE endpoint pass
- [ ] The command is documented in the CLI help output and user documentation

## Design

### CLI Command

#### `codeplane run watch <id>`

**Description:** Watch a workflow run in real-time (streams logs, status changes, and completion)

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | positive integer (coerced) | Yes | The workflow run ID to watch |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | Auto-detected from cwd | Repository in `OWNER/REPO` format |

**Implicit flags (provided by framework):**

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean/string | Output structured JSON to stdout |

#### `codeplane workflow watch <id>`

Alias for `codeplane run watch <id>`. Identical arguments, options, and behavior.

**Human-readable output (stderr):**

For an active run:
```
Watching run #1047 (status: running)...
[step 1] Installing dependencies...
[step 1] npm install completed in 12.4s
Status: running (step 2)
[step 2] Running tests...
[step 2] 147 tests passed, 0 failed
Status: completed
Run completed: completed
```

For a terminal run:
```
Watching run #1047 (status: completed)...
Run #1047 already completed.
```

**JSON output (stdout with `--json`):**

For an active run that was watched to completion:
```json
{
  "id": 1047,
  "status": "completed",
  "workflow_definition_id": 5,
  "trigger_event": "push",
  "trigger_ref": "main",
  "started_at": "2026-03-22T10:15:30Z",
  "completed_at": "2026-03-22T10:16:35Z",
  "events": [
    { "type": "log", "data": { "step": 1, "content": "Installing dependencies...", "line": 1 }, "id": "42" },
    { "type": "status", "data": { "status": "running", "step": 2 } },
    { "type": "log", "data": { "step": 2, "content": "Running tests...", "line": 1 }, "id": "55" },
    { "type": "done", "data": { "status": "completed" } }
  ]
}
```

For a terminal run:
```json
{
  "id": 1047,
  "status": "completed",
  "workflow_definition_id": 5,
  "trigger_event": "push",
  "trigger_ref": "main",
  "started_at": "2026-03-22T10:15:30Z",
  "completed_at": "2026-03-22T10:16:35Z"
}
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | Run completed or was already in terminal state |
| 1 | Error (auth failure, network error, not found, stream error) |

### API Shape

The CLI watch command consumes two existing API endpoints:

#### REST Status Check

```
GET /api/repos/:owner/:repo/runs/:id
```

Returns the current run metadata including `id`, `status`, `workflow_definition_id`, `trigger_event`, `trigger_ref`, `started_at`, and `completed_at`. Used to determine if the run is already terminal before opening an SSE connection.

#### SSE Log Stream

```
GET /api/repos/:owner/:repo/runs/:id/logs
```

Returns a Server-Sent Events stream with `log`, `status`, and `done` event types. The CLI sends `Accept: text/event-stream` and `Authorization: token <PAT>` headers. The stream includes keep-alive comments every 15 seconds.

These endpoints are already specified in WORKFLOW_RUN_LOG_STREAM. The CLI watch command is a consumer of these existing APIs.

### SDK Shape

The CLI does not use the SDK directly for this command. It uses the `api()` HTTP client for the REST call and raw `fetch()` with manual SSE parsing for the stream connection. Both are implemented in the CLI's `client.ts` and the `streamWorkflowRunEvents()` / `watchWorkflowRun()` functions in `workflow.ts`.

### Documentation

End-user documentation should cover:

- **"Watching workflow runs"** guide: explain the purpose of `codeplane run watch <id>`, when to use it vs `run logs` vs `run view`, and provide examples of watching a running workflow, watching an already-completed workflow, and using `--json` for scripting
- **"Dispatch and watch"** recipe: show the common pattern of `codeplane workflow dispatch <id> --ref main` followed by `codeplane run watch <returned-id>`, including how to script this as a single pipeline
- **"Scripting with --json"** section: document the stdout/stderr split, show `codeplane run watch 42 --json > result.json 2>/dev/null`, and describe the JSON output shape
- **"run watch vs run logs"** comparison: explain that `run watch` first checks status and returns immediately for terminal runs (safe for polling/scripting), while `run logs` always connects to the SSE stream (useful for replaying complete log output)
- **"workflow watch alias"** note: document that `codeplane workflow watch <id>` is exactly equivalent to `codeplane run watch <id>`
- **CLI reference entry**: standard `--help` output showing the command, arguments, options, and one-line description

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Repository Owner** | Full access to watch any workflow run in the repository |
| **Admin** | Full access to watch any workflow run in the repository |
| **Member (Write)** | Full access to watch any workflow run in the repository |
| **Member (Read)** | Can watch workflow runs for repositories they have explicit read permission on |
| **Anonymous** | Can watch workflow runs for public repositories only (no authentication required for the REST check; SSE stream requires valid auth headers or public repo access) |

Authorization is enforced at two points:
1. The REST status check (`GET /runs/:id`) resolves the repository and checks read access
2. The SSE stream endpoint (`GET /runs/:id/logs`) independently resolves the repository and checks read access

Both checks use the same repository resolution layer, ensuring consistent authorization.

### Rate Limiting

| Surface | Limit | Scope |
|---------|-------|-------|
| REST status check | Standard API rate limit (shared with all REST endpoints) | Per user per repository |
| SSE connection establishment | 30 connections/minute | Per user per repository |
| Concurrent SSE connections | 10 simultaneous | Per user globally |

The CLI does not implement client-side rate limiting. Server-enforced 429 responses cause the CLI to surface the error and exit with code 1. The user must manually retry.

### Data Privacy

- Log content may contain secrets accidentally printed by user workflows. The CLI passes log content through to stderr without redaction. Secret masking is the responsibility of the workflow execution runtime.
- The PAT token in the `Authorization` header is never echoed in CLI output or in SSE event payloads.
- The `--json` output includes event data payloads which may contain log content with sensitive information. Users are responsible for securing their JSON output files.
- Repository names and owner names visible in stderr output are not considered PII in the context of an authenticated user watching their own repository.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `WorkflowRunCLIWatchStarted` | CLI invokes the REST status check at the beginning of `run watch` | `repository_id`, `run_id`, `run_status_at_check`, `is_terminal_at_check`, `has_repo_flag`, `json_mode` |
| `WorkflowRunCLIWatchStreamConnected` | CLI successfully opens the SSE connection (non-terminal runs only) | `repository_id`, `run_id`, `initial_status` |
| `WorkflowRunCLIWatchCompleted` | CLI receives the `done` event and exits successfully | `repository_id`, `run_id`, `final_status`, `total_events_received`, `watch_duration_ms`, `json_mode` |
| `WorkflowRunCLIWatchTerminalShortCircuit` | CLI detects a terminal run and exits without streaming | `repository_id`, `run_id`, `terminal_status` |
| `WorkflowRunCLIWatchFailed` | CLI exits with an error (auth, network, not found, stream failure) | `repository_id` (if available), `run_id` (if available), `error_type`, `error_message`, `http_status` (if applicable) |
| `WorkflowRunCLIWatchDisconnected` | SSE stream closes unexpectedly before `done` event | `repository_id`, `run_id`, `events_received_before_disconnect`, `watch_duration_ms` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Watch adoption rate** | % of dispatched workflow runs that have at least one `run watch` invocation | > 25% of manually dispatched runs |
| **Terminal short-circuit rate** | % of `run watch` invocations that detect a terminal run and exit immediately | Tracked, no target (informational — indicates common scripting pattern) |
| **Watch completion rate** | % of `run watch` sessions that receive the `done` event (vs error/disconnect) | > 95% |
| **Watch-to-rerun conversion** | % of `run watch` sessions for failed runs followed by a `run rerun` within 5 minutes | Tracked, no target (indicates tight feedback loop) |
| **JSON mode usage** | % of `run watch` invocations using `--json` flag | Tracked (indicates scripting/agent adoption) |
| **Weekly active CLI watch users** | Unique users invoking `run watch` or `workflow watch` per week | Tracked, growth target |

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| `run watch` command invoked | `info` | `run_id`, `repo_owner`, `repo_name`, `has_repo_flag`, `json_mode` |
| REST status check completed | `debug` | `run_id`, `status`, `response_time_ms` |
| Terminal run detected, skipping stream | `info` | `run_id`, `terminal_status` |
| SSE connection established | `info` | `run_id`, `repo_owner`, `repo_name` |
| SSE event received | `debug` | `run_id`, `event_type`, `event_id` (if present) |
| SSE `done` event received | `info` | `run_id`, `final_status`, `total_events`, `watch_duration_ms` |
| SSE stream closed unexpectedly | `warn` | `run_id`, `events_received`, `watch_duration_ms`, `last_event_type` |
| REST status check failed | `error` | `run_id`, `http_status`, `error_message` |
| SSE connection failed | `error` | `run_id`, `http_status`, `error_message` |
| Authentication failure | `warn` | `run_id` (if available), `error_type` |
| Repository resolution failed | `warn` | `repo_override` (if provided), `error_message` |
| Invalid run ID rejected by parser | `warn` | `raw_input` |

Note: CLI logging goes to stderr and is primarily diagnostic. In production CLI usage, most of these log events serve as debugging aids and may be controlled by a `--verbose` or `CODEPLANE_LOG_LEVEL` environment variable.

### Prometheus Metrics

These metrics are server-side (the CLI is a client and does not emit Prometheus metrics directly). The following metrics track the server-side impact of CLI watch usage:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_run_rest_check_total` | Counter | `status` (success, not_found, error) | Total REST status checks for runs (shared with `run view`) |
| `codeplane_workflow_log_stream_connections_total` | Counter | `status` (opened, reconnected, static_served), `client_type` (cli, web, tui, api) | Total log stream connection attempts |
| `codeplane_workflow_log_stream_active_connections` | Gauge | `client_type` | Currently open SSE connections |
| `codeplane_workflow_log_stream_events_sent_total` | Counter | `event_type` (log, status, done), `client_type` | Total SSE events sent |
| `codeplane_workflow_log_stream_connection_duration_seconds` | Histogram | `final_reason` (done, client_disconnect, error), `client_type` | Duration of SSE connections |
| `codeplane_workflow_cli_watch_total` | Counter | `outcome` (completed, terminal_shortcircuit, error, disconnect) | Total CLI watch command invocations by outcome |

### Alerts

#### Alert: `WorkflowCLIWatchHighDisconnectRate`
- **Condition**: `rate(codeplane_workflow_cli_watch_total{outcome="disconnect"}[15m]) / rate(codeplane_workflow_cli_watch_total[15m]) > 0.2` for 15 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check if the SSE infrastructure is healthy: verify `codeplane_workflow_log_stream_active_connections` is not at zero while runs are active.
  2. Check server logs for `SSE: failed to LISTEN on channel` warnings — PG LISTEN/NOTIFY may be broken.
  3. Verify keep-alive comments are being sent: check `codeplane_sse_pg_listen_channels_active` gauge. If 0 while connections exist, the SSE manager may have failed to start.
  4. Check for upstream proxy/load-balancer timeout settings. If the load balancer is closing idle connections before the 15-second keep-alive interval, reduce the keep-alive interval or increase the proxy idle timeout.
  5. Check for memory or file descriptor exhaustion on the server: `ulimit -n` and `cat /proc/<pid>/fd | wc -l`.
  6. Review recent deployments — a code change may have introduced a stream-closing regression.

#### Alert: `WorkflowCLIWatchHighErrorRate`
- **Condition**: `rate(codeplane_workflow_cli_watch_total{outcome="error"}[10m]) / rate(codeplane_workflow_cli_watch_total[10m]) > 0.3` for 10 minutes
- **Severity**: Critical
- **Runbook**:
  1. Check server health endpoint (`/api/health`) to confirm the API is responsive.
  2. Check for elevated 4xx/5xx rates on the `/api/repos/:owner/:repo/runs/:id` endpoint in access logs.
  3. If 401/403 errors dominate: check if a token rotation or auth system change has invalidated active PATs.
  4. If 404 errors dominate: check if a database migration or cleanup job has deleted active workflow runs.
  5. If 500 errors dominate: check server error logs for stack traces and DB connection failures.
  6. If connection-refused errors dominate: check that the server process is running and accepting connections on the expected port.

#### Alert: `WorkflowLogStreamConnectionSaturation`
- **Condition**: `codeplane_workflow_log_stream_active_connections > 500` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Identify which repositories/users are driving the most connections: check access logs filtered to `/runs/*/logs`.
  2. Check if a single automated client (CI system, agent) is opening connections in a tight loop.
  3. If a single source, apply per-user rate limiting or contact the user.
  4. If organic growth, evaluate adding connection pooling, increasing the SSE connection limit, or horizontal scaling.
  5. Verify that stale connections are being cleaned up: check `codeplane_sse_pg_listen_channels_active` vs `codeplane_workflow_log_stream_active_connections`.

### Error Cases and Failure Modes

| Error Case | Behavior | Exit Code |
|------------|----------|-----------|
| Invalid run ID (non-numeric, zero, negative) | CLI argument parser rejects before API call; error message printed | 1 |
| Run not found (valid ID, wrong repo) | REST check returns 404; error surfaced | 1 |
| Authentication failure (expired/invalid token) | REST check returns 401; auth error surfaced | 1 |
| Repository not found or no access | REST check returns 404; error surfaced | 1 |
| No repository context (no `--repo`, no remote) | CLI prints resolution error | 1 |
| SSE endpoint returns non-2xx | Error message `Failed to connect to run stream: <status> <statusText>` | 1 |
| SSE response has no body | Error message `No response body from SSE stream` | 1 |
| SSE stream closes before `done` event | Command exits after processing all received data | 1 |
| Network timeout during REST check | Connection error surfaced | 1 |
| Network timeout during SSE stream | Stream read loop ends; command exits | 1 |
| Server restart during active watch | SSE connection drops; command exits (no automatic reconnect in current implementation) | 1 |
| Malformed SSE event (invalid JSON in data field) | Data is treated as raw string, event is still collected | 0 (non-fatal) |
| Run transitions to terminal state while watching | `done` event received; command exits cleanly | 0 |
| Run has zero steps | Status event shows empty steps; `done` event arrives normally | 0 |

## Verification

### CLI E2E Tests

1. **`cli/run-watch-active-run-streams-to-completion`**: Dispatch a workflow, immediately run `codeplane run watch <id>`, verify stderr contains `Watching run #<id> (status: ...)...` followed by log lines and `Run completed: <status>`.
2. **`cli/run-watch-terminal-run-completed`**: Dispatch a workflow, wait for it to complete, then run `codeplane run watch <id>`. Verify stderr contains `Run #<id> already completed.` and the process exits immediately.
3. **`cli/run-watch-terminal-run-failed`**: Dispatch a workflow that will fail, wait for failure, then run `codeplane run watch <id>`. Verify stderr contains `Run #<id> already failed.` and the process exits immediately.
4. **`cli/run-watch-terminal-run-cancelled`**: Dispatch a workflow, cancel it, then run `codeplane run watch <id>`. Verify stderr contains `Run #<id> already cancelled.` and the process exits immediately.
5. **`cli/run-watch-log-prefix-format`**: Dispatch a workflow with at least 2 steps, run `codeplane run watch <id>`, verify log lines in stderr match the pattern `[step <N>] <content>` with correct step identifiers.
6. **`cli/run-watch-status-events-printed`**: Dispatch a workflow, run `codeplane run watch <id>`, verify stderr contains `Status: <status>` lines for step transitions.
7. **`cli/run-watch-done-event-printed`**: Dispatch a workflow, run `codeplane run watch <id>`, verify stderr ends with `Run completed: <status>`.
8. **`cli/run-watch-json-active-run`**: Dispatch a workflow, run `codeplane run watch <id> --json`, verify stdout is valid JSON containing `id`, `status`, and `events` array. Verify stderr still contains human-readable log output.
9. **`cli/run-watch-json-terminal-run`**: Complete a run, then run `codeplane run watch <id> --json`, verify stdout is valid JSON with `id` and `status` fields but no `events` array.
10. **`cli/run-watch-stderr-stdout-separation`**: Run `codeplane run watch <id> --json 2>/dev/null`, verify stdout contains only valid JSON with no human-readable text. Run `codeplane run watch <id> --json 1>/dev/null`, verify stderr contains human-readable output.
11. **`cli/workflow-watch-alias-same-behavior`**: Run `codeplane workflow watch <id>` and `codeplane run watch <id>` against the same run, verify both produce equivalent output.
12. **`cli/run-watch-repo-flag`**: Run `codeplane run watch <id> --repo owner/repo`, verify it targets the specified repository and outputs correct results.
13. **`cli/run-watch-no-repo-context-error`**: Run `codeplane run watch <id>` from a directory with no jj/git remotes and no `--repo` flag, verify the error message mentions `--repo` or `-R`.
14. **`cli/run-watch-invalid-run-id-string`**: Run `codeplane run watch abc`, verify the command exits with code 1 and an appropriate error message.
15. **`cli/run-watch-invalid-run-id-zero`**: Run `codeplane run watch 0`, verify exit code 1 and error.
16. **`cli/run-watch-invalid-run-id-negative`**: Run `codeplane run watch -1`, verify exit code 1 and error.
17. **`cli/run-watch-invalid-run-id-float`**: Run `codeplane run watch 3.14`, verify the value is coerced to an integer (3) by `z.coerce.number()` or rejected — document whichever behavior `incur` produces.
18. **`cli/run-watch-nonexistent-run`**: Run `codeplane run watch 999999999 --repo owner/repo`, verify the command surfaces a not-found error and exits with code 1.
19. **`cli/run-watch-unauthenticated`**: Clear credentials, run `codeplane run watch <id>`, verify the command surfaces an authentication error and exits with code 1.
20. **`cli/run-watch-private-repo-no-access`**: As a user without read access to a private repo, run `codeplane run watch <id> --repo private-owner/private-repo`, verify the command receives a 404 and exits with code 1.
21. **`cli/run-watch-connection-failure`**: Point CLI at an unreachable server URL, run `codeplane run watch <id>`, verify a human-readable connection error (not a raw stack trace) and exit code 1.
22. **`cli/run-watch-sse-error-response`**: Trigger a scenario where the SSE endpoint returns a non-2xx status (e.g., 500), verify the CLI prints `Failed to connect to run stream: 500 ...` and exits with code 1.
23. **`cli/run-watch-log-content-special-characters`**: Dispatch a workflow that emits log lines containing ANSI escape codes, unicode characters, quotes, and backslashes. Run `codeplane run watch <id>`, verify the content appears in stderr without corruption.
24. **`cli/run-watch-log-content-empty-lines`**: Dispatch a workflow that emits empty string log content. Run `codeplane run watch <id>`, verify empty lines are printed (as `[step N] `) without crashing.
25. **`cli/run-watch-multi-step-workflow`**: Dispatch a workflow with 5+ steps, run `codeplane run watch <id>`, verify log lines appear with different step prefixes and status changes appear for each step transition.
26. **`cli/run-watch-zero-step-run`**: Create a run with zero steps (if possible via dispatch), run `codeplane run watch <id>`, verify the command handles it gracefully (receives status + done events).
27. **`cli/run-watch-exit-code-success`**: Run `codeplane run watch <id>` for a successful run, verify exit code is 0.
28. **`cli/run-watch-exit-code-failed-run`**: Run `codeplane run watch <id>` for a run that fails, verify exit code is 0 (the watch command itself succeeded; the run's failure is reported in output, not exit code).
29. **`cli/run-watch-keepalive-does-not-appear`**: Run `codeplane run watch <id>` against a slow workflow, verify that SSE keep-alive comments do not appear in stderr output.
30. **`cli/run-watch-max-valid-run-id`**: Run `codeplane run watch 9007199254740991` (Number.MAX_SAFE_INTEGER) against a valid repo, verify the ID is accepted by the CLI parser (should produce a not-found error, not a parse error).
31. **`cli/run-watch-exceeds-max-run-id`**: Run `codeplane run watch 9007199254740992`, verify the CLI either rejects it or the coerced value does not match the intended ID (documenting JavaScript integer precision behavior).

### API Integration Tests (exercised by CLI watch)

32. **`api/run-status-check-active-run`**: `GET /api/repos/:owner/:repo/runs/:id` for a running workflow returns status `running` with valid run metadata.
33. **`api/run-status-check-terminal-run`**: `GET /api/repos/:owner/:repo/runs/:id` for a completed run returns terminal status with `completed_at` timestamp.
34. **`api/run-status-check-not-found`**: `GET /api/repos/:owner/:repo/runs/999999999` returns 404.
35. **`api/run-status-check-invalid-id`**: `GET /api/repos/:owner/:repo/runs/abc` returns 400 with `{ "message": "invalid run id" }`.
36. **`api/sse-log-stream-delivers-events`**: Connect to `/runs/:id/logs` for an active run, verify `log` events arrive as the runner produces output.
37. **`api/sse-log-stream-done-event-closes-stream`**: Connect to `/runs/:id/logs`, wait for completion, verify `done` event is received and the stream closes.
38. **`api/sse-log-stream-terminal-run-static`**: Connect to `/runs/:id/logs` for a completed run, verify `status` + `done` events are sent as a one-shot response.
39. **`api/sse-log-stream-keepalive`**: Connect to `/runs/:id/logs` for a slow run, verify `: keep-alive` comments are received within 20 seconds.
40. **`api/sse-log-stream-auth-required-private-repo`**: Connect to `/runs/:id/logs` for a private repo without authentication, verify 401 or 404.

### Integration Scenario Tests

41. **`e2e/dispatch-and-watch-full-lifecycle`**: Dispatch a workflow via `codeplane workflow dispatch`, capture the run ID from the response, immediately run `codeplane run watch <id>`, verify the watch streams logs and exits when the run completes. Validate the full end-to-end lifecycle from dispatch to watch completion.
42. **`e2e/dispatch-and-watch-json-pipeline`**: Run `ID=$(codeplane workflow dispatch 1 --json | jq '.id') && codeplane run watch $ID --json > result.json`, verify `result.json` contains valid JSON with the completed run data and events.
43. **`e2e/watch-then-rerun-on-failure`**: Dispatch a workflow that fails, watch it to completion, verify the failure is reported, then run `codeplane run rerun <id>` and watch the rerun.
44. **`e2e/concurrent-watch-same-run`**: Open two `codeplane run watch <id>` processes for the same active run, verify both receive log output and both exit on `done`.
45. **`e2e/watch-across-repo-resolution-methods`**: Run `codeplane run watch <id> --repo owner/repo` and `codeplane run watch <id>` (from within the repo directory), verify both produce equivalent output.

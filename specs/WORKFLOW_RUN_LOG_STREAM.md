# WORKFLOW_RUN_LOG_STREAM

Specification for WORKFLOW_RUN_LOG_STREAM.

## High-Level User POV

When a user triggers a workflow in Codeplane — whether from a push event, a manual dispatch, a schedule, or any other supported trigger — they need immediate, real-time visibility into what that workflow is doing. Workflow Run Log Streaming is the capability that makes workflow execution transparent and interactive rather than a black box that produces only a final pass/fail result.

From the moment a workflow run begins, the user can open a live log view from any Codeplane client — the web UI, the CLI, the TUI, or even a custom integration — and watch output appear line by line as each step executes. Each workflow step's stdout and stderr output are streamed separately and labeled, so the user always knows which step produced which output and whether it came from standard output or standard error. If a step is printing build progress, test results, or deployment status, those lines appear in the user's terminal or browser within moments of being written.

If the user's connection drops — a laptop lid closes, a WiFi network switches, or a VPN reconnects — the stream automatically resumes from exactly where it left off. No log lines are lost, no duplicates appear, and the user doesn't have to manually scroll through output they've already seen. The system remembers the last event the client received and replays anything that was missed during the disconnection.

For workflows that have already finished, the log viewer still works. When a user opens the logs for a completed, failed, or cancelled run, they receive the entire log history instantly as a single batch, with no dangling connection left open. This makes the same endpoint useful for both live monitoring and after-the-fact debugging.

The value is simple: workflow execution becomes a first-class observable product surface rather than an opaque background job. Users can diagnose failures faster, confirm deployments are progressing, and share log links with teammates who need to understand what happened. Combined with Codeplane's step-level status badges and terminal state detection, the log stream gives teams confidence that their automation is working correctly — or clear evidence of what went wrong when it isn't.

## Acceptance Criteria

### Definition of Done

- [ ] A user with read access to a repository can open a real-time log stream for any workflow run in that repository.
- [ ] Log events arrive in the client within 2 seconds of being written by the runner.
- [ ] Each log event includes the step ID, sequence number, content, and stream type (stdout/stderr).
- [ ] The stream emits three distinct event types: `status` (run + step metadata), `log` (individual log lines), and `done` (terminal notification).
- [ ] The initial `status` event is always sent upon connection, even before any log lines.
- [ ] If the run is already in a terminal state (success, failure, failed, cancelled, timeout), the server sends `status` + `done` events as a one-shot static response and closes the connection immediately. No long-lived SSE connection is opened.
- [ ] The stream supports reconnection via the `Last-Event-ID` header. On reconnect, all log events with IDs greater than the provided ID are replayed before the live stream resumes.
- [ ] The replay window is capped at 1,000 log entries per reconnection. If more than 1,000 entries were missed, the most recent 1,000 are delivered.
- [ ] The server sends SSE keep-alive comments (`: keep-alive\n\n`) every 15 seconds to prevent proxy/load-balancer timeouts.
- [ ] Multi-channel subscription: the server listens on `workflow_run_events_{runId}` for status changes AND on `workflow_step_logs_{stepId}` for each step's log output, all on a single SSE connection.
- [ ] If new steps are added to the run after the connection was established, those new step channels are not automatically subscribed. The client must reconnect to pick up new step channels.
- [ ] The `done` event payload contains the final run status and all step metadata.
- [ ] An invalid or non-existent run ID returns HTTP 400 or 404 respectively, not an SSE stream.
- [ ] A negative, zero, or non-numeric run ID returns HTTP 400 with `{ "message": "invalid run id" }`.
- [ ] Log entry content can contain arbitrary UTF-8 text including ANSI escape sequences, newlines embedded in the JSON payload, and special characters.
- [ ] Individual log entry content has no enforced maximum length at the streaming layer; the database `entry` column is `text` type (unbounded).
- [ ] The `Last-Event-ID` header value must be a positive integer. Non-numeric or negative values are silently ignored (no replay, no error).
- [ ] The SSE stream uses `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive` response headers.
- [ ] Each SSE event conforms to the wire format: optional `id:` line, `event:` line, `data:` line, terminated by double newline.
- [ ] The CLI `run logs <id>` command connects to the stream, prints log lines to stderr with step prefixes, and exits when the `done` event arrives.
- [ ] The CLI `run watch <id>` and `workflow watch <id>` commands first check the run status via REST. If terminal, they return immediately. If running, they connect to the SSE stream and wait for completion.
- [ ] CLI streaming output goes to stderr (human-readable) while structured JSON is reserved for stdout when `--json` is used.
- [ ] The stream correctly handles runs with zero steps (edge case: status + done, no log channels).
- [ ] The stream correctly handles runs where steps exist but have produced zero log lines.
- [ ] Concurrent connections from multiple clients to the same run's log stream all receive the same events independently.
- [ ] Channel names are validated to contain only `[a-zA-Z0-9_]` characters. Any attempt to subscribe to an invalid channel name raises an error server-side before touching PostgreSQL.

### Boundary Constraints

- Run ID: positive 64-bit integer (1 to 2^63-1)
- Last-Event-ID: positive integer or absent; parsed via `parseInt(..., 10)`, must be > 0 to trigger replay
- Replay limit: hard-capped at 1,000 entries per reconnection
- Keep-alive interval: 15 seconds
- Log entry `stream` field: must be exactly `"stdout"` or `"stderr"`
- Log entry `sequence`: 1-indexed positive bigint per step (gapless within a step due to advisory locking)
- Channel name pattern: `^[a-zA-Z0-9_]+$`
- Terminal statuses: `success`, `failure`, `failed`, `cancelled`, `timeout`

## Design

### API Shape

#### Primary Endpoint: Log Stream

```
GET /api/repos/:owner/:repo/runs/:id/logs
```

**Response**: Server-Sent Events stream (`text/event-stream`)

**Headers**:
- `Accept: text/event-stream` (recommended from client)
- `Authorization: token <PAT>` or session cookie
- `Last-Event-ID: <integer>` (optional, for reconnection replay)

**Response Headers**:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**Event Types**:

| Event Type | When Sent | Payload Shape |
|---|---|---|
| `status` | Always first; also on run status changes | `{ run: WorkflowRun, steps: WorkflowStep[] }` |
| `log` | Per log line from any step | `{ log_id: number, step: number, line: number, content: string, stream: "stdout" \| "stderr" }` |
| `done` | When run reaches terminal status | `{ run: WorkflowRun, steps: WorkflowStep[] }` |

**Error Responses**:
- `400 { "message": "invalid run id" }` — non-numeric, negative, or zero run ID
- `404 { "message": "workflow run not found" }` — valid ID but no matching run in this repository

**Behavior**:
1. Validate run ID as positive int64.
2. Resolve repository from `:owner/:repo`.
3. Fetch run and steps from the workflow service.
4. If `Last-Event-ID` header is present and is a valid positive integer, query `listWorkflowLogsSince(runId, lastEventID, 1000)` and prepend those as `log` events.
5. Append a `status` event with current run and step metadata.
6. If the run is in a terminal state, append a `done` event and return a one-shot static SSE response (no streaming connection).
7. Otherwise, subscribe to `workflow_run_events_{runId}` and `workflow_step_logs_{stepId}` for every known step, and pipe the live stream to the client after the initial events.

#### Secondary Endpoint: Event Stream (Status Only)

```
GET /api/repos/:owner/:repo/workflows/runs/:id/events
```

Same authentication and error handling. Subscribes only to `workflow_run_events_{runId}`. Emits `status` and `done` events only — no log replay, no step log channels.

### SDK Shape

The SDK exposes the following relevant types and utilities consumed by the server and other clients:

**SSEManager** (from `@codeplane/sdk`):
- `subscribe(channel, options?)` — single-channel ReadableStream
- `subscribeMulti(channels[], options?)` — multi-channel ReadableStream with channel-name-based event types
- `start()` / `stop()` — lifecycle management

**SSE Response Helpers** (from `@codeplane/sdk`):
- `formatSSEEvent(event: SSEEvent)` — serializes to SSE wire format
- `sseResponse(stream)` — wraps a ReadableStream in a properly-headered Response
- `sseStaticResponse(events[])` — one-shot response for terminal states
- `sseStreamWithInitial(initialEvents, liveStream)` — prepends initial events before piping live data
- `sseHeaders()` — returns standard SSE response headers

**WorkflowService** (from `@codeplane/sdk`):
- `getWorkflowRunById(repositoryId, runId)` — fetch run metadata
- `listWorkflowSteps(runId)` — fetch all steps for a run
- `listWorkflowLogsSince(runId, afterId, limit)` — fetch logs since a given event ID

### CLI Command

#### `codeplane run logs <id>`

Streams all log events for a workflow run to the terminal.

- Connects to `GET /api/repos/{owner}/{repo}/runs/{id}/logs`
- Sends `Authorization: token <token>` and `Accept: text/event-stream` headers
- Parses SSE wire format line by line
- On `log` event: writes `[step {stepId}] {content}` to stderr
- On `status` event: writes `Status: {status}` to stderr
- On `done` event: writes `Run completed: {status}` to stderr and exits
- On `: keep-alive` comments: silently ignored
- With `--json`: collects all events and prints structured JSON array to stdout on exit
- Exits with code 0 on `done` event or stream close

**Options**:
- `--repo OWNER/REPO` — explicit repository reference (otherwise inferred from current directory)

#### `codeplane run watch <id>`

Higher-level command that first checks if the run is already terminal (via REST `GET /runs/{id}`), and if not, falls back to `streamWorkflowRunEvents()`.

- Writes `Watching run #{id} (status: {status})...` to stderr
- If run is `completed`, `failed`, or `cancelled`: prints `Run #{id} already {status}.` and returns
- Otherwise: streams events until `done`
- With `--json`: returns merged run data + events array

#### `codeplane workflow watch <id>`

Alias for `codeplane run watch <id>`.

### TUI UI

The TUI should present a workflow log viewing screen accessible from the workflow runs list. The screen includes:

- **Step selector bar**: horizontal tabs showing each step name with a status badge (spinner for running, checkmark for success, X for failure, dash for pending)
- **Log viewer pane**: scrollable text area showing log lines with line numbers, stream indicator (stdout vs stderr differentiated by color), and ANSI color passthrough
- **Auto-follow toggle**: press `f` to toggle auto-scroll to the latest log line; enabled by default when a step is actively running
- **Search**: press `/` to enter search mode within the current step's logs
- **Connection health indicator**: a small dot in the status bar showing connection state (green = healthy, yellow = reconnecting, red = disconnected)
- **Keyboard shortcuts**: `Tab`/`Shift+Tab` to navigate between steps, `q` to quit, `j`/`k` for scroll, `G` for end, `g` for beginning

The TUI should implement automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s) and use `Last-Event-ID` for seamless replay on reconnect.

### Web UI Design

The web UI workflow run detail page should include:

- **Step sidebar**: vertical list of steps with status badges and duration
- **Log output panel**: monospace, syntax-highlighted log viewer with ANSI color rendering
- **Stream filter**: toggle to show stdout only, stderr only, or both
- **Auto-scroll**: automatically scroll to bottom while new lines arrive; disengage when user scrolls up manually
- **Search**: `Cmd+F` / `Ctrl+F` scoped to the log content
- **Download**: button to download full logs as a text file
- **Timestamp toggle**: optionally show relative or absolute timestamps per log line
- **Connection indicator**: subtle badge showing "Live" (streaming), "Reconnecting...", or "Disconnected"

### Documentation

End-user documentation should cover:

- **"Viewing workflow logs"** guide: explain how to open the log viewer from the web UI run detail page, what the step sidebar shows, and how auto-scroll works
- **"Streaming logs from the CLI"** guide: document `codeplane run logs <id>` and `codeplane run watch <id>` with examples, explain the stderr/stdout split, and show `--json` usage
- **"Reconnection behavior"** section: explain that connections automatically resume, describe the Last-Event-ID mechanism in user-friendly terms ("your place is saved")
- **"Workflow run statuses"** reference: define what each terminal status means (success, failure, failed, cancelled, timeout) and how they appear in the log viewer
- **API reference**: document both SSE endpoints with request/response examples, event type schemas, and the Last-Event-ID header

## Permissions & Security

### Authorization

| Role | Access |
|---|---|
| **Repository Owner** | Full access to all workflow run log streams |
| **Admin** | Full access to all workflow run log streams |
| **Member (Write)** | Full access to all workflow run log streams |
| **Member (Read)** | Read-only access to log streams for public repositories; read access to log streams for private repositories they have explicit read permission on |
| **Anonymous** | Can access log streams for public repositories only; no authentication required for public repos but SSE ticket auth is unavailable |

Authorization is enforced at the repository resolution layer (`resolveRepoId`). The workflow service receives a repository ID only after the repo service has confirmed the actor has at least read access to the repository.

### Rate Limiting

| Surface | Limit | Scope |
|---|---|---|
| SSE connection establishment | 30 connections/minute | Per user per repository |
| Concurrent SSE connections | 10 simultaneous | Per user globally |
| `Last-Event-ID` replay queries | 60/minute | Per user per repository |
| Keep-alive comment rate | Fixed at 1 per 15 seconds | Per connection (server-controlled) |

When rate limits are exceeded, the server returns `429 Too Many Requests` with a `Retry-After` header. Clients should respect this header and delay reconnection accordingly.

### Data Privacy

- Log entry content may contain secrets accidentally printed by user workflows. The streaming layer does not redact content; secret masking is the responsibility of the workflow execution runtime before logs are persisted.
- Channel names are derived from internal numeric IDs and do not leak PII.
- SSE connections require the same authentication as REST API calls. No anonymous access to private repository logs.
- The `Authorization` header (PAT token) is never echoed in SSE event payloads.
- Log content should be treated as potentially sensitive. Cache-Control: no-cache prevents proxy caching of log streams.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|---|---|---|
| `WorkflowRunLogStreamOpened` | Client establishes SSE connection to log stream | `repository_id`, `run_id`, `client_type` (web/cli/tui/api), `is_terminal_run`, `has_last_event_id` |
| `WorkflowRunLogStreamReconnected` | Client reconnects with Last-Event-ID | `repository_id`, `run_id`, `client_type`, `last_event_id`, `replayed_count` |
| `WorkflowRunLogStreamCompleted` | `done` event is sent to client | `repository_id`, `run_id`, `client_type`, `final_status`, `total_log_events_sent`, `stream_duration_ms` |
| `WorkflowRunLogStreamDisconnected` | Client disconnects before `done` | `repository_id`, `run_id`, `client_type`, `events_sent_before_disconnect`, `stream_duration_ms` |
| `WorkflowRunLogStreamStaticServed` | Terminal run served as one-shot response | `repository_id`, `run_id`, `client_type`, `final_status`, `total_log_events` |

### Funnel Metrics

| Metric | Definition | Target |
|---|---|---|
| **Stream adoption rate** | % of workflow runs that have at least one log stream opened | > 40% of non-trivial runs |
| **Reconnection success rate** | % of reconnections that successfully replay without data loss | > 99% |
| **Time-to-first-log** | P95 latency from runner writing a log line to client receiving it | < 2 seconds |
| **Stream completion rate** | % of opened streams that receive the `done` event (vs premature disconnect) | > 70% |
| **CLI log command usage** | Weekly active users of `run logs` and `run watch` | Tracked, no specific target |

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| SSE connection established | `info` | `run_id`, `repository_id`, `user_id`, `has_last_event_id`, `channel_count` |
| Last-Event-ID replay performed | `info` | `run_id`, `last_event_id`, `replayed_count`, `replay_duration_ms` |
| SSE connection closed (client disconnect) | `info` | `run_id`, `user_id`, `events_sent`, `connection_duration_ms` |
| SSE connection closed (done event) | `info` | `run_id`, `user_id`, `events_sent`, `final_status` |
| Static SSE response served (terminal run) | `debug` | `run_id`, `repository_id`, `final_status`, `event_count` |
| PG LISTEN subscription created | `debug` | `channel` |
| PG LISTEN subscription removed (no subscribers) | `debug` | `channel` |
| PG LISTEN failure | `warn` | `channel`, `error_message` |
| Invalid run ID rejected | `warn` | `raw_param`, `remote_addr` |
| Workflow run not found | `warn` | `run_id`, `repository_id`, `user_id` |
| Keep-alive write failure (client gone) | `debug` | `run_id`, `channel` |
| Channel validation failure | `error` | `channel`, `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workflow_log_stream_connections_total` | Counter | `status` (opened, reconnected, static_served) | Total log stream connection attempts |
| `codeplane_workflow_log_stream_active_connections` | Gauge | — | Currently open SSE connections for workflow logs |
| `codeplane_workflow_log_stream_events_sent_total` | Counter | `event_type` (log, status, done) | Total SSE events sent across all connections |
| `codeplane_workflow_log_stream_connection_duration_seconds` | Histogram | `final_reason` (done, client_disconnect, error) | Duration of SSE connections |
| `codeplane_workflow_log_replay_count` | Histogram | — | Number of events replayed per Last-Event-ID reconnection |
| `codeplane_workflow_log_replay_duration_seconds` | Histogram | — | Time spent executing replay queries |
| `codeplane_sse_pg_listen_channels_active` | Gauge | — | Number of active PG LISTEN channels |
| `codeplane_sse_pg_listen_failures_total` | Counter | — | PG LISTEN subscription failures |
| `codeplane_workflow_log_stream_keepalive_failures_total` | Counter | — | Keep-alive write failures (stale connections) |

### Alerts

#### Alert: `WorkflowLogStreamHighConnectionCount`
- **Condition**: `codeplane_workflow_log_stream_active_connections > 500` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workflow_log_stream_active_connections` in Grafana to confirm the alert.
  2. Run `SELECT count(*) FROM pg_stat_activity WHERE state = 'idle' AND query LIKE '%LISTEN%'` to check PG connection count.
  3. Identify if a specific repository or user is responsible: check access logs for high-frequency SSE connections from a single source.
  4. If a single client is misbehaving (reconnect loop), consider temporarily rate-limiting that user/IP.
  5. If organic growth, consider increasing the concurrent SSE connection limit or adding connection pooling at the load balancer.
  6. Verify keep-alive is working — stale connections that don't get cleaned up inflate the gauge.

#### Alert: `WorkflowLogStreamReplayLatencyHigh`
- **Condition**: `histogram_quantile(0.95, codeplane_workflow_log_replay_duration_seconds) > 2.0` for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check slow query logs for `ListWorkflowLogsSince` queries.
  2. Verify the `workflow_logs` table has an index on `(workflow_run_id, id)` — this is the access pattern for replay.
  3. Check if a specific run has an unusually large number of log entries (`SELECT count(*) FROM workflow_logs WHERE workflow_run_id = ?`).
  4. If a specific run is the outlier, it may be a runaway workflow. Consider cancelling it.
  5. If systemic, check PostgreSQL connection pool saturation and overall DB load.

#### Alert: `PGListenFailuresElevated`
- **Condition**: `rate(codeplane_sse_pg_listen_failures_total[5m]) > 1` for 5 minutes
- **Severity**: Critical
- **Runbook**:
  1. Check PostgreSQL connectivity: `SELECT 1` from the application.
  2. Check `pg_stat_activity` for connection count — may be hitting `max_connections`.
  3. Review server logs for `SSE: failed to LISTEN on channel` warnings with specific error messages.
  4. If PGLite mode (daemon/desktop), LISTEN/NOTIFY is expected to fail. Verify the deployment mode and suppress the alert for non-server deployments.
  5. If server mode, check PostgreSQL replication status if running a replica setup — LISTEN/NOTIFY only works on the primary.
  6. Restart the SSE manager if connections are in a bad state: the server graceful shutdown path calls `sse.stop()`.

#### Alert: `WorkflowLogStreamZeroEventsLongRunning`
- **Condition**: `codeplane_workflow_log_stream_active_connections > 0` AND `rate(codeplane_workflow_log_stream_events_sent_total[10m]) == 0` for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. This suggests active connections are receiving no events — possible PG NOTIFY pipeline break.
  2. Verify that workflow runners are actively producing logs: check `workflow_logs` table for recent inserts.
  3. Verify that `pg_notify` is being called after log insertion: check runner task completion logs.
  4. Test the NOTIFY pipeline manually: `SELECT pg_notify('workflow_step_logs_1', '{"test":true}')` and check if the SSE manager receives it.
  5. Check for PG connection leaks or exhaustion that might prevent new LISTEN subscriptions.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|---|---|---|
| Invalid run ID (non-numeric, ≤0) | HTTP 400, no stream opened | Client retries with valid ID |
| Run not found for repository | HTTP 404, no stream opened | Client verifies run exists |
| PG LISTEN fails (connection issue) | Stream opens but only serves initial data + keep-alive; no live events | Log warning; reconnection may succeed if PG recovers |
| Client disconnects mid-stream | Server detects closed controller, cleans up subscriber and keep-alive interval | Automatic via ReadableStream cancel callback |
| PG connection pool exhausted | New SSE subscriptions fail silently; existing streams continue | Monitor `pg_stat_activity`; scale connection pool |
| Extremely large replay (>1000 entries missed) | Only most recent 1000 replayed; older entries silently dropped | Client may have a gap; should fetch full history via separate endpoint if needed |
| Runner crashes mid-run | Run transitions to `failed` status; `done` event fires | Client receives `done` event and exits cleanly |
| Server restart during active stream | All active SSE connections are dropped | Clients reconnect with Last-Event-ID; replay fills the gap |
| Network partition between server and PG | LISTEN/NOTIFY stops working; streams stall | Keep-alive continues; no live events until PG reconnects |

## Verification

### API Integration Tests

1. **`api/workflow-log-stream/connects-to-running-run`**: Dispatch a workflow, connect to `/runs/{id}/logs`, verify the first event is `status` type with run and step metadata.
2. **`api/workflow-log-stream/receives-log-events`**: Dispatch a workflow, connect to log stream, have the runner emit log lines, verify `log` events arrive with correct `log_id`, `step`, `line`, `content`, and `stream` fields.
3. **`api/workflow-log-stream/receives-done-event-on-completion`**: Dispatch a workflow, connect to log stream, wait for completion, verify `done` event arrives with final status and step metadata.
4. **`api/workflow-log-stream/terminal-run-returns-static-response`**: Dispatch a workflow, wait for it to complete, then connect to `/runs/{id}/logs`. Verify the response contains `status` + `done` events and the connection closes immediately (no streaming).
5. **`api/workflow-log-stream/terminal-run-success`**: Connect to a completed (success) run's log stream; verify `done` event has `status: "success"`.
6. **`api/workflow-log-stream/terminal-run-failure`**: Connect to a failed run's log stream; verify `done` event has `status: "failure"` or `"failed"`.
7. **`api/workflow-log-stream/terminal-run-cancelled`**: Cancel a run, then connect; verify `done` event has `status: "cancelled"`.
8. **`api/workflow-log-stream/terminal-run-timeout`**: Connect to a timed-out run; verify `done` event has `status: "timeout"`.
9. **`api/workflow-log-stream/last-event-id-replay`**: Connect to a running stream, record some event IDs, disconnect, reconnect with `Last-Event-ID: {lastId}`, verify that missed events are replayed before live events resume.
10. **`api/workflow-log-stream/last-event-id-replay-capped-at-1000`**: Insert >1000 log entries, reconnect with a very old Last-Event-ID, verify exactly 1000 entries are replayed.
11. **`api/workflow-log-stream/last-event-id-invalid-non-numeric`**: Send `Last-Event-ID: abc`, verify no replay occurs and stream connects normally.
12. **`api/workflow-log-stream/last-event-id-zero`**: Send `Last-Event-ID: 0`, verify no replay (must be > 0).
13. **`api/workflow-log-stream/last-event-id-negative`**: Send `Last-Event-ID: -5`, verify no replay.
14. **`api/workflow-log-stream/invalid-run-id-string`**: `GET /runs/abc/logs` → 400 with `{ "message": "invalid run id" }`.
15. **`api/workflow-log-stream/invalid-run-id-zero`**: `GET /runs/0/logs` → 400.
16. **`api/workflow-log-stream/invalid-run-id-negative`**: `GET /runs/-1/logs` → 400.
17. **`api/workflow-log-stream/run-not-found`**: `GET /runs/999999999/logs` for a valid repo → 404 with `{ "message": "workflow run not found" }`.
18. **`api/workflow-log-stream/sse-headers`**: Verify response headers include `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
19. **`api/workflow-log-stream/keep-alive-comments`**: Connect and wait >15 seconds, verify `: keep-alive\n\n` comment is received.
20. **`api/workflow-log-stream/multi-step-logs`**: Dispatch a workflow with multiple steps, connect, verify log events arrive with different `step` IDs.
21. **`api/workflow-log-stream/stdout-and-stderr-distinguished`**: Verify log events correctly carry `stream: "stdout"` or `stream: "stderr"`.
22. **`api/workflow-log-stream/concurrent-clients-same-run`**: Open two simultaneous SSE connections to the same run, verify both receive the same events independently.
23. **`api/workflow-log-stream/run-with-zero-steps`**: Create a run with no steps, connect to log stream, verify `status` event has empty `steps` array.
24. **`api/workflow-log-stream/run-with-steps-no-logs`**: Create a run with steps but no log output, connect, verify `status` event has steps and no `log` events arrive until runner writes output.
25. **`api/workflow-log-stream/log-content-special-characters`**: Emit log lines containing newlines, quotes, backslashes, unicode, and ANSI escape codes. Verify they arrive intact in the JSON payload.
26. **`api/workflow-log-stream/log-content-empty-string`**: Emit a log line with empty string content. Verify the event arrives with `content: ""`.
27. **`api/workflow-log-stream/log-content-large-payload`**: Emit a single log line with 1MB of content. Verify it arrives intact without truncation.
28. **`api/workflow-log-stream/event-stream-only-endpoint`**: Connect to `/workflows/runs/{id}/events`, verify only `status` and `done` events are received (no `log` events).
29. **`api/workflow-log-stream/event-stream-no-replay`**: Connect to `/workflows/runs/{id}/events` with `Last-Event-ID`, verify no replay occurs.
30. **`api/workflow-log-stream/unauthorized-private-repo`**: Attempt to connect to a log stream for a private repo without authentication → 401 or 404.
31. **`api/workflow-log-stream/sequence-numbers-gapless`**: Emit multiple log lines to the same step, verify `line` (sequence) numbers are consecutive starting from 1 with no gaps.

### CLI E2E Tests

32. **`cli/run-logs-streams-output`**: Run `codeplane run logs <id>` against a running workflow, verify stderr contains `[step N] ...` formatted output.
33. **`cli/run-logs-exits-on-done`**: Run `codeplane run logs <id>`, verify the process exits after the run completes.
34. **`cli/run-logs-terminal-run`**: Run `codeplane run logs <id>` against an already-completed run, verify output is delivered and process exits.
35. **`cli/run-logs-json-output`**: Run `codeplane run logs <id> --json`, verify stdout contains a JSON array of event objects.
36. **`cli/run-watch-terminal-run`**: Run `codeplane run watch <id>` against a completed run, verify `Run #{id} already {status}.` message and immediate exit.
37. **`cli/run-watch-streams-until-done`**: Run `codeplane run watch <id>` against a running workflow, verify it streams events and exits on completion.
38. **`cli/workflow-watch-alias`**: Run `codeplane workflow watch <id>`, verify it behaves identically to `codeplane run watch <id>`.
39. **`cli/run-logs-invalid-run-id`**: Run `codeplane run logs abc`, verify error message about invalid run ID.
40. **`cli/run-logs-nonexistent-run`**: Run `codeplane run logs 999999999`, verify appropriate error message.
41. **`cli/run-logs-repo-flag`**: Run `codeplane run logs <id> --repo owner/repo`, verify it targets the specified repository.
42. **`cli/run-logs-connection-failure`**: Point CLI at an invalid server URL, run `codeplane run logs <id>`, verify graceful error message.
43. **`cli/run-logs-stderr-stdout-separation`**: Run `codeplane run logs <id> --json`, verify that human-readable output went to stderr and JSON went to stdout.
44. **`cli/run-watch-json-output`**: Run `codeplane run watch <id> --json`, verify stdout contains run data merged with events.

### TUI E2E Tests

45. **`tui/workflow-log-screen-renders`**: Navigate to a workflow run in the TUI, verify the log screen renders with step selector and log viewer pane.
46. **`tui/workflow-log-screen-step-badges`**: Verify step badges display correct status indicators (spinner, checkmark, X, dash).
47. **`tui/workflow-log-screen-auto-follow`**: Verify that new log lines cause auto-scroll when auto-follow is enabled.
48. **`tui/workflow-log-screen-auto-follow-toggle`**: Press `f`, verify auto-follow disengages; press `f` again, verify it re-engages.
49. **`tui/workflow-log-screen-step-navigation`**: Press `Tab` to move between steps, verify log content updates to show selected step's logs.
50. **`tui/workflow-log-screen-search`**: Press `/`, type a search term, verify matching lines are highlighted.
51. **`tui/workflow-log-screen-connection-indicator`**: Verify connection health dot is green during active streaming.
52. **`tui/workflow-log-screen-terminal-run`**: Open a completed run in TUI, verify all logs are displayed without a streaming connection.
53. **`tui/workflow-log-screen-keyboard-scroll`**: Verify `j`/`k` scroll, `G` goes to end, `g` goes to beginning.
54. **`tui/workflow-log-screen-quit`**: Press `q`, verify navigation back to the runs list.

### SSE Infrastructure Tests

55. **`sse/channel-validation-valid`**: Verify `validateChannel("workflow_step_logs_123")` returns true.
56. **`sse/channel-validation-invalid-special-chars`**: Verify `validateChannel("workflow;DROP TABLE")` returns false.
57. **`sse/channel-validation-empty`**: Verify `validateChannel("")` returns false.
58. **`sse/format-sse-event-with-id`**: Verify `formatSSEEvent({ id: "42", type: "log", data: "{}" })` produces correct wire format.
59. **`sse/format-sse-event-without-id`**: Verify events without `id` field omit the `id:` line.
60. **`sse/format-sse-event-without-type`**: Verify events without `type` field omit the `event:` line.
61. **`sse/static-response-sends-all-events`**: Verify `sseStaticResponse([e1, e2, e3])` produces a response body with all three events concatenated.
62. **`sse/stream-with-initial-prepends-events`**: Verify `sseStreamWithInitial([initial], liveStream)` emits the initial event before live data.
63. **`sse/subscribe-multi-channels`**: Verify `subscribeMulti(["ch1", "ch2"])` creates a single stream that receives events from both channels.
64. **`sse/subscribe-multi-invalid-channel-throws`**: Verify `subscribeMulti(["valid", "invalid;channel"])` throws an error.
65. **`sse/keep-alive-interval`**: Subscribe to a channel, wait 16 seconds, verify at least one `: keep-alive\n\n` comment was received.
66. **`sse/subscriber-cleanup-on-cancel`**: Subscribe, cancel the stream, verify the subscriber is removed from the channel's subscriber set.
67. **`sse/last-channel-subscriber-unlistens`**: Subscribe to a channel, cancel, verify PG UNLISTEN is called when no subscribers remain.
68. **`sse/manager-stop-cleans-all`**: Call `sse.stop()`, verify all channels are cleared and all subscribers are marked closed.

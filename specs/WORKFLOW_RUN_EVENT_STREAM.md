# WORKFLOW_RUN_EVENT_STREAM

Specification for WORKFLOW_RUN_EVENT_STREAM.

## High-Level User POV

When a developer triggers a workflow — whether through a push, a landing request, a manual dispatch, or a schedule — they need to know what is happening with that run *right now*. The Workflow Run Event Stream is the live status feed that powers every real-time workflow experience across Codeplane. It is the backbone that makes watching a CI build feel instantaneous rather than requiring constant page refreshes.

From the user's perspective, this feature manifests in several ways. On the web UI, when viewing a workflow run detail page, the run's status badge, step statuses, and timing information all update live without any user interaction. When a step transitions from "pending" to "running" to "success," the user sees it happen as it happens. When the entire run completes or fails, the page reflects the final state immediately. There is no "refresh to see latest status" interaction — the page is always current.

In the CLI, `codeplane workflow watch <run-id>` opens a live tail of the workflow run. Status transitions are printed as they occur — "step build started," "step build completed," "run succeeded" — interleaved with the actual log output from each step. The command exits automatically when the run reaches a terminal state (completed, failed, or cancelled). If the run is already finished when the watch command is invoked, the CLI reports the final state immediately without waiting.

In the TUI, the workflow run detail screen shows a step selector bar with live-updating status badges (spinners for running steps, checkmarks for successes, X marks for failures) alongside the log stream. The run's elapsed timer ticks in real time. When the run completes, the timer freezes and the final status is locked in.

Across all clients, the event stream provides a reliable, ordered sequence of status transitions. If a client is temporarily disconnected — a laptop sleeps, a network blip occurs — the stream resumes seamlessly. The user never misses a status change, and they never see stale state. This reliability is what makes Codeplane's workflow experience feel like watching a local process rather than polling a remote API.

The event stream is distinct from the log stream. Events carry *metadata* about the run and its steps: which step started, which step finished, what the overall run status is. Logs carry the *content* output of each step. Both are delivered via Server-Sent Events, but they serve different purposes and can be consumed independently. A lightweight dashboard that only needs to show run status can subscribe to events alone without the bandwidth cost of full log delivery.

## Acceptance Criteria

### Definition of Done

- [ ] The server exposes a dedicated SSE endpoint for workflow run status events at `GET /api/repos/:owner/:repo/workflows/runs/:id/events`
- [ ] The endpoint delivers `status` events whenever the run or any step transitions state
- [ ] The endpoint delivers a terminal `done` event when the run reaches a final state (completed, failed, cancelled)
- [ ] On connection, the endpoint sends an initial `status` event containing the current run state and all step states
- [ ] For runs already in a terminal state, the endpoint sends the initial `status` event followed by a `done` event and then closes the connection (static response, no persistent SSE)
- [ ] The event stream is also available as part of the combined logs+events endpoint at `GET /api/repos/:owner/:repo/runs/:id/logs` (multi-channel subscription)
- [ ] The CLI `workflow watch` command consumes the event stream and prints human-readable status updates to stderr
- [ ] The CLI exits with code 0 on a `done` event and returns structured event data for `--json` output
- [ ] The web UI workflow run detail page consumes the event stream to update status badges, step states, and timing in real time without page refresh
- [ ] The TUI workflow run detail screen consumes the event stream to update step selector badges and run metadata in real time
- [ ] Keep-alive comments (`: keep-alive\n\n`) are sent every 15 seconds to prevent proxy/firewall connection drops
- [ ] The stream uses the standard SSE wire format: `event:`, `data:`, `id:` fields terminated by double newline
- [ ] Event payloads are valid JSON
- [ ] The stream is backed by PostgreSQL LISTEN/NOTIFY on the `workflow_run_events_{runId}` channel
- [ ] Multiple concurrent subscribers to the same run receive independent streams
- [ ] Client disconnection cleans up the subscriber and, if no remaining subscribers exist for the channel, unsubscribes from PostgreSQL LISTEN

### Event Format Constraints

- [ ] The `status` event `data` field contains a JSON object with `run` (full run metadata) and `steps` (array of step metadata objects)
- [ ] Each step object in the `steps` array includes: `id`, `workflow_run_id`, `name`, `position`, `status`, `started_at`, `completed_at`, `created_at`, `updated_at`
- [ ] The `done` event `data` field contains the same structure as the `status` event, reflecting final state
- [ ] The `run` object includes at minimum: `id`, `status`, `workflow_definition_id`, `trigger_event`, `trigger_ref`, `started_at`, `completed_at`
- [ ] Run status values are one of: `queued`, `pending`, `running`, `completed`, `failed`, `cancelled`
- [ ] Step status values are one of: `pending`, `running`, `completed`, `failed`, `cancelled`, `skipped`

### Edge Cases

- [ ] Invalid run ID (non-numeric, zero, negative) returns 400 with message "invalid run id"
- [ ] Run ID that does not exist returns 404 with message "workflow run not found"
- [ ] Run ID that belongs to a different repository returns 404 (repository-scoped)
- [ ] Run IDs up to 64-bit integer range are handled correctly
- [ ] Malformed SSE payloads from PostgreSQL NOTIFY are silently discarded — the subscriber stream continues
- [ ] If the SSEManager fails to LISTEN on PostgreSQL (e.g., PGLite degraded mode), the subscriber still receives the initial status event and keep-alive pings but no live updates
- [ ] If a run is deleted while clients are connected, subsequent status events stop arriving and clients rely on their own timeout/reconnection logic
- [ ] Concurrent subscriptions from the same user to the same run are independently managed
- [ ] Extremely rapid status transitions (multiple steps completing within milliseconds) are each delivered as separate events in order
- [ ] Empty step arrays (run with no steps yet) produce a valid status payload with `steps: []`
- [ ] A run that transitions directly from `queued` to `cancelled` (without ever running) emits a single status event followed by done

### Boundary Constraints

- [ ] Run ID maximum: 2^63 - 1 (PostgreSQL bigint)
- [ ] Owner name maximum: 255 characters (URL path segment)
- [ ] Repository name maximum: 255 characters (URL path segment)
- [ ] Status event payload maximum: no hard server-side limit, but runs with >100 steps should produce payloads under 1MB
- [ ] Step names maximum: 128 characters (stored in DB, truncated by clients for display)
- [ ] Keep-alive interval: exactly 15,000ms
- [ ] SSE response content type: exactly `text/event-stream`
- [ ] SSE response cache control: exactly `no-cache`
- [ ] SSE response connection header: exactly `keep-alive`

## Design

### API Shape

#### Status-Only Event Stream

```
GET /api/repos/:owner/:repo/workflows/runs/:id/events
Accept: text/event-stream
Authorization: token <PAT>  |  Cookie: session=<cookie>
```

**Response** (200, `text/event-stream`):

```
event: status
data: {"run":{"id":142,"status":"running",...},"steps":[{"id":1,"name":"setup","status":"completed",...},{"id":2,"name":"build","status":"running",...}]}

: keep-alive

event: status
data: {"run":{"id":142,"status":"running",...},"steps":[{"id":1,"name":"setup","status":"completed",...},{"id":2,"name":"build","status":"completed",...},{"id":3,"name":"test","status":"running",...}]}

event: done
data: {"run":{"id":142,"status":"completed",...},"steps":[...]}
```

**Error Responses**:
- `400` — Invalid run ID
- `401` — Authentication required
- `403` — Insufficient permissions for private repository
- `404` — Run or repository not found
- `429` — Rate limit exceeded (include `Retry-After` header)

#### Combined Logs + Events Stream

```
GET /api/repos/:owner/:repo/runs/:id/logs
Accept: text/event-stream
Authorization: token <PAT>  |  Cookie: session=<cookie>
Last-Event-ID: <optional, for reconnection replay>
```

This endpoint subscribes to both `workflow_run_events_{runId}` and `workflow_step_logs_{stepId}` channels. Status events arrive with `event: workflow_run_events_{runId}` (the channel name) and log events with `event: workflow_step_logs_{stepId}`. The `Last-Event-ID` header triggers replay of up to 1,000 missed log lines.

### Web UI Design

The workflow run detail page (`/:owner/:repo/workflows/runs/:id`) subscribes to the event stream on mount. The UI should:

1. **Run status badge**: Updates color and text in real time (blue spinner for running, green checkmark for completed, red X for failed, gray dash for cancelled).
2. **Step list**: Each step row shows a status indicator that transitions live. Running steps display an animated spinner. Completed steps show duration.
3. **Elapsed timer**: For running workflows, a live-ticking elapsed time display. Freezes on completion.
4. **No manual refresh**: The page never requires user-initiated refresh to reflect current state.
5. **Terminal state behavior**: If the run is already terminal when the page loads, render the final state immediately from the static SSE response.
6. **Connection resilience**: If the EventSource connection drops, the UI should attempt reconnection with backoff. A subtle connection indicator (not disruptive) can show degraded state.

### CLI Command

```
codeplane workflow watch <run-id> [--repo OWNER/REPO] [--json]
```

**Behavior**:
- Fetches current run state via REST first
- If run is terminal, prints final status to stderr and returns
- If run is active, connects to `GET /api/repos/:owner/:repo/runs/:id/logs` via SSE
- Prints status transitions to stderr as human-readable lines: `Status: running (step build)`
- Prints `done` event as: `Run completed: completed`
- Exits when `done` event is received
- With `--json`, returns structured array of all events to stdout

```
codeplane run watch <run-id> [--repo OWNER/REPO] [--json]
```

Alias: same behavior available under both `workflow watch` and `run watch`.

### TUI UI

The workflow run detail screen consumes the event stream via the `useWorkflowLogStream` hook (which subscribes to the combined logs+events endpoint). Status events update:

- The step selector bar badges (⠹ spinner → ✓ checkmark / ✗ X)
- The run status in the status bar
- The elapsed time display
- Step `started_at` / `completed_at` timestamps used for duration display

The `done` event transitions the entire screen to terminal state: auto-follow disables, timer freezes, status badge finalizes.

### SDK Shape

The SSE infrastructure lives in `@codeplane/sdk`:

- **`SSEManager.subscribe(channel, options?)`**: Returns `ReadableStream<string>` for single-channel subscription. Used by the `/events` endpoint.
- **`SSEManager.subscribeMulti(channels[], options?)`**: Returns `ReadableStream<string>` for multi-channel subscription. Used by the `/logs` endpoint.
- **`sseResponse(stream)`**: Wraps a stream in a proper SSE `Response` with headers.
- **`sseStaticResponse(events[])`**: Creates a one-shot SSE response for terminal states.
- **`sseStreamWithInitial(initialEvents[], liveStream)`**: Prepends initial events to a live stream.
- **`formatSSEEvent(event)`**: Serializes an `SSEEvent` to wire format.
- **`notifyWorkflowRunEvent(sql, { runId, payload })`**: Emits a PostgreSQL NOTIFY on `workflow_run_events_{runId}`.

### Documentation

End-user documentation should cover:

1. **API Reference — SSE Endpoints**: Document both the `/events` and `/logs` endpoints, including authentication, event types, payload schemas, keep-alive behavior, and reconnection patterns.
2. **CLI Reference — `workflow watch`**: Document the command, its flags, human-readable output format, and `--json` structure.
3. **Guides — Monitoring Workflow Runs**: A user guide explaining how to watch workflows in real time from the web UI, CLI, and TUI, including tips on reconnection and the difference between the events-only and combined logs+events streams.
4. **SDK Reference — SSE Integration**: For users building custom integrations, document how to consume the SSE stream programmatically using `fetch` or `EventSource`.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| Subscribe to event stream (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subscribe to event stream (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |

- The event stream respects repository visibility. Private repository runs are not accessible to unauthenticated users or users without at least read access.
- Repository-scoped authorization is checked at connection establishment time. The `:owner/:repo` path segments are validated against the run's actual repository ownership.
- Authentication is performed via session cookie or `Authorization: token <PAT>` header.
- SSE ticket-based authentication (short-lived token exchange) is designed for TUI/programmatic clients but is not yet fully implemented. When implemented, tickets will be single-use, SHA-256 hashed at rest, and expire after 30 seconds.

### Rate Limiting

| Resource | Limit | Window |
|----------|-------|--------|
| SSE connections per user | 5 concurrent | — |
| SSE event endpoint requests per user | 60 | per minute |
| SSE ticket issuance per user | 10 | per minute |

- `429 Too Many Requests` responses include a `Retry-After` header.
- Rate limits are enforced at the auth-context level (user ID for authenticated requests).
- Anonymous access to public repo event streams is rate-limited by IP address.

### Data Privacy

- Event payloads contain workflow metadata (run IDs, step names, statuses, timestamps) but **never** contain log content, secret values, or environment variables.
- Step names are user-defined and may contain project-internal naming conventions, but are not classified as PII.
- The run's `trigger_ref` field may contain bookmark/branch names. These are considered repository metadata, not PII.
- PostgreSQL NOTIFY payloads transit within the database server and are not externally routable.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|-----------|---------|------------|
| `workflow_run_event_stream.connected` | Client successfully establishes SSE connection | `repo_id`, `run_id`, `client_type` (web/cli/tui), `is_terminal_run`, `step_count`, `connection_time_ms` |
| `workflow_run_event_stream.status_delivered` | A `status` event is pushed to a subscriber | `repo_id`, `run_id`, `run_status`, `subscriber_count`, `source` (workflow.resume, runner.complete_task) |
| `workflow_run_event_stream.done_delivered` | A `done` event is pushed to a subscriber | `repo_id`, `run_id`, `final_status`, `total_duration_ms`, `step_count`, `subscriber_count` |
| `workflow_run_event_stream.disconnected` | Client disconnects (clean or unclean) | `repo_id`, `run_id`, `client_type`, `connected_duration_ms`, `events_delivered`, `disconnect_reason` |
| `workflow_run_event_stream.static_served` | Terminal run served as static SSE response | `repo_id`, `run_id`, `final_status`, `step_count` |
| `workflow_run_event_stream.replay_triggered` | Last-Event-ID replay performed on combined endpoint | `repo_id`, `run_id`, `last_event_id`, `replayed_count` |

### Common Properties (All Events)

`request_id`, `timestamp`, `user_id` (if authenticated), `auth_method` (cookie/token/ticket)

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Event delivery latency (NOTIFY → SSE push) | P95 < 100ms | Live status should feel instant |
| Connection success rate | ≥ 99.5% | Connections should almost never fail to establish |
| Subscriber count per active run | Mean > 1.5 | Indicates multi-client usage (web + CLI) |
| Static response ratio for terminal runs | Tracks naturally | Higher ratio = efficient resource use (no long-lived connections for finished runs) |
| `done` event delivery rate | 100% of non-abandoned connections | Every watcher should see the final state |

## Observability

### Logging Requirements

| Log Level | Event | Structured Context |
|-----------|-------|--------------------|
| `debug` | SSE subscriber registered for workflow run | `{ channel, run_id, subscriber_count }` |
| `debug` | Status event broadcast to subscribers | `{ channel, run_id, subscriber_count, source }` |
| `debug` | Keep-alive ping sent | `{ channel, subscriber_count }` |
| `debug` | Subscriber removed on disconnect | `{ channel, run_id, remaining_subscribers }` |
| `info` | SSE connection established for workflow run events | `{ request_id, run_id, repo_id, user_id, is_terminal }` |
| `info` | Run reached terminal state, done event dispatched | `{ run_id, final_status, total_events_delivered, connection_duration_ms }` |
| `info` | Last-Event-ID replay performed | `{ run_id, last_event_id, replayed_count }` |
| `warn` | PostgreSQL LISTEN failed for channel | `{ channel, error_message }` |
| `warn` | Malformed NOTIFY payload discarded | `{ channel, raw_payload_length, parse_error }` |
| `warn` | Subscriber enqueue failed (controller closed) | `{ channel, run_id }` |
| `error` | SSEManager.ensureListening threw unexpected error | `{ channel, error }` |
| `error` | Broadcast failed for all subscribers on channel | `{ channel, subscriber_count, error }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_sse_connections_active` | Gauge | `channel_prefix=workflow_run_events` | Number of active SSE connections for workflow run events |
| `codeplane_sse_connections_total` | Counter | `channel_prefix`, `status` (established/rejected/error) | Total SSE connection attempts |
| `codeplane_sse_events_delivered_total` | Counter | `channel_prefix`, `event_type` (status/done) | Total events delivered to subscribers |
| `codeplane_sse_event_delivery_duration_seconds` | Histogram | `channel_prefix`, `event_type` | Time from NOTIFY receipt to subscriber enqueue |
| `codeplane_sse_keepalive_sent_total` | Counter | `channel_prefix` | Total keep-alive pings sent |
| `codeplane_sse_subscribers_per_channel` | Histogram | `channel_prefix` | Distribution of subscriber counts per channel |
| `codeplane_sse_static_responses_total` | Counter | `channel_prefix` | Terminal-state SSE static responses |
| `codeplane_sse_replay_lines_total` | Counter | — | Total Last-Event-ID replay lines served |
| `codeplane_workflow_notify_total` | Counter | `source` (workflow.resume, runner.complete_task) | Total pg_notify calls for workflow run events |
| `codeplane_workflow_notify_duration_seconds` | Histogram | `source` | Duration of pg_notify SQL execution |

### Alerts

#### Alert: `SSEConnectionsHigh`
- **Condition**: `codeplane_sse_connections_active{channel_prefix="workflow_run_events"} > 500` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check if a large number of workflow runs are active simultaneously (`SELECT count(*) FROM workflow_runs WHERE status = 'running'`).
  2. Check if individual runs have excessive subscribers (`codeplane_sse_subscribers_per_channel` histogram).
  3. If subscriber counts per channel are abnormally high, check for client-side reconnection loops (misconfigured EventSource with no backoff).
  4. If total active runs justify the connection count, consider scaling connection limits or introducing connection pooling at the reverse proxy layer.
  5. Monitor PostgreSQL connection count — each unique LISTEN channel uses one PG connection.

#### Alert: `SSEEventDeliveryLatencyHigh`
- **Condition**: `histogram_quantile(0.95, codeplane_sse_event_delivery_duration_seconds{channel_prefix="workflow_run_events"}) > 0.5` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check PostgreSQL NOTIFY queue depth and replication lag.
  2. Check Node.js event loop latency — high GC pressure or blocking operations can delay broadcast.
  3. Examine `codeplane_sse_subscribers_per_channel` — channels with many subscribers take longer to fan out.
  4. Profile the `broadcast()` method — JSON.parse of each NOTIFY payload and per-subscriber filter evaluation are the main CPU costs.
  5. If latency is localized to specific channels, check those run IDs for unusual step counts.

#### Alert: `SSEEventDeliveryFailures`
- **Condition**: `rate(codeplane_sse_connections_total{status="error"}[5m]) > 0.1` (more than 1 failure per 10 minutes)
- **Severity**: Critical
- **Runbook**:
  1. Check server error logs for `SSEManager.ensureListening` failures — this indicates PostgreSQL LISTEN is broken.
  2. Verify PostgreSQL is accepting connections and responding to LISTEN/NOTIFY.
  3. Check if the PG connection pool is exhausted.
  4. If running in PGLite mode, LISTEN/NOTIFY is degraded by design — this alert should be suppressed for daemon deployments.
  5. Restart the server process if PG connection state is corrupted.

#### Alert: `WorkflowNotifyFailures`
- **Condition**: `rate(codeplane_workflow_notify_duration_seconds_count[5m]) > 0 AND rate(codeplane_workflow_notify_total[5m]) == 0` (notify calls happening but no successful deliveries)
- **Severity**: Critical
- **Runbook**:
  1. Check workflow service logs for `notifyWorkflowRunEvent` SQL errors.
  2. Verify the `pg_notify` function is accessible (permissions, search path).
  3. Check if the NOTIFY payload exceeds PostgreSQL's 8000-byte limit — this would silently fail.
  4. Manually test with `SELECT pg_notify('workflow_run_events_1', '{"test":true}')` to isolate.
  5. If payloads are too large, the workflow service needs to reduce payload size or switch to a reference-based notification pattern.

#### Alert: `SSENoSubscribers`
- **Condition**: `codeplane_sse_connections_active{channel_prefix="workflow_run_events"} == 0` for 30 minutes during business hours AND active workflow runs exist
- **Severity**: Info
- **Runbook**:
  1. This is informational — it indicates no one is watching active runs, which may be normal.
  2. Check if the web UI SSE connection logic is broken (client-side JS errors).
  3. Check if a reverse proxy is terminating SSE connections prematurely (common with nginx default `proxy_read_timeout`).
  4. Verify SSE endpoint is responding with correct `Content-Type: text/event-stream` header.

### Error Cases and Failure Modes

| Error Case | Detection | Impact | Recovery |
|-----------|-----------|--------|----------|
| PostgreSQL LISTEN fails | `warn` log + connection error | No live events; initial status + keep-alive only | Auto-retry on next subscriber; manual server restart if persistent |
| NOTIFY payload exceeds 8KB | Silent PG failure | Event not delivered to any subscriber | Reduce payload size in `notifyWorkflowRunEvent` |
| Subscriber controller closed | `warn` log, subscriber marked `closed` | Individual client stops receiving | Client reconnects via EventSource |
| All subscribers closed, unlisten fails | `warn` log (best-effort cleanup) | Orphaned PG LISTEN subscription | Cleaned up on next channel interaction or server restart |
| Server shutdown during active streams | Graceful: SSEManager.stop() closes all | All clients disconnected simultaneously | Clients reconnect to restarted server |
| Database connection pool exhaustion | PG connection errors | New LISTEN subscriptions fail | Scale pool, reduce concurrent channels, alert on pool utilization |
| Run deleted during active stream | No more NOTIFY events | Stream goes silent (keep-alive continues) | Client timeout + reconnection → 404 on refetch |

## Verification

### API Integration Tests (`e2e/api/workflow-events.test.ts`)

#### Connection Lifecycle (8 tests)
- **EVT-API-001**: `GET /events` for an active run returns 200 with `Content-Type: text/event-stream`
- **EVT-API-002**: `GET /events` for an active run sends an initial `status` event as the first data
- **EVT-API-003**: `GET /events` for a terminal run returns static response (status + done, then connection closes)
- **EVT-API-004**: `GET /events` with invalid run ID returns 400
- **EVT-API-005**: `GET /events` with nonexistent run ID returns 404
- **EVT-API-006**: `GET /events` for private repo without auth returns 401
- **EVT-API-007**: `GET /events` for private repo with read-only token succeeds
- **EVT-API-008**: `GET /events` for a run belonging to a different repository returns 404

#### Event Delivery (7 tests)
- **EVT-API-009**: Dispatching a workflow and subscribing to events receives `status` events as steps transition
- **EVT-API-010**: A `done` event is received when the run reaches `completed` status
- **EVT-API-011**: A `done` event is received when the run reaches `failed` status
- **EVT-API-012**: A `done` event is received when the run is cancelled
- **EVT-API-013**: The `status` event payload contains `run` and `steps` fields with correct schema
- **EVT-API-014**: Each step object in the status payload contains `id`, `name`, `position`, `status`, `started_at`, `completed_at`
- **EVT-API-015**: Multiple concurrent subscribers to the same run each receive the same events independently

#### Keep-Alive and Connection Management (5 tests)
- **EVT-API-016**: A keep-alive comment is received within 20 seconds of connection (15s interval + tolerance)
- **EVT-API-017**: Client disconnection causes server-side subscriber cleanup (verify via metrics or internal state)
- **EVT-API-018**: SSE response headers include `Cache-Control: no-cache` and `Connection: keep-alive`
- **EVT-API-019**: Subscribing to a run with 0 steps returns a valid status payload with `steps: []`
- **EVT-API-020**: Subscribing to a run with 50+ steps returns a valid status payload within response size limits

#### Combined Endpoint Event Delivery (5 tests)
- **EVT-API-021**: `GET /runs/:id/logs` delivers both `log` events and status events from `workflow_run_events_{runId}` channel
- **EVT-API-022**: `GET /runs/:id/logs` with `Last-Event-ID` header replays missed log events
- **EVT-API-023**: `GET /runs/:id/logs` replays at most 1,000 log lines on reconnection
- **EVT-API-024**: `GET /runs/:id/logs` for a terminal run returns all logs + status + done as static response
- **EVT-API-025**: `GET /runs/:id/logs` status events have the channel name as SSE event type (multi-channel distinction)

#### Boundary and Edge Cases (7 tests)
- **EVT-API-026**: Run ID at maximum valid int64 boundary is accepted
- **EVT-API-027**: Run ID exceeding int64 range returns 400
- **EVT-API-028**: Run ID of 0 returns 400
- **EVT-API-029**: Run ID of -1 returns 400
- **EVT-API-030**: Rapid status transitions (step completes, next step starts within 10ms) are delivered as separate ordered events
- **EVT-API-031**: Run with a step name of exactly 128 characters is represented correctly in event payload
- **EVT-API-032**: Event stream connection to run with `queued` status receives events when run transitions to `running`

### CLI Integration Tests (`e2e/cli/workflow-watch.test.ts`)

#### Watch Command (8 tests)
- **EVT-CLI-001**: `codeplane workflow watch <id>` prints status updates to stderr for an active run
- **EVT-CLI-002**: `codeplane workflow watch <id>` exits with code 0 when run completes successfully
- **EVT-CLI-003**: `codeplane workflow watch <id>` for a terminal run prints final status and exits immediately
- **EVT-CLI-004**: `codeplane workflow watch <id> --json` outputs structured event array to stdout
- **EVT-CLI-005**: `codeplane workflow watch <id>` with invalid ID prints error to stderr and exits non-zero
- **EVT-CLI-006**: `codeplane run watch <id>` (alias) behaves identically to `workflow watch`
- **EVT-CLI-007**: `codeplane workflow watch <id> --repo owner/repo` resolves repo from flag
- **EVT-CLI-008**: `codeplane workflow watch <id>` handles `done` event with `failed` status and exits

### Web UI E2E Tests (`e2e/ui/workflow-run-detail.test.ts`)

#### Real-Time Status Updates (7 tests)
- **EVT-UI-001**: Workflow run detail page shows live-updating run status badge
- **EVT-UI-002**: Step status badges transition from pending → running → completed in real time
- **EVT-UI-003**: Elapsed time display ticks live for running workflows
- **EVT-UI-004**: Elapsed time display freezes when the run completes
- **EVT-UI-005**: Terminal run detail page renders final state without SSE connection (static load)
- **EVT-UI-006**: Failed step shows failure badge and error styling immediately on status event
- **EVT-UI-007**: Page does not require manual refresh to reflect state changes

#### Connection Resilience (4 tests)
- **EVT-UI-008**: Page reconnects to SSE stream after simulated network disruption
- **EVT-UI-009**: Connection status indicator shows degraded state during reconnection
- **EVT-UI-010**: Reconnected page shows correct current state (no stale data)
- **EVT-UI-011**: Navigation away from page cleans up SSE connection (no leaked connections)

### TUI Integration Tests (`e2e/tui/workflow-events.test.ts`)

#### Event-Driven UI Updates (6 tests)
- **EVT-TUI-001**: Step selector badges update in real time from SSE status events
- **EVT-TUI-002**: Run status in status bar updates from SSE status events
- **EVT-TUI-003**: `done` event disables auto-follow and freezes timer
- **EVT-TUI-004**: Connection health indicator shows green during active SSE connection
- **EVT-TUI-005**: Connection health indicator shows yellow during reconnection
- **EVT-TUI-006**: Connection health indicator shows red after max reconnection attempts

### SSE Infrastructure Tests (`e2e/api/sse-infrastructure.test.ts`)

#### SSEManager Behavior (6 tests)
- **EVT-SSE-001**: `subscribe()` returns a ReadableStream with correct SSE format
- **EVT-SSE-002**: `subscribeMulti()` sets event type to channel name for each event
- **EVT-SSE-003**: Multiple subscribers on the same channel each receive broadcasts independently
- **EVT-SSE-004**: Subscriber removal triggers PG UNLISTEN when last subscriber disconnects
- **EVT-SSE-005**: `sseStaticResponse()` returns all events and closes the connection
- **EVT-SSE-006**: `sseStreamWithInitial()` delivers initial events before live stream data

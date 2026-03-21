# WORKSPACE_SESSION_STATUS_STREAM

Specification for WORKSPACE_SESSION_STATUS_STREAM.

## High-Level User POV

When a user creates a workspace session in Codeplane — whether from the web UI, CLI, TUI, or an editor — they need to know what is happening to that session in real time. A workspace session represents an active terminal or agent connection to a running workspace container, and its status can change at any moment: it may finish provisioning and transition to running, it may be destroyed by the user or an automation, or it may fail due to an infrastructure issue.

The Workspace Session Status Stream gives users a live, push-based view of these status transitions. Instead of repeatedly refreshing a page or polling an endpoint to check whether a session is ready, the user opens a single persistent connection and receives instant updates as the session moves through its lifecycle. The moment a session starts running, the user's UI updates — a badge turns green, a spinner resolves, or the CLI prints a status line. If a session fails, the user is told immediately rather than discovering it on the next manual check.

This capability is foundational for several critical Codeplane workflows. When the CLI creates a workspace session and then waits for SSH readiness, the status stream allows it to react to the "running" signal without wasteful polling. When the web UI displays a workspace detail view with active sessions, each session's badge updates live as sessions come and go. When the TUI shows a workspace detail screen, the status column reflects the ground truth in real time. When an agent automation creates a session to execute a task, the orchestrator watches the stream to know when the session is ready for work or when it has failed and needs retry.

The stream always begins by sending the current session status so the client immediately knows the present state, then continues to push subsequent transitions as they occur. This initial-plus-live pattern means clients never have a "blind spot" between fetching the session and subscribing to its updates.

## Acceptance Criteria

### Definition of Done

- A client can open an SSE connection to the session status stream endpoint and receive the current session status as the first event, followed by all subsequent status transitions in real time.
- The stream works for all three valid session statuses: `running`, `stopped`, and `failed`.
- The stream is consumed correctly by at least the API layer, CLI `workspace watch` flow, web UI workspace session views, and TUI workspace detail screen.
- The endpoint enforces authentication and authorization (session owner or repository admin).
- The stream degrades gracefully when PostgreSQL LISTEN/NOTIFY is unavailable (e.g., PGLite daemon mode) — clients receive the initial status event and keep-alive pings but no live updates.
- All status transitions triggered by the workspace service (create, destroy, SSH info fetch, failure) are broadcast to connected stream subscribers.
- Documentation is updated to describe the endpoint, its event format, and reconnection behavior.

### Functional Constraints

- The SSE endpoint **must** return an initial event containing the current session status before any live events, so the client never starts in an unknown state.
- The SSE event type **must** be `workspace.session` for all events on this stream.
- The SSE data payload **must** be a JSON object with exactly `{ "session_id": "<uuid>", "status": "<status>" }`.
- Valid session status values are strictly: `running`, `stopped`, `failed`. No other values may appear.
- The session ID in the URL path **must** be a valid UUID. Non-UUID values must return `400 Bad Request`.
- If the session does not exist or the user does not have access, the endpoint **must** return `404 Not Found` (not an empty stream).
- The stream **must** send SSE keep-alive comments (`: keep-alive\n\n`) at a 15-second interval to prevent proxy/load-balancer timeouts and detect dead clients.
- If the session is already in a terminal state (`stopped` or `failed`) when the stream is opened, the endpoint **should** still return the initial status event. It may optionally close the stream after delivering it.
- The PostgreSQL NOTIFY channel name **must** follow the pattern `workspace_status_{session_id_without_dashes}` (UUID with dashes removed, alphanumeric only).
- Channel names **must** be validated against `^[a-zA-Z0-9_]+$` to prevent injection.
- Multiple concurrent subscribers to the same session stream **must** each receive all events independently.
- When the last subscriber disconnects from a channel, the server **must** release the underlying PostgreSQL LISTEN connection for that channel.
- The endpoint **must not** buffer events — each status change must be flushed to the client immediately.

### Edge Cases

- **Session destroyed during stream**: If a session is destroyed while a client is connected, the client must receive a `{ "session_id": "...", "status": "stopped" }` event. The stream may remain open for additional events or close — both are acceptable.
- **Rapid status transitions**: If a session transitions through multiple states quickly (e.g., creation → running → failed), the client must receive each intermediate event in order. Events must not be coalesced or dropped.
- **Client reconnects with Last-Event-ID**: The endpoint does not currently support replay from Last-Event-ID. On reconnect, the client receives the current status as a fresh initial event. This is acceptable because the status is a single latest-value, not a log.
- **Empty session ID**: A request with an empty or whitespace-only `:id` parameter must return `400 Bad Request`.
- **Non-existent session ID**: A valid UUID that does not correspond to any session must return `404 Not Found`.
- **Concurrent streams for same session**: Multiple clients (or the same client with multiple connections) must all receive events independently.
- **Server shutdown during stream**: On SIGINT/SIGTERM, the server must cleanly close all SSE streams. Clients should detect the close and may attempt reconnection.
- **PGLite / daemon mode**: When running with PGLite (which may not support LISTEN/NOTIFY), the stream must still return the initial event and keep-alive pings. Live updates may not be delivered. This is a documented limitation.

### Boundary Constraints

- Session ID: Must be a valid UUID v4 string (36 characters including dashes). Maximum 36 characters.
- Owner path parameter: Maximum 255 characters, alphanumeric plus hyphens.
- Repo path parameter: Maximum 255 characters, alphanumeric plus hyphens and dots.
- Maximum concurrent SSE connections per session: No hard limit enforced, but rate limiting on connection establishment applies.
- Keep-alive interval: Fixed at 15 seconds. Not configurable by the client.
- SSE event ID field: Set to `"1"` for the initial event. Live events from PG NOTIFY do not include an event ID.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream`

**Authentication**: Required. Session cookie, PAT `Authorization: token <pat>`, or SSE ticket query parameter `?ticket=<ticket>`.

**Content-Type**: `text/event-stream`

**Cache-Control**: `no-cache`

**Connection**: `keep-alive`

**Response**: A persistent SSE stream.

#### Initial Event (sent immediately on connection)

```
id: 1
event: workspace.session
data: {"session_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","status":"running"}

```

#### Live Status Event (sent on each status transition)

```
event: workspace.session
data: {"session_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","status":"stopped"}

```

#### Keep-Alive (sent every 15 seconds)

```
: keep-alive

```

#### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{"message":"session id is required"}` | Missing or empty `:id` param |
| 401 | `{"message":"unauthorized"}` | No valid auth credentials |
| 403 | `{"message":"forbidden"}` | User lacks access to this session |
| 404 | `{"message":"workspace session not found"}` | Session does not exist or user cannot see it |

### SDK Shape

The `@codeplane/sdk` package exposes the following relevant types and utilities:

```typescript
// SSE event type used on the wire
interface SSEEvent {
  type?: string;   // "workspace.session"
  data: string;    // JSON payload
  id?: string;     // Event ID (optional)
}

// Typed payload for session status events
interface WorkspaceSessionStatusEvent {
  session_id: string;
  status: "running" | "stopped" | "failed";
}

// SSE stream helpers
function sseResponse(stream: ReadableStream<string>): Response;
function sseStreamWithInitial(initial: SSEEvent[], live: ReadableStream<string>): ReadableStream<string>;
```

The `SSEManager.subscribe(channel, options)` method is used server-side to create a `ReadableStream<string>` subscribed to the PostgreSQL NOTIFY channel. The channel name is derived as `workspace_status_${sessionId.replace(/-/g, '')}`.

### Web UI Design

**Workspace Detail View** — When the web UI displays a workspace's active sessions, each session row should show a live status badge. The badge subscribes to the session status stream and updates in place as events arrive.

- **Status badge colors**: `running` → green, `stopped` → gray, `failed` → red.
- **Transitional states**: If the UI detects a session was just created and is not yet `running`, it should show a yellow spinner badge until the first `running` event arrives.
- **Disconnection handling**: If the SSE connection drops, the UI should show a subtle "reconnecting" indicator on the badge and attempt exponential backoff reconnection (1s initial, 30s max, 20 max attempts).
- **Terminal states**: When `stopped` or `failed` is received, the badge updates and the SSE connection may be closed to conserve resources.

**Workspace Session Terminal** — If the user has an active terminal connected to a session, the terminal view should subscribe to the session status stream. On `failed` or `stopped`, the terminal should display a banner: "Session ended" with the final status.

### CLI Command

**`codeplane workspace watch <id>`** — The existing workspace watch command connects to the workspace status stream. The session status stream follows an identical pattern for session-scoped watching.

The CLI creates a session via `workspace create`, then may internally subscribe to the session's stream to detect the `running` transition before proceeding to SSH. Currently the CLI uses polling for SSH readiness; the session status stream provides an event-driven alternative.

**Stream output format** (human-readable on stderr):

```
Watching session a1b2c3d4-... (status: running)...
Status: running
Status: stopped
```

**JSON output** (when `--json` is used): Events are collected and returned as an array:

```json
{
  "events": [
    { "type": "workspace.session", "data": { "session_id": "...", "status": "running" } },
    { "type": "workspace.session", "data": { "session_id": "...", "status": "stopped" } }
  ]
}
```

### TUI UI

**Workspace Detail Screen** — The TUI workspace detail screen should display session rows with live status badges. Each badge follows the `WorkspaceStatusBadge` component's visual mapping:

| Status | Color Token | Animated | Label |
|--------|-------------|----------|-------|
| running | success (green) | No | "Running" |
| stopped | muted (gray) | No | "Stopped" |
| failed | error (red) | No | "Failed" |

**SSE Provider Integration** — The TUI's `SSEProvider` should be wired to subscribe to `workspace_status_{sessionId}` channels. The `useSSE(channel, callback)` hook receives parsed `WorkspaceSessionStatusEvent` payloads and updates the session status in the local store.

### Editor Integrations (VS Code, Neovim)

**VS Code** — The workspace session panel in VS Code should use the session status stream to update session status indicators in the sidebar tree view. When a session transitions to `running`, the status bar item should update accordingly. When a session transitions to `stopped` or `failed`, the tree item should reflect the terminal state.

**Neovim** — The Neovim plugin's `:Codeplane workspace` command should surface session status via the daemon. The daemon itself subscribes to session streams and exposes status via its local API, so the Neovim plugin does not need to manage SSE connections directly.

### Documentation

The following documentation should be written for end users:

1. **API Reference: Workspace Session Status Stream** — Document the `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream` endpoint with full SSE event format, authentication requirements, and example `curl` usage.
2. **Guide: Monitoring Workspace Sessions** — A how-to guide explaining how to use the status stream from the web UI, CLI, and TUI to monitor session lifecycle.
3. **Reconnection Behavior** — Document that clients should implement exponential backoff reconnection (1s → 30s max, 20 attempts max) and that on reconnect, the current status is re-sent as the initial event.
4. **Known Limitations** — Document that PGLite/daemon mode may not deliver live updates, and that Last-Event-ID replay is not supported.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Session owner** (user who created the session) | Full access to stream |
| **Repository Admin** | Full access to stream for any session in the repository |
| **Repository Write member** | Full access to stream for any session in the repository |
| **Repository Read member** | Read access to stream for any session in the repository |
| **Anonymous / unauthenticated** | No access. Returns 401. |
| **Authenticated user without repository access** | No access. Returns 404 (to avoid information leakage). |

### Authentication Methods

- **Session cookie**: Standard browser-based authentication.
- **Personal Access Token**: `Authorization: token <pat>` header.
- **SSE ticket**: Query parameter `?ticket=<ticket>` for situations where the browser's `EventSource` API cannot set custom headers. Tickets are short-lived (5 minutes) and single-use.

### Rate Limiting

- **Connection establishment**: Rate-limited to 30 new SSE connections per minute per user per repository. This prevents a single user from exhausting server-side connection resources.
- **Per-session concurrent connections**: Soft limit of 10 concurrent SSE connections per session. Beyond this, new connections receive `429 Too Many Requests`.
- **Global SSE connection limit**: The server enforces a global maximum of active SSE connections (configurable, default 10,000). When the limit is reached, new connections receive `503 Service Unavailable`.

### Data Privacy

- The stream payload contains only the session ID and its status string. No PII (usernames, emails, IP addresses) is included in the SSE event data.
- Session IDs are UUIDs, which are not guessable. Combined with mandatory authentication, this prevents enumeration attacks.
- The PostgreSQL NOTIFY channel name is derived from the session UUID and does not contain user-identifiable information.
- SSE connections are scoped to a single session; subscribing to one session does not reveal information about other sessions in the repository.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `WorkspaceSessionStreamOpened` | Client successfully establishes SSE connection | `session_id`, `user_id`, `repository_id`, `client_type` (web/cli/tui/editor), `initial_status` |
| `WorkspaceSessionStreamClosed` | SSE connection terminates (client or server initiated) | `session_id`, `user_id`, `duration_seconds`, `events_received_count`, `close_reason` (client_disconnect, server_shutdown, error) |
| `WorkspaceSessionStreamReconnected` | Client reconnects after a dropped connection | `session_id`, `user_id`, `reconnect_attempt_number`, `time_since_disconnect_ms` |
| `WorkspaceSessionStatusTransition` | A status change event is delivered to at least one subscriber | `session_id`, `user_id`, `from_status`, `to_status`, `subscriber_count` |

### Properties Attached to All Events

- `timestamp` (ISO 8601)
- `server_instance_id`
- `deployment_mode` (server / daemon / desktop)

### Funnel Metrics & Success Indicators

- **Stream adoption rate**: Percentage of workspace sessions that have at least one stream subscriber during their lifetime. Target: >80% for web UI sessions.
- **Time-to-first-event**: P50 and P99 latency from SSE connection open to first event delivery. Target: P50 < 100ms, P99 < 500ms.
- **Live update success rate**: Percentage of status transitions that are delivered to at least one connected subscriber within 1 second of the PG NOTIFY. Target: >99%.
- **Polling elimination**: Reduction in `/workspace/sessions/:id` GET requests after stream adoption. Target: >60% reduction.
- **Reconnection success rate**: Percentage of reconnection attempts that succeed. Target: >95%.
- **Mean stream duration**: Average time a client stays connected. Healthy range: 30 seconds to 30 minutes (matching typical session lifecycles).

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| SSE stream opened | `info` | `session_id`, `user_id`, `channel`, `remote_addr` | Client connects successfully |
| SSE stream closed | `info` | `session_id`, `user_id`, `duration_ms`, `events_sent` | Client disconnects |
| SSE stream error | `warn` | `session_id`, `user_id`, `error_message`, `channel` | Stream encounters an error |
| PG LISTEN failure | `warn` | `channel`, `error_message` | Failed to subscribe to PostgreSQL channel |
| PG NOTIFY broadcast | `debug` | `channel`, `subscriber_count`, `payload_size_bytes` | Status change broadcast to subscribers |
| Keep-alive sent | `trace` | `channel`, `subscriber_count` | 15-second ping emitted |
| Channel created | `debug` | `channel` | First subscriber on a new channel |
| Channel released | `debug` | `channel` | Last subscriber disconnected, PG UNLISTEN called |
| Session not found on stream open | `info` | `session_id`, `user_id` | Client attempts to stream non-existent/inaccessible session |
| Rate limit exceeded | `warn` | `user_id`, `remote_addr`, `limit_type` | Connection rate limit hit |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_sse_connections_active` | Gauge | `channel_type=workspace_session` | Currently active SSE connections for session streams |
| `codeplane_sse_connections_total` | Counter | `channel_type=workspace_session`, `result=success\|rejected` | Total SSE connection attempts |
| `codeplane_sse_events_delivered_total` | Counter | `channel_type=workspace_session`, `event_type=workspace.session` | Total events delivered across all subscribers |
| `codeplane_sse_events_broadcast_total` | Counter | `channel_type=workspace_session` | Total PG NOTIFY events received and broadcast |
| `codeplane_sse_keepalive_sent_total` | Counter | `channel_type=workspace_session` | Total keep-alive pings sent |
| `codeplane_sse_connection_duration_seconds` | Histogram | `channel_type=workspace_session` | Duration of SSE connections (buckets: 1s, 5s, 15s, 30s, 60s, 300s, 600s, 1800s) |
| `codeplane_sse_event_delivery_latency_seconds` | Histogram | `channel_type=workspace_session` | Time from PG NOTIFY receipt to SSE event enqueue (buckets: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms) |
| `codeplane_sse_pg_listen_errors_total` | Counter | `channel_type=workspace_session` | PG LISTEN subscription failures |
| `codeplane_sse_channels_active` | Gauge | `channel_type=workspace_session` | Number of active PG LISTEN channels for sessions |
| `codeplane_workspace_session_status_transitions_total` | Counter | `from_status`, `to_status` | Session status transition counter |

### Alerts

#### Alert: SSE Connection Saturation

**Condition**: `codeplane_sse_connections_active{channel_type="workspace_session"} > 0.8 * <configured_max>`

**Severity**: Warning

**Runbook**:
1. Check Grafana dashboard for SSE connection count trend. Determine if this is organic growth or a leak.
2. Run equivalent service introspection to identify which channels have the most subscribers.
3. Check for client-side bugs causing connection leaks (e.g., a UI component that opens streams without closing them).
4. If organic growth, increase `SSE_MAX_CONNECTIONS` in server config and restart.
5. If a leak, identify the offending client version and coordinate a fix.

#### Alert: PG LISTEN Failure Rate Spike

**Condition**: `rate(codeplane_sse_pg_listen_errors_total{channel_type="workspace_session"}[5m]) > 0.1`

**Severity**: Critical

**Runbook**:
1. Check PostgreSQL connection pool status. PG LISTEN/NOTIFY requires a dedicated connection per channel.
2. Verify PostgreSQL is healthy: check `pg_stat_activity` for connection exhaustion.
3. If connections are exhausted, increase `max_connections` in PostgreSQL config or reduce the number of active channels.
4. Check if PGLite mode is accidentally enabled on a server deployment (PGLite does not support LISTEN/NOTIFY).
5. Restart the SSE manager if connections are in a bad state: the `stop()` → `start()` cycle will clean up and re-establish listeners.

#### Alert: Event Delivery Latency Spike

**Condition**: `histogram_quantile(0.99, rate(codeplane_sse_event_delivery_latency_seconds_bucket{channel_type="workspace_session"}[5m])) > 0.5`

**Severity**: Warning

**Runbook**:
1. Check PostgreSQL replication lag if running replicas.
2. Check server CPU and memory. High event fan-out to many subscribers can cause backpressure.
3. Inspect `codeplane_sse_connections_active` — if a single channel has hundreds of subscribers, the broadcast loop may be slow.
4. Consider implementing subscriber batching or moving to a dedicated pub/sub system if the problem persists at scale.

#### Alert: Zero Active Connections During Business Hours

**Condition**: `codeplane_sse_connections_active{channel_type="workspace_session"} == 0` for 30 minutes during business hours AND workspace sessions are being created.

**Severity**: Warning

**Runbook**:
1. Verify the SSE endpoint is reachable with a curl test.
2. Check for recent deployments that may have broken the SSE route or client subscription logic.
3. Check browser console logs for EventSource connection errors.
4. Verify the SSE manager was started during server bootstrap.

### Error Cases and Failure Modes

| Failure Mode | Impact | Mitigation |
|-------------|--------|------------|
| PostgreSQL LISTEN/NOTIFY unavailable | No live updates; initial event and keep-alive still work | Graceful degradation with warning log; client falls back to periodic GET |
| Server runs out of file descriptors | New SSE connections rejected with 503 | Monitor `codeplane_sse_connections_active`; set connection limits |
| Client disconnects without closing SSE | Server-side subscriber leak | Keep-alive detects dead connections within 15s; subscriber cleaned up |
| PG NOTIFY payload exceeds 8KB | PostgreSQL silently drops the notification | Session status payloads are <200 bytes; not a realistic concern |
| Network partition between PG and app server | Notifications lost during partition | PG LISTEN auto-reconnects; clients get current status on reconnect |
| Rapid session creation/destruction | Burst of NOTIFY events | SSE broadcast is non-blocking; events delivered in order |

## Verification

### API Integration Tests

| Test ID | Test | Expected Result |
|---------|------|-----------------|
| API-STREAM-001 | `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream` with valid session returns SSE response | Response status 200, Content-Type `text/event-stream`, initial event contains current session status |
| API-STREAM-002 | Initial event contains correct `session_id` and `status` fields | Parsed JSON matches `{ session_id: <uuid>, status: "running" }` |
| API-STREAM-003 | Initial event has `event: workspace.session` SSE type | Raw SSE text includes `event: workspace.session\n` |
| API-STREAM-004 | Initial event has `id: 1` SSE event ID | Raw SSE text includes `id: 1\n` |
| API-STREAM-005 | Stream for non-existent session returns 404 | Response status 404, body `{ "message": "workspace session not found" }` |
| API-STREAM-006 | Stream with empty session ID returns 400 | Response status 400, body `{ "message": "session id is required" }` |
| API-STREAM-007 | Stream without authentication returns 401 | Response status 401 |
| API-STREAM-008 | Stream for session in different user's private repo returns 404 | Response status 404 (not 403, to prevent information leakage) |
| API-STREAM-009 | Keep-alive comments are sent within 20 seconds of connection | After 20s, at least one `: keep-alive\n\n` comment received |
| API-STREAM-010 | Live status transition is received when session status changes | Create session → subscribe to stream → destroy session → receive `{ status: "stopped" }` event |
| API-STREAM-011 | Multiple concurrent subscribers each receive events | Two clients subscribe → destroy session → both receive `stopped` event |
| API-STREAM-012 | Stream for already-stopped session returns initial event with `stopped` status | Session in `stopped` state → subscribe → initial event has `status: "stopped"` |
| API-STREAM-013 | Stream for already-failed session returns initial event with `failed` status | Session in `failed` state → subscribe → initial event has `status: "failed"` |
| API-STREAM-014 | PAT authentication works for SSE endpoint | `Authorization: token <pat>` header → 200 response with SSE stream |
| API-STREAM-015 | SSE ticket authentication works for SSE endpoint | `?ticket=<ticket>` query param → 200 response with SSE stream |
| API-STREAM-016 | Response headers include Cache-Control: no-cache | Inspect response headers |
| API-STREAM-017 | Response headers include Connection: keep-alive | Inspect response headers |
| API-STREAM-018 | Subscriber cleanup when client disconnects | Subscribe → disconnect → verify server-side subscriber count drops |
| API-STREAM-019 | PG channel is released when last subscriber disconnects | Subscribe → disconnect → verify no PG LISTEN on that channel |
| API-STREAM-020 | Rapid status transitions are delivered in order | Create session → trigger multiple status changes → verify event order |

### CLI E2E Tests

| Test ID | Test | Expected Result |
|---------|------|-----------------|
| CLI-STREAM-001 | `codeplane workspace watch <id>` connects to workspace stream and outputs status | stderr shows `Watching workspace ... (status: ...)...`, status events printed |
| CLI-STREAM-002 | CLI watch exits on terminal status (`deleted`, `error`) | Process exits after receiving terminal status |
| CLI-STREAM-003 | CLI watch with `--json` outputs structured event array | stdout contains valid JSON with `events` array |
| CLI-STREAM-004 | CLI watch with invalid workspace ID exits with error | Non-zero exit code, error message on stderr |
| CLI-STREAM-005 | CLI workspace create + session stream detects `running` status | Create workspace → session transitions to running → stream reports running |

### Web UI E2E Tests (Playwright)

| Test ID | Test | Expected Result |
|---------|------|-----------------|
| UI-STREAM-001 | Workspace detail page shows session status badge | Badge visible with correct status color |
| UI-STREAM-002 | Session status badge updates live when session status changes | Create session → badge shows running (green); destroy → badge shows stopped (gray) |
| UI-STREAM-003 | Session badge shows reconnecting state when SSE connection drops | Simulate network disconnect → badge shows reconnecting indicator → reconnect → badge recovers |
| UI-STREAM-004 | Multiple sessions on same workspace detail page each show independent status | Two sessions → one destroyed → only that session's badge updates |
| UI-STREAM-005 | Session terminal view shows "Session ended" banner on stop/fail | Destroy session while terminal is open → banner displayed |
| UI-STREAM-006 | Session status badge on initial page load shows correct status without waiting for SSE | Page loads → badge immediately reflects current status from initial event |

### TUI E2E Tests

| Test ID | Test | Expected Result |
|---------|------|-----------------|
| TUI-STREAM-001 | Workspace detail screen shows session status with correct color token | Running session → green "Running" badge |
| TUI-STREAM-002 | Session status updates live in workspace detail screen | Destroy session → badge changes to gray "Stopped" |
| TUI-STREAM-003 | Failed session shows red "Failed" badge | Session fails → red "Failed" badge |

### Boundary and Stress Tests

| Test ID | Test | Expected Result |
|---------|------|-----------------|
| BOUND-001 | Session ID at exactly 36 characters (valid UUID) succeeds | 200 SSE response |
| BOUND-002 | Session ID longer than 36 characters returns 400 or 404 | Error response, not a stream |
| BOUND-003 | Session ID with special characters (e.g., `../`, `%00`) returns 400 | Error response, no path traversal |
| BOUND-004 | 50 concurrent SSE connections to the same session all receive events | All 50 clients get `stopped` event on session destroy |
| BOUND-005 | SSE connection survives for 30 minutes with keep-alive pings | Connection remains open, keep-alive comments received every 15s |
| BOUND-006 | SSE connection is properly cleaned up on server shutdown | Graceful shutdown → all connections closed → no resource leaks |
| BOUND-007 | Opening stream on PGLite (daemon mode) returns initial event and keep-alives | No crash, initial event delivered, live updates may not arrive |

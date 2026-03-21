# WORKSPACE_STATUS_STREAM

Specification for WORKSPACE_STATUS_STREAM.

## High-Level User POV

When you create, resume, or interact with a workspace in Codeplane, you should never have to wonder what state it's in. The workspace status stream delivers live, real-time status updates to every connected client — web browser, terminal UI, CLI, desktop app, and editor — so the moment a workspace finishes starting, gets suspended by the idle timeout, or fails during provisioning, you see it immediately without refreshing or polling.

Imagine you create a new workspace from the web UI. The workspace card shows "Starting…" with a subtle animation. A few seconds later, the card flips to "Running" in green, and SSH connection details appear — all without you clicking anything. If a teammate deletes the workspace while you're looking at it, the card updates to "Stopped" and a message tells you what happened. If your network drops briefly, the connection quietly reconnects in the background and catches up on anything you missed.

The same experience holds in the terminal. In the TUI workspace list, status badges on each row update live as workspaces transition between states. In the CLI, `codeplane workspace status <id> --follow` prints status changes as they happen. In VS Code or Neovim, a status indicator shows whether your connected workspace is running, suspended, or failed. Every client speaks the same real-time protocol, so you get consistent, instant feedback no matter how you access Codeplane.

Workspace sessions — the terminal connections inside a running workspace — have their own status stream. When you open a session, you can watch it go from initializing to running. When the session is closed by the idle timeout, your client shows it immediately. This is especially valuable for agent-driven workflows where sessions are created and destroyed programmatically and the human operator needs visibility into what's happening without polling.

The status stream is also the backbone for automated reactions. When a workspace transitions to "running," the SSH info section activates. When it transitions to "suspended," the SSH info section shows a resume prompt. When it transitions to "failed," error details appear. These cascading UI updates are driven entirely by the stream, creating a responsive, event-driven experience that feels like the workspace is a living thing rather than a static resource you check on periodically.

Connection health is always visible. A small indicator in the status bar (or equivalent surface) tells you whether the real-time connection is active, reconnecting, or disconnected. Reconnection is fully automatic with exponential backoff, and on reconnect the client fetches the latest state to fill any gaps. You should almost never need to manually intervene — but if you do, a single keystroke or button triggers a fresh connection.

## Acceptance Criteria

### Definition of Done

- [ ] Server emits workspace status events via PG NOTIFY on channel `workspace_status_{idWithoutDashes}` for every workspace lifecycle transition (pending, starting, running, suspended, stopped, failed)
- [ ] Server emits workspace session status events via PG NOTIFY on the same channel pattern for session lifecycle transitions (running, stopped, failed, closed)
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/stream` returns an SSE response that delivers the initial workspace status as the first event, then streams subsequent status changes
- [ ] `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream` returns an SSE response that delivers the initial session status as the first event, then streams subsequent session status changes
- [ ] SSE connections use ticket-based authentication — long-lived tokens are never passed as URL query parameters
- [ ] SSE ticket is obtained via `POST /api/auth/sse-ticket`, is single-use, expires in 30 seconds, and is SHA-256 hashed before server-side storage
- [ ] The server sends SSE keep-alive comments (`: keep-alive\n\n`) every 15 seconds on all workspace status streams
- [ ] SSE events use the wire format: `id: <incrementing_integer>\nevent: workspace.status\ndata: <json>\n\n`
- [ ] Session SSE events use event type `workspace.session` with payload `{ session_id, status }`
- [ ] All workspace lifecycle operations (create, suspend, resume, delete, provision success, provision failure, cleanup) emit status notifications
- [ ] All session lifecycle operations (create, destroy, idle close) emit session status notifications
- [ ] Web UI displays real-time workspace status without page refresh
- [ ] TUI displays real-time workspace status via status badges that update within one render frame (<16ms) of event receipt
- [ ] CLI `--follow` flag on workspace status commands outputs status transitions as they stream in
- [ ] Desktop app surfaces workspace status changes through the embedded web UI and tray status
- [ ] VS Code extension reflects workspace status in the sidebar and status bar
- [ ] Neovim plugin reflects workspace status through commands and statusline

### SSE Connection Lifecycle

- [ ] SSE connections open within 500ms of client mount/subscribe
- [ ] SSE ticket has a 30-second TTL; if connection not established in time, a new ticket is requested
- [ ] If no keep-alive or event is received for 45 seconds, the connection is considered dead and clients reconnect
- [ ] On disconnect, clients reconnect with exponential backoff: 1s, 2s, 4s, 8s, capped at 30s
- [ ] Each reconnection attempt obtains a fresh SSE ticket
- [ ] On successful reconnection, clients perform a REST GET to reconcile any missed events
- [ ] Maximum reconnection attempts: 20 (~10 minutes of backoff)
- [ ] After max attempts, clients display a manual reconnect affordance
- [ ] Multiple subscribers for the same workspace share a single SSE connection (deduplication)
- [ ] SSE connections are cleaned up when the subscribing view unmounts or navigates away
- [ ] Lazy PG LISTEN: server only subscribes to a PG channel when the first SSE subscriber connects, and unsubscribes when the last subscriber disconnects

### Edge Cases — Data Boundaries

- [ ] Workspace IDs up to 36 characters (UUID format) are handled without truncation
- [ ] SSE event payloads up to 64KB are parsed without error
- [ ] Malformed SSE events (invalid JSON in data field) are silently discarded — no crash, no user-visible error
- [ ] SSE events with unknown event types are silently ignored
- [ ] SSE events referencing a mismatched workspace ID are discarded by the client
- [ ] Rapid status transitions (e.g., starting → running → suspending → suspended within 1 second) are all delivered without coalescing
- [ ] If a workspace is deleted while a client is streaming, the `stopped` event is delivered and the stream ends
- [ ] Empty or null status payloads are treated as malformed and discarded
- [ ] Unicode characters in workspace metadata do not corrupt the SSE data frame

### Edge Cases — Network and Environment

- [ ] Terminal resize during active SSE connection does not interrupt the stream
- [ ] Process suspend (Ctrl+Z) and resume (fg) triggers reconnection
- [ ] Browser tab backgrounding does not silently kill the EventSource; reconnection handles any gap
- [ ] Rate limiting on ticket issuance returns 429 with Retry-After header; clients extend backoff accordingly
- [ ] Concurrent SSE connections per user are capped at 5; additional connections return 429
- [ ] PGLite mode (daemon/desktop) may not support PG LISTEN/NOTIFY — SSE degrades gracefully to initial-event-only with keep-alives
- [ ] CORS headers are present on SSE responses for cross-origin web clients
- [ ] X-Request-Id header is included in the SSE response for traceability

## Design

## API Shape

### Workspace Status Stream

```
GET /api/repos/:owner/:repo/workspaces/:id/stream?ticket=<sse_ticket>
```

**Response**: `text/event-stream` (SSE)

**Initial Event** (sent immediately on connection):
```
id: 1
event: workspace.status
data: {"workspace_id":"<uuid>","status":"running"}
```

**Subsequent Events** (on each status transition):
```
id: 2
event: workspace.status
data: {"workspace_id":"<uuid>","status":"suspended"}
```

**Keep-Alive** (every 15 seconds):
```
: keep-alive
```

**Status Values**: `pending`, `starting`, `running`, `suspended`, `stopped`, `failed`

**Error Responses**:
- `401 Unauthorized` — invalid or expired ticket
- `404 Not Found` — workspace does not exist or user lacks access
- `429 Too Many Requests` — concurrent SSE connection limit reached (includes `Retry-After` header)

### Workspace Session Status Stream

```
GET /api/repos/:owner/:repo/workspace/sessions/:id/stream?ticket=<sse_ticket>
```

**Response**: `text/event-stream` (SSE)

**Initial Event**:
```
id: 1
event: workspace.session
data: {"session_id":"<uuid>","status":"running"}
```

**Session Status Values**: `running`, `stopped`, `failed`, `closed`

### SSE Ticket Endpoint

```
POST /api/auth/sse-ticket
Authorization: Bearer <pat_or_session_cookie>

Response 200:
{"ticket": "<opaque_string>", "expires_at": "<ISO8601>"}
```

Ticket properties:
- 30-second TTL
- Single-use (consumed on SSE connection establishment)
- SHA-256 hashed server-side
- Maximum 10 tickets per user per minute

## SDK Shape

### SSEManager (Server-Side)

The `SSEManager` class in `@codeplane/sdk` provides:

- `subscribe(channel, options?)` — returns a `ReadableStream<string>` for a single PG NOTIFY channel
- `subscribeMulti(channels, options?)` — combines multiple channels into one stream
- `start()` / `stop()` — lifecycle management for PG LISTEN subscriptions

Helper functions:
- `sseHeaders()` — returns `{ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }`
- `sseResponse(stream, init?)` — wraps a ReadableStream in a proper SSE Response
- `sseStreamWithInitial(initialEvents, liveStream)` — concatenates an array of initial SSE-formatted events with a live stream
- `formatSSEEvent(event)` — formats `{ id, type, data }` into SSE wire format
- `validateChannel(channel)` — validates channel name safety

### WorkspaceService (Server-Side)

Status notification methods:
- `notifyWorkspace(workspaceId, status)` — emits PG NOTIFY on `workspace_status_{idWithoutDashes}` with `{ status }` payload
- `notifySession(sessionId, status)` — emits PG NOTIFY on `workspace_status_{idWithoutDashes}` with `{ status }` payload

These are called automatically by all workspace lifecycle operations (create, suspend, resume, delete, provision, cleanup).

### Client-Side Hooks (`@codeplane/ui-core`)

- `useWorkspaceStatusStream(owner, repo, workspaceId)` — subscribes to SSE for a single workspace. Returns `{ status, connectionHealth, reconnect }`.
- `useWorkspaceListStatusStream(owner, repo, workspaceIds)` — subscribes to SSE for multiple workspaces (list view). Returns `Map<workspaceId, status>` and aggregate `connectionHealth`.
- `useSSETicket()` — obtains a short-lived SSE authentication ticket.
- `createSSEReader(url, options)` — low-level fetch-based SSE reader supporting custom headers, AbortSignal, and Last-Event-ID recovery.

### SSE Provider (`<SSEProvider>`)

Wraps the application root (TUI) or relevant subtree (web). Provides:
- Central connection management and deduplication
- Ticket acquisition and lifecycle
- Reconnection with exponential backoff
- Keep-alive monitoring (45-second timeout)
- Connection health aggregation
- Context API: `useSSE(channel, callback)` for raw channel subscription

## Web UI Design

### Workspace List View

Each workspace card/row displays a status badge that updates in real-time via SSE:
- **Running**: Green badge with "Running" text
- **Starting/Stopping/Suspending**: Yellow badge with spinner animation and transitional label
- **Suspended**: Gray/muted badge with "Suspended" text
- **Failed/Error**: Red badge with "Failed" text
- **Stopped**: Gray/muted badge with "Stopped" text

An SSE connection is established for each visible workspace. When a workspace transitions, its badge updates without page interaction.

### Workspace Detail View

The detail header includes the live status badge. Cascading updates:
- Transition to `running`: SSH connection info section populates, uptime counter starts
- Transition to `suspended`: SSH info shows "Workspace suspended. Resume to reconnect.", suspended-at timestamp appears
- Transition to `failed`: Error details section appears below metadata
- Transition to `stopped`/`deleted`: Workspace marked as terminated

A flash notification appears for 3 seconds on each transition (e.g., "Workspace is now running").

### Connection Health Indicator

The web UI shows an SSE connection indicator (green dot for connected, yellow for reconnecting, red for disconnected) in the workspace header area. Reconnection is automatic; a manual "Reconnect" button appears after max attempts.

## CLI Command

### `codeplane workspace status <workspace-id> --follow`

Streams workspace status transitions to stdout:

```
$ codeplane workspace status ws-abc123 --follow
starting  2026-03-22T10:00:01Z
running   2026-03-22T10:00:05Z
suspended 2026-03-22T10:30:05Z  (idle timeout)
^C
```

With `--json --follow`:
```json
{"status":"starting","timestamp":"2026-03-22T10:00:01Z"}
{"status":"running","timestamp":"2026-03-22T10:00:05Z"}
{"status":"suspended","timestamp":"2026-03-22T10:30:05Z"}
```

The CLI obtains an SSE ticket, connects, and prints each status event. On disconnect, it reconnects with the same backoff strategy. `Ctrl+C` cleanly closes the connection.

### `codeplane workspace session status <session-id> --follow`

Same pattern for session status streaming.

## TUI UI

### Workspace List Screen

Each visible workspace row has an SSE subscription. Status badges update in-place:
```
● my-workspace           [running]    @dev   2h ago
● staging-env            [⠹ starting…] @dev  5m ago
  test-workspace         [suspended]   @dev  1d ago
```

Rows that scroll out of the visible viewport (plus 10-row buffer) have their SSE connections closed. Rows that scroll into view open new connections.

### Workspace Detail Screen

The header badge updates live. The SSH tab, uptime counter, and suspended-at fields cascade from status transitions. The status bar shows:
```
s:suspend D:delete q:back                      ● connected
```

When SSE delivers a status change from `running` to `suspended`:
```
┌─────────────────────────────────────────────────────────────┐
│ … > Workspaces > my-workspace                          ● 3  │
├─────────────────────────────────────────────────────────────┤
│ my-workspace                                                │
│ [suspended]  @developer  created 2h ago  [persistent]       │
│ idle: 30m  Suspended: just now                              │
│                                                             │
│ 1:Overview  2:SSH  3:Sessions  4:Snapshots                  │
│ ─────────────────────────────────────────────────────────── │
│ ─── SSH Connection ───                                      │
│ Workspace suspended. Press r to resume.                     │
├─────────────────────────────────────────────────────────────┤
│ Workspace is now suspended     r:resume D:delete q:back  ●  │
└─────────────────────────────────────────────────────────────┘
```

### Status Badge Component

Display status mapping:
- `running`: green, no animation, label "Running"
- `starting`: yellow, braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 80ms), label "Starting…"
- `suspending`: yellow, braille spinner, label "Suspending…"
- `resuming`: yellow, braille spinner, label "Resuming…"
- `stopping`: yellow, braille spinner, label "Stopping…"
- `suspended`: muted gray, no animation, label "Suspended"
- `stopped`: muted gray, no animation, label "Stopped"
- `deleted`: muted gray, no animation, label "Deleted"
- `failed`: red, no animation, label "Failed"
- `error`: red, no animation, label "Error"

### Responsive Behavior

- **80×24**: Status badge visible, connection indicator dot-only (no text), flash messages truncated
- **120×40**: Full indicator text ("connected", "reconnecting…", "disconnected"), flash messages include workspace name
- **200×60+**: Indicator includes reconnection attempt count ("reconnecting… (3/20)")

### Keybindings

- `R` (workspace detail/list, degraded connection): Force manual SSE reconnection, reset backoff counter. Debounced at 2-second intervals.

## VS Code Extension

The VS Code extension displays workspace status in:
- **Sidebar tree view**: Each workspace node shows an icon reflecting its live status (green circle for running, gray for suspended, red for failed)
- **Status bar item**: When a workspace is selected/active, the status bar shows `$(cloud) workspace-name: Running`
- Status updates come from the same SSE stream via the shared `@codeplane/editor-core` package

## Neovim Plugin

The Neovim plugin provides:
- `:Codeplane workspace status <id>` — shows current status, refreshes via the daemon
- Statusline component: `codeplane#workspace#status()` returns the current workspace status string for statusline integration
- The daemon (which the Neovim plugin communicates through) maintains SSE connections and exposes status via its local API

## Documentation

### User-Facing Documentation

1. **"Real-Time Workspace Status"** guide:
   - Explains what the status stream is and why it matters
   - Lists all workspace statuses and their meanings: pending (provisioning queued), starting (VM booting), running (ready for SSH), suspended (paused to save resources), stopped (permanently terminated), failed (provisioning or runtime error)
   - Lists all session statuses: running, stopped, failed, closed (idle timeout)
   - Explains automatic reconnection behavior
   - Documents the connection health indicator across clients

2. **CLI reference** update:
   - Document `--follow` flag on `workspace status` and `workspace session status` commands
   - Document `--json --follow` for machine-readable streaming output

3. **API reference** update:
   - Document `GET /api/repos/:owner/:repo/workspaces/:id/stream` endpoint
   - Document `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream` endpoint
   - Document SSE event format, event types, and keep-alive behavior
   - Document ticket-based authentication for SSE
   - Document rate limits and concurrent connection limits

4. **Editor integration** guides:
   - VS Code: How workspace status appears in sidebar and status bar
   - Neovim: How to use `:Codeplane workspace status` and statusline integration

## Permissions & Security

## Authorization Roles

| Role | Workspace Status Stream | Session Status Stream |
|------|------------------------|----------------------|
| Anonymous | ❌ No access — 401 on ticket request | ❌ No access |
| Read-only (repository read access) | ✅ Can subscribe to streams for workspaces they can view | ✅ Can subscribe to session streams for sessions they can view |
| Write (repository write access) | ✅ Full SSE access for all workspaces in the repository | ✅ Full SSE access for all sessions |
| Admin (repository or site admin) | ✅ Full SSE access | ✅ Full SSE access |
| Owner (repository owner) | ✅ Full SSE access | ✅ Full SSE access |

## Token and Ticket Security

- Long-lived tokens (PATs, session cookies) are **never** passed as URL query parameters
- SSE connections use short-lived, single-use tickets obtained via `POST /api/auth/sse-ticket`
- Tickets have a 30-second TTL and are consumed exactly once on connection establishment
- Replayed tickets are rejected with 401
- Tickets are SHA-256 hashed before server-side storage — the raw ticket is never persisted
- If the underlying token is revoked, the next ticket request returns 401 and the client prompts re-authentication
- Deploy keys with read access can obtain SSE tickets for their authorized repositories

## Rate Limiting

| Resource | Limit | Scope |
|----------|-------|-------|
| SSE ticket issuance | 10 per minute | Per user |
| Concurrent SSE connections | 5 | Per user |
| SSE event payload size | 64 KB maximum | Per event |

- 429 responses include a `Retry-After` header (in seconds)
- Clients must respect `Retry-After` and extend their reconnection backoff accordingly
- Connections beyond the concurrent limit are rejected at establishment, not mid-stream

## Data Privacy

- Workspace status events contain only `workspace_id` and `status` — no PII, no workspace contents, no user email
- Session status events contain only `session_id` and `status`
- SSH connection info (host, port, username, access token) is **not** included in SSE events — it must be fetched separately via the REST SSH endpoint
- SSE ticket values are ephemeral and not logged in access logs
- The PG NOTIFY channel name includes the workspace/session UUID (with dashes removed) — this is considered safe as UUIDs are not PII

## Telemetry & Product Analytics

## Business Events

| Event Name | Trigger | Properties |
|-----------|---------|------------|
| `workspace.sse.connected` | SSE connection successfully established | `workspace_id`, `repo_owner`, `repo_name`, `connection_time_ms`, `is_reconnection`, `client_type` (web/tui/cli/desktop/vscode/nvim) |
| `workspace.sse.disconnected` | SSE connection lost | `workspace_id`, `repo_owner`, `repo_name`, `connected_duration_ms`, `reason` (server_close, network, timeout, navigate_away, user_close) |
| `workspace.sse.reconnected` | SSE successfully reconnected after a drop | `workspace_id`, `repo_owner`, `repo_name`, `reconnection_attempts`, `total_downtime_ms`, `events_missed` (count from REST reconciliation) |
| `workspace.sse.reconnect_failed` | Max reconnection attempts exhausted | `workspace_id`, `repo_owner`, `repo_name`, `total_attempts`, `total_downtime_ms` |
| `workspace.sse.manual_reconnect` | User triggered manual reconnection | `workspace_id`, `repo_owner`, `repo_name`, `previous_state` (reconnecting/disconnected), `client_type` |
| `workspace.sse.status_transition` | Workspace status changed via SSE event | `workspace_id`, `repo_owner`, `repo_name`, `from_status`, `to_status`, `event_latency_ms` (server emit to client receipt), `client_type` |
| `workspace.sse.ticket_error` | SSE ticket acquisition failed | `repo_owner`, `repo_name`, `error_code`, `error_reason`, `client_type` |
| `workspace.session.sse.status_transition` | Session status changed via SSE | `session_id`, `workspace_id`, `from_status`, `to_status`, `client_type` |

### Common Properties (all events)

- `user_id`: Authenticated user ID
- `timestamp`: ISO 8601
- `client_type`: `web`, `tui`, `cli`, `desktop`, `vscode`, `nvim`
- `client_version`: Client build version

### Funnel Metrics and Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| **SSE connection success rate** | ≥ 99.5% of initial connections succeed | Validates that ticket auth and SSE endpoint are reliable |
| **Connection uptime** | ≥ 99% of SSE connections remain active for the user's session without manual intervention | Measures streaming reliability |
| **Auto-reconnection success rate** | ≥ 95% of reconnections succeed within 3 attempts | Validates backoff and ticket refresh logic |
| **Manual reconnection rate** | < 5% of sessions require user pressing R/Reconnect button | Low rate indicates healthy auto-reconnect |
| **Status update P95 latency** | ≤ 200ms from server emit to client render | Measures end-to-end real-time responsiveness |
| **Ticket error rate (non-401)** | < 0.1% | Non-auth errors indicate infrastructure issues |
| **Concurrent connection utilization** | Average < 3 per user (of 5 max) | Validates that the 5-connection cap is sufficient |
| **Missed event reconciliation rate** | < 2% of reconnections discover missed events | Low rate means the SSE stream is reliable enough that REST fallback is rarely needed |

## Observability

## Logging Requirements

### Server-Side Logs

| Log Level | Event | Structured Context |
|-----------|-------|-------------------|
| `debug` | SSE client connected | `{ workspace_id, channel, user_id, request_id, ticket_hash_prefix }` |
| `debug` | SSE event emitted via PG NOTIFY | `{ workspace_id, status, channel }` |
| `debug` | SSE keep-alive sent | `{ channel, subscriber_count }` |
| `debug` | PG LISTEN subscribed | `{ channel }` |
| `debug` | PG LISTEN unsubscribed (last subscriber left) | `{ channel }` |
| `info` | SSE client disconnected | `{ workspace_id, user_id, request_id, connected_duration_ms, reason }` |
| `info` | SSE ticket issued | `{ user_id, ticket_hash_prefix, expires_at }` |
| `info` | SSE ticket consumed | `{ user_id, ticket_hash_prefix }` |
| `warn` | SSE ticket expired before use | `{ ticket_hash_prefix, age_seconds }` |
| `warn` | SSE ticket replay attempted | `{ ticket_hash_prefix, user_id, remote_ip }` |
| `warn` | SSE concurrent connection limit reached | `{ user_id, active_connections }` |
| `warn` | PG NOTIFY payload too large (>64KB) | `{ channel, payload_size_bytes }` |
| `warn` | PG LISTEN failed (PGLite mode) | `{ channel, error }` |
| `error` | SSE ticket issuance failed (unexpected) | `{ user_id, error }` |
| `error` | PG NOTIFY failed | `{ channel, error }` |

### Client-Side Logs (TUI/CLI debug mode)

| Log Level | Event | Structured Context |
|-----------|-------|-------------------|
| `debug` | SSE connection opened | `{ workspace_id, channel, ticket_acquired_in_ms }` |
| `debug` | SSE event received | `{ workspace_id, event_type, event_id }` |
| `debug` | SSE keep-alive received | `{ workspace_id, channel }` |
| `info` | SSE reconnection successful | `{ workspace_id, attempt_number, downtime_ms }` |
| `warn` | SSE connection lost | `{ workspace_id, reason, will_retry }` |
| `warn` | SSE ticket acquisition failed (non-401) | `{ status_code, error }` |
| `warn` | Malformed SSE event discarded | `{ workspace_id, raw_data_length, parse_error }` |
| `error` | SSE reconnection exhausted | `{ workspace_id, total_attempts, total_downtime_ms }` |
| `error` | SSE ticket 401 (session expired) | `{ workspace_id }` |

Client-side logs are written to a debug log file (enabled via `CODEPLANE_TUI_DEBUG=1`, `--debug`, or `CODEPLANE_LOG_LEVEL=debug`). They are never rendered to the terminal UI.

## Prometheus Metrics

### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_sse_connections_total` | `channel_type=workspace\|session`, `status=success\|rejected` | Total SSE connection attempts |
| `codeplane_sse_events_emitted_total` | `channel_type=workspace\|session`, `event_type=workspace.status\|workspace.session` | Total SSE events emitted via PG NOTIFY |
| `codeplane_sse_tickets_issued_total` | `status=success\|expired\|rate_limited\|error` | Total SSE ticket operations |
| `codeplane_sse_ticket_replays_total` | — | Total attempted ticket replays (security metric) |
| `codeplane_sse_keepalives_sent_total` | `channel_type=workspace\|session` | Total keep-alive pings sent |
| `codeplane_sse_events_dropped_total` | `reason=payload_too_large\|channel_error` | Events that failed to deliver |

### Gauges

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_sse_active_connections` | `channel_type=workspace\|session` | Current active SSE connections |
| `codeplane_sse_active_channels` | — | Current PG LISTEN channels subscribed |
| `codeplane_sse_subscribers_per_channel` | `channel` | Subscribers on each channel (use with caution — high cardinality) |

### Histograms

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_sse_connection_duration_seconds` | `channel_type` | 1, 5, 30, 60, 300, 600, 1800, 3600 | How long SSE connections stay open |
| `codeplane_sse_event_latency_seconds` | `channel_type` | 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1 | Time from PG NOTIFY to SSE event delivery |
| `codeplane_sse_ticket_issuance_seconds` | — | 0.001, 0.005, 0.01, 0.05, 0.1 | Ticket generation latency |

## Alerts

### Alert: SSE Connection Failure Rate High

**Condition**: `rate(codeplane_sse_connections_total{status="rejected"}[5m]) / rate(codeplane_sse_connections_total[5m]) > 0.05`
**Severity**: Warning
**Runbook**:
1. Check `codeplane_sse_active_connections` gauge — is the per-user limit (5) being hit broadly? If many users are hitting the cap, consider whether a client bug is leaking connections.
2. Check rate-limit counters (`codeplane_sse_tickets_issued_total{status="rate_limited"}`) — if ticket rate limiting is spiking, investigate whether a client is requesting tickets in a tight loop.
3. Check server error logs for `SSE ticket issuance failed` entries.
4. Verify PG LISTEN is healthy: `SELECT * FROM pg_stat_activity WHERE query LIKE 'LISTEN%'`.
5. If PGLite mode, confirm that graceful degradation is working (SSE returns initial event + keep-alives without live updates).

### Alert: SSE Event Delivery Latency High

**Condition**: `histogram_quantile(0.95, rate(codeplane_sse_event_latency_seconds_bucket[5m])) > 0.5`
**Severity**: Warning
**Runbook**:
1. Check PG NOTIFY throughput — high volume of notifications on the database can introduce latency.
2. Check `codeplane_sse_active_connections` gauge — a very large number of concurrent connections can slow event fan-out.
3. Check system CPU and memory — the SSE manager's event loop may be starved.
4. Check if specific channels have disproportionate subscriber counts (`codeplane_sse_subscribers_per_channel`).
5. If latency is isolated to specific workspaces, check if those workspaces are in rapid transition loops (create/fail/retry).

### Alert: SSE Active Connections Anomaly

**Condition**: `codeplane_sse_active_connections > 1000` (adjust threshold per deployment)
**Severity**: Warning
**Runbook**:
1. Check if a deployment or client release introduced a connection leak (connections opened but never closed).
2. Correlate with `codeplane_sse_connection_duration_seconds` histogram — are connections living abnormally long?
3. Check the user distribution — is one user responsible for a disproportionate share?
4. Check `codeplane_sse_active_channels` — if channel count is low but connection count is high, many users are watching the same workspaces.
5. Consider temporarily lowering the per-user concurrent limit if under active incident.

### Alert: SSE Ticket Replay Attempts

**Condition**: `rate(codeplane_sse_ticket_replays_total[5m]) > 1`
**Severity**: Critical
**Runbook**:
1. This indicates potential credential theft or replay attack.
2. Check server logs for `SSE ticket replay attempted` entries — correlate `remote_ip` and `user_id`.
3. If a single IP is responsible, consider IP-level blocking.
4. If a single user is affected, their token may be compromised — consider revoking their sessions.
5. Verify ticket SHA-256 hashing is working correctly (tickets are not being stored in cleartext).
6. Escalate to security team if pattern persists.

### Alert: PG NOTIFY Failures

**Condition**: `rate(codeplane_sse_events_dropped_total[5m]) > 0`
**Severity**: Critical
**Runbook**:
1. Check PostgreSQL logs for NOTIFY errors.
2. Check `pg_notify` function availability — it may be disabled or restricted.
3. Check if payload size limits are being exceeded (`reason=payload_too_large`).
4. Check database connection pool health — NOTIFY requires an active connection.
5. If in PGLite mode, NOTIFY failures are expected and should be suppressed (verify the warn log is firing, not the error path).
6. Restart the SSE manager if PG LISTEN subscriptions are stale.

## Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Recovery |
|-------------|-----------|--------|----------|
| PG NOTIFY emission fails | Server error log, `codeplane_sse_events_dropped_total` counter | Clients miss a status transition | Clients reconcile via REST on next reconnect; cleanup scheduler will emit future transitions |
| PG LISTEN subscription fails | Server warn log (PGLite), `codeplane_sse_active_channels` gauge stalls | No live events delivered; only initial event + keep-alives | Clients fall back to polling via REST; SSE manager retries LISTEN on next subscriber |
| SSE ticket hash collision | Extremely unlikely (SHA-256) | Wrong user could potentially consume another's ticket | Single-use + 30s TTL limits blast radius; monitor `codeplane_sse_ticket_replays_total` |
| Server OOM from too many SSE connections | System memory alerts, connection gauge | All SSE connections drop | Per-user cap (5) and deployment-level monitoring prevent runaway; restart recovers |
| Database connection pool exhaustion | PG connection wait timeout | New LISTEN subscriptions fail | Existing streams continue; new connections get initial-event-only; pool recovery is automatic |
| Client fails to close SSE connection on unmount | `codeplane_sse_connection_duration_seconds` histogram shows very long tails | Server holds resources for zombie connections | Keep-alive timeout (45s without client ACK) eventually cleans up server-side |

## Verification

All tests target integration and E2E validation. Tests that fail due to unimplemented backends are left failing — they are never skipped or commented out.

## API-Level Tests (Server)

```
TEST: "SSE-API-001: workspace status stream returns initial event on connection"
  → Create a workspace (status: starting)
  → Connect to GET /api/repos/:owner/:repo/workspaces/:id/stream with valid ticket
  → Assert first SSE event is { event: "workspace.status", data: { workspace_id, status: "starting" } }
  → Assert Content-Type is text/event-stream
  → Assert Cache-Control is no-cache
  → Assert X-Request-Id header is present

TEST: "SSE-API-002: workspace status stream delivers live status transitions"
  → Create workspace, connect to stream
  → Trigger workspace status change to "running" (via provision completion)
  → Assert SSE event delivered: { event: "workspace.status", data: { status: "running" } }
  → Assert event has incrementing id

TEST: "SSE-API-003: session status stream returns initial event on connection"
  → Create a workspace session
  → Connect to GET /api/repos/:owner/:repo/workspace/sessions/:id/stream with valid ticket
  → Assert first SSE event is { event: "workspace.session", data: { session_id, status: "running" } }

TEST: "SSE-API-004: session status stream delivers live session transitions"
  → Create session, connect to stream
  → Destroy session
  → Assert SSE event: { event: "workspace.session", data: { status: "stopped" } }

TEST: "SSE-API-005: keep-alive sent every 15 seconds"
  → Connect to workspace status stream
  → Wait 16 seconds
  → Assert at least one ": keep-alive" comment received

TEST: "SSE-API-006: requires valid ticket — rejects missing ticket"
  → Connect to workspace status stream without ?ticket parameter
  → Assert 401 response

TEST: "SSE-API-007: requires valid ticket — rejects expired ticket"
  → Obtain ticket, wait 31 seconds
  → Connect with expired ticket
  → Assert 401 response

TEST: "SSE-API-008: requires valid ticket — rejects replayed ticket"
  → Obtain ticket, use it to connect (success)
  → Disconnect, try same ticket again
  → Assert 401 response

TEST: "SSE-API-009: rejects anonymous users"
  → Attempt POST /api/auth/sse-ticket without authentication
  → Assert 401 response

TEST: "SSE-API-010: rejects users without repository access"
  → Authenticate as user without access to the repository
  → Obtain ticket (succeeds — ticket is not repo-scoped)
  → Connect to workspace stream
  → Assert 404 response (workspace not found for this user)

TEST: "SSE-API-011: enforces concurrent connection limit"
  → Open 5 SSE connections for the same user
  → Attempt 6th connection
  → Assert 429 response with Retry-After header

TEST: "SSE-API-012: enforces ticket rate limit"
  → Request 11 tickets within 60 seconds
  → Assert 11th request returns 429 with Retry-After header

TEST: "SSE-API-013: CORS headers present on SSE response"
  → Connect to workspace stream with Origin header
  → Assert Access-Control-Allow-Origin and Access-Control-Allow-Credentials headers present

TEST: "SSE-API-014: workspace delete emits stopped event and closes stream"
  → Create workspace, connect to stream
  → Delete workspace
  → Assert SSE event: { status: "stopped" }
  → Assert stream ends (connection closed by server)

TEST: "SSE-API-015: workspace suspend emits suspended event"
  → Create running workspace, connect to stream
  → Suspend workspace
  → Assert SSE event: { status: "suspended" }

TEST: "SSE-API-016: workspace resume emits running event"
  → Suspend workspace, connect to stream
  → Resume workspace
  → Assert SSE event: { status: "running" }

TEST: "SSE-API-017: workspace provision failure emits failed event"
  → Create workspace with a configuration that will fail provisioning
  → Connect to stream
  → Assert SSE event: { status: "failed" }

TEST: "SSE-API-018: stale pending cleanup emits failed event"
  → Create workspace that remains in pending for >5 minutes
  → Connect to stream
  → Wait for cleanup scheduler sweep
  → Assert SSE event: { status: "failed" }

TEST: "SSE-API-019: idle session cleanup emits closed event"
  → Create session with short idle timeout
  → Connect to session stream
  → Wait for idle timeout + cleanup sweep
  → Assert SSE event: { status: "closed" }

TEST: "SSE-API-020: SSE event payload at maximum 64KB is handled"
  → Simulate a PG NOTIFY with a 64KB payload
  → Assert SSE event is delivered to client without error

TEST: "SSE-API-021: SSE event payload exceeding 64KB is dropped"
  → Simulate a PG NOTIFY with a 65KB payload
  → Assert event is not delivered
  → Assert server logs a warning
  → Assert stream continues (no crash)

TEST: "SSE-API-022: rapid status transitions are all delivered"
  → Create workspace, connect to stream
  → Trigger transitions: starting → running → suspended in rapid succession (<1s)
  → Assert 3 separate SSE events received in order

TEST: "SSE-API-023: read-only user can subscribe to workspace stream"
  → Authenticate as user with read-only access to the repository
  → Obtain ticket, connect to workspace stream
  → Assert SSE connection established with initial event

TEST: "SSE-API-024: workspace ID with full UUID format handled correctly"
  → Create workspace with UUID id (36 chars with dashes)
  → Connect to stream
  → Assert PG channel uses UUID without dashes
  → Assert SSE events delivered correctly
```

## CLI E2E Tests

```
TEST: "CLI-SSE-001: workspace status --follow streams status transitions"
  → Create a workspace
  → Run `codeplane workspace status <id> --follow` in background
  → Trigger workspace transition to running
  → Assert stdout contains 'running' status line
  → Kill the CLI process

TEST: "CLI-SSE-002: workspace status --follow --json outputs JSON lines"
  → Create workspace, run with --json --follow
  → Trigger transition
  → Assert each stdout line is valid JSON with status and timestamp fields

TEST: "CLI-SSE-003: workspace status --follow reconnects on disconnect"
  → Start --follow, simulate server restart
  → Assert CLI reconnects and continues streaming

TEST: "CLI-SSE-004: workspace status --follow exits cleanly on Ctrl+C"
  → Start --follow, send SIGINT
  → Assert process exits with code 0
  → Assert SSE connection is closed (no orphan connections)

TEST: "CLI-SSE-005: workspace session status --follow streams session transitions"
  → Create workspace session
  → Run `codeplane workspace session status <id> --follow`
  → Destroy session
  → Assert stdout contains 'stopped' status line
```

## Web UI E2E Tests (Playwright)

```
TEST: "WEB-SSE-001: workspace detail badge updates on SSE status event"
  → Navigate to workspace detail page
  → Trigger workspace status change (running → suspended)
  → Assert badge text changes to 'Suspended' without page refresh
  → Screenshot: workspace-detail-sse-transition

TEST: "WEB-SSE-002: workspace list row badge updates on SSE status event"
  → Navigate to workspace list
  → Trigger status change for one workspace
  → Assert only that row's badge updates
  → Assert other rows unchanged

TEST: "WEB-SSE-003: SSH info appears when workspace transitions to running"
  → Navigate to workspace detail (status: starting)
  → Trigger transition to running
  → Assert SSH connection info section populates

TEST: "WEB-SSE-004: SSH info clears when workspace transitions away from running"
  → Navigate to workspace detail (status: running)
  → Trigger transition to suspended
  → Assert SSH info section shows resume prompt

TEST: "WEB-SSE-005: flash notification on status transition"
  → Navigate to workspace detail
  → Trigger status change
  → Assert toast/flash notification appears with transition message
  → Assert notification auto-dismisses within 5 seconds

TEST: "WEB-SSE-006: connection indicator shows connected state"
  → Navigate to workspace detail
  → Assert connection health indicator visible and green

TEST: "WEB-SSE-007: connection indicator shows reconnecting state on disconnect"
  → Navigate to workspace detail
  → Simulate network interruption
  → Assert indicator changes to yellow/reconnecting

TEST: "WEB-SSE-008: connection indicator shows disconnected after max retries"
  → Navigate to workspace detail
  → Simulate persistent network failure
  → Assert indicator changes to red/disconnected after backoff exhaustion
  → Assert manual reconnect button appears
```

## TUI E2E Tests (@microsoft/tui-test)

```
TEST: "TUI-SSE-001: establishes SSE connection on workspace detail mount"
  → Launch TUI, navigate to workspace detail
  → Assert SSE connection opened
  → Assert initial status badge renders correctly

TEST: "TUI-SSE-002: establishes SSE connections for visible workspace list rows"
  → Launch TUI, navigate to workspace list with 5 workspaces
  → Assert SSE connections opened for all 5 IDs

TEST: "TUI-SSE-003: cleans up SSE connection on detail unmount"
  → Navigate to workspace detail, press q to go back
  → Assert SSE connection is closed

TEST: "TUI-SSE-004: updates detail badge on SSE status event"
  → Mount workspace detail (running)
  → Inject SSE event: status → suspended
  → Assert badge changes from green [running] to muted [suspended]
  → Snapshot: tui-workspace-detail-suspended

TEST: "TUI-SSE-005: updates list row badge on SSE status event"
  → Mount workspace list with workspace-1 as running
  → Inject SSE event for workspace-1: status → suspended
  → Assert workspace-1 badge changes
  → Assert other rows unaffected

TEST: "TUI-SSE-006: displays braille spinner for transitional statuses"
  → Mount workspace detail (starting)
  → Assert badge shows spinner character (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
  → Wait 80ms, assert spinner frame advances
  → Snapshot: tui-workspace-starting-spinner

TEST: "TUI-SSE-007: shows flash message on status transition"
  → Mount workspace detail (starting)
  → Inject SSE event: status → running
  → Assert status bar shows "Workspace is now running" in green
  → Wait 3s, assert flash message clears

TEST: "TUI-SSE-008: SSE event overrides optimistic state"
  → Mount workspace detail (running)
  → Press s (optimistic: suspending)
  → Inject SSE event: status → running (server rejected)
  → Assert badge reverts to [running]

TEST: "TUI-SSE-009: rapid transitions render all intermediate states"
  → Mount workspace detail (starting)
  → Inject SSE events: running, suspending, suspended in rapid succession
  → Assert final state is [suspended]
  → Assert all three events processed

TEST: "TUI-SSE-010: SSH info populates when status becomes running"
  → Mount workspace detail SSH tab (starting)
  → Assert SSH section shows waiting message
  → Inject SSE event: status → running
  → Assert SSH connection details appear

TEST: "TUI-SSE-011: reconnects with exponential backoff"
  → Mount workspace detail
  → Simulate SSE disconnect
  → Assert status bar shows yellow reconnecting indicator
  → Assert first retry after ~1s

TEST: "TUI-SSE-012: fetches workspace via REST on reconnection"
  → Mount detail (running), disconnect SSE
  → Server-side change to suspended
  → Simulate successful reconnect
  → Assert REST GET called, badge updates to suspended

TEST: "TUI-SSE-013: shows disconnected after 20 failed reconnection attempts"
  → Simulate 20 consecutive failures
  → Assert red dot with disconnected text
  → Assert R:reconnect hint in status bar
  → Snapshot: tui-workspace-sse-disconnected

TEST: "TUI-SSE-014: R key triggers manual reconnection"
  → Enter disconnected state
  → Press R
  → Assert reconnection attempted, status bar shows reconnecting

TEST: "TUI-SSE-015: R key debounced at 2-second intervals"
  → Press R twice within 500ms
  → Assert only one reconnection attempt

TEST: "TUI-SSE-016: SSE survives terminal resize"
  → Mount detail at 120×40 with active SSE
  → Resize to 80×24
  → Assert SSE connection not interrupted
  → Inject status event, assert badge updates

TEST: "TUI-SSE-017: green dot when connected (connection indicator)"
  → Mount workspace detail
  → Assert status bar has green ● character
  → Snapshot: tui-workspace-connected

TEST: "TUI-SSE-018: no connection indicator on non-workspace screens"
  → Navigate to dashboard
  → Assert no SSE connection indicator in status bar

TEST: "TUI-SSE-019: aggregate health shows worst state"
  → Mount workspace list, 2 connected + 1 reconnecting
  → Assert indicator shows yellow (worst wins)

TEST: "TUI-SSE-020: 80×24 dot-only indicator"
  → Set terminal 80×24, mount workspace detail
  → Assert indicator is single dot (no text)
  → Snapshot: tui-workspace-80x24

TEST: "TUI-SSE-021: 120×40 full indicator text"
  → Set terminal 120×40
  → Assert indicator shows dot + text
  → Snapshot: tui-workspace-120x40

TEST: "TUI-SSE-022: 200×60 shows reconnection attempt count"
  → Set terminal 200×60, enter reconnecting state at attempt 3
  → Assert indicator shows reconnecting… (3/20)
  → Snapshot: tui-workspace-200x60-reconnecting

TEST: "TUI-SSE-023: shows auth message on 401 ticket response"
  → Mock ticket endpoint to return 401
  → Assert screen shows session expired message
  → Assert no reconnection loop

TEST: "TUI-SSE-024: handles 429 rate limit on ticket request"
  → Mock ticket to return 429 with Retry-After: 10
  → Assert status bar shows rate limited message
  → Assert next retry delayed by 10s

TEST: "TUI-SSE-025: discards malformed SSE events gracefully"
  → Inject invalid JSON event
  → Assert no crash, badge retains previous state
  → Inject valid event, assert badge updates

TEST: "TUI-SSE-026: handles workspace deletion via SSE"
  → Mount detail (running)
  → Inject SSE event: status → deleted
  → Assert badge shows [deleted] in muted color
  → Assert flash: Workspace deleted by another user
  → Snapshot: tui-workspace-deleted-sse

TEST: "TUI-SSE-027: handles process suspend and resume"
  → Mount detail with active SSE
  → Simulate SIGTSTP + SIGCONT
  → Assert reconnection triggered on resume

TEST: "TUI-SSE-028: deduplicates SSE connections for same workspace"
  → Subscribe to same workspace from two components
  → Assert only one SSE connection opened
  → Unmount one, assert connection persists
  → Unmount second, assert connection closed

TEST: "TUI-SSE-029: cleans up connections when rows scroll out of viewport"
  → Mount list with 50 workspaces
  → Scroll past first 10 rows
  → Assert connections for rows beyond buffer are closed
  → Assert new visible rows get connections

TEST: "TUI-SSE-030: no-color terminal renders text labels instead of colors"
  → Set NO_COLOR=1, mount workspace detail
  → Assert badge shows text label [RUNNING] without color codes
```

## Golden-File Terminal Snapshots

```
SNAPSHOT: tui-workspace-detail-suspended — Detail view after SSE transition to suspended
SNAPSHOT: tui-workspace-starting-spinner — Detail view with braille spinner for starting
SNAPSHOT: tui-workspace-connected — Status bar with green connected indicator
SNAPSHOT: tui-workspace-sse-disconnected — Status bar with red disconnected indicator
SNAPSHOT: tui-workspace-80x24 — Minimum terminal with dot-only indicator
SNAPSHOT: tui-workspace-120x40 — Standard terminal with full indicator text
SNAPSHOT: tui-workspace-200x60-reconnecting — Large terminal with attempt count
SNAPSHOT: tui-workspace-deleted-sse — Workspace deleted via SSE event
```

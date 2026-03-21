# TUI_NOTIFICATION_SSE_STREAM

Specification for TUI_NOTIFICATION_SSE_STREAM.

## High-Level User POV

The Notification SSE Stream is the real-time data pipeline that keeps the Codeplane TUI notification system alive. It is not a screen or a visible UI element — it is the invisible heartbeat behind every notification badge update, every new notification appearing at the top of the inbox, and every unread count change in the header bar and status bar. Without it, the TUI would be a static snapshot that the user must manually refresh. With it, the terminal becomes a live feed of repository activity.

When the TUI launches and the user is authenticated, an SSE (Server-Sent Events) connection is established in the background to the `GET /api/notifications` endpoint. The connection is scoped to the authenticated user's notification channel (`user_notifications_{userId}`). From that moment, any server-side event — an issue assignment, a landing request review, a workflow failure, a workspace status change, an @mention in a comment — flows through the SSE stream as a structured event and surfaces immediately in the TUI.

The user does not interact with the SSE stream directly. They experience it through its effects: the notification badge in the header bar incrementing from `[3]` to `[4]`, a new row appearing at the top of the notification inbox with a brief reverse-video flash, the status bar bell icon (◆) pulsing bold for 2 seconds, the title bar count updating from "Notifications (3 unread)" to "Notifications (4 unread)". These updates happen without any keypress — the terminal simply reflects the latest state.

When the network drops — the user's SSH tunnel disconnects, the server restarts, or WiFi hiccups — the SSE connection enters a reconnection cycle. The status bar's sync indicator transitions from the green connected dot to a red disconnected dot. The user sees "Disconnected" (or, at minimum terminal width, just the red dot). Behind the scenes, the TUI retries with exponential backoff: 1 second, 2 seconds, 4 seconds, 8 seconds, capped at 30 seconds. When the connection re-establishes, the TUI sends the `Last-Event-ID` header with the ID of the last received notification, and the server replays any notifications that arrived during the disconnect window (up to 1,000 events). The replayed events are deduplicated against the already-loaded list by notification ID, ensuring no duplicates appear. The status indicator returns to green, and the user is caught up — seamlessly, without pressing a single key.

The SSE connection is established via ticket-based authentication. Rather than sending the long-lived bearer token over the persistent SSE connection, the TUI first exchanges the bearer token for a short-lived, single-use SSE ticket via `POST /api/auth/sse-ticket`. The ticket is then used to authenticate the SSE stream. This reduces credential exposure over long-lived connections. If ticket exchange fails (e.g., the endpoint is not yet configured), the TUI falls back to bearer token authentication on the SSE endpoint directly.

Keep-alive comments are sent by the server every 15 seconds to prevent intermediate proxies, load balancers, or SSH tunnels from closing idle connections. The TUI silently consumes these keep-alive comments and uses them as a liveness signal — if no keep-alive arrives within 45 seconds (3× the interval), the client-side treats the connection as dead and initiates reconnection.

The SSE stream is a singleton — exactly one connection per TUI session, shared across all screens. Whether the user is on the Dashboard, in a diff viewer, editing an issue, or browsing workflows, the same SSE connection delivers notifications. The stream data is held in a React context (`<SSEProvider>`) that wraps the application root, making the connection state and incoming events available to every component that needs them: the header bar badge, the status bar indicator, the notification list screen, and the notification count hook.

## Acceptance Criteria

### Definition of Done

- [ ] An SSE connection to `GET /api/notifications` is established automatically on TUI startup when the user is authenticated
- [ ] The SSE connection subscribes to the `user_notifications_{userId}` channel scoped to the authenticated user
- [ ] Incoming SSE events are parsed and dispatched to all subscribed consumers (header badge, status bar, notification list)
- [ ] The `<SSEProvider>` context wraps the application root and exposes connection state (`connected`, `reconnecting`, `disconnected`, `failed`) and an event subscription API
- [ ] The `useNotificationStream()` hook from `@codeplane/ui-core` returns a reactive stream of notification events
- [ ] The `useSSE("user_notifications_{userId}")` hook subscribes a component to the notification channel
- [ ] New notifications received via SSE update the unread count in the header bar badge (`[N]`) and status bar (◆ N) within one render frame
- [ ] New notifications received via SSE are prepended to the notification list (if the Notification List screen is mounted) with deduplication by `id`
- [ ] The notification list screen shows a brief reverse-video flash on newly arrived rows (one render cycle)
- [ ] SSE events with duplicate notification IDs (already present in the loaded list) are silently deduplicated — no duplicate rows, no visual artifacts
- [ ] The notification stream is active on every screen (global scope), not only when the notification list screen is open
- [ ] The SSE connection is cleanly closed when the TUI unmounts (quit, `Ctrl+C`, SIGTERM)

### Connection Lifecycle

- [ ] SSE connection is established after the `<AuthProvider>` confirms a valid token and the `<APIClientProvider>` is ready
- [ ] SSE connection opens within 500ms of TUI mount completion
- [ ] SSE ticket-based auth: the TUI calls `POST /api/auth/sse-ticket` to obtain a one-time ticket with 30-second TTL, then uses it to open the SSE connection
- [ ] If ticket exchange fails (server returns error or endpoint not configured), the TUI falls back to bearer token auth on the SSE endpoint
- [ ] Fallback auth sends the bearer token as `Authorization: Bearer {token}` header on the SSE request
- [ ] The long-lived auth token is never passed as a URL query parameter — only the short-lived ticket appears in the SSE URL
- [ ] The SSE connection sends `Accept: text/event-stream` header
- [ ] The SSE connection is opened after the initial notification list fetch completes (so `Last-Event-ID` can be set to the latest loaded notification ID)
- [ ] If the user is not authenticated, no SSE connection is attempted
- [ ] On auth expiry (401 from SSE endpoint or ticket exchange), the SSE connection does not retry — the app-shell auth error screen is pushed
- [ ] On TUI shutdown (`Ctrl+C` or `q` from root), the SSE connection is closed gracefully (stream reader canceled, no dangling connections)
- [ ] Exactly one SSE connection exists per TUI session — no duplicate connections on screen transitions
- [ ] Each reconnection attempt obtains a fresh SSE ticket via `POST /api/auth/sse-ticket`

### Reconnection

- [ ] On SSE connection drop (network error, server restart, stream close), the TUI initiates automatic reconnection
- [ ] Reconnection uses exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
- [ ] The backoff timer resets to 1s after a successful reconnection
- [ ] On reconnection, the `Last-Event-ID` header is set to the ID of the last successfully received notification event
- [ ] The server replays up to 1,000 notifications with IDs greater than `Last-Event-ID`
- [ ] Replayed events are deduplicated client-side by notification `id` against the in-memory notification list
- [ ] Replayed events that are genuinely new (not already in the list) are prepended to the notification list and increment the unread count
- [ ] During reconnection, the status bar sync indicator shows `disconnected` state (red dot, "Disconnected" text at standard+ width)
- [ ] During reconnection with active backoff, the status bar appends "(retry Ns)" where N is the current backoff delay
- [ ] After successful reconnection, the status bar returns to `connected` state within one render frame
- [ ] If reconnection fails 20 consecutive times without success (~10 minutes of exponential backoff), the SSE stream enters a permanent failure state
- [ ] Permanent failure: status bar shows persistent warning, badge retains last known count, TUI remains fully usable with manual REST refresh
- [ ] Permanent failure does not prevent the user from navigating, marking notifications read, or using any other TUI feature
- [ ] If the user navigates to the notification list screen while disconnected, a non-blocking "⚠ No live updates" indicator appears in the title/toolbar area

### Keep-Alive

- [ ] The SSE stream consumes server-sent keep-alive comments (`: keep-alive` lines) silently — no UI updates, no event dispatch
- [ ] Keep-alive comments are used as a liveness signal: the client tracks the timestamp of the last received data (event or keep-alive)
- [ ] If no data (event or keep-alive) is received within 45 seconds (3× the 15s keep-alive interval), the client-side treats the connection as dead and initiates reconnection
- [ ] The keep-alive timeout does not fire during periods of active event delivery (events also reset the liveness timer)

### Event Format

- [ ] SSE events conform to the standard SSE wire format: `id: {id}\nevent: notification\ndata: {json}\n\n`
- [ ] The `id` field is the notification's database ID (positive integer)
- [ ] The `data` field is a JSON-encoded `NotificationResponse` object with fields: `id`, `user_id`, `source_type`, `source_id`, `subject`, `body`, `status`, `read_at`, `created_at`, `updated_at`
- [ ] Supported `source_type` values: `"issue"`, `"issue_comment"`, `"landing_request"`, `"lr_review"`, `"lr_comment"`, `"workspace"`, `"workflow_run"`
- [ ] Unknown event types are silently ignored (forward compatibility)
- [ ] Malformed JSON in the `data` field is logged as a warning and the event is skipped — no crash, no error state

### Status Bar Integration

- [ ] The notification badge (◆ + count) in the status bar updates in real-time as SSE events arrive
- [ ] When count increases (new notification), the badge renders in bold for 2 seconds before reverting to normal weight (via `useTimeline()`)
- [ ] When count is 0, the badge renders in `muted` color (ANSI 245) with no count number
- [ ] When count exceeds 99, the badge displays "99+"
- [ ] On SSE disconnect, the badge retains its last known count — it does not reset to 0
- [ ] On SSE reconnect with replay, the badge count is recalculated from the reconciled local cache

### Notification List Screen Integration

- [ ] When the notification list screen is active and an SSE event arrives, the new notification is prepended to the top of the list
- [ ] The prepended notification receives a one-cycle reverse-video highlight to draw attention
- [ ] The "Notifications (N unread)" title count updates immediately
- [ ] If the user has scrolled down in the list, the new notification is prepended but scroll position is preserved (no jump to top)
- [ ] If the user is viewing with "Unread" filter active, the new notification appears in the filtered list (since it arrives as unread)
- [ ] If a replayed event matches an existing notification in the list, the existing row is updated in-place

### Boundary Constraints

- [ ] Maximum in-memory notification count: 500 items (matching the notification list screen's memory cap)
- [ ] When SSE events push the in-memory count beyond 500, the oldest read notifications are evicted from the tail; unread notifications are retained preferentially
- [ ] Maximum replay batch size: 1,000 events (server-enforced)
- [ ] SSE ticket TTL: 30 seconds (server-defined); if the SSE connection is not established within the ticket TTL, a new ticket is obtained
- [ ] Notification `subject` field: max 255 characters (server-enforced)
- [ ] Notification `body` field: unbounded string; the stream passes it through as-is (display truncation handled by list screen)
- [ ] SSE event payloads up to 64KB are parsed without error
- [ ] Maximum concurrent SSE connections per user: 1 from the TUI (enforced client-side)
- [ ] SSE reconnection rate limit: 10 connections/min (server-enforced; 429 responses trigger extended backoff)
- [ ] Notification IDs up to 64-bit integer range handled without precision loss (use string representation internally)

### Edge Cases — Terminal Environment

- [ ] Terminal resize during active SSE connection does not disconnect or interrupt the stream
- [ ] If the terminal is resized to below 80×24 while streaming, the "terminal too small" message is shown but the SSE connection remains active in the background
- [ ] When the terminal is resized back above 80×24, notification surfaces resume with the latest SSE-delivered state
- [ ] Rapid terminal resizes do not cause multiple reconnection attempts
- [ ] The SSE connection survives `Ctrl+Z` (suspend process) and resume (`fg`) — on resume, a reconnection is triggered if the connection was lost during suspension
- [ ] No-color terminals (`NO_COLOR=1` or `TERM=dumb`): badge renders without color but with text label `[N]` for the count
- [ ] 16-color terminals: badge uses closest available ANSI color (blue=4 for primary)

### Edge Cases — Concurrent Operations

- [ ] Navigating away from and back to the notification list screen rapidly does not create duplicate SSE connections (connection is global, not screen-scoped)
- [ ] Rapid `r` presses (mark read) while SSE events are arriving do not cause race conditions with the local cache
- [ ] `R` (mark all read) while SSE events are being replayed: the mark-all-read applies to the server-side state; new SSE events arriving after the mark-all-read timestamp remain unread
- [ ] SSE notification arrives during an in-flight `GET /api/notifications/list` pagination request: the SSE event is cached and merged after the pagination response arrives, with deduplication by ID
- [ ] SSE notification arrives during an in-flight `PATCH /api/notifications/:id` (mark read): the two operations do not conflict — SSE event is processed independently and optimistic state maintained
- [ ] SSE reconnection replay occurs while the user is actively scrolling the notification list: scroll position and focus index are preserved, replayed items merged silently
- [ ] SSE event with `source_type` not in the known set: event is stored and displayed with a generic icon; no crash

## Design

### SSE Provider Architecture

The `<SSEProvider>` wraps the TUI application root and manages the notification SSE connection as a global, always-on stream. It sits in the provider hierarchy between `<APIClientProvider>` and `<NavigationProvider>`:

```
AppContext.Provider
  → ErrorBoundary
    → AuthProvider
      → APIClientProvider
        → SSEProvider              ← notification SSE stream lives here
          → NavigationProvider
            → App
              → AppShell
                → HeaderBar        ← consumes SSE for badge [N]
                → ScreenRouter     ← all screens access SSE via context
                → StatusBar        ← consumes SSE for ◆ badge + connection indicator
```

### SSE Connection Flow

1. TUI mounts → AuthProvider confirms token → APIClientProvider ready
2. SSEProvider initializes
3. SSEProvider calls POST /api/auth/sse-ticket → receives one-time ticket (fallback: use bearer token directly if ticket exchange fails)
4. SSEProvider opens EventSource to GET /api/notifications?ticket={ticket} (with Last-Event-ID header set to latest loaded notification ID)
5. Server sends keep-alive comments every 15s
6. Server pushes notification events as they occur via PG NOTIFY
7. SSEProvider dispatches events to all subscribers via React context
8. On disconnect → exponential backoff → fresh ticket → reconnect with Last-Event-ID
9. On unmount → close EventSource cleanly

### Context Shape

```tsx
interface SSEContextValue {
  connectionState: "connected" | "reconnecting" | "disconnected" | "failed";
  backoffMs: number;
  reconnectAttempts: number;
  subscribe(callback: (event: NotificationResponse) => void): () => void;
  lastEventId: number | null;
  notificationStreamHealth: "healthy" | "reconnecting" | "disconnected";
}
```

### Notification Event Flow to Badge

SSE Event arrives → SSEProvider receives event → Parse JSON data → NotificationResponse → Deduplicate by id against local cache → If new: increment unread count, add to cache → If existing: update in-place → Header bar badge [N] re-renders with new count → Status bar badge ◆ N re-renders with new count → Bold flash timer starts (2 seconds via useTimeline())

### Notification Event Flow to List Screen

SSE Event arrives (while notification list is mounted) → SSEProvider receives event (same as above) → NotificationListScreen receives update via useNotificationStream() → If new: prepend to list, apply reverse-video highlight for 1 frame → If existing: update row in-place → Title "Notifications (N unread)" re-renders → Scroll position preserved (no jump)

### Disconnection State Indicator

When the notification SSE stream is disconnected and the user is on the notification list screen, a non-blocking `⚠ No live updates` indicator appears in the title row area after 5 seconds. It is removed when the connection is re-established.

### Connection State Visual Mapping

| connectionState | Status Bar Icon | Status Bar Text (120+ cols) | Status Bar Text (80 cols) | Color |
|---|---|---|---|---|
| connected | ● | Connected | (icon only) | success (ANSI 34) |
| reconnecting | ● | Disconnected (retry Ns) | (icon only) | error (ANSI 196) |
| disconnected | ● | Disconnected | (icon only) | error (ANSI 196) |
| failed | ● | Connection failed | (icon only) | error (ANSI 196) |

### Reconnection State Machine

init → connected (ticket exchange + SSE open succeed)
connected → reconnecting (connection drops, keep-alive timeout, or stream error)
reconnecting → connected (reconnection succeeds, backoff resets to 1s)
reconnecting → failed (20 consecutive failures without any successful connection)
failed → remains failed (no further automatic retries)

### Components Used

- `<box>` — Layout containers for the SSEProvider wrapper
- `<text>` — Badge count text, bold flash rendering, disconnection indicator text
- No direct OpenTUI component usage by the SSE stream itself — it is a data layer. Visual output flows through the header bar badge (TUI_HEADER_BAR), status bar indicator (TUI_STATUS_BAR), and notification list screen (TUI_NOTIFICATION_LIST_SCREEN)

### Keybindings

The SSE stream feature does not introduce any keybindings. The connection is fully automatic. Related keybindings in consuming features:

| Key | Context | Effect on SSE |
|---|---|---|
| Ctrl+C | Any screen | TUI exits; SSE connection closed gracefully |
| q | Root screen | TUI exits; SSE connection closed gracefully |
| g n | Any screen | Navigate to notification list (benefits from SSE stream) |
| r | Notification list | Mark read (interacts with SSE-maintained local cache) |
| R | Notification list | Mark all read (interacts with SSE-maintained local cache) |

### Responsive Behavior

The SSE streaming behavior is identical at all terminal sizes. The only responsive difference is in the consuming components:

| Terminal Size | Badge Display | Disconnection Indicator (on list screen) |
|---|---|---|
| 80×24 (min) | Colored dot + count (compact) | ⚠ (icon only) |
| 120×40 (std) | ◆ + count | ⚠ No live updates |
| 200×60+ (lg) | ◆ + count | ⚠ Live updates unavailable — reconnecting… |

Terminal resize does not affect the SSE connection — it runs independently of layout.

### Data Hooks

| Hook | Source | Purpose |
|---|---|---|
| useNotificationStream() | @codeplane/ui-core | Subscribe to SSE notification events. Returns { latestEvent, connectionHealth, unreadCount, lastEventId } |
| useSSETicket() | @codeplane/ui-core | Obtain a short-lived SSE authentication ticket via POST /api/auth/sse-ticket |
| useSSE("user_notifications_{userId}") | SSEProvider context | Low-level channel subscription; returns raw event stream |
| useSSEConnectionState() | SSEProvider context | Returns { connectionState, backoffMs, reconnectAttempts } for status bar display |
| useNotifications() | @codeplane/ui-core | Fetch notification list via REST. SSE stream merges into the same local cache |
| useTerminalDimensions() | @opentui/react | Terminal size for responsive badge and indicator rendering |
| useOnResize() | @opentui/react | Resize callback — SSE connection is unaffected; only visual elements re-render |
| useTimeline() | @opentui/react | Bold flash timer for badge (2-second duration after new notification) |

### SSE Event Format

```
id: 42
event: notification
data: {"id":42,"user_id":1,"source_type":"issue","source_id":97,"subject":"Issue #97 assigned to you","body":"alice assigned issue #97 'Fix login timeout' to you","status":"unread","read_at":null,"created_at":"2026-03-21T10:30:00Z","updated_at":"2026-03-21T10:30:00Z"}
```

Keep-alive (no dispatch to subscribers): `: keep-alive`

### API Endpoints Consumed

| Endpoint | Method | Purpose |
|---|---|---|
| POST /api/auth/sse-ticket | POST | Exchange bearer token for 30-second, single-use SSE ticket |
| GET /api/notifications | GET (SSE) | SSE streaming endpoint. Channel: user_notifications_{userId}. Supports Last-Event-ID header for reconnection replay (up to 1,000 events) |

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated |
|---|---|---|
| Obtain SSE ticket | ❌ | ✅ (token auth only, not session auth) |
| Establish SSE connection | ❌ | ✅ |
| Receive notification events | ❌ | ✅ (own notifications only) |

- The SSE endpoint requires authentication. Unauthenticated requests receive a 401 and trigger the auth error screen.
- SSE events are strictly scoped to the authenticated user's channel (`user_notifications_{userId}`). A user can never receive another user's notifications.
- The SSE ticket exchange endpoint (`POST /api/auth/sse-ticket`) requires token-based auth (`isTokenAuth` flag). Session-based auth returns 403.
- There is no admin or org-level notification stream — each user has exactly one personal notification channel.
- Notifications are strictly per-user. The SSE stream does not expose data beyond what the user already has access to.

### Token and Ticket Security

- The TUI authenticates via token stored by `codeplane auth login` or the `CODEPLANE_TOKEN` environment variable.
- SSE connections use ticket-based auth: the TUI exchanges its token for a 30-second, single-use SSE ticket via `POST /api/auth/sse-ticket`.
- The long-lived token is never passed as a URL query parameter — only the short-lived ticket appears in the SSE URL.
- SSE tickets are SHA-256 hashed before storage; the raw ticket is never persisted on the server.
- If the token is revoked or expires, the next SSE ticket request returns 401 and the TUI shows the re-authentication message.
- SSE ticket is consumed exactly once on connection establishment — replayed tickets are rejected with 401.
- The ticket and token are never displayed in the TUI, included in debug logs, or surfaced in error messages.

### Rate Limiting

| Endpoint | Rate Limit | Behavior on 429 |
|---|---|---|
| POST /api/auth/sse-ticket | 10 tickets/user/min | Reconnection delayed by Retry-After header value |
| GET /api/notifications (SSE) | 10 connections/min | Reconnection backoff extended to max(current backoff, Retry-After) |

- The SSE stream is a single persistent connection, not repeated polling — it does not contribute to API rate limiting during normal operation.
- Rate limiting only applies during reconnection cycles, which generate new connection attempts.
- Rate limit errors are logged at `warn` level. The badge retains its last known count during rate limiting.
- Rate limiting does not surface a user-visible error unless the notification list screen is active, in which case the disconnection indicator appears.

### Data Sensitivity

- Notification subjects may contain repository names, issue titles, or user logins — user-scoped data visible only to the authenticated user.
- Notification body text may contain comment excerpts — already visible to the user in the source resource.
- SSE event payloads are transmitted over the same HTTPS/TLS connection as regular API calls.
- No additional PII is exposed through the SSE stream beyond what the REST API already provides.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| tui.notification.sse.connected | SSE notification stream successfully established | connection_time_ms, is_reconnection, auth_method ("ticket" or "bearer_fallback"), last_event_id, replayed_count |
| tui.notification.sse.disconnected | SSE notification stream lost | connected_duration_ms, events_received_count, reason ("server_close", "network", "keepalive_timeout", "auth_expired") |
| tui.notification.sse.reconnected | SSE successfully reconnected after a drop | reconnection_attempts, total_downtime_ms, replayed_count, deduplicated_count, auth_method |
| tui.notification.sse.reconnect_failed | Max reconnection attempts (20) exhausted | total_attempts, total_downtime_ms, last_error |
| tui.notification.sse.event_received | A notification event is received and processed | notification_id, source_type, was_duplicate, was_screen_visible ("notifications", "other"), processing_latency_ms |
| tui.notification.sse.ticket_error | SSE ticket acquisition failed | error_code, error_reason, is_reconnection |
| tui.notification.sse.badge_updated | Badge unread count changed due to SSE event | previous_count, new_count, trigger ("sse_event", "reconnect_replay", "mark_read", "mark_all_read") |
| tui.notification.sse.replay_completed | Last-Event-ID replay completed on reconnection | replayed_count, new_count, deduplicated_count, replay_duration_ms |
| tui.notification.sse.keepalive_timeout | Keep-alive timeout triggered (45s without data) | last_data_received_ms_ago, events_received_since_connect |

### Common Properties (all events)

- session_id: TUI session identifier
- timestamp: ISO 8601 event timestamp
- terminal_width: Current terminal column count
- terminal_height: Current terminal row count
- color_mode: "truecolor" | "256" | "16"
- breakpoint: "minimum" | "standard" | "large"
- active_screen: Current screen name (e.g., "notifications", "dashboard", "issues")

### Success Indicators

| Metric | Target | Description |
|---|---|---|
| SSE connection uptime | ≥95% of session time | SSE connection active for 95%+ of the time the TUI is running |
| Reconnection success rate | ≥95% within 3 attempts | Of automatic reconnections, 95%+ succeed within the first 3 backoff intervals |
| Event delivery latency | P95 <2s | Time from server PG NOTIFY to badge render in the TUI |
| Duplicate event rate | <5% of replay batches | Replayed events that were already present in client cache |
| Ticket exchange success rate | ≥98% | Of ticket requests, 98%+ succeed (excluding 401s from expired tokens) |
| Permanent failure rate | <1% | Sessions entering failed state |
| Keep-alive timeout false positives | <0.5% | Timeout when server is actually alive |
| Mean time to reconnect | <5s | Average time from disconnect to successful reconnection |
| Session uptime without any reconnect | >90% | Sessions that never experience a single SSE disconnect |
| Badge accuracy | 100% | Badge count matches actual unread count within 1 second of any change |
| Deduplication accuracy | 100% | Zero duplicate notifications displayed after reconnection replay |

## Observability

### Logging Requirements

| Level | Event | Payload |
|---|---|---|
| debug | SSE ticket acquired | SSE: ticket acquired [duration={ms}ms] [is_reconnection={bool}] |
| debug | SSE connection opening | SSE: connecting [url={url}] [auth={method}] [last_event_id={id}] |
| debug | SSE event received | SSE: event [id={id}] [source_type={type}] [is_duplicate={bool}] |
| debug | SSE keep-alive received | SSE: keepalive [channel=user_notifications_{userId}] |
| debug | SSE event deduplicated | SSE: duplicate filtered [id={id}] |
| debug | Badge count updated | SSE: badge [previous={n}] [new={m}] [trigger={trigger}] |
| info | SSE connected | SSE: connected [auth={method}] [duration={ms}ms] |
| info | SSE reconnected | SSE: reconnected [attempts={n}] [replayed={count}] [gap={ms}ms] |
| info | SSE replay completed | SSE: replay [received={n}] [new={m}] [duplicates={d}] [duration={ms}ms] |
| warn | SSE connection dropped | SSE: disconnected [reason={reason}] [connected_for={ms}ms] [will_retry={bool}] [next_retry={ms}ms] |
| warn | SSE reconnection attempt | SSE: reconnecting [attempt={n}] [backoff={ms}ms] |
| warn | SSE keep-alive timeout | SSE: keepalive timeout [last_data={ms}ms ago] |
| warn | SSE ticket exchange failed (non-auth) | SSE: ticket failed [status={code}] [error={msg}] |
| warn | SSE rate limited | SSE: rate limited [retry_after={s}s] [backoff_extended_to={ms}ms] |
| warn | SSE malformed event | SSE: malformed event [raw_length={n}] [parse_error={msg}] |
| warn | Cache at capacity | SSE: cache full [size=500] [evicted_oldest={bool}] |
| error | SSE auth failure | SSE: auth error [status={code}] [will_retry=false] |
| error | SSE permanent failure | SSE: permanent failure [attempts={n}] [total_downtime={ms}ms] [last_error={msg}] |
| error | SSE provider error | SSE: provider error [error={msg}] |

Logs to stderr via TUI debug log (enabled via CODEPLANE_TUI_DEBUG=1 or --debug flag). Never rendered to the terminal UI. Notification content (subjects, bodies) is never included in logs to avoid leaking user data. Level controlled by CODEPLANE_LOG_LEVEL (default: warn).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|---|---|---|---|
| Network unavailable at launch | SSE connection fails on first attempt | Status bar shows disconnected; reconnection backoff starts at 1s | Automatic reconnection; no user action needed |
| Server restart while connected | SSE stream terminates unexpectedly | Status bar transitions to disconnected; reconnection with Last-Event-ID replays missed events | Automatic; seamless if server restart <30s |
| SSH tunnel drops | SSE stream error/close event | Same as network unavailable | Automatic reconnection when tunnel re-establishes |
| Auth token expires mid-session | SSE ticket exchange returns 401 | Auth error screen pushed; SSE stops retrying | User runs codeplane auth login externally, restarts TUI |
| SSE ticket endpoint not configured | POST /api/auth/sse-ticket returns error | Falls back to bearer token auth on SSE endpoint | Automatic fallback; no degradation |
| SSE ticket expired before use | SSE endpoint rejects consumed/expired ticket | New ticket obtained, connection retried | Automatic; counts as one reconnection attempt |
| Keep-alive timeout (45s) | Client-side liveness timer fires | Connection assumed dead; reconnection initiated | Automatic reconnection with Last-Event-ID |
| Rapid event burst (10+ in <1s) | Events arrive faster than render cycle | Events queued and processed sequentially; UI updates batched by React 19 | Automatic |
| Malformed SSE event data | JSON.parse fails on data field | Event skipped; warning logged; no crash | Subsequent events processed normally |
| Unknown SSE event type | Event type is not "notification" | Silently ignored | Stream continues |
| Terminal resize during stream | SIGWINCH signal | SSE connection unaffected; visual elements re-render | Independent; both proceed normally |
| Process suspend (Ctrl+Z) + resume | Process resumes, connection likely stale | Detect stale connection on resume; force reconnection with Last-Event-ID | Brief disconnect; reconciles within seconds |
| 429 rate limit on reconnection | Server returns 429 | Backoff extended to max(current, Retry-After); badge retains last count | Resolves when rate limit window expires |
| 20 consecutive reconnection failures | Attempt counter reaches threshold | failed state; badge retains count; list screen shows persistent ⚠ | User restarts TUI or navigates away/back for REST refresh |
| SSE event during pagination fetch | Event arrives during in-flight list request | Event cached locally; merged after pagination response; deduplicated by ID | Seamless |
| Memory pressure (cache >500) | Item count check | Oldest read notifications evicted; unread retained | No visible impact |
| Component crash in event handler | Error thrown in subscriber callback | Caught by SSEProvider; logged; event dropped; SSE connection remains open | Automatic; stream continues |

### Health Check

The SSE provider exposes notificationStreamHealth:
- healthy: Connection active, receiving data within the last 45 seconds
- reconnecting: Connection lost, automatic reconnection in progress
- disconnected: Max reconnection attempts exhausted or auth expired

This state is consumed by:
1. NotificationBadge component — renders degraded badge styling when unhealthy
2. NotificationListScreen — renders ⚠ disconnection indicator when unhealthy
3. All telemetry events — included as sse_health property
4. SSEProvider — aggregated with other stream health states for the status bar's overall connection indicator

### Failure Modes

- Graceful degradation: When SSE is disconnected or failed, all TUI features continue to work. Notification data is stale but navigable. Mark-read operations still function via REST API.
- No cascading failures: SSE connection failure does not affect API calls, navigation, or any other TUI subsystem.
- Component crash isolation: If an SSE event handler throws, the error is caught by the SSEProvider, logged, and the event dropped — the SSE connection remains open.
- Memory bounded: The 500-item notification cap ensures bounded memory even under sustained event delivery.

## Verification

### Test File: `e2e/tui/notifications.test.ts`

All 51 tests left failing if backend is unimplemented — never skipped or commented out.

### SSE Connection Lifecycle Tests (10)

- SSE-NOTIF-001: establishes SSE connection on TUI mount for authenticated user — Launch TUI with valid auth token, assert SSE connection is opened to GET /api/notifications, assert connection established within 500ms of first render
- SSE-NOTIF-002: uses ticket-based authentication for SSE connection — Launch TUI, assert POST /api/auth/sse-ticket is called before SSE connection, assert SSE URL contains ?ticket= parameter, assert long-lived token is NOT in the SSE URL
- SSE-NOTIF-003: does not establish SSE connection without auth token — Launch TUI without auth token, assert no SSE connection is attempted, assert auth error screen is displayed
- SSE-NOTIF-004: cleans up SSE connection on TUI quit — Launch TUI and establish SSE connection, press q on root screen (or Ctrl+C), assert SSE connection is closed cleanly
- SSE-NOTIF-005: SSE connection is global (not screen-scoped) — Launch TUI on dashboard, assert SSE connection is active, navigate to issues screen (g i), assert same SSE connection remains active, navigate to notifications (g n), assert same connection
- SSE-NOTIF-006: handles keep-alive pings silently — Launch TUI, server sends keep-alive comment, assert no UI change, no badge update, connection remains healthy
- SSE-NOTIF-007: reconnects with exponential backoff on disconnect — Launch TUI, simulate SSE drop, assert first reconnection after ~1s, simulate second disconnect, assert ~2s, simulate third, assert ~4s
- SSE-NOTIF-008: obtains fresh SSE ticket on each reconnection — Launch TUI, simulate SSE disconnect, assert POST /api/auth/sse-ticket is called again, assert new ticket differs from initial
- SSE-NOTIF-009: sends Last-Event-ID on reconnection — Launch TUI, receive SSE event with id: 42, simulate disconnect, assert reconnection includes Last-Event-ID: 42 header
- SSE-NOTIF-010: stops reconnection after 20 attempts — Launch TUI, simulate 20 consecutive SSE failures, assert no further attempts, assert badge retains last known count

### Real-Time Badge Update Tests (8)

- SSE-BADGE-001: badge count increments on new notification SSE event — Launch TUI with 3 unread, server sends SSE event, assert badge updates from ◆ 3 to ◆ 4 within 500ms
- SSE-BADGE-002: badge flashes bold for 2 seconds on new notification — Launch TUI with 0 unread, server sends SSE event, assert badge renders bold within 200ms, wait 2.5s, assert normal weight
- SSE-BADGE-003: badge retains count on SSE disconnect — Launch TUI with 5 unread, simulate disconnect, assert badge still shows ◆ 5
- SSE-BADGE-004: badge updates after reconnection replay — Launch TUI with 3 unread, simulate disconnect, 2 new created on server, reconnect with replay, assert badge shows ◆ 5
- SSE-BADGE-005: badge deduplicates replayed events — Launch TUI with notification ID 42 received, disconnect and reconnect, server replays ID 42 + new ID 43, assert badge increments by 1
- SSE-BADGE-006: badge handles count above 99 — Launch TUI with 99 unread, server sends SSE event, assert badge shows ◆ 99+
- SSE-BADGE-007: badge on dashboard screen updates from SSE event — Launch TUI on dashboard (not notification list), server sends SSE event, assert badge in status bar updates
- SSE-BADGE-008: badge at zero shows muted style, transitions on first event — Launch TUI with 0 unread, assert muted color, server sends event, assert primary color with count 1

### Notification List Screen SSE Integration Tests (8)

- SSE-LIST-001: new SSE event prepended to active notification list — Navigate to list with 5 notifications, server sends SSE event, assert new notification at position 0, assert 6 items total
- SSE-LIST-002: prepended notification has reverse-video highlight — Navigate to list, server sends event, assert reverse video on first frame, removed on subsequent frame
- SSE-LIST-003: title unread count updates on SSE event — Navigate to list showing "Notifications (3 unread)", server sends event, assert title shows (4 unread)
- SSE-LIST-004: scroll position preserved when SSE event arrives during scroll — Navigate to list with 30 items, scroll to row 15, server sends event, assert focus preserved (now at position 16)
- SSE-LIST-005: SSE event visible when Unread filter active — Navigate to list, press f for Unread, server sends event, assert new notification appears in filtered list
- SSE-LIST-006: replayed event updates existing row in-place — Navigate to list with ID 42 visible (unread), disconnect, server marks 42 read, reconnect, replay shows ID 42 as read, assert updated styling, no duplicate
- SSE-LIST-007: disconnection indicator appears on list screen after 5s — Navigate to list, simulate disconnect, wait 5s, assert ⚠ indicator visible
- SSE-LIST-008: disconnection indicator disappears on SSE reconnect — Navigate to list with indicator visible, reconnect, assert indicator removed

### Reconnection and Replay Tests (6)

- SSE-REPLAY-001: replays missed notifications on reconnection — Receive IDs 40-42, disconnect, 3 new created (43-45), reconnect with Last-Event-ID: 42, assert 43-45 received
- SSE-REPLAY-002: deduplicates replayed events against local cache — Cache has 40-42, disconnect+reconnect, server replays 41-43, assert only 43 added new, 41-42 updated in-place
- SSE-REPLAY-003: replay handles empty response — Last event ID 42, disconnect+reconnect, 0 replayed events, assert no changes, stream continues
- SSE-REPLAY-004: replay handles large batch (1000 events) — Last event ID 1, disconnect, 1000 created, reconnect, assert all processed, cache respects 500 cap, badge correct
- SSE-REPLAY-005: replay concurrent with mark-read operation — Navigate to list, disconnect, press r to mark read (optimistic), reconnect, replay includes same notification as unread, assert reconciliation
- SSE-REPLAY-006: replay concurrent with mark-all-read operation — Navigate to list, disconnect, press R (optimistic), reconnect, replay includes new unread, assert new unread visible, previously-read reconciled

### Error Handling Tests (8)

- SSE-ERR-001: shows auth message on 401 ticket response — Launch TUI with expired token, assert auth error screen, no reconnection attempts
- SSE-ERR-002: handles 429 rate limit on ticket request — Mock ticket endpoint to return 429 with Retry-After: 10, assert next attempt delayed ≥10s, badge retains count
- SSE-ERR-003: discards malformed SSE events gracefully — Establish SSE, server sends invalid JSON, assert no crash, badge unchanged, subsequent valid event processed
- SSE-ERR-004: ignores SSE events with unknown type — Establish SSE, server sends event: unknown_type, assert no crash, stream continues for notification events
- SSE-ERR-005: handles null fields in notification payload — Server sends event with source_id: null and body: null, assert no crash, badge increments, list shows blank body
- SSE-ERR-006: survives terminal resize during active SSE — Establish SSE at 120×40, resize to 80×24, assert SSE NOT interrupted, server sends event, assert badge updates
- SSE-ERR-007: survives process suspend and resume — Establish SSE, simulate SIGTSTP+SIGCONT, assert reconnection triggered, Last-Event-ID sent
- SSE-ERR-008: handles SSE event during pagination fetch — Navigate to list, trigger pagination, SSE event arrives during in-flight fetch, assert cached and merged, no duplicates

### Terminal Snapshot Tests (8)

- SNAP-SSE-NOTIF-001: Badge with SSE-delivered count at 120×40 — status bar showing ◆ 5
- SNAP-SSE-NOTIF-002: Badge bold flash after SSE notification at 120×40 — bold ◆ 3 within 1 second
- SNAP-SSE-NOTIF-003: Badge at zero after mark-all-read at 120×40 — muted ◆ with no count
- SNAP-SSE-NOTIF-004: Notification list with SSE-delivered new item at 120×40 — new row at top with highlight
- SNAP-SSE-NOTIF-005: Disconnection indicator on notification list at 120×40 — ⚠ No live updates
- SNAP-SSE-NOTIF-006: Badge at 80×24 minimum with SSE count — compact badge rendering
- SNAP-SSE-NOTIF-007: Badge count 99+ via SSE at 120×40 — ◆ 99+
- SNAP-SSE-NOTIF-008: Notification list after SSE replay at 120×40 — replayed events merged correctly

### Responsive Tests (3)

- RESP-SSE-NOTIF-001: 80×24 — badge renders, SSE events update it, SSE behavior identical to larger sizes
- RESP-SSE-NOTIF-002: 120×40 — standard badge and disconnection indicator shows full text ⚠ No live updates
- RESP-SSE-NOTIF-003: 200×60 — expanded disconnection indicator shows ⚠ Live updates unavailable — reconnecting…

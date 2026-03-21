# NOTIFICATION_LIST

Specification for NOTIFICATION_LIST.

## High-Level User POV

Codeplane keeps you informed about activity that matters to you. The notification list is your personal inbox for everything happening across your repositories, landing requests, issues, workflows, and workspaces. When someone comments on your issue, reviews your landing request, pushes changes to a landing request you've reviewed, shares a workspace with you, or when a workflow run you initiated completes, Codeplane creates a notification and delivers it to you in real time.

The notification list is available everywhere you use Codeplane. On the web, it lives in your inbox. In the CLI, it's a simple `codeplane notification list` command. In the TUI, it's a full-screen notifications view reachable from the dashboard. In VS Code and Neovim, it's surfaced in the status bar. Regardless of which surface you use, you see the same notifications in the same order — newest first — because every client reads from the same API.

Each notification tells you what happened, which resource it relates to (an issue, landing request, workflow run, or workspace), and when it happened. Unread notifications are visually distinct so you can quickly scan for what's new. You can mark individual notifications as read, or mark everything as read at once. If you navigate to the source resource from a notification, it's automatically marked as read.

Notifications arrive in real time via a streaming connection. When a new notification is created while you have the inbox open or the TUI running, it appears immediately — no manual refresh needed. If your connection drops and reconnects, any notifications you missed during the gap are replayed so you never lose track.

You control whether you receive notifications at all through a simple toggle in your user settings. If you disable notifications, the fanout pipeline skips you entirely and no notifications are created for your account.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can retrieve a paginated list of their own notifications, sorted newest-first.
- [ ] Each notification includes: id, source type, source id, subject, body preview, read/unread status, read timestamp, created timestamp, and updated timestamp.
- [ ] The list endpoint returns a total count header (`X-Total-Count`) to support pagination controls.
- [ ] Users can mark a single notification as read by its ID.
- [ ] Users can mark all unread notifications as read in a single action.
- [ ] Real-time notification delivery works via SSE, with automatic reconnection and missed-notification replay.
- [ ] The CLI `notification list` command outputs the notification list in structured JSON.
- [ ] The TUI displays notifications in a full-screen list view with keyboard navigation.
- [ ] The web inbox surface renders the notification list with unread indicators.
- [ ] All clients consume the same API endpoints and produce visually consistent results.

### Pagination Constraints

- [ ] Default page size is 30 notifications per page.
- [ ] Maximum page size is 50 notifications per page. Requests for `per_page > 50` are silently clamped to 50.
- [ ] Page numbers below 1 are silently normalized to 1.
- [ ] Page numbers beyond the total page count return an empty array (not an error).
- [ ] The `X-Total-Count` response header is always present and reflects the total number of notifications for the user (not just the current page).

### Data Constraints

- [ ] Notification `subject` is a non-empty string, maximum 255 characters.
- [ ] Notification `body` is a text field. Body previews displayed in list views are truncated to 120 characters in the UI and 200 characters at the fanout/storage layer.
- [ ] `source_type` is one of: `issue`, `issue_comment`, `landing_request`, `lr_review`, `lr_comment`, `workspace`, `workflow_run`.
- [ ] `source_id` may be null (for notifications not tied to a specific resource record).
- [ ] `status` is either `read` or `unread`. Newly created notifications default to `unread`.
- [ ] `read_at` is null for unread notifications and an ISO 8601 timestamp for read notifications.
- [ ] All timestamps are returned in ISO 8601 format (UTC).

### Edge Cases

- [ ] A user with zero notifications receives an empty array `[]` with `X-Total-Count: 0`.
- [ ] Marking a notification as read that is already read is a no-op and returns 204 (idempotent).
- [ ] Marking all as read when there are no unread notifications is a no-op and returns 204 (idempotent).
- [ ] Marking a notification as read with an ID that doesn't belong to the authenticated user is a silent no-op (no error leakage about other users' notifications).
- [ ] Invalid notification IDs (non-numeric, zero, negative) return 400 Bad Request.
- [ ] Unauthenticated requests to any notification endpoint return 401 Unauthorized.
- [ ] SSE replay via `Last-Event-ID` is capped at 1,000 events. If more than 1,000 notifications were created since the last seen ID, only the 1,000 oldest-first are replayed; the client should fall back to a full list fetch for the remainder.
- [ ] SSE keep-alive comments are sent every 15 seconds to prevent connection timeouts.
- [ ] Users who have disabled notifications (`email_notifications_enabled = false`) receive no new notifications from the fanout pipeline, but can still view and manage previously created notifications.

### Security Constraints

- [ ] Users can only list, view, and manage their own notifications. There is no cross-user notification access.
- [ ] Error responses for permission violations return 404 (not 403) to avoid leaking the existence of other users' notifications.

## Design

### API Shape

#### `GET /api/notifications/list` — List notifications (paginated)

**Authentication**: Required (session cookie or PAT).

**Query Parameters**:

| Parameter  | Type   | Default | Constraints     | Description               |
|------------|--------|---------|-----------------|---------------------------|
| `page`     | int    | 1       | min 1           | Page number               |
| `per_page` | int    | 30      | min 1, max 50   | Results per page          |

**Response**: `200 OK`

**Headers**:
- `X-Total-Count`: total number of notifications for this user (integer as string)

**Body** (JSON array):
```json
[
  {
    "id": 42,
    "user_id": 7,
    "source_type": "issue_comment",
    "source_id": 123,
    "subject": "New comment on issue #5: Fix login bug",
    "body": "I think we should also handle the edge case where...",
    "status": "unread",
    "read_at": null,
    "created_at": "2026-03-22T14:30:00.000Z",
    "updated_at": "2026-03-22T14:30:00.000Z"
  }
]
```

**Error Responses**:
- `401 Unauthorized` — missing or invalid authentication

---

#### `GET /api/notifications` — Real-time notification stream (SSE)

**Authentication**: Required.

**Headers**:
- `Last-Event-ID` (optional): notification ID to replay from on reconnection. Up to 1,000 missed events are replayed.

**Response**: `200 OK` with `Content-Type: text/event-stream`

**Event Format**:
```
id: 42
event: notification
data: {"id":42,"user_id":7,"source_type":"issue","source_id":10,"subject":"You were assigned to issue #3: Refactor auth","body":"","status":"unread","read_at":null,"created_at":"2026-03-22T14:30:00.000Z","updated_at":"2026-03-22T14:30:00.000Z"}
```

**Keep-alive**: `: keep-alive\n\n` comment every 15 seconds.

---

#### `PATCH /api/notifications/:id` — Mark a single notification as read

**Authentication**: Required.

**Path Parameters**:
- `id` (int, required): notification ID. Must be > 0.

**Response**: `204 No Content`

**Error Responses**:
- `400 Bad Request` — invalid notification ID (non-numeric, zero, or negative)
- `401 Unauthorized` — missing or invalid authentication

---

#### `PUT /api/notifications/mark-read` — Mark all notifications as read

**Authentication**: Required.

**Response**: `204 No Content`

**Error Responses**:
- `401 Unauthorized` — missing or invalid authentication

---

### SDK Shape

The `NotificationService` class in `@codeplane/sdk` provides:

- `listNotifications(userId: number, page: number, perPage: number)` → `Result<NotificationListResult, APIError>` — returns `{ items: NotificationResponse[], total: number }`.
- `listNotificationsAfterID(userId: number, afterId: number, limit: number)` → `Result<NotificationResponse[], APIError>` — for SSE replay, capped at 1,000 results.
- `markRead(userId: number, notificationId: number)` → `Result<void, APIError>` — marks a single notification as read.
- `markAllRead(userId: number)` → `Result<void, APIError>` — marks all unread notifications as read.
- `create(input: CreateNotificationInput)` → `Result<NotificationResponse, APIError>` — creates a notification and emits PG NOTIFY for real-time delivery.

The `NotificationFanoutService` class handles event-driven notification creation:

- `onIssueAssigned(event)` — notifies assignees and repo watchers (excluding actor).
- `onIssueCommented(event)` — notifies issue author, assignees, @mentioned users, and repo watchers (excluding commenter).
- `onLRReviewed(event)` — notifies LR author (excluding reviewer).
- `onLRCommented(event)` — notifies LR author, @mentioned users, and repo watchers (excluding commenter).
- `onLRChangesPushed(event)` — notifies all prior reviewers (excluding pusher).
- `onWorkspaceStatusChanged(event)` — notifies workspace owner on failure status only.
- `onWorkspaceShared(event)` — notifies shared-with users (excluding sharer).
- `onWorkflowRunCompleted(event)` — notifies run initiator.

All fanout is best-effort: individual recipient failures are logged but do not fail the entire fan-out. Users with notifications disabled are skipped. Recipients are deduplicated. The actor who triggered the event is always excluded.

---

### CLI Command

#### `codeplane notification list`

Lists the authenticated user's notifications.

**Options**:

| Flag        | Type    | Default | Description                   |
|-------------|---------|---------|-------------------------------|
| `--unread`  | boolean | false   | Show only unread notifications|
| `--page`    | int     | 1       | Page number                   |
| `--limit`   | int     | 30      | Results per page (max 50)     |

**Output** (JSON):
```json
[
  {
    "id": 42,
    "source_type": "issue_comment",
    "subject": "New comment on issue #5: Fix login bug",
    "status": "unread",
    "created_at": "2026-03-22T14:30:00.000Z"
  }
]
```

**Exit codes**: 0 = success, 1 = authentication failure or network error.

#### `codeplane notification read <id>`

Marks a single notification as read.

**Arguments**: `id` (string, optional) — notification ID. Required unless `--all` is specified.

**Options**: `--all` (boolean, default false) — mark all notifications as read.

**Exit codes**: 0 = success, 1 = missing ID / invalid ID / auth failure / network error.

---

### Web UI Design

#### Inbox Page (`/inbox`)

The inbox page presents the notification list in a full-page view.

**Layout**:
- **Header bar**: Page title "Inbox" with an unread count badge. "Mark all as read" button (disabled when no unread notifications).
- **Filter toolbar**: Toggle between "All" and "Unread" views.
- **Notification list**: Vertically scrollable list of notification rows.
- **Pagination footer**: Page navigation controls showing current page, total pages, and page size selector.

**Notification Row**:
- **Unread indicator**: Blue dot (●) on the left for unread notifications.
- **Source type icon**: Icon representing the source type (issue, landing request, workflow, workspace).
- **Subject line**: The notification subject, truncated with ellipsis if it exceeds available width. Bold for unread, regular for read.
- **Body preview**: Truncated body text (up to 120 characters) in muted color beneath the subject.
- **Timestamp**: Relative time ("2 minutes ago") with full ISO timestamp on hover tooltip.
- **Actions**: Hover-revealed "Mark as read" button (only shown for unread notifications).

**Empty States**:
- No notifications at all: "You're all caught up. No notifications yet."
- No unread (Unread filter): "No unread notifications."

**Interactions**:
- Clicking a row navigates to the source resource and marks as read.
- "Mark all as read" button triggers `PUT /api/notifications/mark-read` and optimistically updates all visible rows.
- Filter toggle between All/Unread.

**Real-time Updates**:
- New SSE notifications are prepended to the list with a brief highlight animation.
- Unread count badge updates in real time.
- In "Unread" filter, read notifications fade out after 200ms.

---

### TUI UI

#### Notifications Screen (reached via `g n` or `:notifications`)

**Layout** (80×24 minimum):
- **Title row**: "Notifications" with unread count.
- **Filter toolbar**: `[All]` / `[Unread]` toggle.
- **Scrollable list**: Notification rows with columns: unread indicator (●), source type icon, subject, body preview, timestamp.
- **Pagination footer**: "Page 1 of N" with arrow key hints.

**Keybindings**: `j`/`k` (move), `Enter` (navigate to source), `r` (mark read), `R` (mark all read), `f` (toggle filter), `/` (search), `q` (back), `n`/`p` (next/prev page).

**Responsive Behavior**: At 80×24: Subject truncated, no body preview. At 120×40: Full subject + short body preview. At 200×60+: Full subject + extended body preview.

**Real-time**: SSE notifications prepend with flash highlight. Badge updates immediately.

**Optimistic Updates**: Mark-read applies instantly; reverts on error with status bar flash.

---

### Editor Integrations

**VS Code**: Status bar badge shows unread count. `codeplane.notifications` command opens dashboard webview. Daemon integration for real-time updates.

**Neovim**: `:CodeplaneNotifications` opens notification list buffer. Statusline shows unread count. Daemon sync keeps state current.

---

### Documentation

1. **Inbox / Notifications Overview**: The notification system, event types, and multi-surface access.
2. **Notification Types Reference**: Table of `source_type` values with subject examples.
3. **CLI Notifications Guide**: Usage examples for list, read, and read --all.
4. **Notification Preferences**: Enable/disable toggle and its effect on fanout.
5. **Real-time Notifications**: SSE streaming, reconnection, and replay behavior.
6. **API Reference — Notifications**: Full endpoint documentation for all four endpoints.

## Permissions & Security

### Authorization Roles

| Action                    | Anonymous | Read-Only | Member | Admin | Owner |
|---------------------------|-----------|-----------|--------|-------|-------|
| List own notifications    | ❌         | ✅         | ✅      | ✅     | ✅     |
| Stream own notifications  | ❌         | ✅         | ✅      | ✅     | ✅     |
| Mark own as read          | ❌         | ✅         | ✅      | ✅     | ✅     |
| Mark all own as read      | ❌         | ✅         | ✅      | ✅     | ✅     |
| List other user's notifs  | ❌         | ❌         | ❌      | ❌     | ❌     |

All notification operations are strictly scoped to the authenticated user. There is no admin override to view another user's notifications. The database queries always include `WHERE user_id = $authenticated_user_id` as a hard filter.

### Rate Limiting

| Endpoint                         | Rate Limit        | Window |
|----------------------------------|-------------------|--------|
| `GET /api/notifications/list`    | 300 requests      | 1 min  |
| `GET /api/notifications` (SSE)   | 10 connections    | 1 min  |
| `PATCH /api/notifications/:id`   | 120 requests      | 1 min  |
| `PUT /api/notifications/mark-read`| 30 requests      | 1 min  |

SSE rate limiting counts new connection establishments, not individual events on an active stream. The 10-connection-per-minute limit prevents reconnection storms.

### Data Privacy & PII

- Notification subjects may contain repository names, issue titles, landing request titles, workspace names, and usernames. These are generated by the system from existing repository data the user already has access to.
- Notification bodies may contain truncated comment text including @mentions.
- No notification endpoint exposes another user's notification data. All queries are strictly user-scoped.
- The SSE channel name includes the user ID (`user_notifications_{userId}`), and PostgreSQL LISTEN/NOTIFY isolation ensures users only receive events on their own channel.
- Notification list responses do not include the user's email, password hash, or other sensitive account fields.
- PG NOTIFY payloads contain only the notification ID and subject — not the full notification body — to minimize data exposure in the PostgreSQL notification channel.

## Telemetry & Product Analytics

### Business Events

| Event Name                     | Trigger                                              | Properties                                                                                    |
|--------------------------------|------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `NotificationListViewed`       | User opens the notification list (web, TUI, CLI)     | `user_id`, `surface` (web/cli/tui), `page`, `per_page`, `total_count`, `unread_count`         |
| `NotificationMarkedRead`       | User marks a single notification as read             | `user_id`, `notification_id`, `source_type`, `surface`, `time_to_read_ms` (created→read delta) |
| `NotificationAllMarkedRead`    | User marks all notifications as read                 | `user_id`, `surface`, `unread_count_before`                                                   |
| `NotificationClicked`          | User navigates to the source resource                | `user_id`, `notification_id`, `source_type`, `surface`, `was_unread`                          |
| `NotificationSSEConnected`     | SSE stream established                               | `user_id`, `surface`, `reconnect` (boolean), `last_event_id` (if reconnect)                   |
| `NotificationSSEDisconnected`  | SSE stream dropped                                   | `user_id`, `surface`, `duration_seconds`, `events_received`                                   |
| `NotificationCreated`          | Fanout pipeline creates a notification for a user    | `user_id`, `source_type`, `source_id`, `trigger_event` (e.g. `issue_commented`)                |
| `NotificationFanoutSkipped`    | User skipped during fanout (notifications disabled)  | `user_id`, `trigger_event`                                                                    |

### Funnel Metrics & Success Indicators

1. **Notification engagement rate**: `NotificationClicked / NotificationCreated` — target > 30%. Indicates notifications are relevant and actionable.
2. **Time-to-read**: Median time between `NotificationCreated` and `NotificationMarkedRead`. Target < 4 hours. Indicates users are reviewing notifications promptly.
3. **Inbox zero rate**: Percentage of users with 0 unread notifications at end of day. Target > 50%.
4. **SSE connection stability**: `NotificationSSEDisconnected (duration < 30s) / NotificationSSEConnected`. Target < 5%. High early disconnections indicate infrastructure issues.
5. **Mark-all-read frequency**: High frequency of `NotificationAllMarkedRead` with high `unread_count_before` may indicate notification fatigue or low relevance.
6. **Fanout skip rate**: `NotificationFanoutSkipped / (NotificationCreated + NotificationFanoutSkipped)`. A rising skip rate means users are opting out.
7. **Multi-surface engagement**: Users who view notifications on 2+ surfaces (web + CLI, web + TUI, etc.) in the same week.

## Observability

### Logging Requirements

| Log Event                              | Level  | Structured Context                                                                        |
|----------------------------------------|--------|-------------------------------------------------------------------------------------------|
| Notification list request              | INFO   | `user_id`, `page`, `per_page`, `result_count`, `total_count`, `duration_ms`              |
| Notification list request failed       | ERROR  | `user_id`, `page`, `per_page`, `error`, `duration_ms`                                    |
| Notification marked read               | INFO   | `user_id`, `notification_id`, `duration_ms`                                               |
| All notifications marked read          | INFO   | `user_id`, `duration_ms`                                                                  |
| Mark read failed                       | ERROR  | `user_id`, `notification_id`, `error`, `duration_ms`                                     |
| SSE connection opened                  | INFO   | `user_id`, `channel`, `last_event_id` (if present)                                       |
| SSE connection closed                  | INFO   | `user_id`, `channel`, `duration_seconds`, `events_sent`                                   |
| SSE replay executed                    | INFO   | `user_id`, `last_event_id`, `replayed_count`                                              |
| SSE replay failed                      | ERROR  | `user_id`, `last_event_id`, `error`                                                       |
| PG NOTIFY emitted                      | DEBUG  | `user_id`, `notification_id`, `channel`                                                    |
| PG NOTIFY failed                       | WARN   | `user_id`, `notification_id`, `error`                                                      |
| Fanout: notification created           | INFO   | `recipient_user_id`, `source_type`, `source_id`, `trigger`                                |
| Fanout: recipient skipped (disabled)   | DEBUG  | `recipient_user_id`, `trigger`                                                             |
| Fanout: recipient failed               | WARN   | `recipient_user_id`, `source_type`, `source_id`, `error`                                  |
| Fanout: mention resolved               | DEBUG  | `mentioned_username`, `resolved_user_id`                                                  |
| Fanout: mention resolution failed      | WARN   | `mentioned_username`, `error`                                                              |
| Invalid notification ID in request     | WARN   | `user_id`, `raw_id_value`                                                                  |
| Rate limit exceeded                    | WARN   | `user_id`, `endpoint`, `rate_limit`, `window`                                              |

### Prometheus Metrics

**Counters**:
- `codeplane_notifications_list_total{status="success|error"}` — total notification list requests.
- `codeplane_notifications_mark_read_total{scope="single|all", status="success|error"}` — mark-read operations.
- `codeplane_notifications_sse_connections_total{action="opened|closed"}` — SSE connection lifecycle events.
- `codeplane_notifications_sse_events_sent_total` — total SSE events pushed to clients.
- `codeplane_notifications_sse_replays_total{status="success|error"}` — SSE replay operations.
- `codeplane_notifications_created_total{source_type}` — notifications created by source type.
- `codeplane_notifications_fanout_skipped_total{reason="disabled|error"}` — fanout skip reasons.
- `codeplane_notifications_rate_limited_total{endpoint}` — rate limit rejections.

**Gauges**:
- `codeplane_notifications_sse_active_connections` — currently open SSE connections.
- `codeplane_notifications_unread_total` — aggregate unread notifications across all users (sampled periodically).

**Histograms**:
- `codeplane_notifications_list_duration_seconds` — list query latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5).
- `codeplane_notifications_mark_read_duration_seconds` — mark-read operation latency.
- `codeplane_notifications_fanout_duration_seconds` — per-event fanout execution time.
- `codeplane_notifications_sse_connection_duration_seconds` — SSE connection duration (buckets: 1, 10, 60, 300, 900, 3600).
- `codeplane_notifications_list_result_count` — notifications returned per list request (buckets: 0, 1, 5, 10, 20, 30, 50).

### Alerts & Runbooks

#### Alert: `NotificationListLatencyHigh`
**Condition**: `histogram_quantile(0.95, codeplane_notifications_list_duration_seconds) > 2.0` for 5 minutes.
**Severity**: Warning
**Runbook**:
1. Check PostgreSQL slow query log for the `ListNotificationsByUser` query.
2. Verify the `notifications` table has indexes on `(user_id, created_at DESC)`.
3. Check if a specific user has an unusually large number of notifications (> 100k). If so, consider archiving old read notifications.
4. Check database connection pool utilization — may indicate connection starvation.
5. Check if disk I/O is saturated on the database host.

#### Alert: `NotificationSSEConnectionSpikeHigh`
**Condition**: `rate(codeplane_notifications_sse_connections_total{action="opened"}[5m]) > 100` sustained for 5 minutes.
**Severity**: Warning
**Runbook**:
1. Check if there's a reconnection storm (high `opened` rate with matching `closed` rate and short durations).
2. Verify PostgreSQL LISTEN/NOTIFY is functioning — run `SELECT pg_listening_channels()`.
3. Check if the keep-alive interval is working (client timeout may be firing prematurely).
4. Review client logs for SSE connection errors.
5. Check memory usage on the server — each SSE connection holds state.

#### Alert: `NotificationSSEActiveConnectionsHigh`
**Condition**: `codeplane_notifications_sse_active_connections > 10000`
**Severity**: Critical
**Runbook**:
1. Verify the connection count against active user count — may be legitimate growth.
2. Check for connection leaks: connections that stay open but never receive events.
3. Review server memory and file descriptor usage.
4. Consider scaling horizontally or implementing connection limits per user.
5. If a specific user has hundreds of connections, it may indicate a misbehaving client.

#### Alert: `NotificationFanoutFailureRateHigh`
**Condition**: `rate(codeplane_notifications_fanout_skipped_total{reason="error"}[10m]) / rate(codeplane_notifications_created_total[10m]) > 0.1` for 10 minutes.
**Severity**: Warning
**Runbook**:
1. Check the fanout service WARN logs for specific error patterns.
2. Verify database connectivity.
3. Check if a specific source type is causing all the failures.
4. Verify the `users` table is accessible (fanout checks `emailNotificationsEnabled`).
5. If transient, best-effort design means missed notifications are acceptable. If persistent, investigate database.

#### Alert: `NotificationMarkReadErrorRateHigh`
**Condition**: `rate(codeplane_notifications_mark_read_total{status="error"}[5m]) / rate(codeplane_notifications_mark_read_total[5m]) > 0.05` for 5 minutes.
**Severity**: Warning
**Runbook**:
1. Check error logs for specific error type.
2. Verify the `notifications` table is writable.
3. Check if a specific user is generating all the errors.
4. Verify the `UPDATE` query has the expected index on `(id, user_id)`.

#### Alert: `NotificationPGNotifyFailureRateHigh`
**Condition**: Sustained PG NOTIFY failure rate > 10/min for 5 minutes.
**Severity**: Warning
**Runbook**:
1. Check PostgreSQL notification queue size — `pg_notification_queue_usage()`. If > 50%, queue is backing up.
2. Verify there are active LISTEN connections consuming from the channels.
3. Check PostgreSQL connection limits.
4. Restart SSE connections to re-establish LISTEN if needed.

### Error Cases and Failure Modes

| Failure Mode                                  | Impact                                              | Mitigation                                                      |
|-----------------------------------------------|-----------------------------------------------------|-----------------------------------------------------------------|
| Database unavailable                          | List returns 500; mark-read fails                   | Service returns error result; client retries with backoff        |
| PG NOTIFY channel full                        | Real-time delivery delayed; SSE clients stale       | Keep-alive detects stale; client falls back to polling list      |
| SSE connection dropped                        | User misses real-time notifications temporarily     | Client reconnects with `Last-Event-ID`; replay catches up        |
| Fanout recipient DB lookup fails              | One recipient misses notification                   | Best-effort skip; logged at WARN; other recipients unaffected    |
| User has 100k+ notifications                  | List query slow; high memory usage                  | Pagination limits exposure; alert on latency; archive old data   |
| PG NOTIFY payload too large                   | Notification not delivered in real-time              | Payload minimized to ID+subject only; full data fetched by client|
| Rate limit exceeded                           | Client receives 429; notifications not lost         | Client retries after backoff; notifications persist in DB        |
| SSE replay gap > 1,000 notifications          | Client may miss some notifications on reconnect     | Client detects gap and performs full list re-fetch                |

## Verification

### API Integration Tests

#### Authentication & Authorization
- [ ] `GET /api/notifications/list` without auth returns 401.
- [ ] `GET /api/notifications/list` with valid PAT returns 200 and JSON array.
- [ ] `GET /api/notifications/list` with expired PAT returns 401.
- [ ] `GET /api/notifications/list` with valid session cookie returns 200.
- [ ] `PATCH /api/notifications/:id` without auth returns 401.
- [ ] `PUT /api/notifications/mark-read` without auth returns 401.
- [ ] `GET /api/notifications` (SSE) without auth returns 401.
- [ ] User A cannot see User B's notifications — list returns only own notifications.

#### Pagination
- [ ] Default pagination returns up to 30 results with `X-Total-Count` header.
- [ ] `?per_page=5&page=1` returns exactly 5 results when total > 5.
- [ ] `?per_page=5&page=2` returns the next 5 results (different IDs from page 1).
- [ ] `?per_page=50` returns up to 50 results (max boundary).
- [ ] `?per_page=51` is clamped to 50 and returns up to 50 results.
- [ ] `?per_page=100` is clamped to 50.
- [ ] `?per_page=0` is normalized to default (30).
- [ ] `?per_page=-1` is normalized to default (30).
- [ ] `?page=0` is normalized to page 1.
- [ ] `?page=-1` is normalized to page 1.
- [ ] `?page=999999` (beyond total pages) returns empty array with correct `X-Total-Count`.
- [ ] `X-Total-Count` reflects the total number of notifications, not the page count.
- [ ] With exactly 30 notifications, `?per_page=30&page=1` returns 30, `page=2` returns 0.
- [ ] With 0 notifications, returns empty array `[]` with `X-Total-Count: 0`.

#### Sort Order
- [ ] Notifications are returned in `created_at DESC` order (newest first).
- [ ] Creating a new notification and re-fetching shows it first in the list.

#### Mark Single Read
- [ ] `PATCH /api/notifications/:id` with valid unread notification ID returns 204 and sets status to `read`.
- [ ] After marking read, `GET /api/notifications/list` shows `status: "read"` and non-null `read_at`.
- [ ] `PATCH /api/notifications/:id` with already-read notification returns 204 (idempotent).
- [ ] `PATCH /api/notifications/0` returns 400.
- [ ] `PATCH /api/notifications/-1` returns 400.
- [ ] `PATCH /api/notifications/abc` returns 400.
- [ ] `PATCH /api/notifications/9999999` (non-existent for this user) returns 204 (silent no-op).
- [ ] Marking User B's notification ID as User A returns 204 but does not actually modify User B's notification.

#### Mark All Read
- [ ] `PUT /api/notifications/mark-read` with unread notifications returns 204 and marks all as read.
- [ ] After mark-all, `GET /api/notifications/list` shows all notifications with `status: "read"`.
- [ ] `PUT /api/notifications/mark-read` with no unread notifications returns 204 (idempotent).
- [ ] `PUT /api/notifications/mark-read` with zero notifications returns 204.

#### SSE Streaming
- [ ] `GET /api/notifications` returns `Content-Type: text/event-stream`.
- [ ] Creating a notification for the connected user results in an SSE event within 5 seconds.
- [ ] SSE event `data` field is valid JSON matching `NotificationResponse` schema.
- [ ] SSE event has `id` field matching the notification ID.
- [ ] SSE event has `event: notification` type.
- [ ] SSE keep-alive comment arrives within 20 seconds of connection.
- [ ] Reconnecting with `Last-Event-ID: X` replays all notifications with `id > X`.
- [ ] Reconnecting with `Last-Event-ID: 0` replays all notifications (up to 1,000).
- [ ] Reconnecting with invalid `Last-Event-ID: abc` does not replay (non-numeric ignored).
- [ ] Replay is capped at 1,000 events even if more exist.
- [ ] Replay events are in `id ASC` order (oldest first for replay).

#### Response Shape
- [ ] Each notification has all required fields: `id`, `user_id`, `source_type`, `source_id`, `subject`, `body`, `status`, `read_at`, `created_at`, `updated_at`.
- [ ] `id` is a positive integer.
- [ ] `source_type` is one of the known values: `issue`, `issue_comment`, `landing_request`, `lr_review`, `lr_comment`, `workspace`, `workflow_run`.
- [ ] `source_id` is either a positive integer or null.
- [ ] `status` is either `"read"` or `"unread"`.
- [ ] `read_at` is null for unread, ISO 8601 string for read.
- [ ] `created_at` and `updated_at` are ISO 8601 strings.
- [ ] `subject` is a non-empty string, max 255 characters.

#### Data Boundary Tests
- [ ] Notification with subject of exactly 255 characters is stored and returned correctly.
- [ ] Notification with body of exactly 200 characters (fanout truncation boundary) is stored without truncation suffix.
- [ ] Notification with body of 201 characters is truncated to 200 + "..." in fanout.
- [ ] Notification with empty body (`""`) is stored and returned correctly.
- [ ] `per_page=50` (maximum valid) returns up to 50 results correctly.

### CLI E2E Tests

- [ ] `codeplane notification list` without auth returns non-zero exit code.
- [ ] `codeplane notification list` with valid token returns exit 0 and JSON array.
- [ ] `codeplane notification list --page 1 --limit 5` returns ≤5 results.
- [ ] `codeplane notification list --unread` returns only unread notifications (or all with `status: unread`).
- [ ] `codeplane notification read <valid-id>` returns exit 0.
- [ ] `codeplane notification read 0` returns non-zero exit code.
- [ ] `codeplane notification read` (no id, no --all) returns non-zero exit code with help message.
- [ ] `codeplane notification read --all` returns exit 0.
- [ ] `codeplane notification read --all` without auth returns non-zero exit code.
- [ ] After `codeplane notification read --all`, `codeplane notification list --unread` returns empty list.

### Fanout Integration Tests

- [ ] Assigning a user to an issue creates a notification for the assignee.
- [ ] Commenting on an issue creates notifications for the issue author and assignees (excluding commenter).
- [ ] Commenting with @mentions creates notifications for mentioned users.
- [ ] Reviewing a landing request creates a notification for the LR author.
- [ ] Commenting on a landing request creates a notification for the LR author (excluding commenter).
- [ ] Pushing changes to a LR creates notifications for all prior reviewers.
- [ ] Workspace failure creates a notification for the workspace owner.
- [ ] Sharing a workspace creates notifications for shared-with users (excluding sharer).
- [ ] Workflow run completion creates a notification for the initiator.
- [ ] The actor who triggered the event does NOT receive a notification.
- [ ] A user with notifications disabled does NOT receive any notification.
- [ ] Duplicate recipients (e.g., user is both assignee and watcher) receive only one notification.
- [ ] @mention resolution is case-insensitive.
- [ ] @mention of a non-existent username is silently ignored.
- [ ] Fanout with 0 recipients (all excluded/disabled) completes successfully.

### Playwright (Web UI) E2E Tests

- [ ] Navigating to `/inbox` when authenticated shows the notification list page.
- [ ] Navigating to `/inbox` when unauthenticated redirects to login.
- [ ] Notification list renders notification rows with subject, source type icon, and timestamp.
- [ ] Unread notifications display the blue unread indicator dot.
- [ ] Read notifications do not display the blue unread indicator dot.
- [ ] Clicking a notification row navigates to the correct source resource page.
- [ ] Clicking an unread notification marks it as read (indicator disappears on return).
- [ ] "Mark all as read" button marks all visible notifications as read.
- [ ] "Mark all as read" button is disabled when there are no unread notifications.
- [ ] Toggling to "Unread" filter hides read notifications.
- [ ] Toggling back to "All" shows all notifications.
- [ ] Pagination controls navigate between pages.
- [ ] Empty state message displays when user has no notifications.
- [ ] Unread filter empty state displays when all notifications are read.
- [ ] Page loads within 2 seconds with 50 notifications.

### TUI Integration Tests

- [ ] `g n` keybinding navigates to the notifications screen.
- [ ] Notifications screen renders notification rows with correct columns.
- [ ] `j`/`k` moves focus between notification rows.
- [ ] `r` on an unread notification marks it as read (indicator updates).
- [ ] `r` on a read notification is a no-op.
- [ ] `R` marks all notifications as read.
- [ ] `Enter` navigates to the source resource detail screen.
- [ ] `f` toggles between All and Unread filter.
- [ ] `q` returns to the previous screen.
- [ ] `/` opens local search and filters results by substring.
- [ ] `n`/`p` navigates between pages.
- [ ] Empty state renders correctly when no notifications exist.
- [ ] Badge in header bar shows correct unread count.
- [ ] Badge shows `99+` when unread count ≥ 100.
- [ ] Badge is hidden when unread count is 0.
- [ ] New SSE notification prepends to the list when screen is active.
- [ ] Screen state (scroll position, focus, filter) is preserved after navigating to detail and back.
- [ ] Screen renders correctly at minimum terminal size (80×24).
- [ ] Screen renders correctly at large terminal size (200×60).

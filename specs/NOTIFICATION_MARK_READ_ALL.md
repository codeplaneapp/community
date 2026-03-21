# NOTIFICATION_MARK_READ_ALL

Specification for NOTIFICATION_MARK_READ_ALL.

## High-Level User POV

When a Codeplane user has accumulated a backlog of unread notifications — from issue assignments, landing request reviews, workspace status changes, workflow completions, and @-mentions — they need a fast, reliable way to clear the entire unread state in a single action. Today, marking notifications one by one is tedious when dozens or hundreds have piled up over a weekend, a vacation, or a period of heavy team activity.

"Mark all as read" gives users a single-gesture escape hatch to declare notification bankruptcy and reset their inbox to a clean state. After invoking it, every notification in the user's inbox transitions to "read" status. The unread badge drops to zero across every connected surface — the web inbox, the TUI notification screen, the CLI, the desktop tray, and any editor status indicators. The action is immediate and does not require selecting individual items or scrolling through pages.

This feature respects the user's flow. There is no confirmation dialog. The action is optimistic — the interface updates instantly before the server confirms. If something goes wrong, the interface reverts and shows an error message. The user can continue working without pause.

Critically, "mark all as read" does not delete notifications. Every notification remains in the inbox, fully searchable and navigable. It only clears the "unread" visual indicator. Users who want to revisit a notification after marking everything as read can still find and open it.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user can mark all of their unread notifications as read in a single action from every client surface: Web UI, CLI, TUI, and desktop tray.
- [ ] The action transitions every notification with `status = "unread"` to `status = "read"` for the authenticated user only.
- [ ] The `read_at` timestamp is set to the server's current time for all affected notifications.
- [ ] Notifications belonging to other users are never affected.
- [ ] The unread badge count drops to zero on all connected client sessions immediately after the action completes.
- [ ] The action is idempotent: invoking "mark all as read" when there are zero unread notifications succeeds without error and produces no side effects.
- [ ] No confirmation dialog is required before the action executes.
- [ ] If the server request fails, the UI reverts any optimistic state changes and displays a transient error message.
- [ ] Notifications are not deleted, archived, or hidden by this action — they remain in the inbox with "read" styling.
- [ ] The feature is available behind the `NOTIFICATION_MARK_READ_ALL` feature flag in `specs/features.ts`.
- [ ] The API endpoint returns 204 No Content on success.
- [ ] The API endpoint returns 401 Unauthorized for unauthenticated requests.

### Edge Cases

- [ ] **Zero unread notifications**: The action succeeds (204) and is a no-op. No database rows are updated. No error is displayed to the user.
- [ ] **Concurrent mark-all from multiple sessions**: If the user has two browser tabs open and clicks "mark all" in both, both requests succeed. The second request is a no-op because all notifications are already read.
- [ ] **New notification arrives during the request**: If a new notification is created between the moment the user clicks "mark all" and the moment the database UPDATE executes, that notification may or may not be included in the batch depending on exact timing. This is acceptable — the new notification will appear as unread after the operation, giving the user accurate visibility. The system must not crash, deadlock, or produce corrupt state.
- [ ] **Large notification volume**: A user with 10,000+ unread notifications can invoke mark-all without timeout. The database query must complete within 5 seconds under normal load.
- [ ] **Mixed read/unread state**: Only notifications with `status = "unread"` are updated. Notifications already marked as "read" are not re-updated (their `read_at` and `updated_at` timestamps are preserved).
- [ ] **Rapid repeated invocations**: If the user triggers mark-all multiple times in quick succession (e.g., double-click, keyboard repeat), subsequent requests are no-ops and do not produce errors. Client-side debouncing should prevent more than one in-flight request at a time.

### Boundary Constraints

- [ ] The API endpoint accepts no request body. Any body content is ignored.
- [ ] The API endpoint accepts no query parameters.
- [ ] The API uses HTTP method `PUT` at path `/api/notifications/mark-read`.
- [ ] Authentication is required via session cookie or PAT `Authorization` header.
- [ ] Rate limit: 30 requests per minute per user for this endpoint.

## Design

### API Shape

**Endpoint**: `PUT /api/notifications/mark-read`

**Authentication**: Required. Session cookie or `Authorization: Bearer <PAT>`.

**Request**: No body, no query parameters.

**Success Response**: `204 No Content` with empty body.

**Error Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| 401 | Missing or invalid authentication | `{ "error": "authentication required" }` |
| 429 | Rate limit exceeded | `{ "error": "rate limit exceeded" }` |
| 500 | Internal server error | `{ "error": "internal server error" }` |

**Behavior**: Updates all rows in the `notifications` table where `user_id` matches the authenticated user and `status = 'unread'`, setting `status = 'read'`, `read_at = NOW()`, and `updated_at = NOW()`.

**Return value semantics**: The endpoint does not return a count of affected rows. The 204 status indicates success regardless of whether zero or many notifications were updated.

### SDK Shape

The `NotificationService` class in `@codeplane/sdk` exposes:

```typescript
async markAllRead(userId: number): Promise<Result<void, APIError>>
```

- Returns `Result.ok(undefined)` on success.
- Returns `Result.err(badRequest("invalid user id"))` if `userId <= 0`.
- Delegates to the `markAllNotificationsRead` SQL wrapper.

### Web UI Design

**Location**: The "Mark all as read" action appears in the notification inbox view (`/inbox`).

**Trigger**: A button labeled **"Mark all as read"** is placed in the inbox header bar, aligned to the right of the notification filter controls (All / Unread).

**Button States**:
- **Default**: Enabled, normal styling. Visible whenever the inbox is displayed.
- **Disabled**: When a mark-all request is in-flight, the button is disabled and shows a subtle loading indicator (spinner replacing the check icon).
- **Hidden**: The button is not hidden when there are zero unread notifications — it remains visible but functions as a no-op.

**Optimistic Update Behavior**:
1. On click, immediately update all visible notification rows to "read" styling (remove bold text, remove unread dot indicator).
2. Set the inbox unread badge to `0`.
3. If the user is on the "Unread" filter view, transition to an empty state: "No unread notifications."
4. Fire the API request.
5. On success (204): no further action needed.
6. On failure: revert all optimistic changes, restore the previous unread count, and display a toast notification: "Failed to mark notifications as read. Please try again."

**Keyboard Shortcut**: `Shift+U` (mnemonic: "mark **U**nread all → read") when the inbox view is focused.

**Command Palette**: The action is registered in the command palette as "Mark all notifications as read" and is available from any page.

**SSE Integration**: Connected SSE clients do not receive a special "mark-all-read" event from the server. Instead, the web client optimistically clears its own state. If other tabs are open, they will reconcile on their next notification list fetch or page navigation.

### CLI Command

**Command**: `codeplane notification read --all`

**Behavior**:
1. Sends `PUT /api/notifications/mark-read` to the configured server.
2. On success, prints: `All notifications marked as read.`
3. On failure, prints the error message and exits with code 1.

**Arguments**:
- `--all` (boolean, default: false): Required to trigger bulk mark-all. Without `--all`, the `read` subcommand expects a positional `<id>` argument for single-notification marking.
- If neither `--all` nor a positional `<id>` is provided, the CLI prints: `Provide a notification ID or use --all to mark all as read.` and exits with code 1.

**JSON output mode**: When `--json` is used, success returns `{ "status": "all_read" }`.

### TUI UI

**Screen**: Notification List Screen.

**Trigger**: Press `R` (Shift+R) while the notification list is focused.

**Behavior**:
1. If zero unread notifications exist, the action is a no-op. No visual feedback is displayed.
2. Immediately apply optimistic updates: all notification rows lose their unread indicator (bold text, `●` dot); the header/status bar badge updates to `0`; if the "Unread" filter is active, the list transitions to an empty state: "No unread notifications. Press `f` to show all."
3. Fire `PUT /api/notifications/mark-read`.
4. On success: show a status bar confirmation "All notifications marked as read" for 3 seconds.
5. On failure: revert optimistic changes and show a status bar error "Failed to mark all as read — please retry" for 5 seconds.

**Guard**: The `R` keybinding is disabled while a mark-all request is in-flight to prevent duplicate submissions.

**Interaction with SSE**: Newly arriving SSE notifications while the mark-all request is in-flight are appended as unread. They are not affected by the in-flight mark-all.

### Desktop Tray

The desktop tray's "quick actions" menu includes a "Mark all as read" entry. Clicking it invokes the same `PUT /api/notifications/mark-read` endpoint via the embedded daemon. The tray unread badge updates to zero on success.

### Editor Integrations

**VS Code**: The notification status bar item's context menu includes "Mark All Notifications as Read." It calls the API and refreshes the notification badge.

**Neovim**: The `:CodeplaneNotificationReadAll` command calls `PUT /api/notifications/mark-read` via the daemon. On success, it echoes "All notifications marked as read." and refreshes any notification-related statusline segments.

### Documentation

- **Web UI Help**: Tooltip on the "Mark all as read" button describing the action and the `Shift+U` keyboard shortcut.
- **CLI Reference**: `codeplane notification read --all` documented in the CLI reference under "notification" with description, examples, and JSON output format.
- **TUI Keybinding Reference**: `R` listed in the keybinding help overlay for the notification list screen.
- **Keyboard Shortcuts Reference**: `Shift+U` (web) and `R` (TUI) listed in the global keyboard shortcuts documentation.
- **API Reference**: `PUT /api/notifications/mark-read` documented with authentication requirements, response codes, and idempotency behavior.

## Permissions & Security

### Authorization

| Role | Allowed | Notes |
|------|---------|-------|
| Authenticated user | ✅ | Can only mark their own notifications as read |
| Unauthenticated | ❌ | Returns 401 |
| Admin | ✅ | Can mark their own notifications (not other users') |
| Service token / PAT | ✅ | Scoped to the token's owning user |
| OAuth2 application | ✅ | Requires `notifications:write` scope |

### Ownership Enforcement

The SQL `WHERE user_id = $1 AND status = 'unread'` clause ensures that a user can only affect their own notifications. There is no admin override to mark another user's notifications as read. The `user_id` is extracted from the authenticated session — it is never accepted as a request parameter.

### Rate Limiting

- **Endpoint-specific limit**: 30 requests per minute per authenticated user for `PUT /api/notifications/mark-read`.
- **Rationale**: This is a bulk mutation that can touch thousands of rows. 30/min is generous for legitimate use (a user would never need to invoke this more than a few times per session) while preventing abuse.
- **Response on limit exceeded**: `429 Too Many Requests` with a `Retry-After` header in seconds.

### Data Privacy

- No PII is exposed by this endpoint. The 204 response contains no body.
- The endpoint does not leak the existence or count of notifications to other users.
- Audit logs should record the action but should not log notification content.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `NotificationMarkAllRead` | User successfully invokes mark-all-as-read | `user_id`, `client` (web/cli/tui/desktop/vscode/neovim), `notifications_affected_count` (number of rows updated), `timestamp` |

### Properties Detail

- `user_id`: The authenticated user's ID. Required for all events.
- `client`: The client surface that initiated the action. One of: `web`, `cli`, `tui`, `desktop`, `vscode`, `neovim`.
- `notifications_affected_count`: The number of notifications that were actually transitioned from "unread" to "read." This is critical for understanding whether users are using this as a regular inbox-management action (small counts) or as "notification bankruptcy" (large counts). This count should be returned from the database UPDATE statement or derived via a pre-count query.
- `timestamp`: ISO 8601 timestamp of the event.

### Funnel Metrics & Success Indicators

| Metric | Description | Target |
|--------|-------------|--------|
| **Mark-all adoption rate** | % of active users who invoke mark-all at least once per week | > 30% of users with 5+ unread notifications |
| **Inbox zero rate** | % of mark-all invocations where `notifications_affected_count > 0` | > 90% (indicates users invoke it when they actually have unread notifications, not by accident) |
| **Mean unread count at invocation** | Average `notifications_affected_count` | Tracking only (no target) — used to understand usage patterns |
| **Client distribution** | Breakdown of mark-all invocations by `client` | Tracking only — used to understand which surfaces are most used |
| **Error rate** | % of mark-all attempts that result in a non-2xx response | < 0.1% |
| **Repeat invocation rate** | % of users who invoke mark-all more than 3x in 5 minutes | < 1% (high rate suggests UX confusion or broken optimistic updates) |

## Observability

### Logging

| Log Entry | Level | Context Fields | Trigger |
|-----------|-------|----------------|--------|
| Mark-all-read request received | `info` | `user_id`, `request_id` | On request arrival |
| Mark-all-read completed | `info` | `user_id`, `request_id`, `duration_ms`, `rows_affected` | On successful database update |
| Mark-all-read failed | `error` | `user_id`, `request_id`, `error_message`, `error_code`, `duration_ms` | On any error |
| Mark-all-read rate limited | `warn` | `user_id`, `request_id`, `retry_after_seconds` | On 429 response |
| Mark-all-read skipped (no unread) | `debug` | `user_id`, `request_id`, `duration_ms` | When 0 rows affected (idempotent no-op) |

All log entries must use structured JSON format with the standard request context fields (`request_id`, `user_id`, `timestamp`, `path`, `method`).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_notifications_mark_all_read_total` | Counter | `status` (success, error, rate_limited) | Total mark-all-read requests |
| `codeplane_notifications_mark_all_read_duration_seconds` | Histogram | — | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_notifications_mark_all_read_rows_affected` | Histogram | — | Number of rows transitioned per invocation (buckets: 0, 1, 10, 50, 100, 500, 1000, 5000, 10000) |
| `codeplane_notifications_unread_count` | Gauge | `user_id` | Current unread notification count per user (updated on mark-all and on new notification creation) |

### Alerts

#### Alert: `NotificationMarkAllReadHighErrorRate`

**Condition**: `rate(codeplane_notifications_mark_all_read_total{status="error"}[5m]) / rate(codeplane_notifications_mark_all_read_total[5m]) > 0.05` for 5 minutes.

**Severity**: Warning

**Runbook**:
1. Check server logs for `mark-all-read failed` entries. Look at `error_message` and `error_code` fields.
2. If errors are database-related (`connection refused`, `timeout`), check PostgreSQL health: `pg_isready`, connection pool saturation, active query count, and replication lag.
3. If errors are `500 Internal Server Error`, check for recent deployments that may have introduced a regression in the notification service or SQL layer.
4. If the error rate is localized to specific users, check whether those users have an abnormally large notification count (>100k) that may be causing query timeouts. Consider adding a database index on `(user_id, status)` if one doesn't exist.
5. If errors resolve spontaneously, check for transient infrastructure issues (network partition, database failover).

#### Alert: `NotificationMarkAllReadHighLatency`

**Condition**: `histogram_quantile(0.95, rate(codeplane_notifications_mark_all_read_duration_seconds_bucket[5m])) > 2.0` for 10 minutes.

**Severity**: Warning

**Runbook**:
1. Check `codeplane_notifications_mark_all_read_rows_affected` histogram for unusually large batch sizes. High latency with high row counts is expected behavior, not a bug.
2. Run `EXPLAIN ANALYZE` on the `markAllNotificationsRead` query for a sample user to check query plan efficiency. Ensure the `(user_id, status)` index is being used.
3. Check PostgreSQL `pg_stat_activity` for long-running queries or lock contention on the `notifications` table.
4. Check database CPU, memory, and I/O metrics. If saturated, consider scaling the database or deferring non-critical write load.
5. If latency is only high during specific time windows, correlate with notification fanout patterns (e.g., mass workflow completions creating thousands of notifications simultaneously).

#### Alert: `NotificationMarkAllReadRateLimitSpike`

**Condition**: `rate(codeplane_notifications_mark_all_read_total{status="rate_limited"}[5m]) > 10` for 5 minutes.

**Severity**: Info

**Runbook**:
1. Identify the affected users from logs (`mark-all-read rate limited` entries).
2. Determine if this is a single abusive user/script or a distributed pattern.
3. If a single user: check if a misconfigured client (bot, extension, script) is calling the endpoint in a loop. Contact the user or temporarily revoke the token.
4. If distributed: check whether a client release introduced a bug causing rapid retries (e.g., optimistic update failure loop).
5. No immediate action required for isolated rate limit events — the rate limiter is working as designed.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Unauthenticated | 401 | No session/token or expired | Client re-authenticates |
| Rate limited | 429 | >30 requests/min from same user | Client waits for `Retry-After` period |
| Database connection failure | 500 | PostgreSQL unreachable | Automatic retry on next user action; server reconnects to DB pool |
| Query timeout | 500 | Extremely large notification set or table lock | Server returns error; user retries; DBA investigates |
| Invalid user ID in session | 400 | Corrupted session state | User re-authenticates |

## Verification

### API Integration Tests

- [ ] **`api/mark-all-read/success-with-unread`**: Create 5 unread notifications for a user. Call `PUT /api/notifications/mark-read`. Assert 204. Fetch notification list and verify all 5 have `status: "read"` and non-null `read_at`.
- [ ] **`api/mark-all-read/success-with-zero-unread`**: Create 3 notifications and mark them all read individually. Call `PUT /api/notifications/mark-read`. Assert 204. Verify no `updated_at` timestamps changed.
- [ ] **`api/mark-all-read/idempotent-double-call`**: Create 5 unread notifications. Call `PUT /api/notifications/mark-read` twice. Both return 204. Verify notification state is consistent.
- [ ] **`api/mark-all-read/unauthenticated`**: Call `PUT /api/notifications/mark-read` without authentication. Assert 401.
- [ ] **`api/mark-all-read/only-affects-own-notifications`**: Create 3 unread notifications for User A and 3 for User B. Authenticate as User A and call `PUT /api/notifications/mark-read`. Assert User A's notifications are read and User B's are still unread.
- [ ] **`api/mark-all-read/preserves-already-read`**: Create 2 read and 3 unread notifications. Call mark-all. Verify the 2 already-read notifications retain their original `read_at` and `updated_at` timestamps.
- [ ] **`api/mark-all-read/large-batch`**: Create 500 unread notifications for a user. Call `PUT /api/notifications/mark-read`. Assert 204 and completion within 5 seconds. Verify all 500 are now read.
- [ ] **`api/mark-all-read/max-batch`**: Create 10,000 unread notifications for a user. Call `PUT /api/notifications/mark-read`. Assert 204 and completion within 10 seconds. Verify all 10,000 are now read.
- [ ] **`api/mark-all-read/mixed-source-types`**: Create unread notifications with source types `issue`, `issue_comment`, `landing_request`, `lr_review`, `lr_comment`, `workspace`, and `workflow_run`. Call mark-all. Verify all are read regardless of source type.
- [ ] **`api/mark-all-read/concurrent-requests`**: Send 5 concurrent `PUT /api/notifications/mark-read` requests for the same user. All should return 204. No errors, no deadlocks.
- [ ] **`api/mark-all-read/new-notification-during-request`**: Create 5 unread notifications. Start a mark-all request. Concurrently create 1 new notification. After both complete, the new notification may be either read or unread — assert no error occurred and total notification count is 6.
- [ ] **`api/mark-all-read/rate-limit`**: Send 31 `PUT /api/notifications/mark-read` requests within 60 seconds. Assert that the 31st returns 429 with a `Retry-After` header.
- [ ] **`api/mark-all-read/pat-auth`**: Authenticate with a Personal Access Token. Call `PUT /api/notifications/mark-read`. Assert 204.
- [ ] **`api/mark-all-read/ignores-request-body`**: Send `PUT /api/notifications/mark-read` with a JSON body `{ "foo": "bar" }`. Assert 204 (body is ignored).

### CLI Integration Tests

- [ ] **`cli/notification-read-all/success`**: Seed unread notifications. Run `codeplane notification read --all`. Assert exit code 0 and output contains "All notifications marked as read" or JSON `{ "status": "all_read" }`.
- [ ] **`cli/notification-read-all/json-output`**: Run `codeplane notification read --all --json`. Assert output is valid JSON matching `{ "status": "all_read" }`.
- [ ] **`cli/notification-read-all/no-id-no-all`**: Run `codeplane notification read` without `--all` and without an ID. Assert exit code 1 and error message "Provide a notification ID or use --all to mark all as read."
- [ ] **`cli/notification-read-all/unauthenticated`**: Run `codeplane notification read --all` without authentication configured. Assert exit code 1 and error message indicates authentication failure.
- [ ] **`cli/notification-read-all/zero-unread`**: With zero unread notifications, run `codeplane notification read --all`. Assert exit code 0 (idempotent success).

### Web UI E2E Tests (Playwright)

- [ ] **`e2e/web/mark-all-read-button-visible`**: Navigate to `/inbox`. Assert the "Mark all as read" button is visible.
- [ ] **`e2e/web/mark-all-read-clears-unread`**: Seed 3 unread notifications. Navigate to `/inbox`. Click "Mark all as read." Assert all notification rows transition to read styling (no bold, no unread dot). Assert the unread badge in the sidebar/header shows `0`.
- [ ] **`e2e/web/mark-all-read-unread-filter-empty-state`**: Seed 3 unread notifications. Navigate to `/inbox`. Switch to "Unread" filter. Click "Mark all as read." Assert the list shows the empty state message "No unread notifications."
- [ ] **`e2e/web/mark-all-read-keyboard-shortcut`**: Navigate to `/inbox`. Press `Shift+U`. Assert the mark-all action fires (same behavior as button click).
- [ ] **`e2e/web/mark-all-read-command-palette`**: Open command palette. Type "Mark all notifications." Select the command. Assert notifications are marked as read.
- [ ] **`e2e/web/mark-all-read-button-disabled-during-request`**: Intercept the API request with a delay. Click "Mark all as read." Assert the button is disabled during the request. Assert it re-enables after the response.
- [ ] **`e2e/web/mark-all-read-error-reverts`**: Intercept `PUT /api/notifications/mark-read` and return 500. Click "Mark all as read." Assert optimistic update occurs, then reverts. Assert a toast error message appears.
- [ ] **`e2e/web/mark-all-read-zero-unread-noop`**: With zero unread notifications, navigate to `/inbox`. Click "Mark all as read." Assert no error, no visual change.
- [ ] **`e2e/web/mark-all-read-preserves-notifications`**: Seed 5 notifications. Click "Mark all as read." Assert all 5 notifications remain visible in the list (not deleted or hidden).

### TUI Integration Tests

- [ ] **`tui/notification-mark-all-read-keybinding`**: Navigate to notification list with 3 unread notifications. Press `R`. Assert all notifications show read styling. Assert header badge shows `0`.
- [ ] **`tui/notification-mark-all-read-unread-filter`**: Switch to Unread filter with 3 unread notifications. Press `R`. Assert empty state message appears.
- [ ] **`tui/notification-mark-all-read-noop-zero-unread`**: Navigate to notification list with zero unread. Press `R`. Assert no error, no visual change.
- [ ] **`tui/notification-mark-all-read-guard-inflight`**: Press `R`. Immediately press `R` again. Assert only one API request is sent.
- [ ] **`tui/notification-mark-all-read-error-reverts`**: Simulate API failure. Press `R`. Assert optimistic update reverts. Assert status bar shows error message.
- [ ] **`tui/notification-mark-all-read-status-bar-confirmation`**: Press `R` with 5 unread notifications. Assert status bar shows "All notifications marked as read" for approximately 3 seconds.

### Cross-Surface Consistency Tests

- [ ] **`e2e/cross-surface/mark-all-read-api-then-web`**: Use the API to mark all as read. Navigate to `/inbox` in the web UI. Assert all notifications appear as read.
- [ ] **`e2e/cross-surface/mark-all-read-cli-then-api-list`**: Use the CLI to mark all as read. Call `GET /api/notifications/list`. Assert all returned notifications have `status: "read"`.

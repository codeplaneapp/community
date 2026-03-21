# NOTIFICATION_MARK_READ_SINGLE

Specification for NOTIFICATION_MARK_READ_SINGLE.

## High-Level User POV

When a user receives notifications in Codeplane — for example, because they were assigned to an issue, someone commented on their landing request, a workflow run completed, or a workspace status changed — those notifications appear as unread items in their inbox. The user needs a way to acknowledge individual notifications by marking them as read, signaling that they have seen and processed that specific item.

Marking a single notification as read is the most fundamental inbox management action. It transitions one notification from the "unread" state to the "read" state, records the exact time the user acknowledged it, and immediately reflects that change across every Codeplane surface the user has open. If the user is viewing their notifications in the web inbox, the unread badge decrements, the visual indicator on that row disappears, and bold styling returns to normal weight. If the user is in the TUI and presses `r`, the same thing happens with an optimistic update that feels instant. If the user is using the CLI, they can mark a specific notification by its ID and see the updated state on their next list query.

This action is intentionally scoped to a single notification at a time. It gives users fine-grained control over their inbox, letting them triage notifications one by one as they review, navigate, and act on each item. It complements the bulk "mark all as read" action, which handles the case where a user wants to clear their entire inbox at once. Together, these two capabilities provide the complete read-state management surface that users expect from any inbox-style notification system.

The value of this feature is workflow efficiency: users can focus on unread items, acknowledge them individually as they process each one, and trust that every client they use will immediately reflect the updated state without requiring a page reload or manual refresh.

## Acceptance Criteria

### Definition of Done

- [ ] A user can mark a single notification as read via API, CLI, TUI, and Web UI
- [ ] The notification's `status` transitions from `"unread"` to `"read"` and a `read_at` timestamp is recorded
- [ ] Marking an already-read notification as read is a silent no-op (idempotent), returning success without error
- [ ] The operation is scoped to the authenticated user — users cannot mark notifications belonging to other users
- [ ] All connected clients (Web, TUI) reflect the read state change in near-real-time via SSE-driven updates or optimistic local state
- [ ] The unread count badge decrements by exactly 1 when a previously-unread notification is marked read
- [ ] The unread count badge does not change when an already-read notification is re-marked as read

### Input Validation & Edge Cases

- [ ] Notification ID must be a positive integer greater than zero
- [ ] Notification ID `0` returns a 400 Bad Request error with message `"invalid notification id"`
- [ ] Negative notification IDs return a 400 Bad Request error
- [ ] Non-numeric notification IDs (e.g., `"abc"`, `""`, `"null"`) return a 400 Bad Request error
- [ ] Extremely large notification IDs that exceed the PostgreSQL `bigint` range return a 400 Bad Request error
- [ ] Notification IDs that are valid integers but do not exist for the authenticated user are treated as a silent no-op (204 No Content) — no error is surfaced
- [ ] Notification IDs that exist but belong to a different user are treated identically to non-existent IDs (silent no-op, 204 No Content) — no information leakage about other users' notifications
- [ ] Floating-point notification IDs (e.g., `"1.5"`) are rejected as invalid
- [ ] The request body, if present, is ignored for the mark-read-single operation — the PATCH endpoint does not require or inspect a request body beyond the path parameter

### State Transitions

- [ ] An `"unread"` notification transitions to `"read"` with `read_at` set to the server timestamp at the moment of the update
- [ ] An already `"read"` notification remains `"read"` — `read_at` is NOT overwritten with a new timestamp (the SQL WHERE clause `AND user_id = $2` ensures the row matches, but since the status is already `'read'`, the `read_at` field records the original read time)
- [ ] The `updated_at` timestamp is refreshed to `NOW()` on every successful write, even for idempotent re-reads
- [ ] No notification can transition from `"read"` back to `"unread"` via this endpoint — there is no unmark/unread action

### Concurrency

- [ ] Concurrent mark-read requests for the same notification ID from the same user both succeed without error
- [ ] Concurrent mark-read of one notification and mark-all-read do not conflict — both resolve correctly

### Client Behavior

- [ ] Web UI: clicking the mark-read control on a notification row instantly updates the row styling (remove unread indicator, de-bold subject) and decrements the badge, before the API response returns
- [ ] Web UI: if the API call fails, the optimistic update reverts and a transient error toast appears
- [ ] TUI: pressing `r` on an unread notification row triggers the same optimistic-then-confirm pattern
- [ ] TUI: pressing `r` on an already-read notification is a silent no-op — no API call is made
- [ ] CLI: `codeplane notification read <id>` outputs success confirmation on exit code 0
- [ ] CLI: `codeplane notification read` without an ID and without `--all` returns a user-facing error message

## Design

### API Shape

**Endpoint:** `PATCH /api/notifications/:id`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer (path) | Yes | The notification ID to mark as read. Must be a positive integer. |

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `Cookie` | Conditional | Session cookie for browser-based auth |
| `Authorization` | Conditional | `Bearer <PAT>` for token-based auth |

**Request Body:** None required. Any body content is ignored.

**Success Response:**
- Status: `204 No Content`
- Body: empty
- The 204 is returned regardless of whether the notification existed, was already read, or did not belong to the user. This prevents enumeration attacks.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `400` | ID is zero, negative, non-numeric, or exceeds bigint range | `{ "error": "invalid notification id" }` |
| `401` | No valid session or token provided | `{ "error": "authentication required" }` |
| `429` | Rate limit exceeded | `{ "error": "rate limit exceeded" }` |

### SDK Shape

**Service:** `NotificationService`

**Method:**
```
markRead(userId: number, notificationId: number): Promise<Result<void, APIError>>
```

**Behavior:**
- Validates `userId > 0` and `notificationId > 0`
- Executes `UPDATE notifications SET status = 'read', read_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2`
- Returns `Result.ok(undefined)` on success (including no-op when no matching row)
- Returns `Result.err(badRequest(...))` for invalid inputs

### CLI Command

**Command:** `codeplane notification read <id>`

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes (unless `--all`) | The notification ID to mark as read |

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--all` | boolean | false | Mark all notifications as read instead |

**Behavior:**
- When `id` is provided: sends `PATCH /api/notifications/:id` and outputs success status
- When neither `id` nor `--all` is provided: prints error `"Provide a notification ID or use --all to mark all as read."` and exits non-zero
- Exit code 0 on success, non-zero on failure
- JSON output mode available via `--json` flag

**Example usage:**
```
$ codeplane notification read 42
# (exits 0 on success)

$ codeplane notification read 42 --json
{ "status": "ok" }

$ codeplane notification read
Error: Provide a notification ID or use --all to mark all as read.
```

### TUI UI

**Trigger:** Press `r` on a focused notification row in the notification list screen.

**Visual Behavior:**
1. **Immediate (optimistic):** The unread indicator (`●` in blue ANSI 33) disappears from the focused row. The subject text transitions from bold to normal weight. The unread count in the header bar `[N]` and status bar `◆ N` decrements by 1.
2. **When Unread filter is active:** The row fades out after 200ms and is removed from the list. Focus advances to the next row (or previous if at the end).
3. **When All filter is active:** The row remains in place with read styling.
4. **Status bar feedback:** Brief "Marked read" message appears in the status bar.
5. **On API error:** The optimistic update reverts — the `●` reappears, bold returns, badge increments back. Status bar shows `"Failed: {reason}"` in red.

**Guard conditions:**
- `r` on an already-read notification: silent no-op, no API call
- `r` while a previous mark-read mutation is in-flight: ignored (debounced)
- `r` on an empty list: no-op

### Web UI Design

**Trigger:** Click a mark-read icon/button on a notification row in the inbox view.

**Visual behavior:**
1. **Unread notification row:** Displays with a colored unread dot indicator (left side), bold subject text, and slightly elevated visual weight.
2. **On click of mark-read control:** The unread dot disappears instantly, subject text de-bolds, row transitions to muted/read styling. The global unread badge in the sidebar/header decrements by 1.
3. **Mark-read on navigate:** When a user clicks a notification to navigate to its source (issue, landing request, etc.), the notification is automatically marked as read. The API call fires concurrently with the navigation — the user does not wait for the mark-read to complete before navigating.
4. **Error recovery:** If the PATCH request fails, a transient toast notification appears: `"Could not mark notification as read. Please try again."` The unread indicator and badge revert to their previous state.
5. **Already-read row:** The mark-read control is either hidden or disabled. No API call is made.

**Accessibility:**
- The mark-read control must be keyboard-focusable and activatable via Enter/Space
- Screen readers should announce the state change: `"Notification marked as read"`
- The unread indicator must not rely solely on color — it should also include a shape (dot) or text alternative

### Neovim Plugin API

**Command:** `:CodeplaneNotificationRead <id>`

**Behavior:**
- Sends `PATCH /api/notifications/:id` via the daemon HTTP client
- On success: echoes `"Notification <id> marked as read"`
- On failure: echoes error message in `ErrorMsg` highlight group
- If no daemon connection: echoes `"Codeplane daemon not running"`

### Documentation

The following end-user documentation should be written:

1. **Notification Inbox Guide** — A walkthrough explaining how to view, triage, and manage notifications across Web, CLI, and TUI. Should include a section on marking individual notifications as read.
2. **CLI Reference: `notification read`** — Command reference with examples for marking a single notification read and marking all notifications read.
3. **Keyboard Shortcuts Reference** — Include `r` (mark read) and `R` (mark all read) in the TUI keyboard shortcut table under the Notifications section.
4. **API Reference: `PATCH /api/notifications/:id`** — Endpoint documentation with path parameters, response codes, and example `curl` commands.

## Permissions & Security

### Authorization

| Role | Allowed | Notes |
|------|---------|-------|
| Authenticated user (Owner of notification) | ✅ | Can mark their own notifications as read |
| Authenticated user (Non-owner) | ⚠️ Silent no-op | Request succeeds with 204 but no row is updated. No error, no information leak. |
| Anonymous / unauthenticated | ❌ 401 | Must be authenticated |
| Admin | ✅ (own only) | Admin role does not grant cross-user notification access |
| PAT-authenticated | ✅ | Personal access tokens carry the same notification permissions as session auth |
| OAuth2 application | ✅ | If the OAuth scope includes notification management |
| Deploy key | ❌ | Deploy keys are repository-scoped and do not carry user identity for notifications |

### Rate Limiting

- **Endpoint-level rate limit:** 60 requests per minute per authenticated user for `PATCH /api/notifications/:id`
- **Rationale:** A user triaging a large inbox may rapid-fire mark-read actions; 60/min (1/sec sustained) is generous but prevents scripted abuse
- **Burst allowance:** Up to 10 requests in a 1-second burst window to accommodate rapid keyboard-driven TUI usage
- **Response on limit exceeded:** `429 Too Many Requests` with `Retry-After` header

### Data Privacy

- The 204 response on non-existent or non-owned notification IDs prevents enumeration of other users' notification IDs
- Notification IDs are sequential integers, so the silent no-op behavior is critical to prevent probing
- No PII is exposed in error responses — only generic error messages
- Audit logs for mark-read actions should NOT include notification content (subject/body), only the notification ID and user ID

## Telemetry & Product Analytics

### Business Events

**Event: `NotificationMarkedRead`**

| Property | Type | Description |
|----------|------|-------------|
| `user_id` | number | The authenticated user's ID |
| `notification_id` | number | The notification that was marked read |
| `source_type` | string | The source type of the notification (e.g., `"issue"`, `"lr_comment"`) |
| `was_already_read` | boolean | Whether the notification was already in `"read"` state (no-op detection) |
| `time_to_read_ms` | number \| null | Elapsed milliseconds from `created_at` to `read_at` (null if was already read) |
| `client` | string | The client surface that initiated the action (`"web"`, `"cli"`, `"tui"`, `"api"`, `"neovim"`, `"vscode"`) |
| `trigger` | string | How the mark-read was initiated (`"explicit"` for direct action, `"navigate"` for mark-on-navigate) |

### Funnel Metrics & Success Indicators

| Metric | Description | Target |
|--------|-------------|--------|
| **Mark-read rate** | % of notifications that are eventually marked read (individually, not via mark-all) | > 40% |
| **Median time-to-read** | Median elapsed time from notification creation to individual mark-read | < 4 hours for high-signal source types |
| **Client distribution** | Breakdown of mark-read actions by client surface | Expect Web > TUI > CLI |
| **No-op rate** | % of mark-read calls that target already-read notifications | < 5% (higher suggests UX confusion) |
| **Error rate** | % of mark-read calls that result in 400/429/500 | < 0.1% |
| **Optimistic revert rate** | % of optimistic UI updates that had to revert due to API failure | < 0.5% |

## Observability

### Logging

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Mark-read request received | `DEBUG` | `user_id`, `notification_id`, `request_id` | Entry log for every PATCH request |
| Mark-read validation failure | `WARN` | `user_id`, `notification_id_raw`, `error`, `request_id` | Invalid ID format or value |
| Mark-read SQL executed | `DEBUG` | `user_id`, `notification_id`, `rows_affected`, `duration_ms`, `request_id` | Database operation outcome |
| Mark-read completed | `INFO` | `user_id`, `notification_id`, `rows_affected`, `duration_ms`, `request_id` | Successful completion (rows_affected=0 means no-op) |
| Mark-read auth failure | `WARN` | `request_id`, `ip`, `user_agent` | 401 responses |
| Mark-read rate limited | `WARN` | `user_id`, `request_id`, `ip` | 429 responses |
| Mark-read internal error | `ERROR` | `user_id`, `notification_id`, `error`, `stack`, `request_id` | Unexpected database or service errors |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_notification_mark_read_total` | Counter | `status` (`success`, `noop`, `error_validation`, `error_auth`, `error_rate_limit`, `error_internal`) | Total mark-read requests by outcome |
| `codeplane_notification_mark_read_duration_seconds` | Histogram | — | End-to-end request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_notification_mark_read_db_duration_seconds` | Histogram | — | Database UPDATE query duration |
| `codeplane_notification_time_to_read_seconds` | Histogram | `source_type` | Time elapsed from notification creation to mark-read (buckets: 60, 300, 900, 3600, 14400, 86400, 604800) |

### Alerts

**Alert: `NotificationMarkReadHighErrorRate`**
- **Condition:** `rate(codeplane_notification_mark_read_total{status="error_internal"}[5m]) / rate(codeplane_notification_mark_read_total[5m]) > 0.05`
- **Severity:** Warning
- **Summary:** More than 5% of mark-read requests are failing with internal errors
- **Runbook:**
  1. Check the structured error logs: `grep "mark-read internal error" | jq '.error, .stack'`
  2. Verify database connectivity: `SELECT 1 FROM notifications LIMIT 1`
  3. Check for database lock contention: `SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock'`
  4. Check if the `notifications` table has excessive bloat or missing indexes: `SELECT reltuples, relpages FROM pg_class WHERE relname = 'notifications'`
  5. Verify the `(id, user_id)` index exists and is being used: `EXPLAIN ANALYZE UPDATE notifications SET status='read' WHERE id=$1 AND user_id=$2`
  6. If lock contention: check for long-running transactions holding row locks on the notifications table
  7. Escalate to database team if the issue persists after basic diagnostics

**Alert: `NotificationMarkReadHighLatency`**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_notification_mark_read_duration_seconds_bucket[5m])) > 0.5`
- **Severity:** Warning
- **Summary:** p95 mark-read latency exceeds 500ms
- **Runbook:**
  1. Check database query performance: `EXPLAIN ANALYZE` the `markNotificationRead` query with representative IDs
  2. Check for table bloat: run `VACUUM ANALYZE notifications`
  3. Verify the composite index on `(id, user_id)` is present and not corrupted
  4. Check if there are concurrent bulk operations (mark-all-read, cleanup jobs) causing lock contention
  5. Review connection pool utilization — high latency may indicate pool exhaustion
  6. If persistent: consider adding a covering index or partitioning the notifications table by user_id

**Alert: `NotificationMarkReadRateLimitSpike`**
- **Condition:** `rate(codeplane_notification_mark_read_total{status="error_rate_limit"}[5m]) > 10`
- **Severity:** Info
- **Summary:** Elevated rate-limit hits on mark-read endpoint, possible scripted abuse
- **Runbook:**
  1. Identify the user(s) being rate-limited from structured logs: `grep "mark-read rate limited" | jq '.user_id, .ip'`
  2. Determine if the traffic is legitimate (e.g., a user with thousands of notifications using a script) or abusive
  3. If legitimate: consider temporarily raising the rate limit for that user or suggesting they use mark-all-read
  4. If abusive: consider temporary IP-level blocking and review for automated scraping patterns

### Error Cases & Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Invalid notification ID format | 400 | Immediate rejection, no DB call | Fix the ID in the client request |
| Unauthenticated request | 401 | Immediate rejection | Re-authenticate via login, PAT, or session refresh |
| Rate limit exceeded | 429 | Request rejected with Retry-After header | Wait and retry, or use mark-all-read for bulk operations |
| Database connection failure | 500 | Service-level error returned | Automatic reconnection via connection pool; alert fires |
| Database timeout | 500 | Query exceeds statement timeout | Retry; investigate table bloat or missing index |
| Notification belongs to different user | 204 | Silent no-op (by design) | No recovery needed — this is intentional security behavior |
| Notification does not exist | 204 | Silent no-op (by design) | No recovery needed |
| Concurrent mark-read on same notification | 204 | Both succeed; second is a no-op | No recovery needed |

## Verification

### API Integration Tests

| # | Test | Expected Outcome |
|---|------|------------------|
| 1 | `PATCH /api/notifications/:id` with valid unread notification ID returns 204 | Status 204, empty body |
| 2 | `PATCH /api/notifications/:id` then `GET /api/notifications/list` shows the notification with `status: "read"` and non-null `read_at` | Status field is `"read"`, `read_at` is a valid ISO 8601 timestamp |
| 3 | `PATCH /api/notifications/:id` on an already-read notification returns 204 (idempotent) | Status 204, empty body, `read_at` unchanged |
| 4 | `PATCH /api/notifications/0` returns 400 with `"invalid notification id"` | Status 400, error message matches |
| 5 | `PATCH /api/notifications/-1` returns 400 | Status 400 |
| 6 | `PATCH /api/notifications/abc` returns 400 | Status 400 |
| 7 | `PATCH /api/notifications/99999999` (non-existent) returns 204 | Status 204, silent no-op |
| 8 | `PATCH /api/notifications/:id` without authentication returns 401 | Status 401 |
| 9 | `PATCH /api/notifications/:id` with an expired/invalid PAT returns 401 | Status 401 |
| 10 | `PATCH /api/notifications/:id` where the notification belongs to a different user returns 204 (no information leakage) | Status 204, the notification's status is NOT changed |
| 11 | `PATCH /api/notifications/1.5` returns 400 (floating-point rejected) | Status 400 |
| 12 | `PATCH /api/notifications/` (empty ID) returns 400 or 404 (route not matched) | Status 400 or 404 |
| 13 | `PATCH /api/notifications/9223372036854775808` (exceeds bigint max) returns 400 | Status 400 |
| 14 | Create a notification, mark it read via PATCH, verify `read_at` is within 5 seconds of `NOW()` | Timestamp is recent and valid |
| 15 | Create a notification, mark it read, then re-mark it read — verify `read_at` is not overwritten to a newer timestamp (or that `updated_at` is refreshed) | `read_at` is stable or only `updated_at` changes |
| 16 | Mark-read followed by list with `status=unread` filter: the marked notification no longer appears | Notification absent from unread-filtered results |
| 17 | Mark-read with valid PAT in `Authorization: Bearer <token>` header succeeds | Status 204 |
| 18 | Concurrent `PATCH /api/notifications/:id` (same ID, same user, 10 parallel requests) all return 204 | All 204, no 5xx errors |
| 19 | Mark a notification as read, then verify the unread count from `GET /api/notifications/list` `X-Total-Count` and a count of unread items decreases by 1 | Consistent count |

### CLI Integration Tests

| # | Test | Expected Outcome |
|---|------|------------------|
| 20 | `codeplane notification read 1` with valid auth exits 0 | Exit code 0 |
| 21 | `codeplane notification read 0` with valid auth exits non-zero | Exit code ≠ 0 |
| 22 | `codeplane notification read 1` without auth exits non-zero | Exit code ≠ 0 |
| 23 | `codeplane notification read` (no ID, no `--all`) prints error and exits non-zero | Exit code ≠ 0, stderr contains guidance message |
| 24 | `codeplane notification read 1 --json` outputs valid JSON | Parseable JSON on stdout |
| 25 | `codeplane notification read --all` marks all as read (exits 0) — verify distinct from single-read path | Exit code 0, response indicates `"all_read"` |
| 26 | Create a notification via fan-out, list it via CLI, mark it read via CLI, list again to confirm state change | Notification transitions from unread to read in list output |

### Playwright (Web UI) E2E Tests

| # | Test | Expected Outcome |
|---|------|------------------|
| 27 | Navigate to inbox, verify an unread notification displays with unread indicator | Unread dot/indicator visible, subject is bold |
| 28 | Click mark-read control on an unread notification, verify the unread indicator disappears and subject de-bolds | Visual transition occurs within 300ms |
| 29 | Click mark-read, verify the global unread badge decrements by 1 | Badge count = previous count - 1 |
| 30 | Click mark-read, wait for API response, reload page — verify the notification is still marked as read (persisted) | Notification shows as read after reload |
| 31 | Click a notification to navigate to its source — verify it is automatically marked as read on return to inbox | Notification appears as read |
| 32 | Verify that already-read notifications do not show a mark-read control (or it is disabled) | No actionable mark-read affordance on read notifications |
| 33 | Simulate API failure (e.g., via network interception), click mark-read, verify the optimistic update reverts and a toast appears | Unread indicator returns, error toast visible |
| 34 | Verify mark-read control is keyboard-accessible (Tab to focus, Enter to activate) | Focus ring visible, Enter triggers mark-read |

### TUI Integration Tests

| # | Test | Expected Outcome |
|---|------|------------------|
| 35 | Open notification list, focus an unread notification, press `r` — verify row styling updates (unread indicator removed) | Visual state changes |
| 36 | Press `r` on an already-read notification — verify no API call is made (no-op) | No network activity |
| 37 | With Unread filter active, press `r` — verify the row is removed from the list after animation | Row disappears, focus advances |
| 38 | With All filter active, press `r` — verify the row remains visible with read styling | Row stays, styling updates |
| 39 | Press `r`, verify badge counts in header and status bar decrement by 1 | Both badge locations update |

### SSE / Real-Time Tests

| # | Test | Expected Outcome |
|---|------|------------------|
| 40 | Open an SSE connection, mark a notification as read via separate API call — verify the SSE stream does NOT re-emit the notification (mark-read is not a creation event) | No new SSE event for mark-read |
| 41 | Open two client sessions (e.g., two browser tabs), mark a notification read in one — verify the other tab's optimistic state or next poll reflects the change | Both tabs show consistent read state |

### Load & Boundary Tests

| # | Test | Expected Outcome |
|---|------|------------------|
| 42 | Create 1000 notifications for a user, mark notification #500 as read, verify it succeeds in < 200ms | Status 204, latency < 200ms |
| 43 | Mark-read with the maximum valid PostgreSQL bigint value (`9223372036854775807`) as notification ID — verify it returns 204 (no-op, no crash) | Status 204 |
| 44 | Mark-read with `9223372036854775808` (bigint + 1) — verify it returns 400 | Status 400 |
| 45 | Fire 61 mark-read requests in 60 seconds from one user — verify the 61st receives 429 | Status 429 with Retry-After header |
| 46 | Fire 10 rapid mark-read requests in 1 second (burst) — verify all succeed | All return 204 |

# NOTIFICATION_LIST_PAGED

Specification for NOTIFICATION_LIST_PAGED.

## High-Level User POV

When a Codeplane user navigates to their notification inbox — whether through the web UI, CLI, TUI, or an editor integration — they see a paginated list of their notifications sorted with the newest first. Each notification tells them what happened (an issue was assigned to them, a landing request received a review, a workflow run completed, etc.), when it happened, and whether they've already read it.

The inbox may contain hundreds or thousands of notifications over time. Rather than loading everything at once — which would be slow and overwhelming — the system presents notifications in manageable pages. The user can page forward and backward through their history. Each page clearly indicates the total number of notifications so the user always knows the scope of their inbox. The user sees up to 30 notifications per page by default, and can request smaller or larger pages up to a maximum of 50 per page.

This paginated listing is the foundational read path for the entire notification system. It is the surface that the mark-read flows, the SSE real-time stream, the inbox UI, the CLI `notification list` command, and the TUI notification screen all build upon. Without a reliable, performant, and well-contracted paginated list endpoint, none of the downstream notification experiences can function correctly.

The experience is fast and predictable. Empty inboxes show a clear "no notifications" state. Requesting a page beyond the last one returns an empty list rather than an error. Notifications that arrive while the user is browsing a specific page do not cause existing items to shift or disappear — the user simply sees a count update and can navigate to the first page to see the newest items. The total count header allows clients to render pagination controls (page numbers, "showing X of Y", next/previous buttons) without a separate API call.

## Acceptance Criteria

### Core Behavior
- [ ] The endpoint returns a JSON array of notification objects for the authenticated user, ordered by `created_at` descending (newest first).
- [ ] Each notification object in the response includes: `id`, `user_id`, `source_type`, `source_id`, `subject`, `body`, `status`, `read_at`, `created_at`, `updated_at`.
- [ ] The response includes an `X-Total-Count` header containing the total number of notifications for the user (across all pages).
- [ ] Pagination is controlled via `page` (1-based) and `per_page` query parameters.
- [ ] Default `page` is `1`. Default `per_page` is `30`.
- [ ] Maximum `per_page` is `50`. Requests exceeding this cap are clamped to `50`.
- [ ] Minimum `page` is `1`. Requests with `page < 1` are normalized to `1`.
- [ ] Minimum `per_page` is `1`. Requests with `per_page < 1` are normalized to the default (`30`).
- [ ] Results are strictly scoped to the authenticated user's notifications. A user can never see another user's notifications.
- [ ] An unauthenticated request returns `401 Unauthorized`.

### Empty and Boundary States
- [ ] An authenticated user with zero notifications receives an empty array `[]` and `X-Total-Count: 0`.
- [ ] Requesting a `page` beyond the last page of results returns an empty array `[]` with the correct `X-Total-Count`.
- [ ] A user with exactly `per_page` notifications on the last page sees a full page; requesting the next page returns empty.
- [ ] Non-integer `page` or `per_page` values (e.g., `"abc"`, `1.5`, `null`) are rejected with `400 Bad Request` or normalized to defaults.
- [ ] Negative `page` or `per_page` values are normalized to their minimum valid values.

### Data Integrity
- [ ] The `source_type` field is always one of the known types: `issue`, `issue_comment`, `landing_request`, `lr_review`, `lr_comment`, `workspace`, `workflow_run`.
- [ ] The `source_id` field may be `null` (for notifications where the source was deleted or not applicable).
- [ ] The `subject` field is a non-empty string with a maximum length of 255 characters.
- [ ] The `body` field is a non-empty string.
- [ ] The `status` field is either `"read"` or `"unread"`.
- [ ] The `read_at` field is `null` for unread notifications and a valid ISO 8601 timestamp for read notifications.
- [ ] All timestamp fields (`created_at`, `updated_at`, `read_at`) are in ISO 8601 format with timezone.

### Performance
- [ ] The endpoint responds within 200ms for users with up to 10,000 notifications.
- [ ] The endpoint responds within 500ms for users with up to 100,000 notifications.
- [ ] The database query uses indexed access on `(user_id, created_at DESC)` to avoid full table scans.

### Definition of Done
- [ ] The `GET /api/notifications/list` endpoint is fully implemented and returns correct paginated results.
- [ ] All clients (Web UI, CLI, TUI) consume the paginated endpoint and render pagination controls.
- [ ] E2E tests cover happy path, edge cases, auth, and pagination boundaries.
- [ ] The endpoint is documented in the API reference.
- [ ] The `X-Total-Count` header is present on all responses.

## Design

### API Shape

**Endpoint:** `GET /api/notifications/list`

**Authentication:** Required. Session cookie, PAT (`Authorization: Bearer <token>`), or OAuth2 token.

**Query Parameters:**

| Parameter  | Type    | Default | Min | Max | Description                        |
|------------|---------|---------|-----|-----|------------------------------------||
| `page`     | integer | `1`     | `1` | —   | 1-based page number                |
| `per_page` | integer | `30`    | `1` | `50`| Number of notifications per page   |

**Response:** `200 OK`

**Response Headers:**

| Header          | Type    | Description                                     |
|-----------------|---------|-------------------------------------------------|
| `X-Total-Count` | integer | Total number of notifications for the user      |
| `Content-Type`  | string  | `application/json`                              |

**Response Body:** JSON array of notification objects.

```json
[
  {
    "id": 42,
    "user_id": 1,
    "source_type": "issue",
    "source_id": 97,
    "subject": "Issue #97 assigned to you",
    "body": "alice assigned issue #97 'Fix login timeout' to you",
    "status": "unread",
    "read_at": null,
    "created_at": "2026-03-21T10:30:00Z",
    "updated_at": "2026-03-21T10:30:00Z"
  }
]
```

**Error Responses:**

| Status | Condition                          |
|--------|------------------------------------||
| `400`  | Invalid query parameters           |
| `401`  | Missing or invalid authentication  |
| `429`  | Rate limit exceeded                |
| `500`  | Internal server error              |

### SDK Shape

The `NotificationService` exposes:

```typescript
interface NotificationListResult {
  items: NotificationResponse[];
  total: number;
}

listNotifications(userId: string, page?: number, perPage?: number): Promise<NotificationListResult>
```

- `page` defaults to `1`, normalized to minimum `1`.
- `perPage` defaults to `30`, clamped to `[1, 50]`.
- Offset computed as `(page - 1) * perPage`.
- Returns both the items for the requested page and the total count.

### Web UI Design

**Location:** Notification inbox accessible from the global header bell icon or `/inbox` route.

**Layout:**
- Page title: "Notifications" with unread count badge.
- Filter toolbar: "All" / "Unread" toggle pills.
- Notification list: each row shows:
  - Unread indicator (blue dot for unread, no indicator for read).
  - Source type icon (distinct icon per source type).
  - Subject line (truncated if exceeding available width).
  - Body preview (muted text, truncated to ~120 characters).
  - Relative timestamp ("2m ago", "1h ago", "3 days ago").
- Unread notifications are rendered with bold text weight; read notifications use normal weight.
- Pagination controls at the bottom: "Previous" / "Next" buttons with "Page X of Y" indicator, where Y is computed from `X-Total-Count` and `per_page`.
- Empty state: centered illustration with "No notifications yet" message.
- Loading state: skeleton rows matching notification row height.

**Responsive behavior:**
- At narrow widths (< 640px): hide body preview, show only subject and timestamp.
- At medium widths (640–1024px): show subject, truncated body preview, and timestamp.
- At wide widths (> 1024px): full layout with icon, subject, body preview, and timestamp.

**Interaction:**
- Clicking a notification row navigates to the source resource and marks the notification as read.
- Pagination buttons fire new `GET /api/notifications/list` requests with updated `page`.

### CLI Command

```
codeplane notification list [--page <N>] [--limit <N>] [--unread] [--json]
```

| Flag       | Type    | Default | Description                          |
|------------|---------|---------|--------------------------------------||
| `--page`   | integer | `1`     | Page number                          |
| `--limit`  | integer | `30`    | Results per page (maps to `per_page`)|
| `--unread` | boolean | `false` | Client-side filter to unread only    |
| `--json`   | boolean | `false` | Raw JSON output                      |

**Default output:** Human-readable table with columns: `ID`, `Status`, `Source`, `Subject`, `Time`.

**Pagination display:** Footer line showing `"Showing N of M notifications (page P)"`.

**Empty state:** `"No notifications."` message.

**JSON output:** Raw API response array, suitable for piping to `jq` or `--json` field filtering.

### TUI UI

**Screen:** `notifications` — accessible via `g n` keybinding, `:notifications` command palette entry, or `--screen notifications` deep-link.

**Layout:**
- Title bar: `"Notifications (N unread)"`.
- Filter toolbar: `[All]` / `[Unread]` toggle.
- Scrollable list: 30 items per page with vim-style navigation (`j`/`k`, `Ctrl+D`/`Ctrl+U`).
- Each row: unread indicator (`●` blue), source type icon, subject (truncated to terminal width), body preview (muted, truncated to 120 chars), relative timestamp.
- Pagination footer: `"Page P of T — ↑↓ navigate  n/p next/prev page"`.
- Memory cap: 500 notifications cached client-side; pages beyond the cap trigger fresh fetches.

**Keybindings:**
| Key          | Action                     |
|--------------|----------------------------|
| `j` / `↓`   | Move selection down        |
| `k` / `↑`   | Move selection up          |
| `Enter`      | Navigate to source         |
| `r`          | Mark focused as read       |
| `R`          | Mark all as read           |
| `f`          | Toggle All/Unread filter   |
| `/`          | Focus search input         |
| `Esc`        | Clear search / pop screen  |
| `n`          | Next page                  |
| `p`          | Previous page              |
| `Ctrl+D`     | Page down (half screen)    |
| `Ctrl+U`     | Page up (half screen)      |
| `g g`        | Jump to first item         |
| `G`          | Jump to last item          |
| `q`          | Pop screen                 |

### Neovim Plugin API

```lua
require('codeplane').notifications({ page = 1, limit = 30 })
```

Opens a Telescope picker with paginated notification results. Each entry shows source type, subject, and timestamp. Selecting an entry navigates to the source resource if possible.

### VS Code Extension

The notification list is surfaced via:
- A tree view provider in the Codeplane sidebar showing recent notifications.
- A webview panel accessible from the Codeplane dashboard that renders the full paginated inbox.
- Status bar badge showing unread count.

### Documentation

The following end-user documentation must be written:

1. **API Reference: List Notifications** — Full endpoint documentation with request/response examples, query parameter descriptions, and error codes.
2. **CLI Reference: `notification list`** — Command usage, flags, output format, and examples.
3. **User Guide: Notification Inbox** — How to access notifications from web, CLI, TUI, and editors. How pagination works. How to filter and navigate.
4. **TUI Quick Reference** — Keybinding cheat sheet for the notification screen.

## Permissions & Security

### Authorization

| Role        | Access                                                   |
|-------------|----------------------------------------------------------|
| Authenticated user | Can list their own notifications only.            |
| Anonymous / unauthenticated | `401 Unauthorized`. No access.         |
| Admin       | Same as authenticated user (admin cannot view other users' notifications via this endpoint). |

- The endpoint is strictly user-scoped. The `user_id` is always derived from the authenticated session, never from a query parameter. There is no way to enumerate or access another user's notifications through this endpoint.
- PAT tokens grant the same notification access as session cookies for the token's owning user.
- Deploy keys and machine tokens do not have notification access.

### Rate Limiting

| Scope        | Limit               | Window   | Response on exceed |
|--------------|----------------------|----------|--------------------|
| Per user     | 120 requests         | 1 minute | `429` with `Retry-After` header |
| Per IP (unauth) | 10 requests      | 1 minute | `429` with `Retry-After` header |

The notification list endpoint is a read-heavy endpoint likely polled by clients. The per-user limit of 120/min (2/sec) accommodates aggressive polling while preventing abuse. The per-IP unauthenticated limit is low because unauthenticated requests should not reach this endpoint at all.

### Data Privacy

- Notification subjects and bodies may contain usernames, repository names, issue titles, and comment excerpts. These are user-generated content and are not considered PII beyond what the user already has access to.
- Notification data is only accessible by the owning user. The database query always filters by `user_id` derived from the session.
- Notification IDs are sequential integers. This does not constitute an enumeration risk because the `user_id` filter prevents cross-user access regardless of ID guessing.
- The `X-Total-Count` header reveals only the authenticated user's own total count. No other user's count is exposed.

## Telemetry & Product Analytics

### Business Events

| Event Name                | Trigger                                    | Properties                                                                                   |
|---------------------------|--------------------------------------------|----------------------------------------------------------------------------------------------|
| `NotificationListViewed`  | Successful `GET /api/notifications/list`   | `user_id`, `page`, `per_page`, `total_count`, `result_count`, `client` (web/cli/tui/editor)  |
| `NotificationListEmpty`   | List response returns zero items           | `user_id`, `page`, `per_page`, `total_count`, `client`                                       |
| `NotificationListPageNav` | User navigates to a page other than 1      | `user_id`, `page`, `per_page`, `total_count`, `client`                                       |

### Event Properties

All notification telemetry events must include:
- `user_id` — Anonymized or hashed user identifier.
- `client` — Client surface (`web`, `cli`, `tui`, `vscode`, `neovim`, `desktop`).
- `timestamp` — ISO 8601 event timestamp.
- `page` — Requested page number.
- `per_page` — Requested page size.
- `total_count` — Total notifications for the user at time of request.
- `result_count` — Number of notifications returned in this page.

### Funnel Metrics & Success Indicators

| Metric                        | Target                    | Description                                                     |
|-------------------------------|---------------------------|-----------------------------------------------------------------|
| **P50 response time**         | < 100ms                   | Median latency for paginated list requests.                     |
| **P99 response time**         | < 500ms                   | Tail latency under load.                                        |
| **Inbox visit rate**          | > 60% of active users/week| Percentage of weekly active users who view their notifications.  |
| **Page-2+ navigation rate**   | Tracked (no target)       | How often users page beyond page 1 — indicates inbox depth.     |
| **Error rate**                | < 0.1%                    | Percentage of requests returning 4xx/5xx.                        |
| **Empty inbox rate**          | Tracked (no target)       | Percentage of users with zero notifications — indicates fanout health. |

## Observability

### Logging Requirements

| Log Event                      | Level  | Structured Fields                                                       | When                                |
|--------------------------------|--------|-------------------------------------------------------------------------|-------------------------------------|
| `notification.list.request`    | `info` | `user_id`, `page`, `per_page`, `request_id`                            | On every list request               |
| `notification.list.response`   | `info` | `user_id`, `page`, `per_page`, `result_count`, `total_count`, `latency_ms`, `request_id` | On every successful response |
| `notification.list.error`      | `error`| `user_id`, `page`, `per_page`, `error_message`, `error_code`, `request_id` | On any error response          |
| `notification.list.slow`       | `warn` | `user_id`, `page`, `per_page`, `total_count`, `latency_ms`, `request_id` | When latency exceeds 500ms        |
| `notification.list.auth_fail`  | `warn` | `ip`, `user_agent`, `request_id`                                        | On 401 responses                    |
| `notification.list.rate_limit` | `warn` | `user_id`, `ip`, `request_id`                                          | On 429 responses                    |

### Prometheus Metrics

| Metric Name                                     | Type      | Labels                           | Description                                              |
|-------------------------------------------------|-----------|----------------------------------|----------------------------------------------------------|
| `codeplane_notification_list_requests_total`    | counter   | `status` (2xx, 4xx, 5xx)        | Total paginated list requests by response status.        |
| `codeplane_notification_list_duration_seconds`  | histogram | `page_bucket` (1, 2-5, 6+)      | Request duration distribution, bucketed by page range.   |
| `codeplane_notification_list_result_count`      | histogram | —                                | Distribution of result counts per response.              |
| `codeplane_notification_list_total_count`       | histogram | —                                | Distribution of user total notification counts.          |
| `codeplane_notification_list_errors_total`      | counter   | `error_type` (auth, validation, internal) | Error breakdown by type.                        |

### Alerts and Runbooks

#### Alert: `NotificationListHighErrorRate`
**Condition:** `rate(codeplane_notification_list_errors_total{error_type="internal"}[5m]) / rate(codeplane_notification_list_requests_total[5m]) > 0.05`
**Severity:** Critical
**Runbook:**
1. Check the Codeplane server logs for `notification.list.error` entries in the last 10 minutes.
2. Look for database connection errors or timeout patterns. Run `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'` to check for connection pool exhaustion.
3. Check if the notifications table has grown unexpectedly: `SELECT reltuples FROM pg_class WHERE relname = 'notifications'`.
4. Verify the `(user_id, created_at DESC)` index is present and not corrupted: `SELECT * FROM pg_indexes WHERE tablename = 'notifications'`.
5. If the index is missing, recreate it. If the table is bloated, schedule a `VACUUM ANALYZE`.
6. Check for any recent deployments that may have introduced a regression in the notification service or route handler.
7. If the issue persists, enable debug logging on the notification service and capture a query plan with `EXPLAIN ANALYZE` for a failing user.

#### Alert: `NotificationListHighLatency`
**Condition:** `histogram_quantile(0.99, rate(codeplane_notification_list_duration_seconds_bucket[5m])) > 1.0`
**Severity:** Warning
**Runbook:**
1. Check `notification.list.slow` log entries for the affected time window.
2. Identify if latency is concentrated on specific users (high `total_count`) or all users.
3. Run `EXPLAIN ANALYZE` for the `listNotificationsByUser` query with the affected user's ID.
4. Check database load: `SELECT * FROM pg_stat_user_tables WHERE relname = 'notifications'` — look for sequential scans indicating a missing or unused index.
5. Check if autovacuum is keeping up: `SELECT last_autovacuum, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'notifications'`.
6. If a specific user has an extremely large notification set (> 100K), consider whether a background cleanup or archival job is needed.
7. If latency is system-wide, check overall database CPU and I/O metrics in Grafana.

#### Alert: `NotificationListAuthFailureSpike`
**Condition:** `rate(codeplane_notification_list_errors_total{error_type="auth"}[5m]) > 50`
**Severity:** Warning
**Runbook:**
1. Check `notification.list.auth_fail` log entries for source IPs and user agents.
2. Determine if the failures are from a single IP (potential credential stuffing or bot) or distributed.
3. If a single IP, verify if rate limiting is engaging. If not, check the rate limiter configuration.
4. If distributed, check if there's a client deployment that broke authentication (expired tokens, cookie format change).
5. Cross-reference with the auth service logs to see if the session/token validation itself is failing.
6. If it's a legitimate client bug, escalate to the client team. If it's abuse, consider temporary IP blocking.

#### Alert: `NotificationListRateLimitSpike`
**Condition:** `rate(codeplane_notification_list_errors_total{error_type="rate_limit"}[5m]) > 100`
**Severity:** Info
**Runbook:**
1. Identify which users or IPs are hitting rate limits via `notification.list.rate_limit` log entries.
2. Determine if a client is polling too aggressively (should use SSE for real-time updates instead of polling the list endpoint).
3. If it's a first-party client (CLI, TUI, desktop), file a bug to reduce polling frequency.
4. If it's a third-party integration, document the rate limits in the API reference.
5. No immediate action required unless the rate limiting is causing cascading failures.

### Error Cases and Failure Modes

| Error Case                   | Response   | Behavior                                                       |
|------------------------------|------------|----------------------------------------------------------------|
| Unauthenticated request      | `401`      | No data returned. Logged as `auth_fail`.                       |
| Invalid query parameters     | `400`      | Error message describes the invalid parameter.                 |
| Rate limit exceeded          | `429`      | `Retry-After` header. Logged as `rate_limit`.                  |
| Database connection failure  | `500`      | Generic error response. Logged as `error` with DB error detail.|
| Database query timeout       | `500`      | Generic error response. Logged with `latency_ms`.              |
| Corrupted notification data  | `500`      | Serialization failure. Logged with row ID if available.        |
| Service registry unavailable | `500`      | Server startup failure. Health check should catch this.        |

## Verification

### API Integration Tests

| # | Test Name                                                         | Description                                                                                                          |
|---|-------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| 1 | `GET /api/notifications/list returns 401 when unauthenticated`    | Request with no session/token returns 401.                                                                           |
| 2 | `GET /api/notifications/list returns empty array for new user`    | Authenticated user with zero notifications gets `[]` and `X-Total-Count: 0`.                                         |
| 3 | `GET /api/notifications/list returns notifications newest-first`  | Seed 5 notifications at different times; verify order is descending by `created_at`.                                 |
| 4 | `GET /api/notifications/list respects default pagination`         | Seed 35 notifications; default request returns 30 items and `X-Total-Count: 35`.                                     |
| 5 | `GET /api/notifications/list respects custom per_page`            | Request with `per_page=10` returns exactly 10 items.                                                                 |
| 6 | `GET /api/notifications/list respects page parameter`             | Seed 35 notifications; `page=2&per_page=30` returns 5 items.                                                        |
| 7 | `GET /api/notifications/list caps per_page at 50`                 | Request with `per_page=100` returns at most 50 items.                                                                |
| 8 | `GET /api/notifications/list normalizes page < 1 to 1`           | Request with `page=0` or `page=-1` returns the same results as `page=1`.                                            |
| 9 | `GET /api/notifications/list returns empty for page beyond last`  | Seed 10 notifications; `page=2&per_page=30` returns `[]` with `X-Total-Count: 10`.                                  |
| 10| `GET /api/notifications/list includes X-Total-Count header`       | Verify the header is present and is a valid integer on every successful response.                                    |
| 11| `GET /api/notifications/list returns correct notification shape`  | Verify every field (`id`, `user_id`, `source_type`, `source_id`, `subject`, `body`, `status`, `read_at`, `created_at`, `updated_at`) is present and correctly typed. |
| 12| `GET /api/notifications/list scopes to authenticated user`        | Create notifications for user A and user B; user A's request returns only user A's notifications.                    |
| 13| `GET /api/notifications/list handles null source_id`              | Seed a notification with `source_id: null`; verify it serializes correctly.                                          |
| 14| `GET /api/notifications/list reflects read status correctly`      | Seed read and unread notifications; verify `status` and `read_at` fields are correct.                                |
| 15| `GET /api/notifications/list handles max per_page=50 correctly`   | Seed 60 notifications; `per_page=50` returns 50 items with `X-Total-Count: 60`.                                     |
| 16| `GET /api/notifications/list handles per_page=1 (minimum)`       | Seed 5 notifications; `per_page=1` returns 1 item with `X-Total-Count: 5`.                                          |
| 17| `GET /api/notifications/list rejects non-integer per_page`       | Request with `per_page=abc` returns 400 or normalizes to default.                                                    |
| 18| `GET /api/notifications/list rejects non-integer page`           | Request with `page=xyz` returns 400 or normalizes to default.                                                        |
| 19| `GET /api/notifications/list works with PAT authentication`      | Use a personal access token instead of a session cookie; verify correct response.                                    |
| 20| `GET /api/notifications/list returns 429 on rate limit`          | Issue requests exceeding the rate limit; verify 429 response with `Retry-After` header.                             |
| 21| `GET /api/notifications/list handles large notification volume`  | Seed 10,000 notifications; verify first page returns in < 500ms with correct `X-Total-Count`.                        |
| 22| `GET /api/notifications/list boundary: exactly per_page items`   | Seed exactly 30 notifications; `per_page=30` returns 30 items and `X-Total-Count: 30`; page 2 returns `[]`.         |
| 23| `GET /api/notifications/list all source_types represented`       | Seed one notification per source type; verify all are returned with correct `source_type` values.                    |
| 24| `GET /api/notifications/list subject max length 255`             | Seed a notification with a 255-character subject; verify it returns correctly without truncation.                     |
| 25| `GET /api/notifications/list subject exceeding 255 chars`        | Attempt to create a notification with a 256-character subject; verify creation fails or truncates predictably.        |

### CLI E2E Tests

| # | Test Name                                                           | Description                                                                                          |
|---|---------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| 26| `codeplane notification list requires authentication`               | Running without auth prints an error and exits non-zero.                                             |
| 27| `codeplane notification list shows notifications`                   | Authenticated user with seeded notifications sees a formatted table.                                 |
| 28| `codeplane notification list --page 2 paginates correctly`          | Verify second page output matches expected items.                                                    |
| 29| `codeplane notification list --limit 5 respects limit`              | Verify exactly 5 rows in output.                                                                     |
| 30| `codeplane notification list --limit 100 caps at 50`               | Verify output does not exceed 50 items regardless of limit flag.                                     |
| 31| `codeplane notification list --unread filters client-side`          | Seed mix of read/unread; `--unread` shows only unread.                                               |
| 32| `codeplane notification list --json outputs raw JSON`               | Verify output is valid JSON array matching API response shape.                                       |
| 33| `codeplane notification list shows empty state`                     | User with no notifications sees "No notifications." message.                                         |
| 34| `codeplane notification list shows pagination footer`               | Verify footer line like "Showing N of M notifications (page P)".                                     |

### Playwright (Web UI) E2E Tests

| # | Test Name                                                           | Description                                                                                          |
|---|---------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| 35| `Inbox page loads and shows notifications`                          | Navigate to `/inbox`; verify notification rows render.                                               |
| 36| `Inbox page shows empty state for new user`                         | New user sees "No notifications yet" message.                                                        |
| 37| `Inbox page pagination controls work`                               | Seed > 30 notifications; verify "Next" button loads page 2; "Previous" returns to page 1.            |
| 38| `Inbox page shows correct count`                                    | Verify "Showing X of Y" text matches seeded notification count.                                      |
| 39| `Inbox page clicking notification navigates to source`              | Click an issue notification; verify navigation to issue detail page.                                 |
| 40| `Inbox page unread notifications are visually distinct`             | Verify unread notifications have the blue dot indicator and bold text.                                |
| 41| `Inbox page responsive layout hides body at narrow width`           | Resize viewport to < 640px; verify body preview column is hidden.                                    |
| 42| `Inbox page filter toggle switches between All and Unread`          | Click "Unread" filter; verify only unread notifications are shown.                                   |
| 43| `Inbox page loads when accessed via header bell icon`               | Click the notification bell in the header; verify inbox page opens.                                  |
| 44| `Inbox page shows loading skeletons during fetch`                   | Intercept API call to add delay; verify skeleton rows appear.                                        |

### TUI E2E Tests

| # | Test Name                                                           | Description                                                                                          |
|---|---------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| 45| `TUI notification screen renders paginated list`                    | Launch TUI with `--screen notifications`; verify notification rows appear.                           |
| 46| `TUI notification screen j/k navigation works`                      | Press `j` and `k`; verify focus moves between rows.                                                  |
| 47| `TUI notification screen pagination with n/p keys`                  | Seed > 30 notifications; press `n` to advance page; verify new items load.                           |
| 48| `TUI notification screen shows unread count in title`               | Verify title shows correct unread count.                                                             |
| 49| `TUI notification screen f key toggles filter`                      | Press `f`; verify filter changes from All to Unread.                                                 |
| 50| `TUI notification screen empty state message`                       | New user sees appropriate empty message.                                                             |
| 51| `TUI notification screen r marks focused as read`                   | Focus unread notification; press `r`; verify visual update.                                          |
| 52| `TUI notification screen R marks all as read`                       | Press `R`; verify all indicators update.                                                             |

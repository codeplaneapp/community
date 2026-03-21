# NOTIFICATION_CLI_LIST

Specification for NOTIFICATION_CLI_LIST.

## High-Level User POV

When you use the Codeplane CLI to check your notifications, you run `codeplane notification list` and immediately see a summary of everything that has happened across your Codeplane world — issues assigned to you, reviews on your landing requests, workflow runs completing, workspaces shared with you, and more. Each notification tells you what happened, where it happened, and when, giving you a clear picture of your inbox without ever leaving the terminal.

The list shows your most recent notifications first. By default you see up to 30 at a time, but you can control how many appear and which page you're viewing. If you only care about things you haven't seen yet, you can filter to show only unread notifications. When you need to pipe notification data into scripts or other tools, a JSON output mode gives you the raw API response for easy processing with `jq` or Codeplane's own `--json` field filtering.

The command works the same whether you're authenticated via a personal access token, a stored session, or a daemon-linked credential. If you're not authenticated, the CLI tells you so immediately with a clear error. If your inbox is empty, you get a friendly message rather than confusing silence. If you ask for a page beyond the last one, you get an empty result with the total count so you know you've reached the end.

This command is the primary entry point for staying aware of Codeplane activity from the terminal. It is especially valuable for developers who live in the terminal, for CI/automation scripts that need to poll for specific notification types, and for agent-assisted workflows that triage incoming events. It pairs naturally with `codeplane notification read` to mark items as handled once you've acted on them.

## Acceptance Criteria

### Core Behavior
- [ ] `codeplane notification list` returns a list of the authenticated user's notifications, ordered newest-first by creation time.
- [ ] Each notification in the output includes: ID, status (read/unread), source type, subject, and timestamp.
- [ ] The default output is a human-readable table with columns: `ID`, `Status`, `Source`, `Subject`, `Time`.
- [ ] The command exits with code `0` on success, including when the result is an empty list.
- [ ] The command exits with a non-zero code and a descriptive error message when authentication fails.

### Pagination
- [ ] `--page <N>` controls which page of results to fetch. Default is `1`.
- [ ] `--limit <N>` controls how many notifications to return per page. Default is `30`.
- [ ] The `--limit` value maps to the server's `per_page` query parameter.
- [ ] The server clamps `per_page` to a maximum of `50`. A `--limit` value exceeding `50` silently returns at most 50 results.
- [ ] The server normalizes `page < 1` to `1`. A `--page 0` or `--page -1` returns the same results as `--page 1`.
- [ ] The server normalizes `per_page < 1` to the default of `30`.
- [ ] Requesting a page beyond the last page returns an empty list (not an error).
- [ ] A pagination footer line is displayed in human-readable mode: `"Showing N of M notifications (page P)"`.

### Filtering
- [ ] `--unread` restricts the output to only unread notifications.
- [ ] The `--unread` flag sends `status=unread` as a query parameter to the API.
- [ ] When `--unread` is not specified, all notifications (read and unread) are returned.
- [ ] If no unread notifications exist and `--unread` is set, the output is an empty list with the "No notifications." message.

### Output Modes
- [ ] `--json` outputs the raw JSON array from the API response, suitable for piping to `jq`.
- [ ] JSON output is valid JSON in all cases (empty list produces `[]`).
- [ ] JSON output includes all notification fields: `id`, `user_id`, `source_type`, `source_id`, `subject`, `body`, `status`, `read_at`, `created_at`, `updated_at`.
- [ ] In human-readable mode, the `Time` column shows relative timestamps (e.g., "2m ago", "3h ago", "5 days ago").
- [ ] In human-readable mode, subjects longer than the available terminal width are truncated with an ellipsis.

### Empty and Boundary States
- [ ] A user with zero notifications sees: `"No notifications."` in human-readable mode or `[]` in JSON mode.
- [ ] A user with exactly `--limit` notifications on the last page sees a full page; the next page returns empty.
- [ ] Non-integer `--page` or `--limit` values produce a validation error and exit non-zero.
- [ ] Negative `--page` or `--limit` values are normalized by the server.

### Authentication Boundary
- [ ] The command requires a valid authentication token (PAT, session, or daemon credential).
- [ ] Running without authentication prints an authentication error and exits non-zero.
- [ ] An expired or invalid token returns an authentication error and exits non-zero.

### Field Constraints
- [ ] `source_type` is one of: `issue`, `issue_comment`, `landing_request`, `lr_review`, `lr_comment`, `workspace`, `workflow_run`.
- [ ] `source_id` may be `null` (displayed as `-` or omitted in human-readable mode).
- [ ] `status` is either `"read"` or `"unread"`.
- [ ] `read_at` is `null` for unread notifications and a valid ISO 8601 timestamp for read notifications.
- [ ] All timestamp fields are ISO 8601 format.

### Definition of Done
- [ ] The `notification list` CLI command is fully implemented with all flags: `--page`, `--limit`, `--unread`, `--json`.
- [ ] Human-readable table output, pagination footer, and empty state are implemented.
- [ ] JSON output passes the raw API response array.
- [ ] E2E CLI tests cover: auth requirement, happy path, pagination, limit capping, unread filter, JSON output, and empty state.
- [ ] CLI help text (`codeplane notification list --help`) documents all flags with descriptions.
- [ ] The command is documented in the CLI reference.

## Design

### CLI Command

```
codeplane notification list [--page <N>] [--limit <N>] [--unread] [--json]
```

**Flags:**

| Flag       | Type    | Default | Description                                               |
|------------|---------|---------|-----------------------------------------------------------|
| `--page`   | integer | `1`     | 1-based page number to retrieve.                          |
| `--limit`  | integer | `30`    | Number of notifications per page (server-capped at 50).   |
| `--unread` | boolean | `false` | When set, only unread notifications are returned.         |
| `--json`   | boolean | `false` | Output raw JSON array instead of human-readable table.    |

**Human-Readable Output Example:**

```
ID     Status   Source            Subject                                    Time
────   ──────   ───────────────   ─────────────────────────────────────────   ─────────
142    unread   issue             Issue #97 assigned to you                  2m ago
141    unread   lr_review         alice approved LR #34                      15m ago
140    read     workflow_run      Workflow "CI" run #88 succeeded            1h ago
139    read     issue_comment     bob commented on Issue #42                 3h ago
138    read     lr_comment        carol commented on LR #21                  1 day ago

Showing 5 of 5 notifications (page 1)
```

**JSON Output Example:**

```json
[
  {
    "id": 142,
    "user_id": 1,
    "source_type": "issue",
    "source_id": 97,
    "subject": "Issue #97 assigned to you",
    "body": "alice assigned issue #97 'Fix login timeout' to you",
    "status": "unread",
    "read_at": null,
    "created_at": "2026-03-22T10:30:00Z",
    "updated_at": "2026-03-22T10:30:00Z"
  }
]
```

**Empty State Output:** `No notifications.`

**Error Output (unauthenticated):** `Error: authentication required. Run \`codeplane auth login\` to authenticate.`

**Help Text:**

```
codeplane notification list — List your notifications

USAGE
  codeplane notification list [flags]

FLAGS
  --page <N>     Page number (default: 1)
  --limit <N>    Results per page (default: 30, max: 50)
  --unread       Show only unread notifications
  --json         Output as JSON

EXAMPLES
  codeplane notification list
  codeplane notification list --unread
  codeplane notification list --page 2 --limit 10
  codeplane notification list --json | jq '.[].subject'
```

### API Shape

**Endpoint:** `GET /api/notifications/list`

**Authentication:** Required. PAT (`Authorization: token <token>`), session cookie, or OAuth2 token.

**Query Parameters:**

| Parameter  | Type    | Default | Min | Max | Description                                |
|------------|---------|---------|-----|-----|--------------------------------------------||
| `page`     | integer | `1`     | `1` | —   | 1-based page number.                       |
| `per_page` | integer | `30`    | `1` | `50`| Number of notifications per page.          |
| `status`   | string  | —       | —   | —   | Filter by status. Accepted: `unread`.      |

**CLI-to-API Mapping:**
- `--page N` → `?page=N`
- `--limit N` → `?per_page=N` (note: CLI currently sends as `limit`; should map to `per_page`)
- `--unread` → `?status=unread`

**Response:** `200 OK`

**Response Headers:**

| Header          | Type    | Description                                 |
|-----------------|---------|---------------------------------------------|
| `X-Total-Count` | integer | Total notifications for the user.           |
| `Content-Type`  | string  | `application/json`                          |

**Response Body:** JSON array of notification objects.

```typescript
interface NotificationResponse {
  id: number;
  user_id: number;
  source_type: string;
  source_id: number | null;
  subject: string;
  body: string;
  status: "read" | "unread";
  read_at: string | null;
  created_at: string;
  updated_at: string;
}
```

**Error Responses:**

| Status | Condition                         |
|--------|-----------------------------------|
| `401`  | Missing or invalid authentication |
| `429`  | Rate limit exceeded               |
| `500`  | Internal server error             |

### SDK Shape

The `NotificationService.listNotifications` method:

```typescript
listNotifications(
  userId: number,
  page: number,
  perPage: number
): Promise<Result<NotificationListResult, APIError>>

interface NotificationListResult {
  items: NotificationResponse[];
  total: number;
}
```

The current implementation does not support server-side `status` filtering. The `--unread` flag sends `status=unread` but the server ignores it. The spec requires the server to add support for the `status` query parameter to filter notifications by read/unread status.

### Documentation

The following end-user documentation must be written:

1. **CLI Reference: `notification list`** — Full command documentation including: synopsis, all flags with types/defaults/descriptions, output format examples (table and JSON), empty state behavior, pagination explanation, and practical usage examples including piping to `jq`.

2. **User Guide: Checking Notifications from the CLI** — A short tutorial covering: how to see your latest notifications, how to filter to unread only, how to paginate through a large inbox, how to use JSON output for scripting, and how `notification list` pairs with `notification read` for a complete inbox workflow.

3. **CLI Quick Reference card update** — Add `notification list` to the CLI quick reference with a one-liner example.

## Permissions & Security

### Authorization

| Role                     | Access                                                              |
|--------------------------|---------------------------------------------------------------------|
| Authenticated user       | Can list their own notifications only.                              |
| Anonymous/unauthenticated| `401 Unauthorized`. No access.                                      |
| Admin                    | Same as authenticated user. Cannot view other users' notifications. |
| Deploy keys              | No notification access. Deploy keys are repository-scoped.          |
| Machine tokens           | No notification access unless the token is a user PAT.              |

- The `user_id` used for notification retrieval is always derived from the authenticated session or token. It is never accepted as a query parameter. There is no path to enumerate or access another user's notifications.
- PATs grant the same notification access as session cookies for the PAT's owning user.

### Rate Limiting

| Scope              | Limit         | Window   | Response on exceed                    |
|--------------------|---------------|----------|---------------------------------------|
| Per authenticated user | 120 requests | 1 minute | `429` with `Retry-After` header       |
| Per IP (unauth)    | 10 requests   | 1 minute | `429` with `Retry-After` header       |

The notification list is a read-heavy endpoint potentially polled by CLI scripts or automation. The 120/min per-user limit (2 req/sec) accommodates aggressive polling while preventing abuse. Users needing real-time updates should use the SSE streaming endpoint instead.

### Data Privacy

- Notification subjects and bodies contain usernames, repository names, issue titles, and comment excerpts. These are user-generated content visible to the owning user in other contexts.
- The `user_id` in each notification response matches the authenticated user. No cross-user data exposure is possible.
- Notification IDs are sequential integers. This is not an enumeration risk because the `user_id` filter prevents cross-user access.
- The `X-Total-Count` header reveals only the authenticated user's notification count.
- CLI JSON output may be stored in shell history or log files. Users should be aware that notification content may contain sensitive project details when piped to files.

## Telemetry & Product Analytics

### Business Events

| Event Name                     | Trigger                                                | Properties                                                                                               |
|--------------------------------|--------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `NotificationCLIListViewed`    | Successful `codeplane notification list` execution     | `user_id`, `page`, `limit`, `unread_filter`, `result_count`, `total_count`, `output_format` (table/json) |
| `NotificationCLIListEmpty`     | List returns zero results                              | `user_id`, `page`, `limit`, `unread_filter`, `total_count`, `output_format`                              |
| `NotificationCLIListPaginated` | User uses `--page` with a value other than 1           | `user_id`, `page`, `limit`, `total_count`, `output_format`                                               |
| `NotificationCLIListFiltered`  | User uses `--unread` flag                              | `user_id`, `page`, `limit`, `unread_filter`, `result_count`, `total_count`                               |

### Event Properties

All notification CLI telemetry events must include:
- `user_id` — Anonymized or hashed user identifier.
- `client` — Always `"cli"` for this feature.
- `timestamp` — ISO 8601 event timestamp.
- `page` — Requested page number.
- `limit` — Requested per-page limit.
- `unread_filter` — Boolean indicating if `--unread` was used.
- `total_count` — Total notifications for the user (from `X-Total-Count`).
- `result_count` — Number of notifications returned in this response.
- `output_format` — `"json"` or `"table"`.

### Funnel Metrics & Success Indicators

| Metric                              | Target               | Description                                                                  |
|-------------------------------------|----------------------|------------------------------------------------------------------------------|
| **CLI notification list adoption**  | Tracked              | Number of unique users running `notification list` per week.                 |
| **CLI list → mark-read conversion** | > 20%                | Percentage of `notification list` sessions followed by `notification read`.  |
| **P50 CLI command latency**         | < 300ms              | Median wall-clock time for the full CLI command (includes network + render). |
| **P99 CLI command latency**         | < 1500ms             | Tail latency for the full CLI command.                                       |
| **JSON output usage rate**          | Tracked              | Percentage of `notification list` invocations using `--json`.                |
| **--unread filter usage rate**      | Tracked              | Percentage of invocations using `--unread` — indicates triage behavior.      |
| **Error rate**                      | < 0.5%               | Percentage of invocations exiting non-zero (excluding auth errors).          |
| **Page-2+ navigation rate**         | Tracked              | How often users paginate beyond page 1 — indicates inbox depth.              |

## Observability

### Logging Requirements

| Log Event                            | Level   | Structured Fields                                                                 | When                                        |
|--------------------------------------|---------|-----------------------------------------------------------------------------------|---------------------------------------------|
| `notification.list.request`          | `info`  | `user_id`, `page`, `per_page`, `status_filter`, `request_id`                     | On every list API request                   |
| `notification.list.response`         | `info`  | `user_id`, `page`, `per_page`, `result_count`, `total_count`, `latency_ms`, `request_id` | On every successful API response     |
| `notification.list.error`            | `error` | `user_id`, `page`, `per_page`, `error_message`, `error_code`, `request_id`       | On any error response                       |
| `notification.list.slow`             | `warn`  | `user_id`, `page`, `per_page`, `total_count`, `latency_ms`, `request_id`         | When API latency exceeds 500ms              |
| `notification.list.auth_fail`        | `warn`  | `ip`, `user_agent`, `request_id`                                                 | On 401 responses                            |
| `notification.list.rate_limit`       | `warn`  | `user_id`, `ip`, `request_id`                                                    | On 429 responses                            |
| `cli.notification.list.invoked`      | `debug` | `page`, `limit`, `unread`, `json`, `cli_version`                                 | When CLI command is invoked (client-side)    |
| `cli.notification.list.render`       | `debug` | `result_count`, `output_format`, `render_ms`                                     | After CLI renders output (client-side)       |

### Prometheus Metrics

| Metric Name                                          | Type      | Labels                                    | Description                                              |
|------------------------------------------------------|-----------|-------------------------------------------|----------------------------------------------------------|
| `codeplane_notification_list_requests_total`         | counter   | `status` (2xx, 4xx, 5xx), `client`       | Total list requests by response status and client.       |
| `codeplane_notification_list_duration_seconds`       | histogram | `page_bucket` (1, 2-5, 6+)              | Request duration distribution, bucketed by page range.   |
| `codeplane_notification_list_result_count`           | histogram | —                                         | Distribution of result counts per response.              |
| `codeplane_notification_list_total_count`            | histogram | —                                         | Distribution of user total notification counts.          |
| `codeplane_notification_list_errors_total`           | counter   | `error_type` (auth, validation, internal, rate_limit) | Error breakdown by type.                   |
| `codeplane_cli_notification_list_duration_seconds`   | histogram | `output_format` (table, json)            | End-to-end CLI command duration (client-side).           |

### Alerts and Runbooks

#### Alert: `NotificationListHighErrorRate`
**Condition:** `rate(codeplane_notification_list_errors_total{error_type="internal"}[5m]) / rate(codeplane_notification_list_requests_total[5m]) > 0.05`
**Severity:** Critical
**Runbook:**
1. Check Codeplane server logs for `notification.list.error` entries in the last 10 minutes. Look for patterns — are errors concentrated on specific users or all users?
2. Check database connectivity: `SELECT 1` against the primary database. Look for connection pool exhaustion in `pg_stat_activity`.
3. Check if the notifications table has grown unexpectedly: `SELECT reltuples FROM pg_class WHERE relname = 'notifications'`.
4. Verify the `(user_id, created_at DESC)` index exists: `SELECT * FROM pg_indexes WHERE tablename = 'notifications'`.
5. If index is missing, recreate it. If table is bloated, run `VACUUM ANALYZE notifications`.
6. Check for recent deployments that may have introduced a regression in the notification service or route handler.
7. If the issue persists, enable debug logging and capture `EXPLAIN ANALYZE` output for a failing query.

#### Alert: `NotificationListHighLatency`
**Condition:** `histogram_quantile(0.99, rate(codeplane_notification_list_duration_seconds_bucket[5m])) > 1.0`
**Severity:** Warning
**Runbook:**
1. Check `notification.list.slow` log entries to identify affected users.
2. Determine if latency correlates with high `total_count` (users with large inboxes) or is system-wide.
3. Run `EXPLAIN ANALYZE` for the `listNotificationsByUser` query with an affected user's ID.
4. Check `pg_stat_user_tables` for sequential scans on the notifications table.
5. Check autovacuum status: `SELECT last_autovacuum, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'notifications'`.
6. For users with extremely large notification sets (> 100K), consider implementing background archival.
7. If system-wide, check overall database CPU, I/O, and memory metrics in Grafana.

#### Alert: `NotificationListAuthFailureSpike`
**Condition:** `rate(codeplane_notification_list_errors_total{error_type="auth"}[5m]) > 50`
**Severity:** Warning
**Runbook:**
1. Check `notification.list.auth_fail` log entries for source IPs and user agents.
2. If concentrated on a single IP: potential credential stuffing or misconfigured bot. Verify rate limiting is engaging.
3. If distributed: check if a CLI release broke authentication (expired token format, changed auth header).
4. Cross-reference with auth service logs to determine if token/session validation itself is failing.
5. If a legitimate client bug, escalate to the client team. If abuse, consider temporary IP blocking.

#### Alert: `NotificationListRateLimitSpike`
**Condition:** `rate(codeplane_notification_list_errors_total{error_type="rate_limit"}[5m]) > 100`
**Severity:** Info
**Runbook:**
1. Identify which users or IPs are hitting rate limits via `notification.list.rate_limit` log entries.
2. Determine if a CLI script or automation is polling too aggressively (should use SSE streaming instead).
3. If it's a first-party client, file a bug to reduce polling frequency or migrate to SSE.
4. If it's a third-party integration, document rate limits in the API reference and suggest SSE.
5. No immediate action unless rate limiting is causing cascading failures.

### Error Cases and Failure Modes

| Error Case                     | CLI Exit Code | Response   | Behavior                                                            |
|--------------------------------|---------------|------------|---------------------------------------------------------------------|
| No authentication credential   | Non-zero      | —          | CLI prints auth error message. No API call made.                    |
| Invalid/expired token          | Non-zero      | `401`      | CLI prints "authentication required" error.                         |
| Invalid `--page` type          | Non-zero      | —          | CLI validates before sending; prints usage error.                   |
| Invalid `--limit` type         | Non-zero      | —          | CLI validates before sending; prints usage error.                   |
| Rate limit exceeded            | Non-zero      | `429`      | CLI prints "rate limit exceeded, try again in N seconds".           |
| Server unavailable             | Non-zero      | —          | CLI prints connection error with server URL.                        |
| Database connection failure    | Non-zero      | `500`      | CLI prints "internal server error" generic message.                 |
| Database query timeout         | Non-zero      | `500`      | CLI prints "internal server error" generic message.                 |
| Network timeout                | Non-zero      | —          | CLI prints timeout error.                                           |
| Malformed JSON response        | Non-zero      | —          | CLI prints parsing error.                                           |

## Verification

### CLI E2E Tests

| #  | Test Name                                                                       | Description                                                                                                                                         |
|----|---------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | `codeplane notification list requires authentication`                           | Run without a token (`CODEPLANE_TOKEN=""`). Verify exit code is non-zero and stderr contains an auth error message.                                  |
| 2  | `codeplane notification list returns notifications for authenticated user`      | Run with a valid token. Verify exit code is `0`. Parse JSON output and verify the response is a valid array where each element has `id` (number) and `subject` (string). |
| 3  | `codeplane notification list --json outputs valid JSON array`                   | Run with `--json`. Verify stdout is valid JSON. Verify the parsed result is an array. Verify each element contains all expected fields: `id`, `user_id`, `source_type`, `source_id`, `subject`, `body`, `status`, `read_at`, `created_at`, `updated_at`. |
| 4  | `codeplane notification list --json outputs empty array when no notifications`  | Run with a user that has no notifications (or after marking all as read and verifying behavior). Verify `--json` output parses as an array.           |
| 5  | `codeplane notification list respects --page flag`                              | Run with `--page 1` and `--page 2`. Verify different results (or empty for page 2 if few notifications). Verify exit code `0` for both.              |
| 6  | `codeplane notification list respects --limit flag`                             | Run with `--limit 5`. Verify JSON output contains at most 5 items.                                                                                   |
| 7  | `codeplane notification list --limit 50 returns at most 50 (max boundary)`      | Run with `--limit 50`. Verify response contains at most 50 items.                                                                                    |
| 8  | `codeplane notification list --limit 100 caps at 50 (over-max boundary)`        | Run with `--limit 100`. Verify response contains at most 50 items (server caps at 50).                                                               |
| 9  | `codeplane notification list --limit 1 returns exactly 1 (min boundary)`        | Seed at least 2 notifications. Run with `--limit 1`. Verify exactly 1 item returned.                                                                |
| 10 | `codeplane notification list --page 0 normalizes to page 1`                     | Run with `--page 0`. Verify the result is identical to `--page 1`.                                                                                   |
| 11 | `codeplane notification list --page 999 returns empty for beyond-last page`     | Run with `--page 999`. Verify JSON output is `[]` and exit code is `0`.                                                                              |
| 12 | `codeplane notification list --unread filters to unread only`                   | Seed both read and unread notifications. Run with `--unread --json`. Verify every returned item has `"status": "unread"`.                            |
| 13 | `codeplane notification list --unread with no unread returns empty`             | Mark all notifications as read first, then run with `--unread --json`. Verify output is `[]`.                                                        |
| 14 | `codeplane notification list default pagination returns up to 30`               | Seed 35 notifications. Run with default flags and `--json`. Verify at most 30 items returned.                                                        |
| 15 | `codeplane notification list shows newest first`                                | Seed notifications at different times. Run with `--json`. Verify `created_at` values are in descending order.                                        |
| 16 | `codeplane notification list notification shape includes all fields`            | Run with `--json`. For each notification, verify presence and correct types of: `id` (number), `user_id` (number), `source_type` (string), `source_id` (number or null), `subject` (string), `body` (string), `status` (string matching read|unread), `read_at` (string or null), `created_at` (string), `updated_at` (string). |
| 17 | `codeplane notification list source_type values are valid`                      | Run with `--json`. Verify every `source_type` is one of: `issue`, `issue_comment`, `landing_request`, `lr_review`, `lr_comment`, `workspace`, `workflow_run`. |
| 18 | `codeplane notification list handles null source_id`                            | Verify at least one notification with `source_id: null` serializes correctly in JSON output.                                                         |
| 19 | `codeplane notification list with expired token returns auth error`             | Run with an invalid/expired token. Verify non-zero exit code and error output.                                                                       |
| 20 | `codeplane notification list scopes to authenticated user only`                 | Use two different tokens (WRITE_TOKEN and READ_TOKEN). Verify each user's `notification list` returns only their own notifications (different `user_id` values). |

### API Integration Tests

| #  | Test Name                                                                        | Description                                                                                                                                        |
|----|----------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| 21 | `GET /api/notifications/list returns 401 when unauthenticated`                   | Send request with no token/cookie. Verify 401 status.                                                                                              |
| 22 | `GET /api/notifications/list returns 200 with empty array for user with no notifications` | Authenticate as a user with no notifications. Verify `200`, body `[]`, `X-Total-Count: 0`.                                              |
| 23 | `GET /api/notifications/list returns notifications newest-first`                 | Seed 5 notifications with staggered timestamps. Verify response is ordered by `created_at` descending.                                             |
| 24 | `GET /api/notifications/list default per_page is 30`                             | Seed 35 notifications. Omit `per_page`. Verify exactly 30 items returned with `X-Total-Count: 35`.                                                |
| 25 | `GET /api/notifications/list respects per_page=10`                               | Seed 15 notifications. Send `per_page=10`. Verify exactly 10 items returned.                                                                       |
| 26 | `GET /api/notifications/list respects page=2`                                    | Seed 35 notifications. Send `page=2&per_page=30`. Verify 5 items returned.                                                                         |
| 27 | `GET /api/notifications/list caps per_page at 50`                                | Send `per_page=100`. Verify at most 50 items returned.                                                                                              |
| 28 | `GET /api/notifications/list normalizes page < 1 to 1`                           | Send `page=-1`. Verify result matches `page=1`.                                                                                                     |
| 29 | `GET /api/notifications/list returns empty for page beyond last`                 | Seed 10 notifications. Send `page=2&per_page=30`. Verify `[]` with `X-Total-Count: 10`.                                                            |
| 30 | `GET /api/notifications/list X-Total-Count header is present and accurate`       | Seed N notifications. Verify `X-Total-Count` header equals N on every response.                                                                     |
| 31 | `GET /api/notifications/list per_page=1 returns exactly 1 item`                  | Seed 5 notifications. Send `per_page=1`. Verify 1 item with `X-Total-Count: 5`.                                                                    |
| 32 | `GET /api/notifications/list per_page=50 with 60 notifications returns 50`       | Seed 60 notifications. Send `per_page=50`. Verify 50 items with `X-Total-Count: 60`.                                                               |
| 33 | `GET /api/notifications/list boundary: exactly per_page items total`             | Seed exactly 30 notifications. Send default params. Verify 30 items returned. Verify page 2 returns `[]`.                                           |
| 34 | `GET /api/notifications/list reflects read/unread status correctly`              | Seed read and unread notifications. Verify `status` and `read_at` fields are accurate for each.                                                     |
| 35 | `GET /api/notifications/list works with PAT authentication`                      | Send request with `Authorization: token <PAT>` instead of session cookie. Verify correct 200 response.                                              |
| 36 | `GET /api/notifications/list scopes to authenticated user`                       | Create notifications for user A and user B. Authenticate as user A. Verify only user A's notifications are returned.                                 |
| 37 | `GET /api/notifications/list with status=unread filters server-side`             | Seed read and unread notifications. Send `status=unread`. Verify all returned items have `status: "unread"`.                                         |
| 38 | `GET /api/notifications/list subject at max length 255 chars`                    | Seed notification with 255-character subject. Verify it returns without truncation.                                                                  |
| 39 | `GET /api/notifications/list subject exceeding 255 chars is rejected or truncated` | Attempt to create notification with 256-character subject. Verify predictable behavior (rejection or truncation).                                |
| 40 | `GET /api/notifications/list all source_types represented`                       | Seed one notification per source type. Verify all types appear in the response.                                                                      |
| 41 | `GET /api/notifications/list handles large volume (10000 notifications)`          | Seed 10,000 notifications. Verify first page returns within 500ms and `X-Total-Count: 10000`.                                                       |
| 42 | `GET /api/notifications/list non-integer per_page is handled`                    | Send `per_page=abc`. Verify 400 error or normalization to default.                                                                                   |
| 43 | `GET /api/notifications/list non-integer page is handled`                        | Send `page=xyz`. Verify 400 error or normalization to default.                                                                                       |

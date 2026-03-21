# ADMIN_AUDIT_LOG_VIEW

Specification for ADMIN_AUDIT_LOG_VIEW.

## High-Level User POV

As a Codeplane instance administrator, I need a comprehensive audit trail so I can understand who did what, when, and from where across my entire Codeplane instance. The audit log is my forensic investigation tool and my compliance record.

The Admin Audit Log View is the accountability and transparency surface within the Codeplane admin console. When I navigate to the audit log — whether through the web UI, the CLI, or the TUI — I see a reverse-chronological stream of every significant action that has occurred on my instance: user creations, repository deletions, admin privilege grants, webhook deliveries, workflow dispatches, landing request merges, and more. Each entry tells me the event type, who performed the action (the actor), what entity was affected (the target), the specific action taken, when it happened, and the IP address from which it originated.

This log is essential for three workflows. First, security incident investigation: when something goes wrong — a repository is deleted, an admin account is compromised, or unauthorized access is suspected — I need to trace back through the audit trail to reconstruct what happened. Second, compliance and governance: organizations with regulatory requirements need a tamper-evident record of administrative and sensitive actions. Third, operational awareness: as part of my daily admin routine (often starting from the Overview Dashboard's "View all audit logs" link), I want to scan recent activity to verify that normal operations are proceeding as expected.

The audit log supports filtering by date range (a required `since` parameter ensures I always scope my query to a meaningful window rather than accidentally loading the entire history), and pagination keeps the experience responsive even on instances with millions of recorded events. I can optionally filter by actor, event type, target type, or action to narrow down to exactly the events I care about.

The experience must be consistent across all Codeplane clients. The web admin console provides the richest visual experience with color-coded event types, actor avatars, clickable targets, and expandable metadata. The `codeplane admin audit-log list` CLI command outputs structured data suitable for scripting, piping to `jq`, and integration with external SIEM tools. The TUI provides a scrollable audit feed within the terminal dashboard.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated admin user can retrieve a paginated, date-filtered list of audit log entries from the Codeplane instance.
- [ ] The audit log endpoint is backed by a real service implementation (not the current stub returning empty arrays).
- [ ] The CLI `admin audit-log list` command displays audit log entries and supports `--since`, `--page`, `--limit`, `--actor`, `--event-type`, `--target-type`, and `--action` filter options.
- [ ] The web admin console displays the audit log at `/admin/audit-logs` in a table with filtering controls, pagination, and expandable metadata.
- [ ] The TUI includes an audit log screen accessible from the admin navigation.
- [ ] Non-admin authenticated users receive a 401 Unauthorized response.
- [ ] Unauthenticated requests receive a 401 Unauthorized response.
- [ ] Audit log entries are written by the service layer for all significant administrative and mutation events across the platform.
- [ ] All existing e2e tests pass, and new tests cover the full specification.

### Functional Constraints

- [ ] The `since` query parameter is **required**. Requests without `since` return `400 Bad Request` with a clear error message.
- [ ] The `since` parameter accepts two formats: RFC 3339 (`2026-03-22T10:00:00Z`) and date-only (`2026-03-22`). Invalid formats return `400 Bad Request`.
- [ ] Entries are ordered by `created_at` descending (most recent first).
- [ ] Pagination uses page-based pagination with `page` (1-indexed) and `per_page` query parameters.
- [ ] Default `page` is `1`. Default `per_page` is `50`.
- [ ] Maximum `per_page` is `100`. Values above 100 are clamped to 100.
- [ ] Each audit log entry in the response contains: `id`, `event_type`, `actor_id`, `actor_name`, `target_type`, `target_id`, `target_name`, `action`, `metadata`, `ip_address`, `created_at`.
- [ ] The `actor_id` field may be `null` for system-initiated events (e.g., scheduled cleanup, automated workflows).
- [ ] The `target_id` field may be `null` when the target no longer exists (deleted entity).
- [ ] The `metadata` field is a JSON object that may be empty (`{}`) but must never be `null`.
- [ ] The `ip_address` field is a string. It may be `"system"` or `"internal"` for non-user-initiated events.
- [ ] Optional filter parameters (`actor`, `event_type`, `target_type`, `action`) narrow the result set when provided. Multiple filters are combined with AND logic.
- [ ] The `event_type` filter supports exact match and prefix match using a trailing wildcard (e.g., `repo.*` matches all repository events).
- [ ] The response includes an `X-Total-Count` header containing the total number of matching entries for the given filters and date range.
- [ ] The `created_at` field is returned as an ISO 8601 string in UTC.

### Edge Cases

- [ ] When `since` is a future date, the endpoint returns an empty array with `X-Total-Count: 0`.
- [ ] When `since` is an extremely old date (e.g., `1970-01-01`), the endpoint returns all retained entries (bounded by retention policy), paginated normally.
- [ ] When `page` exceeds the total number of pages, the endpoint returns an empty array with the correct `X-Total-Count`.
- [ ] When `page` is `0` or negative, the server treats it as page `1`.
- [ ] When `per_page` is `0` or negative, the server uses the default value of `50`.
- [ ] When `per_page` exceeds `100`, the server clamps it to `100`.
- [ ] When `page` or `per_page` query parameters are non-numeric strings, the server uses default values rather than returning a 400.
- [ ] When `since` is `2026-02-30` (invalid calendar date that still parses as a Date), the server returns `400 Bad Request` if `Date.parse` yields `NaN`.
- [ ] When the `actor` filter specifies a username that does not exist, the endpoint returns an empty array (not an error).
- [ ] When the `event_type` filter is an empty string, it is ignored (treated as if not provided).
- [ ] When `metadata` for an entry was stored as `null` in the database, the response normalizes it to `{}`.
- [ ] When there are zero audit log entries in the system (fresh instance), the endpoint returns an empty array with `X-Total-Count: 0`.
- [ ] The response is a JSON array — not wrapped in an object — consistent with the existing admin route patterns.
- [ ] When the `event_type` wildcard pattern contains no `*` character, it is treated as an exact match.

### Boundary Constraints

- [ ] `since` parameter: string, must be valid RFC 3339 or `YYYY-MM-DD`. Maximum length 30 characters.
- [ ] `page` parameter: integer, minimum effective value 1, no maximum (returns empty array when past last page).
- [ ] `per_page` parameter: integer, minimum effective value 1, maximum 100.
- [ ] `actor` filter: string, 0–39 characters, matches against `actor_name`. Case-insensitive matching.
- [ ] `event_type` filter: string, 0–128 characters, dot-separated segments (e.g., `repo.create`, `user.delete`).
- [ ] `target_type` filter: string, 0–64 characters (e.g., `user`, `repository`, `organization`, `workflow`, `workspace`, `landing_request`, `issue`, `release`, `webhook`).
- [ ] `action` filter: string, 0–64 characters (e.g., `create`, `delete`, `update`, `close`, `reopen`, `grant_admin`, `revoke_admin`, `approve`, `merge`, `enqueue`).
- [ ] `event_type` field in response: string, 1–128 characters, dot-separated.
- [ ] `actor_name` field in response: string, 0–255 characters. Empty string for system events without a named actor.
- [ ] `target_name` field in response: string, 0–255 characters.
- [ ] `ip_address` field in response: string, valid IPv4, IPv6, or sentinel values, max 45 characters.
- [ ] `metadata` field in response: JSON object, max serialized size 10 KB per entry.
- [ ] Audit log retention: entries older than 365 days may be automatically purged by the cleanup scheduler.

### CLI Parameter Alignment

- [ ] The CLI `--limit` option maps to the API `per_page` query parameter.
- [ ] The CLI `--since` option maps directly to the API `since` query parameter.
- [ ] The CLI `--actor` option maps to the API `actor` query parameter.
- [ ] The CLI `--event-type` option maps to the API `event_type` query parameter.
- [ ] The CLI `--target-type` option maps to the API `target_type` query parameter.
- [ ] The CLI `--action` option maps to the API `action` query parameter.

## Design

### API Shape

**Endpoint:** `GET /api/admin/audit-logs`

**Authentication:** Required. Caller must have `isAdmin = true`.

**Query Parameters:**

| Parameter     | Type    | Default | Required | Constraints          | Description                                                  |
|---------------|---------|---------|----------|----------------------|--------------------------------------------------------------|
| `since`       | string  | —       | Yes      | RFC 3339 or YYYY-MM-DD | Only return entries created at or after this timestamp       |
| `page`        | integer | `1`     | No       | Min 1                | Page number (1-indexed)                                      |
| `per_page`    | integer | `50`    | No       | Min 1, Max 100       | Number of results per page                                   |
| `actor`       | string  | —       | No       | Max 39 chars         | Filter by actor username (case-insensitive)                  |
| `event_type`  | string  | —       | No       | Max 128 chars        | Filter by event type (exact or prefix wildcard with `.*`)    |
| `target_type` | string  | —       | No       | Max 64 chars         | Filter by target entity type                                 |
| `action`      | string  | —       | No       | Max 64 chars         | Filter by action verb                                        |

**Response Headers:**

| Header          | Type   | Description                                          |
|-----------------|--------|------------------------------------------------------|
| `X-Total-Count` | string | Total number of entries matching the query filters    |

**Success Response:** `200 OK`

```json
[
  {
    "id": "auditlog_abc123",
    "event_type": "repo.delete",
    "actor_id": "user_xyz789",
    "actor_name": "alice",
    "target_type": "repository",
    "target_id": "repo_def456",
    "target_name": "my-org/old-project",
    "action": "delete",
    "metadata": {
      "reason": "requested by owner",
      "repo_visibility": "private"
    },
    "ip_address": "203.0.113.42",
    "created_at": "2026-03-22T10:15:30Z"
  },
  {
    "id": "auditlog_def456",
    "event_type": "user.create",
    "actor_id": "user_xyz789",
    "actor_name": "alice",
    "target_type": "user",
    "target_id": "user_new001",
    "target_name": "bob",
    "action": "create",
    "metadata": {},
    "ip_address": "203.0.113.42",
    "created_at": "2026-03-22T09:45:00Z"
  },
  {
    "id": "auditlog_ghi789",
    "event_type": "workflow.dispatch",
    "actor_id": null,
    "actor_name": "system",
    "target_type": "workflow",
    "target_id": "wf_run_123",
    "target_name": "deploy-production",
    "action": "dispatch",
    "metadata": {
      "trigger": "schedule",
      "cron": "0 2 * * *"
    },
    "ip_address": "internal",
    "created_at": "2026-03-22T02:00:00Z"
  }
]
```

**Error Responses:**

| Status | Condition                                      | Body                                                                    |
|--------|-------------------------------------------------|-------------------------------------------------------------------------|
| `400`  | `since` parameter missing                       | `{ "error": "since parameter is required" }`                            |
| `400`  | `since` parameter invalid format                | `{ "error": "invalid since format, expected RFC3339 or YYYY-MM-DD" }`   |
| `401`  | No authentication provided                      | `{ "error": "authentication required" }`                                |
| `401`  | Authenticated but not admin                     | `{ "error": "admin access required" }`                                  |
| `500`  | Internal server error                           | `{ "error": "<message>" }`                                              |

**Notes:**
- The response body is a JSON array, not wrapped in an envelope object.
- The `metadata` field is always a JSON object, never `null`. If the stored value is null, it is normalized to `{}`.
- The `X-Total-Count` header reflects the total matching entries for the given `since` and filter combination, not just the current page.

### SDK Shape

The `@codeplane/sdk` package must expose an admin audit service:

```typescript
interface AdminListAuditLogsInput {
  since: string;
  page: number;
  perPage: number;
  actor?: string;
  eventType?: string;
  targetType?: string;
  action?: string;
}

interface AuditLogEntry {
  id: string;
  eventType: string;
  actorId: string | null;
  actorName: string;
  targetType: string;
  targetId: string | null;
  targetName: string;
  action: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  createdAt: Date;
}

interface AdminListAuditLogsResult {
  items: AuditLogEntry[];
  total: number;
}
```

The service method computes `offset = (page - 1) * perPage`, delegates to the existing `listAuditLogs` (or filter-aware variants) database functions, runs a parallel count query for `X-Total-Count`, and returns the combined result. The route handler maps `AuditLogEntry` to the snake_case JSON response format and normalizes null metadata to `{}`.

### CLI Command

**Command:** `codeplane admin audit-log list`

**Options:**

| Flag            | Type   | Default | Required | Description                                   |
|-----------------|--------|---------|----------|-----------------------------------------------|
| `--since`       | string | —       | Yes      | Start date (RFC 3339 or YYYY-MM-DD)           |
| `--page`        | number | `1`     | No       | Page number                                   |
| `--limit`       | number | `50`    | No       | Results per page (max 100)                    |
| `--actor`       | string | —       | No       | Filter by actor username                      |
| `--event-type`  | string | —       | No       | Filter by event type (e.g., `repo.*`)         |
| `--target-type` | string | —       | No       | Filter by target entity type                  |
| `--action`      | string | —       | No       | Filter by action verb                         |
| `--json`        | flag   | off     | No       | Output raw JSON                               |

**Default (table) output:**

```
TIMESTAMP                ACTOR     EVENT TYPE         ACTION   TARGET TYPE   TARGET NAME
2026-03-22 10:15:30      alice     repo.delete        delete   repository    my-org/old-project
2026-03-22 09:45:00      alice     user.create        create   user          bob
2026-03-22 02:00:00      system    workflow.dispatch   dispatch workflow      deploy-production

Showing 1–3 of 127 entries (page 1)  |  Since: 2026-03-01
```

**JSON output:** Outputs the raw JSON array from the API response.

**Error output:**
```
Error: since parameter is required
```
```
Error: admin access required (401)
```

**Exit codes:**
- `0` — success
- `1` — validation error (missing `--since`)
- `1` — authentication or authorization failure
- `1` — network or server error

### Web UI Design

**Route:** `/admin/audit-logs` (within the admin console layout)

**Layout:**

1. **Page Header**: Title "Audit Log" with a subtitle showing the total matched count (e.g., "1,247 events since March 1, 2026").

2. **Filter Bar** (horizontal, above the table):
   - **Since** date picker: Required field, pre-populated with 7 days ago. Calendar picker with manual text input. Validates format on blur.
   - **Actor** text input: Autocomplete against known usernames. Clears with an × button.
   - **Event Type** dropdown: Pre-populated with discovered event types (e.g., `user.*`, `repo.*`, `admin.*`, `workflow.*`, `landing.*`, `issue.*`). Supports free-text input for custom types.
   - **Target Type** dropdown: Options include `user`, `repository`, `organization`, `workflow`, `workspace`, `landing_request`, `issue`, `release`, `webhook`.
   - **Action** dropdown: Options include `create`, `delete`, `update`, `close`, `reopen`, `grant_admin`, `revoke_admin`, `approve`, `merge`, `enqueue`, `dispatch`.
   - **Apply** button: Triggers a new API request with the current filter values. Filters are also reflected in the URL query string for shareability.
   - **Reset** link: Clears all filters except `since`.

3. **Data Table:**
   - Columns: Timestamp (relative time with tooltip for absolute ISO 8601), Actor (avatar + username, linked to user profile; "system" badge for null actor), Event Type (color-coded badge by category — blue for `user.*`, green for `repo.*`, orange for `workflow.*`, red for `admin.*`), Action (plain text), Target Type (icon + text), Target Name (linked to entity when navigable), IP Address (monospace font).
   - Each row is expandable: clicking the expand chevron reveals the full `metadata` JSON in a formatted code block.
   - Rows for destructive actions (`delete`, `revoke_admin`) are visually highlighted with a subtle red-tinted background.

4. **Pagination Controls** (below the table):
   - Previous / Next buttons.
   - Page indicator ("Page 1 of 13").
   - Per-page selector dropdown (25, 50, 100).
   - URL query string reflects current page and per_page.

5. **Empty States:**
   - No entries for the given filters: "No audit log entries match your filters. Try broadening the date range or removing filters."
   - Fresh instance with no entries at all: "No activity has been recorded yet. Audit log entries will appear here as actions are performed on your instance."

6. **Loading State:** Skeleton rows matching the table column layout.

7. **Error State:** Inline error banner with retry action.

**Interactions:**
- Clicking the Actor username navigates to the user's profile page.
- Clicking a navigable Target Name navigates to the target entity.
- Changing any filter or pagination control triggers a new API request.
- The browser URL query string updates to reflect `since`, `page`, `per_page`, and all active filters.
- The filter bar supports keyboard submission (Enter in any input triggers Apply).

### TUI UI

**Screen:** Accessible via the TUI command palette or a top-level admin menu entry (when the current user is an admin).

**Layout:**
- Header: "Admin > Audit Log" with the total count and active since date.
- A prompt for the `since` value on first entry (defaults to 7 days ago).
- Scrollable list of audit log entries, each showing: relative timestamp, actor name, event type, action, target type, target name.
- Vim-style `j`/`k` navigation. Enter to expand/collapse an entry and show its metadata.
- `/` to open a filter input for event type or actor.
- `n` / `p` for next/previous page.
- `r` to refresh.
- `q` to go back.

### Documentation

End-user documentation must include:

- **Admin Guide — Audit Log section**: A section in the admin guide explaining what the audit log captures, how to access it from web/CLI/TUI, how to interpret event types and metadata, how to use filters for incident investigation, and the retention policy (365 days default).
- **CLI Reference — `codeplane admin audit-log list`**: A reference entry documenting the command, its required `--since` flag, all optional filter flags, output formats (table and JSON), and example invocations including filtered queries and piping to `jq`.
- **API Reference — `GET /api/admin/audit-logs`**: A reference entry documenting the endpoint, authentication requirements, required and optional query parameters, response schema, response headers, error codes, and the metadata normalization behavior.
- **Security Guide — Audit Trail**: A brief section in the security documentation explaining that Codeplane maintains an audit trail of administrative actions, how long entries are retained, and that the audit log itself can only be accessed by instance administrators.

## Permissions & Security

### Authorization

| Role                             | Access                   |
|----------------------------------|--------------------------|
| Site Admin (`is_admin: true`)    | Full read access         |
| Authenticated (non-admin)        | Denied (401)             |
| Anonymous / Unauthenticated      | Denied (401)             |
| PAT-authenticated (admin scope)  | Allowed if token has `admin` or `read:admin` scope AND owner is admin |
| PAT-authenticated (no admin scope) | Denied (401)           |
| Deploy Key                       | Denied. Deploy keys have no admin access path. |

- The `requireAdmin()` guard checks both that a valid session/token exists AND that the user has `isAdmin = true`.
- The audit log is a read-only surface. There is no API to create, modify, or delete individual audit log entries via the admin API. Entries are created by the service layer as a side effect of other operations.
- Bulk deletion of old entries is handled exclusively by the server's cleanup scheduler via `deleteAuditLogsOlderThan`, not by any admin-facing API.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **60 requests per minute** per authenticated user is applied to all `/api/admin/*` routes to prevent abuse or accidental tight polling loops.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.
- CLI scripts that poll audit logs in a loop must respect the rate limit. The CLI should print a warning and retry after the `Retry-After` interval when receiving a 429.

### Data Privacy & PII

- The audit log contains PII: `actor_name` (username), `target_name` (which may be a username, repository name, or organization name), `ip_address` (source IP of the action), and `metadata` (which may contain email addresses, repository names, or other context depending on the event type).
- The `ip_address` field is the most sensitive datum. It must only be visible to admin users. The admin-only access gate enforces this.
- The `metadata` field must not contain: password hashes, authentication tokens, session IDs, secret values, or private key material. Service layer code that writes audit entries must sanitize metadata before insertion.
- Admin access to the audit log should itself be recorded in the audit trail (event type `admin.audit_log.viewed`) to maintain a complete chain of accountability.
- The `actor_id` and `target_id` fields contain internal identifiers. These are not PII but should not be exposed to non-admin callers (already enforced by the admin gate).
- Audit log entries for deleted entities must retain the `target_name` at the time of the action (denormalized) to remain useful after the target entity no longer exists.

## Telemetry & Product Analytics

### Business Events

| Event Name                     | Trigger                                                  | Properties                                                                                                    |
|--------------------------------|----------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| `AdminAuditLogViewed`          | Admin successfully retrieves audit log entries           | `admin_user_id`, `since`, `page`, `per_page`, `total_entries`, `result_count`, `filters_applied` (string[]), `client` (web/cli/tui/api) |
| `AdminAuditLogDenied`          | Non-admin attempts to access the audit log               | `user_id` (if authenticated), `reason` ("not_authenticated" or "not_admin"), `client`                         |
| `AdminAuditLogFiltered`        | Admin applies one or more filters                        | `admin_user_id`, `filter_names` (string[]), `result_count`, `client`                                          |
| `AdminAuditLogEntryExpanded`   | Admin expands an entry to view metadata (web UI only)    | `admin_user_id`, `entry_id`, `event_type`                                                                     |
| `AdminAuditLogExported`        | Admin uses CLI JSON output or copies data for export     | `admin_user_id`, `entry_count`, `since`, `export_format` ("json")                                             |

### Funnel Metrics

- **Adoption rate**: Percentage of admin users who view the audit log at least once per month. Target: >50% of active admins.
- **Investigation depth**: Average number of pages viewed per audit log session. Higher values indicate deeper investigations — target median of 2+ pages per session.
- **Filter usage rate**: Percentage of audit log views that include at least one filter beyond `since`. Target: >30%, indicating admins are using targeted investigation rather than just browsing.
- **Entry-to-action rate**: Percentage of audit log views that result in navigation to a target entity (user profile, repo, etc.). Indicates the audit log is driving investigative follow-up.
- **Client distribution**: Track which clients (web, CLI, TUI, raw API) are used to access the audit log. CLI usage above 40% indicates strong scripting/SIEM integration adoption.

### Success Indicators

- The stub service is replaced by a real implementation returning actual audit log data.
- Audit entries are being written by the service layer for all significant mutation events.
- E2e tests pass with non-empty audit log arrays after seeding test actions.
- Administrators can reconstruct the sequence of events leading to a specific state change without needing direct database access.
- CLI `--json` output integrates cleanly with `jq` and external log aggregation tools.

## Observability

### Logging

| Log Event                           | Level   | Structured Context                                                                         | When                                           |
|-------------------------------------|---------|--------------------------------------------------------------------------------------------|-------------------------------------------------|
| `admin.audit_log.list.success`      | `info`  | `admin_id`, `since`, `page`, `per_page`, `total`, `result_count`, `filters`, `duration_ms` | Successful audit log retrieval                  |
| `admin.audit_log.list.denied`       | `warn`  | `user_id` (nullable), `reason`, `ip`, `user_agent`                                        | Unauthorized access attempt                     |
| `admin.audit_log.list.error`        | `error` | `admin_id`, `since`, `page`, `per_page`, `filters`, `error_message`, `stack_trace`         | Internal error during audit log retrieval       |
| `admin.audit_log.list.slow`         | `warn`  | `admin_id`, `since`, `page`, `per_page`, `filters`, `duration_ms`                         | Response time exceeds 3000ms threshold          |
| `admin.audit_log.list.invalid_since`| `info`  | `admin_id`, `since_value`, `ip`                                                            | Request with invalid `since` format             |
| `audit_log.insert.success`          | `debug` | `event_type`, `actor_id`, `target_type`, `target_id`, `action`                             | Audit log entry successfully written            |
| `audit_log.insert.error`            | `error` | `event_type`, `actor_id`, `error_message`, `stack_trace`                                   | Failed to write audit log entry                 |
| `audit_log.cleanup.completed`       | `info`  | `deleted_count`, `cutoff_date`, `duration_ms`                                              | Scheduled cleanup of old audit log entries      |

### Prometheus Metrics

| Metric Name                                     | Type      | Labels                                          | Description                                                       |
|--------------------------------------------------|-----------|--------------------------------------------------|-------------------------------------------------------------------|
| `codeplane_admin_audit_log_requests_total`       | Counter   | `status` (2xx, 4xx, 5xx)                        | Total audit log list requests by response status                  |
| `codeplane_admin_audit_log_duration_ms`          | Histogram | `status`                                         | Latency distribution (buckets: 50, 100, 250, 500, 1000, 2500, 5000ms) |
| `codeplane_admin_audit_log_denied_total`         | Counter   | `reason` (not_authenticated, not_admin)          | Denied access attempts                                            |
| `codeplane_admin_audit_log_result_count`         | Histogram | —                                                | Distribution of result set sizes per request (buckets: 0, 1, 10, 25, 50, 100) |
| `codeplane_admin_audit_log_filter_usage_total`   | Counter   | `filter` (actor, event_type, target_type, action)| Count of requests using each filter type                          |
| `codeplane_audit_log_inserts_total`              | Counter   | `event_type`, `success` (true/false)             | Total audit log entries written                                   |
| `codeplane_audit_log_entries_total`              | Gauge     | —                                                | Total audit log entries in the database (updated periodically)    |
| `codeplane_audit_log_cleanup_deleted_total`      | Counter   | —                                                | Total entries deleted by cleanup scheduler                        |
| `codeplane_audit_log_cleanup_duration_ms`        | Histogram | —                                                | Duration of cleanup operations                                    |

### Alerts

#### Alert: `AdminAuditLogHighErrorRate`
- **Condition:** `rate(codeplane_admin_audit_log_requests_total{status="5xx"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `admin.audit_log.list.error` entries — look for database connection failures or query timeouts.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check for recent schema migrations that may have broken the `audit_log` table query.
  4. Run `EXPLAIN ANALYZE` on the `listAuditLogs` query to check for missing indexes on `created_at`.
  5. If the audit_log table has grown very large (>10M rows), verify the cleanup scheduler is running and pruning old entries.
  6. Escalate to the database team if the issue is a query performance regression.

#### Alert: `AdminAuditLogHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_admin_audit_log_duration_ms_bucket[5m])) > 3000`
- **Severity:** Warning
- **Runbook:**
  1. Check `admin.audit_log.list.slow` log entries for the affected time period. Note which filters and date ranges are causing slow queries.
  2. Verify the `audit_log` table has a B-tree index on `created_at`.
  3. If filter queries are slow, check for indexes on `actor_id`, `event_type`, and `target_type`.
  4. Check for lock contention on the `audit_log` table from concurrent write-heavy workloads.
  5. If the `since` date range is very wide (>90 days), consider whether the count query is the bottleneck.
  6. Consider running `deleteAuditLogsOlderThan()` manually if the table has grown beyond retention policy.

#### Alert: `AdminAuditLogDeniedSpike`
- **Condition:** `rate(codeplane_admin_audit_log_denied_total[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.audit_log.list.denied` log entries for source IPs and user agents.
  2. Determine if the spike is from a misconfigured integration, a single user repeatedly trying to access admin endpoints, or a potential privilege escalation attempt.
  3. If from a single IP or user, verify whether the user's admin privileges were recently revoked.
  4. If the pattern suggests automated probing, consider blocking the source IP at the network level.
  5. No immediate action required unless the pattern suggests an active attack.

#### Alert: `AuditLogInsertFailureRate`
- **Condition:** `rate(codeplane_audit_log_inserts_total{success="false"}[5m]) > 0.5`
- **Severity:** Critical
- **Runbook:**
  1. This alert indicates audit log entries are failing to be written, meaning the audit trail has gaps. Treat this as a data integrity issue.
  2. Check `audit_log.insert.error` log entries for error details — common causes are database connection failures, disk full, or constraint violations.
  3. Verify the database has sufficient disk space and connection pool headroom.
  4. Check if a schema migration is running that has locked the `audit_log` table.
  5. If the failure is transient and resolves, audit the gap period to determine if critical events were missed.
  6. If persistent, escalate immediately — a non-functional audit log is a compliance risk.

#### Alert: `AuditLogCleanupStalled`
- **Condition:** No cleanup execution in 48 hours (based on `codeplane_audit_log_cleanup_duration_ms_count` staleness).
- **Severity:** Warning
- **Runbook:**
  1. Check if the cleanup scheduler is still running: verify server logs for `audit_log.cleanup.completed` entries.
  2. If the cleanup scheduler has stopped, check if the server was restarted or if the scheduler loop crashed.
  3. Manually run cleanup by restarting the server process.
  4. Check `codeplane_audit_log_entries_total` gauge — if it's growing unboundedly, the table will eventually cause performance degradation.
  5. If the table exceeds 50M rows, consider running cleanup manually with a conservative cutoff date.

### Error Cases and Failure Modes

| Failure Mode                          | Symptom                                | Behavior                                                          |
|---------------------------------------|----------------------------------------|-------------------------------------------------------------------|
| Database unreachable                  | 500 Internal Server Error              | Returns error JSON, logs `admin.audit_log.list.error`             |
| Database query timeout                | 500 or slow response                   | Returns error JSON after timeout, logs slow query                 |
| Invalid session/token                 | 401 Unauthorized                       | Returns error JSON, no database query executed                    |
| Admin flag revoked mid-session        | 401 Unauthorized on next request       | Session/token still valid but `isAdmin` check fails               |
| Missing `since` parameter             | 400 Bad Request                        | Returns descriptive error, no database query executed             |
| Invalid `since` format                | 400 Bad Request                        | Returns format guidance, no database query executed               |
| Extremely large audit log table       | Slow count/list queries                | Response delayed; `admin.audit_log.list.slow` log emitted         |
| Audit log insert failure              | Gaps in audit trail                    | `audit_log.insert.error` logged; insert failures do not block the triggering operation |
| Cleanup scheduler failure             | Unbounded table growth                 | `AuditLogCleanupStalled` alert fires                              |
| Corrupt metadata JSON                 | Possible serialization error           | Entry returned with `metadata: {}` fallback                       |
| Network timeout from CLI              | CLI exits with error                   | CLI prints timeout message and exits with code 1                  |

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                                                      | Expected Result                                                          |
|----------|-----------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| API-01   | `GET /api/admin/audit-logs?since=2026-01-01` with valid admin session returns 200 and a JSON array                   | Status 200, body is array, `X-Total-Count` header present                |
| API-02   | Response array items contain all required fields (`id`, `event_type`, `actor_id`, `actor_name`, `target_type`, `target_id`, `target_name`, `action`, `metadata`, `ip_address`, `created_at`) | Every item in the array has all specified keys                           |
| API-03   | Request without `since` parameter returns 400                                                                         | Status 400, body contains "since parameter is required"                  |
| API-04   | Request with `since=not-a-date` returns 400                                                                           | Status 400, body contains "invalid since format"                         |
| API-05   | Request with `since=2026-03-22` (date-only format) returns 200                                                       | Status 200, entries are at or after 2026-03-22                           |
| API-06   | Request with `since=2026-03-22T10:00:00Z` (RFC 3339 format) returns 200                                             | Status 200, entries are at or after the specified timestamp              |
| API-07   | Request with `since=2026-03-22T10:00:00+05:00` (RFC 3339 with timezone offset) returns 200                           | Status 200, entries are at or after the specified timestamp              |
| API-08   | Default pagination: no page/per_page params returns up to 50 entries                                                  | Array length ≤ 50                                                        |
| API-09   | `?since=2026-01-01&per_page=10` returns at most 10 entries                                                           | Array length ≤ 10                                                        |
| API-10   | `?since=2026-01-01&per_page=100` (maximum valid) returns at most 100 entries                                         | Array length ≤ 100                                                       |
| API-11   | `?since=2026-01-01&per_page=101` (exceeds maximum) is clamped to 100                                                | Array length ≤ 100                                                       |
| API-12   | `?since=2026-01-01&per_page=200` (well above maximum) is clamped to 100                                             | Array length ≤ 100                                                       |
| API-13   | `?since=2026-01-01&page=1&per_page=1` returns exactly 1 entry when entries exist                                     | Array length = 1                                                         |
| API-14   | `?since=2026-01-01&page=99999` (beyond last page) returns empty array with correct total                             | Array length = 0, `X-Total-Count` > 0                                   |
| API-15   | `?since=2026-01-01&page=0` is treated as page 1                                                                     | Same result as `?page=1`                                                 |
| API-16   | `?since=2026-01-01&page=-1` is treated as page 1                                                                    | Same result as `?page=1`                                                 |
| API-17   | `?since=2026-01-01&per_page=0` uses default value of 50                                                              | Array length ≤ 50                                                        |
| API-18   | `?since=2026-01-01&per_page=-5` uses default value of 50                                                             | Array length ≤ 50                                                        |
| API-19   | `?since=2026-01-01&page=abc&per_page=xyz` (non-numeric) uses defaults                                               | Status 200, uses page=1 and per_page=50 defaults                         |
| API-20   | `X-Total-Count` header value matches the actual total for the given `since` and filters                               | Header value equals count from a separate count query                    |
| API-21   | Entries are ordered by `created_at` descending                                                                        | `items[i].created_at >= items[i+1].created_at` for all consecutive pairs |
| API-22   | `?since=2099-01-01` (future date) returns empty array                                                                | Array length = 0, `X-Total-Count` = 0                                   |
| API-23   | `?since=1970-01-01` returns all retained entries (paginated)                                                          | Status 200, returns paginated entries                                    |
| API-24   | Request without authentication returns 401                                                                            | Status 401, body contains "authentication required"                      |
| API-25   | Request with valid non-admin token returns 401                                                                        | Status 401, body contains "admin access required"                        |
| API-26   | Request with expired/invalid token returns 401                                                                        | Status 401                                                               |
| API-27   | Request with PAT having `read:admin` scope succeeds                                                                  | Status 200                                                               |
| API-28   | Request with PAT lacking admin scope is denied                                                                        | Status 401                                                               |
| API-29   | `created_at` values are valid ISO 8601 date strings                                                                  | `new Date(field).toISOString()` does not throw for any entry             |
| API-30   | `metadata` field is always an object (never `null`)                                                                  | `typeof entry.metadata === "object"` and `entry.metadata !== null`       |
| API-31   | `actor_id` may be `null` for system events                                                                           | System-event entries have `actor_id: null`                               |
| API-32   | `?since=2026-01-01&actor=alice` filters to entries by actor "alice"                                                  | All entries have `actor_name === "alice"`                                 |
| API-33   | `?since=2026-01-01&actor=nonexistent_user` returns empty array                                                       | Array length = 0                                                         |
| API-34   | `?since=2026-01-01&event_type=user.create` filters to exact event type match                                         | All entries have `event_type === "user.create"`                          |
| API-35   | `?since=2026-01-01&event_type=repo.*` filters with prefix wildcard                                                   | All entries have `event_type` starting with `"repo."`                    |
| API-36   | `?since=2026-01-01&target_type=repository` filters to repository targets                                             | All entries have `target_type === "repository"`                          |
| API-37   | `?since=2026-01-01&action=delete` filters to delete actions                                                          | All entries have `action === "delete"`                                   |
| API-38   | Multiple filters combined: `?since=2026-01-01&event_type=repo.*&action=create` applies AND logic                     | All entries match both filters                                           |
| API-39   | `?since=2026-01-01&event_type=` (empty event_type) is ignored, returns unfiltered                                    | Status 200, same as without the filter                                   |
| API-40   | Paginating through all pages yields all entries with no duplicates and no gaps                                        | Union of all pages = full entry set, no ID appears twice                 |
| API-41   | Rate limit enforcement: rapid requests beyond limit return 429                                                        | 429 status with `Retry-After` header                                     |
| API-42   | `?since=2026-02-30` (invalid calendar date) returns 400                                                             | Status 400 if Date.parse yields NaN                                      |
| API-43   | Response items do NOT contain internal-only fields beyond the specified schema                                        | No unexpected keys in response objects                                   |
| API-44   | `ip_address` field is present and is a non-empty string                                                              | Every entry has a non-empty `ip_address`                                 |

### CLI E2E Tests

| Test ID  | Test Description                                                                                        | Expected Result                                            |
|----------|---------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| CLI-01   | `codeplane admin audit-log list --since 2026-01-01` with admin token exits 0 and returns JSON array    | Exit code 0, stdout parses as JSON array                   |
| CLI-02   | `codeplane admin audit-log list --since 2026-01-01 --json` output is valid JSON                        | `JSON.parse(stdout)` succeeds                              |
| CLI-03   | `codeplane admin audit-log list --since 2026-01-01 --page 1 --limit 5` returns ≤ 5 entries             | Array length ≤ 5                                           |
| CLI-04   | `codeplane admin audit-log list --since 2026-01-01 --limit 100` (max valid) succeeds                   | Exit code 0, array length ≤ 100                            |
| CLI-05   | `codeplane admin audit-log list --since 2026-01-01 --limit 101` (exceeds max) is clamped to 100        | Exit code 0, array length ≤ 100                            |
| CLI-06   | `codeplane admin audit-log list` without `--since` fails with error                                    | Exit code ≠ 0, stderr contains error about missing since   |
| CLI-07   | `codeplane admin audit-log list --since invalid-date` fails with error                                 | Exit code ≠ 0, stderr contains format error                |
| CLI-08   | `codeplane admin audit-log list --since 2026-01-01` with non-admin token fails                         | Exit code ≠ 0, stderr contains error message               |
| CLI-09   | `codeplane admin audit-log list --since 2026-01-01` without any token fails                            | Exit code ≠ 0, stderr contains error message               |
| CLI-10   | `codeplane admin audit-log list --since 2026-01-01 --page 99999` returns empty array                   | Exit code 0, array length = 0                              |
| CLI-11   | Response items have expected shape (id, event_type, actor_name, action, target_type, target_name, etc.)| All required fields present in each item                   |
| CLI-12   | `--limit` parameter is correctly translated to `per_page` API parameter                                | Verified via response size matching the limit              |
| CLI-13   | `--actor alice` filter returns only entries by alice                                                    | All entries have actor_name "alice"                        |
| CLI-14   | `--event-type repo.*` wildcard filter works                                                            | All entries have event_type starting with "repo."          |
| CLI-15   | `--target-type repository` filter works                                                                | All entries have target_type "repository"                  |
| CLI-16   | `--action create` filter works                                                                         | All entries have action "create"                           |
| CLI-17   | Multiple filters combined work correctly                                                               | Entries match all specified filters                        |
| CLI-18   | Default table output includes column headers and summary line                                          | stdout contains "TIMESTAMP", "ACTOR", "Showing"            |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                                        | Expected Result                                            |
|----------|---------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| UI-01    | Admin user navigates to `/admin/audit-logs` and sees the audit log table                               | Table element is visible                                   |
| UI-02    | Table columns include Timestamp, Actor, Event Type, Action, Target Type, Target Name, IP Address       | All column headers are visible                             |
| UI-03    | Total entry count is displayed in the page header                                                      | Header subtitle text matches "N events" pattern            |
| UI-04    | Since date picker is present and pre-populated with 7 days ago                                         | Date picker input has a value 7 days in the past           |
| UI-05    | Changing the Since date and clicking Apply refreshes the table with new data                           | Table rows update, URL query string updates                |
| UI-06    | Actor filter input with autocomplete is functional                                                     | Typing a username shows suggestions                        |
| UI-07    | Event Type dropdown filter works                                                                       | Selecting an event type filters the table                  |
| UI-08    | Target Type dropdown filter works                                                                      | Selecting a target type filters the table                  |
| UI-09    | Action dropdown filter works                                                                           | Selecting an action filters the table                      |
| UI-10    | Reset link clears all filters except Since                                                             | Filters clear, Since remains, table refreshes              |
| UI-11    | Pagination controls are visible when total entries exceed per-page count                               | Previous/Next buttons and page indicator are rendered      |
| UI-12    | Clicking "Next" page loads the next set of entries                                                     | Table rows change, page indicator increments               |
| UI-13    | Changing per-page selector updates the number of visible rows                                          | Row count matches the selected per-page value              |
| UI-14    | URL query string reflects current page, per_page, since, and active filters                           | `window.location.search` contains expected params          |
| UI-15    | Navigating directly to `/admin/audit-logs?since=2026-03-01&page=2&per_page=25` loads correct state    | Table shows expected data, filters reflect URL params      |
| UI-16    | Clicking a row expand chevron reveals the metadata JSON block                                          | Metadata code block is visible with formatted JSON         |
| UI-17    | Clicking an actor username navigates to the user's profile page                                       | URL changes to `/:username` profile route                  |
| UI-18    | Clicking a navigable target name navigates to the target entity                                        | URL changes to the entity's detail page                    |
| UI-19    | Destructive action rows (delete, revoke_admin) have highlighted styling                               | Row has red-tinted background class                        |
| UI-20    | System events show "system" badge instead of actor avatar/link                                        | Badge visible for null-actor entries                       |
| UI-21    | Event type badges are color-coded by category                                                         | user.* events have blue badge, repo.* green, etc.          |
| UI-22    | Non-admin user navigating to `/admin/audit-logs` sees access denied or redirect                       | Error message or redirect to home/login                    |
| UI-23    | Unauthenticated user navigating to `/admin/audit-logs` is redirected to login                         | Redirect to login page                                     |
| UI-24    | Loading state shows skeleton rows before data arrives                                                  | Skeleton elements visible during network request           |
| UI-25    | Network error displays inline error banner with retry button                                           | Error banner visible, retry button triggers new request    |
| UI-26    | Empty state shows appropriate message when no entries match filters                                     | "No audit log entries match your filters" message visible  |
| UI-27    | Empty state on fresh instance shows "No activity has been recorded yet" message                        | Fresh-instance empty state message visible                 |
| UI-28    | IP address column renders in monospace font                                                           | IP address element has monospace font-family               |
| UI-29    | Timestamp column shows relative time with absolute tooltip on hover                                   | Relative text visible, tooltip shows ISO date on hover     |
| UI-30    | Enter key in any filter input triggers the Apply action                                               | Pressing Enter in actor input refreshes the table          |
| UI-31    | Browser back button restores previous filter/page state                                               | Previous filter state restored from URL                    |

### TUI E2E Tests

| Test ID  | Test Description                                                                                        | Expected Result                                            |
|----------|---------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| TUI-01   | TUI audit log screen renders for admin user                                                            | Header "Admin > Audit Log" visible with entry count        |
| TUI-02   | TUI audit log screen shows audit entries in reverse chronological order                                | Entries visible, newest first                              |
| TUI-03   | TUI audit log screen `j`/`k` navigation works                                                         | Selection indicator moves up/down                          |
| TUI-04   | TUI audit log screen Enter key expands entry to show metadata                                          | Metadata visible for selected entry                        |
| TUI-05   | TUI audit log screen `r` refreshes data                                                               | Data reloads, count updates                                |
| TUI-06   | TUI audit log screen `n`/`p` pages through results                                                     | Next/previous page of entries loads                        |
| TUI-07   | TUI audit log screen `/` opens filter input                                                            | Filter prompt appears                                      |
| TUI-08   | TUI audit log screen is not available to non-admin user                                                | Admin audit log absent from navigation                     |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                                        | Expected Result                                            |
|----------|---------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| CC-01    | API response for `?since=2026-01-01&page=1&per_page=10` returns the same entry IDs as CLI with `--since 2026-01-01 --page 1 --limit 10` | ID sets are identical |
| CC-02    | `X-Total-Count` from API matches the total displayed in the web UI header                              | Values are equal                                           |
| CC-03    | Filter by `event_type=repo.*` returns the same results across API, CLI, and web UI                     | Entry counts and IDs match                                 |
| CC-04    | Entries created by seeding admin actions (user create, repo delete) appear consistently across all clients | Same entries visible in API, CLI, web UI, and TUI         |

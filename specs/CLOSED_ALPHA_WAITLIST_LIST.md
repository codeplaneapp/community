# CLOSED_ALPHA_WAITLIST_LIST

Specification for CLOSED_ALPHA_WAITLIST_LIST.

## High-Level User POV

When a Codeplane instance is operating in closed alpha mode, administrators need to see who has requested access. The waitlist list feature gives administrators a complete, paginated view of every person who has submitted a request to join the platform.

An administrator opens the admin console and navigates to the alpha access management area. They select the waitlist tab and see a table of all waitlist entries — each row shows the person's email address, the optional note they submitted explaining why they want access, the source of their request (web, CLI, etc.), their current status (pending, approved, or rejected), and when they submitted. Approved entries also show which admin approved them and when. The list is ordered with the most recent submissions at the top, so new requests are always immediately visible.

The administrator can filter the list by status. When reviewing incoming requests, they filter to "pending" to see only the people still waiting. When auditing past decisions, they filter to "approved" or "rejected." When they want the full picture, they remove the filter and see everything. The list is paginated so it remains performant even when hundreds or thousands of requests have accumulated.

This same view is available through the CLI for administrators who prefer terminal-based workflows. Running a single command outputs the waitlist as structured JSON with the same filtering and pagination options, which can be piped into other tools, filtered with jq, or used in scripts for batch processing.

The waitlist list is the foundation for the approval workflow. An admin scans the pending list, reviews notes, and decides who to approve. It is also the mechanism for auditing past decisions — who was approved, when, and by which admin. When investigating why a prospective user has not yet received access, the admin searches the list to find their entry and check its status.

This feature provides value during early product rollouts, private betas, and controlled deployments where the operator needs to manage demand, prioritize invitations, and maintain a record of access requests.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- An authenticated admin can retrieve a paginated list of waitlist entries via the API endpoint `GET /api/admin/alpha/waitlist`.
- The server route is wired to the `listWaitlistEntries` and `countWaitlistEntries` database queries (not returning a stub empty array).
- The response payload matches the documented JSON shape with all fields populated, including total count for pagination.
- The CLI command `codeplane admin alpha waitlist list` returns the real waitlist data as structured JSON.
- The admin UI waitlist tab renders the list from the live API with pagination controls.
- Status filtering works across API, CLI, and UI.
- Non-admin and unauthenticated callers are rejected with appropriate HTTP status codes.
- All integration and E2E tests pass.

### Core Constraints

- [ ] `GET /api/admin/alpha/waitlist` returns HTTP `200` with a JSON object containing `items` (array) and `total` (number).
- [ ] Each item in the `items` array contains: `id`, `email`, `lower_email`, `note`, `status`, `source`, `approved_by`, `approved_at`, `created_at`, `updated_at`.
- [ ] The `id` field is a UUID string.
- [ ] The `email` field preserves the original casing as provided when the entry was submitted.
- [ ] The `lower_email` field contains the lowercase-normalized form of the email.
- [ ] The `status` field is one of: `"pending"`, `"approved"`, `"rejected"`.
- [ ] The `source` field is a free-form string identifying the submission channel (e.g., `"cli"`, `"website"`, `"marketing-page"`).
- [ ] The `note` field contains the user-submitted note, or an empty string if none was provided.
- [ ] The `approved_by` field is the user ID of the admin who approved the entry, or `null` if not yet approved.
- [ ] The `approved_at` field is an ISO 8601 timestamp when the entry was approved, or `null` if not yet approved.
- [ ] The `created_at` field is an ISO 8601 timestamp.
- [ ] The `updated_at` field is an ISO 8601 timestamp.
- [ ] The list is sorted by `created_at` descending (most recent first).
- [ ] The `total` field reflects the total count of entries matching the current filter, not just the page size.

### Pagination Constraints

- [ ] The `page` query parameter defaults to `1` when omitted or empty.
- [ ] The `per_page` query parameter defaults to `50` when omitted or empty.
- [ ] The `per_page` value is capped at `100` — any value above 100 is silently reduced to 100.
- [ ] The `per_page` value must be at least `1` — zero or negative values default to `50`.
- [ ] Page numbers start at `1`. A `page` of `0` is treated as `1`.
- [ ] When `page` exceeds the available data, the endpoint returns an empty `items` array with the accurate `total`.

### Status Filter Constraints

- [ ] When `status` query parameter is omitted or empty string, all entries are returned regardless of status.
- [ ] When `status` is `"pending"`, only pending entries are returned.
- [ ] When `status` is `"approved"`, only approved entries are returned.
- [ ] When `status` is `"rejected"`, only rejected entries are returned.
- [ ] When `status` is an unrecognized value (e.g., `"invalid"`), the endpoint returns an empty `items` array with `total: 0` (the SQL filter finds no matches).

### Boundary Constraints

- [ ] The response is valid JSON and the `Content-Type` header is `application/json`.
- [ ] Timestamp fields are serialized as ISO 8601 strings in UTC.
- [ ] The endpoint functions correctly with zero entries.
- [ ] The endpoint functions correctly with 1 entry.
- [ ] The endpoint functions correctly with 1,000+ entries across multiple pages.
- [ ] The `email` field accurately reflects values up to 254 characters (max email length per RFC 5321).
- [ ] The `note` field accurately reflects values up to 1,000 characters without truncation.
- [ ] The `source` field accurately reflects values up to 255 characters without truncation.
- [ ] Non-integer `page` and `per_page` values (e.g., `"abc"`) are treated as defaults (`1` and `50` respectively).

### Edge Cases

- [ ] When no entries exist and no filter is applied, the endpoint returns `{ items: [], total: 0 }`.
- [ ] When no entries match the filter (e.g., filter by `"rejected"` when there are no rejected entries), the endpoint returns `{ items: [], total: 0 }`.
- [ ] If an entry was submitted multiple times with the same email (upserted), only one entry appears per email.
- [ ] Entries submitted with different casing for the same email result in a single entry due to deduplication on `lower_email`.
- [ ] Entries that were submitted and then approved correctly show `approved_by` and `approved_at` populated.
- [ ] A mixture of pending, approved, and rejected entries all appear when unfiltered, correctly typed.
- [ ] The endpoint does not leak waitlist data in error responses or logs to non-admin callers.
- [ ] Notes containing special characters (unicode, HTML entities, newlines) are returned verbatim without sanitization at the API level (sanitization is the UI layer's responsibility).

## Design

### API Shape

**`GET /api/admin/alpha/waitlist`**

Authentication: Required. Admin role required.

Query parameters:

| Parameter | Type | Default | Constraints |
|-----------|------|---------|-------------|
| `status` | string | `""` (all) | One of `"pending"`, `"approved"`, `"rejected"`, or empty |
| `page` | integer | `1` | Minimum `1` |
| `per_page` | integer | `50` | Minimum `1`, maximum `100` |

Response `200`:
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "User@Example.com",
      "lower_email": "user@example.com",
      "note": "I'd love to try Codeplane for my team",
      "status": "pending",
      "source": "website",
      "approved_by": null,
      "approved_at": null,
      "created_at": "2026-03-22T14:30:00.000Z",
      "updated_at": "2026-03-22T14:30:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "email": "dev@startup.io",
      "lower_email": "dev@startup.io",
      "note": "",
      "status": "approved",
      "source": "cli",
      "approved_by": "admin-user-uuid",
      "approved_at": "2026-03-21T10:00:00.000Z",
      "created_at": "2026-03-20T08:00:00.000Z",
      "updated_at": "2026-03-21T10:00:00.000Z"
    }
  ],
  "total": 42
}
```

Error responses:
- `401 Unauthorized` — No valid session cookie or PAT provided.
- `403 Forbidden` — Authenticated user is not an admin.

### SDK Shape

The `listWaitlistEntries` and `countWaitlistEntries` functions in `@codeplane/sdk` provide the database access layer:

```typescript
interface ListWaitlistEntriesArgs {
  statusFilter: string;   // empty string for all, or "pending"/"approved"/"rejected"
  pageOffset: string;     // calculated as (page - 1) * per_page
  pageSize: string;       // capped at 100
}

interface ListWaitlistEntriesRow {
  id: string;
  email: string;
  lowerEmail: string;
  note: string;
  status: string;
  source: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function listWaitlistEntries(sql: Sql, args: ListWaitlistEntriesArgs): Promise<ListWaitlistEntriesRow[]>

interface CountWaitlistEntriesArgs {
  statusFilter: string;
}

interface CountWaitlistEntriesRow {
  count: string;
}

function countWaitlistEntries(sql: Sql, args: CountWaitlistEntriesArgs): Promise<CountWaitlistEntriesRow | null>
```

The server route handler calls both functions in parallel and serializes the result to the JSON response shape documented above, mapping camelCase SDK fields to snake_case JSON fields. The `count` from `countWaitlistEntries` is parsed as an integer and returned as the `total` field.

### CLI Command

```
codeplane admin alpha waitlist list [--status <pending|approved|rejected>] [--page N] [--per-page N]
```

- Requires an admin PAT configured in the CLI config or passed via environment.
- `--status` is optional; when omitted, all entries are returned.
- `--page` defaults to `1`.
- `--per-page` defaults to `50`.
- Outputs the response body as JSON to stdout, including both `items` and `total`.
- Supports `--json` structured output filtering (e.g., `--json items[].email,total`).
- Exits with code `0` on success.
- Exits with non-zero code and a human-readable error message on auth failure or network error.

Example output:
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "lower_email": "user@example.com",
      "note": "Interested in jj-native workflows",
      "status": "pending",
      "source": "cli",
      "approved_by": null,
      "approved_at": null,
      "created_at": "2026-03-22T14:30:00.000Z",
      "updated_at": "2026-03-22T14:30:00.000Z"
    }
  ],
  "total": 1
}
```

### Web UI Design

**Admin Alpha Access Page — Waitlist Tab (`/admin/alpha`)**

The waitlist tab displays a paginated data table with the following columns:

| Column | Description | Formatting |
|--------|-------------|------------|
| Email | The submitted email address | Standard text; truncated with ellipsis at 40 characters, full email on hover |
| Note | The user-submitted note | Truncated at 80 characters with expand-on-click; displayed in standard font; HTML-escaped for XSS safety |
| Source | The submission source tag | Monospaced badge (e.g., `cli`, `website`) |
| Status | Current entry status | Color-coded badge: pending=yellow, approved=green, rejected=red |
| Submitted | Submission timestamp | Relative time (e.g., "2 hours ago") with full ISO 8601 timestamp on hover |
| Approved By | Admin who approved (if applicable) | Admin username linking to profile; "—" if not approved |
| Approved At | Approval timestamp (if applicable) | Relative time with full timestamp on hover; "—" if not approved |

Table behaviors:
- Sorted by submission date descending (most recent first), matching the API order.
- Status filter dropdown above the table with options: "All", "Pending", "Approved", "Rejected". Defaults to "All".
- Pagination controls below the table showing current page, total pages (derived from `total` and `per_page`), and previous/next navigation buttons.
- Each pending row has an "Approve" action button (part of CLOSED_ALPHA_WAITLIST_APPROVE feature).
- Empty state shows: "No waitlist entries yet." when unfiltered, or "No {status} entries found." when filtered.
- The table refreshes when the status filter or page is changed.
- Changing the status filter resets the page to 1.

Loading state: A skeleton loader displays while the API call is in flight.

Error state: If the API call fails, display an inline error banner: "Failed to load waitlist entries. Please try again." with a retry button.

### Documentation

1. **Admin Guide — Viewing the Waitlist**: Explain how to view all waitlist entries via the admin UI waitlist tab and the CLI `codeplane admin alpha waitlist list` command. Cover what each field means (email, note, source, status, submission/approval timestamps). Explain filtering by status and pagination. Show how to identify entries needing review by filtering to "pending."

2. **CLI Reference — `admin alpha waitlist list`**: Document the command syntax, all options (`--status`, `--page`, `--per-page`), required authentication (admin PAT), output format (JSON object with `items` and `total`), and example usage including piping to `jq` for filtering (e.g., `codeplane admin alpha waitlist list --status pending | jq '.items[].email'`).

## Permissions & Security

### Authorization Roles

| Caller | Access |
|--------|--------|
| Anonymous (no auth) | `401 Unauthorized` — Rejected |
| Authenticated non-admin user | `403 Forbidden` — Rejected |
| Authenticated admin user | `200 OK` — Paginated waitlist returned |
| System/service account with admin PAT | `200 OK` — Paginated waitlist returned |

The `requireAdmin` middleware enforces this by checking:
1. A valid session or PAT is present (else `401`).
2. The authenticated user has `isAdmin = true` (else `403`).

### Rate Limiting

- Standard authenticated admin rate limits apply (matching platform defaults for admin routes).
- No additional rate limiting is required beyond the platform default — this endpoint is admin-only and returns a bounded payload (max 100 items per page).
- Recommended platform default: 60 requests per minute per authenticated user for admin endpoints.

### Data Privacy

- **PII exposure**: The response contains email addresses and user-submitted notes. Both are PII. The endpoint is strictly admin-only. Non-admin callers must never receive waitlist data — not even partial data in error messages.
- **Response body**: The full `email` is returned to admins because they need it for approval decisions. No masking or truncation is applied at the API level.
- **Notes as user content**: Notes are free-form user-submitted text and may contain personal information. They must be HTML-escaped in the UI layer to prevent XSS.
- **Audit logging**: Access to this endpoint should be logged with the requesting admin's user ID. Email addresses and note contents from the waitlist must not appear in access logs.
- **Transport security**: The endpoint must be served over HTTPS in production. Email addresses must never appear in URL query parameters (they don't — filters use status only, not email).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `WaitlistListed` | Admin successfully retrieves a page of waitlist entries | `admin_user_id`, `status_filter`, `page`, `per_page`, `result_count`, `total_count`, `via` |

### Properties Detail

- `admin_user_id`: The user ID of the admin who listed the waitlist.
- `status_filter`: The filter applied — `"all"`, `"pending"`, `"approved"`, or `"rejected"`.
- `page`: The page number requested.
- `per_page`: The page size requested (after capping at 100).
- `result_count`: Number of entries returned on this page. Useful for understanding typical page utilization.
- `total_count`: Total number of entries matching the filter. Useful for tracking waitlist growth.
- `via`: The client surface that triggered the list — `"api"` for direct API calls, `"cli"` for CLI invocations, `"ui"` for admin web UI loads.

### Funnel Metrics & Success Indicators

- **Admin Waitlist View Frequency**: How often admins view the waitlist per day/week. Increasing frequency during active onboarding is healthy; zero views over 7+ days when `codeplane_waitlist_entries_pending > 0` indicates the waitlist is being neglected.
- **Pending Backlog Size Over Time**: Track `total_count` from `WaitlistListed` events where `status_filter = "pending"` to understand whether the backlog is growing, stable, or shrinking.
- **Filter Usage Distribution**: Ratio of `status_filter` values across `WaitlistListed` events. Predominantly "pending" filters suggest admins use the list for triage. "all" or "approved" filters suggest auditing behavior.
- **List-to-Approve Ratio**: Ratio of `WaitlistListed` events to `WaitlistEntryApproved` events. A high ratio (many views, few approvals) may indicate admins are cautious or overwhelmed. A roughly 1:1 ratio suggests an efficient triage workflow.
- **Page Depth**: Track `page` values. Most admins should only view page 1; deep pagination suggests either a large backlog or an admin searching for a specific entry (indicating a search feature may be needed).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Admin listed waitlist entries | `info` | `admin_user_id`, `status_filter`, `page`, `per_page`, `result_count`, `total_count`, `request_id` |
| Waitlist list query executed | `debug` | `duration_ms`, `row_count`, `status_filter` |
| Waitlist count query executed | `debug` | `duration_ms`, `count`, `status_filter` |
| Waitlist list request unauthorized | `warn` | `request_id`, `reason` (`no_auth` or `not_admin`), `source_ip` |
| Waitlist list database error | `error` | `request_id`, `error_message`, `stack_trace` |
| Waitlist list invalid query params | `debug` | `request_id`, `raw_page`, `raw_per_page`, `raw_status` |

**Log redaction rules**: Email addresses from waitlist entries must never appear in logs at `info` level or below. The `debug` level may log row counts and filter parameters but not row contents (emails, notes).

### Prometheus Metrics

**Counters:**

- `codeplane_admin_waitlist_list_total{status="success|unauthorized|forbidden|error"}` — Total waitlist list requests, partitioned by outcome.

**Histograms:**

- `codeplane_admin_waitlist_list_duration_seconds` — Duration of the waitlist list endpoint, including both the list and count database queries. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0.

**Gauges:**

- `codeplane_waitlist_entries_count{status}` — Current count of waitlist entries by status (`pending`, `approved`, `rejected`). Updated on list, join, or approve operations.

### Alerts

#### Alert: `WaitlistListEndpointErrors`
- **Condition**: `rate(codeplane_admin_waitlist_list_total{status="error"}[5m]) > 0`
- **Severity**: Critical
- **Description**: The waitlist list endpoint is returning server errors. Admins cannot view waitlist entries.

**Runbook:**
1. Check `codeplane_admin_waitlist_list_total{status="error"}` dashboard to confirm the error rate.
2. Inspect server logs for `error` level entries with context `waitlist_list` to find the root cause.
3. Verify database connectivity: run `SELECT 1 FROM alpha_waitlist_entries LIMIT 1` directly.
4. If the `alpha_waitlist_entries` table does not exist, run pending database migrations.
5. If the database is unreachable, follow the standard database recovery runbook.
6. If the query is timing out, check for table bloat or missing indexes. The `lower_email` unique index and status column should support efficient filtering.
7. Restart the server process if the error is related to connection pool exhaustion.

#### Alert: `WaitlistListHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_admin_waitlist_list_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Description**: The 99th percentile latency of the waitlist list endpoint exceeds 1 second.

**Runbook:**
1. Check `codeplane_admin_waitlist_list_duration_seconds` histogram to confirm the latency spike.
2. Verify the `alpha_waitlist_entries` table size via `SELECT COUNT(*) FROM alpha_waitlist_entries`. If the table has grown beyond 50,000 rows, consider archiving old rejected entries.
3. Check whether the status filter index is being used: run `EXPLAIN ANALYZE` on the list query with the most common filter value.
4. Check database connection pool metrics for contention.
5. Verify that the count query is not doing a sequential scan. An index on `status` would help if most queries use status filters.
6. If the latency correlates with high traffic, consider adding a short-lived cache (30s TTL) for admin list results.

#### Alert: `WaitlistListUnauthorizedSpike`
- **Condition**: `rate(codeplane_admin_waitlist_list_total{status="unauthorized|forbidden"}[5m]) > 5`
- **Severity**: Warning
- **Description**: Elevated rate of unauthorized or forbidden access attempts to the waitlist list endpoint.

**Runbook:**
1. Check access logs for the source IPs and user agents making the requests.
2. If the requests come from a single IP/user, investigate whether a misconfigured client or script is retrying with invalid credentials.
3. If the pattern suggests enumeration or probing, consider temporary IP-level blocking.
4. Verify that legitimate admin PATs have not been revoked or expired.
5. Check if a deployment changed the admin flag on user accounts unexpectedly.

### Error Cases and Failure Modes

| Error Case | Behavior | HTTP Status |
|------------|----------|-------------|
| No authentication provided | Returns `401` with `"authentication required"` | 401 |
| Authenticated but not admin | Returns `403` with `"admin access required"` | 403 |
| Database unreachable | Returns `500` with generic error message (no PII leak) | 500 |
| `alpha_waitlist_entries` table missing | Returns `500` with generic error message | 500 |
| Database query timeout | Returns `500` with generic error message after timeout | 500 |
| Empty waitlist (no entries) | Returns `200` with `{ items: [], total: 0 }` | 200 |
| No entries matching filter | Returns `200` with `{ items: [], total: 0 }` | 200 |
| Page beyond available data | Returns `200` with `{ items: [], total: <actual total> }` | 200 |
| Malformed PAT in Authorization header | Returns `401` | 401 |
| Expired session cookie | Returns `401` | 401 |
| Non-numeric `page` or `per_page` | Defaults applied, returns `200` | 200 |
| `per_page` exceeds 100 | Silently capped to 100, returns `200` | 200 |
| Count query succeeds but list query fails | Returns `500` | 500 |
| List query succeeds but count query fails | Returns `500` | 500 |

## Verification

### API Integration Tests

- [ ] **List waitlist entries — empty list**: With no entries in the waitlist, `GET /api/admin/alpha/waitlist` with admin auth returns `200` and `{ items: [], total: 0 }`.
- [ ] **List waitlist entries — single entry**: Join waitlist with one email, then list. Returns `items` with exactly 1 entry matching the submitted email, and `total: 1`.
- [ ] **List waitlist entries — multiple entries**: Join with 5 emails, then list. Returns `items` with 5 entries and `total: 5`.
- [ ] **List waitlist entries — correct field shape**: Verify each item in the response has all required fields: `id`, `email`, `lower_email`, `note`, `status`, `source`, `approved_by`, `approved_at`, `created_at`, `updated_at`.
- [ ] **List waitlist entries — `id` is UUID**: Verify the `id` field matches UUID v4 format (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`).
- [ ] **List waitlist entries — `status` is valid**: Verify that `status` is always one of `"pending"`, `"approved"`, `"rejected"`.
- [ ] **List waitlist entries — `email` preserves original casing**: Join with `"User@Example.COM"`, list, verify `email` is `"User@Example.COM"`.
- [ ] **List waitlist entries — `lower_email` is lowercase**: Join with `"User@Example.COM"`, list, verify `lower_email` is `"user@example.com"`.
- [ ] **List waitlist entries — `note` preserved**: Join with note `"I want to try jj"`, list, verify `note` is `"I want to try jj"`.
- [ ] **List waitlist entries — `note` empty when none provided**: Join without note, list, verify `note` is `""`.
- [ ] **List waitlist entries — `source` preserved**: Join with source `"marketing-page"`, list, verify `source` is `"marketing-page"`.
- [ ] **List waitlist entries — pending entry has null approval fields**: Join (creates pending entry), list, verify `approved_by` is `null` and `approved_at` is `null`.
- [ ] **List waitlist entries — approved entry has populated approval fields**: Join, approve, list. Verify `approved_by` is the admin's user ID and `approved_at` is a valid ISO 8601 timestamp.
- [ ] **List waitlist entries — timestamps are ISO 8601**: Verify `created_at` and `updated_at` parse as valid ISO 8601 date strings.
- [ ] **List waitlist entries — sort order descending by created_at**: Join with emails A, B, C in that order. List returns C, B, A.
- [ ] **List waitlist entries — `total` reflects filter, not page**: Join 5 entries, approve 2. Filter by `status=pending`, verify `total` is `3` (not 5).

#### Pagination Tests

- [ ] **Default pagination**: Join 60 entries, list without pagination params. Verify `items` has 50 entries (default `per_page`) and `total` is 60.
- [ ] **Page 1 with per_page=2**: Join 5 entries, list with `?page=1&per_page=2`. Verify `items` has 2 entries and `total` is 5.
- [ ] **Page 2 with per_page=2**: Same data, list with `?page=2&per_page=2`. Verify `items` has 2 entries (different from page 1) and `total` is 5.
- [ ] **Last page**: Join 5 entries, list with `?page=3&per_page=2`. Verify `items` has 1 entry and `total` is 5.
- [ ] **Page beyond data**: Join 5 entries, list with `?page=10&per_page=2`. Verify `items` is empty and `total` is 5.
- [ ] **per_page capped at 100**: Join 150 entries, list with `?per_page=200`. Verify `items` has at most 100 entries.
- [ ] **per_page=1 (minimum)**: Join 3 entries, list with `?per_page=1`. Verify `items` has exactly 1 entry and `total` is 3.
- [ ] **Non-integer page value**: List with `?page=abc`. Verify returns `200` with default page 1 behavior.
- [ ] **Non-integer per_page value**: List with `?per_page=abc`. Verify returns `200` with default per_page 50 behavior.
- [ ] **Page 0**: List with `?page=0`. Verify treated as page 1 (returns first page).
- [ ] **Negative per_page**: List with `?per_page=-5`. Verify treated as default 50.

#### Status Filter Tests

- [ ] **Filter by pending**: Join 3, approve 1. Filter by `status=pending`. Verify only 2 pending entries returned, `total` is 2.
- [ ] **Filter by approved**: Same setup. Filter by `status=approved`. Verify only 1 approved entry, `total` is 1.
- [ ] **Filter by rejected**: With no rejected entries, filter by `status=rejected`. Verify `items: [], total: 0`.
- [ ] **No filter (all)**: Join 3, approve 1. List without status param. Verify 3 entries returned, `total` is 3.
- [ ] **Empty string filter**: List with `?status=`. Same as no filter.
- [ ] **Unknown status value**: List with `?status=invalid`. Verify `items: [], total: 0` (no match, no error).
- [ ] **Pagination with filter**: Join 10, approve 5. Filter by `status=pending` with `per_page=2`. Verify `items` has 2 pending entries and `total` is 5.

#### Large Data Tests

- [ ] **100 entries (max page)**: Join 100 entries, list with `per_page=100`. Verify all 100 returned in `items`, `total` is 100.
- [ ] **Entry with max-length email (254 chars)**: Join with a 254-character email, list, verify it appears without truncation.
- [ ] **Entry with max-length note (1000 chars)**: Join with a 1000-character note, list, verify the note appears without truncation.
- [ ] **Entry with max-length source (255 chars)**: Join with a 255-character source, list, verify it appears without truncation.
- [ ] **Entry with unicode in note**: Join with note containing emoji and CJK characters, list, verify note is returned verbatim.
- [ ] **Entry with HTML in note**: Join with note `<script>alert(1)</script>`, list, verify note is returned as-is (no server-side sanitization — that's the UI's job).

#### Deduplication Tests

- [ ] **Duplicate email upsert**: Join twice with the same email, list. Verify only 1 entry exists.
- [ ] **Case-insensitive dedup**: Join with `"User@Example.com"`, then `"user@example.com"`. List returns 1 entry.

#### Auth Tests

- [ ] **List waitlist entries — unauthenticated**: `GET /api/admin/alpha/waitlist` without auth returns `401`.
- [ ] **List waitlist entries — non-admin authenticated**: `GET /api/admin/alpha/waitlist` with non-admin PAT returns `403`.
- [ ] **List waitlist entries — response Content-Type**: Verify the response `Content-Type` header is `application/json`.

### CLI Integration Tests

- [ ] **`codeplane admin alpha waitlist list` — success**: Run with admin token, verify exit code `0` and stdout contains valid JSON with `items` array and `total` number.
- [ ] **`codeplane admin alpha waitlist list` — empty**: With no entries, verify output is `{ "items": [], "total": 0 }`.
- [ ] **`codeplane admin alpha waitlist list` — with entries**: Join entries via API, then list via CLI. Verify the CLI output contains the same entries.
- [ ] **`codeplane admin alpha waitlist list --status pending`**: Join entries, list with `--status pending`. Verify only pending entries in output.
- [ ] **`codeplane admin alpha waitlist list --status approved`**: Approve entries, list with `--status approved`. Verify only approved entries.
- [ ] **`codeplane admin alpha waitlist list --page 1 --per-page 2`**: With 5 entries, verify output has 2 items and `total` is 5.
- [ ] **`codeplane admin alpha waitlist list` — field presence**: Verify each item in CLI JSON output contains `id`, `email`, `lower_email`, `note`, `status`, `source`, `approved_by`, `approved_at`, `created_at`, `updated_at`.
- [ ] **`codeplane admin alpha waitlist list` — no admin token**: Run without admin auth configured, verify non-zero exit code and error message.
- [ ] **`codeplane admin alpha waitlist list` — non-admin token**: Run with a non-admin PAT, verify non-zero exit code and `403`-related error message.
- [ ] **`codeplane admin alpha waitlist list --json` filtering**: Run with `--json items[].email,total`, verify output contains only those fields.

### E2E (Playwright) Tests

- [ ] **Admin alpha UI — waitlist tab renders**: Sign in as admin, navigate to `/admin/alpha`, select waitlist tab. Verify the table element is visible.
- [ ] **Admin alpha UI — waitlist tab shows entries**: Pre-populate waitlist via API, navigate to admin UI. Verify table rows match the submitted entries (correct email, status, source, and note columns).
- [ ] **Admin alpha UI — waitlist tab empty state (no filter)**: With no waitlist entries, verify empty state message "No waitlist entries yet." is displayed.
- [ ] **Admin alpha UI — waitlist tab empty state (with filter)**: With entries that are all pending, filter by "approved". Verify empty state message "No approved entries found." is displayed.
- [ ] **Admin alpha UI — status filter**: Pre-populate with mixed statuses. Select "Pending" from the filter dropdown. Verify only pending rows appear in the table.
- [ ] **Admin alpha UI — status filter change resets page**: Navigate to page 2, change status filter. Verify the page resets to 1.
- [ ] **Admin alpha UI — pagination controls**: Pre-populate 10 entries, set per_page to 2. Verify page navigation controls are visible. Click "Next", verify page 2 shows different entries.
- [ ] **Admin alpha UI — total count display**: With 42 entries, verify the UI displays the total count somewhere (e.g., "42 entries" or "Page 1 of 21").
- [ ] **Admin alpha UI — status badges**: Verify pending entries show a yellow badge, approved entries show a green badge.
- [ ] **Admin alpha UI — relative timestamps**: Verify the "Submitted" column shows relative time and hovering reveals the full timestamp.
- [ ] **Admin alpha UI — note truncation**: Pre-populate an entry with a 200-character note. Verify it is truncated in the table with an expand affordance.
- [ ] **Admin alpha UI — loading state**: Intercept the API call, delay response, verify a loading skeleton or spinner is displayed.
- [ ] **Admin alpha UI — error state**: Intercept the API call, return a 500 error, verify an error banner is displayed with a retry button.
- [ ] **Admin alpha UI — error retry**: After error state, click retry, intercept with successful response, verify the table renders correctly.
- [ ] **Non-admin cannot see waitlist tab**: Sign in as non-admin user, navigate to `/admin/alpha`, verify redirect to unauthorized page or 403 display.

### Full Flow E2E Tests

- [ ] **Join-then-list flow**: (1) User joins waitlist via CLI, (2) Admin lists waitlist via CLI with `--status pending`, (3) Verify the entry appears in the output with correct email and status `"pending"`.
- [ ] **Join-approve-then-list flow**: (1) User joins waitlist, (2) Admin approves, (3) Admin lists waitlist with `--status approved`, (4) Verify the approved entry appears with `approved_by` populated and status `"approved"`.
- [ ] **Multi-source-then-list flow**: (1) Submit entry via CLI (source=`"cli"`), (2) Submit another via API (source=`"website"`), (3) List via CLI, (4) Verify both entries appear with correct source values.
- [ ] **Cross-client consistency**: (1) Join entries via API, (2) List via CLI — entries present with correct data, (3) List via admin UI — same entries visible in the table.
- [ ] **Pagination consistency across clients**: (1) Create 5 entries, (2) List page 1 per_page 2 via API, (3) List same page via CLI, (4) Verify both return the same 2 entries.

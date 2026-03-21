# CLOSED_ALPHA_WHITELIST_LIST

Specification for CLOSED_ALPHA_WHITELIST_LIST.

## High-Level User POV

When a Codeplane instance is operating in closed alpha mode, administrators need visibility into exactly which identities have been granted access. The whitelist list feature gives administrators a complete, at-a-glance view of every identity that has been explicitly allowed to sign in to the instance.

An administrator opens the admin console and navigates to the alpha access management area. They see a table of all whitelisted identities — each row shows the identity type (email, username, or wallet address), the identity value, which admin added it, and when it was added. The list is ordered with the most recently added entries at the top, making it easy to verify recent invitations.

This same view is available through the CLI for administrators who prefer terminal-based workflows. Running a single command outputs the full whitelist as structured JSON, which can be piped into other tools, filtered, or used in scripts for auditing or automation.

The whitelist list is the foundation for all whitelist management tasks. Before adding a new identity, an admin checks whether it already exists. Before removing access, they confirm the entry is present. When onboarding a batch of users, they verify the additions landed correctly. When investigating why a user cannot sign in, they search the list to determine whether the identity is missing. The list is always authoritative — it reflects exactly what the database holds with no caching or delay.

This feature provides value during private betas, controlled rollouts, and any deployment where the operator needs an audit trail of who has been granted platform access.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- An authenticated admin can retrieve the full list of whitelist entries via the API endpoint `GET /api/admin/alpha/whitelist`.
- The server route is wired to the `listWhitelistEntries` database query (not returning a stub empty array).
- The response payload matches the documented JSON shape with all fields populated.
- The CLI command `codeplane admin alpha whitelist list` returns the real whitelist data as structured JSON.
- The admin UI whitelist tab renders the list from the live API.
- Non-admin and unauthenticated callers are rejected with appropriate HTTP status codes.
- All integration and E2E tests pass.

### Core Constraints

- [ ] `GET /api/admin/alpha/whitelist` returns HTTP `200` with a JSON array of whitelist entry objects.
- [ ] Each entry object contains: `id`, `identity_type`, `identity_value`, `lower_identity_value`, `created_by`, `created_at`, `updated_at`.
- [ ] The `id` field is a UUID string.
- [ ] The `identity_type` field is one of: `"email"`, `"wallet"`, `"username"`.
- [ ] The `identity_value` field preserves the original casing as provided when the entry was created.
- [ ] The `lower_identity_value` field contains the lowercase-normalized form of the identity value.
- [ ] The `created_by` field is the user ID of the admin who added the entry, or `null` if added by a system process.
- [ ] The `created_at` field is an ISO 8601 timestamp.
- [ ] The `updated_at` field is an ISO 8601 timestamp.
- [ ] The list is sorted by `created_at` descending (most recent first).
- [ ] When no whitelist entries exist, the endpoint returns an empty array `[]` (not `null`, not an error).
- [ ] The endpoint returns all entries in a single response (no pagination — the whitelist is expected to remain manageably small for a closed alpha).

### Boundary Constraints

- [ ] The response is valid JSON and the `Content-Type` header is `application/json`.
- [ ] Timestamp fields are serialized as ISO 8601 strings in UTC.
- [ ] The endpoint functions correctly with zero entries.
- [ ] The endpoint functions correctly with 1 entry.
- [ ] The endpoint functions correctly with 1,000+ entries.
- [ ] The `identity_value` field accurately reflects values up to 254 characters (max email length) and exactly 42 characters (wallet addresses).

### Edge Cases

- [ ] If entries were added via waitlist approval, `created_by` reflects the admin who approved the waitlist entry.
- [ ] If an entry was upserted (added twice with the same normalized identity), only one entry appears in the list with the `updated_at` reflecting the most recent upsert.
- [ ] Mixed identity types all appear in the same list, correctly typed.
- [ ] Entries added with different casing for the same identity result in a single entry due to deduplication on `lower_identity_value`.
- [ ] The endpoint does not leak whitelist data in error responses or logs to non-admin callers.

## Design

### API Shape

**`GET /api/admin/alpha/whitelist`**

Authentication: Required. Admin role required.

Request: No query parameters. No request body.

Response `200`:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "identity_type": "email",
    "identity_value": "User@Example.com",
    "lower_identity_value": "user@example.com",
    "created_by": "admin-user-uuid",
    "created_at": "2026-03-21T14:30:00.000Z",
    "updated_at": "2026-03-21T14:30:00.000Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "identity_type": "username",
    "identity_value": "johndoe",
    "lower_identity_value": "johndoe",
    "created_by": "admin-user-uuid",
    "created_at": "2026-03-20T10:00:00.000Z",
    "updated_at": "2026-03-20T10:00:00.000Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "identity_type": "wallet",
    "identity_value": "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
    "lower_identity_value": "0xabcdef0123456789abcdef0123456789abcdef01",
    "created_by": null,
    "created_at": "2026-03-19T08:00:00.000Z",
    "updated_at": "2026-03-19T08:00:00.000Z"
  }
]
```

Error responses:
- `401 Unauthorized` — No valid session cookie or PAT provided.
- `403 Forbidden` — Authenticated user is not an admin.

### SDK Shape

The `listWhitelistEntries` function in `@codeplane/sdk` provides the database access layer:

```typescript
interface ListWhitelistEntriesRow {
  id: string;
  identityType: string;
  identityValue: string;
  lowerIdentityValue: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function listWhitelistEntries(sql: Sql): Promise<ListWhitelistEntriesRow[]>
```

The server route handler calls this function and serializes the rows to the JSON response shape documented above, mapping camelCase SDK fields to snake_case JSON fields.

### CLI Command

```
codeplane admin alpha whitelist list
```

- Requires an admin PAT configured in the CLI config or passed via environment.
- Outputs the full whitelist as a JSON array to stdout.
- Supports `--json` structured output filtering (e.g., `--json identity_type,identity_value`).
- Exits with code `0` on success.
- Exits with non-zero code and a human-readable error message on auth failure or network error.

Example output:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "identity_type": "email",
    "identity_value": "user@example.com",
    "lower_identity_value": "user@example.com",
    "created_by": "admin-user-uuid",
    "created_at": "2026-03-21T14:30:00.000Z",
    "updated_at": "2026-03-21T14:30:00.000Z"
  }
]
```

### Web UI Design

**Admin Alpha Access Page — Whitelist Tab (`/admin/alpha`)**

The whitelist tab displays a data table with the following columns:

| Column | Description | Formatting |
|--------|-------------|------------|
| Identity Type | Badge showing `email`, `username`, or `wallet` | Color-coded badge: email=blue, username=green, wallet=orange |
| Identity Value | The identity string | Monospaced font for wallet addresses; standard for email/username |
| Added By | Admin username or "System" | Links to admin user profile when available |
| Added | Timestamp | Relative time (e.g., "2 hours ago") with full timestamp on hover |

Table behaviors:
- Sorted by creation date descending (most recent first) matching the API order.
- Empty state shows: "No whitelist entries yet. Add an identity to grant closed alpha access."
- Each row has a "Remove" action button (part of CLOSED_ALPHA_WHITELIST_REMOVE feature).
- Above the table, an "Add Entry" button opens a form (part of CLOSED_ALPHA_WHITELIST_ADD feature).
- The table auto-refreshes when entries are added or removed.

Loading state: A skeleton loader displays while the API call is in flight.

Error state: If the API call fails, display an inline error banner: "Failed to load whitelist entries. Please try again." with a retry button.

### Documentation

1. **Admin Guide — Viewing the Whitelist**: Explain how to view all whitelisted identities via the admin UI whitelist tab and the CLI `codeplane admin alpha whitelist list` command. Cover what each field means (identity type, identity value, added by, timestamps). Explain that the list is ordered by most recently added first.

2. **CLI Reference — `admin alpha whitelist list`**: Document the command syntax, required authentication (admin PAT), output format (JSON array), and example usage including piping to `jq` for filtering.

## Permissions & Security

### Authorization Roles

| Caller | Access |
|--------|--------|
| Anonymous (no auth) | `401 Unauthorized` — Rejected |
| Authenticated non-admin user | `403 Forbidden` — Rejected |
| Authenticated admin user | `200 OK` — Full whitelist returned |
| System/service account with admin PAT | `200 OK` — Full whitelist returned |

The `requireAdmin` middleware enforces this by checking:
1. A valid session or PAT is present (else `401`).
2. The authenticated user has `isAdmin = true` (else `403`).

### Rate Limiting

- Standard authenticated admin rate limits apply (matching platform defaults for admin routes).
- No additional rate limiting is required beyond the platform default — this endpoint is admin-only and returns a small payload.
- Recommended platform default: 60 requests per minute per authenticated user for admin endpoints.

### Data Privacy

- **PII exposure**: The response contains email addresses, usernames, and wallet addresses. These are all PII. The endpoint is strictly admin-only. Non-admin callers must never receive whitelist data — not even partial data in error messages.
- **Response body**: The full `identity_value` is returned to admins because they need it for management. No masking or truncation is applied.
- **Audit logging**: Access to this endpoint should be logged with the requesting admin's user ID. The whitelist data itself (identity values) must not be logged in access logs.
- **Transport security**: The endpoint must be served over HTTPS in production. Identity values must never appear in URL query parameters (they don't — this is a simple GET with no query params).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `WhitelistListed` | Admin successfully retrieves the whitelist | `admin_user_id`, `entry_count`, `via` (`api`, `cli`, `ui`), `identity_type_counts` |

### Properties Detail

- `admin_user_id`: The user ID of the admin who listed the whitelist.
- `entry_count`: Total number of entries returned in the response. Useful for understanding whitelist size over time.
- `via`: The client surface that triggered the list — `"api"` for direct API calls, `"cli"` for CLI invocations, `"ui"` for admin web UI loads.
- `identity_type_counts`: Object with counts per type, e.g., `{ "email": 15, "username": 3, "wallet": 2 }`.

### Funnel Metrics & Success Indicators

- **Admin Whitelist View Frequency**: How often admins view the whitelist per day/week. Increasing frequency during onboarding waves is healthy; zero views over 7+ days may indicate the feature is unused or the alpha gate is forgotten.
- **Whitelist Size Over Time**: Track `entry_count` from `WhitelistListed` events to understand growth trajectory. Rapid growth indicates active onboarding; stagnation may indicate the alpha is ready to be opened.
- **List-to-Action Ratio**: Ratio of `WhitelistListed` events to `WhitelistEntryAdded` + `WhitelistEntryRemoved` events. A high ratio (many views, few changes) may indicate admins are using the list for auditing. A 1:1 ratio suggests admins check the list primarily to verify their own changes.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Admin listed whitelist entries | `info` | `admin_user_id`, `entry_count`, `request_id` |
| Whitelist list query executed | `debug` | `duration_ms`, `row_count` |
| Whitelist list request unauthorized | `warn` | `request_id`, `reason` (`no_auth` or `not_admin`), `source_ip` |
| Whitelist list database error | `error` | `request_id`, `error_message`, `stack_trace` |

**Log redaction rules**: Identity values from the whitelist must never appear in logs at `info` level or below. The `debug` level may log row counts but not row contents.

### Prometheus Metrics

**Counters:**

- `codeplane_admin_whitelist_list_total{status="success|unauthorized|forbidden|error"}` — Total whitelist list requests, partitioned by outcome.

**Histograms:**

- `codeplane_admin_whitelist_list_duration_seconds` — Duration of the whitelist list endpoint, including database query time. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0.

**Gauges:**

- `codeplane_whitelist_entries_count{identity_type}` — Current count of whitelist entries by identity type. Updated on list, add, or remove operations.

### Alerts

#### Alert: `WhitelistListEndpointErrors`
- **Condition**: `rate(codeplane_admin_whitelist_list_total{status="error"}[5m]) > 0`
- **Severity**: Critical
- **Description**: The whitelist list endpoint is returning server errors.

**Runbook:**
1. Check `codeplane_admin_whitelist_list_total{status="error"}` dashboard to confirm the error rate.
2. Inspect server logs for `error` level entries with context `whitelist_list` to find the root cause.
3. Verify database connectivity: run `SELECT 1 FROM alpha_whitelist_entries LIMIT 1` directly.
4. If the `alpha_whitelist_entries` table does not exist, run pending database migrations.
5. If the database is unreachable, follow the standard database recovery runbook.
6. If the query is timing out, check for table bloat or missing indexes. The `(identity_type, lower_identity_value)` unique index should exist.
7. Restart the server process if the error is related to connection pool exhaustion.

#### Alert: `WhitelistListHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_admin_whitelist_list_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Description**: The 99th percentile latency of the whitelist list endpoint exceeds 1 second.

**Runbook:**
1. Check `codeplane_admin_whitelist_list_duration_seconds` histogram to confirm the latency spike.
2. Verify the `alpha_whitelist_entries` table size. If the table has grown beyond 10,000 rows, consider whether closed alpha mode is still appropriate.
3. Check database connection pool metrics for contention.
4. Run `EXPLAIN ANALYZE` on the `SELECT ... FROM alpha_whitelist_entries ORDER BY created_at DESC` query to identify slow paths.
5. Verify that no full-table locks are being held by concurrent write operations.

#### Alert: `WhitelistListUnauthorizedSpike`
- **Condition**: `rate(codeplane_admin_whitelist_list_total{status="unauthorized|forbidden"}[5m]) > 5`
- **Severity**: Warning
- **Description**: Elevated rate of unauthorized or forbidden access attempts to the whitelist list endpoint.

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
| `alpha_whitelist_entries` table missing | Returns `500` with generic error message | 500 |
| Database query timeout | Returns `500` with generic error message after timeout | 500 |
| Empty whitelist (no entries) | Returns `200` with `[]` | 200 |
| Malformed PAT in Authorization header | Returns `401` | 401 |
| Expired session cookie | Returns `401` | 401 |

## Verification

### API Integration Tests

- [ ] **List whitelist entries — empty list**: With no entries in the whitelist, `GET /api/admin/alpha/whitelist` with admin auth returns `200` and `[]`.
- [ ] **List whitelist entries — single entry**: Add one email entry, then list. Returns array with exactly 1 entry matching the added identity.
- [ ] **List whitelist entries — multiple entries of same type**: Add 3 email entries, then list. Returns array with exactly 3 entries.
- [ ] **List whitelist entries — mixed identity types**: Add one email, one username, and one wallet entry. List returns all 3 with correct `identity_type` values.
- [ ] **List whitelist entries — correct field shape**: Verify each entry in the response has all required fields: `id`, `identity_type`, `identity_value`, `lower_identity_value`, `created_by`, `created_at`, `updated_at`.
- [ ] **List whitelist entries — `id` is UUID**: Verify the `id` field matches UUID format.
- [ ] **List whitelist entries — `identity_type` values**: Verify that `identity_type` is always one of `"email"`, `"wallet"`, `"username"`.
- [ ] **List whitelist entries — `identity_value` preserves original casing**: Add `"User@Example.COM"`, list, verify `identity_value` is `"User@Example.COM"`.
- [ ] **List whitelist entries — `lower_identity_value` is lowercase**: Add `"User@Example.COM"`, list, verify `lower_identity_value` is `"user@example.com"`.
- [ ] **List whitelist entries — `created_by` populated for admin-added entries**: Add an entry as admin, list, verify `created_by` is the admin's user ID.
- [ ] **List whitelist entries — `created_by` populated for waitlist-approved entries**: Approve a waitlist entry (which auto-adds to whitelist), list, verify `created_by` is the approving admin's user ID.
- [ ] **List whitelist entries — timestamps are ISO 8601**: Verify `created_at` and `updated_at` parse as valid ISO 8601 date strings.
- [ ] **List whitelist entries — sort order is descending by created_at**: Add 3 entries in order A, B, C. List returns C, B, A.
- [ ] **List whitelist entries — deduplication**: Add `"user@example.com"`, then add `"USER@EXAMPLE.COM"`. List returns exactly 1 entry (upserted), with `updated_at` >= `created_at`.
- [ ] **List whitelist entries — large list (100 entries)**: Add 100 entries, list, verify all 100 are returned.
- [ ] **List whitelist entries — entry with max-length email (254 chars)**: Add an email identity at 254 characters, list, verify it appears correctly without truncation.
- [ ] **List whitelist entries — entry with email exceeding max (255+ chars)**: Attempt to add a 255-character email, verify it is rejected at the add step with `400`.
- [ ] **List whitelist entries — entry with wallet address (42 chars)**: Add a wallet entry, list, verify the full 42-character value is returned.
- [ ] **List whitelist entries — after removal**: Add 3 entries, remove 1, list. Returns exactly 2 entries, and the removed one is not present.
- [ ] **List whitelist entries — unauthenticated**: `GET /api/admin/alpha/whitelist` without auth returns `401`.
- [ ] **List whitelist entries — non-admin authenticated**: `GET /api/admin/alpha/whitelist` with non-admin PAT returns `403`.
- [ ] **List whitelist entries — response Content-Type**: Verify the response `Content-Type` header is `application/json`.
- [ ] **List whitelist entries — request method enforcement**: `POST /api/admin/alpha/whitelist` does NOT return the list (it's the add endpoint); verify GET vs POST are distinct.

### CLI Integration Tests

- [ ] **`codeplane admin alpha whitelist list` — success**: Run with admin token, verify exit code `0` and stdout contains valid JSON array.
- [ ] **`codeplane admin alpha whitelist list` — empty**: With no entries, verify output is `[]`.
- [ ] **`codeplane admin alpha whitelist list` — with entries**: Add entries via API, then list via CLI. Verify the CLI output matches the API response.
- [ ] **`codeplane admin alpha whitelist list` — field presence**: Verify each entry in CLI JSON output contains `id`, `identity_type`, `identity_value`, `lower_identity_value`, `created_by`, `created_at`, `updated_at`.
- [ ] **`codeplane admin alpha whitelist list` — no admin token**: Run without admin auth configured, verify non-zero exit code and error message.
- [ ] **`codeplane admin alpha whitelist list` — non-admin token**: Run with a non-admin PAT, verify non-zero exit code and `403`-related error message.
- [ ] **`codeplane admin alpha whitelist list --json` filtering**: Run with `--json identity_type,identity_value`, verify output contains only those fields.

### E2E (Playwright) Tests

- [ ] **Admin alpha UI — whitelist tab renders**: Sign in as admin, navigate to `/admin/alpha`, select whitelist tab. Verify the table element is visible.
- [ ] **Admin alpha UI — whitelist tab shows entries**: Pre-populate whitelist via API, navigate to admin UI. Verify table rows match the added entries (correct identity type, identity value, and added-by columns).
- [ ] **Admin alpha UI — whitelist tab empty state**: With no whitelist entries, verify empty state message is displayed: "No whitelist entries yet."
- [ ] **Admin alpha UI — whitelist tab sort order**: Add multiple entries, verify the most recently added entry appears first in the table.
- [ ] **Admin alpha UI — identity type badges**: Verify email entries show a blue badge, username entries show a green badge, wallet entries show an orange badge.
- [ ] **Admin alpha UI — relative timestamps**: Verify the "Added" column shows relative time and hovering reveals the full timestamp.
- [ ] **Admin alpha UI — loading state**: Intercept the API call, delay response, verify a loading skeleton or spinner is displayed.
- [ ] **Admin alpha UI — error state**: Intercept the API call, return a 500 error, verify an error banner is displayed with a retry button.
- [ ] **Admin alpha UI — error retry**: After error state, click retry, intercept with successful response, verify the table renders correctly.
- [ ] **Non-admin cannot see whitelist tab**: Sign in as non-admin user, navigate to `/admin/alpha`, verify redirect to unauthorized page or 403 display.

### Full Flow E2E Tests

- [ ] **Add-then-list flow**: (1) Admin adds an email entry via API, (2) Admin lists via CLI, (3) Verify the entry appears in the CLI output with correct fields.
- [ ] **Approve-then-list flow**: (1) User joins waitlist, (2) Admin approves, (3) Admin lists whitelist, (4) Verify the approved email appears as a whitelist entry.
- [ ] **Add-remove-list flow**: (1) Admin adds 3 entries, (2) Admin removes 1, (3) Admin lists, (4) Verify exactly 2 entries remain and the removed one is absent.
- [ ] **Cross-client consistency**: (1) Admin adds entry via API, (2) List via CLI — entry present, (3) List via admin UI — same entry visible in the table.

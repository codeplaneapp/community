# ADMIN_USERS_LIST

Specification for ADMIN_USERS_LIST.

## High-Level User POV

As a Codeplane instance administrator, I need to see every registered user on my instance so I can understand who is using the platform, verify account health, and make informed decisions about user management.

The Admin Users List is the primary user inventory surface within the Codeplane admin console. When I navigate to the admin area — whether through the web UI, CLI, or TUI — I see a paginated table of all active users on the instance. Each row shows me the user's identity (username, display name, avatar), their contact information, their role (whether they are also an admin), their account status (active, login-prohibited), and when they last logged in and when they were created.

This list is the starting point for all user-level administrative actions. From here I can navigate to individual user detail views, or use adjacent admin commands to create, disable, promote, or delete users. The list is available only to administrators — non-admin users and unauthenticated visitors are turned away with a clear authorization error.

Pagination keeps the list usable even on instances with thousands of users. I can page forward and backward and adjust how many users I see per page. The total count of users is always available so I know the full scope of my user base without needing to page through everything.

The experience must be consistent across all Codeplane clients: the web admin console, the `codeplane admin user list` CLI command, and eventually the TUI admin screen should all surface the same data in a format appropriate for their medium.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated admin user can retrieve a paginated list of all active users on the Codeplane instance.
- [ ] The list endpoint is backed by a real service implementation (not a stub returning empty arrays).
- [ ] The response includes the total user count for pagination affordances.
- [ ] The CLI `admin user list` command displays the user list and supports `--page` and `--limit` options.
- [ ] The web admin console displays the user list in a table with pagination controls.
- [ ] Non-admin authenticated users receive a 401 Unauthorized response.
- [ ] Unauthenticated requests receive a 401 Unauthorized response.
- [ ] All existing e2e tests pass, and new tests cover the full specification.

### Functional Constraints

- [ ] The endpoint returns only active users (`is_active = true`).
- [ ] Users are ordered by user ID ascending (stable, deterministic ordering).
- [ ] Pagination uses page-based pagination with `page` (1-indexed) and `per_page` query parameters.
- [ ] Default page is `1`. Default `per_page` is `30`.
- [ ] Maximum `per_page` is `50`. Values above 50 are clamped to 50.
- [ ] The `X-Total-Count` response header contains the total number of active users as a string integer.
- [ ] Each user object in the response array contains at minimum: `id`, `username`, `display_name`, `email`, `avatar_url`, `is_admin`, `is_active`, `prohibit_login`, `user_type`, `created_at`, `updated_at`, `last_login_at`.
- [ ] The `bio` field is included but may be an empty string.
- [ ] The `email` field may be `null` for users who have not set an email.
- [ ] The `last_login_at` field may be `null` for users who have never logged in.
- [ ] The `avatar_url` field may be an empty string.

### Edge Cases

- [ ] When `page` exceeds the total number of pages, the endpoint returns an empty array with the correct `X-Total-Count`.
- [ ] When `page` is `0` or negative, the server treats it as page `1`.
- [ ] When `per_page` is `0` or negative, the server uses the default value of `30`.
- [ ] When `per_page` exceeds `50`, the server clamps it to `50`.
- [ ] When no users exist on the instance (only the admin themselves), the list contains at least one user (the requesting admin).
- [ ] When `page` or `per_page` query parameters are non-numeric strings, the server uses default values rather than returning a 400.
- [ ] The response is a JSON array — not wrapped in an object — consistent with the existing route pattern.

### Boundary Constraints

- [ ] `page` parameter: integer, minimum effective value 1, no maximum (returns empty array when past last page).
- [ ] `per_page` parameter: integer, minimum effective value 1, maximum 50.
- [ ] `username` field in response: string, 1–39 characters, lowercase alphanumeric and hyphens.
- [ ] `display_name` field in response: string, 0–255 characters, UTF-8.
- [ ] `email` field in response: string or null, when present conforms to email format, max 254 characters.
- [ ] `bio` field in response: string, 0–512 characters, UTF-8.
- [ ] `avatar_url` field in response: string, valid URL or empty string.

### CLI Parameter Alignment

- [ ] The CLI `--limit` option maps to the API `per_page` query parameter. The CLI must translate `limit` to `per_page` when making the API request (current known mismatch to be fixed).

## Design

### API Shape

**Endpoint:** `GET /api/admin/users`

**Authentication:** Required. Caller must have `isAdmin = true`.

**Query Parameters:**

| Parameter  | Type    | Default | Constraints     | Description                |
|------------|---------|---------|-----------------|----------------------------|
| `page`     | integer | `1`     | Min 1           | Page number (1-indexed)    |
| `per_page` | integer | `30`    | Min 1, Max 50   | Number of results per page |

**Response Headers:**

| Header          | Type   | Description                        |
|-----------------|--------|------------------------------------|
| `X-Total-Count` | string | Total number of active users       |

**Success Response:** `200 OK`

```json
[
  {
    "id": 1,
    "username": "alice",
    "display_name": "Alice Smith",
    "email": "alice@example.com",
    "avatar_url": "https://example.com/avatar.png",
    "bio": "Platform engineer",
    "user_type": "individual",
    "is_active": true,
    "is_admin": true,
    "prohibit_login": false,
    "last_login_at": "2026-03-20T14:30:00Z",
    "created_at": "2026-01-15T09:00:00Z",
    "updated_at": "2026-03-20T14:30:00Z"
  }
]
```

**Error Responses:**

| Status | Condition                  | Body                                            |
|--------|----------------------------|-------------------------------------------------|
| `401`  | No authentication provided | `{ "error": "authentication required" }`        |
| `401`  | Authenticated but not admin| `{ "error": "admin access required" }`           |
| `500`  | Internal server error      | `{ "error": "<message>" }`                       |

**Notes:**
- The response body is a JSON array, not wrapped in an envelope object.
- Sensitive fields (`lower_username`, `lower_email`, `search_vector`, `wallet_address`, `email_notifications_enabled`) from the database row are excluded from the API response.

### SDK Shape

The `@codeplane/sdk` package must expose an admin service method:

```typescript
interface AdminListUsersInput {
  page: number;      // 1-indexed
  perPage: number;   // clamped to [1, 50]
}

interface AdminUserRow {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  bio: string;
  userType: string;
  isActive: boolean;
  isAdmin: boolean;
  prohibitLogin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminListUsersResult {
  items: AdminUserRow[];
  total: number;
}
```

The service method computes `offset = (page - 1) * perPage`, delegates to the existing `listUsers` and `countUsers` database functions, and returns the combined result. The route handler maps `AdminUserRow` to the snake_case JSON response format.

### CLI Command

**Command:** `codeplane admin user list`

**Options:**

| Flag       | Type    | Default | Description              |
|------------|---------|---------|---------------------------|
| `--page`   | number  | `1`     | Page number              |
| `--limit`  | number  | `30`    | Results per page (max 50)|
| `--json`   | flag    | off     | Output raw JSON          |

**Default (table) output:**

```
ID  USERNAME    DISPLAY NAME    EMAIL                ADMIN  LAST LOGIN           CREATED
1   alice       Alice Smith     alice@example.com    ✓      2026-03-20 14:30     2026-01-15
2   bob         Bob Jones       bob@example.com      ✗      2026-03-19 09:12     2026-02-01
3   charlie     Charlie K       —                    ✗      —                    2026-03-01

Showing 1–3 of 3 users (page 1)
```

**JSON output:** Outputs the raw JSON array from the API response.

**Error output:**

```
Error: admin access required (401)
```

**Exit codes:**
- `0` — success
- `1` — authentication or authorization failure
- `1` — network or server error

### Web UI Design

**Route:** `/admin/users` (within the admin console layout)

**Layout:**
- Page title: "Users" with a subtitle showing the total count (e.g., "247 users").
- A data table with sortable column headers (client-side sort within the current page).
- Columns: Avatar (small circle), Username (linked to user profile), Display Name, Email, Role (badge: "Admin" or "User"), Status (badge: "Active" or "Login Prohibited"), Last Login (relative time with tooltip for absolute), Created (relative time with tooltip).
- Pagination controls at the bottom: Previous / Next buttons, page indicator ("Page 1 of 5"), and a per-page selector dropdown (10, 20, 30, 50).
- Empty state: "No users found." with guidance if the instance has no users.
- Loading state: Skeleton rows matching the table column layout.
- Error state: Inline error banner with retry action.

**Interactions:**
- Clicking a username navigates to the user's public profile page.
- The per-page selector and page navigation trigger new API requests.
- The current page and per_page are reflected in the URL query string for shareability and back-button support.

### TUI UI

**Screen:** Accessible via the TUI command palette or a top-level admin menu entry (when the current user is an admin).

**Layout:**
- Header: "Admin > Users" with the total count.
- Scrollable list of user rows, each showing: username, display name, admin badge, last login (relative).
- Vim-style `j`/`k` navigation and Enter to view user detail.
- Pagination: Automatic loading of the next page when scrolling past the bottom of the current page, or explicit "Load more" action.

### Documentation

End-user documentation must include:

- **Admin Guide — Managing Users**: A section in the admin guide that explains how to view all users on the instance, what each column means, how pagination works, and how the user list relates to adjacent admin actions (create, disable, promote, delete).
- **CLI Reference — `codeplane admin user list`**: A reference entry documenting the command, its options, output formats, and example invocations including paginated queries and JSON output.
- **API Reference — `GET /api/admin/users`**: A reference entry documenting the endpoint, authentication requirements, query parameters, response schema, response headers, and error codes.

## Permissions & Security

### Authorization

| Role           | Access           |
|----------------|------------------|
| Site Admin     | Full access      |
| Authenticated (non-admin) | Denied (401) |
| Anonymous / Unauthenticated | Denied (401) |

- The `requireAdmin()` guard checks both that a valid session/token exists AND that the user has `isAdmin = true`.
- PAT-scoped access: Tokens with `admin` or `read:admin` scopes should grant access. Tokens without admin scopes should be denied.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **60 requests per minute** per authenticated user should be applied to all `/api/admin/*` routes to prevent abuse or accidental tight polling loops.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- The user list contains PII: email addresses, usernames, display names, and IP-derived last-login timestamps.
- The response must NOT include: password hashes, authentication tokens, session IDs, wallet addresses, or internal search vectors.
- The `lower_username` and `lower_email` internal normalization fields must be excluded from the API response.
- Admin access to PII should be logged in the audit trail (see Observability).
- Email addresses should only be visible to admin users — this is inherently enforced by the admin-only access gate.

## Telemetry & Product Analytics

### Business Events

| Event Name              | Trigger                                     | Properties                                                                                       |
|-------------------------|---------------------------------------------|--------------------------------------------------------------------------------------------------|
| `AdminUsersListViewed`  | Admin successfully retrieves the user list  | `admin_user_id`, `page`, `per_page`, `total_users`, `result_count`, `client` (web/cli/tui/api)   |
| `AdminUsersListDenied`  | Non-admin attempts to access the user list  | `user_id` (if authenticated), `reason` ("not_authenticated" or "not_admin"), `client`             |

### Funnel Metrics

- **Admin onboarding funnel**: Track what percentage of new admins visit the user list within 24 hours of their first admin login. Target: >70%.
- **Admin console engagement**: Track how often admins return to the user list per week. A healthy instance admin visits the user list at least once per week.
- **Client distribution**: Track which clients (web, CLI, TUI, raw API) are used to access the admin user list. This informs investment priority across surfaces.

### Success Indicators

- The stub service is replaced by a real implementation returning actual user data.
- E2E tests pass with non-empty user arrays.
- Admin users on self-hosted instances are able to verify their user base without resorting to direct database queries.

## Observability

### Logging

| Log Event                    | Level  | Structured Context                                                        | When                                         |
|------------------------------|--------|---------------------------------------------------------------------------|----------------------------------------------|
| `admin.users.list.success`   | `info` | `admin_id`, `page`, `per_page`, `total`, `result_count`, `duration_ms`    | Successful user list retrieval               |
| `admin.users.list.denied`    | `warn` | `user_id` (nullable), `reason`, `ip`, `user_agent`                        | Unauthorized access attempt                  |
| `admin.users.list.error`     | `error`| `admin_id`, `page`, `per_page`, `error_message`, `stack_trace`            | Internal error during user list retrieval    |
| `admin.users.list.slow`      | `warn` | `admin_id`, `page`, `per_page`, `duration_ms`                             | Response time exceeds 2000ms threshold       |

### Prometheus Metrics

| Metric Name                                | Type      | Labels                           | Description                                         |
|--------------------------------------------|-----------|----------------------------------|-----------------------------------------------------|
| `codeplane_admin_users_list_requests_total`| Counter   | `status` (2xx, 4xx, 5xx)        | Total admin user list requests by response status   |
| `codeplane_admin_users_list_duration_ms`   | Histogram | `status`                         | Latency distribution (buckets: 50, 100, 250, 500, 1000, 2500, 5000ms) |
| `codeplane_admin_users_list_denied_total`  | Counter   | `reason` (not_authenticated, not_admin) | Denied access attempts                        |
| `codeplane_users_total_active`             | Gauge     | —                                | Total active users on the instance (updated on list call or periodic scrape) |

### Alerts

#### Alert: `AdminUsersListHighErrorRate`
- **Condition:** `rate(codeplane_admin_users_list_requests_total{status="5xx"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `admin.users.list.error` entries — look for database connection failures or query timeouts.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check for recent schema migrations that may have broken the `users` table query.
  4. If the database is healthy, check for memory pressure on the server process — large page sizes with many users could cause OOM.
  5. Escalate to the database team if the issue is a query performance regression.

#### Alert: `AdminUsersListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_admin_users_list_duration_ms_bucket[5m])) > 2000`
- **Severity:** Warning
- **Runbook:**
  1. Check `admin.users.list.slow` log entries for the affected time period.
  2. Check database query performance — the `ListUsers` query should use an index on `is_active` and `id`.
  3. Look for lock contention on the `users` table (concurrent writes from auth flows).
  4. If the issue is transient, it may correlate with a batch user import or migration. Monitor for recovery.
  5. If persistent, consider adding a composite index on `(is_active, id)` if one does not exist.

#### Alert: `AdminUsersListDeniedSpike`
- **Condition:** `rate(codeplane_admin_users_list_denied_total[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.users.list.denied` log entries for source IPs and user agents.
  2. Determine if the spike is from a misconfigured integration or a single user repeatedly trying to access admin endpoints.
  3. If the source is a single IP or user, consider whether this represents a credential stuffing or privilege escalation attempt.
  4. If from a known integration, assist the integration owner in configuring correct admin credentials.
  5. No immediate action required unless the pattern suggests an active attack.

### Error Cases and Failure Modes

| Failure Mode                     | Symptom                              | Behavior                                            |
|----------------------------------|--------------------------------------|-----------------------------------------------------|
| Database unreachable             | 500 Internal Server Error            | Returns error JSON, logs `admin.users.list.error`   |
| Database query timeout           | 500 or slow response                 | Returns error JSON after timeout, logs slow query    |
| Invalid session/token            | 401 Unauthorized                     | Returns error JSON, no database query executed       |
| Admin flag revoked mid-session   | 401 Unauthorized on next request     | Session/token still valid but `isAdmin` check fails  |
| Extremely large user count       | Slow `COUNT(*)` query                | Pagination still works; consider caching total count |
| Corrupt user row (null username) | Potential serialization error        | Row should be skipped or return with placeholder     |

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| API-01   | `GET /api/admin/users` with valid admin session returns 200 and a JSON array          | Status 200, body is array, `X-Total-Count` header present     |
| API-02   | Response array items contain all required fields (`id`, `username`, `display_name`, `email`, `avatar_url`, `bio`, `user_type`, `is_active`, `is_admin`, `prohibit_login`, `last_login_at`, `created_at`, `updated_at`) | Every item in the array has all specified keys |
| API-03   | Response array items do NOT contain internal fields (`lower_username`, `lower_email`, `search_vector`, `wallet_address`, `email_notifications_enabled`) | None of the excluded keys are present |
| API-04   | Default pagination: no query params returns up to 30 users                            | Array length ≤ 30                                             |
| API-05   | `?per_page=5` returns at most 5 users                                                | Array length ≤ 5                                              |
| API-06   | `?per_page=50` (maximum valid) returns at most 50 users                               | Array length ≤ 50                                             |
| API-07   | `?per_page=51` (exceeds maximum) is clamped to 50                                     | Array length ≤ 50                                             |
| API-08   | `?per_page=100` (well above maximum) is clamped to 50                                 | Array length ≤ 50                                             |
| API-09   | `?page=1&per_page=1` returns exactly 1 user when users exist                          | Array length = 1                                              |
| API-10   | `?page=99999` (beyond last page) returns empty array with correct total               | Array length = 0, `X-Total-Count` > 0                        |
| API-11   | `?page=0` is treated as page 1                                                       | Same result as `?page=1`                                      |
| API-12   | `?page=-1` is treated as page 1                                                      | Same result as `?page=1`                                      |
| API-13   | `?per_page=0` uses default value of 30                                                | Array length ≤ 30                                             |
| API-14   | `?per_page=-5` uses default value of 30                                               | Array length ≤ 30                                             |
| API-15   | `?page=abc&per_page=xyz` (non-numeric) uses defaults                                  | Status 200, uses page=1 and per_page=30 defaults              |
| API-16   | `X-Total-Count` header value matches the actual total number of active users          | Header value equals count from a separate count query          |
| API-17   | Users are ordered by `id` ascending                                                   | `items[i].id < items[i+1].id` for all consecutive pairs       |
| API-18   | All returned users have `is_active = true`                                            | Every item has `is_active: true`                              |
| API-19   | Paginating through all pages yields all users with no duplicates and no gaps           | Union of all pages = full user set, no ID appears twice        |
| API-20   | Request without authentication returns 401                                            | Status 401, body contains "authentication required"           |
| API-21   | Request with valid non-admin token returns 401                                        | Status 401, body contains "admin access required"             |
| API-22   | Request with expired/invalid token returns 401                                        | Status 401                                                    |
| API-23   | Request with PAT having `read:admin` scope succeeds                                   | Status 200                                                    |
| API-24   | Request with PAT lacking admin scope is denied                                        | Status 401                                                    |
| API-25   | `created_at` and `updated_at` are valid ISO 8601 date strings                         | `new Date(field).toISOString()` does not throw                |
| API-26   | `last_login_at` is null or a valid ISO 8601 date string                               | Null or valid date parse                                      |

### CLI E2E Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| CLI-01   | `codeplane admin user list` with admin token exits 0 and returns JSON array           | Exit code 0, stdout parses as JSON array                      |
| CLI-02   | `codeplane admin user list --json` output is valid JSON                               | `JSON.parse(stdout)` succeeds                                 |
| CLI-03   | `codeplane admin user list --page 1 --limit 5` returns ≤ 5 users                     | Array length ≤ 5                                              |
| CLI-04   | `codeplane admin user list --limit 50` (max valid) succeeds                           | Exit code 0, array length ≤ 50                                |
| CLI-05   | `codeplane admin user list --limit 51` (exceeds max) is clamped to 50                 | Exit code 0, array length ≤ 50                                |
| CLI-06   | `codeplane admin user list` with non-admin token fails                                | Exit code ≠ 0, stderr contains error message                  |
| CLI-07   | `codeplane admin user list` without any token fails                                   | Exit code ≠ 0, stderr contains error message                  |
| CLI-08   | `codeplane admin user list --page 99999` returns empty array                          | Exit code 0, array length = 0                                 |
| CLI-09   | Response items have expected shape (id, username, display_name, email, is_admin)       | All required fields present in each item                      |
| CLI-10   | `--limit` parameter is correctly translated to `per_page` API parameter               | Verified via response size matching the limit                 |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| UI-01    | Admin user navigates to `/admin/users` and sees the user table                        | Table element is visible with at least one row                |
| UI-02    | Table columns include Username, Display Name, Email, Role, Status, Last Login, Created| All column headers are visible                                |
| UI-03    | Total user count is displayed in the page header                                      | Header subtitle text matches "N users" pattern                |
| UI-04    | Pagination controls are visible when total users exceed per-page count                | Previous/Next buttons and page indicator are rendered         |
| UI-05    | Clicking "Next" page loads the next set of users                                      | Table rows change, page indicator increments                  |
| UI-06    | Changing per-page selector updates the number of visible rows                         | Row count matches the selected per-page value                 |
| UI-07    | URL query string reflects current page and per_page                                   | `window.location.search` contains `page=` and `per_page=`    |
| UI-08    | Navigating directly to `/admin/users?page=2&per_page=10` loads correct page           | Table shows expected offset of users                          |
| UI-09    | Non-admin user navigating to `/admin/users` sees an access denied message or redirect | Error message or redirect to home/login                       |
| UI-10    | Loading state shows skeleton rows before data arrives                                 | Skeleton elements visible during network request              |
| UI-11    | Network error displays inline error banner with retry button                          | Error banner visible, retry button triggers new request       |
| UI-12    | Clicking a username in the table navigates to the user's profile page                 | URL changes to `/:username` profile route                     |
| UI-13    | Admin badge is shown for admin users, not for regular users                           | Badge element present/absent based on `is_admin`              |
| UI-14    | "Login Prohibited" status badge is shown for users with `prohibit_login = true`       | Badge visible for prohibited users                            |
| UI-15    | Empty state is shown when no users match (e.g., page far beyond data)                 | "No users found" message displayed                            |
| UI-16    | Last Login column shows relative time (e.g., "3 days ago") with full-date tooltip     | Relative text visible, tooltip shows ISO date on hover        |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| CC-01    | API response for page 1 with per_page=10 returns the same user IDs as CLI with --page 1 --limit 10 | ID sets are identical |
| CC-02    | `X-Total-Count` from API matches the total displayed in the web UI header             | Values are equal                                              |

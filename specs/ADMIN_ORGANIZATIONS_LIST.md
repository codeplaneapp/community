# ADMIN_ORGANIZATIONS_LIST

Specification for ADMIN_ORGANIZATIONS_LIST.

## High-Level User POV

As a Codeplane instance administrator, I need to see every organization registered on my instance so I can understand how teams are structured, verify organizational health, audit visibility settings, and make informed decisions about platform governance.

The Admin Organizations List is the primary organization inventory surface within the Codeplane admin console. When I navigate to the admin area — whether through the web UI, CLI, or TUI — I see a paginated table of all organizations on the instance. Each row shows me the organization's identity (name), its description, its visibility setting (public or private), its website and location metadata, and when it was created and last updated.

This list is the starting point for all organization-level administrative oversight. From here I can understand the organizational landscape of my instance: how many organizations exist, which are public versus private, and how recently they have been active. The list is available only to site administrators — non-admin users and unauthenticated visitors are turned away with a clear authorization error.

Pagination keeps the list usable even on instances with hundreds of organizations. I can page forward and backward and adjust how many organizations I see per page. The total count of organizations is always available so I know the full scope of my instance's organizational structure without needing to page through everything.

The experience must be consistent across all Codeplane clients: the web admin console, the `codeplane admin org list` CLI command, and the TUI admin screen should all surface the same data in a format appropriate for their medium.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated admin user can retrieve a paginated list of all organizations on the Codeplane instance.
- [ ] The list endpoint is backed by a real service implementation (not a stub returning empty arrays).
- [ ] The response includes the total organization count for pagination affordances.
- [ ] The CLI `admin org list` command displays the organization list and supports `--page` and `--limit` options.
- [ ] The web admin console displays the organization list in a table with pagination controls.
- [ ] Non-admin authenticated users receive a 401 Unauthorized response.
- [ ] Unauthenticated requests receive a 401 Unauthorized response.
- [ ] All existing e2e tests pass, and new tests cover the full specification.

### Functional Constraints

- [ ] The endpoint returns all organizations (no active/inactive filtering — organizations do not currently have an active flag).
- [ ] Organizations are ordered by organization ID ascending (stable, deterministic ordering).
- [ ] Pagination uses page-based pagination with `page` (1-indexed) and `per_page` query parameters.
- [ ] Default page is `1`. Default `per_page` is `30`.
- [ ] Maximum `per_page` is `50`. Values above 50 are clamped to 50.
- [ ] The `X-Total-Count` response header contains the total number of organizations as a string integer.
- [ ] Each organization object in the response array contains at minimum: `id`, `name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`.
- [ ] The `description` field may be an empty string.
- [ ] The `website` field may be an empty string.
- [ ] The `location` field may be an empty string.
- [ ] The `visibility` field is one of: `"public"`, `"limited"`, or `"private"`.

### Edge Cases

- [ ] When `page` exceeds the total number of pages, the endpoint returns an empty array with the correct `X-Total-Count`.
- [ ] When `page` is `0` or negative, the server treats it as page `1`.
- [ ] When `per_page` is `0` or negative, the server uses the default value of `30`.
- [ ] When `per_page` exceeds `50`, the server clamps it to `50`.
- [ ] When no organizations exist on the instance, the list returns an empty array with `X-Total-Count: 0`.
- [ ] When `page` or `per_page` query parameters are non-numeric strings, the server uses default values rather than returning a 400.
- [ ] The response is a JSON array — not wrapped in an object — consistent with the existing admin route pattern.
- [ ] Organizations with empty or very long descriptions (up to 1024 characters) are returned correctly without truncation in the API response.
- [ ] Organizations with unicode characters in name, description, website, or location are returned correctly with proper UTF-8 encoding.

### Boundary Constraints

- [ ] `page` parameter: integer, minimum effective value 1, no maximum (returns empty array when past last page).
- [ ] `per_page` parameter: integer, minimum effective value 1, maximum 50.
- [ ] `name` field in response: string, 1–39 characters, lowercase alphanumeric and hyphens, must not start or end with a hyphen.
- [ ] `description` field in response: string, 0–1024 characters, UTF-8.
- [ ] `visibility` field in response: string, one of `"public"`, `"limited"`, `"private"`.
- [ ] `website` field in response: string, 0–255 characters, valid URL or empty string.
- [ ] `location` field in response: string, 0–255 characters, UTF-8.

### CLI Parameter Alignment

- [ ] The CLI `--limit` option maps to the API `per_page` query parameter. The CLI must translate `limit` to `per_page` when making the API request.

## Design

### API Shape

**Endpoint:** `GET /api/admin/orgs`

**Authentication:** Required. Caller must have `isAdmin = true`.

**Query Parameters:**

| Parameter  | Type    | Default | Constraints     | Description                     |
|------------|---------|---------|-----------------|----------------------------------|
| `page`     | integer | `1`     | Min 1           | Page number (1-indexed)         |
| `per_page` | integer | `30`    | Min 1, Max 50   | Number of results per page      |

**Response Headers:**

| Header          | Type   | Description                             |
|-----------------|--------|-----------------------------------------|
| `X-Total-Count` | string | Total number of organizations           |

**Success Response:** `200 OK`

```json
[
  {
    "id": 1,
    "name": "acme-corp",
    "description": "Acme Corporation engineering team",
    "visibility": "public",
    "website": "https://acme.example.com",
    "location": "San Francisco, CA",
    "created_at": "2026-01-15T09:00:00Z",
    "updated_at": "2026-03-20T14:30:00Z"
  }
]
```

**Error Responses:**

| Status | Condition                   | Body                                             |
|--------|-----------------------------|--------------------------------------------------|
| `401`  | No authentication provided  | `{ "error": "authentication required" }`         |
| `401`  | Authenticated but not admin | `{ "error": "admin access required" }`           |
| `500`  | Internal server error       | `{ "error": "<message>" }`                      |

**Notes:**
- The response body is a JSON array, not wrapped in an envelope object.
- The `lower_name` internal normalization field from the database row is excluded from the API response.

### SDK Shape

The `@codeplane/sdk` package must expose an admin-oriented method for listing all organizations:

```typescript
interface AdminListOrgsInput {
  page: number;      // 1-indexed
  perPage: number;   // clamped to [1, 50]
}

interface AdminOrgRow {
  id: number;
  name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminListOrgsResult {
  items: AdminOrgRow[];
  total: number;
}
```

The service method computes `offset = (page - 1) * perPage`, delegates to the existing `listAllOrgs` and `countAllOrgs` database functions, and returns the combined result. The route handler maps `AdminOrgRow` to the snake_case JSON response format, excluding the `lower_name` field.

### CLI Command

**Command:** `codeplane admin org list`

**Options:**

| Flag       | Type    | Default | Description               |
|------------|---------|---------|----------------------------|
| `--page`   | number  | `1`     | Page number               |
| `--limit`  | number  | `30`    | Results per page (max 50) |
| `--json`   | flag    | off     | Output raw JSON           |

**Default (table) output:**

```
ID  NAME            DESCRIPTION                       VISIBILITY  CREATED
1   acme-corp       Acme Corporation engineering team  public      2026-01-15
2   widget-labs     Widget Labs R&D                    private     2026-02-01
3   open-source     Open Source Initiative             public      2026-03-01

Showing 1–3 of 3 organizations (page 1)
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

**Route:** `/admin/orgs` (within the admin console layout)

**Layout:**
- Page title: "Organizations" with a subtitle showing the total count (e.g., "42 organizations").
- A data table with sortable column headers (client-side sort within the current page).
- Columns: Name (linked to organization profile), Description (truncated to 80 characters with ellipsis if longer), Visibility (badge: "Public", "Private", or "Limited"), Website (linked, truncated), Location, Created (relative time with tooltip for absolute date), Updated (relative time with tooltip for absolute date).
- Pagination controls at the bottom: Previous / Next buttons, page indicator ("Page 1 of 5"), and a per-page selector dropdown (10, 20, 30, 50).
- Empty state: "No organizations found." with a brief explanation that organizations are created by users.
- Loading state: Skeleton rows matching the table column layout.
- Error state: Inline error banner with retry action.

**Interactions:**
- Clicking an organization name navigates to the organization's public profile page (`/:orgname`).
- The per-page selector and page navigation trigger new API requests.
- The current page and per_page are reflected in the URL query string for shareability and back-button support.
- Visibility badges are color-coded: green for "Public", amber for "Limited", red/grey for "Private".

### TUI UI

**Screen:** Accessible via the TUI command palette or a top-level admin menu entry (when the current user is an admin).

**Layout:**
- Header: "Admin > Organizations" with the total count.
- Scrollable list of organization rows, each showing: name, description (truncated), visibility badge.
- Vim-style `j`/`k` navigation and Enter to view organization detail.
- Pagination: Automatic loading of the next page when scrolling past the bottom of the current page, or explicit "Load more" action.

### Documentation

End-user documentation must include:

- **Admin Guide — Managing Organizations**: A section in the admin guide that explains how to view all organizations on the instance, what each column and field means, how pagination works, and how the organization list gives the admin a high-level overview of team structures.
- **CLI Reference — `codeplane admin org list`**: A reference entry documenting the command, its options, output formats, and example invocations including paginated queries and JSON output.
- **API Reference — `GET /api/admin/orgs`**: A reference entry documenting the endpoint, authentication requirements, query parameters, response schema, response headers, and error codes.

## Permissions & Security

### Authorization

| Role                              | Access             |
|-----------------------------------|---------------------|
| Site Admin                        | Full access         |
| Authenticated (non-admin)         | Denied (401)        |
| Anonymous / Unauthenticated       | Denied (401)        |

- The `requireAdmin()` guard checks both that a valid session/token exists AND that the user has `isAdmin = true`.
- PAT-scoped access: Tokens with `admin` or `read:admin` scopes should grant access. Tokens without admin scopes should be denied.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **60 requests per minute** per authenticated user should be applied to all `/api/admin/*` routes to prevent abuse or accidental tight polling loops.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- The organization list contains minimal PII risk. Organization names, descriptions, websites, and locations are organizational metadata, not personal data.
- The response must NOT include: the `lower_name` internal normalization field.
- Private organization details (name, description, membership) are visible to admins through this endpoint regardless of the organization's visibility setting. This is intentional — site admins have full visibility for governance purposes.
- Admin access to organization data should be logged in the audit trail (see Observability).

## Telemetry & Product Analytics

### Business Events

| Event Name                  | Trigger                                          | Properties                                                                                        |
|-----------------------------|--------------------------------------------------|---------------------------------------------------------------------------------------------------|
| `AdminOrgsListViewed`       | Admin successfully retrieves the organization list | `admin_user_id`, `page`, `per_page`, `total_orgs`, `result_count`, `client` (web/cli/tui/api)    |
| `AdminOrgsListDenied`       | Non-admin attempts to access the organization list | `user_id` (if authenticated), `reason` ("not_authenticated" or "not_admin"), `client`            |

### Funnel Metrics

- **Admin onboarding funnel**: Track what percentage of new admins visit the organizations list within 24 hours of their first admin login. Target: >50%.
- **Admin console engagement**: Track how often admins visit the organizations list per week. A healthy instance admin reviews organizational structure periodically.
- **Client distribution**: Track which clients (web, CLI, TUI, raw API) are used to access the admin organizations list. This informs investment priority across surfaces.
- **Pagination depth**: Track how many admins navigate beyond page 1. If >30% never paginate, the default page size is likely adequate. If >50% consistently paginate deep, consider adding search/filter capabilities.

### Success Indicators

- The stub service is replaced by a real implementation returning actual organization data.
- E2E tests pass with non-empty organization arrays.
- Admin users on self-hosted instances can audit their organization structure without resorting to direct database queries.
- Admin users visit the organizations list within the first week of instance setup.

## Observability

### Logging

| Log Event                      | Level   | Structured Context                                                        | When                                             |
|--------------------------------|---------|---------------------------------------------------------------------------|--------------------------------------------------|
| `admin.orgs.list.success`      | `info`  | `admin_id`, `page`, `per_page`, `total`, `result_count`, `duration_ms`    | Successful organization list retrieval           |
| `admin.orgs.list.denied`       | `warn`  | `user_id` (nullable), `reason`, `ip`, `user_agent`                        | Unauthorized access attempt                      |
| `admin.orgs.list.error`        | `error` | `admin_id`, `page`, `per_page`, `error_message`, `stack_trace`            | Internal error during organization list retrieval|
| `admin.orgs.list.slow`         | `warn`  | `admin_id`, `page`, `per_page`, `duration_ms`                             | Response time exceeds 2000ms threshold           |

### Prometheus Metrics

| Metric Name                                  | Type      | Labels                                       | Description                                              |
|----------------------------------------------|-----------|----------------------------------------------|----------------------------------------------------------|
| `codeplane_admin_orgs_list_requests_total`   | Counter   | `status` (2xx, 4xx, 5xx)                     | Total admin org list requests by response status         |
| `codeplane_admin_orgs_list_duration_ms`      | Histogram | `status`                                     | Latency distribution (buckets: 50, 100, 250, 500, 1000, 2500, 5000ms) |
| `codeplane_admin_orgs_list_denied_total`     | Counter   | `reason` (not_authenticated, not_admin)      | Denied access attempts                                   |
| `codeplane_orgs_total`                       | Gauge     | —                                            | Total organizations on the instance (updated on list call or periodic scrape) |

### Alerts

#### Alert: `AdminOrgsListHighErrorRate`
- **Condition:** `rate(codeplane_admin_orgs_list_requests_total{status="5xx"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `admin.orgs.list.error` entries — look for database connection failures or query timeouts.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check for recent schema migrations that may have broken the `organizations` table query.
  4. If the database is healthy, check for memory pressure on the server process — large page sizes with many organizations could cause issues.
  5. Inspect the `listAllOrgs` SQL query plan for performance regressions by running `EXPLAIN ANALYZE` against the organizations table.
  6. Escalate to the database team if the issue is a query performance regression.

#### Alert: `AdminOrgsListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_admin_orgs_list_duration_ms_bucket[5m])) > 2000`
- **Severity:** Warning
- **Runbook:**
  1. Check `admin.orgs.list.slow` log entries for the affected time period.
  2. Check database query performance — the `ListAllOrgs` query should use an index on `id` for the ORDER BY clause.
  3. Look for lock contention on the `organizations` table (concurrent writes from org creation flows).
  4. Check the `OFFSET` value — very high page numbers with large offsets can cause slow queries. Consider whether keyset pagination is needed.
  5. If the issue is transient, it may correlate with a batch import. Monitor for recovery.
  6. If persistent, verify that the `organizations` table has proper indexes and vacuum stats are up to date.

#### Alert: `AdminOrgsListDeniedSpike`
- **Condition:** `rate(codeplane_admin_orgs_list_denied_total[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.orgs.list.denied` log entries for source IPs and user agents.
  2. Determine if the spike is from a misconfigured integration or a single user repeatedly trying to access admin endpoints.
  3. If the source is a single IP or user, consider whether this represents a credential stuffing or privilege escalation attempt.
  4. If from a known integration, assist the integration owner in configuring correct admin credentials.
  5. No immediate action required unless the pattern suggests an active attack.

### Error Cases and Failure Modes

| Failure Mode                           | Symptom                              | Behavior                                              |
|----------------------------------------|--------------------------------------|-------------------------------------------------------|
| Database unreachable                   | 500 Internal Server Error            | Returns error JSON, logs `admin.orgs.list.error`      |
| Database query timeout                 | 500 or slow response                 | Returns error JSON after timeout, logs slow query      |
| Invalid session/token                  | 401 Unauthorized                     | Returns error JSON, no database query executed         |
| Admin flag revoked mid-session         | 401 Unauthorized on next request     | Session/token still valid but `isAdmin` check fails    |
| Extremely large org count              | Slow `COUNT(*)` query                | Pagination still works; consider caching total count   |
| Corrupt org row (null name)            | Potential serialization error        | Row should be skipped or return with placeholder       |
| High OFFSET with deep pagination       | Slow query due to sequential scan    | Returns correct data but latency increases linearly    |

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| API-01   | `GET /api/admin/orgs` with valid admin session returns 200 and a JSON array           | Status 200, body is array, `X-Total-Count` header present     |
| API-02   | Response array items contain all required fields (`id`, `name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`) | Every item in the array has all specified keys |
| API-03   | Response array items do NOT contain internal fields (`lower_name`)                    | The `lower_name` key is not present in any item               |
| API-04   | Default pagination: no query params returns up to 30 organizations                    | Array length ≤ 30                                             |
| API-05   | `?per_page=5` returns at most 5 organizations                                        | Array length ≤ 5                                              |
| API-06   | `?per_page=50` (maximum valid) returns at most 50 organizations                       | Array length ≤ 50                                             |
| API-07   | `?per_page=51` (exceeds maximum) is clamped to 50                                     | Array length ≤ 50                                             |
| API-08   | `?per_page=100` (well above maximum) is clamped to 50                                 | Array length ≤ 50                                             |
| API-09   | `?page=1&per_page=1` returns exactly 1 organization when orgs exist                   | Array length = 1                                              |
| API-10   | `?page=99999` (beyond last page) returns empty array with correct total               | Array length = 0, `X-Total-Count` > 0                        |
| API-11   | `?page=0` is treated as page 1                                                       | Same result as `?page=1`                                      |
| API-12   | `?page=-1` is treated as page 1                                                      | Same result as `?page=1`                                      |
| API-13   | `?per_page=0` uses default value of 30                                                | Array length ≤ 30                                             |
| API-14   | `?per_page=-5` uses default value of 30                                               | Array length ≤ 30                                             |
| API-15   | `?page=abc&per_page=xyz` (non-numeric) uses defaults                                  | Status 200, uses page=1 and per_page=30 defaults              |
| API-16   | `X-Total-Count` header value matches the actual total number of organizations         | Header value equals count from a separate count query          |
| API-17   | Organizations are ordered by `id` ascending                                           | `items[i].id < items[i+1].id` for all consecutive pairs       |
| API-18   | Paginating through all pages yields all organizations with no duplicates and no gaps   | Union of all pages = full org set, no ID appears twice         |
| API-19   | Request without authentication returns 401                                            | Status 401, body contains "authentication required"           |
| API-20   | Request with valid non-admin token returns 401                                        | Status 401, body contains "admin access required"             |
| API-21   | Request with expired/invalid token returns 401                                        | Status 401                                                    |
| API-22   | Request with PAT having `read:admin` scope succeeds                                   | Status 200                                                    |
| API-23   | Request with PAT lacking admin scope is denied                                        | Status 401                                                    |
| API-24   | `created_at` and `updated_at` are valid ISO 8601 date strings                         | `new Date(field).toISOString()` does not throw                |
| API-25   | `visibility` field is one of `"public"`, `"limited"`, or `"private"`                  | Every item's visibility matches one of the three values       |
| API-26   | Organization with empty description returns `description: ""`                         | Field present and is empty string                             |
| API-27   | Organization with empty website returns `website: ""`                                 | Field present and is empty string                             |
| API-28   | Organization with empty location returns `location: ""`                               | Field present and is empty string                             |
| API-29   | Organization with unicode characters in name/description is returned correctly        | UTF-8 encoded response matches stored values                  |
| API-30   | Organization with maximum-length description (1024 chars) is returned without truncation | Description field length equals 1024                        |
| API-31   | When no organizations exist, returns empty array with `X-Total-Count: 0`              | Status 200, array length = 0, header = "0"                    |
| API-32   | Private organizations are visible in admin list (admin sees all regardless of visibility) | Private orgs appear in results                             |

### CLI E2E Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| CLI-01   | `codeplane admin org list` with admin token exits 0 and returns JSON array            | Exit code 0, stdout parses as JSON array                      |
| CLI-02   | `codeplane admin org list --json` output is valid JSON                                | `JSON.parse(stdout)` succeeds                                 |
| CLI-03   | `codeplane admin org list --page 1 --limit 5` returns ≤ 5 organizations              | Array length ≤ 5                                              |
| CLI-04   | `codeplane admin org list --limit 50` (max valid) succeeds                            | Exit code 0, array length ≤ 50                                |
| CLI-05   | `codeplane admin org list --limit 51` (exceeds max) is clamped to 50                  | Exit code 0, array length ≤ 50                                |
| CLI-06   | `codeplane admin org list` with non-admin token fails                                 | Exit code ≠ 0, stderr contains error message                  |
| CLI-07   | `codeplane admin org list` without any token fails                                    | Exit code ≠ 0, stderr contains error message                  |
| CLI-08   | `codeplane admin org list --page 99999` returns empty array                           | Exit code 0, array length = 0                                 |
| CLI-09   | Response items have expected shape (id, name, description, visibility)                | All required fields present in each item                      |
| CLI-10   | `--limit` parameter is correctly translated to `per_page` API parameter               | Verified via response size matching the limit                 |
| CLI-11   | Default table output format includes org name, description, visibility, and created date columns | Stdout contains column headers and formatted rows         |
| CLI-12   | Table footer shows "Showing X–Y of Z organizations (page N)"                         | Footer line matches expected pagination summary               |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| UI-01    | Admin user navigates to `/admin/orgs` and sees the organization table                 | Table element is visible with at least one row                |
| UI-02    | Table columns include Name, Description, Visibility, Website, Location, Created, Updated | All column headers are visible                             |
| UI-03    | Total organization count is displayed in the page header                              | Header subtitle text matches "N organizations" pattern        |
| UI-04    | Pagination controls are visible when total orgs exceed per-page count                 | Previous/Next buttons and page indicator are rendered         |
| UI-05    | Clicking "Next" page loads the next set of organizations                              | Table rows change, page indicator increments                  |
| UI-06    | Changing per-page selector updates the number of visible rows                         | Row count matches the selected per-page value                 |
| UI-07    | URL query string reflects current page and per_page                                   | `window.location.search` contains `page=` and `per_page=`    |
| UI-08    | Navigating directly to `/admin/orgs?page=2&per_page=10` loads correct page            | Table shows expected offset of organizations                  |
| UI-09    | Non-admin user navigating to `/admin/orgs` sees an access denied message or redirect  | Error message or redirect to home/login                       |
| UI-10    | Loading state shows skeleton rows before data arrives                                 | Skeleton elements visible during network request              |
| UI-11    | Network error displays inline error banner with retry button                          | Error banner visible, retry button triggers new request       |
| UI-12    | Clicking an organization name navigates to the organization's profile page            | URL changes to `/:orgname` profile route                      |
| UI-13    | Visibility badge shows correct color: green for Public, amber for Limited, grey for Private | Badge color matches visibility value                     |
| UI-14    | Empty state is shown when no organizations exist                                      | "No organizations found" message displayed                    |
| UI-15    | Created/Updated columns show relative time (e.g., "3 days ago") with full-date tooltip | Relative text visible, tooltip shows ISO date on hover       |
| UI-16    | Long descriptions are truncated with ellipsis in the table view                       | Text is truncated, no layout overflow                         |
| UI-17    | Website links in the table are clickable and open in a new tab                        | Links have `target="_blank"` and `rel="noopener"`             |

### TUI E2E Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| TUI-01   | Admin user can navigate to the Admin > Organizations screen                           | Screen renders with organization list                         |
| TUI-02   | Organization list shows org name, description (truncated), and visibility             | All three columns visible per row                             |
| TUI-03   | Total organization count is shown in the screen header                                | Header contains "N organizations"                             |
| TUI-04   | `j`/`k` navigation moves selection up and down through the list                       | Highlight/selection indicator moves accordingly               |
| TUI-05   | Scrolling past the last item triggers pagination to load the next page                | New items appear in the list                                  |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| CC-01    | API response for page 1 with per_page=10 returns the same org IDs as CLI with --page 1 --limit 10 | ID sets are identical                              |
| CC-02    | `X-Total-Count` from API matches the total displayed in the web UI header             | Values are equal                                              |
| CC-03    | Visibility values from API match the badge labels displayed in the web UI             | Each visibility value maps to the correct badge text          |

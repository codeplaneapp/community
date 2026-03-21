# ADMIN_REPOSITORIES_LIST

Specification for ADMIN_REPOSITORIES_LIST.

## High-Level User POV

As a Codeplane instance administrator, I need to see every repository hosted on my instance so I can understand the scope of the codebase being managed, assess storage and activity patterns, and make informed decisions about instance maintenance, capacity planning, and governance.

The Admin Repositories List is the primary repository inventory surface within the Codeplane admin console. When I navigate to the admin area — whether through the web UI, CLI, or TUI — I see a paginated table of all repositories on the instance, regardless of which user or organization owns them. Each row shows me the repository's identity (name, owner), its visibility (public or private), key metadata like description, topics, and archive status, and activity signals such as star count, fork count, issue count, and when the repository was last updated.

This list is the starting point for all repository-level administrative oversight. From here I can understand the full footprint of the instance — how many repositories exist, which are actively maintained versus archived, which are public-facing versus internal, and how they are distributed across users and organizations. The list is available only to site administrators — non-admin users and unauthenticated visitors are turned away with a clear authorization error.

Pagination keeps the list usable even on instances with thousands of repositories. I can page forward and backward and adjust how many repositories I see per page. The total count of repositories is always available so I know the full scope of hosted code without needing to page through everything.

The experience must be consistent across all Codeplane clients: the web admin console, the `codeplane admin repo list` CLI command, and eventually the TUI admin screen should all surface the same data in a format appropriate for their medium.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated admin user can retrieve a paginated list of all repositories on the Codeplane instance.
- [ ] The list endpoint is backed by a real service implementation (not a stub returning empty arrays).
- [ ] The response includes the total repository count for pagination affordances.
- [ ] The CLI `admin repo list` command displays the repository list and supports `--page` and `--limit` options.
- [ ] The web admin console displays the repository list in a table with pagination controls.
- [ ] Non-admin authenticated users receive a 401 Unauthorized response.
- [ ] Unauthenticated requests receive a 401 Unauthorized response.
- [ ] All existing e2e tests pass, and new tests cover the full specification.

### Functional Constraints

- [ ] The endpoint returns ALL repositories (both public and private, both active and archived).
- [ ] Repositories are ordered by `updated_at` descending, then by `id` descending as a tiebreaker. The most recently updated repositories appear first.
- [ ] Pagination uses page-based pagination with `page` (1-indexed) and `per_page` query parameters.
- [ ] Default page is `1`. Default `per_page` is `30`.
- [ ] Maximum `per_page` is `50`. Values above 50 are clamped to 50.
- [ ] The `X-Total-Count` response header contains the total number of repositories as a string integer.
- [ ] Each repository object in the response array contains at minimum: `id`, `name`, `owner`, `owner_type`, `description`, `is_public`, `is_archived`, `archived_at`, `is_fork`, `is_mirror`, `is_template`, `default_bookmark`, `topics`, `num_stars`, `num_forks`, `num_watches`, `num_issues`, `num_closed_issues`, `created_at`, `updated_at`.
- [ ] The `owner` field is the resolved username (for user-owned repos) or organization name (for org-owned repos), not a raw user/org ID.
- [ ] The `owner_type` field is either `"user"` or `"organization"`.
- [ ] The `description` field may be an empty string.
- [ ] The `topics` field is an array of strings and may be empty.
- [ ] The `archived_at` field is included and may be `null` for non-archived repositories.

### Edge Cases

- [ ] When `page` exceeds the total number of pages, the endpoint returns an empty array with the correct `X-Total-Count`.
- [ ] When `page` is `0` or negative, the server treats it as page `1`.
- [ ] When `per_page` is `0` or negative, the server uses the default value of `30`.
- [ ] When `per_page` exceeds `50`, the server clamps it to `50`.
- [ ] When no repositories exist on the instance, the endpoint returns an empty array with `X-Total-Count: 0`.
- [ ] When `page` or `per_page` query parameters are non-numeric strings, the server uses default values rather than returning a 400.
- [ ] The response is a JSON array — not wrapped in an object — consistent with the existing admin route pattern.
- [ ] Archived repositories appear in the list with `is_archived: true` and a non-null `archived_at`.
- [ ] Forked repositories appear in the list with `is_fork: true`.
- [ ] Mirror repositories appear in the list with `is_mirror: true`.
- [ ] Template repositories appear in the list with `is_template: true`.
- [ ] Repositories owned by deleted or disabled users still appear (admin needs full visibility).

### Boundary Constraints

- [ ] `page` parameter: integer, minimum effective value 1, no maximum (returns empty array when past last page).
- [ ] `per_page` parameter: integer, minimum effective value 1, maximum 50.
- [ ] `name` field in response: string, 1–100 characters.
- [ ] `owner` field in response: string, 1–40 characters.
- [ ] `description` field in response: string, 0–2048 characters, UTF-8.
- [ ] `topics` field in response: array of strings, each topic 1–50 characters, maximum 25 topics per repository.
- [ ] `default_bookmark` field in response: string, 1–256 characters.

### CLI Parameter Alignment

- [ ] The CLI `--limit` option maps to the API `per_page` query parameter. The CLI must translate `limit` to `per_page` when making the API request.

## Design

### API Shape

**Endpoint:** `GET /api/admin/repos`

**Authentication:** Required. Caller must have `isAdmin = true`.

**Query Parameters:**

| Parameter  | Type    | Default | Constraints     | Description                |
|------------|---------|---------|-----------------|----------------------------|
| `page`     | integer | `1`     | Min 1           | Page number (1-indexed)    |
| `per_page` | integer | `30`    | Min 1, Max 50   | Number of results per page |

**Response Headers:**

| Header          | Type   | Description                        |
|-----------------|--------|------------------------------------|
| `X-Total-Count` | string | Total number of repositories       |

**Success Response:** `200 OK`

```json
[
  {
    "id": 42,
    "name": "codeplane",
    "owner": "alice",
    "owner_type": "user",
    "description": "A jj-native software forge",
    "is_public": true,
    "is_archived": false,
    "archived_at": null,
    "is_fork": false,
    "is_mirror": false,
    "is_template": false,
    "default_bookmark": "main",
    "topics": ["forge", "jj", "typescript"],
    "num_stars": 128,
    "num_forks": 15,
    "num_watches": 42,
    "num_issues": 67,
    "num_closed_issues": 53,
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
- Internal fields (`lower_name`, `shard_id`, `search_vector`, `user_id`, `org_id`, `fork_id`, `template_id`, `mirror_destination`, `workspace_idle_timeout_secs`, `workspace_persistence`, `workspace_dependencies`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, `next_landing_number`) from the database row are excluded from the API response.
- The `owner` field is resolved from `user_id` or `org_id` to the corresponding username or organization name.

### SDK Shape

The `@codeplane/sdk` package must expose a repo service method (replacing the current stub in the admin routes):

```typescript
interface AdminListReposInput {
  page: number;      // 1-indexed
  perPage: number;   // clamped to [1, 50]
}

interface AdminRepoRow {
  id: number;
  name: string;
  owner: string;
  ownerType: "user" | "organization";
  description: string;
  isPublic: boolean;
  isArchived: boolean;
  archivedAt: Date | null;
  isFork: boolean;
  isMirror: boolean;
  isTemplate: boolean;
  defaultBookmark: string;
  topics: string[];
  numStars: number;
  numForks: number;
  numWatches: number;
  numIssues: number;
  numClosedIssues: number;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminListReposResult {
  items: AdminRepoRow[];
  total: number;
}
```

The service method computes `offset = (page - 1) * perPage`, delegates to the existing `listAllRepos` and `countAllRepos` database functions in `packages/sdk/src/db/repos_sql.ts`, resolves owner names via a join or secondary lookup against the `users` and `organizations` tables, and returns the combined result. The route handler maps `AdminRepoRow` to the snake_case JSON response format.

### CLI Command

**Command:** `codeplane admin repo list`

This is a new subcommand group `adminRepo` that must be registered alongside `adminUser`, `adminRunner`, and `adminWorkflow` in the admin CLI at `apps/cli/src/commands/admin.ts`.

**Options:**

| Flag       | Type    | Default | Description              |
|------------|---------|---------|---------------------------|
| `--page`   | number  | `1`     | Page number              |
| `--limit`  | number  | `30`    | Results per page (max 50)|
| `--json`   | flag    | off     | Output raw JSON          |

**Default (table) output:**

```
ID  NAME             OWNER      TYPE  PUBLIC  ARCHIVED  STARS  ISSUES  UPDATED
42  codeplane        alice      user  ✓       ✗         128    67      2026-03-20
15  internal-tools   acme-corp  org   ✗       ✗         3      12      2026-03-19
7   legacy-api       bob        user  ✓       ✓         0      0       2026-01-10

Showing 1–3 of 3 repositories (page 1)
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

**Route:** `/admin/repos` (within the admin console layout)

**Layout:**
- Page title: "Repositories" with a subtitle showing the total count (e.g., "1,247 repositories").
- A data table with sortable column headers (client-side sort within the current page).
- Columns: Name (linked to repository overview), Owner (linked to user/org profile with a small badge showing "user" or "org"), Visibility (badge: "Public" or "Private"), Status (badges: "Archived", "Fork", "Mirror", "Template" as applicable — no badge for normal active repos), Stars (number), Issues (open/total, e.g., "14/67"), Updated (relative time with tooltip for absolute timestamp).
- Pagination controls at the bottom: Previous / Next buttons, page indicator ("Page 1 of 25"), and a per-page selector dropdown (10, 20, 30, 50).
- Empty state: "No repositories found." with guidance for a fresh instance.
- Loading state: Skeleton rows matching the table column layout.
- Error state: Inline error banner with retry action.

**Interactions:**
- Clicking a repository name navigates to the repository's overview page (`/:owner/:repo`).
- Clicking an owner name navigates to the user profile or organization page.
- The per-page selector and page navigation trigger new API requests.
- The current page and per_page are reflected in the URL query string for shareability and back-button support.

### TUI UI

**Screen:** Accessible via the TUI command palette or a top-level admin menu entry (when the current user is an admin).

**Layout:**
- Header: "Admin > Repositories" with the total count.
- Scrollable list of repository rows, each showing: name, owner, visibility badge, archived indicator, star count, updated (relative).
- Vim-style `j`/`k` navigation and Enter to view repository detail.
- Pagination: Automatic loading of the next page when scrolling past the bottom of the current page, or explicit "Load more" action.

### Documentation

End-user documentation must include:

- **Admin Guide — Managing Repositories**: A section in the admin guide that explains how to view all repositories on the instance, what each column means, how pagination works, and how the repository list supports administrative oversight tasks such as identifying abandoned repos, auditing visibility settings, and understanding instance growth.
- **CLI Reference — `codeplane admin repo list`**: A reference entry documenting the command, its options, output formats, and example invocations including paginated queries and JSON output.
- **API Reference — `GET /api/admin/repos`**: A reference entry documenting the endpoint, authentication requirements, query parameters, response schema, response headers, and error codes.

## Permissions & Security

### Authorization

| Role           | Access           |
|----------------|------------------|
| Site Admin     | Full access      |
| Authenticated (non-admin) | Denied (401) |
| Anonymous / Unauthenticated | Denied (401) |

- The `requireAdmin()` guard checks both that a valid session/token exists AND that the user has `isAdmin = true`.
- PAT-scoped access: Tokens with `admin` or `read:admin` scopes should grant access. Tokens without admin scopes should be denied.
- The admin repository list returns ALL repositories — including private ones the admin would not normally have access to. This is intentional: admin visibility overrides per-repository access controls.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **60 requests per minute** per authenticated user should be applied to all `/api/admin/*` routes to prevent abuse or accidental tight polling loops.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- The repository list itself does not contain direct PII (no emails, no passwords).
- Owner names (usernames and org names) are included but are already public-facing identifiers, not sensitive PII.
- The `description` field is user-authored content and may contain sensitive information. No additional filtering is applied — admins see exactly what was entered.
- Internal implementation fields (`shard_id`, `search_vector`, `mirror_destination`, workspace config, landing queue config) must be excluded from the API response to avoid leaking infrastructure details.
- Admin access to the full repository inventory should be logged in the audit trail (see Observability).
- Private repository names and descriptions are visible to admins through this endpoint. This elevated visibility is inherently enforced by the admin-only access gate.

## Telemetry & Product Analytics

### Business Events

| Event Name                  | Trigger                                           | Properties                                                                                       |
|-----------------------------|---------------------------------------------------|--------------------------------------------------------------------------------------------------|
| `AdminReposListViewed`      | Admin successfully retrieves the repository list  | `admin_user_id`, `page`, `per_page`, `total_repos`, `result_count`, `client` (web/cli/tui/api)   |
| `AdminReposListDenied`      | Non-admin attempts to access the repository list  | `user_id` (if authenticated), `reason` ("not_authenticated" or "not_admin"), `client`             |

### Funnel Metrics

- **Admin onboarding funnel**: Track what percentage of new admins visit the repository list within 24 hours of their first admin login. Target: >60%.
- **Admin console engagement**: Track how often admins return to the repository list per week. A healthy instance admin visits the repository list at least once per week for instances with active development.
- **Client distribution**: Track which clients (web, CLI, TUI, raw API) are used to access the admin repository list. This informs investment priority across surfaces.
- **Instance growth tracking**: Monitor `total_repos` over time from `AdminReposListViewed` events to understand instance growth rates without needing a separate metrics pipeline.

### Success Indicators

- The stub service is replaced by a real implementation returning actual repository data.
- E2E tests pass with non-empty repository arrays.
- Admin users on self-hosted instances are able to audit their full repository inventory without resorting to direct database queries.
- The repository list is used at least weekly by active admins on instances with >10 repositories.

## Observability

### Logging

| Log Event                     | Level  | Structured Context                                                           | When                                            |
|-------------------------------|--------|------------------------------------------------------------------------------|------------------------------------------------|
| `admin.repos.list.success`    | `info` | `admin_id`, `page`, `per_page`, `total`, `result_count`, `duration_ms`       | Successful repository list retrieval            |
| `admin.repos.list.denied`     | `warn` | `user_id` (nullable), `reason`, `ip`, `user_agent`                           | Unauthorized access attempt                     |
| `admin.repos.list.error`      | `error`| `admin_id`, `page`, `per_page`, `error_message`, `stack_trace`               | Internal error during repository list retrieval |
| `admin.repos.list.slow`       | `warn` | `admin_id`, `page`, `per_page`, `duration_ms`                                | Response time exceeds 2000ms threshold          |

### Prometheus Metrics

| Metric Name                                  | Type      | Labels                                  | Description                                            |
|----------------------------------------------|-----------|-----------------------------------------|--------------------------------------------------------|
| `codeplane_admin_repos_list_requests_total`  | Counter   | `status` (2xx, 4xx, 5xx)               | Total admin repo list requests by response status      |
| `codeplane_admin_repos_list_duration_ms`     | Histogram | `status`                                | Latency distribution (buckets: 50, 100, 250, 500, 1000, 2500, 5000ms) |
| `codeplane_admin_repos_list_denied_total`    | Counter   | `reason` (not_authenticated, not_admin) | Denied access attempts                                 |
| `codeplane_repos_total`                      | Gauge     | —                                       | Total repositories on the instance (updated on list call or periodic scrape) |

### Alerts

#### Alert: `AdminReposListHighErrorRate`
- **Condition:** `rate(codeplane_admin_repos_list_requests_total{status="5xx"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `admin.repos.list.error` entries — look for database connection failures or query timeouts.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check for recent schema migrations that may have broken the `repositories` table query.
  4. Check the `listAllRepos` query plan — if the `ORDER BY updated_at DESC, id DESC` clause is missing an index, performance degrades with scale.
  5. If the database is healthy, check for memory pressure on the server process — owner name resolution for large result sets could cause memory spikes.
  6. Escalate to the database team if the issue is a query performance regression.

#### Alert: `AdminReposListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_admin_repos_list_duration_ms_bucket[5m])) > 2000`
- **Severity:** Warning
- **Runbook:**
  1. Check `admin.repos.list.slow` log entries for the affected time period.
  2. Check database query performance — the `ListAllRepos` query should use an index on `(updated_at DESC, id DESC)`.
  3. Check whether the owner name resolution step (joining users/orgs) is the bottleneck. If so, consider a denormalized `owner_name` column or a cache.
  4. Look for lock contention on the `repositories` table (concurrent writes from push/webhook flows).
  5. If the issue is transient, it may correlate with a batch repository import or migration. Monitor for recovery.
  6. If persistent, consider adding or verifying composite indexes on `(updated_at DESC, id DESC)`.

#### Alert: `AdminReposListDeniedSpike`
- **Condition:** `rate(codeplane_admin_repos_list_denied_total[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.repos.list.denied` log entries for source IPs and user agents.
  2. Determine if the spike is from a misconfigured integration or a single user repeatedly trying to access admin endpoints.
  3. If the source is a single IP or user, consider whether this represents a credential stuffing or privilege escalation attempt.
  4. If from a known integration, assist the integration owner in configuring correct admin credentials.
  5. No immediate action required unless the pattern suggests an active attack.

### Error Cases and Failure Modes

| Failure Mode                        | Symptom                              | Behavior                                            |
|-------------------------------------|--------------------------------------|-----------------------------------------------------|
| Database unreachable                | 500 Internal Server Error            | Returns error JSON, logs `admin.repos.list.error`   |
| Database query timeout              | 500 or slow response                 | Returns error JSON after timeout, logs slow query    |
| Invalid session/token               | 401 Unauthorized                     | Returns error JSON, no database query executed       |
| Admin flag revoked mid-session      | 401 Unauthorized on next request     | Session/token still valid but `isAdmin` check fails  |
| Extremely large repository count    | Slow `COUNT(*)` query                | Pagination still works; consider caching total count |
| Owner resolution failure (orphaned repo) | Missing owner field or null      | Row should return with `owner: "[deleted]"` placeholder and `owner_type: "user"` |
| Corrupt repository row (null name)  | Potential serialization error        | Row should be skipped or return with placeholder     |

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| API-01   | `GET /api/admin/repos` with valid admin session returns 200 and a JSON array          | Status 200, body is array, `X-Total-Count` header present     |
| API-02   | Response array items contain all required fields (`id`, `name`, `owner`, `owner_type`, `description`, `is_public`, `is_archived`, `archived_at`, `is_fork`, `is_mirror`, `is_template`, `default_bookmark`, `topics`, `num_stars`, `num_forks`, `num_watches`, `num_issues`, `num_closed_issues`, `created_at`, `updated_at`) | Every item in the array has all specified keys |
| API-03   | Response array items do NOT contain internal fields (`lower_name`, `shard_id`, `search_vector`, `user_id`, `org_id`, `fork_id`, `template_id`, `mirror_destination`, `workspace_idle_timeout_secs`, `workspace_persistence`, `workspace_dependencies`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, `next_landing_number`) | None of the excluded keys are present |
| API-04   | Default pagination: no query params returns up to 30 repositories                     | Array length ≤ 30                                             |
| API-05   | `?per_page=5` returns at most 5 repositories                                         | Array length ≤ 5                                              |
| API-06   | `?per_page=50` (maximum valid) returns at most 50 repositories                        | Array length ≤ 50                                             |
| API-07   | `?per_page=51` (exceeds maximum) is clamped to 50                                     | Array length ≤ 50                                             |
| API-08   | `?per_page=100` (well above maximum) is clamped to 50                                 | Array length ≤ 50                                             |
| API-09   | `?page=1&per_page=1` returns exactly 1 repository when repositories exist             | Array length = 1                                              |
| API-10   | `?page=99999` (beyond last page) returns empty array with correct total               | Array length = 0, `X-Total-Count` > 0                        |
| API-11   | `?page=0` is treated as page 1                                                        | Same result as `?page=1`                                      |
| API-12   | `?page=-1` is treated as page 1                                                       | Same result as `?page=1`                                      |
| API-13   | `?per_page=0` uses default value of 30                                                | Array length ≤ 30                                             |
| API-14   | `?per_page=-5` uses default value of 30                                               | Array length ≤ 30                                             |
| API-15   | `?page=abc&per_page=xyz` (non-numeric) uses defaults                                  | Status 200, uses page=1 and per_page=30 defaults              |
| API-16   | `X-Total-Count` header value matches the actual total number of repositories          | Header value equals count from a separate count query         |
| API-17   | Repositories are ordered by `updated_at` descending, then `id` descending             | `items[i].updated_at >= items[i+1].updated_at` for all consecutive pairs |
| API-18   | Both public and private repositories are returned                                     | At least one `is_public: true` and one `is_public: false` item (when both exist) |
| API-19   | Paginating through all pages yields all repositories with no duplicates and no gaps    | Union of all pages = full repo set, no ID appears twice       |
| API-20   | Request without authentication returns 401                                            | Status 401, body contains "authentication required"           |
| API-21   | Request with valid non-admin token returns 401                                        | Status 401, body contains "admin access required"             |
| API-22   | Request with expired/invalid token returns 401                                        | Status 401                                                    |
| API-23   | Request with PAT having `read:admin` scope succeeds                                   | Status 200                                                    |
| API-24   | Request with PAT lacking admin scope is denied                                        | Status 401                                                    |
| API-25   | `created_at` and `updated_at` are valid ISO 8601 date strings                         | `new Date(field).toISOString()` does not throw                |
| API-26   | `archived_at` is null or a valid ISO 8601 date string                                 | Null or valid date parse                                      |
| API-27   | `owner` field is a resolved name string, not a numeric ID                             | `typeof owner === 'string'` and does not look like a number   |
| API-28   | `owner_type` field is either `"user"` or `"organization"`                              | Value is one of the two allowed strings                       |
| API-29   | `topics` field is an array of strings                                                 | `Array.isArray(topics)` and every element is a string         |
| API-30   | Archived repositories are included in the list with `is_archived: true`               | At least one archived repo appears when one exists            |
| API-31   | Numeric count fields (`num_stars`, `num_forks`, `num_watches`, `num_issues`, `num_closed_issues`) are numbers, not strings | `typeof field === 'number'` for each |

### CLI E2E Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| CLI-01   | `codeplane admin repo list` with admin token exits 0 and returns JSON array           | Exit code 0, stdout parses as JSON array                      |
| CLI-02   | `codeplane admin repo list --json` output is valid JSON                               | `JSON.parse(stdout)` succeeds                                 |
| CLI-03   | `codeplane admin repo list --page 1 --limit 5` returns ≤ 5 repositories              | Array length ≤ 5                                              |
| CLI-04   | `codeplane admin repo list --limit 50` (max valid) succeeds                           | Exit code 0, array length ≤ 50                                |
| CLI-05   | `codeplane admin repo list --limit 51` (exceeds max) is clamped to 50                 | Exit code 0, array length ≤ 50                                |
| CLI-06   | `codeplane admin repo list` with non-admin token fails                                | Exit code ≠ 0, stderr contains error message                  |
| CLI-07   | `codeplane admin repo list` without any token fails                                   | Exit code ≠ 0, stderr contains error message                  |
| CLI-08   | `codeplane admin repo list --page 99999` returns empty array                          | Exit code 0, array length = 0                                 |
| CLI-09   | Response items have expected shape (id, name, owner, owner_type, is_public, is_archived) | All required fields present in each item                    |
| CLI-10   | `--limit` parameter is correctly translated to `per_page` API parameter               | Verified via response size matching the limit                 |
| CLI-11   | `codeplane admin repo list` (no subcommand after `repo`) shows help or defaults to `list` | Predictable behavior, not a crash                          |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| UI-01    | Admin user navigates to `/admin/repos` and sees the repository table                  | Table element is visible with at least one row                |
| UI-02    | Table columns include Name, Owner, Visibility, Status, Stars, Issues, Updated         | All column headers are visible                                |
| UI-03    | Total repository count is displayed in the page header                                | Header subtitle text matches "N repositories" pattern         |
| UI-04    | Pagination controls are visible when total repos exceed per-page count                | Previous/Next buttons and page indicator are rendered         |
| UI-05    | Clicking "Next" page loads the next set of repositories                               | Table rows change, page indicator increments                  |
| UI-06    | Changing per-page selector updates the number of visible rows                         | Row count matches the selected per-page value                 |
| UI-07    | URL query string reflects current page and per_page                                   | `window.location.search` contains `page=` and `per_page=`    |
| UI-08    | Navigating directly to `/admin/repos?page=2&per_page=10` loads correct page           | Table shows expected offset of repositories                   |
| UI-09    | Non-admin user navigating to `/admin/repos` sees an access denied message or redirect | Error message or redirect to home/login                       |
| UI-10    | Loading state shows skeleton rows before data arrives                                 | Skeleton elements visible during network request              |
| UI-11    | Network error displays inline error banner with retry button                          | Error banner visible, retry button triggers new request       |
| UI-12    | Clicking a repository name in the table navigates to the repository overview page     | URL changes to `/:owner/:repo` route                          |
| UI-13    | Clicking an owner name navigates to the user profile or organization page             | URL changes to `/:owner` route                                |
| UI-14    | Visibility badge shows "Public" or "Private" correctly                                | Badge text matches `is_public` value                          |
| UI-15    | Archived repositories show an "Archived" status badge                                 | Badge visible for repos with `is_archived: true`              |
| UI-16    | Fork repositories show a "Fork" status badge                                          | Badge visible for repos with `is_fork: true`                  |
| UI-17    | Empty state is shown when no repositories exist                                       | "No repositories found" message displayed                     |
| UI-18    | Updated column shows relative time (e.g., "3 days ago") with full-date tooltip        | Relative text visible, tooltip shows ISO date on hover        |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                      | Expected Result                                               |
|----------|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| CC-01    | API response for page 1 with per_page=10 returns the same repo IDs as CLI with --page 1 --limit 10 | ID sets are identical |
| CC-02    | `X-Total-Count` from API matches the total displayed in the web UI header             | Values are equal                                              |
| CC-03    | Ordering of repositories is identical between API and CLI for the same page/limit     | IDs appear in the same order                                  |

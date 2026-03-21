# USER_ORGANIZATION_LIST

Specification for USER_ORGANIZATION_LIST.

## High-Level User POV

When you sign in to Codeplane and want to see which organizations you belong to, you can pull up a list of all your organizations from the settings sidebar, the CLI, or the TUI. This organization list is your personal directory of every team and group you are a part of on the platform.

The list shows each organization's name, description, visibility level, website, and location. Whether you are an owner or a regular member, every organization you have been added to appears in this list. The list is paginated so that users who belong to many organizations can browse through them comfortably without everything loading at once.

From the CLI, running `codeplane org list` gives you the same information as structured JSON, making it easy to script organization lookups, pipe results into other tools, or quickly check your memberships from the terminal. The TUI provides a similar browsable view in a terminal-friendly layout.

This feature is strictly personal — it shows only organizations that you, the authenticated user, are a member of. You cannot use this endpoint to see another user's organization memberships. It requires authentication; anonymous visitors cannot access it. The list never exposes organizations you are not a member of, and it does not reveal internal details like member counts or billing status.

The organization list is the starting point for navigating into any organization you belong to — from there you can view repos, manage teams, adjust settings, or switch organizational context. It is a companion to your personal profile and repository list, together forming your complete presence on Codeplane.

## Acceptance Criteria

### Definition of Done

The feature is complete when any authenticated user can retrieve a paginated list of the organizations they are a member of, receiving consistent results across API, CLI, and TUI. Only organizations where the user holds an active membership are returned. Pagination, empty states, error handling, and response shape are consistent across all surfaces. Unauthenticated requests are rejected with a 401 status.

### Functional Constraints

- [ ] The endpoint requires authentication. Unauthenticated requests return `401` with `"authentication required"`.
- [ ] The endpoint returns only organizations where the authenticated user has an active `org_members` record.
- [ ] Each item in the response includes exactly these fields: `id`, `name`, `description`, `visibility`, `website`, `location`.
- [ ] The response never includes internal organization fields such as `lower_name`, `created_at`, `updated_at`, member counts, billing info, or team details.
- [ ] Organizations are ordered by `id` ascending (creation order).
- [ ] Default page size is 30 items.
- [ ] Maximum page size is 100 items. Requests for a page size exceeding 100 must be clamped to 100 (not rejected).
- [ ] The response includes an `X-Total-Count` header containing the total number of organizations the user belongs to.
- [ ] The response includes standard `Link` pagination headers (`rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`) when applicable.
- [ ] If the user belongs to zero organizations, the endpoint returns `200` with an empty array `[]` and `X-Total-Count: 0`.
- [ ] Pagination beyond the last page returns `200` with an empty array (not 404).
- [ ] Both legacy pagination (`?page=N&per_page=M`) and cursor-based pagination (`?cursor=N&limit=M`) must work.
- [ ] The `visibility` field is always one of `"public"`, `"limited"`, or `"private"`.
- [ ] The endpoint supports PAT-based authentication in addition to session cookies.

### Boundary Constraints

- [ ] **Organization name in response:** 1–39 characters, `[a-zA-Z0-9-]`. May not start or end with a hyphen. May not contain consecutive hyphens.
- [ ] **Organization description in response:** 0–2048 characters. May contain Unicode.
- [ ] **`website` in response:** 0–255 characters. May be an empty string if not set.
- [ ] **`location` in response:** 0–255 characters. May be an empty string if not set. May contain Unicode.
- [ ] **`visibility` in response:** Exactly one of `"public"`, `"limited"`, or `"private"`.
- [ ] **`id` in response:** Positive integer.
- [ ] **`page` parameter:** Positive integer ≥ 1. Values ≤ 0 must be normalized to 1.
- [ ] **`per_page` / `limit` parameter:** Integer 1–100. Values > 100 must be clamped to 100. Values ≤ 0 must default to 30.
- [ ] **`cursor` parameter:** String-encoded non-negative integer offset. Non-numeric cursor values must return 400 or be treated as offset 0.

### Edge Cases

- [ ] A user who belongs to exactly one organization returns an array of length 1.
- [ ] A user who belongs to 101 organizations returns exactly 30 on the first page (default) and appropriate pagination headers.
- [ ] Requesting `?page=2&per_page=100` when there are 50 total orgs returns an empty array with `X-Total-Count: 50`.
- [ ] Requesting `?per_page=0` uses the default (30), not zero.
- [ ] Requesting `?per_page=-1` uses the default (30).
- [ ] Requesting `?per_page=200` clamps to 100.
- [ ] Requesting `?page=0` normalizes to page 1.
- [ ] An organization with an empty description returns `description: ""`.
- [ ] An organization with an empty website returns `website: ""`.
- [ ] An organization with an empty location returns `location: ""`.
- [ ] An organization with a description containing emoji, CJK, or accented characters returns with correct encoding.
- [ ] Two rapid consecutive identical requests return identical results (idempotency).
- [ ] An expired or revoked PAT returns `401` (not `200` with an empty list).
- [ ] A user who was removed from an organization no longer sees that organization in their list (eventually consistent).
- [ ] A user who is added to an organization sees it appear in their list on the next request.
- [ ] Organizations with `visibility: "private"` still appear in the user's own list (the user is a member).

## Design

### API Shape

#### `GET /api/user/orgs`

**Description:** Retrieve a paginated list of organizations the authenticated user belongs to.

**Authentication:** Required. Session cookie or PAT `Authorization` header.

**Query parameters (legacy pagination):**

| Parameter | Type | Default | Description |
|-----------|--------|---------|--------------------------------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 30 | Items per page (max 100) |

**Query parameters (cursor pagination):**

| Parameter | Type | Default | Description |
|-----------|--------|---------|--------------------------------------|
| `cursor` | string | `"0"` | String-encoded offset |
| `limit` | integer | 30 | Items per page (max 100) |

**Success response — `200 OK`:**

```json
[
  {
    "id": 1,
    "name": "acme-corp",
    "description": "Acme Corporation engineering team",
    "visibility": "public",
    "website": "https://acme.example.com",
    "location": "San Francisco, CA"
  },
  {
    "id": 5,
    "name": "open-source-guild",
    "description": "",
    "visibility": "limited",
    "website": "",
    "location": ""
  }
]
```

**Response headers:**

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Total-Count` | Total number of organizations the user belongs to |
| `Link` | Standard pagination `Link` header with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable |

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `401 Unauthorized` | No valid session or token | `{ "message": "authentication required" }` |
| `400 Bad Request` | Invalid pagination parameters | `{ "message": "invalid pagination parameters" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `UserService` exposes:

```typescript
listAuthenticatedUserOrgs(
  userID: number,
  page: number,
  perPage: number
): Promise<Result<OrgListResult, APIError>>
```

Where:

```typescript
interface OrgSummary {
  id: number;
  name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
}

interface OrgListResult {
  items: OrgSummary[];
  total_count: number;
  page: number;
  per_page: number;
}
```

The method:
1. Normalizes pagination parameters (clamp page ≥ 1, clamp perPage to 1–100, default 30).
2. Counts total organizations for the user via `countUserOrgs`.
3. Lists organizations for the user via `listUserOrgs` with `ORDER BY o.id ASC` and LIMIT/OFFSET.
4. Maps each database row to `OrgSummary`, selecting only the six safe fields.
5. Returns `OrgListResult` with `items`, `total_count`, `page`, and `per_page`.

### CLI Command

#### `codeplane org list`

**Description:** List organizations for the authenticated user.

**Authentication:** Required. Uses the stored CLI session token.

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--limit` | number | 30 | Number of results per page |
| `--page` | number | 1 | Page number |

**Output (human-readable, default):**

```
Name               Visibility  Description
acme-corp          public      Acme Corporation engineering team
open-source-guild  limited
```

**Output (JSON, with `--json`):**

```json
[
  {
    "id": 1,
    "name": "acme-corp",
    "description": "Acme Corporation engineering team",
    "visibility": "public",
    "website": "https://acme.example.com",
    "location": "San Francisco, CA"
  }
]
```

**Empty state:** When the user belongs to no organizations, human-readable output shows `"No organizations found"`.

**Error behavior:**
- Running `codeplane org list` without being authenticated → non-zero exit code, stderr: `Error: authentication required`

### TUI UI

The TUI should include an organizations view accessible from the dashboard or sidebar:

```
┌── My Organizations ─────────────────────────────────────────┐
│                                                              │
│  🏢  acme-corp                                  public       │
│      Acme Corporation engineering team                       │
│      San Francisco, CA                                       │
│                                                              │
│  🏢  open-source-guild                          limited      │
│                                                              │
│                                                              │
│  Page 1 of 2  ← →                                           │
└──────────────────────────────────────────────────────────────┘
```

- Each organization card shows: name (bold), visibility badge, description (dimmed, single-line truncated if long), and location (if set).
- Pressing Enter on an organization navigates to organization detail view.
- Left/right arrow keys or `[` / `]` navigate pages.
- Empty state: `"You don't belong to any organizations yet."`

### Web UI Design

The web UI displays the user's organization memberships in the user settings sidebar and as a section on the user's own dashboard/profile.

**Settings sidebar:**
- An "Organizations" link in the settings navigation takes the user to a list of their organization memberships.

**Organization list page:**
- Each organization card displays:
  - **Organization name** as a link to `/:orgname` (bold, colored).
  - **Visibility badge** (public/limited/private) with color-coded pill.
  - **Description** (one or two lines, truncated with ellipsis if needed). Omitted if empty.
  - **Website** as a clickable external link (if set).
  - **Location** with a map pin icon (if set).
- Pagination controls below the list with page numbers and prev/next buttons.
- Empty state: `"You're not a member of any organizations yet. Create one to get started."` with a "Create organization" button.

### Documentation

The following end-user documentation should be written:

1. **API Reference — List User Organizations:** Document `GET /api/user/orgs` with request/response examples, pagination headers, error codes, and field descriptions. Include notes on both legacy and cursor pagination styles. Note that the endpoint requires authentication.
2. **CLI Reference — `codeplane org list`:** Document the command with output examples in both human-readable and JSON formats. Document pagination options. Document error behavior for unauthenticated sessions.
3. **User Guide — Managing Organizations:** A short guide explaining how to view your organization memberships from the web UI, CLI, and TUI. Include tips on using pagination for users with many memberships and links to organization creation docs.

## Permissions & Security

### Authorization Model

| Role | Can list their own organizations? |
|------|----------------------------------|
| Anonymous (unauthenticated) | ❌ No — returns 401 |
| Authenticated user | ✅ Yes — sees only orgs they belong to |
| PAT-authenticated caller | ✅ Yes — sees only orgs the token owner belongs to |
| Admin | ✅ Yes — sees only orgs they personally belong to (admin does not grant cross-user visibility via this endpoint) |

This endpoint is strictly scoped to the authenticated user's own memberships. It never returns organizations for other users. To list all organizations on the instance, admins must use the separate admin API surface.

### Rate Limiting

- **Authenticated callers:** 300 requests per minute per token/session.
- **Rate limit response:** `429 Too Many Requests` with `Retry-After` header indicating seconds until reset.
- Rate limiting is enforced at the middleware layer, shared with other user-scoped endpoints.
- Since this endpoint requires authentication, anonymous rate limits do not apply.

### Data Privacy Constraints

- **Membership-scoped:** The SQL query joins on `org_members` filtered by the authenticated user's ID. There is no code path that could expose organizations the user is not a member of.
- **No internal fields exposed:** The `OrgSummary` mapping explicitly selects only six fields: `id`, `name`, `description`, `visibility`, `website`, `location`. Internal fields such as `lower_name`, `created_at`, `updated_at`, member counts, billing info, and team details are never included in the response.
- **No cross-user visibility:** The endpoint does not accept a username parameter. It always resolves the authenticated user's own memberships. One user cannot enumerate another user's organization memberships.
- **No PII exposure:** The response contains organization-level metadata only. No user email addresses, member lists, or invitation details are included.
- **Token scope:** PATs used to call this endpoint should have the `read:org` scope (or equivalent). If scoped tokens are enforced, a token without the appropriate scope must receive a `403`.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `UserOrgListViewed` | On successful 200 response from `GET /api/user/orgs` | `user_id`, `client` (web/cli/tui/api/desktop/vscode/neovim), `response_time_ms`, `result_count`, `total_count`, `page`, `per_page` |
| `UserOrgListEmpty` | On successful 200 response with zero results and page 1 | `user_id`, `client` |
| `UserOrgListPaginated` | On successful 200 response with page > 1 | `user_id`, `client`, `page`, `per_page`, `total_count` |
| `UserOrgListUnauthorized` | On 401 response | `client`, `client_ip` (hashed), `auth_method_attempted` (cookie/pat/none) |

### Event Properties

- `user_id` (number): The authenticated user's ID.
- `client` (string enum): One of `"web"`, `"cli"`, `"tui"`, `"api"`, `"desktop"`, `"vscode"`, `"neovim"`.
- `response_time_ms` (number): Server-side response latency in milliseconds.
- `result_count` (number): Number of items returned in this page.
- `total_count` (number): Total number of organizations the user belongs to.
- `page` (number): Current page number.
- `per_page` (number): Page size used.
- `client_ip` (string): Hashed IP address for 401 analysis (never stored as raw IP).
- `auth_method_attempted` (string enum): One of `"cookie"`, `"pat"`, `"none"`.

### Funnel Metrics and Success Indicators

- **Org list view volume:** Total `UserOrgListViewed` events per day, segmented by client. Indicates feature adoption and whether users actively check their org memberships.
- **Empty membership rate:** Ratio of `UserOrgListEmpty` to total `UserOrgListViewed` on page 1. A high rate (> 50%) may indicate that many users are not yet part of any organization, signaling an onboarding opportunity.
- **Pagination depth:** Distribution of `page` values from `UserOrgListPaginated` events. A heavy tail suggests power users with many org memberships.
- **Org list → Org detail click-through rate (web only):** Percentage of `UserOrgListViewed` events followed by an organization detail view event within the same session. Primary indicator of list utility.
- **CLI vs web split:** Client distribution. Tracks adoption of `codeplane org list` versus the web UI.
- **Unauthorized attempt rate:** Volume of `UserOrgListUnauthorized` events. Sustained spikes warrant investigation of broken auth flows or credential expiry patterns.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Condition |
|-----------|-------|-------------------|----------|
| Org list request received | `DEBUG` | `user_id`, `request_id`, `page`, `per_page` | Every authenticated request |
| Org list succeeded | `INFO` | `user_id`, `request_id`, `duration_ms`, `result_count`, `total_count` | 200 response |
| Org list unauthorized | `WARN` | `request_id`, `client_ip`, `auth_method_attempted` | 401 response |
| Org list bad request | `WARN` | `request_id`, `user_id`, `reason` | 400 response |
| Org list internal error | `ERROR` | `user_id`, `request_id`, `error_message`, `stack_trace` | 500 response |
| Rate limit exceeded on org list endpoint | `WARN` | `user_id`, `request_id`, `rate_limit_bucket` | 429 response |
| Pagination clamped | `DEBUG` | `user_id`, `request_id`, `requested_per_page`, `clamped_per_page` | When per_page > 100 is clamped |
| Pagination page normalized | `DEBUG` | `user_id`, `request_id`, `requested_page`, `normalized_page` | When page ≤ 0 is normalized to 1 |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_org_list_requests_total` | Counter | `status` (200, 400, 401, 429, 500), `client` | Total user org list requests |
| `codeplane_user_org_list_request_duration_seconds` | Histogram | `status` | Response latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_user_org_list_result_count` | Histogram | — | Distribution of result counts per page (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_user_org_list_total_count` | Histogram | — | Distribution of total org membership counts per user queried (buckets: 0, 1, 2, 5, 10, 25, 50, 100) |
| `codeplane_user_org_list_unauthorized_total` | Counter | `auth_method_attempted` | Total 401s on org list requests |

### Alerts

#### Alert: Org List Endpoint Elevated Latency

**Condition:** `histogram_quantile(0.99, rate(codeplane_user_org_list_request_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database connection pool health via `SELECT count(*) FROM pg_stat_activity;`.
2. Check if slow queries exist via `pg_stat_statements` for `listUserOrgs` and `countUserOrgs` queries.
3. Verify the `org_members.user_id` column has an index. Run `EXPLAIN ANALYZE` on the listing query with a known user_id.
4. Check if a user with an unusually large number of org memberships is being queried repeatedly, causing large OFFSET scans.
5. Check if the server is under memory pressure or CPU contention from concurrent requests.
6. If the problem is OFFSET-based pagination degradation for deep pages: consider adding keyset pagination using `(id)` as the cursor key.

#### Alert: Org List Endpoint 5xx Spike

**Condition:** `rate(codeplane_user_org_list_requests_total{status="500"}[5m]) > 0.1` sustained for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server error logs for stack traces associated with the user org list route (`GET /api/user/orgs`).
2. Common causes: database connection failure, `OrgSummary` mapping error (e.g., unexpected null field), pagination arithmetic overflow.
3. Verify database connectivity: attempt a direct SQL query against `organizations`.
4. Check for recent deployments. If the 5xx spike correlates with a deploy, consider rolling back.
5. If the error is in the mapping function: check if a database migration changed the `organizations` row shape without updating the TypeScript mapper.
6. Verify the `org_members` join is still valid — check for schema changes to the `org_members` table.

#### Alert: Elevated Unauthorized Rate on Org List

**Condition:** `rate(codeplane_user_org_list_unauthorized_total[5m]) > 5` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a deployment broke session or PAT validation middleware.
2. Query recent `UserOrgListUnauthorized` events to understand the distribution of `auth_method_attempted`. If all are `"cookie"`, check session storage health. If all are `"pat"`, check PAT validation logic.
3. Check if an external integration or CI system is making unauthenticated calls to this endpoint by mistake.
4. If from a single IP block: check for credential stuffing or brute-force patterns. Consider escalating rate limiting.
5. Verify that auth middleware is correctly loaded and running before the org list route handler.

#### Alert: Abnormal Empty Org List Rate

**Condition:** `rate(codeplane_user_org_list_result_count_bucket{le="0"}[15m]) / rate(codeplane_user_org_list_requests_total{status="200"}[15m]) > 0.9` sustained for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Verify the `org_members` table has data. Run `SELECT COUNT(*) FROM org_members;`.
2. Check if a migration or bulk operation accidentally deleted org membership rows.
3. Verify the `countUserOrgs` query is functioning: test manually with a known user_id that should have memberships.
4. If this is a data issue: restore from backup or investigate the deletion. If this is a query bug: check the SQL or user_id resolution logic.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | User-Visible Error |
|---|---|---|
| No auth cookie or PAT provided | 401 Unauthorized | `"authentication required"` |
| Expired or revoked PAT | 401 Unauthorized | `"authentication required"` |
| Database connection lost | 500 Internal Server Error | `"internal server error"` |
| `OrgSummary` mapping receives null field | 500 (should not happen if DB schema is correct) | `"internal server error"` |
| `per_page` set to extremely large value | Clamped to 100, 200 response | Normal paginated response |
| Negative page number | Normalized to page 1, 200 response | Normal first-page response |
| Non-numeric cursor value | 400 Bad Request | `"invalid pagination parameters"` |
| Concurrent membership removal during request | Stale count possible; org may be missing from page | Normal response (eventually consistent) |
| Concurrent membership addition during request | May not appear until next request | Normal response (eventually consistent) |
| Rate limit exceeded | 429 | `"rate limit exceeded"` with `Retry-After` header |
| OFFSET exceeds total rows | Empty array returned, 200 | Empty result set |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `GET /api/user/orgs returns 200 with correct shape` | Authenticate as a user who belongs to at least one org. Request their org list. Assert 200 and each item has exactly the 6 required fields (`id`, `name`, `description`, `visibility`, `website`, `location`). |
| 2 | `GET /api/user/orgs returns only member orgs` | Create user A who is a member of org X but not org Y. Request org list as user A. Assert response contains org X and does not contain org Y. |
| 3 | `GET /api/user/orgs returns orgs ordered by id ascending` | Create user who is a member of 3 orgs. Request org list. Assert items are sorted by `id` ascending. |
| 4 | `GET /api/user/orgs excludes internal fields` | Assert response items do NOT contain `lower_name`, `created_at`, `updated_at`, or any field beyond the 6 specified. |
| 5 | `GET /api/user/orgs without authentication returns 401` | Request org list with no auth header or cookie. Assert 401 with body `{ "message": "authentication required" }`. |
| 6 | `GET /api/user/orgs with expired PAT returns 401` | Create a PAT, revoke it, request org list. Assert 401. |
| 7 | `GET /api/user/orgs returns empty array for user with no orgs` | Create a user with no org memberships. Request their org list. Assert 200, body is `[]`, `X-Total-Count: 0`. |
| 8 | `GET /api/user/orgs default pagination is 30` | Create a user who is a member of 35 orgs. Request without pagination params. Assert response has exactly 30 items and `X-Total-Count: 35`. |
| 9 | `GET /api/user/orgs respects per_page` | Request with `?per_page=5`. Assert response has exactly 5 items. |
| 10 | `GET /api/user/orgs clamps per_page to 100` | Create a user who is a member of 105 orgs. Request with `?per_page=200`. Assert response has exactly 100 items. |
| 11 | `GET /api/user/orgs page 2 returns next set` | Create user who is a member of 35 orgs. Request `?page=1&per_page=20` and `?page=2&per_page=20`. Assert page 1 has 20 items, page 2 has 15 items, no overlap in IDs. |
| 12 | `GET /api/user/orgs page beyond last returns empty` | Create user who is a member of 5 orgs. Request `?page=2&per_page=30`. Assert 200 with empty array. |
| 13 | `GET /api/user/orgs cursor pagination works` | Request with `?cursor=0&limit=10`, then `?cursor=10&limit=10`. Assert no overlap and correct offset behavior. |
| 14 | `GET /api/user/orgs X-Total-Count header is correct` | Create user who is a member of 7 orgs. Assert `X-Total-Count` header equals `7`. |
| 15 | `GET /api/user/orgs Link header contains pagination links` | Create user who is a member of 50 orgs. Request `?page=2&per_page=10`. Assert `Link` header contains `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`. |
| 16 | `GET /api/user/orgs works with PAT authentication` | Request org list with a valid PAT. Assert 200 and same content as session-authenticated request. |
| 17 | `GET /api/user/orgs visibility field is valid` | Assert every item's `visibility` is one of `"public"`, `"limited"`, `"private"`. |
| 18 | `GET /api/user/orgs id is a number not a string` | Assert `typeof item.id === "number"` for each item. |
| 19 | `GET /api/user/orgs per_page=0 defaults to 30` | Request with `?per_page=0`. Assert response has up to 30 items. |
| 20 | `GET /api/user/orgs page=0 normalizes to page 1` | Request with `?page=0`. Assert response is the same as `?page=1`. |
| 21 | `GET /api/user/orgs description with Unicode` | Create org with description `"📦 测试 éàü"`. Assert round-trip fidelity in the response. |
| 22 | `GET /api/user/orgs location with Unicode` | Create org with location `"東京, 日本"`. Assert round-trip fidelity in the response. |
| 23 | `GET /api/user/orgs with max per_page=100 and exactly 100 orgs` | Create user who is a member of exactly 100 orgs. Request with `?per_page=100`. Assert response has exactly 100 items. |
| 24 | `GET /api/user/orgs with per_page=101 clamps to 100` | Request with `?per_page=101`. Assert response has at most 100 items (clamped, not rejected). |
| 25 | `GET /api/user/orgs response Content-Type is application/json` | Assert `Content-Type` header is `application/json`. |
| 26 | `GET /api/user/orgs idempotency` | Make the same request twice rapidly. Assert both return identical 200 responses. |
| 27 | `GET /api/user/orgs private orgs appear for members` | Create user who is a member of a `"private"` visibility org. Assert the org appears in their list. |
| 28 | `GET /api/user/orgs does not include non-member orgs` | Create 3 orgs, add user to only 2 of them. Assert response contains exactly 2 items. |
| 29 | `GET /api/user/orgs reflects membership changes` | Remove user from an org, request list again. Assert the org no longer appears. |
| 30 | `GET /api/user/orgs per_page=-1 defaults to 30` | Request with `?per_page=-1`. Assert response has up to 30 items. |
| 31 | `GET /api/user/orgs with empty description org` | Create org with empty description. Assert `description: ""` in response. |
| 32 | `GET /api/user/orgs with empty website org` | Create org with no website set. Assert `website: ""` in response. |
| 33 | `GET /api/user/orgs with empty location org` | Create org with no location set. Assert `location: ""` in response. |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 34 | `codeplane org list returns authenticated user orgs` | Run `codeplane org list --json`, assert exit code 0, assert array contains at least the seeded org (e.g., `acme`). |
| 35 | `codeplane org list --json output has correct fields` | Parse stdout as JSON array. Assert each item has `id`, `name`, `description`, `visibility`, `website`, `location`. |
| 36 | `codeplane org list without auth returns error` | Run `codeplane org list` without a stored session. Assert non-zero exit code and stderr contains `"authentication required"`. |
| 37 | `codeplane org list human-readable shows table` | Run without `--json`, assert stdout contains `Name`, `Visibility`, `Description` headers (or comparable table format). |
| 38 | `codeplane org list with no org memberships shows empty` | Authenticate as a user with no org memberships. Run `codeplane org list`. Assert exit code 0 and human-readable output contains `"No organizations found"`. |
| 39 | `codeplane org list --limit 5 respects limit` | Run with `--limit 5 --json`. Assert array length ≤ 5. |
| 40 | `codeplane org list --page 2 respects pagination` | Create user with > 30 org memberships. Run with `--page 2 --json`. Assert array is non-empty and different from page 1. |
| 41 | `codeplane org list reflects new membership` | Create an org and add the user. Run `codeplane org list --json`. Assert the new org appears in the list. |

### Web UI E2E Tests (Playwright)

| # | Test Name | Description |
|---|-----------|-------------|
| 42 | `Settings org list page renders` | Navigate to the user settings organizations page while authenticated. Assert the page loads and shows organization cards or an empty state. |
| 43 | `Settings org list shows correct org count` | Authenticate as a user with known org memberships. Assert the visible items match the expected count. |
| 44 | `Settings org list card displays name, visibility, and description` | Assert at least one org card contains name, visibility badge, and description. |
| 45 | `Settings org list org name links to org page` | Click on an org name. Assert navigation to `/:orgname`. |
| 46 | `Settings org list shows empty state for user with no orgs` | Navigate as a user with no org memberships. Assert empty state message is visible. |
| 47 | `Settings org list pagination works` | Authenticate as a user with > 30 org memberships. Assert pagination controls are visible. Click "Next". Assert new orgs load. |
| 48 | `Settings org list requires authentication` | Navigate to the org list page while unauthenticated. Assert redirect to login or 401 error. |
| 49 | `Settings org list shows private orgs for members` | Authenticate as a user who is a member of a private org. Assert the private org appears in the list with a "private" visibility badge. |

### TUI Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 50 | `TUI org list screen renders for authenticated user` | Navigate to organizations screen in TUI. Assert screen contains org names and visibility badges. |
| 51 | `TUI org list screen shows empty state` | Authenticate as user with no org memberships. Navigate to org list. Assert empty state message. |
| 52 | `TUI org list screen pagination` | Authenticate as user with many org memberships. Assert pagination indicators and navigation work. |
| 53 | `TUI org list screen Enter navigates to org detail` | Navigate to org list, press Enter on an org. Assert navigation to org detail screen. |

### Rate Limiting Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 54 | `Org list endpoint returns 429 after rate limit exceeded` | Send 301 authenticated requests in rapid succession from same session. Assert 429 on the 301st request. |
| 55 | `Org list endpoint returns Retry-After header on 429` | Assert `Retry-After` header is present and contains a positive integer. |
| 56 | `Org list endpoint rejects unauthenticated requests before rate limiting` | Send unauthenticated request. Assert 401 (not 429), confirming auth check precedes rate limit check. |

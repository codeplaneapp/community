# ORG_REPOSITORY_LIST

Specification for ORG_REPOSITORY_LIST.

## High-Level User POV

When a user visits an organization on Codeplane, they need to see what repositories the organization owns. The organization repository list is the primary surface for answering: "What code does this organization maintain?"

Anyone can visit a public organization and browse its public repositories without signing in. This makes the organization profile a useful discovery surface for open-source projects and community contributions. A visitor sees a paginated list of public repositories, each showing the name, a short description, whether the repository is public, and when it was last updated. Clicking any repository name takes the user directly into that repository's overview.

Organization members see more. When a signed-in user who belongs to the organization visits the same page, they see both the organization's public and private repositories. This gives members a complete picture of the organization's codebase — including internal tooling, proprietary projects, and pre-release work — without needing to search or remember individual repository URLs. The list is sorted by most recently updated first, so the projects with active development always appear at the top.

For organization owners and administrators, the repository list doubles as an inventory and audit surface. Before restructuring the organization, adjusting team access, or reviewing how many private repositories exist, an owner can scan the full repository list to understand the organization's footprint.

The repository list is a read-only surface. It does not create, delete, or modify repositories — those are separate operations. It simply retrieves and displays the current set of repositories belonging to an organization, consistently, regardless of whether the user accesses it from the web UI, CLI, TUI, or the API directly.

The list supports pagination so that organizations with hundreds of repositories remain fast and navigable. Response headers provide a total count and navigation links, making the surface equally useful for human browsing and programmatic consumption by scripts, integrations, and agents.

## Acceptance Criteria

- **Public org, unauthenticated access**: When an organization's visibility is `public`, unauthenticated users must be able to list repositories. The response must include only public repositories.
- **Public org, authenticated non-member**: An authenticated user who is not a member of a public organization must receive only public repositories in the response.
- **Public org, authenticated member**: An authenticated user who is a member (either `owner` or `member` role) of a public organization must receive all repositories — both public and private.
- **Non-public org, unauthenticated access**: When an organization's visibility is `limited` or `private`, unauthenticated users must receive a `403 Forbidden` response with message `"organization membership required"`.
- **Non-public org, authenticated non-member**: An authenticated user who is not a member of a `limited` or `private` organization must receive a `403 Forbidden` response.
- **Non-public org, authenticated member**: A member of a non-public organization must receive all repositories (public and private).
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return a `404 Not Found` response.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Response shape**: The response body must be a JSON array of repository objects. Each object must contain exactly these fields: `id` (number), `name` (string), `lower_name` (string), `owner` (string, set to the organization name), `description` (string), `is_public` (boolean), `created_at` (string, ISO 8601), `updated_at` (string, ISO 8601).
- **No data leakage**: The response must not include internal-only repository fields (e.g., `shard_id`, `search_vector`, `fork_id`, `template_id`, `mirror_destination`, `user_id`, `org_id`, `workspace_idle_timeout_secs`, `workspace_persistence`, `workspace_dependencies`, `landing_queue_mode`, `landing_queue_required_checks`). Only the defined Repository shape fields must be returned.
- **Ordering**: Repositories must be returned in descending order by `updated_at`, then by `id` descending as a tiebreaker. The most recently updated repositories appear first.
- **Pagination — page/per_page**: The endpoint must support `page` and `per_page` query parameters for page-based pagination.
- **Pagination — cursor/limit**: The endpoint must also support `cursor` and `limit` query parameters for cursor-based pagination. When cursor/limit are provided, they are converted to equivalent page/per_page values internally.
- **Pagination — defaults**: If no pagination parameters are provided, the endpoint must default to `page=1` and `per_page=30`.
- **Pagination — maximum per_page**: The `per_page` value must be clamped to a maximum of `100`. Values greater than 100 must be silently reduced to 100.
- **Pagination — minimum page**: The `page` value must be at least `1`. Values less than or equal to 0 must throw a `400 Bad Request` with message `"invalid page value"`.
- **Pagination — invalid page value**: A non-numeric `page` parameter must return `400 Bad Request` with message `"invalid page value"`.
- **Pagination — invalid per_page value**: A non-numeric `per_page` parameter must return `400 Bad Request` with message `"invalid per_page value"`.
- **Pagination headers**: The response must include an `X-Total-Count` header with the total number of visible repositories. For members, this is the total count of all org repos. For non-members on public orgs, this is the count of public org repos. The response must also include a `Link` header with `first`, `last`, `prev` (if applicable), and `next` (if applicable) pagination links.
- **Empty result**: If the organization has no visible repositories, the response must be an empty JSON array `[]` with `X-Total-Count: 0`.
- **Timestamps**: `created_at` and `updated_at` must be ISO 8601 formatted strings.
- **Content-Type**: Response must include `Content-Type: application/json` header.
- **Idempotent**: Repeated GET requests with the same pagination parameters for the same organization and viewer must return the same result (assuming no concurrent modifications).
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return `400 Bad Request` with message `"organization name is required"`.
- **Org name max length**: Organization names longer than 40 characters must return `404` (no org will match, enforced at creation time).
- **Special characters in names**: Organization name path parameters containing URL-encoded special characters (e.g., `%20`, `%2F`) must be decoded and trimmed before lookup. Only valid slug characters should match existing entities.
- **Page beyond results**: Requesting a `page` value beyond the last page of results must return an empty JSON array `[]` with correct `X-Total-Count` and pagination headers.
- **CLI consistency**: The CLI `org repo list --org <org>` command must output the same JSON array returned by the API.

### Definition of Done

- The `GET /api/orgs/:org/repos` route returns the correct paginated JSON array, splitting visibility-scoped results based on viewer membership.
- Pagination headers (`X-Total-Count`, `Link`) are set correctly for both member and non-member views.
- Non-members of non-public organizations are rejected with a `403` and appropriate error message.
- Organization name is resolved case-insensitively.
- CLI `org repo list` command works end-to-end and produces output structurally identical to the API response.
- All verification tests pass.
- Observability instrumentation is in place.
- Documentation for the API endpoint and CLI command is published.

## Design

### API Shape

**Endpoint**: `GET /api/orgs/:org/repos`

**Path Parameters**:
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |

**Query Parameters**:
| Parameter  | Type   | Required | Default | Description |
|------------|--------|----------|---------|-------------|
| `page`     | number | No       | 1       | Page number (1-indexed) |
| `per_page` | number | No       | 30      | Items per page (max 100) |
| `cursor`   | number | No       | —       | Cursor offset (alternative to page) |
| `limit`    | number | No       | 30      | Items per page when using cursor (max 100) |

When both `page`/`per_page` and `cursor`/`limit` are provided, `page`/`per_page` takes precedence.

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>` (optional — not required for public orgs)

**Response** (200 OK):
```json
[
  {
    "id": 42,
    "name": "api-server",
    "lower_name": "api-server",
    "owner": "acme-corp",
    "description": "Core API server",
    "is_public": true,
    "created_at": "2026-01-10T08:00:00.000Z",
    "updated_at": "2026-03-20T12:30:00.000Z"
  },
  {
    "id": 38,
    "name": "internal-tools",
    "lower_name": "internal-tools",
    "owner": "acme-corp",
    "description": "Internal tooling monorepo",
    "is_public": false,
    "created_at": "2025-11-15T09:00:00.000Z",
    "updated_at": "2026-03-19T14:00:00.000Z"
  }
]
```

**Response Headers**:
| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Total-Count` | Total number of visible repositories (all repos for members, public repos only for non-members) |
| `Link` | Pagination links with `rel="first"`, `rel="last"`, `rel="prev"` (if applicable), `rel="next"` (if applicable) |

**Error Responses**:
| Status | Condition | Error Message |
|--------|-----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 400    | Non-numeric `page` query parameter | `"invalid page value"` |
| 400    | Non-numeric `per_page` query parameter | `"invalid per_page value"` |
| 403    | Non-public org, viewer is unauthenticated or not a member | `"organization membership required"` |
| 404    | Organization does not exist | `"organization not found"` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async listOrgRepos(
  viewer: User | null,
  orgName: string,
  page: number,
  perPage: number,
): Promise<Result<{ items: Repository[]; total: number }, APIError>>
```

The service:
1. Resolves the organization by `lower_name` case-insensitively via `resolveOrg` — returns `404` if not found, `400` if empty.
2. Determines viewer membership — if `viewer` is non-null, checks `isOrgMember(org.id, viewer.id)`.
3. Enforces visibility rules — if the organization is not `public` and the viewer is not a member, returns `403`.
4. Normalizes pagination via `normalizePage(page, perPage)` — clamps `page >= 1`, `perPage` to `[1, 100]`, computes offset.
5. If viewer is a member: executes `listOrgRepos()` and `countOrgRepos()` queries to retrieve all repos (public + private).
6. If viewer is not a member (public org): executes `listPublicOrgRepos()` and `countPublicOrgRepos()` queries to retrieve only public repos.
7. Maps each database row to the `Repository` shape via `mapRepoWithOwner(orgName, row)`.
8. Returns `Result.ok({ items, total })`.

### CLI Command

**Status**: `Not yet implemented` — the CLI currently has no `org repo list` command. This specification requires one to be added.

```
codeplane org repo list --org <organization_name>
```

| Argument | Type   | Required | Description |
|----------|--------|----------|-------------|
| `--org`  | string | Yes      | Organization name |

**Output**: JSON array of repository objects, identical to the API response body. Supports `--json` field filtering.

**Exit codes**: `0` = success, `1` = API error (prints error message to stderr).

**Example**:
```
$ codeplane org repo list --org acme-corp
[
  {
    "id": 42,
    "name": "api-server",
    "lower_name": "api-server",
    "owner": "acme-corp",
    "description": "Core API server",
    "is_public": true,
    "created_at": "2026-01-10T08:00:00.000Z",
    "updated_at": "2026-03-20T12:30:00.000Z"
  }
]
```

**Example with field filtering**:
```
$ codeplane org repo list --org acme-corp --json name,is_public
[
  {
    "name": "api-server",
    "is_public": true
  }
]
```

### Web UI Design

**Status**: `Partial` — the organization profile page at `/:owner` is where this list will render. When the owner resolves to an organization, the default tab should be "Repositories".

- **Location**: The organization repository list is the default content of the organization profile page at `/:org`. It may also be accessible at `/:org/-/repos` as a direct URL.
- **Navigation**: Breadcrumb trail showing `Org Name > Repositories`.
- **Tab bar**: The organization profile page should include tab navigation with "Repositories" (default/active), "Members" (org members only), "Teams" (org members only), and "Settings" (owners only).
- **List view**:
  - Each row displays: repository name (as a clickable link to `/:org/:repo`), description (truncated to one line with ellipsis), visibility badge ("Public" green or "Private" amber), and last updated timestamp (relative format, e.g. "2 hours ago", with ISO tooltip on hover).
  - The repository name is the primary interactive element; clicking it navigates to the repository overview.
  - Repositories are ordered by most recently updated first, matching the API ordering.
- **Pagination**: A pagination control below the list showing page numbers, with 30 items per page by default. "Previous" and "Next" buttons with disabled state at boundaries.
- **Empty state**: If the organization has no visible repositories:
  - For anonymous/non-member visitors to a public org: "This organization has no public repositories yet."
  - For org members: "This organization has no repositories yet." With a CTA button for owners: "Create a repository."
- **Loading state**: A skeleton loader matching the list row layout while the API call is in flight.
- **Error state**: If the API returns an error, display an inline error message with a "Retry" button.
- **Private org access denied**: If a non-member visits a non-public org, show a centered "This organization is private" message with no repository data revealed.

### TUI UI

**Status**: `Partial` — the TUI has a dashboard and repositories screen but no dedicated org repo list. When implemented:

- Accessible from the organization detail screen by pressing `r` (repositories) or selecting the "Repositories" tab.
- Displays a scrollable list with columns: repository name, visibility (public/private icon), description (truncated), last updated.
- Key bindings: `Enter` to open the repository detail screen, `Esc` to go back to organization detail, `n`/`p` or arrow keys for pagination.
- Empty state: "No repositories in this organization."

### Documentation

- **API reference** (`/api-reference/orgs#list-organization-repositories`): Document `GET /api/orgs/:org/repos` — path parameters, query parameters, response shape, pagination headers, error codes, visibility-based access rules, and example `curl` invocations for both authenticated and unauthenticated use cases.
- **CLI reference** (`/cli-reference/commands#codeplane-org-repo-list`): Document the `org repo list` command, its arguments, example output, field filtering with `--json`, and exit codes.
- **Organizations guide** (`/guides/organizations`): Include a section on "Browsing organization repositories" explaining visibility rules (public vs. member view), with CLI, web UI, and `curl` examples.
- **API quick start**: Include an example of listing an organization's repos as part of the getting started guide for the API.

## Permissions & Security

### Authorization Roles

| Role | Can list org repos? | Visible repos | Notes |
|------|---------------------|---------------|-------|
| Organization Owner | ✅ Yes | All (public + private) | Full access |
| Organization Member | ✅ Yes | All (public + private) | Full read-only visibility |
| Authenticated non-member (public org) | ✅ Yes | Public only | Cannot see private repos |
| Authenticated non-member (non-public org) | ❌ No | None | 403 Forbidden |
| Unauthenticated / Anonymous (public org) | ✅ Yes | Public only | No auth required |
| Unauthenticated / Anonymous (non-public org) | ❌ No | None | 403 Forbidden |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required, as listing is a read-only paginated query with bounded result size (max 100 items per page).
- Since this endpoint allows unauthenticated access for public orgs, it is more exposed to abuse than authenticated-only endpoints. The platform rate limiter should apply IP-based throttling for anonymous requests.
- If enumeration abuse is detected (e.g., iterating through all org names), the platform rate limiter will throttle the caller.

### Data Privacy

- The response exposes repository names, descriptions, and visibility status. Repository names are not PII but may reveal proprietary project names to authenticated members.
- For non-members of public orgs, only public repository metadata is returned — no private repository names, descriptions, or existence are revealed.
- The `owner` field is set to the organization name, which is public metadata.
- Internal database details (`shard_id`, `search_vector`, `fork_id`, `template_id`, `mirror_destination`, `user_id`, `org_id`) are excluded from the response shape.
- No PII is returned in the response. Repository descriptions are free-text fields that could theoretically contain PII, but no server-side PII scanning is performed.
- The `X-Total-Count` header reveals the total number of visible repos. For non-members of public orgs this is only the count of public repos — it does not leak the count of private repos.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgReposListed` | A successful 200 response is returned for an org repo list request | `org_name`, `org_id`, `viewer_user_id` (null if anonymous), `viewer_is_member` (boolean), `page`, `per_page`, `result_count`, `total_count`, `client` (`api`, `cli`, `web`, `tui`) |
| `OrgRepoListFailed` | A 4xx or 5xx response is returned | `org_name_attempted`, `viewer_user_id` (if authenticated), `status_code`, `error_reason`, `client` |

### Funnel Metrics

- **Org repo list adoption rate**: Percentage of organization page views that render the repository tab. This should be the majority since it is the default tab.
- **Org repo list → repo navigation rate**: Percentage of org repo list views where the user subsequently navigates to one of the listed repositories. Indicates the list is a useful navigation surface, not a dead end.
- **Anonymous vs. authenticated usage split**: Ratio of unauthenticated to authenticated org repo list requests. High anonymous traffic on public orgs indicates community/discovery value.
- **Pagination depth**: Distribution of `page` values requested. Most requests should be page 1; high page depth suggests either organizations with very many repositories or enumeration behavior.
- **Client distribution**: Breakdown of org repo list requests by client surface (API, CLI, web, TUI).
- **Member vs. non-member view rate**: Ratio of member views (seeing all repos) to non-member views (seeing only public repos). Helps understand how the feature is used internally vs. externally.

### Success Indicators

- Org repo list API latency p50 < 30ms, p99 < 300ms.
- Error rate < 0.1% of requests (excluding expected 403/404 responses).
- Repo navigation rate from org repo list > 40% (users find and click into repos).
- At least 60% of active organizations have their repo list viewed at least once within 30 days.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Org repo list request received | `debug` | `org_name`, `viewer_user_id`, `viewer_is_member`, `page`, `per_page`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Non-public org access denied (403) | `info` | `org_name`, `viewer_user_id`, `request_id` |
| Empty org name parameter | `info` | `request_id` |
| Invalid pagination parameter | `info` | `org_name`, `raw_page`, `raw_per_page`, `request_id` |
| Org repo list query completed | `debug` | `org_name`, `org_id`, `viewer_is_member`, `result_count`, `total_count`, `query_duration_ms`, `request_id` |
| Unexpected error in org repo list | `error` | `org_name`, `viewer_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_repo_list_requests_total` | counter | `status_code`, `org_name`, `viewer_type` (`member`, `non_member`, `anonymous`) | Total org repo list requests |
| `codeplane_org_repo_list_duration_seconds` | histogram | `org_name`, `viewer_type` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_repo_list_errors_total` | counter | `error_type` (`forbidden`, `not_found`, `bad_request`, `internal`) | Error breakdown |
| `codeplane_org_repo_list_result_count` | histogram | `org_name`, `viewer_type` | Distribution of result set sizes per request (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |

### Alerts

#### Alert: `OrgRepoListHighErrorRate`
- **Condition**: `rate(codeplane_org_repo_list_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context containing `org_repo_list` or `listOrgRepos`.
  2. Verify database connectivity — run a basic query against the `repositories` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label on the counter).
  4. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.listOrgRepos` method.
  5. If the error involves the `resolveOrg` helper, verify that the `organizations` table has the expected index on `lower_name`.
  6. Check the `repositories` table query — verify that `repositories(org_id)` index is intact.
  7. Verify `countOrgRepos` and `countPublicOrgRepos` are not timing out by running EXPLAIN ANALYZE on the count queries.
  8. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgRepoListHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_repo_list_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific organization (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the `listOrgRepos` and `listPublicOrgRepos` queries with the affected org's ID to verify indexes on `repositories(org_id)` are being used.
  3. Check if a specific organization has an unusually large number of repositories (thousands).
  4. Check database connection pool utilization — a pool exhaustion issue would affect all endpoints.
  5. Inspect `pg_stat_user_tables` for sequential scan counts on the `repositories` table.
  6. Check for lock contention in `pg_locks` on the `repositories` table.
  7. If the `countOrgRepos` or `countPublicOrgRepos` queries are slow, verify an index on `repositories(org_id)` and `repositories(org_id, is_public)`.

#### Alert: `OrgRepoListAnonymousSpikeRate`
- **Condition**: `rate(codeplane_org_repo_list_requests_total{viewer_type="anonymous"}[5m]) > 10 * avg_over_time(rate(codeplane_org_repo_list_requests_total{viewer_type="anonymous"}[5m])[1h:5m])`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike is organic (e.g., a popular project linked from social media) or potential abuse/enumeration.
  2. Check if requests are concentrated on a single `org_name` or from a single source IP.
  3. If abuse is suspected, verify that IP-based rate limiting is functioning correctly for anonymous requests.
  4. Check pagination depth — repeated requests iterating through all pages may indicate data scraping or enumeration.
  5. No immediate action required for organic spikes, but monitor for cascading latency impact.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Query timeout on large org repositories list | 500 Internal Server Error | Check for missing indexes on `repositories(org_id)` |
| `repositories` table corrupted/missing | 500 Internal Server Error | Restore from backup; alert fires |
| `organizations` table corrupted/missing | 500 Internal Server Error | Restore from backup; alert fires |
| Concurrent org deletion during list | 404 Not Found (org disappeared between resolve and query) | Expected behavior; no recovery needed |
| Org membership revoked during request | May return member or non-member view depending on race timing | Expected behavior; eventual consistency |
| Concurrent repo deletion during list | Repo may or may not appear in results depending on timing | Expected behavior; eventual consistency |
| Concurrent repo creation during list | Repo may or may not appear depending on timing | Expected behavior; eventual consistency |
| NaN or malformed pagination parameters | 400 Bad Request | Expected behavior; log for monitoring |
| Extremely large `per_page` value (e.g., 999999) | Clamped to 100; returns at most 100 items | Expected behavior; no intervention needed |
| Negative `page` value | 400 Bad Request with `"invalid page value"` | Expected behavior; no intervention needed |

## Verification

### API Integration Tests — Response Shape

- **`test: returns 200 with array of repositories for org owner`** — Create a public org, create a repo in that org, call `GET /api/orgs/:org/repos` as org owner, assert 200 and response is an array containing the repo.
- **`test: returns 200 with array of repositories for org member`** — Create org, add a second user as org member, create repos, authenticate as member, call org repo list, assert 200 and all repos present.
- **`test: response is a JSON array`** — Get org repos, assert `Array.isArray(response)` is true.
- **`test: each repository object has exactly the expected fields`** — Get org repos, for each item assert keys are exactly: `id`, `name`, `lower_name`, `owner`, `description`, `is_public`, `created_at`, `updated_at`. Assert no additional keys exist.
- **`test: id is a positive number`** — Get org repos, assert `typeof item.id === 'number'` and `item.id > 0` for each item.
- **`test: name is a non-empty string`** — Get org repos, assert `typeof item.name === 'string'` and `item.name.length > 0` for each item.
- **`test: lower_name is lowercase form of name`** — Create repo "MyRepo" in org, list repos, assert `item.lower_name === "myrepo"`.
- **`test: owner is set to the organization name`** — Get org repos, assert `item.owner` equals the organization name for each item.
- **`test: description is a string`** — Get org repos, assert `typeof item.description === 'string'` for each item.
- **`test: is_public is a boolean`** — Get org repos, assert `typeof item.is_public === 'boolean'` for each item.
- **`test: created_at is valid ISO 8601 string`** — Get org repos, assert `new Date(item.created_at).toISOString()` does not throw for each item.
- **`test: updated_at is valid ISO 8601 string`** — Get org repos, assert `new Date(item.updated_at).toISOString()` does not throw for each item.
- **`test: Content-Type header is application/json`** — Get org repos, assert response header `Content-Type` contains `application/json`.
- **`test: empty array returned when org has no repos`** — Create org (no repos created), list repos as member, assert response is `[]`.
- **`test: X-Total-Count header is 0 for org with no repos`** — Create org with no repos, list as member, assert `X-Total-Count` header is `"0"`.

### API Integration Tests — Visibility

- **`test: unauthenticated user sees only public repos on public org`** — Create public org with 2 public repos and 1 private repo, call `GET /api/orgs/:org/repos` without auth, assert 200, assert only 2 repos returned, assert all returned repos have `is_public: true`.
- **`test: authenticated non-member sees only public repos on public org`** — Create public org with public and private repos, authenticate as non-member, list repos, assert only public repos returned.
- **`test: authenticated member sees all repos on public org`** — Create public org with public and private repos, authenticate as member, list repos, assert all repos returned (both public and private).
- **`test: X-Total-Count reflects visible count for non-member`** — Create public org with 3 public and 2 private repos, list as non-member, assert `X-Total-Count` is `"3"`.
- **`test: X-Total-Count reflects full count for member`** — Create public org with 3 public and 2 private repos, list as member, assert `X-Total-Count` is `"5"`.
- **`test: unauthenticated user gets 403 on private org`** — Create private org, call list repos without auth, assert 403 with message containing `"organization membership required"`.
- **`test: unauthenticated user gets 403 on limited org`** — Create limited-visibility org, call list repos without auth, assert 403.
- **`test: authenticated non-member gets 403 on private org`** — Create private org, authenticate as non-member, call list repos, assert 403.
- **`test: authenticated member sees all repos on private org`** — Create private org, add repos, authenticate as member, list repos, assert 200 with all repos.
- **`test: private repos are not leaked in non-member response`** — Create public org with private repo named "secret-project", list as non-member, assert no item has `name: "secret-project"`.

### API Integration Tests — Ordering

- **`test: results are ordered by updated_at descending`** — Create org with 3 repos, update them at known times (or in known order), list all, assert items are in descending `updated_at` order.
- **`test: repos with same updated_at are ordered by id descending`** — Create 3 repos in rapid succession (likely same updated_at), list all, assert IDs are in descending order for items sharing the same updated_at.
- **`test: most recently updated repo appears first`** — Create repo A first, then repo B. Update repo A after repo B. List repos. Assert repo A appears before repo B.

### Pagination Tests

- **`test: default pagination returns up to 30 items`** — Create org, add 35 repos, list without pagination params as member, assert exactly 30 items returned.
- **`test: per_page=10 returns 10 items`** — Add 15 repos, list with `per_page=10`, assert 10 items returned and `X-Total-Count` is `"15"`.
- **`test: page=2 with per_page=10 returns next batch`** — Add 15 repos, list page 1 and page 2 with `per_page=10`, assert page 1 has 10 items, page 2 has 5 items, and no overlap in IDs.
- **`test: per_page exceeding 100 is clamped to 100`** — Add 5 repos, list with `per_page=200`, assert request succeeds (returns 5 items) and behaves as if `per_page=100`.
- **`test: page=0 returns 400`** — List with `page=0`, assert 400 with message `"invalid page value"`.
- **`test: negative page returns 400`** — List with `page=-5`, assert 400 with message `"invalid page value"`.
- **`test: page beyond results returns empty array`** — Add 3 repos, list with `page=100&per_page=10`, assert empty array `[]` with `X-Total-Count: 3`.
- **`test: non-numeric page returns 400`** — List with `page=abc`, assert 400 with message `"invalid page value"`.
- **`test: non-numeric per_page returns 400`** — List with `per_page=xyz`, assert 400 with message `"invalid per_page value"`.
- **`test: per_page=100 (maximum valid) returns up to 100 items`** — Add 5 repos, list with `per_page=100`, assert all 5 returned.
- **`test: per_page=101 is clamped to 100 and succeeds`** — Add 5 repos, list with `per_page=101`, assert request succeeds.
- **`test: X-Total-Count header matches actual total`** — Add 3 repos, list with `per_page=2` as member, assert `X-Total-Count` is `"3"`.
- **`test: Link header is present with pagination links`** — Add 3 repos, list with `per_page=1`, assert `Link` header contains `rel="first"`, `rel="last"`, and `rel="next"`.
- **`test: Link header includes prev on page 2`** — Add 3 repos, list with `page=2&per_page=1`, assert `Link` header contains `rel="prev"`.
- **`test: Link header does not include prev on page 1`** — Add 3 repos, list with `page=1&per_page=1`, assert `Link` header does not contain `rel="prev"`.
- **`test: Link header does not include next on last page`** — Add 3 repos, list with `page=3&per_page=1`, assert `Link` header does not contain `rel="next"`.
- **`test: cursor-based pagination works`** — Add 5 repos, list with `cursor=0&limit=2`, assert 2 items returned. List with `cursor=2&limit=2`, assert 2 different items returned.
- **`test: per_page=1 returns exactly 1 item`** — Add 3 repos, list with `per_page=1`, assert exactly 1 item returned.

### Auth & Permission Tests

- **`test: returns 200 for unauthenticated request on public org`** — Create public org with a public repo, call endpoint with no session/token, assert 200.
- **`test: returns 403 for unauthenticated request on private org`** — Create private org, call endpoint with no session/token, assert 403.
- **`test: returns 403 for authenticated non-member on private org`** — Create private org, authenticate as a user who is NOT a member, call org repo list, assert 403.
- **`test: returns 404 for nonexistent organization`** — Call `GET /api/orgs/nonexistent-org-xyz/repos`, assert 404.
- **`test: returns 400 for empty org name`** — Call `GET /api/orgs/%20/repos`, assert 400 with message containing `"organization name is required"`.

### Case-Insensitivity Tests

- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", create a repo, call `GET /api/orgs/myorg/repos`, assert 200 with correct data.
- **`test: uppercase org name resolves correctly`** — Create org "testorg", call `GET /api/orgs/TESTORG/repos`, assert 200 with correct data.
- **`test: mixed case org name resolves correctly`** — Create org "TestOrg", call `GET /api/orgs/tEsToRg/repos`, assert 200.

### Edge Case Tests

- **`test: org name at maximum valid length (40 chars) resolves correctly`** — Create org with 40-character name, create repo, list repos, assert 200.
- **`test: org name exceeding 40 chars returns 404`** — Call with 41-character org name, assert 404.
- **`test: repo with empty description is returned correctly`** — Create repo with empty description, add to org, list, assert `item.description === ""`.
- **`test: repo with special characters in description is returned correctly`** — Create repo with description containing `<script>`, `"quotes"`, `\nnewlines`, unicode characters (e.g., emoji, CJK), list repos, assert description is returned verbatim.
- **`test: listing org repos does not modify any data`** — List repos, note all `updated_at` timestamps, wait 100ms, list again, assert all timestamps unchanged.
- **`test: response for same org and viewer is identical across consecutive requests`** — List org repos twice, assert responses are deeply equal.
- **`test: org repo list after creating a new repo includes the new repo`** — List repos, create a new repo in the org, list again, assert the new repo appears.
- **`test: org repo list after deleting a repo excludes the deleted repo`** — List repos (includes repo X), delete repo X, list again, assert repo X is gone.
- **`test: org repo list after making a private repo public shows it to non-members`** — Create private repo in public org, list as non-member (repo absent), make repo public, list as non-member again, assert repo now present.
- **`test: path-encoded null byte in org name returns 400 or 404`** — Call with `%00` in org name, assert 400 or 404.
- **`test: path-encoded slash in org name returns 400 or 404`** — Call with `%2F` in org name, assert 400 or 404.
- **`test: org with 100 repos returns all on per_page=100`** — Create org with exactly 100 repos, list with `per_page=100`, assert exactly 100 items returned.
- **`test: org with 101 repos returns 100 on per_page=100 and 1 on page 2`** — Create org with 101 repos, list page 1 with `per_page=100`, assert 100 items. List page 2, assert 1 item.

### CLI E2E Tests

- **`test: codeplane org repo list --org <org> returns JSON array`** — Create org, create repo, run `org repo list --org <org>`, parse JSON output, assert it is an array containing the repo.
- **`test: CLI output contains repositories with expected fields`** — Run `org repo list`, parse JSON, for each item assert keys include `id`, `name`, `lower_name`, `owner`, `description`, `is_public`, `created_at`, `updated_at`.
- **`test: CLI returns empty array for org with no repos`** — Create org (no repos), run `org repo list`, parse JSON, assert it is `[]`.
- **`test: CLI output matches API response`** — Create org with repos, call both CLI and HTTP API, parse both JSON outputs, assert they are structurally identical (same items, same order).
- **`test: CLI with nonexistent org exits with error`** — Run `org repo list --org nonexistent`, assert non-zero exit code and stderr contains error message.
- **`test: CLI without --org exits with error`** — Run `org repo list` without `--org`, assert error output about missing required argument.
- **`test: CLI with --json field filter`** — Run `org repo list --org <org> --json name,is_public`, assert output contains only filtered fields.

### Playwright Web UI E2E Tests (when org profile page is implemented)

- **`test: org profile page shows repository list by default`** — Navigate to `/:org`, assert a list of repository names is visible.
- **`test: each repository row shows name, description, and visibility badge`** — Navigate to org repos, assert each row contains the expected data.
- **`test: clicking a repository name navigates to the repo`** — Click a repo name in the org repo list, assert URL changes to `/:org/:repo`.
- **`test: empty state shown for org with no repos`** — Create org with no repos, navigate to org profile, assert empty state message is visible.
- **`test: pagination controls appear when repos exceed page size`** — Create org with 35 repos, navigate to org profile, assert pagination controls are visible.
- **`test: clicking next page loads more repos`** — Create org with 35 repos, navigate to page 1, click "Next", assert a different set of repos is displayed.
- **`test: non-member on public org sees only public repos`** — Authenticate as non-member, navigate to public org, assert only public repos are listed.
- **`test: non-member on private org sees access denied`** — Authenticate as non-member, navigate to private org, assert access denied state.
- **`test: anonymous user on public org sees public repos`** — Without authentication, navigate to public org, assert public repos are visible.
- **`test: repos are sorted by most recently updated first`** — Navigate to org repos, assert the first repo in the list has the most recent "updated" timestamp.

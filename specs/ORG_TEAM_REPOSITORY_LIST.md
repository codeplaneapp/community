# ORG_TEAM_REPOSITORY_LIST

Specification for ORG_TEAM_REPOSITORY_LIST.

## High-Level User POV

When an organization manages access to its repositories through teams, members need a way to see which repositories a specific team has access to. The team repository list answers the question: "What repositories does this team work with?"

An organization owner or member navigates to a team — either by clicking through the web UI, running a CLI command, or making an API call — and sees a paginated list of all repositories currently assigned to that team. Each item in the list shows the repository's name, description, visibility (public or private), and timestamps. This gives users a clear picture of the team's scope: which codebases it can access, and what kind of work it covers.

For organization owners, this list serves as an audit surface. Before restructuring teams, adding or removing repository access, or deleting a team, an owner can review exactly what repositories will be affected. For regular members, the list helps them understand what they can access through their team membership, and whether they need to request access to additional repositories through their organization owner.

The team repository list is a read-only surface. It does not allow adding or removing repository assignments — those are separate actions. It simply retrieves and displays the current set of repositories associated with a team, consistently, regardless of whether the user accesses it through the web UI, CLI, TUI, or API.

The list supports pagination so that teams with many repositories remain performant and navigable. Response headers provide the total count and navigation links, making it straightforward for both human users scrolling through results and automation scripts iterating over pages programmatically.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a `401 Unauthorized` response.
- **Organization membership required**: Only users who are members (either `owner` or `member` role) of the organization may list team repositories. Non-members must receive a `403 Forbidden` response.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return a `404 Not Found` response.
- **Team must exist**: If the team name does not resolve to a valid team within the resolved organization, the endpoint must return a `404 Not Found` response with message `"team not found"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive team lookup**: The team name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Response shape**: The response body must be a JSON array of repository objects. Each object must contain exactly these fields: `id` (number), `name` (string), `lower_name` (string), `owner` (string, set to the organization name), `description` (string), `is_public` (boolean), `created_at` (string, ISO 8601), `updated_at` (string, ISO 8601).
- **Pagination — page/per_page**: The endpoint must support `page` and `per_page` query parameters for page-based pagination.
- **Pagination — defaults**: If no pagination parameters are provided, the endpoint must default to `page=1` and `per_page=30`.
- **Pagination — maximum per_page**: The `per_page` value must be clamped to a maximum of `100`. Values greater than 100 must be silently reduced to 100.
- **Pagination — minimum page**: The `page` value must be at least `1`. Values less than or equal to 0 must be normalized to 1.
- **Pagination — invalid page value**: A non-numeric `page` parameter must return `400 Bad Request` with message `"invalid page value"`.
- **Pagination — invalid per_page value**: A non-numeric `per_page` parameter must return `400 Bad Request` with message `"invalid per_page value"`.
- **Pagination headers**: The response must include `X-Total-Count` header with the total number of repositories assigned to the team. It must also include a `Link` header with `first`, `last`, `prev` (if applicable), and `next` (if applicable) pagination links.
- **Empty result**: If the team has no repositories assigned, the response must be an empty JSON array `[]` with `X-Total-Count: 0`.
- **Ordering**: Repositories must be returned in ascending order by repository ID (stable, deterministic ordering).
- **Only org-owned repos**: The list must only contain repositories that belong to the organization. This is enforced by the `addTeamRepoIfOrgRepo` constraint at write time.
- **Timestamps**: `created_at` and `updated_at` must be ISO 8601 formatted strings.
- **No data leakage**: The response must not include internal-only repository fields (e.g., `shard_id`, `search_vector`, `fork_id`, `template_id`). Only the defined Repository shape fields must be returned.
- **Content-Type**: Response must include `Content-Type: application/json` header.
- **Idempotent**: Repeated GET requests with the same pagination parameters for the same team must return the same result (assuming no concurrent modifications).
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return `400 Bad Request` with message `"organization name is required"`.
- **Empty team name**: A request with an empty or whitespace-only `:team` path parameter must return `400 Bad Request` with message `"team name is required"`.
- **Org name max length**: Organization names longer than 40 characters must return `404` (no org will match, enforced at creation time).
- **Team name max length**: Team names longer than 40 characters must return `404` (no team will match, enforced at creation time).
- **Special characters in names**: Organization and team name path parameters containing URL-encoded special characters (e.g., `%20`, `%2F`) must be decoded and trimmed before lookup. Only valid slug characters should match existing entities.
- **CLI consistency**: The CLI `org team repo list --org <org> --team <team>` command must output the same JSON array returned by the API.
- **Page beyond results**: Requesting a `page` value beyond the last page of results must return an empty JSON array `[]` with correct `X-Total-Count` and pagination headers.

### Definition of Done

- The `GET /api/orgs/:org/teams/:team/repos` route returns the correct paginated JSON array for authenticated org members.
- Pagination headers (`X-Total-Count`, `Link`) are set correctly.
- Non-members and unauthenticated users are correctly rejected with appropriate status codes and error messages.
- Both organization name and team name are resolved case-insensitively.
- CLI `org team repo list` command works end-to-end and produces output structurally identical to the API response.
- All verification tests pass.
- Observability instrumentation is in place.
- Documentation for the API endpoint and CLI command is published.

## Design

### API Shape

**Endpoint**: `GET /api/orgs/:org/teams/:team/repos`

**Path Parameters**:
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |
| `team`    | string | Yes      | Team name / slug (case-insensitive, resolved via `lower_name`) |

**Query Parameters**:
| Parameter  | Type   | Required | Default | Description |
|------------|--------|----------|---------|-------------|
| `page`     | number | No       | 1       | Page number (1-indexed) |
| `per_page` | number | No       | 30      | Items per page (max 100) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`

**Response** (200 OK):
```json
[
  {
    "id": 7,
    "name": "api-server",
    "lower_name": "api-server",
    "owner": "acme-corp",
    "description": "Core API server",
    "is_public": true,
    "created_at": "2026-01-10T08:00:00.000Z",
    "updated_at": "2026-03-15T12:30:00.000Z"
  },
  {
    "id": 12,
    "name": "web-frontend",
    "lower_name": "web-frontend",
    "owner": "acme-corp",
    "description": "SolidJS web application",
    "is_public": false,
    "created_at": "2026-02-01T14:20:00.000Z",
    "updated_at": "2026-03-18T09:45:00.000Z"
  }
]
```

**Response Headers**:
| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Total-Count` | Total number of repositories assigned to the team |
| `Link` | Pagination links with `rel="first"`, `rel="last"`, `rel="prev"` (if applicable), `rel="next"` (if applicable) |

**Error Responses**:
| Status | Condition | Error Message |
|--------|-----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 400    | Empty or whitespace-only `:team` path parameter | `"team name is required"` |
| 400    | Non-numeric `page` query parameter | `"invalid page value"` |
| 400    | Non-numeric `per_page` query parameter | `"invalid per_page value"` |
| 401    | No valid session cookie or PAT provided | `"authentication required"` |
| 403    | Authenticated user is not an org member | `"forbidden"` |
| 404    | Organization does not exist | `"organization not found"` |
| 404    | Team does not exist in the organization | `"team not found"` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async listTeamRepos(
  viewer: User | null,
  orgName: string,
  teamName: string,
  page: number,
  perPage: number,
): Promise<Result<{ items: Repository[]; total: number }, APIError>>
```

The service:
1. Validates authentication — returns `401` if `viewer` is null.
2. Resolves the organization by `lower_name` case-insensitively via `resolveOrg` — returns `404` if not found, `400` if empty.
3. Verifies the viewer holds `owner` or `member` role via `requireOrgRole` — returns `403` if not.
4. Resolves the team by `lower_name` within the organization via `resolveTeam` — returns `404` if not found, `400` if empty.
5. Normalizes pagination via `normalizePage(page, perPage)` — clamps `page >= 1`, `perPage` to `[1, 100]`, computes offset.
6. Executes `listTeamRepos()` query joining `team_repos` with `repositories`, and `countTeamRepos()` for the total.
7. Maps each database row to the `Repository` shape via `mapRepoWithOwner(orgName, row)`.
8. Returns `Result.ok({ items, total })`.

### CLI Command

```
codeplane org team repo list --org <organization_name> --team <team_slug>
```

| Argument | Type   | Required | Description |
|----------|--------|----------|-------------|
| `--org`  | string | Yes      | Organization name |
| `--team` | string | Yes      | Team slug |

**Output**: JSON array of repository objects, identical to the API response body. Supports `--json` field filtering.

**Exit codes**: `0` = success, `1` = API error (prints error message to stderr).

**Alternative invocation** (as seen in existing e2e tests):
```
codeplane org team repos --org <organization_name> --team <team_slug>
```

**Example**:
```
$ codeplane org team repo list --org acme-corp --team backend
[
  {
    "id": 7,
    "name": "api-server",
    "lower_name": "api-server",
    "owner": "acme-corp",
    "description": "Core API server",
    "is_public": true,
    "created_at": "2026-01-10T08:00:00.000Z",
    "updated_at": "2026-03-15T12:30:00.000Z"
  }
]
```

**Example with field filtering**:
```
$ codeplane org team repo list --org acme-corp --team backend --json name,is_public
[
  {
    "name": "api-server",
    "is_public": true
  }
]
```

### Web UI Design

**Status**: `Gated` — referenced in feature inventory as `ORG_TEAMS_UI` and `ORG_TEAM_MANAGEMENT_UI` but not yet fully implemented. When implemented:

- **Location**: The team repository list is accessible at `/:org/-/teams/:team/repos` or as a tab within the team detail view at `/:org/-/teams/:team`.
- **Navigation**: Breadcrumb trail showing `Org Name > Teams > Team Name > Repositories`.
- **List view**:
  - Each row displays: repository name (as a clickable link to `/:org/:repo`), description (truncated to one line with ellipsis), visibility badge ("Public" or "Private"), and last updated timestamp (relative, e.g. "2 days ago" with ISO tooltip on hover).
  - The repository name is the primary interactive element; clicking it navigates to the repository overview.
- **Pagination**: A pagination control below the list showing page numbers, with 30 items per page by default. "Previous" and "Next" buttons with disabled state at boundaries.
- **Empty state**: If the team has no repositories, display a centered empty-state message: "No repositories assigned to this team." For org owners, include a CTA button: "Add a repository."
- **Loading state**: A skeleton loader matching the list row layout while the API call is in flight.
- **Error state**: If the API returns an error, display an inline error message with a "Retry" button.
- **Action bar** (org owners only): An "Add repository" button in the top-right corner that opens a repository picker for assigning new repos to the team.
- **Sub-navigation tabs** (within team detail): "Overview", "Members", "Repositories" (active).

### TUI UI

**Status**: `Partial` — No dedicated team repository list screen exists yet. When implemented:

- Accessible from the team detail screen by pressing `r` (repositories) or selecting the "Repositories" tab.
- Displays a scrollable list with columns: repository name, visibility (public/private icon), description (truncated).
- Key bindings: `Enter` to open the repository detail screen, `Esc` to go back to team detail, `n`/`p` or arrow keys for pagination.
- Empty state: "No repositories assigned to this team."

### Documentation

- **API reference** (`/api-reference/orgs#list-team-repositories`): Document `GET /api/orgs/:org/teams/:team/repos` — path parameters, query parameters, response shape, pagination headers, error codes, and example `curl` invocation.
- **CLI reference** (`/cli-reference/commands#codeplane-org-team-repo-list`): Document the `org team repo list` command, its arguments, example output, field filtering with `--json`, and exit codes.
- **Organizations guide** (`/guides/organizations`): Include a section on "Viewing team repositories" explaining how to see which repositories a team can access, with CLI and web UI examples.
- **Concept page**: Link to the broader "Teams and repository access" concept page explaining how team permission levels interact with repository assignments.

## Permissions & Security

### Authorization Roles

| Role | Can list team repos? | Notes |
|------|---------------------|-------|
| Organization Owner | ✅ Yes | Full access to view any team's repos in the org |
| Organization Member | ✅ Yes | Read-only listing of any team's repos in the org |
| Authenticated non-member | ❌ No | 403 Forbidden |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required, as listing is a read-only paginated query with bounded result size (max 100 items per page).
- The query cost is bounded by the pagination limit and a single team ID filter with index support.
- If abuse is detected (e.g., high-frequency enumeration), the platform rate limiter will throttle the caller.

### Data Privacy

- The response exposes repository names, descriptions, and visibility status. Repository names are not PII but may reveal proprietary project names to authorized org members.
- The `owner` field is set to the organization name, which is public metadata.
- The `is_public` field is informational within the org context — it reflects the repository's public/private visibility setting.
- Internal database details (`shard_id`, `search_vector`, `fork_id`, `template_id`, `mirror_destination`) are excluded from the response shape.
- No PII is returned in the response. Repository descriptions are free-text fields that could theoretically contain PII, but no server-side PII scanning is performed.
- The endpoint does not reveal which individual users have access through the team — that is a separate member-list endpoint.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamReposListed` | A successful 200 response is returned for a team repo list request | `org_name`, `team_name`, `team_id`, `viewer_user_id`, `page`, `per_page`, `result_count`, `total_count`, `client` (`api`, `cli`, `web`, `tui`) |
| `OrgTeamRepoListFailed` | A 4xx or 5xx response is returned | `org_name`, `team_name_attempted`, `viewer_user_id` (if authenticated), `status_code`, `error_reason`, `client` |

### Funnel Metrics

- **Team repo list adoption rate**: Percentage of org members who list team repositories at least once per month. Indicates awareness and usage of team-based access management.
- **Team list → team detail → team repos conversion**: Percentage of team list views that lead to a team detail view and then to a team repo list view within the same session. Measures whether users naturally explore team composition.
- **Team repo list → repo navigation rate**: Percentage of team repo list views where the user subsequently navigates to one of the listed repositories. Indicates the list is a useful navigation surface, not a dead end.
- **Team repo list → add repo conversion**: Percentage of team repo list views by org owners that result in an `addTeamRepo` action within the same session. Indicates whether the empty state or CTA is effective.
- **Pagination depth**: Distribution of `page` values requested. Most requests should be page 1; high page depth suggests either very large team-repo sets or enumeration behavior.
- **Client distribution**: Breakdown of team repo list requests by client surface (API, CLI, web, TUI).

### Success Indicators

- Team repo list API latency p50 < 30ms, p99 < 300ms.
- Error rate < 0.1% of requests (excluding expected 401/403/404 responses).
- At least 50% of teams with assigned repositories have their repo list viewed at least once within 30 days.
- Empty-state → add-repo conversion rate > 20% for org owners.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Team repo list request received | `debug` | `org_name`, `team_name`, `viewer_user_id`, `page`, `per_page`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Team not found | `info` | `org_name`, `team_name`, `request_id` |
| Viewer not org member (403) | `info` | `org_name`, `viewer_user_id`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `team_name`, `request_id` |
| Empty org name parameter | `info` | `request_id` |
| Empty team name parameter | `info` | `org_name`, `request_id` |
| Invalid pagination parameter | `info` | `org_name`, `team_name`, `raw_page`, `raw_per_page`, `request_id` |
| Team repo list query completed | `debug` | `org_name`, `team_name`, `team_id`, `result_count`, `total_count`, `query_duration_ms`, `request_id` |
| Unexpected error in team repo list | `error` | `org_name`, `team_name`, `viewer_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_repo_list_requests_total` | counter | `status_code`, `org_name` | Total team repo list requests |
| `codeplane_org_team_repo_list_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_team_repo_list_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `bad_request`, `internal`) | Error breakdown |
| `codeplane_org_team_repo_list_result_count` | histogram | `org_name` | Distribution of result set sizes per request (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |

### Alerts

#### Alert: `OrgTeamRepoListHighErrorRate`
- **Condition**: `rate(codeplane_org_team_repo_list_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context containing `team_repo_list` or `listTeamRepos`.
  2. Verify database connectivity — run a basic query against the `team_repos` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label on the counter).
  4. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.listTeamRepos` method.
  5. If the error involves the `resolveOrg` or `resolveTeam` helper, verify that the `organizations` and `teams` tables have the expected indexes on `lower_name`.
  6. Check the `team_repos` JOIN query — verify that `team_repos(team_id)` and `repositories(id)` indexes are intact.
  7. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgTeamRepoListHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_team_repo_list_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific organization (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the `listTeamRepos` query to verify indexes on `team_repos(team_id)` and `repositories(id)` are being used.
  3. Check if a specific team has an unusually large number of repository assignments (hundreds or thousands).
  4. Check database connection pool utilization — a pool exhaustion issue would affect all endpoints.
  5. Inspect `pg_stat_user_tables` for sequential scan counts on `team_repos` and `repositories` tables.
  6. Check for lock contention in `pg_locks` on the `team_repos` or `repositories` tables.
  7. If the `countTeamRepos` query is slow, verify an index on `team_repos(team_id)`.

#### Alert: `OrgTeamRepoListSuddenSpike`
- **Condition**: `rate(codeplane_org_team_repo_list_requests_total[5m]) > 10 * avg_over_time(rate(codeplane_org_team_repo_list_requests_total[5m])[1h:5m])`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike is organic (new integration, onboarding, or CI/CD pipeline) or potential abuse/enumeration.
  2. Check if requests are concentrated on a single `org_name` or from a single source IP.
  3. If abuse is suspected, verify that rate limiting is functioning correctly.
  4. Check pagination depth — repeated requests iterating through all pages may indicate data export or enumeration.
  5. No immediate action required for organic spikes, but monitor for cascading latency impact.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Query timeout on large team_repos JOIN | 500 Internal Server Error | Check for missing indexes on `team_repos(team_id)` and `repositories(id)` |
| `team_repos` table corrupted/missing | 500 Internal Server Error | Restore from backup; alert fires |
| `repositories` table corrupted/missing | 500 Internal Server Error | Restore from backup; alert fires |
| Concurrent team deletion during list | 404 Not Found (team disappeared between auth check and query) | Expected behavior; no recovery needed |
| Org membership revoked during request | 403 Forbidden (race condition) | Expected behavior; no recovery needed |
| Concurrent repo deletion during list | Repo may or may not appear in results depending on timing | Expected behavior; eventual consistency |
| NaN or malformed pagination parameters | 400 Bad Request | Expected behavior; log for monitoring |
| Extremely large `per_page` value (e.g., 999999) | Clamped to 100; returns at most 100 items | Expected behavior; no intervention needed |
| Negative `page` value | Normalized to page 1 | Expected behavior; no intervention needed |

## Verification

### API Integration Tests

- **`test: returns 200 with array of repositories for org owner`** — Create org, create team, create repo in org, add repo to team, call `GET /api/orgs/:org/teams/:team/repos` as org owner, assert 200 and response is an array containing the repo.
- **`test: returns 200 with array of repositories for org member`** — Create org, create team, assign repos, add a second user as org member, authenticate as member, call team repo list, assert 200.
- **`test: response is a JSON array`** — Get team repos, assert `Array.isArray(response)` is true.
- **`test: each repository object has exactly the expected fields`** — Get team repos, for each item assert keys are exactly: `id`, `name`, `lower_name`, `owner`, `description`, `is_public`, `created_at`, `updated_at`. Assert no additional keys exist.
- **`test: id is a number`** — Get team repos, assert `typeof item.id === 'number'` for each item.
- **`test: name is a string`** — Get team repos, assert `typeof item.name === 'string'` for each item.
- **`test: lower_name is lowercase form of name`** — Create repo "MyRepo", add to team, list, assert `item.lower_name === "myrepo"`.
- **`test: owner is set to the organization name`** — Get team repos, assert `item.owner` equals the organization name for each item.
- **`test: description is a string`** — Get team repos, assert `typeof item.description === 'string'` for each item.
- **`test: is_public is a boolean`** — Get team repos, assert `typeof item.is_public === 'boolean'` for each item.
- **`test: created_at is valid ISO 8601 string`** — Get team repos, assert `new Date(item.created_at).toISOString()` does not throw for each item.
- **`test: updated_at is valid ISO 8601 string`** — Get team repos, assert `new Date(item.updated_at).toISOString()` does not throw for each item.
- **`test: Content-Type header is application/json`** — Get team repos, assert response header `Content-Type` contains `application/json`.
- **`test: empty array returned when team has no repos`** — Create org, create team (no repos assigned), list repos, assert response is `[]`.
- **`test: X-Total-Count header is 0 for empty team`** — Create team with no repos, list, assert `X-Total-Count` header is `"0"`.
- **`test: X-Total-Count header matches actual total`** — Add 3 repos to team, list with `per_page=2`, assert `X-Total-Count` is `"3"`.
- **`test: Link header is present with pagination links`** — Add 3 repos, list with `per_page=1`, assert `Link` header contains `rel="first"`, `rel="last"`, and `rel="next"`.
- **`test: Link header includes prev on page 2`** — Add 3 repos, list with `page=2&per_page=1`, assert `Link` header contains `rel="prev"`.
- **`test: Link header does not include prev on page 1`** — Add 3 repos, list with `page=1&per_page=1`, assert `Link` header does not contain `rel="prev"`.
- **`test: Link header does not include next on last page`** — Add 3 repos, list with `page=3&per_page=1`, assert `Link` header does not contain `rel="next"`.
- **`test: results are ordered by repository ID ascending`** — Add 3 repos in known order, list all, assert IDs are in ascending order.
- **`test: multiple repos returned correctly`** — Create 3 repos, add all to team, list, assert all 3 are present with correct names.

### Pagination Tests

- **`test: default pagination returns up to 30 items`** — Add 35 repos to team, list without pagination params, assert exactly 30 items returned.
- **`test: per_page=10 returns 10 items`** — Add 15 repos, list with `per_page=10`, assert 10 items returned and `X-Total-Count` is `"15"`.
- **`test: page=2 with per_page=10 returns next batch`** — Add 15 repos, list page 1 and page 2 with `per_page=10`, assert page 1 has 10 items, page 2 has 5 items, and no overlap.
- **`test: per_page exceeding 100 is clamped to 100`** — Add 5 repos, list with `per_page=200`, assert request succeeds (returns up to 100 items).
- **`test: per_page=0 defaults to 30`** — List with `per_page=0`, assert default behavior (up to 30 items).
- **`test: page=0 is normalized to page 1`** — List with `page=0`, assert same results as `page=1`.
- **`test: negative page is normalized to page 1`** — List with `page=-5`, assert same results as `page=1`.
- **`test: page beyond results returns empty array`** — Add 3 repos, list with `page=100&per_page=10`, assert empty array `[]` with `X-Total-Count: 3`.
- **`test: non-numeric page returns 400`** — List with `page=abc`, assert 400 with message `"invalid page value"`.
- **`test: non-numeric per_page returns 400`** — List with `per_page=xyz`, assert 400 with message `"invalid per_page value"`.
- **`test: per_page=100 (maximum valid) returns up to 100 items`** — Add 5 repos, list with `per_page=100`, assert all 5 returned.
- **`test: per_page=101 is clamped to 100 and succeeds`** — Add 5 repos, list with `per_page=101`, assert request succeeds.

### Auth & Permission Tests

- **`test: returns 401 for unauthenticated request`** — Call endpoint with no session/token, assert 401 with message containing `"authentication required"`.
- **`test: returns 403 for authenticated non-member`** — Create org, create team, authenticate as a user who is NOT an org member, call team repo list, assert 403.
- **`test: returns 404 for nonexistent organization`** — Call `GET /api/orgs/nonexistent-org-xyz/teams/anyteam/repos`, assert 404.
- **`test: returns 404 for nonexistent team in valid org`** — Create org, call `GET /api/orgs/:org/teams/nonexistent-team-xyz/repos`, assert 404 with message `"team not found"`.
- **`test: returns 400 for empty org name`** — Call `GET /api/orgs/%20/teams/myteam/repos`, assert 400 with message containing `"organization name is required"`.
- **`test: returns 400 for empty team name`** — Call `GET /api/orgs/myorg/teams/%20/repos`, assert 400 with message containing `"team name is required"`.

### Case-Insensitivity Tests

- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", create team, add repo, call `GET /api/orgs/myorg/teams/:team/repos`, assert 200 with correct data.
- **`test: team name is resolved case-insensitively`** — Create org, create team "Backend", add repo, call `GET /api/orgs/:org/teams/backend/repos` (lowercase), assert 200 with correct data.
- **`test: mixed case org and team names both resolve`** — Create org "TestOrg", create team "DevTeam", add repo, call `GET /api/orgs/testorg/teams/devteam/repos`, assert 200.

### Edge Case Tests

- **`test: org name at maximum valid length (40 chars) resolves correctly`** — Create org with 40-character name, create team, add repo, list repos, assert 200.
- **`test: org name exceeding 40 chars returns 404`** — Call with 41-character org name, assert 404.
- **`test: team name at maximum valid length (40 chars) resolves correctly`** — Create org, create team with 40-character slug, add repo, list repos, assert 200.
- **`test: team name exceeding 40 chars returns 404`** — Call with 41-character team name, assert 404.
- **`test: repo with special characters in description is returned correctly`** — Create repo with description containing `<script>`, `"quotes"`, `\nnewlines`, unicode characters, add to team, list, assert description is returned verbatim.
- **`test: listing team repos does not modify any data`** — List repos, note all `updated_at` timestamps, wait 100ms, list again, assert all timestamps unchanged.
- **`test: response for same team is identical across consecutive requests`** — List team repos twice, assert responses are deeply equal.
- **`test: team repo list after adding a new repo includes the new repo`** — List repos, add a new repo, list again, assert the new repo appears.
- **`test: team repo list after removing a repo excludes the removed repo`** — List repos (includes repo X), remove repo X from team, list again, assert repo X is gone.
- **`test: path-encoded null byte in org name returns 400 or 404`** — Call with `%00` in org name, assert 400 or 404.
- **`test: path-encoded slash in team name returns 400 or 404`** — Call with `%2F` in team name, assert 400 or 404.

### CLI E2E Tests

- **`test: codeplane org team repo list --org <org> --team <team> returns JSON array`** — Create org, create team, add repo, run `org team repo list --org <org> --team <team>`, parse JSON output, assert it is an array containing the repo.
- **`test: CLI output contains repositories with expected fields`** — Run `org team repo list`, parse JSON, for each item assert keys include `id`, `name`, `lower_name`, `owner`, `description`, `is_public`, `created_at`, `updated_at`.
- **`test: CLI returns empty array for team with no repos`** — Create org, create team (no repos), run `org team repo list`, parse JSON, assert it is `[]`.
- **`test: CLI output matches API response`** — Create team with repos, call both CLI and API, parse both JSON outputs, assert they are structurally identical.
- **`test: CLI with nonexistent org exits with error`** — Run `org team repo list --org nonexistent --team any`, assert non-zero exit code and stderr contains error message.
- **`test: CLI with nonexistent team exits with error`** — Create org, run `org team repo list --org <name> --team nonexistent`, assert non-zero exit code.
- **`test: CLI without --org exits with error`** — Run `org team repo list --team some-team` without `--org`, assert error output.
- **`test: CLI without --team exits with error`** — Run `org team repo list --org some-org` without `--team`, assert error output.
- **`test: CLI with --json field filter`** — Run `org team repo list --org <org> --team <team> --json name,is_public`, assert output contains only filtered fields.
- **`test: alternative command alias org team repos works`** — Run `org team repos --org <org> --team <team>`, parse JSON, assert it returns the same result as `org team repo list`.

### Playwright Web UI E2E Tests (when `ORG_TEAMS_UI` / `ORG_TEAM_MANAGEMENT_UI` is implemented)

- **`test: team repos tab renders list of repositories`** — Navigate to `/:org/-/teams/:team`, click "Repositories" tab, assert a list of repository names is visible.
- **`test: each repository row shows name, description, and visibility`** — Navigate to team repos, assert each row contains the expected data.
- **`test: clicking a repository name navigates to the repo`** — Click a repo name in the team repo list, assert URL changes to `/:org/:repo`.
- **`test: empty state shown for team with no repos`** — Create team with no repos, navigate to team repos tab, assert "No repositories assigned to this team" text is visible.
- **`test: org owner sees "Add repository" button`** — Authenticate as org owner, navigate to team repos, assert "Add repository" button is visible.
- **`test: org member does not see "Add repository" button`** — Authenticate as org member, navigate to team repos, assert "Add repository" button is not visible.
- **`test: pagination controls appear when repos exceed page size`** — Add 35 repos to team, navigate to team repos, assert pagination controls are visible.
- **`test: clicking next page loads more repos`** — Add 35 repos, navigate to page 1, click "Next", assert a different set of repos is displayed and URL reflects page 2.
- **`test: non-member sees access denied on team repos page`** — Authenticate as non-member, navigate to `/:org/-/teams/:team/repos`, assert access denied state.
- **`test: nonexistent team shows 404 state`** — Navigate to `/:org/-/teams/nonexistent/repos`, assert a 404 or "team not found" state is rendered.
- **`test: breadcrumb navigates back to team detail`** — Navigate to team repos, click team name in breadcrumb, assert URL returns to team detail.

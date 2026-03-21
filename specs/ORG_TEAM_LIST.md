# ORG_TEAM_LIST

Specification for ORG_TEAM_LIST.

## High-Level User POV

## High-Level User POV

When you belong to an organization on Codeplane, you need to see which teams exist within that organization. The team list is the entry point for understanding how the organization structures its people and repository access.

From the web UI, you navigate to your organization's settings and see a Teams section. There, every team in the organization is displayed in a scannable list showing its name, description, permission level (read, write, or admin), and when it was created. If the organization has many teams, the list paginates so you can browse without being overwhelmed. If no teams have been created yet, a clear empty state tells you so and invites organization owners to create the first team.

From the CLI, running `codeplane org team list <org>` gives you the same team data as structured JSON, making it straightforward to script team audits, integrate with other tools, or quickly check what teams exist from the terminal. The TUI provides the same browsable team list within the organization detail screen.

This feature is scoped to organization members — you must be a member of the organization to see its team list. If you are not part of the organization, the teams are not visible to you. The list does not expose member counts or member identities directly; those are available through the team detail and team member list views.

The team list is the starting point for team management. From it, organization owners can create new teams, and any member can drill into a specific team to see its details, members, and assigned repositories. It is the organizational directory that makes collaboration structure transparent.

## Acceptance Criteria

## Acceptance Criteria

### Definition of Done

The feature is complete when any authenticated organization member can retrieve a paginated list of teams within that organization, receiving consistent results across API, CLI, TUI, and web UI. Pagination, empty states, error handling, and response shape are consistent across all surfaces. Unauthenticated requests are rejected with 401. Non-members of the organization are rejected with 403. Nonexistent organizations return 404.

### Functional Constraints

- [ ] The endpoint requires authentication. Unauthenticated requests return `401` with `"authentication required"`.
- [ ] The viewer must be a member of the specified organization (role `"owner"` or `"member"`). Non-members receive `403` with `"forbidden"`.
- [ ] The organization name is resolved case-insensitively.
- [ ] If the organization does not exist, the endpoint returns `404` with `"organization not found"`.
- [ ] Each item in the response includes exactly these fields: `id` (number), `organization_id` (number), `name` (string), `lower_name` (string), `description` (string), `permission` (string), `created_at` (string, ISO 8601), `updated_at` (string, ISO 8601).
- [ ] The `permission` field for each team is one of `"read"`, `"write"`, or `"admin"`.
- [ ] The response never includes fields beyond the 8 specified (no member counts, no repository lists, no internal metadata).
- [ ] Teams are ordered by `id` ascending (deterministic, creation-order pagination).
- [ ] Default page size is 30 items.
- [ ] Maximum page size is 100 items. Requests for a page size exceeding 100 are clamped to 100 (not rejected).
- [ ] The response includes an `X-Total-Count` header containing the total number of teams in the organization.
- [ ] The response includes standard `Link` pagination headers (`rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`) when applicable.
- [ ] If the organization has zero teams, the endpoint returns `200` with an empty array `[]` and `X-Total-Count: 0`.
- [ ] Pagination beyond the last page returns `200` with an empty array (not 404).
- [ ] Both legacy pagination (`?page=N&per_page=M`) and cursor-based pagination (`?cursor=N&limit=M`) work.
- [ ] The endpoint supports PAT-based authentication in addition to session cookies.
- [ ] Timestamps `created_at` and `updated_at` are ISO 8601 formatted strings.
- [ ] The `description` field defaults to an empty string `""` if the team has no description.

### Boundary Constraints

- [ ] **`id` in response:** Positive integer.
- [ ] **`organization_id` in response:** Positive integer matching the resolved organization's ID.
- [ ] **`name` in response:** 1–50 characters. Allowed characters: `[a-zA-Z0-9_-]`.
- [ ] **`lower_name` in response:** Lowercase version of `name`, 1–50 characters.
- [ ] **`description` in response:** 0–255 characters. May contain Unicode. Empty string if not set.
- [ ] **`permission` in response:** Exactly one of `"read"`, `"write"`, `"admin"`.
- [ ] **`created_at` in response:** Valid ISO 8601 timestamp string.
- [ ] **`updated_at` in response:** Valid ISO 8601 timestamp string. Always >= `created_at`.
- [ ] **`page` parameter:** Positive integer >= 1. Values <= 0 are normalized to 1.
- [ ] **`per_page` / `limit` parameter:** Integer 1–100. Values > 100 are clamped to 100. Values <= 0 default to 30.
- [ ] **`cursor` parameter:** String-encoded non-negative integer offset. Non-numeric cursor values return 400 or are treated as offset 0.
- [ ] **Organization name in URL:** 1–39 characters. Case-insensitive resolution.

### Edge Cases

- [ ] An organization with exactly one team returns an array of length 1.
- [ ] An organization with 101 teams returns exactly 30 on the first page (default) and appropriate pagination headers.
- [ ] Requesting `?page=2&per_page=100` when there are 50 total teams returns an empty array with `X-Total-Count: 50`.
- [ ] Requesting `?per_page=0` uses the default (30), not zero.
- [ ] Requesting `?per_page=-1` uses the default (30).
- [ ] Requesting `?per_page=200` clamps to 100.
- [ ] Requesting `?page=0` normalizes to page 1.
- [ ] A team with an empty description returns `description: ""`.
- [ ] A team whose description contains emoji, CJK, or accented characters returns with correct encoding.
- [ ] Two rapid consecutive identical requests return identical results (idempotency).
- [ ] An expired or revoked PAT returns `401` (not `200` with an empty list).
- [ ] A team that was deleted no longer appears in the list on the next request.
- [ ] A team that was just created appears in the list on the next request.
- [ ] Requesting teams for an organization whose name differs only by case returns the same result (e.g., `Acme` vs `acme`).
- [ ] The same team cannot appear more than once in the response (no duplicate entries).
- [ ] An organization owner can list teams even if not a member of any specific team.
- [ ] An organization member (non-owner) can list all teams in the org.

## Design

## Design

### API Shape

#### `GET /api/orgs/:org/teams`

**Description:** Retrieve a paginated list of teams within an organization.

**Authentication:** Required. Session cookie or PAT `Authorization` header.

**Path parameters:**

| Parameter | Type   | Description                           |
|-----------|--------|---------------------------------------|
| `org`     | string | Organization name (case-insensitive)  |

**Query parameters (legacy pagination):**

| Parameter  | Type    | Default | Description                        |
|------------|---------|---------|------------------------------------|  
| `page`     | integer | 1       | Page number (1-indexed)            |
| `per_page` | integer | 30      | Items per page (max 100)           |

**Query parameters (cursor pagination):**

| Parameter | Type    | Default | Description                        |
|-----------|---------|---------|------------------------------------|  
| `cursor`  | string  | `"0"`   | String-encoded offset              |
| `limit`   | integer | 30      | Items per page (max 100)           |

**Success response — `200 OK`:**

```json
[
  {
    "id": 1,
    "organization_id": 42,
    "name": "backend",
    "lower_name": "backend",
    "description": "Backend engineering team",
    "permission": "write",
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-02-20T14:00:00.000Z"
  },
  {
    "id": 2,
    "organization_id": 42,
    "name": "frontend",
    "lower_name": "frontend",
    "description": "",
    "permission": "read",
    "created_at": "2026-01-16T09:00:00.000Z",
    "updated_at": "2026-01-16T09:00:00.000Z"
  }
]
```

**Response headers:**

| Header          | Description                                                                                       |
|-----------------|---------------------------------------------------------------------------------------------------|
| `Content-Type`  | `application/json`                                                                                |
| `X-Total-Count` | Total number of teams in the organization                                                         |
| `Link`          | Standard pagination `Link` header with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable |

**Error responses:**

| Status                 | Condition                                        | Body                                            |
|------------------------|--------------------------------------------------|-------------------------------------------------|
| `400 Bad Request`      | Empty or whitespace-only `:org` path parameter   | `{ "message": "organization name is required" }` |
| `401 Unauthorized`     | No valid session or token                        | `{ "message": "authentication required" }`      |
| `403 Forbidden`        | Authenticated user is not an org member           | `{ "message": "forbidden" }`                    |
| `404 Not Found`        | Organization does not exist                       | `{ "message": "organization not found" }`       |
| `429 Too Many Requests`| Rate limit exceeded                               | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `OrgService` in `@codeplane/sdk` exposes:

```typescript
listOrgTeams(
  viewer: User | null,
  orgName: string,
  page: number,
  perPage: number,
): Promise<Result<{ items: Team[]; total: number }, APIError>>
```

Where `Team` is:

```typescript
interface Team {
  id: number;
  organization_id: number;
  name: string;
  lower_name: string;
  description: string;
  permission: string;
  created_at: string;
  updated_at: string;
}
```

The method:
1. Validates `viewer` is non-null (returns `unauthorized` otherwise).
2. Resolves the organization by name case-insensitively via `resolveOrg` (returns `404` if not found, `400` if empty).
3. Validates the viewer holds `"owner"` or `"member"` role in the organization via `requireOrgRole` (returns `403` if not).
4. Normalizes pagination parameters: clamp page >= 1, clamp perPage to 1–100, default 30.
5. Queries `listOrgTeams` from `orgs_sql` with `ORDER BY id ASC` and LIMIT/OFFSET.
6. Counts total teams via `countOrgTeams`.
7. Maps each database row to the `Team` shape via `mapTeam`.
8. Returns `{ items, total }`.

### CLI Command

#### `codeplane org team list`

**Description:** List teams in a specific organization.

**Authentication:** Required. Uses the stored CLI session token.

**Arguments:**

| Argument | Type   | Required | Description          |
|----------|--------|----------|----------------------|
| `org`    | string | Yes      | Organization name    |

**Output (JSON, default):**

```json
[
  {
    "id": 1,
    "organization_id": 42,
    "name": "backend",
    "lower_name": "backend",
    "description": "Backend engineering team",
    "permission": "write",
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-02-20T14:00:00.000Z"
  }
]
```

**Output (human-readable, table format):**

```
Name        Description                 Permission  Created
backend     Backend engineering team     write       2026-01-15
frontend                                 read        2026-01-16
```

**Empty state:** When the org has no teams, JSON output returns `[]`. Human-readable output shows `"No teams found"`.

**Error behavior:**
- Running without authentication → non-zero exit code, stderr: `Error: authentication required`
- Running with a nonexistent org → non-zero exit code, stderr: `Error: organization not found`
- Running as a non-member of the org → non-zero exit code, stderr: `Error: forbidden`

**Exit codes:** 0 = success, 1 = API error (prints error message to stderr).

**Supports `--json` field filtering** for structured output post-processing.

### TUI UI

The TUI should include a teams list view accessible from the organization detail screen:

```
┌── Teams: acme-corp ───────────────────────────────────────────┐
│                                                                 │
│  📦  backend         Backend engineering team        write      │
│  📦  frontend        Frontend engineering team       read       │
│  📦  platform        Platform infrastructure         admin      │
│                                                                 │
│  3 teams total  Page 1 of 1                                     │
└─────────────────────────────────────────────────────────────────┘
```

- Each team row shows: icon placeholder, team name (bold), description (dimmed, truncated), permission badge.
- Pressing Enter on a team navigates to the team detail screen.
- Left/right arrow keys or `[` / `]` navigate pages when there are multiple pages.
- The total team count is shown at the bottom.
- Empty state: `"This organization has no teams yet."`

### Web UI Design

**Location:** Organization Settings → Teams tab (`/:org/-/settings/teams`)

**Layout:**

- **Section heading:** "Teams" with a count badge showing the total number of teams (e.g., "Teams (12)").
- **Create team button:** Visible only to organization owners. A "New team" action in the section header that navigates to the team creation form.
- **Search/filter:** An optional text input to filter teams by name (client-side filtering within the loaded page).
- **Team list:** Each team is displayed as a row/card with:
  - **Team name** (bold, primary text): Clickable link navigating to the team detail page at `/:org/-/teams/:team`.
  - **Description** (secondary text, dimmed): Shown beside or below the name. Omitted or shows placeholder if empty.
  - **Permission badge:** A small colored badge (`read` = gray, `write` = blue, `admin` = purple) beside the team name.
  - **Created date:** Relative timestamp (e.g., "Created 3 months ago").
- **Pagination controls:** Below the list with page numbers and prev/next buttons. Hidden when there is only one page.
- **Empty state:** When the organization has no teams, show a centered message: "No teams yet" with a "Create team" call-to-action button visible only to org owners, or "No teams have been created yet" for non-owner members.
- **Loading state:** A skeleton loader matching the row layout while the API call is in flight.
- **Error state:** If the API call fails, show an inline error banner: "Failed to load teams. Please try again." with a retry button.

**Interactions:**

- The list refreshes automatically after a team is created or deleted (no manual page reload required).
- Clicking a team name navigates to `/:org/-/teams/:team` which shows the team detail view.

### Documentation

The following end-user documentation should be written:

1. **API Reference — List Organization Teams:** Document `GET /api/orgs/:org/teams` with request/response examples, pagination headers, error codes, and field descriptions. Include notes on both legacy and cursor pagination styles. Note the authentication and authorization requirements (must be an org member).

2. **CLI Reference — `codeplane org team list`:** Document the command with output examples in both human-readable and JSON formats. Document the `org` argument. Document error behavior for unauthenticated sessions, nonexistent orgs, and unauthorized access.

3. **User Guide — Managing Teams:** A section within the organization management guide explaining how to view the team list from the web UI, CLI, and TUI. Include guidance on pagination for organizations with many teams and links to the team create, team view, and team member management documentation.

## Permissions & Security

## Permissions & Security

### Authorization Model

| Role                              | Can list teams?                                                                 |
|-----------------------------------|---------------------------------------------------------------------------------|
| Anonymous (unauthenticated)       | ❌ No — returns 401                                                             |
| Authenticated non-org-member      | ❌ No — returns 403                                                             |
| Org member (role: `member`)       | ✅ Yes — can see all teams within the org                                       |
| Org owner (role: `owner`)         | ✅ Yes — can see all teams within the org                                       |
| PAT-authenticated org member      | ✅ Yes — same access as session-authenticated org member                        |
| Instance admin (not org member)   | ❌ No — org membership is required; instance admin alone does not grant org-scoped access via this endpoint |

This endpoint is scoped to the organization. It never returns teams from other organizations. An org member can see all teams within their organization, regardless of which specific teams they belong to.

### Rate Limiting

- **Authenticated callers:** 300 requests per minute per token/session.
- **Rate limit response:** `429 Too Many Requests` with `Retry-After` header indicating seconds until reset.
- Rate limiting is enforced at the middleware layer, shared with other organization-scoped endpoints.
- Since this endpoint requires authentication, anonymous rate limits do not apply.

### Data Privacy Constraints

- **Org-scoped:** The SQL query filters teams by `organization_id`. Only teams belonging to the specified organization are returned.
- **No membership data:** The team list does not include member counts, member names, or member IDs. Team membership is a separate endpoint (`GET /api/orgs/:org/teams/:team/members`).
- **No repository data:** The team list does not include which repositories are assigned to each team. That is a separate endpoint (`GET /api/orgs/:org/teams/:team/repos`).
- **No cross-org visibility:** The endpoint resolves the org and validates membership before querying teams. A user in one org cannot see teams in another org.
- **No internal metadata:** The response only includes the 8 defined fields. No internal database row IDs (beyond `id`), no join metadata, no audit trail fields.
- **Description field:** Team descriptions are user-controlled free text. Clients should sanitize descriptions before rendering to prevent XSS in web contexts.

## Telemetry & Product Analytics

## Telemetry & Product Analytics

### Key Business Events

| Event Name                   | When Fired                                                            | Properties                                                                                               |
|------------------------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `OrgTeamListViewed`          | On successful 200 response from `GET /api/orgs/:org/teams`           | `user_id`, `org_name`, `client` (web/cli/tui/api/desktop/vscode/neovim), `response_time_ms`, `result_count`, `total_count`, `page`, `per_page` |
| `OrgTeamListEmpty`           | On successful 200 response with zero results and page 1              | `user_id`, `org_name`, `client`                                                                          |
| `OrgTeamListPaginated`       | On successful 200 response with page > 1                             | `user_id`, `org_name`, `client`, `page`, `per_page`, `total_count`                                       |
| `OrgTeamListUnauthorized`    | On 401 response                                                       | `client`, `client_ip` (hashed), `auth_method_attempted` (cookie/pat/none)                                |
| `OrgTeamListForbidden`       | On 403 response                                                       | `user_id`, `org_name`, `client`                                                                          |
| `OrgTeamListNotFound`        | On 404 response                                                       | `user_id`, `org_name`, `client`                                                                          |

### Event Properties

- `user_id` (number): The authenticated user's ID.
- `org_name` (string): The organization name from the request path.
- `client` (string enum): One of `"web"`, `"cli"`, `"tui"`, `"api"`, `"desktop"`, `"vscode"`, `"neovim"`.
- `response_time_ms` (number): Server-side response latency in milliseconds.
- `result_count` (number): Number of items returned in this page.
- `total_count` (number): Total number of teams in the organization.
- `page` (number): Current page number.
- `per_page` (number): Page size used.
- `client_ip` (string): Hashed IP address for 401 analysis (never stored as raw IP).
- `auth_method_attempted` (string enum): One of `"cookie"`, `"pat"`, `"none"`.

### Funnel Metrics and Success Indicators

- **Team list view volume:** Total `OrgTeamListViewed` events per day, segmented by client. Indicates whether users actively browse team structure.
- **Empty org rate:** Ratio of `OrgTeamListEmpty` to total `OrgTeamListViewed` on page 1. A high rate (> 50%) may indicate organizations are being created but teams are not, signaling an onboarding gap.
- **Pagination depth:** Distribution of `page` values from `OrgTeamListPaginated` events. A heavy tail indicates organizations with many teams.
- **Team list → team detail click-through rate (web only):** Percentage of `OrgTeamListViewed` events followed by a `OrgTeamViewed` event within the same session. Indicates the list is used as a navigation entry point.
- **Team list → create team action rate (web only):** Percentage of `OrgTeamListViewed` events by org owners that lead to a team creation within the same session. Indicates the list is used for management.
- **CLI vs web split:** Client distribution of `OrgTeamListViewed`. Tracks CLI adoption for team administration.
- **Forbidden attempt rate:** Volume of `OrgTeamListForbidden` events. Sustained spikes may indicate users trying to access teams in orgs they are not members of — potential UX issue with navigation or permissions messaging.
- **Not found rate:** Volume of `OrgTeamListNotFound` events. High rates may indicate broken links, stale bookmarks, or recently deleted organizations.

## Observability

## Observability

### Logging Requirements

| Log Point                                     | Level   | Structured Fields                                                       | Condition                               |
|-----------------------------------------------|---------|-------------------------------------------------------------------------|------------------------------------------|
| Org team list request received                | `DEBUG` | `user_id`, `request_id`, `org_name`, `page`, `per_page`                | Every authenticated request              |
| Org team list succeeded                       | `INFO`  | `user_id`, `request_id`, `org_name`, `duration_ms`, `result_count`, `total_count` | 200 response                |
| Org team list unauthorized                    | `WARN`  | `request_id`, `client_ip`, `auth_method_attempted`                      | 401 response                             |
| Org team list forbidden                       | `WARN`  | `user_id`, `request_id`, `org_name`                                     | 403 response                             |
| Org team list not found                       | `INFO`  | `user_id`, `request_id`, `org_name`                                     | 404 response (org not found)             |
| Org team list bad request                     | `WARN`  | `request_id`, `user_id`, `reason`                                       | 400 response                             |
| Org team list internal error                  | `ERROR` | `user_id`, `request_id`, `error_message`, `stack_trace`                 | 500 response                             |
| Rate limit exceeded on org team list          | `WARN`  | `user_id`, `request_id`, `rate_limit_bucket`                            | 429 response                             |
| Pagination clamped                            | `DEBUG` | `user_id`, `request_id`, `requested_per_page`, `clamped_per_page`       | When per_page > 100 is clamped           |
| Pagination page normalized                    | `DEBUG` | `user_id`, `request_id`, `requested_page`, `normalized_page`            | When page <= 0 is normalized to 1        |

### Prometheus Metrics

| Metric                                                | Type      | Labels                                          | Description                                                      |
|-------------------------------------------------------|-----------|-------------------------------------------------|------------------------------------------------------------------|
| `codeplane_org_team_list_requests_total`              | Counter   | `status` (200, 400, 401, 403, 404, 429, 500), `client` | Total org team list requests                            |
| `codeplane_org_team_list_request_duration_seconds`    | Histogram | `status`                                        | Response latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_org_team_list_result_count`                | Histogram | —                                               | Distribution of result counts per page (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_org_team_list_total_count`                 | Histogram | —                                               | Distribution of total team counts per org per query (buckets: 0, 1, 2, 5, 10, 25, 50, 100, 250) |
| `codeplane_org_team_list_unauthorized_total`          | Counter   | `auth_method_attempted`                         | Total 401s on org team list requests                             |
| `codeplane_org_team_list_forbidden_total`             | Counter   | —                                               | Total 403s (non-org-member access attempts)                      |
| `codeplane_org_team_list_not_found_total`             | Counter   | —                                               | Total 404s on org team list requests                             |

### Alerts

#### Alert: Org Team List Endpoint Elevated Latency

**Condition:** `histogram_quantile(0.99, rate(codeplane_org_team_list_request_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database connection pool health via `SELECT count(*) FROM pg_stat_activity;`.
2. Check if slow queries exist via `pg_stat_statements` for `listOrgTeams` and `countOrgTeams` queries.
3. Verify the `teams.organization_id` column has an index. Run `EXPLAIN ANALYZE` on the listing query with a known `organization_id`.
4. Check if an organization with an unusually large number of teams is being queried repeatedly, causing large OFFSET scans. Inspect the `codeplane_org_team_list_total_count` histogram for outliers.
5. Check if the server is under memory pressure or CPU contention from concurrent requests.
6. If the problem is OFFSET-based pagination degradation for deep pages: consider adding keyset pagination using `(id)` as the cursor key.

#### Alert: Org Team List Endpoint 5xx Spike

**Condition:** `rate(codeplane_org_team_list_requests_total{status="500"}[5m]) > 0.1` sustained for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server error logs for stack traces associated with the org team list route (`GET /api/orgs/:org/teams`).
2. Common causes: database connection failure, `mapTeam` mapping error (e.g., unexpected null on `description` or timestamp when the fallback fails), pagination arithmetic overflow.
3. Verify database connectivity: attempt a direct SQL query against the `teams` table filtered by `organization_id`.
4. Check for recent deployments. If the 5xx spike correlates with a deploy, consider rolling back.
5. If the error is in the mapping function: check if a database migration changed the `teams` row shape without updating the TypeScript mapper.
6. Verify the `teams` table schema has not been altered: check for dropped or renamed columns.

#### Alert: Elevated Unauthorized Rate on Org Team List

**Condition:** `rate(codeplane_org_team_list_unauthorized_total[5m]) > 5` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a deployment broke session or PAT validation middleware.
2. Query recent `OrgTeamListUnauthorized` events to understand the distribution of `auth_method_attempted`. If all are `"cookie"`, check session storage health. If all are `"pat"`, check PAT validation logic.
3. Check if an external integration or CI system is making unauthenticated calls to this endpoint by mistake.
4. If from a single IP block: check for credential stuffing or brute-force patterns. Consider escalating rate limiting.
5. Verify that auth middleware is correctly loaded and running before the org team list route handler.

#### Alert: Elevated Forbidden Rate on Org Team List

**Condition:** `rate(codeplane_org_team_list_forbidden_total[5m]) > 10` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a recent UI change exposed team list links to non-org-members (e.g., public org pages linking to team lists without checking org membership).
2. Query recent `OrgTeamListForbidden` events. If concentrated on a few orgs, check if those orgs recently changed membership policies.
3. If the 403s are from API/CLI clients, check if a third-party integration is attempting to enumerate teams across multiple orgs.
4. Verify the `requireOrgRole` check in the service layer is functioning correctly.
5. No immediate action required unless combined with other suspicious access patterns.

#### Alert: Abnormal Empty Org Team List Rate

**Condition:** `rate(codeplane_org_team_list_result_count_bucket{le="0"}[15m]) / rate(codeplane_org_team_list_requests_total{status="200"}[15m]) > 0.95` sustained for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Verify the `teams` table has data. Run `SELECT COUNT(*) FROM teams;`.
2. Check if a migration or bulk operation accidentally deleted team rows.
3. Verify the `countOrgTeams` and `listOrgTeams` queries are functioning: test manually with a known `organization_id` that should have teams.
4. If this is a data issue: restore from backup or investigate the deletion. If this is a query bug: check the SQL or `organization_id` resolution logic.

### Error Cases and Failure Modes

| Failure Mode                                   | Expected Behavior                  | User-Visible Error                               |
|------------------------------------------------|------------------------------------|--------------------------------------------------|
| No auth cookie or PAT provided                 | 401 Unauthorized                   | `"authentication required"`                      |
| Expired or revoked PAT                         | 401 Unauthorized                   | `"authentication required"`                      |
| User is not a member of the organization       | 403 Forbidden                      | `"forbidden"`                                    |
| Organization does not exist                    | 404 Not Found                      | `"organization not found"`                       |
| Empty `:org` path parameter                    | 400 Bad Request                    | `"organization name is required"`                |
| Database connection lost                       | 500 Internal Server Error          | `"internal server error"`                        |
| `mapTeam` receives null field                  | 500 (should not happen if DB schema is correct) | `"internal server error"`           |
| `per_page` set to extremely large value        | Clamped to 100, 200 response       | Normal paginated response                        |
| Negative page number                           | Normalized to page 1, 200 response | Normal first-page response                       |
| Non-numeric cursor value                       | 400 Bad Request                    | `"invalid pagination parameters"`                |
| Concurrent team deletion during request        | Stale count possible; team may be missing from page | Normal response (eventually consistent) |
| Concurrent team creation during request        | May not appear until next request   | Normal response (eventually consistent)          |
| Rate limit exceeded                            | 429                                | `"rate limit exceeded"` with `Retry-After` header |
| OFFSET exceeds total rows                      | Empty array returned, 200          | Empty result set                                 |
| Organization was deleted between auth check and team query | 404 Not Found           | `"organization not found"`                       |

## Verification

## Verification

### API Integration Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 1  | `GET org teams returns 200 with correct shape`                                  | Authenticate as an org member. Create an org with at least one team. Request team list. Assert 200 and each item has exactly the 8 required fields (`id`, `organization_id`, `name`, `lower_name`, `description`, `permission`, `created_at`, `updated_at`). |
| 2  | `GET org teams returns only teams in the specified org`                          | Create org A with team X and org B with team Y (user is member of both). Request teams for org A. Assert response contains team X and does NOT contain team Y. |
| 3  | `GET org teams returns teams ordered by id ascending`                            | Create 3 teams in an org. Request team list. Assert items are sorted by `id` ascending. |
| 4  | `GET org teams excludes extra fields`                                            | Assert response items do NOT contain any fields beyond the 8 specified (no `member_count`, no `repos`, no internal metadata). |
| 5  | `GET org teams without authentication returns 401`                               | Request org team list with no auth header or cookie. Assert 401 with body `{ "message": "authentication required" }`. |
| 6  | `GET org teams with expired PAT returns 401`                                     | Create a PAT, revoke it, request org team list. Assert 401. |
| 7  | `GET org teams as non-org-member returns 403`                                    | Authenticate as a user who is NOT a member of the organization. Request team list. Assert 403 with `"forbidden"`. |
| 8  | `GET org teams for nonexistent org returns 404`                                  | Request teams for an org name that does not exist. Assert 404 with `"organization not found"`. |
| 9  | `GET org teams returns empty array for org with no teams`                        | Create an org with no teams. Request team list. Assert 200, body is `[]`, `X-Total-Count: 0`. |
| 10 | `GET org teams default pagination is 30`                                         | Create an org with 35 teams. Request without pagination params. Assert response has exactly 30 items and `X-Total-Count: 35`. |
| 11 | `GET org teams respects per_page`                                                | Request with `?per_page=5`. Assert response has exactly 5 items (assuming org has >= 5 teams). |
| 12 | `GET org teams clamps per_page to 100`                                           | Create an org with 105 teams. Request with `?per_page=200`. Assert response has exactly 100 items. |
| 13 | `GET org teams page 2 returns next set`                                          | Create org with 35 teams. Request `?page=1&per_page=20` and `?page=2&per_page=20`. Assert page 1 has 20 items, page 2 has 15 items, no overlap in IDs. |
| 14 | `GET org teams page beyond last returns empty`                                   | Create org with 5 teams. Request `?page=2&per_page=30`. Assert 200 with empty array. |
| 15 | `GET org teams cursor pagination works`                                          | Request with `?cursor=0&limit=10`, then `?cursor=10&limit=10`. Assert no overlap and correct offset behavior. |
| 16 | `GET org teams X-Total-Count header is correct`                                  | Create org with 7 teams. Assert `X-Total-Count` header equals `7`. |
| 17 | `GET org teams Link header contains pagination links`                            | Create org with 50 teams. Request `?page=2&per_page=10`. Assert `Link` header contains `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`. |
| 18 | `GET org teams works with PAT authentication`                                    | Request org team list with a valid PAT from an org member. Assert 200 and same content as session-authenticated request. |
| 19 | `GET org teams id is a number not a string`                                      | Assert `typeof item.id === "number"` for each item. |
| 20 | `GET org teams organization_id is a number not a string`                         | Assert `typeof item.organization_id === "number"` for each item. |
| 21 | `GET org teams per_page=0 defaults to 30`                                        | Request with `?per_page=0`. Assert response has up to 30 items. |
| 22 | `GET org teams page=0 normalizes to page 1`                                      | Request with `?page=0`. Assert response is the same as `?page=1`. |
| 23 | `GET org teams per_page=-1 defaults to 30`                                       | Request with `?per_page=-1`. Assert response has up to 30 items. |
| 24 | `GET org teams permission values are valid`                                      | Create teams with permission `read`, `write`, `admin`. Request list. Assert each team's `permission` is one of these three values. |
| 25 | `GET org teams description with Unicode`                                         | Create a team with description `"Ñoño 日本 🚀"`. Request team list. Assert round-trip fidelity of `description`. |
| 26 | `GET org teams with empty description`                                           | Create a team with no description. Request team list. Assert `description: ""` for that team. |
| 27 | `GET org teams with max per_page=100 and exactly 100 teams`                      | Create org with exactly 100 teams. Request with `?per_page=100`. Assert response has exactly 100 items. |
| 28 | `GET org teams with per_page=101 clamps to 100`                                  | Request with `?per_page=101`. Assert response has at most 100 items (clamped, not rejected). |
| 29 | `GET org teams response Content-Type is application/json`                        | Assert `Content-Type` header is `application/json`. |
| 30 | `GET org teams idempotency`                                                      | Make the same request twice rapidly. Assert both return identical 200 responses. |
| 31 | `GET org teams org name is case-insensitive`                                     | Create org `AcmeCorp`. Request teams using `acmecorp`, `ACMECORP`, and `AcmeCorp`. Assert all return the same 200 response. |
| 32 | `GET org teams reflects team creation`                                            | List teams (note count). Create a new team. List again. Assert count increased by 1 and new team is present. |
| 33 | `GET org teams reflects team deletion`                                            | List teams (note a team). Delete that team. List again. Assert the deleted team no longer appears. |
| 34 | `GET org teams no duplicates`                                                    | List teams. Assert no two items have the same `id`. |
| 35 | `GET org teams org member can view`                                              | Authenticate as an org member (non-owner). Request team list. Assert 200. |
| 36 | `GET org teams org owner can view`                                               | Authenticate as an org owner. Request team list. Assert 200. |
| 37 | `GET org teams Link header first page has no prev`                               | Request `?page=1&per_page=10` for an org with 5 teams. Assert `Link` header does NOT contain `rel="prev"` or `rel="next"`. |
| 38 | `GET org teams Link header last page has no next`                                | Request `?page=5&per_page=10` for an org with 50 teams. Assert `Link` header does NOT contain `rel="next"`. |
| 39 | `GET org teams created_at and updated_at are ISO 8601`                           | Assert `created_at` and `updated_at` fields parse as valid ISO 8601 dates for each item. |
| 40 | `GET org teams lower_name matches name lowercased`                               | Create a team with mixed-case name (e.g., `BackEnd`). List teams. Assert `lower_name` equals `name.toLowerCase()`. |
| 41 | `GET org teams empty org name returns 400`                                       | Request `GET /api/orgs/%20/teams` (whitespace org name). Assert 400 with `"organization name is required"`. |

### CLI E2E Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 42 | `codeplane org team list returns teams`                                         | Run `codeplane org team list <org>`. Assert exit code 0, assert array contains at least the seeded team. |
| 43 | `codeplane org team list --json output has correct fields`                      | Parse stdout as JSON array. Assert each item has `id`, `organization_id`, `name`, `lower_name`, `description`, `permission`, `created_at`, `updated_at` and no extra fields. |
| 44 | `codeplane org team list without auth returns error`                            | Run `codeplane org team list <org>` without a stored session. Assert non-zero exit code and stderr contains `"authentication required"`. |
| 45 | `codeplane org team list for nonexistent org returns error`                     | Run with a nonexistent org name. Assert non-zero exit code and stderr contains `"organization not found"` or `"not found"`. |
| 46 | `codeplane org team list for org with no teams shows empty`                     | Create an org with no teams. Run `codeplane org team list <org>`. Assert exit code 0 and output is `[]`. |
| 47 | `codeplane org team list reflects team creation`                                | Create a team. Run list. Assert the new team appears in the response. |
| 48 | `codeplane org team list reflects team deletion`                                | Delete a team. Run list. Assert the deleted team no longer appears. |
| 49 | `codeplane org team list round-trip: create, list, delete, list`               | Create a team. List (assert present). Delete the team. List again (assert absent). |

### Web UI E2E Tests (Playwright)

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 50 | `Teams page renders for org member`                                             | Navigate to `/:org/-/settings/teams` while authenticated as an org member. Assert the page loads and shows team rows or an empty state. |
| 51 | `Teams page shows correct team count`                                           | Authenticate as an org member. Navigate to the teams page for an org with known teams. Assert the visible items match the expected count. |
| 52 | `Teams row displays name, description, and permission badge`                    | Assert at least one team row contains team name (linked), description, and permission badge. |
| 53 | `Teams name links to team detail`                                               | Click on a team's name. Assert navigation to `/:org/-/teams/:team`. |
| 54 | `Teams page shows empty state for org with no teams`                            | Navigate to teams page for an org with no teams. Assert empty state message is visible. |
| 55 | `Teams page pagination works`                                                   | Authenticate for an org with > 30 teams. Assert pagination controls are visible. Click "Next". Assert new teams load. |
| 56 | `Teams page requires authentication`                                            | Navigate to the teams page while unauthenticated. Assert redirect to login or 401 error. |
| 57 | `Teams page shows create button for org owners`                                 | Authenticate as an org owner. Navigate to teams. Assert "New team" button is visible. |
| 58 | `Teams page hides create button for non-owner org members`                      | Authenticate as an org member (non-owner). Navigate to teams. Assert "New team" button is NOT visible. |
| 59 | `Teams page loading state shows skeleton`                                       | Navigate to teams with network throttling. Assert a skeleton or loading indicator is visible before the team list renders. |
| 60 | `Teams page shows error state on API failure`                                   | Intercept the `GET /api/orgs/:org/teams` request and force a 500 response. Navigate to teams page. Assert an error message is visible with a retry option. |
| 61 | `Teams page retry button on error state re-fetches`                             | Force a 500 on first load, then allow the second request to succeed. Click retry. Assert the team list loads correctly. |

### TUI Integration Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 62 | `TUI team list screen renders for authenticated org member`                     | Navigate to teams screen in TUI. Assert screen contains team names. |
| 63 | `TUI team list screen shows empty state`                                        | Navigate to teams screen for an org with no teams. Assert empty state message. |
| 64 | `TUI team list screen pagination`                                               | Navigate to teams for an org with many teams. Assert pagination indicators and navigation work. |
| 65 | `TUI team list Enter navigates to team detail`                                  | Navigate to team list, press Enter on a team. Assert navigation to team detail screen. |

### Rate Limiting Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 66 | `Org team list endpoint returns 429 after rate limit exceeded`                  | Send 301 authenticated requests in rapid succession from same session. Assert 429 on the 301st request. |
| 67 | `Org team list endpoint returns Retry-After header on 429`                      | Assert `Retry-After` header is present and contains a positive integer. |
| 68 | `Org team list endpoint rejects unauthenticated requests before rate limiting`  | Send unauthenticated request. Assert 401 (not 429), confirming auth check precedes rate limit check. |

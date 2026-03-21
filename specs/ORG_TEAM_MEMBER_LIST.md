# ORG_TEAM_MEMBER_LIST

Specification for ORG_TEAM_MEMBER_LIST.

## High-Level User POV

When you are part of an organization on Codeplane and want to see who belongs to a specific team, you can pull up the team's member list from the web UI, the CLI, or the TUI. This list is the definitive view of every person assigned to that team within the organization.

Each member entry shows their username, display name, and avatar. The list is paginated so that teams with many members remain easy to browse without overwhelming the screen. Whether you are an organization owner overseeing team composition or a regular member checking who is on your team, the experience is the same: a clear, scannable roster of teammates.

From the CLI, running `codeplane org team member list --org <org> --team <team>` gives you the same member data as structured JSON, making it straightforward to script team audits, pipe member lists into other tools, or quickly check who is on a team from the terminal. The TUI provides a browsable member list within the team detail screen.

This feature is scoped to organization members — you must be a member of the organization to see any team's member list. If you are not part of the organization, the team and its members are not visible to you. The list does not expose sensitive user details like email addresses, admin status, or login timestamps. It shows only the public-facing identity of each team member.

The team member list is a companion to the team detail view. From it, organization owners can add or remove members. Regular members use it to understand the composition of the teams they work alongside. It is the starting point for team-level collaboration, repository access decisions, and understanding who has what responsibilities within the organization.

## Acceptance Criteria

### Definition of Done

The feature is complete when any authenticated organization member can retrieve a paginated list of members belonging to a specific team within that organization, receiving consistent results across API, CLI, TUI, and web UI. Only users who are both organization members and assigned to the team appear in the list. Pagination, empty states, error handling, and response shape are consistent across all surfaces. Unauthenticated requests are rejected with 401. Non-members of the organization are rejected with 403. Nonexistent organizations or teams return 404.

### Functional Constraints

- [ ] The endpoint requires authentication. Unauthenticated requests return `401` with `"authentication required"`.
- [ ] The viewer must be a member of the specified organization (role `"owner"` or `"member"`). Non-members receive `403`.
- [ ] The organization name is resolved case-insensitively.
- [ ] The team name (slug) is resolved case-insensitively within the resolved organization.
- [ ] If the organization does not exist, the endpoint returns `404` with `"organization not found"`.
- [ ] If the team does not exist within the organization, the endpoint returns `404` with `"team not found"`.
- [ ] Each item in the response includes exactly these fields: `id`, `username`, `display_name`, `avatar_url`.
- [ ] The response never includes internal user fields such as `email`, `lower_email`, `lower_username`, `bio`, `wallet_address`, `user_type`, `is_active`, `is_admin`, `prohibit_login`, `email_notifications_enabled`, `last_login_at`, `created_at`, `updated_at`, `search_vector`.
- [ ] Team members are ordered by `id` ascending (deterministic, creation-order pagination).
- [ ] Default page size is 30 items.
- [ ] Maximum page size is 100 items. Requests for a page size exceeding 100 are clamped to 100 (not rejected).
- [ ] The response includes an `X-Total-Count` header containing the total number of members in the team.
- [ ] The response includes standard `Link` pagination headers (`rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`) when applicable.
- [ ] If the team has zero members, the endpoint returns `200` with an empty array `[]` and `X-Total-Count: 0`.
- [ ] Pagination beyond the last page returns `200` with an empty array (not 404).
- [ ] Both legacy pagination (`?page=N&per_page=M`) and cursor-based pagination (`?cursor=N&limit=M`) work.
- [ ] The endpoint supports PAT-based authentication in addition to session cookies.
- [ ] The `display_name` field defaults to an empty string `""` if the user has not set a display name.
- [ ] The `avatar_url` field defaults to an empty string `""` if the user has no avatar.

### Boundary Constraints

- [ ] **`id` in response:** Positive integer.
- [ ] **`username` in response:** 1–39 characters, `[a-zA-Z0-9-]`. May not start or end with a hyphen. May not contain consecutive hyphens.
- [ ] **`display_name` in response:** 0–255 characters. May contain Unicode. Empty string if not set.
- [ ] **`avatar_url` in response:** 0–2048 characters. Valid URL or empty string.
- [ ] **`page` parameter:** Positive integer ≥ 1. Values ≤ 0 are normalized to 1.
- [ ] **`per_page` / `limit` parameter:** Integer 1–100. Values > 100 are clamped to 100. Values ≤ 0 default to 30.
- [ ] **`cursor` parameter:** String-encoded non-negative integer offset. Non-numeric cursor values return 400 or are treated as offset 0.
- [ ] **Organization name in URL:** 1–39 characters. Case-insensitive resolution.
- [ ] **Team name in URL:** 1–50 characters. Case-insensitive resolution.

### Edge Cases

- [ ] A team with exactly one member returns an array of length 1.
- [ ] A team with 101 members returns exactly 30 on the first page (default) and appropriate pagination headers.
- [ ] Requesting `?page=2&per_page=100` when there are 50 total members returns an empty array with `X-Total-Count: 50`.
- [ ] Requesting `?per_page=0` uses the default (30), not zero.
- [ ] Requesting `?per_page=-1` uses the default (30).
- [ ] Requesting `?per_page=200` clamps to 100.
- [ ] Requesting `?page=0` normalizes to page 1.
- [ ] A member with an empty display name returns `display_name: ""`.
- [ ] A member with no avatar returns `avatar_url: ""`.
- [ ] A member whose display name contains emoji, CJK, or accented characters returns with correct encoding.
- [ ] Two rapid consecutive identical requests return identical results (idempotency).
- [ ] An expired or revoked PAT returns `401` (not `200` with an empty list).
- [ ] A user who was removed from the team no longer appears in the list on the next request.
- [ ] A user who is added to the team appears in the list on the next request.
- [ ] Requesting team members for an organization whose name differs only by case returns the same result (e.g., `Acme` vs `acme`).
- [ ] Requesting team members for a team whose name differs only by case returns the same result (e.g., `Backend` vs `backend`).
- [ ] A user who is removed from the organization but was a team member should no longer appear in the team member list (cascading removal).
- [ ] The same user cannot appear more than once in the response (no duplicate entries).
- [ ] An organization owner who is not a member of the team can still list the team's members.
- [ ] An organization member who is not a member of the team can still list the team's members (read access is org-wide).

## Design

### API Shape

#### `GET /api/orgs/:org/teams/:team/members`

**Description:** Retrieve a paginated list of members belonging to a specific team within an organization.

**Authentication:** Required. Session cookie or PAT `Authorization` header.

**Path parameters:**

| Parameter | Type   | Description                           |
|-----------|--------|---------------------------------------|
| `org`     | string | Organization name (case-insensitive)  |
| `team`    | string | Team slug/name (case-insensitive)     |

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
    "id": 42,
    "username": "alice",
    "display_name": "Alice Chen",
    "avatar_url": "https://codeplane.example.com/avatars/alice.png"
  },
  {
    "id": 87,
    "username": "bob",
    "display_name": "",
    "avatar_url": ""
  }
]
```

**Response headers:**

| Header          | Description                                                                                       |
|-----------------|---------------------------------------------------------------------------------------------------|
| `Content-Type`  | `application/json`                                                                                |
| `X-Total-Count` | Total number of members in the team                                                               |
| `Link`          | Standard pagination `Link` header with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable |

**Error responses:**

| Status                 | Condition                                        | Body                                            |
|------------------------|--------------------------------------------------|-------------------------------------------------|
| `401 Unauthorized`     | No valid session or token                        | `{ "message": "authentication required" }`      |
| `403 Forbidden`        | Authenticated user is not an org member           | `{ "message": "forbidden" }`                    |
| `404 Not Found`        | Organization does not exist                       | `{ "message": "organization not found" }`       |
| `404 Not Found`        | Team does not exist in this organization           | `{ "message": "team not found" }`               |
| `400 Bad Request`      | Invalid pagination parameters                     | `{ "message": "invalid pagination parameters" }`|
| `429 Too Many Requests`| Rate limit exceeded                               | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `OrgService` exposes:

```typescript
listTeamMembers(
  viewer: User | null,
  orgName: string,
  teamName: string,
  page: number,
  perPage: number,
): Promise<Result<{ items: User[]; total: number }, APIError>>
```

Where the returned `User[]` is mapped to:

```typescript
interface TeamMemberResponse {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}
```

The method:
1. Validates `viewer` is non-null (returns `unauthorized` otherwise).
2. Resolves the organization by name case-insensitively (returns `404` if not found).
3. Validates the viewer has `"owner"` or `"member"` role in the organization (returns `403` if not).
4. Resolves the team by name case-insensitively within the organization (returns `404` if not found).
5. Normalizes pagination parameters: clamp page ≥ 1, clamp perPage to 1–100, default 30.
6. Queries `listTeamMembers` with `ORDER BY u.id ASC` and LIMIT/OFFSET.
7. Counts total team members via `countTeamMembers`.
8. Maps each database row to `{ id, username }` (the route layer adds `display_name` and `avatar_url`).
9. Returns `{ items, total }`.

### CLI Command

#### `codeplane org team member list`

**Description:** List members in a specific team within an organization.

**Authentication:** Required. Uses the stored CLI session token.

**Arguments:**

| Argument | Type   | Required | Description          |
|----------|--------|----------|----------------------|
| `--org`  | string | Yes      | Organization name    |
| `--team` | string | Yes      | Team slug            |

**Options:**

| Flag       | Type   | Default | Description              |
|------------|--------|---------|--------------------------|
| `--limit`  | number | 30      | Number of results per page |
| `--page`   | number | 1       | Page number              |

**Output (JSON, with `--json`):**

```json
[
  {
    "id": 42,
    "username": "alice",
    "display_name": "Alice Chen",
    "avatar_url": "https://codeplane.example.com/avatars/alice.png"
  }
]
```

**Output (human-readable, default):**

```
Username    Display Name    Avatar
alice       Alice Chen      https://codeplane.example.com/avatars/alice.png
bob
```

**Empty state:** When the team has no members, human-readable output shows `"No team members found"` and JSON output returns `[]`.

**Error behavior:**
- Running without authentication → non-zero exit code, stderr: `Error: authentication required`
- Running with a nonexistent org → non-zero exit code, stderr: `Error: organization not found`
- Running with a nonexistent team → non-zero exit code, stderr: `Error: team not found`
- Running as a non-member of the org → non-zero exit code, stderr: `Error: forbidden`

### TUI UI

The TUI should include a team members view accessible from the team detail screen:

```
┌── Team Members: backend-team ───────────────────────────────────┐
│                                                                   │
│  👤  alice       Alice Chen                                       │
│  👤  bob                                                          │
│  👤  charlie     Charlie García                                   │
│                                                                   │
│  3 members total  Page 1 of 1                                     │
└───────────────────────────────────────────────────────────────────┘
```

- Each member row shows: avatar placeholder, username (bold), display name (dimmed).
- Pressing Enter on a member navigates to the user's profile view.
- Left/right arrow keys or `[` / `]` navigate pages when there are multiple pages.
- The total member count is shown at the bottom.
- Empty state: `"This team has no members yet."`

### Web UI Design

**Location:** Organization Settings → Teams → Team Detail → Members tab (`/:org/-/teams/:team/members`)

**Layout:**

- **Section heading:** "Members" with a count badge showing the total number of members (e.g., "Members (12)").
- **Add member button:** Visible only to organization owners. A "Add member" action in the section header. Opens a search/autocomplete dropdown of organization members not yet on this team.
- **Member list:** Each member is displayed as a row/card with:
  - **Avatar:** User's avatar image (circular, 32px), with a default placeholder if no avatar is set.
  - **Username** (bold, primary text): Clickable link to the user's profile at `/:username`.
  - **Display name** (secondary text, dimmed): Shown beside or below the username. Omitted if empty.
  - **Remove button:** Visible only to organization owners. A destructive action (red icon/text) with confirmation before removal.
- **Pagination controls:** Below the list with page numbers and prev/next buttons. Hidden when there is only one page.
- **Empty state:** When the team has no members, show a centered message: "This team has no members yet." with an "Add member" call-to-action button (visible only to owners).
- **Loading state:** A skeleton loader matching the row layout while the API call is in flight.
- **Error state:** If the API call fails, show an inline error banner: "Failed to load team members. Please try again." with a retry button.

**Interactions:**

- The list refreshes automatically after a member is added or removed (no manual page reload required).
- Clicking the remove button opens a confirmation modal: "Remove '[username]' from team '[team name]'? They will lose access to all repositories assigned to this team." with "Cancel" and "Remove" buttons.
- Avatars that fail to load fall back to a default silhouette placeholder.

### Documentation

The following end-user documentation should be written:

1. **API Reference — List Team Members:** Document `GET /api/orgs/:org/teams/:team/members` with request/response examples, pagination headers, error codes, and field descriptions. Include notes on both legacy and cursor pagination styles. Note the authentication and authorization requirements (must be an org member).

2. **CLI Reference — `codeplane org team member list`:** Document the command with output examples in both human-readable and JSON formats. Document the `--org` and `--team` arguments and pagination options. Document error behavior for unauthenticated sessions, nonexistent orgs/teams, and unauthorized access.

3. **User Guide — Managing Teams:** A section within the team management guide explaining how to view team members from the web UI, CLI, and TUI. Include guidance on pagination for large teams and links to the team member add/remove documentation.

## Permissions & Security

### Authorization Model

| Role                              | Can list team members?                                                                 |
|-----------------------------------|----------------------------------------------------------------------------------------|
| Anonymous (unauthenticated)       | ❌ No — returns 401                                                                    |
| Authenticated non-org-member      | ❌ No — returns 403                                                                    |
| Org member (role: `member`)       | ✅ Yes — can see all teams' members within the org, regardless of own team membership   |
| Org owner (role: `owner`)         | ✅ Yes — can see all teams' members within the org                                      |
| PAT-authenticated org member      | ✅ Yes — same access as session-authenticated org member                                |
| Instance admin (not org member)   | ❌ No — org membership is required; instance admin alone does not grant org-scoped access via this endpoint |

This endpoint is scoped to the organization's team. It never returns members of teams in other organizations. An org member can see the composition of any team within their organization, even teams they do not belong to.

### Rate Limiting

- **Authenticated callers:** 300 requests per minute per token/session.
- **Rate limit response:** `429 Too Many Requests` with `Retry-After` header indicating seconds until reset.
- Rate limiting is enforced at the middleware layer, shared with other organization-scoped endpoints.
- Since this endpoint requires authentication, anonymous rate limits do not apply.

### Data Privacy Constraints

- **Membership-scoped:** The SQL query joins `team_members` to `users` filtered by team ID. Only users assigned to the specified team are returned.
- **No internal fields exposed:** The `TeamMemberResponse` mapping explicitly selects only four fields: `id`, `username`, `display_name`, `avatar_url`. Internal user fields such as `email`, `lower_email`, `bio`, `wallet_address`, `is_active`, `is_admin`, `prohibit_login`, `email_notifications_enabled`, `last_login_at`, `created_at`, `updated_at`, and `search_vector` are never included in the response.
- **No cross-org visibility:** The endpoint resolves the org and validates membership before querying team members. A user in one org cannot see teams or members in another org.
- **No PII exposure:** The response contains only public-facing user identity (username, display name, avatar URL). No email addresses, IP addresses, login history, or administrative flags are included.
- **Avatar URL safety:** Avatar URLs are user-controlled and may point to external resources. Clients should treat them as untrusted content.

## Telemetry & Product Analytics

### Key Business Events

| Event Name                    | When Fired                                                  | Properties                                                                                               |
|-------------------------------|-------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `TeamMemberListViewed`        | On successful 200 response from `GET /api/orgs/:org/teams/:team/members` | `user_id`, `org_name`, `team_name`, `client` (web/cli/tui/api/desktop/vscode/neovim), `response_time_ms`, `result_count`, `total_count`, `page`, `per_page` |
| `TeamMemberListEmpty`         | On successful 200 response with zero results and page 1     | `user_id`, `org_name`, `team_name`, `client`                                                             |
| `TeamMemberListPaginated`     | On successful 200 response with page > 1                    | `user_id`, `org_name`, `team_name`, `client`, `page`, `per_page`, `total_count`                          |
| `TeamMemberListUnauthorized`  | On 401 response                                              | `client`, `client_ip` (hashed), `auth_method_attempted` (cookie/pat/none)                                |
| `TeamMemberListForbidden`     | On 403 response                                              | `user_id`, `org_name`, `client`                                                                          |
| `TeamMemberListNotFound`      | On 404 response                                              | `user_id`, `org_name`, `team_name`, `not_found_entity` (org/team), `client`                              |

### Event Properties

- `user_id` (number): The authenticated user's ID.
- `org_name` (string): The organization name from the request path.
- `team_name` (string): The team name from the request path.
- `client` (string enum): One of `"web"`, `"cli"`, `"tui"`, `"api"`, `"desktop"`, `"vscode"`, `"neovim"`.
- `response_time_ms` (number): Server-side response latency in milliseconds.
- `result_count` (number): Number of items returned in this page.
- `total_count` (number): Total number of members in the team.
- `page` (number): Current page number.
- `per_page` (number): Page size used.
- `client_ip` (string): Hashed IP address for 401 analysis (never stored as raw IP).
- `auth_method_attempted` (string enum): One of `"cookie"`, `"pat"`, `"none"`.
- `not_found_entity` (string enum): One of `"org"`, `"team"`.

### Funnel Metrics and Success Indicators

- **Team member list view volume:** Total `TeamMemberListViewed` events per day, segmented by client. Indicates whether users actively review team composition.
- **Empty team rate:** Ratio of `TeamMemberListEmpty` to total `TeamMemberListViewed` on page 1. A high rate (> 40%) may indicate teams are being created but not populated, signaling an onboarding gap.
- **Pagination depth:** Distribution of `page` values from `TeamMemberListPaginated` events. A heavy tail indicates teams with many members.
- **Team member list → member profile click-through rate (web only):** Percentage of `TeamMemberListViewed` events followed by a user profile view event within the same session.
- **Team member list → add/remove action rate (web only):** Percentage of `TeamMemberListViewed` events by org owners that lead to an add or remove action within the same session. Indicates the list is used for management, not just browsing.
- **CLI vs web split:** Client distribution of `TeamMemberListViewed`. Tracks CLI adoption for team administration.
- **Forbidden attempt rate:** Volume of `TeamMemberListForbidden` events. Sustained spikes may indicate users trying to access teams in orgs they are not members of — potential UX issue with navigation or permissions messaging.
- **Not found rate:** Volume of `TeamMemberListNotFound` events. High rates may indicate broken links, stale bookmarks, or recently deleted teams.

## Observability

### Logging Requirements

| Log Point                                     | Level   | Structured Fields                                                       | Condition                               |
|-----------------------------------------------|---------|-------------------------------------------------------------------------|------------------------------------------|
| Team member list request received             | `DEBUG` | `user_id`, `request_id`, `org_name`, `team_name`, `page`, `per_page`   | Every authenticated request              |
| Team member list succeeded                    | `INFO`  | `user_id`, `request_id`, `org_name`, `team_name`, `duration_ms`, `result_count`, `total_count` | 200 response        |
| Team member list unauthorized                 | `WARN`  | `request_id`, `client_ip`, `auth_method_attempted`                      | 401 response                             |
| Team member list forbidden                    | `WARN`  | `user_id`, `request_id`, `org_name`                                     | 403 response                             |
| Team member list not found (org)              | `INFO`  | `user_id`, `request_id`, `org_name`                                     | 404 (org not found)                      |
| Team member list not found (team)             | `INFO`  | `user_id`, `request_id`, `org_name`, `team_name`                        | 404 (team not found)                     |
| Team member list bad request                  | `WARN`  | `request_id`, `user_id`, `reason`                                       | 400 response                             |
| Team member list internal error               | `ERROR` | `user_id`, `request_id`, `error_message`, `stack_trace`                 | 500 response                             |
| Rate limit exceeded on team member list       | `WARN`  | `user_id`, `request_id`, `rate_limit_bucket`                            | 429 response                             |
| Pagination clamped                            | `DEBUG` | `user_id`, `request_id`, `requested_per_page`, `clamped_per_page`       | When per_page > 100 is clamped           |
| Pagination page normalized                    | `DEBUG` | `user_id`, `request_id`, `requested_page`, `normalized_page`            | When page ≤ 0 is normalized to 1         |

### Prometheus Metrics

| Metric                                                   | Type      | Labels                                          | Description                                                      |
|----------------------------------------------------------|-----------|-------------------------------------------------|------------------------------------------------------------------|
| `codeplane_team_member_list_requests_total`              | Counter   | `status` (200, 400, 401, 403, 404, 429, 500), `client` | Total team member list requests                         |
| `codeplane_team_member_list_request_duration_seconds`    | Histogram | `status`                                        | Response latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_team_member_list_result_count`                | Histogram | —                                               | Distribution of result counts per page (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_team_member_list_total_count`                 | Histogram | —                                               | Distribution of total team member counts per query (buckets: 0, 1, 2, 5, 10, 25, 50, 100, 250) |
| `codeplane_team_member_list_unauthorized_total`          | Counter   | `auth_method_attempted`                         | Total 401s on team member list requests                          |
| `codeplane_team_member_list_forbidden_total`             | Counter   | —                                               | Total 403s (non-org-member access attempts)                      |
| `codeplane_team_member_list_not_found_total`             | Counter   | `entity` (org, team)                            | Total 404s on team member list requests                          |

### Alerts

#### Alert: Team Member List Endpoint Elevated Latency

**Condition:** `histogram_quantile(0.99, rate(codeplane_team_member_list_request_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database connection pool health via `SELECT count(*) FROM pg_stat_activity;`.
2. Check if slow queries exist via `pg_stat_statements` for `ListTeamMembers` and `CountTeamMembers` queries.
3. Verify the `team_members.team_id` column has an index. Run `EXPLAIN ANALYZE` on the listing query with a known team_id.
4. Check if a team with an unusually large number of members is being queried repeatedly, causing large OFFSET scans. Inspect the `codeplane_team_member_list_total_count` histogram for outliers.
5. Check if the server is under memory pressure or CPU contention from concurrent requests.
6. Verify the `JOIN users u ON u.id = tm.user_id` path is using an index on `users.id` (primary key).
7. If the problem is OFFSET-based pagination degradation for deep pages: consider adding keyset pagination using `(u.id)` as the cursor key.

#### Alert: Team Member List Endpoint 5xx Spike

**Condition:** `rate(codeplane_team_member_list_requests_total{status="500"}[5m]) > 0.1` sustained for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server error logs for stack traces associated with the team member list route (`GET /api/orgs/:org/teams/:team/members`).
2. Common causes: database connection failure, `mapTeamMembersResponse` mapping error (e.g., unexpected null on `display_name` or `avatar_url` when the `??` fallback fails), pagination arithmetic overflow.
3. Verify database connectivity: attempt a direct SQL query against `team_members JOIN users`.
4. Check for recent deployments. If the 5xx spike correlates with a deploy, consider rolling back.
5. If the error is in the mapping function: check if a database migration changed the `users` row shape without updating the TypeScript mapper.
6. Verify the `team_members` join is still valid — check for schema changes to the `team_members` or `users` table.

#### Alert: Elevated Unauthorized Rate on Team Member List

**Condition:** `rate(codeplane_team_member_list_unauthorized_total[5m]) > 5` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a deployment broke session or PAT validation middleware.
2. Query recent `TeamMemberListUnauthorized` events to understand the distribution of `auth_method_attempted`. If all are `"cookie"`, check session storage health. If all are `"pat"`, check PAT validation logic.
3. Check if an external integration or CI system is making unauthenticated calls to this endpoint by mistake.
4. If from a single IP block: check for credential stuffing or brute-force patterns. Consider escalating rate limiting.
5. Verify that auth middleware is correctly loaded and running before the team member list route handler.

#### Alert: Elevated Forbidden Rate on Team Member List

**Condition:** `rate(codeplane_team_member_list_forbidden_total[5m]) > 10` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a recent UI change exposed team member list links to non-org-members (e.g., public team pages linking to member lists without checking org membership).
2. Query recent `TeamMemberListForbidden` events. If concentrated on a few orgs, check if those orgs recently changed membership policies.
3. If the 403s are from API/CLI clients, check if a third-party integration is attempting to enumerate team members across multiple orgs.
4. Verify the `requireOrgRole` check in the service layer is functioning correctly.
5. No immediate action required unless combined with other suspicious access patterns.

#### Alert: Abnormal Empty Team Member List Rate

**Condition:** `rate(codeplane_team_member_list_result_count_bucket{le="0"}[15m]) / rate(codeplane_team_member_list_requests_total{status="200"}[15m]) > 0.9` sustained for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Verify the `team_members` table has data. Run `SELECT COUNT(*) FROM team_members;`.
2. Check if a migration or bulk operation accidentally deleted team membership rows.
3. Verify the `countTeamMembers` and `listTeamMembers` queries are functioning: test manually with a known team_id that should have members.
4. If this is a data issue: restore from backup or investigate the deletion. If this is a query bug: check the SQL or team_id resolution logic.

### Error Cases and Failure Modes

| Failure Mode                                   | Expected Behavior                  | User-Visible Error                               |
|------------------------------------------------|------------------------------------|--------------------------------------------------|
| No auth cookie or PAT provided                 | 401 Unauthorized                   | `"authentication required"`                      |
| Expired or revoked PAT                         | 401 Unauthorized                   | `"authentication required"`                      |
| User is not a member of the organization       | 403 Forbidden                      | `"forbidden"`                                    |
| Organization does not exist                    | 404 Not Found                      | `"organization not found"`                       |
| Team does not exist in this organization       | 404 Not Found                      | `"team not found"`                               |
| Database connection lost                       | 500 Internal Server Error          | `"internal server error"`                        |
| `mapTeamMembersResponse` receives null field   | 500 (should not happen if DB schema is correct) | `"internal server error"`           |
| `per_page` set to extremely large value        | Clamped to 100, 200 response       | Normal paginated response                        |
| Negative page number                           | Normalized to page 1, 200 response | Normal first-page response                       |
| Non-numeric cursor value                       | 400 Bad Request                    | `"invalid pagination parameters"`                |
| Concurrent member removal during request       | Stale count possible; member may be missing from page | Normal response (eventually consistent) |
| Concurrent member addition during request      | May not appear until next request   | Normal response (eventually consistent)          |
| Rate limit exceeded                            | 429                                | `"rate limit exceeded"` with `Retry-After` header |
| OFFSET exceeds total rows                      | Empty array returned, 200          | Empty result set                                 |
| Team was deleted between org resolution and team resolution | 404 Not Found           | `"team not found"`                               |

## Verification

### API Integration Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 1  | `GET team members returns 200 with correct shape`                               | Authenticate as an org member. Create a team with at least one member. Request member list. Assert 200 and each item has exactly the 4 required fields (`id`, `username`, `display_name`, `avatar_url`). |
| 2  | `GET team members returns only team members`                                    | Create user A and user B as org members. Add only user A to the team. Request member list. Assert response contains user A and does not contain user B. |
| 3  | `GET team members returns members ordered by id ascending`                      | Add 3 users to a team. Request member list. Assert items are sorted by `id` ascending. |
| 4  | `GET team members excludes internal user fields`                                | Assert response items do NOT contain `email`, `lower_email`, `lower_username`, `bio`, `wallet_address`, `user_type`, `is_active`, `is_admin`, `prohibit_login`, `email_notifications_enabled`, `last_login_at`, `created_at`, `updated_at`, `search_vector`, or any field beyond the 4 specified. |
| 5  | `GET team members without authentication returns 401`                           | Request team member list with no auth header or cookie. Assert 401 with body `{ "message": "authentication required" }`. |
| 6  | `GET team members with expired PAT returns 401`                                 | Create a PAT, revoke it, request team member list. Assert 401. |
| 7  | `GET team members as non-org-member returns 403`                                | Authenticate as a user who is NOT a member of the organization. Request team member list. Assert 403. |
| 8  | `GET team members for nonexistent org returns 404`                              | Request team members for an org name that does not exist. Assert 404 with `"organization not found"`. |
| 9  | `GET team members for nonexistent team returns 404`                             | Request team members for a team name that does not exist within a valid org. Assert 404 with `"team not found"`. |
| 10 | `GET team members returns empty array for team with no members`                 | Create a team with no members. Request member list. Assert 200, body is `[]`, `X-Total-Count: 0`. |
| 11 | `GET team members default pagination is 30`                                     | Create a team with 35 members. Request without pagination params. Assert response has exactly 30 items and `X-Total-Count: 35`. |
| 12 | `GET team members respects per_page`                                            | Request with `?per_page=5`. Assert response has exactly 5 items (assuming team has >= 5 members). |
| 13 | `GET team members clamps per_page to 100`                                       | Create a team with 105 members. Request with `?per_page=200`. Assert response has exactly 100 items. |
| 14 | `GET team members page 2 returns next set`                                      | Create team with 35 members. Request `?page=1&per_page=20` and `?page=2&per_page=20`. Assert page 1 has 20 items, page 2 has 15 items, no overlap in IDs. |
| 15 | `GET team members page beyond last returns empty`                               | Create team with 5 members. Request `?page=2&per_page=30`. Assert 200 with empty array. |
| 16 | `GET team members cursor pagination works`                                      | Request with `?cursor=0&limit=10`, then `?cursor=10&limit=10`. Assert no overlap and correct offset behavior. |
| 17 | `GET team members X-Total-Count header is correct`                              | Create team with 7 members. Assert `X-Total-Count` header equals `7`. |
| 18 | `GET team members Link header contains pagination links`                        | Create team with 50 members. Request `?page=2&per_page=10`. Assert `Link` header contains `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`. |
| 19 | `GET team members works with PAT authentication`                                | Request team member list with a valid PAT from an org member. Assert 200 and same content as session-authenticated request. |
| 20 | `GET team members id is a number not a string`                                  | Assert `typeof item.id === "number"` for each item. |
| 21 | `GET team members per_page=0 defaults to 30`                                    | Request with `?per_page=0`. Assert response has up to 30 items. |
| 22 | `GET team members page=0 normalizes to page 1`                                  | Request with `?page=0`. Assert response is the same as `?page=1`. |
| 23 | `GET team members per_page=-1 defaults to 30`                                   | Request with `?per_page=-1`. Assert response has up to 30 items. |
| 24 | `GET team members display_name with Unicode`                                    | Add a user with display_name `"Ñoño 日本 🚀"`. Request member list. Assert round-trip fidelity of `display_name`. |
| 25 | `GET team members with empty display_name`                                      | Add a user with no display name set. Request member list. Assert `display_name: ""` for that user. |
| 26 | `GET team members with empty avatar_url`                                        | Add a user with no avatar set. Request member list. Assert `avatar_url: ""` for that user. |
| 27 | `GET team members with max per_page=100 and exactly 100 members`                | Create team with exactly 100 members. Request with `?per_page=100`. Assert response has exactly 100 items. |
| 28 | `GET team members with per_page=101 clamps to 100`                              | Request with `?per_page=101`. Assert response has at most 100 items (clamped, not rejected). |
| 29 | `GET team members response Content-Type is application/json`                    | Assert `Content-Type` header is `application/json`. |
| 30 | `GET team members idempotency`                                                   | Make the same request twice rapidly. Assert both return identical 200 responses. |
| 31 | `GET team members org name is case-insensitive`                                 | Create org `AcmeCorp`. Request team members using `acmecorp`, `ACMECORP`, and `AcmeCorp`. Assert all return the same 200 response. |
| 32 | `GET team members team name is case-insensitive`                                | Create team `Backend`. Request team members using `backend`, `BACKEND`, and `Backend`. Assert all return the same 200 response. |
| 33 | `GET team members reflects add membership`                                       | List members (note count). Add a new member to the team. List again. Assert count increased by 1 and new member is present. |
| 34 | `GET team members reflects remove membership`                                    | List members (note user). Remove a member from the team. List again. Assert the removed member no longer appears. |
| 35 | `GET team members no duplicates`                                                 | Add a user to a team. List members. Assert the user appears exactly once. Attempt to add the same user again (expect conflict/ignore). List members again. Assert the user still appears exactly once. |
| 36 | `GET team members org member non-team-member can view`                          | Authenticate as an org member who is NOT a member of the team. Request team member list. Assert 200 (read access is org-wide). |
| 37 | `GET team members org owner non-team-member can view`                           | Authenticate as an org owner who is NOT a member of the team. Request team member list. Assert 200. |
| 38 | `GET team members Link header first page has no prev`                           | Request `?page=1&per_page=10` for a team with 5 members. Assert `Link` header contains `rel="first"` and `rel="last"` but does NOT contain `rel="prev"` or `rel="next"`. |
| 39 | `GET team members Link header last page has no next`                            | Request `?page=5&per_page=10` for a team with 50 members. Assert `Link` header does NOT contain `rel="next"`. |

### CLI E2E Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 40 | `codeplane org team member list returns team members`                           | Run `codeplane org team member list --org <org> --team <team> --json`. Assert exit code 0, assert array contains at least the seeded member. |
| 41 | `codeplane org team member list --json output has correct fields`              | Parse stdout as JSON array. Assert each item has `id`, `username`, `display_name`, `avatar_url` and no extra fields. |
| 42 | `codeplane org team member list without auth returns error`                    | Run `codeplane org team member list --org <org> --team <team>` without a stored session. Assert non-zero exit code and stderr contains `"authentication required"`. |
| 43 | `codeplane org team member list for nonexistent org returns error`             | Run with a nonexistent org name. Assert non-zero exit code and stderr contains `"organization not found"` or `"not found"`. |
| 44 | `codeplane org team member list for nonexistent team returns error`            | Run with a valid org but nonexistent team. Assert non-zero exit code and stderr contains `"team not found"` or `"not found"`. |
| 45 | `codeplane org team member list with no members shows empty`                   | Create a team with no members. Run `codeplane org team member list --org <org> --team <team> --json`. Assert exit code 0 and output is `[]`. |
| 46 | `codeplane org team member list reflects member add`                           | Add a member to the team. Run list. Assert the new member appears in the response. |
| 47 | `codeplane org team member list reflects member remove`                        | Remove a member from the team. Run list. Assert the removed member no longer appears. |
| 48 | `codeplane org team member list round-trip: add, list, remove, list`           | Add a member. List (assert present). Remove the member. List again (assert absent). |

### Web UI E2E Tests (Playwright)

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 49 | `Team members page renders for org member`                                      | Navigate to `/:org/-/teams/:team/members` while authenticated as an org member. Assert the page loads and shows member rows or an empty state. |
| 50 | `Team members page shows correct member count`                                  | Authenticate as an org member. Navigate to the team members page for a team with known members. Assert the visible items match the expected count. |
| 51 | `Team members row displays username, display_name, and avatar`                  | Assert at least one member row contains username (linked), display name, and avatar image/placeholder. |
| 52 | `Team members username links to user profile`                                   | Click on a member's username. Assert navigation to `/:username`. |
| 53 | `Team members page shows empty state for team with no members`                  | Navigate to members page for an empty team. Assert empty state message is visible. |
| 54 | `Team members page pagination works`                                            | Authenticate for a team with > 30 members. Assert pagination controls are visible. Click "Next". Assert new members load. |
| 55 | `Team members page requires authentication`                                     | Navigate to the team members page while unauthenticated. Assert redirect to login or 401 error. |
| 56 | `Team members page shows add button for org owners`                             | Authenticate as an org owner. Navigate to team members. Assert "Add member" button is visible. |
| 57 | `Team members page hides add button for non-owner org members`                  | Authenticate as an org member (non-owner). Navigate to team members. Assert "Add member" button is NOT visible. |
| 58 | `Team members page shows remove button for org owners`                          | Authenticate as an org owner. Navigate to team members for a team with at least one member. Assert remove/delete button is visible on member rows. |
| 59 | `Team members page loading state shows skeleton`                                | Navigate to team members with network throttling. Assert a skeleton or loading indicator is visible before the member list renders. |
| 60 | `Team members page shows error state on API failure`                            | Intercept the `GET /api/orgs/:org/teams/:team/members` request and force a 500 response. Navigate to team members page. Assert an error message is visible with a retry option. |
| 61 | `Team members retry button on error state re-fetches`                           | Force a 500 on first load, then allow the second request to succeed. Click retry. Assert the member list loads correctly. |

### TUI Integration Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 62 | `TUI team member list screen renders for authenticated org member`              | Navigate to team members screen in TUI. Assert screen contains member usernames. |
| 63 | `TUI team member list screen shows empty state`                                 | Navigate to team members screen for an empty team. Assert empty state message. |
| 64 | `TUI team member list screen pagination`                                        | Navigate to team members for a team with many members. Assert pagination indicators and navigation work. |
| 65 | `TUI team member list Enter navigates to user profile`                          | Navigate to team member list, press Enter on a member. Assert navigation to user profile screen. |

### Rate Limiting Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 66 | `Team member list endpoint returns 429 after rate limit exceeded`               | Send 301 authenticated requests in rapid succession from same session. Assert 429 on the 301st request. |
| 67 | `Team member list endpoint returns Retry-After header on 429`                   | Assert `Retry-After` header is present and contains a positive integer. |
| 68 | `Team member list endpoint rejects unauthenticated requests before rate limiting` | Send unauthenticated request. Assert 401 (not 429), confirming auth check precedes rate limit check. |

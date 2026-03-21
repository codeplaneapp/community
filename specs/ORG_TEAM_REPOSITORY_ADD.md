# ORG_TEAM_REPOSITORY_ADD

Specification for ORG_TEAM_REPOSITORY_ADD.

## High-Level User POV

When an organization owner wants to give a team access to a specific repository, they use the "add repository to team" action. This is the primary mechanism for connecting teams to the codebases they work on — instead of granting individual users access to individual repositories, the owner assigns repositories to teams, and every member of that team automatically inherits access at the team's permission level (read, write, or admin).

The workflow is simple. An organization owner identifies a repository that belongs to their organization and assigns it to one of the organization's teams. This can be done from the CLI, by calling the API directly, or (when the team management UI is fully implemented) from the web UI's team detail page. The repository is immediately associated with the team, and from that point forward every team member can access it according to the team's permission level.

There is one critical constraint: only repositories owned by the same organization can be assigned to that organization's teams. You cannot assign a user-owned repository or a repository belonging to a different organization to a team. This ensures that team-based access control stays within organizational boundaries and prevents unintended cross-organization access.

The action is not silently idempotent — if you attempt to assign a repository that is already associated with the team, you receive a clear conflict error. This protects against automation scripts or concurrent UI actions accidentally creating duplicate state and makes it explicit when an assignment already exists.

The feature provides value by enabling organizations to structure repository access at the team level rather than the individual level. When a new engineer joins a team, they gain access to all the right repositories at once. When a team takes ownership of a new service, the owner assigns the repository and everyone on the team can start working immediately.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a `401 Unauthorized` response.
- **Organization owner required**: Only users who hold the `owner` role within the organization may add repositories to teams. Users with `member` role must receive a `403 Forbidden` response.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return a `404 Not Found` response with message `"organization not found"`.
- **Team must exist**: If the team name does not resolve to a valid team within the resolved organization, the endpoint must return a `404 Not Found` response with message `"team not found"`.
- **Repository must exist**: If the owner/repo combination does not resolve to an existing repository, the endpoint must return a `404 Not Found` response with message `"repository not found"`.
- **Repository must belong to the organization**: If the repository exists but does not belong to the same organization as the team, the endpoint must return a `422 Validation Failed` response with `resource: "TeamRepo"`, `field: "repository"`, `code: "invalid"`.
- **No duplicate assignments**: If the repository is already assigned to the team, the endpoint must return a `409 Conflict` response with message `"repository is already assigned to team"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive team lookup**: The team name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive owner/repo lookup**: The `:owner` and `:repo` path parameters must be trimmed and lowercased before lookup.
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return `400 Bad Request` with message `"organization name is required"`.
- **Empty team name**: A request with an empty or whitespace-only `:team` path parameter must return `400 Bad Request` with message `"team name is required"`.
- **Empty owner**: A request with an empty or whitespace-only `:owner` path parameter must return `400 Bad Request` with message `"owner is required"`.
- **Empty repo name**: A request with an empty or whitespace-only `:repo` path parameter must return `400 Bad Request` with message `"repository name is required"`.
- **Org name max length**: Organization names longer than 255 characters must return `404` (no org will match, enforced at creation time).
- **Team name max length**: Team names longer than 255 characters must return `404` (no team will match, enforced at creation time).
- **Repo name max length**: Repository names longer than 100 characters must return `404` (no repo will match, enforced at creation time).
- **No request body required**: The PUT request requires no body — all parameters are conveyed via path segments.
- **Response code on success**: A successful add must return `204 No Content` with an empty body.
- **Idempotent safety**: The operation uses PUT semantics. On first add it succeeds with 204. On duplicate add it returns 409 Conflict.
- **Special characters in path parameters**: URL-encoded special characters (e.g., `%20`, `%2F`) must be decoded and trimmed before lookup. Only valid slug characters should match existing entities.
- **CLI consistency**: The CLI `org team repo add <repo> --org <org> --team <team>` command must call the correct API endpoint and report success or error clearly.
- **Repo format in CLI**: The CLI accepts the repository in `OWNER/REPO` format and parses it into separate `owner` and `repo` path segments for the API call.
- **No data leakage**: The 204 success response must not include any body content. Error responses must not expose internal IDs, stack traces, or database details.
- **Content-Type on errors**: Error responses must include `Content-Type: application/json` header.
- **Assigned repo appears in team repo list**: After successful assignment, the repository must appear in the `GET /api/orgs/:org/teams/:team/repos` response.
- **Cross-org repos rejected**: Attempting to assign a repository owned by a different organization must be rejected with a 422 validation error.
- **User-owned repos rejected**: Attempting to assign a user-owned repository (not org-owned) must be rejected with a 422 validation error.

### Definition of Done

- The `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo` route correctly assigns a repository to a team when all preconditions are met.
- Non-owners, unauthenticated users, and invalid inputs are correctly rejected with appropriate status codes and error messages.
- The org-ownership prerequisite is enforced atomically via `addTeamRepoIfOrgRepo`.
- Duplicate assignments are caught via unique constraint and return 409 Conflict.
- Organization name and team name are resolved case-insensitively.
- Owner and repo name are trimmed and lowered before lookup.
- CLI `org team repo add` command works end-to-end.
- All verification tests pass.
- Observability instrumentation is in place.
- Documentation for the API endpoint and CLI command is published.

## Design

### API Shape

**Endpoint**: `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo`

**Path Parameters**:

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |
| `team`    | string | Yes      | Team name / slug (case-insensitive, resolved via `lower_name`) |
| `owner`   | string | Yes      | Repository owner name (case-insensitive, trimmed and lowercased) |
| `repo`    | string | Yes      | Repository name (case-insensitive, trimmed and lowercased) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`

**Request Body**: None. All parameters are in the URL path.

**Response** (204 No Content): Empty body.

**Error Responses**:

| Status | Condition | Error Message |
|--------|----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 400    | Empty or whitespace-only `:team` path parameter | `"team name is required"` |
| 400    | Empty or whitespace-only `:owner` path parameter | `"owner is required"` |
| 400    | Empty or whitespace-only `:repo` path parameter | `"repository name is required"` |
| 401    | No valid session cookie or PAT provided | `"authentication required"` |
| 403    | Authenticated user is not an org owner | `"forbidden"` |
| 404    | Organization does not exist | `"organization not found"` |
| 404    | Team does not exist in the organization | `"team not found"` |
| 404    | Repository does not exist | `"repository not found"` |
| 409    | Repository is already assigned to the team | `"repository is already assigned to team"` |
| 422    | Repository exists but does not belong to the organization | Validation failed response with `resource: "TeamRepo"`, `field: "repository"`, `code: "invalid"` |

**Example (curl)**:
```bash
# Assign repo "acme-corp/api-server" to team "backend" in org "acme-corp"
curl -X PUT \
  -H "Authorization: token cpat_abc123" \
  https://codeplane.example/api/orgs/acme-corp/teams/backend/repos/acme-corp/api-server

# Response: 204 No Content (empty body)
```

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async addTeamRepo(
  actor: User,
  orgName: string,
  teamName: string,
  owner: string,
  repo: string,
): Promise<Result<void, APIError>>
```

The service: (1) validates authentication (returns 401 if `actor` is null), (2) resolves the org case-insensitively via `resolveOrg` (returns 404 if not found, 400 if empty), (3) verifies actor holds `owner` role via `requireOrgRole` (returns 403 if not), (4) resolves the team case-insensitively within the org via `resolveTeam` (returns 404 if not found, 400 if empty), (5) trims and lowercases the owner and repo name, (6) looks up the repository via `getRepoByOwnerAndLowerName` (returns 404 if not found), (7) calls `addTeamRepoIfOrgRepo` which atomically inserts only if the repository's `org_id` matches the team's `organization_id` (returns 422 if not an org-owned repo), (8) catches unique violations (returns 409 if duplicate), (9) returns `Result.ok(undefined)` on success.

### CLI Command

```
codeplane org team repo add <repo> --org <org> --team <team>
```

| Argument / Flag | Type   | Required | Description |
|-----------------|--------|----------|-------------|
| `repo`          | string | Yes      | Repository in `OWNER/REPO` format (e.g., `acme-corp/api-server`) |
| `--org`         | string | Yes      | Organization name |
| `--team`        | string | Yes      | Team slug / name |

The CLI parses the `repo` argument using `resolveRepoRef()` to extract `owner` and `repo` segments, then calls `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo`.

**Output on success**: The CLI exits with code 0. Because the API returns 204 No Content, the CLI produces no JSON output on success.

**Output on error**: The CLI exits with code 1 and prints the error message to stderr.

**Example**:
```bash
$ codeplane org team repo add acme-corp/api-server --org acme-corp --team backend
# (exits 0, no output — repository assigned)

$ codeplane org team repo add acme-corp/api-server --org acme-corp --team backend
Error: repository is already assigned to team
# (exits 1)

$ codeplane org team repo add alice/personal-repo --org acme-corp --team backend
Error: validation failed
# (exits 1 — repo is not org-owned)
```

### Web UI Design

**Status**: `Gated` — referenced in feature inventory as `ORG_TEAM_MANAGEMENT_UI` but not yet fully implemented. When implemented:

- The "Add Repository" action is accessible from the team detail page's "Repositories" tab, via an "Add Repository" button.
- Clicking "Add Repository" opens a dropdown/typeahead that searches across repositories owned by the organization.
- The typeahead displays: repository name, visibility badge (public/private), and description snippet for each candidate.
- Repositories that are already assigned to the team are shown but grayed out with an "Already assigned" label and are not selectable.
- Repositories that do not belong to the organization do not appear in the typeahead results — the search is scoped to org-owned repositories only.
- On selection, the PUT request fires immediately and the repository list updates optimistically.
- On conflict (409), a toast notification reads "Repository is already assigned to this team."
- On validation failure (422 — not an org-owned repo), a toast notification reads "Only organization-owned repositories can be assigned to teams."
- On 403, a toast notification reads "Only organization owners can assign repositories to teams."
- **Navigation**: breadcrumb trail showing `Org Name > Teams > Team Name > Repositories`.
- **Empty state**: If the team has no repositories, the repositories tab shows "No repositories assigned. Add a repository to get started." with the "Add Repository" button prominently displayed.

### TUI UI

**Status**: `Partial` — team repository management screens are designed but not yet fully implemented. When implemented:

- From the team detail screen, pressing `r` navigates to the repositories tab.
- Pressing `a` in the repositories tab opens a repository search input.
- The repository search is scoped to organization-owned repositories that are not yet assigned to the team.
- Arrow keys navigate candidates, Enter confirms the selection.
- On success, the repository list refreshes and a status line confirms "Added <owner>/<repo> to <team>."
- On error, the status line displays the error message (e.g., "Already assigned" or "Not an org-owned repository").
- `Esc` cancels the add action and returns to the repository list.

### Documentation

- **API reference**: `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo` — path parameters, success response (204), all error codes, example curl command.
- **CLI reference**: `codeplane org team repo add` — arguments, flags, example invocation, exit codes, common error scenarios including the `OWNER/REPO` format requirement.
- **Guide**: "Managing teams in your organization" — include a section on assigning repositories to teams, explaining the org-ownership constraint, how to assign repositories from the CLI and API, and common error scenarios.
- **Concept page**: reference the broader "Teams and access control" concept page explaining the relationship between org membership, team membership, team permission levels, and repository access.

## Permissions & Security

### Authorization Roles

| Role | Can add team repo? | Notes |
|------|-------------------|-------|
| Organization Owner | ✅ Yes | Full access to manage team repository assignments |
| Organization Member | ❌ No | 403 Forbidden — members cannot modify team repository composition |
| Authenticated non-member | ❌ No | 403 Forbidden — user is not in the organization |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- An additional per-user write rate limit should be considered for team repository mutations: no more than **60 add-repo requests per minute per authenticated user**. This prevents automated scripts from rapidly assigning hundreds of repositories and overwhelming webhook/notification delivery.
- The rate limit key should be scoped to `user_id + org_name` to avoid cross-org interference.

### Data Privacy

- The request path contains an organization name, team name, and repository owner/name — all of which are non-PII identifiers on the Codeplane platform.
- No PII is returned in the 204 success response (body is empty).
- Error messages reference the repository only in the validation failure case (422), where the repository reference was already provided by the caller.
- Audit logs recording the add action may contain the actor user ID, repository ID, org name, and team name. These are operational identifiers, not PII, but should follow the platform's data retention policies.
- The endpoint confirms repository existence via the 404 "repository not found" response. Since repository names are resolvable through other API surfaces, this does not constitute an information disclosure vulnerability. However, if repository existence should become a private concern, this should be reviewed.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamRepoAdded` | A successful 204 response is returned after assigning a repository to a team | `org_name`, `team_name`, `team_id`, `repo_owner`, `repo_name`, `repository_id`, `actor_user_id`, `team_permission`, `client` (`api`, `cli`, `web`, `tui`) |
| `OrgTeamRepoAddFailed` | A 4xx or 5xx response is returned | `org_name`, `team_name_attempted`, `repo_owner_attempted`, `repo_name_attempted`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `client` |
| `OrgTeamRepoAddConflict` | A 409 Conflict response is returned (duplicate assignment) | `org_name`, `team_name`, `repo_owner`, `repo_name`, `actor_user_id`, `client` |

### Funnel Metrics

- **Team repo assignment rate**: Number of successful team repository assignments per day/week, segmented by organization size. A healthy assignment rate indicates active team structuring.
- **Org repo → team assignment conversion**: Percentage of org-owned repositories that are assigned to at least one team within 7 days of creation. Low conversion may indicate that teams are underutilized or that the onboarding flow doesn't guide owners to team-based access control.
- **Assign-then-remove churn**: Percentage of team repository assignments that are reversed (repo removed from team) within 24 hours. High churn may indicate UX confusion or accidental assignments.
- **Org-ownership validation failure rate**: Percentage of add attempts that fail with 422 (not an org-owned repo). A high rate indicates that users are confused about the org-ownership constraint, suggesting the UI/docs should better communicate that only org-owned repos can be assigned.
- **Conflict rate**: Percentage of add attempts that return 409 (already assigned). A high rate from API/CLI clients may indicate automation retries or lack of idempotency awareness.
- **Client distribution**: Breakdown of successful assignments by client surface (API, CLI, web, TUI). Indicates which surfaces are driving team management.

### Success Indicators

- Team repo add API latency p50 < 30ms, p99 < 300ms (single INSERT with WHERE EXISTS check).
- Error rate < 0.1% of requests (excluding expected 401/403/404/409/422 responses).
- At least 60% of organizations with >3 repos and >1 team have at least one team-repo assignment within 30 days.
- Org-ownership validation failure rate (422) < 5% of total add attempts (indicates clarity about the org-owned constraint).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Team repo add request received | `debug` | `org_name`, `team_name`, `repo_owner`, `repo_name`, `actor_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Team not found | `info` | `org_name`, `team_name`, `request_id` |
| Repository not found | `info` | `org_name`, `team_name`, `repo_owner`, `repo_name`, `request_id` |
| Actor not org owner (403) | `info` | `org_name`, `actor_user_id`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `team_name`, `repo_owner`, `repo_name`, `request_id` |
| Repository not org-owned (422) | `info` | `org_name`, `team_name`, `repo_owner`, `repo_name`, `repository_id`, `request_id` |
| Repository already assigned (409) | `info` | `org_name`, `team_name`, `repo_owner`, `repo_name`, `repository_id`, `request_id` |
| Team repo added successfully | `info` | `org_name`, `team_name`, `repo_owner`, `repo_name`, `repository_id`, `team_id`, `actor_user_id`, `request_id` |
| Empty path parameter | `info` | `parameter_name`, `request_id` |
| Unexpected error during team repo add | `error` | `org_name`, `team_name`, `repo_owner`, `repo_name`, `actor_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_repo_add_requests_total` | counter | `status_code`, `org_name` | Total team repo add requests |
| `codeplane_org_team_repo_add_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_team_repo_add_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `conflict`, `validation`, `internal`) | Error breakdown by type |
| `codeplane_org_team_repos_total` | gauge | `org_name`, `team_name` | Current count of repositories per team (updated on add/remove) |

### Alerts

#### Alert: `OrgTeamRepoAddHighErrorRate`
- **Condition**: `rate(codeplane_org_team_repo_add_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context `org_team_repo_add`.
  2. Verify database connectivity — run a basic SELECT against the `team_repos` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label on the counter).
  4. Verify that the `teams`, `repositories`, and `team_repos` tables exist and have their expected indexes.
  5. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.addTeamRepo` method.
  6. Inspect the `addTeamRepoIfOrgRepo` query plan — verify the EXISTS subquery is using indexes on `teams(id)`, `repositories(id)`, and `repositories(org_id)`.
  7. Check for lock contention or deadlocks in `pg_locks` involving the `team_repos` table.
  8. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgTeamRepoAddHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_team_repo_add_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific organization (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the `addTeamRepoIfOrgRepo` query to verify indexes are being used.
  3. Check database connection pool utilization — a pool exhaustion issue would affect all endpoints.
  4. Verify no full table scans on `team_repos`, `repositories`, or `teams` tables via `pg_stat_user_tables`.
  5. Check for index bloat on the `team_repos` unique constraint — large numbers of additions and removals can cause B-tree bloat.
  6. If latency is concentrated during specific time windows, check for concurrent batch operations (e.g., automation scripts assigning many repos).

#### Alert: `OrgTeamRepoAddConflictSpike`
- **Condition**: `rate(codeplane_org_team_repo_add_errors_total{error_type="conflict"}[5m]) > 5 * avg_over_time(rate(codeplane_org_team_repo_add_errors_total{error_type="conflict"}[5m])[1h:5m])`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike is from a single source (user/IP) or distributed.
  2. High conflict rates usually indicate an automation script retrying assignments without checking current team repos. This is not harmful but wastes resources.
  3. If concentrated on a single user, contact the user/team to suggest they check existing assignments before adding.
  4. No immediate action required unless it causes latency or resource impact.

#### Alert: `OrgTeamRepoAddValidationSpike`
- **Condition**: `rate(codeplane_org_team_repo_add_errors_total{error_type="validation"}[10m]) / rate(codeplane_org_team_repo_add_requests_total[10m]) > 0.3`
- **Severity**: Info
- **Runbook**:
  1. A high validation failure rate (422) means users are frequently trying to assign non-org-owned repositories to teams.
  2. Check if this is concentrated on a specific client surface (web, CLI, API).
  3. If it's the web UI, the repository picker may not be filtering correctly — file a bug to ensure the typeahead only shows org-owned repositories.
  4. If it's the CLI/API, consider improving documentation to clarify the org-ownership constraint.
  5. No immediate operational action required.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Query timeout on addTeamRepoIfOrgRepo | 500 Internal Server Error | Check for missing indexes on `team_repos(team_id, repository_id)`, `repositories(id, org_id)`, `teams(id, organization_id)` |
| Unique constraint violation | 409 Conflict (`"repository is already assigned to team"`) | Expected behavior; client should handle gracefully |
| WHERE EXISTS returns no rows (repo not org-owned) | 422 Validation Failed | Expected behavior; only org-owned repos can be assigned |
| Foreign key violation (team or repo deleted during request) | 500 Internal Server Error (caught as "failed to add team repository") | Rare race condition; retry should resolve |
| Org deleted between org lookup and role check | 404 or 403 depending on timing | Race condition; retry will return 404 |
| Team deleted between team lookup and repo insert | Foreign key error caught as 500 | Rare; retry will return 404 for team |
| Repository deleted between repo lookup and insert | Foreign key error caught as 500 | Rare; retry will return 404 for repository |
| Actor's org owner role revoked during request | 403 on retry | Race condition; actor lost permission |
| Extremely long path parameter (>8KB URL) | 414 URI Too Long (web server level) or 404 | Expected behavior |

## Verification

### API Integration Tests

- **`test: returns 204 when org owner assigns an org-owned repo to a team`** — Create org, create team, create org-owned repo, call `PUT /api/orgs/:org/teams/:team/repos/:owner/:repo` as org owner, assert 204 and empty body.
- **`test: assigned repo appears in team repo list`** — Assign repo to team, call `GET /api/orgs/:org/teams/:team/repos`, assert the assigned repo appears in the list with correct `name`, `owner`, `description`, and `is_public`.
- **`test: returns 401 for unauthenticated request`** — Call endpoint with no session/token, assert 401.
- **`test: returns 403 when actor is org member but not owner`** — Create org, add a second user as org `member`, authenticate as that member, attempt to assign a repo to a team, assert 403.
- **`test: returns 403 when actor is authenticated but not an org member`** — Authenticate as a user who is not in the org, attempt to assign a team repo, assert 403.
- **`test: returns 404 for nonexistent organization`** — Call `PUT /api/orgs/nonexistent-org-xyz/teams/anyteam/repos/acme/myrepo`, assert 404.
- **`test: returns 404 for nonexistent team in valid org`** — Create org, call `PUT /api/orgs/:org/teams/nonexistent-team-xyz/repos/acme/myrepo`, assert 404 with message `"team not found"`.
- **`test: returns 404 for nonexistent repository`** — Create org, create team, call `PUT /api/orgs/:org/teams/:team/repos/acme/nonexistent-repo-xyz`, assert 404 with message `"repository not found"`.
- **`test: returns 422 when repository does not belong to the organization`** — Create org, create team, create a repo owned by a different user (not org-owned), attempt to assign it, assert 422 with validation error containing `resource: "TeamRepo"`, `field: "repository"`, `code: "invalid"`.
- **`test: returns 422 when repository belongs to a different organization`** — Create two orgs, create a repo in org A, attempt to assign it to a team in org B, assert 422.
- **`test: returns 409 when repository is already assigned to the team`** — Assign repo to team, attempt to assign same repo again, assert 409 with message `"repository is already assigned to team"`.
- **`test: returns 400 for empty org name`** — Call `PUT /api/orgs/%20/teams/myteam/repos/acme/myrepo`, assert 400 with message containing `"organization name is required"`.
- **`test: returns 400 for empty team name`** — Call `PUT /api/orgs/myorg/teams/%20/repos/acme/myrepo`, assert 400 with message containing `"team name is required"`.
- **`test: returns 400 for empty owner`** — Call `PUT /api/orgs/myorg/teams/myteam/repos/%20/myrepo`, assert 400 with message containing `"owner is required"`.
- **`test: returns 400 for empty repo name`** — Call `PUT /api/orgs/myorg/teams/myteam/repos/acme/%20`, assert 400 with message containing `"repository name is required"`.
- **`test: no request body is required`** — Call PUT with no body and no `Content-Type` header, assert 204 (given all preconditions are met).
- **`test: response has no body on success`** — Assign repo, assert response body is null/empty and status is 204.

### Case-Insensitivity Tests

- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", create team, create org-owned repo, call `PUT /api/orgs/myorg/teams/:team/repos/:owner/:repo`, assert 204.
- **`test: team name is resolved case-insensitively`** — Create org, create team "Backend", create org-owned repo, call `PUT /api/orgs/:org/teams/backend/repos/:owner/:repo`, assert 204.
- **`test: owner is resolved case-insensitively`** — Create org "AcmeCorp", create team, create org-owned repo, call `PUT /api/orgs/:org/teams/:team/repos/acmecorp/:repo`, assert 204.
- **`test: repo name is resolved case-insensitively`** — Create org, create team, create org-owned repo "ApiServer", call `PUT /api/orgs/:org/teams/:team/repos/:owner/apiserver`, assert 204.
- **`test: mixed case across all four path parameters works`** — Create org "TestOrg", create team "DevTeam", create repo "TestOrg/MyRepo", call `PUT /api/orgs/testorg/teams/devteam/repos/testorg/myrepo`, assert 204.

### Edge Case Tests

- **`test: org name at maximum valid length (255 chars) returns 404`** — Call with 255-char org name, assert 404 (no org matches).
- **`test: org name exceeding 255 chars returns 404`** — Call with 256-char org name, assert 404.
- **`test: team name at maximum valid length (255 chars) returns 404`** — Call with 255-char team name, assert 404 (no team matches).
- **`test: team name exceeding 255 chars returns 404`** — Call with 256-char team name, assert 404.
- **`test: repo name at maximum valid length (100 chars) returns 404`** — Call with 100-char repo name, assert 404 (no repo matches unless one exists).
- **`test: repo name exceeding 100 chars returns 404`** — Call with 101-char repo name, assert 404.
- **`test: assigning the same repo to two different teams in the same org works`** — Create two teams, create org-owned repo, assign repo to team A (assert 204), assign repo to team B (assert 204), verify repo appears in both team repo lists.
- **`test: assigning different repos to the same team works`** — Create team, create two org-owned repos, assign both to the team, verify both appear in the team repo list.
- **`test: assigning a repo to a team does not modify the team itself`** — Get team details before and after assigning a repo, assert team `name`, `description`, `permission`, and `updated_at` are unchanged.
- **`test: assigning a repo to a team does not modify the repository itself`** — Get repo details before and after assignment, assert repo `name`, `description`, `is_public`, and `updated_at` are unchanged.
- **`test: concurrent assignment of the same repo returns 204 then 409`** — Fire two concurrent PUT requests for the same repo/team, assert one returns 204 and the other returns 409 (order may vary).
- **`test: URL-encoded special characters in org name are decoded`** — Call with `PUT /api/orgs/my%2Dorg/teams/:team/repos/:owner/:repo` (where org is "my-org"), assert correct resolution.
- **`test: assigning a public repo to a team works`** — Create a public org-owned repo, assign to team, assert 204.
- **`test: assigning a private repo to a team works`** — Create a private org-owned repo, assign to team, assert 204.
- **`test: request with extraneous body content still succeeds`** — Send PUT with a JSON body `{"extra": "field"}`, assert 204 (body is ignored for PUT with path params).

### Org-Ownership Constraint Tests

- **`test: user-owned repo cannot be assigned to org team`** — Create a personal (user-owned) repo, attempt to assign it to an org team, assert 422 (or 404 if the owner lookup fails to match an org-owned repo).
- **`test: repo from different org cannot be assigned`** — Create org A and org B, create repo in org A, attempt to assign it to a team in org B, assert 422.
- **`test: newly created org-owned repo can be immediately assigned`** — Create org, create team, create repo, assign repo to team in quick succession, assert 204.
- **`test: repo transferred out of org can no longer be assigned`** — If repo transfer is supported, assign repo, transfer it out, attempt to re-assign, verify failure.

### CLI E2E Tests

- **`test: codeplane org team repo add <repo> --org <org> --team <team> succeeds`** — Create org, create team, create org-owned repo, run `codeplane org team repo add <org>/<repo> --org <org> --team <team>`, assert exit code 0.
- **`test: codeplane org team repo add with nonexistent org exits with error`** — Run `org team repo add nonexistent-org/myrepo --org nonexistent-org --team anyteam`, assert non-zero exit code and stderr contains error message.
- **`test: codeplane org team repo add with nonexistent team exits with error`** — Run with valid org but nonexistent team, assert non-zero exit code and stderr contains "team not found".
- **`test: codeplane org team repo add with nonexistent repo exits with error`** — Run with valid org and team but nonexistent repo, assert non-zero exit code and stderr contains "repository not found".
- **`test: codeplane org team repo add for already-assigned repo exits with error`** — Assign repo, attempt to assign again via CLI, assert non-zero exit code and stderr contains "already assigned".
- **`test: codeplane org team repo add for non-org-owned repo exits with error`** — Run with a repo that exists but is not org-owned, assert non-zero exit code and stderr contains an error.
- **`test: codeplane org team repo add without required args exits with error`** — Run `org team repo add` without org or team flags, assert non-zero exit code and stderr indicates missing arguments.
- **`test: assigned repo appears in codeplane org team repo list output`** — Assign repo via CLI, run `codeplane org team repo list --org <org> --team <team>`, parse JSON, assert the assigned repo's name appears in the list.
- **`test: full lifecycle: add then remove team repo via CLI`** — Assign repo, verify in list, remove repo via `org team repo remove`, verify not in list.
- **`test: repo argument requires OWNER/REPO format`** — Run `org team repo add myrepo --org myorg --team myteam` (missing owner prefix), assert non-zero exit code or that `resolveRepoRef` handles the missing slash gracefully with an error.

### Playwright Web UI E2E Tests (when `ORG_TEAM_MANAGEMENT_UI` is implemented)

- **`test: add repository button is visible to org owners on team repositories tab`** — Authenticate as org owner, navigate to `/:org/-/teams/:team` repositories tab, assert "Add Repository" button is visible.
- **`test: add repository button is NOT visible to org members`** — Authenticate as org member, navigate to team repositories tab, assert "Add Repository" button is not visible.
- **`test: repository search typeahead shows org-owned repositories`** — Click "Add Repository", type a partial repo name, assert matching org-owned repos appear in the dropdown.
- **`test: repository search typeahead does not show non-org-owned repos`** — Ensure a user-owned repo does not appear in the typeahead.
- **`test: repository search typeahead grays out already-assigned repos`** — Assign repo to team, open typeahead, assert repo appears grayed out / disabled with "Already assigned" label.
- **`test: selecting a repository assigns it and updates the list`** — Click "Add Repository", select a repo from the typeahead, assert the repository list now includes the new repo.
- **`test: assigning a duplicate repo shows toast error`** — Attempt to assign a repo that is already on the team (e.g., via a second browser tab), assert a toast with "already assigned" appears.
- **`test: non-owner cannot assign repo even if UI is accessible`** — Force-navigate as a non-owner, verify no add-repository interaction is possible.

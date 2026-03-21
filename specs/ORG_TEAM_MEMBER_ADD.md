# ORG_TEAM_MEMBER_ADD

Specification for ORG_TEAM_MEMBER_ADD.

## High-Level User POV

When an organization owner needs to grant a user access to a specific team within their organization, they use the "add team member" action. This is the mechanism by which access and collaboration boundaries are drawn within an organization — teams group people together, and each team carries a default permission level (read, write, or admin) that governs what repositories the team can access.

The workflow is straightforward. An organization owner identifies a user who is already a member of the organization and adds them to one or more teams. This can happen from the web UI's team management page, the CLI, the TUI, or by calling the API directly. The user being added does not need to accept an invitation — they are added immediately, and from that point forward they inherit the team's repository access permissions.

There is one important prerequisite: the user being added to a team must already be a member of the organization. You cannot add an external user directly to a team. This ensures that organization-level membership remains the gatekeeper for all team-level access. If someone is not yet in the organization, the owner must first add them as an organization member, then add them to the desired team.

Once added, the new team member appears in the team's member list. The action is idempotent in the sense that attempting to add someone who is already a team member produces a clear conflict error rather than silent duplication. This protects against automation scripts or concurrent UI actions accidentally corrupting team state.

The feature provides value by letting organization owners structure access control without resorting to per-repository permission grants. Instead of configuring access for every individual on every repository, owners assign people to teams, assign teams to repositories, and let the permission model compose naturally.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a 401 Unauthorized response.
- **Organization owner required**: Only users who hold the `owner` role within the organization may add team members. Members with `member` role must receive a 403 Forbidden response.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return a 404 Not Found response.
- **Team must exist**: If the team name does not resolve to a valid team within the resolved organization, the endpoint must return a 404 Not Found response with message `"team not found"`.
- **Target user must exist**: If the username does not resolve to an existing user, the endpoint must return a 404 Not Found response with message `"user not found"`.
- **Target user must be an org member**: If the target user exists but is not a member of the organization, the endpoint must return a 422 Validation Failed response indicating the user is not a valid candidate for team membership.
- **No duplicate memberships**: If the target user is already a member of the team, the endpoint must return a 409 Conflict response with message `"user is already a team member"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive team lookup**: The team name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive username lookup**: The username in the URL path must be resolved case-insensitively (via `lower_username`).
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return 400 Bad Request with message `"organization name is required"`.
- **Empty team name**: A request with an empty or whitespace-only `:team` path parameter must return 400 Bad Request with message `"team name is required"`.
- **Empty username**: A request with an empty or whitespace-only `:username` path parameter must return 400 Bad Request with message `"username is required"`.
- **Org name max length**: Organization names longer than 255 characters must return 404 (no org will match).
- **Team name max length**: Team names longer than 255 characters must return 404 (no team will match).
- **Username max length**: Usernames longer than 255 characters must return 404 (no user will match).
- **No request body required**: The PUT request requires no body — all parameters are conveyed via path segments.
- **Response code on success**: A successful add must return 204 No Content with an empty body.
- **Idempotent safety**: The operation uses PUT semantics. On first add it succeeds with 204. On duplicate add it returns 409 Conflict.
- **Special characters in path parameters**: URL-encoded special characters (e.g., `%20`, `%2F`) must be decoded and trimmed before lookup. Only valid slug characters should match existing entities.
- **CLI consistency**: The CLI `org team member add <org> <team> <username>` command must call the correct API endpoint and report success or error clearly.
- **No data leakage**: The 204 success response must not include any body content. Error responses must not expose internal IDs, stack traces, or database details.
- **Content-Type on errors**: Error responses must include `Content-Type: application/json` header.

### Definition of Done

- The `PUT /api/orgs/:org/teams/:team/members/:username` route correctly adds a user to a team when all preconditions are met.
- Non-owners, unauthenticated users, and invalid inputs are correctly rejected with appropriate status codes and error messages.
- The org-membership prerequisite is enforced at the database level via `addTeamMemberIfOrgMember`.
- Duplicate additions are caught via unique constraint and return 409 Conflict.
- Organization name, team name, and username are all resolved case-insensitively.
- CLI `org team member add` command works end-to-end.
- All verification tests pass.
- Observability instrumentation is in place.
- Documentation for the API endpoint and CLI command is published.

## Design

### API Shape

**Endpoint**: `PUT /api/orgs/:org/teams/:team/members/:username`

**Path Parameters**:
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| `org`      | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |
| `team`     | string | Yes      | Team name / slug (case-insensitive, resolved via `lower_name`) |
| `username` | string | Yes      | Username of the user to add (case-insensitive, resolved via `lower_username`) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`

**Request Body**: None. All parameters are in the URL path.

**Response** (204 No Content): Empty body.

**Error Responses**:
| Status | Condition | Error Message |
|--------|----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 400    | Empty or whitespace-only `:team` path parameter | `"team name is required"` |
| 400    | Empty or whitespace-only `:username` path parameter | `"username is required"` |
| 401    | No valid session cookie or PAT provided | `"authentication required"` |
| 403    | Authenticated user is not an org owner | `"forbidden"` |
| 404    | Organization does not exist | `"organization not found"` |
| 404    | Team does not exist in the organization | `"team not found"` |
| 404    | Username does not exist | `"user not found"` |
| 409    | User is already a member of the team | `"user is already a team member"` |
| 422    | User exists but is not an organization member | Validation failed response with `resource: "TeamMember"`, `field: "username"`, `code: "invalid"` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async addTeamMember(
  actor: User,
  orgName: string,
  teamName: string,
  username: string,
): Promise<Result<void, APIError>>
```

The service: (1) validates authentication (returns 401 if `actor` is null), (2) resolves the org case-insensitively via `resolveOrg` (returns 404 if not found, 400 if empty), (3) verifies actor holds `owner` role via `requireOrgRole` (returns 403 if not), (4) resolves the team case-insensitively within the org via `resolveTeam` (returns 404 if not found, 400 if empty), (5) trims and lowercases the username (returns 400 if empty), (6) looks up the user via `getUserByLowerUsername` (returns 404 if not found), (7) calls `addTeamMemberIfOrgMember` which atomically inserts only if the user is an org member (returns 422 if not an org member), (8) catches unique violations (returns 409 if duplicate), (9) returns `Result.ok(undefined)` on success.

### CLI Command

```
codeplane org team member add <org> <team> <username>
```

| Argument   | Type   | Required | Description |
|------------|--------|----------|-------------|
| `org`      | string | Yes      | Organization name |
| `team`     | string | Yes      | Team slug / name |
| `username` | string | Yes      | Username to add to the team |

**Output on success**: The CLI exits with code 0. Because the API returns 204 No Content, the CLI produces no JSON output on success (or a minimal confirmation message).

**Output on error**: The CLI exits with code 1 and prints the error message to stderr.

**Example**:
```
$ codeplane org team member add my-org backend alice
# (exits 0, no output — member added)

$ codeplane org team member add my-org backend alice
Error: user is already a team member
# (exits 1)
```

### Web UI Design

**Status**: `Gated` — referenced in feature inventory as `ORG_TEAM_MANAGEMENT_UI` but not yet fully implemented. When implemented:

- The "Add Member" action is accessible from the team detail page's "Members" tab, via an "Add Member" button.
- Clicking "Add Member" opens a dropdown/typeahead that searches across current organization members (not all platform users).
- The typeahead displays: avatar, display name, and username for each candidate.
- Users who are already team members are shown but grayed out with a "Already a member" label and are not selectable.
- Users who are not org members do not appear in the typeahead results — the search is scoped to org members only.
- On selection, the PUT request fires immediately and the member list updates optimistically.
- On conflict (409), a toast notification reads "User is already a team member."
- On validation failure (422 — not an org member), a toast notification reads "User must be an organization member first."
- On 403, a toast notification reads "Only organization owners can add team members."
- **Navigation**: breadcrumb trail showing `Org Name > Teams > Team Name > Members`.
- **Empty state**: If the team has no members, the members tab shows "No members yet. Add a member to get started." with the "Add Member" button prominently displayed.

### TUI UI

**Status**: `Partial` — team member management screens are designed but not yet implemented. When implemented:

- From the team detail screen, pressing `m` navigates to the members tab.
- Pressing `a` in the members tab opens a user search input.
- The user search is scoped to organization members who are not yet team members.
- Arrow keys navigate candidates, Enter confirms the selection.
- On success, the member list refreshes and a status line confirms "Added <username> to <team>."
- On error, the status line displays the error message (e.g., "Already a member" or "Not an org member").
- `Esc` cancels the add action and returns to the member list.

### Documentation

- **API reference**: `PUT /api/orgs/:org/teams/:team/members/:username` — path parameters, success response (204), all error codes, example curl command.
- **CLI reference**: `codeplane org team member add` — arguments, example invocation, exit codes, common error scenarios.
- **Guide**: "Managing teams in your organization" — include a section on adding team members, explaining the org-membership prerequisite, how to add members from the web UI and CLI, and common error scenarios.
- **Concept page**: reference the broader "Teams and access control" concept page explaining the relationship between org membership, team membership, and repository access.

## Permissions & Security

### Authorization Roles

| Role | Can add team member? | Notes |
|------|---------------------|-------|
| Organization Owner | ✅ Yes | Full access to manage team membership |
| Organization Member | ❌ No | 403 Forbidden — members cannot modify team composition |
| Authenticated non-member | ❌ No | 403 Forbidden — user is not in the organization |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- An additional per-user write rate limit should be considered for team membership mutations: no more than **60 add-member requests per minute per authenticated user**. This prevents automated scripts from rapidly adding hundreds of members and overwhelming webhook/notification delivery.
- The rate limit key should be scoped to `user_id + org_name` to avoid cross-org interference.

### Data Privacy

- The request path contains a username, which is public profile information on Codeplane and is not considered PII.
- No PII is returned in the 204 success response (body is empty).
- Error messages reference the username only in the validation failure case (422), where the username was already provided by the caller.
- Audit logs recording the add action may contain the actor user ID, target user ID, org name, and team name. These are operational identifiers, not PII, but should follow the platform's data retention policies.
- The endpoint must not reveal whether a non-org-member user exists on the platform. If a user is not an org member, the 422 response should use a generic validation error rather than confirming the user's existence. (Current implementation does confirm user existence via the 404 "user not found" response — this is acceptable given that usernames are public, but should be reviewed if username privacy becomes a product concern.)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamMemberAdded` | A successful 204 response is returned after adding a team member | `org_name`, `team_name`, `team_id`, `target_username`, `target_user_id`, `actor_user_id`, `team_permission`, `client` (`api`, `cli`, `web`, `tui`) |
| `OrgTeamMemberAddFailed` | A 4xx or 5xx response is returned | `org_name`, `team_name_attempted`, `username_attempted`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `client` |
| `OrgTeamMemberAddConflict` | A 409 Conflict response is returned (duplicate add) | `org_name`, `team_name`, `target_username`, `actor_user_id`, `client` |

### Funnel Metrics

- **Team member add rate**: Number of successful team member additions per day/week, segmented by organization size. A healthy add rate indicates active team structuring.
- **Org member → team member conversion**: Percentage of org members who are added to at least one team within 7 days of joining the org. Low conversion may indicate that teams are underutilized or that the onboarding flow doesn't guide owners to team assignment.
- **Add-then-remove churn**: Percentage of team member additions that are reversed (member removed) within 24 hours. High churn may indicate UX confusion or accidental additions.
- **Prerequisite failure rate**: Percentage of add attempts that fail with 422 (not an org member). A high rate indicates that users are confused about the org-membership prerequisite, suggesting the UI should better guide them.
- **Conflict rate**: Percentage of add attempts that return 409 (already a member). A high rate from API/CLI clients may indicate automation retries or lack of idempotency awareness.
- **Client distribution**: Breakdown of successful adds by client surface (API, CLI, web, TUI). Indicates which surfaces are driving team management.

### Success Indicators

- Team member add API latency p50 < 30ms, p99 < 300ms (single INSERT with WHERE EXISTS check).
- Error rate < 0.1% of requests (excluding expected 401/403/404/409/422 responses).
- At least 70% of organizations with >3 members have at least one team with >1 member within 30 days.
- Prerequisite failure rate (422) < 5% of total add attempts (indicates UI clarity about the org-member prerequisite).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Team member add request received | `debug` | `org_name`, `team_name`, `target_username`, `actor_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Team not found | `info` | `org_name`, `team_name`, `request_id` |
| Target user not found | `info` | `org_name`, `team_name`, `target_username`, `request_id` |
| Actor not org owner (403) | `info` | `org_name`, `actor_user_id`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `team_name`, `target_username`, `request_id` |
| User is not an org member (422) | `info` | `org_name`, `team_name`, `target_username`, `target_user_id`, `request_id` |
| User is already a team member (409) | `info` | `org_name`, `team_name`, `target_username`, `target_user_id`, `request_id` |
| Team member added successfully | `info` | `org_name`, `team_name`, `target_username`, `target_user_id`, `actor_user_id`, `request_id` |
| Empty org/team/username parameter | `info` | `parameter_name`, `request_id` |
| Unexpected error during team member add | `error` | `org_name`, `team_name`, `target_username`, `actor_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_member_add_requests_total` | counter | `status_code`, `org_name` | Total team member add requests |
| `codeplane_org_team_member_add_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_team_member_add_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `conflict`, `validation`, `internal`) | Error breakdown by type |
| `codeplane_org_team_members_total` | gauge | `org_name`, `team_name` | Current count of members per team (updated on add/remove) |

### Alerts

#### Alert: `OrgTeamMemberAddHighErrorRate`
- **Condition**: `rate(codeplane_org_team_member_add_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context `org_team_member_add`.
  2. Verify database connectivity — run a basic SELECT against the `team_members` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label on the counter).
  4. Verify that the `teams`, `org_members`, and `team_members` tables exist and have their expected indexes.
  5. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.addTeamMember` method.
  6. Inspect the `addTeamMemberIfOrgMember` query plan — verify the EXISTS subquery is using indexes on `teams(id)` and `org_members(organization_id, user_id)`.
  7. Check for lock contention or deadlocks in `pg_locks` involving the `team_members` table.
  8. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgTeamMemberAddHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_team_member_add_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific organization (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the `addTeamMemberIfOrgMember` query to verify indexes are being used.
  3. Check database connection pool utilization — a pool exhaustion issue would affect all endpoints.
  4. Verify no full table scans on `team_members`, `org_members`, or `teams` tables via `pg_stat_user_tables`.
  5. Check for index bloat on the `team_members` unique constraint — large numbers of additions and removals can cause B-tree bloat.
  6. If latency is concentrated during specific time windows, check for concurrent batch operations (e.g., automation scripts adding many members).

#### Alert: `OrgTeamMemberAddConflictSpike`
- **Condition**: `rate(codeplane_org_team_member_add_errors_total{error_type="conflict"}[5m]) > 5 * avg_over_time(rate(codeplane_org_team_member_add_errors_total{error_type="conflict"}[5m])[1h:5m])`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike is from a single source (user/IP) or distributed.
  2. High conflict rates usually indicate an automation script retrying additions without checking current membership. This is not harmful but wastes resources.
  3. If concentrated on a single user, contact the user/team to suggest they check membership before adding.
  4. No immediate action required unless it causes latency or resource impact.

#### Alert: `OrgTeamMemberAddValidationSpike`
- **Condition**: `rate(codeplane_org_team_member_add_errors_total{error_type="validation"}[10m]) / rate(codeplane_org_team_member_add_requests_total[10m]) > 0.3`
- **Severity**: Info
- **Runbook**:
  1. A high validation failure rate (422) means users are frequently trying to add non-org-members to teams.
  2. Check if this is concentrated on a specific client surface (web, CLI, API).
  3. If it's the web UI, the member picker may not be filtering correctly — file a bug to ensure the typeahead only shows org members.
  4. If it's the CLI/API, consider improving documentation to clarify the org-membership prerequisite.
  5. No immediate operational action required.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Query timeout on addTeamMemberIfOrgMember | 500 Internal Server Error | Check for missing indexes on `team_members(team_id, user_id)`, `org_members(organization_id, user_id)`, `teams(id)` |
| Unique constraint violation | 409 Conflict (`"user is already a team member"`) | Expected behavior; client should handle gracefully |
| Foreign key violation (team or user deleted during request) | 500 Internal Server Error (caught as "failed to add team member") | Rare race condition; retry should resolve |
| WHERE NOT EXISTS returns null (user not org member) | 422 Validation Failed | Expected behavior; user must be added to org first |
| Org deleted between org lookup and role check | 404 or 403 depending on timing | Race condition; retry will return 404 |
| Team deleted between team lookup and member insert | Foreign key error caught as 500 | Rare; retry will return 404 for team |
| Actor's org owner role revoked during request | 403 on retry | Race condition; actor lost permission |
| Extremely long username in URL (>8KB URL) | 414 URI Too Long (web server level) or 404 | Expected behavior |

## Verification

### API Integration Tests

- **`test: returns 204 when org owner adds an org member to a team`** — Create org, create team, add user as org member, call `PUT /api/orgs/:org/teams/:team/members/:username` as org owner, assert 204 and empty body.
- **`test: added member appears in team member list`** — Add member to team, call `GET /api/orgs/:org/teams/:team/members`, assert the added user appears in the list with correct `username`, `display_name`, and `avatar_url`.
- **`test: returns 401 for unauthenticated request`** — Call endpoint with no session/token, assert 401.
- **`test: returns 403 when actor is org member but not owner`** — Create org, add a second user as org `member`, authenticate as that member, attempt to add another user to a team, assert 403.
- **`test: returns 403 when actor is authenticated but not an org member`** — Authenticate as a user who is not in the org, attempt to add a team member, assert 403.
- **`test: returns 404 for nonexistent organization`** — Call `PUT /api/orgs/nonexistent-org-xyz/teams/anyteam/members/alice`, assert 404.
- **`test: returns 404 for nonexistent team in valid org`** — Create org, call `PUT /api/orgs/:org/teams/nonexistent-team-xyz/members/alice`, assert 404 with message `"team not found"`.
- **`test: returns 404 for nonexistent username`** — Create org, create team, call `PUT /api/orgs/:org/teams/:team/members/nonexistent-user-xyz`, assert 404 with message `"user not found"`.
- **`test: returns 422 when target user is not an org member`** — Create org, create team, create a platform user who is NOT an org member, attempt to add them to the team, assert 422 with validation error.
- **`test: returns 409 when user is already a team member`** — Add user to team, attempt to add same user again, assert 409 with message `"user is already a team member"`.
- **`test: returns 400 for empty org name`** — Call `PUT /api/orgs/%20/teams/myteam/members/alice`, assert 400 with message containing `"organization name is required"`.
- **`test: returns 400 for empty team name`** — Call `PUT /api/orgs/myorg/teams/%20/members/alice`, assert 400 with message containing `"team name is required"`.
- **`test: returns 400 for empty username`** — Call `PUT /api/orgs/myorg/teams/myteam/members/%20`, assert 400 with message containing `"username is required"`.
- **`test: no request body is required`** — Call PUT with no body and no `Content-Type` header, assert 204 (given all preconditions are met).
- **`test: response has no body on success`** — Add member, assert response body is null/empty and status is 204.

### Case-Insensitivity Tests

- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", create team, add org member, call `PUT /api/orgs/myorg/teams/:team/members/:username`, assert 204.
- **`test: team name is resolved case-insensitively`** — Create org, create team "Backend", add org member, call `PUT /api/orgs/:org/teams/backend/members/:username`, assert 204.
- **`test: username is resolved case-insensitively`** — Create org, create team, add user "Alice" as org member, call `PUT /api/orgs/:org/teams/:team/members/alice`, assert 204.
- **`test: mixed case across all three path parameters works`** — Create org "TestOrg", create team "DevTeam", add user "BobSmith" as org member, call `PUT /api/orgs/testorg/teams/devteam/members/bobsmith`, assert 204.

### Edge Case Tests

- **`test: org name at maximum valid length (255 chars) returns 404`** — Call with 255-char org name, assert 404 (no org matches).
- **`test: org name exceeding 255 chars returns 404`** — Call with 256-char org name, assert 404.
- **`test: team name at maximum valid length (255 chars) returns 404`** — Call with 255-char team name, assert 404 (no team matches unless one exists).
- **`test: team name exceeding 255 chars returns 404`** — Call with 256-char team name, assert 404.
- **`test: username at maximum valid length (255 chars) returns 404`** — Call with 255-char username, assert 404 (no user matches).
- **`test: username exceeding 255 chars returns 404`** — Call with 256-char username, assert 404.
- **`test: adding the same user to two different teams in the same org works`** — Create two teams, add user as org member, add user to team A (assert 204), add user to team B (assert 204), verify user appears in both team member lists.
- **`test: adding different users to the same team works`** — Create team, add two org members to the team, verify both appear in the team member list.
- **`test: adding a user to a team does not modify the team itself`** — Get team details before and after adding a member, assert team `name`, `description`, `permission`, and `updated_at` are unchanged.
- **`test: concurrent add of the same user returns 204 then 409`** — Fire two concurrent PUT requests for the same user/team, assert one returns 204 and the other returns 409 (order may vary).
- **`test: URL-encoded special characters in org name are decoded`** — Call with `PUT /api/orgs/my%2Dorg/teams/:team/members/:username` (where org is "my-org"), assert correct resolution.
- **`test: org owner can add themselves to a team`** — Org owner adds themselves to a team, assert 204 and they appear in the member list.

### Prerequisite Enforcement Tests

- **`test: user removed from org cannot be added to team`** — Add user to org, remove user from org, attempt to add user to team, assert 422.
- **`test: user added to org can then be added to team`** — Create user, add to org, then add to team, assert 204.
- **`test: adding an org owner to a team works`** — The org creator (owner) should be addable to teams within their org, assert 204.

### CLI E2E Tests

- **`test: codeplane org team member add <org> <team> <username> succeeds`** — Create org, create team, add user as org member, run `codeplane org team member add <org> <team> <username>`, assert exit code 0.
- **`test: codeplane org team member add with nonexistent org exits with error`** — Run `org team member add nonexistent-org anyteam alice`, assert non-zero exit code and stderr contains error message.
- **`test: codeplane org team member add with nonexistent team exits with error`** — Run with valid org but nonexistent team, assert non-zero exit code and stderr contains "team not found".
- **`test: codeplane org team member add with nonexistent user exits with error`** — Run with valid org and team but nonexistent username, assert non-zero exit code and stderr contains "user not found".
- **`test: codeplane org team member add for already-added user exits with error`** — Add user, attempt to add again via CLI, assert non-zero exit code and stderr contains "already a team member".
- **`test: codeplane org team member add for non-org-member exits with error`** — Run with a username that exists but is not an org member, assert non-zero exit code and stderr contains an error.
- **`test: codeplane org team member add without required args exits with error`** — Run `org team member add` without org, team, or username args, assert non-zero exit code and stderr indicates missing arguments.
- **`test: added member appears in codeplane org team member list output`** — Add member via CLI, run `codeplane org team member list <org> <team>`, parse JSON, assert the added user's username appears in the list.
- **`test: full lifecycle: add then remove team member via CLI`** — Add member, verify in list, remove member, verify not in list.

### API Integration Tests (Boundary Validation)

- **`test: adding member to a team with 1000 existing members succeeds`** — Create a team, add 1000 org members to it, add one more, assert 204. (This validates that the operation scales and no artificial limit is hit. Adjust number to match any configured limit.)
- **`test: request with extraneous body content still succeeds`** — Send PUT with a JSON body `{"extra": "field"}`, assert 204 (body is ignored for PUT with path params).

### Playwright Web UI E2E Tests (when `ORG_TEAM_MANAGEMENT_UI` is implemented)

- **`test: add member button is visible to org owners on team members tab`** — Authenticate as org owner, navigate to `/:org/-/teams/:team` members tab, assert "Add Member" button is visible.
- **`test: add member button is NOT visible to org members`** — Authenticate as org member, navigate to team members tab, assert "Add Member" button is not visible.
- **`test: member search typeahead shows org members`** — Click "Add Member", type a partial username, assert matching org members appear in the dropdown.
- **`test: member search typeahead does not show non-org-members`** — Ensure a platform user who is NOT an org member does not appear in the typeahead.
- **`test: member search typeahead grays out existing team members`** — Add alice to team, open typeahead, assert alice appears grayed out / disabled.
- **`test: selecting a member adds them and updates the list`** — Click "Add Member", select a user from the typeahead, assert the member list now includes the new user.
- **`test: adding a duplicate member shows toast error`** — Attempt to add a member who is already on the team (e.g., via a second browser tab), assert a toast with "already a team member" appears.
- **`test: non-owner cannot add member even if UI is accessible`** — Force-navigate as a non-owner, verify no add-member interaction is possible.

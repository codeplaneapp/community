# ORG_TEAM_MEMBER_REMOVE

Specification for ORG_TEAM_MEMBER_REMOVE.

## High-Level User POV

Teams within an organization are living structures. As people rotate between projects, finish contracts, or shift focus areas, their membership in specific teams needs to change. An organization owner who notices that a developer has moved off the backend project should be able to remove that developer from the "backend" team without affecting their broader organization membership or any of their personal work.

Removing a member from a team revokes the repository access that flowed through that team. If the "backend" team grants write access to three repositories, a user removed from the team loses that team-based access path immediately. However, the user remains a member of the organization, they keep any access they have through other teams, and no repositories, issues, or other data are affected. The operation targets team membership only — it is surgical and predictable.

The remove action is restricted to organization owners. Regular members can see who is on a team, but they cannot change team membership. This ensures that access control changes are made deliberately by people with full administrative authority.

From the user's perspective, the workflow is straightforward. An owner identifies the team member they want to remove — by browsing the team's member list in the web UI, using the CLI, or calling the API directly. They issue a remove command, specifying the organization, team, and username. The member is removed immediately and no longer appears in the team's member list. The owner can verify the change by listing team members again.

This feature is essential for organizational hygiene. Without it, teams accumulate stale members who retain access they no longer need. It completes the team membership lifecycle: members can be added, listed, and ultimately removed when their participation in the team is no longer appropriate.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a `401 Unauthorized` response.
- **Organization owner role required**: Only users with the `owner` role in the specified organization may remove a team member. Members, non-members, and anonymous users must receive `403 Forbidden`.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return `404 Not Found`.
- **Team must exist**: If the team name does not resolve to a valid team within the organization, the endpoint must return `404 Not Found`.
- **User must exist**: If the username does not resolve to a valid user, the endpoint must return `404 Not Found` with message `"user not found"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive team lookup**: The team name (slug) in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive username lookup**: The username in the URL path must be resolved case-insensitively (via `lower_username`).
- **Successful removal returns 204**: A successful removal must return `204 No Content` with an empty body.
- **Idempotent on repeated removal**: Removing a user who is not currently a member of the team must still return `204 No Content`. The DELETE operation on `team_members` is a no-op if the row does not exist — this is by design and matches the SQL `DELETE ... WHERE` semantics.
- **Organization membership is preserved**: Removing a user from a team must not affect their organization membership. They remain an org member.
- **Other team memberships are preserved**: Removing a user from one team must not affect their membership in other teams within the same organization.
- **No data cascade**: Removing a team member must not affect: repositories, issues, landing requests, workflows, wiki entries, or any data outside the `team_members` association.
- **Owner can remove themselves from a team**: An org owner who is also a team member should be able to remove themselves from the team. This does not affect their org owner role.
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return `400 Bad Request` with message `"organization name is required"`.
- **Empty team name**: A request with an empty or whitespace-only `:team` path parameter must return `400 Bad Request` with message `"team name is required"`.
- **Empty username**: A request with an empty or whitespace-only `:username` path parameter must return `400 Bad Request` with message `"username is required"`.
- **Org name max length**: Organization names exceeding 40 characters must return `404 Not Found` (no matching org will exist; this is enforced at creation time).
- **Team name max length**: Team slugs exceeding 40 characters must return `404 Not Found` (no matching team will exist; this is enforced at creation time).
- **Username max length**: Usernames exceeding 40 characters must return `404 Not Found` (no matching user will exist; this is enforced at user creation time).
- **Special characters in path**: Path-encoded special characters (e.g., `%2F`, `%00`) in the `:org`, `:team`, or `:username` parameter must result in `404 Not Found` (no matching entity) or `400 Bad Request`.
- **Concurrent removal**: If two concurrent remove requests target the same team member, both should succeed with `204` (the DELETE is idempotent at the SQL level).
- **CLI returns confirmation**: The CLI `org team member remove` command must output a JSON object with `status: "removed"`, `org`, `team`, and `username` fields on success.
- **CLI exits non-zero on error**: The CLI must exit with a non-zero exit code when the API returns an error.

### Definition of Done

- The `DELETE /api/orgs/:org/teams/:team/members/:username` route correctly removes the team member and returns `204 No Content`.
- Organization membership and other team memberships are unaffected.
- Non-owners, non-members, and unauthenticated users are correctly rejected.
- CLI `org team member remove` command works end-to-end.
- All verification tests pass.
- Observability instrumentation is in place.
- User-facing documentation covers the remove team member action.

## Design

### API Shape

**Endpoint**: `DELETE /api/orgs/:org/teams/:team/members/:username`

**Path Parameters**:

| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| `org`      | string | Yes      | Organization name (case-insensitive) |
| `team`     | string | Yes      | Team slug (case-insensitive) |
| `username` | string | Yes      | Username to remove (case-insensitive) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`

**Request Body**: None. Any request body must be ignored.

**Response** (204 No Content):
- Empty body.
- No `Content-Type` header required.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400    | Empty or whitespace-only `:org` parameter | `{ "error": "organization name is required" }` |
| 400    | Empty or whitespace-only `:team` parameter | `{ "error": "team name is required" }` |
| 400    | Empty or whitespace-only `:username` parameter | `{ "error": "username is required" }` |
| 401    | Unauthenticated request | `{ "error": "authentication required" }` |
| 403    | Authenticated user is not org owner | `{ "error": "forbidden" }` |
| 404    | Organization not found | `{ "error": "not found" }` |
| 404    | Team not found within the organization | `{ "error": "not found" }` |
| 404    | User not found | `{ "error": "user not found" }` |

**Example**:

```bash
curl -X DELETE \
  -H "Authorization: token cp_pat_abc123" \
  https://codeplane.example.com/api/orgs/acme-corp/teams/backend/members/alice
# → 204 No Content
```

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async removeTeamMember(
  actor: User,
  orgName: string,
  teamName: string,
  username: string,
): Promise<Result<void, APIError>>
```

The service:
1. Validates that `actor` is authenticated (returns `401` if not).
2. Resolves the organization by `lower_name` case-insensitively (returns `404` if not found).
3. Verifies the actor holds the `owner` role in the organization (returns `403` if not).
4. Resolves the team by `lower_name` within the organization (returns `404` if not found).
5. Trims and lowercases the `username` input. Returns `400` if empty.
6. Resolves the target user by `lower_username` (returns `404` with `"user not found"` if not found).
7. Executes `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`. This is a no-op if the user is not a team member — the service does not check membership before deleting.
8. Returns `Result.ok(undefined)`.

### CLI Command

```
codeplane org team member remove <username> --org <organization_name> --team <team_slug>
```

| Argument     | Type   | Required | Description |
|--------------|--------|----------|-------------|
| `<username>` | string | Yes      | Positional: username to remove |
| `--org`      | string | Yes      | Organization name |
| `--team`     | string | Yes      | Team slug |

**Output** (success):
```json
{
  "status": "removed",
  "org": "acme-corp",
  "team": "backend",
  "username": "alice"
}
```

**Output** (error): Standard CLI error output with non-zero exit code.

**Exit codes**: `0` = success, `1` = API error.

**Notes**: The CLI does not prompt for confirmation before removing. This is consistent with other team management CLI commands in the codebase (e.g., `org team repo remove`). A future enhancement could add a `--yes` / `--confirm` flag gating.

### Web UI Design

**Status**: `Gated` — The team management UI surfaces are referenced in the feature inventory but not yet fully implemented. When implemented:

- **Member list context**: The team member list page displays each member in a row. For organization owners, each member row includes a "Remove" action (icon button or kebab menu item).
- **Confirmation dialog**: Clicking "Remove" opens a modal confirmation dialog with:
  - Title: "Remove team member?"
  - Body text: "Remove **{username}** from team **{team_name}**? They will lose any repository access that flows through this team. Their organization membership will not be affected."
  - A red "Remove member" button.
  - A "Cancel" button.
- **Post-removal behavior**: On successful removal, the member row is removed from the list without a full page reload. A success toast notification appears: "'{username}' has been removed from team '{team_name}'."
- **Error handling**: If the API returns an error, the modal remains open and displays an inline error message.
- **Loading state**: The "Remove member" button shows a spinner and is disabled while the API call is in flight.
- **Non-owner visibility**: Members who are not org owners must not see any "Remove" action on team member rows.
- **Empty state**: If removing the last member results in an empty team, the member list shows an appropriate empty state: "This team has no members."

### TUI UI

**Status**: `Partial` — No team member management screen exists yet in the TUI. When implemented:

- From the team detail screen, the member list is displayed.
- Pressing `r` on a highlighted member opens a confirmation prompt: "Remove '{username}' from team '{team_name}'? [y/N]"
- On confirmation (`y`), the TUI calls the API, displays "Member removed", and refreshes the member list.
- On cancellation (`N` or Enter), the TUI returns to the member list with no changes.
- On error, the TUI displays the error message inline below the member list.

### Neovim Plugin API

When implemented, the Neovim plugin should expose:

```vim
:Codeplane org team remove-member <org> <team> <username>
```

This calls the API and displays the result in the command line. No confirmation prompt is needed in the editor context (users are expected to be deliberate with command-mode actions).

### Documentation

The following documentation surfaces should cover team member removal:

- **CLI reference** (`/cli-reference/commands#codeplane-org-team-member-remove`): Document the `org team member remove` command, its positional argument, flags, output shape, and exit codes. Include an example showing removal and subsequent verification via `org team members`.
- **API reference** (`/api-reference/orgs#remove-a-team-member`): Document `DELETE /api/orgs/:org/teams/:team/members/:username` — path parameters, authentication requirements, response codes, idempotency behavior, and example `curl` invocation.
- **Organizations guide** (`/guides/organizations`): The "Teams" section should explain how to remove members from teams, what happens to their access (revoked through that team), and what is preserved (org membership, other team memberships). Include CLI and API examples.
- **Concepts page** (if exists): Include a note in the team membership section clarifying that removal is surgical — it affects only the association between user and team, not the user's organization membership, personal data, or other team memberships.

## Permissions & Security

### Authorization Roles

| Role | Can remove a team member? | Notes |
|------|--------------------------|-------|
| Organization Owner | ✅ Yes | Full authority over org structure |
| Organization Member | ❌ No | 403 Forbidden |
| Authenticated non-member | ❌ No | 403 Forbidden |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Self-Removal

An organization owner can remove themselves from a team. This is intentional — it does not demote their org role. An org member (non-owner) cannot remove themselves from a team because they lack the `owner` role required for any team membership modification.

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required beyond the platform default, as member removal operations are infrequent and owner-restricted.
- If abuse is detected (e.g., scripted mass removal of all members from all teams), the platform rate limiter will throttle the caller.

### Data Privacy

- The request contains only the organization name, team slug, and username — none of which are classified as PII in isolation.
- The response is `204 No Content` — no data is returned.
- The `team_members` association row is hard-deleted from the database. There is no soft-delete or retention period. This is privacy-positive: no lingering association data.
- Audit logs (if implemented) should record the actor, organization, team name, removed username, and timestamp. The audit log itself is access-controlled and not publicly visible.
- No PII exposure risk exists in this endpoint.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamMemberRemoved` | A successful `204` response is returned | `org_name`, `team_name`, `removed_username`, `removed_user_id`, `actor_user_id`, `team_member_count_after` (members remaining), `membership_duration_days` (days since user was added to team, if trackable), `client` (`api`, `cli`, `web`, `tui`) |
| `OrgTeamMemberRemoveFailed` | A `4xx` or `5xx` response is returned | `org_name`, `team_name`, `target_username`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `client` |

### Funnel Metrics

- **Team member removal rate**: Number of members removed per month as a fraction of total team member additions. A healthy rate indicates active team hygiene. Near-zero suggests stale team rosters; very high suggests churn or misuse.
- **Membership duration at removal**: Distribution of `membership_duration_days` at removal time. Helps identify whether members are being removed prematurely (within hours of being added — possible accidental addition) or staying too long (membership never reviewed).
- **Post-removal team size**: Distribution of `team_member_count_after` at removal time. If many teams go to zero members, it may indicate teams themselves should be deleted.
- **Remove failure rate**: Percentage of remove attempts that result in errors. Should be <2% (most failures are expected 404s from nonexistent users/teams).
- **Client distribution**: Breakdown of team member removals by client surface (API, CLI, web, TUI).
- **Self-removal rate**: Percentage of removals where `actor_user_id == removed_user_id`. High self-removal may indicate UI confusion or workflow issues.

### Success Indicators

- Team member removal API latency p50 < 50ms, p99 < 300ms.
- Error rate < 1% of requests (excluding expected 401/403/404 responses).
- No orphaned `team_members` rows for deleted users (verified by periodic consistency checks).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Team member remove request received | `debug` | `org_name`, `team_name`, `target_username`, `actor_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Actor not org owner (403) | `info` | `org_name`, `actor_user_id`, `actor_role`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `team_name`, `target_username`, `request_id` |
| Team not found in org | `info` | `org_name`, `team_name`, `request_id` |
| Target user not found | `info` | `org_name`, `team_name`, `target_username`, `request_id` |
| Empty org, team, or username (400) | `info` | `raw_org`, `raw_team`, `raw_username`, `request_id` |
| Team member removed successfully | `info` | `org_name`, `team_name`, `target_username`, `target_user_id`, `team_id`, `actor_user_id`, `request_id` |
| Unexpected error during team member removal | `error` | `org_name`, `team_name`, `target_username`, `actor_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_member_remove_requests_total` | counter | `status_code`, `org_name` | Total team member remove requests |
| `codeplane_org_team_member_remove_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_team_member_remove_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `bad_request`, `internal`) | Error breakdown |
| `codeplane_org_team_members_removed_total` | counter | `org_name` | Cumulative count of successfully removed team members (monotonic) |

### Alerts

#### Alert: `OrgTeamMemberRemoveHighErrorRate`
- **Condition**: `rate(codeplane_org_team_member_remove_errors_total{error_type="internal"}[5m]) > 0.01`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context containing `removeTeamMember` or `team_member_remove`.
  2. Verify database connectivity — run `SELECT 1` against the `team_members` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label).
  4. Inspect the `team_members` table schema for constraint or index corruption.
  5. Check for recent deployments that may have altered the remove path or the `team_members` DELETE query.
  6. If the error is a query timeout, check `pg_stat_activity` for long-running transactions or locks on the `team_members` table.
  7. Verify that the `getUserByLowerUsername` lookup is functioning (this is a prerequisite of the remove path).
  8. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgTeamMemberRemoveHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_team_member_remove_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to specific organizations (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2` query to check for missing indexes or lock contention.
  3. Check if the org resolution or user lookup steps are slow (these involve separate queries).
  4. Check database connection pool utilization and wait times.
  5. Inspect `pg_locks` for lock contention on the `team_members` table.
  6. Review whether heavy concurrent team operations (bulk adds/removes) are competing for locks.

#### Alert: `OrgTeamMemberRemoveSpikeRate`
- **Condition**: `rate(codeplane_org_team_members_removed_total[15m]) > 50` (more than 50 removals in 15 minutes across all orgs)
- **Severity**: Warning
- **Runbook**:
  1. Determine if a single actor is responsible — check logs for `actor_user_id` patterns.
  2. Determine if a single org or team is losing all its members — check `org_name` label distribution.
  3. Verify this is intentional (team restructuring, offboarding event) rather than a compromised owner account.
  4. If suspicious, temporarily disable the owner's session and notify the admin team.
  5. Check if an automation script or CI pipeline is executing team cleanup.
  6. If legitimate, consider whether the spike threshold needs adjustment for this organization's normal operating scale.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost mid-delete | 500 Internal Server Error; team member row may or may not be deleted depending on commit state | Automatic reconnection via pool; verify membership state; alert fires |
| User exists but is not a team member | 204 No Content (idempotent — the DELETE WHERE is a no-op) | No intervention needed; this is correct behavior |
| Concurrent removal of same member by two owners | Both return 204 (SQL DELETE is idempotent) | No intervention needed |
| Owner removes themselves from a team | 204 No Content; owner keeps org role | Correct behavior; no intervention |
| Org or team deleted between permission check and member removal | Possible foreign key violation or no-op depending on timing | 500 if FK violation; client retries; second attempt returns 404 |
| Owner account compromised, mass member removal | Members lose team-based access | Re-add members; revoke compromised credentials; spike alert fires |
| Network timeout before response reaches client | Client sees timeout; member may already be removed | Client should retry; second attempt is idempotent (still 204) |

## Verification

### API Integration Tests

- **`test: returns 204 when org owner removes an existing team member`** — Create org, create team, add user to team, remove user from team as owner, assert 204 with empty body.
- **`test: removed member no longer appears in team member list`** — Create org, create team, add user to team, remove user, list team members, assert removed user is absent.
- **`test: returns 401 for unauthenticated request`** — Send DELETE with no session/token, assert 401.
- **`test: returns 403 when org member (non-owner) attempts removal`** — Create org, add second user as member, add third user to team, authenticate as second user (non-owner), attempt to remove third user from team, assert 403.
- **`test: returns 403 for authenticated user who is not an org member`** — Authenticate as a user with no org membership, attempt to remove a team member, assert 403.
- **`test: returns 404 for nonexistent organization`** — Attempt to remove team member in org `"nonexistent-org-xyz"`, assert 404.
- **`test: returns 404 for nonexistent team in valid organization`** — Create org, attempt to remove member from team `"no-such-team"`, assert 404.
- **`test: returns 404 for nonexistent username`** — Create org, create team, attempt to remove `"nonexistent-user-xyz"`, assert 404 with `"user not found"`.
- **`test: returns 204 when removing a user who is not a team member (idempotent)`** — Create org, create team, add user to org but not team, remove that user from team, assert 204.
- **`test: returns 204 on second removal of same member (idempotent)`** — Create org, create team, add user, remove user (assert 204), remove same user again (assert 204).
- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", create team, add member, remove member using org name "myorg" (lowercase), assert 204.
- **`test: team name is resolved case-insensitively`** — Create org, create team "BackendTeam", add member, remove member using "backendteam" (lowercase), assert 204.
- **`test: username is resolved case-insensitively`** — Create org, create team, add user "Alice", remove using "alice" (lowercase), assert 204.
- **`test: returns 400 for empty org name`** — Send `DELETE /api/orgs/%20/teams/some-team/members/alice`, assert 400 with message containing `"organization name is required"`.
- **`test: returns 400 for empty team name`** — Send `DELETE /api/orgs/my-org/teams/%20/members/alice`, assert 400 with message containing `"team name is required"`.
- **`test: returns 400 for empty username`** — Send `DELETE /api/orgs/my-org/teams/backend/members/%20`, assert 400 with message containing `"username is required"`.
- **`test: org membership is preserved after team member removal`** — Create org, add user as org member, add user to team, remove user from team, list org members, assert user is still an org member.
- **`test: other team memberships are preserved`** — Create org, create team-a and team-b, add user to both teams, remove user from team-a, list team-b members, assert user is still in team-b.
- **`test: owner can remove themselves from a team`** — Create org (owner), create team, add owner to team, remove owner from team as owner, assert 204. Verify owner is still org owner.
- **`test: removing member does not affect team's repo assignments`** — Create org, create team, add member, assign repo, remove member, list team repos, assert repo is still assigned.
- **`test: removing member does not affect other team members`** — Create org, create team, add user-a and user-b, remove user-a, list team members, assert user-b is still a member.
- **`test: request body is ignored`** — Send DELETE with a JSON body `{ "unexpected": true }`, assert 204 (body is ignored).
- **`test: org name with 40 characters resolves correctly`** (maximum valid length) — Create org with 40-character name, create team, add member, remove member, assert 204.
- **`test: team name with 40 characters resolves correctly`** (maximum valid length) — Create org, create team with 40-character slug, add member, remove member, assert 204.
- **`test: username with 40 characters resolves correctly`** (maximum valid length) — Create user with 40-character username, add to org and team, remove from team, assert 204.
- **`test: org name with 41 characters returns 404`** (exceeds maximum) — Attempt removal with a 41-character org name, assert 404.
- **`test: team name with 41 characters returns 404`** (exceeds maximum) — Attempt removal with a 41-character team name, assert 404.
- **`test: username with 41 characters returns 404`** (exceeds maximum) — Attempt removal with a 41-character username, assert 404.
- **`test: path-encoded null byte in org name returns 400 or 404`** — Send `DELETE /api/orgs/my%00org/teams/team/members/alice`, assert 400 or 404.
- **`test: path-encoded slash in team name returns 400 or 404`** — Send `DELETE /api/orgs/myorg/teams/my%2Fteam/members/alice`, assert 400 or 404.
- **`test: path-encoded null byte in username returns 400 or 404`** — Send `DELETE /api/orgs/myorg/teams/team/members/al%00ice`, assert 400 or 404.

### Concurrent Removal Tests

- **`test: concurrent removal of same member — both succeed with 204`** — Create org, create team, add member, fire two DELETE requests simultaneously, assert both return 204.

### CLI E2E Tests

- **`test: codeplane org team member remove <username> --org <name> --team <name> succeeds`** — Create org, create team, add member, run CLI remove command, assert exit code 0 and JSON output contains `"status": "removed"`.
- **`test: removed member is gone from team member list`** — After CLI remove, run `org team members --org <name> --team <name>`, assert removed user is absent.
- **`test: CLI outputs correct org, team, and username fields`** — Run remove, parse JSON output, assert `org`, `team`, and `username` match provided values.
- **`test: CLI exits non-zero for nonexistent org`** — Run `org team member remove alice --org nonexistent --team any`, assert non-zero exit code.
- **`test: CLI exits non-zero for nonexistent team`** — Create org, run `org team member remove alice --org <name> --team nonexistent`, assert non-zero exit code.
- **`test: CLI exits non-zero for nonexistent username`** — Create org, create team, run `org team member remove nonexistent-user --org <name> --team <name>`, assert non-zero exit code.
- **`test: CLI exits non-zero when --org is omitted`** — Run `org team member remove alice --team some-team` without `--org`, assert error output.
- **`test: CLI exits non-zero when --team is omitted`** — Run `org team member remove alice --org some-org` without `--team`, assert error output.
- **`test: CLI remove followed by re-remove returns success (idempotent)`** — Remove a member, then attempt to remove again. Depending on CLI behavior, assert either exit code 0 (API returns 204) or non-zero (if the user is not found — only if user was also removed from org).

### Playwright Web UI E2E Tests (when team management UI is implemented)

- **`test: remove button visible only to org owners`** — Authenticate as member, navigate to team member list, assert remove action is not visible. Switch to owner, assert remove action is visible.
- **`test: remove confirmation dialog appears on click`** — Click "Remove" on a member row, assert modal with member username and team name appears.
- **`test: successful removal removes member row from list`** — Complete removal flow, assert member row is no longer in the list without full page reload.
- **`test: success toast appears after removal`** — Complete removal, assert toast notification with username and team name appears.
- **`test: cancel button closes modal without removing`** — Open confirmation modal, click "Cancel", assert modal closes. Verify member is still in the list.
- **`test: error message displayed in modal on API failure`** — Simulate API failure (e.g., network error), assert error message appears in modal and modal remains open.
- **`test: loading state shown during removal`** — Click "Remove member", assert button shows spinner and is disabled during API call.
- **`test: empty state shown when last member is removed`** — Add one member, remove them, assert empty state message "This team has no members" is displayed.

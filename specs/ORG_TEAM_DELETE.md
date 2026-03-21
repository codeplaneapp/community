# ORG_TEAM_DELETE

Specification for ORG_TEAM_DELETE.

## High-Level User POV

When an organization grows and evolves, teams that were once useful can become obsolete. A "legacy-api" team formed during a migration may no longer have any purpose, or a "contractor-q1" team may have outlived its engagement window. Organization owners need a clean, safe way to remove these teams so the organization's team list stays accurate and manageable.

Deleting a team permanently removes the team from the organization. All of the team's repository access grants and member associations are removed along with it. No member loses their organization membership — they simply stop being part of that team. No repository is deleted — the repository just loses the access path that flowed through the deleted team. The operation is irreversible; once a team is deleted, its name, membership roster, and repository assignments are gone.

The delete team action is restricted to organization owners. Regular members can see that a team exists, but they cannot delete it. This ensures that access control structures are only modified by people with full administrative authority over the organization.

From the user's perspective, the workflow is simple. An owner identifies a team they want to remove — either by browsing the team list in the web UI, using the CLI, or calling the API directly. They issue a delete command, confirm their intent, and the team disappears from the organization. The owner can verify it is gone by listing teams again.

This feature provides value by keeping organizational structures clean and by ensuring that stale access grants do not accumulate over time. It completes the team lifecycle: teams can be created, populated, assigned to repositories, and ultimately retired when they are no longer needed.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a `401 Unauthorized` response.
- **Organization owner role required**: Only users with the `owner` role in the specified organization may delete a team. Members, non-members, and anonymous users must receive `403 Forbidden`.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return `404 Not Found`.
- **Team must exist**: If the team name does not resolve to a valid team within the organization, the endpoint must return `404 Not Found`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive team lookup**: The team name (slug) in the URL path must be resolved case-insensitively (via `lower_name`).
- **Successful deletion returns 204**: A successful delete must return `204 No Content` with an empty body.
- **Team members are disassociated**: All `team_members` records for the deleted team must be removed. No user loses their organization membership.
- **Team repository grants are removed**: All `team_repos` records for the deleted team must be removed. No repository is deleted.
- **Idempotency on repeated delete**: Attempting to delete an already-deleted team must return `404 Not Found` (the team no longer exists).
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return `400 Bad Request` with message `"organization name is required"`.
- **Empty team name**: A request with an empty or whitespace-only `:team` path parameter must return `400 Bad Request` with message `"team name is required"`.
- **Org name max length**: Organization names exceeding 40 characters must return `404 Not Found` (no matching org will exist; this is enforced at creation time).
- **Team name max length**: Team slugs exceeding 40 characters must return `404 Not Found` (no matching team will exist; this is enforced at creation time).
- **Special characters in path**: Path-encoded special characters (e.g., `%2F`, `%00`) in the `:org` or `:team` parameter must result in `404 Not Found` (no matching entity) or `400 Bad Request`.
- **Concurrent deletion**: If two concurrent delete requests target the same team, exactly one should succeed with `204` and the other should return `404` (the team is already gone).
- **No cascade to other entities**: Deleting a team must not affect: org membership, other teams, repositories, issues, landing requests, workflows, or any non-team-scoped data.
- **CLI returns confirmation**: The CLI `org team delete` command must output a JSON object with `status: "deleted"`, `org`, and `team` fields on success.
- **CLI exits non-zero on error**: The CLI must exit with a non-zero exit code when the API returns an error.

### Definition of Done

- The `DELETE /api/orgs/:org/teams/:team` route correctly deletes the team and returns `204 No Content`.
- Team members and team repo associations are cleaned up on deletion.
- Non-owners, non-members, and unauthenticated users are correctly rejected.
- CLI `org team delete` command works end-to-end.
- All verification tests pass.
- Observability instrumentation is in place.
- User-facing documentation covers the delete team action.

## Design

### API Shape

**Endpoint**: `DELETE /api/orgs/:org/teams/:team`

**Path Parameters**:

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive) |
| `team`    | string | Yes      | Team slug (case-insensitive) |

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
| 401    | Unauthenticated request | `{ "error": "authentication required" }` |
| 403    | Authenticated user is not org owner | `{ "error": "forbidden" }` |
| 404    | Organization not found | `{ "error": "not found" }` |
| 404    | Team not found within the organization | `{ "error": "not found" }` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async deleteTeam(
  actor: User,
  orgName: string,
  teamName: string,
): Promise<Result<void, APIError>>
```

The service:
1. Validates that `actor` is authenticated (returns `401` if not).
2. Resolves the organization by `lower_name` case-insensitively (returns `404` if not found).
3. Verifies the actor holds the `owner` role in the organization (returns `403` if not).
4. Resolves the team by `lower_name` within the organization (returns `404` if not found).
5. Deletes the team row. Database cascading constraints remove associated `team_members` and `team_repos` records.
6. Returns `Result.ok(undefined)`.

### CLI Command

```
codeplane org team delete --org <organization_name> --team <team_slug>
```

| Argument | Type   | Required | Description |
|----------|--------|----------|-------------|
| `--org`  | string | Yes      | Organization name |
| `--team` | string | Yes      | Team slug |

**Output** (success):
```json
{
  "status": "deleted",
  "org": "my-org",
  "team": "old-team"
}
```

**Output** (error): Standard CLI error output with non-zero exit code.

**Exit codes**: `0` = success, `1` = API error.

**Confirmation**: The current CLI implementation does not prompt for confirmation before deleting. This is consistent with other destructive CLI commands in the codebase (e.g., `org delete`). A future enhancement could add `--yes` / `--confirm` flag gating.

### Web UI Design

**Status**: `Gated` — The team management UI surfaces are referenced in the feature inventory but not yet fully implemented. When implemented:

- **Delete button placement**: A "Delete team" button appears on the team detail page and in the team settings section, visible only to organization owners.
- **Confirmation dialog**: Clicking "Delete team" opens a modal confirmation dialog with:
  - Title: "Delete team?"
  - Body text: "This will permanently delete the team **{team_name}** and remove all its repository access grants and member associations. Organization members will not be removed from the organization. This action cannot be undone."
  - A text input requiring the user to type the team name to confirm.
  - A red "Delete team" button (disabled until the team name is typed correctly).
  - A "Cancel" button.
- **Post-deletion behavior**: On successful deletion, the user is redirected to the organization's team list page. A success toast notification appears: "Team '{team_name}' has been deleted."
- **Error handling**: If the API returns an error, the modal remains open and displays an inline error message.
- **Loading state**: The "Delete team" button shows a spinner and is disabled while the API call is in flight.

### TUI UI

**Status**: `Partial` — No team detail/management screen exists yet. When implemented:

- From the team detail screen, pressing `d` (delete) opens a confirmation prompt.
- The confirmation prompt displays: "Delete team '{team_name}'? This cannot be undone. [y/N]"
- On confirmation, the TUI calls the API, displays "Team deleted", and navigates back to the team list.
- On cancellation, the TUI returns to the team detail screen.
- On error, the TUI displays the error message inline.

### Neovim Plugin API

When implemented, the Neovim plugin should expose:

```vim
:Codeplane org team delete <org> <team>
```

This calls the API and displays the result in the command line. No confirmation prompt is needed in the editor context (users are expected to be deliberate with command-mode actions).

### Documentation

The following documentation surfaces should cover team deletion:

- **CLI reference** (`/cli-reference/commands#codeplane-org-team-delete`): Document the `org team delete` command, its arguments, output shape, and exit codes. Include an example.
- **API reference** (`/api-reference/orgs#delete-a-team`): Document `DELETE /api/orgs/:org/teams/:team` — path parameters, authentication requirements, response codes, and example `curl` invocation.
- **Organizations guide** (`/guides/organizations`): The existing "Teams" section already includes a `codeplane org team delete my-org old-team` example. Ensure the guide also explains what happens to team members and team repository assignments upon deletion.
- **Concepts page** (if exists): Include a note in the team lifecycle section explaining that deletion is permanent and cascades to membership and repo associations but not to the underlying users or repositories.

## Permissions & Security

### Authorization Roles

| Role | Can delete a team? | Notes |
|------|-------------------|-------|
| Organization Owner | ✅ Yes | Full authority over org structure |
| Organization Member | ❌ No | 403 Forbidden |
| Authenticated non-member | ❌ No | 403 Forbidden |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required beyond the platform default, as delete operations are infrequent and owner-restricted.
- If abuse is detected (e.g., scripted mass deletion), the platform rate limiter will throttle the caller.

### Data Privacy

- The request contains only the organization name and team slug — neither is PII.
- The response is `204 No Content` — no data is returned.
- Deleted team names, descriptions, and membership records are hard-deleted from the database. There is no soft-delete or retention period. This is privacy-positive: no lingering PII from team metadata.
- Audit logs (if implemented) should record the actor, organization, team name, and timestamp of the deletion. The audit log itself is access-controlled and not publicly visible.
- No PII exposure risk exists in this endpoint.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamDeleted` | A successful `204` response is returned | `org_name`, `team_name`, `actor_user_id`, `team_member_count` (at time of deletion), `team_repo_count` (at time of deletion), `team_age_days` (days since `created_at`), `client` (`api`, `cli`, `web`, `tui`) |
| `OrgTeamDeleteFailed` | A `4xx` or `5xx` response is returned | `org_name`, `team_name`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `client` |

### Funnel Metrics

- **Team deletion rate**: Number of teams deleted per month as a fraction of total teams created. A healthy deletion rate (5–15%) indicates active organizational hygiene. Near-zero suggests stale teams accumulating; very high suggests churn or misuse.
- **Team lifespan distribution**: Histogram of `team_age_days` at deletion time. Helps identify whether teams are being deleted prematurely (within hours) or living too long (years without activity).
- **Pre-deletion team size**: Distribution of `team_member_count` and `team_repo_count` at deletion time. Deleting teams with many members/repos may indicate access control disruptions worth monitoring.
- **Delete failure rate**: Percentage of delete attempts that result in errors. Should be <2% (most failures are expected 404s from non-existent teams).
- **Client distribution**: Breakdown of team deletions by client surface (API, CLI, web, TUI).

### Success Indicators

- Team deletion API latency p50 < 100ms, p99 < 500ms.
- Error rate < 1% of requests (excluding expected 401/403/404 responses).
- No orphaned `team_members` or `team_repos` records exist after deletion (verified by periodic consistency checks).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Team delete request received | `debug` | `org_name`, `team_name`, `actor_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Actor not org owner (403) | `info` | `org_name`, `actor_user_id`, `actor_role`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `team_name`, `request_id` |
| Team not found in org | `info` | `org_name`, `team_name`, `request_id` |
| Empty org or team name (400) | `info` | `raw_org`, `raw_team`, `request_id` |
| Team deleted successfully | `info` | `org_name`, `team_name`, `team_id`, `actor_user_id`, `request_id` |
| Unexpected error during team deletion | `error` | `org_name`, `team_name`, `actor_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_delete_requests_total` | counter | `status_code`, `org_name` | Total team delete requests |
| `codeplane_org_team_delete_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_org_team_delete_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `bad_request`, `internal`) | Error breakdown |
| `codeplane_org_teams_deleted_total` | counter | `org_name` | Cumulative count of successfully deleted teams (monotonic, useful for rate-of-deletion analysis) |

### Alerts

#### Alert: `OrgTeamDeleteHighErrorRate`
- **Condition**: `rate(codeplane_org_team_delete_errors_total{error_type="internal"}[5m]) > 0.01`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context containing `team_delete` or `deleteTeam`.
  2. Verify database connectivity — run `SELECT 1` against the teams table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label).
  4. Check for foreign key constraint violations in the logs — this could indicate a cascade failure or missing `ON DELETE CASCADE` constraint.
  5. Verify that the `team_members` and `team_repos` cascade rules are intact by inspecting the migration state.
  6. Check for recent deployments that may have altered the delete path.
  7. If the error is a query timeout, check `pg_stat_activity` for long-running transactions or locks on the `teams` table.
  8. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgTeamDeleteHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_team_delete_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to specific organizations (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the `DELETE FROM teams WHERE id = $1` query to check for lock contention.
  3. Check if the team being deleted has an unusually large number of members or repos (cascade delete of many rows can be slow).
  4. Check database connection pool utilization and wait times.
  5. Inspect `pg_locks` for lock contention on `teams`, `team_members`, or `team_repos` tables.
  6. If a single team had thousands of member or repo associations, consider adding batch cascade logic in a future iteration.

#### Alert: `OrgTeamDeleteSpikeRate`
- **Condition**: `rate(codeplane_org_teams_deleted_total[15m]) > 10` (more than 10 deletions in 15 minutes across all orgs)
- **Severity**: Warning
- **Runbook**:
  1. Determine if a single actor is responsible — check logs for `actor_user_id` patterns.
  2. Determine if a single org is losing all its teams — check `org_name` label distribution.
  3. Verify this is intentional (org restructuring) rather than a compromised owner account.
  4. If suspicious, temporarily disable the owner's session and notify the admin team.
  5. Check if an automation script or CI pipeline is executing team cleanup.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost mid-delete | 500 Internal Server Error; team may or may not be deleted depending on commit state | Automatic reconnection via pool; verify team state; alert fires |
| CASCADE delete fails (constraint violation) | 500 Internal Server Error; team remains intact (transaction rollback) | Investigate foreign key constraint; check migration state |
| Concurrent delete of same team | One request returns 204, the other returns 404 | Both are correct responses; no intervention needed |
| Team with thousands of members/repos | Slow but successful deletion | Monitor latency; consider batch cascade if this becomes common |
| Owner account compromised, mass deletion | Teams are permanently deleted | Restore from backup; revoke compromised credentials; spike alert fires |
| Network timeout before response reaches client | Client sees a timeout error; team may already be deleted server-side | Client should retry; second attempt returns 404 (idempotent from user perspective) |

## Verification

### API Integration Tests

- **`test: returns 204 when org owner deletes an existing team`** — Create org, create team, delete team as owner, assert 204 with empty body.
- **`test: deleted team no longer appears in team list`** — Create org, create team, delete team, list teams, assert deleted team is absent.
- **`test: returns 401 for unauthenticated request`** — Send DELETE with no session/token, assert 401.
- **`test: returns 403 when org member (non-owner) attempts deletion`** — Create org, add second user as member, authenticate as member, attempt delete, assert 403.
- **`test: returns 403 for authenticated user who is not an org member`** — Authenticate as a user with no org membership, attempt delete, assert 403.
- **`test: returns 404 for nonexistent organization`** — Attempt to delete a team in org `"nonexistent-org-xyz"`, assert 404.
- **`test: returns 404 for nonexistent team in valid organization`** — Create org, attempt to delete team `"no-such-team"`, assert 404.
- **`test: returns 404 on second delete of same team (idempotency)`** — Create org, create team, delete team (assert 204), delete same team again (assert 404).
- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", create team, delete team using org name "myorg" (lowercase), assert 204.
- **`test: team name is resolved case-insensitively`** — Create org, create team "BackendTeam", delete using "backendteam" (lowercase), assert 204.
- **`test: returns 400 for empty org name`** — Send `DELETE /api/orgs/%20/teams/some-team`, assert 400 with message containing `"organization name is required"`.
- **`test: returns 400 for empty team name`** — Send `DELETE /api/orgs/my-org/teams/%20`, assert 400 with message containing `"team name is required"`.
- **`test: team members are removed on deletion`** — Create org, create team, add 3 members to team, delete team, verify team members are gone (list team members returns 404 since team no longer exists).
- **`test: team repo associations are removed on deletion`** — Create org, create team, assign 2 repos to team, delete team, verify team repo associations are gone (list team repos returns 404 since team no longer exists).
- **`test: org membership is preserved after team deletion`** — Create org, add user as member, add user to team, delete team, list org members, assert user is still an org member.
- **`test: repository is preserved after team deletion`** — Create org, create repo in org, assign repo to team, delete team, verify repo still exists and is accessible.
- **`test: other teams in the org are unaffected`** — Create org, create team-a and team-b, delete team-a, list teams, assert team-b still exists with correct data.
- **`test: request body is ignored`** — Send DELETE with a JSON body `{ "unexpected": true }`, assert 204 (body is ignored).
- **`test: org name with 40 characters resolves correctly`** (maximum valid length) — Create org with 40-character name, create team, delete team, assert 204.
- **`test: team name with 40 characters resolves correctly`** (maximum valid length) — Create org, create team with 40-character slug, delete team, assert 204.
- **`test: org name with 41 characters returns 404`** (exceeds maximum) — Attempt delete with a 41-character org name, assert 404.
- **`test: team name with 41 characters returns 404`** (exceeds maximum) — Attempt delete with a 41-character team name, assert 404.
- **`test: path-encoded null byte in org name returns 400 or 404`** — Send `DELETE /api/orgs/my%00org/teams/team`, assert 400 or 404.
- **`test: path-encoded slash in team name returns 400 or 404`** — Send `DELETE /api/orgs/myorg/teams/my%2Fteam`, assert 400 or 404.

### Concurrent Deletion Tests

- **`test: concurrent delete of same team — one succeeds, one gets 404`** — Create org, create team, fire two DELETE requests simultaneously, assert exactly one 204 and one 404 across the two responses.

### CLI E2E Tests

- **`test: codeplane org team delete --org <name> --team <name> succeeds`** — Create org, create team, run `org team delete --org <name> --team <name>`, assert exit code 0 and JSON output contains `"status": "deleted"`.
- **`test: deleted team is gone from org team list`** — After CLI delete, run `org team list --org <name>`, assert deleted team is absent.
- **`test: CLI outputs correct org and team fields`** — Run delete, parse JSON output, assert `org` matches provided org name and `team` matches provided team name.
- **`test: CLI exits non-zero for nonexistent org`** — Run `org team delete --org nonexistent --team any`, assert non-zero exit code.
- **`test: CLI exits non-zero for nonexistent team`** — Create org, run `org team delete --org <name> --team nonexistent`, assert non-zero exit code.
- **`test: CLI exits non-zero when --org is omitted`** — Run `org team delete --team some-team` without `--org`, assert error output.
- **`test: CLI exits non-zero when --team is omitted`** — Run `org team delete --org some-org` without `--team`, assert error output.
- **`test: CLI delete followed by re-delete returns error`** — Delete a team, then attempt to delete again, assert non-zero exit code on second attempt.

### Playwright Web UI E2E Tests (when team management UI is implemented)

- **`test: delete team button visible only to org owners`** — Authenticate as member, navigate to team detail, assert delete button is not visible. Switch to owner, assert delete button is visible.
- **`test: delete team confirmation dialog appears on click`** — Click "Delete team", assert modal with team name confirmation input appears.
- **`test: delete team button disabled until team name typed correctly`** — Open modal, assert delete button is disabled. Type wrong name, assert still disabled. Type correct name, assert enabled.
- **`test: successful deletion redirects to team list`** — Complete deletion flow, assert URL is the team list page.
- **`test: success toast appears after deletion`** — Complete deletion, assert toast notification with team name appears.
- **`test: deleted team absent from team list after redirect`** — After deletion and redirect, assert the deleted team name is not in the list.
- **`test: cancel button closes modal without deleting`** — Open confirmation modal, click "Cancel", assert modal closes. Navigate away and back, assert team still exists.
- **`test: error message displayed in modal on API failure`** — Simulate API failure (e.g., network error), assert error message appears in modal and modal remains open.

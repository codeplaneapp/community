# ORG_MEMBER_REMOVE

Specification for ORG_MEMBER_REMOVE.

## High-Level User POV

Organizations grow and change. People leave the company, shift to different business units, or simply no longer need access to an organization's repositories and resources. When this happens, an organization owner needs to cleanly remove that person from the organization — revoking all access that flows through organizational membership — without disrupting anything else in the system.

Removing a member from an organization is a significant action. Unlike removing someone from a single team (which only revokes team-scoped repository access), removing someone from the organization severs their connection entirely. They lose membership in every team they belonged to within that organization, they lose every access path that flowed through that organization, and they no longer appear in the organization's member list. However, the removed user's personal account, their own repositories, and any data they created (issues, comments, changes) remain intact. The operation targets the association between the user and the organization — nothing else.

Because of the scope of this action, it is restricted to organization owners. Regular members can see who belongs to the organization, but they cannot change membership. This ensures that consequential access changes are made deliberately by people with full administrative authority over the organization.

There is one critical safety guard: the last remaining owner of an organization cannot be removed. Every organization must have at least one owner at all times. If an owner needs to step down, another owner must be designated first. This prevents accidental orphaning of organizations where no one has administrative control.

From the user's perspective, the workflow is direct. An owner identifies the member they want to remove — by browsing the organization's member list in the web UI, using the CLI, or calling the API. They issue a remove command specifying the organization and the username. The member is removed immediately. The owner can verify the change by listing organization members again and confirming the removed user is no longer present.

This feature is essential for organizational security and hygiene. Without it, organizations accumulate stale members who retain access they no longer need, creating an ever-growing attack surface and compliance liability. It completes the organization membership lifecycle: members can be added, listed, and ultimately removed when their participation in the organization is no longer appropriate.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a `401 Unauthorized` response.
- **Organization owner role required**: Only users with the `owner` role in the specified organization may remove a member. Members, non-members, and anonymous users must receive `403 Forbidden`.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return `404 Not Found`.
- **User must exist**: If the username does not resolve to a valid user, the endpoint must return `404 Not Found` with message `"user not found"`.
- **Target must be an organization member**: If the resolved user is not currently a member of the organization, the endpoint must return `404 Not Found` with message `"organization member not found"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive username lookup**: The username in the URL path must be resolved case-insensitively (via `lower_username`).
- **Successful removal returns 204**: A successful removal must return `204 No Content` with an empty body.
- **Not idempotent**: Unlike team member removal, removing an org member who has already been removed returns `404 Not Found` with `"organization member not found"`. The service explicitly checks membership before deleting.
- **Last owner protection**: If the target member is an organization owner and they are the only owner, the endpoint must return `409 Conflict` with message `"cannot remove the last organization owner"`.
- **Multiple owners — owner can be removed**: If the organization has two or more owners, any of them can be removed by another owner. The owner count constraint only blocks removal when exactly one owner remains.
- **Team memberships are cascade-removed**: Removing a user from the organization must also remove them from all teams within that organization.
- **No data cascade beyond membership**: Removing an org member must not delete or modify: repositories owned by the organization, issues, landing requests, wiki entries, workflows, releases, webhooks, secrets, variables, or any data outside the membership associations.
- **User account is preserved**: The removed user's personal account, their own repositories, and all personal data remain unaffected.
- **Owner can remove other owners**: An owner can remove another owner, provided it does not violate the last-owner constraint.
- **Owner cannot remove themselves if last owner**: If the actor is the last remaining owner and attempts to remove themselves, the endpoint must return `409 Conflict`.
- **Owner can remove themselves if not last owner**: If the organization has multiple owners, an owner should be able to remove themselves.
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return `400 Bad Request` with message `"organization name is required"`.
- **Empty username**: A request with an empty or whitespace-only `:username` path parameter must return `400 Bad Request` with message `"username is required"`.
- **Org name max length**: Organization names exceeding 40 characters must return `404 Not Found` (no matching org will exist; this is enforced at creation time).
- **Username max length**: Usernames exceeding 40 characters must return `404 Not Found` (no matching user will exist; this is enforced at user creation time).
- **Special characters in path**: Path-encoded special characters (e.g., `%2F`, `%00`) in the `:org` or `:username` parameter must result in `404 Not Found` (no matching entity) or `400 Bad Request`.
- **Concurrent removal by two owners**: If two concurrent remove requests target the same org member, one should succeed with `204` and the subsequent one should return `404` (member already removed).
- **CLI returns confirmation**: The CLI `org member remove` command must output a JSON object with `status: "removed"`, `org`, and `username` fields on success.
- **CLI exits non-zero on error**: The CLI must exit with a non-zero exit code when the API returns an error.
- **Request body is ignored**: Any request body sent with the DELETE request must be ignored.

### Definition of Done

- The `DELETE /api/orgs/:org/members/:username` route correctly removes the organization member and returns `204 No Content`.
- Team memberships within the organization are also removed.
- The last-owner constraint is enforced and returns `409 Conflict`.
- Non-owners, non-members, and unauthenticated users are correctly rejected.
- Non-member targets return `404 Not Found`.
- CLI `org member remove` command works end-to-end.
- All verification tests pass.
- Observability instrumentation is in place.
- User-facing documentation covers the remove organization member action.

## Design

### API Shape

**Endpoint**: `DELETE /api/orgs/:org/members/:username`

**Path Parameters**:

| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| `org`      | string | Yes      | Organization name (case-insensitive) |
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
| 400    | Empty or whitespace-only `:username` parameter | `{ "error": "username is required" }` |
| 401    | Unauthenticated request | `{ "error": "authentication required" }` |
| 403    | Authenticated user is not org owner | `{ "error": "forbidden" }` |
| 404    | Organization not found | `{ "error": "not found" }` |
| 404    | User not found | `{ "error": "user not found" }` |
| 404    | User is not an org member | `{ "error": "organization member not found" }` |
| 409    | Target is the last organization owner | `{ "error": "cannot remove the last organization owner" }` |

**Example**:

```bash
curl -X DELETE \
  -H "Authorization: token cp_pat_abc123" \
  https://codeplane.example.com/api/orgs/acme-corp/members/alice
# → 204 No Content
```

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async removeOrgMember(
  actor: User,
  orgName: string,
  username: string,
): Promise<Result<void, APIError>>
```

The service:
1. Validates that `actor` is authenticated (returns `401` if not).
2. Resolves the organization by `lower_name` case-insensitively (returns `404` if not found).
3. Verifies the actor holds the `owner` role in the organization (returns `403` if not).
4. Trims and lowercases the `username` input. Returns `400` if empty.
5. Resolves the target user by `lower_username` (returns `404` with `"user not found"` if not found).
6. Verifies the target user is an organization member (returns `404` with `"organization member not found"` if not).
7. If the target member's role is `owner`, counts the total number of org owners. If the count is 1, returns `409` with `"cannot remove the last organization owner"`.
8. Executes `DELETE FROM org_members WHERE organization_id = $1 AND user_id = $2`.
9. Returns `Result.ok(undefined)`.

### CLI Command

```
codeplane org member remove <username> --org <organization_name>
```

| Argument     | Type   | Required | Description |
|--------------|--------|----------|-------------|
| `<username>` | string | Yes      | Positional: username to remove |
| `--org`      | string | Yes      | Organization name |

**Output** (success):
```json
{
  "status": "removed",
  "org": "acme-corp",
  "username": "alice"
}
```

**Output** (error): Standard CLI error output with non-zero exit code.

**Exit codes**: `0` = success, `1` = API error.

**Notes**: The CLI does not prompt for confirmation before removing. This is consistent with other org management CLI commands in the codebase (e.g., `org team member remove`). A future enhancement could add a `--yes` / `--confirm` flag gating for this higher-impact operation.

### Web UI Design

**Status**: `Gated` — The organization settings UI surfaces are referenced in the feature inventory (`ORG_SETTINGS_UI`) but not yet fully implemented. When implemented:

- **Member list context**: The organization member list page (under organization settings) displays each member in a row showing their username, avatar, role badge, and join date. For organization owners, each member row includes a "Remove" action (icon button or kebab menu item).
- **Self-removal disabled for last owner**: If the viewing owner is the last owner, their own row must not show a remove action. A tooltip should explain: "You are the last owner. Transfer ownership before removing yourself."
- **Confirmation dialog**: Clicking "Remove" opens a modal confirmation dialog with:
  - Title: "Remove organization member?"
  - Body text: "Remove **{username}** from **{org_name}**? They will lose all access to this organization's repositories and will be removed from all teams. This action cannot be undone."
  - A red "Remove member" button.
  - A "Cancel" button.
- **Post-removal behavior**: On successful removal, the member row is removed from the list without a full page reload. A success toast notification appears: "'{username}' has been removed from '{org_name}'."
- **Error handling**: If the API returns an error (e.g., 409 last owner conflict), the modal remains open and displays an inline error message. For 409: "Cannot remove the last organization owner. Add another owner first."
- **Loading state**: The "Remove member" button shows a spinner and is disabled while the API call is in flight.
- **Non-owner visibility**: Members who are not org owners must not see any "Remove" action on member rows.
- **Empty state**: If removing a member results in only the owner remaining, the member list updates to reflect the reduced count.

### TUI UI

**Status**: `Partial` — No dedicated organization member management screen exists yet in the TUI. When implemented:

- From the organization detail screen, the member list is displayed.
- Pressing `r` on a highlighted member opens a confirmation prompt: "Remove '{username}' from organization '{org_name}'? All team memberships will be revoked. [y/N]"
- On confirmation (`y`), the TUI calls the API, displays "Member removed from organization", and refreshes the member list.
- On cancellation (`N` or Enter), the TUI returns to the member list with no changes.
- On error, the TUI displays the error message inline below the member list.
- The last owner row should be visually marked and the `r` shortcut should display a message rather than a confirmation: "Cannot remove the last organization owner."

### Neovim Plugin API

When implemented, the Neovim plugin should expose:

```vim
:Codeplane org remove-member <org> <username>
```

This calls the API and displays the result in the command line. No confirmation prompt is needed in the editor context.

### Documentation

The following documentation surfaces should cover organization member removal:

- **CLI reference** (`/cli-reference/commands#codeplane-org-member-remove`): Document the `org member remove` command, its positional argument, flags, output shape, and exit codes. Include an example showing removal and subsequent verification via `org members`.
- **API reference** (`/api-reference/orgs#remove-an-organization-member`): Document `DELETE /api/orgs/:org/members/:username` — path parameters, authentication requirements, response codes, last-owner constraint, non-idempotent behavior, and example `curl` invocation.
- **Organizations guide** (`/guides/organizations`): The "Members" section should explain how to remove members from an organization, what happens to their access (all org and team access revoked), what is preserved (personal account, personal repos, authored data), and the last-owner safety constraint. Include CLI and API examples.
- **Concepts page** (if exists): Include a note in the organization membership section clarifying that removal severs the org association and all team memberships within it, but does not cascade to data the user authored (issues, comments, changes, etc.).

## Permissions & Security

### Authorization Roles

| Role | Can remove an org member? | Notes |
|------|--------------------------|-------|
| Organization Owner | ✅ Yes | Full authority over org structure |
| Organization Member | ❌ No | 403 Forbidden |
| Authenticated non-member | ❌ No | 403 Forbidden |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Self-Removal

An organization owner can remove themselves from the organization — but only if there is at least one other owner. If the actor is the last owner, the request returns `409 Conflict`. An org member (non-owner) cannot remove themselves because they lack the `owner` role required for any membership modification.

### Last Owner Constraint

The system must enforce that at least one owner exists in every organization at all times. This is checked by counting rows in `org_members` where `role = 'owner'` for the given organization. If the count is exactly 1 and the target of removal holds the `owner` role, the operation is rejected with `409 Conflict`.

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required beyond the platform default, as member removal operations are infrequent and owner-restricted.
- If abuse is detected (e.g., scripted mass removal of all members), the platform rate limiter will throttle the caller.
- A future enhancement could add a specific rate limit (e.g., 20 member removals per minute per organization) to prevent rapid bulk removal by a compromised owner account.

### Data Privacy

- The request contains only the organization name and username — neither is classified as PII in isolation.
- The response is `204 No Content` — no data is returned.
- The `org_members` association row is hard-deleted from the database. There is no soft-delete or retention period. This is privacy-positive: no lingering association data.
- Audit logs (if implemented) should record the actor, organization, removed username, removed user's role, and timestamp. The audit log itself is access-controlled and not publicly visible.
- No PII exposure risk exists in this endpoint.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgMemberRemoved` | A successful `204` response is returned | `org_id`, `org_name`, `removed_username`, `removed_user_id`, `removed_user_role`, `actor_user_id`, `org_member_count_after` (members remaining), `org_owner_count_after` (owners remaining), `membership_duration_days` (days since user was added to org, if trackable), `team_memberships_revoked` (count of team memberships removed), `client` (`api`, `cli`, `web`, `tui`) |
| `OrgMemberRemoveFailed` | A `4xx` or `5xx` response is returned | `org_name`, `target_username`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `client` |
| `OrgMemberRemoveLastOwnerBlocked` | A `409` is returned due to last-owner constraint | `org_id`, `org_name`, `target_username`, `actor_user_id`, `client` |

### Funnel Metrics

- **Organization member removal rate**: Number of members removed per month as a fraction of total org member additions. A healthy rate indicates active organizational hygiene. Near-zero suggests stale rosters; very high suggests organizational churn or misuse.
- **Membership duration at removal**: Distribution of `membership_duration_days` at removal time. Helps identify whether members are being removed prematurely (within hours — possible accidental addition) or staying too long (membership never reviewed).
- **Post-removal org size**: Distribution of `org_member_count_after` at removal time. If many orgs go to 1 member (just the owner), it may indicate the organization is being wound down.
- **Last-owner block rate**: Frequency of `OrgMemberRemoveLastOwnerBlocked` events. If high, it may indicate a UX problem — users attempting to leave organizations without understanding the ownership transfer requirement.
- **Remove failure rate**: Percentage of remove attempts that result in unexpected errors (excluding expected 401/403/404/409 responses). Should be <1%.
- **Client distribution**: Breakdown of org member removals by client surface (API, CLI, web, TUI).
- **Team membership revocation count**: Average `team_memberships_revoked` per removal. High values may indicate users accumulate many team memberships before being removed — a signal for better lifecycle management.
- **Self-removal rate**: Percentage of removals where `actor_user_id == removed_user_id`. Helps understand whether owners are using self-removal as a "leave organization" action.

### Success Indicators

- Organization member removal API latency p50 < 50ms, p99 < 500ms.
- Error rate < 1% of requests (excluding expected 401/403/404/409 responses).
- No orphaned `org_members` rows for deleted users (verified by periodic consistency checks).
- No orphaned `team_members` rows after org member removal (team membership cascade verified).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Org member remove request received | `debug` | `org_name`, `target_username`, `actor_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Actor not org owner (403) | `info` | `org_name`, `actor_user_id`, `actor_role`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `target_username`, `request_id` |
| Target user not found | `info` | `org_name`, `target_username`, `request_id` |
| Target user is not an org member | `info` | `org_name`, `target_username`, `target_user_id`, `request_id` |
| Last owner removal blocked (409) | `warn` | `org_name`, `target_username`, `target_user_id`, `actor_user_id`, `owner_count`, `request_id` |
| Empty org or username (400) | `info` | `raw_org`, `raw_username`, `request_id` |
| Org member removed successfully | `info` | `org_name`, `org_id`, `target_username`, `target_user_id`, `target_role`, `actor_user_id`, `request_id` |
| Team memberships cascade-removed | `info` | `org_name`, `target_username`, `target_user_id`, `teams_removed_count`, `request_id` |
| Unexpected error during org member removal | `error` | `org_name`, `target_username`, `actor_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_member_remove_requests_total` | counter | `status_code`, `org_name` | Total org member remove requests |
| `codeplane_org_member_remove_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_org_member_remove_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `bad_request`, `conflict`, `internal`) | Error breakdown |
| `codeplane_org_members_removed_total` | counter | `org_name` | Cumulative count of successfully removed org members (monotonic) |
| `codeplane_org_member_remove_last_owner_blocked_total` | counter | `org_name` | Count of removals blocked by last-owner constraint |

### Alerts

#### Alert: `OrgMemberRemoveHighErrorRate`
- **Condition**: `rate(codeplane_org_member_remove_errors_total{error_type="internal"}[5m]) > 0.01`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context containing `removeOrgMember` or `org_member_remove`.
  2. Verify database connectivity — run `SELECT 1` against the `org_members` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label).
  4. Inspect the `org_members` table schema for constraint or index corruption.
  5. Check for recent deployments that may have altered the remove path or the `org_members` DELETE query.
  6. If the error is a query timeout, check `pg_stat_activity` for long-running transactions or locks on the `org_members` table.
  7. Verify that the `getUserByLowerUsername` and `getOrgMember` lookups are functioning (these are prerequisites of the remove path).
  8. Verify that `countOrgOwners` is returning correct counts (incorrect counts could cause spurious 409s or allow removal of last owner).
  9. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgMemberRemoveHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_member_remove_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to specific organizations (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the `DELETE FROM org_members WHERE organization_id = $1 AND user_id = $2` query to check for missing indexes or lock contention.
  3. Check if the org resolution, user lookup, or owner count steps are slow (these involve separate queries).
  4. Check database connection pool utilization and wait times.
  5. Inspect `pg_locks` for lock contention on the `org_members` table.
  6. Review whether cascade team membership cleanup (if implemented as multiple queries) is contributing to latency.
  7. Check if trigger-based or FK-cascade operations on `org_members` are adding overhead.

#### Alert: `OrgMemberRemoveSpikeRate`
- **Condition**: `rate(codeplane_org_members_removed_total[15m]) > 30` (more than 30 removals in 15 minutes across all orgs)
- **Severity**: Warning
- **Runbook**:
  1. Determine if a single actor is responsible — check logs for `actor_user_id` patterns.
  2. Determine if a single org is losing all its members — check `org_name` label distribution.
  3. Verify this is intentional (company offboarding event, org dissolution) rather than a compromised owner account.
  4. If suspicious, temporarily disable the owner's session and notify the admin team.
  5. Check if an automation script or CI pipeline is executing org cleanup.
  6. If legitimate, consider whether the spike threshold needs adjustment for this organization's normal operating scale.

#### Alert: `OrgMemberRemoveLastOwnerBlockedSpike`
- **Condition**: `rate(codeplane_org_member_remove_last_owner_blocked_total[1h]) > 10`
- **Severity**: Info
- **Runbook**:
  1. This likely indicates user confusion rather than a system issue.
  2. Check if a single user is repeatedly hitting the constraint — they may need guidance on ownership transfer.
  3. Review whether the UI/CLI error message is sufficiently clear about the requirement to add another owner first.
  4. Consider whether this warrants a UX improvement (e.g., prompting the user to transfer ownership inline).

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost mid-delete | 500 Internal Server Error; org member row may or may not be deleted depending on commit state | Automatic reconnection via pool; verify membership state; alert fires |
| Target user exists but is not an org member | 404 Not Found with `"organization member not found"` | No intervention needed; this is correct behavior |
| Target is last org owner | 409 Conflict with `"cannot remove the last organization owner"` | No intervention; user must add another owner first |
| Concurrent removal of same member by two owners | First returns 204; second returns 404 (member already removed) | No intervention needed |
| Owner removes themselves (not last) | 204 No Content; user loses all org access | Correct behavior; re-add requires another owner to invite |
| Org deleted between permission check and member removal | Possible foreign key violation or no-op depending on timing | 500 if FK violation; client retries; second attempt returns 404 |
| Owner account compromised, mass member removal | Members lose all org-based access | Re-add members; revoke compromised credentials; spike alert fires |
| Network timeout before response reaches client | Client sees timeout; member may already be removed | Client should check member list; retry will return 404 if already removed |
| countOrgOwners returns incorrect count | Last owner could be removed (if under-count) or non-last owners blocked (if over-count) | Investigate count query; fix data inconsistency; audit org_members table |

## Verification

### API Integration Tests

- **`test: returns 204 when org owner removes an existing org member`** — Create org, add user as member, remove user as owner, assert 204 with empty body.
- **`test: removed member no longer appears in org member list`** — Create org, add user, remove user, list org members, assert removed user is absent.
- **`test: returns 401 for unauthenticated request`** — Send DELETE with no session/token, assert 401.
- **`test: returns 403 when org member (non-owner) attempts removal`** — Create org, add user-a as member, add user-b as member, authenticate as user-a (non-owner), attempt to remove user-b, assert 403.
- **`test: returns 403 for authenticated user who is not an org member`** — Authenticate as a user with no org membership, attempt to remove an org member, assert 403.
- **`test: returns 404 for nonexistent organization`** — Attempt to remove member in org `"nonexistent-org-xyz"`, assert 404.
- **`test: returns 404 for nonexistent username`** — Create org, attempt to remove `"nonexistent-user-xyz"`, assert 404 with `"user not found"`.
- **`test: returns 404 when target user exists but is not an org member`** — Create org, attempt to remove a valid user who was never added to the org, assert 404 with `"organization member not found"`.
- **`test: returns 404 on second removal of same member (not idempotent)`** — Create org, add user, remove user (assert 204), attempt to remove same user again (assert 404 with `"organization member not found"`).
- **`test: returns 409 when attempting to remove the last org owner`** — Create org (single owner), attempt to remove the owner, assert 409 with `"cannot remove the last organization owner"`.
- **`test: allows removal of an owner when multiple owners exist`** — Create org, add second user as owner, remove original owner, assert 204.
- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", add member, remove member using org name "myorg" (lowercase), assert 204.
- **`test: username is resolved case-insensitively`** — Create org, add user "Alice", remove using "alice" (lowercase), assert 204.
- **`test: returns 400 for empty org name`** — Send `DELETE /api/orgs/%20/members/alice`, assert 400 with message containing `"organization name is required"`.
- **`test: returns 400 for empty username`** — Send `DELETE /api/orgs/my-org/members/%20`, assert 400 with message containing `"username is required"`.
- **`test: owner can remove themselves if not last owner`** — Create org, add second owner, authenticate as original owner, remove self, assert 204.
- **`test: owner cannot remove themselves if last owner`** — Create org (single owner), authenticate as that owner, attempt self-removal, assert 409.
- **`test: removing member preserves user's personal account`** — Create org, add user, remove user, fetch user profile, assert user still exists.
- **`test: removing member does not affect org's repositories`** — Create org, create repo under org, add member, remove member, list org repos, assert repo still exists.
- **`test: removing member does not affect other org members`** — Create org, add user-a and user-b, remove user-a, list org members, assert user-b is still a member.
- **`test: removing member does not affect issues authored by that member`** — Create org, add member, member creates an issue on org repo, remove member, verify issue still exists.
- **`test: team memberships within org are also revoked`** — Create org, create team, add user to org and team, remove user from org, list team members, assert user is absent from team.
- **`test: removing member from org revokes membership in all teams`** — Create org, create team-a and team-b, add user to org and both teams, remove user from org, list team-a and team-b members, assert user is absent from both.
- **`test: request body is ignored`** — Send DELETE with a JSON body `{ "unexpected": true }`, assert 204 (body is ignored).
- **`test: org name with 40 characters resolves correctly`** (maximum valid length) — Create org with 40-character name, add member, remove member, assert 204.
- **`test: username with 40 characters resolves correctly`** (maximum valid length) — Create user with 40-character username, add to org, remove from org, assert 204.
- **`test: org name with 41 characters returns 404`** (exceeds maximum) — Attempt removal with a 41-character org name, assert 404.
- **`test: username with 41 characters returns 404`** (exceeds maximum) — Attempt removal with a 41-character username, assert 404.
- **`test: path-encoded null byte in org name returns 400 or 404`** — Send `DELETE /api/orgs/my%00org/members/alice`, assert 400 or 404.
- **`test: path-encoded null byte in username returns 400 or 404`** — Send `DELETE /api/orgs/myorg/members/al%00ice`, assert 400 or 404.
- **`test: path-encoded slash in username returns 400 or 404`** — Send `DELETE /api/orgs/myorg/members/al%2Fice`, assert 400 or 404.

### Concurrent Removal Tests

- **`test: concurrent removal of same member — first succeeds, second gets 404`** — Create org, add member, fire two DELETE requests simultaneously, assert one returns 204 and the other returns either 204 or 404.
- **`test: concurrent removal of different members — both succeed with 204`** — Create org, add user-a and user-b, fire DELETE for both simultaneously, assert both return 204.

### CLI E2E Tests

- **`test: codeplane org member remove <username> --org <name> succeeds`** — Create org, add member, run CLI remove command, assert exit code 0 and JSON output contains `"status": "removed"`.
- **`test: removed member is gone from org member list`** — After CLI remove, run `org members --org <name>`, assert removed user is absent.
- **`test: CLI outputs correct org and username fields`** — Run remove, parse JSON output, assert `org` and `username` match provided values.
- **`test: CLI exits non-zero for nonexistent org`** — Run `org member remove alice --org nonexistent`, assert non-zero exit code.
- **`test: CLI exits non-zero for nonexistent username`** — Create org, run `org member remove nonexistent-user --org <name>`, assert non-zero exit code.
- **`test: CLI exits non-zero for non-member user`** — Create org, run `org member remove <valid-user-not-in-org> --org <name>`, assert non-zero exit code.
- **`test: CLI exits non-zero when --org is omitted`** — Run `org member remove alice` without `--org`, assert error output.
- **`test: CLI returns 409 error when removing last owner`** — Create org (single owner), run `org member remove <owner> --org <name>`, assert non-zero exit code and error output mentions last owner.
- **`test: CLI remove followed by re-remove returns error (not idempotent)`** — Remove a member, then attempt to remove again, assert non-zero exit code on second attempt.

### Playwright Web UI E2E Tests (when organization settings UI is implemented)

- **`test: remove button visible only to org owners`** — Authenticate as member, navigate to org member list, assert remove action is not visible. Switch to owner, assert remove action is visible.
- **`test: remove confirmation dialog appears on click`** — Click "Remove" on a member row, assert modal with member username and org name appears.
- **`test: confirmation dialog warns about team membership loss`** — Open confirmation modal, assert text mentions team access will be revoked.
- **`test: successful removal removes member row from list`** — Complete removal flow, assert member row is no longer in the list without full page reload.
- **`test: success toast appears after removal`** — Complete removal, assert toast notification with username and org name appears.
- **`test: cancel button closes modal without removing`** — Open confirmation modal, click "Cancel", assert modal closes. Verify member is still in the list.
- **`test: error message displayed in modal for last-owner conflict`** — Attempt to remove last owner (if UI permits the action), assert 409 error message appears in modal.
- **`test: loading state shown during removal`** — Click "Remove member", assert button shows spinner and is disabled during API call.
- **`test: last owner row does not show remove action`** — As the only owner, verify your own row does not display a remove button.
- **`test: member count updates after removal`** — Remove a member, assert the displayed member count decrements by one.

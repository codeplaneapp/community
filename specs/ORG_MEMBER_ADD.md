# ORG_MEMBER_ADD

Specification for ORG_MEMBER_ADD.

## High-Level User POV

When an organization owner wants to bring someone onto their organization, they add them as an organization member. This is the foundational access-granting action in Codeplane's organization model — before a user can be placed on any team, given access to organization-scoped repositories, or participate in organization-level workflows, they must first be added as an organization member.

The workflow is simple. An organization owner identifies a Codeplane user by their user ID and assigns them a role — either "owner" (full administrative control over the organization) or "member" (standard participation rights). The addition takes effect immediately with no invitation or acceptance step required. From that moment, the new member appears in the organization's member list and becomes eligible for team assignment, repository access through teams, and visibility into organization-scoped resources.

This feature is available from the CLI via `codeplane org member add`, through the API for programmatic access, and will be available from the web UI and TUI once the organization management UI surfaces are fully implemented. The action is designed to be fast and unambiguous: it either succeeds, or it tells you exactly why it didn't — the user doesn't exist, you don't have permission, the user is already a member, or the role you specified isn't valid.

Organization membership is the gatekeeper for all downstream access in Codeplane's organization model. Teams cannot include non-members. Repository access through teams flows from organization membership. By keeping this boundary explicit and enforced, Codeplane ensures that organization owners always have a clear, auditable roster of who belongs to their organization before any finer-grained permissions come into play.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a 401 Unauthorized response.
- **Organization owner required**: Only users who hold the `owner` role within the target organization may add members. Users with `member` role or no organization affiliation must receive a 403 Forbidden response.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return a 404 Not Found response with message `"organization not found"`.
- **Target user must exist**: If the provided `user_id` does not correspond to an existing user, the endpoint must return a 404 Not Found response with message `"user not found"`.
- **Valid user_id required**: The `user_id` field must be a positive integer. A `user_id` of 0 or negative must return a 422 Validation Failed response with `resource: "OrgMember"`, `field: "user_id"`, `code: "invalid"`.
- **Valid role required**: The `role` field must be either `"owner"` or `"member"` (case-insensitive, trimmed). Any other value or empty/missing role must return a 422 Validation Failed response with `resource: "OrgMember"`, `field: "role"`, `code: "invalid"`.
- **No duplicate memberships**: If the target user is already a member of the organization, the endpoint must return a 409 Conflict response with message `"user is already a member of the organization"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name` column).
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return 400 Bad Request with message `"organization name is required"`.
- **Role normalization**: The role value should be trimmed and lowercased before validation and storage. `"Owner"`, `"MEMBER"`, `" owner "` should all be accepted and stored normalized.
- **Response code on success**: A successful member addition must return 201 Created with an empty body.
- **Request body required**: The POST request requires a JSON body with `user_id` (number) and `role` (string) fields.
- **Content-Type enforcement**: The request must include `Content-Type: application/json`. Non-JSON content types should be rejected by the middleware stack.
- **No data leakage**: Error responses must not expose internal IDs (beyond the user-supplied `user_id`), stack traces, or database details.
- **Content-Type on errors**: Error responses must include `Content-Type: application/json` header.
- **Org name max length**: Organization names longer than 255 characters must return 404 (no organization will match).
- **Missing body fields**: If `user_id` is omitted from the body, it defaults to 0, which triggers a 422 validation error. If `role` is omitted, it defaults to empty string, which triggers a 422 validation error.
- **Owner can add multiple members**: Successive calls with different valid `user_id` values must each succeed independently.
- **Self-add returns conflict**: An organization owner attempting to add themselves returns 409 since they are already a member (added at org creation).

### Definition of Done

- The `POST /api/orgs/:org/members` route correctly adds a user to an organization when all preconditions are met.
- Non-owners, unauthenticated users, and invalid inputs are correctly rejected with appropriate status codes and error messages.
- Duplicate additions are caught via unique constraint and return 409 Conflict.
- Organization name is resolved case-insensitively.
- Role is normalized (trimmed, lowercased) before validation and persistence.
- CLI `org member add` command works end-to-end.
- All verification tests pass.
- Observability instrumentation is in place.
- Documentation for the API endpoint and CLI command is published.

## Design

### API Shape

**Endpoint**: `POST /api/orgs/:org/members`

**Path Parameters**:
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`. `Content-Type: application/json`.

**Request Body** (JSON):
| Field     | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `user_id` | number | Yes      | The numeric ID of the user to add. Must be a positive integer. |
| `role`    | string | Yes      | The role to assign: `"owner"` or `"member"`. Case-insensitive, trimmed before validation. |

**Response** (201 Created): Empty body.

**Error Responses**:
| Status | Condition | Error Message |
|--------|-----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 401    | No valid session cookie or PAT provided | `"authentication required"` |
| 403    | Authenticated user is not an org owner | `"forbidden"` |
| 404    | Organization does not exist | `"organization not found"` |
| 404    | `user_id` does not match any existing user (foreign key violation) | `"user not found"` |
| 409    | User is already a member of the organization | `"user is already a member of the organization"` |
| 422    | `user_id` is 0 or negative | Validation failed: `resource: "OrgMember"`, `field: "user_id"`, `code: "invalid"` |
| 422    | `role` is not `"owner"` or `"member"` | Validation failed: `resource: "OrgMember"`, `field: "role"`, `code: "invalid"` |

**Example**:
```bash
curl -X POST https://codeplane.example/api/orgs/acme/members \
  -H "Content-Type: application/json" \
  -H "Authorization: token cpat_xxxx" \
  -d '{"user_id": 42, "role": "member"}'
# 201 Created (empty body)
```

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async addOrgMember(
  actor: User,
  orgName: string,
  targetUserID: number,
  role: string,
): Promise<Result<void, APIError>>
```

The service: (1) validates authentication (returns 401 if `actor` is null), (2) resolves the org case-insensitively via `resolveOrg` (returns 404 if not found, 400 if empty), (3) verifies actor holds `owner` role via `requireOrgRole` (returns 403 if not), (4) validates `targetUserID` is > 0 (returns 422 if invalid), (5) normalizes and validates role is `"owner"` or `"member"` (returns 422 if invalid), (6) calls `addOrgMember` SQL wrapper to insert into `org_members`, (7) catches unique constraint violations (returns 409 if duplicate), (8) catches foreign key violations (returns 404 if user doesn't exist), (9) returns `Result.ok(undefined)` on success.

### CLI Command

```
codeplane org member add <org> <username> [--role <role>]
```

| Argument   | Type   | Required | Description |
|------------|--------|----------|-------------|
| `org`      | string | Yes      | Organization name |
| `username` | string | Yes      | Username of the user to add |

| Option     | Type   | Default    | Description |
|------------|--------|------------|-------------|
| `--role`   | string | `"member"` | Role to assign: `"owner"` or `"member"` |

**Note**: The CLI currently sends `username` in the request body. There is a known mismatch where the API route expects `user_id` (number) but the CLI sends `username` (string). This should be resolved by either updating the route to accept username-based lookup or updating the CLI to resolve the username to a user_id before calling the API.

**Output on success**: The CLI exits with code 0.

**Output on error**: The CLI exits with code 1 and prints the error message to stderr.

**Example**:
```
$ codeplane org member add acme alice --role member
# (exits 0 — member added)

$ codeplane org member add acme alice --role member
Error: user is already a member of the organization
# (exits 1)
```

**Alias**: The E2E test suite uses `codeplane org add-member <username> --org <org> --role <role>` as an alternative invocation form.

### Web UI Design

**Status**: `Gated` — organization member management UI is not yet fully implemented. When implemented:

- The "Add Member" action is accessible from the organization settings page under a "Members" tab, via an "Add Member" button.
- Clicking "Add Member" opens a modal or dropdown with a user search typeahead that searches all platform users.
- The typeahead displays: avatar, display name, and username for each candidate.
- Users who are already organization members are shown but grayed out with an "Already a member" label and are not selectable.
- A role selector (dropdown: "Owner" or "Member") appears alongside the search, defaulting to "Member".
- On submission, the POST request fires and the member list updates.
- On conflict (409), a toast notification reads "User is already a member of this organization."
- On validation failure (422 for role), a toast notification reads "Invalid role. Must be 'owner' or 'member'."
- On 403, a toast notification reads "Only organization owners can add members."
- **Navigation**: breadcrumb trail showing `Org Name > Settings > Members`.
- **Empty state**: If the organization has only one member (the creator), the members tab shows "You're the only member. Add members to collaborate." with the "Add Member" button prominently displayed.
- Only organization owners see the "Add Member" button. Regular members see the member list in read-only mode.

### TUI UI

**Status**: `Partial` — org member management screens are designed but not yet implemented. When implemented:

- From the organization detail screen, pressing `m` navigates to the members tab.
- Pressing `a` in the members tab opens a user search input.
- Arrow keys navigate candidates, Enter confirms the selection.
- A role prompt appears: `o` for Owner, `m` for Member. Defaults to Member on Enter.
- On success, the member list refreshes and a status line confirms "Added <username> to <org> as <role>."
- On error, the status line displays the error message.
- `Esc` cancels the add action and returns to the member list.

### Documentation

- **API reference**: `POST /api/orgs/:org/members` — request body schema (`user_id`, `role`), success response (201), all error codes with messages, example curl commands.
- **CLI reference**: `codeplane org member add` — arguments, options, example invocations, exit codes, common error scenarios.
- **Guide**: "Managing organization members" — include sections on adding members, assigning roles (owner vs. member), the relationship between org membership and team membership, and how to promote or demote members.
- **Concept page**: Reference the broader "Organizations, teams, and access control" concept page explaining how org membership is the prerequisite for team membership and repository access.

## Permissions & Security

### Authorization Roles

| Role | Can add org member? | Notes |
|------|---------------------|-------|
| Organization Owner | ✅ Yes | Full access to manage org membership |
| Organization Member | ❌ No | 403 Forbidden — members cannot modify org composition |
| Authenticated non-member | ❌ No | 403 Forbidden — user has no role in the org |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- An additional per-user write rate limit should be applied: no more than **60 add-member requests per minute per authenticated user**. This prevents automated scripts from rapidly adding hundreds of members and overwhelming downstream systems (webhook delivery, notification fanout, audit logging).
- The rate limit key should be scoped to `user_id + org_id` to avoid cross-org interference.
- Rate limit responses should return 429 Too Many Requests with a `Retry-After` header.

### Data Privacy

- The request body contains a `user_id`, which is an internal numeric identifier. While not publicly exposed in most UI surfaces, it is not considered sensitive PII.
- No PII is returned in the 201 success response (body is empty).
- Error messages reference only the `user_id` or generic resource names — they do not expose usernames, email addresses, or other profile data of the target user.
- The 404 response for invalid `user_id` (foreign key violation) could theoretically be used to enumerate valid user IDs. This is acceptable given that user IDs are sequential integers and usernames are publicly visible, but should be reviewed if user privacy requirements change.
- Audit logs recording the add action contain the actor user ID, target user ID, org ID, and assigned role. These are operational identifiers subject to the platform's data retention policies.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgMemberAdded` | A successful 201 response is returned after adding an org member | `org_name`, `org_id`, `target_user_id`, `assigned_role`, `actor_user_id`, `client` (`api`, `cli`, `web`, `tui`) |
| `OrgMemberAddFailed` | A 4xx or 5xx response is returned | `org_name_attempted`, `target_user_id_attempted`, `role_attempted`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `client` |
| `OrgMemberAddConflict` | A 409 Conflict response is returned (duplicate add) | `org_name`, `org_id`, `target_user_id`, `actor_user_id`, `client` |

### Funnel Metrics

- **Org member add rate**: Number of successful org member additions per day/week, segmented by organization size. A healthy add rate indicates active organization growth.
- **Org → team conversion**: Percentage of newly added org members who are subsequently added to at least one team within 7 days. Low conversion may indicate that owners are not structuring team-based access or the team management flow is not discoverable enough.
- **Add-then-remove churn**: Percentage of org member additions that are reversed (member removed) within 24 hours. High churn may indicate UX confusion, accidental additions, or onboarding friction.
- **Role distribution**: Breakdown of assigned roles (`owner` vs `member`) at add time. A very high percentage of `owner` assignments may indicate misunderstanding of the permission model.
- **Client distribution**: Breakdown of successful adds by client surface (API, CLI, web, TUI). Indicates which surfaces are driving organization management.
- **Error-to-success ratio**: Ratio of failed add attempts to successful adds. A high ratio may indicate UX issues (e.g., difficulty finding correct user IDs) or API misuse by integrations.

### Success Indicators

- Org member add API latency p50 < 30ms, p99 < 300ms (single INSERT with constraint checks).
- Error rate (5xx only) < 0.1% of requests.
- At least 60% of organizations with >1 repository have >1 member within 30 days of creation.
- Org → team conversion rate > 40% within 7 days (indicates healthy adoption of the team model).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Org member add request received | `debug` | `org_name`, `target_user_id`, `role`, `actor_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Actor not org owner (403) | `info` | `org_name`, `actor_user_id`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `request_id` |
| Invalid user_id (422) | `info` | `org_name`, `target_user_id`, `request_id` |
| Invalid role (422) | `info` | `org_name`, `role_attempted`, `request_id` |
| User not found (404 — foreign key violation) | `info` | `org_name`, `target_user_id`, `request_id` |
| User is already an org member (409) | `info` | `org_name`, `target_user_id`, `actor_user_id`, `request_id` |
| Organization member added successfully | `info` | `org_name`, `org_id`, `target_user_id`, `assigned_role`, `actor_user_id`, `request_id` |
| Unexpected error during org member add | `error` | `org_name`, `target_user_id`, `actor_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_member_add_requests_total` | counter | `status_code`, `org_name` | Total org member add requests |
| `codeplane_org_member_add_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_member_add_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `conflict`, `validation`, `internal`) | Error breakdown by type |
| `codeplane_org_members_total` | gauge | `org_name`, `role` | Current count of members per org per role (updated on add/remove) |

### Alerts

#### Alert: `OrgMemberAddHighErrorRate`
- **Condition**: `rate(codeplane_org_member_add_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries related to org member add (filter by `org_member_add` context).
  2. Verify database connectivity — run a basic SELECT against the `org_members` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label on the counter).
  4. Verify that the `org_members` table exists and has its expected indexes (`organization_id`, `user_id` unique constraint).
  5. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.addOrgMember` method.
  6. Inspect the INSERT query plan — verify the unique constraint index is healthy.
  7. Check for lock contention or deadlocks in `pg_locks` involving the `org_members` table.
  8. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgMemberAddHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_member_add_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific organization (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the `addOrgMember` INSERT query to verify indexes are being used.
  3. Check database connection pool utilization — pool exhaustion affects all endpoints.
  4. Verify no full table scans on `org_members` or `organizations` tables via `pg_stat_user_tables`.
  5. Check for index bloat on the `org_members` unique constraint.
  6. If latency is concentrated during specific time windows, check for concurrent batch operations.
  7. Review slow query logs for queries touching `org_members`.

#### Alert: `OrgMemberAddConflictSpike`
- **Condition**: `rate(codeplane_org_member_add_errors_total{error_type="conflict"}[5m]) > 5 * avg_over_time(rate(codeplane_org_member_add_errors_total{error_type="conflict"}[5m])[1h:5m])`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike is from a single source (user/IP) or distributed.
  2. High conflict rates usually indicate an automation script retrying additions without checking current membership.
  3. If concentrated on a single user, contact them to suggest checking membership before adding via the list endpoint.
  4. No immediate action required unless it causes latency or resource impact.

#### Alert: `OrgMemberAddValidationSpike`
- **Condition**: `rate(codeplane_org_member_add_errors_total{error_type="validation"}[10m]) / rate(codeplane_org_member_add_requests_total[10m]) > 0.4`
- **Severity**: Info
- **Runbook**:
  1. A high validation failure rate (422) means callers are frequently sending invalid `user_id` or `role` values.
  2. Check if this is concentrated on a specific client surface (web, CLI, API).
  3. If it's the CLI, the known `username` vs `user_id` mismatch may be the cause — prioritize fixing the CLI to resolve usernames to user IDs before calling the API.
  4. If it's the API, review integrations or scripts that may be sending malformed payloads.
  5. Consider improving error messages to include which roles are valid.
  6. No immediate operational action required.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Query timeout on INSERT | 500 Internal Server Error (`"failed to add organization member"`) | Check for missing indexes on `org_members(organization_id, user_id)` |
| Unique constraint violation | 409 Conflict (`"user is already a member of the organization"`) | Expected behavior; client should handle gracefully |
| Foreign key violation (user doesn't exist) | 404 Not Found (`"user not found"`) | Expected behavior; client should verify user exists first |
| Foreign key violation (org deleted during request) | 500 Internal Server Error | Rare race condition; retry will return 404 for org |
| Request body is not valid JSON | 400 Bad Request (middleware level) | Client must send valid JSON with Content-Type header |
| Request body is empty | JSON parse error or `user_id` defaults to 0, returning 422 | Expected behavior |
| Actor's org owner role revoked during request | 403 on retry | Race condition; actor lost permission between requests |
| Extremely large request body (>1MB) | 413 Payload Too Large (middleware/web server level) | Expected behavior |

## Verification

### API Integration Tests

- **`test: returns 201 when org owner adds a valid user with role "member"`** — Create org, create a second user, call `POST /api/orgs/:org/members` with `{ user_id: <id>, role: "member" }` as org owner, assert 201 and empty body.
- **`test: returns 201 when org owner adds a valid user with role "owner"`** — Create org, create a second user, call `POST /api/orgs/:org/members` with `{ user_id: <id>, role: "owner" }`, assert 201.
- **`test: added member appears in org member list`** — Add member, call `GET /api/orgs/:org/members`, assert the added user appears with correct `username`, `display_name`, `avatar_url`, and `role`.
- **`test: added member has the correct role in the member list`** — Add member with role `"member"`, list members, assert role is `"member"`. Repeat with `"owner"`.
- **`test: returns 401 for unauthenticated request`** — Call endpoint with no session/token, assert 401.
- **`test: returns 403 when actor is org member but not owner`** — Create org, add a second user as org `member`, authenticate as that member, attempt to add another user, assert 403.
- **`test: returns 403 when actor is authenticated but not an org member`** — Authenticate as a user who is not in the org, attempt to add a member, assert 403.
- **`test: returns 404 for nonexistent organization`** — Call `POST /api/orgs/nonexistent-org-xyz/members` with valid body, assert 404 with message `"organization not found"`.
- **`test: returns 404 when user_id does not match any user`** — Create org, call with `{ user_id: 999999, role: "member" }`, assert 404 with message `"user not found"`.
- **`test: returns 409 when user is already an org member`** — Add user, attempt to add same user again, assert 409 with message `"user is already a member of the organization"`.
- **`test: returns 422 when user_id is 0`** — Call with `{ user_id: 0, role: "member" }`, assert 422 with validation error on field `"user_id"`.
- **`test: returns 422 when user_id is negative`** — Call with `{ user_id: -5, role: "member" }`, assert 422.
- **`test: returns 422 when role is empty string`** — Call with `{ user_id: <valid>, role: "" }`, assert 422 with validation error on field `"role"`.
- **`test: returns 422 when role is invalid value`** — Call with `{ user_id: <valid>, role: "admin" }`, assert 422.
- **`test: returns 422 when role is "read"`** — Call with `{ user_id: <valid>, role: "read" }`, assert 422 (only "owner" and "member" are valid org roles).
- **`test: returns 400 for empty org name`** — Call `POST /api/orgs/%20/members` with valid body, assert 400 with message `"organization name is required"`.
- **`test: response body is empty on success`** — Add member, assert response body is null/empty and status is 201.

### Role Normalization Tests

- **`test: role "Owner" (capitalized) is accepted and stored as "owner"`** — Call with `{ role: "Owner" }`, assert 201, list members, assert role is `"owner"`.
- **`test: role "MEMBER" (uppercase) is accepted and stored as "member"`** — Call with `{ role: "MEMBER" }`, assert 201.
- **`test: role " member " (with whitespace) is accepted and stored as "member"`** — Call with `{ role: " member " }`, assert 201.

### Case-Insensitivity Tests

- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", call `POST /api/orgs/myorg/members` with valid body, assert 201.
- **`test: org name with mixed case resolves correctly`** — Create org "TestOrg", call `POST /api/orgs/TESTORG/members`, assert 201.

### Edge Case Tests

- **`test: org name at maximum valid length (255 chars) returns 404`** — Call with 255-char org name, assert 404 (no org matches).
- **`test: org name exceeding 255 chars returns 404`** — Call with 256-char org name, assert 404.
- **`test: user_id at maximum valid integer value is accepted if user exists`** — Create user, call with that user's actual large ID, assert 201 or 404 depending on existence.
- **`test: adding multiple different users to the same org succeeds`** — Create three users, add each to org, assert 201 for each, verify all three appear in member list.
- **`test: adding a user as owner then attempting to add same user as member returns 409`** — Add user as owner, attempt to re-add as member, assert 409.
- **`test: concurrent add of the same user returns 201 then 409`** — Fire two concurrent POST requests for the same user/org, assert one returns 201 and the other returns 409.
- **`test: request with extraneous body fields is accepted`** — Send POST with `{ user_id: <valid>, role: "member", extra: "ignored" }`, assert 201.
- **`test: request with no body returns error`** — Send POST with no body and no Content-Type, expect a JSON parse error or 422 for invalid user_id.
- **`test: org owner adding themselves returns 409`** — The creator is already a member, so this should return 409 Conflict.
- **`test: URL-encoded special characters in org name are decoded`** — Call with `POST /api/orgs/my%2Dorg/members` (where org is "my-org"), assert correct resolution.
- **`test: adding a member does not modify the organization itself`** — Get org details before and after adding a member, assert `name`, `description`, `visibility`, and `updated_at` are unchanged.

### Prerequisite Relationship Tests

- **`test: newly added org member can be added to a team`** — Add user as org member, then add to a team via `PUT /api/orgs/:org/teams/:team/members/:username`, assert 204.
- **`test: user who is not an org member cannot be added to a team`** — Attempt to add a non-org-member to a team, assert 422.

### CLI E2E Tests

- **`test: codeplane org member add <org> <username> succeeds`** — Create org, run `codeplane org member add <org> <username> --role member`, assert exit code 0.
- **`test: codeplane org member add with --role owner succeeds`** — Run `codeplane org member add <org> <username> --role owner`, assert exit code 0.
- **`test: codeplane org member add with nonexistent org exits with error`** — Run `org member add nonexistent-org alice`, assert non-zero exit code and stderr contains error message.
- **`test: codeplane org member add with nonexistent username exits with error`** — Run with valid org but nonexistent username, assert non-zero exit code and stderr contains error.
- **`test: codeplane org member add for already-added user exits with error`** — Add user, attempt to add again via CLI, assert non-zero exit code and stderr contains "already a member".
- **`test: codeplane org member add with invalid role exits with error`** — Run with `--role admin`, assert non-zero exit code and stderr contains error.
- **`test: codeplane org member add without required args exits with error`** — Run `org member add` without org or username args, assert non-zero exit code and stderr indicates missing arguments.
- **`test: added member appears in codeplane org member list output`** — Add member via CLI, run `codeplane org member list <org>`, parse output, assert the added user's username appears in the list.
- **`test: full lifecycle: add then remove org member via CLI`** — Add member, verify in list, remove member, verify not in list.
- **`test: codeplane org add-member alias works`** — Run `codeplane org add-member <username> --org <org> --role member`, assert exit code 0.

### Playwright Web UI E2E Tests (when org member management UI is implemented)

- **`test: add member button is visible to org owners on org members tab`** — Authenticate as org owner, navigate to `/:org/-/settings/members`, assert "Add Member" button is visible.
- **`test: add member button is NOT visible to org members`** — Authenticate as org member (not owner), navigate to org members tab, assert "Add Member" button is not visible.
- **`test: member search typeahead shows platform users`** — Click "Add Member", type a partial username, assert matching users appear in the dropdown.
- **`test: member search typeahead grays out existing org members`** — Add alice to org, open typeahead, assert alice appears grayed out / disabled.
- **`test: selecting a user and role adds them and updates the list`** — Click "Add Member", select a user from typeahead, select role "Member", submit, assert the member list now includes the new user with role "Member".
- **`test: adding a duplicate member shows toast error`** — Attempt to add a member who is already in the org, assert a toast with "already a member" appears.
- **`test: non-owner cannot add member even if UI is accessible`** — Force-navigate as a non-owner, verify no add-member interaction is possible.
- **`test: role selector defaults to "Member"`** — Open add member flow, assert role dropdown defaults to "Member" not "Owner".

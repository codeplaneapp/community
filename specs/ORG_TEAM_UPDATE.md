# ORG_TEAM_UPDATE

Specification for ORG_TEAM_UPDATE.

## High-Level User POV

When an organization owner needs to adjust a team's configuration — whether renaming a team to better reflect its current purpose, updating its description as responsibilities evolve, or changing its default permission level as the team's access requirements shift — they use the team update feature.

Teams are the primary mechanism for structuring access and collaboration within a Codeplane organization. Over the life of an organization, teams naturally need to change. A "frontend" team might rebrand to "product-engineering" after a reorganization. A team created with "read" permissions might need to be promoted to "write" as the team takes on more active contribution responsibilities. A team's description might go stale after months of use. The team update feature makes all of these corrections straightforward without requiring the team to be deleted and recreated (which would disrupt existing member assignments and repository associations).

An organization owner navigates to a team they want to update — from the CLI, the API, or (when the web UI and TUI surfaces are fully built) from the graphical clients — and edits one or more of the team's properties: its name, description, or permission level. The update is partial by design: the owner only needs to supply the fields they want to change. Unchanged fields retain their existing values. The updated team is returned immediately, reflecting the new state.

This feature is valuable because it enables organizational agility. Renaming, re-describing, and re-permissioning teams are common administrative actions that should be fast, low-risk, and non-destructive. By supporting partial updates, Codeplane avoids forcing the user to re-supply all team properties just to change one, which reduces the risk of accidental overwrites and makes scripted administration simpler.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a 401 Unauthorized response.
- **Organization owner required**: Only users who hold the `owner` role in the organization may update a team. Non-owners (including regular `member` role users) must receive a 403 Forbidden response.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return a 404 Not Found response.
- **Team must exist**: If the team name does not resolve to a valid team within the organization, the endpoint must return a 404 Not Found response.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive team lookup**: The team name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Partial update semantics**: Each of the three updatable fields (`name`, `description`, `permission`) is optional. If a field is omitted or sent as an empty string, the existing value is preserved.
- **Name validation — maximum length**: The `name` field must not exceed 255 characters. If it does, the endpoint must return a 422 response with `{ "message": "validation failed", "resource": "Team", "field": "name", "code": "invalid" }`.
- **Name validation — trimming**: The `name` field must be trimmed of leading and trailing whitespace before validation and storage.
- **Name uniqueness within org**: If the updated name matches another existing team's `lower_name` within the same organization, the endpoint must return a 409 Conflict response with message `"team already exists"`.
- **Name unchanged is safe**: Submitting the same name the team already has must succeed (not conflict with itself).
- **Permission validation**: The `permission` field must be one of `"read"`, `"write"`, or `"admin"`. Any other non-empty value must return a 422 response with `{ "message": "validation failed", "resource": "Team", "field": "permission", "code": "invalid" }`.
- **Permission trimming**: The `permission` field must be trimmed of leading and trailing whitespace before validation.
- **Description preservation**: An empty-string description preserves the existing description. A non-empty description replaces it.
- **Response shape**: The response must be a 200 OK containing the full updated team object with fields: `id`, `organization_id`, `name`, `lower_name`, `description`, `permission`, `created_at`, `updated_at`.
- **updated_at advancement**: The `updated_at` timestamp must advance to the current time on every successful update, even if no field values actually changed.
- **lower_name derivation**: The `lower_name` field must always be the lowercase form of the `name` field.
- **Timestamps in ISO 8601**: `created_at` and `updated_at` must be ISO 8601 formatted strings.
- **created_at immutability**: The `created_at` timestamp must not change on update.
- **Empty request body**: A request with `{}` (no fields) must succeed and return the team unchanged (with an advanced `updated_at`).
- **No data leakage**: The response must not include any fields beyond the defined team shape.
- **CLI consistency**: The CLI `org team edit <org> <team>` command must send a PATCH request and output the same JSON object returned by the API.
- **Empty org path parameter**: A request with an empty or whitespace-only `:org` path parameter must return 400 Bad Request with message `"organization name is required"`.
- **Empty team path parameter**: A request with an empty or whitespace-only `:team` path parameter must return 400 Bad Request with message `"team name is required"`.
- **JSON content-type enforcement**: Non-JSON request bodies on this mutation endpoint must be rejected by the platform middleware.

### Definition of Done

- The `PATCH /api/orgs/:org/teams/:team` route correctly updates teams with partial semantics.
- Authorization is restricted to organization owners.
- Field validation for name length, name uniqueness, and permission values is enforced.
- CLI `org team edit` command works end-to-end.
- All verification tests pass.
- Observability instrumentation is in place (logging, metrics, telemetry events).
- Documentation is updated for the API reference, CLI reference, and team management guide.

## Design

### API Shape

**Endpoint**: `PATCH /api/orgs/:org/teams/:team`

**Path Parameters**:
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive) |
| `team`    | string | Yes      | Team name (case-insensitive) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`, `Content-Type: application/json`

**Request Body** (all fields optional):
```json
{
  "name": "new-team-name",
  "description": "Updated description of the team",
  "permission": "write"
}
```

| Field | Type | Required | Constraints | Default Behavior |
|-------|------|----------|-------------|------------------|
| `name` | string | No | Max 255 chars after trimming; must be unique within org (case-insensitive) | Existing name preserved if omitted or empty |
| `description` | string | No | No explicit length limit | Existing description preserved if empty string |
| `permission` | string | No | Must be `"read"`, `"write"`, or `"admin"` | Existing permission preserved if omitted or empty |

**Response** (200 OK):
```json
{
  "id": 17,
  "organization_id": 42,
  "name": "new-team-name",
  "lower_name": "new-team-name",
  "description": "Updated description of the team",
  "permission": "write",
  "created_at": "2026-01-15T10:30:00.000Z",
  "updated_at": "2026-03-21T14:22:00.000Z"
}
```

**Error Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| 400 | Empty or whitespace-only `:org` path parameter | `{ "message": "organization name is required" }` |
| 400 | Empty or whitespace-only `:team` path parameter | `{ "message": "team name is required" }` |
| 401 | Unauthenticated request | `{ "message": "authentication required" }` |
| 403 | User is not an org owner | `{ "message": "insufficient organization permissions" }` |
| 404 | Organization not found | `{ "message": "organization not found" }` |
| 404 | Team not found | `{ "message": "team not found" }` |
| 409 | Name conflicts with existing team | `{ "message": "team already exists" }` |
| 422 | Name exceeds 255 characters | `{ "message": "validation failed", "resource": "Team", "field": "name", "code": "invalid" }` |
| 422 | Permission not read/write/admin | `{ "message": "validation failed", "resource": "Team", "field": "permission", "code": "invalid" }` |
| 500 | Unexpected internal failure | `{ "message": "failed to update team" }` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async updateTeam(
  actor: User,
  orgName: string,
  teamName: string,
  req: UpdateTeamRequest,
): Promise<Result<Team, APIError>>
```

Where `UpdateTeamRequest` is:
```typescript
interface UpdateTeamRequest {
  name: string;        // Empty string → preserve existing
  description: string; // Empty string → preserve existing
  permission: string;  // Empty string → preserve existing
}
```

The service: (1) validates authentication, (2) resolves the org case-insensitively, (3) verifies actor holds `owner` role, (4) resolves the team case-insensitively, (5) applies merge semantics (empty fields fall back to existing values), (6) validates name length ≤ 255 and permission ∈ {read, write, admin}, (7) executes the SQL update with derived `lower_name`, (8) catches unique violations as 409 conflict, (9) returns the mapped `Team` object.

### CLI Command

```
codeplane org team edit <org> <team> [--name <new_name>] [--description <new_description>] [--permission <read|write|admin>]
```

| Argument/Option | Type   | Required | Description |
|-----------------|--------|----------|-------------|
| `<org>` | positional string | Yes | Organization name |
| `<team>` | positional string | Yes | Team slug (current name) |
| `--name` | string | No | New team name |
| `--description` | string | No | New description |
| `--permission` | enum | No | One of: `read`, `write`, `admin` |

**Output**: JSON object of the updated team, identical to the API response body. Supports `--json` field filtering.

**Exit codes**: 0 = success, 1 = API error.

**Examples**:
```bash
# Rename a team
codeplane org team edit acme backend --name "platform-engineering"

# Change permission level
codeplane org team edit acme backend --permission admin

# Update description only
codeplane org team edit acme backend --description "Handles platform infrastructure"

# Update all fields at once
codeplane org team edit acme backend --name "platform" --description "Platform team" --permission write
```

### Web UI Design

**Status**: `Gated` — referenced in feature inventory as `ORG_TEAM_MANAGEMENT_UI` but not yet implemented.

When implemented, the team edit surface should:

- Be accessible from the team detail page within org settings, via an "Edit" button visible only to org owners.
- Present an inline edit form or modal with three fields:
  - **Name**: text input, pre-populated with the current team name. Max 255 characters. Client-side character counter.
  - **Description**: textarea, pre-populated with the current description. Optional.
  - **Permission**: select/dropdown with options "Read", "Write", "Admin", pre-selected with the current level. Each option should include a brief tooltip explaining the access level.
- Validation:
  - Name field: show inline error if > 255 characters. Show inline error on submit if name conflicts with another team.
  - Permission field: constrained by the select control.
- Submit button labeled "Save changes" (disabled when form is pristine/unchanged).
- On success: inline success toast, form fields update to reflect new values, page title/breadcrumb updates if name changed.
- On error: inline error banner with the server error message.
- Cancel button or Esc to discard changes.
- Non-owners should not see the Edit button or the edit form.

### TUI UI

**Status**: `Partial` — no team edit screen exists. When implemented:

- Team detail screen includes an "Edit" action accessible via keybinding (e.g., `e`).
- Opens an inline form with editable fields for name, description, and permission (tab-selectable enum for permission).
- Enter to save, Esc to cancel.
- Success/error feedback displayed as a status line message.
- Only available to org owners; the `e` keybinding is hidden for non-owners.

### Documentation

- **API reference**: `PATCH /api/orgs/:org/teams/:team` — path parameters, request body, response shape, error codes, and examples.
- **CLI reference**: `codeplane org team edit` — positional arguments, options, example invocations, and exit codes.
- **Guide**: "Managing teams in your organization" — walkthrough of updating team name, description, and permission level, with explanation of partial update semantics and the effect of permission changes on team repository access.
- **Concept page update**: Ensure the teams concept page explains that permission changes take effect immediately for all team members across all team-assigned repositories.

## Permissions & Security

### Authorization Roles

| Role | Can update team? | Notes |
|------|-----------------|-------|
| Organization Owner | ✅ Yes | Full control over team configuration |
| Organization Member | ❌ No | 403 Forbidden — members cannot modify team settings |
| Authenticated non-member | ❌ No | 403 Forbidden |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required for team updates, as this is a low-frequency administrative operation.
- If abuse is detected (e.g., rapid rename cycling), the platform rate limiter will throttle the caller.

### Data Privacy

- The request and response contain team names, descriptions, and permission levels. None of these fields are PII.
- The `organization_id` field is an internal numeric ID. This is acceptable as it carries no PII, but should be reviewed if internal ID opacity becomes a product concern.
- Audit logging of who updated which team and when is important for compliance — the actor's `user_id` should be recorded in logs but not exposed to non-admin consumers.
- Team names are visible to all org members, so renaming a team is not a secret operation. This is by design.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamUpdated` | A successful 200 response is returned | `org_name`, `team_name` (original), `new_team_name` (after update), `actor_user_id`, `fields_changed` (array of field names that actually changed, e.g. `["name", "permission"]`), `old_permission`, `new_permission`, `client` (`api`, `cli`, `web`, `tui`, `vscode`, `nvim`) |
| `OrgTeamUpdateFailed` | A 4xx or 5xx response is returned | `org_name`, `team_name`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `client` |

### Funnel Metrics

- **Team update frequency**: How often teams are updated per organization per month. Low frequency is expected; high frequency may indicate UX confusion or misconfiguration patterns.
- **Field change distribution**: Breakdown of which fields are most frequently updated (name vs. description vs. permission). Informs which fields deserve the most prominent UI placement.
- **Permission escalation rate**: Frequency of permission level increases (read→write, write→admin). Important for security auditing.
- **Update-after-create latency**: Time between team creation and first update. Short latency may indicate that the create flow doesn't surface enough fields or defaults poorly.
- **Error rate by type**: Breakdown of 409 conflicts, 422 validations, and 403 forbidden errors. High 409 rate suggests naming collisions; high 403 rate suggests role confusion.
- **Client distribution**: Breakdown of team update events by client surface (API, CLI, web, TUI).

### Success Indicators

- Team update API latency p50 < 50ms, p99 < 500ms.
- Error rate < 0.5% of requests (excluding 401/403 which are expected for unauthorized callers).
- At least 50% of organizations with >3 teams have used team update within 90 days of org creation.
- Zero data integrity incidents (e.g., teams with orphaned `lower_name` values).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Team update request received | `debug` | `org_name`, `team_name`, `actor_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Team not found | `info` | `org_name`, `team_name`, `request_id` |
| Actor not org owner (403) | `info` | `org_name`, `actor_user_id`, `actor_role`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `team_name`, `request_id` |
| Name validation failed (too long) | `info` | `org_name`, `team_name`, `name_length`, `request_id` |
| Permission validation failed | `info` | `org_name`, `team_name`, `invalid_permission_value`, `request_id` |
| Name conflict (409) | `info` | `org_name`, `team_name`, `conflicting_name`, `request_id` |
| Team successfully updated | `info` | `org_name`, `team_name`, `new_team_name`, `fields_changed`, `actor_user_id`, `request_id` |
| Permission level changed | `info` | `org_name`, `team_name`, `old_permission`, `new_permission`, `actor_user_id`, `request_id` |
| Unexpected error in team update | `error` | `org_name`, `team_name`, `actor_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_update_requests_total` | counter | `status_code`, `org_name` | Total team update requests |
| `codeplane_org_team_update_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_org_team_update_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `conflict`, `validation`, `internal`) | Error breakdown |
| `codeplane_org_team_permission_changes_total` | counter | `org_name`, `old_permission`, `new_permission` | Permission level transitions |

### Alerts

#### Alert: `OrgTeamUpdateHighErrorRate`
- **Condition**: `rate(codeplane_org_team_update_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context `org_team_update`.
  2. Verify database connectivity — run a simple query against the `teams` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label).
  4. Check for recent deployments that may have introduced a regression in the update path.
  5. Examine `pg_stat_activity` for long-running or blocked queries against the `teams` table.
  6. Check for lock contention in `pg_locks` that could cause update failures.
  7. If the error is a unique constraint violation not caught by application logic, check the `isUniqueViolation` detection logic.
  8. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgTeamUpdateHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_team_update_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to specific organizations (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on the team update query to check for missing indexes or full table scans.
  3. Check database connection pool utilization — connection starvation can cause latency spikes.
  4. Verify the `teams` table index on `(organization_id, lower_name)` exists and is not bloated.
  5. Check for lock contention — another process holding a row-level lock on the team being updated.
  6. Review recent schema migrations that may have affected the `teams` table.

#### Alert: `OrgTeamUpdateHighConflictRate`
- **Condition**: `rate(codeplane_org_team_update_errors_total{error_type="conflict"}[1h]) > 10`
- **Severity**: Info
- **Runbook**:
  1. This alert fires when many team rename attempts conflict with existing team names.
  2. Check if a specific organization is experiencing unusually high conflict rates.
  3. Investigate whether an automated script is attempting bulk renames without checking for name availability.
  4. Review whether the UI/CLI provides adequate feedback about existing team names before submission.
  5. No immediate remediation required — this is an informational alert. Escalate to product if the pattern persists.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error with `"failed to update team"` | Automatic reconnection via pool; alert fires |
| Query timeout | 500 Internal Server Error | Check for missing index on `teams(organization_id, lower_name)` |
| Concurrent rename to same name | One succeeds, one returns 409 Conflict | Application-level retry with a different name |
| Extremely long name (>255 chars) | 422 Validation Failed | Client-side validation should prevent this |
| Invalid JSON body | 400 Bad Request (platform middleware) | Client must send valid JSON |
| Team deleted between resolve and update | 500 Internal Server Error (update returns null) | Retry; if persistent, investigate race conditions |
| Org deleted between resolve and team update | 500 Internal Server Error or constraint violation | Rare; acceptable eventual consistency |
| Non-UTF8 characters in name | Depends on DB encoding; may succeed or fail at DB layer | Ensure name field is validated for valid UTF-8 |

## Verification

### API Integration Tests

- **`test: returns 200 with updated team when name is changed`** — Create org and team "alpha", PATCH with `{ "name": "beta" }`, assert 200 with `name: "beta"` and `lower_name: "beta"`.
- **`test: returns 200 with updated team when description is changed`** — Create team, PATCH with `{ "description": "new desc" }`, assert 200 with updated description.
- **`test: returns 200 with updated team when permission is changed`** — Create team with `"read"`, PATCH with `{ "permission": "admin" }`, assert 200 with `permission: "admin"`.
- **`test: supports updating all three fields at once`** — PATCH with name + description + permission, assert all three changed in response.
- **`test: empty body preserves all existing values`** — Create team, PATCH with `{}`, assert 200 with original name, description, and permission unchanged.
- **`test: omitted fields preserve existing values`** — Create team, PATCH with only `{ "name": "new-name" }`, assert description and permission unchanged.
- **`test: empty string name preserves existing name`** — Create team "alpha", PATCH with `{ "name": "" }`, assert name remains "alpha".
- **`test: empty string description preserves existing description`** — Create team with description "hello", PATCH with `{ "description": "" }`, assert description remains "hello".
- **`test: empty string permission preserves existing permission`** — Create team with "write", PATCH with `{ "permission": "" }`, assert permission remains "write".
- **`test: name is trimmed of whitespace`** — PATCH with `{ "name": "  trimmed  " }`, assert `name: "trimmed"` and `lower_name: "trimmed"`.
- **`test: permission is trimmed of whitespace`** — PATCH with `{ "permission": "  write  " }`, assert `permission: "write"`.
- **`test: lower_name is derived from name`** — PATCH with `{ "name": "MyTeam" }`, assert `lower_name: "myteam"`.
- **`test: updated_at advances on update`** — Record team's `updated_at`, wait briefly, PATCH, assert new `updated_at` is later.
- **`test: created_at does not change on update`** — Record team's `created_at`, PATCH, assert `created_at` is unchanged.
- **`test: response has correct shape`** — PATCH team, assert response has exactly: `id` (number), `organization_id` (number), `name` (string), `lower_name` (string), `description` (string), `permission` (string), `created_at` (ISO 8601 string), `updated_at` (ISO 8601 string).
- **`test: renaming to same name succeeds (no self-conflict)`** — Create team "alpha", PATCH with `{ "name": "alpha" }`, assert 200.
- **`test: renaming to same name different case succeeds`** — Create team "alpha", PATCH with `{ "name": "Alpha" }`, assert 200 with `name: "Alpha"` and `lower_name: "alpha"`.

### Name Validation Tests

- **`test: name with exactly 255 characters succeeds`** — PATCH with a 255-character name, assert 200.
- **`test: name with 256 characters returns 422`** — PATCH with a 256-character name, assert 422 with `resource: "Team"`, `field: "name"`, `code: "invalid"`.
- **`test: name with 1 character succeeds`** — PATCH with `{ "name": "a" }`, assert 200.
- **`test: name with only whitespace preserves existing name`** — PATCH with `{ "name": "   " }`, after trimming becomes empty, assert existing name preserved.

### Permission Validation Tests

- **`test: permission "read" is accepted`** — PATCH with `{ "permission": "read" }`, assert 200 with `permission: "read"`.
- **`test: permission "write" is accepted`** — PATCH with `{ "permission": "write" }`, assert 200 with `permission: "write"`.
- **`test: permission "admin" is accepted`** — PATCH with `{ "permission": "admin" }`, assert 200 with `permission: "admin"`.
- **`test: permission "owner" returns 422`** — PATCH with `{ "permission": "owner" }`, assert 422.
- **`test: permission "ReadOnly" returns 422`** — PATCH with `{ "permission": "ReadOnly" }` (wrong case), assert 422.
- **`test: permission "WRITE" returns 422`** — PATCH with `{ "permission": "WRITE" }` (uppercase), assert 422.
- **`test: permission with random string returns 422`** — PATCH with `{ "permission": "foobar" }`, assert 422.

### Conflict and Uniqueness Tests

- **`test: renaming to existing team name returns 409`** — Create teams "alpha" and "beta", PATCH "alpha" to name "beta", assert 409 with `"team already exists"`.
- **`test: renaming to existing team name (case-insensitive) returns 409`** — Create teams "alpha" and "beta", PATCH "alpha" to name "Beta", assert 409.
- **`test: renaming team A to former name of team B after B was renamed succeeds`** — Create "alpha" and "beta", rename "beta" to "gamma", then rename "alpha" to "beta", assert 200.

### Auth and Authorization Tests

- **`test: returns 401 for unauthenticated request`** — PATCH without session/token, assert 401.
- **`test: returns 403 for org member (non-owner)`** — Create org, add user as member, authenticate as member, PATCH team, assert 403.
- **`test: returns 403 for authenticated non-member`** — Create org, authenticate as user not in org, PATCH team, assert 403.
- **`test: org owner can update team`** — Create org (user becomes owner), create team, PATCH team, assert 200.

### Not Found Tests

- **`test: returns 404 for nonexistent organization`** — PATCH team in org `"nonexistent-org-12345"`, assert 404.
- **`test: returns 404 for nonexistent team`** — PATCH team `"nonexistent-team-12345"` in valid org, assert 404.
- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", create team, PATCH using "myorg" (lowercase), assert 200.
- **`test: team name is resolved case-insensitively`** — Create org, create team "MyTeam", PATCH using "myteam" (lowercase), assert 200.

### Path Parameter Tests

- **`test: empty org name returns 400`** — PATCH `/api/orgs/%20/teams/myteam`, assert 400 with `"organization name is required"`.
- **`test: empty team name returns 400`** — PATCH `/api/orgs/myorg/teams/%20`, assert 400 with `"team name is required"`.

### CLI E2E Tests

- **`test: codeplane org team edit updates team name`** — Create org and team, run `org team edit <org> <team> --name "new-name"`, parse JSON output, assert `name: "new-name"`.
- **`test: codeplane org team edit updates team description`** — Run `org team edit <org> <team> --description "new desc"`, assert `description: "new desc"`.
- **`test: codeplane org team edit updates team permission`** — Run `org team edit <org> <team> --permission admin`, assert `permission: "admin"`.
- **`test: codeplane org team edit with no options succeeds (no-op)`** — Run `org team edit <org> <team>` with no optional flags, assert exit code 0 and team data returned unchanged (except updated_at).
- **`test: codeplane org team edit with nonexistent org exits with error`** — Run with nonexistent org, assert non-zero exit code.
- **`test: codeplane org team edit with nonexistent team exits with error`** — Run with nonexistent team, assert non-zero exit code.
- **`test: codeplane org team edit output matches API response`** — Update via CLI and via API, assert outputs are structurally identical.
- **`test: codeplane org team edit with invalid permission shows error`** — Run with `--permission invalid`, assert non-zero exit code (CLI validates enum locally via Zod).

### Playwright Web UI E2E Tests (when `ORG_TEAM_MANAGEMENT_UI` is implemented)

- **`test: team edit form is visible for org owner`** — Navigate to team detail page as owner, assert "Edit" button is visible, click it, assert form renders with pre-populated fields.
- **`test: team edit form is not visible for org member`** — Navigate to team detail page as member, assert "Edit" button is not present.
- **`test: editing team name updates the team`** — Open edit form, change name, submit, assert success toast and updated name displayed.
- **`test: editing team permission updates the team`** — Open edit form, change permission dropdown, submit, assert updated permission badge.
- **`test: saving without changes shows no error`** — Open edit form, click Save without changes, assert success or no-op behavior.
- **`test: name conflict shows inline error`** — Create two teams, try to rename one to the other's name, assert inline error message about team already existing.
- **`test: name exceeding 255 chars shows validation error`** — Type >255 chars into name field, assert inline character count warning or submit error.
- **`test: cancel button discards changes`** — Open edit form, make changes, click Cancel, assert original values are still displayed.

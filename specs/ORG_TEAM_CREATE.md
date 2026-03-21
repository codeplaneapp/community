# ORG_TEAM_CREATE

Specification for ORG_TEAM_CREATE.

## High-Level User POV

When an organization owner needs to subdivide their organization into working groups with distinct permission levels, they create teams. A team is a named group within an organization that can be assigned members and granted access to specific repositories at a defined permission level — read, write, or admin.

Creating a team is typically one of the first things an organization owner does after setting up an organization. The owner navigates to their organization's team management surface — whether through the web UI, CLI, TUI, or a direct API call — provides a team name, an optional description explaining the team's purpose, and selects a default permission level that governs what access members of this team will have to repositories assigned to it.

Once a team is created, it appears in the organization's team list and becomes available for member and repository assignment. The name chosen by the owner is preserved exactly as typed for display, but lookups are always case-insensitive, so "Backend" and "backend" refer to the same team. No two teams within the same organization can share a name (case-insensitively), preventing confusion.

The permission level chosen at creation time — read, write, or admin — determines the default access scope for team members on team-assigned repositories. The "read" level is the safest default and is applied automatically if the owner does not explicitly choose a permission level. This makes team creation a safe, low-friction operation.

Creating a team does not automatically add any members or repositories. Those are separate actions. A freshly created team is an empty container ready to be populated. This separation keeps the creation flow simple and allows automation scripts, editor integrations, and agent workflows to compose team setup from discrete steps.

The team creation experience is designed to be consistent across all Codeplane surfaces. Whether the owner uses the web form, types a CLI command, interacts with the TUI, or sends an API request, the validation rules, error messages, and resulting team state are identical. This consistency is essential for organizations that mix human and automated workflows.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a `401 Unauthorized` response and error message `"authentication required"`.
- **Organization owner role required**: Only users who hold the `owner` role in the organization may create teams. Organization members with `member` role must receive a `403 Forbidden` response. Authenticated users who are not organization members must also receive `403 Forbidden`.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return `404 Not Found` with message `"organization not found"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Name is required**: If the `name` field is missing, empty, or whitespace-only, the endpoint must return `422 Unprocessable Entity` with a validation error indicating `resource: "Team"`, `field: "name"`, `code: "missing_field"`.
- **Name maximum length**: Team names longer than 255 characters must be rejected with `422 Unprocessable Entity` and a validation error indicating `resource: "Team"`, `field: "name"`, `code: "invalid"`.
- **Name is trimmed**: Leading and trailing whitespace must be stripped from the team name before validation and storage.
- **Name uniqueness within org**: If a team with the same name (case-insensitively) already exists in the organization, the endpoint must return `409 Conflict` with message `"team already exists"`.
- **lower_name generation**: The stored `lower_name` must be the lowercase form of the trimmed `name`.
- **Permission values**: The `permission` field must be one of `"read"`, `"write"`, or `"admin"`. Any other non-empty value must be rejected with `422 Unprocessable Entity` and a validation error indicating `resource: "Team"`, `field: "permission"`, `code: "invalid"`.
- **Permission default**: If the `permission` field is missing, empty, or whitespace-only, it must default to `"read"`.
- **Description is optional**: The `description` field may be omitted, empty, or any string. If omitted, it defaults to an empty string.
- **Response status**: Successful creation must return `201 Created`.
- **Response shape**: The response body must be a single JSON object with exactly these fields: `id` (number), `organization_id` (number), `name` (string), `lower_name` (string), `description` (string), `permission` (string), `created_at` (string, ISO 8601), `updated_at` (string, ISO 8601).
- **Timestamps**: `created_at` and `updated_at` must be valid ISO 8601 formatted strings and should be equal at creation time.
- **Content-Type**: Response must include `Content-Type: application/json` header.
- **No side effects beyond team row**: Creating a team must not automatically add any members, repositories, or other associations. The team starts empty.
- **CLI consistency**: The CLI `org team create <org> <name>` command must output the same JSON object returned by the API.
- **Idempotency note**: The endpoint is not idempotent. Repeating the same request with the same name returns `409 Conflict` on the second call.
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return `400 Bad Request` with message `"organization name is required"`.
- **Content-Type enforcement**: Non-JSON request bodies on the POST endpoint must be rejected by the global JSON content-type enforcement middleware.
- **No data leakage**: The response must not include any fields beyond the defined team shape.

### Definition of Done

- The `POST /api/orgs/:org/teams` route creates a team and returns the correct JSON object for authenticated organization owners.
- Non-owners, non-members, and unauthenticated users are correctly rejected with appropriate status codes and error messages.
- Name uniqueness is enforced case-insensitively within the organization.
- Permission defaults to `"read"` when omitted.
- CLI `org team create` command works end-to-end and produces output structurally identical to the API response.
- Web UI team creation form (when `ORG_TEAM_MANAGEMENT_UI` is implemented) validates inputs client-side and displays server-side errors.
- All verification tests pass.
- Observability instrumentation is in place.
- Documentation for the API endpoint and CLI command is published.

## Design

### API Shape

**Endpoint**: `POST /api/orgs/:org/teams`

**Path Parameters**:
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`; `Content-Type: application/json`

**Request Body**:
```json
{
  "name": "backend",
  "description": "Backend engineering team",
  "permission": "write"
}
```

| Field        | Type   | Required | Default | Constraints |
|-------------|--------|----------|---------|-------------|
| `name`      | string | Yes      | —       | 1–255 characters after trimming; unique per org (case-insensitive) |
| `description` | string | No     | `""`    | Free text, no length limit enforced |
| `permission` | string | No      | `"read"` | One of: `"read"`, `"write"`, `"admin"` |

**Response** (201 Created):
```json
{
  "id": 17,
  "organization_id": 42,
  "name": "backend",
  "lower_name": "backend",
  "description": "Backend engineering team",
  "permission": "write",
  "created_at": "2026-03-21T10:30:00.000Z",
  "updated_at": "2026-03-21T10:30:00.000Z"
}
```

**Response Headers**: `Content-Type: application/json`

**Error Responses**:
| Status | Condition | Error Message |
|--------|----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 401    | No valid session cookie or PAT provided | `"authentication required"` |
| 403    | Authenticated user is not an org owner | `"forbidden"` |
| 404    | Organization does not exist | `"organization not found"` |
| 409    | Team name already exists in this org (case-insensitive) | `"team already exists"` |
| 422    | Name is missing or empty | Validation error: `resource: "Team"`, `field: "name"`, `code: "missing_field"` |
| 422    | Name exceeds 255 characters | Validation error: `resource: "Team"`, `field: "name"`, `code: "invalid"` |
| 422    | Permission is not a valid value | Validation error: `resource: "Team"`, `field: "permission"`, `code: "invalid"` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async createTeam(
  actor: User,
  orgName: string,
  req: CreateTeamRequest,
): Promise<Result<Team, APIError>>
```

Where `CreateTeamRequest` is:
```typescript
interface CreateTeamRequest {
  name: string;
  description: string;
  permission: string;
}
```

The service: (1) validates authentication (returns 401 if `actor` is null), (2) resolves the org case-insensitively via `resolveOrg` (returns 404 if not found, 400 if org name is empty), (3) verifies actor holds `owner` role via `requireOrgRole` (returns 403 if not), (4) trims and validates the name (returns 422 if empty, 422 if > 255 chars), (5) normalizes permission (defaults to `"read"`, returns 422 if invalid), (6) inserts the team row with `lower_name = name.toLowerCase()`, (7) catches unique violation and returns 409 if duplicate, (8) maps the database row to the `Team` shape via `mapTeam`, (9) returns `Result.ok(team)`.

### CLI Command

```
codeplane org team create <org> <name> [--description <desc>] [--permission read|write|admin]
```

| Argument/Option | Type   | Required | Default | Description |
|----------------|--------|----------|---------|-------------|
| `org`          | string | Yes      | —       | Organization name |
| `name`         | string | Yes      | —       | Team name |
| `--description` | string | No      | `""`    | Team description |
| `--permission`  | enum   | No      | `"read"` | Permission level: `read`, `write`, or `admin` |

**Output**: JSON object representing the created team, identical to the API response body. Supports `--json` field filtering.

**Exit codes**: 0 = success, 1 = API error (prints error message to stderr).

**Example**:
```
$ codeplane org team create my-org backend --description "Backend engineering team" --permission write
{
  "id": 17,
  "organization_id": 42,
  "name": "backend",
  "lower_name": "backend",
  "description": "Backend engineering team",
  "permission": "write",
  "created_at": "2026-03-21T10:30:00.000Z",
  "updated_at": "2026-03-21T10:30:00.000Z"
}
```

**Error example**:
```
$ codeplane org team create my-org backend
Error: team already exists (409)
```

### Web UI Design

**Status**: `Gated` — referenced in feature inventory as `ORG_TEAM_MANAGEMENT_UI` but not yet implemented. When implemented:

- Team creation is accessible via a "New Team" button on the organization team list page at `/:org/-/teams`.
- The creation form is presented either as a dedicated page at `/:org/-/teams/new` or as an inline dialog/modal.
- **Form fields**:
  - **Team name** (text input): required, placeholder text "e.g., backend, design, infra", validates on blur that the name is non-empty and ≤ 255 characters. Shows inline validation error for empty, too-long, or duplicate names.
  - **Description** (textarea): optional, placeholder text "Describe this team's purpose", no enforced length limit.
  - **Permission level** (select/radio group): options are "Read" (default, selected), "Write", and "Admin". Each option includes a brief helper description:
    - Read: "Members can view team repositories"
    - Write: "Members can push to team repositories"
    - Admin: "Members have full control over team repositories"
- **Submit button**: labeled "Create Team". Disabled while the form is submitting. Shows loading spinner during submission.
- **Success behavior**: On successful creation, redirect to the new team's detail page at `/:org/-/teams/:team` and display a toast notification "Team created successfully".
- **Error behavior**: On 409 Conflict, display inline error on the name field: "A team with this name already exists". On 422 validation errors, display field-specific inline errors. On 403, display an access denied message. On network errors, display a generic error toast.
- **Navigation**: breadcrumb trail showing `Org Name > Teams > New Team`.
- **Keyboard**: Enter submits the form from any field. Escape closes the dialog (if modal) or navigates back (if dedicated page).
- **Visibility**: Only organization owners should see the "New Team" button and be able to access the creation form. Members should not see the button.

### TUI UI

**Status**: `Partial` — no team creation screen exists. When implemented:

- Team creation accessible by pressing `c` on the team list screen.
- Inline form with fields:
  - Name (text input, required)
  - Description (text input, optional)
  - Permission (cycle selector: read → write → admin, defaults to read)
- Tab moves between fields. Enter submits. Escape cancels and returns to team list.
- On success: navigate to team detail view and show status message "Team created".
- On error: display error message inline below the form.

### Documentation

- **API reference**: `POST /api/orgs/:org/teams` — path parameters, request body schema with field constraints, response shape, all error codes with messages, example curl command for creating a team with each permission level.
- **CLI reference**: `codeplane org team create` — arguments, options, defaults, example output, exit codes, error examples.
- **Guide**: "Managing teams in your organization" — include a section on creating teams, explaining the three permission levels, the default behavior, naming conventions, and what to do after creating a team (add members, assign repositories).
- **Concept page**: link to the broader "What teams are" concept page explaining how teams relate to organizations, members, and repositories.

## Permissions & Security

### Authorization Roles

| Role | Can create team? | Notes |
|------|-----------------|-------|
| Organization Owner | ✅ Yes | Full access to create teams in the org |
| Organization Member | ❌ No | 403 Forbidden — only owners can create teams |
| Authenticated non-member | ❌ No | 403 Forbidden |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required beyond the platform default, as team creation is a low-frequency write operation.
- If abuse is detected (e.g., automated creation of hundreds of teams), the platform rate limiter will throttle the user. If this proves insufficient, a per-org team creation rate limit of 30 teams per hour should be considered.

### Data Privacy

- The request body contains a team name and description. Neither field is expected to contain PII, but no server-side PII scanning is performed on these free-text fields.
- The response exposes the team name, description, and permission level. None of these fields are PII.
- The `organization_id` field is an internal numeric ID. This is acceptable as it carries no PII, but it should be reviewed if internal ID opacity becomes a product concern.
- The `lower_name` field is a denormalized lowercase form of the team name. It is functional metadata, not PII.
- Team creation does not trigger any external notifications or webhooks that would leak team metadata outside the organization boundary.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamCreated` | A successful 201 response is returned for a team creation request | `org_name`, `org_id`, `team_name`, `team_id`, `permission`, `has_description` (boolean), `creator_user_id`, `client` (`api`, `cli`, `web`, `tui`) |
| `OrgTeamCreateFailed` | A 4xx or 5xx response is returned for a team creation attempt | `org_name`, `team_name_attempted`, `creator_user_id` (if authenticated), `status_code`, `error_reason` (`auth`, `forbidden`, `not_found`, `conflict`, `validation`, `internal`), `client` |

### Funnel Metrics

- **Team creation rate**: Number of teams created per organization per week. Indicates organizational adoption and team structuring activity.
- **Org creation → first team creation conversion**: Percentage of organizations that create at least one team within 7 days of org creation. High conversion indicates that teams are a natural next step after org creation.
- **Team creation → first member add conversion**: Percentage of newly created teams that have at least one member added within 24 hours. Low conversion may indicate a UX gap between creation and population.
- **Team creation → first repo assignment conversion**: Percentage of newly created teams that have at least one repository assigned within 24 hours. Similar signal to member add conversion.
- **Permission distribution**: Breakdown of `permission` values chosen at creation time. If most teams default to "read", it may indicate that users are not aware of or do not need other permission levels.
- **Duplicate name rejection rate**: Percentage of creation attempts that result in 409 Conflict. A high rate may indicate confusion about existing team names or a need for better team discovery.
- **Client distribution**: Breakdown of team creation requests by client surface (API, CLI, web, TUI).

### Success Indicators

- Team creation API latency p50 < 30ms, p99 < 300ms (single insert with index check).
- Error rate for 5xx responses < 0.1% of creation requests.
- At least 50% of organizations with 3+ members create at least one team within 30 days.
- 409 Conflict rate stays below 5% of total creation attempts (indicates good UX around name discovery).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Team creation request received | `debug` | `org_name`, `team_name`, `permission`, `creator_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Creator not org owner (403) | `info` | `org_name`, `creator_user_id`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `request_id` |
| Empty org name parameter | `info` | `request_id` |
| Name validation failed (empty) | `info` | `org_name`, `request_id` |
| Name validation failed (too long) | `info` | `org_name`, `name_length`, `request_id` |
| Permission validation failed | `info` | `org_name`, `permission_attempted`, `request_id` |
| Duplicate team name (409) | `info` | `org_name`, `team_name`, `request_id` |
| Team created successfully | `info` | `org_name`, `team_name`, `team_id`, `permission`, `creator_user_id`, `request_id` |
| Unexpected error in team creation | `error` | `org_name`, `team_name`, `creator_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_create_requests_total` | counter | `status_code`, `org_name` | Total team creation requests |
| `codeplane_org_team_create_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_team_create_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `conflict`, `validation`, `internal`) | Error breakdown |
| `codeplane_org_teams_total` | gauge | `org_name`, `permission` | Total number of teams per org per permission level (incremented on create, decremented on delete) |

### Alerts

#### Alert: `OrgTeamCreateHighErrorRate`
- **Condition**: `rate(codeplane_org_team_create_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context `org_team_create` and `request_id` values from the affected window.
  2. Verify database connectivity — run a basic insert/select against the `teams` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label on the counter).
  4. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.createTeam` method.
  5. Inspect the `isUniqueViolation` helper — a change in database driver error formats could cause unique violations to be misclassified as internal errors.
  6. Check for table locks or deadlocks in `pg_locks` that could be blocking inserts.
  7. Verify that the `teams` table has the expected unique index on `(organization_id, lower_name)`.
  8. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgTeamCreateHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_team_create_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific organization (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on `INSERT INTO teams ... RETURNING ...` to verify the insert plan is optimal and the unique constraint check is index-backed.
  3. Check database connection pool utilization — pool exhaustion would affect all write endpoints.
  4. Check for lock contention in `pg_locks` or long-running transactions holding locks on the `teams` table.
  5. If the latency is in the `resolveOrg` or `requireOrgRole` steps rather than the insert itself, verify indexes on the `organizations` and `org_members` tables.
  6. Check for concurrent bulk team creation operations that might be serializing on the unique index.

#### Alert: `OrgTeamCreateSuddenSpike`
- **Condition**: `rate(codeplane_org_team_create_requests_total[5m]) > 10 * avg_over_time(rate(codeplane_org_team_create_requests_total[5m])[1h:5m])`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike is organic (new large organization onboarding) or potential abuse.
  2. Check if requests are concentrated on a single `org_name` or from a single source IP / user.
  3. If abuse is suspected, verify that rate limiting is functioning correctly and consider temporarily blocking the source.
  4. If organic, no immediate action required, but monitor for cascading database load.

#### Alert: `OrgTeamCreateHighConflictRate`
- **Condition**: `rate(codeplane_org_team_create_errors_total{error_type="conflict"}[15m]) / rate(codeplane_org_team_create_requests_total[15m]) > 0.2`
- **Severity**: Info
- **Runbook**:
  1. A high conflict rate (>20%) indicates users are frequently attempting to create teams with names that already exist.
  2. Check if this is concentrated on one organization — it may indicate a UX issue where the user cannot easily see existing teams before creating.
  3. Review whether a script or automation is retrying creation without checking for existence first.
  4. Consider whether the web UI / CLI should pre-check name availability before submission.
  5. No infrastructure action required — this is a product signal, not a system failure.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Insert timeout / deadlock | 500 Internal Server Error | Retry is safe (unique constraint prevents duplicates); check for lock contention |
| Organization table corrupted/missing | 500 Internal Server Error during org resolution | Restore from backup; alert fires |
| Teams table corrupted/missing | 500 Internal Server Error during insert | Restore from backup; alert fires |
| Unique index dropped | Duplicate teams may be created silently | Rebuild unique index on `(organization_id, lower_name)`; deduplicate rows |
| Concurrent creation of same team name | One succeeds (201), others get 409 Conflict | Expected behavior; no recovery needed |
| Org membership revoked during request (race) | May return 403 after initial check passed | Extremely rare; acceptable behavior |
| Request body not valid JSON | 400 from content-type middleware | Expected behavior; no recovery needed |
| Request body extremely large | Rejected by request size limit middleware | Expected behavior; no recovery needed |
| Database disk full | 500 Internal Server Error on insert | Expand storage; alert fires from infrastructure monitoring |

## Verification

### API Integration Tests

- **`test: returns 201 with correct team object for org owner`** — Create org, call `POST /api/orgs/:org/teams` with `{ name: "backend", description: "Backend engineering team", permission: "write" }` as org owner, assert 201 and response body contains `name: "backend"`, `description: "Backend engineering team"`, `permission: "write"`.
- **`test: response has exactly the expected fields`** — Create team, assert response object has exactly keys: `id`, `organization_id`, `name`, `lower_name`, `description`, `permission`, `created_at`, `updated_at`. Assert no additional keys exist.
- **`test: id is a positive number`** — Create team, assert `typeof response.id === 'number'` and `response.id > 0`.
- **`test: organization_id matches the org`** — Create org, note org ID, create team, assert `response.organization_id` equals the org ID.
- **`test: name preserves original casing`** — Create team with name `"BackEnd"`, assert `response.name === "BackEnd"`.
- **`test: lower_name is lowercase form of name`** — Create team with name `"MyTeam"`, assert `response.lower_name === "myteam"`.
- **`test: description matches what was sent`** — Create team with description `"The backend team"`, assert `response.description === "The backend team"`.
- **`test: empty description defaults to empty string`** — Create team without description field, assert `response.description === ""`.
- **`test: description explicitly set to empty string works`** — Create team with `description: ""`, assert `response.description === ""`.
- **`test: permission read returns "read"`** — Create team with `permission: "read"`, assert `response.permission === "read"`.
- **`test: permission write returns "write"`** — Create team with `permission: "write"`, assert `response.permission === "write"`.
- **`test: permission admin returns "admin"`** — Create team with `permission: "admin"`, assert `response.permission === "admin"`.
- **`test: omitted permission defaults to "read"`** — Create team without `permission` field, assert `response.permission === "read"`.
- **`test: empty string permission defaults to "read"`** — Create team with `permission: ""`, assert `response.permission === "read"`.
- **`test: created_at is valid ISO 8601 string`** — Create team, assert `new Date(response.created_at).toISOString()` does not throw and round-trips correctly.
- **`test: updated_at is valid ISO 8601 string`** — Create team, assert `new Date(response.updated_at).toISOString()` does not throw and round-trips correctly.
- **`test: created_at and updated_at are equal at creation time`** — Create team, assert `response.created_at === response.updated_at`.
- **`test: Content-Type header is application/json`** — Create team, assert response header `Content-Type` contains `application/json`.
- **`test: team starts with no members`** — Create team, call `GET /api/orgs/:org/teams/:team/members`, assert empty array.
- **`test: team starts with no repos`** — Create team, call `GET /api/orgs/:org/teams/:team/repos`, assert empty array.
- **`test: created team appears in team list`** — Create team "alpha", call `GET /api/orgs/:org/teams`, assert the list contains a team with `name: "alpha"`.

### Auth & Permission Tests

- **`test: returns 401 for unauthenticated request`** — Call endpoint with no session/token, assert 401 with message containing `"authentication required"`.
- **`test: returns 403 for org member (non-owner)`** — Create org, add a second user as org member, authenticate as member, attempt team creation, assert 403.
- **`test: returns 403 for authenticated non-member`** — Create org, authenticate as a user who is NOT an org member, attempt team creation, assert 403.
- **`test: returns 404 for nonexistent organization`** — Call `POST /api/orgs/nonexistent-org-xyz/teams` with valid body, assert 404 with message `"organization not found"`.
- **`test: returns 400 for empty org name`** — Call `POST /api/orgs/%20/teams` with valid body, assert 400 with message containing `"organization name is required"`.

### Name Validation Tests

- **`test: returns 422 for missing name field`** — Call with body `{ description: "test", permission: "read" }` (no name), assert 422 with validation error for `name` field, code `"missing_field"`.
- **`test: returns 422 for empty string name`** — Call with `name: ""`, assert 422 with validation error for `name` field, code `"missing_field"`.
- **`test: returns 422 for whitespace-only name`** — Call with `name: "   "`, assert 422 with validation error for `name` field, code `"missing_field"`.
- **`test: returns 422 for name exceeding 255 characters`** — Call with `name` of 256 characters, assert 422 with validation error for `name` field, code `"invalid"`.
- **`test: name of exactly 255 characters succeeds`** — Call with `name` of exactly 255 characters, assert 201 and response `name` has length 255.
- **`test: name of exactly 1 character succeeds`** — Call with `name: "x"`, assert 201 and response `name === "x"`.
- **`test: name with leading/trailing whitespace is trimmed`** — Call with `name: "  backend  "`, assert 201 and response `name === "backend"`.
- **`test: name with internal whitespace is preserved`** — Call with `name: "my team"`, assert 201 and response `name === "my team"`.

### Permission Validation Tests

- **`test: returns 422 for invalid permission value`** — Call with `permission: "superadmin"`, assert 422 with validation error for `permission` field, code `"invalid"`.
- **`test: returns 422 for numeric permission value`** — Call with `permission: "123"`, assert 422.
- **`test: permission is case-sensitive - "Read" is rejected`** — Call with `permission: "Read"`, assert 422.
- **`test: permission is case-sensitive - "WRITE" is rejected`** — Call with `permission: "WRITE"`, assert 422.
- **`test: permission is case-sensitive - "Admin" is rejected`** — Call with `permission: "Admin"`, assert 422.

### Uniqueness Tests

- **`test: returns 409 for duplicate team name`** — Create team "backend", attempt to create another team "backend" in same org, assert 409 with message `"team already exists"`.
- **`test: returns 409 for case-insensitive duplicate`** — Create team "Backend", attempt to create "backend" (lowercase), assert 409.
- **`test: returns 409 for case-insensitive duplicate (reverse)`** — Create team "backend", attempt to create "BACKEND", assert 409.
- **`test: same team name in different orgs succeeds`** — Create org A and org B, create team "backend" in org A (201), create team "backend" in org B (201), both succeed.
- **`test: after deleting a team, recreating with same name succeeds`** — Create team "backend", delete it, create "backend" again, assert 201.

### Case-Insensitivity Tests

- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", call `POST /api/orgs/myorg/teams` (lowercase), assert 201.
- **`test: mixed case org name resolves`** — Create org "TestOrg", call `POST /api/orgs/TESTORG/teams`, assert 201.

### Edge Case Tests

- **`test: description with special characters is stored correctly`** — Create team with description containing `<script>alert('xss')</script>`, `"quotes"`, `\nnewlines`, unicode emoji `🚀`, assert description is returned verbatim.
- **`test: name with unicode characters works`** — Create team with name containing valid unicode (e.g., `"café-team"`), assert 201 and name is preserved.
- **`test: description with very long text works`** — Create team with a 10,000-character description, assert 201 and full description is returned.
- **`test: null permission in body defaults to read`** — Call with `permission: null`, assert 201 and `response.permission === "read"`.
- **`test: null description in body defaults to empty`** — Call with `description: null`, assert 201 and `response.description === ""`.
- **`test: extra fields in request body are ignored`** — Call with `{ name: "test", extra: "ignored" }`, assert 201 and response does not contain `extra`.

### CLI E2E Tests

- **`test: codeplane org team create <org> <name> returns JSON object`** — Create org, run `org team create <org> myteam --description "My team" --permission write`, parse JSON output, assert it is an object with `name: "myteam"`, `description: "My team"`, `permission: "write"`.
- **`test: codeplane org team create output has all expected fields`** — Run create command, parse JSON, assert keys include `id`, `organization_id`, `name`, `lower_name`, `description`, `permission`, `created_at`, `updated_at`.
- **`test: codeplane org team create with default permission`** — Run `org team create <org> defaults-team`, parse JSON, assert `permission === "read"`.
- **`test: codeplane org team create with default description`** — Run `org team create <org> nodesc-team`, parse JSON, assert `description === ""`.
- **`test: codeplane org team create with all options`** — Run `org team create <org> full-team --description "Full options" --permission admin`, assert all fields match.
- **`test: codeplane org team create duplicate errors`** — Create team "dup-team", attempt to create "dup-team" again, assert non-zero exit code and stderr contains error.
- **`test: codeplane org team create with nonexistent org errors`** — Run `org team create nonexistent-org teamname`, assert non-zero exit code and stderr contains error message.
- **`test: codeplane org team create without required args errors`** — Run `org team create` without org/name, assert error output indicating required arguments.
- **`test: codeplane org team create output matches API response`** — Create team via CLI, retrieve same team via API `GET /api/orgs/:org/teams/:team`, parse both JSON outputs, assert they are structurally identical (same fields and values).
- **`test: codeplane org team create with --json field filter`** — Run `org team create <org> filtered-team --json name,permission`, assert output contains only filtered fields.

### Playwright Web UI E2E Tests (when `ORG_TEAM_MANAGEMENT_UI` is implemented)

- **`test: "New Team" button visible to org owners on team list page`** — Authenticate as org owner, navigate to `/:org/-/teams`, assert "New Team" button is visible.
- **`test: "New Team" button not visible to org members`** — Authenticate as org member, navigate to `/:org/-/teams`, assert "New Team" button is not visible.
- **`test: clicking "New Team" opens creation form`** — Click "New Team", assert form with name, description, and permission fields appears.
- **`test: creating team with valid inputs succeeds`** — Fill name "e2e-team", description "E2E test team", select "write" permission, click "Create Team", assert redirect to team detail page and toast notification appears.
- **`test: submitting without name shows validation error`** — Leave name empty, click "Create Team", assert inline validation error on name field.
- **`test: submitting with duplicate name shows conflict error`** — Create team "existing", then try to create "existing" again via UI, assert inline error "A team with this name already exists".
- **`test: permission defaults to read`** — Open creation form, assert "Read" is pre-selected.
- **`test: form is disabled during submission`** — Fill valid inputs, click "Create Team", assert button is disabled and shows loading indicator during API call.
- **`test: created team appears in team list after redirect`** — Create team "new-team", navigate back to team list, assert "new-team" appears in the list.
- **`test: escape key dismisses creation form (if modal)`** — Open creation form, press Escape, assert form is no longer visible.

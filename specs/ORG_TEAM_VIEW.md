# ORG_TEAM_VIEW

Specification for ORG_TEAM_VIEW.

## High-Level User POV

When a user is a member of an organization on Codeplane, they often need to inspect the details of a specific team — not just see a name in a list, but understand exactly what that team is, what permission level it carries, and when it was created or last modified.

The team view is the detail surface for a single team within an organization. A user arrives at it by clicking a team name in the team list, running a CLI command, or making an API call. What they see is the complete profile of that team: its display name, slug, description, default permission level (read, write, or admin), the organization it belongs to, and its creation and last-updated timestamps.

This information serves multiple purposes. Before requesting to be added to a team, a user can verify that the team's permission level and description match what they need. An organization owner deciding whether to rename, restructure, or delete a team can review its current state first. Automation scripts and editor integrations can query a team's metadata to make decisions about access or display.

The team view is a read-only informational surface. It does not allow editing — that is a separate feature. It simply retrieves and displays the authoritative state of one team, consistently, regardless of whether the user accesses it through the web UI, CLI, TUI, or API.

The team view is accessible to any authenticated user who holds the `owner` or `member` role within the organization. Users who are not organization members cannot view team details, and unauthenticated users are rejected entirely. This ensures that team metadata remains private to the organization.

## Acceptance Criteria

- **Authentication required**: The endpoint must reject unauthenticated requests with a 401 Unauthorized response.
- **Organization membership required**: Only users who are members (either `owner` or `member` role) of the organization may view a team. Non-members must receive a 403 Forbidden response.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return a 404 Not Found response.
- **Team must exist**: If the team name does not resolve to a valid team within the resolved organization, the endpoint must return a 404 Not Found response with message `"team not found"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Case-insensitive team lookup**: The team name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Response shape**: The response body must be a single JSON object with exactly these fields: `id` (number), `organization_id` (number), `name` (string), `lower_name` (string), `description` (string), `permission` (string), `created_at` (string, ISO 8601), `updated_at` (string, ISO 8601).
- **Permission values**: The `permission` field must be one of `"read"`, `"write"`, or `"admin"`.
- **Timestamps**: `created_at` and `updated_at` must be ISO 8601 formatted strings.
- **Empty org name**: A request with an empty or whitespace-only `:org` path parameter must return 400 Bad Request with message `"organization name is required"`.
- **Empty team name**: A request with an empty or whitespace-only `:team` path parameter must return 400 Bad Request with message `"team name is required"`.
- **Org name max length**: Organization names longer than 255 characters must return 404 (no org will match, treated as nonexistent).
- **Team name max length**: Team names longer than 255 characters must return 404 (no team will match, treated as nonexistent).
- **Special characters in names**: Organization and team name path parameters containing URL-encoded special characters (e.g., `%20`, `%2F`) must be decoded and trimmed before lookup. Only valid slug characters should match existing teams.
- **CLI consistency**: The CLI `org team view <org> <team>` command must output the same JSON object returned by the API.
- **No data leakage**: The response must not include any fields beyond the defined team shape (no internal database row IDs beyond `id`, no join metadata, no member lists, no repository lists).
- **Idempotent**: Repeated GET requests for the same team must return the same result (assuming no concurrent modifications).
- **Content-Type**: Response must include `Content-Type: application/json` header.

### Definition of Done

- The `GET /api/orgs/:org/teams/:team` route returns the correct single-team JSON object for authenticated org members.
- Non-members and unauthenticated users are correctly rejected with appropriate status codes and error messages.
- Both organization name and team name are resolved case-insensitively.
- CLI `org team view` command works end-to-end and produces output structurally identical to the API response.
- All verification tests pass.
- Observability instrumentation is in place.
- Documentation for the API endpoint and CLI command is published.

## Design

### API Shape

**Endpoint**: `GET /api/orgs/:org/teams/:team`

**Path Parameters**:
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |
| `team`    | string | Yes      | Team name / slug (case-insensitive, resolved via `lower_name`) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`

**Response** (200 OK):
```json
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
```

**Response Headers**: `Content-Type: application/json`

**Error Responses**:
| Status | Condition | Error Message |
|--------|----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 400    | Empty or whitespace-only `:team` path parameter | `"team name is required"` |
| 401    | No valid session cookie or PAT provided | `"authentication required"` |
| 403    | Authenticated user is not an org member | `"forbidden"` |
| 404    | Organization does not exist | `"organization not found"` |
| 404    | Team does not exist in the organization | `"team not found"` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async getTeam(
  viewer: User | null,
  orgName: string,
  teamName: string,
): Promise<Result<Team, APIError>>
```

The service: (1) validates authentication (returns 401 if `viewer` is null), (2) resolves the org case-insensitively via `resolveOrg` (returns 404 if not found, 400 if empty), (3) verifies viewer holds `owner` or `member` role via `requireOrgRole` (returns 403 if not), (4) resolves the team case-insensitively within the org via `resolveTeam` (returns 404 if not found, 400 if empty), (5) maps the database row to the `Team` shape via `mapTeam`, (6) returns `Result.ok(team)`.

### CLI Command

```
codeplane org team view <org> <team>
```

| Argument | Type   | Required | Description |
|----------|--------|----------|-------------|
| `org`    | string | Yes      | Organization name |
| `team`   | string | Yes      | Team slug / name |

**Output**: JSON object representing the single team, identical to the API response body. Supports `--json` field filtering.

**Exit codes**: 0 = success, 1 = API error (prints error message to stderr).

**Example**:
```
$ codeplane org team view my-org backend
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
```

### Web UI Design

**Status**: `Gated` — referenced in feature inventory as `ORG_TEAMS_UI` but not yet implemented. When implemented:

- Team detail page is accessed by clicking a team name from the team list, or by navigating to `/:org/-/teams/:team`.
- The page displays:
  - **Team name** as the page heading.
  - **Permission badge**: color-coded label — green for `read`, yellow for `write`, red for `admin`.
  - **Description**: full text, rendered as markdown-safe plain text.
  - **Created**: human-readable relative timestamp (e.g., "Created 3 months ago") with ISO tooltip.
  - **Last updated**: human-readable relative timestamp with ISO tooltip.
- **Navigation**: breadcrumb trail showing `Org Name > Teams > Team Name`.
- **Actions** (for org owners only): "Edit" and "Delete" buttons in a top-right action bar.
- **Sub-navigation tabs** (when `ORG_TEAM_MANAGEMENT_UI` is implemented):
  - "Members" — links to the team member list.
  - "Repositories" — links to the team repository list.
- **Empty description state**: if description is empty, show muted placeholder text "No description provided."

### TUI UI

**Status**: `Partial` — no team detail screen exists. When implemented:

- Team detail view accessible by pressing Enter on a team in the team list.
- Displays: name, permission (color-coded), description (word-wrapped), created and updated timestamps.
- Key bindings: `e` to edit (if owner), `d` to delete (if owner), `m` to view members, `r` to view repos, `Esc` to go back.

### Documentation

- **API reference**: `GET /api/orgs/:org/teams/:team` — path parameters, response shape, error codes, example curl command.
- **CLI reference**: `codeplane org team view` — arguments, example output, exit codes.
- **Guide**: "Managing teams in your organization" — include a section on viewing team details, explaining what each field means and how to navigate to team members and repositories from the team view.
- **Concept page**: link to the broader "What teams are" concept page explaining the three permission levels and their relationship to repository access.

## Permissions & Security

### Authorization Roles

| Role | Can view team? | Notes |
|------|---------------|-------|
| Organization Owner | ✅ Yes | Full access to view any team in the org |
| Organization Member | ✅ Yes | Read-only viewing of any team in the org |
| Authenticated non-member | ❌ No | 403 Forbidden |
| Unauthenticated / Anonymous | ❌ No | 401 Unauthorized |

### Rate Limiting

- The endpoint inherits the platform-wide rate limiting middleware applied to all API routes.
- No special per-endpoint rate limit is required for team view, as it is a read-only single-object query with minimal database cost.
- The single-team lookup query is bounded by primary key + index lookups; there is no risk of unbounded query cost.

### Data Privacy

- The response exposes team name, description, and permission level. None of these fields are PII.
- Team member identities are **not** included in the team view response — they require a separate `GET /api/orgs/:org/teams/:team/members` call.
- The `organization_id` field is an internal numeric ID. This is acceptable as it carries no PII, but it should be reviewed if internal ID opacity becomes a product concern.
- The `lower_name` field is a denormalized lowercase form of the team name. It is functional metadata, not PII.
- Team names and descriptions should not contain PII by convention, but no server-side PII scanning is performed on these free-text fields.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgTeamViewed` | A successful 200 response is returned for a team view request | `org_name`, `team_name`, `team_id`, `viewer_user_id`, `team_permission`, `client` (`api`, `cli`, `web`, `tui`) |
| `OrgTeamViewFailed` | A 4xx or 5xx response is returned | `org_name`, `team_name_attempted`, `viewer_user_id` (if authenticated), `status_code`, `error_reason`, `client` |

### Funnel Metrics

- **Team view adoption rate**: Percentage of org members who view at least one team detail per month.
- **Team list → team view conversion**: Percentage of team list views that result in a team detail view within the same session. High conversion indicates the list is a useful discovery surface.
- **Team view → team edit conversion**: Percentage of team views by org owners that result in a team edit within the same session. Indicates whether the view-then-edit flow is natural.
- **Team view → member list conversion**: Percentage of team views followed by a member list view for the same team. Indicates interest in team composition.
- **Client distribution**: Breakdown of team view requests by client surface (API, CLI, web, TUI).

### Success Indicators

- Team view API latency p50 < 20ms, p99 < 200ms (single-row lookup should be fast).
- Error rate < 0.1% of requests (excluding expected 401/403/404 responses).
- At least 60% of teams that exist are viewed at least once within 30 days of creation.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Team view request received | `debug` | `org_name`, `team_name`, `viewer_user_id`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Team not found | `info` | `org_name`, `team_name`, `request_id` |
| Viewer not org member (403) | `info` | `org_name`, `viewer_user_id`, `request_id` |
| Unauthenticated request (401) | `debug` | `org_name`, `team_name`, `request_id` |
| Empty org name parameter | `info` | `request_id` |
| Empty team name parameter | `info` | `org_name`, `request_id` |
| Team view query completed | `debug` | `org_name`, `team_name`, `team_id`, `query_duration_ms`, `request_id` |
| Unexpected error in team view | `error` | `org_name`, `team_name`, `viewer_user_id`, `error_message`, `error_stack`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_team_view_requests_total` | counter | `status_code`, `org_name` | Total team view requests |
| `codeplane_org_team_view_duration_seconds` | histogram | `org_name` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_team_view_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `bad_request`, `internal`) | Error breakdown |

### Alerts

#### Alert: `OrgTeamViewHighErrorRate`
- **Condition**: `rate(codeplane_org_team_view_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries with context `org_team_view`.
  2. Verify database connectivity — run a basic query against the `teams` table.
  3. Check if a specific organization is producing all errors (inspect `org_name` label on the counter).
  4. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.getTeam` method.
  5. If the error involves the `resolveOrg` or `resolveTeam` helper, verify that the `organizations` and `teams` tables have the expected indexes on `lower_name`.
  6. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgTeamViewHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_team_view_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific organization (`org_name` label).
  2. Run `EXPLAIN ANALYZE` on `SELECT ... FROM teams WHERE organization_id = $1 AND lower_name = $2` to verify the index is being used.
  3. Check database connection pool utilization — a pool exhaustion issue would affect all endpoints, not just team view.
  4. Check for lock contention in `pg_locks` or slow transactions holding row locks on the `teams` table.
  5. Verify no full table scans are being triggered (check `seq_scan` counter on `teams` table in `pg_stat_user_tables`).
  6. If latency is caused by the `requireOrgRole` check, verify indexes on the `org_members` table.

#### Alert: `OrgTeamViewSuddenSpike`
- **Condition**: `rate(codeplane_org_team_view_requests_total[5m]) > 10 * avg_over_time(rate(codeplane_org_team_view_requests_total[5m])[1h:5m])`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike is organic (new integration or customer) or potential abuse.
  2. Check if requests are concentrated on a single `org_name` or from a single source IP.
  3. If abuse is suspected, verify that rate limiting is functioning correctly.
  4. No immediate action required for organic spikes, but monitor for cascading latency impact.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Query timeout | 500 Internal Server Error | Check for missing index on `teams(organization_id, lower_name)` |
| Organization table corrupted/missing | 500 Internal Server Error | Restore from backup; alert fires |
| Teams table corrupted/missing | 500 Internal Server Error | Restore from backup; alert fires |
| Concurrent team deletion during view | 404 Not Found (team disappeared) | Expected behavior; no recovery needed |
| Org membership revoked during request | 403 Forbidden (race condition) | Expected behavior; no recovery needed |
| Malformed path parameters (encoded nulls, extremely long strings) | 400 or 404 depending on validation | Expected behavior; log for monitoring |

## Verification

### API Integration Tests

- **`test: returns 200 with correct team object for org owner`** — Create org, create team "backend" with permission "write" and description "Backend engineering team", call `GET /api/orgs/:org/teams/backend` as org owner, assert 200 and all fields match expected values.
- **`test: returns 200 with correct team object for org member`** — Create org, create team, add a second user as org member, authenticate as member, call team view, assert 200.
- **`test: response has exactly the expected fields`** — Get team, assert response object has exactly keys: `id`, `organization_id`, `name`, `lower_name`, `description`, `permission`, `created_at`, `updated_at`. Assert no additional keys exist.
- **`test: id is a number`** — Get team, assert `typeof response.id === 'number'`.
- **`test: organization_id is a number`** — Get team, assert `typeof response.organization_id === 'number'`.
- **`test: name is a string`** — Get team, assert `typeof response.name === 'string'`.
- **`test: lower_name is lowercase form of name`** — Create team "MyTeam", get team, assert `response.lower_name === "myteam"`.
- **`test: description is a string`** — Get team, assert `typeof response.description === 'string'`.
- **`test: permission is one of read, write, admin`** — Create teams with each permission level, view each, assert permission matches.
- **`test: permission read returns "read"`** — Create team with "read", view, assert `permission === "read"`.
- **`test: permission write returns "write"`** — Create team with "write", view, assert `permission === "write"`.
- **`test: permission admin returns "admin"`** — Create team with "admin", view, assert `permission === "admin"`.
- **`test: created_at is valid ISO 8601 string`** — Get team, assert `new Date(response.created_at).toISOString()` does not throw and matches expected format.
- **`test: updated_at is valid ISO 8601 string`** — Get team, assert `new Date(response.updated_at).toISOString()` does not throw and matches expected format.
- **`test: description matches what was set at creation`** — Create team with description "The backend team", view, assert description matches.
- **`test: empty description is preserved`** — Create team without description, view, assert `description === ""`.
- **`test: Content-Type header is application/json`** — Get team, assert response header `Content-Type` contains `application/json`.

### Auth & Permission Tests

- **`test: returns 401 for unauthenticated request`** — Call endpoint with no session/token, assert 401 with message containing `"authentication required"`.
- **`test: returns 403 for authenticated non-member`** — Create org, create team, authenticate as a user who is NOT an org member, call team view, assert 403.
- **`test: returns 404 for nonexistent organization`** — Call `GET /api/orgs/nonexistent-org-xyz/teams/anyteam`, assert 404 with message `"organization not found"`.
- **`test: returns 404 for nonexistent team in valid org`** — Create org, call `GET /api/orgs/:org/teams/nonexistent-team-xyz`, assert 404 with message `"team not found"`.
- **`test: returns 400 for empty org name`** — Call `GET /api/orgs/%20/teams/myteam`, assert 400 with message containing `"organization name is required"`.
- **`test: returns 400 for empty team name`** — Call `GET /api/orgs/myorg/teams/%20`, assert 400 with message containing `"team name is required"`.

### Case-Insensitivity Tests

- **`test: org name is resolved case-insensitively`** — Create org "MyOrg", create team "backend", call `GET /api/orgs/myorg/teams/backend`, assert 200 and correct data.
- **`test: team name is resolved case-insensitively`** — Create org, create team "Backend", call `GET /api/orgs/:org/teams/backend` (lowercase), assert 200 and `response.name === "Backend"` (preserves original casing).
- **`test: mixed case org and team names both resolve`** — Create org "TestOrg", create team "DevTeam", call `GET /api/orgs/testorg/teams/devteam`, assert 200.

### Edge Case Tests

- **`test: team name at maximum valid length (255 chars) works`** — Create team with name of exactly 255 characters, view it, assert 200 with correct name.
- **`test: team name exceeding 255 chars returns 404`** — Call `GET /api/orgs/:org/teams/<256-char-string>`, assert 404 (no team matches).
- **`test: org name at maximum valid length (255 chars) returns 404 (no org matches)`** — Call with 255-char org name, assert 404.
- **`test: org name exceeding 255 chars returns 404`** — Call with 256-char org name, assert 404.
- **`test: team with special characters in description is returned correctly`** — Create team with description containing `<script>`, `"quotes"`, `\nnewlines`, unicode characters, assert they are returned verbatim.
- **`test: viewing a team does not modify it`** — Get team, note `updated_at`, wait 100ms, get team again, assert `updated_at` is unchanged.
- **`test: response for same team is identical across consecutive requests`** — Get team twice, assert responses are deeply equal.
- **`test: team view after team update reflects updated data`** — Create team with description "v1", update description to "v2", view team, assert description is "v2".

### CLI E2E Tests

- **`test: codeplane org team view <org> <team> returns JSON object`** — Create org, create team "alpha" with description "Alpha team" and permission "write", run `org team view <org> alpha`, parse JSON output, assert it is an object (not array) with correct `name`, `description`, `permission`.
- **`test: codeplane org team view output has all expected fields`** — Run `org team view`, parse JSON, assert keys include `id`, `organization_id`, `name`, `lower_name`, `description`, `permission`, `created_at`, `updated_at`.
- **`test: codeplane org team view with nonexistent org exits with error`** — Run `org team view nonexistent-org anyteam`, assert non-zero exit code and stderr contains error message.
- **`test: codeplane org team view with nonexistent team exits with error`** — Run `org team view <valid-org> nonexistent-team`, assert non-zero exit code and stderr contains error message.
- **`test: codeplane org team view output matches API response`** — Create team, call both CLI and API, parse both JSON outputs, assert they are structurally identical (same fields and values).
- **`test: codeplane org team view without required args errors`** — Run `org team view` without org and team args, assert error output indicating required arguments.
- **`test: codeplane org team view with --json field filter`** — Run `org team view <org> <team> --json name,permission`, assert output contains only filtered fields.

### Playwright Web UI E2E Tests (when `ORG_TEAMS_UI` is implemented)

- **`test: team detail page renders team name as heading`** — Navigate to `/:org/-/teams/:team`, assert `h1` or primary heading contains the team name.
- **`test: team detail page shows permission badge`** — Create team with "admin" permission, navigate to detail, assert a badge element with text "admin" is visible.
- **`test: team detail page shows description`** — Create team with description, navigate to detail, assert description text is visible.
- **`test: team detail page shows timestamps`** — Navigate to team detail, assert created and updated timestamps are displayed.
- **`test: team detail page shows empty description placeholder`** — Create team without description, navigate to detail, assert placeholder text "No description provided" is visible.
- **`test: team detail page breadcrumb navigates back to team list`** — Navigate to team detail, click org teams breadcrumb, assert URL returns to team list.
- **`test: non-member sees access denied on team detail page`** — Authenticate as non-member, navigate to `/:org/-/teams/:team`, assert access denied state.
- **`test: nonexistent team shows 404 state`** — Navigate to `/:org/-/teams/nonexistent`, assert a 404 or "team not found" state is rendered.
- **`test: org owner sees edit and delete buttons`** — Authenticate as org owner, navigate to team detail, assert "Edit" and "Delete" buttons are visible.
- **`test: org member does not see edit and delete buttons`** — Authenticate as org member, navigate to team detail, assert "Edit" and "Delete" buttons are not visible.

# ORG_VIEW

Specification for ORG_VIEW.

## High-Level User POV

When you navigate to an organization on Codeplane — whether through the web UI, the CLI, the TUI, or an API call — you see the complete public profile of that organization. This is the organization view, and it is the entry point for understanding everything about an organization: what it is, who it belongs to, what it contains, and how to participate in it.

The organization view tells you at a glance the organization's name, description, visibility level, website, and geographic location. It answers the immediate question "what is this org?" before you dive deeper into its repositories, teams, or members. For public organizations, anyone — including unauthenticated visitors — can see this information. For private or limited-visibility organizations, only authenticated members can access the profile, and non-members receive a 404 rather than a 403, preventing outside users from even learning that the organization exists.

From the CLI, you can run `codeplane org view <name>` and receive the organization's structured JSON profile, which is useful for scripting, automation, and agent-driven workflows. From the web UI, navigating to `/:org` loads the organization overview page showing the profile header, public repository list, and contextual navigation into members, teams, and settings. From the TUI, the organization detail screen is accessible from the organization list and provides the same information in a navigable terminal layout.

The value of ORG_VIEW is consistency and discoverability: every user, agent, and integration can retrieve a canonical representation of an organization from a single API call, and every client surface presents that representation appropriately for its medium. It is the starting point for all organization-scoped actions — browsing repositories, managing teams, inviting members, or configuring settings — and it must feel immediate and authoritative regardless of the access path.

## Acceptance Criteria

### Functional Constraints

- The API endpoint `GET /api/orgs/:org` must return the complete organization profile for any valid, accessible organization.
- The response body must be a single JSON object with exactly these fields: `id` (number), `name` (string), `lower_name` (string), `description` (string), `visibility` (string — one of `"public"`, `"limited"`, or `"private"`), `website` (string), `location` (string), `created_at` (string, ISO 8601), `updated_at` (string, ISO 8601).
- The `:org` path parameter must be resolved case-insensitively via the stored `lower_name`.
- If the `:org` path parameter is empty or whitespace-only, the API must return `400 Bad Request` with the message `"organization name is required"`.
- If the organization does not exist, the API must return `404 Not Found` with the message `"organization not found"`.
- If the organization visibility is `"public"`, unauthenticated requests must succeed with `200 OK`.
- If the organization visibility is `"limited"` or `"private"`, unauthenticated requests must return `404 Not Found` (not `403 Forbidden`), to prevent leaking the organization's existence.
- If the organization visibility is `"limited"` or `"private"` and the viewer is authenticated but not an org member, the API must return `403 Forbidden` with the message `"organization membership required"`.
- The `name` field must preserve the original casing as set by the organization creator or most recent update.
- The `lower_name` field must be the lowercase form of `name`.
- The `description` field must be a string (empty string `""` if not set, never `null`).
- The `website` field must be a string (empty string `""` if not set, never `null`).
- The `location` field must be a string (empty string `""` if not set, never `null`).
- The `visibility` field must be exactly one of `"public"`, `"limited"`, or `"private"`.
- `created_at` and `updated_at` must be valid ISO 8601 strings in UTC.
- The `id` field must be a positive integer.
- The response must not include any fields beyond the defined organization shape (no member lists, no repository lists, no team lists, no internal metadata).
- Repeated GET requests for the same organization must return the same result (assuming no concurrent modifications).
- The response must include the `Content-Type: application/json` header.

### Boundary Constraints

- Organization names have a maximum length of 255 characters. Names longer than 255 characters cannot match any stored organization and must return `404`.
- Organization names must contain only alphanumeric characters, hyphens, and underscores. Names with other characters will not match any organization.
- Organization names are case-insensitive for lookup. `"MyOrg"`, `"myorg"`, and `"MYORG"` all resolve to the same organization.
- URL-encoded special characters in the `:org` path parameter (e.g., `%20`, `%2F`) must be decoded and trimmed before lookup.

### Edge Cases

- Viewing an organization immediately after creation must return consistent data (no stale cache).
- Viewing an organization whose name was recently changed must work at the new name and fail at the old name.
- Concurrent GET requests for the same organization must all succeed without race conditions.
- An organization name that looks like a reserved route word (e.g., `api`, `admin`, `login`) must be handled correctly by the routing layer.
- Organization descriptions, websites, and locations containing special characters (HTML entities, unicode, newlines, quotes) must be returned verbatim without escaping or sanitization in the JSON response.

### CLI-Specific Constraints

- `codeplane org view <name>` must accept a positional argument for the organization name.
- The CLI output must produce a valid JSON object matching the API response shape.
- The CLI supports `--json` field filtering for structured output.
- If the organization cannot be resolved, the CLI must exit with a non-zero code and a clear error message on stderr.

### Definition of Done

- The `GET /api/orgs/:org` route returns the correct organization JSON object for any valid, accessible viewer.
- Public organizations are viewable by unauthenticated users.
- Private/limited organizations are only viewable by authenticated members.
- Organization name lookup is case-insensitive.
- CLI `org view` command works end-to-end and produces output structurally identical to the API response.
- TUI organization overview screen displays all organization fields in a navigable layout.
- Web UI organization profile page renders organization metadata, repositories, and contextual navigation.
- All verification tests pass.
- Observability instrumentation is in place.
- Documentation for the API endpoint and CLI command is published.

## Design

### API Shape

**Endpoint**: `GET /api/orgs/:org`

**Path Parameters**:
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>` (optional for public orgs)

**Response** (200 OK):
```json
{
  "id": 42,
  "name": "Acme Corp",
  "lower_name": "acme corp",
  "description": "Building the future of widget manufacturing",
  "visibility": "public",
  "website": "https://acme.example.com",
  "location": "San Francisco, CA",
  "created_at": "2026-01-10T08:00:00.000Z",
  "updated_at": "2026-03-01T12:30:00.000Z"
}
```

**Response Headers**: `Content-Type: application/json`

**Error Responses**:
| Status | Condition | Error Message |
|--------|----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 403    | Authenticated user is not a member of a non-public org | `"organization membership required"` |
| 404    | Organization does not exist | `"organization not found"` |
| 404    | Unauthenticated request for non-public org | `"organization not found"` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async getOrg(
  viewer: User | null,
  orgName: string,
): Promise<Result<Organization, APIError>>
```

The service: (1) resolves the org case-insensitively via `resolveOrg` (returns 400 if name is empty, 404 if not found), (2) if the org is public, returns the mapped organization immediately for any viewer including `null`, (3) if the org is non-public and the viewer is `null`, returns 404 (conceals existence), (4) if the org is non-public and the viewer is authenticated, checks org membership via `requireOrgRole` (returns 403 if not a member), (5) maps the database row to the `Organization` shape via `mapOrganization`, (6) returns `Result.ok(org)`.

### CLI Command

**Synopsis**:
```
codeplane org view <name>
```

| Argument | Type   | Required | Description |
|----------|--------|----------|-------------|
| `name`   | string | Yes      | Organization name |

**Output**: JSON object representing the organization, identical to the API response body. Supports `--json` field filtering.

**Exit codes**: 0 = success, 1 = API error (prints error message to stderr).

**Example**:
```
$ codeplane org view acme-corp
{
  "id": 42,
  "name": "Acme Corp",
  "lower_name": "acme corp",
  "description": "Building the future of widget manufacturing",
  "visibility": "public",
  "website": "https://acme.example.com",
  "location": "San Francisco, CA",
  "created_at": "2026-01-10T08:00:00.000Z",
  "updated_at": "2026-03-01T12:30:00.000Z"
}
```

### Web UI Design

**Status**: `Gated` — referenced in feature inventory as `ORG_SETTINGS_UI` but org profile page is not yet fully implemented.

**Route**: `/:org`

When implemented, the web organization profile page should include:

**1. Organization Header**:
- Organization name as primary heading
- Visibility badge: color-coded label — green for `public`, yellow for `limited`, red for `private`
- Website URL as a clickable link (if non-empty)
- Location text with map pin icon (if non-empty)
- Member count indicator
- "Settings" gear icon (for org owners only)

**2. Description Section**:
- Full description text rendered as markdown-safe plain text
- If description is empty, show muted placeholder text "No description provided."

**3. Metadata Row**:
- Created: human-readable relative timestamp (e.g., "Created 3 months ago") with ISO tooltip
- Last updated: human-readable relative timestamp with ISO tooltip

**4. Tab Navigation**:
- **Repositories** (default tab): paginated list of organization repositories. Public viewers see only public repos; members see all repos.
- **Members** (org members only): member list with roles
- **Teams** (org members only): team list with permission badges
- **Settings** (org owners only): org settings page

**5. Sidebar (right)**:
- About section with description
- Website link
- Location
- Quick stats: member count, repository count, team count

**Navigation**: breadcrumb trail showing `Home > Org Name`.

**Empty States**:
- No repositories: "This organization has no repositories yet."
- No description: "No description provided." in muted text
- Access denied (non-public org, non-member): full 404 page (do not reveal org exists)

### TUI UI

**Status**: `Partial` — no org overview screen exists in the TUI today.

When implemented:

**Screen: Organization Overview**

Accessible from the organization list by pressing Enter on an organization.

**Layout**:
- **Header bar**: `{name}` with visibility badge (`PUBLIC` / `LIMITED` / `PRIVATE`)
- **Metadata section**:
  - Description: word-wrapped text (or "No description" placeholder)
  - Website: `{website}` (if non-empty)
  - Location: `{location}` (if non-empty)
  - Created: `{created_at}` (relative time)
  - Updated: `{updated_at}` (relative time)

**Key bindings**:
| Key | Action |
|-----|--------|
| `r` | Navigate to repositories |
| `m` | Navigate to members |
| `t` | Navigate to teams |
| `s` | Navigate to settings (if owner) |
| `q` / `Esc` | Go back to organization list |
| `?` | Show keyboard help |

### Documentation

- **API reference**: `GET /api/orgs/:org` — path parameters, response shape, error codes, visibility-aware access control, example curl command for public and authenticated requests.
- **CLI reference**: `codeplane org view` — arguments, example output, exit codes, `--json` field filtering example.
- **Guide**: "Managing organizations on Codeplane" — section on viewing organization details, explaining what each field means, visibility levels and their implications, and how to navigate from the org view to repos/members/teams.
- **Concept page**: "Organization visibility levels" — explaining the difference between public, limited, and private organizations and what each means for discoverability and access.

## Permissions & Security

### Authorization Roles

| Role | Can view public org? | Can view limited/private org? | Notes |
|------|---------------------|-------------------------------|-------|
| Anonymous (unauthenticated) | ✅ Yes | ❌ No (returns 404) | Cannot learn non-public org exists |
| Authenticated (non-member) | ✅ Yes | ❌ No (returns 403) | Authenticated but not a member |
| Organization Member | ✅ Yes | ✅ Yes | `member` role sufficient |
| Organization Owner | ✅ Yes | ✅ Yes | Full access |
| Platform Admin (`is_admin`) | ✅ Yes | ✅ Yes (all orgs) | Superuser access |

### Security Rules

1. **Information leakage prevention for non-public orgs**: Non-public organizations must return `404 Not Found` to unauthenticated viewers, never `403 Forbidden`. This prevents outside users from enumerating private organization names. Authenticated non-members receive `403` because their identity is already known.
2. **No transitive access**: Viewing an organization does not grant access to its repositories, members, or teams. Each resource has independent access control.
3. **PAT scope**: Personal access tokens must be valid to authenticate against non-public organizations.
4. **Deploy key exclusion**: Deploy keys are repository-scoped and cannot be used to view organization details.

### Rate Limiting

| Context | Rate Limit | Window |
|---------|-----------|--------|
| Authenticated requests | 5,000 requests | per hour |
| Unauthenticated requests | 60 requests | per hour |
| Per-IP burst | 30 requests | per minute |

Rate limiting is enforced by the platform middleware layer (`PLATFORM_HTTP_MIDDLEWARE_RATE_LIMITING`). Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses.

### Data Privacy

- **No PII in the response by default**: The `Organization` response does not contain user PII. The `name`, `description`, `website`, and `location` fields are organization-level metadata set by the org owner.
- **Non-public org descriptions are protected**: Descriptions of non-public organizations are only visible to authenticated members. They must not appear in search results, activity feeds, or logs accessible to non-members.
- **No member data leakage**: The org view response does not include any member lists, team lists, or repository lists. These require separate authenticated API calls with their own access controls.
- **Website and location are optional freetext**: These fields may contain information the org owner considers sensitive. They are only exposed through the org view and are protected by the same visibility rules.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgViewed` | A successful 200 response is returned for an org view request | `org_id`, `org_name`, `org_visibility`, `viewer_user_id` (null if unauthenticated), `viewer_is_member` (boolean), `viewer_role` (`"owner"`, `"member"`, or `null`), `client` (`"api"`, `"cli"`, `"web"`, `"tui"`), `response_time_ms` |
| `OrgViewFailed` | A 4xx or 5xx response is returned | `org_name_attempted`, `viewer_user_id` (if authenticated), `status_code`, `error_reason`, `client` |

### Funnel Metrics

- **Org view adoption rate**: Percentage of authenticated users who view at least one organization profile per month.
- **Org view → repo list conversion**: Percentage of org views that result in navigating to the org's repository list within the same session. High conversion indicates the org overview is a useful discovery surface.
- **Org view → member list conversion**: Percentage of org views that result in viewing the member list. Indicates interest in organizational membership.
- **Org view → team list conversion**: Percentage of org views that result in viewing the team list. Indicates interest in team structure.
- **Org view → settings conversion**: Percentage of org views by owners that result in navigating to org settings. Indicates whether the view-then-configure flow is natural.
- **Client distribution**: Breakdown of org view requests by client surface (API, CLI, web, TUI).
- **Anonymous vs authenticated split**: Percentage of public org views from unauthenticated users. Monitor for abuse or organic traffic patterns.

### Success Indicators

- Org view API latency p50 < 20ms, p99 < 200ms (single-row lookup).
- Error rate < 0.1% of requests (excluding expected 400/403/404 responses).
- At least 70% of organizations that exist are viewed at least once within 30 days of creation.
- Org view → repo list conversion rate > 40% (indicates users find the org profile useful as a navigation hub).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Org view request received | `debug` | `org_name`, `viewer_user_id`, `request_id` |
| Organization resolved successfully | `debug` | `org_id`, `org_name`, `org_visibility`, `query_duration_ms`, `request_id` |
| Organization not found | `info` | `org_name`, `request_id` |
| Unauthenticated access to non-public org (404) | `info` | `org_name`, `request_id` |
| Authenticated non-member access to non-public org (403) | `info` | `org_name`, `viewer_user_id`, `request_id` |
| Empty org name parameter (400) | `info` | `request_id` |
| Unexpected error in org view | `error` | `org_name`, `viewer_user_id`, `error_message`, `error_stack`, `request_id` |

All log lines must include the `request_id` from the middleware for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_view_requests_total` | counter | `status_code`, `org_visibility` | Total org view requests |
| `codeplane_org_view_duration_seconds` | histogram | `org_visibility` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_org_view_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `bad_request`, `internal`) | Error breakdown |
| `codeplane_org_view_in_flight` | gauge | — | Number of currently in-flight org view requests |

### Alerts

#### Alert: `OrgViewHighErrorRate`
- **Condition**: `rate(codeplane_org_view_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries containing `org_view` context. Look for stack traces and error messages.
  2. Verify database connectivity — run `SELECT 1` on the primary database and check connection pool health (`codeplane_db_pool_active`, `codeplane_db_pool_idle`).
  3. Check if a specific organization is producing all errors by inspecting the `org_name` label on the error counter.
  4. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.getOrg` method.
  5. If the error involves the `resolveOrg` helper, verify that the `organizations` table has the expected index on `lower_name`.
  6. Check for database lock contention in `pg_locks` if queries are timing out.
  7. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgViewHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_view_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to a specific organization visibility level (`org_visibility` label).
  2. Run `EXPLAIN ANALYZE` on `SELECT ... FROM organizations WHERE lower_name = $1` to verify the index is being used.
  3. Check database connection pool utilization — pool exhaustion would affect all endpoints, not just org view.
  4. Check for lock contention in `pg_locks` or slow transactions holding row locks on the `organizations` or `org_members` tables.
  5. If latency is caused by the `requireOrgRole` membership check (non-public orgs), verify the index on the `org_members(organization_id, user_id)` composite key.
  6. Check system load (`node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`) on application and database hosts.

#### Alert: `OrgView404Spike`
- **Condition**: `rate(codeplane_org_view_errors_total{error_type="not_found"}[10m]) > 50`
- **Severity**: Info
- **Runbook**:
  1. Check if an organization was recently deleted or renamed, causing stale links or bookmarks to fail.
  2. Check if the spike is from a single IP or user agent (potential enumeration attack on org names).
  3. If the spike appears to be a bot or crawler scanning for organization names, verify that rate limiting is functioning correctly and consider IP-level throttling.
  4. If caused by a renamed organization, consider whether a redirect grace period should be implemented (not currently supported).
  5. No immediate action required for organic 404 traffic, but monitor for volume escalation.

#### Alert: `OrgViewSuddenSpike`
- **Condition**: `rate(codeplane_org_view_requests_total[5m]) > 10 * avg_over_time(rate(codeplane_org_view_requests_total[5m])[1h:5m])`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike is organic (new integration, customer onboarding) or potential abuse.
  2. Check if requests are concentrated on a single `org_name` or from a single source IP.
  3. If abuse is suspected, verify that rate limiting is functioning correctly.
  4. No immediate action required for organic spikes, but monitor for cascading latency impact on downstream services.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Query timeout on org lookup | 500 Internal Server Error | Check for missing index on `organizations(lower_name)` |
| Organizations table corrupted/missing | 500 Internal Server Error | Restore from backup; alert fires |
| Org_members table corrupted/missing | 500 Internal Server Error (on non-public org membership check) | Restore from backup; alert fires |
| Concurrent org deletion during view | 404 Not Found (org disappeared) | Expected behavior; no recovery needed |
| Concurrent visibility change during view | May return stale visibility or 403/404 depending on timing | Expected race condition; no recovery needed |
| Malformed path parameters (encoded nulls, extremely long strings) | 400 or 404 depending on validation stage | Expected behavior; log for monitoring |
| Memory pressure on application server | Degraded latency or OOM | Scale horizontally; restart pods |

## Verification

### API Integration Tests

#### Happy Path

- **`test: returns 200 with correct organization object for public org as authenticated viewer`** — Create a public org with name, description, website, and location. Call `GET /api/orgs/:org` as an authenticated org member. Assert 200. Assert all fields present with correct values: `id` (positive integer), `name`, `lower_name`, `description`, `visibility` = `"public"`, `website`, `location`, `created_at` (valid ISO 8601), `updated_at` (valid ISO 8601).
- **`test: returns 200 for public org as unauthenticated viewer`** — Create a public org. Call `GET /api/orgs/:org` with no auth. Assert 200 and correct response body.
- **`test: returns 200 for public org as authenticated non-member`** — Create a public org. Authenticate as a user who is NOT a member. Assert 200.
- **`test: returns 200 for limited org as org member`** — Create a limited-visibility org. Authenticate as org member. Assert 200 with `visibility` = `"limited"`.
- **`test: returns 200 for private org as org owner`** — Create a private org. Authenticate as org owner. Assert 200 with `visibility` = `"private"`.
- **`test: returns 200 for private org as org member`** — Create a private org. Add a second user as member. Authenticate as member. Assert 200.
- **`test: response for org with empty description returns empty string`** — Create org with empty description. View. Assert `description === ""`.
- **`test: response for org with empty website returns empty string`** — Create org with no website. View. Assert `website === ""`.
- **`test: response for org with empty location returns empty string`** — Create org with no location. View. Assert `location === ""`.
- **`test: viewing org does not modify it`** — View org, note `updated_at`. Wait 100ms. View again. Assert `updated_at` is unchanged.
- **`test: response is identical across consecutive requests`** — View org twice. Assert responses are deeply equal.
- **`test: org view after org update reflects updated data`** — Create org with description "v1". Update to "v2". View. Assert description is "v2".

#### Field Validation

- **`test: response has exactly the expected fields`** — View org. Assert response object keys are exactly: `id`, `name`, `lower_name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`. Assert no additional keys exist.
- **`test: id is a positive integer`** — View org. Assert `typeof response.id === 'number'` and `response.id > 0` and `Number.isInteger(response.id)`.
- **`test: name is a string`** — View org. Assert `typeof response.name === 'string'`.
- **`test: lower_name is lowercase form of name`** — Create org "MyOrg". View. Assert `response.lower_name === "myorg"`.
- **`test: visibility is one of public, limited, private`** — Create orgs with each visibility. View each. Assert visibility matches.
- **`test: visibility public returns "public"`** — Create org with "public". View. Assert `visibility === "public"`.
- **`test: visibility limited returns "limited"`** — Create org with "limited". View as member. Assert `visibility === "limited"`.
- **`test: visibility private returns "private"`** — Create org with "private". View as owner. Assert `visibility === "private"`.
- **`test: created_at is valid ISO 8601`** — View org. Assert `new Date(response.created_at).toISOString()` does not throw and produces valid date.
- **`test: updated_at is valid ISO 8601`** — View org. Assert `new Date(response.updated_at).toISOString()` does not throw.
- **`test: Content-Type header is application/json`** — View org. Assert response header `Content-Type` contains `application/json`.

#### Auth & Permission Tests

- **`test: returns 404 for nonexistent organization`** — Call `GET /api/orgs/nonexistent-org-xyz`. Assert 404 with message `"organization not found"`.
- **`test: returns 400 for empty org name`** — Call `GET /api/orgs/%20`. Assert 400 with message containing `"organization name is required"`.
- **`test: returns 404 for unauthenticated viewer of private org`** — Create a private org. Call without auth. Assert 404 (not 403) with message `"organization not found"`.
- **`test: returns 404 for unauthenticated viewer of limited org`** — Create a limited org. Call without auth. Assert 404.
- **`test: returns 403 for authenticated non-member of private org`** — Create a private org. Authenticate as non-member. Assert 403 with message containing `"organization membership required"`.
- **`test: returns 403 for authenticated non-member of limited org`** — Create a limited org. Authenticate as non-member. Assert 403.

#### Case-Insensitivity Tests

- **`test: org name is resolved case-insensitively (lowercase input)`** — Create org "MyOrg". Call `GET /api/orgs/myorg`. Assert 200 and `response.name === "MyOrg"`.
- **`test: org name is resolved case-insensitively (uppercase input)`** — Create org "MyOrg". Call `GET /api/orgs/MYORG`. Assert 200.
- **`test: org name is resolved case-insensitively (mixed case input)`** — Create org "MyOrg". Call `GET /api/orgs/mYoRg`. Assert 200.

#### Boundary & Edge Case Tests

- **`test: org name at maximum valid length (255 chars) works when org exists`** — Create org with 255-char name. View it. Assert 200 with correct name.
- **`test: org name exceeding 255 chars returns 404`** — Call `GET /api/orgs/<256-char-string>`. Assert 404.
- **`test: org with special characters in description returned correctly`** — Create org with description containing `<script>alert('xss')</script>`, `"double quotes"`, `\nnewlines`, unicode emoji 🚀. View org. Assert description is returned verbatim.
- **`test: org with URL in website field returned correctly`** — Create org with website `https://example.com/path?key=value&other=true`. View. Assert website matches exactly.
- **`test: org with unicode in location field returned correctly`** — Create org with location `東京都`. View. Assert location matches.
- **`test: org with maximum-length description (10000 chars) works`** — Create org with 10000-char description. View. Assert 200 and full description returned.
- **`test: org with description longer than 10000 chars is rejected`** — Attempt to create org with 10001-char description. Assert creation returns a validation error.

#### Concurrency Tests

- **`test: 50 concurrent GET requests for the same org all return 200`** — Create a public org. Send 50 concurrent requests. Assert all return 200 with identical data.
- **`test: view immediately after create returns consistent data`** — Create org. Immediately view. Assert 200 with correct data.
- **`test: view immediately after update returns updated data`** — Create org. Update description. Immediately view. Assert new description.

### CLI E2E Tests

- **`test: codeplane org view <name> returns JSON object`** — Create org "test-org" with description and visibility. Run `codeplane org view test-org`. Parse JSON output. Assert it is an object with correct `name`, `description`, `visibility`.
- **`test: codeplane org view output has all expected fields`** — Run `org view`. Parse JSON. Assert keys include `id`, `name`, `lower_name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`.
- **`test: codeplane org view with nonexistent org exits with error`** — Run `codeplane org view nonexistent-org-xyz`. Assert non-zero exit code and stderr contains error message.
- **`test: codeplane org view output matches API response`** — Create org. Call both CLI and API. Parse both JSON outputs. Assert they are structurally identical (same fields and values).
- **`test: codeplane org view without required arg errors`** — Run `codeplane org view` without the name arg. Assert error output indicating required argument.
- **`test: codeplane org view with --json field filter`** — Run `codeplane org view test-org --json name,visibility`. Assert output contains only filtered fields.
- **`test: codeplane org view for private org without auth fails`** — Create private org. Logout. Run `codeplane org view <name>`. Assert non-zero exit code with error message.

### Playwright Web UI E2E Tests (when fully implemented)

- **`test: org profile page renders org name as heading`** — Navigate to `/:org`. Assert `h1` or primary heading contains the org name.
- **`test: org profile page shows visibility badge`** — Create org with "private" visibility. Navigate to detail (as member). Assert a badge element with text "private" is visible.
- **`test: org profile page shows description`** — Create org with description. Navigate to detail. Assert description text is visible.
- **`test: org profile page shows empty description placeholder`** — Create org without description. Navigate to detail. Assert placeholder text "No description provided" is visible.
- **`test: org profile page shows website link`** — Create org with website. Navigate to detail. Assert website is rendered as clickable link.
- **`test: org profile page shows location`** — Create org with location. Navigate to detail. Assert location text is visible.
- **`test: org profile page shows timestamps`** — Navigate to org detail. Assert created and updated timestamps are displayed (relative time).
- **`test: org profile page shows repositories tab by default`** — Navigate to `/:org`. Assert repositories list is visible as the default tab.
- **`test: non-member of private org sees 404 page`** — Create private org. Authenticate as non-member. Navigate to `/:org`. Assert 404 state is rendered.
- **`test: unauthenticated user sees 404 for private org`** — Create private org. Logout. Navigate to `/:org`. Assert 404 UI.
- **`test: unauthenticated user can view public org`** — Create public org. Logout. Navigate to `/:org`. Assert org name is visible.
- **`test: org owner sees settings navigation`** — Authenticate as org owner. Navigate to `/:org`. Assert "Settings" tab/link is visible.
- **`test: org member does not see settings navigation`** — Authenticate as org member (not owner). Navigate to `/:org`. Assert "Settings" tab/link is not visible.
- **`test: tab navigation works (repos, members, teams)`** — Navigate to `/:org`. Click each tab. Assert URL updates and correct content loads.
- **`test: nonexistent org shows 404 state`** — Navigate to `/nonexistent-org-xyz`. Assert a 404 state is rendered.
- **`test: org profile page breadcrumb navigates home`** — Navigate to `/:org`. Click home breadcrumb. Assert navigation to home page.

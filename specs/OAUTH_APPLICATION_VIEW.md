# OAUTH_APPLICATION_VIEW

Specification for OAUTH_APPLICATION_VIEW.

## High-Level User POV

When you click on an OAuth2 application in your Settings → OAuth Applications list, or when you need to check the details of a specific integration you've registered, the application detail view gives you a complete picture of that application's configuration. This is where you go to verify a redirect URI before debugging an authorization flow, confirm which scopes your integration is permitted to request, or simply remind yourself of the client ID you need to embed in your application code.

The detail view shows everything you provided at registration time — the application's name, its client type (confidential or public), the full list of registered redirect URIs, and the maximum scopes the application can request — alongside system-generated metadata like the client ID, creation date, and last-updated timestamp. The client secret is never shown here. It was displayed exactly once when you created the application and is not retrievable afterward. If the detail view showed it, that would be a serious security violation.

This view serves as both a reference and a starting point for management actions. From here, you can see at a glance whether your application is configured correctly, copy the client ID to use in your integration code, or navigate to delete the application if it's no longer needed. You can also use the CLI (`jjhub auth oauth2 view <id>`) to fetch the same information in a terminal or script context — useful when you need to quickly check registration details during development or in CI/CD pipelines.

The application detail view is strictly scoped to your own applications. You can only view applications you created. Attempting to view another user's application — whether by guessing an ID or using a direct URL — returns a "not found" response, not an "access denied" response. This prevents enumeration attacks where an attacker could discover which application IDs exist by distinguishing between "forbidden" and "not found" errors.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can retrieve the full details of a specific OAuth2 application they own, via the API, Web UI, and CLI — with correct field rendering, ownership enforcement, security invariants, and predictable error handling for all edge cases below.

### Functional Criteria — API

- [ ] `GET /api/oauth2/applications/:id` returns `200 OK` with a JSON object containing the application's `id`, `client_id`, `name`, `redirect_uris`, `scopes`, `confidential`, `created_at`, and `updated_at`.
- [ ] The `client_secret` field is **never** present in the response. This is a hard security requirement.
- [ ] The `client_secret_hash` field is **never** present in the response. This is a hard security requirement.
- [ ] The `owner_id` field is **never** present in the response.
- [ ] The endpoint requires authentication. Unauthenticated requests receive `401 Unauthorized`.
- [ ] If the `:id` parameter is not a valid integer, the endpoint returns `400 Bad Request` with message `"invalid application id"`.
- [ ] If no application exists with the given ID, the endpoint returns `404 Not Found` with message `"oauth2 application not found"`.
- [ ] If an application exists with the given ID but belongs to a different user, the endpoint returns `404 Not Found` (not `403 Forbidden`) to prevent ID enumeration.
- [ ] The `id` field in the response is a number, not a string.
- [ ] The `client_id` field is a 40-character lowercase hexadecimal string.
- [ ] The `redirect_uris` field is always an array, never `null`.
- [ ] The `scopes` field is always an array, never `null`. An application with no scopes returns `scopes: []`.
- [ ] The `confidential` field is a boolean.
- [ ] `created_at` and `updated_at` are ISO 8601 formatted strings in UTC.
- [ ] The response `Content-Type` is `application/json`.
- [ ] Application names of exactly 255 characters are returned without truncation.
- [ ] Applications with multiple redirect URIs return the full array in original order.
- [ ] The returned data matches exactly what was provided at creation time (after trimming for `name`).

### Functional Criteria — Web UI

- [ ] Clicking an application row or "View" action in the OAuth Applications list navigates to the application detail page at `/settings/oauth-applications/:id`.
- [ ] The detail page displays: Application name, Client ID (full, with copy button), Client type ("Confidential" or "Public"), Redirect URIs (full list), Scopes (as badges), Created timestamp, and Last updated timestamp.
- [ ] The page title or heading is the application name.
- [ ] The client secret is never displayed on the detail page.
- [ ] A "Delete" action is available on the detail page.
- [ ] A "Back to applications" link navigates back to the application list.
- [ ] If the application does not exist or does not belong to the user, the page shows a "Not found" state.
- [ ] Unauthenticated visitors are redirected to the login page with a return URL.

### Functional Criteria — CLI

- [ ] `jjhub auth oauth2 view <id>` displays the application details in human-readable format.
- [ ] `jjhub auth oauth2 view <id> --json` outputs the raw JSON response from the API.
- [ ] If the application is not found, the CLI prints an error and exits with code 1.
- [ ] The client secret is never printed in the view output.
- [ ] The command requires authentication. If not authenticated, the CLI prints an error and exits with code 1.

### Edge Cases

- [ ] **Non-integer ID**: `GET /api/oauth2/applications/abc` → `400 Bad Request` with `"invalid application id"`.
- [ ] **Negative integer ID**: `GET /api/oauth2/applications/-1` → `404 Not Found`.
- [ ] **Zero ID**: `GET /api/oauth2/applications/0` → `404 Not Found`.
- [ ] **Very large integer ID**: `GET /api/oauth2/applications/999999999999` → `404 Not Found`.
- [ ] **Float ID**: `GET /api/oauth2/applications/1.5` → parsed via `parseInt` as `1`; resolves to looking up ID `1`.
- [ ] **Application with zero scopes**: Response has `scopes: []`, not `null` or omitted.
- [ ] **Application with unicode name**: Full unicode name returned without encoding artifacts.
- [ ] **Application with 255-character name**: Full name returned without truncation.
- [ ] **Concurrent deletion while viewing**: If the application is deleted between page load and API call, the API returns `404` and the UI shows a "not found" state.
- [ ] **Viewing immediately after creation**: The application is viewable via GET immediately after POST creation succeeds.
- [ ] **Session expired mid-view**: Subsequent refresh returns `401` and the Web UI redirects to login.

### Boundary Constraints

- [ ] Application ID: Positive integer. Parsed via `parseInt(id, 10)`. `NaN` results in `400`.
- [ ] Application name: 1–255 characters after trimming. Unicode allowed. Returned verbatim.
- [ ] Client ID format: Exactly 40 lowercase hexadecimal characters.
- [ ] Redirect URIs: Always an array. Each entry is a string URL.
- [ ] Scopes: Always an array. May be empty. Each entry is a valid scope string from the JJHub scope vocabulary.
- [ ] Confidential: Boolean. Always present.
- [ ] Timestamps: ISO 8601 UTC strings.

## Design

### API Shape

**Endpoint:** `GET /api/oauth2/applications/:id`

**Authentication:** Required. Session cookie or PAT `Authorization: Bearer` header.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | integer | The application's numeric ID |

**Request:** No query parameters. No request body.

**Success response — `200 OK`:**

```json
{
  "id": 42,
  "client_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "name": "My Integration",
  "redirect_uris": ["https://myapp.example.com/callback"],
  "scopes": ["read:repository", "read:user"],
  "confidential": true,
  "created_at": "2026-03-21T10:00:00.000Z",
  "updated_at": "2026-03-21T10:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique application identifier |
| `client_id` | string | 40-character hex string used in OAuth2 flows |
| `name` | string | Human-readable name shown on consent screen |
| `redirect_uris` | string[] | Registered callback URLs |
| `scopes` | string[] | Maximum scopes the application can request |
| `confidential` | boolean | Whether the client can securely store a secret |
| `created_at` | string | ISO 8601 UTC creation timestamp |
| `updated_at` | string | ISO 8601 UTC last-update timestamp |

**Error responses:**

| Status | Condition | Body shape |
|--------|-----------|------------|
| `400` | `:id` is not a parseable integer | `{ "message": "invalid application id" }` |
| `401` | No auth session/token | `{ "message": "authentication required" }` |
| `404` | Application not found or belongs to another user | `{ "message": "oauth2 application not found" }` |
| `500` | Database read failure | `{ "message": "internal server error" }` |

**Notable API contract properties:**

- The `client_secret` field is never present. This is a security invariant.
- The `client_secret_hash` field is never present. This is a security invariant.
- The `owner_id` field is never present. Ownership is enforced server-side but not exposed.
- Requesting another user's application returns `404`, identical to a non-existent ID.

### SDK Shape

The `OAuth2Service.getApplication(appID, ownerID)` method in `@jjhub/sdk` encapsulates the business logic:

- Accepts `appID: number` and `ownerID: number`
- Returns `OAuth2ApplicationResponse` (never includes `client_secret`)
- Throws `notFound("oauth2 application not found")` if the application does not exist
- Throws `notFound("oauth2 application not found")` if the application's `owner_id` does not match `ownerID` (same error to prevent enumeration)
- Uses `toOAuth2ApplicationResponse()` to strip internal fields (`client_secret_hash`, `owner_id`) from the database row

### CLI Command

**Command:** `jjhub auth oauth2 view <id>`

**Aliases:** `jjhub auth oauth2 get <id>`

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | The application's numeric ID |

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | `false` | Output raw JSON response |

**Example:**

```bash
jjhub auth oauth2 view 42
```

**Human-readable output:**

```
OAuth2 Application: My Integration

Client ID:      a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
Client Type:    Confidential
Scopes:         read:repository, read:user
Redirect URIs:  https://myapp.example.com/callback
Created:        2026-03-21T10:00:00.000Z
Updated:        2026-03-21T10:00:00.000Z
```

**JSON output** (with `--json`): Returns the full `OAuth2ApplicationResponse` object as JSON.

**Exit codes:**

| Code | Meaning |
|------|--------|
| 0 | Success |
| 1 | Authentication failure, not found, or API error |

**Error messages:**

- Not found: `"Error: OAuth2 application not found"`
- Invalid ID: `"Error: invalid application id — provide a numeric ID"`
- Unauthenticated: `"Error: authentication required — run 'jjhub auth login' first"`

The CLI also supports the raw `api` subcommand:

```bash
jjhub api /api/oauth2/applications/42
```

### Web UI Design

**Route:** `/settings/oauth-applications/:id`

**Page layout:**

1. **Breadcrumb:** Settings > OAuth Applications > {Application Name}
2. **Page heading:** The application name as an `<h1>`, with a "Confidential" or "Public" badge next to it.
3. **Detail card** with the following fields displayed as a labeled key-value layout:

| Label | Content | Behavior |
|-------|---------|----------|
| Client ID | Full 40-character hex string | Copy-to-clipboard button adjacent |
| Client Type | "Confidential" or "Public" | Badge/pill styling |
| Redirect URIs | Full list of URIs, one per line | Each URI is a clickable link (opens in new tab) |
| Scopes | Scope badges/pills | All scopes visible, grouped by domain if > 6 |
| Created | Relative timestamp (e.g., "3 days ago") | Tooltip shows full ISO 8601 date |
| Last updated | Relative timestamp | Tooltip shows full ISO 8601 date |

4. **Actions section:**
   - "Delete application" danger button → opens a confirmation dialog: "Are you sure you want to delete {name}? This will immediately revoke all active tokens issued by this application. This action cannot be undone."
   - "Back to applications" link → navigates to `/settings/oauth-applications`

5. **Security notice:** A subtle callout below the detail card: "The client secret was shown once at creation time and cannot be retrieved. If you've lost it, delete this application and create a new one."

**Loading state:** Skeleton layout matching the detail card fields.

**Not-found state:** If the API returns 404, display a centered message: "Application not found" with a "Back to OAuth Applications" link.

**Error state:** If the API returns 500 or a network error, display an error banner with a "Retry" button.

### TUI UI

The TUI does not currently have a dedicated OAuth2 application detail screen. This is a known gap. When implemented, it should display the application detail fields in a vertical key-value layout and support keyboard navigation for copy and delete actions.

### Documentation

The following end-user documentation should exist:

1. **OAuth2 Applications guide** (`/docs/guides/oauth2-applications`): Add or update a "Viewing Application Details" section covering how to view an application's details from the Web UI (navigate to Settings → OAuth Applications → click application name), how to view via CLI (`jjhub auth oauth2 view <id>`), what each field means, and a note that the client secret is never shown again after creation.

2. **CLI reference** (`/docs/cli/auth-oauth2-view`): Document the `auth oauth2 view` command with synopsis, argument description (`id`), flag descriptions (`--json`), human-readable and JSON output examples, error message descriptions, and exit code reference.

3. **API reference** (`/docs/api/oauth2-applications`): Ensure the `GET /api/oauth2/applications/:id` endpoint is documented with request/response examples, error responses, and the security note about secret omission.

## Permissions & Security

### Authorization Requirements

| Role | Access |
|------|--------|
| Authenticated user (session cookie) | Can view their own OAuth2 applications |
| Authenticated user (PAT) | Can view their own OAuth2 applications |
| Other authenticated user | Cannot view — returns `404 Not Found` (same as non-existent) |
| Admin | Cannot view another user's applications through this endpoint |
| OAuth2 token holder (third-party) | Cannot view applications — this endpoint requires first-party auth (PAT or session), not third-party OAuth2 tokens |
| Unauthenticated / Anonymous | Rejected with `401 Unauthorized` |

### Rate Limiting

- **Standard authenticated read rate limit** applies: 60 requests per minute per user, consistent with other read endpoints.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are returned on every response.
- No special elevated or reduced rate limit for this endpoint.
- **Brute-force enumeration protection**: Because the endpoint returns `404` for both non-existent and unauthorized applications, an attacker scanning sequential IDs cannot distinguish between "exists but not mine" and "does not exist." The standard rate limiter prevents high-volume scanning.

### Data Privacy and PII Constraints

- **Client secrets are never returned.** The `client_secret` was shown once at creation. The `client_secret_hash` is stored in the database but is never present in any API response.
- **Client IDs are sensitive but not secret.** They identify the application but cannot be used alone to authenticate. The detail page shows the full client ID because the user is the owner and needs it for integration development.
- **Redirect URIs may contain internal infrastructure URLs** (e.g., staging environments, internal hostnames). They are only visible to the application owner.
- **Application names may contain PII** or internal project names. Only visible to the application owner.
- **The `owner_id` is never returned** in the response body. Ownership is enforced server-side.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When fired |
|-------|-----------|------------|
| `OAuth2ApplicationViewed` | `application_id`, `client_id`, `owner_id`, `surface` (`web` / `cli` / `api`), `confidential`, `timestamp` | On successful `200` response |
| `OAuth2ApplicationViewNotFound` | `requested_id`, `user_id`, `surface`, `reason` (`not_exists` / `not_owner`), `timestamp` | On `404` response |
| `OAuth2ApplicationViewFailed` | `requested_id`, `user_id`, `error_code`, `timestamp` | On `400`, `401`, or `500` response |
| `OAuth2ApplicationClientIdCopied` | `application_id`, `user_id`, `surface` (`web`), `timestamp` | User clicks copy button for client ID on detail page |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| View-to-delete conversion | % of `OAuth2ApplicationViewed` events followed by `OAuth2ApplicationDeleted` within 10 minutes | Monitored, no initial target |
| View-to-authorize conversion | % of `OAuth2ApplicationViewed` events where the same `client_id` is used in an authorization code flow within 24 hours | > 20% |
| View frequency per application | Average number of times each application is viewed per week | Monitored — high values suggest users are looking up details they should have bookmarked |
| Client ID copy rate | % of web `OAuth2ApplicationViewed` events where `OAuth2ApplicationClientIdCopied` fires within the same session | > 15% |

### Success Indicators

- Low `OAuth2ApplicationViewNotFound` rate relative to total view attempts (< 10%) — indicates users are navigating to valid applications via the list, not guessing IDs.
- Low `OAuth2ApplicationViewFailed` rate (< 2%) — indicates infrastructure stability.
- Growing absolute view volume month-over-month — indicates healthy OAuth2 ecosystem adoption.
- Healthy view-to-authorize conversion — indicates developers are actively using the detail view as part of their integration development workflow.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| `oauth2.application.view.success` | `info` | `user_id`, `application_id`, `client_id`, `duration_ms` | Successful `200` response |
| `oauth2.application.view.not_found` | `info` | `user_id`, `requested_id`, `duration_ms` | Application does not exist |
| `oauth2.application.view.not_owner` | `warn` | `user_id`, `requested_id`, `actual_owner_id`, `duration_ms` | Application exists but belongs to another user |
| `oauth2.application.view.invalid_id` | `warn` | `user_id`, `raw_id_param`, `request_id` | `:id` is not a parseable integer |
| `oauth2.application.view.unauthorized` | `warn` | `request_id`, `ip`, `user_agent` | Unauthenticated request |
| `oauth2.application.view.error` | `error` | `user_id`, `requested_id`, `error_message`, `stack_trace`, `duration_ms` | Database or service-layer failure |

**Critical logging rules:**

- The raw `client_secret` must NEVER appear in any log at any level.
- The `actual_owner_id` in the "not owner" log is logged at `warn` level for security auditing, but the user-facing response does not distinguish between "not found" and "not owner."
- Application `name` should be truncated in logs to prevent log injection via long names.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `jjhub_oauth2_application_view_total` | Counter | `status` (`success`, `not_found`, `invalid_id`, `unauthorized`, `error`) | Total view requests by outcome |
| `jjhub_oauth2_application_view_duration_seconds` | Histogram | `status` | Response time distribution for the view endpoint |

### Alerts

#### Alert: `OAuth2ApplicationViewHighErrorRate`

**Condition:** `rate(jjhub_oauth2_application_view_total{status="error"}[5m]) / rate(jjhub_oauth2_application_view_total[5m]) > 0.05`

**Severity:** Warning

**Runbook:**

1. Check `oauth2.application.view.error` structured logs for the most recent error messages and stack traces.
2. Verify database connectivity: run a simple health check query against the primary database.
3. Check if the `oauth2_applications` table exists and the primary key index is intact.
4. Check for recent deployments that may have introduced a schema mismatch or query regression in `getOAuth2ApplicationByID`.
5. If the database is healthy, check for OOM conditions or connection pool exhaustion on the server.
6. If the error rate is climbing and correlated with high request volume, check whether a single user is triggering rapid requests (possible automated tooling misconfiguration).
7. Escalate to the platform team if database issues are confirmed.

#### Alert: `OAuth2ApplicationViewHighLatency`

**Condition:** `histogram_quantile(0.95, rate(jjhub_oauth2_application_view_duration_seconds_bucket[5m])) > 1`

**Severity:** Warning

**Runbook:**

1. Check database query performance: the `getOAuth2ApplicationByID` query is a simple SELECT by primary key. If this is slow, investigate table bloat, lock contention, or missing index.
2. Check server CPU and memory utilization for resource contention.
3. Check for elevated request volume that may be causing queuing in the middleware stack.
4. If latency is isolated to a single instance, consider restarting it.
5. If latency persists, profile the query path to identify the bottleneck.

#### Alert: `OAuth2ApplicationViewEnumerationAttempt`

**Condition:** `sum(rate(jjhub_oauth2_application_view_total{status="not_found"}[5m])) by (user_id) > 10`

**Severity:** Info

**Runbook:**

1. Review the `oauth2.application.view.not_found` and `oauth2.application.view.not_owner` logs for the user(s) triggering the spike.
2. Determine if the pattern suggests legitimate behavior (e.g., a user with a stale bookmark or broken integration link) or enumeration (e.g., sequential ID scanning).
3. If enumeration is suspected, review the source IPs and user agents.
4. If a single user is scanning aggressively, consider temporarily disabling their account and investigating further.
5. Confirm the rate limiter is functioning — rapid `404` responses from the same user should hit the rate limit ceiling.
6. No action needed if the spike is transient and self-resolving.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Shape | Recovery |
|------------|-------------|-------------|----------|
| Non-integer `:id` parameter | 400 | `{ "message": "invalid application id" }` | Provide a valid integer ID |
| Unauthenticated request | 401 | `{ "message": "authentication required" }` | Authenticate via session cookie or PAT |
| Application does not exist | 404 | `{ "message": "oauth2 application not found" }` | Verify the application ID is correct |
| Application belongs to another user | 404 | `{ "message": "oauth2 application not found" }` | Users can only view their own applications |
| Rate limit exceeded | 429 | Rate limit response | Wait for `Retry-After` duration |
| Database read failure | 500 | `{ "message": "internal server error" }` | Retry; if persistent, escalate to ops |
| Network timeout (client) | — | Client-side timeout | Client shows error state with retry button |

## Verification

### API Integration Tests

- [ ] **Happy path — view existing application**: Create an application, `GET /api/oauth2/applications/:id` → `200 OK` with complete response shape.
- [ ] **Response shape validation**: Verify response contains exactly: `id` (number), `client_id` (string, 40 hex chars), `name` (string), `redirect_uris` (array), `scopes` (array), `confidential` (boolean), `created_at` (ISO 8601 string), `updated_at` (ISO 8601 string).
- [ ] **Client secret never present**: Create an application, view it, verify `client_secret` is `undefined` in the response.
- [ ] **Client secret hash never present**: View an application, verify `client_secret_hash` is `undefined` in the response.
- [ ] **Owner ID never present**: View an application, verify `owner_id` is `undefined` in the response.
- [ ] **Client ID format**: Verify `client_id` matches `/^[0-9a-f]{40}$/`.
- [ ] **ID is a number**: Verify `typeof response.id === "number"`.
- [ ] **Confidential is a boolean**: Verify `typeof response.confidential === "boolean"`.
- [ ] **Timestamps are ISO 8601**: Verify `created_at` and `updated_at` match ISO 8601 pattern and parse correctly with `new Date()`.
- [ ] **View confidential application**: Create a confidential application, view it, verify `confidential: true`.
- [ ] **View public application**: Create a public application, view it, verify `confidential: false`.
- [ ] **View application with scopes**: Create with `scopes: ["read:repository", "write:user"]`, view, verify `scopes` matches.
- [ ] **View application with empty scopes**: Create with `scopes: []`, view, verify `scopes: []`.
- [ ] **View application with omitted scopes**: Create without scopes field, view, verify `scopes: []`.
- [ ] **View application with single redirect URI**: Create with one URI, view, verify `redirect_uris` contains exactly that URI.
- [ ] **View application with multiple redirect URIs**: Create with 5 URIs, view, verify all 5 are returned in order.
- [ ] **View application with maximum name length (255 chars)**: Create with `"a".repeat(255)`, view, verify the full 255-char name is returned.
- [ ] **View application with single-character name**: Create with `name: "X"`, view, verify `name: "X"`.
- [ ] **View application with unicode name**: Create with `name: "🚀 My App 中文"`, view, verify unicode preserved.
- [ ] **View application with trimmed name**: Create with `name: "  Padded  "`, view, verify `name: "Padded"` (trimmed at creation).
- [ ] **View application with custom-scheme redirect URI**: Create with `redirect_uris: ["myapp://callback"]`, view, verify URI preserved.
- [ ] **View application with localhost redirect URI**: Create with `redirect_uris: ["http://localhost:3000/cb"]`, view, verify URI preserved.
- [ ] **Non-integer ID parameter**: `GET /api/oauth2/applications/abc` → `400` with `"invalid application id"`.
- [ ] **Alphabetic ID**: `GET /api/oauth2/applications/xyz` → `400`.
- [ ] **Special characters in ID**: `GET /api/oauth2/applications/1;DROP` → `400`.
- [ ] **Negative integer ID**: `GET /api/oauth2/applications/-1` → `404`.
- [ ] **Zero ID**: `GET /api/oauth2/applications/0` → `404`.
- [ ] **Very large integer ID**: `GET /api/oauth2/applications/999999999999` → `404`.
- [ ] **Non-existent valid ID**: `GET /api/oauth2/applications/99999` (no application with this ID) → `404`.
- [ ] **Ownership isolation — other user's application**: User A creates an application. User B calls `GET /api/oauth2/applications/:id` with User A's application ID → `404 Not Found`.
- [ ] **Ownership isolation — same error message**: Verify the `404` error message for "other user's app" is identical to "non-existent app" → both return `{ "message": "oauth2 application not found" }`.
- [ ] **Unauthenticated request**: `GET /api/oauth2/applications/1` with no auth → `401`.
- [ ] **View after deletion**: Create application, delete it, attempt to view → `404`.
- [ ] **View immediately after creation**: Create application, immediately view by returned `id` → `200` with matching data.
- [ ] **Data consistency — matches creation response**: Create an application, compare the creation response (minus `client_secret`) with the view response → all fields match exactly.
- [ ] **Data consistency — matches list response**: Create an application, view it, list all applications → the application in the list has the same fields as the view response.
- [ ] **Rate limiting**: Send 61 GET requests for the same application in rapid succession → the 61st receives `429`.

### CLI Integration Tests

- [ ] **CLI view — human output**: Create an application via API, run `jjhub auth oauth2 view <id>`, verify stdout contains the application name, client ID, client type, scopes, redirect URIs, and timestamps.
- [ ] **CLI view — JSON output**: Create an application, run `jjhub auth oauth2 view <id> --json`, parse stdout as JSON, verify it matches the API response shape.
- [ ] **CLI view — not found**: Run `jjhub auth oauth2 view 99999` → exit code 1, stderr contains "not found".
- [ ] **CLI view — invalid ID**: Run `jjhub auth oauth2 view abc` → exit code 1, stderr contains error about invalid ID.
- [ ] **CLI view — unauthenticated**: Run `jjhub auth oauth2 view 1` without credentials → exit code 1, stderr contains authentication error.
- [ ] **CLI view — no client_secret in output**: Create an application, run `jjhub auth oauth2 view <id> --json`, parse JSON, verify `client_secret` is absent.
- [ ] **CLI view via `api` subcommand**: `jjhub api /api/oauth2/applications/<id>` → exit code 0, valid JSON response without `client_secret`.
- [ ] **CLI view — `get` alias**: `jjhub auth oauth2 get <id>` → same output as `jjhub auth oauth2 view <id>`.

### E2E Tests — Playwright (Web UI)

- [ ] **Navigate to application detail from list**: Log in, create an application via API, navigate to `/settings/oauth-applications`, click the application row → navigates to `/settings/oauth-applications/:id` with correct content.
- [ ] **Detail page displays all fields**: Verify the detail page shows: application name as heading, client ID with copy button, client type badge, redirect URIs list, scopes badges, created timestamp, and updated timestamp.
- [ ] **Client ID copy button**: Click the copy button next to the client ID, verify clipboard contains the full 40-character client ID.
- [ ] **Client secret not displayed**: Verify no element on the detail page contains or references a client secret value.
- [ ] **Security notice visible**: Verify the page contains text about the client secret being shown only once at creation.
- [ ] **Back to applications link**: Click "Back to applications" → navigates to `/settings/oauth-applications`.
- [ ] **Delete button present**: Verify a "Delete application" button or link is visible on the detail page.
- [ ] **Delete confirmation dialog**: Click "Delete application" → a confirmation dialog appears with a warning about token revocation.
- [ ] **Delete from detail page**: Confirm deletion → application is deleted and user is redirected to the application list. The deleted application is no longer in the list.
- [ ] **Not-found state**: Navigate to `/settings/oauth-applications/99999` → page shows "Application not found" message with a link back to the list.
- [ ] **Loading skeleton**: Intercept the API call to delay it, verify a skeleton layout appears while loading.
- [ ] **Error state with retry**: Intercept the API call to return 500, verify an error banner appears, click "Retry", verify the request is resent.
- [ ] **Unauthenticated redirect**: Visit `/settings/oauth-applications/1` without being logged in → redirected to login page.
- [ ] **Breadcrumb navigation**: Verify breadcrumb shows Settings > OAuth Applications > {App Name}, and clicking "OAuth Applications" navigates back to the list.
- [ ] **Confidential badge**: View a confidential application → badge shows "Confidential".
- [ ] **Public badge**: View a public application → badge shows "Public".
- [ ] **Multiple redirect URIs**: View an application with 4 redirect URIs → all 4 URIs visible on the detail page.
- [ ] **Multiple scopes**: View an application with 6 scopes → all 6 scopes displayed as badges.
- [ ] **Relative timestamp with tooltip**: Verify "Created" shows relative time (e.g., "just now"), hover shows full ISO date in tooltip.
- [ ] **Long application name**: View an application with a 255-character name → full name displayed as the heading without truncation.
- [ ] **Unicode application name**: View an application with emoji/CJK name → renders correctly without encoding artifacts.

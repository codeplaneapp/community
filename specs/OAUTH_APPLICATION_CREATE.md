# OAUTH_APPLICATION_CREATE

Specification for OAUTH_APPLICATION_CREATE.

## High-Level User POV

When you want to let a third-party application — a web app you're building, a mobile client, a CI/CD pipeline, or a bot — access Codeplane on behalf of your users, you register an OAuth2 application. This is fundamentally different from creating a Personal Access Token. A PAT represents your own first-party access; an OAuth2 application represents a separate application that will ask individual users for permission before acting on their behalf.

You register an OAuth2 application from the web UI's Settings > OAuth Applications page, via the API, or using the CLI. You provide a human-readable name — something like "My Dashboard App" or "Mobile Client" — that users will see on the consent screen when they authorize your application. You also provide one or more redirect URIs where Codeplane will send users back after they grant or deny access, and optionally a set of maximum scopes that define the upper bound of what your application can ever request.

You must also choose whether your application is a confidential client or a public client. Confidential clients — like server-side web applications — can securely store a client secret. Public clients — like single-page apps, mobile apps, CLI tools, and desktop apps — cannot safely store secrets and must use PKCE (Proof Key for Code Exchange) for every authorization request instead.

After you confirm, Codeplane generates a unique client ID and, for confidential clients, a client secret. The client secret is displayed exactly once at creation time — you must copy it immediately because Codeplane only stores a hash and cannot show it again. If you lose it, you must regenerate a new one. The client ID is always visible in your application list and is safe to embed in client-side code.

Your newly registered application is immediately ready to initiate OAuth2 authorization code flows. Users visiting your application will be redirected to Codeplane's consent screen showing your application's name and requested scopes, and they can approve or deny access on a per-user basis. Every access token issued through your application is scoped, time-limited, and revocable — giving both you and your users fine-grained control over what your application can do.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can register a new OAuth2 application through the API, Web UI, and CLI, receive a client ID and one-time client secret, and subsequently use those credentials to initiate OAuth2 authorization code flows — with all validation, security, and edge cases below handled correctly.

### Functional Criteria

- [ ] An authenticated user can create an OAuth2 application via `POST /api/oauth2/applications` with `name`, `redirect_uris`, and `confidential` fields.
- [ ] The server returns `201 Created` with a response body containing `id`, `client_id`, `client_secret`, `name`, `redirect_uris`, `scopes`, `confidential`, `created_at`, and `updated_at`.
- [ ] The `client_id` field is a 40-character lowercase hexadecimal string generated from 20 bytes of cryptographic randomness.
- [ ] The `client_secret` field matches the format `codeplane_oas_` followed by exactly 64 lowercase hexadecimal characters (total length: 74 characters).
- [ ] Only the SHA-256 hash of the client secret is stored in the database — the raw secret is never persisted.
- [ ] The `client_secret` is returned exactly once in the creation response. It does not appear in any subsequent list, get, or other API response.
- [ ] The created application is immediately usable for OAuth2 authorization code flows after creation.
- [ ] The created application appears in the user's application list (`GET /api/oauth2/applications`) with correct `id`, `client_id`, `name`, `redirect_uris`, `scopes`, `confidential`, `created_at`, and `updated_at` — but no `client_secret`.
- [ ] The `name` field is trimmed of leading and trailing whitespace before storage.
- [ ] Multiple applications with the same name are allowed — application names are not required to be unique.
- [ ] Each application creation produces a cryptographically distinct `client_id` and `client_secret`, even when called with identical parameters.
- [ ] The `scopes` field is optional and defaults to an empty array when not provided.
- [ ] The `confidential` field is required and must be explicitly provided as a boolean.
- [ ] The `redirect_uris` field is required and must contain at least one valid URI.
- [ ] Each redirect URI must include a protocol (scheme) and host.
- [ ] `created_at` and `updated_at` are returned in ISO 8601 format.
- [ ] A user can create an application while authenticated via session cookie (browser) or via a Personal Access Token.

### Edge Cases

- [ ] **Empty name**: `name: ""` → `422 Unprocessable Entity` with a validation error on field `name`, code `missing_field`.
- [ ] **Whitespace-only name**: `name: "   "` → `422` — a name consisting only of whitespace is treated as empty after trimming.
- [ ] **Name at maximum length (255 chars)**: `name: "a".repeat(255)` → `201 Created` — the application is created successfully.
- [ ] **Name exceeding maximum length (256 chars)**: `name: "a".repeat(256)` → `422` with validation error on field `name`, code `invalid`.
- [ ] **Single-character name**: `name: "X"` → `201 Created`.
- [ ] **Unicode characters in name (emoji, CJK)**: `name: "🚀 My App"` → `201 Created` — unicode is preserved.
- [ ] **Name with leading/trailing whitespace**: `name: "  My App  "` → `201 Created` with `name: "My App"` in the response (trimmed).
- [ ] **Empty redirect_uris array**: `redirect_uris: []` → `422` with validation error on field `redirect_uris`, code `missing_field`.
- [ ] **Missing redirect_uris field**: `{ name: "test", confidential: true }` → `422` with validation error on field `redirect_uris`, code `missing_field`.
- [ ] **Null redirect_uris**: `redirect_uris: null` → `422`.
- [ ] **Single valid redirect URI**: `redirect_uris: ["https://example.com/callback"]` → `201 Created`.
- [ ] **Multiple valid redirect URIs**: `redirect_uris: ["https://example.com/callback", "https://staging.example.com/callback"]` → `201 Created`.
- [ ] **Redirect URI missing scheme**: `redirect_uris: ["example.com/callback"]` → `422` with validation error on field `redirect_uris[0]`, code `invalid`.
- [ ] **Redirect URI missing host**: `redirect_uris: ["https://"]` → `422` with validation error on field `redirect_uris[0]`, code `invalid`.
- [ ] **Redirect URI with custom scheme**: `redirect_uris: ["myapp://callback"]` → `201 Created` — custom schemes for mobile/desktop apps are valid.
- [ ] **Redirect URI as localhost**: `redirect_uris: ["http://localhost:3000/callback"]` → `201 Created`.
- [ ] **One valid, one invalid redirect URI**: `redirect_uris: ["https://example.com/cb", "not-a-url"]` → `422` with validation error on field `redirect_uris[1]`, code `invalid`. No application is created.
- [ ] **Missing confidential field**: `{ name: "test", redirect_uris: ["https://example.com/cb"] }` → `422` with validation error on field `confidential`, code `missing_field`.
- [ ] **Null confidential**: `{ name: "test", redirect_uris: [...], confidential: null }` → `422`.
- [ ] **Confidential true**: `confidential: true` → `201 Created` with `confidential: true`.
- [ ] **Confidential false**: `confidential: false` → `201 Created` with `confidential: false`.
- [ ] **Scopes provided**: `scopes: ["read:repository", "read:user"]` → `201 Created` with scopes preserved.
- [ ] **Scopes omitted**: → `201 Created` with `scopes: []`.
- [ ] **Empty scopes array**: `scopes: []` → `201 Created` with `scopes: []`.
- [ ] **Empty JSON body**: `{}` → `422`.
- [ ] **Non-JSON body**: Plain text body → `400 Bad Request` with `"invalid request body"`.
- [ ] **Unauthenticated request**: No session or token → `401 Unauthorized`.
- [ ] **Rapid successive creations**: Creating 10 applications in quick succession → all succeed independently, each with a unique `client_id` and `client_secret`.
- [ ] **Concurrent creation requests**: 5 parallel `POST /api/oauth2/applications` → all succeed; no database constraint violations or client ID collisions.
- [ ] **Database write failure during creation**: → `500 Internal Server Error` — no partial application record is created.

### Boundary Constraints

- [ ] Application name: 1–255 characters after trimming. Unicode allowed.
- [ ] Redirect URIs: At least 1 required. Each must be a parseable URL with a non-empty scheme and host. No maximum URI count enforced at the application level.
- [ ] `confidential`: Required boolean. No default.
- [ ] `scopes`: Optional string array. Defaults to `[]`.
- [ ] `client_id`: Exactly 40 lowercase hexadecimal characters.
- [ ] `client_secret`: Exactly `codeplane_oas_` prefix + 64 lowercase hexadecimal characters = 74 characters total.

## Design

### API Shape

**Endpoint**: `POST /api/oauth2/applications`

**Authentication**: Required. Session cookie or PAT.

**Request body** (JSON):
```json
{
  "name": "My Integration",
  "redirect_uris": ["https://myapp.example.com/callback"],
  "scopes": ["read:repository", "read:user"],
  "confidential": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable name shown on the consent screen. 1–255 chars after trimming. |
| `redirect_uris` | string[] | Yes | Allowed callback URLs. Each must be a valid URL with scheme and host. |
| `scopes` | string[] | No | Maximum scopes the application can request. Defaults to `[]`. |
| `confidential` | boolean | Yes | Whether the client can store a secret. `true` for server-side apps, `false` for SPAs/mobile/CLI. |

**Success response**: `201 Created`
```json
{
  "id": 42,
  "client_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "client_secret": "codeplane_oas_64hexcharshere...",
  "name": "My Integration",
  "redirect_uris": ["https://myapp.example.com/callback"],
  "scopes": ["read:repository", "read:user"],
  "confidential": true,
  "created_at": "2026-03-21T10:00:00.000Z",
  "updated_at": "2026-03-21T10:00:00.000Z"
}
```

**Error responses**:

| Status | Condition | Body shape |
|--------|-----------|------------|
| `400` | Non-JSON body or unparseable JSON | `{ "message": "invalid request body" }` |
| `401` | No auth session/token | `{ "message": "authentication required" }` |
| `422` | Validation failure | `{ "message": "Validation Failed", "errors": [{ "resource": "OAuth2Application", "field": "<field>", "code": "<code>" }] }` |
| `500` | Database write failure | `{ "message": "failed to create oauth2 application" }` |

### SDK Shape

The `OAuth2Service.createApplication(ownerID, req)` method in `@codeplane/sdk` encapsulates the business logic:

- Accepts `CreateOAuth2ApplicationRequest` (`name`, `redirect_uris`, `scopes?`, `confidential?`)
- Returns `CreateOAuth2ApplicationResult` extending `OAuth2ApplicationResponse` with the one-time `client_secret`
- Throws structured `APIError` for all validation and system failures
- Generates `client_id` (40 hex chars from 20 random bytes) and `client_secret` (`codeplane_oas_` + 64 hex chars from 32 random bytes)
- Stores only the SHA-256 hash of the secret

### CLI Command

**Command**: `codeplane auth oauth2 create`

**Flags**:

| Flag | Short | Required | Description |
|------|-------|----------|-------------|
| `--name` | `-n` | Yes | Application name |
| `--redirect-uri` | `-r` | Yes | Redirect URI (repeatable for multiple URIs) |
| `--scopes` | `-s` | No | Comma-separated scope list |
| `--confidential` | | No | Mark as confidential client (default behavior) |
| `--public` | | No | Mark as public client |

**Example**:
```bash
codeplane auth oauth2 create \
  --name "My Integration" \
  --redirect-uri "https://myapp.example.com/callback" \
  --scopes "read:repository,read:user" \
  --confidential
```

**Output** (standard):
```
Created OAuth2 application "My Integration"
Client ID:     a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
Client Secret: codeplane_oas_64hexcharshere...

⚠ Store the client secret now — it will not be shown again.
```

**Output** (JSON, with `--json`):
Returns the full creation response object as JSON.

The CLI also supports the `api` subcommand for raw API access:
```bash
codeplane api /api/oauth2/applications --method POST \
  -f "name=My Integration" \
  -f "redirect_uris=https://myapp.example.com/callback" \
  -f "confidential=true"
```

### Web UI Design

**Location**: Settings > OAuth Applications (`/settings/applications`)

The creation flow is a form panel within the OAuth Applications settings page:

1. **"New OAuth Application" button**: Prominently placed at the top of the applications list. Clicking it opens or navigates to the creation form.

2. **Creation form fields**:
   - **Application name** (text input, required): Placeholder text "e.g., My Dashboard App". Shows character count indicator approaching the 255-char limit.
   - **Redirect URIs** (multi-line/repeatable input, required): Each URI in its own row with an "Add URI" button to add more. Inline validation on blur confirms each URI is parseable with scheme and host.
   - **Client type** (radio group, required): "Confidential (server-side)" and "Public (SPA, mobile, desktop, CLI)" with concise helper text under each option explaining when to use it.
   - **Scopes** (checkbox group, optional): Grouped by domain (Repository, User, Organization, Issue, Package, Notification, Misc, ActivityPub). Each scope shows read and write variants. An "All" checkbox selects everything.

3. **Submit**: "Create application" button. Disabled until name and at least one redirect URI are provided and valid.

4. **Post-creation modal**: After successful creation, a modal displays the `client_id` and `client_secret` with copy-to-clipboard buttons. A warning banner states: "Store the client secret now — it will not be shown again." The modal has a confirmation checkbox "I have stored the client secret" that must be checked before the modal can be dismissed. This prevents accidental loss of the one-time secret.

5. **Error display**: Validation errors appear inline next to the relevant form field. Server errors appear as a toast notification.

### TUI UI

The TUI does not currently have a dedicated OAuth2 application management screen. This is a known gap. When implemented, it should support browsing applications and delegating creation to the CLI or API.

### Documentation

The existing OAuth2 documentation at `docs/guides/oauth2-applications.mdx` should be updated to ensure:

- The "Registering an Application" section accurately reflects the current API endpoint (`/api/oauth2/applications`) and request/response shapes.
- The "Registration Fields" table matches the actual validation rules (confidential is required, scopes defaults to empty array).
- A clear callout warns users that the client secret is shown only once.
- Examples for both confidential and public client creation are provided.
- The CLI command example is added with all flags documented.
- The Web UI creation flow is described with screenshots once the UI is implemented.

## Permissions & Security

### Authorization Roles

| Role | Can create OAuth2 applications? |
|------|---------------------------------|
| Authenticated user (session) | Yes |
| Authenticated user (PAT) | Yes |
| OAuth2 token (third-party) | No — OAuth2 tokens carry third-party trust level and cannot manage OAuth2 applications or other credentials |
| Unauthenticated / Anonymous | No — returns `401 Unauthorized` |

There is no admin-only restriction on creating OAuth2 applications. Any authenticated user can register applications to build integrations.

### Rate Limiting

- **Standard mutation rate limit** applies to `POST /api/oauth2/applications`, consistent with other write endpoints in the rate-limiting middleware.
- **Per-user application count soft limit**: While not currently enforced, a reasonable ceiling (e.g., 100 applications per user) should be considered to prevent abuse. Exceeding the limit should return `422` with a descriptive message.
- **Burst protection**: The global rate limiter prevents a single user from flooding the endpoint with rapid creation requests.

### Data Privacy and PII

- The `client_secret` is cryptographically hashed (SHA-256) before storage. The raw value is never persisted and exists only in memory during the creation response.
- Application `name` and `redirect_uris` are user-provided and may contain identifiable information. They are visible to any user who views the consent screen during an OAuth2 authorization flow.
- The `owner_id` associates applications to their creator. This relationship is enforced in all list/get/delete queries to prevent cross-user access.
- Audit logs that record application creation should include the application ID, client ID, and owner ID, but must never include the raw client secret.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When fired |
|-------|-----------|------------|
| `OAuth2ApplicationCreated` | `application_id`, `client_id`, `owner_id`, `confidential`, `scope_count`, `redirect_uri_count`, `timestamp` | On successful 201 response |
| `OAuth2ApplicationCreateFailed` | `owner_id`, `error_code`, `error_field`, `timestamp` | On validation or system error |

### Funnel Metrics

- **Adoption**: Number of unique users who have created at least one OAuth2 application (weekly/monthly).
- **Creation volume**: Total OAuth2 applications created per day/week.
- **Confidential vs Public split**: Ratio of confidential to public applications created — indicates whether developers are building server-side or client-side integrations.
- **Scope breadth**: Average number of scopes per application — indicates whether users are following the principle of least privilege.
- **Application-to-authorization conversion**: Ratio of created applications that subsequently initiate at least one authorization code flow within 7 days — indicates whether developers complete the integration.
- **Time to first authorization**: Median time between application creation and first successful authorization code exchange.

### Success Indicators

- Increasing number of unique users creating OAuth2 applications month-over-month.
- High application-to-authorization conversion rate (>50% within 7 days).
- Low `OAuth2ApplicationCreateFailed` rate relative to total attempts (<5%).
- Growing number of active OAuth2 tokens in circulation, indicating healthy third-party ecosystem adoption.

## Observability

### Logging Requirements

| Log event | Level | Structured context |
|-----------|-------|-------------------|
| OAuth2 application creation attempt | `info` | `owner_id`, `app_name` (truncated to 50 chars), `confidential`, `redirect_uri_count`, `scope_count` |
| OAuth2 application created successfully | `info` | `owner_id`, `application_id`, `client_id`, `confidential` |
| OAuth2 application creation validation failure | `warn` | `owner_id`, `field`, `error_code` |
| OAuth2 application creation system error | `error` | `owner_id`, `error_message`, `stack_trace` |
| Unauthenticated creation attempt | `warn` | `request_ip`, `user_agent` |

**Critical logging rules**:
- The raw `client_secret` must NEVER appear in any log at any level.
- The `redirect_uris` array should be logged at `debug` level only, as it may contain internal infrastructure URLs.
- Application `name` should be truncated in logs to prevent log injection via long names.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_oauth2_applications_created_total` | Counter | `confidential` | Total OAuth2 applications created, partitioned by client type |
| `codeplane_oauth2_application_create_errors_total` | Counter | `error_type` (`validation`, `auth`, `system`) | Total creation failures by error category |
| `codeplane_oauth2_application_create_duration_seconds` | Histogram | | Latency of the creation endpoint (from request to response) |
| `codeplane_oauth2_applications_active_total` | Gauge | | Current total number of active OAuth2 applications across all users |

### Alerts

#### Alert: `OAuth2ApplicationCreateErrorRateHigh`

**Condition**: `rate(codeplane_oauth2_application_create_errors_total{error_type="system"}[5m]) > 0.1`

**Severity**: Warning

**Runbook**:
1. Check server logs for `error`-level entries with `oauth2` context in the last 15 minutes.
2. Look for database connection errors or constraint violations — the most common system-level cause is a database availability issue.
3. Verify the database is healthy: check connection pool utilization, replication lag, and disk space.
4. If the database is healthy, check for code regressions in the `OAuth2Service.createApplication` path — a recent deployment may have introduced a bug.
5. If the error is a unique constraint violation on `client_id`, this indicates a collision in the random hex generator, which is statistically near-impossible. Investigate whether the crypto RNG is functioning correctly.
6. Escalate to the platform team if the root cause is infrastructure-related.

#### Alert: `OAuth2ApplicationCreateLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_oauth2_application_create_duration_seconds_bucket[5m])) > 2`

**Severity**: Warning

**Runbook**:
1. Check database query latency — the creation endpoint performs a single INSERT. If the insert is slow, investigate table bloat, missing indexes, or lock contention on the `oauth2_applications` table.
2. Check for elevated server CPU or memory usage — the SHA-256 hashing step is lightweight, but contention elsewhere on the event loop may cause latency spikes.
3. Check rate limiter middleware for unusual patterns — a spike in traffic could cause queuing.
4. If latency is isolated to a single instance, consider restarting it.

#### Alert: `OAuth2ApplicationCreateAuthFailuresSpike`

**Condition**: `rate(codeplane_oauth2_application_create_errors_total{error_type="auth"}[5m]) > 1`

**Severity**: Info

**Runbook**:
1. Review the request logs for unauthenticated creation attempts — a spike may indicate an automated scanner or misconfigured client.
2. Check the source IPs. If concentrated from a single IP or range, consider temporary IP-level blocking.
3. Confirm the rate limiter is functioning — repeated 401s from the same source should be rate-limited.
4. No action needed if the spike is transient and self-resolving.

### Error Cases and Failure Modes

| Error case | HTTP status | Error shape | Recovery |
|------------|-------------|-------------|----------|
| Non-JSON request body | 400 | `{ "message": "invalid request body" }` | Fix request Content-Type and body format |
| Missing/empty name | 422 | Validation error, field `name`, code `missing_field` | Provide a non-empty name |
| Name too long (>255 chars) | 422 | Validation error, field `name`, code `invalid` | Shorten name to ≤255 characters |
| Missing/empty redirect_uris | 422 | Validation error, field `redirect_uris`, code `missing_field` | Provide at least one redirect URI |
| Invalid redirect URI format | 422 | Validation error, field `redirect_uris[N]`, code `invalid` | Fix the URI at index N to include scheme and host |
| Missing confidential field | 422 | Validation error, field `confidential`, code `missing_field` | Provide `confidential: true` or `confidential: false` |
| Unauthenticated request | 401 | `{ "message": "authentication required" }` | Authenticate via session cookie or PAT |
| Database insertion failure | 500 | `{ "message": "failed to create oauth2 application" }` | Retry; if persistent, escalate to ops |

## Verification

### API Integration Tests

- [ ] **Happy path — confidential client**: `POST /api/oauth2/applications` with valid `name`, `redirect_uris`, `confidential: true` → `201` with complete response shape including `client_secret`.
- [ ] **Happy path — public client**: Same with `confidential: false` → `201` with complete response shape including `client_secret`.
- [ ] **Response shape validation**: Verify all fields present: `id` (number), `client_id` (string, 40 hex chars), `client_secret` (string, `codeplane_oas_` prefix + 64 hex chars), `name`, `redirect_uris` (array), `scopes` (array), `confidential` (boolean), `created_at` (ISO 8601), `updated_at` (ISO 8601).
- [ ] **Client ID format**: Verify `client_id` matches `/^[0-9a-f]{40}$/`.
- [ ] **Client secret format**: Verify `client_secret` matches `/^codeplane_oas_[0-9a-f]{64}$/`.
- [ ] **Client secret uniqueness**: Create two applications with identical parameters → `client_id` and `client_secret` differ.
- [ ] **Secret not in list**: Create application, then `GET /api/oauth2/applications` → response does not contain `client_secret` for any application.
- [ ] **Secret not in get**: Create application, then `GET /api/oauth2/applications/:id` → response does not contain `client_secret`.
- [ ] **Application appears in list**: Create application, list applications → newly created app appears with correct fields.
- [ ] **Name trimming**: `name: "  Padded Name  "` → response has `name: "Padded Name"`.
- [ ] **Maximum name length (255)**: `name: "a".repeat(255)` → `201 Created`.
- [ ] **Name exceeds maximum (256)**: `name: "a".repeat(256)` → `422` with field `name`, code `invalid`.
- [ ] **Empty name**: `name: ""` → `422` with field `name`, code `missing_field`.
- [ ] **Whitespace-only name**: `name: "   "` → `422` with field `name`, code `missing_field`.
- [ ] **Unicode name**: `name: "🚀 Rocket App 中文"` → `201` with unicode preserved.
- [ ] **Single character name**: `name: "X"` → `201`.
- [ ] **Empty redirect_uris**: `redirect_uris: []` → `422` with field `redirect_uris`, code `missing_field`.
- [ ] **Missing redirect_uris**: Omit field → `422` with field `redirect_uris`, code `missing_field`.
- [ ] **Single valid redirect URI**: `redirect_uris: ["https://example.com/cb"]` → `201`.
- [ ] **Multiple valid redirect URIs**: `redirect_uris: ["https://a.com/cb", "https://b.com/cb"]` → `201` with both URIs preserved.
- [ ] **Invalid redirect URI (no scheme)**: `redirect_uris: ["example.com/cb"]` → `422` with field `redirect_uris[0]`, code `invalid`.
- [ ] **Invalid redirect URI (no host)**: `redirect_uris: ["https://"]` → `422` with field `redirect_uris[0]`, code `invalid`.
- [ ] **Mixed valid/invalid redirect URIs**: `redirect_uris: ["https://a.com/cb", "not-a-url"]` → `422` with field `redirect_uris[1]`, code `invalid`.
- [ ] **Custom scheme redirect URI**: `redirect_uris: ["myapp://callback"]` → `201`.
- [ ] **Localhost redirect URI**: `redirect_uris: ["http://localhost:3000/cb"]` → `201`.
- [ ] **Missing confidential field**: Omit `confidential` → `422` with field `confidential`, code `missing_field`.
- [ ] **Null confidential**: `confidential: null` → `422`.
- [ ] **Scopes provided**: `scopes: ["read:repository"]` → `201` with scopes preserved.
- [ ] **Scopes omitted**: Omit scopes field → `201` with `scopes: []`.
- [ ] **Empty scopes array**: `scopes: []` → `201` with `scopes: []`.
- [ ] **Empty JSON body**: `{}` → `422`.
- [ ] **Non-JSON body**: Send plain text → `400`.
- [ ] **Unauthenticated**: No auth header/cookie → `401`.
- [ ] **Duplicate names allowed**: Create two apps with same name → both succeed with different IDs.
- [ ] **Rapid sequential creations**: Create 10 apps sequentially → all succeed with unique IDs and secrets.
- [ ] **Concurrent creations**: Create 5 apps in parallel → all succeed with unique IDs.
- [ ] **Created app is functional**: Create app, then use its `client_id` in an authorization code flow → authorization succeeds.

### CLI Integration Tests

- [ ] **CLI create via `api` subcommand**: `codeplane api /api/oauth2/applications --method POST -f "name=..." -f "redirect_uris=..." -f "confidential=true"` → exit code 0, JSON response with `client_id` and `client_secret`.
- [ ] **CLI create then list**: Create via API, then list via API → created app appears in list without `client_secret`.
- [ ] **CLI create then delete then verify**: Create, delete, verify not in list.
- [ ] **CLI error on empty name**: Send empty name → non-zero exit code or error response.

### E2E / Playwright Tests (Web UI)

- [ ] **Navigate to OAuth Applications settings**: Authenticated user navigates to Settings > OAuth Applications → page loads with "New OAuth Application" button.
- [ ] **Create application form rendering**: Click "New OAuth Application" → form displays name input, redirect URI input, client type radio, and scope checkboxes.
- [ ] **Submit button disabled without required fields**: Form loads with submit button disabled. Fill in only name → still disabled. Fill in name + redirect URI + client type → enabled.
- [ ] **Successful creation shows secret modal**: Fill in all required fields, submit → modal appears with client ID and client secret with copy buttons and warning text.
- [ ] **Secret modal requires confirmation**: Modal has "I have stored the client secret" checkbox. Dismiss button is disabled until checkbox is checked.
- [ ] **After dismissing modal, app appears in list**: Dismiss the secret modal → application list updates with new application, no secret visible.
- [ ] **Inline validation on invalid redirect URI**: Type an invalid URI, tab away → inline error message appears.
- [ ] **Server validation error display**: Submit with empty name → inline error on name field.
- [ ] **Copy client ID button**: Click copy button → clipboard contains the client ID.
- [ ] **Copy client secret button**: Click copy button → clipboard contains the client secret.

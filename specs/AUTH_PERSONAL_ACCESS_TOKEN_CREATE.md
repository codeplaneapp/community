# AUTH_PERSONAL_ACCESS_TOKEN_CREATE

Specification for AUTH_PERSONAL_ACCESS_TOKEN_CREATE.

## High-Level User POV

When you need to give a tool, script, CI pipeline, editor integration, or AI agent permission to act on your behalf in Codeplane, you create a Personal Access Token. This is the deliberate, human-initiated way to mint a credential — distinct from the automatic token exchange that happens during CLI login or key-based sign-in flows.

You can create a token from the web UI's Settings > Tokens page or by running `codeplane auth token create` in the CLI. In either case, you give the token a descriptive name — something like "CI deploy pipeline", "local dev CLI", or "GitHub Actions" — so you can identify it later in your token list. You then choose one or more permission scopes that control exactly what the token is allowed to do. If you only need to read repository data, you can limit the token to `read:repository`. If you need full access for a development workflow, you can grant `write:repository`, `write:user`, and `write:organization`. This scoping gives you fine-grained control over the blast radius of each credential.

After you confirm, Codeplane generates the token and shows it to you exactly once. The token looks like `codeplane_` followed by a long string of characters — you must copy it immediately, because Codeplane does not store the raw token anywhere. Once you navigate away, only the last eight characters of its identifier are visible in your token list. This one-time-display design protects you: even if someone gains access to Codeplane's database, they cannot extract your raw tokens.

The token you created is immediately usable. You can paste it into a CI secret, pass it to the CLI via `codeplane auth login --with-token`, set it as the `CODEPLANE_TOKEN` environment variable, or configure it in an editor integration. Every API call made with this token carries your identity and is constrained by the scopes you selected. If you later decide the token is no longer needed, or you suspect it has been compromised, you can revoke it instantly from your token list — revocation takes effect immediately across all clients.

Creating tokens is a security-sensitive action. You must already be authenticated (via a browser session or an existing token with sufficient scope) to create a new token. Non-admin users cannot create tokens with administrative scopes. The entire flow is designed so that you are always in control of what credentials exist under your account and exactly what each one can do.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can create a scoped Personal Access Token through the API, Web UI, and CLI, receive the raw token exactly once, and subsequently use that token for authenticated API requests — with all validation, security, and edge cases below handled correctly.

### Functional Criteria

- [ ] An authenticated user can create a PAT via `POST /api/user/tokens` with a `name` and `scopes` array.
- [ ] The server returns `201 Created` with a response body containing `id`, `name`, `token`, `token_last_eight`, `scopes`, and `created_at`.
- [ ] The `token` field in the response matches the format `codeplane_` followed by exactly 40 lowercase hexadecimal characters (total length: 46 characters).
- [ ] The `token` value is generated using 20 bytes of cryptographic randomness, hex-encoded.
- [ ] Only the SHA-256 hash of the raw token is persisted in the database — the raw token is never stored server-side.
- [ ] The `token_last_eight` field contains the last 8 characters of the SHA-256 hash of the raw token, matching `/^[0-9a-f]{8}$/`.
- [ ] The raw token is returned exactly once in the creation response. It does not appear in any subsequent list, get, or other API response.
- [ ] The created token is immediately usable for authenticated API requests after creation — no activation delay.
- [ ] The created token appears in the user's token list (`GET /api/user/tokens`) with the correct name, scopes, and `token_last_eight`.
- [ ] Scopes provided in the request are normalized to canonical forms before storage (e.g., `repo` → `write:repository`, `user` → `write:user`, `org` → `write:organization`).
- [ ] Duplicate scopes after normalization are deduplicated silently — the response contains each canonical scope at most once.
- [ ] The scopes array in the response is sorted alphabetically.
- [ ] The token name is trimmed of leading and trailing whitespace before storage.
- [ ] Multiple tokens with the same name are allowed — token names are not unique identifiers.
- [ ] Each token creation produces a cryptographically distinct token, even when called with identical name and scope parameters.
- [ ] A user can create a token while authenticated via session cookie (browser) or via an existing PAT with `write:user` scope.

### Edge Cases

- [ ] **Empty name**: `name: ""` → `400 Bad Request` with a validation error indicating the name field is required.
- [ ] **Whitespace-only name**: `name: "   "` → `400 Bad Request` — a name consisting only of whitespace is treated as empty after trimming.
- [ ] **Name at maximum length (255 chars)**: `name: "a".repeat(255)` → `201 Created` — the token is created successfully with the full 255-character name.
- [ ] **Name exceeding maximum length (256 chars)**: `name: "a".repeat(256)` → `400 Bad Request` with a validation error.
- [ ] **Single-character name**: `name: "X"` → `201 Created`.
- [ ] **Unicode characters in name (emoji, CJK)**: `name: "🚀 CI Token"` → `201 Created` — unicode is preserved.
- [ ] **Name with leading/trailing whitespace**: `name: "  CI Token  "` → `201 Created` with `name: "CI Token"` in the response (trimmed).
- [ ] **Empty scopes array**: `scopes: []` → `400 Bad Request` — at least one scope is required.
- [ ] **Missing scopes field**: `{ name: "test" }` → `400 Bad Request`.
- [ ] **Unknown scope string**: `scopes: ["write:nonexistent"]` → `400 Bad Request` with a per-scope validation error indicating which scope is invalid.
- [ ] **Mix of valid and unknown scopes**: `scopes: ["write:repository", "destroy:instance"]` → `400 Bad Request` — the entire request fails; no token is created.
- [ ] **Duplicate scopes**: `scopes: ["write:repository", "write:repository"]` → `201 Created` with deduplicated scopes `["write:repository"]`.
- [ ] **Alias scopes**: `scopes: ["repo"]` → `201 Created` with canonical scope `["write:repository"]`.
- [ ] **Multiple alias scopes that normalize to the same canonical form**: `scopes: ["repo", "repository", "write:repository"]` → `201 Created` with `["write:repository"]`.
- [ ] **Privileged scope by non-admin user**: `scopes: ["admin"]` → `403 Forbidden`.
- [ ] **Privileged scope by admin user**: `scopes: ["admin"]` → `201 Created`.
- [ ] **`all` scope by non-admin user**: `scopes: ["all"]` → `403 Forbidden`.
- [ ] **`all` scope by admin user**: `scopes: ["all"]` → `201 Created`.
- [ ] **`read:admin` or `write:admin` by non-admin user**: → `403 Forbidden`.
- [ ] **Mix of standard and privileged scopes by non-admin**: `scopes: ["write:repository", "admin"]` → `403 Forbidden` — no token created.
- [ ] **Missing name field entirely**: `{ scopes: ["read:repository"] }` → `400 Bad Request`.
- [ ] **Null name**: `{ name: null, scopes: [...] }` → `400 Bad Request`.
- [ ] **Non-string name**: `{ name: 123, scopes: [...] }` → `400 Bad Request`.
- [ ] **Non-array scopes**: `{ name: "test", scopes: "write:repository" }` → `400 Bad Request`.
- [ ] **Empty JSON body**: `{}` → `400 Bad Request`.
- [ ] **Non-JSON body**: Plain text body → `400 Bad Request`.
- [ ] **Unauthenticated request**: No session or token → `401 Unauthorized`.
- [ ] **PAT without `write:user` scope**: A token with only `read:repository` scope → `403 Forbidden`.
- [ ] **PAT with `write:user` scope**: → `201 Created`.
- [ ] **PAT with `all` scope**: → `201 Created` (superset includes `write:user`).
- [ ] **Session cookie authentication**: → `201 Created` (session auth is not scope-gated).
- [ ] **Rapid successive creations**: Creating 10 tokens in quick succession → all succeed independently, each with a unique token value.
- [ ] **Concurrent creation requests**: 5 parallel `POST /api/user/tokens` requests → all succeed; no database constraint violations or token collisions.
- [ ] **Database write failure during creation**: → `500 Internal Server Error` — no partial token record is created.

### Boundary Constraints

- [ ] Token name: string, required, 1–255 characters after trimming, any unicode characters allowed.
- [ ] Scopes: array of strings, required, at least one element, each must normalize to a known canonical scope.
- [ ] Token format: `codeplane_` prefix + 40 lowercase hex chars = 46 characters total.
- [ ] `token_last_eight`: exactly 8 lowercase hex characters from the tail of the SHA-256 hash.
- [ ] `id`: numeric integer, > 0.
- [ ] `created_at`: ISO 8601 timestamp string, always present and non-null.
- [ ] Response content-type: `application/json`.
- [ ] Response status code on success: `201 Created`.
- [ ] Canonical scope values: `read:repository`, `write:repository`, `read:organization`, `write:organization`, `read:user`, `write:user`, `admin`, `read:admin`, `write:admin`, `all`.
- [ ] Scope aliases: `repo` → `write:repository`, `repository` → `write:repository`, `org` → `write:organization`, `organization` → `write:organization`, `user` → `write:user`.
- [ ] Privileged scopes requiring admin: `admin`, `read:admin`, `write:admin`, `all`.
- [ ] Request body maximum size: enforced by the server's general request body limit.

## Design

### API Shape

#### Create Token — `POST /api/user/tokens`

**Request:**

```http
POST /api/user/tokens HTTP/1.1
Content-Type: application/json
Authorization: Bearer codeplane_<token>

{
  "name": "CI Deploy Pipeline",
  "scopes": ["write:repository", "read:user"]
}
```

**Success Response (201 Created):**

```json
{
  "id": 42,
  "name": "CI Deploy Pipeline",
  "token": "codeplane_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  "token_last_eight": "f8a9b0c1",
  "scopes": ["read:user", "write:repository"],
  "created_at": "2026-03-21T10:00:00Z"
}
```

**Error Responses:**

| Condition | Status | Body |
|-----------|--------|------|
| Missing or empty name | 400 | `{ "error": "validation_failed", "message": "...", "errors": [{ "resource": "AccessToken", "field": "name", "code": "missing_field" }] }` |
| Name exceeds 255 characters | 400 | `{ "error": "validation_failed", "message": "...", "errors": [{ "resource": "AccessToken", "field": "name", "code": "invalid" }] }` |
| Missing or empty scopes | 400 | `{ "error": "validation_failed", "message": "...", "errors": [{ "resource": "AccessToken", "field": "scopes", "code": "missing_field" }] }` |
| Unknown scope at index `i` | 400 | `{ "error": "validation_failed", "message": "...", "errors": [{ "resource": "AccessToken", "field": "scopes[i]", "code": "invalid" }] }` |
| Invalid JSON body | 400 | `{ "error": "bad_request", "message": "invalid request body" }` |
| Not authenticated | 401 | `{ "error": "unauthorized", "message": "authentication required" }` |
| Insufficient scope (PAT without `write:user`) | 403 | `{ "error": "insufficient_scope", "message": "Token does not have the required scope: write:user" }` |
| Privileged scope by non-admin | 403 | `{ "error": "forbidden", "message": "insufficient privileges for requested token scopes" }` |
| Database or internal error | 500 | `{ "error": "internal", "message": "failed to create access token" }` |

**Notes:**
- Both `Bearer` and `token` authorization schemes are accepted (case-insensitive scheme matching).
- Session cookie authentication is also accepted (browser context) and is not scope-gated.
- The `token` field in the response is the raw token — it will never appear again in any subsequent API response.
- The `scopes` array in the response contains canonical, deduplicated, sorted scope strings.

### SDK Shape

The SDK exposes token creation through the `UserService`:

```typescript
interface CreateTokenRequest {
  name: string;
  scopes: string[];
}

interface CreateTokenResult {
  id: number;
  name: string;
  token: string;          // Raw token — shown once
  token_last_eight: string;
  scopes: string[];       // Canonical, sorted
  created_at: string;     // ISO 8601
}

// UserService method
createToken(userID: number, req: CreateTokenRequest): Promise<Result<CreateTokenResult, APIError>>
```

**Current gap:** The existing `CreateTokenResult` in `packages/sdk/src/services/user.ts` does not include `created_at`. The database query already returns this field. The service mapping must be updated to include it.

### CLI Command

```bash
codeplane auth token create <name> --scopes <scopes>
```

**Arguments:**
- `<name>` (positional, required): The human-readable name for the token.
- `--scopes <scopes>` (required): Comma-separated list of scopes (e.g., `write:repository,read:user`). Aliases like `repo` are accepted and normalized.

**Default output (human-readable):**

```
✓ Token created successfully.

Name:       CI Deploy Pipeline
ID:         42
Scopes:     read:user, write:repository
Last Eight: f8a9b0c1

Token: codeplane_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0

⚠ Copy this token now — it will not be shown again.
```

**Structured JSON output (`--json`):**

```bash
codeplane auth token create "CI Pipeline" --scopes write:repository,read:user --json
```

Returns the raw API response object:

```json
{
  "id": 42,
  "name": "CI Pipeline",
  "token": "codeplane_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  "token_last_eight": "f8a9b0c1",
  "scopes": ["read:user", "write:repository"],
  "created_at": "2026-03-21T10:00:00Z"
}
```

**Behavior details:**
- Requires authentication. If no token is available (env var, keyring, or config), exits with a non-zero code and a message directing the user to `codeplane auth login`.
- The CLI creating token must have `write:user` scope. If the current token lacks this scope, the CLI prints an error and exits with a non-zero code.
- Exit code 0 on success, non-zero on any error (validation, auth, network).
- The `--scopes` flag accepts both comma-separated (`write:repository,read:user`) and repeated flag (`--scopes write:repository --scopes read:user`) forms.
- Validation errors are printed clearly, identifying which field or scope index caused the failure.
- The raw token is printed to stdout for easy piping and capture in CI environments.

### Web UI Design

**Route:** `/settings/tokens` (same page as the token list; creation form is part of this page)

**Create Token Form:**

The creation form appears above the token list table and contains:

| Element | Details |
|---------|---------|
| **Name input** | Text input, required, placeholder "e.g., CI Deploy Pipeline", max 255 characters. Client-side validation shows inline error if empty or exceeds 255 chars. |
| **Scopes selector** | Checkbox group organized by resource category. Categories: Repository (`read:repository`, `write:repository`), Organization (`read:organization`, `write:organization`), User (`read:user`, `write:user`). Admin scopes only shown to admin users. Each scope has a short description tooltip. |
| **Generate button** | Primary action button labeled "Generate token". Disabled until both name and at least one scope are provided. Shows a loading spinner during the API call. |

**Post-creation token reveal:**

After successful creation, a prominent banner replaces the form (or appears above it) displaying:

- A success message: "Personal access token created successfully"
- The raw token in a monospace, read-only text field
- A "Copy" button that copies the token to the clipboard with visual confirmation ("Copied!")
- A warning message: "Make sure to copy this token now. You won't be able to see it again."
- A "Done" or "Dismiss" button that hides the banner and returns to the default form + list view

**Validation states:**
- Empty name on submit: inline error "Token name is required"
- No scopes selected on submit: inline error "Select at least one scope"
- API error (e.g., privileged scope denied): error banner with the server's error message
- Network error: error banner with a retry suggestion

**Token list update:**
- After the creation banner is shown, the token list table below refreshes to include the newly created token (without a full page reload).
- The new token appears at the top of the list (newest first ordering).

### TUI UI

The TUI does not expose a dedicated token creation screen. Users create tokens via the CLI or web UI. This is an intentional product decision — the CLI `auth token create` command provides the same functionality in a terminal context.

### Editor Integrations (VS Code, Neovim)

Editor integrations do not provide token creation UI. Token management is handled through the CLI or web UI. Editors consume stored tokens transparently for authentication.

### Documentation

The following end-user documentation should exist:

1. **"Creating Personal Access Tokens"** — A step-by-step guide covering: why you would create a PAT (CI, scripts, editor integrations, agents), how to create one from the web UI (with annotated screenshots of the form, scope selector, and token reveal banner), how to create one from the CLI (`codeplane auth token create` with examples), best practices for naming tokens descriptively, and guidance on choosing the minimum scopes needed for your use case.

2. **"Token Scopes Reference"** — A reference table of all available scopes with descriptions of what each scope permits and example use cases. Covers aliases (`repo` → `write:repository`) and the admin scope restrictions. This document is shared across CREATE, LIST, and SIGN_IN specs.

3. **"API Reference: POST /api/user/tokens"** — OpenAPI-style documentation for the creation endpoint including request headers, request body schema, response schema, status codes, error codes, and example request/response pairs.

4. **"Security Best Practices for PATs"** — Guidance on: creating tokens with least-privilege scopes, never committing tokens to source control, rotating tokens periodically, revoking tokens promptly when no longer needed, using `CODEPLANE_TOKEN` environment variable safely, and the difference between manually created tokens and exchange-minted tokens.

## Permissions & Security

### Authorization Roles

| Operation | Required Role |
|-----------|---------------|
| Create a PAT with standard scopes via API | Authenticated user (any role) with `write:user` scope on their PAT, or session cookie auth |
| Create a PAT with standard scopes via CLI | Authenticated user with a stored token that has `write:user` scope |
| Create a PAT with standard scopes via Web UI | Authenticated user with an active browser session |
| Create a PAT with privileged scopes (`admin`, `read:admin`, `write:admin`, `all`) | Authenticated user with `is_admin = true` AND the auth requirements above |
| Create a PAT for another user | Not permitted. No admin override exists. |

### Scope Enforcement

- When authenticated via PAT, the `write:user` scope is required to create a new token. A PAT with only `read:repository` or `read:user` scope cannot create tokens.
- When authenticated via session cookie (browser), no scope check is applied — session auth implies full user-level access.
- The `all` and `admin` scopes are supersets that satisfy the `write:user` requirement.
- The scope check for the _caller's_ token is separate from the scope validation of the _new_ token being created.

### Rate Limiting

- Token creation is rate-limited using the authenticated user ID as the rate-limit key: `user:{userId}`.
- Token creation should use a stricter rate limit tier than general API usage to prevent abuse (e.g., a separate token-creation-specific limit of 30 tokens per hour per user).
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included on every response including error responses.
- Exceeding the rate limit returns `429 Too Many Requests` with a `Retry-After` header.
- Failed authentication attempts (unauthenticated callers hitting this endpoint) are rate-limited by IP address: `ip:{clientIp}`.

### Data Privacy Constraints

- **Token storage**: Only the SHA-256 hash of the generated token is stored in the database. The raw token is never persisted.
- **One-time display**: The raw token appears only in the `201 Created` response body. No subsequent API call, list, or get response ever includes the raw token.
- **Log sanitization**: The raw token value must never appear in server logs, error messages, or stack traces. The `Authorization` header used to authenticate the request must be redacted in log output. The response body containing the new raw token must not be logged.
- **No URL tokens**: The raw token is returned only in the response body, never in URL query strings or fragments (unlike the exchange flow).
- **PII scope**: Token names are user-supplied strings. They may contain personally identifying information. Token names should be treated as sensitive and not logged at levels above `debug`.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.token_created` | User successfully creates a new PAT | `user_id`, `token_id`, `token_name_length` (int), `scope_count` (int), `scopes` (string[]), `has_admin_scope` (bool), `client` (web/cli/api), `is_exchange` (false — always false for this feature; exchange-minted tokens fire a different event) |
| `auth.token_creation_failed` | Token creation attempt fails | `user_id` (if authenticated, else null), `failure_reason` (validation/auth/scope/internal), `client` (web/cli/api), `error_code` (string from API error response) |
| `auth.privileged_scope_denied` | Non-admin user attempts to create token with admin scopes | `user_id`, `requested_scopes` (string[]), `client` (web/cli/api) |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Token creation rate** | Number of tokens created per active user per month | Growing — indicates healthy adoption of PAT-based auth |
| **Token-to-first-use latency** | Time between token creation and first authenticated API request with the new token | < 5 minutes for 80% of tokens (indicates users immediately use what they create) |
| **Creation success rate** | % of `POST /api/user/tokens` requests that return `201` | > 90% — low success rate indicates UX confusion or validation gaps |
| **Scope selection pattern** | Distribution of scopes selected at creation time | Indicates whether users understand and use fine-grained scoping vs. always requesting broad access |
| **CLI vs Web creation ratio** | Proportion of tokens created via CLI vs Web UI vs direct API | Indicates which surfaces users prefer and where to invest in UX improvements |
| **Privileged scope attempt rate** | % of token creation attempts that request admin scopes | Should be low for healthy non-admin user base; spikes indicate potential confusion or social engineering |
| **Validation failure distribution** | Breakdown of `auth.token_creation_failed` by `failure_reason` | High validation rates may indicate poor form UX; high scope denials may indicate unclear documentation |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Token creation request received | `debug` | `user_id`, `request_id`, `client_ip`, `token_name_length`, `scope_count` | Entry point. Do NOT log the token name or scope values at this level. |
| Token created successfully | `info` | `user_id`, `token_id`, `token_last_eight`, `scope_count`, `scopes`, `request_id`, `latency_ms` | Audit trail. Do NOT log the raw token. |
| Token creation failed — validation error | `info` | `user_id`, `request_id`, `error_code`, `error_field`, `latency_ms` | Expected user error — info not warn. |
| Token creation failed — auth required | `warn` | `client_ip`, `request_id`, `user_agent` | Unauthenticated access attempt to a write endpoint. |
| Token creation failed — insufficient scope | `info` | `user_id`, `request_id`, `required_scope`, `held_scopes` | Scope mismatch — user needs `write:user`. |
| Token creation failed — privileged scope denied | `warn` | `user_id`, `request_id`, `requested_scopes` | Non-admin trying to create admin-scoped token. Security-relevant. |
| Token creation failed — internal error | `error` | `user_id`, `request_id`, `error_message`, `stack_trace` | Database or service layer failure. |
| Token creation failed — rate limited | `warn` | `user_id`, `request_id`, `rate_limit_key`, `retry_after_seconds` | Abuse or misconfigured automation. |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_token_create_requests_total` | Counter | `status` (201/400/401/403/429/500) | Total token creation API requests by response status |
| `codeplane_user_token_create_duration_seconds` | Histogram | `status` | Request-to-response latency for token creation endpoint |
| `codeplane_user_token_create_scope_count` | Histogram | — | Distribution of number of scopes requested per creation (after dedup) |
| `codeplane_user_token_create_privileged_total` | Counter | `result` (success/denied) | Privileged scope creation attempts |
| `codeplane_user_tokens_active` | Gauge | — | Total number of non-revoked tokens across all users (system-wide, shared with LIST spec) |

### Alerts

#### Alert: Token Creation Endpoint Error Rate

- **Condition**: `rate(codeplane_user_token_create_requests_total{status="500"}[5m]) / rate(codeplane_user_token_create_requests_total[5m]) > 0.05` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check server error logs for the `POST /api/user/tokens` endpoint — look for database connection failures, write errors, or constraint violations.
  2. Verify database health: connection pool saturation, write latency on the `access_tokens` table, table locks, or disk space issues.
  3. Check if a recent deployment introduced a regression in the `createToken` service method, `normalizeAndValidateScopes`, or the route handler.
  4. Check for unexpected constraint violations — e.g., collisions on `token_hash` (astronomically unlikely but worth checking if errors spike).
  5. If the database is healthy, check for service registry initialization failures or crypto module issues (SHA-256 or `randomBytes` failures).

#### Alert: Unusual Token Creation Spike

- **Condition**: `rate(codeplane_user_token_create_requests_total{status="201"}[5m]) > 10` (more than 10 successful creations per second, system-wide) sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Query recent `auth.token_created` events grouped by `user_id` — check if a single user is creating many tokens (automation gone wrong or abuse).
  2. If a single user: check for script misbehavior, account compromise, or a CI job creating tokens in a loop. Consider temporarily suspending the user's token creation ability or applying per-user rate limiting.
  3. If distributed across many users: check for a legitimate onboarding wave, a client update that triggers token creation, or a coordinated attack.
  4. If admin-scoped tokens are being created at high volume: escalate immediately as a potential privilege escalation incident.
  5. Review the per-user rate limiter to ensure it is functioning correctly.

#### Alert: Elevated Privileged Scope Denials

- **Condition**: `rate(codeplane_user_token_create_privileged_total{result="denied"}[15m]) > 5` sustained for 15 minutes.
- **Severity**: Informational
- **Runbook**:
  1. Non-admin users are repeatedly attempting to create tokens with admin scopes.
  2. Check if this correlates with a client update that incorrectly defaults to requesting admin scopes.
  3. Check if documentation or UI is unclear about which scopes are admin-only.
  4. If concentrated from a single user or IP range: may indicate probing or social engineering — review the user's account activity.
  5. No immediate action required unless correlated with other suspicious auth patterns.

#### Alert: Token Creation Latency Spike

- **Condition**: `histogram_quantile(0.99, rate(codeplane_user_token_create_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database write performance for `INSERT INTO access_tokens ...` — connection pool health, write latency, lock contention.
  2. Check if `getUserByID` lookup during privileged-scope checking is slow (only called when scopes include admin-level permissions).
  3. Check SHA-256 and `randomBytes` performance — if the system is under extreme CPU load, crypto operations may be slow.
  4. Check overall server load and request concurrency — this endpoint involves both a crypto operation and a database write.
  5. If isolated, may indicate database write contention from a high volume of concurrent creates.

### Error Cases and Failure Modes

| Failure Mode | Impact | Behavior |
|-------------|--------|----------|
| Database unavailable during token write | Token not created | `500 Internal Server Error`; no partial token record exists |
| Database constraint violation (token_hash collision) | Token not created | `500 Internal Server Error`; astronomically unlikely (SHA-256 collision on random input) |
| `crypto.randomBytes` failure | Token not created | `500 Internal Server Error`; indicates OS entropy pool exhaustion — critical system issue |
| SHA-256 hash computation failure | Token not created | `500 Internal Server Error`; indicates runtime environment corruption |
| User deleted between auth check and token creation | Token possibly created for nonexistent user | Service should verify user exists; FK constraint prevents orphaned tokens |
| Network error after token created but before response delivered | Token exists but user never sees raw token | User must create a new token; the orphaned token can be identified in the list by `token_last_eight` and revoked |
| Rate limiter memory grows unbounded | Server memory pressure | Stale entry cleanup runs periodically to bound memory |
| Request body exceeds size limit | Token not created | `413 Payload Too Large` or `400 Bad Request` depending on server body parser configuration |

## Verification

### API Integration Tests

#### Successful Creation

- [ ] **Create token with valid name and single scope**: `POST /api/user/tokens` with `{ name: "Test", scopes: ["write:repository"] }` → `201 Created` with `token` matching `/^codeplane_[0-9a-f]{40}$/`.
- [ ] **Create token with valid name and multiple scopes**: `{ name: "Multi", scopes: ["write:repository", "read:user", "write:organization"] }` → `201` with all three scopes in canonical, sorted order.
- [ ] **Create token with alias scope `repo`**: `{ scopes: ["repo"] }` → `201` with `scopes: ["write:repository"]`.
- [ ] **Create token with alias scope `org`**: `{ scopes: ["org"] }` → `201` with `scopes: ["write:organization"]`.
- [ ] **Create token with alias scope `user`**: `{ scopes: ["user"] }` → `201` with `scopes: ["write:user"]`.
- [ ] **Create token with alias `repository`**: `{ scopes: ["repository"] }` → `201` with `scopes: ["write:repository"]`.
- [ ] **Create token with duplicate scopes**: `{ scopes: ["write:repository", "write:repository"] }` → `201` with `scopes: ["write:repository"]` (deduplicated).
- [ ] **Create token with aliases that normalize to same scope**: `{ scopes: ["repo", "repository", "write:repository"] }` → `201` with `scopes: ["write:repository"]`.
- [ ] **Response includes `id` as integer > 0**: Verify `typeof id === "number"` and `id > 0`.
- [ ] **Response includes `token_last_eight` as 8 hex chars**: Verify `token_last_eight` matches `/^[0-9a-f]{8}$/`.
- [ ] **Response includes `name` matching request**: The returned `name` matches the (trimmed) input name.
- [ ] **Response includes `created_at` as ISO 8601**: Verify the `created_at` field parses as a valid date.
- [ ] **Response Content-Type is `application/json`**: Check the `Content-Type` response header.
- [ ] **Created token is immediately usable**: Use the returned `token` in `Authorization: Bearer <token>` on another endpoint → request succeeds.
- [ ] **Created token appears in list**: After creation, `GET /api/user/tokens` → the new token appears with matching `id`, `name`, `token_last_eight`, and `scopes`.
- [ ] **Raw token does not appear in list**: After creation, `GET /api/user/tokens` → no item has a `token` field.
- [ ] **Two tokens with same name**: Create two tokens both named "CI" → both succeed, both appear in list with different `id` and `token_last_eight`.
- [ ] **Each creation produces unique token**: Create two tokens with identical name and scopes → the `token` values are different.

#### Name Validation

- [ ] **Empty name**: `{ name: "", scopes: ["read:repository"] }` → `400`.
- [ ] **Whitespace-only name**: `{ name: "   ", scopes: ["read:repository"] }` → `400`.
- [ ] **Single character name**: `{ name: "X", scopes: ["read:repository"] }` → `201`.
- [ ] **Maximum length name (255 chars)**: `{ name: "a".repeat(255), scopes: ["read:repository"] }` → `201` with full name preserved.
- [ ] **Name exceeding max (256 chars)**: `{ name: "a".repeat(256), scopes: ["read:repository"] }` → `400`.
- [ ] **Name with unicode (emoji)**: `{ name: "🚀 CI Token", scopes: ["read:repository"] }` → `201`.
- [ ] **Name with CJK characters**: `{ name: "测试令牌", scopes: ["read:repository"] }` → `201`.
- [ ] **Name with leading/trailing whitespace**: `{ name: "  CI Token  ", scopes: ["read:repository"] }` → `201` with `name: "CI Token"`.
- [ ] **Missing name field**: `{ scopes: ["read:repository"] }` → `400`.
- [ ] **Null name**: `{ name: null, scopes: ["read:repository"] }` → `400`.

#### Scope Validation

- [ ] **Empty scopes array**: `{ name: "Test", scopes: [] }` → `400`.
- [ ] **Missing scopes field**: `{ name: "Test" }` → `400`.
- [ ] **Single unknown scope**: `{ name: "Test", scopes: ["write:nonexistent"] }` → `400` with error identifying `scopes[0]` as invalid.
- [ ] **Mix of valid and unknown scopes**: `{ name: "Test", scopes: ["write:repository", "destroy:all"] }` → `400` with error identifying `scopes[1]`.
- [ ] **All unknown scopes**: `{ name: "Test", scopes: ["foo", "bar"] }` → `400` with errors for both indices.
- [ ] **Privileged scope `admin` by non-admin**: → `403`.
- [ ] **Privileged scope `read:admin` by non-admin**: → `403`.
- [ ] **Privileged scope `write:admin` by non-admin**: → `403`.
- [ ] **Privileged scope `all` by non-admin**: → `403`.
- [ ] **Privileged scope `admin` by admin user**: → `201`.
- [ ] **Privileged scope `all` by admin user**: → `201`.
- [ ] **Mix of standard and privileged by non-admin**: `{ scopes: ["write:repository", "admin"] }` → `403`.

#### Request Body Validation

- [ ] **Empty JSON body `{}`**: → `400`.
- [ ] **Non-JSON content-type**: Send `Content-Type: text/plain` body → `400`.
- [ ] **Non-string name (integer)**: `{ name: 123, scopes: ["read:repository"] }` → `400`.
- [ ] **Non-array scopes (string)**: `{ name: "Test", scopes: "write:repository" }` → `400`.

#### Authentication and Authorization

- [ ] **Unauthenticated request**: No `Authorization` header, no session → `401`.
- [ ] **PAT with `write:user` scope**: → `201`.
- [ ] **PAT with `read:user` scope only**: → `403` (need `write:user` to create tokens).
- [ ] **PAT with `read:repository` scope only**: → `403`.
- [ ] **PAT with `all` scope**: → `201`.
- [ ] **PAT with `admin` scope**: → `201`.
- [ ] **Session cookie auth**: → `201` (not scope-gated).
- [ ] **Revoked PAT**: Use a revoked token → `401`.
- [ ] **Deactivated user's PAT**: → `401`.
- [ ] **Bearer scheme (lowercase)**: `Authorization: Bearer codeplane_<valid>` → accepted.
- [ ] **token scheme**: `Authorization: token codeplane_<valid>` → accepted.
- [ ] **BEARER scheme (uppercase)**: `Authorization: BEARER codeplane_<valid>` → accepted.

#### Concurrency and Rate Limiting

- [ ] **Rapid successive creations (10 tokens)**: All 10 return `201` with unique tokens.
- [ ] **Concurrent creation requests (5 parallel)**: All succeed independently; no constraint violations.
- [ ] **Rate limit headers present**: Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- [ ] **Rate limit exhaustion**: Exceed the token creation rate limit → `429 Too Many Requests` with `Retry-After`.

### CLI E2E Tests

- [ ] **`codeplane auth token create <name> --scopes <scopes>` creates token**: Run with valid name and scopes → exit code 0, output contains the raw token matching `/^codeplane_[0-9a-f]{40}$/`.
- [ ] **`codeplane auth token create --json` returns valid JSON**: Output parses as JSON with `id`, `name`, `token`, `token_last_eight`, `scopes` fields.
- [ ] **Created token appears in list**: Create a token, then run `codeplane auth token list --json` → the new token's `id` and `name` appear.
- [ ] **Token format matches specification**: The `token` field matches exactly `codeplane_[0-9a-f]{40}` (46 chars total).
- [ ] **`token_last_eight` has correct length**: The `token_last_eight` field is exactly 8 characters.
- [ ] **Scopes are normalized**: Create with `--scopes repo` → response scopes include `write:repository`, not `repo`.
- [ ] **Duplicate scopes are deduplicated**: Create with `--scopes write:repository,write:repository` → response scopes contain `write:repository` exactly once.
- [ ] **Unknown scope fails**: Create with `--scopes write:repository,destroy:instance` → exit code non-zero.
- [ ] **Empty scopes fails**: Create with `--scopes ""` (empty) → exit code non-zero.
- [ ] **No auth fails**: Run with empty token (`token: ""`) → exit code non-zero.
- [ ] **Read-only token cannot create**: Run with `READ_TOKEN` (read-only scope) → exit code non-zero, insufficient permissions.
- [ ] **Create then delete round-trip**: Create a token, capture its `id`, delete it with `codeplane auth token delete <id> --yes`, verify it no longer appears in `codeplane auth token list --json`.
- [ ] **Multiple scopes via comma-separated**: `--scopes write:repository,read:user` → both scopes in response.
- [ ] **Name with spaces**: `codeplane auth token create "My CI Token" --scopes read:repository` → success with name "My CI Token".
- [ ] **Privileged scope as non-admin**: `--scopes admin` → exit code non-zero, permission denied.

### Playwright (Web UI) E2E Tests

- [ ] **Navigate to Settings > Tokens**: Authenticated user can navigate to `/settings/tokens` → the page loads with a creation form and token list.
- [ ] **Create token form is visible**: The page shows a name input, scope checkboxes/selectors, and a "Generate token" button.
- [ ] **Create token with name and scopes**: Fill name "E2E Test Token", select `write:repository` scope, click "Generate token" → success banner appears with the raw token.
- [ ] **Token reveal banner shows raw token**: After creation, a banner displays a token matching `codeplane_[0-9a-f]{40}`.
- [ ] **Token reveal banner has copy button**: The banner contains a "Copy" button that copies the token to clipboard.
- [ ] **Token reveal warning message**: The banner displays a warning that the token cannot be viewed again.
- [ ] **Token list updates after creation**: After dismissing the reveal banner, the token list includes the newly created token with correct name and scopes.
- [ ] **Token shown only once**: Navigate away from `/settings/tokens` and back → the raw token is no longer visible; only `token_last_eight` appears.
- [ ] **Form validation — empty name**: Click "Generate token" with an empty name → inline validation error appears.
- [ ] **Form validation — no scopes selected**: Fill name but select no scopes → inline validation error appears or button remains disabled.
- [ ] **Generate button disabled initially**: When name is empty or no scopes are selected, the generate button is disabled.
- [ ] **Scope checkboxes organized by category**: Repository scopes, Organization scopes, and User scopes are grouped visually.
- [ ] **Admin scopes hidden for non-admin user**: Non-admin user does not see `admin`, `read:admin`, `write:admin`, or `all` scope options.
- [ ] **Admin scopes visible for admin user**: Admin user sees admin scope options in the selector.
- [ ] **Error state — server error**: Simulate a server error → error banner appears with the error message.
- [ ] **Loading state during creation**: After clicking "Generate token", the button shows a loading state while the API call is in progress.
- [ ] **Long token name**: Enter a 255-character name → creation succeeds.
- [ ] **Name exceeding limit**: Enter a 256-character name → validation error or server error handled gracefully.

### Security-Focused Tests

- [ ] **Raw token never logged**: Create a token via API, then search server logs → the raw token string (`codeplane_[0-9a-f]{40}`) does not appear in any log line.
- [ ] **Authorization header not logged**: Make a creation request with `Authorization: Bearer codeplane_<valid>`, search logs → the token value from the Authorization header is not present.
- [ ] **Response body not logged**: After creation, search server logs → the JSON response body (containing the new raw token) is not present.
- [ ] **Only hash stored in database**: After creation, query the `access_tokens` table → `token_hash` is a 64-character hex string (SHA-256), no column contains the raw `codeplane_` token.
- [ ] **`token_last_eight` matches hash tail**: The `token_last_eight` in the response matches the last 8 characters of the SHA-256 hash stored in the database.
- [ ] **Created token validates correctly**: Use the raw token from creation to make an authenticated request → request succeeds, confirming the stored hash matches the raw token.
- [ ] **Cross-user isolation**: User A creates a token; User B cannot see it in `GET /api/user/tokens`.
- [ ] **Query-string token rejected**: `POST /api/user/tokens?token=codeplane_<valid>` with body → treated as unauthenticated (`401`), not authenticated via query string.
- [ ] **Token uniqueness**: Create 100 tokens → all 100 have unique `token` values and unique `token_last_eight` values (collision is theoretically possible for `token_last_eight` but should not occur in practice with 100 tokens).

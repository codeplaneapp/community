# AUTH_SIGN_IN_WITH_PERSONAL_ACCESS_TOKEN

Specification for AUTH_SIGN_IN_WITH_PERSONAL_ACCESS_TOKEN.

## High-Level User POV

When a user needs to authenticate with Codeplane outside of a browser session — from the CLI, a CI pipeline, a script, an editor integration, or any other programmatic context — they can sign in using a Personal Access Token (PAT). This is the primary non-interactive authentication mechanism for Codeplane.

The user first creates a PAT through the web UI's account settings or via the CLI. At creation time, they give the token a descriptive name (such as "CI deploy pipeline" or "local CLI") and select one or more permission scopes that control what the token is allowed to do. Codeplane generates the token and displays it exactly once — the user must copy it immediately because it cannot be retrieved again.

Once the user has a token, they can authenticate any Codeplane API request by including the token in the Authorization header. The CLI stores the token securely in the operating system's credential keyring after login, so users do not need to manage it manually after initial setup. Tokens can also be provided via the CODEPLANE_TOKEN environment variable for CI/CD and automation scenarios.

From the user's perspective, PAT-based authentication feels seamless: every API call, CLI command, editor action, and TUI operation that requires identity simply works when a valid token is present. The token's scopes act as guardrails — a read-only token allows browsing repositories and issues but prevents creating or modifying resources, giving users confidence that tokens used in less-trusted environments have limited blast radius.

Users can review all their active tokens at any time, see when each was last used, and revoke any token instantly. Revoking a token immediately invalidates all requests using it, providing a clean incident-response path if a token is suspected of being compromised.

## Acceptance Criteria

### Definition of Done

The feature is complete when a user can create a scoped PAT, use it to authenticate any Codeplane API request (directly or through CLI/TUI/editor clients), manage the token lifecycle (list, inspect last-used, revoke), and all edge cases below are handled correctly.

### Functional Criteria

- [ ] A user can authenticate an API request by providing a valid PAT in the `Authorization` header using either `Bearer codeplane_<token>` or `token codeplane_<token>` scheme (case-insensitive scheme matching).
- [ ] Authentication succeeds only when the token matches a stored hash, the owning user is active (`is_active = true`), and the owning user is not login-prohibited (`prohibit_login = false`).
- [ ] Authenticated requests populate the request context with the user's identity, token scopes, token source type (`personal_access_token`), and a flag indicating token-based auth (`isTokenAuth = true`).
- [ ] The `last_used_at` timestamp on the token record is updated asynchronously (fire-and-forget) on each successful authentication, without blocking the request.
- [ ] Authentication via PAT is checked before session-cookie-based authentication in the middleware pipeline.
- [ ] Requests with an invalid, revoked, or malformed token receive a `401 Unauthorized` response with a structured error payload.
- [ ] Requests with a valid token but insufficient scopes for the requested operation receive a `403 Forbidden` response.
- [ ] Query-string token authentication is explicitly unsupported to prevent credential leakage in URLs, logs, and browser history.
- [ ] Tokens are never logged in plaintext in any server log output.

### Token Format Constraints

- [ ] PAT format: `codeplane_` prefix followed by exactly 40 lowercase hexadecimal characters (total length: 46 characters).
- [ ] Tokens that do not match the `codeplane_` prefix or the expected length/character set are rejected before any database lookup.
- [ ] The system must distinguish PATs (`codeplane_` prefix) from OAuth2 access tokens (`codeplane_oat_` prefix) and route validation accordingly.

### Token Creation Constraints

- [ ] Token name is required and must be a non-empty string.
- [ ] Token name maximum length: 255 characters.
- [ ] Token name must not consist solely of whitespace.
- [ ] At least one scope must be provided at creation time.
- [ ] Scopes are normalized to canonical forms (e.g., `repo` → `write:repository`, `user` → `write:user`).
- [ ] Duplicate scopes after normalization are deduplicated silently.
- [ ] Unknown or unsupported scope strings are rejected with a clear error message.
- [ ] Privileged scopes (`admin`, `read:admin`, `write:admin`, `all`) can only be requested by users with admin privileges; non-admin users receive a `403` error.
- [ ] The raw token is returned exactly once in the creation response; subsequent list/get operations return only the last 8 characters of the hash.
- [ ] Only the SHA-256 hash of the token is stored in the database — never the raw token.

### Token Lifecycle Constraints

- [ ] A user can list all of their active tokens, seeing name, last-eight identifier, scopes, last-used timestamp, and creation timestamp.
- [ ] A user can revoke any of their own tokens by ID.
- [ ] Revoking a token takes effect immediately — all subsequent requests using that token receive `401`.
- [ ] A user cannot list, view, or revoke another user's tokens.
- [ ] There is no built-in expiration on PATs (they persist until explicitly revoked).

### Edge Cases

- [ ] Empty `Authorization` header value: treated as unauthenticated (no error, falls through to session cookie check).
- [ ] `Authorization` header with unrecognized scheme (not `Bearer` or `token`): treated as unauthenticated.
- [ ] `Authorization: Bearer codeplane_` with no characters after prefix: rejected as malformed.
- [ ] `Authorization: Bearer codeplane_XXXX` with uppercase hex: rejected as malformed (must be lowercase).
- [ ] Token belonging to a deleted user: authentication fails with `401`.
- [ ] Token belonging to a suspended/deactivated user: authentication fails with `401`.
- [ ] Concurrent requests with the same token: all succeed independently; `last_used_at` updates are eventually consistent.
- [ ] Creating a token with a name identical to an existing token: allowed (names are not unique identifiers).
- [ ] Creating a token with only whitespace as the name: rejected.
- [ ] Creating a token with an empty scopes array: rejected with a `400` error.
- [ ] Revoking a token that has already been revoked or does not exist: returns `404` (idempotent-safe for UI retry flows).

## Design

### API Shape

#### Authentication via PAT

All API endpoints accept PAT-based authentication through the standard middleware pipeline. No special endpoint is needed for "sign-in" — the token is validated on every request.

**Request:**
```
GET /api/any-endpoint
Authorization: Bearer codeplane_<40-hex-chars>
```
or
```
Authorization: token codeplane_<40-hex-chars>
```

**Success:** The request proceeds with the authenticated user's identity and token scopes loaded into context.

**Failure responses:**

| Condition | Status | Body |
|-----------|--------|------|
| Malformed token format | 401 | `{ "error": "invalid_token", "message": "Token format is invalid" }` |
| Token hash not found in database | 401 | `{ "error": "invalid_token", "message": "Invalid or revoked token" }` |
| User account inactive or suspended | 401 | `{ "error": "account_disabled", "message": "Account is disabled or suspended" }` |
| Token lacks required scope | 403 | `{ "error": "insufficient_scope", "message": "Token does not have the required scope: <scope>" }` |

#### Token Management Endpoints

**List Tokens**
```
GET /api/user/tokens
Authorization: Bearer codeplane_<token>
```
Response `200`:
```json
[
  {
    "id": "uuid",
    "name": "CI Pipeline",
    "token_last_eight": "a1b2c3d4",
    "scopes": ["read:repository", "write:repository"],
    "last_used_at": "2026-03-20T12:00:00Z",
    "created_at": "2026-01-15T08:30:00Z"
  }
]
```

**Create Token**
```
POST /api/user/tokens
Content-Type: application/json
Authorization: Bearer codeplane_<token>

{
  "name": "CI Pipeline",
  "scopes": ["write:repository", "read:user"]
}
```
Response `201`:
```json
{
  "id": "uuid",
  "name": "CI Pipeline",
  "token": "codeplane_a1b2c3d4e5f6...",
  "token_last_eight": "a1b2c3d4",
  "scopes": ["write:repository", "read:user"],
  "created_at": "2026-03-21T10:00:00Z"
}
```

**Revoke Token**
```
DELETE /api/user/tokens/:id
Authorization: Bearer codeplane_<token>
```
Response `204` (no content).

### Supported Scopes

| Scope | Description |
|-------|-------------|
| `read:repository` | Read repository contents, metadata, bookmarks, changes |
| `write:repository` | Create, modify, delete repositories and repository resources |
| `read:organization` | View organization membership and settings |
| `write:organization` | Manage organization settings and membership |
| `read:user` | View user profile and account information |
| `write:user` | Modify user settings, manage tokens and keys |
| `read:issue` | View issues and comments |
| `write:issue` | Create and modify issues and comments |
| `read:package` | View packages |
| `write:package` | Publish and manage packages |
| `read:notification` | View notifications |
| `write:notification` | Mark notifications read, manage preferences |
| `read:misc` | Read miscellaneous resources |
| `write:misc` | Write miscellaneous resources |
| `read:activitypub` | Read ActivityPub resources |
| `write:activitypub` | Write ActivityPub resources |
| `admin` | Full admin access (admin users only) |
| `read:admin` | Read admin resources (admin users only) |
| `write:admin` | Write admin resources (admin users only) |
| `all` | All permissions (admin users only) |

### Scope Aliases

| Alias | Canonical Form |
|-------|----------------|
| `repo` | `write:repository` |
| `repository` | `write:repository` |
| `org` | `write:organization` |
| `organization` | `write:organization` |
| `user` | `write:user` |

### CLI Command

**Sign in with a token from stdin:**
```bash
echo "codeplane_abc123..." | codeplane auth login --with-token
```
This reads a token from standard input, validates its format (`codeplane_` prefix + 40 hex chars), makes a verification request to the server, and stores the token in the OS credential keyring keyed by the Codeplane server hostname.

**Print current token:**
```bash
codeplane auth token
```

**Token management commands:**
```bash
codeplane auth token create "CI Deploy" --scopes write:repository,read:user
codeplane auth token list
codeplane auth token delete <token-id> --yes
```

**Token resolution order in CLI:**
1. `CODEPLANE_TOKEN` environment variable (highest priority)
2. OS keyring credential store (per-host)
3. Legacy config file token (lowest priority)

### Web UI Design

**Settings → Tokens page** (`/settings/tokens`):

- **Token list view**: Table showing all active tokens with columns: Name, Last Eight, Scopes (as tags/badges), Last Used (relative time), Created (relative time), and a Revoke action button.
- **Create token flow**: A form with:
  - Name text input (required, max 255 chars)
  - Scope multi-select or checkbox group showing available scopes organized by resource type
  - "Generate Token" primary action button
- **Token reveal**: After creation, a prominent banner displays the raw token with a copy-to-clipboard button and a warning that the token will not be shown again. The banner persists until the user navigates away or explicitly dismisses it.
- **Revoke confirmation**: Clicking "Revoke" on any token opens a confirmation dialog explaining that revocation is immediate and irreversible.
- **Empty state**: When the user has no tokens, display a helpful empty state with an explanation of what PATs are and a call-to-action to create one.

### TUI UI

The TUI does not currently expose a dedicated token management screen. Users manage tokens via the CLI or web UI. The TUI authenticates using tokens already stored in the keyring or environment variable, consistent with the CLI's token resolution order.

### Editor Integrations (VS Code, Neovim)

Editor integrations authenticate using the daemon's stored credentials or the `CODEPLANE_TOKEN` environment variable. They do not provide direct token management UI — users create and manage tokens through the CLI or web UI, and the editor integrations consume the stored token transparently.

### Documentation

The following end-user documentation should be written:

1. **"Authenticating with Personal Access Tokens"** — A guide covering: what PATs are, when to use them (CI, scripts, CLI, editors), how to create one (web UI walkthrough and CLI walkthrough), how to use one (environment variable, CLI login, direct API header), how to revoke one, and security best practices (least-privilege scopes, rotating tokens, not committing tokens to source control).
2. **"Token Scopes Reference"** — A reference table of all available scopes with descriptions of what each scope permits and example use cases.
3. **"CLI Authentication"** — A guide covering `codeplane auth login`, `codeplane auth login --with-token`, `codeplane auth token`, `codeplane auth status`, and the token resolution order (env var → keyring → config).
4. **"API Authentication"** — A reference explaining the `Authorization` header format, accepted schemes, error responses, and rate-limiting headers.

## Permissions & Security

### Authorization Roles

| Operation | Required Role |
|-----------|---------------|
| Authenticate with a PAT | Any user with an active, non-suspended account |
| Create a PAT with standard scopes | Authenticated user (any role) |
| Create a PAT with admin/all scopes | Authenticated user with `is_admin = true` |
| List own tokens | Authenticated user (any role) |
| Revoke own token | Authenticated user (any role) |
| List/revoke another user's tokens | Not permitted (no admin override) |

### Scope Enforcement

- Token scopes are enforced at the route/handler level, not in the auth middleware itself. The middleware populates the scopes into the request context, and individual route handlers or scope-checking middleware verify that the required scope is present.
- A request authenticated with a PAT that lacks the required scope receives a `403 Forbidden`, not a `401 Unauthorized`.

### Rate Limiting

- All authenticated requests are rate-limited using the authenticated user's ID as the rate-limit key: `user:{userId}`.
- Unauthenticated or failed-auth requests are rate-limited by IP address: `ip:{clientIp}`.
- Rate limit headers are included on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- When rate-limited, the response is `429 Too Many Requests` with a `Retry-After` header.
- Token creation and authentication attempts should be subject to stricter rate limits than general API usage to prevent brute-force and enumeration attacks.

### Data Privacy & Security Constraints

- **Token storage**: Only SHA-256 hashes of tokens are stored in the database. The raw token is never persisted server-side.
- **Token display**: The raw token is shown exactly once at creation time. All subsequent views show only `token_last_eight`.
- **Log sanitization**: Raw tokens must never appear in server logs, error messages, or stack traces. The middleware and logger must ensure `Authorization` header values are redacted.
- **Transport security**: Tokens should only be transmitted over HTTPS in production. The `Authorization` header is not cached by intermediaries.
- **No URL tokens**: Tokens in query strings are explicitly rejected to prevent leakage in URL logs, browser history, referrer headers, and proxy logs.
- **Keyring storage**: The CLI stores tokens in the OS-level credential store (macOS Keychain, Linux Secret Service, Windows Credential Manager), not in plaintext config files.
- **Environment variable**: The `CODEPLANE_TOKEN` environment variable is supported but users should be cautioned that environment variables may be visible in process listings.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.token_created` | User creates a new PAT | `user_id`, `token_id`, `scope_count`, `scopes` (list), `has_admin_scope` (bool), `client` (web/cli/api) |
| `auth.token_revoked` | User revokes a PAT | `user_id`, `token_id`, `token_age_days`, `was_ever_used` (bool), `client` (web/cli/api) |
| `auth.token_auth_success` | Successful PAT authentication | `user_id`, `token_id`, `token_source` ("personal_access_token"), `endpoint_path` |
| `auth.token_auth_failure` | Failed PAT authentication attempt | `failure_reason` (malformed/not_found/user_inactive/user_suspended), `client_ip` (hashed), `token_prefix` (first 10 chars only) |
| `auth.token_scope_denied` | Request denied due to insufficient token scope | `user_id`, `token_id`, `required_scope`, `token_scopes` |
| `auth.cli_token_login` | User signs in via `codeplane auth login --with-token` | `user_id`, `token_source` (stdin) |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Token adoption rate** | % of active users with at least one PAT | Growing month-over-month |
| **Token-to-first-use latency** | Time between token creation and first authenticated request | < 5 minutes for 80% of tokens |
| **Token revocation rate** | % of tokens revoked within 30 days of creation | Low (< 10%) indicates tokens are created intentionally |
| **Scope distribution** | Histogram of scopes selected at creation time | Indicates whether users understand and use fine-grained scoping |
| **CLI vs Web token creation ratio** | Proportion of tokens created via CLI vs Web UI | Balanced adoption across surfaces |
| **Auth method distribution** | % of API requests using PAT vs session cookie vs OAuth | Tracks PAT adoption as an auth method |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| PAT auth success | `debug` | `user_id`, `token_id`, `token_last_eight`, `scopes`, `endpoint` | Do NOT log raw token |
| PAT auth failure (malformed) | `warn` | `client_ip`, `user_agent`, `token_prefix_length` | Log that format validation failed, not the token itself |
| PAT auth failure (hash not found) | `warn` | `client_ip`, `user_agent` | Potential stolen/expired token |
| PAT auth failure (user inactive) | `warn` | `user_id`, `token_id`, `reason` (inactive/suspended) | Account state issue |
| Token created | `info` | `user_id`, `token_id`, `token_name`, `scopes`, `client` | Audit trail |
| Token revoked | `info` | `user_id`, `token_id`, `token_name`, `token_age_seconds` | Audit trail |
| Scope check denied | `info` | `user_id`, `token_id`, `required_scope`, `held_scopes`, `endpoint` | Authorization failure |
| Rate limit exceeded (token auth) | `warn` | `user_id` or `client_ip`, `rate_limit_key`, `limit`, `window_ms` | Abuse signal |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_auth_token_validations_total` | Counter | `result` (success/failure), `failure_reason` (malformed/not_found/user_inactive/user_suspended) | Total PAT validation attempts |
| `codeplane_auth_token_validation_duration_seconds` | Histogram | `result` | Time to validate a PAT (hash + DB lookup) |
| `codeplane_auth_tokens_active` | Gauge | — | Number of non-revoked PATs in the system |
| `codeplane_auth_token_created_total` | Counter | `scope_category` (standard/admin), `client` (web/cli/api) | Token creation rate |
| `codeplane_auth_token_revoked_total` | Counter | `client` (web/cli/api) | Token revocation rate |
| `codeplane_auth_token_scope_denied_total` | Counter | `required_scope` | Scope check failures |
| `codeplane_auth_token_last_used_update_errors_total` | Counter | — | Failures in async last_used_at updates |

### Alerts

#### Alert: High PAT Authentication Failure Rate
- **Condition**: `rate(codeplane_auth_token_validations_total{result="failure"}[5m]) / rate(codeplane_auth_token_validations_total[5m]) > 0.3` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `failure_reason` label distribution — is the spike from `malformed`, `not_found`, or `user_inactive`?
  2. If `not_found` is dominant: check if a batch of tokens was recently revoked (admin action, migration), or if a credential leak is being exploited with invalid tokens. Check IP distribution for brute-force patterns.
  3. If `malformed` is dominant: check if a client upgrade changed token format or a misconfigured CI system is sending garbage headers.
  4. If `user_inactive` is dominant: check if users were bulk-deactivated. Coordinate with admin team.
  5. If attack-like: consider temporarily increasing rate limits or blocking offending IPs at the load balancer.

#### Alert: PAT Validation Latency Spike
- **Condition**: `histogram_quantile(0.99, rate(codeplane_auth_token_validation_duration_seconds_bucket[5m])) > 0.5` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool health and query latency on the `access_tokens` table.
  2. Check if the `access_tokens` table has grown significantly — ensure index on `token_hash` column is present and healthy.
  3. Check overall database CPU/IO — this query runs on every authenticated request.
  4. If database is healthy, check if the SHA-256 hashing step is unexpectedly slow (unlikely but check CPU load).
  5. Consider adding a short-lived in-memory token validation cache if sustained.

#### Alert: Unusual Token Creation Spike
- **Condition**: `rate(codeplane_auth_token_created_total[5m]) > 10` (more than 10 tokens/sec across all users) sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if a single user is creating many tokens — query recent `auth.token_created` events grouped by `user_id`.
  2. If a single user: check for automated script misbehavior or account compromise. Consider rate-limiting token creation per user.
  3. If distributed across users: check if a deployment or onboarding wave is legitimately causing high creation rates.
  4. If admin-scoped tokens are being created: escalate immediately as a potential privilege escalation attempt.

#### Alert: Async Last-Used Update Failures
- **Condition**: `rate(codeplane_auth_token_last_used_update_errors_total[15m]) > 1` sustained for 15 minutes.
- **Severity**: Low / Informational
- **Runbook**:
  1. These are fire-and-forget updates, so failures do not affect authentication correctness.
  2. Check database write health — connection pool saturation or write contention.
  3. If persistent, the `last_used_at` data will become stale, impacting user-facing "last used" display. Not critical but worth investigating.
  4. Check for table locks or long-running transactions blocking updates.

### Error Cases and Failure Modes

| Failure Mode | Impact | Behavior |
|-------------|--------|----------|
| Database unavailable during token validation | Auth fails | Return `500 Internal Server Error`; do not fall through to unauthenticated |
| SHA-256 hash computation failure | Auth fails | Return `500`; log error; this indicates a runtime environment issue |
| Token hash collision (astronomically unlikely) | Wrong user authenticated | Mitigated by 256-bit hash space; no practical risk |
| Async `last_used_at` update fails | No user impact | Token continues to work; `last_used_at` may be stale |
| Rate limiter memory grows unbounded | Server memory pressure | Stale entry cleanup runs every 60 seconds to bound memory |
| Token created but response lost (network error) | User cannot retrieve token | User must create a new token; the orphaned token can be identified and revoked by `token_last_eight` |

## Verification

### API Integration Tests

#### Token Authentication Flow
- [ ] **Valid PAT with Bearer scheme**: Send `Authorization: Bearer codeplane_<valid>` → request succeeds with user identity in context.
- [ ] **Valid PAT with token scheme**: Send `Authorization: token codeplane_<valid>` → request succeeds identically to Bearer scheme.
- [ ] **Case-insensitive scheme**: Send `Authorization: BEARER codeplane_<valid>` → request succeeds.
- [ ] **Revoked token**: Create token, revoke it, send request → `401`.
- [ ] **Malformed token (too short)**: Send `Authorization: Bearer codeplane_abc` → `401`.
- [ ] **Malformed token (too long)**: Send `Authorization: Bearer codeplane_` + 50 hex chars → `401`.
- [ ] **Malformed token (wrong prefix)**: Send `Authorization: Bearer ghp_abc123...` → treated as unauthenticated.
- [ ] **Malformed token (uppercase hex)**: Send `Authorization: Bearer codeplane_AABBCC...` (40 uppercase hex chars) → `401`.
- [ ] **Malformed token (exactly max valid length = 46 chars)**: Send `Authorization: Bearer codeplane_<40-lowercase-hex>` → succeeds if token exists in DB.
- [ ] **Malformed token (47 chars = 1 over max)**: Send `Authorization: Bearer codeplane_<41-lowercase-hex>` → `401`.
- [ ] **Empty Authorization header**: Send `Authorization: ` → treated as unauthenticated, falls through to session check.
- [ ] **No Authorization header**: Request without header → treated as unauthenticated.
- [ ] **Token in query string**: Send `?token=codeplane_<valid>` → not authenticated (query string tokens explicitly ignored).
- [ ] **Inactive user token**: Create token for user, deactivate user, send request → `401`.
- [ ] **Suspended user token**: Create token for user, suspend user (`prohibit_login = true`), send request → `401`.
- [ ] **Concurrent requests with same token**: Send 10 concurrent requests with same PAT → all succeed, `last_used_at` is updated.
- [ ] **OAuth2 token vs PAT discrimination**: Send `Authorization: Bearer codeplane_oat_<valid>` → authenticated as OAuth2 token, not PAT; `tokenSource` is `oauth2_access_token`.

#### Token CRUD
- [ ] **Create token with valid name and scopes**: POST name="CI" scopes=["write:repository"] → `201` with `token` field matching `codeplane_[0-9a-f]{40}`.
- [ ] **Create token returns last eight**: Created token's `token_last_eight` matches last 8 chars of the SHA-256 hash.
- [ ] **Create token with empty name**: POST name="" → `400` error.
- [ ] **Create token with whitespace-only name**: POST name="   " → `400` error.
- [ ] **Create token with maximum-length name (255 chars)**: POST name=(255 char string) → `201` success.
- [ ] **Create token with name exceeding 255 chars**: POST name=(256 char string) → `400` error.
- [ ] **Create token with empty scopes array**: POST scopes=[] → `400` error.
- [ ] **Create token with unknown scope**: POST scopes=["write:nonexistent"] → `400` error.
- [ ] **Create token with duplicate scopes**: POST scopes=["write:repository", "write:repository"] → `201` with deduplicated scopes.
- [ ] **Create token with alias scopes**: POST scopes=["repo"] → `201` with normalized scope `write:repository`.
- [ ] **Create token with admin scope as non-admin user**: POST scopes=["admin"] → `403`.
- [ ] **Create token with admin scope as admin user**: POST scopes=["admin"] → `201`.
- [ ] **Create token with "all" scope as non-admin user**: POST scopes=["all"] → `403`.
- [ ] **List tokens**: GET /api/user/tokens → `200` with array; no `token` field in response items (raw token not disclosed).
- [ ] **List tokens shows last_used_at**: After using a token, list tokens → `last_used_at` is populated.
- [ ] **List tokens isolation**: User A cannot see User B's tokens.
- [ ] **Revoke token**: DELETE /api/user/tokens/:id → `204`; subsequent auth with that token → `401`.
- [ ] **Revoke nonexistent token**: DELETE /api/user/tokens/nonexistent-uuid → `404`.
- [ ] **Revoke another user's token**: User A tries to DELETE User B's token by ID → `404` (not found in User A's token set).

#### Scope Authorization
- [ ] **Read-only token on read endpoint**: Token with `read:repository` on GET /api/repos/:owner/:repo → `200`.
- [ ] **Read-only token on write endpoint**: Token with `read:repository` on POST /api/repos → `403`.
- [ ] **Write token on write endpoint**: Token with `write:repository` on POST /api/repos → `201` (assuming valid payload).
- [ ] **Token with write:user can create tokens**: Token with `write:user` scope on POST /api/user/tokens → `201`.
- [ ] **Token without write:user cannot create tokens**: Token with only `read:repository` on POST /api/user/tokens → `403`.

#### Rate Limiting
- [ ] **Rate limit headers present**: Any authenticated request returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.
- [ ] **Rate limit exhaustion**: Exceed rate limit → `429` with `Retry-After` header.
- [ ] **Rate limit by user ID**: Two different tokens for the same user share the same rate limit bucket.
- [ ] **Rate limit by IP for failed auth**: Multiple failed auth attempts from same IP → eventually rate-limited.

### CLI E2E Tests

- [ ] **Login with valid token from stdin**: `echo "codeplane_<valid>" | codeplane auth login --with-token` → success message, token stored in keyring.
- [ ] **Login with invalid token from stdin**: `echo "bad_token" | codeplane auth login --with-token` → error message about invalid format.
- [ ] **Login with revoked token from stdin**: `echo "codeplane_<revoked>" | codeplane auth login --with-token` → error about invalid/revoked token.
- [ ] **Auth status after token login**: `codeplane auth status` → shows authenticated user info.
- [ ] **Auth token print**: `codeplane auth token` → prints stored token to stdout.
- [ ] **Token create via CLI**: `codeplane auth token create "test" --scopes write:repository` → prints new token matching `codeplane_[0-9a-f]{40}`.
- [ ] **Token list via CLI**: `codeplane auth token list` → shows table of tokens with name, last-eight, scopes.
- [ ] **Token delete via CLI**: `codeplane auth token delete <id> --yes` → success message.
- [ ] **Token delete without --yes**: `codeplane auth token delete <id>` → prompts for confirmation (or errors in non-interactive mode).
- [ ] **CODEPLANE_TOKEN environment variable**: Set `CODEPLANE_TOKEN=codeplane_<valid>`, run `codeplane auth status` → authenticated as expected user.
- [ ] **CODEPLANE_TOKEN takes precedence over keyring**: Set `CODEPLANE_TOKEN` to User A's token, keyring has User B's token → `codeplane auth status` shows User A.
- [ ] **CLI command with read-only token on write operation**: Token with `read:repository` attempts `codeplane repo create` → `403` error.

### Playwright (Web UI) E2E Tests

- [ ] **Navigate to Settings → Tokens**: Authenticated user can navigate to token management page and see the token list.
- [ ] **Create token via UI**: Fill in name, select scopes, click "Generate Token" → new token displayed with copy button.
- [ ] **Token shown only once**: After navigating away from the creation result and returning to the token list, the raw token is not displayed — only `token_last_eight`.
- [ ] **Copy token to clipboard**: Click copy button on newly created token → clipboard contains valid `codeplane_` token.
- [ ] **Revoke token via UI**: Click "Revoke" on a token → confirmation dialog appears → confirm → token removed from list.
- [ ] **Revoke confirmation cancel**: Click "Revoke" → click cancel in confirmation → token remains in list.
- [ ] **Token list shows metadata**: Token list displays name, scopes as badges, last used timestamp, created timestamp.
- [ ] **Empty state**: User with no tokens sees an empty state message with a prompt to create one.
- [ ] **Form validation — empty name**: Submit with empty name → validation error shown.
- [ ] **Form validation — no scopes selected**: Submit with no scopes → validation error shown.

### Security-Focused Tests

- [ ] **Token not in server logs**: Create and use a token, then search server log output → raw token string does not appear in any log line.
- [ ] **Token hash is stored, not raw**: After token creation, query the database `access_tokens` table → `token_hash` column contains a SHA-256 hash, no column contains the raw token.
- [ ] **Revoked token immediate invalidation**: Revoke a token and immediately (within 1 second) attempt to use it → `401`.
- [ ] **Deleted user's token**: Delete a user account, attempt to use their token → `401`.

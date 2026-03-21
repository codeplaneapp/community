# AUTH_SESSION_COOKIE_ISSUANCE

Specification for AUTH_SESSION_COOKIE_ISSUANCE.

## High-Level User POV

When a user signs into Codeplane — whether through GitHub OAuth, key-based authentication, or any other supported sign-in method — they expect to be seamlessly recognized on every subsequent page load and API interaction without having to re-authenticate. Session cookie issuance is the invisible mechanism that makes this possible.

From the user's perspective, the experience is straightforward. They click "Sign in with GitHub" or complete a key-based authentication challenge, and from that moment forward they are "logged in." They can browse repositories, create issues, submit landing requests, manage workflows, and interact with every Codeplane surface. Their session persists across browser tabs, survives page refreshes, and remains valid for up to 30 days unless they explicitly sign out or an administrator revokes it.

Users also have full visibility into their active sessions. From their account settings, they can see every device or browser where they are currently signed in, along with when each session was created and when it will expire. If they notice a session they don't recognize, they can revoke it immediately, which instantly signs out that device. When they click "Log out," their current session is destroyed and they must sign in again to regain access.

For CLI users, the flow is slightly different. The CLI opens a browser window for OAuth, and instead of receiving a session cookie (which browsers use), the CLI receives a personal access token. This token is stored locally by the CLI and used for subsequent API calls. The CLI user never has to think about cookies — the tool handles credential storage transparently.

The value of this feature is foundational trust. Users trust that their identity is securely maintained across interactions, that unauthorized parties cannot hijack their sessions, and that they retain full control over where and how long they remain signed in.

## Acceptance Criteria

### Definition of Done

- [ ] A user who completes any supported sign-in flow (GitHub OAuth, key-based auth) receives a session cookie that authenticates all subsequent HTTP requests automatically.
- [ ] The session cookie is issued with `HttpOnly`, `SameSite=Lax`, and a configurable `Secure` flag.
- [ ] Session cookies have a configurable maximum lifetime defaulting to 30 days (720 hours).
- [ ] Both `Expires` and `Max-Age` are set on the cookie to maximize cross-browser compatibility.
- [ ] The cookie path is set to `/` so it applies to all API and UI routes.
- [ ] A CSRF token cookie (`__csrf`) is set alongside the session cookie during key-based auth flows, with `SameSite=Strict` and `HttpOnly=false` (so client-side JavaScript can read it for form submissions).
- [ ] The session cookie name defaults to `codeplane_session` and is configurable via environment variable.
- [ ] Session keys are cryptographically random UUIDs.
- [ ] Sessions are persisted to the database with `session_key`, `user_id`, `username`, `is_admin`, `expires_at`, `created_at`, and `updated_at` fields.
- [ ] The auth middleware validates session cookies on every request by looking up the session key in the database and checking the `expires_at` timestamp.
- [ ] Expired sessions are rejected even if the cookie is still present in the browser.
- [ ] Token-based authentication (`Authorization: Bearer codeplane_*` or `Authorization: token codeplane_*`) takes priority over cookie-based authentication when both are present.
- [ ] A `POST /api/auth/logout` request deletes the session from the database and clears the session cookie.
- [ ] Users can list all their active sessions via `GET /api/user/sessions`.
- [ ] Users can revoke any of their own sessions via `DELETE /api/user/sessions/:id`.
- [ ] Users cannot revoke sessions belonging to other users.
- [ ] Revoking a session immediately invalidates it; subsequent requests with that session cookie are rejected.
- [ ] The CLI OAuth flow does NOT issue a session cookie; it issues an API token instead and delivers it via URL fragment to a local callback port.
- [ ] If closed-alpha mode is enabled, session issuance is blocked for users not on the allowlist, even if the OAuth or key-based flow succeeds.

### Edge Cases

- [ ] If a user signs in from multiple browsers/devices simultaneously, each receives an independent session with its own expiration.
- [ ] If the session cookie value is empty, whitespace-only, or not a valid UUID, the auth middleware silently skips cookie auth and treats the request as unauthenticated.
- [ ] If a session exists in the database but `expires_at` is in the past, the request is treated as unauthenticated.
- [ ] If a user's account is deleted or disabled (`prohibit_login` is true), existing sessions should not grant access.
- [ ] If the `CODEPLANE_AUTH_SESSION_DURATION` environment variable contains an unparseable value, the server falls back to the 720-hour default.
- [ ] If GitHub OAuth callback receives an invalid or expired state parameter, the flow fails with a clear error and no session cookie is issued.
- [ ] OAuth state parameters are single-use; replaying a callback URL does not issue a second session.
- [ ] Key-based auth nonces are single-use; replaying a verification request does not issue a second session.
- [ ] Nonces and OAuth states expire after 10 minutes if unused.
- [ ] Logging out with an already-invalid or missing session cookie is a no-op (no error returned).

### Boundary Constraints

- [ ] Session cookie name maximum length: 128 characters.
- [ ] Session duration minimum: 1 minute. Maximum: 8760 hours (1 year). Default: 720 hours (30 days).
- [ ] Session duration format supports Go-style duration strings: `"720h"`, `"30m"`, `"24h"`, `"1h30m"`.
- [ ] Session key: standard UUID v4 format (36 characters including hyphens).
- [ ] OAuth state parameter: cryptographically random, verified via SHA-256 hash comparison.
- [ ] Key-based auth nonce: 32-character hex string (16 random bytes).
- [ ] The `codeplane_session` cookie value must never contain PII — it is an opaque session identifier only.

## Design

### API Shape

#### Sign-In Flows That Issue Session Cookies

**Key-Based Authentication:**

```
GET  /api/auth/key/nonce
  Response: { nonce: string }

POST /api/auth/key/verify
  Body: { message: string, signature: string }
  Response: { user: { id, username, isAdmin } }
  Side Effect: Sets `codeplane_session` cookie and `__csrf` cookie
```

**GitHub OAuth:**

```
GET  /api/auth/github
  Query: (none)
  Side Effect: Sets `codeplane_oauth_state` cookie, redirects to GitHub

GET  /api/auth/github/callback
  Query: { code: string, state: string }
  Side Effect: Sets `codeplane_session` cookie, clears `codeplane_oauth_state` cookie, redirects to "/"
```

**CLI-Specific OAuth (no session cookie):**

```
GET  /api/auth/github/cli
  Query: { callback_port: number }
  Side Effect: Sets `codeplane_cli_callback` cookie, redirects to GitHub

GET  /api/auth/github/callback (with CLI callback cookie present)
  Side Effect: Does NOT set session cookie. Creates API token. Redirects to http://127.0.0.1:{port}/callback#token={token}
```

#### Session Management

```
GET    /api/user/sessions
  Auth: Required (cookie or token)
  Response: [ { id: string, created_at: string, expires_at: string } ]

DELETE /api/user/sessions/:id
  Auth: Required (cookie or token)
  Response: 204 No Content
  Error: 404 if session not found or not owned by user

POST   /api/auth/logout
  Auth: Required (cookie)
  Side Effect: Deletes session from database, clears `codeplane_session` cookie
  Response: 200 OK
```

#### Authentication Middleware Behavior

Every API request passes through the auth middleware, which:
1. First checks for `Authorization` header with a `codeplane_` prefixed token.
2. If no token, checks for `codeplane_session` cookie.
3. Validates the session key against the database and checks expiration.
4. Populates the request context with the authenticated user (or leaves it null for anonymous requests).

### Web UI Design

**Sign-In Page:**
- Displays "Sign in with GitHub" button.
- Displays key-based authentication option (sign a challenge).
- On successful sign-in, the user is redirected to the dashboard or the page they were trying to access.

**User Settings → Sessions:**
- Displays a table of active sessions with columns: Session ID (truncated), Created, Expires.
- Each row has a "Revoke" button.
- The current session is visually indicated (e.g., badge reading "Current session").
- Revoking the current session logs the user out immediately.

**Sign-Out:**
- Available from the user menu in the sidebar/header.
- Clicking "Sign out" calls `POST /api/auth/logout` and redirects to the login page.

### CLI Command

The CLI does not directly manage session cookies. Instead:

```
codeplane auth login
  Opens browser for GitHub OAuth.
  Receives API token via local callback.
  Stores token in local config (~/.config/codeplane/auth.json or equivalent).

codeplane auth logout
  Clears locally stored token.
  Optionally calls server to revoke the token.

codeplane auth status
  Displays current authentication state (logged in as username, token scopes, expiration).
```

### SDK Shape

The SDK exposes the following auth service interface:

```typescript
interface AuthService {
  createKeyAuthNonce(): Promise<string>;
  verifyKeyAuth(message: string, signature: string): Promise<VerifyKeyAuthResult>;
  completeGitHubOAuth(code: string, state: string, stateVerifier: string): Promise<OAuthCallbackResult>;
  logout(sessionKey: string): Promise<void>;
  listUserSessions(userId: string): Promise<SessionResponse[]>;
  revokeUserSession(userId: string, sessionKey: string): Promise<void>;
}

interface VerifyKeyAuthResult {
  user: { id: string; username: string; isAdmin: boolean; prohibitLogin: boolean };
  sessionKey: string;
  expiresAt: Date;
}

interface OAuthCallbackResult {
  user: { id: string; username: string; isAdmin: boolean; prohibitLogin: boolean };
  sessionKey: string;
  expiresAt: Date;
  redirectUrl: string;
}

interface SessionResponse {
  id: string;
  created_at: string;
  expires_at: string;
}

interface AuthConfig {
  sessionCookieName: string;       // Default: "codeplane_session"
  cookieSecure: boolean;           // Default: false (set true for production HTTPS)
  sessionDuration: string;         // Default: "720h"
  closedAlphaEnabled: boolean;
  githubClientId: string;
  githubClientSecret: string;
  githubRedirectUrl: string;
  githubOAuthBaseUrl: string;
}
```

### Documentation

End-user documentation should include:

1. **Authentication Guide** — explains how to sign in via GitHub OAuth and key-based auth, what sessions are, and how long they last.
2. **Managing Sessions** — how to view active sessions in account settings and revoke sessions from unrecognized devices.
3. **CLI Authentication** — how `codeplane auth login` works, where credentials are stored, and how to revoke CLI tokens.
4. **Self-Hosting: Auth Configuration** — documents the environment variables that control session cookie behavior (`CODEPLANE_AUTH_SESSION_COOKIE_NAME`, `CODEPLANE_AUTH_COOKIE_SECURE`, `CODEPLANE_AUTH_SESSION_DURATION`) and when to enable the `Secure` flag.
5. **Security Best Practices** — advises users to sign out on shared devices, periodically review active sessions, and enable HTTPS for production deployments.

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| Sign in (any method) | Anonymous (unauthenticated) |
| Receive session cookie | Successfully authenticated user (not blocked by closed-alpha) |
| List own sessions | Authenticated user |
| Revoke own session | Authenticated user |
| Revoke another user's session | Not permitted (returns 404) |
| Admin: view/revoke any session | Admin role (via admin panel) |
| Configure session duration | Server operator (environment variable) |

### Rate Limiting

- **Sign-in endpoints** (`/api/auth/key/nonce`, `/api/auth/key/verify`, `/api/auth/github`): Rate-limited to **10 requests per minute per IP** to prevent brute-force and nonce-harvesting attacks.
- **OAuth callback** (`/api/auth/github/callback`): Rate-limited to **20 requests per minute per IP** (higher because legitimate redirects from GitHub can burst).
- **Logout** (`/api/auth/logout`): Rate-limited to **30 requests per minute per user** (idempotent, low risk).
- **Session listing** (`/api/user/sessions`): Rate-limited to **60 requests per minute per user**.
- **Session revocation** (`/api/user/sessions/:id`): Rate-limited to **20 requests per minute per user**.

### Data Privacy and PII

- Session cookies contain only an opaque UUID. No PII (username, email, user ID) is stored in the cookie value.
- The `auth_sessions` table stores `user_id` and `username` for denormalized lookup efficiency. This is internal server-side data and is never exposed in the cookie.
- Session listing responses expose only `id`, `created_at`, and `expires_at` — no IP addresses, user agents, or geolocation.
- OAuth state cookies and CSRF cookies are ephemeral and contain no PII.
- Server logs must NOT log session key values. Log only truncated or hashed identifiers.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.session.created` | Session cookie successfully issued | `auth_method` (github_oauth, key_auth), `user_id`, `session_duration_hours`, `is_new_user` (boolean), `is_admin` |
| `auth.session.expired` | Middleware rejects an expired session | `user_id`, `session_age_hours` |
| `auth.session.revoked` | User explicitly revokes a session | `user_id`, `was_current_session` (boolean) |
| `auth.session.logout` | User clicks log out | `user_id`, `session_age_hours` |
| `auth.oauth.started` | User initiates GitHub OAuth flow | `flow_type` (web, cli), `referrer_path` |
| `auth.oauth.completed` | GitHub OAuth callback succeeds | `user_id`, `is_new_user`, `had_existing_sessions` (boolean) |
| `auth.oauth.failed` | GitHub OAuth callback fails | `error_reason` (invalid_state, expired_state, github_error, closed_alpha) |
| `auth.key.nonce_requested` | Nonce generated for key-based auth | `ip_hash` (anonymized) |
| `auth.key.verify_succeeded` | Key-based auth verification succeeds | `user_id`, `is_new_user` |
| `auth.key.verify_failed` | Key-based auth verification fails | `error_reason` (invalid_signature, expired_nonce, used_nonce, closed_alpha) |
| `auth.cli.token_issued` | CLI receives API token via OAuth | `user_id`, `scopes` |

### Funnel Metrics

1. **Sign-In Conversion Rate**: `auth.oauth.completed` / `auth.oauth.started` — target: >90%.
2. **Session Longevity**: median and p95 of `session_age_hours` at logout/expiration — indicates whether session duration is well-calibrated.
3. **Active Sessions per User**: distribution of concurrent active sessions — detect anomalies (e.g., bot accounts with hundreds of sessions).
4. **Session Revocation Rate**: `auth.session.revoked` / total active sessions — a high rate may indicate security concerns.
5. **Auth Method Distribution**: ratio of `github_oauth` vs `key_auth` sessions — informs which auth methods to prioritize.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Session created | `INFO` | `user_id`, `auth_method`, `session_key_prefix` (first 8 chars only), `expires_at` |
| Session validated (middleware) | `DEBUG` | `user_id`, `session_key_prefix` |
| Session expired (middleware rejection) | `WARN` | `user_id`, `session_key_prefix`, `expired_at` |
| Session revoked | `INFO` | `user_id`, `revoked_session_key_prefix`, `by_user_id` |
| Logout | `INFO` | `user_id`, `session_key_prefix` |
| OAuth flow started | `INFO` | `flow_type`, `request_id` |
| OAuth callback success | `INFO` | `user_id`, `is_new_user`, `request_id` |
| OAuth callback failure | `WARN` | `error_reason`, `request_id` |
| Key auth nonce created | `DEBUG` | `nonce_prefix` (first 8 chars), `request_id` |
| Key auth verify success | `INFO` | `user_id`, `request_id` |
| Key auth verify failure | `WARN` | `error_reason`, `request_id` |
| Closed-alpha rejection | `WARN` | `attempted_identifier`, `auth_method`, `request_id` |
| Invalid session cookie format | `DEBUG` | `cookie_value_length`, `request_id` |
| Rate limit hit on auth endpoint | `WARN` | `endpoint`, `ip_hash`, `request_id` |

**CRITICAL:** Session key values must NEVER be logged in full. Only the first 8 characters (prefix) may be logged for correlation purposes.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_auth_sessions_created_total` | Counter | `auth_method`, `is_new_user` | Total sessions issued |
| `codeplane_auth_sessions_active` | Gauge | — | Current count of non-expired sessions in the database |
| `codeplane_auth_sessions_expired_total` | Counter | — | Sessions rejected by middleware due to expiration |
| `codeplane_auth_sessions_revoked_total` | Counter | `revoke_type` (user, admin, logout) | Sessions explicitly revoked |
| `codeplane_auth_session_duration_seconds` | Histogram | `auth_method` | Observed session lifetime from creation to invalidation |
| `codeplane_auth_oauth_flow_duration_seconds` | Histogram | `flow_type` (web, cli) | Time from OAuth start to callback completion |
| `codeplane_auth_oauth_failures_total` | Counter | `error_reason` | OAuth flow failures |
| `codeplane_auth_key_verify_failures_total` | Counter | `error_reason` | Key-based auth failures |
| `codeplane_auth_middleware_duration_seconds` | Histogram | `auth_type` (cookie, token, none) | Time spent in auth middleware per request |
| `codeplane_auth_rate_limit_hits_total` | Counter | `endpoint` | Rate limit rejections on auth endpoints |

### Alerts and Runbooks

#### Alert: `AuthSessionCreationSpikeAlert`
- **Condition**: `rate(codeplane_auth_sessions_created_total[5m]) > 50`
- **Severity**: Warning
- **Runbook**:
  1. Check if a legitimate traffic spike is occurring (product launch, marketing campaign).
  2. Check rate limit metrics — are limits being hit? If not, consider tightening them.
  3. Look for a single IP or user agent dominating session creation (bot attack).
  4. If malicious, temporarily block the offending IP at the load balancer level.
  5. Verify no OAuth client credentials have been leaked (check GitHub OAuth app settings).

#### Alert: `AuthOAuthFailureRateHighAlert`
- **Condition**: `rate(codeplane_auth_oauth_failures_total[10m]) / rate(codeplane_auth_oauth_flow_duration_seconds_count[10m]) > 0.2`
- **Severity**: Critical
- **Runbook**:
  1. Check the `error_reason` label distribution — is it primarily `invalid_state`, `expired_state`, or `github_error`?
  2. If `github_error`: verify GitHub OAuth app credentials are still valid. Check GitHub's status page for outages.
  3. If `invalid_state` or `expired_state`: check if the server recently restarted (state stored in DB should survive restarts; if not, investigate DB connectivity).
  4. If `closed_alpha`: verify the allowlist is correctly configured and not accidentally empty.
  5. Check server clock synchronization (NTP) — clock skew can cause premature state expiration.

#### Alert: `AuthMiddlewareLatencyHighAlert`
- **Condition**: `histogram_quantile(0.99, codeplane_auth_middleware_duration_seconds) > 0.5`
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool health — auth middleware performs a DB lookup on every request.
  2. Run `EXPLAIN ANALYZE` on the session lookup query to check for missing indexes on `session_key`.
  3. Check if the `auth_sessions` table has grown excessively (millions of expired rows). Schedule a cleanup job.
  4. Verify PGLite performance if running in daemon/desktop mode.

#### Alert: `AuthSessionRevocationAnomalyAlert`
- **Condition**: `rate(codeplane_auth_sessions_revoked_total[1h]) > 20`
- **Severity**: Warning
- **Runbook**:
  1. Check if an admin is performing bulk session cleanup (legitimate).
  2. Check if a user is repeatedly revoking and re-creating sessions (possible automation issue).
  3. Verify the session listing UI is working correctly and not triggering accidental revocations.
  4. Look at the user distribution — is a single user account compromised and being cleaned up?

#### Alert: `AuthExpiredSessionAccessHighAlert`
- **Condition**: `rate(codeplane_auth_sessions_expired_total[5m]) > 30`
- **Severity**: Info
- **Runbook**:
  1. This typically indicates many users' sessions expired simultaneously (e.g., 30 days after a launch event).
  2. Verify the session cleanup scheduler is running — expired sessions should be purged periodically.
  3. Check if session duration was recently shortened, causing mass expiration.
  4. No action needed unless accompanied by user complaints about unexpected logouts.

### Error Cases and Failure Modes

| Error Case | Behavior | HTTP Status |
|------------|----------|-------------|
| Database unavailable during session creation | Sign-in fails, no cookie issued | 500 |
| Database unavailable during middleware validation | Request treated as unauthenticated | Varies (200 for public, 401 for protected) |
| GitHub OAuth service unavailable | OAuth flow fails at callback | 502 |
| Invalid OAuth state (CSRF attack or expired) | No session issued, error response | 400 |
| Replayed OAuth callback (state already used) | No session issued, error response | 400 |
| Replayed key-auth nonce (nonce already used) | No session issued, error response | 400 |
| Invalid cryptographic signature (key auth) | No session issued, error response | 401 |
| Closed-alpha rejection | No session issued, forbidden response | 403 |
| Cookie present but session deleted from DB | Request treated as unauthenticated | 401 on protected routes |
| Cookie present but session expired | Request treated as unauthenticated | 401 on protected routes |
| Malformed cookie value (not UUID) | Cookie ignored silently, request unauthenticated | Varies |
| Session revocation for non-owned session | Not found response | 404 |

## Verification

### API Integration Tests

#### Session Cookie Issuance via Key-Based Auth
- [ ] `test: key auth nonce endpoint returns a 32-char hex nonce`
- [ ] `test: key auth verify with valid signature returns 200 and sets codeplane_session cookie`
- [ ] `test: session cookie has HttpOnly flag set`
- [ ] `test: session cookie has SameSite=Lax`
- [ ] `test: session cookie has Secure flag when CODEPLANE_AUTH_COOKIE_SECURE=true`
- [ ] `test: session cookie does NOT have Secure flag when CODEPLANE_AUTH_COOKIE_SECURE is unset`
- [ ] `test: session cookie path is /`
- [ ] `test: session cookie Max-Age matches configured session duration`
- [ ] `test: session cookie Expires header is set and matches Max-Age`
- [ ] `test: CSRF cookie (__csrf) is set alongside session cookie with SameSite=Strict and HttpOnly=false`
- [ ] `test: key auth verify with invalid signature returns 401 and does NOT set session cookie`
- [ ] `test: key auth verify with expired nonce returns 400`
- [ ] `test: key auth verify with already-used nonce returns 400`
- [ ] `test: key auth verify for closed-alpha-blocked user returns 403`

#### Session Cookie Issuance via GitHub OAuth
- [ ] `test: GitHub OAuth initiation sets codeplane_oauth_state cookie and redirects to GitHub`
- [ ] `test: GitHub OAuth callback with valid code and state creates session and sets codeplane_session cookie`
- [ ] `test: GitHub OAuth callback redirects to / after successful sign-in`
- [ ] `test: GitHub OAuth callback with invalid state returns 400 and no session cookie`
- [ ] `test: GitHub OAuth callback with expired state returns 400`
- [ ] `test: GitHub OAuth callback with already-used state returns 400`
- [ ] `test: GitHub OAuth callback for new user creates user account and issues session`
- [ ] `test: GitHub OAuth callback for existing user updates OAuth account and issues new session`
- [ ] `test: GitHub OAuth callback for closed-alpha-blocked user returns 403`

#### CLI OAuth Flow (No Session Cookie)
- [ ] `test: CLI OAuth flow sets codeplane_cli_callback cookie and redirects to GitHub`
- [ ] `test: CLI OAuth callback does NOT set codeplane_session cookie`
- [ ] `test: CLI OAuth callback redirects to local callback URL with token in fragment`
- [ ] `test: CLI OAuth callback creates API token with codeplane_ prefix`

#### Session Validation via Middleware
- [ ] `test: request with valid session cookie is authenticated`
- [ ] `test: request with expired session cookie is treated as unauthenticated`
- [ ] `test: request with deleted session cookie value is treated as unauthenticated`
- [ ] `test: request with empty session cookie is treated as unauthenticated`
- [ ] `test: request with non-UUID session cookie value is treated as unauthenticated`
- [ ] `test: request with whitespace-only session cookie is treated as unauthenticated`
- [ ] `test: token auth takes priority when both Authorization header and session cookie are present`
- [ ] `test: invalid token with valid session cookie falls through to cookie auth`
- [ ] `test: request with no auth credentials is treated as unauthenticated`

#### Session Lifetime and Configuration
- [ ] `test: default session duration is 720 hours (30 days)`
- [ ] `test: session duration respects CODEPLANE_AUTH_SESSION_DURATION=24h`
- [ ] `test: session duration respects CODEPLANE_AUTH_SESSION_DURATION=30m`
- [ ] `test: invalid CODEPLANE_AUTH_SESSION_DURATION falls back to 720h default`
- [ ] `test: custom session cookie name via CODEPLANE_AUTH_SESSION_COOKIE_NAME works for issuance and validation`

#### Logout
- [ ] `test: POST /api/auth/logout clears codeplane_session cookie`
- [ ] `test: POST /api/auth/logout deletes session from database`
- [ ] `test: subsequent requests after logout are unauthenticated`
- [ ] `test: logout with no session cookie is a no-op (returns 200)`
- [ ] `test: logout with already-expired session is a no-op (returns 200)`
- [ ] `test: logout with malformed session cookie value is a no-op (returns 200)`

#### Session Management
- [ ] `test: GET /api/user/sessions returns all active sessions for authenticated user`
- [ ] `test: GET /api/user/sessions returns id, created_at, and expires_at for each session`
- [ ] `test: GET /api/user/sessions does not return sessions for other users`
- [ ] `test: DELETE /api/user/sessions/:id revokes an owned session`
- [ ] `test: DELETE /api/user/sessions/:id returns 404 for non-existent session`
- [ ] `test: DELETE /api/user/sessions/:id returns 404 for session owned by different user`
- [ ] `test: revoked session is immediately invalid for authentication`
- [ ] `test: revoking current session effectively logs out the user`
- [ ] `test: user with multiple sessions can revoke one without affecting others`

#### Concurrent and Multi-Device Sessions
- [ ] `test: signing in from two different contexts creates two independent sessions`
- [ ] `test: both concurrent sessions are independently valid`
- [ ] `test: revoking one session does not affect the other`

#### Boundary and Size Tests
- [ ] `test: session cookie with maximum valid UUID format (36 chars) is accepted`
- [ ] `test: session cookie with value exceeding 36 characters is rejected`
- [ ] `test: session cookie with value of exactly 0 characters is rejected`
- [ ] `test: session duration of exactly 1 minute (minimum) creates valid session`
- [ ] `test: session duration of exactly 8760 hours (maximum) creates valid session`

### End-to-End (E2E) Tests — Playwright

- [ ] `e2e: user clicks "Sign in with GitHub" and is redirected to GitHub OAuth`
- [ ] `e2e: after GitHub OAuth callback, user lands on dashboard as authenticated user`
- [ ] `e2e: authenticated user can navigate to repository pages without re-authenticating`
- [ ] `e2e: user visits Settings > Sessions and sees current session listed`
- [ ] `e2e: user revokes a session from the Sessions settings page and it disappears from the list`
- [ ] `e2e: user clicks "Sign out" and is redirected to login page`
- [ ] `e2e: after sign out, navigating to a protected page redirects to login`
- [ ] `e2e: session persists across page reload (cookie-based persistence)`
- [ ] `e2e: expired session results in redirect to login on next page navigation`

### CLI Integration Tests

- [ ] `cli: codeplane auth login opens browser and receives token via local callback`
- [ ] `cli: codeplane auth status shows authenticated state after login`
- [ ] `cli: codeplane auth logout clears local credentials`
- [ ] `cli: after logout, CLI commands requiring auth fail with clear error message`
- [ ] `cli: CLI uses token auth (Authorization header), not session cookies`

### Security-Focused Tests

- [ ] `security: session cookie value does not contain any PII`
- [ ] `security: session cookie is not accessible via document.cookie (HttpOnly)`
- [ ] `security: OAuth state cannot be reused (replay attack prevention)`
- [ ] `security: key-auth nonce cannot be reused (replay attack prevention)`
- [ ] `security: cross-origin requests cannot read session cookie (SameSite=Lax)`
- [ ] `security: session cookie is not sent on cross-origin POST requests (SameSite=Lax)`
- [ ] `security: expired OAuth state (>10 minutes) is rejected`
- [ ] `security: expired key-auth nonce (>10 minutes) is rejected`

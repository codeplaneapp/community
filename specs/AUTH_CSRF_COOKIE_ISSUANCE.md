# AUTH_CSRF_COOKIE_ISSUANCE

Specification for AUTH_CSRF_COOKIE_ISSUANCE.

## High-Level User POV

When a user signs into Codeplane through the web application — whether using GitHub OAuth or key-based challenge/response authentication — the system must silently and automatically protect all subsequent interactions against cross-site request forgery (CSRF) attacks. This protection happens invisibly: the user never sees a CSRF token, never copies one, and never has to think about it. They simply sign in and begin working.

Behind the scenes, the moment authentication succeeds, Codeplane issues a special anti-forgery cookie alongside the session cookie. This CSRF cookie is designed so that the Codeplane web application can read it and include its value as a header on every state-changing request (creating issues, submitting landing requests, changing settings, and so on). If a malicious third-party website tried to trick the user's browser into performing an action on Codeplane, the request would fail because the attacker's page cannot read Codeplane's CSRF cookie and therefore cannot supply the matching header.

The value of this feature is invisible but critical: it ensures that a user's authenticated session cannot be hijacked by another website. Every web-based mutation in Codeplane — from creating a repository to approving a landing request — is protected by this mechanism. The user's only experience is that things "just work" securely. If they sign out, the CSRF cookie is cleaned up along with the session, leaving no stale security artifacts in the browser.

For CLI, TUI, desktop, and editor users who authenticate via personal access tokens or API tokens, CSRF protection is not relevant because those clients authenticate with an Authorization header per-request rather than ambient browser cookies. The CSRF cookie is exclusively a web-session concern.

## Acceptance Criteria

### Core Issuance

- [ ] When a user successfully authenticates via GitHub OAuth (web flow), a CSRF cookie named `__csrf` is set in the response alongside the session cookie.
- [ ] When a user successfully authenticates via key-based challenge/response (`POST /api/auth/key/verify`), a CSRF cookie named `__csrf` is set in the response alongside the session cookie.
- [ ] The CSRF cookie is **not** set for CLI OAuth flows. When the `codeplane_cli_callback` cookie is present during the OAuth callback, only the API token redirect occurs — no session cookie and no CSRF cookie.
- [ ] The CSRF cookie is **not** set for direct token creation flows (`POST /api/auth/key/token`). Token-based auth does not use cookies.

### Cookie Attributes

- [ ] **Name**: The cookie name is exactly `__csrf` (two leading underscores, lowercase).
- [ ] **Value**: The cookie value is a cryptographically random 64-character hexadecimal string (32 random bytes encoded as hex).
- [ ] **httpOnly**: `false`. The cookie must be readable by client-side JavaScript so the web application can extract the token and include it in request headers.
- [ ] **SameSite**: `Strict`. The cookie must never be sent on cross-site requests of any kind, including top-level navigations.
- [ ] **Secure**: Controlled by the `CODEPLANE_AUTH_COOKIE_SECURE` environment variable. When `true`, the cookie is only transmitted over HTTPS. When `false` or unset, the cookie is also transmitted over HTTP (for local development).
- [ ] **Path**: `/`. The cookie is available to all paths on the Codeplane domain.
- [ ] **Domain**: Not explicitly set (defaults to the current host).
- [ ] **Max-Age / Expires**: Not explicitly set. The cookie is a session cookie that expires when the browser session ends.

### Token Generation

- [ ] The CSRF token is generated using `crypto.getRandomValues()` or an equivalent CSPRNG.
- [ ] Each authentication event generates a fresh, unique CSRF token. Tokens are never reused across logins.
- [ ] The token value contains exactly 64 hex characters (0-9, a-f). No uppercase characters, no non-hex characters.
- [ ] The randomness source provides at least 256 bits of entropy (32 bytes).

### Cookie Clearance

- [ ] When a user logs out via `POST /api/auth/logout`, the `__csrf` cookie is cleared by setting it to an empty string with `maxAge=-1` and `expires` in the past.
- [ ] The cleared cookie preserves the same `httpOnly=false`, `SameSite=Strict`, and `Secure` attributes as the original.
- [ ] If the user's session expires and they attempt a request, the session cookie becomes invalid but the CSRF cookie may still exist in the browser. This is harmless because the CSRF cookie alone grants no access.

### Boundary Constraints

- [ ] The cookie name `__csrf` must not exceed 128 characters (it is 6 characters).
- [ ] The cookie value must be exactly 64 hexadecimal characters. Values shorter or longer indicate a generation bug.
- [ ] The total `Set-Cookie` header for the CSRF cookie must not exceed 4096 bytes.
- [ ] The CSRF cookie must coexist with the session cookie, OAuth state cookie, and CLI callback cookie without namespace collisions or attribute conflicts.

### Web Client Consumption Contract

- [ ] The web application reads the `__csrf` cookie value using `document.cookie` or a cookie-parsing utility.
- [ ] The web application sends the CSRF token as an `X-CSRF-Token` header on all state-changing requests (POST, PUT, PATCH, DELETE).
- [ ] If the `__csrf` cookie is absent (user not authenticated), the web application omits the `X-CSRF-Token` header.
- [ ] The web application does not cache or persist the CSRF token beyond reading it from the cookie on each request.

### Definition of Done

- [ ] CSRF cookie is issued on every successful web authentication (GitHub OAuth callback, key auth verify).
- [ ] CSRF cookie is NOT issued on CLI/token-only authentication paths.
- [ ] CSRF cookie is cleared on logout.
- [ ] Cookie attributes match the specification exactly (name, httpOnly, sameSite, secure, path).
- [ ] Token generation uses a CSPRNG with 256 bits of entropy.
- [ ] All integration and E2E tests pass.
- [ ] Documentation is updated to describe the CSRF protection model.

## Design

### API Shape

The CSRF cookie is not a standalone API endpoint. It is a side effect of successful authentication on the following existing routes:

**`POST /api/auth/key/verify`** — Key-based sign-in

Response headers (on success):
```
Set-Cookie: codeplane_session=<uuid>; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=<seconds>
Set-Cookie: __csrf=<64-char-hex>; Path=/; SameSite=Strict; Secure
```

Response body (unchanged):
```json
{
  "user": {
    "id": 42,
    "username": "alice"
  }
}
```

**`GET /api/auth/github/callback`** — GitHub OAuth callback (web flow only)

Response headers (on success, when `codeplane_cli_callback` cookie is absent):
```
Set-Cookie: codeplane_session=<uuid>; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=<seconds>
Set-Cookie: __csrf=<64-char-hex>; Path=/; SameSite=Strict; Secure
Set-Cookie: codeplane_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=-1
Location: /
```

**`POST /api/auth/logout`** — Logout

Response headers (on success):
```
Set-Cookie: codeplane_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=-1
Set-Cookie: __csrf=; Path=/; SameSite=Strict; Secure; Max-Age=-1
```

Response: `204 No Content`

### Web UI Design

The CSRF cookie integration is invisible to the user in the web UI. There are no visible components, buttons, or indicators related to CSRF tokens. The integration is purely in the API client layer:

1. **API Client Interceptor**: The shared API client (used by SolidJS components) includes a request interceptor that reads the `__csrf` cookie and attaches it as an `X-CSRF-Token` header on mutation requests.
2. **No User Feedback**: CSRF token handling produces no toasts, banners, or status indicators. If a CSRF validation failure occurs server-side (future validation middleware), the user sees a generic "Session expired — please sign in again" message and is redirected to login.
3. **Login Flow**: No changes to the login page UI. The CSRF cookie is set as part of the existing redirect-after-login flow.
4. **Logout Flow**: No changes to the logout button or flow. The CSRF cookie is cleared alongside the session cookie.

### SDK Shape

The `@codeplane/sdk` package exposes the following utilities consumed by the server:

- `randomHex(byteLength: number): string` — Generates a cryptographically random hex string. Called with `32` for CSRF tokens (producing 64 hex characters).

No new SDK surface is needed. The CSRF cookie issuance logic lives entirely in the auth route handlers using existing cookie utilities from the `hono/cookie` module.

### Documentation

The following documentation should be written or updated:

1. **Security Model Documentation**: A section in the self-hosting guide explaining Codeplane's CSRF protection: what the `__csrf` cookie is and why it exists; that the cookie is only relevant for browser-based sessions; that CLI/API token users are not affected; how to configure `CODEPLANE_AUTH_COOKIE_SECURE` for production (must be `true` for any non-localhost deployment).
2. **API Integration Guide**: For third-party developers building custom web clients that use cookie-based sessions: read the `__csrf` cookie value from `document.cookie`; include it as `X-CSRF-Token` header on all POST/PUT/PATCH/DELETE requests; if the cookie is missing, redirect the user to sign in.
3. **Environment Variable Reference**: Document `CODEPLANE_AUTH_COOKIE_SECURE`: type is boolean string (`"true"` or `"false"`); default is `false` (insecure, suitable for local development only); controls the `Secure` flag on session, CSRF, and OAuth state cookies; must be `"true"` for any deployment served over HTTPS.

## Permissions & Security

### Authorization Roles

- **Anonymous**: Can trigger authentication flows (visiting login page, initiating OAuth). The CSRF cookie is only issued upon successful authentication completion.
- **Authenticated User (any role)**: Receives a CSRF cookie upon successful sign-in regardless of their role (Owner, Admin, Member, Read-Only).
- **No role-based gating**: CSRF cookie issuance is purely a function of successful authentication, not authorization level.

### Rate Limiting

- CSRF cookie issuance is rate-limited implicitly by the authentication endpoints' own rate limits:
  - `POST /api/auth/key/verify`: Subject to the global rate limit (120 req/min per identity).
  - `GET /api/auth/github/callback`: Subject to the global rate limit, plus the OAuth state record consumption prevents replay.
- No additional rate limiting is needed specifically for CSRF cookie issuance.

### Security Properties

- **No server-side CSRF token storage**: The current implementation uses a double-submit cookie pattern. The CSRF token exists only in the cookie (readable by JS) and is expected to be echoed back in the `X-CSRF-Token` header. The server does not persist the token value in the database.
- **SameSite=Strict prevents cross-origin cookie leakage**: The `__csrf` cookie is never included in cross-origin requests, including top-level navigations from other sites.
- **httpOnly=false is intentional and required**: Unlike the session cookie, the CSRF cookie must be readable by JavaScript so the web app can echo it back in a custom header.
- **No PII in the token**: The CSRF token is a random hex string with no personally identifiable information.
- **Token entropy**: 256 bits of entropy (32 random bytes) makes brute-force guessing computationally infeasible (2^256 possibilities).
- **Cookie scope is limited to the issuing domain**: No `Domain` attribute is set, so the cookie is scoped to the exact host that set it.
- **Secure flag enforcement**: In production (`CODEPLANE_AUTH_COOKIE_SECURE=true`), the cookie is only sent over HTTPS, preventing interception on unencrypted connections.

### Data Privacy

- The CSRF token contains no user data, session identifiers, or PII.
- The token cannot be used to authenticate requests on its own; it is only meaningful in combination with a valid session cookie.
- No GDPR, CCPA, or similar data privacy obligations attach to the CSRF cookie because it contains only random entropy.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `csrf_cookie_issued` | CSRF cookie set after successful auth | `auth_method` ("github_oauth" | "key_auth"), `user_id`, `timestamp`, `secure_flag` (boolean) |
| `csrf_cookie_cleared` | CSRF cookie cleared on logout | `user_id`, `timestamp`, `had_session` (boolean) |
| `csrf_validation_failure` | (Future) CSRF header missing or mismatched on mutation | `user_id` (if available), `request_path`, `request_method`, `failure_reason` ("missing_header" | "missing_cookie" | "mismatch"), `timestamp` |

### Funnel Metrics

- **CSRF issuance rate**: Number of `csrf_cookie_issued` events per hour. Should closely track successful web authentication events.
- **CSRF clearance rate**: Number of `csrf_cookie_cleared` events per hour. Should closely track logout events.
- **CSRF issuance-to-clearance ratio**: Measures whether cookies are being properly cleaned up. A persistently growing gap may indicate users are not logging out (normal) or that cookie clearing is broken (investigate).
- **CSRF validation failure rate** (future): When server-side validation is implemented, the ratio of `csrf_validation_failure` to total mutation requests. Should be < 0.1%. Elevated rates indicate either (a) a client-side bug where the header is not being sent, or (b) an active CSRF attack.

### Success Indicators

- 100% of web OAuth logins result in a CSRF cookie being set (verified by checking Set-Cookie headers in HTTP logs).
- 100% of web key-auth logins result in a CSRF cookie being set.
- 0% of CLI logins result in a CSRF cookie being set.
- 100% of logouts clear the CSRF cookie.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|---|---|---|---|
| CSRF cookie issued | `info` | `event=csrf_cookie_issued`, `user_id`, `username`, `auth_method`, `secure_flag`, `request_id` | After `setCSRFCookie()` is called on successful authentication |
| CSRF cookie cleared | `info` | `event=csrf_cookie_cleared`, `user_id` (if available), `request_id` | After `clearCSRFCookie()` is called on logout |
| CSRF token generation | `debug` | `event=csrf_token_generated`, `token_length`, `request_id` | When `randomHex(32)` is called for CSRF purposes |
| CSRF cookie issuance skipped (CLI flow) | `debug` | `event=csrf_cookie_skipped`, `reason=cli_flow`, `request_id` | When OAuth callback detects CLI callback cookie and skips CSRF cookie |
| CSRF validation failure (future) | `warn` | `event=csrf_validation_failed`, `reason`, `request_path`, `request_method`, `user_id`, `request_id`, `user_agent` | When a mutation request fails CSRF validation |

**Logging constraints:**
- Never log the CSRF token value itself. Log only its length or a boolean indicating presence.
- Always include `request_id` for correlation with the broader request lifecycle.
- Use structured JSON logging consistent with the existing Hono logger middleware.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_csrf_cookies_issued_total` | Counter | `auth_method` ("github_oauth", "key_auth") | Total CSRF cookies issued |
| `codeplane_csrf_cookies_cleared_total` | Counter | `reason` ("logout", "error") | Total CSRF cookies cleared |
| `codeplane_csrf_cookie_issuance_errors_total` | Counter | `auth_method`, `error_type` | Total failures during CSRF cookie issuance (should be zero under normal operation) |
| `codeplane_csrf_validation_failures_total` (future) | Counter | `reason` ("missing_header", "missing_cookie", "mismatch"), `method` | Total CSRF validation failures |
| `codeplane_csrf_token_generation_duration_seconds` | Histogram | — | Time to generate a CSRF token (should be sub-millisecond) |

### Alerts

#### Alert: CSRF Cookie Issuance Failure Rate > 0

**Condition**: `rate(codeplane_csrf_cookie_issuance_errors_total[5m]) > 0`
**Severity**: Critical
**Description**: Any failure to issue a CSRF cookie means users are authenticating without CSRF protection.

**Runbook**:
1. Check the server error logs for `event=csrf_cookie_issuance_error` entries with the associated `request_id`.
2. Verify that the `crypto.getRandomValues()` API is available in the runtime (Bun). If the runtime lacks CSPRNG access, token generation will fail.
3. Check for memory pressure — `getRandomValues` can fail under extreme memory constraints.
4. Verify the Hono `setCookie` function is working correctly by testing a health endpoint that sets a test cookie.
5. If the issue is transient, monitor for recurrence. If persistent, roll back the most recent deployment.

#### Alert: CSRF Validation Failure Spike (Future)

**Condition**: `rate(codeplane_csrf_validation_failures_total[5m]) > 10`
**Severity**: Warning
**Description**: Elevated CSRF validation failures may indicate a client-side bug or an active attack.

**Runbook**:
1. Check `reason` label distribution. If predominantly "missing_header", the web UI is not sending the `X-CSRF-Token` header — check for a frontend deployment issue or API client regression.
2. If predominantly "missing_cookie", users may have cookies disabled or a browser extension is stripping cookies. Check `user_agent` in logs for patterns.
3. If predominantly "mismatch", investigate whether multiple Codeplane instances are behind a load balancer with inconsistent cookie domains.
4. Check if a recent web UI deployment changed the API client interceptor.
5. If the spike correlates with requests from a single IP range or user agent, it may be an attack — consider temporary IP blocking.

#### Alert: CSRF Issuance/Auth Success Ratio Drift

**Condition**: `abs(rate(codeplane_csrf_cookies_issued_total[1h]) - rate(codeplane_auth_sessions_created_total{flow="web"}[1h])) / rate(codeplane_auth_sessions_created_total{flow="web"}[1h]) > 0.05`
**Severity**: Warning
**Description**: CSRF cookie issuance count should track web session creation count within 5%. A drift indicates cookies are being issued without sessions or vice versa.

**Runbook**:
1. Compare the counters in Grafana. If sessions > CSRF cookies, the `setCSRFCookie` call may be conditionally failing or the code path was bypassed.
2. If CSRF cookies > sessions, check whether `setCSRFCookie` is being called in an unexpected code path.
3. Review recent changes to the auth routes for control flow modifications.
4. Check for cookie size limits being hit — if the response already has many large cookies, additional Set-Cookie headers may be silently dropped by some proxies.

### Error Cases and Failure Modes

| Error Case | Symptom | Impact | Mitigation |
|---|---|---|---|
| CSPRNG unavailable | `randomHex()` throws | CSRF token cannot be generated; auth still succeeds but without CSRF protection | Log error, emit metric, consider failing the auth request entirely |
| Cookie header overflow | Proxy/CDN drops Set-Cookie header | CSRF cookie not received by browser | Monitor for missing cookies in client-side telemetry; keep total response header size under proxy limits |
| `CODEPLANE_AUTH_COOKIE_SECURE=true` with HTTP | Cookie not sent by browser | CSRF protection non-functional; all mutations will fail CSRF validation (when implemented) | Validate configuration at startup; warn if COOKIE_SECURE=true but no TLS is detected |
| Browser cookie storage full | Browser silently rejects cookie | CSRF protection non-functional for that user | No server-side mitigation possible; document browser requirements |
| Multiple Codeplane tabs with different sessions | Each login sets a new CSRF cookie, overwriting the previous | Other tabs' in-flight requests may fail CSRF validation | Web client should re-read cookie before each request, not cache it |

## Verification

### API Integration Tests

- [ ] **Test: CSRF cookie is set on successful key auth verify** — `POST /api/auth/key/verify` with valid message/signature returns a `Set-Cookie` header for `__csrf` with a 64-character hex value.
- [ ] **Test: CSRF cookie is set on successful GitHub OAuth callback (web)** — `GET /api/auth/github/callback` with valid `code`, `state`, and OAuth state cookie returns a `Set-Cookie` header for `__csrf`.
- [ ] **Test: CSRF cookie is NOT set on CLI OAuth callback** — `GET /api/auth/github/callback` with valid parameters AND a `codeplane_cli_callback` cookie does NOT return a `__csrf` Set-Cookie header.
- [ ] **Test: CSRF cookie is NOT set on token creation** — `POST /api/auth/key/token` with valid message/signature does NOT return a `__csrf` Set-Cookie header.
- [ ] **Test: CSRF cookie has correct attributes** — Parse the `Set-Cookie` header and verify: `Path=/`, `SameSite=Strict`, no `HttpOnly` flag, `Secure` matches config.
- [ ] **Test: CSRF cookie value is exactly 64 hex characters** — Regex match `^[0-9a-f]{64}$` on the cookie value.
- [ ] **Test: CSRF cookie value is unique per authentication** — Authenticate twice and verify the two CSRF cookie values differ.
- [ ] **Test: CSRF cookie is cleared on logout** — `POST /api/auth/logout` returns a `Set-Cookie` header for `__csrf` with empty value and `Max-Age=-1`.
- [ ] **Test: CSRF cookie secure flag matches configuration** — With `CODEPLANE_AUTH_COOKIE_SECURE=true`, verify the `Secure` attribute is present. With `CODEPLANE_AUTH_COOKIE_SECURE=false`, verify it is absent.
- [ ] **Test: CSRF cookie is set alongside session cookie** — On successful auth, verify both `codeplane_session` and `__csrf` cookies are present in response headers.
- [ ] **Test: CSRF cookie survives session validation** — After authentication, make a GET request and verify the browser would send the `__csrf` cookie (verify by checking cookie jar state).
- [ ] **Test: CSRF cookie issuance does not affect response body** — The JSON response from `/api/auth/key/verify` contains only `user.id` and `user.username`, no CSRF-related fields.

### Cookie Attribute Edge Case Tests

- [ ] **Test: CSRF cookie SameSite=Strict prevents cross-origin send** — Simulate a cross-origin POST and verify the `__csrf` cookie is not included (browser-level behavior; validate via Playwright).
- [ ] **Test: CSRF cookie httpOnly=false allows JS read** — In a Playwright browser context, after authentication, verify `document.cookie` contains `__csrf=<value>`.
- [ ] **Test: CSRF cookie value has sufficient entropy** — Generate 1000 CSRF tokens and verify no duplicates (probabilistic test; failure probability is astronomically low for 256-bit entropy).
- [ ] **Test: CSRF cookie with maximum valid token length (64 chars)** — Verify the server correctly issues a cookie with exactly 64 hex characters.
- [ ] **Test: CSRF cookie value contains only lowercase hex** — Verify no uppercase letters, no non-hex characters, no whitespace.

### Logout and Session Lifecycle Tests

- [ ] **Test: Logout clears CSRF cookie even if session cookie is already invalid** — Delete the session from the database, then call logout. The CSRF cookie should still be cleared.
- [ ] **Test: Logout without a session cookie still clears CSRF cookie** — Call `POST /api/auth/logout` without any session cookie. The `__csrf` cookie should still be cleared (idempotent cleanup).
- [ ] **Test: Re-authentication after logout issues a new CSRF token** — Log out, log back in, verify the new CSRF cookie value differs from the original.
- [ ] **Test: Multiple rapid logouts do not error** — Call `POST /api/auth/logout` three times in succession. All should return 204 and clear cookies.

### Playwright E2E Tests (Web UI)

- [ ] **Test: Sign in with GitHub sets CSRF cookie in browser** — Complete the GitHub OAuth flow in a Playwright browser. After redirect to dashboard, verify `__csrf` cookie exists in the browser cookie jar with the correct attributes.
- [ ] **Test: Web app reads CSRF cookie and sends X-CSRF-Token header** — After authentication, trigger a mutation (e.g., star a repository). Intercept the network request and verify the `X-CSRF-Token` header is present and matches the `__csrf` cookie value.
- [ ] **Test: Logout removes CSRF cookie from browser** — After authentication, click the logout button. Verify the `__csrf` cookie is no longer present in `document.cookie`.
- [ ] **Test: Unauthenticated page does not have CSRF cookie** — Visit the login page without any prior authentication. Verify `__csrf` cookie is absent.
- [ ] **Test: CSRF cookie persists across page navigations** — After authentication, navigate to multiple pages (dashboard → repository → issues). Verify the `__csrf` cookie remains present and unchanged throughout.
- [ ] **Test: CSRF cookie is refreshed on re-authentication** — Sign out, sign back in. Verify the CSRF cookie value has changed.

### CLI Tests

- [ ] **Test: CLI login does not produce a CSRF cookie** — Run `codeplane auth login` through the CLI OAuth flow. Verify the CLI's credential store contains only the API token, and no CSRF cookie is referenced or stored.
- [ ] **Test: CLI token auth does not produce a CSRF cookie** — Run `codeplane auth login --token <pat>`. Verify no CSRF cookie handling occurs.

### Security Tests

- [ ] **Test: CSRF cookie cannot be set by a subdomain** — Verify the cookie has no `Domain` attribute, preventing subdomain sharing.
- [ ] **Test: CSRF cookie is not sent on cross-site GET (SameSite=Strict)** — Simulate navigation from an external site to Codeplane. Verify the `__csrf` cookie is not included in the initial request.
- [ ] **Test: CSRF token brute-force is infeasible** — Verify the token space is 2^256 by confirming the token is derived from 32 random bytes.
- [ ] **Test: Failed authentication does not issue CSRF cookie** — `POST /api/auth/key/verify` with invalid signature returns an error and does NOT set a `__csrf` cookie.
- [ ] **Test: Failed OAuth callback does not issue CSRF cookie** — `GET /api/auth/github/callback` with invalid state returns an error and does NOT set a `__csrf` cookie.
- [ ] **Test: CSRF cookie Secure flag prevents HTTP transmission** — With `CODEPLANE_AUTH_COOKIE_SECURE=true`, verify the cookie includes the `Secure` attribute (browser will not send over HTTP).

# PLATFORM_HTTP_MIDDLEWARE_AUTH_CONTEXT

Specification for PLATFORM_HTTP_MIDDLEWARE_AUTH_CONTEXT.

## High-Level User POV

Every interaction a user has with Codeplane — whether they are browsing a public repository, creating an issue, reviewing a landing request, or running a workflow — begins with the platform determining who they are. The auth context middleware is the invisible foundation that makes this happen. It is the single, consistent mechanism by which Codeplane recognizes a user across every product surface: the web UI, CLI, TUI, desktop app, and editor integrations.

When a user signs into Codeplane through their browser, their session is remembered via a secure cookie so that subsequent page loads and API calls carry their identity seamlessly. When they generate a Personal Access Token (PAT) and use it from the CLI or a script, that token is resolved to the same identity and permissions. When an OAuth2 application acts on behalf of a user, the same resolution happens. In every case, the user's identity, admin status, and token scope metadata are resolved once at the start of each request and made available to every downstream feature.

Critically, the auth context never blocks access to public surfaces. A user browsing a public repository without signing in simply sees the public view. The moment they authenticate — whether through a cookie, a PAT, or an OAuth2 token — the experience enriches: they see their own stars, notifications, and write actions become available. This seamless gradient from anonymous to authenticated is a core product property. Users should never encounter a login wall on a public page, and they should never see stale or inconsistent identity information across different parts of the product.

Rate limiting also adapts to identity. Authenticated users are tracked individually by their account, ensuring that one user's heavy usage does not affect another. Anonymous users are tracked by IP address. This ensures fair access for everyone while preventing abuse.

## Acceptance Criteria

### Definition of Done

The auth context middleware is complete when every HTTP API request processed by Codeplane has its identity resolved (or explicitly left anonymous) before any route handler executes, and when every client surface (web, CLI, TUI, desktop, editors) can rely on this resolution being consistent, secure, and performant.

### Identity Resolution

- [ ] Every inbound HTTP request MUST pass through the auth context middleware before reaching any route handler.
- [ ] The middleware MUST support three authentication methods, checked in this order:
  1. **Bearer token / PAT** via `Authorization: token codeplane_<value>` or `Authorization: Bearer codeplane_<value>` header.
  2. **OAuth2 access token** via `Authorization: Bearer codeplane_oat_<value>` header.
  3. **Session cookie** via the configured session cookie (default name: `codeplane_session`).
- [ ] If a valid token or session is found, the middleware MUST populate the request context with the user's identity (id, username, isAdmin), token metadata (tokenId, tokenHash, scopes, source), and auth method indicator.
- [ ] If no valid credential is found, the middleware MUST allow the request to proceed without identity context (anonymous access). It MUST NOT return an error or reject the request.
- [ ] Query-string authentication MUST NOT be supported. Tokens MUST NOT be accepted from URL parameters to prevent leakage in browser history, server logs, and intermediary proxies.

### Token Authentication Constraints

- [ ] PAT values MUST begin with the `codeplane_` prefix.
- [ ] OAuth2 access tokens MUST begin with the `codeplane_oat_` prefix.
- [ ] Raw tokens MUST be hashed via SHA-256 before database lookup. Raw token values MUST NOT be stored or logged.
- [ ] The database lookup MUST verify that the associated user is active (`is_active = true`) and not login-prohibited (`prohibit_login = false`).
- [ ] If the token hash does not match any active token, the request MUST proceed as anonymous (not as an error).
- [ ] On successful token resolution, the token's `last_used_at` timestamp MUST be updated asynchronously (fire-and-forget) to avoid adding latency to the request path.

### Session Cookie Constraints

- [ ] The session cookie name MUST be configurable via the `CODEPLANE_AUTH_SESSION_COOKIE_NAME` environment variable, defaulting to `codeplane_session`.
- [ ] Session cookies MUST be `httpOnly`.
- [ ] The `Secure` flag MUST be configurable via `CODEPLANE_AUTH_COOKIE_SECURE`.
- [ ] Session duration MUST be configurable via `CODEPLANE_AUTH_SESSION_DURATION`, supporting Go-style duration strings (e.g., `720h`, `24h`, `30m`), defaulting to 720 hours (30 days).
- [ ] Expired sessions (where `expiresAt <= now`) MUST be treated as invalid. The request MUST proceed as anonymous.
- [ ] Session-based auth MUST NOT carry token scopes; the scopes field MUST be empty for session-authenticated requests.

### Auth Context Shape

- [ ] The auth context MUST expose at minimum: `user` (id, username, isAdmin), `tokenId`, `tokenHash`, `rawScopes`, `isTokenAuth` (boolean), and `tokenSource` (one of `personal_access_token`, `oauth2_access_token`, or empty string for session auth).
- [ ] A convenience accessor MUST be available to retrieve just the user object from the context.
- [ ] Both the full auth info and the user object MUST be retrievable by downstream route handlers and middleware.

### Route Consumption

- [ ] Routes requiring authentication MUST check for user presence and return HTTP 401 with a JSON error body (`{"message": "authentication required"}`) if absent.
- [ ] Routes requiring admin access MUST check `user.isAdmin` and return HTTP 401 with `{"message": "admin access required"}` if the user is not an admin.
- [ ] Routes serving public content MUST function correctly when no auth context is present (anonymous access).
- [ ] Routes that enrich responses based on auth (e.g., showing "starred by you" indicators) MUST degrade gracefully when auth is absent.

### Rate Limiting Integration

- [ ] Rate limiting MUST execute after auth context loading so that authenticated users are identified by user ID rather than IP address.
- [ ] Authenticated users MUST be rate-limited by their user ID (key format: `user:<id>`).
- [ ] Anonymous users MUST be rate-limited by IP address, using `X-Real-Ip` or `X-Forwarded-For` headers with a fallback to `unknown`.
- [ ] The default rate limit MUST be 120 requests per 60-second window.
- [ ] Rate-limited responses MUST return HTTP 429 with a JSON body (`{"message": "rate limit exceeded"}`), a `Retry-After` header, and standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

### Edge Cases

- [ ] A request with a malformed `Authorization` header (e.g., missing prefix, empty value) MUST be treated as anonymous, not as an error.
- [ ] A request with both a valid `Authorization` header and a valid session cookie MUST use the token (token takes precedence over cookie).
- [ ] A request with an expired token (deleted from the database) MUST proceed as anonymous.
- [ ] A request with a valid token for a deactivated user MUST proceed as anonymous.
- [ ] A request with a valid token for a login-prohibited user MUST proceed as anonymous.
- [ ] Multiple concurrent requests with the same token MUST each independently resolve auth context (no shared mutable state beyond the rate limit store).
- [ ] The middleware MUST handle database connection failures gracefully, treating the request as anonymous rather than returning a 500.

## Design

### Middleware Stack Ordering

The auth context middleware operates within a precisely ordered middleware stack. The ordering is product-critical:

1. **Request ID** — Assigns or preserves a unique `X-Request-Id` header for tracing.
2. **Structured Logger** — Attaches request-scoped logging context.
3. **CORS** — Handles cross-origin preflight and response headers.
4. **Rate Limiting** — Enforces per-identity request throttling (runs after auth to use user ID when available).
5. **JSON Content-Type Enforcement** — Validates `Content-Type: application/json` on mutation requests (POST, PUT, PATCH, DELETE).
6. **Auth Context Loader** — Resolves identity from token or session. This is the middleware specified in this document.

### API Shape

The auth context middleware does not expose its own API endpoint. It is a cross-cutting concern that enriches every API request. However, its effects are visible through:

**Response headers on every request:**
- `X-Request-Id: <uuid>` — Request correlation ID.
- `X-RateLimit-Limit: 120` — Maximum requests per window.
- `X-RateLimit-Remaining: <n>` — Remaining requests in the current window.
- `X-RateLimit-Reset: <unix-timestamp>` — When the current window resets.

**Error responses when auth is required but missing:**
```json
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "message": "authentication required"
}
```

**Error responses when admin is required but user is not admin:**
```json
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "message": "admin access required"
}
```

**Error response when rate limited:**
```json
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 42
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711036800

{
  "message": "rate limit exceeded"
}
```

### SDK Shape

The SDK exposes the auth context types and helpers for use by the server and any consumer:

**Types:**
- `AuthUser` — `{ id: number; username: string; isAdmin: boolean }`
- `AuthInfo` — `{ user: AuthUser | null; tokenId: number; tokenHash: string; rawScopes: string; isTokenAuth: boolean; tokenSource: "personal_access_token" | "oauth2_access_token" | "" }`

**Context helpers:**
- `getAuthInfo(c: Context): AuthInfo | undefined` — Retrieves full auth info from the request context.
- `getUser(c: Context): AuthUser | undefined` — Retrieves just the user from the request context. Checks `authInfo.user` first, then falls back to a direct context variable lookup.

**Context keys:**
- `AUTH_INFO_KEY = "authInfo"` — The Hono context key for the full auth info object.
- `USER_KEY = "user"` — The Hono context key for the user object.

### CLI Command

The CLI does not expose a dedicated command for the auth context middleware itself, but the CLI's authentication flow is the primary consumer of the token-based auth path:

- `codeplane auth login` — Initiates browser-based OAuth and stores the resulting token.
- `codeplane auth login --token` — Accepts a PAT directly.
- `codeplane auth status` — Shows current auth state, token source, and username.
- `codeplane auth logout` — Removes stored credentials.

The CLI resolves tokens in priority order: `CODEPLANE_TOKEN` environment variable → system keyring → config file (legacy). All CLI API requests include the token via `Authorization: token <value>`.

### Web UI Design

The web UI authenticates via session cookies set during the OAuth login flow. No explicit token management is needed in the browser. The auth context manifests in the web UI as:

- **Authenticated shell**: Sidebar shows user avatar, notifications badge, and write-action buttons.
- **Anonymous shell**: Sidebar shows login prompt; write actions are hidden; star/watch indicators are absent.
- **Seamless transition**: After login, the page reloads with the session cookie and the full authenticated experience appears.
- **Session expiry**: When a session expires, subsequent API calls return 401. The UI detects this and redirects to the login page.

### TUI UI

The TUI authenticates using the same token resolution as the CLI (`CODEPLANE_TOKEN` → keyring → config). The auth context manifests as:

- **Status bar**: Shows current username and auth source when authenticated.
- **Feature gating**: Write-action screens (issue creation, landing request creation) are hidden or disabled when unauthenticated.
- **Error handling**: 401 responses surface a "Please run `codeplane auth login` to authenticate" message.

### Documentation

The following end-user documentation MUST be written:

1. **Authentication Guide** — Explains the three supported auth methods (session cookie, PAT, OAuth2 token), how to generate a PAT, how to use PATs from the CLI and scripts, and the token prefix conventions.
2. **Rate Limiting Reference** — Documents the default rate limits, how authenticated vs. anonymous rate limiting works, the rate limit headers, and how to handle 429 responses.
3. **CLI Authentication** — Documents `codeplane auth login`, `codeplane auth status`, `codeplane auth logout`, the `CODEPLANE_TOKEN` environment variable, and keyring storage behavior.
4. **Self-Hosting: Auth Configuration** — Documents all `CODEPLANE_AUTH_*` environment variables, their defaults, and their effects.

## Permissions & Security

### Authorization Roles

The auth context middleware itself does not enforce roles — it resolves identity. Role enforcement is delegated to individual route handlers. The resolved identity supports these authorization patterns:

| Context State | Access Level | Example Surfaces |
|---|---|---|
| No auth context (anonymous) | Public read-only | Public repo browsing, public user profiles |
| `AuthUser` present, `isAdmin = false` | Authenticated user | Issue creation, starring repos, managing own settings |
| `AuthUser` present, `isAdmin = true` | Admin | Admin panel, user management, closed-alpha controls |
| `AuthInfo` with specific `rawScopes` | Scoped token access | Future: fine-grained token permission checks |

### Rate Limiting

- **Authenticated users**: 120 requests per 60-second window, keyed by user ID.
- **Anonymous users**: 120 requests per 60-second window, keyed by IP address.
- **Admin override**: No special rate limit exemption for admins (same limits apply).
- **Stale entry cleanup**: Rate limit entries are garbage-collected every 60 seconds.

### Data Privacy & PII Constraints

- **Raw tokens MUST NEVER be logged.** Only the token hash may appear in diagnostic logs.
- **Session keys MUST NEVER be logged.** Only the session's existence (present/absent) and expiry status may be logged.
- **User IDs and usernames MAY be logged** in structured request logs for audit and debugging purposes.
- **The `isAdmin` flag MAY be logged** in auth resolution context.
- **Rate limit keys MUST NOT expose full IP addresses in user-facing responses.** Rate limit headers expose only counts and reset times.
- **Token `last_used_at` updates contain temporal usage data** and should be treated as usage metadata subject to data retention policies.
- **Deactivated users and login-prohibited users MUST NOT have their existence confirmed** — failed auth for these cases must behave identically to "token not found."

### Security Hardening

- **Timing attack mitigation**: Token hash lookups should use constant-time comparison where possible. The SHA-256 hashing step provides some natural timing normalization.
- **Cookie security**: Session cookies MUST use `httpOnly`, `SameSite=Lax` (or `Strict`), and `Secure` (configurable for development).
- **Header injection**: The `Authorization` header value MUST be validated for expected format before processing. Unexpected formats MUST be silently ignored (treated as anonymous).
- **No credential reflection**: API responses MUST NEVER echo back token values, session keys, or token hashes.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `AuthContextResolved` | Auth middleware successfully resolves a user identity | `authMethod` ("pat", "oauth2_token", "session"), `userId`, `isAdmin`, `tokenSource`, `hasScopesSet` (boolean) |
| `AuthContextAnonymous` | Request proceeds without identity | `reason` ("no_credentials", "invalid_token", "expired_session", "deactivated_user", "login_prohibited"), `hadAuthorizationHeader` (boolean), `hadSessionCookie` (boolean) |
| `RateLimitExceeded` | A request is rejected due to rate limiting | `identityType` ("user", "ip"), `identityKey` (user ID or anonymized IP hash), `windowRemaining` (seconds), `requestPath` |
| `TokenLastUsedUpdated` | Token `last_used_at` is successfully updated | `tokenId`, `userId`, `tokenSource` |
| `TokenLastUsedUpdateFailed` | Fire-and-forget `last_used_at` update fails | `tokenId`, `error` |

### Funnel Metrics & Success Indicators

- **Auth resolution success rate**: Percentage of requests with valid credentials that successfully resolve to a user. Target: >99.9%.
- **Auth resolution latency (p50, p95, p99)**: Time spent in the auth middleware. Target: p99 < 10ms.
- **Anonymous-to-authenticated conversion**: Ratio of anonymous requests to authenticated requests over time. Indicates adoption of login/token flows.
- **Rate limit hit rate**: Percentage of requests that are rate-limited. Target: <0.1% under normal operation. Spikes indicate abuse or misconfigured clients.
- **Token usage freshness**: Distribution of time since `last_used_at` for active tokens. Helps identify stale tokens that should be rotated.
- **Session expiry-driven logouts**: Count of requests where a session cookie was present but expired. Indicates whether session duration is appropriately configured.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|---|---|---|---|
| Auth context resolved | `debug` | `requestId`, `userId`, `username`, `authMethod`, `tokenSource`, `isAdmin` | Every successful auth resolution |
| Auth context anonymous | `debug` | `requestId`, `reason`, `hadAuthHeader`, `hadCookie` | Every request that proceeds anonymously |
| Token lookup failed (no match) | `debug` | `requestId`, `tokenPrefixPresent` (boolean, NOT the token value) | Token hash not found in DB |
| Session expired | `debug` | `requestId`, `sessionExpiresAt` | Session cookie present but expired |
| Token `last_used_at` update failed | `warn` | `requestId`, `tokenId`, `error` | Fire-and-forget update throws |
| Rate limit exceeded | `info` | `requestId`, `identityType`, `identityKey`, `retryAfter` | Request rejected by rate limiter |
| Auth middleware error (unexpected) | `error` | `requestId`, `error`, `stack` | Database connection failure or unexpected exception |

**CRITICAL**: Raw token values, session keys, and token hashes MUST NEVER appear in logs at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_auth_context_resolutions_total` | Counter | `method` (pat, oauth2, session), `status` (success, anonymous) | Total auth resolution attempts |
| `codeplane_auth_context_duration_seconds` | Histogram | `method` (pat, oauth2, session, none) | Time spent in auth middleware (buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25) |
| `codeplane_auth_anonymous_requests_total` | Counter | `reason` (no_credentials, invalid_token, expired_session, deactivated_user) | Anonymous request reasons |
| `codeplane_auth_token_last_used_update_failures_total` | Counter | — | Fire-and-forget update failures |
| `codeplane_rate_limit_exceeded_total` | Counter | `identity_type` (user, ip) | Rate limit rejections |
| `codeplane_rate_limit_store_entries` | Gauge | — | Current number of entries in the rate limit store |
| `codeplane_auth_sessions_expired_total` | Counter | — | Requests with present but expired session cookies |

### Alerts

#### Alert: Auth Resolution Error Rate High
- **Condition**: `rate(codeplane_auth_context_resolutions_total{status="anonymous",reason="error"}[5m]) > 0.01`
- **Severity**: Critical
- **Runbook**:
  1. Check database connectivity: verify the database is reachable and responding to queries.
  2. Check `codeplane_auth_context_duration_seconds` p99 — if elevated, the database may be under load.
  3. Check for recent deployments that may have changed the auth middleware or database schema.
  4. Check the `access_tokens` and `auth_sessions` tables for schema drift or migration issues.
  5. If the database is healthy, check application logs for unexpected exceptions in the auth middleware.
  6. Escalate to the platform team if the issue persists beyond 5 minutes.

#### Alert: Auth Middleware Latency High
- **Condition**: `histogram_quantile(0.99, rate(codeplane_auth_context_duration_seconds[5m])) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency for `getAuthInfoByTokenHash` and `getAuthSessionBySessionKey`.
  2. Check for lock contention or connection pool exhaustion in the database.
  3. Check if the `access_tokens` table has appropriate indexes on `token_hash`.
  4. Check if the `auth_sessions` table has appropriate indexes on `session_key`.
  5. Review recent traffic patterns — a spike in unique tokens could cause cache misses.
  6. If database is healthy, profile the SHA-256 hashing step for unexpected overhead.

#### Alert: Rate Limit Store Growth Unbounded
- **Condition**: `codeplane_rate_limit_store_entries > 100000`
- **Severity**: Warning
- **Runbook**:
  1. Check if the 60-second cleanup interval is executing correctly.
  2. Check for a DDoS or bot traffic pattern (many unique IPs).
  3. Consider enabling upstream rate limiting (e.g., at the load balancer or CDN layer).
  4. If the store is growing due to legitimate traffic, consider increasing the cleanup frequency or switching to an external rate limit store (Redis).

#### Alert: Token Update Failures Elevated
- **Condition**: `rate(codeplane_auth_token_last_used_update_failures_total[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check database write availability — read-only replicas will reject these updates.
  2. Check for table-level locks on `access_tokens`.
  3. These failures are non-critical (fire-and-forget), but persistent failures indicate database health issues.
  4. Monitor alongside other database write operations for correlated failures.

#### Alert: Rate Limit Rejection Spike
- **Condition**: `rate(codeplane_rate_limit_exceeded_total[5m]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Identify the top rate-limited identities (user IDs or IPs) from logs.
  2. Determine if the traffic is legitimate (e.g., a CI pipeline) or abusive.
  3. For legitimate high-volume users, consider issuing a higher rate limit tier (future feature).
  4. For abusive traffic, consider IP-level blocking at the infrastructure layer.

### Error Cases and Failure Modes

| Failure Mode | Behavior | Visibility |
|---|---|---|
| Database unreachable during token lookup | Request proceeds as anonymous | `error` log, auth resolution counter incremented with `status=anonymous, reason=error` |
| Database unreachable during session lookup | Request proceeds as anonymous | `error` log, auth resolution counter incremented |
| Token hash collision (astronomically unlikely) | First matching token is used | No special handling needed |
| `last_used_at` update fails | Silently swallowed; request continues | `warn` log, failure counter incremented |
| Rate limit store memory exhaustion | New entries may fail to insert; requests may bypass rate limiting | Gauge alert fires at 100k entries |
| Malformed `Authorization` header | Request proceeds as anonymous | `debug` log |
| Session cookie tampered/truncated | Session lookup returns no match; request proceeds as anonymous | `debug` log |
| Clock skew on session expiry | Sessions may expire early or late | Ensure NTP is synchronized on all server instances |

## Verification

### API Integration Tests

#### Token-Based Authentication
- [ ] **Valid PAT resolves identity**: Send a request with `Authorization: token codeplane_<valid_token>` → verify response includes user-specific data (e.g., `GET /api/user` returns the token owner's profile).
- [ ] **Valid PAT with Bearer prefix resolves identity**: Send a request with `Authorization: Bearer codeplane_<valid_token>` → same result.
- [ ] **Valid OAuth2 token resolves identity**: Send a request with `Authorization: Bearer codeplane_oat_<valid_token>` → verify response includes the associated user's data.
- [ ] **Invalid token proceeds as anonymous**: Send a request with `Authorization: token codeplane_invalid123` → verify public endpoints return public data, protected endpoints return 401.
- [ ] **Expired/deleted token proceeds as anonymous**: Delete a token from the database, then use it → verify 401 on protected endpoints.
- [ ] **Token for deactivated user proceeds as anonymous**: Deactivate a user, then use their token → verify 401 on protected endpoints.
- [ ] **Token for login-prohibited user proceeds as anonymous**: Set `prohibit_login = true` for a user, then use their token → verify 401 on protected endpoints.
- [ ] **Empty Authorization header treated as anonymous**: Send `Authorization: ` (empty) → verify anonymous behavior.
- [ ] **Malformed Authorization header treated as anonymous**: Send `Authorization: NotAScheme somevalue` → verify anonymous behavior.
- [ ] **Authorization header without codeplane_ prefix treated as anonymous**: Send `Authorization: token notcodeplane_abc` → verify anonymous behavior.
- [ ] **No Authorization header and no cookie treated as anonymous**: Send a bare request → verify anonymous behavior on public endpoints.
- [ ] **Token with maximum valid length resolves correctly**: Generate a PAT with the maximum allowed token length → verify it resolves correctly.
- [ ] **Token exceeding maximum valid length treated as anonymous**: Send a token longer than the maximum allowed length → verify anonymous behavior (not a server error).

#### Session-Based Authentication
- [ ] **Valid session cookie resolves identity**: Create a session, send a request with the session cookie → verify the user's identity is resolved.
- [ ] **Expired session cookie treated as anonymous**: Create an expired session, send a request with its cookie → verify 401 on protected endpoints.
- [ ] **Non-existent session key treated as anonymous**: Send a request with a fabricated session cookie → verify anonymous behavior.
- [ ] **Session for deactivated user**: Create a session, deactivate the user, send a request → verify the session behavior (should still resolve based on session data, but downstream checks may reject).

#### Precedence and Edge Cases
- [ ] **Token takes precedence over session cookie**: Send a request with both a valid `Authorization` header and a valid session cookie for different users → verify the token user's identity is used.
- [ ] **Query string token is NOT accepted**: Send a request with `?token=codeplane_<valid_token>` in the URL → verify the request is treated as anonymous.
- [ ] **Concurrent requests with same token resolve independently**: Send 10 parallel requests with the same token → verify all resolve correctly with consistent identity.
- [ ] **Auth context available to route handlers**: On a protected endpoint, verify the route handler can access `userId`, `username`, and `isAdmin` from the resolved context.

#### Token Metadata
- [ ] **`last_used_at` is updated after token use**: Use a PAT to make a request → query the database and verify `last_used_at` has been updated.
- [ ] **Token scopes are captured in auth info**: Create a token with specific scopes, use it → verify (via internal test hook or log inspection) that `rawScopes` is populated correctly.
- [ ] **`tokenSource` correctly identifies PAT vs OAuth2**: Use a PAT → verify `tokenSource` is `personal_access_token`. Use an OAuth2 token → verify `tokenSource` is `oauth2_access_token`.

### Rate Limiting Integration Tests
- [ ] **Requests below rate limit succeed**: Send 119 requests within 60 seconds from an authenticated user → all return 200.
- [ ] **Request at rate limit succeeds**: Send exactly 120 requests within 60 seconds → the 120th returns 200.
- [ ] **Request exceeding rate limit returns 429**: Send 121 requests within 60 seconds → the 121st returns 429 with `Retry-After` header.
- [ ] **Rate limit headers present on every response**: Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` are present on all API responses.
- [ ] **`X-RateLimit-Remaining` decrements correctly**: Send N requests and verify the remaining count decreases by 1 each time.
- [ ] **Rate limit resets after window**: Send 120 requests, wait for the window to reset, send another → verify it succeeds.
- [ ] **Authenticated users rate-limited by user ID**: Two authenticated users sending 120 requests each within the same window → both should succeed (independent limits).
- [ ] **Anonymous users rate-limited by IP**: Send 121 requests without auth from the same IP → the 121st returns 429.
- [ ] **Different anonymous IPs have independent limits**: Send 120 requests from IP A and 120 from IP B → all succeed.

### Middleware Stack Ordering Tests
- [ ] **Request ID is present before auth runs**: Verify that auth-related log entries include a `requestId`.
- [ ] **CORS preflight does not trigger auth**: Send an OPTIONS request → verify it returns CORS headers without triggering auth logic.
- [ ] **JSON content-type enforcement runs on mutations**: Send a POST without `Content-Type: application/json` → verify it is rejected before the route handler runs.
- [ ] **Auth runs after rate limiting**: Verify that a rate-limited request's rate limit key uses the user ID (not just IP) by authenticating, exceeding the limit, and confirming the 429 response.

### Web UI / Playwright E2E Tests
- [ ] **Anonymous user sees public repo**: Navigate to a public repository page without logging in → verify the page renders with read-only content.
- [ ] **Anonymous user cannot access write actions**: Verify that create-issue, star-repo, and other write action buttons are not visible or are disabled for anonymous users.
- [ ] **Logged-in user sees authenticated shell**: Log in via OAuth flow → verify the sidebar shows the user avatar, notifications badge, and write actions.
- [ ] **Session expiry redirects to login**: Manually expire the session cookie → perform an action → verify the UI redirects to the login page or shows an auth error.
- [ ] **Logging out clears auth state**: Click logout → verify subsequent page loads show the anonymous shell.

### CLI E2E Tests
- [ ] **`codeplane auth status` shows current auth state**: After login, run `codeplane auth status` → verify it prints the username and token source.
- [ ] **CLI requests include Authorization header**: Run any authenticated CLI command → verify (via server logs or network inspection) that the `Authorization: token codeplane_<value>` header is sent.
- [ ] **CLI with `CODEPLANE_TOKEN` env var authenticates**: Set `CODEPLANE_TOKEN=codeplane_<valid_token>` and run `codeplane auth status` → verify it resolves the correct user.
- [ ] **CLI with invalid token shows auth error**: Set `CODEPLANE_TOKEN=codeplane_invalid` and run a protected command → verify a clear authentication error is shown.
- [ ] **CLI without any token shows unauthenticated state**: Ensure no token is stored, run `codeplane auth status` → verify it indicates unauthenticated status.

### Security Tests
- [ ] **Raw token is not logged**: Enable debug logging, make an authenticated request → grep all log output and verify the raw token value does not appear.
- [ ] **Session key is not logged**: Enable debug logging, make a session-authenticated request → verify the session key does not appear in logs.
- [ ] **Token hash is not reflected in API responses**: Make an authenticated request to any endpoint → verify the response body does not contain the token hash.
- [ ] **Cookie flags are correct**: After login, inspect the `Set-Cookie` header → verify `httpOnly` is set, `SameSite` is `Lax` or `Strict`, and `Secure` matches the configuration.
- [ ] **Deactivated user tokens do not resolve**: Deactivate a user → verify all their tokens immediately stop resolving (within the same request, no caching delay).

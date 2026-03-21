# OAUTH_AUTHORIZE_CODE_FLOW

Specification for OAUTH_AUTHORIZE_CODE_FLOW.

## High-Level User POV

When a third-party application wants to access JJHub resources on behalf of a user, it initiates the OAuth2 Authorization Code Flow. This is the standard mechanism by which users grant scoped, revocable access to external integrations without sharing their personal credentials.

The experience begins when a user clicks a "Sign in with JJHub" or "Connect to JJHub" button in a third-party application. The third-party application redirects the user's browser to JJHub's authorization page. On this page, the user sees which application is requesting access, what specific permissions (scopes) the application is asking for, and who developed the application. The user can review this information and either approve or deny the request.

If the user approves, JJHub redirects them back to the third-party application's registered callback URL with a short-lived authorization code. The third-party application then exchanges this code—along with its client credentials—for an access token and refresh token on its backend. The access token grants time-limited access (one hour), while the refresh token allows the application to obtain new access tokens without requiring the user to re-authorize (up to 90 days).

If the user denies the request, JJHub redirects them back to the third-party application with an error indicating the authorization was denied. The third-party application can then handle this gracefully and inform the user.

For public clients—such as single-page applications, mobile apps, and CLI tools that cannot securely store a client secret—the flow requires PKCE (Proof Key for Code Exchange). PKCE adds a cryptographic challenge-response step that prevents authorization code interception attacks, ensuring the flow remains secure even without a client secret.

This flow is the backbone of JJHub's third-party integration ecosystem. It lets developers build tools, bots, CI integrations, and editor plugins that work with JJHub repositories, issues, workflows, and workspaces while respecting user consent and the principle of least privilege. Users remain in control: they can see which applications have access, what scopes were granted, and revoke access at any time.

## Acceptance Criteria

- **Authorization endpoint behavior**:
  - `GET /api/oauth2/authorize` must accept the following query parameters: `response_type` (required, must be `"code"`), `client_id` (required), `redirect_uri` (required), `scope` (optional), `state` (optional), `code_challenge` (optional for confidential clients, required for public clients), `code_challenge_method` (optional, must be `"S256"` if provided).
  - The endpoint must require the user to be authenticated (session cookie or PAT). Unauthenticated requests return 401.
  - The endpoint must validate that `client_id` corresponds to a registered OAuth2 application. Unknown `client_id` returns 404.
  - The endpoint must validate that the `redirect_uri` exactly matches one of the application's registered redirect URIs. Mismatches return 400 `"invalid redirect_uri"`.
  - If `scope` is provided, each requested scope must be a subset of the application's registered scopes. Exceeding registered scopes returns 400. If `scope` is omitted, it defaults to the application's full registered scope set.
  - Scopes are normalized to lowercase canonical forms and deduplicated.
  - For public clients (`confidential: false`), `code_challenge` is required. Omitting it returns 400.
  - If `code_challenge_method` is provided, it must be `"S256"`. Other values return 400.
  - If `code_challenge_method` is provided without `code_challenge`, the request returns 400.
  - On success, an authorization code (64 hex characters) is generated and stored with a SHA-256 hash.
  - The authorization code expires after 10 minutes.
  - The authorization code is single-use: once consumed, it cannot be reused.
  - The response includes the `code` and the `state` parameter (if provided).

- **Consent screen (Web UI)**:
  - When a user visits the authorize endpoint via browser, they must see a consent screen showing: the application name, the requesting application's owner, the specific scopes being requested in human-readable form, and approve/deny buttons.
  - If the user is not logged in, they must be redirected to the login page first, then returned to the consent screen after authentication.
  - If the user approves, JJHub redirects the browser to the application's `redirect_uri` with `?code=<authorization_code>&state=<state>` appended as query parameters.
  - If the user denies, JJHub redirects the browser to the application's `redirect_uri` with `?error=access_denied&state=<state>`.
  - The consent screen must not auto-approve. The user must take an explicit action.

- **Token exchange endpoint behavior**:
  - `POST /api/oauth2/token` with `grant_type=authorization_code` must exchange a valid authorization code for an access token and refresh token.
  - Supports both `application/json` and `application/x-www-form-urlencoded` request bodies per RFC 6749.
  - Client credentials can be provided via request body (`client_id`, `client_secret`) or via HTTP Basic Auth.
  - For confidential clients, `client_secret` is required and verified via constant-time SHA-256 comparison.
  - For public clients, `code_verifier` is required and verified via PKCE S256 challenge validation.
  - The `redirect_uri` in the token request must exactly match the `redirect_uri` used in the authorization request.
  - Access tokens are prefixed with `jjhub_oat_`, are 64 hex characters after the prefix, and expire in 1 hour.
  - Refresh tokens are prefixed with `jjhub_ort_`, are 64 hex characters after the prefix, and expire in 90 days.
  - The response includes `access_token`, `token_type` (`"bearer"`), `expires_in` (3600), `refresh_token`, and optionally `scope`.
  - Only SHA-256 hashes of tokens are stored; plaintext tokens are returned exactly once.

- **Token refresh behavior**:
  - `POST /api/oauth2/token` with `grant_type=refresh_token` must exchange a valid refresh token for a new access token and refresh token pair.
  - The old refresh token is consumed atomically (single-use).
  - Client credential validation applies identically to the authorization code exchange.
  - Scopes on the new tokens match the scopes of the consumed refresh token.

- **Token revocation behavior**:
  - `POST /api/oauth2/revoke` with `token=<token_value>` revokes the given token.
  - Supports both access tokens and refresh tokens.
  - Per RFC 7009, revoking an invalid or already-revoked token is not an error (returns 200).
  - Supports both `application/json` and `application/x-www-form-urlencoded` request bodies.

- **PKCE constraints**:
  - Only `S256` method is supported (`plain` is rejected).
  - `code_challenge` must be a Base64URL-encoded SHA-256 hash of the `code_verifier` (per RFC 7636).
  - `code_verifier` length must be between 43 and 128 characters (per RFC 7636).
  - Verification uses constant-time comparison.

- **Error cases**:
  - Missing `response_type` or value other than `"code"` → 400.
  - Missing or empty `client_id` → 400.
  - Missing or empty `redirect_uri` → 400.
  - Unknown `client_id` → 404.
  - Invalid `redirect_uri` → 400.
  - Scope exceeds registered scopes → 400.
  - Missing `code_challenge` for public client → 400.
  - Invalid `code_challenge_method` → 400.
  - Expired or already-consumed authorization code → 400.
  - `redirect_uri` mismatch during token exchange → 400.
  - Invalid or missing `code_verifier` → 400.
  - Invalid `client_secret` → 401.
  - Unsupported `grant_type` → 400.
  - Missing `code` in authorization_code grant → 400.
  - Missing `refresh_token` in refresh_token grant → 400.

- **Definition of Done**:
  - The full OAuth2 Authorization Code Flow (with and without PKCE) works end-to-end from authorization through token exchange, refresh, and revocation.
  - A consent screen UI exists in the web application that shows application details, requested scopes, and approve/deny actions.
  - The authorize endpoint redirects the user's browser (with code or error) rather than returning raw JSON when accessed via browser.
  - CLI-initiated OAuth flows work using PKCE with a localhost redirect.
  - All token lifecycle operations (issue, refresh, revoke) function correctly.
  - E2E tests cover the complete flow including happy paths, PKCE, error cases, and edge cases.
  - Documentation covers the flow for third-party developers building integrations.

## Design

### Web UI Design

#### Consent Screen (`/oauth2/authorize`)

When a third-party application redirects a user to JJHub's authorize endpoint via browser, a dedicated consent screen must be displayed. This is a full-page view, not a modal.

**Layout**:

- **Header**: JJHub logo and the text "Authorize application".
- **Application info card**: Displays the application name, the username of the application owner, and the application's client ID (truncated).
- **Scope breakdown**: A list of requested scopes grouped by resource domain, each showing a human-readable label and description:
  - `read:repository` → "Read access to repositories" / "View repository contents, bookmarks, changes, and metadata"
  - `write:repository` → "Write access to repositories" / "Create, update, and delete repositories and their contents"
  - `read:user` → "Read access to your profile" / "View your profile information and email addresses"
  - `write:user` → "Write access to your profile" / "Update your profile, manage SSH keys and tokens"
  - `read:issue` → "Read access to issues" / "View issues, comments, labels, and milestones"
  - `write:issue` → "Write access to issues" / "Create, edit, close, and comment on issues"
  - `read:organization` → "Read access to organizations" / "View organization membership and team details"
  - `write:organization` → "Write access to organizations" / "Manage organization settings, members, and teams"
  - `read:notification` → "Read access to notifications" / "View notification inbox and preferences"
  - `write:notification` → "Write access to notifications" / "Mark notifications as read, manage preferences"
  - `all` → "Full access" / "Complete access to all JJHub resources on your behalf" (displayed with a warning banner)
- **Action buttons**: 
  - "Authorize [Application Name]" — primary/green button.
  - "Deny" — secondary/outline button.
- **Footer note**: "Authorizing will redirect to [redirect_uri domain]" with the full redirect URI shown in a monospace tooltip.

**Behavior**:

- If the user is not authenticated, redirect to `/login?return_to=/oauth2/authorize?...` preserving all query parameters.
- After approval, redirect the browser to `<redirect_uri>?code=<code>&state=<state>`.
- After denial, redirect the browser to `<redirect_uri>?error=access_denied&error_description=The+user+denied+the+request&state=<state>`.
- If any validation error occurs (invalid client_id, invalid redirect_uri, etc.), display an error page rather than redirecting to an untrusted URI.
- When the redirect_uri itself is invalid or unregistered, do NOT redirect—show an error page explaining the issue.

#### Authorized Applications Page (User Settings → Authorized Applications)

Users must be able to view and revoke access for applications they have authorized.

- **Location**: User Settings → "Authorized Applications" tab (distinct from "OAuth2 Applications" which manages apps the user owns).
- **List view**: Shows each authorized application with its name, scopes granted, and date authorized.
- **Revoke button**: Each entry has a "Revoke access" button with confirmation dialog: "Are you sure you want to revoke access for [App Name]? The application will no longer be able to access your account."
- **Empty state**: "No applications have been authorized to access your account."

### API Shape

#### Authorization Endpoint

**Endpoint**: `GET /api/oauth2/authorize`

**Authentication**: Required. Session cookie or PAT.

**Query parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `response_type` | `string` | Yes | Must be `"code"` |
| `client_id` | `string` | Yes | The application's client ID |
| `redirect_uri` | `string` | Yes | Must exactly match a registered redirect URI |
| `scope` | `string` | No | Space-separated list of scopes. Defaults to app's registered scopes |
| `state` | `string` | No | Opaque value for CSRF protection. Returned unchanged |
| `code_challenge` | `string` | Conditional | Required for public clients. Base64URL-encoded SHA-256 of `code_verifier` |
| `code_challenge_method` | `string` | Conditional | Must be `"S256"` if `code_challenge` is provided |

**Success response** (`200 OK` for API clients):

```json
{
  "code": "a1b2c3...64_hex_chars",
  "state": "user-provided-state"
}
```

When accessed via browser with `Accept: text/html`, the endpoint should render the consent screen HTML instead.

**Error responses**:

| Status | Condition |
|--------|----------|
| 400 | Invalid `response_type`, missing parameters, invalid redirect_uri, scope violation, PKCE issues |
| 401 | Not authenticated |
| 404 | Unknown `client_id` |

#### Token Exchange Endpoint

**Endpoint**: `POST /api/oauth2/token`

**Content types**: `application/json` or `application/x-www-form-urlencoded`

**Authorization Code Exchange** (`grant_type=authorization_code`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grant_type` | `string` | Yes | `"authorization_code"` |
| `code` | `string` | Yes | The authorization code |
| `redirect_uri` | `string` | Yes | Must match the URI used in authorization |
| `client_id` | `string` | Yes | The application's client ID |
| `client_secret` | `string` | Conditional | Required for confidential clients |
| `code_verifier` | `string` | Conditional | Required when PKCE was used |

**Refresh Token Exchange** (`grant_type=refresh_token`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grant_type` | `string` | Yes | `"refresh_token"` |
| `refresh_token` | `string` | Yes | The refresh token to exchange |
| `client_id` | `string` | Yes | The application's client ID |
| `client_secret` | `string` | Conditional | Required for confidential clients |

**Success response** (`200 OK`):

```json
{
  "access_token": "jjhub_oat_<64_hex_chars>",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "jjhub_ort_<64_hex_chars>",
  "scope": "read:repository read:user"
}
```

#### Token Revocation Endpoint

**Endpoint**: `POST /api/oauth2/revoke`

**Content types**: `application/json` or `application/x-www-form-urlencoded`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | `string` | Yes | The access or refresh token to revoke |

**Response**: `200 OK` with empty body.

### SDK Shape

The `OAuth2Service` in `@jjhub/sdk` exposes:

- `authorize(userID, clientID, redirectURI, scope, codeChallenge, codeChallengeMethod)` → `OAuth2AuthorizeResult`
- `exchangeCode(clientID, clientSecret, code, redirectURI, codeVerifier)` → `OAuth2TokenResponse`
- `refreshToken(clientID, clientSecret, refreshTokenValue)` → `OAuth2TokenResponse`
- `revokeToken(token)` → `void`
- `listAuthorizedApplications(userID)` → list of apps the user has granted tokens to (new method)
- `revokeApplicationAccess(userID, appID)` → revoke all tokens for a user-app pair (new method)

### CLI Command

No new dedicated CLI subcommand is needed. The authorize flow is consumed by external clients, not initiated from the JJHub CLI itself. Third-party CLI tools use PKCE with a localhost redirect. The existing `jjhub api` wrapper supports exercising all endpoints.

### Documentation

1. **"Building OAuth2 Integrations" Guide** (`docs/guides/building-oauth2-integrations.mdx`): Step-by-step walkthrough of the full authorization code flow for both confidential and public clients, with code examples in TypeScript/JavaScript, curl, and Python.
2. **"OAuth2 API Reference"** (`docs/api/oauth2.mdx`): Full reference for `/api/oauth2/authorize`, `/api/oauth2/token`, and `/api/oauth2/revoke` with request/response schemas and error codes.
3. **"Managing Authorized Applications" Guide** (`docs/guides/managing-authorized-apps.mdx`): How users view and revoke third-party application access.
4. **Security best practices callout**: Always use PKCE for public clients, store tokens securely, request minimal scopes, implement `state` for CSRF protection.

## Permissions & Security

### Authorization Roles

| Role | Can initiate authorization | Can approve/deny consent | Can exchange code for token | Can refresh token | Can revoke token |
|------|---------------------------|--------------------------|-----------------------------|--------------------|-------------------|
| Authenticated user | Yes | Yes (own account only) | N/A (done by the third-party app) | N/A (done by the third-party app) | Yes (own tokens) |
| Unauthenticated / Anonymous | No (401) | No (redirected to login) | N/A | N/A | No |
| Admin | Yes (same as any user) | Yes (own account only) | N/A | N/A | Yes (own tokens; admin can also revoke any via admin panel) |
| Third-party application | Redirects user to authorize | No (user must approve) | Yes (with valid code + credentials) | Yes (with valid refresh token) | Yes (with valid token) |

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `GET /api/oauth2/authorize` | 30 requests | per minute | per user |
| `POST /api/oauth2/token` | 60 requests | per minute | per client_id |
| `POST /api/oauth2/revoke` | 30 requests | per minute | per IP |
| Failed token exchanges | 10 failures | per 5 minutes | per client_id (then 15-minute lockout) |

**Brute-force protection**: If a single `client_id` accumulates 10 failed code exchange attempts within 5 minutes, all subsequent token requests for that client are temporarily rejected for 15 minutes. This prevents brute-force guessing of authorization codes.

### Data Privacy & PII

- **Authorization codes, access tokens, and refresh tokens** are never stored in plaintext. Only SHA-256 hashes are persisted.
- **Plaintext tokens** are returned exactly once in the HTTP response and must never be logged, cached in server memory beyond the request lifecycle, or included in error messages.
- **The consent screen** exposes the application name and owner username to the authorizing user. This is intentional and necessary for informed consent.
- **Scope grants** are associated with user IDs and application IDs. Cross-user enumeration of authorized applications is not possible through the API.
- **State parameter** is opaque to JJHub and passed through without storage. Third-party applications are responsible for managing their own CSRF tokens via `state`.
- **Authorization code lifetime** is strictly 10 minutes to minimize the window for interception.
- **Token prefix patterns** (`jjhub_oat_`, `jjhub_ort_`) enable secret scanning tools to detect accidentally exposed tokens in source code, logs, or public repositories.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `oauth2_authorization_initiated` | User lands on consent screen | `user_id`, `app_id`, `client_id`, `requested_scopes`, `has_pkce`, `timestamp` |
| `oauth2_authorization_approved` | User clicks "Authorize" | `user_id`, `app_id`, `client_id`, `granted_scopes`, `scope_count`, `has_pkce`, `timestamp` |
| `oauth2_authorization_denied` | User clicks "Deny" | `user_id`, `app_id`, `client_id`, `requested_scopes`, `timestamp` |
| `oauth2_authorization_failed` | Authorization request rejected (validation) | `client_id`, `error_code`, `error_detail`, `timestamp` |
| `oauth2_token_exchanged` | Successful code-to-token exchange | `app_id`, `client_id`, `grant_type`, `scope_count`, `has_pkce`, `timestamp` |
| `oauth2_token_exchange_failed` | Failed code-to-token exchange | `client_id`, `error_code`, `timestamp` |
| `oauth2_token_refreshed` | Successful refresh token exchange | `app_id`, `client_id`, `scope_count`, `timestamp` |
| `oauth2_token_refresh_failed` | Failed refresh token exchange | `client_id`, `error_code`, `timestamp` |
| `oauth2_token_revoked` | Token successfully revoked | `token_type` (`access` or `refresh`), `app_id`, `timestamp` |
| `oauth2_application_access_revoked` | User revokes all access for an app | `user_id`, `app_id`, `timestamp` |

### Funnel Metrics

1. **Authorization completion rate**: `oauth2_authorization_approved` / `oauth2_authorization_initiated`. Target: >80%. Low rates indicate confusing consent screen or over-broad scope requests.
2. **Authorization-to-token rate**: `oauth2_token_exchanged` / `oauth2_authorization_approved`. Target: >95%. Gap indicates third-party integration bugs in callback handling.
3. **Token refresh success rate**: `oauth2_token_refreshed` / (`oauth2_token_refreshed` + `oauth2_token_refresh_failed`). Target: >99%. Failures indicate token lifecycle issues.
4. **Consent denial rate**: `oauth2_authorization_denied` / `oauth2_authorization_initiated`. Monitor for trends. Spikes may indicate a specific application requesting excessive scopes.
5. **Active OAuth integrations**: Count of unique (user, app) pairs with a non-expired access or refresh token. Growth indicates ecosystem health.
6. **Time-to-first-token**: Time between application creation and first successful token exchange. Indicates developer onboarding friction.
7. **Revocation rate**: `oauth2_application_access_revoked` / active integrations per 30 days. High rates may indicate trust issues or applications misbehaving.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|  
| Authorization code issued | `info` | `user_id`, `app_id`, `client_id`, `scope_count`, `has_pkce`, `request_id` |
| Authorization denied by user | `info` | `user_id`, `app_id`, `client_id`, `request_id` |
| Authorization validation failed | `warn` | `client_id`, `error_code`, `error_detail`, `request_id`, `source_ip` |
| Token exchange succeeded | `info` | `app_id`, `client_id`, `grant_type`, `scope_count`, `request_id` |
| Token exchange failed | `warn` | `client_id`, `error_code`, `error_detail`, `request_id`, `source_ip` |
| Token refresh succeeded | `info` | `app_id`, `client_id`, `request_id` |
| Token refresh failed | `warn` | `client_id`, `error_code`, `request_id`, `source_ip` |
| Token revoked | `info` | `token_type`, `app_id`, `request_id` |
| PKCE verification failed | `warn` | `client_id`, `app_id`, `request_id`, `source_ip` |
| Brute-force lockout triggered | `error` | `client_id`, `failure_count`, `lockout_duration_seconds`, `source_ip` |
| Authorization code replay detected | `error` | `client_id`, `app_id`, `request_id`, `source_ip` |
| Expired authorization code used | `warn` | `client_id`, `code_age_seconds`, `request_id` |

**Critical logging rules**:
- Plaintext tokens, authorization codes, code verifiers, and client secrets MUST NEVER appear in any log entry at any level.
- Token hashes may appear in debug-level traces only.
- All log entries must include `request_id` for correlation.
- Failed authentication attempts must include `source_ip` for security forensics.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `jjhub_oauth2_authorizations_total` | Counter | `result` (`approved`, `denied`, `error`) | Total authorization requests by outcome |
| `jjhub_oauth2_authorize_duration_seconds` | Histogram | — | Latency of the authorize endpoint |
| `jjhub_oauth2_token_exchanges_total` | Counter | `grant_type`, `result` (`success`, `error`) | Total token exchange requests |
| `jjhub_oauth2_token_exchange_duration_seconds` | Histogram | `grant_type` | Latency of the token endpoint |
| `jjhub_oauth2_token_revocations_total` | Counter | `token_type` (`access`, `refresh`, `unknown`) | Total token revocations |
| `jjhub_oauth2_active_access_tokens` | Gauge | — | Number of non-expired access tokens |
| `jjhub_oauth2_active_refresh_tokens` | Gauge | — | Number of non-expired refresh tokens |
| `jjhub_oauth2_authorization_codes_active` | Gauge | — | Number of unconsumed, non-expired authorization codes |
| `jjhub_oauth2_pkce_verifications_total` | Counter | `result` (`success`, `failure`) | PKCE verification outcomes |
| `jjhub_oauth2_brute_force_lockouts_total` | Counter | — | Number of brute-force lockout events triggered |
| `jjhub_oauth2_token_exchange_errors_total` | Counter | `error_type` | Detailed error breakdown for token exchange failures |

### Alerts

#### Alert: High Authorization Code Exchange Failure Rate

**Condition**: `rate(jjhub_oauth2_token_exchange_errors_total[5m]) / rate(jjhub_oauth2_token_exchanges_total[5m]) > 0.2`

**Severity**: Warning

**Runbook**:
1. Check the breakdown by `error_type` label to identify the dominant failure mode.
2. If `expired_code` dominates: verify server clock synchronization (NTP). Check if authorization code TTL (10 min) is sufficient. Look for network latency between the user's browser and the third-party callback server.
3. If `invalid_code` dominates: check for authorization code replay attempts in the logs. Investigate whether a specific `client_id` is responsible.
4. If `invalid_secret` dominates: notify the application owner that their client secret may have been rotated or lost.
5. If `pkce_failure` dominates: check logs for the specific `client_id`. The integrating application likely has a PKCE implementation bug.
6. If `redirect_mismatch` dominates: the integrating application is sending a different redirect_uri during token exchange. Check if they recently changed their redirect URIs.

#### Alert: OAuth2 Token Exchange Latency Spike

**Condition**: `histogram_quantile(0.99, rate(jjhub_oauth2_token_exchange_duration_seconds_bucket[5m])) > 2.0`

**Severity**: Warning

**Runbook**:
1. Check database query latency for `oauth2_authorization_codes`, `oauth2_access_tokens`, and `oauth2_refresh_tokens` tables.
2. Look for table lock contention from concurrent code consumption.
3. Check `crypto.subtle.digest` performance—SHA-256 operations should be sub-millisecond.
4. Verify connection pool health.
5. Check if a large number of expired tokens/codes need cleanup. Run the cleanup job manually if needed.

#### Alert: Brute-Force Lockout Events

**Condition**: `rate(jjhub_oauth2_brute_force_lockouts_total[15m]) > 0`

**Severity**: Critical

**Runbook**:
1. Identify the locked-out `client_id` from the structured logs.
2. Determine whether the failures are from a legitimate integration or a malicious actor.
3. If legitimate: contact the application owner to verify their client credentials and PKCE implementation.
4. If malicious: check the `source_ip` in the logs. Consider adding the IP to a blocklist via the admin panel.
5. Verify the lockout automatically expires after 15 minutes. Monitor for repeat lockouts.

#### Alert: Authorization Code Accumulation

**Condition**: `jjhub_oauth2_authorization_codes_active > 1000`

**Severity**: Warning

**Runbook**:
1. A high number of active authorization codes suggests codes are being generated but not consumed.
2. Check if a specific application is generating excessive authorization requests without exchanging them.
3. Verify the cleanup scheduler is running and expiring codes older than 10 minutes.
4. If the cleanup job is stuck, restart it manually and investigate the root cause.

#### Alert: Elevated Consent Denial Rate

**Condition**: `rate(jjhub_oauth2_authorizations_total{result="denied"}[1h]) / rate(jjhub_oauth2_authorizations_total{result!="error"}[1h]) > 0.5`

**Severity**: Info

**Runbook**:
1. Identify which application(s) are being denied most frequently from the telemetry events.
2. Check if those applications are requesting overly broad scopes.
3. Reach out to the application developer to suggest scope reduction.
4. If a single application has an unusually high denial rate, investigate whether users are being phished.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Detection | Recovery |
|------------|-------------|-----------|----------|
| Unknown `client_id` | 404 | Log + metric | Show error page; third-party app has wrong client_id |
| Unregistered `redirect_uri` | 400 | Log + metric | Show error page (do NOT redirect); app misconfigured |
| Scope exceeds registered | 400 | Log + metric | Redirect with error or show error page |
| Public client missing PKCE | 400 | Log + metric | App must implement PKCE |
| Authorization code expired | 400 | Log + metric | User must re-authorize |
| Authorization code replayed | 400 | Log + metric (critical) | Possible code interception; investigate |
| Invalid client_secret | 401 | Log + metric | App has wrong or rotated secret |
| PKCE verification failure | 400 | Log + metric | App has PKCE implementation bug |
| redirect_uri mismatch | 400 | Log + metric | App sending inconsistent redirect_uris |
| Refresh token expired | 400 | Log + metric | User must re-authorize |
| Refresh token replayed | 400 | Log + metric | Possible token theft; investigate |
| Database unavailable | 500 | Log (error) + metric | Retry; follow DB recovery runbook |
| Crypto subsystem failure | 500 | Log (error) + metric | Check Bun runtime health; restart process |

## Verification

### API Integration Tests — Authorization Endpoint

1. **Happy path: authorize with confidential client** — Create an OAuth2 application (confidential). Call `GET /api/oauth2/authorize` with valid `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`. Assert 200, response contains `code` (64-char hex string) and `state` matching the input.
2. **Happy path: authorize with public client and PKCE** — Create a public OAuth2 application. Generate a `code_verifier` (43+ alphanumeric chars), compute `code_challenge` as Base64URL(SHA-256(verifier)). Call authorize with `code_challenge` and `code_challenge_method=S256`. Assert 200 with `code`.
3. **Scope defaults to app scopes when omitted** — Create app with scopes `["read:repository", "read:user"]`. Authorize without `scope` parameter. Exchange the code for a token. Assert `scope` in the token response matches `"read:repository read:user"`.
4. **Scope subset is accepted** — Create app with scopes `["read:repository", "write:repository", "read:user"]`. Authorize with `scope=read:repository`. Assert 200.
5. **Scope exceeding registered scopes is rejected** — Create app with scopes `["read:repository"]`. Authorize with `scope=write:repository`. Assert 400.
6. **Unknown scope string is rejected** — Authorize with `scope=read:nonexistent`. Assert 400.
7. **Duplicate scopes are deduplicated** — Authorize with `scope=read:repository read:repository`. Assert 200. Exchange and verify only one `read:repository` in token scope.
8. **State parameter is echoed** — Authorize with `state=abc123`. Assert response `state` equals `"abc123"`.
9. **State parameter is omitted when not provided** — Authorize without `state`. Assert response does not include `state` key.
10. **Missing response_type returns 400** — Omit `response_type`. Assert 400.
11. **Invalid response_type returns 400** — Set `response_type=token`. Assert 400.
12. **Missing client_id returns 400** — Omit `client_id`. Assert 400.
13. **Empty client_id returns 400** — Set `client_id=` (empty). Assert 400.
14. **Unknown client_id returns 404** — Set `client_id=nonexistent_id`. Assert 404.
15. **Missing redirect_uri returns 400** — Omit `redirect_uri`. Assert 400.
16. **Unregistered redirect_uri returns 400** — Use a redirect_uri not in the app's registered list. Assert 400 with `"invalid redirect_uri"`.
17. **Public client without code_challenge returns 400** — Create public app. Authorize without PKCE. Assert 400.
18. **code_challenge_method without code_challenge returns 400** — Set `code_challenge_method=S256` but omit `code_challenge`. Assert 400.
19. **Invalid code_challenge_method returns 400** — Set `code_challenge_method=plain`. Assert 400.
20. **Confidential client without PKCE succeeds** — Authorize confidential app without PKCE parameters. Assert 200.
21. **Unauthenticated request returns 401** — Call authorize without auth. Assert 401.
22. **Authorization code is 64 hex characters** — Assert the returned `code` matches `/^[0-9a-f]{64}$/`.

### API Integration Tests — Token Exchange

23. **Happy path: exchange code for token (confidential client)** — Authorize, then POST to `/api/oauth2/token` with `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri`. Assert 200 with `access_token` (starts with `jjhub_oat_`), `token_type=bearer`, `expires_in=3600`, `refresh_token` (starts with `jjhub_ort_`).
24. **Happy path: exchange code for token (public client with PKCE)** — Authorize with PKCE, then exchange with `code_verifier` (no `client_secret`). Assert 200.
25. **Token exchange with form-urlencoded body** — POST with `Content-Type: application/x-www-form-urlencoded`. Assert 200.
26. **Token exchange with JSON body** — POST with `Content-Type: application/json`. Assert 200.
27. **Client credentials via Basic Auth** — Send `client_id:client_secret` as Basic Auth header. Assert 200.
28. **Access token format** — Assert `access_token` matches `/^jjhub_oat_[0-9a-f]{64}$/`.
29. **Refresh token format** — Assert `refresh_token` matches `/^jjhub_ort_[0-9a-f]{64}$/`.
30. **Scope is included in token response** — Assert `scope` field matches the authorized scopes.
31. **Authorization code is single-use** — Exchange a code successfully, then try again. Assert 400 on second attempt.
32. **Expired authorization code is rejected** — Wait >10 minutes (or use time-mocking), then exchange. Assert 400.
33. **Missing code returns 400** — Omit `code`. Assert 400.
34. **Missing client_id returns 400** — Omit `client_id`. Assert 400.
35. **Invalid client_secret returns 401** — Provide wrong `client_secret`. Assert 401.
36. **redirect_uri mismatch returns 400** — Exchange with a different `redirect_uri`. Assert 400.
37. **Invalid code_verifier returns 400** — Exchange with wrong `code_verifier`. Assert 400.
38. **Missing code_verifier for PKCE-protected code returns 400** — Authorize with PKCE, exchange without `code_verifier`. Assert 400.
39. **Unsupported grant_type returns 400** — Set `grant_type=client_credentials`. Assert 400.
40. **Code from different app is rejected** — Create two apps. Authorize with app A, exchange using app B's `client_id`. Assert 400.

### API Integration Tests — Token Refresh

41. **Happy path: refresh token** — Exchange code for tokens, then refresh. Assert 200 with new token pair.
42. **Old refresh token is invalidated** — After refreshing, use the old refresh token. Assert 400.
43. **New tokens have correct format** — Assert prefixes and lengths.
44. **Scope is preserved across refresh** — Assert scope matches original.
45. **Invalid refresh token returns 400** — Use random string. Assert 400.
46. **Refresh with wrong client_id returns 400** — Use different app's `client_id`. Assert 400.
47. **Refresh with wrong client_secret returns 401** — Provide incorrect secret. Assert 401.

### API Integration Tests — Token Revocation

48. **Revoke access token** — Revoke, then attempt API call. Assert rejected.
49. **Revoke refresh token** — Revoke, then attempt refresh. Assert 400.
50. **Revoke invalid token returns 200** — Revoke random string. Assert 200 per RFC 7009.
51. **Revoke already-revoked token returns 200** — Revoke same token twice. Assert 200 both times.
52. **Revoke with form-urlencoded body** — Assert 200.
53. **Empty token returns 400** — POST with `token: ""`. Assert 400.

### API Integration Tests — Edge Cases

54. **Maximum scope set** — Authorize with all valid scopes. Assert 200.
55. **Authorization code at exactly 10 minutes** — Test boundary behavior with time mock.
56. **State parameter with special characters** — Use `state=a+b&c=d%20e`. Assert returned unmodified.
57. **State parameter at maximum length (2048 chars)** — Assert 200 and state returned.
58. **State parameter longer than 2048 chars** — Assert acceptance or predictable rejection.
59. **Concurrent code exchange attempts** — Send two exchange requests simultaneously. Assert exactly one succeeds.
60. **Multiple active tokens per user per app** — Authorize and exchange twice. Assert both tokens work.
61. **Redirect URI with fragment** — Assert validation error.
62. **Access token is usable for API calls** — Use token on `GET /api/user`. Assert 200.
63. **Access token scope enforcement** — Get token with `read:repository`, attempt write. Assert 403.

### E2E / Playwright UI Tests

64. **Consent screen renders** — Navigate to authorize URL. Assert consent screen displays app name and scopes.
65. **Consent screen shows correct scope descriptions** — Assert human-readable labels, not raw scope strings.
66. **Approve redirects to callback** — Click "Authorize". Assert redirect with `?code=` and `?state=`.
67. **Deny redirects with error** — Click "Deny". Assert redirect with `?error=access_denied`.
68. **Unauthenticated user is redirected to login** — Open authorize while logged out. Assert login redirect then return to consent.
69. **Invalid client_id shows error page** — Assert error page, not redirect.
70. **Invalid redirect_uri shows error page** — Assert error page, not redirect to bad URI.
71. **Authorized applications page lists apps** — Complete flow, check settings page.
72. **Revoke access from UI** — Click revoke, confirm. Assert app removed.
73. **After revocation, token no longer works** — Revoke via UI, attempt API call. Assert 401.

### CLI Integration Tests

74. **Full PKCE flow via localhost redirect** — Simulate public client CLI flow end-to-end.
75. **Exchange code via `jjhub api`** — Assert valid tokens returned.
76. **Revoke token via `jjhub api`** — Assert exit code 0.

### Security Tests

77. **Token not in URL query string** — Verify only auth code in redirect query params.
78. **Cross-user code exchange** — User A's code cannot be used by User B.
79. **Code bound to application** — App A's code fails with App B's client_id.
80. **Token hash stored, not plaintext** — Query DB directly; no plaintext tokens.
81. **Client secret constant-time comparison** — Verify via code inspection.
82. **PKCE verifier constant-time comparison** — Verify via code inspection.
83. **Revoked token rejected** — Revoke, then use. Assert 401.
84. **Expired access token rejected** — Wait/mock expiry, then use. Assert 401.

# OAUTH_ACCESS_TOKEN_EXCHANGE

Specification for OAUTH_ACCESS_TOKEN_EXCHANGE.

## High-Level User POV

When you are building a third-party application that integrates with JJHub — a web dashboard, a mobile app, a CI pipeline, a bot, or any external tool — the access token exchange is the critical moment where your application trades a temporary authorization code for real credentials that let it call JJHub's API on behalf of a user.

Before this step, the user has visited JJHub in their browser, seen a consent screen showing your application's name and the permissions it is requesting, and clicked "Approve." JJHub redirected the user's browser back to your application's callback URL with a short-lived, single-use authorization code in the query string. That code is not an API credential — it is a one-time proof that a specific user granted your application specific permissions. It expires in 10 minutes and can only be used once.

Your application takes that authorization code and exchanges it directly with JJHub's token endpoint, sending it along with your application's client ID and — for confidential (server-side) applications — your client secret. If your application is a public client (a single-page app, mobile app, CLI tool, or desktop app that cannot safely store secrets), you instead send the PKCE code verifier that your application generated at the start of the authorization flow. PKCE proves that the same application that initiated the authorization is the one completing it, preventing code interception attacks even without a shared secret.

If everything checks out — the code is valid and unused, it belongs to the right application, the redirect URI matches, and the PKCE verifier or client secret is correct — JJHub issues your application a token pair: an access token and a refresh token. The access token is a short-lived credential (valid for 1 hour) that your application uses in the `Authorization` header of every API request. The refresh token is a longer-lived credential (valid for 90 days) that your application uses to silently obtain a new access token when the current one expires, without bothering the user to re-authorize.

Both tokens are scoped. They can only do what the user approved on the consent screen. If your application was granted `read:repository` and `read:user`, the tokens cannot create issues, push changes, or perform any write operation. The tokens also carry a third-party trust level — they cannot manage credentials, OAuth2 applications, or access admin endpoints, regardless of the user's own permissions.

When the access token expires, your application sends the refresh token back to the same endpoint with a `refresh_token` grant type. JJHub invalidates the old refresh token and issues a fresh token pair. This rotation means that even if a refresh token is intercepted, it can only be used once before it becomes invalid. If the refresh token itself has expired or been revoked, your application must send the user through the full authorization flow again.

At any point, either the user or your application can revoke a token — access or refresh — by sending it to JJHub's revocation endpoint. Revocation is always successful from the caller's perspective, even if the token was already invalid, following RFC 7009's design for safe idempotency.

This exchange is the security-critical hinge of the entire OAuth2 flow. It is where JJHub enforces that only the right application, with the right proof, for the right user, with the right scopes, receives credentials — and that those credentials are time-limited, rotatable, and revocable.

## Acceptance Criteria

### Definition of Done

The feature is complete when:
- A registered OAuth2 application (confidential or public) can exchange a valid authorization code for an access token and refresh token via `POST /api/oauth2/token` with `grant_type=authorization_code`.
- A registered OAuth2 application can exchange a valid refresh token for a new token pair via `POST /api/oauth2/token` with `grant_type=refresh_token`.
- A token holder can revoke an access or refresh token via `POST /api/oauth2/revoke`.
- All security invariants (PKCE, one-time codes, secret verification, redirect URI matching, scope enforcement, token rotation) are enforced.
- All validation, error, and edge cases below are handled correctly.
- The endpoint is exercised end-to-end from the API, CLI, and SDK layers.

### Functional Criteria — Authorization Code Exchange

- [ ] `POST /api/oauth2/token` with `grant_type=authorization_code`, valid `client_id`, valid `code`, and matching `redirect_uri` returns `200 OK` with an access token, refresh token, token type, expires_in, and scope.
- [ ] The `access_token` field has the format `jjhub_oat_` followed by exactly 64 lowercase hexadecimal characters (total length: 74 characters).
- [ ] The `refresh_token` field has the format `jjhub_ort_` followed by exactly 64 lowercase hexadecimal characters (total length: 74 characters).
- [ ] The `token_type` field is `"bearer"`.
- [ ] The `expires_in` field is `3600` (1 hour in seconds).
- [ ] The `scope` field is a space-separated string of the scopes that were granted during authorization. If no scopes were granted, the field is omitted.
- [ ] The authorization code is consumed atomically — it can only be used once. A second exchange attempt with the same code returns an error.
- [ ] The authorization code must not be expired (10-minute TTL from issuance).
- [ ] The authorization code must belong to the application identified by `client_id`.
- [ ] The `redirect_uri` in the exchange request must exactly match the `redirect_uri` used during authorization.
- [ ] Only the SHA-256 hash of each token is stored in the database. The raw token values exist only in the response.
- [ ] The issued access token is immediately usable for API requests within its granted scopes.

### Functional Criteria — Confidential Client Authentication

- [ ] Confidential clients must provide a valid `client_secret` — either in the request body or via HTTP Basic Authentication (`Authorization: Basic base64(client_id:client_secret)`).
- [ ] If `client_secret` is provided in both the body and the Basic Auth header, the body values take precedence where populated.
- [ ] An invalid `client_secret` for a confidential client returns `401 Unauthorized`.
- [ ] The `client_secret` is verified using SHA-256 hash comparison with constant-time string equality to prevent timing attacks.

### Functional Criteria — Public Client (PKCE) Authentication

- [ ] Public clients must provide a valid `code_verifier` that matches the `code_challenge` submitted during authorization.
- [ ] PKCE verification uses S256: the code_verifier is SHA-256 hashed and base64url-encoded (without padding) and compared to the stored code_challenge using constant-time comparison.
- [ ] Public clients do not need a `client_secret`.
- [ ] A public client that omits the `code_verifier` when a code_challenge was set receives a `400 Bad Request` error.
- [ ] An invalid `code_verifier` (hash mismatch) returns `400 Bad Request`.

### Functional Criteria — Refresh Token Exchange

- [ ] `POST /api/oauth2/token` with `grant_type=refresh_token`, valid `client_id`, and valid `refresh_token` returns a new token pair.
- [ ] The old refresh token is atomically consumed (deleted) when a new token pair is issued — refresh token rotation.
- [ ] A consumed (already used) refresh token cannot be used again.
- [ ] An expired refresh token (>90 days) returns an error.
- [ ] A refresh token that does not belong to the specified `client_id` returns an error.
- [ ] A refresh token with null scopes (reauthorization required) returns `400 Bad Request` with message `"refresh token must be reauthorized"`.
- [ ] Confidential clients must provide a valid `client_secret` when refreshing.
- [ ] Public clients can refresh without a `client_secret`.
- [ ] The new token pair preserves the same scopes as the original grant.

### Functional Criteria — Token Revocation

- [ ] `POST /api/oauth2/revoke` with a valid access token removes it from the database.
- [ ] `POST /api/oauth2/revoke` with a valid refresh token removes it from the database.
- [ ] Revoking an already-revoked or invalid token returns `200 OK` (per RFC 7009).
- [ ] Revoking an expired token returns `200 OK`.
- [ ] After revocation, the revoked token is no longer usable for API access or refresh.

### Functional Criteria — Content Type Support

- [ ] The token endpoint accepts `application/json` request bodies.
- [ ] The token endpoint accepts `application/x-www-form-urlencoded` request bodies (per RFC 6749).
- [ ] The revocation endpoint accepts `application/json` request bodies.
- [ ] The revocation endpoint accepts `application/x-www-form-urlencoded` request bodies.

### Edge Cases

- [ ] **Empty grant_type**: `grant_type: ""` → `400 Bad Request` with message about unsupported grant_type.
- [ ] **Unknown grant_type**: `grant_type: "client_credentials"` → `400 Bad Request` with message `"unsupported grant_type, must be 'authorization_code' or 'refresh_token'"`.
- [ ] **Missing code for authorization_code grant**: `grant_type: "authorization_code"` with no `code` → `400` with `"code is required"`.
- [ ] **Empty code**: `code: ""` → `400` with `"code is required"`.
- [ ] **Whitespace-only code**: `code: "   "` → `400` with `"code is required"`.
- [ ] **Missing client_id for authorization_code grant**: `grant_type: "authorization_code"` with `code` but no `client_id` → `400` with `"client_id is required"`.
- [ ] **Empty client_id**: `client_id: ""` → `400` with `"client_id is required"`.
- [ ] **Invalid client_id (does not exist)**: Random `client_id` → `401 Unauthorized` with `"invalid client_id"`.
- [ ] **Code already consumed**: Use the same code twice → second attempt returns `400` with `"invalid or expired authorization code"`.
- [ ] **Code expired**: Wait >10 minutes after code issuance → `400` with `"invalid or expired authorization code"`.
- [ ] **Code belongs to a different application**: Exchange code with a different app's `client_id` → `400` with `"authorization code does not belong to this application"`.
- [ ] **Redirect URI mismatch**: Exchange with a different `redirect_uri` than was used during authorization → `400` with `"redirect_uri mismatch"`.
- [ ] **Missing redirect_uri**: `redirect_uri: ""` with a code that was issued with a specific redirect_uri → `400` with `"redirect_uri mismatch"`.
- [ ] **Confidential client with wrong secret**: Valid code, valid client_id, wrong secret → `401` with `"invalid client_secret"`.
- [ ] **Confidential client with empty secret**: Valid code, valid client_id, empty string secret → `401` with `"invalid client_secret"`.
- [ ] **Public client without PKCE when challenge was set**: Public client code has a code_challenge but exchange omits code_verifier → `400` with `"code_verifier is required"`.
- [ ] **Public client with wrong code_verifier**: code_verifier hash does not match stored challenge → `400` with `"invalid code_verifier"`.
- [ ] **Public client with no code_challenge set at all**: Public client that was authorized without a code_challenge → `400` with `"public clients require PKCE"`.
- [ ] **Missing refresh_token for refresh_token grant**: `grant_type: "refresh_token"` with no `refresh_token` → `400` with `"refresh_token is required"`.
- [ ] **Empty refresh_token**: `refresh_token: ""` → `400` with `"refresh_token is required"`.
- [ ] **Invalid refresh_token (does not exist)**: Random refresh_token value → `400` with `"invalid or expired refresh token"`.
- [ ] **Refresh token belongs to different app**: Refresh token issued to app A, exchanged with app B's client_id → `400` with `"refresh token does not belong to this application"`.
- [ ] **Missing token for revocation**: `POST /api/oauth2/revoke` with no `token` → `400` with `"token is required"`.
- [ ] **Empty token for revocation**: `token: ""` → `400` with `"token is required"`.
- [ ] **Non-JSON, non-form body to token endpoint**: Plain text body → `400` with `"invalid request body"`.
- [ ] **Empty JSON body to token endpoint**: `{}` → `400` with unsupported grant_type message.
- [ ] **Database write failure during token creation**: → `500 Internal Server Error`.
- [ ] **Concurrent exchange of the same code**: Two parallel requests with the same code → exactly one succeeds, the other fails with `"invalid or expired authorization code"`.
- [ ] **Concurrent refresh with the same refresh token**: Two parallel requests → exactly one succeeds, the other fails.
- [ ] **Basic Auth with malformed base64**: `Authorization: Basic !!!notbase64` → Falls through to body credentials or missing client_id error.
- [ ] **Basic Auth with no colon separator**: `Authorization: Basic dXNlcm5hbWU=` (no colon) → Falls through to body credentials.

### Boundary Constraints

- [ ] `grant_type`: Must be exactly `"authorization_code"` or `"refresh_token"`. Case-sensitive.
- [ ] `code`: 64 lowercase hexadecimal characters (generated by `randomHex(32)`).
- [ ] `client_id`: 40 lowercase hexadecimal characters.
- [ ] `client_secret`: `jjhub_oas_` prefix + 64 lowercase hexadecimal characters = 74 characters total.
- [ ] `code_verifier`: 43–128 characters per RFC 7636 (unrestricted character set from [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~").
- [ ] `access_token`: `jjhub_oat_` prefix + 64 lowercase hexadecimal characters = 74 characters total.
- [ ] `refresh_token`: `jjhub_ort_` prefix + 64 lowercase hexadecimal characters = 74 characters total.
- [ ] `expires_in`: Always `3600` for access tokens.
- [ ] Authorization code TTL: 10 minutes.
- [ ] Access token TTL: 1 hour.
- [ ] Refresh token TTL: 90 days.
- [ ] `redirect_uri`: Must exactly match the value used during authorization. No wildcard or partial matching.

## Design

### API Shape

**Endpoint**: `POST /api/oauth2/token`

**Authentication**: Not session-authenticated. Client authenticates via `client_id`/`client_secret` in the request body, via HTTP Basic Auth, or via PKCE code_verifier for public clients.

**Content-Type**: `application/json` or `application/x-www-form-urlencoded` (RFC 6749 §4.1.3).

#### Authorization Code Grant

**Request body**:

```json
{
  "grant_type": "authorization_code",
  "code": "64hexchars...",
  "client_id": "40hexchars...",
  "client_secret": "jjhub_oas_64hexchars...",
  "redirect_uri": "https://myapp.example.com/callback",
  "code_verifier": "original_code_verifier_value"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grant_type` | string | Yes | Must be `"authorization_code"`. |
| `code` | string | Yes | The authorization code received on the callback redirect. |
| `client_id` | string | Yes | Your application's client ID. Can also be provided via Basic Auth username. |
| `client_secret` | string | Confidential only | Your application's client secret. Can also be provided via Basic Auth password. Omit for public clients. |
| `redirect_uri` | string | Yes | Must exactly match the redirect_uri used during the authorization request. |
| `code_verifier` | string | PKCE flows | The original code verifier generated before authorization. Required when a code_challenge was provided during authorization. Required for all public clients. |

#### Refresh Token Grant

**Request body**:

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "jjhub_ort_64hexchars...",
  "client_id": "40hexchars...",
  "client_secret": "jjhub_oas_64hexchars..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grant_type` | string | Yes | Must be `"refresh_token"`. |
| `refresh_token` | string | Yes | The refresh token from a previous token exchange. |
| `client_id` | string | Yes | Your application's client ID. |
| `client_secret` | string | Confidential only | Required for confidential clients. |

#### Success Response (`200 OK`)

```json
{
  "access_token": "jjhub_oat_64hexchars...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "jjhub_ort_64hexchars...",
  "scope": "read:repository read:user"
}
```

| Field | Type | Always present | Description |
|-------|------|----------------|-------------|
| `access_token` | string | Yes | Bearer token for API authentication. Valid for 1 hour. |
| `token_type` | string | Yes | Always `"bearer"`. |
| `expires_in` | number | Yes | Token validity in seconds. Always `3600`. |
| `refresh_token` | string | Yes | Token for obtaining new access tokens. Valid for 90 days. Rotated on each use. |
| `scope` | string | No | Space-separated granted scopes. Omitted if no scopes were granted. |

#### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Invalid request body (non-JSON, non-form) | `{ "message": "invalid request body" }` |
| `400` | Missing `code` | `{ "message": "code is required" }` |
| `400` | Missing `client_id` | `{ "message": "client_id is required" }` |
| `400` | Missing `refresh_token` | `{ "message": "refresh_token is required" }` |
| `400` | Unsupported `grant_type` | `{ "message": "unsupported grant_type, must be 'authorization_code' or 'refresh_token'" }` |
| `400` | Invalid/expired/consumed code | `{ "message": "invalid or expired authorization code" }` |
| `400` | Code belongs to wrong application | `{ "message": "authorization code does not belong to this application" }` |
| `400` | Redirect URI mismatch | `{ "message": "redirect_uri mismatch" }` |
| `400` | Public client missing PKCE | `{ "message": "public clients require PKCE" }` |
| `400` | Missing code_verifier when challenge set | `{ "message": "code_verifier is required" }` |
| `400` | Invalid code_verifier | `{ "message": "invalid code_verifier" }` |
| `400` | Invalid/expired refresh token | `{ "message": "invalid or expired refresh token" }` |
| `400` | Refresh token app mismatch | `{ "message": "refresh token does not belong to this application" }` |
| `400` | Refresh token needs reauth | `{ "message": "refresh token must be reauthorized" }` |
| `401` | Invalid client_id | `{ "message": "invalid client_id" }` |
| `401` | Invalid client_secret | `{ "message": "invalid client_secret" }` |
| `500` | Database failure during token creation | `{ "message": "failed to create access token" }` or `{ "message": "failed to create refresh token" }` |

### Token Revocation API Shape

**Endpoint**: `POST /api/oauth2/revoke`

**Content-Type**: `application/json` or `application/x-www-form-urlencoded`.

**Request body**:

```json
{
  "token": "jjhub_oat_64hexchars..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Access token (`jjhub_oat_...`) or refresh token (`jjhub_ort_...`) to revoke. |

**Success Response**: `200 OK` with empty body. Always succeeds per RFC 7009.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Missing or empty `token` | `{ "message": "token is required" }` |
| `400` | Invalid request body | `{ "message": "invalid request body" }` |

### SDK Shape

The `OAuth2Service` in `@jjhub/sdk` provides three methods for this feature:

**`exchangeCode(clientID, clientSecret, code, redirectURI, codeVerifier)`** → `Promise<OAuth2TokenResponse>`
- Validates client credentials (secret for confidential, PKCE for public)
- Atomically consumes the authorization code
- Validates app ownership, redirect URI, code expiry
- Issues a new access + refresh token pair
- Throws structured `APIError` for all failure modes

**`refreshToken(clientID, clientSecret, refreshTokenValue)`** → `Promise<OAuth2TokenResponse>`
- Validates client credentials
- Atomically consumes the old refresh token (rotation)
- Validates app ownership, expiry, scope presence
- Issues a new token pair with the same scopes

**`revokeToken(token)`** → `Promise<void>`
- Attempts to delete as access token, then as refresh token
- Never throws for invalid tokens (RFC 7009)

**`OAuth2TokenResponse`**:
```typescript
interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}
```

### CLI Command

The CLI does not have a dedicated `token exchange` subcommand because token exchange is a machine-to-machine operation performed by OAuth2 client applications, not by end users interactively. However, the CLI supports the flow through raw API access for testing and debugging:

```bash
# Exchange authorization code
jjhub api /api/oauth2/token --method POST \
  -f "grant_type=authorization_code" \
  -f "client_id=40hexchars..." \
  -f "client_secret=jjhub_oas_64hexchars..." \
  -f "code=64hexchars..." \
  -f "redirect_uri=https://myapp.example.com/callback"

# Refresh token
jjhub api /api/oauth2/token --method POST \
  -f "grant_type=refresh_token" \
  -f "client_id=40hexchars..." \
  -f "client_secret=jjhub_oas_64hexchars..." \
  -f "refresh_token=jjhub_ort_64hexchars..."

# Revoke token
jjhub api /api/oauth2/revoke --method POST \
  -f "token=jjhub_oat_64hexchars..."
```

### Documentation

The existing `docs/guides/oauth2-applications.mdx` must be updated to ensure:

- **Step 4 (Exchange the Authorization Code for Tokens)** accurately reflects the actual API endpoint path (`/api/oauth2/token`), the actual token prefixes (`jjhub_oat_` for access, `jjhub_ort_` for refresh), and the exact response shape.
- **Confidential vs public client examples** are both present with the correct parameters.
- **PKCE verification** is explained alongside the code_verifier requirement.
- **Refresh token rotation** is explicitly documented: after each refresh, the old refresh token is invalidated and a new one is returned. Applications must store the new refresh token.
- **Error handling guidance** covers every error the token endpoint can return, with clear remediation instructions.
- **Token revocation** is documented with examples for both access and refresh token revocation.
- **Basic Auth support** is documented as an alternative credential delivery mechanism for confidential clients.
- **Content-Type support** mentions both JSON and form-urlencoded.
- **Security best practices** include: always use PKCE even for confidential clients, never log tokens, handle refresh token rotation correctly, implement exponential backoff on 401 errors.
- **Token prefix table** lists all prefixes: `jjhub_oas_` (client secret), `jjhub_oat_` (access token), `jjhub_ort_` (refresh token).

## Permissions & Security

### Authorization Roles

The token exchange endpoint (`POST /api/oauth2/token`) does NOT use session-based authentication. Instead, it authenticates the calling application:

| Caller | Can exchange codes? | Can refresh tokens? | Can revoke tokens? |
|--------|---------------------|---------------------|--------------------|  
| Confidential client (with valid client_secret) | Yes | Yes | N/A (revoke is separate) |
| Public client (with valid PKCE code_verifier) | Yes | Yes (without secret) | N/A |
| Any holder of a token value | N/A | N/A | Yes (revoke endpoint) |
| Unauthenticated caller with no valid credentials | No — `401` | No — `401` or `400` | No — `400` for missing token |

The revocation endpoint does not require application authentication — any party that possesses a token value can revoke it. This follows RFC 7009 and is intentional: it allows both the application and the resource owner (user) to revoke tokens.

### Token Trust Level

Tokens issued through OAuth2 carry a **third-party trust level**:

- **Cannot** manage personal access tokens, SSH keys, or OAuth2 applications.
- **Cannot** access admin endpoints.
- **Cannot** escalate beyond the granted scopes.
- **Can** access API resources within the intersection of the user's permissions and the granted scopes.

### Rate Limiting

- **Token exchange**: Standard mutation rate limit applies. The endpoint should additionally enforce a per-client_id rate limit of **30 requests per minute** to prevent brute-force code guessing or credential stuffing.
- **Token refresh**: Same per-client_id rate limit of **30 requests per minute**.
- **Token revocation**: Standard rate limit. No stricter limit needed since revocation is idempotent and non-destructive.
- **Failed exchange attempts**: After **10 consecutive failed exchanges** for a given `client_id` within a 5-minute window, the server should impose a 60-second cooldown before accepting further exchange requests for that client. This mitigates brute-force attacks on authorization codes.

### Data Privacy and PII

- Raw token values (`access_token`, `refresh_token`) are returned exactly once in the exchange response. Only SHA-256 hashes are persisted.
- Raw authorization codes are returned once during authorization and consumed during exchange. Only hashes are persisted.
- `client_secret` is never logged, never stored in plaintext, and is verified via hash comparison only.
- The token endpoint does not return user profile information. The token must be used to call a separate user info endpoint.
- Tokens in transit must be protected by TLS. The server should set `Strict-Transport-Security` headers.
- Log entries for token exchange events must include `client_id` and anonymized `user_id` but must NEVER include raw tokens, secrets, codes, or code_verifiers.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `OAuth2AccessTokenExchanged` | `client_id`, `app_id`, `user_id`, `grant_type` (`authorization_code`), `scope_count`, `confidential`, `used_pkce` (boolean), `timestamp` | On successful code-for-token exchange |
| `OAuth2AccessTokenRefreshed` | `client_id`, `app_id`, `user_id`, `scope_count`, `confidential`, `timestamp` | On successful refresh token exchange |
| `OAuth2TokenRevoked` | `token_type` (`access` or `refresh`), `timestamp` | On successful token revocation |
| `OAuth2TokenExchangeFailed` | `client_id` (if available), `grant_type`, `error_code`, `error_message`, `timestamp` | On any exchange or refresh failure |
| `OAuth2TokenRevocationAttempted` | `token_found` (boolean), `token_type` (if found), `timestamp` | On every revocation attempt (per RFC 7009, always 200) |

### Funnel Metrics

- **Authorization-to-exchange conversion rate**: Ratio of issued authorization codes to successfully exchanged codes. Target: >90%. A low rate indicates broken redirect flows, expired codes, or misconfigured clients.
- **Exchange latency (P50, P95, P99)**: Time from token request to response. Target: P95 < 200ms. Latency here directly impacts the user experience of signing into third-party apps.
- **Refresh success rate**: Ratio of successful refresh requests to total refresh requests. Target: >95%. A drop indicates token rotation bugs or premature expiration.
- **Active token count**: Number of non-expired access tokens in the system. Growth indicates healthy ecosystem adoption.
- **Unique applications exchanging tokens (weekly)**: Number of distinct `client_id` values performing successful exchanges. This is the primary indicator of third-party ecosystem health.
- **PKCE adoption rate**: Percentage of exchanges that include PKCE verification (for both confidential and public clients). Target: >80%.
- **Token lifetime utilization**: Ratio of average actual token age at last use to the maximum TTL. Indicates whether the 1-hour access token TTL is well-calibrated.

### Success Indicators

- Growing number of unique applications successfully exchanging tokens week-over-week.
- Exchange error rate < 5% of total attempts.
- Refresh success rate > 95%.
- No occurrences of authorization code reuse (would indicate a security incident).
- PKCE adoption trending toward 100% across all client types.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| Token exchange attempt started | `info` | `client_id`, `grant_type`, `has_pkce` (boolean), `content_type` |
| Token exchange succeeded (authorization_code) | `info` | `client_id`, `app_id`, `user_id`, `scope_count`, `used_pkce`, `confidential` |
| Token refresh succeeded | `info` | `client_id`, `app_id`, `user_id`, `scope_count` |
| Token exchange failed — invalid client_id | `warn` | `client_id_attempted`, `grant_type` |
| Token exchange failed — invalid client_secret | `warn` | `client_id`, `grant_type` |
| Token exchange failed — invalid/expired code | `warn` | `client_id`, `grant_type` |
| Token exchange failed — code app mismatch | `warn` | `client_id`, `grant_type`, `code_app_id` |
| Token exchange failed — redirect_uri mismatch | `warn` | `client_id`, `grant_type` |
| Token exchange failed — PKCE failure | `warn` | `client_id`, `grant_type`, `pkce_method` |
| Token exchange failed — invalid refresh token | `warn` | `client_id`, `grant_type` |
| Token exchange failed — refresh token app mismatch | `warn` | `client_id`, `grant_type` |
| Token revocation attempt | `info` | `token_type_detected` (access/refresh/unknown), `found` (boolean) |
| Token creation database error | `error` | `client_id`, `app_id`, `error_message`, `stack_trace` |
| Unsupported grant_type received | `warn` | `grant_type_received`, `client_id` |

**Critical Logging Rules**:
- Raw `code`, `code_verifier`, `client_secret`, `access_token`, and `refresh_token` values must NEVER appear in any log at any level.
- The `client_id` is safe to log — it is a public identifier.
- `user_id` should be logged as a numeric ID, never as an email address or username.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `jjhub_oauth2_token_exchanges_total` | Counter | `grant_type` (`authorization_code`, `refresh_token`), `status` (`success`, `error`), `confidential` | Total token exchange attempts |
| `jjhub_oauth2_token_exchange_errors_total` | Counter | `grant_type`, `error_type` (`invalid_client`, `invalid_code`, `expired_code`, `pkce_failure`, `redirect_mismatch`, `invalid_refresh`, `system`) | Total exchange failures by error category |
| `jjhub_oauth2_token_exchange_duration_seconds` | Histogram | `grant_type` | Latency of token exchange (request to response) |
| `jjhub_oauth2_tokens_issued_total` | Counter | `token_type` (`access`, `refresh`) | Total tokens issued |
| `jjhub_oauth2_tokens_revoked_total` | Counter | `token_type` (`access`, `refresh`, `not_found`) | Total token revocations |
| `jjhub_oauth2_active_access_tokens` | Gauge | | Current count of non-expired access tokens |
| `jjhub_oauth2_active_refresh_tokens` | Gauge | | Current count of non-expired refresh tokens |
| `jjhub_oauth2_pkce_usage_total` | Counter | `result` (`success`, `failure`, `not_used`) | PKCE verification outcomes |
| `jjhub_oauth2_authorization_code_reuse_total` | Counter | | Attempted reuse of consumed authorization codes (security metric) |

### Alerts

#### Alert: `OAuth2TokenExchangeErrorRateHigh`

**Condition**: `rate(jjhub_oauth2_token_exchange_errors_total{error_type="system"}[5m]) > 0.1`

**Severity**: Warning

**Runbook**:
1. Check server error logs for `oauth2` context entries at `error` level in the last 15 minutes.
2. The most likely cause is a database availability issue — verify the database is healthy (connection pool, replication lag, disk space).
3. Check if the `createOAuth2AccessToken` or `createOAuth2RefreshToken` insert queries are failing. Look for constraint violations or connection timeouts.
4. If the database is healthy, check for recent code deployments that may have introduced regressions in the `exchangeCode` or `refreshToken` paths.
5. Verify that the SHA-256 hashing (crypto.subtle) is functioning — though this is extremely unlikely to fail.
6. If the issue is database-related, follow the standard database recovery runbook. If code-related, roll back the most recent deployment.

#### Alert: `OAuth2TokenExchangeLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(jjhub_oauth2_token_exchange_duration_seconds_bucket[5m])) > 1`

**Severity**: Warning

**Runbook**:
1. Token exchange performs 2–3 database queries (lookup app, consume code, create tokens). Check individual query latencies.
2. Look for lock contention on the `oauth2_authorization_codes` table — the `ConsumeOAuth2AuthorizationCode` query uses an atomic UPDATE ... WHERE ... RETURNING pattern that acquires a row lock.
3. Check for elevated request volume that may be causing connection pool exhaustion.
4. Verify no table bloat on `oauth2_access_tokens` or `oauth2_refresh_tokens`. If the tables have grown large, ensure the cleanup scheduler is running (expired token deletion).
5. If latency is isolated to a single server instance, restart it.

#### Alert: `OAuth2AuthorizationCodeReuseDetected`

**Condition**: `increase(jjhub_oauth2_authorization_code_reuse_total[5m]) > 0`

**Severity**: Critical

**Runbook**:
1. **This is a potential security incident.** Authorization code reuse may indicate an interception attack where an attacker captured a code and tried to use it after the legitimate client already exchanged it.
2. Identify the `client_id` and `user_id` associated with the reuse attempt from the warn-level logs.
3. Consider revoking all tokens for the affected application + user combination.
4. Notify the application owner that their authorization flow may have been compromised.
5. Check whether the reuse came from the same IP as the original exchange or a different one. Different IPs strongly suggest interception.
6. If this alert fires repeatedly for the same application, consider temporarily suspending the application.

#### Alert: `OAuth2InvalidClientSecretSpike`

**Condition**: `rate(jjhub_oauth2_token_exchange_errors_total{error_type="invalid_client"}[5m]) > 1`

**Severity**: Warning

**Runbook**:
1. A spike in invalid client credentials suggests either a misconfigured client or a credential stuffing attack.
2. Check the `client_id` values in warn-level logs. If concentrated on a single `client_id`, the application owner may have rotated their secret and forgotten to update their application.
3. If the attempts come from many different `client_id` values, it may be a scanning attack. Check source IPs and consider IP-level blocking.
4. Verify the per-client_id rate limit is functioning to throttle brute-force attempts.
5. No immediate action needed if the spike is transient. If persistent (>1 hour), contact the application owner.

#### Alert: `OAuth2RefreshTokenFailureRateHigh`

**Condition**: `rate(jjhub_oauth2_token_exchange_errors_total{grant_type="refresh_token", error_type!="system"}[15m]) / rate(jjhub_oauth2_token_exchanges_total{grant_type="refresh_token"}[15m]) > 0.2`

**Severity**: Warning

**Runbook**:
1. A high refresh failure rate (>20%) indicates that applications are sending stale or already-consumed refresh tokens.
2. The most common cause is a client that does not properly store the new refresh token after rotation. Check if the failures are concentrated on a single `client_id`.
3. If a single application is responsible, the issue is likely a client-side bug in their token storage. Reach out to the developer.
4. If the failures are distributed across many applications, check whether a recent server-side change affected refresh token issuance or consumption logic.
5. Verify the cleanup scheduler is not prematurely deleting valid refresh tokens.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Predictability | Recovery |
|------------|-------------|----------------|----------|
| Unsupported grant_type | 400 | Predictable | Fix the `grant_type` value |
| Missing required field (code, client_id, refresh_token) | 400 | Predictable | Provide the required field |
| Invalid/expired authorization code | 400 | Predictable | Request a new authorization code from the user |
| Authorization code already consumed | 400 | Predictable | Request a new authorization code — the original was already used |
| Code belongs to wrong application | 400 | Predictable | Ensure the `client_id` matches the application that initiated the authorization |
| Redirect URI mismatch | 400 | Predictable | Use the exact same `redirect_uri` as in the authorization request |
| PKCE verification failure | 400 | Predictable | Regenerate the code_verifier/code_challenge pair and restart the flow |
| Invalid/expired refresh token | 400 | Predictable | Request a new authorization from the user |
| Refresh token app mismatch | 400 | Predictable | Use the correct `client_id` for the application that was granted the refresh token |
| Refresh token needs reauthorization | 400 | Predictable | Send the user through the full authorization flow again |
| Invalid client_id | 401 | Predictable | Use a valid, registered client_id |
| Invalid client_secret | 401 | Predictable | Use the correct client_secret for the application |
| Database failure during token creation | 500 | Unpredictable | Retry with exponential backoff; if persistent, escalate |
| Database failure during code consumption | 500 | Unpredictable | Retry; the code may still be unconsumed |
| Crypto subsystem failure (SHA-256) | 500 | Extremely rare | Restart the server process |

## Verification

### API Integration Tests — Authorization Code Exchange

- [ ] **Happy path — confidential client with PKCE**: Create an OAuth2 app (confidential), authorize a user with PKCE, exchange the code with `client_secret` + `code_verifier` → `200` with `access_token` matching `/^jjhub_oat_[0-9a-f]{64}$/`, `refresh_token` matching `/^jjhub_ort_[0-9a-f]{64}$/`, `token_type: "bearer"`, `expires_in: 3600`.
- [ ] **Happy path — confidential client without PKCE**: Create a confidential app, authorize without code_challenge, exchange with `client_secret` only → `200` with valid token pair.
- [ ] **Happy path — public client with PKCE**: Create a public app, authorize with PKCE (code_challenge + S256), exchange with `code_verifier` (no secret) → `200` with valid token pair.
- [ ] **Response shape validation**: Verify all fields present in success response: `access_token` (string), `token_type` (string), `expires_in` (number), `refresh_token` (string), `scope` (string, optional).
- [ ] **Access token format**: Verify `access_token` matches `/^jjhub_oat_[0-9a-f]{64}$/`.
- [ ] **Refresh token format**: Verify `refresh_token` matches `/^jjhub_ort_[0-9a-f]{64}$/`.
- [ ] **Token type**: Verify `token_type` is exactly `"bearer"`.
- [ ] **Expires in**: Verify `expires_in` is exactly `3600`.
- [ ] **Scope in response**: Authorize with scopes `["read:repository", "read:user"]` → exchange → response includes `scope: "read:repository read:user"`.
- [ ] **No scope in response**: Authorize with empty scopes → exchange → response does not include `scope` field.
- [ ] **Token uniqueness**: Exchange two different codes → access_token and refresh_token differ between the two responses.
- [ ] **Issued access token is usable**: Exchange code → use returned access_token to call `GET /api/repos` → `200 OK`.
- [ ] **Issued access token respects scope**: Exchange with `read:repository` scope → use token to call a write endpoint → `403 Forbidden`.
- [ ] **Issued access token carries third-party trust**: Exchange token → attempt to call `GET /api/oauth2/applications` (credential management) → rejected.
- [ ] **Form-urlencoded content type**: Send `grant_type=authorization_code&code=...&client_id=...&client_secret=...&redirect_uri=...` with `Content-Type: application/x-www-form-urlencoded` → `200` with valid token pair.
- [ ] **JSON content type**: Send equivalent request as JSON → `200` with valid token pair.
- [ ] **Basic Auth for client credentials**: Send `client_id` and `client_secret` in `Authorization: Basic base64(client_id:client_secret)` header, with `code` and `redirect_uri` in body → `200`.
- [ ] **Basic Auth partial — client_id in header, secret in body**: Basic Auth with only client_id, client_secret in body → should work (body takes precedence for populated fields).

### API Integration Tests — Authorization Code Edge Cases

- [ ] **Empty grant_type**: `grant_type: ""` → `400` with unsupported grant_type message.
- [ ] **Unknown grant_type**: `grant_type: "client_credentials"` → `400` with `"unsupported grant_type, must be 'authorization_code' or 'refresh_token'"`.
- [ ] **Missing code**: `grant_type: "authorization_code"` without `code` → `400` with `"code is required"`.
- [ ] **Empty code**: `code: ""` → `400` with `"code is required"`.
- [ ] **Whitespace-only code**: `code: "   "` → `400` with `"code is required"`.
- [ ] **Missing client_id**: `grant_type: "authorization_code"` with `code` but no `client_id` → `400` with `"client_id is required"`.
- [ ] **Empty client_id**: `client_id: ""` → `400` with `"client_id is required"`.
- [ ] **Invalid client_id**: Random nonexistent `client_id` → `401` with `"invalid client_id"`.
- [ ] **Code already consumed (second use)**: Exchange a code successfully, then try the same code again → `400` with `"invalid or expired authorization code"`.
- [ ] **Expired code**: Issue a code, wait >10 minutes (or use test time control), exchange → `400` with `"invalid or expired authorization code"`.
- [ ] **Code belongs to different application**: Create two apps, authorize with app A, exchange with app B's `client_id` → `400` with `"authorization code does not belong to this application"`.
- [ ] **Redirect URI mismatch**: Authorize with `https://a.com/cb`, exchange with `https://b.com/cb` → `400` with `"redirect_uri mismatch"`.
- [ ] **Missing redirect_uri in exchange**: Authorize with `https://a.com/cb`, exchange with empty `redirect_uri` → `400` with `"redirect_uri mismatch"`.
- [ ] **Confidential client — wrong secret**: Exchange with incorrect `client_secret` → `401` with `"invalid client_secret"`.
- [ ] **Confidential client — empty secret**: Exchange with `client_secret: ""` → `401` with `"invalid client_secret"`.
- [ ] **Public client — missing code_verifier**: Authorize public client with PKCE, exchange without `code_verifier` → `400` with `"code_verifier is required"`.
- [ ] **Public client — wrong code_verifier**: Exchange with incorrect `code_verifier` → `400` with `"invalid code_verifier"`.
- [ ] **Public client — no PKCE at authorization**: Attempt to authorize a public client without `code_challenge` → authorization step itself fails with `"code_challenge is required for public clients"`.
- [ ] **Concurrent exchange of the same code**: Send two parallel exchange requests with the same code → exactly one returns `200`, the other returns `400`.
- [ ] **Non-JSON, non-form body**: Send plain text to `/api/oauth2/token` → `400` with `"invalid request body"`.
- [ ] **Empty JSON body**: `{}` → `400` with unsupported grant_type message.
- [ ] **Malformed Basic Auth (bad base64)**: `Authorization: Basic !!!` → Falls through, then `400` for missing `client_id`.
- [ ] **Malformed Basic Auth (no colon)**: `Authorization: Basic dXNlcm5hbWU=` → Falls through, then `400` for missing `client_id`.

### API Integration Tests — Refresh Token Exchange

- [ ] **Happy path — confidential client refresh**: Exchange a code, then refresh with the returned `refresh_token` and `client_secret` → `200` with a new token pair.
- [ ] **Happy path — public client refresh (no secret)**: Exchange with PKCE, then refresh with `refresh_token` only (no `client_secret`) → `200` with a new token pair.
- [ ] **Refresh token rotation**: After a successful refresh, the old `refresh_token` is no longer usable → second refresh with old token → `400`.
- [ ] **New refresh token is usable**: After refreshing, use the new `refresh_token` to refresh again → `200`.
- [ ] **Scopes preserved after refresh**: Original exchange with scopes `["read:repository"]` → refresh → new token pair has the same `scope: "read:repository"`.
- [ ] **New access token is usable**: After refresh, use the new `access_token` to call the API → `200`.
- [ ] **Old access token is still valid (until expiry)**: After refresh, the old `access_token` remains valid (access tokens are not revoked on refresh, only refresh tokens are rotated).
- [ ] **Missing refresh_token field**: `grant_type: "refresh_token"` without `refresh_token` → `400` with `"refresh_token is required"`.
- [ ] **Empty refresh_token**: `refresh_token: ""` → `400` with `"refresh_token is required"`.
- [ ] **Invalid refresh_token**: Random token value → `400` with `"invalid or expired refresh token"`.
- [ ] **Refresh token belongs to wrong app**: Refresh token from app A, exchanged with app B's `client_id` → `400` with `"refresh token does not belong to this application"`.
- [ ] **Confidential client refresh with wrong secret**: Valid refresh token, wrong `client_secret` → `401` with `"invalid client_secret"`.
- [ ] **Missing client_id for refresh**: `grant_type: "refresh_token"` without `client_id` → `400` with `"client_id is required"`.
- [ ] **Concurrent refresh with same token**: Two parallel refresh requests with the same refresh token → exactly one succeeds, the other fails.
- [ ] **Chained refreshes**: Exchange → refresh → refresh → refresh (3 chained refreshes) → each succeeds with a new token pair, each old refresh token is invalidated.
- [ ] **Refresh with form-urlencoded**: Same test as happy path but with `Content-Type: application/x-www-form-urlencoded` → `200`.

### API Integration Tests — Token Revocation

- [ ] **Revoke valid access token**: Exchange, revoke the `access_token` → `200 OK`. Use the revoked token → `401`.
- [ ] **Revoke valid refresh token**: Exchange, revoke the `refresh_token` → `200 OK`. Attempt to refresh with the revoked token → `400`.
- [ ] **Revoke already-revoked token**: Revoke the same token twice → both return `200 OK`.
- [ ] **Revoke unknown token**: Revoke a random string → `200 OK` (per RFC 7009).
- [ ] **Revoke empty token**: `token: ""` → `400` with `"token is required"`.
- [ ] **Revoke missing token field**: Empty body → `400` with `"token is required"`.
- [ ] **Revoke with form-urlencoded**: Send `token=jjhub_oat_...` as form data → `200 OK`.
- [ ] **Revoke with JSON**: Send `{"token": "jjhub_oat_..."}` as JSON → `200 OK`.

### API Integration Tests — Full Flow E2E

- [ ] **Complete authorization code flow**: Create confidential app → authorize user with scopes and PKCE → exchange code for tokens → use access token to call API → refresh token → use new access token → revoke access token → verify revoked token is rejected.
- [ ] **Complete public client flow**: Create public app → authorize user with PKCE → exchange code with code_verifier (no secret) → use access token → refresh without secret → revoke.
- [ ] **Multi-user flow**: Create app → authorize user A → authorize user B → both exchange successfully → user A's tokens do not grant access to user B's resources.
- [ ] **Application deletion revokes all tokens**: Create app → exchange tokens for two users → delete the application → verify all tokens are invalidated.

### CLI Integration Tests

- [ ] **CLI code exchange via `api` subcommand**: `jjhub api /api/oauth2/token --method POST -f "grant_type=authorization_code" -f "client_id=..." -f "code=..." -f "redirect_uri=..." -f "client_secret=..."` → exit code 0, JSON response with `access_token` and `refresh_token`.
- [ ] **CLI refresh via `api` subcommand**: `jjhub api /api/oauth2/token --method POST -f "grant_type=refresh_token" -f "client_id=..." -f "refresh_token=..." -f "client_secret=..."` → exit code 0, JSON response with new token pair.
- [ ] **CLI revoke via `api` subcommand**: `jjhub api /api/oauth2/revoke --method POST -f "token=jjhub_oat_..."` → exit code 0.
- [ ] **CLI error on invalid code**: Exchange with an invalid code → non-zero exit code or error in JSON output.
- [ ] **CLI error on missing grant_type**: Exchange without `grant_type` → error response.

### E2E / Playwright Tests (Web UI)

- [ ] **OAuth2 authorization consent screen renders**: Navigate to the authorization URL with valid query parameters while logged in → consent screen displays the application name and requested scopes.
- [ ] **Consent screen — approve redirects with code**: Click "Approve" on the consent screen → browser is redirected to the registered redirect_uri with a `code` query parameter and the original `state` parameter.
- [ ] **Consent screen — deny redirects with error**: Click "Deny" on the consent screen → browser is redirected to the redirect_uri with `error=access_denied` and the original `state` parameter.
- [ ] **Consent screen — unauthenticated redirect to login**: Visit authorization URL while not logged in → redirected to login page → after login, returned to consent screen.
- [ ] **Authorized applications list**: After completing an OAuth2 flow, navigate to Settings > Authorized Applications → the application appears in the list with its name and granted scopes.
- [ ] **Revoke authorization from settings**: In Settings > Authorized Applications, click "Revoke" on an application → application is removed from the list → tokens for that application are invalidated.

### Load and Boundary Tests

- [ ] **Maximum-length code_verifier (128 chars)**: Use a 128-character code_verifier → PKCE verification succeeds.
- [ ] **Minimum-length code_verifier (43 chars)**: Use a 43-character code_verifier → PKCE verification succeeds.
- [ ] **Code_verifier with all allowed special characters**: Use a verifier containing `-`, `.`, `_`, `~` → PKCE verification succeeds.
- [ ] **Rapid sequential exchanges**: Exchange 20 different authorization codes in quick succession → all succeed independently with unique tokens.
- [ ] **Rapid sequential refreshes**: Chain 20 refreshes in quick succession → each succeeds, each old refresh token is consumed.
- [ ] **Exchange after exactly 10 minutes (code boundary)**: Issue a code and attempt to exchange it at exactly the TTL boundary. Verify behavior at 9m59s → succeeds, and at 10m1s → fails.

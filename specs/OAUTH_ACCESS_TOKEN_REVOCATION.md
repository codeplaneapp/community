# OAUTH_ACCESS_TOKEN_REVOCATION

Specification for OAUTH_ACCESS_TOKEN_REVOCATION.

## High-Level User POV

When you have authorized a third-party application to access your Codeplane account through OAuth2 — perhaps a CI bot, a mobile companion app, a project management integration, or a developer tool — that application holds access tokens and refresh tokens that let it act on your behalf. Token revocation is the mechanism that lets you, the application, or Codeplane itself immediately invalidate those credentials, cutting off access the moment trust is no longer warranted.

There are two distinct perspectives on token revocation. As a **resource owner** (the user whose account was authorized), you may want to revoke access because you no longer use the application, because you suspect the application has been compromised, or simply because you are cleaning up old authorizations. You should be able to see which applications hold active tokens for your account and revoke access to any of them with a single action. When you revoke an application's access, all of its tokens — both short-lived access tokens and long-lived refresh tokens — are immediately invalidated. The application can no longer call any Codeplane API on your behalf until you explicitly re-authorize it.

As an **application developer**, you may need to programmatically revoke tokens during user sign-out flows, when a user uninstalls your application, or as part of security incident response. Your application sends the token value to Codeplane's revocation endpoint, and Codeplane deletes it. The endpoint is designed to be safe and idempotent: revoking a token that has already been revoked, has expired, or never existed in the first place always succeeds silently. This means your application never has to worry about error handling during cleanup — revocation is a fire-and-forget operation.

Token revocation is immediate. The moment a token is revoked, any in-flight or subsequent API request using that token is rejected. There is no grace period, no eventual consistency delay, and no cache to drain. This is critical for security: if a token is leaked, revocation must be an instant kill switch.

Codeplane supports revoking both access tokens (short-lived, 1-hour TTL, prefixed `codeplane_oat_`) and refresh tokens (long-lived, 90-day TTL, prefixed `codeplane_ort_`). The revocation endpoint does not require the caller to specify which type of token is being revoked — Codeplane determines this automatically. This follows RFC 7009 (OAuth 2.0 Token Revocation), which Codeplane implements faithfully.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- A token holder (user, application, or any party possessing the raw token value) can revoke an OAuth2 access token or refresh token via `POST /api/oauth2/revoke`.
- A user can view all active OAuth2 access tokens granted to third-party applications on their account, and revoke individual tokens or all tokens for a specific application, from the web UI settings page.
- Revoked tokens are immediately unusable for API authentication or refresh flows.
- The revocation endpoint conforms to RFC 7009: invalid, expired, or already-revoked tokens return `200 OK` without error.
- All clients (API, Web UI, CLI via `api` subcommand) can exercise token revocation.
- Token revocation is covered by comprehensive integration and E2E tests.

### Functional Criteria

- [ ] `POST /api/oauth2/revoke` with a valid `token` field containing an access token (`codeplane_oat_...`) deletes the token from the database and returns `200 OK` with an empty body.
- [ ] `POST /api/oauth2/revoke` with a valid `token` field containing a refresh token (`codeplane_ort_...`) deletes the token from the database and returns `200 OK` with an empty body.
- [ ] After an access token is revoked, any API request using that token in the `Authorization: Bearer` header returns `401 Unauthorized`.
- [ ] After a refresh token is revoked, any `POST /api/oauth2/token` with `grant_type=refresh_token` using that token returns `400 Bad Request` with `"invalid or expired refresh token"`.
- [ ] Revoking an already-revoked token returns `200 OK` (idempotent, per RFC 7009).
- [ ] Revoking an expired token returns `200 OK` (no error, per RFC 7009).
- [ ] Revoking a token string that was never issued returns `200 OK` (no error, per RFC 7009).
- [ ] The endpoint does not require session-based authentication — any party possessing the raw token value can revoke it.
- [ ] The endpoint accepts both `application/json` and `application/x-www-form-urlencoded` request bodies.
- [ ] When a user revokes all tokens for an application (via the "authorized applications" management flow), both access tokens and refresh tokens for that application+user pair are deleted.
- [ ] Token revocation is atomic: once the revoke call returns `200`, the token is guaranteed to be deleted.

### Edge Cases

- [ ] **Missing `token` field**: Request body `{}` → `400 Bad Request` with `{ "message": "token is required" }`.
- [ ] **Empty `token` field**: `token: ""` → `400 Bad Request` with `{ "message": "token is required" }`.
- [ ] **Whitespace-only `token` field**: `token: "   "` → `400 Bad Request` with `{ "message": "token is required" }`.
- [ ] **`token` field is `null`**: `token: null` → `400 Bad Request` with `{ "message": "token is required" }`.
- [ ] **Token value is an arbitrary string (not a valid prefix)**: `token: "hello_world"` → `200 OK` (RFC 7009: invalid token is not an error).
- [ ] **Token value is extremely long (> 1024 chars)**: Server rejects with `400 Bad Request` with `{ "message": "token value too long" }`.
- [ ] **Token value contains Unicode or non-ASCII characters**: `200 OK` (hash-and-delete-if-found behavior applies).
- [ ] **Token value contains control characters or null bytes**: Server must not crash; return `200 OK`.
- [ ] **Duplicate revocation requests in rapid succession**: Both return `200 OK`; no race condition.
- [ ] **Revoking an access token does NOT revoke the associated refresh token**: The refresh token for the same grant remains usable unless explicitly revoked.
- [ ] **Revoking a refresh token does NOT revoke the associated access token**: The access token remains usable until its 1-hour TTL expires, unless explicitly revoked.
- [ ] **Non-JSON, non-form body**: Plain text or XML body → `400 Bad Request` with `{ "message": "invalid request body" }`.
- [ ] **Request body is a JSON array instead of object**: `["token_value"]` → `400 Bad Request`.

### Boundary Constraints

- [ ] `token` field: minimum useful length is 78 characters (14-character prefix `codeplane_oat_` + 64 hex characters). However, the server must accept any non-empty string.
- [ ] `token` field: maximum length must be enforced at 1024 characters. Tokens longer than 1024 characters are rejected with `400 Bad Request` with `{ "message": "token value too long" }`.
- [ ] Access token format when valid: `/^codeplane_oat_[0-9a-f]{64}$/` (78 characters total).
- [ ] Refresh token format when valid: `/^codeplane_ort_[0-9a-f]{64}$/` (78 characters total).
- [ ] The server must not impose a minimum length on the `token` field beyond non-empty (RFC 7009 does not restrict token format).
- [ ] Rate limiting: standard mutation rate limit applies per IP.

## Design

### API Shape

**Endpoint**: `POST /api/oauth2/revoke`

**Authentication**: None required. RFC 7009 specifies that any party possessing a token value may revoke it. The endpoint does not inspect session cookies or `Authorization` headers for the purpose of authorizing the revocation itself.

**Content-Type**: `application/json` or `application/x-www-form-urlencoded`.

#### Request (JSON)

```json
{
  "token": "codeplane_oat_64hexchars..."
}
```

#### Request (Form-encoded)

```
token=codeplane_oat_64hexchars...
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | The access token (`codeplane_oat_...`) or refresh token (`codeplane_ort_...`) to revoke. Any non-empty string is accepted; unknown tokens result in a successful no-op. |

#### Success Response (`200 OK`)

Empty body. Per RFC 7009, the server always returns `200` for a well-formed revocation request, regardless of whether the token existed, was already revoked, or had expired.

#### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Missing, empty, or whitespace-only `token` | `{ "message": "token is required" }` |
| `400` | Invalid request body (non-JSON, non-form, malformed) | `{ "message": "invalid request body" }` |
| `400` | Token value exceeds 1024 characters | `{ "message": "token value too long" }` |
| `429` | Rate limit exceeded | Standard rate-limit response |

### SDK Shape

The `OAuth2Service` in `@codeplane/sdk` provides the following methods relevant to token revocation:

**`revokeToken(token: string)`** → `Promise<void>`

- Computes the SHA-256 hash of the provided token value.
- Attempts to delete a matching row from `oauth2_access_tokens` by token hash.
- If no access token was found, attempts to delete from `oauth2_refresh_tokens` by token hash.
- Never throws for token-not-found (RFC 7009 semantics).
- Only throws for unexpected system errors (database connectivity).

**`revokeAllTokensForAppAndUser(appID: string, userID: string)`** → `Promise<void>`

- Deletes all rows in `oauth2_access_tokens` matching `(app_id, user_id)`.
- Deletes all rows in `oauth2_refresh_tokens` matching `(app_id, user_id)`.
- Used by the "Revoke Access" flow in the web UI where the user revokes an entire application's access.
- Also called internally when an OAuth2 application is deleted.

**`listAccessTokensByUser(userID: string)`** → `Promise<OAuth2AccessTokenListItem[]>`

- Returns all non-expired access tokens for the user, joined with the application name and client ID.
- Used to populate the "Authorized Applications" settings view.

```typescript
interface OAuth2AccessTokenListItem {
  id: string;
  appId: string;
  appName: string;
  appClientId: string;
  scopes: string[];
  expiresAt: Date;
  createdAt: Date;
}
```

### Web UI Design

#### Settings > Authorized Applications

**Route**: `/settings/authorized-apps`

**Purpose**: Show the user which third-party OAuth2 applications currently hold active tokens for their account, and allow them to revoke access.

**Layout**:

- **Page title**: "Authorized Applications"
- **Description text**: "These applications have been granted access to your Codeplane account. Revoking an application removes all of its access tokens and refresh tokens immediately."

**Table columns**:

| Column | Description |
|--------|-------------|
| Application Name | Name of the OAuth2 application. Not clickable (the user is not the application owner). |
| Scopes | Badges showing the granted scopes (e.g., `read:repository`, `read:user`). If more than 3 scopes, show 3 + "+N more" with a tooltip listing all scopes. |
| Authorized | Relative timestamp (e.g., "3 days ago") with ISO 8601 tooltip showing when the token was first created. |
| Actions | "Revoke" button (destructive style, red text or outline). |

**Empty state**: "No applications have been authorized to access your account." No CTA button.

**Revocation flow**:

1. User clicks "Revoke" on an application row.
2. A confirmation dialog appears with title "Revoke access for [Application Name]?", warning text, "Cancel" and "Revoke Access" buttons.
3. On confirmation, the UI calls the API to delete all tokens for that application+user pair.
4. The row is removed from the table with a success toast: "Access revoked for [Application Name]."
5. If the API call fails, the dialog shows an inline error and does NOT close.

**Responsive behavior**: On mobile, the Scopes column is hidden. Application Name and Revoke action remain visible.

### CLI Command

Token revocation is accessible via the generic `api` subcommand:

```bash
# Revoke an access token
codeplane api /api/oauth2/revoke --method POST \
  -f "token=codeplane_oat_64hexchars..."

# Revoke a refresh token
codeplane api /api/oauth2/revoke --method POST \
  -f "token=codeplane_ort_64hexchars..."
```

No dedicated `codeplane oauth revoke` subcommand is needed because token revocation is primarily a machine-to-machine operation. Application developers use the raw API endpoint; end users use the web UI "Authorized Applications" page.

### Documentation

The following documentation must be written or updated:

1. **OAuth2 Developer Guide** (`docs/guides/oauth2-applications.mdx`): Add or expand a "Token Revocation" section explaining why and when to revoke tokens, the `POST /api/oauth2/revoke` endpoint with request/response examples for both JSON and form-encoded content types, idempotency guarantees, and the best practice of revoking the refresh token first then the access token.

2. **API Reference** (`docs/api/oauth2.mdx`): Document `POST /api/oauth2/revoke` with field descriptions, error codes, and curl/fetch examples.

3. **Settings Guide** (`docs/settings/authorized-applications.mdx`): Document the "Authorized Applications" settings page, what revoking an application does, and that re-authorization requires the OAuth2 consent flow.

## Permissions & Security

### Authorization Roles

| Actor | Can revoke via `POST /api/oauth2/revoke`? | Can revoke via Web UI "Authorized Apps"? | Can revoke via application deletion cascade? |
|-------|-------------------------------------------|------------------------------------------|----------------------------------------------|
| Any token holder (no session required) | Yes — possessing the raw token value is sufficient | No — requires authenticated session | No |
| Authenticated user (Owner of account) | Yes | Yes — can revoke any application's tokens on their own account | No (unless they own the OAuth2 app) |
| OAuth2 application owner | Yes (if they possess the token) | No — cannot revoke tokens on other users' accounts | Yes — deleting their OAuth2 application revokes all tokens for all users |
| Admin | Yes (if they possess the token) | Yes (for their own account only) | Yes — admin application deletion cascades |
| Anonymous / unauthenticated | Yes (if they possess the token via `POST /api/oauth2/revoke`) | No — settings require authentication | No |

### Key Security Properties

- **No authentication required for the revoke endpoint**: This is intentional and per RFC 7009. The security property is that possessing the raw token value is itself proof of authorization to revoke it.
- **Token values are never stored in plaintext**: Only SHA-256 hashes are persisted. Revocation works by hashing the provided token and deleting the matching hash row.
- **No information leakage**: The revocation endpoint does not reveal whether a token existed, was already revoked, or never existed. It always returns `200 OK`.
- **Immediate effect**: Revocation deletes the database row synchronously. There is no cache layer that would allow a revoked token to remain valid for any period.

### Rate Limiting

- The standard global mutation rate limit applies to `POST /api/oauth2/revoke`.
- No additional per-endpoint rate limit is required because revocation is non-destructive, idempotent, and reveals no information about token existence.
- The "Authorized Applications" web UI page listing tokens should apply the standard authenticated read rate limit.

### Data Privacy and PII

- Raw token values (`codeplane_oat_...`, `codeplane_ort_...`) must NEVER appear in server logs, application logs, error messages, or telemetry payloads.
- The `token` field in the request body must be redacted or omitted from any request logging middleware. If request bodies are logged, the `token` field must be replaced with `"[REDACTED]"`.
- The "Authorized Applications" web UI page shows the application name, scopes, and creation timestamp. It does NOT show the token value or token hash.
- Token hashes are implementation details and must never be exposed in any API response or UI surface.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `OAuth2TokenRevoked` | `token_type` (`access` or `refresh`), `revocation_source` (`api_endpoint`, `web_ui_app_revoke`, `app_deletion_cascade`), `timestamp` | On successful revocation where a token was actually found and deleted |
| `OAuth2TokenRevocationAttempted` | `token_found` (boolean), `token_type` (`access`, `refresh`, or `unknown` if not found), `content_type` (`json` or `form`), `timestamp` | On every well-formed revocation request, regardless of outcome |
| `OAuth2AuthorizedAppRevoked` | `app_id`, `app_name`, `user_id`, `access_tokens_revoked` (count), `refresh_tokens_revoked` (count), `timestamp` | When a user revokes all tokens for an application via the web UI |
| `OAuth2TokenRevocationFailed` | `error_type` (`missing_token`, `invalid_body`, `token_too_long`, `system_error`), `timestamp` | On any revocation request that returns a non-200 response |

### Funnel Metrics

- **Revocation rate**: Number of token revocations per day, segmented by `token_type` and `revocation_source`. A healthy system should have a steady low rate of user-initiated revocations with occasional spikes during security incidents.
- **Authorized app revocation rate**: Number of users revoking third-party app access per week via the web UI. Indicates user awareness and engagement with security controls.
- **Time-to-revoke after incident**: When a security advisory is published for a third-party application, measure the time from advisory to revocation spike.
- **Authorized apps per user**: Average number of applications with active tokens per user. Growth indicates ecosystem health.
- **Revocation-to-reauthorization ratio**: Of users who revoke an application, what percentage re-authorize it within 7 days? A high ratio suggests accidental revocations.

### Success Indicators

- The revocation endpoint has 100% availability (should never return 500).
- User-initiated revocations from the web UI complete in under 500ms (P95).
- API-initiated revocations complete in under 100ms (P95).
- Zero instances of revoked tokens remaining valid after revocation.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| Token revocation request received | `info` | `content_type`, `has_token` (boolean), `request_id` |
| Token revoked (access token found) | `info` | `token_type: "access"`, `request_id` |
| Token revoked (refresh token found) | `info` | `token_type: "refresh"`, `request_id` |
| Token revocation no-op (token not found) | `debug` | `request_id` |
| Token revocation request rejected (missing token) | `warn` | `error: "token_required"`, `content_type`, `request_id` |
| Token revocation request rejected (invalid body) | `warn` | `error: "invalid_body"`, `content_type`, `request_id` |
| Token revocation request rejected (token too long) | `warn` | `error: "token_too_long"`, `token_length` (integer), `request_id` |
| Token revocation database error | `error` | `error_message`, `stack_trace`, `request_id` |
| Authorized app revocation (all tokens) | `info` | `app_id`, `user_id`, `access_tokens_deleted` (count), `refresh_tokens_deleted` (count), `request_id` |
| Authorized app revocation failed | `error` | `app_id`, `user_id`, `error_message`, `stack_trace`, `request_id` |

**Critical Logging Rules**:
- The raw `token` value must NEVER appear in any log at any level.
- Token hashes must not appear in info-level logs.
- The `request_id` must be included in all log entries for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_oauth2_tokens_revoked_total` | Counter | `token_type` (`access`, `refresh`, `not_found`) | Total token revocation attempts by outcome |
| `codeplane_oauth2_token_revocation_duration_seconds` | Histogram | `token_type` | Latency of token revocation (request to response) |
| `codeplane_oauth2_token_revocation_errors_total` | Counter | `error_type` (`missing_token`, `invalid_body`, `token_too_long`, `system`) | Total revocation request errors |
| `codeplane_oauth2_authorized_app_revocations_total` | Counter | | Total user-initiated application-level revocations |
| `codeplane_oauth2_active_access_tokens` | Gauge | | Current count of non-expired access tokens |
| `codeplane_oauth2_active_refresh_tokens` | Gauge | | Current count of non-expired refresh tokens |

### Alerts

#### Alert: `OAuth2TokenRevocationSystemErrorRate`

**Condition**: `rate(codeplane_oauth2_token_revocation_errors_total{error_type="system"}[5m]) > 0`

**Severity**: Critical

**Runbook**:
1. Token revocation should never fail with a system error under normal conditions. Any system error indicates a database connectivity or integrity issue.
2. Check database health: connection pool status, replication lag, disk space, and recent failover events.
3. Check the server error logs for `oauth2` context entries at `error` level in the last 15 minutes. Look for `token_revocation_database_error` entries.
4. Verify that the `oauth2_access_tokens` and `oauth2_refresh_tokens` tables are accessible and not locked.
5. If the database is healthy, check for recent code deployments affecting the `revokeToken` code path.
6. If the issue is persistent, consider failing open (returning `200` even if the database delete fails) to maintain RFC 7009 compliance — but log an alert for manual cleanup.
7. If database-related, follow the standard database recovery runbook.

#### Alert: `OAuth2TokenRevocationLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_oauth2_token_revocation_duration_seconds_bucket[5m])) > 0.5`

**Severity**: Warning

**Runbook**:
1. Token revocation performs at most 2 database DELETE operations. This should complete in under 50ms under normal load.
2. Check if the `oauth2_access_tokens` or `oauth2_refresh_tokens` tables have grown excessively large. Verify the cleanup scheduler is running.
3. Check for lock contention or long-running transactions on these tables.
4. Check database connection pool utilization.
5. If latency is isolated to a single server instance, restart it.
6. Verify indexes on `token_hash` columns exist.

#### Alert: `OAuth2RevocationRequestSpike`

**Condition**: `rate(codeplane_oauth2_tokens_revoked_total[5m]) > 10 * avg_over_time(rate(codeplane_oauth2_tokens_revoked_total[1h])[24h:1h])`

**Severity**: Warning

**Runbook**:
1. A sudden 10x spike in revocation requests may indicate a security incident where tokens have been compromised.
2. Check whether the spike is user-initiated (web UI) or API-driven (programmatic). Check `revocation_source` in telemetry.
3. If user-initiated, check for published security advisories about third-party applications.
4. If API-driven from a single source IP, verify it is legitimate cleanup rather than an attack.
5. No immediate action required unless accompanied by other anomalies. Document the spike for post-mortem.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Predictability | Recovery |
|------------|-------------|----------------|----------|
| Missing or empty `token` field | 400 | Predictable | Provide a non-empty `token` value |
| Invalid request body (malformed JSON/form) | 400 | Predictable | Fix the request body encoding |
| Token value exceeds 1024 characters | 400 | Predictable | Provide a valid token value (78 chars for access/refresh) |
| Token not found (unknown/expired/already revoked) | 200 | Predictable | No action needed — revocation is idempotent |
| Database unavailable during revocation | 500 | Unpredictable | Retry with exponential backoff; if persistent, escalate |
| Database write timeout | 500 | Unpredictable | Retry once; if still failing, escalate |
| Cleanup scheduler not running (expired tokens accumulate) | N/A (operational) | Detectable | Restart cleanup scheduler; manually run expired token deletion |

## Verification

### API Integration Tests — Token Revocation Core

- [ ] **Revoke valid access token**: Create an OAuth2 app, authorize a user, exchange code for tokens, call `POST /api/oauth2/revoke` with the `access_token` → `200 OK` with empty body. Then call `GET /api/repos` with the revoked access token in `Authorization: Bearer` → `401 Unauthorized`.
- [ ] **Revoke valid refresh token**: Exchange code for tokens, call `POST /api/oauth2/revoke` with the `refresh_token` → `200 OK`. Then attempt `POST /api/oauth2/token` with `grant_type=refresh_token` using the revoked refresh token → `400 Bad Request` with `"invalid or expired refresh token"`.
- [ ] **Revoke access token does NOT invalidate paired refresh token**: Exchange tokens, revoke the access token, then use the refresh token to get a new token pair → refresh succeeds with `200 OK`.
- [ ] **Revoke refresh token does NOT invalidate paired access token**: Exchange tokens, revoke the refresh token, then use the access token for an API call → `200 OK` (access token still valid until expiry).
- [ ] **Revoke already-revoked access token (idempotent)**: Revoke an access token, then revoke the same token again → both return `200 OK`.
- [ ] **Revoke already-revoked refresh token (idempotent)**: Revoke a refresh token twice → both return `200 OK`.
- [ ] **Revoke unknown token**: Call `POST /api/oauth2/revoke` with `token: "codeplane_oat_0000000000000000000000000000000000000000000000000000000000000000"` (never issued) → `200 OK`.
- [ ] **Revoke arbitrary non-token string**: `token: "not_a_real_token_at_all"` → `200 OK`.
- [ ] **Revoke empty string token**: `token: ""` → `400 Bad Request` with `{ "message": "token is required" }`.
- [ ] **Revoke whitespace-only token**: `token: "   "` → `400 Bad Request` with `{ "message": "token is required" }`.
- [ ] **Revoke missing token field**: Request body `{}` → `400 Bad Request` with `{ "message": "token is required" }`.
- [ ] **Revoke null token field**: `token: null` → `400 Bad Request` with `{ "message": "token is required" }`.
- [ ] **Revoke with JSON content type**: `Content-Type: application/json` with `{"token": "codeplane_oat_..."}` → `200 OK`.
- [ ] **Revoke with form-encoded content type**: `Content-Type: application/x-www-form-urlencoded` with `token=codeplane_oat_...` → `200 OK`.
- [ ] **Revoke with invalid content type (plain text body)**: `Content-Type: text/plain` → `400 Bad Request` with `{ "message": "invalid request body" }`.
- [ ] **Revoke with no Content-Type header**: Empty body → `400 Bad Request`.

### API Integration Tests — Boundary and Size

- [ ] **Revoke token at maximum valid length (78 chars for access)**: `token: "codeplane_oat_" + 64 hex chars` → `200 OK` (if token exists, it is revoked).
- [ ] **Revoke token at maximum valid length (78 chars for refresh)**: `token: "codeplane_ort_" + 64 hex chars` → `200 OK`.
- [ ] **Revoke token at 1024 characters**: `token: "a".repeat(1024)` → `200 OK` (valid length, token not found, no error per RFC 7009).
- [ ] **Revoke token at 1025 characters (exceeds limit)**: `token: "a".repeat(1025)` → `400 Bad Request` with `{ "message": "token value too long" }`.
- [ ] **Revoke token at 10,000 characters**: `token: "x".repeat(10000)` → `400 Bad Request` with `{ "message": "token value too long" }`.
- [ ] **Revoke token with Unicode characters**: `token: "codeplane_oat_" + "🎉".repeat(16)` → `200 OK` (hash-and-delete, not found).
- [ ] **Revoke token with leading/trailing spaces**: `token: " codeplane_oat_abc... "` → The token (with spaces) is hashed and looked up; not found → `200 OK`.

### API Integration Tests — Concurrent Revocation

- [ ] **Concurrent revocation of the same access token**: Send two parallel `POST /api/oauth2/revoke` requests with the same access token → both return `200 OK`, no database error.
- [ ] **Concurrent revocation of the same refresh token**: Same as above with a refresh token → both return `200 OK`.

### API Integration Tests — Full Revocation Flows

- [ ] **Complete lifecycle: issue → use → revoke → verify rejected**: Create app → authorize user → exchange code → use access token for API call (succeeds) → revoke access token → use access token for API call (fails with 401).
- [ ] **Revoke refresh, then attempt refresh**: Exchange tokens → revoke refresh token → attempt `grant_type=refresh_token` with revoked refresh token → `400`.
- [ ] **Revoke both tokens**: Exchange tokens → revoke access token → revoke refresh token → both API use and refresh fail.
- [ ] **Application deletion cascades token revocation**: Create app → authorize two different users → exchange tokens for both users → delete the OAuth2 application → verify all 4 tokens (2 access + 2 refresh) are invalidated.
- [ ] **Multiple applications, revoke one**: User authorizes App A and App B → revoke App A's access token → App B's access token is unaffected.

### CLI Integration Tests

- [ ] **CLI revoke access token via `api` subcommand**: `codeplane api /api/oauth2/revoke --method POST -f "token=codeplane_oat_..."` → exit code 0, HTTP 200.
- [ ] **CLI revoke refresh token via `api` subcommand**: `codeplane api /api/oauth2/revoke --method POST -f "token=codeplane_ort_..."` → exit code 0, HTTP 200.
- [ ] **CLI revoke with missing token**: `codeplane api /api/oauth2/revoke --method POST` (no `-f` flag) → non-zero exit code or error response body containing `"token is required"`.
- [ ] **CLI revoke with JSON body**: `codeplane api /api/oauth2/revoke --method POST --json '{"token":"codeplane_oat_..."}'` → exit code 0, HTTP 200.

### E2E / Playwright Tests (Web UI)

- [ ] **Authorized Applications page renders**: Navigate to `/settings/authorized-apps` while logged in → page displays "Authorized Applications" heading.
- [ ] **Empty state**: With no authorized applications, page displays "No applications have been authorized to access your account."
- [ ] **Authorized application appears in list**: Complete an OAuth2 authorization flow for a test application → navigate to Authorized Applications → the application name, scopes, and "Authorized" timestamp appear in the table.
- [ ] **Revoke button present**: Each application row has a "Revoke" button.
- [ ] **Revoke confirmation dialog**: Click "Revoke" → a confirmation dialog appears with the application name, warning text, "Cancel" and "Revoke Access" buttons.
- [ ] **Cancel revocation**: Click "Cancel" → dialog closes, application remains in list, tokens remain valid.
- [ ] **Confirm revocation**: Click "Revoke Access" → application removed from table, success toast appears, and the application's tokens are invalidated.
- [ ] **Multiple applications**: Authorize two applications, revoke one → only the revoked application is removed.
- [ ] **Revoke loading state**: Click "Revoke Access" → button shows loading spinner until API response.
- [ ] **Revoke error handling**: If API call fails, dialog shows inline error and does NOT close.
- [ ] **Page requires authentication**: Navigate to `/settings/authorized-apps` while not logged in → redirected to login page.

### SDK Service Tests

- [ ] **`revokeToken` deletes access token by hash**: Call `revokeToken` with a valid access token → token hash is deleted from `oauth2_access_tokens`.
- [ ] **`revokeToken` deletes refresh token by hash**: Call `revokeToken` with a valid refresh token → token hash is deleted from `oauth2_refresh_tokens`.
- [ ] **`revokeToken` no-op for unknown token**: Call `revokeToken` with a random string → no error thrown, no rows deleted.
- [ ] **`revokeToken` tries access first, then refresh**: Given a refresh token, `revokeToken` first attempts to delete from access tokens (no match), then successfully deletes from refresh tokens.
- [ ] **`revokeAllTokensForAppAndUser` deletes all tokens**: Create multiple access and refresh tokens for an app+user → call `revokeAllTokensForAppAndUser` → all are deleted.
- [ ] **`revokeAllTokensForAppAndUser` does not affect other users**: Create tokens for user A and user B for the same app → revoke for user A → user B's tokens remain.
- [ ] **`listAccessTokensByUser` returns active tokens with app info**: Create tokens for a user → call `listAccessTokensByUser` → returns token list with `appName`, `appClientId`, `scopes`, `expiresAt`, `createdAt`.
- [ ] **`listAccessTokensByUser` excludes expired tokens**: Create a token, wait for expiry or mock clock → call `listAccessTokensByUser` → expired token not in results.

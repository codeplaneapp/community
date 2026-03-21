# AUTH_KEY_AUTH_NONCE_ISSUANCE

Specification for AUTH_KEY_AUTH_NONCE_ISSUANCE.

## High-Level User POV

When a user wants to sign in to Codeplane using a cryptographic key rather than a traditional username and password or OAuth provider, the very first step is obtaining a fresh, one-time-use challenge nonce from the server. This nonce is the foundation of the entire key-based authentication flow — it proves that the sign-in attempt is happening right now, not being replayed from an earlier session.

From the user's perspective, this step is seamless and invisible. Whether signing in through the web application's "Sign in with Key" button or through a programmatic client, the application silently requests a nonce behind the scenes before prompting the user to sign the challenge message with their wallet. The user never sees or manually handles the nonce value. They simply initiate the sign-in flow and, within moments, the application has a fresh nonce embedded into a structured message ready for the user's cryptographic signature.

The nonce issuance step guarantees that each sign-in attempt is unique and time-limited. If a user starts the sign-in flow but abandons it, the nonce automatically expires after a short window. If someone intercepts a signed message, they cannot replay it because the nonce can only be consumed once. This gives users confidence that key-based authentication is safe against replay attacks and that abandoned sign-in attempts don't leave exploitable state on the server.

For teams and individuals who prefer wallet-based identity over OAuth provider lock-in, this capability is the entry gate to the entire key-based authentication experience — from first sign-in, through automatic account creation, to ongoing session management.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- A client can request a fresh cryptographic nonce from the Codeplane API without any authentication.
- The nonce is cryptographically random, unique, and stored server-side with a bounded time-to-live.
- The nonce can be consumed exactly once during signature verification.
- Expired and consumed nonces are automatically cleaned up.
- The endpoint is protected by rate limiting to prevent abuse.
- All clients (web, CLI agent flows, SDK) can successfully obtain nonces as part of the key-auth flow.

### Functional Constraints

- [ ] The `GET /api/auth/key/nonce` endpoint MUST be accessible without authentication (unauthenticated users are the primary consumers — they are trying to sign in).
- [ ] Each request MUST return a unique nonce value.
- [ ] The nonce MUST be a cryptographically secure random hex string of exactly 32 characters (16 bytes encoded as hex).
- [ ] The nonce MUST be persisted server-side with an expiration timestamp set to exactly 10 minutes from creation.
- [ ] The response MUST be a JSON object with a single `nonce` field containing the nonce string.
- [ ] The HTTP status code MUST be `200` on success.
- [ ] If nonce creation fails due to a server-side error, the endpoint MUST return a `500` status code with a structured error payload.
- [ ] A nonce MUST NOT be consumable after its expiration timestamp has passed.
- [ ] A nonce MUST NOT be consumable more than once (single-use enforcement).
- [ ] Expired nonces MUST be automatically deleted by the background cleanup scheduler.

### Edge Cases

- [ ] Concurrent requests MUST each receive a distinct nonce — no two requests may return the same value.
- [ ] If the database is unreachable, the endpoint MUST return `500` rather than hanging or returning a partial response.
- [ ] If the random number generator fails, the endpoint MUST return `500`.
- [ ] Extremely rapid sequential requests (e.g., hundreds per second from one IP) MUST be subject to rate limiting and return `429` when the limit is exceeded.
- [ ] The endpoint MUST NOT accept any request body; `GET` requests with unexpected bodies MUST be ignored (bodies are not parsed).
- [ ] The endpoint MUST NOT accept `POST`, `PUT`, `DELETE`, or other HTTP methods — only `GET`. Non-`GET` methods MUST return `405`.
- [ ] A nonce that has been issued but never consumed MUST expire and be cleaned up without any manual intervention.
- [ ] The endpoint MUST function identically in server mode, daemon mode, and desktop-embedded daemon mode.

### Boundary Constraints

- [ ] Nonce value: exactly 32 hexadecimal characters (`[0-9a-f]{32}`).
- [ ] Nonce TTL: exactly 600 seconds (10 minutes).
- [ ] Maximum nonce storage: the system must tolerate at least 100,000 outstanding nonces without degradation (cleanup prevents unbounded growth).
- [ ] Response payload size: the JSON response `{"nonce":"<32chars>"}` is under 50 bytes — no pagination or streaming needed.

## Design

### API Shape

#### `GET /api/auth/key/nonce`

**Purpose:** Issue a fresh, single-use cryptographic nonce for key-based authentication challenge construction.

**Authentication:** None required.

**Request:** No query parameters, no request body.

**Success Response:**

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "nonce": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `429` | Rate limit exceeded | `{"error": "rate limit exceeded"}` |
| `500` | Internal server error (DB failure, RNG failure) | `{"error": "failed to create auth nonce"}` |
| `405` | Wrong HTTP method | `{"error": "method not allowed"}` |

**Headers:**
- `X-Request-Id` — present on all responses (set by request ID middleware).
- Standard CORS headers are applied by middleware.

### SDK Shape

The `AuthService` interface exposes nonce creation through:

```typescript
interface AuthService {
  createKeyAuthNonce(): Promise<string>;
}
```

**Behavior:**
- Generates a 16-byte cryptographically random value and hex-encodes it to produce a 32-character string.
- Inserts the nonce into the persistence layer with a 10-minute expiration.
- Returns the nonce string on success.
- Throws an internal error if the insert fails.

### Web UI Design

The nonce issuance step is **invisible to the user** in the web UI. When the user clicks "Sign in with Key" (or an equivalent entry point in the login view), the web application:

1. Calls `GET /api/auth/key/nonce` in the background.
2. Constructs an EIP-4361 structured message embedding the received nonce and the configured domain.
3. Prompts the user to sign the message with their wallet.

No loading spinner or nonce display is shown to the user. If the nonce request fails, the UI should display a generic "Sign-in is temporarily unavailable. Please try again." message without exposing the nonce value or internal error details.

### CLI Design

The CLI does not directly invoke the nonce endpoint in isolation. The nonce is requested as part of the broader key-auth sign-in flow (which is primarily browser-driven). The CLI's interaction with key-auth is through the token exchange endpoint (`POST /api/auth/key/token`), which consumes a nonce internally. No standalone `codeplane auth nonce` command is needed or exposed.

### Documentation

The following end-user documentation should exist:

- **Authentication Guide — Key-Based Sign-In:** A section explaining that Codeplane supports signing in with a cryptographic key/wallet. The guide should describe the flow at a high level: the server issues a one-time challenge, the user signs it with their key, and the server verifies the signature to create a session. The guide should note that nonces expire after 10 minutes and that each nonce can only be used once.
- **API Reference — `GET /api/auth/key/nonce`:** Document the endpoint, its response shape, and error codes. Note that no authentication is required.
- **Security FAQ entry:** "Why does Codeplane use nonces for key-based sign-in?" — Explain replay attack prevention and the 10-minute expiration window in user-friendly terms.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| Anonymous / Unauthenticated | ✅ Allowed — this is the primary consumer (user is trying to sign in) |
| Authenticated User | ✅ Allowed — though unnecessary (user is already signed in) |
| Admin | ✅ Allowed |
| Read-Only | ✅ Allowed |

The nonce endpoint is intentionally open to all callers because its purpose is to initiate authentication for users who do not yet have a session.

### Rate Limiting

- **Per-IP rate limit:** Maximum 30 requests per minute per source IP address. This allows normal sign-in flows (which require exactly one nonce per attempt) while blocking automated abuse.
- **Global rate limit:** Maximum 600 nonce issuances per minute across all IPs. This prevents a distributed attack from overwhelming the nonce storage.
- **429 response:** When rate limits are exceeded, return `429 Too Many Requests` with a `Retry-After` header indicating when the client may retry.

### Data Privacy

- The nonce value itself is not PII. It is a random hex string with no user-identifying information.
- The `auth_nonces` table does not contain any PII at creation time. The `wallet_address` field is populated only when the nonce is consumed during signature verification (which is a separate feature).
- Nonce values MUST NOT appear in server access logs. Request IDs may be logged, but the nonce response body should not be logged at `INFO` level.
- Expired nonces are hard-deleted (not soft-deleted) by the cleanup scheduler, ensuring no long-term data retention.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `KeyAuthNonceIssued` | Nonce successfully created and returned | `nonce_id` (first 8 chars only, for correlation), `timestamp`, `client_type` (web/cli/api), `ip_country` (if GeoIP available) |
| `KeyAuthNonceIssuanceFailed` | Nonce creation failed (500 error) | `error_category` (db_error, rng_error, unknown), `timestamp` |
| `KeyAuthNonceRateLimited` | Request was rejected by rate limiter | `source_ip_hash` (hashed, not raw IP), `timestamp`, `rate_limit_type` (per_ip, global) |

### Funnel Metrics

| Metric | Definition | Healthy Signal |
|--------|------------|----------------|
| Nonce-to-Verification Conversion Rate | % of issued nonces that are subsequently consumed by a successful `verifyKeyAuth` call | > 50% (many legitimate users complete the flow) |
| Nonce Expiration Rate | % of issued nonces that expire without being consumed | < 60% (some abandonment is normal, but high rates may indicate UX friction) |
| Nonce Issuance Volume | Total nonces issued per hour | Tracks adoption of key-based auth; should trend upward as key-auth gains adoption |
| Mean Time to Consumption | Average elapsed time between nonce issuance and consumption | < 60 seconds for healthy interactive flows |

### Success Indicators

- Key-based authentication adoption (measured as % of total sign-ins using key auth) increases quarter over quarter.
- Nonce-to-verification conversion rate remains above 50%.
- Zero successful replay attacks (nonces consumed more than once) in production.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Nonce issued successfully | `DEBUG` | `request_id`, `nonce_prefix` (first 8 chars), `expires_at` | Every successful nonce creation |
| Nonce creation failed | `ERROR` | `request_id`, `error_message`, `error_type` | DB insert failure or RNG failure |
| Rate limit triggered | `WARN` | `request_id`, `source_ip_hash`, `limit_type`, `retry_after_seconds` | Rate limit hit on nonce endpoint |
| Expired nonces cleaned up | `INFO` | `deleted_count`, `sweep_duration_ms` | Each cleanup sweep that deletes nonces |
| Cleanup sweep failed | `ERROR` | `error_message`, `job_name` ("auth nonces") | Cleanup job error |

**Rules:**
- NEVER log the full nonce value at any log level.
- Log the nonce prefix (first 8 characters) at `DEBUG` level only, for correlation during incident investigation.
- Use structured JSON logging with consistent field names.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_auth_nonce_issued_total` | Counter | `status` (success, error) | Total nonce issuance attempts |
| `codeplane_auth_nonce_issuance_duration_seconds` | Histogram | — | Time to generate and persist a nonce (buckets: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0) |
| `codeplane_auth_nonce_rate_limited_total` | Counter | `limit_type` (per_ip, global) | Total rate-limited nonce requests |
| `codeplane_auth_nonces_outstanding` | Gauge | — | Current count of unconsumed, unexpired nonces |
| `codeplane_auth_nonce_cleanup_deleted_total` | Counter | — | Total nonces deleted by cleanup sweeps |
| `codeplane_auth_nonce_cleanup_errors_total` | Counter | — | Total cleanup sweep failures |

### Alerts

#### Alert: `KeyAuthNonceIssuanceErrorRateHigh`

**Condition:** `rate(codeplane_auth_nonce_issued_total{status="error"}[5m]) / rate(codeplane_auth_nonce_issued_total[5m]) > 0.05` for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check the server logs for `nonce creation failed` entries — look at the `error_type` field.
2. If `error_type` is `db_error`: check database connectivity (`pg_isready` or equivalent), check for table locks on `auth_nonces`, check disk space on the database server.
3. If `error_type` is `rng_error`: this indicates a system-level entropy issue — check `/dev/urandom` availability, check if the Node.js/Bun `crypto` module is functioning. Restart the server process.
4. Check if the error rate correlates with a recent deployment — rollback if necessary.
5. Verify the `auth_nonces` table exists and has the correct schema.

#### Alert: `KeyAuthNonceIssuanceLatencyHigh`

**Condition:** `histogram_quantile(0.99, rate(codeplane_auth_nonce_issuance_duration_seconds_bucket[5m])) > 0.5` for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database query performance — run `EXPLAIN ANALYZE` on the `INSERT INTO auth_nonces` query.
2. Check for table bloat on `auth_nonces` — run `pg_stat_user_tables` to check dead tuple count.
3. Verify the cleanup scheduler is running — if expired nonces are not being deleted, the table may be growing unbounded.
4. Check overall database load — nonce issuance contention may be a symptom of broader database pressure.

#### Alert: `KeyAuthNonceOutstandingCountHigh`

**Condition:** `codeplane_auth_nonces_outstanding > 50000` for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Check if the cleanup scheduler is running — look for recent `sweepExpiredTokens` log entries.
2. If the cleanup is not running, check the server bootstrap logs for scheduler initialization errors.
3. If the cleanup is running but nonces are still accumulating, check if the nonce TTL is being respected — verify the `expires_at` values in the `auth_nonces` table.
4. Check for a potential nonce issuance DDoS — look at `codeplane_auth_nonce_rate_limited_total` to see if rate limiting is engaged.
5. As a remediation, manually run `DELETE FROM auth_nonces WHERE expires_at < NOW()` and investigate why the scheduler is not performing this cleanup.

#### Alert: `KeyAuthNonceCleanupFailing`

**Condition:** `increase(codeplane_auth_nonce_cleanup_errors_total[1h]) > 3`.

**Severity:** Warning

**Runbook:**
1. Check server logs for cleanup sweep errors with `job_name: "auth nonces"`.
2. Verify database connectivity and permissions.
3. Check for long-running transactions that may be blocking the `DELETE` query.
4. If the cleanup job is consistently failing, restart the server process to reinitialize the cleanup scheduler.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Database unreachable | 500 | Returns `{"error": "failed to create auth nonce"}` | Automatic retry by client; DB reconnection by connection pool |
| RNG failure | 500 | Returns `{"error": "failed to create auth nonce"}` | Server restart to reinitialize crypto subsystem |
| Per-IP rate limit | 429 | Returns rate limit error with `Retry-After` header | Client waits and retries |
| Global rate limit | 429 | Returns rate limit error with `Retry-After` header | Client waits; operator investigates potential DDoS |
| Table does not exist | 500 | Returns `{"error": "failed to create auth nonce"}` | Run database migrations |
| Unique constraint violation on nonce | 500 (extremely unlikely with 16 bytes of randomness) | Returns error | Automatic retry generates a new random value |

## Verification

### API Integration Tests

- [ ] **Happy path — nonce issuance returns 200 with valid nonce:** Send `GET /api/auth/key/nonce` and assert: status is `200`, response body has a `nonce` field, nonce is a 32-character lowercase hex string matching `^[0-9a-f]{32}$`.
- [ ] **Nonce uniqueness — two sequential requests return different nonces:** Issue two `GET /api/auth/key/nonce` requests and assert the returned nonce values are not equal.
- [ ] **Nonce uniqueness — 100 concurrent requests all return distinct nonces:** Issue 100 parallel `GET /api/auth/key/nonce` requests, collect all nonce values, and assert the set has exactly 100 unique entries.
- [ ] **Response content type is JSON:** Assert the `Content-Type` header is `application/json` or `application/json; charset=utf-8`.
- [ ] **Response includes request ID:** Assert the `X-Request-Id` header is present and non-empty.
- [ ] **POST method returns 404 or 405:** Send `POST /api/auth/key/nonce` with an empty body and assert the status is `404` or `405`.
- [ ] **PUT method returns 404 or 405:** Send `PUT /api/auth/key/nonce` and assert the status is `404` or `405`.
- [ ] **DELETE method returns 404 or 405:** Send `DELETE /api/auth/key/nonce` and assert the status is `404` or `405`.
- [ ] **No authentication required:** Send the request without any `Authorization` header or session cookie and assert `200`.
- [ ] **Nonce works with authentication present:** Send the request with a valid PAT in the `Authorization` header and assert `200` (the endpoint should not reject authenticated users).
- [ ] **Response body has no extraneous fields:** Parse the response JSON and assert it has exactly one key: `nonce`.
- [ ] **Nonce value length is exactly 32:** Assert `response.nonce.length === 32`.
- [ ] **Nonce value contains only valid hex characters:** Assert `response.nonce` matches `^[0-9a-f]+$`.
- [ ] **CORS headers are present:** Assert `Access-Control-Allow-Origin` is present on the response.
- [ ] **Rate limiting — exceeding per-IP limit returns 429:** Send more than 30 requests per minute from the same IP and assert that subsequent requests receive `429`.
- [ ] **Rate limiting — 429 response includes Retry-After header:** When a `429` is returned, assert the `Retry-After` header is present and contains a positive integer.

### Nonce Lifecycle Integration Tests

- [ ] **Issued nonce can be consumed by verify endpoint:** Request a nonce, construct a valid signed message containing it, submit to `POST /api/auth/key/verify`, and assert the verification succeeds.
- [ ] **Issued nonce can be consumed by token endpoint:** Request a nonce, construct a valid signed message containing it, submit to `POST /api/auth/key/token`, and assert the token exchange succeeds.
- [ ] **Consumed nonce cannot be reused:** Request a nonce, consume it via `POST /api/auth/key/verify`, then attempt to consume the same nonce again and assert the second attempt fails with `401`.
- [ ] **Expired nonce is rejected:** Request a nonce, wait for it to expire (or manipulate the `expires_at` timestamp in a test fixture), then attempt to consume it and assert failure with `401`.
- [ ] **Nonce from a different server instance is valid (shared DB):** In a multi-instance test setup, request a nonce from instance A and consume it on instance B — assert success (nonces are stored in the shared database, not in-memory).

### Cleanup Integration Tests

- [ ] **Expired nonces are deleted by cleanup sweep:** Create a nonce with a past `expires_at`, trigger the cleanup sweep, and assert the nonce row has been deleted from the database.
- [ ] **Non-expired nonces survive cleanup sweep:** Create a nonce with a future `expires_at`, trigger the cleanup sweep, and assert the nonce row still exists.
- [ ] **Consumed but non-expired nonces survive cleanup:** Create and consume a nonce (which sets `used_at`), trigger cleanup before expiry, and assert the row still exists (cleanup is based on `expires_at`, not `used_at`).

### End-to-End Tests (Playwright)

- [ ] **Web login flow — key-auth button triggers nonce request:** Navigate to the login page, click "Sign in with Key", and assert (via network interception) that a `GET /api/auth/key/nonce` request was made and received a `200` response.
- [ ] **Web login flow — failed nonce request shows error:** Mock the nonce endpoint to return `500`, click "Sign in with Key", and assert an error message is displayed to the user (e.g., "Sign-in is temporarily unavailable").
- [ ] **Web login flow — nonce request timeout shows error:** Mock the nonce endpoint with a long delay, click "Sign in with Key", and assert a timeout or loading state is handled gracefully.

### CLI End-to-End Tests

- [ ] **CLI auth status with valid key-auth-issued token succeeds:** After a full key-auth flow, run `codeplane auth status` and assert exit code `0` with a valid username in the response.
- [ ] **CLI auth status with expired key-auth token fails:** Use a token from a key-auth session that has expired and assert `codeplane auth status` returns a non-zero exit code.

### Load and Boundary Tests

- [ ] **100 concurrent nonce requests complete within 2 seconds:** Issue 100 parallel requests and assert all complete within 2 seconds with status `200`.
- [ ] **1000 nonce requests in rapid succession do not cause data corruption:** Issue 1000 sequential requests and verify all returned nonces are valid 32-char hex strings and all are unique.
- [ ] **Nonce endpoint handles maximum valid request (no body, no query params):** Send a `GET /api/auth/key/nonce` with no body, no query parameters, and minimal headers — assert `200`.
- [ ] **Nonce endpoint rejects oversized headers gracefully:** Send a request with a 64KB custom header and assert the server responds with `431` (Request Header Fields Too Large) or `400` rather than crashing.
- [ ] **Nonce endpoint with unexpected query parameters still succeeds:** Send `GET /api/auth/key/nonce?foo=bar&baz=qux` and assert `200` (query parameters are ignored).

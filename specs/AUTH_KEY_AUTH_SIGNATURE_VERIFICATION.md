# AUTH_KEY_AUTH_SIGNATURE_VERIFICATION

Specification for AUTH_KEY_AUTH_SIGNATURE_VERIFICATION.

## High-Level User POV

When you sign in to Codeplane using "Sign in with Key," the final and most critical step of the process is signature verification. After your client has obtained a one-time nonce from Codeplane and you have signed a structured message with your private key, Codeplane must verify that your signature is cryptographically valid, that the nonce has not been used before, and that the nonce has not expired. This verification step is what actually proves you are who you claim to be.

From your perspective as a user, the experience is seamless. You initiate a sign-in — either from the web login page, the CLI (`codeplane auth login --key`), or programmatically as an AI agent — and behind the scenes your client constructs a message, signs it, and submits it to Codeplane. If everything checks out, you are immediately signed in and can begin working. If the signature is invalid, the nonce has expired, or the nonce has already been consumed, you receive a clear, actionable error explaining what went wrong.

This feature is especially valuable for AI agents and automated systems. Unlike browser-based OAuth, key-based authentication requires no human interaction or redirect flow. An agent holding a cryptographic keypair can authenticate itself entirely programmatically, making it the recommended authentication method for non-human participants in the Codeplane ecosystem.

For new users authenticating with a key for the first time, Codeplane automatically creates an account associated with the key's address. If a closed-alpha access control is active, Codeplane checks the key address against the whitelist before allowing account creation. Returning users are matched to their existing account by their key address.

The signature verification endpoint also supports a token-exchange variant: instead of receiving session cookies (suitable for browsers), CLI and agent clients can request an API token directly. This token can then be stored in the local credential store and used for all subsequent API calls without repeating the sign-in flow.

## Acceptance Criteria

### Core Verification Flow

- The server MUST accept a POST request containing a `message` (string) and `signature` (string) and return the authenticated user's identity on success.
- The server MUST cryptographically verify that the signature was produced by the private key corresponding to the address embedded in the message.
- The server MUST validate that the domain in the structured message matches the server's configured `CODEPLANE_AUTH_KEY_AUTH_DOMAIN`.
- The server MUST extract the nonce from the structured message and atomically consume it — marking it as used in a single database operation so that concurrent requests with the same nonce cannot both succeed.
- A nonce that has already been consumed MUST be rejected with a `401 Unauthorized` error.
- A nonce that has expired (older than 10 minutes) MUST be rejected with a `401 Unauthorized` error.
- A nonce that was never issued by the server MUST be rejected with a `401 Unauthorized` error.

### Input Validation

- If the request body is not valid JSON, the server MUST return `400 Bad Request` with message `"invalid request body"`.
- If `message` is missing, empty, or whitespace-only, the server MUST return `400 Bad Request` with message `"message and signature are required"`.
- If `signature` is missing, empty, or whitespace-only, the server MUST return `400 Bad Request` with message `"message and signature are required"`.
- The `message` field MUST be a UTF-8 string. The maximum accepted length is 4096 bytes. Messages exceeding this limit MUST be rejected with `400 Bad Request`.
- The `signature` field MUST be a hex-encoded string (with optional `0x` prefix). The maximum accepted length is 512 bytes. Signatures exceeding this limit MUST be rejected with `400 Bad Request`.
- The `Content-Type` header MUST be `application/json`. Requests with other content types MUST be rejected with `415 Unsupported Media Type`.

### Session and Token Issuance

- **Session path** (`POST /api/auth/key/verify`): On successful verification, the server MUST set an `httpOnly` session cookie (`codeplane_session`) and a non-`httpOnly` CSRF cookie (`__csrf`), and return a JSON body containing the user's `id` and `username`.
- **Token path** (`POST /api/auth/key/token`): On successful verification, the server MUST return a JSON body containing a `token` (prefixed with `codeplane_`) and the user's `username`. The token MUST be hashed (SHA-256) before storage. The full token is returned exactly once.
- Sessions MUST have a configurable expiration (default 720 hours / 30 days).
- The CSRF token MUST be a cryptographically random 64-character hex string.

### User Resolution and Auto-Creation

- If a user with the verified key address already exists, the server MUST sign them in to that existing account.
- If no user exists with the verified key address, the server MUST auto-create a new user with a generated username in the format `wallet-XXXXXXXX` (last 8 hex characters of the lowercase address).
- If the wallet address is already associated with another account (unique constraint violation), the server MUST return `409 Conflict`.
- If the resolved user account has `prohibit_login` set, the server MUST return `403 Forbidden` with message `"account is suspended"`.

### Closed-Alpha Enforcement

- If closed-alpha mode is enabled (`CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true`), the server MUST check the key address against the alpha whitelist before allowing sign-in or account creation.
- Admin users MUST bypass closed-alpha checks.
- If the key address is not whitelisted, the server MUST return `403 Forbidden` with message `"closed alpha access requires a whitelist invite"`.

### Configuration Requirements

- If the `KeyAuthVerifier` is not configured (null), the server MUST return `500 Internal Server Error` with message `"key auth verifier is not configured"`.
- If the `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` is empty or not set, the server MUST return `500 Internal Server Error` with message `"key auth domain is not configured"`.

### Edge Cases

- Two concurrent requests with the same nonce: exactly one MUST succeed and the other MUST receive `401`.
- A message with a valid nonce but an invalid/mismatched domain MUST fail verification (treated as invalid signature).
- A correctly formatted message signed with a different key than the one embedded in the message MUST fail verification.
- A message with an `Issued At` timestamp in the far future MUST still be accepted as long as the nonce is valid.
- An empty JSON body `{}` MUST return `400 Bad Request`.
- A request with extra unexpected fields in the JSON body MUST still succeed (extra fields are ignored).

### Definition of Done

- Both `/api/auth/key/verify` (session) and `/api/auth/key/token` (token exchange) endpoints return correct responses for all success and error cases.
- Nonce single-use enforcement is atomic and race-condition-proof.
- Auto-creation of new wallet-based users works correctly.
- Closed-alpha gating works correctly for both new and existing users.
- Suspended account blocking works correctly.
- Session cookies are set with correct security attributes (`httpOnly`, `secure`, `sameSite`).
- All error responses use structured JSON error payloads consistent with the rest of the API.
- End-to-end tests pass for the full nonce → sign → verify → authenticated-request cycle.
- Documentation is updated for both the getting-started guide and the API reference.

## Design

### API Shape

#### `POST /api/auth/key/verify` — Session-Based Verification

**Request:**

```http
POST /api/auth/key/verify HTTP/1.1
Content-Type: application/json

{
  "message": "codeplane.app wants you to sign in with your key:\n0x71C7656EC7ab88b098defB751B7401B5f6d8976F\n\nSign in to Codeplane\n\nURI: https://codeplane.app\nVersion: 1\nChain ID: 1\nNonce: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4\nIssued At: 2026-03-21T12:00:00Z",
  "signature": "0x5f2c...9ab1"
}
```

**Success Response (200):**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: codeplane_session=<uuid>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
Set-Cookie: __csrf=<64-char-hex>; Path=/; Secure; SameSite=Strict

{
  "user": {
    "id": 42,
    "username": "alice"
  }
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid JSON body | `{"message": "invalid request body"}` |
| 400 | Missing message or signature | `{"message": "message and signature are required"}` |
| 401 | Invalid cryptographic signature | `{"message": "invalid signature"}` |
| 401 | Nonce expired, already used, or not found | `{"message": "invalid or expired nonce"}` |
| 403 | Account suspended | `{"message": "account is suspended"}` |
| 403 | Closed alpha not whitelisted | `{"message": "closed alpha access requires a whitelist invite"}` |
| 409 | Wallet address already in use | `{"message": "wallet address is already in use"}` |
| 500 | Verifier not configured | `{"message": "key auth verifier is not configured"}` |
| 500 | Domain not configured | `{"message": "key auth domain is not configured"}` |

#### `POST /api/auth/key/token` — Token Exchange Verification

**Request:** Same as `/api/auth/key/verify`.

**Success Response (200):**

```json
{
  "token": "codeplane_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  "username": "alice"
}
```

**Error Responses:** Same as `/api/auth/key/verify`.

The token is automatically created with name `"codeplane-cli"` and scopes `["repo", "user", "org"]`.

### SDK Shape

The `KeyAuthVerifier` interface is the pluggable cryptographic verification boundary:

```typescript
interface KeyAuthVerifier {
  verify(
    message: string,
    signature: string,
    expectedDomain: string
  ): { walletAddress: string; nonce: string };
}
```

The `AuthService.verifyKeyAuth(message, signature)` method orchestrates the full flow:
1. Delegate to `KeyAuthVerifier.verify()` for cryptographic verification
2. Atomically consume the nonce
3. Resolve or create the user
4. Enforce closed-alpha (if enabled)
5. Create and return a session

### CLI Command

```bash
# Sign in with key (interactive flow)
codeplane auth login --key

# Check auth status after key-based sign-in
codeplane auth status
```

The CLI `--key` flow:
1. Calls `GET /api/auth/key/nonce` to obtain a nonce
2. Constructs the EIP-4361 structured message
3. Signs the message with the user's local private key
4. Calls `POST /api/auth/key/token` to exchange the signed message for an API token
5. Stores the token in the OS keychain

### Web UI Design

The login view MUST include a "Sign in with Key" option alongside the GitHub OAuth button. When selected:

1. The UI requests a nonce from `GET /api/auth/key/nonce`.
2. The UI prompts the user to sign the structured message (this may involve a browser extension, a hardware wallet prompt, or a local key manager interaction).
3. The UI submits the signed message to `POST /api/auth/key/verify`.
4. On success, the session cookies are set and the user is redirected to the dashboard.
5. On failure, a clear inline error message is shown (e.g., "Signature verification failed. Please try again." or "This nonce has expired. Requesting a new one…" with automatic retry).

### TUI UI

The TUI MUST support key-based authentication status display. When the TUI is launched with a token obtained via key auth, the dashboard status bar should show the authenticated username. The TUI does not need to implement the interactive key-signing flow itself — it delegates to the CLI.

### Documentation

The following documentation MUST be maintained:

1. **Getting Started > Authentication** (`docs/getting-started/authentication.mdx`): The "Sign in with Key" section must document the three-step flow (nonce, sign, verify), the EIP-4361 message format, and when to use key auth vs. OAuth. Must include examples for curl, CLI, and programmatic agent usage.

2. **API Reference > Authentication** (`docs/api-reference/authentication.mdx`): Must document the `POST /auth/key/verify` and `POST /auth/key/token` endpoints with request/response schemas, all error codes, and curl examples.

3. **Guides > Agent Authentication**: A dedicated guide for configuring AI agents to authenticate with Codeplane using key-based auth, including keypair generation, message construction, and token storage patterns.

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| Request a nonce (`GET /api/auth/key/nonce`) | Anonymous (unauthenticated) |
| Verify signature (`POST /api/auth/key/verify`) | Anonymous (unauthenticated) — this IS the sign-in endpoint |
| Exchange signature for token (`POST /api/auth/key/token`) | Anonymous (unauthenticated) — this IS the sign-in endpoint |

These endpoints are inherently unauthenticated because they are the mechanism by which a user becomes authenticated.

### Rate Limiting

| Endpoint | Rate Limit | Window | Key |
|----------|------------|--------|-----|
| `GET /api/auth/key/nonce` | 10 requests | per minute | per IP |
| `POST /api/auth/key/verify` | 5 requests | per minute | per IP |
| `POST /api/auth/key/token` | 5 requests | per minute | per IP |
| Failed verification attempts | 20 failures | per hour | per IP — after exceeding, the IP is blocked from all key auth endpoints for 1 hour |

Rate limit responses MUST return `429 Too Many Requests` with a `Retry-After` header.

### Security Properties

- **Nonce single-use**: Each nonce is atomically consumed on first successful use. The SQL `UPDATE ... WHERE used_at IS NULL` pattern prevents double-use even under concurrent requests.
- **Nonce expiration**: 10-minute TTL prevents replay attacks using old nonces.
- **Session cookie security**: `httpOnly` prevents XSS-based session theft. `Secure` ensures transmission only over HTTPS. `SameSite=Lax` prevents CSRF for most cross-origin scenarios.
- **CSRF cookie**: The `__csrf` cookie is non-`httpOnly` (readable by JS) and `SameSite=Strict` for client-side CSRF protection on mutation requests.
- **Private key never transmitted**: Only the signature is sent to Codeplane. The private key remains on the client.
- **Token hashing**: API tokens are SHA-256 hashed before storage. The plaintext token is shown exactly once at creation.

### Data Privacy

- **Wallet addresses** are stored as user identity attributes. They are not considered PII in the traditional sense but should be treated as pseudonymous identifiers.
- **Nonces** are ephemeral and cleaned up by the background cleanup scheduler after expiration.
- **Session data** is minimal (user ID, username, admin flag) and is cleaned up on expiration or explicit logout.
- Signature payloads (message + signature) MUST NOT be logged at INFO level or below. They may be logged at DEBUG level for troubleshooting.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.key.nonce_requested` | Nonce successfully created | `ip`, `user_agent`, `timestamp` |
| `auth.key.verify_succeeded` | Signature verified, session created | `user_id`, `username`, `is_new_user`, `wallet_address_prefix` (first 10 chars), `auth_mode` ("session" or "token"), `timestamp` |
| `auth.key.verify_failed` | Signature verification rejected | `reason` ("invalid_signature", "expired_nonce", "used_nonce", "suspended", "alpha_denied"), `ip`, `timestamp` |
| `auth.key.user_auto_created` | New user created via key auth | `user_id`, `username`, `wallet_address_prefix`, `timestamp` |
| `auth.key.alpha_denied` | User blocked by closed-alpha whitelist | `wallet_address_prefix`, `timestamp` |

### Funnel Metrics

1. **Nonce-to-verify conversion rate**: `auth.key.verify_succeeded / auth.key.nonce_requested`. A healthy rate is >70%. A low rate indicates clients are failing to complete the signing step.
2. **New user acquisition via key auth**: Count of `auth.key.user_auto_created` per day/week. Tracks adoption of key-based sign-in by new users.
3. **Failure distribution**: Breakdown of `auth.key.verify_failed` by `reason`. A spike in `expired_nonce` suggests the 10-minute window is too short. A spike in `invalid_signature` suggests client-side signing bugs.
4. **Key auth vs. OAuth ratio**: `auth.key.verify_succeeded / (auth.key.verify_succeeded + auth.oauth.completed)`. Tracks the relative adoption of key auth.

## Observability

### Logging

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Nonce created | INFO | `event=key_auth_nonce_created`, `nonce_prefix` (first 8 chars), `expires_at` | Never log the full nonce |
| Verification started | INFO | `event=key_auth_verify_started`, `request_id`, `ip` | |
| Signature validation succeeded | INFO | `event=key_auth_signature_valid`, `wallet_address_prefix`, `nonce_prefix` | |
| Signature validation failed | WARN | `event=key_auth_signature_invalid`, `request_id`, `ip`, `error` | |
| Nonce consumption failed | WARN | `event=key_auth_nonce_invalid`, `request_id`, `nonce_prefix`, `reason` ("expired" or "already_used") | |
| User auto-created | INFO | `event=key_auth_user_created`, `user_id`, `username`, `wallet_address_prefix` | |
| Closed-alpha denied | WARN | `event=key_auth_alpha_denied`, `wallet_address_prefix` | |
| Account suspended block | WARN | `event=key_auth_suspended`, `user_id`, `username` | |
| Session created | INFO | `event=key_auth_session_created`, `user_id`, `session_mode` ("cookie" or "token") | Never log session key or token |
| Verifier not configured | ERROR | `event=key_auth_verifier_missing` | Server misconfiguration |
| Domain not configured | ERROR | `event=key_auth_domain_missing` | Server misconfiguration |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_auth_key_nonce_created_total` | Counter | — | Total nonces issued |
| `codeplane_auth_key_verify_total` | Counter | `result` (success, invalid_signature, expired_nonce, used_nonce, suspended, alpha_denied, server_error) | Total verification attempts by result |
| `codeplane_auth_key_verify_duration_seconds` | Histogram | `result` | End-to-end verification latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_auth_key_user_created_total` | Counter | — | Total auto-created wallet users |
| `codeplane_auth_key_active_nonces` | Gauge | — | Current count of unexpired, unused nonces |
| `codeplane_auth_key_rate_limited_total` | Counter | `endpoint` | Total rate-limited requests |

### Alerts

#### Alert: `KeyAuthVerifyErrorRateHigh`
- **Condition**: `rate(codeplane_auth_key_verify_total{result!="success"}[5m]) / rate(codeplane_auth_key_verify_total[5m]) > 0.5` for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_auth_key_verify_total` by `result` label to identify the dominant failure reason.
  2. If `invalid_signature` is dominant: Check for client SDK updates or breaking changes in the signing library. Verify the configured `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` matches what clients expect.
  3. If `expired_nonce` is dominant: Check server clock synchronization (NTP). Check if nonce TTL is too short for client workflows. Check for elevated latency in the signing step.
  4. If `used_nonce` is dominant: Possible replay attack or client bug double-submitting. Check access logs for repeated IPs.
  5. If `server_error` is dominant: Check `key_auth_verifier_missing` or `key_auth_domain_missing` logs. Verify environment variables are set correctly.

#### Alert: `KeyAuthVerifierNotConfigured`
- **Condition**: Any `codeplane_auth_key_verify_total{result="server_error"}` increment within 1 minute
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for `event=key_auth_verifier_missing` or `event=key_auth_domain_missing`.
  2. Verify that `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` is set in the environment.
  3. Verify that the `KeyAuthVerifier` implementation is injected into the `DatabaseAuthService` constructor at boot time.
  4. If the verifier module failed to load, check for missing dependencies or build errors.
  5. Restart the server after fixing configuration.

#### Alert: `KeyAuthLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_auth_key_verify_duration_seconds_bucket[5m])) > 2.0` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool health. The nonce consumption query requires a write to `auth_nonces`.
  2. Check for lock contention on `auth_nonces` table.
  3. Check the `KeyAuthVerifier.verify()` implementation for CPU-bound signature verification delays.
  4. Profile the user lookup/creation path for slow queries.

#### Alert: `KeyAuthRateLimitSpike`
- **Condition**: `rate(codeplane_auth_key_rate_limited_total[5m]) > 50` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check access logs for the IP addresses being rate-limited.
  2. Determine if this is a legitimate traffic spike or an attack.
  3. If attack: consider temporarily adding IP block rules at the load balancer/firewall level.
  4. If legitimate: consider temporarily increasing rate limits or whitelisting known CI IPs.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Detection | Impact |
|------------|-------------|-----------|--------|
| KeyAuthVerifier not configured | 500 | Immediate on first request | All key auth is broken |
| Domain not configured | 500 | Immediate on first request | All key auth is broken |
| Database unavailable | 500 | Nonce creation/consumption fails | All key auth is broken |
| Invalid signature | 401 | Per-request | Single user affected |
| Expired nonce | 401 | Per-request | Single user must retry |
| Replay attack (reused nonce) | 401 | Per-request | Attack blocked |
| Closed-alpha rejection | 403 | Per-request | Uninvited user blocked |
| Suspended account | 403 | Per-request | Banned user blocked |
| Unique constraint on wallet address | 409 | Per-request | Rare race condition on first sign-up |
| Clock skew between server nodes | Nonces may expire prematurely or late | Monitor expired_nonce rate | Users may see unexpected failures |

## Verification

### API Integration Tests

#### Happy Path — Session Verification
1. `POST /api/auth/key/verify` with a valid message and signature → returns `200` with `user.id` and `user.username`, sets `codeplane_session` cookie, sets `__csrf` cookie.
2. Verify the `codeplane_session` cookie has `httpOnly=true`, `path=/`, `sameSite=Lax`.
3. Verify the `__csrf` cookie has `httpOnly=false`, `sameSite=Strict`.
4. Use the session cookie to call an authenticated endpoint (`GET /api/user`) → returns `200` with the same user.

#### Happy Path — Token Exchange
5. `POST /api/auth/key/token` with a valid message and signature → returns `200` with `token` (starts with `codeplane_`) and `username`.
6. Use the returned token as `Authorization: token <token>` on an authenticated endpoint → returns `200`.

#### Happy Path — New User Auto-Creation
7. `POST /api/auth/key/verify` with a wallet address that has no existing account → returns `200`, creates a new user with `wallet-XXXXXXXX` username pattern.
8. Verify the auto-created user exists in the user database with the correct wallet address.

#### Happy Path — Existing User Sign-In
9. Create a user via key auth, then sign in again with the same wallet address → returns `200` with the same `user.id`.

#### Nonce Enforcement
10. Request a nonce, use it for verification → succeeds. Attempt to use the same nonce again → returns `401` with `"invalid or expired nonce"`.
11. Request a nonce, wait for it to expire (or mock clock advance past 10 minutes), then attempt verification → returns `401` with `"invalid or expired nonce"`.
12. Submit a message containing a nonce that was never issued → returns `401`.
13. **Concurrency test**: Request a single nonce, send two concurrent `POST /api/auth/key/verify` requests with the same nonce → exactly one returns `200`, the other returns `401`.

#### Input Validation
14. `POST /api/auth/key/verify` with empty body → returns `400` with `"invalid request body"`.
15. `POST /api/auth/key/verify` with `{"message": "", "signature": "0xabc"}` → returns `400` with `"message and signature are required"`.
16. `POST /api/auth/key/verify` with `{"message": "hello", "signature": ""}` → returns `400` with `"message and signature are required"`.
17. `POST /api/auth/key/verify` with `{"message": "   ", "signature": "   "}` → returns `400` (whitespace-only treated as empty).
18. `POST /api/auth/key/verify` with non-JSON body → returns `400`.
19. `POST /api/auth/key/verify` with a `message` that is exactly 4096 bytes → succeeds (assuming valid signature).
20. `POST /api/auth/key/verify` with a `message` that is 4097 bytes → returns `400`.
21. `POST /api/auth/key/verify` with a `signature` that is exactly 512 bytes → succeeds (assuming valid content).
22. `POST /api/auth/key/verify` with a `signature` that is 513 bytes → returns `400`.
23. `POST /api/auth/key/verify` with extra fields `{"message": "...", "signature": "...", "extra": true}` → succeeds (extra fields ignored).

#### Signature Verification
24. `POST /api/auth/key/verify` with a valid message but a signature from a different key → returns `401` with `"invalid signature"`.
25. `POST /api/auth/key/verify` with a garbled/non-hex signature → returns `401` with `"invalid signature"`.
26. `POST /api/auth/key/verify` with a message whose domain does not match the configured `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` → returns `401`.

#### Configuration Errors
27. When `KeyAuthVerifier` is null, `POST /api/auth/key/verify` → returns `500` with `"key auth verifier is not configured"`.
28. When `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` is empty, `POST /api/auth/key/verify` → returns `500` with `"key auth domain is not configured"`.

#### Account State
29. Verify with a wallet address belonging to a suspended user (`prohibit_login=true`) → returns `403` with `"account is suspended"`.
30. With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true` and the wallet address NOT on the whitelist → returns `403` with `"closed alpha access requires a whitelist invite"`.
31. With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true` and the wallet address ON the whitelist → returns `200`.
32. With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true` and user is admin → returns `200` regardless of whitelist.

#### Wallet Address Uniqueness
33. Create user A with wallet W via key auth. Attempt to create user B with the same wallet W → returns `409` with `"wallet address is already in use"`.

### CLI E2E Tests

34. `codeplane auth status` with a valid token obtained via key auth → returns `0` exit code, outputs username.
35. `codeplane auth status` with an empty token → returns non-zero exit code.
36. `codeplane auth status` with an invalid/garbage token → returns non-zero exit code.
37. `codeplane auth status` with a correctly-prefixed but non-existent token (`codeplane_0000...`) → returns non-zero exit code.

### Playwright (Web UI) E2E Tests

38. Navigate to the login page → "Sign in with Key" option is visible.
39. Click "Sign in with Key" → the UI initiates the nonce request flow and prompts for signing.
40. Complete the signing flow with a valid key → user is redirected to the dashboard, session cookies are set.
41. Complete the signing flow with an invalid signature → an inline error message is displayed.
42. Complete the signing flow with an expired nonce → an error message is displayed with automatic retry offer.

### Rate Limiting Tests

43. Send 11 `GET /api/auth/key/nonce` requests from the same IP within 1 minute → the 11th returns `429`.
44. Send 6 `POST /api/auth/key/verify` requests from the same IP within 1 minute → the 6th returns `429`.
45. Verify the `429` response includes a `Retry-After` header.

### Nonce Cleanup Tests

46. Create nonces, advance time past expiration, trigger cleanup → expired nonces are deleted from the database.

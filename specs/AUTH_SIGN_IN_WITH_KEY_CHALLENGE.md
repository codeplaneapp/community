# AUTH_SIGN_IN_WITH_KEY_CHALLENGE

Specification for AUTH_SIGN_IN_WITH_KEY_CHALLENGE.

## High-Level User POV

When a user visits Codeplane and wants to sign in without relying on a third-party identity provider like GitHub, they can authenticate using a cryptographic key they already control — such as an Ethereum wallet or any EIP-4361-compatible signing client. This is a passwordless, self-sovereign authentication method that puts the user in full control of their identity.

The experience is straightforward: the user clicks "Sign in with Key" on the login screen (or initiates the flow from the CLI or an agent). Codeplane issues a short-lived challenge — a unique, one-time nonce — and presents a structured message for the user to sign with their private key. The user's signing client (browser wallet extension, hardware wallet, or CLI-integrated signer) signs the message, and the signature is sent back to Codeplane. Codeplane verifies the signature cryptographically, confirms the nonce hasn't been used before or expired, and either logs the user into their existing account or creates a new account automatically tied to their wallet address.

From the user's perspective, this is a single-interaction sign-in: request a challenge, sign it, and you're in. There is no password to remember, no email verification loop to complete before first access, and no dependency on GitHub being available. The wallet address becomes the user's stable identity anchor — subsequent sign-ins with the same key always resolve to the same Codeplane account.

For CLI and agent workflows, the same challenge-response mechanism can be used to obtain an API token directly, without needing a browser session. This makes key-based authentication the preferred method for headless, automated, and agent-driven Codeplane access patterns where browser-based OAuth is impractical.

If the Codeplane instance is operating in closed-alpha mode, the user's wallet address (or associated identities) must appear on the whitelist before access is granted. Users who are not whitelisted see a clear, actionable rejection message rather than a silent failure.

## Acceptance Criteria

### Definition of Done

The feature is complete when a user can authenticate with Codeplane from the web UI, CLI, and programmatic clients using a cryptographic key challenge-response flow, receiving either a browser session or an API token, with all edge cases handled gracefully.

### Functional Constraints

- [ ] **Nonce issuance**: The server MUST issue a cryptographically random nonce (at least 16 bytes / 32 hex characters) on each `GET /api/auth/key/nonce` request.
- [ ] **Nonce expiration**: Each nonce MUST expire after exactly 10 minutes from issuance. Verification attempts using an expired nonce MUST be rejected.
- [ ] **Nonce single-use**: Each nonce MUST be consumable exactly once. A second verification attempt using the same nonce MUST be rejected, even if the nonce has not expired.
- [ ] **Nonce atomicity**: Nonce consumption MUST be atomic — concurrent requests using the same nonce MUST result in at most one successful verification.
- [ ] **Message and signature required**: Both `message` and `signature` fields MUST be present and non-empty (after trimming) in verification requests. Missing or blank fields MUST return a 400 error.
- [ ] **Signature verification**: The server MUST verify the signature against the message using the configured `KeyAuthVerifier`. Invalid signatures MUST return a 401 error.
- [ ] **Domain binding**: The signed message MUST be validated against the configured `CODEPLANE_AUTH_KEY_AUTH_DOMAIN`. Messages signed for a different domain MUST be rejected.
- [ ] **Wallet address extraction**: The server MUST extract the wallet address from the verified message and use it as the user identity anchor.
- [ ] **Auto-registration**: If no user exists for the verified wallet address, a new user account MUST be created automatically with a username derived from the wallet address (format: `wallet-<last 8 hex chars>`).
- [ ] **Duplicate wallet rejection**: If a wallet address is already registered to a different user (unique constraint violation), the server MUST return a 409 Conflict error.
- [ ] **Suspended account blocking**: Users with `prohibitLogin = true` MUST receive a 403 Forbidden error, even if their signature is valid.
- [ ] **Session creation (web flow)**: On successful verification via `/api/auth/key/verify`, the server MUST create an auth session, set a session cookie (`httpOnly`, `sameSite: Lax`, configurable `secure` flag), and set a CSRF cookie (`httpOnly: false`, `sameSite: Strict`).
- [ ] **Token creation (CLI/agent flow)**: On successful verification via `/api/auth/key/token`, the server MUST create an access token with `codeplane-cli` name and `repo, user, org` scopes, returning the raw token and username.
- [ ] **Session duration**: Sessions MUST respect the configured `CODEPLANE_AUTH_SESSION_DURATION` (default: 720 hours). Invalid or zero durations MUST fall back to the default.
- [ ] **Closed-alpha enforcement**: When `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED` is true, new and existing users MUST be checked against the whitelist. Non-whitelisted users MUST receive a 403 error with the message "closed alpha access requires a whitelist invite".
- [ ] **Configuration validation**: If the `KeyAuthVerifier` is not configured, or if `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` is empty, the server MUST return a 500 error rather than silently accepting unverified signatures.
- [ ] **Response shape (verify)**: The verify endpoint MUST return `{ user: { id, username } }` on success.
- [ ] **Response shape (token)**: The token endpoint MUST return `{ token, username }` on success.

### Boundary Constraints

- [ ] **Nonce length**: Exactly 32 hex characters (16 bytes of entropy).
- [ ] **Message max length**: Messages MUST NOT exceed 4096 bytes. Messages exceeding this limit MUST be rejected with a 400 error.
- [ ] **Signature max length**: Signatures MUST NOT exceed 2048 bytes. Signatures exceeding this limit MUST be rejected with a 400 error.
- [ ] **Wallet address format**: Must be a valid Ethereum address — exactly 42 characters, starting with `0x`, followed by 40 hexadecimal characters. Invalid formats MUST be rejected.
- [ ] **Generated username length**: The auto-generated `wallet-XXXXXXXX` username MUST NOT exceed 15 characters.
- [ ] **Session cookie name**: Must be configurable via `CODEPLANE_AUTH_SESSION_COOKIE_NAME`, defaulting to `codeplane_session`. Empty/whitespace values MUST fall back to the default.
- [ ] **CSRF token length**: Exactly 64 hex characters (32 bytes of entropy).

### Edge Cases

- [ ] **Concurrent nonce consumption**: Two simultaneous verify requests with the same nonce MUST result in exactly one success and one "invalid or expired nonce" rejection.
- [ ] **Nonce issued but never used**: Expired nonces MUST NOT be consumable after their 10-minute TTL.
- [ ] **Replay attack**: Resubmitting a previously successful `{message, signature}` pair MUST fail because the nonce is already consumed.
- [ ] **Malformed JSON body**: Non-JSON or unparseable request bodies MUST return 400 "invalid request body".
- [ ] **Empty JSON object `{}`**: MUST return 400 "message and signature are required".
- [ ] **Whitespace-only fields**: `{ message: "   ", signature: "  " }` MUST return 400 "message and signature are required".
- [ ] **Valid signature, wrong domain**: MUST return 401 "invalid signature".
- [ ] **New user in closed alpha without whitelist entry**: MUST return 403.
- [ ] **Existing user in closed alpha removed from whitelist**: MUST return 403.
- [ ] **Admin user bypasses closed alpha**: Admins MUST NOT be subject to whitelist checks.

## Design

### API Shape

#### `GET /api/auth/key/nonce`

**Purpose**: Issue a one-time cryptographic challenge nonce.

**Authentication**: None required (public endpoint).

**Response** `200 OK`:
```json
{
  "nonce": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

**Errors**:
- `500`: Nonce creation failed (database error or service misconfiguration).

---

#### `POST /api/auth/key/verify`

**Purpose**: Verify a signed challenge message and establish a browser session.

**Authentication**: None required (public endpoint).

**Request Body**:
```json
{
  "message": "<EIP-4361 structured message containing the nonce>",
  "signature": "<hex-encoded cryptographic signature>"
}
```

**Response** `200 OK`:
```json
{
  "user": {
    "id": 42,
    "username": "wallet-a3b4c5d6"
  }
}
```

**Side Effects**:
- Sets `codeplane_session` cookie (httpOnly, sameSite: Lax).
- Sets `__csrf` cookie (httpOnly: false, sameSite: Strict).

**Errors**:
- `400`: Invalid or missing request body, empty message/signature.
- `401`: Invalid signature, expired nonce, already-consumed nonce.
- `403`: Account suspended, or closed-alpha not whitelisted.
- `409`: Wallet address already associated with another account.
- `500`: Verifier not configured, domain not configured, internal failure.

---

#### `POST /api/auth/key/token`

**Purpose**: Verify a signed challenge message and return an API access token (for CLI and agent use).

**Authentication**: None required (public endpoint).

**Request Body**: Same as `/api/auth/key/verify`.

**Response** `200 OK`:
```json
{
  "token": "codeplane_a1b2c3d4e5f6...",
  "username": "wallet-a3b4c5d6"
}
```

**Side Effects**:
- Creates an access token named `codeplane-cli` with scopes `repo`, `user`, `org`.
- No cookies are set.

**Errors**: Same as `/api/auth/key/verify`.

---

### SDK Shape

The `AuthService` interface exposes:

```typescript
interface AuthService {
  createKeyAuthNonce(): Promise<string>;
  verifyKeyAuth(message: string, signature: string): Promise<VerifyKeyAuthResult>;
}

interface VerifyKeyAuthResult {
  user: { id: string; username: string; isAdmin: boolean; prohibitLogin: boolean };
  sessionKey: string;
  expiresAt: Date;
}
```

The `KeyAuthVerifier` pluggable interface:

```typescript
interface KeyAuthVerifier {
  verify(message: string, signature: string, expectedDomain: string): {
    walletAddress: string;
    nonce: string;
  };
}
```

Callers provide a `KeyAuthVerifier` implementation at service construction time. If none is provided, key auth endpoints return 500. This makes the verification strategy pluggable without coupling the auth service to a specific signing standard.

---

### Web UI Design

The login view MUST include a "Sign in with Key" option alongside GitHub OAuth. The key sign-in flow in the browser:

1. User clicks "Sign in with Key".
2. The UI calls `GET /api/auth/key/nonce` to retrieve a nonce.
3. The UI constructs an EIP-4361 message containing the nonce, domain, and a human-readable statement (e.g., "Sign in to Codeplane").
4. The UI invokes the user's wallet extension (e.g., `window.ethereum.request({ method: 'personal_sign', ... })`) to sign the message.
5. The UI posts `{ message, signature }` to `POST /api/auth/key/verify`.
6. On success, the UI redirects the user to their dashboard.
7. On failure, the UI displays the error message (invalid signature, expired nonce, not whitelisted, etc.) in an inline alert.

**UI States**:
- **Idle**: "Sign in with Key" button is enabled.
- **Requesting nonce**: Button shows a loading spinner, text changes to "Preparing challenge…".
- **Awaiting signature**: Modal or inline prompt says "Please sign the message in your wallet".
- **Verifying**: Spinner with "Verifying signature…".
- **Error**: Red inline alert with the specific error message. Button returns to idle.
- **Success**: Redirect to dashboard.

**Accessibility**: All states MUST have appropriate ARIA labels. Error messages MUST be associated with the form via `aria-describedby`. The sign-in button MUST be keyboard-accessible.

---

### CLI Command

The CLI does not currently implement a dedicated `auth login --with-key` subcommand; the key-based flow is available as a programmatic API for agents and integrations. If a CLI key-login command is added in the future, it should:

1. Call `GET /api/auth/key/nonce` against the configured host.
2. Invoke a local signing tool or prompt the user for a signature.
3. Call `POST /api/auth/key/token` to exchange the signature for an API token.
4. Store the token in the CLI credential store.

---

### Documentation

The following documentation MUST be written for end users:

- **Authentication Guide**: A top-level guide explaining all Codeplane sign-in methods (GitHub OAuth, key challenge, personal access tokens), with the key challenge section explaining what wallets are supported, how to sign in from the web, and how to use the API for programmatic access.
- **API Reference — Auth Endpoints**: Document `GET /api/auth/key/nonce`, `POST /api/auth/key/verify`, and `POST /api/auth/key/token` with request/response examples, error codes, and security notes.
- **Self-Hosting Guide — Auth Configuration**: Document the environment variables (`CODEPLANE_AUTH_KEY_AUTH_DOMAIN`, `CODEPLANE_AUTH_SESSION_DURATION`, `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED`, `CODEPLANE_AUTH_COOKIE_SECURE`, `CODEPLANE_AUTH_SESSION_COOKIE_NAME`) with explanations of what each controls and recommended production values.
- **Closed Alpha Guide**: Explain whitelist management for administrators, including how wallet addresses are whitelisted and how enforcement works during key auth.

## Permissions & Security

### Authorization Roles

| Endpoint | Required Role |
|---|---|
| `GET /api/auth/key/nonce` | Anonymous (no authentication required) |
| `POST /api/auth/key/verify` | Anonymous (this IS the authentication step) |
| `POST /api/auth/key/token` | Anonymous (this IS the authentication step) |

These endpoints are inherently public because they are the mechanism by which a user *becomes* authenticated. Post-authentication, the resulting session or token carries the user's role (regular user or admin).

### Rate Limiting

- **Nonce issuance**: Rate limit to **10 requests per minute per IP address**. This prevents nonce exhaustion attacks where an attacker generates millions of nonces to fill the nonce table.
- **Signature verification (verify + token)**: Rate limit to **5 requests per minute per IP address**. This prevents brute-force signature guessing (though cryptographically infeasible, it limits server-side computation).
- **Failed verification**: After **10 consecutive failed verifications from a single IP within 15 minutes**, temporarily block that IP from auth endpoints for 30 minutes. Log a security event.
- **Global rate limit**: Auth endpoints collectively should not exceed **1000 requests per minute** across all IPs. Beyond this threshold, return `429 Too Many Requests`.

### Data Privacy & PII

- **Wallet addresses are PII**: Wallet addresses can be linked to on-chain identity and financial activity. They MUST be stored but MUST NOT be exposed in public API responses (e.g., user profile endpoints should not return `walletAddress` to other users).
- **Nonces are ephemeral secrets**: Nonces MUST be stored only for their TTL and cleaned up after expiration or consumption.
- **Signed messages contain the domain**: The EIP-4361 message format includes the domain. This binds the signature to this specific Codeplane instance, preventing cross-site signature replay.
- **Session keys are secrets**: Session keys MUST NOT appear in logs, error messages, or API responses (except as the session cookie value itself).
- **Access tokens are secrets**: The raw token value MUST only be returned once (at creation time) and MUST NOT be retrievable again. Only the last 8 characters of the hash are stored for display.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `AuthKeyNonceRequested` | Nonce issued successfully | `{ nonceId, clientIp, timestamp }` |
| `AuthKeyVerifyAttempted` | Verify or token endpoint called | `{ clientIp, endpoint ("verify" | "token"), timestamp }` |
| `AuthKeyVerifySucceeded` | Signature verified and session/token created | `{ userId, username, isNewUser, endpoint, walletAddressPrefix (first 6 chars), timestamp }` |
| `AuthKeyVerifyFailed` | Verification rejected | `{ reason ("invalid_signature" | "expired_nonce" | "consumed_nonce" | "suspended" | "not_whitelisted" | "config_error"), clientIp, endpoint, timestamp }` |
| `AuthKeyUserAutoRegistered` | New user created via key auth | `{ userId, username, walletAddressPrefix, timestamp }` |
| `AuthKeyClosedAlphaBlocked` | User blocked by closed alpha whitelist | `{ walletAddressPrefix, isNewUser, timestamp }` |

### Funnel Metrics

1. **Nonce-to-Verify Conversion Rate**: `AuthKeyVerifyAttempted / AuthKeyNonceRequested`. Healthy range: 60–90%. Low conversion may indicate UX friction in the signing step.
2. **Verify Success Rate**: `AuthKeyVerifySucceeded / AuthKeyVerifyAttempted`. Healthy range: >90%. Low success may indicate expired nonces (nonce TTL too short), misconfigured domain, or attack traffic.
3. **Auto-Registration Rate**: `AuthKeyUserAutoRegistered / AuthKeyVerifySucceeded (where isNewUser=true)`. Tracks new user acquisition via key auth specifically.
4. **Key Auth Share**: `AuthKeyVerifySucceeded / (AuthKeyVerifySucceeded + AuthGitHubOAuthSucceeded)`. Tracks adoption of key auth relative to GitHub OAuth.
5. **Closed Alpha Block Rate**: `AuthKeyClosedAlphaBlocked / AuthKeyVerifyAttempted`. Should approach 0% as waitlist is cleared; spikes indicate unauthorized access attempts.

### Success Indicators

- Key auth is the primary sign-in method for >30% of active users within 90 days of launch.
- Nonce-to-verify conversion rate stays above 70%.
- Verify success rate stays above 95%.
- Mean time from nonce request to successful verify is under 30 seconds.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Nonce created | `info` | `{ event: "auth.key.nonce_created", noncePrefix: first6chars, expiresAt, clientIp }` |
| Nonce creation failed | `error` | `{ event: "auth.key.nonce_create_failed", error, clientIp }` |
| Verify attempt started | `info` | `{ event: "auth.key.verify_started", endpoint, clientIp }` |
| Signature verification failed | `warn` | `{ event: "auth.key.signature_invalid", endpoint, clientIp }` |
| Nonce consumed | `debug` | `{ event: "auth.key.nonce_consumed", noncePrefix, walletPrefix }` |
| Nonce expired or already used | `warn` | `{ event: "auth.key.nonce_rejected", reason: "expired" | "already_used", clientIp }` |
| User auto-registered | `info` | `{ event: "auth.key.user_registered", userId, username, walletPrefix }` |
| User logged in via key | `info` | `{ event: "auth.key.login_success", userId, username, endpoint, clientIp }` |
| Account suspended rejection | `warn` | `{ event: "auth.key.account_suspended", walletPrefix, clientIp }` |
| Closed alpha block | `warn` | `{ event: "auth.key.alpha_blocked", walletPrefix, clientIp }` |
| Verifier not configured | `error` | `{ event: "auth.key.verifier_not_configured" }` |
| Domain not configured | `error` | `{ event: "auth.key.domain_not_configured" }` |
| Token created via key auth | `info` | `{ event: "auth.key.token_created", userId, tokenName, scopes }` |
| Session created via key auth | `info` | `{ event: "auth.key.session_created", userId, sessionDuration }` |

**IMPORTANT**: Wallet addresses, nonce values, signatures, session keys, and token values MUST NEVER appear in full in logs. Use prefixes (first 6 characters) only.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_auth_key_nonce_issued_total` | Counter | — | Total nonces issued |
| `codeplane_auth_key_verify_attempts_total` | Counter | `endpoint`, `result` (`success`, `invalid_signature`, `expired_nonce`, `consumed_nonce`, `suspended`, `not_whitelisted`, `config_error`, `bad_request`) | Total verification attempts by outcome |
| `codeplane_auth_key_verify_duration_seconds` | Histogram | `endpoint` | Time from verify request received to response sent |
| `codeplane_auth_key_users_registered_total` | Counter | — | Total auto-registered users via key auth |
| `codeplane_auth_key_active_nonces` | Gauge | — | Count of non-expired, non-consumed nonces (sampled periodically) |
| `codeplane_auth_key_nonce_ttl_expirations_total` | Counter | — | Nonces that expired without being consumed (cleaned up) |
| `codeplane_auth_key_rate_limit_rejections_total` | Counter | `endpoint` | Requests rejected by rate limiting |

### Alerts and Runbooks

#### Alert: `AuthKeyVerifySuccessRateLow`

**Condition**: `rate(codeplane_auth_key_verify_attempts_total{result="success"}[5m]) / rate(codeplane_auth_key_verify_attempts_total[5m]) < 0.5` sustained for 10 minutes.

**Severity**: Warning

**Runbook**:
1. Check `codeplane_auth_key_verify_attempts_total` by `result` label to identify which failure reason is dominant.
2. If `config_error` is high: verify `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` is set and `KeyAuthVerifier` is initialized. Check server startup logs for verifier initialization errors.
3. If `expired_nonce` is high: check if client-side signing is taking too long (>10 minutes). Consider increasing nonce TTL or investigating client UX.
4. If `invalid_signature` is high: check if the domain configuration matches what clients are signing. Check for bot/attack traffic patterns in access logs.
5. If `not_whitelisted` is high and closed alpha is enabled: verify whitelist entries are correct. May be legitimate blocked traffic.

#### Alert: `AuthKeyNonceTableGrowth`

**Condition**: `codeplane_auth_key_active_nonces > 10000` sustained for 5 minutes.

**Severity**: Warning

**Runbook**:
1. Check if the nonce cleanup job is running (`PLATFORM_BACKGROUND_CLEANUP_SCHEDULER`).
2. Query the `auth_nonces` table for nonces past their `expires_at` that haven't been cleaned up.
3. If cleanup is stalled, restart the cleanup scheduler or run manual cleanup: `DELETE FROM auth_nonces WHERE expires_at < NOW() - INTERVAL '1 hour'`.
4. Check rate limiting — a high nonce count may indicate a nonce exhaustion attack. Review IP-level request rates.

#### Alert: `AuthKeyVerifierDown`

**Condition**: `rate(codeplane_auth_key_verify_attempts_total{result="config_error"}[5m]) > 0` sustained for 2 minutes.

**Severity**: Critical

**Runbook**:
1. Key auth is completely broken — all verification attempts are failing with configuration errors.
2. Check environment variables: `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` must be non-empty.
3. Check that the `KeyAuthVerifier` was provided during service construction (review server bootstrap logs).
4. If the verifier dependency is unavailable, disable the key auth UI entry point until it's restored (feature flag).
5. Users can still sign in via GitHub OAuth — this is not a total auth outage.

#### Alert: `AuthKeySuspiciousFailureSpike`

**Condition**: `rate(codeplane_auth_key_verify_attempts_total{result="invalid_signature"}[5m]) > 50` sustained for 5 minutes.

**Severity**: Warning

**Runbook**:
1. High rate of invalid signatures may indicate an attack or a widespread client misconfiguration.
2. Check access logs for IP concentration — if traffic is from a small number of IPs, consider temporary IP blocks.
3. If traffic is distributed, check for a recently deployed client-side change that may have broken message construction or signing.
4. Review the `clientIp` field in structured logs to identify patterns.

### Error Cases and Failure Modes

| Error | HTTP Status | User-Facing Message | Internal Cause |
|---|---|---|---|
| Malformed JSON body | 400 | "invalid request body" | JSON parse failure |
| Missing message/signature | 400 | "message and signature are required" | Empty or whitespace-only fields |
| Invalid signature | 401 | "invalid signature" | `KeyAuthVerifier.verify()` threw |
| Expired nonce | 401 | "invalid or expired nonce" | Nonce past `expires_at` |
| Already-consumed nonce | 401 | "invalid or expired nonce" | Nonce `used_at` already set |
| Wallet already registered | 409 | "wallet address is already in use" | Unique constraint on wallet_address |
| Account suspended | 403 | "account is suspended" | `prohibitLogin = true` |
| Not whitelisted | 403 | "closed alpha access requires a whitelist invite" | Whitelist check failed |
| Verifier not configured | 500 | "key auth verifier is not configured" | `keyAuthVerifier` is null |
| Domain not configured | 500 | "key auth domain is not configured" | `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` empty |
| DB nonce insert failure | 500 | "failed to create auth nonce" | Database write error |
| DB session insert failure | 500 | "failed to create session" | Database write error |
| DB user insert failure | 500 | "failed to create wallet user" | Non-unique-violation DB error |
| Token creation failure | 500 | "failed to create access token" | Database write error |

## Verification

### API Integration Tests

#### Nonce Issuance

- [ ] `GET /api/auth/key/nonce` returns 200 with a `{ nonce }` body where `nonce` is a 32-character hex string.
- [ ] Two consecutive nonce requests return different nonce values.
- [ ] Nonce issuance works without any authentication headers.
- [ ] Nonce issuance respects rate limiting — 11th request within 1 minute from same IP returns 429.

#### Verify Endpoint — Happy Path

- [ ] `POST /api/auth/key/verify` with a valid message+signature returns 200 with `{ user: { id, username } }`.
- [ ] Response sets a `codeplane_session` cookie that is httpOnly and sameSite Lax.
- [ ] Response sets a `__csrf` cookie that is NOT httpOnly and is sameSite Strict.
- [ ] The session cookie value can be used to authenticate subsequent API requests.
- [ ] For a new wallet address, a user is auto-created with username matching `wallet-<last8hex>`.
- [ ] For an existing wallet address, the same user is returned on subsequent sign-ins.

#### Token Endpoint — Happy Path

- [ ] `POST /api/auth/key/token` with a valid message+signature returns 200 with `{ token, username }`.
- [ ] The returned token starts with `codeplane_` prefix.
- [ ] The returned token can be used as a Bearer token for authenticated API requests.
- [ ] No cookies are set on the response.
- [ ] The token has `repo`, `user`, `org` scopes.

#### Verify Endpoint — Error Cases

- [ ] Empty body returns 400 "invalid request body".
- [ ] `{}` returns 400 "message and signature are required".
- [ ] `{ message: "", signature: "" }` returns 400.
- [ ] `{ message: "   ", signature: "   " }` (whitespace-only) returns 400.
- [ ] `{ message: "valid" }` (missing signature) returns 400.
- [ ] `{ signature: "valid" }` (missing message) returns 400.
- [ ] Non-JSON content type body returns 400.
- [ ] Valid format but invalid signature returns 401 "invalid signature".
- [ ] Valid signature with expired nonce (wait >10 minutes or manually expire) returns 401 "invalid or expired nonce".
- [ ] Replaying a previously successful `{message, signature}` pair returns 401 "invalid or expired nonce".
- [ ] Valid signature for a suspended user returns 403 "account is suspended".

#### Nonce Lifecycle

- [ ] A nonce can be consumed exactly once — second attempt returns 401.
- [ ] A nonce expires after 10 minutes — verification with a nonce issued 10+ minutes ago returns 401.
- [ ] A nonce issued 9 minutes and 59 seconds ago can still be consumed (boundary test).

#### Concurrent Nonce Consumption

- [ ] Two simultaneous `POST /api/auth/key/verify` requests with the same nonce result in exactly one 200 and one 401.

#### Closed Alpha

- [ ] With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true` and wallet NOT on whitelist, new user creation returns 403.
- [ ] With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true` and wallet on whitelist, new user creation succeeds.
- [ ] With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true`, admin users bypass the whitelist check.
- [ ] With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true`, existing non-admin user removed from whitelist gets 403 on next sign-in.
- [ ] With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=false`, any wallet can sign in regardless of whitelist.

#### Configuration Errors

- [ ] With no `KeyAuthVerifier` configured, verify returns 500 "key auth verifier is not configured".
- [ ] With empty `CODEPLANE_AUTH_KEY_AUTH_DOMAIN`, verify returns 500 "key auth domain is not configured".

#### Input Size Boundaries

- [ ] A message of exactly 4096 bytes with valid signature succeeds (maximum valid size).
- [ ] A message of 4097 bytes returns 400 (exceeds maximum).
- [ ] A signature of exactly 2048 bytes (if otherwise valid) is accepted.
- [ ] A signature of 2049 bytes returns 400 (exceeds maximum).

#### Session and Token Properties

- [ ] Session cookie expiration matches the configured `CODEPLANE_AUTH_SESSION_DURATION`.
- [ ] Default session duration is 720 hours when `CODEPLANE_AUTH_SESSION_DURATION` is not set.
- [ ] Custom session duration (e.g., `"24h"`) is respected.
- [ ] CSRF token is exactly 64 hex characters.
- [ ] Custom `CODEPLANE_AUTH_SESSION_COOKIE_NAME` is used for the session cookie name.
- [ ] Empty `CODEPLANE_AUTH_SESSION_COOKIE_NAME` falls back to `codeplane_session`.

### Playwright (Web UI) E2E Tests

- [ ] Login page shows a "Sign in with Key" button.
- [ ] Clicking "Sign in with Key" triggers a nonce request (visible in network tab or mocked).
- [ ] After signing, the UI shows a loading/verifying state.
- [ ] Successful sign-in redirects to the dashboard.
- [ ] Failed sign-in (invalid signature) shows an inline error message.
- [ ] Failed sign-in (expired nonce) shows an appropriate error message.
- [ ] Failed sign-in (not whitelisted) shows the closed alpha message.
- [ ] The sign-in button is keyboard-accessible (Tab + Enter).
- [ ] Error messages have appropriate ARIA attributes for screen readers.
- [ ] Signing in via key auth and then navigating to profile shows the wallet-derived username.

### CLI E2E Tests

- [ ] `codeplane auth status` with a token obtained via key auth shows the authenticated user.
- [ ] The token obtained via `/api/auth/key/token` works for all expected CLI operations (repo list, issue list, etc.).

### Security Integration Tests

- [ ] Rate limiting on `/api/auth/key/nonce` blocks excessive requests from a single IP.
- [ ] Rate limiting on `/api/auth/key/verify` blocks excessive requests from a single IP.
- [ ] A signature created for domain `evil.com` is rejected when verified against domain `codeplane.example.com`.
- [ ] The raw access token value is not stored in the database (only the SHA-256 hash is stored).
- [ ] Session keys do not appear in server log output.
- [ ] Wallet addresses do not appear in full in server log output (only prefixes).

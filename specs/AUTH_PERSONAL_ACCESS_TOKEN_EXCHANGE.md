# AUTH_PERSONAL_ACCESS_TOKEN_EXCHANGE

Specification for AUTH_PERSONAL_ACCESS_TOKEN_EXCHANGE.

## High-Level User POV

When you authenticate with Codeplane through a non-browser client — the CLI, a TUI, an AI agent, a CI runner, or a desktop application — you do not want session cookies. You need a durable access token that can be stored locally and reused for every subsequent API call. The Personal Access Token Exchange is the mechanism that makes this seamless: after you prove your identity through any supported authentication method, Codeplane automatically mints a fresh Personal Access Token and hands it directly back to you in the same response.

This exchange is what closes the loop on any non-browser sign-in flow. When you run `codeplane auth login` and complete the GitHub OAuth dance in your browser, you do not end up with a session cookie stuck in your browser. Instead, Codeplane exchanges that successful OAuth completion for a PAT and delivers it back to the CLI process through a secure local callback. When you sign in with a cryptographic key — as an AI agent or a developer using key-based auth — Codeplane exchanges the verified signature for a PAT in a single round-trip. In both cases, the result is the same: a `codeplane_`-prefixed token that you can use everywhere.

The exchange-issued token behaves identically to a manually created PAT. It has a name (automatically set to `"codeplane-cli"` for exchange-minted tokens), a set of scopes (defaulting to write access for repositories, user settings, and organizations), and the same security properties: it is hashed before storage, shown exactly once at issuance, and revocable at any time through the web UI or CLI. The only difference is that the user never had to visit a settings page, pick scopes, copy a token, or paste it somewhere — the exchange handles all of this automatically as part of the sign-in flow.

This feature is critical for Codeplane's agent-first architecture. AI agents authenticate programmatically via key-based challenge-response and receive a token they can immediately use. Desktop applications authenticate on first launch and store the exchanged token for the lifetime of the installation. CI pipelines can use key-based auth to bootstrap tokens without any manual setup step. The token exchange is what makes Codeplane's authentication model work across every client surface without forcing users into browser-only workflows.

## Acceptance Criteria

### Definition of Done

The feature is complete when every supported authentication method that targets a non-browser client can automatically exchange a successful authentication proof for a Personal Access Token, and the issued token is immediately usable for authenticated API requests across all Codeplane clients.

### Core Exchange Behavior

- [ ] The server MUST provide a token exchange endpoint at `POST /api/auth/key/token` that accepts a verified key-auth signature and returns a PAT.
- [ ] The GitHub OAuth callback (`GET /api/auth/github/callback`) MUST automatically create and deliver a PAT when the CLI callback cookie (`codeplane_cli_callback`) is present, instead of setting session cookies.
- [ ] The exchange-minted token MUST follow the standard PAT format: `codeplane_` prefix followed by exactly 40 lowercase hexadecimal characters (total length: 46 characters).
- [ ] The exchange MUST store only the SHA-256 hash of the token in the database — the raw token is never persisted server-side.
- [ ] The exchange MUST return the raw token exactly once in the response. It cannot be retrieved again after this response.
- [ ] Exchange-minted tokens MUST be automatically named `"codeplane-cli"`.
- [ ] Exchange-minted tokens MUST be automatically scoped to `["repo", "user", "org"]`, which normalize to `["write:repository", "write:user", "write:organization"]`.
- [ ] The exchanged token MUST be immediately usable for authenticated API requests after issuance — no activation delay.
- [ ] The exchanged token MUST appear in the user's token list (`GET /api/user/tokens`) alongside manually created tokens.
- [ ] The exchanged token MUST be revocable through the same mechanisms as manually created tokens (web UI, CLI, API).
- [ ] Multiple exchange operations by the same user MUST each produce a distinct token. Exchanges do not deduplicate or reuse previously issued tokens.

### Key Auth Token Exchange (`POST /api/auth/key/token`)

- [ ] The endpoint MUST accept a JSON body with `message` (string) and `signature` (string).
- [ ] If the request body is not valid JSON, the server MUST return `400 Bad Request` with message `"invalid request body"`.
- [ ] If `message` is missing, empty, or whitespace-only, the server MUST return `400 Bad Request` with `"message and signature are required"`.
- [ ] If `signature` is missing, empty, or whitespace-only, the server MUST return `400 Bad Request` with `"message and signature are required"`.
- [ ] On successful verification, the server MUST create a PAT and return `200 OK` with `{ "token": "codeplane_...", "username": "..." }`.
- [ ] The endpoint MUST NOT set session cookies or CSRF cookies — it returns only the token in the response body.
- [ ] The `Content-Type` of the response MUST be `application/json`.

### GitHub CLI OAuth Token Exchange (within `GET /api/auth/github/callback`)

- [ ] When the `codeplane_cli_callback` cookie is present during the OAuth callback, the server MUST create a PAT instead of setting session cookies.
- [ ] The token MUST be delivered via a redirect to `http://127.0.0.1:{port}/callback#token={token}&username={username}`.
- [ ] The token MUST be placed in the URL fragment (`#`), NOT in the query string (`?`), to prevent logging by intermediary servers, proxies, and browser history.
- [ ] Both the `codeplane_oauth_state` and `codeplane_cli_callback` cookies MUST be cleared after the exchange completes.
- [ ] The `token` and `username` values in the fragment MUST be URI-encoded.

### Exchange Token Lifecycle

- [ ] Exchange-minted tokens MUST NOT have an automatic expiration — they persist until explicitly revoked.
- [ ] Exchange-minted tokens MUST have their `last_used_at` timestamp updated asynchronously on each authenticated request, identical to manually created tokens.
- [ ] Revoking an exchange-minted token MUST take effect immediately — all subsequent requests using that token receive `401 Unauthorized`.
- [ ] If a user is deactivated (`is_active = false`) or suspended (`prohibit_login = true`) after a token has been exchanged, all of the user's tokens (including exchange-minted ones) MUST stop authenticating.

### Edge Cases

- [ ] If the key-auth verification step fails (invalid signature, expired nonce, consumed nonce), no token is created and the error is propagated directly — no partial token creation.
- [ ] If the OAuth flow fails after user authorization but before token creation (e.g., database error during user resolution), no token is created and the CLI receives an error redirect.
- [ ] If token creation fails after successful authentication verification (e.g., database write error), the server MUST return `500 Internal Server Error` — the authentication proof is consumed but no token is issued. The user must re-authenticate.
- [ ] If the user performs multiple key-auth token exchanges in rapid succession, each MUST succeed independently and create a separate token. The server MUST NOT reject or rate-limit based on existing token count (rate limiting is by IP on the auth endpoint, not by token count).
- [ ] If the same user performs both a key-auth exchange and a CLI OAuth exchange, both tokens coexist independently.
- [ ] An exchange-minted token with scopes `["repo", "user", "org"]` MUST be authorized for token management operations (since it includes `write:user`).
- [ ] Exchange-minted tokens MUST NOT receive privileged scopes (`admin`, `read:admin`, `write:admin`, `all`) regardless of whether the user is an admin. Exchange scopes are fixed at `["repo", "user", "org"]`.

### Boundary Constraints

- [ ] Token length: exactly 46 characters (`codeplane_` + 40 hex chars).
- [ ] Token character set: `codeplane_` followed by `[0-9a-f]` only (lowercase hex).
- [ ] Token name: exactly `"codeplane-cli"` (8 characters, within 255-char limit).
- [ ] Token scopes after normalization: `["write:organization", "write:repository", "write:user"]` (sorted, deduplicated).
- [ ] `message` field maximum length: 4096 bytes (enforced by key-auth verification layer).
- [ ] `signature` field maximum length: 512 bytes (enforced by key-auth verification layer).
- [ ] OAuth callback port range: 1024–65535 inclusive.

## Design

### API Shape

#### Key Auth Token Exchange — `POST /api/auth/key/token`

**Request:**

```http
POST /api/auth/key/token HTTP/1.1
Content-Type: application/json

{
  "message": "codeplane.app wants you to sign in with your key:\n0x71C7656EC7ab88b098defB751B7401B5f6d8976F\n\nSign in to Codeplane\n\nURI: https://codeplane.app\nVersion: 1\nChain ID: 1\nNonce: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4\nIssued At: 2026-03-21T12:00:00Z",
  "signature": "0x5f2c...9ab1"
}
```

**Success Response (200):**

```json
{
  "token": "codeplane_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  "username": "alice"
}
```

The response contains no cookies. The `token` field is the only credential delivery mechanism.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid JSON body | `{ "message": "invalid request body" }` |
| 400 | Missing/empty message or signature | `{ "message": "message and signature are required" }` |
| 401 | Invalid cryptographic signature | `{ "message": "invalid signature" }` |
| 401 | Nonce expired, consumed, or not found | `{ "message": "invalid or expired nonce" }` |
| 403 | Account suspended | `{ "message": "account is suspended" }` |
| 403 | Closed alpha — not whitelisted | `{ "message": "closed alpha access requires a whitelist invite" }` |
| 409 | Wallet address already in use | `{ "message": "wallet address is already in use" }` |
| 500 | Verifier not configured | `{ "message": "key auth verifier is not configured" }` |
| 500 | Domain not configured | `{ "message": "key auth domain is not configured" }` |
| 500 | Token creation failed | `{ "message": "failed to create access token" }` |

#### GitHub CLI OAuth Token Exchange (within `GET /api/auth/github/callback`)

This is not a standalone endpoint — it is the CLI-specific branch of the existing OAuth callback. When the `codeplane_cli_callback` cookie is present:

**Success Response (302):**

```http
HTTP/1.1 302 Found
Location: http://127.0.0.1:{port}/callback#token=codeplane_a1b2c3d4...&username=alice
Set-Cookie: codeplane_oauth_state=; Max-Age=-1; ...
Set-Cookie: codeplane_cli_callback=; Max-Age=-1; ...
```

The token and username are URI-encoded and placed exclusively in the URL fragment.

**Error Responses:** Same as the standard OAuth callback error table (400, 401, 403, 409, 500).

### SDK Shape

The exchange relies on two SDK-level operations composed together:

```typescript
// Step 1: Verify the authentication proof
interface AuthService {
  verifyKeyAuth(
    message: string,
    signature: string
  ): Promise<{ user: { id: number; username: string }; sessionKey: string; expiresAt: Date }>;
}

// Step 2: Create the token
interface AuthService {
  createToken(
    userId: number,
    req: { name: string; scopes: string[] }
  ): Promise<{
    id: number;
    name: string;
    tokenLastEight: string;
    scopes: string[];
    token: string; // raw token, shown once
  }>;
}
```

The exchange is the composition: `verifyKeyAuth` → `createToken`. The route handler orchestrates this — the SDK does not have a single `exchangeForToken` method. This is intentional: the verification and token creation steps are independently useful and independently testable.

The `createToken` method internally:
1. Generates 20 bytes of cryptographic randomness.
2. Encodes as 40-character lowercase hexadecimal.
3. Prepends `codeplane_` prefix.
4. Computes SHA-256 hash of the full token string.
5. Stores the hash, name, normalized scopes, and user ID.
6. Returns the raw token (never stored) alongside metadata.

### CLI Command

The CLI does not have a dedicated "exchange" command. The exchange is an implementation detail of the sign-in flows:

**Key-auth login (uses `POST /api/auth/key/token`):**
```bash
codeplane auth login --key
```
Sequence:
1. CLI calls `GET /api/auth/key/nonce` to obtain a nonce.
2. CLI constructs the structured message embedding the nonce.
3. CLI signs the message with the user's local private key.
4. CLI calls `POST /api/auth/key/token` — this is the exchange.
5. CLI receives `{ token, username }` in the response body.
6. CLI stores the token in the OS keyring keyed by hostname.
7. CLI prints: `Logged in to {host} as {username} via key`.

**GitHub OAuth login (uses exchange within OAuth callback):**
```bash
codeplane auth login
```
Sequence:
1. CLI starts local HTTP server on `127.0.0.1:0`.
2. CLI opens browser to `{apiUrl}/api/auth/github/cli?callback_port={port}`.
3. User authorizes on GitHub.
4. Server exchanges OAuth success for a PAT and redirects to `http://127.0.0.1:{port}/callback#token=...&username=...`.
5. CLI callback bridge extracts the token from the fragment.
6. CLI stores the token in the OS keyring.
7. CLI prints: `Logged in to {host} as {username} via browser`.

After either flow, the exchanged token is used transparently:
```bash
# These all use the exchanged token from the keyring
codeplane repo list
codeplane issue list --repo owner/repo
codeplane auth status  # Shows: Logged in as alice, source: keyring
codeplane auth token   # Prints the stored token to stdout
```

### TUI UI

The TUI does not implement the exchange flow directly. It relies on a token already being available through the CLI's token resolution order (`CODEPLANE_TOKEN` env var → OS keyring → config file). Users must authenticate via the CLI before using the TUI.

Once authenticated, the TUI's status bar displays the authenticated username obtained from the exchanged token.

### Desktop App

The desktop app uses the daemon's embedded PGLite database. On first launch, it initiates the OAuth flow through the embedded web UI. The exchange happens identically to the web flow, but the resulting session/token is stored in the daemon's local database. The desktop app does not use the CLI's keyring-based token storage.

### Editor Integrations (VS Code, Neovim)

Editor integrations authenticate through the daemon. If the daemon is not authenticated, the editors prompt the user to run `codeplane auth login` in a terminal. The exchanged token stored in the keyring is then available to the daemon, which serves authenticated requests to the editor.

### Web UI Design

The web UI does not trigger a token exchange directly — browser users use session cookies. However, exchange-minted tokens (named `"codeplane-cli"`) are visible in the **Settings → Tokens** page (`/settings/tokens`):

- Exchange tokens appear in the token list alongside manually created tokens.
- They are visually identical to user-created tokens: same columns for name, last-eight identifier, scopes (as tags/badges), last used, and created timestamps.
- Users can revoke exchange tokens from this page using the same revoke flow as any other token.
- If a user has accumulated multiple `"codeplane-cli"` tokens, each appears as a separate row with a distinct `token_last_eight` value.

### Documentation

The following end-user documentation MUST be written:

1. **"How Authentication Works"** — A conceptual guide explaining that Codeplane's non-browser sign-in flows automatically exchange authentication proofs for Personal Access Tokens. Should cover: what happens during `codeplane auth login`, why no manual token creation is needed, how the exchanged token is stored and used, and the relationship between exchange-minted tokens and manually created tokens.

2. **"CLI Authentication Reference"** — Must document both sign-in flows (`--key` and browser OAuth), the token resolution order, and how to verify authentication status. Should explicitly state that `codeplane auth login` creates a PAT automatically.

3. **"Agent Authentication Guide"** — Must document the key-auth token exchange flow for AI agents and automated systems, including: the full `nonce → sign → exchange` cycle, example requests and responses for `POST /api/auth/key/token`, and guidance on token storage and renewal.

4. **"Managing Access Tokens"** — Must explain that exchange-minted tokens (named `"codeplane-cli"`) appear alongside manually created tokens in the token list, and can be revoked the same way. Should advise users on when to revoke stale CLI tokens.

## Permissions & Security

### Authorization Roles

| Operation | Required Role | Notes |
|-----------|---------------|-------|
| Key auth token exchange (`POST /api/auth/key/token`) | Anonymous (unauthenticated) | This IS the authentication mechanism — the user proves identity via cryptographic signature |
| GitHub CLI OAuth token exchange (within callback) | Anonymous (unauthenticated) | The user proves identity via GitHub OAuth — the exchange is the terminal step |
| Use an exchange-minted token for API requests | Any authenticated user with active, non-suspended account | Same rules as any PAT |
| Revoke an exchange-minted token | Authenticated owner of the token | Same rules as any PAT |
| List exchange-minted tokens | Authenticated owner | Exchange-minted tokens appear in the same list as manually created tokens |

### Scope Enforcement on Exchange-Minted Tokens

- Exchange-minted tokens receive `write:repository`, `write:user`, `write:organization` scopes.
- These scopes are sufficient for all standard developer operations: repository access, issue management, landing request management, token self-management, and organization membership.
- Exchange-minted tokens do NOT receive admin scopes. Admin users who need admin-scoped tokens must create them manually through the token management UI or API.
- The `write:user` scope on exchange-minted tokens means they can be used to create additional tokens, list tokens, and revoke tokens. This is intentional — a CLI user should be able to manage their tokens using the token they logged in with.

### Rate Limiting

| Endpoint | Rate Limit | Window | Key | Purpose |
|----------|------------|--------|-----|--------|
| `POST /api/auth/key/token` | 5 requests | per minute | per IP | Prevent brute-force signature guessing |
| `GET /api/auth/github/cli` | 10 requests | per minute | per IP | Prevent OAuth initiation abuse |
| `GET /api/auth/github/callback` | 10 requests | per minute | per IP | Prevent callback replay attempts |
| Failed key-auth verification | 20 failures | per hour | per IP | After exceeding, IP is blocked from all key auth endpoints for 1 hour |

All rate-limited responses MUST return `429 Too Many Requests` with:
- `Retry-After` header indicating seconds until the limit resets
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers

### Data Privacy & PII Constraints

- **Token secrecy**: The raw token is transmitted exactly once (in the exchange response body or URL fragment) and is never stored in plaintext on the server. Only the SHA-256 hash is persisted.
- **Fragment-only delivery for OAuth**: The OAuth exchange delivers the token in the URL fragment (`#token=...`), which is never sent to the server by the browser, never logged by reverse proxies, and never stored in browser history.
- **No token logging**: The raw token value MUST NOT appear in any server log at any log level. The `Authorization` header value MUST be redacted in request logs.
- **Transport security**: Exchange responses should only be served over HTTPS in production. The CLI OAuth callback to `127.0.0.1` is the only exception (localhost is inherently local).
- **Nonce single-use**: The authentication nonce consumed during key-auth exchange cannot be replayed. This prevents an attacker who intercepts a signed message from re-exchanging it.
- **Wallet address storage**: Wallet addresses associated with key-auth exchanges are stored as pseudonymous identifiers. They are not classified as PII but should be treated with care.
- **GitHub profile data**: GitHub usernames and email addresses obtained during OAuth exchange are PII and are stored as part of the user record.
- **Token accumulation**: Each exchange creates a new token. Users should be advised to periodically review and revoke unused `"codeplane-cli"` tokens to minimize their credential surface area.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.token_exchange.completed` | A token exchange succeeds (any method) | `user_id`, `username`, `token_id`, `exchange_method` ("key_auth" or "github_cli_oauth"), `is_new_user` (bool), `scopes` (list), `client_ip_hash` (hashed), `timestamp` |
| `auth.token_exchange.failed` | A token exchange fails at the token creation step (auth succeeded but token creation errored) | `user_id`, `exchange_method`, `error_type`, `timestamp` |
| `auth.token_exchange.key_auth_succeeded` | Key-auth signature verified and token issued | `user_id`, `username`, `is_new_user`, `wallet_address_prefix` (first 10 chars), `timestamp` |
| `auth.token_exchange.key_auth_failed` | Key-auth exchange rejected (verification failed) | `failure_reason` ("invalid_signature", "expired_nonce", "used_nonce", "suspended", "alpha_denied"), `client_ip_hash`, `timestamp` |
| `auth.token_exchange.cli_oauth_succeeded` | GitHub CLI OAuth completed and token issued | `user_id`, `username`, `is_new_user`, `callback_port`, `timestamp` |
| `auth.token_exchange.cli_oauth_failed` | GitHub CLI OAuth exchange rejected | `failure_reason` ("invalid_state", "github_error", "suspended", "alpha_denied", "email_conflict", "token_creation_failed"), `timestamp` |
| `auth.token_exchange.token_first_used` | An exchange-minted token is used for the first time after issuance | `user_id`, `token_id`, `exchange_method`, `time_to_first_use_seconds`, `first_endpoint_path` |

### Funnel Metrics

| Metric | Definition | Target | What It Tells Us |
|--------|------------|--------|------------------|
| **Exchange success rate** | `auth.token_exchange.completed / (auth.token_exchange.completed + auth.token_exchange.failed + auth.token_exchange.key_auth_failed + auth.token_exchange.cli_oauth_failed)` | > 95% | Whether the exchange mechanism is reliable |
| **Time-to-first-use** | p50 of `time_to_first_use_seconds` on `auth.token_exchange.token_first_used` | < 60 seconds | Whether users immediately start using exchanged tokens |
| **Exchange method distribution** | Ratio of `key_auth` to `github_cli_oauth` in `exchange_method` | Tracked, no target | Which authentication method is preferred by CLI/agent users |
| **New user exchange rate** | % of exchanges where `is_new_user = true` | Growing | Whether token exchange is an effective onboarding path |
| **Exchange token revocation rate** | % of exchange-minted tokens revoked within 7 days | < 5% | Whether exchange tokens are durable and valued |
| **Exchange token accumulation** | Average number of `"codeplane-cli"` tokens per user | < 5 | Whether users are accumulating stale exchange tokens |
| **Token-to-active-use retention** | % of exchange tokens used at least once in the 30 days after creation | > 80% | Whether exchanged tokens represent real user engagement |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Key-auth token exchange started | `INFO` | `event=token_exchange_started`, `method=key_auth`, `request_id`, `client_ip` | Entry point log |
| Key-auth verification succeeded (pre-token) | `INFO` | `event=token_exchange_auth_verified`, `method=key_auth`, `user_id`, `username`, `wallet_address_prefix` | Auth step complete |
| Key-auth verification failed | `WARN` | `event=token_exchange_auth_failed`, `method=key_auth`, `reason`, `request_id`, `client_ip` | No token created |
| CLI OAuth token exchange started | `INFO` | `event=token_exchange_started`, `method=cli_oauth`, `request_id`, `callback_port` | Entry point log |
| CLI OAuth user resolved | `INFO` | `event=token_exchange_auth_verified`, `method=cli_oauth`, `user_id`, `username`, `is_new_user` | Auth step complete |
| Token creation succeeded | `INFO` | `event=token_exchange_token_created`, `method`, `user_id`, `token_id`, `token_name`, `scopes`, `token_last_eight` | Never log the raw token |
| Token creation failed | `ERROR` | `event=token_exchange_token_creation_failed`, `method`, `user_id`, `error` | Critical — auth succeeded but token wasn't issued |
| CLI OAuth redirect issued | `DEBUG` | `event=token_exchange_cli_redirect`, `callback_port`, `username` | Token delivered via redirect |
| Exchange rate limited | `WARN` | `event=token_exchange_rate_limited`, `method`, `client_ip`, `rate_limit_key` | Abuse signal |
| Cookies cleared after CLI exchange | `DEBUG` | `event=token_exchange_cookies_cleared`, `cookies` | Cleanup confirmation |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_token_exchange_total` | Counter | `method` (key_auth, cli_oauth), `result` (success, auth_failed, token_creation_failed) | Total exchange attempts by method and result |
| `codeplane_token_exchange_duration_seconds` | Histogram | `method`, `result` | End-to-end exchange latency (from request to token issued). Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 |
| `codeplane_token_exchange_token_creation_duration_seconds` | Histogram | `method` | Time to create the token after auth verification succeeds. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25 |
| `codeplane_token_exchange_auth_failure_total` | Counter | `method`, `reason` (invalid_signature, expired_nonce, used_nonce, suspended, alpha_denied, invalid_state, github_error, email_conflict) | Exchange auth failures by reason |
| `codeplane_token_exchange_new_users_total` | Counter | `method` | New users created as part of exchange |
| `codeplane_token_exchange_rate_limited_total` | Counter | `method`, `endpoint` | Rate-limited exchange requests |

### Alerts

#### Alert: `TokenExchangeHighFailureRate`
- **Condition**: `rate(codeplane_token_exchange_total{result!="success"}[5m]) / rate(codeplane_token_exchange_total[5m]) > 0.3` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_token_exchange_total` by `method` and `result` labels to identify whether failures are in key-auth or CLI OAuth exchanges.
  2. Check `codeplane_token_exchange_auth_failure_total` by `reason` to identify the dominant failure mode.
  3. If `reason=invalid_signature` is dominant on key-auth: Check for client SDK version mismatches. Verify `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` matches what clients expect. Check if a signing library update changed behavior.
  4. If `reason=expired_nonce` is dominant: Check server clock synchronization (NTP). Check if network latency is causing nonces to expire before they can be used. Consider extending the nonce TTL.
  5. If `reason=github_error` is dominant on CLI OAuth: Check GitHub API status at https://www.githubstatus.com/. Verify GitHub OAuth app credentials are valid.
  6. If `reason=invalid_state` is dominant: Check for clock skew between server instances. Verify shared database for OAuth state records.
  7. If `result=token_creation_failed`: This is critical — auth succeeded but tokens couldn't be created. Check database write health immediately (see `TokenExchangeCreationFailure` alert).

#### Alert: `TokenExchangeCreationFailure`
- **Condition**: Any `codeplane_token_exchange_total{result="token_creation_failed"}` increment within 1 minute.
- **Severity**: Critical
- **Runbook**:
  1. This is the worst failure mode — the user successfully authenticated but did not receive a token. They cannot retry without re-authenticating (nonce is consumed / OAuth state is consumed).
  2. Check server logs for `event=token_exchange_token_creation_failed` to get the specific error.
  3. Check database connectivity and write health. Check the `access_tokens` table for constraint violations, disk space, or connection pool exhaustion.
  4. Check if the `access_tokens` table has reached any storage or row count limits.
  5. If the database is healthy, check the token generation code path for runtime errors (e.g., `crypto.getRandomValues` failures, which would indicate a fundamental runtime issue).
  6. Manually verify that affected users can still authenticate and get tokens by retrying. If not, consider creating tokens for them via admin tooling.

#### Alert: `TokenExchangeLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_token_exchange_duration_seconds_bucket[5m])) > 3.0` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_token_exchange_token_creation_duration_seconds` to determine if the latency is in token creation or auth verification.
  2. If token creation is slow: Check database write latency on the `access_tokens` table. Check for table locks or index bloat.
  3. If auth verification is slow (key-auth): Check the `KeyAuthVerifier` implementation for CPU-bound signature verification delays. Check database latency on nonce consumption.
  4. If auth verification is slow (CLI OAuth): Check `codeplane_auth_github_code_exchange_duration_seconds` for GitHub API latency. This is an upstream dependency.
  5. Check overall server CPU and memory load.

#### Alert: `TokenExchangeRateLimitSpike`
- **Condition**: `rate(codeplane_token_exchange_rate_limited_total[5m]) > 20` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check access logs for IP addresses being rate-limited on exchange endpoints.
  2. If a single IP: Likely a misconfigured agent or automation script retrying in a tight loop. Check if it's a known CI IP.
  3. If distributed across IPs: Possible credential stuffing or brute-force attack against the key-auth exchange. Consider temporarily blocking at the load balancer.
  4. If legitimate traffic: A deployment or onboarding wave may be legitimately triggering many exchanges. Consider temporarily increasing rate limits.

### Error Cases and Failure Modes

| Failure Mode | Impact | Behavior | Recovery |
|-------------|--------|----------|----------|
| Database unavailable during token creation | Auth succeeds but no token issued | Return `500 Internal Server Error` | User must re-authenticate; nonce/OAuth state is consumed |
| `crypto.getRandomValues` failure | Token generation impossible | Return `500`; log critical error | Runtime environment issue — restart process |
| SHA-256 hash computation failure | Token cannot be stored | Return `500`; log critical error | Runtime environment issue — restart process |
| Database unique constraint on token hash (astronomically unlikely) | Token creation fails | Return `500`; retry with new random value | Retry is safe — generate new randomness |
| Network error after token creation but before response delivery | Token exists in DB but user never received it | Token is orphaned; user must re-authenticate and create a new one | User can revoke the orphaned token later by `token_last_eight` |
| Key-auth verifier not configured | All key-auth exchanges fail | Return `500` with `"key auth verifier is not configured"` | Admin must configure the key-auth verifier |
| GitHub OAuth not configured | All CLI OAuth exchanges fail | Return `500` with `"github oauth is not configured"` | Admin must configure GitHub OAuth credentials |
| CLI local callback server unreachable | Token created on server but CLI never receives it | Token is orphaned; CLI times out after 5 minutes | User retries `codeplane auth login`; orphaned token can be revoked |
| Concurrent exchanges with same nonce | Exactly one succeeds, others fail | Nonce is atomically consumed | Failing clients retry with a new nonce |

## Verification

### API Integration Tests — Key Auth Token Exchange

#### Happy Path
- [ ] **Valid key-auth exchange**: Request nonce → construct message → sign → `POST /api/auth/key/token` → returns `200` with `token` matching `^codeplane_[0-9a-f]{40}$` and `username` as a non-empty string.
- [ ] **Exchanged token is immediately usable**: Use the token from the exchange response as `Authorization: Bearer codeplane_...` on `GET /api/user` → returns `200` with the same username.
- [ ] **Exchanged token appears in token list**: After exchange, call `GET /api/user/tokens` with the exchanged token → response includes a token with `name: "codeplane-cli"` and scopes including `write:repository`, `write:user`, `write:organization`.
- [ ] **Exchange for new user (auto-creation)**: Use a wallet address with no existing account → returns `200`, creates user with `wallet-XXXXXXXX` username pattern.
- [ ] **Exchange for existing user**: Create a user via key-auth, then perform another exchange with the same wallet → returns `200` with the same `username`, creates a new distinct token.
- [ ] **Multiple exchanges create distinct tokens**: Perform two key-auth exchanges for the same user → both succeed, each returns a different token, both tokens work independently, token list shows two `"codeplane-cli"` entries.
- [ ] **Exchange does not set cookies**: Inspect the response headers of `POST /api/auth/key/token` → no `Set-Cookie` headers present.

#### Input Validation
- [ ] **Empty JSON body**: `POST /api/auth/key/token` with `{}` → `400` with `"message and signature are required"`.
- [ ] **Non-JSON body**: `POST /api/auth/key/token` with plain text → `400` with `"invalid request body"`.
- [ ] **Missing message field**: `POST /api/auth/key/token` with `{"signature": "0xabc"}` → `400`.
- [ ] **Missing signature field**: `POST /api/auth/key/token` with `{"message": "hello"}` → `400`.
- [ ] **Whitespace-only message**: `POST /api/auth/key/token` with `{"message": "   ", "signature": "0xabc"}` → `400`.
- [ ] **Whitespace-only signature**: `POST /api/auth/key/token` with `{"message": "hello", "signature": "   "}` → `400`.
- [ ] **Message at maximum valid length (4096 bytes)**: Construct a valid message of exactly 4096 bytes, sign it, exchange → succeeds (assuming valid signature).
- [ ] **Message exceeding maximum length (4097 bytes)**: `POST /api/auth/key/token` with a 4097-byte message → `400`.
- [ ] **Signature at maximum valid length (512 bytes)**: Exchange with a 512-byte signature → succeeds (assuming valid).
- [ ] **Signature exceeding maximum length (513 bytes)**: Exchange with a 513-byte signature → `400`.
- [ ] **Extra fields in body**: `POST /api/auth/key/token` with `{"message": "...", "signature": "...", "extra": true}` → succeeds (extra fields ignored).

#### Authentication Failures
- [ ] **Invalid signature (wrong key)**: Sign message with key A but embed key B's address → `401` with `"invalid signature"`. No token created.
- [ ] **Expired nonce**: Request nonce, wait for 10-minute expiration (or mock clock), then exchange → `401` with `"invalid or expired nonce"`. No token created.
- [ ] **Already consumed nonce**: Exchange with a nonce, then attempt a second exchange with the same nonce → first succeeds, second returns `401`. Only one token created.
- [ ] **Nonce never issued**: Exchange with a fabricated nonce → `401`.
- [ ] **Concurrent exchanges with same nonce**: Send two concurrent `POST /api/auth/key/token` requests with the same signed nonce → exactly one returns `200` with a token, the other returns `401`.

#### Account State
- [ ] **Suspended user exchange**: Exchange for a user with `prohibit_login = true` → `403` with `"account is suspended"`. No token created.
- [ ] **Inactive user exchange**: Exchange for a user with `is_active = false` → `401`. No token created.
- [ ] **Closed alpha — unlisted user**: With closed alpha enabled, exchange with an unlisted wallet address → `403`. No token created.
- [ ] **Closed alpha — whitelisted user**: With closed alpha enabled, exchange with a whitelisted wallet → `200` with token.
- [ ] **Closed alpha — admin bypass**: Admin user exchanges even if not whitelisted → `200` with token.

#### Configuration Errors
- [ ] **Verifier not configured**: When `KeyAuthVerifier` is null, `POST /api/auth/key/token` → `500` with `"key auth verifier is not configured"`.
- [ ] **Domain not configured**: When `CODEPLANE_AUTH_KEY_AUTH_DOMAIN` is empty → `500` with `"key auth domain is not configured"`.

### API Integration Tests — GitHub CLI OAuth Token Exchange

#### Happy Path
- [ ] **Full CLI OAuth exchange**: Initiate `GET /api/auth/github/cli?callback_port=12345` → complete GitHub OAuth → callback redirects to `http://127.0.0.1:12345/callback#token=codeplane_...&username=...`.
- [ ] **Token in fragment not query**: Verify the redirect URL uses `#` for token delivery, not `?`.
- [ ] **Token format valid**: The token in the fragment matches `^codeplane_[0-9a-f]{40}$`.
- [ ] **Token is usable**: Use the token from the fragment as `Authorization: Bearer codeplane_...` on `GET /api/user` → `200`.
- [ ] **Cookies cleared**: After successful CLI OAuth exchange, both `codeplane_oauth_state` and `codeplane_cli_callback` cookies are cleared (max-age=-1).
- [ ] **Token has correct name**: The created token's name is `"codeplane-cli"`.
- [ ] **Token has correct scopes**: The created token's scopes normalize to `["write:organization", "write:repository", "write:user"]`.

#### Error Cases
- [ ] **Suspended user**: User with `prohibit_login = true` completes GitHub OAuth → `403`.
- [ ] **Closed alpha denied**: Unlisted user completes GitHub OAuth with closed alpha enabled → `403`.
- [ ] **Invalid OAuth state**: Callback with a state that doesn't match any DB record → `401`.
- [ ] **Expired OAuth state**: Callback after 10-minute state expiration → `401`.
- [ ] **Replayed OAuth state**: Complete one OAuth flow, then replay the state → `401`.

### Token Lifecycle Tests (Post-Exchange)

- [ ] **Exchange token in list**: After exchange, `GET /api/user/tokens` includes the exchange-minted token. Response does NOT include the raw token — only `token_last_eight`.
- [ ] **Exchange token revocation**: Revoke an exchange-minted token via `DELETE /api/user/tokens/:id` → `204`. Use the revoked token → `401`.
- [ ] **Immediate revocation**: Revoke an exchange-minted token and immediately (within 100ms) attempt to use it → `401`.
- [ ] **Exchange token last_used_at**: Use an exchange-minted token, then list tokens → `last_used_at` is populated and recent.
- [ ] **User deactivation invalidates exchange token**: Exchange a token, then deactivate the user → use the token → `401`.
- [ ] **User suspension invalidates exchange token**: Exchange a token, then set `prohibit_login = true` → use the token → `401`.
- [ ] **Exchange token scope enforcement**: Use an exchange-minted token (scoped to repo/user/org) on an admin endpoint → `403`.
- [ ] **Exchange token can create manual tokens**: Use an exchange-minted token (which has `write:user`) to `POST /api/user/tokens` with custom name/scopes → `201`.

### CLI End-to-End Tests

- [ ] **`codeplane auth login --key` full flow**: Complete key-auth exchange → `codeplane auth status` shows logged in with correct username → `codeplane auth token` prints the stored token.
- [ ] **`codeplane auth login` browser flow**: Complete GitHub OAuth exchange → `codeplane auth status` shows logged in → token is stored in keyring.
- [ ] **Exchanged token used by subsequent commands**: After `codeplane auth login`, run `codeplane repo list` → succeeds without requiring additional authentication.
- [ ] **Token stored in keyring by hostname**: After login, `codeplane auth token --hostname {host}` returns the exchanged token.
- [ ] **Exchange token revoked via CLI**: `codeplane auth token list` shows the exchange token → `codeplane auth token delete <id> --yes` → token removed from list.
- [ ] **Multiple exchanges via CLI**: Run `codeplane auth login --key` twice → `codeplane auth token list` shows two `"codeplane-cli"` tokens. The keyring stores the latest one.
- [ ] **CODEPLANE_TOKEN overrides exchanged token**: Set `CODEPLANE_TOKEN` env var to a different token → `codeplane auth status` uses the env token, not the keyring token.

### Playwright (Web UI) E2E Tests

- [ ] **Exchange tokens visible in Settings → Tokens**: After authenticating via CLI exchange, navigate to `/settings/tokens` → exchange-minted token with name `"codeplane-cli"` is visible in the list.
- [ ] **Revoke exchange token via UI**: Click Revoke on a `"codeplane-cli"` token → confirmation dialog → confirm → token removed from list.
- [ ] **Multiple exchange tokens displayed**: If user has multiple `"codeplane-cli"` tokens, all appear in the list with distinct `token_last_eight` values.

### Rate Limiting Tests

- [ ] **Key-auth exchange rate limit**: Send 6 `POST /api/auth/key/token` requests from the same IP within 1 minute → the 6th returns `429` with `Retry-After` header.
- [ ] **Rate limit does not block different IPs**: While IP A is rate-limited, IP B can still exchange successfully.
- [ ] **Rate limit headers present on exchange responses**: Any `POST /api/auth/key/token` response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Security-Focused Tests

- [ ] **Exchange token not in server logs**: Complete a token exchange, then search all server log output → the raw token string does not appear in any log line.
- [ ] **Token hash stored, not raw**: After exchange, query the `access_tokens` database table → `token_hash` contains a SHA-256 hash; no column contains the raw `codeplane_...` token.
- [ ] **OAuth exchange token not in query string**: Capture the 302 redirect from CLI OAuth exchange → the `Location` header contains `#token=...`, NOT `?token=...`.
- [ ] **Exchange response does not leak other users' data**: The exchange response contains only `token` and `username` — no other user data, no other tokens.
- [ ] **Nonce cannot be replayed for exchange**: After consuming a nonce in a successful exchange, attempting to reuse the same signed message in another exchange → `401`.

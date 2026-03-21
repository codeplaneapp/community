# AUTH_CLI_BROWSER_LOGIN

Specification for AUTH_CLI_BROWSER_LOGIN.

## High-Level User POV

When a developer wants to use the Codeplane CLI for the first time, they need to authenticate. The CLI browser login flow provides the most natural and secure way to do this: the developer types `codeplane auth login` in their terminal, and Codeplane automatically opens their default web browser to a GitHub sign-in page. The user authorizes Codeplane through GitHub's familiar OAuth consent screen, and once complete, the browser displays a branded success page confirming their identity. Back in the terminal, the CLI immediately confirms the login and stores the credential securely in the operating system's native keychain — macOS Keychain, Linux Secret Service, or Windows Credential Locker — so the user never has to handle or paste tokens manually.

This flow supports multiple Codeplane instances. A developer working against both a company's self-hosted Codeplane and the public Codeplane service can authenticate to each independently using `codeplane auth login --hostname my-company.codeplane.dev`. Each hostname's credential is stored separately in the keychain, and the CLI remembers the API URL for future commands.

The browser login is the default and recommended authentication path. For headless environments like CI servers where no browser is available, the CLI also supports a `--with-token` flag that reads a pre-generated personal access token from stdin, but the browser flow is the primary human-facing experience.

After logging in, all subsequent CLI commands — creating repositories, filing issues, triggering workflows, managing workspaces — authenticate seamlessly using the stored credential. Users can check their authentication status at any time with `codeplane auth status`, view or pipe their token with `codeplane auth token`, and log out cleanly with `codeplane auth logout`.

## Acceptance Criteria

### Definition of Done

- [ ] Running `codeplane auth login` with no flags opens the user's default browser to the GitHub OAuth flow and, upon completion, stores a valid personal access token in the OS keychain.
- [ ] The CLI prints the authenticated username and hostname to stderr upon successful login.
- [ ] The credential is stored per-hostname in the OS-native secure credential store.
- [ ] The feature works on macOS (Keychain), Linux (Secret Service/D-Bus), and Windows (PasswordVault).
- [ ] Running `codeplane auth status` after login confirms the authenticated user and token source.
- [ ] Running `codeplane auth logout` removes the stored credential for the target hostname.

### Functional Constraints

- [ ] The CLI must start a temporary HTTP server bound exclusively to `127.0.0.1` on an ephemeral port (OS-assigned, port 0).
- [ ] The local callback server must only accept requests to the `/callback` path; all other paths must return 404.
- [ ] The local callback server must accept both GET and POST methods on `/callback` to support the two-phase bridge flow.
- [ ] The login URL format must be `{apiUrl}/api/auth/github/cli?callback_port={port}`.
- [ ] The `callback_port` parameter must be validated server-side as an integer in the range 1024–65535.
- [ ] The OAuth state cookie (`codeplane_oauth_state`) must be set as HTTPOnly, SameSite=Lax, and with a 10-minute expiry.
- [ ] The CLI callback port cookie (`codeplane_cli_callback`) must be set as HTTPOnly, SameSite=Lax, secure=false (localhost flow).
- [ ] The server must deliver the token via URL fragment (`#token=...&username=...`), never in the query string, to prevent intermediary logging.
- [ ] The CLI must validate that all received tokens start with the `codeplane_` prefix before storing.
- [ ] The CLI must time out after 5 minutes if no callback is received, with a clear error message.
- [ ] Only the first callback received must be processed; subsequent callbacks must be ignored (idempotency guard via `finished` flag).
- [ ] OAuth state must be consumed atomically on the server to prevent replay attacks.
- [ ] Both OAuth cookies (`codeplane_oauth_state` and `codeplane_cli_callback`) must be cleared after callback completion regardless of success or failure.
- [ ] The token created server-side must have name `"codeplane-cli"` and scopes `["repo", "user", "org"]`.
- [ ] If the browser cannot be opened automatically, the CLI must print the login URL to stderr so the user can manually navigate.
- [ ] The `--hostname` flag must accept both bare hostnames (e.g., `my.codeplane.dev`) and full API URLs (e.g., `https://api.my.codeplane.dev`).
- [ ] Loopback hostnames (`localhost`, `127.x.x.x`, `[::1]`) must default to `http://` rather than `https://`.
- [ ] Non-loopback bare hostnames must be prefixed with `api.` and default to `https://`.
- [ ] After storing the keyring credential, the CLI must persist the resolved API URL to `~/.config/codeplane/config.toon`.
- [ ] If a legacy config-file token exists for the same host, it must be scrubbed after keyring storage succeeds.

### Edge Cases

- [ ] If the OS keyring is unavailable (`CODEPLANE_DISABLE_SYSTEM_KEYRING=1` or missing tooling), `storeToken` must throw `SecureStorageUnavailableError` with guidance to use `CODEPLANE_TOKEN`.
- [ ] If the `CODEPLANE_TOKEN` environment variable is set, `auth status` must report it as the active token source (`"CODEPLANE_TOKEN env"`), even if a keyring token also exists.
- [ ] If the user is on the closed-alpha whitelist enforcement list and not whitelisted, the server must reject the OAuth completion and the CLI must surface the error.
- [ ] If the user's account is suspended (`prohibitLogin=true`), the server must reject the OAuth completion.
- [ ] An empty `callback_port` parameter must return HTTP 400 from the server.
- [ ] A `callback_port` of `0`, `1023`, `65536`, or non-numeric values must return HTTP 400.
- [ ] If the GitHub OAuth `code` or `state` query parameters are missing from the callback, the server must return HTTP 400.
- [ ] If the OAuth state verifier cookie is missing or does not match, the server must reject the callback.
- [ ] If the local callback server receives a POST with an empty or missing `token` field, it must reject and propagate an error.
- [ ] If the local callback server receives a token that does not start with `codeplane_`, it must reject with HTTP 400 and propagate a validation error to the CLI.
- [ ] If the hostname argument is an empty string after trimming, the CLI must throw an error.
- [ ] Multiple concurrent `codeplane auth login` invocations for the same host must each get their own ephemeral port and independent OAuth state; neither should corrupt the other.

### Boundary Constraints

- [ ] Token format: `codeplane_` prefix followed by 40 hexadecimal characters (46 characters total).
- [ ] OAuth state verifier: 32 hexadecimal characters (16 bytes of randomness).
- [ ] CSRF token: 64 hexadecimal characters (32 bytes of randomness).
- [ ] Callback port range: 1024–65535 inclusive.
- [ ] Browser login timeout: exactly 300,000 milliseconds (5 minutes).
- [ ] OAuth state TTL: exactly 600,000 milliseconds (10 minutes).
- [ ] Hostname normalization: case-insensitive, trimmed, stored lowercase in keyring.
- [ ] PAT name: fixed string `"codeplane-cli"` (no user-configurable name in this flow).
- [ ] PAT scopes: fixed array `["repo", "user", "org"]`.

## Design

### CLI Command

**`codeplane auth login`**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--with-token` | boolean | `false` | Read a pre-generated PAT from stdin instead of launching the browser flow |
| `--hostname` | string | (from config or `https://api.codeplane.app`) | Target Codeplane hostname or full API URL |

**Default behavior (browser flow):**

1. Resolve the target API URL and host from `--hostname` or saved config.
2. Start an ephemeral HTTP server on `127.0.0.1:0`.
3. Construct the login URL: `{apiUrl}/api/auth/github/cli?callback_port={port}`.
4. Print to stderr: `Opening browser for Codeplane login at {host}`.
5. Print fallback to stderr: `If it does not open, visit:\n{loginUrl}`.
6. Attempt to open the URL using the platform browser launcher (`open` on macOS, `xdg-open`/`gio` on Linux, `cmd.exe /c start` on Windows).
7. Wait up to 5 minutes for the callback.
8. On callback: validate token, store in keyring, persist API URL to config, clear any legacy config-file token.
9. Print to stderr: `Logged in to {host} as {username} via browser`.
10. Return structured JSON: `{ status: "logged_in", host, user, token_source: "keyring", message }`.

**`--with-token` behavior:**

1. Read all of stdin.
2. Trim and validate the `codeplane_` prefix.
3. Store in keyring, persist API URL.
4. Print to stderr: `Logged in to {host} via keyring`.

**`codeplane auth logout`**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--hostname` | string | (from config) | Target Codeplane hostname to log out from |

Removes the keyring credential and any legacy config-file token for the target host. If `CODEPLANE_TOKEN` is set in the current shell, warns the user that the env var is still active.

**`codeplane auth status`**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--hostname` | string | (from config) | Target Codeplane hostname to inspect |

Resolves the token via the priority chain (env → keyring → config file), then validates it against `GET /api/user`. Reports: `logged_in`, `api_url`, `host`, `token_set`, `user`, `token_source`, and a human-readable `message`.

**`codeplane auth token`**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--hostname` | string | (from config) | Target Codeplane hostname |

Prints the active token to stdout (for piping). Prints the token source to stderr.

### API Shape

**`GET /api/auth/github/cli`**

Initiates the CLI-specific GitHub OAuth flow.

| Parameter | Location | Required | Validation |
|-----------|----------|----------|------------|
| `callback_port` | query | yes | Integer, 1024–65535 |

Response: HTTP 302 redirect to GitHub OAuth authorize URL.

Side effects:
- Sets `codeplane_oauth_state` cookie (HTTPOnly, SameSite=Lax, 10 min TTL).
- Sets `codeplane_cli_callback` cookie with port value (HTTPOnly, SameSite=Lax, secure=false, 10 min TTL).

Error responses:
- `400` if `callback_port` is missing, non-numeric, or out of range.

**`GET /api/auth/github/callback`**

Handles GitHub's OAuth redirect. Behavior branches based on the presence of the `codeplane_cli_callback` cookie.

| Parameter | Location | Required |
|-----------|----------|----------|
| `code` | query | yes |
| `state` | query | yes |

**CLI branch** (when `codeplane_cli_callback` cookie is present):
1. Complete OAuth exchange with GitHub.
2. Create PAT with name `"codeplane-cli"`, scopes `["repo", "user", "org"]`.
3. Redirect to `http://127.0.0.1:{port}/callback#token={token}&username={username}`.
4. Clear both OAuth cookies.

**Web branch** (no CLI cookie):
1. Complete OAuth exchange.
2. Set session cookie and CSRF cookie.
3. Redirect to the saved redirect URL or `/`.

### Web UI Design (Callback Bridge)

The CLI hosts two dynamically-generated HTML pages on the local callback server:

**Callback Bridge Page** (served on GET `/callback` when no token is in query params):
- Title: "Completing Codeplane login..."
- Heading: "Completing login for {host}..."
- Subtext: "You can close this tab after the CLI confirms the login."
- Embedded JavaScript extracts `token` and `username` from `window.location.hash`, POSTs them as JSON to `/callback`.
- On success: replaces the page content with the Success Page HTML.
- On failure: shows "Login failed" with the error message.

**Success Page** (served after token is received and validated):
- Title: "Codeplane login complete"
- Heading: "Logged in as {username}" (or "Logged in" if username unavailable).
- Body: "Your Codeplane CLI token for `{host}` has been stored securely."
- Subtext: "You can close this tab and return to the terminal."
- Styled with Codeplane's warm, minimal branding (#f4f1ea background, #fffdf7 panel, #1b2a2f text).

Both pages HTML-escape all dynamic values (`&`, `<`, `>`, `"`, `'`) to prevent XSS.

### SDK Shape

**Credential Storage (`credentials.ts`)**

| Function | Signature | Description |
|----------|-----------|-------------|
| `storeToken` | `(host: string, token: string) => void` | Stores token in OS keyring for the given host |
| `loadStoredToken` | `(host: string) => string \| null` | Retrieves token from OS keyring |
| `deleteStoredToken` | `(host: string) => boolean` | Removes token from OS keyring, returns whether it existed |

Platform backends:
- **macOS**: `security add-generic-password -U -s codeplane-cli -a {host} -w {token}`
- **Linux**: `secret-tool store --label="Codeplane CLI token" service codeplane-cli host {host}` (token piped to stdin)
- **Windows**: PowerShell `PasswordVault.Add()` with service `codeplane-cli`
- **Test**: `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` env var points to a JSON file with `{ host: token }` entries (mode 0o600)

**Auth State (`auth-state.ts`)**

| Function | Signature | Description |
|----------|-----------|-------------|
| `resolveAuthTarget` | `(options?) => AuthTarget` | Resolves API URL and host from flags/config |
| `resolveAuthToken` | `(options?) => ResolvedAuthToken \| null` | Resolves token via env → keyring → config chain |
| `requireAuthToken` | `(options?) => ResolvedAuthToken` | Like `resolveAuthToken` but throws if no token found |
| `persistAuthToken` | `(token, options?) => AuthTarget` | Stores to keyring, saves config, cleans legacy |
| `clearAuthToken` | `(options?) => AuthTarget & { cleared, legacy_cleared }` | Removes from keyring and legacy config |
| `getAuthStatus` | `(fetch?, options?) => AuthStatusResult` | Full status check including server verification |

### Documentation

The following end-user documentation must be written:

1. **CLI Authentication Guide**: A quickstart walkthrough of `codeplane auth login`, including what happens when you run the command (browser opens, GitHub OAuth, token stored), how to authenticate to a self-hosted instance (`--hostname`), how to check your status (`codeplane auth status`), how to log out (`codeplane auth logout`), and how to authenticate in CI/headless environments (`--with-token` and `CODEPLANE_TOKEN`).

2. **Multi-Instance Authentication**: Document that credentials are stored per-hostname, and how to switch between instances.

3. **Credential Storage**: Document where tokens are stored on each OS (Keychain, Secret Service, PasswordVault) and the `CODEPLANE_DISABLE_SYSTEM_KEYRING` escape hatch.

4. **Troubleshooting**: Common failure modes — browser won't open (print URL manually), keyring unavailable, timeout expired, OAuth state mismatch, suspended account.

## Permissions & Security

### Authorization Roles

- **Anonymous (unauthenticated)**: The only role that can initiate this flow. The user begins unauthenticated and becomes authenticated upon completion.
- No existing Codeplane role is required to trigger `codeplane auth login`.
- The resulting PAT is scoped to `["repo", "user", "org"]`, granting the same access level as the authenticated user's existing permissions on each resource.

### Rate Limiting

- **`GET /api/auth/github/cli`**: Rate-limited per source IP. Maximum 10 requests per minute per IP to prevent OAuth state exhaustion.
- **`GET /api/auth/github/callback`**: Rate-limited per source IP. Maximum 20 requests per minute per IP.
- **Token creation** (within `completeCLIOAuth`): Inherits the rate limit of the callback endpoint. No additional per-user limit needed since this is gated behind a successful OAuth exchange.
- **Local callback server**: No rate limiting needed — bound to loopback only and ephemeral.

### Security Constraints

- **Loopback binding**: The local HTTP server must bind exclusively to `127.0.0.1`, never `0.0.0.0` or `::`, to prevent network-adjacent attackers from intercepting the callback.
- **Fragment-based token delivery**: Tokens must be delivered in the URL fragment (`#token=...`), not the query string, to ensure they are never sent to the server in HTTP requests, logged by proxies, or captured in Referer headers.
- **Single-use OAuth state**: OAuth state records must be atomically consumed on the server side to prevent replay attacks.
- **Token prefix enforcement**: The CLI must reject any token not starting with `codeplane_` to prevent injection of arbitrary strings into the keyring.
- **HTML escaping**: All user-supplied values rendered in the callback bridge and success pages must be HTML-entity-escaped to prevent reflected XSS.
- **Cookie attributes**: OAuth state cookies must be HTTPOnly to prevent JavaScript access. CLI callback port cookies must also be HTTPOnly. Both use SameSite=Lax.
- **No token in logs**: The CLI must never print the token value to stderr or stdout during the login flow. Only the username and host are printed.
- **Secure keyring storage**: Tokens are stored in OS-native encrypted credential stores, never in plaintext config files.
- **Timeout enforcement**: The 5-minute timeout prevents indefinite listening on the loopback port.
- **Cookie cleanup**: Both OAuth cookies are cleared on completion or failure to prevent stale cookie reuse.

### PII / Data Privacy

- The username is displayed in the browser success page and CLI output. This is user-consented (they initiated the login).
- The GitHub OAuth exchange reveals the user's GitHub profile and email to Codeplane's server. This is governed by GitHub's OAuth consent and Codeplane's privacy policy.
- No PII is stored on the local filesystem beyond the token (in the encrypted keyring) and the API URL (in the config file).

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `cli_browser_login_initiated` | `host`, `platform` (`darwin`/`linux`/`win32`), `browser_opened` (boolean) | CLI starts the browser login flow |
| `cli_browser_login_completed` | `host`, `username`, `duration_ms`, `platform` | Token successfully received and stored |
| `cli_browser_login_failed` | `host`, `error_type` (`timeout`/`invalid_token`/`oauth_error`/`keyring_error`/`browser_launch_error`), `duration_ms`, `platform` | Login flow fails for any reason |
| `cli_browser_login_timeout` | `host`, `platform` | The 5-minute timeout elapses without callback |
| `cli_token_login_completed` | `host` | `--with-token` flow completes successfully |
| `cli_auth_status_checked` | `host`, `logged_in`, `token_source` | User runs `codeplane auth status` |
| `cli_logout_completed` | `host`, `credential_cleared` (boolean) | User runs `codeplane auth logout` |
| `oauth_cli_callback_completed` | `user_id`, `is_new_user` (boolean) | Server-side: CLI OAuth callback succeeds and PAT is created |

### Funnel Metrics

1. **Login Initiation → Completion Rate**: `cli_browser_login_completed / cli_browser_login_initiated`. Target: ≥ 90%.
2. **Timeout Rate**: `cli_browser_login_timeout / cli_browser_login_initiated`. Target: < 5%.
3. **Mean Login Duration**: Average `duration_ms` of `cli_browser_login_completed`. Target: < 30 seconds (median).
4. **Platform Distribution**: Breakdown of `platform` across all login events to track macOS / Linux / Windows adoption.
5. **Token vs Browser Login Ratio**: `cli_token_login_completed / (cli_token_login_completed + cli_browser_login_completed)`. Monitors headless vs interactive adoption.
6. **Repeat Login Rate**: Users who fire `cli_browser_login_initiated` more than once per 30 days, indicating credential loss or confusion.

## Observability

### Logging Requirements

**CLI-side (stderr, structured where `--json` is active):**

| Log | Level | Structured Context | When |
|-----|-------|-------------------|------|
| `Opening browser for Codeplane login at {host}` | INFO | `host`, `port`, `api_url` | Browser launch attempted |
| `If it does not open, visit: {loginUrl}` | INFO | `login_url` | Always, after browser launch attempt |
| `Browser could not be opened automatically: {error}` | WARN | `error`, `platform` | Browser launch fails |
| `Logged in to {host} as {username} via browser` | INFO | `host`, `username`, `token_source` | Login succeeds |
| `Timed out waiting for browser login on {host}` | ERROR | `host`, `timeout_ms` | 5-minute timeout reached |
| `OAuth callback did not include a token` | ERROR | `host` | POST callback missing token |
| `Invalid token` | ERROR | `host` | Token fails `codeplane_` prefix validation |

**Server-side (structured JSON logs):**

| Log | Level | Structured Context | When |
|-----|-------|-------------------|------|
| `CLI OAuth flow initiated` | INFO | `callback_port`, `request_id`, `client_ip` | `GET /api/auth/github/cli` hit |
| `OAuth state created` | DEBUG | `state_hash`, `expires_at`, `request_id` | OAuth state record saved |
| `CLI OAuth callback completing` | INFO | `user_id`, `username`, `callback_port`, `request_id` | `completeCLIOAuth` entered |
| `CLI PAT created` | INFO | `user_id`, `token_last_eight`, `scopes`, `request_id` | PAT successfully created |
| `CLI OAuth callback failed` | ERROR | `error`, `callback_port`, `request_id` | Any error in `completeCLIOAuth` |
| `OAuth state mismatch` | WARN | `request_id`, `client_ip` | State verifier doesn't match |
| `Invalid callback_port` | WARN | `raw_port`, `request_id`, `client_ip` | Port validation fails |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_oauth_initiated_total` | counter | `host` | Total CLI OAuth flows initiated |
| `codeplane_cli_oauth_completed_total` | counter | `host`, `is_new_user` | Total CLI OAuth flows completed successfully |
| `codeplane_cli_oauth_failed_total` | counter | `host`, `reason` (`timeout`, `state_mismatch`, `token_create_error`, `github_error`, `suspended`, `alpha_denied`) | Total CLI OAuth flows that failed |
| `codeplane_cli_oauth_duration_seconds` | histogram | `host` | Duration of the server-side OAuth callback processing (buckets: 0.1, 0.5, 1, 2, 5, 10s) |
| `codeplane_oauth_state_active` | gauge | | Number of unconsumed OAuth state records in the database |
| `codeplane_pat_created_total` | counter | `source` (`cli_oauth`, `key_auth`, `web`) | Total PATs created, partitioned by creation source |

### Alerts

**1. CLI OAuth Completion Rate Drop**

- **Condition**: `rate(codeplane_cli_oauth_completed_total[15m]) / rate(codeplane_cli_oauth_initiated_total[15m]) < 0.7` for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_cli_oauth_failed_total` by `reason` label to identify the dominant failure mode.
  2. If `reason=github_error`: Check GitHub's OAuth service status at https://www.githubstatus.com/. Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` environment variables are set and valid.
  3. If `reason=state_mismatch`: Check for clock skew between server instances (OAuth state TTL is 10 min). Verify cookie settings — browsers may be blocking SameSite=Lax cookies.
  4. If `reason=token_create_error`: Check database connectivity. Query `auth_tokens` table for unusual volume or constraint violations.
  5. If `reason=suspended` or `reason=alpha_denied`: Check if a recent admin action mass-suspended users or changed the whitelist.
  6. Check server error logs filtered by `request_id` for the failing requests.

**2. OAuth State Accumulation**

- **Condition**: `codeplane_oauth_state_active > 1000` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. This indicates OAuth flows are being initiated but not completed. Check if the GitHub OAuth callback URL is correctly configured.
  2. Verify the cleanup scheduler is running (`apps/server/src/index.ts` cleanup jobs).
  3. Manually inspect the OAuth state table: records older than 10 minutes should have been expired.
  4. Check if an automated scanner or bot is hitting `GET /api/auth/github/cli` repeatedly — review `codeplane_cli_oauth_initiated_total` rate and correlate with rate-limiter rejections.

**3. PAT Creation Failures**

- **Condition**: `rate(codeplane_cli_oauth_failed_total{reason="token_create_error"}[5m]) > 0` for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. This means users complete GitHub OAuth but the server cannot create a PAT. Check database connectivity immediately.
  2. Verify the `auth_tokens` table exists and accepts inserts.
  3. Check for unique constraint violations (e.g., token hash collisions — astronomically unlikely but log-worthy).
  4. Check server memory and disk — database may be under resource pressure.
  5. If using PGLite (daemon mode), verify the local database file is not corrupted.

**4. High CLI OAuth Latency**

- **Condition**: `histogram_quantile(0.95, codeplane_cli_oauth_duration_seconds) > 10` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check GitHub API response times — the OAuth code exchange calls GitHub's token endpoint.
  2. Check database query latency for OAuth state lookup and PAT creation.
  3. Review network egress to `github.com` from the server — DNS resolution, TLS handshake, and response time.
  4. If the server is behind a reverse proxy, check proxy buffering and timeout settings.

### Error Cases and Failure Modes

| Error | Source | User Impact | Handling |
|-------|--------|-------------|----------|
| Browser fails to open | CLI | User must manually navigate to printed URL | CLI prints URL to stderr, flow continues |
| 5-minute timeout | CLI | Login fails | CLI errors with descriptive message, local server stops |
| OAuth state mismatch | Server | Callback rejected, user sees error | Server clears cookies, returns error; user retries |
| GitHub OAuth denied/cancelled | GitHub | User not authenticated | GitHub redirects back with error; server returns error page |
| GitHub API outage | Server | Cannot exchange code for token | Server returns 500; CLI surfaces error |
| Keyring unavailable | CLI | Cannot store token | Throws `SecureStorageUnavailableError` with guidance |
| Token prefix validation failure | CLI | Login fails | CLI rejects token, surfaces validation error |
| Suspended account | Server | OAuth completes but login rejected | Server returns forbidden; CLI surfaces error |
| Alpha whitelist rejection | Server | New user cannot create account | Server returns forbidden; CLI surfaces error |
| Database unavailable | Server | Cannot create OAuth state or PAT | Server returns 500; CLI surfaces error |
| Duplicate callback race | CLI | Second callback ignored | `finished` flag ensures only first callback is processed |
| Port already in use | CLI | Unlikely (ephemeral), but server fails to start | Bun throws, CLI surfaces error |

## Verification

### API Integration Tests

1. **Happy path: CLI OAuth initiation** — `GET /api/auth/github/cli?callback_port=12345` returns HTTP 302 redirect to GitHub OAuth URL. Response sets `codeplane_oauth_state` cookie (HTTPOnly, SameSite=Lax). Response sets `codeplane_cli_callback` cookie with value `"12345"` (HTTPOnly, SameSite=Lax, secure=false).

2. **Missing callback_port** — `GET /api/auth/github/cli` (no query param) returns HTTP 400 with error `"callback_port is required"`.

3. **Invalid callback_port values** — `callback_port=abc` → 400. `callback_port=0` → 400. `callback_port=1023` → 400. `callback_port=65536` → 400. `callback_port=-1` → 400. `callback_port=1.5` → 400.

4. **Boundary callback_port values** — `callback_port=1024` → 302 (minimum valid). `callback_port=65535` → 302 (maximum valid).

5. **OAuth callback: CLI branch** — `GET /api/auth/github/callback?code=valid&state=valid` with `codeplane_cli_callback=12345` cookie and valid `codeplane_oauth_state` cookie → HTTP 302 redirect to `http://127.0.0.1:12345/callback#token=codeplane_...&username=...`. Verify redirect URL uses fragment `#`, not query string `?`. Verify both OAuth cookies are cleared in the response.

6. **OAuth callback: Web branch** — `GET /api/auth/github/callback?code=valid&state=valid` without `codeplane_cli_callback` cookie → HTTP 302 redirect to `/` (or saved redirect URL). Verify session cookie is set. Verify CSRF cookie is set.

7. **OAuth callback: Missing code/state** — `GET /api/auth/github/callback` (no params) → 400. Missing state → 400. Missing code → 400.

8. **OAuth state replay prevention** — Complete a valid OAuth callback. Replay the same `code`/`state`/cookie combination → error (state already consumed).

9. **OAuth state expiry** — Create OAuth state, wait > 10 minutes (or directly expire the record), then attempt callback → error.

10. **Suspended user rejection** — Complete OAuth for a user with `prohibitLogin=true` → error response, no PAT created.

11. **Alpha whitelist rejection** — Complete OAuth for a non-whitelisted user when closed-alpha enforcement is active → error response.

### CLI Integration Tests

12. **Happy path: Full browser login E2E** — Using `CODEPLANE_TEST_BROWSER_MODE=fetch` and `CODEPLANE_TEST_CREDENTIAL_STORE_FILE`, run `codeplane auth login`. Verify the credential file contains the token for the target host. Verify the config file contains the resolved API URL. Verify the CLI output includes `status: "logged_in"` and the username.

13. **Happy path: `--with-token` flow** — Pipe `codeplane_aaaa...` (valid 46-char token) to `codeplane auth login --with-token`. Verify credential stored in test credential file. Verify output includes `status: "logged_in"`.

14. **`--with-token` with invalid token prefix** — Pipe `ghp_invalidtoken` to `codeplane auth login --with-token` → error containing `"codeplane_"`.

15. **`--with-token` with empty stdin** — Pipe empty string to `codeplane auth login --with-token` → error `"no token provided on stdin"`.

16. **Login with `--hostname` flag** — `codeplane auth login --hostname my.codeplane.dev` → resolves to `https://api.my.codeplane.dev`. Credential stored under host `api.my.codeplane.dev`.

17. **Login with `--hostname` as full URL** — `codeplane auth login --hostname https://custom-api.example.com` → uses that URL directly.

18. **Login with loopback hostname** — `codeplane auth login --hostname localhost:3000` → resolves to `http://localhost:3000`.

19. **Auth status: logged in** — After successful login, `codeplane auth status` returns `logged_in: true`, correct `user`, `token_source: "keyring"`.

20. **Auth status: not logged in** — With empty credential store and no `CODEPLANE_TOKEN`, `codeplane auth status` returns `logged_in: false`.

21. **Auth status: env token takes priority** — Set `CODEPLANE_TOKEN=codeplane_envtoken...` and have a keyring token. `codeplane auth status` reports `token_source: "env"`.

22. **Auth status: invalid token** — Store a token in keyring, but server returns 401 for `/api/user`. `codeplane auth status` reports `logged_in: false`, `token_set: true`.

23. **Auth status: network error** — Store a token in keyring, but server is unreachable. `codeplane auth status` reports `logged_in: true` (optimistic), with message noting network error.

24. **Auth token: print token** — After login, `codeplane auth token` prints the token to stdout and the source to stderr.

25. **Auth token: structured output** — `codeplane auth token --json` returns `{ host, source, token }`.

26. **Auth token: no token** — With no stored token, `codeplane auth token` throws error referencing `codeplane auth login`.

27. **Logout: clears credential** — After login, `codeplane auth logout` → credential file no longer contains the host entry. Returns `cleared: true`.

28. **Logout: no credential to clear** — `codeplane auth logout` with no stored credential → returns `cleared: false`.

29. **Logout: warns about CODEPLANE_TOKEN** — Set `CODEPLANE_TOKEN` env, run `codeplane auth logout` → message includes `"CODEPLANE_TOKEN env is still active"`.

30. **Logout: per-hostname isolation** — Login to host A and host B. Logout from host A. Verify host B credential still exists.

### Credential Storage Tests

31. **macOS Keychain round-trip** — `storeToken("example.com", "codeplane_abc...")` → `loadStoredToken("example.com")` returns the token.

32. **Linux Secret Service round-trip** — Same as above, using `secret-tool` backend.

33. **Windows PasswordVault round-trip** — Same as above, using PowerShell backend.

34. **Test file backend round-trip** — With `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` set, verify store/load/delete cycle.

35. **Hostname normalization** — `storeToken("EXAMPLE.COM", "codeplane_abc...")` → `loadStoredToken("example.com")` returns the token (case-insensitive).

36. **Delete returns boolean** — `deleteStoredToken("nonexistent.com")` returns `false`. `storeToken("example.com", ...)` then `deleteStoredToken("example.com")` returns `true`.

37. **Empty hostname rejected** — `storeToken("", ...)` throws `"Hostname is required"`. `storeToken("  ", ...)` throws `"Hostname is required"`.

38. **Keyring unavailable** — With `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`, `storeToken(...)` throws `SecureStorageUnavailableError`. `loadStoredToken(...)` returns `null`. `deleteStoredToken(...)` returns `false`.

### Token Validation Tests

39. **Valid token accepted** — `validateToken("codeplane_" + "a".repeat(40))` returns the token.

40. **Token with leading/trailing whitespace** — `validateToken("  codeplane_abc...  ")` returns trimmed token.

41. **Token without codeplane_ prefix rejected** — `validateToken("ghp_abc...")` throws error mentioning `"codeplane_"`.

42. **Empty token rejected** — `validateToken("")` throws `"no token provided on stdin"`. `validateToken("   ")` throws `"no token provided on stdin"`.

### Local Callback Server Tests

43. **Non-/callback path returns 404** — GET `http://127.0.0.1:{port}/` → 404. GET `http://127.0.0.1:{port}/login` → 404.

44. **GET /callback without token returns bridge HTML** — GET `http://127.0.0.1:{port}/callback` → 200 with HTML containing "Completing login".

45. **GET /callback with valid token in query params** — GET `http://127.0.0.1:{port}/callback?token=codeplane_abc...&username=testuser` → 200 with success HTML.

46. **POST /callback with valid JSON payload** — POST with `{"token":"codeplane_abc...","username":"testuser"}` → 200 with success HTML.

47. **POST /callback with missing token** — POST with `{"token":""}` → 400.

48. **POST /callback with invalid token prefix** — POST with `{"token":"bad_token"}` → 400.

49. **Non-POST/GET method rejected** — PUT → 405.

50. **Double callback idempotency** — POST a valid token, then POST another valid token → first succeeds, second is ignored.

### Playwright E2E Tests

51. **Full OAuth flow visualization** — Intercept/mock GitHub OAuth. Start CLI login, verify browser navigates to OAuth URL, complete OAuth, verify redirect to `127.0.0.1:{port}/callback#token=...`, verify bridge page extracts token and shows success page.

52. **Success page content verification** — After completing the flow, verify the success page displays the correct username and host and instructs the user to close the tab.

53. **Bridge page error handling** — Simulate a failed POST from the bridge page (e.g., local server already stopped). Verify the bridge page shows "Login failed" with the error.

### Timeout and Race Condition Tests

54. **5-minute timeout fires** — Start `runBrowserLogin`, do not send any callback. Verify it rejects after approximately 5 minutes with the timeout error message.

55. **Timeout does not fire after successful completion** — Start `runBrowserLogin`, send a valid callback within 1 second. Verify no timeout error fires subsequently.

56. **Maximum valid token size** — A token of exactly `"codeplane_" + 40 hex chars` (46 chars total) is accepted and stored successfully.

57. **Token larger than expected still accepted if prefix matches** — A token of `"codeplane_" + 100 hex chars` is accepted (prefix validation only, no length cap enforced). Verify it stores and retrieves correctly.

58. **Concurrent login flows on different ports** — Start two `runBrowserLogin` calls targeting the same host. Each gets a different port. Send valid callbacks to both. Verify both resolve (last write wins for keyring storage on the same host).

# AUTH_SIGN_IN_WITH_GITHUB_CLI_OAUTH

Specification for AUTH_SIGN_IN_WITH_GITHUB_CLI_OAUTH.

## High-Level User POV

When a developer wants to use the Codeplane CLI, the very first thing they need is to authenticate. The GitHub CLI OAuth flow makes this effortless: the developer runs `codeplane auth login`, their default web browser opens automatically, and they authorize Codeplane through their existing GitHub account. Once they click "Authorize" on GitHub's consent screen, the browser shows a brief success page confirming the login, and the terminal immediately confirms that the CLI is now authenticated. The entire process takes seconds and requires no manual token copying or pasting.

This flow exists because CLI users operate in a terminal-first environment and should not have to leave the terminal, navigate to a web UI, manually create a personal access token, copy it, and paste it back. The browser-based OAuth flow bridges the gap by temporarily opening a browser tab, completing the authentication handshake behind the scenes, and then securely delivering a fresh access token directly back into the CLI process. The token is stored in the operating system's secure keyring so subsequent CLI commands work without re-authentication.

The flow supports multiple Codeplane instances. A developer who works with both a company's self-hosted Codeplane and the public instance can authenticate against each by passing a `--hostname` flag. Each instance's token is stored independently in the keyring, keyed by hostname.

If the browser cannot be opened automatically — for example when working in a headless SSH session — the CLI prints the login URL to the terminal so the developer can manually open it on any machine that has access to both GitHub and the Codeplane server. As long as the developer's machine can reach the CLI's local callback server on `127.0.0.1`, the flow completes normally.

For environments where browser-based login is impractical, an alternative `--with-token` flag lets the developer pipe an existing personal access token through stdin instead. This ensures CI systems, Docker containers, and other non-interactive contexts have a first-class authentication path.

## Acceptance Criteria

### Definition of Done

- A user can run `codeplane auth login` and complete GitHub OAuth authentication entirely through a browser redirect round-trip, resulting in a stored access token.
- The token is persisted in the OS keyring and used automatically for subsequent CLI commands.
- The flow works on macOS, Windows, and Linux.
- `codeplane auth status` correctly reflects the authenticated state after login.
- `codeplane auth logout` removes the stored credential.

### Functional Constraints

- [ ] Running `codeplane auth login` with no flags MUST initiate the browser-based GitHub OAuth flow.
- [ ] The CLI MUST start a temporary HTTP listener on `127.0.0.1` using an OS-assigned ephemeral port (port 0).
- [ ] The listener MUST only accept connections on the loopback interface (`127.0.0.1`), never on `0.0.0.0` or a public interface.
- [ ] The CLI MUST open the user's default browser to `{apiUrl}/api/auth/github/cli?callback_port={port}`.
- [ ] If the browser cannot be opened, the CLI MUST print the login URL to stderr and continue waiting.
- [ ] The CLI MUST time out after 5 minutes if no callback is received, and MUST print a clear timeout error.
- [ ] The server's `/api/auth/github/cli` endpoint MUST validate `callback_port` is an integer between 1024 and 65535 inclusive.
- [ ] The server MUST reject requests without a `callback_port` parameter with HTTP 400.
- [ ] The server MUST set a `codeplane_oauth_state` cookie and a `codeplane_cli_callback` cookie before redirecting to GitHub.
- [ ] OAuth state MUST expire after 10 minutes.
- [ ] OAuth state MUST be consumed atomically — a state token can only be used once.
- [ ] The GitHub OAuth callback MUST detect the CLI flow by the presence of the `codeplane_cli_callback` cookie.
- [ ] On successful GitHub authorization, the server MUST create a personal access token scoped to `repo`, `user`, `org`.
- [ ] The token MUST be delivered to the CLI via a URL fragment (`#token=...&username=...`), NOT via query string, to prevent the credential from being logged by intermediary servers.
- [ ] The CLI's local server MUST accept both GET (direct fragment) and POST (JavaScript bridge) callback patterns.
- [ ] All tokens MUST begin with the `codeplane_` prefix. The CLI MUST reject tokens that do not match this prefix.
- [ ] The CLI MUST persist the token to the OS keyring keyed by hostname.
- [ ] The CLI MUST save the API URL to the config file on successful login.
- [ ] If a legacy token exists in the config file for the same host, it MUST be cleared after keyring storage succeeds.
- [ ] `codeplane auth login --with-token` MUST read a token from stdin, validate the `codeplane_` prefix, and store it without opening a browser.
- [ ] `codeplane auth login --hostname <host>` MUST authenticate against the specified host instead of the default.
- [ ] An empty or whitespace-only token on stdin MUST produce a clear error: `"no token provided on stdin"`.
- [ ] A token missing the `codeplane_` prefix MUST produce: `'Invalid token. Tokens must start with "codeplane_".'`

### Edge Cases

- [ ] If the user denies GitHub authorization, the OAuth callback never fires; the CLI times out after 5 minutes with a clear message.
- [ ] If the server's GitHub OAuth is not configured (missing client ID/secret), the server MUST return HTTP 500 with `"github oauth is not configured"`.
- [ ] If the user's GitHub account is suspended (`prohibitLogin` is true), the server MUST return HTTP 403 with `"account is suspended"`.
- [ ] If closed alpha is enabled and the user is not whitelisted, the server MUST return HTTP 403 with `"closed alpha access requires a whitelist invite"`.
- [ ] If the user's GitHub email is already associated with a different Codeplane account, the server MUST return HTTP 409 with `"email address is already in use"`.
- [ ] If the CLI receives multiple callbacks (race condition), only the first MUST be processed; subsequent callbacks MUST be ignored via the `finished` guard.
- [ ] If the callback POST body is missing or unparseable JSON, the CLI MUST treat it as a missing token and fail with HTTP 400.
- [ ] If the ephemeral server is stopped before a callback, the CLI MUST resolve with a timeout or error — not hang indefinitely.
- [ ] The callback bridge HTML page MUST use `escapeHtml` on all user-supplied values to prevent XSS.
- [ ] The login URL printed to stderr MUST NOT contain the token — only the initial redirect URL is printed.

### Boundary Constraints

- `callback_port`: integer, minimum 1024, maximum 65535.
- `stateVerifier`: 16 bytes of cryptographic randomness, rendered as 32-character hex string.
- `OAuth state`: 16 bytes of cryptographic randomness, rendered as 32-character hex string.
- `Token prefix`: must match `^codeplane_` literally.
- `Username`: any valid GitHub login (up to 39 characters, alphanumeric and hyphens).
- `Timeout`: exactly 300,000 ms (5 minutes).
- `OAuth state TTL`: exactly 600,000 ms (10 minutes).

## Design

### CLI Command

**Command**: `codeplane auth login`

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--with-token` | boolean | `false` | Read token from stdin instead of using browser flow |
| `--hostname` | string | (from config) | Hostname or API URL of the Codeplane instance to authenticate with |

**Browser Flow Sequence**:
1. CLI resolves the target Codeplane instance (from config or `--hostname`).
2. CLI starts a temporary HTTP server on `127.0.0.1:0`.
3. CLI constructs the login URL: `{apiUrl}/api/auth/github/cli?callback_port={port}`.
4. CLI prints to stderr: `Opening browser for Codeplane login at {host}` and `If it does not open, visit:\n{loginUrl}`.
5. CLI attempts to open the default browser using platform-appropriate commands (`open` on macOS, `cmd.exe /c start` on Windows, `xdg-open` or `gio open` on Linux).
6. Browser navigates through GitHub OAuth consent flow.
7. On success, browser is redirected to `http://127.0.0.1:{port}/callback#token={token}&username={username}`.
8. The callback bridge HTML page extracts the token from the URL fragment and POSTs it to the local callback server.
9. CLI validates the token, stores it in the OS keyring, stops the local server.
10. CLI prints confirmation: `Logged in to {host} as {username} via browser`.

**Token Flow Sequence** (`--with-token`):
1. CLI reads all of stdin.
2. CLI validates the `codeplane_` prefix.
3. CLI stores the token in the OS keyring.
4. CLI prints confirmation: `Logged in to {host} via keyring`.

**Output (structured JSON mode)**:
```json
{
  "status": "logged_in",
  "host": "codeplane.example.com",
  "user": "octocat",
  "token_source": "keyring",
  "message": "Logged in to codeplane.example.com as octocat via browser"
}
```

**Error Output Examples**:
- Timeout: `"Timed out waiting for browser login on codeplane.example.com."`
- Invalid token: `'Invalid token. Tokens must start with "codeplane_".'`
- No token: `"no token provided on stdin"`
- Browser failure: `"Browser could not be opened automatically: no browser launcher is available"` (printed to stderr, does not abort flow)

### API Shape

**Endpoint: `GET /api/auth/github/cli`**

Initiates the CLI-specific GitHub OAuth flow.

| Parameter | Location | Type | Required | Constraints |
|-----------|----------|------|----------|-------------|
| `callback_port` | query | integer | yes | 1024–65535 |

Response: HTTP 302 redirect to GitHub OAuth authorize URL.

Cookies set:
- `codeplane_oauth_state`: state verifier, HTTPOnly, SameSite=Lax, secure=false, max-age=600
- `codeplane_cli_callback`: callback port, HTTPOnly, SameSite=Lax, secure=false, max-age=600

Error responses:
- `400`: `callback_port is required` or `callback_port must be a valid port (1024-65535)`
- `500`: `github oauth is not configured`

---

**Endpoint: `GET /api/auth/github/callback`** (shared with web OAuth)

Handles the GitHub OAuth callback for both web and CLI flows.

| Parameter | Location | Type | Required |
|-----------|----------|------|----------|
| `code` | query | string | yes |
| `state` | query | string | yes |

CLI-specific behavior: when the `codeplane_cli_callback` cookie is present, the server creates a personal access token and redirects to `http://127.0.0.1:{port}/callback#token={token}&username={username}` instead of setting a session cookie.

Token created: name=`"codeplane-cli"`, scopes=`["repo", "user", "org"]`.

Error responses:
- `400`: `code and state are required`, `invalid oauth code`, `failed to exchange github oauth code`
- `401`: `invalid oauth state`
- `403`: `closed alpha access requires a whitelist invite`, `account is suspended`
- `409`: `email address is already in use`
- `500`: `github oauth is not configured`, `failed to fetch github profile`, `failed to fetch github emails`

### SDK Shape

The `DatabaseAuthService` class in `@codeplane/sdk` exposes:

- `startGitHubOAuth(stateVerifier: string): Promise<string>` — Creates an OAuth state record in the database and returns the GitHub authorize URL.
- `completeGitHubOAuth(code: string, state: string, stateVerifier: string): Promise<OAuthCallbackResult>` — Atomically consumes the OAuth state, exchanges the code with GitHub, resolves or creates the user, and returns session info.
- `createToken(userId: string, req: CreateTokenRequest): Promise<CreateTokenResult>` — Creates a personal access token for the user.

### Web UI Design

The web UI login page (`LoginView.tsx`) includes a "Sign in with GitHub" button that uses the standard web OAuth flow (`GET /api/auth/github`). The CLI flow does NOT use the web UI — it opens the server's `/api/auth/github/cli` endpoint directly in the browser, which redirects to GitHub. The only web content the user sees during the CLI flow is:

1. **GitHub's OAuth consent page** (external to Codeplane).
2. **Callback bridge page**: A minimal branded page that says "Completing login for {host}..." while JavaScript extracts the token from the URL fragment and delivers it to the CLI.
3. **Success page**: A branded page confirming "Logged in as {username}" with instructions to close the browser tab.

### Documentation

The following end-user documentation should be written:

- **CLI Authentication Guide**: A page covering `codeplane auth login`, `codeplane auth login --with-token`, `codeplane auth logout`, `codeplane auth status`, and `codeplane auth token`. Should explain the browser flow, the stdin token flow, multi-instance hostname support, and troubleshooting tips for headless environments.
- **Self-Hosting: Configuring GitHub OAuth**: Instructions for administrators on setting `CODEPLANE_AUTH_GITHUB_CLIENT_ID`, `CODEPLANE_AUTH_GITHUB_CLIENT_SECRET`, and optionally `CODEPLANE_AUTH_GITHUB_REDIRECT_URL` and `CODEPLANE_AUTH_GITHUB_OAUTH_BASE_URL` (for GitHub Enterprise).
- **CLI Reference (`codeplane auth`)**: Auto-generated or hand-maintained command reference for all `auth` subcommands.

## Permissions & Security

### Authorization Roles

- **Anonymous (unauthenticated)**: The `codeplane auth login` command and `GET /api/auth/github/cli` endpoint are accessible without prior authentication. This is by design — the purpose of this flow is to establish authentication.
- **Closed alpha gating**: If closed alpha is enabled, the server checks the user's GitHub username and email addresses against the whitelist after GitHub authorization completes. Unauthorized users receive HTTP 403.
- **Suspended users**: Users with `prohibitLogin=true` are rejected with HTTP 403 after GitHub authorization completes.

### Rate Limiting

- The `GET /api/auth/github/cli` endpoint MUST be subject to the server's global rate limiter.
- A stricter per-IP rate limit SHOULD be applied to auth endpoints to prevent abuse: no more than 10 OAuth initiation requests per IP per minute.
- OAuth state records expire after 10 minutes and are consumed on use, inherently limiting replay attacks.
- Failed OAuth completions (invalid state, invalid code) SHOULD be counted toward a per-IP failure budget; after 5 failures in 10 minutes, subsequent attempts SHOULD be throttled.

### Data Privacy & PII

- The access token is transmitted in a URL fragment, which is never sent to the server by the browser, and never logged by reverse proxies or intermediary servers.
- The token is stored in the OS keyring (not in a plaintext config file).
- GitHub profile data (username, email, display name, GitHub user ID) is stored server-side as part of user and OAuth account records. This constitutes PII.
- The CLI callback bridge page does not store or transmit the token to any third party — it only communicates with `127.0.0.1`.
- The CLI's local HTTP server binds exclusively to `127.0.0.1`, preventing other machines on the network from intercepting the callback.
- All user-rendered values in HTML responses are escaped via `escapeHtml` to prevent XSS.
- The `secure=false` cookie setting for the CLI flow is intentional and correct — the CLI flow uses `http://127.0.0.1`, which is not HTTPS. The cookies are scoped to the server's domain and are HTTPOnly.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `auth.cli_oauth.started` | CLI begins browser login flow | `host`, `platform` (darwin/linux/win32), `browser_launcher` (open/xdg-open/gio/cmd.exe/none) |
| `auth.cli_oauth.browser_opened` | Browser successfully launched | `host`, `platform`, `launcher` |
| `auth.cli_oauth.browser_failed` | Browser could not be launched | `host`, `platform`, `error` |
| `auth.cli_oauth.callback_received` | CLI local server receives a valid token | `host`, `method` (GET/POST), `has_username` |
| `auth.cli_oauth.completed` | Login fully completed and token stored | `host`, `username`, `is_new_user`, `duration_ms` |
| `auth.cli_oauth.timeout` | Login timed out after 5 minutes | `host` |
| `auth.cli_oauth.failed` | Login failed for any non-timeout reason | `host`, `error_type`, `error_message` |
| `auth.cli_token_login.completed` | `--with-token` login completed | `host` |
| `auth.github_oauth.server.initiated` | Server processes `/api/auth/github/cli` | `callback_port`, `client_ip` |
| `auth.github_oauth.server.completed` | Server creates CLI token after callback | `user_id`, `username`, `is_new_user`, `callback_port` |
| `auth.github_oauth.server.closed_alpha_denied` | User denied by closed alpha gating | `github_username` |
| `auth.github_oauth.server.suspended_denied` | Suspended user attempted login | `user_id`, `username` |

### Funnel Metrics

1. **CLI OAuth Initiation → Completion Rate**: `auth.cli_oauth.completed / auth.cli_oauth.started`. Target: ≥ 90%.
2. **Timeout Rate**: `auth.cli_oauth.timeout / auth.cli_oauth.started`. Target: ≤ 5%.
3. **Browser Launch Failure Rate**: `auth.cli_oauth.browser_failed / auth.cli_oauth.started`. Target: ≤ 10%.
4. **New User Conversion via CLI**: `count(auth.cli_oauth.completed WHERE is_new_user=true)` per week.
5. **Median Login Duration**: p50 of `duration_ms` on `auth.cli_oauth.completed`. Target: ≤ 15 seconds.
6. **CLI vs Web OAuth Split**: ratio of CLI-originated OAuth completions to web-originated OAuth completions.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| CLI OAuth initiation | `INFO` | `callback_port`, `client_ip` | Server receives `/api/auth/github/cli` request |
| OAuth state created | `DEBUG` | `state_id`, `expires_at` | New OAuth state record inserted |
| GitHub redirect issued | `DEBUG` | `callback_port`, `github_authorize_url` (redacted client_id) | Server redirects to GitHub |
| OAuth callback received | `INFO` | `has_cli_cookie`, `client_ip` | Server processes `/api/auth/github/callback` |
| GitHub code exchange | `DEBUG` | `success` | Token exchange with GitHub API |
| User resolved/created | `INFO` | `user_id`, `username`, `is_new_user` | User lookup or creation completed |
| CLI token created | `INFO` | `user_id`, `token_name`, `scopes` | PAT created for CLI |
| CLI redirect issued | `DEBUG` | `callback_port`, `username` | Server redirects to CLI callback |
| OAuth state consumed | `DEBUG` | `state_id` | OAuth state atomically consumed |
| Closed alpha denied | `WARN` | `github_username`, `emails_checked` | User not on whitelist |
| Suspended user blocked | `WARN` | `user_id`, `username` | Suspended account attempted login |
| OAuth state expired/invalid | `WARN` | `state`, `client_ip` | Possible replay or stale login attempt |
| GitHub API failure | `ERROR` | `operation` (exchange/profile/emails), `error` | GitHub API returned an error |
| Token creation failure | `ERROR` | `user_id`, `error` | Failed to create CLI access token |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_auth_cli_oauth_initiated_total` | Counter | `instance` | Total CLI OAuth flows started |
| `codeplane_auth_cli_oauth_completed_total` | Counter | `instance`, `is_new_user` | Total CLI OAuth flows successfully completed |
| `codeplane_auth_cli_oauth_failed_total` | Counter | `instance`, `reason` (timeout, state_invalid, github_error, suspended, alpha_denied, conflict) | Total CLI OAuth failures by reason |
| `codeplane_auth_cli_oauth_duration_seconds` | Histogram | `instance` | Duration from initiation to token creation (server-side) |
| `codeplane_auth_github_code_exchange_duration_seconds` | Histogram | `instance` | Duration of GitHub code-for-token exchange |
| `codeplane_auth_github_api_errors_total` | Counter | `instance`, `operation` (exchange, profile, emails) | GitHub API errors during OAuth |
| `codeplane_auth_oauth_state_expired_total` | Counter | `instance` | OAuth state lookups that found expired/missing state |
| `codeplane_auth_tokens_created_total` | Counter | `instance`, `token_name` | Access tokens created |

### Alerts

#### `AuthCLIOAuthHighFailureRate`
- **Condition**: `rate(codeplane_auth_cli_oauth_failed_total[5m]) / rate(codeplane_auth_cli_oauth_initiated_total[5m]) > 0.3` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_auth_cli_oauth_failed_total` by `reason` label to identify the dominant failure mode.
  2. If `reason=github_error`: Check GitHub API status (https://www.githubstatus.com/). Verify `CODEPLANE_AUTH_GITHUB_CLIENT_ID` and `CODEPLANE_AUTH_GITHUB_CLIENT_SECRET` are correctly configured. Check `codeplane_auth_github_api_errors_total` for which operation is failing.
  3. If `reason=state_invalid`: Check for clock skew between server instances. Verify database connectivity — OAuth state is stored in DB. Check if a deploy changed the state cookie domain/path.
  4. If `reason=alpha_denied`: Expected if alpha whitelist is too restrictive. Check with product team.
  5. If `reason=suspended`: Review suspended user list for anomalies.

#### `AuthGitHubAPIErrorSpike`
- **Condition**: `rate(codeplane_auth_github_api_errors_total[5m]) > 5` for 3 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check GitHub status page for ongoing incidents.
  2. Verify the GitHub OAuth app has not been revoked or suspended in GitHub Developer Settings.
  3. Check if the `CODEPLANE_AUTH_GITHUB_CLIENT_SECRET` has been rotated without updating the server environment.
  4. Inspect server logs for the specific GitHub API error responses.
  5. If GitHub is down, acknowledge the alert and monitor until GitHub recovers. No action required on Codeplane side.

#### `AuthOAuthStateExpirationSpike`
- **Condition**: `rate(codeplane_auth_oauth_state_expired_total[10m]) > 10` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if server clock is significantly skewed (OAuth states have a 10-minute TTL).
  2. Check if multiple server instances share the same database — state created on one instance must be resolvable on another.
  3. Check for CSRF attacks — a high volume of invalid state tokens could indicate an attacker probing the callback endpoint.
  4. Review rate limiting configuration on auth endpoints.

#### `AuthCLIOAuthCompletionLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_auth_cli_oauth_duration_seconds_bucket[5m])) > 30` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_auth_github_code_exchange_duration_seconds` — if GitHub's token exchange is slow, this is an upstream issue.
  2. Check database query latency for user lookup/creation.
  3. Check database query latency for OAuth state consumption.
  4. If only p95 is high while p50 is normal, investigate whether specific user flows (e.g., new user creation with email conflict resolution) are causing the tail latency.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| `callback_port is required` | 400 | CLI sent request without port | CLI bug — update CLI |
| `callback_port must be a valid port (1024-65535)` | 400 | Invalid port value | CLI bug — update CLI |
| `github oauth is not configured` | 500 | Missing `CODEPLANE_AUTH_GITHUB_CLIENT_ID` or `CODEPLANE_AUTH_GITHUB_CLIENT_SECRET` | Admin must configure GitHub OAuth app |
| `invalid oauth state` | 401 | State cookie missing, expired, or tampered | User should retry login |
| `failed to exchange github oauth code` | 400 | GitHub rejected the authorization code | User should retry; check GitHub app config |
| `failed to fetch github profile` | 500 | GitHub user API unreachable | Retry; check GitHub status |
| `failed to fetch github emails` | 500 | GitHub emails API unreachable | Retry; check GitHub status |
| `closed alpha access requires a whitelist invite` | 403 | User not on whitelist | Admin must add user to whitelist |
| `account is suspended` | 403 | User's `prohibitLogin` flag is set | Admin must unsuspend account |
| `email address is already in use` | 409 | GitHub email conflicts with existing Codeplane user | User must resolve email conflict via admin |
| `failed to create oauth user` | 500 | Database error during user creation | Check DB connectivity and constraints |
| `failed to create session` | 500 | Database error during session creation | Check DB connectivity |
| CLI timeout | N/A (client-side) | No callback received in 5 minutes | User should retry; check network/firewall |
| Invalid token prefix | N/A (client-side) | Token does not start with `codeplane_` | Server or CLI version mismatch |

## Verification

### API Integration Tests

- [ ] **Happy path: CLI OAuth initiation** — `GET /api/auth/github/cli?callback_port=12345` returns HTTP 302 redirect to GitHub with correct `client_id`, `scope`, `state`, and `redirect_uri` parameters. Verify `codeplane_oauth_state` and `codeplane_cli_callback` cookies are set.
- [ ] **Missing callback_port** — `GET /api/auth/github/cli` (no query params) returns HTTP 400 with body containing `"callback_port is required"`.
- [ ] **Invalid callback_port: non-numeric** — `GET /api/auth/github/cli?callback_port=abc` returns HTTP 400.
- [ ] **Invalid callback_port: below range** — `GET /api/auth/github/cli?callback_port=80` returns HTTP 400.
- [ ] **Invalid callback_port: above range** — `GET /api/auth/github/cli?callback_port=70000` returns HTTP 400.
- [ ] **Invalid callback_port: negative** — `GET /api/auth/github/cli?callback_port=-1` returns HTTP 400.
- [ ] **Boundary: callback_port=1024 (minimum valid)** — `GET /api/auth/github/cli?callback_port=1024` returns HTTP 302.
- [ ] **Boundary: callback_port=65535 (maximum valid)** — `GET /api/auth/github/cli?callback_port=65535` returns HTTP 302.
- [ ] **Boundary: callback_port=1023 (one below minimum)** — returns HTTP 400.
- [ ] **Boundary: callback_port=65536 (one above maximum)** — returns HTTP 400.
- [ ] **GitHub OAuth not configured** — When `CODEPLANE_AUTH_GITHUB_CLIENT_ID` is unset, `GET /api/auth/github/cli?callback_port=12345` returns HTTP 500 with `"github oauth is not configured"`.
- [ ] **OAuth callback: missing code** — `GET /api/auth/github/callback?state=abc` returns HTTP 400.
- [ ] **OAuth callback: missing state** — `GET /api/auth/github/callback?code=abc` returns HTTP 400.
- [ ] **OAuth callback: invalid state (no matching DB record)** — returns HTTP 401 with `"invalid oauth state"`.
- [ ] **OAuth callback: expired state** — Create a state, advance time past 10 minutes, attempt callback → HTTP 401.
- [ ] **OAuth callback: replay attack (state used twice)** — Complete one OAuth flow, then reuse the same state → second attempt returns HTTP 401.
- [ ] **OAuth callback: CLI flow creates token** — Verify the response is a 302 redirect to `http://127.0.0.1:{port}/callback#token=...&username=...` when CLI callback cookie is present.
- [ ] **OAuth callback: token in fragment not query** — Verify the redirect URL uses `#` for token delivery, not `?`.
- [ ] **OAuth callback: cookies cleared** — After CLI OAuth completion, both `codeplane_oauth_state` and `codeplane_cli_callback` cookies are cleared (max-age=-1).
- [ ] **Suspended user blocked** — A user with `prohibitLogin=true` who completes GitHub OAuth receives HTTP 403 with `"account is suspended"`.
- [ ] **Closed alpha: unlisted user denied** — With closed alpha enabled, a new user not on the whitelist receives HTTP 403.
- [ ] **Closed alpha: whitelisted user succeeds** — With closed alpha enabled, a whitelisted user completes login successfully.
- [ ] **New user creation** — A user with no prior Codeplane account completes OAuth; verify a user record and OAuth account record are created.
- [ ] **Returning user** — A user who previously logged in completes OAuth; verify no duplicate user or account records are created.
- [ ] **Email conflict** — A new GitHub OAuth user whose email matches an existing Codeplane user receives HTTP 409.
- [ ] **Token scopes** — The created CLI token has scopes `["repo", "user", "org"]`.
- [ ] **Token name** — The created CLI token has name `"codeplane-cli"`.

### CLI End-to-End Tests

- [ ] **`codeplane auth login` browser flow (automated)** — Using `CODEPLANE_TEST_BROWSER_MODE=fetch`, verify the full flow: CLI starts server, "browser" fetches the initiation URL, follows redirects, delivers token via POST, CLI reports success with username.
- [ ] **`codeplane auth login` stores token in keyring** — After browser login, `codeplane auth token` returns the token. `codeplane auth status` shows `logged_in: true`.
- [ ] **`codeplane auth login --with-token`** — Pipe a valid `codeplane_` token to stdin; verify exit code 0 and structured output with `status: "logged_in"`.
- [ ] **`codeplane auth login --with-token` with invalid prefix** — Pipe `"not_a_valid_token"` to stdin; verify non-zero exit code and error message about `codeplane_` prefix.
- [ ] **`codeplane auth login --with-token` with empty stdin** — Pipe empty string; verify non-zero exit code and `"no token provided on stdin"`.
- [ ] **`codeplane auth login --hostname`** — Login with an explicit hostname; verify the token is stored under that hostname.
- [ ] **`codeplane auth logout`** — After login, run logout; verify `codeplane auth status` shows `logged_in: false`.
- [ ] **`codeplane auth logout --hostname`** — Logout from a specific hostname.
- [ ] **`codeplane auth status` when not logged in** — Verify output includes `logged_in: false` and a helpful message.
- [ ] **`codeplane auth status` when logged in** — Verify output includes `logged_in: true`, `user`, and `token_source: "keyring"`.
- [ ] **`codeplane auth status` with expired/invalid token** — Verify output indicates the token is invalid.
- [ ] **`codeplane auth token`** — Verify the stored token is printed to stdout and source is printed to stderr.
- [ ] **`codeplane auth token --json`** — Verify structured JSON output with `host`, `source`, and `token` fields.
- [ ] **Multi-instance login** — Login to two different hostnames; verify `codeplane auth token --hostname A` and `codeplane auth token --hostname B` return distinct tokens.
- [ ] **CODEPLANE_TOKEN env override** — Set `CODEPLANE_TOKEN` env var; verify `codeplane auth status` reports source as `"CODEPLANE_TOKEN env"` and uses the env token over keyring.

### Playwright (Web UI) Tests

- [ ] **Login page "Sign in with GitHub" button** — Verify the button exists and its href points to `/api/auth/github` (the web flow, not the CLI flow).
- [ ] **Callback bridge page renders** — Navigate directly to `http://127.0.0.1:{port}/callback` (no fragment); verify the bridge HTML is returned with "Completing login" text.
- [ ] **Success page renders** — Navigate to `http://127.0.0.1:{port}/callback?token=codeplane_test&username=octocat`; verify the success page shows "Logged in as octocat".
- [ ] **XSS prevention** — Navigate to callback with `username=<script>alert(1)</script>`; verify the script tag is escaped in the HTML response.

### Security Tests

- [ ] **Loopback binding** — Verify the CLI callback server only listens on `127.0.0.1`, not `0.0.0.0`.
- [ ] **Token not in query string** — Capture the server's redirect response; verify the token appears only in the URL fragment (`#`), never in the query string (`?`).
- [ ] **OAuth state single-use** — Attempt to reuse a consumed OAuth state; verify it fails.
- [ ] **Cookie cleanup** — After successful CLI OAuth, verify both `codeplane_oauth_state` and `codeplane_cli_callback` cookies have `max-age=-1`.
- [ ] **HTML escaping** — Pass `<img onerror=alert(1) src=x>` as hostname or username; verify it is escaped in all HTML responses.

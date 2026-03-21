# AUTH_SIGN_IN_WITH_GITHUB_OAUTH

Specification for AUTH_SIGN_IN_WITH_GITHUB_OAUTH.

## High-Level User POV

When a user visits Codeplane for the first time — whether through the web application or the command line — they need a fast, trustworthy way to create an account or sign into an existing one. "Sign in with GitHub" is the primary authentication entry point for Codeplane. It lets users authenticate using their existing GitHub identity, eliminating the need to create yet another username and password, and immediately connecting their developer identity to Codeplane.

From the web application, the user clicks a "Sign in with GitHub" button on the login page. Codeplane redirects them to GitHub's authorization screen, where they grant Codeplane read-only access to their profile and email addresses. After approving, GitHub redirects back to Codeplane, and the user lands on their dashboard — signed in, with their GitHub username, display name, and verified email automatically imported. If this is the user's first time, Codeplane creates their account seamlessly. If they have signed in before, Codeplane recognizes their linked GitHub account and logs them into the existing Codeplane profile.

From the CLI, the experience is equally streamlined. Running `codeplane auth login` opens the user's default browser to the same GitHub authorization flow. After the user approves access on GitHub, the browser displays a "Login complete" confirmation page, and the CLI automatically receives and stores an API token in the operating system's secure keyring. The user returns to the terminal already authenticated, ready to work.

The value of this feature is that it removes all friction from onboarding. There are no passwords to set, no email verification delays, and no manual token generation. A developer's GitHub identity — the identity most natural for a software forge — becomes their Codeplane identity, whether they are working in a browser, a terminal, an editor, or the desktop application.

## Acceptance Criteria

### Core Flow

- [ ] A user who is not signed in can initiate GitHub OAuth from the web login page by clicking a "Sign in with GitHub" button.
- [ ] A user who is not signed in can initiate GitHub OAuth from the CLI by running `codeplane auth login`.
- [ ] Clicking "Sign in with GitHub" redirects the user's browser to `https://github.com/login/oauth/authorize` with the correct `client_id`, `redirect_uri`, `scope`, and `state` parameters.
- [ ] The only GitHub OAuth scopes requested are `read:user` and `user:email`. No write scopes are requested.
- [ ] After the user authorizes on GitHub, GitHub redirects to the Codeplane callback URL (`/api/auth/github/callback`) with `code` and `state` query parameters.
- [ ] Codeplane exchanges the authorization code for a GitHub access token via `POST https://github.com/login/oauth/access_token`.
- [ ] Codeplane fetches the user's profile via `GET https://api.github.com/user` and email addresses via `GET https://api.github.com/user/emails`.
- [ ] If the user is new (no existing OAuth account link), Codeplane creates a new user account with the GitHub username, display name, and primary verified email.
- [ ] If the user has previously signed in (existing OAuth account link), Codeplane loads the existing user account and creates a new session.
- [ ] After successful web authentication, Codeplane sets a session cookie (`codeplane_session`) and a CSRF cookie (`__csrf`), then redirects to `/`.
- [ ] After successful CLI authentication, Codeplane creates a personal access token with `repo`, `user`, `org` scopes, and redirects to the CLI's local callback server with the token in the URL fragment (never in query parameters).
- [ ] The CLI validates the received token, stores it in the OS keyring, and displays a success message including the authenticated username.

### State and CSRF Protection

- [ ] Each OAuth initiation generates a cryptographically random 16-byte hex state verifier.
- [ ] The state verifier is stored in an `httpOnly`, `SameSite=Lax` cookie (`codeplane_oauth_state`) with a 10-minute expiry.
- [ ] A corresponding OAuth state record (with SHA-256 hash of the verifier) is persisted server-side with a 10-minute expiry.
- [ ] On callback, the server validates that the `state` parameter matches a non-expired, unconsumed state record whose `context_hash` matches the SHA-256 of the cookie verifier.
- [ ] The state record is consumed (deleted) atomically on use — replay of the same callback is rejected.
- [ ] If state validation fails, the OAuth state cookie is cleared and an error is returned.
- [ ] After successful authentication, a CSRF cookie (`__csrf`) is set with `httpOnly=false`, `SameSite=Strict`, containing a 32-byte random hex value.

### New User Account Creation

- [ ] The Codeplane username is set to the GitHub `login` (the GitHub username).
- [ ] The display name is set to the GitHub `name` field if non-empty, otherwise falls back to the GitHub `login`.
- [ ] The primary email is set to the GitHub user's primary verified email, falling back to the first verified email, then any email.
- [ ] The email is stored as a verified email in Codeplane.
- [ ] If the GitHub username or email collides with an existing Codeplane account, the server returns a `409 Conflict` error with a clear message.
- [ ] The linked OAuth account record stores the GitHub `provider_user_id` (GitHub numeric ID), provider `"github"`, and the profile data (JSON of `{id, login, name}`).

### Existing User Sign-In

- [ ] If an OAuth account with provider `"github"` and the matching `provider_user_id` already exists, the associated user is loaded and a new session is created.
- [ ] The OAuth account record is upserted to refresh profile data on each sign-in.
- [ ] The email address is upserted on each sign-in.
- [ ] If the existing user's `prohibit_login` flag is `true`, sign-in is rejected with `403 Forbidden: account is suspended`.

### Closed Alpha Enforcement

- [ ] When closed alpha mode is enabled (`CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true`), new user registration via GitHub OAuth checks the whitelist.
- [ ] The whitelist check evaluates the GitHub username and all GitHub emails against `alpha_whitelist_entries`.
- [ ] If no whitelisted identity matches, sign-in is rejected with `403 Forbidden: closed alpha access requires a whitelist invite`.
- [ ] Admin users bypass the closed alpha check.
- [ ] Existing users are also subject to closed alpha enforcement on each sign-in.

### CLI-Specific Flow

- [ ] The CLI starts a local HTTP server on `127.0.0.1` using a random available port (1024–65535).
- [ ] The CLI opens the browser to `/api/auth/github/cli?callback_port={port}`.
- [ ] The server validates `callback_port` is a valid integer between 1024 and 65535.
- [ ] The server stores the CLI callback port in a cookie (`codeplane_cli_callback`, `httpOnly=true`, `secure=false`, `SameSite=Lax`, 10-minute expiry).
- [ ] On callback, if the CLI callback cookie is present, the server creates an access token and redirects to `http://127.0.0.1:{port}/callback#token={token}&username={username}`.
- [ ] The token is placed in the URL fragment (after `#`), never in query parameters, to prevent intermediary logging.
- [ ] The CLI local server receives the callback, extracts the token from the fragment via a JavaScript bridge page, validates the token prefix (`codeplane_`), and stores it in the OS keyring.
- [ ] If the browser is not opened within 5 minutes, the CLI reports a timeout error.
- [ ] If the browser cannot be opened automatically, the CLI prints the login URL to stderr for manual use.
- [ ] The CLI supports macOS (`open`), Windows (`cmd.exe /c start`), and Linux (`xdg-open`, `gio open`) browser launchers.
- [ ] Both cookies (OAuth state and CLI callback) are cleared after the callback is processed.

### Session Management

- [ ] Session cookies are `httpOnly`, `SameSite=Lax`, with the `secure` flag controlled by `CODEPLANE_AUTH_COOKIE_SECURE`.
- [ ] Session duration defaults to 720 hours (30 days) and is configurable via `CODEPLANE_AUTH_SESSION_DURATION`.
- [ ] The session cookie name defaults to `codeplane_session` and is configurable via `CODEPLANE_AUTH_SESSION_COOKIE_NAME`.
- [ ] The session key is a UUID v4.
- [ ] Sessions are stored server-side and can be listed and revoked by the user.

### Token Format

- [ ] CLI-generated tokens use the prefix `codeplane_` followed by 40 hex characters (20 random bytes).
- [ ] Tokens are stored as SHA-256 hashes; the raw token is only returned once at creation time.
- [ ] The last 8 characters of the hash are stored for display/identification purposes.
- [ ] CLI tokens are created with scopes: `repo`, `user`, `org` (normalized to `write:repository`, `write:user`, `write:organization`).

### Edge Cases and Error Handling

- [ ] Missing `code` or `state` query parameters on callback → `400 Bad Request: code and state are required`.
- [ ] Empty/whitespace-only `code` or `state` → `400 Bad Request`.
- [ ] Missing or expired OAuth state cookie → `401 Unauthorized: invalid oauth state`.
- [ ] Replayed or invalid state → `401 Unauthorized: invalid oauth state`.
- [ ] GitHub code exchange failure → `400 Bad Request: failed to exchange github oauth code`.
- [ ] GitHub profile fetch failure → `500 Internal Server Error: failed to fetch github profile`.
- [ ] GitHub email fetch failure → `500 Internal Server Error: failed to fetch github emails`.
- [ ] GitHub OAuth not configured (missing client ID or secret) → `500 Internal Server Error: github oauth is not configured`.
- [ ] Username/email uniqueness conflict on new account → `409 Conflict: email address is already in use`.
- [ ] Account suspended → `403 Forbidden: account is suspended`.
- [ ] Closed alpha denied → `403 Forbidden: closed alpha access requires a whitelist invite`.
- [ ] CLI callback port missing → `400 Bad Request: callback_port is required`.
- [ ] CLI callback port out of range or non-numeric → `400 Bad Request: callback_port must be a valid port (1024-65535)`.
- [ ] CLI token validation failure (invalid prefix) → connection closed with error.
- [ ] CLI browser login timeout (5 minutes) → `Error: Timed out waiting for browser login`.

### Definition of Done

- [ ] All acceptance criteria above pass in automated tests.
- [ ] The `StubAuthService` in the route layer is replaced with the real `DatabaseAuthService` wired to the `GitHubClient` implementation.
- [ ] The `GitHubClient` implementation makes real HTTP calls to GitHub's OAuth and API endpoints.
- [ ] Web login page renders "Sign in with GitHub" button and correctly initiates the flow.
- [ ] CLI `codeplane auth login` completes the full browser-based OAuth flow end-to-end.
- [ ] `codeplane auth status` correctly reports the authenticated user after GitHub OAuth login.
- [ ] Rate limiting is applied to all auth endpoints.
- [ ] All error cases return structured JSON error responses.
- [ ] Documentation is updated with setup instructions for GitHub OAuth application configuration.

## Design

### Web UI Design

**Login Page (`/login`)**

The login page is a centered, minimal panel containing:

- Codeplane logo and product name at the top.
- A primary "Sign in with GitHub" button styled with the GitHub icon (Octicon mark) and dark background.
- Below the button, a secondary link: "Other sign-in methods" (leading to key-based auth or token input, if available).
- A footer line linking to the Codeplane terms of service and privacy policy.

When the user clicks "Sign in with GitHub":
1. The browser navigates to `GET /api/auth/github`.
2. The server generates state, sets the OAuth state cookie, and returns a `302 Redirect` to GitHub's authorization URL.
3. GitHub displays its standard OAuth consent screen showing the requested scopes: "Read user profile information" and "Read user email addresses."
4. On approval, GitHub redirects to `/api/auth/github/callback?code=...&state=...`.
5. The server completes the OAuth flow, sets session and CSRF cookies, and redirects to `/`.
6. The user lands on their dashboard, fully authenticated.

**Error States**

If the OAuth flow fails, the server redirects to `/login?error={error_code}`. The login page displays a contextual error banner:

- `access_denied`: "You denied access to your GitHub account. Please try again."
- `state_mismatch`: "The login session expired or was invalid. Please try again."
- `account_suspended`: "Your account has been suspended. Contact an administrator."
- `closed_alpha`: "Codeplane is currently in closed alpha. Join the waitlist for access."
- `conflict`: "An account with that email address already exists. Try a different sign-in method."
- `server_error`: "Something went wrong. Please try again later."

**Post-Login Redirect**

After successful login, the user is redirected to `/` (the dashboard). If the user was attempting to access a protected page before being redirected to login, the original URL should be preserved and used as the post-login redirect target.

### API Shape

**Initiate Web OAuth**

```
GET /api/auth/github
→ 302 Redirect to https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&scope=read:user+user:email&state=...
Sets cookie: codeplane_oauth_state (httpOnly, SameSite=Lax, 10min TTL)
```

**Initiate CLI OAuth**

```
GET /api/auth/github/cli?callback_port=12345
→ 302 Redirect to https://github.com/login/oauth/authorize?...
Sets cookies: codeplane_oauth_state, codeplane_cli_callback
```

Error responses:
- `400 { "message": "callback_port is required" }`
- `400 { "message": "callback_port must be a valid port (1024-65535)" }`

**OAuth Callback**

```
GET /api/auth/github/callback?code=abc123&state=xyz789

Web success → 302 Redirect to /
Sets cookies: codeplane_session, __csrf
Clears cookie: codeplane_oauth_state

CLI success → 302 Redirect to http://127.0.0.1:{port}/callback#token={token}&username={username}
Clears cookies: codeplane_oauth_state, codeplane_cli_callback
```

Error responses:
- `400 { "message": "code and state are required" }`
- `400 { "message": "failed to exchange github oauth code" }`
- `401 { "message": "invalid oauth state" }`
- `403 { "message": "account is suspended" }`
- `403 { "message": "closed alpha access requires a whitelist invite" }`
- `409 { "message": "email address is already in use" }`
- `500 { "message": "github oauth is not configured" }`
- `500 { "message": "failed to fetch github profile" }`
- `500 { "message": "failed to fetch github emails" }`

### SDK Shape

The `@codeplane/sdk` package exposes:

- `AuthService` interface with `startGitHubOAuth(stateVerifier: string): Promise<string>` and `completeGitHubOAuth(code, state, stateVerifier): Promise<OAuthCallbackResult>`.
- `GitHubClient` interface with `exchangeCode(code): Promise<GitHubTokenResult>`, `fetchUser(accessToken): Promise<GitHubUserProfile>`, `fetchEmails(accessToken): Promise<GitHubEmail[]>`.
- `DatabaseAuthService` class implementing the full flow.
- `createAuthService(sql, cfg, keyAuthVerifier, githubClient)` factory function.
- `getAuthConfig()` reading environment variables.
- Types: `OAuthCallbackResult`, `GitHubTokenResult`, `GitHubUserProfile`, `GitHubEmail`, `AuthConfig`.

### CLI Command

```
codeplane auth login [--hostname <host>]
```

- Opens the user's default browser to the Codeplane GitHub OAuth flow.
- Starts a temporary local HTTP server on `127.0.0.1` to receive the callback.
- On success, stores the token in the OS keyring and prints: `Logged in to {host} as {username} via browser`.
- On timeout (5 min), prints: `Error: Timed out waiting for browser login on {host}.`
- Supports `--hostname` to target a specific Codeplane instance.

```
codeplane auth login --with-token
```

- Alternative flow: reads a pre-existing `codeplane_` token from stdin.
- Does not open a browser or use OAuth.

```
codeplane auth status [--hostname <host>]
```

- Verifies the stored token by calling `GET /api/user`.
- Prints the authenticated user's username and token source.

```
codeplane auth token [--hostname <host>]
```

- Prints the raw token to stdout (for piping).

```
codeplane auth logout [--hostname <host>]
```

- Clears the stored token from the OS keyring.

### Desktop App Integration

The desktop app embeds the daemon in-process using PGLite and displays the web UI in a native webview. Authentication uses the same web-based GitHub OAuth flow rendered inside the webview. The tray icon reflects the signed-in/signed-out state via the sync status indicator.

### Documentation

The following documentation should be written for end users:

1. **Authentication Guide** (`docs/getting-started/authentication.mdx`):
   - How to sign in via the web UI (click "Sign in with GitHub").
   - How to sign in via the CLI (`codeplane auth login`).
   - How to check auth status (`codeplane auth status`).
   - How to sign out (`codeplane auth logout`).
   - Explanation of token storage (OS keyring).
   - Alternative: `codeplane auth login --with-token` for CI/CD environments.

2. **Self-Hosting: GitHub OAuth Setup** (`docs/admin/github-oauth-setup.mdx`):
   - Step-by-step guide to creating a GitHub OAuth App (Settings → Developer settings → OAuth Apps → New).
   - Required callback URL: `https://<your-codeplane-host>/api/auth/github/callback`.
   - Environment variables: `CODEPLANE_AUTH_GITHUB_CLIENT_ID`, `CODEPLANE_AUTH_GITHUB_CLIENT_SECRET`, `CODEPLANE_AUTH_GITHUB_REDIRECT_URL`.
   - Optional: `CODEPLANE_AUTH_GITHUB_OAUTH_BASE_URL` for GitHub Enterprise Server.
   - Security recommendations: use HTTPS, set `CODEPLANE_AUTH_COOKIE_SECURE=true` in production.

3. **Troubleshooting** section covering:
   - "Browser did not open" → manual URL fallback.
   - "Login timed out" → ensure the Codeplane server is reachable.
   - "Account suspended" → contact administrator.
   - "Closed alpha" → join waitlist.
   - "Email already in use" → sign in with the existing method or contact support.

## Permissions & Security

### Authorization Roles

- **Anonymous (unauthenticated)**: Can access `GET /api/auth/github` and `GET /api/auth/github/cli` to initiate the OAuth flow. Can access `GET /api/auth/github/callback` to complete the flow. These are the only auth endpoints accessible without prior authentication.
- **Authenticated user**: Can access `POST /api/auth/logout` to end their session. Can access session management endpoints to list/revoke sessions.
- **Admin**: Bypasses closed alpha checks. Can manage whitelist entries.

No specific role is required to sign in — the purpose of this feature is to establish identity, not to gate it behind pre-existing identity.

### Rate Limiting

- **Global rate limit**: 120 requests per 60 seconds per IP address (applied to all API endpoints via middleware).
- **Auth-specific rate limit (recommended)**: The `/api/auth/github`, `/api/auth/github/cli`, and `/api/auth/github/callback` endpoints should have a tighter per-IP rate limit of **10 requests per 60 seconds** to prevent OAuth state exhaustion attacks and abuse of GitHub's API quota.
- Rate limit responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` headers.
- Rate limiting uses the IP address for unauthenticated requests (the common case for login flows).

### Data Privacy and PII

- **GitHub access token**: After code exchange, the GitHub access token is used transiently to fetch the user profile and emails. It is NOT stored in the Community Edition (stored as `null` in the `oauth_accounts.access_token_encrypted` column).
- **GitHub user profile**: The GitHub numeric ID, username (`login`), and display name (`name`) are stored in `oauth_accounts.profile_data` as JSON.
- **Email addresses**: The user's GitHub email addresses are used to select a primary email. Only the selected primary email is stored in the Codeplane `email_addresses` table.
- **Session keys**: UUID v4 values stored server-side. Not predictable, not user-visible.
- **CLI tokens**: The raw token (`codeplane_` + 40 hex chars) is only shown once, stored in the OS keyring, and stored server-side as a SHA-256 hash. The raw value cannot be recovered from the hash.
- **OAuth state**: Random hex values used transiently and consumed on use. 10-minute TTL.
- **Cookies**: Session cookies are `httpOnly` (not readable by JavaScript). CSRF cookies are readable by JavaScript but `SameSite=Strict`.
- **No password storage**: This feature involves no passwords.
- **Token fragment transport**: CLI tokens are transmitted in URL fragments (`#token=...`), which are never sent to the server in HTTP requests and are not logged by intermediary proxies.

### Security Constraints

- All OAuth cookies must have `SameSite` set (`Lax` for OAuth flow cookies, `Strict` for CSRF).
- The `secure` cookie flag must be `true` in production (HTTPS).
- OAuth state is single-use and time-bound (10 minutes).
- GitHub OAuth scopes are read-only (`read:user user:email`) — Codeplane never requests write access to the user's GitHub repositories.
- The CLI callback server only listens on `127.0.0.1` (loopback), not `0.0.0.0`.
- Token prefixes (`codeplane_`) enable quick identification and prevent accidental use of tokens from other services.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `AuthGitHubOAuthStarted` | User initiates GitHub OAuth | `flow: "web" \| "cli"`, `host: string`, `requestId: string` |
| `AuthGitHubOAuthCompleted` | OAuth callback successfully processed | `flow: "web" \| "cli"`, `userId: string`, `isNewUser: boolean`, `githubUsername: string`, `durationMs: number`, `requestId: string` |
| `AuthGitHubOAuthFailed` | OAuth callback failed | `flow: "web" \| "cli"`, `errorCode: string`, `errorMessage: string`, `requestId: string` |
| `AuthSessionCreated` | Session cookie set after successful auth | `userId: string`, `authMethod: "github_oauth"`, `sessionDurationHours: number` |
| `AuthCLITokenCreated` | CLI token created after successful OAuth | `userId: string`, `tokenScopes: string[]`, `tokenName: string` |
| `AuthClosedAlphaDenied` | User blocked by closed alpha | `githubUsername: string`, `emails: string[]` |
| `AuthAccountSuspendedDenied` | Suspended user attempted login | `userId: string`, `githubUsername: string` |
| `AuthConflictOnRegistration` | New user registration failed due to conflict | `githubUsername: string`, `conflictField: "email" \| "username"` |

### Funnel Metrics

1. **OAuth Initiation Rate**: `AuthGitHubOAuthStarted` events per day, broken down by `flow`.
2. **OAuth Completion Rate**: `AuthGitHubOAuthCompleted / AuthGitHubOAuthStarted` — target ≥ 85%.
3. **New User Conversion**: `AuthGitHubOAuthCompleted where isNewUser=true` per day.
4. **OAuth Failure Rate**: `AuthGitHubOAuthFailed / AuthGitHubOAuthStarted` — alert if > 10%.
5. **Median OAuth Duration**: P50 of `durationMs` on `AuthGitHubOAuthCompleted` — target < 5 seconds (server-side processing, excludes user interaction time on GitHub).
6. **CLI vs Web Split**: Ratio of `flow="cli"` to `flow="web"` in `AuthGitHubOAuthStarted`.
7. **Closed Alpha Block Rate**: `AuthClosedAlphaDenied / AuthGitHubOAuthStarted` — used to gauge demand during closed alpha.

### Success Indicators

- OAuth completion rate remains above 85% across a 7-day rolling window.
- Median OAuth completion duration (server-side) stays below 3 seconds.
- Zero instances of state replay attacks detected (duplicate state consumption attempts).
- New user registration via GitHub OAuth accounts for >80% of total new registrations.
- CLI login success rate (completion within timeout) exceeds 90%.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| OAuth flow initiated | `info` | `event: "oauth_started"`, `flow: "web"\|"cli"`, `requestId`, `callbackPort` (CLI only) |
| OAuth state created | `debug` | `event: "oauth_state_created"`, `stateId` (truncated), `expiresAt`, `requestId` |
| OAuth callback received | `info` | `event: "oauth_callback"`, `flow: "web"\|"cli"`, `hasCode: bool`, `hasState: bool`, `requestId` |
| OAuth state consumed | `debug` | `event: "oauth_state_consumed"`, `requestId` |
| GitHub code exchange succeeded | `info` | `event: "github_code_exchanged"`, `durationMs`, `requestId` |
| GitHub code exchange failed | `warn` | `event: "github_code_exchange_failed"`, `error`, `durationMs`, `requestId` |
| GitHub profile fetched | `debug` | `event: "github_profile_fetched"`, `githubUserId`, `githubLogin`, `durationMs`, `requestId` |
| GitHub profile fetch failed | `error` | `event: "github_profile_fetch_failed"`, `error`, `durationMs`, `requestId` |
| GitHub emails fetched | `debug` | `event: "github_emails_fetched"`, `emailCount`, `durationMs`, `requestId` |
| New user created via OAuth | `info` | `event: "user_created_via_oauth"`, `userId`, `username`, `provider: "github"`, `requestId` |
| Existing user signed in via OAuth | `info` | `event: "user_signed_in_via_oauth"`, `userId`, `username`, `provider: "github"`, `requestId` |
| Session created | `info` | `event: "session_created"`, `userId`, `expiresAt`, `requestId` |
| CLI token created | `info` | `event: "cli_token_created"`, `userId`, `tokenLastEight`, `scopes`, `requestId` |
| OAuth state validation failed | `warn` | `event: "oauth_state_invalid"`, `reason`, `requestId` |
| Closed alpha access denied | `warn` | `event: "closed_alpha_denied"`, `githubLogin`, `requestId` |
| Account suspended denial | `warn` | `event: "account_suspended_denial"`, `userId`, `requestId` |
| Username/email conflict | `warn` | `event: "oauth_registration_conflict"`, `githubLogin`, `requestId` |
| Rate limit hit on auth endpoint | `warn` | `event: "auth_rate_limited"`, `ip`, `endpoint`, `requestId` |

### Prometheus Metrics

**Counters:**

- `codeplane_auth_github_oauth_started_total{flow="web"|"cli"}` — Total OAuth initiation requests.
- `codeplane_auth_github_oauth_completed_total{flow="web"|"cli", is_new_user="true"|"false"}` — Total successful completions.
- `codeplane_auth_github_oauth_failed_total{flow="web"|"cli", error_code="..."}` — Total failures by error type.
- `codeplane_auth_github_code_exchange_errors_total` — GitHub code exchange failures.
- `codeplane_auth_github_api_errors_total{endpoint="user"|"emails"}` — GitHub API call failures.
- `codeplane_auth_sessions_created_total{method="github_oauth"}` — Sessions created via OAuth.
- `codeplane_auth_cli_tokens_created_total` — CLI tokens created via OAuth.
- `codeplane_auth_closed_alpha_denied_total` — Closed alpha denials.
- `codeplane_auth_rate_limit_exceeded_total{endpoint="/api/auth/github"|"/api/auth/github/cli"|"/api/auth/github/callback"}` — Rate limit hits on auth endpoints.

**Histograms:**

- `codeplane_auth_github_oauth_duration_seconds{flow="web"|"cli"}` — End-to-end server-side OAuth processing time. Buckets: `[0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.
- `codeplane_auth_github_code_exchange_duration_seconds` — Time to exchange code with GitHub. Buckets: `[0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.
- `codeplane_auth_github_api_duration_seconds{endpoint="user"|"emails"}` — GitHub API call latency. Buckets: `[0.05, 0.1, 0.25, 0.5, 1, 2.5]`.

**Gauges:**

- `codeplane_auth_oauth_states_active` — Number of unconsumed, non-expired OAuth states.

### Alerts

#### Alert: `GitHubOAuthHighFailureRate`

- **Condition**: `rate(codeplane_auth_github_oauth_failed_total[5m]) / rate(codeplane_auth_github_oauth_started_total[5m]) > 0.2` for 10 minutes.
- **Severity**: Warning.
- **Runbook**:
  1. Check `codeplane_auth_github_oauth_failed_total` broken down by `error_code` to identify the dominant failure type.
  2. If `error_code="state_invalid"` is dominant: Check if OAuth state cookie expiry (10 min) is too short. Check for clock skew between server instances. Check if users are taking too long on GitHub's consent screen.
  3. If `error_code="code_exchange_failed"` is dominant: Check GitHub's status page (https://www.githubstatus.com). Verify `CODEPLANE_AUTH_GITHUB_CLIENT_ID` and `CODEPLANE_AUTH_GITHUB_CLIENT_SECRET` are correct and the OAuth app is not suspended. Check `codeplane_auth_github_code_exchange_duration_seconds` for GitHub API latency issues.
  4. If `error_code="profile_fetch_failed"` or `error_code="email_fetch_failed"`: Check GitHub API rate limits (5000/hr per token). Check network connectivity from Codeplane servers to `api.github.com`.
  5. If `error_code="conflict"` is dominant: Investigate whether a migration or bulk import created conflicting accounts.

#### Alert: `GitHubOAuthSlowCompletions`

- **Condition**: `histogram_quantile(0.95, rate(codeplane_auth_github_oauth_duration_seconds_bucket[5m])) > 10` for 5 minutes.
- **Severity**: Warning.
- **Runbook**:
  1. Check `codeplane_auth_github_code_exchange_duration_seconds` — if P95 > 5s, GitHub's OAuth token endpoint is slow. No Codeplane-side fix; monitor and alert users if persistent.
  2. Check `codeplane_auth_github_api_duration_seconds` — if `endpoint="user"` or `endpoint="emails"` P95 > 2s, GitHub API is slow.
  3. Check Codeplane database latency for session/user creation queries.
  4. Check overall server CPU and memory — high load could delay processing.

#### Alert: `GitHubOAuthStateExhaustion`

- **Condition**: `codeplane_auth_oauth_states_active > 10000`.
- **Severity**: Critical.
- **Runbook**:
  1. This indicates a potential denial-of-service attack flooding the OAuth initiation endpoint.
  2. Check rate limit counters: `codeplane_auth_rate_limit_exceeded_total{endpoint="/api/auth/github"}`.
  3. Inspect the IP addresses hitting `/api/auth/github` at high rates (server access logs).
  4. If a single IP or small IP range: add a firewall rule to block the source.
  5. If distributed: tighten the auth-endpoint rate limit temporarily (e.g., 3/min per IP).
  6. Expired states are cleaned up automatically, but if the rate of creation exceeds cleanup, consider running a manual `DELETE FROM oauth_states WHERE expires_at < NOW()`.

#### Alert: `GitHubOAuthAllFailures`

- **Condition**: `rate(codeplane_auth_github_oauth_completed_total[15m]) == 0 AND rate(codeplane_auth_github_oauth_started_total[15m]) > 0` for 15 minutes.
- **Severity**: Critical.
- **Runbook**:
  1. No OAuth completions while initiations are happening means the entire flow is broken.
  2. Check if `CODEPLANE_AUTH_GITHUB_CLIENT_ID` and `CODEPLANE_AUTH_GITHUB_CLIENT_SECRET` environment variables are set and non-empty.
  3. Check if the GitHub OAuth redirect URL matches what's configured in the GitHub OAuth App settings.
  4. Check if the GitHub OAuth App has been suspended or deleted.
  5. Check server logs for `"github oauth is not configured"` errors.
  6. Check network connectivity: `curl -s https://github.com/login/oauth/access_token` from the server.
  7. Restart the server if environment variables were recently changed (they are read at startup).

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|---|---|---|---|
| GitHub OAuth App credentials misconfigured | `"github oauth is not configured"` log, 500 responses | All OAuth logins fail | Admin must set correct env vars and restart |
| GitHub API outage | Code exchange or profile fetch 5xx/timeout | New logins fail; existing sessions unaffected | Monitor GitHub status; users can use `--with-token` if they have a PAT |
| GitHub rate limit (5000/hr) | 403 from GitHub API | OAuth logins fail for code exchange | Unlikely in normal usage; investigate if automated abuse |
| Database unavailable | Session/user creation fails | Logins fail | Standard DB failover procedures |
| OAuth state table bloat | `codeplane_auth_oauth_states_active` gauge | Increased DB storage and query time | States expire after 10 min; cleanup cron should handle |
| Clock skew between servers | OAuth state expiry check fails for valid states | Intermittent `invalid oauth state` errors | Ensure NTP sync across servers |
| Cookie domain mismatch | Browser does not send OAuth state cookie back | All OAuth callbacks fail with `invalid oauth state` | Verify server URL and cookie domain configuration |
| Redirect URL mismatch | GitHub rejects the callback URL | OAuth initiation fails at GitHub | Ensure `CODEPLANE_AUTH_GITHUB_REDIRECT_URL` matches the GitHub App config exactly |

## Verification

### API Integration Tests

1. **`GET /api/auth/github` returns 302 redirect to GitHub with correct parameters** — Assert response status is 302. Assert `Location` header starts with `https://github.com/login/oauth/authorize`. Assert `Location` contains `client_id`, `redirect_uri`, `scope=read%3Auser+user%3Aemail`, and `state`. Assert `codeplane_oauth_state` cookie is set with `HttpOnly`, `SameSite=Lax`.

2. **`GET /api/auth/github` sets OAuth state cookie with correct expiry** — Assert cookie `Max-Age` is approximately 600 (10 minutes, ± 2 seconds).

3. **`GET /api/auth/github/cli?callback_port=12345` returns 302 with correct parameters** — Assert response status is 302. Assert `codeplane_oauth_state` cookie is set. Assert `codeplane_cli_callback` cookie is set to `"12345"`. Assert `codeplane_cli_callback` cookie has `HttpOnly=true`, `Secure=false`.

4. **`GET /api/auth/github/cli` without callback_port returns 400** — Assert status 400, body contains `"callback_port is required"`.

5. **`GET /api/auth/github/cli?callback_port=abc` returns 400** — Assert status 400, body contains `"callback_port must be a valid port"`.

6. **`GET /api/auth/github/cli?callback_port=80` returns 400 (below 1024)** — Assert status 400.

7. **`GET /api/auth/github/cli?callback_port=70000` returns 400 (above 65535)** — Assert status 400.

8. **`GET /api/auth/github/cli?callback_port=1024` returns 302 (minimum valid port)** — Assert status 302.

9. **`GET /api/auth/github/cli?callback_port=65535` returns 302 (maximum valid port)** — Assert status 302.

10. **`GET /api/auth/github/callback` without code or state returns 400** — Assert status 400, body contains `"code and state are required"`.

11. **`GET /api/auth/github/callback?code=&state=` with empty params returns 400** — Assert status 400.

12. **`GET /api/auth/github/callback?code=abc&state=def` without OAuth state cookie returns 401** — Assert status 401, body contains `"invalid oauth state"`.

13. **`GET /api/auth/github/callback` with valid code/state but mismatched cookie verifier returns 401** — Create an OAuth state record with a known hash, send callback with a different cookie value. Assert status 401.

14. **`GET /api/auth/github/callback` with expired OAuth state returns 401** — Insert an OAuth state with `expires_at` in the past. Assert status 401.

15. **`GET /api/auth/github/callback` with valid flow creates new user and returns 302** — Mock GitHub API to return a profile and emails for a new GitHub user. Assert status 302, redirect to `/`. Assert `codeplane_session` cookie is set. Assert `__csrf` cookie is set. Assert `codeplane_oauth_state` cookie is cleared. Verify user was created in database with correct username, email, display name.

16. **`GET /api/auth/github/callback` for existing user creates session and returns 302** — Pre-create a user and OAuth account link. Mock GitHub API to return matching profile. Assert status 302, session cookie set, no new user created.

17. **`GET /api/auth/github/callback` for suspended user returns 403** — Pre-create a suspended user (prohibit_login=true) with OAuth account link. Mock GitHub API. Assert status 403, body contains `"account is suspended"`.

18. **`GET /api/auth/github/callback` during closed alpha denies non-whitelisted user** — Enable closed alpha. Do not add the GitHub user to the whitelist. Assert status 403, body contains `"closed alpha access requires a whitelist invite"`.

19. **`GET /api/auth/github/callback` during closed alpha allows whitelisted user** — Enable closed alpha. Add the GitHub username to the whitelist. Assert status 302, user created.

20. **`GET /api/auth/github/callback` during closed alpha allows whitelisted email** — Enable closed alpha. Add the GitHub user's email to the whitelist. Assert status 302, user created.

21. **`GET /api/auth/github/callback` with duplicate email returns 409** — Pre-create a user with the same email the GitHub profile would import. Assert status 409, body contains `"email address is already in use"`.

22. **OAuth state is consumed after successful callback (replay protection)** — Complete a valid callback. Replay the exact same request with the same code, state, and cookie. Assert second request returns 401.

23. **CLI callback flow creates token and redirects to loopback** — Initiate OAuth via `/api/auth/github/cli?callback_port=54321`. Complete callback with CLI callback cookie present. Assert redirect to `http://127.0.0.1:54321/callback#token=codeplane_...&username=...`. Assert token in URL fragment is valid. Assert `codeplane_cli_callback` cookie is cleared.

24. **CLI callback token has correct scopes** — Complete a CLI OAuth flow. Extract the token from the redirect URL fragment. Use the token to call `GET /api/user` and verify authentication works. Verify the token has scopes `write:repository`, `write:user`, `write:organization`.

25. **Session cookie works for subsequent authenticated requests** — Complete a web OAuth flow, capture the `codeplane_session` cookie. Use the cookie to call `GET /api/user`. Assert the response returns the correct user profile.

26. **CSRF cookie is set correctly after web OAuth** — Complete a web OAuth flow. Assert `__csrf` cookie has `HttpOnly=false`, `SameSite=Strict`. Assert `__csrf` cookie value is a 64-character hex string (32 bytes).

27. **Session duration is configurable** — Set `CODEPLANE_AUTH_SESSION_DURATION=1h`. Complete OAuth flow, inspect session cookie `Max-Age`. Assert `Max-Age` is approximately 3600.

28. **GitHub OAuth base URL is configurable (GitHub Enterprise)** — Set `CODEPLANE_AUTH_GITHUB_OAUTH_BASE_URL=https://github.example.com`. Initiate OAuth. Assert redirect `Location` starts with `https://github.example.com/login/oauth/authorize`.

29. **Rate limiting blocks excessive OAuth initiations** — Send 11 `GET /api/auth/github` requests from the same IP within 60 seconds (assuming 10/min auth limit). Assert the 11th request returns 429 with `Retry-After` header.

### CLI E2E Tests

30. **`codeplane auth login` completes full browser-based OAuth flow** — Use `CODEPLANE_TEST_BROWSER_MODE=fetch` to simulate browser behavior. Run `codeplane auth login`. Assert exit code 0. Assert stdout/stderr contains `Logged in to` and the username.

31. **`codeplane auth login --with-token` reads token from stdin** — Pipe a valid `codeplane_` token to stdin. Assert exit code 0. Assert output confirms login.

32. **`codeplane auth login --with-token` rejects invalid token prefix** — Pipe `ghp_invalid_token` to stdin. Assert exit code non-zero. Assert error message mentions `Tokens must start with "codeplane_"`.

33. **`codeplane auth login --with-token` rejects empty stdin** — Pipe empty string. Assert exit code non-zero.

34. **`codeplane auth status` after login shows authenticated user** — Login via `codeplane auth login`. Run `codeplane auth status`. Assert output shows username and `logged_in` status.

35. **`codeplane auth status` without login shows not authenticated** — Clear all auth state. Run `codeplane auth status`. Assert output indicates not logged in.

36. **`codeplane auth logout` clears stored credentials** — Login, then run `codeplane auth logout`. Run `codeplane auth status`. Assert output indicates not logged in.

37. **`codeplane auth token` prints the raw token** — Login. Run `codeplane auth token`. Assert stdout contains a token starting with `codeplane_`.

38. **`codeplane auth login --hostname custom.host` targets specified host** — Run `codeplane auth login --hostname http://localhost:4001`. Assert the OAuth initiation targets the custom host.

39. **`codeplane auth login` timeout after 5 minutes (simulated)** — Configure a test that does not complete the OAuth callback. Assert the CLI exits with a timeout error. Assert error message contains `Timed out waiting for browser login`.

### Playwright (Web UI) E2E Tests

40. **Login page renders "Sign in with GitHub" button** — Navigate to `/login`. Assert button with text "Sign in with GitHub" is visible.

41. **Clicking "Sign in with GitHub" redirects to GitHub** — Click the button. Assert navigation occurs to a URL matching `github.com/login/oauth/authorize`.

42. **Successful OAuth redirects to dashboard** — Mock the GitHub OAuth flow (intercept GitHub redirects). Complete the flow. Assert the user is redirected to `/` (dashboard). Assert the dashboard shows the authenticated user's name.

43. **Failed OAuth shows error on login page** — Complete the OAuth flow with an invalid state. Assert the user is redirected to `/login` with an error parameter. Assert an error banner is displayed.

44. **Login page is accessible when not authenticated** — Clear all cookies. Navigate to `/login`. Assert the page loads without redirect loops.

45. **Authenticated user accessing /login is redirected to dashboard** — Complete login. Navigate to `/login`. Assert redirect to `/`.

46. **Session cookie persists across page navigations** — Complete login. Navigate to multiple pages. Assert the user remains authenticated throughout.

47. **Logging out clears the session** — Complete login. Trigger logout. Navigate to a protected page. Assert redirect to `/login`.

### Security-Specific Tests

48. **OAuth state cannot be reused (replay attack)** — Complete one callback successfully. Attempt the same callback again with the same state. Assert 401.

49. **OAuth state from one session cannot be used in another** — Initiate OAuth from browser A, get state cookie. Initiate OAuth from browser B, get different state cookie. Try to complete browser A's callback using browser B's state cookie. Assert 401.

50. **Expired OAuth state is rejected** — Manually insert an expired OAuth state. Attempt callback. Assert 401.

51. **Token in CLI callback is in URL fragment, not query parameters** — Complete a CLI OAuth flow. Capture the redirect URL. Assert the URL contains `#token=` and does NOT contain `?token=`.

52. **CLI local callback server only accepts connections on 127.0.0.1** — Inspect the server configuration. Assert hostname is `127.0.0.1`, not `0.0.0.0`.

53. **CLI callback rejects tokens without valid prefix** — Send a POST to the CLI callback server with `token: "invalid_token"`. Assert response is 400.

54. **CLI callback rejects empty token** — Send a POST to the CLI callback server with `token: ""`. Assert response is 400 or error.

55. **Session cookie is HttpOnly** — Complete web login. Assert `codeplane_session` cookie has `HttpOnly` flag.

56. **CSRF cookie is NOT HttpOnly (readable by JS)** — Complete web login. Assert `__csrf` cookie does NOT have `HttpOnly` flag.

57. **OAuth does not leak GitHub access token in responses or logs** — Complete OAuth flow. Assert no response body contains the GitHub access token. Assert server logs do not contain the GitHub access token.

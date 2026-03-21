# AUTH_LOGOUT

Specification for AUTH_LOGOUT.

## High-Level User POV

When a user is done working in Codeplane — or simply wants to end their session on a shared device — they expect to sign out completely and immediately. Logout is the complement to sign-in: it revokes the user's active session, clears all authentication state from the browser, and returns them to the login page. Once signed out, no further actions can be taken under that identity until they explicitly sign in again.

From the web UI, the user finds a "Sign out" option in their user menu. Clicking it immediately ends their session. The page redirects to the login screen. If they try to navigate back to a protected page, they are redirected to sign in. There is no ambiguity about whether they are still logged in — the session is gone both server-side and client-side.

From the CLI, logout is equally straightforward. Running `codeplane auth logout` removes the locally stored access token from the system keyring. The user is informed which host they logged out from. If the `CODEPLANE_TOKEN` environment variable is also set in the current shell, the CLI helpfully warns them that the environment variable is still active and will continue to authenticate requests until the shell session ends or the variable is unset.

Logout is designed to be safe and idempotent. If a user clicks "Sign out" when their session has already expired, or runs `codeplane auth logout` when no token is stored, the operation succeeds gracefully — no errors, no confusion. The system simply confirms the user is signed out.

For teams using Codeplane across multiple devices, logout only affects the current session. Signing out on a laptop does not sign the user out of their desktop workstation or their phone browser. Each session is independent. Users who want to revoke all sessions can do so from the active sessions management page in their account settings, which is a separate but complementary feature.

The value of logout is trust and control. Users trust that they can reliably end a session, that the forge does not retain stale access after they leave, and that shared or public devices can be used safely when sessions are properly terminated.

## Acceptance Criteria

### Definition of Done

- [ ] `POST /api/auth/logout` deletes the user's current session record from the database.
- [ ] `POST /api/auth/logout` clears the `codeplane_session` cookie by setting `expires: new Date(0)` and `maxAge: -1`.
- [ ] `POST /api/auth/logout` clears the `__csrf` cookie using the same expiration technique.
- [ ] `POST /api/auth/logout` returns `204 No Content` with no response body.
- [ ] After logout, all subsequent requests carrying the old session cookie are treated as unauthenticated.
- [ ] The web UI "Sign out" action calls `POST /api/auth/logout` and redirects the user to the login page.
- [ ] The CLI `codeplane auth logout` command clears the stored token from the system keyring (macOS Keychain, Linux Secret Service, or Windows PasswordVault).
- [ ] The CLI `codeplane auth logout --hostname <host>` clears the token for a specific host only.
- [ ] The CLI logout command also scrubs any legacy token format for the resolved host.
- [ ] The CLI displays a warning when `CODEPLANE_TOKEN` environment variable is still set after logout.
- [ ] The CLI logout command returns structured JSON output with `status`, `host`, `cleared`, and `message` fields when `--json` is passed.
- [ ] Logout is idempotent: calling logout with no active session, an expired session, or no session cookie at all succeeds without error.
- [ ] Logout only terminates the current session — other sessions for the same user remain valid and unaffected.
- [ ] The TUI provides a logout action that clears the stored token and returns to a signed-out state.
- [ ] The desktop app "Sign out" action terminates the embedded daemon session and returns to the login prompt.

### Edge Cases

- [ ] Logout with no session cookie present returns 204 (no-op).
- [ ] Logout with an empty-string session cookie value returns 204 (no-op).
- [ ] Logout with a whitespace-only session cookie value returns 204 (no-op, because empty/whitespace strings fail UUID validation and are skipped).
- [ ] Logout with a session cookie that is not a valid UUID format returns 204 (cookie cleared, no database operation attempted).
- [ ] Logout with a session cookie referencing a session already deleted from the database returns 204 (idempotent).
- [ ] Logout with a session cookie referencing an already-expired session returns 204 (session still deleted from database; cookie still cleared).
- [ ] Concurrent logout requests for the same session both return 204 without error (database deletion is idempotent).
- [ ] CLI logout when no token is stored in the keyring returns exit code 0 with `cleared: false`.
- [ ] CLI logout when the keyring backend is unavailable (e.g., headless server without Secret Service) returns a clear error rather than crashing.
- [ ] CLI logout does not call any server endpoint — it is a client-side-only operation.
- [ ] After web logout, the browser's back button does not re-authenticate the user (session is destroyed server-side).
- [ ] After web logout, any open tabs with SSE connections (notifications, workflow logs) stop receiving events and degrade gracefully.

### Boundary Constraints

- [ ] Session cookie name: configurable, maximum 128 characters, defaults to `codeplane_session`.
- [ ] Session key format: UUID v4 (36 characters including hyphens). Values shorter or longer are rejected as invalid.
- [ ] CLI hostname option: any valid hostname or URL string. If not provided, resolves from config or falls back to default.
- [ ] CLI structured output: `--json` flag produces machine-parseable JSON; without it, a human-readable message is printed.
- [ ] The `__csrf` cookie cleared on logout uses `SameSite=Strict` and `HttpOnly=false` (matching issuance attributes).
- [ ] The session cookie cleared on logout uses `path=/`, `HttpOnly=true`, `SameSite=Lax`, and `Secure` matching the server's cookie secure configuration.

## Design

### API Shape

```
POST /api/auth/logout
  Auth: Optional (cookie-based; operates on the session cookie if present)
  Request Body: None
  Response: 204 No Content
  Side Effects:
    - Deletes the session record from auth_sessions (if session key is valid UUID)
    - Clears codeplane_session cookie (expires=epoch, maxAge=-1)
    - Clears __csrf cookie (expires=epoch, maxAge=-1)
  Error Responses:
    - 500 if database deletion fails unexpectedly
```

The endpoint does not require authentication in the traditional sense — if no valid session cookie is present, the endpoint is a no-op that still clears cookies and returns 204. This ensures that logout always "works" from the client's perspective.

### SDK Shape

```typescript
interface AuthService {
  /**
   * Deletes the session associated with the given session key.
   * No-op if sessionKey is empty, whitespace-only, or not a valid UUID.
   * Idempotent: no error if session does not exist.
   */
  logout(sessionKey: string): Promise<void>;
}
```

The SDK `logout()` method validates the session key format before issuing a database delete. It returns silently for empty, whitespace, or non-UUID inputs. It does not throw if the session has already been deleted.

### Web UI Design

**Sign-Out Trigger Location:**
- The user avatar menu in the sidebar/header contains a "Sign out" item.
- "Sign out" is always the last item in the menu, visually separated from other options.

**Sign-Out Flow:**
1. User clicks "Sign out" in the user menu.
2. The UI calls `POST /api/auth/logout` (no request body).
3. On receiving 204, the UI clears any client-side auth state (cached user object, auth context).
4. The UI redirects to the login page (`/login` or `/`).
5. A brief toast or banner may confirm "You have been signed out" on the login page.

**Post-Logout Behavior:**
- Protected routes redirect to login if accessed after logout.
- Any open SSE connections (notifications, workflow streams) gracefully close.
- The command palette, terminal dock, and agent dock become inaccessible.
- Browser history navigation to protected pages does not re-authenticate.

**Error Handling:**
- If the `POST /api/auth/logout` call fails (network error, 500), the UI should still clear client-side state and redirect to login, logging the error for debugging. The user should not be "stuck" in a logged-in state.

### CLI Command

```
codeplane auth logout [--hostname <host>] [--json]
```

**Behavior:**
1. Resolves the target host from `--hostname`, config file, or default.
2. Deletes the stored token from the OS-native credential store for that host.
3. Scrubs any legacy token files for the resolved host.
4. Returns structured output:

```json
{
  "status": "logged_out",
  "host": "codeplane.example.com",
  "cleared": true,
  "message": "Logged out from codeplane.example.com"
}
```

If `CODEPLANE_TOKEN` environment variable is set:
```json
{
  "status": "logged_out",
  "host": "codeplane.example.com",
  "cleared": true,
  "message": "Logged out from codeplane.example.com. CODEPLANE_TOKEN env is still active for this shell."
}
```

**Exit Codes:**
- `0`: Logout succeeded (including no-op when no token was stored).
- `1`: Unexpected failure (keyring backend error).

**Important:** The CLI logout does NOT call the server's `/api/auth/logout` endpoint. CLI authentication uses Personal Access Tokens stored locally, not session cookies. The token remains valid server-side until it expires or is explicitly revoked via `codeplane auth token revoke`. This is by design — the CLI logout is about clearing the local credential, not revoking the server-side token.

### TUI UI

- The TUI settings or account screen includes a "Logout" action.
- Selecting "Logout" clears the stored token (same as CLI) and returns to a signed-out splash screen or exits.
- The TUI displays confirmation: "Logged out from <host>."

### Desktop App

- The desktop tray menu includes a "Sign out" option.
- Selecting it stops the embedded daemon session, clears local auth state, and returns to the login prompt within the webview.
- The tray icon updates to reflect the signed-out state.

### Editor Integrations

**VS Code:**
- A "Codeplane: Sign Out" command is available in the command palette.
- Executing it clears stored credentials and updates the status bar to reflect the signed-out state.
- Codeplane views (issues, landings, bookmarks) show a "Sign in" prompt after logout.

**Neovim:**
- A `:Codeplane logout` command is available.
- Executing it clears stored credentials and updates the statusline component.
- Subsequent commands that require auth display an appropriate "not authenticated" message.

### Documentation

End-user documentation should include:

1. **Signing Out (Web)** — How to find and use the "Sign out" option, what happens to active sessions, and confirmation that other devices remain signed in.
2. **CLI Logout** — Usage of `codeplane auth logout`, the `--hostname` flag, the `CODEPLANE_TOKEN` environment variable warning, and the distinction between clearing a local token vs. revoking a server-side token.
3. **Managing Sessions** — Cross-reference to the active sessions settings page where users can revoke specific sessions or all sessions.
4. **Security Best Practices** — Guidance to sign out on shared devices, review active sessions periodically, and understand that CLI logout does not invalidate the server-side token.

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| Sign out (web, `POST /api/auth/logout`) | Any user (authenticated or unauthenticated — endpoint is a no-op for unauthenticated) |
| Sign out (CLI, `codeplane auth logout`) | Any local user (no server auth required) |
| Sign out (TUI/Desktop/Editor) | Any local user (no server auth required) |

No elevated role (Admin, Owner) is required for logout. Every user can terminate their own session. There is no mechanism to force-logout another user via this endpoint; that is handled by the admin session revocation feature.

### Rate Limiting

- **`POST /api/auth/logout`**: 30 requests per minute per IP address. This is generous because logout is idempotent and low-risk. Rate limiting prevents automated harassment (e.g., repeatedly logging a user out via CSRF, though `SameSite=Lax` already mitigates this for cross-origin POST).

### Data Privacy and PII

- The logout endpoint receives only the session cookie, which contains an opaque UUID — no PII.
- The logout response body is empty (204 No Content) — no PII is returned.
- Server logs for logout events must log only the session key prefix (first 8 characters), never the full session key.
- The CLI logout operates entirely locally and does not transmit any data to the server.
- Token values are never logged by the CLI during logout. Only the host and boolean cleared status are output.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.session.logout` | User successfully logs out via web `POST /api/auth/logout` | `user_id`, `session_age_hours` (time from session creation to logout), `session_key_prefix` (first 8 chars) |
| `auth.cli.logout` | User runs `codeplane auth logout` in the CLI | `host`, `cleared` (boolean — whether a token was actually removed), `had_env_token` (boolean — whether `CODEPLANE_TOKEN` was set) |
| `auth.tui.logout` | User logs out from the TUI | `host`, `cleared` (boolean) |
| `auth.desktop.logout` | User logs out from the desktop app | `host` |
| `auth.editor.logout` | User logs out from VS Code or Neovim | `editor` (vscode or neovim), `host` |

### Funnel Metrics and Success Indicators

1. **Logout Completion Rate**: `auth.session.logout` / (logout button clicks) — target: >99%. A low rate indicates the logout endpoint is failing or the UI is broken.
2. **Session Age at Logout**: Median and p95 of `session_age_hours` — indicates how long users stay logged in. Very short sessions (<1h) may indicate UX problems driving users away. Very long sessions (>29 days) indicate users are staying until expiration rather than explicitly logging out.
3. **CLI Token Hygiene**: Ratio of `auth.cli.logout` events with `cleared: true` vs `cleared: false` — a high `false` rate means users are running logout when they're already logged out (possibly confused).
4. **CODEPLANE_TOKEN Warning Rate**: Percentage of `auth.cli.logout` events with `had_env_token: true` — indicates how many users are using environment variable tokens and might be surprised that logout doesn't fully de-authenticate.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| Logout endpoint called | `INFO` | `user_id` (if session was valid), `session_key_prefix` (first 8 chars), `request_id`, `had_valid_session` (boolean) |
| Session deleted from database | `INFO` | `user_id`, `session_key_prefix`, `request_id` |
| Logout with no session cookie | `DEBUG` | `request_id` |
| Logout with invalid session key format | `DEBUG` | `cookie_value_length`, `request_id` |
| Logout with already-deleted session | `DEBUG` | `session_key_prefix`, `request_id` |
| Session cookie cleared | `DEBUG` | `cookie_name`, `request_id` |
| CSRF cookie cleared | `DEBUG` | `request_id` |
| Logout database error | `ERROR` | `error_message`, `session_key_prefix`, `request_id` |
| CLI logout executed | `INFO` | `host`, `cleared`, `had_env_token` |
| CLI logout keyring error | `ERROR` | `host`, `error_message` |

**CRITICAL:** Full session key values must NEVER appear in logs. Only the first 8 characters (prefix) may be logged for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_auth_logout_total` | Counter | `result` (success, no_session, invalid_session, error) | Total logout requests by outcome |
| `codeplane_auth_logout_duration_seconds` | Histogram | — | Time to process a logout request (including DB deletion) |
| `codeplane_auth_session_age_at_logout_hours` | Histogram | — | Session age when explicitly logged out (not expired/revoked) |
| `codeplane_auth_cookies_cleared_total` | Counter | `cookie_name` (codeplane_session, __csrf) | Cookies cleared during logout |
| `codeplane_cli_logout_total` | Counter | `cleared` (true, false), `had_env_token` (true, false) | CLI logout operations |

### Alerts and Runbooks

#### Alert: `AuthLogoutErrorRateHighAlert`
- **Condition**: `rate(codeplane_auth_logout_total{result="error"}[5m]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Check application logs for `ERROR`-level logout entries — look at the `error_message` field.
  2. Verify database connectivity. The most likely cause is the `auth_sessions` table being unreachable.
  3. Run a manual `DELETE FROM auth_sessions WHERE session_key = '<test-key>'` to confirm DB write access.
  4. Check if a recent migration or schema change affected the `auth_sessions` table.
  5. If the database is healthy, check for unusual request patterns (e.g., malformed payloads triggering unexpected code paths).
  6. Escalate to the database team if connection pool exhaustion is suspected.

#### Alert: `AuthLogoutLatencyHighAlert`
- **Condition**: `histogram_quantile(0.99, codeplane_auth_logout_duration_seconds) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Logout should be a single `DELETE` query — p99 above 2 seconds indicates database pressure.
  2. Check database connection pool metrics. Are connections being exhausted by other high-throughput operations?
  3. Run `EXPLAIN ANALYZE` on the `DELETE FROM auth_sessions WHERE session_key = $1` query. Verify the `session_key` column is indexed.
  4. Check if the `auth_sessions` table has excessive row counts from sessions never being cleaned up. If so, run the session cleanup job manually.
  5. If running in daemon/desktop mode (PGLite), check local disk I/O.

#### Alert: `AuthLogoutSpikeSustainedAlert`
- **Condition**: `rate(codeplane_auth_logout_total[10m]) > 100`
- **Severity**: Info
- **Runbook**:
  1. Determine if the spike correlates with a server restart, deployment, or session configuration change that caused mass session invalidation.
  2. Check if a script or bot is programmatically calling the logout endpoint.
  3. Verify rate limiting is engaged — check `codeplane_auth_rate_limit_hits_total{endpoint="/api/auth/logout"}`.
  4. If legitimate (e.g., org-wide password rotation policy), no action needed. Document the event.

### Error Cases and Failure Modes

| Error Case | Behavior | HTTP Status |
|------------|----------|-------------|
| Database unavailable during session deletion | Logout fails, error returned | 500 |
| Session key is empty or whitespace | No DB query issued, cookies still cleared | 204 |
| Session key is not a valid UUID | No DB query issued, cookies still cleared | 204 |
| Session already deleted from database | DELETE is a no-op, cookies still cleared | 204 |
| Session expired but still in database | Session deleted, cookies cleared | 204 |
| Network timeout on client side (web) | UI clears local state anyway, redirects to login | N/A (client handles) |
| CLI keyring backend unavailable | CLI returns error with exit code 1 | N/A (local) |
| CLI no token stored | CLI returns success with cleared: false | N/A (local) |
| Concurrent logout for same session | Both return 204 (idempotent delete) | 204 |

## Verification

### API Integration Tests

#### Core Logout Flow
- [ ] `test: POST /api/auth/logout with valid session returns 204 No Content`
- [ ] `test: POST /api/auth/logout deletes session from auth_sessions table`
- [ ] `test: POST /api/auth/logout clears codeplane_session cookie (expires=epoch, maxAge=-1)`
- [ ] `test: POST /api/auth/logout clears __csrf cookie (expires=epoch, maxAge=-1)`
- [ ] `test: POST /api/auth/logout response has empty body`
- [ ] `test: request with old session cookie after logout returns 401 on protected endpoint`
- [ ] `test: the cleared session cookie has path=/, HttpOnly=true, SameSite=Lax`
- [ ] `test: the cleared CSRF cookie has path=/, HttpOnly=false, SameSite=Strict`
- [ ] `test: Secure flag on cleared cookies matches server cookie secure configuration`

#### Idempotency and Edge Cases
- [ ] `test: POST /api/auth/logout with no session cookie returns 204`
- [ ] `test: POST /api/auth/logout with empty session cookie value returns 204`
- [ ] `test: POST /api/auth/logout with whitespace-only session cookie returns 204`
- [ ] `test: POST /api/auth/logout with non-UUID session cookie value returns 204 and clears cookie`
- [ ] `test: POST /api/auth/logout with session already deleted from database returns 204`
- [ ] `test: POST /api/auth/logout with expired session returns 204 and deletes the session record`
- [ ] `test: two concurrent POST /api/auth/logout for same session both return 204`
- [ ] `test: POST /api/auth/logout with session cookie value longer than 36 characters returns 204 (non-UUID, no DB query)`
- [ ] `test: POST /api/auth/logout with session cookie value of exactly 0 characters returns 204`
- [ ] `test: POST /api/auth/logout with valid UUID v4 format (36 characters) processes correctly`

#### Session Isolation
- [ ] `test: logging out one session does not invalidate another session for the same user`
- [ ] `test: user with two active sessions logs out of one; the other remains valid for API access`
- [ ] `test: user with two active sessions logs out of one; GET /api/user/sessions shows only the remaining session`

#### Rate Limiting
- [ ] `test: 30 logout requests within one minute from the same IP all succeed`
- [ ] `test: 31st logout request within one minute from the same IP is rate-limited (429)`

### CLI Integration Tests

- [ ] `cli: codeplane auth logout returns exit code 0 when authenticated`
- [ ] `cli: codeplane auth logout returns exit code 0 when no token stored (no-op)`
- [ ] `cli: codeplane auth logout --json returns JSON with status, host, cleared, and message fields`
- [ ] `cli: codeplane auth logout --json reports cleared: true when a token was removed`
- [ ] `cli: codeplane auth logout --json reports cleared: false when no token was stored`
- [ ] `cli: codeplane auth logout warns about CODEPLANE_TOKEN env when set`
- [ ] `cli: codeplane auth logout --hostname specific.host.com clears token for that host only`
- [ ] `cli: codeplane auth logout does not affect tokens for other hosts`
- [ ] `cli: codeplane auth status after logout reports not logged in`
- [ ] `cli: CLI commands requiring auth fail with clear error after logout`
- [ ] `cli: codeplane auth logout does NOT make any HTTP request to the server`

### End-to-End (E2E) Tests — Playwright

- [ ] `e2e: authenticated user sees "Sign out" option in user menu`
- [ ] `e2e: clicking "Sign out" calls POST /api/auth/logout`
- [ ] `e2e: after clicking "Sign out", user is redirected to login page`
- [ ] `e2e: after sign out, navigating to a protected page (e.g., /settings) redirects to login`
- [ ] `e2e: after sign out, browser back button to a protected page does not restore authenticated state`
- [ ] `e2e: after sign out, refreshing the login page does not auto-sign-in`
- [ ] `e2e: signing out on one tab while another tab is open; the other tab loses auth on next navigation/API call`
- [ ] `e2e: signing out while SSE notification stream is active gracefully closes the stream`
- [ ] `e2e: sign out followed by sign in creates a new session (different session cookie value)`

### End-to-End (E2E) Tests — API

- [ ] `e2e/api: full login → authenticated request → logout → unauthenticated request flow`
- [ ] `e2e/api: login from two clients → logout from one → other client still works → logout from other`
- [ ] `e2e/api: logout → verify session no longer appears in GET /api/user/sessions from another session`

### Security-Focused Tests

- [ ] `security: logout response does not leak user information in headers or body`
- [ ] `security: logout cookie clearance uses same domain/path attributes as issuance`
- [ ] `security: cross-origin POST to /api/auth/logout is blocked by SameSite=Lax on the session cookie`
- [ ] `security: logout endpoint does not accept GET requests (method not allowed)`
- [ ] `security: full session key never appears in server logs during logout`

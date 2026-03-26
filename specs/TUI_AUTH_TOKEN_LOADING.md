# TUI_AUTH_TOKEN_LOADING

Specification for TUI_AUTH_TOKEN_LOADING.

## High-Level User POV

When a developer launches the Codeplane TUI via `codeplane tui`, the very first thing that happens is authentication. The TUI needs to know who the user is so it can display their repositories, issues, notifications, and other data. Rather than asking the user to log in every time, the TUI automatically picks up credentials that were previously established through the CLI.

The experience is designed to be invisible when everything is working. The user runs `codeplane tui`, sees a brief "Authenticating…" spinner with the target host name, and within a second or two lands on the dashboard — fully authenticated. A small confirmation banner appears in the status bar showing their username and how they were authenticated (e.g., "✓ wcory via keyring"), which fades after three seconds.

If the user has not yet authenticated, the TUI shows a clear, actionable error screen explaining that no token was found and instructing them to run `codeplane auth login` or set the `CODEPLANE_TOKEN` environment variable. If their token has expired or been revoked, a different error screen tells them their session has expired and guides them to re-authenticate. Both error screens offer a retry option (`R`) and a quit option (`q`), so the user can fix the issue in another terminal tab and retry without restarting the TUI.

In situations where the network is unavailable — such as working on an airplane or inside a restricted container — the TUI proceeds optimistically. It shows a persistent "⚠ offline — token not verified" warning in the status bar but does not block the user from navigating the interface. This allows users to continue working with any cached data even when they cannot reach the Codeplane API server.

The token is never displayed on screen in any form. Users in shared terminal sessions or screen-recording scenarios can trust that their credentials are not visually exposed.

The TUI supports three token sources in priority order: the `CODEPLANE_TOKEN` environment variable (for CI, containers, and headless workflows), the system keyring (the default after running `codeplane auth login`), and a legacy config file (automatically migrated to the keyring on first use). This priority order ensures that explicit overrides always win, while the default experience of "log in once via the CLI, use everywhere" just works.

## Acceptance Criteria

### Definition of Done

The TUI authentication token loading feature is complete when:

- [ ] The TUI resolves an authentication token from the correct source in the correct priority order on every launch
- [ ] The TUI validates the resolved token against the API server before rendering the main application
- [ ] All five authentication states (loading, authenticated, unauthenticated, expired, offline) have dedicated, correct UI representations
- [ ] The user is never blocked from retrying authentication without restarting the TUI
- [ ] The token value is never rendered to the terminal output in any state
- [ ] All e2e tests in the `TUI_AUTH_TOKEN_LOADING` test block pass

### Token Resolution

- [ ] `CODEPLANE_TOKEN` environment variable is checked first
- [ ] System keyring (macOS Keychain, Linux Secret Service, Windows Credential Locker) is checked second
- [ ] Legacy config file (`~/.config/codeplane/config.toon`) is checked third
- [ ] If `CODEPLANE_TOKEN` is set but contains only whitespace, it is treated as absent (fall through to next source)
- [ ] If `CODEPLANE_TOKEN` is set to an empty string, it is treated as absent
- [ ] If multiple sources contain tokens, only the highest-priority source is used
- [ ] When a legacy config file token is used, it is automatically migrated to the system keyring and scrubbed from the config file
- [ ] If `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` is set, the keyring source is skipped entirely
- [ ] Token resolution completes within 2 seconds under normal conditions

### Token Validation

- [ ] The resolved token is validated via `GET /api/user` with `Authorization: token {TOKEN}` header
- [ ] Validation request has a 5-second timeout enforced via AbortController
- [ ] A `200 OK` response sets status to `"authenticated"` and extracts the username
- [ ] A `401 Unauthorized` response sets status to `"expired"`
- [ ] A `429 Too Many Requests` response sets status to `"offline"` (proceed optimistically)
- [ ] A network error (connection refused, DNS failure, etc.) sets status to `"offline"`
- [ ] A timeout sets status to `"offline"` (proceed optimistically)
- [ ] Any other HTTP error (500, 502, 503, etc.) sets status to `"offline"`

### Loading State

- [ ] A loading screen is shown immediately upon TUI launch, before token resolution begins
- [ ] The loading screen displays a spinner animation and "Authenticating…" text
- [ ] The loading screen displays the target host name, truncated if it exceeds terminal width
- [ ] All keyboard input except `Ctrl+C` is consumed during loading (no navigation possible)
- [ ] `Ctrl+C` exits the TUI immediately during loading
- [ ] The in-flight validation request is aborted on `Ctrl+C` via the global AbortController

### No-Token Error State

- [ ] When no token is found from any source, the error screen displays "Not authenticated"
- [ ] The error screen shows the target host name
- [ ] The error screen instructs the user to run `codeplane auth login` or set `CODEPLANE_TOKEN`
- [ ] The `q` key quits the TUI from this screen
- [ ] The `R` key triggers a retry (re-runs full token resolution and validation)
- [ ] `Ctrl+C` quits the TUI from this screen
- [ ] Retry is debounced: pressing `R` multiple times within 1 second triggers only one retry

### Expired Token Error State

- [ ] When the API returns 401, the error screen displays "Session expired"
- [ ] The error screen shows the token source (e.g., "keyring", "config file", "CODEPLANE_TOKEN env")
- [ ] The error screen shows the target host name
- [ ] The error screen instructs the user to run `codeplane auth login`
- [ ] The `q`, `R`, and `Ctrl+C` keybindings work identically to the no-token screen
- [ ] Retry debouncing works identically to the no-token screen

### Offline Mode

- [ ] When the TUI proceeds in offline mode, the main application is rendered (not blocked)
- [ ] A persistent warning "⚠ offline — token not verified" appears in the status bar center section
- [ ] The warning remains visible for the entire session (does not auto-dismiss)
- [ ] API requests made during offline mode fail gracefully with inline error messages

### Successful Authentication

- [ ] On successful authentication, the main application renders immediately
- [ ] A confirmation banner "✓ {username} via {tokenSource}" appears in the status bar
- [ ] The confirmation banner auto-dismisses after 3 seconds
- [ ] The username is truncated if the banner would exceed 40 characters
- [ ] The token source is displayed as a human-readable label: "keyring", "env", or "config"

### Security

- [ ] The token string is never rendered to the terminal buffer in any authentication state
- [ ] The token string is never included in log output at any log level
- [ ] The token string is never included in telemetry event properties
- [ ] The token string is never included in error messages shown to the user

### Boundary Constraints

- [ ] Host names up to 253 characters (maximum DNS name length) are handled without crash
- [ ] Usernames up to 255 characters are truncated gracefully in the status bar
- [ ] Tokens up to 4,096 characters are accepted and validated
- [ ] Tokens larger than 4,096 characters are rejected with a clear error message
- [ ] The auth flow works correctly at minimum terminal size (80×24)
- [ ] The auth flow works correctly at standard terminal size (120×40)
- [ ] The auth flow works correctly at large terminal size (200×60)
- [ ] Terminal resize during the loading screen triggers re-layout without crash

### Edge Cases

- [ ] If the system keyring is locked and requires a password, the TUI falls through to the next source (does not hang)
- [ ] If the config file is malformed or unreadable, the TUI falls through gracefully
- [ ] If the config file does not exist, the TUI proceeds without error
- [ ] If `CODEPLANE_API_URL` is set to an invalid URL, the validation fails gracefully with an offline status
- [ ] If `CODEPLANE_API_URL` points to a non-Codeplane server, the validation fails gracefully
- [ ] Multiple rapid retries (pressing `R` repeatedly) do not create multiple concurrent validation requests
- [ ] If a retry is in progress and the user presses `q`, the in-flight request is aborted and the TUI exits

## Design

### TUI UI

#### Auth Loading Screen

The loading screen occupies the full terminal and is structured in three sections matching the standard TUI layout:

```
┌─────────────────────────────────────────────────┐
│ Codeplane                                       │  ← Header bar (minimal)
├─────────────────────────────────────────────────┤
│                                                 │
│                                                 │
│              ⠋ Authenticating…                  │  ← Centered vertically
│              Connecting to api.codeplane.app     │  ← Target host, muted color
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│                              Ctrl+C quit        │  ← Status bar
└─────────────────────────────────────────────────┘
```

- The spinner character cycles through the braille spinner sequence (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) at 80ms intervals
- "Authenticating…" uses the default text color
- The host line uses the `muted` color token (gray 245)
- If the host name exceeds `terminal_width - 20`, it is truncated with `…` suffix
- The header bar shows only the application name, no breadcrumbs
- The status bar shows only "Ctrl+C quit" right-aligned

#### Auth Error Screen — No Token

```
┌─────────────────────────────────────────────────┐
│ Codeplane                                       │
├─────────────────────────────────────────────────┤
│                                                 │
│              ✗ Not authenticated                │  ← Error color (red 196)
│                                                 │
│              No token found for                 │
│              api.codeplane.app                  │  ← Muted color
│                                                 │
│              Run `codeplane auth login`          │
│              or set CODEPLANE_TOKEN              │
│                                                 │
├─────────────────────────────────────────────────┤
│ q quit  R retry                  Ctrl+C quit    │
└─────────────────────────────────────────────────┘
```

- "✗ Not authenticated" uses the `error` color token
- The instruction text uses the default text color
- `codeplane auth login` is rendered in bold or highlighted to stand out
- `CODEPLANE_TOKEN` is rendered in bold or highlighted

#### Auth Error Screen — Expired Token

```
┌─────────────────────────────────────────────────┐
│ Codeplane                                       │
├─────────────────────────────────────────────────┤
│                                                 │
│              ✗ Session expired                  │  ← Error color (red 196)
│                                                 │
│              Stored token from keyring           │
│              is invalid or expired.              │
│              Host: api.codeplane.app             │  ← Muted color
│                                                 │
│              Run `codeplane auth login`          │
│              to re-authenticate.                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ q quit  R retry                  Ctrl+C quit    │
└─────────────────────────────────────────────────┘
```

- Token source is shown as human-readable label: "keyring", "config file", or "CODEPLANE_TOKEN env"
- The host is shown on a separate line in muted color

#### Status Bar — Auth Confirmation Banner

After successful authentication, the status bar's center section temporarily shows:

```
│ g goto  : cmd                ✓ wcory via keyring              ? help │
```

- The `✓` uses the `success` color token (green 34)
- The username and source use the default text color
- The banner auto-dismisses after 3 seconds, returning to the normal sync status display
- If the username + source label exceeds 36 characters, the username is truncated with `…`

#### Status Bar — Offline Warning

When in offline mode, the status bar's center section persistently shows:

```
│ g goto  : cmd             ⚠ offline — token not verified       ? help │
```

- The `⚠` uses the `warning` color token (yellow 178)
- This warning persists for the entire session and does not dismiss

#### Responsive Behavior

**80×24 (Minimum):**
- Loading screen: host name truncated aggressively, centered content vertically compressed
- Error screens: instruction text may wrap, keybinding hints abbreviated
- Modals use 90% width

**120×40 (Standard):**
- Full layout as shown in wireframes above
- All text fits without truncation for typical host names and usernames

**200×60 (Large):**
- Same layout with more vertical whitespace around centered content
- No additional information shown (auth screens are intentionally minimal)

### CLI Command

The TUI is launched via:

```bash
codeplane tui [--repo OWNER/REPO] [--screen SCREEN_NAME] [--debug]
```

Authentication-relevant environment variables:

| Variable | Purpose | Default |
|----------|---------|--------|
| `CODEPLANE_TOKEN` | Override token (highest priority) | none |
| `CODEPLANE_API_URL` | API server URL | `http://localhost:3000` |
| `CODEPLANE_DISABLE_SYSTEM_KEYRING` | Set to `1` to skip keyring lookup | `0` |
| `CODEPLANE_TUI_DEBUG` | Enable debug logging | `false` |
| `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` | Path to JSON test credential store (testing only) | none |

### Documentation

End-user documentation should cover:

- **"Authenticating with the TUI"** section in TUI guide explaining that users must first run `codeplane auth login` before launching `codeplane tui`
- **"Token sources"** subsection explaining the three sources and their priority order
- **"Headless environments"** subsection explaining `CODEPLANE_TOKEN` for CI/containers/SSH
- **"Offline mode"** subsection explaining that the TUI proceeds without blocking when the API is unreachable
- **"Troubleshooting authentication"** section covering:
  - "Not authenticated" error → run `codeplane auth login`
  - "Session expired" error → run `codeplane auth login` again
  - Persistent offline warning → check `CODEPLANE_API_URL` and network connectivity
  - Keyring issues → use `CODEPLANE_TOKEN` as fallback

## Permissions & Security

### Authorization Roles

- **Any authenticated user**: Can launch the TUI and have their token validated. The TUI itself does not enforce role-based access — that is handled by the API on a per-request basis.
- **Unauthenticated users**: See the "Not authenticated" error screen. Cannot access any TUI functionality.
- **Users with expired tokens**: See the "Session expired" error screen. Cannot access any TUI functionality until re-authenticating.

### Token Security

- The authentication token is stored in the process memory only. It is never written to disk by the TUI.
- The token is passed to the API client provider via React context, not via global state or environment mutation.
- The token is transmitted only over the network to the configured `CODEPLANE_API_URL` via the `Authorization` header.
- If `CODEPLANE_API_URL` uses `http://` (not `https://`), the token is transmitted in plaintext. This is acceptable for local development (`localhost`) but documentation should warn against using plain HTTP for remote servers.

### Rate Limiting

- Token validation requests (`GET /api/user`) are subject to the API server's standard rate limits.
- If the validation endpoint returns `429 Too Many Requests`, the TUI proceeds in offline mode rather than retrying.
- The retry debounce (1 second) prevents rapid retry loops from the user.
- There is no client-side rate limit on retries beyond the debounce — the server's rate limiting is the backstop.

### Data Privacy

- The username extracted from the validation response is displayed briefly in the status bar. This is acceptable as the user is already authenticated.
- The token source (env, keyring, config) is displayed in error screens. This does not constitute PII exposure.
- No token material, partial token strings, or token hashes are ever displayed or logged.
- Debug logging (`CODEPLANE_TUI_DEBUG=true`) logs the token source and host but never the token value.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `tui.auth.started` | `host`, `api_url` | Auth process begins on TUI launch |
| `tui.auth.resolved` | `host`, `source` ("env" / "keyring" / "config") | Token successfully resolved from a source |
| `tui.auth.validated` | `host`, `source`, `username` | Token validated successfully (200 OK) |
| `tui.auth.failed` | `host`, `reason` ("no_token" / "expired" / "network_error" / "timeout") | Auth failed at any stage |
| `tui.auth.offline_proceed` | `host`, `source`, `failure_type` ("network_error" / "timeout" / "rate_limited") | User proceeds in offline mode |
| `tui.auth.retry` | `host`, `attempt_number` | User presses R to retry |

### Properties

- `host`: The normalized hostname of the target API server (e.g., `api.codeplane.app`)
- `source`: The token source that was used or attempted
- `reason`: Why authentication failed
- `username`: The authenticated user's login name (only on successful validation)
- `api_url`: The full API URL being targeted
- `failure_type`: The specific type of network-related failure
- `attempt_number`: Which retry attempt this is (1-indexed)

### Funnel Metrics

- **Auth success rate**: `tui.auth.validated` / `tui.auth.started` — target >95%
- **Token resolution rate**: `tui.auth.resolved` / `tui.auth.started` — target >98%
- **Offline proceed rate**: `tui.auth.offline_proceed` / `tui.auth.started` — should be <5% (high rates indicate infrastructure problems)
- **Retry rate**: `tui.auth.retry` / `tui.auth.failed` — indicates UX clarity (high = users know to retry; too high = frustrating UX)
- **No-token rate**: count of `tui.auth.failed` where `reason=no_token` — indicates onboarding friction
- **Token source distribution**: breakdown of `source` in `tui.auth.resolved` — tracks migration from legacy config to keyring

## Observability

### Logging Requirements

| Log Entry | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| Auth flow started | `info` | `{ host, api_url }` | On TUI launch, before token resolution |
| Token resolved | `info` | `{ source, host }` | After successful token resolution |
| No token found | `warn` | `{ host, sources_checked: ["env", "keyring", "config"] }` | After all sources exhausted |
| Validation request sent | `debug` | `{ host, timeout_ms: 5000 }` | Before `GET /api/user` |
| Validation succeeded | `info` | `{ host, source, username, response_time_ms }` | On 200 OK |
| Validation failed (401) | `warn` | `{ host, source, status_code: 401 }` | On 401 Unauthorized |
| Validation failed (network) | `warn` | `{ host, source, error_type, error_message }` | On network error or timeout |
| Proceeding offline | `info` | `{ host, source, failure_type }` | When entering offline mode |
| Retry initiated | `info` | `{ host, attempt_number }` | On user retry |
| Retry debounced | `debug` | `{ host, time_since_last_retry_ms }` | When retry is suppressed by debounce |
| Validation request aborted | `debug` | `{ host, reason: "user_exit" }` | On Ctrl+C during validation |
| Keyring access failed | `warn` | `{ host, error_message }` | When keyring backend throws |
| Config file read failed | `warn` | `{ config_path, error_message }` | When config file is unreadable |
| Legacy token migrated | `info` | `{ host }` | When legacy config token is moved to keyring |

**CRITICAL**: Token values must NEVER appear in any log entry at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `tui_auth_attempts_total` | Counter | `result` (success/failure/offline) | Total auth attempts |
| `tui_auth_token_source_total` | Counter | `source` (env/keyring/config/none) | Token resolution by source |
| `tui_auth_validation_duration_seconds` | Histogram | `result` (success/failure/timeout) | Time spent validating token |
| `tui_auth_retries_total` | Counter | — | Total retry button presses |
| `tui_auth_failure_reason_total` | Counter | `reason` (no_token/expired/network_error/timeout) | Auth failures by reason |
| `tui_auth_offline_sessions_total` | Counter | `failure_type` (network_error/timeout/rate_limited) | Sessions that proceeded offline |

### Alerts

#### Alert: High Auth Failure Rate

- **Condition**: `rate(tui_auth_attempts_total{result="failure"}[5m]) / rate(tui_auth_attempts_total[5m]) > 0.2`
- **Severity**: Warning
- **Runbook**:
  1. Check `tui_auth_failure_reason_total` to determine the dominant failure reason.
  2. If `reason=expired`: Check if the API server rotated signing keys or if there was a mass token revocation. Verify the auth service is healthy.
  3. If `reason=no_token`: Check if a new release broke the keyring integration or if the CLI's `auth login` flow is broken. Check installation/onboarding docs.
  4. If `reason=network_error`: Proceed to the "High Offline Rate" alert runbook.
  5. Check recent deployments for regressions in the CLI credential storage or TUI token resolution code.

#### Alert: High Offline Proceed Rate

- **Condition**: `rate(tui_auth_offline_sessions_total[5m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check API server health (`/api/health` endpoint).
  2. Check network connectivity between TUI users and the API server (firewall changes, DNS issues, load balancer health).
  3. Check if the validation endpoint (`GET /api/user`) is experiencing elevated latency (>5s p99 would cause timeouts).
  4. Check for `429` responses — if users are hitting rate limits, investigate if there's an amplification issue or if rate limits are too aggressive.
  5. If limited to specific regions/networks, coordinate with infrastructure team.

#### Alert: Validation Latency Spike

- **Condition**: `histogram_quantile(0.95, tui_auth_validation_duration_seconds) > 3`
- **Severity**: Warning
- **Runbook**:
  1. Check API server latency for `GET /api/user` endpoint.
  2. Check database connection pool health (token validation may require a DB lookup).
  3. Check for elevated error rates on the auth service.
  4. If latency is >5s, users will start hitting the timeout and entering offline mode — this cascades into the "High Offline Rate" alert.

#### Alert: Keyring Backend Errors

- **Condition**: Log-based alert on `warn` log entries matching `"Keyring access failed"` exceeding 5 per minute per host
- **Severity**: Info
- **Runbook**:
  1. Check the platform (macOS/Linux/Windows) experiencing the errors.
  2. On macOS: Verify Keychain Access is not in a locked state requiring user interaction. Check if macOS security updates changed `security` command behavior.
  3. On Linux: Verify `secret-tool` is installed and the Secret Service daemon (gnome-keyring-daemon or similar) is running.
  4. On all platforms: Users can work around keyring issues by setting `CODEPLANE_TOKEN` or `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`.

### Error Cases and Failure Modes

| Error Case | Detection | User Impact | Recovery |
|------------|-----------|-------------|----------|
| No token from any source | `tui.auth.failed{reason=no_token}` | Blocked at error screen | Run `codeplane auth login` or set `CODEPLANE_TOKEN` |
| Token expired or revoked | HTTP 401 from validation | Blocked at error screen | Run `codeplane auth login` |
| API server unreachable | Network error during validation | Proceeds offline with warning | Check network, wait for connectivity |
| Validation timeout (>5s) | AbortController timeout | Proceeds offline with warning | Check network or API server health |
| Rate limited (429) | HTTP 429 from validation | Proceeds offline with warning | Wait and retry |
| Keyring locked/unavailable | Exception from keyring backend | Falls through to next source | Use `CODEPLANE_TOKEN` env var |
| Config file corrupted | Parse error reading config | Falls through (no legacy token) | Re-run `codeplane auth login` |
| Invalid API URL | Malformed URL causes fetch error | Proceeds offline with warning | Fix `CODEPLANE_API_URL` value |
| Token too long (>4096 chars) | Client-side validation | Blocked with clear error | Regenerate token via `codeplane auth login` |
| Terminal too small (<80×24) | `useTerminalDimensions()` check | "Terminal too small" message | Resize terminal |
| Ctrl+C during validation | `globalAbort.abort()` fires | TUI exits cleanly | Relaunch |

## Verification

### E2E Tests — Auth Loading Screen

| Test ID | Description |
|---------|-------------|
| `AUTH-LOAD-01` | Renders the loading screen with spinner and "Authenticating…" text immediately on TUI launch |
| `AUTH-LOAD-02` | Loading screen displays the correct target host name |
| `AUTH-LOAD-03` | Loading screen layout renders correctly at 80×24 minimum terminal size |
| `AUTH-LOAD-04` | Loading screen layout renders correctly at 120×40 standard terminal size |
| `AUTH-LOAD-05` | Loading screen layout renders correctly at 200×60 large terminal size |
| `AUTH-LOAD-06` | Host name longer than terminal width minus 20 is truncated with `…` |
| `AUTH-LOAD-07` | Host name at exactly the maximum display length (253 chars) does not crash |
| `AUTH-LOAD-08` | Status bar shows "Ctrl+C quit" hint during loading |
| `AUTH-LOAD-09` | Header bar shows "Codeplane" application name during loading |
| `AUTH-LOAD-10` | Spinner animation cycles through braille characters (snapshot at multiple intervals) |
| `AUTH-LOAD-11` | Terminal resize during loading screen triggers re-layout without crash |

### E2E Tests — No-Token Error Screen

| Test ID | Description |
|---------|-------------|
| `AUTH-NOTOKEN-01` | Renders "Not authenticated" error when no token is available from any source |
| `AUTH-NOTOKEN-02` | Error screen displays the target host name |
| `AUTH-NOTOKEN-03` | Error screen shows instruction to run `codeplane auth login` |
| `AUTH-NOTOKEN-04` | Error screen shows instruction to set `CODEPLANE_TOKEN` |
| `AUTH-NOTOKEN-05` | Error screen layout renders correctly at 80×24 |
| `AUTH-NOTOKEN-06` | Error screen layout renders correctly at 120×40 |
| `AUTH-NOTOKEN-07` | Error screen layout renders correctly at 200×60 |
| `AUTH-NOTOKEN-08` | Status bar shows keybinding hints: `q quit`, `R retry`, `Ctrl+C quit` |
| `AUTH-NOTOKEN-09` | Empty `CODEPLANE_TOKEN` (empty string) is treated as absent and shows no-token error |
| `AUTH-NOTOKEN-10` | Whitespace-only `CODEPLANE_TOKEN` (spaces, tabs) is treated as absent |

### E2E Tests — Expired Token Error Screen

| Test ID | Description |
|---------|-------------|
| `AUTH-EXPIRED-01` | Renders "Session expired" error when API returns 401 |
| `AUTH-EXPIRED-02` | Error screen displays token source as "keyring" when token came from keyring |
| `AUTH-EXPIRED-03` | Error screen displays token source as "CODEPLANE_TOKEN env" when token came from env |
| `AUTH-EXPIRED-04` | Error screen displays token source as "config file" when token came from legacy config |
| `AUTH-EXPIRED-05` | Error screen displays the target host name |
| `AUTH-EXPIRED-06` | Error screen shows instruction to run `codeplane auth login` |
| `AUTH-EXPIRED-07` | Error screen layout renders correctly at 80×24 |
| `AUTH-EXPIRED-08` | Error screen layout renders correctly at 120×40 |

### E2E Tests — Offline Mode

| Test ID | Description |
|---------|-------------|
| `AUTH-OFFLINE-01` | TUI proceeds to main application when API server is unreachable |
| `AUTH-OFFLINE-02` | TUI proceeds to main application when validation request times out (>5s) |
| `AUTH-OFFLINE-03` | TUI proceeds to main application when API returns 429 |
| `AUTH-OFFLINE-04` | Status bar shows "⚠ offline — token not verified" warning |
| `AUTH-OFFLINE-05` | Offline warning persists in status bar and does not auto-dismiss |
| `AUTH-OFFLINE-06` | Main application screens are navigable in offline mode |

### E2E Tests — Successful Authentication

| Test ID | Description |
|---------|-------------|
| `AUTH-SUCCESS-01` | TUI renders main application after successful token validation |
| `AUTH-SUCCESS-02` | Status bar shows "✓ {username} via keyring" confirmation banner |
| `AUTH-SUCCESS-03` | Status bar shows "✓ {username} via env" when authenticated via CODEPLANE_TOKEN |
| `AUTH-SUCCESS-04` | Status bar shows "✓ {username} via config" when authenticated via legacy config |
| `AUTH-SUCCESS-05` | Confirmation banner auto-dismisses after 3 seconds |
| `AUTH-SUCCESS-06` | Username longer than 30 characters is truncated with `…` in banner |
| `AUTH-SUCCESS-07` | Auth from CODEPLANE_TOKEN takes priority over keyring token |
| `AUTH-SUCCESS-08` | Auth from keyring takes priority over legacy config file token |

### E2E Tests — Token Resolution Priority

| Test ID | Description |
|---------|-------------|
| `AUTH-PRIORITY-01` | When both CODEPLANE_TOKEN and keyring have tokens, CODEPLANE_TOKEN is used |
| `AUTH-PRIORITY-02` | When only keyring has a token, keyring token is used |
| `AUTH-PRIORITY-03` | When only legacy config has a token, config token is used |
| `AUTH-PRIORITY-04` | When CODEPLANE_DISABLE_SYSTEM_KEYRING=1 is set, keyring is skipped |
| `AUTH-PRIORITY-05` | When CODEPLANE_TOKEN is whitespace and keyring has a token, keyring token is used |

### E2E Tests — Security

| Test ID | Description |
|---------|-------------|
| `AUTH-SEC-01` | Token value does not appear anywhere in terminal buffer during loading screen |
| `AUTH-SEC-02` | Token value does not appear anywhere in terminal buffer after successful authentication |
| `AUTH-SEC-03` | Token value does not appear anywhere in terminal buffer on expired token error screen |
| `AUTH-SEC-04` | Token value does not appear anywhere in terminal buffer on no-token error screen |

### E2E Tests — Keyboard Interactions

| Test ID | Description |
|---------|-------------|
| `AUTH-KEY-01` | `Ctrl+C` exits the TUI during loading screen |
| `AUTH-KEY-02` | `q` quits the TUI from the no-token error screen |
| `AUTH-KEY-03` | `q` quits the TUI from the expired token error screen |
| `AUTH-KEY-04` | `R` triggers retry from the no-token error screen |
| `AUTH-KEY-05` | `R` triggers retry from the expired token error screen |
| `AUTH-KEY-06` | Retry shows loading screen again before resolving |
| `AUTH-KEY-07` | Rapid `R` presses (within 1 second) trigger only one retry |
| `AUTH-KEY-08` | `j`, `k`, `g`, `:`, and other navigation keys are inactive during loading |
| `AUTH-KEY-09` | `Esc` does not cause errors on loading or error screens |
| `AUTH-KEY-10` | `q` on error screen followed by immediate relaunch works correctly |

### E2E Tests — Boundary and Edge Cases

| Test ID | Description |
|---------|-------------|
| `AUTH-EDGE-01` | Token at exactly 4,096 characters is accepted and validated |
| `AUTH-EDGE-02` | Token at 4,097 characters is rejected with a clear error |
| `AUTH-EDGE-03` | Host name at 253 characters (max DNS length) renders without crash |
| `AUTH-EDGE-04` | API URL with trailing slash is handled correctly |
| `AUTH-EDGE-05` | API URL without trailing slash is handled correctly |
| `AUTH-EDGE-06` | API URL with path component (e.g., `https://example.com/codeplane`) is handled |
| `AUTH-EDGE-07` | Unicode characters in username display correctly in status bar |
| `AUTH-EDGE-08` | CODEPLANE_API_URL set to malformed URL (not a valid URL) fails gracefully to offline mode |
| `AUTH-EDGE-09` | Multiple TUI instances can authenticate concurrently without keyring contention |
| `AUTH-EDGE-10` | Auth flow completes successfully after terminal resize from 80×24 to 200×60 during loading |

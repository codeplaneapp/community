# TUI_AUTH_TOKEN_LOADING

Specification for TUI_AUTH_TOKEN_LOADING.

## High-Level User POV

When a terminal user launches the TUI via `codeplane tui`, the very first thing they see is a brief loading state while the application resolves their authentication credentials. This happens in the first fraction of a second after render: the TUI reads their stored token from the system keychain, checks for a `CODEPLANE_TOKEN` environment variable, or falls back to the legacy config file — following the same resolution chain as the CLI.

If a valid token is found, the TUI silently validates it against the Codeplane API by calling `GET /api/user`. During this validation, the user sees a minimal loading screen with a spinner and the text "Authenticating…" centered in the terminal. The host being authenticated against is shown below the spinner (e.g., `api.codeplane.app`). This screen occupies the full content area between the header bar and status bar, maintaining the standard app shell chrome.

If validation succeeds, the user is seamlessly transitioned to the dashboard (or to a deep-linked screen if one was specified via `--screen`). The authenticated username and token source (keyring, env, or config) are displayed briefly in the status bar as a confirmation (e.g., `✓ alice via keyring`), then the status bar returns to its normal state after 3 seconds.

If no token is found at all, the user sees an error screen with a clear message: "Not authenticated" followed by instructions to run `codeplane auth login` from their terminal. The user can press `q` or `Ctrl+C` to exit. The error screen also shows which host the TUI tried to authenticate against and mentions the `CODEPLANE_TOKEN` environment variable as an alternative.

If a token is found but validation fails (HTTP 401 or invalid response), the user sees a different error screen: "Session expired" with the same remediation instructions. The token source is mentioned so the user knows whether to clear their keychain entry or update their environment variable.

If the network is unreachable during validation, the TUI adopts an optimistic approach: it proceeds to load the application with the unverified token. A warning indicator appears in the status bar showing "⚠ offline — token not verified". The first API call that actually fails with a 401 will trigger the standard auth error handling (inline error with "Run `codeplane auth login` to re-authenticate"). This design ensures the TUI remains usable in intermittent-connectivity scenarios where the token may still be valid.

The entire auth token loading flow completes within the 200ms first-render budget for the common case (token found in keychain, network available). Token resolution itself is synchronous (keychain read); only the validation HTTP call is async. If the API server responds slowly, the spinner remains visible but the user can press `Ctrl+C` at any point to abort.

## Acceptance Criteria

### Definition of Done

- [ ] TUI resolves auth token from three sources in priority order: `CODEPLANE_TOKEN` env var → system keyring → legacy config file
- [ ] Token resolution uses the same `resolveAuthToken()` function from `apps/cli/src/auth-state.ts` (shared, not reimplemented)
- [ ] TUI validates the resolved token via `GET /api/user` before transitioning to the main application
- [ ] A loading screen with spinner and "Authenticating…" text is displayed during token validation
- [ ] The loading screen shows the target host (e.g., `api.codeplane.app`) below the spinner
- [ ] On successful validation, the TUI transitions to the dashboard or deep-linked screen
- [ ] On successful validation, the status bar briefly shows the authenticated username and token source for 3 seconds
- [ ] When no token is found, an error screen displays "Not authenticated" with `codeplane auth login` instructions
- [ ] When token validation returns 401, an error screen displays "Session expired" with re-authentication instructions
- [ ] When network is unreachable during validation, the TUI proceeds optimistically with the unverified token
- [ ] When proceeding with an unverified token, a persistent warning indicator appears in the status bar
- [ ] The user can press `q` to exit from the error screen
- [ ] The user can press `Ctrl+C` to abort at any point during auth loading
- [ ] The user can press `R` to retry token validation from the error screen
- [ ] Auth token loading completes within 200ms for the common case (cached keychain token + responsive API)
- [ ] Token validation has a 5-second timeout; if exceeded, the TUI proceeds optimistically (same as network-unreachable)

### Terminal Edge Cases

- [ ] At minimum terminal size (80×24), the loading screen centers the spinner and text vertically, truncating the host URL if it exceeds 76 characters
- [ ] At minimum terminal size, the error screen wraps the instruction text and remains fully readable
- [ ] If the terminal is resized during auth loading, the loading screen re-centers without restarting the auth flow
- [ ] If the terminal is resized during error display, the error screen re-renders at the new dimensions
- [ ] On terminals without color support (`TERM=dumb` or `NO_COLOR=1`), the spinner uses ASCII characters (`|/-\`) instead of Unicode braille
- [ ] On terminals without color support, status indicators use text labels instead of color-only indicators (e.g., `[OK]` instead of green dot)
- [ ] Rapid key input during auth loading is buffered; `Ctrl+C` is always processed immediately regardless of input queue depth

### Boundary Constraints

- [ ] Username display in the status bar is truncated to 20 characters with ellipsis (e.g., `very-long-userna…`)
- [ ] Host URL display on the loading screen is truncated to `terminal_width - 4` characters with ellipsis
- [ ] Token source label is one of exactly three values: `keyring`, `env`, `config` — no other values are displayed
- [ ] The error screen message is wrapped to fit within the terminal width minus 4 characters of padding
- [ ] The error screen `codeplane auth login` command is displayed as a distinct highlighted text block, never split across lines
- [ ] The auth confirmation in the status bar (`✓ alice via keyring`) never exceeds 40 characters total; username is truncated first

### Security Constraints

- [ ] The raw token value is never displayed on screen, in logs, or in error messages
- [ ] The token is held in memory only within the auth context provider; it is not written to any temporary file
- [ ] If `CODEPLANE_TOKEN` is set to an empty or whitespace-only string, it is treated as absent (not as an empty token)

## Design

### Loading Screen Layout

```
┌─────────────────────────────────────────────────┐
│ Codeplane                                       │
├─────────────────────────────────────────────────┤
│                                                 │
│                                                 │
│                                                 │
│                   ⠋ Authenticating…              │
│                  api.codeplane.app               │
│                                                 │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│                                   Ctrl+C quit   │
└─────────────────────────────────────────────────┘
```

**OpenTUI component tree (loading):**

```tsx
<box flexDirection="column" width="100%" height="100%">
  <box height={1} borderBottom="single">
    <text bold color="primary">Codeplane</text>
  </box>
  <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
    <text>
      <text color="primary">{spinnerFrame}</text>
      <text> Authenticating…</text>
    </text>
    <text color="muted">{targetHost}</text>
  </box>
  <box height={1} borderTop="single" justifyContent="flex-end">
    <text color="muted">Ctrl+C quit</text>
  </box>
</box>
```

### Error Screen Layout (No Token)

```
┌─────────────────────────────────────────────────┐
│ Codeplane                                       │
├─────────────────────────────────────────────────┤
│                                                 │
│                                                 │
│           ✗ Not authenticated                   │
│                                                 │
│  No token found for api.codeplane.app.          │
│                                                 │
│  Run the following command to log in:            │
│                                                 │
│    codeplane auth login                         │
│                                                 │
│  Or set the CODEPLANE_TOKEN environment          │
│  variable.                                      │
│                                                 │
├─────────────────────────────────────────────────┤
│ q quit │ R retry                                │
└─────────────────────────────────────────────────┘
```

**OpenTUI component tree (no token error):**

```tsx
<box flexDirection="column" width="100%" height="100%">
  <box height={1} borderBottom="single">
    <text bold color="primary">Codeplane</text>
  </box>
  <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
    <text bold color="error">✗ Not authenticated</text>
    <text />
    <text>No token found for <text color="muted">{targetHost}</text>.</text>
    <text />
    <text>Run the following command to log in:</text>
    <text />
    <text color="primary" bold>  codeplane auth login</text>
    <text />
    <text>Or set the <text bold>CODEPLANE_TOKEN</text> environment variable.</text>
  </box>
  <box height={1} borderTop="single">
    <text color="muted">q quit │ R retry</text>
  </box>
</box>
```

### Error Screen Layout (Token Expired)

```
┌─────────────────────────────────────────────────┐
│ Codeplane                                       │
├─────────────────────────────────────────────────┤
│                                                 │
│           ✗ Session expired                     │
│                                                 │
│  Stored token for api.codeplane.app from        │
│  keyring is invalid or expired.                 │
│                                                 │
│  Run the following command to re-authenticate:   │
│                                                 │
│    codeplane auth login                         │
│                                                 │
├─────────────────────────────────────────────────┤
│ q quit │ R retry                                │
└─────────────────────────────────────────────────┘
```

### Keybindings

| Context | Key | Action |
|---------|-----|--------|
| Loading screen | `Ctrl+C` | Quit TUI immediately |
| Error screen | `q` | Quit TUI |
| Error screen | `Ctrl+C` | Quit TUI immediately |
| Error screen | `R` | Retry token resolution and validation |
| Error screen | `?` | Toggle help overlay |

No other keys are active during auth loading. Navigation keybindings (`g` prefix, `:` command palette) are not registered until auth completes successfully.

### Terminal Resize Behavior

- **Loading screen**: Re-centers spinner and host text on resize. Spinner animation continues uninterrupted. Auth flow is not restarted.
- **Error screen**: Re-wraps message text to fit new dimensions. The `codeplane auth login` command remains on a single line; if terminal is narrower than 30 columns, the leading indent is removed.
- **Minimum size (80×24)**: Full error message visible. Loading spinner fits comfortably.
- **Sub-minimum (< 80×24)**: Displays "Terminal too small" (handled by global responsive layout, not this feature).

### Data Hooks

| Hook / Function | Source | Purpose |
|----------------|--------|----------|
| `resolveAuthToken()` | `@codeplane/cli/auth-state` | Synchronous token resolution from env/keyring/config |
| `resolveAuthTarget()` | `@codeplane/cli/auth-state` | Resolve API URL and hostname from config |
| `getAuthStatus()` | `@codeplane/cli/auth-state` | Async token validation via `GET /api/user` |
| `useTerminalDimensions()` | `@opentui/react` | Current terminal width/height for layout |
| `useOnResize()` | `@opentui/react` | Re-render on terminal resize |
| `useKeyboard()` | `@opentui/react` | Handle `q`, `R`, `Ctrl+C` keybindings |

### Auth Context Provider

The auth loading feature provides an `<AuthProvider>` React context that wraps the entire TUI application:

```tsx
interface AuthContextValue {
  status: "loading" | "authenticated" | "unauthenticated" | "expired" | "offline";
  user: string | null;
  tokenSource: AuthTokenSource | null;
  apiUrl: string;
  host: string;
  token: string | null;
  retry: () => void;
}
```

The `<AuthProvider>` gates rendering of child screens: only `"authenticated"` and `"offline"` statuses proceed to the router. All other statuses render the loading or error screens within the provider itself.

## Permissions & Security

### Authorization

- **No role requirement for token loading**: The auth token loading feature itself does not require any specific authorization role. It resolves and validates whatever token is available.
- **Token validation endpoint** (`GET /api/user`): Requires a valid personal access token or OAuth token. Returns the user's profile if valid; returns 401 if invalid or expired.
- **Token scopes**: No specific scope is required for the validation call. Any valid Codeplane token can authenticate to `GET /api/user`.

### Token Handling

- The TUI does **not** implement OAuth browser flows. Users must authenticate via `codeplane auth login` before using the TUI.
- The TUI does **not** store, persist, or modify tokens. It is a read-only consumer of tokens stored by the CLI.
- The TUI does **not** create, rotate, or revoke tokens. Token management is performed via `codeplane auth token` CLI commands or the web UI settings.
- Token values are never logged, displayed, or included in error messages. Only the token source (`env`, `keyring`, `config`) and the last eight characters (if available from server responses) may be referenced.

### Rate Limiting

- The `GET /api/user` validation call is subject to the standard API rate limit. The TUI makes exactly **one** validation call at startup (plus one per retry).
- If rate-limited (HTTP 429), the TUI treats this as a network error and proceeds optimistically with the unverified token.
- The retry action (`R` key) is debounced: pressing `R` multiple times within 1 second only triggers one retry.

### Environment Security

- `CODEPLANE_TOKEN` is read from the process environment at startup. The TUI does not modify or unset this variable.
- The TUI respects `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` — when set, keyring lookup is skipped entirely.
- In test/CI environments, `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` redirects keyring reads to a JSON file instead of the system keyring.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.auth.started` | Auth token loading begins | `{ host, has_env_token: bool, timestamp }` |
| `tui.auth.resolved` | Token resolved successfully | `{ host, source: "env"\|"keyring"\|"config", duration_ms }` |
| `tui.auth.validated` | Token validated against API | `{ host, source, valid: bool, duration_ms, username_present: bool }` |
| `tui.auth.failed` | No token found or validation failed | `{ host, reason: "no_token"\|"expired"\|"invalid"\|"network_error"\|"timeout", source? }` |
| `tui.auth.offline_proceed` | User proceeded with unverified token | `{ host, source }` |
| `tui.auth.retry` | User pressed R to retry | `{ host, attempt_number }` |
| `tui.auth.quit` | User quit from auth error screen | `{ host, reason }` |

### Event Properties (Common)

- `host`: The Codeplane API host being authenticated against (e.g., `api.codeplane.app`)
- `source`: Token source — `"env"`, `"keyring"`, or `"config"`
- `duration_ms`: Time from auth start to resolution/validation completion
- `terminal_width`, `terminal_height`: Terminal dimensions at the time of the event

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Auth success rate | > 95% of TUI launches | Percentage of TUI launches that complete auth successfully on first attempt |
| Auth loading time (p50) | < 100ms | Median time from TUI launch to auth completion |
| Auth loading time (p95) | < 500ms | 95th percentile auth completion time |
| Auth loading time (p99) | < 2000ms | 99th percentile, including slow network validation |
| Retry success rate | > 80% | Percentage of retry attempts that succeed |
| Offline proceed rate | < 5% | Percentage of sessions that proceed with unverified tokens |
| Token source distribution | Informational | Breakdown of env vs keyring vs config usage |

## Observability

### Logging

| Level | Event | Message Format |
|-------|-------|----------------|
| `debug` | Token resolution started | `auth: resolving token for {host}` |
| `debug` | Token found | `auth: token resolved from {source} for {host}` |
| `debug` | Token not found | `auth: no token found for {host}` |
| `debug` | Validation started | `auth: validating token against {apiUrl}/api/user` |
| `info` | Validation succeeded | `auth: authenticated as {username} via {source} on {host}` |
| `warn` | Validation failed (401) | `auth: token from {source} is expired or invalid for {host}` |
| `warn` | Validation failed (network) | `auth: could not reach {host} for token validation, proceeding optimistically` |
| `warn` | Validation timed out | `auth: token validation timed out after 5000ms for {host}, proceeding optimistically` |
| `warn` | Rate limited | `auth: rate limited by {host} during token validation (HTTP 429)` |
| `error` | Keyring read error | `auth: failed to read from system keyring: {error_message}` |
| `error` | Unexpected validation error | `auth: unexpected error during validation for {host}: {error_message}` |

Logs are written to `stderr` and are not displayed in the TUI interface. They can be captured with `codeplane tui 2>tui.log`.

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| No token in any source | `resolveAuthToken()` returns `null` | Display "Not authenticated" error screen with `q` to quit, `R` to retry |
| Token expired (HTTP 401) | `GET /api/user` returns 401 | Display "Session expired" error screen with `q` to quit, `R` to retry |
| Token invalid format | `GET /api/user` returns 401 | Same as expired — user must re-authenticate |
| Network unreachable | `fetch()` throws `TypeError` or connection refused | Proceed optimistically; show `⚠ offline` in status bar |
| DNS resolution failure | `fetch()` throws with DNS error | Same as network unreachable |
| Validation timeout (5s) | `AbortController` timeout | Same as network unreachable |
| Rate limited (HTTP 429) | `GET /api/user` returns 429 | Same as network unreachable |
| Keyring unavailable | `loadStoredToken()` throws | Log error, fall through to next source (config file) |
| Keyring permission denied | `loadStoredToken()` throws | Log error, fall through to next source (config file) |
| Config file missing | `loadConfig()` returns defaults | Use default API URL; no token from config source |
| Config file corrupted | `loadConfig()` throws parse error | Log error, use default API URL; no token from config source |
| Terminal resize during loading | Resize event fires | Re-render at new dimensions; auth flow continues uninterrupted |
| SSE disconnect during auth | SSE not yet initialized | No impact — SSE connections are established after auth completes |
| `Ctrl+C` during validation | Keyboard handler fires | Abort in-flight fetch, exit TUI immediately |
| Process signal (SIGTERM/SIGINT) | Node.js signal handler | Clean exit, abort in-flight fetch |

### Failure Modes

- **Cascading failure**: If the keyring read throws, the system falls through to the config file source. If the config file is also unreadable, the system reports "no token found." At no point does a keyring failure prevent the env var or config fallbacks from being tried.
- **Retry loop prevention**: The retry action debounce (1s) and lack of automatic retry prevent the TUI from hammering the API server. Retries are always user-initiated.
- **Memory stability**: Auth context is created once and never recreated during a session. Token re-validation does not occur after initial startup (a 401 on a subsequent API call is handled by the error boundary, not the auth loading feature).

## Verification

### Test File

`e2e/tui/app-shell.test.ts` — tests for `TUI_AUTH_TOKEN_LOADING` within the app shell test suite.

### Terminal Snapshot Tests

```
TEST: "renders loading screen while authenticating"
  - Launch TUI with valid CODEPLANE_TOKEN
  - Capture terminal snapshot during auth loading
  - Assert snapshot matches golden file: loading spinner, "Authenticating…", host displayed
  - Sizes: 80x24, 120x40, 200x60

TEST: "renders loading screen centered at minimum terminal size"
  - Launch TUI at 80x24 with valid CODEPLANE_TOKEN
  - Capture terminal snapshot during auth loading
  - Assert spinner and text are vertically and horizontally centered

TEST: "renders error screen when no token is found"
  - Launch TUI with no CODEPLANE_TOKEN, no keyring token, no config token
  - Capture terminal snapshot
  - Assert snapshot contains "Not authenticated", "codeplane auth login", host, CODEPLANE_TOKEN mention
  - Sizes: 80x24, 120x40, 200x60

TEST: "renders error screen when token is expired"
  - Launch TUI with CODEPLANE_TOKEN set to an invalid/expired token
  - API server returns 401 for GET /api/user
  - Capture terminal snapshot
  - Assert snapshot contains "Session expired", token source, "codeplane auth login"
  - Sizes: 80x24, 120x40, 200x60

TEST: "renders offline warning when network is unreachable"
  - Launch TUI with valid CODEPLANE_TOKEN but unreachable API server
  - Wait for validation timeout
  - Capture terminal snapshot of dashboard screen
  - Assert status bar contains offline warning indicator

TEST: "renders authenticated username in status bar after successful auth"
  - Launch TUI with valid CODEPLANE_TOKEN
  - API server returns 200 with { login: "alice" }
  - Capture terminal snapshot after auth completes
  - Assert status bar contains "✓ alice via env"

TEST: "error screen wraps text at minimum terminal size"
  - Launch TUI at 80x24 with no token
  - Capture terminal snapshot
  - Assert all instruction text is visible and properly wrapped within 80 columns

TEST: "no token value is visible anywhere on screen"
  - Launch TUI with CODEPLANE_TOKEN set
  - Capture terminal snapshot at each auth state (loading, success, error)
  - Assert token value string does not appear in any snapshot
```

### Keyboard Interaction Tests

```
TEST: "Ctrl+C exits TUI during auth loading"
  - Launch TUI with valid CODEPLANE_TOKEN (slow API response)
  - Send Ctrl+C keypress during loading state
  - Assert TUI process exits with code 0

TEST: "q exits TUI from no-token error screen"
  - Launch TUI with no token
  - Wait for error screen to render
  - Send 'q' keypress
  - Assert TUI process exits with code 0

TEST: "R retries auth from no-token error screen"
  - Launch TUI with no token
  - Wait for error screen to render
  - Set CODEPLANE_TOKEN in environment (simulating user logging in externally)
  - Send 'R' keypress
  - Assert TUI transitions from error screen to loading screen
  - Assert TUI completes auth and reaches dashboard

TEST: "R retries auth from expired-token error screen"
  - Launch TUI with expired CODEPLANE_TOKEN
  - Wait for "Session expired" error screen
  - Update API server to accept the token
  - Send 'R' keypress
  - Assert TUI transitions to loading and then to dashboard

TEST: "R retry is debounced — rapid presses trigger only one retry"
  - Launch TUI with no token
  - Wait for error screen
  - Send 'R' 'R' 'R' rapidly (within 200ms)
  - Assert only one validation request is made to the API server

TEST: "navigation keys are inactive during auth loading"
  - Launch TUI during auth loading
  - Send 'g' 'd' (go-to dashboard), ':' (command palette), '?' (help)
  - Assert no navigation occurs, no overlays open
  - Assert TUI remains on loading screen

TEST: "Ctrl+C exits TUI from error screen"
  - Launch TUI with no token
  - Wait for error screen
  - Send Ctrl+C keypress
  - Assert TUI process exits with code 0

TEST: "? opens help overlay from error screen"
  - Launch TUI with no token
  - Wait for error screen
  - Send '?' keypress
  - Assert help overlay appears showing available keybindings (q, R, Ctrl+C)
  - Send Esc to close help overlay
  - Assert error screen is visible again
```

### Responsive Tests

```
TEST: "loading screen layout at 80x24"
  - Launch TUI at 80x24 with valid token
  - Capture snapshot during loading
  - Assert spinner is centered, host text fits within 76 characters
  - Assert header and status bars are each 1 row, content area is 22 rows

TEST: "loading screen layout at 120x40"
  - Launch TUI at 120x40 with valid token
  - Capture snapshot during loading
  - Assert spinner is centered in the larger content area

TEST: "loading screen layout at 200x60"
  - Launch TUI at 200x60 with valid token
  - Capture snapshot during loading
  - Assert spinner is centered, no layout overflow

TEST: "error screen layout at 80x24"
  - Launch TUI at 80x24 with no token
  - Capture snapshot
  - Assert all text is visible, properly wrapped, no horizontal overflow
  - Assert "codeplane auth login" command is on a single line

TEST: "error screen layout at 120x40"
  - Launch TUI at 120x40 with no token
  - Capture snapshot
  - Assert error message has comfortable padding and spacing

TEST: "error screen layout at 200x60"
  - Launch TUI at 200x60 with no token
  - Capture snapshot
  - Assert error message is centered with generous whitespace

TEST: "resize during loading re-centers content"
  - Launch TUI at 120x40 with valid token during loading
  - Resize terminal to 80x24
  - Capture snapshot
  - Assert spinner remains centered at new dimensions
  - Assert auth flow was not restarted

TEST: "resize during error screen re-renders correctly"
  - Launch TUI at 120x40 with no token
  - Wait for error screen
  - Resize terminal to 80x24
  - Capture snapshot
  - Assert error text rewraps to fit 80 columns
```

### Token Resolution Tests

```
TEST: "resolves token from CODEPLANE_TOKEN env var"
  - Set CODEPLANE_TOKEN to a valid test token
  - Launch TUI
  - Assert auth succeeds
  - Assert status bar shows "via env"

TEST: "resolves token from system keyring when env var is absent"
  - Clear CODEPLANE_TOKEN
  - Store valid token in test credential store (via CODEPLANE_TEST_CREDENTIAL_STORE_FILE)
  - Launch TUI
  - Assert auth succeeds
  - Assert status bar shows "via keyring"

TEST: "env var takes priority over keyring"
  - Set CODEPLANE_TOKEN to token-A
  - Store token-B in test credential store
  - Launch TUI
  - Assert auth uses token-A (verify via API server request log)
  - Assert status bar shows "via env"

TEST: "empty CODEPLANE_TOKEN is treated as absent"
  - Set CODEPLANE_TOKEN to empty string
  - Store valid token in test credential store
  - Launch TUI
  - Assert auth uses keyring token
  - Assert status bar shows "via keyring"

TEST: "whitespace-only CODEPLANE_TOKEN is treated as absent"
  - Set CODEPLANE_TOKEN to "   "
  - Store valid token in test credential store
  - Launch TUI
  - Assert auth uses keyring token

TEST: "respects CODEPLANE_API_URL for target host"
  - Set CODEPLANE_API_URL to test server URL
  - Set CODEPLANE_TOKEN to valid token
  - Launch TUI
  - Assert loading screen shows the custom host
  - Assert validation request goes to custom API URL

TEST: "handles keyring read failure gracefully"
  - Configure test credential store to be unreadable (e.g., invalid JSON)
  - Set CODEPLANE_TOKEN absent
  - Launch TUI
  - Assert error screen shows "Not authenticated" (falls through all sources)

TEST: "validation timeout proceeds optimistically"
  - Set CODEPLANE_TOKEN to valid token
  - Configure API server with 10-second delay on GET /api/user
  - Launch TUI
  - Assert TUI proceeds to dashboard after 5-second timeout
  - Assert status bar shows offline warning
```

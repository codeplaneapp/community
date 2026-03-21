# TUI_BOOTSTRAP_AND_RENDERER

Specification for TUI_BOOTSTRAP_AND_RENDERER.

## High-Level User POV

When a developer runs `codeplane tui` from their terminal, the entire Codeplane product surface should appear within milliseconds — a fully rendered terminal interface ready for keyboard interaction. The bootstrap and renderer is the foundational layer that makes this possible. It is the first thing that runs and the last thing that tears down. If it fails, nothing else in the TUI works. If it succeeds, every subsequent screen, overlay, and interaction has a stable rendering surface, a working keyboard input pipeline, and a clean terminal lifecycle to rely on.

From the user's perspective, running `codeplane tui` should feel instantaneous. The terminal switches to an alternate screen buffer (so their existing scrollback is preserved), the cursor disappears, and the Codeplane interface appears: a header bar at the top with breadcrumb navigation, a content area in the middle, and a status bar at the bottom showing keybinding hints and connection status. The entire transition from shell prompt to rendered TUI should take no more than 200 milliseconds. There is no splash screen, no progress bar for initialization — the dashboard simply appears.

If the user's terminal is too small (below 80 columns or 24 rows), the TUI does not attempt to render a broken layout. Instead, it shows a centered message: "Terminal too small. Minimum size: 80×24. Current: {cols}×{rows}" and waits. As soon as the user resizes their terminal to meet the minimum, the TUI renders normally without requiring a restart.

If the configured API server is unreachable — because the daemon isn't running, the network is down, or the URL is wrong — the TUI shows a connection screen: "Connecting to Codeplane at {url}..." with a spinner. It retries automatically with exponential backoff. Once the server responds, the TUI transitions to the dashboard. If the target is a local daemon and it isn't running, the TUI prompts: "Daemon is not running. Start it? [Y/n]" and can launch it inline.

If authentication is missing — no token in the keychain and no `CODEPLANE_TOKEN` environment variable — the TUI displays a clear message: "Not authenticated. Run `codeplane auth login` to sign in." and exits cleanly, restoring the terminal to its original state.

When the user quits the TUI (via `q` on the root screen, `Ctrl+C` at any point, or by closing the terminal), the cleanup is immediate and complete. The alternate screen buffer is exited, raw mode is disabled, the cursor reappears, mouse reporting is turned off, and any modified terminal state is restored. The user's shell prompt returns exactly as it was before launching the TUI. If the TUI process is killed abruptly (SIGKILL, OOM, power loss), the terminal may be left in a corrupted state — but a simple `reset` command will recover it, and the TUI registers signal handlers for SIGINT, SIGTERM, and SIGHUP to clean up in all graceful shutdown scenarios.

During a session, if the terminal is resized, the TUI re-renders immediately. Layouts reflow: sidebars collapse at narrow widths, columns drop at minimum sizes, and modal overlays adjust their proportions. There is no flicker, no partial render, no delay. The resize is handled synchronously within the same frame.

The renderer also establishes the color baseline. It detects whether the terminal supports truecolor (via `COLORTERM=truecolor`) and falls back to ANSI 256 colors, or further to 16 colors if necessary. The TUI uses a dark theme exclusively — it assumes a dark terminal background and renders all semantic color tokens (primary blue, success green, warning yellow, error red, muted gray) accordingly.

This is the invisible foundation. Users don't think about the bootstrap or renderer — they think about browsing repos, reading diffs, and managing issues. But every keystroke they press, every screen they navigate to, and every character rendered on their terminal flows through this layer.

## Acceptance Criteria

### Definition of Done

The TUI_BOOTSTRAP_AND_RENDERER feature is complete when all of the following are true:

**Process Lifecycle**

- [ ] Running `codeplane tui` spawns a Bun process that executes `apps/tui/src/index.tsx` as the entry point.
- [ ] The TUI accepts `--repo OWNER/REPO` as an optional CLI argument to set initial repository context.
- [ ] The process exits with code 0 on clean shutdown (user quit) and code 1 on fatal error.
- [ ] The process writes no output to stdout/stderr during normal operation (all rendering goes through the OpenTUI renderer).

**Terminal Setup**

- [ ] On startup, the renderer switches to the alternate screen buffer (`\x1b[?1049h`).
- [ ] On startup, the renderer enables raw mode on stdin (disabling line buffering and echo).
- [ ] On startup, the renderer hides the cursor (`\x1b[?25l`).
- [ ] On startup, the renderer enables mouse reporting if the terminal supports it (additive, never required).
- [ ] On startup, the renderer queries terminal capabilities (Kitty keyboard protocol support, color depth, theme mode).
- [ ] Terminal setup completes within 100ms.

**Terminal Teardown**

- [ ] On exit, the renderer exits the alternate screen buffer (`\x1b[?1049l`).
- [ ] On exit, the renderer disables raw mode on stdin.
- [ ] On exit, the renderer restores cursor visibility (`\x1b[?25h`).
- [ ] On exit, the renderer disables mouse reporting.
- [ ] On exit, all timers, intervals, and event listeners are cleared.
- [ ] Teardown runs on `q` (root screen), `Ctrl+C`, SIGINT, SIGTERM, and SIGHUP.
- [ ] After teardown, the user's shell prompt appears cleanly with no visual artifacts.

**React 19 + OpenTUI Renderer Initialization**

- [ ] The renderer is created via `createCliRenderer()` from `@opentui/core`.
- [ ] The React root is created via `createRoot(renderer)` from `@opentui/react`.
- [ ] The root component tree is rendered with the following provider hierarchy (outermost to innermost): `AppContext.Provider` → `ErrorBoundary` → `AuthProvider` → `APIClientProvider` → `SSEProvider` → `NavigationProvider` → `App`.
- [ ] The React reconciler correctly maps JSX elements to OpenTUI native nodes (`<box>`, `<text>`, `<scrollbox>`, etc.).
- [ ] The renderer schedules frames at a stable cadence (target 60fps, minimum 30fps).
- [ ] The first meaningful render (header + content area + status bar visible) occurs within 200ms of process start.

**Dimension Detection and Minimum Size Enforcement**

- [ ] Terminal dimensions are read from `stdout.columns` and `stdout.rows` on startup.
- [ ] If dimensions cannot be determined, the renderer defaults to 80×24.
- [ ] If the terminal is smaller than 80×24, the TUI renders only a centered "terminal too small" message instead of the application layout.
- [ ] The "terminal too small" message displays the current terminal dimensions and the minimum required dimensions.
- [ ] When the terminal is resized from below-minimum to at-or-above-minimum, the TUI renders the full application layout without requiring a restart.
- [ ] When the terminal is resized from above-minimum to below-minimum, the TUI replaces the application layout with the "terminal too small" message.

**Resize Handling**

- [ ] The renderer listens for SIGWINCH signals and terminal resize events.
- [ ] On resize, `useTerminalDimensions()` returns updated width and height values.
- [ ] On resize, `useOnResize()` callbacks fire synchronously.
- [ ] Layout recalculation and re-render complete within 50ms of the resize event.
- [ ] No partial or torn frames are visible during resize.
- [ ] Rapid sequential resizes (e.g., dragging a window edge) do not cause crashes, memory leaks, or render queue overflow.

**Color and Theme**

- [ ] The renderer detects truecolor support via `COLORTERM=truecolor` or `COLORTERM=24bit` environment variables.
- [ ] If truecolor is not detected, the renderer falls back to ANSI 256 color mode.
- [ ] If ANSI 256 is not available, the renderer falls back to 16-color mode.
- [ ] The TUI uses a single dark theme. No light theme is supported.
- [ ] All seven semantic color tokens are defined and consistently applied: `primary` (Blue 33), `success` (Green 34), `warning` (Yellow 178), `error` (Red 196), `muted` (Gray 245), `surface` (Dark Gray 236), `border` (Gray 240).
- [ ] Color tokens render correctly in all three color depth modes (truecolor, 256, 16).

**Keyboard Input Pipeline**

- [ ] The renderer captures all keyboard input via the raw mode stdin stream.
- [ ] The `useKeyboard()` hook delivers key events to focused components.
- [ ] Key events include the key name, modifiers (Ctrl, Shift), and raw sequence.
- [ ] Keyboard input is processed within 16ms of the keypress (one frame at 60fps).
- [ ] Rapid key input (e.g., holding down `j` for fast scrolling) does not drop events or cause input lag.
- [ ] Kitty keyboard protocol is used when the terminal supports it, falling back to standard ANSI escape sequences.
- [ ] `Ctrl+C` is always captured and triggers graceful shutdown, regardless of what component has focus.

**Signal Handling**

- [ ] SIGINT triggers graceful teardown and exits with code 0.
- [ ] SIGTERM triggers graceful teardown and exits with code 0.
- [ ] SIGHUP triggers graceful teardown and exits with code 0.
- [ ] SIGWINCH triggers resize detection and re-render (does not exit).
- [ ] Signal handlers are registered after the renderer is initialized and before the first render.
- [ ] Multiple rapid SIGINT signals do not cause double-teardown or crash.

**Connection and Auth Pre-checks**

- [ ] On startup, the TUI loads the auth token from the CLI keychain/config or `CODEPLANE_TOKEN` environment variable.
- [ ] If no auth token is found, the TUI displays "Not authenticated. Run `codeplane auth login` to sign in." and exits with code 1.
- [ ] On startup, the TUI makes a health check request to the configured API URL.
- [ ] If the API is unreachable, the TUI displays "Connecting to Codeplane at {url}..." with a spinner and retries with exponential backoff (1s, 2s, 4s, 8s, max 30s).
- [ ] If the API responds with a healthy status, the TUI transitions to the dashboard (or the deep-linked screen if `--repo` was provided).
- [ ] If the auth token is expired or invalid (401 response), the TUI displays "Session expired. Run `codeplane auth login` to re-authenticate." and exits with code 1.

**Error Boundary**

- [ ] Unhandled JavaScript errors within the React tree are caught by the top-level `ErrorBoundary`.
- [ ] The error boundary renders: error message in red, collapsed stack trace (expandable), "Press `r` to restart" prompt, and "Press `q` to quit" prompt.
- [ ] Pressing `r` in the error boundary re-renders the root component tree from scratch.
- [ ] Pressing `q` in the error boundary triggers graceful teardown.
- [ ] The error boundary does not crash if the error occurs during render (no infinite error loop).

**Memory and Performance**

- [ ] Memory usage remains stable during long-running sessions (no unbounded growth over 1 hour of use).
- [ ] The renderer does not leak file descriptors, timers, or event listeners.
- [ ] Screen transitions (push/pop) complete within 50ms.
- [ ] The process uses less than 150MB RSS at steady state on the dashboard screen.

**Edge Cases**

- [ ] Piped stdin (non-TTY) is detected and the TUI exits with a clear error: "stdin is not a TTY. The TUI requires an interactive terminal."
- [ ] Piped stdout (non-TTY) is detected and the TUI exits with a clear error: "stdout is not a TTY. The TUI requires an interactive terminal."
- [ ] Running inside `ssh` sessions works correctly (alternate screen, raw mode, resize).
- [ ] Running inside `tmux` / `screen` / `zellij` sessions works correctly.
- [ ] `TERM=dumb` or missing `TERM` disables color output but still renders the layout with plain text.
- [ ] The TUI does not interfere with the parent shell's terminal settings after exit.

**Boundary Constraints**

- [ ] Maximum supported terminal width: 65535 columns (OpenTUI native renderer limit).
- [ ] Maximum supported terminal height: 65535 rows (OpenTUI native renderer limit).
- [ ] API URL maximum length: 2048 characters.
- [ ] Auth token maximum length: 512 characters.
- [ ] Breadcrumb path in header bar truncates from the left when it exceeds available width, showing `...` prefix.
- [ ] Status bar text truncates from the right when it exceeds available width, showing `...` suffix.
- [ ] All text rendering uses the terminal's monospace font — no width assumptions beyond single-width and double-width (CJK) characters.

## Design

### Global Layout Structure

The bootstrap and renderer establishes the root layout that every screen renders within:

```
┌─────────────────────────────────────────────────────────────┐
│ Header Bar (1 row)                                          │
│ ◄ breadcrumb path          repo context     ● status  🔔 3  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                   Content Area                              │
│              (height - 2 rows)                              │
│            Screen-specific content                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Status Bar (1 row)                                          │
│ j/k:navigate  Enter:select  q:back      synced     ? help   │
└─────────────────────────────────────────────────────────────┘
```

### OpenTUI Component Tree

```tsx
// Root application — rendered via createRoot(renderer).render(<App />)
<box flexDirection="column" width="100%" height="100%">
  {/* Header Bar — fixed 1 row at top */}
  <box flexDirection="row" height={1} width="100%">
    <box flexGrow={1}>
      <text color="muted">{truncatedBreadcrumb}</text>
    </box>
    <box>
      <text color="muted">{repoContext}</text>
    </box>
    <box>
      <text color={connectionColor}>{connectionIndicator}</text>
      <text color="primary"> 🔔 {notificationCount}</text>
    </box>
  </box>

  {/* Content Area — flexible height, screen-specific */}
  <box flexGrow={1} width="100%">
    {currentScreen}
  </box>

  {/* Status Bar — fixed 1 row at bottom */}
  <box flexDirection="row" height={1} width="100%">
    <box flexGrow={1}>
      <text color="muted">{contextKeybindings}</text>
    </box>
    <box>
      <text color={syncColor}>{syncStatus}</text>
    </box>
    <box>
      <text color="muted">? help</text>
    </box>
  </box>
</box>
```

### Pre-Application Screens

**Terminal Too Small Screen:**

```tsx
<box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
  <text color="warning">Terminal too small</text>
  <text color="muted">Minimum size: 80×24 — Current: {cols}×{rows}</text>
  <text color="muted">Resize your terminal to continue.</text>
</box>
```

**Connecting Screen:**

```tsx
<box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
  <text color="primary">{spinner} Connecting to Codeplane at {apiUrl}...</text>
  <text color="muted">Retrying in {backoffSeconds}s</text>
</box>
```

**Auth Error Screen:**

```tsx
<box flexDirection="column" width="100%" height="100%" justifyContent="center" alignItems="center">
  <text color="error">Not authenticated.</text>
  <text color="muted">Run `codeplane auth login` to sign in.</text>
</box>
```

**Error Boundary Screen:**

```tsx
<box flexDirection="column" width="100%" height="100%" padding={2}>
  <text color="error" bold>Something went wrong</text>
  <text color="error">{errorMessage}</text>
  {showStack && (
    <box marginTop={1}>
      <text color="muted">{stackTrace}</text>
    </box>
  )}
  <box marginTop={1}>
    <text color="muted">Press `r` to restart — Press `q` to quit</text>
  </box>
</box>
```

### Keybindings (Bootstrap/Renderer Scope)

These keybindings are always active and handled at the renderer level before any screen-specific handlers:

| Key | Context | Action |
|-----|---------|--------|
| `Ctrl+C` | Always | Graceful shutdown — teardown terminal and exit |
| `q` | Root screen, no modal open | Quit TUI |
| `q` | Non-root screen, no modal open | Pop screen (back) |
| `Esc` | Modal/overlay open | Close modal/overlay |
| `Esc` | No modal open | Same as `q` |
| `?` | Always (except in text input) | Toggle help overlay |
| `:` | Always (except in text input) | Open command palette |
| `r` | Error boundary screen | Restart application |

### Terminal Too Small Screen Keybindings

| Key | Action |
|-----|--------|
| `Ctrl+C` | Quit TUI |
| `q` | Quit TUI |
| All others | Ignored (no interaction possible until terminal is resized) |

### Responsive Behavior

| Terminal Size | Classification | Layout Behavior |
|--------------|----------------|------------------|
| < 80×24 | Unsupported | Show "terminal too small" message only |
| 80×24 – 119×39 | Minimum | Header/status bars use single-line compact format. Content area gets full remaining height. Sidebars hidden by default. Breadcrumb truncated aggressively. |
| 120×40 – 199×59 | Standard | Full header with breadcrumb, repo context, and status indicators. Status bar shows full keybinding hints. Sidebars visible by default. |
| 200×60+ | Large | Extended breadcrumb path (no truncation). Status bar shows additional metadata. Wider content columns for diffs and code. |

On resize between breakpoints:

- Minimum → Standard: Sidebar appears, breadcrumb expands, keybinding hints expand.
- Standard → Minimum: Sidebar hides, breadcrumb truncates, keybinding hints collapse.
- Any → Unsupported: Full layout replaced with "terminal too small" message.
- Unsupported → Any valid: "Terminal too small" message replaced with full layout.

### Data Hooks Consumed

| Hook | Source | Purpose |
|------|--------|---------|
| `useTerminalDimensions()` | `@opentui/react` | Current terminal width and height. Triggers re-render on resize. |
| `useOnResize(callback)` | `@opentui/react` | Register callback for resize events. Used to trigger layout breakpoint recalculations. |
| `useKeyboard(handler)` | `@opentui/react` | Register keyboard event handler. Used for global keybindings (Ctrl+C, q, Esc, ?, :). |
| `useAppContext()` | `@opentui/react` | Access to `keyHandler` and `renderer` instances. |
| `useRenderer()` | `@opentui/react` | Direct access to the CliRenderer for imperative operations. |

The bootstrap also initializes (but does not directly consume) the following providers that downstream features use:

| Provider | Purpose |
|----------|----------|
| `AuthProvider` | Holds auth token, provides to API client and SSE ticket requests. |
| `APIClientProvider` | Wraps the HTTP client with base URL and auth headers. All `@codeplane/ui-core` hooks consume this. |
| `SSEProvider` | Manages EventSource connections for real-time streaming channels. |
| `NavigationProvider` | Manages the screen stack, push/pop operations, and breadcrumb state. |

### Bootstrap Sequence (User-Facing Phases)

| Phase | User-Visible Behavior | Duration Target |
|-------|----------------------|------------------|
| 1. Process start | Terminal switches to alternate screen, cursor hides | < 50ms |
| 2. Renderer init | OpenTUI native renderer created, React root attached | < 50ms |
| 3. Dimension check | If terminal too small, show message and wait | Instant |
| 4. Auth check | Load token; if missing, show auth error and exit | < 10ms |
| 5. API health check | Show connecting screen if unreachable; retry with backoff | < 100ms (success) |
| 6. First render | Dashboard (or deep-linked screen) appears | < 200ms total |

## Permissions & Security

### Authorization

- **Launching the TUI**: No Codeplane-level authorization required. The user must have OS-level permission to execute `codeplane tui` and spawn the Bun process.
- **Auth token requirement**: The TUI requires a valid authentication token to function. It does not implement any OAuth browser flow, login form, or interactive authentication. Authentication is delegated entirely to the CLI via `codeplane auth login`.
- **Token sources** (checked in order):
  1. `CODEPLANE_TOKEN` environment variable
  2. System keychain (macOS Keychain, Linux secret-tool, Windows Credential Manager) via CLI credential store
  3. CLI config file (`~/.codeplane/config.json`)
- **Token format**: Bearer token passed in `Authorization: Bearer {token}` header on all API requests.
- **Token validation**: On startup, the TUI makes a health check and/or user profile request to validate the token. If the API responds with 401, the TUI exits with a re-authentication message.
- **No token persistence**: The TUI never writes, modifies, or caches auth tokens. It is a read-only consumer of the CLI's credential store.

### Rate Limiting

- The TUI is subject to the same API rate limits as any other client (120 requests per 60-second window per authenticated user).
- The TUI does not implement client-side rate limiting or request queuing. If the API returns 429, the response is surfaced to the user as an inline error: "Rate limit exceeded. Retry in {seconds}s."
- SSE connections are long-lived and do not count toward the per-request rate limit.
- Health check requests during the connection retry loop do not include authentication and use the unauthenticated rate limit pool.

### Security Considerations

- The TUI process inherits the terminal's environment, including potentially sensitive variables. It reads only `CODEPLANE_TOKEN`, `CODEPLANE_API_URL`, `COLORTERM`, and `TERM`. It does not log or display other environment variables.
- The auth token is held in process memory for the lifetime of the TUI session. It is not written to disk, temporary files, or the terminal scrollback.
- The alternate screen buffer prevents TUI content from appearing in terminal scrollback after exit, providing a basic defense against shoulder-surfing of sensitive content (issue titles, code, etc.).
- The TUI does not execute any shell commands, spawn child processes (beyond the initial Bun spawn by the CLI), or access the filesystem beyond reading the CLI credential store.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `TUISessionStarted` | `terminal_width`, `terminal_height`, `color_depth` (truecolor/256/16), `term_type` (value of `$TERM`), `multiplexer` (tmux/screen/zellij/none), `auth_source` (env/keyring/config), `deep_link_screen` (string or null), `bootstrap_duration_ms` | After first render completes |
| `TUISessionEnded` | `session_duration_ms`, `screens_visited_count`, `exit_reason` (user_quit/ctrl_c/sigterm/error/auth_expired), `peak_memory_mb` | On graceful teardown |
| `TUIBootstrapFailed` | `failure_phase` (renderer/auth/connection/render), `error_message`, `terminal_width`, `terminal_height`, `duration_ms` | When bootstrap cannot complete |
| `TUIConnectionRetry` | `api_url`, `attempt_number`, `backoff_seconds`, `error_type` (network/timeout/refused) | Each connection retry attempt |
| `TUITerminalTooSmall` | `terminal_width`, `terminal_height` | When terminal is below minimum size at startup or after resize |
| `TUIResizeEvent` | `old_width`, `old_height`, `new_width`, `new_height`, `breakpoint_changed` (boolean) | When terminal is resized (debounced to 1 per second for telemetry) |
| `TUIErrorBoundaryTriggered` | `error_message`, `component_stack`, `recovery_action` (restart/quit) | When the error boundary catches an unhandled error |

### Success Indicators

- **Bootstrap Success Rate**: Percentage of `TUISessionStarted` / (`TUISessionStarted` + `TUIBootstrapFailed`). Target: > 99%.
- **Mean Bootstrap Duration**: Average `bootstrap_duration_ms` from `TUISessionStarted`. Target: < 200ms.
- **P95 Bootstrap Duration**: Target: < 500ms.
- **Mean Session Duration**: Average `session_duration_ms` from `TUISessionEnded`. Higher is better — indicates users find the TUI useful enough to stay in it. Target: > 5 minutes.
- **Error Boundary Rate**: Percentage of sessions that trigger `TUIErrorBoundaryTriggered`. Target: < 0.1%.
- **Connection Retry Rate**: Percentage of sessions that fire at least one `TUIConnectionRetry`. Target: < 5%.
- **Terminal Too Small Rate**: Percentage of sessions that trigger `TUITerminalTooSmall`. Informational — tracks how often users have small terminals.

## Observability

### Logging Requirements

All TUI logs are written to stderr (never stdout, which is the terminal rendering surface). In normal operation, logs are suppressed. When `CODEPLANE_TUI_DEBUG=true` or `--debug` flag is passed, structured JSON logs are emitted to stderr (which can be redirected to a file: `codeplane tui 2>tui.log`).

**Structured Log Context**

All TUI logs include:
- `component: "tui"`
- `phase: "bootstrap" | "renderer" | "auth" | "connection" | "render" | "teardown"`
- `session_id`: Unique ID for this TUI session (for correlating all logs)

**Log Events**

| Log | Level | Structured Fields | When |
|-----|-------|-------------------|------|
| `TUI bootstrap started` | `info` | `terminal_width`, `terminal_height`, `term_type`, `color_depth` | Process begins |
| `Renderer created` | `debug` | `width`, `height`, `kitty_keyboard`, `mouse_support`, `duration_ms` | OpenTUI renderer initialized |
| `React root attached` | `debug` | `provider_count`, `duration_ms` | React tree mounted |
| `Terminal too small` | `warn` | `width`, `height`, `min_width: 80`, `min_height: 24` | Dimension check fails |
| `Auth token loaded` | `info` | `source` (env/keyring/config), `api_url` | Token found |
| `Auth token missing` | `error` | `checked_sources` (array) | No token found |
| `Auth token invalid` | `error` | `status_code`, `api_url` | 401 from API |
| `API health check passed` | `info` | `api_url`, `latency_ms` | Health endpoint responds 200 |
| `API health check failed` | `warn` | `api_url`, `error_type`, `attempt`, `next_retry_ms` | Health check fails |
| `First render complete` | `info` | `total_bootstrap_ms`, `screen` | First meaningful paint |
| `Terminal resized` | `debug` | `old_width`, `old_height`, `new_width`, `new_height`, `render_ms` | SIGWINCH handled |
| `Error boundary caught` | `error` | `error_message`, `component_stack` | Unhandled React error |
| `Graceful shutdown started` | `info` | `trigger` (quit/ctrl_c/sigint/sigterm/sighup) | Teardown begins |
| `Graceful shutdown complete` | `info` | `session_duration_ms`, `teardown_ms` | Terminal restored |
| `SSE connection established` | `debug` | `channel`, `url` | EventSource connected |
| `SSE connection lost` | `warn` | `channel`, `error_type`, `retry_ms` | EventSource disconnected |
| `Frame rendered` | `trace` | `frame_number`, `render_ms`, `nodes_count` | Every frame (trace level only) |

### Error Cases and Failure Modes

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| stdin is not a TTY | Fatal — TUI cannot accept keyboard input | Check `process.stdin.isTTY` on startup | Exit with clear error message. No recovery needed. |
| stdout is not a TTY | Fatal — TUI cannot render to terminal | Check `process.stdout.isTTY` on startup | Exit with clear error message. No recovery needed. |
| OpenTUI native library load fails | Fatal — no rendering possible | `createCliRenderer()` throws | Exit with error: "Failed to load terminal renderer. Check your installation." |
| Terminal smaller than 80×24 | Non-fatal — layout degraded | `useTerminalDimensions()` returns below-minimum values | Show "terminal too small" message. Automatically recover when resized. |
| Auth token not found | Fatal — cannot make API requests | Token loading returns null/undefined | Exit with message directing user to `codeplane auth login`. |
| API server unreachable | Non-fatal — waiting for connection | Health check request fails | Show connecting screen with spinner. Retry with exponential backoff (1s→30s max). |
| API returns 401 | Fatal — token expired or invalid | 401 status code on any API request | Exit with message directing user to `codeplane auth login`. |
| API returns 429 | Non-fatal — rate limited | 429 status code with Retry-After header | Show inline error with retry countdown. Automatic retry after backoff. |
| SSE connection drops | Non-fatal — real-time updates pause | EventSource `onerror` event | Auto-reconnect with exponential backoff (1s→30s). Status bar shows disconnected state. |
| SIGWINCH during render | Non-fatal — frame may be interrupted | Signal received mid-render | Queue resize, finish current frame, then re-render at new dimensions. |
| Unhandled React error | Non-fatal — current screen broken | Error boundary `componentDidCatch` | Show error screen with restart (`r`) and quit (`q`) options. |
| SIGKILL / OOM kill | Fatal — no cleanup possible | Process terminated by OS | Terminal left in raw mode. User must run `reset` to recover. |
| Double Ctrl+C (rapid) | Potential double-teardown | Second SIGINT during teardown | Guard teardown with a `shuttingDown` flag. Second signal is ignored or forces immediate exit. |
| Bun process crash | Fatal — unrecoverable | Uncaught exception outside React tree | Process exits with code 1. Terminal may need `reset`. |

### Failure Mode Severity Classification

- **P0 (Fatal, blocks all usage)**: Native library load failure, stdin/stdout not TTY, Bun process crash.
- **P1 (Fatal, but clear recovery)**: Auth token missing/invalid, API unreachable after max retries.
- **P2 (Degraded, auto-recovery)**: SSE disconnect, terminal too small, rate limiting, resize during render.
- **P3 (Cosmetic, no user impact)**: Frame skip during rapid resize, trace-level render timing anomaly.

## Verification

### E2E Tests — `e2e/tui/app-shell.test.ts`

Tests use `@microsoft/tui-test` for terminal snapshot matching, keyboard simulation, and text assertions.

**Bootstrap and First Render**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders initial layout with header, content area, and status bar`: Launch TUI with valid auth. Assert terminal snapshot shows three-section layout: header bar at row 0, content area in the middle, status bar at the last row.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — first render completes within 200ms`: Launch TUI, measure time to first meaningful content. Assert elapsed time < 200ms.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — header bar shows breadcrumb and notification badge`: Launch TUI with valid auth. Assert header bar contains "Dashboard" breadcrumb text and notification indicator.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — status bar shows keybinding hints and help reference`: Launch TUI with valid auth. Assert status bar contains "? help" text.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — alternate screen buffer is active`: Launch TUI, verify that terminal content does not appear in scrollback (snapshot comparison confirms alternate screen).

**Terminal Dimension Enforcement**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows "terminal too small" at 79x24`: Launch TUI with terminal size 79×24. Assert screen contains "Terminal too small" and "Minimum size: 80×24" and "Current: 79×24".
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows "terminal too small" at 80x23`: Launch TUI with terminal size 80×23. Assert screen contains "Terminal too small" and "Current: 80×23".
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders full layout at exactly 80x24`: Launch TUI with terminal size 80×24. Assert terminal snapshot shows header bar, content area, and status bar (not the "too small" message).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — transitions from too-small to valid on resize`: Launch TUI at 60×20. Assert "terminal too small" message. Resize to 80×24. Assert full layout replaces the message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — transitions from valid to too-small on resize`: Launch TUI at 120×40. Assert full layout. Resize to 70×20. Assert "terminal too small" message replaces layout.

**Responsive Layout at Standard Breakpoints**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — minimum layout at 80x24`: Launch TUI at 80×24 with valid auth. Take terminal snapshot. Assert header bar is compact (truncated breadcrumb), status bar shows abbreviated hints, content area fills remaining rows.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — standard layout at 120x40`: Launch TUI at 120×40 with valid auth. Take terminal snapshot. Assert header bar shows full breadcrumb, repo context area, and notification badge. Status bar shows full keybinding hints.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — large layout at 200x60`: Launch TUI at 200×60 with valid auth. Take terminal snapshot. Assert header bar shows expanded breadcrumb without truncation. Layout uses additional width for content columns.

**Keyboard Input**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Ctrl+C exits cleanly`: Launch TUI. Send Ctrl+C keypress. Assert process exits with code 0.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — q on root screen exits`: Launch TUI (dashboard is root). Send `q` keypress. Assert process exits with code 0.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Esc on root screen with no modal exits`: Launch TUI. Send `Esc` keypress. Assert process exits with code 0.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — ? toggles help overlay`: Launch TUI. Send `?` keypress. Assert help overlay appears (snapshot shows modal with keybinding list). Send `?` again. Assert help overlay disappears.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — : opens command palette`: Launch TUI. Send `:` keypress. Assert command palette overlay appears with text input focused.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Esc closes command palette`: Launch TUI. Send `:` to open command palette. Send `Esc`. Assert command palette is dismissed and focus returns to content.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — rapid key input does not drop events`: Launch TUI on a list screen. Send 20 `j` keypresses in rapid succession (< 5ms apart). Assert cursor moved down 20 positions (or to end of list if shorter).

**Connection Handling**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows connecting screen when API is unreachable`: Launch TUI pointed at unreachable API URL. Assert screen shows "Connecting to Codeplane at {url}..." with spinner text.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — retries connection with backoff`: Launch TUI pointed at unreachable API. Wait for first retry. Assert retry message updates with increasing backoff time.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — transitions to dashboard when API becomes available`: Launch TUI pointed at initially-unreachable API. Start API server. Assert TUI transitions from connecting screen to dashboard.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Ctrl+C exits from connecting screen`: Launch TUI pointed at unreachable API. Send Ctrl+C. Assert process exits cleanly.

**Authentication Handling**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows auth error when no token`: Launch TUI with no CODEPLANE_TOKEN and no keychain token. Assert screen shows "Not authenticated" and "codeplane auth login" text. Assert process exits with code 1.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows session expired on 401`: Launch TUI with an invalid/expired token. Assert screen shows "Session expired" text. Assert process exits with code 1.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — loads token from CODEPLANE_TOKEN env var`: Set `CODEPLANE_TOKEN=valid_token`. Launch TUI. Assert TUI proceeds to dashboard (no auth error).

**Error Boundary**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — error boundary catches render error`: Launch TUI with a component that throws during render. Assert error boundary screen shows "Something went wrong" in red and the error message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — error boundary shows restart and quit hints`: Trigger error boundary. Assert screen contains "Press `r` to restart" and "Press `q` to quit" text.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — r in error boundary restarts app`: Trigger error boundary. Send `r` keypress. Assert application re-renders (error boundary replaced with normal layout or new error if underlying issue persists).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — q in error boundary exits`: Trigger error boundary. Send `q` keypress. Assert process exits cleanly.

**Terminal Teardown**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — terminal state restored after quit`: Launch TUI. Send `q` to exit. Assert terminal is no longer in raw mode, cursor is visible, and alternate screen buffer is exited.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — terminal state restored after Ctrl+C`: Launch TUI. Send Ctrl+C. Assert terminal state is properly restored.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — teardown on SIGTERM`: Launch TUI. Send SIGTERM to process. Assert process exits with code 0 and terminal state is restored.

**Color and Theme**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders with ANSI 256 colors by default`: Launch TUI without COLORTERM set. Take snapshot. Assert color escape codes in output use ANSI 256 color sequences.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders with truecolor when COLORTERM=truecolor`: Launch TUI with `COLORTERM=truecolor`. Take snapshot. Assert color escape codes use 24-bit RGB sequences.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — semantic color tokens applied consistently`: Launch TUI. Assert header bar uses `border` color for separator, status bar uses `muted` color for text, and focused items use `primary` color.

**Resize Behavior**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — layout re-renders on resize`: Launch TUI at 120×40. Resize to 160×50. Assert layout dimensions update (snapshot reflects new size).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — resize from standard to minimum collapses layout`: Launch TUI at 120×40. Resize to 80×24. Assert sidebar is hidden and breadcrumb is truncated.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — rapid resize does not crash`: Launch TUI. Send 10 resize events in rapid succession with varying dimensions. Assert no crash, no error boundary triggered, and final layout matches final dimensions.

**Non-TTY Detection**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — exits with error when stdin is piped`: Launch TUI with stdin piped (not a TTY). Assert output contains "stdin is not a TTY" and process exits with code 1.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — exits with error when stdout is piped`: Launch TUI with stdout piped (not a TTY). Assert output contains "stdout is not a TTY" and process exits with code 1.

**Provider Initialization**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — SSE provider initializes and connects`: Launch TUI with valid auth. Assert no SSE-related errors in output. Assert status bar shows connected state (not "disconnected").
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — navigation provider initializes with dashboard as root`: Launch TUI. Assert current screen is dashboard. Assert navigation stack depth is 1.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — navigation provider initializes with deep-linked screen`: Launch TUI with `--repo owner/repo`. Assert current screen context includes the specified repository.

**Snapshot Tests**

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: dashboard at 80x24`: Full terminal snapshot at 80×24 showing minimum layout.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: dashboard at 120x40`: Full terminal snapshot at 120×40 showing standard layout.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: dashboard at 200x60`: Full terminal snapshot at 200×60 showing large layout.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: terminal too small at 60x20`: Full terminal snapshot showing the "terminal too small" message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: connecting screen`: Full terminal snapshot showing the connection retry screen with spinner.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: auth error screen`: Full terminal snapshot showing the authentication error message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: error boundary screen`: Full terminal snapshot showing the error boundary with error message and restart/quit hints.

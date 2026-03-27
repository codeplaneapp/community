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
- [ ] The TUI accepts `--screen SCREEN_NAME` as an optional CLI argument for deep-link launch to a specific screen.
- [ ] The TUI accepts `--debug` flag to enable structured JSON logging to stderr.
- [ ] The process exits with code 0 on clean shutdown (user quit) and code 1 on fatal error.
- [ ] The process writes no output to stdout/stderr during normal operation (all rendering goes through the OpenTUI renderer).
- [ ] When `--debug` is set or `CODEPLANE_TUI_DEBUG=true`, structured JSON logs are emitted to stderr.

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

- [ ] The renderer is created via `createCliRenderer()` from `@opentui/core` with `exitOnCtrlC: false`.
- [ ] The React root is created via `createRoot(renderer)` from `@opentui/react`.
- [ ] The root component tree is rendered with the following provider hierarchy (outermost to innermost): `ErrorBoundary` → `ThemeProvider` → `KeybindingProvider` → `OverlayManager` → `AuthProvider` → `APIClientProvider` → `SSEProvider` → `NavigationProvider` → `LoadingProvider` → `GlobalKeybindings` → `AppShell` → `ScreenRouter`.
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
- [ ] `NO_COLOR=1` disables all color output (monochrome rendering).
- [ ] `TERM=dumb` disables color output but still renders the layout with plain text.
- [ ] The TUI uses a single dark theme. No light theme is supported.
- [ ] All seven semantic color tokens are defined and consistently applied: `primary` (Blue 33), `success` (Green 34), `warning` (Yellow 178), `error` (Red 196), `muted` (Gray 245), `surface` (Dark Gray 236), `border` (Gray 240).
- [ ] Color tokens render correctly in all three color depth modes (truecolor, 256, 16).
- [ ] Theme tokens are frozen on startup and never change during the session.

**Keyboard Input Pipeline**

- [ ] The renderer captures all keyboard input via the raw mode stdin stream.
- [ ] The `useKeyboard()` hook delivers key events to the centralized `KeybindingProvider`.
- [ ] Key events include the key name, modifiers (Ctrl, Shift), and raw sequence.
- [ ] Keyboard input is processed within 16ms of the keypress (one frame at 60fps).
- [ ] Rapid key input (e.g., holding down `j` for fast scrolling) does not drop events or cause input lag.
- [ ] Kitty keyboard protocol is used when the terminal supports it, falling back to standard ANSI escape sequences.
- [ ] `Ctrl+C` is always captured and triggers graceful shutdown, regardless of what component has focus.
- [ ] Keybinding dispatch uses priority-based routing: MODAL (priority 0) > SCREEN (priority 5) > GLOBAL (priority 10).

**Signal Handling**

- [ ] SIGINT triggers graceful teardown and exits with code 0.
- [ ] SIGTERM triggers graceful teardown and exits with code 0.
- [ ] SIGHUP triggers graceful teardown and exits with code 0.
- [ ] SIGWINCH triggers resize detection and re-render (does not exit).
- [ ] Signal handlers are registered after the renderer is initialized and before the first render.
- [ ] Multiple rapid SIGINT signals do not cause double-teardown or crash.
- [ ] A `shuttingDown` guard flag prevents re-entrant teardown.

**Connection and Auth Pre-checks**

- [ ] On startup, the TUI loads the auth token from the CLI keychain/config or `CODEPLANE_TOKEN` environment variable.
- [ ] If no auth token is found, the TUI displays "Not authenticated. Run `codeplane auth login` to sign in." and exits with code 1.
- [ ] On startup, the TUI makes a validation request to `${apiUrl}/api/user` with the token.
- [ ] If the API is unreachable, the TUI proceeds optimistically in offline mode with a status bar warning.
- [ ] If the API responds with 200, the TUI transitions to authenticated state with username extracted.
- [ ] If the auth token is expired or invalid (401 response), the TUI displays "Session expired. Run `codeplane auth login` to re-authenticate." and shows the error screen.
- [ ] If the API returns 429 (rate limited), the TUI proceeds optimistically.
- [ ] Auth validation has a 5-second timeout via AbortController.
- [ ] Auth state is communicated to the status bar (3-second confirmation flash on successful auth).

**Error Boundary**

- [ ] Unhandled JavaScript errors within the React tree are caught by the top-level `ErrorBoundary`.
- [ ] The error boundary renders: error message in red, collapsed stack trace (expandable), "Press `r` to restart" prompt, and "Press `q` to quit" prompt.
- [ ] Pressing `r` in the error boundary re-renders the root component tree from scratch via key-based remount.
- [ ] Pressing `q` in the error boundary triggers graceful teardown.
- [ ] The error boundary does not crash if the error occurs during render (no infinite error loop).
- [ ] Crash loop detection triggers if 5+ restarts occur within 5000ms — the process exits to stderr with an error message.
- [ ] Double-fault protection: if the ErrorScreen itself throws, the boundary catches both errors, logs them to stderr, and exits immediately.

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
- [ ] Empty `--repo` argument is ignored gracefully (TUI launches to dashboard).
- [ ] Invalid `--repo` format (missing slash, empty owner, empty repo) is ignored gracefully.
- [ ] Invalid `--screen` value is ignored gracefully (TUI launches to dashboard).
- [ ] Extremely long `CODEPLANE_TOKEN` values (>512 chars) are rejected with a clear error.
- [ ] Extremely long `CODEPLANE_API_URL` values (>2048 chars) are rejected with a clear error.

**Boundary Constraints**

- [ ] Maximum supported terminal width: 65535 columns (OpenTUI native renderer limit).
- [ ] Maximum supported terminal height: 65535 rows (OpenTUI native renderer limit).
- [ ] Minimum supported terminal: 80×24.
- [ ] API URL maximum length: 2048 characters.
- [ ] Auth token maximum length: 512 characters.
- [ ] Breadcrumb path in header bar truncates from the left when it exceeds available width, showing `…` prefix.
- [ ] Status bar text truncates from the right when it exceeds available width, showing `…` suffix.
- [ ] Maximum navigation stack depth: 32 screens.
- [ ] All text rendering uses the terminal's monospace font — no width assumptions beyond single-width and double-width (CJK) characters.

## Design

### TUI UI

#### Global Layout Structure

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

**Header Bar (1 row, fixed at top)**
- Left: Breadcrumb trail from navigation stack (e.g., `Dashboard › owner/repo › Issues › #42`). Truncates from left with `…` prefix when space is insufficient.
- Center: Current repository context (`owner/repo`) — hidden at "minimum" breakpoint.
- Right: Connection status indicator (colored dot: green=connected, yellow=reconnecting, red=disconnected), unread notification count (when > 0).

**Content Area (flexible height)**
- Occupies all rows between header and status bar (`height - 2`).
- Renders the current screen from `ScreenRouter` based on navigation stack top.
- Screens may use single-column, sidebar+main split, or tabbed panel layouts.

**Status Bar (1 row, fixed at bottom)**
- Left: Context-sensitive keybinding hints from the active screen's registered scope (e.g., `j/k:navigate Enter:select q:back`).
- Center: Auth confirmation flash (3s after auth validation), retry hint on loading errors.
- Right: Sync status, offline warning, `? help` reference.

**Overlay Layer (absolute positioned, z-index 100)**
- Renders on top of everything for help overlay, command palette, and confirmation dialogs.
- Responsive sizing: 90% width at minimum breakpoint, 60% at standard, 50% at large.
- Bordered with semantic `border` color, title bar at top.
- Focus trapped within overlay while active. `Esc` dismisses.

#### OpenTUI Component Tree

```tsx
// Root application — rendered via createRoot(renderer).render(<App />)
<ErrorBoundary onReset={handleReset} onQuit={handleQuit} currentScreen={screenRef} noColor={noColor}>
  <ThemeProvider>
    <KeybindingProvider>
      <OverlayManager>
        <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
          <APIClientProvider>
            <SSEProvider>
              <NavigationProvider key={navResetKey} initialStack={initialStack}>
                <LoadingProvider>
                  <GlobalKeybindings>
                    <AppShell>
                      <ScreenRouter />
                    </AppShell>
                  </GlobalKeybindings>
                </LoadingProvider>
              </NavigationProvider>
            </SSEProvider>
          </APIClientProvider>
        </AuthProvider>
      </OverlayManager>
    </KeybindingProvider>
  </ThemeProvider>
</ErrorBoundary>
```

The `AppShell` component renders the three-zone layout:
```tsx
<box flexDirection="column" width="100%" height="100%">
  <HeaderBar />           {/* height={1} */}
  <box flexGrow={1}>      {/* Content area */}
    {children}            {/* ScreenRouter */}
  </box>
  <StatusBar />           {/* height={1} */}
  <OverlayLayer />        {/* position="absolute" zIndex={100} */}
</box>
```

When the terminal is below minimum size, `AppShell` renders `TerminalTooSmallScreen` instead of the normal layout.

#### Pre-Application Screens

**Terminal Too Small Screen:**
- Centered vertically and horizontally.
- Yellow "Terminal too small" heading.
- Gray "Minimum size: 80×24 — Current: {cols}×{rows}" subtext.
- Gray "Resize your terminal to continue." instruction.
- Only `Ctrl+C` and `q` keybindings are active (quit).
- Automatically replaced with full layout when terminal reaches minimum size.

**Auth Loading Screen:**
- Centered spinner with "Authenticating..." label.
- Spinner uses Braille animation frames (or ASCII fallback on non-Unicode terminals).
- Displayed during the 5-second auth validation window.

**Auth Error Screen (no token):**
- Centered "Not authenticated." in error color.
- Gray "Run `codeplane auth login` to sign in." instruction.
- Process exits with code 1 after displaying.

**Auth Error Screen (expired):**
- Centered "Session expired." in error color.
- Gray "Run `codeplane auth login` to re-authenticate." instruction.
- `R` key to retry validation, `q` to quit.

**Offline Warning (auth):**
- TUI renders normally but status bar shows: "⚠ offline — token not verified" in warning color.
- Full functionality available; API requests may fail individually.

**Error Boundary Screen:**
- Red bold "Something went wrong" heading.
- Red error message text.
- Collapsed stack trace (expandable, displayed in muted color).
- Gray "Press `r` to restart — Press `q` to quit" instruction.
- Responsive: at minimum breakpoint, truncates stack trace more aggressively; at large breakpoint, shows more context lines.
- Respects `NO_COLOR` and `TERM=dumb` (plain text, no color codes).

#### Keybindings (Bootstrap/Renderer Scope)

These keybindings are always active and handled at the GLOBAL priority level (lowest priority, so modals and screens can override):

| Key | Context | Action |
|-----|---------|--------|
| `Ctrl+C` | Always | Graceful shutdown — teardown terminal and exit |
| `q` | Root screen, no modal open | Quit TUI |
| `q` | Non-root screen, no modal open | Pop screen (back) |
| `Esc` | Modal/overlay open | Close modal/overlay |
| `Esc` | No modal open, non-root | Pop screen (back) |
| `Esc` | No modal open, root screen | Quit TUI |
| `?` | Always (except in text input) | Toggle help overlay |
| `:` | Always (except in text input) | Open command palette |
| `r` | Error boundary screen only | Restart application |
| `q` | Error boundary screen only | Quit TUI |

#### Responsive Behavior

| Terminal Size | Classification | Layout Behavior |
|--------------|----------------|------------------|
| < 80×24 | Unsupported | Show "terminal too small" message only |
| 80×24 – 119×39 | Minimum | Header/status bars use single-line compact format. Content area gets full remaining height. Sidebars hidden by default. Breadcrumb truncated aggressively. Modal overlays use 90% width. |
| 120×40 – 199×59 | Standard | Full header with breadcrumb, repo context, and status indicators. Status bar shows full keybinding hints. Sidebars visible by default at 25% width. Modal overlays use 60% width. |
| 200×60+ | Large | Extended breadcrumb path (no truncation). Status bar shows additional metadata. Wider content columns for diffs and code. Sidebar at 30% width. Modal overlays use 50% width. |

On resize between breakpoints:
- Minimum → Standard: Sidebar appears, breadcrumb expands, keybinding hints expand.
- Standard → Minimum: Sidebar hides, breadcrumb truncates, keybinding hints collapse.
- Any → Unsupported: Full layout replaced with "terminal too small" message.
- Unsupported → Any valid: "Terminal too small" message replaced with full layout.
- User sidebar toggle (`Ctrl+B`): Persists preference but respects breakpoint auto-hide at minimum.

#### Data Hooks Consumed

| Hook | Source | Purpose |
|------|--------|----------|
| `useTerminalDimensions()` | `@opentui/react` | Current terminal width and height. Triggers re-render on resize. |
| `useOnResize(callback)` | `@opentui/react` | Register callback for resize events. Used to trigger layout breakpoint recalculations. |
| `useKeyboard(handler)` | `@opentui/react` | Register keyboard event handler at the provider level for centralized dispatch. |
| `useRenderer()` | `@opentui/react` | Direct access to the CliRenderer for imperative operations and event subscriptions. |
| `useTimeline(options)` | `@opentui/react` | Create animation timelines for spinners and transitions. |

The bootstrap also initializes (but does not directly consume) the following providers that downstream features use:

| Provider | Purpose |
|----------|---------|
| `ThemeProvider` | Detects terminal color capability, creates frozen semantic token set. |
| `KeybindingProvider` | Central keyboard dispatch with priority-based scope routing. |
| `OverlayManager` | Modal overlay lifecycle (help, command palette, confirm). |
| `AuthProvider` | Token resolution, validation, auth state management. |
| `APIClientProvider` | Wraps the HTTP client with base URL and auth headers. All `@codeplane/ui-core` hooks consume this. |
| `SSEProvider` | Manages EventSource connections for real-time streaming channels. |
| `NavigationProvider` | Manages the screen stack, push/pop/replace/reset navigation, breadcrumb state. |
| `LoadingProvider` | Screen and mutation loading state, shared spinner coordination. |

#### Bootstrap Sequence (User-Facing Phases)

| Phase | User-Visible Behavior | Duration Target |
|-------|----------------------|------------------|
| 1. TTY assertion | If not a TTY, print error to stderr and exit | < 1ms |
| 2. CLI arg parsing | Parse `--repo`, `--screen`, `--debug` from argv | < 1ms |
| 3. Renderer init | Terminal switches to alternate screen, cursor hides | < 50ms |
| 4. Signal handlers | Register SIGINT, SIGTERM, SIGHUP, SIGWINCH handlers | < 1ms |
| 5. Deep link resolution | Build initial navigation stack from CLI args | < 1ms |
| 6. React root mount | Provider tree initialized, auth validation begins | < 50ms |
| 7. Auth check | Load token; validate against API (5s timeout); show auth loading screen | < 100ms (success) |
| 8. First render | Dashboard (or deep-linked screen) appears with header + status bar | < 200ms total |

#### CLI Command

```
codeplane tui [--repo OWNER/REPO] [--screen SCREEN_NAME] [--debug]
```

- `--repo OWNER/REPO`: Set initial repository context. Format must be `owner/repo` with a single `/` separator. Case-insensitive matching.
- `--screen SCREEN_NAME`: Deep-link to a specific screen (e.g., `issues`, `landings`, `workflows`). Case-insensitive matching against the 31-screen enum. Screens requiring repo context also need `--repo`.
- `--debug`: Enable structured JSON logging to stderr. Also enabled by `CODEPLANE_TUI_DEBUG=true` environment variable.

Environment variables consumed:
- `CODEPLANE_TOKEN`: Authentication token (highest priority).
- `CODEPLANE_API_URL`: API server URL (default: `http://localhost:3000`).
- `CODEPLANE_TUI_DEBUG`: Enable debug logging (`true`/`1`).
- `COLORTERM`: Color depth detection (`truecolor` or `24bit` for 24-bit color).
- `TERM`: Terminal type. `dumb` disables color.
- `NO_COLOR`: When set to `1`, disables all color output.

#### Documentation

The following end-user documentation should be written:

1. **TUI Getting Started Guide**: How to launch the TUI (`codeplane tui`), minimum terminal requirements, authentication prerequisites (`codeplane auth login` first), and the three-zone layout overview.
2. **TUI Keyboard Reference**: Complete table of all global keybindings (Ctrl+C, q, Esc, ?, :, g-prefix) with context descriptions. Linked from the `?` help overlay.
3. **TUI Troubleshooting**: Common issues — terminal too small, auth errors, connection failures, color rendering issues, terminal corruption recovery (`reset` command), multiplexer compatibility notes (tmux, screen, zellij).
4. **TUI Environment Variables**: Reference for `CODEPLANE_TOKEN`, `CODEPLANE_API_URL`, `CODEPLANE_TUI_DEBUG`, `COLORTERM`, `NO_COLOR`, `TERM` and their effects on TUI behavior.
5. **TUI Deep Linking**: How to launch directly to a specific screen with `--repo` and `--screen` flags, with examples for common workflows.

## Permissions & Security

### Authorization

- **Launching the TUI**: No Codeplane-level authorization required. The user must have OS-level permission to execute `codeplane tui` and spawn the Bun process.
- **Auth token requirement**: The TUI requires a valid authentication token to function. It does not implement any OAuth browser flow, login form, or interactive authentication. Authentication is delegated entirely to the CLI via `codeplane auth login`.
- **Token sources** (checked in order):
  1. `CODEPLANE_TOKEN` environment variable
  2. `--token` CLI argument (passed through from `codeplane tui`)
  3. System keychain (macOS Keychain, Linux secret-tool, Windows Credential Manager) via `@codeplane/cli/auth-state` → `resolveAuthToken()`
  4. CLI config file (`~/.codeplane/config.json`)
- **Token format**: Passed in `Authorization: token {token}` header on all API requests.
- **Token validation**: On startup, the TUI makes a request to `${apiUrl}/api/user` to validate the token. If the API responds with 401, the TUI shows an auth error screen. If the API is unreachable (network error or timeout), the TUI proceeds optimistically in offline mode.
- **No token persistence**: The TUI never writes, modifies, or caches auth tokens. It is a read-only consumer of the CLI's credential store.
- **No elevated privileges**: The TUI does not require root/sudo. It operates entirely at user-space privilege level.

### Rate Limiting

- The TUI is subject to the same API rate limits as any other client (120 requests per 60-second window per authenticated user).
- The TUI does not implement client-side rate limiting or request queuing. If the API returns 429, the response is surfaced to the user as an inline error: "Rate limit exceeded. Retry in {seconds}s."
- SSE connections are long-lived and do not count toward the per-request rate limit.
- Auth validation requests use the authenticated rate limit pool.
- Health check requests during connection retry use the unauthenticated rate limit pool.

### Data Privacy & Security Considerations

- The TUI process inherits the terminal's environment, including potentially sensitive variables. It reads only `CODEPLANE_TOKEN`, `CODEPLANE_API_URL`, `CODEPLANE_TUI_DEBUG`, `COLORTERM`, `NO_COLOR`, and `TERM`. It does not log or display other environment variables.
- The auth token is held in process memory for the lifetime of the TUI session. It is not written to disk, temporary files, or the terminal scrollback.
- The alternate screen buffer prevents TUI content from appearing in terminal scrollback after exit, providing a basic defense against shoulder-surfing of sensitive content (issue titles, code diffs, etc.).
- The TUI does not execute any shell commands, spawn child processes (beyond the initial Bun spawn by the CLI), or access the filesystem beyond reading the CLI credential store.
- Debug logging (`--debug`) writes structured JSON to stderr. Debug logs include the `api_url` and `token_source` (env/keyring/config) but never the token value itself.
- On crash or error boundary, stack traces are displayed to the user but are not transmitted anywhere. They remain local to the terminal session.
- No PII is collected or transmitted by the bootstrap layer. The only user-identifying data is the auth token (opaque bearer token) and username (returned from `/api/user`).

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `TUISessionStarted` | `terminal_width`, `terminal_height`, `color_depth` (truecolor/256/16/mono), `term_type` (value of `$TERM`), `multiplexer` (tmux/screen/zellij/none), `auth_source` (env/keyring/config/arg), `auth_status` (authenticated/offline/expired/unauthenticated), `deep_link_screen` (string or null), `deep_link_repo` (string or null), `bootstrap_duration_ms`, `kitty_keyboard` (boolean), `no_color` (boolean) | After first render completes |
| `TUISessionEnded` | `session_duration_ms`, `screens_visited_count`, `exit_reason` (user_quit/ctrl_c/sigterm/sighup/error/auth_expired/crash_loop), `peak_memory_mb`, `error_boundary_count` (number of error boundary triggers during session), `resize_count` | On graceful teardown |
| `TUIBootstrapFailed` | `failure_phase` (tty_check/renderer/auth/connection/render), `error_message`, `error_name`, `terminal_width`, `terminal_height`, `duration_ms` | When bootstrap cannot complete |
| `TUIConnectionRetry` | `api_url`, `attempt_number`, `backoff_seconds`, `error_type` (network/timeout/refused/dns) | Each connection retry attempt |
| `TUITerminalTooSmall` | `terminal_width`, `terminal_height`, `triggered_by` (startup/resize) | When terminal is below minimum size at startup or after resize |
| `TUIResizeEvent` | `old_width`, `old_height`, `new_width`, `new_height`, `old_breakpoint`, `new_breakpoint`, `breakpoint_changed` (boolean) | When terminal is resized (debounced to 1 per second for telemetry) |
| `TUIErrorBoundaryTriggered` | `error_message`, `error_name`, `component_stack`, `current_screen`, `recovery_action` (restart/quit/crash_loop_exit) | When the error boundary catches an unhandled error |
| `TUIAuthResolved` | `source` (env/keyring/config/arg), `api_url`, `duration_ms` | When auth token is successfully resolved |
| `TUIAuthValidated` | `username`, `api_url`, `latency_ms` | When auth token validation returns 200 |
| `TUIAuthOfflineProceed` | `api_url`, `error_type` (timeout/network), `duration_ms` | When auth validation fails but TUI proceeds optimistically |
| `TUIDoubleFault` | `primary_error_name`, `secondary_error_name`, `current_screen` | When ErrorScreen itself throws during error boundary rendering |

### Funnel Metrics & Success Indicators

- **Bootstrap Success Rate**: `TUISessionStarted` / (`TUISessionStarted` + `TUIBootstrapFailed`). Target: > 99%.
- **Mean Bootstrap Duration**: Average `bootstrap_duration_ms` from `TUISessionStarted`. Target: < 200ms.
- **P95 Bootstrap Duration**: 95th percentile of `bootstrap_duration_ms`. Target: < 500ms.
- **Mean Session Duration**: Average `session_duration_ms` from `TUISessionEnded`. Higher is better — indicates users find the TUI useful enough to stay in it. Target: > 5 minutes.
- **Error Boundary Rate**: Percentage of sessions that trigger at least one `TUIErrorBoundaryTriggered`. Target: < 0.1%.
- **Double Fault Rate**: Percentage of sessions that trigger `TUIDoubleFault`. Target: 0%.
- **Crash Loop Rate**: Percentage of sessions ending with `exit_reason=crash_loop`. Target: 0%.
- **Connection Retry Rate**: Percentage of sessions that fire at least one `TUIConnectionRetry`. Target: < 5%.
- **Terminal Too Small Rate**: Percentage of sessions that trigger `TUITerminalTooSmall`. Informational — tracks terminal size distribution.
- **Auth Source Distribution**: Breakdown of `auth_source` values across sessions. Informs which auth flows to prioritize.
- **Color Depth Distribution**: Breakdown of `color_depth` across sessions. Informs whether to invest in truecolor-specific features.
- **Offline Proceed Rate**: `TUIAuthOfflineProceed` / `TUISessionStarted`. Measures API reliability from client perspective. Target: < 2%.
- **Deep Link Usage Rate**: Sessions with non-null `deep_link_screen`. Tracks adoption of deep-link launch.

## Observability

### Logging Requirements

All TUI logs are written to stderr (never stdout, which is the terminal rendering surface). In normal operation, logs are suppressed. When `CODEPLANE_TUI_DEBUG=true` or `--debug` flag is passed, structured JSON logs are emitted to stderr (which can be redirected to a file: `codeplane tui --debug 2>tui.log`).

**Structured Log Context**

All TUI logs include:
- `component: "tui"`
- `phase: "bootstrap" | "renderer" | "auth" | "connection" | "render" | "teardown"`
- `session_id`: Unique ID for this TUI session (for correlating all logs)
- `timestamp`: ISO 8601 timestamp

**Log Events**

| Log | Level | Structured Fields | When |
|-----|-------|-------------------|------|
| `TUI bootstrap started` | `info` | `terminal_width`, `terminal_height`, `term_type`, `color_depth`, `no_color`, `kitty_keyboard` | Process begins |
| `Renderer created` | `debug` | `width`, `height`, `kitty_keyboard`, `mouse_support`, `duration_ms` | OpenTUI renderer initialized |
| `React root attached` | `debug` | `provider_count: 10`, `duration_ms` | React tree mounted |
| `Terminal too small` | `warn` | `width`, `height`, `min_width: 80`, `min_height: 24` | Dimension check fails |
| `Auth token loaded` | `info` | `source` (env/keyring/config/arg), `api_url` | Token found |
| `Auth token missing` | `error` | `checked_sources` (array of source names) | No token found |
| `Auth token invalid` | `error` | `status_code`, `api_url` | 401 from API |
| `Auth validation timeout` | `warn` | `api_url`, `timeout_ms: 5000` | 5s timeout exceeded |
| `Auth validation network error` | `warn` | `api_url`, `error_type`, `error_message` | Network failure during validation |
| `API health check passed` | `info` | `api_url`, `username`, `latency_ms` | `/api/user` responds 200 |
| `First render complete` | `info` | `total_bootstrap_ms`, `screen`, `breakpoint` | First meaningful paint |
| `Terminal resized` | `debug` | `old_width`, `old_height`, `new_width`, `new_height`, `old_breakpoint`, `new_breakpoint`, `render_ms` | SIGWINCH handled |
| `Error boundary caught` | `error` | `error_name`, `error_message`, `component_stack`, `current_screen` | Unhandled React error |
| `Crash loop detected` | `error` | `restart_count`, `window_ms: 5000` | 5+ restarts in 5s |
| `Double fault` | `error` | `primary_error`, `secondary_error`, `current_screen` | ErrorScreen throws |
| `Graceful shutdown started` | `info` | `trigger` (quit/ctrl_c/sigint/sigterm/sighup) | Teardown begins |
| `Graceful shutdown complete` | `info` | `session_duration_ms`, `teardown_ms` | Terminal restored |
| `Signal received` | `debug` | `signal` (SIGINT/SIGTERM/SIGHUP/SIGWINCH), `shutting_down` (boolean) | Any signal handler fires |
| `Deep link resolved` | `debug` | `screen`, `repo`, `stack_depth`, `valid` (boolean) | CLI args parsed into navigation stack |
| `Frame rendered` | `trace` | `frame_number`, `render_ms`, `nodes_count` | Every frame (trace level only) |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `tui_bootstrap_duration_seconds` | Histogram | `outcome` (success/failure), `failure_phase` | Time from process start to first meaningful render |
| `tui_session_duration_seconds` | Histogram | `exit_reason` | Total session duration |
| `tui_auth_validation_duration_seconds` | Histogram | `outcome` (authenticated/offline/expired/unauthenticated), `source` | Auth token validation latency |
| `tui_error_boundary_total` | Counter | `error_name`, `screen` | Count of error boundary triggers |
| `tui_crash_loop_exits_total` | Counter | — | Count of crash loop forced exits |
| `tui_double_fault_total` | Counter | — | Count of double fault exits |
| `tui_resize_events_total` | Counter | `breakpoint_changed` (true/false) | Count of terminal resize events |
| `tui_terminal_too_small_total` | Counter | `trigger` (startup/resize) | Count of terminal too small events |
| `tui_active_sessions` | Gauge | — | Currently running TUI sessions (for daemon-mode aggregation) |
| `tui_memory_rss_bytes` | Gauge | — | Current RSS memory usage |
| `tui_frame_render_duration_seconds` | Histogram | — | Per-frame render time |
| `tui_keyboard_event_latency_seconds` | Histogram | — | Time from keypress to handler execution |

### Alerts

**ALERT: TUI Bootstrap Failure Rate High**
- Condition: `rate(tui_error_boundary_total[5m]) > 0` AND `tui_bootstrap_duration_seconds{outcome="failure"}` > 10% of total bootstraps over 1h.
- Severity: P1
- Runbook:
  1. Check `tui_bootstrap_duration_seconds` histogram for `failure_phase` label distribution — identifies whether failures cluster in `tty_check`, `renderer`, `auth`, or `render`.
  2. If `failure_phase=renderer`: Check OpenTUI native library availability. Verify Zig native binary is present in `node_modules/@opentui/core`. Check for platform/architecture mismatches.
  3. If `failure_phase=auth`: Check API server health. Verify auth endpoint `/api/user` is responding. Check for mass token expirations.
  4. If `failure_phase=tty_check`: Likely environmental — users running in non-interactive shells. Informational, not actionable.
  5. Escalate to TUI team if failures persist after infrastructure checks.

**ALERT: TUI Error Boundary Spike**
- Condition: `rate(tui_error_boundary_total[5m]) > 5`.
- Severity: P2
- Runbook:
  1. Check `error_name` and `screen` labels to identify the crashing component.
  2. Correlate with recent deployments — check if a new TUI version was released.
  3. Check if the error is in a specific screen (indicates a screen-level bug) or across screens (indicates a framework-level issue).
  4. Review debug logs from affected sessions for `error_message` and `component_stack`.
  5. If crash loop exits are also increasing (`tui_crash_loop_exits_total`), this is a P1 — the error boundary recovery is not working.

**ALERT: TUI Crash Loop Exits**
- Condition: `increase(tui_crash_loop_exits_total[1h]) > 0`.
- Severity: P1
- Runbook:
  1. A crash loop exit means the error boundary triggered 5+ times within 5 seconds — the app is in an unrecoverable state.
  2. Check the most recent error boundary events for the `error_name` pattern.
  3. This usually indicates a bug in a provider or the AppShell itself (not a screen). Focus investigation on the provider hierarchy.
  4. Check for external dependencies that may have changed (API contract changes, OpenTUI version incompatibility).
  5. Hot-fix required — users cannot use the TUI until resolved.

**ALERT: TUI Double Fault**
- Condition: `increase(tui_double_fault_total[1h]) > 0`.
- Severity: P0
- Runbook:
  1. A double fault means the ErrorScreen component itself crashed. This is a critical defect in the error recovery path.
  2. Check debug logs for both `primary_error` and `secondary_error`.
  3. The ErrorScreen must be absolutely minimal and cannot rely on any provider context. Verify it doesn't use `useTheme()`, `useLayout()`, or any context hooks.
  4. Immediate fix required — deploy a patch to the ErrorScreen component.

**ALERT: TUI Memory Growth**
- Condition: `tui_memory_rss_bytes > 300_000_000` (300MB) sustained for 10 minutes.
- Severity: P2
- Runbook:
  1. Normal steady-state is <150MB RSS. Growth beyond 300MB indicates a memory leak.
  2. Check if the leak correlates with specific screens (navigation stack not cleaning up).
  3. Check SSE connections — are EventSource instances accumulating without cleanup?
  4. Check animation timelines — are `useTimeline` instances not being deregistered?
  5. Reproduce with `--debug` and monitor frame-by-frame node counts.
  6. Profile with `bun --inspect` if reproducible locally.

### Error Cases and Failure Modes

| Failure | Severity | Impact | Detection | Recovery |
|---------|----------|--------|-----------|----------|
| stdin is not a TTY | P0 | Fatal — TUI cannot accept keyboard input | `process.stdin.isTTY` check | Exit with clear error. No recovery needed. |
| stdout is not a TTY | P0 | Fatal — TUI cannot render to terminal | `process.stdout.isTTY` check | Exit with clear error. No recovery needed. |
| OpenTUI native library load fails | P0 | Fatal — no rendering possible | `createCliRenderer()` throws | Exit with error: "Failed to load terminal renderer." |
| Terminal smaller than 80×24 | P2 | Non-fatal — layout degraded | `useTerminalDimensions()` below-minimum | Show "terminal too small" message. Auto-recover on resize. |
| Auth token not found | P1 | Fatal — cannot make API requests | Token loading returns null | Exit with message directing to `codeplane auth login`. |
| Auth token expired (401) | P1 | Fatal — all API requests will fail | 401 from `/api/user` | Show auth error screen with retry. |
| API server unreachable | P2 | Degraded — proceed offline | Network error on validation | Proceed optimistically. Status bar warning. |
| API returns 429 | P2 | Degraded — rate limited | 429 status code | Proceed optimistically. Inline error on affected request. |
| SSE connection drops | P2 | Degraded — real-time updates pause | EventSource `onerror` event | Auto-reconnect with exponential backoff (1s→30s). Status bar indicator. |
| SIGWINCH during render | P3 | Cosmetic — frame may be interrupted | Signal received mid-render | Queue resize, finish current frame, then re-render. |
| Unhandled React error | P2 | Non-fatal — current screen broken | Error boundary `componentDidCatch` | Show error screen. `r` to restart, `q` to quit. |
| Crash loop (5 restarts in 5s) | P1 | Fatal — unrecoverable error | CrashLoopDetector window check | Exit to stderr with diagnostic message. |
| Double fault (ErrorScreen throws) | P0 | Fatal — error recovery broken | ErrorBoundary catches secondary | Log both errors to stderr. Exit immediately. |
| SIGKILL / OOM kill | P0 | Fatal — no cleanup possible | Process terminated by OS | Terminal left in raw mode. User runs `reset`. |
| Double Ctrl+C (rapid) | P3 | Potential double-teardown | Second SIGINT during teardown | Guard with `shuttingDown` flag. Second signal ignored or forces exit. |
| Bun process crash | P0 | Fatal — unrecoverable | Uncaught exception outside React tree | Process exits with code 1. Terminal may need `reset`. |

## Verification

### E2E Tests — `e2e/tui/app-shell.test.ts`

Tests use `@microsoft/tui-test` for terminal snapshot matching, keyboard simulation, and text assertions.

#### Bootstrap and First Render

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders initial layout with header, content area, and status bar`: Launch TUI with valid auth. Assert terminal snapshot shows three-section layout: header bar at row 0, content area in the middle, status bar at the last row.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — first render completes within 200ms`: Launch TUI, measure time to first meaningful content. Assert elapsed time < 200ms.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — header bar shows breadcrumb and notification badge`: Launch TUI with valid auth. Assert header bar contains "Dashboard" breadcrumb text and notification indicator.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — status bar shows keybinding hints and help reference`: Launch TUI with valid auth. Assert status bar contains "? help" text.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — alternate screen buffer is active`: Launch TUI, verify that terminal content does not appear in scrollback (snapshot comparison confirms alternate screen).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — debug logging emits structured JSON to stderr`: Launch TUI with `--debug`. Capture stderr output. Assert at least one line is valid JSON with `component: "tui"` and `phase: "bootstrap"`.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — no output to stdout/stderr in normal mode`: Launch TUI without `--debug`. Capture stderr. Assert stderr is empty during normal operation.

#### Terminal Dimension Enforcement

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows "terminal too small" at 79x24`: Launch TUI with terminal size 79×24. Assert screen contains "Terminal too small" and "Minimum size: 80×24" and "Current: 79×24".
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows "terminal too small" at 80x23`: Launch TUI with terminal size 80×23. Assert screen contains "Terminal too small" and "Current: 80×23".
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows "terminal too small" at 1x1`: Launch TUI with terminal size 1×1. Assert screen contains "Terminal too small" (verifies extreme minimum).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders full layout at exactly 80x24`: Launch TUI with terminal size 80×24. Assert terminal snapshot shows header bar, content area, and status bar (not the "too small" message).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders full layout at exactly 120x40`: Launch TUI with terminal size 120×40. Assert standard layout with full breadcrumb and repo context.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders full layout at exactly 200x60`: Launch TUI with terminal size 200×60. Assert large layout with expanded content.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — transitions from too-small to valid on resize`: Launch TUI at 60×20. Assert "terminal too small" message. Resize to 80×24. Assert full layout replaces the message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — transitions from valid to too-small on resize`: Launch TUI at 120×40. Assert full layout. Resize to 70×20. Assert "terminal too small" message replaces layout.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — transitions from too-small directly to large on resize`: Launch TUI at 60×20. Assert "terminal too small". Resize to 200×60. Assert large layout renders correctly.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — maximum terminal dimensions 65535x65535`: Launch TUI at 65535×65535. Assert no crash, layout renders (verifies max boundary).

#### Responsive Layout at Standard Breakpoints

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — minimum layout at 80x24`: Launch TUI at 80×24 with valid auth. Take terminal snapshot. Assert header bar is compact (truncated breadcrumb), status bar shows abbreviated hints, content area fills remaining rows.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — standard layout at 120x40`: Launch TUI at 120×40 with valid auth. Take terminal snapshot. Assert header bar shows full breadcrumb, repo context area, and notification badge. Status bar shows full keybinding hints.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — large layout at 200x60`: Launch TUI at 200×60 with valid auth. Take terminal snapshot. Assert header bar shows expanded breadcrumb without truncation. Layout uses additional width for content columns.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — resize from standard to minimum collapses layout`: Launch TUI at 120×40. Resize to 80×24. Assert sidebar is hidden and breadcrumb is truncated.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — resize from minimum to standard expands layout`: Launch TUI at 80×24. Resize to 120×40. Assert sidebar appears and breadcrumb expands.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — resize from standard to large expands layout`: Launch TUI at 120×40. Resize to 200×60. Assert layout uses expanded width.

#### Keyboard Input

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Ctrl+C exits cleanly`: Launch TUI. Send Ctrl+C keypress. Assert process exits with code 0.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — q on root screen exits`: Launch TUI (dashboard is root). Send `q` keypress. Assert process exits with code 0.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Esc on root screen with no modal exits`: Launch TUI. Send `Esc` keypress. Assert process exits with code 0.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — ? toggles help overlay`: Launch TUI. Send `?` keypress. Assert help overlay appears (snapshot shows modal with keybinding list). Send `?` again. Assert help overlay disappears.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — : opens command palette`: Launch TUI. Send `:` keypress. Assert command palette overlay appears with text input focused.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Esc closes command palette`: Launch TUI. Send `:` to open command palette. Send `Esc`. Assert command palette is dismissed and focus returns to content.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Esc closes help overlay`: Launch TUI. Send `?` to open help. Send `Esc`. Assert help overlay is dismissed.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — rapid key input does not drop events`: Launch TUI on a list screen. Send 20 `j` keypresses in rapid succession (< 5ms apart). Assert cursor moved down 20 positions (or to end of list if shorter).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — keyboard input latency under 16ms`: Launch TUI. Send keypress with timing instrumentation. Assert handler fires within 16ms.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Ctrl+C exits from any overlay state`: Launch TUI. Open help overlay with `?`. Send Ctrl+C. Assert process exits with code 0 (not just overlay close).

#### Authentication Handling

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows auth error when no token`: Launch TUI with no CODEPLANE_TOKEN and no keychain token. Assert screen shows "Not authenticated" and "codeplane auth login" text.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows session expired on 401`: Launch TUI with an invalid/expired token (API returns 401). Assert screen shows "Session expired" text.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — loads token from CODEPLANE_TOKEN env var`: Set `CODEPLANE_TOKEN=valid_token`. Launch TUI. Assert TUI proceeds to dashboard (no auth error).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — proceeds offline when API is unreachable`: Launch TUI with valid token but unreachable API. Assert TUI renders with status bar showing offline warning "⚠ offline".
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — proceeds offline on auth validation timeout`: Launch TUI with valid token but API that delays >5s. Assert TUI renders in offline mode after timeout.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — proceeds offline on 429 rate limit during auth`: Launch TUI with valid token but API returns 429. Assert TUI renders in offline mode.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows auth confirmation flash in status bar`: Launch TUI with valid auth. Assert status bar shows authentication confirmation text for ~3 seconds.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows retry option on auth error`: Trigger auth error screen. Assert `R` key is available for retry.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — auth token max length 512 chars accepted`: Set CODEPLANE_TOKEN to a 512-character string. Launch TUI. Assert no token length error.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — auth token exceeding 512 chars rejected`: Set CODEPLANE_TOKEN to a 513-character string. Launch TUI. Assert token length error.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — API URL max length 2048 chars accepted`: Set CODEPLANE_API_URL to a 2048-character URL. Launch TUI. Assert no URL length error.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — API URL exceeding 2048 chars rejected`: Set CODEPLANE_API_URL to a 2049-character URL. Launch TUI. Assert URL length error.

#### Connection Handling

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — shows connecting screen when API is unreachable`: Launch TUI pointed at unreachable API URL. Assert screen shows "Connecting to Codeplane at {url}..." with spinner text.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — retries connection with backoff`: Launch TUI pointed at unreachable API. Wait for first retry. Assert retry message updates with increasing backoff time.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — transitions to dashboard when API becomes available`: Launch TUI pointed at initially-unreachable API. Start API server. Assert TUI transitions from connecting screen to dashboard.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — Ctrl+C exits from connecting screen`: Launch TUI pointed at unreachable API. Send Ctrl+C. Assert process exits cleanly.

#### Error Boundary

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — error boundary catches render error`: Launch TUI with a component that throws during render. Assert error boundary screen shows "Something went wrong" in red and the error message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — error boundary shows restart and quit hints`: Trigger error boundary. Assert screen contains "Press `r` to restart" and "Press `q` to quit" text.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — r in error boundary restarts app`: Trigger error boundary. Send `r` keypress. Assert application re-renders (error boundary replaced with normal layout or new error if underlying issue persists).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — q in error boundary exits`: Trigger error boundary. Send `q` keypress. Assert process exits cleanly.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — crash loop detection exits after 5 rapid restarts`: Trigger error boundary. Send `r` five times in rapid succession (<5s total). Assert process exits with crash loop error message to stderr.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — error boundary shows stack trace`: Trigger error boundary. Assert stack trace text is present (collapsed initially).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — error boundary respects NO_COLOR`: Set `NO_COLOR=1`. Trigger error boundary. Assert error screen renders without ANSI color escape codes.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — error boundary respects TERM=dumb`: Set `TERM=dumb`. Trigger error boundary. Assert error screen renders without color codes.

#### Terminal Teardown

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — terminal state restored after quit`: Launch TUI. Send `q` to exit. Assert terminal is no longer in raw mode, cursor is visible, and alternate screen buffer is exited.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — terminal state restored after Ctrl+C`: Launch TUI. Send Ctrl+C. Assert terminal state is properly restored.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — teardown on SIGTERM`: Launch TUI. Send SIGTERM to process. Assert process exits with code 0 and terminal state is restored.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — teardown on SIGHUP`: Launch TUI. Send SIGHUP to process. Assert process exits with code 0.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — double SIGINT does not crash`: Launch TUI. Send two SIGINT signals in rapid succession (<100ms apart). Assert process exits cleanly without crash.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — exit code 0 on clean quit`: Launch TUI. Send `q`. Assert exit code is 0.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — exit code 1 on fatal error`: Launch TUI with conditions that cause fatal error (no token). Assert exit code is 1.

#### Color and Theme

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders with ANSI 256 colors by default`: Launch TUI without COLORTERM set. Take snapshot. Assert color escape codes in output use ANSI 256 color sequences.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders with truecolor when COLORTERM=truecolor`: Launch TUI with `COLORTERM=truecolor`. Take snapshot. Assert color escape codes use 24-bit RGB sequences.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders with truecolor when COLORTERM=24bit`: Launch TUI with `COLORTERM=24bit`. Take snapshot. Assert truecolor sequences.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders without color when NO_COLOR=1`: Launch TUI with `NO_COLOR=1`. Take snapshot. Assert no ANSI color escape codes in output.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — renders without color when TERM=dumb`: Launch TUI with `TERM=dumb`. Take snapshot. Assert no color escape codes but layout still renders.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — semantic color tokens applied consistently`: Launch TUI. Assert header bar uses `border` color for separator, status bar uses `muted` color for text, and focused items use `primary` color.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — theme tokens are frozen after startup`: Launch TUI. Verify that theme tokens object is frozen (Object.isFrozen) and cannot be mutated.

#### Resize Behavior

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — layout re-renders on resize`: Launch TUI at 120×40. Resize to 160×50. Assert layout dimensions update (snapshot reflects new size).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — rapid resize does not crash`: Launch TUI. Send 10 resize events in rapid succession with varying dimensions. Assert no crash, no error boundary triggered, and final layout matches final dimensions.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — resize within same breakpoint re-renders`: Launch TUI at 120×40. Resize to 130×45. Assert layout updates (same breakpoint but new dimensions).

#### Non-TTY Detection

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — exits with error when stdin is piped`: Launch TUI with stdin piped (not a TTY). Assert output contains "stdin is not a TTY" and process exits with code 1.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — exits with error when stdout is piped`: Launch TUI with stdout piped (not a TTY). Assert output contains "stdout is not a TTY" and process exits with code 1.

#### Deep Link Launch

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — navigation provider initializes with dashboard as root`: Launch TUI without args. Assert current screen is dashboard. Assert navigation stack depth is 1.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — navigation provider initializes with deep-linked screen`: Launch TUI with `--repo owner/repo --screen issues`. Assert navigation stack contains Dashboard → RepoOverview → Issues.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — invalid --repo format ignored gracefully`: Launch TUI with `--repo invalid-no-slash`. Assert TUI launches to dashboard (no crash).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — empty --repo ignored gracefully`: Launch TUI with `--repo ""`. Assert TUI launches to dashboard.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — invalid --screen ignored gracefully`: Launch TUI with `--screen nonexistent`. Assert TUI launches to dashboard.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — --screen requiring repo without --repo falls back to dashboard`: Launch TUI with `--screen issues` but no `--repo`. Assert TUI launches to dashboard.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — --screen is case insensitive`: Launch TUI with `--screen ISSUES --repo owner/repo`. Assert issues screen is shown.

#### Provider Initialization

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — SSE provider initializes without errors`: Launch TUI with valid auth. Assert no SSE-related errors in output.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — theme provider detects color capability`: Launch TUI with `COLORTERM=truecolor`. Assert theme provider reports truecolor tier.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — keybinding provider dispatches to correct priority`: Launch TUI. Open modal (`:` for command palette). Press `q`. Assert modal closes (not app quit) because modal has higher priority than global.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — overlay manager supports only one overlay at a time`: Launch TUI. Open help (`?`). Press `:`. Assert command palette replaces help (mutual exclusion).
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — loading provider coordinates spinner animation`: Launch TUI during auth loading. Assert spinner animation renders (Braille characters cycling).

#### Memory and Performance

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — steady state memory under 150MB RSS`: Launch TUI. Navigate to dashboard. Measure RSS. Assert < 150MB.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — screen transition under 50ms`: Launch TUI. Navigate push/pop. Measure transition time. Assert < 50ms.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — no memory growth over extended session`: Launch TUI. Perform 100 push/pop navigation cycles. Measure RSS. Assert growth < 10MB from baseline.

#### Golden Snapshot Tests

- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: dashboard at 80x24`: Full terminal snapshot at 80×24 showing minimum layout.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: dashboard at 120x40`: Full terminal snapshot at 120×40 showing standard layout.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: dashboard at 200x60`: Full terminal snapshot at 200×60 showing large layout.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: terminal too small at 60x20`: Full terminal snapshot showing the "terminal too small" message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: auth loading screen`: Full terminal snapshot showing spinner and "Authenticating..." label.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: auth error screen (no token)`: Full terminal snapshot showing the "Not authenticated" message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: auth error screen (expired)`: Full terminal snapshot showing the "Session expired" message.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: offline mode status bar`: Full terminal snapshot showing status bar with offline warning.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: connecting screen`: Full terminal snapshot showing the connection retry screen with spinner.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: error boundary screen`: Full terminal snapshot showing the error boundary with error message and restart/quit hints.
- [ ] `TUI_BOOTSTRAP_AND_RENDERER — golden snapshot: error boundary screen (NO_COLOR)`: Full terminal snapshot showing error boundary without color codes.

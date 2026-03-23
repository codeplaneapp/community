# TUI_ERROR_BOUNDARY

Specification for TUI_ERROR_BOUNDARY.

## High-Level User POV

When something goes catastrophically wrong inside the Codeplane TUI — an uncaught exception in a screen component, a corrupted data hook response that crashes the renderer, or an infinite render loop — the user sees a clean, actionable error screen instead of a garbled terminal or a silent exit. The error boundary catches the crash at the application root, prevents it from tearing down the entire TUI process, and presents the user with exactly two options: restart the application to the Dashboard, or quit cleanly.

The error screen replaces the content area entirely. A red cross symbol and "Something went wrong" heading appear prominently at the top of the screen, immediately signaling that the application has entered an error state. Below the heading, the error message text is displayed in the `error` color — this is the human-readable summary of what failed. The message is wrapped to fit the terminal width, never extending beyond the available columns.

Below the error message, a collapsed stack trace section is available. By default the stack trace is hidden, with only a toggle hint visible: `▸ Stack trace (s to toggle)`. When the user presses `s`, the full stack trace expands into a scrollable region, rendered in muted gray inside a bordered box. The trace can be scrolled with `j`/`k` keys for line-by-line movement, `G`/`g g` to jump to bottom/top, and `Ctrl+D`/`Ctrl+U` for page-wise movement. Pressing `s` a second time collapses the trace. This keeps the error screen clean and scannable for users who just want to restart, while giving developers the diagnostic detail they need without switching to a log file.

At the bottom of the error screen, two clear action hints are displayed: `r:restart` and `q:quit`. Pressing `r` clears the error state, resets the navigation stack to the Dashboard, and re-renders the application from scratch — a full React tree unmount and remount, ensuring any corrupted component state is purged. Pressing `q` exits the TUI cleanly, restoring the terminal to its normal state. `Ctrl+C` continues to work as an immediate emergency exit regardless of error state. A help overlay is available via `?` that lists all error screen keybindings.

The error screen maintains the app shell chrome: the header bar and status bar remain visible in their last-known state, providing visual continuity and confirming to the user that the TUI process is still alive and responsive. The header breadcrumb reflects whichever screen was active when the crash occurred. If the error occurs before any screen has mounted, the error screen renders without navigation context but still provides the same `r`/`q`/`Ctrl+C` affordances.

At minimum terminal size (80×24), the error screen fits comfortably within 22 content rows. At larger terminal sizes, the error message and stack trace have more breathing room and the layout is centered with generous padding. If the terminal is resized while the error screen is displayed, the layout re-flows immediately. If the terminal shrinks below minimum size during an error, the global "Terminal too small" message takes priority; restoring the terminal to a supported size brings back the error screen.

If the user presses `r` to restart but the underlying issue persists and the application crashes again immediately, the error boundary detects a crash loop — three or more restarts within a five-second window — and exits the TUI to stderr with a diagnostic message rather than trapping the user in an infinite restart cycle. If the error boundary's own error screen fails to render (a double fault), the TUI exits immediately to stderr with both error messages, ensuring the terminal is never left in a corrupted state.

## Acceptance Criteria

### Definition of Done

- [ ] A React class component error boundary wraps the main content area below the `<AuthProvider>` and above the `<NavigationProvider>` in the TUI component tree
- [ ] The error boundary catches all uncaught exceptions thrown during React render, lifecycle methods, and constructors of any descendant component
- [ ] When an error is caught, the error boundary renders a full error screen replacing the content area
- [ ] The error screen displays: a red "✗ Something went wrong" heading, the error message, a collapsible stack trace, and action hints (`r:restart`, `q:quit`)
- [ ] Pressing `r` on the error screen resets the error boundary state, resets the navigation stack to the Dashboard, and unmounts/remounts the application content tree via incrementing a `resetToken` key
- [ ] Pressing `q` on the error screen exits the TUI cleanly with exit code 0, restoring terminal state
- [ ] Pressing `Ctrl+C` on the error screen exits the TUI immediately with exit code 0
- [ ] Pressing `s` on the error screen toggles stack trace visibility between collapsed (toggle hint only) and expanded (full scrollable trace in bordered box)
- [ ] When the stack trace is expanded, `j`/`k`/`Up`/`Down` scroll within the trace line-by-line, `G` jumps to bottom, `g g` jumps to top, `Ctrl+D` pages down by half visible height, `Ctrl+U` pages up by half visible height
- [ ] The header bar and status bar remain visible during error display (they are rendered outside the error boundary, above it in the tree)
- [ ] If the error boundary catches a second error during the error screen render itself (double fault), the TUI writes both errors to stderr and exits with code 1
- [ ] The `componentDidCatch` lifecycle logs the error via `logger.error()` and reports it to the telemetry system before any state transitions
- [ ] The error message text is wrapped to fit `terminal_width - (paddingX * 2)` characters, where paddingX varies by breakpoint
- [ ] The error heading uses the `error` semantic color token (red / `#DC2626` truecolor)
- [ ] The stack trace text uses the `muted` semantic color token (gray / `#A3A3A3` truecolor)
- [ ] The action hints use `primary` for the key label (bold) and `muted` for the description text
- [ ] Error values are normalized via `normalizeError()` before display — all thrown types (Error, string, object, null, undefined, number) produce valid Error objects
- [ ] The error boundary uses `getDerivedStateFromError` to capture thrown values and `componentDidCatch` for side-effects (logging, telemetry)
- [ ] Restart resets all cached data: SSE subscriptions, data hook caches, navigation stack — by unmount/remount cycle
- [ ] All global navigation keybindings (`g d`, `:`, etc.) are suppressed on the error screen — only error-specific keys are active

### Edge Cases

- [ ] At minimum terminal size (80×24), the error screen fits within 22 content rows: heading (1 row + padding), error message (up to 3 wrapped lines), stack trace toggle (1 row), spacer, action hints (1 row + padding)
- [ ] At minimum terminal size, if the error message exceeds 3 lines when wrapped to 76 characters, it is truncated with `…` on the last visible line
- [ ] At sub-minimum terminal size (<80×24), the global "Terminal too small" message takes priority over the error screen
- [ ] If the terminal is resized while the error screen is displayed, the layout re-flows immediately with no flicker; scroll position in the stack trace is clamped to the new max offset if necessary
- [ ] If the terminal has no color support (`NO_COLOR=1` or `TERM=dumb`), the error heading uses `[ERROR] Something went wrong` instead of the `✗` symbol with color
- [ ] Rapid `r` key presses are debounced at 500ms — subsequent presses within the debounce window are ignored, preventing multiple restart cycles
- [ ] If the error occurs during initial render (before any screen has mounted), the error screen still renders with full functionality
- [ ] Crash loop detection: if 3+ restarts occur within a 5-second window, the TUI exits to stderr with "Repeated crash detected. Exiting." and exit code 1
- [ ] Error objects without a `.stack` property render the error message only; the stack trace toggle hint and `s:trace` action hint are both hidden
- [ ] Non-Error thrown values (strings, numbers, objects, null, undefined) are normalized to Error objects with appropriate `.message` values
- [ ] If the error occurs on a non-Dashboard screen, pressing `r` returns the user to Dashboard (not back to the crashed screen)
- [ ] Help overlay (`?`) renders correctly on the error screen, displaying only error-specific keybindings; `Esc` or `?` dismisses it
- [ ] While the help overlay is open, only `Esc` and `?` are processed — `r`, `q`, `s`, scroll keys are suppressed
- [ ] The `g g` sequence is detected via a 500ms window between the two `g` presses; a single `g` followed by timeout is ignored
- [ ] Stack trace scrolling does not allow scrolling past the bounds (offset clamped to 0..maxScrollOffset)

### Boundary Constraints

- [ ] Error message display is capped at 500 characters (`ERROR_MESSAGE_MAX_CHARS`); longer messages are truncated with `…`
- [ ] Stack trace display is capped at 200 lines (`STACK_TRACE_MAX_LINES`); longer traces show the first 200 lines with a `(truncated — {N} more lines)` indicator at the end
- [ ] The stack trace scrollbox visible height is capped at `min(maxTraceHeight, truncatedStackLines.length)` rows, where maxTraceHeight is `terminal_height - 10` capped per breakpoint (10 at 80×24, 24 at 120×40, 44 at 200×60)
- [ ] Restart debounce window: 500ms (`RESTART_DEBOUNCE_MS`)
- [ ] Crash loop window: 5000ms (`CRASH_LOOP_WINDOW_MS`)
- [ ] Crash loop max restarts: 3 (`CRASH_LOOP_MAX_RESTARTS`)
- [ ] Crash loop ring buffer size: 5 entries maximum
- [ ] Telemetry error message truncated to first 100 characters in events
- [ ] Restart via `r` clears all cached data in the navigation context, data hooks, and SSE subscriptions — it is a hard reset

## Design

### TUI UI

#### Error Screen Layout

The error boundary wraps the content area inside the app shell chrome:

```
┌─────────────────────────────────────────────────┐
│ Dashboard                              ● ◆ 3    │  ← Header bar (outside boundary)
├─────────────────────────────────────────────────┤
│                                                 │
│  ✗ Something went wrong                        │
│                                                 │
│  Cannot read properties of undefined            │
│  (reading 'title')                              │
│                                                 │
│  ▸ Stack trace (s to toggle)                    │
│                                                 │
├─────────────────────────────────────────────────┤
│ r:restart  q:quit  s:trace             ?:help   │  ← Status bar (outside boundary)
└─────────────────────────────────────────────────┘
```

When the stack trace is expanded:

```
┌─────────────────────────────────────────────────┐
│ Dashboard                              ● ◆ 3    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ✗ Something went wrong                        │
│                                                 │
│  Cannot read properties of undefined            │
│  (reading 'title')                              │
│                                                 │
│  ▾ Stack trace (s to toggle)                    │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │ at Object.<anonymous> (Dashboard.tsx:42)│    │
│  │ at renderWithHooks (react-dom.js:1234)  │    │
│  │ at mountIndeterminate (react-dom:5678)  │    │
│  │ ...                                     │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
├─────────────────────────────────────────────────┤
│ r:restart  q:quit  s:trace             ?:help   │
└─────────────────────────────────────────────────┘
```

When errors lack a `.stack` property:

```
┌─────────────────────────────────────────────────┐
│ Dashboard                              ● ◆ 3    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ✗ Something went wrong                        │
│                                                 │
│  Test error                                     │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ r:restart  q:quit                      ?:help   │  ← no s:trace hint
└─────────────────────────────────────────────────┘
```

#### No-Color Mode

When `NO_COLOR=1` or `TERM=dumb`:

- Heading renders as `[ERROR] Something went wrong` (no `✗` symbol, no color)
- Error message renders as plain text (no red)
- Stack trace renders as plain text (no gray)
- Action hints render as plain text (no blue/gray distinction)
- Toggle symbols `▸`/`▾` are preserved (Unicode box-drawing baseline)

#### Help Overlay

Activated by `?`, renders as a modal overlay centered on the error screen:

```
┌─────────────────────────────────────────┐
│ Error Screen Keybindings                │
│ ──────────────────────                  │
│ r       Restart TUI                     │
│ q       Quit TUI                        │
│ Ctrl+C  Quit immediately                │
│ s       Toggle stack trace              │
│ j/↓    Scroll trace down               │
│ k/↑    Scroll trace up                 │
│ G       Jump to trace bottom            │
│ gg      Jump to trace top               │
│ Ctrl+D  Page down                       │
│ Ctrl+U  Page up                         │
│ ?       Close this help                 │
│                                         │
│ Press ? or Esc to close                 │
└─────────────────────────────────────────┘
```

At minimum terminal size (80×24): overlay uses 90% width/height.
At standard/large sizes: overlay uses 60% width/height, positioned at 20% left offset.

#### Component Tree (OpenTUI + React 19)

```tsx
<ErrorBoundary onReset={handleRestart} onQuit={handleQuit} currentScreen={screenRef} noColor={noColor}>
  <NavigationProvider key={navResetKey}>
    <SSEProvider>
      <CurrentScreen />
    </SSEProvider>
  </NavigationProvider>
</ErrorBoundary>
```

#### Keybindings

| Key | Action | Condition |
|-----|--------|-----------|
| `r` | Restart TUI (reset to Dashboard) | Always (debounced 500ms) |
| `q` | Quit TUI cleanly (exit code 0) | Always |
| `Ctrl+C` | Quit TUI immediately (exit code 0) | Always (global) |
| `s` | Toggle stack trace expanded/collapsed | Only when error has `.stack` |
| `j` / `Down` | Scroll down 1 line in expanded stack trace | Stack trace expanded |
| `k` / `Up` | Scroll up 1 line in expanded stack trace | Stack trace expanded |
| `G` | Jump to bottom of stack trace | Stack trace expanded |
| `g g` | Jump to top of stack trace (500ms chord window) | Stack trace expanded |
| `Ctrl+D` | Page down by half visible height | Stack trace expanded |
| `Ctrl+U` | Page up by half visible height | Stack trace expanded |
| `?` | Toggle help overlay | Always |
| `Esc` | Dismiss help overlay | Help overlay open |

All other keybindings are suppressed on the error screen. Global go-to (`g d`, `g r`, etc.), command palette (`:`), and all screen-specific keybindings do not fire.

#### Responsive Sizing

| Terminal Size | Breakpoint | Error Message Max Lines | Stack Trace Max Height | Horizontal Padding | Centered |
|---------------|------------|------------------------|------------------------|-------------------|----------|
| 80×24 | minimum | 3 lines (truncate with `…`) | 10 rows max | 2 chars per side | No |
| 120×40 | standard | 6 lines | 24 rows max | 4 chars per side | No |
| 200×60 | large | 10 lines | 44 rows max | 6 chars per side | Yes |
| <80×24 | unsupported | N/A — "Terminal too small" | N/A | N/A | N/A |

On resize: `useOnResize()` triggers re-render. Error message re-wraps to new width. Scroll position is preserved (clamped to new max if trace region shrinks).

#### Data Hooks

The error boundary itself consumes NO `@codeplane/ui-core` data hooks (the error may have been caused by a data hook). The error screen uses only OpenTUI hooks:

| Hook | Source | Purpose |
|------|--------|---------|
| `useKeyboard()` | `@opentui/react` | Handle r, q, s, scroll keys, help overlay |
| `useTerminalDimensions()` | `@opentui/react` | Responsive layout calculations |
| `useOnResize()` | `@opentui/react` | Re-layout on terminal resize, clamp scroll |

#### Navigation Context Integration

Restart (`r`) performs the following sequence:
1. Debounce check (ignore if <500ms since last restart)
2. Record restart in crash loop detector ring buffer
3. If crash loop threshold exceeded (3+ in 5s): log, emit telemetry, write diagnostic to stderr, `process.exit(1)`
4. Clear error state (`hasError=false, error=null`)
5. Increment `resetToken` (forces `React.Fragment key` change → full child unmount/remount)
6. Call `onReset()` prop (parent resets navigation stack to Dashboard, increments `navResetKey`)
7. SSE subscriptions and data caches cleared naturally by unmount/remount cycle

#### Crash Loop Detection Strategy

A `CrashLoopDetector` class maintains a ring buffer of the last 5 restart timestamps:
- Each `r` press calls `recordRestart()` which appends `Date.now()` and trims buffer to 5 entries
- Counts timestamps within the `CRASH_LOOP_WINDOW_MS` (5000ms) window
- Returns `true` if count ≥ `CRASH_LOOP_MAX_RESTARTS` (3)
- Ring buffer naturally ages out old timestamps — if the user runs stably for >5 seconds, old crash timestamps no longer count

#### Double Fault Protection

The `render()` method of ErrorBoundary wraps the `<ErrorScreen>` instantiation in a try-catch:
- If `<ErrorScreen>` itself throws during render, both the primary error and secondary error are:
  1. Logged via `logger.error()`
  2. Emitted as `tui.error_boundary.double_fault` telemetry event
  3. Written to stderr as a fatal diagnostic message
  4. TUI exits with `process.exit(1)`
- This prevents infinite recursion between error boundary and a broken error screen

#### Error Normalization

The `normalizeError()` utility converts any thrown value to a proper `Error` instance:

| Input Type | Output |
|------------|--------|
| `Error` instance | Returned as-is (identity) |
| `string` | `new Error(string)` |
| Object with `.message: string` | `new Error(obj.message)` with `.stack` preserved if present |
| `null` | `new Error("Unknown error")` |
| `undefined` | `new Error("Unknown error")` |
| Any other type | `new Error(String(value))` |

#### Test Crash Hook (E2E Testing Support)

A `TestCrashHook` component is included for testing, controlled by environment variables:

| Environment Variable | Behavior |
|---------------------|----------|
| `CODEPLANE_TUI_TEST_THROW=1` | Throw `new Error("Test error")` on first mount |
| `CODEPLANE_TUI_TEST_ERROR_MESSAGE=<msg>` | Custom error message text |
| `CODEPLANE_TUI_TEST_NO_STACK=1` | Throw object `{ message }` without `.stack` |
| `CODEPLANE_TUI_TEST_THROW_STRING=1` | Throw a string value instead of Error |
| `CODEPLANE_TUI_TEST_THROW_ALWAYS=1` | Throw on every render (crash loop scenario) |
| `CODEPLANE_TUI_TEST_THROW_ONCE=1` | Throw exactly once (recoverable on restart) |
| `CODEPLANE_TUI_TEST_THROW_TWICE=1` | Throw exactly twice then recover |
| `CODEPLANE_TUI_TEST_THROW_COUNT=N` | Throw N times then recover |
| `CODEPLANE_TUI_TEST_THROW_AFTER_MS=N` | Throw after N milliseconds via useEffect |
| `CODEPLANE_TUI_TEST_DOUBLE_FAULT=1` | Trigger primary fault; ErrorScreen also throws to test double-fault path |

### Documentation

The following user-facing documentation should be written:

1. **TUI Error Recovery Guide** — A short section in the TUI user guide explaining:
   - What the error screen looks like and what it means
   - How to restart (`r`) vs. quit (`q`)
   - How to view the stack trace for bug reporting (`s`)
   - How to capture error logs: `codeplane tui 2>tui.log`
   - What crash loop detection means and when it exits automatically

2. **TUI Keybinding Reference** — The error screen keybindings should be included in the global keybinding reference, clearly marked as "Error screen only" context.

3. **Troubleshooting FAQ** — Entries for:
   - "TUI shows 'Repeated crash detected. Exiting.' — what do I do?" → Check stderr output, file a bug report, try `codeplane tui --reset-config`
   - "TUI exits immediately with a fatal error about error boundary" → This is a double fault; file a bug with both error messages from stderr
   - "Error screen shows 'Unknown error' with no stack trace" → A non-standard value was thrown; check extensions or plugins

## Permissions & Security

### Authorization

- The error boundary requires **no specific authorization role**. It is a client-side error handling mechanism that operates entirely within the TUI process.
- The error screen renders regardless of authentication state. If the user's token is expired, missing, or invalid, the error boundary still catches and displays crashes.
- The error boundary does not make any API calls. The restart action triggers a full remount which will re-execute the auth flow and data hooks, but the boundary itself does not initiate authentication or authorization checks.
- All authorization roles (Owner, Admin, Member, Read-Only, Anonymous) experience the same error boundary behavior.

### Token Handling

- The error boundary does not read, store, display, or transmit authentication tokens.
- Error messages and stack traces may contain file paths and component names but must never contain token values. Since tokens are held only in the AuthProvider context and never interpolated into error messages, this is guaranteed by architecture. The error boundary sits above the AuthProvider in the component tree.
- The restart action does not invalidate or refresh tokens. The remounted auth flow will use the same stored token from the CLI keychain or `CODEPLANE_TOKEN` environment variable.

### Rate Limiting

- Not applicable. The error boundary makes zero API calls.
- The restart action triggers data hook re-execution which may make API calls, but those are rate-limited by the standard API client rate limiting, not by the error boundary.
- Restart debounce (500ms) prevents accidental rapid restart attempts that could lead to API call bursts from the remounted data hooks.

### Data Privacy

- Stack traces displayed on the error screen may contain local file system paths that reveal the installation directory. This is acceptable for a local terminal application — the information is visible only to the current user's terminal session.
- The error boundary does not log errors to remote services synchronously. Telemetry events contain error class names and truncated messages (first 100 characters) but never full stack traces.
- The crash loop detection exit-to-stderr does not expose PII. Only the error message and diagnostic counts (already visible on screen) are written to stderr.
- No user data (repo names, issue content, usernames) is included in error boundary telemetry events unless it happens to appear in the error message itself, which is truncated to 100 characters.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.error_boundary.caught` | Error boundary catches an uncaught exception via `componentDidCatch` | `error_name` (e.g. "TypeError"), `error_message_truncated` (first 100 chars of message), `screen` (active screen name at crash, or "unknown"), `stack_depth` (navigation stack depth), `terminal_width`, `terminal_height`, `session_duration_ms` (time since TUI launch) |
| `tui.error_boundary.restart` | User presses `r` to restart from error screen | `error_name`, `screen`, `time_on_error_screen_ms` (time from catch to restart), `trace_was_viewed` (boolean — whether user expanded stack trace), `restart_count` (cumulative restarts this session) |
| `tui.error_boundary.quit` | User presses `q` to quit from error screen | `error_name`, `screen`, `time_on_error_screen_ms`, `trace_was_viewed`, `quit_method` (`"q"` or `"ctrl_c"`) |
| `tui.error_boundary.trace_toggled` | User presses `s` to expand/collapse stack trace | `error_name`, `expanded` (boolean — new state after toggle) |
| `tui.error_boundary.crash_loop_exit` | Crash loop detection triggers automatic exit | `error_name`, `restart_count`, `time_window_ms` |
| `tui.error_boundary.double_fault` | Error boundary itself fails during error screen render | `primary_error_name`, `secondary_error_name` |

### Common Event Properties

All error boundary events include the following baseline properties: `session_id`, `timestamp` (ISO 8601), `tui_version`, `terminal_width`, `terminal_height`, `color_tier` (`"truecolor"` | `"ansi256"` | `"ansi16"`).

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Error boundary activation rate | < 1% of sessions | Percentage of TUI sessions that encounter at least one error boundary catch. High rate indicates widespread instability. |
| Restart success rate | > 90% | Of users who press `r`, percentage whose next session segment does not crash again within 60 seconds. Low rate means restart is ineffective. |
| Crash loop exit rate | < 0.1% of sessions | Percentage of sessions terminated by crash loop detection. Any sustained elevation indicates a persistent bug affecting all users. |
| Trace view rate | Informational (no target) | Percentage of error screen displays where the user expands the stack trace. Higher rate indicates developers investigating errors. |
| Median time on error screen | Informational (lower is better) | Median time between error catch and user action (`r` or `q`). Shorter means the error screen is clear and actionable. |
| Quit vs restart ratio | Informational | Ratio of `q` presses to `r` presses. High quit rate may indicate users distrust the restart mechanism or want to investigate externally. |
| Double fault rate | 0% target | Error boundary self-failures. Any occurrence indicates a bug in the error screen implementation itself and requires immediate investigation. |

### Funnel

1. `tui.error_boundary.caught` → user sees error screen
2. User either:
   - Presses `s` → `tui.error_boundary.trace_toggled` (optional diagnostic step)
   - Presses `r` → `tui.error_boundary.restart` → normal usage resumes
   - Presses `q` → `tui.error_boundary.quit` → TUI exits
3. If restart fails repeatedly → `tui.error_boundary.crash_loop_exit`

## Observability

### Logging Requirements

All logs are written to stderr and do not appear in the terminal UI. They can be captured with `codeplane tui 2>tui.log`.

| Log Level | Event | Message Format | Structured Context |
|-----------|-------|----------------|--------------------|
| `error` | Error caught by boundary | `ErrorBoundary: caught unhandled error [screen={screen}] [error={name}: {message}]` | `screen`, `error.name`, `error.message` |
| `error` | Full stack trace (logged separately) | `ErrorBoundary: stack trace:\n{stack}` | `error.stack` (full, untruncated) |
| `info` | User initiated restart | `ErrorBoundary: user initiated restart [screen={screen}] [restart_count={n}]` | `screen`, `restart_count` |
| `info` | User quit from error screen | `ErrorBoundary: user quit from error screen [screen={screen}]` | `screen` |
| `warn` | Crash loop detected | `ErrorBoundary: crash loop detected [{n} restarts in {ms}ms] — exiting` | `restart_count`, `window_ms` |
| `error` | Double fault (error screen render failure) | `ErrorBoundary: error during error screen render [primary={message}] [secondary={message}]` | `primary_error`, `secondary_error` |
| `debug` | Stack trace toggled by user | `ErrorBoundary: stack trace toggled [expanded={bool}]` | `expanded` |
| `debug` | Error boundary component mounted | `ErrorBoundary: mounted` | — |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `tui_error_boundary_catches_total` | Counter | `screen`, `error_name` | Total number of errors caught by the boundary |
| `tui_error_boundary_restarts_total` | Counter | `screen` | Total number of user-initiated restarts |
| `tui_error_boundary_quits_total` | Counter | `quit_method` (`q`, `ctrl_c`) | Total number of user-initiated quits from error screen |
| `tui_error_boundary_crash_loops_total` | Counter | — | Total number of crash loop exits |
| `tui_error_boundary_double_faults_total` | Counter | — | Total number of double faults |
| `tui_error_boundary_time_on_error_screen_seconds` | Histogram | `action` (`restart`, `quit`) | Time user spent on error screen before taking action |
| `tui_error_boundary_trace_views_total` | Counter | — | Total number of stack trace expansions |

### Alerts

#### Alert: Elevated Error Boundary Activation Rate

- **Condition**: `tui_error_boundary_catches_total` increases by more than 50 in a 5-minute window across all TUI instances
- **Severity**: Warning
- **Runbook**:
  1. Check the `screen` label distribution — is one screen responsible for most crashes?
  2. Check `error_name` label — is it a single error class (e.g., TypeError, NetworkError)?
  3. Check if a recent TUI release was deployed — correlate with deployment timestamps
  4. Check server-side error logs for 500-level responses that might cause client crashes
  5. If concentrated on one screen: create a P1 issue, consider feature-flagging the affected screen
  6. If widespread: consider rolling back the TUI release

#### Alert: Any Double Fault Occurrence

- **Condition**: `tui_error_boundary_double_faults_total` increases by 1 or more
- **Severity**: Critical
- **Runbook**:
  1. This means the error screen itself crashed — this is a bug in the error handling code
  2. Check telemetry for `tui.error_boundary.double_fault` events to get `primary_error_name` and `secondary_error_name`
  3. Reproduce by triggering the primary error condition, then inspecting the ErrorScreen render path
  4. The secondary error is in the ErrorScreen component or its dependencies (useTheme, useKeyboard, useTerminalDimensions)
  5. Fix immediately — the error screen must never crash

#### Alert: Crash Loop Rate Elevation

- **Condition**: `tui_error_boundary_crash_loops_total` increases by more than 5 in a 15-minute window
- **Severity**: Warning
- **Runbook**:
  1. Crash loops mean the same error repeats after restart, indicating a persistent bug
  2. Check if the crash is on Dashboard (initial screen) — this blocks all TUI usage
  3. Check recent changes to Dashboard, AppShell, or provider components
  4. Check if the API server is returning malformed data that crashes during render
  5. Verify auth token validation isn't producing errors that crash the auth flow on every restart

#### Alert: Restart Success Rate Below Threshold

- **Condition**: Restart success rate drops below 70% over a 1-hour window (calculated from `restart` events followed by `caught` events within 60 seconds)
- **Severity**: Warning
- **Runbook**:
  1. Low restart success means `r` isn't fixing the problem — the same error recurs
  2. Check if the root cause is in a provider or context that survives the boundary remount (e.g., a corrupted global singleton)
  3. Check if the issue is API-side (server error) rather than client-side (the restart won't fix server issues)
  4. Consider whether the restart mechanism needs to clear additional state beyond what the remount cycle covers

### Error Cases and Failure Modes

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Uncaught exception in screen component | `getDerivedStateFromError` + `componentDidCatch` | Render error screen with `r`/`q` actions. Log error. Emit telemetry. |
| Error during error screen render (double fault) | Try-catch in ErrorBoundary `render()` | Write both errors to stderr. Exit with code 1. Terminal state restored by cleanup handler. |
| Terminal resize during error screen | `useOnResize()` callback | Re-layout error screen. Scroll position preserved (clamped to new max). |
| SSE disconnect while on error screen | SSE is inside the boundary (already unmounted) | No impact. Header/status bars show degraded state independently. |
| Terminal disconnect (SSH drop) during error | Process receives SIGHUP | Process-level cleanup handler restores terminal state. Exit code 1. |
| User presses `r` but Dashboard also crashes | Error boundary catches new error | Crash loop detector increments. If threshold exceeded, exit. Otherwise show error screen again. |
| Error with no `.stack` property | `error.stack` is `undefined` | Stack trace toggle and `s:trace` hint hidden. Only message shown. |
| Error with very long message (>500 chars) | Length check in `truncateText()` | Message truncated to 500 characters with `…`. Full message available in stderr logs. |
| Non-Error thrown value | `normalizeError()` conversion | Wrapped in proper `Error` object. `String(value)` used as message. |
| Rapid `r` presses | Debounce check (500ms cooldown) | First `r` triggers restart. Subsequent within 500ms silently ignored. |
| Memory during long error screen session | Single Error reference + 5-entry ring buffer (~40 bytes) | Stable. No growth during idle error screen display. |
| Terminal state corruption on any exit | Process-level cleanup handler (registered at TUI launch) | Restores cursor, alternate screen buffer, raw mode regardless of exit path (normal, error, signal). |

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

All tests target `TUI_ERROR_BOUNDARY` using `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped or commented out).

### Terminal Snapshot Tests

1. **`error-boundary-renders-error-screen`** — Launch TUI at 120×40 with `CODEPLANE_TUI_TEST_THROW=1` → wait for "Something went wrong" → assert snapshot contains `✗ Something went wrong` heading, error message, `▸ Stack trace` toggle, `r:restart` and `q:quit` action hints. Golden-file snapshot match.

2. **`error-boundary-renders-error-screen-80x24`** — Same test at 80×24 minimum terminal size → assert error screen fits, all elements visible, snapshot match.

3. **`error-boundary-renders-error-screen-200x60`** — Same test at 200×60 large terminal → assert expanded layout with more padding, snapshot match.

4. **`error-boundary-error-message-wrapping-80x24`** — Launch at 80×24 with a 139-character error message → assert message wraps within 76 columns (80 - 2×2 padding), snapshot match.

5. **`error-boundary-error-message-wrapping-120x40`** — Launch at 120×40 with a 350-character error message (`"A".repeat(300) + " " + "B".repeat(50)`) → assert message wraps within 112 columns, snapshot match.

6. **`error-boundary-stack-trace-collapsed`** — Launch at 120×40 → assert `▸ Stack trace` visible, assert no `at ` lines visible (trace content not rendered).

7. **`error-boundary-stack-trace-expanded`** — Launch at 120×40 → press `s` → assert `▾ Stack trace` heading, trace lines visible inside bordered box, muted color applied. Snapshot match.

8. **`error-boundary-no-stack-trace-available`** — Launch with `CODEPLANE_TUI_TEST_NO_STACK=1` → assert no "Stack trace" text anywhere, assert no `s:trace` in action hints, assert `r:restart` and `q:quit` still present.

9. **`error-boundary-header-and-status-bar-persist`** — Launch with `CODEPLANE_TUI_TEST_THROW_AFTER_MS=500` → wait for Dashboard to render, then wait for error → assert first line (header) is present, assert last line (status bar) is present.

10. **`error-boundary-long-error-message-truncation`** — Launch with 600-character error message (`"X".repeat(600)`) → assert `…` present in snapshot, assert no continuous run of 501+ `X` characters.

11. **`error-boundary-colors-use-semantic-tokens`** — Launch with `COLORTERM=truecolor` → assert snapshot includes expected color sequences for error (red), muted (gray), primary (blue). Golden-file snapshot match.

### Keyboard Interaction Tests

12. **`error-boundary-r-restarts-to-dashboard`** — Launch with `CODEPLANE_TUI_TEST_THROW_ONCE=1` → wait for error screen → press `r` → wait for Dashboard text → assert "Something went wrong" is gone, assert header line matches `/Dashboard/`.

13. **`error-boundary-q-quits-cleanly`** — Launch → wait for error screen → press `q` → assert TUI process exits (no timeout, no hang).

14. **`error-boundary-ctrl-c-quits-immediately`** — Launch → wait for error screen → send Ctrl+C → assert TUI process exits.

15. **`error-boundary-s-toggles-stack-trace`** — Launch → assert `▸` (collapsed) → press `s` → assert `▾` (expanded) and trace content visible → press `s` → assert `▸` (collapsed) and trace content gone.

16. **`error-boundary-jk-scrolls-expanded-trace`** — Launch → expand trace → press `j` 10 times → capture snapshot (scroll advanced) → press `k` 5 times → capture snapshot (scroll retreated) → assert snapshots differ.

17. **`error-boundary-G-jumps-to-trace-bottom`** — Launch → expand trace → press `G` → snapshot match showing last lines of trace visible.

18. **`error-boundary-gg-jumps-to-trace-top`** — Launch → expand trace → press `G` (go to bottom) → press `g` then `g` → snapshot match showing first lines of trace visible.

19. **`error-boundary-ctrl-d-pages-down-trace`** — Launch → expand trace → send Ctrl+D → assert scroll advanced (snapshot truthy).

20. **`error-boundary-ctrl-u-pages-up-trace`** — Launch → expand trace → Ctrl+D → Ctrl+U → snapshot match showing scroll returned to near-top.

21. **`error-boundary-navigation-keys-suppressed`** — Launch → wait for error → press `g` then `d` (would normally go-to Dashboard) → assert "Something went wrong" still displayed. Press `:` → assert "Command Palette" not present.

22. **`error-boundary-help-overlay-works`** — Launch → press `?` → assert "Error Screen Keybindings" and "Restart TUI" visible → press Esc → assert overlay dismissed, error screen remains.

23. **`error-boundary-rapid-r-no-double-restart`** — Launch with `CODEPLANE_TUI_TEST_THROW_ONCE=1` → press `r` `r` `r` rapidly → assert Dashboard appears (single restart, no double-trigger).

24. **`error-boundary-restart-after-restart`** — Launch with `CODEPLANE_TUI_TEST_THROW_COUNT=2` → wait for error → `r` → wait for error again → `r` → wait for Dashboard (boundary recovered after two crashes).

### Responsive Tests

25. **`error-boundary-layout-80x24`** — Assert heading, message, toggle, hints all fit in 22 content rows. No overflow. Header and status bars present. Snapshot match.

26. **`error-boundary-layout-120x40`** — Assert comfortable wrapping, 38 content rows available, trace expandable to 24 rows. Snapshot match.

27. **`error-boundary-layout-200x60`** — Assert centered layout, generous padding (6 chars), trace expandable to 44 rows. Snapshot match.

28. **`error-boundary-resize-during-error-screen`** — Start at 120×40 → resize to 80×24 → assert "Something went wrong" still visible, `r:restart` still present, message re-wrapped to fit.

29. **`error-boundary-resize-with-expanded-trace`** — Start at 200×60 → expand trace → scroll down 3 lines → resize to 80×24 → assert `▾ Stack trace` still visible (trace remains expanded).

30. **`error-boundary-resize-below-minimum-during-error`** — Start at 120×40 with error → resize to 60×20 → wait for "Terminal too small" → resize back to 120×40 → wait for "Something went wrong" (error screen restores).

31. **`error-boundary-resize-from-minimum-to-large`** — Start at 80×24 → resize to 200×60 → snapshot match showing expanded layout with more padding.

### Crash Loop and Double Fault Tests

32. **`error-boundary-crash-loop-detection`** — Launch with `CODEPLANE_TUI_TEST_THROW_ALWAYS=1` → error appears → `r` → error appears → `r` → error appears → `r` → TUI exits (crash loop detected, 3 restarts in window).

33. **`error-boundary-double-fault-exits-cleanly`** — Launch with `CODEPLANE_TUI_TEST_DOUBLE_FAULT=1` → TUI exits (ErrorScreen throws during render, double fault handler writes to stderr and exits with code 1).

34. **`error-boundary-crash-loop-resets-after-stable-period`** — Launch with `CODEPLANE_TUI_TEST_THROW_TWICE=1` → error → `r` → Dashboard loads (second throw exhausted, app stable → no crash loop triggered).

### Integration Tests

35. **`error-boundary-preserves-auth-state-on-restart`** — Launch with `CODEPLANE_TUI_TEST_THROW_ONCE=1` and `CODEPLANE_TOKEN=valid-test-token` → error → `r` → Dashboard loads authenticated (auth token preserved across boundary restart).

36. **`error-boundary-sse-reconnects-after-restart`** — Launch with `CODEPLANE_TUI_TEST_THROW_ONCE=1` → error → `r` → Dashboard loads → assert SSE-dependent features functional (notifications, etc.).

37. **`error-boundary-non-error-thrown-value`** — Launch with `CODEPLANE_TUI_TEST_THROW_STRING=1` → assert "Something went wrong" displayed, string value shown as message.

38. **`error-boundary-error-during-initial-render`** — Launch with `CODEPLANE_TUI_TEST_THROW=1` (throws on first render) → assert error screen renders with `r:restart` → press `r` → error recurs (same throw condition) → assert error screen shown again.

### Unit Tests (CrashLoopDetector)

39. **`returns false for first restart`** — Create detector → `recordRestart()` → assert returns `false`.

40. **`returns false for 2 restarts in window`** — Create detector → `recordRestart()` × 2 → assert second returns `false`.

41. **`returns true for 3 restarts within window`** — Create detector → `recordRestart()` × 3 → assert third returns `true`.

42. **`does not trigger after timestamps age out`** — Create detector with 100ms window → 2 restarts → wait 150ms → third restart → assert returns `false`.

43. **`ring buffer caps at 5 entries`** — Create detector with large window and high threshold → 10 restarts → assert `restartCount` is 5.

### Unit Tests (normalizeError)

44. **`passes through Error instances`** — `normalizeError(new Error("test"))` returns same Error reference.

45. **`wraps string in Error`** — `normalizeError("something broke")` → `instanceof Error` is true, `.message` is `"something broke"`.

46. **`handles null with Unknown error`** — `normalizeError(null).message` is `"Unknown error"`.

47. **`handles undefined with Unknown error`** — `normalizeError(undefined).message` is `"Unknown error"`.

48. **`extracts message from plain object`** — `normalizeError({ message: "obj error" }).message` is `"obj error"`.

49. **`handles number thrown value`** — `normalizeError(42).message` is `"42"`.

### Boundary Constraint Tests

50. **`error message at exactly 500 characters is not truncated`** — Launch with 500-character message → assert no `…` in output, full message rendered.

51. **`error message at 501 characters is truncated`** — Launch with 501-character message → assert `…` present, message does not exceed 500 display characters.

52. **`stack trace at exactly 200 lines renders all lines`** — Throw error with 200-line stack → expand trace → assert no "(truncated" text visible.

53. **`stack trace at 201 lines shows truncation indicator`** — Throw error with 201-line stack → expand trace → assert "(truncated — 1 more lines)" visible.

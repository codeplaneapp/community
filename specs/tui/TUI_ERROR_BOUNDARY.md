# TUI_ERROR_BOUNDARY

Specification for TUI_ERROR_BOUNDARY.

## High-Level User POV

When something goes catastrophically wrong inside the Codeplane TUI — an uncaught exception in a screen component, a corrupted data hook response that crashes the renderer, or an infinite render loop — the user sees a clean, actionable error screen instead of a garbled terminal or a silent exit. The error boundary catches the crash at the application root, prevents it from tearing down the entire TUI process, and presents the user with exactly two options: restart the application to the Dashboard, or quit cleanly.

The error screen replaces the content area entirely. A red cross symbol and "Something went wrong" heading appear prominently at the top of the screen, immediately signaling that the application has entered an error state. Below the heading, the error message text is displayed in the `error` color — this is the human-readable summary of what failed. The message is wrapped to fit the terminal width, never extending beyond the available columns.

Below the error message, a collapsed stack trace section is available. By default only the first line of the stack trace is visible, followed by a hint: `s to show full trace`. When the user presses `s`, the full stack trace expands into a scrollable region, rendered in muted gray with a monospace appearance. The trace can be scrolled with `j`/`k` keys, and collapsed again by pressing `s` a second time. This keeps the error screen clean and scannable for users who just want to restart, while giving developers the diagnostic detail they need without switching to a log file.

At the bottom of the error screen, two clear action hints are displayed: `r restart` and `q quit`. Pressing `r` clears the error state, resets the navigation stack to the Dashboard, and re-renders the application from scratch — a full React tree unmount and remount, ensuring any corrupted component state is purged. Pressing `q` exits the TUI cleanly, restoring the terminal to its normal state. `Ctrl+C` continues to work as an immediate emergency exit regardless of error state.

The error screen maintains the app shell chrome: the header bar and status bar remain visible in their last-known state, providing visual continuity and confirming to the user that the TUI process is still alive and responsive. If the error boundary itself is the outermost catch, the error screen renders full-screen without chrome but still provides the same `r`/`q`/`Ctrl+C` affordances.

At minimum terminal size (80×24), the error screen fits comfortably within 22 content rows. At larger terminal sizes, the error message and stack trace have more breathing room and the layout is centered with generous padding. If the terminal is resized while the error screen is displayed, the layout re-flows immediately.

## Acceptance Criteria

### Definition of Done

- [ ] A React class component error boundary wraps the main content area below the `<AuthProvider>` and above the `<NavigationProvider>` in the TUI component tree
- [ ] The error boundary catches all uncaught exceptions thrown during React render, lifecycle methods, and constructors of any descendant component
- [ ] When an error is caught, the error boundary renders a full error screen replacing the content area
- [ ] The error screen displays: a red "✗ Something went wrong" heading, the error message, a collapsible stack trace, and action hints (`r restart`, `q quit`)
- [ ] Pressing `r` on the error screen resets the error boundary state, resets the navigation stack to the Dashboard, and unmounts/remounts the application content tree
- [ ] Pressing `q` on the error screen exits the TUI cleanly with exit code 0, restoring terminal state
- [ ] Pressing `Ctrl+C` on the error screen exits the TUI immediately with exit code 0
- [ ] Pressing `s` on the error screen toggles stack trace visibility between collapsed (first line only) and expanded (full scrollable trace)
- [ ] When the stack trace is expanded, `j`/`k`/`Up`/`Down` scroll within the trace, and `G`/`g g` jump to bottom/top
- [ ] The header bar and status bar remain visible during error display (they are rendered outside the error boundary, above it in the tree)
- [ ] If the error boundary catches a second error during the error screen render itself, the TUI exits cleanly to stderr with the error message (graceful degradation — no infinite crash loop)
- [ ] The `componentDidCatch` lifecycle reports the error to the telemetry system before updating state
- [ ] The error message text is wrapped to fit `terminal_width - 4` characters (2 characters horizontal padding per side)
- [ ] The error heading uses the `error` semantic color token (ANSI 196 / red)
- [ ] The stack trace text uses the `muted` semantic color token (ANSI 245 / gray)
- [ ] The action hints use `primary` for the key label and `muted` for the description

### Edge Cases

- [ ] At minimum terminal size (80×24), the error screen fits within 22 content rows: heading (1 row), blank (1 row), error message (up to 3 wrapped lines), blank (1 row), stack trace toggle (1 row), blank (1 row), action hints (1 row) = 9 rows minimum
- [ ] At minimum terminal size, if the error message exceeds 3 lines when wrapped to 76 characters, it is truncated with `…` on the third line
- [ ] At sub-minimum terminal size (<80×24), the global "Terminal too small" message takes priority
- [ ] If the terminal is resized while the error screen is displayed, the layout re-flows immediately with no flicker; scroll position in the stack trace is preserved
- [ ] If the terminal has no color support (`NO_COLOR=1` or `TERM=dumb`), the error heading uses plain text with `[ERROR]` prefix instead of color
- [ ] Rapid key input is processed correctly: pressing `r` multiple times does not trigger multiple restart cycles
- [ ] If the error occurs during initial render (before any screen has mounted), the error screen still renders
- [ ] React render loop detection: if the same error fires more than 3 times within 5 seconds after restarts, the TUI exits to stderr with "Repeated crash detected. Exiting."
- [ ] Error objects without a `.stack` property render the message only; the stack trace toggle is hidden
- [ ] Non-Error thrown values (strings, numbers, objects) are normalized to Error objects

### Boundary Constraints

- [ ] Error message display is capped at 500 characters; longer messages are truncated with `…`
- [ ] Stack trace display is capped at 200 lines; longer traces show the first 200 lines with a `(truncated — {N} more lines)` indicator
- [ ] The stack trace scrollbox height is capped at `terminal_height - 10` rows
- [ ] Restart via `r` clears all cached data in the navigation context, data hooks, and SSE subscriptions — it is a hard reset

## Design

### Error Screen Layout

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
│ r:restart  q:quit                      ?:help   │  ← Status bar (outside boundary)
└─────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI + React 19)

```tsx
<ErrorBoundary onReset={handleRestart} onQuit={handleQuit}>
  <NavigationProvider>
    <SSEProvider>
      <CurrentScreen />
    </SSEProvider>
  </NavigationProvider>
</ErrorBoundary>
```

### Error Screen Component

```tsx
<box flexDirection="column" width="100%" height="100%">
  <box paddingX={2} paddingTop={1}>
    <text bold color="error">✗ Something went wrong</text>
  </box>
  <box paddingX={2} paddingTop={1}>
    <text color="error">{wrapText(error.message, terminalWidth - 4)}</text>
  </box>
  <box paddingX={2} paddingTop={1}>
    <text color="muted">{traceExpanded ? "▾" : "▸"} Stack trace (s to toggle)</text>
  </box>
  {traceExpanded && error.stack && (
    <box paddingX={2} paddingTop={1} flexGrow={1}>
      <scrollbox>
        <box border="single" borderColor="border" paddingX={1}>
          <text color="muted">{truncateTrace(error.stack, 200)}</text>
        </box>
      </scrollbox>
    </box>
  )}
  {!traceExpanded && <box flexGrow={1} />}
</box>
```

### Keybindings

| Key | Action | Condition |
|-----|--------|-----------|
| `r` | Restart TUI (reset to Dashboard) | Always |
| `q` | Quit TUI cleanly | Always |
| `Ctrl+C` | Quit TUI immediately | Always (global) |
| `s` | Toggle stack trace expanded/collapsed | Always |
| `j` / `Down` | Scroll down in expanded stack trace | Stack trace expanded |
| `k` / `Up` | Scroll up in expanded stack trace | Stack trace expanded |
| `G` | Jump to bottom of stack trace | Stack trace expanded |
| `g g` | Jump to top of stack trace | Stack trace expanded |
| `Ctrl+D` | Page down in stack trace | Stack trace expanded |
| `Ctrl+U` | Page up in stack trace | Stack trace expanded |
| `?` | Toggle help overlay | Always |

All other keybindings are suppressed on the error screen.

### Responsive Sizing

| Terminal Size | Error Message Max Lines | Stack Trace Height | Padding |
|---------------|------------------------|-------------------|---------|
| 80×24 | 3 lines (truncate) | 10 rows max | 2 chars horizontal |
| 120×40 | 6 lines | 24 rows max | 4 chars horizontal |
| 200×60 | 10 lines | 44 rows max | 6 chars horizontal, centered |

On resize: `useOnResize()` triggers re-render. Error message re-wraps. Scroll position preserved.

### Data Hooks

The error boundary itself consumes NO `@codeplane/ui-core` data hooks (the error may have been caused by a data hook). The error screen uses only OpenTUI hooks:

| Hook | Source | Purpose |
|------|--------|---------|
| `useKeyboard()` | `@opentui/react` | Handle r, q, s, scroll keys |
| `useTerminalDimensions()` | `@opentui/react` | Responsive layout |
| `useOnResize()` | `@opentui/react` | Re-layout on resize |

### Navigation Context Integration

Restart (`r`) performs: clear error state → increment resetToken (forces child remount) → resetStack() to [Dashboard] → all SSE and data caches cleared by unmount/remount cycle.

### Crash Loop Detection

Ring buffer of last 5 restart timestamps. If 3+ restarts in 5 seconds: write diagnostic to stderr and exit with code 1.

## Permissions & Security

### Authorization

- The error boundary requires **no specific authorization role**. It is a client-side error handling mechanism.
- The error screen renders regardless of authentication state. If the user's token is expired or missing, the error boundary still catches and displays crashes.
- The error boundary does not make API calls. The restart action triggers a full remount which will re-execute the auth flow and data hooks, but the boundary itself does not initiate auth.

### Token Handling

- The error boundary does not read, store, display, or transmit authentication tokens.
- Error messages and stack traces may contain file paths and component names but must never contain token values. Since tokens are held only in the AuthProvider context and never interpolated into error messages, this is guaranteed by architecture.
- The restart action does not invalidate or refresh tokens. The remounted auth flow will use the same stored token.

### Rate Limiting

- Not applicable. The error boundary makes zero API calls.
- The restart action triggers data hook re-execution which may make API calls, but those are rate-limited by the standard API client, not by the error boundary.
- Restart debounce (500ms) prevents accidental rapid API call bursts from repeated restarts.

### Security Considerations

- Stack traces may contain file system paths that reveal the installation directory. This is acceptable for a local terminal application — the information is visible only to the current user.
- The error boundary does not log errors to remote services. Telemetry events contain error class names and messages but not full stack traces.
- The crash loop detection exit-to-stderr does not expose sensitive data. Only the error message and stack trace (already visible on screen) are written to stderr.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.error_boundary.caught` | Error boundary catches an uncaught exception | `error_name`, `error_message_truncated` (first 100 chars), `screen` (active screen at time of crash), `stack_depth` (navigation stack depth), `terminal_width`, `terminal_height`, `session_duration_ms` |
| `tui.error_boundary.restart` | User presses `r` to restart from error screen | `error_name`, `screen`, `time_on_error_screen_ms`, `trace_was_viewed` (boolean), `restart_count` |
| `tui.error_boundary.quit` | User presses `q` to quit from error screen | `error_name`, `screen`, `time_on_error_screen_ms`, `trace_was_viewed`, `quit_method` (`q` or `ctrl_c`) |
| `tui.error_boundary.trace_toggled` | User presses `s` to expand/collapse stack trace | `error_name`, `expanded` (boolean — new state after toggle) |
| `tui.error_boundary.crash_loop_exit` | Crash loop detection triggers automatic exit | `error_name`, `restart_count`, `time_window_ms` |
| `tui.error_boundary.double_fault` | Error boundary itself fails during error screen render | `primary_error_name`, `secondary_error_name` |

### Event Properties (Common)

All error boundary events include: `session_id`, `timestamp` (ISO 8601), `tui_version`, `terminal_width`, `terminal_height`, `color_tier` (`truecolor` | `ansi256` | `ansi16`).

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Error boundary activation rate | < 1% of sessions | Percentage of TUI sessions that encounter an error boundary catch |
| Restart success rate | > 90% | Of users who press `r`, percentage whose next session segment does not crash again within 60 seconds |
| Crash loop exit rate | < 0.1% of sessions | Percentage of sessions terminated by crash loop detection |
| Trace view rate | Informational | Percentage of error screen displays where the user expands the stack trace |
| Time on error screen | Informational | Median time between error catch and user action — shorter is better |
| Quit vs restart ratio | Informational | Ratio of `q` to `r` — high quit rate may indicate user distrust of restart |
| Double fault rate | 0% target | Error boundary self-failures — any occurrence indicates a bug in the error screen implementation |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `error` | Error caught by boundary | `ErrorBoundary: caught unhandled error [screen={screen}] [error={name}: {message}]` |
| `error` | Full stack trace | `ErrorBoundary: stack trace:\n{stack}` |
| `info` | User restart | `ErrorBoundary: user initiated restart [screen={screen}] [restart_count={n}]` |
| `info` | User quit from error | `ErrorBoundary: user quit from error screen [screen={screen}]` |
| `warn` | Crash loop detected | `ErrorBoundary: crash loop detected [{n} restarts in {ms}ms] — exiting` |
| `error` | Double fault | `ErrorBoundary: error during error screen render [primary={message}] [secondary={message}]` |
| `debug` | Stack trace toggled | `ErrorBoundary: stack trace toggled [expanded={bool}]` |
| `debug` | Error boundary mounted | `ErrorBoundary: mounted` |

Logs are written to stderr and do not appear in the terminal UI. They can be captured with `codeplane tui 2>tui.log`.

### Error Cases Specific to TUI

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Uncaught exception in screen component | React error boundary `getDerivedStateFromError` + `componentDidCatch` | Render error screen with `r`/`q` actions. Log error. Emit telemetry. |
| Error during error screen render (double fault) | Try-catch in error boundary's `render()` method | Write both errors to stderr. Exit TUI with code 1. Terminal state restored by cleanup handler. |
| Terminal resize during error screen display | `useOnResize()` callback fires | Re-layout error screen at new dimensions. Scroll position preserved. |
| SSE disconnect while on error screen | SSE is inside the boundary (already unmounted) | No impact. Header/status bars show degraded state independently. |
| Terminal disconnect (SSH drop) during error screen | Process receives SIGHUP | Cleanup handler restores terminal state. Process exits with code 1. |
| User presses `r` but Dashboard also crashes | Error boundary catches the new error | Crash loop detection increments. If threshold exceeded, exit to stderr. Otherwise show error screen again. |
| Error with no `.stack` property | `error.stack` is undefined | Stack trace toggle is hidden. Only error message shown. |
| Error with very long message (>500 chars) | Length check in render | Message truncated to 500 characters with `…`. Full message in logs. |
| Non-Error thrown value | Error normalization | `String(error)` used as message, wrapped in `new Error()`. |
| Rapid `r` presses | Restart debounce (500ms cooldown) | First `r` triggers restart. Subsequent within 500ms ignored. |

### Failure Modes

- **Primary failure (screen crash)**: Error boundary catches the crash, renders the error screen, user can restart or quit.
- **Double fault (error screen crash)**: Error boundary's `render()` wraps in try-catch. Both errors written to stderr. TUI exits with code 1.
- **Crash loop**: Ring buffer detection (3 crashes in 5 seconds) catches infinite restart loops. Exits with diagnostic message.
- **Memory**: Single Error reference + 5-timestamp ring buffer (40 bytes). Stable during long error-screen sessions.
- **Terminal state**: Process-level cleanup handler restores terminal state (cursor, alternate screen, raw mode) regardless of exit path.

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

All tests target `TUI_ERROR_BOUNDARY` using `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

### Terminal Snapshot Tests

1. **`error-boundary-renders-error-screen`** — Trigger uncaught error → assert snapshot contains "✗ Something went wrong" heading in red, error message, stack trace toggle, action hints, header bar and status bar visible. Sizes: 80x24, 120x40, 200x60.
2. **`error-boundary-error-message-wrapping-80x24`** — Error with 100+ char message at 80x24 → message wraps within 76 columns, truncated to 3 lines max with "…".
3. **`error-boundary-error-message-wrapping-120x40`** — Error with 300-char message at 120x40 → wraps within 116 columns, up to 6 visible lines.
4. **`error-boundary-stack-trace-collapsed`** — Assert "▸ Stack trace (s to toggle)" visible, no trace lines visible.
5. **`error-boundary-stack-trace-expanded`** — Press 's' → assert "▾ Stack trace" heading, trace lines visible in bordered scrollbox, muted color.
6. **`error-boundary-no-stack-trace-available`** — Error with no .stack → toggle NOT visible, message and action hints displayed.
7. **`error-boundary-header-and-status-bar-persist`** — Navigate to repo then trigger error → header shows breadcrumb, status bar shows hints.
8. **`error-boundary-long-error-message-truncation`** — 600-char message → displayed message ends with "…", does not exceed 500 chars.
9. **`error-boundary-colors-use-semantic-tokens`** — Assert heading uses error color (ANSI 196), trace uses muted (ANSI 245), key labels use primary (ANSI 33).

### Keyboard Interaction Tests

10. **`error-boundary-r-restarts-to-dashboard`** — Trigger error on issues screen → press 'r' → Dashboard rendered, stack depth 1, breadcrumb shows "Dashboard".
11. **`error-boundary-q-quits-cleanly`** — Trigger error → press 'q' → TUI exits with code 0.
12. **`error-boundary-ctrl-c-quits-immediately`** — Trigger error → Ctrl+C → TUI exits with code 0.
13. **`error-boundary-s-toggles-stack-trace`** — Assert collapsed (▸) → press 's' → expanded (▾, trace visible) → press 's' → collapsed (▸).
14. **`error-boundary-jk-scrolls-expanded-trace`** — Expand trace → press 'j' 10 times → scroll advances → press 'k' 5 times → scroll retreats.
15. **`error-boundary-G-jumps-to-trace-bottom`** — Expand trace → press 'G' → last line visible.
16. **`error-boundary-gg-jumps-to-trace-top`** — Press 'G' then 'g g' → first line visible.
17. **`error-boundary-ctrl-d-pages-down-trace`** — Expand trace → Ctrl+D → scroll advances by half visible height.
18. **`error-boundary-ctrl-u-pages-up-trace`** — Ctrl+D then Ctrl+U → scroll returns to near top.
19. **`error-boundary-navigation-keys-suppressed`** — Press 'g' then 'd' (go-to) → error screen still displayed. Press ':' → command palette not opened.
20. **`error-boundary-help-overlay-works`** — Press '?' → help overlay with error screen keybindings → Esc → error screen remains.
21. **`error-boundary-rapid-r-no-double-restart`** — Press 'r' 'r' 'r' rapidly → only one restart.
22. **`error-boundary-restart-after-restart`** — Trigger error → 'r' → navigate → trigger error again → 'r' → Dashboard (boundary recovered).

### Responsive Tests

23. **`error-boundary-layout-80x24`** — Assert heading, message, toggle, hints fit in 22 rows, no overflow, header/status bars present.
24. **`error-boundary-layout-120x40`** — Assert comfortable wrapping, 38 content rows, trace up to 24 rows.
25. **`error-boundary-layout-200x60`** — Assert centered layout, generous padding, trace up to 44 rows.
26. **`error-boundary-resize-during-error-screen`** — Resize 120x40→80x24 → message re-wraps, heading/hints visible.
27. **`error-boundary-resize-with-expanded-trace`** — Expand trace, scroll, resize 200x60→80x24 → trace still expanded, scroll preserved.
28. **`error-boundary-resize-below-minimum-during-error`** — Resize to 60x20 → "Terminal too small" → resize back to 120x40 → error screen restores.
29. **`error-boundary-resize-from-minimum-to-large`** — 80x24→200x60 → layout expands with more padding.

### Crash Loop and Double Fault Tests

30. **`error-boundary-crash-loop-detection`** — Dashboard always throws → 3 restarts → TUI exits code 1, stderr contains "Repeated crash detected".
31. **`error-boundary-double-fault-exits-cleanly`** — Error screen itself throws → TUI exits code 1, stderr contains both errors.
32. **`error-boundary-crash-loop-resets-after-stable-period`** — Crash → restart → stable 10s → crash → restart → no loop triggered.

### Integration Tests

33. **`error-boundary-preserves-auth-state-on-restart`** — Auth with valid token → error → 'r' → Dashboard loads authenticated.
34. **`error-boundary-sse-reconnects-after-restart`** — SSE connected → error → 'r' → SSE re-established.
35. **`error-boundary-non-error-thrown-value`** — `throw "something broke"` → error screen renders string as message.
36. **`error-boundary-error-during-initial-render`** — Dashboard throws on first render → error screen renders → 'r' triggers crash loop if persistent.

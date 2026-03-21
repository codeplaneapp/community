# TUI_SCREEN_ROUTER

Specification for TUI_SCREEN_ROUTER.

## High-Level User POV

The screen router is the navigational backbone of the Codeplane TUI. When a user launches `codeplane tui`, they land on the Dashboard screen. From there, every interaction that moves between screens — opening a repository, drilling into an issue, navigating to notifications — is handled by the screen router. The user never sees the router itself; they experience it as fluid, instant screen transitions driven entirely by the keyboard.

Navigation follows a stack model that feels like a browser's back button but for the terminal. Pressing `Enter` on an item in a list pushes a detail screen onto the stack. Pressing `q` pops the current screen and returns to the previous one. The current position in the stack is always visible as a breadcrumb trail in the header bar — for example, `Dashboard > acme/api > Issues > #42` — so the user always knows where they are and how they got there.

For power users, the go-to keybinding system provides instant teleportation. Pressing `g` activates go-to mode (indicated in the status bar as `-- GO TO --`), and the follow-up key jumps directly to that destination: `g d` for Dashboard, `g r` for repositories, `g n` for notifications, and so on. Some destinations like Issues (`g i`) and Workflows (`g f`) require a repository context — if no repository is in context, the router shows a brief inline error in the status bar rather than silently failing.

The command palette (`:`) provides another navigation path: typing a screen name in the fuzzy-search overlay and pressing `Enter` navigates there directly, using the same stack-push mechanism as keyboard go-to.

Deep-link launch support means users can jump directly to any screen from their shell: `codeplane tui --screen issues --repo acme/api` opens the TUI with the issue list for that repository already loaded, with the appropriate intermediate breadcrumb entries pre-populated (Dashboard > acme/api > Issues). The user can press `q` to walk back through the stack as if they had navigated there manually.

When the terminal is resized, the breadcrumb trail adapts — at small sizes it truncates from the left, showing only the most recent segments prefixed with `…`. The content area re-renders immediately with no flicker or intermediate state. If the terminal shrinks below 80×24, a "Terminal too small" message replaces the screen content entirely until the terminal is resized.

Screen transitions are instantaneous. There is no animation, no sliding, no fade. The previous screen's content is replaced with the new screen's content in a single render frame, targeting under 50ms for the transition. If the destination screen needs to fetch data, a loading spinner appears in the content area while the header bar and status bar remain stable — the chrome never disappears during navigation.

## Acceptance Criteria

### Stack Navigation Core
- Pushing a screen adds it to the top of the navigation stack and renders its content in the content area
- Popping a screen removes it from the stack and renders the previous screen's content
- The stack always has at least one entry (the root/Dashboard screen); popping the root screen quits the TUI
- Each stack entry stores: screen ID, display title, and screen-specific context (repo, org, issue number, etc.)
- Maximum stack depth: 32 screens. Attempting to push beyond this displays a transient error in the status bar and is a no-op
- Popping restores the previous screen's scroll position and focused element within the content area

### Breadcrumb Trail
- The header bar displays breadcrumb segments for every entry in the stack, separated by ` > `
- Each segment shows the screen's display title (e.g., `Dashboard`, `acme/api`, `Issues`, `#42`)
- At terminal widths ≥ 120 columns: full breadcrumb trail displayed
- At terminal widths 80–119 columns: if the breadcrumb exceeds the available header width (terminal width minus repo-context and status sections), segments are removed from the left and replaced with `…`
- At terminal widths < 80 columns: "Terminal too small" message replaces all content
- Breadcrumb segment titles are truncated with `…` if any single segment exceeds 24 characters
- The current (rightmost) breadcrumb segment is rendered in the `primary` color; previous segments are rendered in `muted`

### Go-To Mode
- Pressing `g` when no overlay or modal is active enters go-to mode
- The status bar displays `-- GO TO --` while go-to mode is active
- The second keypress within 1500ms either executes the navigation or cancels go-to mode
- Valid second keys: `d` (Dashboard), `i` (Issues), `l` (Landings), `r` (Repository list), `w` (Workspaces), `n` (Notifications), `s` (Search), `a` (Agents), `o` (Organizations), `f` (Workflows), `k` (Wiki)
- Context-dependent destinations (`i`, `l`, `f`, `k`) require a repository in the current context. If no repo context exists, the status bar shows `No repository in context` for 2 seconds and go-to mode is cancelled
- Any unrecognized second key cancels go-to mode silently
- If 1500ms elapses without a second key, go-to mode is cancelled silently
- Go-to mode is suppressed when: a text input is focused, a modal/overlay is open, or the command palette is active
- Go-to navigation replaces the stack from the root up to the destination. It does not push on top of an arbitrarily deep stack. For context-dependent destinations, the stack is set to: [Dashboard, Repo, Destination]

### Deep-Link Launch
- `codeplane tui --screen <id>` launches directly to the specified screen
- `--repo <owner/repo>` provides repository context for screens that require it
- `--org <slug>` provides organization context
- Supported `--screen` values: `dashboard`, `repos`, `issues`, `landings`, `workspaces`, `workflows`, `search`, `notifications`, `agents`, `settings`, `orgs`, `sync`, `wiki`
- If `--screen` requires repo context but `--repo` is not provided, the TUI launches to the Dashboard and shows an error in the status bar: `--repo required for <screen>`
- The stack is pre-populated with logical intermediate screens so that `q` navigates backwards sensibly
- Unrecognized `--screen` values launch to Dashboard with a status bar error: `Unknown screen: <value>`

### Screen Transitions
- Transitions complete in under 50ms (measured from keypress to first paint of new screen)
- The header bar and status bar remain visible and stable during transitions; only the content area changes
- If the new screen's data hook returns a loading state, a centered spinner with "Loading…" text is shown in the content area
- The previous screen's component is unmounted after the new screen's first render is committed
- No DOM/terminal artifacts from the previous screen are visible during or after transition

### Global Keybindings (Router-Level)
- `q`: pop current screen. If stack depth is 1, quit TUI
- `Esc`: if an overlay/modal is open, close it. If no overlay is open, behave like `q`
- `Ctrl+C`: quit TUI immediately regardless of state
- `?`: toggle help overlay
- `:`: open command palette
- `g`: enter go-to mode
- These bindings are active on all screens and take priority over screen-specific bindings when applicable
- When a text input has focus, `q`, `g`, `?`, `:`, `/` are passed to the input and do NOT trigger navigation. Only `Esc` and `Ctrl+C` remain active at the router level when text input is focused

### Terminal Size
- Below 80×24: content area replaced with centered message "Terminal too small (current: WxH, min: 80x24)". Header and status bar hidden. `Ctrl+C` still works
- On resize from below-minimum to valid size: full layout restores immediately
- On resize from valid to below-minimum: layout degrades immediately to the "too small" message

### Edge Cases
- Rapid keypresses (e.g., `q` pressed 5 times quickly): each pop is applied sequentially. If the stack reaches depth 1, the TUI quits. Keypresses are not debounced; they are buffered and processed in order
- `q` during screen loading: the push is cancelled, the loading screen is popped, and the user returns to the previous screen
- Go-to mode + `Esc`: cancels go-to mode, does not pop the screen
- Go-to mode + `q`: cancels go-to mode AND pops the screen
- Push to same screen that is already on top of stack: no-op (prevents double-push from double-Enter)
- Navigation during SSE reconnection: navigation proceeds normally; SSE state is independent of the screen router

## Design

### Layout Structure

The screen router renders the global app shell layout. All screens are rendered within this structure:

```
<box flexDirection="column" width="100%" height="100%">
  {/* Header Bar — 1 row */}
  <box flexDirection="row" height={1} borderBottom="single">
    <box flexGrow={1}>
      <text color="muted">…</text>
      <text color="muted"> > </text>
      <text color="primary">{currentScreen.title}</text>
    </box>
    <box>
      <text color="muted">{repoContext ?? ""}</text>
    </box>
    <box>
      <text color={connectionColor}>●</text>
      <text> </text>
      <text color="primary">{unreadCount > 0 ? `🔔${unreadCount}` : ""}</text>
    </box>
  </box>

  {/* Content Area — flexible height */}
  <box flexGrow={1}>
    <CurrentScreen context={currentEntry.context} onPush={push} onPop={pop} />
  </box>

  {/* Status Bar — 1 row */}
  <box flexDirection="row" height={1} borderTop="single">
    <box flexGrow={1}>
      <text color="muted">{contextualHints}</text>
    </box>
    <box>
      <text color={syncColor}>{syncStatus}</text>
    </box>
    <box>
      <text color="muted">? help</text>
    </box>
  </box>

  {/* Overlay Layer */}
  {goToMode && (
    <box position="absolute" bottom={1} left={0}>
      <text color="warning">-- GO TO --</text>
    </box>
  )}
</box>
```

### Terminal Too Small State

When terminal dimensions are below 80×24:

```
<box width="100%" height="100%" justifyContent="center" alignItems="center">
  <text color="warning">Terminal too small</text>
  <text color="muted">(current: {width}x{height}, min: 80x24)</text>
</box>
```

### Keybinding Reference

**Router-level keybindings (always active unless text input focused):**

| Key | Action | Condition |
|-----|--------|----------|
| `q` | Pop screen / quit | No text input focused, no go-to mode |
| `Esc` | Close overlay → pop screen | Priority: overlay > go-to cancel > pop |
| `Ctrl+C` | Quit immediately | Always |
| `?` | Toggle help overlay | No text input focused |
| `:` | Open command palette | No text input focused |
| `g` | Enter go-to mode | No text input focused, no overlay open |

**Go-to mode keybindings (active only in go-to mode):**

| Key | Destination Screen | Requires Context |
|-----|-------------------|------------------|
| `d` | Dashboard | None |
| `r` | Repository list | None |
| `w` | Workspaces | None |
| `n` | Notifications | None |
| `s` | Search | None |
| `a` | Agents | None |
| `o` | Organizations | None |
| `i` | Issues | Repo |
| `l` | Landings | Repo |
| `f` | Workflows | Repo |
| `k` | Wiki | Repo |
| `Esc` | Cancel go-to | — |
| Any other | Cancel go-to | — |

### Responsive Behavior

**80×24 (minimum):**
- Header bar: breadcrumb truncated from left with `…` prefix. Repo context hidden. Notification badge shown as number only
- Status bar: only the leftmost keybinding hint and `? help` shown. Sync status hidden
- Content area: 22 rows available (24 total minus header and status bars)

**120×40 (standard):**
- Header bar: full breadcrumb trail up to ~80 characters, repo context shown in center, connection indicator and notification badge on right
- Status bar: full keybinding hints, sync status, notification count, help hint
- Content area: 38 rows available

**200×60 (large):**
- Header bar: full breadcrumb with no truncation
- Status bar: expanded keybinding hints with labels
- Content area: 58 rows available

### Data Hooks

The screen router itself consumes:

- `useUser()` — to determine authentication state. If unauthenticated, all navigation is blocked and a full-screen auth error is shown
- `useNotifications()` — specifically the `unreadCount` property, rendered in the header bar badge
- `useTerminalDimensions()` — for responsive layout breakpoints and "too small" detection
- `useOnResize()` — to trigger synchronous re-layout when the terminal is resized

Individual screens consume their own data hooks. The router does not pre-fetch data for screens that are not currently active.

### Navigation Context

The router maintains a `NavigationContext` available to all screens:

```
NavigationContext provides:
  - stack: readonly ScreenEntry[]
  - currentScreen: ScreenEntry
  - push(screenId, context): void
  - pop(): void
  - goTo(screenId, context): void  // replaces stack
  - repoContext: string | null
  - orgContext: string | null
```

Screens access this via `useNavigation()` hook. `push` adds to the stack; `goTo` replaces the stack (used by go-to mode and command palette direct navigation).

## Permissions & Security

### Authorization

- The screen router does not enforce per-screen authorization. Authorization is enforced at the API layer when individual screens fetch data
- The router requires a valid auth token to render any screen. Token is loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- If no token is available, the router renders a full-screen message: "Not authenticated. Run `codeplane auth login` to sign in." with `q` to quit
- If a 401 is returned by any data hook, the router renders a full-screen auth error: "Session expired. Run `codeplane auth login` to re-authenticate." with `q` to quit. The screen stack is preserved in case the user re-authenticates in another terminal and wants to retry

### Token Handling

- Token is read once at TUI bootstrap and passed to the API client
- Token is never displayed in the TUI, never logged, never included in error messages
- Token is stored in memory only for the duration of the TUI session
- `CODEPLANE_TOKEN` environment variable takes precedence over keychain-stored token for headless/CI environments

### Rate Limiting

- The router itself does not generate API requests (individual screens do)
- Go-to mode and rapid navigation do not trigger API requests until the destination screen mounts and its data hooks execute
- If a screen's data hook encounters a 429 (rate limited), the screen displays the retry-after period and does not auto-retry. The user can press `R` to retry manually

### Input Sanitization

- Deep-link flags (`--screen`, `--repo`, `--org`) are validated against an allowlist of known screen IDs and a regex pattern for repo/org slugs (`^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$` for repos, `^[a-zA-Z0-9_.-]+$` for orgs)
- Invalid deep-link values are rejected at launch with a stderr error message and the TUI falls back to Dashboard

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.session.start` | TUI bootstrap completes | `launch_mode` (normal / deep-link), `deep_link_screen`, `terminal_size`, `color_depth` (16 / 256 / truecolor) |
| `tui.session.end` | TUI exits (q, Ctrl+C, or error) | `session_duration_ms`, `screens_visited_count`, `max_stack_depth`, `exit_method` (quit / ctrl_c / error) |
| `tui.navigate.push` | Screen pushed onto stack | `from_screen`, `to_screen`, `stack_depth`, `has_repo_context` |
| `tui.navigate.pop` | Screen popped from stack | `from_screen`, `to_screen`, `stack_depth` |
| `tui.navigate.goto` | Go-to mode navigation completes | `destination`, `had_repo_context`, `go_to_latency_ms` (time from g press to second key) |
| `tui.navigate.goto_fail` | Go-to mode fails (no context) | `destination`, `reason` |
| `tui.navigate.deep_link` | Deep-link launch resolves | `screen`, `has_repo`, `has_org` |
| `tui.terminal.too_small` | Terminal drops below 80×24 | `width`, `height` |
| `tui.terminal.resize` | Terminal resize event | `old_width`, `old_height`, `new_width`, `new_height`, `breakpoint` (minimum / standard / large) |

### Success Indicators

- **Session length**: median session duration > 2 minutes indicates sustained engagement vs. one-off checks
- **Stack depth distribution**: average max stack depth > 2 indicates users navigating beyond top-level lists
- **Go-to adoption**: percentage of navigation events using go-to mode vs. stack push (target: > 30% for power users)
- **Deep-link usage**: percentage of sessions started via deep-link (indicates CLI-to-TUI workflow adoption)
- **Terminal-too-small rate**: percentage of sessions encountering the "too small" state (target: < 5%)
- **Exit method ratio**: ratio of clean quit (`q`) to force-quit (`Ctrl+C`) — high `Ctrl+C` usage suggests UX friction

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | TUI bootstrap | Terminal size, color depth, auth method (keychain / env / none) |
| `info` | Screen transition | `push <screen>` or `pop → <screen>`, stack depth |
| `info` | Deep-link resolve | `--screen <id> --repo <repo>` → resolved stack |
| `warn` | Terminal too small | Detected dimensions, minimum required |
| `warn` | Go-to context miss | `go-to <destination> failed: no repo context` |
| `warn` | Unknown deep-link | `--screen <value> not recognized, falling back to dashboard` |
| `error` | Auth failure | `No token found` or `401 received` (no token value logged) |
| `error` | Stack overflow | `Navigation stack exceeded max depth (32)` |
| `debug` | Go-to mode | Enter/exit go-to mode, timeout, key pressed |
| `debug` | Resize | Old dimensions → new dimensions, breakpoint change |

Logs are written to stderr so they do not interfere with terminal rendering. Log level is controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Terminal resize during screen transition | `useOnResize` fires during render | Layout recalculates synchronously. If new size is below minimum, "too small" message shown. Transition completes normally |
| SSE disconnect during navigation | SSE provider detects connection loss | Navigation proceeds; SSE reconnects independently. Status bar shows disconnection indicator |
| Auth token expired mid-session | 401 response from any data hook | Router shows full-screen auth error. Stack is preserved. User can re-auth externally and press `R` to retry |
| Uncaught screen error | React error boundary catches | Error screen shown with message, stack trace (collapsed), `r` to restart, `q` to quit. Stack is reset on restart |
| Deep-link to nonexistent repo | API returns 404 when screen mounts | Screen shows "Repository not found" error. `q` pops back to Dashboard |
| Rapid q-presses past root | Stack reaches depth 1, quit is triggered | TUI exits cleanly. No crash or undefined behavior |
| Go-to mode interrupted by Ctrl+C | Ctrl+C handler fires | TUI exits immediately; go-to mode is irrelevant |
| Push duplicate screen | Same screen ID + context at stack top | Push is silently dropped. No stack change, no re-render |
| Network timeout during screen data fetch | Data hook timeout (30s default) | Loading spinner is replaced with error message and retry hint (`R`) |

### Failure Modes

- **Total crash (uncaught exception)**: error boundary catches, renders error screen, user can restart or quit. Terminal is restored to normal state on exit via cleanup handler
- **Terminal disconnected (SSH drop)**: TUI process receives SIGHUP. Cleanup handler restores terminal state. Process exits with code 1
- **Infinite loop in screen component**: React's rendering limits catch this. Error boundary activates. If error boundary itself fails, the TUI exits with a stderr message

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

### Terminal Snapshot Tests

- **router-initial-render-dashboard**: Launch TUI with no flags → snapshot matches golden file showing Dashboard screen with header bar, content area, and status bar
- **router-breadcrumb-single**: Launch TUI, navigate to Repository list (g r) → header bar shows "Dashboard > Repositories" with "Repositories" in primary color
- **router-breadcrumb-deep-stack**: Navigate to repo > issues > issue #1 → header bar shows "Dashboard > owner/repo > Issues > #1"
- **router-breadcrumb-truncation-80col**: Terminal 80x24, navigate to repo > issues > issue #1 → breadcrumb shows "… > Issues > #1" (truncated from left)
- **router-terminal-too-small**: Terminal 60x20 → centered message "Terminal too small (current: 60x20, min: 80x24)"
- **router-goto-mode-indicator**: Press g → status bar shows "-- GO TO --" in warning color
- **router-goto-no-context-error**: Press g then i (no repo in context) → status bar shows "No repository in context" in error color
- **router-auth-error**: Launch TUI with no token → full-screen message "Not authenticated. Run `codeplane auth login` to sign in."
- **router-loading-state**: Navigate to a screen with slow data fetch → content area shows centered spinner with "Loading…" while header and status bar remain stable
- **router-deep-link-issues**: Launch with --screen issues --repo owner/repo → issue list screen rendered, breadcrumb shows "Dashboard > owner/repo > Issues"
- **router-error-boundary**: Navigate to a screen that throws an error → error screen shows error message in red, "Press r to restart", "Press q to quit"

### Keyboard Interaction Tests

- **router-q-pops-screen**: Navigate to repo list, press q → returns to Dashboard, stack depth 1
- **router-q-quits-on-root**: On Dashboard, press q → TUI exits cleanly
- **router-escape-closes-overlay-first**: Open help overlay (?), press Esc → overlay closes, screen unchanged
- **router-escape-pops-when-no-overlay**: Navigate to repo list, press Esc → returns to Dashboard
- **router-ctrl-c-quits-immediately**: Navigate 3 deep, press Ctrl+C → TUI exits immediately
- **router-goto-gd-dashboard**: Navigate to repo list, press g then d → Dashboard shown, stack depth 1
- **router-goto-gr-repos**: On Dashboard, press g then r → Repository list shown
- **router-goto-gn-notifications**: On any screen, press g then n → Notifications shown
- **router-goto-gi-with-repo-context**: Navigate to a repo, press g then i → Issues for that repo shown
- **router-goto-gi-without-context**: On Dashboard (no repo), press g then i → status bar error, screen unchanged
- **router-goto-timeout**: Press g, wait 1600ms, press d → go-to cancelled, d not navigation
- **router-goto-invalid-key**: Press g then x → go-to cancelled, screen unchanged
- **router-goto-suppressed-in-input**: Focus text input, press g → 'g' entered in input, go-to NOT activated
- **router-enter-pushes-detail**: On issue list, press Enter → issue detail pushed, stack depth +1, breadcrumb updated
- **router-q-restores-scroll-position**: Scroll down, Enter, then q → list restored with original scroll position
- **router-rapid-q-presses**: Navigate 4 deep, send q q q q → TUI exits
- **router-double-enter-no-double-push**: Send Enter Enter on same item → stack increases by only 1
- **router-q-during-input-focus**: Focus text input, press q → 'q' entered in input, screen not popped
- **router-goto-escape-cancels**: Press g then Esc → go-to cancelled, screen not popped

### Responsive Tests

- **router-80x24-layout**: Terminal 80x24 → header 1 row, status 1 row, content 22 rows; breadcrumb truncation active; repo context hidden
- **router-120x40-layout**: Terminal 120x40 → full breadcrumb, repo context, notification badge; 38 content rows
- **router-200x60-layout**: Terminal 200x60 → fully expanded header, no truncation; 58 content rows
- **router-resize-valid-to-small**: Resize 120x40 → 60x20 → "Terminal too small" appears immediately
- **router-resize-small-to-valid**: Resize 60x20 → 120x40 → full layout restored immediately
- **router-resize-within-valid**: Resize 120x40 → 80x24 → breadcrumb truncation activates, no flicker
- **router-resize-during-navigation**: Resize during Enter transition → new screen renders at new size, no artifacts

### Deep-Link Tests

- **router-deep-link-dashboard**: Launch --screen dashboard → Dashboard shown, stack depth 1
- **router-deep-link-issues-with-repo**: Launch --screen issues --repo owner/repo → Issues shown, breadcrumb "Dashboard > owner/repo > Issues", stack depth 3
- **router-deep-link-issues-no-repo**: Launch --screen issues → Dashboard shown, status bar error "--repo required for issues"
- **router-deep-link-unknown-screen**: Launch --screen foobar → Dashboard shown, status bar error "Unknown screen: foobar"
- **router-deep-link-q-walks-back**: Launch --screen issues --repo owner/repo, press q → repo overview, press q → Dashboard
- **router-deep-link-invalid-repo**: Launch --screen issues --repo "invalid!!!" → Dashboard shown, status bar error about invalid format

### Integration Tests

- **router-command-palette-navigation**: Press : to open command palette, type "issues", Enter → navigates to issues screen (or context error)
- **router-notification-badge-updates**: Navigate between screens while notification count changes via SSE → badge updates on every screen
- **router-auth-expiry-mid-session**: Simulate 401 response → auth error screen shown, stack preserved, q quits
- **router-screen-error-recovery**: Navigate to erroring screen, press r → TUI restarts at Dashboard
- **router-goto-from-deep-stack**: Navigate 5 deep, press g then d → stack replaced with [Dashboard], depth 1

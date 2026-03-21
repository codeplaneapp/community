# TUI_GOTO_KEYBINDINGS

Specification for TUI_GOTO_KEYBINDINGS.

## High-Level User POV

The go-to keybinding system is the Codeplane TUI's primary power-navigation mechanism. It gives terminal developers instant teleportation to any top-level screen without traversing the navigation stack. The interaction model is inspired by vim's `g`-prefix motions: pressing `g` enters a transient "go-to mode," and a single follow-up key immediately jumps to the destination.

When the user presses `g` on any screen (provided no text input is focused and no modal or overlay is open), the TUI enters go-to mode. The experience is immediately visible: the status bar's left section replaces the current screen's keybinding hints with a complete map of available go-to destinations — `g+d:dashboard  g+i:issues  g+l:landings  g+r:repos  g+w:workspaces  g+n:notifs  g+s:search  g+a:agents  g+o:orgs  g+f:workflows  g+k:wiki`. This real-time hint replacement provides the user with a built-in cheat sheet while the mode is active, eliminating the need to memorize every destination.

The follow-up key must arrive within 1500ms. If the user presses `d`, they land on the Dashboard. If they press `r`, they land on the Repository list. Some destinations are context-sensitive: pressing `i` (Issues), `l` (Landings), `f` (Workflows), or `k` (Wiki) requires a repository to be in the current context. If the user attempts one of these from the Dashboard or any other screen without a repository context, the status bar shows a clear error message — `No repository in context` — for 2 seconds, and go-to mode is silently cancelled. The screen does not change.

If the user presses an unrecognized key, go-to mode is cancelled without any visible error. If 1500ms elapses without a second keypress, go-to mode times out and cancels silently. The status bar reverts to showing the current screen's keybinding hints in either case.

Go-to navigation does not push onto the existing navigation stack — it replaces the stack entirely. Pressing `g d` from five screens deep does not create a six-deep stack; it resets the stack to `[Dashboard]` with depth 1. For context-dependent destinations, the stack is set to `[Dashboard, Repository, Destination]` so that pressing `q` after a go-to takes the user through a logical back-navigation path.

The go-to keybindings are always documented in the help overlay. Pressing `?` on any screen shows a "Go To" group listing every `g`-prefixed shortcut along with its destination name and whether it requires repository context.

At small terminal sizes (80×24), the go-to destination hints in the status bar are truncated to fit the available width. At standard sizes (120×40), all eleven destinations are visible. At any terminal size, go-to mode is fully functional — truncation only affects the status bar hints, not the actual navigation behavior.

The go-to system integrates cleanly with the rest of the TUI's keybinding model. It is suppressed during text input, suppressed while the help overlay or command palette is open, and cancelled by `Esc` (which does not also pop the current screen). Pressing `q` during go-to mode cancels go-to AND pops the screen.

## Acceptance Criteria

### Mode Activation
- [ ] Pressing `g` when no overlay/modal is active and no text input is focused enters go-to mode
- [ ] Go-to mode is indicated by the status bar left section displaying go-to destination hints in place of normal screen hints
- [ ] Go-to mode activation takes effect within one render frame (no perceptible delay)
- [ ] Go-to mode does not activate if the help overlay (`?`), command palette (`:`), or any confirmation dialog is open
- [ ] Go-to mode does not activate when a text `<input>` or `<textarea>` component has focus — the `g` character is passed to the input
- [ ] Go-to mode does not activate when the terminal is below minimum size (80×24)

### Destination Mapping
- [ ] Valid second keys: `d` (Dashboard), `r` (Repository list), `w` (Workspaces), `n` (Notifications), `s` (Search), `a` (Agents), `o` (Organizations), `i` (Issues, requires repo), `l` (Landings, requires repo), `f` (Workflows, requires repo), `k` (Wiki, requires repo)
- [ ] Navigation to any destination completes within 50ms (screen transition time, not data fetch time)
- [ ] All 11 destinations are reachable and functional

### Context-Dependent Destinations
- [ ] Destinations requiring repo context (`i`, `l`, `f`, `k`) check for `repoContext` from the `NavigationContext`
- [ ] If `repoContext` is `null`, the status bar shows `No repository in context` in `error` color (ANSI 196) for 2 seconds
- [ ] The error message disappears after 2 seconds and the status bar reverts to normal screen hints
- [ ] The screen does not change when a context-dependent destination fails
- [ ] Go-to mode is cancelled after the error message is triggered
- [ ] If `repoContext` exists, the stack is set to `[Dashboard, Repository(<repoContext>), Destination]`

### Stack Replacement
- [ ] Go-to navigation uses `goTo(screenId, context)` which replaces the entire stack, not `push`
- [ ] After `g d`, the stack is `[Dashboard]` with depth 1
- [ ] After `g r`, the stack is `[Dashboard, Repositories]` with depth 2
- [ ] After `g i` (with repo context), the stack is `[Dashboard, <repo>, Issues]` with depth 3
- [ ] Pressing `q` after go-to walks back through the logical stack

### Cancellation
- [ ] An unrecognized second key cancels go-to mode silently
- [ ] If 1500ms elapses without a second keypress, go-to mode is cancelled silently
- [ ] `Esc` cancels go-to mode without popping the current screen
- [ ] `q` cancels go-to mode AND pops the current screen
- [ ] `Ctrl+C` during go-to mode quits the TUI immediately
- [ ] On cancellation, the status bar reverts to screen hints within one render frame

### Status Bar Integration
- [ ] During go-to mode, the status bar left section displays go-to destination hints: `g+d:dashboard  g+i:issues  g+l:landings  g+r:repos  g+w:workspaces  g+n:notifs  g+s:search  g+a:agents  g+o:orgs  g+f:workflows  g+k:wiki`
- [ ] Keys rendered bold, action labels in `muted` color
- [ ] At 80–119 cols: 4–6 hints max, truncated with `…`
- [ ] At 120–199 cols: all hints shown if they fit
- [ ] At 200+ cols: all 11 hints with full labels

### Help Overlay Integration
- [ ] Help overlay always includes a "Go To" group listing all 11 destinations
- [ ] Context-dependent entries annotated with "(requires repo)"

### Edge Cases
- [ ] Pressing `g` then valid key within 10ms navigates correctly (no debounce)
- [ ] `g g` cancels go-to (second `g` is unrecognized)
- [ ] Pressing `g` five times rapidly: alternates activate/cancel, final state is go-to active
- [ ] Terminal resize during go-to mode does not cancel the mode
- [ ] SSE disconnect during go-to does not affect behavior
- [ ] `No repository in context` error (30 chars max) does not overflow status bar sections

### Boundary Constraints
- [ ] Go-to timeout: exactly 1500ms from `g` keypress
- [ ] Error display duration: exactly 2000ms
- [ ] Go-to mode state: single boolean + timeout timer

## Design

### State Model

Go-to mode is managed by a `useGoToMode()` hook at the app shell level exposing `{ active: boolean, activate(): void, cancel(): void }`. The hook maintains an `active` boolean and a timeout timer ID cleared on second keypress or cancellation.

### Keybinding Handler Flow

Registered at the app shell level via `useKeyboard()` from `@opentui/react`:

```
keypress event
  ├─ Text input focused? → pass through
  ├─ Overlay/modal open? → pass to overlay
  ├─ Go-to mode active?
  │   ├─ Valid destination key → goTo(destination), cancel go-to
  │   ├─ Esc → cancel go-to (no pop)
  │   ├─ q → cancel go-to AND pop
  │   ├─ Ctrl+C → quit TUI
  │   └─ Other → cancel go-to silently
  └─ Key is 'g'? → activate go-to, start 1500ms timeout
```

### Status Bar — Go-To Mode Display

When go-to active, status bar left section renders:
```jsx
<box flexDirection="row" flexShrink={1} overflow="hidden">
  {goToHints.map(hint => (
    <text><span bold>g+{hint.key}</span>:<span color="muted">{hint.destination}</span>  </text>
  ))}
  {truncated && <text color="muted">  …</text>}
</box>
```

Static hint array: `d:dashboard`, `i:issues`, `l:landings`, `r:repos`, `w:workspaces`, `n:notifs`, `s:search`, `a:agents`, `o:orgs`, `f:workflows`, `k:wiki`

### Status Bar — Error Display

```jsx
<box flexDirection="row" flexShrink={1}>
  <text color="error">No repository in context</text>
</box>
```
Shown for 2000ms, then reverts to screen hints. Center and right status bar sections unchanged.

### Help Overlay — Go To Group

Always registered in `HelpOverlayContext`. Lists all 11 destinations with key sequences (`g d`, `g i`, etc.) and context annotations. Appears after "Global" group, before screen-specific groups.

### Keybinding Reference

**Activation:** `g` (no text input, no overlay, terminal ≥ 80×24)

**Go-to destinations:** `d` Dashboard, `r` Repos, `w` Workspaces, `n` Notifications, `s` Search, `a` Agents, `o` Organizations, `i` Issues (repo), `l` Landings (repo), `f` Workflows (repo), `k` Wiki (repo)

**Cancellation:** `Esc` (cancel only), `q` (cancel + pop), `Ctrl+C` (quit), any unrecognized key (cancel), 1500ms timeout (cancel)

### Responsive Behavior

| Terminal Width | Hints Visible | Behavior |
|---------------|--------------|----------|
| 80–99 cols | 3–4 | Truncated with `…` |
| 100–119 cols | 5–6 | Truncated with `…` |
| 120–199 cols | 8–11 | All shown if they fit |
| 200+ cols | All 11 | Full labels, extra spacing |

Total width of all 11 hints ≈ 120 chars. Functionality identical at all sizes above 80×24.

### Data Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useKeyboard()` | `@opentui/react` | Capture `g` and second keypress |
| `useNavigation()` | Local TUI | `goTo()`, `pop()`, `repoContext` |
| `useGoToMode()` | Local TUI | `{ active, activate, cancel }` |
| `useStatusBarHints()` | Local TUI | Swap hints during go-to |
| `useTerminalDimensions()` | `@opentui/react` | Calculate visible hint count |

No `@codeplane/ui-core` data hooks consumed. Zero API calls.

## Permissions & Security

### Authorization
- Go-to mode requires no specific authorization role. It is a client-side navigation mechanism.
- All users with a valid auth token can use go-to mode.
- Authorization for destination screens is enforced at the API layer when those screens' data hooks execute after navigation.
- Go-to mode works even with expired auth tokens — the destination screen handles 401 errors.

### Token-Based Auth
- Go-to mode does not read, transmit, display, or log any auth tokens.
- Token state does not affect go-to mode activation or behavior.
- The TUI uses token-based auth from CLI keychain or `CODEPLANE_TOKEN` env var — no OAuth browser flow is triggered by go-to navigation.

### Rate Limiting
- Go-to mode generates zero API requests. Navigation merely remounts React components.
- Destination screen data hooks may trigger API requests on mount, subject to normal rate limits.
- Rapid go-to toggling generates no network traffic.
- No client-side rate limit on activation; the 1500ms timeout provides natural throttling.

### Input Validation
- Second key checked against hardcoded allowlist of 11 valid characters. Non-matching keys cancel go-to.
- `repoContext` comes from navigation stack, not user-editable during go-to mode.
- No user-provided text is executed, evaluated, or passed to the API.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.goto.activated` | User presses `g` and enters go-to mode | `screen`, `has_repo_context`, `stack_depth` |
| `tui.goto.navigated` | Go-to navigation completes | `destination`, `from_screen`, `latency_ms` (g to second key), `had_repo_context`, `previous_stack_depth` |
| `tui.goto.cancelled` | Go-to cancelled (Esc/timeout/invalid/quit/programmatic) | `screen`, `cancel_reason`, `latency_ms` |
| `tui.goto.context_fail` | Context-dependent destination without repo context | `destination`, `screen`, `latency_ms` |

### Common Event Properties
All events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Go-to adoption rate | >30% of nav events | % of navigations using go-to vs. push/palette |
| Go-to latency (p50) | <400ms | Median time g→second key (muscle memory) |
| Go-to latency (p95) | <1200ms | 95th percentile (learning users) |
| Context fail rate | <10% | % of attempts failing due to missing repo |
| Timeout rate | <5% | % expiring via timeout (confusion/accidental) |
| Cancel rate (invalid key) | <15% | % cancelled due to wrong key |
| Destination distribution | No single >40% | Broad usage across screens |
| Repeat usage | >60% reuse in session | Feature valuable enough to reuse |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Go-to activated | `GoTo: activated [screen={screen}] [repo_context={repoContext}]` |
| `debug` | Second key received | `GoTo: key received [key={key}] [valid={bool}] [latency_ms={ms}]` |
| `debug` | Cancelled | `GoTo: cancelled [reason={reason}] [screen={screen}] [latency_ms={ms}]` |
| `info` | Navigation executed | `GoTo: navigated [from={screen}] [to={dest}] [latency_ms={ms}] [new_stack_depth={n}]` |
| `warn` | Context miss | `GoTo: context fail [destination={dest}] [screen={screen}] — no repo context` |
| `debug` | Timeout expired | `GoTo: timeout [screen={screen}] [elapsed=1500ms]` |
| `debug` | Suppressed | `GoTo: suppressed [reason={reason}]` (input_focused, overlay_open, terminal_too_small) |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Terminal resize during go-to | `useOnResize()` fires while active | Re-layout status bar. Go-to continues. Hints recalculated. |
| SSE disconnect during go-to | SSE provider event | Independent. Sync indicator updates; go-to unaffected. |
| Auth expired during go-to | N/A (no auth check) | Navigation proceeds. Destination handles 401. |
| Programmatic nav during go-to | Screen calls push/goTo | Go-to cancelled. Programmatic nav proceeds. |
| Timer leak on unmount | Component unmounts with pending timeout | useEffect cleanup clears timeout. No leak. |
| Invalid screen ID in goTo() | Bug in mapping | Navigation ignored. Error logged. Go-to cancelled. |
| repoContext becomes null mid-mode | Context checked at second key time | If null at key arrival, context error shown. |

### Failure Modes

- **Stuck active state**: 1500ms timeout is hard safety valve — always cancels regardless.
- **Timer not cleared on nav**: useEffect cleanup ensures timer cleared on re-render.
- **Double activation**: Second `g` treated as unrecognized key, cancels mode. Prevents stuck state.
- **Status bar render error during go-to**: Status bar error boundary catches. Falls back to `[status bar error — press ? for help]`. Go-to cancelled.

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`goto-mode-status-bar-hints`** — Launch at 120×40 on Dashboard. Press `g`. Snapshot. Assert status bar shows go-to destination hints. Center/right sections unchanged.
2. **`goto-mode-status-bar-hints-80col`** — Launch at 80×24. Press `g`. Snapshot. Assert 3–4 truncated hints with `…`. No overflow.
3. **`goto-mode-status-bar-hints-200col`** — Launch at 200×60. Press `g`. Snapshot. Assert all 11 hints visible, no truncation.
4. **`goto-context-error-display`** — Launch at 120×40 on Dashboard. Press `g` then `i`. Snapshot. Assert `No repository in context` in error color. Content area unchanged.
5. **`goto-context-error-clears-after-timeout`** — Press `g` then `i`. Wait 2500ms. Snapshot. Assert error cleared, Dashboard hints restored.
6. **`goto-navigation-to-dashboard`** — From Repo list, `g d`. Snapshot. Assert Dashboard content. Breadcrumb "Dashboard".
7. **`goto-navigation-to-repos`** — From Dashboard, `g r`. Snapshot. Assert Repo list. Breadcrumb "Dashboard > Repositories".
8. **`goto-navigation-to-issues-with-context`** — Navigate to repo. `g i`. Snapshot. Assert issue list. Breadcrumb "Dashboard > owner/repo > Issues".
9. **`goto-navigation-to-notifications`** — `g n`. Snapshot. Assert Notifications screen.
10. **`goto-help-overlay-go-to-group`** — Press `?`. Snapshot. Assert "Go To" group with all 11 entries.

#### Keyboard Interaction Tests

11. **`goto-g-activates-mode`** — Press `g`. Assert go-to hints in status bar. Content unchanged.
12. **`goto-gd-navigates-to-dashboard`** — From Repo list. `g d`. Assert Dashboard. Stack depth 1.
13. **`goto-gr-navigates-to-repos`** — `g r`. Assert Repository list.
14. **`goto-gw-navigates-to-workspaces`** — `g w`. Assert Workspaces.
15. **`goto-gn-navigates-to-notifications`** — `g n`. Assert Notifications.
16. **`goto-gs-navigates-to-search`** — `g s`. Assert Search.
17. **`goto-ga-navigates-to-agents`** — `g a`. Assert Agents.
18. **`goto-go-navigates-to-organizations`** — `g o`. Assert Organizations.
19. **`goto-gi-navigates-with-repo-context`** — Navigate to repo. `g i`. Assert Issues. Stack [Dashboard, Repo, Issues].
20. **`goto-gl-navigates-with-repo-context`** — Navigate to repo. `g l`. Assert Landings.
21. **`goto-gf-navigates-with-repo-context`** — Navigate to repo. `g f`. Assert Workflows.
22. **`goto-gk-navigates-with-repo-context`** — Navigate to repo. `g k`. Assert Wiki.
23. **`goto-gi-fails-without-repo-context`** — Dashboard. `g i`. Assert unchanged. Status bar error.
24. **`goto-gl-fails-without-repo-context`** — Dashboard. `g l`. Assert unchanged. Error.
25. **`goto-gf-fails-without-repo-context`** — Dashboard. `g f`. Assert unchanged. Error.
26. **`goto-gk-fails-without-repo-context`** — Dashboard. `g k`. Assert unchanged. Error.
27. **`goto-escape-cancels`** — `g` then `Esc`. Assert cancelled. Screen unchanged. Hints reverted.
28. **`goto-invalid-key-cancels`** — `g` then `x`. Assert cancelled. Screen unchanged.
29. **`goto-timeout-cancels`** — `g`. Wait 1600ms. Press `d`. Assert NOT navigated (timeout expired).
30. **`goto-q-cancels-and-pops`** — Navigate to Repo list. `g` then `q`. Assert popped to Dashboard.
31. **`goto-ctrl-c-quits`** — `g` then `Ctrl+C`. Assert TUI exits.
32. **`goto-suppressed-during-input-focus`** — Focus text input. Press `g`. Assert `g` in input. No go-to.
33. **`goto-suppressed-during-help-overlay`** — `?` to open help. Press `g`. Assert help stays. No go-to.
34. **`goto-suppressed-during-command-palette`** — `:` to open palette. Press `g`. Assert in palette search. No go-to.
35. **`goto-replaces-stack-from-deep`** — Navigate 4 deep. `g d`. Assert depth 1. `q` exits TUI.
36. **`goto-rapid-gg-cancels`** — `g g` quickly. Assert cancelled. Screen unchanged.
37. **`goto-rapid-toggle`** — `g Esc g d`. Assert navigated to Dashboard. No errors.
38. **`goto-status-bar-reverts-on-navigation`** — `g r`. Assert Repo list hints (not go-to hints).
39. **`goto-status-bar-reverts-on-cancel`** — `g Esc`. Assert Dashboard hints. No go-to visible.
40. **`goto-error-does-not-overflow-status-bar`** — At 80×24. `g i` (no repo). Assert error fits. Sync indicator not overlapped.

#### Responsive Tests

41. **`goto-mode-at-80x24`** — 80×24. `g`. Assert active + truncated hints. `d`. Assert Dashboard.
42. **`goto-mode-at-120x40`** — 120×40. `g`. Assert hints visible. `r`. Assert Repos.
43. **`goto-mode-at-200x60`** — 200×60. `g`. Assert all 11 hints. `n`. Assert Notifications.
44. **`goto-resize-during-mode`** — 120→80 while go-to active. Assert still active. Hints re-truncated. `d` works.
45. **`goto-resize-during-error`** — 120→80 during error. Assert error visible at new width. Reverts after timeout.
46. **`goto-all-destinations-at-minimum-size`** — 80×24. Test all 7 context-free destinations individually.
47. **`goto-context-destinations-at-minimum-size`** — 80×24. Navigate to repo. Test all 4 context destinations.

#### Integration Tests

48. **`goto-after-deep-link-launch`** — Launch `--screen issues --repo owner/repo`. `g d`. Assert Dashboard. `g r`. Assert Repos.
49. **`goto-preserves-repo-context-across-navigations`** — Navigate to repo. `g i`. Then `g l`. Assert same repo context. Stack [Dashboard, repo, Landings].
50. **`goto-notification-badge-persists`** — 5 unread. `g r`. Assert badge 5. `g d`. Assert badge 5.
51. **`goto-command-palette-equivalent`** — `:` + "dashboard" + Enter vs `g d`. Assert identical stack state.
52. **`goto-back-navigation-after-goto`** — `g n`. `q`. Assert Dashboard. `q`. Assert TUI exits.

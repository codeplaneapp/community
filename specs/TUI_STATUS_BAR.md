# TUI_STATUS_BAR

Specification for TUI_STATUS_BAR.

## High-Level User POV

The status bar is the persistent bottom bar of the Codeplane TUI that keeps the user oriented and informed at all times. It is a single-row chrome element that spans the full width of the terminal, always visible on every screen.

On the left side, the status bar shows context-sensitive keyboard shortcut hints for the current screen. When a user navigates from the Dashboard to an Issue list, the hints update instantly to reflect the keys that matter on that screen — things like "j/k navigate," "Enter open," or "/ search." This means users never need to memorize every keybinding or leave their current task to look up help; the most relevant shortcuts are always visible at a glance.

In the center, a sync status indicator tells the user whether their local daemon is connected and synchronized with the Codeplane server. When everything is healthy, a green dot and "Connected" label reassure the user. If the daemon is actively syncing, an animated spinner replaces the dot. If there are conflicts that need attention, the indicator turns yellow with a conflict count. If the connection drops, the indicator turns red and shows reconnection progress. This is critical for users in SSH-only environments or unreliable networks who need to trust that their local state matches the server.

On the right side, a notification badge shows the count of unread notifications. The badge pulses briefly when a new notification arrives so the user notices without being interrupted. A persistent "? help" hint reminds users they can press `?` at any time to see all available keybindings for their current screen.

The status bar adapts to terminal size. In narrow terminals (80 columns), the sync indicator shrinks to just an icon, and only the four most important keyboard hints are shown. In standard terminals (120+ columns), more hints and full sync labels appear. In wide terminals (200+ columns), every hint is shown along with the last sync timestamp.

When errors occur — for example, an optimistic UI action that the server rejects — the status bar temporarily replaces the keybinding hints with an error message in red, then reverts after a few seconds. A "R retry" hint appears when a screen is in an error or timeout state.

During the brief moment after authentication completes, the center section flashes a confirmation showing the authenticated username and token source (e.g., "✓ alice via env"), then fades back to the sync indicator. This provides immediate confidence that the TUI is properly authenticated.

If the status bar itself encounters a rendering error, it degrades to a minimal fallback message rather than crashing the entire TUI. The user can continue working, and the status bar recovers automatically on the next render cycle.

## Acceptance Criteria

### Core Rendering
- [ ] The status bar renders as a single row at the bottom of the terminal, immediately above the terminal's bottom edge.
- [ ] The status bar spans the full terminal width (100%) at all supported terminal sizes.
- [ ] The status bar has a visible top border using the theme's `border` color token.
- [ ] The status bar uses the theme's `surface` color as its background.
- [ ] The status bar is always visible on every screen (Dashboard, Issues, Landings, Repository, etc.).
- [ ] The status bar is present even when the terminal is at the minimum supported size (80x24).
- [ ] The status bar never wraps text to a second row; all content is truncated or omitted to fit in one row.

### Left Section — Keybinding Hints
- [ ] Context-sensitive keybinding hints are shown on the left side of the status bar.
- [ ] Hints update immediately when navigating between screens (no visible delay).
- [ ] Each hint renders as `key:label` where the key portion uses the `primary` color token with bold styling and the label uses the `muted` color token.
- [ ] Hints are separated by two spaces.
- [ ] Hints are displayed in priority order (lower `order` value first).
- [ ] At the "minimum" breakpoint (80–119 columns): maximum 4 hints are shown.
- [ ] At the "standard" breakpoint (120–199 columns): maximum 6 hints are shown.
- [ ] At the "large" breakpoint (200+ columns): all hints are shown.
- [ ] When hints are truncated, a `…` indicator is appended after the last visible hint.
- [ ] Hints never overflow into the center or right sections; available width is calculated dynamically.
- [ ] When a status bar error is active, it replaces all keybinding hints with error text in `error` color.
- [ ] The error auto-clears after 5 seconds (STATUS_BAR_ERROR_DURATION_MS).
- [ ] When the current screen is in error or timeout state, a `R:retry` hint is shown after the regular hints.
- [ ] When an overlay is open, hints are temporarily overridden with overlay-specific hints (e.g., `Esc:close`).
- [ ] When go-to mode is active, hints are temporarily overridden with go-to destination hints.
- [ ] After the overlay or go-to mode deactivates, original screen hints are restored.

### Center Section — Sync Status Indicator
- [ ] The center section displays the daemon sync status with four states: `connected`, `syncing`, `conflict`, `disconnected`.
- [ ] `connected`: green `●` icon, "Connected" label (at ≥120 cols), `success` color token.
- [ ] `syncing`: animated braille spinner, "Syncing…" label (at ≥120 cols), `warning` color token.
- [ ] `conflict`: yellow `▲` icon, "{N} conflicts" label (at ≥120 cols), `warning` color token.
- [ ] `disconnected`: red `●` icon, "Disconnected" label (at ≥120 cols), `error` color token, appends "(retry {N}s)" during backoff.
- [ ] At minimum breakpoint: icon only, no text label.
- [ ] At standard breakpoint: icon + text label.
- [ ] At large breakpoint: icon + text label + last sync timestamp.
- [ ] The braille spinner uses pre-allocated frames via `useSpinner()` hook.
- [ ] Non-Unicode terminals use ASCII fallbacks: `*` for `●`, `!` for `▲`, ASCII spinner frames.
- [ ] Auth confirmation flash shows "✓ {username} via {source}" for 3 seconds after authentication.
- [ ] Auth confirmation username truncated to 20 characters max; total text capped at 40 characters.
- [ ] Offline auth state shows "⚠ offline — token not verified" in `warning` color.

### Right Section — Notification Badge + Help Hint
- [ ] Notification badge shows `◆` diamond icon with count when > 0 in `primary` color.
- [ ] Count = 0: icon in `muted` color, no number.
- [ ] Count > 99: display shows `99+`.
- [ ] New notification triggers 2-second bold flash effect.
- [ ] On SSE disconnect, last known count is retained (never reset to 0).
- [ ] Non-Unicode terminals use `*` instead of `◆`.
- [ ] `?:help` hint is always visible and never truncated.

### Error Boundary
- [ ] StatusBar wrapped in dedicated error boundary.
- [ ] Error boundary fallback shows `[status bar error — press ? for help]` in `error` color.
- [ ] Rest of TUI continues functioning when status bar errors.
- [ ] Error boundary auto-recovers on next successful render.

### Graceful Degradation
- [ ] SSE stub: sync shows "disconnected", notifications show 0.
- [ ] Missing auth token: status bar renders normally with degraded data.
- [ ] No registered hints: left section is empty, no crash.
- [ ] All hooks return null/undefined: no crash (null-safe).

### Definition of Done
- [ ] StatusBar component fully implemented with all three sections.
- [ ] Sub-components SyncStatusIndicator, NotificationBadge, StatusBarErrorBoundary created and integrated.
- [ ] Hooks useSyncState, useNotificationCount, useSSEConnectionState created with degraded-mode defaults.
- [ ] Go-to mode hint generation utility goToHints.ts created.
- [ ] All exports added to barrel files.
- [ ] All telemetry events emitted.
- [ ] All structured logging in place.
- [ ] All E2E tests pass (tests failing due to unimplemented backends are left failing, never skipped).
- [ ] Terminal snapshot tests capture correct rendering at all three breakpoints.
- [ ] No regressions to header bar, overlay, or navigation.

## Design

### TUI UI

#### Layout Structure

The status bar occupies the final row of the terminal, directly beneath the content area. It is rendered inside the `AppShell` component which provides the global `HeaderBar → Content → StatusBar → OverlayLayer` stack.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Dashboard › Issues                     │ acme/api      │      ● 3          │  ← Header Bar
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                           Content Area                                       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:open  /:search   │  ● Connected  │  ◆ 3  ?:help       │  ← Status Bar
└──────────────────────────────────────────────────────────────────────────────┘
```

The status bar is a single `<box>` element with:
- `flexDirection="row"` — three child sections laid out horizontally
- `height={1}` — exactly one terminal row
- `width="100%"` — full terminal width
- `backgroundColor={theme.surface}` — dark background for visual separation
- `borderColor={theme.border}` — top border for visual separation from content
- `border={["top"]}` — only top border
- `justifyContent="space-between"` — distributes sections across width

#### Three Section Layout

**Left Section** (keybinding hints):
- `flexGrow={1}`, `flexShrink={1}`, `overflow="hidden"`
- Each hint: `<text fg={primary} attributes={BOLD}>{keys}</text><text fg={muted}>:{label}  </text>`
- Truncation `…` shown when hints are clipped

**Center Section** (sync status):
- `flexShrink={0}` — fixed-width, never shrinks
- Contains `<SyncStatusIndicator>` sub-component

**Right Section** (notification badge + help):
- `flexShrink={0}` — fixed-width, never shrinks
- Contains `<NotificationBadge>` followed by `?:help`

#### Sync Status Indicator Visual States

| State | Icon | Label (≥120 cols) | Color Token | Animation |
|-------|------|-------------------|-------------|----------|
| `connected` | `●` | `Connected` | `success` (green) | none |
| `syncing` | braille spinner | `Syncing…` | `warning` (yellow) | 80ms frame cycle |
| `conflict` | `▲` | `{N} conflicts` | `warning` (yellow) | none |
| `disconnected` | `●` | `Disconnected` | `error` (red) | none; appends `(retry {N}s)` during backoff |

#### Notification Badge Visual States

| Condition | Rendering | Color | Styling |
|-----------|-----------|-------|---------|
| Count = 0 | `◆` (icon only) | `muted` | normal |
| Count 1–99 | `◆ {N}` | `primary` | normal |
| Count > 99 | `◆ 99+` | `primary` | normal |
| Count increased | Same as above | `primary` | **bold** for 2 seconds |

#### Auth Confirmation Flash

When auth completes, center section shows `✓ alice via env` in `success` color for 3 seconds. Username truncated to 20 chars. Total text capped at 40 chars.

#### Responsive Breakpoints

**Minimum (80–119 cols):**
```
│ j/k:nav  Enter:open  /:search  R:retry │●│ ◆ 3 ?:help │
```
- Max 4 hints, icon-only sync

**Standard (120–199 cols):**
```
│ j/k:navigate  Enter:open  /:search  Space:select  q:back  ?:help │ ● Connected │ ◆ 3  ?:help │
```
- Max 6 hints, icon + label sync

**Large (200+ cols):**
```
│ j/k:navigate  Enter:open  /:search  Space:select  q:back  G:bottom  gg:top │ ● Connected (12:34:56) │ ◆ 3  ?:help │
```
- All hints, icon + label + timestamp sync

#### Width Budget

- At 80 cols: Right ~14 chars, Center ~3 chars, Left ~61 chars (fits 4 hints at ~12 chars each)
- At 120 cols: Right ~12 chars, Center ~13 chars, Left ~93 chars (fits 6 hints)

#### Error States

**Optimistic revert error:** Replaces hints with red error text, auto-clears after 5 seconds.
```
│ ✗ Failed to close issue #42: permission denied │ ● Connected │ ◆ 3  ?:help │
```

**Error boundary fallback:**
```
│ [status bar error — press ? for help]                                    │
```

#### Go-to Mode Override

When `g` is pressed, hints show go-to destinations: `g+d:dashboard  g+r:repos  g+i:issues ...`
Reverts on selection or 1500ms timeout.

### Documentation

- **TUI Quick Reference**: Section describing the status bar layout, what each section means, and how to interpret sync states.
- **Keyboard Shortcuts Guide**: Document that the status bar shows context-sensitive hints and `?` opens the full help overlay.
- **Sync Status Reference**: Table explaining connected/syncing/conflict/disconnected states and required user actions.
- **Notification Badge**: Note that the badge reflects unread notifications and links to the notification screen (`g n`).

## Permissions & Security

### Authorization
- The status bar is a client-side chrome element. It does not expose or gate any server-side actions.
- All data displayed (sync status, notification count) is fetched through the authenticated API client using the user's existing token.
- No special role is required to see the status bar. All authenticated users (Owner, Admin, Member, Read-Only) see the same status bar.
- Unauthenticated users see the status bar with "disconnected" sync and 0 notifications — no data is leaked.
- Anonymous users see the status bar in degraded mode (no sync, no notifications) — this is correct behavior, not an error.

### Rate Limiting
- SSE connections that feed sync status and notification count are subject to the server's existing SSE rate limits.
- The status bar itself does not make any direct API calls. All data comes through hooks/providers.
- Client-side timers (auth confirmation 3s, notification flash 2s, error auto-clear 5s) are local `setTimeout` calls with no server interaction.
- The `computeVisibleHints()` function is a pure synchronous computation with no server interaction.
- No additional rate limiting is needed for the status bar itself.

### Data Privacy
- The username in the auth confirmation flash is the user's own username. No other user's PII is displayed.
- Notification count is numeric only — no notification content is shown in the status bar.
- Sync conflict count is numeric only — no file paths or repo names are shown.
- No sensitive tokens, passwords, or API keys are ever rendered in the status bar.
- Error messages shown in the status bar may contain server-provided error text; these should be sanitized to avoid leaking internal server details (e.g., SQL errors, stack traces).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `tui.status_bar.rendered` | First render of StatusBar | `sync_status`, `notification_count`, `hints_visible_count`, `hints_total_count`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.status_bar.sync_state_changed` | Sync status transitions | `from_status`, `to_status`, `conflict_count`, `pending_count` |
| `tui.status_bar.notification_received` | Unread count increases | `previous_count`, `new_count`, `screen` |
| `tui.status_bar.sse_disconnect` | SSE connection drops | `duration_connected_ms`, `screen`, `reconnect_attempt` |
| `tui.status_bar.sse_reconnect` | SSE connection restored | `disconnect_duration_ms`, `attempts`, `backoff_ms` |
| `tui.status_bar.resize_relayout` | Terminal resize causes breakpoint change | `old_width`, `new_width`, `old_breakpoint`, `new_breakpoint` |

Common properties (`session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`) are injected automatically by the telemetry system.

### Funnel Metrics & Success Indicators

- **Hint utility**: Track if users who see specific hints (e.g., `/:search`) subsequently press those keys. High correlation = hints are effective.
- **Sync awareness**: Ratio of `sync_state_changed` with `to_status=conflict` followed by navigation to Sync screen. High ratio = users notice and act on conflicts.
- **Notification engagement**: Percentage of `notification_received` events followed by navigation to Notifications (`g n`) within 30 seconds. Measures badge driving action.
- **SSE health**: Ratio of `sse_disconnect` to `sse_reconnect`. Healthy = near 1:1. Increasing disconnects without reconnects = infrastructure issues.
- **Responsive fitness**: Distribution of `breakpoint` values in `rendered` events. Informs which terminal sizes are most common.
- **Error surface**: Percentage of sessions where `sync_status=disconnected` at render time. Consistently high = onboarding or infrastructure problem.

## Observability

### Logging Requirements

All logging uses the structured `logger` from `apps/tui/src/lib/logger.ts`.

| Level | Event | Format |
|---|---|---|
| `debug` | StatusBar rendered | `StatusBar: rendered [width={w}] [hints={n}] [sync={status}] [notifs={count}]` |
| `debug` | Hints updated | `StatusBar: hints updated [screen={name}] [count={n}]` |
| `info` | Sync state transition | `StatusBar: sync state changed [from={prev}] [to={next}]` |
| `info` | SSE reconnect | `StatusBar: SSE reconnected [after={duration}ms] [attempts={n}]` |
| `warn` | SSE disconnect | `StatusBar: SSE disconnected [duration_connected={ms}] [will_retry_in={backoff}ms]` |
| `warn` | Notification overflow | `StatusBar: notification count exceeds display limit [count={n}] [displayed=99+]` |
| `error` | Unexpected hook data | `StatusBar: unexpected hook data [hook={name}] [value={json}]` |
| `error` | Render error | `StatusBar: render error [error={message}]` |

### Prometheus Metrics

| Metric | Type | Description | Labels |
|---|---|---|---|
| `tui_status_bar_render_count` | Counter | Total StatusBar renders | `breakpoint` |
| `tui_status_bar_sync_state` | Gauge | Current sync state (0=disconnected, 1=connected, 2=syncing, 3=conflict) | — |
| `tui_status_bar_notification_count` | Gauge | Current unread notification count | — |
| `tui_status_bar_sse_disconnects_total` | Counter | Total SSE disconnection events | — |
| `tui_status_bar_sse_reconnect_duration_ms` | Histogram | Time to re-establish SSE connection | `attempt_count` |
| `tui_status_bar_error_boundary_triggers_total` | Counter | Times StatusBar error boundary caught an error | — |
| `tui_status_bar_hint_overflow_count` | Gauge | Hints that didn't fit in status bar | `breakpoint` |

### Alerts

#### Alert: StatusBar Error Boundary Triggered
- **Condition**: `tui_status_bar_error_boundary_triggers_total` increases by >5 in 15 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check TUI error logs for `StatusBar: render error` entries.
  2. Identify the specific error message and stack trace.
  3. Check for `StatusBar: unexpected hook data` log entries — may indicate a hook returning unexpected data.
  4. If caused by theme/layout hook, check recent deployments to ThemeProvider or LayoutProvider.
  5. If caused by SSE data, check SSEProvider implementation for schema changes.
  6. Deploy fix and monitor error boundary trigger count returning to zero.

#### Alert: Sustained SSE Disconnect
- **Condition**: `tui_status_bar_sync_state` gauge remains at 0 (disconnected) for >5 minutes across >10% of active sessions.
- **Severity**: Critical
- **Runbook**:
  1. Check server-side SSE endpoint health.
  2. Check for network infrastructure issues (load balancer timeouts, proxy SSE buffering).
  3. Verify SSE ticket-based auth endpoint is responding.
  4. Check `tui_status_bar_sse_disconnects_total` for spike.
  5. Check `tui_status_bar_sse_reconnect_duration_ms` histogram for increasing reconnect times.
  6. If server-side, escalate to infrastructure team.
  7. If client-side, check exponential backoff cap (max 30s).

#### Alert: Notification Count Stuck
- **Condition**: `tui_status_bar_notification_count` gauge shows same value >0 for >1 hour across active sessions while SSE is healthy.
- **Severity**: Warning
- **Runbook**:
  1. Verify notification SSE channel is delivering events (check server-side SSE logs).
  2. Check if `useNotificationCount` hook subscribes to correct SSE channel.
  3. Verify notification API endpoint returns updated counts.
  4. Check if "mark read" actions properly decrement the count.
  5. If SSE channel is healthy but count doesn't update, issue is in hook state management.

### Error Cases & Failure Modes

| Failure Mode | Behavior | Recovery |
|---|---|---|
| SSE provider is stub | Sync shows "disconnected", notifications show 0 | Normal degraded behavior |
| SSE connection drops | Sync → "disconnected", notification count frozen | Auto-reconnect with exponential backoff (1s→2s→4s→8s→max 30s) |
| Auth token expires | Center shows stale sync state | `useAuth()` detects 401, shows "Session expired" |
| `useSyncState` throws | Error boundary catches, shows fallback | Auto-recovers on next render |
| `useNotificationCount` returns NaN | Shows `◆` muted (0-count behavior) | Null guard prevents NaN rendering |
| Terminal resize below 80x24 | "Terminal too small" screen replaces UI | Status bar reappears on resize above 80x24 |
| `useStatusBarHints` returns empty array | Left section empty, no crash | Normal — some screens may register no hints |
| `computeVisibleHints` negative width | Returns empty visible array | Guard: `Math.max(0, availableWidth)` |

## Verification

### E2E Tests — Terminal Snapshot & Interaction Tests

All tests use `@microsoft/tui-test` via helpers in `e2e/tui/helpers.ts`. Tests are added to `e2e/tui/app-shell.test.ts`.

#### Core Rendering

- `SNAP-SB-001`: Status bar renders at 120×40 with default state — snapshot matches golden file, contains `?:help`, contains sync indicator icon.
- `SNAP-SB-002`: Status bar renders at 80×24 minimum size — snapshot matches, `?:help` visible, sync labels NOT present (icon only).
- `SNAP-SB-003`: Status bar renders at 200×60 large size — snapshot matches, `?:help` visible, all hints shown.
- `SNAP-SB-004`: Status bar line spans exactly full terminal width (120 cols) — `getLine(rows-1).length >= 120`.
- `SNAP-SB-005`: Status bar present on Dashboard screen.
- `SNAP-SB-006`: Status bar present on Issues screen.
- `SNAP-SB-007`: Status bar present on Repository screen.
- `SNAP-SB-008`: Status bar has visible top border — `getLine(rows-2)` contains box-drawing/border chars.

#### Keybinding Hints

- `KEY-SB-001`: Dashboard shows relevant keybinding hints in status bar.
- `KEY-SB-002`: Navigating to Issues updates hints to issue-specific keys.
- `KEY-SB-003`: Navigating back (`q`) restores previous screen's hints.
- `KEY-SB-004`: At 80 cols, maximum 4 hints visible.
- `KEY-SB-005`: At 120 cols, maximum 6 hints visible.
- `KEY-SB-006`: At 200 cols, all registered hints visible (no `…`).
- `KEY-SB-007`: When truncated, `…` appears at end of hints section.
- `KEY-SB-008`: Hints never overflow into center section — sync indicator always visible.
- `KEY-SB-009`: Hint keys use primary color token (ANSI code verification).
- `KEY-SB-010`: Hint labels use muted color token (ANSI code verification).
- `KEY-SB-011`: Screen with no hints: left section empty, no crash.

#### Sync Status Indicator

- `SYNC-SB-001`: Default state shows sync indicator icon on status bar.
- `SYNC-SB-002`: At 120 cols, sync label text visible alongside icon.
- `SYNC-SB-003`: At 80 cols, sync label text NOT visible (icon only).
- `SYNC-SB-004`: SSE stub: sync shows disconnected state.
- `SYNC-SB-005`: Sync uses correct color token (connected=green, disconnected=red).
- `SYNC-SB-006`: Non-Unicode terminal: ASCII fallback chars (`*` instead of `●`).

#### Notification Badge

- `NOTIF-SB-001`: Default shows notification icon `◆` in muted color (count 0).
- `NOTIF-SB-002`: Count 0: no number displayed next to icon.
- `NOTIF-SB-003`: Badge positioned left of `?:help`.
- `NOTIF-SB-004`: Non-Unicode terminal: `*` instead of `◆`.
- `NOTIF-SB-005`: `?:help` always visible regardless of count or width.

#### Auth Confirmation Flash

- `AUTH-SB-001`: After auth, center shows `✓ {username} via {source}` — regex match.
- `AUTH-SB-002`: Confirmation disappears after ~3 seconds.
- `AUTH-SB-003`: Username >20 chars is truncated.
- `AUTH-SB-004`: Offline state shows `⚠ offline` warning.

#### Error States

- `ERR-SB-001`: Screen loading error shows `R:retry` hint.
- `ERR-SB-002`: Optimistic revert error shows red error message replacing hints.
- `ERR-SB-003`: Error message truncated with `…` when exceeding width.
- `ERR-SB-004`: Error boundary fallback renders `[status bar error — press ? for help]`.
- `ERR-SB-005`: After error boundary, rest of TUI continues (header, content still work).

#### Overlay Integration

- `OVERLAY-SB-001`: Help overlay (`?`) replaces hints with `Esc:close`.
- `OVERLAY-SB-002`: Closing overlay restores original hints.
- `OVERLAY-SB-003`: Command palette (`:`) replaces hints.
- `OVERLAY-SB-004`: Closing command palette restores hints.

#### Go-to Mode Integration

- `GOTO-SB-001`: Pressing `g` overrides hints with go-to destinations.
- `GOTO-SB-002`: Completing go-to navigation restores target screen hints.
- `GOTO-SB-003`: Go-to timeout (1500ms) restores original hints.

#### Responsive Resize

- `RESIZE-SB-001`: Resize 120→80 cols reduces hints from 6 to 4.
- `RESIZE-SB-002`: Resize 80→200 cols shows all hints.
- `RESIZE-SB-003`: Resize 120→80 cols hides sync label (icon only).
- `RESIZE-SB-004`: Resize below 80x24 shows "too small" screen; resize back restores status bar.
- `RESIZE-SB-005`: Status bar width fills new terminal width after resize.

#### Boundary & Edge Cases

- `EDGE-SB-001`: Exact minimum size (80×24) — no overflow, no crash.
- `EDGE-SB-002`: Very wide terminal (300×80) — no rendering artifacts.
- `EDGE-SB-003`: 500-char error message properly truncated with `…`, no overflow.
- `EDGE-SB-004`: Hint with 50-char label handled (truncated or omitted).
- `EDGE-SB-005`: Notification count exactly 99 shows `99` (not `99+`).
- `EDGE-SB-006`: Notification count exactly 100 shows `99+`.
- `EDGE-SB-007`: Notification count 0 shows icon only, no number.
- `EDGE-SB-008`: Rapid 10 screen pushes in <1 second: correct final hints displayed.
- `EDGE-SB-009`: Multiple `overrideHints` calls (overlay → go-to → close): correct hint state.
- `EDGE-SB-010`: Auth confirmation with empty username: no crash, shows `✓ via {source}`.
- `EDGE-SB-011`: Username exactly 20 chars: no truncation indicator.
- `EDGE-SB-012`: Username 21 chars: truncated with `…`.

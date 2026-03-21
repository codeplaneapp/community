# TUI_SYNC_STATUS_INDICATOR

Specification for TUI_SYNC_STATUS_INDICATOR.

## High-Level User POV

The Sync Status Indicator is a compact, always-visible component embedded in the center section of the global status bar on every TUI screen. It provides ambient, at-a-glance awareness of the daemon's synchronization health — the developer never has to navigate to a dedicated screen to know whether their local changes are reaching the remote server.

The indicator presents one of four visual states. When the daemon is connected and idle, the user sees a small green dot (●) followed by the word "Connected" — a quiet confirmation that sync is healthy. When the daemon is actively flushing queued operations to the remote, the dot is replaced by a spinning braille character (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) cycling at 100ms per frame in yellow, followed by "Syncing…" — this gives a sense of liveness without being distracting. If the sync engine has encountered conflicts that require user attention, a yellow warning triangle (▲) appears followed by a count ("3 conflicts"), signaling that something needs resolution. And when the SSE connection to the daemon drops or the daemon itself is unreachable, a red dot (●) with "Disconnected" appears, optionally appended with "(retry 4s)" to show the auto-reconnect backoff timer.

The indicator is purely informational — it captures no keyboard focus and the user never interacts with it directly. It serves as a visual nudge: if the user notices a red dot or a conflict count, they know to navigate to the Sync Status screen (`g y`) or open the command palette (`:sync`) for full details and actions. The indicator is visible at all times, beneath any overlays like the command palette or help screen, ensuring continuous sync awareness even during other interactions.

At small terminal sizes (80 columns), the indicator collapses to just the icon character — no text label — to conserve horizontal space for keybinding hints and the notification badge. At standard widths (120+ columns), the full icon-plus-label renders. At large widths (200+ columns), additional context like the last sync timestamp ("synced 12s ago") appears alongside the label.

The spinner animation is smooth and lightweight. It uses OpenTUI's `useTimeline()` hook to advance frames without triggering layout reflows or allocating new strings. The entire indicator renders in under 1ms and never contributes meaningfully to screen transition latency. SSE-driven state changes propagate immediately — the user sees the indicator update within one render frame of the underlying state change.

For developers working in SSH-only environments or running Codeplane's daemon mode behind unstable network connections, the sync status indicator is the difference between trusting their local state and wondering whether their changes have been pushed. It transforms network reliability from an invisible, anxiety-inducing concern into a visible, glanceable status.

## Acceptance Criteria

### Core rendering
- [ ] The Sync Status Indicator renders inside the center section of the global status bar on every TUI screen with no exceptions (dashboard, repos, issues, landings, diff, workspaces, workflows, search, notifications, agents, settings, organizations, sync, wiki).
- [ ] The indicator renders as a single horizontal element: icon character + optional text label + optional timestamp.
- [ ] The indicator does not wrap to multiple lines regardless of content or terminal width.
- [ ] The indicator has `flexShrink={0}` — it is never compressed or hidden by adjacent status bar sections.
- [ ] The indicator uses the status bar's `surface` background color (ANSI 236) matching the rest of the bar.
- [ ] The indicator is horizontally centered between the left keybinding hints section and the right notification/help section.

### State: Connected (online)
- [ ] When the daemon sync status is `online`, the indicator renders a green dot character `●` (U+25CF) followed by the text "Connected".
- [ ] The dot and text use `success` semantic color (ANSI 34).
- [ ] No animation is active in this state.

### State: Syncing
- [ ] When the daemon sync status is `syncing`, the indicator renders a braille spinner character cycling through the sequence ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 100ms per frame (10 frames per second).
- [ ] The spinner and "Syncing…" label text use `warning` semantic color (ANSI 178).
- [ ] The spinner animation is driven by `useTimeline()` from `@opentui/react`.
- [ ] The spinner does not cause layout reflow — the icon character width is constant (1 cell).
- [ ] The spinner does not allocate new string objects on each frame — it indexes into a pre-allocated array of characters.
- [ ] The spinner animation runs only when `status === "syncing"` — the timer is inactive in other states to avoid unnecessary CPU usage.
- [ ] The spinner starts immediately when entering syncing state and stops immediately when leaving it.

### State: Conflicts
- [ ] When the daemon sync status is `error` and `conflictCount > 0`, the indicator renders a yellow warning triangle `▲` (U+25B2) followed by "{N} conflicts" where N is the conflict count.
- [ ] The triangle and text use `warning` semantic color (ANSI 178).
- [ ] The conflict count is a live integer from `SyncState.conflictCount`.
- [ ] When `conflictCount` is exactly 1, the label reads "1 conflict" (singular).
- [ ] When `conflictCount` exceeds 99, the label reads "99+ conflicts".

### State: Disconnected (offline)
- [ ] When the daemon sync status is `offline`, or `error` with `conflictCount === 0`, the indicator renders a red dot `●` (U+25CF) followed by "Disconnected".
- [ ] The dot and text use `error` semantic color (ANSI 196).
- [ ] When auto-reconnection is in progress (`useSSEConnectionState().reconnecting === true`), the label appends " (retry {N}s)" where N is `Math.ceil(backoffMs / 1000)`.
- [ ] When the daemon is unreachable at startup (before any connection succeeds), the indicator shows `disconnected` immediately — no loading spinner or intermediate state.

### Responsive behavior
- [ ] At terminal widths 80–119 columns: icon character only, no text label, no timestamp.
- [ ] At terminal widths 120–199 columns: icon character + text label (e.g., "● Connected", "▲ 3 conflicts").
- [ ] At terminal widths 200+ columns: icon character + text label + " · {relative_time}" where relative_time is the last sync timestamp.
- [ ] Responsive breakpoints are evaluated via `useTerminalDimensions()` from `@opentui/react`.
- [ ] Terminal resize causes the indicator to re-evaluate its display mode synchronously within one render frame.
- [ ] No animation or transition during resize — the indicator snaps to the new mode immediately.
- [ ] The indicator never wraps, overflows, or overlaps the keybinding hints or notification badge sections.

### Timestamp formatting (200+ columns only)
- [ ] `lastSyncAt` is formatted as relative time: "Ns ago" (< 60s), "Nm ago" (< 60m), "Nh ago" (< 24h), "Nd ago" (≥ 24h).
- [ ] When `lastSyncAt` is null (never synced), the timestamp reads "never".
- [ ] Timestamp updates every 10 seconds (not every second) to avoid unnecessary re-renders.
- [ ] Timestamp is separated from the label by " · " (space, middle dot U+00B7, space).

### State transitions
- [ ] When the sync status changes, the indicator transitions within one render frame (no transition animation, immediate swap).
- [ ] The indicator reflects the SSE connection state within 1 second of an actual connection drop.
- [ ] State transitions do not trigger a full content area re-render — only the status bar section updates.

### Data integration
- [ ] The indicator consumes `useSyncState()` from `@codeplane/ui-core` for sync status, conflict count, and last sync timestamp.
- [ ] The indicator consumes `useSSEConnectionState()` from `@codeplane/ui-core` for connection health and reconnect backoff.
- [ ] The indicator consumes `useTerminalDimensions()` from `@opentui/react` for responsive breakpoint detection.
- [ ] The indicator consumes `useTimeline()` from `@opentui/react` for spinner animation.
- [ ] The indicator does not make any API requests directly.
- [ ] The indicator does not write to any state — it is a pure render of external state.

### State mapping logic
- [ ] `SyncStatus.online` → **Connected** state.
- [ ] `SyncStatus.syncing` → **Syncing** state.
- [ ] `SyncStatus.error` with `conflictCount > 0` → **Conflict** state.
- [ ] `SyncStatus.error` with `conflictCount === 0` → **Disconnected** state.
- [ ] `SyncStatus.offline` → **Disconnected** state.
- [ ] `null` or `undefined` from `useSyncState()` → **Disconnected** state.

### Performance
- [ ] Indicator render time is under 1ms.
- [ ] SSE-driven state changes render incrementally without triggering a full screen re-render.
- [ ] No memory allocations on spinner frame ticks beyond the frame index update.
- [ ] The indicator component is memoized and only re-renders when `SyncState`, `SSEConnectionState`, or terminal dimensions actually change.
- [ ] No memory leaks from the spinner timer — cleanup on unmount and on state change away from `syncing`.

### Resilience
- [ ] If `useSyncState()` returns null or undefined, the indicator renders **Disconnected** state with no crash.
- [ ] If `useSSEConnectionState()` returns null or undefined, the indicator omits the reconnection backoff display with no crash.
- [ ] If the daemon is unreachable at TUI startup, the indicator immediately shows **Disconnected**.
- [ ] If the auth token is missing or expired, the indicator renders **Disconnected**.
- [ ] Terminal resize during a state transition completes both operations cleanly.
- [ ] Rapid state oscillation (online ↔ syncing at flush interval) renders each state correctly with no skipped frames.
- [ ] The indicator never crashes or throws — it handles all null, undefined, NaN, and unexpected values gracefully.

### Non-UTF-8 fallback
- [ ] When `LANG` or `LC_ALL` does not contain "UTF-8", braille spinner characters are replaced with ASCII fallback cycle: `- \ | /`.
- [ ] Unicode dot `●` is replaced with `*` and triangle `▲` is replaced with `!` in non-UTF-8 mode.
- [ ] The middle dot separator `·` is replaced with `-` in non-UTF-8 mode.

### Truncation and boundary constraints
- [ ] Icon character: always exactly 1 cell wide.
- [ ] Text label max length: "Disconnected (retry 30s)" = 24 characters (widest possible label).
- [ ] Conflict count display: max "99+ conflicts" (13 characters).
- [ ] Timestamp display: max "· 999d ago" (10 characters).
- [ ] Total indicator width never exceeds 36 characters at any breakpoint.
- [ ] At minimum width (80–119 columns), indicator is exactly 1 character (icon only).

### Interaction model
- [ ] The indicator is a passive, read-only display element — it captures no keyboard focus.
- [ ] The indicator does not register any keybindings.
- [ ] The indicator is not navigable via Tab or j/k.
- [ ] Clicking the indicator (mouse) has no effect (mouse support is additive, never required).

## Design

### Layout structure

The Sync Status Indicator is a sub-component within the center section of the status bar's three-section horizontal flex layout:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ j/k:navigate  Enter:open  /:search   │   ● Connected   │   ◆ 3  ?:help     │
│  ← left: keybinding hints →          │ ← center: sync → │ ← right: notif → │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Indicator visual states

**Connected (120–199 columns):**
```
● Connected
```
Green dot (ANSI 34) + "Connected" (ANSI 34)

**Connected (200+ columns):**
```
● Connected · 12s ago
```
Green dot (ANSI 34) + "Connected" (ANSI 34) + separator "·" (ANSI 240) + timestamp (ANSI 245)

**Connected (80–119 columns):**
```
●
```
Green dot (ANSI 34) only

**Syncing (120–199 columns):**
```
⠹ Syncing…
```
Yellow braille spinner (ANSI 178) + "Syncing…" (ANSI 178)

**Syncing (80–119 columns):**
```
⠹
```
Yellow braille spinner (ANSI 178) only

**Conflicts (120–199 columns):**
```
▲ 3 conflicts
```
Yellow triangle (ANSI 178) + count + "conflicts" (ANSI 178)

**Conflicts (80–119 columns):**
```
▲
```
Yellow triangle (ANSI 178) only

**Disconnected (120–199 columns):**
```
● Disconnected
```
Red dot (ANSI 196) + "Disconnected" (ANSI 196)

**Disconnected with reconnection (120–199 columns):**
```
● Disconnected (retry 4s)
```
Red dot (ANSI 196) + "Disconnected (retry 4s)" (ANSI 196)

**Disconnected (80–119 columns):**
```
●
```
Red dot (ANSI 196) only

### Component tree

```jsx
<box flexDirection="row" flexShrink={0} justifyContent="center" alignItems="center">
  <SyncStatusIndicator />
</box>
```

SyncStatusIndicator internal:

```jsx
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII_SPINNER = ["-", "\\", "|", "/"];

function SyncStatusIndicator() {
  const syncState = useSyncState();
  const sseState = useSSEConnectionState();
  const { width } = useTerminalDimensions();
  const displayState = mapSyncState(syncState, sseState);
  const breakpoint = width < 120 ? "compact" : width < 200 ? "standard" : "large";
  const isUtf8 = detectUtf8();
  const timeline = useTimeline({ fps: 10, active: displayState === "syncing" });
  const frames = isUtf8 ? SPINNER_FRAMES : ASCII_SPINNER;

  return (
    <box flexDirection="row" flexShrink={0}>
      <text fg={stateColor[displayState]}>
        {displayState === "syncing"
          ? frames[timeline.frame % frames.length]
          : stateIcon[displayState]}
      </text>
      {breakpoint !== "compact" && (
        <text fg={stateColor[displayState]}>
          {" "}{stateLabel(displayState, syncState, sseState)}
        </text>
      )}
      {breakpoint === "large" && syncState?.lastSyncAt && (
        <text fg={245}> · {relativeTime(syncState.lastSyncAt)}</text>
      )}
      {breakpoint === "large" && !syncState?.lastSyncAt && (
        <text fg={245}> · never</text>
      )}
    </box>
  );
}
```

### State-to-visual mapping

| Display State | Icon | Color (ANSI) | Label | Condition |
|---------------|------|-------------|-------|----------|
| connected | `●` | 34 (green) | "Connected" | `status === "online"` |
| syncing | `⠋⠙⠹…` | 178 (yellow) | "Syncing…" | `status === "syncing"` |
| conflict | `▲` | 178 (yellow) | "{N} conflict(s)" | `status === "error" && conflictCount > 0` |
| disconnected | `●` | 196 (red) | "Disconnected" or "Disconnected (retry Ns)" | `status === "error" && conflictCount === 0`, `status === "offline"`, or null state |

### Non-UTF-8 rendering

| Element | UTF-8 | ASCII fallback |
|---------|-------|---------------|
| Online/Disconnected icon | `●` | `*` |
| Syncing spinner | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` | `- \ | /` |
| Conflict icon | `▲` | `!` |
| Timestamp separator | `·` | `-` |

### Responsive breakpoints

| Width | Mode | Display | Max chars |
|-------|------|---------|----------|
| 80–119 | compact | Icon only | 1 |
| 120–199 | standard | Icon + label | 26 |
| 200+ | large | Icon + label + " · {timestamp}" | 36 |

### Keybindings

The Sync Status Indicator captures **no keybindings**. It is a passive, read-only display element. Related actions live elsewhere:

| Action | Keybinding | Location |
|--------|-----------|----------|
| Navigate to sync screen | `g y` | Global go-to mode |
| Open sync via command palette | `:sync` | Command palette |
| Force sync | `S` | Sync status screen only |
| Resolve conflicts | `d` | Sync status screen only |

### Terminal resize behavior

Subscribes to `useOnResize()` and `useTerminalDimensions()`. On resize:

| From → To | Behavior |
|-----------|----------|
| 120→80 | Label immediately hidden, icon-only renders |
| 80→120 | Label immediately appears |
| 120→200 | Timestamp immediately appears |
| 200→80 | Label and timestamp immediately hidden |

No animation, no transition delay. Synchronous re-render within one frame.

### Data hooks consumed

| Hook | Source | Data |
|------|--------|------|
| `useSyncState()` | `@codeplane/ui-core` | `SyncState { status, pendingCount, conflictCount, lastSyncAt, error }` |
| `useSSEConnectionState()` | `@codeplane/ui-core` | `{ connected, reconnecting, backoffMs }` |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useTimeline()` | `@opentui/react` | `{ frame: number }` — spinner animation driver |

### State derivation logic

The indicator derives its effective display state from two sources:

1. **`useSyncState().status`** — the daemon's own assessment of sync health (`online`, `syncing`, `error`, `offline`).
2. **`useSSEConnectionState().connected`** — whether the SSE transport is currently connected.

If the SSE connection reports disconnected (`connected === false`) but the daemon status hasn't caught up yet, the indicator immediately shows `disconnected`. The SSE connection state acts as a leading indicator of connectivity loss.

If both sources return null (daemon unreachable, SSE not initialized), the indicator defaults to `disconnected`.

### Relationship to Sync Status Screen

The indicator is a summary widget. The Sync Status Screen (`TUI_SYNC_STATUS_SCREEN`, reachable via `g y`) is the full dashboard. Both share the same `useSyncState()` and `useSSEConnectionState()` hooks, so the indicator's conflict count always matches the screen's conflict count and the indicator's status always matches the screen's status banner.

## Permissions & Security

### Authorization
- The Sync Status Indicator requires no specific authorization role. It renders for all authenticated users as part of the status bar.
- Sync state is derived from the local daemon's internal state, not from a server-side API endpoint scoped by role. Any user running the daemon sees its sync status.
- The indicator does not expose server-side authorization details, repository names, or resource-specific data.
- If the user is unauthenticated (no token), the indicator renders as `disconnected`. No error is thrown; the degraded state is the designed behavior.

### Token-based auth
- The TUI authenticates via a token stored in the CLI keychain (from `codeplane auth login`) or the `CODEPLANE_TOKEN` environment variable.
- The indicator does not handle, store, display, or transmit authentication tokens.
- SSE connections that feed the indicator use ticket-based auth obtained via the auth API — the indicator consumes the result, not the mechanism.
- If the auth token is missing or expired, the sync engine cannot connect to the remote server, and the indicator reflects this as **Disconnected** state. No token-related error messages are shown in the indicator.

### Rate limiting
- The Sync Status Indicator does not generate any HTTP requests. It consumes state from context providers.
- The SSE connection used for connection health is a single persistent connection, not subject to per-request rate limits.
- The daemon's sync state is polled by the `useSyncState()` hook (3-second interval), not by the indicator.
- No user interaction on the indicator triggers API calls.

### Data sensitivity
- The indicator displays only aggregate metadata: connection status word, conflict count (an integer), backoff timer (an integer), and optionally a relative timestamp.
- No PII, repository names, file contents, API paths, error messages, or user-specific data is rendered in the indicator.
- The indicator is safe to display in screen-shared or recorded terminal sessions.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.sync_indicator.state_changed` | Indicator transitions between display states | `from_state`, `to_state`, `conflict_count`, `pending_count`, `terminal_width`, `breakpoint` |
| `tui.sync_indicator.reconnect_displayed` | "(retry Ns)" backoff label becomes visible | `backoff_ms`, `disconnect_duration_ms`, `reconnect_attempt` |
| `tui.sync_indicator.conflict_count_changed` | Conflict count changes (new conflict or resolution) | `previous_count`, `new_count`, `screen` |
| `tui.sync_indicator.timestamp_stale` | Last sync timestamp exceeds 5 minutes while status is "online" | `last_sync_seconds_ago`, `current_status`, `screen` |
| `tui.sync_indicator.utf8_fallback` | Non-UTF-8 locale detected at startup, ASCII fallback activated | `locale`, `terminal_type` |

### Common event properties

All sync indicator events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `breakpoint`: Current responsive breakpoint (`"compact"` | `"standard"` | `"large"`)
- `color_mode`: `"truecolor"` | `"256"` | `"16"`

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Online uptime ratio | > 90% of session duration | Indicator shows "connected" for at least 90% of a typical TUI session |
| Conflict awareness latency | < 30s mean | Mean time from conflict creation to user navigating to sync screen |
| State transition accuracy | 100% | Every daemon state change is reflected in the indicator within 1 render frame |
| Disconnect detection latency | < 2s | Time from SSE disconnect to indicator showing "Disconnected" |
| Reconnect visibility | 100% of reconnections | Every reconnection attempt shows the "(retry Ns)" label |
| Render performance | 100% under 1ms | No indicator render exceeds 1ms |
| Spinner frame consistency | < 5% frame drops | Spinner frames advance at ≤110ms intervals (100ms target ± 10%) |

## Observability

### Logging requirements

| Log level | Event | Message format |
|-----------|-------|----------------|
| `debug` | Indicator rendered | `SyncIndicator: rendered [state={state}] [breakpoint={bp}] [conflicts={n}]` |
| `debug` | Breakpoint changed on resize | `SyncIndicator: breakpoint changed [from={old}] [to={new}] [width={w}]` |
| `info` | State transition | `SyncIndicator: state transition [from={prev}] [to={next}] [conflicts={n}] [pending={n}]` |
| `info` | Reconnection backoff displayed | `SyncIndicator: reconnecting [backoff={ms}ms] [attempt={n}]` |
| `warn` | Stale sync timestamp (> 5 min) | `SyncIndicator: sync timestamp stale [last_sync={iso}] [age_seconds={n}]` |
| `warn` | Non-UTF-8 locale detected | `SyncIndicator: non-UTF-8 locale [locale={val}] [using_ascii_fallback=true]` |
| `error` | Hook returned unexpected data | `SyncIndicator: unexpected hook data [hook={name}] [value={json}]` |
| `error` | Render error caught by boundary | `SyncIndicator: render error [error={message}]` |

Logs to stderr. Level controlled via `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error cases specific to TUI

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during spinner animation | Spinner continues; breakpoint recalculates; icon may gain or lose label | Both resize and animation are independent — no coordination needed |
| SSE disconnect during syncing state | Indicator transitions from syncing → disconnected; spinner stops | SSE auto-reconnect runs in background; indicator shows "(retry Ns)" |
| Rapid state oscillation (online ↔ syncing at flush interval) | Each state renders correctly; spinner starts/stops cleanly | Normal behavior — flush interval causes brief syncing transitions |
| Auth token expires mid-session | SSE connection fails → indicator shows disconnected | User re-authenticates via CLI; indicator recovers when new token propagates |
| Daemon process crashes while TUI is running | `useSyncState()` returns offline/null → indicator shows disconnected | TUI remains running; indicator reflects daemon absence |
| `useSyncState()` hook throws | Error boundary catches; indicator renders fallback | Error logged; no crash propagation to parent |
| Zero terminal width | Indicator renders empty — no crash | Application-level "terminal too small" takes over |
| Locale changes mid-session | Not detected — uses locale from startup | User must restart TUI |
| `conflictCount` is negative or NaN (invalid data) | Treated as 0 — shows disconnected state, not conflict | Logged as error-level unexpected data |
| `backoffMs` exceeds 30000 (above cap) | Displayed as "30s" (cap enforced in display) | Data layer should enforce cap, but indicator is defensive |
| Rapid terminal resize (multiple events within 16ms) | Debounced to one re-layout per animation frame via OpenTUI's layout batching | Automatic — final layout matches final terminal dimensions |
| Terminal suspend (Ctrl+Z) and resume | Spinner resumes on SIGCONT; state refreshes | Automatic via OpenTUI timer system |

### Failure modes and recovery

- **Indicator component crash**: Wrapped in error boundary within the status bar. On crash, center section renders empty `<box>`. Rest of status bar and TUI continue. Error logged.
- **SSE provider unavailable**: `useSSEConnectionState()` returns null. Indicator renders Disconnected without backoff label. No errors thrown.
- **Sync state hook unavailable**: `useSyncState()` returns null. Indicator renders Disconnected. No errors thrown.
- **Timeline hook unavailable**: Spinner falls back to static first frame `⠋`. Animation does not run but indicator is still readable.
- **Stale sync state**: If `useSyncState()` stops updating (poll silently fails), the indicator retains the last known state. The indicator does not independently implement polling — that is the hook's responsibility.

## Verification

### Test file: `e2e/tui/sync.test.ts`

All tests contribute to the `TUI_SYNC_STATUS_INDICATOR` feature within the `TUI_SYNC` group. Tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### Terminal snapshot tests (16 tests)

- SNAP-SI-001: Indicator renders "● Connected" at 120×40 — Launch TUI at 120×40 with daemon online, zero conflicts. Assert status bar center section matches snapshot: green ● followed by "Connected".
- SNAP-SI-002: Indicator renders syncing spinner at 120×40 — Launch TUI at 120×40 with daemon in syncing state. Assert status bar center section contains braille spinner character followed by "Syncing…" in yellow.
- SNAP-SI-003: Indicator renders "▲ 3 conflicts" at 120×40 — Launch TUI at 120×40 with daemon in error state, conflictCount=3. Assert yellow ▲ + "3 conflicts".
- SNAP-SI-004: Indicator renders singular "▲ 1 conflict" at 120×40 — Launch TUI at 120×40 with conflictCount=1. Assert yellow ▲ + "1 conflict" (singular).
- SNAP-SI-005: Indicator renders "● Disconnected" at 120×40 — Launch TUI at 120×40 with daemon offline. Assert red ● + "Disconnected".
- SNAP-SI-006: Indicator renders "● Disconnected (retry 4s)" at 120×40 — Launch TUI with SSE reconnecting, backoffMs=4000. Assert red ● + "Disconnected (retry 4s)".
- SNAP-SI-007: Indicator renders icon-only green "●" at 80×24 (online) — Assert green ● with no text label.
- SNAP-SI-008: Indicator renders icon-only spinner at 80×24 (syncing) — Assert single braille spinner character, no label.
- SNAP-SI-009: Indicator renders icon-only yellow "▲" at 80×24 (conflicts) — Assert yellow ▲ with no text.
- SNAP-SI-010: Indicator renders "● Connected · 12s ago" at 200×60 — Assert green ● + "Connected" + " · " + "12s ago".
- SNAP-SI-011: Indicator renders "● Connected · never" at 200×60 with null lastSyncAt — Assert timestamp reads "never".
- SNAP-SI-012: Indicator renders "▲ 99+ conflicts" at overflow — Launch with conflictCount=150. Assert "99+ conflicts".
- SNAP-SI-013: Indicator background matches status bar surface color — Assert ANSI 236 background.
- SNAP-SI-014: Indicator renders on dashboard screen — Navigate to dashboard, assert indicator present.
- SNAP-SI-015: Indicator renders on issues list screen — Navigate to issues, assert indicator present.
- SNAP-SI-016: Indicator renders on sync status screen — Navigate via g y, assert indicator matches sync screen banner.

### Keyboard interaction tests (6 tests)

- KEY-SI-001: Indicator does not capture focus — Press Tab 20 times, assert focus never enters indicator area.
- KEY-SI-002: Go-to mode does not affect indicator — Press 'g', assert indicator unchanged; press 'Esc', assert indicator unchanged.
- KEY-SI-003: Help overlay does not obscure indicator — Press '?', assert indicator still visible.
- KEY-SI-004: Command palette does not obscure indicator — Press ':', assert indicator still visible.
- KEY-SI-005: g y navigation from indicator context — With conflicts showing, press g then y, assert sync screen shows matching count.
- KEY-SI-006: Indicator persists across screen navigation — Navigate dashboard→issues→workspaces, assert indicator shows same state on each.

### Responsive resize tests (7 tests)

- RESIZE-SI-001: Resize 120→80 collapses label to icon-only.
- RESIZE-SI-002: Resize 80→120 reveals label.
- RESIZE-SI-003: Resize 120→200 reveals timestamp.
- RESIZE-SI-004: Resize 200→80 collapses to icon-only.
- RESIZE-SI-005: Rapid resize (120→80→200→100→150→80→120) settles on correct layout with no artifacts.
- RESIZE-SI-006: Resize during syncing preserves spinner — spinner continues after width change.
- RESIZE-SI-007: Exact breakpoint boundaries — 119 (compact), 120 (standard), 199 (standard), 200 (large).

### Real-time state update tests (9 tests)

- RT-SI-001: State transition online → syncing.
- RT-SI-002: State transition syncing → online.
- RT-SI-003: State transition online → disconnected (SSE drop).
- RT-SI-004: State transition disconnected → online (SSE reconnect).
- RT-SI-005: Conflict count appears in real-time.
- RT-SI-006: Conflict count decrements after resolution.
- RT-SI-007: All conflicts resolved returns to connected.
- RT-SI-008: Reconnection backoff timer appears and increases (1s, 2s, 4s, 8s).
- RT-SI-009: Timestamp updates at 200+ width after 15 seconds.

### Edge case tests (11 tests)

- EDGE-SI-001: Indicator renders without auth token — shows disconnected, no crash.
- EDGE-SI-002: Indicator renders when daemon is not running — shows disconnected, no JS errors.
- EDGE-SI-003: Indicator handles null sync state gracefully — shows disconnected, no crash.
- EDGE-SI-004: Indicator present on every screen (14 screens).
- EDGE-SI-005: Indicator does not overflow into adjacent status bar sections at any width.
- EDGE-SI-006: Spinner does not run when not syncing (useTimeline inactive).
- EDGE-SI-007: Rapid state changes (10 transitions in 1s) render correctly with no artifacts.
- EDGE-SI-008: Large conflict count capped at 99+ (conflictCount=5000).
- EDGE-SI-009: Indicator at exactly 120 columns (standard breakpoint boundary).
- EDGE-SI-010: Indicator at exactly 200 columns (large breakpoint boundary).
- EDGE-SI-011: Indicator at 119 columns (just below standard breakpoint).

All 49 tests target `e2e/tui/sync.test.ts`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

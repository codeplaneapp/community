# TUI_STATUS_BAR

Specification for TUI_STATUS_BAR.

## High-Level User POV

The status bar is a persistent, single-row chrome element anchored to the bottom of every TUI screen. It acts as the user's ambient awareness layer — at a glance, the developer sees what actions are available on the current screen, whether the daemon is connected and syncing, how many unread notifications are waiting, and how to get help.

The status bar is divided into three sections that flow naturally from left to right. On the left, context-sensitive keybinding hints update dynamically as the user navigates between screens and modes. When the user is on the issue list, they see hints like `j/k:navigate  Enter:open  /:search`. When they enter go-to mode by pressing `g`, the left section updates instantly to show the available go-to destinations (`d:dashboard  i:issues  l:landings ...`), providing real-time feedback that the mode is active. The keybinding hints always reflect the most relevant actions for the user's current context, keeping discoverability high without requiring the user to open the help overlay.

In the center, a sync status indicator shows the daemon's connection health. A green dot with "Connected" text confirms the daemon is live. During active synchronization, a yellow spinner with "Syncing…" appears. If there are unresolved conflicts, a yellow warning badge shows the conflict count. When the SSE connection drops, the indicator turns red with "Disconnected" and the user sees the reconnection state. This indicator gives terminal-native developers the same always-on sync awareness that a desktop notification tray would provide.

On the right, an unread notification badge displays the count of unread notifications, updating in real-time via SSE streaming. A `?:help` hint reminds users that contextual help is always one keypress away. The notification count pulses briefly (bold text for 2 seconds) when a new notification arrives, ensuring the user notices without being interrupted.

At the minimum 80×24 terminal size, the status bar compresses gracefully: keybinding hints are truncated to show only the top 3–4 most important actions, the sync status collapses to just an icon character, and the notification count uses minimal formatting. At large terminal sizes (200+ columns), the status bar expands to show more keybinding hints with longer labels and additional metadata like the last sync timestamp.

The status bar is never interactive in the traditional sense — it does not receive focus and the user does not navigate into it. It is a read-only display surface that reflects the application's state. Its role is purely informational: reduce cognitive load, provide orientation, and keep the user aware of system health without demanding attention.

## Acceptance Criteria

### Core rendering
- [ ] The status bar renders as a single row, always pinned to the bottom of the terminal, below the content area and above the terminal's own cursor line.
- [ ] The status bar spans the full terminal width with no horizontal overflow or wrapping.
- [ ] The status bar uses a distinct background color (`surface` token, ANSI 236) to visually separate it from the content area.
- [ ] The status bar renders on every screen in the application with no exceptions.

### Left section — keybinding hints
- [ ] Keybinding hints display as `key:action` pairs separated by two spaces (e.g., `j/k:navigate  Enter:open  /:search`).
- [ ] Keybinding hints update immediately (within one render frame) when the active screen changes.
- [ ] During go-to mode (after pressing `g`), the left section replaces its content with go-to destinations: `g+d:dashboard  g+i:issues  g+l:landings  g+r:repos  g+w:workspaces  g+n:notifs  g+s:search  g+a:agents  g+o:orgs  g+f:workflows  g+k:wiki`.
- [ ] When go-to mode is canceled (Esc or timeout), keybinding hints revert to the screen's default hints within one render frame.
- [ ] Each screen provides its own set of keybinding hints via a declarative registration mechanism.
- [ ] Keys in hints render with bold text attribute; action labels render with default weight.
- [ ] When available width is insufficient to display all hints, hints are truncated from the right and the last visible hint is followed by `…` (ellipsis).
- [ ] At minimum terminal width (80 columns), at most 4 keybinding hints are shown in the left section.
- [ ] At standard width (120 columns), at most 6 keybinding hints are shown.
- [ ] At large width (200+ columns), all registered keybinding hints for the current screen are shown.

### Center section — sync status
- [ ] Sync status displays one of four states: `connected`, `syncing`, `conflict`, `disconnected` (mapped from the SDK's `SyncStatus` enum: `online`, `syncing`, `error`, `offline`).
- [ ] `connected` state renders as: green dot character (●) followed by "Connected" text in `success` color (ANSI 34).
- [ ] `syncing` state renders as: yellow rotating spinner character (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ braille cycle at 100ms per frame) followed by "Syncing…" in `warning` color (ANSI 178).
- [ ] `conflict` state renders as: yellow triangle (▲) followed by "N conflicts" in `warning` color (ANSI 178), where N is `SyncState.conflictCount`.
- [ ] `disconnected` state renders as: red dot (●) followed by "Disconnected" in `error` color (ANSI 196). When auto-reconnecting, appends "(retry Ns)" where N is the current backoff delay.
- [ ] Sync status updates in real-time as the SSE connection state changes.
- [ ] The spinner animation for `syncing` state uses `useTimeline()` hook and does not cause layout reflow.
- [ ] At minimum terminal width (80 columns), the sync status collapses to icon-only (●, spinner, ▲, or ●) without text labels.

### Right section — notifications and help
- [ ] Unread notification count renders as a bell character (◆) followed by the count number in `primary` color (ANSI 33).
- [ ] When the count is 0, the bell renders in `muted` color (ANSI 245) with no count number shown.
- [ ] When the count exceeds 99, it displays as "99+".
- [ ] The notification count updates in real-time via SSE streaming from the `user_notifications_{userId}` channel.
- [ ] When a new notification arrives (count increases), the notification badge renders in bold for 2 seconds before reverting to normal weight.
- [ ] The `?:help` hint is always the rightmost element in the status bar, rendered in `muted` color.
- [ ] At minimum terminal width (80 columns), the help hint is always visible (it is never truncated).

### Data integration
- [ ] The status bar consumes `useNotifications()` from `@codeplane/ui-core` for unread count and SSE streaming.
- [ ] The status bar consumes sync state from the daemon's sync service (via `SyncState` from `@codeplane/sdk`).
- [ ] The status bar consumes SSE connection health from the `<SSEProvider>` context.
- [ ] The status bar does not make its own API requests; it relies entirely on context providers and shared hooks.

### Resilience
- [ ] If the SSE connection drops, the sync indicator transitions to `disconnected` within 1 second.
- [ ] If the notification count SSE stream fails, the badge retains the last known count and does not reset to 0.
- [ ] If the daemon is unreachable at startup, the sync indicator shows `disconnected` immediately (no loading spinner).
- [ ] The status bar renders correctly even when the auth token is missing or expired (sync shows `disconnected`, notifications show 0).
- [ ] Terminal resize events cause the status bar to re-layout within one render frame with no visual artifacts.
- [ ] The status bar does not crash or throw if provided null, undefined, or unexpected data from hooks.

### Performance
- [ ] Status bar render time is under 1ms (it must not contribute meaningfully to screen transition latency).
- [ ] SSE-driven updates (notification count, sync state) render incrementally without triggering a full content area re-render.
- [ ] The braille spinner animation does not allocate new strings on each frame.

## Design

### Layout structure

The status bar is a single `<box>` with horizontal flex layout, occupying exactly 1 row at the bottom of the global layout:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ j/k:navigate  Enter:open  /:search │  ● Connected  │  ◆ 3  ?:help          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component tree

```jsx
<box
  flexDirection="row"
  height={1}
  width="100%"
  backgroundColor={236}  // surface token
  justifyContent="space-between"
  alignItems="center"
>
  {/* Left: keybinding hints */}
  <box flexDirection="row" flexShrink={1} overflow="hidden">
    {visibleHints.map((hint, i) => (
      <text key={i}>
        <span attributes={BOLD} fg={252}>{hint.key}</span>
        <span fg={245}>:{hint.action}</span>
        {i < visibleHints.length - 1 && <span fg={240}>{"  "}</span>}
      </text>
    ))}
    {truncated && <text fg={240}>{"  …"}</text>}
  </box>

  {/* Center: sync status */}
  <box flexDirection="row" flexShrink={0} justifyContent="center">
    <SyncStatusIndicator />
  </box>

  {/* Right: notifications + help */}
  <box flexDirection="row" flexShrink={0} justifyContent="flex-end" gap={2}>
    <NotificationBadge />
    <text fg={245}>
      <span attributes={BOLD}>?</span>:help
    </text>
  </box>
</box>
```

### SyncStatusIndicator sub-component

Renders one of four states based on `useSyncState()` from `@codeplane/ui-core`:

- **online**: Green dot (●) + "Connected" in `success` color (ANSI 34)
- **syncing**: Braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ at 100ms/frame via `useTimeline()`) + "Syncing…" in `warning` color (ANSI 178)
- **error with conflicts**: Yellow triangle (▲) + "{N} conflicts" in `warning` color (ANSI 178)
- **error/offline**: Red dot (●) + "Disconnected" in `error` color (ANSI 196). Appends "(retry {N}s)" during reconnection.

At compact width (<120 cols), text labels are hidden and only the icon character renders.

### NotificationBadge sub-component

- Renders diamond icon (◆) + unread count in `primary` color (ANSI 33) when count > 0
- Renders diamond icon (◆) in `muted` color (ANSI 245) when count is 0
- Displays "99+" when count exceeds 99
- Applies bold attribute for 2 seconds when count increases (new notification flash)
- Uses `useNotifications()` from `@codeplane/ui-core` for SSE-streamed count

### Keybinding hint registration

Each screen registers hints via `useStatusBarHints()` context hook:

```typescript
interface KeybindingHint {
  key: string;     // e.g., "j/k", "Enter", "/"
  action: string;  // e.g., "navigate", "open", "search"
  priority: number; // Lower = higher priority, shown first
}
```

Hints are sorted by priority. Visible count determined by: `availableWidth = terminalWidth - centerWidth - rightWidth - padding`. Excess hints truncated with trailing "…".

### Go-to mode integration

When `useGoToMode()` reports `active: true`, the left section replaces screen hints with go-to destinations:
`g+d:dashboard  g+i:issues  g+l:landings  g+r:repos  g+w:workspaces  g+n:notifs  g+s:search  g+a:agents  g+o:orgs  g+f:workflows  g+k:wiki`

### Keybindings

The status bar captures no keybindings. It is a passive, read-only display. It reflects state from:
- Normal mode: screen-specific hints
- Go-to mode (`g` prefix): go-to destination hints
- Search active (`/`): search-specific hints
- Overlays (`:`, `?`): status bar remains visible behind modals

### Terminal resize behavior

Subscribes to `useOnResize()` and `useTerminalDimensions()`. Layout recalculates synchronously:

| Width | Left section | Center section | Right section |
|-------|-------------|---------------|---------------|
| 80–119 | 3–4 hints max | Icon only | Badge + ?:help |
| 120–199 | 5–6 hints max | Icon + label | Badge + count + ?:help |
| 200+ | All hints | Icon + label + last sync time | Badge + count + ?:help |

### Data hooks consumed

| Hook | Source | Data |
|------|--------|------|
| `useNotifications()` | `@codeplane/ui-core` | `unreadCount: number` |
| `useSyncState()` | `@codeplane/ui-core` | `SyncState { status, pendingCount, conflictCount, lastSyncAt, error }` |
| `useSSEConnectionState()` | `@codeplane/ui-core` | `{ connected, reconnecting, backoffMs }` |
| `useStatusBarHints()` | local TUI | Registers screen keybinding hints |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useTimeline()` | `@opentui/react` | Spinner animation driver |
| `useGoToMode()` | local TUI | `{ active: boolean }` |

## Permissions & Security

### Authorization
- The status bar requires no specific authorization role. It renders for all authenticated users.
- The notification count is scoped to the authenticated user's own notifications — no cross-user data exposure.
- Sync status reflects the daemon's local state and does not expose server-side authorization details.
- If the auth token is missing or expired, the status bar renders in a degraded state: sync shows "Disconnected", notification count shows 0, keybinding hints still display normally.

### Token-based auth
- The TUI authenticates via a token stored in the CLI keychain (from `codeplane auth login`) or the `CODEPLANE_TOKEN` environment variable.
- The status bar does not handle, store, or display authentication tokens.
- SSE connections for notification streaming use ticket-based auth obtained through the auth API — the status bar does not manage this flow; it consumes the result from the SSE provider.

### Rate limiting
- The notification count SSE stream is a single persistent connection; it does not generate repeated HTTP requests and is not subject to API rate limits.
- The sync state is read from local daemon state and does not make network requests.
- No status bar interaction triggers API calls (the status bar is read-only).

### Data sensitivity
- The status bar displays only aggregate counts (notification count, conflict count) and connection state. It does not display notification content, repository names, or user data.
- No PII is rendered in the status bar.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.status_bar.rendered` | Status bar completes first render | `terminal_width`, `terminal_height`, `sync_status`, `notification_count`, `hints_visible_count`, `hints_total_count` |
| `tui.status_bar.sync_state_changed` | Sync status transitions between states | `from_status`, `to_status`, `conflict_count`, `pending_count` |
| `tui.status_bar.notification_received` | SSE delivers a new notification (count increases) | `previous_count`, `new_count`, `screen` |
| `tui.status_bar.sse_disconnect` | SSE connection drops | `duration_connected_ms`, `screen`, `reconnect_attempt` |
| `tui.status_bar.sse_reconnect` | SSE connection re-established after drop | `disconnect_duration_ms`, `attempts`, `backoff_ms` |
| `tui.status_bar.resize_relayout` | Terminal resize triggers status bar relayout | `old_width`, `new_width`, `old_breakpoint`, `new_breakpoint` |

### Common event properties

All status bar events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Status bar render rate | 100% of sessions | Status bar renders on every session (no crashes, no missing renders) |
| SSE uptime ratio | > 95% of session duration | SSE connection active for at least 95% of the time the TUI is running |
| Reconnect success rate | > 99% | Of SSE disconnects, 99%+ should successfully reconnect |
| Mean reconnect time | < 5 seconds | Average time from disconnect to successful reconnection |
| Resize without artifacts | 100% | All resize events produce a clean re-layout with no visual glitches |

## Observability

### Logging requirements

| Log level | Event | Message format |
|-----------|-------|----------------|
| `debug` | Status bar render | `StatusBar: rendered [width={w}] [hints={n}] [sync={status}] [notifs={count}]` |
| `debug` | Keybinding hints updated | `StatusBar: hints updated [screen={name}] [count={n}]` |
| `info` | Sync state transition | `StatusBar: sync state changed [from={prev}] [to={next}]` |
| `info` | SSE reconnection success | `StatusBar: SSE reconnected [after={duration}ms] [attempts={n}]` |
| `warn` | SSE connection dropped | `StatusBar: SSE disconnected [duration_connected={ms}] [will_retry_in={backoff}ms]` |
| `warn` | Notification count overflow | `StatusBar: notification count exceeds display limit [count={n}] [displayed=99+]` |
| `error` | Hook returned unexpected data | `StatusBar: unexpected hook data [hook={name}] [value={json}]` |
| `error` | Render error caught by boundary | `StatusBar: render error [error={message}]` |

### Error cases specific to TUI

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during SSE reconnection | Status bar re-layouts while reconnection continues in background | Both operations are independent; no coordination needed |
| SSE disconnect during go-to mode | Sync indicator updates to `disconnected`; go-to mode continues normally | No interaction — both are independent state machines |
| Rapid terminal resize (multiple events within 16ms) | Debounce to one re-layout per animation frame | Use OpenTUI's layout batching |
| Auth token expires while TUI is running | Notification SSE fails → badge retains last count; sync shows `disconnected` | User must re-authenticate via CLI; status bar shows degraded state |
| Daemon process crashes | Sync state immediately transitions to `offline` / `disconnected` | Status bar remains rendered; content area may show separate error |
| Zero terminal width or height | Status bar renders empty (no crash) | Application-level "terminal too small" message takes over |
| Non-UTF8 terminal | Braille spinner characters replaced with ASCII fallback (`- \ | /`) | Detect `LANG`/`LC_ALL` environment variable; use ASCII if not UTF-8 |

### Failure modes and recovery

- **Status bar component crash**: Wrapped in its own error boundary. Renders minimal fallback: `[status bar error — press ? for help]` in `error` color. Rest of TUI continues.
- **SSE provider unavailable**: Renders sync as `disconnected` and notifications as 0. No errors thrown.
- **Stale notification count**: If SSE stream silently stops delivering events, notification count may become stale. No periodic polling fallback — SSE provider is responsible for heartbeat detection.

## Verification

### Terminal snapshot tests

```
SNAP-SB-001: Status bar renders at 120x40 with default state
  → Launch TUI at 120x40
  → Assert bottom row matches snapshot: keybinding hints | ● Connected | ◆ ?:help

SNAP-SB-002: Status bar renders at 80x24 minimum size
  → Launch TUI at 80x24
  → Assert bottom row matches snapshot: truncated hints | ● | ◆ ?:help

SNAP-SB-003: Status bar renders at 200x60 large size
  → Launch TUI at 200x60
  → Assert bottom row matches snapshot: all hints visible | ● Connected | ◆ ?:help

SNAP-SB-004: Status bar with unread notifications
  → Launch TUI with 5 unread notifications
  → Assert bottom row contains "◆ 5"

SNAP-SB-005: Status bar with 100+ unread notifications
  → Launch TUI with 150 unread notifications
  → Assert bottom row contains "◆ 99+"

SNAP-SB-006: Status bar with zero notifications
  → Launch TUI with 0 unread notifications
  → Assert notification badge renders in muted color (no count number)

SNAP-SB-007: Status bar with sync status "syncing"
  → Launch TUI with daemon in syncing state
  → Assert center section contains spinning character and "Syncing…" (at 120+ width)

SNAP-SB-008: Status bar with sync status "disconnected"
  → Launch TUI with no daemon connection
  → Assert center section contains red dot and "Disconnected"

SNAP-SB-009: Status bar with sync conflicts
  → Launch TUI with daemon reporting 3 conflicts
  → Assert center section contains "▲ 3 conflicts"

SNAP-SB-010: Status bar background color
  → Launch TUI at 120x40
  → Assert bottom row has surface background color (ANSI 236)
```

### Keyboard interaction tests

```
KEY-SB-001: Go-to mode updates status bar hints
  → Launch TUI on dashboard screen at 120x40
  → Press 'g'
  → Assert bottom row left section now shows go-to destinations (d:dashboard, i:issues, etc.)
  → Press 'Esc'
  → Assert bottom row left section reverts to dashboard-specific hints

KEY-SB-002: Go-to mode completion clears hints
  → Launch TUI on dashboard screen
  → Press 'g' then 'd'
  → Assert bottom row left section shows dashboard-specific hints (go-to mode exited)

KEY-SB-003: Screen navigation updates keybinding hints
  → Launch TUI on dashboard screen at 120x40
  → Note the keybinding hints in the status bar
  → Navigate to issues screen (g i)
  → Assert keybinding hints have changed to issue-specific hints

KEY-SB-004: Help overlay does not hide status bar
  → Launch TUI at 120x40
  → Press '?'
  → Assert status bar is still visible beneath the help overlay

KEY-SB-005: Command palette does not hide status bar
  → Launch TUI at 120x40
  → Press ':'
  → Assert status bar is still visible beneath the command palette overlay

KEY-SB-006: Search mode updates keybinding hints
  → Launch TUI on issue list screen
  → Press '/'
  → Assert keybinding hints update to show search-specific bindings (e.g., "Esc:cancel  Enter:search")
```

### Responsive resize tests

```
RESIZE-SB-001: Resize from 120x40 to 80x24
  → Launch TUI at 120x40
  → Assert full sync status label visible ("● Connected")
  → Resize terminal to 80x24
  → Assert sync status collapsed to icon only ("●")
  → Assert keybinding hints truncated (≤4 visible)

RESIZE-SB-002: Resize from 80x24 to 200x60
  → Launch TUI at 80x24
  → Assert compact status bar
  → Resize terminal to 200x60
  → Assert full status bar with all hints, full sync label, full notification badge

RESIZE-SB-003: Resize from 120x40 to 200x60
  → Launch TUI at 120x40
  → Note hint count
  → Resize terminal to 200x60
  → Assert more keybinding hints are now visible

RESIZE-SB-004: Rapid resize does not cause visual artifacts
  → Launch TUI at 120x40
  → Rapidly resize: 120→80→200→100→150 in quick succession
  → Assert final status bar layout matches expected state for 150-column width
  → Assert no overlapping text or broken box drawing characters

RESIZE-SB-005: Status bar spans full width after resize
  → Launch TUI at 120x40
  → Resize to 80x24
  → Assert status bar width equals terminal width (80 cols)
  → Resize to 200x60
  → Assert status bar width equals terminal width (200 cols)
```

### Real-time update tests

```
RT-SB-001: SSE notification count updates in real-time
  → Launch TUI with 0 unread notifications
  → Trigger server-side notification for the authenticated user
  → Assert notification badge updates to "◆ 1" within 2 seconds

RT-SB-002: SSE disconnect updates sync indicator
  → Launch TUI with active SSE connection showing "● Connected"
  → Terminate the SSE connection server-side
  → Assert sync indicator transitions to "● Disconnected" within 2 seconds

RT-SB-003: SSE reconnect restores sync indicator
  → Launch TUI and establish SSE connection
  → Terminate SSE connection server-side
  → Assert "Disconnected" appears
  → Restore SSE endpoint availability
  → Assert sync indicator transitions back to "● Connected" after auto-reconnect

RT-SB-004: Notification count preserved on SSE disconnect
  → Launch TUI with 5 unread notifications displayed
  → Terminate SSE connection
  → Assert notification badge still shows "◆ 5" (not reset to 0)

RT-SB-005: New notification triggers bold flash
  → Launch TUI with 2 unread notifications
  → Trigger server-side notification
  → Assert notification badge renders with bold attribute within 500ms
  → Wait 2.5 seconds
  → Assert notification badge renders without bold attribute
```

### Edge case tests

```
EDGE-SB-001: Status bar renders without auth token
  → Launch TUI without providing auth token or CODEPLANE_TOKEN
  → Assert status bar renders: hints visible, sync shows "Disconnected", notifications show muted badge (no count)

EDGE-SB-002: Status bar renders on every screen
  → For each screen: Dashboard, Repository list, Issue list, Landing list, Workspaces, Workflows, Search, Notifications, Agents, Settings, Organizations, Wiki
  → Assert bottom row contains status bar content (not blank, not from content area)

EDGE-SB-003: Keybinding hints do not overflow into center section
  → Launch TUI at 80x24 with a screen that registers 10+ keybinding hints
  → Assert keybinding hints are truncated with "…"
  → Assert sync status indicator is still visible and not overlapped

EDGE-SB-004: Status bar handles terminal width exactly 80
  → Launch TUI at exactly 80x24
  → Assert all three sections render without wrapping to a second line
  → Assert no characters are missing or cut off at column 80
```

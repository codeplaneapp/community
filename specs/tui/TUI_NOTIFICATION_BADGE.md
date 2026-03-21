# TUI_NOTIFICATION_BADGE

Specification for TUI_NOTIFICATION_BADGE.

## High-Level User POV

The notification badge is the persistent, real-time unread notification counter that appears in both the header bar and the status bar on every screen of the Codeplane TUI. It is the user's always-on signal that something needs attention — an issue was assigned, a landing request was reviewed, a workflow failed, or a collaborator left a comment — without requiring the user to navigate to the Notifications screen to find out.

The badge appears in two locations, each with its own visual treatment. In the header bar (top row, right side), the badge displays as a bracketed number — `[3]` — rendered in warm yellow (ANSI 178) when there are unread notifications. When all notifications are read and the count is zero, the badge disappears entirely from the header bar, keeping the top row uncluttered. In the status bar (bottom row, right side), the badge takes a different form: a diamond icon (◆) followed by the count number in blue (ANSI 33). When the count is zero, the diamond remains visible but renders in muted gray (ANSI 245) with no number, providing a quiet visual anchor that tells the user "notifications exist as a concept, but there's nothing unread right now."

The badge updates in real-time via Server-Sent Events (SSE). When a new notification arrives — say, a team member assigns an issue to the user — both badges increment within moments. The status bar badge briefly pulses by rendering in bold text for 2 seconds, drawing the user's peripheral attention to the change without interrupting their current task. The header bar badge simply appears or updates its count. This dual-location design means the badge is visible regardless of whether the user is looking at the top or bottom of their terminal.

For high-volume users, the badge caps its display at `99+` rather than showing large numbers like `247` that would consume valuable horizontal space and provide no additional actionable information. The user knows they have "a lot" of unread notifications; the exact count is available on the Notification List screen.

The badge is entirely passive — it does not respond to keypresses, it cannot be focused, and clicking on it (in terminals with mouse support) does nothing. To act on notifications, the user presses `g n` to navigate to the Notification List screen. The badge's job is awareness, not interaction.

When the SSE connection drops (network failure, server restart, token expiration), the badge retains the last known count rather than resetting to zero. This prevents the misleading impression that all notifications have been read. The connection status is indicated separately by the header bar's connection indicator and the status bar's sync status, so the user can distinguish "zero unread" from "disconnected and stale."

At the minimum terminal width (80 columns), both badges remain visible — the header bar badge renders in its compact `[N]` form, and the status bar badge shows the diamond icon with or without a count. Neither badge is ever truncated or hidden due to terminal width constraints. The notification badge is considered essential chrome.

## Acceptance Criteria

### Definition of Done

- [ ] The notification badge renders in the header bar (top row, right section) on every TUI screen
- [ ] The notification badge renders in the status bar (bottom row, right section) on every TUI screen
- [ ] Both badges display the same unread notification count, sourced from the same `useNotifications()` hook
- [ ] Both badges update in real-time when SSE notification events arrive, without any user action
- [ ] Both badges update immediately (same render frame) when the user marks a notification as read or marks all as read
- [ ] The feature is complete when all verification tests pass against a running API server with test fixtures

### Header bar badge behavior

- [ ] Format: `[N]` where N is the unread notification count (e.g., `[3]`, `[42]`, `[99+]`)
- [ ] Color: `warning` color token (ANSI 178 / yellow) when count > 0
- [ ] Hidden: when count is 0, the badge is completely absent — no brackets, no space reservation, no empty `[]`
- [ ] Position: to the right of the connection status indicator (`●` or `○`), separated by a single space
- [ ] Max display: counts exceeding 99 render as `[99+]`; the literal number is never shown beyond 99
- [ ] The badge never wraps to a second line; its maximum rendered width is 6 characters (`[99+]` + leading space)

### Status bar badge behavior

- [ ] Icon: diamond character `◆` (U+25C6)
- [ ] When count > 0: diamond and count in `primary` color (ANSI 33 / blue), e.g., `◆ 3`
- [ ] When count = 0: diamond only in `muted` color (ANSI 245 / gray), no count number displayed
- [ ] Max display: counts exceeding 99 render as `◆ 99+`
- [ ] Bold pulse: when the count increases (new notification arrives), the badge renders with bold text attribute for 2 seconds, then reverts to normal weight
- [ ] The bold pulse triggers only on count increase, not on count decrease (marking read)
- [ ] The badge's maximum rendered width is 6 characters (`◆ 99+`)
- [ ] Position: in the right section of the status bar, to the left of the `?:help` hint

### Real-time updates via SSE

- [ ] Both badges subscribe to the `user_notifications_{userId}` SSE channel via the `<SSEProvider>` context
- [ ] When an SSE event of type `notification` arrives, the unread count is recalculated and both badges re-render
- [ ] SSE replay via `Last-Event-ID` header on reconnection ensures no missed notifications
- [ ] SSE auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, capped at 30s) is handled by the SSE provider, not the badge
- [ ] The badge does not make its own HTTP requests or establish its own SSE connections

### Stale count retention

- [ ] When the SSE connection drops, both badges retain the last known count — they do not reset to 0
- [ ] When the SSE connection is re-established, missed events are replayed and the count is updated
- [ ] If the initial API fetch fails (server unreachable), badges show 0 and update once the connection is established

### Optimistic count updates

- [ ] When the user marks a single notification as read (`r` on the notification list), both badges decrement by 1 immediately
- [ ] When the user marks all notifications as read (`R` on the notification list), both badges update to 0 immediately
- [ ] If the mark-read API call fails, the optimistic update is reverted and both badges return to the previous count

### Terminal size edge cases

- [ ] At 80×24 (minimum): both badges are visible and functional; neither is truncated or hidden
- [ ] At 120×40 (standard): both badges render with full formatting (icon/brackets + count)
- [ ] At 200×60 (large): both badges render identically to standard — no additional information is shown at larger sizes
- [ ] Below 80×24: the "terminal too small" message replaces the entire TUI; badges are not rendered
- [ ] Terminal resize events cause immediate re-render of both badges with no visual artifacts

### Color fallback

- [ ] On 256-color terminals: badges use ANSI 178 (header) and ANSI 33 (status bar) as specified
- [ ] On 16-color terminals: header badge falls back to standard yellow; status bar badge falls back to standard blue; muted falls back to default color
- [ ] On truecolor terminals: semantic color tokens map to their truecolor equivalents

### Boundary constraints

- [ ] Unread count is a non-negative integer; negative values from the API are treated as 0
- [ ] The badge never displays floating point numbers, NaN, or non-numeric text
- [ ] The count string (before capping) supports values up to 2^31 - 1 without overflow or rendering errors
- [ ] If `useNotifications()` returns `undefined` or `null`, the badge renders as 0 (status bar: muted diamond; header bar: hidden)

### Performance

- [ ] Badge render time is under 1ms — it must not contribute to screen transition latency
- [ ] SSE-driven count updates render incrementally without triggering a full content area re-render
- [ ] The 2-second bold pulse timer does not cause re-renders after the bold attribute is removed — it fires exactly twice (bold on, bold off)

## Design

### Layout: Header Bar Badge

The header bar badge is rendered in the right zone of the header bar `<box>`, after the connection status indicator:

```tsx
{/* Right zone of header bar */}
<box flexShrink={0} justifyContent="flex-end">
  <text>
    <span color={connected ? "success" : "error"}>
      {connected ? "●" : "○"}
    </span>
    {unreadCount > 0 && (
      <span color="warning" attributes={undefined}>
        {" "}[{unreadCount > 99 ? "99+" : unreadCount}]
      </span>
    )}
  </text>
</box>
```

Visual states:
```
Connected, 3 unread:     ● [3]
Connected, 0 unread:     ●
Connected, 150 unread:   ● [99+]
Disconnected, 5 unread:  ○ [5]
Disconnected, 0 unread:  ○
```

### Layout: Status Bar Badge

The status bar badge is rendered in the right section of the status bar `<box>`, before the `?:help` hint:

```tsx
{/* NotificationBadge sub-component in status bar right section */}
<box flexShrink={0}>
  {unreadCount > 0 ? (
    <text
      fg={33}
      attributes={isBoldPulseActive ? BOLD : undefined}
    >
      ◆ {unreadCount > 99 ? "99+" : unreadCount}
    </text>
  ) : (
    <text fg={245}>◆</text>
  )}
</box>
```

Visual states:
```
3 unread:     ◆ 3       (blue, primary color)
0 unread:     ◆         (gray, muted color)
150 unread:   ◆ 99+     (blue, primary color)
New arrival:  ◆ 4       (blue, BOLD for 2 seconds)
```

### Bold Pulse Mechanism

The bold pulse is driven by a `useEffect` that watches the unread count:

1. When `unreadCount` increases (current > previous), set `isBoldPulseActive = true`
2. Start a 2-second `setTimeout`
3. After 2 seconds, set `isBoldPulseActive = false`
4. If a new notification arrives during the pulse, reset the 2-second timer
5. The pulse is only tracked in the status bar badge — the header bar badge does not pulse

### Component Tree Context

```
<App>
  <SSEProvider>             ← Manages SSE connections
    <APIClientProvider>     ← Provides API client
      <NavigationProvider>  ← Screen stack
        <HeaderBar>
          ← breadcrumb (left)
          ← repo context (center)
          ← connection indicator + NotificationBadge (right)  ← BADGE LOCATION 1
        </HeaderBar>
        <ContentArea />
        <StatusBar>
          ← keybinding hints (left)
          ← sync status (center)
          ← NotificationBadge + ?:help (right)                ← BADGE LOCATION 2
        </StatusBar>
      </NavigationProvider>
    </APIClientProvider>
  </SSEProvider>
</App>
```

### Keybindings

The notification badge itself registers no keybindings. It is a passive display element. Related keybindings handled elsewhere:

| Key | Handled by | Effect on badge |
|-----|-----------|----------------|
| `g n` | App shell / go-to mode | Navigates to Notifications screen (badge unaffected) |
| `r` | Notification List screen | Decrements badge count by 1 (optimistic) |
| `R` | Notification List screen | Sets badge count to 0 (optimistic) |

### Terminal Resize Behavior

The notification badge subscribes to `useTerminalDimensions()` indirectly through its parent components (header bar and status bar). On resize:

| Width | Header bar badge | Status bar badge |
|-------|-----------------|------------------|
| 80–119 | `[N]` visible, connection indicator visible | `◆` with or without count visible |
| 120–199 | `[N]` visible, full header layout | `◆ N` visible, full status bar layout |
| 200+ | `[N]` visible, comfortable spacing | `◆ N` visible, comfortable spacing |

Neither badge is ever hidden due to width constraints. Both have `flexShrink={0}` and fixed maximum widths (6 characters each), ensuring they are always allocated space in the layout.

### Data Hooks Consumed

| Hook | Source | Data consumed by badge |
|------|--------|----------------------|
| `useNotifications()` | `@codeplane/ui-core` | `unreadCount: number` — the count of unread notifications for the authenticated user |
| `useSSEConnectionState()` | `@codeplane/ui-core` | `{ connected: boolean }` — used by header bar badge to determine connection indicator color (badge itself uses this indirectly) |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` — consumed by parent layout for responsive decisions |

The `useNotifications()` hook:
- On mount: fetches `GET /api/notifications/list?page=1&per_page=1` (or a dedicated count endpoint) to get the initial unread count via `X-Total-Count` header
- Ongoing: subscribes to SSE `GET /api/notifications` channel `user_notifications_{userId}` for real-time count updates
- Exposes `unreadCount` as a reactive value that triggers re-renders in both badge locations
- Handles `Last-Event-ID` replay on reconnection for missed events
- Provides `markRead(id)` and `markAllRead()` methods that optimistically update `unreadCount`

### Visual Specification Table

| Attribute | Header bar badge | Status bar badge |
|-----------|-----------------|------------------|
| Location | Top row, right zone | Bottom row, right zone |
| Icon/prefix | `[` and `]` brackets | `◆` (U+25C6) diamond |
| Color (count > 0) | ANSI 178 (warning/yellow) | ANSI 33 (primary/blue) |
| Color (count = 0) | Hidden entirely | ANSI 245 (muted/gray) |
| Max display | `99+` | `99+` |
| Bold pulse | No | Yes, 2 seconds on count increase |
| Width (fixed) | 0–6 characters | 1–6 characters |
| Interactive | No | No |
| Focus | Never | Never |

## Permissions & Security

### Authorization

- The notification badge requires no specific authorization role beyond being authenticated. All authenticated users (regular users, org members, org admins) see the badge.
- The unread count is scoped exclusively to the authenticated user's own notifications. The API endpoint `GET /api/notifications/list` filters by `user_id` from the auth token. There is no cross-user data exposure.
- The SSE channel `user_notifications_{userId}` is scoped to the authenticated user's ID. The server validates that the authenticated user matches the channel's user ID.
- If no valid auth token is available, `useNotifications()` returns 0 and the SSE connection is not established. The header bar badge is hidden and the status bar badge shows a muted diamond.

### Token-based auth

- The TUI authenticates via a token stored in the CLI keychain (from `codeplane auth login`) or the `CODEPLANE_TOKEN` environment variable.
- The notification badge does not handle, store, or display authentication tokens.
- SSE connections for notification streaming use ticket-based auth obtained through the auth API (`POST /api/auth/sse-ticket`). The badge does not manage this flow; it consumes the result from the `<SSEProvider>` context.
- If the auth token expires during a session, the SSE connection will fail with a 401. The SSE provider handles disconnection. The badge retains its last known count.

### Rate limiting

- The notification SSE stream is a single persistent connection — it does not generate repeated HTTP requests and is not subject to standard API rate limits.
- The initial unread count fetch is a single HTTP request on TUI startup. It is subject to the standard API rate limit but does not contribute meaningfully to rate limit consumption.
- Mark-read actions (`PATCH /api/notifications/:id`, `PUT /api/notifications/mark-read`) are rate-limited by the API server. The badge reflects the optimistic count immediately; rate limit errors (429) cause optimistic revert.
- The badge itself makes no API calls — all data arrives via shared hooks and context providers.

### Data sensitivity

- The badge displays only an aggregate count (a single integer). It does not display notification content, subject text, user names, repository names, or any PII.
- The badge does not log the notification count to disk or telemetry at a frequency that would allow inference of user activity patterns beyond what the telemetry events explicitly capture.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.notification_badge.initial_count` | Badge renders for the first time after TUI launch with a count from the API | `count`, `terminal_width`, `terminal_height`, `color_mode` |
| `tui.notification_badge.sse_update` | SSE event causes unread count to change | `previous_count`, `new_count`, `delta` (+N for new notifications, -N for mark-read events), `screen` (current screen ID) |
| `tui.notification_badge.count_capped` | Count exceeds 99 and badge displays "99+" | `actual_count`, `screen` |
| `tui.notification_badge.bold_pulse` | Bold pulse animation triggered (new notification while TUI is running) | `new_count`, `screen`, `time_since_last_pulse_ms` |
| `tui.notification_badge.stale_retained` | SSE connection drops and badge retains stale count | `stale_count`, `disconnect_duration_ms` |
| `tui.notification_badge.optimistic_revert` | Optimistic mark-read reverted due to API error | `reverted_from`, `reverted_to`, `error_status_code` |

### Common Event Properties

All notification badge events include:

- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Badge render rate | 100% of sessions | Both badges render on every TUI session without crashes |
| SSE freshness | < 2 seconds | Time from server-side notification creation to badge count update |
| Stale count incidents | < 5% of sessions | Percentage of sessions where the badge shows a stale count for > 30 seconds |
| Optimistic revert rate | < 1% of mark-read actions | Percentage of mark-read actions that require optimistic revert |
| Bold pulse visibility | 100% of new notification events | Every new SSE notification triggers a visible bold pulse |
| `g n` navigation correlation | Tracked separately | Users who see badge count > 0 should navigate to notifications at a higher rate than those with count = 0 |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Badge rendered | `NotificationBadge: rendered [count={n}] [header_visible={bool}] [status_visible={bool}]` |
| `debug` | Count updated via SSE | `NotificationBadge: SSE update [previous={n}] [new={n}] [source=sse]` |
| `debug` | Bold pulse triggered | `NotificationBadge: bold pulse start [count={n}] [duration=2000ms]` |
| `debug` | Bold pulse ended | `NotificationBadge: bold pulse end [count={n}]` |
| `info` | Initial count loaded | `NotificationBadge: initial count loaded [count={n}] [source=api]` |
| `info` | Count capped at 99+ | `NotificationBadge: count exceeds display limit [actual={n}] [displayed=99+]` |
| `info` | Optimistic update applied | `NotificationBadge: optimistic update [action={markRead|markAllRead}] [previous={n}] [new={n}]` |
| `warn` | Optimistic update reverted | `NotificationBadge: optimistic revert [action={action}] [reverted_to={n}] [error={message}]` |
| `warn` | SSE connection lost, count stale | `NotificationBadge: SSE disconnected, retaining stale count [count={n}]` |
| `error` | Initial count fetch failed | `NotificationBadge: initial fetch failed [status={code}] [error={message}]` |
| `error` | Hook returned unexpected data | `NotificationBadge: unexpected hook data [value={json}]` |

Log verbosity is controlled by the `CODEPLANE_LOG_LEVEL` environment variable (default: `info`).

### Error Cases Specific to TUI

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| SSE disconnect during active session | Both badges retain last known count. Status bar sync indicator shows "Disconnected". | Automatic. SSE provider reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s). On reconnection, `Last-Event-ID` replay delivers missed events. Badges update to correct count. |
| Terminal resize during bold pulse | Bold pulse timer continues uninterrupted. Badge re-renders at new width with bold attribute still active if within the 2-second window. | Automatic. No special handling needed — resize and pulse are independent. |
| Terminal resize to below 80×24 | "Terminal too small" message replaces entire TUI. Badges are not rendered. Pulse timer (if active) continues in background. | Automatic. Resizing back above 80×24 restores badges. If pulse timer expired during "too small" state, bold attribute is already cleared. |
| Auth token expires during session | SSE connection fails (401). Badges retain last known count. Connection indicator shows disconnected. | User must run `codeplane auth login` externally and restart TUI. Badges remain stale until restart. |
| API returns 500 on initial count fetch | Badges show 0 (header hidden, status bar muted diamond). Error logged. | SSE connection may still succeed and deliver live events. If SSE also fails, auto-retry via backoff. |
| API returns 429 (rate limited) on mark-read | Optimistic count update is reverted. Error logged. | User can retry the action. Badge shows reverted (correct) count. |
| Rapid successive SSE events (burst of notifications) | Each event updates the count. Bold pulse timer resets on each increase. Net effect: badge shows final count and remains bold for 2 seconds after last event. | Automatic. React batching coalesces rapid state updates into minimal re-renders. |
| `useNotifications()` returns `null`/`undefined` | Header badge hidden. Status bar badge shows muted diamond with no count. | Automatic. Badge treats non-numeric values as 0. |
| Concurrent mark-read from another client (web, CLI) | SSE event from server updates the count. Badge reflects the new count from SSE within latency window. | Automatic. SSE is the source of truth for cross-client synchronization. |

### Failure Modes and Recovery

- **Badge component crash**: Each badge is wrapped in its parent component's error boundary (header bar and status bar each have their own). A badge crash does not crash the content area. The parent renders without the badge element.
- **SSE provider unavailable at startup**: Badges render with initial count from API fetch. If both SSE and API fail, badges show 0. No errors thrown to the user.
- **Stale count divergence**: If the SSE stream silently stops delivering events (no disconnect detected), the badge count may drift from the true server count. The SSE provider is responsible for heartbeat detection (15-second keep-alive) and reconnection. The badge has no independent staleness detection.
- **Bold pulse timer leak**: The `setTimeout` for the bold pulse must be cleared on component unmount. If the badge unmounts during a pulse (e.g., "terminal too small"), the timer is cleaned up by the `useEffect` cleanup function.

## Verification

### Test File

All tests for TUI_NOTIFICATION_BADGE are located in `e2e/tui/notifications.test.ts` (for notification-specific badge behavior) and `e2e/tui/app-shell.test.ts` (for badge integration within header/status bar).

### Terminal Snapshot Tests (12 tests)

- **SNAP-NB-001**: Header bar badge renders with unread count at 120x40 — Launch TUI at 120x40 with 3 unread notifications, assert row 0 contains "[3]" in warning color (ANSI 178)
- **SNAP-NB-002**: Header bar badge hidden when count is zero at 120x40 — Launch TUI at 120x40 with 0 unread notifications, assert row 0 does not contain "[" or "]" after connection indicator
- **SNAP-NB-003**: Header bar badge shows 99+ for large counts at 120x40 — Launch TUI at 120x40 with 150 unread notifications, assert row 0 contains "[99+]" and not "[150]"
- **SNAP-NB-004**: Status bar badge renders with unread count at 120x40 — Launch TUI at 120x40 with 5 unread notifications, assert bottom row contains "◆ 5" in primary color (ANSI 33)
- **SNAP-NB-005**: Status bar badge renders muted diamond when count is zero at 120x40 — Launch TUI at 120x40 with 0 unread, assert bottom row contains "◆" in muted color (ANSI 245) and not "◆ 0"
- **SNAP-NB-006**: Status bar badge shows 99+ for large counts at 120x40 — Launch TUI at 120x40 with 200 unread, assert bottom row contains "◆ 99+" and not "◆ 200"
- **SNAP-NB-007**: Header bar badge renders at 80x24 minimum — Launch at 80x24 with 7 unread, assert row 0 contains "[7]" within 80 columns
- **SNAP-NB-008**: Status bar badge renders at 80x24 minimum — Launch at 80x24 with 7 unread, assert bottom row contains "◆ 7" within 80 columns
- **SNAP-NB-009**: Both badges render at 200x60 large terminal — Launch at 200x60 with 42 unread, assert row 0 contains "[42]" and bottom row contains "◆ 42"
- **SNAP-NB-010**: Header bar badge position relative to connection indicator — Launch at 120x40 connected with 3 unread, assert row 0 contains "● [3]"
- **SNAP-NB-011**: Status bar badge position relative to help hint — Launch at 120x40 with 3 unread, assert bottom row has "◆ 3" to the left of "?:help"
- **SNAP-NB-012**: Both badges show consistent count — Launch at 120x40 with 15 unread, assert row 0 contains "[15]" and bottom row contains "◆ 15"

### Keyboard Interaction Tests (7 tests)

- **KEY-NB-001**: Mark single notification read decrements both badges — Navigate to notifications, press r, assert both badges decrement from 5 to 4
- **KEY-NB-002**: Mark all notifications read zeroes both badges — Press R on notification list, assert header hidden and status bar muted
- **KEY-NB-003**: Navigate to notifications with g n (badge remains visible) — Assert badge persists during and after navigation
- **KEY-NB-004**: Badge persists across screen navigations — Navigate g d then g s, assert badges unchanged at 8
- **KEY-NB-005**: Mark read on already-read notification does not change badge — Press r on read notification, assert count unchanged at 3
- **KEY-NB-006**: Rapid r presses on same notification only decrements once — Press r three times rapidly, assert badges show 4 not 2 or 3
- **KEY-NB-007**: Mark all read when already at zero is a no-op — Press R with 0 unread, assert no change

### SSE Real-Time Update Tests (7 tests)

- **SSE-NB-001**: New notification updates both badges in real-time — Trigger server notification, wait 5s, assert both badges show 1
- **SSE-NB-002**: Multiple SSE notifications increment badge correctly — Trigger 3 notifications, assert final count is 5 (2 + 3)
- **SSE-NB-003**: SSE disconnect retains last known count — Terminate SSE, assert both badges still show 5
- **SSE-NB-004**: SSE reconnect updates with missed events — Disconnect, create 2 notifications, reconnect, assert count is 5
- **SSE-NB-005**: Bold pulse on new notification via SSE — Trigger notification, assert bold within 2s, assert not bold after 2.5s
- **SSE-NB-006**: Bold pulse resets on rapid successive notifications — Trigger two notifications 1s apart, assert bold extends from second trigger
- **SSE-NB-007**: Cross-client mark-read updates badge via SSE — Mark read via external API call, assert badge decrements via SSE

### Responsive / Resize Tests (5 tests)

- **RESIZE-NB-001**: Badges adapt when terminal resizes from 120x40 to 80x24 — Assert both badges remain visible after resize
- **RESIZE-NB-002**: Badges adapt when terminal resizes from 80x24 to 200x60 — Assert badges visible at larger size
- **RESIZE-NB-003**: Badges survive rapid resize — Resize 120→80→200→100→150, assert final state correct
- **RESIZE-NB-004**: Badges disappear below minimum terminal size — Resize to 60x20, assert "terminal too small"
- **RESIZE-NB-005**: Badges restore after resize back above minimum — Resize to 60x20 then back to 120x40, assert badges restored

### Edge Case Tests (9 tests)

- **EDGE-NB-001**: Badges render without auth token — Assert header hidden, status bar muted diamond
- **EDGE-NB-002**: Badges render on every screen — Assert badge visible on all 12 screens
- **EDGE-NB-003**: Badge handles count of exactly 99 — Assert "[99]" not "[99+]"
- **EDGE-NB-004**: Badge handles count of exactly 100 — Assert "[99+]"
- **EDGE-NB-005**: Badge handles count of 1 — Assert "[1]" and "◆ 1"
- **EDGE-NB-006**: Optimistic revert on mark-read failure — Server returns 500, assert badges revert from 4 to 5
- **EDGE-NB-007**: Bold pulse does not trigger on mark-read (count decrease) — Assert no bold on status bar after r press
- **EDGE-NB-008**: Badges on all screens during SSE disconnect — Navigate multiple screens, assert stale count retained
- **EDGE-NB-009**: Header bar badge and connection indicator coexist — Assert both fit within 80 columns at 80x24

### Integration Tests (3 tests)

- **INT-NB-001**: Badge integrates with notification list mark-read — Mark 3 read individually, assert badges show 2, navigate back, assert still 2
- **INT-NB-002**: Badge integrates with mark-all-read then new SSE arrival — Mark all read (0), trigger notification (1), assert bold pulse
- **INT-NB-003**: Badge consistent after session with mixed operations — Mark 1 read, trigger 2 SSE, assert final count 4 (3 - 1 + 2)

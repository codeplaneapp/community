# TUI_NOTIFICATION_MARK_READ

Specification for TUI_NOTIFICATION_MARK_READ.

## High-Level User POV

The Mark Read feature gives terminal users immediate, keyboard-driven control over notification read state within the Codeplane TUI notification inbox. It is not a separate screen — it is a set of interactions layered onto the Notification List screen (TUI_NOTIFICATION_LIST_SCREEN) that allow the user to mark individual notifications as read, mark all notifications as read in a single keystroke, and have notifications automatically marked as read when navigating into them.

When a user focuses an unread notification in the list and presses `r`, the notification transitions from unread to read instantly. The visual change is immediate and optimistic: the bold blue unread indicator (●) disappears, the row text weight drops from bold to normal, and the unread count in the title bar ("Notifications (N unread)") decrements by one. If the user has the "Unread" filter active, the notification exits the visible list after a brief 200ms delay, and focus advances to the next row automatically. If the All filter is active, the row remains in place but visually transitions from unread to read styling. The status bar briefly shows a confirmation: "Marked read" in success color. Pressing `r` on a notification that is already read is a silent no-op — no API call, no status bar message, no visual change.

Pressing `R` (Shift+r) marks every unread notification as read in one operation. All unread indicators clear, all bold text becomes normal weight, the title updates to "Notifications (0 unread)", and the status bar badge clears to zero. The status bar shows "All marked read (N)" where N is the count that was marked. If the "Unread" filter is active, the list transitions to the empty state: "No unread notifications. Press f to show all." No confirmation dialog is shown before either action; the design favors speed over ceremony, since mark-read is non-destructive.

The notification badge count in the global status bar and header also update in real-time as notifications are marked read. These counts stay synchronized because they derive from the same in-memory notification state. SSE events arriving while the user is marking notifications read are handled correctly: a new notification that arrives via SSE increments the unread count even if the user just marked all read.

Both actions disable their respective keybinding while a mutation is in-flight to prevent double-fires. If `r` is pressed while a mark-read request is pending, the keypress is silently ignored. If `R` is pressed while a mark-all request is pending, it is similarly ignored. However, `r` and `R` operate independently — a user can press `r` on a single notification while a mark-all-read request is in-flight (the individual mark-read is a no-op in this case since the notification will already be covered by the mark-all).

At all terminal sizes (80×24 through 200×60+), the mark-read interaction behaves identically. The unread indicator column is always visible (it is never hidden by responsive layout). The status bar always shows the `r:read R:all` keybinding hints when the notification list is focused.

## Acceptance Criteria

### Definition of Done
- [ ] Pressing `r` on a focused unread notification row sends `PATCH /api/notifications/:id` (204 No Content expected)
- [ ] Pressing `r` on a focused read notification is a no-op — no API call, no visual change, no status bar message
- [ ] Pressing `R` sends `PUT /api/notifications/mark-read` (204 No Content expected) when at least one unread notification exists in the loaded set
- [ ] Pressing `R` with zero unread notifications is a no-op — no API call, no visual change
- [ ] The unread indicator (`●` blue ANSI 33) is removed from the row immediately on `r` press (optimistic)
- [ ] The row text transitions from bold to normal weight immediately on `r` press (optimistic)
- [ ] The title row unread count decrements by 1 immediately on `r` press (optimistic)
- [ ] On `R`, all unread rows lose their `●` indicator and bold styling simultaneously (optimistic)
- [ ] On `R`, the title row unread count drops to 0 immediately (optimistic)
- [ ] On successful API response (204), the optimistic state is confirmed — no further visual change
- [ ] On API error (404, 429, 500, network error), the optimistic state reverts within one render frame
- [ ] On API error, a status bar notification appears in `error` color (ANSI 196) for 3 seconds
- [ ] The notification badge count in the header bar and status bar updates to reflect the new unread count after both `r` and `R`
- [ ] When the Unread filter is active and `r` is pressed, the marked-read notification is removed from the visible list after 200ms, and focus advances to the next row
- [ ] When the All filter is active and `r` is pressed, the marked-read notification remains in the list with read styling
- [ ] When the Unread filter is active and `R` is pressed, the list transitions to the "No unread notifications. Press f to show all." empty state
- [ ] The `r` key is disabled (no-op) while a mark-read mutation is in-flight for the same notification
- [ ] The `R` key is disabled (no-op) while a mark-all-read mutation is in-flight
- [ ] Mark-read does not push or pop any screen — the user remains on the notification list
- [ ] The feature works identically at all supported terminal sizes (80×24, 120×40, 200×60+)

### Keyboard Interactions
- [ ] `r`: Mark focused unread notification as read (optimistic, no-op if already read)
- [ ] `R`: Mark all notifications as read (optimistic, no-op if 0 unread)
- [ ] Both keys are no-op when their respective mutation is in-flight
- [ ] `r` is no-op when no notification is focused (e.g., empty list, loading state)
- [ ] `r` does not fire while the search input is focused (the character types into the input instead)
- [ ] `R` does not fire while the search input is focused
- [ ] Rapid `r` presses on the same notification: first press marks read, subsequent are no-ops (guard on `status` field check before API call)
- [ ] Rapid `r` presses across different notifications (e.g., `r` `j` `r` `j` `r`): each fires an independent API call
- [ ] `R` while individual `r` requests are in-flight: mark-all supersedes; in-flight `r` responses are accepted but redundant

### Responsive Behavior
- [ ] 80×24 – 119×39: Status bar message truncated to "Read" / "All read (N)" / error reason only
- [ ] 120×40 – 199×59: Status bar message "Marked read" / "All marked read (N)" / "Failed: {reason}"
- [ ] 200×60+: Status bar message "Notification marked as read" / "All N notifications marked as read" / "Failed to mark read: {reason}"
- [ ] Unread indicator column (2ch) is always visible at every breakpoint

### Truncation & Boundary Constraints
- [ ] Status bar success message total length capped at terminal width minus 20 characters
- [ ] Error reason strings truncated at 40 characters with `…`
- [ ] Unread count in title: abbreviated above 9999 ("9999+")
- [ ] `Retry-After` value for 429 displayed as integer seconds
- [ ] Notification IDs are opaque integers — no display constraint beyond API usage

### Edge Cases
- [ ] Terminal resize during in-flight mark-read: mutation continues, status bar message re-renders at new width
- [ ] SSE disconnect during mutation: mutation uses HTTP (not SSE), unaffected
- [ ] SSE notification arrives immediately after `R` (mark all read): new notification appears as unread, count goes to 1
- [ ] Mark read 404 (notification deleted server-side): optimistic reverts, row removed from list entirely (treat as server-side deletion)
- [ ] Mark read 429 (rate limited): optimistic reverts, status bar shows "Rate limited. Retry in {N}s."
- [ ] Mark all read failure (server 500): all optimistic changes revert — all previously-unread notifications restore their `●` indicator, bold text, and unread count
- [ ] Rapid `r` presses on the same notification (10+ in < 1 second): only the first triggers an API call
- [ ] `r` on notification with null `source_id`: mark-read still works (source_id is irrelevant to read status)
- [ ] Network timeout (> 10 seconds): optimistic reverts, status bar shows "Network error"
- [ ] User navigates away (`q`) while mark-read is in-flight: mutation completes in background, badge updates on return
- [ ] Mark all read with large unread count (500): single `PUT` request, all rows update simultaneously
- [ ] Concurrent `r` and SSE event for the same notification: deduplication by notification ID, final state is read
- [ ] Filter switch from All to Unread while `r` in-flight: if the notification becomes read before the filter applies, it is excluded from the filtered view

## Design

### Layout — Mark-Read Interaction on Notification List

The `r` keybinding operates on the currently focused notification row. The visual change affects the unread indicator column (2ch), the text weight, and the title row count.

```
Before (unread notification focused):
┌──────────────────────────────────────────────────────────┐
│ Notifications (3 unread)                                 │
├──────────────────────────────────────────────────────────┤
│ ● 🔔 Fix login timeout assigned to you        [bug]  3m │  ← focused (reverse video)
│ ● 💬 Review requested on LR #42                      1h │
│ ● ⚙️  Workflow "CI" failed on main                   2h │
│   🔔 Issue #97 closed by bob                         1d │
├──────────────────────────────────────────────────────────┤
│ Marked read                j/k:nav r:read R:all q:back   │
└──────────────────────────────────────────────────────────┘

After pressing r (optimistic):
┌──────────────────────────────────────────────────────────┐
│ Notifications (2 unread)                                 │
├──────────────────────────────────────────────────────────┤
│   🔔 Fix login timeout assigned to you        [bug]  3m │  ← focused (reverse video, no bold)
│ ● 💬 Review requested on LR #42                      1h │
│ ● ⚙️  Workflow "CI" failed on main                   2h │
│   🔔 Issue #97 closed by bob                         1d │
├──────────────────────────────────────────────────────────┤
│ Marked read                j/k:nav r:read R:all q:back   │
└──────────────────────────────────────────────────────────┘
```

### Layout — Mark All Read

```
Before (3 unread notifications):
┌──────────────────────────────────────────────────────────┐
│ Notifications (3 unread)                                 │
├──────────────────────────────────────────────────────────┤
│ ● 🔔 Fix login timeout assigned to you        [bug]  3m │
│ ● 💬 Review requested on LR #42                      1h │
│ ● ⚙️  Workflow "CI" failed on main                   2h │
│   🔔 Issue #97 closed by bob                         1d │
├──────────────────────────────────────────────────────────┤
│ All marked read (3)        j/k:nav r:read R:all q:back   │
└──────────────────────────────────────────────────────────┘

After pressing R (optimistic):
┌──────────────────────────────────────────────────────────┐
│ Notifications (0 unread)                                 │
├──────────────────────────────────────────────────────────┤
│   🔔 Fix login timeout assigned to you        [bug]  3m │
│   💬 Review requested on LR #42                      1h │
│   ⚙️  Workflow "CI" failed on main                   2h │
│   🔔 Issue #97 closed by bob                         1d │
├──────────────────────────────────────────────────────────┤
│ All marked read (3)        j/k:nav r:read R:all q:back   │
└──────────────────────────────────────────────────────────┘
```

### Layout — Unread Filter Active + Mark Read

```
Before (Unread filter, 2 unread):
┌──────────────────────────────────────────────────────────┐
│ Notifications (2 unread)       Filter: Unread            │
├──────────────────────────────────────────────────────────┤
│ ● 🔔 Fix login timeout assigned to you        [bug]  3m │  ← focused
│ ● 💬 Review requested on LR #42                      1h │
├──────────────────────────────────────────────────────────┤
│ Marked read                j/k:nav r:read R:all q:back   │
└──────────────────────────────────────────────────────────┘

After pressing r (optimistic, 200ms later):
┌──────────────────────────────────────────────────────────┐
│ Notifications (1 unread)       Filter: Unread            │
├──────────────────────────────────────────────────────────┤
│ ● 💬 Review requested on LR #42                      1h │  ← focus advances
├──────────────────────────────────────────────────────────┤
│ Marked read                j/k:nav r:read R:all q:back   │
└──────────────────────────────────────────────────────────┘
```

### Component Tree

Mark-read does not introduce new top-level components. It modifies existing elements rendered by `TUI_NOTIFICATION_LIST_SCREEN`:

```tsx
{/* Within NotificationRow — unread indicator reacts to status */}
<text width={2} color="primary">
  {notif.status === "unread" ? "●" : " "}
</text>

{/* Subject text — bold reacts to status */}
<text bold={notif.status === "unread"} flexShrink={1} width={subjectWidth}>
  {truncate(notif.subject, subjectWidth)}
</text>

{/* Title row — unread count reacts to state */}
<box flexDirection="row" height={1}>
  <text bold color="primary">Notifications</text>
  <text color="muted"> ({unreadCount} unread)</text>
</box>

{/* Status bar — transient confirmation message */}
<text color={statusMessage.type === "success" ? "success" : "error"}>
  {statusMessage.text}
</text>
```

### Components Used
- `<text>` — Unread indicator (`●`), status bar messages, title row unread count, row text with conditional bold
- `<box>` — Row containers (existing from notification list)
- `<scrollbox>` — Parent list container (existing from notification list)

No additional components are introduced.

### Keybindings

| Key | Action | Condition |
|-----|--------|-----------||
| `r` | Mark focused notification as read | Notification focused, unread, list focused (not search input), no mark-read in-flight for this notification |
| `R` | Mark all notifications as read | List focused (not search input), at least 1 unread notification, no mark-all in-flight |

### Responsive Behavior

| Terminal Size | Status Bar Message (success) | Status Bar Message (error) |
|--------------|-----------------------------|-----------------------------||
| 80×24 | `"Read"` / `"All read (N)"` | `"Error: {reason}"` (truncated) |
| 120×40 | `"Marked read"` / `"All marked read (N)"` | `"Failed: {reason}"` |
| 200×60+ | `"Notification marked as read"` / `"All N notifications marked as read"` | `"Failed to mark read: {reason}"` |

Resize during mutation: layout recalculates synchronously, status bar message adapts to new width, mutation continues unaffected. Focus index is preserved across resize.

### Data Hooks Consumed

| Hook | Source | Usage |
|------|--------|-------|
| `useNotifications()` | `@codeplane/ui-core` | Provides notification list state; `.items[n].status` updated optimistically on `r`; all items updated on `R` |
| `useMarkNotificationRead(id)` | `@codeplane/ui-core` | `mutate()` → `PATCH /api/notifications/:id` (204 No Content) |
| `useMarkAllNotificationsRead()` | `@codeplane/ui-core` | `mutate()` → `PUT /api/notifications/mark-read` (204 No Content) |
| `useNotificationStream()` | `@codeplane/ui-core` | SSE stream for new notifications; new arrivals after `R` appear as unread |
| `useKeyboard()` | `@opentui/react` | Registers `r` and `R` handlers with in-flight guards and focus-context checks |
| `useTerminalDimensions()` | `@opentui/react` | Current terminal width for status bar message length adaptation |
| `useStatusBarHints()` | local TUI | Updates hint text; shows transient confirmation/error messages |

### API Endpoints Consumed

| Method | Path | Body | Response | Usage |
|--------|------|------|----------|-------|
| `PATCH` | `/api/notifications/:id` | (empty) | `204 No Content` | Mark single notification as read |
| `PUT` | `/api/notifications/mark-read` | (empty) | `204 No Content` | Mark all notifications as read |

### Navigation

Mark-read does not push or pop any screen. The user remains on the notification list after both `r` and `R` actions.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated |
|--------|-----------|---------------|
| Mark single notification read | ❌ | ✅ (own notifications only) |
| Mark all notifications read | ❌ | ✅ (own notifications only) |

- Both endpoints are user-scoped: a user can only mark their own notifications as read. The server enforces this via the `user_id` associated with the auth token.
- There is no admin or organization-level notification access. No user can mark another user's notifications.
- There is no permission hierarchy beyond "authenticated" — any authenticated user can mark their own notifications.
- Attempting to mark another user's notification returns 404 (not 403), preventing information leakage about notification existence.

### Token-Based Auth

- The auth token is injected by the `<APIClientProvider>` at the application root. The mark-read feature does not handle tokens directly.
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at startup.
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client.
- A 401 response during mark-read propagates to the global auth error handler: "Session expired. Run `codeplane auth login` to re-authenticate." The optimistic state reverts before the auth error screen is shown.
- The token is never included in log messages, status bar text, or telemetry events.
- SSE ticket-based auth is managed by the SSE context provider, not by mark-read directly.

### Rate Limiting

| Endpoint | Limit | Notes |
|----------|-------|-------|
| `PATCH /api/notifications/:id` | 120 req/min | Mark-read is frequent during triage sessions |
| `PUT /api/notifications/mark-read` | 30 req/min | Mark-all is rare (once per inbox visit) |

- The in-flight guard provides natural rate limiting — at most 1 mark-read and 1 mark-all request in-flight at a time.
- A 429 response triggers optimistic revert and a status bar message: "Rate limited. Retry in {Retry-After}s."
- The TUI does not auto-retry 429s. The user must wait and press `r`/`R` again.
- Mark-read actions that are rate-limited revert their optimistic update immediately.

### Input Sanitization

- `PATCH /api/notifications/:id`: the `:id` parameter is an integer derived from the notification data model. No user-controlled free text is sent.
- `PUT /api/notifications/mark-read`: no request body. The server derives the user from the auth token.
- No injection vector exists for either endpoint.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.notifications.mark_read` | User presses `r` on an unread notification | `notification_id`, `source_type`, `source_id`, `position_in_list`, `filter_active` ("all" \| "unread"), `had_search`, `success` (boolean), `duration_ms`, `was_optimistic_revert` (boolean), `error_type` (if failed) |
| `tui.notifications.mark_all_read` | User presses `R` to mark all as read | `unread_count_before`, `total_loaded_count`, `filter_active`, `had_search`, `success` (boolean), `duration_ms`, `was_optimistic_revert` (boolean), `error_type` (if failed) |
| `tui.notifications.mark_read.error` | API returns an error for mark-read | `notification_id` (single) or `null` (all), `http_status`, `error_type` ("not_found" \| "rate_limited" \| "server_error" \| "network_error" \| "timeout" \| "auth_expired"), `action` ("single" \| "all") |
| `tui.notifications.mark_read.noop` | `r` pressed on already-read notification or `R` with 0 unread | `action` ("single" \| "all"), `reason` ("already_read" \| "none_unread" \| "in_flight" \| "search_focused") |
| `tui.notifications.mark_read.ignored` | `r`/`R` pressed while mutation is in-flight | `action` ("single" \| "all"), `notification_id` (if single) |
| `tui.notifications.badge_update` | Badge count changes due to mark-read | `old_count`, `new_count`, `trigger` ("mark_single" \| "mark_all") |

### Common Properties (all events)

- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `breakpoint`: `"minimum"` | `"standard"` | `"large"`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Mark-read success rate | > 98% | At least 98% of mark-read attempts succeed without optimistic revert |
| Mark-all success rate | > 99% | Mark-all failures are exceptionally rare |
| Optimistic revert rate | < 2% | Less than 2% of mark-read actions require revert |
| Mean mark-read round-trip | < 300ms | Average time from `r` keypress to server confirmation |
| Mean mark-all round-trip | < 500ms | Average time from `R` keypress to server confirmation |
| Noop rate (r on read) | < 15% | Low noop rate indicates users can distinguish read/unread |
| Mark-all adoption | > 15% of notification views | Users discover and use `R` |
| Mark-then-triage pattern | > 40% | Users who mark read also navigate to at least one source resource |
| Badge accuracy | 100% | Badge count always matches actual unread count after mark-read |
| Rate limit hit rate | < 1% | Rate limits are rarely reached during normal triage |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Mark-read initiated | `NotificationMarkRead: initiated [id={id}] [source_type={type}]` |
| `debug` | Mark-all initiated | `NotificationMarkRead: mark-all initiated [unread_count={n}]` |
| `debug` | Optimistic state applied (single) | `NotificationMarkRead: optimistic applied [id={id}]` |
| `debug` | Optimistic state applied (all) | `NotificationMarkRead: optimistic applied [count={n}]` |
| `debug` | Keypress ignored (in-flight) | `NotificationMarkRead: ignored [action={r|R}] [reason=in_flight]` |
| `debug` | Keypress ignored (already read) | `NotificationMarkRead: noop [id={id}] [reason=already_read]` |
| `debug` | Keypress ignored (none unread) | `NotificationMarkRead: noop [action=R] [reason=none_unread]` |
| `debug` | Keypress ignored (search focused) | `NotificationMarkRead: noop [action={r|R}] [reason=search_focused]` |
| `info` | Mark-read succeeded | `NotificationMarkRead: success [id={id}] [duration={ms}ms]` |
| `info` | Mark-all succeeded | `NotificationMarkRead: mark-all success [count={n}] [duration={ms}ms]` |
| `info` | Status bar message shown | `NotificationMarkRead: status [message={text}] [color={success|error}]` |
| `info` | Badge count updated | `NotificationMarkRead: badge [old={n}] [new={n}]` |
| `warn` | Mark-read failed (client-recoverable) | `NotificationMarkRead: failed [id={id}] [http_status={code}] [error={msg}] [duration={ms}ms]` |
| `warn` | Mark-all failed | `NotificationMarkRead: mark-all failed [http_status={code}] [error={msg}] [duration={ms}ms]` |
| `warn` | Optimistic revert (single) | `NotificationMarkRead: reverted [id={id}] [reason={msg}]` |
| `warn` | Optimistic revert (all) | `NotificationMarkRead: reverted-all [count={n}] [reason={msg}]` |
| `warn` | Rate limited | `NotificationMarkRead: rate limited [action={r|R}] [retry_after={s}]` |
| `error` | Auth error | `NotificationMarkRead: auth error [status=401]` |
| `error` | Unexpected error (non-HTTP) | `NotificationMarkRead: unexpected error [action={r|R}] [error={msg}] [stack={trace}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Terminal resize during in-flight `r` | `useOnResize` fires while PATCH in-flight | Mutation continues; status bar message re-renders at new width on completion | Automatic |
| Terminal resize during in-flight `R` | `useOnResize` fires while PUT in-flight | Mutation continues; all optimistic changes preserved during resize | Automatic |
| SSE disconnect during mark-read | SSE `error`/`close` event | No impact — mark-read uses HTTP, not SSE | N/A |
| SSE notification arrives during `R` | New notification inserted while mark-all in-flight | New notification is unread (server-side, it wasn't included in mark-all); count becomes 1 | Correct behavior; no action needed |
| Auth expiry during mark-read | 401 from PATCH or PUT | Optimistic reverts, then auth error screen pushed | Re-auth via CLI (`codeplane auth login`) |
| Network timeout (> 10s) | Fetch promise timeout | Optimistic reverts; status bar shows "Network error" | User presses `r`/`R` again |
| Mark-read 404 (notification deleted) | PATCH returns 404 | Optimistic reverts; notification row removed from list entirely | Server-side deletion; removal is correct |
| Mark-read 429 (rate limited) | PATCH/PUT returns 429 | Optimistic reverts; status bar shows "Rate limited. Retry in {N}s." | User waits and retries |
| Mark-all failure (500) | PUT returns 500 | All optimistic changes revert — every previously-unread notification restores `●` indicator, bold text, and unread count | Status bar error; user retries |
| Rapid `r` presses on same notification | Multiple `r` within < 100ms on same row | First press fires API call; subsequent are no-ops (client-side `status` check) | Client-side guard |
| User quits (`Ctrl+C`) during mark-read | TUI exit signal during in-flight mutation | Mutation may or may not reach server; no guarantee | User checks via CLI or web UI |
| User pops screen (`q`) during mark-read | Navigation during in-flight mutation | Mutation completes in background; badge updates reflect result | State is correct on next visit |
| Filter switch during in-flight `r` | User presses `f` while PATCH in-flight | Filter applies based on current optimistic state | Correct optimistic behavior |

### Failure Modes and Recovery

1. **Optimistic revert on single mark-read**: If the server returns an error for `r`, the notification's `●` indicator, bold text, and unread count are restored within one render frame.
2. **Optimistic revert on mark-all**: If `R` fails, all previously-unread notifications revert simultaneously in a single render frame.
3. **Repeated failure pattern**: After 3 consecutive mark-read failures (same notification), the status bar message adds "Check server status." to hint at a systemic issue.
4. **Stale cache reconciliation**: When the notification list re-fetches (e.g., on page navigation or screen re-entry), server data overwrites optimistic state.
5. **Memory**: Each in-flight mutation stores the previous read/unread status. Mark-all stores a set of IDs that were unread. Memory is released on mutation completion.
6. **Component crash**: Falls through to global error boundary → "Press r to restart".

## Verification

### Test File: `e2e/tui/notifications.test.ts`

Tests use `@microsoft/tui-test` for terminal snapshot matching, keyboard interaction simulation, and text assertions. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### Terminal Snapshot Tests (15 tests)

- SNAP-MARKREAD-001: Notification list with mixed read/unread before any mark-read action — unread rows show `●` and bold, read rows show blank and normal weight (120×40)
- SNAP-MARKREAD-002: Notification list after pressing `r` on focused unread notification — `●` removed, bold removed, count decremented (120×40)
- SNAP-MARKREAD-003: Notification list after pressing `R` — all `●` removed, all text normal weight, count shows 0 (120×40)
- SNAP-MARKREAD-004: Status bar showing "Marked read" success message in green (120×40)
- SNAP-MARKREAD-005: Status bar showing "All marked read (3)" success message in green (120×40)
- SNAP-MARKREAD-006: Status bar showing error message after failed mark-read (403/404/500) in red (120×40)
- SNAP-MARKREAD-007: Notification list with Unread filter active after `r` — marked notification removed, focus advanced (120×40)
- SNAP-MARKREAD-008: Notification list with Unread filter active after `R` — "No unread notifications. Press f to show all." empty state (120×40)
- SNAP-MARKREAD-009: Mark-read at 80×24 — truncated status bar message "Read" (80×24)
- SNAP-MARKREAD-010: Mark-all at 80×24 — truncated status bar message "All read (3)" (80×24)
- SNAP-MARKREAD-011: Mark-read at 200×60 — extended status bar message "Notification marked as read" (200×60)
- SNAP-MARKREAD-012: Mark-all at 200×60 — extended status bar message "All 3 notifications marked as read" (200×60)
- SNAP-MARKREAD-013: Optimistic revert after error — `●` reappears, bold restored, count restored (120×40)
- SNAP-MARKREAD-014: Badge count in header/status bar after mark-read — count decremented (120×40)
- SNAP-MARKREAD-015: Badge count in header/status bar after mark-all — count shows 0 (120×40)

### Keyboard Interaction Tests (25 tests)

- KEY-MARKREAD-001: `r` on unread notification marks it as read — `●` removed, bold removed
- KEY-MARKREAD-002: `r` on already-read notification is no-op — no visual change, no API call
- KEY-MARKREAD-003: `r` updates title unread count by −1
- KEY-MARKREAD-004: `R` marks all notifications as read — all `●` removed, all bold removed
- KEY-MARKREAD-005: `R` updates title unread count to 0
- KEY-MARKREAD-006: `R` with 0 unread is no-op — no API call, no status bar message
- KEY-MARKREAD-007: `r` on unread with Unread filter active — notification removed from list, focus advances to next row
- KEY-MARKREAD-008: `r` on last unread with Unread filter active — notification removed, empty state shown
- KEY-MARKREAD-009: `r` on unread with All filter active — notification stays in list with read styling
- KEY-MARKREAD-010: `R` with Unread filter active — empty state "No unread notifications. Press f to show all."
- KEY-MARKREAD-011: Rapid `r` presses on same notification (5×) — only first triggers API call
- KEY-MARKREAD-012: Rapid `r` across rows (`r` `j` `r` `j` `r`) — each `r` fires independent API call, all 3 notifications marked read
- KEY-MARKREAD-013: `R` while individual `r` is in-flight — mark-all fires, in-flight `r` completes redundantly
- KEY-MARKREAD-014: `r` while `R` is in-flight — `r` is no-op (notification already optimistically read)
- KEY-MARKREAD-015: `r` does not fire when search input is focused — character `r` types into input
- KEY-MARKREAD-016: `R` does not fire when search input is focused — character `R` types into input
- KEY-MARKREAD-017: `r` is no-op on empty list (no notifications)
- KEY-MARKREAD-018: `r` is no-op during loading state
- KEY-MARKREAD-019: `r` then `q` immediately — screen pops, mutation completes in background
- KEY-MARKREAD-020: `r` then `f` (toggle to Unread filter) — marked notification excluded from filtered view
- KEY-MARKREAD-021: `R` then `f` (toggle to Unread filter) — empty state shown
- KEY-MARKREAD-022: `r` followed by `Enter` on same notification — notification opens (detail nav) and is already marked read
- KEY-MARKREAD-023: `r` on notification at bottom of scrolled list — scroll position preserved
- KEY-MARKREAD-024: `R` status bar shows "All marked read (N)" with correct N matching previous unread count
- KEY-MARKREAD-025: `r` preserves focus position — focused row index unchanged after mark-read

### Responsive Tests (8 tests)

- RESP-MARKREAD-001: `r` at 80×24 — truncated status bar "Read"
- RESP-MARKREAD-002: `R` at 80×24 — truncated status bar "All read (N)"
- RESP-MARKREAD-003: `r` at 120×40 — status bar "Marked read"
- RESP-MARKREAD-004: `R` at 120×40 — status bar "All marked read (N)"
- RESP-MARKREAD-005: `r` at 200×60 — status bar "Notification marked as read"
- RESP-MARKREAD-006: `R` at 200×60 — status bar "All N notifications marked as read"
- RESP-MARKREAD-007: Resize from 120×40 to 80×24 during in-flight `r` — status bar adapts to new width
- RESP-MARKREAD-008: Resize from 80×24 to 200×60 while status bar message displayed — message re-renders at expanded width

### Integration Tests (15 tests)

- INT-MARKREAD-001: `r` sends `PATCH /api/notifications/:id` and receives 204
- INT-MARKREAD-002: `R` sends `PUT /api/notifications/mark-read` and receives 204
- INT-MARKREAD-003: After `r`, re-fetching notification list shows notification as read on server
- INT-MARKREAD-004: After `R`, re-fetching notification list shows all notifications as read on server
- INT-MARKREAD-005: `r` with 404 response — optimistic reverts, row removed from list
- INT-MARKREAD-006: `r` with 429 response — optimistic reverts, status bar shows rate limit message with Retry-After
- INT-MARKREAD-007: `r` with 500 response — optimistic reverts, status bar shows "Server error"
- INT-MARKREAD-008: `R` with 500 response — all optimistic changes revert (all `●` restored, all bold restored, count restored)
- INT-MARKREAD-009: 401 during `r` — optimistic reverts, auth error screen shown
- INT-MARKREAD-010: Network timeout (>10s) during `r` — optimistic reverts, status bar shows "Network error"
- INT-MARKREAD-011: SSE notification arrives after `R` — new notification appears as unread, count goes to 1
- INT-MARKREAD-012: Navigate away (`q`) during in-flight `r`, return to notifications — notification reflects server state (read)
- INT-MARKREAD-013: `r` on notification, then navigate to its source via Enter — source screen renders (notification was marked read)
- INT-MARKREAD-014: Badge count in header decrements after `r`, drops to 0 after `R`
- INT-MARKREAD-015: Mark-read idempotency — pressing `r` on same notification after server confirms read is no-op

### Edge Case Tests (12 tests)

- EDGE-MARKREAD-001: Rapid `r` presses on same notification (10× in < 1 second) — only first triggers API call
- EDGE-MARKREAD-002: `r` `j` `r` `j` `r` `j` `r` `j` `r` — 5 independent mark-read API calls, all succeed
- EDGE-MARKREAD-003: `R` with 500 loaded notifications, 300 unread — single PUT, all 300 revert on error
- EDGE-MARKREAD-004: SSE notification arrives during in-flight `R` — new notification is unread (not included in mark-all)
- EDGE-MARKREAD-005: `r` on notification with null source_id — mark-read succeeds normally
- EDGE-MARKREAD-006: Terminal resize during optimistic revert — layout recalculates, revert applies correctly
- EDGE-MARKREAD-007: `r` while `R` optimistic revert is in progress — no-op (notification already reverting to unread)
- EDGE-MARKREAD-008: Concurrent `r` on two different notifications — both in-flight simultaneously, both resolve independently
- EDGE-MARKREAD-009: `R` followed by immediate `r` `j` `r` `j` `r` — `R` in-flight, individual `r` presses are no-ops (already optimistically read)
- EDGE-MARKREAD-010: Error message auto-dismisses after 3 seconds — status bar returns to keybinding hints
- EDGE-MARKREAD-011: `r` on notification at focus index 0 with Unread filter — notification removed, new index 0 focused (or empty state if last)
- EDGE-MARKREAD-012: Mark all with search text active — only visible (filtered) notifications show visual change, but server marks ALL user notifications read; clearing search shows all as read

All 75 tests left failing if backend is unimplemented — never skipped or commented out.

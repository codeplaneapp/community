# TUI_NOTIFICATION_LIST_SCREEN

Specification for TUI_NOTIFICATION_LIST_SCREEN.

## High-Level User POV

The Notification List screen is the primary notification inbox in the Codeplane TUI. It presents a full-screen, scrollable list of all notifications for the authenticated user, designed for developers who need to stay on top of repository activity — issue assignments, landing request reviews, workflow completions, workspace status changes, and @mentions — without leaving the terminal. The screen is reached via the `g n` go-to keybinding from any screen, by typing `:notifications` in the command palette, or by launching the TUI with `codeplane tui --screen notifications`. Unlike issue or landing screens, the notification list does not require a repository context — it is a global, user-scoped inbox.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Notifications" in bold primary color, followed by the unread count in parentheses (e.g., "Notifications (7 unread)"). Below the title is a filter toolbar displaying the current status filter ("All", "Unread") and a search input for client-side substring filtering across notification subjects and bodies.

The main content area is a scrollable list of notification rows. Each row occupies a single line and shows: an unread indicator (● blue dot for unread, blank for read), a source type icon (issue, landing request, workflow, workspace, or comment), the notification subject (truncated to fit), the notification body preview (muted text, truncated), and a relative timestamp. Unread notifications render with bold text to visually distinguish them from read notifications. Navigation uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused notification navigates to the source resource (e.g., the issue, landing request, or workflow run that triggered it) — this delegates to the `TUI_NOTIFICATION_DETAIL_NAV` feature. Pressing `r` marks the focused notification as read (optimistic), and `R` (shift+r) marks all notifications as read. The notification badge in the status bar and header updates in real-time as notifications arrive via SSE and as the user marks items read.

The list supports page-based pagination (page size 30, max 50 per page, 500-item memory cap). New notifications arriving via SSE are prepended to the top of the list with a brief highlight animation (reverse video flash for one render cycle). The screen adapts responsively: at 80×24 only the unread indicator, subject, and timestamp are shown; at 120×40 the source type icon and body preview appear; at 200×60+ the full column set including source details renders with generous spacing.

## Acceptance Criteria

### Definition of Done
- [ ] The Notification List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g n` go-to navigation (no repo context required), `:notifications` command palette entry, and `--screen notifications` deep-link
- [ ] The breadcrumb reads "Dashboard > Notifications"
- [ ] Pressing `q` pops the screen and returns to the previous screen
- [ ] Notifications are fetched via `useNotifications()` from `@codeplane/ui-core`, calling `GET /api/notifications/list` with page-based pagination (default page size 30)
- [ ] The list defaults to showing all notifications sorted by `created_at` descending (newest first)
- [ ] Each row displays: unread indicator (● blue for unread), source type icon, subject, body preview (muted), and relative timestamp
- [ ] Unread notifications render with bold text; read notifications render with normal weight
- [ ] The header shows "Notifications (N unread)" where N is derived from the loaded notification data
- [ ] The filter toolbar is always visible below the title row
- [ ] Status filter changes between "All" and "Unread" re-filter the loaded notifications client-side

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next notification row
- [ ] `k` / `Up`: Move focus to previous notification row
- [ ] `Enter`: Navigate to notification source (push appropriate detail view based on `source_type`)
- [ ] `/`: Focus search input in filter toolbar
- [ ] `Esc`: Close overlay; or clear search; or pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded notification row
- [ ] `g g`: Jump to first notification row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `r`: Mark focused notification as read (optimistic, no-op if already read)
- [ ] `R`: Mark all notifications as read (optimistic, confirmation not required)
- [ ] `f`: Toggle status filter (All → Unread → All)
- [ ] `q`: Pop screen (return to previous screen)
- [ ] `Space`: Toggle row selection (multi-select for future batch operations)

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Unread indicator (2ch), subject (remaining minus timestamp, truncated), timestamp (4ch). Source type icon and body preview hidden. Toolbar: filter + search only
- [ ] 120×40 – 199×59: Unread indicator (2ch), source icon (3ch), subject (40ch), body preview (remaining minus timestamp, truncated with `…`), timestamp (4ch). Full toolbar
- [ ] 200×60+: Unread indicator (2ch), source icon (3ch), subject (55ch), body preview (remaining minus timestamp), timestamp (6ch with "3d ago" format). Full column set with generous spacing

### Truncation & Boundary Constraints
- [ ] Notification subject: truncated with `…` at column width (remaining/40ch/55ch depending on breakpoint)
- [ ] Body preview: truncated with `…` at available remaining width after subject and timestamp
- [ ] Source type icon: single character with fixed 3ch width — `🔔` issue, `🚀` landing, `⚙️` workflow, `🖥` workspace, `💬` comment (fallback: text abbreviations `[I]`, `[L]`, `[W]`, `[S]`, `[C]` for terminals without emoji)
- [ ] Timestamps: max 4ch standard ("3d", "1w", "2mo", "1y", "now"), 6ch large ("3d ago")
- [ ] Search input: max 120ch
- [ ] Memory cap: 500 notifications max loaded
- [ ] Unread count: abbreviated above 9999 ("9999+")
- [ ] Subject max server length: 255 characters (truncated client-side if wider than column)
- [ ] Body preview max: first 120 characters of body text, stripped of markdown

### Edge Cases
- [ ] Terminal resize while scrolled: focus index preserved, columns recalculate synchronously
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] SSE notification arrives while list is open: prepended to top, unread count updates, scroll position preserved (no jump)
- [ ] SSE disconnect and reconnect: status bar shows disconnection, replay via `Last-Event-ID`, deduplication by notification id
- [ ] Unicode in subjects: truncation respects grapheme clusters
- [ ] Null body field: body preview rendered as blank, no "null" text
- [ ] 500+ notifications: pagination cap, footer shows "Showing 500 of N"
- [ ] Mark read 404 (notification already deleted): optimistic reverts, status bar flash
- [ ] Mark all read with 0 unread: no-op, no API call
- [ ] Empty inbox (zero notifications): "No notifications yet." centered message
- [ ] All read, filter set to "Unread": "No unread notifications." with hint to press `f` to show all
- [ ] Rapid `r` presses on same notification: first press marks read, subsequent are no-ops
- [ ] SSE notification for different user (edge): ignored (server-side channel scoping)
- [ ] Network disconnect mid-pagination: error state on list, "Press R to retry" (capital R in error state context)

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > Notifications          🔔 7 │ ● sync │
├──────────────────────────────────────────────────────────┤
│ Notifications (7 unread)                        / search │
│ Filter: All │ Unread                                     │
├──────────────────────────────────────────────────────────┤
│ ● 🔔 Fix login timeout assigned to you        [bug]  3m │
│ ● 💬 Review requested on LR #42                      1h │
│ ● ⚙️  Workflow "CI" failed on main                   2h │
│   🔔 Issue #97 closed by bob                         1d │
│   💬 New comment on LR #38                           2d │
│   🚀 LR #35 landed successfully                     3d │
│ …                                                        │
│                    Loading more…                          │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:open r:read R:all f:filter q:back  │
└──────────────────────────────────────────────────────────┘
```

The screen is composed of: (1) title row "Notifications (N unread)", (2) persistent filter toolbar with status filter and search input, (3) `<scrollbox>` with notification rows and pagination footer, (4) empty/error/loading states.

### Component Tree

```tsx
<box flexDirection="column" width="100%" height="100%">
  {/* Title row */}
  <box flexDirection="row" height={1}>
    <text bold color="primary">Notifications</text>
    <text color="muted"> ({unreadCount} unread)</text>
  </box>

  {/* Filter toolbar */}
  <box flexDirection="row" height={1} gap={1}>
    <text>Filter:</text>
    <text color={filter === "all" ? "primary" : "muted"}>All</text>
    <text color="muted">│</text>
    <text color={filter === "unread" ? "primary" : "muted"}>Unread</text>
    <box flexGrow={1} />
    <input
      placeholder="/ search"
      value={searchText}
      onChange={setSearchText}
      focused={searchFocused}
    />
  </box>

  {/* Notification list */}
  <scrollbox
    flexGrow={1}
    onScrollEnd={loadNextPage}
    scrollEndThreshold={0.8}
  >
    <box flexDirection="column">
      {filteredNotifications.map((notif) => (
        <box
          key={notif.id}
          flexDirection="row"
          height={1}
          style={notif.id === focusedId ? { reverse: true, color: "primary" } : undefined}
        >
          {/* Unread indicator */}
          <text width={2} color="primary">
            {notif.status === "unread" ? "●" : " "}
          </text>

          {/* Source type icon (standard+ sizes) */}
          {breakpoint !== "minimum" && (
            <text width={3} color="muted">
              {sourceIcon(notif.source_type)}
            </text>
          )}

          {/* Subject */}
          <text
            bold={notif.status === "unread"}
            flexShrink={1}
            width={subjectWidth}
          >
            {truncate(notif.subject, subjectWidth)}
          </text>

          {/* Body preview (standard+ sizes) */}
          {breakpoint !== "minimum" && (
            <text color="muted" flexShrink={1}>
              {truncate(stripMarkdown(notif.body), previewWidth)}
            </text>
          )}

          {/* Timestamp */}
          <text color="muted" width={timestampWidth}>
            {relativeTime(notif.created_at)}
          </text>
        </box>
      ))}

      {/* Pagination footer */}
      {isLoadingMore && (
        <text color="muted" align="center">Loading more…</text>
      )}
      {atMemoryCap && (
        <text color="muted" align="center">
          Showing 500 of {totalCount}
        </text>
      )}
    </box>
  </scrollbox>
</box>
```

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar
- `<scrollbox>` — Scrollable notification list with scroll-to-end pagination detection at 80%
- `<text>` — Notification subjects, body previews, timestamps, unread indicators, source icons
- `<input>` — Search input in filter toolbar (focused via `/`)

### NotificationRow

Unread indicator (● blue for unread, space for read), source type icon (muted), subject (bold if unread, normal if read), body preview (muted, truncated), timestamp (muted). Focused row uses reverse video with primary color.

### Empty States

- Zero notifications: `<text color="muted" align="center">No notifications yet.</text>`
- All filtered out (Unread filter, 0 unread): `<text color="muted" align="center">No unread notifications. Press f to show all.</text>`
- Search no matches: `<text color="muted" align="center">No notifications match "{query}".</text>`

### Error State

```tsx
<box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
  <text color="error">Failed to load notifications.</text>
  <text color="muted">{errorMessage}</text>
  <text color="muted">Press R to retry.</text>
</box>
```

### Loading State

```tsx
<box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
  <text color="muted">Loading notifications…</text>
</box>
```

### Keybindings

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Next row | List focused |
| `k` / `Up` | Previous row | List focused |
| `Enter` | Navigate to source | Notification focused |
| `/` | Focus search input | List focused |
| `Esc` | Clear search → pop screen | Priority chain |
| `G` | Jump to last row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | List focused |
| `r` | Mark focused read | Notification focused, unread |
| `R` | Mark all read | List focused, has unread |
| `f` | Toggle filter (All/Unread) | List focused |
| `Space` | Toggle row selection | Notification focused |
| `q` | Pop screen | Not in search input |

### Responsive Behavior

| Breakpoint | Unread | Icon | Subject | Body Preview | Timestamp | Toolbar |
|-----------|--------|------|---------|--------------|-----------|---------|
| 80×24 min | 2ch | hidden | remaining−4ch | hidden | 4ch | filter + search |
| 120×40 std | 2ch | 3ch | 40ch | remaining−4ch | 4ch | full |
| 200×60 lg | 2ch | 3ch | 55ch | remaining−6ch | 6ch | full |

Resize triggers synchronous re-layout. Focused row index preserved. Column widths recalculated. Search input width adjusts proportionally.

### Data Hooks
- `useNotifications()` from `@codeplane/ui-core` → `GET /api/notifications/list?page=N&per_page=30` (page-based pagination, `X-Total-Count` header for total)
- `useNotificationStream()` from `@codeplane/ui-core` → `GET /api/notifications` (SSE endpoint, `Last-Event-ID` header for reconnection replay)
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()` from local TUI routing
- `useSSE("user_notifications_{userId}")` from SSE context provider

### API Endpoints Consumed
- `GET /api/notifications/list?page=N&per_page=30` — Paginated notification list with `X-Total-Count` header
- `GET /api/notifications` — SSE endpoint for real-time notification streaming
- `PATCH /api/notifications/:id` — Mark single notification as read (204 No Content)
- `PUT /api/notifications/mark-read` — Mark all notifications as read (204 No Content)

### Navigation
- `Enter` → delegates to `TUI_NOTIFICATION_DETAIL_NAV` which pushes the appropriate detail screen based on `source_type`:
  - `"issue"` / `"issue_comment"` → `push("issue-detail", { repo, number })`
  - `"landing_request"` / `"lr_review"` / `"lr_comment"` → `push("landing-detail", { repo, id })`
  - `"workflow_run"` → `push("workflow-run-detail", { repo, runId })`
  - `"workspace"` → `push("workspace-detail", { workspaceId })`
- `q` → `pop()`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated |
|--------|-----------|---------------|
| View notification list | ❌ | ✅ |
| Mark notification read | ❌ | ✅ |
| Mark all read | ❌ | ✅ |
| Navigate to source | ❌ | ✅ (subject to source resource permissions) |

- The Notification List screen requires authentication. Unauthenticated users are redirected to the auth error screen ("Run `codeplane auth login` to authenticate.")
- All API endpoints (`/api/notifications/*`) are user-scoped: a user can only see and modify their own notifications
- Navigating to a notification source (e.g., a private repo issue) may fail if the user has since lost access. The target screen handles this with its own permission error
- There is no admin/org-level notification access — notifications are strictly per-user

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- SSE endpoint also uses the same token for initial authentication
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen ("Session expired. Run `codeplane auth login` to re-authenticate.")
- SSE connections use ticket-based authentication: a one-time ticket is obtained via the auth API, then used to establish the SSE stream

### Rate Limiting
- `GET /api/notifications/list`: 300 req/min (shared with other list endpoints)
- `PATCH /api/notifications/:id`: 120 req/min (mark read is frequent)
- `PUT /api/notifications/mark-read`: 30 req/min (mark all is rare)
- `GET /api/notifications` (SSE): 10 connections/min (reconnection limiter)
- 429 responses show inline "Rate limited. Retry in {Retry-After}s." in the status bar
- No auto-retry on rate limit; user waits and presses `R` (in error state) or action auto-succeeds on next interaction
- Mark-read actions that are rate-limited revert their optimistic update

### Data Sensitivity
- Notification subjects may contain repository names, issue titles, or user logins — these are user-scoped data, not cross-user
- Notification body previews may contain comment text — already visible to the user in the source resource
- No PII beyond what the user already has access to in the source resources

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.notifications.view` | Screen mounted, initial data loaded | `total_count`, `unread_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` ("goto", "palette", "deeplink") |
| `tui.notifications.navigate` | Enter on notification | `notification_id`, `source_type`, `source_id`, `was_unread`, `position_in_list`, `status_filter`, `had_search` |
| `tui.notifications.mark_read` | Press r on notification | `notification_id`, `source_type`, `position_in_list`, `success` |
| `tui.notifications.mark_all_read` | Press R | `unread_count_before`, `success` |
| `tui.notifications.filter_change` | Press f | `new_filter` ("all", "unread"), `previous_filter`, `visible_count` |
| `tui.notifications.search` | Type in search input | `query_length`, `match_count`, `total_loaded_count` |
| `tui.notifications.paginate` | Next page loaded via scroll | `page_number`, `items_loaded_total`, `total_count` |
| `tui.notifications.sse_received` | SSE notification arrives | `notification_id`, `source_type`, `was_screen_visible` |
| `tui.notifications.sse_reconnect` | SSE reconnects after disconnect | `disconnect_duration_ms`, `replayed_count` |
| `tui.notifications.error` | API failure | `error_type`, `http_status`, `request_type` ("list", "mark_read", "mark_all_read") |
| `tui.notifications.retry` | Retry after error | `error_type`, `retry_success` |
| `tui.notifications.empty` | Empty state shown | `filter_value`, `has_search_text` |
| `tui.notifications.data_load_time` | Data loaded | `list_ms`, `total_ms`, `item_count` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Navigate-to-source rate | >50% of views |
| Mark read rate | >40% of views |
| Mark all read rate | >15% of views |
| Filter usage (Unread) | >25% of views |
| Search adoption | >10% of views |
| SSE connection uptime | >95% of session time |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <1.5s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `Notifications: mounted [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `Notifications: loaded [count={n}] [total={t}] [unread={u}] [duration={ms}ms]` |
| `debug` | Search/filter changes | `Notifications: search [query_length={n}] [matches={m}]` |
| `debug` | Filter changed | `Notifications: filter [from={old}] [to={new}]` |
| `debug` | Pagination triggered | `Notifications: pagination [page={n}]` |
| `debug` | SSE event received | `Notifications: sse event [id={id}] [source_type={type}]` |
| `info` | Fully loaded | `Notifications: ready [count={n}] [unread={u}] [total_ms={ms}]` |
| `info` | Navigated to source | `Notifications: navigated [id={id}] [source_type={type}] [source_id={sid}]` |
| `info` | Marked read | `Notifications: marked read [id={id}] [success={bool}]` |
| `info` | Marked all read | `Notifications: marked all read [count={n}] [success={bool}]` |
| `warn` | Fetch failed | `Notifications: fetch failed [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Notifications: rate limited [retry_after={s}]` |
| `warn` | Mark read failed | `Notifications: mark read failed [id={id}] [status={code}]` |
| `warn` | Slow load (>3s) | `Notifications: slow load [duration={ms}ms]` |
| `warn` | Pagination cap | `Notifications: pagination cap [total={n}] [cap=500]` |
| `warn` | SSE disconnect | `Notifications: sse disconnected [duration={ms}ms]` |
| `error` | Auth error | `Notifications: auth error [status=401]` |
| `error` | SSE failed permanently | `Notifications: sse failed [attempts={n}] [last_error={msg}]` |
| `error` | Render error | `Notifications: render error [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Resize during load | `useOnResize` fires while fetch in-flight | Layout re-renders; fetch continues | Independent; layout adjusts on completion |
| Resize while scrolled | `useOnResize` fires with scroll offset | Columns recalculate; focus preserved | Synchronous re-layout |
| SSE disconnect | SSE `error`/`close` event | Status bar shows "⚠ Disconnected"; list remains usable | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s); replay via `Last-Event-ID` |
| SSE reconnect replay | SSE reconnects with `Last-Event-ID` | Replayed events deduplicated by `id` against loaded list | Automatic; no user action |
| Auth expiry | 401 from any API call | Auth error screen pushed | Re-auth via CLI (`codeplane auth login`) |
| Network timeout (30s) | Fetch promise timeout | Loading → error state with "Press R to retry" | User retries |
| Mark read 404 | `PATCH` returns 404 (notification deleted) | Optimistic update reverts; row removed from list | Notification was deleted server-side; removal is correct |
| Mark read 429 | `PATCH` returns 429 | Optimistic update reverts; status bar flash | User waits, tries again |
| Mark all read failure | `PUT` returns non-204 | Optimistic reverts all to previous read/unread state | Status bar error; user retries |
| Rapid r presses | Multiple `r` on already-read notification | First marks read; subsequent are no-ops (guard on `status` field) | Client-side guard |
| No color support | `TERM`/`COLORTERM` detection | Text markers `[*]` replace ● indicator; bold via terminal escapes | Theme detection at startup |
| Memory cap (500) | Client-side item count check | Stop pagination; footer shows count | Client-side cap; user is informed |
| SSE delivers duplicate | Same notification ID already in list | Deduplication by `id`; existing row updated if newer | Automatic |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- All API fails → error state displayed; `q` and go-to keys still work for navigation away
- SSE permanently fails (>10 reconnect attempts) → status bar shows persistent warning; list still usable with manual refresh via leaving and re-entering screen
- Slow network → spinner shown; user navigates away via go-to or palette

## Verification

### Test File: `e2e/tui/notifications.test.ts`

### Terminal Snapshot Tests (26 tests)

- SNAP-NOTIF-001: Notification list at 120×40 with mixed read/unread notifications — full layout, headers, columns, focus highlight
- SNAP-NOTIF-002: Notification list at 80×24 minimum — unread indicator, subject, timestamp only
- SNAP-NOTIF-003: Notification list at 200×60 large — all columns with generous spacing
- SNAP-NOTIF-004: Empty state (zero notifications) — "No notifications yet." centered
- SNAP-NOTIF-005: All read with Unread filter active — "No unread notifications. Press f to show all."
- SNAP-NOTIF-006: Search no matches — "No notifications match \"{query}\"."
- SNAP-NOTIF-007: Loading state — "Loading notifications…" with title/toolbar visible
- SNAP-NOTIF-008: Error state — red error with "Press R to retry"
- SNAP-NOTIF-009: Focused row highlight on unread notification — primary accent reverse video, bold text
- SNAP-NOTIF-010: Focused row highlight on read notification — primary accent reverse video, normal weight text
- SNAP-NOTIF-011: Unread indicator rendering — ● blue (ANSI 33) for unread, blank for read
- SNAP-NOTIF-012: Source type icons — issue 🔔, landing 🚀, workflow ⚙️, workspace 🖥, comment 💬
- SNAP-NOTIF-013: Source type text fallbacks — [I], [L], [W], [S], [C] when emoji unsupported
- SNAP-NOTIF-014: Bold text for unread vs normal text for read
- SNAP-NOTIF-015: Filter toolbar with "All" active
- SNAP-NOTIF-016: Filter toolbar with "Unread" active
- SNAP-NOTIF-017: Search input focused with query text
- SNAP-NOTIF-018: Narrowed results after search
- SNAP-NOTIF-019: Pagination loading footer — "Loading more…"
- SNAP-NOTIF-020: Pagination cap footer — "Showing 500 of N"
- SNAP-NOTIF-021: Breadcrumb — "Dashboard > Notifications"
- SNAP-NOTIF-022: Unread count in title — "Notifications (7 unread)"
- SNAP-NOTIF-023: Status bar keybinding hints
- SNAP-NOTIF-024: Long subject truncation with ellipsis
- SNAP-NOTIF-025: Body preview truncation with ellipsis
- SNAP-NOTIF-026: Notification with null body — body preview blank

### Keyboard Interaction Tests (40 tests)

- KEY-NOTIF-001: j moves focus down one row
- KEY-NOTIF-002: k moves focus up one row
- KEY-NOTIF-003: Down arrow moves focus down one row
- KEY-NOTIF-004: Up arrow moves focus up one row
- KEY-NOTIF-005: j at bottom of list wraps or stops (depending on loaded count)
- KEY-NOTIF-006: k at top of list stays at first row
- KEY-NOTIF-007: Enter on issue notification navigates to issue detail
- KEY-NOTIF-008: Enter on landing request notification navigates to landing detail
- KEY-NOTIF-009: Enter on workflow notification navigates to workflow run detail
- KEY-NOTIF-010: Enter on workspace notification navigates to workspace detail
- KEY-NOTIF-011: Enter on comment notification navigates to parent resource detail
- KEY-NOTIF-012: / focuses search input
- KEY-NOTIF-013: Typing in search input narrows notification list by subject match
- KEY-NOTIF-014: Search is case-insensitive
- KEY-NOTIF-015: Esc in search input clears search and returns focus to list
- KEY-NOTIF-016: Esc with no search active pops screen
- KEY-NOTIF-017: G jumps to last loaded notification
- KEY-NOTIF-018: g g jumps to first notification
- KEY-NOTIF-019: Ctrl+D pages down
- KEY-NOTIF-020: Ctrl+U pages up
- KEY-NOTIF-021: r marks focused unread notification as read (optimistic — row updates immediately)
- KEY-NOTIF-022: r on already-read notification is no-op
- KEY-NOTIF-023: r updates unread count in title
- KEY-NOTIF-024: R marks all notifications as read (optimistic — all rows update)
- KEY-NOTIF-025: R updates unread count to 0
- KEY-NOTIF-026: R with 0 unread is no-op (no API call)
- KEY-NOTIF-027: f toggles filter from All to Unread
- KEY-NOTIF-028: f toggles filter from Unread to All
- KEY-NOTIF-029: Unread filter hides read notifications from list
- KEY-NOTIF-030: Space toggles row selection indicator
- KEY-NOTIF-031: q pops screen
- KEY-NOTIF-032: Keys j/k/f/r do not trigger while search input focused (they type into input)
- KEY-NOTIF-033: Enter during loading state is no-op
- KEY-NOTIF-034: Pagination triggers on scroll to 80% threshold
- KEY-NOTIF-035: Rapid j presses (15× sequential) — each moves focus one row
- KEY-NOTIF-036: r mark read followed by f filter to Unread — marked notification disappears
- KEY-NOTIF-037: R mark all read followed by f filter to Unread — empty state shown
- KEY-NOTIF-038: Search body text also matches (not just subject)
- KEY-NOTIF-039: Enter marks focused unread notification as read automatically on navigation
- KEY-NOTIF-040: Esc priority chain: search active → clear search; nothing active → pop screen

### Responsive Tests (14 tests)

- RESP-NOTIF-001: 80×24 layout shows only unread indicator, subject, timestamp
- RESP-NOTIF-002: 80×24 subject truncation at correct width
- RESP-NOTIF-003: 80×24 source icon hidden
- RESP-NOTIF-004: 80×24 body preview hidden
- RESP-NOTIF-005: 120×40 layout shows all standard columns
- RESP-NOTIF-006: 120×40 subject truncated at 40ch
- RESP-NOTIF-007: 120×40 body preview visible with truncation
- RESP-NOTIF-008: 200×60 layout shows full column set
- RESP-NOTIF-009: 200×60 timestamp uses extended format ("3d ago")
- RESP-NOTIF-010: Resize from 120×40 to 80×24 — columns collapse, focus preserved
- RESP-NOTIF-011: Resize from 80×24 to 120×40 — columns expand, focus preserved
- RESP-NOTIF-012: Resize during search — search input width adjusts
- RESP-NOTIF-013: Resize during loading — layout recalculates, fetch continues
- RESP-NOTIF-014: Resize with scrolled list — scroll position and focus preserved

### Integration Tests (18 tests)

- INT-NOTIF-001: Auth expiry (401) during list fetch — auth error screen shown
- INT-NOTIF-002: Rate limit (429) on list fetch — inline error with retry-after
- INT-NOTIF-003: Network timeout on list fetch — error state with "Press R to retry"
- INT-NOTIF-004: Pagination loads next page correctly with page parameter
- INT-NOTIF-005: Pagination cap at 500 items — footer shows cap message
- INT-NOTIF-006: Navigation to issue and back preserves list state (scroll, focus, filter)
- INT-NOTIF-007: Navigation to landing request and back preserves list state
- INT-NOTIF-008: Server 500 on list fetch — error state
- INT-NOTIF-009: Mark read optimistic then server error — reverts to unread
- INT-NOTIF-010: Mark all read optimistic then server error — reverts all
- INT-NOTIF-011: Mark read 404 (deleted notification) — row removed from list
- INT-NOTIF-012: Deep link `--screen notifications` launches directly to notification list
- INT-NOTIF-013: Command palette `:notifications` navigates to notification list
- INT-NOTIF-014: `g n` go-to navigates to notification list
- INT-NOTIF-015: SSE delivers new notification — prepended to list, unread count updated
- INT-NOTIF-016: SSE reconnection replays missed notifications via Last-Event-ID
- INT-NOTIF-017: SSE duplicate notification — deduplicated by id
- INT-NOTIF-018: Unread count in title stays synchronized with actual list data

### Edge Case Tests (13 tests)

- EDGE-NOTIF-001: No auth token at startup — auth error screen
- EDGE-NOTIF-002: Long subject (255 chars) — truncated with ellipsis
- EDGE-NOTIF-003: Unicode/emoji in subject — truncation respects grapheme clusters
- EDGE-NOTIF-004: Single notification in list
- EDGE-NOTIF-005: Concurrent resize + j/k navigation
- EDGE-NOTIF-006: Search with special regex characters (literal match, not regex)
- EDGE-NOTIF-007: Null body field — preview blank, no crash
- EDGE-NOTIF-008: Notification with null source_id — Enter shows "Source not found" flash
- EDGE-NOTIF-009: Rapid r presses on same notification — only first triggers API call
- EDGE-NOTIF-010: SSE notification arrives during pagination load — correctly inserted, no duplicate
- EDGE-NOTIF-011: Network disconnect mid-mark-read — optimistic reverts, error flash
- EDGE-NOTIF-012: 0 notifications with search text — correct empty message
- EDGE-NOTIF-013: Notification with very long body (1000+ chars) — preview truncated at 120ch before column truncation

All 111 tests left failing if backend is unimplemented — never skipped or commented out.

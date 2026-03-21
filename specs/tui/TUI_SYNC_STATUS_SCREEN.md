# TUI_SYNC_STATUS_SCREEN

Specification for TUI_SYNC_STATUS_SCREEN.

## High-Level User POV

The Sync Status screen is the central dashboard for the Codeplane daemon's local-first sync engine in the TUI. It presents a comprehensive, at-a-glance view of the bidirectional sync state between the local PGLite daemon and the remote Codeplane server, designed for developers running Codeplane in daemon mode who need to verify that their local changes are propagating upstream and remote changes are flowing downstream — without leaving the terminal. The screen is reached via the `g y` go-to keybinding from any screen (mnemonic: "s**y**nc"), by typing `:sync` in the command palette, or by launching the TUI with `codeplane tui --screen sync`. The sync status screen does not require a repository context — it is a global, daemon-scoped view.

The screen occupies the entire content area between the header bar and status bar. At the top is a status banner showing the current sync connection state as a large, color-coded indicator: a green `● Online` when connected and idle, a yellow `◐ Syncing` with a braille spinner when actively flushing the queue, a red `● Error` when the last sync attempt failed, or a gray `● Offline` when no remote is configured. Beside the indicator, the screen displays the remote URL (truncated if long), the daemon uptime, and the last successful sync timestamp in relative format.

Below the status banner is a two-section layout. The left section (or top section at minimum terminal widths) shows the sync queue summary: counts of pending items, synced items, conflicts, and failed items, each with a color-coded badge. The right section (or bottom section at minimum widths) shows the connection details: the daemon PID, port, database mode, and the remote URL with connectivity health.

The lower half of the screen is a scrollable sync queue list showing the most recent sync queue items. Each row displays the queue item's status (pending/synced/conflict/failed), the HTTP method and API path of the queued operation, the local ID if applicable, an error message for conflict/failed items, and the creation timestamp. Items are sorted newest-first. Conflict and failed rows are highlighted in red/yellow to draw attention. The user can press `Enter` on a conflict row to see the full error detail, `d` to discard (resolve) a conflict, or `y` to retry a failed item. Pressing `S` (shift+s) triggers a force sync, immediately flushing all pending items.

The screen updates in near-real-time by polling the daemon status endpoint at a 3-second interval (matching the sync service's flush interval). When a force sync is in progress, a progress indicator replaces the status badge until the operation completes. The screen is read-heavy and action-light — most users visit to confirm sync health, glance at conflict counts, and leave.

## Acceptance Criteria

### Definition of Done
- [ ] The Sync Status screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g y` go-to navigation (no repo context required), `:sync` command palette entry, and `--screen sync` deep-link
- [ ] The breadcrumb reads "Dashboard > Sync Status"
- [ ] Pressing `q` pops the screen and returns to the previous screen
- [ ] Daemon status is fetched via `useDaemonStatus()` from `@codeplane/ui-core`, calling `GET /api/daemon/status`
- [ ] Sync conflicts/queue items are fetched via `useSyncConflicts()` from `@codeplane/ui-core`, calling `GET /api/daemon/conflicts`
- [ ] Force sync is triggered via `useSyncForce()` from `@codeplane/ui-core`, calling `POST /api/daemon/sync`
- [ ] Resolve (discard) conflict calls `POST /api/daemon/conflicts/:id/resolve`
- [ ] Retry failed item calls `POST /api/daemon/conflicts/:id/retry`
- [ ] Status polling at 3-second intervals keeps the screen data fresh without SSE (daemon API does not expose SSE)
- [ ] Polling pauses when the screen is not visible (user navigated away) and resumes on return
- [ ] The sync status indicator color matches the semantic color tokens: `success` for online, `warning` for syncing, `error` for error, `muted` for offline

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next queue item row
- [ ] `k` / `Up`: Move focus to previous queue item row
- [ ] `Enter`: Show full error detail for focused conflict/failed item (modal overlay)
- [ ] `d`: Discard (resolve) focused conflict item (confirmation prompt)
- [ ] `y`: Retry focused failed/conflict item (immediate, optimistic status change to pending)
- [ ] `S`: Force sync — flush all pending items immediately
- [ ] `/`: Focus filter input to filter queue items by method, path, or status
- [ ] `Esc`: Close overlay/modal → clear filter → pop screen (priority chain)
- [ ] `G`: Jump to last loaded queue item
- [ ] `g g`: Jump to first queue item
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up in queue list
- [ ] `r`: Refresh status and queue immediately (bypass poll interval)
- [ ] `q`: Pop screen (return to previous screen)

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Single-column layout. Status banner condensed to one line. Queue summary and connection details stacked vertically. Queue list shows: status (3ch), method (6ch), path (remaining−8ch, truncated), timestamp (6ch). Error messages hidden (viewable via Enter)
- [ ] 120×40 – 199×59: Two-column layout. Status banner full width with spinner. Queue summary left (40%), connection details right (60%). Queue list shows: status (8ch with label), method (7ch), path (45ch), local_id (12ch, truncated), error preview (remaining−6ch), timestamp (6ch)
- [ ] 200×60+: Two-column layout with generous spacing. Queue list shows full column set including error message inline. Status banner includes full remote URL

### Truncation & Boundary Constraints
- [ ] Remote URL: truncated with `…` at 50ch (standard), 80ch (large), hidden below 80ch (show "Remote: connected" instead)
- [ ] API path in queue row: truncated with `…` at column width
- [ ] Error message in queue row: truncated with `…` at column width (full text in Enter overlay)
- [ ] Local ID: max 12ch, truncated with `…`
- [ ] Daemon uptime: formatted as "Xd Xh Xm" / "Xh Xm Xs" / "Xm Xs" / "Xs"
- [ ] Sync queue list: max 200 items loaded (cursor-based, newest first)
- [ ] Last sync timestamp: relative format ("3s ago", "5m ago", "2h ago", "1d ago", "never")
- [ ] Force sync result: toast message "Synced N items (X conflicts, Y failed)" shown for 5 seconds
- [ ] Pending/conflict/failed counts: abbreviated above 9999 ("9999+")
- [ ] Method column: uppercase HTTP method, max 7ch ("DELETE" is longest)
- [ ] Status label: "pending" (7ch), "synced" (6ch), "conflict" (8ch), "failed" (6ch)

### Edge Cases
- [ ] Daemon not running (API unreachable): show "Daemon not running. Start with `codeplane daemon start`." centered message with muted color
- [ ] No remote configured (sync_status "offline", remote_url null): show status banner as "Offline — No remote configured" with hint "Run `codeplane daemon connect <url>` to connect"
- [ ] Terminal resize while queue list scrolled: focus index preserved, columns recalculate synchronously
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] Force sync while already syncing: no-op, status bar flash "Sync already in progress"
- [ ] Force sync with 0 pending items: no-op, status bar flash "Nothing to sync"
- [ ] Discard conflict confirmation dismissed (Esc): no action taken
- [ ] Discard conflict 404 (already resolved): row removed from list, flash "Conflict already resolved"
- [ ] Retry item 404 (already removed): row removed from list, flash "Item no longer in queue"
- [ ] Polling response arrives after screen unmount: response discarded (no state update)
- [ ] Rapid S presses: first triggers sync, subsequent show "Sync already in progress" until complete
- [ ] Unicode in API paths: truncation respects grapheme clusters
- [ ] Empty queue (zero items): "No sync queue items." centered message below summary
- [ ] All items synced (zero pending/conflict/failed): summary shows green "All clear — no pending items"
- [ ] Error state from daemon status API: show inline error with "Press r to retry"
- [ ] Very long error messages (500+ chars): truncated in list, full text in modal overlay scrollbox
- [ ] Network timeout (30s) on force sync: error flash "Sync timed out. Press S to retry."
- [ ] Auth error (401) from daemon API: auth error screen pushed

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > Sync Status              🔔 3 │ ● sync │
├──────────────────────────────────────────────────────────┤
│ ● Online   remote: https://api.codeplane.app   up: 3h…  │
│            Last synced: 12s ago                           │
├──────────────┬───────────────────────────────────────────┤
│ Sync Queue   │ Connection                                │
│ ┌──────────┐ │ PID:     48291                            │
│ │ Pending 3│ │ Port:    3000                             │
│ │ Synced 47│ │ DB:      pglite                           │
│ │Conflict 1│ │ Remote:  https://api.codeplane.app        │
│ │ Failed  0│ │ Token:   ●●●●●●●● (configured)           │
│ └──────────┘ │                                           │
├──────────────┴───────────────────────────────────────────┤
│ Queue Items                                    / filter   │
├──────────────────────────────────────────────────────────┤
│▸conflict POST /api/repos/abc/issues  err: 409…   2m ago  │
│ pending  PUT  /api/repos/abc/issues/5            1m ago  │
│ pending  POST /api/repos/def/comments            30s ago │
│ synced   POST /api/repos/abc/issues/4            5m ago  │
│ synced   PUT  /api/repos/abc/labels              8m ago  │
│ …                                                         │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:nav S:sync d:discard y:retry r:refresh q:back│
└──────────────────────────────────────────────────────────┘
```

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, panels, rows
- `<scrollbox>` — Scrollable queue item list
- `<text>` — Status labels, counts, queue item fields, timestamps, error messages
- `<input>` — Filter input for queue items (focused via `/`)

### Status Indicator Mapping

| Sync Status | Icon | Color Token | Label |
|-------------|------|-------------|-------|
| `online` | `●` | `success` (green 34) | Online |
| `syncing` | `◐` + braille spinner | `warning` (yellow 178) | Syncing… |
| `error` | `●` | `error` (red 196) | Error |
| `offline` | `●` | `muted` (gray 245) | Offline |

### Queue Item Status Colors

| Queue Status | Color Token | Bold |
|-------------|-------------|------|
| `pending` | `warning` (yellow 178) | No |
| `synced` | `success` (green 34) | No |
| `conflict` | `error` (red 196) | Yes |
| `failed` | `error` (red 196) | Yes |

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Next queue item | List focused |
| `k` / `Up` | Previous queue item | List focused |
| `Enter` | Open error detail modal | Conflict/failed item focused |
| `d` | Discard conflict (with confirmation) | Conflict item focused |
| `y` | Retry failed/conflict item | Failed/conflict item focused |
| `S` | Force sync all pending items | Not mid-sync |
| `/` | Focus filter input | List focused |
| `Esc` | Close modal → clear filter → pop screen | Priority chain |
| `G` | Jump to last queue item | List focused |
| `g g` | Jump to first queue item | List focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | List focused |
| `r` | Refresh status + queue immediately | Any state |
| `q` | Pop screen | Not in filter input |

### Responsive Behavior

| Breakpoint | Status Banner | Summary Panels | Queue Columns |
|-----------|---------------|----------------|---------------|
| 80×24 min | 1 line: icon + label + last sync | Stacked vertically, condensed | status(3ch), method(6ch), path(remaining−6ch), timestamp(6ch) |
| 120×40 std | 2 lines: full banner | Side-by-side 40/60 | status(8ch), method(7ch), path(45ch), local_id(12ch), error(remaining−6ch), timestamp(6ch) |
| 200×60 lg | 2 lines: full banner + URL | Side-by-side 40/60, generous spacing | Full column set with inline error messages |

Resize triggers synchronous re-layout. Focused row index preserved. Column widths recalculated. At minimum size, summary panels collapse to minimal counts without borders.

### Data Hooks
- `useDaemonStatus()` from `@codeplane/ui-core` → `GET /api/daemon/status` (polled every 3s)
- `useSyncConflicts()` from `@codeplane/ui-core` → `GET /api/daemon/conflicts` (polled every 3s)
- `useSyncForce()` from `@codeplane/ui-core` → `POST /api/daemon/sync` (manual trigger)
- `useConflictResolve()` from `@codeplane/ui-core` → `POST /api/daemon/conflicts/:id/resolve`
- `useConflictRetry()` from `@codeplane/ui-core` → `POST /api/daemon/conflicts/:id/retry`
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()` from local TUI routing

### API Endpoints Consumed
- `GET /api/daemon/status` — Daemon status including pid, uptime, sync_status, pending_count, conflict_count, last_sync_at, remote_url, error
- `GET /api/daemon/conflicts` — List of sync queue items in conflict/failed state
- `POST /api/daemon/sync` — Force sync, returns {total, synced, conflicts, failed}
- `POST /api/daemon/conflicts/:id/resolve` — Discard a conflict item
- `POST /api/daemon/conflicts/:id/retry` — Retry a failed/conflict item

### Modals
- **Error Detail Modal**: Shows full error text for a conflict/failed item in a centered overlay (60% width standard, 90% minimum). Contains method, path, local ID, creation timestamp, and scrollable error message. Actions: `d` to discard, `y` to retry, `Esc` to close.
- **Discard Confirmation Modal**: Centered overlay (40% width standard, 90% minimum) confirming permanent removal. `Enter` confirms, `Esc` cancels.
- **Force Sync Toast**: Transient 5-second result message showing synced/conflict/failed counts after force sync completes.

### Navigation
- `Enter` on conflict/failed row → opens error detail modal overlay (does not push a screen)
- `q` → `pop()`
- Go-to keys remain active for navigating to other screens

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated |
|--------|-----------|---------------|
| View sync status | ❌ | ✅ |
| View conflict list | ❌ | ✅ |
| Force sync | ❌ | ✅ |
| Resolve (discard) conflict | ❌ | ✅ |
| Retry failed item | ❌ | ✅ |

- The Sync Status screen requires authentication. Unauthenticated users see the auth error screen ("Run `codeplane auth login` to authenticate.")
- The daemon API endpoints (`/api/daemon/*`) are local-only: they run on the local daemon process and are not exposed over the network. Access control is implicit — if you can reach the daemon, you are the local user
- The token used for remote sync is stored by the daemon and never displayed in the TUI (shown as `●●●●●●●● (configured)`)
- Force sync uses the daemon's stored remote token, not the TUI user's token

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client for daemon API calls
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen
- Remote URL and remote token are server-side state — the TUI only reads them via the status endpoint

### Rate Limiting
- `GET /api/daemon/status`: no rate limit (local-only, polled at 3s)
- `GET /api/daemon/conflicts`: no rate limit (local-only, polled at 3s)
- `POST /api/daemon/sync`: 10 req/min (force sync is heavy; client-side guard prevents rapid triggers)
- `POST /api/daemon/conflicts/:id/resolve`: 60 req/min
- `POST /api/daemon/conflicts/:id/retry`: 60 req/min
- The daemon API is local-only, so rate limits are more relaxed than remote API endpoints
- Client-side guards (in-progress flag for force sync, single-fire for resolve/retry) prevent accidental overload

### Data Sensitivity
- Sync queue items contain API paths that may reveal repository names, issue IDs, and user operations
- Error messages from failed sync attempts may contain server error details — these are shown to the local user who is already the daemon operator
- Remote URL is visible (it's the user's own configured server)
- Remote token is never shown (masked as dots)

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.sync.view` | Screen mounted, initial data loaded | `sync_status`, `pending_count`, `conflict_count`, `failed_count`, `has_remote`, `uptime_ms`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` ("goto", "palette", "deeplink") |
| `tui.sync.force_sync` | S key pressed, sync initiated | `pending_count_before`, `sync_duration_ms`, `result_total`, `result_synced`, `result_conflicts`, `result_failed`, `success` |
| `tui.sync.resolve_conflict` | d confirmed on conflict | `conflict_id`, `method`, `path`, `error_type`, `success` |
| `tui.sync.retry_item` | y pressed on failed/conflict item | `item_id`, `method`, `path`, `previous_status`, `success` |
| `tui.sync.view_detail` | Enter on conflict/failed item | `item_id`, `status`, `method`, `path`, `error_length` |
| `tui.sync.filter_change` | Typing in filter input | `filter_text_length`, `match_count`, `total_count` |
| `tui.sync.refresh` | r pressed for manual refresh | `time_since_last_poll_ms` |
| `tui.sync.error` | API failure on any daemon endpoint | `error_type`, `http_status`, `endpoint` |
| `tui.sync.daemon_unreachable` | GET /api/daemon/status fails with connection error | `error_message` |
| `tui.sync.status_change` | Poll detects sync_status changed | `previous_status`, `new_status`, `pending_count`, `conflict_count` |
| `tui.sync.empty_queue` | Queue list empty state shown | `sync_status`, `has_remote` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Force sync success rate | >85% |
| Conflict resolution rate | >70% of views with conflicts |
| Retry success rate | >60% |
| Daemon reachability | >95% on views |
| Error rate | <5% |
| Time to interactive | <1s |
| Users resolving all conflicts in single session | >50% |
| Repeat visits (same session) | <20% (low return = healthy sync) |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `Sync: mounted [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Status polled | `Sync: polled [status={s}] [pending={p}] [conflicts={c}] [duration={ms}ms]` |
| `debug` | Conflicts loaded | `Sync: conflicts loaded [count={n}] [duration={ms}ms]` |
| `debug` | Filter changed | `Sync: filter [query_length={n}] [matches={m}]` |
| `info` | Screen ready | `Sync: ready [status={s}] [pending={p}] [conflicts={c}] [total_ms={ms}]` |
| `info` | Force sync initiated | `Sync: force sync started [pending={p}]` |
| `info` | Force sync complete | `Sync: force sync complete [total={t}] [synced={s}] [conflicts={c}] [failed={f}] [duration={ms}ms]` |
| `info` | Conflict resolved | `Sync: conflict resolved [id={id}] [method={m}] [path={p}]` |
| `info` | Item retried | `Sync: item retried [id={id}] [method={m}] [path={p}]` |
| `warn` | Daemon unreachable | `Sync: daemon unreachable [error={msg}]` |
| `warn` | Force sync failed | `Sync: force sync failed [error={msg}] [duration={ms}ms]` |
| `warn` | Resolve failed | `Sync: resolve failed [id={id}] [status={code}] [error={msg}]` |
| `warn` | Retry failed | `Sync: retry failed [id={id}] [status={code}] [error={msg}]` |
| `warn` | Slow poll (>5s) | `Sync: slow poll [duration={ms}ms]` |
| `warn` | Status degraded | `Sync: status degraded [from={old}] [to={new}] [error={msg}]` |
| `error` | Auth error | `Sync: auth error [status=401]` |
| `error` | Render error | `Sync: render error [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Daemon not running | `GET /api/daemon/status` connection refused | Full-screen "Daemon not running" message with hint | User starts daemon via CLI; screen polls and auto-recovers |
| Resize during polling | `useOnResize` fires while fetch in-flight | Layout re-renders; fetch continues | Independent; layout adjusts on completion |
| Resize while scrolled | `useOnResize` fires with scroll offset | Columns recalculate; focus preserved | Synchronous re-layout |
| Auth expiry | 401 from any daemon API call | Auth error screen pushed | Re-auth via CLI (`codeplane auth login`) |
| Network timeout (30s) on force sync | Fetch promise timeout | Error toast "Sync timed out. Press S to retry." | User retries |
| Force sync 400 (no remote) | `POST /api/daemon/sync` returns 400 | Error toast with server message | User runs `codeplane daemon connect <url>` |
| Resolve conflict 404 | `POST /api/daemon/conflicts/:id/resolve` returns 404 | Row removed from list, flash "Conflict already resolved" | Automatic |
| Retry item 404 | `POST /api/daemon/conflicts/:id/retry` returns 404 | Row removed from list, flash "Item no longer in queue" | Automatic |
| Poll during force sync | 3s poll fires while sync in progress | Poll continues; data refreshes after sync completes | Automatic |
| Rapid d/y presses on same item | Multiple actions on single item | First action fires; subsequent show "Action in progress" | Client-side guard |
| Terminal suspend (Ctrl+Z) and resume | Process signal | Polling resumes on SIGCONT; immediate refresh | Automatic |
| Daemon restart during TUI session | Status poll starts returning different PID | PID updates in connection details; queue resets | Automatic on next poll |
| No color support | `TERM`/`COLORTERM` detection | Text markers replace color indicators (`[OK]`, `[!!]`, `[--]`) | Theme detection at startup |
| Memory pressure from long uptime | Queue list growth | 200-item cap on loaded queue items | Client-side cap |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- All daemon API fails → "Daemon not running" state displayed; `q` and go-to keys still work for navigation away
- Force sync timeout → error toast; screen remains usable with current data
- Slow network to daemon → polling silently retries; stale data remains visible
- Daemon disconnects from remote mid-session → status changes to "offline" or "error" on next poll

## Verification

### Test File: `e2e/tui/sync.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-SYNC-001: Sync status screen at 120×40 with online status, non-empty queue — full layout with status banner, summary panels, queue list
- SNAP-SYNC-002: Sync status screen at 80×24 minimum — condensed single-column layout, reduced queue columns
- SNAP-SYNC-003: Sync status screen at 200×60 large — full column set with generous spacing
- SNAP-SYNC-004: Status banner showing "● Online" with green color, remote URL, uptime, last sync
- SNAP-SYNC-005: Status banner showing "◐ Syncing…" with yellow color and braille spinner
- SNAP-SYNC-006: Status banner showing "● Error" with red color and error text
- SNAP-SYNC-007: Status banner showing "● Offline" with gray color and "No remote configured" hint
- SNAP-SYNC-008: Sync queue summary panel with non-zero pending, conflict, and failed counts
- SNAP-SYNC-009: Sync queue summary panel showing "All clear — no pending items" in green
- SNAP-SYNC-010: Connection details panel with PID, port, DB mode, remote URL, token mask
- SNAP-SYNC-011: Connection details panel with no remote configured (remote: "not configured")
- SNAP-SYNC-012: Queue item row with "conflict" status — red bold text, error preview
- SNAP-SYNC-013: Queue item row with "failed" status — red bold text, error preview
- SNAP-SYNC-014: Queue item row with "pending" status — yellow text
- SNAP-SYNC-015: Queue item row with "synced" status — green text
- SNAP-SYNC-016: Focused queue item row — primary reverse video with focus indicator ▸
- SNAP-SYNC-017: Empty queue list — "No sync queue items." centered message
- SNAP-SYNC-018: Filter input focused with filter text and narrowed results
- SNAP-SYNC-019: Filter no matches — "No items match \"{query}\"." centered message
- SNAP-SYNC-020: Error detail modal overlay for conflict item — full error text, method, path, actions
- SNAP-SYNC-021: Discard confirmation modal overlay — confirmation text with Enter/Esc options
- SNAP-SYNC-022: Force sync in progress — spinner in status banner
- SNAP-SYNC-023: Force sync result toast — "Synced N items" success message
- SNAP-SYNC-024: Daemon not running state — centered "Daemon not running" message with hint
- SNAP-SYNC-025: Loading state — "Loading sync status…" with spinner
- SNAP-SYNC-026: Breadcrumb — "Dashboard > Sync Status"
- SNAP-SYNC-027: Status bar keybinding hints — "j/k:nav S:sync d:discard y:retry r:refresh q:back"
- SNAP-SYNC-028: Long remote URL truncation with ellipsis

### Keyboard Interaction Tests (35 tests)

- KEY-SYNC-001: j moves focus down one row in queue list
- KEY-SYNC-002: k moves focus up one row in queue list
- KEY-SYNC-003: Down arrow moves focus down one row
- KEY-SYNC-004: Up arrow moves focus up one row
- KEY-SYNC-005: j at bottom of list stays at last row
- KEY-SYNC-006: k at top of list stays at first row
- KEY-SYNC-007: Enter on conflict item opens error detail modal
- KEY-SYNC-008: Enter on failed item opens error detail modal
- KEY-SYNC-009: Enter on pending item is no-op (no error to show)
- KEY-SYNC-010: Enter on synced item is no-op (no error to show)
- KEY-SYNC-011: d on conflict item opens discard confirmation modal
- KEY-SYNC-012: d on non-conflict item is no-op
- KEY-SYNC-013: Enter in discard confirmation modal executes discard
- KEY-SYNC-014: Esc in discard confirmation modal dismisses without action
- KEY-SYNC-015: y on failed item changes status to pending (optimistic)
- KEY-SYNC-016: y on conflict item changes status to pending (optimistic)
- KEY-SYNC-017: y on pending or synced item is no-op
- KEY-SYNC-018: S triggers force sync — status banner shows syncing spinner
- KEY-SYNC-019: S during active sync is no-op with status bar flash
- KEY-SYNC-020: S with zero pending items is no-op with status bar flash
- KEY-SYNC-021: / focuses filter input
- KEY-SYNC-022: Typing in filter input narrows queue list by method, path, or status match
- KEY-SYNC-023: Filter is case-insensitive
- KEY-SYNC-024: Esc in filter input clears filter and returns focus to list
- KEY-SYNC-025: Esc with no filter active and no modal open pops screen
- KEY-SYNC-026: Esc closes error detail modal
- KEY-SYNC-027: Esc closes discard confirmation modal
- KEY-SYNC-028: G jumps to last queue item
- KEY-SYNC-029: g g jumps to first queue item
- KEY-SYNC-030: Ctrl+D pages down in queue list
- KEY-SYNC-031: Ctrl+U pages up in queue list
- KEY-SYNC-032: r triggers immediate refresh (status + conflicts re-fetched)
- KEY-SYNC-033: q pops screen
- KEY-SYNC-034: Rapid j presses (15× sequential) — each moves focus one row
- KEY-SYNC-035: d and y keys do not trigger while filter input focused

### Responsive Tests (12 tests)

- RESP-SYNC-001: 80×24 layout — single-column summary, condensed status banner, reduced queue columns
- RESP-SYNC-002: 80×24 queue list shows only status(3ch), method(6ch), path(remaining−6ch), timestamp(6ch)
- RESP-SYNC-003: 80×24 local_id and error preview columns hidden
- RESP-SYNC-004: 80×24 summary panels stacked vertically
- RESP-SYNC-005: 120×40 layout — two-column summary, full status banner, standard queue columns
- RESP-SYNC-006: 120×40 queue list shows status(8ch), method(7ch), path(45ch), local_id(12ch), error(remaining−6ch), timestamp(6ch)
- RESP-SYNC-007: 200×60 layout — two-column summary, generous spacing, full queue columns
- RESP-SYNC-008: Resize from 120×40 to 80×24 — columns collapse, summary stacks, focus preserved
- RESP-SYNC-009: Resize from 80×24 to 120×40 — columns expand, summary splits, focus preserved
- RESP-SYNC-010: Resize during force sync — layout recalculates, sync continues
- RESP-SYNC-011: Resize with modal open — modal width adjusts (90% vs 60%)
- RESP-SYNC-012: Resize with scrolled queue list — scroll position and focus preserved

### Integration Tests (22 tests)

- INT-SYNC-001: Auth expiry (401) during status fetch — auth error screen shown
- INT-SYNC-002: Daemon not running (connection refused) — "Daemon not running" state shown
- INT-SYNC-003: Daemon starts mid-session — screen auto-recovers on next poll
- INT-SYNC-004: Network timeout on status fetch — error state with "Press r to retry"
- INT-SYNC-005: Force sync success — result toast shows correct counts
- INT-SYNC-006: Force sync failure — error toast shown, status updates to error
- INT-SYNC-007: Force sync timeout (30s) — error toast "Sync timed out"
- INT-SYNC-008: Force sync 400 (no remote) — error toast with server message
- INT-SYNC-009: Discard conflict success — row removed from queue list, conflict count decrements
- INT-SYNC-010: Discard conflict 404 — row removed, flash "Conflict already resolved"
- INT-SYNC-011: Retry item success — status changes to pending, conflict count decrements
- INT-SYNC-012: Retry item 404 — row removed, flash "Item no longer in queue"
- INT-SYNC-013: Deep link `--screen sync` launches directly to sync status
- INT-SYNC-014: Command palette `:sync` navigates to sync status
- INT-SYNC-015: `g y` go-to navigates to sync status
- INT-SYNC-016: Polling updates screen data every 3 seconds
- INT-SYNC-017: Polling pauses when navigating away and resumes on return
- INT-SYNC-018: Status change from online to error — banner color updates on next poll
- INT-SYNC-019: Status change from offline to online after `daemon connect` — banner updates
- INT-SYNC-020: Navigate away from sync screen and back — state refreshed, focus reset to top
- INT-SYNC-021: Sync status indicator in global status bar matches this screen's status
- INT-SYNC-022: Conflict count in global status bar matches this screen's conflict count

### Edge Case Tests (14 tests)

- EDGE-SYNC-001: No auth token at startup — auth error screen
- EDGE-SYNC-002: Very long error message (500+ chars) — truncated in list, full in modal scrollbox
- EDGE-SYNC-003: Unicode in API paths — truncation respects grapheme clusters
- EDGE-SYNC-004: Single queue item in list
- EDGE-SYNC-005: Concurrent resize + j/k navigation
- EDGE-SYNC-006: Filter with special regex characters (literal match, not regex)
- EDGE-SYNC-007: Rapid S presses — only first triggers sync
- EDGE-SYNC-008: Rapid d presses on same conflict — only first triggers discard
- EDGE-SYNC-009: Rapid y presses on same item — only first triggers retry
- EDGE-SYNC-010: Force sync during poll — both complete without interference
- EDGE-SYNC-011: Discard last conflict in list — focus moves to previous item or empty state
- EDGE-SYNC-012: Retry changes item status — row updates in-place, re-sort preserves position
- EDGE-SYNC-013: Queue at 200-item cap — footer shows "Showing 200 items"
- EDGE-SYNC-014: Daemon restart (different PID) mid-session — PID updates, queue resets

All 111 tests left failing if backend is unimplemented — never skipped or commented out.

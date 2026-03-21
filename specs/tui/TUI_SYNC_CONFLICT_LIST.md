# TUI_SYNC_CONFLICT_LIST

Specification for TUI_SYNC_CONFLICT_LIST.

## High-Level User POV

The Sync Conflict List is a dedicated triage surface within the Codeplane TUI for resolving sync queue conflicts. While the parent Sync Status screen provides a broad dashboard of all sync activity, the Conflict List is a focused view showing only items that require human attention — sync queue entries with `conflict` or `failed` status. These are API-level write conflicts that occurred when the daemon tried to replay a local write against the remote Codeplane server and received a `409 Conflict` or server error. The screen is reached via `Enter` on the conflict count in the Sync Status screen, `g y c` go-to, `:sync conflicts` in the command palette, or `--screen sync-conflicts` deep-link.

The screen shows a conflict summary bar with count and sync status chip, a filter toolbar with status/method/search filters, and a scrollable list of conflict rows. Each row displays a conflict icon (`✗`), status badge, HTTP method, human-readable resource description parsed from the API path (e.g., "Issue on acme/widgets"), error preview, and relative timestamp. Pressing `Enter` opens a detail modal with the full error message and request body as formatted JSON. Actions include `d` to discard (with confirmation), `y` to retry immediately, `X` for bulk discard, and `A` for bulk retry. The screen polls every 3 seconds and shows "No Conflicts — All Clear ✓" when all conflicts are resolved.

## Acceptance Criteria

### Definition of Done
- [ ] The Sync Conflict List renders as a full-screen view between header and status bars
- [ ] Reachable via `Enter` on conflict count in Sync Status screen, `g y c` go-to, `:sync conflicts` command palette, `--screen sync-conflicts` deep-link
- [ ] Breadcrumb reads "Dashboard > Sync Status > Conflicts"
- [ ] `q` pops screen back to previous
- [ ] Conflicts fetched via `useSyncConflicts()` calling `GET /api/daemon/conflicts`
- [ ] Shows only `conflict` or `failed` items, sorted by `created_at` descending
- [ ] Each row: focus indicator, ✗ icon, status badge, HTTP method, resource description, error preview (standard+), timestamp
- [ ] Resource descriptions parsed from API paths (e.g., `/api/repos/:owner/:repo/issues` → "Issue on owner/repo")
- [ ] Summary bar: "Sync Conflicts (N)" in red or "No Conflicts — All Clear ✓" in green
- [ ] Status/method/search filters compose client-side
- [ ] 3-second polling; pauses when screen not visible

### Keyboard Interactions
- [ ] j/k/arrows: navigate rows
- [ ] Enter: open detail modal
- [ ] d: discard with confirmation
- [ ] y: retry immediately (optimistic)
- [ ] X: bulk discard all visible
- [ ] A: bulk retry all visible
- [ ] f: cycle status filter
- [ ] m: cycle method filter (standard+)
- [ ] /: focus search
- [ ] Esc: close modal → clear search → clear filters → pop (priority chain)
- [ ] G/gg: jump to end/start
- [ ] Ctrl+D/U: page down/up
- [ ] R: manual refresh

### Responsive Behavior
- [ ] 80×24: abbreviated status (CON/FAL), no error preview, no method filter, 90% modal width
- [ ] 120×40: full status labels, error preview, all filters, 60% modal width
- [ ] 200×60+: full API path column, generous spacing

### Truncation & Boundaries
- [ ] Resource: 30ch (std) / 35ch (lg), truncated with …
- [ ] Error: truncated in list, full in modal scrollbox
- [ ] Method: max 7ch, never truncated
- [ ] Body: JSON formatted, >10KB truncated
- [ ] Memory cap: 500 items
- [ ] Grapheme-cluster-safe truncation

### Edge Cases
- [ ] Daemon not running → centered message with CLI hint
- [ ] No remote → disconnected state message
- [ ] 404 on discard/retry → row removed with flash
- [ ] Rapid key presses → sequential, no debounce
- [ ] Filter narrows below focus → snap to last visible
- [ ] Bulk partial failure → completed items removed, failed remain
- [ ] Malformed data → skip item, log warning

## Design

### Layout
Summary bar (1 line) → Filter toolbar (1 line) → Scrollbox conflict list → Empty/error states.

### Components
- `<box>`: layout containers, summary bar, filter toolbar, rows, modals
- `<scrollbox>`: scrollable conflict list, error/body in detail modal
- `<text>`: labels, badges, fields, timestamps, resource descriptions
- `<input>`: search filter (focused via `/`)
- `<code language="json">`: request body in detail modal

### Overlays
- Conflict detail modal (90%/60% width, 70% height): status, method, path, resource, local_id, error in scrollbox, request body as JSON code block
- Discard confirmation (90%/40% width): y/Enter to confirm, n/Esc to cancel
- Bulk discard confirmation (90%/45% width): count, warning, y/Enter or n/Esc
- Bulk retry confirmation (90%/45% width): count, description, y/Enter or n/Esc

### Resource Description Parsing
API paths → human-readable: `/api/repos/:owner/:repo/issues` → "Issue on owner/repo", `/api/repos/:owner/:repo/issues/:n/comments` → "Comment on owner/repo#:n", etc.

### Status Colors
- conflict: error (red 196), bold, icon ✗, abbrev CON
- failed: warning (yellow 178), bold, icon ✗, abbrev FAL

### Data Hooks
- `useSyncConflicts()` → GET /api/daemon/conflicts (polled 3s)
- `useDaemonStatus()` → GET /api/daemon/status (polled 3s)
- `useConflictResolve()` → POST /api/daemon/conflicts/:id/resolve
- `useConflictRetry()` → POST /api/daemon/conflicts/:id/retry
- `useKeyboard()`, `useTerminalDimensions()`, `useOnResize()` from @opentui/react
- `useNavigation()`, `useStatusBarHints()` from local TUI routing

### Responsive Breakpoints
- 80×24 min: focus+icon+status(3ch)+method(6ch)+resource(remaining−8ch)+timestamp(6ch)
- 120×40 std: focus+icon+status(8ch)+method(7ch)+resource(30ch)+error(remaining−8ch)+timestamp(6ch)
- 200×60 lg: focus+icon+status(8ch)+method(7ch)+resource(35ch)+path(40ch)+error(remaining−8ch)+timestamp(6ch)

## Permissions & Security

### Authorization
All actions require authentication. Anonymous access is denied. The TUI requires auth at bootstrap.

| Action | Anonymous | Authenticated |
|--------|-----------|---------------|
| View conflict list | ❌ | ✅ |
| View conflict detail | ❌ | ✅ |
| Discard conflict | ❌ | ✅ |
| Retry conflict | ❌ | ✅ |
| Bulk discard/retry | ❌ | ✅ |

Daemon API endpoints are local-only (not exposed over network). Access control is implicit — reaching the daemon means you are the local user. No multi-user permission model beyond authentication.

### Token Handling
- Token from CLI keychain or CODEPLANE_TOKEN env var
- Bearer token in Authorization header via @codeplane/ui-core
- Token never displayed, logged, or in error messages
- 401 → app-shell auth error screen

### Rate Limiting
- GET endpoints: no rate limit (local-only, polled at 3s)
- POST resolve/retry: 60 req/min with client-side single-fire guards
- Bulk operations: sequential execution (not parallel)
- Confirmation dialogs gate destructive actions

### Data Sensitivity
Conflict items contain API paths (repo names, issue IDs), error messages (server details), and request bodies (user content). All shown to local daemon operator — no cross-user exposure risk.

## Telemetry & Product Analytics

### Key Events
- `tui.sync.conflict_list.view`: screen mounted (conflict_count, failed_count, sync_status, breakpoint, load_time_ms, entry_method)
- `tui.sync.conflict_list.view_detail`: Enter on item (item_id, status, method, resource_type, error_length, has_body)
- `tui.sync.conflict_list.resolve`: single discard confirmed (conflict_id, method, path, age_seconds, success)
- `tui.sync.conflict_list.retry`: single retry (item_id, method, path, previous_status, success)
- `tui.sync.conflict_list.bulk_resolve`: bulk discard (count, success_count, failure_count, duration_ms)
- `tui.sync.conflict_list.bulk_retry`: bulk retry (count, success_count, failure_count, duration_ms)
- `tui.sync.conflict_list.filter_status/method`: filter cycled (new_filter, visible_count)
- `tui.sync.conflict_list.search`: text search (search_text_length, match_count)
- `tui.sync.conflict_list.session_complete`: unmount (session_duration_ms, conflicts_resolved, conflicts_retried, initial_count, final_count)
- `tui.sync.conflict_list.error/daemon_unreachable`: API failures

### Common Properties
session_id, timestamp, terminal_width, terminal_height, color_mode, breakpoint

### Success Indicators
- Screen load: >98%
- Resolution rate: >80% within 24h
- Session completion (all resolved): >40%
- Empty state reached: >50% of sessions
- Detail inspection: >50% of sessions
- Bulk action adoption: >15% (when >3 conflicts)
- Error rate: <5%
- Time to interactive: <500ms
- Dialog completion: >70%
- Repeat visits <1h: <30%

## Observability

### Logging (stderr, level via CODEPLANE_LOG_LEVEL)
- debug: mounted, polled, filter changed, focus changed, detail opened/closed, dialog shown/cancelled
- info: screen ready, conflict resolved, item retried, bulk resolve/retry started/complete
- warn: daemon unreachable, resolve/retry failed, slow poll (>5s), malformed data, optimistic rollback
- error: auth error (401), render error

### TUI Error Cases
- Daemon not running → "Daemon not running" message; polls and auto-recovers
- Daemon not connected → informational message with CLI hint
- Resize during polling/scroll/modal/dialog → synchronous re-layout, fetch continues
- Auth expiry → auth error screen
- Network timeout (30s) → inline error with R to retry
- Resolve/retry 404 → row removed with flash
- Resolve/retry 500 → item remains with error flash
- Optimistic rollback → item reappears within 500ms
- Rapid d/y → client-side guard, "Action in progress" flash
- Terminal suspend/resume → polling pauses/resumes
- No color support → text markers ([CON], [FAL])
- Memory cap → 500 items, footer shows count
- Bulk partial failure → completed removed, failed remain
- Malformed data → skip item, log warning
- SSE disconnect → unaffected (REST polling)

### Failure Modes
- Component crash → error boundary → "Press r to restart"
- All API fails → "Daemon not running" + navigation still works
- Bulk interrupted → completed persist, remaining stay

## Verification

### Test File: e2e/tui/sync.test.ts (describe("TUI_SYNC_CONFLICT_LIST"))

### Snapshot Tests (24)
SNAP-CL-001–024: Full layouts at 120×40, 80×24, 200×60; summary bar states; filter toolbar; conflict/failed rows; focused row; empty states (filtered/unfiltered); search input; detail modal (with/without body); discard/bulk discard/bulk retry confirmation modals; daemon not running; disconnected; loading; breadcrumb; status bar hints; resource descriptions; path truncation.

### Keyboard Tests (38)
KEY-CL-001–038: j/k/arrows navigate; Enter opens detail modal; d opens discard confirmation; y/Enter confirm, n/Esc cancel; y retries immediately; X bulk discard; A bulk retry; f cycles status filter; m cycles method filter; filters compose; / focuses search; search narrows case-insensitively; Esc priority chain; G/gg jump; Ctrl+D/U page; R refreshes; navigation keys disabled in search input.

### Responsive Tests (17)
RESP-CL-001–017: 80×24 layout (condensed, abbreviated, no error, no method filter, 90% modals); 120×40 layout (full toolbar, error preview, 60% modals); 200×60 layout (API path column); resize transitions preserve focus/filters/scroll/modal/dialog state; rapid j at each breakpoint.

### Integration Tests (20)
INT-CL-001–020: Auth expiry; daemon not running/starts mid-session; network timeout; discard success/404/500; retry success/404/500; optimistic rollback; bulk discard success/partial failure; bulk retry success; navigation from sync screen/deep-link/palette/goto; polling updates/pauses; filter reduces below focus.

### Edge Case Tests (16)
EDGE-CL-001–016: No auth; long errors; Unicode paths; single item; concurrent resize+nav; special search chars; rapid d/y; filtered last item; all-failed with conflicts filter; nested JSON body; >10KB body; 500-item cap; Esc priority chain; 50+ bulk with progress; malformed data.

All 115 tests left failing if backend is unimplemented — never skipped or commented out.

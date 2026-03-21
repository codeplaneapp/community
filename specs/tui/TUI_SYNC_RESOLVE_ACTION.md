# TUI_SYNC_RESOLVE_ACTION

Specification for TUI_SYNC_RESOLVE_ACTION.

## High-Level User POV

The Sync Resolve Action is the primary user-facing interaction for resolving sync conflicts in the Codeplane TUI's local-first daemon mode. When the daemon's sync queue encounters a 409 Conflict response from the remote server — meaning the local queued write cannot be reconciled automatically with the server's current state — the conflict appears as a red, bold row in the sync queue list on the Sync Status screen. The resolve action gives the user two paths forward: **discard** the conflicting local operation (permanently removing it from the queue, accepting the remote state as canonical) or **retry** the operation (resetting it to pending so the next sync flush replays it against the remote).

From the Sync Status screen (`g y`), the user navigates the queue list with `j`/`k` to focus a conflict row. The focused row is highlighted with reverse video and a `▸` indicator. Conflict rows are visually distinct: the status column reads "conflict" in bold red text, and the error preview column shows a truncated version of the server's 409 response message. The user presses `Enter` to inspect the full conflict detail in a modal overlay before deciding, or acts directly with `d` to discard or `y` to retry.

**Discarding a conflict** is a destructive action — the queued operation is permanently deleted from the local `_sync_queue` table via `SyncQueue.discardConflict()`. The TUI enforces a two-step confirmation flow: pressing `d` on a conflict row opens a confirmation modal with the operation summary (HTTP method, API path, and error message) and two clearly labeled options: `Enter` to confirm the discard, or `Esc` to cancel. On confirmation, the TUI calls `POST /api/daemon/conflicts/:id/resolve`, which verifies the item exists and has `conflict` status before deleting it. The row is optimistically removed from the list, the conflict count in the sync queue summary panel decrements, and a success flash message appears in the status bar ("Conflict discarded"). If the conflict was already resolved (server returns 404 with "conflict not found"), the row is silently removed and a flash reads "Conflict already resolved."

**Retrying a conflict** resets the queue item's status from `conflict` (or `failed`) back to `pending` so that the next sync flush — automatic or manual via `S` — replays the operation against the remote via `SyncQueue.flush()`. Pressing `y` on a conflict or failed row immediately (no confirmation needed — retry is non-destructive) calls `POST /api/daemon/conflicts/:id/retry`, which resets the item's status to `pending` and clears the error message. The row's status badge changes optimistically from red "conflict"/"failed" to yellow "pending", and the conflict count decrements while the pending count increments. If the item was already removed (404), the row disappears with a flash "Item no longer in queue."

Both actions also work from within the **error detail modal**: pressing `Enter` on a conflict or failed row opens a scrollable overlay showing the full error message, the HTTP method and path, the local ID if present, a JSON-formatted preview of the request body (syntax-highlighted via `<code>`), and the creation timestamp. Within this modal, the user can press `d` to discard or `y` to retry without closing the modal first — the action executes and the modal closes automatically on success.

The resolve action is designed for rapid triage. In a session with multiple conflicts, the user can work through them sequentially: focus a conflict, press `d` or `y`, see the flash, move to the next conflict. Focus automatically advances to the next conflict row after a discard. If the last conflict is discarded, focus moves to the previous item or the empty state message appears. The sync queue summary panel updates in real-time to reflect the new counts. When the last conflict is resolved, the summary panel shows "All clear — no pending items" in green and the global status bar's conflict indicator clears.

All resolve actions respect client-side guards: pressing `d` or `y` multiple times on the same item while an action is in-flight shows "Action in progress" in the status bar rather than firing duplicate API calls. The status bar keybinding hints update contextually — when focused on a conflict row, the hints include `d:discard y:retry Enter:detail`; when focused on a failed row, `y:retry Enter:detail`; when focused on a pending or synced row, those action hints are absent.

## Acceptance Criteria

### Definition of Done

- [ ] Pressing `d` on a focused sync queue item with status `conflict` opens the discard confirmation modal
- [ ] Pressing `d` on a focused item with status `pending`, `synced`, or `failed` is a no-op (no modal, no action)
- [ ] The discard confirmation modal displays the item's HTTP method, API path, error message, creation timestamp, and a warning about permanent removal
- [ ] Pressing `Enter` inside the discard confirmation modal calls `POST /api/daemon/conflicts/:id/resolve` and removes the row from the queue list
- [ ] Pressing `Esc` inside the discard confirmation modal dismisses without action
- [ ] After successful discard, the conflict count in the summary panel decrements by one
- [ ] After successful discard, a flash message "Conflict discarded" appears for 3 seconds in the status bar area
- [ ] Pressing `y` on a focused item with status `conflict` or `failed` calls `POST /api/daemon/conflicts/:id/retry` and optimistically changes the row's status to `pending`
- [ ] Pressing `y` on a focused item with status `pending` or `synced` is a no-op
- [ ] After successful retry, the item's status badge changes from red (`conflict`/`failed`) to yellow (`pending`)
- [ ] After successful retry, the conflict/failed count in the summary panel decrements and pending count increments
- [ ] After successful retry, a flash message "Item queued for retry" appears for 3 seconds
- [ ] Pressing `Enter` on a focused item with status `conflict` or `failed` opens the error detail modal
- [ ] The error detail modal is scrollable (`<scrollbox>`) and shows: HTTP method, API path, local ID (if present), full error message, request body preview (formatted JSON via `<code language="json">`), and creation timestamp (absolute format)
- [ ] From inside the error detail modal, pressing `d` triggers the discard flow (opens confirmation modal on top) when item status is `conflict`
- [ ] From inside the error detail modal, pressing `y` triggers the retry action and closes the modal when item status is `conflict` or `failed`
- [ ] From inside the error detail modal, pressing `Esc` closes the modal and returns focus to the queue list
- [ ] Focus advances to the next item after discard; if discarded item was last, focus moves to previous item; if queue is now empty, empty state shown
- [ ] Focus remains on the same item after retry (item stays in list with updated status)
- [ ] The `useConflictResolve()` hook from `@codeplane/ui-core` is used for discard API calls
- [ ] The `useConflictRetry()` hook from `@codeplane/ui-core` is used for retry API calls
- [ ] Both hooks trigger immediate re-fetch of `useSyncConflicts()` and `useDaemonStatus()` after action completes to sync counts
- [ ] Client-side in-flight guard prevents duplicate API calls from rapid keypresses on the same item (tracked by item ID)
- [ ] In-flight guard shows "Action in progress" flash on repeated presses
- [ ] Server 404 on discard removes the row and flashes "Conflict already resolved"
- [ ] Server 404 on retry removes the row and flashes "Item no longer in queue"
- [ ] Server 500 or network error on discard: optimistic removal reverts (row reappears), error flash shown
- [ ] Server 500 or network error on retry: optimistic status change reverts, error flash shown
- [ ] Status bar keybinding hints update contextually based on the focused row's status
- [ ] All actions work correctly when the queue list is filtered (via `/`)
- [ ] After discarding a conflict while filter is active, the filtered list updates correctly
- [ ] Polling continues during resolve actions; poll results merge with optimistic state correctly

### Keyboard Interactions

- [ ] `d` key triggers discard flow only when a conflict-status item is focused in the queue list
- [ ] `d` key triggers discard flow from within the error detail modal (if the item is a conflict)
- [ ] `y` key triggers retry only when a conflict-status or failed-status item is focused
- [ ] `y` key triggers retry from within the error detail modal (if item is conflict or failed)
- [ ] `Enter` confirms discard inside the confirmation modal
- [ ] `Esc` cancels discard inside the confirmation modal
- [ ] `Esc` closes the error detail modal
- [ ] `d` and `y` keys are suppressed when the filter input (`/`) is focused
- [ ] `d` and `y` keys are suppressed when the discard confirmation modal is open (only `Enter`/`Esc` active)
- [ ] Rapid `d` presses on the same conflict item: first opens confirmation; subsequent no-ops while modal is open
- [ ] Rapid `y` presses on the same item: first fires retry; subsequent no-ops while in-flight
- [ ] `Esc` priority chain: discard confirmation modal → error detail modal → filter input → pop screen

### Edge Cases — Terminal Environments

- [ ] Terminal resize while modal open: width recalculates (90%/<120, 50%/120-199, 40%/≥200) without dismissing
- [ ] No color support (`TERM=dumb`): text markers (`[CONFLICT]`, `[FAILED]`), ASCII borders (`+`, `-`, `|`), `[!]` warning icon
- [ ] Rapid `d`+`Enter` (<50ms): modal must render before `Enter` is accepted
- [ ] In-flight action when user presses `q`: action completes in background, navigation proceeds
- [ ] API call >5s: spinner on affected row; 30s network timeout
- [ ] Terminal suspend (`Ctrl+Z`) during modal: modal preserved on `fg` resume
- [ ] ANSI escape codes in error messages: stripped before display

### Boundary Constraints

- [ ] Error message in confirmation modal: max 500ch inline; longer wrapped/scrollable
- [ ] API path in confirmation modal: full display, scrollable if exceeds width
- [ ] Request body preview: truncated at 2000ch with "… (truncated)"
- [ ] Local ID: full UUID in detail modal; 12ch with `…` in confirmation modal
- [ ] Flash duration: 3 seconds
- [ ] In-flight guard: 1 per item ID; 30s timeout
- [ ] Confirmation modal min width: 40 cols
- [ ] Error detail modal min height: 10 rows

## Design

### Discard Confirmation Modal

Centered overlay (`position="absolute"`, `top/left="center"`) with red `border="single"` indicating destructive action. Width: 90% (minimum), 50% (standard), 40% (large). Height: 7 rows. zIndex: 20 (above error detail modal).

Content: title "Discard Conflict?" in bold warning color, operation summary (method in primary bold + path), error preview in error color, relative timestamp, warning text in muted, and action hints (`Enter: confirm discard` in error bold, `Esc: cancel` in muted).

Components: `<box position="absolute">`, `<box flexDirection="column">`, `<text>` for all labels/values.

### Error Detail Modal

Centered overlay with error-color border. Width: 90%/60%/50% by breakpoint. Height: 80%/60%/50% by breakpoint. zIndex: 10.

Content sections: title bar with "Conflict Detail" and "Esc:close", metadata fields (status with color, method in primary, path, local ID, absolute timestamp with relative), error message in `<scrollbox>`, request body in `<scrollbox>` with `<code language="json">` for syntax highlighting, and contextual action hints (d: discard for conflicts, y: retry for conflict/failed, Esc: close).

### Flash Messages

Transient overlay at bottom-left of screen (60% width, 1 row, zIndex 5). Auto-dismisses after 3 seconds. Color-coded: success green for confirmations, muted gray for 404s, error red for failures, warning yellow for in-progress blocks.

### Contextual Status Bar Hints

Hints change based on focused row status: conflict rows show `d:discard y:retry Enter:detail`, failed rows show `y:retry Enter:detail`, pending/synced rows show no resolve hints.

### Optimistic UI

Discard: modal closes → row removed → count decremented → flash shown → API fires → on error: row reappears, count incremented.
Retry: status badge yellow → counts updated → flash shown → API fires → on error: status reverts, counts revert.

### Focus Management

After discard: focus advances to next item; if last item, moves to previous; if only item, shows empty state. After retry: focus stays on same item.

### Data Hooks

- `useConflictResolve()` → `POST /api/daemon/conflicts/:id/resolve`
- `useConflictRetry()` → `POST /api/daemon/conflicts/:id/retry`
- `useSyncConflicts()` → `GET /api/daemon/conflicts` (polled every 3s)
- `useDaemonStatus()` → `GET /api/daemon/status` (polled every 3s)
- `useKeyboard()`, `useTerminalDimensions()`, `useOnResize()` from `@opentui/react`

### Keybindings

| Key | Context | Action | Condition |
|-----|---------|--------|----------|
| `d` | Queue list | Open discard confirmation | Focused = conflict, no in-flight |
| `d` | Error detail modal | Open stacked confirmation | Item = conflict, no in-flight |
| `y` | Queue list | Retry immediate | Focused = conflict/failed, no in-flight |
| `y` | Error detail modal | Retry and close modal | Item = conflict/failed, no in-flight |
| `Enter` | Confirmation modal | Execute discard | Always |
| `Esc` | Confirmation modal | Dismiss | Always |
| `Esc` | Error detail modal | Close, return to list | Always |
| `j`/`k` | Error detail modal | Scroll content | Scrollbox overflow |

### Responsive Behavior

| Breakpoint | Confirmation | Error Detail | Flash |
|------------|-------------|-------------|-------|
| 80×24 | 90% width, wrapped | 90%×80%, condensed | ≤60ch |
| 120×40 | 50% width, full | 60%×60%, full labels | ≤80ch |
| 200×60 | 40% width, padded | 50%×50%, generous | ≤80ch |

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated |
|--------|-----------|---------------|
| Discard conflict | ❌ | ✅ |
| Retry conflict/failed | ❌ | ✅ |
| View error detail | ❌ | ✅ |

- All resolve/retry actions require authentication. Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var.
- Daemon API routes (`/api/daemon/*`) are local-only (localhost binding). Access control is implicit.
- Discard permanently deletes a `_sync_queue` row via `SyncQueue.discardConflict()`. Does not modify remote state.
- Retry resets item to `pending` via SQL UPDATE. Remote API call uses daemon's stored token on next flush.
- Confirmation modal is a product safety measure, not a security boundary.

### Token-based Auth

- Bearer token in Authorization header on all daemon API calls
- 401 → auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- Token never displayed in modals, error messages, or flash messages
- Request body previews may contain user data — acceptable as user's own data on own machine

### Rate Limiting

- `POST /api/daemon/conflicts/:id/resolve`: 60 req/min (daemon-side), 1 concurrent per item ID (client-side)
- `POST /api/daemon/conflicts/:id/retry`: 60 req/min (daemon-side), 1 concurrent per item ID (client-side)
- Sequential resolves across different items fire independently
- 3-second polling bypassed after action (immediate re-fetch), then resumes normal cadence
- 429 → error flash "Too many requests. Wait a moment."

### Data Sensitivity

- Error messages may contain server internals — shown to local daemon operator
- Request body JSON may contain user-authored content — user's own data on own machine
- No data sent to third parties; all communication is TUI → local daemon → remote server
- Request body NOT shown in discard confirmation (only in error detail modal)

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.sync.resolve_conflict` | Discard confirmed | `conflict_id`, `method`, `path`, `error_type`, `success`, `time_to_confirm_ms`, `was_from_detail_modal`, `conflicts_remaining`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.sync.resolve_conflict_cancelled` | Discard cancelled (Esc) | `conflict_id`, `method`, `path`, `time_in_modal_ms` |
| `tui.sync.retry_item` | Retry triggered | `item_id`, `method`, `path`, `previous_status`, `success`, `was_from_detail_modal`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.sync.view_detail` | Error detail opened | `item_id`, `status`, `method`, `path`, `error_length`, `body_length`, `terminal_width`, `terminal_height` |
| `tui.sync.detail_action` | Action from within detail modal | `item_id`, `action`, `time_in_modal_ms` |
| `tui.sync.resolve_error` | API error on resolve/retry | `item_id`, `action`, `http_status`, `error_message`, `endpoint` |
| `tui.sync.resolve_404` | 404 on resolve/retry | `item_id`, `action` |
| `tui.sync.batch_resolve` | 3+ conflicts resolved within 60s | `count`, `all_discarded`, `all_retried`, `mixed`, `duration_ms` |
| `tui.sync.inflight_blocked` | Duplicate action blocked | `item_id`, `blocked_action`, `time_since_first_action_ms` |

### Common Properties

`session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------|
| Resolve completion rate | >90% of modals confirmed | High cancel = unclear messaging |
| Retry success on next flush | >50% | Below = systemic conflicts |
| Resolution rate per session | >80% of conflicts resolved | Users shouldn't leave conflicts |
| Time d→Enter | <5s median | Quick = clear understanding |
| Detail view before discard | >40% | Users should understand context |
| API error rate | <2% | Calls should rarely fail |
| Zero-conflict sessions | >60% | Most should clear all conflicts |
| Optimistic revert rate | <10% | High = too many server errors |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Confirmation opened | `Sync.Resolve: confirm modal opened [id={id}] [method={m}] [path={p}]` |
| `debug` | Confirmation cancelled | `Sync.Resolve: confirm cancelled [id={id}] [duration={ms}ms]` |
| `debug` | Detail modal opened | `Sync.Resolve: detail opened [id={id}] [status={s}] [error_length={n}]` |
| `debug` | Detail modal closed | `Sync.Resolve: detail closed [id={id}] [duration={ms}ms]` |
| `info` | Discard initiated | `Sync.Resolve: discard started [id={id}] [method={m}] [path={p}]` |
| `info` | Discard succeeded | `Sync.Resolve: discard ok [id={id}] [method={m}] [path={p}] [duration={ms}ms]` |
| `info` | Retry initiated | `Sync.Resolve: retry started [id={id}] [method={m}] [path={p}] [previous_status={s}]` |
| `info` | Retry succeeded | `Sync.Resolve: retry ok [id={id}] [method={m}] [path={p}] [duration={ms}ms]` |
| `warn` | Discard failed | `Sync.Resolve: discard failed [id={id}] [status={code}] [error={msg}] [duration={ms}ms]` |
| `warn` | Retry failed | `Sync.Resolve: retry failed [id={id}] [status={code}] [error={msg}] [duration={ms}ms]` |
| `warn` | 404 already resolved | `Sync.Resolve: discard 404 [id={id}] — item already resolved` |
| `warn` | 404 already removed | `Sync.Resolve: retry 404 [id={id}] — item no longer in queue` |
| `warn` | Optimistic revert | `Sync.Resolve: optimistic revert [id={id}] [action={a}] [error={msg}]` |
| `warn` | In-flight blocked | `Sync.Resolve: blocked duplicate [id={id}] [action={a}]` |
| `error` | Network timeout | `Sync.Resolve: timeout [id={id}] [action={a}] [timeout=30000ms]` |
| `error` | Auth error | `Sync.Resolve: auth error [status=401] [action={a}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Resize during confirmation | useOnResize | Modal recalculates width/height; focus preserved | Automatic |
| Resize during error detail | useOnResize | Scrollbox adjusts; scroll preserved | Automatic |
| Discard 404 | Response 404 | Row removed; flash "Conflict already resolved" | Auto |
| Retry 404 | Response 404 | Row removed; flash "Item no longer in queue" | Auto |
| Network failure on discard | Fetch throws | Optimistic revert; flash "Failed to discard" | User retries |
| Network failure on retry | Fetch throws | Status reverts; flash "Retry failed" | User retries |
| 30s timeout | Fetch timeout | Optimistic revert; flash "Request timed out" | User retries |
| Daemon restart mid-action | Connection refused | 404 handled; flash informs user | Next poll refreshes |
| Concurrent actions different items | Multiple fetches | Independent; tracked by item ID | No interference |
| No Unicode terminal | TERM=dumb | ASCII borders, text markers | Startup detection |
| ANSI in error messages | Raw server error | Codes stripped | Render-time sanitization |
| Poll during optimistic state | 3s poll | Merged: discarded hidden, retried keeps pending | Auto |

### Failure Modes

- Component crash in modal → error boundary → "Press r to restart"
- All daemon API failing → "Daemon not running" state; go-to keys and q still work
- Discard ok but poll shows item → resolved on next 3s poll
- Retry ok but re-conflicts on flush → item returns to conflict on next poll
- Memory: lightweight modals, scrollbox renders visible lines only, 2000ch body cap, 200-item queue cap

## Verification

### Test File: `e2e/tui/sync.test.ts`

All tests additive to TUI_SYNC_STATUS_SCREEN tests. Tests failing due to unimplemented backends are left failing — never skipped.

### Terminal Snapshot Tests (18)

- SNAP-RESOLVE-001: Discard confirmation modal at 120×40 — centered, red border, operation details, hints
- SNAP-RESOLVE-002: Discard confirmation modal at 80×24 — 90% width, condensed
- SNAP-RESOLVE-003: Discard confirmation modal at 200×60 — 40% width, generous padding
- SNAP-RESOLVE-004: Error detail modal at 120×40 — conflict item, full labels, JSON body, action hints
- SNAP-RESOLVE-005: Error detail modal at 80×24 — 90% width, 80% height, scrollable
- SNAP-RESOLVE-006: Error detail modal at 200×60 — 50% width, generous spacing
- SNAP-RESOLVE-007: Error detail modal for failed item — hints show `y: retry Esc: close` only
- SNAP-RESOLVE-008: Long error message (500+ chars) — wraps in scrollbox, scrollbar visible
- SNAP-RESOLVE-009: JSON request body — syntax-highlighted via `<code language="json">`
- SNAP-RESOLVE-010: Null request body — "No request body" placeholder
- SNAP-RESOLVE-011: Queue row after retry — status red→yellow
- SNAP-RESOLVE-012: Queue after discarding last conflict — previous item focused
- SNAP-RESOLVE-013: Empty state after discarding only item
- SNAP-RESOLVE-014: Flash "Conflict discarded" in green
- SNAP-RESOLVE-015: Flash "Conflict already resolved" in gray
- SNAP-RESOLVE-016: Flash "Item no longer in queue" in gray
- SNAP-RESOLVE-017: Stacked modals — confirmation (z20) over detail (z10)
- SNAP-RESOLVE-018: Contextual hints for conflict row

### Keyboard Interaction Tests (24)

- KEY-RESOLVE-001: `d` on conflict → confirmation modal
- KEY-RESOLVE-002: `d` on failed → no-op
- KEY-RESOLVE-003: `d` on pending → no-op
- KEY-RESOLVE-004: `d` on synced → no-op
- KEY-RESOLVE-005: `Enter` in confirmation → discard, row removed
- KEY-RESOLVE-006: `Esc` in confirmation → dismiss, unchanged
- KEY-RESOLVE-007: `y` on conflict → status to pending
- KEY-RESOLVE-008: `y` on failed → status to pending
- KEY-RESOLVE-009: `y` on pending → no-op
- KEY-RESOLVE-010: `y` on synced → no-op
- KEY-RESOLVE-011: `Enter` on conflict → error detail modal
- KEY-RESOLVE-012: `Enter` on failed → error detail modal
- KEY-RESOLVE-013: `d` in detail modal → stacked confirmation
- KEY-RESOLVE-014: `y` in detail modal (conflict) → retry, close
- KEY-RESOLVE-015: `y` in detail modal (failed) → retry, close
- KEY-RESOLVE-016: `Esc` in detail → close, focus to list
- KEY-RESOLVE-017: `Esc` chain: confirmation → detail → list
- KEY-RESOLVE-018: After discard → focus advances
- KEY-RESOLVE-019: After discard last → focus to previous
- KEY-RESOLVE-020: After discard only → empty state
- KEY-RESOLVE-021: After retry → focus stays, status updated
- KEY-RESOLVE-022: Rapid `d` → no-op while modal open
- KEY-RESOLVE-023: Rapid `y` → in-flight guard blocks
- KEY-RESOLVE-024: `d`/`y` suppressed during filter focus

### Responsive Tests (8)

- RESP-RESOLVE-001: Confirmation at 80×24 — 90% width
- RESP-RESOLVE-002: Confirmation at 120×40 — 50% width
- RESP-RESOLVE-003: Confirmation at 200×60 — 40% width
- RESP-RESOLVE-004: Error detail at 80×24 — 90%×80%
- RESP-RESOLVE-005: Error detail at 120×40 — 60%×60%
- RESP-RESOLVE-006: Error detail at 200×60 — 50%×50%
- RESP-RESOLVE-007: Resize 120→80 with confirmation open — width adjusts
- RESP-RESOLVE-008: Resize 80→200 with detail open — contracts, scroll preserved

### Integration Tests (20)

- INT-RESOLVE-001: Discard 200 — row removed, count decrements
- INT-RESOLVE-002: Discard 404 — row removed, flash "already resolved"
- INT-RESOLVE-003: Discard network fail — revert, error flash
- INT-RESOLVE-004: Discard 500 — revert, error flash
- INT-RESOLVE-005: Retry conflict 200 — status to pending
- INT-RESOLVE-006: Retry failed 200 — status to pending
- INT-RESOLVE-007: Retry 404 — row removed, flash
- INT-RESOLVE-008: Retry network fail — revert, flash
- INT-RESOLVE-009: Retry 500 — revert, flash
- INT-RESOLVE-010: Discard re-fetches daemon status
- INT-RESOLVE-011: Retry re-fetches daemon status
- INT-RESOLVE-012: Discard only conflict — status bar clears
- INT-RESOLVE-013: Resolve 3 conflicts sequentially — "All clear" shown
- INT-RESOLVE-014: Discard during force sync — independent
- INT-RESOLVE-015: Retry then force sync — item flushed
- INT-RESOLVE-016: Inspect body in detail, discard from modal
- INT-RESOLVE-017: Retry from detail modal — closes, updates
- INT-RESOLVE-018: 401 during discard — auth screen
- INT-RESOLVE-019: 401 during retry — auth screen
- INT-RESOLVE-020: Discard while filtered — both views update

### Edge Case Tests (14)

- EDGE-RESOLVE-001: Concurrent discard+retry on different items
- EDGE-RESOLVE-002: Daemon restart mid-detail — 404 handled
- EDGE-RESOLVE-003: 2000+ char error — scrollbox scrollable
- EDGE-RESOLVE-004: Deeply nested JSON body — truncated at 2000ch
- EDGE-RESOLVE-005: Null request body — placeholder shown
- EDGE-RESOLVE-006: Resize below 80×24 with modal — "too small", restores
- EDGE-RESOLVE-007: Rapid d+Enter (<50ms) — modal must render first
- EDGE-RESOLVE-008: Discard last, then `q` — clean navigation
- EDGE-RESOLVE-009: Unicode in API path — correct display, grapheme truncation
- EDGE-RESOLVE-010: Multiple retry cycles on same item
- EDGE-RESOLVE-011: Filter conflicts → discard all → clear filter → non-conflicts visible
- EDGE-RESOLVE-012: Poll during confirmation modal — merges correctly
- EDGE-RESOLVE-013: Detail open for item resolved by poll — 404 handled
- EDGE-RESOLVE-014: No-color terminal — text markers instead of color

Total: 84 tests. All left failing if backend unimplemented.

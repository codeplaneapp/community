# TUI_SYNC_FORCE_SYNC

Specification for TUI_SYNC_FORCE_SYNC.

## High-Level User POV

The force sync feature gives the terminal user an explicit, keyboard-driven way to flush all pending local changes to the remote Codeplane server immediately, rather than waiting for the daemon's automatic 5-second flush interval. It is the sync equivalent of a manual "push" — the user presses `S` (Shift+S) from the Sync Status screen and watches the pending queue drain in real time.

The interaction begins when the user is on the Sync Status screen (reached via `g y`, `:sync` in the command palette, or `codeplane tui --screen sync`) and sees one or more pending items in the sync queue summary. Pressing `S` initiates the force sync. The status banner transitions from its current state (typically `● Online`) to `◐ Syncing…` with a braille character spinner animating at 80ms intervals. The pending count in the sync queue summary decrements as items are processed. The `S` keybinding hint in the status bar changes to a muted "syncing…" indicator, signaling that the action is in-flight and additional `S` presses will be ignored until the operation completes.

When the sync completes, a transient toast message appears below the status banner showing the result: "Synced 5 items (0 conflicts, 0 failed)" in green on a clean run, or with conflict/failure counts highlighted in yellow/red if some items could not sync. The toast remains visible for 5 seconds and then auto-dismisses, returning the banner to the normal status display. The sync queue list refreshes to reflect the new item states — previously pending items now show as synced, and any newly detected conflicts or failures appear highlighted.

If the user presses `S` when no pending items exist, no network call is made. Instead, the status bar briefly flashes "Nothing to sync" for 2 seconds. If the user presses `S` while a sync is already in progress, the status bar flashes "Sync already in progress" for 2 seconds. Both guards prevent unnecessary API calls and provide clear feedback.

The force sync operation respects the existing sync queue semantics: items are flushed in FIFO order, 409 Conflict responses from the remote API cause individual items to transition to "conflict" status, and network or server errors cause items to transition to "failed" status. The user can then use the existing `d` (discard) and `y` (retry) keybindings on individual conflict/failed items to resolve them after the sync completes.

Force sync is also available from the error detail modal overlay — when viewing a conflict or failed item's details, pressing `S` triggers a force sync of all pending items (not just the viewed item). This is a convenience for users who discover stale pending items while investigating conflicts.

The feature is designed for burst scenarios: a developer makes several local changes offline, reconnects, and wants immediate confirmation that everything synced. It is also the primary recovery mechanism after resolving conflicts — discard or retry affected items, then press `S` to push remaining pending items through.

## Acceptance Criteria

### Definition of Done
- [ ] Pressing `S` (Shift+S) on the Sync Status screen triggers a force sync via `useSyncForce()` from `@codeplane/ui-core`, calling `POST /api/daemon/sync`
- [ ] The status banner transitions to `◐ Syncing…` with a braille spinner during the operation
- [ ] The spinner uses braille frames (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) cycling at 80ms intervals via `useTimeline()` from `@opentui/react`
- [ ] On success, a toast message appears: "Synced {total} items ({conflicts} conflicts, {failed} failed)"
- [ ] Toast text uses `success` color (green 34) when all items synced, `warning` color (yellow 178) when conflicts > 0, `error` color (red 196) when failed > 0
- [ ] Toast is visible for 5 seconds, then automatically dismissed
- [ ] Sync queue list refreshes immediately upon force sync completion (bypasses the 3-second poll interval)
- [ ] Sync queue summary counts (pending, synced, conflict, failed) update to reflect the post-sync state
- [ ] Pressing `S` while a sync is already in progress is a no-op; the status bar flashes "Sync already in progress" for 2 seconds
- [ ] Pressing `S` with zero pending items is a no-op; the status bar flashes "Nothing to sync" for 2 seconds
- [ ] `S` is available from both the queue list view and the error detail modal overlay
- [ ] The `S` keybinding is listed in the status bar hints: `j/k:nav S:sync d:discard y:retry r:refresh q:back`
- [ ] The `S` keybinding is documented in the `?` help overlay
- [ ] Breadcrumb remains "Dashboard > Sync Status" throughout the force sync lifecycle
- [ ] `isSyncing` flag is cleared on success, error, and timeout — never left permanently set

### Keyboard Interactions
- [ ] `S` (Shift+S): Initiate force sync (only when not already syncing and pending > 0)
- [ ] `S` during sync: No-op with "Sync already in progress" flash
- [ ] `S` with 0 pending: No-op with "Nothing to sync" flash
- [ ] All other keybindings (`j`, `k`, `Enter`, `d`, `y`, `/`, `r`, `q`, `G`, `gg`, `Ctrl+D`, `Ctrl+U`) remain functional during force sync in-progress state
- [ ] `q` during force sync: Pops the screen; sync continues in background (daemon-side), result is not displayed
- [ ] `Esc` does not cancel a force sync in progress (the sync is server-side and cannot be cancelled)
- [ ] `S` while filter input is focused: No-op — keystroke captured by the input field, not global bindings

### Responsive Behavior
- [ ] At 80×24 (minimum): Toast message uses abbreviated format: `"Synced {n} ({c} conf, {f} fail)"`. Spinner visible in single-line status banner. Progress hint hidden
- [ ] At 120×40 (standard): Full toast message with all counts displayed. Two-line status banner with spinner + "Flushing N pending items…". Toast positioned below status banner, full width
- [ ] At 200×60+ (large): Same as standard with more horizontal padding. Toast has generous spacing. Full remote URL visible in banner
- [ ] Terminal resize during force sync: Layout recalculates synchronously. Spinner and toast adjust to new width. Sync operation is unaffected

### Truncation & Boundary Constraints
- [ ] Toast message: max 80 characters at minimum terminal width, truncated with `…` if necessary
- [ ] Toast counts: abbreviated above 9999 ("9999+")
- [ ] Spinner frame width: exactly 1 character (braille character)
- [ ] Status bar flash messages: max 40 characters
- [ ] Flash message duration: 2 seconds (then restores previous hint text)
- [ ] Toast duration: 5 seconds (then auto-dismissed)
- [ ] Force sync timeout: 30 seconds (client-side AbortSignal)
- [ ] Maximum pending items processed in one sync: no client-side cap (server-side `flushQueue` processes all)
- [ ] Progress hint text: pending count formatted as integer, no abbreviation

### Edge Cases
- [ ] Force sync while daemon is not running: Error toast shown; no crash
- [ ] Force sync with no remote configured (400 response): Error toast shows server message
- [ ] Force sync timeout (30 seconds): Error toast "Sync timed out. Press S to retry." with `error` color
- [ ] Force sync network error: Error toast with network error message
- [ ] Force sync returns partial success: Toast shows all counts with mixed colors
- [ ] Force sync returns 0 total (race with auto-flush): Toast shows "Synced 0 items" with success color
- [ ] Auth error (401): Auth error screen pushed
- [ ] Rapid S presses (5× in 200ms): Only the first triggers the sync
- [ ] Terminal resize during toast display: Toast re-renders at new width
- [ ] Navigate away during force sync: Screen pops; no toast shown
- [ ] Force sync immediately after discard or retry: Both operations succeed independently
- [ ] Daemon restart mid-sync: Connection error; error toast shown
- [ ] `S` while filter input is focused: No-op
- [ ] Very large queue (200 items, all pending): Sync processes all; toast shows aggregate result
- [ ] Force sync completes but poll fires simultaneously: Data reconciles without duplicates
- [ ] Rate limit (429) response: Error toast shown
- [ ] No color support (16-color terminal): Spinner uses ASCII fallback, toast uses text markers
- [ ] Force sync immediately after screen mount: Sync triggers with pending count from initial load
- [ ] Force sync with exactly 1 pending item: Toast shows singular "Synced 1 item"

## Design

### Layout Integration

Force sync does not introduce a new screen. It is an action on the Sync Status screen that modifies the status banner, shows a transient toast, and triggers a data refresh.

### Status Banner — Syncing State

When force sync is active, the status banner replaces the current status with a `<box>` containing `<text color="warning" bold>◐ Syncing… {spinnerFrame}</text>` with an optional remote URL at standard+ sizes, and a second line showing "Flushing {pendingCount} pending items…" in muted color (hidden at 80×24).

### Toast — Sync Result

After force sync completes, a `<box height={1} paddingX={1}>` toast appears below the status banner for 5 seconds with `<text>` showing the result. Color is determined by result: `success` (green 34) when all synced, `warning` (yellow 178) when conflicts > 0, `error` (red 196) when failed > 0. Prefixed with ✓/⚠/✗ icon.

### Toast — Error States

Error toasts use `<text color="error" bold>` with ✗ prefix. Messages: timeout ("Sync timed out. Press S to retry."), no remote, network error, daemon unreachable, rate limited, server error.

### Status Bar Flash

Transient flash messages replace keybinding hints for 2 seconds using `<text color="muted" italic>`. Flash messages: "Nothing to sync" (0 pending) and "Sync already in progress" (mid-sync).

### Spinner

Driven by `useTimeline(80)` from `@opentui/react` with braille frames (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏). ASCII fallback `[|]`, `[/]`, `[-]`, `[\]` for 16-color terminals.

### Components Used
- `<box>` — Layout containers for toast, status banner modifications, flash message area
- `<text>` — Toast message, flash message, spinner character, progress hint, error messages

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `S` (Shift+S) | Initiate force sync | Not mid-sync, pending > 0, filter input not focused |
| `S` during sync | No-op, flash "Sync already in progress" | Sync in progress |
| `S` with 0 pending | No-op, flash "Nothing to sync" | Pending count === 0 |

All existing Sync Status screen keybindings remain active during force sync.

### Responsive Behavior

| Breakpoint | Toast Format | Status Banner |
|-----------|-------------|---------------|
| 80×24 min | `"Synced {n} ({c} conf, {f} fail)"` | 1-line: `◐ Syncing… {spinner}` |
| 120×40 std | `"Synced {n} items ({c} conflicts, {f} failed)"` | 2-line: spinner + "Flushing N pending items…" |
| 200×60 lg | Same as standard with generous padding | 2-line with full remote URL |

### Data Hooks
- `useSyncForce()` from `@codeplane/ui-core` → `POST /api/daemon/sync` — returns `{ total, synced, conflicts, failed }`
- `useDaemonStatus()` from `@codeplane/ui-core` → `GET /api/daemon/status` — immediate re-fetch after sync
- `useSyncConflicts()` from `@codeplane/ui-core` → `GET /api/daemon/conflicts` — immediate re-fetch after sync
- `useTerminalDimensions()` from `@opentui/react` — responsive breakpoint detection
- `useOnResize()` from `@opentui/react` — synchronous re-layout during sync
- `useKeyboard()` from `@opentui/react` — `S` key handler with guard conditions
- `useTimeline()` from `@opentui/react` — spinner animation at 80ms intervals

### API Endpoint
- `POST /api/daemon/sync` — Force flush all pending sync queue items
  - Request: no body
  - Response 200: `{ total: number, synced: number, conflicts: number, failed: number }`
  - Response 400: `{ error: "No remote configured..." }`
  - Response 401: auth error
  - Response 429: rate limit exceeded
  - Response 500: server error

### Navigation
- Force sync does not change the screen stack
- `q` during or after force sync pops the screen normally
- Go-to keys remain active during force sync
- If user navigates away during sync, the daemon completes the flush server-side; result is not displayed

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Local User) |
|--------|-----------|---------------------------|
| Trigger force sync | ❌ | ✅ |
| View force sync result | ❌ | ✅ |

- Force sync requires authentication. If the token is missing or expired, the 401 response triggers the auth error screen
- The daemon API endpoints are local-only: they bind to `127.0.0.1` and are not exposed over the network. Access control is implicit — if you can reach the daemon socket, you are the local user
- The force sync operation uses the daemon's stored remote token (configured via `codeplane daemon connect`), not the TUI user's token directly. The TUI authenticates to the daemon; the daemon authenticates to the remote server
- The remote token is never displayed in the TUI (shown as `●●●●●●●● (configured)` in the connection details panel)

### Token-based Auth
- TUI authenticates to the daemon API via `Authorization: Bearer {token}` header
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- 401 from `POST /api/daemon/sync` propagates to the app-shell auth error screen
- Token is never logged, displayed in toasts, or included in error messages

### Rate Limiting
- `POST /api/daemon/sync`: 10 requests per minute (server-side limit for the local daemon)
- Client-side guard: `isSyncing` flag prevents duplicate requests. Only one force sync can be in flight at a time
- If the server returns 429, the error toast shows "Sync rate limited. Try again in a moment."
- The 10 req/min limit is generous for human use (typical: 1-2 syncs per session) but prevents programmatic abuse from agents

### Data Sensitivity
- Force sync result counts are non-sensitive — they reveal operation volume, not content
- Error messages from failed sync items may contain server error details, but these are only visible to the local daemon operator
- The force sync request body is empty — no user data is sent in the trigger itself

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.sync.force_sync.initiated` | `S` pressed, sync request dispatched | `pending_count_before`, `terminal_width`, `terminal_height`, `breakpoint`, `entry_context` ("queue_list" or "error_modal"), `time_since_last_sync_ms` |
| `tui.sync.force_sync.completed` | Sync response received (success) | `pending_count_before`, `sync_duration_ms`, `result_total`, `result_synced`, `result_conflicts`, `result_failed`, `success: true` |
| `tui.sync.force_sync.failed` | Sync response received (error) | `pending_count_before`, `sync_duration_ms`, `error_type` ("timeout", "network", "auth", "no_remote", "rate_limit", "server_error"), `http_status`, `error_message`, `success: false` |
| `tui.sync.force_sync.guarded` | `S` pressed but blocked by guard | `guard_reason` ("already_syncing", "no_pending", "filter_focused"), `pending_count`, `is_syncing` |
| `tui.sync.force_sync.toast_dismissed` | Toast auto-dismissed after 5s | `toast_type` ("success", "warning", "error"), `result_total`, `user_navigated_away: boolean` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Force sync initiation rate | >80% of sessions with pending > 0 | Users should use force sync when items are pending |
| Force sync success rate (all items synced) | >85% | Most syncs should complete cleanly |
| Time from S press to toast display | <5s (p95) | Sync should feel responsive |
| Guard activation rate | <15% of S presses | Users should rarely hit guards (good UX) |
| Error rate (non-conflict) | <5% | Network and server errors should be rare |
| Post-sync conflict rate | <20% of syncs | Most items should sync without conflicts |
| Retry-after-sync rate | >50% of syncs with conflicts | Users should engage with conflicts after force sync |
| Force sync as recovery | >30% of force syncs | Force sync should be used as part of conflict resolution workflow |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | S key pressed | `Sync: force sync key pressed [pending={p}] [is_syncing={b}]` |
| `debug` | Guard activated | `Sync: force sync guarded [reason={r}] [pending={p}]` |
| `info` | Force sync initiated | `Sync: force sync started [pending={p}]` |
| `info` | Force sync complete | `Sync: force sync complete [total={t}] [synced={s}] [conflicts={c}] [failed={f}] [duration={ms}ms]` |
| `info` | Toast displayed | `Sync: toast shown [type={t}] [message_length={n}]` |
| `info` | Toast dismissed | `Sync: toast dismissed [type={t}] [auto={b}]` |
| `warn` | Force sync failed | `Sync: force sync failed [error={msg}] [http_status={code}] [duration={ms}ms]` |
| `warn` | Force sync timeout | `Sync: force sync timeout [duration=30000ms] [pending={p}]` |
| `warn` | Rate limited | `Sync: force sync rate limited [http_status=429]` |
| `error` | Auth error during sync | `Sync: force sync auth error [status=401]` |
| `error` | Unexpected error | `Sync: force sync unexpected error [error={msg}] [stack={stack}]` |

Logs to stderr. Level controlled via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Terminal resize during force sync | `useOnResize` fires while sync in-flight | Layout re-renders; spinner continues; sync unaffected | Independent; layout adjusts when response arrives |
| Terminal resize during toast display | `useOnResize` fires while toast visible | Toast re-renders at new width; truncation re-applied | Automatic |
| Daemon not running | `POST /api/daemon/sync` connection refused | Error toast "Daemon not running" | User starts daemon; press `S` again |
| No remote configured | 400 from `POST /api/daemon/sync` | Error toast with server message | User runs `codeplane daemon connect <url>` |
| Auth expiry during sync | 401 from `POST /api/daemon/sync` | Auth error screen pushed; toast not shown | Re-auth via CLI (`codeplane auth login`) |
| Network timeout (30s) | AbortSignal fires | Error toast "Sync timed out. Press S to retry." | User retries |
| Server error (5xx) | HTTP 500+ response | Error toast "Sync failed: {error.message}" | User retries; check server logs |
| Rate limit (429) | HTTP 429 response | Error toast "Sync rate limited. Try again in a moment." | Wait and retry |
| Daemon restart mid-sync | Connection drop during sync | Error toast with network error; next poll detects new PID | Automatic on next poll |
| Process suspend (Ctrl+Z) during sync | SIGTSTP signal | Sync continues server-side; on SIGCONT, poll refreshes state | Automatic on resume |
| Component crash during sync | React error boundary | Error boundary catches; spinner stops; sync result lost | Press `r` to restart screen |
| Poll response arrives during toast display | 3s poll overlaps with post-sync state | Both data sources reconcile; counts may update twice | No visible glitch — last write wins |
| SSE disconnect (N/A) | Daemon API does not use SSE | No impact — force sync uses HTTP polling model | N/A |

### Failure Modes
- Force sync API call fails → error toast shown → screen remains usable with stale data → user can press `S` again or `r` to refresh
- Spinner does not stop (sync hangs beyond 30s) → AbortSignal fires → timeout error toast → `isSyncing` flag cleared → user can retry
- Toast fails to render (component error) → error boundary at screen level → "Press r to restart" prompt
- Multiple concurrent data updates (poll + sync response) → React state reconciliation → last update wins → brief visual flicker acceptable
- Daemon killed during sync → connection error → error toast → next poll shows "Daemon not running"

## Verification

### Test File: `e2e/tui/sync.test.ts`

### Terminal Snapshot Tests (12 tests)

- SNAP-FORCE-001: Status banner during active force sync — shows `◐ Syncing… {spinner}` in yellow with "Flushing N pending items…" at 120×40
- SNAP-FORCE-002: Status banner during force sync at 80×24 — condensed single-line syncing indicator
- SNAP-FORCE-003: Success toast after clean sync — "✓ Synced 5 items (0 conflicts, 0 failed)" in green at 120×40
- SNAP-FORCE-004: Warning toast after sync with conflicts — "⚠ Synced 3 items (2 conflicts, 0 failed)" in yellow at 120×40
- SNAP-FORCE-005: Error toast after sync with failures — "✗ Synced 2 items (1 conflicts, 2 failed)" in red at 120×40
- SNAP-FORCE-006: Toast at 80×24 minimum — abbreviated format "Synced 5 (0 conf, 0 fail)"
- SNAP-FORCE-007: Error toast — timeout message "Sync timed out. Press S to retry." in red
- SNAP-FORCE-008: Error toast — no remote configured message
- SNAP-FORCE-009: Error toast — daemon not running message
- SNAP-FORCE-010: Status bar flash "Nothing to sync" in muted italic
- SNAP-FORCE-011: Status bar flash "Sync already in progress" in muted italic
- SNAP-FORCE-012: Status bar keybinding hints during sync — `syncing…` replaces `S:sync`

### Keyboard Interaction Tests (18 tests)

- KEY-FORCE-001: S triggers force sync — status banner shows syncing spinner
- KEY-FORCE-002: S during active sync is no-op — status bar flashes "Sync already in progress"
- KEY-FORCE-003: S with zero pending items is no-op — status bar flashes "Nothing to sync"
- KEY-FORCE-004: S while filter input is focused is no-op — character enters filter
- KEY-FORCE-005: j/k navigation remains functional during active sync
- KEY-FORCE-006: Enter on conflict item remains functional during active sync
- KEY-FORCE-007: d on conflict item remains functional during active sync
- KEY-FORCE-008: y on failed item remains functional during active sync
- KEY-FORCE-009: / still focuses filter input during active sync
- KEY-FORCE-010: r still triggers manual refresh during active sync
- KEY-FORCE-011: q pops screen during active sync — sync continues server-side, no toast shown
- KEY-FORCE-012: Esc does not cancel force sync — closes modal/filter per normal priority chain
- KEY-FORCE-013: S in error detail modal triggers force sync (pending > 0)
- KEY-FORCE-014: S in error detail modal with 0 pending — flashes "Nothing to sync"
- KEY-FORCE-015: Rapid S presses (5× in 200ms) — only first triggers sync, rest show flash
- KEY-FORCE-016: S immediately after d (discard) — both operations succeed independently
- KEY-FORCE-017: S immediately after y (retry) — retried item included in sync flush
- KEY-FORCE-018: g d (go-to dashboard) during active sync — navigates away, sync continues, no toast

### Responsive Tests (6 tests)

- RESP-FORCE-001: Force sync spinner visible at 80×24 — status banner fits single line
- RESP-FORCE-002: Force sync toast at 80×24 — abbreviated format fits within terminal width
- RESP-FORCE-003: Force sync spinner and toast at 120×40 — full two-line banner with progress hint
- RESP-FORCE-004: Force sync toast at 200×60 — generous spacing, full format
- RESP-FORCE-005: Resize from 120×40 to 80×24 during active sync — spinner and progress hint adapt
- RESP-FORCE-006: Resize during toast display — toast re-renders at new width, not truncated incorrectly

### Integration Tests (16 tests)

- INT-FORCE-001: Force sync success — API returns `{ total: 5, synced: 5, conflicts: 0, failed: 0 }` — toast shows "Synced 5 items" in green, queue list refreshes
- INT-FORCE-002: Force sync partial success — API returns `{ total: 5, synced: 3, conflicts: 1, failed: 1 }` — toast shows mixed counts, conflict/failed items appear in queue
- INT-FORCE-003: Force sync all conflicts — API returns `{ total: 3, synced: 0, conflicts: 3, failed: 0 }` — toast in warning color, 3 new conflict items in queue
- INT-FORCE-004: Force sync all failures — API returns `{ total: 2, synced: 0, conflicts: 0, failed: 2 }` — toast in error color
- INT-FORCE-005: Force sync timeout (30s) — AbortSignal fires — error toast "Sync timed out"
- INT-FORCE-006: Force sync 400 (no remote) — error toast with server message
- INT-FORCE-007: Force sync 401 (auth error) — auth error screen pushed
- INT-FORCE-008: Force sync 429 (rate limited) — error toast "Sync rate limited"
- INT-FORCE-009: Force sync network error (connection refused) — error toast with message
- INT-FORCE-010: Force sync 500 (server error) — error toast "Sync failed: {msg}"
- INT-FORCE-011: Toast auto-dismissed after 5 seconds — returns to normal status display
- INT-FORCE-012: Post-sync data refresh — `useDaemonStatus()` and `useSyncConflicts()` re-fetched immediately
- INT-FORCE-013: Post-sync pending count decrements to reflect synced items
- INT-FORCE-014: Post-sync conflict count increments if new conflicts detected
- INT-FORCE-015: Force sync result with 0 total (race with auto-flush) — toast shows "Synced 0 items" in green
- INT-FORCE-016: Force sync followed by poll — data consistent, no duplicate items

### Edge Case Tests (10 tests)

- EDGE-FORCE-001: Force sync immediately after screen mount (before first poll completes) — sync triggers with stale pending count from initial load
- EDGE-FORCE-002: Very large queue (200 pending items) — sync takes longer, spinner persists, toast shows high counts
- EDGE-FORCE-003: Force sync returns negative counts (malformed server response) — error toast "Sync failed: invalid response"
- EDGE-FORCE-004: Force sync response body is empty or malformed JSON — error toast with parse error
- EDGE-FORCE-005: Terminal suspend (Ctrl+Z) during force sync, then resume (fg) — screen refreshes, shows post-sync state
- EDGE-FORCE-006: Daemon restart during force sync (different PID on next poll) — error toast, PID updates on refresh
- EDGE-FORCE-007: Flash message and toast visible simultaneously — toast takes priority, flash suppressed
- EDGE-FORCE-008: Multiple toasts in sequence (force sync → error → force sync → success) — latest toast replaces previous
- EDGE-FORCE-009: Force sync after navigating away and back to sync screen — fresh state, no stale isSyncing flag
- EDGE-FORCE-010: S key with no color support (16-color terminal) — spinner uses ASCII fallback `[-]`, toast uses text markers `[OK]`/`[!!]`

## Implementation Plan

### 1. Create Data Hooks and Client Methods
**File:** `packages/ui-core/src/hooks/useSyncForce.ts` (if it does not exist)
- Export `useSyncForce` hook that wraps `POST /api/daemon/sync` with the standard API client.
- Add support for an `AbortSignal` argument to enforce the 30s timeout.
- Expect and return the data shape: `{ total: number, synced: number, conflicts: number, failed: number }`.

### 2. Create `useForceSyncAction` Hook
**File:** `apps/tui/src/screens/Sync/hooks/useForceSyncAction.ts`
- **State Management:**
  - `isSyncing` (boolean): Flag to block concurrent syncs.
  - `toast` (object | null): Contains `message`, `type` (`success` | `warning` | `error`), and `visible`.
  - `flashMessage` (string | null): Transient 2-second status bar hints.
- **Dependencies:**
  - `const { refetch: refetchStatus } = useDaemonStatus()`
  - `const { refetch: refetchConflicts } = useSyncConflicts()`
  - `const { width } = useTerminalDimensions()`
- **Trigger Logic (`triggerSync`):**
  - Accept `pendingCount: number`.
  - **Guards:** 
    - If `isSyncing`, set `flashMessage` to "Sync already in progress".
    - If `pendingCount === 0`, set `flashMessage` to "Nothing to sync".
    - Clear `flashMessage` after 2s via `setTimeout`.
  - **Execution:**
    - Set `isSyncing(true)`, clear any existing `toast`.
    - Create `AbortController` and `setTimeout(..., 30000)` to abort if hung.
    - Invoke `syncForceApi({ signal: controller.signal })`.
  - **Result Handling:**
    - If response `conflicts > 0` -> warning type. If `failed > 0` -> error type. Otherwise -> success type.
    - Format message adjusting to `width` breakpoint (e.g. abbreviate if `< 120`).
    - Store `toast`, call `refetchStatus()` and `refetchConflicts()`.
  - **Error Handling:**
    - Distinguish between `AbortError` ("Sync timed out. Press S to retry."), Network Error, and Server Error.
    - Set `toast` type to `error` and specific message.
  - **Cleanup:**
    - Ensure `isSyncing(false)` is set in `finally`.
    - Set a 5-second timer to auto-clear the `toast`.

### 3. Update Sync Status Components
**File:** `apps/tui/src/screens/Sync/SyncStatusScreen.tsx`
- **Initialization:**
  - `const { isSyncing, toast, flashMessage, triggerSync } = useForceSyncAction();`
  - Get `pendingCount` from queue summary data.
- **Keybindings:**
  - Map `S` to `() => triggerSync(pendingCount)`. Input fields naturally stop propagation so it will be a no-op if filter is focused.
- **Braille Spinner:**
  - `const spinnerFrame = useTimeline(80)` stepping through `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]`.
  - Check `useTheme()` or terminal capabilities to fallback to `[|]`, `[/]`, `[-]`, `[\]` if 16-color.
- **Status Banner:**
  - Conditionally render `◐ Syncing… {spinnerFrame}`.
  - Conditionally render "Flushing N pending items…" below banner at breakpoints `standard` and `large`.
- **Toast Display:**
  - If `toast.visible`, render a `<box height={1}>` below the banner with background/text colored by `toast.type` (`success`, `warning`, `error`).
- **Status Bar:**
  - Override `S:sync` context hint. Show `flashMessage` if active, else show `syncing…` when `isSyncing`.
- **Error Detail Modal Propagation:**
  - Ensure the `S` key binding is either available globally within the screen or passed down to `ErrorDetailModal` so pressing `S` while inspecting a conflict triggers the sync.

## Unit & Integration Tests

### Test Environment
Target file: `e2e/tui/sync.test.ts`
Using framework: `@microsoft/tui-test`

### Implementation Strategy
Add the specified 62 tests directly mapping to the Verification plan:

1. **Snapshots (`SNAP-FORCE-*`)**: Use `terminal.snapshot()` matching across `80x24`, `120x40`, and `200x60` configurations. Assert accurate spacing, spinner frame, and toast colors.
2. **Keyboard (`KEY-FORCE-*`)**: Programmatically send key events (`terminal.sendKeys('S')`) under multiple conditions. Verify no-op conditions using `.getLine()`. Ensure modals properly respond to `S`.
3. **Responsiveness (`RESP-FORCE-*`)**: Use `terminal.resize(w, h)` while the sync API call is artificially delayed. Assert the layout updates synchronously without breaking the active sync process.
4. **Integration (`INT-FORCE-*`)**: Mount tests against mock API routes to simulate varying response matrices: clean success, mixed results, pure errors, network timeouts, and auth failures.
5. **Edge Cases (`EDGE-FORCE-*`)**: Trigger anomalies like sending multiple fast `S` keys, firing sync simultaneously with polling responses, and forcing fallback ASCII spinners. Validate stable state and absence of unhandled React exceptions.
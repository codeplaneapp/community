# TUI_SETTINGS_NOTIFICATION_PREFS

Specification for TUI_SETTINGS_NOTIFICATION_PREFS.

## High-Level User POV

The Notification Preferences tab is where you control how Codeplane notifies you, directly from the terminal. It lives inside the Settings screen as one of six tabs — positioned after "Tokens" and before "Connected Accounts" — and is reachable by navigating to Settings via `g s` (go-to settings) or `:settings` in the command palette, then pressing `Tab` to cycle to the "Notifications" tab or pressing `5` to jump directly.

When the tab loads, you see a clean, single-column layout. At the top is the section heading "Notification preferences" in bold, followed by a brief description explaining what the toggle controls. The centerpiece is the global notification toggle — a clearly labeled row showing "Enable notifications" on the left and a toggleable `[ON]` / `[OFF]` indicator on the right, rendered in green when enabled and gray when disabled. The toggle reflects your current server-side state, fetched when the tab mounts. You press `Space` or `Enter` to flip it. The update fires immediately — there is no separate save button. While the request is in flight, the toggle shows `[Saving…]` in yellow and is temporarily non-interactive to prevent double-submission. On success, it briefly flashes `[Saved ✓]` in green before settling back to `[ON]` or `[OFF]`. On failure, it reverts to the previous state and shows a red error message below the toggle with "Failed to update. Press r to retry."

Below the toggle is a read-only "Notification types" section that lists every event type governed by the toggle: issue assignments, issue comments, landing request reviews, landing request comments, workspace status changes, workspace sharing, and workflow run completions. Each type is shown as a single row with its name in normal text and a brief description in muted text. This section is informational — it tells you exactly what the toggle controls so you can make an informed decision. A footer note reads "Granular per-type controls coming soon." in muted italic to communicate the product roadmap without over-promising.

Below the notification types is a "Repository subscriptions" section showing a count of watched repositories ("Watching N repositories") and a hint that subscription management is available via the CLI (`codeplane notification subscriptions`) or the web UI. This section is non-interactive in the TUI — it provides awareness without duplicating the subscription management surface.

The entire tab is scrollable for small terminals. At 80×24, the notification type descriptions collapse to just the type names. At 120×40, full descriptions are visible. At 200×60+, additional padding and spacing make the layout generous and readable. Terminal resize recalculates layout synchronously; the focused element is preserved. The status bar shows context-sensitive keybinding hints: `Space:toggle Tab:next section Esc:back ?:help`.

## Acceptance Criteria

### Definition of Done

- [ ] The Notification Preferences tab renders as tab 5 within the Settings screen (`TUI_SETTINGS_SCREEN`)
- [ ] The tab is reachable via `Tab`/`Shift+Tab` cycling from other settings tabs, or by pressing `5` for direct jump
- [ ] The breadcrumb reads "Dashboard > Settings > Notifications"
- [ ] Notification preferences are fetched via `useNotificationPreferences()` from `@codeplane/ui-core`, calling `GET /api/user/settings/notifications`
- [ ] The toggle displays the current `email_notifications_enabled` boolean value from the API response
- [ ] `Space` or `Enter` on the focused toggle sends `PUT /api/user/settings/notifications` with the inverted value
- [ ] The update is optimistic: the toggle flips immediately, reverts on server error
- [ ] During the PUT request, the toggle shows `[Saving…]` in yellow/warning color and rejects further input
- [ ] On success (200), the toggle briefly shows `[Saved ✓]` in green/success color for 2 seconds, then settles to `[ON]` or `[OFF]`
- [ ] On failure (non-200), the toggle reverts to its previous state and a red error message appears below
- [ ] The error message includes "Failed to update. Press r to retry." and `r` re-sends the last attempted update
- [ ] A read-only "Notification types" list enumerates all 7 event categories with descriptions
- [ ] A "Repository subscriptions" section shows the watched repository count and CLI/web hint
- [ ] `Esc` or `q` exits the Settings screen (pops the navigation stack)
- [ ] The help overlay (`?`) shows all keybindings for the Notification Preferences tab
- [ ] Default value for a new user who has never modified settings is `email_notifications_enabled: true` (toggle shows `[ON]`)
- [ ] 401 responses propagate to the auth error screen ("Session expired. Run `codeplane auth login` to re-authenticate.")

### Functional Constraints

- [ ] No separate "Save" button — the toggle is the sole interaction for changing the preference
- [ ] The toggle must prevent double-submission: input is blocked while a PUT request is in flight
- [ ] Empty body `{}` round-trip: sending the same value that is already set succeeds idempotently (200, no state change)
- [ ] The update must take effect within the same request/response cycle — no batching or delayed propagation
- [ ] Non-boolean values are never sent by the TUI (client-side enforcement), but 422 from the server is handled as a validation error with a descriptive message
- [ ] Toggling notifications off does not delete existing notifications in the inbox
- [ ] Toggling notifications on does not create retroactive notifications for missed events

### Edge Cases

- [ ] Terminal resize while "Saving…" state: layout recalculates, saving state preserved, PUT continues
- [ ] Terminal resize at 80×24 minimum: notification type descriptions collapse to names only
- [ ] Rapid Space/Enter presses: first press triggers update, subsequent presses are no-ops while in-flight
- [ ] Network disconnect during PUT: timeout after 10 seconds, revert toggle, show error with retry
- [ ] SSE disconnect while on settings tab: status bar shows disconnection indicator, settings tab remains fully functional (SSE not required for preferences)
- [ ] 500 on initial GET: loading state transitions to error state with "Failed to load notification preferences. Press R to retry."
- [ ] 429 rate limit on PUT: toggle reverts, error shows "Rate limited. Retry in {N}s." with countdown from `Retry-After` header
- [ ] User navigates away during "Saving…" state: PUT completes in background, result applied silently
- [ ] User returns to tab after background update: fresh GET on re-mount ensures state is current
- [ ] `CODEPLANE_TOKEN` expired between tab loads: 401 caught and auth error screen pushed
- [ ] Color-limited terminal (no truecolor, 16-color mode): toggle uses text-based `[ON]`/`[OFF]` with ANSI bold instead of color differentiation

### Boundary Constraints

- [ ] `email_notifications_enabled`: strictly boolean in PUT body — TUI never sends other types
- [ ] PUT request body maximum: under 100 bytes (single boolean field)
- [ ] Response payload: ~50 bytes, no pagination needed
- [ ] Section heading "Notification preferences": fixed string, no truncation
- [ ] Toggle label "Enable notifications": fixed string, max 25 characters, no truncation needed at 80ch
- [ ] Toggle state indicator: `[ON]` (4ch), `[OFF]` (5ch), `[Saving…]` (10ch), `[Saved ✓]` (9ch)
- [ ] Notification type names: max 30 characters each (fixed strings)
- [ ] Notification type descriptions: max 100 characters each (fixed strings), truncated with `…` at 80×24
- [ ] "Granular per-type controls coming soon." footer: max 50ch, muted italic
- [ ] Watched repo count: abbreviated above 9999 ("9999+")
- [ ] Error message max display: 120 characters, truncated with `…` on narrow terminals
- [ ] Scrollbox content height: ~25 rows at standard, fits without scroll at 120×40+

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > Settings > Notifications    ● sync   │
├──────────────────────────────────────────────────────────┤
│ Tabs: [1:Profile] [2:Emails] [3:SSH Keys] [4:Tokens]    │
│       [5:Notifications●] [6:Connected]                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Notification preferences                                │
│  Control how Codeplane notifies you about activity.      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Enable notifications                      [ON]  ▍  │  │
│  │ When enabled, you receive in-app notifications    │  │
│  │ for activity in repositories you watch.           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Notification types                                      │
│  ─────────────────                                       │
│  Issue assigned        When you are assigned to an issue │
│  Issue comment         When someone comments on your … │
│  LR review             When someone reviews your LR      │
│  LR comment            When someone comments on your … │
│  Workspace status      When a workspace you own fails    │
│  Workspace shared      When someone shares a workspace   │
│  Workflow completed    When a workflow run completes      │
│                                                          │
│  Granular per-type controls coming soon.                 │
│                                                          │
│  Repository subscriptions                                │
│  ─────────────────────────                               │
│  Watching 12 repositories.                               │
│  Manage via: codeplane notification subscriptions        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Space:toggle Tab:next tab r:retry Esc:back ?:help        │
└──────────────────────────────────────────────────────────┘
```

### Component Tree

Uses `<box>` for flexbox layout containers (vertical column for main layout, row for toggle label+state), `<scrollbox>` for scrollable content at small terminal sizes, and `<text>` for all labels, descriptions, and state indicators. The toggle card uses `border="single"` with dynamic `borderColor` (primary/ANSI 33 when focused, default border/ANSI 240 otherwise). No `<input>`, `<select>`, `<code>`, `<diff>`, or `<markdown>` components needed — this is a pure display + toggle screen.

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `Space` | Toggle `email_notifications_enabled` | Toggle card focused, not in saving state |
| `Enter` | Toggle `email_notifications_enabled` | Toggle card focused, not in saving state |
| `r` | Retry last failed update | Error state visible |
| `R` | Retry initial load | Load error state visible |
| `Tab` | Next settings tab | Always |
| `Shift+Tab` | Previous settings tab | Always |
| `1`–`6` | Jump to settings tab by number | Always |
| `j` / `Down` | Scroll content down | Content scrollable |
| `k` / `Up` | Scroll content up | Content scrollable |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | Content scrollable |
| `G` | Scroll to bottom of content | Content scrollable |
| `g g` | Scroll to top of content | Content scrollable |
| `q` | Pop Settings screen | Always |
| `Esc` | Pop Settings screen (no overlays on this tab) | Always |
| `?` | Toggle help overlay | Always |
| `:` | Open command palette | Always |

### Responsive Behavior

| Breakpoint | Toggle Card | Type Names | Type Descriptions | Subscriptions |
|-----------|-------------|------------|-------------------|---------------|
| 80×24 min | Full width, no padding | 20ch | Hidden | Count only, no CLI hint |
| 120×40 std | Full width, padded | 22ch | Visible, truncated at available width | Count + CLI hint |
| 200×60 lg | 80% width centered, padded | 25ch | Full, no truncation | Count + CLI hint + web hint |

At 80×24: Toggle card spans full width with minimal padding. Notification type descriptions hidden (names only). Subscription section shows count only. Scrollbox likely requires scrolling.

At 120×40: Toggle card has 1ch horizontal padding. Type descriptions visible, truncated with `…` if needed. All content fits without scrolling.

At 200×60+: Toggle card centered at 80% width with 2ch padding. Full descriptions. Generous vertical spacing. Both CLI and web hints for subscriptions.

Resize triggers synchronous re-layout. Scroll position and focused element preserved. Saving state unaffected by resize.

### Data Hooks

- `useNotificationPreferences()` from `@codeplane/ui-core` → `GET /api/user/settings/notifications` — returns `{ email_notifications_enabled: boolean }`, `isLoading`, `error`, `refresh()`
- `useUpdateNotificationPreferences()` from `@codeplane/ui-core` → `PUT /api/user/settings/notifications` — mutation hook returning `{ mutate(req), isLoading, error }`
- `useUser()` from `@codeplane/ui-core` — for watched repository count
- `useTerminalDimensions()` from `@opentui/react` — current terminal width/height for breakpoint calculation
- `useOnResize()` from `@opentui/react` — re-layout on terminal resize
- `useKeyboard()` from `@opentui/react` — keybinding registration for Space, Enter, r, R, j, k, etc.
- `useNavigation()` from local TUI routing — `pop()` for back navigation
- `useStatusBarHints()` from local TUI routing — context-sensitive keybinding hints

### API Endpoints Consumed

- `GET /api/user/settings/notifications` — Response: `{ "email_notifications_enabled": boolean }` — Errors: 401, 404, 429, 500
- `PUT /api/user/settings/notifications` — Request/Response: `{ "email_notifications_enabled": boolean }` — Errors: 400, 401, 404, 422, 429, 500

### State Machine

IDLE → LOADING (mount) → READY (success) or ERROR_LOAD (failure). READY → SAVING (Space/Enter) → SAVED (success, 2s timer) → READY, or ERROR_UPDATE (failure). ERROR_LOAD retries via `R`. ERROR_UPDATE retries via `r`. SAVING state guards against additional input.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Self) | Authenticated (Other) | Platform Admin |
|--------|-----------|----------------------|----------------------|----------------|
| View notification preferences tab | ❌ | ✅ | ❌ | ✅ (via admin API) |
| Toggle notification preference | ❌ | ✅ | ❌ | ✅ (via admin API) |

- Only the authenticated user can view or modify their own notification preferences
- The user ID is derived from the authenticated session token, not from a URL parameter — IDOR is impossible by design
- Organization admins cannot access or modify a member's notification preferences through this endpoint
- Users with `prohibit_login: true` or `is_active: false` must not access this endpoint even with a valid session token

### Token-based Auth

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at TUI bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to the app-shell auth error screen ("Session expired. Run `codeplane auth login` to re-authenticate.")
- The TUI does not implement its own OAuth browser flow — authentication is delegated to the CLI

### Rate Limiting

- `GET /api/user/settings/notifications`: Standard authenticated rate limit (5,000 requests/hour)
- `PUT /api/user/settings/notifications`: Per-user rate limit of 10 requests per minute to prevent toggle-spamming
- 429 responses show inline error: "Rate limited. Retry in {N}s." with `Retry-After` value
- Toggle reverts on 429 — no optimistic state retained
- No automatic retry on rate limit; user waits for the indicated period, then presses `r` to retry
- Burst tolerance: up to 10 requests in a 5-second window, then throttled

### Data Privacy

- Notification preferences are not PII, but the endpoint requires auth and must never leak preferences for other users
- Response contains only `{ email_notifications_enabled: boolean }` — no internal fields leaked
- Server logs must not log preference values at INFO level; `user_id` may be logged
- Response includes `Cache-Control: no-store` to prevent proxy caching

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.settings.notification_prefs.view` | Tab mounted, initial data loaded | `user_id`, `email_notifications_enabled` (current), `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` ("tab_cycle", "tab_jump", "goto", "palette") |
| `tui.settings.notification_prefs.toggle` | Space/Enter toggles setting successfully | `user_id`, `email_notifications_enabled` (new), `previous_value` (old), `response_time_ms` |
| `tui.settings.notification_prefs.toggle_failed` | PUT returns non-200 | `user_id`, `attempted_value`, `error_status`, `error_message` |
| `tui.settings.notification_prefs.retry` | User presses `r` to retry | `user_id`, `retry_type` ("update", "load"), `retry_success` |
| `tui.settings.notification_prefs.load_error` | GET returns non-200 | `user_id`, `error_status`, `error_message` |
| `tui.settings.notification_prefs.scroll` | User scrolls through notification types | `user_id`, `scroll_direction` ("down", "up"), `breakpoint` |
| `tui.settings.notification_prefs.exit` | User leaves the tab | `user_id`, `time_on_tab_ms`, `made_change` (boolean), `exit_method` ("tab_cycle", "back", "goto", "palette") |

### Common Properties (all events)

- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode` ("truecolor", "256", "16"), `breakpoint` ("minimum", "standard", "large")

### Success Indicators

| Metric | Target |
|--------|--------|
| Tab load completion (200 from GET) | >98% of visits |
| Toggle success rate (200 from PUT) | >95% of attempts |
| Toggle revert rate (non-200 from PUT) | <5% |
| Retry success rate | >80% of retries |
| Time to interactive (data loaded, toggle usable) | <500ms |
| Opt-out rate (disable notifications) | 5–15% of active users (healthy range) |
| Re-enable rate (disabled then re-enabled) | >20% of opt-outs (users value control) |
| Tab visit rate (% of Settings visitors) | >15% |
| Error rate (non-auth, non-rate-limit errors) | <1% |
| Session duration on tab | >5s average (users reading type list) |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Tab mounted | `NotifPrefs: mounted [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Preferences fetched | `NotifPrefs: loaded [enabled={bool}] [duration={ms}ms]` |
| `debug` | Toggle initiated | `NotifPrefs: toggle [from={old}] [to={new}]` |
| `info` | Tab ready | `NotifPrefs: ready [enabled={bool}] [total_ms={ms}]` |
| `info` | Toggle success | `NotifPrefs: updated [enabled={bool}] [duration={ms}ms]` |
| `info` | Toggle reverted | `NotifPrefs: reverted [to={prev}] [reason={msg}]` |
| `warn` | Fetch failed | `NotifPrefs: fetch failed [status={code}] [error={msg}]` |
| `warn` | Update failed | `NotifPrefs: update failed [status={code}] [error={msg}]` |
| `warn` | Rate limited | `NotifPrefs: rate limited [retry_after={s}]` |
| `warn` | Slow load (>1s) | `NotifPrefs: slow load [duration={ms}ms]` |
| `warn` | Slow update (>2s) | `NotifPrefs: slow update [duration={ms}ms]` |
| `error` | Auth error | `NotifPrefs: auth error [status=401]` |
| `error` | Render error | `NotifPrefs: render error [error={msg}]` |
| `error` | Unexpected response shape | `NotifPrefs: invalid response [body={truncated}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Resize during "Saving…" state | `useOnResize` fires while PUT in-flight | Layout re-renders; PUT continues; saving indicator preserved | Independent; layout adjusts on completion |
| Resize at minimum (80×24) | `useOnResize` detects narrow width | Type descriptions hidden; content becomes scrollable | Synchronous re-layout; scroll position preserved |
| SSE disconnect while on tab | SSE `error`/`close` event | Status bar shows "⚠ Disconnected"; preferences tab unaffected (no SSE dependency) | SSE auto-reconnects; no impact on settings functionality |
| Auth expiry during tab use | 401 from GET or PUT | Auth error screen pushed | Re-auth via CLI (`codeplane auth login`) |
| Network timeout on GET (10s) | Fetch promise timeout | Loading → error state with "Failed to load. Press R to retry." | User retries via `R` |
| Network timeout on PUT (10s) | Fetch promise timeout | Toggle reverts; error message with "Press r to retry." | User retries via `r` |
| PUT 422 (invalid value) | 422 response | Toggle reverts; error: "Invalid preference value." | Should not occur (TUI always sends boolean); logged as error |
| PUT 429 (rate limited) | 429 response with `Retry-After` | Toggle reverts; error: "Rate limited. Retry in {N}s." with countdown | User waits, presses `r` |
| Server 500 on GET | 500 response | Full error state replacing content | User retries via `R` |
| Server 500 on PUT | 500 response | Toggle reverts; inline error | User retries via `r` |
| Rapid Space presses | Multiple Space while "Saving…" | First triggers PUT; subsequent ignored (state machine guard) | Automatic; no user action |
| Navigate away during saving | User presses `q` or changes tab during PUT | PUT completes in background; result silent | On return, fresh GET ensures current state |
| Color-limited terminal | `COLORTERM` detection at startup | Text-based `[ON]`/`[OFF]` with bold instead of color; green/red → bold/normal | Automatic via theme detection |
| Component crash | Unhandled exception in render | Global error boundary: "Press r to restart" | Restart TUI |

### Failure Modes

- GET fails permanently → error state displayed; `q` and go-to keys still work for navigation away; user can switch to other settings tabs
- PUT fails permanently → toggle always reverts; error persists; user can still read notification types list and navigate away
- Component crash → global error boundary → "Press r to restart"
- Auth expired → auth error screen pushed; all settings tabs affected equally

## Verification

### Test File: `e2e/tui/settings.test.ts`

### Terminal Snapshot Tests (18 tests)

- SNAP-NOTIFPREFS-001: Notification preferences tab at 120×40 with notifications enabled — full layout, toggle card `[ON]`, notification types with descriptions, subscription section
- SNAP-NOTIFPREFS-002: Notification preferences tab at 120×40 with notifications disabled — toggle card `[OFF]`, disabled contextual message
- SNAP-NOTIFPREFS-003: Notification preferences tab at 80×24 — compact layout, type names only (no descriptions), scrollable content
- SNAP-NOTIFPREFS-004: Notification preferences tab at 200×60 — centered toggle card (80% width), full descriptions, generous spacing
- SNAP-NOTIFPREFS-005: Toggle in `[Saving…]` state — yellow/warning color, toggle card focused
- SNAP-NOTIFPREFS-006: Toggle in `[Saved ✓]` state — green/success color, briefly after successful update
- SNAP-NOTIFPREFS-007: Error state after failed PUT — toggle reverted, red error message with "Press r to retry"
- SNAP-NOTIFPREFS-008: Full load error state — "Failed to load notification preferences. Press R to retry." centered
- SNAP-NOTIFPREFS-009: Loading state — "Loading…" with tab bar visible
- SNAP-NOTIFPREFS-010: Toggle card focused highlight — primary border color when toggle is focused
- SNAP-NOTIFPREFS-011: Tab bar with "Notifications" tab active (tab 5) — active tab highlighted in primary color
- SNAP-NOTIFPREFS-012: Breadcrumb rendering — "Dashboard > Settings > Notifications"
- SNAP-NOTIFPREFS-013: Status bar keybinding hints — "Space:toggle Tab:next tab r:retry Esc:back ?:help"
- SNAP-NOTIFPREFS-014: Notification types list — all 7 types rendered with correct names
- SNAP-NOTIFPREFS-015: Notification types at 80×24 — names only, no descriptions
- SNAP-NOTIFPREFS-016: Repository subscriptions section — watched count and CLI hint
- SNAP-NOTIFPREFS-017: Rate limit error display — "Rate limited. Retry in {N}s." in red
- SNAP-NOTIFPREFS-018: 401 auth error screen — "Session expired. Run `codeplane auth login` to re-authenticate."

### Keyboard Interaction Tests (28 tests)

- KEY-NOTIFPREFS-001: Space on toggle when enabled — toggle flips to `[OFF]`, sends PUT with `false`
- KEY-NOTIFPREFS-002: Space on toggle when disabled — toggle flips to `[ON]`, sends PUT with `true`
- KEY-NOTIFPREFS-003: Enter on toggle when enabled — same behavior as Space (flips to `[OFF]`)
- KEY-NOTIFPREFS-004: Enter on toggle when disabled — same behavior as Space (flips to `[ON]`)
- KEY-NOTIFPREFS-005: Space during "Saving…" state — no-op, no additional PUT sent
- KEY-NOTIFPREFS-006: Enter during "Saving…" state — no-op, no additional PUT sent
- KEY-NOTIFPREFS-007: Rapid Space presses (5× sequential) — only first triggers PUT
- KEY-NOTIFPREFS-008: r after failed update — re-sends the last attempted PUT value
- KEY-NOTIFPREFS-009: r when no error — no-op
- KEY-NOTIFPREFS-010: R after failed initial load — re-fetches notification preferences via GET
- KEY-NOTIFPREFS-011: R when loaded successfully — no-op
- KEY-NOTIFPREFS-012: Tab cycles to next settings tab (Connected Accounts, tab 6)
- KEY-NOTIFPREFS-013: Shift+Tab cycles to previous settings tab (Tokens, tab 4)
- KEY-NOTIFPREFS-014: `5` key jumps to Notifications tab (self, no-op if already active)
- KEY-NOTIFPREFS-015: `1` key jumps to Profile tab
- KEY-NOTIFPREFS-016: `6` key jumps to Connected Accounts tab
- KEY-NOTIFPREFS-017: j scrolls content down when content overflows
- KEY-NOTIFPREFS-018: k scrolls content up when content overflows
- KEY-NOTIFPREFS-019: Ctrl+D pages down in scrollable content
- KEY-NOTIFPREFS-020: Ctrl+U pages up in scrollable content
- KEY-NOTIFPREFS-021: G scrolls to bottom of content
- KEY-NOTIFPREFS-022: g g scrolls to top of content
- KEY-NOTIFPREFS-023: q pops the Settings screen
- KEY-NOTIFPREFS-024: Esc pops the Settings screen (no overlay open)
- KEY-NOTIFPREFS-025: ? opens help overlay with Notification Preferences keybindings
- KEY-NOTIFPREFS-026: Esc while help overlay open — closes help overlay, does not pop screen
- KEY-NOTIFPREFS-027: `:` opens command palette
- KEY-NOTIFPREFS-028: Toggle then immediately q — PUT completes in background, state persisted server-side

### Responsive Tests (12 tests)

- RESP-NOTIFPREFS-001: 80×24 layout — notification type descriptions hidden, content scrollable
- RESP-NOTIFPREFS-002: 80×24 toggle card — full width, minimal padding, `[ON]`/`[OFF]` visible
- RESP-NOTIFPREFS-003: 80×24 subscription section — count only, no CLI hint
- RESP-NOTIFPREFS-004: 120×40 layout — full descriptions visible, no scroll needed
- RESP-NOTIFPREFS-005: 120×40 toggle card — full width with 1ch padding
- RESP-NOTIFPREFS-006: 120×40 subscription section — count + CLI hint
- RESP-NOTIFPREFS-007: 200×60 layout — toggle card centered at 80% width, generous spacing
- RESP-NOTIFPREFS-008: 200×60 subscription section — count + CLI hint + web hint
- RESP-NOTIFPREFS-009: Resize from 120×40 to 80×24 — descriptions collapse, scroll appears, toggle preserved
- RESP-NOTIFPREFS-010: Resize from 80×24 to 120×40 — descriptions appear, scroll removed, toggle preserved
- RESP-NOTIFPREFS-011: Resize during "Saving…" state — layout recalculates, saving state preserved
- RESP-NOTIFPREFS-012: Resize during load error — layout recalculates, error state preserved

### Integration Tests (16 tests)

- INT-NOTIFPREFS-001: Initial load fetches preferences from GET endpoint — toggle reflects server state
- INT-NOTIFPREFS-002: Toggle sends PUT with correct boolean value — server state updated
- INT-NOTIFPREFS-003: Successful toggle round-trip — PUT returns 200, toggle settles to new value
- INT-NOTIFPREFS-004: Failed toggle reverts — PUT returns 500, toggle reverts to previous value
- INT-NOTIFPREFS-005: 401 on GET — auth error screen pushed
- INT-NOTIFPREFS-006: 401 on PUT — auth error screen pushed
- INT-NOTIFPREFS-007: 429 on PUT — toggle reverts, "Rate limited" error shown with Retry-After
- INT-NOTIFPREFS-008: 422 on PUT (should not happen from TUI) — toggle reverts, validation error shown
- INT-NOTIFPREFS-009: Empty body no-op — sending same value returns 200, no state change
- INT-NOTIFPREFS-010: New user default — `email_notifications_enabled: true` on first load
- INT-NOTIFPREFS-011: Navigate to Settings via `g s` then Tab to Notifications tab — preferences loaded
- INT-NOTIFPREFS-012: Navigate to Settings via `:settings` command palette — preferences loaded on tab switch
- INT-NOTIFPREFS-013: Navigate away and return to tab — fresh GET ensures current state
- INT-NOTIFPREFS-014: Toggle off, navigate to notification list (g n), verify inbox still has existing notifications
- INT-NOTIFPREFS-015: Cross-client consistency — toggle via TUI, verify via GET endpoint matches
- INT-NOTIFPREFS-016: Network timeout on PUT (10s) — toggle reverts, error shown with retry hint

### Edge Case Tests (10 tests)

- EDGE-NOTIFPREFS-001: No auth token at startup — auth error screen, settings inaccessible
- EDGE-NOTIFPREFS-002: Server returns `email_notifications_enabled: null` (DB null) — toggle defaults to `[ON]` (true)
- EDGE-NOTIFPREFS-003: Rapid tab cycling through all 6 tabs — each tab mounts/unmounts cleanly, no stale state
- EDGE-NOTIFPREFS-004: Toggle during terminal resize — PUT completes, layout adjusts, no crash
- EDGE-NOTIFPREFS-005: "Saved ✓" timer fires after navigating away — no error, timer cleaned up
- EDGE-NOTIFPREFS-006: Multiple consecutive successful toggles (on → off → on) — each round-trip independent
- EDGE-NOTIFPREFS-007: GET returns unexpected additional fields — extra fields ignored, toggle renders correctly
- EDGE-NOTIFPREFS-008: Color-limited terminal (16 color) — toggle uses bold for `[ON]`, normal weight for `[OFF]`
- EDGE-NOTIFPREFS-009: Very slow PUT (5s) — "Saving…" visible for full duration, no timeout before 10s
- EDGE-NOTIFPREFS-010: Concurrent toggle from another client — next GET on tab re-mount reflects latest server state

All 84 tests left failing if backend is unimplemented — never skipped or commented out.

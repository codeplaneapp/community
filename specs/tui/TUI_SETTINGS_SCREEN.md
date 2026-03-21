# TUI_SETTINGS_SCREEN

Specification for TUI_SETTINGS_SCREEN.

## High-Level User POV

The settings screen is the central account management hub in the Codeplane TUI. It gives terminal-native developers a single, keyboard-driven surface to inspect and manage every aspect of their Codeplane account — profile information, email addresses, SSH keys, API tokens, notification preferences, and connected accounts — without ever opening a browser. The screen is reached via the command palette with `:settings` or by launching the TUI directly with `codeplane tui --screen settings`.

On arrival, the screen presents a two-panel layout: a narrow sidebar on the left lists the settings sections (Home, Profile, Emails, SSH Keys, Tokens, Notifications, Connected Accounts), and the main content area on the right shows the currently selected section. The default section is "Home," which displays a dashboard of summary cards — each card shows a count or status indicator for one settings category (e.g., "3 SSH keys," "2 email addresses," "Notifications: enabled") and can be activated with `Enter` to navigate to the corresponding detail section.

Navigation between sidebar items uses `j`/`k` or arrow keys when the sidebar is focused. `Tab` switches focus between the sidebar and the content area. Pressing `Enter` on a sidebar item loads that section's content into the main panel. Within the content area, each section provides its own interaction model: the Home section shows summary cards navigable with `j`/`k`; list sections (Emails, SSH Keys, Tokens, Connected Accounts) present scrollable lists with `Enter` to view details and `d` to delete with confirmation; the Profile section presents an editable form with `Tab` to move between fields and `Ctrl+S` to save; the Notifications section presents toggleable preferences.

At 80×24 minimum size, the sidebar collapses entirely and a horizontal section selector appears at the top, navigable with `Tab`/`Shift+Tab` or number keys. At standard size (120×40), the full two-panel layout is visible. At large sizes (200×60+), the content area expands to show additional metadata columns and longer text without truncation.

The Settings screen is private — it shows only the authenticated user's own account data. No repository context is required. All data is fetched via `@codeplane/ui-core` hooks that call the existing user settings API endpoints. Mutations (profile updates, key additions, token creation, deletions) are optimistic where appropriate, with immediate visual feedback and revert on error.

## Acceptance Criteria

### Definition of Done
- [ ] The Settings screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `:settings` command palette entry and `--screen settings` deep-link
- [ ] The breadcrumb reads "Dashboard > Settings" (or "Dashboard > Settings > {section}" when a subsection is active)
- [ ] Pressing `q` pops the screen and returns to the previous screen
- [ ] The sidebar lists all 7 sections: Home, Profile, Emails, SSH Keys, Tokens, Notifications, Connected Accounts
- [ ] The Home section fetches summary data concurrently from all settings endpoints
- [ ] Each summary card displays a live count or status indicator
- [ ] All acceptance criteria pass in E2E tests
- [ ] The screen requires authentication — 401 responses redirect to the auth error screen

### Sidebar Navigation
- [ ] Sidebar renders as a vertical list of section labels with index numbers (1–7)
- [ ] Focused sidebar item uses reverse video with primary color (ANSI 33)
- [ ] Active section has a `▶` marker and bold text
- [ ] `j`/`Down`: Move focus to next sidebar item
- [ ] `k`/`Up`: Move focus to previous sidebar item
- [ ] `Enter`: Load the focused section into the content area
- [ ] `1`–`7`: Jump directly to section by number
- [ ] `Tab`: Move focus from sidebar to content area (and vice versa)
- [ ] `Shift+Tab`: Move focus from content area to sidebar (and vice versa)

### Home Section (Summary Dashboard)
- [ ] Displays 6 summary cards in a vertical list: Profile, Emails, SSH Keys, Tokens, Notifications, Connected Accounts
- [ ] Profile card shows: display name (or username fallback), bio truncated to 60ch
- [ ] Emails card shows: "{count} email(s)", primary email masked as `a***e@example.com`
- [ ] SSH Keys card shows: "{count} SSH key(s)", last added date (relative)
- [ ] Tokens card shows: "{count} active token(s)"
- [ ] Notifications card shows: "Email notifications: enabled/disabled"
- [ ] Connected Accounts card shows: "{count} connected account(s)", provider names
- [ ] `j`/`k`: Navigate between summary cards
- [ ] `Enter` on a card: Navigate to that section
- [ ] Each card shows a loading skeleton while its data is being fetched
- [ ] If a card's fetch fails, that card shows an inline error with "R to retry" — other cards render normally

### Profile Section
- [ ] Displays editable form with fields: Display Name, Bio, Email (primary email selector)
- [ ] `Tab`/`Shift+Tab`: Navigate between form fields
- [ ] `Ctrl+S`: Submit profile update via `PATCH /api/user`
- [ ] `Esc`: Cancel edits and revert to saved values
- [ ] Display Name field: max 255 characters, character counter shown at 200+
- [ ] Bio field: multi-line input, max 500 characters
- [ ] Email field: `<select>` dropdown of verified email addresses
- [ ] Success: status bar flash "Profile updated" in green
- [ ] Error: inline error message below the form

### Emails Section
- [ ] Scrollable list of email addresses, each showing: email, primary badge, verified badge, relative date
- [ ] `a`: Open "Add email" inline form
- [ ] `p`: Set focused email as primary (confirmation required)
- [ ] `d`: Delete focused email (confirmation dialog)
- [ ] Cannot delete primary email — `d` on primary shows "Cannot delete primary email" flash
- [ ] Empty state: "No email addresses. Press a to add one."

### SSH Keys Section
- [ ] Scrollable list of SSH keys, each showing: name (truncated 30ch), key type badge, fingerprint (monospace), relative date
- [ ] `a`: Open "Add SSH key" form (title input + key textarea)
- [ ] `d`: Delete focused key (confirmation dialog)
- [ ] Duplicate fingerprint: inline error "This key is already registered"
- [ ] Invalid key format: inline error "Invalid SSH public key format"
- [ ] Empty state: "No SSH keys. Press a to add one."

### Tokens Section
- [ ] Scrollable list of tokens, each showing: name (truncated 30ch), last-eight identifier (monospace), scopes as badges, relative date
- [ ] `c`: Open "Create token" form
- [ ] Token reveal: highlighted banner with full token, "Press y to copy, Enter to dismiss"
- [ ] `d`: Revoke focused token (confirmation dialog)
- [ ] Token value shown only once at creation
- [ ] Empty state: "No personal access tokens. Press c to create one."

### Notifications Section
- [ ] `email_notifications_enabled`: toggle with `Space` or `Enter`
- [ ] Changes saved immediately via `PUT /api/user/settings/notifications`
- [ ] Optimistic toggle with revert on error

### Connected Accounts Section
- [ ] Scrollable list of connected OAuth accounts
- [ ] `d`: Disconnect focused account (confirmation dialog)
- [ ] Empty state: "No connected accounts."
- [ ] Footer hint: "Run `codeplane auth connect <provider>` to connect"

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Sidebar collapsed; horizontal section tabs at top. Fingerprints truncated to 20ch. Token scopes hidden
- [ ] 120×40 – 199×59: Full sidebar + content area. Fingerprints full (50ch). Token scopes as badges (max 3 + overflow)
- [ ] 200×60+: Wider sidebar with descriptions. All scopes visible

### Truncation & Boundary Constraints
- [ ] Display name: truncated with `…` at 30ch/50ch/80ch per breakpoint
- [ ] Bio: truncated with `…` at 40ch/60ch/120ch per breakpoint
- [ ] SSH fingerprints: truncated at 20ch (minimum) / 50ch (standard/large)
- [ ] Token last-eight: always 8ch, never truncated
- [ ] Scope badges: hidden at minimum; max 3 + `+N` at standard; all at large
- [ ] Timestamps: max 4ch
- [ ] Memory cap: 100 items per list section

### Edge Cases
- [ ] Terminal resize while in form: cursor position preserved, unsaved input retained
- [ ] Rapid j/k in lists: sequential, no debounce, one item per keypress
- [ ] Unicode in all text fields: truncation respects grapheme clusters
- [ ] Null/empty fields: rendered as blank or fallback, never "null"
- [ ] Zero items in any list: empty state message with action hint
- [ ] Delete confirmation canceled: no state change
- [ ] Token reveal dismissed: token value permanently gone
- [ ] Clipboard copy failure: show fallback message
- [ ] Session expired mid-edit: 401 → auth error, unsaved data lost
- [ ] 409 Conflict on SSH key add: "Key already registered on another account"

## Design

### Layout Structure

#### Standard Layout (120×40)
```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > Settings > SSH Keys                       │
├────────────────────┬─────────────────────────────────────────┤
│ Settings           │ SSH Keys (3)                    a:add   │
│                    │                                         │
│ 1 ▶ Home           │ Name            Type     Fingerprint    │
│ 2   Profile        │ ────────────────────────────────────    │
│ 3   Emails         │ ● Work Laptop   ed25519  SHA256:abc…  3d│
│ 4   SSH Keys       │   Home Desktop  rsa      SHA256:def…  1w│
│ 5   Tokens         │   CI Server     ed25519  SHA256:ghi…  2mo│
│ 6   Notifications  │                                         │
│ 7   Connected      │                                         │
├────────────────────┴─────────────────────────────────────────┤
│ Status: j/k:nav a:add d:delete Tab:sidebar Enter:select q:back│
└──────────────────────────────────────────────────────────────┘
```

#### Minimum Layout (80×24)
```
┌────────────────────────────────────────────────────────────┐
│ Header: Settings > SSH Keys                                 │
├────────────────────────────────────────────────────────────┤
│ [Home][Profile][Emails][SSH Keys][Tokens][Notif][Connected] │
├────────────────────────────────────────────────────────────┤
│ SSH Keys (3)                                        a:add   │
│ ● Work Laptop     ed25519  SHA256:abc…defgh…       3d       │
│   Home Desktop    rsa      SHA256:def…ghijk…       1w       │
│   CI Server       ed25519  SHA256:ghi…jklmn…       2mo      │
├────────────────────────────────────────────────────────────┤
│ j/k:nav a:add d:del q:back                                  │
└────────────────────────────────────────────────────────────┘
```

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for sidebar, content, cards, form layouts
- `<scrollbox>` — Scrollable content areas for list sections (SSH keys, tokens, emails, connected accounts) and the home summary card list
- `<text>` — Section titles, labels, counts, status indicators, card content, fingerprints, timestamps
- `<input>` — Form text fields (display name, bio, email address, SSH key title, token name, SSH public key content)
- `<select>` — Primary email selector in profile form, scope selector in token creation

### Keybindings
| Key | Action | Condition |
|-----|--------|-----------|
| `j`/`Down` | Next item | Sidebar or list focused |
| `k`/`Up` | Previous item | Sidebar or list focused |
| `Enter` | Select/activate | Any focusable item |
| `Tab` | Next focus zone | Sidebar ↔ content |
| `Shift+Tab` | Previous focus zone | Content ↔ sidebar |
| `1`–`7` | Jump to section | Not in input field |
| `a` | Add item | Emails, SSH Keys section |
| `c` | Create item | Tokens section |
| `d` | Delete/revoke | Item focused in list |
| `p` | Set primary | Emails section |
| `Space` | Toggle preference | Notifications section |
| `Ctrl+S` | Save/submit form | In form or input |
| `Esc` | Close overlay → cancel form → pop | Priority cascade |
| `R` | Retry failed fetch | Error state |
| `q` | Pop screen | Not in input field |
| `y` | Copy to clipboard | Token reveal banner |
| `G` | Jump to last item | Sidebar or list focused |
| `g g` | Jump to first item | Sidebar or list focused |
| `Ctrl+D` | Page down | Content scrollbox |
| `Ctrl+U` | Page up | Content scrollbox |
| `?` | Toggle help overlay | Always |
| `:` | Open command palette | Always |

### Responsive Behavior
80×24 = no sidebar, horizontal tabs, truncated columns; 120×40 = sidebar + full content; 200×60 = expanded sidebar with descriptions, all columns visible. Resize triggers synchronous re-layout, focused item preserved.

### Data Hooks Consumed
| Hook | Source | Endpoint |
|------|--------|----------|
| `useUser()` | `@codeplane/ui-core` | `GET /api/user` |
| `useUserEmails()` | `@codeplane/ui-core` | `GET /api/user/emails` |
| `useUserSSHKeys()` | `@codeplane/ui-core` | `GET /api/user/keys` |
| `useUserTokens()` | `@codeplane/ui-core` | `GET /api/user/tokens` |
| `useUserSessions()` | `@codeplane/ui-core` | `GET /api/user/sessions` |
| `useUserConnectedAccounts()` | `@codeplane/ui-core` | `GET /api/user/connections` |
| `useNotificationPreferences()` | `@codeplane/ui-core` | `GET /api/user/settings/notifications` |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useKeyboard()` | `@opentui/react` | Keyboard events |
| `useNavigation()` | local TUI | `{ push, pop, goTo }` |
| `useStatusBarHints()` | local TUI | Context-sensitive hints |

### Navigation
- `:settings` → `push("settings", { section: "home" })`
- Enter on sidebar item → updates active section (in-screen navigation)
- `q` → `pop()`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated |
|--------|-----------|---------------|
| View settings (any section) | ❌ | ✅ |
| Update profile | ❌ | ✅ |
| Add/delete email | ❌ | ✅ |
| Add/delete SSH key | ❌ | ✅ |
| Create/revoke token | ❌ | ✅ |
| Update notification prefs | ❌ | ✅ |
| Disconnect connected account | ❌ | ✅ |

- The Settings screen is personal — the authenticated user can only view and manage their own data
- No organization-level or admin-level permissions apply
- All endpoints filter by the authenticated user's ID; cross-user access returns 404 (not 403) to prevent enumeration
- Admin-only token scopes are only shown if `user.is_admin === true`

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Token value never displayed, logged, or included in error messages (except during token creation reveal)
- 401 responses propagate to auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- Token scopes required: read for GET endpoints; write for POST/PATCH/DELETE

### Rate Limiting
- 300 req/min for GET endpoints
- 60 req/min for POST/PATCH/DELETE endpoints
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting

### Input Sanitization
- Display name: max 255ch, trimmed, any Unicode
- Bio: max 500ch, trimmed, any Unicode
- Email: validated as email format client-side before API call
- SSH key title: max 255ch, trimmed
- SSH public key: validated for OpenSSH format client-side
- Token name: max 255ch, trimmed, non-empty after trimming
- All text rendered as plain `<text>` — no terminal escape injection
- Fingerprints rendered in monospace — no escape characters possible

### Data Sensitivity
- Email addresses are masked on the overview card (`a***e@example.com`), shown in full only in the Emails detail section
- SSH key fingerprints are shown but never the full public key content in list views
- Token values are shown only once at creation via the reveal banner; the `token_last_eight` field is the only persistent identifier
- No secrets, private keys, or full token values are stored client-side or persisted in TUI state beyond the reveal banner lifecycle

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.settings.view` | Screen mounted, home data loaded | `section`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.settings.section_change` | Section navigated | `from_section`, `to_section`, `via` (sidebar/card/number_key) |
| `tui.settings.profile_update` | Profile form submitted | `fields_changed[]`, `success`, `duration_ms` |
| `tui.settings.email_add` | Email added | `success`, `is_primary` |
| `tui.settings.email_delete` | Email deleted | `success`, `was_primary` |
| `tui.settings.email_set_primary` | Primary email changed | `success` |
| `tui.settings.ssh_key_add` | SSH key added | `key_type`, `success`, `error_type` |
| `tui.settings.ssh_key_delete` | SSH key deleted | `key_type`, `success` |
| `tui.settings.token_create` | Token created | `scope_count`, `success`, `error_type` |
| `tui.settings.token_revoke` | Token revoked | `success`, `token_age_days` |
| `tui.settings.token_copy` | Token copied from reveal | `clipboard_available` |
| `tui.settings.notification_toggle` | Notification pref toggled | `preference`, `new_value`, `success` |
| `tui.settings.connected_account_disconnect` | Account disconnected | `provider`, `success` |
| `tui.settings.error` | API failure | `section`, `error_type`, `http_status`, `request_type` |
| `tui.settings.retry` | Press R | `section`, `error_type`, `retry_success` |
| `tui.settings.data_load_time` | Section data loaded | `section`, `duration_ms`, `item_count` |

### Common Properties (all events)
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `breakpoint`: `"minimum"` | `"standard"` | `"large"`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Section navigation rate | >70% of views explore beyond home |
| Profile update rate | >10% of views |
| SSH key add rate | >5% of views |
| Token create rate | >5% of views |
| Token copy success | >95% of creates |
| Notification toggle rate | >8% of views |
| Delete confirmation rate | >90% of delete attempts |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <2s (home), <1s (section switch) |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `Settings: mounted [section={s}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Section switched | `Settings: section [from={old}] [to={new}] [via={method}]` |
| `debug` | Summary data loaded | `Settings: summary loaded [section={s}] [count={n}] [duration={ms}ms]` |
| `debug` | Form field changed | `Settings: field changed [section={s}] [field={f}]` |
| `info` | Fully loaded | `Settings: ready [section={s}] [items={n}] [total_ms={ms}]` |
| `info` | Profile updated | `Settings: profile updated [fields={f}] [duration={ms}ms]` |
| `info` | Item added | `Settings: item added [section={s}] [type={t}] [success={bool}]` |
| `info` | Item deleted | `Settings: item deleted [section={s}] [type={t}] [id={id}] [success={bool}]` |
| `info` | Preference toggled | `Settings: pref toggled [pref={p}] [value={v}] [success={bool}]` |
| `warn` | Fetch failed | `Settings: fetch failed [section={s}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Settings: rate limited [section={s}] [retry_after={s}]` |
| `warn` | Mutation failed | `Settings: mutation failed [section={s}] [action={a}] [status={code}]` |
| `warn` | Slow load (>3s) | `Settings: slow load [section={s}] [duration={ms}ms]` |
| `warn` | Clipboard unavailable | `Settings: clipboard unavailable [fallback=display]` |
| `error` | Auth error | `Settings: auth error [status=401]` |
| `error` | Render error | `Settings: render error [section={s}] [error={msg}]` |
| `error` | Validation error | `Settings: validation error [section={s}] [field={f}] [rule={r}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during form edit | Form re-renders; field values preserved; cursor preserved | Synchronous |
| Resize with dialog open | Dialog resizes proportionally; focus retained | Synchronous |
| Resize at minimum (sidebar collapse) | Sidebar collapses to horizontal tabs; focus preserved | Synchronous |
| SSE disconnect | Status bar indicator; settings data unaffected | SSE provider reconnects |
| Auth expiry | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R" | User retries |
| Delete 404 (already deleted) | Item removed from list; no error shown | Idempotent |
| SSH key 409 (duplicate) | Inline error on add form | Fix and resubmit |
| Profile update 422 | Inline field validation errors | Fix and resubmit |
| Rapid section switching | Previous requests cancelled | AbortController |
| No color support | Text labels replace color-coded icons | Theme detection |
| Clipboard failure | Show token on screen with manual copy instruction | Degraded but functional |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Dialog crash → dialog dismissed, error flash; user retries action
- All API fails → error state per section; `q` still works for navigation
- Slow network → spinner shown per section; user navigates away or waits
- Form submission during network outage → inline error; form data preserved

## Verification

### Test File: `e2e/tui/settings.test.ts`

### Terminal Snapshot Tests (35 tests)

- SNAP-SETTINGS-001: Settings home at 120×40 — sidebar, summary cards, header, status bar
- SNAP-SETTINGS-002: Settings home at 80×24 — horizontal tabs, single-column cards, no sidebar
- SNAP-SETTINGS-003: Settings home at 200×60 — expanded sidebar with descriptions, wider cards
- SNAP-SETTINGS-004: Profile section at 120×40 — form fields, current values, save hint
- SNAP-SETTINGS-005: Emails section at 120×40 — email list with badges and actions
- SNAP-SETTINGS-006: SSH Keys section at 120×40 — key list with type badges, fingerprints, dates
- SNAP-SETTINGS-007: Tokens section at 120×40 — token list with identifiers, scopes, dates
- SNAP-SETTINGS-008: Notifications section at 120×40 — toggle preferences display
- SNAP-SETTINGS-009: Connected Accounts section at 120×40 — provider list with dates
- SNAP-SETTINGS-010: Focused sidebar item — reverse video primary color highlight
- SNAP-SETTINGS-011: Active section marker — ▶ indicator and bold text
- SNAP-SETTINGS-012: Focused summary card — border color change to primary
- SNAP-SETTINGS-013: Focused list row — reverse video highlight on SSH key row
- SNAP-SETTINGS-014: Loading state — skeleton cards on home section
- SNAP-SETTINGS-015: Error state on single card — red inline error with "R to retry"
- SNAP-SETTINGS-016: Empty state — SSH keys
- SNAP-SETTINGS-017: Empty state — Tokens
- SNAP-SETTINGS-018: Empty state — Emails
- SNAP-SETTINGS-019: Confirmation dialog — delete SSH key
- SNAP-SETTINGS-020: Confirmation dialog — revoke token
- SNAP-SETTINGS-021: Token reveal banner
- SNAP-SETTINGS-022: Add SSH key form
- SNAP-SETTINGS-023: Create token form
- SNAP-SETTINGS-024: Inline validation — invalid SSH key
- SNAP-SETTINGS-025: Inline validation — duplicate key
- SNAP-SETTINGS-026: Status bar flash — profile updated
- SNAP-SETTINGS-027: Status bar flash — rate limited
- SNAP-SETTINGS-028: Breadcrumb rendering
- SNAP-SETTINGS-029: Status bar keybinding hints
- SNAP-SETTINGS-030: SSH key type badges
- SNAP-SETTINGS-031: Token scope badges
- SNAP-SETTINGS-032: Email primary/verified badges
- SNAP-SETTINGS-033: Connected account provider display
- SNAP-SETTINGS-034: Profile form character counter
- SNAP-SETTINGS-035: Horizontal tab bar at 80×24

### Keyboard Interaction Tests (52 tests)

- KEY-SETTINGS-001–004: j/k/Down/Up sidebar navigation
- KEY-SETTINGS-005–006: Enter selects sidebar section
- KEY-SETTINGS-007–009: 1–7 number keys jump to sections
- KEY-SETTINGS-010–011: Tab/Shift+Tab toggle sidebar ↔ content
- KEY-SETTINGS-012–015: j/k navigation within summary cards
- KEY-SETTINGS-016: Enter on summary card navigates to section
- KEY-SETTINGS-017–020: j/k navigation within SSH key list
- KEY-SETTINGS-021: a opens add SSH key form
- KEY-SETTINGS-022: d opens delete confirmation dialog
- KEY-SETTINGS-023: Enter on Delete button confirms
- KEY-SETTINGS-024: Esc in dialog cancels
- KEY-SETTINGS-025–028: j/k navigation within token list
- KEY-SETTINGS-029: c opens create token form
- KEY-SETTINGS-030: d opens revoke confirmation
- KEY-SETTINGS-031: y copies token in reveal banner
- KEY-SETTINGS-032: Enter dismisses reveal banner
- KEY-SETTINGS-033–036: j/k navigation within email list
- KEY-SETTINGS-037: a opens add email input
- KEY-SETTINGS-038: d opens email delete confirmation
- KEY-SETTINGS-039: p sets primary email
- KEY-SETTINGS-040: d on primary email shows error flash
- KEY-SETTINGS-041–043: Tab within profile form fields
- KEY-SETTINGS-044: Ctrl+S saves profile
- KEY-SETTINGS-045: Esc cancels profile edits
- KEY-SETTINGS-046: Space toggles notification preference
- KEY-SETTINGS-047: d on connected account opens disconnect dialog
- KEY-SETTINGS-048: R retries failed fetch
- KEY-SETTINGS-049: q pops screen
- KEY-SETTINGS-050: Esc priority cascade
- KEY-SETTINGS-051: Keys in input fields type (don't navigate)
- KEY-SETTINGS-052: Rapid j presses (10× sequential)

### Responsive Tests (18 tests)

- RESP-SETTINGS-001–003: 80×24 layout, no sidebar, horizontal tabs
- RESP-SETTINGS-004–006: 120×40 layout, sidebar, standard truncation
- RESP-SETTINGS-007–008: 200×60 layout, expanded sidebar, all columns
- RESP-SETTINGS-009: Resize 80→120 — sidebar appears
- RESP-SETTINGS-010: Resize 120→80 — sidebar collapses
- RESP-SETTINGS-011: Resize with sidebar focused
- RESP-SETTINGS-012: Resize with content focused
- RESP-SETTINGS-013: Resize during form edit
- RESP-SETTINGS-014: Resize with dialog open
- RESP-SETTINGS-015: Summary cards at 80×24
- RESP-SETTINGS-016: Summary cards at 200×60
- RESP-SETTINGS-017: SSH fingerprints at 80×24 truncated
- RESP-SETTINGS-018: Token scopes hidden at 80×24, visible at 120×40

### Integration Tests (25 tests)

- INT-SETTINGS-001: Auth expiry → auth error screen
- INT-SETTINGS-002: Rate limit on GET
- INT-SETTINGS-003: Rate limit on mutation
- INT-SETTINGS-004: Network error → retry
- INT-SETTINGS-005: Server 500 on profile update
- INT-SETTINGS-006: Add SSH key → list refresh
- INT-SETTINGS-007: Delete SSH key → removed
- INT-SETTINGS-008: Duplicate SSH key (409)
- INT-SETTINGS-009: Invalid SSH key format
- INT-SETTINGS-010: Create token → reveal → dismiss → list refresh
- INT-SETTINGS-011: Revoke token → removed
- INT-SETTINGS-012: Revoke last token → empty state
- INT-SETTINGS-013: Add email → list refresh
- INT-SETTINGS-014: Delete email → removed
- INT-SETTINGS-015: Set primary email → badge moves
- INT-SETTINGS-016: Toggle notification pref → saved
- INT-SETTINGS-017: Disconnect account → removed
- INT-SETTINGS-018: Deep link --screen settings
- INT-SETTINGS-019: Command palette :settings
- INT-SETTINGS-020: Concurrent section fetches
- INT-SETTINGS-021: Section switch cancels requests
- INT-SETTINGS-022: Empty display name → username fallback
- INT-SETTINGS-023: 255ch display name → accepted
- INT-SETTINGS-024: Admin scopes hidden for non-admin
- INT-SETTINGS-025: Delete already-deleted key (404)

### Edge Case Tests (16 tests)

- EDGE-SETTINGS-001: No auth token
- EDGE-SETTINGS-002: Unicode grapheme-aware truncation
- EDGE-SETTINGS-003: Emoji in field values
- EDGE-SETTINGS-004: Empty bio
- EDGE-SETTINGS-005: Empty display name
- EDGE-SETTINGS-006: Long SSH key (4096 chars)
- EDGE-SETTINGS-007: 100 SSH keys scrollable
- EDGE-SETTINGS-008: 50 tokens scrollable
- EDGE-SETTINGS-009: Special chars in token name
- EDGE-SETTINGS-010: Clipboard unavailable
- EDGE-SETTINGS-011: Concurrent resize + navigation
- EDGE-SETTINGS-012: Rapid d presses (double-delete prevention)
- EDGE-SETTINGS-013: Empty required fields validation
- EDGE-SETTINGS-014: Network disconnect mid-submission
- EDGE-SETTINGS-015: Session expired during token reveal
- EDGE-SETTINGS-016: Zero items in all sections

All 146 tests left failing if backend is unimplemented — never skipped or commented out.

# TUI_ORG_MEMBERS_VIEW

Specification for TUI_ORG_MEMBERS_VIEW.

## High-Level User POV

The Organization Members View is the primary screen for browsing and managing the roster of an organization in the Codeplane TUI. It presents a full-screen, keyboard-driven member list within the organization context, designed for developers who need to audit membership, check roles, add new collaborators, or remove departed members — all without leaving the terminal.

The screen is reached by pressing `m` from the organization overview screen, by selecting "Members" in the command palette with an active organization context, or by navigating via the go-to sequence `g o` to organizations, opening an organization, and pressing `m`. The breadcrumb updates to show "Dashboard > org-name > Members". The screen can also be reached via deep-link launch: `codeplane tui --screen org-members --org acme-corp`.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Members" in bold primary color, followed by the total member count in parentheses — for example, "Members (24)". Below the title is a persistent toolbar that displays the current role filter and a search input indicator.

The main content area is a scrollable list of member rows. Each row occupies a single line and shows: a role badge ("owner" in warning color or "member" in muted color), the username, and the display name (when set). The focused row is highlighted with reverse video using the primary accent color. Navigation uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused member does nothing in the current scope (future: push a user profile view).

Role filtering is accessible via `f`, which cycles through: "All" (default), "Owners", and "Members". This is a client-side filter applied to loaded data. Text search via `/` focuses the search input for client-side substring matching on username and display name (case-insensitive). Pressing `Esc` clears the filter and returns focus to the list.

For organization owners, the screen exposes management actions. Pressing `a` opens an "Add Member" flow: a modal overlay with a username input and role selection (`o` for Owner, `m` for Member, `Enter` defaults to Member). On success, the member list refreshes and the status bar confirms "Added {username} as {role}." Pressing `r` on a focused member opens a confirmation prompt to remove that member. The last remaining owner cannot be removed — the `r` key on that row displays "Cannot remove the last organization owner" in the status bar instead of a confirmation prompt.

For non-owner members, the `a` and `r` keybindings are inactive. The status bar hints for these keys are not displayed.

The list supports cursor-based pagination with a default page size of 30 and a memory cap of 500 members. When the user scrolls past 80% of loaded items, the next page is fetched automatically. A "Loading more…" indicator appears at the bottom during the fetch.

When the terminal is at minimum size (80×24), the display name column is hidden, and only the role badge and username are shown. At standard size (120×40), the full layout renders with display name. At large sizes (200×60+), columns are wider. If the API request fails, an inline error message replaces the list content with "Press `R` to retry." Auth errors (401) propagate to the app-shell auth error screen.

## Acceptance Criteria

### Definition of Done

- [ ] The Organization Members View renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `m` from the org overview screen, `:members` command palette entry (with org context), and `--screen org-members --org <name>` deep-link
- [ ] The breadcrumb reads "Dashboard > org-name > Members"
- [ ] Pressing `q` pops the screen and returns to the organization overview (or previous screen)
- [ ] Members are fetched via `useOrgMembers()` from `@codeplane/ui-core`, calling `GET /api/orgs/:org/members` with cursor-based pagination (default page size 30)
- [ ] The list defaults to showing all members sorted by `id` ascending (creation order)
- [ ] Each row displays: role badge (colored), username, display name (if set)
- [ ] The header shows "Members (N)" where N is the `X-Total-Count` from the API response
- [ ] The role filter toolbar is always visible below the title row
- [ ] Role filter changes apply client-side to loaded data and do not trigger new API requests

### Keyboard Interactions

- [ ] `j` / `Down`: Move focus to next member row
- [ ] `k` / `Up`: Move focus to previous member row
- [ ] `Enter`: No-op in current scope (reserved for future user profile navigation)
- [ ] `/`: Focus search input in toolbar
- [ ] `Esc`: Close overlay → clear search → pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded member row
- [ ] `g g`: Jump to first member row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `f`: Cycle role filter (All → Owners → Members → All)
- [ ] `a`: Open "Add Member" flow (owners only; no-op for non-owners)
- [ ] `r`: Open remove member confirmation (owners only; no-op for non-owners)
- [ ] `q`: Pop screen
- [ ] `Space`: Toggle row selection (for future bulk actions)
- [ ] `?`: Toggle help overlay showing all keybindings for this screen
- [ ] `:`: Open command palette

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Role badge (8ch), username (remaining, truncated with `…`). Display name hidden. Toolbar: role filter + search only. Add member overlay uses 90% width
- [ ] 120×40 – 199×59: Role badge (8ch), username (25ch), display name (30ch). Full toolbar with action hints. Add member overlay uses 50% width
- [ ] 200×60+: Role badge (8ch), username (30ch), display name (50ch). Wider columns with additional padding
- [ ] Terminal resize preserves: current focused row index, scroll position (clamped to valid range), filter input content, loaded page data

### Truncation & Boundary Constraints

- [ ] Username: truncated with `…` at column width. API max 39 characters. Display: 25ch (standard), 30ch (large)
- [ ] Display name: truncated with `…` at column width. API max 255 characters. Display: 30ch (standard), 50ch (large). Empty string if not set (no "null" text). Hidden at minimum breakpoint
- [ ] Role badge: exactly `"owner"` (5ch) or `"member"` (6ch), right-padded to 8ch
- [ ] Search input: max 100 characters. Characters beyond 100 are silently dropped
- [ ] Memory cap: 500 members maximum loaded in the scrollbox
- [ ] Total count: abbreviated above 9999 (e.g., "10K")
- [ ] Add-member username input: max 39 characters
- [ ] Confirmation prompt text: truncated at terminal width minus 4ch (border padding)
- [ ] Breadcrumb path: truncated from the left if it exceeds available header width, showing `… > Members` as the minimum visible segment

### Edge Cases

- [ ] Terminal resize while scrolled: focus preserved, columns recalculate synchronously
- [ ] Terminal resize while add-member overlay is open: overlay re-centers and adjusts width proportionally
- [ ] Terminal resize while remove confirmation is open: dialog re-centers without dismissing
- [ ] Rapid `j`/`k` presses: processed sequentially, one row per keypress, no debouncing; rendering throttled to 60fps
- [ ] Role filter change during pagination: filter applied to all currently loaded items immediately
- [ ] Unicode in display names: truncation respects grapheme clusters (not bytes)
- [ ] Null/empty fields: display name renders as blank, no "null" or placeholder text
- [ ] 500+ members: pagination cap reached, footer shows "Showing 500 of {total} members"
- [ ] Add member 403/409/404: appropriate error messages displayed inline in the overlay
- [ ] Remove member 409: "Cannot remove the last organization owner" shown in status bar
- [ ] Single member (owner only): list renders one row, `r` shows last-owner message
- [ ] SSE disconnect: members list unaffected (uses REST, not SSE)
- [ ] Network disconnect mid-pagination: error state for page, previously loaded items remain visible
- [ ] Viewer not an org member (403): screen shows permission error message
- [ ] Navigating back while pagination is in-flight: cancel the pending request and pop the screen
- [ ] Removing the focused member: focus moves to the next row, or the previous row if the removed member was last in the list
- [ ] Adding a user who is already a member: API returns 409; overlay shows "User is already a member of this organization"
- [ ] Adding a user who does not exist: API returns 404; overlay shows "User not found"
- [ ] Rapid `r` presses: only the first opens the confirmation dialog; subsequent presses are no-ops while dialog is open
- [ ] Keys in search input mode: `j`/`f`/`q`/`a`/`r` type as text characters, not action keybindings

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > acme-corp > Members                 🔔 3 │
├──────────────────────────────────────────────────────────────┤
│ Members (24)                                       / search  │
│ Role: All                                                    │
├──────────────────────────────────────────────────────────────┤
│ owner   alice         Alice Chen                             │
│ member  bob           Bob Williams                           │
│ member  carol         Carol Jimenez                          │
│ owner   dave                                                 │
│ member  eve           Eve Nakamura                           │
│ …                                                            │
│                    Loading more…                              │
├──────────────────────────────────────────────────────────────┤
│ j/k:nav f:role /:search a:add r:remove q:back      ●  ?:help│
└──────────────────────────────────────────────────────────────┘
```

### Components Used

- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar
- `<scrollbox>` — Scrollable member list with scroll-to-end pagination detection at 80%
- `<text>` — Usernames, display names, role badges, count, filter labels
- `<input>` — Search input in filter toolbar (focused via `/`), add-member username input

### Role Badge Colors

| Role | Color Token | ANSI |
|------|-------------|------|
| `owner` | `warning` | Yellow (178) |
| `member` | `muted` | Gray (245) |

### Additional Color Reference

| Token | Usage | ANSI 256 |
|-------|-------|----------|
| `primary` | Title text, focused row accent, add overlay border | Blue (33) |
| `error` | Error messages, remove dialog border | Red (196) |
| `muted` | Display name, column labels, metadata, member badge | Gray (245) |
| `surface` | Modal/dialog background | Dark gray (236) |
| `border` | Box borders, separators | Gray (240) |

### Add Member Flow (Owner Only)

Modal overlay (50% width × 30% height at standard size, 90% width at minimum size, centered, border `primary`, bg `surface` 236):
1. Username `<input>` focused (max 39ch)
2. `Tab` to role selection: `m` for Member (default), `o` for Owner
3. `Enter` or `Ctrl+S` submits via `POST /api/orgs/:org/members`
4. Success (201): overlay closes, list refreshes, status bar confirms "Added {username} as {role}."
5. Errors displayed inline in overlay: 404 "User not found", 409 "User is already a member", 422 "Invalid role", 403 "Only organization owners can add members"
6. `Esc` cancels

### Remove Member Flow (Owner Only)

Confirmation overlay (60% width × 20% height, centered, border `error`):
- Last owner protection: pressing `r` on the last remaining owner shows status bar message instead of dialog
- `y` confirms (optimistic removal, 204 expected)
- `n`/`Esc` cancels
- On success: member removed from list, focus moves to next row, count decrements
- On error: optimistic removal reverts, error text appears inline in the dialog

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j`/`Down` | Next row | List focused, not in input/overlay |
| `k`/`Up` | Previous row | List focused, not in input/overlay |
| `Enter` | No-op (reserved) | Member focused |
| `/` | Focus search | List focused, no overlay open |
| `Esc` | Close overlay → clear search → pop | Priority chain |
| `G` | Last loaded row | List focused |
| `g g` | First row | List focused |
| `Ctrl+D`/`Ctrl+U` | Page down/up | List focused |
| `R` | Retry | Error state visible |
| `f` | Cycle role filter | List focused, not in input/overlay |
| `a` | Add member overlay | Viewer is owner, no overlay open |
| `r` | Remove member prompt | Viewer is owner, member focused, no overlay open |
| `Space` | Toggle selection | Member focused |
| `q` | Pop screen | Not in input/overlay |
| `?` | Toggle help overlay | Always |
| `:` | Open command palette | Always |
| `Tab` | Next field in add overlay | Add overlay open |
| `y` | Confirm removal | Remove dialog open |
| `n` | Cancel removal | Remove dialog open |

### Responsive Column Layout

- **80×24**: `│ owner  (8ch) │ username (remaining) │` — display name hidden
- **120×40**: `│ owner  (8ch) │ username (25ch) │ display_name (30ch) │` — full toolbar
- **200×60**: `│ owner  (8ch) │ username (30ch) │ display_name (50ch) │` — wider columns

### Data Hooks

- `useOrgMembers()` from `@codeplane/ui-core` → `GET /api/orgs/:org/members` (cursor pagination, page size 30). Returns `{ items: OrgMember[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void }`
- `useOrgRole()` from `@codeplane/ui-core` → viewer's role in org (`"owner" | "member" | null`)
- `useAddOrgMember()` from `@codeplane/ui-core` → `POST /api/orgs/:org/members` mutation
- `useRemoveOrgMember()` from `@codeplane/ui-core` → `DELETE /api/orgs/:org/members/:username` mutation
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useOrgContext()` from local TUI

### OrgMember Type

```typescript
interface OrgMember {
  id: number;
  username: string;
  display_name: string;   // "" if not set
  avatar_url: string;     // not rendered in TUI (no images)
  role: "owner" | "member";
}
```

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Org Member | Org Owner |
|--------|-----------|------------|----------|
| View member list | ❌ 401 | ✅ | ✅ |
| Search/filter members (client-side) | ❌ | ✅ | ✅ |
| Add member | ❌ | ❌ 403 | ✅ |
| Remove member | ❌ | ❌ 403 | ✅ |
| Remove last owner | ❌ | ❌ | ❌ 409 |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/orgs/:org/members` requires the viewer to be an organization member (`"owner"` or `"member"` role). Non-members receive 403
- `POST /api/orgs/:org/members` (add) requires `"owner"` role. Non-owners receive 403
- `DELETE /api/orgs/:org/members/:username` (remove) requires `"owner"` role. Non-owners receive 403
- The `a` and `r` keybinding hints are only displayed in the status bar when the viewer is an org owner
- Even if a non-owner somehow invokes the add/remove actions, the API enforces the constraint server-side
- The last-owner constraint is enforced server-side (409) and also checked client-side to prevent unnecessary API calls

### Token-based Auth

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Passed as Bearer token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to the app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- `GET /api/orgs/:org/members`: 300 requests/minute per authenticated user
- `POST /api/orgs/:org/members`: 60 requests/minute per authenticated user (scoped to `user_id + org_id`)
- `DELETE /api/orgs/:org/members/:username`: inherits platform-wide rate limiting
- 429 responses display inline: "Rate limited. Retry in {Retry-After}s."
- No auto-retry on rate limit. User presses `R` after waiting

### Input Sanitization

- Search/filter text is client-side only — never sent to the API
- Role filter values from fixed enum — no user strings reach the API for filtering
- Add-member username input is sent to the API as-is; validation is server-side
- Member names rendered as plain `<text>` (no injection vector in terminal)
- Role values from fixed enum — no escape injection possible

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.org.members.view` | Screen mounted, data loaded | `org_name`, `total_count`, `viewer_role`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.org.members.filter_role` | User presses `f` to change role filter | `org_name`, `new_filter`, `previous_filter`, `matched_count`, `total_loaded_count` |
| `tui.org.members.search` | User types in search input (debounced 500ms) | `org_name`, `query_length`, `match_count`, `total_loaded_count` |
| `tui.org.members.paginate` | Next page loaded via scroll | `org_name`, `page_number`, `items_loaded_total`, `total_count` |
| `tui.org.members.add.start` | User presses `a` to open add overlay | `org_name`, `viewer_role` |
| `tui.org.members.add.submit` | User submits add member form | `org_name`, `assigned_role`, `success`, `error_reason`, `status_code` |
| `tui.org.members.add.cancel` | User presses Esc on add overlay | `org_name` |
| `tui.org.members.remove.start` | User presses `r` on a member | `org_name`, `target_username`, `target_role` |
| `tui.org.members.remove.confirm` | User confirms removal | `org_name`, `target_username`, `target_role`, `success`, `error_reason`, `status_code` |
| `tui.org.members.remove.cancel` | User cancels removal | `org_name`, `target_username` |
| `tui.org.members.remove.last_owner_blocked` | User presses `r` on last owner | `org_name`, `target_username` |
| `tui.org.members.error` | API failure on list fetch | `org_name`, `error_type`, `http_status`, `request_type` |
| `tui.org.members.retry` | User presses `R` | `org_name`, `error_type`, `retry_success` |
| `tui.org.members.empty` | Empty state shown | `org_name`, `has_role_filter`, `has_search_text` |

### Common Properties (all events)

`session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode` (256/truecolor/16), `breakpoint` (minimum/standard/large)

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion rate | >98% |
| Role filter usage | >15% of views |
| Search usage | >10% of views |
| Add member conversion (start → submit) | >70% |
| Remove member conversion (start → confirm) | >60% |
| Add member success rate | >90% of submissions |
| Remove member success rate | >95% of confirmations |
| Error rate (5xx) | <1% |
| Retry success rate | >80% |
| Time to interactive | <1.5s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `OrgMembers: mounted [org={o}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `OrgMembers: loaded [org={o}] [count={n}] [total={t}] [duration={ms}ms]` |
| `debug` | Role filter changed | `OrgMembers: role filter [org={o}] [from={old}] [to={new}]` |
| `debug` | Search text changed | `OrgMembers: search [org={o}] [query_length={n}] [matches={m}]` |
| `debug` | Pagination triggered | `OrgMembers: pagination [org={o}] [page={n}]` |
| `info` | Fully loaded | `OrgMembers: ready [org={o}] [members={n}] [viewer_role={r}] [total_ms={ms}]` |
| `info` | Member added | `OrgMembers: member added [org={o}] [username={u}] [role={r}]` |
| `info` | Member removed | `OrgMembers: member removed [org={o}] [username={u}]` |
| `warn` | Fetch failed | `OrgMembers: fetch failed [org={o}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `OrgMembers: rate limited [org={o}] [retry_after={s}]` |
| `warn` | Add member failed | `OrgMembers: add failed [org={o}] [username={u}] [status={code}] [error={msg}]` |
| `warn` | Remove member failed | `OrgMembers: remove failed [org={o}] [username={u}] [status={code}] [error={msg}]` |
| `warn` | Slow load (>3s) | `OrgMembers: slow load [org={o}] [duration={ms}ms]` |
| `warn` | Pagination cap | `OrgMembers: pagination cap [org={o}] [total={n}] [cap=500]` |
| `error` | Auth error | `OrgMembers: auth error [org={o}] [status=401]` |
| `error` | Permission denied | `OrgMembers: permission denied [org={o}] [action={a}]` |
| `error` | Render error | `OrgMembers: render error [org={o}] [error={msg}]` |

Logs to stderr. Level controlled via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during load | Layout re-renders synchronously; fetch continues | Automatic |
| Resize with overlay open | Overlay re-centers and resizes proportionally | Synchronous |
| SSE disconnect | Members list unaffected (uses REST) | SSE provider reconnects independently |
| Auth expiry (401) | Propagates to app-shell auth error screen | Re-auth via `codeplane auth login` |
| Network timeout (30s) | Loading → error state with "Press R to retry" | User presses `R` |
| Add member 403 | Overlay shows "Only organization owners can add members" | Informational only |
| Add member 404 | Overlay shows "User not found" | User can modify input and retry |
| Add member 409 | Overlay shows "User is already a member of this organization" | User can modify input |
| Add member 422 | Overlay shows "Invalid role" | User can correct role selection |
| Remove member 409 | Status bar shows "Cannot remove the last organization owner" | Informational only |
| Remove member 404 | Dialog shows "Member not found (already removed?)" | Dialog can be dismissed |
| Rate limit (429) | Inline "Rate limited. Retry in {n}s." | User waits and presses `R` |
| Rapid `f` cycling | Immediate client-side filter, no API calls | No degradation |
| No color support | Role badges render as plain text `[owner]`/`[member]` | Theme detection fallback |
| Memory cap (500) | Stop pagination, show cap message | Client-side cap, user can filter |
| Org deleted between navigation and load | 404 error state | `q` to go back |

### Failure Modes

- Component crash → global error boundary → "Press `r` to restart" / "Press `q` to quit"
- Add/remove overlay crash → overlay dismissed, error flash in status bar; user retries
- All API fails → error state; `q` still works for navigation, `R` retries
- Slow network → braille spinner shown; user can navigate away via go-to keybindings or command palette
- Pagination failure mid-scroll → error shown below last loaded item; previously loaded items remain visible and navigable
- Mutation in-flight when navigating away → mutation completes in background; success or failure does not trigger UI updates after screen is popped

## Verification

### Test File: `e2e/tui/organizations.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-ORGMEM-001: Member list at 120×40 with populated members — full layout, role badges, columns, focus highlight
- SNAP-ORGMEM-002: Member list at 80×24 minimum — role badge + username only, display name hidden
- SNAP-ORGMEM-003: Member list at 200×60 large — all columns with expanded widths
- SNAP-ORGMEM-004: Empty state — "This organization has no members."
- SNAP-ORGMEM-005: Loading state — braille spinner with "Loading members…"
- SNAP-ORGMEM-006: Error state — red error message with "Press R to retry"
- SNAP-ORGMEM-007: Permission denied state — "You do not have permission to view this organization's members."
- SNAP-ORGMEM-008: Focused row highlight — primary accent color (ANSI 33) reverse video
- SNAP-ORGMEM-009: Owner role badge — "owner" in warning color (ANSI 178)
- SNAP-ORGMEM-010: Member role badge — "member" in muted color (ANSI 245)
- SNAP-ORGMEM-011: Mixed owners and members — correct coloring per row
- SNAP-ORGMEM-012: Role filter toolbar showing "All"
- SNAP-ORGMEM-013: Role filter toolbar showing "Owners"
- SNAP-ORGMEM-014: Role filter toolbar showing "Members"
- SNAP-ORGMEM-015: Search input active with narrowed results
- SNAP-ORGMEM-016: Search with no matches — "No members match the current filters"
- SNAP-ORGMEM-017: Pagination loading indicator — "Loading more…"
- SNAP-ORGMEM-018: Pagination cap indicator — "Showing 500 of N members"
- SNAP-ORGMEM-019: Breadcrumb — "Dashboard > acme-corp > Members"
- SNAP-ORGMEM-020: Total count header — "Members (24)"
- SNAP-ORGMEM-021: Status bar hints for org owner — includes a:add r:remove
- SNAP-ORGMEM-022: Status bar hints for org member — excludes a:add r:remove
- SNAP-ORGMEM-023: Add member overlay at 120×40
- SNAP-ORGMEM-024: Add member overlay with inline error
- SNAP-ORGMEM-025: Remove member confirmation overlay
- SNAP-ORGMEM-026: Single member (owner only) with last-owner indicator
- SNAP-ORGMEM-027: Member with empty display name — no gap or placeholder
- SNAP-ORGMEM-028: Selected row with ✓ indicator

### Keyboard Interaction Tests (42 tests)

- KEY-ORGMEM-001–004: j/k/Down/Up navigation through member list
- KEY-ORGMEM-005: j at last row (boundary — focus stays)
- KEY-ORGMEM-006: k at first row (boundary — focus stays)
- KEY-ORGMEM-007–008: Enter on focused member (no-op, verify no navigation)
- KEY-ORGMEM-009–012: / search activation, typing narrows list, case-insensitive match, Esc clears
- KEY-ORGMEM-013–015: Esc context priority (overlay → search → pop)
- KEY-ORGMEM-016–019: G, g g, Ctrl+D, Ctrl+U navigation
- KEY-ORGMEM-020–021: R retry in error state, R no-op when not in error
- KEY-ORGMEM-022–024: f role filter cycling (All → Owners → Members → All)
- KEY-ORGMEM-025: f filter correctly shows only owners
- KEY-ORGMEM-026: f filter correctly shows only members
- KEY-ORGMEM-027–030: a opens add member overlay (owner), type username, select role, submit
- KEY-ORGMEM-031: a no-op for non-owner
- KEY-ORGMEM-032: Add member Esc cancels overlay
- KEY-ORGMEM-033: Add member Tab cycles through fields
- KEY-ORGMEM-034–036: r opens remove confirmation (owner), y confirms, n cancels
- KEY-ORGMEM-037: r no-op for non-owner
- KEY-ORGMEM-038: r on last owner shows status bar message instead of prompt
- KEY-ORGMEM-039: q pops screen
- KEY-ORGMEM-040: Space toggles row selection
- KEY-ORGMEM-041: Rapid j presses (15× sequential)
- KEY-ORGMEM-042: Keys in search input (j/f/q type as text, not action)

### Responsive Tests (14 tests)

- RESP-ORGMEM-001–002: 80×24 layout — role badge + username only, truncation active
- RESP-ORGMEM-003–004: 120×40 layout — full columns, display name visible
- RESP-ORGMEM-005–006: 200×60 layout — expanded widths
- RESP-ORGMEM-007–008: Resize from 80→120 (column appears), from 120→80 (column collapses)
- RESP-ORGMEM-009: Focus preserved through resize
- RESP-ORGMEM-010: Resize during search — filter text preserved, results still shown
- RESP-ORGMEM-011: Resize during loading — spinner re-centers
- RESP-ORGMEM-012: Resize with add member overlay open — overlay re-centers and adjusts width
- RESP-ORGMEM-013: Resize with remove confirmation open — dialog re-centers without dismissing
- RESP-ORGMEM-014: Add member overlay at 80×24 uses 90% width instead of 50%

### Integration Tests (20 tests)

- INT-ORGMEM-001: Auth expiry (401) propagates to auth error screen
- INT-ORGMEM-002: Rate limit (429) shows inline message with retry-after
- INT-ORGMEM-003: Network error shows error state with retry hint
- INT-ORGMEM-004: Server 500 shows error state
- INT-ORGMEM-005: Pagination completes (no more pages — hasMore becomes false)
- INT-ORGMEM-006: Pagination cap at 500 members
- INT-ORGMEM-007: Navigation round-trip (push members → pop back to org overview)
- INT-ORGMEM-008: Deep-link launch with --screen org-members --org acme-corp
- INT-ORGMEM-009: Command palette `:members` with org context
- INT-ORGMEM-010: Add member success — list refreshes, new member appears, count increments
- INT-ORGMEM-011: Add member 409 — already a member error in overlay
- INT-ORGMEM-012: Add member 404 — user not found error in overlay
- INT-ORGMEM-013: Add member 422 — invalid role error in overlay
- INT-ORGMEM-014: Remove member success — member row disappears, count decrements
- INT-ORGMEM-015: Remove member 409 — last owner blocked
- INT-ORGMEM-016: Remove member 404 — member already removed
- INT-ORGMEM-017: Non-member viewer receives 403, permission denied state
- INT-ORGMEM-018: Org not found (404) — error state
- INT-ORGMEM-019: Add member then verify in list — full round-trip
- INT-ORGMEM-020: Remove member then verify absent from list — full round-trip

### Edge Case Tests (15 tests)

- EDGE-ORGMEM-001: No auth token — bootstrap rejects before reaching screen
- EDGE-ORGMEM-002: Long username (39 chars) — truncation at minimum size
- EDGE-ORGMEM-003: Unicode/emoji in display name — correct rendering and truncation
- EDGE-ORGMEM-004: Display name is empty string — no gap or placeholder text
- EDGE-ORGMEM-005: Single member (owner only) — j/k are no-ops
- EDGE-ORGMEM-006: Concurrent resize + navigation — no crash
- EDGE-ORGMEM-007: Search no matches — empty state with clear hint
- EDGE-ORGMEM-008: Search matches username but not display name — member shown
- EDGE-ORGMEM-009: Search matches display name but not username — member shown
- EDGE-ORGMEM-010: 100+ members loaded, role filter to "Owners" shows subset
- EDGE-ORGMEM-011: Add member with empty username — form validation prevents submit
- EDGE-ORGMEM-012: Add member with self (already member) — 409 displayed
- EDGE-ORGMEM-013: Network disconnect mid-add-member — error shown in overlay
- EDGE-ORGMEM-014: Rapid r presses — only first opens confirmation dialog
- EDGE-ORGMEM-015: Organization name with special characters in breadcrumb — renders correctly

All 119 tests left failing if backend is unimplemented — never skipped or commented out.

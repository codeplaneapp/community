# TUI_ORG_TEAMS_VIEW

Specification for TUI_ORG_TEAMS_VIEW.

## High-Level User POV

The organization teams view is the primary screen for discovering and managing teams within an organization in the Codeplane TUI. It is reached by navigating to an organization overview and pressing `t` to open the teams tab, or by using the go-to sequence `g o` to reach the organization list, selecting an org, and then pressing `t`. The screen can also be reached via the command palette (`:` → "Go to Teams") when an organization context is active.

When the screen loads, the user sees a "Teams" heading with the total team count in parentheses — for example, "Teams (12)" — followed by a scrollable list of all teams in the organization. Each team row displays the team name, a color-coded permission badge (`read` in green, `write` in yellow, `admin` in red), and a single-line truncated description. The focused row is highlighted with the `primary` accent color, and the user navigates through the list using `j`/`k` or arrow keys. Pressing `Enter` on a focused team pushes the team detail screen onto the navigation stack, updating the breadcrumb to "org-name > Teams > team-name".

A filter input is available by pressing `/`, which narrows the visible list client-side by matching team names or descriptions against the typed query (case-insensitive substring match). Pressing `Esc` clears the filter and returns focus to the list.

For organization owners, a `c` keybinding is available to create a new team, which pushes the team creation form screen. For non-owner members, the `c` key is inactive and the status bar does not show the create hint. This role-based visibility keeps the interface clean — non-owners see a read-only teams directory without any confusing inaccessible actions.

The list uses cursor-based pagination via a scrollbox. When the user scrolls past 80% of loaded items, the next page is fetched automatically. A "Loading more…" indicator appears at the bottom during the fetch. If there are no more pages, no indicator is shown.

If the organization has no teams, the screen shows a role-aware empty state. Owners see: "No teams yet. Press `c` to create your first team." Members see: "No teams yet. Ask an organization owner to create teams." If the API request fails, an inline error message replaces the list content with the error description and "Press `R` to retry."

At minimum terminal size (80×24), the description column is hidden and only the team name and permission badge are shown. At standard size (120×40), the full layout includes the description and a relative creation timestamp. At large sizes (200×60+), the description column is wider and an additional member count column appears.

The breadcrumb trail reads "org-name > Teams" and the status bar shows context-sensitive keybinding hints: `j/k:nav  Enter:open  /:filter  c:create  q:back` (with `c:create` only shown for owners).

## Acceptance Criteria

### Definition of Done

- [ ] The Teams screen is pushed onto the navigation stack from the organization overview when the user presses `t` or selects the "Teams" tab
- [ ] Teams are fetched via `useOrgTeams(orgName)` from `@codeplane/ui-core`, which calls `GET /api/orgs/:org/teams`
- [ ] The list is sorted by `id` ascending (creation order), matching the API default sort
- [ ] Each row displays: team name, permission badge (read/write/admin), and description (truncated)
- [ ] Permission badges are color-coded: `success` (green) for `read`, `warning` (yellow) for `write`, `error` (red) for `admin`
- [ ] `j`/`k` (and `Down`/`Up` arrow keys) move the focus cursor through the list
- [ ] `Enter` on a focused row pushes the team detail screen (`TUI_ORG_TEAM_DETAIL`) onto the navigation stack with `orgName` and `teamName` as context
- [ ] `/` activates an inline filter input that narrows the list client-side by team name or description substring match (case-insensitive)
- [ ] `Esc` while the filter input is focused clears the filter text and returns focus to the list
- [ ] The screen header shows "Teams (N)" where N is the `X-Total-Count` from the API response (or `total` from the hook)
- [ ] Cursor-based pagination loads the next page when the scrollbox scroll position reaches 80% of content height
- [ ] "Loading more…" is shown at the bottom of the scrollbox while the next page is being fetched
- [ ] When all pages are loaded, no pagination indicator is shown
- [ ] `c` pushes the team creation form screen (only for organization owners)
- [ ] `c` is a no-op for non-owner organization members
- [ ] The status bar shows `c:create` hint only when the authenticated user is an organization owner
- [ ] The breadcrumb trail reads "org-name > Teams"
- [ ] Empty state for owners: "No teams yet. Press `c` to create your first team." centered in muted color
- [ ] Empty state for members: "No teams yet. Ask an organization owner to create teams." centered in muted color
- [ ] A loading spinner with "Loading teams…" is shown while the initial data fetch is in progress
- [ ] API errors display an inline error message with "Press `R` to retry" hint
- [ ] Auth errors (401) propagate to the app-shell-level auth error screen
- [ ] Rate limit errors (429) display the retry-after period inline
- [ ] 403 errors display "You don't have permission to view teams in this organization."
- [ ] `q` pops the Teams screen and returns to the organization overview

### Keyboard Interactions

- [ ] `j` / `Down`: Move focus to next team row
- [ ] `k` / `Up`: Move focus to previous team row
- [ ] `Enter`: Open the focused team (push team detail screen)
- [ ] `/`: Focus the filter input
- [ ] `Esc`: Clear filter input and return focus to list (if filter is focused); pop screen if no filter active
- [ ] `G`: Jump to the last visible/loaded team row
- [ ] `g g`: Jump to the first team row
- [ ] `Ctrl+D`: Page down within the scrollbox
- [ ] `Ctrl+U`: Page up within the scrollbox
- [ ] `c`: Create new team (owner-only, pushes creation form)
- [ ] `R`: Retry the last failed API request (only active in error state)
- [ ] `q`: Pop the Teams screen (back to org overview)
- [ ] `?`: Toggle help overlay showing all keybindings for this screen
- [ ] `:`: Open command palette

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Description and timestamp columns hidden. Each row shows: name (up to 50 chars, truncated with `…`) │ permission badge
- [ ] 120×40 – 199×59 (standard): Full layout with name (30ch) + permission badge + description (40ch) + created (15ch relative timestamp)
- [ ] 200×60+ (large): Expanded name (40ch), permission badge, description (60ch), member count (10ch), created (20ch relative timestamp)

### Truncation and Boundary Constraints

- [ ] Team `name`: truncated with trailing `…` when exceeding column width (50/30/40 chars at min/standard/large). Max 255 characters from API
- [ ] Team `description`: truncated with trailing `…`. Max display: 40 chars (standard), 60 chars (large). Hidden at minimum. No enforced API max
- [ ] Permission badge: exactly one of `read`, `write`, `admin` — never exceeds 5 characters. Rendered with semantic color
- [ ] Relative timestamp: format "3d ago", "2mo ago", etc. Max 15ch (standard), 20ch (large). Hidden at minimum
- [ ] Member count at large: format "(N)" where N is the member count. Max 10ch. Hidden at standard and minimum
- [ ] Filter input: max 100 characters
- [ ] Maximum loaded teams in memory: 500 items (pagination cap)
- [ ] Total count display in header: formatted as integer, no thousands separator

### Edge Cases

- [ ] Terminal resize while scrolled: scroll position preserved relative to focused item
- [ ] Rapid `j` presses: processed sequentially, no debouncing
- [ ] Filter during pagination: client-side filter applied to all loaded items; new pages filtered as they arrive
- [ ] SSE disconnect: teams list unaffected (uses REST, not SSE)
- [ ] Unicode in team names and descriptions: truncation respects grapheme clusters
- [ ] Team with empty description: row shows name and permission badge only, no empty gap
- [ ] Single team in organization: list renders with one row, no pagination controls
- [ ] Organization with zero teams: empty state rendered immediately (not after spinner) when API returns empty result set
- [ ] User's org role changes between page loads: stale role tolerated until next full refresh
- [ ] `c` pressed during loading state: no-op (team creation requires loaded state to confirm owner role)
- [ ] `Enter` pressed during loading state: no-op
- [ ] Team names with special characters (hyphens, underscores, dots, Unicode): display correctly in list and breadcrumb
- [ ] Team deleted by another user between list load and detail navigation: team detail screen shows 404 error
- [ ] Concurrent navigation: rapid `Enter` presses do not push duplicate screens onto the stack

## Design

### Layout Structure

The teams view is a full-screen content area within the app shell (header bar, content, status bar):

```
┌─────────────────────────────────────────────────┐
│ Header: org-name > Teams     │ ● connected │ 🔔3│
├─────────────────────────────────────────────────┤
│  Teams (12)                         / filter    │
├─────────────────────────────────────────────────┤
│  ▶ backend         read    Backend engineering… │
│    frontend        write   Frontend and UI team │
│    platform-admin  admin   Full platform access │
│    design          read    Design and UX team   │
│    ...                                          │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ j/k:nav  Enter:open  /:filter  c:create  q:back│
└─────────────────────────────────────────────────┘
```

Component tree:

```
<box flexDirection="column" width="100%" height="100%">
  {/* Screen header */}
  <box flexDirection="row" height={1}>
    <text bold color="primary">Teams</text>
    <text color="muted"> ({totalCount})</text>
    <box flexGrow={1} />
    <text color="muted">/ filter</text>
  </box>

  {/* Filter input — shown only when active */}
  {filterActive && (
    <box height={1}>
      <input value={filterText} onChange={setFilterText} placeholder="Filter teams…" />
    </box>
  )}

  {/* Team list */}
  <scrollbox flexGrow={1}>
    <box flexDirection="column">
      {filteredTeams.map(team => (
        <box key={team.id} flexDirection="row" height={1}
             backgroundColor={team.id === focusedId ? "primary" : undefined}>
          <box width={nameColumnWidth}>
            <text bold={team.id === focusedId}>{truncate(team.name, nameColumnWidth)}</text>
          </box>
          <box width={badgeWidth}>
            <text color={permissionColor(team.permission)}>{team.permission}</text>
          </box>
          {showDescription && (
            <box width={descColumnWidth}>
              <text color="muted">{truncate(team.description, descColumnWidth)}</text>
            </box>
          )}
          {showMemberCount && (
            <box width={memberCountWidth}>
              <text color="muted">({team.memberCount})</text>
            </box>
          )}
          {showCreated && (
            <box width={createdColumnWidth}>
              <text color="muted">{relativeTime(team.createdAt)}</text>
            </box>
          )}
        </box>
      ))}
      {loadingMore && <box height={1}><text color="muted">Loading more…</text></box>}
    </box>
  </scrollbox>
</box>
```

### Loading State

Braille spinner cycling through `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms intervals with "Loading teams…" text in muted color, centered in the content area.

### Empty State

Centered muted text, role-dependent:
- **Owner**: "No teams yet. Press `c` to create your first team."
- **Member**: "No teams yet. Ask an organization owner to create teams."

### Error State

Error message in `error` color with "Press R to retry" hint in `muted` color, centered in the content area. Specific error messages:
- Network error: "Failed to load teams. Press R to retry."
- 403: "You don't have permission to view teams in this organization."
- 404 (org not found): "Organization not found."
- 429: "Rate limited. Retry in {Retry-After}s."
- 500: "Server error. Press R to retry."

### Permission Badge Colors

| Permission | Color Token | ANSI | Display Text |
|------------|-------------|------|--------------|
| `read` | `success` | Green (34) | `read` |
| `write` | `warning` | Yellow (178) | `write` |
| `admin` | `error` | Red (196) | `admin` |

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Move focus down | List focused, not in filter input |
| `k` / `Up` | Move focus up | List focused, not in filter input |
| `Enter` | Open focused team | Team row focused, data loaded |
| `/` | Activate filter input | List focused |
| `Esc` | Clear filter / return to list | Filter input focused |
| `Esc` | Pop screen (back) | No filter active, no overlay open |
| `G` | Jump to last loaded row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` | Page down | List focused |
| `Ctrl+U` | Page up | List focused |
| `c` | Create new team | Data loaded, user is org owner |
| `R` | Retry failed fetch | Error state displayed |
| `q` | Pop screen (back to org overview) | Always |
| `?` | Toggle help overlay | Always |
| `:` | Open command palette | Always |

### Responsive Column Layout

**80×24 (minimum)**: `│ name (50ch) │ read │` — 2 columns visible

**120×40 (standard)**: `│ name (30ch) │ read │ description (40ch) │ 3d ago │` — 4 columns visible

**200×60 (large)**: `│ name (40ch) │ read │ description (60ch) │ (5) │ 3 days ago │` — 5 columns visible

### Resize Behavior

- `useTerminalDimensions()` provides current terminal size
- `useOnResize()` triggers synchronous re-layout on terminal resize events
- Column widths recalculate based on new breakpoint classification
- Focused row remains visible after resize
- Filter input, if active, persists across resize and renders at full available width
- No animation or transition during resize

### Data Hooks

- `useOrgTeams(orgName, page?, perPage?)` from `@codeplane/ui-core` — returns `{ teams: Team[], total: number, isLoading: boolean, error: Error | null, refetch: () => void }`. Calls `GET /api/orgs/:org/teams` with page-based pagination, default page size 30
- `useOrgRole(orgName)` from `@codeplane/ui-core` — returns `{ role: "owner" | "member" | null, isLoading: boolean }`. Used to determine if `c` keybinding and create hint should be active
- `useTerminalDimensions()` — for responsive column layout breakpoints
- `useOnResize()` — trigger synchronous re-layout
- `useKeyboard()` — keybinding registration
- `useNavigation()` — push/pop screens in the navigation stack

The `Team` type: `{ id: number; name: string; description: string; permission: "read" | "write" | "admin"; createdAt: string; memberCount?: number; }`

### Navigation Context

When `Enter` is pressed on a focused team, calls `push("org-team-detail", { org: orgName, team: focusedTeam.name })` to push the team detail screen. Breadcrumb updates to "org-name > Teams > team-name".

When `c` is pressed (owner only), calls `push("org-team-create", { org: orgName })` to push the team creation form. Breadcrumb updates to "org-name > Teams > New Team".

When `q` is pressed, calls `pop()` to return to the organization overview screen.

### Status Bar Hints

- **Owner**: `j/k:nav  Enter:open  /:filter  c:create  q:back`
- **Member**: `j/k:nav  Enter:open  /:filter  q:back`
- **Error state**: `R:retry  q:back`
- **Filter active**: `Esc:clear filter  Enter:open`
- **Loading state**: `q:back`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Org Member | Org Owner |
|--------|-----------|------------|-----------|
| View teams list | ❌ | ✅ | ✅ |
| Open team detail | ❌ | ✅ | ✅ |
| Create team (`c`) | ❌ | ❌ | ✅ |
| See `c:create` hint | ❌ | ❌ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/orgs/:org/teams` returns teams only for authenticated organization members (owner or member role)
- Non-members of the organization receive a 403 response, rendered as an inline error
- The `c` keybinding is functionally disabled (no-op) for non-owners — not just visually hidden
- The `useOrgRole()` hook determines the user's role in the organization to control keybinding availability and status bar hints

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- Authenticated users: standard platform rate limit (300 requests per minute) for `GET /api/orgs/:org/teams`
- If 429 is returned, the teams section displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period
- Pagination requests count against the same rate limit

### Input Sanitization

- Filter input is client-side only — never sent to the API
- Team names, descriptions, and permission values rendered as plain text via `<text>` components (no injection risk)
- Organization name from navigation context is URL-encoded when passed to API calls

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.org.teams.view` | Teams screen loads successfully (initial data fetch completes) | `org_name`, `total_count`, `viewer_role` (owner/member), `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms` |
| `tui.org.teams.open` | User presses Enter on a team row | `org_name`, `team_name`, `team_permission`, `position_in_list` (0-indexed), `was_filtered`, `filter_text_length` |
| `tui.org.teams.filter` | User activates filter (presses `/`) | `org_name`, `total_loaded_count` |
| `tui.org.teams.filter_submit` | User types in filter and matches narrow the list | `org_name`, `filter_text_length`, `matched_count`, `total_loaded_count` |
| `tui.org.teams.paginate` | Next page of teams is loaded | `org_name`, `page_number`, `items_loaded_total`, `total_count` |
| `tui.org.teams.create_initiated` | Owner presses `c` to create a new team | `org_name` |
| `tui.org.teams.error` | API request fails | `org_name`, `error_type` (network/auth/rate_limit/forbidden/server), `http_status` |
| `tui.org.teams.retry` | User presses `R` to retry after error | `org_name`, `error_type`, `retry_success` |
| `tui.org.teams.empty` | Empty state rendered (zero teams) | `org_name`, `viewer_role` |

### Success Indicators

- **Teams list load completion rate**: percentage of teams screen navigations where the list successfully loads (target: >98%)
- **Team open rate**: percentage of teams screen views where the user opens at least one team (target: >40%)
- **Filter adoption**: percentage of teams screen views where the user activates the filter (target: >10% for orgs with >5 teams)
- **Create team funnel entry**: percentage of owner sessions on the teams screen that press `c` to create (target: >5%)
- **Pagination depth**: average number of pages loaded per session
- **Error rate**: percentage of teams screen loads that result in error state (target: <2%)
- **Retry success rate**: percentage of retry attempts that succeed (target: >80%)
- **Time to first interaction**: time from teams screen render to first j/k/Enter keypress

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | Teams screen loaded | `org_name`, `total_count`, `items_in_first_page`, `load_time_ms` |
| `info` | Team opened from list | `org_name`, `team_name`, `position_in_list` |
| `info` | Team creation initiated | `org_name` |
| `info` | Pagination page loaded | `org_name`, `page_number`, `items_count`, `total_loaded` |
| `warn` | API error on teams fetch | `org_name`, `http_status`, `error_message` (no token) |
| `warn` | Rate limited on teams fetch | `org_name`, `retry_after_seconds` |
| `warn` | Forbidden (403) on teams fetch | `org_name` |
| `warn` | Filter returned zero results | `org_name`, `filter_text`, `total_loaded_count` |
| `debug` | Filter activated | `org_name`, `filter_text_length` |
| `debug` | Filter cleared | `org_name` |
| `debug` | Scroll position updated | `scroll_percent`, `focused_index`, `total_loaded` |
| `debug` | Pagination trigger reached | `scroll_percent`, `items_loaded`, `has_more` |
| `debug` | Org role resolved | `org_name`, `role` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press R to retry" |
| Network timeout on pagination | Data hook timeout (30s) | "Loading more…" replaced with inline error. Existing items remain visible. `R` retries |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline error: "Rate limited. Retry in Ns." `R` retries after waiting |
| Forbidden (403) | API returns 403 | Inline error: "You don't have permission to view teams in this organization." |
| Organization not found (404) | API returns 404 | Inline error: "Organization not found." |
| Server error (500) | API returns 5xx | Inline error with generic message. `R` retries |
| Terminal resize during initial load | `useOnResize` fires during fetch | Fetch continues. Renders at new size when data arrives |
| Terminal resize during scrolled list | `useOnResize` fires | Column widths recalculate. Focused row stays visible |
| SSE disconnect | Status bar shows disconnected | Teams list unaffected (uses REST, not SSE) |
| Empty response with non-zero total | items.length === 0 && total > 0 | Treated as end-of-pagination |
| Malformed API response | JSON parse error | Error state rendered with generic error message |
| React error boundary triggered | Error boundary catches | Error screen per app-shell error boundary |
| Concurrent team deletion | Team disappears from paginated results | Stale count tolerated; next refresh corrects |
| Navigation to deleted team | 404 on team detail fetch | Team detail screen shows "Team not found" |

### Failure Modes

- **Total fetch failure**: Error state shown in content area with retry option. Header and status bar remain stable
- **Partial pagination failure**: Existing loaded items remain visible. Only "Loading more…" area shows error. Existing navigation continues to work
- **Role detection failure**: If `useOrgRole()` fails, default to member role (hide create action). Log warning. No create capability until role resolves
- **Memory pressure**: 500-item pagination cap prevents unbounded memory growth

## Verification

### Test File: `e2e/tui/organizations.test.ts`

### Terminal Snapshot Tests (14 tests)

- **org-teams-initial-load**: Navigate to org → press `t` → snapshot matches golden file showing "Teams (N)" header, list rows with team names, permission badges, and descriptions. Focused row highlighted
- **org-teams-empty-state-owner**: Navigate to org with zero teams as owner → snapshot shows centered "No teams yet. Press `c` to create your first team." in muted color
- **org-teams-empty-state-member**: Navigate to org with zero teams as member → snapshot shows centered "No teams yet. Ask an organization owner to create teams." in muted color
- **org-teams-loading-state**: Navigate to org with slow API → press `t` → snapshot shows "Loading teams…" centered with braille spinner
- **org-teams-error-state**: Navigate to org with failing API → press `t` → snapshot shows error message in red with "Press R to retry"
- **org-teams-focused-row**: Navigate to teams list → first team row highlighted with primary color
- **org-teams-permission-badges**: Navigate to teams list with teams of varying permissions → `read` shows green, `write` shows yellow, `admin` shows red
- **org-teams-filter-active**: Navigate to teams, press `/` → filter input appears with placeholder "Filter teams…"
- **org-teams-filter-results**: Navigate to teams, press `/`, type "backend" → list shows only matching teams
- **org-teams-filter-no-results**: Navigate to teams, press `/`, type "zzzznonexistent" → "No matching teams" shown
- **org-teams-pagination-loading**: Scroll to bottom of teams list with more pages → "Loading more…" visible
- **org-teams-header-total-count**: Navigate to teams → header shows "Teams (N)" with correct count
- **org-teams-status-bar-owner**: Navigate to teams as owner → status bar shows `j/k:nav  Enter:open  /:filter  c:create  q:back`
- **org-teams-status-bar-member**: Navigate to teams as member → status bar shows `j/k:nav  Enter:open  /:filter  q:back` (no `c:create`)

### Keyboard Interaction Tests (27 tests)

- **org-teams-j-moves-down**: Navigate to teams, press `j` → focus moves from first to second team row
- **org-teams-k-moves-up**: Navigate to teams, press `j` then `k` → focus returns to first team row
- **org-teams-k-at-top-no-wrap**: Navigate to teams, press `k` on first row → focus stays (no wrap-around)
- **org-teams-j-at-bottom-no-wrap**: Navigate to last team row, press `j` → focus stays (triggers pagination if more)
- **org-teams-down-arrow-moves-down**: Navigate to teams, press Down → same as `j`
- **org-teams-up-arrow-moves-up**: Navigate to teams, press Down then Up → same as `k`
- **org-teams-enter-opens-team**: Navigate to teams, press Enter → team detail pushed, breadcrumb shows "org-name > Teams > team-name"
- **org-teams-enter-on-second-item**: Navigate to teams, press `j` then Enter → second team's detail pushed
- **org-teams-slash-activates-filter**: Navigate to teams, press `/` → filter input focused
- **org-teams-filter-narrows-list**: Navigate to teams, press `/`, type "backend" → only matching teams shown
- **org-teams-filter-case-insensitive**: Navigate to teams, press `/`, type "BACKEND" → case-insensitive match
- **org-teams-filter-by-description**: Navigate to teams, press `/`, type "engineering" → matches teams by description
- **org-teams-esc-clears-filter**: Navigate to teams, press `/`, type "test", Esc → filter cleared, full list shown
- **org-teams-G-jumps-to-bottom**: Navigate to teams, press `G` → focus on last loaded row
- **org-teams-gg-jumps-to-top**: Navigate to teams, press `G` then `g g` → focus on first row
- **org-teams-ctrl-d-page-down**: Navigate to teams, press `Ctrl+D` → focus moves down by half visible height
- **org-teams-ctrl-u-page-up**: Navigate to teams, press `Ctrl+D` then `Ctrl+U` → focus returns
- **org-teams-c-creates-team-owner**: Navigate to teams as owner, press `c` → team creation form pushed, breadcrumb shows "org-name > Teams > New Team"
- **org-teams-c-no-op-member**: Navigate to teams as member, press `c` → nothing happens, no screen pushed
- **org-teams-R-retries-on-error**: Teams error state, press `R` → fetch retried
- **org-teams-R-no-op-when-loaded**: Navigate to teams, press `R` when loaded → no effect
- **org-teams-q-pops-screen**: Navigate to teams, press `q` → returns to org overview
- **org-teams-j-in-filter-input**: Navigate to teams, press `/` then `j` → 'j' typed in filter, NOT list navigation
- **org-teams-q-in-filter-input**: Navigate to teams, press `/` then `q` → 'q' typed in filter, NOT quit
- **org-teams-pagination-on-scroll**: Scroll to 80% of teams list → next page loaded
- **org-teams-rapid-j-presses**: Navigate to teams, send `j` 10 times → focus moves 10 rows sequentially
- **org-teams-enter-during-loading**: Navigate to teams during initial load, press Enter → no-op

### Responsive Tests (12 tests)

- **org-teams-80x24-layout**: Terminal 80×24 → name + permission badge only. No description, timestamp, or member count
- **org-teams-80x24-truncation**: Terminal 80×24, long team name → truncated with `…`
- **org-teams-120x40-layout**: Terminal 120×40 → name + permission badge + description + relative timestamp all visible
- **org-teams-120x40-description-truncation**: Terminal 120×40, long description → truncated with `…`
- **org-teams-200x60-layout**: Terminal 200×60 → expanded columns plus member count column visible
- **org-teams-200x60-member-count**: Terminal 200×60 → member count column shows "(N)" for each team
- **org-teams-resize-standard-to-min**: Resize 120×40 → 80×24 → description and timestamp columns collapse immediately
- **org-teams-resize-min-to-standard**: Resize 80×24 → 120×40 → description and timestamp columns appear
- **org-teams-resize-preserves-focus**: Resize at any breakpoint → focused row preserved
- **org-teams-resize-during-filter**: Resize with filter active → filter stays, results re-rendered at new layout
- **org-teams-filter-input-80x24**: Terminal 80×24, navigate to teams, press `/` → filter renders at full width
- **org-teams-resize-during-loading**: Resize while loading → spinner stays centered, layout updates on data arrival

### Integration Tests (15 tests)

- **org-teams-auth-expiry**: 401 on teams fetch → app-shell auth error screen, not inline error
- **org-teams-rate-limit-429**: 429 with Retry-After: 30 → "Rate limited. Retry in 30s."
- **org-teams-forbidden-403**: 403 on teams fetch → "You don't have permission to view teams in this organization."
- **org-teams-org-not-found-404**: 404 on teams fetch → "Organization not found."
- **org-teams-network-error**: Network timeout → inline error with "Press R to retry"
- **org-teams-server-error-500**: 500 on fetch → inline error with "Press R to retry"
- **org-teams-pagination-complete**: 45 teams (page size 30) → both pages load, all 45 visible
- **org-teams-500-items-cap**: 600 teams → only 500 loaded, "Showing first 500 of 600"
- **org-teams-enter-then-q-returns**: Enter on team, then q → teams list with scroll/focus preserved
- **org-teams-create-then-q-returns**: Owner presses `c`, then q on create form → teams list with scroll/focus preserved
- **org-teams-breadcrumb-correct**: Navigate to teams → breadcrumb shows "org-name > Teams"
- **org-teams-team-names-special-chars**: Teams with hyphens, underscores, dots, Unicode → display correctly in list
- **org-teams-empty-description-no-gap**: Team with empty description → row renders without description gap
- **org-teams-unicode-description**: Team with Unicode description (emoji, CJK) → renders correctly, truncation respects grapheme clusters
- **org-teams-concurrent-load-independence**: Teams screen loads independently; failure does not affect org overview state

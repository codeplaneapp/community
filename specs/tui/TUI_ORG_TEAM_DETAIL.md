# TUI_ORG_TEAM_DETAIL

Specification for TUI_ORG_TEAM_DETAIL.

## High-Level User POV

The team detail screen is the primary inspection and management surface for a single team within an organization in the Codeplane TUI. A user arrives here by pressing `Enter` on a team row in the organization's teams list (TUI_ORG_TEAMS_VIEW), which pushes the team detail screen onto the navigation stack and updates the breadcrumb to "Dashboard > org-name > Teams > team-name".

The screen is divided into two visual areas: a header section at the top displaying the team's metadata, and a tabbed content area below it showing either the team's members or its repositories.

The header section shows the team name in bold as the primary heading, followed by a permission badge — color-coded green for `read`, yellow for `write`, red for `admin` — indicating the team's default repository access level. Below the name and badge, the team description is rendered as word-wrapped plain text. If the team has no description, a muted placeholder "No description provided." appears instead. The footer of the header section shows two timestamps in relative format: "Created 3 months ago" and "Updated 2 days ago", both in muted color.

Below the header, two tabs are available: "Members (N)" and "Repositories (N)", where N is the count from the respective `X-Total-Count` headers. The user switches between tabs using `Tab` / `Shift+Tab` or by pressing `1` for Members and `2` for Repositories. The active tab is underlined in the `primary` color.

The Members tab shows a scrollable list of team members. Each row displays the member's username in the primary text color and their display name in muted color to the right. The focused row is highlighted with the `primary` accent background. The user navigates with `j`/`k` and can press `Enter` on a member to navigate to that user's profile. If the authenticated user is an organization owner, pressing `a` opens a member-add overlay (a fuzzy search of org members not already on the team), and pressing `x` on a focused member row prompts a confirmation to remove that member from the team. The Members tab paginates at 80% scroll depth, showing "Loading more…" during fetches.

The Repositories tab shows a scrollable list of repositories assigned to the team. Each row displays the repository name, a visibility badge (`public` in green or `private` in red), and a truncated description. The user navigates with `j`/`k` and can press `Enter` to open the repository overview screen. Organization owners can press `a` to add a repository (fuzzy search of org repos not already assigned) and `x` to remove the focused repository from the team (with confirmation). Pagination follows the same 80% scroll depth pattern.

Organization owners see additional action keybindings in the status bar: `e` to edit the team (push an edit form screen), `D` to delete the team (with a confirmation modal), `a` to add a member or repository (context-dependent on the active tab), and `x` to remove the focused item. Regular organization members see the team detail as read-only — the `e`, `D`, `a`, and `x` keybindings are not registered and do not appear in the status bar.

At minimum terminal size (80×24), the description in the header is truncated to 2 lines, display names in member rows are hidden, and repository descriptions are hidden. At standard size (120×40), all metadata is visible with comfortable column widths. At large sizes (200×60+), the description area expands, and repository descriptions get wider columns.

## Acceptance Criteria

### Definition of Done

- The team detail screen is pushed onto the navigation stack when `Enter` is pressed on a team in the teams list
- Breadcrumb updates to "Dashboard > org-name > Teams > team-name"
- The header section displays: team name (bold), permission badge (color-coded), description (word-wrapped or placeholder), created/updated timestamps (relative format, muted color)
- Two tabs are rendered below the header: "Members (N)" and "Repositories (N)" with counts from `X-Total-Count`
- `Tab` / `Shift+Tab` or `1` / `2` switch between tabs
- Active tab is indicated with `primary` color underline
- Members tab: paginated list of team members with username and display name
- Repositories tab: paginated list of team repositories with name, visibility badge, and description
- `j`/`k` (and arrow keys) navigate within the active tab's list
- `Enter` on a member navigates to user profile; `Enter` on a repository navigates to repository overview
- Organization owners see edit (`e`), delete (`D`), add (`a`), and remove (`x`) keybindings
- Organization members see a read-only view with no mutation keybindings
- `q` / `Esc` pops the screen back to the teams list
- `?` opens the help overlay
- Team data fetched via `useTeam()`, members via `useTeamMembers()`, repos via `useTeamRepos()` from `@codeplane/ui-core`
- Loading state shows braille spinner with "Loading team…" centered
- Error state shows error message in red with "Press `R` to retry"
- 401 errors propagate to app-shell auth error screen
- 403 errors show "You do not have permission to view this team."
- 404 errors show "Team not found."

### Keyboard Interactions

- `j` / `Down`: Move focus to next row in active tab list
- `k` / `Up`: Move focus to previous row in active tab list
- `Enter`: Open focused item (member → user profile, repo → repo overview)
- `Tab` / `Shift+Tab`: Switch between Members and Repositories tabs
- `1`: Jump to Members tab
- `2`: Jump to Repositories tab
- `G`: Jump to last loaded row in active tab
- `g g`: Jump to first row in active tab
- `Ctrl+D`: Page down within active tab scrollbox
- `Ctrl+U`: Page up within active tab scrollbox
- `/`: Focus filter input within active tab
- `Esc`: Clear filter / close modal / pop screen (context-dependent)
- `q`: Pop screen (return to teams list)
- `e`: Edit team (owner only)
- `D`: Delete team with confirmation (owner only)
- `a`: Add member or repo via fuzzy search overlay (owner only, tab-dependent)
- `x`: Remove focused member or repo with confirmation (owner only)
- `R`: Retry failed API request (error state only)
- `?`: Toggle help overlay

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router
- 80×24 – 119×39 (minimum): Header description truncated to 2 lines. Members tab: username only. Repos tab: name + visibility badge only
- 120×40 – 199×59 (standard): Full header. Members: username (25ch) + display_name (30ch). Repos: name (30ch) + visibility (8ch) + description (40ch)
- 200×60+ (large): Expanded header. Members: username (30ch) + display_name (40ch). Repos: name (40ch) + visibility (8ch) + description (60ch) + updated (20ch)

### Truncation and Boundary Constraints

- Team `name`: max 255 chars from API; truncated with `…` if wider than content area
- Team `description`: word-wrapped, capped at 2/4/6 lines at min/standard/large; overflow with trailing `…`
- Permission badge: max 5 characters (read/write/admin)
- Member `username`: max 39 chars; truncated at column width
- Member `display_name`: max 255 chars; truncated at column width; hidden at minimum
- Repository `name`: max 255 chars; truncated at column width
- Repository `description`: max 2048 chars; truncated at column width; hidden at minimum
- Tab label counts: rendered as "(9999+)" if exceeding 9999
- Filter input: max 100 characters
- Maximum loaded items per tab: 500 (pagination cap)

### Edge Cases

- Terminal resize while scrolled: scroll position preserved relative to focused item
- Rapid `j` presses: processed sequentially, no debouncing
- Filter during pagination: client-side filter applied to all loaded items
- SSE disconnect: team detail unaffected (uses REST)
- Unicode in descriptions/usernames: truncation respects grapheme clusters
- Team with zero members: "No members yet." centered
- Team with zero repos: "No repositories assigned." centered
- Owner-only keys are no-ops for non-owners
- Optimistic remove reverted on server error
- Tab count updates optimistically on mutation
- Switching tabs preserves per-tab scroll position and focus

## Design

### Layout Structure

The team detail screen occupies the full content area between the global header and status bars. It uses vertical flexbox with a fixed-height header section, a tab bar, and a flexible-height tab content area.

The header contains: team name (bold) + permission badge (color-coded) on one row, word-wrapped description below, and created/updated timestamps in muted color at the bottom.

The tab bar shows "Members (N) │ Repositories (N)" with the active tab in `primary` color with underline.

The tab content area uses a `<scrollbox>` containing list rows. Each row is a horizontal `<box>` with columns appropriate to the active tab and terminal breakpoint.

### OpenTUI Components Used

- `<box>` — layout containers for header, tab bar, list rows, modals
- `<scrollbox>` — scrollable member and repository lists within tabs
- `<text>` — all text rendering (team name, badges, descriptions, timestamps, usernames)
- `<input>` — filter input and fuzzy search input in add overlay

### Permission Badge Colors

| Permission | Color Token | ANSI |
|------------|-------------|------|
| `read` | `success` | Green (34) |
| `write` | `warning` | Yellow (178) |
| `admin` | `error` | Red (196) |

### Visibility Badge Colors

| Visibility | Color Token | ANSI |
|------------|-------------|------|
| `public` | `success` | Green (34) |
| `private` | `error` | Red (196) |

### Modals

- Delete team confirmation: centered modal at 60% width (90% at minimum), `error`-colored border, Enter to confirm / Esc to cancel
- Remove member/repo confirmation: centered modal at 60% width (90% at minimum), `warning`-colored border
- Add member/repo overlay: centered modal at 60% width / 50% height, contains search input + scrollable results list with `j`/`k` navigation and `Enter` to select

### Responsive Column Layout

**80×24 (minimum)**:
- Members: `│ username (50ch) │`
- Repos: `│ name (50ch) │ public │`

**120×40 (standard)**:
- Members: `│ username (25ch) │ display_name (30ch) │`
- Repos: `│ name (30ch) │ public │ description (40ch) │`

**200×60 (large)**:
- Members: `│ username (30ch) │ display_name (40ch) │`
- Repos: `│ name (40ch) │ public │ description (60ch) │ updated (20ch) │`

### Data Hooks

- `useTeam(org, team)` — team detail object
- `useTeamMembers(org, team)` — paginated member list with `loadMore()`, cursor-based, page size 30
- `useTeamRepos(org, team)` — paginated repo list with `loadMore()`, cursor-based, page size 30
- `useOrgRole(org)` — viewer's role for conditional keybinding registration
- `useAddTeamMember(org, team)` — mutation hook for adding members
- `useRemoveTeamMember(org, team)` — mutation hook for removing members
- `useAddTeamRepo(org, team)` — mutation hook for adding repos
- `useRemoveTeamRepo(org, team)` — mutation hook for removing repos
- `useDeleteTeam(org, team)` — mutation hook for deleting the team
- `useOrgMembers(org)` — for add-member overlay search
- `useOrgRepos(org)` — for add-repo overlay search
- `useTerminalDimensions()` — responsive breakpoints
- `useOnResize()` — synchronous re-layout
- `useKeyboard()` — keybinding registration

### Navigation Context

- Pushed from teams list: `push("org-team-detail", { org, team })`
- Breadcrumb: "Dashboard > org-name > Teams > team-name"
- Enter on member: `push("user-profile", { username })`
- Enter on repo: `push("repo-overview", { owner: org, repo: repo.name })`
- Edit: `push("org-team-edit", { org, team })`
- Back/delete: `pop()`

### Loading, Empty, Error States

- Loading: braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms with "Loading team…" centered
- Empty members: "No members yet." (member) / "No members yet. Press `a` to add members." (owner)
- Empty repos: "No repositories assigned." (member) / "No repositories assigned. Press `a` to add repositories." (owner)
- Error: red error message + "Press R to retry" in muted color
- Tab-scoped errors: one tab can fail independently while the other remains functional

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (non-member) | Org Member | Org Owner |
|--------|-----------|---------------------------|------------|----------|
| View team detail | ❌ | ❌ (403) | ✅ | ✅ |
| View team members | ❌ | ❌ (403) | ✅ | ✅ |
| View team repos | ❌ | ❌ (403) | ✅ | ✅ |
| Edit team | ❌ | ❌ | ❌ | ✅ |
| Delete team | ❌ | ❌ | ❌ | ✅ |
| Add team member | ❌ | ❌ | ❌ | ✅ |
| Remove team member | ❌ | ❌ | ❌ | ✅ |
| Add team repo | ❌ | ❌ | ❌ | ✅ |
| Remove team repo | ❌ | ❌ | ❌ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- Organization membership (owner or member) is required to view team details, members, and repositories
- Only organization owners can perform mutations (edit, delete, add/remove members, add/remove repos)
- The `useOrgRole()` hook determines the user's role and conditionally enables owner-only keybindings
- Owner-only keybindings (`e`, `D`, `a`, `x`) are not registered for non-owners — they do not appear in the status bar or help overlay

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen
- 403 responses show inline error: "You do not have permission to view this team."

### Rate Limiting

- Authenticated users: 300 requests per minute per endpoint
- 429 responses display "Rate limited. Retry in {Retry-After}s." inline in the affected section
- No auto-retry on rate limit; user presses `R` after the retry-after period
- Mutations share the same rate limit pool

### Input Sanitization

- Filter input is client-side only — never sent to the API
- Fuzzy search queries in add overlays are sent to list endpoints as query parameters — validated server-side
- All text rendered via `<text>` components (no injection risk)
- Confirmation modal inputs are binary (Enter/Esc) — no free-text input in confirmation flows

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.org.team.detail.view` | Team detail screen loaded | `org_name`, `team_name`, `team_permission`, `members_count`, `repos_count`, `terminal_width`, `terminal_height`, `breakpoint`, `viewer_role`, `load_time_ms` |
| `tui.org.team.detail.tab_switch` | User switches tabs | `org_name`, `team_name`, `from_tab`, `to_tab` |
| `tui.org.team.detail.member_open` | Enter on member row | `org_name`, `team_name`, `member_username`, `position_in_list` |
| `tui.org.team.detail.repo_open` | Enter on repo row | `org_name`, `team_name`, `repo_name`, `position_in_list` |
| `tui.org.team.detail.member_add` | Owner adds a member | `org_name`, `team_name`, `added_username`, `success` |
| `tui.org.team.detail.member_remove` | Owner removes a member | `org_name`, `team_name`, `removed_username`, `success` |
| `tui.org.team.detail.repo_add` | Owner adds a repo | `org_name`, `team_name`, `added_repo`, `success` |
| `tui.org.team.detail.repo_remove` | Owner removes a repo | `org_name`, `team_name`, `removed_repo`, `success` |
| `tui.org.team.detail.delete` | Owner deletes the team | `org_name`, `team_name`, `members_count`, `repos_count`, `success` |
| `tui.org.team.detail.edit` | Owner initiates edit | `org_name`, `team_name` |
| `tui.org.team.detail.filter` | Filter activated | `org_name`, `team_name`, `tab`, `total_loaded_count` |
| `tui.org.team.detail.paginate` | Next page loaded | `org_name`, `team_name`, `tab`, `page_number`, `items_loaded_total` |
| `tui.org.team.detail.error` | API request fails | `org_name`, `team_name`, `error_type`, `http_status`, `endpoint` |
| `tui.org.team.detail.retry` | User retries after error | `error_type`, `retry_success` |

### Success Indicators

- **Team detail load completion rate**: >98% of navigations successfully render
- **Tab engagement rate**: >40% of views include a tab switch
- **Member open rate**: >15% of views open a member profile
- **Repo open rate**: >25% of views open a repository
- **Owner action rate**: >10% of owner visits result in a mutation
- **Add member success rate**: >95% of add attempts succeed
- **Delete confirmation rate**: >50% of delete modal opens result in confirmation
- **Error rate**: <2% of loads result in error
- **Retry success rate**: >80% of retries succeed
- **Time to first interaction**: tracked from render to first keypress

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | Team detail loaded | `org_name`, `team_name`, `members_count`, `repos_count`, `load_time_ms` |
| `info` | Tab switched | `org_name`, `team_name`, `from_tab`, `to_tab` |
| `info` | Member opened | `org_name`, `team_name`, `member_username` |
| `info` | Repo opened | `org_name`, `team_name`, `repo_name` |
| `info` | Member added/removed | `org_name`, `team_name`, `username` |
| `info` | Repo added/removed | `org_name`, `team_name`, `repo_name` |
| `info` | Team deleted | `org_name`, `team_name` |
| `info` | Pagination page loaded | `tab`, `page_number`, `items_count`, `total_loaded` |
| `warn` | API error | `http_status`, `error_message`, `endpoint` |
| `warn` | Rate limited (429) | `retry_after_seconds`, `endpoint` |
| `warn` | Permission denied (403) | `org_name`, `team_name` |
| `warn` | Not found (404) | `org_name`, `team_name` |
| `warn` | Mutation failed | `action`, `http_status`, `error_message` |
| `warn` | Filter returned zero results | `tab`, `filter_text`, `total_loaded_count` |
| `debug` | Filter activated/cleared | `tab`, `filter_text_length` |
| `debug` | Scroll position updated | `tab`, `scroll_percent`, `focused_index` |
| `debug` | Confirmation modal opened/dismissed | `action`, `target_name` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on team fetch | Data hook timeout (30s) | Loading spinner → error + "Press R to retry" |
| Network timeout on tab pagination | Data hook timeout (30s) | "Loading more…" → inline error; existing items preserved |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Not org member (403) | API returns 403 | "You do not have permission to view this team." |
| Team not found (404) | API returns 404 | "Team not found." with "Press q to go back" |
| Rate limited (429) | API returns 429 | "Rate limited. Retry in Ns." |
| Server error (500) | API returns 5xx | Generic error + R to retry |
| Terminal resize during load/scroll/modal | `useOnResize` fires | Re-layout, preserve focus, re-center modal |
| SSE disconnect | Status bar indicator | Team detail unaffected (REST only) |
| Add member conflict (already on team) | API returns 409 | Overlay error: "User is already a team member." |
| Add repo conflict (already assigned) | API returns 409 | Overlay error: "Repository is already assigned." |
| Delete team fails | API error | Error in modal; modal stays open |
| Remove member/repo fails | API error | Optimistic removal reverted; inline error 5s |
| Concurrent team deletion | Next API → 404 | "Team not found." error state |
| React error boundary | Error boundary catches | App-shell error screen |

### Failure Modes

- **Total team fetch failure**: Full-screen error, no tabs rendered
- **Tab-scoped failure**: Only affected tab shows error; other tab loads independently
- **Partial pagination failure**: Existing items remain; only loading indicator shows error
- **Mutation failure**: Optimistic update reverted; screen remains functional
- **Memory pressure**: 500-item cap per tab prevents unbounded growth

## Verification

### Test File: `e2e/tui/organizations.test.ts`

### Terminal Snapshot Tests (18 tests)

- **org-team-detail-initial-load**: Navigate to team → snapshot shows header with team name bold, permission badge colored, description, timestamps, Members tab active with member list
- **org-team-detail-header-permission-read**: Team with `read` permission → green badge
- **org-team-detail-header-permission-write**: Team with `write` permission → yellow badge
- **org-team-detail-header-permission-admin**: Team with `admin` permission → red badge
- **org-team-detail-empty-description**: Empty description → "No description provided." muted
- **org-team-detail-loading-state**: Slow API → centered "Loading team…" with spinner
- **org-team-detail-error-state**: Failing API → red error + "Press R to retry"
- **org-team-detail-403-state**: Non-member → "You do not have permission to view this team."
- **org-team-detail-404-state**: Nonexistent team → "Team not found."
- **org-team-detail-members-tab-active**: Members tab highlighted with primary underline
- **org-team-detail-repos-tab-active**: Repos tab highlighted after switch
- **org-team-detail-members-empty**: Zero members → "No members yet."
- **org-team-detail-repos-empty**: Zero repos → "No repositories assigned."
- **org-team-detail-owner-empty-members**: Owner empty members → includes "Press `a` to add members."
- **org-team-detail-delete-confirmation-modal**: Owner `D` → modal with team name
- **org-team-detail-remove-member-confirmation**: Owner `x` on member → modal with username
- **org-team-detail-add-member-overlay**: Owner `a` on Members → fuzzy search overlay
- **org-team-detail-breadcrumb**: Breadcrumb shows full path

### Keyboard Interaction Tests (32 tests)

- **org-team-detail-j-moves-down-members**: `j` on Members → next member
- **org-team-detail-k-moves-up-members**: `j` then `k` → returns to first
- **org-team-detail-j-moves-down-repos**: `j` on Repos → next repo
- **org-team-detail-k-moves-up-repos**: `j` then `k` on Repos → returns
- **org-team-detail-k-at-top-no-wrap**: `k` on first → stays
- **org-team-detail-j-at-bottom-no-wrap**: `j` on last → stays (triggers pagination)
- **org-team-detail-enter-opens-member**: Enter on member → user profile pushed
- **org-team-detail-enter-opens-repo**: Enter on repo → repo overview pushed
- **org-team-detail-tab-switches-to-repos**: Tab → Repos active
- **org-team-detail-shift-tab-switches-to-members**: Shift+Tab → Members active
- **org-team-detail-1-jumps-to-members**: `1` → Members tab
- **org-team-detail-2-jumps-to-repos**: `2` → Repos tab
- **org-team-detail-G-jumps-to-bottom**: `G` → last row
- **org-team-detail-gg-jumps-to-top**: `G` then `g g` → first row
- **org-team-detail-ctrl-d-page-down**: Ctrl+D → page down
- **org-team-detail-ctrl-u-page-up**: Ctrl+D then Ctrl+U → returns
- **org-team-detail-slash-activates-filter**: `/` → filter input focused
- **org-team-detail-filter-narrows-members**: `/` + type → filtered members
- **org-team-detail-filter-narrows-repos**: `/` + type → filtered repos
- **org-team-detail-esc-clears-filter**: Esc → filter cleared
- **org-team-detail-q-pops-screen**: `q` → teams list
- **org-team-detail-esc-pops-when-no-modal**: Esc (no modal) → pops
- **org-team-detail-e-pushes-edit-owner**: Owner `e` → edit form
- **org-team-detail-e-noop-member**: Non-owner `e` → no effect
- **org-team-detail-D-opens-delete-modal-owner**: Owner `D` → modal
- **org-team-detail-D-noop-member**: Non-owner `D` → no effect
- **org-team-detail-a-opens-add-member-overlay**: Owner `a` on Members → overlay
- **org-team-detail-a-opens-add-repo-overlay**: Owner `a` on Repos → overlay
- **org-team-detail-a-noop-member**: Non-owner `a` → no effect
- **org-team-detail-x-opens-remove-confirmation-owner**: Owner `x` → confirm modal
- **org-team-detail-x-noop-member**: Non-owner `x` → no effect
- **org-team-detail-R-retries-on-error**: Error + `R` → retry
- **org-team-detail-rapid-j-presses**: 10× `j` → 10 rows moved

### Responsive Tests (12 tests)

- **org-team-detail-80x24-header**: 80×24 → description 2 lines
- **org-team-detail-80x24-members-layout**: 80×24 → username only
- **org-team-detail-80x24-repos-layout**: 80×24 → name + visibility only
- **org-team-detail-80x24-modal-width**: 80×24 → modal at 90% width
- **org-team-detail-120x40-members-layout**: 120×40 → username + display_name
- **org-team-detail-120x40-repos-layout**: 120×40 → name + visibility + description
- **org-team-detail-200x60-repos-layout**: 200×60 → name + visibility + description + updated
- **org-team-detail-resize-standard-to-min**: 120→80 → columns collapse
- **org-team-detail-resize-min-to-standard**: 80→120 → columns appear
- **org-team-detail-resize-preserves-focus**: Resize → focus preserved
- **org-team-detail-resize-preserves-tab**: Resize → active tab unchanged
- **org-team-detail-resize-during-modal**: Resize + modal → modal re-centers

### Integration Tests (20 tests)

- **org-team-detail-auth-expiry**: 401 → app-shell auth error
- **org-team-detail-forbidden-403**: 403 → inline permission error
- **org-team-detail-not-found-404**: 404 → "Team not found."
- **org-team-detail-rate-limit-429**: 429 → rate limit message
- **org-team-detail-network-error**: Timeout → error + retry
- **org-team-detail-server-error-500**: 500 → error + retry
- **org-team-detail-pagination-members**: 45 members → both pages load
- **org-team-detail-pagination-repos**: 45 repos → both pages load
- **org-team-detail-500-members-cap**: 600 members → 500 cap
- **org-team-detail-tab-switch-preserves-scroll**: Switch tabs → scroll preserved
- **org-team-detail-owner-add-member**: Add member → appears + count increments
- **org-team-detail-owner-remove-member**: Remove member → disappears + count decrements
- **org-team-detail-owner-add-repo**: Add repo → appears + count increments
- **org-team-detail-owner-remove-repo**: Remove repo → disappears + count decrements
- **org-team-detail-owner-delete-team**: Delete → pops to teams list
- **org-team-detail-delete-cancel**: Esc on delete modal → team still visible
- **org-team-detail-add-member-already-on-team**: Conflict → "User is already a team member."
- **org-team-detail-remove-member-revert-on-error**: Remove fails → member reappears
- **org-team-detail-q-returns-to-teams-list**: `q` → teams list
- **org-team-detail-enter-member-then-q-returns**: Enter member then `q` → back to team detail

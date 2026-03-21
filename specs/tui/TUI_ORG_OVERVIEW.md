# TUI_ORG_OVERVIEW

Specification for TUI_ORG_OVERVIEW.

## High-Level User POV

The Organization Overview screen is the detailed profile view for a single organization in the Codeplane TUI. It is the screen you land on when you press `Enter` on an organization in the Organization List screen or Dashboard orgs section. It is the central hub for everything about a specific organization — its identity, its repositories, its people, and its teams — presented in a navigable, keyboard-driven terminal layout.

When the screen loads, you see the organization's name displayed prominently at the top in bold primary color, alongside a color-coded visibility badge — green for `public`, yellow for `limited`, red for `private`. Below the name is a metadata section showing the organization's description (word-wrapped across multiple lines if needed), website (rendered as a URL string), geographic location, and relative timestamps for when the organization was created and last updated. If any of these fields are empty, that line is simply omitted — there are no "N/A" placeholders or blank gaps.

Below the metadata section is a tab bar with four tabs: **Repositories** (the default, active tab), **Members**, **Teams**, and **Settings**. The Settings tab is only visible if you are an organization owner. Each tab navigates to a sub-view within the overview screen without pushing a new screen onto the navigation stack — the tabs swap the content area below them. You cycle between tabs using `Tab`/`Shift+Tab` or jump directly to a tab by pressing `1` through `4`. The active tab is highlighted with the `primary` color and an underline indicator.

The **Repositories tab** shows a paginated list of the organization's repositories, sorted by most recently updated. Each row displays the repository name, a public/private indicator, a truncated description, and a relative "last updated" timestamp. You navigate the list with `j`/`k` and press `Enter` to push the repository overview screen onto the navigation stack. Organization members see all repositories (public and private); the API enforces this scoping.

The **Members tab** shows the organization's member roster. Each row displays the member's username, display name (if set), and their role — `owner` or `member`. Owners are highlighted with a distinct color badge. The list is paginated and navigable with the same vim-style keys.

The **Teams tab** shows the organization's teams. Each row displays the team name, a permission level badge (`read`, `write`, or `admin`), and a truncated description. Pressing `Enter` on a team pushes the team detail screen.

The **Settings tab** (owners only) is a navigation entry point — when activated, it pushes the organization settings screen onto the navigation stack.

At any time, pressing `q` or `Esc` (when no filter is active) pops back to the organization list. The breadcrumb in the header bar reads "Organizations > {org-name}", giving you clear context about where you are in the navigation stack. The status bar at the bottom shows context-sensitive keybinding hints that update as you switch tabs or enter filter mode.

Each tab's data loads lazily — switching to the Members tab triggers the members fetch only when that tab is first activated. This avoids unnecessary API calls for tabs the user never visits. A loading spinner is shown in the tab content area while data is being fetched, while the organization header and metadata remain immediately visible.

If the organization cannot be loaded — because of a network error, an expired auth token, or insufficient permissions — the screen shows a clear error message with a retry hint (`Press R to retry`). If you are not a member of a non-public organization, you see a 404 screen rather than a 403, consistent with the platform's information-leakage prevention policy. If the terminal is resized while you are on this screen, the layout adapts instantly: at minimum size (80×24), metadata collapses to essentials and list columns narrow; at standard size (120×40), the full layout renders with all columns; at large terminals (200×60+), columns expand to show more content per row.

## Acceptance Criteria

### Definition of Done

- [ ] The Organization Overview screen renders as a full-screen view between header and status bars
- [ ] The screen is reachable by pressing `Enter` on an organization in the Org List screen or Dashboard orgs section
- [ ] Organization profile data is fetched via `useOrg(orgName)` from `@codeplane/ui-core`, calling `GET /api/orgs/:org`
- [ ] The header section displays: organization name (bold, primary color), visibility badge (color-coded), description (word-wrapped), website, location, created timestamp (relative), updated timestamp (relative)
- [ ] Empty optional fields (description, website, location) are omitted entirely — no blank lines or placeholders
- [ ] Tab bar renders below the metadata section with tabs: Repositories, Members, Teams, and conditionally Settings
- [ ] The Settings tab is only visible when the authenticated user has the `owner` role in this organization
- [ ] The Repositories tab is the default active tab on screen mount
- [ ] Tab switching does not push a new screen — content area swaps inline (except Settings, which pushes org-settings screen)
- [ ] Each tab's data is lazy-loaded on first activation
- [ ] Pressing `q` pops the screen and returns to the previous screen
- [ ] Breadcrumb reads "Organizations > {org-name}"
- [ ] Non-members of non-public organizations see a 404 screen (not 403)
- [ ] Terminal resize produces correct re-layout with no visual artifacts
- [ ] All verification tests pass (tests that fail due to unimplemented backends are left failing, never skipped)

### Keyboard Interactions

- [ ] `Tab` / `Shift+Tab`: Cycle forward/backward through tabs
- [ ] `1`: Jump to Repositories tab
- [ ] `2`: Jump to Members tab
- [ ] `3`: Jump to Teams tab
- [ ] `4`: Jump to Settings tab (only if visible/owner)
- [ ] `j` / `Down`: Move focus to next row in active tab's list
- [ ] `k` / `Up`: Move focus to previous row in active tab's list
- [ ] `Enter`: Open focused item (repo overview, team detail, or settings screen)
- [ ] `/`: Focus search/filter input for the active tab's list
- [ ] `Esc`: Clear filter and return focus to list. If no filter active, behave as `q`
- [ ] `G`: Jump to last loaded row in active tab's list
- [ ] `g g`: Jump to first row in active tab's list
- [ ] `Ctrl+D`: Page down within active tab's scrollbox (half visible height)
- [ ] `Ctrl+U`: Page up within active tab's scrollbox (half visible height)
- [ ] `R`: Retry failed API request (only active in error state)
- [ ] `q`: Pop screen (back to previous)
- [ ] `?`: Toggle help overlay
- [ ] `:`: Open command palette

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Metadata compacted — name + badge on line 1, truncated single-line description on line 2; website, location, timestamps hidden. Tab content shows minimal columns (name + badge only). Tab bar shows abbreviated labels
- [ ] 120×40 – 199×59 (standard): Full metadata section with all fields. Tab content shows full columns. Tab bar shows full labels with underline indicator
- [ ] 200×60+ (large): Expanded metadata with wider description wrap. Tab content shows all columns with wider widths

### Truncation and Boundary Constraints

- [ ] Organization `name`: max 39 chars from API; displayed in full. Breadcrumb truncated from left if exceeds terminal width
- [ ] Organization `description`: word-wrapped up to 3 lines at standard/large; single line truncated with `…` at minimum. Max: 2048 chars
- [ ] Organization `website`: truncated with `…` at 50 chars. Hidden at minimum. Max: 255 chars
- [ ] Organization `location`: truncated with `…` at 30 chars. Hidden at minimum. Max: 255 chars
- [ ] Visibility badge: max 7 characters (`public`, `limited`, `private`)
- [ ] Repository name: truncated at column width (30/40/50ch by breakpoint)
- [ ] Repository description: truncated at 40/60ch, hidden at minimum
- [ ] Member username: truncated at column width (25/30/50ch). Max: 39 chars
- [ ] Member display_name: truncated at 30/40ch, hidden at minimum. Max: 255 chars
- [ ] Member role badge: max 6 chars (`owner`/`member`)
- [ ] Team name: truncated at 25/35/50ch
- [ ] Team description: truncated at 40/60ch, hidden at minimum. Max: 255 chars
- [ ] Team permission badge: max 5 chars (`read`/`write`/`admin`)
- [ ] Filter input per tab: max 100 characters
- [ ] Maximum loaded items per tab: 500 (pagination cap)
- [ ] Tab count labels: K-abbreviated above 999
- [ ] All truncation must be Unicode grapheme-aware

### Edge Cases

- [ ] Org with no description/website/location: metadata shows only name + badge + timestamps
- [ ] Very long description (2048 chars): wraps to max 3 lines with `…` at standard; single-line at minimum
- [ ] Zero repos/members/teams: each tab shows appropriate empty state
- [ ] Single item per tab: renders one row, no pagination
- [ ] Terminal resize while on non-default tab: tab state preserved
- [ ] Terminal resize below 80×24: "Terminal too small" overlay
- [ ] Resize during filter input: width adjusts, text/cursor preserved
- [ ] Rapid tab switching: data fetched once, cached for subsequent visits
- [ ] Per-tab scroll position preserved across tab switches
- [ ] Number key for non-existent tab: no-op
- [ ] SSE disconnect: unaffected (REST-only)
- [ ] Unicode content: rendered correctly, grapheme-aware truncation
- [ ] 403 for non-member of non-public org: shows 404 (conceals existence)
- [ ] 404 for nonexistent org: "Organization not found." with back navigation
- [ ] Rapid j/k: sequential processing, no dropped frames
- [ ] Tab switch during loading: independent fetches, cached results
- [ ] Enter during tab loading: no-op
- [ ] Auth expiry during viewing: next API call surfaces error
- [ ] Org deleted while viewing: 404 on next refresh

## Design

### Screen Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Organizations > Acme Corp              │ ● connected │ 🔔 3     │
├─────────────────────────────────────────────────────────────────┤
│  Acme Corp  public                                              │
│  Building the future of widget manufacturing                    │
│  🌐 https://acme.example.com  │  📍 San Francisco, CA          │
│  Created 3mo ago  │  Updated 2d ago                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 1:Repositories (12)  2:Members (5)  3:Teams (3)  4:Settings ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ► api-server        public   Core API server          2d    ││
│  │   internal-tools    private  Internal dev tools       5d    ││
│  │   web-app           public   Web application          1w    ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:open  Tab:next tab  /:filter  q:back  ?:help│
└─────────────────────────────────────────────────────────────────┘
```

### OpenTUI Components

The screen uses `<box>` with vertical flexbox layout. Metadata section uses `<text>` with `wrap="word"` for description. Tab bar uses a horizontal `<box>` with `<text>` elements styled with `bold`, `color`, and `underline` for the active tab. Tab content uses `<scrollbox>` wrapping a vertical `<box>` of list rows. Each row is a horizontal `<box>` with fixed-width `<box>` columns containing `<text>`. Filter uses `<input>` with placeholder and maxLength.

### Tab Configuration

| Tab | Key | Label (standard) | Label (minimum) | Hook | Endpoint |
|-----|-----|-------------------|-----------------|------|----------|
| Repositories | `1` | Repositories | Repos | `useOrgRepos(orgName)` | `GET /api/orgs/:org/repos` |
| Members | `2` | Members | Memb. | `useOrgMembers(orgName)` | `GET /api/orgs/:org/members` |
| Teams | `3` | Teams | Teams | `useOrgTeams(orgName)` | `GET /api/orgs/:org/teams` |
| Settings | `4` | Settings | Sett. | — | — |

### Color Tokens

Visibility badges: `public`→success/green(34), `limited`→warning/yellow(178), `private`→error/red(196). Permission badges: `read`→muted/gray(245), `write`→primary/blue(33), `admin`→warning/yellow(178). Role badges: `owner`→warning/yellow(178), `member`→muted/gray(245). Repo visibility: public→success/green(34), private→error/red(196).

### Keybindings

Global: `q` (pop), `Esc` (clear filter or pop), `?` (help), `:` (command palette), `R` (retry). Tab nav: `Tab`/`Shift+Tab` (cycle), `1-4` (jump). List nav: `j`/`k`/`Down`/`Up` (move), `Enter` (open), `G` (bottom), `g g` (top), `Ctrl+D`/`Ctrl+U` (page), `/` (filter).

### Responsive Column Layouts

**Repos** — 80×24: name(50)+vis(7)+updated(8). 120×40: name(30)+vis(7)+desc(40)+updated(8). 200×60: name(40)+vis(7)+desc(60)+updated(8).
**Members** — 80×24: username(50)+role(8). 120×40: username(25)+display_name(30)+role(8). 200×60: username(30)+display_name(40)+role(8).
**Teams** — 80×24: team(50)+perm(7). 120×40: team(25)+perm(7)+desc(40). 200×60: team(35)+perm(7)+desc(60).

### Data Hooks

`useOrg(orgName)` → `{ data: Organization, isLoading, error, retry }`. `useOrgRepos(orgName)` → `{ items, totalCount, isLoading, error, loadMore, hasMore, retry }`. `useOrgMembers(orgName)` → same shape. `useOrgTeams(orgName)` → same shape. `useUser()` → ownership check. `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()`, `useNavigation()`.

### Filter Behavior

Client-side substring match (case-insensitive). Repos: name+description. Members: username+display_name. Teams: name+description. Max 100 chars. `Esc` clears. Keys typed in filter are NOT interpreted as navigation.

### Loading/Empty/Error States

Loading: braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms. Tab-level loading shows in content area; metadata stays visible. Empty: per-tab muted centered messages. Errors: org-level errors are full-screen; tab-level errors are inline with R-to-retry.

## Permissions & Security

### Authorization Roles

| Role | Overview | Repos | Members | Teams | Settings |
|------|----------|-------|---------|-------|----------|
| Anonymous | ❌ (TUI requires auth) | — | — | — | — |
| Auth non-member (public org) | ✅ | Public only | ❌ (403) | ❌ (403) | ❌ |
| Auth non-member (non-public org) | ❌ (404) | — | — | — | — |
| Member | ✅ | All repos | ✅ | ✅ | ❌ |
| Owner | ✅ | All repos | ✅ | ✅ | ✅ |
| Platform Admin | ✅ (all orgs) | All repos | ✅ | ✅ | ✅ |

### Security Rules

1. TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen.
2. Non-public orgs return 404 (not 403) to non-members — conceals existence.
3. Settings tab only rendered for owners. API enforces owner role independently.
4. Members/Teams tabs always shown; API returns 403 for non-members of non-public orgs (rendered as inline error).
5. Token-based auth via CLI keychain or CODEPLANE_TOKEN. No interactive OAuth.
6. Token never displayed, never logged, never in error messages.
7. No PII exposure: member list shows only username, display_name, avatar_url, role.
8. Filter inputs are client-side only — never sent to API.

### Rate Limiting

- `GET /api/orgs/:org`: 5,000/hour
- `GET /api/orgs/:org/repos`: 300/minute
- `GET /api/orgs/:org/members`: 300/minute
- `GET /api/orgs/:org/teams`: 300/minute
- 429 → inline "Rate limited. Retry in {N}s." No auto-retry.
- Tab data cached after first load to minimize requests.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.org.overview.view` | Screen mounted, org loaded | org_id, org_name, org_visibility, viewer_role, terminal_width, terminal_height, breakpoint, load_time_ms, entry_method |
| `tui.org.overview.tab_switch` | Tab changed | org_id, org_name, from_tab, to_tab, tab_index, switch_method |
| `tui.org.overview.tab_load` | Tab data loaded (first time) | org_id, org_name, tab, item_count, total_count, load_time_ms |
| `tui.org.overview.repo_open` | Enter on repo | org_id, org_name, repo_id, repo_name, repo_is_public, position_in_list, was_filtered |
| `tui.org.overview.member_open` | Enter on member | org_id, org_name, member_username, member_role, position_in_list |
| `tui.org.overview.team_open` | Enter on team | org_id, org_name, team_id, team_name, team_permission, position_in_list |
| `tui.org.overview.filter` | Filter activated | org_id, org_name, active_tab, total_loaded_count |
| `tui.org.overview.filter_apply` | Filter narrows results | org_id, org_name, active_tab, filter_text_length, matched_count |
| `tui.org.overview.paginate` | Next page loaded | org_id, org_name, tab, page_number, items_loaded_total, total_count |
| `tui.org.overview.error` | API error | org_name, error_type, http_status, tab |
| `tui.org.overview.retry` | R pressed | org_name, tab, error_type, retry_success |
| `tui.org.overview.back` | q pressed | org_id, org_name, active_tab, time_on_screen_ms, tabs_visited |

### Success Indicators

- Screen load completion rate: >98%
- Tab engagement (visit non-default tab): >35%
- Repos → repo open rate: >50%
- Members tab visit rate: >15%
- Teams tab visit rate: >10%
- Settings visit rate (owners): >20%
- Filter adoption: >10% for tabs with >10 items
- Error rate: <2%
- Retry success rate: >80%
- Median time on screen: 5–60 seconds

## Observability

### Logging

| Level | Event | Context |
|-------|-------|--------|
| info | Screen loaded | org_name, org_visibility, load_time_ms, entry_method |
| info | Tab switched | org_name, from_tab, to_tab |
| info | Tab data loaded | org_name, tab, item_count, load_time_ms |
| info | Item opened | org_name, tab, item_type, item_name, position |
| info | Pagination page loaded | org_name, tab, page_number, items_count |
| warn | Org fetch error | org_name, http_status, error_message (token redacted) |
| warn | Tab data fetch error | org_name, tab, http_status, error_message |
| warn | Rate limited | org_name, tab, retry_after_seconds |
| warn | Non-member access (404/403) | org_name |
| warn | Filter zero results | org_name, tab, filter_text |
| debug | Screen mounted | org_name, viewer_user_id |
| debug | Filter activated/cleared | org_name, tab |
| debug | Pagination trigger | org_name, tab, scroll_percent, has_more |
| debug | Tab cache hit | org_name, tab, cached_count |
| debug | Terminal resize | old/new dimensions, active_tab |

Logs to stderr. Level via CODEPLANE_LOG_LEVEL (default: warn).

### Error Cases

| Error | Detection | Recovery |
|-------|-----------|----------|
| Network timeout on org fetch | 30s timeout | Full-screen error + R to retry |
| Org not found (404) | API 404 | "Organization not found." + q to back |
| Access denied (403) | API 403 | "Organization not found." (conceals) + q |
| Auth expired (401) | API 401 | App-shell auth error screen |
| Tab fetch timeout | 30s timeout | Inline error in tab + R to retry |
| Rate limited (429) | API 429 | Inline "Rate limited. Retry in Ns." |
| Server error (500+) | API 5xx | Inline "Server error. Press R to retry." |
| Terminal resize during load | useOnResize | Fetch continues, renders at new size |
| Resize below 80×24 | useTerminalDimensions | "Terminal too small" overlay |
| SSE disconnect | Status bar | Unaffected (REST-only) |
| Rapid tab switching | Multiple fetches | Independent per-tab, cached results |
| Malformed API response | Parse error | Error state with generic message |
| React error boundary | Unhandled exception | Error screen with restart/quit |
| Org deleted while viewing | 404 on next call | Error state inline |

### Failure Modes

- Org profile failure: full-screen error, no tabs/metadata. R to retry, q to back.
- Tab data failure: inline error in tab. Metadata/tab bar/other caches stable.
- Partial pagination failure: existing items visible, only Loading more area shows error.
- Memory: 500-item cap per tab, max ~1500 items total.

## Verification

### Test File: `e2e/tui/organizations.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

### Terminal Snapshot Tests (24)

- **org-overview-initial-load**: Navigate to overview at 120×40 → org name, badge, description, website, location, timestamps, tab bar, repo list
- **org-overview-minimal-org**: No description/website/location → name + badge + timestamps only, no empty lines
- **org-overview-full-metadata**: All fields populated → multi-line description, website, location, timestamps
- **org-overview-visibility-public**: Green "public" badge
- **org-overview-visibility-limited**: Yellow "limited" badge
- **org-overview-visibility-private**: Red "private" badge
- **org-overview-tab-bar-default**: Repos active, Members/Teams muted, Settings hidden (non-owner)
- **org-overview-tab-bar-owner**: 4 tabs including Settings
- **org-overview-repos-tab-content**: Repo list with columns, first row focused
- **org-overview-repos-tab-empty**: "This organization has no repositories yet."
- **org-overview-members-tab-content**: Member list with username, display_name, role
- **org-overview-members-tab-single-owner**: Single row with yellow "owner" badge
- **org-overview-members-role-badges**: Yellow owner, gray member
- **org-overview-teams-tab-content**: Team list with name, permission, description
- **org-overview-teams-tab-empty**: Empty state with create-team hint
- **org-overview-teams-permission-badges**: Gray read, blue write, yellow admin
- **org-overview-loading-org**: Full-screen spinner
- **org-overview-loading-tab**: Tab spinner while metadata visible
- **org-overview-error-404**: "Organization not found." full-screen
- **org-overview-error-403-shows-404**: Non-member sees 404, not 403
- **org-overview-tab-error**: Inline error in tab, metadata stable
- **org-overview-filter-active**: Filter input visible
- **org-overview-filter-no-matches**: No matches message with Esc hint
- **org-overview-breadcrumb**: "Organizations > acme-corp"

### Keyboard Interaction Tests (35)

- **org-overview-tab-cycles-forward**: Tab → Repos to Members
- **org-overview-shift-tab-cycles-backward**: Shift+Tab → Members to Repos
- **org-overview-tab-wraps-forward**: Last tab → wraps to Repos
- **org-overview-shift-tab-wraps-backward**: First tab → wraps to last
- **org-overview-1-jumps-repos**: Key 1 → Repos active
- **org-overview-2-jumps-members**: Key 2 → Members active
- **org-overview-3-jumps-teams**: Key 3 → Teams active
- **org-overview-4-jumps-settings-owner**: Owner key 4 → Settings pushed
- **org-overview-4-noop-non-owner**: Non-owner key 4 → no-op
- **org-overview-j-moves-down-repos**: j → next repo
- **org-overview-k-moves-up-repos**: k → previous repo
- **org-overview-j-moves-down-members**: j in Members → next member
- **org-overview-j-moves-down-teams**: j in Teams → next team
- **org-overview-enter-opens-repo**: Enter → repo overview pushed
- **org-overview-enter-opens-team**: Enter in Teams → team detail pushed
- **org-overview-enter-on-member**: Enter in Members → user profile (or no-op)
- **org-overview-slash-activates-filter**: / → filter input focused
- **org-overview-filter-narrows-repos**: Type "api" → matching repos only
- **org-overview-filter-narrows-members**: Type "alice" → matching members
- **org-overview-filter-narrows-teams**: Type "platform" → matching teams
- **org-overview-filter-case-insensitive**: "API" matches "api"
- **org-overview-esc-clears-filter**: Filter active → Esc → cleared
- **org-overview-esc-pops-no-filter**: No filter → Esc → pop screen
- **org-overview-q-pops-screen**: q → back to org list
- **org-overview-G-jumps-bottom**: G → last loaded row
- **org-overview-gg-jumps-top**: g g → first row
- **org-overview-ctrl-d-page-down**: Ctrl+D → page down
- **org-overview-ctrl-u-page-up**: Ctrl+U → page up
- **org-overview-R-retries-tab-error**: R in error → retry
- **org-overview-R-retries-org-error**: R on org error → retry
- **org-overview-R-noop-loaded**: R when loaded → no-op
- **org-overview-tab-preserves-scroll**: Switch tabs and back → scroll preserved
- **org-overview-rapid-j-in-tab**: 10× j → 10 rows moved
- **org-overview-keys-in-filter-input**: j/k/q/1/2/3 typed in filter, not as keybindings
- **org-overview-enter-during-loading**: Enter while loading → no-op

### Responsive Tests (15)

- **org-overview-80x24-metadata**: Compacted metadata, no website/location/timestamps
- **org-overview-80x24-tab-labels**: Abbreviated labels
- **org-overview-80x24-repos-columns**: Name + vis + updated only
- **org-overview-80x24-members-columns**: Username + role only
- **org-overview-80x24-teams-columns**: Name + perm only
- **org-overview-120x40-metadata**: Full metadata with all fields
- **org-overview-120x40-tab-labels**: Full labels
- **org-overview-120x40-repos-columns**: Name + vis + desc + updated with headers
- **org-overview-120x40-members-columns**: Username + display_name + role with headers
- **org-overview-120x40-teams-columns**: Name + perm + desc with headers
- **org-overview-200x60-repos-columns**: Wider columns
- **org-overview-resize-preserves-tab**: Tab stays active on resize
- **org-overview-resize-preserves-focus**: Focus preserved on resize
- **org-overview-resize-metadata-reflow**: 120→80 collapses metadata
- **org-overview-resize-during-tab-load**: Resize during load → no crash

### Integration Tests (18)

- **org-overview-auth-expiry**: 401 → app-shell auth error
- **org-overview-rate-limit-429**: 429 → inline retry countdown
- **org-overview-network-error-org**: Timeout → full-screen error
- **org-overview-network-error-tab**: Tab timeout → inline error
- **org-overview-repos-pagination**: 45 repos → 2 pages loaded
- **org-overview-members-pagination**: 45 members → 2 pages
- **org-overview-teams-pagination**: 45 teams → 2 pages
- **org-overview-500-items-cap**: 600 repos → 500 cap with footer
- **org-overview-lazy-load-members**: Members not fetched until tab activated
- **org-overview-lazy-load-teams**: Teams not fetched until tab activated
- **org-overview-tab-cache**: Switch away and back → cached, no re-fetch
- **org-overview-enter-repo-then-q**: Back preserves tab and scroll
- **org-overview-enter-team-then-q**: Back preserves Teams tab
- **org-overview-server-error-500**: 500 → inline error
- **org-overview-private-repos-visible**: Member sees private repos
- **org-overview-public-repos-only-non-member**: Non-member sees public only
- **org-overview-unicode-content**: Unicode renders correctly
- **org-overview-back-preserves-org-list-focus**: q restores org list focus

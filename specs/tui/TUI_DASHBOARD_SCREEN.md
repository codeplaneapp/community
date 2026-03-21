# TUI_DASHBOARD_SCREEN

Specification for TUI_DASHBOARD_SCREEN.

## High-Level User POV

The dashboard is the home screen of the Codeplane TUI — the first thing the developer sees after launching `codeplane tui`. It serves as a personalized command center that orients the user, surfaces recent activity, and provides fast entry points into the most common workflows. The dashboard is not a passive landing page; it is an active, keyboard-navigable surface designed for developers who want to resume work, check on their repositories, and jump into tasks without typing any commands.

The screen is organized into four distinct panels arranged in a two-column grid. The top-left panel lists the user's recent repositories sorted by last activity, showing each repo's name, description snippet, visibility badge, and star count. The top-right panel displays the user's organizations with member counts and a quick indicator of the user's role. The bottom-left panel shows starred repositories — the user's bookmarked projects for quick access. The bottom-right panel is an activity feed showing recent events across the user's repositories: issue opens, landing request submissions, workflow completions, and other notable actions, each rendered as a compact single-line summary with a relative timestamp.

Navigation across the four panels uses `Tab` and `Shift+Tab` to cycle focus between them. Within each panel, `j/k` scrolls through the list items. Pressing `Enter` on a repository navigates to that repository's overview screen; pressing `Enter` on an organization navigates to the organization overview; pressing `Enter` on an activity item navigates to the referenced resource (the issue, landing request, or workflow run). A quick-actions bar spans the bottom of the content area, providing single-key shortcuts for the most common operations: `c` to create a new repository, `n` to open notifications, `s` to open global search, and `/` to filter the currently focused panel's list.

At the minimum 80×24 terminal size, the dashboard collapses to a single-column layout with panels stacked vertically. Only one panel is visible at a time, and the user cycles between panels using `Tab`. At standard 120×40 and larger sizes, the two-column grid is fully rendered. Each panel truncates long repository names and descriptions with an ellipsis to avoid horizontal overflow. The activity feed timestamps collapse from "2 hours ago" to "2h" at compact sizes.

The dashboard is the root of the navigation stack. Pressing `q` on the dashboard quits the TUI (since there is no screen to pop back to). The header bar shows "Dashboard" as the breadcrumb, and the status bar displays dashboard-specific keybinding hints. The `g d` go-to sequence always returns the user to this screen.

## Acceptance Criteria

### Screen lifecycle
- [ ] The dashboard is the default screen rendered when the TUI launches without `--screen` arguments.
- [ ] The dashboard is the root entry in the navigation stack (stack depth 1).
- [ ] Pressing `q` on the dashboard prompts the user to confirm quitting the TUI (since it is the root screen).
- [ ] The `g d` go-to keybinding navigates to the dashboard from any other screen, replacing the stack.
- [ ] The dashboard appears in the command palette as "Dashboard" and is navigable via `:dashboard` or `:home`.

### Layout
- [ ] The dashboard renders a two-column, two-row grid of panels within the content area (between header bar and status bar).
- [ ] Panel distribution: top-left = Recent Repositories, top-right = Organizations, bottom-left = Starred Repositories, bottom-right = Activity Feed.
- [ ] Each panel has a visible title rendered in bold text with `primary` color (ANSI 33) at the top of the panel.
- [ ] Panels are separated by single-line box-drawing borders using `border` color (ANSI 240).
- [ ] The quick-actions bar renders as a single row at the bottom of the content area, above the status bar.
- [ ] The dashboard spans the full width and height of the content area with no horizontal or vertical overflow.

### Recent Repositories panel (top-left)
- [ ] Displays the authenticated user's repositories sorted by `updated_at` descending (most recently active first).
- [ ] Each row shows: repo full_name (owner/name), truncated description, visibility badge (`◆ public` or `◇ private`), and star count.
- [ ] Repository names render in `primary` color (ANSI 33); descriptions render in `muted` color (ANSI 245).
- [ ] The visibility badge renders in `success` color (ANSI 34) for public repos and `muted` color (ANSI 245) for private repos.
- [ ] The list is scrollable via `<scrollbox>` when items exceed the panel height.
- [ ] Loads the first page (20 items) on mount; additional pages load via cursor-based pagination when scroll reaches 80% of content height.
- [ ] Displays "No repositories yet" in `muted` color when the user has no repositories.
- [ ] Pressing `Enter` on a focused repository pushes the repository overview screen onto the navigation stack.
- [ ] Repository full_name is truncated at 40 characters with `…` suffix when it exceeds the available width.
- [ ] Description is truncated at the remaining panel width minus padding, with `…` suffix.

### Organizations panel (top-right)
- [ ] Displays the authenticated user's organizations sorted alphabetically by name.
- [ ] Each row shows: organization name, truncated description, and member count.
- [ ] Organization names render in `primary` color (ANSI 33); descriptions and member counts render in `muted` color (ANSI 245).
- [ ] The list is scrollable via `<scrollbox>` when items exceed the panel height.
- [ ] Loads the first page (20 items) on mount; additional pages load on scroll-to-end.
- [ ] Displays "No organizations" in `muted` color when the user belongs to no organizations.
- [ ] Pressing `Enter` on a focused organization pushes the organization overview screen onto the navigation stack.

### Starred Repositories panel (bottom-left)
- [ ] Displays the authenticated user's starred repositories sorted by the time of starring (most recent first).
- [ ] Each row shows the same format as the Recent Repositories panel: full_name, truncated description, visibility badge, star count.
- [ ] The list is scrollable via `<scrollbox>` when items exceed the panel height.
- [ ] Loads the first page (20 items) on mount; additional pages load on scroll-to-end.
- [ ] Displays "No starred repositories" in `muted` color when the user has no starred repos.
- [ ] Pressing `Enter` on a focused starred repo pushes the repository overview screen onto the navigation stack.

### Activity Feed panel (bottom-right)
- [ ] Displays recent activity for the authenticated user sorted by `created_at` descending (newest first).
- [ ] Each row shows: event icon (color-coded by type), summary text, and relative timestamp.
- [ ] Event types and icons: issue opened (● green), issue closed (● red), landing submitted (▶ blue), landing merged (✓ green), workflow passed (✓ green), workflow failed (✗ red), repo created (+ blue), comment added (💬 muted).
- [ ] The summary text uses the format `{actor} {action} {target}` (e.g., "alice opened issue #42 in org/repo").
- [ ] Relative timestamps render in `muted` color: "just now", "5m", "2h", "3d", "2w" at compact width; "just now", "5 minutes ago", "2 hours ago", "3 days ago" at standard+ width.
- [ ] The list is scrollable via `<scrollbox>` when items exceed the panel height.
- [ ] Loads the first page (30 items) on mount; additional pages load on scroll-to-end.
- [ ] Displays "No recent activity" in `muted` color when the activity feed is empty.
- [ ] Pressing `Enter` on a focused activity item navigates to the referenced resource.

### Quick actions bar
- [ ] Renders as a single-row bar at the bottom of the content area with key-labeled action buttons.
- [ ] Actions: `c:new repo` · `n:notifications` · `s:search` · `/:filter`.
- [ ] Keys render in bold; action labels render in `muted` color (ANSI 245).
- [ ] Pressing `c` opens the repository creation form.
- [ ] Pressing `n` pushes the notifications screen.
- [ ] Pressing `s` pushes the global search screen.
- [ ] Pressing `/` focuses the inline filter input for the currently focused panel.

### Panel focus and navigation
- [ ] Exactly one panel has focus at any time, indicated by a highlighted border in `primary` color (ANSI 33).
- [ ] `Tab` cycles focus forward: Recent Repos → Organizations → Starred Repos → Activity Feed → Recent Repos.
- [ ] `Shift+Tab` cycles focus backward.
- [ ] `h`/`l` move focus left/right between columns (when two-column layout is active).
- [ ] Within a focused panel, `j`/`k`/`Down`/`Up` move the cursor through items.
- [ ] `Enter` activates the focused item.
- [ ] `G` jumps to the last loaded item; `g g` jumps to the first item.
- [ ] `Ctrl+D` scrolls down half a panel height; `Ctrl+U` scrolls up half a panel height.
- [ ] Focus is remembered per panel — switching panels preserves cursor position.
- [ ] The focused item is highlighted with reverse video or accent background.

### Inline filter
- [ ] Pressing `/` shows a filter input at the top of the focused panel.
- [ ] Typing narrows the list to items matching the query (fuzzy match on name/title).
- [ ] The filter applies client-side to already-loaded items.
- [ ] `Esc` clears the filter and restores the full list.
- [ ] `Enter` selects the first match and closes the filter.
- [ ] Shows a match count: "N of M".

### Data loading
- [ ] All four panels load data concurrently on mount.
- [ ] Each panel shows "Loading…" while fetching.
- [ ] Failed panels show error in `error` color with "Press R to retry".
- [ ] Pressing `R` retries the focused panel's fetch.
- [ ] Successful data is cached for 60 seconds.

### Boundary constraints
- [ ] Repository names truncated at 40 characters.
- [ ] Organization names truncated at 30 characters.
- [ ] Descriptions and summaries truncated at available width.
- [ ] Panels handle 0, 1, 20, and 100+ items correctly.
- [ ] Scroll position preserved across pagination loads.
- [ ] Maximum 200 items per panel (memory cap).

### Responsive behavior
- [ ] 80×24: single-column stacked; one panel visible; Tab switches panels.
- [ ] 120×40: two-column two-row grid; all panels visible.
- [ ] 200×60: wider panels, longer descriptions, full timestamps.
- [ ] Below 80×24: "Terminal too small" message.
- [ ] Resize triggers synchronous re-layout with no artifacts.

### Performance
- [ ] First render with cached data within 50ms.
- [ ] First render with fetch shows spinners within 200ms.
- [ ] Panel scroll at 60fps for up to 200 items.
- [ ] Filter input responds within 16ms.

## Design

### Layout structure

At standard terminal size (120×40), after subtracting header (1 row) and status bar (1 row), the content area is 38 rows × 120 columns:

```
┌───────────── Recent Repos ──────────────┬──────────── Organizations ─────────────┐
│ owner/repo-one                     ◆ 42 │ acme-corp                    12 members │
│   A short description...                │   Enterprise software solutions        │
│ owner/repo-two                     ◇  8 │ open-source-team              5 members │
│   Another repo description...           │   Community projects                   │
│ org/shared-lib                     ◆ 15 │                                        │
│   Shared library for...                 │                                        │
│ ...                                     │                                        │
├───────────── Starred Repos ─────────────┼──────────── Activity Feed ─────────────┤
│ popular/framework                  ◆ 2k │ ● alice opened #42 in org/repo    2h   │
│   The most popular framework...         │ ✓ bob merged LR !17 in team/app   3h   │
│ tools/cli-utils                    ◆ 89 │ ✗ CI failed on org/repo           5h   │
│   Command-line utilities for...         │ ▶ carol submitted LR !23 in...   1d   │
│ ...                                     │ ● dave closed #38 in org/repo    2d   │
│                                         │ ...                                    │
│                                         │                                        │
├─────────────────────────────────────────┴────────────────────────────────────────┤
│ c:new repo  n:notifications  s:search  /:filter                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

At minimum terminal size (80×24), single-column stacked layout with panel switcher:

```
┌──────────── Recent Repos [1/4] ──────────────────────────────────────┐
│ owner/repo-one                                              ◆ 42    │
│ owner/repo-two                                              ◇  8    │
│ org/shared-lib                                              ◆ 15    │
│ ...                                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ c:new repo  n:notifs  s:search  /:filter  Tab:next panel            │
└─────────────────────────────────────────────────────────────────────┘
```

### Component tree

```jsx
<box flexDirection="column" width="100%" height="100%">
  {/* Panel grid */}
  <box flexDirection={isCompact ? "column" : "row"} flexGrow={1}>
    {isCompact ? (
      <DashboardPanel title={panels[activePanelIndex].title} index={activePanelIndex} total={4} focused={true}>
        {panels[activePanelIndex].content}
      </DashboardPanel>
    ) : (
      <>
        <box flexDirection="column" width="50%">
          <DashboardPanel title="Recent Repos" focused={focusedPanel === 0}>
            <ReposList repos={recentRepos} />
          </DashboardPanel>
          <DashboardPanel title="Starred Repos" focused={focusedPanel === 2}>
            <ReposList repos={starredRepos} />
          </DashboardPanel>
        </box>
        <box flexDirection="column" width="50%">
          <DashboardPanel title="Organizations" focused={focusedPanel === 1}>
            <OrgsList orgs={userOrgs} />
          </DashboardPanel>
          <DashboardPanel title="Activity Feed" focused={focusedPanel === 3}>
            <ActivityFeed items={activityItems} />
          </DashboardPanel>
        </box>
      </>
    )}
  </box>
  {/* Quick actions bar */}
  <box flexDirection="row" height={1} width="100%" gap={2}>
    <text><span attributes={BOLD}>c</span><span fg={245}>:new repo</span></text>
    <text><span attributes={BOLD}>n</span><span fg={245}>:notifications</span></text>
    <text><span attributes={BOLD}>s</span><span fg={245}>:search</span></text>
    <text><span attributes={BOLD}>/</span><span fg={245}>:filter</span></text>
  </box>
</box>
```

### DashboardPanel sub-component

Wraps each panel with border highlighting, title, optional filter input, and scrollable content area. Focused panel uses `primary` border color (ANSI 33); unfocused panels use `border` color (ANSI 240). At compact sizes, the title includes `[N/4]` position indicator.

### ReposList sub-component

Used by both Recent Repos and Starred Repos. Each row: repo full_name in `primary` color, visibility badge (◆/◇), star count in `muted` color, and optionally a truncated description on a second line in `muted` color. Focused item highlighted with reverse video.

### OrgsList sub-component

Each row: org name in `primary` color, member count in `muted` color. Focused item highlighted with reverse video.

### ActivityFeed sub-component

Each row: color-coded event icon, summary text, relative timestamp in `muted` color. Event icons: ● (green/red for issue open/close), ▶ (blue for landing submit), ✓ (green for merge/pass), ✗ (red for fail), + (blue for create). Focused item highlighted with reverse video.

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Dashboard | Cycle focus to next panel |
| `Shift+Tab` | Dashboard | Cycle focus to previous panel |
| `h` | Two-column | Move focus to left column |
| `l` | Two-column | Move focus to right column |
| `j`/`Down` | Panel focused | Move cursor down |
| `k`/`Up` | Panel focused | Move cursor up |
| `Enter` | Item focused | Navigate to item detail |
| `G` | Panel focused | Jump to last item |
| `g g` | Panel focused | Jump to first item |
| `Ctrl+D` | Panel focused | Page down |
| `Ctrl+U` | Panel focused | Page up |
| `/` | Dashboard | Open inline filter |
| `Esc` | Filter active | Close filter |
| `Enter` | Filter active | Select first match |
| `c` | Dashboard | Create repository |
| `n` | Dashboard | Open notifications |
| `s` | Dashboard | Open search |
| `R` | Panel with error | Retry fetch |
| `q` | Dashboard (root) | Quit TUI |

### Status bar hints (priority order)

1. `j/k:navigate` (1)
2. `Enter:open` (2)
3. `Tab:panel` (3)
4. `/:filter` (4)
5. `c:new repo` (5)
6. `n:notifs` (6)
7. `s:search` (7)

### Terminal resize behavior

| Width × Height | Layout | Panels visible | Description display | Timestamps |
|----------------|--------|---------------|--------------------|-----------|
| 80×24 – 119×39 | Single column, stacked | 1 at a time | Hidden | Compact ("2h") |
| 120×40 – 199×59 | Two-column grid | All 4 | Truncated | Compact ("2h") |
| 200×60+ | Two-column grid | All 4 | Full/longer | Full ("2 hours ago") |

### Data hooks consumed

| Hook | Source | Data |
|------|--------|------|
| `useRepos()` | `@codeplane/ui-core` | `{ items: RepoSummary[], totalCount, loading, error, loadMore }` |
| `useStarredRepos()` | `@codeplane/ui-core` | `{ items: RepoSummary[], totalCount, loading, error, loadMore }` |
| `useOrganizations()` | `@codeplane/ui-core` | `{ items: OrgSummary[], totalCount, loading, error, loadMore }` |
| `useActivity()` | `@codeplane/ui-core` | `{ items: ActivitySummary[], totalCount, loading, error, loadMore }` |
| `useUser()` | `@codeplane/ui-core` | `{ user: UserProfile, loading, error }` |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler |
| `useStatusBarHints()` | local TUI | Dashboard keybinding hints |
| `useNavigation()` | local TUI | `{ push, pop, goTo }` |

### API endpoints consumed

| Endpoint | Hook |
|----------|------|
| `GET /api/user/repos?page=N&per_page=20` | `useRepos()` |
| `GET /api/user/starred?page=N&per_page=20` | `useStarredRepos()` |
| `GET /api/user/orgs?page=N&per_page=20` | `useOrganizations()` |
| `GET /api/users/:username/activity?page=N&per_page=30` | `useActivity()` |
| `GET /api/user` | `useUser()` |

## Permissions & Security

### Authorization
- The dashboard requires an authenticated user. An unauthenticated TUI session (missing token) is redirected to the auth error screen before the dashboard renders.
- The dashboard displays only the authenticated user's own repositories, organizations, starred repos, and activity. No cross-user data is exposed.
- Repository visibility rules are enforced server-side: the `/api/user/repos` endpoint only returns repos the authenticated user owns or has access to. The TUI does not perform client-side visibility filtering.
- Organization membership is enforced server-side: the `/api/user/orgs` endpoint only returns organizations the user belongs to.
- Activity feed items are scoped to the user's own public activity. Server-side filtering ensures no private-repo activity leaks to unauthorized viewers.

### Token-based auth
- The TUI authenticates via a token stored in the CLI keychain (from `codeplane auth login`) or the `CODEPLANE_TOKEN` environment variable.
- The dashboard does not handle, store, or display the authentication token. The token is managed by the `<AuthProvider>` and injected into API requests by the `<APIClientProvider>`.
- If the token expires while the dashboard is displayed, API requests will fail with 401. Each panel independently handles 401 errors by displaying "Session expired. Run `codeplane auth login` to re-authenticate." in `error` color.

### Rate limiting
- The dashboard makes 5 concurrent API requests on mount (user profile + 4 panel data fetches). This burst is within standard API rate limits.
- Pagination requests are throttled by scroll behavior (user-driven, not automatic). No debounce is needed beyond the 80%-scroll-trigger.
- The dashboard does not make SSE connections itself — real-time updates (notification count, sync status) are handled by the global `<SSEProvider>` and `<StatusBar>`.
- Failed requests are retried only on explicit user action (`R` key), not automatically, to avoid rate limit exhaustion.

### Data sensitivity
- Repository names and descriptions are user-generated content and may contain sensitive information. The dashboard displays them as-is (no sanitization needed in a terminal context — there is no XSS vector).
- Activity feed summaries may reference issue titles that contain sensitive data. These are displayed as received from the server.
- No PII beyond the user's own username and repository names is rendered on the dashboard.

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.dashboard.viewed` | Dashboard screen renders with data loaded | `repos_count`, `starred_count`, `orgs_count`, `activity_count`, `terminal_width`, `terminal_height`, `layout` ("grid" or "stacked") |
| `tui.dashboard.panel_focused` | User switches focus to a different panel | `panel` ("recent_repos", "orgs", "starred_repos", "activity"), `method` ("tab", "shift_tab", "h_l") |
| `tui.dashboard.item_opened` | User presses Enter on a dashboard item | `panel`, `item_type` ("repo", "org", "activity"), `item_id`, `position_in_list` |
| `tui.dashboard.filter_used` | User types into the inline filter input | `panel`, `query_length`, `match_count`, `total_count` |
| `tui.dashboard.filter_selected` | User selects a filter result with Enter | `panel`, `query_length`, `selected_position` |
| `tui.dashboard.quick_action` | User triggers a quick action (c, n, s) | `action` ("create_repo", "notifications", "search") |
| `tui.dashboard.pagination` | User scrolls to trigger pagination load | `panel`, `page_number`, `items_loaded_total` |
| `tui.dashboard.retry` | User presses R to retry a failed panel | `panel`, `error_type`, `retry_count` |
| `tui.dashboard.data_load_time` | All four panels finish loading | `repos_ms`, `starred_ms`, `orgs_ms`, `activity_ms`, `total_ms` |

### Common event properties

All dashboard events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `layout`: `"grid"` | `"stacked"`

### Success indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Dashboard render rate | 100% of authenticated sessions | Every authenticated TUI session sees the dashboard (no crashes) |
| Data load success rate | > 98% | At least 98% of dashboard views load all 4 panels without error |
| Mean time to interactive | < 1 second | From TUI launch to all dashboard panels populated |
| Item open rate | > 60% of sessions | At least 60% of sessions that see the dashboard open at least one item |
| Panel exploration rate | > 40% of sessions | At least 40% of sessions focus more than one panel |
| Quick action usage | > 20% of sessions | At least 20% of sessions use a quick-action key (c, n, or s) |
| Filter usage | > 10% of sessions | At least 10% of sessions use the inline filter |

## Observability

### Logging requirements

| Log level | Event | Message format |
|-----------|-------|----------------|
| `debug` | Dashboard mounted | `Dashboard: mounted [width={w}] [height={h}] [layout={grid|stacked}]` |
| `debug` | Panel data loaded | `Dashboard: panel loaded [panel={name}] [count={n}] [duration={ms}ms]` |
| `debug` | Panel focus changed | `Dashboard: focus changed [from={panel}] [to={panel}]` |
| `debug` | Pagination triggered | `Dashboard: pagination [panel={name}] [page={n}]` |
| `debug` | Filter applied | `Dashboard: filter [panel={name}] [query={q}] [matches={n}]` |
| `info` | Dashboard fully loaded | `Dashboard: all panels loaded [total_ms={ms}] [repos={n}] [starred={n}] [orgs={n}] [activity={n}]` |
| `info` | Item navigation | `Dashboard: navigated [panel={name}] [item_type={type}] [item_id={id}]` |
| `warn` | Panel data fetch failed | `Dashboard: fetch failed [panel={name}] [status={code}] [error={message}]` |
| `warn` | Slow panel load | `Dashboard: slow load [panel={name}] [duration={ms}ms]` (>2000ms) |
| `error` | Auth error on dashboard | `Dashboard: auth error [panel={name}] [status=401]` |
| `error` | Render error caught | `Dashboard: render error [panel={name}] [error={message}]` |
| `error` | Unexpected hook data | `Dashboard: unexpected data [hook={name}] [value={json}]` |

### Error cases specific to TUI

| Error case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during data load | Layout re-renders while fetch continues; data populates into new layout when ready | Independent operations; no coordination needed |
| Terminal resize collapses grid to stacked | Previously visible panel content preserved; focus panel index unchanged | Focus indicator [N/4] helps orient the user |
| SSE disconnect while on dashboard | Status bar shows disconnected; dashboard panels unaffected (REST, not SSE) | SSE provider handles reconnection |
| Auth token expires while browsing | Next API call fails with 401; panel shows auth error message | User must re-authenticate via CLI |
| Network timeout on panel fetch | Panel shows error with retry hint after 10-second timeout | User presses R to retry |
| Empty user (new account) | All panels show empty-state messages; quick actions still functional | Normal state, not an error |
| Rapid Tab cycling | Focus state machine handles rapid input; one focus change per keypress | Synchronous state transitions |
| Server returns malformed pagination | Panel treats it as end-of-list; logs warning | User can retry by scrolling again |
| Activity references deleted resources | Activity item renders; Enter navigation shows 404 on target | Pop back to dashboard with error on detail screen |
| Terminal has no color support | Falls back to bold/underline for emphasis | Detected by TUI_THEME_AND_COLOR_TOKENS |
| API returns 200+ items across pages | Panel stops loading at 200-item cap | Client-side cap protects memory |

### Failure modes and recovery

- **Dashboard component crash**: Caught by the global error boundary. Shows error screen with "Press `r` to restart". Dashboard state is lost; TUI restarts at the dashboard with fresh data.
- **Individual panel crash**: Each panel is wrapped in its own error boundary. A crashed panel renders "Panel error — press R to retry" while other panels continue.
- **All API requests fail simultaneously**: All four panels show error states. Quick actions (c, n, s) still work since they navigate to other screens.
- **Extremely slow network**: Panels show loading spinners; the user can navigate away via go-to mode or command palette while data loads in the background.

## Verification

### Terminal snapshot tests

```
SNAP-DASH-001: Dashboard renders at 120x40 with all panels populated
  → Launch TUI at 120x40 with test user having repos, orgs, starred repos, and activity
  → Assert full content area matches snapshot: two-column grid with all four panels visible

SNAP-DASH-002: Dashboard renders at 80x24 minimum size
  → Launch TUI at 80x24 with test user having repos
  → Assert single-column layout with one panel visible
  → Assert panel title includes position indicator [1/4]

SNAP-DASH-003: Dashboard renders at 200x60 large size
  → Launch TUI at 200x60 with test user data
  → Assert two-column grid with wider panels, full descriptions, full timestamps

SNAP-DASH-004: Dashboard with empty state (new user, no data)
  → Launch TUI at 120x40 with user having no repos, orgs, or activity
  → Assert each panel shows appropriate empty-state message

SNAP-DASH-005: Dashboard Recent Repos panel with items
  → Launch TUI at 120x40 with user having 5 repos
  → Assert Recent Repos panel shows repo names in primary color, descriptions in muted, visibility badges

SNAP-DASH-006: Dashboard Organizations panel with items
  → Launch TUI at 120x40 with user belonging to 3 orgs
  → Assert Organizations panel shows org names and member counts

SNAP-DASH-007: Dashboard Starred Repos panel with items
  → Launch TUI at 120x40 with user having 4 starred repos
  → Assert Starred Repos panel shows starred repo names and star counts

SNAP-DASH-008: Dashboard Activity Feed with items
  → Launch TUI at 120x40 with user having 10 activity items
  → Assert Activity Feed shows event icons, summaries, and relative timestamps

SNAP-DASH-009: Dashboard focused panel border highlight
  → Launch TUI at 120x40
  → Assert first panel (Recent Repos) has primary-colored border (ANSI 33)
  → Assert other panels have default border color (ANSI 240)

SNAP-DASH-010: Dashboard quick-actions bar
  → Launch TUI at 120x40
  → Assert bottom row of content area shows "c:new repo  n:notifications  s:search  /:filter"

SNAP-DASH-011: Dashboard panel loading state
  → Launch TUI at 120x40 with slow API response
  → Assert panels show "Loading…" text

SNAP-DASH-012: Dashboard panel error state
  → Launch TUI at 120x40 with API returning 500 for repos
  → Assert Recent Repos panel shows error in red with retry hint

SNAP-DASH-013: Dashboard inline filter active
  → Launch TUI at 120x40, focus Recent Repos, press /
  → Assert filter input appears at top of panel

SNAP-DASH-014: Dashboard at 80x24 with panel indicator
  → Launch TUI at 80x24
  → Assert panel title shows [1/4]; press Tab; assert [2/4]

SNAP-DASH-015: Dashboard star count formatting
  → Assert star counts: 0→(none), 5→"5", 999→"999", 1500→"1.5k", 25000→"25k"
```

### Keyboard interaction tests

```
KEY-DASH-001: Tab cycles panel focus forward
  → Launch TUI at 120x40 → Assert Recent Repos focused → Tab → Assert Orgs focused → Tab → Assert Starred focused → Tab → Assert Activity focused → Tab → Assert Recent Repos focused (wrap)

KEY-DASH-002: Shift+Tab cycles panel focus backward
  → Launch TUI at 120x40 → Assert Recent Repos focused → Shift+Tab → Assert Activity focused → Shift+Tab → Assert Starred focused

KEY-DASH-003: j/k navigates within focused panel
  → Launch TUI with 5 repos → Assert first repo highlighted → j → Assert second highlighted → k → Assert first highlighted

KEY-DASH-004: Enter on repo navigates to repo overview
  → Focus repo → Enter → Assert navigation pushed to repo overview → Assert breadcrumb "Dashboard > owner/repo"

KEY-DASH-005: Enter on org navigates to org overview
  → Tab to Orgs → Enter → Assert navigation pushed to org overview

KEY-DASH-006: Enter on activity navigates to referenced resource
  → Tab to Activity → Enter on issue-opened item → Assert navigation to issue detail

KEY-DASH-007: G jumps to last item
  → Launch with 10 repos → G → Assert last repo highlighted

KEY-DASH-008: g g jumps to first item
  → Move to item 6 → g g → Assert first repo highlighted

KEY-DASH-009: Ctrl+D and Ctrl+U scroll half page
  → Launch with 20 repos → Ctrl+D → Assert cursor moved down → Ctrl+U → Assert cursor moved back

KEY-DASH-010: c opens create repo screen
  → Press c → Assert create repository screen pushed

KEY-DASH-011: n opens notifications screen
  → Press n → Assert notifications screen pushed

KEY-DASH-012: s opens search screen
  → Press s → Assert search screen pushed

KEY-DASH-013: / opens inline filter
  → Press / → Assert filter input visible → Type "repo" → Assert list narrowed → Assert match count

KEY-DASH-014: Esc closes filter and restores list
  → Press / → Type "xyz" → Esc → Assert filter gone → Assert full list restored

KEY-DASH-015: Enter in filter selects first match
  → Press / → Type "repo-one" → Enter → Assert filter closes → Assert cursor on matched repo

KEY-DASH-016: R retries failed panel
  → Launch with API failing → Assert error → Press R → Assert loading spinner

KEY-DASH-017: h/l moves focus between columns
  → Assert Recent Repos focused → l → Assert Orgs focused → h → Assert Recent Repos focused

KEY-DASH-018: Focus preserved per panel
  → j j in repos → Tab to orgs → j in orgs → Shift+Tab back → Assert 3rd repo still highlighted

KEY-DASH-019: q on dashboard quits TUI
  → Press q → Assert TUI exits

KEY-DASH-020: g d returns to dashboard from elsewhere
  → Press n (notifications) → g d → Assert dashboard is current screen
```

### Responsive resize tests

```
RESIZE-DASH-001: 120x40 → 80x24 collapses to stacked
  → Assert grid → Resize to 80x24 → Assert stacked with [N/4] indicator

RESIZE-DASH-002: 80x24 → 120x40 expands to grid
  → Assert stacked → Resize to 120x40 → Assert grid with all 4 panels

RESIZE-DASH-003: 120x40 → 200x60 shows full content
  → Resize → Assert wider panels, longer descriptions, full timestamps

RESIZE-DASH-004: Rapid resize without artifacts
  → 120x40 → 80x24 → 200x60 → 100x30 → 150x45 → Assert clean layout at 150x45

RESIZE-DASH-005: Focus preserved through resize
  → Focus Orgs panel → Resize 120→80 → Assert Orgs is visible panel in stacked

RESIZE-DASH-006: Scroll position preserved through resize
  → Scroll to item 10 → Resize → Assert item 10 still visible

RESIZE-DASH-007: Quick actions bar adapts
  → At 120 assert full labels → Resize to 80 → Assert truncated labels + Tab hint
```

### Data loading and pagination tests

```
DATA-DASH-001: All panels load concurrently
  → Assert all 4 API requests made in same frame → Assert panels populate independently

DATA-DASH-002: Pagination on scroll
  → 25 repos → Scroll past 80% → Assert page 2 loads and appends

DATA-DASH-003: Pagination stops at 200 cap
  → 250+ repos → Scroll repeatedly → Assert stops at 200 items

DATA-DASH-004: Data cached on re-navigation
  → Load dashboard → Navigate away → g d back → Assert no loading spinner

DATA-DASH-005: Panel error state
  → API 500 for repos → Assert error in red → Assert other panels normal

DATA-DASH-006: 401 auth error message
  → Expired token → Assert "Session expired" message

DATA-DASH-007: Empty user state
  → 0 repos/orgs/starred/activity → Assert all empty-state messages
```

### Edge case tests

```
EDGE-DASH-001: No auth token → auth error screen, not dashboard
EDGE-DASH-002: Extremely long repo names → truncated at 40 chars with …
EDGE-DASH-003: Unicode/special chars in descriptions → no terminal corruption
EDGE-DASH-004: Single item per panel → renders correctly, no cursor crash
EDGE-DASH-005: Concurrent resize + Tab → no artifacts or focus corruption
EDGE-DASH-006: Filter with no matches → "0 of N", empty list, Esc restores
EDGE-DASH-007: Null description fields → omitted, no "null" text
EDGE-DASH-008: Star count edge cases → 0=(none), 1="1", 999="999", 1000="1k", 1500="1.5k", 10000="10k", 1000000="1M"
```

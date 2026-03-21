# TUI_DASHBOARD_REPOS_LIST

Specification for TUI_DASHBOARD_REPOS_LIST.

## High-Level User POV

The dashboard repositories list is the first thing a user sees when they launch the Codeplane TUI. It occupies the primary content region of the Dashboard screen and answers the most common question a developer has when opening a forge tool: "where are my repositories?"

The list shows the authenticated user's own repositories — both public and private — sorted by most recently updated. Each row displays the repository's full name (`owner/name`), a truncated description, a visibility indicator (a lock icon 🔒 for private, nothing for public), the star count, and a relative timestamp showing when the repository was last updated. The focused row is highlighted with the `primary` accent color, and the user moves through the list with `j`/`k` (or arrow keys). Pressing `Enter` on a focused repository pushes the repository overview screen onto the navigation stack.

At the top of the repositories section is a section header reading "Repositories" with the total count in parentheses — for example, "Repositories (42)". Below the header, a search/filter input can be activated by pressing `/`, which narrows the visible list to repositories whose name or description matches the typed query. Pressing `Esc` clears the filter and returns focus to the list.

The list uses a scrollbox for vertical scrolling. When the user scrolls past 80% of the loaded items, the next page of repositories is fetched automatically via cursor-based pagination. A "Loading more…" indicator appears at the bottom of the list during the fetch. If there are no more pages, no indicator is shown.

If the user has no repositories, the list area shows a centered, muted-color message: "No repositories yet. Create one with `codeplane repo create`." This empty state is shown immediately — not after a loading spinner — when the API returns an empty result set.

The repositories list shares the Dashboard screen with other sections (Organizations, Starred Repos, Activity Feed, Quick Actions), but it is the default-focused section when the Dashboard loads. The user can move focus between dashboard sections using `Tab`/`Shift+Tab`.

When the terminal is at minimum size (80×24), the description column is hidden, and only the repository name, visibility icon, and relative timestamp are shown. At standard size (120×40), the full layout is rendered with all columns. At large sizes (200×60+), the description column is wider, and additional metadata like star count and default bookmark name become visible.

If the API request fails — due to a network error, auth expiry, or rate limiting — an inline error message replaces the list content with the error description and a hint: "Press `R` to retry." The header and status bars remain stable during error states.

## Acceptance Criteria

### Definition of Done

- The Dashboard screen renders a "Repositories" section as the primary content area showing the authenticated user's own repositories
- Repositories are fetched via `useRepos()` from `@codeplane/ui-core`, which calls `GET /api/user/repos`
- The list is sorted by `updated_at` descending (most recently updated first), matching API default sort
- Each row displays: full_name, description (truncated), visibility indicator, star count, and relative updated_at timestamp
- `j`/`k` (and `Down`/`Up` arrow keys) move the focus cursor through the list
- `Enter` on a focused row pushes the repository overview screen onto the navigation stack with the repo's `full_name` as context
- `/` activates an inline filter input that narrows the list client-side by name or description substring match (case-insensitive)
- `Esc` while the filter input is focused clears the filter text, returns focus to the list
- The section header shows "Repositories (N)" where N is the `X-Total-Count` from the API response
- Cursor-based pagination loads the next page when the scrollbox scroll position reaches 80% of content height
- "Loading more…" is shown at the bottom of the scrollbox while the next page is being fetched
- When all pages are loaded, no pagination indicator is shown
- The empty state message "No repositories yet. Create one with `codeplane repo create`." is shown when the user has zero repositories
- A loading spinner with "Loading…" is shown in the repos section while the initial data fetch is in progress
- API errors display an inline error message with "Press `R` to retry" hint
- Auth errors (401) propagate to the app-shell-level auth error screen
- Rate limit errors (429) display the retry-after period inline

### Keyboard Interactions

- `j` / `Down`: Move focus to next repository row
- `k` / `Up`: Move focus to previous repository row
- `Enter`: Open the focused repository (push repo overview screen)
- `/`: Focus the filter input
- `Esc`: Clear filter input and return focus to list (if filter is focused)
- `G`: Jump to the last visible/loaded repository row
- `g g`: Jump to the first repository row
- `Ctrl+D`: Page down within the scrollbox
- `Ctrl+U`: Page up within the scrollbox
- `R`: Retry the last failed API request (only active in error state)
- `Tab` / `Shift+Tab`: Move focus to the next/previous dashboard section

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router
- 80×24 – 119×39 (minimum): Description column hidden. Star count hidden. Each row shows: full_name (up to 50 chars, truncated with `…`) │ visibility icon │ relative timestamp
- 120×40 – 199×59 (standard): Full layout with all columns visible. Name (40ch) + description (40ch) + visibility + stars + timestamp
- 200×60+ (large): Expanded description (80ch), name (60ch), plus default bookmark badge

### Truncation and Boundary Constraints

- Repository `full_name`: truncated with trailing `…` when exceeding column width (50/40/60 chars at min/standard/large)
- Repository `description`: truncated with trailing `…`. Max display: 40 chars (standard), 80 chars (large). Hidden at minimum
- Relative timestamps: never exceed 4 characters (e.g., "3d", "1mo", "2y")
- Star count: K-abbreviated above 999, never exceeds 7 characters
- Filter input: max 100 characters
- Maximum loaded repos in memory: 500 items (pagination cap)

### Edge Cases

- Terminal resize while scrolled: scroll position preserved relative to focused item
- Rapid `j` presses: processed sequentially, no debouncing
- Filter during pagination: client-side filter applied to all loaded items; new pages filtered as they arrive
- SSE disconnect: repos list unaffected (uses REST)
- Unicode in descriptions: truncation respects grapheme clusters

## Design

### Layout Structure

The repositories list is a section within the Dashboard screen content area using vertical flexbox:

```
<box flexDirection="column" width="100%" height="100%">
  <box flexDirection="column" flexGrow={1} minHeight={6}>
    {/* Section header */}
    <box flexDirection="row" height={1}>
      <text bold color="primary">Repositories</text>
      <text color="muted"> ({totalCount})</text>
      <box flexGrow={1} />
      <text color="muted">/ filter</text>
    </box>

    {/* Filter input — shown only when active */}
    {filterActive && (
      <box height={1}>
        <input value={filterText} onChange={setFilterText} placeholder="Filter repositories…" />
      </box>
    )}

    {/* Repository list */}
    <scrollbox flexGrow={1}>
      <box flexDirection="column">
        {filteredRepos.map(repo => (
          <box key={repo.id} flexDirection="row" height={1}
               backgroundColor={repo.id === focusedId ? "primary" : undefined}>
            <box width={nameColumnWidth}>
              <text bold={repo.id === focusedId}>{truncate(repo.full_name, nameColumnWidth)}</text>
            </box>
            {showDescription && (
              <box width={descColumnWidth}>
                <text color="muted">{truncate(repo.description, descColumnWidth)}</text>
              </box>
            )}
            <box width={2}><text>{repo.is_public ? "  " : "🔒"}</text></box>
            {showStars && (
              <box width={7}><text color="muted">★ {formatStars(repo.num_stars)}</text></box>
            )}
            <box width={4}><text color="muted">{relativeTime(repo.updated_at)}</text></box>
          </box>
        ))}
        {loadingMore && <box height={1}><text color="muted">Loading more…</text></box>}
      </box>
    </scrollbox>
  </box>
</box>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Move focus down | List focused, not in filter input |
| `k` / `Up` | Move focus up | List focused, not in filter input |
| `Enter` | Open focused repo | Repo row focused |
| `/` | Activate filter input | List focused |
| `Esc` | Clear filter / return to list | Filter input focused |
| `G` | Jump to last loaded row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` | Page down | List focused |
| `Ctrl+U` | Page up | List focused |
| `R` | Retry failed fetch | Error state displayed |
| `Tab` | Next dashboard section | Any section focused |
| `Shift+Tab` | Previous dashboard section | Any section focused |

### Responsive Column Layout

**80×24 (minimum)**: `│ full_name (50ch) │ 🔒 │ 3d │` — 2 columns visible

**120×40 (standard)**: `│ full_name (40ch) │ description (40ch) │ 🔒 │ ★ 42 │ 3d │` — All 4 columns visible

**200×60 (large)**: `│ full_name (60ch) │ description (80ch) │ 🔒 │ ★ 1.2k │ main │ 3d │` — All columns plus bookmark badge

### Data Hooks

- `useRepos()` from `@codeplane/ui-core` — returns `{ items: RepoSummary[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void }`. Calls `GET /api/user/repos` with cursor-based pagination, default page size 30
- `useTerminalDimensions()` — for responsive column layout breakpoints
- `useOnResize()` — trigger synchronous re-layout
- `useKeyboard()` — keybinding registration

### Navigation Context

When `Enter` is pressed, calls `push("repo-overview", { repo: focusedRepo.full_name })` to push the repository overview screen. Breadcrumb updates to "Dashboard > owner/repo".

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View own repos list on dashboard | ❌ | ✅ | ✅ |

- The dashboard repos list is only accessible to authenticated users. The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/user/repos` returns both public and private repositories for the authenticated user
- No elevated role (admin, org owner) is required
- Organization-owned repositories are excluded — only user-owned repositories appear

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen

### Rate Limiting

- Authenticated users: 300 requests per minute to `GET /api/user/repos`
- If 429 is returned, the repos section displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period

### Input Sanitization

- Filter input is client-side only — never sent to the API
- Repository names and descriptions rendered as plain text via `<text>` components (no injection risk)
- Deep-link flags validated at the router level

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.dashboard.repos.view` | Dashboard repos section becomes visible (initial load completes) | `total_count`, `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms` |
| `tui.dashboard.repos.open` | User presses Enter on a repo row | `repo_full_name`, `repo_is_public`, `position_in_list` (0-indexed), `was_filtered`, `filter_text_length` |
| `tui.dashboard.repos.filter` | User activates filter (presses `/`) | `total_loaded_count` |
| `tui.dashboard.repos.filter_submit` | User types in filter and matches narrow the list | `filter_text_length`, `matched_count`, `total_loaded_count` |
| `tui.dashboard.repos.paginate` | Next page of repos is loaded | `page_number`, `items_loaded_total`, `total_count` |
| `tui.dashboard.repos.error` | API request fails | `error_type` (network/auth/rate_limit/server), `http_status` |
| `tui.dashboard.repos.retry` | User presses R to retry after error | `error_type`, `retry_success` |
| `tui.dashboard.repos.empty` | Empty state rendered (zero repos) | — |

### Success Indicators

- **Dashboard load completion rate**: percentage of TUI sessions where the repos list successfully loads (target: >98%)
- **Repo open rate**: percentage of dashboard views where the user opens at least one repository (target: >60%)
- **Filter adoption**: percentage of dashboard views where the user activates the filter (target: >15% for users with >10 repos)
- **Pagination depth**: average number of pages loaded
- **Error rate**: percentage of dashboard loads that result in error state (target: <2%)
- **Retry success rate**: percentage of retry attempts that succeed (target: >80%)
- **Time to first interaction**: time from dashboard render to first j/k/Enter keypress

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | Repos section loaded | `total_count`, `items_in_first_page`, `load_time_ms` |
| `info` | Repo opened from dashboard | `repo_full_name`, `position_in_list` |
| `info` | Pagination page loaded | `page_number`, `items_count`, `total_loaded` |
| `warn` | API error on repos fetch | `http_status`, `error_message` (no token) |
| `warn` | Rate limited on repos fetch | `retry_after_seconds` |
| `warn` | Filter returned zero results | `filter_text`, `total_loaded_count` |
| `debug` | Filter activated | `filter_text_length` |
| `debug` | Filter cleared | — |
| `debug` | Scroll position updated | `scroll_percent`, `focused_index`, `total_loaded` |
| `debug` | Pagination trigger reached | `scroll_percent`, `items_loaded`, `has_more` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press R to retry" |
| Network timeout on pagination | Data hook timeout (30s) | "Loading more…" replaced with inline error. Existing items remain visible. R retries |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline error: "Rate limited. Retry in Ns." R retries after waiting |
| Server error (500) | API returns 5xx | Inline error with generic message. R retries |
| Terminal resize during initial load | `useOnResize` fires during fetch | Fetch continues. Renders at new size when data arrives |
| Terminal resize during scrolled list | `useOnResize` fires | Column widths recalculate. Focused row stays visible |
| SSE disconnect | Status bar shows disconnected | Repos list unaffected (uses REST, not SSE) |
| Empty response with non-zero total_count | items.length === 0 && totalCount > 0 | Treated as end-of-pagination |
| Malformed API response | JSON parse error | Error state rendered with generic error message |
| React error boundary triggered | Error boundary catches | Error screen per app-shell error boundary |

### Failure Modes

- **Total fetch failure**: Error state shown in repos section. Other dashboard sections may still load independently
- **Partial pagination failure**: Existing loaded items remain visible. Only "Loading more…" area shows error
- **Memory pressure**: 500-item pagination cap prevents unbounded memory growth. Virtual scrolling limits render tree

## Verification

### Test File: `e2e/tui/dashboard.test.ts`

### Terminal Snapshot Tests

- **dashboard-repos-list-initial-load**: Launch TUI → snapshot matches golden file showing "Repositories (N)" header, list rows with repo names, visibility icons, and timestamps. Focused row highlighted
- **dashboard-repos-list-empty-state**: Launch TUI for user with zero repos → snapshot shows centered "No repositories yet. Create one with `codeplane repo create`." in muted color
- **dashboard-repos-list-loading-state**: Launch TUI with slow API → snapshot shows "Loading…" centered in repos section
- **dashboard-repos-list-error-state**: Launch TUI with failing API → snapshot shows error message in red with "Press R to retry"
- **dashboard-repos-list-focused-row**: Launch TUI → first repo row highlighted with primary color
- **dashboard-repos-list-private-indicator**: Launch TUI with public/private repos → private repos show 🔒 icon
- **dashboard-repos-list-filter-active**: Press `/` → filter input appears with placeholder "Filter repositories…"
- **dashboard-repos-list-filter-results**: Press `/`, type "api" → list shows only matching repos
- **dashboard-repos-list-filter-no-results**: Press `/`, type "zzzznonexistent" → "No matching repositories" shown
- **dashboard-repos-list-pagination-loading**: Scroll to bottom → "Loading more…" visible
- **dashboard-repos-list-star-count**: Launch at standard size → star counts visible (★ 0, ★ 42, ★ 1.2k)
- **dashboard-repos-list-header-total-count**: Launch TUI → header shows "Repositories (N)" with correct count

### Keyboard Interaction Tests

- **dashboard-repos-j-moves-down**: Press `j` → focus moves from first to second repo row
- **dashboard-repos-k-moves-up**: Press `j` then `k` → focus returns to first repo row
- **dashboard-repos-k-at-top-no-wrap**: Press `k` on first row → focus stays (no wrap-around)
- **dashboard-repos-j-at-bottom-no-wrap**: Navigate to last row, press `j` → focus stays (triggers pagination if more)
- **dashboard-repos-down-arrow-moves-down**: Press Down → same as `j`
- **dashboard-repos-up-arrow-moves-up**: Press Down then Up → same as `k`
- **dashboard-repos-enter-opens-repo**: Press Enter → repo overview pushed, breadcrumb shows "Dashboard > owner/repo"
- **dashboard-repos-enter-on-second-item**: Press `j` then Enter → second repo's overview pushed
- **dashboard-repos-slash-activates-filter**: Press `/` → filter input focused
- **dashboard-repos-filter-narrows-list**: Press `/`, type "my-proj" → only matching repos shown
- **dashboard-repos-filter-case-insensitive**: Press `/`, type "MY-PROJ" → case-insensitive match
- **dashboard-repos-esc-clears-filter**: Press `/`, type "test", Esc → filter cleared, full list shown
- **dashboard-repos-G-jumps-to-bottom**: Press `G` → focus on last loaded row
- **dashboard-repos-gg-jumps-to-top**: Press `G` then `g g` → focus on first row
- **dashboard-repos-ctrl-d-page-down**: Press `Ctrl+D` → focus moves down by half visible height
- **dashboard-repos-ctrl-u-page-up**: Press `Ctrl+D` then `Ctrl+U` → focus returns
- **dashboard-repos-R-retries-on-error**: Error state, press `R` → fetch retried
- **dashboard-repos-R-no-op-when-loaded**: Press `R` when loaded → no effect
- **dashboard-repos-tab-moves-to-next-section**: Press `Tab` → focus moves to orgs section
- **dashboard-repos-shift-tab-moves-to-prev-section**: On orgs, press `Shift+Tab` → focus returns to repos
- **dashboard-repos-j-in-filter-input**: Press `/` then `j` → 'j' typed in filter, NOT list navigation
- **dashboard-repos-q-in-filter-input**: Press `/` then `q` → 'q' typed in filter, NOT quit
- **dashboard-repos-pagination-on-scroll**: Scroll to 80% → next page loaded
- **dashboard-repos-rapid-j-presses**: Send `j` 10 times → focus moves 10 rows sequentially
- **dashboard-repos-enter-during-loading**: Enter during initial load → no-op

### Responsive Tests

- **dashboard-repos-80x24-layout**: Terminal 80×24 → name + visibility + timestamp only. No description or stars
- **dashboard-repos-80x24-truncation**: Terminal 80×24, long name → truncated with `…`
- **dashboard-repos-120x40-layout**: Terminal 120×40 → all columns visible
- **dashboard-repos-120x40-description-truncation**: Terminal 120×40, long description → truncated with `…`
- **dashboard-repos-200x60-layout**: Terminal 200×60 → expanded columns plus bookmark badge
- **dashboard-repos-resize-standard-to-min**: Resize 120×40 → 80×24 → columns collapse immediately
- **dashboard-repos-resize-min-to-standard**: Resize 80×24 → 120×40 → columns appear
- **dashboard-repos-resize-preserves-focus**: Resize at any breakpoint → focused row preserved
- **dashboard-repos-resize-during-filter**: Resize with filter active → filter stays, results re-rendered
- **dashboard-repos-filter-input-80x24**: Terminal 80×24, press `/` → filter renders at full width

### Integration Tests

- **dashboard-repos-auth-expiry**: 401 on fetch → app-shell auth error screen, not inline error
- **dashboard-repos-rate-limit-429**: 429 with Retry-After: 30 → "Rate limited. Retry in 30s."
- **dashboard-repos-network-error**: Network timeout → inline error with "Press R to retry"
- **dashboard-repos-pagination-complete**: 45 repos (page size 30) → both pages load, all 45 visible
- **dashboard-repos-500-items-cap**: 600 repos → only 500 loaded, "Showing first 500 of 600"
- **dashboard-repos-enter-then-q-returns**: Enter on repo, then q → dashboard with scroll/focus preserved
- **dashboard-repos-goto-from-repo-and-back**: Open repo, `g d` → dashboard with repos list intact
- **dashboard-repos-server-error-500**: 500 on fetch → inline error with "Press R to retry"
- **dashboard-repos-concurrent-section-load**: Dashboard sections load independently; repos section shows its own loading/error/data

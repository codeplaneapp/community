# TUI_REPO_LIST_SCREEN

Specification for TUI_REPO_LIST_SCREEN.

## High-Level User POV

The Repository List screen is the dedicated, full-screen repository browser in the Codeplane TUI. It is reached via the `g r` go-to keybinding from any screen, by selecting "Repository List" in the command palette, or by launching the TUI with `codeplane tui --screen repos`. It occupies the entire content area between the header bar and status bar, giving repositories the full vertical and horizontal space of the terminal — unlike the Dashboard's repos section, which shares space with organizations, starred repos, and the activity feed.

This screen serves as the comprehensive repository exploration surface. It displays the authenticated user's repositories — both personal and organization-owned — with rich metadata columns and powerful filtering. The screen is designed for the user who wants to find, browse, and navigate into any repository they have access to, not just the compact "recent repos" view on the Dashboard.

The screen opens with a header row showing the title "Repositories" in bold primary color, followed by the total repository count in parentheses (e.g., "Repositories (87)"). Below the title is a persistent sort/filter toolbar that shows the current sort order and provides access to filtering by visibility, owner, and text search. The filter toolbar is always visible — unlike the Dashboard repos list where the filter input only appears when the user presses `/`. On this screen, pressing `/` focuses the search input within the toolbar for immediate typing.

The main content is a scrollable list of repository rows. Each row is a single line showing: the repository full name (`owner/repo`), a truncated description, a visibility indicator (🔒 for private, blank for public), the repository's primary language tag, star count, fork count, open issue count, and a relative timestamp for the last update. The focused row is highlighted with the `primary` accent color using reverse video. Navigation uses the standard vim-style `j`/`k` keys (and arrow keys) to move through the list. Pressing `Enter` on a focused repository pushes the repository overview screen onto the navigation stack.

A sort selector is accessible via `o` (order), which cycles through: "Recently updated" (default), "Name A–Z", "Name Z–A", "Most stars", "Recently created". The current sort is displayed in the toolbar and takes effect immediately, re-sorting the locally loaded items and resetting pagination if the API sort parameter changes.

Visibility filtering is accessible via `v`, which cycles through: "All" (default), "Public only", "Private only". An owner filter is accessible via `w` (whose), which cycles through: "All owners" (default), then each unique owner name found in the loaded repos. These filters compose — a user can view "Private repos by acme, sorted by most stars."

The list supports cursor-based pagination. When the user scrolls past 80% of the loaded items, the next page is fetched automatically. A "Loading more…" indicator appears at the bottom of the scrollbox during fetch. If all pages have been loaded, no indicator appears. The maximum number of repositories held in memory is 1000.

If the user has no repositories at all, the screen shows a centered empty state: "No repositories found. Create one with `codeplane repo create`." in muted color. If the user has repositories but the active filter produces zero matches, a different message is shown: "No repositories match the current filters." with a hint "Press `Esc` to clear filters."

An action bar at the bottom of the list (above the status bar) provides quick access to common operations: `c` to create a new repository (pushes the create repo form), and `s` to star/unstar the focused repository (toggles optimistically with server reconciliation).

When the terminal is at minimum size (80×24), only the essential columns are shown: full name, visibility indicator, and relative timestamp. At standard size (120×40), description, star count, and language tag columns appear. At large size (200×60+), the full column set is rendered with fork count, issue count, and default bookmark badge. The layout recalculates immediately on terminal resize, preserving the focused row.

The breadcrumb in the header bar reads "Dashboard > Repositories" since the repo list is one level deep in the navigation stack. Pressing `q` returns to the Dashboard. The screen's status bar hints show: `j/k:nav  Enter:open  /:filter  o:sort  v:visibility  c:create  q:back`.

## Acceptance Criteria

### Definition of Done

- [ ] The Repository List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g r` go-to navigation, `:repos` command palette entry, and `--screen repos` deep-link
- [ ] The breadcrumb reads "Dashboard > Repositories"
- [ ] Pressing `q` pops the screen and returns to the Dashboard (or the previous screen in the stack)
- [ ] Repositories are fetched via `useRepos()` from `@codeplane/ui-core`, calling `GET /api/user/repos` with cursor-based pagination (default page size 30)
- [ ] The list is sorted by `updated_at` descending by default
- [ ] Each row displays: `full_name`, `description` (truncated), visibility indicator, language tag, star count, fork count (standard+), issue count (large), and relative `updated_at` timestamp
- [ ] The header shows "Repositories (N)" where N is the `X-Total-Count` from the API response
- [ ] The filter toolbar is always visible below the header

### Keyboard Interactions

- [ ] `j` / `Down`: Move focus to next repository row
- [ ] `k` / `Up`: Move focus to previous repository row
- [ ] `Enter`: Open the focused repository (push repo overview screen)
- [ ] `/`: Focus the search input in the filter toolbar
- [ ] `Esc`: Clear filter text and return focus to list. If no filter is active, behave as `q` (pop screen)
- [ ] `G`: Jump to the last loaded repository row
- [ ] `g g`: Jump to the first repository row
- [ ] `Ctrl+D`: Page down within the scrollbox (half visible height)
- [ ] `Ctrl+U`: Page up within the scrollbox (half visible height)
- [ ] `R`: Retry the last failed API request (only active in error state)
- [ ] `o`: Cycle sort order (Recently updated → Name A–Z → Name Z–A → Most stars → Recently created)
- [ ] `v`: Cycle visibility filter (All → Public only → Private only)
- [ ] `w`: Cycle owner filter (All owners → owner1 → owner2 → …)
- [ ] `c`: Push the create repository form screen
- [ ] `s`: Star/unstar the focused repository (optimistic toggle)
- [ ] `Space`: Toggle row selection (for future batch actions; selected state shown with `✓` prefix)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Only name (50ch, truncated with `…`), visibility icon (2ch), and relative timestamp (4ch) shown. Filter toolbar collapses to search input only (sort/visibility labels hidden). Description, language, stars, forks, issues columns hidden
- [ ] 120×40 – 199×59 (standard): Full toolbar with sort and visibility labels. Columns: name (30ch), description (35ch), visibility (2ch), language (10ch), stars (7ch), timestamp (4ch). Fork and issue counts hidden
- [ ] 200×60+ (large): Expanded layout. Columns: name (40ch), description (60ch), visibility (2ch), language (12ch), stars (7ch), forks (7ch), issues (7ch), default bookmark (12ch), timestamp (4ch)

### Truncation and Boundary Constraints

- [ ] Repository `full_name`: truncated with trailing `…` when exceeding column width (50/30/40 chars at min/standard/large)
- [ ] Repository `description`: truncated with trailing `…`. Max display: 35 chars (standard), 60 chars (large). Hidden at minimum
- [ ] Language tag: truncated with trailing `…` at 10/12 chars. Hidden at minimum
- [ ] Relative timestamps: never exceed 4 characters (e.g., "3d", "1mo", "2y", "now")
- [ ] Star count: K-abbreviated above 999 (e.g., "★ 1.2k"), never exceeds 7 characters
- [ ] Fork count: K-abbreviated above 999 (e.g., "⑂ 1.2k"), never exceeds 7 characters
- [ ] Issue count: K-abbreviated above 999, never exceeds 7 characters
- [ ] Default bookmark name: truncated with `…` at 12 chars
- [ ] Filter/search input: max 120 characters
- [ ] Maximum loaded repos in memory: 1000 items (pagination cap)
- [ ] Total count display: abbreviated above 9999 (e.g., "10k+")

### Edge Cases

- [ ] Terminal resize while scrolled: scroll position preserved relative to focused item; column layout recalculates immediately
- [ ] Rapid `j`/`k` presses: processed sequentially without debouncing, cursor moves one row per keypress
- [ ] Filter during pagination: client-side filter applied to all loaded items; new pages are filtered as they arrive
- [ ] Sort change during pagination: locally loaded items re-sorted immediately; next page fetch uses new sort parameter
- [ ] Visibility filter change: applies to loaded items immediately; resets pagination cursor for next fetch
- [ ] SSE disconnect: repo list is unaffected (uses REST, not SSE)
- [ ] Unicode in repository names/descriptions: truncation respects grapheme clusters, never splits a multi-byte character
- [ ] Starred repo count changes server-side: optimistic toggle updates local count; server reconciliation on next fetch
- [ ] API returns repos with missing fields (null description, null language): rendered as empty/blank in those columns
- [ ] User has access to 1000+ repos: pagination cap reached, footer shows "Showing first 1000 of N" in muted text
- [ ] Concurrent navigation: if user presses `Enter` before initial load completes, the keypress is queued and processed after data arrives (or no-op if error)

## Design

### Layout Structure

The Repository List screen uses a vertical flexbox layout filling the entire content area:

```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > Repositories                │
├─────────────────────────────────────────────────┤
│ Repositories (87)                     / filter  │
│ Sort: Recently updated │ Showing: All │ Owner: — │
├─────────────────────────────────────────────────┤
│ ► acme/api-gateway  REST API gateway   ★42  3d  │
│   acme/frontend     React SPA         🔒 ★8  1w │
│   alice/dotfiles    My config files    ★2  2mo   │
│   …                                             │
│                   Loading more…                  │
├─────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:open /:filter o:sort q:back│
└─────────────────────────────────────────────────┘
```

The screen is composed of: (1) a title row with "Repositories (N)" header and filter hint, (2) a persistent filter toolbar with search input, sort label, visibility label, and owner label, (3) a column header row with bold muted labels on a `surface` background, (4) a `<scrollbox>` containing repository rows with pagination indicator, and (5) conditional empty/error states that replace the scrollbox content.

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Move focus to next row | List focused, not in search input |
| `k` / `Up` | Move focus to previous row | List focused, not in search input |
| `Enter` | Open focused repository | Repository row focused |
| `/` | Focus search input in toolbar | List focused |
| `Esc` | Clear filter and return focus to list; if no filter active, pop screen | Search input focused or list focused |
| `G` | Jump to last loaded row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` | Page down (half visible height) | List focused |
| `Ctrl+U` | Page up (half visible height) | List focused |
| `R` | Retry failed API request | Error state displayed |
| `o` | Cycle sort order | List focused, not in search input |
| `v` | Cycle visibility filter | List focused, not in search input |
| `w` | Cycle owner filter | List focused, not in search input |
| `c` | Push create repository form | List focused, not in search input |
| `s` | Star/unstar focused repository | Repository row focused |
| `Space` | Toggle row selection | Repository row focused |
| `q` | Pop screen (back to Dashboard) | Not in search input |

### Responsive Column Layout

**80×24 (minimum)**: `│ full_name (50ch) │ 🔒 │ 3d │` — Toolbar shows search input only. Column headers hidden.

**120×40 (standard)**: `│ full_name (30ch) │ description (35ch) │ 🔒 │ Lang (10ch) │ ★ 42 │ 3d │` — Full toolbar. Column headers visible.

**200×60 (large)**: `│ full_name (40ch) │ description (60ch) │ 🔒 │ TypeScript (12ch) │ ★ 1.2k │ ⑂ 23 │ # 15 │ main (12ch) │ 3d │` — All columns plus bookmark badge.

### Resize Behavior

- `useTerminalDimensions()` provides current `{ width, height }` for breakpoint calculation
- `useOnResize()` triggers synchronous re-layout when the terminal is resized
- Column widths recalculate based on the new breakpoint category
- The focused row remains focused and visible after resize
- Scroll position adjusts to keep the focused row in view
- No animation or transition during resize — single-frame re-render

### Data Hooks

- `useRepos()` from `@codeplane/ui-core` — returns `{ items: RepoSummary[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void }`. Calls `GET /api/user/repos` with cursor-based pagination, default page size 30. Accepts optional `sort` and `visibility` query parameters
- `useTerminalDimensions()` — provides terminal size for responsive breakpoint calculation
- `useOnResize()` — triggers synchronous re-layout on terminal resize
- `useKeyboard()` — registers keybinding handlers for the screen's keybinding map
- `useNavigation()` — provides `push()` for navigating to repo overview and `pop()` for back navigation
- `useUser()` — provides current user for star/unstar API calls

### Navigation Context

When `Enter` is pressed on a focused repository, calls `push("repo-overview", { repo: focusedRepo.full_name })`. Breadcrumb updates to "Dashboard > Repositories > owner/repo". When `c` is pressed, calls `push("repo-create")`. When `q` is pressed, calls `pop()` to return to the previous screen.

### Sort and Filter State

Sort and filter state is local to the screen component and is not persisted across navigation. Sort options cycle: "Recently updated" → "Name A–Z" → "Name Z–A" → "Most stars" → "Recently created". Visibility options cycle: "All" → "Public only" → "Private only". Text search is client-side substring matching on `full_name` and `description`, case-insensitive.

### Loading States

- **Initial load**: Full-height centered spinner with "Loading repositories…" text. Header and toolbar rendered immediately; only the list area shows the spinner
- **Pagination loading**: "Loading more…" text at bottom of scrollbox. Existing rows remain visible and navigable
- **Sort/filter change**: No spinner. Locally loaded items re-sort/filter immediately
- **Star toggle**: Optimistic — star count updates immediately. Reverts on failure with status bar error flash

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View repository list screen | ❌ | ✅ | ✅ |
| Open a repository | ❌ | ✅ | ✅ |
| Create a repository | ❌ | ✅ | ✅ |
| Star/unstar a repository | ❌ | ✅ | ✅ |

- The Repository List screen requires authentication. The TUI enforces authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/user/repos` returns both public and private repositories the authenticated user owns or has access to via organization membership
- No elevated role (admin, org owner) is required to view the list
- Users see only repositories they have read access to — the API enforces visibility
- Star/unstar uses `PUT /api/user/starred/:owner/:repo` and `DELETE /api/user/starred/:owner/:repo`, which require authentication but no elevated role

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to the `@codeplane/ui-core` API client as a `Bearer` token in the `Authorization` header
- Token is never displayed in the TUI, never written to logs, never included in error messages
- 401 responses propagate to the app-shell-level auth error screen with message "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- Authenticated users: 300 requests per minute to `GET /api/user/repos`
- Star/unstar endpoints: 60 requests per minute per user
- If 429 is returned, the repo list section displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period has elapsed

### Input Sanitization

- Search/filter input is client-side only — the text is never sent to the API
- Sort and visibility filter values are from a fixed enum — no user-controlled strings reach the API beyond the token
- Repository names and descriptions are rendered as plain `<text>` components (no injection vector)
- Deep-link flag `--screen repos` is validated against the router's allowlist

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repos.view` | Repository List screen mounted and initial data loaded | `total_count`, `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms`, `entry_method` (goto/palette/deeplink) |
| `tui.repos.open` | User presses Enter on a repository row | `repo_full_name`, `repo_is_public`, `position_in_list` (0-indexed), `was_filtered`, `filter_text_length`, `sort_order`, `visibility_filter` |
| `tui.repos.filter` | User focuses the search input (presses `/`) | `total_loaded_count`, `sort_order`, `visibility_filter` |
| `tui.repos.filter_apply` | Filter text changes and results narrow | `filter_text_length`, `matched_count`, `total_loaded_count` |
| `tui.repos.sort_change` | User cycles sort order (presses `o`) | `new_sort_order`, `previous_sort_order`, `total_loaded_count` |
| `tui.repos.visibility_change` | User cycles visibility filter (presses `v`) | `new_visibility`, `previous_visibility`, `matched_count` |
| `tui.repos.owner_change` | User cycles owner filter (presses `w`) | `new_owner`, `previous_owner`, `matched_count` |
| `tui.repos.paginate` | Next page of repos loaded | `page_number`, `items_loaded_total`, `total_count`, `sort_order` |
| `tui.repos.star` | User stars a repository | `repo_full_name`, `success` |
| `tui.repos.unstar` | User unstars a repository | `repo_full_name`, `success` |
| `tui.repos.create` | User presses `c` to navigate to create form | — |
| `tui.repos.error` | API request fails | `error_type` (network/auth/rate_limit/server), `http_status`, `request_type` (list/star/unstar) |
| `tui.repos.retry` | User presses `R` to retry after error | `error_type`, `retry_success` |
| `tui.repos.empty` | Empty state rendered (zero repos) | `has_filters_active` |

### Success Indicators

- **Screen load completion rate**: percentage of `tui.repos.view` events that include `load_time_ms` (vs. error events). Target: >98%
- **Repo open rate**: percentage of screen views where the user opens at least one repository. Target: >65%
- **Filter adoption**: percentage of screen views where the user activates the filter. Target: >20%
- **Sort usage**: percentage of screen views where the user changes sort order. Target: >10%
- **Visibility filter usage**: percentage of screen views where the user changes visibility. Target: >8%
- **Pagination depth**: average number of pages loaded per session
- **Error rate**: percentage of screen loads resulting in error state. Target: <2%
- **Retry success rate**: percentage of retry attempts that succeed. Target: >80%
- **Star action rate**: percentage of screen views where the user stars/unstars a repo. Target: >5%
- **Time to first interaction**: median time from `tui.repos.view` to first keypress

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | Repository list screen loaded | `total_count`, `items_in_first_page`, `load_time_ms`, `entry_method` |
| `info` | Repository opened from list | `repo_full_name`, `position_in_list` |
| `info` | Repository created (form pushed) | — |
| `info` | Repository starred/unstarred | `repo_full_name`, `action` (star/unstar), `success` |
| `info` | Pagination page loaded | `page_number`, `items_count`, `total_loaded`, `sort_order` |
| `warn` | API error on repos fetch | `http_status`, `error_message` (token redacted) |
| `warn` | Rate limited on repos fetch | `retry_after_seconds` |
| `warn` | Rate limited on star/unstar | `retry_after_seconds`, `repo_full_name` |
| `warn` | Filter returned zero results | `filter_text`, `visibility_filter`, `owner_filter`, `total_loaded_count` |
| `warn` | Pagination cap reached | `total_count`, `cap` (1000) |
| `debug` | Filter activated | `filter_text_length` |
| `debug` | Filter cleared | — |
| `debug` | Sort order changed | `new_sort_order`, `previous_sort_order` |
| `debug` | Visibility filter changed | `new_visibility`, `previous_visibility` |
| `debug` | Owner filter changed | `new_owner` |
| `debug` | Scroll position updated | `scroll_percent`, `focused_index`, `total_loaded` |
| `debug` | Pagination trigger reached | `scroll_percent`, `items_loaded`, `has_more` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error message + "Press R to retry" |
| Network timeout on pagination | Data hook timeout (30s) | "Loading more…" replaced with inline error. Existing items remain visible and navigable. `R` retries |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate." |
| Rate limited (429) | API returns 429 with Retry-After header | Inline error: "Rate limited. Retry in Ns." User presses `R` after waiting |
| Server error (500+) | API returns 5xx | Inline error with generic message: "Server error. Press R to retry." |
| Star/unstar fails | API returns non-2xx on star toggle | Optimistic update reverted. Status bar flash: "Failed to star/unstar repo_name" for 3 seconds |
| Terminal resize during initial load | `useOnResize` fires during fetch | Fetch continues uninterrupted. Renders at new size when data arrives |
| Terminal resize while scrolled | `useOnResize` fires | Column widths recalculate. Focused row stays visible. Scroll position adjusted |
| SSE disconnect | Status bar shows disconnected indicator | Repo list unaffected (uses REST, not SSE) |
| Empty response with non-zero total_count | `items.length === 0 && totalCount > 0` | Treated as end-of-pagination. No further fetches |
| Malformed API response | JSON parse error | Error state rendered with generic error message |
| React error boundary triggered | Unhandled exception in component tree | App-shell error boundary renders error screen with restart/quit options |
| Sort change during active pagination | User presses `o` during "Loading more…" | Current fetch completes; subsequent fetches use new sort. Loaded items re-sorted locally |
| Concurrent Enter + initial load | `Enter` pressed before data arrives | Keypress queued; processed after data renders, or no-op on error |

### Failure Modes

- **Total fetch failure**: Error state shown in content area. Header bar and status bar remain stable. User can press `R` to retry or `q` to go back
- **Partial pagination failure**: Existing loaded items remain visible and navigable. Only the "Loading more…" area shows the error. `R` retries the failed page
- **Star/unstar failure**: Optimistic count reverts. Status bar shows error flash. User can try again immediately
- **Memory pressure**: 1000-item pagination cap prevents unbounded memory growth
- **Sort parameter mismatch**: If locally sorted order differs from API, the next paginated page may have duplicates or gaps. Deduplication by `repo.id` prevents visual duplicates

## Verification

### Test File: `e2e/tui/repository.test.ts`

### Terminal Snapshot Tests

- **repo-list-screen-initial-load**: Navigate to repo list screen (`g r`) at 120×40 → snapshot matches golden file showing "Repositories (N)" header, filter toolbar with sort/visibility labels, column headers, list rows with repo names, descriptions, visibility icons, star counts, and timestamps. First row highlighted with primary color
- **repo-list-screen-empty-state**: Navigate to repo list for user with zero repos → snapshot shows centered "No repositories found. Create one with `codeplane repo create`." in muted color
- **repo-list-screen-loading-state**: Navigate to repo list with slow API response → snapshot shows "Loading repositories…" centered in content area with toolbar already visible
- **repo-list-screen-error-state**: Navigate to repo list with failing API → snapshot shows error message in red with "Press R to retry" below
- **repo-list-screen-focused-row**: Navigate to repo list → first repo row highlighted with primary accent color, remaining rows in default colors
- **repo-list-screen-private-indicator**: Navigate to repo list with mix of public/private repos → private repos show 🔒 icon, public repos show blank in visibility column
- **repo-list-screen-filter-active**: Press `/` → search input in toolbar gains focus, cursor visible in input
- **repo-list-screen-filter-results**: Press `/`, type "api" → list shows only repos matching "api" in name or description
- **repo-list-screen-filter-no-results**: Press `/`, type "zzzznonexistent" → "No repositories match the current filters." with "Press Esc to clear filters." hint shown
- **repo-list-screen-pagination-loading**: Scroll to bottom of list → "Loading more…" visible at bottom of scrollbox
- **repo-list-screen-star-count**: At 120×40 → star counts visible in column format (★ 0, ★ 42, ★ 1.2k)
- **repo-list-screen-header-total-count**: Navigate to repo list → header shows "Repositories (N)" with correct total count
- **repo-list-screen-sort-label**: At 120×40, default view → toolbar shows "Sort: Recently updated"
- **repo-list-screen-sort-cycle**: Press `o` → toolbar updates to "Sort: Name A–Z"; press `o` again → "Sort: Name Z–A"
- **repo-list-screen-visibility-label**: Press `v` → toolbar updates to "Showing: Public only"
- **repo-list-screen-column-headers**: At 120×40 → column header row visible with "Name", "Description", "V", "Lang", "Stars", "Age"
- **repo-list-screen-pagination-cap**: User with 1500 repos, scroll to load all → "Showing first 1000 of 1500" visible at bottom
- **repo-list-screen-breadcrumb**: Navigate via `g r` → header bar breadcrumb reads "Dashboard > Repositories"
- **repo-list-screen-language-tag**: At 120×40, repos with language set → language tag column shows "TypeScript", "Go", "Rust" etc.
- **repo-list-screen-selected-row**: Press `Space` on a row → "✓" prefix appears on that row

### Keyboard Interaction Tests

- **repo-list-j-moves-down**: Press `j` → focus moves from first to second repo row
- **repo-list-k-moves-up**: Press `j` then `k` → focus returns to first repo row
- **repo-list-k-at-top-no-wrap**: Press `k` on first row → focus stays on first row (no wrap-around)
- **repo-list-j-at-bottom-no-wrap**: Navigate to last loaded row, press `j` → focus stays (triggers pagination if more pages exist)
- **repo-list-down-arrow-moves-down**: Press Down arrow → same behavior as `j`
- **repo-list-up-arrow-moves-up**: Press Up arrow → same behavior as `k`
- **repo-list-enter-opens-repo**: Press Enter on focused row → repo overview screen pushed, breadcrumb updates to "Dashboard > Repositories > owner/repo"
- **repo-list-enter-on-second-item**: Press `j` then Enter → second repo's overview screen pushed
- **repo-list-slash-focuses-search**: Press `/` → search input in toolbar gains focus
- **repo-list-filter-narrows-list**: Press `/`, type "my-proj" → only matching repos shown in list
- **repo-list-filter-case-insensitive**: Press `/`, type "MY-PROJ" → matches repos with "my-proj" in name (case-insensitive)
- **repo-list-esc-clears-filter**: Press `/`, type "test", press Esc → filter cleared, full list restored, focus returns to list
- **repo-list-esc-pops-when-no-filter**: Without any active filter, press Esc → screen pops, returns to Dashboard
- **repo-list-G-jumps-to-bottom**: Press `G` → focus moves to last loaded row
- **repo-list-gg-jumps-to-top**: Press `G` then `g g` → focus returns to first row
- **repo-list-ctrl-d-page-down**: Press `Ctrl+D` → focus moves down by half the visible list height
- **repo-list-ctrl-u-page-up**: Press `Ctrl+D` then `Ctrl+U` → focus returns to original position
- **repo-list-R-retries-on-error**: API fails, error state shown, press `R` → fetch retried
- **repo-list-R-no-op-when-loaded**: Data loaded successfully, press `R` → no effect
- **repo-list-o-cycles-sort**: Press `o` → sort changes to "Name A–Z", list re-sorted. Press `o` again → "Name Z–A"
- **repo-list-v-cycles-visibility**: Press `v` → visibility changes to "Public only", private repos hidden. Press `v` → "Private only"
- **repo-list-w-cycles-owner**: User has repos under "alice" and "acme" → press `w` → filters to "alice" only. Press `w` → "acme" only. Press `w` → "All owners"
- **repo-list-c-opens-create-form**: Press `c` → create repository form screen pushed
- **repo-list-s-stars-repo**: Focus on an unstarred repo, press `s` → star count increments by 1 optimistically
- **repo-list-s-unstars-repo**: Focus on a starred repo, press `s` → star count decrements by 1 optimistically
- **repo-list-space-selects-row**: Press `Space` → focused row shows "✓" prefix. Press `Space` again → "✓" removed
- **repo-list-q-pops-screen**: Press `q` → returns to Dashboard
- **repo-list-j-in-search-input**: Press `/` then `j` → 'j' typed in search input, NOT list navigation
- **repo-list-o-in-search-input**: Press `/` then `o` → 'o' typed in search input, NOT sort cycle
- **repo-list-q-in-search-input**: Press `/` then `q` → 'q' typed in search input, NOT screen pop
- **repo-list-pagination-on-scroll**: Scroll to 80% of loaded content → next page fetch triggered
- **repo-list-rapid-j-presses**: Send `j` 15 times in rapid succession → focus moves 15 rows sequentially, no dropped keypresses
- **repo-list-enter-during-loading**: Press Enter during initial loading state → no-op (no crash, no navigation)
- **repo-list-sort-then-filter**: Press `o` to sort by name, then `/` to filter → filtered results sorted alphabetically
- **repo-list-filter-then-sort**: Press `/` type "api", Esc, then `o` → matching repos re-sorted by new order

### Responsive Tests

- **repo-list-80x24-layout**: Terminal 80×24 → only name + visibility + timestamp columns visible. No description, stars, or language. Toolbar shows search input only
- **repo-list-80x24-truncation**: Terminal 80×24, repo with long name (60+ chars) → name truncated with `…` at 50 chars
- **repo-list-80x24-no-column-headers**: Terminal 80×24 → column header row hidden
- **repo-list-80x24-toolbar-collapsed**: Terminal 80×24 → sort and visibility labels hidden from toolbar
- **repo-list-120x40-layout**: Terminal 120×40 → name, description, visibility, language, stars, and timestamp columns visible. Full toolbar with sort and visibility labels
- **repo-list-120x40-description-truncation**: Terminal 120×40, long description (80+ chars) → truncated with `…` at 35 chars
- **repo-list-120x40-column-headers**: Terminal 120×40 → column header row visible with "Name", "Description", "V", "Lang", "Stars", "Age"
- **repo-list-200x60-layout**: Terminal 200×60 → all columns visible including forks, issues, and bookmark badge
- **repo-list-200x60-full-toolbar**: Terminal 200×60 → toolbar shows search, sort, visibility, and owner filter labels
- **repo-list-resize-standard-to-min**: Resize from 120×40 → 80×24 → description and star columns collapse immediately
- **repo-list-resize-min-to-standard**: Resize from 80×24 → 120×40 → description and star columns appear
- **repo-list-resize-preserves-focus**: Resize at any breakpoint → focused row remains focused and visible
- **repo-list-resize-during-filter**: Resize with filter active → filter text preserved, results re-rendered at new column layout
- **repo-list-resize-during-loading**: Resize while initial load spinner is showing → spinner re-centers, no crash
- **repo-list-search-input-80x24**: Terminal 80×24, press `/` → search input renders at full toolbar width

### Integration Tests

- **repo-list-auth-expiry**: 401 on initial fetch → app-shell auth error screen rendered, not inline error
- **repo-list-rate-limit-429**: 429 with `Retry-After: 30` → inline error shows "Rate limited. Retry in 30s."
- **repo-list-network-error**: Network timeout on initial fetch → inline error with "Press R to retry"
- **repo-list-pagination-complete**: 45 repos total (page size 30) → both pages load, all 45 visible in list
- **repo-list-1000-items-cap**: 1500 repos → only 1000 loaded, "Showing first 1000 of 1500" footer visible
- **repo-list-enter-then-q-returns**: Enter on repo, then `q` → repo list restored with same scroll position and focus
- **repo-list-goto-from-repo-and-back**: Open repo from list, then `g r` → repo list screen rendered fresh (no stale state)
- **repo-list-server-error-500**: 500 on fetch → inline error with "Press R to retry"
- **repo-list-star-optimistic-update**: Press `s` to star → count increments immediately, then server confirms
- **repo-list-star-revert-on-failure**: Press `s` to star, server returns error → count reverts, status bar shows error flash
- **repo-list-sort-resets-pagination**: Change sort order while on page 3 → loaded items re-sorted, next pagination uses new sort parameter
- **repo-list-visibility-filter-api**: Change visibility to "Public only" → only public repos shown; changing to "Private only" → only private repos shown
- **repo-list-deep-link-entry**: Launch `codeplane tui --screen repos` → repo list screen rendered, breadcrumb shows "Dashboard > Repositories"
- **repo-list-command-palette-entry**: Press `:`, type "repos", press Enter → repo list screen rendered
- **repo-list-concurrent-navigation**: Rapidly press `g r`, `g d`, `g r` → final state is repo list screen with no intermediate screen artifacts
- **repo-list-create-and-return**: Press `c`, complete form, return → repo list refreshes with newly created repo

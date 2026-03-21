# TUI_DASHBOARD_STARRED_REPOS

Specification for TUI_DASHBOARD_STARRED_REPOS.

## High-Level User POV

The starred repositories panel occupies the bottom-left quadrant of the Dashboard screen in the Codeplane TUI. It shows the developer's bookmarked projects — repositories they have explicitly starred — providing fast keyboard-driven access to projects they care about but may not own. For a developer working across many teams and open-source projects, this panel is how they keep their most-referenced repositories one `Enter` press away.

When the TUI launches, the dashboard loads four panels concurrently. The starred repos panel fetches the authenticated user's starred repositories sorted by the time they were starred (most recent first). Each row in the list displays the repository's full name (`owner/name`), a truncated description, a visibility badge (`◆` for public, `◇` for private), and the repository's star count. The focused row is highlighted with the `primary` accent color (ANSI 33, blue), and the user navigates through the list using `j`/`k` or the arrow keys. Pressing `Enter` on a focused repository pushes the repository overview screen onto the navigation stack.

The panel shares the dashboard grid with three other panels: Recent Repositories (top-left), Organizations (top-right), and Activity Feed (bottom-right). The user cycles focus between panels using `Tab` and `Shift+Tab`, which follow the order: Recent Repos → Organizations → Starred Repos → Activity Feed. When the starred repos panel is focused, its border highlights in the `primary` color while other panels' borders remain in the `border` color (ANSI 240). At standard terminal sizes (120×40), descriptions and star counts are fully visible. At the minimum 80×24 size, the dashboard collapses to a single-column layout where only one panel is visible at a time — indicated by a `[3/4]` badge in the panel header — and `Tab` cycles between them.

When the user presses `/` while the starred repos panel is focused, a filter input appears at the top of the panel. Typing narrows the list client-side by matching repository names and descriptions (case-insensitive substring match). The filter shows a match count (`N of M`). Pressing `Esc` clears the filter and returns focus to the list. Pressing `Enter` in the filter input selects the first matching item and closes the filter.

The panel supports cursor-based pagination: when the user scrolls past 80% of the loaded items, the next page is fetched. A "Loading more…" indicator appears at the bottom of the scrollbox during the fetch. If the user has no starred repositories, the panel displays "No starred repositories" in muted text. If the fetch fails, the panel shows an inline error message with "Press `R` to retry."

The starred repos panel is not a standalone screen — it is a section of the Dashboard and inherits all of the Dashboard's global keybindings (`?` for help, `:` for command palette, `q` to quit, `g d` to return to dashboard). Within the panel, keyboard interactions match the standard list navigation model used across all TUI list views.

## Acceptance Criteria

### Definition of Done

- [ ] The Dashboard screen renders a "Starred Repos" panel in the bottom-left quadrant of the two-column grid (at standard+ terminal sizes)
- [ ] The panel title renders as "Starred Repos" in bold `primary` color (ANSI 33)
- [ ] Starred repositories are fetched via `useStarredRepos()` from `@codeplane/ui-core`, which calls `GET /api/user/starred`
- [ ] The list is sorted by starring time descending (most recently starred first), matching the API's `ORDER BY s.created_at DESC`
- [ ] Each row displays: `full_name`, truncated `description`, visibility badge (`◆`/`◇`), and `num_stars` count
- [ ] The focused row is highlighted with `primary` accent color (ANSI 33) using reverse video or background color
- [ ] `j`/`k` (and `Down`/`Up` arrow keys) move the focus cursor through the list
- [ ] `Enter` on a focused row pushes the repository overview screen onto the navigation stack with the repo's `full_name` as context
- [ ] `/` activates an inline filter input that narrows the list client-side by name or description substring match (case-insensitive)
- [ ] `Esc` while the filter input is focused clears the filter text and returns focus to the list
- [ ] `Enter` in the filter input selects the first matching item and closes the filter
- [ ] The filter shows match count: "N of M" where N is matching items and M is total loaded items
- [ ] Cursor-based pagination loads the next page when the scrollbox scroll position reaches 80% of content height
- [ ] "Loading more…" is shown at the bottom of the scrollbox while the next page is being fetched
- [ ] When all pages are loaded, no pagination indicator is shown
- [ ] The empty state message "No starred repositories" is shown in `muted` color (ANSI 245) when the user has zero starred repos
- [ ] A loading spinner with "Loading…" is shown in the panel while the initial data fetch is in progress
- [ ] API errors display an inline error message in `error` color (ANSI 196) with "Press `R` to retry" hint
- [ ] Auth errors (401) propagate to the app-shell-level auth error screen
- [ ] Rate limit errors (429) display the retry-after period inline: "Rate limited. Retry in {Retry-After}s."
- [ ] Loads the first page (20 items) on mount; additional pages load on scroll-to-end
- [ ] Maximum of 200 items loaded (10 pages × 20 items) to cap memory usage

### Keyboard Interactions

- `j` / `Down`: Move focus to next starred repo row (when panel is focused, not in filter input)
- `k` / `Up`: Move focus to previous starred repo row
- `Enter`: Open the focused starred repository (push repo overview screen)
- `/`: Focus the filter input within the starred repos panel
- `Esc`: Clear filter input and return focus to list (when filter is focused)
- `G`: Jump to the last loaded starred repo row
- `g g`: Jump to the first starred repo row
- `Ctrl+D`: Page down within the scrollbox (half panel height)
- `Ctrl+U`: Page up within the scrollbox (half panel height)
- `R`: Retry the last failed API request (only active in error state)
- `Tab` / `Shift+Tab`: Move focus to the next/previous dashboard panel
- `h` / `l`: Move focus left/right between columns (when two-column layout is active)

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by the global layout
- 80×24 – 119×39 (minimum): Single-column stacked layout. Only one panel visible at a time. Shows `[3/4]` indicator. Each row: `full_name` (60ch) │ visibility badge │ star count. Description hidden
- 120×40 – 199×59 (standard): Two-column grid. Full layout with name (40ch) + description (30ch) + visibility + stars
- 200×60+ (large): Expanded columns: name (50ch) + description (60ch) + visibility + stars + default bookmark badge

### Truncation and Boundary Constraints

- Repository `full_name`: truncated with trailing `…` (60/40/50 chars at min/standard/large)
- Repository `description`: truncated with trailing `…` (hidden at minimum, 30ch standard, 60ch large)
- Star count: K-abbreviated above 999, M-abbreviated above 999,999. Never exceeds 5 characters
- Visibility badge: exactly 1 character, never truncated
- Filter input: max 100 characters
- Maximum loaded items: 200 (pagination cap)
- 0 stars: renders empty (no count), not "★ 0"

### Edge Cases

- Terminal resize while scrolled: scroll position preserved relative to focused item
- Rapid `j`/`k` presses: processed sequentially, no debouncing
- Filter during pagination: client-side filter applied to all loaded items; new pages filtered as they arrive
- SSE disconnect: panel unaffected (uses REST)
- Unicode in names/descriptions: truncation respects grapheme clusters
- Focus memory: switching away and back preserves cursor position
- Concurrent panel loading: failure in this panel does not block other panels
- Filter with no results: displays "No matching repositories" in muted color

## Design

### Layout Structure

At standard terminal size (120×40), the starred repos panel occupies the bottom-left cell of the dashboard's 2×2 grid:

```
┌──────────── Recent Repos ──────────────┬──────────── Organizations ─────────────┐
│ ...                                    │ ...                                    │
├──────────── Starred Repos ─────────────┼──────────── Activity Feed ─────────────┤
│ popular/framework                ◆ 2k  │ ● alice opened #42 in org/repo    2h  │
│   The most popular framework...        │ ✓ bob merged LR !17 in team/app   3h  │
│ tools/cli-utils                  ◆ 89  │ ✗ CI failed on org/repo           5h  │
│ ...                                    │ ...                                   │
└────────────────────────────────────────┴───────────────────────────────────────┘
```

At minimum (80×24), single-column stacked: "Starred Repos [3/4]" with name + visibility + star count only.

### Component Tree

The panel reuses the shared `ReposList` sub-component and is wrapped in `DashboardPanel`:

```jsx
<DashboardPanel title="Starred Repos" focused={focusedPanel === 2} index={2} total={4} isCompact={isCompact}>
  {loading && !items.length && <text color="muted">Loading…</text>}
  {error && <><text color="error">{error.message}</text><text color="muted">Press R to retry</text></>}
  {!loading && !error && items.length === 0 && <text color="muted">No starred repositories</text>}
  {items.length > 0 && (
    <>
      {filterActive && <input value={filterQuery} onChange={setFilterQuery} placeholder="Filter..." />}
      <scrollbox flexGrow={1} onScrollEnd={loadNextPage}>
        {filteredRepos.map((repo, i) => (
          <box key={repo.id}>
            <box flexDirection="row" justifyContent="space-between" height={1}>
              <text fg={33} attributes={i === focusedIndex ? REVERSE : undefined}>
                {truncate(repo.full_name, maxNameWidth)}
              </text>
              <box flexDirection="row" gap={1}>
                <text fg={repo.is_public ? 34 : 245}>{repo.is_public ? "◆" : "◇"}</text>
                {repo.num_stars > 0 && <text fg={245}>{formatStarCount(repo.num_stars)}</text>}
              </box>
            </box>
            {!isCompact && repo.description && <text fg={245}>  {truncate(repo.description, maxDescWidth)}</text>}
          </box>
        ))}
        {loadingMore && <text color="muted">Loading more…</text>}
      </scrollbox>
    </>
  )}
</DashboardPanel>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------||
| `j` / `Down` | Move focus down | Panel focused, not in filter |
| `k` / `Up` | Move focus up | Panel focused, not in filter |
| `Enter` | Open focused repo / select first filter match | Repo focused / filter focused |
| `/` | Activate filter | Panel focused |
| `Esc` | Clear filter, return to list | Filter focused |
| `G` | Jump to last row | Panel focused |
| `g g` | Jump to first row | Panel focused |
| `Ctrl+D` | Page down | Panel focused |
| `Ctrl+U` | Page up | Panel focused |
| `R` | Retry fetch | Error state |
| `Tab` / `Shift+Tab` | Next/prev panel | Any state |
| `h` / `l` | Left/right column | Two-column layout |

### Data Hooks

| Hook | Source | Data |
|------|--------|------|
| `useStarredRepos()` | `@codeplane/ui-core` | `{ items: RepoSummary[], totalCount, loading, error, loadMore, hasMore, retry }` |
| `useTerminalDimensions()` | OpenTUI | `{ width, height }` |
| `useOnResize()` | OpenTUI | Resize callback for synchronous re-layout |
| `useKeyboard()` | OpenTUI | Keybinding registration |

### API Contract

`GET /api/user/starred?page=N&per_page=20` → `RepoSummary[]` with `X-Total-Count` header. Sorted by `stars.created_at DESC`.

### RepoSummary Shape

```typescript
interface RepoSummary {
  id: number; owner: string; full_name: string; name: string;
  description: string; is_public: boolean; num_stars: number;
  default_bookmark: string; created_at: string; updated_at: string;
}
```

### Star Count Formatting

0 → (empty), 1-999 → literal, 1k-999k → K-abbreviated (1.5k), 1M+ → M-abbreviated

### Navigation

`Enter` calls `push("repo-overview", { repo: focusedRepo.full_name })`. Breadcrumb: "Dashboard > owner/repo".

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View own starred repos on dashboard | ❌ | ✅ | ✅ |

- The dashboard (and the starred repos panel) is only accessible to authenticated users. The TUI requires authentication at bootstrap; unauthenticated sessions never reach the dashboard.
- `GET /api/user/starred` returns all repositories the authenticated user has starred, including both public and private repositories the user has access to. Visibility is enforced server-side.
- No elevated role (admin, org owner) is required.
- The starred repos panel displays repositories owned by any user or organization — not limited to the authenticated user's own repositories.

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at TUI bootstrap.
- Token passed as `Authorization: Bearer {token}` header.
- Token is never displayed, logged, or included in error messages.
- 401 responses propagate to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- Token is not refreshable from the TUI.

### Rate Limiting

- Authenticated users: 300 requests per minute to `GET /api/user/starred`.
- 429 responses display "Rate limited. Retry in {Retry-After}s." inline in error color.
- No auto-retry on rate limit. User presses `R` after the period elapses.
- Pagination requests count toward the same rate limit budget.

### Input Sanitization

- Filter input is client-side only — never sent to the API.
- Repository names and descriptions rendered as plain `<text>` (no terminal escape injection risk).
- `full_name` and `description` are treated as opaque strings; no HTML/markdown parsing.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.dashboard.starred.view` | Panel data loads successfully | `total_count`, `items_in_first_page`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms` |
| `tui.dashboard.starred.open` | User presses Enter on a row | `repo_full_name`, `repo_is_public`, `position_in_list`, `was_filtered`, `filter_text_length` |
| `tui.dashboard.starred.filter` | User activates filter (presses `/`) | `total_loaded_count` |
| `tui.dashboard.starred.filter_applied` | Filter narrows results | `filter_text_length`, `matched_count`, `total_loaded_count` |
| `tui.dashboard.starred.paginate` | Next page loaded | `page_number`, `items_loaded_total`, `total_count` |
| `tui.dashboard.starred.error` | API request fails | `error_type`, `http_status` |
| `tui.dashboard.starred.retry` | User presses R to retry | `error_type`, `retry_success` |
| `tui.dashboard.starred.empty` | Empty state rendered | — |
| `tui.dashboard.starred.focused` | Panel gains focus | `method`, `previous_panel` |

### Common Event Properties

- `session_id`, `user_id` (hashed), `timestamp` (ISO 8601), `tui_version`, `terminal_width`, `terminal_height`

### Success Indicators

- **Starred repos load rate**: >98% of dashboard loads successfully load starred repos panel
- **Starred repo open rate**: >30% of dashboard views where user opens at least one starred repo (for users with >0 starred)
- **Filter adoption**: >10% of views where user activates filter (for users with >5 starred repos)
- **Empty state rate**: percentage seeing "No starred repositories" (informational, drives feature awareness)
- **Pagination depth**: average pages loaded (most users expected on page 1)
- **Error rate**: <2% of panel loads result in error state
- **Time to interaction**: median time from panel render to first keypress

## Observability

### Logging

| Level | Event | Message Format |
|-------|-------|---------------|
| `info` | Panel loaded | `Dashboard/StarredRepos: loaded [count={n}] [total={total}] [ms={ms}]` |
| `info` | Repo opened | `Dashboard/StarredRepos: opened [repo={full_name}] [position={i}]` |
| `info` | Page loaded | `Dashboard/StarredRepos: paginated [page={n}] [items={count}] [total_loaded={total}]` |
| `warn` | Fetch failed | `Dashboard/StarredRepos: fetch failed [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Dashboard/StarredRepos: rate limited [retry_after={s}s]` |
| `warn` | Filter empty | `Dashboard/StarredRepos: filter empty [query_length={n}] [total_loaded={total}]` |
| `debug` | Filter activated/cleared | `Dashboard/StarredRepos: filter activated/cleared` |
| `debug` | Scroll/pagination trigger | `Dashboard/StarredRepos: scroll [percent] / pagination trigger` |
| `debug` | Focus gained/lost | `Dashboard/StarredRepos: focused/unfocused` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error | Detection | Recovery |
|-------|-----------|----------|
| Network timeout (initial) | 30s timeout | Loading → error + "Press R to retry" |
| Network timeout (pagination) | 30s timeout | "Loading more…" → inline error. Existing items stay. R retries |
| Auth expired (401) | API 401 | Propagate to app-shell auth error screen |
| Rate limited (429) | API 429 + Retry-After | "Rate limited. Retry in Ns." R retries after wait |
| Server error (5xx) | API 500/502/503 | Generic error + R to retry |
| Resize during load | useOnResize fires | Fetch continues; renders at new size |
| Resize during scroll | useOnResize fires | Columns recalculate; focused row stays visible |
| Layout breakpoint change | Width crosses 120 | Panel transitions stacked↔grid; focus preserved |
| SSE disconnect | Status bar indicator | Panel unaffected (REST only) |
| Malformed response | JSON parse error | "Unexpected response. Press R to retry." |
| React error boundary | Render crash | "Panel error — press R to retry" (other panels continue) |

### Failure Modes

- **Panel crash**: Per-panel error boundary catches; other panels unaffected
- **Total fetch failure**: Error in starred repos only; other panels independent
- **Partial pagination failure**: Loaded items remain visible; only pagination area shows error
- **Memory pressure**: 200-item cap + virtual scrolling prevents unbounded growth
- **Stale data**: 60-second cache TTL; navigation away and back triggers fresh fetch after expiry

## Verification

### Test File: `e2e/tui/dashboard.test.ts`

All tests left failing if backend features are unimplemented — never skipped.

### Terminal Snapshot Tests (15)

- **SNAP-STAR-001**: Panel renders at 120x40 with items — header, rows, badges, star counts
- **SNAP-STAR-002**: Empty state — "No starred repositories" in muted color
- **SNAP-STAR-003**: Loading state — "Loading…" centered in panel
- **SNAP-STAR-004**: Error state — red error message + "Press R to retry"
- **SNAP-STAR-005**: Focused row highlight — first row with primary reverse video
- **SNAP-STAR-006**: Visibility badges — ◆ green for public, ◇ muted for private
- **SNAP-STAR-007**: Filter active — input with placeholder and "5 of 5" count
- **SNAP-STAR-008**: Filter results — only matching repos shown, "2 of 3"
- **SNAP-STAR-009**: Filter no results — "No matching repositories"
- **SNAP-STAR-010**: Pagination loading — "Loading more…" at scrollbox bottom
- **SNAP-STAR-011**: Star count formatting — (empty), 5, 999, 1.5k, 25k
- **SNAP-STAR-012**: Unfocused border — gray (ANSI 240) when another panel focused
- **SNAP-STAR-013**: Rate limit display — "Rate limited. Retry in 30s."
- **SNAP-STAR-014**: 80x24 minimum — single column, [3/4] header, no descriptions
- **SNAP-STAR-015**: 200x60 large — expanded columns, bookmark badge

### Keyboard Interaction Tests (28)

- **KEY-STAR-001–006**: j/k/Down/Up navigation, no-wrap at boundaries
- **KEY-STAR-007–008**: Enter opens correct repo, breadcrumb updates
- **KEY-STAR-009–013**: Filter activation, narrowing, case-insensitive, Esc clear, Enter selects
- **KEY-STAR-014–017**: G/gg jump, Ctrl+D/U page
- **KEY-STAR-018–019**: R retry on error, no-op when loaded
- **KEY-STAR-020–021**: Tab/Shift+Tab panel cycling
- **KEY-STAR-022–023**: j/q in filter input types characters, not navigation/quit
- **KEY-STAR-024**: Rapid j presses — 10 j's = focus on row 11
- **KEY-STAR-025**: Enter during loading — no-op
- **KEY-STAR-026**: h/l column navigation
- **KEY-STAR-027**: Pagination triggers at 80% scroll
- **KEY-STAR-028**: Focus preserved across panel switches

### Responsive Tests (10)

- **RESP-STAR-001–002**: 80x24 layout and truncation
- **RESP-STAR-003–004**: 120x40 layout and description truncation
- **RESP-STAR-005**: 200x60 expanded columns
- **RESP-STAR-006–007**: Resize between breakpoints (collapse/expand)
- **RESP-STAR-008**: Resize preserves focus
- **RESP-STAR-009**: Resize during active filter
- **RESP-STAR-010**: Filter input at 80x24

### Integration Tests (13)

- **INT-STAR-001**: 401 auth expiry propagates to app shell
- **INT-STAR-002**: 429 rate limit display
- **INT-STAR-003**: Network error with retry recovery
- **INT-STAR-004**: Full pagination (45 items across 2 pages)
- **INT-STAR-005**: 200-item pagination cap
- **INT-STAR-006**: Navigate to repo and back preserves state
- **INT-STAR-007**: g d returns with cached data
- **INT-STAR-008**: Server 500 error display
- **INT-STAR-009**: Concurrent panel loading independence
- **INT-STAR-010**: Empty user state
- **INT-STAR-011**: Single starred repo edge case
- **INT-STAR-012**: Starred repo with no description
- **INT-STAR-013**: Sort order is by starring time, not name/update

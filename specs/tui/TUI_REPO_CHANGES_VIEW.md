# TUI_REPO_CHANGES_VIEW

Specification for TUI_REPO_CHANGES_VIEW.

## High-Level User POV

The changes view is the second tab (`2`) in the repository detail screen. It presents a complete, scrollable list of all jj changes in the repository — the jj equivalent of a commit log, but anchored in jj's stable Change ID model rather than mutable commit hashes. When the user presses `2` from the repository tab bar (or cycles to the Changes tab with `Tab`), the content area below the tab bar replaces with a vertically scrolling list of changes, each rendered as a compact row showing the essential information a developer needs to orient themselves in a repository's history.

Each change row displays four pieces of information at standard terminal width: the short Change ID (the first 8 characters of the stable change identifier, rendered in the `primary` accent color), the first line of the change description (or `(no description)` in muted text if the description is empty), the author name, and a relative timestamp. Two status indicators appear inline: a conflict marker (`⚠` in `warning` color) if the change has unresolved conflicts, and an empty marker (`∅` in `muted` color) if the change is empty (makes no file modifications). These indicators are positioned immediately after the Change ID, before the description, so the user sees status at a glance without scanning to the end of the line.

The list is sorted with the most recent changes at the top, matching the natural reading order for a developer checking what happened recently. The focused row is highlighted with reverse-video styling. The user navigates with `j`/`k` (or arrow keys) to move between changes, and presses `Enter` on the focused change to push a change detail screen showing the full description, metadata, parent change IDs, and a link to view the diff. Pressing `d` on the focused change opens the diff viewer directly, bypassing the detail screen — a shortcut for the common case of wanting to see exactly what a change modifies.

The user can filter changes by typing `/` to activate the search input, which performs a client-side fuzzy filter across Change IDs, descriptions, and author names. The filter applies incrementally as the user types, narrowing the visible list in real-time. Pressing `Esc` clears the filter and returns focus to the list. A sort toggle is available via `o`, cycling through three orderings: **Newest first** (default), **Oldest first**, and **Author A→Z**.

At the bottom of the list, cursor-based pagination loads additional changes as the user scrolls. When the scroll position reaches 80% of the loaded content, the next page is fetched automatically. A "Loading more…" indicator appears at the bottom of the list during the fetch. The total change count is displayed in the content header: "42 changes" (or "1 change" for the singular case). When a filter is active, the count updates to show the filtered count: "12 of 42 changes".

The changes view also shows parent-child relationships through indentation when the terminal is wide enough (120+ columns). Changes that share the same parent are grouped visually, and the `parent_change_ids` field is used to render a simple tree-line indicator (`│`, `├`, `└`) in the left margin. At minimum terminal width (80 columns), the tree indicators are hidden and the list renders as a flat sequence to conserve horizontal space.

Conflict changes are visually distinct: the entire row is rendered with a subtle `warning` background tint, making it immediately obvious which changes in the history are in a conflicted state. Empty changes use a dimmed row style. This visual treatment means the user can scan the list rapidly and spot problematic changes without reading every line.

If the API request fails, the content area shows an error message in red with "Press `R` to retry." If the repository has zero changes (e.g., a newly initialized empty repository), the content area shows a centered message: "No changes yet." in muted text. The tab bar and status bar remain stable and interactive in all error and empty states.

## Acceptance Criteria

### Definition of Done

- The changes view renders when the Changes tab (index 1, key `2`) is active in the repository tab bar
- Change data is fetched via `useChanges(owner, repo)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/changes`
- The response uses cursor-based pagination with a default page size of 50
- Each change row displays: short change_id (8 chars), conflict indicator (if `has_conflict`), empty indicator (if `is_empty`), first line of description, author_name, and relative timestamp
- Changes are listed newest-first by default
- The focused row is highlighted with reverse-video
- `Enter` on a focused change pushes `change-detail` screen with `{ repo, change_id }`
- `d` on a focused change pushes the diff screen with `{ repo, change_id }`
- `/` activates the filter input with fuzzy matching across change_id, description, and author_name
- `Esc` from filter input clears the filter and returns focus to the list
- `o` cycles sort order: Newest first → Oldest first → Author A→Z → Newest first
- The content header shows total count ("N changes") or filtered count ("M of N changes")
- Pagination triggers automatically at 80% scroll depth
- "Loading more…" shown at list bottom during page fetch
- "No changes yet." shown when the repository has zero changes
- Error states show inline error with "Press `R` to retry"
- 401 errors propagate to the app-shell auth error screen
- The changes view is unmounted when switching away to another tab
- Scroll position and filter state are not preserved when switching tabs (content remounts fresh)

### Keyboard Interactions

- `j` / `Down`: Move focus to next change row
- `k` / `Up`: Move focus to previous change row
- `Enter`: Open change detail screen for focused change
- `d`: Open diff viewer for focused change
- `/`: Activate search/filter input
- `Esc`: Clear filter (if active) or pop screen (if no filter)
- `o`: Cycle sort order
- `G`: Jump to last loaded change
- `g g`: Jump to first change
- `Ctrl+D`: Page down (half visible height)
- `Ctrl+U`: Page up (half visible height)
- `Space`: Toggle selection on focused change (multi-select for future bulk actions)
- `R`: Retry failed fetch (only active in error state)
- `?`: Show help overlay with changes view keybindings
- `q`: Pop screen (return to previous via tab navigation parent)

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by app-shell router
- 80×24 – 119×39 (minimum): Flat list layout. Columns: change_id (8), status indicators (2), description (remaining width minus 20), timestamp (6). Author name hidden. Tree indicators hidden. Description truncated with `…`
- 120×40 – 199×59 (standard): Full list layout. Columns: tree indicator (3), change_id (8), status indicators (2), description (remaining width minus 40), author_name (16), timestamp (10). Tree indicators visible
- 200×60+ (large): Expanded layout. Columns: tree indicator (3), change_id (12 — showing more of the ID), status indicators (2), description (remaining width minus 55), author_name (20), timestamp (16 — full relative date). Extra vertical spacing between rows

### Truncation and Boundary Constraints

- `change_id`: 8 characters at minimum/standard width, 12 characters at large width. Never truncated — fixed-width column
- `description`: First line only. Truncated with trailing `…` when exceeding column width. Maximum stored description length: 64KB (API limit). Empty descriptions shown as `(no description)` in muted text
- `author_name`: Truncated with trailing `…` at 16 characters (standard) or 20 characters (large). Hidden entirely at minimum width
- Relative timestamp: "3d", "1mo", "2y" format at minimum width (max 4 chars). "3 days ago", "1 month ago" at standard/large (max 16 chars)
- Status indicators: `⚠` (conflict) and `∅` (empty) — exactly 1 character each. Both can appear simultaneously
- Tree indicators: `│`, `├`, `└`, ` ` — exactly 1 character each, prefixed with 2 spaces for nesting depth
- Maximum changes loaded in memory: 1,000 (20 pages × 50 per page). "Load more" stops after this cap; status bar shows "Showing 1,000 of N changes"
- Filter input: maximum 128 characters
- Total change count display: abbreviated K/M format above 999 (e.g., "1.2k changes")

### Edge Cases

- Terminal resize while scrolled: Scroll position preserved relative to focused item index, not pixel offset. Layout recalculates synchronously
- Terminal resize from standard to minimum while tree indicators visible: Tree indicators hidden immediately, list re-layouts as flat
- Rapid `j`/`k` presses: Processed sequentially with no debouncing. Focus advances one row per keypress
- Filter with zero results: List shows "No changes match filter." in muted text. Focus returns to filter input
- Filter with special characters: All printable characters are valid in the filter input. Regex metacharacters are escaped (treated as literals)
- Change with multiline description: Only the first line is shown in the list. Full description is visible in the detail screen
- Change with empty string description: Shown as `(no description)` in muted text
- Change with extremely long first line (>500 chars): Truncated to column width with `…`
- Repository with exactly 1 change: Header shows "1 change" (singular)
- Repository with 0 changes: Content shows "No changes yet." centered
- Repository with >1,000 changes: Pagination stops at 1,000. Message shown in footer
- Change ID collision in short form: Rows are keyed on full change_id. User presses `Enter` to see full ID in detail
- Conflict + empty change: Both `⚠` and `∅` indicators shown
- API returns 404 for private repo: Error message: "Repository not found." with "Press `q` to go back."
- Pagination fetch failure: "Failed to load more. Press `R` to retry." at list bottom. Existing loaded changes remain visible
- SSE disconnect: Changes view uses REST, not SSE. Unaffected by SSE state

## Design

### Layout Structure

The changes view occupies the full content area within the repository tab container:

```
┌─────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo                ● SYNCED  │
├─────────────────────────────────────────────────────────┤
│ owner/repo                           PUBLIC     ★ 42    │
├─────────────────────────────────────────────────────────┤
│ 1:Bookmarks [2:Changes] 3:Code 4:Conflicts 5:OpLog ... │
├─────────────────────────────────────────────────────────┤
│ 42 changes                          Sort: Newest first  │
│ ╭───────────────────────────────────────────────────────╮
│ │ wqnwkozp ⚠  Fix auth token refresh     alice    3d  ││
│ │ ├ yzmlkxop     Add retry logic          alice    3d  ││
│ │ └ rtpvksqn     Update error handler     alice    3d  ││
│ │ kpqwmstn     Refactor API client        bob      5d  ││
│ │ lmnoxyzt ∅  (no description)            carol    1w  ││
│ │ ...                                                   ││
│ │                                     Loading more…     ││
│ ╰───────────────────────────────────────────────────────╯
├─────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:detail  d:diff  /:filter  q:back   │
└─────────────────────────────────────────────────────────┘
```

### Component Structure (OpenTUI)

```jsx
<box flexDirection="column" flexGrow={1}>
  {/* Content header */}
  <box flexDirection="row" justifyContent="space-between" height={1} paddingX={1}>
    <text color="muted">
      {isFiltered
        ? `${filteredCount} of ${totalCount} changes`
        : `${totalCount} ${totalCount === 1 ? "change" : "changes"}`}
    </text>
    <text color="muted">Sort: {sortLabel}</text>
  </box>

  {/* Filter input (conditionally rendered) */}
  {filterActive && (
    <box height={1} paddingX={1}>
      <input label="Filter" value={filterQuery} onChange={setFilterQuery}
        placeholder="Type to filter by ID, description, or author…" maxLength={128} />
    </box>
  )}

  {/* Change list */}
  <scrollbox flexGrow={1} onScrollEnd={loadNextPage}>
    <box flexDirection="column">
      {filteredChanges.length === 0 && !isLoading && (
        <box justifyContent="center" alignItems="center" flexGrow={1}>
          <text color="muted">
            {filterActive ? "No changes match filter." : "No changes yet."}
          </text>
        </box>
      )}
      {filteredChanges.map((change, index) => (
        <box key={change.change_id} flexDirection="row" height={1} paddingX={1}
          inverse={index === focusedIndex}
          backgroundColor={change.has_conflict && index !== focusedIndex ? "warning_bg" : undefined}
          dimColor={change.is_empty && index !== focusedIndex}>
          {showTreeIndicators && <box width={3}><text color="border">{change._treeGlyph}</text></box>}
          <box width={changeIdWidth}><text color="primary" bold>{change.change_id.slice(0, changeIdWidth)}</text></box>
          <box width={2}>
            {change.has_conflict && <text color="warning">⚠</text>}
            {change.is_empty && <text color="muted">∅</text>}
          </box>
          <box flexGrow={1} flexShrink={1}>
            <text color={change.description ? undefined : "muted"} wrap="truncate">
              {firstLine(change.description) || "(no description)"}
            </text>
          </box>
          {showAuthor && <box width={authorWidth}><text color="muted">{truncate(change.author_name, authorWidth)}</text></box>}
          <box width={timestampWidth}><text color="muted">{relativeTime(change.timestamp)}</text></box>
        </box>
      ))}
      {isLoadingMore && <box height={1} justifyContent="flex-end" paddingX={1}><text color="muted">Loading more…</text></box>}
      {reachedCap && <box height={1} justifyContent="center" paddingX={1}><text color="muted">Showing {loadedCount} of {totalCount} changes</text></box>}
      {paginationError && <box height={1} justifyContent="center" paddingX={1}><text color="error">Failed to load more. Press R to retry.</text></box>}
    </box>
  </scrollbox>
</box>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------||
| `j` / `Down` | Move focus to next change | List focused, not at end |
| `k` / `Up` | Move focus to previous change | List focused, not at start |
| `Enter` | Open change detail screen | Change focused |
| `d` | Open diff for focused change | Change focused |
| `/` | Activate filter input | List focused |
| `Esc` | Clear filter / pop screen | Filter active → clear; else pop |
| `o` | Cycle sort order | List focused |
| `G` | Jump to last loaded change | List focused |
| `g g` | Jump to first change | List focused |
| `Ctrl+D` | Page down (half visible height) | List focused |
| `Ctrl+U` | Page up (half visible height) | List focused |
| `Space` | Toggle selection on focused change | List focused |
| `R` | Retry failed fetch | Error state displayed |
| `?` | Show help overlay | Always |
| `q` | Pop screen (go back) | Always |

### Responsive Column Layout

**80×24 (minimum):** No tree indicators. No author column. Short timestamps (4 chars). Description fills remaining width.

**120×40 (standard):** Tree indicators visible (3 chars). Author column (16 chars). Full relative timestamps (10 chars). Standard change_id (8 chars).

**200×60 (large):** Extended change_id (12 chars). Author column (20 chars). "N days ago" timestamps (16 chars). Extra row padding.

### Data Hooks

- `useChanges(owner, repo, { sort, cursor, limit })` from `@codeplane/ui-core` — returns `{ data: ChangeResponse[], total: number, nextCursor: string | null, isLoading: boolean, isLoadingMore: boolean, error: Error | null, retry: () => void, loadMore: () => void }`. Calls `GET /api/repos/:owner/:repo/changes?sort={sort}&cursor={cursor}&limit=50`
- `useTerminalDimensions()` — for responsive column layout and tree indicator visibility
- `useOnResize()` — trigger synchronous re-layout on terminal resize
- `useKeyboard()` — keybinding registration for list navigation, filter, sort, and actions
- `useNavigation()` — for `push()` to change detail and diff screens

### Navigation Context

Receives `repo` from parent tab container. `Enter` → `push("change-detail", { repo, change_id })`. `d` → `push("diff", { repo, change_id })`.

### Sort Order Cycling

`o` cycles: Newest first (default, `sort=newest`) → Oldest first (`sort=oldest`) → Author A→Z (`sort=author`) → Newest first. Changing sort resets cursor, refetches from page 1, resets focus to index 0.

### Tree Indicator Logic

Tree indicators show parent-child relationships from `parent_change_ids`. Glyphs: `├` (branch), `└` (terminal), `│` (continuation), ` ` (no children). Depth capped at 1 level. Only rendered when terminal width ≥120 and sort is "Newest first".

### Filter Behavior

`/` activates filter input. Client-side fuzzy match across change_id, description, author_name. Case-insensitive. Matched substrings highlighted bold. `Esc` clears and returns focus to list. Filter not preserved across tab switches.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (no access) | Read-Only | Member | Admin | Owner |
|--------|-----------|---------------------------|-----------|--------|-------|-------|
| View public repo changes | ❌ (TUI requires auth) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View private repo changes | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Open change detail | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Open change diff | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- Private repositories return 404 to users without read access (does not leak existence)
- The changes view is read-only — no write actions are available from this screen
- All data is fetched via REST (no SSE subscriptions on this view)

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to the app-shell auth error screen

### Rate Limiting

- Authenticated users: 5,000 requests per hour to `GET /api/repos/:owner/:repo/changes` (platform-wide rate limit)
- Each page load counts as 1 request. At 50 changes per page and 1,000 change cap, maximum 20 requests to fully paginate
- Rapid tab switching that mounts and unmounts ChangesView: previous fetch cancelled via AbortController, new fetch issued. No request accumulation
- If 429 is returned: "Rate limited. Retry in {Retry-After}s." shown inline. No auto-retry
- Sort changes and filter are client-side operations on loaded data — no additional API requests

### Input Sanitization

- Filter query is used for client-side fuzzy matching only — never sent to the API
- Repository `owner` and `repo` are parsed from navigation context and validated against `^[a-zA-Z0-9_.-]+$`
- Change IDs come from the API response, not user input
- No user-generated content is written to the server from this screen

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.changes.view` | Changes tab loads successfully | `repo_full_name`, `repo_id`, `total_changes`, `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms`, `tree_indicators_visible` |
| `tui.repo.changes.open_detail` | User presses `Enter` on a change | `repo_full_name`, `change_id`, `has_conflict`, `is_empty`, `focused_index`, `total_loaded` |
| `tui.repo.changes.open_diff` | User presses `d` on a change | `repo_full_name`, `change_id`, `has_conflict`, `is_empty`, `focused_index` |
| `tui.repo.changes.filter` | User types in filter input | `repo_full_name`, `filter_query_length`, `result_count`, `total_loaded` |
| `tui.repo.changes.filter_clear` | User presses `Esc` to clear filter | `repo_full_name`, `filter_query_length`, `result_count` |
| `tui.repo.changes.sort` | User presses `o` to change sort | `repo_full_name`, `from_sort`, `to_sort` |
| `tui.repo.changes.paginate` | Next page of changes loads | `repo_full_name`, `page_number`, `loaded_count`, `total_count`, `load_time_ms` |
| `tui.repo.changes.scroll` | User scrolls within the list | `repo_full_name`, `scroll_depth_percent`, `method` (j_k/ctrl_d_u/G_gg) |
| `tui.repo.changes.error` | API request fails | `repo_full_name`, `error_type` (network/not_found/auth/rate_limit/server), `http_status` |
| `tui.repo.changes.retry` | User presses `R` to retry | `repo_full_name`, `error_type`, `retry_success` |
| `tui.repo.changes.pagination_cap` | User reaches the 1,000 change cap | `repo_full_name`, `total_count` |

### Common Event Properties

All events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `viewer_id`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Changes tab load completion rate | >98% | % of Changes tab activations that result in a successful data load |
| Change detail navigation rate | >40% | % of Changes tab views where the user opens at least one change detail |
| Diff shortcut adoption | >20% | % of change-level navigations that use `d` (diff) instead of `Enter` (detail) |
| Filter usage rate | >15% | % of Changes tab views where the user activates the filter |
| Sort usage rate | >10% | % of Changes tab views where the user changes the sort order |
| Pagination depth | Median ≤2 pages | How many pages users typically load (indicates whether default page size is sufficient) |
| Error rate | <2% | % of Changes tab loads that fail |
| Time to first interaction | <2s | Median time from tab activation to first keypress |
| Conflict visibility | Track | % of Changes tab views in repos that have conflicted changes |

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|--------|
| `info` | Changes loaded | `repo_full_name`, `load_time_ms`, `total_count`, `page_size`, `has_more` |
| `info` | Change detail navigated | `repo_full_name`, `change_id`, `method` (enter/d) |
| `info` | Sort changed | `repo_full_name`, `from_sort`, `to_sort` |
| `info` | Filter activated | `repo_full_name`, `query_length`, `result_count` |
| `warn` | API error on changes fetch | `repo_full_name`, `http_status`, `error_message` (no token) |
| `warn` | Rate limited on changes fetch | `repo_full_name`, `retry_after_seconds` |
| `warn` | Pagination fetch failed | `repo_full_name`, `cursor`, `http_status`, `error_message` |
| `warn` | Pagination cap reached | `repo_full_name`, `loaded_count`, `total_count` |
| `debug` | Focus moved | `focused_index`, `change_id`, `list_length` |
| `debug` | Scroll position updated | `scroll_percent`, `content_height`, `viewport_height` |
| `debug` | Resize triggered | `old_dimensions`, `new_dimensions`, `tree_indicators_changed` |
| `debug` | Filter query updated | `query`, `result_count` |
| `debug` | Page fetched | `cursor`, `returned_count`, `total_loaded` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press R to retry" |
| Repository not found (404) | API returns 404 | Error: "Repository not found." + "Press `q` to go back." |
| Private repo, no access (404) | API returns 404 | Same as above — indistinguishable by design |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline: "Rate limited. Retry in Ns." R retries after waiting |
| Server error (500) | API returns 5xx | Inline error with generic message + R to retry |
| Pagination fetch failure | Hook returns error on loadMore | "Failed to load more. Press R to retry." at list bottom. Loaded changes remain visible |
| Pagination fetch timeout | 30s timeout on subsequent page | Same as pagination failure |
| Terminal resize during fetch | `useOnResize` fires during API call | Fetch continues. Renders at new size when data arrives |
| Terminal resize while scrolled | `useOnResize` fires | Layout recalculates. Focus preserved on same change by index. Column widths update |
| Terminal resize hides tree indicators | Width drops below 120 | Tree column removed. List re-layouts as flat immediately |
| Filter input during pagination fetch | User types `/` while loading more | Filter applies to currently loaded changes. Pagination continues in background |
| Malformed API response | JSON parse error | Error state with generic message + R to retry |
| React error boundary triggered | Error boundary catches | Per-tab error screen. Tab bar remains interactive |
| SSE disconnect | Status bar shows disconnected | Changes view unaffected (uses REST, not SSE) |
| AbortController cancellation on tab switch | Previous fetch cancelled | Silent cancellation. No error displayed. No side effects |

### Failure Modes

- **Total fetch failure**: Error state shown in content area. Tab bar remains stable and interactive. `q` still navigates back. Other tabs still accessible
- **Pagination failure**: Loaded changes remain visible and navigable. "Failed to load more" message at bottom. `R` retries the failed page. Focus stays on current change
- **Filter produces zero results during loading**: "No changes match filter." shown. If more pages load and produce matches, the list populates
- **Memory pressure from 1,000 loaded changes**: Scrollbox virtualizes offscreen rows. Only visible rows plus a buffer of 20 rows above/below are mounted
- **Stale data after tab switch**: Changes view remounts fresh on each tab activation. No stale cache. No cache invalidation needed

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`repo-changes-initial-load`** — Navigate to a repo with 10 changes at 120×40. Press `2`. Snapshot. Assert: tab bar shows Changes active. Content header shows "10 changes". List shows 10 rows with change_id, description, author, timestamp columns.
2. **`repo-changes-empty-repo`** — Navigate to a repo with 0 changes. Press `2`. Snapshot. Assert: "No changes yet." centered in content area. Header shows "0 changes".
3. **`repo-changes-conflict-highlight`** — Navigate to a repo where change at index 2 has `has_conflict: true`. Press `2`. Snapshot. Assert: conflict row shows `⚠` indicator and warning background tint.
4. **`repo-changes-empty-change`** — Navigate to a repo where change at index 3 has `is_empty: true`. Press `2`. Snapshot. Assert: empty change row shows `∅` indicator and dimmed text.
5. **`repo-changes-conflict-and-empty`** — Navigate to a repo with a change that has both `has_conflict: true` and `is_empty: true`. Press `2`. Snapshot. Assert: both `⚠` and `∅` indicators visible.
6. **`repo-changes-no-description`** — Navigate to a repo with a change having empty description. Press `2`. Snapshot. Assert: description column shows "(no description)" in muted text.
7. **`repo-changes-focused-row`** — Navigate to changes view. Snapshot. Assert: first row rendered with reverse-video (focused).
8. **`repo-changes-tree-indicators-120col`** — Navigate to changes view at 120×40 with parent-child changes. Snapshot. Assert: `├`, `└`, `│` tree glyphs visible in left margin.
9. **`repo-changes-no-tree-80col`** — Navigate to changes view at 80×24. Snapshot. Assert: no tree indicators visible. Flat list layout.
10. **`repo-changes-loading-state`** — Navigate to changes view with slow API. Snapshot before data arrives. Assert: loading spinner in content area. Tab bar shows Changes active.
11. **`repo-changes-error-state`** — Navigate to changes view with failing API (500). Snapshot. Assert: error message in red with "Press R to retry".
12. **`repo-changes-404-state`** — Navigate to changes view for nonexistent repo. Snapshot. Assert: "Repository not found." with "Press `q` to go back."
13. **`repo-changes-loading-more`** — Scroll to bottom of first page (50 changes). Snapshot. Assert: "Loading more…" indicator at bottom.
14. **`repo-changes-pagination-cap`** — Load 1,000 changes (pagination cap). Snapshot. Assert: "Showing 1,000 of N changes" message at bottom.
15. **`repo-changes-filter-active`** — Press `/`, type "auth". Snapshot. Assert: filter input visible with "auth" query. List shows only changes matching "auth". Count header shows "M of N changes".
16. **`repo-changes-filter-no-results`** — Press `/`, type "zzzzzzz". Snapshot. Assert: "No changes match filter." shown.
17. **`repo-changes-sort-label`** — Default state. Snapshot. Assert: "Sort: Newest first" in content header. Press `o`. Snapshot. Assert: "Sort: Oldest first". Press `o`. Snapshot. Assert: "Sort: Author A→Z".
18. **`repo-changes-breadcrumb`** — Navigate to changes view. Snapshot. Assert: header breadcrumb shows "… > owner/repo".
19. **`repo-changes-status-bar-hints`** — Navigate to changes view. Snapshot. Assert: status bar shows "j/k:navigate  Enter:detail  d:diff  /:filter  q:back".

#### Keyboard Interaction Tests

20. **`repo-changes-j-moves-focus-down`** — On changes view with focus at index 0. Press `j`. Assert: focus at index 1.
21. **`repo-changes-k-moves-focus-up`** — Focus at index 2. Press `k`. Assert: focus at index 1.
22. **`repo-changes-k-at-top-noop`** — Focus at index 0. Press `k`. Assert: focus remains at index 0.
23. **`repo-changes-j-at-bottom-noop`** — Focus at last loaded change. Press `j`. Assert: focus remains at last change.
24. **`repo-changes-enter-opens-detail`** — Focus on change with ID "wqnwkozp". Press `Enter`. Assert: change detail screen pushed.
25. **`repo-changes-d-opens-diff`** — Focus on change with ID "wqnwkozp". Press `d`. Assert: diff screen pushed.
26. **`repo-changes-slash-activates-filter`** — Press `/`. Assert: filter input focused.
27. **`repo-changes-filter-narrows-list`** — Press `/`, type "fix". Assert: list shows only changes with "fix" in change_id, description, or author_name.
28. **`repo-changes-filter-esc-clears`** — Press `/`, type "fix", press `Esc`. Assert: filter cleared. Full list restored. Focus returns to list.
29. **`repo-changes-filter-highlight-match`** — Press `/`, type "auth". Assert: "auth" substring in matching rows rendered with bold styling.
30. **`repo-changes-o-cycles-sort`** — Press `o`. Assert sort is "Oldest first". Press `o`. Assert sort is "Author A→Z". Press `o`. Assert sort is "Newest first".
31. **`repo-changes-sort-resets-focus`** — Focus at index 5. Press `o`. Assert: focus reset to index 0.
32. **`repo-changes-G-jumps-to-bottom`** — Press `G`. Assert: focus on last loaded change.
33. **`repo-changes-gg-jumps-to-top`** — Press `G`, then `g g`. Assert: focus on first change.
34. **`repo-changes-ctrl-d-page-down`** — Press `Ctrl+D`. Assert: focus advances by half visible height.
35. **`repo-changes-ctrl-u-page-up`** — Press `Ctrl+D`, then `Ctrl+U`. Assert: focus returns to original position.
36. **`repo-changes-space-toggles-selection`** — Focus on change at index 0. Press `Space`. Assert: selected. Press `Space` again. Assert: deselected.
37. **`repo-changes-R-retries-on-error`** — In error state. Press `R`. Assert: fetch retried.
38. **`repo-changes-R-noop-when-loaded`** — Successfully loaded. Press `R`. Assert: no effect.
39. **`repo-changes-q-pops-screen`** — Press `q`. Assert: returns to previous screen.
40. **`repo-changes-esc-pops-when-no-filter`** — No filter active. Press `Esc`. Assert: screen pops.
41. **`repo-changes-esc-clears-filter-first`** — Filter active with query "fix". Press `Esc`. Assert: filter cleared, screen NOT popped.
42. **`repo-changes-rapid-j-presses`** — Send `j` 15 times. Assert: focus at index 15.
43. **`repo-changes-rapid-sort-toggle`** — Press `o` 3 times rapidly. Assert: sort returns to "Newest first".
44. **`repo-changes-question-mark-help`** — Press `?`. Assert: help overlay shows changes view keybindings.

#### Responsive Tests

45. **`repo-changes-80x24-layout`** — 80×24. Navigate to changes view. Snapshot. Assert: no tree indicators. No author column. Short timestamps.
46. **`repo-changes-80x24-truncation`** — 80×24 with long descriptions. Snapshot. Assert: descriptions truncated with `…`.
47. **`repo-changes-120x40-layout`** — 120×40. Navigate to changes view. Snapshot. Assert: tree indicators visible. Author column present. Full timestamps.
48. **`repo-changes-200x60-layout`** — 200×60. Navigate to changes view. Snapshot. Assert: 12-char change IDs. 20-char author names. Full timestamps.
49. **`repo-changes-resize-120-to-80`** — Start at 120×40 with focus at index 3. Resize to 80×24. Assert: tree indicators disappear. Author hidden. Focus preserved at index 3.
50. **`repo-changes-resize-80-to-120`** — Start at 80×24. Resize to 120×40. Assert: tree indicators appear. Author column visible. Focus preserved.
51. **`repo-changes-resize-preserves-filter`** — At 120×40 with filter "auth" active. Resize to 80×24. Assert: filter still active.
52. **`repo-changes-resize-during-load`** — Start loading at 120×40. Resize to 80×24 during fetch. Assert: data renders at new size.
53. **`repo-changes-resize-below-minimum`** — At 80×24. Resize to 60×20. Assert: "terminal too small". Resize back. Assert: changes view restored.

#### Integration Tests

54. **`repo-changes-auth-expiry`** — 401 on changes fetch. Assert: app-shell auth error screen.
55. **`repo-changes-rate-limit-429`** — 429 with Retry-After: 30. Assert: "Rate limited. Retry in 30s."
56. **`repo-changes-network-error`** — Network timeout. Assert: inline error with "Press R to retry".
57. **`repo-changes-server-error-500`** — 500 on fetch. Assert: inline error with "Press R to retry".
58. **`repo-changes-pagination-continues`** — Load first page (50 changes). Scroll to 80%. Assert: second page triggers. List grows to 100.
59. **`repo-changes-pagination-error-recovery`** — First page loads. Second page fails. Assert: error at bottom. Press `R`. Assert: second page loads.
60. **`repo-changes-tab-switch-unmounts`** — On changes view with filter active. Press `1`. Press `2`. Assert: remounted fresh. Filter cleared.
61. **`repo-changes-sort-refetches`** — On changes view. Press `o`. Assert: new fetch with `sort=oldest`. List reorders.
62. **`repo-changes-abort-on-tab-switch`** — Start loading (slow API). Press `1` before data. Assert: no error. Bookmarks loads normally.
63. **`repo-changes-deep-link`** — Launch with `--screen repo --repo owner/repo --tab changes`. Assert: changes tab active.
64. **`repo-changes-concurrent-filter-and-paginate`** — Filter active. Scroll triggers pagination. Assert: new page loads. Filter re-applied.
65. **`repo-changes-enter-navigates-then-back`** — Press `Enter` on change at index 3. Detail screen. Press `q`. Assert: changes view with focus at index 3.

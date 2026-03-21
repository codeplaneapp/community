# TUI_WORKFLOW_CACHE_VIEW

Specification for TUI_WORKFLOW_CACHE_VIEW.

## High-Level User POV

The Workflow Cache View screen gives developers full visibility into their repository's workflow cache storage directly from the terminal. It is the TUI equivalent of the web UI's cache management page, providing a keyboard-driven interface to browse, inspect, filter, and clear cached artifacts produced by workflow runs. The screen is reached by navigating to a repository's workflow section and pressing `a` (caches) from the workflow list or run list, by typing `:caches` in the command palette, or by deep-linking with `codeplane tui --screen workflow-caches --repo owner/repo`.

When the screen loads, the developer sees a vertically structured layout divided into two logical sections. The top section is a statistics banner showing aggregate cache usage for the repository at a glance: total cache count, total storage used (formatted as human-readable bytes, e.g., "142.3 MB"), the repository quota with a visual usage bar rendered using Unicode braille/block characters (e.g., `████████░░ 78%`), maximum single-archive size limit, default TTL, and the most recent cache hit timestamp. This gives the developer an immediate sense of how much cache budget is consumed and whether eviction pressure is approaching.

Below the statistics banner is the cache entry list — a scrollable table of individual cache entries. Each row displays the cache key (the primary identifier developers set in their workflow definitions), the bookmark/branch name it was created on, the status (finalized or pending), the compressed size in human-readable bytes, the hit count, the time since last hit (or "never" if no hits), and the expiration countdown (e.g., "expires in 6d"). The focused row is highlighted with reverse video. Cache entries are sorted by most recently created by default, with the sort toggleable between created date, last hit, size, and hit count.

The developer can filter the cache list by bookmark name and cache key using inline filter inputs activated by `b` (filter by bookmark) and `f` (filter by cache key). Active filters are shown as pills below the statistics banner, and clearing them is done with `Esc` while the filter input is focused or by pressing `x` to clear all filters. A text search (`/`) provides fuzzy matching across cache keys and bookmark names.

Deletion is the primary destructive action. Pressing `d` on a focused cache entry opens a confirmation overlay to delete that single cache. Pressing `D` opens a bulk-clear confirmation overlay that will delete all caches matching the current filters (or all caches if no filters are active). The confirmation overlay shows the count and total size of caches that will be deleted. After deletion, the statistics banner updates to reflect the new totals, and the list refreshes.

The status bar shows context-sensitive keybinding hints: `j/k:nav Enter:detail d:delete D:clear b:bookmark f:filter /:search s:sort q:back`. The header breadcrumb reads "Dashboard > owner/repo > Workflows > Caches".

## Acceptance Criteria

### Definition of Done
- [ ] The Workflow Cache View screen renders as a full-screen view between header and status bars
- [ ] The screen is reachable via `a` from the workflow list screen, `:caches` command palette, and `--screen workflow-caches --repo owner/repo` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Workflows > Caches"
- [ ] Pressing `q` pops the screen and returns to the workflow list (or previous screen)
- [ ] Cache statistics are fetched via `useWorkflowCacheStats()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/caches/stats`
- [ ] Cache statistics response includes `cache_count`, `total_size_bytes`, `repo_quota_bytes`, `archive_max_bytes`, `ttl_seconds`, `last_hit_at`, `max_expires_at`
- [ ] Cache list is fetched via `useWorkflowCaches()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/caches`
- [ ] Cache list supports `bookmark`, `key`, `page`, and `per_page` query parameters
- [ ] Each cache row displays: cache key, bookmark name, status, size, hit count, last hit time, expiration
- [ ] Focused cache row is highlighted with reverse video and primary color accent
- [ ] Single-cache delete calls `DELETE /api/repos/:owner/:repo/caches/:id` (or equivalent)
- [ ] Bulk-clear calls `DELETE /api/repos/:owner/:repo/caches` with active filter query parameters
- [ ] After deletion, stats banner and cache list both refresh
- [ ] Confirmation overlay is required before any deletion
- [ ] Empty state (no caches) shows "No workflow caches" with muted text
- [ ] Loading state shows spinner with "Loading caches…"

### Keyboard Interactions
- [ ] `j` / `Down`: Move cursor to next cache entry
- [ ] `k` / `Up`: Move cursor to previous cache entry
- [ ] `Enter`: Open detail view for focused cache entry (inline expansion showing full metadata)
- [ ] `d`: Delete focused cache entry (shows confirmation overlay)
- [ ] `D`: Clear all caches matching current filters (shows confirmation overlay with count/size)
- [ ] `b`: Focus bookmark filter input
- [ ] `f`: Filter by cache key input
- [ ] `/`: Focus search input (fuzzy search across keys and bookmarks)
- [ ] `x`: Clear all active filters
- [ ] `s`: Cycle sort order (created ↓, last hit ↓, size ↓, hits ↓)
- [ ] `G`: Jump to bottom of list
- [ ] `g g`: Jump to top of list
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up within scrollbox
- [ ] `Esc`: Clear filter input → close expanded detail → close overlay → pop screen (priority chain)
- [ ] `q`: Pop screen (when not in filter input or overlay)
- [ ] `?`: Toggle help overlay
- [ ] `R`: Refresh cache list and stats manually

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Stats banner shows count + used/quota on one line only. Cache list shows key (truncated) + size + status only. Bookmark, hit count, last hit, and expiration columns hidden. Confirmation overlay uses 90% width.
- [ ] 120×40 – 199×59: Full stats banner with usage bar. Cache list shows key + bookmark + status + size + hits + last hit. Expiration column visible. Confirmation overlay at 50% width.
- [ ] 200×60+: Full stats banner with TTL and archive max info. Cache list shows all columns including full cache key (50ch), bookmark (30ch), cache version (10ch), compression type. Wider column widths throughout.

### Truncation & Boundary Constraints
- [ ] Cache key: truncated at 30ch (min), 40ch (standard), 50ch (large) with `…`
- [ ] Bookmark name: truncated at 20ch with `…`
- [ ] Cache version: truncated at 10ch with `…`
- [ ] Size display: formatted as "1.2 KB", "34.5 MB", "1.1 GB" — max 8ch
- [ ] Hit count: right-aligned numeric, max 6 digits (999999)
- [ ] Last hit: relative time "2m ago", "3d ago", "never" — max 10ch
- [ ] Expiration: "in 6d 4h", "in 23h", "expired" (red) — max 12ch
- [ ] Usage bar: 10 block characters wide at minimum (80×24), 20 at standard, 30 at large
- [ ] Stats banner: single line at minimum, two lines at standard, three lines at large
- [ ] Cache list pagination: 30 entries per page, max 500 entries total (cursor-based)
- [ ] Filter input: max 100 characters for bookmark and key filters
- [ ] Search input: max 100 characters

### Edge Cases
- [ ] Terminal resize while filter input is focused: input retains value and cursor position, layout re-renders
- [ ] Terminal resize during delete confirmation overlay: overlay resizes proportionally (min 30ch width)
- [ ] Rapid j/k through cache entries: sequential, no debounce, one entry per keypress
- [ ] Enter on already-expanded cache detail: collapses it
- [ ] Delete on already-deleted cache (race condition): 404 response → status bar flash "Cache not found", list refreshes
- [ ] Bulk clear with zero matching caches: confirmation overlay shows "0 caches (0 B)" — Confirm is disabled
- [ ] Network error on delete: confirmation overlay shows error message, user can retry or dismiss
- [ ] Network error on list fetch: error state with "Press R to retry"
- [ ] Empty cache list with active filters: "No caches matching filters" with filter pills shown
- [ ] Empty cache list with no filters: "No workflow caches. Caches are created by workflow runs."
- [ ] Null/missing fields: rendered as "—", no "null" text
- [ ] Unicode in cache keys: truncation respects grapheme clusters
- [ ] Cache with status "pending": shown with yellow (178) status indicator, not deletable (dimmed `d` key)
- [ ] Extremely large cache count (500+): pagination loads pages on scroll-to-end
- [ ] Stats with 0 quota used: usage bar renders empty `░░░░░░░░░░ 0%`
- [ ] Stats with 100% quota used: usage bar renders full `██████████ 100%` in red (196)
- [ ] Stats with >90% quota used: usage bar renders in yellow (178) warning color
- [ ] All filters active + sort changed: filter parameters preserved during sort toggle
- [ ] Rapid d presses on same entry: overlay already open, second press is no-op
- [ ] Concurrent resize + API response: both handled independently
- [ ] No color support: usage bar uses `[###-------] 30%` ASCII fallback, status uses `[FIN]`/`[PEND]` text markers

## Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows > Caches             │
├─────────────────────────────────────────────────────────────────┤
│ 📦 Caches: 47   Used: 142.3 MB / 1.0 GB  ████████░░ 78%        │
│ Max archive: 50 MB   TTL: 7d   Last hit: 2m ago                │
├─────────────────────────────────────────────────────────────────┤
│ [bookmark:main] [key:node_modules]                    sort:created│
├──────────────────────────────────┬──────┬─────┬──────┬──────────┤
│ Cache Key                        │ Size │ Hits│ Last │ Expires   │
├──────────────────────────────────┼──────┼─────┼──────┼──────────┤
│ ✓ node_modules-abc123  main      │ 45 MB│  23 │ 2m   │ in 6d    │
│ ✓ cargo-registry-def4  feat/x    │ 12 MB│   5 │ 1h   │ in 5d  ← │
│ ✓ pip-cache-ghi789     main      │ 8 MB │  12 │ 3d   │ in 2d    │
│ ◌ build-output-jkl0    feat/y    │  —   │   0 │ —    │ in 7d    │
├─────────────────────────────────────────────────────────────────┤
│ j/k:nav Enter:detail d:delete D:clear b:bookmark s:sort q:back  │
└─────────────────────────────────────────────────────────────────┘
```

### Components Used

- `<box>` — Vertical/horizontal flexbox containers for stats banner, filter bar, column headers, cache rows, confirmation overlays
- `<scrollbox>` — Main scrollable area containing the cache entry list
- `<text>` — Stats values, cache keys, bookmark names, sizes, hit counts, timestamps, usage percentages, status icons, column headers
- `<input>` — Bookmark filter input, cache key filter input, search input

### Statistics Banner

```
<box flexDirection="column" paddingX={1} borderBottom="single" borderColor="border">
  <box flexDirection="row" gap={2}>
    <text bold>📦 Caches: {stats.cache_count}</text>
    <text>Used: {formatBytes(stats.total_size_bytes)} / {formatBytes(stats.repo_quota_bytes)}</text>
    <text>{renderUsageBar(stats.total_size_bytes, stats.repo_quota_bytes)}</text>
    <text color={usageColor}>{usagePercent}%</text>
  </box>
  <box flexDirection="row" gap={2}>
    <text color="muted">Max archive: {formatBytes(stats.archive_max_bytes)}</text>
    <text color="muted">TTL: {formatTTL(stats.ttl_seconds)}</text>
    <text color="muted">Last hit: {stats.last_hit_at ? relativeTime(stats.last_hit_at) : 'never'}</text>
  </box>
</box>
```

### Filter Bar

```
<box flexDirection="row" gap={1} paddingX={1} borderBottom="single" borderColor="border">
  {activeBookmarkFilter && <text color="primary" inverse> bookmark:{activeBookmarkFilter} </text>}
  {activeKeyFilter && <text color="primary" inverse> key:{activeKeyFilter} </text>}
  {isFilterInputActive && <input label={filterType} value={filterValue} onChange={setFilterValue} onSubmit={applyFilter} />}
  <box flexGrow={1} />
  <text color="muted">sort:{sortField}{sortIcon}</text>
</box>
```

### Cache Entry List

```
<scrollbox onScrollEnd={loadNextPage}>
  <box flexDirection="column">
    {/* Column headers */}
    <box flexDirection="row" paddingX={1} borderBottom="single">
      <text bold width={keyWidth}>Cache Key</text>
      <text bold width={8} textAlign="right">Size</text>
      <text bold width={5} textAlign="right">Hits</text>
      <text bold width={10} textAlign="right">Last Hit</text>
      <text bold width={12} textAlign="right">Expires</text>
    </box>
    {caches.map(cache => (
      <box key={cache.id} flexDirection="column">
        <box flexDirection="row" paddingX={1}
             style={cache.id === focusedId ? { reverse: true, color: 'primary' } : {}}>
          <text color={statusColor(cache.status)} width={2}>{cache.status === 'finalized' ? '✓' : '◌'}</text>
          <text width={keyWidth}>{truncate(cache.cache_key, keyWidth)}</text>
          <text width={8} textAlign="right">{formatBytes(cache.object_size_bytes)}</text>
          <text width={5} textAlign="right">{cache.hit_count}</text>
          <text color="muted" width={10} textAlign="right">{cache.last_hit_at ? relativeTime(cache.last_hit_at) : 'never'}</text>
          <text color={expirationColor(cache.expires_at)} width={12} textAlign="right">{formatExpiration(cache.expires_at)}</text>
        </box>
        {expandedIds.has(cache.id) && <CacheDetailPanel cache={cache} />}
      </box>
    ))}
    {isLoadingMore && <text color="muted">Loading more…</text>}
  </box>
</scrollbox>
```

### Status Icons & Colors

| Status | Icon | ANSI Color |
|--------|------|------------|
| finalized | `✓` | Green (34) |
| pending | `◌` | Yellow (178) |

### Usage Bar Colors

| Usage % | Color |
|---------|-------|
| 0–74% | Green (34) |
| 75–89% | Yellow (178) |
| 90–100% | Red (196) |

### Expiration Colors

| Time remaining | Color |
|----------------|-------|
| > 2 days | Default (muted) |
| 1–2 days | Yellow (178) |
| < 1 day | Red (196) |
| Expired | Red (196), text "expired" |

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Next cache entry | List focused |
| `k` / `Up` | Previous cache entry | List focused |
| `Enter` | Toggle inline detail expansion | Cache entry focused |
| `d` | Delete focused cache | Finalized cache focused, not in overlay |
| `D` | Clear all matching caches | Not in overlay |
| `b` | Open bookmark filter input | Not in overlay or filter input |
| `f` | Open cache key filter input | Not in overlay or filter input |
| `/` | Open search input | Not in overlay or filter input |
| `x` | Clear all active filters | Filters are active |
| `s` | Cycle sort order | List focused |
| `R` | Refresh list and stats | Not in overlay |
| `G` | Jump to last cache entry | List focused |
| `g g` | Jump to first cache entry | List focused |
| `Ctrl+D` | Page down | Scrollbox |
| `Ctrl+U` | Page up | Scrollbox |
| `Esc` | Clear input → close detail → close overlay → pop screen | Priority chain |
| `q` | Pop screen | Not in input or overlay |
| `?` | Toggle help overlay | Always |
| `Tab` / `Shift+Tab` | Cycle Confirm/Cancel in overlay | Overlay open |

### Responsive Behavior

**80×24 (minimum)**: Stats banner single line: `📦 47  142.3 MB / 1.0 GB  ████░░ 78%`. Cache rows show: status icon (2ch) + key (fill−10) + size (8ch). Column headers hidden. Overlays at 90% width.

**120×40 (standard)**: Full two-line stats banner. Cache rows: icon (2ch) + key (30ch) + bookmark (15ch) + size (8ch) + hits (5ch) + last hit (10ch). Column headers shown. Overlays at 50% width.

**200×60 (large)**: Full three-line stats banner. Cache rows: icon (2ch) + key (50ch) + bookmark (30ch) + version (10ch) + compression (6ch) + size (8ch) + hits (5ch) + last hit (10ch) + expiration (12ch). Wider overlays.

Resize triggers synchronous re-layout. Focused entry preserved. Filter input value preserved. Expanded details re-render at new width.

### Data Hooks

- `useWorkflowCacheStats(repo)` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/caches/stats`
- `useWorkflowCaches(repo, { bookmark, key, page, per_page, sort })` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/caches`
- `useWorkflowCacheDelete(repo, cacheId)` from `@codeplane/ui-core` → `DELETE /api/repos/:owner/:repo/caches/:id`
- `useWorkflowCacheClear(repo, { bookmark, key })` from `@codeplane/ui-core` → `DELETE /api/repos/:owner/:repo/caches`
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI navigation

### Navigation

- `q` → `pop()`
- `Enter` on cache with `workflow_run_id` in expanded detail → optionally `push("workflow-run-detail", { repo, runId: cache.workflow_run_id })`
- Accessed via `push("workflow-caches", { repo })` from workflow list screen

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View cache list (public repo) | ✅ | ✅ | ✅ | ✅ |
| View cache list (private repo) | ❌ | ✅ | ✅ | ✅ |
| View cache stats (public repo) | ✅ | ✅ | ✅ | ✅ |
| View cache stats (private repo) | ❌ | ✅ | ✅ | ✅ |
| Delete single cache | ❌ | ❌ | ✅ | ✅ |
| Bulk clear caches | ❌ | ❌ | ❌ | ✅ |

- The screen requires repository context. Repository context is enforced at navigation level
- `GET /api/repos/:owner/:repo/caches` and `/caches/stats` respect repository visibility
- Delete endpoints require write access. Read-only users see `d` and `D` keybinding hints dimmed (ANSI 245) and receive "Permission denied" in the status bar on action attempt
- Bulk clear (`D`) requires admin access. Write-only users receive "Admin access required" on attempt
- The `d` key hint is dimmed for users without write access; the `D` key hint is dimmed for users without admin access

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen

### Rate Limiting
- 300 req/min for `GET` endpoints (cache list, cache stats)
- 60 req/min for `DELETE` endpoints (single delete, bulk clear)
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` to retry after waiting

### Input Sanitization
- Cache ID is a numeric path parameter — validated as positive integer before API call
- Bookmark and key filter values are URL-encoded query parameters — validated client-side to max 100 chars
- Search input is client-side only (fuzzy match on loaded data), not sent to API
- Cache keys, bookmark names, and other data rendered as plain `<text>` (no injection vector in terminal)

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workflow_cache.view` | Screen mounted, data loaded | `repo`, `cache_count`, `total_size_bytes`, `quota_bytes`, `usage_percent`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.workflow_cache.detail_expand` | Enter on cache entry | `repo`, `cache_id`, `cache_key`, `bookmark_name`, `status`, `size_bytes`, `hit_count` |
| `tui.workflow_cache.detail_collapse` | Enter on expanded entry | `repo`, `cache_id`, `cache_key` |
| `tui.workflow_cache.delete` | Confirm single delete | `repo`, `cache_id`, `cache_key`, `bookmark_name`, `size_bytes`, `success`, `action_time_ms` |
| `tui.workflow_cache.delete_denied` | 403 on delete | `repo`, `cache_id`, `cache_key` |
| `tui.workflow_cache.clear` | Confirm bulk clear | `repo`, `bookmark_filter`, `key_filter`, `deleted_count`, `deleted_bytes`, `success`, `action_time_ms` |
| `tui.workflow_cache.clear_denied` | 403 on clear | `repo`, `bookmark_filter`, `key_filter` |
| `tui.workflow_cache.filter_applied` | Filter submitted | `repo`, `filter_type`, `filter_value`, `result_count` |
| `tui.workflow_cache.filter_cleared` | x pressed or all filters cleared | `repo`, `cleared_filters` |
| `tui.workflow_cache.search` | Search submitted | `repo`, `query_length`, `result_count` |
| `tui.workflow_cache.sort_changed` | s pressed | `repo`, `sort_field`, `previous_sort_field` |
| `tui.workflow_cache.refresh` | R pressed | `repo`, `cache_count_before`, `cache_count_after` |
| `tui.workflow_cache.pagination` | Scroll-to-end loads next page | `repo`, `page_number`, `total_loaded` |
| `tui.workflow_cache.error` | API failure | `repo`, `error_type`, `http_status`, `request_type` |
| `tui.workflow_cache.data_load_time` | All initial data loaded | `repo`, `stats_ms`, `list_ms`, `total_ms` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Detail expand rate | >40% of views |
| Filter usage rate | >25% of views |
| Delete action usage | >10% of views |
| Delete action success rate | >95% of attempts |
| Bulk clear usage | >5% of views |
| Bulk clear success rate | >95% of attempts |
| Error rate | <2% |
| Time to interactive | <2s |
| Pagination completion rate | >80% (users see >1 page) |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `WorkflowCacheView: mounted [repo={r}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Stats loaded | `WorkflowCacheView: stats loaded [repo={r}] [count={n}] [size={bytes}] [quota={quota}] [duration={ms}ms]` |
| `debug` | List loaded | `WorkflowCacheView: list loaded [repo={r}] [count={n}] [page={p}] [duration={ms}ms]` |
| `debug` | Entry expanded | `WorkflowCacheView: expanded [repo={r}] [cache_id={id}] [key={k}]` |
| `debug` | Entry collapsed | `WorkflowCacheView: collapsed [repo={r}] [cache_id={id}]` |
| `debug` | Filter applied | `WorkflowCacheView: filter [repo={r}] [type={bookmark|key}] [value={v}] [results={n}]` |
| `debug` | Filter cleared | `WorkflowCacheView: filter cleared [repo={r}] [type={all|bookmark|key}]` |
| `debug` | Sort changed | `WorkflowCacheView: sort [repo={r}] [field={f}] [direction={d}]` |
| `info` | Fully loaded | `WorkflowCacheView: ready [repo={r}] [caches={n}] [total_ms={ms}]` |
| `info` | Delete initiated | `WorkflowCacheView: delete [repo={r}] [cache_id={id}] [key={k}]` |
| `info` | Delete completed | `WorkflowCacheView: deleted [repo={r}] [cache_id={id}] [success={bool}] [duration={ms}ms]` |
| `info` | Clear initiated | `WorkflowCacheView: clear [repo={r}] [bookmark={b}] [key={k}]` |
| `info` | Clear completed | `WorkflowCacheView: cleared [repo={r}] [deleted_count={n}] [deleted_bytes={bytes}] [success={bool}] [duration={ms}ms]` |
| `info` | Refresh | `WorkflowCacheView: refresh [repo={r}]` |
| `warn` | Fetch failed | `WorkflowCacheView: fetch failed [repo={r}] [endpoint={e}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `WorkflowCacheView: rate limited [repo={r}] [endpoint={e}] [retry_after={s}]` |
| `warn` | Delete failed | `WorkflowCacheView: delete failed [repo={r}] [cache_id={id}] [status={code}] [error={msg}]` |
| `warn` | Clear failed | `WorkflowCacheView: clear failed [repo={r}] [status={code}] [error={msg}]` |
| `warn` | Slow load (>3s) | `WorkflowCacheView: slow load [repo={r}] [duration={ms}ms]` |
| `error` | Auth error | `WorkflowCacheView: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `WorkflowCacheView: permission denied [repo={r}] [action={delete|clear}]` |
| `error` | Render error | `WorkflowCacheView: render error [repo={r}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during filter input | Input retains value and cursor; layout re-renders | Synchronous |
| Resize with confirmation overlay open | Overlay resizes proportionally (min 30ch width, fallback to 90% at <80ch) | Synchronous |
| Resize while loading | Spinner repositions; fetch continues | Synchronous |
| Auth expiry on page load | 401 → auth error screen | Re-auth via CLI |
| Auth expiry during delete | Overlay shows error → dismiss → auth error screen | Re-auth via CLI |
| Network timeout (30s) on initial load | Loading → error state + "Press R to retry" | User retries |
| Network timeout on delete | Confirmation overlay shows "Request timed out" + retry button | User retries |
| Network timeout on clear | Confirmation overlay shows "Request timed out" + retry button | User retries |
| Delete 403 (permission denied) | Status bar flash "Permission denied" | Informational |
| Delete 404 (cache not found) | Status bar flash "Cache not found", list refreshes | Auto-recovery |
| Clear 403 (permission denied) | Status bar flash "Admin access required" | Informational |
| Clear returns deleted_count: 0 | Status bar flash "No caches matched" | Informational |
| Pagination error | "Failed to load more" at list bottom, scroll-to-end retries on next scroll | Automatic retry |
| Rapid d presses | Overlay already open, subsequent presses are no-op | No performance concern |
| Rapid filter input | Client-side debounce (200ms) before API refetch | Automatic |
| No color support | Text markers replace icons: `[FIN]`/`[PEND]`. Usage bar: `[###-------] 30%` | Theme detection |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Confirmation overlay crash → overlay dismissed, error flash; user retries action key
- Stats fetch fails but list succeeds → stats banner shows "—" values; list renders normally
- List fetch fails but stats succeeds → stats banner renders; list shows error with retry
- Both fail → full error state; `q` still works for navigation
- Slow network → spinner shown on initial load; pagination shows "Loading more…"
- Partial data (stats loaded, list fails) → independent retry per section

## Verification

### Test File: `e2e/tui/workflows.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-CV-001: Cache view at 120×40 with populated cache list — full stats banner, column headers, cache rows with all columns
- SNAP-CV-002: Cache view at 80×24 minimum — single-line stats, key+size only, no column headers
- SNAP-CV-003: Cache view at 200×60 large — three-line stats, all columns including version and compression
- SNAP-CV-004: Stats banner with 0% usage — empty usage bar in green
- SNAP-CV-005: Stats banner with 78% usage — partial usage bar in green
- SNAP-CV-006: Stats banner with 92% usage — nearly full usage bar in yellow
- SNAP-CV-007: Stats banner with 100% usage — full usage bar in red
- SNAP-CV-008: Empty cache list — "No workflow caches" message with muted text
- SNAP-CV-009: Empty cache list with active filters — "No caches matching filters" with filter pills
- SNAP-CV-010: Focused cache row with reverse video highlight
- SNAP-CV-011: Cache entry with status "finalized" — green checkmark
- SNAP-CV-012: Cache entry with status "pending" — yellow pending indicator
- SNAP-CV-013: Expanded cache detail panel — full metadata inline with left border
- SNAP-CV-014: Multiple expanded cache details simultaneously
- SNAP-CV-015: Active bookmark filter pill in filter bar
- SNAP-CV-016: Active key filter pill in filter bar
- SNAP-CV-017: Both bookmark and key filters active simultaneously
- SNAP-CV-018: Bookmark filter input focused (inline input visible)
- SNAP-CV-019: Delete confirmation overlay — single cache with key, bookmark, size
- SNAP-CV-020: Bulk clear confirmation overlay — count, total size, filter context
- SNAP-CV-021: Bulk clear overlay with 0 matching caches — Confirm button disabled
- SNAP-CV-022: Delete confirmation overlay with spinner during API call
- SNAP-CV-023: Loading state — "Loading caches…" with spinner
- SNAP-CV-024: Error state — red error with "Press R to retry"
- SNAP-CV-025: Breadcrumb path "Dashboard > owner/repo > Workflows > Caches"
- SNAP-CV-026: Status bar hints with action keys (write user)
- SNAP-CV-027: Dimmed action keybinding hints for read-only user
- SNAP-CV-028: Pagination "Loading more…" indicator at list bottom

### Keyboard Interaction Tests (38 tests)

- KEY-CV-001–004: j/k/Down/Up navigation through cache entries
- KEY-CV-005–006: Enter expands cache detail inline, Enter again collapses
- KEY-CV-007: Enter on pending cache — still expands with available metadata
- KEY-CV-008: d on finalized cache — opens delete confirmation overlay
- KEY-CV-009: d on pending cache — no-op, status bar "Pending caches cannot be deleted"
- KEY-CV-010: Tab/Shift+Tab in delete overlay — cycle Confirm/Cancel buttons
- KEY-CV-011: Enter on Confirm in delete overlay — cache deleted, overlay closes, list refreshes
- KEY-CV-012: Esc in delete overlay — overlay closes, no deletion
- KEY-CV-013: d returns 403 — status bar "Permission denied"
- KEY-CV-014: d returns 404 — status bar "Cache not found", list refreshes
- KEY-CV-015: D opens bulk clear confirmation overlay
- KEY-CV-016: D with active filters — overlay shows filter context and filtered count
- KEY-CV-017: D with no filters — overlay warns "All caches will be deleted"
- KEY-CV-018: D with 0 matching caches — overlay Confirm button disabled
- KEY-CV-019: Enter on Confirm in clear overlay — caches cleared, stats and list refresh
- KEY-CV-020: D returns 403 — status bar "Admin access required"
- KEY-CV-021: b opens bookmark filter input, type value, Enter applies filter
- KEY-CV-022: f opens cache key filter input, type value, Enter applies filter
- KEY-CV-023: Esc while filter input focused — input closed, value discarded
- KEY-CV-024: x clears all active filters, list refetches unfiltered
- KEY-CV-025: / opens search input, type query, results filter client-side
- KEY-CV-026: s cycles sort: created → last_hit → size → hits → created
- KEY-CV-027–028: G (jump to last entry), g g (jump to first entry)
- KEY-CV-029–030: Ctrl+D (page down), Ctrl+U (page up) within scrollbox
- KEY-CV-031: Esc closes expanded detail (when no overlay or input active)
- KEY-CV-032: Esc pops screen (when no overlay, detail, or input active)
- KEY-CV-033: q pops screen
- KEY-CV-034: q during overlay — no-op
- KEY-CV-035: R refreshes cache list and stats
- KEY-CV-036: ? opens help overlay showing all keybindings
- KEY-CV-037: Rapid j presses (15× sequential, one entry per keypress)
- KEY-CV-038: d during delete in-flight — no-op, overlay already showing spinner

### Responsive Tests (14 tests)

- RESP-CV-001–002: 80×24 layout — single-line stats, key+size columns only, no headers
- RESP-CV-003–004: 120×40 layout — full stats, key+bookmark+status+size+hits+last_hit columns
- RESP-CV-005–006: 200×60 layout — full stats with all metadata, all columns including version+compression
- RESP-CV-007: Resize from 120×40 to 80×24 — columns collapse, stats compress to single line
- RESP-CV-008: Resize from 80×24 to 120×40 — columns expand, stats expand to two lines
- RESP-CV-009: Focus preserved through resize
- RESP-CV-010: Expanded cache detail adjusts width on resize
- RESP-CV-011: Resize with filter input focused — input retains value
- RESP-CV-012: Resize with delete overlay open — overlay resizes proportionally
- RESP-CV-013: Resize during loading state — spinner repositions
- RESP-CV-014: Usage bar width adapts to terminal width (10ch at 80, 20ch at 120, 30ch at 200)

### Integration Tests (22 tests)

- INT-CV-001–003: Auth expiry (→ auth screen), rate limit (→ inline message), network error (→ error state)
- INT-CV-004: Server 500 error handling on initial load
- INT-CV-005: Stats fetch succeeds but list fetch fails — stats render, list shows error
- INT-CV-006: List fetch succeeds but stats fetch fails — list renders, stats show "—"
- INT-CV-007–008: Delete success (API call + list refresh + stats update), delete failure (overlay error message)
- INT-CV-009: Delete 403 permission denied
- INT-CV-010: Delete 404 cache not found — list auto-refreshes
- INT-CV-011–012: Clear success (API call + deleted_count/bytes returned + list+stats refresh), clear failure (overlay error)
- INT-CV-013: Clear 403 permission denied
- INT-CV-014: Clear with filters — correct query parameters sent to API
- INT-CV-015: Pagination — scroll-to-end triggers next page load with correct page parameter
- INT-CV-016: Pagination error — "Failed to load more" shown, retry on next scroll
- INT-CV-017: Filter by bookmark — API called with bookmark parameter, list updates
- INT-CV-018: Filter by key — API called with key parameter, list updates
- INT-CV-019: Combined bookmark+key filter — both parameters sent to API
- INT-CV-020: Deep link launch (`--screen workflow-caches --repo owner/repo`)
- INT-CV-021: Command palette entry (`:caches`)
- INT-CV-022: Back navigation to workflow list preserves previous screen state

### Edge Case Tests (13 tests)

- EDGE-CV-001: No auth token → auth error screen
- EDGE-CV-002: Long cache key (80+ chars) truncated with ellipsis
- EDGE-CV-003: Unicode in cache keys — truncation respects grapheme clusters
- EDGE-CV-004: Single cache entry in list
- EDGE-CV-005: 500 cache entries — pagination and scroll handle smoothly
- EDGE-CV-006: Concurrent resize + API response — both handled independently
- EDGE-CV-007: Cache with null last_hit_at — shows "never"
- EDGE-CV-008: Cache with null workflow_run_id — detail shows "—"
- EDGE-CV-009: Cache with 0 hit_count — shows "0"
- EDGE-CV-010: Expired cache (expires_at in past) — "expired" in red
- EDGE-CV-011: Null/missing fields in API response — rendered as "—"
- EDGE-CV-012: Rapid d presses on same entry — overlay already open, second press is no-op
- EDGE-CV-013: Delete then navigate back — previous screen state preserved

All 115 tests left failing if backend is unimplemented — never skipped or commented out.

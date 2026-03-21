# TUI_DASHBOARD_ACTIVITY_FEED

Specification for TUI_DASHBOARD_ACTIVITY_FEED.

## High-Level User POV

The activity feed is a section of the Dashboard screen that shows the authenticated user's recent public activity across Codeplane. It sits alongside the other dashboard sections — Repositories, Organizations, Starred Repos, and Quick Actions — and answers the question: "What have I been working on lately?"

Each entry in the feed is a single-line row displaying an event icon, a human-readable summary sentence, and a relative timestamp. For example: `◆ created repository alice/my-project — 2h ago` or `⑂ forked repository org/tool — 3d ago`. The most recent activity appears at the top, and older entries scroll downward. The focused row is highlighted with the `primary` accent color, and the user navigates the list with `j`/`k` or arrow keys.

At the top of the section is a header reading "Activity (N)" where N is the total count of the user's public activity events. To the right of the header, a filter hint shows the current filter or `f filter` when unfiltered. The user can press `f` to cycle through event type filters — All, Created, Forked, Archived, Transferred — narrowing the list to only those event categories. The active filter label appears in the header area.

When the user presses `Enter` on a focused activity entry whose target is a repository, the TUI pushes the repository overview screen for that repository onto the navigation stack. This provides a fast path from "what did I do?" to "let me look at that repo." If the target cannot be navigated to (e.g., a deleted repository), `Enter` is a no-op and no error is shown.

The list uses a scrollbox for vertical scrolling. When the user scrolls past 80% of the loaded items, the next page of activity is fetched automatically via page-based pagination. A "Loading more..." indicator appears at the bottom during the fetch. When all pages are exhausted, no indicator is shown.

If the user has no public activity, the section shows a centered muted-color message: "No recent activity." This empty state renders immediately when the API returns an empty result set, not after a loading spinner.

The activity feed shares the Dashboard screen with other sections. The user moves focus between dashboard sections using `Tab`/`Shift+Tab`. The activity feed is not the default-focused section — the Repositories list receives focus on initial Dashboard load — so the user must `Tab` to reach it.

At minimum terminal size (80x24), the summary text is aggressively truncated and the event type icon may be omitted to save columns. At standard size (120x40), the full layout renders with icon, summary, and timestamp. At large sizes (200x60+), the summary can be wider, and additional metadata like the target type label becomes visible.

If the API request fails — whether from a network error, auth expiry, or rate limit — an inline error message replaces the feed content with a red error description and the hint: "Press `R` to retry." The header and status bars remain stable during error states. The activity feed section loads independently from other dashboard sections; a failure here does not affect the Repositories or Organizations sections.

## Acceptance Criteria

### Definition of Done

- The Dashboard screen renders an "Activity" section showing the authenticated user's public activity feed
- Activity data is fetched via `useActivity()` from `@codeplane/ui-core`, which calls `GET /api/users/:username/activity` using the authenticated user's username
- The feed is sorted by `created_at` descending (most recent first), matching the API default
- Each row displays: event type icon, human-readable summary, and relative timestamp
- `j`/`k` (and `Down`/`Up` arrow keys) move the focus cursor through the list when the Activity section is focused
- `Enter` on a focused row whose `target_type` is `"repository"` pushes the repository overview screen with the `target_name` as context
- `Enter` on a focused row whose target is not navigable is a no-op
- `f` cycles through event type filters: All → Created → Forked → Archived → Transferred → All
- `Shift+F` cycles filters in reverse order
- The active filter label is shown in the section header
- When a filter is active, the list is re-fetched from the API with the `type` query parameter
- The section header shows "Activity (N)" where N is the `total_count` from the API response
- Page-based pagination loads the next page when the scrollbox scroll position reaches 80% of content height
- "Loading more..." is shown at the bottom of the scrollbox while the next page is being fetched
- When all pages are loaded, no pagination indicator is shown
- The empty state message "No recent activity." is shown when the API returns zero items
- A loading spinner with "Loading..." is shown in the activity section while the initial data fetch is in progress
- API errors display an inline error message with "Press `R` to retry" hint
- Auth errors (401) propagate to the app-shell-level auth error screen
- Rate limit errors (429) display the retry-after period inline

### Keyboard Interactions

- `j` / `Down`: Move focus to next activity row
- `k` / `Up`: Move focus to previous activity row
- `Enter`: Navigate to the target resource (if navigable)
- `f`: Cycle forward through event type filters
- `Shift+F`: Cycle backward through event type filters
- `G`: Jump to the last visible/loaded activity row
- `g g`: Jump to the first activity row
- `Ctrl+D`: Page down within the scrollbox
- `Ctrl+U`: Page up within the scrollbox
- `R`: Retry the last failed API request (only active in error state)
- `Tab` / `Shift+Tab`: Move focus to the next/previous dashboard section

### Responsive Behavior

- Below 80x24: "Terminal too small" handled by router
- 80x24 – 119x39 (minimum): Event icon hidden. Summary truncated to 55 chars. Timestamp right-aligned in 5 chars. Each row: `summary (truncated) │ 2h`
- 120x40 – 199x59 (standard): Full layout. Each row: `◆ │ summary (up to 80 chars) │ 2h ago`
- 200x60+ (large): Expanded summary (up to 120 chars), target type label visible. Each row: `◆ │ summary (up to 120 chars) │ repository │ 2h ago`

### Truncation and Boundary Constraints

- Activity `summary`: truncated with trailing `...` when exceeding column width (55/80/120 chars at min/standard/large)
- Relative timestamps: compact format, never exceed 6 characters (e.g., `2h`, `3d`, `1mo`, `2y`, `just now` abbreviated to `now`)
- Event type icons: single character width (`◆` create, `⑂` fork, `⊘` archive, `→` transfer, `•` other)
- Filter label: max 12 characters (e.g., "All", "Created", "Forked", "Archived", "Transferred")
- Maximum loaded activity items in memory: 300 items (pagination cap)
- Page size: 30 items per API request (matching API default)
- Maximum per_page: 100 (API cap)

### Edge Cases

- Terminal resize while scrolled: scroll position preserved relative to focused item
- Rapid `j` presses: processed sequentially, no debouncing
- Filter change during pagination: resets scroll position to top, re-fetches from page 1 with new filter
- SSE disconnect: activity feed unaffected (uses REST, not SSE)
- Unicode in target names: truncation respects grapheme clusters
- Deleted target repositories: `Enter` is a no-op; row renders normally with summary text
- Activity feed API returns 501 (not yet implemented): treated as a server error; inline error with "Press `R` to retry"
- Zero-width terminal columns after resize: clamp minimum column widths to prevent render corruption
- Filter produces zero results: show "No activity matching filter." in muted text (distinct from empty-state message)

## Design

### Layout Structure

The activity feed is a section within the Dashboard screen content area using vertical flexbox:

```
<box flexDirection="column" width="100%" flexGrow={1} minHeight={4}>
  {/* Section header */}
  <box flexDirection="row" height={1}>
    <text bold color="primary">Activity</text>
    <text color="muted"> ({totalCount})</text>
    <box flexGrow={1} />
    {activeFilter !== "all" && (
      <text color="warning">[{filterLabel}]</text>
    )}
    <text color="muted"> f filter</text>
  </box>

  {/* Activity list */}
  <scrollbox flexGrow={1}>
    <box flexDirection="column">
      {filteredActivity.map(item => (
        <box key={item.id} flexDirection="row" height={1}
             backgroundColor={item.id === focusedId ? "primary" : undefined}>
          {showIcon && (
            <box width={2}>
              <text color={eventColor(item.event_type)}>{eventIcon(item.event_type)}</text>
            </box>
          )}
          <box flexGrow={1}>
            <text bold={item.id === focusedId}>
              {truncate(item.summary, summaryColumnWidth)}
            </text>
          </box>
          {showTargetType && (
            <box width={12}>
              <text color="muted">{item.target_type}</text>
            </box>
          )}
          <box width={timestampWidth}>
            <text color="muted">{relativeTime(item.created_at)}</text>
          </box>
        </box>
      ))}
      {loadingMore && <box height={1}><text color="muted">Loading more...</text></box>}
    </box>
  </scrollbox>
</box>
```

### Event Type Icon Map

| Event Type | Icon | Color |
|-----------|------|-------|
| `repo.create` | `◆` | `success` (green) |
| `repo.fork` | `⑂` | `primary` (blue) |
| `repo.archive` | `⊘` | `muted` (gray) |
| `repo.unarchive` | `⊙` | `success` (green) |
| `repo.transfer` | `→` | `warning` (yellow) |
| `repo.delete` | `✕` | `error` (red) |
| Other | `•` | `muted` (gray) |

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Move focus down | Activity section focused |
| `k` / `Up` | Move focus up | Activity section focused |
| `Enter` | Navigate to target resource | Row focused, target navigable |
| `f` | Cycle filter forward | Activity section focused |
| `Shift+F` | Cycle filter backward | Activity section focused |
| `G` | Jump to last loaded row | Activity section focused |
| `g g` | Jump to first row | Activity section focused |
| `Ctrl+D` | Page down | Activity section focused |
| `Ctrl+U` | Page up | Activity section focused |
| `R` | Retry failed fetch | Error state displayed |
| `Tab` | Next dashboard section | Any section focused |
| `Shift+Tab` | Previous dashboard section | Any section focused |

### Responsive Column Layout

**80x24 (minimum)**: `│ summary (55ch, truncated) │ 2h │` — Icon hidden, target type hidden

**120x40 (standard)**: `│ ◆ │ summary (80ch) │ 2h ago │` — Icon visible, target type hidden

**200x60 (large)**: `│ ◆ │ summary (120ch) │ repository │ 2h ago │` — All columns visible

### Data Hooks

- `useActivity(username, { page, perPage, type? })` from `@codeplane/ui-core` — returns `{ items: ActivitySummary[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void, setFilter: (type: string | null) => void }`. Calls `GET /api/users/:username/activity` with page-based pagination, default page size 30
- `useUser()` from `@codeplane/ui-core` — provides the authenticated user's `username` to pass to `useActivity()`
- `useTerminalDimensions()` — for responsive column layout breakpoints
- `useOnResize()` — trigger synchronous re-layout
- `useKeyboard()` — keybinding registration

### Filter Cycle

The `f` key cycles through a fixed filter order:

1. `all` (label: "All") — no `type` param sent, shows all event types
2. `repo.create` (label: "Created") — filters to repository creation events
3. `repo.fork` (label: "Forked") — filters to fork events
4. `repo.archive` (label: "Archived") — filters to archive events
5. `repo.transfer` (label: "Transferred") — filters to transfer events

Each filter change triggers a re-fetch from page 1 with the selected `type` parameter. The scroll position resets to the top and the first item receives focus.

### Navigation Context

When `Enter` is pressed on an activity row with `target_type === "repository"`, calls `push("repo-overview", { repo: item.target_name })` to push the repository overview screen. Breadcrumb updates to "Dashboard > owner/repo". For non-repository targets, `Enter` is a no-op.

### Loading and Empty States

- **Initial loading**: Centered spinner with "Loading..." text within the activity section bounds
- **Empty (no activity)**: Centered `<text color="muted">No recent activity.</text>`
- **Empty (filter match)**: Centered `<text color="muted">No activity matching filter.</text>`
- **Error**: `<text color="error">{error.message}</text>` followed by `<text color="muted">Press R to retry</text>`
- **Rate limited**: `<text color="error">Rate limited. Retry in {retryAfter}s.</text>`
- **Pagination loading**: `<text color="muted">Loading more...</text>` at list bottom

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View own activity feed on dashboard | No | Yes | Yes |

- The dashboard activity feed is only accessible to authenticated users. The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/users/:username/activity` returns only public repository events for the specified user
- The TUI passes the authenticated user's own username to the activity endpoint
- No elevated role (admin, org owner) is required
- The activity feed only shows the authenticated user's own activity on the dashboard — not other users' activity

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen

### Rate Limiting

- Authenticated users: 300 requests per minute to `GET /api/users/:username/activity`
- If 429 is returned, the activity section displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period
- Filter cycling triggers API calls — rapid filter cycling may hit rate limits; the UI processes the filter change immediately but the API call for the new filter debounces at 200ms to avoid excessive requests during rapid cycling

### Input Sanitization

- Filter type values are drawn from a fixed enum — never user-typed strings
- Activity summaries rendered as plain text via `<text>` components (no injection risk)
- Repository target names rendered as plain text — no shell interpretation

### Data Privacy

- The activity feed only displays events on public repositories
- IP addresses, email addresses, and internal audit metadata are never exposed in the API response and therefore never rendered in the TUI
- The `actor_username` in each entry always matches the authenticated user on the dashboard view

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.dashboard.activity.view` | Activity section becomes visible (initial load completes) | `total_count`, `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms` |
| `tui.dashboard.activity.navigate` | User presses Enter on an activity row to navigate to target | `event_type`, `target_type`, `target_name`, `position_in_list` (0-indexed) |
| `tui.dashboard.activity.filter` | User changes the event type filter | `filter_type` (all/repo.create/repo.fork/repo.archive/repo.transfer), `result_count`, `previous_filter` |
| `tui.dashboard.activity.paginate` | Next page of activity is loaded | `page_number`, `items_loaded_total`, `total_count`, `active_filter` |
| `tui.dashboard.activity.error` | API request fails | `error_type` (network/auth/rate_limit/server/not_implemented), `http_status` |
| `tui.dashboard.activity.retry` | User presses R to retry after error | `error_type`, `retry_success` |
| `tui.dashboard.activity.empty` | Empty state rendered (zero activity) | `active_filter` |

### Success Indicators

- **Activity section load completion rate**: percentage of dashboard loads where the activity section successfully renders data (target: >95%, accounting for the 501 stub)
- **Navigation rate**: percentage of activity section views where the user navigates to at least one target (target: >20%)
- **Filter adoption**: percentage of activity section views where the user changes the filter at least once (target: >10%)
- **Pagination depth**: average number of pages loaded per session
- **Error rate**: percentage of activity section loads resulting in error state (target: <5%)
- **Retry success rate**: percentage of retry attempts that succeed (target: >80%)
- **Time to first interaction**: time from activity section render to first j/k/Enter/f keypress

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------||
| `info` | Activity section loaded | `total_count`, `items_in_first_page`, `load_time_ms`, `active_filter` |
| `info` | Activity target navigated | `event_type`, `target_type`, `target_name`, `position_in_list` |
| `info` | Pagination page loaded | `page_number`, `items_count`, `total_loaded`, `active_filter` |
| `warn` | API error on activity fetch | `http_status`, `error_message` (no token) |
| `warn` | Rate limited on activity fetch | `retry_after_seconds` |
| `warn` | API returned 501 (not implemented) | `endpoint`, `username` |
| `debug` | Filter changed | `filter_type`, `previous_filter` |
| `debug` | Scroll position updated | `scroll_percent`, `focused_index`, `total_loaded` |
| `debug` | Pagination trigger reached | `scroll_percent`, `items_loaded`, `has_more` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press R to retry" |
| Network timeout on pagination | Data hook timeout (30s) | "Loading more..." replaced with inline error. Existing items remain visible. R retries |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline error: "Rate limited. Retry in Ns." R retries after waiting |
| Server error (500) | API returns 5xx | Inline error with generic message. R retries |
| Not implemented (501) | API returns 501 | Inline error: "Activity feed not yet available." R retries |
| Terminal resize during initial load | `useOnResize` fires during fetch | Fetch continues. Renders at new size when data arrives |
| Terminal resize during scrolled list | `useOnResize` fires | Column widths recalculate. Focused row stays visible |
| SSE disconnect | Status bar shows disconnected | Activity feed unaffected (uses REST, not SSE) |
| Empty response with non-zero total_count | items.length === 0 && totalCount > 0 | Treated as end-of-pagination |
| Malformed API response | JSON parse error | Error state rendered with generic error message |
| React error boundary triggered | Error boundary catches | Error screen per app-shell error boundary |
| Filter change during in-flight fetch | New filter applied before previous fetch resolves | Previous fetch response discarded; new fetch initiated |
| Rapid filter cycling | Multiple `f` presses in <200ms | Debounced to 200ms; only final filter value triggers fetch |

### Failure Modes

- **Total fetch failure**: Error state shown in activity section. Other dashboard sections may still load independently
- **Partial pagination failure**: Existing loaded items remain visible. Only "Loading more..." area shows error
- **Memory pressure**: 300-item pagination cap prevents unbounded memory growth
- **501 stub response**: Treated gracefully — shows "Activity feed not yet available." rather than a generic error

## Verification

### Test File: `e2e/tui/dashboard.test.ts`

### Terminal Snapshot Tests

- **dashboard-activity-initial-load**: Launch TUI, Tab to activity section → snapshot matches golden file showing "Activity (N)" header, activity rows with icons, summaries, and timestamps. First row highlighted
- **dashboard-activity-empty-state**: Launch TUI for user with zero public activity → snapshot shows centered "No recent activity." in muted color
- **dashboard-activity-loading-state**: Launch TUI with slow API → snapshot shows "Loading..." centered in activity section
- **dashboard-activity-error-state**: Launch TUI with failing activity API → snapshot shows error message in red with "Press R to retry"
- **dashboard-activity-501-state**: Launch TUI with 501 activity API stub → snapshot shows "Activity feed not yet available." message
- **dashboard-activity-focused-row**: Tab to activity section → first activity row highlighted with primary color
- **dashboard-activity-event-icons**: Launch TUI with mixed event types → correct icons rendered (◆ for create, ⑂ for fork, ⊘ for archive, → for transfer)
- **dashboard-activity-filter-active**: Press `f` to activate filter → header shows filter label (e.g., "[Created]")
- **dashboard-activity-filter-no-results**: Apply filter that matches zero events → "No activity matching filter." shown
- **dashboard-activity-pagination-loading**: Scroll to bottom of activity list → "Loading more..." visible
- **dashboard-activity-header-total-count**: Activity section shows "Activity (N)" with correct count from API
- **dashboard-activity-relative-timestamps**: Activity entries show correct relative timestamps (e.g., "2h", "3d", "1mo")

### Keyboard Interaction Tests

- **dashboard-activity-j-moves-down**: Tab to activity, press `j` → focus moves from first to second activity row
- **dashboard-activity-k-moves-up**: Tab to activity, press `j` then `k` → focus returns to first row
- **dashboard-activity-k-at-top-no-wrap**: Tab to activity, press `k` on first row → focus stays (no wrap-around)
- **dashboard-activity-j-at-bottom-no-wrap**: Navigate to last row, press `j` → focus stays (triggers pagination if more)
- **dashboard-activity-down-arrow-moves-down**: Tab to activity, press Down → same as `j`
- **dashboard-activity-up-arrow-moves-up**: Tab to activity, press Down then Up → same as `k`
- **dashboard-activity-enter-navigates-to-repo**: Press Enter on activity row with target_type "repository" → repo overview pushed, breadcrumb shows "Dashboard > owner/repo"
- **dashboard-activity-enter-noop-on-non-repo**: Press Enter on activity row with non-navigable target → no screen change
- **dashboard-activity-f-cycles-filter-forward**: Press `f` → filter cycles All → Created; press `f` again → Forked; etc.
- **dashboard-activity-shift-f-cycles-filter-backward**: Press `Shift+F` → filter cycles from All → Transferred (reverse)
- **dashboard-activity-filter-resets-scroll**: Apply filter → scroll position resets to top, first item focused
- **dashboard-activity-filter-refetches**: Apply filter "Created" → API called with `type=repo.create`
- **dashboard-activity-G-jumps-to-bottom**: Press `G` → focus on last loaded row
- **dashboard-activity-gg-jumps-to-top**: Press `G` then `g g` → focus on first row
- **dashboard-activity-ctrl-d-page-down**: Press `Ctrl+D` → focus moves down by half visible height
- **dashboard-activity-ctrl-u-page-up**: Press `Ctrl+D` then `Ctrl+U` → focus returns
- **dashboard-activity-R-retries-on-error**: Error state, press `R` → fetch retried
- **dashboard-activity-R-no-op-when-loaded**: Press `R` when loaded → no effect
- **dashboard-activity-tab-moves-to-next-section**: Press `Tab` on activity section → focus moves to next dashboard section
- **dashboard-activity-shift-tab-moves-to-prev-section**: Press `Shift+Tab` on activity section → focus moves to previous dashboard section
- **dashboard-activity-j-no-op-when-unfocused**: Activity section not focused, press `j` → no effect on activity list
- **dashboard-activity-pagination-on-scroll**: Scroll to 80% → next page loaded
- **dashboard-activity-rapid-j-presses**: Send `j` 10 times → focus moves 10 rows sequentially
- **dashboard-activity-enter-during-loading**: Enter during initial load → no-op

### Responsive Tests

- **dashboard-activity-80x24-layout**: Terminal 80×24 → summary + timestamp only. No icon, no target type
- **dashboard-activity-80x24-truncation**: Terminal 80×24, long summary → truncated with `...` at 55 chars
- **dashboard-activity-120x40-layout**: Terminal 120×40 → icon + summary + timestamp visible
- **dashboard-activity-120x40-summary-truncation**: Terminal 120×40, long summary → truncated with `...` at 80 chars
- **dashboard-activity-200x60-layout**: Terminal 200×60 → icon + summary + target type + timestamp visible
- **dashboard-activity-200x60-expanded-summary**: Terminal 200×60 → summary expands to 120 chars
- **dashboard-activity-resize-standard-to-min**: Resize 120×40 → 80×24 → icon column collapses immediately
- **dashboard-activity-resize-min-to-standard**: Resize 80×24 → 120×40 → icon column appears
- **dashboard-activity-resize-preserves-focus**: Resize at any breakpoint → focused row preserved
- **dashboard-activity-resize-during-filter**: Resize with filter active → filter stays, results re-rendered at new size

### Integration Tests

- **dashboard-activity-auth-expiry**: 401 on activity fetch → app-shell auth error screen, not inline error
- **dashboard-activity-rate-limit-429**: 429 with Retry-After: 30 → "Rate limited. Retry in 30s."
- **dashboard-activity-network-error**: Network timeout → inline error with "Press R to retry"
- **dashboard-activity-pagination-complete**: 45 activities (page size 30) → both pages load, all 45 visible
- **dashboard-activity-300-items-cap**: 400 activities → only 300 loaded, pagination stops
- **dashboard-activity-enter-then-q-returns**: Enter on repo activity, then q → dashboard with scroll/focus preserved in activity section
- **dashboard-activity-goto-from-repo-and-back**: Navigate to repo via activity, `g d` → dashboard with activity section intact
- **dashboard-activity-server-error-500**: 500 on fetch → inline error with "Press R to retry"
- **dashboard-activity-concurrent-section-load**: Dashboard sections load independently; activity section shows its own loading/error/data state
- **dashboard-activity-filter-then-paginate**: Apply filter, scroll to load page 2 → page 2 fetched with filter param
- **dashboard-activity-filter-during-fetch**: Change filter while fetch in flight → previous fetch discarded, new fetch initiated

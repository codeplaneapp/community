# TUI_LANDING_LIST_FILTERS

Specification for TUI_LANDING_LIST_FILTERS.

## High-Level User POV

The Landing List Filters feature provides a persistent, always-visible filter toolbar on the landing request list screen that lets terminal users narrow down landing requests by state, reviewer, target bookmark, conflict status, and sort order — all without leaving the keyboard. The toolbar sits directly below the "Landings (N)" title row and above the landing request list content, giving the user a constant view of what filters are active and how many landing requests match.

The user arrives at the landing request list screen via `g l` from any screen with repository context, or via the command palette. The filter toolbar is immediately visible with sensible defaults: landing requests are filtered to "Open" state and sorted by "Recently created" (newest first). Every filter dimension has a dedicated single-key shortcut. Pressing `f` cycles the state filter through "Open" → "Draft" → "Merged" → "Closed" → "All", updating the landing count and list immediately. Pressing `r` opens a reviewer picker overlay showing users who have submitted reviews on landing requests in the repository. Pressing `b` opens a target bookmark picker overlay showing bookmarks that appear as `target_bookmark` values in the loaded landing data. Pressing `c` cycles the conflict status filter through "All" → "Clean" → "Conflicted". Pressing `o` cycles the sort order through "Recently created" → "Recently updated" → "Oldest first" → "Largest stack" → "Smallest stack".

Each active filter is displayed as a chip in the toolbar. For example, after selecting the reviewer "alice" and filtering to "Merged" state, the toolbar reads: `State: Merged │ Reviewer: alice │ Sort: Recently created`. Pressing a filter key again while that filter is active allows the user to change or clear it. Pressing `x` clears all active filters, resetting to the default "Open" state.

The filter picker overlays (for reviewers and target bookmarks) are compact modal panels centered on screen. Each contains a fuzzy-searchable list of options. The user types to narrow the list, navigates with `j`/`k`, and confirms with `Enter`. Pressing `Esc` dismisses the picker without changing the filter. Both reviewer and target bookmark pickers are single-select.

State filtering operates server-side — changing the state triggers a fresh API request with the `state` query parameter. Reviewer, target bookmark, and conflict status filters are applied client-side against the loaded landing data, since `GET /api/repos/:owner/:repo/landings` currently supports only `state` as a server-side filter. Sort order changes re-sort the loaded items locally. When the API adds support for additional server-side query parameters, the TUI will send those filters server-side automatically without any UX change.

At minimum terminal size (80×24), the filter toolbar collapses to show only the active state filter and a compact "N filters" count for any additional active filters. The full filter labels are hidden but accessible via the help overlay (`?`). At standard size (120×40) and above, all filter chips are displayed inline. The filter toolbar never wraps to multiple lines — excess chips are truncated with "…+N more" at the right edge.

When the user navigates away from the landing list and returns, filter state is reset to defaults. Filters are local to the screen instance and are not persisted.

## Acceptance Criteria

### Definition of Done

- [ ] A persistent filter toolbar renders below the "Landings (N)" title row and above the column headers/landing list
- [ ] The toolbar displays the current state filter, sort order, and any active reviewer/bookmark/conflict filters as labeled chips
- [ ] Default filter on screen mount: state = "Open", sort = "Recently created", no reviewer/bookmark/conflict filters
- [ ] State filter (`f`) cycles: "Open" → "Draft" → "Merged" → "Closed" → "All" → "Open"
- [ ] Sort order (`o`) cycles: "Recently created" → "Recently updated" → "Oldest first" → "Largest stack" → "Smallest stack" → "Recently created"
- [ ] Reviewer filter (`r`) opens a picker overlay listing reviewers extracted from loaded landing review data (unique reviewer logins)
- [ ] Target bookmark filter (`b`) opens a picker overlay listing unique `target_bookmark` values from loaded landing data
- [ ] Conflict status filter (`c`) cycles: "All" → "Clean" → "Conflicted" → "All"
- [ ] Clear all filters (`x`) resets to default state ("Open", "Recently created", no reviewer/bookmark/conflict)
- [ ] State filter changes trigger a new API request with the updated `state` query parameter and reset pagination
- [ ] Sort order changes re-sort locally loaded items immediately and use the new sort for subsequent pagination requests
- [ ] Reviewer filter changes apply client-side against the loaded landing list (filter landings that have a review from the selected reviewer login)
- [ ] Target bookmark filter changes apply client-side (filter landings where `target_bookmark` matches the selected value)
- [ ] Conflict status filter changes apply client-side (filter landings where `conflict_status` matches the selected value)
- [ ] Only one reviewer can be active at a time
- [ ] Only one target bookmark can be active at a time
- [ ] The "Landings (N)" header count reflects the total from the API response; a secondary "(showing M)" count appears when client-side filters further reduce the visible set
- [ ] Filter toolbar never exceeds one line height
- [ ] Active filter chips use `primary` color text for the value portion
- [ ] Conflict status chip uses semantic colors: "Clean" in `success` (green), "Conflicted" in `warning` (yellow)
- [ ] Clearing a filter (via picker or `x`) immediately updates the list and count

### Keyboard Interactions

- [ ] `f`: Cycle state filter (Open → Draft → Merged → Closed → All → Open). Active when list is focused, not in search input or picker overlay
- [ ] `o`: Cycle sort order. Active when list is focused, not in search input or picker overlay
- [ ] `r`: Open reviewer picker overlay. Active when list is focused, not in picker
- [ ] `b`: Open target bookmark picker overlay. Active when list is focused, not in picker
- [ ] `c`: Cycle conflict status filter (All → Clean → Conflicted → All). Active when list is focused, not in search input or picker
- [ ] `x`: Clear all filters, reset to defaults. Active when list is focused, not in search input or picker
- [ ] In picker overlays: `j`/`k`/`Down`/`Up` navigate, `Enter` selects, `Esc` cancels, `/` or typing focuses filter input
- [ ] In reviewer/bookmark pickers: `Enter` selects the focused item and closes picker immediately (single-select)
- [ ] All filter keybindings are suppressed when the search input (`/`) is focused — keys type into the search input instead

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router (no filter toolbar rendered)
- [ ] 80×24 – 119×39 (minimum): Toolbar shows only state filter label (e.g., "Open") and condensed active filter count (e.g., "+2 filters"). Picker overlays use 90% terminal width
- [ ] 120×40 – 199×59 (standard): Toolbar shows all filter chips inline: `State: Open │ Reviewer: alice │ Bookmark: main │ Conflict: Clean │ Sort: Recently created`. Picker overlays use 60% terminal width
- [ ] 200×60+ (large): Same as standard with extra padding. Picker overlays use 50% terminal width, reviewer picker shows full name alongside login if available

### Truncation and Boundary Constraints

- [ ] State filter values: fixed enum, never truncated ("Open", "Draft", "Merged", "Closed", "All")
- [ ] Sort order values: fixed enum, never truncated
- [ ] Conflict status values: fixed enum, never truncated ("All", "Clean", "Conflicted")
- [ ] Reviewer login names: truncated with `…` at 20 characters in toolbar, 30 characters in picker
- [ ] Target bookmark names: truncated with `…` at 20 characters in toolbar, 40 characters in picker
- [ ] Multiple chips in toolbar: if total chip width exceeds available toolbar space, excess chips collapsed to "…+N more"
- [ ] Picker overlay list: maximum 100 items displayed; shows "Showing first 100 of N" footer if more exist
- [ ] Picker filter input: maximum 60 characters
- [ ] Filter toolbar separator: `│` (U+2502 box-drawing) between filter chips

### Edge Cases

- [ ] No landing requests have reviews: reviewer picker shows "No reviewers found" in muted text, `Enter` is no-op
- [ ] All landing requests target the same bookmark: bookmark picker shows a single item
- [ ] No landing requests match active filters: list area shows "No landing requests match the current filters." with "Press `x` to clear filters." hint
- [ ] State filter change while pagination is loading: current fetch is abandoned; new fetch starts with updated state parameter
- [ ] Rapid `f` presses: each press cycles to the next state value; the API request uses the latest value (debounced 150ms from last keypress to avoid excessive API calls)
- [ ] Terminal resize while picker overlay is open: picker re-centers and resizes to fit new dimensions
- [ ] Terminal resize while toolbar is rendered: toolbar re-lays out within the new width, adding or removing filter chip detail as breakpoint changes
- [ ] Picker overlay opened at minimum terminal size: uses 90% width to ensure usability; list items show name only
- [ ] Reviewer login with very long name (100+ chars): truncated in both toolbar and picker with `…`
- [ ] Target bookmark with very long name (100+ chars): truncated in both toolbar and picker with `…`
- [ ] API error on landing list fetch after state change: list shows inline error "Failed to load landings. Press R to retry." Toolbar retains new state value
- [ ] Unicode in reviewer logins, bookmark names: truncation respects grapheme clusters
- [ ] Filter active when landing list receives new page from pagination: client-side filters applied to incoming page items as they arrive
- [ ] User selects reviewer who appears in zero currently-loaded landings: list shows empty state; as more pages load, matching landings may appear
- [ ] SSE disconnect: landing list filters are unaffected (uses REST, not SSE)
- [ ] Conflict status "Conflicted" selected when no loaded landings have conflicts: empty state shown
- [ ] Landing request transitions state (e.g., merged by another user) while filter is active: stale data shown until next fetch; no live update via SSE for list view

## Design

### Layout Structure

The filter toolbar integrates into the landing request list screen layout:

```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Landings       │
├─────────────────────────────────────────────────┤
│ Landings (18)                                   │
│ State: Open │ Conflict: All │ Sort: Recently cre│
├─────────────────────────────────────────────────┤
│ # │ Title                    │ Stack│ Conf │ Age │
├─────────────────────────────────────────────────┤
│ ►18│ Add OAuth2 PKCE flow     │   3  │ ✓   │ 1d  │
│  17│ Refactor workspace API   │   5  │ ✗   │ 3d  │
│  16│ Fix bookmark resolution  │   1  │ ✓   │ 1w  │
│  …                                              │
├─────────────────────────────────────────────────┤
│ f:state  r:reviewer  b:bookmark  c:conflict  x:cl│
└─────────────────────────────────────────────────┘
```

### Component Structure

```tsx
<box flexDirection="column" width="100%" height="100%">
  {/* Title row */}
  <box flexDirection="row" justifyContent="space-between">
    <text bold color="primary">Landings ({totalCount})</text>
    {clientFilteredCount < totalCount && (
      <text color="muted">(showing {clientFilteredCount})</text>
    )}
  </box>

  {/* Filter toolbar */}
  <box flexDirection="row" gap={1} height={1}>
    <text>State: <text color="primary">{stateFilter}</text></text>
    <text color="border">│</text>
    {activeReviewer && (
      <>
        <text>Reviewer: <text color="primary">{truncate(activeReviewer, 20)}</text></text>
        <text color="border">│</text>
      </>
    )}
    {activeBookmark && (
      <>
        <text>Bookmark: <text color="primary">{truncate(activeBookmark, 20)}</text></text>
        <text color="border">│</text>
      </>
    )}
    {conflictFilter !== "" && (
      <>
        <text>Conflict: <text color={conflictFilter === "clean" ? "success" : "warning"}>
          {conflictFilter === "clean" ? "Clean" : "Conflicted"}
        </text></text>
        <text color="border">│</text>
      </>
    )}
    <text>Sort: <text color="primary">{sortOrder}</text></text>
  </box>

  {/* Landing request list (scrollbox) */}
  <scrollbox flexGrow={1}>
    <box flexDirection="column">
      {filteredLandings.map(landing => (
        <LandingRow key={landing.number} landing={landing} focused={landing.number === focusedNumber} />
      ))}
    </box>
  </scrollbox>
</box>

{/* Picker overlay (conditional) */}
{pickerOpen && (
  <box position="absolute" top="center" left="center"
       width={pickerWidth} height="60%" border="single">
    <box flexDirection="column">
      <text bold>{pickerTitle}</text>
      <input value={pickerSearch} onChange={setPickerSearch}
             placeholder="Type to filter…" />
      <scrollbox flexGrow={1}>
        {pickerItems.map(item => (
          <PickerRow key={item.id} item={item}
                     focused={item.id === pickerFocusedId} />
        ))}
      </scrollbox>
    </box>
  </box>
)}
```

### Picker Overlay Layout

**Reviewer Picker:**
```
┌────────────── Select Reviewer ─────────────┐
│ > Type to filter…                           │
├─────────────────────────────────────────────┤
│ ► alice                                     │
│   bob                                       │
│   charlie                                   │
│   …                                         │
├─────────────────────────────────────────────┤
│ Enter:select  Esc:cancel                    │
└─────────────────────────────────────────────┘
```

**Target Bookmark Picker:**
```
┌─────────── Select Target Bookmark ─────────┐
│ > Type to filter…                           │
├─────────────────────────────────────────────┤
│ ► main                                      │
│   develop                                   │
│   release/v2                                │
│   …                                         │
├─────────────────────────────────────────────┤
│ Enter:select  Esc:cancel                    │
└─────────────────────────────────────────────┘
```

- `►` indicates the focused/cursor item
- For reviewers: login name shown, no color prefix
- For bookmarks: bookmark name shown, no color prefix
- At large terminal sizes (200×60+), reviewer picker shows full display name alongside login if available (e.g., "alice — Alice Johnson")

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `f` | Cycle state filter (Open → Draft → Merged → Closed → All) | List focused, not in search input or picker |
| `o` | Cycle sort order | List focused, not in search input or picker |
| `r` | Open reviewer picker overlay | List focused, not in picker |
| `b` | Open target bookmark picker overlay | List focused, not in picker |
| `c` | Cycle conflict status filter (All → Clean → Conflicted) | List focused, not in search input or picker |
| `x` | Clear all filters, reset to defaults | List focused, not in search input or picker |
| `j` / `Down` | Move cursor down in picker | Picker overlay open |
| `k` / `Up` | Move cursor up in picker | Picker overlay open |
| `Enter` | Confirm selection and close picker | Picker overlay open |
| `Esc` | Close picker without applying | Picker overlay open |
| `G` | Jump to bottom of picker list | Picker overlay open |
| `g g` | Jump to top of picker list | Picker overlay open |

### Resize Behavior

- `useTerminalDimensions()` provides current `{ width, height }` for toolbar layout and picker sizing
- `useOnResize()` triggers synchronous re-layout of the filter toolbar and any open picker overlay
- At minimum breakpoint, toolbar collapses to state filter + condensed count; expanded reviewer/bookmark/conflict chips hidden
- At standard+, toolbar expands to show all active filter chips
- Picker overlay width adjusts: 90% (minimum), 60% (standard), 50% (large)
- If a picker overlay is open during resize, it re-centers and resizes within the new terminal dimensions
- No animation — single-frame re-render

### Data Hooks

- `useLandings({ owner, repo, state, cursor, limit })` from `@codeplane/ui-core` — fetches the landing request list with server-side state filter. Returns `{ items: LandingRequestResponse[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void }`
- `useTerminalDimensions()` — provides terminal size for responsive breakpoint calculation
- `useOnResize()` — triggers synchronous re-layout on terminal resize
- `useKeyboard()` — registers keybinding handlers for filter shortcuts
- `useNavigation()` — provides `push()` for navigating to landing detail and `pop()` for back navigation

### Filter State Management

Filter state is local to the screen component:

```typescript
interface LandingFilterState {
  stateFilter: "open" | "draft" | "merged" | "closed" | "";  // "" = all
  sortOrder: "recently-created" | "recently-updated" | "oldest" | "largest-stack" | "smallest-stack";
  reviewerFilter: string | null;  // reviewer login or null
  bookmarkFilter: string | null;  // target bookmark name or null
  conflictFilter: "clean" | "conflicted" | "";  // "" = all
}
```

- `stateFilter` changes trigger `useLandings()` re-fetch with updated `state` query param
- `sortOrder` changes re-sort the loaded items locally
- `reviewerFilter`, `bookmarkFilter`, and `conflictFilter` apply as client-side `.filter()` over the loaded items
- Filter state resets to defaults on screen mount (not persisted across navigation)

### Sort Comparators

| Sort Order | Comparator |
|------------|------------|
| Recently created | `landing.created_at` descending |
| Recently updated | `landing.updated_at` descending |
| Oldest first | `landing.created_at` ascending |
| Largest stack | `landing.stack_size` descending, then `created_at` descending |
| Smallest stack | `landing.stack_size` ascending, then `created_at` descending |

### Loading States

- **Reviewer picker loading**: No separate fetch — reviewers extracted from loaded landing review data. Picker populates immediately from cached data. If review data is still loading, picker shows centered spinner with "Loading reviewers…"
- **Bookmark picker loading**: No separate fetch — bookmarks extracted from loaded landing data (`target_bookmark` field). Picker populates immediately
- **State filter change**: Landing list shows "Loading landings…" spinner while API re-fetches with new state
- **Sort change**: No loading state — locally loaded items re-sort immediately
- **Conflict filter change**: No loading state — client-side filter applies immediately

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (read access) | Write access | Admin |
|--------|-----------|---------------------------|--------------|-------|
| View landing list with filters | ❌ | ✅ | ✅ | ✅ |
| Apply state/sort/reviewer/bookmark/conflict filters | ❌ | ✅ | ✅ | ✅ |
| View reviewers in picker | ❌ | ✅ | ✅ | ✅ |
| View bookmarks in picker | ❌ | ✅ | ✅ | ✅ |

- The landing list screen requires authentication. The TUI enforces authentication at bootstrap; unauthenticated sessions never reach this screen
- The landing list requires repository context (owner/repo). Navigation to this screen is gated by repository read access
- `GET /api/repos/:owner/:repo/landings` respects repository visibility — private repos require authenticated access
- No elevated role is required for filtering — all filter operations are read-only views of existing data
- Users see only landing requests belonging to repositories they have read access to — the API enforces visibility

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to the `@codeplane/ui-core` API client as a `Bearer` token in the `Authorization` header
- Token is never displayed in the TUI, never written to logs, never included in error messages or telemetry events
- 401 responses propagate to the app-shell-level auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- `GET /api/repos/:owner/:repo/landings`: 300 requests per minute per user
- State filter cycling is debounced (150ms) to prevent excessive API calls from rapid `f` presses
- If 429 is returned, the affected component (list or picker) displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period

### Input Sanitization

- Filter values (state, sort, conflict status) are from fixed enums — no user-controlled strings reach the API beyond the token and enum values
- Picker search input is client-side only — fuzzy search text is never sent to the API
- Reviewer logins and bookmark names are rendered as plain `<text>` components (no injection vector)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.landings.filters.view` | Filter toolbar rendered with landing list | `terminal_width`, `terminal_height`, `breakpoint`, `repo_full_name`, `default_state` |
| `tui.landings.filters.state_change` | User cycles state filter (`f`) | `new_state`, `previous_state`, `total_count`, `repo_full_name` |
| `tui.landings.filters.sort_change` | User cycles sort order (`o`) | `new_sort`, `previous_sort`, `loaded_count`, `repo_full_name` |
| `tui.landings.filters.reviewer_picker_open` | User opens reviewer picker (`r`) | `available_reviewers_count`, `repo_full_name` |
| `tui.landings.filters.reviewer_applied` | User confirms reviewer selection | `selected_reviewer`, `matched_count`, `repo_full_name` |
| `tui.landings.filters.bookmark_picker_open` | User opens bookmark picker (`b`) | `available_bookmarks_count`, `repo_full_name` |
| `tui.landings.filters.bookmark_applied` | User confirms bookmark selection | `selected_bookmark`, `matched_count`, `repo_full_name` |
| `tui.landings.filters.conflict_change` | User cycles conflict status filter (`c`) | `new_conflict_status`, `previous_conflict_status`, `matched_count`, `repo_full_name` |
| `tui.landings.filters.clear_all` | User clears all filters (`x`) | `cleared_state`, `cleared_reviewer`, `cleared_bookmark`, `cleared_conflict`, `repo_full_name` |
| `tui.landings.filters.picker_dismissed` | User dismisses picker without applying (`Esc`) | `picker_type` (reviewer/bookmark), `repo_full_name` |
| `tui.landings.filters.no_results` | Active filters produce zero visible landings | `state_filter`, `reviewer_filter`, `bookmark_filter`, `conflict_filter`, `total_loaded_count`, `repo_full_name` |
| `tui.landings.filters.error` | Landing list fetch fails after state change | `http_status`, `error_type`, `repo_full_name` |

### Success Indicators

- **Filter adoption rate**: percentage of landing list views where the user changes at least one filter beyond the default. Target: >30%
- **State filter usage**: percentage of views where the user cycles state. Target: >25%
- **Reviewer filter usage**: percentage of views where the user opens the reviewer picker. Target: >15%
- **Bookmark filter usage**: percentage of views where the user opens the bookmark picker. Target: >10%
- **Conflict filter usage**: percentage of views where the user cycles conflict status. Target: >12%
- **Sort usage**: percentage of views where the user changes sort order. Target: >12%
- **Clear-all usage**: percentage of filter sessions where the user uses `x` to reset. Target: >5%
- **Picker completion rate**: percentage of picker opens that result in a confirmed selection (vs. Esc dismiss). Target: >60%
- **No-results rate**: percentage of filter combinations that produce zero visible landings. Target: <10%
- **Filter error rate**: percentage of state filter changes that encounter an API error. Target: <2%

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|--------|
| `info` | Filter toolbar initialized | `repo_full_name`, `default_state`, `total_count` |
| `info` | State filter changed | `new_state`, `previous_state`, triggers re-fetch |
| `info` | Reviewer filter applied | `reviewer_login`, `matched_count` |
| `info` | Bookmark filter applied | `bookmark_name`, `matched_count` |
| `info` | Conflict filter changed | `new_conflict_status`, `matched_count` |
| `info` | All filters cleared | Previously active filters listed |
| `warn` | Landing fetch failed after state change | `http_status`, `error_message` (token redacted) |
| `warn` | Rate limited on filter-triggered fetch | `retry_after_seconds`, `endpoint` |
| `warn` | Filters produced zero results | `state_filter`, `reviewer`, `bookmark`, `conflict`, `total_loaded` |
| `debug` | State filter cycled | `new_state` |
| `debug` | Sort order cycled | `new_sort` |
| `debug` | Conflict filter cycled | `new_conflict_status` |
| `debug` | Reviewer picker opened | `available_count` |
| `debug` | Bookmark picker opened | `available_count` |
| `debug` | Picker dismissed without selection | `picker_type` |
| `debug` | Picker search text changed | `search_length`, `matched_items_count` |
| `debug` | Client-side filter applied to new page | `page_number`, `pre_filter_count`, `post_filter_count` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Landing fetch fails (network/500) after state change | `useLandings()` returns `error` | List shows inline error: "Failed to load landings. Press R to retry." Toolbar retains new state value for retry |
| Auth token expired (401) on landing fetch | API returns 401 | Propagated to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate." |
| Rate limited (429) on state filter change | API returns 429 | Landing list shows inline: "Rate limited. Retry in Ns." Filter toolbar retains previous state |
| State filter API returns empty with non-zero count | `items.length === 0 && totalCount > 0` | Treated as end of pagination. Filter state preserved |
| Terminal resize during picker overlay | `useOnResize` fires while picker is open | Picker re-centers and resizes. Selection state preserved. Focus preserved |
| Terminal resize during state filter fetch | `useOnResize` fires during API call | Fetch continues. Re-render at new size when data arrives |
| Rapid `f` key presses (state cycling) | Multiple keydown events within 150ms | Debounced — only the final state value triggers an API request |
| Picker opened with zero items after loading | `items.length === 0 && !isLoading` | Picker shows empty state message. `Enter` is no-op. `Esc` closes |
| Concurrent picker open + page navigation | User presses `Enter` while picker is open | Picker consumes `Enter` — does not navigate away. Landing list stays |
| React error boundary in filter component | Unhandled exception | App-shell error boundary renders error screen with restart/quit options |

### Failure Modes

- **Landing list fetch failure**: List area shows error state. Filter toolbar remains visible and interactive. Previous data is cleared. `R` retries with current filter state
- **Client-side filter produces zero results**: Empty state shown in list. Toolbar remains interactive. User can modify or clear filters. No error logged (this is normal behavior)
- **Reviewer picker has stale data**: If reviews have been added since the landing list was loaded, reviewer picker may not include recent reviewers until the next page load or state filter change triggers a re-fetch
- **Memory**: Reviewer and bookmark lists are derived from loaded landing data — no separate cache. No unbounded growth. Data cleared when screen unmounts

## Verification

### Test File: `e2e/tui/landings.test.ts`

### Terminal Snapshot Tests

- **landing-filters-toolbar-default**: Navigate to landing list (`g l`) at 120×40 → snapshot shows filter toolbar with "State: Open │ Sort: Recently created" in toolbar row below title
- **landing-filters-toolbar-state-draft**: Navigate to landings, press `f` → toolbar shows "State: Draft"
- **landing-filters-toolbar-state-merged**: Navigate to landings, press `f` twice → toolbar shows "State: Merged"
- **landing-filters-toolbar-state-closed**: Navigate to landings, press `f` three times → toolbar shows "State: Closed"
- **landing-filters-toolbar-state-all**: Navigate to landings, press `f` four times → toolbar shows "State: All"
- **landing-filters-toolbar-with-reviewer**: Press `r`, select "alice", `Enter` → toolbar shows "State: Open │ Reviewer: alice │ Sort: Recently created"
- **landing-filters-toolbar-with-bookmark**: Press `b`, select "main", `Enter` → toolbar shows "Bookmark: main"
- **landing-filters-toolbar-with-conflict-clean**: Press `c` → toolbar shows "Conflict: Clean" in green
- **landing-filters-toolbar-with-conflict-conflicted**: Press `c` twice → toolbar shows "Conflict: Conflicted" in yellow
- **landing-filters-toolbar-all-active**: Activate state, reviewer, bookmark, and conflict filters → toolbar shows all chips separated by `│`
- **landing-filters-toolbar-cleared**: Press `x` with active filters → toolbar returns to "State: Open │ Sort: Recently created"
- **landing-filters-reviewer-picker-open**: Press `r` → centered modal overlay with "Select Reviewer" title, search input, and list of reviewer logins
- **landing-filters-reviewer-picker-search**: In reviewer picker, type "al" → list narrows to reviewers containing "al"
- **landing-filters-reviewer-picker-empty**: No reviews exist → picker shows "No reviewers found" in muted text
- **landing-filters-bookmark-picker-open**: Press `b` → centered modal overlay with "Select Target Bookmark" title and list of bookmark names
- **landing-filters-bookmark-picker-single**: All landings target "main" → picker shows single item "main"
- **landing-filters-no-results**: Apply reviewer filter that matches no landings → list shows "No landing requests match the current filters." with "Press `x` to clear filters."
- **landing-filters-showing-count**: Apply client-side filter → header shows "Landings (18) (showing 3)" when 3 of 18 match
- **landing-filters-sort-label**: Press `o` → toolbar sort changes to "Sort: Recently updated"
- **landing-filters-status-bar-hints**: Landing list focused → status bar shows `f:state  r:reviewer  b:bookmark  c:conflict  o:sort  x:clear`
- **landing-filters-loading-state**: State filter changed → list shows "Loading landings…" spinner while API fetches
- **landing-filters-error-state**: API returns 500 → list shows "Failed to load landings. Press R to retry." in red

### Keyboard Interaction Tests

- **landing-filters-f-cycles-state-open-to-draft**: Default state is "Open", press `f` → state changes to "Draft", API re-fetched with `state=draft`
- **landing-filters-f-cycles-draft-to-merged**: State is "Draft", press `f` → state changes to "Merged", API re-fetched with `state=merged`
- **landing-filters-f-cycles-merged-to-closed**: State is "Merged", press `f` → state changes to "Closed", API re-fetched with `state=closed`
- **landing-filters-f-cycles-closed-to-all**: State is "Closed", press `f` → state changes to "All", API re-fetched with `state=`
- **landing-filters-f-cycles-all-to-open**: State is "All", press `f` → state changes to "Open", API re-fetched with `state=open`
- **landing-filters-o-cycles-sort**: Press `o` five times → sort cycles through all five options and returns to "Recently created"
- **landing-filters-r-opens-reviewer-picker**: Press `r` → reviewer picker overlay appears, focus is on first reviewer
- **landing-filters-reviewer-picker-jk-navigation**: In reviewer picker, press `j` → focus moves to second reviewer. Press `k` → focus returns to first
- **landing-filters-reviewer-picker-enter-selects**: In reviewer picker, press `Enter` → focused reviewer selected, picker closes, list filtered
- **landing-filters-reviewer-picker-esc-cancels**: In reviewer picker, press `Esc` → picker closes, no filter applied
- **landing-filters-b-opens-bookmark-picker**: Press `b` → bookmark picker overlay appears, focus is on first bookmark
- **landing-filters-bookmark-picker-enter-selects**: In bookmark picker, press `Enter` → focused bookmark selected, picker closes, list filtered
- **landing-filters-bookmark-picker-esc-cancels**: In bookmark picker, press `Esc` → picker closes, no filter applied
- **landing-filters-c-cycles-conflict-all-to-clean**: Default is "All", press `c` → conflict filter changes to "Clean", list filtered client-side
- **landing-filters-c-cycles-clean-to-conflicted**: Press `c` again → conflict filter changes to "Conflicted"
- **landing-filters-c-cycles-conflicted-to-all**: Press `c` again → conflict filter changes to "All" (cleared)
- **landing-filters-x-clears-all**: Apply reviewer + bookmark + conflict filters, press `x` → all filters cleared, state reset to "Open"
- **landing-filters-x-no-op-at-defaults**: Press `x` with default filters → no change, no API call
- **landing-filters-f-suppressed-in-search**: Press `/` then `f` → 'f' typed in search input, state filter unchanged
- **landing-filters-r-suppressed-in-search**: Press `/` then `r` → 'r' typed in search input, no picker opened
- **landing-filters-picker-search-filters-list**: In reviewer picker, type "al" → only reviewers with "al" in login shown
- **landing-filters-picker-G-jumps-bottom**: In picker, press `G` → focus moves to last item
- **landing-filters-picker-gg-jumps-top**: In picker, press `G` then `g g` → focus moves to first item
- **landing-filters-rapid-f-debounced**: Press `f` 5 times in 100ms → only one API request sent (for final state value)
- **landing-filters-enter-in-picker-no-navigation**: With picker open, `Enter` selects picker item, does NOT navigate to landing detail
- **landing-filters-j-in-picker-no-list-nav**: With picker open, `j` navigates within picker, NOT the landing list behind it
- **landing-filters-state-change-resets-pagination**: With 3 pages loaded, press `f` → pagination resets, fresh fetch from page 1
- **landing-filters-sort-reorders-locally**: With landings loaded, press `o` → list re-sorted immediately without API call
- **landing-filters-client-filter-reviewer**: Select reviewer "alice" → only landings with a review from "alice" shown from loaded data
- **landing-filters-client-filter-bookmark**: Select bookmark "main" → only landings with `target_bookmark === "main"` shown
- **landing-filters-client-filter-conflict-clean**: Set conflict filter to "Clean" → only landings with `conflict_status === "clean"` shown
- **landing-filters-R-retries-on-error**: Landing list shows error, press `R` → landing fetch retried with current filter state
- **landing-filters-q-pops-with-filters-active**: Apply filters, press `q` → screen pops (filters not persisted)

### Responsive Tests

- **landing-filters-80x24-toolbar-collapsed**: Terminal 80×24 → toolbar shows only "Open" state and "+2 filters" when reviewer and bookmark are active
- **landing-filters-80x24-picker-width**: Terminal 80×24, press `r` → reviewer picker uses 90% of terminal width (72 columns)
- **landing-filters-80x24-reviewer-truncation**: Terminal 80×24, reviewer with 40-char login → truncated to 30 chars with `…` in picker
- **landing-filters-80x24-bookmark-truncation**: Terminal 80×24, bookmark with 50-char name → truncated to 40 chars with `…` in picker
- **landing-filters-120x40-toolbar-full**: Terminal 120×40 → toolbar shows all filter chips inline with separators
- **landing-filters-120x40-picker-width**: Terminal 120×40, press `r` → reviewer picker uses 60% of terminal width (72 columns)
- **landing-filters-200x60-toolbar-full**: Terminal 200×60 → toolbar shows all chips with extra padding
- **landing-filters-200x60-picker-width**: Terminal 200×60, press `r` → reviewer picker uses 50% of terminal width (100 columns)
- **landing-filters-200x60-reviewer-display-name**: Terminal 200×60, reviewer picker → shows full name alongside login if available
- **landing-filters-resize-standard-to-min**: Resize from 120×40 → 80×24 with filters active → toolbar collapses to state + count, chips hidden
- **landing-filters-resize-min-to-standard**: Resize from 80×24 → 120×40 with filters active → toolbar expands to show all chips
- **landing-filters-resize-with-picker-open**: Resize while reviewer picker is open → picker re-centers and adjusts width to new breakpoint
- **landing-filters-resize-preserves-filter-state**: Resize at any size → all filter state (state, reviewer, bookmark, conflict, sort) preserved
- **landing-filters-resize-preserves-picker-selection**: Resize while in picker → focus preserved

### Integration Tests

- **landing-filters-state-open-api-call**: Default mount → API called with `state=open` query parameter
- **landing-filters-state-draft-api-call**: Press `f` → API called with `state=draft`
- **landing-filters-state-merged-api-call**: Press `f` twice → API called with `state=merged`
- **landing-filters-state-closed-api-call**: Press `f` three times → API called with `state=closed`
- **landing-filters-state-all-api-call**: Press `f` four times → API called with `state=` (empty = all)
- **landing-filters-no-reviewer-fetch**: Press `r` → no separate API call; reviewers extracted from loaded landing data
- **landing-filters-no-bookmark-fetch**: Press `b` → no separate API call; bookmarks extracted from loaded landing data
- **landing-filters-reviewer-filter-client-side**: Select "alice" reviewer → list shows only landings with a review from "alice"
- **landing-filters-bookmark-filter-client-side**: Select "main" bookmark → list shows only landings where `target_bookmark === "main"`
- **landing-filters-conflict-filter-client-side**: Set conflict to "Clean" → list shows only landings where `conflict_status === "clean"`
- **landing-filters-combined-filters**: State "Merged" + Reviewer "alice" + Bookmark "main" → API returns merged landings, client filters to those reviewed by alice targeting main
- **landing-filters-auth-expiry**: 401 on landing fetch → app-shell auth error screen shown
- **landing-filters-rate-limit-on-state-change**: 429 on landing fetch → inline "Rate limited. Retry in Ns.", filter toolbar shows previous state
- **landing-filters-pagination-with-client-filters**: Load page 2 with reviewer filter active → new page items filtered client-side, matching items added to visible list
- **landing-filters-state-change-clears-pages**: Change state filter → previously loaded pages discarded, fresh fetch from page 1
- **landing-filters-navigate-away-and-back**: Navigate to landing detail (`Enter`), press `q` to return → filter state reset to defaults
- **landing-filters-server-error-on-state-change**: 500 on landing fetch after state change → error state in list, toolbar retains new state value for retry

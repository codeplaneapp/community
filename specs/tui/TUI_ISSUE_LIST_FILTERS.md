# TUI_ISSUE_LIST_FILTERS

Specification for TUI_ISSUE_LIST_FILTERS.

## High-Level User POV

The Issue List Filters feature provides a persistent, always-visible filter toolbar on the issue list screen that lets terminal users narrow down issues by state, label, assignee, milestone, and sort order — all without leaving the keyboard. The toolbar sits directly below the "Issues (N)" title row and above the issue list content, giving the user a constant view of what filters are active and how many issues match.

The user arrives at the issue list screen via `g i` from any screen with repository context, or via the command palette. The filter toolbar is immediately visible with sensible defaults: issues are filtered to "Open" state and sorted by "Recently created" (newest first). Every filter dimension has a dedicated single-key shortcut that cycles through available options, following the established pattern from the repository list screen. Pressing `f` cycles the state filter through "Open" → "Closed" → "All", updating the issue count and list immediately. Pressing `a` opens an assignee picker overlay showing repository collaborators. Pressing `l` opens a label picker overlay showing the repository's labels with their colors rendered as colored bullet prefixes. Pressing `m` opens a milestone picker overlay showing open milestones. Pressing `o` cycles the sort order through "Recently created" → "Recently updated" → "Oldest first" → "Most commented" → "Least commented".

Each active filter is displayed as a chip in the toolbar. For example, after selecting the "bug" label and filtering to "Closed" state, the toolbar reads: `State: Closed │ Label: bug │ Sort: Recently created`. When multiple labels are selected, they appear comma-separated: `Label: bug, enhancement`. Pressing a filter key again while that filter is active allows the user to change or clear it. Pressing `x` clears all active filters, resetting to the default "Open" state.

The filter picker overlays (for labels, assignees, and milestones) are compact modal panels centered on screen. Each contains a fuzzy-searchable list of options. The user types to narrow the list, navigates with `j`/`k`, and confirms with `Enter`. Pressing `Esc` dismisses the picker without changing the filter. These overlays support multi-select for labels (toggle with `Space`) and single-select for assignee and milestone.

State and sort filters operate server-side — changing them triggers a fresh API request with the `state` query parameter (for state) and re-sorts the result set (for sort). Label, assignee, and milestone filters are applied client-side against the loaded issue data, since the `GET /api/repos/:owner/:repo/issues` endpoint currently supports only `state` as a server-side filter. When the API adds support for label/assignee/milestone query parameters, the TUI will send those filters server-side automatically without any UX change.

At minimum terminal size (80×24), the filter toolbar collapses to show only the active state filter and a compact "N filters" count for any additional active filters. The full filter labels are hidden but accessible via the help overlay (`?`). At standard size (120×40) and above, all filter chips are displayed inline. The filter toolbar never wraps to multiple lines — excess chips are truncated with "…+N more" at the right edge.

When the user navigates away from the issue list and returns, filter state is reset to defaults. Filters are local to the screen instance and are not persisted.

## Acceptance Criteria

### Definition of Done

- [ ] A persistent filter toolbar renders below the "Issues (N)" title row and above the column headers/issue list
- [ ] The toolbar displays the current state filter, sort order, and any active label/assignee/milestone filters as labeled chips
- [ ] Default filter on screen mount: state = "Open", sort = "Recently created", no label/assignee/milestone filters
- [ ] State filter (`f`) cycles: "Open" → "Closed" → "All" → "Open"
- [ ] Sort order (`o`) cycles: "Recently created" → "Recently updated" → "Oldest first" → "Most commented" → "Least commented" → "Recently created"
- [ ] Label filter (`l`) opens a picker overlay listing all labels from `GET /api/repos/:owner/:repo/labels`
- [ ] Assignee filter (`a`) opens a picker overlay listing collaborators extracted from loaded issue data (unique `assignees` and `author` values)
- [ ] Milestone filter (`m`) opens a picker overlay listing milestones from `GET /api/repos/:owner/:repo/milestones?state=open`
- [ ] Clear all filters (`x`) resets to default state ("Open", "Recently created", no label/assignee/milestone)
- [ ] State filter changes trigger a new API request with the updated `state` query parameter and reset pagination
- [ ] Sort order changes re-sort locally loaded items immediately and use the new sort for subsequent pagination requests
- [ ] Label filter changes apply client-side against the loaded issue list (filter issues where `labels` array contains the selected label name)
- [ ] Assignee filter changes apply client-side (filter issues where `assignees` array contains the selected user login, or `author.login` matches)
- [ ] Milestone filter changes apply client-side (filter issues where `milestone_id` matches the selected milestone ID)
- [ ] Multiple labels can be selected simultaneously (AND logic — issue must have all selected labels)
- [ ] Only one assignee can be active at a time
- [ ] Only one milestone can be active at a time
- [ ] The "Issues (N)" header count reflects the total from the API response; a secondary "(showing M)" count appears when client-side filters further reduce the visible set
- [ ] Filter toolbar never exceeds one line height
- [ ] Active filter chips use `primary` color text for the value portion; labels show a colored `●` prefix matching the label's hex color
- [ ] Clearing a filter (via picker or `x`) immediately updates the list and count

### Keyboard Interactions

- [ ] `f`: Cycle state filter (Open → Closed → All → Open). Active when list is focused, not in search input or picker overlay
- [ ] `o`: Cycle sort order. Active when list is focused, not in search input or picker overlay
- [ ] `l`: Open label picker overlay. Active when list is focused
- [ ] `a`: Open assignee picker overlay. Active when list is focused
- [ ] `m`: Open milestone picker overlay. Active when list is focused
- [ ] `x`: Clear all filters, reset to defaults. Active when list is focused
- [ ] In picker overlays: `j`/`k`/`Down`/`Up` navigate, `Enter` selects, `Esc` cancels, `/` or typing focuses filter input
- [ ] In label picker: `Space` toggles label selection (multi-select), `Enter` confirms all selections and closes picker
- [ ] In assignee/milestone pickers: `Enter` selects the focused item and closes picker immediately (single-select)
- [ ] All filter keybindings are suppressed when the search input (`/`) is focused — keys type into the search input instead

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router (no filter toolbar rendered)
- [ ] 80×24 – 119×39 (minimum): Toolbar shows only state filter label (e.g., "Open") and condensed active filter count (e.g., "+2 filters"). Picker overlays use 90% terminal width
- [ ] 120×40 – 199×59 (standard): Toolbar shows all filter chips inline: `State: Open │ Label: bug │ Assignee: alice │ Sort: Recently created`. Picker overlays use 60% terminal width
- [ ] 200×60+ (large): Same as standard with extra padding. Picker overlays use 50% terminal width, show label descriptions alongside label names

### Truncation and Boundary Constraints

- [ ] State filter values: fixed enum, never truncated ("Open", "Closed", "All")
- [ ] Sort order values: fixed enum, never truncated
- [ ] Label names in toolbar chips: truncated with `…` at 20 characters
- [ ] Label names in picker list: truncated with `…` at 40 characters (standard), 30 characters (minimum)
- [ ] Label descriptions in picker: truncated with `…` at 50 characters. Only shown at large terminal sizes
- [ ] Assignee login names: truncated with `…` at 20 characters in toolbar, 30 characters in picker
- [ ] Milestone titles: truncated with `…` at 25 characters in toolbar, 40 characters in picker
- [ ] Multiple label chips in toolbar: if total chip width exceeds available toolbar space, excess labels collapsed to "…+N more"
- [ ] Maximum selectable labels: 10 (matching API constraint on issue label assignment)
- [ ] Picker overlay list: maximum 100 items displayed; shows "Showing first 100 of N" footer if more exist
- [ ] Picker filter input: maximum 60 characters
- [ ] Filter toolbar separator: `│` (U+2502 box-drawing) between filter chips

### Edge Cases

- [ ] Repository has zero labels: label picker shows "No labels defined" in muted text, `Enter` and `Space` are no-ops
- [ ] Repository has zero milestones: milestone picker shows "No open milestones" in muted text
- [ ] No issues match active filters: list area shows "No issues match the current filters." with "Press `x` to clear filters." hint
- [ ] State filter change while pagination is loading: current fetch is abandoned; new fetch starts with updated state parameter
- [ ] Rapid `f` presses: each press cycles to the next state value; the API request uses the latest value (debounced 150ms from last keypress to avoid excessive API calls)
- [ ] Terminal resize while picker overlay is open: picker re-centers and resizes to fit new dimensions
- [ ] Terminal resize while toolbar is rendered: toolbar re-lays out within the new width, adding or removing filter chip detail as breakpoint changes
- [ ] Picker overlay opened at minimum terminal size: uses 90% width to ensure usability; list items show name only (no descriptions)
- [ ] Label with very long name (100+ chars): truncated in both toolbar and picker with `…`
- [ ] Label color is invalid hex: fallback to `muted` color for the `●` prefix
- [ ] API error on label fetch for picker: picker shows inline error "Failed to load labels. Press R to retry."
- [ ] API error on milestone fetch for picker: picker shows inline error "Failed to load milestones. Press R to retry."
- [ ] Unicode in label names, assignee logins, milestone titles: truncation respects grapheme clusters
- [ ] Filter active when issue list receives new page from pagination: client-side filters applied to incoming page items as they arrive
- [ ] User selects assignee who appears in zero currently-loaded issues: list shows empty state; as more pages load, matching issues may appear
- [ ] SSE disconnect: issue list filters are unaffected (uses REST, not SSE)

## Design

### Layout Structure

The filter toolbar integrates into the issue list screen layout:

```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Issues         │
├─────────────────────────────────────────────────┤
│ Issues (42)                                     │
│ State: Open │ Label: bug │ Sort: Recently created│
├─────────────────────────────────────────────────┤
│ # │ Title                    │ Labels │ Age     │
├─────────────────────────────────────────────────┤
│ ►42│ Fix login redirect       │ 🔴bug │ 3d     │
│  41│ Add dark mode support    │ 🟢enh │ 1w     │
│  40│ Update API docs          │ 📝doc │ 2w     │
│  …                                              │
├─────────────────────────────────────────────────┤
│ f:state  l:label  a:assignee  m:milestone  x:clear│
└─────────────────────────────────────────────────┘
```

### Component Structure

```tsx
<box flexDirection="column" width="100%" height="100%">
  {/* Title row */}
  <box flexDirection="row" justifyContent="space-between">
    <text bold color="primary">Issues ({totalCount})</text>
    {clientFilteredCount < totalCount && (
      <text color="muted">(showing {clientFilteredCount})</text>
    )}
  </box>

  {/* Filter toolbar */}
  <box flexDirection="row" gap={1} height={1}>
    <text>State: <text color="primary">{stateFilter}</text></text>
    <text color="border">│</text>
    {activeLabels.length > 0 && (
      <>
        <text>Label: {activeLabels.map(l => (
          <text><text color={l.color}>●</text> {truncate(l.name, 20)}</text>
        ))}</text>
        <text color="border">│</text>
      </>
    )}
    {activeAssignee && (
      <>
        <text>Assignee: <text color="primary">{truncate(activeAssignee, 20)}</text></text>
        <text color="border">│</text>
      </>
    )}
    {activeMilestone && (
      <>
        <text>Milestone: <text color="primary">{truncate(activeMilestone.title, 25)}</text></text>
        <text color="border">│</text>
      </>
    )}
    <text>Sort: <text color="primary">{sortOrder}</text></text>
  </box>

  {/* Issue list (scrollbox) */}
  <scrollbox flexGrow={1}>
    <box flexDirection="column">
      {filteredIssues.map(issue => (
        <IssueRow key={issue.id} issue={issue} focused={issue.id === focusedId} />
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
                     selected={isSelected(item)}
                     focused={item.id === pickerFocusedId} />
        ))}
      </scrollbox>
    </box>
  </box>
)}
```

### Picker Overlay Layout

```
┌─────────────── Select Label ──────────────┐
│ > Type to filter…                          │
├────────────────────────────────────────────┤
│ ✓ 🔴 bug         Confirmed software defect│
│   🟢 enhancement New feature or improvement│
│ ► 📝 documentation Docs changes            │
│   🟡 question    Further info requested    │
│   …                                        │
├────────────────────────────────────────────┤
│ Space:toggle  Enter:confirm  Esc:cancel    │
└────────────────────────────────────────────┘
```

- `✓` prefix indicates selected items (multi-select mode for labels)
- `►` indicates the focused/cursor item
- Colored `●` prefix for labels uses the label's `color` field converted to the nearest ANSI 256 color
- For assignees: no color prefix, just `login` name
- For milestones: title with due date shown in muted text (e.g., "v2.0 — due Jan 15")

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------|
| `f` | Cycle state filter (Open → Closed → All) | List focused, not in search input or picker |
| `o` | Cycle sort order | List focused, not in search input or picker |
| `l` | Open label picker overlay | List focused, not in picker |
| `a` | Open assignee picker overlay | List focused, not in picker |
| `m` | Open milestone picker overlay | List focused, not in picker |
| `x` | Clear all filters, reset to defaults | List focused, not in search input or picker |
| `j` / `Down` | Move cursor down in picker | Picker overlay open |
| `k` / `Up` | Move cursor up in picker | Picker overlay open |
| `Enter` | Confirm selection and close picker | Picker overlay open |
| `Space` | Toggle item selection | Label picker open (multi-select) |
| `Esc` | Close picker without applying | Picker overlay open |
| `G` | Jump to bottom of picker list | Picker overlay open |
| `g g` | Jump to top of picker list | Picker overlay open |

### Resize Behavior

- `useTerminalDimensions()` provides current `{ width, height }` for toolbar layout and picker sizing
- `useOnResize()` triggers synchronous re-layout of the filter toolbar and any open picker overlay
- At minimum breakpoint, toolbar collapses to state filter + condensed count; expanded labels/assignee/milestone chips hidden
- At standard+, toolbar expands to show all active filter chips
- Picker overlay width adjusts: 90% (minimum), 60% (standard), 50% (large)
- If a picker overlay is open during resize, it re-centers and resizes within the new terminal dimensions
- No animation — single-frame re-render

### Data Hooks

- `useIssues({ owner, repo, state, cursor, limit })` from `@codeplane/ui-core` — fetches the issue list with server-side state filter. Returns `{ items: IssueResponse[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void }`
- `useLabels({ owner, repo })` from `@codeplane/ui-core` — fetches all labels for the repository (for the label picker). Returns `{ items: LabelResponse[], isLoading: boolean, error: Error | null, retry: () => void }`
- `useMilestones({ owner, repo, state: "open" })` from `@codeplane/ui-core` — fetches open milestones (for the milestone picker). Returns `{ items: MilestoneResponse[], isLoading: boolean, error: Error | null, retry: () => void }`
- `useTerminalDimensions()` — provides terminal size for responsive breakpoint calculation
- `useOnResize()` — triggers synchronous re-layout on terminal resize
- `useKeyboard()` — registers keybinding handlers for filter shortcuts
- `useNavigation()` — provides `push()` for navigating to issue detail and `pop()` for back navigation

### Filter State Management

Filter state is local to the screen component:

```typescript
interface IssueFilterState {
  stateFilter: "open" | "closed" | "";  // "" = all
  sortOrder: "recently-created" | "recently-updated" | "oldest" | "most-commented" | "least-commented";
  labelFilters: string[];  // label names (AND logic)
  assigneeFilter: string | null;  // user login or null
  milestoneFilter: { id: number; title: string } | null;
}
```

- `stateFilter` changes trigger `useIssues()` re-fetch with updated `state` query param
- `sortOrder` changes re-sort the loaded items locally
- `labelFilters`, `assigneeFilter`, and `milestoneFilter` apply as client-side `.filter()` over the loaded items
- Filter state resets to defaults on screen mount (not persisted across navigation)

### Sort Comparators

| Sort Order | Comparator |
|------------|------------|
| Recently created | `issue.created_at` descending |
| Recently updated | `issue.updated_at` descending |
| Oldest first | `issue.created_at` ascending |
| Most commented | `issue.comment_count` descending, then `created_at` descending |
| Least commented | `issue.comment_count` ascending, then `created_at` descending |

### Loading States

- **Label picker loading**: Picker overlay shows centered spinner with "Loading labels…" while `useLabels()` is fetching
- **Milestone picker loading**: Picker overlay shows centered spinner with "Loading milestones…" while `useMilestones()` is fetching
- **Assignee list**: No separate fetch — assignees extracted from loaded issue data. Picker populates immediately
- **State filter change**: Issue list shows "Loading issues…" spinner while API re-fetches with new state
- **Sort change**: No loading state — locally loaded items re-sort immediately

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (read access) | Write access | Admin |
|--------|-----------|---------------------------|--------------|-------|
| View issue list with filters | ❌ | ✅ | ✅ | ✅ |
| Apply state/sort/label/assignee/milestone filters | ❌ | ✅ | ✅ | ✅ |
| View labels in picker | ❌ | ✅ | ✅ | ✅ |
| View milestones in picker | ❌ | ✅ | ✅ | ✅ |

- The issue list screen requires authentication. The TUI enforces authentication at bootstrap; unauthenticated sessions never reach this screen
- The issue list requires repository context (owner/repo). Navigation to this screen is gated by repository read access
- `GET /api/repos/:owner/:repo/issues` respects repository visibility — private repos require authenticated access
- `GET /api/repos/:owner/:repo/labels` and `GET /api/repos/:owner/:repo/milestones` follow the same read-access model
- No elevated role is required for filtering — all filter operations are read-only views of existing data
- Users see only issues, labels, and milestones belonging to repositories they have read access to — the API enforces visibility

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to the `@codeplane/ui-core` API client as a `Bearer` token in the `Authorization` header
- Token is never displayed in the TUI, never written to logs, never included in error messages or telemetry events
- 401 responses propagate to the app-shell-level auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- `GET /api/repos/:owner/:repo/issues`: 300 requests per minute per user
- `GET /api/repos/:owner/:repo/labels`: 300 requests per minute per user
- `GET /api/repos/:owner/:repo/milestones`: 300 requests per minute per user
- State filter cycling is debounced (150ms) to prevent excessive API calls from rapid `f` presses
- If 429 is returned, the affected component (list or picker) displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period

### Input Sanitization

- Filter values (state, sort) are from fixed enums — no user-controlled strings reach the API beyond the token and enum values
- Picker search input is client-side only — fuzzy search text is never sent to the API
- Label names, assignee logins, and milestone titles are rendered as plain `<text>` components (no injection vector)
- Label `color` field is validated as a hex color string before use; invalid values fall back to `muted`

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.issues.filters.view` | Filter toolbar rendered with issue list | `terminal_width`, `terminal_height`, `breakpoint`, `repo_full_name`, `default_state` |
| `tui.issues.filters.state_change` | User cycles state filter (`f`) | `new_state`, `previous_state`, `total_count`, `repo_full_name` |
| `tui.issues.filters.sort_change` | User cycles sort order (`o`) | `new_sort`, `previous_sort`, `loaded_count`, `repo_full_name` |
| `tui.issues.filters.label_picker_open` | User opens label picker (`l`) | `available_labels_count`, `repo_full_name` |
| `tui.issues.filters.label_applied` | User confirms label selection in picker | `selected_labels`, `selected_count`, `available_count`, `repo_full_name` |
| `tui.issues.filters.assignee_picker_open` | User opens assignee picker (`a`) | `available_assignees_count`, `repo_full_name` |
| `tui.issues.filters.assignee_applied` | User confirms assignee selection | `selected_assignee`, `matched_count`, `repo_full_name` |
| `tui.issues.filters.milestone_picker_open` | User opens milestone picker (`m`) | `available_milestones_count`, `repo_full_name` |
| `tui.issues.filters.milestone_applied` | User confirms milestone selection | `selected_milestone_title`, `matched_count`, `repo_full_name` |
| `tui.issues.filters.clear_all` | User clears all filters (`x`) | `cleared_state`, `cleared_labels_count`, `cleared_assignee`, `cleared_milestone`, `repo_full_name` |
| `tui.issues.filters.picker_dismissed` | User dismisses picker without applying (`Esc`) | `picker_type` (label/assignee/milestone), `repo_full_name` |
| `tui.issues.filters.no_results` | Active filters produce zero visible issues | `state_filter`, `active_labels`, `assignee_filter`, `milestone_filter`, `total_loaded_count`, `repo_full_name` |
| `tui.issues.filters.error` | Label or milestone fetch fails in picker | `picker_type`, `http_status`, `error_type`, `repo_full_name` |

### Success Indicators

- **Filter adoption rate**: percentage of issue list views where the user changes at least one filter beyond the default. Target: >30%
- **State filter usage**: percentage of views where the user cycles state. Target: >25%
- **Label filter usage**: percentage of views where the user opens the label picker. Target: >15%
- **Assignee filter usage**: percentage of views where the user opens the assignee picker. Target: >10%
- **Milestone filter usage**: percentage of views where the user opens the milestone picker. Target: >8%
- **Sort usage**: percentage of views where the user changes sort order. Target: >12%
- **Clear-all usage**: percentage of filter sessions where the user uses `x` to reset. Target: >5%
- **Picker completion rate**: percentage of picker opens that result in a confirmed selection (vs. Esc dismiss). Target: >60%
- **No-results rate**: percentage of filter combinations that produce zero visible issues. Target: <10%
- **Filter error rate**: percentage of picker opens that encounter an API error. Target: <2%

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | Filter toolbar initialized | `repo_full_name`, `default_state`, `total_count` |
| `info` | State filter changed | `new_state`, `previous_state`, triggers re-fetch |
| `info` | Label filter applied | `selected_labels[]`, `matched_count` |
| `info` | Assignee filter applied | `assignee_login`, `matched_count` |
| `info` | Milestone filter applied | `milestone_title`, `milestone_id`, `matched_count` |
| `info` | All filters cleared | Previously active filters listed |
| `warn` | Label fetch failed in picker | `http_status`, `error_message` (token redacted) |
| `warn` | Milestone fetch failed in picker | `http_status`, `error_message` (token redacted) |
| `warn` | Rate limited on filter-triggered fetch | `retry_after_seconds`, `endpoint` |
| `warn` | Filters produced zero results | `state_filter`, `labels`, `assignee`, `milestone`, `total_loaded` |
| `debug` | State filter cycled | `new_state` |
| `debug` | Sort order cycled | `new_sort` |
| `debug` | Label picker opened | `available_count` |
| `debug` | Assignee picker opened | `available_count` |
| `debug` | Milestone picker opened | `available_count` |
| `debug` | Picker dismissed without selection | `picker_type` |
| `debug` | Picker search text changed | `search_length`, `matched_items_count` |
| `debug` | Client-side filter applied to new page | `page_number`, `pre_filter_count`, `post_filter_count` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Label fetch fails (network/500) | `useLabels()` returns `error` | Picker shows inline error: "Failed to load labels. Press R to retry." Picker remains open for retry |
| Milestone fetch fails (network/500) | `useMilestones()` returns `error` | Picker shows inline error: "Failed to load milestones. Press R to retry." Picker remains open for retry |
| Auth token expired (401) on label/milestone fetch | API returns 401 | Picker closes. Propagated to app-shell auth error screen |
| Rate limited (429) on state filter change | API returns 429 | Issue list shows inline: "Rate limited. Retry in Ns." Filter toolbar retains previous state |
| Rate limited (429) on label/milestone fetch | API returns 429 | Picker shows inline: "Rate limited. Retry in Ns." |
| State filter API returns empty with non-zero count | `items.length === 0 && totalCount > 0` | Treated as end of pagination. Filter state preserved |
| Terminal resize during picker overlay | `useOnResize` fires while picker is open | Picker re-centers and resizes. Selection state preserved. Focus preserved |
| Terminal resize during state filter fetch | `useOnResize` fires during API call | Fetch continues. Re-render at new size when data arrives |
| Rapid `f` key presses (state cycling) | Multiple keydown events within 150ms | Debounced — only the final state value triggers an API request |
| Picker opened with zero items after loading | `items.length === 0 && !isLoading` | Picker shows empty state message. `Enter` is no-op. `Esc` closes |
| Invalid label color in API response | `color` field is not valid hex | `●` prefix uses `muted` color fallback |
| Concurrent picker open + page navigation | User presses `Enter` while picker is open | Picker consumes `Enter` — does not navigate away. Issue list stays |
| React error boundary in filter component | Unhandled exception | App-shell error boundary renders error screen with restart/quit options |

### Failure Modes

- **Label/milestone fetch failure**: Only the picker is affected. The issue list continues to display and remain navigable. User can close the picker and continue using state/sort filters
- **State filter API failure**: Issue list shows error state for the list area. Filter toolbar remains visible and interactive. Previous data is cleared. `R` retries
- **Client-side filter produces zero results**: Empty state shown in list. Toolbar remains interactive. User can modify or clear filters. No error logged (this is normal behavior)
- **Memory**: Label/milestone data cached per picker session. No unbounded growth. Cache cleared when screen unmounts

## Verification

### Test File: `e2e/tui/issues.test.ts`

### Terminal Snapshot Tests

- **issue-filters-toolbar-default**: Navigate to issue list (`g i`) at 120×40 → snapshot shows filter toolbar with "State: Open │ Sort: Recently created" in toolbar row below title
- **issue-filters-toolbar-state-closed**: Navigate to issues, press `f` → toolbar shows "State: Closed"
- **issue-filters-toolbar-state-all**: Navigate to issues, press `f` twice → toolbar shows "State: All"
- **issue-filters-toolbar-with-label**: Navigate to issues, press `l`, select "bug" label, press `Enter` → toolbar shows "State: Open │ Label: ●bug │ Sort: Recently created"
- **issue-filters-toolbar-with-multiple-labels**: Select "bug" and "enhancement" labels → toolbar shows "Label: ●bug, ●enhancement"
- **issue-filters-toolbar-with-assignee**: Press `a`, select "alice", `Enter` → toolbar shows "Assignee: alice"
- **issue-filters-toolbar-with-milestone**: Press `m`, select "v2.0", `Enter` → toolbar shows "Milestone: v2.0"
- **issue-filters-toolbar-all-active**: Activate state, label, assignee, and milestone filters → toolbar shows all chips separated by `│`
- **issue-filters-toolbar-cleared**: Press `x` with active filters → toolbar returns to "State: Open │ Sort: Recently created"
- **issue-filters-label-picker-open**: Press `l` → centered modal overlay with "Select Label" title, search input, and list of labels with colored `●` prefixes
- **issue-filters-label-picker-search**: In label picker, type "bu" → list narrows to labels containing "bu"
- **issue-filters-label-picker-selected**: In label picker, press `Space` on "bug" → `✓` prefix appears on "bug" row
- **issue-filters-label-picker-empty**: Repository has zero labels → picker shows "No labels defined" in muted text
- **issue-filters-assignee-picker-open**: Press `a` → centered modal with "Select Assignee" title and list of user logins
- **issue-filters-milestone-picker-open**: Press `m` → centered modal with "Select Milestone" title and list of milestone titles
- **issue-filters-milestone-picker-empty**: Repository has zero milestones → picker shows "No open milestones"
- **issue-filters-no-results**: Apply label filter that matches no issues → list shows "No issues match the current filters." with "Press `x` to clear filters."
- **issue-filters-showing-count**: Apply client-side filter → header shows "Issues (42) (showing 5)" when 5 of 42 match
- **issue-filters-sort-label**: Press `o` → toolbar sort changes to "Sort: Recently updated"
- **issue-filters-label-picker-loading**: Press `l` before labels are fetched → picker shows "Loading labels…" spinner
- **issue-filters-label-picker-error**: Label fetch fails → picker shows "Failed to load labels. Press R to retry." in red
- **issue-filters-status-bar-hints**: Issue list focused → status bar shows `f:state  l:label  a:assignee  m:milestone  o:sort  x:clear`

### Keyboard Interaction Tests

- **issue-filters-f-cycles-state-open-to-closed**: Default state is "Open", press `f` → state changes to "Closed", API re-fetched with `state=closed`
- **issue-filters-f-cycles-closed-to-all**: State is "Closed", press `f` → state changes to "All", API re-fetched with `state=`
- **issue-filters-f-cycles-all-to-open**: State is "All", press `f` → state changes to "Open", API re-fetched with `state=open`
- **issue-filters-o-cycles-sort**: Press `o` five times → sort cycles through all five options and returns to "Recently created"
- **issue-filters-l-opens-label-picker**: Press `l` → label picker overlay appears, focus is on first label
- **issue-filters-label-picker-jk-navigation**: In label picker, press `j` → focus moves to second label. Press `k` → focus returns to first
- **issue-filters-label-picker-space-toggles**: In label picker, press `Space` → focused label toggles selection (✓ appears/disappears)
- **issue-filters-label-picker-enter-confirms**: In label picker, select "bug" with `Space`, press `Enter` → picker closes, toolbar shows "Label: ●bug", list filtered
- **issue-filters-label-picker-esc-cancels**: In label picker, select "bug" with `Space`, press `Esc` → picker closes, no filter applied
- **issue-filters-label-picker-multi-select**: In label picker, `Space` on "bug", `j`, `Space` on "enhancement", `Enter` → both labels active in toolbar
- **issue-filters-a-opens-assignee-picker**: Press `a` → assignee picker overlay appears
- **issue-filters-assignee-picker-enter-selects**: In assignee picker, press `Enter` → focused assignee selected, picker closes, list filtered
- **issue-filters-m-opens-milestone-picker**: Press `m` → milestone picker overlay appears
- **issue-filters-milestone-picker-enter-selects**: In milestone picker, press `Enter` → focused milestone selected, picker closes, list filtered
- **issue-filters-x-clears-all**: Apply label + assignee + milestone filters, press `x` → all filters cleared, state reset to "Open"
- **issue-filters-x-no-op-at-defaults**: Press `x` with default filters → no change, no API call
- **issue-filters-f-suppressed-in-search**: Press `/` then `f` → 'f' typed in search input, state filter unchanged
- **issue-filters-l-suppressed-in-search**: Press `/` then `l` → 'l' typed in search input, no picker opened
- **issue-filters-picker-search-filters-list**: In label picker, type "en" → only labels with "en" in name shown
- **issue-filters-picker-G-jumps-bottom**: In picker, press `G` → focus moves to last item
- **issue-filters-picker-gg-jumps-top**: In picker, press `G` then `g g` → focus moves to first item
- **issue-filters-rapid-f-debounced**: Press `f` 5 times in 100ms → only one API request sent (for final state value)
- **issue-filters-enter-in-picker-no-navigation**: With picker open, `Enter` selects picker item, does NOT navigate to issue detail
- **issue-filters-j-in-picker-no-list-nav**: With picker open, `j` navigates within picker, NOT the issue list behind it
- **issue-filters-state-change-resets-pagination**: With 3 pages loaded, press `f` → pagination resets, fresh fetch from page 1
- **issue-filters-sort-reorders-locally**: With issues loaded, press `o` → list re-sorted immediately without API call
- **issue-filters-client-filter-on-loaded-data**: Select label "bug" → only issues with "bug" label shown from loaded data
- **issue-filters-R-retries-in-picker**: Label picker shows error, press `R` → label fetch retried
- **issue-filters-q-pops-with-filters-active**: Apply filters, press `q` → screen pops (filters not persisted)

### Responsive Tests

- **issue-filters-80x24-toolbar-collapsed**: Terminal 80×24 → toolbar shows only "Open" state and "+2 filters" when label and assignee are active
- **issue-filters-80x24-picker-width**: Terminal 80×24, press `l` → label picker uses 90% of terminal width (72 columns)
- **issue-filters-80x24-picker-no-descriptions**: Terminal 80×24, label picker → only label names shown, no descriptions
- **issue-filters-80x24-label-truncation**: Terminal 80×24, label with 40-char name → truncated to 30 chars with `…` in picker
- **issue-filters-120x40-toolbar-full**: Terminal 120×40 → toolbar shows all filter chips inline with separators
- **issue-filters-120x40-picker-width**: Terminal 120×40, press `l` → label picker uses 60% of terminal width (72 columns)
- **issue-filters-120x40-label-descriptions**: Terminal 120×40, label picker at standard → label descriptions may be hidden (shown only at large)
- **issue-filters-200x60-toolbar-full**: Terminal 200×60 → toolbar shows all chips with extra padding
- **issue-filters-200x60-picker-width**: Terminal 200×60, press `l` → label picker uses 50% of terminal width (100 columns)
- **issue-filters-200x60-label-descriptions**: Terminal 200×60, label picker → shows label descriptions alongside names
- **issue-filters-resize-standard-to-min**: Resize from 120×40 → 80×24 with filters active → toolbar collapses to state + count, chips hidden
- **issue-filters-resize-min-to-standard**: Resize from 80×24 → 120×40 with filters active → toolbar expands to show all chips
- **issue-filters-resize-with-picker-open**: Resize while label picker is open → picker re-centers and adjusts width to new breakpoint
- **issue-filters-resize-preserves-filter-state**: Resize at any size → all filter state (state, labels, assignee, milestone, sort) preserved
- **issue-filters-resize-preserves-picker-selection**: Resize while in label picker with selections → selections preserved, focus preserved

### Integration Tests

- **issue-filters-state-open-api-call**: Default mount → API called with `state=open` query parameter
- **issue-filters-state-closed-api-call**: Press `f` → API called with `state=closed`
- **issue-filters-state-all-api-call**: Press `f` twice → API called with `state=` (empty = all)
- **issue-filters-label-fetch-on-picker**: Press `l` → `GET /api/repos/:owner/:repo/labels` called
- **issue-filters-milestone-fetch-on-picker**: Press `m` → `GET /api/repos/:owner/:repo/milestones?state=open` called
- **issue-filters-no-assignee-fetch**: Press `a` → no separate API call; assignees extracted from loaded issue data
- **issue-filters-label-filter-client-side**: Select "bug" label → list shows only issues with "bug" in `labels[]` array
- **issue-filters-assignee-filter-client-side**: Select "alice" assignee → list shows only issues where `assignees` contains "alice" or `author.login` is "alice"
- **issue-filters-milestone-filter-client-side**: Select milestone with id=5 → list shows only issues where `milestone_id === 5`
- **issue-filters-combined-filters**: State "Closed" + Label "bug" + Assignee "alice" → API returns closed issues, client filters to bugs assigned to alice
- **issue-filters-auth-expiry-in-picker**: 401 on label fetch → picker closes, app-shell auth error screen shown
- **issue-filters-rate-limit-on-state-change**: 429 on issue fetch → inline "Rate limited. Retry in Ns.", filter toolbar shows previous state
- **issue-filters-rate-limit-in-picker**: 429 on label fetch → picker shows inline "Rate limited. Retry in Ns."
- **issue-filters-pagination-with-client-filters**: Load page 2 with label filter active → new page items filtered client-side, matching items added to visible list
- **issue-filters-labels-cached-across-opens**: Open label picker, close, open again → labels not re-fetched (cached for screen lifetime)
- **issue-filters-milestones-cached-across-opens**: Open milestone picker, close, open again → milestones not re-fetched (cached for screen lifetime)
- **issue-filters-state-change-clears-pages**: Change state filter → previously loaded pages discarded, fresh fetch from page 1
- **issue-filters-navigate-away-and-back**: Navigate to issue detail (`Enter`), press `q` to return → filter state reset to defaults
- **issue-filters-server-error-on-state-change**: 500 on issue fetch after state change → error state in list, toolbar retains new state value for retry

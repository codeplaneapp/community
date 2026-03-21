# TUI_REPO_SEARCH_FILTER

Specification for TUI_REPO_SEARCH_FILTER.

## High-Level User POV

The repository search and filter feature provides a unified, keyboard-driven search and filtering surface that operates within the context of a single repository. It is activated from any repository sub-screen — the overview, bookmarks, changes, code explorer, conflicts, operation log, or settings view — by pressing `/` to open an inline search input, or by interacting with dedicated filter controls on screens that support structured filtering (issues list, landings list, etc.).

This feature is distinct from both the global search screen (`g s`) and the repository list screen's filter. Global search operates across all repositories and entity types. The repository list filter narrows the list of repositories themselves. TUI_REPO_SEARCH_FILTER operates within a single repository context, helping the user find and narrow down content — issues, landing requests, bookmarks, changes, files, and wiki pages — that belongs to the currently active repository.

When the user navigates into a repository, the repository context is established and persisted across all sub-screens within that repository's navigation scope. The search and filter feature is context-aware: it knows which repository tab is active and adapts its behavior accordingly. On the issues tab, `/` opens a search input that filters issues by title, body, and label text. On the code explorer tab, `/` filters the file tree by path. On the bookmarks tab, `/` filters bookmark names. Each sub-screen defines what "search" means for its content, but the activation pattern, visual treatment, and keyboard interactions are consistent.

The search input appears inline — directly below the tab bar on tabbed views, or at the top of the content area on full-screen sub-views. It does not use a modal overlay. The input shows a magnifying glass icon (`🔍`) followed by the query text and a blinking cursor. As the user types, results in the main content area narrow in real-time with no perceptible delay. Matching text is not highlighted within results (terminal constraint), but the matched/filtered item count is shown next to the search input (e.g., "3 of 42 issues"). Pressing `Esc` clears the search text, restores the full unfiltered view, and returns focus to the content list.

Beyond text search, this feature includes structured filter controls accessible via single-key shortcuts. On screens that support them, the user can cycle through filter dimensions: state filters (open/closed/all) with `f`, label filters with `l`, assignee filters with `a`, and sort order with `o`. Each filter dimension cycles through its available values on each keypress, and the current filter state is displayed in a filter toolbar between the search input and the content list. Multiple filters compose — a user can search for "auth" in open issues assigned to "alice" sorted by most recently updated.

The filter toolbar is persistent when any filter is active (non-default). When all filters are at their default values and no search text is entered, the toolbar collapses to a single-line hint showing available filter shortcuts. At minimum terminal size (80×24), the filter toolbar shows only the active filter values as abbreviated badges (e.g., `[open] [alice]`). At standard size (120×40), full labels are shown. At large size (200×60+), labels include counts.

The filter state is local to the current repository tab and is not persisted across navigation. Navigating away from a repo sub-screen and returning resets all filters to their defaults. When filters produce zero results, a centered empty state message is shown: "No results match the current filters." with a hint "Press `Esc` to clear search, or adjust filters." Search is performed client-side against already-loaded data for small result sets (under 200 items). For larger data sets or when the API supports server-side search, the query is debounced by 300ms and sent as an API query parameter.

## Acceptance Criteria

### Definition of Done

- [ ] Pressing `/` on any repository sub-screen activates an inline search input within the repository context
- [ ] The search input renders inline below the tab bar (on tabbed views) or at the top of the content area (on full-screen sub-views)
- [ ] The search input shows a `🔍` icon, the query text, and a blinking cursor when focused
- [ ] The matched/filtered item count is displayed adjacent to the search input (e.g., "3 of 42 issues")
- [ ] Typing in the search input filters content in real-time with no perceptible delay for client-side filtering
- [ ] For server-side search, queries are debounced by 300ms before API dispatch
- [ ] Pressing `Esc` clears the search text, restores the full unfiltered view, and returns focus to the content list
- [ ] Pressing `Esc` when no search text is active behaves as `q` (pop screen or close overlay)
- [ ] Search is case-insensitive substring matching
- [ ] Search is context-aware: filters the relevant entity type for the active sub-screen (issues by title/body/label, files by path, bookmarks by name, changes by description, wiki by title/body)
- [ ] Structured filter controls are accessible via single-key shortcuts when the list is focused (not when the search input is focused)
- [ ] Filter shortcut keys (`f`, `l`, `a`, `o`) cycle through available values for their respective dimension
- [ ] Multiple filters compose (text search + state + assignee + sort all apply simultaneously)
- [ ] The filter toolbar is visible when any non-default filter is active
- [ ] The filter toolbar collapses to a hint line when all filters are at defaults and no search text is entered
- [ ] Filter state is local to the current repository tab instance and resets on navigation
- [ ] Zero-result empty state shows "No results match the current filters." with hint to clear or adjust
- [ ] The empty state leaves the filter toolbar visible so filters can be adjusted inline
- [ ] Unicode in search queries and content is handled correctly (grapheme-aware matching)
- [ ] The search input accepts a maximum of 120 characters; additional characters are silently ignored

### Keyboard Interactions

- [ ] `/`: Focus the inline search input (from any content-focused state within a repo sub-screen)
- [ ] `Esc`: Clear search text and return focus to content list. If no search is active, behave as `q`
- [ ] `f`: Cycle state filter (All → Open → Closed) — issues and landings screens only
- [ ] `l`: Open label filter selector — issues screen only
- [ ] `a`: Open assignee filter selector — issues and landings screens only
- [ ] `o`: Cycle sort order (context-dependent: varies by sub-screen)
- [ ] `j` / `k` in search input: Typed as literal characters, not list navigation
- [ ] `f` / `l` / `a` / `o` in search input: Typed as literal characters, not filter actions
- [ ] `Enter` in search input: Return focus to the content list with the current filter applied (does not clear search)
- [ ] `Ctrl+U` in search input: Clear the search text without leaving the input
- [ ] `Backspace` in search input: Delete last character from query

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the app shell router
- [ ] 80×24 – 119×39 (minimum): Filter toolbar shows abbreviated badges only (`[open] [alice]`). Search input occupies full width. No filter labels
- [ ] 120×40 – 199×59 (standard): Filter toolbar shows full labels (`State: Open │ Assignee: alice │ Sort: Recent`). Search input width up to 60 characters visible
- [ ] 200×60+ (large): Filter toolbar shows labels with counts (`State: Open (15) │ Assignee: alice (3) │ Sort: Recently updated`). Search input width up to 80 characters visible

### Truncation and Boundary Constraints

- [ ] Search input text: max 120 characters; truncated visually from the left when the cursor is at the end and the text exceeds visible width
- [ ] Filter toolbar badges at minimum size: max 8 characters per badge, truncated with `…`
- [ ] Filter toolbar labels at standard size: max 30 characters per label, truncated with `…`
- [ ] Matched count display: abbreviated above 9999 (e.g., "10k+")
- [ ] Label filter values: max 40 characters, truncated with `…`
- [ ] Assignee names: max 20 characters, truncated with `…`
- [ ] Sort order labels: max 25 characters

### Edge Cases

- [ ] Terminal resize while search input is focused: input remains focused, toolbar re-layouts, content re-renders
- [ ] Rapid typing: every keystroke triggers synchronous client-side filter; server-side filter debounced at 300ms. No input loss
- [ ] Search during active pagination: client-side filter applied to all loaded items; new pages filtered as they arrive
- [ ] Filter cycle on screens without that filter dimension: keypress is a no-op
- [ ] SSE disconnect during search: search unaffected (uses loaded data or REST)
- [ ] Pasting text into search input: full pasted string applied, truncated to 120 characters
- [ ] Search query containing regex special characters: treated as literal text, not regex
- [ ] Empty repository: empty state shown immediately, no search input rendered
- [ ] Filter toolbar overflow at minimum terminal width: badges wrap to second line if more than 3 active filters
- [ ] Server-side search error: inline error replaces results with "Search failed. Press R to retry."
- [ ] Debounced search canceled by Esc: pending API request aborted, no stale results rendered

## Design

### Layout Structure

The repo search/filter feature is an inline component that renders within the repository sub-screen's content area, not a separate screen. It inserts itself between the tab bar and the content list.

**Standard layout (120×40, issues tab active, filters active):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > acme/api-gateway > Issues                   │
├─────────────────────────────────────────────────────────────────┤
│ Bookmarks │ Changes │ Code │ ▸Issues │ Landings │ Settings      │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 auth█                                          3 of 42       │
│ State: Open │ Assignee: alice │ Sort: Recently updated          │
├─────────────────────────────────────────────────────────────────┤
│ ► #38  Fix auth token refresh logic         alice    2h ago     │
│   #25  Add OAuth2 provider auth support     alice    3d ago     │
│   #12  Auth middleware rate limiting        alice    1w ago      │
├─────────────────────────────────────────────────────────────────┤
│ Status: j/k:nav  /:search  f:state  a:assignee  o:sort  q:back │
└─────────────────────────────────────────────────────────────────┘
```

**Minimum layout (80×24, collapsed toolbar):**

```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard > acme/api-gateway > Issues                         │
├──────────────────────────────────────────────────────────────┤
│ 🔍 auth█                                       3 of 42       │
│ [open] [alice]                                                │
├──────────────────────────────────────────────────────────────┤
│ ► #38  Fix auth token refresh…          2h                    │
│   #25  Add OAuth2 provider auth…        3d                    │
│   #12  Auth middleware rate lim…         1w                    │
├──────────────────────────────────────────────────────────────┤
│ /:search f:state a:assignee o:sort q:back                     │
└──────────────────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI + React 19)

Uses `<box>`, `<scrollbox>`, `<text>`, and `<input>` OpenTUI components in a vertical flexbox layout. The search input row contains the magnifying glass icon, `<input>` element, and matched count display. The filter toolbar renders conditionally when non-default filters are active, using `<text>` with semantic color tokens. The content area is a `<scrollbox>` containing filtered result rows rendered by the parent sub-screen's `renderRow` function.

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------||
| `/` | Focus inline search input | Content list focused |
| `Esc` | Clear search text and return focus to list | Search input focused |
| `Esc` | Pop screen (if no search active) | Content list focused, no active search |
| `Enter` (in search) | Return focus to content list, keep filter applied | Search input focused |
| `Backspace` | Delete last character | Search input focused |
| `Ctrl+U` | Clear search text | Search input focused |
| `f` | Cycle state filter (All → Open → Closed) | Content list focused, issues/landings |
| `l` | Open label filter selector | Content list focused, issues |
| `a` | Cycle assignee filter | Content list focused, issues/landings |
| `o` | Cycle sort order | Content list focused |
| `R` | Retry failed server-side search | Error state displayed |

### Responsive Behavior

`useTerminalDimensions()` provides breakpoint calculation. `useOnResize()` triggers synchronous re-layout. Filter toolbar switches between badge mode (80×24), label mode (120×40), and label+count mode (200×60+). Search input width adapts to terminal width. Content list columns follow parent sub-screen responsive rules. Focused row preserved across resize.

### Data Hooks

| Hook | Source | Purpose |
|------|--------|----------|
| `useRepoContext()` | `@codeplane/ui-core` | Current repository owner/name |
| `useIssues()` | `@codeplane/ui-core` | Issue list with filtering |
| `useLandings()` | `@codeplane/ui-core` | Landing request list with filtering |
| `useRepoTree()` | `@codeplane/ui-core` | File tree for code explorer |
| `useSearch()` | `@codeplane/ui-core` | Server-side search |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size |
| `useOnResize()` | `@opentui/react` | Resize events |
| `useKeyboard()` | `@opentui/react` | Keyboard events |
| `useNavigation()` | TUI app shell | Screen push/pop |

### Context-Specific Search Behavior

| Sub-Screen | Search Target | Filter Dimensions | Sort Options |
|------------|---------------|-------------------|-------------|
| Issues | Title, body, label text | State, Label, Assignee | Recently updated, Newest, Oldest, Most commented |
| Landings | Title, description | State, Reviewer | Recently updated, Newest, Oldest |
| Bookmarks | Bookmark name | — | Name A–Z, Name Z–A, Recently updated |
| Changes | Description, change ID | — | Topological, Chronological |
| Code Explorer | File path (fuzzy) | — | Name A–Z, Name Z–A |
| Conflicts | File path, conflict type | — | — |
| Operation Log | Operation description | — | Chronological |
| Wiki | Page title, body | — | Name A–Z, Recently updated |

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| Search/filter within a public repository | ❌ | ✅ | ✅ |
| Search/filter within a private repository (with access) | ❌ | ✅ | ✅ |
| Search/filter within a private repository (without access) | ❌ | ❌ | ✅ |

- The repository search/filter feature requires authentication. The TUI enforces authentication at bootstrap; unauthenticated sessions never reach any repository screen
- Search/filter respects the same visibility rules as the underlying data — if a user cannot see an issue, it will not appear in filtered results
- No elevated role (admin, org owner) is required to use search/filter within an accessible repository
- The API enforces visibility: `GET /api/repos/:owner/:repo/issues` only returns issues the authenticated user can see
- Label and assignee filter options are populated from API responses, not user input — they cannot reference entities the user lacks access to

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to the `@codeplane/ui-core` API client as a `Bearer` token in the `Authorization` header
- Token is never displayed in the TUI, never written to logs, never included in error messages
- 401 responses on search API calls propagate to the app-shell-level auth error screen
- Search queries are not logged with tokens or sent to any analytics service in raw form

### Rate Limiting

- Server-side search queries: subject to 300 requests per minute per authenticated user
- Client-side filtering: no API calls, no rate limit impact
- If 429 is returned on a server-side search, the results area displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit — user presses `R` after the retry-after period
- Debouncing (300ms) on server-side search queries reduces API call volume during rapid typing

### Input Sanitization

- Client-side search text is used for local substring matching only — never executed as a query
- When search text is sent to the API, it is URL-encoded by the API client
- Filter dimension values are from fixed enums or server-provided option lists — no arbitrary user strings reach the API beyond the search query
- Content rendered as plain `<text>` components (no injection vector)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.search.activate` | User presses `/` to focus search input | `repo_full_name`, `sub_screen`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.repo.search.query` | Search query changes (debounced 500ms for analytics) | `repo_full_name`, `sub_screen`, `query_length`, `matched_count`, `total_count`, `is_server_side` |
| `tui.repo.search.clear` | User clears search via `Esc` or `Ctrl+U` | `repo_full_name`, `sub_screen`, `query_length_before_clear`, `time_searching_ms` |
| `tui.repo.search.select` | User selects a filtered result | `repo_full_name`, `sub_screen`, `query_length`, `position_in_filtered_list`, `matched_count` |
| `tui.repo.filter.state_change` | User cycles state filter via `f` | `repo_full_name`, `sub_screen`, `new_state`, `previous_state`, `matched_count` |
| `tui.repo.filter.label_change` | User selects a label filter via `l` | `repo_full_name`, `sub_screen`, `label_name`, `matched_count` |
| `tui.repo.filter.assignee_change` | User cycles assignee filter via `a` | `repo_full_name`, `sub_screen`, `new_assignee`, `previous_assignee`, `matched_count` |
| `tui.repo.filter.sort_change` | User cycles sort order via `o` | `repo_full_name`, `sub_screen`, `new_sort`, `previous_sort` |
| `tui.repo.search.zero_results` | Filter combination produces zero matches | `repo_full_name`, `sub_screen`, `query_length`, `active_filters` |
| `tui.repo.search.error` | Server-side search fails | `repo_full_name`, `sub_screen`, `error_type`, `http_status` |
| `tui.repo.search.retry` | User presses `R` to retry | `repo_full_name`, `sub_screen`, `retry_success` |

### Success Indicators

- **Search adoption rate**: ≥25% of repository screen views include search activation
- **Filter adoption rate**: ≥15% of repository screen views include structured filter use
- **Search-to-select rate**: ≥50% of search activations result in selecting a result
- **Zero-result rate**: <15% of queries produce zero matches
- **Filter composition rate**: ≥10% of filter sessions combine 2+ dimensions
- **Search query length**: average 3–12 characters
- **Time to first result selection**: median <5 seconds
- **Error rate**: <2% of server-side searches fail
- **Retry success rate**: ≥80% of retries succeed

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|----------|
| `info` | Search activated | `repo_full_name`, `sub_screen` |
| `info` | Result selected from filtered list | `repo_full_name`, `sub_screen`, `item_type`, `item_id`, `position` |
| `info` | Server-side search dispatched | `repo_full_name`, `sub_screen`, `query_length`, `debounce_wait_ms` |
| `warn` | Server-side search failed | `http_status`, `error_message` (token redacted) |
| `warn` | Rate limited on search | `retry_after_seconds`, `repo_full_name` |
| `warn` | Search produced zero results | `query_text`, `active_filters` |
| `warn` | Search request aborted | `repo_full_name`, `query_length` |
| `debug` | Client-side filter applied | `query_length`, `matched_count`, `total_count`, `filter_time_ms` |
| `debug` | State/label/assignee/sort filter changed | filter-specific fields |
| `debug` | Search input cleared | `query_length_before_clear`, `clear_method` |
| `debug` | Filter state reset (navigation) | `sub_screen`, `had_active_filters` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on server-side search | API client timeout (10s) | "Search failed. Press R to retry." Filter toolbar remains visible |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 | "Rate limited. Retry in Ns." User presses `R` |
| Server error (500+) | API returns 5xx | "Search error. Press R to retry." |
| Terminal resize while search focused | `useOnResize` fires | Input stays focused, toolbar re-layouts, content re-renders |
| Terminal resize during server-side search | `useOnResize` during fetch | Fetch continues, results render at new size |
| SSE disconnect during search | Status bar indicator | Search unaffected (REST-based) |
| Rapid typing triggers multiple searches | Debounce resets | Only final query dispatched, in-flight requests aborted |
| Navigation during pending search | Push/pop detected | Request aborted, no stale results |
| Filter not available for sub-screen | Keypress for unavailable filter | No-op, no error |
| React error boundary in search component | Unhandled exception | Parent sub-screen error boundary recovers |
| Empty repository | totalCount === 0 | Search input not rendered, empty state shown |
| Client-side filter > 16ms | Performance threshold | Logged at `warn`, no user degradation |

### Failure Modes

- **Server-side search failure**: Error replaces results area. Filter toolbar and search input remain visible. `R` retries
- **Stale filter state after error**: On retry success, all filters re-applied to fresh data
- **Memory pressure**: Client-side filtering capped at parent pagination limit. Server-side search returns paginated results
- **Debounce race condition**: Only most recent query's results rendered; older responses discarded via request ID matching

## Verification

### Test File: `e2e/tui/repository.test.ts`

### Terminal Snapshot Tests

- **repo-search-filter-inactive-state**: Navigate to repo issues tab at 120×40 → snapshot shows filter hint line in muted text below tab bar
- **repo-search-filter-input-focused**: Press `/` → snapshot shows `🔍` icon with cursor in search input, "0 of N" count
- **repo-search-filter-query-typed**: Press `/`, type "auth" → snapshot shows `🔍 auth█` with "3 of 42" count, narrowed list
- **repo-search-filter-zero-results**: Press `/`, type "xyznonexistent" → snapshot shows "0 of 42" count, centered empty state message
- **repo-search-filter-toolbar-standard**: Press `f` at 120×40 → snapshot shows "State: Open │ Sort: Recently updated"
- **repo-search-filter-toolbar-minimum**: Press `f` at 80×24 → snapshot shows "[open]" badge
- **repo-search-filter-toolbar-large**: Press `f` at 200×60 → snapshot shows "State: Open (15)"
- **repo-search-filter-toolbar-multiple**: Set state + assignee at 120×40 → snapshot shows both filter labels
- **repo-search-filter-combined-text-and-state**: Type "auth" + set Open → snapshot shows both active
- **repo-search-filter-on-bookmarks-tab**: On bookmarks, type "main" → bookmark list filtered
- **repo-search-filter-on-code-explorer**: On code tab, type "src/comp" → file tree filtered
- **repo-search-filter-sort-label**: Press `o` → snapshot shows "Sort: Newest"
- **repo-search-filter-empty-repo**: Empty repo → "No issues" centered, no search input
- **repo-search-filter-error-state**: Search fails → "Search failed. Press R to retry." with toolbar visible

### Keyboard Interaction Tests

- **repo-search-slash-focuses-input**: Press `/` → search input focused
- **repo-search-esc-clears-and-returns**: Type "test", Esc → cleared, focus returns to list
- **repo-search-esc-no-search-pops-screen**: No search active, Esc → screen pops
- **repo-search-enter-returns-focus**: Type "auth", Enter → focus to list, filter stays
- **repo-search-ctrl-u-clears-text**: Type "auth", Ctrl+U → text cleared, input focused
- **repo-search-backspace-deletes**: Type "auth", Backspace → "aut"
- **repo-search-j-in-input-types-literal**: In input, press `j` → "j" typed
- **repo-search-f-in-input-types-literal**: In input, press `f` → "f" typed
- **repo-search-f-cycles-state**: Press `f` → Open → Closed → All
- **repo-search-l-opens-label-selector**: Press `l` → label selector opens
- **repo-search-a-cycles-assignee**: Press `a` → cycles through assignees
- **repo-search-o-cycles-sort**: Press `o` → cycles sort options
- **repo-search-f-noop-on-code-tab**: On code tab, `f` → no-op
- **repo-search-l-noop-on-bookmarks-tab**: On bookmarks, `l` → no-op
- **repo-search-filter-plus-text**: `f` then `/` type "auth" → both compose
- **repo-search-rapid-typing**: Type "authentication" fast → all captured
- **repo-search-R-retries-on-error**: Error state, `R` → retries
- **repo-search-R-noop-when-no-error**: No error, `R` → no-op
- **repo-search-navigation-resets-filters**: Set filters, switch tabs, return → reset
- **repo-search-goto-during-search**: In search, `g d` → navigates away
- **repo-search-pagination-with-filter**: Filter + scroll → paginated with filter
- **repo-search-120-char-limit**: Type 130 chars → only 120 accepted

### Responsive Tests

- **repo-search-80x24-filter-badges**: 80×24 with filters → abbreviated badges
- **repo-search-80x24-search-full-width**: 80×24, `/` → full-width input
- **repo-search-80x24-no-filter-labels**: 80×24 → no label text, badges only
- **repo-search-120x40-full-labels**: 120×40 → "State: Open │ Sort: Recently updated"
- **repo-search-120x40-search-width**: 120×40 → 60-char query visible
- **repo-search-200x60-labels-with-counts**: 200×60 → "State: Open (15)"
- **repo-search-200x60-search-width**: 200×60 → 80-char query visible
- **repo-search-resize-standard-to-min**: 120→80 → labels switch to badges
- **repo-search-resize-min-to-standard**: 80→120 → badges switch to labels
- **repo-search-resize-preserves-search**: Resize with input focused → preserved
- **repo-search-resize-preserves-filters**: Resize with filters → preserved
- **repo-search-resize-during-loading**: Resize during search → continues

### Integration Tests

- **repo-search-server-side-issues**: >200 issues, type query → server-side search with debounce
- **repo-search-client-side-bookmarks**: <200 bookmarks → client-side filter, no API call
- **repo-search-auth-expiry-during-search**: 401 → app-shell auth error
- **repo-search-rate-limit-429**: 429 → "Rate limited. Retry in Ns."
- **repo-search-network-error**: Timeout → "Search failed. Press R to retry."
- **repo-search-debounce-cancels-stale**: Rapid typing → only final query dispatched
- **repo-search-abort-on-navigation**: Search pending, `q` → aborted
- **repo-search-state-filter-api**: `f` → API with `?state=open`
- **repo-search-combined-api-filter**: Text + state → API with both params
- **repo-search-filter-reset-on-tab-switch**: Switch tabs → filters reset
- **repo-search-filter-persists-during-scroll**: Scroll with filter → all pages filtered
- **repo-search-large-result-set**: 500+ issues → server-side paginated search

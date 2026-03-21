# TUI_ISSUE_LIST_SEARCH

Specification for TUI_ISSUE_LIST_SEARCH.

## High-Level User POV

The Issue List Search is a keyboard-driven search and filtering capability embedded within the Issue List screen of the Codeplane TUI. It allows a developer to rapidly narrow down a repository's issues by typing a query — matching against issue titles, body previews, labels, and author names — without leaving the list or navigating to a separate search screen. The search is activated by pressing `/` from the issue list, which focuses a search input that appears inline at the top of the issue list area, immediately below the filter toolbar.

When the user begins typing, the issue list narrows in real-time to show only issues that match the query. Matching is performed against the locally loaded issues first (instant client-side substring filtering), and simultaneously triggers a debounced server-side search request to `GET /api/repos/:owner/:repo/issues` with a `q` query parameter that leverages the `search_vector` full-text index on the server. This two-phase approach gives the user instant feedback while also discovering issues that haven't been loaded into the current pagination window.

The search input renders as a single-line `<input>` component at the top of the issue scrollbox, styled with a `/ ` prefix indicator in muted color and a blinking cursor. As the user types, a match count badge appears to the right of the input: "N results" in muted color, or "No results" in warning color when zero issues match. The issue list below the input updates with each keystroke — matched issues are displayed in the same row format as the unfiltered list (issue number, state icon, title, label badges, assignee, comment count, and relative timestamp), but with matching text segments highlighted in the `primary` accent color for visual emphasis.

Pressing `Enter` while the search input is focused closes the search input and returns focus to the filtered issue list, preserving the filter results so the user can navigate through them with `j/k`. Pressing `Esc` clears the search query, restores the full unfiltered issue list, and returns focus to the list. If the search input is empty and the user presses `Esc`, it behaves as a standard back action (same as `q` — popping the issue list screen).

The search integrates with the issue list's existing state and label filters. If the user has already filtered issues to "Open" state and the "bug" label, the search query further narrows within those constraints. The filter toolbar above the search input continues to show the active state and label filters, and the search results respect them — the user sees the intersection of all active filters and the search query.

At minimum terminal size (80×24), the search input takes the full width of the content area. At standard and large sizes, the search input renders with generous padding and the match count badge is always visible. The search input maximum length is 120 characters — additional characters are silently ignored. Long queries that exceed the visible input width scroll horizontally within the input.

The search feature is designed for rapid, in-context exploration. A developer can press `/`, type a few characters of an issue title they remember, press `Enter` to lock in the results, then `j/k` to the desired issue and `Enter` to open its detail view — all without reaching for a mouse or leaving the terminal.

## Acceptance Criteria

### Definition of Done

- [ ] Pressing `/` from the issue list screen focuses a search input rendered inline at the top of the issue scrollbox
- [ ] The search input displays a `/ ` prefix indicator in `muted` color (ANSI 245) and accepts keyboard text input
- [ ] Typing in the search input applies a client-side substring filter against issue title, body preview, label names, and author username — case-insensitive
- [ ] A debounced (300ms) server-side search request fires to `GET /api/repos/:owner/:repo/issues?q={query}&state={currentState}` after the user stops typing
- [ ] Server-side results merge with client-side filtered results, deduplicated by issue `id`, preserving sort order
- [ ] A match count badge renders to the right of the search input: "N results" in `muted` (ANSI 245) or "No results" in `warning` (ANSI 178)
- [ ] Matching text segments in issue titles are highlighted with `primary` color (ANSI 33) in the result rows
- [ ] Pressing `Enter` while search input is focused closes the input and returns focus to the filtered issue list, preserving results
- [ ] Pressing `Esc` while search input has text clears the query, restores the full issue list, and returns focus to the list
- [ ] Pressing `Esc` while search input is empty (and no query was applied) behaves as the standard back action (pop screen)
- [ ] The search respects active state filters (open/closed/all) and label filters — search results are the intersection of all active constraints
- [ ] The search input is accessible from any position in the issue list (top, middle, or scrolled to bottom)
- [ ] The issue list cursor resets to the first result when a search query changes
- [ ] When the search produces zero server-side results and zero client-side results, the list area shows "No issues match '{query}'" centered in `muted` color with a hint "Press Esc to clear search"
- [ ] The feature is reachable on the issue list screen which is navigated to via `g i` (with repo context), `:issues` command palette, or `--screen issues --repo owner/repo` deep link

### Keyboard Interactions

- [ ] `/`: Focus the search input (from issue list context, not when already in search input)
- [ ] Any printable character: Appended to the search query while input is focused
- [ ] `Backspace`: Deletes last character from the search query
- [ ] `Ctrl+U`: Clears the entire search query (while input is focused)
- [ ] `Ctrl+W`: Deletes last word from the search query (while input is focused)
- [ ] `Enter`: Close search input and return focus to filtered list (preserving results)
- [ ] `Esc`: Clear search query, restore full list, return focus to list. If input already empty, pop screen
- [ ] `Ctrl+C`: Quit TUI (global binding, overrides search input)
- [ ] `j`/`k`/`Down`/`Up`: While search input is focused, these keys are captured by the input (no list navigation)
- [ ] `Tab`/`Shift+Tab`: While search input is focused, these exit search and cycle to the next/previous filter control in the toolbar

### Responsive Behavior

- [ ] 80×24 (minimum): Search input spans full content width minus 2 chars padding. Match count renders on the same line, right-aligned. If query + match count exceed width, match count is hidden
- [ ] 120×40 (standard): Search input spans 70% of content width. Match count always visible, right-aligned with 2-char gap
- [ ] 200×60+ (large): Search input spans 60% of content width. Match count always visible. Additional padding for comfortable layout
- [ ] Below 80×24: "Terminal too small" message (handled by app shell, not this feature)
- [ ] Terminal resize while search input is active: Input width recalculates, query text preserved, cursor position preserved

### Truncation and Boundary Constraints

- [ ] Search query maximum length: 120 characters. Additional input silently ignored
- [ ] Search query that exceeds visible input width: Horizontal scroll within input, cursor always visible
- [ ] Issue title highlight: Matching segments highlighted in `primary` color. If the match spans a truncation boundary (title is truncated with `…`), the highlight still applies to the visible portion
- [ ] Match count format: "N results" for 1+, "No results" for 0, "1 result" (singular). Never exceeds 15 characters
- [ ] Maximum client-side results displayed: Limited by the issue list's pagination cap (500 issues in memory)
- [ ] Server-side search results per page: 30 items (matching the list's default page size)
- [ ] Minimum query length for server-side search: 2 characters. Single-character queries only apply client-side filtering
- [ ] Debounce delay for server-side search: 300ms after last keystroke
- [ ] Labels in matched results: Rendered as colored badge text, not themselves highlighted (only title text receives match highlighting)

### Edge Cases

- [ ] Rapid typing: Each keystroke updates the client-side filter immediately; server-side requests are debounced, only the final query triggers a request
- [ ] Type then immediately press Esc: Client-side filter clears, any pending server request is cancelled
- [ ] Type then immediately press Enter: Client-side results are locked in, any pending server request completes and merges results silently
- [ ] Search with no issues loaded (initial load pending): Search input is disabled until initial data load completes. Pressing `/` during loading is a no-op
- [ ] Search across paginated results: Client-side filter applies to all loaded pages. Server-side search may return issues not yet loaded, which are prepended to results
- [ ] Server returns 500 during search: Client-side results remain visible. A subtle inline error "Search failed — showing local results" renders below the input in `error` color (ANSI 196). Disappears after 3 seconds
- [ ] Server returns 429 during search: Same behavior as 500 — local results displayed, inline warning shown
- [ ] Network timeout during search: Same as 500 — graceful degradation to client-side results
- [ ] Unicode in search query: Full Unicode support. Grapheme clusters handled correctly. Case-insensitive matching uses Unicode case folding
- [ ] Empty body field: Issue body is null/empty — search only matches against title, labels, and author
- [ ] Special regex characters in query: Treated as literal text, not regex. The characters `.`, `*`, `+`, `?`, `[`, `]`, `(`, `)`, `{`, `}`, `^`, `$`, `|`, `\` are escaped before matching
- [ ] SSE disconnect during search: Unaffected — search uses REST, not SSE
- [ ] Terminal resize during debounce wait: Resize completes, input re-renders at new width, pending search request continues
- [ ] Filter active + search: If user has state filter "closed" and types a query, only closed issues matching the query are shown
- [ ] Switching state filter while search is active: Search results re-filter with the new state constraint. Client-side filter re-applies; server-side search re-fires with new state parameter
- [ ] Opening issue detail from search results then pressing `q` to return: Issue list restores with the search query still active and results preserved

## Design

### Layout Structure

When search is inactive, the issue list renders normally:

```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Issues          │
├─────────────────────────────────────────────────┤
│ Issues (42)                          State: Open │
│ Labels: — │ Assignee: — │ Sort: Newest           │
├─────────────────────────────────────────────────┤
│ #42 ● Add dark mode support      [feat] alice 5 3d│
│ #41 ● Fix login timeout          [bug]  bob   2 5d│
│ #39 ● Update dependencies               carol 0 1w│
│ …                                                │
├─────────────────────────────────────────────────┤
│ j/k:nav Enter:open /:search o:sort v:state q:back│
└─────────────────────────────────────────────────┘
```

When search is activated (after pressing `/`):

```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Issues          │
├─────────────────────────────────────────────────┤
│ Issues (42)                          State: Open │
│ Labels: — │ Assignee: — │ Sort: Newest           │
├─────────────────────────────────────────────────┤
│ / dark mode█                          3 results  │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ #42 ● Add [dark mode] support    [feat] alice 5 3d│
│ #35 ● [Dark mode] toggle broken  [bug]  dave  1 2w│
│ #28 ● [Dark mode] theme tokens          eve   0 1m│
│                                                  │
├─────────────────────────────────────────────────┤
│ Enter:done Esc:clear CtrlU:clear-all q:back      │
└─────────────────────────────────────────────────┘
```

The `[dark mode]` bracketed segments indicate text highlighted in `primary` color (ANSI 33).

### Component Tree

```jsx
<box flexDirection="column" width="100%" height="100%">
  {/* Title row */}
  <box flexDirection="row" height={1}>
    <text bold color="primary">Issues ({totalCount})</text>
    <box flexGrow={1} />
    <text color="muted">State: {stateFilter}</text>
  </box>

  {/* Filter toolbar */}
  <FilterToolbar labels={labelFilter} assignee={assigneeFilter} sort={sortOrder} />

  {/* Search input (conditional) */}
  {searchActive && (
    <box flexDirection="row" height={1} borderBottom="dashed">
      <text color="muted">/ </text>
      <input value={searchQuery} onChange={handleSearchChange} onSubmit={handleSearchSubmit} maxLength={120} flexGrow={1} />
      <box width={2} />
      <text color={matchCount === 0 ? "warning" : "muted"}>{formatMatchCount(matchCount)}</text>
    </box>
  )}

  {/* Issue list */}
  <scrollbox flexGrow={1} onScrollEnd={handlePagination}>
    {filteredIssues.length === 0 ? (
      <box justifyContent="center" alignItems="center" flexGrow={1}>
        <text color="muted">No issues match '{searchQuery}'</text>
        <text color="muted">Press Esc to clear search</text>
      </box>
    ) : (
      filteredIssues.map(issue => (
        <IssueRow key={issue.id} issue={issue} focused={issue.id === focusedId} searchQuery={searchQuery} terminalWidth={width} />
      ))
    )}
    {isLoadingMore && <text color="muted">Loading more…</text>}
  </scrollbox>
</box>
```

### IssueRow Sub-Component

Each issue row renders in a single line with columns: issue number (6ch, muted), state icon (2ch, green for open / red for closed), title (flex, with highlighted matching segments), label badges (variable, colored), author username (8ch, muted), comment count (3ch, muted), and relative timestamp (4ch, muted). Focused row uses reverse video or primary accent background.

### HighlightedText Sub-Component

Renders a text string with matching segments highlighted. Segments are computed by splitting the issue title at case-insensitive match boundaries of the search query. Matching segments render in `primary` color (ANSI 33) with bold. Non-matching segments render in the default text color.

### Keybinding Reference

| Key | Context | Action |
|-----|---------|--------|
| `/` | Issue list focused (not in search) | Activate search input |
| Printable chars | Search input focused | Append to query |
| `Backspace` | Search input focused | Delete last character |
| `Ctrl+U` | Search input focused | Clear entire query |
| `Ctrl+W` | Search input focused | Delete last word |
| `Enter` | Search input focused | Close input, focus filtered list |
| `Esc` | Search input focused, query non-empty | Clear query, restore list, focus list |
| `Esc` | Search input focused, query empty | Pop screen (same as `q`) |
| `Tab` | Search input focused | Exit search, cycle to next filter control |
| `Shift+Tab` | Search input focused | Exit search, cycle to previous filter control |
| `Ctrl+C` | Anywhere | Quit TUI |
| `j`/`k` | After Enter (list focused with results) | Navigate filtered issue list |
| `Enter` | List focused, issue row focused | Open issue detail |
| `/` | List focused with active search results | Re-open search input with previous query |

### Responsive Column Layout

**80×24 (minimum):** Search input: full width minus 2 padding. Issue rows: number (5ch), state (2ch), title (remaining), author (6ch), timestamp (3ch). Labels and comment count hidden.

**120×40 (standard):** Search input: 70% width. Issue rows: number (6ch), state (2ch), title (flex), labels (variable), author (8ch), comments (3ch), timestamp (4ch).

**200×60+ (large):** Search input: 60% width. Issue rows: number (6ch), state (2ch), title (flex, wider), labels (full name, variable), author (10ch), comments (4ch), timestamp (4ch).

### Resize Behavior

- `useTerminalDimensions()` provides current `{ width, height }` for breakpoint calculation
- `useOnResize()` triggers synchronous re-layout when the terminal is resized
- Search input width recalculates based on the new breakpoint
- Query text and cursor position are preserved during resize
- Issue row column layout adjusts per the responsive rules above
- The focused issue row remains visible and focused after resize
- Match count badge visibility adjusts: hidden at 80×24 if it would overlap the query text
- No animation or transition during resize — single-frame re-render

### Data Hooks Consumed

| Hook | Source | Data |
|------|--------|------|
| `useIssues()` | `@codeplane/ui-core` | `{ items: Issue[], totalCount, isLoading, error, loadMore, hasMore, retry, refetch }`. Calls `GET /api/repos/:owner/:repo/issues` with cursor-based pagination, state filter, and optional `q` search parameter |
| `useIssueSearch()` | `@codeplane/ui-core` | `{ results: Issue[], isSearching, error }`. Dedicated debounced search hook that calls `GET /api/repos/:owner/:repo/issues?q={query}` with 300ms debounce. Returns server-matched issues |
| `useTerminalDimensions()` | `@opentui/react` | `{ width, height }` |
| `useOnResize()` | `@opentui/react` | Resize callback |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler registration |
| `useNavigation()` | local TUI | `{ push, pop }` for issue detail navigation and back |
| `useRepoContext()` | local TUI | `{ owner, repo }` for scoping API requests |

### API Endpoints Consumed

| Endpoint | Hook | Purpose |
|----------|------|---------|
| `GET /api/repos/:owner/:repo/issues?state={state}&cursor={cursor}&limit=30` | `useIssues()` | Paginated issue list with state filter |
| `GET /api/repos/:owner/:repo/issues?q={query}&state={state}&limit=30` | `useIssueSearch()` | Server-side full-text search with state filter |

### Search State Management

Search state is local to the issue list screen component: `searchActive` (boolean), `searchQuery` (string, max 120 chars), `clientResults` (issues from loaded pages matching client-side), `serverResults` (issues from server search endpoint), `mergedResults` (deduplicated union sorted by number DESC), `matchCount` (count of merged results), `debounceTimer` (pending server search debounce).

Client-side filtering is immediate (on every keystroke). Server-side search is debounced (300ms). Results are merged by deduplicating on `issue.id` and maintaining the active sort order.

When the user presses `Enter` to close search, `searchQuery` is preserved and `mergedResults` remains the displayed list. When the user presses `Esc`, all search state resets and the original unfiltered list is restored.

### Loading States

- **Search input active, typing**: No spinner. Client-side results update instantly. A subtle "Searching…" text replaces the match count badge while the server request is in-flight
- **Server search in-flight**: Match count shows "Searching…" in `muted` color. Client-side results are displayed immediately below
- **Server search complete**: Match count updates to "N results". Any new issues from the server are merged into the list
- **Server search error**: Match count area shows "Local only" in `warning` color for 3 seconds, then reverts to the client-side match count

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Repo Read | Repo Write | Admin |
|--------|-----------|---------------|-----------|------------|-------|
| View issue list screen | ❌ | ❌ | ✅ | ✅ | ✅ |
| Search issues (client-side) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Search issues (server-side) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Open issue detail from results | ❌ | ❌ | ✅ | ✅ | ✅ |

- The issue list screen requires authentication and repository read access. The TUI enforces authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/repos/:owner/:repo/issues` returns issues visible to the authenticated user — the API enforces repository access permissions
- The `q` search parameter is passed to the server as a query string value. The server sanitizes it for SQL full-text search injection before querying the `search_vector` index
- Search queries are not stored server-side and do not appear in audit logs
- Private repository issues are only searchable by users with read access to the repository

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed as `Bearer` token in `Authorization` header for all API requests
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- Issue list endpoint: 300 requests per minute per authenticated user
- Server-side search (same endpoint with `q` parameter): Shares the same 300 req/min rate limit
- The 300ms debounce prevents excessive search requests during rapid typing (max ~3.3 req/sec during continuous typing)
- If 429 is returned on a search request, the feature degrades gracefully to client-side-only filtering with an inline "Rate limited" warning
- No auto-retry on rate limit. The next user keystroke (after debounce) retries naturally

### Input Sanitization

- Search query text is sent as a URL-encoded query parameter (`?q=...`). Standard URL encoding handles special characters
- The server is responsible for sanitizing the search query for full-text search. The TUI does not perform SQL-aware sanitization
- Client-side substring matching escapes regex special characters to prevent accidental regex evaluation
- Issue titles, labels, and usernames in search results are rendered as plain `<text>` components — no injection vector in the terminal

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.issues.search.activated` | User presses `/` to open search input | `total_issues_loaded`, `active_state_filter`, `active_label_filter`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.issues.search.query_entered` | User types a search query (debounced 1s after last keystroke for analytics) | `query_length`, `client_match_count`, `server_match_count`, `merged_match_count`, `active_state_filter`, `search_duration_ms` |
| `tui.issues.search.result_opened` | User presses Enter on a search result to open issue detail | `issue_number`, `position_in_results`, `query_length`, `was_server_result`, `was_client_result`, `total_results` |
| `tui.issues.search.cleared` | User presses Esc to clear search | `query_length`, `results_count`, `duration_ms` (time from activation to clear) |
| `tui.issues.search.submitted` | User presses Enter to lock in search results | `query_length`, `results_count`, `duration_ms` |
| `tui.issues.search.server_error` | Server-side search request fails | `error_type` (network/timeout/rate_limit/server), `http_status`, `query_length` |
| `tui.issues.search.no_results` | Search produces zero results | `query_length`, `active_state_filter`, `active_label_filter`, `total_issues_loaded` |

### Common Event Properties

All search events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `repo_full_name`: The repository context (`owner/repo`)
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Search activation rate | >25% of issue list views | At least 25% of sessions that view the issue list activate the search |
| Query-to-result-open rate | >50% of searches | At least 50% of searches lead to opening an issue detail |
| Mean query length | 3–15 characters | Indicates meaningful search queries, not accidental activations |
| Zero-result rate | <15% of searches | Fewer than 15% of searches produce no results |
| Server search error rate | <2% of search requests | Server-side search should succeed >98% of the time |
| Client-only fallback rate | <1% of searches | Fewer than 1% of searches should fall back to client-only due to server error |
| Search-to-clear ratio | <40% | Fewer than 40% of searches are cleared (Esc) without opening a result |
| Time from activation to first result opened | <5 seconds median | Users find what they're looking for quickly |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Search activated | `Issues: search activated [loaded={n}] [state={filter}]` |
| `debug` | Client-side filter applied | `Issues: client filter [query={q}] [matches={n}] [total={n}]` |
| `debug` | Server search request sent | `Issues: server search [query={q}] [state={filter}]` |
| `debug` | Server search response received | `Issues: search response [results={n}] [duration={ms}ms]` |
| `debug` | Results merged | `Issues: results merged [client={n}] [server={n}] [merged={n}] [deduped={n}]` |
| `debug` | Search cleared | `Issues: search cleared [query_length={n}]` |
| `debug` | Search submitted (Enter) | `Issues: search submitted [query={q}] [results={n}]` |
| `info` | Issue opened from search | `Issues: opened from search [issue=#{n}] [query={q}] [position={n}]` |
| `warn` | Server search failed | `Issues: search failed [status={code}] [error={msg}]` |
| `warn` | Server search timed out | `Issues: search timeout [query={q}] [timeout=10s]` |
| `warn` | Rate limited on search | `Issues: search rate limited [retry_after={n}s]` |
| `warn` | Search returned zero results | `Issues: no results [query={q}] [state={filter}] [loaded={n}]` |
| `error` | Search component error | `Issues: search error [error={msg}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases Specific to TUI

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Terminal resize while search input is focused | `useOnResize` fires | Input width recalculates. Query text and cursor position preserved. No interruption to search |
| Terminal resize during server search in-flight | `useOnResize` fires during fetch | Fetch continues. Results render at new layout when they arrive |
| SSE disconnect while searching | Status bar shows disconnected | Search unaffected — uses REST, not SSE. Status bar indicator is the only visual change |
| Auth token expires during search | Server returns 401 on search request | Propagated to app-shell auth error screen. Search state is lost |
| Rate limited during search (429) | Server returns 429 with Retry-After | Client-side results remain. Inline "Rate limited" warning for 3s. Next keystroke-triggered search auto-retries after debounce |
| Server error during search (500+) | Server returns 5xx | Client-side results remain. Inline "Search failed — local only" for 3s |
| Network timeout during search | 10-second timeout | Client-side results remain. Inline "Search timed out — local only" for 3s |
| Rapid keystrokes during search | Keystroke events queue | Client-side filter updates per keystroke. Server search debounced (only final query fires). No dropped keypresses |
| Search query with only whitespace | User types spaces | Treated as empty query — no filter applied, full list shown |
| Search input while issue list is loading initial data | `/` pressed during loading | Search input does not activate. Keypress is ignored. User can try again after data loads |
| Back-navigation from issue detail to search results | User opens issue then presses `q` | Issue list restores with search query active, results preserved, cursor on previously focused item |
| Concurrent state filter change + search | User presses `v` while search is active | Search results re-filter with new state. Client-side filter re-applies. Server search re-fires with new state param |
| React error boundary triggered in search | Unhandled exception in search component | Search input closes. Full issue list restored. Error logged. Status bar flash with error message |

### Failure Modes and Recovery

- **Server search always fails**: Feature degrades to client-side-only filtering. Match count reflects only locally loaded issues. User experience is slightly degraded (can't find issues beyond loaded pages) but remains functional
- **Client-side filtering too slow (1000+ issues)**: Unlikely given 500-item pagination cap. If experienced, debounce client-side filter to 50ms to prevent frame drops
- **Search component crash**: Caught by the issue list screen's error boundary. Search input is removed, full issue list is restored. User can re-activate search with `/`
- **Memory pressure from large result sets**: Server search results are capped at 30 items per request. Combined with client-side 500-item cap, total in-memory issues never exceed ~530

## Verification

### Test File: `e2e/tui/issues.test.ts`

### Terminal Snapshot Tests

```
SNAP-SEARCH-001: Search input activated at 120x40
  → Navigate to issue list for repo with 20 issues → Press / → Snapshot shows search input with "/ " prefix, blinking cursor, empty match count area, issue list below

SNAP-SEARCH-002: Search input with query and results at 120x40
  → Activate search → Type "dark mode" → Snapshot shows "/ dark mode" in input, "3 results" badge, filtered issue list with highlighted title segments

SNAP-SEARCH-003: Search with zero results at 120x40
  → Activate search → Type "zzzznonexistent" → Snapshot shows "/ zzzznonexistent" in input, "No results" in warning color, centered "No issues match 'zzzznonexistent'" with "Press Esc to clear search" hint

SNAP-SEARCH-004: Search input at 80x24 minimum size
  → Navigate to issue list at 80x24 → Press / → Snapshot shows search input spanning full width, match count right-aligned on same line

SNAP-SEARCH-005: Search results at 80x24 minimum size
  → At 80x24, activate search → Type "bug" → Snapshot shows filtered issues with minimal columns (number, state, title, timestamp). Labels and comments hidden

SNAP-SEARCH-006: Search input at 200x60 large size
  → Navigate to issue list at 200x60 → Press / → Snapshot shows search input at 60% width, generous padding, match count clearly visible

SNAP-SEARCH-007: Search results with highlighted text at 120x40
  → Issues with titles containing "auth": "Fix auth timeout", "Auth token refresh" → Type "auth" → Snapshot shows "auth" segments highlighted in primary color within titles

SNAP-SEARCH-008: Search with active state filter at 120x40
  → Set state filter to "Closed" → Press / → Type query → Snapshot shows filter toolbar with "State: Closed" and search input, only closed matching issues displayed

SNAP-SEARCH-009: Search input with long query at 120x40
  → Activate search → Type 80-character query → Snapshot shows input with horizontal scroll, cursor at the end, right portion of query visible

SNAP-SEARCH-010: Search "Searching..." loading state at 120x40
  → Activate search with slow API → Type query → Snapshot shows "Searching…" in match count area while server request is in-flight

SNAP-SEARCH-011: Search server error fallback at 120x40
  → Activate search with failing API → Type query → Snapshot shows "Local only" in warning color in match count area, client-side results displayed

SNAP-SEARCH-012: Issue list after search Enter (locked results) at 120x40
  → Activate search → Type "fix" → Press Enter → Snapshot shows filtered list without search input visible, issue rows navigable, focus on first result

SNAP-SEARCH-013: Search result row focused at 120x40
  → Activate search → Type query producing 5 results → Press Enter → Snapshot shows first result row highlighted with primary accent color

SNAP-SEARCH-014: Search input with match count singular at 120x40
  → Type query matching exactly 1 issue → Snapshot shows "1 result" (singular) in match count area
```

### Keyboard Interaction Tests

```
KEY-SEARCH-001: / activates search input
  → Navigate to issue list → Press / → Assert search input is visible and focused

KEY-SEARCH-002: Typing updates client-side filter
  → Press / → Type "bug" → Assert issue list shows only issues matching "bug" in title/labels/author

KEY-SEARCH-003: Backspace deletes character
  → Press / → Type "bugs" → Press Backspace → Assert query is "bug", results update

KEY-SEARCH-004: Ctrl+U clears entire query
  → Press / → Type "some query" → Press Ctrl+U → Assert query is empty, full list restored (input still focused)

KEY-SEARCH-005: Ctrl+W deletes last word
  → Press / → Type "fix auth" → Press Ctrl+W → Assert query is "fix ", results update

KEY-SEARCH-006: Enter closes search and focuses list
  → Press / → Type "fix" → Press Enter → Assert search input hidden, filtered list focused, j/k navigates results

KEY-SEARCH-007: Esc with query clears and restores list
  → Press / → Type "fix" → Press Esc → Assert search input hidden, query cleared, full issue list restored

KEY-SEARCH-008: Esc with empty query pops screen
  → Press / → Press Esc (no text typed) → Assert screen pops back to previous screen

KEY-SEARCH-009: j/k captured by search input
  → Press / → Type "j" → Assert "j" appears in query text (not list navigation)

KEY-SEARCH-010: Tab exits search to filter toolbar
  → Press / → Press Tab → Assert search input loses focus, next filter control gains focus

KEY-SEARCH-011: Shift+Tab exits search to previous control
  → Press / → Press Shift+Tab → Assert search input loses focus, previous filter control gains focus

KEY-SEARCH-012: Search preserves results on re-open
  → Press / → Type "fix" → Press Enter → Press / → Assert search input reopens with "fix" pre-filled, same results displayed

KEY-SEARCH-013: Navigate within search results after Enter
  → Press / → Type "fix" → Press Enter → Press j → Assert second result highlighted → Press Enter → Assert issue detail opened for second result

KEY-SEARCH-014: Return from issue detail preserves search
  → Press / → Type "fix" → Enter to lock → j → Enter to open issue → q to go back → Assert issue list shows search results with "fix" query active

KEY-SEARCH-015: / during loading state is no-op
  → Navigate to issue list with slow API → Press / immediately → Assert no search input appears

KEY-SEARCH-016: Ctrl+C during search quits TUI
  → Press / → Type "query" → Press Ctrl+C → Assert TUI exits

KEY-SEARCH-017: Search with state filter interaction
  → Set state to "Closed" → Press / → Type "fix" → Assert only closed issues matching "fix" are shown

KEY-SEARCH-018: State filter change during active search
  → Press / → Type "fix" → Press Esc → Change state filter → Press / → Assert "fix" query re-applies with new state filter

KEY-SEARCH-019: Case-insensitive matching
  → Issues: "Fix Auth Bug", "fix login timeout" → Press / → Type "FIX" → Assert both issues appear in results

KEY-SEARCH-020: Special characters in query
  → Press / → Type "bug [critical]" → Assert literal "[critical]" is matched (not regex), no crash

KEY-SEARCH-021: Rapid typing triggers single server request
  → Press / → Type "authentication" rapidly (13 chars in <300ms) → Assert only one server search request fires after debounce

KEY-SEARCH-022: Match count updates as typing progresses
  → Press / → Type "a" → Assert match count updates → Type "u" (now "au") → Assert match count updates → Type "th" (now "auth") → Assert match count updates

KEY-SEARCH-023: Empty whitespace query shows full list
  → Press / → Type "   " (spaces) → Assert full list is shown (treated as empty query)
```

### Responsive Tests

```
RESIZE-SEARCH-001: Search active at 80x24
  → Activate search at 80x24 → Type "fix" → Assert input spans full width, match count right-aligned, issue rows show minimal columns

RESIZE-SEARCH-002: Search active at 120x40
  → Activate search at 120x40 → Type "fix" → Assert input at 70% width, match count visible, full issue columns

RESIZE-SEARCH-003: Search active at 200x60
  → Activate search at 200x60 → Type "fix" → Assert input at 60% width, generous padding, all issue columns visible

RESIZE-SEARCH-004: Resize from 120x40 to 80x24 during search
  → Activate search at 120x40 → Type "query" → Resize to 80x24 → Assert input width adjusts, query text preserved, issue row columns collapse

RESIZE-SEARCH-005: Resize from 80x24 to 120x40 during search
  → Activate search at 80x24 → Type "query" → Resize to 120x40 → Assert input width adjusts, query text preserved, additional columns appear

RESIZE-SEARCH-006: Resize preserves cursor position during search
  → Activate search → Type "long query text" → Resize → Assert cursor remains at end of query, text visible

RESIZE-SEARCH-007: Resize during server search in-flight
  → Activate search → Type query → Resize before server response → Assert resize completes, server response renders at new layout

RESIZE-SEARCH-008: Match count hidden at 80x24 with long query
  → At 80x24, type a query that fills input width → Assert match count is hidden to prevent overlap

RESIZE-SEARCH-009: Match count reappears after resize to larger size
  → At 80x24 with hidden match count → Resize to 120x40 → Assert match count reappears
```

### Integration Tests

```
INT-SEARCH-001: Server-side search returns additional results
  → Load 30 issues (page 1) → Activate search → Type query matching issue #5 (loaded) and issue #150 (not loaded) → Assert both appear in results (client-side + server-side merge)

INT-SEARCH-002: Deduplication of client and server results
  → Issue #42 loaded client-side and also returned by server search → Assert #42 appears once in merged results

INT-SEARCH-003: Server search with state filter
  → Set state to "Closed" → Activate search → Type query → Assert server request includes state=closed and q=query parameters

INT-SEARCH-004: Server search 500 degrades to client-only
  → API returns 500 for search → Type query → Assert client-side results displayed, "Local only" warning shown

INT-SEARCH-005: Server search 429 degrades to client-only
  → API returns 429 → Type query → Assert client-side results displayed, "Rate limited" warning shown

INT-SEARCH-006: Server search timeout degrades to client-only
  → API times out after 10s → Type query → Assert client-side results displayed after timeout, "Search timed out" warning shown

INT-SEARCH-007: Auth expiry during search
  → Token expires → Type query → Server returns 401 → Assert app-shell auth error screen rendered

INT-SEARCH-008: Debounce prevents excessive requests
  → Type "search" (6 chars) in rapid succession → Assert only 1 server search request fires (after 300ms debounce)

INT-SEARCH-009: Debounce cancels pending on new keystroke
  → Type "se" → Wait 200ms → Type "a" → Assert only one server request fires (for "sea"), previous debounce cancelled

INT-SEARCH-010: Search then navigate to detail and back
  → Search for "fix" → Enter to lock → j to second result → Enter to open detail → q to return → Assert search results preserved, cursor on second result

INT-SEARCH-011: Client-side matching on labels
  → Issue #10 has label "bug" → Type "bug" → Assert issue #10 appears in results (matched on label)

INT-SEARCH-012: Client-side matching on author
  → Issue #15 authored by "alice" → Type "alice" → Assert issue #15 appears in results (matched on author)

INT-SEARCH-013: Minimum query length for server search
  → Type "a" (1 char) → Assert no server request fires (client-side only) → Type "b" (now "ab") → Assert server request fires after debounce

INT-SEARCH-014: Search across paginated results
  → Load 3 pages of issues (90 issues) → Search → Assert client filter applies to all 90 loaded issues

INT-SEARCH-015: Empty search preserves issue sort order
  → Sort by "Newest" → Search → Type "fix" → Assert matched results maintain newest-first order

INT-SEARCH-016: Search results update when server results arrive
  → Type query → Client shows 2 matches → Server returns 3 additional → Assert list updates to show 5 total matches
```

### Edge Case Tests

```
EDGE-SEARCH-001: Unicode in search query
  → Type "修正" (Chinese for "fix") → Assert no crash, filter applies correctly, character display correct

EDGE-SEARCH-002: 120-character query limit
  → Type 125 characters → Assert only first 120 are accepted, input stops accepting after 120

EDGE-SEARCH-003: Query with only special regex characters
  → Type ".*+" → Assert treated as literal, no regex error, results show issues containing ".*+" literally

EDGE-SEARCH-004: Issue with null body field
  → Issue has null body → Search → Assert issue is still searchable by title, labels, and author

EDGE-SEARCH-005: Rapid / then Esc then / again
  → / → Esc → / → Assert search input opens cleanly each time without state leaks

EDGE-SEARCH-006: Search during pagination loading
  → Scroll to trigger pagination → While "Loading more..." is showing, press / → Assert search input does not activate (or activates and filters current results only)

EDGE-SEARCH-007: Issue titles with ANSI escape codes
  → Issue title contains ANSI escapes → Assert escapes are stripped before rendering, no terminal corruption

EDGE-SEARCH-008: Very long issue title with match near truncation point
  → Issue title 200+ chars, match at char 45 → At 80x24, title truncated at 50ch → Assert match is highlighted in the visible portion, truncation `…` appears correctly

EDGE-SEARCH-009: Concurrent resize + keystroke
  → Terminal resize event fires while user is typing → Assert both operations complete without crash, query preserved, layout correct

EDGE-SEARCH-010: Search with all issues filtered out by state
  → State filter "Closed", zero closed issues → Press / → Type query → Assert "No results" and appropriate hint message
```

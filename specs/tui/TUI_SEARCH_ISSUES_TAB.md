# TUI_SEARCH_ISSUES_TAB

Specification for TUI_SEARCH_ISSUES_TAB.

## High-Level User POV

The Issues tab is one of four result categories on the global search screen, activated by pressing `2` or by tabbing to it with `Tab`/`Shift+Tab`. It shows issues from across all repositories the authenticated user has access to, matched against the current search query via full-text search. This is the cross-repository issue discovery surface — unlike the in-repo issue list search (`/` on an issue list screen), the Issues tab on the global search screen spans every visible repository on the Codeplane instance.

When the user types a search query and the Issues tab is selected, the results area populates with a scrollable list of matching issues. Each issue row displays the owning repository context (`owner/repo`), the issue number (`#42`), the issue title, a state badge (a filled green circle `●` for open, an unfilled red circle `○` for closed), and a relative timestamp showing when the issue was last updated. The repository context anchors each result to its source, since issues from multiple repositories can appear in a single result set. The focused row is highlighted with reverse video, and the user navigates with `j`/`k` or arrow keys.

Pressing `Enter` on a focused issue pushes the issue detail screen onto the navigation stack. The breadcrumb updates to `Search > owner/repo > Issues > #42`, and pressing `q` returns to the search screen with the query, active tab, scroll position, and focused item all preserved. This makes the Issues tab a fast way to triage issues across many repositories — type a query, scan issues from multiple repos, drill into one, come back, continue scanning.

The Issues tab supports server-side filtering by state (`open`, `closed`, or all). An inline filter bar appears below the tab row when the Issues tab is active, providing a state toggle cycled with the `o` key. The filter applies to the server-side search query, refining results without a full re-search — only the issues endpoint is re-queried when a filter changes, not all four tabs.

At the minimum 80×24 terminal size, issue rows collapse to a single compact line: `#number title` with the state badge icon only, dropping the repository context and timestamp to save space. At the standard 120×40 size, the full row displays: `owner/repo #number title ● open 2h`. At the large 200×60+ size, the title is given more horizontal space and is less likely to truncate.

Pagination loads additional results as the user scrolls. When the scroll position reaches 80% of the loaded content height, the next page (30 items) is fetched from the API and appended to the list. A "Loading more…" indicator appears at the bottom during the fetch. Pagination caps at 300 items (10 pages) to bound memory usage.

## Acceptance Criteria

### Definition of Done

- [ ] The Issues tab is the second tab in the search screen tab bar, accessible via `2` or `Tab`/`Shift+Tab`
- [ ] The tab label displays "Issues" at standard/large breakpoints and "Issues" at minimum breakpoint
- [ ] The tab badge shows `(N)` where N is `total_count` from the `GET /api/search/issues` response
- [ ] Tab badge abbreviates counts above 9999 as "10k+", "100k+", etc.
- [ ] Selecting the Issues tab renders issue results in the results area below the tab bar
- [ ] Issue results are fetched from `GET /api/search/issues?q={query}&page={page}&per_page=30`
- [ ] Results respect the authenticated user's repository visibility (server-enforced)
- [ ] Each issue row displays: repository context (`owner/repo`), issue number (`#N`), title, state badge, relative timestamp
- [ ] State badge renders `●` in green (ANSI 34) for `open` and `○` in red (ANSI 196) for `closed`
- [ ] Repository context renders in muted color (ANSI 245)
- [ ] Issue number renders in primary color (ANSI 33)
- [ ] Title renders in default text color, truncated with `…` when exceeding available width
- [ ] Relative timestamp renders in muted color (ANSI 245) using human-readable format (e.g., "2h", "3d", "1w", "2mo")
- [ ] The focused issue row is highlighted with reverse video
- [ ] `j`/`k`/`Down`/`Up` moves the cursor through the issue results list
- [ ] `Enter` on a focused issue pushes the issue detail screen onto the navigation stack
- [ ] The navigation breadcrumb updates to `Search > owner/repo > Issues > #N` when drilling into an issue
- [ ] `q` from the issue detail returns to the search screen with Issues tab state fully preserved
- [ ] Pressing `/` from the results list returns focus to the search input
- [ ] An inline state filter is available when the Issues tab is active: Open / Closed / All
- [ ] Changing the state filter re-queries only the issues endpoint (not all four search endpoints)
- [ ] The state filter defaults to "All" (no state filter parameter sent to API)
- [ ] State filter value is preserved when switching away from and back to the Issues tab
- [ ] Pagination triggers when scroll position reaches 80% of content height
- [ ] Each page loads 30 items (default `per_page`)
- [ ] Pagination caps at 300 total items (10 pages)
- [ ] "Loading more…" indicator shown at the bottom of the list during pagination fetch
- [ ] Scroll position and focused item are preserved when switching tabs and returning
- [ ] Issue results update when the search query changes (debounced 300ms, inherited from search screen)
- [ ] In-flight issue search requests are aborted when a new query is dispatched
- [ ] Empty results state shows: "No issues found for '{query}'." with "Try a different query or check spelling."
- [ ] The Issues tab is auto-selected if it is the first tab with non-zero results and no tab was previously active
- [ ] If the Issues tab was previously active and has results for the new query, it remains selected

### Keyboard Interactions

- [ ] `2` (from results list): Switch to Issues tab
- [ ] `j` / `Down`: Move cursor down in issue results
- [ ] `k` / `Up`: Move cursor up in issue results
- [ ] `Enter`: Navigate to focused issue's detail screen
- [ ] `G`: Jump to last loaded issue in results
- [ ] `g g`: Jump to first issue in results
- [ ] `Ctrl+D`: Page down (half visible height)
- [ ] `Ctrl+U`: Page up (half visible height)
- [ ] `o`: Toggle state filter: All → Open → Closed → All (cycle)
- [ ] `/`: Return focus to search input
- [ ] `q`: Pop the search screen
- [ ] `R`: Retry failed issues search
- [ ] `Tab` / `Shift+Tab`: Switch to next/previous search tab

### Responsive Behavior

- [ ] 80×24 – 119×39 (minimum): Issue rows show `#number title state_icon` only; repository context and timestamp hidden
- [ ] 120×40 – 199×59 (standard): Issue rows show `owner/repo #number title state_badge timestamp`
- [ ] 200×60+ (large): Issue rows show full `owner/repo #number title (no truncation where possible) state_badge timestamp`
- [ ] State filter bar visible at standard/large; hidden at minimum (use `o` key to cycle)
- [ ] Terminal resize re-renders issue rows at the new breakpoint without losing scroll position or focus

### Truncation and Boundary Constraints

- [ ] Repository context (`owner/repo`): max 30 characters, truncated with `…`
- [ ] Issue number: never truncated (always shown in full as `#N`)
- [ ] Issue title: truncated to remaining row width with `…`
- [ ] At minimum breakpoint, title gets max available width minus number (6 chars) and state badge (2 chars)
- [ ] Relative timestamp: always 2–4 characters, never truncated
- [ ] State badge: icon only at minimum; icon + label at standard+; never truncated
- [ ] Tab count badge: abbreviated above 9999
- [ ] Maximum 300 issues loaded per search query
- [ ] Issue title containing newlines: rendered as single line (newlines replaced with spaces)

### Edge Cases

- [ ] No issues match query but other tabs have results: Issues tab shows `(0)` badge and "No issues found" message
- [ ] All tabs return zero results: Issues tab shows zero-results state
- [ ] Issue title is empty string: row renders "(untitled)" in muted color
- [ ] Issue state is neither "open" nor "closed": render state text as-is in muted color
- [ ] Repository context is very long: truncated to 30 chars with `…`
- [ ] Rapid tab switching while issues are loading: loading state shown; results render when they arrive
- [ ] Terminal resize while issue results displayed: rows re-render at new breakpoint; scroll position preserved
- [ ] Pagination fetch fails: "Failed to load more. Press R to retry." at bottom; existing items preserved
- [ ] Navigate to issue detail, issue deleted: detail screen shows error; `q` returns to search
- [ ] State filter change while pagination in progress: in-flight pagination aborted; new filtered query from page 1
- [ ] Unicode characters in issue titles: rendered correctly with grapheme-aware truncation

## Design

### Layout Structure — Issues Tab Active

**Standard layout (120×40):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Search                                                    │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 api timeout█                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Repositories (3) │ ▸Issues (12) │ Users (1) │ Code (27)          │
├─────────────────────────────────────────────────────────────────┤
│ State: [All] Open Closed                                  o:cycle │
├─────────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway  #42  Fix gateway timeout on large…  ● open 2h│
│   acme/api-gateway  #38  Rate limiting returns 500 on…  ● open 3d│
│   acme/gateway-sdk  #15  SDK does not handle timeout…   ● open 1w│
│   acme/api-gateway  #31  Add retry logic for upstream…  ○ clsd 2w│
│   internal/gateway  #8   Config validation fails on…    ○ clsd 3w│
├─────────────────────────────────────────────────────────────────┤
│ /:focus input  Tab:tab  j/k:nav  Enter:open  o:filter  q:back   │
└─────────────────────────────────────────────────────────────────┘
```

**Minimum layout (80×24):**

```
┌──────────────────────────────────────────────────────────────┐
│ Search                                                         │
├──────────────────────────────────────────────────────────────┤
│ 🔍 api timeout█                                               │
├──────────────────────────────────────────────────────────────┤
│ Repos(3) ▸Issues(12) Users(1) Code(27)                         │
├──────────────────────────────────────────────────────────────┤
│ ► #42 Fix gateway timeout on large payload…         ● open     │
│   #38 Rate limiting returns 500 on burst…           ● open     │
│   #15 SDK does not handle timeout gracefull…        ● open     │
│   #31 Add retry logic for upstream calls…           ○ clsd     │
│   #8  Config validation fails on empty input…       ○ clsd     │
├──────────────────────────────────────────────────────────────┤
│ /:input Tab:tab j/k:nav Enter:open q:back                      │
└──────────────────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI + React 19)

The Issues tab content is rendered when `activeTab === "issues"`. It consists of an optional state filter bar (hidden at minimum breakpoint) and a `<scrollbox>` containing `IssueSearchRow` components.

```jsx
<box flexDirection="column" width="100%" flexGrow={1}>
  {breakpoint !== "minimum" && (
    <box flexDirection="row" height={1} width="100%">
      <text fg="muted">State: </text>
      {["All", "Open", "Closed"].map((s) => (
        <text key={s} fg={stateFilter === s.toLowerCase() ? "primary" : "muted"}
              attributes={stateFilter === s.toLowerCase() ? BOLD : 0}>
          {stateFilter === s.toLowerCase() ? `[${s}]` : ` ${s} `}
        </text>
      ))}
      <box flexGrow={1} />
      <text fg="muted">o:cycle</text>
    </box>
  )}
  <scrollbox flexGrow={1} onScrollEnd={handleLoadMoreIssues} scrollPosition={issueScrollPosition}>
    {/* Loading, error, empty, or results states */}
    <box flexDirection="column">
      {issueResults.map((issue, i) => (
        <IssueSearchRow key={issue.id} issue={issue} focused={i === issueFocusedIndex} breakpoint={breakpoint} />
      ))}
      {issueLoadingMore && <text fg="muted">Loading more…</text>}
    </box>
  </scrollbox>
</box>
```

### IssueSearchRow Sub-Component

Each row renders as a single line with columns:
- Focus indicator (`►` or ` `)
- Repository context (muted, hidden at minimum)
- Issue number (primary color)
- Title (fills remaining width, truncated with `…`)
- State badge (`●`/`○` with green/red color)
- Timestamp (muted, hidden at minimum)

Focused item uses reverse video background.

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `2` | Results list | Switch to Issues tab |
| `j`/`Down` | Issues tab | Move cursor down |
| `k`/`Up` | Issues tab | Move cursor up |
| `Enter` | Issues tab, item focused | Push issue detail screen |
| `G` | Issues tab | Jump to last loaded item |
| `g g` | Issues tab | Jump to first item |
| `Ctrl+D` | Issues tab | Page down |
| `Ctrl+U` | Issues tab | Page up |
| `o` | Issues tab | Cycle state filter |
| `/` | Issues tab | Focus search input |
| `R` | Error state | Retry failed search |
| `q` | Issues tab | Pop search screen |

### Data Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useSearch().searchIssues` | `@codeplane/ui-core` | Issue search; returns `{ data, loading, error, loadMore }` |
| `useTerminalDimensions()` | `@opentui/react` | Breakpoint calculation |
| `useOnResize()` | `@opentui/react` | Resize re-layout |
| `useKeyboard()` | `@opentui/react` | Keyboard events |
| `useNavigation()` | TUI app shell | `push` for issue detail navigation |

### API Endpoint

`GET /api/search/issues` with params: `q` (required), `state` (optional), `label`, `assignee`, `milestone`, `page`, `per_page`.

Returns `IssueSearchResultPage { items: IssueSearchResult[], total_count, page, per_page }` where each item has: `id`, `repository_id`, `repository_owner`, `repository_name`, `number`, `title`, `state`.

### Responsive Sizing

| Dimension | 80×24 | 120×40 | 200×60+ |
|-----------|-------|--------|--------|
| Row format | `#num title icon` | `repo #num title badge time` | `repo #num full_title badge time` |
| State filter bar | Hidden | Visible | Visible |
| Repo context | Hidden | 30 chars | 40 chars |
| State badge | Icon only | Icon + short label | Icon + full label |
| Timestamp | Hidden | Short | Expanded |

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View Issues tab on search screen | ❌ | ✅ | ✅ |
| Search issues across visible repos | ❌ | ✅ (visible repos only) | ✅ (all repos) |
| Navigate to issue detail from search | ❌ | ✅ (if repo visible) | ✅ |
| Filter issues by state | ❌ | ✅ | ✅ |

- The TUI requires authentication at bootstrap. Anonymous users cannot reach the search screen.
- Issue search results are scoped to repositories visible to the authenticated user. The server-side `visible_repositories` CTE ensures private repos and their issues are excluded unless the user has explicit access (owner, collaborator, org member, team member).
- Admin users may see additional issue results from repositories they have administrative access to.
- No special role is required to use the Issues tab — any authenticated user can search.
- The TUI performs no client-side visibility filtering. The API response is authoritative.

### Token Handling

- Token loaded from CLI keychain (via `codeplane auth login`) or `CODEPLANE_TOKEN` environment variable at TUI bootstrap.
- Token passed as `Bearer` token in the `Authorization` header on every `GET /api/search/issues` request.
- Token is never displayed in the UI, written to logs, or included in error messages.
- 401 responses on the issues search endpoint propagate to the app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- The Issues tab contributes 1 of the 4 parallel requests dispatched per query.
- State filter changes dispatch an additional single request to the issues endpoint only.
- Server-side rate limit: 300 requests per minute per authenticated user.
- If the issues endpoint returns 429, the Issues tab shows "Rate limited. Retry in {Retry-After}s." inline; other tabs are unaffected.
- No auto-retry on 429 — user manually presses `R` after the retry-after period.
- Pagination requests are user-initiated (scroll-triggered) and are not debounced.

### Input Sanitization

- Query text is URL-encoded by the `@codeplane/ui-core` API client.
- State filter values are constrained to `"open"`, `"closed"`, or empty string — never user-freetext.
- Issue data rendered as plain `<text>` — no injection vector in terminal context.
- Special characters in issue titles (ANSI escape sequences, control characters) are stripped before rendering.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.search.issues_tab.viewed` | User switches to Issues tab | `session_id`, `query_length`, `total_count`, `source` ("tab_key", "shift_tab", "number_key", "auto_select"), `previous_tab` |
| `tui.search.issues_tab.result_opened` | User presses Enter on an issue result | `session_id`, `query_length`, `issue_id`, `issue_number`, `repository_owner`, `repository_name`, `issue_state`, `position_in_list`, `total_results`, `state_filter` |
| `tui.search.issues_tab.filter_changed` | User changes the state filter | `session_id`, `query_length`, `from_filter`, `to_filter`, `result_count_before`, `result_count_after` |
| `tui.search.issues_tab.paginated` | User scrolls to trigger next page load | `session_id`, `query_length`, `page_number`, `items_loaded_total`, `state_filter` |
| `tui.search.issues_tab.error` | Issues search API call fails | `session_id`, `query_length`, `error_type`, `http_status`, `state_filter` |
| `tui.search.issues_tab.retry` | User presses R to retry | `session_id`, `retry_success`, `previous_error_type`, `state_filter` |
| `tui.search.issues_tab.zero_results` | Issues tab returns zero results | `session_id`, `query_length`, `query_text_hash`, `state_filter`, `other_tabs_had_results` |

### Common Event Properties

All Issues tab events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `breakpoint` ("minimum" | "standard" | "large"), `color_mode`.

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Issues tab visit rate | ≥ 35% of search sessions | At least 35% of search sessions visit the Issues tab |
| Issue open rate | ≥ 45% of Issues tab visits | At least 45% of visits result in opening an issue detail |
| State filter usage rate | ≥ 20% of Issues tab visits | At least 20% of visits use the state filter |
| Zero-result rate | < 25% of queries | Fewer than 25% of queries produce zero issue results |
| Mean time to first issue open | < 6 seconds | Median time from tab view to pressing Enter |
| Return-to-search rate | ≥ 35% of issue opens | At least 35% of navigations return to search |
| Pagination rate | ≥ 15% of tab visits | At least 15% of visits load a second page |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Issues tab selected | `Search.Issues: tab selected [source={method}] [query_length={n}]` |
| `debug` | Issues search dispatched | `Search.Issues: query dispatched [query_length={n}] [state={filter}] [page={n}]` |
| `debug` | Issues results loaded | `Search.Issues: results loaded [count={n}] [total={n}] [page={n}] [duration={ms}ms]` |
| `debug` | State filter changed | `Search.Issues: filter changed [from={f}] [to={f}]` |
| `debug` | Pagination triggered | `Search.Issues: pagination [page={n}] [items_loaded={n}]` |
| `info` | Issue detail navigated | `Search.Issues: navigated [issue_id={id}] [repo={owner/name}] [number={n}] [position={n}]` |
| `info` | Issues tab exited | `Search.Issues: tab exited [issues_viewed={n}] [issues_opened={n}] [filters_used={n}]` |
| `warn` | Issues search API failed | `Search.Issues: API error [status={code}] [error={message}]` |
| `warn` | Rate limited | `Search.Issues: rate limited [retry_after={n}s]` |
| `warn` | Slow response | `Search.Issues: slow response [duration={ms}ms]` (> 3000ms) |
| `warn` | Query aborted | `Search.Issues: query aborted [query_length={n}] [reason=superseded]` |
| `warn` | Pagination cap reached | `Search.Issues: pagination cap [items={n}] [cap=300]` |
| `error` | Auth error | `Search.Issues: auth error [status=401]` |
| `error` | Render error | `Search.Issues: render error [component={name}] [error={message}]` |
| `error` | Unexpected response shape | `Search.Issues: unexpected response [keys={json}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases Specific to TUI

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on issues search | API client timeout (10s) | "Search failed. Press R to retry." in Issues tab |
| Issues endpoint returns 500+ | HTTP status >= 500 | "Search error. Press R to retry." |
| Issues endpoint returns 429 | HTTP 429 with Retry-After | "Rate limited. Retry in {N}s." Other tabs unaffected |
| Auth token expired (401) | HTTP 401 | Propagated to app-shell auth error screen |
| Terminal resize while results displayed | `useOnResize` fires | Rows re-render at new breakpoint; scroll position preserved |
| Terminal resize during API fetch | `useOnResize` during fetch | Fetch continues; results render at new dimensions |
| Tab switch while issues loading | User switches away | Fetch continues in background; results available on return |
| State filter change while loading | User presses `o` during fetch | In-flight request aborted; new request dispatched |
| Pagination fetch fails | Network error on page N+1 | "Failed to load more. Press R to retry." Existing items preserved |
| React error boundary triggered | Exception in IssueSearchRow | Tab-level try-catch; inline error; other results continue |

### Failure Modes and Recovery

- **Complete network failure**: Issues tab shows error state with retry hint. Search input remains functional.
- **Stale results after query change**: In-flight requests discarded via request ID matching. Only most recent query's results rendered.
- **Memory pressure**: Pagination capped at 300 items (10 pages × 30 items).
- **Issues tab component crash**: Caught by tab-level error boundary. "Tab error — press R to retry." Other tabs continue working.
- **State filter desync**: Filter state included in every request for consistency.

## Verification

### Test File: `e2e/tui/search.test.ts`

### Terminal Snapshot Tests (17 tests)

- SNAP-SEARCH-ISSUES-001: Issues tab renders at 120x40 with results — full row format with repo context, #number, title, state badge, timestamp
- SNAP-SEARCH-ISSUES-002: Issues tab renders at 80x24 with results — compact format with #number, title, state icon only
- SNAP-SEARCH-ISSUES-003: Issues tab renders at 200x60 with results — expanded format with full titles and timestamps
- SNAP-SEARCH-ISSUES-004: Issues tab empty results state — "No issues found" message with hint text
- SNAP-SEARCH-ISSUES-005: Issues tab loading state — "Searching…" indicator
- SNAP-SEARCH-ISSUES-006: Issues tab error state — error message with "Press R to retry"
- SNAP-SEARCH-ISSUES-007: Issues tab rate limit state — "Rate limited. Retry in 30s."
- SNAP-SEARCH-ISSUES-008: Issue state badges — open issues green ●, closed issues red ○
- SNAP-SEARCH-ISSUES-009: Focused item highlighting — reverse video on focused row
- SNAP-SEARCH-ISSUES-010: State filter bar at standard size — visible with All/Open/Closed options
- SNAP-SEARCH-ISSUES-011: State filter bar hidden at minimum size
- SNAP-SEARCH-ISSUES-012: State filter — Open selected, results filtered
- SNAP-SEARCH-ISSUES-013: State filter — Closed selected, results filtered
- SNAP-SEARCH-ISSUES-014: Pagination loading indicator — "Loading more…" at bottom
- SNAP-SEARCH-ISSUES-015: Long title truncation with `…` at 120x40
- SNAP-SEARCH-ISSUES-016: Long repo context truncation to 30 chars
- SNAP-SEARCH-ISSUES-017: Large count badge formatting ("15k+")

### Keyboard Interaction Tests (20 tests)

- KEY-SEARCH-ISSUES-001: Press 2 switches to Issues tab
- KEY-SEARCH-ISSUES-002: j/k navigates issue results
- KEY-SEARCH-ISSUES-003: Down/Up navigates issue results
- KEY-SEARCH-ISSUES-004: Enter navigates to issue detail with correct breadcrumb
- KEY-SEARCH-ISSUES-005: q returns from issue detail to search with state preserved
- KEY-SEARCH-ISSUES-006: G jumps to last loaded issue
- KEY-SEARCH-ISSUES-007: g g jumps to first issue
- KEY-SEARCH-ISSUES-008: Ctrl+D pages down in issue results
- KEY-SEARCH-ISSUES-009: Ctrl+U pages up in issue results
- KEY-SEARCH-ISSUES-010: o cycles state filter (All → Open → Closed → All)
- KEY-SEARCH-ISSUES-011: State filter change re-queries issues only (not other tabs)
- KEY-SEARCH-ISSUES-012: / returns focus to search input from Issues tab
- KEY-SEARCH-ISSUES-013: R retries on Issues tab error
- KEY-SEARCH-ISSUES-014: R is noop when no error
- KEY-SEARCH-ISSUES-015: Tab switches from Issues to Users tab
- KEY-SEARCH-ISSUES-016: Shift+Tab switches from Issues to Repositories tab
- KEY-SEARCH-ISSUES-017: Issues tab preserves scroll position across tab switches
- KEY-SEARCH-ISSUES-018: State filter preserved across tab switches
- KEY-SEARCH-ISSUES-019: Cursor stays at boundaries (no wrap)
- KEY-SEARCH-ISSUES-020: Rapid j presses scroll smoothly without artifacts

### Responsive Tests (9 tests)

- RESIZE-SEARCH-ISSUES-001: 120x40 shows full row format
- RESIZE-SEARCH-ISSUES-002: 80x24 shows compact row format
- RESIZE-SEARCH-ISSUES-003: 200x60 shows expanded row format
- RESIZE-SEARCH-ISSUES-004: Resize 120→80 collapses issue rows (repo context hidden, timestamp hidden)
- RESIZE-SEARCH-ISSUES-005: Resize 80→120 expands issue rows (repo context visible, timestamp visible)
- RESIZE-SEARCH-ISSUES-006: Resize preserves focus and scroll position
- RESIZE-SEARCH-ISSUES-007: Resize shows/hides state filter bar
- RESIZE-SEARCH-ISSUES-008: Resize during loading preserves state
- RESIZE-SEARCH-ISSUES-009: Rapid resize produces clean layout without artifacts

### Integration Tests (20 tests)

- INT-SEARCH-ISSUES-001: Full flow — search, browse, open issue, return with state preserved
- INT-SEARCH-ISSUES-002: Issues search API called with correct parameters (q, state)
- INT-SEARCH-ISSUES-003: Pagination loads next page with correct page parameter
- INT-SEARCH-ISSUES-004: Pagination stops at 300-item cap
- INT-SEARCH-ISSUES-005: Auth error (401) propagates to app-shell error screen
- INT-SEARCH-ISSUES-006: Rate limit (429) handling with Retry-After display
- INT-SEARCH-ISSUES-007: Partial failure — issues fails, other tabs succeed independently
- INT-SEARCH-ISSUES-008: State filter change aborts in-flight request
- INT-SEARCH-ISSUES-009: New query while Issues tab active updates results
- INT-SEARCH-ISSUES-010: Issues tab auto-selects when first tab with results
- INT-SEARCH-ISSUES-011: Issue detail navigation preserves search stack
- INT-SEARCH-ISSUES-012: Issue from private repo visible for authorized user
- INT-SEARCH-ISSUES-013: Issue from private repo hidden for unauthorized user
- INT-SEARCH-ISSUES-014: Unicode in issue title renders correctly
- INT-SEARCH-ISSUES-015: Special characters in query URL-encoded correctly
- INT-SEARCH-ISSUES-016: State filter cycles correctly through all states with correct API params
- INT-SEARCH-ISSUES-017: Issues tab state preserved across go-to navigation (g d → g s)
- INT-SEARCH-ISSUES-018: Empty issue title renders "(untitled)"
- INT-SEARCH-ISSUES-019: Large total_count badge formatting
- INT-SEARCH-ISSUES-020: Rapid state filter cycling dispatches only final state

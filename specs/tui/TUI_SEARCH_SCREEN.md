# TUI_SEARCH_SCREEN

Specification for TUI_SEARCH_SCREEN.

## High-Level User POV

The global search screen is the Codeplane TUI's cross-repository discovery surface. It is reached by pressing `g s` from any screen, by pressing `s` from the dashboard quick actions, or by selecting "Search" from the command palette. Unlike the in-repo search filter (`/` on a repository sub-screen), the global search screen operates across the entire Codeplane instance — it searches all repositories, all issues, all users, and all code that the authenticated user has access to.

When the search screen opens, the user sees a search input at the top of the content area with a blinking cursor, ready for immediate typing. There is no pre-loaded content — the screen is empty until the user enters a query. This keeps the screen fast to render and puts focus where it belongs: on the user's intent. Below the search input, a tab bar displays four result categories — **Repositories**, **Issues**, **Users**, and **Code** — each showing a count of matching results once a query has been executed. Below the tab bar, the results list fills the remaining vertical space as a scrollable list of matched items.

As the user types, the query is debounced by 300ms before dispatching to the search API. All four category endpoints are queried in parallel. The first tab with results is auto-selected; if the previously active tab has results, it remains selected. While results are loading, a "Searching…" indicator appears below the tab bar. Once results arrive, the count badges on each tab update, and the results list populates with items for the active tab. The user can switch tabs with `Tab`/`Shift+Tab` or by pressing `1`–`4` to jump directly. Each tab remembers its own scroll position and focused item.

Result rows are formatted differently per category. Repository results show the full name (owner/repo), a truncated description, visibility badge, and topic tags. Issue results show the repository context (owner/repo), issue number, title, and state badge (open/closed). User results show username, display name, and (no avatar — terminal constraint). Code results show repository context, file path, and a snippet of matching code rendered with syntax highlighting via the `<code>` component.

Pressing `Enter` on a result navigates to the corresponding detail screen: repositories push the repository overview, issues push the issue detail view, users push the user profile view, and code results push the repository code explorer focused on the matched file. The search screen remains in the navigation stack, so pressing `q` returns to the search with query and results preserved.

The search input supports editing: `Backspace` deletes the last character, `Ctrl+U` clears the entire query, and `Esc` unfocuses the input and returns focus to the results list (or, if no query is entered, pops the screen). Pressing `/` from the results list returns focus to the search input. This creates a tight loop: type query → browse results → refine query → browse again.

At the minimum 80×24 terminal size, the tab bar collapses to abbreviated labels with counts ("Repos(3) Issues(12) Users(0) Code(5)"). Result rows show only the most essential fields — repository full names, issue titles with numbers, usernames. At standard 120×40 size, full tab labels appear with counts, and result rows include descriptions and metadata columns. At large 200×60+ size, code snippets show more context lines, and descriptions are displayed at greater length.

The search screen is stateless across sessions — the query and results are not persisted when the TUI exits. However, within a single TUI session, navigating away and returning via `g s` preserves the last query and results. Pressing `Ctrl+U` or clearing the input and pressing `Esc` resets the screen to its initial empty state.

## Acceptance Criteria

### Definition of Done

- [ ] The search screen is accessible via `g s` go-to keybinding from any screen
- [ ] The search screen is accessible via `s` quick-action from the dashboard
- [ ] The search screen is accessible via the command palette (`:search` or selecting "Search")
- [ ] The search screen is accessible via deep-link launch: `codeplane tui --screen search`
- [ ] The header bar breadcrumb reads "Search" when the search screen is active
- [ ] The search input auto-focuses on screen mount with a blinking cursor
- [ ] The search input shows a `🔍` prefix icon
- [ ] Typing in the search input triggers API search dispatched after a 300ms debounce
- [ ] All four search API endpoints are called in parallel when a query is dispatched
- [ ] Search results populate the active tab's result list upon API response
- [ ] Tab count badges update with total_count from each API response
- [ ] The tab bar displays four tabs: Repositories, Issues, Users, Code
- [ ] The first tab with non-zero results auto-selects if no tab was previously active
- [ ] If the previously active tab has results for the new query, it remains selected
- [ ] `Tab`/`Shift+Tab` cycles through tabs; `1`–`4` jumps to tabs by index
- [ ] Each tab maintains independent scroll position and focused item index
- [ ] `j`/`k`/`Up`/`Down` navigates within the results list
- [ ] `Enter` on a result navigates to the detail screen for that entity
- [ ] The search screen remains in the navigation stack after `Enter` navigation
- [ ] Pressing `q` from a detail screen returns to the search screen with query and results preserved
- [ ] `/` from the results list moves focus back to the search input
- [ ] `Backspace` deletes the last character from the query
- [ ] `Ctrl+U` clears the entire search query and resets to empty state
- [ ] `Esc` in the search input returns focus to the results list if results exist
- [ ] `Esc` in the search input pops the screen if no query has been entered
- [ ] `Esc` on the results list pops the search screen
- [ ] The screen shows "Searching…" while API requests are in flight
- [ ] Empty query state shows centered help text: "Type a query to search across repositories, issues, users, and code."
- [ ] Zero-results state shows: "No results for '{query}'." with hint "Try a different query or check spelling."
- [ ] Pagination loads additional pages when scroll reaches 80% of content height
- [ ] Page-based pagination uses `page` and `per_page` API parameters (default 30 per page)
- [ ] Maximum 300 items loaded per tab (10 pages × 30 per page) to cap memory
- [ ] Search queries are case-insensitive on the server (full-text search)
- [ ] The search query is trimmed of leading/trailing whitespace before dispatch
- [ ] A query of fewer than 1 character does not dispatch an API request

### Keyboard Interactions

- [ ] `/`: Focus the search input (from results list)
- [ ] `Esc` (search input, has query): Return focus to results list
- [ ] `Esc` (search input, empty query): Pop the search screen
- [ ] `Esc` (results list): Pop the search screen
- [ ] `Enter` (search input): Return focus to results list with current query applied
- [ ] `Enter` (results list): Navigate to the focused result's detail screen
- [ ] `Backspace`: Delete last character from query (search input)
- [ ] `Ctrl+U`: Clear entire search query (search input)
- [ ] `Tab`: Switch to next tab
- [ ] `Shift+Tab`: Switch to previous tab
- [ ] `1`: Switch to Repositories tab
- [ ] `2`: Switch to Issues tab
- [ ] `3`: Switch to Users tab
- [ ] `4`: Switch to Code tab
- [ ] `j`/`Down`: Move cursor down in results list
- [ ] `k`/`Up`: Move cursor up in results list
- [ ] `G`: Jump to last loaded item in results list
- [ ] `g g`: Jump to first item in results list
- [ ] `Ctrl+D`: Page down (half-page scroll)
- [ ] `Ctrl+U` (results list): Page up (half-page scroll)
- [ ] `R`: Retry failed search
- [ ] `j`/`k`/`1`–`4` in search input: Typed as literal characters, not actions
- [ ] `q` (results list): Pop the search screen

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the app shell
- [ ] 80×24 – 119×39 (minimum): Tab bar shows abbreviated labels ("Repos(3) Issues(12) …"). Result rows show only primary field (name/title). Code snippets hidden
- [ ] 120×40 – 199×59 (standard): Tab bar shows full labels with counts ("Repositories (3) │ Issues (12) │ …"). Result rows show primary field + metadata column. Code snippets show 2-line preview
- [ ] 200×60+ (large): Full tab labels with counts. Result rows show primary field + description + metadata. Code snippets show 4-line preview with syntax highlighting

### Truncation and Boundary Constraints

- [ ] Search input text: max 120 characters; additional characters silently ignored
- [ ] Search input visual truncation: text scrolls left when cursor exceeds visible width
- [ ] Repository full_name in results: max 50 characters, truncated with `…`
- [ ] Repository description in results: truncated to remaining row width with `…`
- [ ] Issue title in results: truncated to remaining row width after #number and state badge, with `…`
- [ ] Issue repository context (owner/repo): max 30 characters, truncated with `…`
- [ ] Username display: max 20 characters, truncated with `…`
- [ ] User display_name: max 30 characters, truncated with `…`
- [ ] Code file path: max 60 characters, truncated from the left with `…/` prefix
- [ ] Code snippet: max 4 lines at large size, 2 lines at standard, hidden at minimum
- [ ] Tab count badge: abbreviated above 9999 (e.g., "10k+")
- [ ] Total results per tab: capped at 300 loaded items (pagination stops)
- [ ] Topic tags per repo result: max 3 displayed, "+N" for remainder

### Edge Cases

- [ ] Terminal resize while search input is focused: input remains focused, layout re-renders
- [ ] Terminal resize while results are displayed: results re-render at new dimensions, scroll position preserved
- [ ] Rapid typing (faster than debounce): only the final query after 300ms of inactivity is dispatched
- [ ] Query change while previous query's results are in flight: in-flight requests aborted, new query dispatched
- [ ] Tab switch while results are loading: loading indicator shown on new tab, previous tab's results preserved
- [ ] Network timeout on search API: "Search failed. Press R to retry." shown in results area
- [ ] Partial API failure (e.g., repos succeeds, code fails): successful tabs populate; failed tab shows error inline
- [ ] 401 auth error during search: propagated to app-shell auth error screen
- [ ] 429 rate limit during search: "Rate limited. Retry in {N}s." shown in results area
- [ ] SSE disconnect during search: search unaffected (uses REST)
- [ ] Pasting text into search input: full pasted string applied, truncated to 120 characters
- [ ] Search query containing special characters (quotes, backslashes): treated as literal text by the API
- [ ] Empty results on all tabs: zero-results state shown on active tab; tab counts all show (0)
- [ ] Navigate to detail and return: search screen restores exact state (query, active tab, scroll position, focused item)
- [ ] Code snippet with ANSI escape sequences in source: rendered via `<code>` component
- [ ] Unicode characters in query and results: handled correctly (grapheme-aware)
- [ ] Re-entering search screen after previous session: state preserved within TUI session

## Design

### Layout Structure

**Standard layout (120×40):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Search                                                    │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 api gateway█                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Repositories (3) │ Issues (12) │ Users (1) │ Code (27)           │
├─────────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway                                    ◆ public  │
│     REST API gateway service for microservices…        ★ 42     │
│   acme/gateway-sdk                                    ◆ public  │
│     Client SDK for the API gateway…                    ★ 15     │
│   internal/gateway-config                             ◇ private │
│     Configuration templates for gateway deploys…       ★ 3      │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ /:focus input  Tab:tab  j/k:nav  Enter:open  q:back             │
└─────────────────────────────────────────────────────────────────┘
```

**Minimum layout (80×24):**

```
┌──────────────────────────────────────────────────────────────┐
│ Search                                                         │
├──────────────────────────────────────────────────────────────┤
│ 🔍 api gateway█                                               │
├──────────────────────────────────────────────────────────────┤
│ Repos(3) Issues(12) Users(1) Code(27)                          │
├──────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway                            ◆ public        │
│   acme/gateway-sdk                            ◆ public        │
│   internal/gateway-config                     ◇ private       │
├──────────────────────────────────────────────────────────────┤
│ /:input Tab:tab j/k:nav Enter:open q:back                      │
└──────────────────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI + React 19)

Uses `<box>`, `<scrollbox>`, `<text>`, `<input>`, and `<code>` OpenTUI components. The search input row contains a `🔍` icon and `<input>` element. The tab bar renders as a `<box flexDirection="row">` with `<text>` elements for each tab, using `primary` color + bold/underline for the active tab and `muted` color for inactive tabs. The results area is a `<scrollbox>` with `flexGrow={1}` containing tab-specific result rows. Each `SearchResultRow` component formats differently per tab: repos show name + description + visibility badge, issues show repo context + number + title + state badge, users show username + display name, and code shows repo + path + syntax-highlighted `<code>` snippet.

### SearchResultRow — Repositories

Line 1: full_name in `primary` color (ANSI 33), visibility badge (◆ public in green / ◇ private in muted), star count in `muted`.
Line 2 (standard+): truncated description in `muted` color, up to 3 topic tags as `[tag]` badges.
Focused item highlighted with reverse video.

### SearchResultRow — Issues

Single line: repository context (owner/repo) in `muted`, `#number` in `primary`, title (truncated), state badge (● open in green / ○ closed in red), relative timestamp in `muted`.

### SearchResultRow — Users

Single line: username in `primary`, display_name in `muted` (parenthetical).

### SearchResultRow — Code

Line 1: repository context in `muted`, file path in `primary`.
Lines 2+ (standard: 2, large: 4, minimum: hidden): code snippet via `<code>` with syntax highlighting, preceded by `│` gutter in `border` color (ANSI 240).

### Tab Label Formatting

| Breakpoint | Format | Example |
|------------|--------|--------|
| Minimum (80×24) | Abbreviated name + count | `Repos(3) Issues(12) Users(0) Code(27)` |
| Standard (120×40) | Full name + count, `│` separated | `Repositories (3) │ Issues (12) │ Users (1) │ Code (27)` |
| Large (200×60+) | Full name + count, `│` separated | Same as standard |

Active tab: bold + underline in `primary` color. Inactive: normal in `muted`. Zero-count tabs show `(0)`, still selectable.

### Keybinding Reference

| Key | Context | Action |
|-----|---------|--------|
| `/` | Results list focused | Focus search input |
| `Esc` | Search input, query present | Return focus to results list |
| `Esc` | Search input, empty query | Pop search screen |
| `Esc` | Results list | Pop search screen |
| `Enter` | Search input | Return focus to results list |
| `Enter` | Results list, item focused | Navigate to item detail |
| `Backspace` | Search input | Delete last character |
| `Ctrl+U` | Search input | Clear entire query, reset to empty state |
| `Ctrl+U` | Results list | Page up (half-page scroll) |
| `Tab` | Search screen | Switch to next result tab |
| `Shift+Tab` | Search screen | Switch to previous result tab |
| `1`–`4` | Results list | Jump to tab by index |
| `j`/`Down` | Results list | Move cursor down |
| `k`/`Up` | Results list | Move cursor up |
| `G` | Results list | Jump to last loaded item |
| `g g` | Results list | Jump to first item |
| `Ctrl+D` | Results list | Page down |
| `R` | Error state | Retry failed search |
| `q` | Results list | Pop search screen |

### Responsive Behavior

`useTerminalDimensions()` provides current terminal size. `useOnResize()` triggers synchronous re-layout.

| Dimension | 80×24 | 120×40 | 200×60+ |
|-----------|-------|--------|--------|
| Tab labels | Abbreviated | Full with `│` separators | Full with `│` separators |
| Repo rows | 1 line: name + badge | 2 lines: name + badge, description | 2 lines: name + badge + stars, description + tags |
| Issue rows | 1 line: #num + title | 1 line: repo + #num + title + state + time | 1 line: full repo + #num + full title + state + time |
| User rows | 1 line: username | 1 line: username + display_name | 1 line: username + display_name |
| Code rows | 1 line: repo + path (no snippet) | 3 lines: repo + path + 2-line snippet | 5 lines: repo + path + 4-line snippet |
| Results per visible page | ~16 rows | ~30 rows | ~50 rows |

### Data Hooks Consumed

| Hook | Source | Purpose |
|------|--------|---------|
| `useSearch()` | `@codeplane/ui-core` | Global search across all entity types; returns `{ searchRepos, searchIssues, searchUsers, searchCode }` and their `{ data, loading, error, loadMore }` states |
| `useUser()` | `@codeplane/ui-core` | Current authenticated user |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size for breakpoint calculation |
| `useOnResize()` | `@opentui/react` | Resize event trigger |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler |
| `useNavigation()` | TUI app shell | `{ push, pop, goTo }` for screen transitions |
| `useStatusBarHints()` | local TUI | Search-screen keybinding hints |

### API Endpoints Consumed

| Endpoint | Parameters | Response |
|----------|------------|----------|
| `GET /api/search/repositories` | `q`, `page`, `per_page` | `RepositorySearchResultPage` with `items`, `total_count`, `page`, `per_page` |
| `GET /api/search/issues` | `q`, `state`, `label`, `assignee`, `milestone`, `page`, `per_page` | `IssueSearchResultPage` |
| `GET /api/search/users` | `q`, `page`, `per_page` | `UserSearchResultPage` |
| `GET /api/search/code` | `q`, `page`, `per_page` | `CodeSearchResultPage` |

All endpoints return `X-Total-Count` header. Default 30 per page, max 100. Server requires non-empty `q` (≥1 character after trim).

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| Access the search screen | ❌ | ✅ | ✅ |
| Search repositories | ❌ | ✅ (visible repos only) | ✅ (all repos) |
| Search issues | ❌ | ✅ (visible repos' issues only) | ✅ (all issues) |
| Search users | ❌ | ✅ | ✅ |
| Search code | ❌ | ✅ (visible repos' code only) | ✅ (all code) |

- The search screen requires authentication. The TUI enforces authentication at bootstrap; unauthenticated sessions are redirected to the auth error screen before the search screen is reachable
- Search results respect server-side visibility rules. Private repositories and their issues/code are excluded from results unless the authenticated user has explicit access. The TUI performs no client-side visibility filtering — the API is authoritative
- The user search endpoint does not require repository access; it returns all users whose profiles match the query. User display_name and username are considered non-sensitive
- No elevated role (admin, org owner) is required to use search. Admin users may see additional results due to broader repository access
- The `viewer` parameter passed by the API routes ensures results are scoped to the authenticated user's permissions

### Token Handling

- Token loaded from CLI keychain (via `codeplane auth login`) or `CODEPLANE_TOKEN` environment variable at TUI bootstrap
- Token passed to the `@codeplane/ui-core` API client as a `Bearer` token in the `Authorization` header on every search API request
- Token is never displayed in the TUI, never written to logs, never included in error messages
- 401 responses on any search API call propagate to the app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- Search queries are not logged with tokens or sent to analytics in raw form

### Rate Limiting

- The search screen dispatches up to 4 API requests per query (one per entity type). With 300ms debounce, this limits bursts to ~52 requests per minute during continuous typing (4 × 60/4.6)
- Server-side rate limit: 300 requests per minute per authenticated user across all API endpoints
- If any search endpoint returns 429, the affected tab shows "Rate limited. Retry in {Retry-After}s." inline. Other tabs' results remain visible
- No auto-retry on 429 — user presses `R` manually after the retry-after period
- Pagination requests (scroll-triggered) are user-driven and do not contribute to debounce timing
- Debouncing reduces API call volume: rapid typing dispatches only the final query

### Input Sanitization

- Search query text is URL-encoded by the `@codeplane/ui-core` API client before transmission
- The API validates query is non-empty (≥1 character after trim) and returns 422 if not
- Special characters in the query (quotes, backslashes, regex metacharacters) are treated as literal text by the server's full-text search engine
- Result data (repository names, issue titles, code snippets) is rendered as plain `<text>` or `<code>` components — no injection vector in terminal context
- Code snippets are rendered via the `<code>` component which handles ANSI passthrough safely

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.search.screen_opened` | Search screen mounts | `source` ("goto", "dashboard", "command_palette", "deep_link"), `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.search.query_dispatched` | Query dispatched to API (post-debounce) | `query_length`, `is_refinement` (true if previous query existed), `previous_query_length` |
| `tui.search.results_loaded` | All 4 API responses received | `query_length`, `repos_count`, `issues_count`, `users_count`, `code_count`, `total_count`, `duration_ms`, `any_errors` |
| `tui.search.tab_switched` | User switches active tab | `from_tab`, `to_tab`, `method` ("tab_key", "shift_tab", "number_key"), `tab_result_count` |
| `tui.search.result_opened` | User presses Enter on a result | `tab`, `item_type` ("repository", "issue", "user", "code"), `item_id`, `position_in_list`, `query_length`, `total_results_on_tab` |
| `tui.search.pagination` | User scrolls to trigger next page load | `tab`, `page_number`, `items_loaded_total`, `query_length` |
| `tui.search.query_cleared` | User clears query via Ctrl+U | `query_length_before_clear`, `had_results`, `time_searching_ms` |
| `tui.search.query_refined` | User modifies existing query (not from empty) | `previous_length`, `new_length`, `direction` ("shorter", "longer") |
| `tui.search.zero_results` | All tabs return zero results | `query_length`, `query_text_hash` (privacy-safe hash) |
| `tui.search.error` | Any search API call fails | `tab`, `error_type` ("network", "timeout", "rate_limit", "server_error", "auth"), `http_status` |
| `tui.search.retry` | User presses R to retry | `tab`, `retry_success`, `previous_error_type` |
| `tui.search.screen_exited` | User leaves the search screen | `exit_method` ("q", "esc", "goto", "enter_result"), `queries_dispatched`, `results_opened`, `tabs_visited`, `time_on_screen_ms` |

### Common Event Properties

All search events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Search screen access rate | ≥ 20% of TUI sessions | At least 20% of TUI sessions open the search screen |
| Query dispatch rate | ≥ 90% of search views | At least 90% of search screen views include a query dispatch |
| Result open rate | ≥ 40% of dispatched queries | At least 40% of queries lead to a result being opened |
| Tab exploration rate | ≥ 30% of search sessions | At least 30% of search sessions visit ≥2 tabs |
| Zero-result rate | < 20% of queries | Fewer than 20% of queries produce zero results across all tabs |
| Mean time to first result open | < 8 seconds | Median time from first keystroke to pressing Enter on a result |
| Query refinement rate | ≥ 25% of sessions | At least 25% of search sessions include ≥1 query refinement |
| Error rate | < 3% of queries | Fewer than 3% of query dispatches result in an error on any tab |
| Search-to-navigation conversion | ≥ 50% of sessions | At least 50% of search sessions result in navigating to a detail screen |
| Return-to-search rate | ≥ 30% of navigations | At least 30% of search-to-detail navigations return to search (indicates iterative discovery) |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Search screen mounted | `Search: mounted [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Query debounce started | `Search: debounce started [query_length={n}]` |
| `debug` | Query dispatched | `Search: query dispatched [query_length={n}] [debounce_wait_ms={ms}]` |
| `debug` | Tab switched | `Search: tab switched [from={tab}] [to={tab}] [method={method}]` |
| `debug` | Pagination triggered | `Search: pagination [tab={tab}] [page={n}] [items_loaded={n}]` |
| `debug` | Input focus changed | `Search: focus [target={input|results}]` |
| `debug` | Results loaded per tab | `Search: results [tab={tab}] [count={n}] [total={n}] [duration={ms}ms]` |
| `info` | All search results loaded | `Search: all results loaded [query_length={n}] [repos={n}] [issues={n}] [users={n}] [code={n}] [total_ms={ms}]` |
| `info` | Result navigated | `Search: navigated [tab={tab}] [item_type={type}] [item_id={id}] [position={n}]` |
| `info` | Screen exited | `Search: exited [method={method}] [queries={n}] [results_opened={n}] [time_ms={ms}]` |
| `warn` | Search API failed | `Search: API error [tab={tab}] [status={code}] [error={message}]` |
| `warn` | Rate limited | `Search: rate limited [tab={tab}] [retry_after={n}s]` |
| `warn` | Slow search response | `Search: slow response [tab={tab}] [duration={ms}ms]` (> 3000ms) |
| `warn` | Query aborted (new query replaced in-flight) | `Search: query aborted [tab={tab}] [query_length={n}]` |
| `warn` | Pagination cap reached | `Search: pagination cap [tab={tab}] [items={n}] [cap=300]` |
| `error` | Auth error | `Search: auth error [status=401]` |
| `error` | Render error | `Search: render error [component={name}] [error={message}]` |
| `error` | Unexpected API response shape | `Search: unexpected response [tab={tab}] [keys={json}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases Specific to TUI

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on search | API client timeout (10s) | "Search failed. Press R to retry." Results area shows error; search input and tab bar remain usable |
| Partial API failure | Some tabs succeed, others fail | Successful tabs populate normally; failed tabs show per-tab error with R to retry |
| Auth token expired (401) | Any search endpoint returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | Any search endpoint returns 429 | Affected tab shows "Rate limited. Retry in {N}s." Other tabs unaffected |
| Server error (500+) | Any search endpoint returns 5xx | "Search error. Press R to retry." on affected tab |
| Terminal resize while searching | `useOnResize` fires | Layout re-renders; input stays focused; results re-render at new breakpoint |
| Terminal resize during API fetch | `useOnResize` during in-flight request | Fetch continues; results render at new dimensions when they arrive |
| SSE disconnect during search | Status bar indicator | Search unaffected — uses REST endpoints, not SSE |
| Rapid typing triggers debounce resets | Debounce timer resets on each keystroke | Only final query dispatched; in-flight requests aborted |
| Navigation during pending search | User presses `q` or `Enter` while fetch in flight | Pending requests aborted; no stale results rendered on return |
| Tab switch during loading | User switches tab while results loading | New tab shows its own state; previous tab data preserved |
| React error boundary in search | Unhandled exception | Caught by screen-level error boundary |
| Empty query submitted (whitespace only) | Client-side validation | No API request dispatched; empty state shown |
| API returns 422 (invalid query) | Server validation | "Invalid search query." shown in results area |
| Code snippet contains very long lines | Horizontal overflow | Lines truncated at terminal width |
| Extremely large result set (total_count > 10000) | Tab badge formatting | Count abbreviated to "10k+" |

### Failure Modes and Recovery

- **Complete network failure**: All four tabs show error state. Search input remains functional — query is preserved. User can retry with `R` when network recovers.
- **Stale results after query change**: Previous query's in-flight responses are discarded via request ID matching. Only the most recent query's results are rendered.
- **Memory pressure from large result sets**: Pagination capped at 300 items per tab (10 pages × 30 items). Further scroll-to-end triggers no additional requests.
- **Search screen component crash**: Caught by the screen-level error boundary. Displays error screen with "Press `r` to restart". User's query is lost; screen remounts from empty state.
- **Individual tab rendering crash**: Each tab's results are rendered within a try-catch. A crashed tab shows inline error; other tabs continue.

## Verification

### Test File: `e2e/tui/search.test.ts`

### Terminal Snapshot Tests

```
SNAP-SEARCH-001: Search screen renders at 120x40 with empty state
  → Launch TUI, press g s at 120x40
  → Assert search input focused with blinking cursor
  → Assert tab bar shows "Repositories │ Issues │ Users │ Code" without counts
  → Assert content area shows centered "Type a query to search across repositories, issues, users, and code."

SNAP-SEARCH-002: Search screen renders at 80x24 with empty state
  → Launch TUI, press g s at 80x24
  → Assert search input focused
  → Assert tab bar shows abbreviated labels "Repos Issues Users Code"
  → Assert empty state text centered in content area

SNAP-SEARCH-003: Search screen renders at 200x60 with empty state
  → Launch TUI, press g s at 200x60
  → Assert full layout with wider content area
  → Assert empty state text centered

SNAP-SEARCH-004: Search results — Repositories tab at 120x40
  → Type "api gateway" → wait for results
  → Assert Repositories tab active with count badge
  → Assert result rows show full_name, description, visibility badge, star count
  → Assert first result is focused (reverse video)

SNAP-SEARCH-005: Search results — Repositories tab at 80x24
  → Type "api gateway" at 80x24
  → Assert abbreviated tab labels with counts
  → Assert result rows show name + visibility badge only (no description)

SNAP-SEARCH-006: Search results — Issues tab at 120x40
  → Type "bug", switch to Issues tab
  → Assert issue rows show repo context, #number, title, state badge, timestamp

SNAP-SEARCH-007: Search results — Users tab at 120x40
  → Type "alice", switch to Users tab
  → Assert user rows show username in primary color, display_name in muted

SNAP-SEARCH-008: Search results — Code tab at 120x40
  → Type "handleRequest", switch to Code tab
  → Assert code rows show repo context, file path, 2-line code snippet with syntax highlighting

SNAP-SEARCH-009: Search results — Code tab at 200x60
  → Type "handleRequest" at 200x60, switch to Code tab
  → Assert code snippets show 4-line preview

SNAP-SEARCH-010: Search results — Code tab at 80x24
  → Type "handleRequest" at 80x24, switch to Code tab
  → Assert code rows show repo + path only (no snippet)

SNAP-SEARCH-011: Search loading state
  → Type query with slow API response
  → Assert "Searching…" indicator below tab bar

SNAP-SEARCH-012: Zero results state
  → Type "xyznonexistent" → wait for results
  → Assert all tab counts show (0)
  → Assert "No results for 'xyznonexistent'." with hint text

SNAP-SEARCH-013: Active tab indicator
  → Type query with results → Tab to Issues tab
  → Assert Issues tab label has bold/underline styling in primary color
  → Assert other tabs in muted color

SNAP-SEARCH-014: Focused result item
  → Type query → get results → j j
  → Assert third item highlighted with reverse video
  → Assert first two items in normal style

SNAP-SEARCH-015: Search input with long query
  → Type a 100-character query at 80x24
  → Assert input shows rightmost portion of query with cursor at end

SNAP-SEARCH-016: Tab count badges
  → Type "test" → wait for results
  → Assert each tab shows correct count from API response

SNAP-SEARCH-017: Error state on search failure
  → Type query with API returning 500
  → Assert "Search failed. Press R to retry." in error color

SNAP-SEARCH-018: Partial error state
  → Type query with repos succeeding but code failing
  → Assert Repositories tab shows results
  → Assert Code tab shows error with retry hint

SNAP-SEARCH-019: Rate limit state
  → Type query with API returning 429, Retry-After: 30
  → Assert "Rate limited. Retry in 30s." on affected tab

SNAP-SEARCH-020: Pagination loading indicator
  → Type query returning 60+ results → scroll to bottom
  → Assert "Loading more…" at bottom of results list

SNAP-SEARCH-021: Issue state badges
  → Search issues → assert open issues show ● in green, closed show ○ in red

SNAP-SEARCH-022: Repository visibility badges
  → Search repos → assert public show ◆ in green, private show ◇ in muted

SNAP-SEARCH-023: Header breadcrumb
  → Open search screen → assert header shows "Search"
```

### Keyboard Interaction Tests

```
KEY-SEARCH-001: g s opens search screen
  → From dashboard, press g s → Assert search screen mounted, input focused

KEY-SEARCH-002: s from dashboard opens search screen
  → From dashboard, press s → Assert search screen mounted, input focused

KEY-SEARCH-003: Typing dispatches search after debounce
  → Type "test" → wait 300ms → Assert API requests dispatched for all 4 endpoints

KEY-SEARCH-004: Backspace deletes last character
  → Type "test" → Backspace → Assert input shows "tes" → wait debounce → new query dispatched

KEY-SEARCH-005: Ctrl+U clears query
  → Type "test" → Ctrl+U → Assert input empty → Assert empty state shown

KEY-SEARCH-006: Esc from input with query returns to results
  → Type "test" → get results → Esc → Assert focus on results list → Assert query preserved

KEY-SEARCH-007: Esc from input with empty query pops screen
  → Open search → Esc (without typing) → Assert search screen popped

KEY-SEARCH-008: Esc from results list pops screen
  → Type query → get results → Esc (focus results) → Esc → Assert search screen popped

KEY-SEARCH-009: / from results list focuses input
  → Type query → get results → Esc (focus results) → / → Assert input focused

KEY-SEARCH-010: Enter from input returns focus to results
  → Type "test" → get results → Enter → Assert focus on results list, first item focused

KEY-SEARCH-011: Enter on result navigates to detail
  → Type "test" → get repo results → Enter → Assert repo overview screen pushed

KEY-SEARCH-012: q returns from detail to search with state
  → Navigate to result detail → q → Assert search screen with query and results preserved

KEY-SEARCH-013: Tab switches to next tab
  → Type query → get results → Tab → Assert Issues tab → Tab → Assert Users tab

KEY-SEARCH-014: Shift+Tab switches to previous tab
  → On Issues tab → Shift+Tab → Assert Repositories tab active

KEY-SEARCH-015: 1-4 jump to tabs
  → Press 2 → Assert Issues tab → Press 4 → Assert Code tab → Press 1 → Assert Repos tab

KEY-SEARCH-016: j/k navigates results
  → Type query → get results → j → Assert second item focused → k → Assert first item focused

KEY-SEARCH-017: G jumps to last item
  → Type query with 10+ results → G → Assert last loaded item focused

KEY-SEARCH-018: g g jumps to first item
  → Move to item 5 → g g → Assert first item focused

KEY-SEARCH-019: Ctrl+D pages down
  → Type query with 20+ results → Ctrl+D → Assert cursor moved down by half visible height

KEY-SEARCH-020: R retries on error
  → Query fails with 500 → Assert error → R → Assert retry dispatched

KEY-SEARCH-021: R is noop when no error
  → Type query → get results → R → Assert no action

KEY-SEARCH-022: q pops search screen from results
  → Type query → get results → q → Assert search screen popped

KEY-SEARCH-023: j/k in input types literal characters
  → Focus input → press j → Assert "j" typed → press k → Assert "jk" typed

KEY-SEARCH-024: 1-4 in input types literal characters
  → Focus input → press 1 → Assert "1" typed → press 2 → Assert "12" typed

KEY-SEARCH-025: Tab switching preserves per-tab scroll position
  → Repos tab: scroll to item 5 → Tab to Issues → Tab back → Assert item 5 still focused

KEY-SEARCH-026: Rapid typing debounce
  → Type "authentication" rapidly → Assert only one API dispatch after final character + 300ms

KEY-SEARCH-027: Query change aborts in-flight requests
  → Type "api" (slow response) → type " gateway" → Assert only "api gateway" results rendered

KEY-SEARCH-028: Search input max length
  → Type 130 characters → Assert only 120 accepted

KEY-SEARCH-029: Enter on issue result navigates to issue detail
  → Switch to Issues tab → Enter → Assert issue detail screen pushed

KEY-SEARCH-030: Enter on code result navigates to code explorer
  → Switch to Code tab → Enter → Assert code explorer pushed with file focused

KEY-SEARCH-031: Enter on user result navigates to user profile
  → Switch to Users tab → Enter → Assert user profile screen pushed

KEY-SEARCH-032: Pagination on scroll
  → Type query returning 40+ results → scroll to 80% → Assert page 2 loads

KEY-SEARCH-033: go-to from search screen
  → On search → g d → Assert dashboard pushed

KEY-SEARCH-034: Command palette from search screen
  → On search → : → Assert command palette opens → Esc → Assert back to search
```

### Responsive Tests

```
RESIZE-SEARCH-001: 120x40 full layout
  → Open search at 120x40 → Type query → Assert full tab labels, 2-line repo rows, code snippets

RESIZE-SEARCH-002: 80x24 minimum layout
  → Open search at 80x24 → Type query → Assert abbreviated tabs, 1-line rows, no code snippets

RESIZE-SEARCH-003: 200x60 large layout
  → Open search at 200x60 → Type query → Assert full tabs, 2-line rows, 4-line code snippets

RESIZE-SEARCH-004: Resize 120→80 collapses layout
  → Type query at 120x40 → Resize to 80x24 → Assert tabs abbreviated → Assert rows collapsed

RESIZE-SEARCH-005: Resize 80→120 expands layout
  → Type query at 80x24 → Resize to 120x40 → Assert tabs expanded → Assert rows expanded

RESIZE-SEARCH-006: Resize preserves query and focus
  → Type "test" → focus item 3 → Resize 120→80 → Assert "test" in input → Assert item 3 focused

RESIZE-SEARCH-007: Resize preserves active tab
  → Switch to Code tab → Resize 120→80 → Assert Code tab still active

RESIZE-SEARCH-008: Resize during loading
  → Type query (slow response) → Resize → Assert "Searching…" still shown → Results at new size

RESIZE-SEARCH-009: Resize with empty state
  → Open search at 120x40 → Resize to 80x24 → Assert empty state re-centered

RESIZE-SEARCH-010: Rapid resize without artifacts
  → Type query → Resize 120→80→200→100→150 → Assert clean layout at final size

RESIZE-SEARCH-011: Code snippet visibility toggle on resize
  → Code tab at 120x40 (2-line snippets) → Resize to 80x24 (snippets hidden) → Resize to 200x60 (4-line snippets)
```

### Integration Tests

```
INT-SEARCH-001: Full search flow — type, browse, open, return
  → g s → type "api" → wait → verify counts → Tab to Issues → Enter → verify issue detail → q → verify search state preserved

INT-SEARCH-002: All four API endpoints called in parallel
  → Type "test" → Assert 4 concurrent requests to /api/search/{repositories,issues,users,code}

INT-SEARCH-003: Pagination loads next page
  → Type query returning 60 repos → Scroll to 80% → Assert page 2 request → Assert items appended

INT-SEARCH-004: Pagination stops at 300 cap
  → Type query returning 500+ repos → Scroll through 10 pages → Assert no page 11 request

INT-SEARCH-005: Auth expiry during search
  → Type query → API returns 401 → Assert app-shell auth error screen

INT-SEARCH-006: Rate limit 429 handling
  → Type query → API returns 429 → Assert "Rate limited. Retry in {N}s."

INT-SEARCH-007: Network timeout handling
  → Type query → API times out → Assert "Search failed. Press R to retry."

INT-SEARCH-008: Partial API failure
  → Repos returns 200, code returns 500 → Assert Repos shows results → Assert Code shows error

INT-SEARCH-009: Debounce cancels stale queries
  → Type "a", "b", "c" rapidly → Assert only one dispatch with "abc"

INT-SEARCH-010: In-flight abort on new query
  → Type "old" (slow) → Type "new" → Assert only "new" results rendered

INT-SEARCH-011: Client-side guard on empty query
  → Clear query → Assert no API request dispatched

INT-SEARCH-012: Deep link launch
  → Launch `codeplane tui --screen search` → Assert search screen as root

INT-SEARCH-013: Search from command palette
  → : → type "search" → Enter → Assert search screen pushed

INT-SEARCH-014: Search state preserved across navigation
  → Type "test" → g d → g s → Assert "test" and results present

INT-SEARCH-015: Code result navigation
  → Search "function" → Code tab → Enter → Assert code explorer at correct file

INT-SEARCH-016: Issue result shows correct repo context
  → Search "bug" → Issues tab → Assert each row shows owning repo from API

INT-SEARCH-017: Large total_count formatting
  → Search returning total_count=15000 → Assert tab badge shows "15k+"

INT-SEARCH-018: Unicode query and results
  → Type "日本語" → Assert query dispatched → Assert results render correctly

INT-SEARCH-019: Special characters in query
  → Type "func()" → Assert URL-encoded request → Assert results render

INT-SEARCH-020: Multiple rapid tab switches
  → Type query → Tab Tab Tab Tab → Assert final tab active → No rendering artifacts
```

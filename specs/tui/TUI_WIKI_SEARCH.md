# TUI_WIKI_SEARCH

Specification for TUI_WIKI_SEARCH.

## High-Level User POV

Wiki Search is the keyboard-driven search capability embedded within the Wiki List screen of the Codeplane TUI. It allows a developer to rapidly locate wiki pages within a repository by typing a query that matches against page titles, slugs, and body content — all without leaving the wiki list or navigating to a separate screen. The search is activated by pressing `/` from the wiki list, which focuses the search input in the persistent toolbar immediately below the title row.

When the user presses `/`, the cursor moves into the search input and the placeholder text "Search wiki pages…" clears. As the user types, the query is debounced by 300ms and then dispatched to the wiki API's server-side search endpoint (`GET /api/repos/:owner/:repo/wiki?q=<query>&page=1&per_page=30`). The wiki list below the input replaces with matching pages ranked by relevance — the server applies intelligent ranking: exact slug matches appear first, followed by exact title matches, then title prefixes, slug prefixes, and finally body content matches. While the search request is in flight, a "Searching…" indicator appears in the match count area. When results arrive, the list repopulates and the first matching result is automatically focused.

Each result row displays the page title (with matching text segments highlighted in `primary` accent color), the slug in muted text (also highlighted where matching), the author login, and a relative timestamp. The highlight makes it immediately obvious why each result matched the query. Navigation within results uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused result pushes the wiki page detail view onto the navigation stack. Pressing `q` from the detail view returns to the wiki list with the search query, results, and cursor position preserved.

A match count badge appears to the right of the search input: "N results" in muted color (or "1 result" singular), derived from the `X-Total-Count` response header. When zero pages match, the badge shows "No results" in warning color and the list area displays "No wiki pages match '{query}'" with a hint "Press Esc to clear search."

The search input supports standard editing: `Backspace` deletes the last character, `Ctrl+W` deletes the last word, and `Ctrl+U` clears the entire query text without dismissing the input. Pressing `Enter` while the search input is focused closes the input and moves focus to the first result in the filtered list — the query remains active and results are preserved. Pressing `Esc` clears the search query, re-fetches the unfiltered wiki page list from the server, and returns focus to the list. If the search input is empty and no search was previously active, `Esc` behaves as a standard back action (same as `q` — popping the wiki list screen).

The search integrates cleanly with the wiki list's existing pagination and lifecycle. When a search query is submitted, pagination resets to page 1. Search results are paginated identically to the unfiltered list (30 items per page, 500-item memory cap). The user can scroll through search results and trigger additional page loads at the 80% scroll threshold. The header count updates to reflect search results: "Wiki (3)" instead of "Wiki (23)" during an active search.

At minimum terminal size (80×24), the search input spans the full content width and result rows show only the title and timestamp. At standard (120×40), the search input takes 70% width with the match count always visible, and result rows include title, slug, author, and timestamp — all with match highlighting. At large (200×60+), the input is 60% width and result rows use wider columns. The search input maximum length is 120 characters — additional characters are silently ignored. Long queries that exceed the visible input width scroll horizontally within the input.

The search state is preserved when navigating to a page detail and returning, but is cleared when leaving the wiki screen entirely (via go-to navigation or when the screen is unmounted and re-mounted). Within the wiki screen, the search acts as a transient filter on the page list.

## Acceptance Criteria

### Definition of Done

- [ ] Pressing `/` from the wiki list screen focuses the search input rendered in the persistent search toolbar below the title row
- [ ] The search input displays a `/ ` prefix indicator in `muted` color (ANSI 245) and accepts keyboard text input
- [ ] The search input placeholder reads "Search wiki pages…" in `muted` color when empty and unfocused
- [ ] Typing in the search input dispatches a debounced (300ms) server-side search request to `GET /api/repos/:owner/:repo/wiki?q={query}&page=1&per_page=30`
- [ ] The search is entirely server-side — no client-side filtering is performed
- [ ] The query parameter `q` is URL-encoded before dispatch
- [ ] Queries that are empty or whitespace-only after trimming do not dispatch an API request; the full page list is shown instead
- [ ] Server-side search matches against wiki page title, slug, and body content using case-insensitive `ILIKE`
- [ ] Server-side results are ranked by relevance: exact slug match → exact title match → title prefix → slug prefix → body content match
- [ ] A match count badge renders to the right of the search input: "N results" in `muted` (ANSI 245), "1 result" (singular), or "No results" in `warning` (ANSI 178) when zero pages match
- [ ] The match count is derived from the `X-Total-Count` response header, not from the count of items on the current page
- [ ] Matching text segments in wiki page titles are highlighted with `primary` color (ANSI 33) in the result rows
- [ ] Matching text segments in wiki page slugs are highlighted with `primary` color at standard and large terminal sizes
- [ ] Pressing `Enter` while search input is focused closes the input and returns focus to the filtered wiki page list, preserving results
- [ ] Pressing `Esc` while search input has text clears the query, re-fetches the unfiltered list from the server, and returns focus to the list
- [ ] Pressing `Esc` while search input is empty and a search was previously active clears the active search and restores the full list
- [ ] Pressing `Esc` while search input is empty and no search was active behaves as the standard back action (pop screen)
- [ ] When a search query is submitted, pagination resets to page 1
- [ ] The wiki page list cursor resets to the first result when search results arrive
- [ ] When the search produces zero results, the list area shows "No wiki pages match '{query}'" centered in `muted` color with a hint "Press Esc to clear search"
- [ ] The header count updates to reflect search results: "Wiki (N)" where N is the search result `X-Total-Count`
- [ ] After locking search results with `Enter`, pressing `/` re-opens the search input with the previous query pre-filled
- [ ] Returning from wiki detail view via `q` preserves search results and cursor position
- [ ] The breadcrumb reads "Dashboard > owner/repo > Wiki" regardless of search state
- [ ] Search results use page-based pagination with `page` and `per_page` query parameters (default 30 per page)
- [ ] Pagination loads the next page when scroll position reaches 80% of content height
- [ ] Memory cap: 500 wiki pages max loaded during search. After cap, footer shows "Showing 500 of N pages"
- [ ] The search toolbar is always visible — it is not conditionally rendered

### Keyboard Interactions

- [ ] `/`: Focus the search input (from wiki list context, not when already in search input or in delete confirmation)
- [ ] Any printable character: Appended to the search query while input is focused
- [ ] `Backspace`: Deletes last character from the search query
- [ ] `Ctrl+U`: Clears the entire search query text (while input is focused); does not dismiss search or submit
- [ ] `Ctrl+W`: Deletes last word from the search query (while input is focused)
- [ ] `Enter`: Submit search query (fires immediate request cancelling any pending debounce), close input, return focus to filtered list
- [ ] `Esc` (search input, query non-empty): Clear query, re-fetch unfiltered list, return focus to list
- [ ] `Esc` (search input, query empty, previous search active): Clear active search, restore full list, return focus to list
- [ ] `Esc` (search input, query empty, no previous search): Pop screen (same as `q`)
- [ ] `Ctrl+C`: Quit TUI (global binding, overrides search input)
- [ ] `j`/`k`/`Down`/`Up`: While search input is focused, these keys type characters into the input (no list navigation)
- [ ] `q`/`c`/`d`/`G`/`g`: While search input is focused, types into query (not actions)
- [ ] `/`: While search input is already focused, types literal `/` into query

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the app shell
- [ ] 80×24 – 119×39: Search input full width minus 2 padding. Match count hidden if overlaps query. Result rows: title + timestamp only
- [ ] 120×40 – 199×59: Search input 70% width. Match count always visible. Result rows: title (45ch) + slug (25ch) + author (12ch) + timestamp (4ch) — all with highlighting
- [ ] 200×60+: Search input 60% width. Match count always visible. Result rows: title (70ch) + slug (35ch) + author (15ch) + timestamp (4ch)
- [ ] Terminal resize preserves query text, cursor position, and focused row

### Truncation & Boundary Constraints

- [ ] Search query maximum: 120 characters, additional input silently ignored
- [ ] Query exceeding visible width: horizontal scroll within input, cursor always visible
- [ ] Title highlight across truncation: highlight applies to visible portion only
- [ ] Match count format: "N results" (2+), "1 result" (singular), "No results" (0). Max 15 characters
- [ ] Results per page: 30 items. Memory cap: 500 items
- [ ] Debounce delay: 300ms
- [ ] Page title max display: 200ch hard truncation
- [ ] Timestamps: max 4ch ("3d", "1w", "2mo", "1y", "now")
- [ ] Total count abbreviated above 9999 (e.g., "10K")

### Edge Cases

- [ ] Rapid typing: debounce resets per keystroke, only final query fires
- [ ] Type then Esc: pending request cancelled, unfiltered list re-fetched
- [ ] Type then Enter: pending debounce cancelled, immediate request fires
- [ ] Server 500/429/timeout: previous list preserved, inline error for 3 seconds
- [ ] Unicode in query: full support, grapheme-aware truncation
- [ ] SQL wildcard chars (%, _): server handles escaping, TUI URL-encodes
- [ ] SSE disconnect: search unaffected (REST-based)
- [ ] Whitespace-only query: treated as empty, no request
- [ ] Search during delete confirmation: no-op (focus trapped)
- [ ] Wiki page deleted between search and open: detail shows 404
- [ ] Null author field: shows "unknown" in muted text

## Design

### Layout Structure

The wiki search feature is integrated into the wiki list screen as an inline filter using the persistent search toolbar. The toolbar is always rendered; when search is inactive it shows a placeholder, when active it has a focused input.

**Standard layout (120×40) — Search active with results:**

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Wiki                     │
├──────────────────────────────────────────────────────────┤
│ Wiki (3)                                                   │
│ / getting█                                     3 results   │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ [Getting] Started                  /[getting]-started ali… │
│ [Getting] Started with Codep…      /[getting]-started bob  │
│ Configuration and [Getting] Up…    /configuration     car… │
├──────────────────────────────────────────────────────────┤
│ Enter:done Esc:clear Ctrl+U:clear-all q:back              │
└──────────────────────────────────────────────────────────┘
```

Bracketed segments indicate text highlighted in `primary` color (ANSI 33).

### Components Used

- `<box>` — Vertical/horizontal flexbox containers for search toolbar row, result rows
- `<scrollbox>` — Scrollable search result list with scroll-to-end pagination at 80%
- `<text>` — Title (with HighlightedText), slug (with HighlightedText), author, timestamp, match count badge, zero-results message
- `<input>` — Search input in toolbar (focused via `/`, max 120 chars)

### HighlightedText Sub-Component

Renders text with case-insensitive match segments highlighted in `primary` color (ANSI 33) with bold attribute. Non-matching segments use default (title) or `muted` (slug) color. Supports multiple non-overlapping matches per string. Respects truncation boundaries.

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `/` | List focused, no confirmation | Activate search input |
| `/` | Input focused | Type literal `/` |
| `/` | List with active search | Re-open input with previous query |
| Printable chars | Input focused | Append to query |
| `Backspace` | Input focused | Delete last character |
| `Ctrl+U` | Input focused | Clear entire query |
| `Ctrl+W` | Input focused | Delete last word |
| `Enter` | Input focused | Submit, close input, focus results |
| `Esc` | Input, query non-empty | Clear, restore full list |
| `Esc` | Input, empty, search active | Clear active search |
| `Esc` | Input, empty, no search | Pop screen |
| `j`/`k`/`Down`/`Up` | Result list | Navigate rows |
| `Enter` | Result list | Open wiki detail |
| `G` | Result list | Jump to last result |
| `g g` | Result list | Jump to first result |
| `Ctrl+D`/`Ctrl+U` | Result list | Page down/up |
| `c` | Result list | Create wiki page |
| `d` | Result list | Delete focused page |
| `q` | Result list | Pop screen |
| `R` | Error state | Retry search |

### Responsive Behavior

| Dimension | 80×24 | 120×40 | 200×60+ |
|-----------|-------|--------|--------|
| Input width | Full minus 2 | 70% | 60% |
| Match count | Hidden if overlap | Visible | Visible |
| Title column | Remaining, truncated | 45ch + highlight | 70ch + highlight |
| Slug column | Hidden | 25ch + highlight | 35ch + highlight |
| Author column | Hidden | 12ch | 15ch |
| Timestamp | 4ch | 4ch | 4ch |

Resize triggers synchronous re-layout preserving query, cursor, scroll position, and focused row.

### Data Hooks Consumed

- `useWikiPages()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/wiki?page=N&per_page=30&q=...`
- Response header `X-Total-Count` provides total match count for badge and header
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI

### Search State Management

Local state: `searchActive` (boolean), `searchQuery` (string, max 120), `activeQuery` (string|null), `searchLoading` (boolean), `debounceTimer`. The `useWikiPages()` hook receives `activeQuery` as the `q` parameter. Enter sets `activeQuery` immediately; Esc clears it to null.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View wiki list (public repo) | ✅ | ✅ | ✅ | ✅ |
| View wiki list (private repo) | ❌ | ✅ | ✅ | ✅ |
| Search wiki pages | Same as view | ✅ | ✅ | ✅ |
| Open wiki page from search results | Same as view | ✅ | ✅ | ✅ |

- The wiki list screen requires an active repository context enforced at navigation level
- `GET /api/repos/:owner/:repo/wiki?q=...` respects repository visibility: public repos accessible to all authenticated users; private repos require read access
- No elevated role required to search. Write access only needed for create/edit/delete (separate features)
- Search queries are not stored server-side and do not appear in audit logs

### Token-based Auth

- Token loaded from CLI keychain (via `codeplane auth login`) or `CODEPLANE_TOKEN` environment variable at TUI bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- TUI does not retry 401s; user must re-authenticate via CLI

### Rate Limiting

- Wiki search shares the list endpoint: 300 req/min per authenticated user
- 300ms debounce limits bursts to ~3.3 req/sec during continuous typing
- 429 responses preserve previous list state with inline "Rate limited" warning
- No auto-retry on 429; next user-initiated search retries naturally

### Input Sanitization

- Search query URL-encoded by the API client before transmission
- Server handles SQL `ILIKE` escaping for wildcard characters (`%`, `_`, `\`)
- Results rendered as plain `<text>` — no terminal injection vector
- ANSI escape codes in API response data are stripped before rendering
- Input capped at 120 characters client-side

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.wiki.search.activated` | User presses `/` | `repo`, `total_pages_loaded`, `terminal_width`, `terminal_height`, `breakpoint`, `had_previous_query` |
| `tui.wiki.search.query_submitted` | Query dispatched (debounce or Enter) | `repo`, `query_length`, `trigger` ("debounce"/"enter"), `is_refinement` |
| `tui.wiki.search.results_loaded` | API response received | `repo`, `query_length`, `result_count`, `total_count`, `duration_ms` |
| `tui.wiki.search.result_opened` | Enter on search result | `repo`, `wiki_slug`, `position_in_results`, `query_length`, `total_results` |
| `tui.wiki.search.cleared` | Esc to clear search | `repo`, `query_length`, `results_count`, `duration_ms` |
| `tui.wiki.search.submitted` | Enter to lock results | `repo`, `query_length`, `results_count`, `duration_ms` |
| `tui.wiki.search.server_error` | Search request fails | `repo`, `error_type`, `http_status`, `query_length` |
| `tui.wiki.search.no_results` | Zero results | `repo`, `query_length`, `total_pages_in_repo` |
| `tui.wiki.search.paginated` | Scroll loads next page | `repo`, `query_length`, `page_number`, `items_loaded_total`, `total_count` |
| `tui.wiki.search.reactivated` | `/` re-opens with previous query | `repo`, `previous_query_length`, `previous_match_count` |
| `tui.wiki.search.retry` | R to retry failed search | `repo`, `retry_success`, `previous_error_type` |
| `tui.wiki.search.dismissed` | Exit wiki screen while search active | `repo`, `exit_method`, `queries_dispatched`, `results_opened`, `time_searching_ms` |

### Common Event Properties

All events include: `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode` ("truecolor"/"256"/"16"), `breakpoint` ("minimum"/"standard"/"large")

### Success Indicators

| Metric | Target |
|--------|--------|
| Search activation rate | ≥ 20% of wiki list views |
| Query-to-result-open rate | ≥ 50% of searches |
| Mean query length | 3–20 characters |
| Zero-result rate | < 20% of queries |
| Server search error rate | < 2% of requests |
| Search-to-clear ratio | < 40% |
| Time to first result opened | < 5 seconds median |
| Search pagination rate | < 10% of searches |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Search activated | `Wiki: search activated [repo={r}] [loaded={n}]` |
| `debug` | Debounce fired | `Wiki: search debounce [repo={r}] [query_length={n}]` |
| `debug` | Server request sent | `Wiki: server search [repo={r}] [query_length={n}] [page={p}]` |
| `debug` | Response received | `Wiki: search response [repo={r}] [results={n}] [total={t}] [duration={ms}ms]` |
| `debug` | Search cleared | `Wiki: search cleared [repo={r}] [query_length={n}]` |
| `debug` | Search submitted | `Wiki: search submitted [repo={r}] [query_length={n}] [results={n}]` |
| `debug` | Pagination | `Wiki: search pagination [repo={r}] [page={n}] [items_loaded={n}]` |
| `debug` | In-flight aborted | `Wiki: search aborted [repo={r}] [query_length={n}]` |
| `info` | Page opened from search | `Wiki: opened from search [repo={r}] [slug={s}] [query_length={n}] [position={i}]` |
| `info` | Search dismissed | `Wiki: search dismissed [repo={r}] [method={m}] [queries={n}]` |
| `warn` | Search failed | `Wiki: search failed [repo={r}] [status={code}] [error={msg}]` |
| `warn` | Timed out | `Wiki: search timeout [repo={r}] [query_length={n}] [timeout=10s]` |
| `warn` | Rate limited | `Wiki: search rate limited [repo={r}] [retry_after={n}s]` |
| `warn` | Slow response (>3s) | `Wiki: search slow [repo={r}] [duration={ms}ms]` |
| `warn` | Pagination cap | `Wiki: search pagination cap [repo={r}] [items={n}] [cap=500]` |
| `warn` | Zero results | `Wiki: search no results [repo={r}] [query_length={n}]` |
| `error` | Auth error | `Wiki: search auth error [repo={r}] [status=401]` |
| `error` | Render error | `Wiki: search render error [repo={r}] [component={c}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during search input focus | Input width recalculates, query preserved | Independent |
| Resize during in-flight search | Fetch continues, renders at new layout | Independent |
| SSE disconnect | Status bar indicator only; search unaffected (REST) | SSE provider reconnects |
| Auth expiry | 401 → auth error screen; search state lost | Re-auth via CLI |
| Rate limited (429) | Previous list preserved; inline warning 3s | User retries manually |
| Server error (500+) | Previous list preserved; "Search failed" 3s | User retries with R |
| Network timeout (10s) | Previous list preserved; "Search timed out" 3s | User retries with R |
| Rapid keystrokes | Debounce resets; only final query fires | No dropped keys |
| Whitespace-only query | No request; full list shown | Input stays focused |
| / during loading | No-op | User retries after load |
| Delete during search | Results update optimistically | Focus moves to next row |
| Page deleted externally | 404 on detail open | Detail shows "not found" |
| No color support | Bold/underline instead of ANSI 33 | Theme detection |

### Failure Modes

- Server always fails → no client-side fallback; user presses Esc to browse unfiltered list
- Search component crash → screen error boundary catches; wiki list restored; `/` re-activates
- Memory pressure → 500-item cap enforced; no further pagination
- Slow search (>3s) → "Searching…" indicator; Esc cancels and aborts request
- Stale results → in-flight response discarded via request abort; latest query wins

## Verification

### Test File: `e2e/tui/wiki.test.ts`

### Terminal Snapshot Tests (16 tests)

- SNAP-WIKI-SEARCH-001: Search input activated at 120×40 — shows `/ ` prefix, cursor, page list below
- SNAP-WIKI-SEARCH-002: Search with query and results at 120×40 — highlighted titles and slugs, "3 results" badge
- SNAP-WIKI-SEARCH-003: Zero results at 120×40 — "No wiki pages match 'zzzznonexistent'", "Press Esc to clear search"
- SNAP-WIKI-SEARCH-004: Search input at 80×24 — full width, match count right-aligned
- SNAP-WIKI-SEARCH-005: Search results at 80×24 — title+timestamp only, highlights visible
- SNAP-WIKI-SEARCH-006: Search input at 200×60 — 60% width, generous padding
- SNAP-WIKI-SEARCH-007: Highlighted title and slug at 120×40 — primary color on match segments
- SNAP-WIKI-SEARCH-008: "Searching…" loading state at 120×40
- SNAP-WIKI-SEARCH-009: Server error state — "Search failed" in error color
- SNAP-WIKI-SEARCH-010: Locked results after Enter — filtered list focused, header updated
- SNAP-WIKI-SEARCH-011: Focused result row — reverse video highlight on second row after j
- SNAP-WIKI-SEARCH-012: Singular match count — "1 result"
- SNAP-WIKI-SEARCH-013: Header count update — "Wiki (3)" during search
- SNAP-WIKI-SEARCH-014: Dashed separator between toolbar and results
- SNAP-WIKI-SEARCH-015: Long query at 80×24 — horizontal scroll, match count hidden
- SNAP-WIKI-SEARCH-016: Pagination cap message — "Showing 500 of 600 pages"

### Keyboard Interaction Tests (30 tests)

- KEY-WIKI-SEARCH-001: / activates search input
- KEY-WIKI-SEARCH-002: Typing triggers debounced server search (300ms)
- KEY-WIKI-SEARCH-003: Backspace deletes char and re-debounces
- KEY-WIKI-SEARCH-004: Ctrl+U clears query text
- KEY-WIKI-SEARCH-005: Ctrl+W deletes last word
- KEY-WIKI-SEARCH-006: Enter closes input, focuses first result
- KEY-WIKI-SEARCH-007: Enter fires immediate search cancelling debounce
- KEY-WIKI-SEARCH-008: Esc with query clears and re-fetches unfiltered
- KEY-WIKI-SEARCH-009: Esc with empty query (no prev search) pops screen
- KEY-WIKI-SEARCH-010: Esc with empty query (prev search active) clears search
- KEY-WIKI-SEARCH-011: j/k/q/c/d captured as text in input
- KEY-WIKI-SEARCH-012: / in input types literal slash
- KEY-WIKI-SEARCH-013: / re-opens input with previous query
- KEY-WIKI-SEARCH-014: j/k navigation in locked results, Enter opens detail
- KEY-WIKI-SEARCH-015: Return from detail preserves search state
- KEY-WIKI-SEARCH-016: / during initial loading is no-op
- KEY-WIKI-SEARCH-017: Ctrl+C quits during search
- KEY-WIKI-SEARCH-018: Rapid typing triggers single request
- KEY-WIKI-SEARCH-019: Match count updates on results
- KEY-WIKI-SEARCH-020: Case-insensitive highlighting
- KEY-WIKI-SEARCH-021: Delete page from search results
- KEY-WIKI-SEARCH-022: Create page then return re-fetches
- KEY-WIKI-SEARCH-023: Pagination within search results
- KEY-WIKI-SEARCH-024: Search cancels in-flight pagination
- KEY-WIKI-SEARCH-025: G and g g in search results
- KEY-WIKI-SEARCH-026: Ctrl+D/U page through results
- KEY-WIKI-SEARCH-027: Special chars URL-encoded
- KEY-WIKI-SEARCH-028: Whitespace-only query shows full list
- KEY-WIKI-SEARCH-029: / during delete confirmation is no-op
- KEY-WIKI-SEARCH-030: R retries failed search

### Responsive Tests (11 tests)

- RESIZE-WIKI-SEARCH-001: 80×24 — full width input, title+timestamp rows
- RESIZE-WIKI-SEARCH-002: 120×40 — 70% input, all columns with highlights
- RESIZE-WIKI-SEARCH-003: 200×60 — 60% input, wider columns
- RESIZE-WIKI-SEARCH-004: 120→80 collapses slug/author, preserves highlights
- RESIZE-WIKI-SEARCH-005: 80→120 reveals slug/author with highlights
- RESIZE-WIKI-SEARCH-006: Cursor position preserved through resize
- RESIZE-WIKI-SEARCH-007: Resize during in-flight search
- RESIZE-WIKI-SEARCH-008: Match count hidden at 80×24 with long query
- RESIZE-WIKI-SEARCH-009: Match count reappears after resize to larger
- RESIZE-WIKI-SEARCH-010: Zero results message re-centers on resize
- RESIZE-WIKI-SEARCH-011: Rapid resize without artifacts

### Integration Tests (20 tests)

- INT-WIKI-SEARCH-001: Full flow — activate, type, browse, open, return
- INT-WIKI-SEARCH-002: API called with correct q, page, per_page params
- INT-WIKI-SEARCH-003: Results replace list, header shows search count
- INT-WIKI-SEARCH-004: Esc re-fetches unfiltered list
- INT-WIKI-SEARCH-005: Pagination preserves q parameter
- INT-WIKI-SEARCH-006: Pagination cap at 500 items
- INT-WIKI-SEARCH-007: Auth expiry → auth error screen
- INT-WIKI-SEARCH-008: 429 → "Rate limited" warning
- INT-WIKI-SEARCH-009: Timeout → "Search timed out" warning
- INT-WIKI-SEARCH-010: 500 → "Search failed" warning
- INT-WIKI-SEARCH-011: Debounce prevents excessive requests
- INT-WIKI-SEARCH-012: Debounce cancels pending on new keystroke
- INT-WIKI-SEARCH-013: In-flight abort on query change
- INT-WIKI-SEARCH-014: Result ranking — exact slug first
- INT-WIKI-SEARCH-015: X-Total-Count used for match count
- INT-WIKI-SEARCH-016: State preserved across detail navigation
- INT-WIKI-SEARCH-017: State cleared on screen exit and re-entry
- INT-WIKI-SEARCH-018: Delete from results updates count
- INT-WIKI-SEARCH-019: Enter with unchanged query skips re-fetch
- INT-WIKI-SEARCH-020: Unicode query URL-encoded correctly

### Edge Case Tests (14 tests)

- EDGE-WIKI-SEARCH-001: Unicode in query
- EDGE-WIKI-SEARCH-002: 120-char query limit
- EDGE-WIKI-SEARCH-003: SQL wildcard characters (%, _)
- EDGE-WIKI-SEARCH-004: Empty repo with search
- EDGE-WIKI-SEARCH-005: Rapid / → Esc → / without state leaks
- EDGE-WIKI-SEARCH-006: ANSI escapes in API titles stripped
- EDGE-WIKI-SEARCH-007: Long title match near truncation
- EDGE-WIKI-SEARCH-008: Concurrent resize + keystroke
- EDGE-WIKI-SEARCH-009: Single character query
- EDGE-WIKI-SEARCH-010: Debounce cancelled on Esc
- EDGE-WIKI-SEARCH-011: Body match without title/slug match
- EDGE-WIKI-SEARCH-012: Memory cap at 500 items
- EDGE-WIKI-SEARCH-013: Null/missing author field
- EDGE-WIKI-SEARCH-014: Pasted text exceeding max length

All 91 tests left failing if backend is unimplemented — never skipped or commented out.

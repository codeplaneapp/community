# TUI_SEARCH_CODE_TAB

Specification for TUI_SEARCH_CODE_TAB.

## High-Level User POV

The Code tab on the global search screen is where terminal-native developers find code across all repositories they have access to. When the user types a query on the search screen and switches to the Code tab (by pressing `4`, or `Tab`/`Shift+Tab` to cycle), the results area transforms into a list of code matches — each showing the repository context, file path, and a syntax-highlighted snippet of the matching code. This is the closest thing to a cross-repository `grep` that Codeplane offers in the TUI, and it is designed to feel as natural as running `rg` in a terminal.

Each code result occupies multiple lines. The first line shows the repository owner/name in muted color and the file path in primary (blue) color, giving the user instant spatial context for where the match lives. Below that, a code snippet rendered via the `<code>` component shows the matching fragment with syntax highlighting derived from the file extension. A vertical `│` gutter in border color separates the snippet from the left edge, visually grouping the snippet lines as belonging to the file path above. At standard terminal size (120×40), each result shows 2 lines of snippet. At large terminal size (200×60+), 4 lines of snippet are visible, providing richer context. At minimum size (80×24), code snippets are hidden entirely — only the repository context and file path are shown — to preserve vertical space for more results.

The code snippet contains match highlighting: the server returns `<em>` tags around matched terms in the snippet text, and the TUI renders these highlighted segments in bold with the `primary` color, making matches visually distinct from surrounding code. This allows the user to scan results quickly and identify the most relevant match without opening each file.

Pressing `Enter` on a focused code result navigates to the repository code explorer with the matched file pre-focused, pushing a new screen onto the navigation stack. The search screen remains in the stack, so pressing `q` from the code explorer returns to the Code tab with the query, scroll position, and focused item fully preserved. This tight loop — search, inspect file, return, continue browsing — is the core workflow the Code tab enables.

Pagination works identically to other search tabs: scrolling to the bottom of the results list triggers a load of the next page (30 results per page, up to 10 pages / 300 results total). A "Loading more…" indicator appears at the bottom during fetches. The Code tab maintains its own independent scroll position and focused item index, so switching to another tab and back preserves the user's place.

The Code tab surfaces a unique kind of result among the search tabs — it shows actual source code. This means line lengths can vary wildly, snippets may contain special characters, and syntax highlighting must adapt to different file types. The `<code>` component handles these concerns: long lines are truncated at the terminal width (no horizontal scrolling within snippets), and syntax highlighting is applied based on the file extension inferred from the `path` field. If the file type is unrecognized, the snippet renders as plain monospace text.

## Acceptance Criteria

### Definition of Done

- [ ] The Code tab is the fourth tab on the search screen, accessible via `4` key or tab cycling
- [ ] The Code tab displays results from `GET /api/search/code` with the current query
- [ ] Each code result shows repository context (owner/repo) in `muted` color (ANSI 245)
- [ ] Each code result shows file path in `primary` color (ANSI 33)
- [ ] Each code result shows a code snippet rendered via the `<code>` component with syntax highlighting
- [ ] The code snippet is preceded by a `│` gutter in `border` color (ANSI 240)
- [ ] Matched terms within the snippet (delimited by `<em>`/`</em>` from the API) are rendered in bold + `primary` color
- [ ] At standard terminal size (120×40), each result shows the header line + 2 lines of snippet (3 lines total per result)
- [ ] At large terminal size (200×60+), each result shows the header line + 4 lines of snippet (5 lines total per result)
- [ ] At minimum terminal size (80×24), each result shows only the header line (1 line per result, no snippet)
- [ ] The focused code result is highlighted with reverse video on the header line
- [ ] `j`/`k`/`Up`/`Down` navigates between code results (moves by full result, not by line)
- [ ] `Enter` on a focused code result pushes the repository code explorer screen with the matched file path focused
- [ ] The navigation stack preserves the search screen: pressing `q` from the code explorer returns to the Code tab
- [ ] Returning to the Code tab from a detail screen restores the exact query, scroll position, and focused item
- [ ] The Code tab count badge updates from the `total_count` field of `CodeSearchResultPage`
- [ ] Pagination loads the next page when scroll reaches 80% of content height
- [ ] Pagination uses `page` and `per_page` parameters (default 30 per page)
- [ ] Pagination stops at 300 loaded items (10 pages × 30)
- [ ] A "Loading more…" indicator appears at the bottom of the list during pagination fetches
- [ ] The Code tab maintains independent scroll position and focused item from other tabs
- [ ] Switching away from the Code tab and back preserves scroll position and focused item
- [ ] Empty results on the Code tab show "No code results for '{query}'." centered in the results area
- [ ] Error state on the Code tab shows "Code search failed. Press R to retry." in `error` color
- [ ] Rate limit (429) on the code endpoint shows "Rate limited. Retry in {N}s." inline on the Code tab only
- [ ] Other tabs remain functional if only the code search endpoint fails (partial failure)
- [ ] The Code tab is selectable even when its count badge shows (0)

### Keyboard Interactions

- [ ] `4`: Switch to Code tab (from results list focus)
- [ ] `Tab`/`Shift+Tab`: Cycle through tabs including Code
- [ ] `j`/`Down`: Move to next code result (full-result navigation)
- [ ] `k`/`Up`: Move to previous code result (full-result navigation)
- [ ] `Enter`: Navigate to the code explorer for the focused result's repository + file path
- [ ] `G`: Jump to the last loaded code result
- [ ] `g g`: Jump to the first code result
- [ ] `Ctrl+D`: Page down by half the visible result count
- [ ] `Ctrl+U`: Page up by half the visible result count
- [ ] `/`: Return focus to the search input
- [ ] `R`: Retry failed code search request
- [ ] `q`: Pop the search screen
- [ ] `Esc`: Pop the search screen (from results list)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the app shell (not code-tab-specific)
- [ ] 80×24 – 119×39 (minimum): Code results show 1 line per result — `owner/repo  path/to/file.ts`. No snippet. File path truncated from the left with `…/` prefix if > 40 characters
- [ ] 120×40 – 199×59 (standard): Code results show 3 lines per result — header line + 2-line snippet with `│` gutter and syntax highlighting
- [ ] 200×60+ (large): Code results show 5 lines per result — header line + 4-line snippet with `│` gutter and syntax highlighting
- [ ] Terminal resize triggers synchronous re-render: snippet visibility adjusts immediately to new breakpoint
- [ ] Resize preserves the focused result index and scroll position (clamped to valid range)

### Truncation and Boundary Constraints

- [ ] Repository context (owner/repo) on the header line: max 30 characters, truncated with `…`
- [ ] File path on the header line: max 60 characters, truncated from the left with `…/` prefix (e.g., `…/src/middleware/rateLimit.ts`)
- [ ] At minimum breakpoint, file path max reduced to 40 characters
- [ ] Code snippet lines: truncated at terminal width minus gutter width (3 characters for `│ ` prefix), no horizontal scrolling
- [ ] Snippet text: max 20 words per fragment as returned by server-side `ts_headline()` with `MaxWords=20`
- [ ] `<em>` match markers stripped from raw text; matched segments rendered with bold + `primary` style
- [ ] Tab count badge: abbreviated above 9999 (e.g., "10k+")
- [ ] Total loaded results per tab: capped at 300 items
- [ ] Result rows with extremely short snippets (< 1 line): padded to the expected line count for consistent visual rhythm
- [ ] Snippet containing only whitespace: rendered as empty lines within the gutter block

### Edge Cases

- [ ] Terminal resize while Code tab is active: snippet line count adjusts (e.g., 2→4 lines or 2→0 lines), focused result preserved
- [ ] Terminal resize from large to minimum while on Code tab: snippets disappear, results collapse to 1-line, scroll position adjusted for new item heights
- [ ] Code snippet with very long lines (500+ chars): truncated at terminal width, no wrapping
- [ ] Code snippet containing tab characters: rendered as spaces (tab stop = 4 spaces within `<code>` component)
- [ ] Code snippet containing ANSI escape sequences in source code: handled by `<code>` component safely
- [ ] Code snippet with `<em>` tags adjacent to syntax highlighting tokens: both styles compose (syntax color + bold for match, primary color for match emphasis)
- [ ] File path with deeply nested directories: left-truncated to show the most specific part (e.g., `…/deeply/nested/path/file.ts`)
- [ ] Repository with very long owner or name: owner/repo truncated as a unit with `…` preserving the `/` separator
- [ ] Code result where `snippet` is empty string: header line shown, snippet area shows `│ (no preview available)` in `muted` color
- [ ] Unicode characters in code snippets: rendered correctly via `<code>` component (grapheme-aware)
- [ ] Mixed file types in results (`.ts`, `.py`, `.go`, `.rs`): each snippet uses file-extension-based syntax highlighting
- [ ] Unrecognized file extension: snippet rendered as plain monospace text, no highlighting
- [ ] Rapid `j`/`k` navigation through code results: cursor moves by full result (all lines), not line-by-line
- [ ] Code tab active during query change: results replaced atomically when new API response arrives
- [ ] Navigating to a code result whose repository has been deleted: code explorer shows appropriate error
- [ ] Pagination while code tab is active: new results appended below with correct snippet formatting
- [ ] 0 code results but other tabs have results: Code tab shows (0) badge, empty state message, other tabs unaffected

## Design

### Layout Structure

**Standard layout (120×40) — Code tab active:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Search                                                    │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 handleRequest█                                                │
├─────────────────────────────────────────────────────────────────┤
│ Repositories (3) │ Issues (12) │ Users (1) │ ▸Code (27)          │
├─────────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway  src/gateway/handler.ts                       │
│   │ export async function handleRequest(req: Request) {          │
│   │   const apiKey = req.headers.get("X-API-Key");               │
│   acme/api-gateway  src/middleware/auth.ts                        │
│   │ async function handleRequest(ctx: Context) {                 │
│   │   if (!ctx.auth) return unauthorized();                      │
│   acme/gateway-sdk  src/client.ts                                │
│   │ public async handleRequest(opts: RequestOptions) {           │
│   │   return this.fetch(opts.url, { method: opts.method });      │
├─────────────────────────────────────────────────────────────────┤
│ /:focus input  Tab:tab  j/k:nav  Enter:open file  q:back         │
└─────────────────────────────────────────────────────────────────┘
```

**Large layout (200×60) — Code tab active:**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Header: Search                                                                          │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 handleRequest█                                                                       │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Repositories (3) │ Issues (12) │ Users (1) │ ▸Code (27)                                 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway  src/gateway/handler.ts                                              │
│   │ import { validateApiKey } from "../auth";                                           │
│   │ export async function handleRequest(req: Request) {                                 │
│   │   const apiKey = req.headers.get("X-API-Key");                                      │
│   │   const user = await validateApiKey(apiKey);                                        │
│   acme/api-gateway  src/middleware/auth.ts                                               │
│   │ import { Context, unauthorized } from "../core";                                    │
│   │ async function handleRequest(ctx: Context) {                                        │
│   │   if (!ctx.auth) return unauthorized();                                             │
│   │   ctx.user = await resolveUser(ctx.auth.token);                                     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ /:focus input  Tab:tab  j/k:nav  Enter:open file  q:back                                │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Minimum layout (80×24) — Code tab active (no snippets):**

```
┌──────────────────────────────────────────────────────────────┐
│ Search                                                         │
├──────────────────────────────────────────────────────────────┤
│ 🔍 handleRequest█                                             │
├──────────────────────────────────────────────────────────────┤
│ Repos(3) Issues(12) Users(1) Code(27)                          │
├──────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway  src/gateway/handler.ts                     │
│   acme/api-gateway  src/middleware/auth.ts                      │
│   acme/gateway-sdk  src/client.ts                              │
│   internal/gateway  …/utils/requestHelper.ts                   │
│   acme/api-gateway  …/tests/handler.test.ts                    │
├──────────────────────────────────────────────────────────────┤
│ /:input Tab:tab j/k:nav Enter:open q:back                      │
└──────────────────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI + React 19)

```jsx
{/* Code tab results — rendered when activeTab === 3 */}
<scrollbox flexGrow={1} onScrollEnd={handleLoadMoreCode} scrollPosition={codeScrollPosition}>
  {codeLoading ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text fg="muted">Searching…</text>
    </box>
  ) : codeError ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text fg="error">{codeErrorMessage}</text>
      <text fg="muted">Press R to retry</text>
    </box>
  ) : codeResults.length === 0 && query.length > 0 ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text fg="muted">No code results for '{truncate(query, 40)}'.</text>
      <text fg="muted">Try a different query or check spelling.</text>
    </box>
  ) : (
    <box flexDirection="column">
      {codeResults.map((result, i) => (
        <CodeResultRow key={`${result.repository_id}:${result.path}`} result={result} focused={i === codeFocusedIndex} breakpoint={breakpoint} query={query} />
      ))}
      {codeLoadingMore && <text fg="muted">Loading more…</text>}
    </box>
  )}
</scrollbox>
```

### CodeResultRow Sub-component

Each code result renders:
- Line 1: repository context (owner/repo) in `muted` color (ANSI 245), file path in `primary` color (ANSI 33). Focused item has reverse video on the header line.
- Lines 2+ (standard: 2 lines, large: 4 lines): code snippet rendered via `<code>` component with syntax highlighting based on file extension, preceded by `│` gutter in `border` color (ANSI 240). Matched terms (from `<em>` tags) rendered in bold + `primary` color.

### Match Highlighting

The server returns code snippets with `<em>` and `</em>` tags wrapping matched terms (produced by PostgreSQL `ts_headline()` with `StartSel=<em>,StopSel=</em>,MaxFragments=1,MaxWords=20,MinWords=5`). The TUI client:
1. Strips `<em>`/`</em>` from the raw snippet text
2. Records character offset ranges for each matched segment
3. Passes ranges to the `<code>` component's `highlights` prop
4. Highlighted segments render in bold with `primary` color (ANSI 33)
5. Non-highlighted segments render with standard syntax highlighting colors

### Snippet Line Splitting

The snippet field from the API is a single string (~20 words). For multi-line display:
1. If the snippet contains literal newline characters, split on those
2. If no newlines, soft-wrap at available width (terminal width − 4 chars for gutter)
3. Pad with empty lines if snippet produces fewer lines than breakpoint expects
4. Truncate excess lines if snippet produces more than breakpoint allows

### Keybinding Reference (Code Tab Context)

| Key | Context | Action |
|-----|---------|--------|
| `4` | Results list (any tab) | Switch to Code tab |
| `Tab` | Search screen | Cycle to next tab |
| `Shift+Tab` | Search screen | Cycle to previous tab |
| `j` / `Down` | Code tab, result focused | Move to next code result (skip snippet lines) |
| `k` / `Up` | Code tab, result focused | Move to previous code result |
| `Enter` | Code tab, result focused | Push code explorer for result's repo + path |
| `G` | Code tab | Jump to last loaded code result |
| `g g` | Code tab | Jump to first code result |
| `Ctrl+D` | Code tab | Page down by half visible results |
| `Ctrl+U` | Code tab | Page up by half visible results |
| `/` | Code tab | Return focus to search input |
| `R` | Code tab, error state | Retry failed code search |
| `q` | Code tab | Pop search screen |
| `Esc` | Code tab | Pop search screen |

### Responsive Behavior

| Dimension | 80×24 (minimum) | 120×40 (standard) | 200×60+ (large) |
|-----------|-----------------|---------------------|------------------|
| Snippet lines per result | 0 (hidden) | 2 | 4 |
| Total lines per result | 1 | 3 | 5 |
| Visible results (approx.) | ~16 | ~10 | ~10 |
| Repo context max width | 30 chars | 30 chars | 30 chars |
| File path max width | 40 chars | 60 chars | 60 chars |
| File path truncation | Left (`…/file.ts`) | Left (`…/path/file.ts`) | Left (`…/path/file.ts`) |
| Snippet line width | N/A | terminal_width − 4 | terminal_width − 4 |
| Gutter | N/A | `│` (ANSI 240) | `│` (ANSI 240) |
| Syntax highlighting | N/A | Yes | Yes |
| Match highlighting | N/A | Bold + primary | Bold + primary |

### Data Hooks Consumed

| Hook | Source | Purpose |
|------|--------|--------|
| `useSearch().searchCode` | `@codeplane/ui-core` | Dispatches `GET /api/search/code`; returns `{ data: CodeSearchResultPage, loading, error, loadMore }` |
| `useUser()` | `@codeplane/ui-core` | Current authenticated user (for visibility scoping) |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size for breakpoint and snippet line count |
| `useOnResize()` | `@opentui/react` | Resize event trigger |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler |
| `useNavigation()` | TUI app shell | `{ push }` to navigate to code explorer |

### API Endpoint Consumed

| Endpoint | Parameters | Response |
|----------|------------|----------|
| `GET /api/search/code` | `q`, `page` (default 1), `per_page` (default 30, max 100) | `CodeSearchResultPage`: `{ items: CodeSearchResult[], total_count, page, per_page }` |

**CodeSearchResult**: `{ repository_id, repository_owner, repository_name, path, snippet }` where `snippet` contains `<em>`/`</em>` match markers.

### Navigation

- **Enter on code result**: Pushes code explorer with `{ owner, repo, path }`. Breadcrumb: `Search > owner/repo > path`.
- **Return from code explorer**: `q` pops back to search. Code tab restores scroll position, focused item, and query.
- **Tab switching**: Code tab state preserved independently; returning restores exact position.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View Code tab on search screen | ❌ | ✅ | ✅ |
| Receive code search results | ❌ | ✅ (visible repos only) | ✅ (all repos) |
| Navigate to code explorer from result | ❌ | ✅ (if repo access) | ✅ |

- The Code tab requires authentication. The TUI enforces authentication at bootstrap; unauthenticated sessions cannot reach the search screen.
- Code search results are scoped to repositories the authenticated user has access to. Private repository code is excluded unless the user has explicit access (owner, org member, collaborator). The server's `viewer` parameter ensures this — the TUI performs no client-side visibility filtering.
- Admin users may see additional code results due to broader repository access.
- The code search endpoint does not expose raw file content beyond the `ts_headline()` snippet (~20 words). Full file content requires navigating to the code explorer, which enforces its own repository access checks.

### Token Handling

- Token loaded from CLI keychain (`codeplane auth login`) or `CODEPLANE_TOKEN` environment variable at TUI bootstrap
- Passed as `Bearer` token in the `Authorization` header on the `GET /api/search/code` request
- Token is never displayed in the TUI, never written to logs, never included in error messages
- 401 on code search propagates to the app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- Code snippets in search results are rendered as-is from the API. No token or credential information is ever included in search result payloads.

### Rate Limiting

- Code search is one of four parallel requests dispatched per query (repos, issues, users, code). With 300ms debounce, this contributes ~13 code search requests per minute during continuous typing.
- Server-side rate limit: 300 requests per minute per authenticated user across all API endpoints
- 429 on the code endpoint: Code tab shows "Rate limited. Retry in {Retry-After}s." inline. Other tabs' results are unaffected.
- No auto-retry on 429 — user must press `R` manually after the retry-after period
- Pagination requests for the Code tab are user-initiated (scroll-driven) and do not contribute to debounce timing

### Input Sanitization

- Search query is URL-encoded by the `@codeplane/ui-core` API client before transmission
- The API validates query is non-empty (≥1 character after trim) and returns 422 if not
- Code snippets from the API contain `<em>`/`</em>` tags that the TUI parses for match highlighting — these are the only expected markup. Any other HTML-like content is rendered as literal text.
- Code snippets are rendered via the `<code>` component, which handles content safely in the terminal context (no injection vector)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.search.code_tab.activated` | User switches to the Code tab | `method` ("number_key", "tab_key", "shift_tab"), `code_result_count`, `query_length`, `had_results_on_previous_tab` |
| `tui.search.code_tab.result_opened` | User presses Enter on a code result | `repository_owner`, `repository_name`, `file_path`, `file_extension`, `position_in_list`, `query_length`, `total_code_results`, `snippet_lines_visible` |
| `tui.search.code_tab.pagination` | Scroll triggers next page load | `page_number`, `items_loaded_total`, `query_length` |
| `tui.search.code_tab.zero_results` | Code search returns 0 results | `query_length`, `query_text_hash`, `other_tabs_had_results` |
| `tui.search.code_tab.error` | Code search API fails | `error_type` ("network", "timeout", "rate_limit", "server_error", "auth"), `http_status`, `query_length` |
| `tui.search.code_tab.retry` | User presses R on code error | `retry_success`, `previous_error_type` |
| `tui.search.code_tab.deactivated` | User switches away from Code tab | `time_on_tab_ms`, `results_browsed`, `results_opened`, `pages_loaded` |
| `tui.search.code_tab.snippet_visible` | Code results rendered with snippets | `breakpoint`, `snippet_lines`, `file_extensions` (unique extensions in visible results) |

### Common Event Properties

All Code tab events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `breakpoint`: `"minimum"` | `"standard"` | `"large"`
- `color_mode`: `"truecolor"` | `"256"` | `"16"`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Code tab activation rate | ≥ 25% of search sessions | At least 25% of search sessions visit the Code tab |
| Code result open rate | ≥ 30% of Code tab visits | At least 30% of Code tab visits lead to opening a code result |
| Code result relevance | ≥ 50% open from top 3 | At least 50% of code result opens are from the first 3 results |
| Snippet usefulness | Code tab visit duration ≥ 3s | Users spend ≥3s browsing snippets before opening or leaving |
| Code tab zero-result rate | < 25% of code queries | Fewer than 25% of queries produce zero code results |
| Code tab error rate | < 3% of code queries | Fewer than 3% of code search requests fail |
| Return-to-code-tab rate | ≥ 25% of navigations | At least 25% of code-result-to-explorer navigations return to Code tab |
| Pagination engagement | ≥ 15% of Code tab visits | At least 15% of Code tab visits load page 2+ |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Code tab activated | `Search.CodeTab: activated [method={method}] [results={n}]` |
| `debug` | Code tab deactivated | `Search.CodeTab: deactivated [time_ms={ms}] [results_browsed={n}]` |
| `debug` | Code results rendered | `Search.CodeTab: rendered [count={n}] [snippet_lines={n}] [breakpoint={bp}]` |
| `debug` | Code result focused | `Search.CodeTab: focused [index={n}] [repo={owner/name}] [path={path}]` |
| `debug` | Code pagination triggered | `Search.CodeTab: pagination [page={n}] [items_loaded={n}]` |
| `debug` | Snippet parsed | `Search.CodeTab: snippet parsed [matches={n}] [lines={n}] [language={lang}]` |
| `info` | Code result navigated | `Search.CodeTab: navigated [repo={owner/name}] [path={path}] [position={n}]` |
| `info` | Code search results loaded | `Search.CodeTab: loaded [count={n}] [total={n}] [duration={ms}ms]` |
| `warn` | Code search API failed | `Search.CodeTab: API error [status={code}] [error={message}]` |
| `warn` | Code search rate limited | `Search.CodeTab: rate limited [retry_after={n}s]` |
| `warn` | Code search slow response | `Search.CodeTab: slow response [duration={ms}ms]` (> 3000ms) |
| `warn` | Code pagination cap reached | `Search.CodeTab: pagination cap [items={n}] [cap=300]` |
| `warn` | Snippet parse failure | `Search.CodeTab: snippet parse error [repo={owner/name}] [path={path}] [error={msg}]` |
| `error` | Code search auth error | `Search.CodeTab: auth error [status=401]` |
| `error` | Code tab render error | `Search.CodeTab: render error [component={name}] [error={message}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases Specific to TUI

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Code search API timeout (10s) | API client timeout | "Code search failed. Press R to retry." Results area shows error; other tabs unaffected |
| Code search 500+ error | HTTP status ≥ 500 | "Code search error. Press R to retry." on Code tab |
| Code search 429 rate limit | HTTP 429 with Retry-After header | "Rate limited. Retry in {N}s." on Code tab; other tabs unaffected |
| Code search 401 auth error | HTTP 401 | Propagated to app-shell auth error screen |
| Code search 422 invalid query | HTTP 422 | "Invalid search query." on Code tab |
| Terminal resize while Code tab displaying results | useOnResize fires | Re-render with new snippet line count; focused result preserved; scroll position clamped |
| Terminal resize during code search API fetch | useOnResize during pending request | Fetch continues; results render at new breakpoint when they arrive |
| Snippet contains malformed `<em>` tags | Parse fallback | Render snippet as plain text without match highlighting; log warning |
| Snippet is empty or null | Null check on result.snippet | Show "│ (no preview available)" in muted color below header line |
| Code result points to deleted repository | Navigation push succeeds but explorer shows 404 | Code explorer error screen handles this; not a Code tab concern |
| Extremely large total_count (50k+) | total_count from API | Tab badge shows "50k+"; pagination still capped at 300 loaded items |
| React error in CodeResultRow component | Error boundary per result | Failed result shows "[render error]" inline; other results unaffected |

### Failure Modes and Recovery

- **Code endpoint down, other endpoints healthy**: Only the Code tab shows error state. Repos, Issues, Users tabs function normally. Code tab badge shows `(–)` instead of a count. User can retry with `R`.
- **Stale code results after query change**: In-flight code search requests are aborted via request ID matching when a new query is dispatched. Only the most recent query's code results are rendered.
- **Memory pressure from large code result sets**: Pagination capped at 300 items. Each code result with 4-line snippets occupies ~5 lines of terminal memory. 300 items × 5 lines = 1500 virtual lines, well within scrollbox capacity.
- **Snippet rendering crash**: Each CodeResultRow is individually error-bounded. A single crashed result shows inline error; all other results continue rendering.
- **Language detection failure**: If getLanguageFromPath() cannot determine the language from the file extension, the `<code>` component falls back to plain monospace rendering without syntax highlighting.

## Verification

### Test File: `e2e/tui/search.test.ts`

### Terminal Snapshot Tests

```
SNAP-CODE-001: Code tab renders at 120x40 with results
  → Launch TUI at 120x40, press g s, type "handleRequest", wait for results
  → Press 4 to switch to Code tab
  → Assert Code tab label shows ▸Code ({count}) in bold/underline/primary
  → Assert first result header: owner/repo in muted, file path in primary
  → Assert snippet gutter │ in border color below header
  → Assert 2-line code snippet with syntax highlighting
  → Assert first result has reverse video (focused)

SNAP-CODE-002: Code tab renders at 80x24 with results (no snippets)
  → Launch TUI at 80x24, press g s, type "handleRequest", wait for results
  → Press 4 to switch to Code tab
  → Assert abbreviated tab label Code({count})
  → Assert result rows show only header line: owner/repo + file path
  → Assert no snippet lines, no gutter characters
  → Assert 1-line-per-result layout

SNAP-CODE-003: Code tab renders at 200x60 with results (4-line snippets)
  → Launch TUI at 200x60, press g s, type "handleRequest", wait for results
  → Press 4 to switch to Code tab
  → Assert result header lines with full repo/path
  → Assert 4-line code snippets with │ gutter
  → Assert syntax highlighting on snippet content

SNAP-CODE-004: Code tab empty results state
  → Type "xyznonexistent", wait for results, press 4
  → Assert Code tab badge shows (0)
  → Assert centered "No code results for 'xyznonexistent'."
  → Assert hint "Try a different query or check spelling."

SNAP-CODE-005: Code tab error state
  → Type query with code API returning 500, press 4
  → Assert Code tab badge shows (–)
  → Assert "Code search failed. Press R to retry." in error color
  → Assert status bar shows "R:retry  Tab:tab  q:back"

SNAP-CODE-006: Code tab rate limit state
  → Type query with code API returning 429 Retry-After:30, press 4
  → Assert "Rate limited. Retry in 30s." on Code tab

SNAP-CODE-007: Code result match highlighting
  → Type "handleRequest", wait for results, press 4
  → Assert "handleRequest" in snippet rendered in bold + primary color
  → Assert surrounding code in normal syntax-highlighted style

SNAP-CODE-008: Code result with long file path (left-truncated)
  → Query returning result with 80-char file path, press 4
  → Assert file path shows …/truncated/path.ts in primary color
  → Assert full repo context still visible

SNAP-CODE-009: Code result focused vs unfocused styling
  → Type query, press 4, assert first result has reverse video
  → Press j, assert first result loses reverse video, second gains it

SNAP-CODE-010: Code tab pagination loading indicator
  → Type query returning 60+ code results, press 4
  → Scroll to bottom
  → Assert "Loading more…" at bottom of results list

SNAP-CODE-011: Code snippet with empty snippet field
  → Query returning result with empty snippet, press 4
  → Assert header line shows repo + path
  → Assert below header: │ (no preview available) in muted color

SNAP-CODE-012: Code result with various file extensions
  → Query returning .ts, .py, .go results, press 4
  → Assert each snippet uses appropriate syntax highlighting

SNAP-CODE-013: Multiple code results visual layout
  → Type query returning 5+ results at 120x40, press 4
  → Assert results are visually separated (header + 2 snippet lines each)
  → Assert alternating result blocks are visually distinct

SNAP-CODE-014: Code tab loading state
  → Type query with slow code API response, press 4
  → Assert "Searching…" indicator in code results area

SNAP-CODE-015: Code tab header breadcrumb
  → Open search, press 4
  → Assert header bar shows "Search" breadcrumb
```

### Keyboard Interaction Tests

```
KEY-CODE-001: 4 switches to Code tab
  → Type query, get results → press 4 → Assert Code tab active with code results displayed

KEY-CODE-002: Tab cycles to Code tab
  → Type query → Tab Tab Tab → Assert Code tab active (4th tab)

KEY-CODE-003: Shift+Tab cycles backwards to Code tab
  → On Repositories tab → Shift+Tab → Assert Code tab active (wraps around)

KEY-CODE-004: j/k navigates between code results (full-result skip)
  → On Code tab with results → j → Assert second result focused (skips snippet lines)
  → k → Assert first result focused again

KEY-CODE-005: Enter on code result navigates to code explorer
  → On Code tab, first result focused → Enter
  → Assert code explorer screen pushed
  → Assert breadcrumb shows Search > owner/repo > path

KEY-CODE-006: q returns from code explorer to Code tab
  → Navigate to code explorer from Code tab → q
  → Assert search screen shown with Code tab active
  → Assert query preserved, same result focused

KEY-CODE-007: G jumps to last code result
  → On Code tab with 10+ results → G → Assert last loaded result focused

KEY-CODE-008: g g jumps to first code result
  → On Code tab, focused on item 5 → g g → Assert first result focused

KEY-CODE-009: Ctrl+D pages down
  → On Code tab with 20+ results → Ctrl+D → Assert cursor moved down by ~half visible results

KEY-CODE-010: Ctrl+U pages up
  → On Code tab, scrolled down → Ctrl+U → Assert cursor moved up by ~half visible results

KEY-CODE-011: / returns focus to search input from Code tab
  → On Code tab → / → Assert search input focused → Assert Code tab results preserved

KEY-CODE-012: R retries failed code search
  → Code API returns 500 → press 4 → R → Assert retry request dispatched

KEY-CODE-013: R is noop when no code error
  → Code results loaded → R → Assert no new request, results unchanged

KEY-CODE-014: q pops search screen from Code tab
  → On Code tab → q → Assert search screen popped

KEY-CODE-015: Esc pops search screen from Code tab
  → On Code tab → Esc → Assert search screen popped

KEY-CODE-016: Tab switch preserves Code tab scroll position
  → On Code tab, navigate to item 5 → Tab (to Repos) → Shift+Tab (back to Code)
  → Assert item 5 still focused

KEY-CODE-017: Code tab navigation wraps at boundaries
  → On Code tab, first result focused → k → Assert first result still focused (no wrap)
  → Navigate to last result → j → Assert last result still focused (no wrap)

KEY-CODE-018: Enter on code result preserves search state on return
  → Type "function", Code tab, navigate to item 3 → Enter → code explorer opens
  → q → Assert Code tab active, item 3 focused, query "function" in input

KEY-CODE-019: Rapid j/k through code results
  → Press j 10 times rapidly → Assert focused item incremented 10 times, no rendering artifacts

KEY-CODE-020: Code pagination on scroll-to-end
  → Type query returning 40+ code results → Scroll to 80% → Assert page 2 request dispatched
  → Assert new results appended with correct formatting
```

### Responsive Tests

```
RESIZE-CODE-001: 120x40 Code tab — standard snippet layout
  → Open Code tab at 120x40 with results
  → Assert 3-line results (1 header + 2 snippet lines)
  → Assert snippet gutter visible
  → Assert syntax highlighting active

RESIZE-CODE-002: 80x24 Code tab — no snippets
  → Open Code tab at 80x24 with results
  → Assert 1-line results (header only)
  → Assert no snippet content, no gutter

RESIZE-CODE-003: 200x60 Code tab — 4-line snippets
  → Open Code tab at 200x60 with results
  → Assert 5-line results (1 header + 4 snippet lines)
  → Assert wider snippet display area

RESIZE-CODE-004: Resize 120→80 hides snippets
  → Code tab at 120x40 showing 2-line snippets → Resize to 80x24
  → Assert snippets disappear, results collapse to 1-line
  → Assert focused result preserved

RESIZE-CODE-005: Resize 80→120 shows snippets
  → Code tab at 80x24 (no snippets) → Resize to 120x40
  → Assert 2-line snippets appear with gutter
  → Assert focused result preserved

RESIZE-CODE-006: Resize 120→200 expands snippets
  → Code tab at 120x40 showing 2-line snippets → Resize to 200x60
  → Assert snippets expand to 4 lines
  → Assert focused result preserved

RESIZE-CODE-007: Resize preserves Code tab focus across breakpoints
  → Focus item 4 at 120x40 → Resize to 80x24 → Assert item 4 still focused
  → Resize to 200x60 → Assert item 4 still focused

RESIZE-CODE-008: Resize during code search loading
  → Type query with slow code response → Resize 120→80
  → Assert "Searching…" still shown → Results arrive → Assert rendered at 80×24 layout

RESIZE-CODE-009: Rapid resize on Code tab
  → Code tab with results → Resize 120→80→200→100→160
  → Assert clean layout at final size, no rendering artifacts

RESIZE-CODE-010: Resize with Code tab in error state
  → Code tab showing error → Resize 120→80
  → Assert error message re-centered at new dimensions

RESIZE-CODE-011: File path truncation changes on resize
  → Code tab at 200x60 showing full paths → Resize to 80x24
  → Assert file paths truncated from left with …/ prefix at tighter max
```

### Integration Tests

```
INT-CODE-001: Full code search flow — type, browse snippets, open file, return
  → g s → type "handleRequest" → wait → press 4 (Code tab)
  → Verify code results with snippets → j j → Enter on 3rd result
  → Verify code explorer opens at correct file path
  → q → Verify Code tab restored, item 3 focused, query preserved

INT-CODE-002: Code search respects visibility — user sees only accessible repos
  → Authenticate as user with access to repos A and B but not C
  → Search term present in all three repos
  → Assert Code tab results include A and B, not C

INT-CODE-003: Code search pagination
  → Type query returning 60+ code results → Press 4
  → Scroll to 80% → Assert page 2 request with page=2&per_page=30
  → Assert new code results appended with correct snippet formatting

INT-CODE-004: Code pagination stops at 300 cap
  → Type query returning 500+ code results → Scroll through 10 pages
  → Assert no page 11 request dispatched → Assert 300 items loaded

INT-CODE-005: Partial API failure — code fails, others succeed
  → Type query → repos/issues/users succeed, code returns 500
  → Assert Repos/Issues/Users tabs show results
  → Assert Code tab shows "Code search failed. Press R to retry."
  → R → Assert code search retried

INT-CODE-006: Code search 401 auth error
  → Type query → code endpoint returns 401
  → Assert app-shell auth error screen shown

INT-CODE-007: Code search 429 rate limit
  → Type query → code endpoint returns 429, Retry-After: 15
  → Assert Code tab shows "Rate limited. Retry in 15s."
  → Other tabs show results normally

INT-CODE-008: Code result points to repo code explorer
  → Enter on code result with path "src/gateway/handler.ts" in repo "acme/api-gateway"
  → Assert code explorer pushes with repo="acme/api-gateway" and path="src/gateway/handler.ts"

INT-CODE-009: Code search with special characters
  → Type "func()" → wait → press 4
  → Assert query URL-encoded → Assert results render correctly

INT-CODE-010: Code search with Unicode query
  → Type "日本語" → wait → press 4
  → Assert results render without corruption

INT-CODE-011: Code tab debounce — only final query dispatched
  → Type "ha" → 100ms → "nd" → 100ms → "le" → wait 400ms
  → Assert single code search dispatch with query "handle"

INT-CODE-012: Code tab in-flight abort on query change
  → Type "old" (slow response 3s) → Type "new"
  → Assert "old" code results never rendered → Assert "new" code results rendered

INT-CODE-013: Code result snippet match highlighting end-to-end
  → Query "handleRequest" → press 4
  → Assert API response contains <em>handleRequest</em> in snippet
  → Assert TUI renders "handleRequest" in bold+primary within syntax context

INT-CODE-014: Code result with unrecognized file extension
  → Query returning result with path "config.xyz" → press 4
  → Assert snippet renders as plain monospace text (no syntax highlighting)

INT-CODE-015: Empty snippet field handling
  → Query returning result with empty snippet → press 4
  → Assert header line rendered → Assert "│ (no preview available)" in muted color

INT-CODE-016: Code tab state preserved across g-d and g-s round trip
  → g s → type "test" → press 4 → navigate to item 5
  → g d (dashboard) → g s (search) → Assert Code tab active, item 5 focused, query "test"

INT-CODE-017: Code tab concurrent with other tabs loading
  → Type query → All 4 endpoints respond at different times
  → Assert Code tab results appear when code endpoint responds, independent of other tabs

INT-CODE-018: Code result count badge formatting
  → Search returning total_count=15000 for code → Assert Code tab badge shows "15k+"

INT-CODE-019: Code search deep link
  → Launch `codeplane tui --screen search` → type "test" → press 4
  → Assert Code tab functions correctly from deep-linked search screen

INT-CODE-020: Code tab — multiple results from same repository
  → Search returning 5+ code results from same repo
  → Assert each result shows same repo context, distinct file paths, distinct snippets
```

### Edge Case Tests

```
EDGE-CODE-001: Code result with snippet containing only whitespace
  → Query returning result whose snippet is "   \n   \n" → press 4
  → Assert header line rendered → Assert empty snippet lines with gutter

EDGE-CODE-002: Code result with tab characters in snippet
  → Query returning snippet containing \t characters → press 4
  → Assert tabs rendered as 4 spaces within <code> component

EDGE-CODE-003: Code result with very long single line (500+ chars)
  → Query returning snippet with no newlines and 500 chars → press 4
  → Assert line truncated at terminal width minus gutter width
  → Assert no horizontal overflow or wrapping artifacts

EDGE-CODE-004: Code tab with exactly 30 results (page boundary)
  → Query returning exactly 30 code results → Scroll to end
  → Assert page 2 request dispatched → If 0 results returned, no "Loading more…"

EDGE-CODE-005: Code tab activated while debounce pending
  → Type "te" → immediately press 4 → 100ms later type "st"
  → Assert Code tab shows "Searching…" → Assert final results for "test" arrive

EDGE-CODE-006: Rapid Enter-then-q on code result
  → Focus code result → Enter → immediately q
  → Assert clean navigation back to Code tab with no stale state

EDGE-CODE-007: Code results with mixed <em> tag positions
  → Query matching at start, middle, and end of different snippets
  → Assert all match positions highlighted correctly

EDGE-CODE-008: Code snippet where <em> spans across word boundaries
  → Snippet: "the <em>api gateway</em> handler"
  → Assert "api gateway" rendered as single bold+primary segment

EDGE-CODE-009: Code tab 0 results while other tabs have many
  → Search "README" → Issues tab has 50 results, Code tab has 0
  → Press 4 → Assert empty state → Press 2 → Assert Issues results intact

EDGE-CODE-010: Terminal resize from large to minimum mid-scroll
  → Code tab at 200x60, scrolled to item 15 → Resize to 80x24
  → Assert item 15 still focused, scroll position adjusted for new item heights
```

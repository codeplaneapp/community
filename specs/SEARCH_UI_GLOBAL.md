# SEARCH_UI_GLOBAL

Specification for SEARCH_UI_GLOBAL.

## High-Level User POV

When you need to find something in Codeplane — a repository, an issue, a user, or a specific piece of code — you should be able to open a single search page and get answers immediately, regardless of which repository, organization, or user account contains what you're looking for.

From the web UI, you navigate to `/search` (or press `Cmd+K` / `Ctrl+K` to open the command palette) and start typing. Within milliseconds of pausing, results begin populating across four tabbed categories: Repositories, Issues, Users, and Code. Each tab shows a count badge so you can immediately see which category has the most relevant results. The search page auto-selects the tab with the highest-relevance results, or you can click any tab to explore a specific category.

Repository results show the owner, name, description, visibility, star count, and topic tags — enough context to identify the right project at a glance. Issue results show the repository context, issue number, title, and open/closed state, making cross-repository triage effortless. User results show usernames, display names, and avatars for quick people discovery. Code results show the repository, file path, and a syntax-highlighted snippet with your search terms emphasized, so you can find the exact line of code without opening files one by one.

You can refine results with inline filters: narrow issues by state (open or closed), label, or assignee; narrow repositories by visibility; narrow code results by file language. Filters apply instantly and combine with your query terms. You can paginate through large result sets by scrolling or clicking "Load more" — the page loads additional results progressively without losing your place.

Your search query is reflected in the URL (`/search?q=your+query&tab=issues`), so you can share search links with teammates, bookmark frequent searches, or navigate back to previous searches using browser history. Direct navigation to a search URL loads results immediately with the correct tab pre-selected.

Global search respects your access permissions at all times. You see every public repository and every private repository you have legitimate access to through ownership, organization membership, team assignment, or collaborator grants. You never see results from private repositories you shouldn't access. Anonymous visitors see only results from public repositories.

The value of global search is that it replaces browsing, URL guessing, and context switching with a single, fast, permission-aware discovery surface that works consistently whether you're triaging issues across an organization, finding a teammate's profile, searching for a code pattern across your entire fleet of repositories, or simply navigating to a project you haven't visited in a while.

## Acceptance Criteria

- **Route availability**: The global search page must be accessible at `/search` for both authenticated and unauthenticated users.
- **Command palette integration**: The command palette (`Cmd+K` / `Ctrl+K`) must support inline search with result navigation, independent of the full `/search` page.
- **Query input**:
  - The search input must be auto-focused on page load.
  - The query must be at least 1 character after trimming whitespace.
  - Queries up to and including 256 characters must be accepted.
  - Queries exceeding 256 characters must show a client-side validation error before sending any API request.
  - An empty or whitespace-only query must not trigger any API call; it must display a resting empty state.
  - The query input must support Unicode characters, punctuation, and special characters without error.
  - Input must be debounced at 300ms to avoid excessive API calls during typing.
- **Parallel search execution**: When the user submits a query (after debounce), the UI must fire all four search API calls (`/api/search/repositories`, `/api/search/issues`, `/api/search/users`, `/api/search/code`) in parallel.
- **Tab bar**:
  - Four tabs must be displayed: Repositories, Issues, Users, Code — in that order.
  - Each tab must show a count badge with the `total_count` from its respective API response.
  - The tab bar must update as each API response arrives (progressive loading).
  - Auto-selection: when a new query is entered, the first tab with results (in tab order) must be auto-selected, unless the user has explicitly selected a tab during this session.
  - Manual tab selection must persist across query changes within the same session.
  - Clicking a tab must switch the visible result set instantly without re-querying.
  - Keyboard navigation: `1`, `2`, `3`, `4` number keys must select the corresponding tab.
- **Repository results tab**:
  - Each row must display: owner/name as a clickable link to `/:owner/:repo`, description (single-line truncated with ellipsis), visibility badge (public/private), star count, and topic tags as clickable chips.
  - Clicking a repository result must navigate to `/:owner/:repo`.
  - Clicking a topic tag chip must navigate to a search filtered by that topic.
  - Empty state: "No repositories found for '{query}'."
- **Issues results tab**:
  - Each row must display: owner/repo (muted), `#number` (primary color), issue title, state badge (green dot for open, grey/red dot for closed), and relative timestamp.
  - Clicking an issue result must navigate to `/:owner/:repo/issues/:number`.
  - Inline state filter control must allow cycling between All / Open / Closed.
  - Changing the state filter must re-query the API with the `state` parameter and reset pagination to page 1.
  - Empty state: "No issues found for '{query}'. Try a different query or adjust your filters."
- **Users results tab**:
  - Each row must display: avatar image, username, and display name.
  - Clicking a user result must navigate to `/:username`.
  - No filters are available for the Users tab.
  - Empty state: "No users found for '{query}'."
- **Code results tab**:
  - Each row must display: owner/repo (muted), file path (linked), and a syntax-highlighted code snippet with `<em>` match markers rendered as bold + accent color.
  - Clicking a code result must navigate to the file view at `/:owner/:repo/blob/<default-branch>/:path`.
  - Empty state: "No code found for '{query}'."
- **Pagination**:
  - Default page size is 30 results per tab.
  - Pagination must be rendered as either infinite scroll (loading triggered at 80% scroll depth) or a "Load more" button.
  - Maximum 300 items per tab (10 pages × 30) may be loaded in a single session.
  - A "Loading more…" indicator must be visible during pagination fetches.
  - When all pages are loaded, the pagination control must disappear.
- **URL state**:
  - The search query must be reflected in the URL as `?q=<query>`.
  - The active tab must be reflected as `&tab=<repositories|issues|users|code>`.
  - Direct navigation to `/search?q=auth&tab=issues` must pre-fill the query, fire searches, and activate the Issues tab.
  - Changing the query or tab must update the URL without a full page reload (pushState).
  - Browser back/forward navigation must restore query and tab state.
- **Loading states**:
  - A loading skeleton or spinner must appear per-tab while the corresponding API call is in flight.
  - Loading must not block interaction with already-loaded tabs.
- **Error states**:
  - If an individual tab's API call fails, that tab must show an error message with a "Retry" button.
  - Other tabs must remain functional.
  - Network-level failures (offline, timeout) must show a global error banner with a retry affordance.
- **Rate limit handling**: When any search endpoint returns `429`, the UI must display a "Too many requests — please wait" message and disable further searches for the duration indicated by the `X-RateLimit-Reset` header.
- **Accessibility**:
  - The search input must have an appropriate `aria-label`.
  - Tab switching must work with keyboard focus.
  - Result items must be navigable with arrow keys and selectable with Enter.
  - Screen readers must announce tab count badges.
- **Responsive layout**:
  - The search page must be usable at viewport widths down to 375px (mobile).
  - On narrow viewports, result rows must stack vertically (description below name) and hide secondary metadata (stars, topics, timestamps).
  - Tab bar must scroll horizontally on narrow viewports if tabs overflow.

### Definition of Done

The feature is complete when:
- The `/search` page renders with all four tabs, debounced query input, progressive result loading, pagination, URL state management, and filter controls.
- The command palette integrates search with inline result preview and navigation.
- All four search API endpoints are consumed correctly, with proper error handling, loading states, and empty states.
- Visibility enforcement is verified end-to-end (private repo results hidden from unauthorized viewers).
- URL deep-linking and browser history navigation work correctly.
- The page is responsive from 375px to 2560px viewports.
- All Playwright E2E tests pass with near-100% confidence.

## Design

### Web UI Design

#### Page Layout

The `/search` page follows the standard app layout (sidebar, top bar) with a dedicated search content area:

```
┌────────────────────────────────────────────────────────┐
│  [🔍 Search Codeplane...                             ] │
├──────────┬──────────┬──────────┬──────────────────────┤
│ Repos(42)│Issues(15)│ Users(3) │ Code(127)            │
├──────────┴──────────┴──────────┴──────────────────────┤
│                                                        │
│  [Filter: All ▾ Open ▾ Closed]  (Issues tab only)     │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │  alice/jj-tools                    ★ 42  ◆     │   │
│  │  CLI utilities for jj workflows                │   │
│  │  ┌─────┐ ┌────┐ ┌──────┐                      │   │
│  │  │ jj  │ │cli │ │workflow│                      │   │
│  │  └─────┘ └────┘ └──────┘                      │   │
│  ├────────────────────────────────────────────────┤   │
│  │  bob/codeplane-sdk                 ★ 18  ◆     │   │
│  │  TypeScript SDK for Codeplane API              │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  [Load more...]                                        │
└────────────────────────────────────────────────────────┘
```

#### Search Input

- Full-width text input with a search icon (🔍) on the left.
- Placeholder: "Search repositories, issues, users, and code…"
- `aria-label="Global search"`.
- Auto-focused on page load and when navigating to the page via command palette.
- Debounce: 300ms after the user stops typing, all four API calls fire in parallel.
- Clear button (×) appears when the input has content; clicking it clears the query, resets all tabs, and restores the empty state.
- Maximum input length: 256 characters. Characters beyond 256 are rejected with a subtle validation message below the input: "Query must be 256 characters or fewer."

#### Tab Bar

- Horizontal tab bar immediately below the search input.
- Tab labels: "Repositories", "Issues", "Users", "Code".
- Each tab label shows a parenthetical count badge: e.g., "Issues (15)".
- Count badges update independently as each API response arrives.
- While a tab's API call is in flight, its badge shows a small spinner instead of a number.
- Active tab has a colored bottom border and bold label.
- Inactive tabs are clickable and show hover state.
- Keyboard: `1` selects Repositories, `2` selects Issues, `3` selects Users, `4` selects Code (only when search input is not focused).

#### Repository Results

Each repository result row contains:
- **Owner/name** (`owner/name` format) as a clickable link navigating to `/:owner/:repo`. Font weight: semibold.
- **Description**: Single line, truncated with ellipsis at container width. Color: muted/secondary.
- **Visibility badge**: Small icon or pill — "Public" (◆ or open lock icon) / "Private" (◇ or closed lock icon).
- **Star count**: Star icon + number.
- **Topic tags**: Horizontally scrollable list of chip/pill elements. Clicking a topic chip navigates to `/search?q=topic:<topic_name>&tab=repositories`.

#### Issue Results

Each issue result row contains:
- **Repository context**: `owner/repo` in muted text.
- **Issue number**: `#<number>` in primary/accent color.
- **Title**: Remaining horizontal space, truncated with ellipsis.
- **State badge**: Colored circle — green for open, grey for closed.
- **Relative timestamp**: "2h ago", "3d ago", etc.

**Inline filter bar** (visible only on the Issues tab):
- Positioned between the tab bar and the result list.
- State filter: segmented control or dropdown with options "All", "Open", "Closed". Default: "All".
- Changing the state filter immediately fires a new `GET /api/search/issues` call with the `state` parameter and resets the results + pagination for this tab.

#### User Results

Each user result row contains:
- **Avatar**: 32×32 px circular image, with fallback to initials.
- **Username**: Primary text, semibold.
- **Display name**: Secondary text, muted, in parentheses if present.

#### Code Results

Each code result row contains:
- **Repository context**: `owner/repo` in muted text.
- **File path**: Full path, colored in blue/link color. Clicking navigates to the file.
- **Code snippet**: 2–4 lines of syntax-highlighted code. Match terms are rendered with `<em>` tags displayed as bold + accent background highlight. The snippet block has a monospace font and a subtle background color to distinguish it from surrounding content.

#### Pagination

- Each tab manages its own pagination state independently.
- Initial load fetches page 1 (30 results).
- When the user scrolls past 80% of the current results list, the next page is automatically fetched.
- Alternatively, a "Load more" button is shown at the bottom of the list.
- A "Loading more…" indicator appears during pagination fetches.
- Maximum 300 items (10 pages) per tab per search session.
- When max is reached, display: "Showing first 300 results. Refine your query for more specific results."

#### Empty and Error States

- **No query entered (resting state)**: "Search across all repositories, issues, users, and code. Type a query to get started."
- **No results for a tab**: "[Entity type] not found for '{query}'. Try a different query."
- **API error for a tab**: "Failed to load [entity type] results. [Retry button]"
- **Rate limited**: "You're searching too fast. Please wait a moment before trying again." Disable the search input until `X-RateLimit-Reset` time passes.
- **Offline**: "You appear to be offline. Search requires a network connection."

#### URL State Management

- Query parameter: `?q=<url-encoded-query>`
- Tab parameter: `&tab=repositories|issues|users|code`
- Filter parameters: `&state=open|closed` (for issues tab)
- On page load, read `q`, `tab`, and `state` from URL. If `q` is present, auto-fire searches. If `tab` is present, activate that tab. If `state` is present, apply the issue filter.
- On query change: update `q` in URL via `pushState`.
- On tab change: update `tab` in URL via `replaceState`.
- On filter change: update `state` in URL via `replaceState`.

### Command Palette Integration

The command palette (`Cmd+K` / `Ctrl+K`) supports search as follows:
- Typing a query in the palette shows up to 5 repository results inline.
- Results display as `owner/repo — description`.
- Selecting a result navigates to `/:owner/:repo`.
- A "See all results" option at the bottom navigates to `/search?q=<query>`.
- The palette uses the same 300ms debounce and the `GET /api/search/repositories` endpoint.

### API Shape

The global search UI consumes the following four existing API endpoints. No new endpoints are required.

**`GET /api/search/repositories`**

| Parameter | Type | Required | Default | Constraints |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | — | 1–256 chars after trim |
| `limit` | integer | No | 30 | 1–100 |
| `cursor` | string | No | `""` | Opaque offset |
| `page` | integer | No | 1 | ≥ 1 (ignored if cursor) |
| `per_page` | integer | No | 30 | 1–100 (ignored if cursor) |

Response: `{ items: RepositorySearchResult[], total_count, page, per_page }` + `X-Total-Count` header.

**`GET /api/search/issues`**

All parameters from repositories, plus: `state` (string, optional), `label` (string, optional), `assignee` (string, optional), `milestone` (string, optional).

Response: `{ items: IssueSearchResult[], total_count, page, per_page }` + `X-Total-Count` header.

**`GET /api/search/users`**

Same pagination parameters as repositories.

Response: `{ items: UserSearchResult[], total_count, page, per_page }` + `X-Total-Count` header.

**`GET /api/search/code`**

Same pagination parameters as repositories.

Response: `{ items: CodeSearchResult[], total_count, page, per_page }` + `X-Total-Count` header.

**Error Responses (all endpoints)**:

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Non-numeric `limit` | `{ "message": "invalid limit value" }` |
| `422` | Empty or missing `q` | `{ "message": "query required" }` |
| `422` | Invalid `state` (issues only) | `{ "message": "invalid state filter" }` |
| `429` | Rate limit exceeded | Standard rate limit headers |
| `500` | Internal server error | `{ "message": "internal error" }` |

### Documentation

The following end-user documentation must be written:

- **Global Search Guide** (`docs/guides/search.mdx`): A comprehensive page explaining how to use global search from the web UI. Include sections for each tab, filter usage, URL sharing, keyboard shortcuts, and command palette integration. Provide screenshots of each tab and the command palette search.
- **FAQ entry**: "How do I search across all repositories?" — Brief answer pointing to the search guide.
- **Keyboard shortcut reference**: Include `/` to focus search (if applicable), `1-4` for tab selection, and `Cmd+K` for command palette.

## Permissions & Security

### Authorization Roles

| Role | Can access `/search`? | Result scope |
|------|----------------------|--------------|
| **Anonymous (unauthenticated)** | Yes | Public repositories, public repo issues, all users, code in public repos |
| **Authenticated user** | Yes | Public + private repos accessible via ownership, org membership, team membership, or collaborator grants |
| **Admin** | Yes | Same as authenticated user — admin role does not grant elevated search visibility |

Search visibility is enforced at the database layer via a `visible_repositories` CTE. The web UI does not perform any client-side visibility filtering; it trusts the API to return only authorized results.

### Rate Limiting

| Tier | Limit | Window |
|------|-------|--------|
| Authenticated | 30 requests per endpoint | per minute |
| Unauthenticated | 10 requests per endpoint | per minute |

Since the global search UI fires 4 API calls per query, a single search consumes 4 of the user's rate limit quota. With 300ms debounce and 30 requests/minute/endpoint, an authenticated user can perform approximately 7 full searches per minute before hitting rate limits.

Rate limit responses include:
- `X-RateLimit-Limit` — total requests allowed
- `X-RateLimit-Remaining` — requests remaining
- `X-RateLimit-Reset` — Unix timestamp when the limit resets

The UI must read these headers and proactively disable search input when remaining = 0.

### Data Privacy

- **No PII in search results**: Repository results expose only public metadata (name, description, topics). User results expose only public profile fields (username, display name, avatar URL). No email addresses, IP addresses, or private user data are included in any search response.
- **Private repository data isolation**: The visibility CTE ensures private repository names, issue titles, and code snippets are never returned to unauthorized viewers.
- **Query privacy**: Search queries are not stored in the browser's local storage or persisted client-side beyond the URL bar. The browser's address bar history is the only client-side trace.
- **SQL injection prevention**: All API endpoints use parameterized SQL via `plainto_tsquery`. No user input is interpolated into SQL strings.
- **XSS prevention**: Code snippet `<em>` tags from `ts_headline` must be rendered safely. The UI must either use a sanitized HTML renderer for snippets or replace `<em>` markers with styled spans via a controlled transformation, never via `innerHTML` with unsanitized content.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `GlobalSearchExecuted` | User enters a query and all 4 API calls complete | `query_length: number`, `repos_count: number`, `issues_count: number`, `users_count: number`, `code_count: number`, `total_results: number`, `is_authenticated: boolean`, `entry_point: "page" \| "command_palette" \| "direct_url"`, `latency_ms: number` (time from query submit to last API response) |
| `GlobalSearchTabSelected` | User clicks or keyboard-selects a tab | `tab: "repositories" \| "issues" \| "users" \| "code"`, `was_auto_selected: boolean`, `tab_result_count: number`, `query_length: number` |
| `GlobalSearchResultClicked` | User clicks a result in any tab | `tab: string`, `result_position: number` (1-indexed), `result_id: string`, `result_type: "repository" \| "issue" \| "user" \| "code"`, `query_length: number` |
| `GlobalSearchFilterApplied` | User changes a filter (issue state, etc.) | `filter_type: "state"`, `filter_value: string`, `tab: string`, `query_length: number` |
| `GlobalSearchPaginated` | User loads an additional page of results | `tab: string`, `page_number: number`, `new_total_loaded: number`, `query_length: number` |
| `GlobalSearchEmpty` | All 4 endpoints return 0 total results | `query_length: number`, `is_authenticated: boolean` |
| `GlobalSearchError` | Any search endpoint returns a non-2xx status | `tab: string`, `status_code: number`, `error_message: string` |
| `CommandPaletteSearchExecuted` | User types a query in the command palette | `query_length: number`, `result_count: number`, `latency_ms: number` |
| `CommandPaletteResultSelected` | User selects a result from command palette search | `result_position: number`, `result_type: string`, `query_length: number` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Search-to-click rate** | % of `GlobalSearchExecuted` events followed by at least one `GlobalSearchResultClicked` within the same session | > 40% |
| **Zero-result rate** | % of `GlobalSearchExecuted` where `total_results === 0` | < 20% |
| **Tab engagement distribution** | Breakdown of `GlobalSearchTabSelected` by tab | No single tab below 5% (indicates all tabs are useful) |
| **Filter usage rate** | % of issue searches where `GlobalSearchFilterApplied` is fired | > 10% |
| **Pagination depth** | Average max `page_number` from `GlobalSearchPaginated` per session | < 3 (users find results on first pages) |
| **Median end-to-end latency** | p50 of `latency_ms` in `GlobalSearchExecuted` | < 500ms |
| **p99 end-to-end latency** | p99 of `latency_ms` in `GlobalSearchExecuted` | < 3000ms |
| **Command palette search-to-select rate** | % of `CommandPaletteSearchExecuted` followed by `CommandPaletteResultSelected` | > 50% |
| **Repeat search rate** | % of sessions with >1 `GlobalSearchExecuted` where second query differs | < 20% |

## Observability

### Logging Requirements

All logs are structured JSON. Context fields are attached via the existing request ID and auth middleware.

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| Search page loaded | `INFO` | `entry_point` ("direct_url", "navigation", "command_palette"), `has_initial_query: boolean`, `initial_tab: string \| null`, `request_id` |
| Search query dispatched | `DEBUG` | `query_length`, `is_authenticated`, `session_id` |
| Search API response received (per-endpoint) | `DEBUG` | `endpoint: string`, `total_count: number`, `result_count: number`, `latency_ms: number`, `status_code: number` |
| Search query validation failed (client-side) | `WARN` | `reason: "too_long" \| "empty"`, `query_length: number` |
| Search API error (per-endpoint) | `ERROR` | `endpoint: string`, `status_code: number`, `error_body: string`, `query_length: number` |
| Rate limit hit | `WARN` | `endpoint: string`, `reset_timestamp: number`, `remaining: 0` |
| Pagination triggered | `DEBUG` | `tab: string`, `page_number: number`, `total_loaded: number` |

**Important**: The raw search query text must NOT be logged at any level to prevent accidental exposure of user intent data in client-side telemetry. Log `query_length` instead.

### Prometheus Metrics

Server-side metrics (emitted by the API endpoints the UI calls):

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_search_requests_total` | Counter | `endpoint` (`repositories`, `issues`, `users`, `code`), `status` (`success`, `error`, `validation_error`) | Total search requests across all endpoints |
| `codeplane_search_duration_seconds` | Histogram | `endpoint` | End-to-end request latency per endpoint. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5 |
| `codeplane_search_result_count` | Histogram | `endpoint` | Number of results returned per request. Buckets: 0, 1, 5, 10, 30, 50, 100 |
| `codeplane_search_total_count` | Histogram | `endpoint` | Total matching count per request. Buckets: 0, 1, 10, 50, 100, 500, 1000, 5000 |
| `codeplane_search_rate_limited_total` | Counter | `endpoint`, `auth_status` | Rate-limited requests |
| `codeplane_search_validation_errors_total` | Counter | `endpoint`, `error_type` (`empty_query`, `invalid_limit`, `invalid_state`) | Validation rejections |
| `codeplane_search_empty_results_total` | Counter | `endpoint` | Searches returning zero results |

Client-side metrics (reported via telemetry):

| Metric | Type | Description |
|--------|------|-------------|
| `search_ui_time_to_first_result_ms` | Histogram | Time from query submit to first tab showing results |
| `search_ui_time_to_all_results_ms` | Histogram | Time from query submit to all four tabs populated |
| `search_ui_debounce_skipped_queries` | Counter | Queries suppressed by debounce |

### Alerts

**Alert 1: Global Search Latency P99 > 3s (any endpoint)**
- **Condition**: `histogram_quantile(0.99, rate(codeplane_search_duration_seconds_bucket[5m])) > 3`
- **Severity**: Warning
- **Runbook**:
  1. Identify which endpoint(s) are slow by checking the `endpoint` label breakdown.
  2. Check PostgreSQL query performance: run `EXPLAIN ANALYZE` on the corresponding FTS query with a representative query string and viewer ID.
  3. Verify the `search_vector` GIN index exists on the relevant table: `\d <table>` and check for the index.
  4. Check for table bloat: `SELECT pg_size_pretty(pg_total_relation_size('<table>'))`.
  5. Check for lock contention: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND query ILIKE '%search%'`.
  6. If index is missing or degraded, run `REINDEX INDEX CONCURRENTLY <index_name>`.
  7. If table is bloated, schedule `VACUUM ANALYZE <table>`.
  8. If the visible_repositories CTE is the bottleneck, consider materializing repository visibility for heavy-search users.

**Alert 2: Search Error Rate > 5% (any endpoint)**
- **Condition**: `rate(codeplane_search_requests_total{status="error"}[5m]) / rate(codeplane_search_requests_total[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for `ERROR`-level entries: filter by the affected `endpoint`.
  2. Verify database connectivity: attempt `SELECT 1` from the app connection pool.
  3. Check PostgreSQL connection pool: `SELECT count(*) FROM pg_stat_activity`. If pool is exhausted, increase size or find leaking connections.
  4. Check for OOM conditions on the database host.
  5. If database is healthy, check recent deployments for query or service layer regressions.
  6. If transient, monitor for 10 minutes. If persistent, restart server and escalate.

**Alert 3: Rate Limit Spikes > 100/5min**
- **Condition**: `rate(codeplane_search_rate_limited_total[5m]) > 100`
- **Severity**: Warning
- **Runbook**:
  1. Check WARN-level rate limit logs to identify source IPs or user IDs.
  2. Determine if traffic is legitimate (busy CI pipeline, popular integration) or abusive (scraping, enumeration).
  3. If abusive: block IP at reverse proxy or escalate to admin for user suspension.
  4. If legitimate: advise the user to add client-side caching/backoff, or consider raising limits.
  5. Review whether the 300ms debounce is being bypassed by automated clients.

**Alert 4: Zero-Result Rate > 50% over 1 hour**
- **Condition**: `rate(codeplane_search_empty_results_total[1h]) / rate(codeplane_search_requests_total{status="success"}[1h]) > 0.5`
- **Severity**: Info (product health signal)
- **Runbook**:
  1. This is likely a product issue, not infrastructure. Review common query patterns.
  2. Check that `search_vector` columns are being populated on entity create/update: `SELECT count(*) FROM repositories WHERE search_vector IS NULL`.
  3. If vectors are not populated, check the trigger/function that maintains them.
  4. If vectors are fine, review whether users are searching for partial words or stems.
  5. Report findings to product team for potential UX improvements (autocomplete, spelling suggestions).

**Alert 5: Search Page Client Error Rate > 10%**
- **Condition**: Client-side telemetry shows `GlobalSearchError` events exceed 10% of `GlobalSearchExecuted` events in a 15-minute window.
- **Severity**: Warning
- **Runbook**:
  1. Check the `status_code` distribution in `GlobalSearchError` events: 429 (rate limiting), 5xx (server errors), or network errors.
  2. If 429: users are hitting rate limits — check Alert 3 runbook.
  3. If 5xx: check Alert 2 runbook.
  4. If network errors: check CDN, load balancer, and DNS health.
  5. If the error is isolated to a specific `endpoint`, investigate that search service independently.

### Error Cases and Failure Modes

| Error Case | Surface | Behavior |
|------------|---------|----------|
| Empty query string | Client | No API calls fired; resting empty state shown |
| Query exceeds 256 characters | Client | Client-side validation message; no API call |
| One of four API calls fails (e.g., 500) | Client | Failed tab shows error + retry; other 3 tabs remain functional |
| All four API calls fail | Client | Global error banner with retry button |
| Rate limit hit (429) | Client | "Too many requests" message; search input disabled until reset |
| Slow network (>5s) | Client | Loading spinners remain; no timeout — browser handles connection timeout |
| Browser offline | Client | Offline banner; search disabled |
| API returns malformed JSON | Client | Treat as error for that tab; show error state with retry |
| Very large result set (>5000 total_count) | Client | Display total count in badge; only load up to 300 items via pagination |
| Concurrent query changes (user types fast) | Client | Debounce ensures only the latest query fires; in-flight stale requests aborted via AbortController |

## Verification

### Web UI (Playwright) E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `search page loads and shows search input` | Navigate to `/search`. Verify the search input is visible, focused, and has the correct placeholder text. |
| 2 | `typing a query shows repository results` | Type a known repo name. Wait for debounce (400ms). Verify the Repositories tab shows a non-zero count badge and result rows appear. |
| 3 | `typing a query shows issue results` | Type a known issue term. Verify the Issues tab shows a non-zero count badge. Click the Issues tab. Verify issue rows display with repo context, number, title, and state badge. |
| 4 | `typing a query shows user results` | Type a known username. Click the Users tab. Verify user rows display with avatar, username, and display name. |
| 5 | `typing a query shows code results` | Type a known code term. Click the Code tab. Verify code rows display with repo context, file path, and syntax-highlighted snippet. |
| 6 | `all four API calls fire in parallel` | Intercept network requests. Type a query. Verify all four `/api/search/*` calls are initiated within 100ms of each other. |
| 7 | `debounce prevents excessive API calls` | Type 5 characters rapidly (within 200ms). Verify only 1 set of API calls fires (after 300ms debounce), not 5 sets. |
| 8 | `clicking a repository result navigates to repo page` | Type a query. Click a repo result. Verify URL changes to `/:owner/:repo`. |
| 9 | `clicking an issue result navigates to issue detail` | Type a query. Click the Issues tab. Click an issue result. Verify URL changes to `/:owner/:repo/issues/:number`. |
| 10 | `clicking a user result navigates to user profile` | Type a query. Click the Users tab. Click a user result. Verify URL changes to `/:username`. |
| 11 | `clicking a code result navigates to file view` | Type a query. Click the Code tab. Click a code result. Verify URL changes to the file path within the repository. |
| 12 | `empty query shows resting empty state` | Navigate to `/search` without a query. Verify the resting empty state message is shown. Verify no API calls were fired. |
| 13 | `no results for a tab shows tab-specific empty state` | Type a random UUID string. Verify all tabs show 0 count and their respective empty state messages. |
| 14 | `tab count badges update progressively` | Intercept APIs with artificial delays (repos: 100ms, issues: 500ms). Type a query. Verify repos badge updates first, then issues badge updates later. |
| 15 | `tab auto-selection picks first tab with results` | Configure test data so only Issues tab has results (no repos, no users, no code). Type the query. Verify Issues tab is auto-selected. |
| 16 | `manual tab selection persists across query changes` | Type query 1. Click the Code tab. Clear input and type query 2. Verify the Code tab remains selected. |
| 17 | `number keys select tabs` | Type a query. Blur the search input. Press `2`. Verify Issues tab is active. Press `4`. Verify Code tab is active. |
| 18 | `issues tab state filter cycles All/Open/Closed` | Type a query matching both open and closed issues. Click Issues tab. Verify "All" is the default filter. Click "Open" filter. Verify only open issues are shown. Click "Closed". Verify only closed issues are shown. |
| 19 | `issues state filter re-queries the API` | Intercept the issues search API. Change the state filter. Verify a new API call is made with `state=open` parameter. |
| 20 | `pagination loads more results on scroll` | Create 50+ repos matching a unique term. Type that term. Verify initially 30 results load. Scroll to bottom. Verify additional results load and total exceeds 30. |
| 21 | `pagination loads more results via Load More button` | Same setup as above. If Load More button is used instead of infinite scroll, click it. Verify additional results appear. |
| 22 | `pagination caps at 300 items` | Create 350+ matching repos. Type the query. Paginate through all pages. Verify at most 300 items are loaded and a "Showing first 300 results" message appears. |
| 23 | `URL reflects query parameter` | Type "auth-test". Verify URL contains `?q=auth-test`. |
| 24 | `URL reflects active tab` | Click the Issues tab. Verify URL contains `&tab=issues`. |
| 25 | `direct URL navigation pre-fills query and tab` | Navigate directly to `/search?q=auth&tab=issues`. Verify input contains "auth", Issues tab is active, and results are loaded. |
| 26 | `browser back/forward restores search state` | Type query 1. Type query 2. Press browser back. Verify query 1 is restored with its results. |
| 27 | `URL reflects issue state filter` | Click Issues tab. Apply "Open" filter. Verify URL contains `&state=open`. |
| 28 | `clear button resets everything` | Type a query. Click the clear (×) button. Verify input is empty, results are cleared, and resting empty state shows. |
| 29 | `error state shows retry button for failed tab` | Intercept one API call to return 500. Type a query. Verify the failed tab shows an error message with a Retry button. Click Retry. Verify the API is re-called. |
| 30 | `other tabs remain functional when one fails` | Intercept repos API to return 500. Type a query. Verify Issues, Users, and Code tabs still show results normally. |
| 31 | `rate limit shows appropriate message` | Intercept an API call to return 429 with rate limit headers. Type a query. Verify the rate limit message is displayed. |
| 32 | `private repo results hidden from anonymous users` | Create a public and private repo with the same unique search term. Log out. Search for the term. Verify only the public repo appears. Log in. Search again. Verify both repos appear. |
| 33 | `private repo issues hidden from unauthorized users` | Create an issue in a private repo. Search as a non-member. Verify the issue does not appear. Search as the repo owner. Verify the issue appears. |
| 34 | `code snippets render match highlights` | Type a query that matches code. Click the Code tab. Verify match terms are visually highlighted (bold or accent color) within the snippet. |
| 35 | `topic tag chips are clickable` | Type a query. In repo results, click a topic tag chip. Verify it navigates to a search for that topic. |
| 36 | `responsive layout at mobile width (375px)` | Set viewport to 375px width. Navigate to `/search`. Type a query. Verify results are usable: rows stack vertically, no horizontal overflow, tabs are accessible. |
| 37 | `responsive layout at desktop width (1440px)` | Set viewport to 1440px. Verify full metadata is visible: descriptions, stars, topics, timestamps. |
| 38 | `query at maximum length (256 chars) works` | Type a 256-character query. Verify API calls fire and results display (likely empty, but no error). |
| 39 | `query exceeding 256 chars shows validation error` | Type a 257-character query. Verify a client-side validation message appears and no API calls are fired. |
| 40 | `special characters in query do not break UI` | Type `it's a "test" -- ; DROP TABLE` in the search input. Verify the UI renders results (possibly empty) without breaking. |
| 41 | `unicode characters in query work` | Type a Unicode query (e.g., `认证`). Verify the search executes without error. |
| 42 | `command palette search shows repository suggestions` | Open command palette (`Cmd+K`). Type a known repo name. Verify repository suggestions appear inline. |
| 43 | `command palette result selection navigates` | Open command palette. Type a query. Select a result. Verify navigation to `/:owner/:repo`. |
| 44 | `command palette "See all results" navigates to /search` | Open command palette. Type a query. Click "See all results". Verify navigation to `/search?q=<query>`. |
| 45 | `loading skeletons appear while API calls are in flight` | Intercept API calls with 2s delay. Type a query. Verify loading indicators appear in each tab. |
| 46 | `stale request cancellation on rapid query change` | Type "foo", wait 200ms, then type "bar" (replacing). Verify only "bar" results are displayed, not "foo" results. |
| 47 | `search input aria-label is set` | Verify the input element has `aria-label="Global search"`. |
| 48 | `tab count badges are announced to screen readers` | Verify count badges have `aria-live="polite"` or equivalent for screen reader announcement. |
| 49 | `keyboard navigation through results with arrow keys` | Type a query. Press down arrow. Verify focus moves to the first result. Press Enter. Verify navigation occurs. |
| 50 | `search page is accessible via /search route` | Navigate to `/search`. Verify the page renders without error (200 status, no JS exceptions). |

### API Integration Tests (validating UI contract)

| # | Test Name | Description |
|---|-----------|-------------|
| 51 | `all four search endpoints respond to valid queries` | Send valid queries to all 4 endpoints. Verify all return 200 with the expected response shape (`items`, `total_count`, `page`, `per_page`). |
| 52 | `X-Total-Count header present on all endpoints` | For each endpoint, verify the `X-Total-Count` header matches `body.total_count`. |
| 53 | `pagination consistency across pages` | Fetch page 1 and page 2 from repos search. Verify no overlapping item IDs. |
| 54 | `parallel requests return consistent results` | Fire 5 simultaneous identical repo searches. Verify all return the same `total_count`. |
| 55 | `rate limit headers are returned on all endpoints` | Make requests. Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers are present. |
| 56 | `empty query returns 422 on all endpoints` | Send `q=` to all 4 endpoints. Verify each returns 422 with "query required". |
| 57 | `maximum length query (256 chars) succeeds` | Send a 256-character query to repos endpoint. Verify 200 response. |
| 58 | `query exceeding 256 chars returns 422` | Send a 257-character query to repos endpoint. Verify 422 response. |
| 59 | `non-numeric limit returns 400` | Send `limit=abc` to repos endpoint. Verify 400 with "invalid limit value". |
| 60 | `limit=100 (maximum) works` | Send `limit=100` to repos endpoint. Verify no error and at most 100 items returned. |
| 61 | `limit=101 is silently capped to 100` | Send `limit=101`. Verify response `per_page` is 100. |
| 62 | `issue search with state=open returns only open issues` | Search issues with `state=open`. Verify all returned items have `state: "open"`. |
| 63 | `issue search with invalid state returns 422` | Search issues with `state=pending`. Verify 422 with "invalid state filter". |
| 64 | `visibility enforcement: anonymous sees only public repos` | Create public + private repo. Search without auth. Verify only public repo appears. |
| 65 | `visibility enforcement: owner sees private repos` | Search as repo owner. Verify private repo appears. |
| 66 | `special characters in query are handled safely` | Search with `q='; DROP TABLE repos; --`. Verify 200, no error, no data loss. |
| 67 | `unicode query is processed without error` | Search with `q=認証バグ`. Verify 200 response. |

### Cross-Client Consistency Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 68 | `web UI and CLI return same repo results for identical query` | Perform a repo search via the API (as the web UI would) and via `codeplane search repos --json`. Compare `items` arrays. Verify identical results and ordering. |
| 69 | `web UI and CLI return same issue results with state filter` | Search issues with `state=open` via both API and CLI. Verify identical filtered results. |

# SEARCH_CODE

Specification for SEARCH_CODE.

## High-Level User POV

Code search lets you find lines of code across every repository you have access to on Codeplane—without cloning anything first. You type a query into the global search bar on the web, the CLI, the TUI, or your editor, and Codeplane instantly returns matching file fragments ranked by relevance, each showing the repository it lives in, the file path, and a highlighted snippet of the surrounding code.

The experience is designed for the moment when you know *what* the code says but not *where* it lives. You might remember a function name, an error message, or a configuration key. Code search finds every occurrence across all repositories you can see—your own, your organization's, your team's, and any public repository on the instance—and presents results in a single, unified list. Match terms are highlighted directly inside the snippet so you can scan results at a glance.

Code search respects the same visibility rules as the rest of Codeplane. You will never see results from repositories you do not have read access to. Public repositories are searchable by everyone, including unauthenticated visitors. Private repositories only appear when you are the owner, an organization member, a team member with repository access, or an explicit collaborator.

From any result, you can jump directly to the file in the repository's code explorer. The search query, your current page, and your scroll position are preserved when you navigate back, so you can efficiently scan through a long list of matches. Pagination loads additional results automatically as you scroll or on explicit page requests, up to a practical ceiling that keeps the experience fast and predictable.

Code search works from every Codeplane surface: the global search page in the web UI (as the "Code" tab alongside Repositories, Issues, and Users), the `codeplane search code` CLI command, the TUI search screen's fourth tab, and search commands in the VS Code extension and Neovim plugin. The query syntax is plain-language—you type words and Codeplane finds files that contain those words, with results ordered by how strongly they match.

## Acceptance Criteria

### Definition of Done

- A user can search for code across all repositories they have access to and receive relevance-ranked results containing repository context, file path, and highlighted snippet.
- The feature is functional from all five product surfaces: Web UI, CLI, TUI, VS Code extension, and Neovim plugin.
- Access control is enforced server-side: no result from a repository the viewer cannot read ever appears.
- The feature is covered by end-to-end tests across API, CLI, and UI layers.

### Functional Constraints

- [ ] The search query parameter `q` is required and must be non-empty after trimming whitespace.
- [ ] An empty or whitespace-only query must return HTTP 422 with a clear error message (`"query required"`).
- [ ] Query strings must be trimmed of leading/trailing whitespace before processing.
- [ ] The maximum query length is 256 characters. Queries exceeding this limit must return HTTP 422 with an error message (`"query too long"`).
- [ ] Query strings containing only stop words or punctuation that produce an empty tsquery must return an empty result set (not an error).
- [ ] Special characters (quotes, backslashes, angle brackets, SQL metacharacters) in the query must not cause errors or injection; `plainto_tsquery` handles sanitization.
- [ ] Results must be ordered by relevance rank descending, then repository ID descending, then file path ascending (deterministic tie-breaking).
- [ ] Each result item must include: `repository_id`, `repository_owner`, `repository_name`, `path` (file path), and `snippet` (HTML-escaped with `<em>` tags around matching terms).
- [ ] Snippet generation must produce at most 1 fragment, with a maximum of 20 words and a minimum of 5 context words surrounding the match.
- [ ] The `<em>` tags in snippets must be the only unescaped HTML; all other content must be HTML-entity-escaped.
- [ ] The response envelope must include `items` (array), `total_count` (integer), `page` (integer), and `per_page` (integer).
- [ ] The `X-Total-Count` response header must be set to the total number of matching documents.

### Pagination Constraints

- [ ] Default page size is 30 results.
- [ ] Maximum page size is 100. Values above 100 must be clamped to 100 silently.
- [ ] Minimum page size is 1. Values below 1 must default to 30.
- [ ] Page numbers below 1 must be normalized to 1.
- [ ] A `limit` value of 0 or negative must return HTTP 400 (`"invalid limit value"`).
- [ ] A non-numeric `limit` value must return HTTP 400.
- [ ] Both cursor-based (`cursor`/`limit`) and legacy (`page`/`per_page`) pagination must be supported.
- [ ] When both `cursor` and `page` are provided, `cursor` takes precedence.
- [ ] Requesting a page beyond the total result count must return an empty `items` array (not an error).

### Visibility Constraints

- [ ] Unauthenticated users (viewer ID "0") can only see results from public repositories.
- [ ] Authenticated users see results from: public repositories, repositories they own, repositories in organizations where they are an owner, repositories accessible through team membership, and repositories where they are an explicit collaborator.
- [ ] Visibility filtering must be enforced at the database query level, not in application code post-fetch.
- [ ] A repository that transitions from public to private must immediately stop appearing in code search results for unauthorized viewers.
- [ ] Deleting a repository must delete all its code search documents (no orphaned index entries).

### Edge Cases

- [ ] Searching for a term that matches thousands of files must not time out within normal pagination bounds (≤100 results per page).
- [ ] A repository with zero indexed files must produce zero code search results (no errors).
- [ ] Files with empty content must not appear in search results (empty tsvector).
- [ ] Unicode content (CJK characters, emoji, diacritics) in file content must be searchable using the `simple` text search configuration.
- [ ] File paths containing spaces, dots, slashes, and special characters must be returned verbatim and unmodified.
- [ ] Duplicate file paths within a repository (impossible due to unique constraint on `repository_id, file_path`) must be rejected at index time via upsert behavior.
- [ ] Binary files should not be indexed. If binary content is accidentally indexed, search must still function without error.

## Design

### API Shape

**Endpoint:** `GET /api/search/code`

**Query Parameters:**

| Parameter | Type | Required | Default | Constraints | Description |
|-----------|------|----------|---------|-------------|-------------|
| `q` | string | Yes | — | 1–256 chars after trim | The search query |
| `cursor` | string | No | `""` | Numeric string (offset) | Cursor for cursor-based pagination |
| `limit` | integer | No | 30 | 1–100 | Results per page (cursor mode) |
| `page` | integer | No | 1 | ≥ 1 | Page number (legacy mode) |
| `per_page` | integer | No | 30 | 1–100 | Results per page (legacy mode) |

**Success Response:** `200 OK`

```json
{
  "items": [
    {
      "repository_id": "42",
      "repository_owner": "acme",
      "repository_name": "api-server",
      "path": "src/handlers/auth.ts",
      "snippet": "function <em>validateToken</em>(token: string): boolean { ... }"
    }
  ],
  "total_count": 137,
  "page": 1,
  "per_page": 30
}
```

**Response Headers:**

| Header | Value |
|--------|-------|
| `X-Total-Count` | Total matching documents (string) |
| `Content-Type` | `application/json` |

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid `limit` value (non-numeric, zero, negative) | `{ "error": "invalid limit value" }` |
| 422 | Empty or missing `q` parameter | `{ "error": "query required" }` |
| 422 | Query exceeds 256 characters | `{ "error": "query too long" }` |
| 429 | Rate limit exceeded | `{ "error": "rate limit exceeded" }` |
| 500 | Internal server error | `{ "error": "internal error" }` |

### SDK Shape

**Service:** `SearchService`

**Method:** `searchCode(viewer: AuthUser | undefined, input: SearchCodeInput): Promise<CodeSearchResultPage>`

**Input type:**
```
SearchCodeInput {
  query: string       // Required, 1–256 chars
  page: number        // Default 1, min 1
  perPage: number     // Default 30, max 100
}
```

**Output type:**
```
CodeSearchResultPage {
  items: CodeSearchResult[]
  total_count: number
  page: number
  per_page: number
}

CodeSearchResult {
  repository_id: string
  repository_owner: string
  repository_name: string
  path: string            // Full file path within the repository
  snippet: string         // HTML-escaped with <em> match highlighting
}
```

**Indexing methods:**
- `upsertCodeSearchDocument(repositoryId, filePath, content)` — Indexes or updates a single file.
- `deleteCodeSearchDocumentsByRepo(repositoryId)` — Removes all indexed documents for a repository (called on repository deletion).

### CLI Command

**Command:** `codeplane search code <query> [options]`

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `query` | string | Yes | The search query (positional) |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--page` | number | 1 | Page number |
| `--limit` | number | 30 | Results per page |

**Output (default):** JSON response from the API, rendered with the CLI's standard output formatter. Each result displays `repository_owner/repository_name`, `path`, and `snippet`.

**Output (--json):** Raw JSON API response.

**Examples:**
```bash
codeplane search code "validateToken"
codeplane search code "handleRequest" --page 2 --limit 10
codeplane search code "TODO" --json | jq '.items[].path'
```

**Error behavior:** API errors (422, 400, 429, 500) displayed as structured error output.

### Web UI Design

Code search is the fourth tab ("Code") in the Global Search view, displayed alongside Repositories, Issues, and Users.

**Search Input:**
- Single shared text input at the top of the search page.
- 300ms debounce before dispatching the query to all four search endpoints in parallel.
- Minimum 1 character required before dispatch.
- The input retains focus after tab switching.

**Tab Bar:**
- Tab label: "Code" with a count badge showing `total_count` from the most recent code search response.
- Badge updates asynchronously when the code search API returns.
- Active tab is visually distinguished (bold, underline, primary accent color).

**Result List:** Each code search result is rendered as a card or row containing:
1. **Repository context**: `owner/repo` displayed as a clickable link navigating to the repository overview.
2. **File path**: Full `path` value displayed as a clickable link navigating to the file in the code explorer. Long paths are truncated from the left with an ellipsis prefix (e.g., `…/deeply/nested/file.ts`).
3. **Code snippet**: The `snippet` field rendered with `<em>` tags converted to highlighted spans (bold text with a highlight background color). All other HTML entities remain escaped. Displayed in a monospace font.

**Pagination:**
- Infinite scroll: Additional pages load when the user scrolls past 80% of the current result list.
- A "Loading more…" spinner appears at the bottom during fetch.
- Maximum 300 results (10 pages × 30 items) to prevent runaway scrolling.
- After 300 results: "Showing first 300 results. Refine your query to narrow results."

**Empty State:**
- No query entered: "Search for code across all repositories you have access to."
- Query entered, no results: "No code matches found for '{query}'."

**Error State:**
- API failure: "Code search failed. Please try again." with a retry button.
- Rate limited: "Too many requests. Please wait a moment."

**Navigation:**
- Clicking a file path navigates to `/:owner/:repo/code/:path` with the search query preserved as a URL parameter.
- Browser back returns to the search page with query, tab, and scroll position intact.

### TUI UI

The TUI code search is the fourth tab (key `4`) in the global search screen.

**Result Rendering (per result):**

| Terminal Size | Header Line | Snippet Lines |
|---------------|-------------|---------------|
| 80×24 (min)   | `owner/repo  path/to/file.ts` | None |
| 120×40 (std)  | `owner/repo  path/to/file.ts` | 2 lines |
| 200×60+ (lg)  | `owner/repo  path/to/file.ts` | 4 lines |

- Repository context: muted/dim color.
- File path: primary color (ANSI 33). Truncated from left with `…/` prefix at 40 chars (min), 60 chars (std).
- Snippet: monospace, with `<em>` content rendered as bold + primary color. Vertical gutter (`│`) on the left.

**Keyboard Navigation:**

| Key | Action |
|-----|--------|
| `4` | Switch to Code tab |
| `j` / `↓` | Next result |
| `k` / `↑` | Previous result |
| `Enter` | Open code explorer at matched file |
| `G` | Jump to last result |
| `gg` | Jump to first result |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |
| `/` | Return focus to search input |
| `R` | Retry failed search |
| `q` / `Esc` | Exit search screen |

**Pagination:** Triggered at 80% scroll depth. Max 300 results (10 pages × 30). "Loading more…" indicator during fetch.

**Error States:** API error: "Code search failed. Press R to retry." Rate limited: "Rate limited. Retry in {N}s."

### VS Code Extension

**Command:** `Codeplane: Search Code`

- Opens a Quick Pick input prompting for a search query.
- Displays results as Quick Pick items: `owner/repo — path/to/file.ts` with snippet as description.
- Selecting a result opens the file in the editor (if the repository is locally cloned) or opens the file in the Codeplane web UI via external browser.
- Results are loaded in batches; "Load More…" item at the bottom fetches the next page.

### Neovim Plugin

**Command:** `:CodeplaneSearchCode <query>`

- Opens a Telescope picker with code search results.
- Preview pane shows the snippet with match highlighting.
- `<CR>` on a result opens the file in the editor (local clone) or opens the Codeplane web URL.
- Supports live-updating results as the user types in the Telescope prompt.

### Documentation

The following end-user documentation should be provided:

1. **Search Guide** — A product guide explaining how global search works across repositories, issues, users, and code. Must cover: query syntax (plain words), how relevance ranking works, how visibility filtering applies, and pagination behavior.
2. **CLI Reference: `search code`** — Man-page-style reference for the `codeplane search code` command, including all arguments, options, example invocations, and output format.
3. **API Reference: `GET /api/search/code`** — Endpoint documentation covering parameters, response schema, error codes, pagination modes, and rate limits.
4. **Code Search Indexing** — Admin-facing documentation explaining how code documents are indexed, when re-indexing occurs, and how to trigger a re-index for a specific repository.

## Permissions & Security

### Authorization Matrix

| Role | Can Search Code | Sees Results From |
|------|----------------|-------------------|
| **Anonymous (unauthenticated)** | Yes | Public repositories only |
| **Authenticated user** | Yes | Public repos + own repos + org repos (if org owner) + team-accessible repos + collaborator repos |
| **Organization Owner** | Yes | All repos in their organizations + all above |
| **Team Member** | Yes | Team-assigned repos + all above |
| **Collaborator** | Yes | Explicitly collaborated repos + all above |
| **Admin** | Yes | All repositories on the instance |

### Visibility Enforcement

- Visibility is enforced at the SQL query level via a `visible_repositories` CTE. The application layer never receives rows the viewer cannot see.
- The viewer ID is extracted from the authenticated session (cookie or PAT). Unauthenticated requests use viewer ID `"0"`, which restricts the CTE to public repositories only.
- There is no client-side visibility filtering. The server is the single source of truth.

### Rate Limiting

| Scope | Limit | Window | Response |
|-------|-------|--------|----------|
| Authenticated user | 300 requests | 1 minute | HTTP 429 with `Retry-After` header |
| Unauthenticated IP | 60 requests | 1 minute | HTTP 429 with `Retry-After` header |
| Per-query cost | 1 request = 1 unit | — | — |

### Input Sanitization

- Query strings are passed through PostgreSQL's `plainto_tsquery('simple', ...)`, which strips all operator syntax and prevents injection.
- File path and snippet values in responses are derived from database-stored content and returned as JSON strings (no raw HTML rendering on the server).
- The `<em>` tags in snippets are generated by PostgreSQL's `ts_headline()` function from trusted server-side data, not from user input.

### Data Privacy

- Code search results can expose file contents (via snippets) from repositories the viewer has access to. This is by design and consistent with the read-access model.
- Search queries themselves may contain sensitive terms. Query strings must not be logged at INFO level. They may be logged at DEBUG level with explicit opt-in.
- Code search documents store the full file content in the `content` column. This data is subject to the same backup, encryption-at-rest, and access-control policies as the repository data itself.
- PII in code (e.g., hardcoded emails, API keys) may surface in search results. This is an inherent property of code search and is the repository owner's responsibility to manage via `.gitignore` or secret scanning.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `code_search.query_submitted` | User submits a code search query | `query_length`, `surface` (web/cli/tui/vscode/nvim), `viewer_id`, `is_authenticated` |
| `code_search.results_returned` | API returns search results | `query_length`, `total_count`, `page`, `per_page`, `result_count` (items in this page), `latency_ms`, `viewer_id` |
| `code_search.result_clicked` | User clicks/selects a search result | `repository_owner`, `repository_name`, `file_path`, `result_position` (1-indexed rank in list), `surface` |
| `code_search.empty_results` | Query returns zero results | `query_length`, `surface`, `viewer_id` |
| `code_search.pagination_triggered` | User loads next page | `page`, `surface`, `viewer_id` |
| `code_search.error_displayed` | An error state is shown to the user | `error_type` (422/400/429/500), `surface` |
| `code_search.retry_triggered` | User retries after an error | `error_type`, `surface` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Search completion rate** | % of `query_submitted` events that produce ≥ 1 result | ≥ 70% |
| **Click-through rate** | % of `results_returned` (with ≥ 1 result) followed by a `result_clicked` | ≥ 40% |
| **Pagination depth** | Average max page reached per search session | ≤ 2 (indicates queries are specific enough) |
| **Error rate** | % of `query_submitted` events that end in `error_displayed` | ≤ 1% |
| **Repeat search rate** | % of users who search code ≥ 2 times per session | ≥ 30% (indicates feature stickiness) |
| **Cross-surface adoption** | % of active users who use code search from ≥ 2 surfaces in a week | Tracked, no threshold yet |

### Success Indicators

- **Feature adoption**: Steady week-over-week growth in unique users performing code searches.
- **Query specificity**: Average query length of 8–25 characters (short enough to be fast, long enough to be specific).
- **Latency satisfaction**: P95 latency ≤ 500ms for the first page of results.
- **Index freshness**: Time between code push and searchability ≤ 60 seconds.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Search request received | DEBUG | `viewer_id`, `query_length`, `page`, `per_page`, `request_id` | Entry point for every code search request. Query text logged only at TRACE. |
| Search results returned | INFO | `viewer_id`, `total_count`, `result_count`, `latency_ms`, `request_id` | Successful response with performance data. |
| Empty query rejected | WARN | `viewer_id`, `request_id` | Caller sent empty/whitespace query. |
| Query too long rejected | WARN | `viewer_id`, `query_length`, `request_id` | Query exceeded 256 character limit. |
| Invalid pagination rejected | WARN | `viewer_id`, `raw_limit`, `raw_page`, `request_id` | Malformed pagination parameters. |
| Database query error | ERROR | `viewer_id`, `error_message`, `query_length`, `request_id` | FTS query or count query failed. |
| Database query slow | WARN | `viewer_id`, `latency_ms`, `query_length`, `request_id` | FTS query took > 1000ms. |
| Rate limit triggered | WARN | `viewer_id`, `client_ip`, `request_id` | Request rejected due to rate limiting. |
| Index document upserted | DEBUG | `repository_id`, `file_path`, `content_length` | A code search document was indexed or updated. |
| Index documents deleted | INFO | `repository_id`, `deleted_count` | All documents for a repository were purged. |

### Prometheus Metrics

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_search_code_requests_total` | `status` (200/400/422/429/500) | Total code search requests by response status |
| `codeplane_search_code_results_total` | — | Total individual code search results returned |
| `codeplane_search_code_empty_results_total` | — | Searches that returned zero results |
| `codeplane_search_code_index_upserts_total` | — | Code documents indexed or updated |
| `codeplane_search_code_index_deletes_total` | — | Code documents deleted (repo-level bulk delete) |

**Histograms:**

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_search_code_latency_seconds` | `phase` (total/db_search/db_count) | 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 | Latency distribution for code search operations |
| `codeplane_search_code_query_length` | — | 1, 5, 10, 25, 50, 100, 256 | Distribution of query string lengths |
| `codeplane_search_code_result_count` | — | 0, 1, 5, 10, 30, 50, 100 | Distribution of result counts per request |

**Gauges:**

| Metric | Description |
|--------|-------------|
| `codeplane_search_code_index_documents_total` | Total number of indexed code search documents (updated periodically) |
| `codeplane_search_code_index_repositories_total` | Number of repositories with at least one indexed document |

### Alerts

#### Alert: CodeSearchHighErrorRate
**Condition:** `rate(codeplane_search_code_requests_total{status="500"}[5m]) / rate(codeplane_search_code_requests_total[5m]) > 0.05`
**Severity:** Critical
**Runbook:**
1. Check `codeplane_search_code_latency_seconds` for anomalous latency spikes — if the database is overloaded, queries may be timing out.
2. Inspect server logs for `ERROR` entries with `request_id` to find the specific PostgreSQL error.
3. Check PostgreSQL connection pool health (`pg_stat_activity`). If connections are exhausted, the search query cannot execute.
4. Verify the `code_search_documents` table and GIN index are healthy: `SELECT pg_size_pretty(pg_relation_size('code_search_documents_search_vector_idx'))`. If the index is bloated, run `REINDEX CONCURRENTLY`.
5. If errors are related to a specific query pattern, check if the `plainto_tsquery` output is valid.
6. Escalate to database on-call if the issue is a PostgreSQL-level failure.

#### Alert: CodeSearchHighLatency
**Condition:** `histogram_quantile(0.95, rate(codeplane_search_code_latency_seconds_bucket{phase="total"}[5m])) > 1.0`
**Severity:** Warning
**Runbook:**
1. Compare `phase="db_search"` and `phase="db_count"` latency to identify which database query is slow.
2. Check PostgreSQL `pg_stat_user_tables` for sequential scans on `code_search_documents` — if the GIN index is not being used, run `ANALYZE code_search_documents`.
3. Check `pg_stat_activity` for long-running queries or lock contention.
4. If the index is large (> 10GB), evaluate whether `VACUUM` or `REINDEX CONCURRENTLY` is needed.
5. Check if a recent bulk indexing operation (new large repo push) is competing with search queries.
6. If latency is consistently high, evaluate adding a `max_execution_time` statement timeout.

#### Alert: CodeSearchRateLimitSpike
**Condition:** `rate(codeplane_search_code_requests_total{status="429"}[5m]) > 10`
**Severity:** Warning
**Runbook:**
1. Identify the source of the high request rate by checking server access logs for the top IP addresses or user IDs.
2. Determine if this is a legitimate user (e.g., a script or CI integration) or abuse.
3. If legitimate, consider temporarily raising the rate limit or suggest pagination.
4. If abusive, consider adding the IP to a block list.
5. Check if the client-side debounce (300ms) is functioning correctly.

#### Alert: CodeSearchIndexStale
**Condition:** `time() - codeplane_search_code_last_index_update_timestamp > 3600`
**Severity:** Warning
**Runbook:**
1. Check if the code indexing background job is running.
2. Verify the indexing trigger (post-push hook or background scanner) is healthy.
3. Check the event queue or webhook delivery logs for push events.
4. If the indexer process has crashed, restart it and verify it picks up from the last known cursor.
5. Manually trigger a re-index for recently pushed repositories.

#### Alert: CodeSearchEmptyResultRateHigh
**Condition:** `rate(codeplane_search_code_empty_results_total[1h]) / rate(codeplane_search_code_requests_total{status="200"}[1h]) > 0.6`
**Severity:** Info
**Runbook:**
1. Check `codeplane_search_code_index_repositories_total` against total repository count. If < 50% indexed, the pipeline may be lagging.
2. Sample recent queries from DEBUG logs to understand search patterns.
3. If this is a new deployment, the index may still be building. Monitor over 24 hours.

### Error Cases and Failure Modes

| Failure Mode | Symptom | Impact | Mitigation |
|--------------|---------|--------|------------|
| PostgreSQL connection pool exhausted | 500 errors, high latency | All search endpoints fail | Connection pool monitoring, auto-scaling, circuit breaker |
| GIN index corruption | 500 errors or wrong results | Code search returns errors or incomplete results | `REINDEX CONCURRENTLY`, periodic index health checks |
| Indexing pipeline stalled | Stale results | New code pushes not searchable | Indexer health monitoring, dead-letter queue |
| Extremely long query string | Query planner overhead | Slower query execution | 256 char limit enforced at service layer |
| Massive repository indexed | GIN index bloat | Degraded P95 latency | File size limits on indexing (skip files > 1MB), periodic VACUUM |
| Concurrent bulk deletes + searches | Lock contention | Elevated latency | DELETE batching, advisory locks |
| Network partition to database | All 500s | Complete search outage | Health check, failover to read replica |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `returns 422 when query is empty string` | `GET /api/search/code?q=` → 422, body contains `"query required"` |
| 2 | `returns 422 when query is whitespace only` | `GET /api/search/code?q=%20%20%20` → 422 |
| 3 | `returns 422 when q parameter is missing` | `GET /api/search/code` → 422 |
| 4 | `returns 422 when query exceeds 256 characters` | `GET /api/search/code?q=<257 chars>` → 422, body contains `"query too long"` |
| 5 | `accepts query of exactly 256 characters` | `GET /api/search/code?q=<256 chars>` → 200 (may return empty results, but no validation error) |
| 6 | `returns 400 for non-numeric limit` | `GET /api/search/code?q=test&limit=abc` → 400, body contains `"invalid limit value"` |
| 7 | `returns 400 for limit=0` | `GET /api/search/code?q=test&limit=0` → 400 |
| 8 | `returns 400 for negative limit` | `GET /api/search/code?q=test&limit=-5` → 400 |
| 9 | `clamps limit above 100 to 100` | `GET /api/search/code?q=test&limit=200` → 200, response `per_page` ≤ 100 |
| 10 | `normalizes page below 1 to page 1` | `GET /api/search/code?q=test&page=0` → 200, response `page` = 1 |
| 11 | `returns results matching indexed content` | Setup: index file with content "uniqueSearchToken123". Search for "uniqueSearchToken123". Verify ≥ 1 result with correct `path` and `repository_name`. |
| 12 | `results contain highlighted snippet` | Search for indexed term. Verify `snippet` field contains `<em>` tags wrapping the matched term. |
| 13 | `results include correct repository context` | Verify each result has `repository_id`, `repository_owner`, `repository_name`, and `path` fields populated. |
| 14 | `response includes total_count and pagination` | Verify response has `total_count` (integer ≥ 0), `page` (integer ≥ 1), `per_page` (integer 1–100). |
| 15 | `X-Total-Count header is set` | Verify the `X-Total-Count` response header matches `total_count` in the body. |
| 16 | `pagination returns correct page of results` | Index 35 files. Request page 1 with limit 30 → 30 results. Request page 2 → 5 results. |
| 17 | `cursor-based pagination works` | Request with `cursor=0&limit=10` → first 10 results. Then `cursor=10&limit=10` → next 10 results. No overlap. |
| 18 | `page parameter works with per_page` | `page=2&per_page=5` → offset 5, limit 5. Verify results are different from page 1. |
| 19 | `cursor takes precedence over page` | Request with `cursor=20&page=1&limit=10` → offset 20, not offset 0. |
| 20 | `page beyond results returns empty items` | Index 5 files. Request `page=100` → 200, `items: []`, `total_count: 5`. |
| 21 | `results are ordered by relevance` | Index files where one strongly matches and one weakly matches. Verify strongly matching file appears first. |
| 22 | `deterministic ordering with same rank` | Index multiple files with identical matching strength. Verify stable ordering across repeated requests. |
| 23 | `authenticated user sees own private repo results` | User creates private repo, indexes file. User searches → result appears. |
| 24 | `authenticated user does not see others' private repos` | User A creates private repo, indexes file. User B searches → no result from that repo. |
| 25 | `unauthenticated user sees public repo results` | Create public repo, index file. Unauthenticated search → result appears. |
| 26 | `unauthenticated user does not see private repo results` | Create private repo, index file. Unauthenticated search → no result. |
| 27 | `org member sees org repo results` | Org owner creates repo, indexes file. Org member searches → result appears. |
| 28 | `team member sees team-assigned repo results` | Team is assigned a repo. Team member searches for indexed content → result appears. |
| 29 | `collaborator sees collaborated repo results` | User is added as collaborator to repo. User searches for indexed content → result appears. |
| 30 | `non-collaborator does not see private repo results` | User without any access to a private repo searches → no results from that repo. |
| 31 | `deleting repo removes its search results` | Index files, delete repo, search → no results from deleted repo. |
| 32 | `special characters in query do not cause errors` | Queries: `"func("`, `"a && b"`, `"<script>"`, `"O'Brien"`, `"path\\to"` → all return 200 (may be empty). |
| 33 | `unicode query works` | Index file with content "日本語テスト". Search "日本語" → result returned. |
| 34 | `file paths with special characters are returned correctly` | Index file at path `src/utils/my file (2).ts`. Search for content → path returned verbatim. |
| 35 | `empty result set for no-match query` | Search for a term that matches nothing → 200, `items: []`, `total_count: 0`. |
| 36 | `snippet is HTML-safe except for em tags` | Index file containing `<script>alert("xss")</script>`. Search → snippet has `&lt;script&gt;` (escaped), only `<em>` tags are unescaped. |
| 37 | `concurrent searches return correct results` | Fire 10 simultaneous search requests with different queries. Each returns results relevant to its query (no cross-contamination). |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 38 | `codeplane search code <query> returns results` | Setup: create repo, push file with unique content, wait for indexing. `codeplane search code "<unique_term>"` → JSON with ≥ 1 result. |
| 39 | `codeplane search code with --page and --limit` | `codeplane search code "<term>" --page 1 --limit 5` → ≤ 5 results. |
| 40 | `codeplane search code with empty query fails` | `codeplane search code ""` → non-zero exit code or error output. |
| 41 | `codeplane search code with no results returns empty items` | `codeplane search code "nonexistent_term_xyz_${Date.now()}"` → `items: []`. |
| 42 | `codeplane search code JSON output matches API schema` | Verify output contains `items` (array), `total_count` (number), `page` (number), `per_page` (number). Each item has `repository_id`, `repository_owner`, `repository_name`, `path`, `snippet`. |
| 43 | `codeplane search code across multiple repos` | Create 3 repos with a shared unique term in different files. Search → results from all 3 repos. |
| 44 | `codeplane search code only shows accessible repos` | User A creates private repo with unique content. User B runs search → does not see User A's repo in results. |

### Web UI E2E Tests (Playwright)

| # | Test Name | Description |
|---|-----------|-------------|
| 45 | `global search page loads with Code tab` | Navigate to `/search`. Verify four tabs visible: Repositories, Issues, Users, Code. |
| 46 | `typing query dispatches search and shows Code results` | Type a known indexed term into search input. Wait for results. Click "Code" tab. Verify ≥ 1 result row displayed. |
| 47 | `code result shows repo context, file path, and snippet` | Each visible code result has: owner/repo text, file path text, and snippet with highlighted term. |
| 48 | `clicking file path navigates to code explorer` | Click a file path in a code result. Verify URL navigates to `/:owner/:repo/code/...`. |
| 49 | `code tab count badge updates` | Type query, wait for results. Verify Code tab shows a numeric count badge matching the displayed total. |
| 50 | `empty query shows placeholder text` | Clear search input. Verify placeholder message is shown (no results list, no error). |
| 51 | `no results shows empty state message` | Search for a term with zero matches. Verify empty state message: "No code matches found for '...'".. |
| 52 | `pagination loads more results on scroll` | Ensure > 30 indexed matches exist. Type query, verify initial 30 results, scroll to bottom, verify more results load. |
| 53 | `search preserves state on back navigation` | Search, click a result, press browser back. Verify query text, Code tab, and scroll position are preserved. |
| 54 | `snippet highlights match terms` | Verify that `<em>` content in the snippet is rendered with visual highlighting (bold, background color). |
| 55 | `error state shows retry button` | Mock API to return 500. Type query. Verify error message and retry button. Click retry. Verify request re-fires. |

### TUI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 56 | `search screen opens with g s from dashboard` | Press `g s`. Verify search screen renders with input and 4 tabs. |
| 57 | `typing query shows Code tab results` | Type a known term, press `4` for Code tab. Verify ≥ 1 result rendered. |
| 58 | `code result shows repo context and file path` | Verify each result row contains owner/repo and file path text. |
| 59 | `j/k navigation moves between code results` | Press `j` to move to next result, `k` to move back. Verify focus indicator moves. |
| 60 | `Enter on code result navigates to code explorer` | Focus a result, press Enter. Verify navigation to code explorer screen. |
| 61 | `responsive layout: 80x24 shows no snippets` | Resize terminal to 80×24. Search. Verify only header lines (no snippet text). |
| 62 | `responsive layout: 120x40 shows 2-line snippets` | Resize terminal to 120×40. Search. Verify 2 lines of snippet per result. |
| 63 | `pagination loads at 80% scroll depth` | Ensure > 30 results. Navigate down to 80% of list. Verify additional results load. |
| 64 | `R key retries failed search` | Mock API error. Search. Press `R`. Verify retry request fires. |
| 65 | `tab switching preserves code tab scroll position` | Scroll to result #15 in Code tab. Switch to Repos tab. Switch back. Verify focus at result #15. |

### Cross-Surface Consistency Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 66 | `API, CLI, and web return same total_count for same query` | Index known content. Query via API, CLI, and web. Verify `total_count` is identical. |
| 67 | `API and CLI return same result items for same query and page` | Compare `items` arrays (by `repository_id` + `path`) from API and CLI. They must match exactly. |
| 68 | `visibility is consistent across API and CLI` | User creates private repo. Verify same visibility from both API and CLI with same credentials. |

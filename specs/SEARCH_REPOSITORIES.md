# SEARCH_REPOSITORIES

Specification for SEARCH_REPOSITORIES.

## High-Level User POV

When you need to find a repository across Codeplane, you should be able to type a few keywords and instantly discover matching repositories — whether they live under your account, your team's organization, or the public namespace. Repository search is the primary discovery mechanism for locating projects by name, description, or topic.

From the web UI, you open the global search page or command palette, type your query, and see a live-updating list of repositories ranked by relevance. Each result shows the owner, repository name, description, visibility status, star count, and topics, giving you enough context to identify the right project without clicking through. You can paginate through large result sets and click any result to navigate directly into that repository.

From the CLI, you run `codeplane search repos "your query"` and receive a formatted table of matching repositories. You can control how many results come back, request JSON output for scripting, and pipe results into downstream automation. The same search powers the TUI's Repositories tab in the global search screen, the VS Code extension's search picker, and the Neovim plugin's Telescope integration.

Repository search respects your access permissions. You see all public repositories plus every private repository you have access to through direct ownership, organization membership, team assignment, or collaborator grants. You never see private repositories you are not authorized to access. Anonymous users see only public repositories.

The value of repository search is immediate: it replaces manual browsing, URL guessing, and bookmark maintenance with a fast, permission-aware, relevance-ranked discovery surface available from every Codeplane client.

## Acceptance Criteria

- **Query is required**: A search request with an empty or whitespace-only `q` parameter must return a `422 Unprocessable Entity` error with the message `"query required"`.
- **Minimum query length**: The query string, after trimming whitespace, must be at least 1 character long.
- **Maximum query length**: The query string must not exceed 256 characters. Queries longer than 256 characters must return a `422` error.
- **Query encoding**: The query must be URL-encoded by clients. The server must correctly handle URL-decoded query values including spaces, punctuation, and Unicode characters.
- **Full-text search semantics**: The search uses PostgreSQL `plainto_tsquery` with the `simple` text search configuration. Multiple words in the query function as AND conditions — all terms must be present in the indexed fields.
- **Indexed fields**: Repository search matches against the `search_vector` column, which indexes the repository name, description, and topics.
- **Result shape**: Each result item must contain: `id`, `owner`, `name`, `full_name` (formatted as `owner/name`), `description`, `is_public`, and `topics`.
- **Relevance ranking**: Results must be ordered by `ts_rank` descending, then by repository `id` descending as a tiebreaker.
- **Pagination defaults**: Default page size is 30 results.
- **Pagination maximum**: Maximum page size is 100. Any `limit` or `per_page` value above 100 must be silently capped to 100.
- **Pagination minimum**: A `limit` or `per_page` value of 0 or negative must be normalized to 30.
- **Invalid limit**: A non-numeric `limit` value must return a `400 Bad Request` with `"invalid limit value"`.
- **Total count header**: The response must include an `X-Total-Count` header containing the total number of matching repositories across all pages.
- **Empty results**: When no repositories match the query, the response must return `{ items: [], total_count: 0, page: <n>, per_page: <n> }` with a `200 OK` status.
- **Visibility enforcement**: The result set must include only repositories the viewer is authorized to see:
  - All public repositories.
  - Repositories owned by the authenticated user.
  - Repositories owned by organizations where the authenticated user is an owner.
  - Repositories assigned to teams where the authenticated user is a member.
  - Repositories where the authenticated user is a collaborator.
- **Anonymous access**: Unauthenticated requests must return results scoped to public repositories only.
- **Dual pagination modes**: The API must support both cursor/limit pagination and legacy page/per_page pagination. When both `cursor` and `page` are provided, `cursor` takes precedence.
- **Special characters in queries**: Queries containing SQL-unsafe characters (single quotes, semicolons, backslashes) must be handled safely via parameterized queries. No SQL injection is possible.
- **Unicode support**: Queries containing non-ASCII characters (accented letters, CJK characters, emoji) must be processed without error and match against repository names/descriptions containing those characters.
- **Case insensitivity**: Search must be case-insensitive for the `simple` text search configuration.

### Definition of Done

- The `GET /api/search/repositories` endpoint returns correct, permission-scoped, relevance-ranked results for all valid queries.
- The CLI `codeplane search repos` command works end-to-end with table and JSON output.
- The TUI global search screen's Repositories tab displays results correctly.
- The web UI global search page displays repository results.
- The VS Code extension and Neovim plugin search commands can invoke repository search.
- The `SearchService.searchRepositories()` SDK method is correctly exported and tested.
- All E2E tests pass with near-100% confidence that the feature works as specified.
- User-facing documentation in `docs/guides/search.mdx` accurately describes the feature.

## Design

### API Shape

**Endpoint**: `GET /api/search/repositories`

**Query Parameters**:

| Parameter | Type | Required | Default | Constraints | Description |
|-----------|------|----------|---------|-------------|-------------|
| `q` | string | Yes | — | 1–256 chars after trim | Full-text search query |
| `limit` | integer | No | 30 | 1–100 | Results per page |
| `cursor` | string | No | `""` | Opaque offset string | Pagination cursor |
| `page` | integer | No | 1 | ≥ 1 | Legacy page number (ignored if `cursor` present) |
| `per_page` | integer | No | 30 | 1–100 | Legacy page size (ignored if `cursor` present) |

**Success Response** (`200 OK`):

```json
{
  "items": [
    {
      "id": "123",
      "owner": "alice",
      "name": "jj-tools",
      "full_name": "alice/jj-tools",
      "description": "CLI utilities for jj workflows",
      "is_public": true,
      "topics": ["jj", "cli", "workflow"]
    }
  ],
  "total_count": 42,
  "page": 1,
  "per_page": 30
}
```

**Response Headers**:

| Header | Value | Description |
|--------|-------|-------------|
| `X-Total-Count` | `"42"` | Total matching repositories across all pages |

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Non-numeric `limit` | `{ "message": "invalid limit value" }` |
| `422` | Empty or missing `q` | `{ "message": "query required" }` |
| `429` | Rate limit exceeded | Standard rate limit headers |
| `500` | Internal server error | `{ "message": "internal error" }` |

### SDK Shape

The `SearchService` class in `@codeplane/sdk` exposes:

```typescript
class SearchService {
  async searchRepositories(
    viewer: AuthUser | undefined,
    input: SearchRepositoriesInput
  ): Promise<RepositorySearchResultPage>;
}

interface SearchRepositoriesInput {
  query: string;   // Raw search query
  page: number;    // Page number (≥1)
  perPage: number; // Results per page (1–100)
}

interface RepositorySearchResult {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  description: string;
  is_public: boolean;
  topics: string[];
}

interface RepositorySearchResultPage {
  items: RepositorySearchResult[];
  total_count: number;
  page: number;
  per_page: number;
}
```

### CLI Command

**Command**: `codeplane search repos <query> [options]`

**Arguments**:

| Argument | Required | Description |
|----------|----------|-------------|
| `query` | Yes | The search query string |

**Options**:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--page` | number | 1 | Page number |
| `--limit` | number | 30 | Results per page |
| `--json` | boolean | false | Output raw JSON |
| `--toon` | boolean | false | Output TOON format |

**Table output columns**: `NAME`, `DESCRIPTION`, `STARS`, `UPDATED`

**JSON output**: Raw API response body.

**Exit codes**:
- `0`: Successful search (even if zero results)
- `1`: Error (network, auth, validation)

### Web UI Design

The web UI exposes repository search through the **global search page** (`/search`):

- A text input at the top of the page accepts the search query.
- Results appear in a tabbed layout with tabs for Repositories, Issues, Users, and Code.
- The Repositories tab is the default or auto-selected tab when repository results are present.
- Each repository result row shows:
  - **Owner/name** as a clickable link navigating to `/:owner/:repo`
  - **Description** (truncated to a single line with ellipsis)
  - **Visibility badge**: public or private indicator
  - **Star count**
  - **Topic tags** rendered as clickable chips
- A debounce of 300ms on the input avoids excessive API calls during typing.
- The total result count is displayed near the tab header (e.g., "Repositories (42)").
- Pagination is rendered as infinite scroll or a "Load more" button, fetching the next page when the user reaches the bottom.
- An empty state message ("No repositories found for 'your query'") is shown when the result set is empty.
- An error state is shown if the API call fails, with a retry affordance.

The **command palette** (`Cmd+K` / `Ctrl+K`) also supports typing a query to see repository results inline, allowing quick navigation without leaving the current page.

### TUI UI

The TUI global search screen includes a **Repositories tab** (tab index 1, accessible via the `1` key):

- Results are displayed in a list with columns: full name (`owner/name`), description, visibility badge (◆ public / ◇ private), star count.
- Responsive column widths adapt to terminal size:
  - **80×24 (minimum)**: full name (20 chars), description (40 chars, truncated), visibility icon.
  - **120×40 (standard)**: full name (30 chars), description (60 chars), stars, visibility icon.
  - **200×60+ (large)**: full name (40 chars), description (100 chars), stars, topics.
- Keyboard navigation: `j`/`k` for up/down, `G`/`gg` for jump to bottom/top, `Ctrl+D`/`Ctrl+U` for page down/up.
- `Enter` on a result opens the repository detail screen.
- Pagination loads 30 items per page, capped at 300 total loaded items.
- The tab header badge shows the total count from the API response.

### VS Code Extension

The VS Code extension provides a `codeplane.search` command that:

- Opens a QuickPick input.
- Debounces keystrokes and queries `GET /api/search/repositories`.
- Displays results as `owner/repo — description`.
- On selection, opens the repository dashboard webview or navigates to the repository URL.

### Neovim Plugin

The Neovim plugin exposes `:CodeplaneSearch` which:

- Opens a Telescope picker.
- Queries the repository search endpoint with the typed input.
- Displays results in the Telescope results pane.
- On selection, opens the repository in the browser or switches the daemon context.

### Documentation

The `docs/guides/search.mdx` file must include a **Search Repositories** section covering:

- CLI usage with examples (`codeplane search repos "query"`)
- API endpoint reference with parameters and response shape
- Pagination instructions (cursor-based and legacy page/per_page)
- JSON and TOON output modes
- Rate limiting details (30 req/min authenticated, 10 req/min unauthenticated)
- Search tips: multi-word AND semantics, exact phrase matching with double quotes
- Visibility explanation: what repositories are returned for authenticated vs. anonymous users

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Anonymous (unauthenticated)** | Can search. Results scoped to public repositories only. |
| **Authenticated user** | Can search. Results include public repositories plus all private repositories the user can access through ownership, org membership, team membership, or collaborator grants. |
| **Admin** | Same as authenticated user. Admin role does not grant elevated search visibility (admins see what their user identity permits, not all repos on the instance). |

### Rate Limiting

| Tier | Limit | Window |
|------|-------|--------|
| Authenticated search | 30 requests | per minute |
| Unauthenticated search | 10 requests | per minute |

Rate limit responses return `429 Too Many Requests` with headers:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` (Unix timestamp)

### Data Privacy

- **No PII in search results**: Repository search results expose only public repository metadata (name, description, topics, visibility, star count). No email addresses, IP addresses, or private user data are included.
- **Private repository names are not leaked**: The visibility CTE ensures that private repository names, descriptions, and topics are never returned to unauthorized viewers.
- **Query content is logged at the INFO level** for operational diagnostics but must not be logged at a level that enables mass query harvesting. Query logs must not be exposed to other users.
- **SQL injection prevention**: All search queries use parameterized SQL via `plainto_tsquery`. No user input is interpolated into SQL strings.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `SearchRepositoriesExecuted` | A repository search request completes successfully | `query_length: number`, `result_count: number`, `total_count: number`, `page: number`, `per_page: number`, `is_authenticated: boolean`, `client: "web" \| "cli" \| "tui" \| "api" \| "vscode" \| "nvim"`, `latency_ms: number` |
| `SearchRepositoriesResultClicked` | A user clicks/selects a repository from search results | `query: string`, `result_position: number`, `repository_id: string`, `repository_full_name: string`, `client: string` |
| `SearchRepositoriesEmpty` | A search returns zero results | `query_length: number`, `is_authenticated: boolean`, `client: string` |
| `SearchRepositoriesError` | A search request fails | `error_type: string`, `status_code: number`, `client: string` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Search-to-click rate** | % of searches that result in at least one result click | > 40% |
| **Zero-result rate** | % of searches that return 0 items | < 25% |
| **Median result latency** | p50 response time for repository search | < 200ms |
| **p99 result latency** | p99 response time for repository search | < 2000ms |
| **Repeat search rate** | % of users who search again within 60s (indicates unsatisfactory results) | < 15% |

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| Search request received | `INFO` | `query_length`, `page`, `per_page`, `viewer_id` (or `"anonymous"`), `request_id` |
| Search completed successfully | `INFO` | `query_length`, `total_count`, `result_count`, `latency_ms`, `request_id` |
| Search validation failed (empty query) | `WARN` | `reason: "empty_query"`, `request_id` |
| Search validation failed (invalid limit) | `WARN` | `reason: "invalid_limit"`, `raw_limit`, `request_id` |
| Search database query failed | `ERROR` | `error_message`, `query_length`, `viewer_id`, `request_id` |
| Rate limit exceeded | `WARN` | `viewer_id`, `client_ip`, `request_id` |

**Important**: The raw search query text must NOT be logged at `DEBUG` or `TRACE` levels in production to prevent accidental exposure of user intent data. Log `query_length` instead.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_search_repositories_total` | Counter | `status` (`success`, `error`, `validation_error`) | Total repository search requests |
| `codeplane_search_repositories_duration_seconds` | Histogram | — | Repository search latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5) |
| `codeplane_search_repositories_result_count` | Histogram | — | Number of results returned per search (buckets: 0, 1, 5, 10, 30, 50, 100) |
| `codeplane_search_repositories_total_count` | Histogram | — | Total matching count per search (buckets: 0, 1, 10, 50, 100, 500, 1000, 5000) |
| `codeplane_search_repositories_rate_limited_total` | Counter | `auth_status` (`authenticated`, `anonymous`) | Rate-limited search requests |

### Alerts

**Alert: Search Repository Latency P99 > 3s**

- **Condition**: `histogram_quantile(0.99, rate(codeplane_search_repositories_duration_seconds_bucket[5m])) > 3`
- **Severity**: Warning
- **Runbook**:
  1. Check PostgreSQL query performance: run `EXPLAIN ANALYZE` on the `SearchRepositoriesFTS` query with a representative query string.
  2. Verify the `search_vector` GIN index exists on the `repositories` table: `\d repositories` and check for the index.
  3. Check for table bloat: `SELECT pg_size_pretty(pg_total_relation_size('repositories'))`.
  4. Check for lock contention: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND query ILIKE '%search%'`.
  5. If index is missing or degraded, run `REINDEX INDEX CONCURRENTLY <index_name>`.
  6. If the table is bloated, schedule a `VACUUM ANALYZE repositories`.

**Alert: Search Repository Error Rate > 5%**

- **Condition**: `rate(codeplane_search_repositories_total{status="error"}[5m]) / rate(codeplane_search_repositories_total[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for `ERROR`-level entries with `search` context: `grep '"level":"error"' | grep 'search'`.
  2. Verify database connectivity: attempt a simple `SELECT 1` from the app connection pool.
  3. Check if PostgreSQL is out of connections: `SELECT count(*) FROM pg_stat_activity`.
  4. Check for OOM conditions on the database host.
  5. If the database is healthy, check for recent deployments that may have broken the query or service layer.
  6. If the error is a query syntax issue, check if `plainto_tsquery` is receiving malformed input by inspecting the logged `query_length` and correlating with error traces.

**Alert: Search Repository Rate Limit Spikes**

- **Condition**: `rate(codeplane_search_repositories_rate_limited_total[5m]) > 50`
- **Severity**: Warning
- **Runbook**:
  1. Identify the source IPs or user IDs triggering rate limits from the `WARN`-level rate limit log entries.
  2. Determine if the traffic is legitimate (a busy CI pipeline, a popular integration) or abusive (scraping, enumeration).
  3. If abusive: consider blocking the IP at the reverse proxy layer or escalating to admin for user suspension.
  4. If legitimate: consider raising the per-user rate limit for that specific use case or advising the user to add caching/backoff.

**Alert: Search Zero-Result Rate > 50%**

- **Condition**: `rate(codeplane_search_repositories_total_count_bucket{le="0"}[1h]) / rate(codeplane_search_repositories_total[1h]) > 0.50`
- **Severity**: Info
- **Runbook**:
  1. This is a product health signal, not necessarily an infrastructure issue.
  2. Review recent search queries (by length distribution) to understand if users are searching for content that does not exist.
  3. Check that the `search_vector` column is being populated on repository create/update. Run `SELECT count(*) FROM repositories WHERE search_vector IS NULL`.
  4. If vectors are not being populated, check the trigger/function that maintains `search_vector`.
  5. Report findings to the product team for potential search UX improvements (autocomplete, suggestions, spelling correction).

### Error Cases and Failure Modes

| Error Case | Status | Behavior |
|------------|--------|----------|
| Empty query string | 422 | Return `"query required"` |
| Query exceeds 256 characters | 422 | Return `"query too long"` |
| Non-numeric `limit` parameter | 400 | Return `"invalid limit value"` |
| Database connection failure | 500 | Return generic error, log `ERROR` with details |
| Database query timeout | 500 | Return generic error, log `ERROR` with timeout duration |
| FTS index corruption | 500 | Return generic error; detected via elevated error rates alert |
| Rate limit exceeded | 429 | Return rate limit headers, log `WARN` |

## Verification

### API Integration Tests

- **Search repos with a known term returns matching results**: Create a repo with a unique description, search for that term, assert the repo appears in `items`.
- **Search repos returns correct result shape**: Verify each item has `id`, `owner`, `name`, `full_name`, `description`, `is_public`, `topics`.
- **Search repos `full_name` is correctly formatted**: Assert `full_name === "${owner}/${name}"` for every returned item.
- **Search repos with empty query returns 422**: Send `q=""`, expect 422 status with `"query required"`.
- **Search repos with whitespace-only query returns 422**: Send `q="   "`, expect 422.
- **Search repos with no `q` parameter returns 422**: Omit `q` entirely, expect 422.
- **Search repos with query at maximum length (256 chars) succeeds**: Send a 256-character query, expect 200.
- **Search repos with query exceeding maximum length (257 chars) returns 422**: Send a 257-character query, expect 422.
- **Search repos with non-numeric limit returns 400**: Send `limit=abc`, expect 400 with `"invalid limit value"`.
- **Search repos with limit=0 normalizes to default (30)**: Send `limit=0`, verify `per_page` in response is 30.
- **Search repos with limit=-1 normalizes to default**: Send `limit=-1`, verify normalization.
- **Search repos with limit=101 caps to 100**: Send `limit=101`, verify `per_page` in response is 100.
- **Search repos with limit=100 succeeds**: Send `limit=100`, verify no error.
- **Search repos with limit=1 returns exactly 1 result (if matches exist)**: Create multiple matching repos, search with `limit=1`, assert `items.length === 1`.
- **Search repos returns correct total_count**: Create 3 repos with a unique tag, search for that tag, assert `total_count >= 3`.
- **Search repos returns X-Total-Count header**: Verify the header is present and matches `total_count`.
- **Search repos pagination works (page 1 vs page 2)**: Create 5+ matching repos, search with `limit=2&page=1`, then `limit=2&page=2`, assert different items on each page.
- **Search repos cursor-based pagination works**: Use `cursor=0&limit=2`, then `cursor=2&limit=2`, assert different items.
- **Search repos with no matching results returns empty items**: Search for a UUID-based nonexistent term, assert `items === []` and `total_count === 0`.
- **Search repos returns only public repos for anonymous users**: Create a public and a private repo with the same unique term. Search without auth, assert only the public repo is returned.
- **Search repos returns both public and private repos for the owner**: Search as the owner, assert both repos are returned.
- **Search repos returns private org repos for org members**: Create a private org repo, search as an org member, assert the repo appears.
- **Search repos does NOT return private repos for non-members**: Search as a different user who is not an org member, assert the private org repo does not appear.
- **Search repos returns repos accessible via team membership**: Create a private repo, assign it to a team, add a user to the team, search as that user, assert the repo appears.
- **Search repos returns repos accessible via collaborator grants**: Add a user as collaborator on a private repo, search as that user, assert the repo appears.
- **Search repos relevance ranking works**: Create repo A with "alpha workflow" and repo B with "alpha alpha alpha workflow". Search "alpha", assert B ranks above A (higher `ts_rank`).
- **Search repos with special characters does not error**: Send `q=it's a "test" -- ; DROP TABLE`, expect 200 (possibly empty results, but no 500).
- **Search repos with Unicode characters works**: Create a repo with a Unicode description, search for that Unicode term, assert it matches.
- **Search repos is case-insensitive**: Create a repo with name "MyTool", search for "mytool", assert it appears.
- **Search repos with multiple words uses AND semantics**: Create repo with description "alpha beta", another with "alpha gamma". Search "alpha beta", assert only the first repo matches.
- **Search repos concurrent requests return consistent results**: Fire 5 parallel search requests with the same query, assert all return identical `total_count`.

### CLI E2E Tests

- **`codeplane search repos <query>` returns results**: Run the CLI search command, parse JSON output, verify `items` array is populated.
- **`codeplane search repos <query> --json` outputs valid JSON**: Verify output is parseable JSON matching the API response shape.
- **`codeplane search repos <nonexistent>` returns empty items**: Search for a random string, verify `items === []`.
- **`codeplane search repos <query> --limit 5` respects the limit**: Verify returned items count is ≤ 5.
- **`codeplane search repos <query> --page 2` returns page 2 results**: Verify different results from page 1.
- **Multi-repo search: shared tag finds all matching repos**: Create 3 repos with same unique tag, search for tag, verify all 3 appear.
- **Multi-repo search: specific keyword narrows results**: Create repos with distinct keywords, search with the tag plus one keyword, verify only the correct repo appears.
- **CLI search with empty query prints error**: Run `codeplane search repos ""`, verify non-zero exit code or error message.

### Web UI (Playwright) E2E Tests

- **Global search page loads and shows search input**: Navigate to `/search`, verify input is visible.
- **Typing a query shows repository results**: Type a known repo name, wait for debounce, verify result rows appear in the Repositories tab.
- **Clicking a repository result navigates to the repo page**: Click a result, verify URL changes to `/:owner/:repo`.
- **Empty search shows empty state message**: Type a random UUID, verify "No repositories found" message appears.
- **Tab count badge updates with total count**: Type a query, verify the Repositories tab badge shows a number.
- **Pagination loads more results**: Create many repos, search, scroll to bottom or click "Load more", verify additional results appear.
- **Command palette search shows repository results**: Open command palette with Cmd+K, type a query, verify repository suggestions appear.

### TUI E2E Tests

- **Search screen opens and accepts input**: Launch TUI, navigate to search screen, verify search input is active.
- **Repository tab shows results for a valid query**: Type a query, verify results appear in the repositories tab.
- **Keyboard navigation works**: Verify `j`/`k` moves focus up/down through repository results.
- **Enter on a result navigates to repo detail**: Select a result, press Enter, verify repo detail screen opens.
- **Tab switching to Repositories tab works**: Press `1` key, verify Repositories tab is active.

### Editor Integration Tests

- **VS Code search command invokes the API**: Trigger `codeplane.search`, type a query, verify QuickPick populates with results.
- **Neovim Telescope search returns results**: Invoke `:CodeplaneSearch`, type a query, verify Telescope picker populates.

# SEARCH_CLI_CODE

Specification for SEARCH_CLI_CODE.

## High-Level User POV

# SEARCH_CLI_CODE — User POV

When you're working in a terminal and want to find code across all the repositories you have access to on Codeplane, the `codeplane search code` command lets you run a full-text search and get back matching file fragments instantly — without cloning anything first. You type a query and Codeplane searches across every repository you can see — your own, your organization's, your team's, and any public repositories — returning a list of file matches with the repository they belong to, the file path, and a highlighted snippet showing the surrounding code.

The experience is designed for the moment when you know what the code says but not where it lives. You might remember a function name, an error message, a configuration key, or a unique string constant. Code search finds every occurrence across all your accessible repositories and presents them in a single unified list, ranked by relevance. Match terms are highlighted in the snippet so you can scan results at a glance.

Code search respects the same visibility rules as the rest of Codeplane. You will never see results from repositories you don't have read access to. Public repositories are searchable by everyone, including unauthenticated users. Private repositories only appear when you are the owner, an organization member, a team member with repository access, or an explicit collaborator.

The command supports pagination so you can step through large result sets, and structured JSON output so you can pipe results into `jq`, scripts, or other automation tooling. Whether you're an engineer tracking down where an API is defined, a team lead auditing usage of a deprecated function across projects, or an agent programmatically locating code for an automated fix — `codeplane search code` gives you instant, cross-repository code discovery from the terminal.

## Acceptance Criteria

## Acceptance Criteria

### Definition of Done

- The CLI subcommand `codeplane search code <query>` is registered and functional.
- It sends a `GET /api/search/code?q=<query>&page=<page>&limit=<limit>` request to the configured Codeplane API.
- Results are displayed in a human-readable format by default and as structured JSON when `--json` is passed.
- Pagination is supported via `--page` and `--limit` flags.
- The command exits with code 0 on success (including zero results) and non-zero on errors.
- All verification tests pass.
- The `--help` output includes a complete synopsis, all arguments, all options, and usage examples.

### Input Constraints

- [ ] **Query is required**: The `query` positional argument is required. Running `codeplane search code` without a query must produce a clear usage error, not an empty result set.
- [ ] **Query is a positional argument**: The search query is the first positional argument, e.g., `codeplane search code "validateToken"`.
- [ ] **Query maximum length**: Queries longer than 256 characters must be rejected by the server with a 422 error and the message `"query too long"`. Queries of exactly 256 characters must succeed.
- [ ] **Query minimum length**: A query consisting only of whitespace must be treated as empty and rejected with a 422 error (`"query required"`).
- [ ] **Full-text search**: The search must match against indexed code content using PostgreSQL full-text search semantics (`plainto_tsquery` with the `simple` configuration), not exact substring matching.
- [ ] **URL encoding**: The query string must be URL-encoded before transmission. Special characters (`&`, `=`, `+`, `#`, `%`, `/`, `?`, quotes, backslashes, Unicode, emoji) must be safe.
- [ ] **No maximum URL length enforcement by CLI**: The CLI does not enforce a query length limit; the server's 256-character limit and practical HTTP URL length limits (~8,192 bytes) act as ceilings.

### Pagination Constraints

- [ ] **Page default**: The `--page` option defaults to `1`.
- [ ] **Page normalization**: Values less than 1 are normalized to 1 by the server.
- [ ] **Limit default**: The `--limit` option defaults to `30`.
- [ ] **Limit clamping**: Values above 100 are silently clamped to 100 by the server. Values below 1 are normalized to the default (30).
- [ ] **Invalid limit**: A non-numeric `limit` value causes the incur CLI framework (Zod) to reject the input before the request is sent.
- [ ] **Total count**: The response must include `total_count` so the user or tooling can compute total pages.
- [ ] **Page beyond results**: Requesting a page beyond the total result count must return an empty `items` array (not an error).

### Output Constraints

- [ ] **Result shape**: Each result item must include: `repository_id`, `repository_owner`, `repository_name`, `path`, and `snippet`.
- [ ] **Snippet contains highlighting**: The `snippet` field contains `<em>` tags wrapping matched terms. All other HTML in the snippet is entity-escaped.
- [ ] **Response envelope**: The response envelope must include `items` (array), `total_count` (number), `page` (number), and `per_page` (number).
- [ ] **Empty items**: When `total_count` is 0, `items` must be an empty array (not null or omitted).
- [ ] **Human-readable output**: By default, results are displayed in a formatted listing showing repository context, file path, and snippet.
- [ ] **Structured JSON output**: When `--json` is passed (or the CLI's structured output mode is active), the raw API response is returned as JSON.

### Visibility Constraints

- [ ] **Access control**: Results must respect repository visibility. Code from private repositories must only appear for users with read access.
- [ ] **Unauthenticated access**: Unauthenticated users may search, but only see results from public repositories.
- [ ] **Cross-repository results**: Results must span all repositories the viewer has access to, not a single repository.
- [ ] **Visibility enforcement at server**: Visibility is enforced server-side at the SQL layer via a `visible_repositories` CTE, not in client-side post-processing.

### Error Handling

- [ ] **Error propagation**: API errors (network failure, 400, 401, 422, 429, 500) must be surfaced to the user with the error detail, not swallowed silently.
- [ ] **Non-zero exit on error**: The CLI must exit with a non-zero exit code on any error.
- [ ] **Zero exit on empty results**: An empty result set is a success, not an error.

### Edge Cases

- [ ] **Special characters in query**: Queries containing `(`, `)`, `'`, `"`, `\`, `<`, `>`, `&`, `;`, `--` must be URL-encoded correctly and not cause crashes, SQL injection, or server errors.
- [ ] **Unicode query**: Queries containing CJK characters, diacritics, emoji, or other non-ASCII content must be processed without error.
- [ ] **Query that produces empty tsquery**: Queries consisting only of stop words or punctuation that produce an empty tsquery must return an empty result set, not an error.
- [ ] **Files with special characters in path**: File paths containing spaces, dots, slashes, parentheses, and special characters must be returned verbatim.
- [ ] **Binary content accidentally indexed**: If binary content is in the search index, queries must still function without error.
- [ ] **Server unreachable**: The CLI must exit non-zero with a connection error message when the server is unreachable.
- [ ] **Concurrent searches**: Multiple simultaneous searches must return correct, non-cross-contaminated results.

## Design

## Design

### CLI Command

**Command**: `codeplane search code <query>`

**Synopsis**:
```
codeplane search code <query> [--page <n>] [--limit <n>] [--json]
```

**Arguments**:

| Argument | Type   | Required | Description                      |
|----------|--------|----------|----------------------------------|
| `query`  | string | Yes      | Full-text search query (positional) |

**Options**:

| Option    | Type   | Default | Description                              |
|-----------|--------|---------|------------------------------------------|
| `--page`  | number | `1`     | Page number for pagination               |
| `--limit` | number | `30`    | Results per page (max 100)               |
| `--json`  | flag   | false   | Output raw JSON response                 |

**Human-readable output format**:
```
Repository         Path                          Snippet
-----------------  ----------------------------  ----------------------------------------
acme/api-server    src/handlers/auth.ts          function validateToken(token: string) ...
acme/frontend      src/utils/auth.ts             import { validateToken } from "../api" ...

Total: 2 code matches found (page 1)
```

When no results are found:
```
No code matches found
```

**JSON output format** (`--json`):
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

**Exit codes**:

| Code | Meaning                                    |
|------|--------------------------------------------|
| `0`  | Successful search (including empty results) |
| `1`  | Usage error, API error, or auth failure     |

**Example invocations**:
```bash
# Basic code search
codeplane search code "validateToken"

# Paginated code search
codeplane search code "handleRequest" --page 2 --limit 10

# JSON output for scripting
codeplane search code "TODO" --json | jq '.items[].path'

# Find all usages of a function across repos
codeplane search code "deprecated_api_call" --limit 100 --json | jq '.items[] | "\(.repository_owner)/\(.repository_name): \(.path)"'

# Check how many files contain a pattern
codeplane search code "FIXME" --limit 1 --json | jq '.total_count'
```

### API Shape

**Endpoint**: `GET /api/search/code`

**Query parameters**:

| Parameter  | Type    | Required | Default | Max   | Description                                   |
|------------|---------|----------|---------|-------|-----------------------------------------------|
| `q`        | string  | Yes      | —       | 256   | Full-text search query                        |
| `page`     | integer | No       | 1       | —     | Page number (1-indexed)                       |
| `limit`    | integer | No       | 30      | 100   | Results per page                              |
| `cursor`   | string  | No       | —       | —     | Cursor-based pagination (alternative to page) |
| `per_page` | integer | No       | 30      | 100   | Legacy alias for limit                        |

**Response** (200):
```json
{
  "items": [ CodeSearchResult, ... ],
  "total_count": "<number>",
  "page": "<number>",
  "per_page": "<number>"
}
```

**Response headers**:
- `X-Total-Count`: Total number of matching code documents across all pages.
- `Content-Type`: `application/json`

**Error responses**:

| Status | Condition                                    | Body                                |
|--------|----------------------------------------------|-------------------------------------|
| 400    | Invalid `limit` value (non-numeric, ≤ 0)     | `{ "error": "invalid limit value" }` |
| 422    | Empty or missing `q` parameter               | `{ "error": "query required" }`      |
| 422    | Query exceeds 256 characters                 | `{ "error": "query too long" }`      |
| 429    | Rate limit exceeded                          | `{ "error": "rate limit exceeded" }` |
| 500    | Internal server error                        | `{ "error": "internal error" }`      |

### SDK Shape

The `SearchService.searchCode(viewer, input)` method accepts a `SearchCodeInput` with fields: `query`, `page`, `perPage`. It returns a `CodeSearchResultPage` containing `items: CodeSearchResult[]`, `total_count`, `page`, and `per_page`. The method enforces query presence, validates query length, normalizes pagination, and only returns code from repositories visible to the viewer.

**Input type**: `SearchCodeInput { query: string, page: number, perPage: number }`

**Output type**: `CodeSearchResultPage { items: CodeSearchResult[], total_count: number, page: number, per_page: number }`

**Result type**: `CodeSearchResult { repository_id: string, repository_owner: string, repository_name: string, path: string, snippet: string }`

### Documentation

The following end-user documentation should exist:

1. **CLI reference entry** for `codeplane search code` in the CLI help text, including all arguments, options, defaults, and examples.
2. **Man-style help**: `codeplane search code --help` must display a complete usage synopsis, option descriptions, and at least three usage examples (basic search, paginated search, JSON output for scripting).
3. **Search guide section**: A "Searching code" section in the Codeplane user guide explaining cross-repository code search, how relevance ranking works, how visibility filtering applies, pagination behavior, snippet highlighting, and JSON output for scripting.
4. **Example snippets**:
   - `codeplane search code "validateToken"` — basic code search
   - `codeplane search code "handleRequest" --page 2 --limit 10` — paginated search
   - `codeplane search code "TODO" --json | jq '.items[].path'` — scripting example
   - `codeplane search code "deprecated_fn" --limit 100 --json | jq '.total_count'` — counting matches
5. **Search overview page** mentioning all four search types (repos, issues, code, users) with cross-links.

## Permissions & Security

## Permissions & Security

### Authorization

| Role                          | Can search code? | Sees results from                                                                 |
|-------------------------------|-----------------|-----------------------------------------------------------------------------------|
| Anonymous (unauthenticated)   | Yes             | Public repositories only                                                          |
| Authenticated user            | Yes             | Public repos + owned repos                                                        |
| Organization Owner            | Yes             | Public repos + owned repos + org repos                                            |
| Team Member                   | Yes             | Public repos + owned repos + team-assigned repos                                  |
| Collaborator                  | Yes             | Public repos + owned repos + collaborated repos                                   |
| Site Admin                    | Yes             | All repositories                                                                  |

- The viewer's identity (or lack thereof) is resolved from the auth context middleware. The search service uses a `visible_repositories` CTE at the SQL layer to filter results to only include code from repositories the viewer has at least read access to.
- No write permissions are required. This is a read-only operation.
- The viewer ID is extracted from the authenticated session (cookie or PAT). Unauthenticated requests use viewer ID `"0"`, which restricts the CTE to public repositories only.

### Rate Limiting

- **Authenticated users**: 300 search requests per minute per user.
- **Unauthenticated users**: 60 search requests per minute per IP.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be included in responses.
- A `429 Too Many Requests` response with a `Retry-After` header must be returned when the limit is exceeded.
- Per-query cost: 1 request = 1 unit (no differential weighting by query complexity).

### Input Sanitization

- Query strings are passed through PostgreSQL's `plainto_tsquery('simple', ...)`, which strips all operator syntax and prevents injection.
- File path and snippet values in responses are derived from database-stored content and returned as JSON strings.
- The `<em>` tags in snippets are generated by PostgreSQL's `ts_headline()` function from trusted server-side data, not from user input.

### Data Privacy

- Code search results expose file contents (via snippets) from repositories the viewer has access to. This is by design and consistent with the read-access model.
- Search queries themselves may contain sensitive terms. Query strings must not be logged at INFO level. Only `query_length` is logged at INFO. The full query may be logged at DEBUG level only.
- The `viewer_id` used for access filtering must never appear in API response payloads.
- PII in code (e.g., hardcoded emails, API keys) may surface in search results. This is an inherent property of code search and is the repository owner's responsibility to manage via `.gitignore` or secret scanning.
- Code search documents store the full file content. This data is subject to the same backup, encryption-at-rest, and access-control policies as the repository data itself.

## Telemetry & Product Analytics

## Telemetry & Product Analytics

### Business Events

| Event Name                       | Trigger                                    | Properties                                                                                                                                              |
|----------------------------------|--------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `SearchExecuted`                 | Every successful search request            | `search_type: "code"`, `query_length: number`, `result_count: number`, `total_count: number`, `page: number`, `limit: number`, `client: "cli"`, `viewer_authenticated: bool`, `response_time_ms: number` |
| `SearchEmpty`                    | Search returns zero results                | Same as `SearchExecuted` plus `query_hash: string` (SHA-256 hash, not raw query)                                                                         |
| `SearchFailed`                   | Search request fails (4xx/5xx)             | `search_type: "code"`, `error_code: number`, `client: "cli"`, `error_message: string`                                                                   |
| `SearchValidationRejected`       | Query fails validation (empty, too long)   | `search_type: "code"`, `client: "cli"`, `rejection_reason: string`, `query_length: number`                                                              |
| `SearchPaginationUsed`           | User explicitly passes `--page` > 1        | `search_type: "code"`, `client: "cli"`, `page: number`, `limit: number`                                                                                 |

### Funnel Metrics & Success Indicators

- **Search adoption rate**: Percentage of active CLI users who use `search code` at least once per week. Target: ≥ 15% of active CLI users.
- **Zero-result rate**: Percentage of `SearchExecuted` events (type="code") that return zero results. A rising rate above 30% indicates index staleness or user expectation mismatch.
- **Pagination depth**: Average and P95 page number reached. If users rarely go past page 1 (target: average ≤ 2), relevance ranking is working well.
- **Latency P50/P95/P99**: Search response times. Target: P50 < 200ms, P95 < 500ms, P99 < 1s.
- **Query specificity**: Average query length. Target: 8–25 characters (short enough to be fast, long enough to be specific).
- **JSON output usage rate**: Percentage of `search code` invocations that use `--json`. Indicates scripting/automation adoption.
- **Cross-surface adoption**: Percentage of users who use code search from both CLI and at least one other surface (web, TUI) in the same week.

## Observability

## Observability

### Logging Requirements

| Log Point                          | Level   | Structured Context                                                                                |
|------------------------------------|---------|---------------------------------------------------------------------------------------------------|
| Search request received            | `info`  | `search_type: "code"`, `has_query: bool`, `page: number`, `limit: number`, `request_id: string`   |
| Search query validated             | `debug` | `query_length: number`, `query_text: string`, `request_id: string`                                |
| Search query rejected (validation) | `warn`  | `reason: string` ("query_required" / "query_too_long"), `query_length: number`, `request_id: string` |
| Search completed                   | `info`  | `search_type: "code"`, `result_count: number`, `total_count: number`, `duration_ms: number`, `request_id: string` |
| Search failed (internal)           | `error` | `search_type: "code"`, `error_message: string`, `stack_trace: string`, `request_id: string`        |
| FTS query executed                 | `debug` | `query_hash: string`, `phase: string` ("search" / "count"), `duration_ms: number`, `request_id: string` |
| FTS query slow (> 1000ms)          | `warn`  | `query_hash: string`, `phase: string`, `duration_ms: number`, `query_length: number`, `request_id: string` |
| Rate limit triggered               | `warn`  | `search_type: "code"`, `client_ip: string`, `viewer_id: string?`, `request_id: string`             |
| Invalid pagination rejected        | `warn`  | `raw_limit: string`, `raw_page: string`, `request_id: string`                                      |

All logs must include the `request_id` from the middleware for correlation. Sensitive data: the raw `query` string must NOT be logged at INFO level — only `query_length` is logged. At DEBUG level, the full query may be logged for troubleshooting.

### Prometheus Metrics

**Counters:**

| Metric                                           | Labels                                                        | Description                                |
|--------------------------------------------------|---------------------------------------------------------------|--------------------------------------------|
| `codeplane_search_requests_total`                | `type="code"`, `status="success"\|"error"`                     | Total search requests                      |
| `codeplane_search_empty_results_total`           | `type="code"`                                                 | Searches returning zero results            |
| `codeplane_search_validation_errors_total`       | `type="code"`, `reason="empty_query"\|"query_too_long"`        | Validation failures                        |
| `codeplane_search_rate_limited_total`            | `type="code"`, `auth="authenticated"\|"anonymous"`             | Rate limit rejections                      |

**Histograms:**

| Metric                                           | Labels                                    | Buckets                                        | Description                                |
|--------------------------------------------------|-------------------------------------------|------------------------------------------------|--------------------------------------------|
| `codeplane_search_duration_seconds`              | `type="code"`, `phase="total"\|"db_search"\|"db_count"` | 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 | Search request duration                    |
| `codeplane_search_results_total`                 | `type="code"`                              | 0, 1, 5, 10, 30, 50, 100                       | Number of results returned per request     |
| `codeplane_search_query_length`                  | `type="code"`                              | 1, 5, 10, 25, 50, 100, 256                     | Distribution of query string lengths       |

**Gauges:**

| Metric                                              | Description                                                         |
|-----------------------------------------------------|---------------------------------------------------------------------|
| `codeplane_search_code_index_documents_total`       | Total number of indexed code search documents (updated periodically) |
| `codeplane_search_code_index_repositories_total`    | Number of repositories with at least one indexed document            |

### Alerts

#### Alert 1: CodeSearchCLIHighErrorRate
- **Condition**: `rate(codeplane_search_requests_total{type="code",status="error"}[5m]) / rate(codeplane_search_requests_total{type="code"}[5m]) > 0.05` for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check `codeplane_search_requests_total{type="code"}` by status to confirm the error rate is real and not a metric artifact.
  2. Inspect application logs filtered to `search_type=code` and `level=error` for stack traces and error messages.
  3. Check PostgreSQL connectivity: run `SELECT 1` heartbeat against the database.
  4. Check the `code_search_documents` table and GIN index health: `SELECT pg_size_pretty(pg_relation_size('code_search_documents_search_vector_idx'))`. If the index is bloated, run `REINDEX CONCURRENTLY`.
  5. Check `pg_stat_activity` for long-running queries or connection pool exhaustion.
  6. If errors are related to a specific query pattern, verify that `plainto_tsquery` handles it without error.
  7. Check for recent deployments that may have introduced a regression in the search route or service layer.
  8. Escalate to database on-call if the issue is a PostgreSQL-level failure.

#### Alert 2: CodeSearchCLIHighLatency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_search_duration_seconds_bucket{type="code",phase="total"}[5m])) > 1.0` for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Compare `phase="db_search"` and `phase="db_count"` latency histograms to identify which database query is slow.
  2. Check `pg_stat_user_tables` for sequential scans on `code_search_documents` — if the GIN index is not being used, run `ANALYZE code_search_documents`.
  3. Check `pg_stat_activity` for long-running queries or lock contention.
  4. If the GIN index is large (> 10GB), evaluate whether `VACUUM` or `REINDEX CONCURRENTLY` is needed.
  5. Check if a recent bulk indexing operation (large repo push) is competing with search queries.
  6. Review recent data growth — has the document count grown significantly?
  7. If latency is consistently high, evaluate adding a `statement_timeout` to the search query.

#### Alert 3: CodeSearchCLIElevatedEmptyResultRate
- **Condition**: `rate(codeplane_search_empty_results_total{type="code"}[1h]) / rate(codeplane_search_requests_total{type="code",status="success"}[1h]) > 0.6` for 1 hour.
- **Severity**: Info
- **Runbook**:
  1. Check `codeplane_search_code_index_documents_total` against total repository count. If < 50% of repos are indexed, the indexing pipeline may be lagging.
  2. Check if the code indexing background job is running and processing events.
  3. Run a known-good search query manually to verify the index is functional.
  4. Check recent migration or schema changes that may have dropped the `code_search_documents` table or its triggers.
  5. If the index is healthy, this is a product signal (users searching for terms not in the index). No infrastructure action required — notify product team if the rate sustains above 60% for more than 24 hours.

#### Alert 4: CodeSearchRateLimitSpike
- **Condition**: `rate(codeplane_search_rate_limited_total{type="code"}[5m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Identify the source of the high request rate by checking server access logs for the top IP addresses or user IDs.
  2. Determine if this is a legitimate user (e.g., a CI script iterating queries) or abuse/enumeration.
  3. If legitimate, consider temporarily raising the rate limit or suggest the user use larger `--limit` values to reduce request count.
  4. If abusive, consider adding the IP to a block list.
  5. Check if the client-side request pattern suggests a missing debounce or retry loop.

### Error Cases and Failure Modes

| Error Case                                | HTTP Code | CLI Behavior                                    |
|-------------------------------------------|-----------|--------------------------------------------------|
| Empty query string                        | 422       | Print error: "query required"                   |
| Whitespace-only query                     | 422       | Print error: "query required"                   |
| Query exceeds 256 characters              | 422       | Print error: "query too long"                   |
| Invalid limit (non-numeric)               | 400       | Print error: "invalid limit value"              |
| Invalid limit (zero or negative)          | 400       | Print error: "invalid limit value"              |
| Limit exceeds 100                         | —         | Silently clamped to 100 by server               |
| Page is 0 or negative                     | —         | Silently normalized to 1 by server              |
| Not authenticated (private repos)         | —         | Results limited to public repos only             |
| Authentication token expired/invalid      | 401       | Print error: "authentication required"          |
| Rate limited                              | 429       | Print error: "rate limit exceeded"              |
| Database unavailable                      | 500       | Print error: "internal server error"            |
| FTS index corruption                      | 500       | Print error: "internal server error"            |
| Network unreachable                       | —         | Print connection error with details              |
| Timeout (server overloaded)               | 504       | Print error: "request timed out"                |
| Query produces empty tsquery (stop words) | —         | Returns 200 with empty items (not an error)      |

## Verification

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `returns 422 when query is empty string` | `GET /api/search/code?q=` → 422, body contains `"query required"` |
| 2 | `returns 422 when query is whitespace only` | `GET /api/search/code?q=%20%20%20` → 422, body contains `"query required"` |
| 3 | `returns 422 when q parameter is missing` | `GET /api/search/code` → 422, body contains `"query required"` |
| 4 | `returns 422 when query exceeds 256 characters` | `GET /api/search/code?q=<257 chars>` → 422, body contains `"query too long"` |
| 5 | `accepts query of exactly 256 characters` | `GET /api/search/code?q=<256 chars>` → 200 (may return empty results, but no validation error) |
| 6 | `returns 400 for non-numeric limit` | `GET /api/search/code?q=test&limit=abc` → 400, body contains `"invalid limit value"` |
| 7 | `returns 400 for limit=0` | `GET /api/search/code?q=test&limit=0` → 400 |
| 8 | `returns 400 for negative limit` | `GET /api/search/code?q=test&limit=-5` → 400 |
| 9 | `clamps limit above 100 to 100` | `GET /api/search/code?q=test&limit=200` → 200, response `per_page` ≤ 100 |
| 10 | `normalizes page below 1 to page 1` | `GET /api/search/code?q=test&page=0` → 200, response `page` = 1 |
| 11 | `returns results matching indexed content` | Setup: index a file with unique content `"uniqueCodeSearchToken${Date.now()}"`. Search for that token. Verify ≥ 1 result with correct `path` and `repository_name`. |
| 12 | `results contain highlighted snippet` | Search for an indexed term. Verify `snippet` field contains `<em>` tags wrapping the matched term. |
| 13 | `results include correct repository context` | Verify each result has `repository_id`, `repository_owner`, `repository_name`, and `path` fields populated and non-empty. |
| 14 | `response includes total_count and pagination` | Verify response has `total_count` (integer ≥ 0), `page` (integer ≥ 1), `per_page` (integer 1–100). |
| 15 | `X-Total-Count header is set` | Verify the `X-Total-Count` response header matches `total_count` in the body. |
| 16 | `pagination returns correct page of results` | Index 35 files with unique shared content. Request page 1 with limit 30 → 30 results. Request page 2 → 5 results. |
| 17 | `cursor-based pagination works` | Request with `cursor=0&limit=10` → first 10 results. Then `cursor=10&limit=10` → next 10 results. Verify no overlap in `path` values. |
| 18 | `page parameter works with per_page` | `page=2&per_page=5` → offset 5, limit 5. Verify results are different from page 1. |
| 19 | `cursor takes precedence over page when both provided` | Request with `cursor=20&page=1&limit=10` → results at offset 20, not offset 0. |
| 20 | `page beyond results returns empty items` | Index 5 files. Request `page=100` → 200, `items: []`, `total_count: 5`. |
| 21 | `results are ordered by relevance` | Index two files: one where the search term appears in the content prominently, one where it's barely mentioned. Verify the stronger match appears first. |
| 22 | `deterministic ordering with same rank` | Index multiple files with identical matching strength. Verify stable ordering across 3 repeated requests (no result shuffling). |
| 23 | `authenticated user sees own private repo results` | User creates private repo, indexes file with unique term. User searches → result appears. |
| 24 | `authenticated user does not see other users' private repos` | User A creates private repo, indexes file. User B searches → no result from that repo. |
| 25 | `unauthenticated user sees public repo results` | Create public repo, index file. Unauthenticated search → result appears. |
| 26 | `unauthenticated user does not see private repo results` | Create private repo, index file. Unauthenticated search → no result from that repo. |
| 27 | `org member sees org repo results` | Org owner creates repo, indexes file. Org member searches → result appears. |
| 28 | `team member sees team-assigned repo results` | Team is assigned a repo. Team member searches for indexed content → result appears. |
| 29 | `collaborator sees collaborated repo results` | User is added as collaborator to private repo. User searches for indexed content → result appears. |
| 30 | `non-collaborator does not see private repo results` | User without any access to a private repo searches → no results from that repo. |
| 31 | `deleting repo removes its search results` | Index files, delete repo via API, search → no results from deleted repo. `total_count` does not include deleted repo's documents. |
| 32 | `special characters in query do not cause errors` | Queries: `"func("`, `"a && b"`, `"<script>"`, `"O'Brien"`, `"path\\to"`, `"; DROP TABLE"` → all return 200 (may be empty). |
| 33 | `unicode query works` | Index file with content `"日本語テスト"`. Search `"日本語"` → result returned if the `simple` config supports it, else empty items (never an error). |
| 34 | `emoji query does not crash` | Search for `"🐛 bug"` → 200, returns results or empty items. No 500. |
| 35 | `file paths with special characters are returned correctly` | Index file at path `src/utils/my file (2).ts`. Search for content → path returned verbatim as `src/utils/my file (2).ts`. |
| 36 | `empty result set for no-match query` | Search for a nonsensical term `"zzzznonexistentcode${Date.now()}"` → 200, `items: []`, `total_count: 0`. |
| 37 | `snippet is HTML-safe except for em tags` | Index file containing `<script>alert("xss")</script>`. Search → snippet has `&lt;script&gt;` (escaped), only `<em>` tags are unescaped. |
| 38 | `concurrent searches return correct results` | Fire 5 simultaneous search requests with different queries. Each returns results relevant to its query (no cross-contamination). |
| 39 | `search with limit=1 returns exactly 1 item when matches exist` | Index 10 files. Search with `limit=1` → exactly 1 item, `total_count >= 10`. |
| 40 | `search with limit=100 returns up to 100 items` | Index 150 files. Search with `limit=100` → exactly 100 items, `total_count` = 150. |

### CLI End-to-End Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 41 | `codeplane search code <query> returns results` | Setup: create repo, index file with unique content `"clicodesearchterm${Date.now()}"`. Run `codeplane search code "<term>" --json`. Verify exit 0, JSON with ≥ 1 result containing correct `repository_name` and `path`. |
| 42 | `codeplane search code with --page and --limit` | Run `codeplane search code "<term>" --page 1 --limit 5 --json`. Verify ≤ 5 items, `per_page: 5`, `page: 1`. |
| 43 | `codeplane search code with no results returns empty items` | Run `codeplane search code "nonexistent_term_xyz_${Date.now()}" --json`. Verify `items: []`, `total_count: 0`. |
| 44 | `codeplane search code JSON output matches expected schema` | Verify JSON output contains `items` (array), `total_count` (number), `page` (number), `per_page` (number). Each item has `repository_id`, `repository_owner`, `repository_name`, `path`, `snippet`. |
| 45 | `codeplane search code across multiple repos` | Create 3 repos with files containing a shared unique term. Search → results from all 3 repos. |
| 46 | `codeplane search code only shows accessible repos` | User A creates private repo with unique indexed content. User B runs `search code` → does not see User A's repo in results. |
| 47 | `codeplane search code without query argument errors` | Run `codeplane search code`. Verify non-zero exit code and usage or missing argument error in stderr. |
| 48 | `codeplane search code with --limit exceeding max is capped` | Run `codeplane search code "<term>" --limit 200 --json`. Verify `per_page` in response is ≤ 100. |
| 49 | `codeplane search code with special characters in query` | Run `codeplane search code "func(arg)" --json`. Verify exit 0 (results or empty items, no crash). |
| 50 | `codeplane search code with unicode query` | Run `codeplane search code "名前" --json`. Verify exit 0 (results or empty items, no crash). |
| 51 | `codeplane search code with very long query at boundary (256 chars) succeeds` | Run `codeplane search code "<256 char string>" --json`. Verify exit 0. |
| 52 | `codeplane search code with query exceeding 256 chars returns error` | Run `codeplane search code "<257 char string>" --json`. Verify non-zero exit code and error mentioning query too long. |
| 53 | `codeplane search code exit code is 0 for empty results` | Search for a term with no matches. Verify exit code is exactly 0. |
| 54 | `codeplane search code exit code is non-zero on server error` | Point CLI at an unreachable server URL. Verify exit code is non-zero and stderr contains connection error. |
| 55 | `codeplane search code default output is human-readable` | Run `codeplane search code "<term>"` (no --json). Verify stdout contains repository and path information in readable format. |
| 56 | `codeplane search code --help displays synopsis and options` | Run `codeplane search code --help`. Verify output includes command description, `query` argument description, `--page`, `--limit` option descriptions. |
| 57 | `codeplane search code result snippet contains em tags in JSON mode` | Run search that matches indexed content. In `--json` output, verify at least one item's `snippet` field contains `<em>` tags. |

### Web UI E2E Tests (Playwright)

| # | Test Name | Description |
|---|-----------|-------------|
| 58 | `global search page loads with Code tab` | Navigate to `/search`. Verify four tabs visible: Repositories, Issues, Users, Code. |
| 59 | `typing query dispatches search and shows code results` | Type a known indexed term. Wait for results. Click "Code" tab. Verify ≥ 1 result row. |
| 60 | `code result shows repo context, file path, and snippet` | Each visible code result has: owner/repo text, file path text, and snippet with highlighted term. |
| 61 | `clicking file path navigates to code explorer` | Click a file path link in a code result. Verify URL navigates to `/:owner/:repo/code/...`. |
| 62 | `code tab count badge updates` | Type query, wait for results. Verify Code tab shows a numeric count badge. |
| 63 | `no results shows empty state message` | Search for a term with zero code matches. Verify empty state message displayed. |
| 64 | `search preserves state on back navigation` | Search, click a result, press browser back. Verify query text, tab, and scroll position are preserved. |
| 65 | `snippet highlights match terms` | Verify that matched terms in the snippet are rendered with visual highlighting. |

### Cross-Surface Consistency Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 66 | `API and CLI return same total_count for same query` | Index known content. Query via API and CLI with identical query string. Verify `total_count` is identical. |
| 67 | `API and CLI return same result items for same query and page` | Compare `items` arrays (by `repository_id` + `path`) from API and CLI. They must match exactly. |
| 68 | `visibility is consistent across API and CLI` | User creates private repo with indexed content. Verify same visibility from both API call and CLI with same credentials. |
| 69 | `X-Total-Count header matches total_count in CLI JSON output` | Run CLI search with `--json`, also call API directly. Verify `X-Total-Count` header value equals `total_count` field from CLI JSON output. |

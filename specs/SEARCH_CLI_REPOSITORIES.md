# SEARCH_CLI_REPOSITORIES

Specification for SEARCH_CLI_REPOSITORIES.

## High-Level User POV

When a developer needs to discover repositories across a Codeplane instance, `codeplane search repos` provides a fast, terminal-native way to find what they're looking for. Instead of opening a browser and navigating to a search page, the user types a query directly from their shell and gets back a formatted table of matching repositories — names, descriptions, visibility, and stars — ranked by relevance.

This is especially valuable when working across many projects. A platform engineer can quickly check whether a library already exists on the instance. A new team member can find the right repository by searching for a keyword from its description or topic tags. An agent-driven automation script can discover target repositories programmatically using the `--json` flag to get structured output suitable for piping into other tools.

The command respects the user's access level: public repositories are always discoverable, while private repositories only appear if the user has been granted access through ownership, organization membership, team assignment, or direct collaboration. Anonymous or unauthenticated requests see only public repositories. Pagination options let users page through large result sets without overwhelming their terminal, and the `--limit` flag controls how many results appear per page.

The experience is consistent with other Codeplane CLI commands. Human-readable table output is the default for interactive use, while `--json` produces the raw API response for scripting and automation. The command is fast, safe, and idempotent — it is a pure read operation that never modifies any state.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane search repos <query>` executes a full-text search against all repositories the authenticated user can see and returns results ranked by relevance.
- [ ] Default (human-readable) output renders a formatted table with columns: **NAME**, **DESCRIPTION**, **STARS**, **UPDATED**.
- [ ] `--json` flag returns the raw API response body as valid JSON, preserving the `items`, `total_count`, `page`, and `per_page` fields.
- [ ] `--page <n>` selects a 1-based page of results (default: `1`).
- [ ] `--limit <n>` sets the number of results per page (default: `30`, maximum: `100`).
- [ ] The command exits with code `0` on success (including zero results) and code `1` on error.
- [ ] Shell completions for bash, zsh, and fish include `repos` as a valid subcommand of `search`.

### Input Constraints

- [ ] `<query>` is a required positional argument. Omitting it must produce a usage error and exit code `1`.
- [ ] `<query>` must be 1–256 characters after trimming whitespace. A whitespace-only query must produce a clear error (HTTP 422 from the API, surfaced as a CLI error message).
- [ ] `--limit` must accept integer values in the range `1–100`. Values above `100` are silently capped to `100` by the API. Values of `0` or negative produce an error.
- [ ] `--page` must accept positive integers. Values less than `1` default to `1`.
- [ ] Non-numeric values for `--limit` or `--page` must produce a validation error from the CLI argument parser.

### Output Constraints

- [ ] When no results are found, the human-readable output prints `No repositories found` (consistent with `repo list` behavior). JSON output returns `{"items":[],"total_count":0,"page":1,"per_page":30}`.
- [ ] The human-readable table truncates neither the NAME nor the DESCRIPTION columns — they expand to fit content. If the terminal is narrow, the table wraps naturally.
- [ ] Repositories with empty descriptions display an empty cell, not `null` or `undefined`.
- [ ] The `total_count` field in JSON output reflects the total number of matching repositories across all pages, not just the current page.
- [ ] Special characters in repository names and descriptions (Unicode, emoji, `<`, `>`, `&`) must render correctly in both table and JSON output.

### Visibility and Access

- [ ] Authenticated users see public repositories and private repositories they can access (own, org-owned, team-shared, or collaborator).
- [ ] Unauthenticated requests (no token) see only public repositories.
- [ ] Archived repositories that match the query are included in results.
- [ ] Forked repositories that match the query are included in results.

### Edge Cases

- [ ] A query containing only special characters (e.g., `!!!`) that produces zero full-text matches returns an empty result set, not an error.
- [ ] A query containing SQL injection attempts (e.g., `'; DROP TABLE repositories; --`) is safely handled by the full-text search parser and returns zero results.
- [ ] Requesting `--page 9999` when fewer results exist returns an empty `items` array with the correct `total_count`.
- [ ] Concurrent search requests from the same user do not interfere with each other.
- [ ] Network timeouts or server errors produce a clear error message and exit code `1`.

## Design

### CLI Command

**Synopsis:**

```
codeplane search repos <query> [--page <n>] [--limit <n>] [--json]
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `query` | string | Yes | Full-text search query. Matched against repository name, description, and topics. |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--page` | integer | `1` | 1-based page number for pagination. |
| `--limit` | integer | `30` | Number of results per page. Maximum `100`. |
| `--json` | flag | off | Output the raw JSON API response instead of a formatted table. |

**Human-Readable Output:**

When `--json` is not specified, the command prints a table:

```
NAME           DESCRIPTION                  STARS  UPDATED
-------------  ---------------------------  -----  --------------------
jj-tools       CLI utilities for jj         12     2026-03-20T15:30:00Z
workflow-lib   TypeScript workflow helpers   5      2026-03-19T10:00:00Z
```

When no results match:

```
No repositories found
```

**JSON Output:**

When `--json` is specified, the command prints the raw API response:

```json
{
  "items": [
    {
      "id": "123",
      "owner": "alice",
      "name": "jj-tools",
      "full_name": "alice/jj-tools",
      "description": "CLI utilities for jj",
      "is_public": true,
      "topics": ["jj", "cli"]
    }
  ],
  "total_count": 42,
  "page": 1,
  "per_page": 30
}
```

**Error Output:**

Errors are written to stderr. Examples:

```
Error: query required
```

```
Error: required arguments were not provided: query
```

**Exit Codes:**

| Code | Meaning |
|------|---------|
| `0` | Success (including zero results) |
| `1` | Error (missing argument, API error, network failure) |

### API Shape

**Endpoint:** `GET /api/search/repositories`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | (required) | Full-text search query |
| `page` | integer | `1` | 1-based page number (legacy pagination) |
| `limit` | integer | `30` | Results per page (max `100`) |
| `per_page` | integer | `30` | Alias for `limit` (legacy pagination) |
| `cursor` | string | `""` | Opaque offset cursor (takes precedence over `page` if both present) |

**Response (200):**

```json
{
  "items": [RepositorySearchResult],
  "total_count": number,
  "page": number,
  "per_page": number
}
```

**Response Headers:**

| Header | Value |
|--------|-------|
| `X-Total-Count` | Total number of matching repositories |

**Error Responses:**

| Status | Body | Trigger |
|--------|------|---------|
| `400` | `{"error": "invalid limit value"}` | Non-numeric or zero/negative `limit` |
| `422` | `{"error": "query required"}` | Missing or whitespace-only `q` |

### SDK Shape

The `SearchService` in `@codeplane/sdk` exposes:

```typescript
interface SearchRepositoriesInput {
  query: string;   // 1-256 chars after trim
  page: number;    // >= 1
  perPage: number; // 1-100
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

searchRepositories(
  viewer: AuthUser | undefined,
  input: SearchRepositoriesInput
): Promise<RepositorySearchResultPage>
```

### Output Formatting (CLI)

A new `formatSearchRepoList` function should be added to `apps/cli/src/output.ts` using the existing `formatTable` utility. This function:

- Accepts the `items` array from the API response.
- Returns a formatted table with columns: **NAME**, **DESCRIPTION**, **STARS**, **UPDATED**.
- Falls back to `"No repositories found"` when items is empty.
- Uses `full_name` (owner/name) for the NAME column so users can distinguish repositories from different owners.
- Truncates descriptions longer than 60 characters with `…` to keep tables readable.

The `search repos` command handler should check `shouldReturnStructuredOutput(c)` and dispatch to either the raw API JSON or the formatted table, matching the pattern used by `repo list`, `issue list`, and other CLI commands.

### Shell Completions

The `repos` subcommand must be included in completions for all three supported shells:

- **Bash:** `COMPREPLY=( $(compgen -W "repos issues code users" -- "${cur}") )`
- **Zsh:** `_values 'subcommand' 'repos' 'issues' 'code' 'users' ;;`
- **Fish:** `complete -c codeplane -n "__fish_seen_subcommand_from search" -a "repos issues code users"`

### Documentation

The following end-user documentation should be written:

- **CLI Reference (`codeplane search repos`):** Command synopsis, argument and option descriptions, example invocations (basic search, paginated search, JSON output), exit code table. Include an example showing how to pipe JSON output to `jq` for filtering.
- **Search Guide:** A conceptual explanation of how repository search works — what fields are searched (name, description, topics), how multi-word queries behave (AND semantics via PostgreSQL `plainto_tsquery`), how visibility scoping works, and how pagination works.
- **Man page / `--help` text:** The `--help` output for `codeplane search repos` should describe the query argument and all options with their defaults.

## Permissions & Security

### Authorization Model

| Role | Access |
|------|--------|
| **Authenticated user (any role)** | Can search. Results include all public repositories plus private repositories the user has access to through ownership, organization ownership, team membership, or direct collaboration. |
| **Unauthenticated / Anonymous** | Can search. Results include only public repositories. |
| **Admin** | Same as authenticated user. Admin role does not grant additional search visibility beyond what the admin already has access to. |

There is no minimum role requirement to execute the search command. Search is a read-only, discovery-oriented feature available to all users.

### Rate Limiting

- **Authenticated users:** 60 search requests per minute per user.
- **Unauthenticated users:** 10 search requests per minute per IP address.
- Rate limit responses return HTTP `429 Too Many Requests` with a `Retry-After` header.
- The CLI should surface rate limit errors clearly: `Error: rate limit exceeded. Try again in <n> seconds.`

### Data Privacy

- Search results never expose private repository names, descriptions, or metadata to users who lack access. Visibility filtering happens at the database query level, not as a post-query filter.
- Search queries themselves may contain sensitive terms. Query strings must not be logged at INFO level in production — only at DEBUG level, and only with user ID context (never the raw token).
- The `X-Total-Count` header reflects only visible results, not the global total, to prevent information leakage about the existence of private repositories.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `SearchRepositoriesExecuted` | Every successful `codeplane search repos` invocation | `query_length: number`, `result_count: number`, `total_count: number`, `page: number`, `limit: number`, `output_format: "table" \| "json"`, `is_authenticated: boolean`, `client: "cli"`, `duration_ms: number` |
| `SearchRepositoriesEmpty` | When a search returns zero results | `query_length: number`, `is_authenticated: boolean`, `client: "cli"` |
| `SearchRepositoriesError` | When the search command fails | `error_type: string`, `error_status: number \| null`, `client: "cli"` |

### Funnel Metrics and Success Indicators

- **Search adoption rate:** Percentage of active CLI users who execute `search repos` at least once per week.
- **Zero-result rate:** Percentage of searches that return zero results. A high rate may indicate poor search indexing coverage or user confusion about query syntax.
- **Pagination depth:** Distribution of `page` values. If most users never go past page 1, the default result quality is sufficient. If users frequently paginate, relevance ranking may need tuning.
- **Query-to-action conversion:** How often a `search repos` invocation is followed by `repo clone`, `repo view`, or `repo star` within 5 minutes. This measures whether search is leading users to useful next actions.
- **Error rate:** Percentage of invocations that fail with non-zero exit code, broken down by error type.
- **Output format preference:** Ratio of `--json` vs table output, indicating how much the feature is used interactively vs programmatically.

## Observability

### Logging

| Log Point | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| Search request received | `DEBUG` | `{user_id, query_length, page, limit, client: "api"}` | On every request to `/api/search/repositories` |
| Search query executed | `DEBUG` | `{user_id, query_length, total_count, result_count, duration_ms}` | After successful database query |
| Search validation error | `WARN` | `{user_id, error_message, query_length}` | When input validation fails (422) |
| Search database error | `ERROR` | `{user_id, error_message, query_length, stack_trace}` | When the database query throws an unexpected error |
| Rate limit exceeded | `WARN` | `{user_id, ip_address, endpoint: "/api/search/repositories"}` | When rate limiter rejects a request |

**Important:** The raw query string must never be logged at WARN or above in production to prevent sensitive term exposure. Only `query_length` is logged at WARN/ERROR. The full query may be logged at DEBUG level for development troubleshooting.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_search_repositories_requests_total` | Counter | `status={2xx,4xx,5xx}`, `authenticated={true,false}` | Total number of repository search API requests |
| `codeplane_search_repositories_duration_seconds` | Histogram | `authenticated={true,false}` | Latency of repository search requests (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_search_repositories_results_total` | Histogram | — | Distribution of `total_count` values per search (buckets: 0, 1, 5, 10, 25, 50, 100, 500, 1000) |
| `codeplane_search_repositories_empty_total` | Counter | `authenticated={true,false}` | Total searches returning zero results |

### Alerts

**Alert 1: High Search Error Rate**

- **Condition:** `rate(codeplane_search_repositories_requests_total{status="5xx"}[5m]) / rate(codeplane_search_repositories_requests_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check the server logs for `ERROR`-level entries with `endpoint: "/api/search/repositories"`.
  2. Verify the database is healthy: run `SELECT 1` against the primary database and check connection pool stats.
  3. Check if the `search_vector` index is corrupted: run `REINDEX INDEX CONCURRENTLY idx_repositories_search_vector`.
  4. Check disk space on the database server — full disks can cause query failures.
  5. If the error is transient, monitor for recovery over the next 5 minutes. If persistent, escalate to the database on-call.

**Alert 2: High Search Latency**

- **Condition:** `histogram_quantile(0.95, rate(codeplane_search_repositories_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check if there's a general database slowdown: compare with other query latency metrics.
  2. Run `EXPLAIN ANALYZE` on a sample search query against the `repositories` table to check if the full-text search index is being used.
  3. Check for lock contention: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND wait_event_type IS NOT NULL`.
  4. If the index is missing or unused, rebuild it: `REINDEX INDEX CONCURRENTLY idx_repositories_search_vector`.
  5. If load is unusually high, check the rate limiter is functioning correctly and that no single client is flooding the endpoint.

**Alert 3: Abnormal Zero-Result Rate**

- **Condition:** `rate(codeplane_search_repositories_empty_total[1h]) / rate(codeplane_search_repositories_requests_total[1h]) > 0.8` for 1 hour
- **Severity:** Warning
- **Runbook:**
  1. Verify the search index is populated: `SELECT COUNT(*) FROM repositories WHERE search_vector IS NOT NULL`.
  2. If the count is zero or very low, check whether the search vector update trigger is functioning.
  3. Manually test a known query against the API to confirm the search pipeline is working end-to-end.
  4. Check if a recent migration or deployment may have dropped or corrupted the search vector column.

### Error Cases and Failure Modes

| Error | HTTP Status | CLI Exit Code | User Message | Recovery |
|-------|-------------|---------------|--------------|----------|
| Missing query argument | N/A (CLI validation) | `1` | `required arguments were not provided: query` | User provides a query |
| Empty/whitespace query | `422` | `1` | `Error: query required` | User provides a non-empty query |
| Invalid limit value | `400` | `1` | `Error: invalid limit value` | User provides a valid integer |
| Rate limited | `429` | `1` | `Error: rate limit exceeded. Try again in <n> seconds.` | Wait and retry |
| Authentication failure | `401` | `1` | `Error: authentication required` | User re-authenticates with `codeplane auth login` |
| Server unavailable | Connection error | `1` | `Error: could not connect to <api_url>` | Check server status, retry |
| Database timeout | `500` | `1` | `Error: internal server error` | Retry; if persistent, check server health |

## Verification

### E2E Tests — CLI (`e2e/cli/`)

**Setup & Basic Functionality:**

| # | Test | Description |
|---|------|-------------|
| 1 | `setup: create repository with unique searchable description` | Create a repo with a timestamped unique term in the description for isolation. Verify the repo is created via JSON response. |
| 2 | `search repos finds repository by description keyword` | Run `codeplane search repos <unique_term> --json`. Verify `items` array contains a result matching the created repo name. |
| 3 | `search repos finds repository by name` | Create a repo with a unique name. Search by that name. Verify the repo appears in results. |
| 4 | `search repos returns full_name in owner/name format` | Verify each item in JSON output has a `full_name` field matching `<owner>/<name>`. |
| 5 | `search repos returns correct item shape` | Verify each item contains `id`, `owner`, `name`, `full_name`, `description`, `is_public`, and `topics` fields with correct types. |

**Pagination:**

| # | Test | Description |
|---|------|-------------|
| 6 | `search repos with --limit 1 returns at most 1 result` | Create 3 repos with a shared tag. Search with `--limit 1`. Verify `items.length <= 1` and `total_count >= 3`. |
| 7 | `search repos with --page 2 returns different results than page 1` | Search with `--limit 1 --page 1`, then `--limit 1 --page 2`. Verify the items are different (or page 2 is empty if only 1 result). |
| 8 | `search repos with --page beyond total returns empty items` | Search with `--page 9999`. Verify `items` is empty and `total_count` reflects the real count. |
| 9 | `search repos default limit is 30` | Search with no `--limit`. Verify JSON response has `per_page: 30`. |
| 10 | `search repos --limit 100 returns up to 100 results (max valid size)` | Search with `--limit 100`. Verify `per_page: 100` in response. |
| 11 | `search repos --limit 101 is capped to 100` | Search with `--limit 101`. Verify `per_page: 100` in response (API caps silently). |

**Empty and Error Cases:**

| # | Test | Description |
|---|------|-------------|
| 12 | `search repos with no matching results returns empty items` | Search for a random UUID string. Verify `items` is `[]` and `total_count` is `0`. |
| 13 | `search repos with no query argument exits with code 1` | Run `codeplane search repos` with no arguments. Verify exit code `1` and stderr contains usage or error message. |
| 14 | `search repos with whitespace-only query exits with code 1` | Run `codeplane search repos "   " --json`. Verify exit code `1`. |
| 15 | `search repos with special characters does not error` | Run `codeplane search repos "!@#$%^&*()" --json`. Verify exit code `0` and `items` is `[]`. |
| 16 | `search repos with SQL injection attempt returns safely` | Run `codeplane search repos "'; DROP TABLE repositories; --" --json`. Verify exit code `0` and empty or safe results. |

**Visibility and Access Control:**

| # | Test | Description |
|---|------|-------------|
| 17 | `search repos as authenticated user sees own private repos` | Create a private repo with a unique description. Search for it with owner's token. Verify it appears in results. |
| 18 | `search repos as different user does not see others' private repos` | Search for the same private repo's unique term using a read-only token from a different user. Verify the repo does NOT appear in results. |
| 19 | `search repos as unauthenticated sees only public repos` | Create one public and one private repo with the same unique tag. Search without authentication. Verify only the public repo appears. |
| 20 | `search repos sees public repos across all owners` | Have two users create public repos with the same tag. Search as either user. Verify both repos appear. |

**Multi-Word and Relevance:**

| # | Test | Description |
|---|------|-------------|
| 21 | `search repos with multi-word query returns AND-matched results` | Create repos "alpha web framework" and "beta CLI tooling". Search "alpha web". Verify the "alpha" repo ranks in results. |
| 22 | `search repos returns results ranked by relevance` | Create one repo with query term in the name and another with the term only in the description. Verify both appear (relevance ranking is not strictly asserted, but both must be present). |

**Output Formatting:**

| # | Test | Description |
|---|------|-------------|
| 23 | `search repos without --json outputs a formatted table` | Run `codeplane search repos <term>` without `--json`. Verify stdout contains table headers (NAME or similar). Verify exit code `0`. |
| 24 | `search repos with --json outputs valid JSON` | Run with `--json`. Parse stdout as JSON. Verify it parses without error and has `items` array. |
| 25 | `search repos with empty results without --json prints no-results message` | Search for a nonexistent term without `--json`. Verify stdout contains "No repositories found". |

**Input Boundary Tests:**

| # | Test | Description |
|---|------|-------------|
| 26 | `search repos with 1-character query succeeds` | Run `codeplane search repos "a" --json`. Verify exit code `0`. |
| 27 | `search repos with 256-character query succeeds (maximum valid)` | Generate a 256-character string. Run search. Verify exit code `0`. |
| 28 | `search repos with 257-character query returns error or gracefully handles` | Generate a 257-character string. Run search. Verify exit code `1` or the API returns a validation error. If the API does not enforce a max query length, verify the query is accepted and returns empty or valid results. |
| 29 | `search repos with Unicode query works` | Run `codeplane search repos "日本語テスト" --json`. Verify exit code `0`. |
| 30 | `search repos with emoji in query works` | Run `codeplane search repos "🚀rocket" --json`. Verify exit code `0`. |

### E2E Tests — API

| # | Test | Description |
|---|------|-------------|
| 31 | `GET /api/search/repositories?q=<term> returns 200` | HTTP GET with valid query. Verify 200 status, JSON body with `items`, `total_count`, `page`, `per_page`. |
| 32 | `GET /api/search/repositories without q returns 422` | HTTP GET without `q` parameter. Verify 422 status. |
| 33 | `GET /api/search/repositories?q=<term> returns X-Total-Count header` | Verify the response includes the `X-Total-Count` header matching `total_count` in the body. |
| 34 | `GET /api/search/repositories?q=<term>&limit=0 returns 400` | Verify 400 status for invalid limit. |
| 35 | `GET /api/search/repositories?q=<term>&limit=-1 returns 400` | Verify 400 status for negative limit. |
| 36 | `GET /api/search/repositories?q=<term>&limit=abc returns 400` | Verify 400 status for non-numeric limit. |
| 37 | `GET /api/search/repositories?q=<term>&cursor=0&limit=1 returns 1 result` | Verify cursor-based pagination works. |
| 38 | `cursor takes precedence over page when both provided` | Send both `cursor=0` and `page=2`. Verify results match cursor=0 (page 1), not page 2. |

### Integration Tests — Search Service

| # | Test | Description |
|---|------|-------------|
| 39 | `searchRepositories with valid query returns matching repos` | Call `SearchService.searchRepositories()` directly. Verify results match seeded data. |
| 40 | `searchRepositories with empty query throws 422` | Verify `APIError(422)` is thrown. |
| 41 | `searchRepositories normalizes perPage > 100 to 100` | Pass `perPage: 150`. Verify `per_page` in result is `100`. |
| 42 | `searchRepositories normalizes page < 1 to 1` | Pass `page: 0`. Verify `page` in result is `1`. |
| 43 | `searchRepositories with no viewer returns only public repos` | Call with `viewer: undefined`. Verify only public repos appear. |
| 44 | `searchRepositories with viewer returns public + accessible private repos` | Seed a private repo owned by the viewer. Verify it appears in results when the viewer is provided. |

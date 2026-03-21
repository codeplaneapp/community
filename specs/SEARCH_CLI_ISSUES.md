# SEARCH_CLI_ISSUES

Specification for SEARCH_CLI_ISSUES.

## High-Level User POV

When you're working in a terminal and need to find issues across all the repositories you have access to, the `codeplane search issues` command lets you run a full-text search query and get back matching issues instantly. Unlike the `codeplane issue list` command — which shows issues for a single repository — `search issues` works across your entire Codeplane instance, searching issue titles and bodies to help you find what you're looking for regardless of where it lives.

You type a natural-language query and get back a table of matching issues showing the issue number, state, title, and which repository owns the issue. You can narrow your results by filtering on issue state, label, assignee, or milestone. Pagination controls let you step through large result sets. If you're piping the output to another tool or scripting against it, structured JSON output is available. The command is designed for fast, cross-repository triage — whether you're an engineer hunting for a related bug report, a team lead surveying open work across projects, or an agent programmatically querying issue state.

The search is access-aware: you only see issues from repositories you have at least read access to. Private repository issues never leak to unauthorized users. If you are not authenticated, you see only issues from public repositories.

## Acceptance Criteria

- **Query is required**: Running `codeplane search issues` without a query argument must produce a clear usage error, not an empty result set.
- **Query is a positional argument**: The search query is the first positional argument, e.g., `codeplane search issues "login fails"`.
- **Query maximum length**: Queries longer than 1,000 characters must be rejected with a 422 error and a descriptive message. Queries of exactly 1,000 characters must succeed.
- **Query minimum length**: A query consisting only of whitespace must be treated as empty and rejected with a 422 error.
- **Full-text search**: The search must match against issue titles and bodies using full-text search semantics, not exact substring matching.
- **Cross-repository results**: Results must span all repositories the authenticated user can read, not just a single repository.
- **Result shape**: Each result item must include at minimum: `id`, `repository_owner`, `repository_name`, `number`, `title`, and `state`.
- **State filter**: The `--state` option must accept `open`, `closed`, or be omitted (returns all states). Any other value must produce a 422 error.
- **Label filter**: The `--label` option must accept a label name string. The filter is case-insensitive.
- **Assignee filter**: The `--assignee` option must accept a username string. The filter is case-insensitive.
- **Milestone filter**: The `--milestone` option must accept a milestone name string. The filter is case-insensitive.
- **Pagination — page**: The `--page` option defaults to `1`. Values less than 1 are normalized to 1.
- **Pagination — limit**: The `--limit` option defaults to `30`. Values are clamped to the range `[1, 100]`.
- **Total count**: The response must include `total_count` so the user or tooling can compute total pages.
- **Empty result set**: When no issues match, the CLI must output a human-readable "No issues found" message (or an empty `items` array in JSON mode), not an error.
- **Human-readable output**: By default, results are displayed as a formatted table with columns: `Repository`, `Number`, `State`, `Title`.
- **Structured JSON output**: When `--json` is passed (or the CLI's structured output mode is active), the raw API response is returned as JSON.
- **Access control**: Results must respect repository visibility. Issues from private repositories must only appear for users with read access.
- **Unauthenticated access**: Unauthenticated users may search, but only see issues from public repositories.
- **Error propagation**: API errors (network failure, 401, 422, 500) must be surfaced to the user with the error detail, not swallowed silently.
- **Special characters in query**: Queries containing special characters (quotes, backslashes, Unicode, emoji) must be URL-encoded correctly and not cause crashes.
- **Definition of Done**: The CLI command exists, is documented in `--help`, passes all verification tests, the API endpoint handles all filter combinations, output formatting is correct in both human and JSON modes, and access control is enforced.

## Design

### CLI Command

**Command**: `codeplane search issues <query>`

**Synopsis**:
```
codeplane search issues <query> [--state <open|closed>] [--label <name>] [--assignee <username>] [--milestone <name>] [--page <n>] [--limit <n>] [--json]
```

**Arguments**:
| Argument | Type   | Required | Description                   |
|----------|--------|----------|-------------------------------|
| `query`  | string | Yes      | Full-text search query string |

**Options**:
| Option        | Type   | Default | Description                             |
|---------------|--------|---------|-----------------------------------------|
| `--state`     | enum   | (all)   | Filter by issue state: `open`, `closed` |
| `--label`     | string | (none)  | Filter by label name                    |
| `--assignee`  | string | (none)  | Filter by assignee username             |
| `--milestone` | string | (none)  | Filter by milestone name                |
| `--page`      | number | `1`     | Page number for pagination              |
| `--limit`     | number | `30`    | Results per page (max 100)              |
| `--json`      | flag   | false   | Output raw JSON response                |

**Human-readable output format**:
```
Repository     Number  State   Title
-------------  ------  ------  --------------------------
acme/backend   #42     open    Login fails with SSO token
acme/frontend  #18     closed  Auth redirect loop on /sso

Total: 2 issues found (page 1)
```

When no results are found:
```
No issues found
```

**JSON output format** (`--json`):
```json
{
  "items": [
    {
      "id": "abc123",
      "repository_id": "repo456",
      "repository_owner": "acme",
      "repository_name": "backend",
      "number": "42",
      "title": "Login fails with SSO token",
      "state": "open"
    }
  ],
  "total_count": 1,
  "page": 1,
  "per_page": 30
}
```

**Exit codes**:
| Code | Meaning                                    |
|------|--------------------------------------------||
| `0`  | Successful search (including empty results) |
| `1`  | Usage error, API error, or auth failure     |

### API Shape

**Endpoint**: `GET /api/search/issues`

**Query parameters**:
| Parameter  | Type   | Required | Description                                     |
|------------|--------|----------|-------------------------------------------------|
| `q`        | string | Yes      | Full-text search query                           |
| `state`    | string | No       | `open` or `closed`                               |
| `label`    | string | No       | Label name filter (case-insensitive)             |
| `assignee` | string | No       | Assignee username filter (case-insensitive)      |
| `milestone`| string | No       | Milestone name filter (case-insensitive)         |
| `page`     | number | No       | Page number (default 1)                          |
| `limit`    | number | No       | Results per page (default 30, max 100)           |
| `cursor`   | string | No       | Cursor-based pagination (alternative to `page`)  |

**Response** (200):
```json
{
  "items": [ IssueSearchResult, ... ],
  "total_count": "<number>",
  "page": "<number>",
  "per_page": "<number>"
}
```

**Response headers**:
- `X-Total-Count`: Total number of matching issues across all pages.

**Error responses**:
- `422`: Empty query, invalid state filter, or query too long.
- `401`: Authentication required (if instance requires auth for search).
- `500`: Internal server error.

### SDK Shape

The `SearchService.searchIssues(viewer, input)` method accepts a `SearchIssuesInput` with fields: `query`, `state`, `label`, `assignee`, `milestone`, `page`, `perPage`. It returns an `IssueSearchResultPage` containing `items: IssueSearchResult[]`, `total_count`, `page`, and `per_page`. The method enforces query presence, validates the state filter, normalizes pagination, and only returns issues visible to the viewer.

### Documentation

The following end-user documentation should exist:

- **CLI reference entry** for `codeplane search issues` in the CLI help text, including all arguments, options, defaults, and examples.
- **Man-style help**: `codeplane search issues --help` must display a complete usage synopsis, option descriptions, and at least two usage examples (basic search, filtered search).
- **Search guide section**: A "Searching issues" section in the Codeplane user guide explaining cross-repository search, available filters, pagination, and JSON output for scripting.
- **Example snippets**:
  - `codeplane search issues "memory leak"` — basic search
  - `codeplane search issues "auth" --state open --assignee alice` — filtered search
  - `codeplane search issues "deploy" --limit 5 --json | jq '.items[].title'` — scripting example

## Permissions & Security

### Authorization

| Role          | Can search issues? | Sees private repo issues? |
|---------------|-------------------|---------------------------|
| Anonymous     | Yes               | No — public repos only    |
| Authenticated | Yes               | Only repos they can read  |
| Repo Read     | Yes               | Yes, for that repo        |
| Repo Admin    | Yes               | Yes, for that repo        |
| Org Owner     | Yes               | Yes, for org repos        |
| Site Admin    | Yes               | Yes, all repos            |

- The viewer's identity (or lack thereof) is resolved from the auth context middleware. The search service filters results to only include issues from repositories where the viewer has at least read access.
- No write permissions are required. This is a read-only operation.

### Rate Limiting

- **Authenticated users**: 60 search requests per minute per user.
- **Unauthenticated users**: 10 search requests per minute per IP.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be included in responses.
- A `429 Too Many Requests` response with a `Retry-After` header must be returned when the limit is exceeded.

### Data Privacy

- Issue titles, bodies, and metadata from private repositories must never appear in results for unauthorized viewers.
- The search query itself is not PII but should not be logged at a level that would persist user-typed content in production logs (log at `debug` level only).
- The `viewer_id` used for access filtering must never appear in API response payloads.

## Telemetry & Product Analytics

### Business Events

| Event Name         | Trigger                           | Properties                                                                                                    |
|--------------------|-----------------------------------|---------------------------------------------------------------------------------------------------------------|
| `SearchExecuted`   | Every successful search request   | `search_type: "issues"`, `query_length: number`, `has_state_filter: bool`, `has_label_filter: bool`, `has_assignee_filter: bool`, `has_milestone_filter: bool`, `result_count: number`, `total_count: number`, `page: number`, `limit: number`, `client: "cli"`, `viewer_authenticated: bool` |
| `SearchEmpty`      | Search returns zero results       | Same as `SearchExecuted` plus `query_hash: string` (hashed, not raw)                                         |
| `SearchFailed`     | Search request fails (4xx/5xx)    | `search_type: "issues"`, `error_code: number`, `client: "cli"`                                               |

### Funnel Metrics & Success Indicators

- **Search adoption rate**: Percentage of active CLI users who use `search issues` at least once per week.
- **Zero-result rate**: Percentage of searches that return zero results. A rising rate indicates search quality degradation or user expectation mismatch.
- **Filter usage distribution**: Breakdown of which filters (`--state`, `--label`, `--assignee`, `--milestone`) are used and in what combinations. Informs whether to invest in additional filter types.
- **Pagination depth**: Average and P95 page depth reached. If users rarely go past page 1, relevance ranking is working well; if they paginate deeply, ranking may need improvement.
- **Latency P50/P95/P99**: Search response times. Target: P50 < 200ms, P95 < 500ms, P99 < 1s.

## Observability

### Logging

| Log Point                          | Level  | Structured Context                                                            |
|------------------------------------|--------|-------------------------------------------------------------------------------|
| Search request received            | `info` | `search_type`, `has_query`, `filters_applied`, `page`, `limit`                |
| Search query validated             | `debug`| `query_length`, `state_filter`, `label_filter`, `assignee_filter`, `milestone_filter` |
| Search query rejected (validation) | `warn` | `reason`, `query_length`, `state_value`                                       |
| Search completed                   | `info` | `search_type`, `result_count`, `total_count`, `duration_ms`                   |
| Search failed (internal)           | `error`| `search_type`, `error_message`, `stack_trace`                                 |
| FTS query executed                 | `debug`| `query_hash`, `duration_ms`, `rows_scanned`                                   |

### Prometheus Metrics

| Metric                                      | Type      | Labels                                     | Description                                |
|----------------------------------------------|-----------|--------------------------------------------|--------------------------------------------||
| `codeplane_search_requests_total`            | Counter   | `type=issues`, `status=success\|error`      | Total search requests                      |
| `codeplane_search_duration_seconds`          | Histogram | `type=issues`                               | Search request duration                    |
| `codeplane_search_results_total`             | Histogram | `type=issues`                               | Number of results returned per request     |
| `codeplane_search_empty_results_total`       | Counter   | `type=issues`                               | Searches returning zero results            |
| `codeplane_search_validation_errors_total`   | Counter   | `type=issues`, `reason=empty_query\|invalid_state\|query_too_long` | Validation failures |
| `codeplane_search_rate_limited_total`        | Counter   | `type=issues`, `auth=authenticated\|anonymous` | Rate limit rejections                   |

### Alerts

**Alert 1: High Search Error Rate**
- **Condition**: `rate(codeplane_search_requests_total{type="issues",status="error"}[5m]) / rate(codeplane_search_requests_total{type="issues"}[5m]) > 0.05` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_search_requests_total` by status to confirm the error rate.
  2. Inspect application logs filtered to `search_type=issues` and `level=error` for stack traces.
  3. Check database connectivity and FTS index health: run a manual search query against the DB.
  4. If the database is healthy, check for recent deployments that may have introduced a regression.
  5. If load is the cause, check `codeplane_search_duration_seconds` P99 and consider scaling.

**Alert 2: Search Latency Degradation**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_search_duration_seconds_bucket{type="issues"}[5m])) > 2` for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_search_duration_seconds` histogram to identify the latency distribution.
  2. Inspect database query performance: look for slow FTS queries in the database slow query log.
  3. Check if the FTS index needs rebuilding or if table bloat is causing sequential scans.
  4. Review recent data growth — has the issue count grown significantly?
  5. If the problem is load-related, consider read replica routing for search queries.

**Alert 3: Elevated Zero-Result Rate**
- **Condition**: `rate(codeplane_search_empty_results_total{type="issues"}[1h]) / rate(codeplane_search_requests_total{type="issues",status="success"}[1h]) > 0.8` for 1 hour.
- **Severity**: Info
- **Runbook**:
  1. This may indicate FTS index corruption or data loss rather than user behavior.
  2. Run a known-good search query manually to verify the index is functional.
  3. Check recent migration or schema changes that may have dropped FTS triggers.
  4. If the index is healthy, this is likely a product signal (users searching for content that doesn't exist). No action required.

### Error Cases and Failure Modes

| Error Case                        | HTTP Code | CLI Behavior                          |
|-----------------------------------|-----------|---------------------------------------|
| Empty query string                | 422       | Print error: "query required"         |
| Whitespace-only query             | 422       | Print error: "query required"         |
| Query exceeds 1,000 characters    | 422       | Print error: "query too long"         |
| Invalid state filter value        | 422       | Print error: "invalid state filter"   |
| Invalid limit (negative, zero)    | 400       | Print error: "invalid limit value"    |
| Limit exceeds 100                 | —         | Silently clamped to 100              |
| Page is 0 or negative             | —         | Silently normalized to 1             |
| Not authenticated (private repos) | —         | Results limited to public repos      |
| Authentication token expired      | 401       | Print error: "authentication required"|
| Rate limited                      | 429       | Print error: "rate limit exceeded"    |
| Database unavailable              | 500       | Print error: "internal server error"  |
| Network unreachable               | —         | Print error with connection details   |

## Verification

### API Integration Tests

1. **Basic search returns matching issues**: Create issues in a repository, search with a term from an issue title, verify the matching issue appears in `items`.
2. **Search matches issue body content**: Create an issue with a unique keyword only in the body, search for that keyword, verify the issue is returned.
3. **Search returns correct result shape**: Verify each item in `items` contains `id`, `repository_id`, `repository_owner`, `repository_name`, `number`, `title`, `state`.
4. **Search with no matches returns empty items**: Search for a nonsensical query, verify `items` is `[]` and `total_count` is `0`.
5. **Empty query returns 422**: `GET /api/search/issues?q=` → 422 with error body.
6. **Whitespace-only query returns 422**: `GET /api/search/issues?q=%20%20` → 422.
7. **Query at maximum length (1,000 chars) succeeds**: Construct a 1,000-character query, verify 200 response.
8. **Query exceeding maximum length (1,001 chars) returns 422**: Construct a 1,001-character query, verify 422 response.
9. **State filter `open`**: Create open and closed issues, search with `state=open`, verify only open issues appear.
10. **State filter `closed`**: Search with `state=closed`, verify only closed issues appear.
11. **No state filter returns both**: Search without state filter, verify both open and closed issues appear.
12. **Invalid state filter returns 422**: `state=invalid` → 422.
13. **Label filter**: Create issues with and without a specific label, search with `label=<name>`, verify only labeled issues appear.
14. **Label filter is case-insensitive**: Search with `label=BUG` when the label is stored as `bug`, verify match.
15. **Assignee filter**: Create issues assigned to different users, search with `assignee=<username>`, verify only matching issues appear.
16. **Assignee filter is case-insensitive**: Verify `assignee=Alice` matches issues assigned to `alice`.
17. **Milestone filter**: Create issues with different milestones, search with `milestone=<name>`, verify filtering.
18. **Combined filters**: Search with `state=open` AND `label=bug` AND `assignee=alice`, verify all filters are applied conjunctively.
19. **Pagination defaults**: Verify default `page=1`, `per_page=30` in the response.
20. **Pagination page 2**: Create >30 matching issues, request `page=2`, verify different results from page 1.
21. **Pagination limit respected**: Request `limit=5`, verify at most 5 items returned.
22. **Limit clamped to 100**: Request `limit=200`, verify `per_page` in response is `100`.
23. **Limit of 0 or negative is normalized**: Request `limit=-1`, verify it doesn't crash and uses a sensible default.
24. **Page 0 is normalized to 1**: Request `page=0`, verify response has `page: 1`.
25. **X-Total-Count header present**: Verify the response includes the `X-Total-Count` header with the correct total.
26. **Cursor-based pagination**: Request with `cursor` parameter, verify correct offset-based results.
27. **Access control — private repo issues hidden from anonymous**: Create issues in a private repo, unauthenticated search must not return them.
28. **Access control — private repo issues visible to repo member**: Authenticated user with read access sees private repo issues.
29. **Access control — private repo issues hidden from non-member**: Authenticated user without repo access must not see private repo issues.
30. **Cross-repository results**: Create issues in two different repos, search, verify results span both repos.
31. **Special characters in query**: Search with `"login & 'auth'"`, verify no crash and proper URL encoding.
32. **Unicode query**: Search with `"日本語テスト"`, verify no crash (results may be empty if no matching content).
33. **Emoji in query**: Search with `"🐛 bug"`, verify no crash.

### CLI Integration Tests

34. **Basic CLI search**: Run `codeplane search issues "test query"`, verify exit code 0 and table output.
35. **CLI search with no results**: Run `codeplane search issues "zzznonexistent"`, verify output is `No issues found`.
36. **CLI search with --state**: Run `codeplane search issues "bug" --state open`, verify only open issues in output.
37. **CLI search with --label**: Run `codeplane search issues "fix" --label enhancement`, verify filter is passed to API.
38. **CLI search with --assignee**: Run `codeplane search issues "refactor" --assignee alice`, verify filter is passed.
39. **CLI search with --milestone**: Run `codeplane search issues "v2" --milestone "v2.0"`, verify filter is passed.
40. **CLI search with --page and --limit**: Run `codeplane search issues "test" --page 2 --limit 5`, verify pagination parameters forwarded.
41. **CLI search with --json**: Run `codeplane search issues "test" --json`, verify output is valid JSON with expected schema.
42. **CLI search without query argument**: Run `codeplane search issues`, verify non-zero exit code and usage message.
43. **CLI search with invalid --state**: Run `codeplane search issues "test" --state invalid`, verify error message.
44. **CLI help**: Run `codeplane search issues --help`, verify it prints synopsis, arguments, options, and descriptions.
45. **CLI table formatting**: Run a search that returns multiple results, verify the table has headers `Repository`, `Number`, `State`, `Title` and is properly aligned.
46. **CLI exit code on API error**: Simulate a 500 error, verify CLI exits with code 1 and prints the error.

### E2E Tests (Playwright — Web UI)

47. **Global search navigates to issues tab**: Type a query in the global search bar, select the "Issues" tab, verify issue search results are displayed.
48. **Web search results match CLI search results**: For the same query, verify the web UI and CLI return the same `total_count` and issue IDs.

### E2E Tests (Full Stack)

49. **Authenticated user full flow**: Authenticate via CLI → create a repo → create issues → search issues via CLI → verify results include created issues.
50. **Unauthenticated search sees only public**: Create issues in public and private repos → search without auth → verify only public repo issues returned.
51. **Filter combination full flow**: Create issues with various states/labels/assignees → search with combined filters → verify precise result set.
52. **Pagination full flow**: Create 35 issues matching a query → search with `--limit 10` → verify page 1 has 10 results, page 4 has 5 results, `total_count` is 35.

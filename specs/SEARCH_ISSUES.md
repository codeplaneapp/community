# SEARCH_ISSUES

Specification for SEARCH_ISSUES.

## High-Level User POV

When working across multiple repositories in Codeplane, developers frequently need to find specific issues without knowing which repository contains them. The global issue search allows users to type a query from any surface — the web UI's global search page, the CLI, the TUI, or an editor — and instantly discover matching issues across every repository they have access to.

A developer who remembers a keyword from a bug report, a feature name discussed in an issue title, or a phrase from an issue body can type that term into global search and see all matching issues ranked by relevance, regardless of which repository owns them. The results show which repository each issue belongs to, its number, title, and current state, so the user can immediately navigate to the right issue without visiting repositories one by one.

Beyond simple text matching, the search respects the user's access permissions — issues in private repositories only appear for users who have read access — and supports narrowing results by state (open or closed), by a specific label, by an assignee's username, or by a milestone's title. This combination of full-text search with structured filters makes it practical for developers to answer questions like "show me all open issues mentioning 'authentication' that are labeled 'security' and assigned to alice" with a single request.

The feature is designed for cross-repository discovery. It complements the per-repository issue list search (ISSUE_LIST_SEARCH), which operates within a single repository context. Global issue search is the tool users reach for when the repository is unknown, when issues span multiple repositories, or when triaging work across an entire organization.

## Acceptance Criteria

- The search query parameter `q` is required and must be non-empty after trimming. An empty or whitespace-only query returns a `422 Unprocessable Entity` error with the message "query required".
- Full-text search matches against issue titles and bodies using PostgreSQL `plainto_tsquery` with the `simple` text search configuration.
- Results are ranked by full-text search relevance score (descending), with ties broken by issue ID (descending, most recently created first).
- The `state` filter parameter is optional. Valid values are `open`, `closed`, or empty string (meaning no state filter). Any other value returns a `422` error with the message "invalid state filter". Values are case-insensitive and trimmed.
- The `label` filter parameter is optional. When provided, only issues that have a label matching the given name (case-insensitive) are returned.
- The `assignee` filter parameter is optional. When provided, only issues assigned to the user with the given username (case-insensitive) are returned.
- The `milestone` filter parameter is optional. When provided, only issues associated with a milestone matching the given title (case-insensitive) are returned.
- All filter parameters combine with AND semantics — providing state, label, and assignee together returns only issues matching all three conditions.
- Results only include issues from repositories the authenticated user has access to. Anonymous users only see issues from public repositories.
- The response includes `total_count` (total matching issues), `page`, `per_page`, and an `items` array. The `X-Total-Count` response header is also set.
- Each result item includes: `id`, `repository_id`, `repository_owner`, `repository_name`, `number`, `title`, and `state`.
- Pagination supports both cursor/limit and legacy page/per_page patterns. Default page size is 30, maximum is 100, minimum is 1.
- A `limit` value of 0 or negative returns a validation error. A `limit` value exceeding 100 is silently clamped to 100.
- When no results match the query and filters, the response is a `200 OK` with `items: []` and `total_count: 0`, not an error.
- The query string has no explicit maximum length enforced by the search service, but must be a valid UTF-8 string. Very long queries (>10,000 characters) may be rejected by upstream HTTP parsing limits.
- Special characters in the query (quotes, ampersands, angle brackets, backslashes, SQL-significant characters) must not cause errors, injection, or unexpected behavior. `plainto_tsquery` normalizes all input safely.
- The CLI `search issues` command passes the query to the API and displays results with JSON output support.
- The web UI global search page includes an "Issues" tab that displays results from this endpoint with state filter cycling.
- The TUI global search screen includes an Issues tab that queries this endpoint with debounced input.
- **Definition of Done**: The feature is complete when the API endpoint correctly performs full-text issue search across visible repositories with all four filters, the CLI and web UI present results consistently, pagination works correctly at all boundary sizes, permission enforcement is verified for public/private/org repositories, and all e2e tests pass.

## Design

### API Shape

**Endpoint**: `GET /api/search/issues`

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | `string` | Yes | — | Full-text search query. Matched against issue title and body via `plainto_tsquery('simple', q)`. Must be non-empty after trimming. |
| `state` | `string` | No | `""` (no filter) | Filter by issue state. Accepts `open`, `closed`, or empty/omitted for all states. Case-insensitive, trimmed. |
| `label` | `string` | No | `""` (no filter) | Filter by label name. Case-insensitive match. Single label only. |
| `assignee` | `string` | No | `""` (no filter) | Filter by assignee username. Case-insensitive match. Single username only. |
| `milestone` | `string` | No | `""` (no filter) | Filter by milestone title. Case-insensitive match. Single milestone only. |
| `page` | `integer` | No | `1` | Page number (1-based). Mutually exclusive with `cursor`. |
| `per_page` | `integer` | No | `30` | Items per page. Min 1, max 100. Aliased from `limit` in cursor mode. |
| `cursor` | `string` | No | `""` | Opaque pagination cursor (numeric offset). Takes precedence over `page`. |
| `limit` | `integer` | No | `30` | Items per cursor page. Min 1, max 100. |

**Successful Response** (`200 OK`):

```
Headers:
  X-Total-Count: <number>

Body:
{
  "items": [
    {
      "id": "42",
      "repository_id": "10",
      "repository_owner": "alice",
      "repository_name": "my-project",
      "number": "7",
      "title": "Fix authentication timeout",
      "state": "open"
    }
  ],
  "total_count": 15,
  "page": 1,
  "per_page": 30
}
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `422` | Empty or whitespace-only `q` | `"query required"` |
| `422` | Invalid `state` value | `"invalid state filter"` |
| `400` | Invalid `limit` value (non-numeric, zero, negative) | `"invalid limit value"` |

### SDK Shape

**Service**: `SearchService` in `packages/sdk/src/services/search.ts`

**Method**: `searchIssues(viewer: AuthUser | undefined, input: SearchIssuesInput): Promise<IssueSearchResultPage>`

**Input type**:
```typescript
interface SearchIssuesInput {
  query: string;
  state: string;
  label: string;
  assignee: string;
  milestone: string;
  page: number;
  perPage: number;
}
```

**Output type**:
```typescript
interface IssueSearchResult {
  id: string;
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  number: string;
  title: string;
  state: string;
}

interface IssueSearchResultPage {
  items: IssueSearchResult[];
  total_count: number;
  page: number;
  per_page: number;
}
```

**Behavior**:
- Trims `query`; throws `APIError(422, "query required")` if empty after trimming.
- Normalizes `state` to lowercase and trimmed; throws `APIError(422, "invalid state filter")` if not `""`, `"open"`, or `"closed"`.
- Normalizes `label`, `assignee`, `milestone` to lowercase and trimmed.
- Normalizes pagination: page minimum 1, perPage minimum 1 / maximum 100 / default 30.
- Resolves viewer ID (or `"0"` for anonymous) for repository visibility filtering.
- Executes `countSearchIssuesFTS` first; if zero, returns immediately with empty items.
- Executes `searchIssuesFTS` with all parameters; maps database rows to `IssueSearchResult` objects.

### CLI Command

**Command**: `codeplane search issues <query> [options]`

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `query` | `string` | Yes | Full-text search query |

**Options**:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--page` | `integer` | `1` | Page number |
| `--limit` | `integer` | `30` | Results per page (max 100) |
| `--state` | `string` | — | Filter by state (`open` or `closed`) |
| `--label` | `string` | — | Filter by label name |
| `--assignee` | `string` | — | Filter by assignee username |
| `--milestone` | `string` | — | Filter by milestone title |
| `--json` | `boolean` | `false` | Output raw JSON response |

**Note on current state**: The implemented CLI command does not currently expose `--state`, `--label`, `--assignee`, or `--milestone` flags. These should be added to achieve full parity with the API.

**Default output format** (non-JSON):
```
REPO          #  TITLE                         STATE
alice/proj    7  Fix auth timeout              open
bob/tools    12  Add retry logic               closed
```

**JSON output**: Raw API response body printed to stdout.

**Exit codes**: 0 on success, 1 on error (with error message to stderr).

**Example usage**:
```bash
# Basic search
codeplane search issues "authentication timeout"

# Search with filters
codeplane search issues "auth" --state open --label security --assignee alice

# JSON output with pagination
codeplane search issues "bug" --page 2 --limit 50 --json
```

### Web UI Design

The global search page (`/search`) includes an "Issues" tab as one of four parallel search result tabs (Repositories, Issues, Users, Code).

**Search input**:
- Single text input at the top of the page, shared across all tabs.
- Auto-focused on page load.
- 300ms debounce before firing API requests.
- All four search endpoints queried in parallel when the query changes.

**Issues tab**:
- Shows a count badge with `total_count` from the API response.
- Auto-selected when issues have results and no other tab was previously active.
- Each result row displays: `owner/repo` (muted), `#number` (primary color), issue title, state badge (green circle for open, red circle for closed), and relative timestamp.
- Clicking a result navigates to the issue detail page at `/:owner/:repo/issues/:number`.

**State filter**:
- An inline filter control below the tab bar allows cycling between All / Open / Closed states.
- Changing the state filter re-queries the API with the state parameter and resets to page 1.
- The active filter is visually highlighted.

**Pagination**:
- Scroll-triggered pagination loads additional pages when the user scrolls past 80% of the current results.
- Maximum 300 items loaded per tab (10 pages × 30 per page).
- A "Loading more…" indicator appears during pagination fetches.

**Empty state**:
- "No issues found for '{query}'. Try a different query or adjust your filters."

**URL integration**:
- The search query is reflected in the URL as `?q=<query>&tab=issues` for shareability.
- Direct navigation to `/search?q=auth&tab=issues` loads the search page with the Issues tab active and the query pre-filled.

### TUI UI

The TUI global search screen includes an Issues tab as part of the multi-tab search interface.

**Navigation**: Accessed via `g s` keybinding, `s` quick action from dashboard, or command palette.

**Issues tab**:
- Tab header shows "Issues" with a count badge from `total_count`.
- Each result row displays: `owner/repo #number title ● state_badge timestamp`.
- Colors: repo context in muted (ANSI 245), issue number in primary (ANSI 33), state icon ● green for open / ○ red for closed.
- Focused item uses reverse video highlighting.

**State filter**: Press `o` to cycle through All → Open → Closed → All. Filter is server-side; changing it triggers a new API request.

**Keyboard shortcuts**:
- `j` / `k` — Navigate up/down in results
- `Enter` — Open issue detail screen
- `o` — Cycle state filter
- `q` — Return to previous screen
- `Tab` / `Shift+Tab` — Switch between search tabs

**Responsive behavior**:
- 80×24 (minimum): `#number title state_icon` only (repo context and timestamps hidden).
- 120×40 (standard): Full format with repo context and timestamp.
- 200×60+ (large): Full titles with more horizontal space.

**Pagination**: Auto-loads next page at 80% scroll depth. Caps at 300 items (10 pages × 30).

### Documentation

The following end-user documentation should be written:

- **Global Search Guide**: A page explaining how to use global search across all surfaces. Include a section specifically covering issue search with examples of query + filter combinations.
- **CLI Reference: `search issues`**: Document all arguments and flags with examples. Show how to combine `--state`, `--label`, `--assignee`, and `--milestone` filters.
- **API Reference: Search Issues**: Document the `GET /api/search/issues` endpoint with all query parameters, response schema, error responses, and pagination behavior.
- **TUI Keyboard Reference**: Document the search screen's Issues tab keybindings including `o` for state cycling and `Enter` for opening results.

## Permissions & Security

### Authorization

| Role | Can search issues? |
|------|-----------|
| **Authenticated user** | Yes — sees issues from repositories they have access to (owned, org-member, team-member, collaborator) |
| **Anonymous (unauthenticated)** | Yes — sees issues from public repositories only |
| **Authenticated, no specific repo access** | Yes — but will not see issues from private repositories they cannot access |

The search endpoint does not require authentication. The visibility filter is applied at the database query level through a `visible_repositories` CTE that unions:
1. Public repositories
2. Repositories owned by the viewer
3. Repositories in organizations where the viewer is an owner
4. Repositories assigned to teams where the viewer is a member
5. Repositories where the viewer is a collaborator

Anonymous users (viewer ID = 0) only match condition 1 (public repositories).

### Rate Limiting

- The search endpoint is subject to the standard API rate limit applied by the global rate-limiting middleware.
- No additional per-endpoint rate limiting is required, but search queries are inherently more expensive than simple CRUD operations due to full-text search. If abuse patterns emerge (e.g., automated scraping), per-endpoint rate limiting at 60 requests per minute per user should be considered.
- Clients should debounce search input (300ms recommended) to avoid flooding the endpoint with keystrokes.

### Data Privacy

- The search query text itself is not PII, but the results may expose issue titles and repository names that are visibility-gated. The `visible_repositories` CTE ensures that no data leaks across permission boundaries.
- Search queries should not be logged with user-identifying information in analytics/telemetry. Structured request logs may include the query for operational debugging but should follow data retention policies.
- The `state`, `label`, `assignee`, and `milestone` filter values may reference usernames and are logged in request context. These are non-sensitive operational attributes.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `SearchIssuesExecuted` | User performs a global issue search (API request completes) | `query_length`: number, `has_state_filter`: boolean, `state_filter_value`: `open` \| `closed` \| `""`, `has_label_filter`: boolean, `has_assignee_filter`: boolean, `has_milestone_filter`: boolean, `result_count`: number, `total_count`: number, `page`: number, `per_page`: number, `client`: `web` \| `cli` \| `tui` \| `api`, `is_authenticated`: boolean, `response_time_ms`: number |
| `SearchIssueResultClicked` | User clicks/selects a search result to navigate to the issue | `query_length`: number, `result_position`: number (1-indexed), `result_repo`: string, `result_issue_number`: number, `result_state`: `open` \| `closed`, `client`: `web` \| `tui` |
| `SearchIssueFilterApplied` | User changes a filter (state, label, assignee, milestone) during an active search | `filter_type`: `state` \| `label` \| `assignee` \| `milestone`, `filter_value`: string, `client`: `web` \| `tui`, `previous_result_count`: number |

### Funnel Metrics

- **Search-to-click rate**: Percentage of `SearchIssuesExecuted` events that are followed by a `SearchIssueResultClicked` event within the same session. Target: >30% — indicates users find relevant results.
- **Empty result rate**: Percentage of `SearchIssuesExecuted` events where `result_count` is 0. Target: <20% — if higher, suggests search quality or indexing issues.
- **Filter usage rate**: Percentage of `SearchIssuesExecuted` events where at least one filter is applied. Target: >10% — indicates users are aware of and using filters.
- **Repeat search rate**: Percentage of sessions with >1 `SearchIssuesExecuted` event with different queries. High rates may indicate poor initial result quality.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-----------|
| Issue search request received | `DEBUG` | `query_length`, `has_state_filter`, `has_label_filter`, `has_assignee_filter`, `has_milestone_filter`, `page`, `per_page`, `is_authenticated`, `request_id` |
| Issue search query empty — rejecting | `WARN` | `request_id`, `user_id` (if authenticated) |
| Issue search invalid state filter — rejecting | `WARN` | `raw_state`, `request_id`, `user_id` (if authenticated) |
| Issue search count query completed | `DEBUG` | `total_count`, `query_duration_ms`, `request_id` |
| Issue search results query completed | `DEBUG` | `result_count`, `total_count`, `query_duration_ms`, `request_id` |
| Issue search response sent | `INFO` | `status_code`, `result_count`, `total_count`, `response_time_ms`, `request_id` |
| Issue search database error | `ERROR` | `error_message`, `error_type`, `query_length`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_search_issues_requests_total` | Counter | `status_code`, `has_state_filter`, `is_authenticated` | Total issue search requests |
| `codeplane_search_issues_duration_seconds` | Histogram | — | End-to-end request duration. Buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 |
| `codeplane_search_issues_db_duration_seconds` | Histogram | `query_type` (`count`, `search`) | Database query duration. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_search_issues_result_count` | Histogram | — | Number of results returned per request. Buckets: 0, 1, 5, 10, 20, 30, 50, 100 |
| `codeplane_search_issues_total_count` | Histogram | — | Total matching results (before pagination). Buckets: 0, 1, 10, 50, 100, 500, 1000, 10000 |
| `codeplane_search_issues_validation_errors_total` | Counter | `error_type` (`empty_query`, `invalid_state`, `invalid_limit`) | Validation rejections |
| `codeplane_search_issues_empty_results_total` | Counter | — | Searches returning zero results |

### Alerts

**Alert 1: High issue search error rate**
- **Condition**: `rate(codeplane_search_issues_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_search_issues_requests_total[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for `ERROR`-level entries with the search request IDs. Identify the error class (database connection failure, query timeout, OOM).
  2. Query `codeplane_search_issues_db_duration_seconds` to determine if database latency has spiked. If both `count` and `search` query types show elevated latency, the issue is database-level.
  3. Check PostgreSQL connection pool utilization and active query count. If the pool is exhausted, increase pool size or identify connection-leaking code paths.
  4. Check if the full-text search index is healthy: run `SELECT pg_size_pretty(pg_relation_size('issues_search_vector_idx'));` and verify the index exists. A missing index would cause full table scans.
  5. If a single large query is causing timeouts, check `query_length` in error logs. Extremely long queries may need to be rejected at a lower character limit.
  6. If transient, monitor for recovery over 10 minutes. If persistent, restart the server process and escalate to the infrastructure team.

**Alert 2: Slow issue search queries (p95)**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_search_issues_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_search_issues_db_duration_seconds` to determine if the bottleneck is in the count query, the search query, or both.
  2. Identify the time period when latency increased. Correlate with deployment events or database maintenance windows.
  3. Check `codeplane_search_issues_total_count` histogram — if total_count values are very high (>10,000), the query is scanning many results and pagination offset performance may be degrading.
  4. Run `EXPLAIN ANALYZE` on the `searchIssuesFTS` query with representative parameters. Check for sequential scans on `issues`, missing indexes on `issue_labels`, `issue_assignees`, or `milestones`.
  5. Verify the `search_vector` GIN index on the `issues` table is not bloated. Run `REINDEX INDEX CONCURRENTLY issues_search_vector_idx;` if needed.
  6. If the visible_repositories CTE is the bottleneck, consider materializing repository access for heavy users.

**Alert 3: Elevated empty result rate**
- **Condition**: `rate(codeplane_search_issues_empty_results_total[1h]) / rate(codeplane_search_issues_requests_total{status_code="200"}[1h]) > 0.5`
- **Severity**: Warning
- **Runbook**:
  1. This may indicate search index staleness rather than a bug. Check when `search_vector` columns were last updated by examining `updated_at` on recently created issues.
  2. Verify that the database trigger that populates `search_vector` on issue insert/update is active.
  3. If the trigger is missing, re-create it. If it exists, create a test issue and verify the `search_vector` column is populated.
  4. Review whether query terms commonly used by users match the `simple` text search configuration. If users are searching for stems or partial words, `plainto_tsquery('simple', ...)` may not match.
  5. If the high empty rate is user-behavior-driven (searching for things that genuinely don't exist), no action is needed.

**Alert 4: High validation error spike**
- **Condition**: `rate(codeplane_search_issues_validation_errors_total[5m]) > 20`
- **Severity**: Warning
- **Runbook**:
  1. Check WARN-level logs for the specific validation error types. If `empty_query` dominates, a client may be sending requests without a query (UI bug or bot).
  2. If `invalid_state` dominates, identify the client sending invalid state values from request logs.
  3. If `invalid_limit` dominates, a client is sending malformed pagination parameters.
  4. If the pattern looks like automated abuse, consider IP-level rate limiting.
  5. No server-side fix is needed — the validation is working correctly.

### Error Cases and Failure Modes

| Error Case | Response | Behavior |
|------------|----------|----------|
| Empty query (`q` missing or whitespace-only) | `422` | "query required" — rejected before any database access |
| Invalid state value (e.g., `pending`, `all`) | `422` | "invalid state filter" — rejected before database access |
| Invalid limit (non-numeric, zero, negative) | `400` | "invalid limit value" — rejected at route layer |
| Database connection failure | `500` | Logged at ERROR level, error propagated via `writeRouteError` |
| Database query timeout | `500` | Logged at ERROR level, counted in error metrics |
| Query with special/unicode characters | `200` | `plainto_tsquery` safely handles all input; may return empty results |
| Extremely long query (>10,000 chars) | `400` or `413` | Rejected by HTTP parser or body size limits |
| Page number beyond total results | `200` | Empty items array with correct `total_count` |
| Non-existent label/assignee/milestone filter value | `200` | Empty results (filter produces no matches), not an error |
| Concurrent search requests | `200` | Each request is independent; no cross-request interference |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `search issues with matching query returns results` | Create an issue with title containing a unique search term. Search for that term. Verify `items` array contains the issue with correct `id`, `repository_owner`, `repository_name`, `number`, `title`, `state`. |
| 2 | `search issues with non-matching query returns empty` | Search for a random string that doesn't exist. Verify `items: []`, `total_count: 0`, status `200`. |
| 3 | `search issues with empty query returns 422` | Send `q=`. Verify `422` response with "query required". |
| 4 | `search issues with whitespace-only query returns 422` | Send `q=   `. Verify `422` response with "query required". |
| 5 | `search issues without q parameter returns 422` | Send request with no `q` parameter. Verify `422` response. |
| 6 | `search issues with state=open returns only open issues` | Create 2 open and 2 closed issues with the same search term. Search with `state=open`. Verify all returned items have `state: "open"` and `total_count` reflects only open issues. |
| 7 | `search issues with state=closed returns only closed issues` | Same setup. Search with `state=closed`. Verify all returned items have `state: "closed"`. |
| 8 | `search issues with state=OPEN is case-insensitive` | Search with `state=OPEN`. Verify same results as `state=open`. |
| 9 | `search issues with state=invalid returns 422` | Search with `state=pending`. Verify `422` with "invalid state filter". |
| 10 | `search issues with state=all returns 422` | Search with `state=all`. Verify `422` — the API accepts only `open`, `closed`, or empty. |
| 11 | `search issues with state= (empty) returns issues in all states` | Search with `state=` or state omitted. Verify both open and closed issues are returned. |
| 12 | `search issues with whitespace-padded state is trimmed` | Search with `state=  open  `. Verify results are same as `state=open`. |
| 13 | `search issues with label filter returns matching issues` | Create issues: one with label "bug", one without. Search with `label=bug`. Verify only the labeled issue is returned. |
| 14 | `search issues with label filter is case-insensitive` | Search with `label=BUG` when the label is stored as "bug". Verify the issue is still returned. |
| 15 | `search issues with non-existent label returns empty` | Search with `label=nonexistent`. Verify `items: []`, `total_count: 0`. |
| 16 | `search issues with assignee filter returns matching issues` | Create issues: one assigned to "alice", one unassigned. Search with `assignee=alice`. Verify only the assigned issue is returned. |
| 17 | `search issues with assignee filter is case-insensitive` | Search with `assignee=ALICE`. Verify the issue assigned to "alice" is returned. |
| 18 | `search issues with non-existent assignee returns empty` | Search with `assignee=nobody`. Verify empty results. |
| 19 | `search issues with milestone filter returns matching issues` | Create issues: one with milestone "v1.0", one without. Search with `milestone=v1.0`. Verify only the milestoned issue is returned. |
| 20 | `search issues with milestone filter is case-insensitive` | Search with `milestone=V1.0`. Verify the issue is still found. |
| 21 | `search issues with combined filters uses AND semantics` | Create issues with various combinations of state, label, assignee. Search with `state=open&label=bug&assignee=alice`. Verify only issues matching ALL three conditions are returned. |
| 22 | `search issues respects repository visibility (private repo, no auth)` | Create a private repo with issues. Search without authentication. Verify those issues do not appear. |
| 23 | `search issues respects repository visibility (private repo, with auth)` | Same private repo. Search as the repo owner. Verify issues appear. |
| 24 | `search issues respects repository visibility (org team member)` | Create an org repo assigned to a team. Search as a team member. Verify issues appear. Search as a non-member. Verify issues do not appear. |
| 25 | `search issues returns issues from multiple repositories` | Create issues with the same search term in 3 different repos. Search. Verify issues from all 3 repos appear in results. |
| 26 | `search issues with page=1 limit=2 returns first 2 results` | Create 5 issues with the same term. Search with `page=1&limit=2`. Verify exactly 2 items returned. Verify `total_count` is 5. |
| 27 | `search issues with page=2 limit=2 returns next results` | Same setup. Search with `page=2&limit=2`. Verify 2 items returned. Verify no overlap with page 1 items. |
| 28 | `search issues with page=3 limit=2 returns last result` | Same setup. Search with `page=3&limit=2`. Verify 1 item returned. |
| 29 | `search issues with page beyond total returns empty` | Search with `page=100&limit=30`. Verify `items: []` and `total_count` is still correct. |
| 30 | `search issues with limit=100 (maximum) works` | Create 100+ issues. Search with `limit=100`. Verify exactly 100 items returned. |
| 31 | `search issues with limit=101 is clamped to 100` | Search with `limit=101`. Verify no more than 100 items returned. |
| 32 | `search issues with limit=1 returns single result` | Search with `limit=1`. Verify exactly 1 item returned. Verify `total_count` reflects full match count. |
| 33 | `search issues with limit=0 returns error` | Search with `limit=0`. Verify `400` error. |
| 34 | `search issues with negative limit returns error` | Search with `limit=-1`. Verify `400` error. |
| 35 | `search issues with non-numeric limit returns error` | Search with `limit=abc`. Verify `400` error. |
| 36 | `search issues with cursor pagination works` | Search with `cursor=0&limit=2`. Note results. Search with `cursor=2&limit=2`. Verify different results with no overlap. |
| 37 | `search issues X-Total-Count header matches total_count` | Search with any query. Verify the `X-Total-Count` header value equals `body.total_count`. |
| 38 | `search issues results are ordered by relevance` | Create one issue where the search term appears in the title and another where it appears only in the body. Verify the title-match ranks higher (appears first). |
| 39 | `search issues with special characters in query does not error` | Search with `q=<script>alert('xss')</script>`. Verify `200` response (likely empty results), no error. |
| 40 | `search issues with SQL injection attempt in query is safe` | Search with `q='; DROP TABLE issues; --`. Verify `200` response, no error, no data loss. |
| 41 | `search issues with unicode query works` | Search with `q=認証バグ`. Verify `200` response (may be empty if no matching issues). |
| 42 | `search issues with very long query (10000 chars) works` | Search with a 10,000-character query string. Verify the request completes without error (likely empty results). |
| 43 | `search issues matches title content` | Create issue with unique term in title only. Search for that term. Verify it's found. |
| 44 | `search issues matches body content` | Create issue with unique term in body only. Search for that term. Verify it's found. |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 45 | `search issues returns matching results` | Create an issue with a unique term. Run `codeplane search issues <term> --json`. Parse JSON. Verify `items` contains the issue. |
| 46 | `search issues with no matches returns empty items` | Run `codeplane search issues "nonexistent-$(date +%s)" --json`. Verify `items: []`. |
| 47 | `search issues with --page and --limit paginates correctly` | Create 5 issues with the same term. Run with `--page 1 --limit 2 --json`. Verify 2 results. Run with `--page 2 --limit 2 --json`. Verify 2 different results. |
| 48 | `search issues with --state open filters results` | Create open and closed issues. Run with `--state open --json`. Verify all results have `state: "open"`. |
| 49 | `search issues with --label filters results` | Create issues with and without a label. Run with `--label <label> --json`. Verify only labeled issues returned. |
| 50 | `search issues with --assignee filters results` | Create issues assigned and unassigned. Run with `--assignee <user> --json`. Verify only assigned issues returned. |
| 51 | `search issues with --milestone filters results` | Create issues with and without milestone. Run with `--milestone <title> --json`. Verify only milestoned issues returned. |
| 52 | `search issues across multiple repos` | Create issues in 2 repos with the same term. Run search. Verify results from both repos appear. |
| 53 | `search issues with empty query errors` | Run `codeplane search issues "" --json`. Verify exit code 1 and error output. |

### Web UI / Playwright E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 54 | `Global search Issues tab displays results` | Navigate to `/search`. Type a query matching existing issues. Verify the Issues tab appears with a non-zero count badge. Verify issue rows are displayed with repo context, number, title, and state. |
| 55 | `Clicking an issue search result navigates to issue detail` | Perform a search. Click the first issue result. Verify navigation to `/:owner/:repo/issues/:number`. |
| 56 | `Issues tab state filter cycles through All/Open/Closed` | Perform a search. Click the state filter control. Verify it cycles and results update to reflect the filter. |
| 57 | `Empty search results show appropriate message` | Type a query that matches no issues. Verify the empty state message appears. |
| 58 | `Search query is reflected in URL` | Type a query. Verify the URL updates to include `?q=<query>`. Reload the page. Verify the query is preserved and results reload. |
| 59 | `Search results paginate on scroll` | Perform a search returning >30 results. Scroll to bottom. Verify additional results load. |
| 60 | `Issues tab shows correct count from total_count` | Perform a search. Verify the Issues tab badge number matches the `total_count` from the API response. |
| 61 | `Private repo issues are not shown to unauthenticated users` | Log out. Perform a search for a term that exists in a private repo issue. Verify the issue does not appear. Log in. Verify the issue now appears. |

### Cross-Client Consistency Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 62 | `API and CLI return identical results for same query` | Perform an issue search via direct API call and via CLI `--json`. Compare `items` arrays. Verify they contain the same issues in the same order. |
| 63 | `API returns same results regardless of authentication method` | Perform the same search using session cookie auth and PAT auth. Verify identical results. |

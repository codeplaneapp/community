# WORKFLOW_CACHE_LIST

Specification for WORKFLOW_CACHE_LIST.

## High-Level User POV

When developers use Codeplane workflows to build, test, and deploy code, those workflows often produce cached artifacts — dependency trees, build outputs, package registries — that are stored and reused across runs to speed up execution. The Workflow Cache List feature gives developers and team leads direct visibility into what is being cached for a given repository, how much storage those caches consume, and how effectively the caches are being reused.

From any repository, users can view a list of all workflow caches scoped to that repository. Each cache entry shows its key (the identifier set in the workflow definition), the bookmark it was created on, its compressed size, how many times it has been hit by subsequent workflow runs, when it was last hit, and when it will expire. The list can be filtered by bookmark name or cache key to quickly narrow down to a specific dependency set or workflow branch. Pagination is supported so that repositories with many caches remain navigable.

This feature is available across all Codeplane surfaces: the web UI, the CLI (`codeplane cache list`), the TUI (via the workflow caches screen), and indirectly through the API for automation and scripting. In every surface, the same information is presented: users see finalized caches, can filter them, and can assess cache health at a glance. The cache list works in concert with the companion WORKFLOW_CACHE_STATS and WORKFLOW_CACHE_CLEAR features but is independently useful as a read-only inspection surface.

The value is operational clarity. Without cache visibility, developers have no way to know whether their caches are actually being hit, whether stale entries are consuming quota, or whether a build slowdown is caused by a missing cache. The Workflow Cache List turns the workflow caching subsystem from an opaque optimization into a transparent, manageable resource.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/caches` returns a JSON array of finalized workflow cache records for the resolved repository
- [ ] The response includes all user-facing fields for each cache: `id`, `bookmark_name`, `cache_key`, `cache_version`, `object_size_bytes`, `compression`, `status`, `hit_count`, `last_hit_at`, `finalized_at`, `expires_at`, `created_at`, `updated_at`
- [ ] Internal-only fields (`repository_id`, `workflow_run_id`, `object_key`) are included in the response for cross-reference but are not required to be prominently surfaced in UIs
- [ ] The endpoint supports `page` and `per_page` query parameters for pagination
- [ ] The endpoint supports `bookmark` query parameter for exact-match filtering by bookmark name
- [ ] The endpoint supports `key` query parameter for exact-match filtering by cache key
- [ ] Results are ordered by `updated_at DESC, id DESC` (most recently updated first)
- [ ] Only caches with status `finalized` are returned in the list (pending caches are excluded)
- [ ] The CLI command `codeplane cache list` calls this endpoint and displays the results
- [ ] The TUI workflow caches screen fetches and renders this data
- [ ] The Web UI provides a cache list view within the repository workflows section
- [ ] An empty repository returns an empty array `[]` with HTTP 200
- [ ] Requests for non-existent repositories return HTTP 404
- [ ] Unauthenticated requests for private repositories return HTTP 401 or 403

### Pagination Constraints

- [ ] `page` defaults to `1` if not provided
- [ ] `per_page` defaults to `30` if not provided
- [ ] `per_page` minimum is `1`, maximum is `100`; values outside this range are clamped
- [ ] `page` must be a positive integer; `0` or negative values are treated as `1`
- [ ] Non-numeric `page` or `per_page` values return HTTP 400 with a descriptive error

### Filter Constraints

- [ ] `bookmark` filter value maximum length is 255 characters (matching jj bookmark name limits)
- [ ] `key` filter value maximum length is 512 characters (matching workflow cache key limits)
- [ ] Empty string `bookmark` or `key` parameters are treated as "no filter" (same as omitting the parameter)
- [ ] Filters use exact string match, not substring or glob
- [ ] Filter values are case-sensitive
- [ ] Special characters (slashes, dots, hyphens, underscores) are allowed in filter values
- [ ] Unicode characters in filter values are supported
- [ ] Combining `bookmark` and `key` filters applies both (AND logic)

### Edge Cases

- [ ] A repository with zero workflow caches returns `[]` with HTTP 200
- [ ] A repository with exactly one cache returns a single-element array
- [ ] Requesting `page=2` when only one page of results exists returns `[]`
- [ ] A `bookmark` filter matching zero caches returns `[]`
- [ ] A `key` filter matching zero caches returns `[]`
- [ ] Both filters set with no intersection returns `[]`
- [ ] Cache entries with `null` `last_hit_at` are included and the field is serialized as `null`
- [ ] Cache entries with `null` `workflow_run_id` are included and the field is serialized as `null`
- [ ] Very large `object_size_bytes` values (multi-GB) are serialized correctly as numbers
- [ ] Cache keys containing URL-special characters (`?`, `&`, `=`, `#`) work correctly when URL-encoded in the query parameter

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/caches`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner (user or org) |
| `repo` | string | Repository name |

**Query Parameters:**
| Parameter | Type | Default | Constraints | Description |
|-----------|------|---------|-------------|-------------|
| `page` | integer | `1` | ≥ 1 | Page number |
| `per_page` | integer | `30` | 1–100 | Results per page |
| `bookmark` | string | (none) | max 255 chars | Exact-match filter by bookmark name |
| `key` | string | (none) | max 512 chars | Exact-match filter by cache key |

**Response (200 OK):**
```json
[
  {
    "id": 42,
    "repository_id": 7,
    "workflow_run_id": 123,
    "bookmark_name": "main",
    "cache_key": "node_modules",
    "cache_version": "a1b2c3d4e5",
    "object_key": "caches/7/node_modules/a1b2c3d4e5.tar.zst",
    "object_size_bytes": 47185920,
    "compression": "zstd",
    "status": "finalized",
    "hit_count": 23,
    "last_hit_at": "2026-03-22T10:15:00Z",
    "finalized_at": "2026-03-15T08:30:00Z",
    "expires_at": "2026-03-29T08:30:00Z",
    "created_at": "2026-03-15T08:29:00Z",
    "updated_at": "2026-03-22T10:15:00Z"
  }
]
```

**Error Responses:**
| Status | Condition |
|--------|-----------|
| 400 | Invalid `page` or `per_page` (non-numeric, out of range) |
| 401 | No valid authentication |
| 403 | Authenticated but insufficient permissions for private repo |
| 404 | Repository not found |
| 429 | Rate limit exceeded |

**Important Route Path Note:** The current server stubs use `/api/repos/:owner/:repo/actions/cache` while the CLI expects `/api/repos/:owner/:repo/caches`. The canonical path MUST be `/api/repos/:owner/:repo/caches` to match the CLI contract. The server route must be updated accordingly.

### SDK Shape

The `WorkflowService` in `@codeplane/sdk` must expose:

```typescript
listWorkflowCaches(opts: {
  repositoryId: string;
  bookmarkName?: string;
  cacheKey?: string;
  page?: number;
  perPage?: number;
}): Promise<WorkflowCacheRecord[]>
```

This method delegates to the existing `listWorkflowCaches` SQL query in `packages/sdk/src/db/workflow_caches_sql.ts`, computing `pageOffset` from `(page - 1) * perPage` and `pageSize` from `perPage`.

The `@codeplane/ui-core` package must expose a `useWorkflowCaches` hook:

```typescript
useWorkflowCaches(repo: string, opts?: {
  bookmark?: string;
  key?: string;
  page?: number;
  perPage?: number;
}): { data: WorkflowCacheRecord[] | undefined; loading: boolean; error: Error | null; refetch: () => void }
```

### CLI Command

**Command:** `codeplane cache list`

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--repo` | string | Auto-resolved from CWD | Repository in `OWNER/REPO` format |
| `--bookmark` | string | (none) | Filter by bookmark name |
| `--key` | string | (none) | Filter by cache key |
| `--page` | number | `1` | Page number |
| `--limit` | number | `30` | Results per page |

**Default output (table format):**
```
ID    KEY                   BOOKMARK  SIZE      HITS  LAST HIT   EXPIRES
42    node_modules          main      45.0 MB   23    2m ago     in 6d
38    cargo-registry        feat/x    12.1 MB    5    1h ago     in 5d
35    pip-cache             main       8.2 MB   12    3d ago     in 2d
```

**JSON output (`--json`):** Returns the raw API response array.

**Empty result:** Prints `No workflow caches found.` to stderr and returns an empty JSON array when `--json` is set.

**Error output:** Prints the error message to stderr and exits with code 1.

### Web UI Design

The web UI presents the workflow cache list as a sub-route within the repository workflows section at `/:owner/:repo/workflows/caches`.

**Layout:**
- Page header: "Workflow Caches" with repository breadcrumb
- Filter bar with inputs for Bookmark and Cache Key, plus a Search button
- Sortable, paginated table with columns: Cache Key, Bookmark, Size, Hits, Last Hit, Expires, Status
- Empty state: illustration with "No workflow caches yet" message and link to workflow cache documentation
- Each row is clickable to expand inline detail (or link to the originating workflow run)

**Size formatting:** Human-readable bytes (KB, MB, GB) with one decimal place.
**Time formatting:** Relative times ("2m ago", "3d ago") with full ISO timestamp on hover/tooltip.
**Expiration formatting:** Countdown ("in 6d", "in 23h") with color coding: default for >2 days, yellow/warning for 1–2 days, red/danger for <1 day or expired.
**Status indicators:** Green checkmark for finalized, yellow circle for pending.

### TUI UI

The TUI Workflow Cache View is a full-screen within the TUI application. Key aspects for the list:

- Statistics banner at top showing aggregate usage
- Scrollable table of cache entries with keyboard navigation (j/k)
- Inline detail expansion via Enter
- Filter by bookmark (`b`), cache key (`f`), and fuzzy search (`/`)
- Sort cycling (`s`) between created, last hit, size, and hit count
- Pagination via scroll-to-end
- Accessed via `a` from workflow list, `:caches` command palette, or `--screen workflow-caches --repo owner/repo` deep link

### Documentation

The following end-user documentation should be written:

1. **Workflow Cache Management guide** — explains what workflow caches are, how they are created by workflow definitions, and how to inspect them via CLI, web, and TUI
2. **CLI reference for `codeplane cache list`** — options, examples, output formats
3. **API reference for `GET /api/repos/:owner/:repo/caches`** — request/response schema, filtering, pagination, error codes
4. **Workflow authoring guide (cache section)** — how to define cache keys and restore/save descriptors so that caches appear in the cache list

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member/Write | Admin | Owner |
|--------|-----------|-----------|--------------|-------|-------|
| List caches (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| List caches (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |

The cache list is a read-only operation. It follows the same repository visibility rules as other repository resources: public repositories allow unauthenticated read, private repositories require at least read-level access.

### Rate Limiting

- **GET cache list:** 300 requests/minute per authenticated user, 60 requests/minute per anonymous IP
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in all responses
- HTTP 429 response includes `Retry-After` header in seconds

### Data Privacy

- Cache keys and bookmark names are user-defined identifiers and may contain project-internal naming. They are not PII but should be treated as repository-scoped secrets for private repositories
- `object_key` exposes the internal blob store path. This field is safe to include in the API response because the blob store is not publicly accessible, but it should not be prominently surfaced in documentation or UIs
- No secret material (environment variables, credentials) is stored in or exposed through the cache list
- Filter query parameters may appear in server access logs. Bookmark and key filter values should not be treated as sensitive but should be excluded from external analytics pipelines

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workflow_cache.listed` | Successful cache list response returned | `repo_id`, `owner`, `repo`, `cache_count` (returned), `bookmark_filter` (boolean), `key_filter` (boolean), `page`, `per_page`, `source` (web/cli/tui/api), `response_time_ms` |
| `workflow_cache.list_empty` | Cache list returned with zero results | `repo_id`, `owner`, `repo`, `bookmark_filter_value`, `key_filter_value`, `page`, `source` |
| `workflow_cache.list_filtered` | Cache list request included at least one filter | `repo_id`, `owner`, `repo`, `has_bookmark_filter`, `has_key_filter`, `result_count`, `source` |
| `workflow_cache.list_paginated` | Cache list request with `page > 1` | `repo_id`, `owner`, `repo`, `page`, `per_page`, `result_count`, `source` |
| `workflow_cache.list_error` | Cache list request failed | `repo_id`, `owner`, `repo`, `error_type`, `http_status`, `source` |

### Common Properties (attached to all events)
- `timestamp`, `user_id` (if authenticated), `session_id`, `request_id`

### Success Indicators

| Metric | Definition | Target |
|--------|-----------|--------|
| Cache list adoption | % of repositories with ≥1 workflow run that have at least 1 cache list request per week | >30% |
| Filter usage | % of cache list requests that include a bookmark or key filter | >20% |
| Repeat usage | % of users who list caches more than once in the same session | >25% |
| Error rate | % of cache list requests returning 4xx or 5xx | <2% |
| Latency P95 | 95th percentile response time for cache list | <500ms |
| Cross-surface usage | % of cache list users who access from ≥2 surfaces (web, cli, tui) | >10% |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------||
| `debug` | Cache list query executed | `repo_id`, `bookmark_filter`, `key_filter`, `page`, `per_page`, `offset`, `result_count`, `query_duration_ms` |
| `info` | Cache list request served | `request_id`, `repo_id`, `owner`, `repo`, `result_count`, `page`, `per_page`, `has_bookmark_filter`, `has_key_filter`, `response_time_ms`, `status_code` |
| `warn` | Cache list request slow (>1s) | `request_id`, `repo_id`, `response_time_ms`, `result_count` |
| `warn` | Cache list rate limited | `request_id`, `user_id`, `ip`, `retry_after_seconds` |
| `warn` | Invalid pagination parameters | `request_id`, `raw_page`, `raw_per_page`, `error_message` |
| `error` | Cache list database query failed | `request_id`, `repo_id`, `error_message`, `error_stack` |
| `error` | Cache list unexpected error | `request_id`, `repo_id`, `error_message`, `error_stack` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_cache_list_requests_total` | Counter | `status_code`, `source` | Total cache list requests |
| `codeplane_workflow_cache_list_duration_seconds` | Histogram | `source` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_workflow_cache_list_result_count` | Histogram | (none) | Number of cache entries returned per request (buckets: 0, 1, 5, 10, 30, 50, 100) |
| `codeplane_workflow_cache_list_errors_total` | Counter | `error_type` (`auth`, `not_found`, `rate_limit`, `server_error`, `invalid_params`) | Total errors by type |
| `codeplane_workflow_cache_list_filtered_requests_total` | Counter | `filter_type` (`bookmark`, `key`, `both`, `none`) | Requests by filter usage |

### Alerts

**Alert 1: High error rate**
- **Condition:** `rate(codeplane_workflow_cache_list_errors_total{error_type="server_error"}[5m]) / rate(codeplane_workflow_cache_list_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `error` level entries with `workflow_cache_list` context
  2. Check database connectivity: `SELECT 1` against the primary database
  3. Check if the `workflow_caches` table is under vacuum or lock contention: `SELECT * FROM pg_stat_activity WHERE query LIKE '%workflow_caches%'`
  4. Check for recent schema migrations that may have altered the table
  5. If query errors reference a missing column, verify the SQL wrapper matches the current schema
  6. Escalate to the database team if the issue is persistent lock contention or OOM

**Alert 2: High latency**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_cache_list_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_cache_list_result_count` — if result counts are high, the query may be scanning too many rows
  2. Run `EXPLAIN ANALYZE` on the `listWorkflowCaches` query for a sample repository with many caches
  3. Verify the index on `(repository_id, status, updated_at DESC, id DESC)` exists
  4. Check database CPU and I/O metrics in Grafana for saturation
  5. If a single repository has an unusually large cache count (>10,000), consider eviction or a query limit safeguard

**Alert 3: Spike in rate limiting**
- **Condition:** `rate(codeplane_workflow_cache_list_errors_total{error_type="rate_limit"}[5m]) > 10`
- **Severity:** Info
- **Runbook:**
  1. Identify the user or IP address generating excessive requests from structured logs
  2. Check if a misconfigured CI integration or polling script is repeatedly calling the cache list endpoint
  3. If a single automation source, reach out to the repository owner
  4. If distributed, verify rate limit thresholds are correctly configured and not too low

**Alert 4: Sustained zero traffic**
- **Condition:** `sum(rate(codeplane_workflow_cache_list_requests_total[30m])) == 0` for >1h during business hours
- **Severity:** Info
- **Runbook:**
  1. Verify the endpoint is reachable: `curl -s -o /dev/null -w "%{http_code}" https://<host>/api/repos/<test-owner>/<test-repo>/caches`
  2. Check the route is still mounted in the server route tree
  3. Check if a deployment or config change removed or renamed the route
  4. Verify DNS and load balancer health

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior |
|------------|-------------|----------|
| Repository not found | 404 | Return `{ "message": "repository not found" }` |
| Authentication required (private repo) | 401 | Return `{ "message": "authentication required" }` |
| Insufficient permissions | 403 | Return `{ "message": "insufficient permissions" }` |
| Invalid pagination params | 400 | Return `{ "message": "invalid page or per_page parameter" }` |
| Database connection failure | 500 | Return `{ "message": "internal server error" }`, log full error with stack |
| Database query timeout | 500 | Return `{ "message": "internal server error" }`, log timeout context |
| Rate limit exceeded | 429 | Return `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| Server overloaded | 503 | Return `{ "message": "service unavailable" }` |

## Verification

### API Integration Tests (`e2e/api/workflow-cache.test.ts`)

- **API-CL-001:** `GET /api/repos/:owner/:repo/caches` on a new repo returns `200` with `[]`
- **API-CL-002:** `GET /api/repos/:owner/:repo/caches` on a repo with seeded caches returns a non-empty array with all expected fields present on each record
- **API-CL-003:** Each record in the response has fields: `id`, `repository_id`, `workflow_run_id`, `bookmark_name`, `cache_key`, `cache_version`, `object_key`, `object_size_bytes`, `compression`, `status`, `hit_count`, `last_hit_at`, `finalized_at`, `expires_at`, `created_at`, `updated_at`
- **API-CL-004:** All returned records have `status === "finalized"` (no pending caches leak)
- **API-CL-005:** Results are sorted by `updated_at` descending — the first record's `updated_at` is ≥ the second record's `updated_at`
- **API-CL-006:** Default pagination returns at most 30 results
- **API-CL-007:** `per_page=5` returns at most 5 results
- **API-CL-008:** `per_page=1` returns exactly 1 result when caches exist
- **API-CL-009:** `per_page=100` returns up to 100 results (maximum)
- **API-CL-010:** `per_page=0` is clamped to `1` and returns 1 result
- **API-CL-011:** `per_page=101` is clamped to `100`
- **API-CL-012:** `per_page=-1` returns HTTP 400
- **API-CL-013:** `per_page=abc` returns HTTP 400
- **API-CL-014:** `page=1` returns the first page of results
- **API-CL-015:** `page=2` with `per_page=5` returns results offset by 5
- **API-CL-016:** `page=999` (beyond available data) returns `[]`
- **API-CL-017:** `page=0` is treated as `page=1`
- **API-CL-018:** `page=-1` returns HTTP 400
- **API-CL-019:** `page=abc` returns HTTP 400
- **API-CL-020:** `bookmark=main` returns only caches with `bookmark_name === "main"`
- **API-CL-021:** `bookmark=nonexistent` returns `[]`
- **API-CL-022:** `key=node_modules` returns only caches with `cache_key === "node_modules"`
- **API-CL-023:** `key=nonexistent` returns `[]`
- **API-CL-024:** `bookmark=main&key=node_modules` returns only caches matching both
- **API-CL-025:** `bookmark=main&key=nonexistent` returns `[]` (AND logic, no match)
- **API-CL-026:** `bookmark=` (empty string) is treated as no filter
- **API-CL-027:** `key=` (empty string) is treated as no filter
- **API-CL-028:** Bookmark filter with special characters (`feat/my-feature`) works correctly
- **API-CL-029:** Key filter with special characters (`npm-cache-v2.0`) works correctly
- **API-CL-030:** Key filter with URL-special characters (`my?key&value`) works when URL-encoded
- **API-CL-031:** Bookmark filter at maximum length (255 chars) succeeds
- **API-CL-032:** Bookmark filter exceeding maximum length (256 chars) returns HTTP 400
- **API-CL-033:** Key filter at maximum length (512 chars) succeeds
- **API-CL-034:** Key filter exceeding maximum length (513 chars) returns HTTP 400
- **API-CL-035:** Unauthenticated request on public repo returns 200 with data
- **API-CL-036:** Unauthenticated request on private repo returns 401
- **API-CL-037:** Read-only user on private repo returns 200 with data
- **API-CL-038:** Request for non-existent repo returns 404
- **API-CL-039:** Request for non-existent owner returns 404
- **API-CL-040:** `null` `last_hit_at` is serialized as JSON `null` (not string `"null"`)
- **API-CL-041:** `null` `workflow_run_id` is serialized as JSON `null`
- **API-CL-042:** `object_size_bytes` for a large cache (>1 GB) is a valid number
- **API-CL-043:** Unicode bookmark name in filter works correctly
- **API-CL-044:** Response content type is `application/json`
- **API-CL-045:** Rate limit headers are present in the response (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

### CLI Integration Tests (`e2e/cli/workflow-cache.test.ts`)

- **CLI-CL-001:** `codeplane cache list` on a new repo returns empty array (exit code 0)
- **CLI-CL-002:** `codeplane cache list` on a repo with caches returns JSON array of records
- **CLI-CL-003:** `codeplane cache list --bookmark main` filters results to bookmark "main"
- **CLI-CL-004:** `codeplane cache list --key npm` filters results to key "npm"
- **CLI-CL-005:** `codeplane cache list --bookmark main --key npm` applies both filters
- **CLI-CL-006:** `codeplane cache list --page 1 --limit 5` paginates correctly
- **CLI-CL-007:** `codeplane cache list --page 999` returns empty array
- **CLI-CL-008:** `codeplane cache list --limit 1` returns exactly 1 result
- **CLI-CL-009:** `codeplane cache list --repo owner/repo` explicit repo resolution works
- **CLI-CL-010:** `codeplane cache list` without `--repo` in a cloned repo auto-resolves the repo
- **CLI-CL-011:** `codeplane cache list --repo nonexistent/repo` returns error (exit code 1)
- **CLI-CL-012:** `codeplane cache list` with no auth configured returns auth error (exit code 1)
- **CLI-CL-013:** `codeplane cache list --bookmark ""` treated as no filter (returns all)
- **CLI-CL-014:** `codeplane cache list` JSON output contains all expected fields per record

### Playwright Web UI Tests (`e2e/web/workflow-cache.test.ts`)

- **WEB-CL-001:** Navigate to `/:owner/:repo/workflows/caches` — page loads with cache list table
- **WEB-CL-002:** Empty state shows "No workflow caches" message for a new repo
- **WEB-CL-003:** Cache list table shows columns: Cache Key, Bookmark, Size, Hits, Last Hit, Expires
- **WEB-CL-004:** Size column displays human-readable bytes (e.g., "45.0 MB")
- **WEB-CL-005:** Last Hit column displays relative time (e.g., "2m ago")
- **WEB-CL-006:** Expiration displays countdown (e.g., "in 6d")
- **WEB-CL-007:** Expired cache shows "expired" in red/danger color
- **WEB-CL-008:** Bookmark filter input filters the list and updates the URL query parameter
- **WEB-CL-009:** Key filter input filters the list and updates the URL query parameter
- **WEB-CL-010:** Clearing filters returns to unfiltered view
- **WEB-CL-011:** Pagination controls appear when results exceed page size
- **WEB-CL-012:** Clicking "Next" page loads the next page of results
- **WEB-CL-013:** Table rows are clickable to expand inline detail
- **WEB-CL-014:** `null` fields display "—" rather than "null"
- **WEB-CL-015:** Long cache keys are truncated with ellipsis
- **WEB-CL-016:** Page is accessible for anonymous users on a public repo
- **WEB-CL-017:** Page redirects to login for unauthenticated access to a private repo

### TUI Tests (`e2e/tui/workflow-cache.test.ts`)

- **TUI-CL-001:** Cache list screen loads and displays cache entries from the API
- **TUI-CL-002:** Empty state displays "No workflow caches" message
- **TUI-CL-003:** `j`/`k` navigation moves focus between cache entries
- **TUI-CL-004:** `Enter` expands cache detail inline
- **TUI-CL-005:** `b` filter by bookmark updates the displayed cache list
- **TUI-CL-006:** `f` filter by cache key updates the displayed cache list
- **TUI-CL-007:** `x` clears all filters and refetches the full list
- **TUI-CL-008:** `s` cycles sort order and re-sorts the list
- **TUI-CL-009:** `R` refreshes the cache list from the API
- **TUI-CL-010:** Scroll-to-end triggers pagination (next page load)
- **TUI-CL-011:** `q` pops the screen back to the workflow list
- **TUI-CL-012:** Deep link `--screen workflow-caches --repo owner/repo` loads the correct data

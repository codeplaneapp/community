# WORKFLOW_RUN_LIST_BY_REPOSITORY

Specification for WORKFLOW_RUN_LIST_BY_REPOSITORY.

## High-Level User POV

When working on a repository in Codeplane, developers need a clear, consolidated view of every workflow run that has occurred across all workflow definitions in that repository. The Workflow Run List by Repository feature provides exactly this: a single surface—available in the web UI, CLI, TUI, and API—where users can see all workflow runs for a given repository, regardless of which workflow definition triggered them.

A developer opens their repository's workflow section and immediately sees a chronological list of every run, from the most recent at the top to the oldest at the bottom. Each run displays key information at a glance: its current status (success, failure, running, queued, or cancelled), which workflow definition produced it, what triggered it (a push, a landing request, a manual dispatch, a schedule, or another workflow), the bookmark or change reference involved, the abbreviated commit SHA, and how long it took or has been running. This lets the developer quickly answer "what's happening in my repo right now?" and "did my last push break anything?" without needing to drill into individual workflow definitions first.

The list supports filtering by run status—so a developer debugging failures can instantly narrow to only failed runs, or an operator monitoring a deploy can filter to only running and queued runs. A composite "finished" filter groups all terminal states together. The list paginates smoothly, loading more runs as the user scrolls or requests the next page, making it practical even for repositories with thousands of historical runs.

From the CLI, `codeplane run list` returns the same data in a structured format suitable for scripting and automation. From the TUI, the workflow runs screen provides a rich interactive experience with keyboard navigation, real-time status updates via streaming, and the ability to cancel, rerun, or resume runs directly. Every client converges on the same API, ensuring consistency across all surfaces.

This feature is the primary entry point for workflow observability at the repository level and serves as the jumping-off point for deeper inspection of individual runs, their logs, artifacts, and step-by-step execution details.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/workflows/runs` returns a paginated list of all workflow runs for the specified repository
- [ ] Each run in the response is enriched with `workflow_name` and `workflow_path` from the associated workflow definition
- [ ] The response body uses the key `runs` containing an array of enriched workflow run objects
- [ ] Runs are ordered by creation time descending (newest first)
- [ ] Pagination supports both page-based (`page` + `per_page`) and cursor-based (`cursor` + `limit`) query parameters
- [ ] Default page size is 30; maximum page size is 100
- [ ] The optional `state` query parameter filters runs by status with flexible alias support
- [ ] The CLI command `codeplane run list` returns the same data in structured output
- [ ] The TUI Workflow Run List screen renders the full interactive experience
- [ ] The web UI workflows section for a repository displays the run list
- [ ] All clients display consistent data sourced from the same API

### Status Filter Behavior

- [ ] `state=running` matches runs with status `running`, `in_progress`, or `in-progress`
- [ ] `state=queued` matches runs with status `queued` or `pending`
- [ ] `state=success` matches runs with status `success`, `completed`, `complete`, or `done`
- [ ] `state=failure` matches runs with status `failure`, `failed`, or `error`
- [ ] `state=cancelled` matches runs with status `cancelled` or `canceled`
- [ ] `state=finished` matches runs with status `success`, `failure`, or `cancelled` (all terminal states)
- [ ] An empty or absent `state` parameter returns all runs regardless of status
- [ ] Unrecognized `state` values are treated as literal status matches (no error)

### Pagination Constraints

- [ ] `page` must be a positive integer; invalid values return 400 with `"invalid page value"`
- [ ] `per_page` must be a positive integer ≤ 100; values > 100 return 400 with `"per_page must not exceed 100"`
- [ ] `limit` is silently capped at 100 (no error for values > 100)
- [ ] `cursor` values are non-negative integers interpreted as offsets
- [ ] When both `page`/`per_page` and `cursor`/`limit` are provided, `page`/`per_page` takes precedence
- [ ] A page beyond the total run count returns an empty `runs` array, not an error

### Response Shape Constraints

- [ ] `id`: positive integer, unique per run
- [ ] `repository_id`: positive integer matching the requested repository
- [ ] `workflow_definition_id`: positive integer referencing the parent definition
- [ ] `status`: string, one of `success`, `failure`, `running`, `queued`, `cancelled`, `timeout`
- [ ] `trigger_event`: string, one of `push`, `landing_request`, `manual`, `schedule`, `webhook`, `workflow_run`
- [ ] `trigger_ref`: string, may be empty but never null in the response
- [ ] `trigger_commit_sha`: string, may be empty but never null in the response
- [ ] `started_at`: ISO 8601 timestamp string or `null` (if run has not started)
- [ ] `completed_at`: ISO 8601 timestamp string or `null` (if run is not complete)
- [ ] `created_at`: ISO 8601 timestamp string, always present
- [ ] `updated_at`: ISO 8601 timestamp string, always present
- [ ] `workflow_name`: string enriched from the definition; empty string if definition not found
- [ ] `workflow_path`: string enriched from the definition; empty string if definition not found

### Edge Cases

- [ ] Repository with zero workflow runs returns `{ "runs": [] }` with 200 status
- [ ] Repository with zero workflow definitions but existing runs still returns runs (with empty `workflow_name`/`workflow_path`)
- [ ] Deleted workflow definition: runs still appear with empty `workflow_name`/`workflow_path`
- [ ] Non-existent repository returns 404
- [ ] Non-existent owner returns 404
- [ ] Owner or repo names containing special characters (hyphens, underscores, dots) are handled correctly
- [ ] Concurrent run creation during pagination does not cause duplicate or missing entries within a single page
- [ ] State filter applied after pagination fetch (filter may reduce page below `per_page` count)
- [ ] Runs from inactive workflow definitions are still included in results
- [ ] Multiple trigger events producing runs simultaneously all appear in correct order

## Design

### API Shape

**Primary Endpoint (v2)**

```
GET /api/repos/:owner/:repo/workflows/runs
```

**Query Parameters:**

| Parameter | Type | Default | Constraints | Description |
|-----------|------|---------|-------------|-------------|
| `page` | integer | 1 | ≥ 1 | Page number (page-based pagination) |
| `per_page` | integer | 30 | 1–100 | Items per page (page-based pagination) |
| `cursor` | integer | 0 | ≥ 0 | Offset cursor (cursor-based pagination) |
| `limit` | integer | 30 | 1–100 (capped) | Items per page (cursor-based pagination) |
| `state` | string | (none) | See status filter aliases | Filter by run status |

**Response (200 OK):**

```json
{
  "runs": [
    {
      "id": 1047,
      "repository_id": 42,
      "workflow_definition_id": 5,
      "status": "success",
      "trigger_event": "push",
      "trigger_ref": "main",
      "trigger_commit_sha": "a3f8c21e9b4d7f6a2c1e8d5b3a9f7c4e6d2b1a0",
      "started_at": "2026-03-22T10:15:30.000Z",
      "completed_at": "2026-03-22T10:16:35.000Z",
      "created_at": "2026-03-22T10:15:28.000Z",
      "updated_at": "2026-03-22T10:16:35.000Z",
      "workflow_name": "CI",
      "workflow_path": ".codeplane/workflows/ci.ts"
    }
  ]
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "message": "invalid page value" }` | Non-positive or non-numeric `page` |
| 400 | `{ "message": "invalid per_page value" }` | Non-positive or non-numeric `per_page` |
| 400 | `{ "message": "per_page must not exceed 100" }` | `per_page` > 100 |
| 400 | `{ "message": "invalid limit value" }` | Non-positive or non-numeric `limit` |
| 401 | `{ "message": "unauthorized" }` | Missing or invalid authentication |
| 403 | `{ "message": "forbidden" }` | Insufficient repository access |
| 404 | `{ "message": "repository not found" }` | Owner or repo does not exist |

**Legacy Endpoint:**

```
GET /api/repos/:owner/:repo/actions/runs
```

Returns the same data using `{ "workflow_runs": [...] }` response key (without enriched `workflow_name`/`workflow_path`).

### SDK Shape

The `WorkflowService` in `@codeplane/sdk` exposes:

```typescript
listWorkflowRunsByRepo(
  repositoryId: string,
  page: number,
  perPage: number
): Promise<Result<WorkflowRun[], APIError>>
```

This method normalizes pagination parameters (clamps page ≥ 1, perPage between 1–100), computes offset as `(page - 1) * perPage`, delegates to the generated SQL query `listWorkflowRunsByRepo`, and maps raw database rows to normalized `WorkflowRun` objects with ISO 8601 timestamps. The route layer enriches the service results by joining workflow definition metadata (name and path) before returning to the client.

### CLI Command

```
codeplane run list [--repo OWNER/REPO] [--json] [--state STATE]
```

**Behavior:**
- `--repo` resolves the target repository. If omitted, inferred from the current working directory's jj/git remote.
- `--json` outputs raw JSON from the API response.
- `--state` passes through to the API's `state` query parameter.
- Default output is a formatted table with columns: STATUS, ID, WORKFLOW, EVENT, REF, SHA, DURATION, AGE.
- Exit code 0 on success, 1 on API error.

**Example output (table mode):**

```
STATUS  ID      WORKFLOW  EVENT     REF           SHA      DURATION  AGE
✓       #1047   CI        push      main          a3f8c21  1m 5s     3h
✗       #1046   CI        push      feat/auth     b7e2d09  45s       5h
◎       #1045   Deploy    manual    main          c1d4e56  12s       8m
◌       #1044   CI        schedule  main          —        —         2m
```

### TUI UI

The TUI Workflow Run List screen provides a full interactive experience:

- **Title row:** `"{workflow_name} › Runs (N)"` with total count
- **Filter toolbar:** Status filter (cycled with `f`) and search input (focused with `/`)
- **Run rows:** Status icon, run ID, trigger event, trigger ref, commit SHA, duration, relative timestamp
- **Status icons:** ✓ (green/success), ✗ (red/failure), ◎ (yellow/running with 250ms animation cycle ◐◓◑◒), ◌ (cyan/queued), ✕ (gray/cancelled)
- **Duration color coding:** green (<1m), default (1-5m), yellow (5-15m), red (>15m)
- **Actions:** Enter (detail), c (cancel running/queued), r (rerun terminal), m (resume cancelled/failed)
- **Pagination:** Scroll-triggered at 80%, 30 items per page, 500-item memory cap
- **Real-time updates:** SSE subscription for running runs with inline status transitions
- **Responsive breakpoints:** 80×24 (icon + ID + ref + timestamp), 120×40 (+ event + SHA + duration), 200×60+ (all columns wider + step count)
- **Empty states:** "No runs found for this workflow." / "No runs match the current filters."
- **Keyboard navigation:** j/k (nav), G/gg (jump), Ctrl+D/U (page), f (filter cycle), / (search), Ctrl+R (refresh), q (pop)

### Web UI Design

The web UI renders the workflow run list within the repository workflows section at route `/:owner/:repo/workflows`. The page displays:

- A page header showing the repository name and "Workflows" breadcrumb
- A tab or sidebar to switch between workflow definitions and the "All Runs" view
- A filter bar with a status dropdown (All, Running, Queued, Success, Failure, Cancelled, Finished)
- A table of runs with columns: Status badge, Run #, Workflow name, Trigger event, Trigger ref, Commit SHA (linked), Duration, Created timestamp
- Pagination controls at the bottom (page numbers or "Load more")
- Each row is clickable and navigates to the run detail page
- Running runs display an animated spinner badge
- Empty state: "No workflow runs yet. Runs appear here when workflows are triggered."
- Filter empty state: "No runs match the selected filters."

### Documentation

End-user documentation should cover:

1. **"Viewing Workflow Runs"** — a guide explaining how to view all workflow runs for a repository, with screenshots of the web UI, example CLI output, and TUI screen description
2. **"Filtering Workflow Runs"** — explaining status filter options, the `finished` composite filter, and how alias values (e.g., `completed`, `failed`) are accepted
3. **"CLI Reference: `codeplane run list`"** — full flag documentation, examples with `--state` and `--json`, and piping/scripting patterns
4. **"API Reference: List Workflow Runs"** — endpoint documentation with request/response schemas, pagination examples, and error codes

## Permissions & Security

### Authorization Roles

| Role | Public Repository | Private Repository |
|------|------------------|--------------------|
| Anonymous (unauthenticated) | ✅ Read run list | ❌ 401 |
| Authenticated (no repo access) | ✅ Read run list | ❌ 403 |
| Read-only member | ✅ Read run list | ✅ Read run list |
| Write member | ✅ Read run list | ✅ Read run list |
| Admin | ✅ Read run list | ✅ Read run list |
| Owner | ✅ Read run list | ✅ Read run list |

Note: This feature is read-only. The cancel/rerun/resume actions are covered by their own feature specs (WORKFLOW_RUN_CANCEL, WORKFLOW_RUN_RERUN, WORKFLOW_RUN_RESUME) and require write access.

### Rate Limiting

| Endpoint | Limit | Scope |
|----------|-------|-------|
| `GET /api/repos/:owner/:repo/workflows/runs` | 300 requests/minute | Per authenticated user |
| `GET /api/repos/:owner/:repo/workflows/runs` (anonymous) | 60 requests/minute | Per IP address |
| `GET /api/repos/:owner/:repo/actions/runs` (legacy) | 300 requests/minute | Per authenticated user |

Rate limit headers included in every response:
- `X-RateLimit-Limit`: Maximum requests in the window
- `X-RateLimit-Remaining`: Remaining requests in the window
- `X-RateLimit-Reset`: Unix timestamp when the window resets
- `Retry-After`: Seconds to wait (on 429 responses only)

### Data Privacy

- Workflow run data does not contain PII by default. However, `trigger_ref` may contain user-created bookmark names, and `dispatch_inputs` may contain user-provided values.
- `dispatch_inputs` and `agent_token_hash`/`agent_token_expires_at` fields are present in the database but are excluded from the enriched v2 response to prevent accidental token exposure.
- The legacy `/actions/runs` endpoint returns the raw service output which includes `dispatch_inputs` — this should be reviewed for input sanitization.
- Commit SHAs and trigger refs are safe to expose to any user with read access to the repository.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workflow_runs.list_viewed` | Any client fetches the run list | `repo_owner`, `repo_name`, `client` (web/cli/tui/api), `page`, `per_page`, `state_filter`, `result_count`, `total_time_ms` |
| `workflow_runs.filtered` | User applies or changes a state filter | `repo_owner`, `repo_name`, `client`, `filter_value`, `previous_filter`, `result_count` |
| `workflow_runs.paginated` | User requests a page beyond page 1 | `repo_owner`, `repo_name`, `client`, `page_number`, `cumulative_runs_loaded` |
| `workflow_runs.run_opened` | User navigates from the list to a specific run detail | `repo_owner`, `repo_name`, `client`, `run_id`, `run_status`, `trigger_event`, `position_in_list` |
| `workflow_runs.list_empty` | The endpoint returns zero runs | `repo_owner`, `repo_name`, `client`, `state_filter`, `is_new_repo` |
| `workflow_runs.list_error` | The endpoint returns a non-2xx status | `repo_owner`, `repo_name`, `client`, `http_status`, `error_message` |

### Common Properties (all events)

- `user_id` (hashed)
- `session_id`
- `timestamp` (ISO 8601)
- `codeplane_version`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------|
| List view completion rate | > 98% | Users who request the list should receive a successful response |
| Run detail navigation rate | > 40% of list views | Users viewing the list should be inspecting individual runs |
| Filter adoption rate | > 20% of list views | Status filtering provides enough value that users engage with it |
| Page 2+ load rate | > 15% of list views | Users explore beyond the first page for historical runs |
| Average latency (p50) | < 200ms | The list should feel instant |
| Average latency (p95) | < 800ms | Even tail latencies should be responsive |
| Error rate | < 1% | The endpoint should be highly reliable |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------|
| `debug` | Request received | `method=GET`, `path`, `owner`, `repo`, `page`, `per_page`, `state`, `request_id` |
| `debug` | Pagination parsed | `page`, `limit`, `mode` (page-based or cursor-based), `request_id` |
| `debug` | Service call completed | `repository_id`, `run_count`, `duration_ms`, `request_id` |
| `debug` | State filter applied | `filter_value`, `pre_filter_count`, `post_filter_count`, `request_id` |
| `debug` | Definition enrichment completed | `definition_count`, `enrichment_duration_ms`, `request_id` |
| `info` | Response sent | `status=200`, `run_count`, `page`, `total_duration_ms`, `request_id` |
| `warn` | Slow query (> 500ms) | `repository_id`, `duration_ms`, `page`, `limit`, `request_id` |
| `warn` | Rate limited | `user_id`, `ip`, `endpoint`, `retry_after_s`, `request_id` |
| `warn` | Large result set (> 90 items before filter) | `repository_id`, `raw_count`, `request_id` |
| `error` | Database query failure | `repository_id`, `error_message`, `error_code`, `request_id` |
| `error` | Repository resolution failure | `owner`, `repo`, `error_message`, `request_id` |
| `error` | Unexpected exception | `error_message`, `stack_trace`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_runs_list_requests_total` | Counter | `status` (200/400/401/403/404/429/500), `state_filter` (all/running/queued/success/failure/cancelled/finished), `client` | Total requests to the run list endpoint |
| `codeplane_workflow_runs_list_duration_seconds` | Histogram | `status`, `state_filter` | Request duration in seconds (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_workflow_runs_list_results_count` | Histogram | `state_filter` | Number of runs returned per request (buckets: 0, 1, 5, 10, 30, 50, 100) |
| `codeplane_workflow_runs_list_enrichment_duration_seconds` | Histogram | — | Time spent enriching runs with definition metadata |
| `codeplane_workflow_runs_list_db_query_duration_seconds` | Histogram | — | Time spent in the database query |
| `codeplane_workflow_runs_list_rate_limited_total` | Counter | `scope` (user/ip) | Total rate-limited requests |

### Alerts

#### Alert: `WorkflowRunListHighErrorRate`
- **Condition:** `rate(codeplane_workflow_runs_list_requests_total{status=~"5.."}[5m]) / rate(codeplane_workflow_runs_list_requests_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check server logs for the `request_id` values associated with 5xx errors: `grep "error" logs | grep "workflow_runs_list"`
  2. Check database connectivity: `SELECT 1` against the primary DB
  3. Check if the `workflow_runs` table is locked or under heavy write load: inspect pg_stat_activity for long-running queries
  4. Check if a specific repository is causing all errors (look at `repository_id` in error logs)
  5. If DB is overloaded, consider temporarily increasing connection pool size or enabling read replicas
  6. If a single repo has an enormous run count causing OOM, investigate pagination offset performance

#### Alert: `WorkflowRunListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_runs_list_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_runs_list_db_query_duration_seconds` to isolate whether latency is in the DB layer
  2. Check `codeplane_workflow_runs_list_enrichment_duration_seconds` to see if definition lookups are slow
  3. Run `EXPLAIN ANALYZE` on the `listWorkflowRunsByRepo` query for a sample repository_id
  4. Check for missing indexes on `workflow_runs(repository_id, id DESC)`
  5. If enrichment is slow, check the `workflow_definitions` table size and query plan
  6. Consider caching definition metadata if it is stable

#### Alert: `WorkflowRunListHighRateLimit`
- **Condition:** `rate(codeplane_workflow_runs_list_rate_limited_total[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Identify the user or IP being rate-limited from logs
  2. Determine if this is a legitimate polling pattern (e.g., CI dashboard) or abuse
  3. For legitimate use cases, consider offering a webhook/SSE alternative
  4. For abuse, consider temporary IP block or token revocation
  5. Review if the rate limit threshold (300/min for authenticated, 60/min for anonymous) needs adjustment

#### Alert: `WorkflowRunListDatabaseQueryFailures`
- **Condition:** `increase(codeplane_workflow_runs_list_requests_total{status="500"}[10m]) > 5`
- **Severity:** Critical
- **Runbook:**
  1. Check database health: connection pool exhaustion, disk space, replication lag
  2. Check server error logs for specific SQL error codes
  3. Check if the `workflow_runs` table needs VACUUM or has bloat
  4. Verify the database migration state is correct (no missing columns or tables)
  5. If PGLite (daemon mode), check local storage space and file locks
  6. Restart the server process if the connection pool is in a bad state

### Error Cases and Failure Modes

| Error Case | HTTP Status | Log Level | Recovery |
|------------|-------------|-----------|----------|
| Invalid pagination params | 400 | debug | Client fixes request |
| Missing auth token | 401 | info | Client re-authenticates |
| Insufficient repo access | 403 | info | User requests access |
| Repository not found | 404 | info | Client corrects owner/repo |
| Rate limited | 429 | warn | Client waits and retries |
| Database connection failure | 500 | error | Auto-retry with backoff; alert fires |
| Definition enrichment failure | 200 (degraded) | warn | Runs returned with empty names; no user-facing error |
| SQL query timeout | 500 | error | Investigate query plan; add index |
| Out-of-memory on large result | 500 | error | Ensure pagination is enforced; cap result size |

## Verification

### API Integration Tests

**File: `e2e/api/workflow-runs-list.test.ts`**

| Test ID | Description |
|---------|-------------|
| API-WRL-001 | `GET /api/repos/:owner/:repo/workflows/runs` with no runs returns `{ "runs": [] }` with 200 |
| API-WRL-002 | `GET /api/repos/:owner/:repo/workflows/runs` returns runs ordered by ID descending (newest first) |
| API-WRL-003 | Each run in the response includes all required fields: `id`, `repository_id`, `workflow_definition_id`, `status`, `trigger_event`, `trigger_ref`, `trigger_commit_sha`, `started_at`, `completed_at`, `created_at`, `updated_at`, `workflow_name`, `workflow_path` |
| API-WRL-004 | Runs are enriched with `workflow_name` and `workflow_path` from the associated definition |
| API-WRL-005 | Runs from a deleted/missing definition have empty string `workflow_name` and `workflow_path` |
| API-WRL-006 | Default pagination returns at most 30 runs |
| API-WRL-007 | `per_page=10` returns at most 10 runs |
| API-WRL-008 | `per_page=100` returns at most 100 runs (maximum valid size) |
| API-WRL-009 | `per_page=101` returns 400 with `"per_page must not exceed 100"` |
| API-WRL-010 | `per_page=0` returns 400 with `"invalid per_page value"` |
| API-WRL-011 | `per_page=-1` returns 400 with `"invalid per_page value"` |
| API-WRL-012 | `per_page=abc` returns 400 with `"invalid per_page value"` |
| API-WRL-013 | `page=2` with `per_page=10` and 25 runs returns runs 11–20 |
| API-WRL-014 | `page=3` with `per_page=10` and 25 runs returns runs 21–25 |
| API-WRL-015 | `page=4` with `per_page=10` and 25 runs returns empty array |
| API-WRL-016 | `page=0` returns 400 with `"invalid page value"` |
| API-WRL-017 | `page=-1` returns 400 with `"invalid page value"` |
| API-WRL-018 | `page=abc` returns 400 with `"invalid page value"` |
| API-WRL-019 | Cursor-based pagination: `cursor=0&limit=10` returns first 10 runs |
| API-WRL-020 | Cursor-based pagination: `cursor=10&limit=10` returns runs 11–20 |
| API-WRL-021 | `limit=200` is silently capped to 100 (returns at most 100 runs) |
| API-WRL-022 | When both `page`/`per_page` and `cursor`/`limit` are provided, page-based takes precedence |
| API-WRL-023 | `state=running` returns only running runs |
| API-WRL-024 | `state=queued` returns only queued/pending runs |
| API-WRL-025 | `state=success` returns only successful runs |
| API-WRL-026 | `state=failure` returns only failed runs |
| API-WRL-027 | `state=cancelled` returns only cancelled runs |
| API-WRL-028 | `state=finished` returns runs with status success, failure, or cancelled |
| API-WRL-029 | `state=completed` is treated as alias for success |
| API-WRL-030 | `state=failed` is treated as alias for failure |
| API-WRL-031 | `state=canceled` (American spelling) is treated as alias for cancelled |
| API-WRL-032 | `state=in_progress` is treated as alias for running |
| API-WRL-033 | `state=pending` is treated as alias for queued |
| API-WRL-034 | `state=terminal` is treated as alias for finished |
| API-WRL-035 | `state=` (empty string) returns all runs |
| API-WRL-036 | `state=nonexistent` returns empty array (no runs match) |
| API-WRL-037 | State filter combined with pagination: `state=success&page=1&per_page=5` |
| API-WRL-038 | Non-existent repository returns 404 |
| API-WRL-039 | Non-existent owner returns 404 |
| API-WRL-040 | Unauthenticated request to private repository returns 401 |
| API-WRL-041 | Authenticated user without repo access on private repo returns 403 |
| API-WRL-042 | Public repository is accessible without authentication |
| API-WRL-043 | Repository with 100 runs and `per_page=100` returns all 100 (maximum valid input size) |
| API-WRL-044 | Runs from multiple workflow definitions appear interleaved by creation order |
| API-WRL-045 | Run with `null` `started_at` (queued run) serializes correctly |
| API-WRL-046 | Run with `null` `completed_at` (running run) serializes correctly |
| API-WRL-047 | All `trigger_event` types are represented correctly: push, landing_request, manual, schedule, webhook, workflow_run |
| API-WRL-048 | All `status` values are represented correctly: success, failure, running, queued, cancelled, timeout |
| API-WRL-049 | Timestamps are in ISO 8601 format |
| API-WRL-050 | Legacy endpoint `GET /api/repos/:owner/:repo/actions/runs` returns same runs with `workflow_runs` key |
| API-WRL-051 | Owner and repo names with hyphens, underscores, and dots resolve correctly |
| API-WRL-052 | Concurrent requests to the same endpoint return consistent data |

### CLI Integration Tests

**File: `e2e/cli/workflow-runs-list.test.ts`**

| Test ID | Description |
|---------|-------------|
| CLI-WRL-001 | `codeplane run list --repo owner/repo` outputs a formatted table of runs |
| CLI-WRL-002 | `codeplane run list --repo owner/repo --json` outputs valid JSON matching the API response shape |
| CLI-WRL-003 | `codeplane run list --repo owner/repo --state running` filters to running runs only |
| CLI-WRL-004 | `codeplane run list --repo owner/repo --state finished` filters to terminal runs |
| CLI-WRL-005 | `codeplane run list` without `--repo` infers repository from current directory |
| CLI-WRL-006 | `codeplane run list --repo nonexistent/repo` exits with code 1 and error message |
| CLI-WRL-007 | Table output includes STATUS, ID, WORKFLOW, EVENT, REF, SHA, DURATION, AGE columns |
| CLI-WRL-008 | Empty repository shows informative message, not an error |

### TUI E2E Tests

**File: `e2e/tui/workflow-runs.test.ts`**

The full TUI test suite (138 tests) is defined in the TUI_WORKFLOW_RUN_LIST spec. Key representative tests:

| Test ID | Description |
|---------|-------------|
| TUI-WRL-001 | Run list screen renders with correct title, filter toolbar, and run rows |
| TUI-WRL-002 | Status icons render with correct colors (✓ green, ✗ red, ◎ yellow, ◌ cyan, ✕ gray) |
| TUI-WRL-003 | `j`/`k` navigation moves focus through run rows |
| TUI-WRL-004 | `Enter` on focused run navigates to run detail screen |
| TUI-WRL-005 | `f` cycles through status filters and triggers API request with `state` param |
| TUI-WRL-006 | `/` focuses search input; typing narrows results client-side |
| TUI-WRL-007 | Pagination loads next page on scroll to 80% of list |
| TUI-WRL-008 | Empty state displays "No runs found for this workflow." |
| TUI-WRL-009 | Filter empty state displays "No runs match the current filters." |
| TUI-WRL-010 | SSE subscription updates running run status inline |
| TUI-WRL-011 | Responsive layout at 80×24 shows minimal columns |
| TUI-WRL-012 | Responsive layout at 120×40 shows full column set |
| TUI-WRL-013 | `Ctrl+R` refreshes current page data |
| TUI-WRL-014 | 500-item memory cap stops further pagination with informative message |
| TUI-WRL-015 | Network error shows error state with retry prompt |

### Playwright (Web UI) E2E Tests

**File: `e2e/web/workflow-runs-list.test.ts`**

| Test ID | Description |
|---------|-------------|
| WEB-WRL-001 | Navigate to `/:owner/:repo/workflows` and see the run list table |
| WEB-WRL-002 | Run rows display status badge, run #, workflow name, trigger info, commit SHA, duration, and timestamp |
| WEB-WRL-003 | Clicking a run row navigates to the run detail page |
| WEB-WRL-004 | Status filter dropdown filters runs by status |
| WEB-WRL-005 | "Finished" filter shows success + failure + cancelled runs |
| WEB-WRL-006 | Pagination controls load additional pages |
| WEB-WRL-007 | Empty repository shows empty state message |
| WEB-WRL-008 | Running runs display animated spinner badge |
| WEB-WRL-009 | Private repo without access shows 403 message |
| WEB-WRL-010 | Page renders correctly when workflow definition has been deleted (empty workflow name) |

All tests are left failing if the backend is unimplemented — never skipped or commented out.

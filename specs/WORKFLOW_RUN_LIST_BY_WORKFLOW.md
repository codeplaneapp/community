# WORKFLOW_RUN_LIST_BY_WORKFLOW

Specification for WORKFLOW_RUN_LIST_BY_WORKFLOW.

## High-Level User POV

When a developer selects a specific workflow definition — such as "ci", "deploy", or "tests" — they need to see all the execution runs that belong to that workflow, ordered from newest to oldest. This is the primary way to understand whether a particular pipeline is healthy, identify which run broke something, and decide whether to rerun, cancel, or resume a failed execution.

The experience works identically across every Codeplane surface. In the web UI, navigating into a workflow definition page reveals a list of that workflow's runs. In the TUI, pressing Enter on a focused workflow definition transitions to a dedicated run list screen filtered to that workflow. In the CLI, running `codeplane run list --workflow <name-or-id>` outputs only runs belonging to that workflow rather than every run in the repository. Each surface shows the same core information per run: execution status, run number, what triggered the run, which bookmark or change it was triggered against, the abbreviated commit SHA, how long it took, and when it was created.

Users can filter the run list by status — showing only running, queued, successful, failed, cancelled, or all terminal-state runs — so they can quickly find the run they care about in a busy pipeline. Pagination keeps the list performant even for workflows with thousands of historical runs.

From any run in the list, users can drill into the run detail to see step-by-step execution, or take immediate action: cancel a running or queued run, rerun a completed run, or resume a failed or cancelled one. These actions respect the user's permissions and provide clear feedback when they succeed or fail.

This feature is the bridge between "I have a workflow" and "I understand what it has been doing." Without it, users would have to scan every run across all workflows in the repository to find the one they care about — a frustrating and slow experience for any team with more than one or two workflows defined.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/workflows/:id/runs` returns a paginated list of workflow runs belonging exclusively to the specified workflow definition
- [ ] The response shape is `{ workflow_runs: WorkflowRun[] }` where each `WorkflowRun` includes `id`, `repository_id`, `workflow_definition_id`, `status`, `trigger_event`, `trigger_ref`, `trigger_commit_sha`, `started_at`, `completed_at`, `created_at`, and `updated_at`
- [ ] Runs are sorted by `created_at` descending (newest first)
- [ ] Page-based pagination is supported via `page` (default: 1) and `per_page` (default: 30, max: 100) query parameters
- [ ] Cursor-based pagination is also supported via `limit` and `cursor` query parameters
- [ ] If the workflow definition ID does not exist for the given repository, the endpoint returns `404` with `{ "message": "workflow definition not found" }`
- [ ] If the workflow definition ID is not a positive integer, the endpoint returns `400` with `{ "message": "invalid workflow id" }`
- [ ] The v2 endpoint `GET /api/repos/:owner/:repo/workflows/runs` supports an optional `definition_id` query parameter to filter runs by workflow definition, returning enriched runs with `workflow_name` and `workflow_path` fields
- [ ] The CLI command `codeplane run list` supports a `--workflow` option to filter runs by workflow name, path, or numeric ID
- [ ] The web UI workflow detail page displays the run list for the selected workflow
- [ ] The TUI Workflow Run List screen is reachable from the Workflow List screen and shows runs for the selected workflow definition
- [ ] All clients display runs consistently: status icon, run ID, trigger event, trigger ref, commit SHA, duration, and timestamp

### Boundary Constraints

- [ ] `page` query parameter must be a positive integer (≥ 1); non-numeric or ≤ 0 values return `400`
- [ ] `per_page` query parameter must be a positive integer between 1 and 100 inclusive; values > 100 return `400`
- [ ] `cursor` query parameter must be a non-negative integer; negative values are ignored (treated as 0)
- [ ] Workflow definition `:id` must be a positive integer; values like `0`, `-1`, `abc`, empty string, or `NaN` return `400`
- [ ] Empty result sets return `{ "workflow_runs": [] }` with status `200`, not `404`
- [ ] Maximum 100 runs per page (enforced server-side regardless of client request)
- [ ] Clients enforce a memory cap of 500 runs (TUI) to prevent excessive memory use
- [ ] Trigger ref strings can contain UTF-8 characters including unicode and emoji; clients must handle truncation at grapheme boundaries
- [ ] Commit SHA is always truncated to 7 characters for display; null SHA renders as "—"
- [ ] Duration is computed from `started_at` to `completed_at` (or current time if `completed_at` is null); null `started_at` renders as "—"

### Edge Cases

- [ ] Workflow with zero runs: returns empty array, clients show appropriate empty state
- [ ] Workflow with exactly one run: renders single-row list with no pagination controls
- [ ] Deleted or archived workflow: if the definition ID no longer exists, returns `404`
- [ ] Run with null `trigger_ref`, null `trigger_commit_sha`, or null `started_at`: each field renders as "—" in clients
- [ ] Concurrent runs (multiple runs with `running` status): all shown, each with its own live duration timer
- [ ] Run status transitions during viewing: SSE-connected clients update inline; non-SSE clients require manual refresh
- [ ] Duplicate `per_page` and `limit` parameters in same request: `page`/`per_page` takes precedence over `cursor`/`limit`
- [ ] Non-existent `page` beyond available data: returns empty array, not an error
- [ ] Unicode/emoji in trigger ref values: displayed correctly, truncated at grapheme cluster boundaries
- [ ] Very large run IDs (up to 2^53 - 1): displayed as `#N` format, max 10 characters

## Design

### API Shape

#### Primary endpoint — List runs by workflow definition

```
GET /api/repos/:owner/:repo/workflows/:id/runs
```

**Path parameters:**
- `owner` — Repository owner (user or organization)
- `repo` — Repository name
- `id` — Workflow definition numeric ID (positive integer)

**Query parameters:**
- `page` (optional, default: 1) — Page number for pagination
- `per_page` (optional, default: 30, max: 100) — Results per page
- `limit` (optional) — Alternative to `per_page` for cursor-based pagination
- `cursor` (optional) — Cursor offset for cursor-based pagination
- `state` (optional) — Filter by run status: `running`, `queued`, `success`, `failure`, `cancelled`, `finished` (composite: success + failure + cancelled)

**Response — 200 OK:**
```json
{
  "workflow_runs": [
    {
      "id": 1047,
      "repository_id": 42,
      "workflow_definition_id": 5,
      "status": "success",
      "trigger_event": "push",
      "trigger_ref": "main",
      "trigger_commit_sha": "a3f8c21d4e56b7e2d09c1d4e56f2c8b67e9f1a23",
      "started_at": "2026-03-22T10:00:00Z",
      "completed_at": "2026-03-22T10:01:05Z",
      "created_at": "2026-03-22T09:59:58Z",
      "updated_at": "2026-03-22T10:01:05Z"
    }
  ]
}
```

**Response — 400 Bad Request:** `{ "message": "invalid workflow id" }` or `{ "message": "invalid page value" }`

**Response — 404 Not Found:** `{ "message": "workflow definition not found" }`

#### V2 enriched endpoint — List runs with definition_id filter

```
GET /api/repos/:owner/:repo/workflows/runs?definition_id=5&state=running
```

When `definition_id` is provided, the endpoint filters runs to those belonging to the specified workflow definition. The response includes enriched fields `workflow_name` and `workflow_path` on each run.

### SDK Shape

The `@codeplane/sdk` `WorkflowService` exposes:

```typescript
listWorkflowRunsByDefinition(
  repositoryId: string,
  definitionId: string,
  page: number,
  perPage: number
): Promise<Result<WorkflowRun[]>>
```

The `@codeplane/ui-core` data hook:

```typescript
useWorkflowRuns(params: {
  owner: string;
  repo: string;
  definitionId?: number;
  state?: string;
  page?: number;
  perPage?: number;
}): {
  runs: WorkflowRun[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}
```

When `definitionId` is provided, the hook calls `GET /api/repos/:owner/:repo/workflows/runs?definition_id=:id&page=N&per_page=30&state=:state`. When omitted, it fetches all runs for the repository.

### CLI Command

```
codeplane run list [OPTIONS]
```

**Options:**
- `--repo, -R <OWNER/REPO>` — Repository (inferred from current directory if omitted)
- `--workflow, -w <NAME_OR_ID>` — Filter by workflow name, path stem, or numeric ID
- `--state, -s <STATE>` — Filter by status (running, queued, success, failure, cancelled, finished)
- `--page <N>` — Page number (default: 1)
- `--limit <N>` — Results per page (default: 30, max: 100)
- `--json` — Output as JSON (supports field filtering via `--json .runs[].id`)

**Example output (table format):**
```
STATUS  ID      WORKFLOW  EVENT     REF          SHA       DURATION  CREATED
✓       #1047   ci        push      main         a3f8c21   1m 5s     3h ago
✗       #1046   ci        push      feat/auth    b7e2d09   45s       5h ago
◎       #1045   ci        manual    main         c1d4e56   12s       8m ago
```

When `--workflow` is provided, the CLI resolves the identifier using the same matching logic as the server (exact numeric ID, case-insensitive name match, or path stem match). It then calls the v1 endpoint `GET /api/repos/:owner/:repo/workflows/:id/runs`. When `--workflow` is omitted, it calls the v2 endpoint and shows all runs.

### Web UI Design

The Workflow Detail page (`/:owner/:repo/workflows/:id`) includes a "Runs" tab as the primary view. This tab shows:

1. **Header**: "{workflow_name} › Runs ({total_count})"
2. **Filter bar**: Status filter dropdown (All, Running, Queued, Success, Failure, Cancelled, Finished) and a search input for client-side filtering by trigger ref or commit SHA
3. **Run table**: Columns — Status icon (✓ green, ✗ red, ● yellow animated, ○ blue, ✕ gray), Run ID as `#N` (links to run detail), Trigger event, Trigger ref, Commit SHA (7-char abbreviated, monospace), Duration (live-updating for running runs), Created timestamp (relative)
4. **Pagination**: Page controls at the bottom with page size selector (10, 30, 50, 100)
5. **Empty state**: "No workflow runs found. Trigger a run or push a change to get started."
6. **Error state**: Retry button with error message

Row actions (accessible via context menu or hover actions): Cancel (running/queued), Rerun (terminal-state), Resume (failed/cancelled), View details (all).

### TUI UI

The TUI Workflow Run List screen is fully specified in `specs/tui/TUI_WORKFLOW_RUN_LIST.md`. Key design elements:

- Full-screen view between header and status bars
- Breadcrumb: "Dashboard > owner/repo > Workflows > {name} > Runs"
- Status filter cycling via `f` key
- Client-side search via `/` key
- vim-style navigation (j/k/G/gg)
- Run actions via keyboard (c=cancel, r=rerun, m=resume)
- Responsive column layout across 80×24, 120×40, and 200×60+ breakpoints
- Animated spinner for running runs
- SSE subscription for real-time status transitions
- 500-run memory cap with pagination

### Neovim Plugin API

- `:Codeplane workflow-runs <name>` command — Opens a picker with runs for the specified workflow
- Telescope integration for fuzzy-finding runs within a workflow
- Statusline indicator showing the latest run status for the current repository's default workflow

### Documentation

End-user documentation should cover:

1. **Viewing workflow runs** — How to navigate to a specific workflow's run history from the web UI, CLI, TUI, and editors
2. **Filtering runs by status** — Explanation of each status value and the composite "finished" filter
3. **Run actions** — How to cancel, rerun, and resume runs with required permissions
4. **CLI reference** — Full `codeplane run list` command documentation with examples
5. **API reference** — `GET /api/repos/:owner/:repo/workflows/:id/runs` endpoint documentation with request/response schemas
6. **Troubleshooting** — Common issues (empty run list, permission errors, rate limiting) and their solutions

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| List runs (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| List runs (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cancel run | ❌ | ❌ | ✅ | ✅ | ✅ |
| Rerun | ❌ | ❌ | ✅ | ✅ | ✅ |
| Resume run | ❌ | ❌ | ✅ | ✅ | ✅ |

- Repository visibility determines whether anonymous/unauthenticated users can access the run list
- The endpoint resolves repository access through the standard `resolveRepoId` flow, which checks the user's access level against the repository
- Private repository access requires at least read access to the repository
- Write actions (cancel, rerun, resume) require write access. Read-only users see the run list but receive `403` when attempting actions
- Deploy key access follows the same rules as repository access — read-only deploy keys can list runs but cannot take actions

### Rate Limiting

- `GET /api/repos/:owner/:repo/workflows/:id/runs` — 300 requests/minute per authenticated user, 60 requests/minute per anonymous user (public repos only)
- `POST` action endpoints (cancel, rerun, resume) — 60 requests/minute per authenticated user
- Rate limit responses return `429 Too Many Requests` with `Retry-After` header
- SSE connections for real-time updates are limited to 10 concurrent connections per user

### Data Privacy

- Workflow run data does not contain PII beyond the triggering user's identity (via `trigger_ref` if it contains a username-based bookmark)
- Commit SHAs are public data within the repository's visibility scope
- `dispatch_inputs` (if present in the run record) may contain user-provided values and should not be exposed in the list endpoint response — only in the detail endpoint for authorized users
- Agent tokens (`agent_token_hash`, `agent_token_expires_at`) are never exposed in any API response
- Run log contents are not included in the list response; they are only accessible through the dedicated log streaming endpoint

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workflow_runs.list_viewed` | User loads run list for a workflow | `repo_id`, `owner`, `repo`, `workflow_id`, `workflow_name`, `total_count`, `status_filter`, `page`, `per_page`, `client` (web/cli/tui/editor), `load_time_ms` |
| `workflow_runs.filtered` | User applies or changes a status filter | `repo_id`, `workflow_id`, `previous_filter`, `new_filter`, `result_count`, `client` |
| `workflow_runs.run_opened` | User navigates from list to run detail | `repo_id`, `workflow_id`, `run_id`, `run_status`, `trigger_event`, `position_in_list`, `client` |
| `workflow_runs.paginated` | User loads next/previous page | `repo_id`, `workflow_id`, `page`, `total_loaded`, `client` |
| `workflow_runs.run_cancelled` | User cancels a run from the list | `repo_id`, `workflow_id`, `run_id`, `run_status_before`, `success`, `error_code`, `client` |
| `workflow_runs.run_rerun` | User reruns a run from the list | `repo_id`, `workflow_id`, `run_id`, `original_status`, `new_run_id`, `success`, `client` |
| `workflow_runs.run_resumed` | User resumes a run from the list | `repo_id`, `workflow_id`, `run_id`, `run_status_before`, `success`, `client` |
| `workflow_runs.action_denied` | User receives 403 on an action attempt | `repo_id`, `workflow_id`, `run_id`, `action_type`, `client` |
| `workflow_runs.error` | API request fails | `repo_id`, `workflow_id`, `error_type`, `http_status`, `endpoint`, `client` |

### Common Properties (all events)

- `session_id` — User session identifier
- `timestamp` — ISO 8601 timestamp
- `user_id` — Authenticated user ID (null for anonymous)
- `client` — Surface (`web`, `cli`, `tui`, `vscode`, `neovim`, `desktop`)
- `client_version` — Client version string

### Success Indicators

| Metric | Target | Interpretation |
|--------|--------|----------------|
| List load completion rate | > 98% | Users successfully see the run list |
| Run detail drill-through rate | > 50% | Users find the list useful for navigating to runs |
| Filter adoption rate | > 25% | Users use status filters to narrow results |
| Action success rate (cancel/rerun/resume) | > 95% | Actions complete without errors |
| P95 load time | < 500ms | List loads quickly for typical workflow sizes |
| Error rate | < 2% | API errors are rare |
| Return visit rate (same workflow within 24h) | > 40% | Users come back to monitor their workflows |

## Observability

### Logging Requirements

**Server-side (API layer):**

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Run list request received | `repo_id`, `workflow_id`, `page`, `per_page`, `state_filter`, `request_id` |
| `debug` | Run list query executed | `repo_id`, `workflow_id`, `result_count`, `query_duration_ms`, `request_id` |
| `info` | Run list served successfully | `repo_id`, `workflow_id`, `result_count`, `total_duration_ms`, `request_id`, `user_id` |
| `warn` | Workflow definition not found | `repo_id`, `workflow_id_requested`, `request_id`, `user_id` |
| `warn` | Invalid pagination parameters | `repo_id`, `raw_page`, `raw_per_page`, `error`, `request_id` |
| `warn` | Rate limited | `user_id`, `endpoint`, `retry_after_s`, `request_id` |
| `error` | Database query failed | `repo_id`, `workflow_id`, `error_message`, `error_code`, `request_id` |
| `error` | Repository resolution failed | `owner`, `repo`, `error_message`, `request_id` |

**Client-side (Web/TUI/CLI):**

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Component mounted / screen entered | `repo`, `workflow_id`, `workflow_name`, `client` |
| `debug` | Data fetched | `repo`, `workflow_id`, `count`, `duration_ms`, `page` |
| `info` | User navigated to run detail | `repo`, `workflow_id`, `run_id` |
| `info` | User performed action | `repo`, `run_id`, `action`, `result` |
| `warn` | Fetch failed (non-fatal) | `repo`, `workflow_id`, `http_status`, `error` |
| `warn` | Slow load (> 3s) | `repo`, `workflow_id`, `duration_ms` |
| `error` | Auth error (401) | `repo`, `endpoint` |
| `error` | Render/display error | `repo`, `error_message`, `component` |

### Prometheus Metrics

**Counters:**
- `codeplane_workflow_run_list_requests_total{owner, repo, status_code}` — Total requests to the run list endpoint
- `codeplane_workflow_run_list_errors_total{owner, repo, error_type}` — Total errors (db_error, not_found, invalid_params, rate_limited)

**Histograms:**
- `codeplane_workflow_run_list_duration_seconds{owner, repo}` — Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
- `codeplane_workflow_run_list_result_count{owner, repo}` — Number of runs returned per request (buckets: 0, 1, 5, 10, 30, 50, 100)

**Gauges:**
- `codeplane_workflow_run_list_active_sse_connections` — Number of active SSE connections for workflow run status updates

### Alerts

#### Alert: High Error Rate on Workflow Run List

**Condition:** `rate(codeplane_workflow_run_list_errors_total{error_type!="not_found"}[5m]) / rate(codeplane_workflow_run_list_requests_total[5m]) > 0.05`

**Severity:** Warning (> 5%), Critical (> 15%)

**Runbook:**
1. Check `codeplane_workflow_run_list_errors_total` by `error_type` to identify the dominant failure mode
2. If `db_error` dominates: check database connectivity and query performance. Run `SELECT 1` against the database. Check for table locks or long-running queries against `workflow_runs`. Inspect server logs for specific SQL errors with `grep "workflow_run_list" /var/log/codeplane/server.log | grep ERROR`
3. If `rate_limited` dominates: identify the user(s) causing excessive requests from rate limiter logs. Consider whether the rate limit threshold needs adjustment
4. If `invalid_params` dominates: check whether a client version is sending malformed requests. Inspect request logs for the `request_id` values associated with these errors
5. Verify the issue is not caused by a deploy (check recent deployments and whether error rate correlates with deploy timestamp)
6. If the issue resolves within 5 minutes of investigation, mark as transient. Otherwise, escalate to the workflows team

#### Alert: High Latency on Workflow Run List

**Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_run_list_duration_seconds_bucket[5m])) > 2.0`

**Severity:** Warning (> 2s P95), Critical (> 5s P95)

**Runbook:**
1. Check whether the latency spike correlates with increased traffic or a specific repository
2. Inspect database query performance: check for missing indexes on `workflow_runs(workflow_definition_id, repository_id, created_at DESC)`
3. Check if the `listWorkflowDefinitions` call in the v2 endpoint (used for enrichment) is slow — this fetches up to 1000 definitions per request
4. Profile the endpoint using request tracing for a sample of slow requests
5. If a single repository has an extremely large number of runs (> 100k), consider adding query optimization or result caching
6. Verify database connection pool is not exhausted (`pg_stat_activity` for active connections)

#### Alert: Workflow Definition Not Found Spike

**Condition:** `rate(codeplane_workflow_run_list_errors_total{error_type="not_found"}[5m]) > 10`

**Severity:** Warning

**Runbook:**
1. This typically indicates clients referencing deleted workflow definitions or using stale definition IDs
2. Check whether a recent bulk workflow definition deletion occurred
3. Inspect the `workflow_id_requested` values in warn-level logs to identify the most common missing IDs
4. If a specific client version is causing the spike, coordinate a client update
5. No immediate action required unless the rate persists for > 1 hour, in which case investigate the source of stale references

### Error Cases and Failure Modes

| Error | HTTP Status | Behavior | Recovery |
|-------|-------------|----------|----------|
| Invalid workflow ID format | 400 | Immediate rejection | Fix client request |
| Invalid pagination params | 400 | Immediate rejection | Fix client request |
| Workflow definition not found | 404 | Returns error message | Verify definition ID exists |
| Repository not found | 404 (from resolveRepoId) | Returns error message | Verify owner/repo |
| Unauthorized (no auth) | 401 | Returns auth error | Authenticate |
| Forbidden (private repo, no access) | 403 | Returns permission error | Request repo access |
| Rate limited | 429 | Returns Retry-After header | Wait and retry |
| Database connection failure | 500 | Server error | Check DB connectivity, retry |
| Database query timeout | 500 | Server error | Check query performance, add indexes |
| Service registry unavailable | 500 | Server error | Check server startup, restart |

## Verification

### API Integration Tests (`e2e/api/workflow-runs.test.ts`)

#### Happy Path

- **API-WFR-001**: `GET /api/repos/:owner/:repo/workflows/:id/runs` returns 200 with `workflow_runs` array for a workflow with runs
- **API-WFR-002**: Response runs are sorted by `created_at` descending (newest first)
- **API-WFR-003**: Each run in response contains all required fields (`id`, `repository_id`, `workflow_definition_id`, `status`, `trigger_event`, `trigger_ref`, `trigger_commit_sha`, `started_at`, `completed_at`, `created_at`, `updated_at`)
- **API-WFR-004**: All returned runs have `workflow_definition_id` matching the requested `:id`
- **API-WFR-005**: Default pagination returns at most 30 runs
- **API-WFR-006**: `per_page=10` returns at most 10 runs
- **API-WFR-007**: `per_page=100` (maximum) returns at most 100 runs
- **API-WFR-008**: `page=2&per_page=10` returns the second page of 10 results
- **API-WFR-009**: Cursor-based pagination via `limit=10&cursor=10` returns the correct offset
- **API-WFR-010**: Workflow with zero runs returns `{ "workflow_runs": [] }` with status 200

#### State Filtering (v2 endpoint)

- **API-WFR-011**: `GET /api/repos/:owner/:repo/workflows/runs?definition_id=:id` filters runs to the specified workflow
- **API-WFR-012**: `state=running` returns only runs with status "running"
- **API-WFR-013**: `state=queued` returns only runs with status "queued"
- **API-WFR-014**: `state=success` returns only runs with status "success"
- **API-WFR-015**: `state=failure` returns only runs with status "failure" or "failed"
- **API-WFR-016**: `state=cancelled` returns only runs with status "cancelled"
- **API-WFR-017**: `state=finished` returns runs with status "success", "failure", or "cancelled"
- **API-WFR-018**: `definition_id=:id&state=running` composes both filters correctly
- **API-WFR-019**: State normalization works: `state=completed` → success, `state=failed` → failure, `state=pending` → queued, `state=in_progress` → running, `state=canceled` → cancelled
- **API-WFR-020**: Enriched response includes `workflow_name` and `workflow_path` fields

#### Error Handling

- **API-WFR-021**: Invalid workflow ID `abc` returns 400 with `{ "message": "invalid workflow id" }`
- **API-WFR-022**: Workflow ID `0` returns 400
- **API-WFR-023**: Workflow ID `-1` returns 400
- **API-WFR-024**: Non-existent workflow ID returns 404 with `{ "message": "workflow definition not found" }`
- **API-WFR-025**: Non-existent repository returns 404
- **API-WFR-026**: `page=0` returns 400 with `{ "message": "invalid page value" }`
- **API-WFR-027**: `page=-1` returns 400
- **API-WFR-028**: `page=abc` returns 400
- **API-WFR-029**: `per_page=0` returns 400
- **API-WFR-030**: `per_page=101` returns 400 with `{ "message": "per_page must not exceed 100" }`
- **API-WFR-031**: `per_page=-1` returns 400
- **API-WFR-032**: `per_page=abc` returns 400
- **API-WFR-033**: Page beyond available data returns `{ "workflow_runs": [] }` with status 200

#### Auth & Permissions

- **API-WFR-034**: Unauthenticated request to public repo returns 200
- **API-WFR-035**: Unauthenticated request to private repo returns 401 or 404 (repo not visible)
- **API-WFR-036**: Read-only user can list runs on private repo
- **API-WFR-037**: Write user can list runs on private repo
- **API-WFR-038**: Admin user can list runs on private repo

#### Boundary Tests

- **API-WFR-039**: `per_page=100` (maximum valid) returns up to 100 results correctly
- **API-WFR-040**: `per_page=101` (exceeds maximum) returns 400
- **API-WFR-041**: `page=999999` (very large page) returns empty array without error
- **API-WFR-042**: Workflow definition with exactly 100 runs and `per_page=100` returns all in one page
- **API-WFR-043**: Workflow definition with 101 runs and `per_page=100` returns 100 on page 1 and 1 on page 2
- **API-WFR-044**: Response for a run with the maximum valid `trigger_ref` length (255 chars) includes the full value

### CLI Integration Tests (`e2e/cli/workflow-runs.test.ts`)

- **CLI-WFR-001**: `codeplane run list --repo owner/repo --workflow ci` outputs runs for the "ci" workflow
- **CLI-WFR-002**: `codeplane run list --repo owner/repo --workflow 5` resolves by numeric workflow ID
- **CLI-WFR-003**: `codeplane run list --repo owner/repo --workflow ci.ts` resolves by path stem
- **CLI-WFR-004**: `codeplane run list --repo owner/repo --workflow nonexistent` outputs error message
- **CLI-WFR-005**: `codeplane run list --repo owner/repo` (without `--workflow`) lists all runs
- **CLI-WFR-006**: `codeplane run list --repo owner/repo --workflow ci --json` outputs valid JSON
- **CLI-WFR-007**: `codeplane run list --repo owner/repo --workflow ci --state running` filters by status
- **CLI-WFR-008**: `codeplane run list --repo owner/repo --workflow ci --limit 5` limits output to 5 runs
- **CLI-WFR-009**: Table output includes STATUS, ID, EVENT, REF, SHA, DURATION, CREATED columns
- **CLI-WFR-010**: Run with null started_at shows "—" for duration in table output

### Web UI E2E Tests (`e2e/web/workflow-runs.test.ts` — Playwright)

- **WEB-WFR-001**: Navigating to `/:owner/:repo/workflows/:id` shows the run list for that workflow
- **WEB-WFR-002**: Run list header shows "{workflow_name} › Runs ({count})"
- **WEB-WFR-003**: Each run row displays status icon, ID, trigger event, trigger ref, SHA, duration, and timestamp
- **WEB-WFR-004**: Clicking a run row navigates to the run detail page
- **WEB-WFR-005**: Status filter dropdown filters the visible runs
- **WEB-WFR-006**: Selecting "Running" filter shows only running runs
- **WEB-WFR-007**: Selecting "All" filter shows all runs
- **WEB-WFR-008**: Empty workflow shows "No workflow runs found" message
- **WEB-WFR-009**: Pagination controls navigate between pages
- **WEB-WFR-010**: Cancel button on a running run triggers cancel action and updates UI
- **WEB-WFR-011**: Rerun button on a failed run triggers rerun action
- **WEB-WFR-012**: Cancel button is not shown for completed runs
- **WEB-WFR-013**: Read-only user sees run list but action buttons are disabled
- **WEB-WFR-014**: Non-existent workflow ID shows 404 page
- **WEB-WFR-015**: Running run shows animated status indicator
- **WEB-WFR-016**: Duration updates live for running runs (check after 2-second wait)

### TUI E2E Tests (`e2e/tui/workflow-runs.test.ts`)

The TUI tests are comprehensively defined in the TUI spec (138 tests total across 4 categories):

- **Terminal snapshot tests** (32 tests, SNAP-WFR-001 through SNAP-WFR-032): Layout verification at each breakpoint (80×24, 120×40, 200×60), status icons and colors, column formatting, empty/error/loading states, breadcrumb, header count, pagination cap message
- **Keyboard interaction tests** (50 tests, KEY-WFR-001 through KEY-WFR-050): j/k/Down/Up navigation, Enter opens detail, / search focusing, Esc context priority, G/gg jump, Ctrl+D/U page navigation, R retry, Ctrl+R refresh, f filter cycling, c cancel, r rerun, m resume, input mode isolation, pagination on scroll, rapid keypresses, filter+search composition
- **Responsive tests** (16 tests, RESP-WFR-001 through RESP-WFR-016): 80×24 compact layout, 120×40 standard layout, 200×60 full layout, resize between breakpoints, focus preservation, search input resize, spinner animation during resize
- **Integration tests** (25 tests, INT-WFR-001 through INT-WFR-025): Auth expiry, rate limiting, network errors, pagination cap, navigation round-trips, cancel/rerun/resume success and failure, permission denied, SSE real-time updates, deep link launch, null field handling, state filter API verification
- **Edge case tests** (15 tests, EDGE-WFR-001 through EDGE-WFR-015): No auth token, long/unicode trigger refs, single run, concurrent resize+navigation, search no matches, all cancelled runs, rapid action presses, network disconnect mid-pagination, run ID boundary, duration timer across midnight, SSE event for off-page run

All 138 TUI tests left failing if backend is unimplemented — never skipped or commented out.

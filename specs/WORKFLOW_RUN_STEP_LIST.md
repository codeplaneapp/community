# WORKFLOW_RUN_STEP_LIST

Specification for WORKFLOW_RUN_STEP_LIST.

## High-Level User POV

When a workflow run executes in Codeplane, it progresses through a series of discrete steps — build, test, deploy, lint, or any other named stage defined in the workflow. The Workflow Run Step List feature gives users a clear, ordered view of every step within a specific workflow run, showing what has completed, what is currently executing, and what is still queued.

A developer navigating to a workflow run's detail page immediately sees a step-by-step breakdown of the run's execution. Each step displays its name, its current status (queued, running, success, failure, cancelled), and its timing information — when it started, when it completed, and how long it took. Steps are shown in execution order, so the user can trace the pipeline from start to finish and immediately identify where a failure occurred or where a run is currently stuck.

From the CLI, `codeplane workflow run steps <run-id>` returns the same ordered step breakdown in a table or JSON format, making it easy for scripts and automation to programmatically inspect the progress of a run, gate on specific step outcomes, or report step-level status to other systems. From the TUI, the workflow run detail screen embeds the step list as its primary content, with inline expand-to-logs capability for each step.

This feature is the primary drill-down from the workflow run list. Where the run list answers "which runs succeeded or failed?", the step list answers "where in the pipeline did things go right or wrong, and how long did each stage take?" It is a read-only view — actions like cancellation, rerun, or resume operate at the run level and are covered by their own feature specs.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/actions/runs/:id/steps` returns an ordered list of all steps for the specified workflow run
- [ ] Each step in the response includes `id`, `workflow_run_id`, `name`, `position`, `status`, `started_at`, `completed_at`, `created_at`, `updated_at`
- [ ] The response body uses the key `steps` containing an array of step objects
- [ ] Steps are ordered by `position` ascending (execution order)
- [ ] The CLI command `codeplane workflow run steps <run-id>` returns the same data in table and JSON formats
- [ ] The web UI workflow run detail page displays the step list with status badges and timing
- [ ] The TUI workflow run detail screen displays the step list with inline status and expand-to-logs affordance
- [ ] All clients display consistent data sourced from the same API

### Response Shape Constraints

- [ ] `id`: positive integer, unique per step
- [ ] `workflow_run_id`: positive integer, matches the requested run ID
- [ ] `name`: non-empty string, the step's declared name from the workflow definition (max 255 characters)
- [ ] `position`: non-negative integer, sequential position within the run
- [ ] `status`: string, one of `queued`, `running`, `success`, `failure`, `cancelled`, `timeout`
- [ ] `started_at`: ISO 8601 timestamp string or `null` (if step has not started)
- [ ] `completed_at`: ISO 8601 timestamp string or `null` (if step is not complete)
- [ ] `created_at`: ISO 8601 timestamp string, always present
- [ ] `updated_at`: ISO 8601 timestamp string, always present

### Input Validation

- [ ] Run ID must be a positive int64; non-positive, non-numeric, or empty values return 400 with `"invalid run id"`
- [ ] Run IDs larger than int64 max (9223372036854775807) return 400
- [ ] Run ID `0` returns 400
- [ ] Float run IDs (e.g., `1.5`) return 400
- [ ] The owner and repo path parameters must resolve to a valid repository; otherwise 404
- [ ] The run must belong to the resolved repository; otherwise 404

### Edge Cases

- [ ] Workflow run with zero steps returns `{ "steps": [] }` with 200 status
- [ ] Workflow run with a single step returns a one-element array
- [ ] Workflow run with 100+ steps returns all steps in position order
- [ ] Step names containing special characters (hyphens, underscores, dots, spaces, unicode) are preserved exactly
- [ ] Duplicate step names within the same run are allowed (each has a unique `id` and `position`)
- [ ] Step with `status=queued` has `null` for both `started_at` and `completed_at`
- [ ] Step with `status=running` has a non-null `started_at` and `null` `completed_at`
- [ ] Step with a terminal status (`success`, `failure`, `cancelled`, `timeout`) has non-null `started_at` and `completed_at`
- [ ] Steps that were resumed (reset from `failure`/`cancelled` back to `queued`) correctly show `null` for `started_at` and `completed_at`
- [ ] Non-existent run ID returns 404 with `"workflow run not found"`
- [ ] Non-existent repository returns 404
- [ ] Owner or repo names containing special characters (hyphens, underscores, dots) resolve correctly
- [ ] Requesting steps for a run that belongs to a different repository returns 404

## Design

### API Shape

**Primary Endpoint**

```
GET /api/repos/:owner/:repo/actions/runs/:id/steps
```

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `owner` | string | Valid owner name | Repository owner |
| `repo` | string | Valid repository name | Repository name |
| `id` | integer | Positive int64 | Workflow run ID |

**Response (200 OK):**

```json
{
  "steps": [
    {
      "id": 301,
      "workflow_run_id": 1047,
      "name": "install-dependencies",
      "position": 1,
      "status": "success",
      "started_at": "2026-03-22T10:15:30.000Z",
      "completed_at": "2026-03-22T10:15:45.000Z",
      "created_at": "2026-03-22T10:15:28.000Z",
      "updated_at": "2026-03-22T10:15:45.000Z"
    },
    {
      "id": 302,
      "workflow_run_id": 1047,
      "name": "build",
      "position": 2,
      "status": "success",
      "started_at": "2026-03-22T10:15:46.000Z",
      "completed_at": "2026-03-22T10:16:10.000Z",
      "created_at": "2026-03-22T10:15:28.000Z",
      "updated_at": "2026-03-22T10:16:10.000Z"
    },
    {
      "id": 303,
      "workflow_run_id": 1047,
      "name": "test",
      "position": 3,
      "status": "running",
      "started_at": "2026-03-22T10:16:11.000Z",
      "completed_at": null,
      "created_at": "2026-03-22T10:15:28.000Z",
      "updated_at": "2026-03-22T10:16:11.000Z"
    },
    {
      "id": 304,
      "workflow_run_id": 1047,
      "name": "deploy",
      "position": 4,
      "status": "queued",
      "started_at": null,
      "completed_at": null,
      "created_at": "2026-03-22T10:15:28.000Z",
      "updated_at": "2026-03-22T10:15:28.000Z"
    }
  ]
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|----------|
| 400 | `{ "message": "invalid run id" }` | Non-positive, non-numeric, overflow, or float `id` |
| 401 | `{ "message": "unauthorized" }` | Missing or invalid authentication |
| 403 | `{ "message": "forbidden" }` | Insufficient repository access |
| 404 | `{ "message": "repository not found" }` | Owner or repo does not exist |
| 404 | `{ "message": "workflow run not found" }` | Run does not exist or does not belong to this repository |

**Related Endpoints (consume step data internally):**

The v2 run detail endpoint `GET /api/repos/:owner/:repo/workflows/runs/:id` returns an enriched response containing `nodes` (derived from steps with computed `duration` and `duration_seconds`) alongside `mermaid` graph and `plan_xml` representations. The node detail endpoint `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` returns a single step's detail with associated logs. These endpoints complement the step list endpoint by providing richer per-step context.

### SDK Shape

The `WorkflowService` in `@codeplane/sdk` exposes:

```typescript
listWorkflowSteps(
  runId: string
): Promise<
  Result<
    Array<{
      id: number;
      workflow_run_id: number;
      name: string;
      position: number;
      status: string;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
    }>,
    APIError
  >
>
```

This method delegates to the generated SQL query `listWorkflowStepsByRunID`, which selects from `workflow_steps WHERE workflow_run_id = $1 ORDER BY position`. Rows are mapped with `toISO()` normalization on all timestamp fields.

The route layer performs repository authorization and run-to-repository ownership validation before calling this service method.

### CLI Command

```
codeplane workflow run steps <run-id> [--repo OWNER/REPO] [--json]
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `<run-id>` | integer | Yes | The workflow run ID to list steps for |

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | (inferred) | Target repository. If omitted, inferred from the current working directory's jj/git remote. |
| `--json` | boolean | false | Output raw JSON from the API response |

**Table output (default):**

```
STEP  NAME                  STATUS   STARTED               DURATION
#1    install-dependencies  ✓        2026-03-22 10:15:30   15s
#2    build                 ✓        2026-03-22 10:15:46   24s
#3    test                  ◎        2026-03-22 10:16:11   running
#4    deploy                ◌        —                     —
```

**Status icons:** ✓ (success/green), ✗ (failure/red), ◎ (running/yellow), ◌ (queued/cyan), ✕ (cancelled/gray), ⏱ (timeout/red)

**Exit codes:** 0 (success), 1 (API error)

### Web UI Design

The workflow run detail page at route `/:owner/:repo/workflows/runs/:id` displays the step list as its primary content section.

- Ordered vertical list of step cards/rows, each showing position number, step name, status badge, start time, and duration
- Status badges use consistent color coding: green (success), red (failure), yellow with animated spinner (running), cyan/blue (queued), gray (cancelled), red outline (timeout)
- Running steps display an animated progress indicator; completed steps show human-readable duration (e.g., "15s", "2m 30s"); queued steps show a dash
- Clicking a step row expands it inline to show log output for that step via the node detail endpoint
- Mermaid diagram visualization above/alongside the step list showing the step pipeline with directed edges, color-coded by status
- Empty state: "This workflow run has no steps."
- Error state: "Workflow run not found" with back link; "Failed to load workflow run steps. Retry?" with retry button

### TUI UI

The TUI workflow run detail screen embeds the step list as its core content:

- Step rows showing position, name, status icon (with 250ms animation cycle for running), and duration
- Navigation: `j`/`k` between steps, `Enter` to expand/collapse inline logs, `q` to pop back, `Ctrl+R` to refresh
- Responsive: narrow terminals show position + name + icon only; wider terminals add start time and duration
- Empty state: "No steps in this run."

### Documentation

1. **"Inspecting Workflow Run Steps"** — guide explaining how to view the step-by-step breakdown, with web UI screenshots, CLI examples, and TUI description
2. **"CLI Reference: `codeplane workflow run steps`"** — full command docs with arguments, flags, examples, exit codes, and scripting patterns
3. **"API Reference: List Workflow Run Steps"** — endpoint docs with path parameters, response schema, error codes, and example curl request/response

## Permissions & Security

### Authorization Roles

| Role | Public Repository | Private Repository |
|------|------------------|--------------------|
| Anonymous (unauthenticated) | ✅ Read step list | ❌ 401 |
| Authenticated (no repo access) | ✅ Read step list | ❌ 403 |
| Read-only member | ✅ Read step list | ✅ Read step list |
| Write member | ✅ Read step list | ✅ Read step list |
| Admin | ✅ Read step list | ✅ Read step list |
| Owner | ✅ Read step list | ✅ Read step list |

Note: This feature is strictly read-only. No mutation actions (cancel, rerun, resume) are exposed through this endpoint.

### Rate Limiting

| Endpoint | Limit | Scope |
|----------|-------|-------|
| `GET /api/repos/:owner/:repo/actions/runs/:id/steps` | 300 requests/minute | Per authenticated user |
| `GET /api/repos/:owner/:repo/actions/runs/:id/steps` (anonymous) | 60 requests/minute | Per IP address |

Rate limit headers included in every response:
- `X-RateLimit-Limit`: Maximum requests in the window
- `X-RateLimit-Remaining`: Remaining requests in the window
- `X-RateLimit-Reset`: Unix timestamp when the window resets
- `Retry-After`: Seconds to wait (on 429 responses only)

### Data Privacy

- Step data does not contain PII by default. Step names are developer-defined identifiers from workflow definitions.
- Step names may theoretically contain sensitive information if a developer encodes it there, but this is a user-controlled input, not a system concern.
- Timestamps reveal execution timing patterns, which is acceptable for any user with read access to the repository.
- No secrets, tokens, environment variables, or log content are exposed through this endpoint. Log content requires the separate node detail endpoint.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workflow_run_steps.viewed` | Any client fetches the step list for a run | `repo_owner`, `repo_name`, `run_id`, `run_status`, `client` (web/cli/tui/api), `step_count`, `total_time_ms` |
| `workflow_run_steps.step_expanded` | User expands a step to view its logs (web/TUI) | `repo_owner`, `repo_name`, `run_id`, `step_id`, `step_name`, `step_status`, `step_position`, `client` |
| `workflow_run_steps.empty` | The endpoint returns zero steps | `repo_owner`, `repo_name`, `run_id`, `run_status`, `client` |
| `workflow_run_steps.error` | The endpoint returns a non-2xx status | `repo_owner`, `repo_name`, `run_id`, `client`, `http_status`, `error_message` |
| `workflow_run_steps.failure_identified` | User views a step list containing at least one failed step | `repo_owner`, `repo_name`, `run_id`, `failed_step_names`, `failed_step_positions`, `total_step_count`, `client` |

### Common Properties (all events)

- `user_id` (hashed)
- `session_id`
- `timestamp` (ISO 8601)
- `codeplane_version`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Step list view completion rate | > 99% | Step list requests should almost always succeed (simpler query than run list) |
| Step expand rate (web/TUI) | > 50% of step list views | Users viewing steps should drill into logs for at least one step |
| Failure step identification time | < 5s from page load | Users should be able to spot the failed step within seconds |
| Average latency (p50) | < 100ms | Step list for a single run should be near-instant |
| Average latency (p95) | < 500ms | Even large runs should respond quickly |
| Error rate | < 0.5% | This endpoint is simpler than the run list and should be highly reliable |
| CLI step list adoption | > 30% of CLI run view users also use steps | Indicates the CLI step command provides value beyond run-level detail |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------|  
| `debug` | Request received | `method=GET`, `path`, `owner`, `repo`, `run_id`, `request_id` |
| `debug` | Run ownership verified | `run_id`, `repository_id`, `run_status`, `request_id` |
| `debug` | Steps query completed | `run_id`, `step_count`, `query_duration_ms`, `request_id` |
| `info` | Response sent | `status=200`, `run_id`, `step_count`, `total_duration_ms`, `request_id` |
| `info` | Run not found | `run_id`, `repository_id`, `request_id` |
| `warn` | Slow query (> 200ms) | `run_id`, `repository_id`, `step_count`, `query_duration_ms`, `request_id` |
| `warn` | Rate limited | `user_id`, `ip`, `endpoint`, `retry_after_s`, `request_id` |
| `warn` | Unusually large step count (> 50) | `run_id`, `step_count`, `request_id` |
| `error` | Database query failure | `run_id`, `repository_id`, `error_message`, `error_code`, `request_id` |
| `error` | Repository resolution failure | `owner`, `repo`, `error_message`, `request_id` |
| `error` | Unexpected exception | `error_message`, `stack_trace`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_run_steps_requests_total` | Counter | `status` (200/400/401/403/404/429/500) | Total requests to the step list endpoint |
| `codeplane_workflow_run_steps_duration_seconds` | Histogram | `status` | Request duration in seconds (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5) |
| `codeplane_workflow_run_steps_count` | Histogram | — | Number of steps returned per request (buckets: 0, 1, 3, 5, 10, 20, 50, 100) |
| `codeplane_workflow_run_steps_db_query_duration_seconds` | Histogram | — | Time spent in the database query (buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25) |
| `codeplane_workflow_run_steps_rate_limited_total` | Counter | `scope` (user/ip) | Total rate-limited requests |

### Alerts

#### Alert: `WorkflowRunStepsHighErrorRate`
- **Condition:** `rate(codeplane_workflow_run_steps_requests_total{status=~"5.."}[5m]) / rate(codeplane_workflow_run_steps_requests_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check server logs filtered by `request_id` for 5xx responses: look for `error_message` and `error_code` in structured logs
  2. Verify database connectivity with a simple health check query
  3. Check if the `workflow_steps` table is accessible: `SELECT COUNT(*) FROM workflow_steps LIMIT 1`
  4. Check `pg_stat_activity` for long-running queries or lock contention on the `workflow_steps` table
  5. Investigate whether a specific `run_id` is causing repeated failures (check `run_id` in error logs)
  6. If the database connection pool is exhausted, increase pool size or restart the server process
  7. If PGLite (daemon mode), verify local storage integrity and available disk space

#### Alert: `WorkflowRunStepsHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_run_steps_duration_seconds_bucket[5m])) > 1`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_run_steps_db_query_duration_seconds` to confirm the latency is in the DB layer
  2. Run `EXPLAIN ANALYZE` on `SELECT ... FROM workflow_steps WHERE workflow_run_id = $1 ORDER BY position` with a sample run ID
  3. Verify the index on `workflow_steps(workflow_run_id, position)` exists and is being used
  4. Check `codeplane_workflow_run_steps_count` histogram for unusually large step counts
  5. Check for table bloat: run `pg_stat_user_tables` for `workflow_steps` and consider VACUUM if dead_tuples is high
  6. If consistently slow, consider adding a composite covering index: `(workflow_run_id, position) INCLUDE (name, status, started_at, completed_at, created_at, updated_at)`

#### Alert: `WorkflowRunStepsHighRateLimit`
- **Condition:** `rate(codeplane_workflow_run_steps_rate_limited_total[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Identify the rate-limited user or IP from structured logs
  2. Determine if this is a legitimate polling pattern (e.g., a script waiting for step completion) or abuse
  3. For legitimate polling use cases, recommend using the workflow run event SSE stream instead
  4. For abuse, consider temporary IP blocking or token revocation
  5. Evaluate whether the 300/min (authenticated) and 60/min (anonymous) limits are appropriate

### Error Cases and Failure Modes

| Error Case | HTTP Status | Log Level | Recovery |
|------------|-------------|-----------|----------|
| Invalid run ID (non-numeric, negative, zero, float, overflow) | 400 | debug | Client fixes request |
| Missing auth token (private repo) | 401 | info | Client re-authenticates |
| Insufficient repo access (private repo) | 403 | info | User requests access |
| Repository not found | 404 | info | Client corrects owner/repo |
| Workflow run not found | 404 | info | Client corrects run ID or run was deleted |
| Run belongs to different repository | 404 | info | Client uses correct repository context |
| Rate limited | 429 | warn | Client waits Retry-After seconds |
| Database connection failure | 500 | error | Auto-retry with backoff; alert fires |
| SQL query timeout | 500 | error | Investigate query plan; check for missing index |
| Unexpected serialization error | 500 | error | Investigate step data for corrupt timestamps or null columns |

## Verification

### API Integration Tests

**File: `e2e/api/workflow-run-steps.test.ts`**

| Test ID | Description |
|---------|-------------|
| API-WRSL-001 | `GET /api/repos/:owner/:repo/actions/runs/:id/steps` with a run that has steps returns `{ "steps": [...] }` with 200 |
| API-WRSL-002 | Steps are ordered by `position` ascending |
| API-WRSL-003 | Each step includes all required fields: `id`, `workflow_run_id`, `name`, `position`, `status`, `started_at`, `completed_at`, `created_at`, `updated_at` |
| API-WRSL-004 | `workflow_run_id` on each step matches the requested run ID |
| API-WRSL-005 | Step `id` values are unique within the response |
| API-WRSL-006 | Step `position` values are sequential and non-negative |
| API-WRSL-007 | Run with zero steps returns `{ "steps": [] }` with 200 status |
| API-WRSL-008 | Run with exactly one step returns a single-element array |
| API-WRSL-009 | Run with 50 steps returns all 50 steps in position order (large valid set) |
| API-WRSL-010 | Step with `status=queued` has `null` `started_at` and `null` `completed_at` |
| API-WRSL-011 | Step with `status=running` has non-null `started_at` and `null` `completed_at` |
| API-WRSL-012 | Step with `status=success` has non-null `started_at` and non-null `completed_at` |
| API-WRSL-013 | Step with `status=failure` has non-null `started_at` and non-null `completed_at` |
| API-WRSL-014 | Step with `status=cancelled` has appropriate timestamp nullability |
| API-WRSL-015 | Step with `status=timeout` has non-null `started_at` and non-null `completed_at` |
| API-WRSL-016 | Timestamps are in ISO 8601 format |
| API-WRSL-017 | Step names containing hyphens are preserved (`install-dependencies`) |
| API-WRSL-018 | Step names containing underscores are preserved (`run_tests`) |
| API-WRSL-019 | Step names containing dots are preserved (`deploy.production`) |
| API-WRSL-020 | Step names containing spaces are preserved (`Build Frontend`) |
| API-WRSL-021 | Step names at maximum length (255 characters) are preserved |
| API-WRSL-022 | Duplicate step names within the same run each have unique `id` and `position` |
| API-WRSL-023 | Non-existent run ID returns 404 with `"workflow run not found"` |
| API-WRSL-024 | Run ID `0` returns 400 with `"invalid run id"` |
| API-WRSL-025 | Run ID `-1` returns 400 with `"invalid run id"` |
| API-WRSL-026 | Run ID `abc` returns 400 with `"invalid run id"` |
| API-WRSL-027 | Run ID `1.5` returns 400 with `"invalid run id"` |
| API-WRSL-028 | Run ID larger than int64 max (`9223372036854775808`) returns 400 with `"invalid run id"` |
| API-WRSL-029 | Run ID at int64 max (`9223372036854775807`) that does not exist returns 404 (valid parse, not found) |
| API-WRSL-030 | Empty run ID path segment returns 400 |
| API-WRSL-031 | Non-existent repository returns 404 |
| API-WRSL-032 | Non-existent owner returns 404 |
| API-WRSL-033 | Run that belongs to a different repository returns 404 |
| API-WRSL-034 | Owner and repo names with hyphens resolve correctly |
| API-WRSL-035 | Owner and repo names with underscores resolve correctly |
| API-WRSL-036 | Owner and repo names with dots resolve correctly |
| API-WRSL-037 | Unauthenticated request to private repository returns 401 |
| API-WRSL-038 | Authenticated user without repo access on private repo returns 403 |
| API-WRSL-039 | Public repository step list is accessible without authentication |
| API-WRSL-040 | Read-only member can access step list on private repository |
| API-WRSL-041 | Steps from a resumed run (steps reset from failure to queued) show `null` `started_at` and `completed_at` |
| API-WRSL-042 | Concurrent requests to the same endpoint return consistent data |
| API-WRSL-043 | Response content-type is `application/json` |

### CLI Integration Tests

**File: `e2e/cli/workflow-run-steps.test.ts`**

| Test ID | Description |
|---------|-------------|
| CLI-WRSL-001 | `codeplane workflow run steps <run-id> --repo owner/repo --json` outputs valid JSON with `steps` array |
| CLI-WRSL-002 | Each step in JSON output has `name` and `status` fields |
| CLI-WRSL-003 | Steps in JSON output are ordered by position |
| CLI-WRSL-004 | `codeplane workflow run steps <run-id> --repo owner/repo` outputs a formatted table |
| CLI-WRSL-005 | Table output includes STEP, NAME, STATUS, STARTED, DURATION columns |
| CLI-WRSL-006 | Status icons in table output match step statuses (✓ for success, ✗ for failure, ◎ for running, ◌ for queued) |
| CLI-WRSL-007 | `codeplane workflow run steps <nonexistent-id> --repo owner/repo` exits with code 1 |
| CLI-WRSL-008 | `codeplane workflow run steps <run-id>` without `--repo` infers repository from current directory |
| CLI-WRSL-009 | Run with zero steps outputs table header only, exits with code 0 |
| CLI-WRSL-010 | Run with 50 steps outputs all 50 rows in position order |

### CLI Workflow Lifecycle Tests

**File: `e2e/cli/workflow-lifecycle.test.ts`** (existing test)

| Test ID | Description |
|---------|-------------|
| CLI-WRSL-LIFE-001 | Within a workflow lifecycle (dispatch → view → steps → cancel → rerun), `workflow run steps <id>` returns a `steps` array |

### TUI E2E Tests

**File: `e2e/tui/workflow-run-steps.test.ts`**

| Test ID | Description |
|---------|-------------|
| TUI-WRSL-001 | Workflow run detail screen renders step list with step names and status icons |
| TUI-WRSL-002 | Steps are displayed in position order |
| TUI-WRSL-003 | Status icons render with correct colors (✓ green, ✗ red, ◎ yellow, ◌ cyan, ✕ gray) |
| TUI-WRSL-004 | Running step shows animated spinner (◐◓◑◒ cycle) |
| TUI-WRSL-005 | `j`/`k` navigation moves focus between steps |
| TUI-WRSL-006 | `Enter` on a focused step expands inline logs |
| TUI-WRSL-007 | `Enter` again on an expanded step collapses it |
| TUI-WRSL-008 | Empty step list displays "No steps in this run." |
| TUI-WRSL-009 | `q` returns to the run list |
| TUI-WRSL-010 | `Ctrl+R` refreshes the step data |
| TUI-WRSL-011 | Responsive layout at narrow width shows only position + name + icon |
| TUI-WRSL-012 | Responsive layout at wide width shows start time and duration |

### Playwright (Web UI) E2E Tests

**File: `e2e/web/workflow-run-steps.test.ts`**

| Test ID | Description |
|---------|-------------|
| WEB-WRSL-001 | Navigate to `/:owner/:repo/workflows/runs/:id` and see the step list |
| WEB-WRSL-002 | Step rows display position, name, status badge, start time, and duration |
| WEB-WRSL-003 | Steps are rendered in position order |
| WEB-WRSL-004 | Success step shows green status badge |
| WEB-WRSL-005 | Failure step shows red status badge |
| WEB-WRSL-006 | Running step shows animated yellow spinner |
| WEB-WRSL-007 | Queued step shows cyan/blue badge and dash for timing |
| WEB-WRSL-008 | Clicking a step row expands inline log view |
| WEB-WRSL-009 | Mermaid diagram renders above/alongside the step list |
| WEB-WRSL-010 | Run with zero steps shows "This workflow run has no steps." |
| WEB-WRSL-011 | Non-existent run ID shows "Workflow run not found" with back link |
| WEB-WRSL-012 | Private repo without access shows 403 message |
| WEB-WRSL-013 | Duration displays human-readable format (e.g., "15s", "2m 30s") |
| WEB-WRSL-014 | Page renders correctly with a run containing 50+ steps |

All tests are left failing if the backend is unimplemented — never skipped or commented out.

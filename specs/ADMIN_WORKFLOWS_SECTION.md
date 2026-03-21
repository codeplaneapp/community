# ADMIN_WORKFLOWS_SECTION

Specification for ADMIN_WORKFLOWS_SECTION.

## High-Level User POV

As a Codeplane admin, I need a comprehensive workflow management section in the admin panel that lets me monitor, inspect, and manage all workflow runs across the entire instance. I should be able to view global workflow statistics, search/filter runs by repository, user, status, or trigger type, inspect run details including logs and artifacts, cancel or rerun workflows, manage workflow runners and their health, configure instance-wide workflow policies (concurrency limits, timeout defaults, allowed actions), and audit workflow resource consumption. This gives me full operational visibility and control over the automation layer without needing direct database or CLI access.

## Acceptance Criteria

1. ADMIN_WORKFLOWS_LIST: Admin can view a paginated, sortable, filterable list of all workflow runs across all repositories with columns for run ID, repository, workflow name, trigger type, status, duration, started-at, and user/agent who triggered it.
2. ADMIN_WORKFLOWS_FILTER: Admin can filter workflow runs by status (queued, running, success, failure, cancelled), repository, user, trigger type (push, issue, landing_request, schedule, manual, workflow_run, workflow_artifact, release, issue_comment), and date range.
3. ADMIN_WORKFLOWS_DETAIL: Admin can drill into any workflow run to see full run detail including step/task breakdown, logs (streamed via SSE), artifacts, event timeline, and associated repository context.
4. ADMIN_WORKFLOWS_CANCEL: Admin can cancel any running or queued workflow run regardless of repository ownership.
5. ADMIN_WORKFLOWS_RERUN: Admin can rerun any completed workflow run regardless of repository ownership.
6. ADMIN_WORKFLOWS_RUNNERS: Admin can view all registered workflow runners, their health status, current load, and last heartbeat. Admin can enable/disable runners.
7. ADMIN_WORKFLOWS_STATS: Admin dashboard shows aggregate workflow statistics: total runs (24h/7d/30d), success rate, average duration, most active repositories, most common failure reasons, and queue depth.
8. ADMIN_WORKFLOWS_POLICIES: Admin can configure instance-wide workflow policies including default timeout, max concurrency per repository, max artifact retention period, and allowed workflow trigger types.
9. ADMIN_WORKFLOWS_AUDIT: All admin workflow actions (cancel, rerun, policy change, runner enable/disable) are recorded in the admin audit log with actor, action, target, and timestamp.
10. ADMIN_WORKFLOWS_CACHE: Admin can view cache usage statistics across all repositories and clear caches globally or per-repository.
11. ADMIN_WORKFLOWS_ARTIFACTS: Admin can view artifact storage usage across all repositories and delete artifacts globally or per-repository.
12. ERROR_HANDLING: All admin workflow endpoints return structured JSON error payloads with appropriate HTTP status codes. Unauthorized access returns 403. Missing resources return 404.

## Design

## Architecture

The admin workflows section extends the existing `admin` route family in `apps/server/src/routes/admin/` with new sub-routes under `/api/admin/workflows`.

### Route Structure

```
GET    /api/admin/workflows/runs          — paginated list of all runs (filters via query params)
GET    /api/admin/workflows/runs/:runId   — single run detail
POST   /api/admin/workflows/runs/:runId/cancel  — cancel a run
POST   /api/admin/workflows/runs/:runId/rerun   — rerun a run
GET    /api/admin/workflows/runs/:runId/logs     — SSE log stream (delegates to existing workflow SSE)
GET    /api/admin/workflows/stats          — aggregate statistics
GET    /api/admin/workflows/runners        — list runners
PATCH  /api/admin/workflows/runners/:runnerId  — enable/disable runner
GET    /api/admin/workflows/policies       — get current policies
PUT    /api/admin/workflows/policies       — update policies
GET    /api/admin/workflows/cache/stats    — cache stats
DELETE /api/admin/workflows/cache          — clear cache (global or per-repo via query)
GET    /api/admin/workflows/artifacts/stats — artifact storage stats
DELETE /api/admin/workflows/artifacts      — delete artifacts (global or per-repo via query)
```

### Service Layer

New methods are added to the existing `WorkflowService` in `packages/sdk/src/services/workflow.ts`:
- `listAllRuns(filters, pagination)` — cross-repo run listing with filtering
- `getGlobalStats(timeRange)` — aggregate statistics computation
- `getRunnerList()` / `updateRunner(id, patch)` — runner management
- `getPolicies()` / `updatePolicies(patch)` — policy CRUD
- `getGlobalCacheStats()` / `clearGlobalCache(repoFilter?)` — cache management
- `getGlobalArtifactStats()` / `deleteGlobalArtifacts(repoFilter?)` — artifact management

These methods are exposed through the existing service registry pattern in `apps/server/src/services.ts`.

### Web UI

New admin sub-routes in `apps/ui/src/routes/admin/`:
- `workflows/index.tsx` — runs list with filter sidebar and stats cards
- `workflows/[runId].tsx` — run detail with log viewer, step timeline, artifact list
- `workflows/runners.tsx` — runner health table
- `workflows/policies.tsx` — policy configuration form
- `workflows/cache.tsx` — cache and artifact management

These pages use the existing admin layout shell and `ui-core` API client patterns.

### CLI

Extend `apps/cli/src/commands/admin/` with:
- `admin workflow list` — list runs with `--status`, `--repo`, `--user`, `--limit` flags
- `admin workflow inspect <runId>` — show run detail
- `admin workflow cancel <runId>` — cancel a run
- `admin workflow rerun <runId>` — rerun a run
- `admin workflow runners` — list runners
- `admin workflow stats` — show aggregate stats
- `admin workflow policies [--set key=value]` — view/update policies
- `admin workflow cache [--clear] [--repo <repo>]` — cache management

### Data Model Additions

New table: `workflow_policies` (singleton row pattern)
- `id` (int, always 1)
- `default_timeout_seconds` (int, default 3600)
- `max_concurrency_per_repo` (int, default 10)
- `max_artifact_retention_days` (int, default 90)
- `allowed_trigger_types` (text[], default all types)
- `updated_at` (timestamp)
- `updated_by` (user ID FK)

Existing tables used: `workflow_runs`, `workflow_steps`, `workflow_tasks`, `workflow_artifacts`, `workflow_cache_entries`, `workflow_runners` (if exists, otherwise add runner tracking table).

### SSE Integration

Admin log streaming reuses the existing SSE manager channel pattern from `packages/sdk/src/services/sse.ts`. The admin log endpoint authenticates as admin, then subscribes to the same run-scoped SSE channel used by repository-scoped log streaming.

## Permissions & Security

## Permission Model

1. **Admin-only access**: All `/api/admin/workflows/*` endpoints require the requesting user to have `is_admin: true`. This is enforced by the existing admin middleware guard applied to the admin route family.

2. **Cross-repo visibility**: Admin workflow endpoints bypass repository-scoped authorization. An admin can see and act on workflow runs for any repository, including private repositories.

3. **Destructive actions**: Cancel, rerun, cache clear, and artifact delete operations require admin role. There is no additional confirmation gate at the API level (the UI should present confirmation dialogs).

4. **Policy updates**: Only admins can read or write workflow policies. Policy changes are audit-logged.

5. **Runner management**: Only admins can view runner health or enable/disable runners.

6. **Audit trail**: All admin workflow mutations (cancel, rerun, policy update, runner toggle, cache clear, artifact delete) create entries in the admin audit log with: `actor_id`, `action` (enum), `target_type`, `target_id`, `metadata` (JSON), `created_at`.

7. **Rate limiting**: Admin endpoints share the existing admin rate limit tier (higher than user-facing endpoints).

8. **PAT scope**: Personal access tokens require an `admin:workflows` scope to access these endpoints. Tokens without this scope receive 403.

## Telemetry & Product Analytics

## Telemetry Events

1. `admin.workflows.runs.listed` — Emitted when admin views the runs list. Properties: `filter_status`, `filter_repo`, `filter_user`, `filter_trigger_type`, `result_count`, `page`.

2. `admin.workflows.run.viewed` — Emitted when admin views run detail. Properties: `run_id`, `repo_id`, `run_status`.

3. `admin.workflows.run.cancelled` — Emitted when admin cancels a run. Properties: `run_id`, `repo_id`, `previous_status`.

4. `admin.workflows.run.rerun` — Emitted when admin reruns a workflow. Properties: `original_run_id`, `new_run_id`, `repo_id`.

5. `admin.workflows.stats.viewed` — Emitted when admin views aggregate stats. Properties: `time_range`.

6. `admin.workflows.runners.viewed` — Emitted when admin views runners list. Properties: `runner_count`, `healthy_count`.

7. `admin.workflows.runner.toggled` — Emitted when admin enables/disables a runner. Properties: `runner_id`, `new_state`.

8. `admin.workflows.policies.updated` — Emitted when admin updates policies. Properties: `changed_fields` (array of field names).

9. `admin.workflows.cache.cleared` — Emitted when admin clears cache. Properties: `scope` (global or repo), `repo_id` (if scoped), `freed_bytes`.

10. `admin.workflows.artifacts.deleted` — Emitted when admin deletes artifacts. Properties: `scope`, `repo_id` (if scoped), `deleted_count`, `freed_bytes`.

All events include standard context: `admin_user_id`, `timestamp`, `request_id`.

## Observability

## Observability

### Structured Logging

All admin workflow operations emit structured log entries at `info` level with fields:
- `component: "admin.workflows"`
- `action`: the operation name
- `admin_user_id`: actor
- `target_id`: affected resource ID
- `duration_ms`: operation duration
- `request_id`: correlation ID from middleware

Errors emit at `error` level with additional `error_code`, `error_message`, and `stack` fields.

### Metrics (PromQL-compatible)

1. `codeplane_admin_workflow_runs_total` (counter) — Total admin-initiated workflow actions, labeled by `action` (list, cancel, rerun, inspect).
2. `codeplane_admin_workflow_runs_active` (gauge) — Current number of active (running + queued) workflow runs instance-wide.
3. `codeplane_admin_workflow_cache_bytes` (gauge) — Total workflow cache storage in bytes.
4. `codeplane_admin_workflow_artifact_bytes` (gauge) — Total artifact storage in bytes.
5. `codeplane_admin_workflow_runner_health` (gauge, labeled by `runner_id`) — Runner health status (1 = healthy, 0 = unhealthy).
6. `codeplane_admin_workflow_request_duration_seconds` (histogram, labeled by `endpoint`) — Request latency for admin workflow endpoints.
7. `codeplane_admin_workflow_policy_changes_total` (counter) — Number of policy update operations.

### Health Checks

The existing `/api/health` endpoint is extended to include a `workflows` subsystem check reporting:
- runner connectivity (at least one runner healthy)
- queue depth (warn if > configurable threshold)
- cache storage (warn if > 80% of configured limit)

### Alerting Rules (Grafana/Alertmanager)

1. `WorkflowQueueDepthHigh`: Alert when queued runs exceed threshold for > 5 minutes.
2. `AllRunnersUnhealthy`: Alert when zero runners report healthy for > 2 minutes.
3. `WorkflowFailureRateHigh`: Alert when failure rate exceeds 50% over rolling 1-hour window.
4. `ArtifactStorageNearLimit`: Alert when artifact storage exceeds 90% of configured limit.

## Verification

## Verification Plan

### Unit Tests

1. **Service layer tests** (`packages/sdk/src/services/__tests__/workflow-admin.test.ts`):
   - `listAllRuns` returns paginated results with correct filtering by status, repo, user, trigger type, and date range
   - `listAllRuns` with no filters returns all runs sorted by created_at desc
   - `getGlobalStats` computes correct counts, success rates, and averages for 24h/7d/30d windows
   - `getGlobalStats` handles empty state (no runs) gracefully
   - `getRunnerList` returns all runners with health status
   - `updateRunner` toggles enabled state and returns updated runner
   - `updateRunner` with invalid runner ID returns not-found error
   - `getPolicies` returns current policy values (or defaults if no row exists)
   - `updatePolicies` persists changes and returns updated policies
   - `updatePolicies` validates field constraints (e.g., timeout > 0, concurrency > 0)
   - `getGlobalCacheStats` aggregates cache usage across repos
   - `clearGlobalCache` with repo filter clears only that repo's cache
   - `clearGlobalCache` without filter clears all caches
   - `getGlobalArtifactStats` aggregates artifact storage across repos
   - `deleteGlobalArtifacts` with repo filter deletes only that repo's artifacts

2. **Route handler tests** (`apps/server/src/routes/admin/__tests__/workflows.test.ts`):
   - Each endpoint returns 403 for non-admin users
   - Each endpoint returns 401 for unauthenticated requests
   - GET runs list returns correct pagination headers
   - GET runs list applies query param filters correctly
   - GET run detail returns full run with steps, tasks, and metadata
   - GET run detail returns 404 for non-existent run
   - POST cancel returns 200 for running/queued runs, 409 for already-completed runs
   - POST rerun returns 201 with new run ID
   - GET/PUT policies round-trip correctly
   - PUT policies with invalid values returns 400 with structured errors
   - DELETE cache returns freed bytes count
   - DELETE artifacts returns deleted count and freed bytes
   - All mutation endpoints create audit log entries

### Integration Tests

3. **API integration tests** (`apps/server/src/__tests__/admin-workflows.integration.test.ts`):
   - Full lifecycle: create workflow run via normal API → list via admin API → cancel via admin API → verify status change
   - Full lifecycle: create workflow run → let it complete → rerun via admin API → verify new run created
   - Policy enforcement: set max concurrency → trigger runs exceeding limit → verify queuing behavior
   - Cache management: populate cache via workflow run → verify stats → clear via admin → verify empty
   - Artifact management: upload artifact via workflow → verify stats → delete via admin → verify removed
   - Cross-repo visibility: create runs in multiple repos → verify admin list returns all
   - Audit trail: perform multiple admin actions → verify audit log contains all entries with correct metadata

### E2E Tests

4. **Web UI E2E tests** (`apps/ui/e2e/admin-workflows.spec.ts`):
   - Admin can navigate to workflows admin section
   - Runs list renders with correct columns and pagination
   - Filter controls update the list correctly
   - Clicking a run navigates to detail view
   - Detail view shows log stream (SSE), steps, and artifacts
   - Cancel button shows confirmation dialog and cancels run on confirm
   - Rerun button creates new run and navigates to it
   - Runners page shows runner health table
   - Policies page loads current values and saves changes
   - Cache page shows stats and clear button works
   - Non-admin user is redirected away from admin workflows section

5. **CLI E2E tests** (`apps/cli/e2e/admin-workflow.spec.ts`):
   - `admin workflow list` outputs formatted run table
   - `admin workflow list --status running` filters correctly
   - `admin workflow inspect <id>` shows run detail
   - `admin workflow cancel <id>` cancels and confirms
   - `admin workflow rerun <id>` creates new run and outputs new ID
   - `admin workflow stats` outputs aggregate statistics
   - `admin workflow runners` lists runners with health
   - `admin workflow policies` shows current policies
   - `admin workflow policies --set default_timeout_seconds=7200` updates and confirms
   - `admin workflow cache --clear` clears and reports freed bytes
   - All commands fail with appropriate error for non-admin users

### Performance Tests

6. **Load and performance** (manual or scripted):
   - `listAllRuns` with 100k+ runs completes within 500ms with pagination
   - `getGlobalStats` with 100k+ runs completes within 2s
   - Concurrent admin operations (cancel + list + stats) do not deadlock
   - SSE log stream for admin does not leak connections on client disconnect

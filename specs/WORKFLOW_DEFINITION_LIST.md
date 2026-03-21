# WORKFLOW_DEFINITION_LIST

Specification for WORKFLOW_DEFINITION_LIST.

## High-Level User POV

When a user navigates to a repository's workflows section — whether through the web UI, CLI, TUI, or an editor integration — they should see a clear, browsable list of all workflow definitions that have been registered for that repository. Each workflow definition represents an automated pipeline (such as CI, deployment, code review, or agent-driven tasks) authored in TypeScript and stored at a well-known path like `.codeplane/workflows/ci.ts`.

The workflow definition list is the primary entry point into Codeplane's automation system. From this list, users can understand at a glance which automations exist in a repository, whether each workflow is currently active or inactive, and what kind of events trigger it. Users can quickly drill into a specific workflow to see its run history, manually dispatch a workflow, or search and filter to find a particular definition in repositories with many workflows.

For teams using agent-augmented development, the workflow list is where they verify that their agent task pipelines, automated code review flows, and workspace provisioning workflows are correctly defined and active. For platform engineers, the workflow list is a health dashboard showing which automations are operational and which have been deactivated.

The experience should be consistent across surfaces: the same set of definitions is visible in the web UI's repository workflows tab, in the CLI via `codeplane workflow list`, in the TUI's workflow screen, and through editor integrations. Pagination ensures the list remains responsive even in repositories with dozens or hundreds of workflow definitions.

## Acceptance Criteria

## Core Behavior
- [ ] The endpoint returns all workflow definitions scoped to the requested repository
- [ ] Results are ordered by definition ID descending (newest first)
- [ ] Each definition includes: `id`, `repository_id`, `name`, `path`, `config`, `is_active`, `created_at`, `updated_at`
- [ ] An empty repository (no workflow definitions) returns `{ "workflows": [] }` with HTTP 200
- [ ] The response envelope key is `workflows` (array of definition objects)

## Pagination
- [ ] Default page size is 30 items
- [ ] Maximum page size is 100 items; requests exceeding 100 return HTTP 400
- [ ] Page-based pagination is supported via `page` and `per_page` query parameters
- [ ] Cursor-based pagination is supported via `cursor` and `limit` query parameters
- [ ] `page=0`, `page=-1`, `per_page=0`, `per_page=-1` all return HTTP 400 with a descriptive error message
- [ ] Non-numeric `page` or `per_page` values return HTTP 400
- [ ] Requesting a page beyond available data returns an empty array, not an error

## Field Constraints
- [ ] `name` is a non-empty string, max 255 characters
- [ ] `path` is a valid relative file path within the repository, max 512 characters
- [ ] `config` is a JSON object representing the parsed workflow configuration; it may be `null` if the definition has not been parsed yet
- [ ] `is_active` is a boolean
- [ ] `created_at` and `updated_at` are ISO 8601 timestamps in UTC

## Repository Resolution
- [ ] The repository is identified by `:owner/:repo` path parameters
- [ ] If the repository does not exist, return HTTP 404
- [ ] If the repository exists but the user lacks read access (private repo, insufficient permissions), return HTTP 404 (do not leak existence)

## Edge Cases
- [ ] Workflow definitions with Unicode characters in names are returned correctly
- [ ] Workflow definitions with deeply nested `config` objects are returned without truncation
- [ ] Concurrent creation of workflow definitions during pagination does not cause duplicate or missing entries (eventual consistency is acceptable)
- [ ] Archived repositories still return their workflow definitions via the list endpoint (read-only)

## Definition of Done
- [ ] Server route handler returns correct response shape and status codes for all documented scenarios
- [ ] CLI `workflow list` command consumes the endpoint and renders output in both JSON and human-readable formats
- [ ] TUI workflow list screen fetches and displays definitions with active/inactive status, names, paths, and last-run indicators
- [ ] Web UI workflows tab renders the definition list with pagination controls
- [ ] E2E tests pass for API, CLI, and TUI surfaces
- [ ] Feature is documented in the user-facing workflow documentation

## Design

## API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/workflows`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer (≥1) | 1 | Page number (page-based pagination) |
| `per_page` | integer (1–100) | 30 | Items per page (page-based pagination) |
| `limit` | integer (1–100) | 30 | Items per page (cursor-based pagination) |
| `cursor` | integer (≥0) | 0 | Offset cursor (cursor-based pagination) |

**Success Response:** HTTP 200

```json
{
  "workflows": [
    {
      "id": 42,
      "repository_id": 7,
      "name": "CI Pipeline",
      "path": ".codeplane/workflows/ci.ts",
      "config": {
        "on": { "push": { "branches": ["main"] } },
        "jobs": { "build": { "steps": [] } }
      },
      "is_active": true,
      "created_at": "2026-03-20T14:30:00.000Z",
      "updated_at": "2026-03-21T09:15:00.000Z"
    }
  ]
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|----------|
| 400 | `{ "message": "invalid page value" }` | Non-positive or non-numeric page |
| 400 | `{ "message": "invalid per_page value" }` | Non-positive or non-numeric per_page |
| 400 | `{ "message": "per_page must not exceed 100" }` | per_page > 100 |
| 400 | `{ "message": "invalid limit value" }` | Non-positive or non-numeric limit |
| 401 | `{ "message": "unauthorized" }` | Missing or invalid authentication |
| 404 | `{ "message": "repository not found" }` | Repository does not exist or user lacks access |

## SDK Shape

The `WorkflowService` in `@codeplane/sdk` exposes:

```typescript
listWorkflowDefinitions(
  repositoryId: string,
  page: number,
  perPage: number
): Promise<Result<WorkflowDefinition[], APIError>>
```

Where `WorkflowDefinition` is:

```typescript
interface WorkflowDefinition {
  id: number;
  repository_id: number;
  name: string;
  path: string;
  config: unknown;
  is_active: boolean;
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
}
```

## CLI Command

**Command:** `codeplane workflow list`

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | Auto-detected from cwd | Repository in `OWNER/REPO` format |
| `--json` | boolean | false | Output raw JSON response |
| `--page` | integer | 1 | Page number |
| `--per-page` | integer | 30 | Items per page |

**Human-readable output (default):**

```
WORKFLOWS for acme/api-server

ID   NAME            PATH                              ACTIVE   UPDATED
42   CI Pipeline     .codeplane/workflows/ci.ts        ✓        2 hours ago
41   Deploy Staging  .codeplane/workflows/deploy.ts    ✓        1 day ago
39   Nightly Tests   .codeplane/workflows/nightly.ts   ✗        3 days ago

Showing 3 of 3 definitions (page 1)
```

**JSON output (`--json`):** Returns the raw API response envelope `{ "workflows": [...] }`.

**Error behavior:**
- Missing repo context: prints error and exits with code 1
- 401: prints authentication error and exits with code 1
- 404: prints "repository not found" and exits with code 1
- Network error: prints connection error and exits with code 1

## TUI UI

**Screen name:** Workflow List Screen

**Access methods:**
- `g f` keybinding from any screen with repository context
- `:workflows` from the command palette
- `codeplane tui --screen workflows --repo owner/repo` deep link

**Layout:**

```
┌─ Workflows ── acme/api-server ── Filter: All ── Search: _____________ ┐
│                                                                        │
│  ● CI Pipeline          .codeplane/workflows/ci.ts     ✓ ●●●●○  2h   │
│  ● Deploy Staging       .codeplane/workflows/deploy.ts ✓ ●●●○○  1d   │
│  ○ Nightly Tests        .codeplane/workflows/nightly.ts✗ ●○○○○  3d   │
│                                                                        │
│  Page 1/1 · 3 workflows                                               │
└── j/k:navigate  Enter:open  d:dispatch  f:filter  /:search  q:back ──┘
```

**Column layout:**
- Status icon: `●` (green) = active, `○` (gray) = inactive
- Workflow name (truncated at column width)
- File path (truncated at column width)
- Latest run status badge: `✓` success, `✗` failure, `◎` running, `◌` queued, `—` no runs
- Mini status bar: last 5 run results as colored dots (green=success, red=failure, yellow=running, gray=queued, dim=cancelled)
- Relative timestamp of last run

**Keybindings:**

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | Open workflow run list for selected definition |
| `d` | Dispatch selected workflow (opens dispatch overlay) |
| `/` | Focus search input |
| `f` | Cycle filter: All → Active → Inactive → All |
| `g g` | Jump to top of list |
| `G` | Jump to bottom of list |
| `n` | Next page |
| `p` | Previous page |
| `q` / `Esc` | Go back to previous screen |

**Responsive behavior:**
- 80×24 (minimum): hide path column, truncate names at 30 chars
- 120×40 (standard): show all columns, truncate at 50 chars
- 200×60+ (wide): full-length names and paths, expanded mini status bar

**Loading state:** Skeleton rows with pulsing animation while data loads

**Empty state:** "No workflows defined. Create a `.codeplane/workflows/` directory to get started."

**Error state:** Inline error banner with retry action

## Web UI Design

**Route:** `/:owner/:repo/workflows`

**Tab:** "Workflows" in the repository navigation tabs

**Layout:**
- Page header showing "Workflows" with repository context breadcrumb
- Filter bar with: status filter dropdown (All / Active / Inactive), text search input
- Table with columns: Status indicator, Name (linked), Path, Latest Run Status, Last Run Time
- Pagination controls at bottom (page numbers + next/prev)
- "Run workflow" button on each row for dispatchable workflows (write+ access only)

**Empty state:** Illustration with text: "No workflows yet. Add workflow definitions in `.codeplane/workflows/` to automate your development process." Link to documentation.

**Loading state:** Table skeleton with animated placeholder rows

## Documentation

The following user-facing documentation should exist:

- **Workflow Overview Guide:** Explain what workflow definitions are, where they live in the repository (`.codeplane/workflows/`), and how they are discovered by Codeplane.
- **Viewing Workflows:** Document how to list workflows via the web UI, CLI (`codeplane workflow list`), and TUI (`g f` keybinding). Include screenshots/terminal output examples.
- **Filtering and Searching:** Document the filter and search capabilities available in the TUI and web UI.
- **API Reference:** Document the `GET /api/repos/:owner/:repo/workflows` endpoint with all query parameters, response shape, and error codes.

## Permissions & Security

## Authorization Roles

| Role | Access |
|------|--------|
| **Repository Owner** | Full access to list workflow definitions |
| **Repository Admin** | Full access to list workflow definitions |
| **Repository Write Member** | Full access to list workflow definitions |
| **Repository Read Member** | Can list workflow definitions |
| **Organization Member** (non-repo member, public repo) | Can list workflow definitions |
| **Authenticated User** (public repo) | Can list workflow definitions |
| **Authenticated User** (private repo, no access) | HTTP 404 — repository existence is not leaked |
| **Anonymous / Unauthenticated** | HTTP 401 |

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `GET /api/repos/:owner/:repo/workflows` | 300 requests | Per minute, per authenticated user |

Rate limit headers should be included in every response:
- `X-RateLimit-Limit`: Maximum requests allowed in the window
- `X-RateLimit-Remaining`: Remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp when the window resets

When rate limited, return HTTP 429 with `{ "message": "rate limit exceeded" }` and a `Retry-After` header.

## Data Privacy

- The `config` field may contain workflow input definitions and job configurations. It must never contain secrets, tokens, or credentials.
- Repository-scoped secrets and variables used in workflow execution are never included in the definition list response.
- Workflow definition names and paths are not considered PII but may indicate organizational structure; private repository access controls are the primary privacy boundary.
- The endpoint does not log or expose the values of any query parameters beyond pagination.

## Telemetry & Product Analytics

## Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workflow_definition.list` | API endpoint invoked | `repository_id`, `owner`, `repo`, `page`, `per_page`, `result_count`, `client` (web/cli/tui/editor), `user_id` |
| `workflow_definition.list.empty` | List returns zero results | `repository_id`, `owner`, `repo`, `client`, `user_id` |
| `workflow_definition.list.paginated` | User navigates beyond page 1 | `repository_id`, `page`, `per_page`, `client`, `user_id` |
| `tui.workflows.view` | TUI workflow list screen loaded | `repository_id`, `result_count`, `load_time_ms` |
| `tui.workflows.filter_change` | TUI filter cycled | `repository_id`, `filter_value` (all/active/inactive) |
| `tui.workflows.search` | TUI text search performed | `repository_id`, `query_length` |
| `cli.workflow.list` | CLI workflow list command executed | `repository_id`, `result_count`, `output_format` (json/table) |

## Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| **List completion rate** | > 98% | Percentage of list requests that return HTTP 200 |
| **Workflow open rate** | > 65% | Percentage of list views where user opens at least one workflow definition |
| **Filter adoption** | > 20% | Percentage of list views where user applies a filter |
| **Search adoption** | > 10% | Percentage of list views where user uses text search |
| **Dispatch from list** | > 5% | Percentage of list views where user dispatches a workflow directly |
| **Empty state conversion** | > 15% | Percentage of empty-state views where user subsequently creates a workflow |
| **Median load time** | < 500ms | Time from request to full response for the API endpoint |
| **P99 load time** | < 2000ms | 99th percentile API response time |

## Observability

## Logging Requirements

| Log Level | Event | Structured Context |
|-----------|-------|--------------------|
| `DEBUG` | Request received for workflow definition list | `repository_id`, `page`, `per_page`, `user_id`, `request_id` |
| `DEBUG` | Database query executed | `repository_id`, `offset`, `limit`, `duration_ms`, `row_count` |
| `INFO` | Successful list response served | `repository_id`, `result_count`, `page`, `duration_ms`, `request_id` |
| `WARN` | Rate limit approaching threshold (>80% consumed) | `user_id`, `remaining`, `limit`, `endpoint` |
| `WARN` | Slow query detected (>1000ms) | `repository_id`, `duration_ms`, `page`, `per_page`, `request_id` |
| `ERROR` | Database query failure | `repository_id`, `error_message`, `error_code`, `request_id` |
| `ERROR` | Repository resolution failure | `owner`, `repo`, `error_message`, `request_id` |
| `ERROR` | Unexpected handler exception | `error_message`, `stack_trace`, `request_id` |

## Prometheus Metrics

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_definition_list_requests_total` | `status` (200, 400, 401, 404, 429, 500) | Total list requests by response status |
| `codeplane_workflow_definition_list_errors_total` | `error_type` (db_error, auth_error, validation_error, unknown) | Total errors by type |

**Histograms:**

| Metric | Buckets | Labels | Description |
|--------|---------|--------|-------------|
| `codeplane_workflow_definition_list_duration_seconds` | 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 | `status` | End-to-end request duration |
| `codeplane_workflow_definition_list_db_duration_seconds` | 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0 | — | Database query duration only |

**Gauges:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_definitions_per_repo` | `repository_id` | Number of workflow definitions per repository (sampled) |

## Alerts & Runbooks

### Alert 1: High Error Rate
- **Condition:** `rate(codeplane_workflow_definition_list_errors_total{error_type!="auth_error"}[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check Grafana dashboard for `codeplane_workflow_definition_list_errors_total` breakdown by `error_type`.
  2. If `db_error` is dominant: check database connectivity via `SELECT 1`, check `workflow_definitions` table for locks or schema issues, review recent migrations.
  3. If `validation_error` is dominant: check for clients sending malformed pagination parameters; may indicate a client regression.
  4. If `unknown` is dominant: review server error logs filtered by `request_id` to identify stack traces.
  5. Escalate if not resolved within 15 minutes.

### Alert 2: High Latency
- **Condition:** `histogram_quantile(0.99, rate(codeplane_workflow_definition_list_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_definition_list_db_duration_seconds` to isolate whether latency is in the database or elsewhere.
  2. If database latency is high: check for missing indexes on `workflow_definitions(repository_id)`, check table size with `SELECT count(*) FROM workflow_definitions`, check for table bloat or vacuum needs.
  3. If application latency is high: check server CPU and memory, check for goroutine/fiber contention, review recent deployments.
  4. If specific to one repository: check if that repository has an unusually large number of definitions; consider caching.

### Alert 3: Sustained 5xx Responses
- **Condition:** `rate(codeplane_workflow_definition_list_requests_total{status="500"}[5m]) > 0.01`
- **Severity:** Critical
- **Runbook:**
  1. Immediately check server error logs for stack traces with `request_id` correlation.
  2. Verify database is reachable and responding.
  3. Check if the issue is isolated to this endpoint or affecting all routes (broader server failure).
  4. If isolated: check recent code changes to workflow routes, consider reverting.
  5. If broad: follow general server incident runbook.
  6. Page on-call backend engineer if not resolved within 5 minutes.

### Alert 4: Rate Limiting Spike
- **Condition:** `rate(codeplane_workflow_definition_list_requests_total{status="429"}[5m]) > 1.0`
- **Severity:** Info
- **Runbook:**
  1. Identify the user(s) being rate-limited from structured logs.
  2. Determine if this is legitimate heavy usage (e.g., a CI integration polling frequently) or potential abuse.
  3. If legitimate: consider increasing the rate limit for the specific user or recommending they use pagination and caching.
  4. If abusive: consider temporary IP-level blocking and review auth token origin.

## Error Cases & Failure Modes

| Error Case | Expected Behavior | Detection |
|------------|-------------------|----------|
| Database connection lost | HTTP 500, error logged, error counter incremented | `db_error` counter spike |
| Database query timeout | HTTP 500 after timeout, error logged | DB duration histogram p99 spike |
| Repository ID resolution fails | HTTP 404 | Increased 404 rate for valid repositories |
| Malformed pagination parameters | HTTP 400 with descriptive message | `validation_error` counter |
| Auth token expired mid-request | HTTP 401 | `auth_error` counter |
| Server OOM during large config serialization | Process restart, no response | Container restart count |
| Concurrent schema migration during query | Potential transient error, retry-safe | Transient `db_error` spike |

## Verification

## API Integration Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `api.wf.list.empty` | List workflow definitions for a repo with no definitions | HTTP 200, `{ "workflows": [] }` |
| `api.wf.list.single` | Create one definition, then list | HTTP 200, array of 1 item with correct fields |
| `api.wf.list.multiple` | Create 5 definitions, then list | HTTP 200, array of 5 items ordered by id DESC |
| `api.wf.list.response_shape` | Verify every field is present and correctly typed | `id` is number, `name` is string, `path` is string, `config` is object or null, `is_active` is boolean, `created_at` and `updated_at` are ISO 8601 strings |
| `api.wf.list.ordering` | Create definitions A, B, C, list them | C appears first (highest id), A appears last |
| `api.wf.list.active_and_inactive` | Create one active and one inactive definition | Both appear in the list with correct `is_active` values |
| `api.wf.list.config_preserved` | Create definition with complex config (nested triggers, jobs) | Config object in response matches what was stored |
| `api.wf.list.unicode_name` | Create definition with Unicode name (e.g., "工作流-テスト") | Name returned correctly in UTF-8 |
| `api.wf.list.max_name_length` | Create definition with 255-character name | Definition appears in list with full name |
| `api.wf.list.max_path_length` | Create definition with 512-character path | Definition appears in list with full path |

## Pagination Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `api.wf.list.pagination.default` | List without pagination params (35 definitions seeded) | Returns 30 items (default page size) |
| `api.wf.list.pagination.page2` | `?page=2` with 35 definitions | Returns 5 items |
| `api.wf.list.pagination.per_page_10` | `?per_page=10` with 25 definitions | Returns 10 items |
| `api.wf.list.pagination.per_page_100` | `?per_page=100` with 100 definitions seeded | Returns 100 items (maximum valid size) |
| `api.wf.list.pagination.per_page_101` | `?per_page=101` | HTTP 400, `"per_page must not exceed 100"` |
| `api.wf.list.pagination.per_page_0` | `?per_page=0` | HTTP 400, `"invalid per_page value"` |
| `api.wf.list.pagination.per_page_negative` | `?per_page=-1` | HTTP 400, `"invalid per_page value"` |
| `api.wf.list.pagination.page_0` | `?page=0` | HTTP 400, `"invalid page value"` |
| `api.wf.list.pagination.page_negative` | `?page=-1` | HTTP 400, `"invalid page value"` |
| `api.wf.list.pagination.page_non_numeric` | `?page=abc` | HTTP 400, `"invalid page value"` |
| `api.wf.list.pagination.beyond_data` | `?page=999` with 5 definitions | HTTP 200, `{ "workflows": [] }` |
| `api.wf.list.pagination.cursor_based` | `?cursor=0&limit=10` with 25 definitions | Returns first 10 items |
| `api.wf.list.pagination.cursor_offset` | `?cursor=10&limit=10` with 25 definitions | Returns items 11–20 |
| `api.wf.list.pagination.limit_max` | `?limit=100` with 100 definitions | Returns 100 items |
| `api.wf.list.pagination.limit_over_max` | `?limit=101` | Clamped to 100 (returns 100 items) |
| `api.wf.list.pagination.limit_0` | `?limit=0` | HTTP 400, `"invalid limit value"` |

## Auth & Permissions Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `api.wf.list.auth.unauthenticated` | Request without auth token | HTTP 401 |
| `api.wf.list.auth.valid_pat` | Request with valid PAT | HTTP 200 |
| `api.wf.list.auth.expired_pat` | Request with expired PAT | HTTP 401 |
| `api.wf.list.auth.revoked_pat` | Request with revoked PAT | HTTP 401 |
| `api.wf.list.auth.public_repo_any_user` | Authenticated user lists workflows on public repo they don't own | HTTP 200 |
| `api.wf.list.auth.private_repo_no_access` | Authenticated user lists workflows on private repo they have no access to | HTTP 404 |
| `api.wf.list.auth.private_repo_read_access` | User with read access on private repo | HTTP 200 |
| `api.wf.list.auth.private_repo_write_access` | User with write access on private repo | HTTP 200 |
| `api.wf.list.auth.private_repo_admin` | Admin user on private repo | HTTP 200 |

## Repository Edge Case Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `api.wf.list.repo.not_found` | List workflows for nonexistent `owner/repo` | HTTP 404 |
| `api.wf.list.repo.archived` | List workflows for archived repository | HTTP 200 with definitions |
| `api.wf.list.repo.special_chars_owner` | Owner with hyphens/underscores | HTTP 200 (correct resolution) |
| `api.wf.list.repo.special_chars_repo` | Repo name with hyphens/underscores/dots | HTTP 200 (correct resolution) |

## CLI E2E Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.list.json` | `codeplane workflow list --repo owner/repo --json` | Outputs valid JSON with `workflows` array |
| `cli.wf.list.table` | `codeplane workflow list --repo owner/repo` | Outputs human-readable table with headers |
| `cli.wf.list.empty` | List on repo with no workflows | Empty list or "no workflows" message |
| `cli.wf.list.auto_repo` | Run `codeplane workflow list` inside a cloned repo dir | Auto-detects repo context and lists workflows |
| `cli.wf.list.invalid_repo` | `codeplane workflow list --repo nonexistent/repo` | Exit code 1, error message printed |
| `cli.wf.list.no_auth` | Run without configured authentication | Exit code 1, auth error message |
| `cli.wf.list.with_definitions` | Seed 3 workflow definitions, then list | All 3 appear in output with correct names |

## TUI E2E Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `tui.wf.list.render` | Open workflow list screen for repo with 3 definitions | Screen renders with 3 rows, correct status icons, names, paths |
| `tui.wf.list.empty` | Open workflow list screen for repo with no definitions | Empty state message displayed |
| `tui.wf.list.navigation` | Press `j`/`k` to navigate list | Cursor moves between items with visual highlight |
| `tui.wf.list.open` | Press `Enter` on a workflow | Navigates to workflow run list screen |
| `tui.wf.list.filter_cycle` | Press `f` three times | Filter cycles: All → Active → Inactive → All |
| `tui.wf.list.search` | Press `/`, type partial name, confirm | List filters to matching definitions |
| `tui.wf.list.search_no_match` | Search for nonexistent name | Empty filtered list with "no matching workflows" message |
| `tui.wf.list.pagination` | Seed 35 definitions, press `n` for next page | Page 2 loads with 5 items |
| `tui.wf.list.back` | Press `q` from workflow list | Returns to previous screen |
| `tui.wf.list.loading` | Open screen on slow network | Loading skeleton visible before data appears |
| `tui.wf.list.active_icon` | Active definition displayed | Green `●` icon shown |
| `tui.wf.list.inactive_icon` | Inactive definition displayed | Gray `○` icon shown |
| `tui.wf.list.dispatch` | Press `d` on a dispatchable workflow | Dispatch overlay appears |
| `tui.wf.list.responsive_narrow` | Render at 80×24 | Path column hidden, names truncated |
| `tui.wf.list.responsive_wide` | Render at 200×60 | All columns visible, full names |

## Playwright (Web UI) E2E Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `web.wf.list.render` | Navigate to `/:owner/:repo/workflows` with 3 definitions | Table renders with 3 rows |
| `web.wf.list.empty` | Navigate to workflows for repo with none | Empty state illustration and message displayed |
| `web.wf.list.columns` | Verify table columns | Status, Name, Path, Latest Run, Last Run Time columns present |
| `web.wf.list.click_workflow` | Click on a workflow name | Navigates to workflow detail/runs page |
| `web.wf.list.pagination_controls` | Seed 35 definitions | Pagination controls visible, page 2 navigable |
| `web.wf.list.filter_active` | Select "Active" filter | Only active definitions shown |
| `web.wf.list.filter_inactive` | Select "Inactive" filter | Only inactive definitions shown |
| `web.wf.list.search` | Type in search box | List filters in real-time |
| `web.wf.list.loading` | Throttle network, navigate to workflows | Loading skeleton displayed |
| `web.wf.list.breadcrumb` | Check page header | Repository context breadcrumb is correct |
| `web.wf.list.dispatch_button_visible` | User with write access | "Run workflow" button visible on rows |
| `web.wf.list.dispatch_button_hidden` | User with read-only access | "Run workflow" button not rendered |
| `web.wf.list.private_repo_no_access` | Navigate as unauthorized user | Redirected or shown 404 page |

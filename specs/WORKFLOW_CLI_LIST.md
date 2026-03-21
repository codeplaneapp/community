# WORKFLOW_CLI_LIST

Specification for WORKFLOW_CLI_LIST.

## High-Level User POV

When a developer wants to see what automations exist in a repository, they run `codeplane workflow list` from their terminal. This command shows them every workflow definition registered for the repository — CI pipelines, deploy scripts, nightly test suites, agent-driven task workflows — in a clean, scannable table. The developer should immediately understand each workflow's name, where the definition file lives in the repository, whether the workflow is currently active, and when it was last updated.

The command should work seamlessly whether the developer is inside a cloned repository directory (auto-detecting the repo context) or specifying a remote repository explicitly with `--repo`. For developers building scripts and integrations, the command supports `--json` output for machine-readable consumption, including optional field filtering via `--json .name` or `--json name,path,is_active`. For repositories with many workflows, the command supports pagination with `--page` and `--limit` flags so that developers can page through results without being overwhelmed.

The workflow list is the starting point for a developer's interaction with Codeplane's automation system from the CLI. After listing workflows, they can dispatch one, view its runs, or watch a live execution — all from the same command family. The experience should feel consistent with `codeplane issue list` and `codeplane repo list`: the same flags, same table formatting style, same `--json` output behavior, and same error handling conventions.

For agent-augmented teams, the CLI workflow list is often consumed programmatically — an agent may list workflows, identify the right one by name, and then dispatch it. The `--json` output with field filtering makes this machine-driven flow reliable and predictable.

## Acceptance Criteria

### Core Behavior
- [ ] `codeplane workflow list` returns all workflow definitions for the resolved repository
- [ ] Results are ordered by definition ID descending (newest first), matching the API ordering
- [ ] The default output is a human-readable ASCII table with columns: ID, Name, Path, Active, Updated
- [ ] When no workflows exist, the command prints `No workflows found` and exits with code 0
- [ ] The command resolves the repository from the `--repo` flag first, then from the current directory's git/jj remote context if `--repo` is omitted

### Pagination
- [ ] `--page` flag accepts a positive integer (default: 1) to select the result page
- [ ] `--limit` flag accepts a positive integer (default: 30, max: 100) to control results per page
- [ ] Pagination parameters are forwarded to the API as `page` and `per_page` query parameters
- [ ] When there are more results than the current page shows, the table footer indicates pagination context (e.g., `Showing 30 of 42 workflows (page 1)`)
- [ ] Requesting a page with no results prints `No workflows found` and exits with code 0

### Structured Output
- [ ] `--json` flag outputs the raw API response as pretty-printed JSON to stdout
- [ ] When `--json` is combined with a field selector (e.g., `--json name,path`), only the selected fields are included in the output
- [ ] JSON output goes to stdout while any status messages go to stderr, keeping stdout parseable
- [ ] The JSON envelope matches the API response shape: `{ "workflows": [...] }`

### Table Formatting
- [ ] Column headers are: `ID`, `Name`, `Path`, `Active`, `Updated`
- [ ] `ID` column shows the numeric workflow definition ID
- [ ] `Name` column shows the workflow name string
- [ ] `Path` column shows the file path (e.g., `.codeplane/workflows/ci.ts`)
- [ ] `Active` column shows `✓` for active workflows and `✗` for inactive
- [ ] `Updated` column shows the ISO 8601 `updated_at` timestamp
- [ ] Column widths auto-size based on content (consistent with `formatTable` used by issue/repo list commands)
- [ ] Columns are separated by two spaces (consistent with existing table formatting)

### Error Handling
- [ ] If `--repo` is not provided and the current directory has no detectable repository context, the command prints an error and exits with code 1
- [ ] If the specified repository does not exist, the command prints a repository-not-found error and exits with code 1
- [ ] If the user is not authenticated, the command prints an authentication error and exits with code 1
- [ ] If the user lacks read access to a private repository, the command receives HTTP 404 (no existence leak) and prints a repository-not-found error
- [ ] Network errors print a connection error message and exit with code 1
- [ ] API errors (4xx/5xx) are surfaced with the error message from the response body

### Boundary Constraints
- [ ] `--page 0` or `--page -1` results in an API 400 error, surfaced to the user
- [ ] `--limit 0` or `--limit -1` results in an API 400 error, surfaced to the user
- [ ] `--limit 101` results in an API 400 error with message `per_page must not exceed 100`
- [ ] Workflow names containing Unicode characters display correctly in the table
- [ ] Workflow names up to 255 characters are displayed without truncation in table output
- [ ] Workflow paths up to 512 characters are displayed without truncation in table output
- [ ] Non-numeric `--page` values are rejected by the CLI argument parser before making an API call

### Definition of Done
- [ ] `workflow list` command accepts `--repo`, `--page`, `--limit` flags with correct types and defaults
- [ ] Human-readable table output uses `formatWorkflowList()` function added to `output.ts`
- [ ] JSON structured output returns the raw API response when `--json` is specified
- [ ] The command follows the same `shouldReturnStructuredOutput` pattern used by `issue list` and `repo list`
- [ ] E2E tests for CLI workflow list pass (table output, JSON output, empty state, error states, pagination)
- [ ] The command is documented in the CLI help output and user documentation

## Design

### CLI Command

**Command:** `codeplane workflow list`

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | Auto-detected from cwd | Repository in `OWNER/REPO` format |
| `--page` | integer | 1 | Page number |
| `--limit` | integer | 30 | Results per page (max 100) |

**Implicit flags (provided by framework):**
| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Output raw JSON response (may include field selector) |
| `--format` | string | Output format override |

**Human-readable output (default):**

```
ID  Name            Path                              Active  Updated
--  ----            ----                              ------  -------
42  CI Pipeline     .codeplane/workflows/ci.ts        ✓       2026-03-21T09:15:00.000Z
41  Deploy Staging  .codeplane/workflows/deploy.ts    ✓       2026-03-20T18:30:00.000Z
39  Nightly Tests   .codeplane/workflows/nightly.ts   ✗       2026-03-19T04:00:00.000Z
```

When no workflows are found:

```
No workflows found
```

**JSON output (`--json`):**

```json
{
  "workflows": [
    {
      "id": 42,
      "repository_id": 7,
      "name": "CI Pipeline",
      "path": ".codeplane/workflows/ci.ts",
      "config": { "on": { "push": { "branches": ["main"] } } },
      "is_active": true,
      "created_at": "2026-03-20T14:30:00.000Z",
      "updated_at": "2026-03-21T09:15:00.000Z"
    }
  ]
}
```

**JSON output with field selector (`--json name,path`):**

```json
[
  { "name": "CI Pipeline", "path": ".codeplane/workflows/ci.ts" },
  { "name": "Deploy Staging", "path": ".codeplane/workflows/deploy.ts" }
]
```

**Error behavior:**

| Scenario | Output (stderr) | Exit Code |
|----------|-----------------|--------|
| No repo context | `Error: Could not determine repository. Use --repo OWNER/REPO or run from inside a repository.` | 1 |
| Repository not found | `Error: repository not found` | 1 |
| Not authenticated | `Error: Not authenticated. Run 'codeplane auth login' to sign in.` | 1 |
| Network failure | `Error: Failed to connect to <url>` | 1 |
| API error (400/500) | `Error: <message from response body>` | 1 |

### API Shape

The CLI command consumes the existing API endpoint:

**Endpoint:** `GET /api/repos/:owner/:repo/workflows`

**Query Parameters sent by CLI:**

| Parameter | Source | Description |
|-----------|--------|-------------|
| `page` | `--page` flag value | Page number (default: 1) |
| `per_page` | `--limit` flag value | Items per page (default: 30) |

**Response consumed:** HTTP 200 with `{ "workflows": [...] }` envelope.

The CLI uses the legacy `page`/`per_page` approach consistent with the issue list and repo list commands.

### SDK Shape

The CLI consumes the API via the `api()` helper in `apps/cli/src/client.ts`. No new SDK method is required — the CLI makes a direct HTTP call to the API endpoint with query parameters, consistent with how `issue list` constructs its URL via `URLSearchParams`.

The response type consumed by the CLI is:

```typescript
interface WorkflowListResponse {
  workflows: Array<{
    id: number;
    repository_id: number;
    name: string;
    path: string;
    config: unknown;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
}
```

### Output Formatting

A new `formatWorkflowList()` function is added to `apps/cli/src/output.ts`, following the pattern established by `formatIssueList()`, `formatRepoList()`, and `formatLandingList()`:

```
formatWorkflowList(workflows: JsonRecord[]): string
```

- Handles the empty case by returning `"No workflows found"`
- Maps each workflow to a row: `[id, name, path, active indicator, updated_at]`
- Active indicator: `"✓"` when `is_active` is truthy, `"✗"` otherwise
- Uses the shared `formatTable()` function for consistent column alignment

### Documentation

The following user-facing documentation should exist:

- **CLI Reference — `workflow list`:** Document the command's purpose, all flags with defaults and value constraints, and example output for both table and JSON modes. Include examples of auto-detection from repository context versus explicit `--repo` usage.
- **Workflow Overview Guide:** Reference `workflow list` as the first step for discovering automations in a repository, with a terminal screenshot showing example output.
- **JSON Output Guide:** Document how `--json` and field selectors work with workflow list, including examples of `--json name,path` for scripting use cases.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Repository Owner** | Can list workflow definitions |
| **Repository Admin** | Can list workflow definitions |
| **Repository Write Member** | Can list workflow definitions |
| **Repository Read Member** | Can list workflow definitions |
| **Organization Member** (non-repo member, public repo) | Can list workflow definitions |
| **Authenticated User** (public repo) | Can list workflow definitions |
| **Authenticated User** (private repo, no access) | CLI prints "repository not found", exit code 1 (HTTP 404 from API — no existence leak) |
| **Unauthenticated** | CLI prints authentication error, exit code 1 (HTTP 401 from API) |

### Rate Limiting

The CLI does not implement its own rate limiting. It relies on the server-side rate limit enforced on `GET /api/repos/:owner/:repo/workflows`:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `GET /api/repos/:owner/:repo/workflows` | 300 requests | Per minute, per authenticated user |

When the server returns HTTP 429, the CLI should print a user-friendly message: `Error: Rate limit exceeded. Try again later.` and exit with code 1.

### Data Privacy

- The CLI does not log or cache credentials beyond the stored auth token managed by `codeplane auth login`.
- The `config` field in workflow definitions may contain workflow configuration but must never contain secrets or credentials (enforced server-side).
- The `--json` output may expose `repository_id` and full `config` objects; this is expected behavior for authenticated users with repository access.
- No PII is present in workflow definition data (names, paths, and timestamps are organizational metadata, not personal data).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `cli.workflow.list` | CLI `workflow list` command executed successfully | `repository_id`, `owner`, `repo`, `page`, `per_page`, `result_count`, `output_format` (json/table), `repo_detection_method` (flag/auto) |
| `cli.workflow.list.empty` | Command returns zero workflow definitions | `repository_id`, `owner`, `repo`, `output_format` |
| `cli.workflow.list.error` | Command fails with an error | `error_type` (auth/not_found/network/rate_limit/api_error), `error_message`, `owner`, `repo` |
| `cli.workflow.list.paginated` | User uses `--page` or `--limit` with non-default values | `repository_id`, `page`, `per_page`, `result_count` |

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| **CLI workflow list success rate** | > 95% | Percentage of `workflow list` invocations that exit with code 0 |
| **Repo auto-detection rate** | > 70% | Percentage of invocations where `--repo` was not explicitly provided (indicates ergonomic cwd detection) |
| **JSON output adoption** | > 30% | Percentage of invocations using `--json` (indicates scripting/agent usage) |
| **Pagination adoption** | > 5% | Percentage of invocations using non-default `--page` or `--limit` values |
| **Follow-through to dispatch** | > 10% | Percentage of `workflow list` invocations followed by `workflow dispatch` within the same session |
| **Empty state rate** | < 20% | Percentage of invocations returning zero results (high values suggest onboarding gap) |
| **Median CLI response time** | < 1000ms | Wall-clock time from command invocation to output completion |

## Observability

### Logging Requirements

| Log Level | Event | Structured Context |
|-----------|-------|-----------------------|
| `DEBUG` | CLI resolving repository context | `repo_flag` (if provided), `detected_owner`, `detected_repo`, `detection_method` (flag/remote) |
| `DEBUG` | API request being sent | `method` (GET), `url`, `page`, `per_page` |
| `DEBUG` | API response received | `status_code`, `duration_ms`, `body_size_bytes` |
| `INFO` | Workflow list command completed | `result_count`, `page`, `per_page`, `output_format`, `duration_ms` |
| `WARN` | Rate limit response received from server | `retry_after`, `owner`, `repo` |
| `ERROR` | API request failed (network error) | `error_message`, `url`, `owner`, `repo` |
| `ERROR` | API returned error status | `status_code`, `error_message`, `owner`, `repo` |
| `ERROR` | Repository context resolution failed | `repo_flag`, `cwd`, `error_message` |

Note: CLI logging is controlled by the CLI's verbosity level (e.g., `--verbose` flag) and writes to stderr. Only `ERROR` level messages are shown by default; `DEBUG` and `INFO` require explicit verbosity.

### Prometheus Metrics

These metrics are server-side (the CLI does not export Prometheus metrics). They cover the API endpoint that the CLI consumes:

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_definition_list_requests_total` | `status` (200, 400, 401, 404, 429, 500), `client` (cli, web, tui, editor) | Total list requests by status and client type |
| `codeplane_cli_workflow_list_invocations_total` | `exit_code` (0, 1), `output_format` (json, table) | Total CLI command invocations (if CLI telemetry is enabled) |

**Histograms:**

| Metric | Buckets | Labels | Description |
|--------|---------|--------|-------------|
| `codeplane_workflow_definition_list_duration_seconds` | 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 | `status`, `client` | API request duration |

**Gauges:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_definitions_per_repo` | `repository_id` | Number of workflow definitions per repository (sampled on list requests) |

### Alerts & Runbooks

#### Alert 1: CLI Workflow List High Error Rate (Server-Side)

- **Condition:** `rate(codeplane_workflow_definition_list_requests_total{status=~"5..",client="cli"}[5m]) / rate(codeplane_workflow_definition_list_requests_total{client="cli"}[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Open Grafana dashboard for `codeplane_workflow_definition_list_requests_total` and filter by `client=cli`, `status=5xx`.
  2. Check server error logs for stack traces correlated by `request_id`.
  3. Verify database connectivity: run `SELECT 1` and check `workflow_definitions` table health.
  4. Check if the issue is isolated to a specific repository (large definition count, corrupted config) by filtering logs by `repository_id`.
  5. If a recent deployment occurred, review the diff for changes to workflow route handlers or `WorkflowService.listWorkflowDefinitions`.
  6. If not resolved within 15 minutes, escalate to the backend on-call engineer.

#### Alert 2: CLI Workflow List High Latency

- **Condition:** `histogram_quantile(0.99, rate(codeplane_workflow_definition_list_duration_seconds_bucket{client="cli"}[5m])) > 3.0`
- **Severity:** Warning
- **Runbook:**
  1. Check if latency is in the database layer by comparing `codeplane_workflow_definition_list_db_duration_seconds` with the overall duration.
  2. If database is slow: check for missing indexes on `workflow_definitions(repository_id)`, table bloat, or long-running queries holding locks.
  3. If application layer is slow: check server CPU/memory utilization, check for event-loop blocking, and review recent deployments.
  4. If latency is specific to one repository: check the number of definitions in that repository and the size of `config` JSON objects. Repositories with extremely large configs may need config truncation or lazy loading.
  5. Verify no network-level issues between CLI users and the server (check geographic latency patterns).

#### Alert 3: Sustained 404s from CLI Clients

- **Condition:** `rate(codeplane_workflow_definition_list_requests_total{status="404",client="cli"}[10m]) > 5.0`
- **Severity:** Info
- **Runbook:**
  1. Check if there is a pattern in the 404 responses — are users specifying incorrect `--repo` values?
  2. Review server access logs for the `owner`/`repo` values producing 404s.
  3. If many users are hitting the same nonexistent repo, check for a documentation or configuration issue (e.g., renamed repository, incorrect example in docs).
  4. If the 404s are for repos that should exist, check repository resolution logic for regressions.
  5. No immediate action required unless accompanied by user reports.

### Error Cases & Failure Modes

| Error Case | Expected CLI Behavior | Detection |
|------------|----------------------|----------|
| No auth token configured | Print auth error, exit 1 | `requireAuthToken()` throws before API call |
| `--repo` format invalid (missing `/`) | Print argument validation error, exit 1 | `resolveRepoRef()` throws |
| Repository does not exist | Print "repository not found", exit 1 | API returns 404 |
| Private repo, user lacks access | Print "repository not found", exit 1 | API returns 404 |
| Auth token expired | Print auth error, exit 1 | API returns 401 |
| Auth token revoked | Print auth error, exit 1 | API returns 401 |
| Rate limit exceeded | Print rate limit message, exit 1 | API returns 429 |
| Server internal error | Print server error message, exit 1 | API returns 500 |
| Network timeout | Print connection error, exit 1 | `fetch()` rejects |
| DNS resolution failure | Print connection error, exit 1 | `fetch()` rejects |
| Malformed API response (invalid JSON) | Print parse error, exit 1 | JSON.parse throws |
| `--page` with non-numeric value | CLI argument parser rejects before API call | Zod validation |
| `--limit` with non-numeric value | CLI argument parser rejects before API call | Zod validation |

## Verification

### CLI E2E Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.list.table.default` | Run `codeplane workflow list --repo owner/repo` against repo with 3 workflow definitions | Output is a table with headers `ID`, `Name`, `Path`, `Active`, `Updated` and 3 data rows; exit code 0 |
| `cli.wf.list.table.columns` | Run `codeplane workflow list --repo owner/repo` and verify column content | Each row has correct `id` (number), `name` (string), `path` (string), `Active` (✓ or ✗), `Updated` (ISO timestamp) |
| `cli.wf.list.table.active_indicator` | Seed 1 active and 1 inactive workflow definition | Active workflow row shows `✓`, inactive shows `✗` |
| `cli.wf.list.table.ordering` | Seed definitions A (id=1), B (id=2), C (id=3) | Table shows C first (newest), A last (oldest) |
| `cli.wf.list.empty` | Run against repo with no workflow definitions | Output is `No workflows found`; exit code 0 |
| `cli.wf.list.json.default` | Run `codeplane workflow list --repo owner/repo --json` against repo with 3 definitions | stdout is valid JSON with `{ "workflows": [...] }` containing 3 items; exit code 0 |
| `cli.wf.list.json.envelope` | Run with `--json` and verify response shape | JSON has top-level `workflows` key that is an array |
| `cli.wf.list.json.fields` | Run with `--json` and verify each workflow object | Each object has `id`, `repository_id`, `name`, `path`, `config`, `is_active`, `created_at`, `updated_at` |
| `cli.wf.list.json.field_filter` | Run `codeplane workflow list --repo owner/repo --json name,path` | Output contains only `name` and `path` fields per item |
| `cli.wf.list.json.empty` | Run `--json` against repo with no definitions | stdout is `{ "workflows": [] }`; exit code 0 |
| `cli.wf.list.auto_repo` | Run `codeplane workflow list` from inside a cloned repository directory | Command auto-detects repo from git/jj remote and returns results; exit code 0 |
| `cli.wf.list.explicit_repo` | Run `codeplane workflow list --repo owner/repo` from a directory with no repo context | Command uses the explicit `--repo` flag successfully; exit code 0 |

### Pagination Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.list.pagination.default` | Seed 35 definitions, run without `--page` or `--limit` | Returns 30 items (default page size) |
| `cli.wf.list.pagination.page2` | Seed 35 definitions, run with `--page 2` | Returns 5 items |
| `cli.wf.list.pagination.limit_10` | Seed 25 definitions, run with `--limit 10` | Returns 10 items |
| `cli.wf.list.pagination.limit_100` | Seed 100 definitions, run with `--limit 100` | Returns 100 items (maximum valid size) |
| `cli.wf.list.pagination.limit_101` | Run with `--limit 101` | Exit code 1, error message contains "per_page must not exceed 100" |
| `cli.wf.list.pagination.limit_0` | Run with `--limit 0` | Exit code 1, error message contains "invalid per_page value" |
| `cli.wf.list.pagination.limit_negative` | Run with `--limit -1` | Exit code 1, error message about invalid value |
| `cli.wf.list.pagination.page_0` | Run with `--page 0` | Exit code 1, error message contains "invalid page value" |
| `cli.wf.list.pagination.page_negative` | Run with `--page -1` | Exit code 1, error message about invalid value |
| `cli.wf.list.pagination.beyond_data` | Seed 5 definitions, run with `--page 999` | Output is `No workflows found`; exit code 0 |
| `cli.wf.list.pagination.page_and_limit` | Seed 25 definitions, run with `--page 2 --limit 10` | Returns items 11–20 (10 items) |
| `cli.wf.list.pagination.json` | Seed 35 definitions, run with `--page 1 --limit 10 --json` | JSON output contains exactly 10 workflow objects |

### Auth & Permissions Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.list.auth.no_token` | Run without configured auth token | Exit code 1, error message about authentication |
| `cli.wf.list.auth.valid_pat` | Run with valid PAT | Exit code 0, workflows listed |
| `cli.wf.list.auth.expired_pat` | Run with expired PAT | Exit code 1, auth error |
| `cli.wf.list.auth.revoked_pat` | Run with revoked PAT | Exit code 1, auth error |
| `cli.wf.list.auth.public_repo_other_user` | Authenticated user lists workflows on public repo they don't own | Exit code 0, workflows listed |
| `cli.wf.list.auth.private_repo_no_access` | Authenticated user lists workflows on private repo they lack access to | Exit code 1, "repository not found" error (no existence leak) |
| `cli.wf.list.auth.private_repo_read_access` | User with read access on private repo | Exit code 0, workflows listed |

### Error Handling Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.list.error.no_repo_context` | Run `codeplane workflow list` from a directory with no repository context and no `--repo` flag | Exit code 1, error about repository detection |
| `cli.wf.list.error.invalid_repo_format` | Run with `--repo invalid-format` (no slash) | Exit code 1, error about invalid repository format |
| `cli.wf.list.error.repo_not_found` | Run with `--repo nonexistent/repo` | Exit code 1, error "repository not found" |
| `cli.wf.list.error.network` | Run with API server unreachable | Exit code 1, connection error message |
| `cli.wf.list.error.server_500` | Server returns 500 | Exit code 1, error message from response |

### Edge Case & Boundary Tests

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.wf.list.edge.unicode_name` | Seed workflow with Unicode name `工作流-テスト` | Name appears correctly in table and JSON output |
| `cli.wf.list.edge.max_name_255` | Seed workflow with 255-character name | Full name appears in table output without truncation |
| `cli.wf.list.edge.max_path_512` | Seed workflow with 512-character path | Full path appears in table output without truncation |
| `cli.wf.list.edge.name_over_255` | Attempt to seed workflow with 256-character name | Rejected during creation (not a list concern, but verifies boundary) |
| `cli.wf.list.edge.special_chars_in_name` | Seed workflow with name containing `<>&"'` | Characters display correctly, no HTML encoding in CLI output |
| `cli.wf.list.edge.null_config` | Seed workflow with null config | `config` shows as `null` in JSON, row still renders in table |
| `cli.wf.list.edge.complex_config` | Seed workflow with deeply nested config (5 levels deep) | JSON output preserves full config; table output unaffected |
| `cli.wf.list.edge.single_workflow` | Seed exactly 1 workflow definition | Table has 1 data row plus headers |
| `cli.wf.list.edge.exactly_30` | Seed exactly 30 definitions | Returns all 30 on page 1, no need for page 2 |
| `cli.wf.list.edge.exactly_31` | Seed exactly 31 definitions | Page 1 returns 30, page 2 returns 1 |
| `cli.wf.list.edge.repo_with_hyphens` | Seed repo `my-org/my-repo-name`, run `--repo my-org/my-repo-name` | Resolves correctly and lists workflows |
| `cli.wf.list.edge.repo_with_dots` | Seed repo `org/repo.js`, run `--repo org/repo.js` | Resolves correctly and lists workflows |

### API Integration Tests (CLI validates API contract)

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `api.wf.list.response_shape` | CLI `--json` output verified against expected schema | Every workflow has `id` (number), `name` (string), `path` (string), `config` (object|null), `is_active` (boolean), `created_at` (ISO 8601), `updated_at` (ISO 8601) |
| `api.wf.list.created_at_format` | Verify `created_at` field format | Matches ISO 8601 pattern `YYYY-MM-DDTHH:mm:ss.SSSZ` |
| `api.wf.list.updated_at_format` | Verify `updated_at` field format | Matches ISO 8601 pattern `YYYY-MM-DDTHH:mm:ss.SSSZ` |
| `api.wf.list.is_active_boolean` | Verify `is_active` is strictly boolean | Not a string "true"/"false", not 0/1, is `true` or `false` |
| `api.wf.list.id_positive_integer` | Verify `id` is a positive integer | Greater than 0, no decimals |

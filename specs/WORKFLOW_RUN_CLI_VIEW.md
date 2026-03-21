# WORKFLOW_RUN_CLI_VIEW

Specification for WORKFLOW_RUN_CLI_VIEW.

## High-Level User POV

When a developer needs to understand what happened during a specific workflow run, they type `codeplane run view <id>` in their terminal. This single command answers all the most pressing questions about a run: Did it succeed? Which workflow ran? What triggered it? How long did it take? And critically — which steps passed and which ones failed?

The command presents a clean, human-readable summary that is designed for at-a-glance debugging. At the top, the developer sees the run number alongside a status indicator — a checkmark for success, an X for failure, a spinner character for running, or other intuitive icons for queued, cancelled, and skipped states. Immediately below, they see the workflow name and its definition file path, followed by the trigger context: what event started this run, which branch or reference it targeted, and the commit SHA involved.

Below the header, a step table lists every step in the workflow with its status icon, position number, name, and duration. A developer can scan this list in seconds to find exactly which step broke, how long each step took, and whether the overall pipeline is healthy. For running workflows, the view shows the current state of each step as of the moment the command was executed.

For scripting and agent-driven workflows, `--json` outputs the full structured API response including the run object, workflow metadata, step nodes with durations, the Mermaid graph definition, and the XML plan document. This makes `run view` the primary programmatic entry point for inspecting a workflow run from the terminal — agents can parse the JSON to decide whether to rerun a failed workflow, inspect which step failed, or extract timing data for reporting.

The command works seamlessly whether the developer is inside a cloned repository directory (auto-detecting the repository context) or specifying a remote repository explicitly with `--repo`. It follows the same conventions as `codeplane issue view` and `codeplane land view`: same flag patterns, same error messages, same structured output behavior, and same exit code semantics.

## Acceptance Criteria

### Core Behavior
- [ ] `codeplane run view <id>` fetches and displays the full workflow run detail for the given run ID
- [ ] The positional `<id>` argument is a required positive integer (the workflow run ID)
- [ ] The command resolves the repository from the `--repo` flag first, then from the current directory's git/jj remote context if `--repo` is omitted
- [ ] The default output is a human-readable formatted summary (not raw JSON)
- [ ] The formatted output includes: run number, status indicator, workflow name, workflow path, trigger event, trigger ref, trigger commit SHA (abbreviated to 7 characters), start time, total duration, and a step table
- [ ] The step table lists every step with: status icon, position number, step name, and human-readable duration
- [ ] Status icons in the output are: `✓` (success), `✗` (failure), `◎` (running), `◌` (queued), `✕` (cancelled), `⊘` (skipped), `⏱` (timeout)
- [ ] Duration is formatted as `Xs` for durations under 60 seconds and `Xm Ys` for 60 seconds or longer
- [ ] The command exits with code 0 on successful display

### Structured Output
- [ ] `--json` flag outputs the full API response as pretty-printed JSON to stdout
- [ ] JSON output includes `run`, `workflow`, `nodes`, `mermaid`, and `plan_xml` fields matching the v2 API response shape
- [ ] When `--json` is combined with a field selector (e.g., `--json run.status`), only the selected fields are included
- [ ] JSON output goes to stdout while any status/progress messages go to stderr, keeping stdout parseable

### Error Handling
- [ ] If `--repo` is not provided and the current directory has no detectable repository context, the command prints `Error: No repository context. Use --repo OWNER/REPO or run from a repository directory` to stderr and exits with code 1
- [ ] If the specified repository does not exist, the command prints `Error: repository not found` and exits with code 1
- [ ] If the user is not authenticated, the command prints an authentication error and exits with code 1
- [ ] If the user lacks read access to a private repository, the command receives HTTP 404 (no existence leak) and prints `Error: repository not found`
- [ ] If the run ID does not exist in the repository, the command prints `Error: Workflow run not found` and exits with code 1
- [ ] If the parent workflow definition has been deleted, the command prints `Error: Workflow definition not found` and exits with code 1
- [ ] Network errors print a connection error message and exit with code 1
- [ ] API errors (4xx/5xx) are surfaced with the error message from the response body
- [ ] Invalid run IDs (non-numeric, zero, negative, float) print `Error: Invalid run ID — must be a positive integer` and exit with code 1 (rejected by CLI argument parser before making an API call)

### Boundary Constraints
- [ ] Run IDs are positive integers; the maximum valid run ID is 2^63 - 1 (BigInt safe range)
- [ ] Step names may contain any Unicode characters and are displayed without truncation
- [ ] Step names up to 255 characters display correctly
- [ ] Workflow names up to 255 characters display correctly
- [ ] Workflow paths up to 512 characters display correctly
- [ ] Trigger ref strings up to 256 characters display correctly
- [ ] Trigger commit SHA is displayed as a 7-character abbreviation in formatted output and the full 40-character hex string in JSON output
- [ ] Runs with up to 200 steps display the complete step table
- [ ] A run with zero steps displays the header section but shows `No steps recorded` instead of the step table
- [ ] Step durations are non-negative; steps with null `started_at` show no duration indicator
- [ ] Unicode and emoji in step names, workflow names, and trigger refs render correctly in the terminal
- [ ] Mermaid-special characters in step names (pipes, quotes, angle brackets) display correctly in the formatted step table

### Definition of Done
- [ ] `run view` command accepts `<id>` positional argument and `--repo` option with correct types and defaults
- [ ] Human-readable formatted output uses a `formatRunView()` function added to `output.ts`, following the pattern of `formatIssueView()`, `formatLandingView()`, and `formatRepoView()`
- [ ] JSON structured output returns the raw API response when `--json` is specified, using the existing `shouldReturnStructuredOutput` pattern
- [ ] The command calls the v2 API endpoint `GET /api/repos/:owner/:repo/workflows/runs/:id` (not the legacy endpoint) to get the enriched response with nodes, mermaid, and plan_xml
- [ ] E2E tests for CLI run view pass (formatted output, JSON output, error states, boundary cases)
- [ ] The command is documented in the CLI help output and user documentation

## Design

### CLI Command

**Command:** `codeplane run view <id>`

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | positive integer | Yes | The workflow run ID to view |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | Auto-detected from cwd | Repository in `OWNER/REPO` format |

**Implicit flags (provided by framework):**

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean/string | Output raw JSON response (may include field selector) |

**Formatted output (default):**

```
Run #1047  ✓ Success
Workflow:  CI (.codeplane/workflows/ci.ts)
Trigger:   push to main @ a3f8c21
Started:   2026-03-22 10:15:30
Duration:  1m 5s

Steps:
  ✓  1. Checkout    2s
  ✓  2. Build       30s
  ✓  3. Test        33s
```

**Formatted output for a failed run:**

```
Run #1048  ✗ Failure
Workflow:  CI (.codeplane/workflows/ci.ts)
Trigger:   push to feature/auth @ b4e9d33
Started:   2026-03-22 11:20:00
Duration:  52s

Steps:
  ✓  1. Checkout    2s
  ✓  2. Build       25s
  ✗  3. Test        25s
```

**Formatted output for a running workflow:**

```
Run #1049  ◎ Running
Workflow:  Deploy (.codeplane/workflows/deploy.ts)
Trigger:   manual to main @ c5f0e44
Started:   2026-03-22 12:00:00
Duration:  45s

Steps:
  ✓  1. Checkout    2s
  ✓  2. Build       30s
  ◎  3. Deploy      13s
  ◌  4. Verify
```

**Formatted output for a queued run (not yet started):**

```
Run #1050  ◌ Queued
Workflow:  Nightly Tests (.codeplane/workflows/nightly.ts)
Trigger:   schedule @ main
Created:   2026-03-22 04:00:00

Steps:
  No steps recorded
```

**Formatted output for a run with zero steps:**

```
Run #1051  ✓ Success
Workflow:  Init (.codeplane/workflows/init.ts)
Trigger:   push to main @ d6a1b55
Started:   2026-03-22 13:00:00
Duration:  0s

Steps:
  No steps recorded
```

**Status mapping:**

| Run Status | Icon | Label |
|------------|------|-------|
| `success` | `✓` | `Success` |
| `failure` | `✗` | `Failure` |
| `running` | `◎` | `Running` |
| `queued` | `◌` | `Queued` |
| `cancelled` | `✕` | `Cancelled` |
| `timeout` | `⏱` | `Timeout` |

Step-level statuses use the same icons, plus:

| Step Status | Icon |
|-------------|------|
| `pending` | `◌` |
| `skipped` | `⊘` |

**Duration display rules:**
- Queued runs with null `started_at` show `Created:` timestamp instead of `Started:` and omit the `Duration:` line
- Running steps with no `completed_at` show their in-progress duration calculated as `now - started_at`
- Steps with null `started_at` show no duration value (the duration column is blank)

**Trigger display format:**
- `push to {ref} @ {sha:7}` — push events
- `manual to {ref} @ {sha:7}` — manual dispatch
- `schedule @ {ref}` — scheduled triggers (commit SHA may be empty)
- `landing_request to {ref} @ {sha:7}` — landing request triggers
- `webhook to {ref} @ {sha:7}` — webhook triggers
- `workflow_run to {ref} @ {sha:7}` — chained workflow triggers
- When `trigger_commit_sha` is empty, the `@ {sha}` portion is omitted

**JSON output (`--json`):**

```json
{
  "run": {
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
    "updated_at": "2026-03-22T10:16:35.000Z"
  },
  "workflow": {
    "id": 5,
    "name": "CI",
    "path": ".codeplane/workflows/ci.ts"
  },
  "nodes": [
    {
      "id": "101",
      "step_id": 101,
      "name": "Checkout",
      "position": 1,
      "status": "success",
      "iteration": 1,
      "started_at": "2026-03-22T10:15:30.000Z",
      "completed_at": "2026-03-22T10:15:32.000Z",
      "duration": "2s",
      "duration_seconds": 2
    }
  ],
  "mermaid": "graph TD\n  N1[\"Checkout\"]\n  ...",
  "plan_xml": "<?xml version=\"1.0\" ...>"
}
```

**Error behavior:**

| Scenario | Output (stderr) | Exit Code |
|----------|-----------------|--------|
| No repo context | `Error: No repository context. Use --repo OWNER/REPO or run from a repository directory` | 1 |
| Repository not found | `Error: repository not found` | 1 |
| Run not found | `Error: Workflow run not found` | 1 |
| Definition deleted | `Error: Workflow definition not found` | 1 |
| Not authenticated | `Error: Not authenticated. Run 'codeplane auth login' to sign in.` | 1 |
| Invalid run ID (non-numeric) | `Error: Invalid run ID — must be a positive integer` | 1 |
| Network failure | `Error: Failed to connect to <url>` | 1 |
| Rate limited | `Error: Rate limit exceeded. Try again later.` | 1 |
| API error (500) | `Error: <message from response body>` | 1 |

### API Shape

The CLI command consumes the existing v2 API endpoint:

**Endpoint:** `GET /api/repos/:owner/:repo/workflows/runs/:id`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `:owner` | string | Repository owner username or org name |
| `:repo` | string | Repository name |
| `:id` | positive integer | Workflow run ID |

**Response consumed:** HTTP 200 with `{ run, workflow, nodes, mermaid, plan_xml }` envelope.

The CLI currently calls the legacy endpoint `GET /api/repos/:owner/:repo/runs/:id`. This spec requires upgrading to the v2 endpoint to get the enriched response with workflow metadata, structured nodes, Mermaid graph, and XML plan. The v2 endpoint returns a superset of the legacy response and is the authoritative detail endpoint.

### SDK Shape

The CLI consumes the API via the `api()` helper in `apps/cli/src/client.ts`. No new SDK method is required. The response type consumed by the CLI is:

```typescript
interface WorkflowRunViewResponse {
  run: {
    id: number;
    repository_id: number;
    workflow_definition_id: number;
    status: string;
    trigger_event: string;
    trigger_ref: string;
    trigger_commit_sha: string;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
  };
  workflow: {
    id: number;
    name: string;
    path: string;
  };
  nodes: Array<{
    id: string;
    step_id: number;
    name: string;
    position: number;
    status: string;
    iteration: number;
    started_at: string | null;
    completed_at: string | null;
    duration: string;
    duration_seconds: number;
  }>;
  mermaid: string;
  plan_xml: string;
}
```

### Output Formatting

A new `formatRunView()` function is added to `apps/cli/src/output.ts`, following the pattern established by `formatIssueView()`, `formatLandingView()`, and `formatRepoView()`:

```
formatRunView(detail: JsonRecord): string
```

Internal helpers:

```
formatRunStatusIcon(status: string): string
formatRunStatusLabel(status: string): string
formatTrigger(event: string, ref: string, sha: string): string
formatStepTable(nodes: JsonRecord[]): string
```

- `formatRunStatusIcon()` maps status strings to Unicode icons
- `formatRunStatusLabel()` maps status strings to capitalized labels
- `formatTrigger()` builds the trigger line from event, ref, and abbreviated SHA
- `formatStepTable()` renders the step list with status icons, position numbers, names, and durations; returns `"No steps recorded"` for empty nodes arrays

### Documentation

The following user-facing documentation should exist:

- **CLI Reference — `codeplane run view`:** Document the command's purpose, the `<id>` argument and `--repo` flag, formatted and JSON output examples for all status types (success, failure, running, queued, cancelled, timeout), and examples of auto-detection versus explicit `--repo` usage.
- **Workflow Runs Guide:** Reference `run view` as the primary CLI command for inspecting individual workflow runs, with a terminal output example showing a failed run with the failing step highlighted.
- **JSON Output Guide:** Document how `--json` works with `run view`, including examples of using the output to extract specific fields like `run.status` or `nodes[].name` with `jq` for scripting use cases.
- **Debugging Workflow Failures Guide:** A workflow showing how to use `run view` to identify the failing step, then `run logs` to see detailed output, and then `run rerun` to retry — a cohesive debugging flow.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Repository Owner** | Can view run detail |
| **Repository Admin** | Can view run detail |
| **Repository Write Member** | Can view run detail |
| **Repository Read Member** | Can view run detail |
| **Organization Member** (non-repo member, public repo) | Can view run detail |
| **Authenticated User** (public repo) | Can view run detail |
| **Authenticated User** (private repo, no access) | CLI prints `Error: repository not found`, exit code 1 (HTTP 404 — no existence leak) |
| **Unauthenticated** | CLI prints authentication error, exit code 1 (HTTP 401) |

- The `run view` command is a read-only operation. No write permissions are required.
- Private repository run details require at least read access; public repository run details are available to any authenticated user.
- Run detail responses never include `agent_token_hash` or `agent_token_expires_at` fields, which are excluded server-side.

### Rate Limiting

The CLI does not implement its own rate limiting. It relies on the server-side rate limit:

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `GET /api/repos/:owner/:repo/workflows/runs/:id` | 300 requests | Per minute | Per authenticated user |

When the server returns HTTP 429, the CLI prints: `Error: Rate limit exceeded. Try again later.` and exits with code 1.

### Data Privacy

- The CLI does not log or cache credentials beyond the stored auth token managed by `codeplane auth login`.
- Log content is NOT included in the `run view` response (log content is only returned by `run logs` and the node detail endpoint). The `run view` response contains metadata only: step names, statuses, durations, and timestamps.
- The `mermaid` and `plan_xml` fields contain step names and statuses but no log content or secret references.
- Dispatch inputs (if present in the run object) may contain user-provided values; these are visible to anyone with repository read access.
- `trigger_commit_sha` and `trigger_ref` may reveal internal branch/bookmark names; this is safe for anyone with read access.
- The `--json` output may expose `repository_id` and full structured data; this is expected for authenticated users.
- No PII is present in workflow run metadata.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `cli.run.view` | CLI `run view` command executed successfully | `repository_id`, `owner`, `repo`, `run_id`, `run_status`, `workflow_name`, `workflow_definition_id`, `trigger_event`, `node_count`, `output_format` (json/formatted), `repo_detection_method` (flag/auto), `load_time_ms` |
| `cli.run.view.not_found` | Run ID does not exist | `owner`, `repo`, `requested_run_id`, `output_format` |
| `cli.run.view.error` | Command fails with an error | `error_type` (auth/not_found/network/rate_limit/api_error/invalid_id), `error_message`, `owner`, `repo`, `run_id` |
| `cli.run.view.json` | User uses `--json` flag | `repository_id`, `run_id`, `run_status`, `node_count`, `has_field_selector` (boolean) |

### Common Properties (all events)

- `user_id` (hashed)
- `session_id`
- `timestamp` (ISO 8601)
- `codeplane_version`
- `cli_version`

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| **CLI run view success rate** | > 95% | Percentage of `run view` invocations that exit with code 0 |
| **Repo auto-detection rate** | > 70% | Percentage of invocations where `--repo` was not explicitly provided |
| **JSON output adoption** | > 30% | Percentage of invocations using `--json` (indicates scripting/agent usage) |
| **Follow-through to run logs** | > 20% | Percentage of `run view` invocations followed by `run logs` within the same CLI session (indicates debugging flow) |
| **Follow-through to run rerun** | > 5% | Percentage of `run view` invocations for failed/cancelled runs followed by `run rerun` |
| **404 rate** | < 5% | Percentage of invocations hitting "run not found" (high values suggest stale links or incorrect IDs) |
| **Median CLI response time** | < 1500ms | Wall-clock time from command invocation to output completion |
| **Failed run view rate** | > 30% | Percentage of viewed runs that have `failure` status (indicates users are using the command for debugging, which is the primary use case) |

## Observability

### Logging Requirements

| Log Level | Event | Structured Context |
|-----------|-------|-----------------------|
| `DEBUG` | CLI resolving repository context | `repo_flag` (if provided), `detected_owner`, `detected_repo`, `detection_method` (flag/remote) |
| `DEBUG` | API request being sent | `method` (GET), `url`, `run_id` |
| `DEBUG` | API response received | `status_code`, `duration_ms`, `body_size_bytes` |
| `DEBUG` | Formatting run view output | `run_id`, `run_status`, `node_count`, `output_format` |
| `INFO` | Run view command completed | `run_id`, `run_status`, `node_count`, `output_format`, `duration_ms` |
| `WARN` | Rate limit response received from server | `retry_after`, `owner`, `repo`, `run_id` |
| `ERROR` | API request failed (network error) | `error_message`, `url`, `owner`, `repo`, `run_id` |
| `ERROR` | API returned error status | `status_code`, `error_message`, `owner`, `repo`, `run_id` |
| `ERROR` | Repository context resolution failed | `repo_flag`, `cwd`, `error_message` |
| `ERROR` | Run ID argument parsing failed | `raw_input`, `error_message` |

Note: CLI logging is controlled by the CLI's verbosity level and writes to stderr. Only `ERROR` level messages are shown by default; `DEBUG` and `INFO` require explicit verbosity flags.

### Prometheus Metrics (Server-Side)

These metrics are on the server endpoint that the CLI consumes. The CLI does not export Prometheus metrics directly.

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_run_detail_requests_total` | `status` (200, 400, 401, 403, 404, 429, 500), `client` (cli, web, tui, editor), `endpoint` (run_detail) | Total run detail requests |
| `codeplane_workflow_run_detail_not_found_total` | `reason` (run_missing, definition_deleted) | Total 404 responses broken down by cause |

**Histograms:**

| Metric | Buckets | Labels | Description |
|--------|---------|--------|-------------|
| `codeplane_workflow_run_detail_duration_seconds` | 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0 | `endpoint` (run_detail), `status` | API request latency |
| `codeplane_workflow_run_step_count` | 0, 1, 5, 10, 20, 50, 100, 200 | — | Number of steps per run detail request |

**Gauges:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_run_detail_response_size_bytes` | `endpoint` | Response body size (sampled) |

### Alerts & Runbooks

#### Alert 1: `WorkflowRunViewCLIHighErrorRate`

- **Condition:** `rate(codeplane_workflow_run_detail_requests_total{status=~"5..",client="cli",endpoint="run_detail"}[5m]) / rate(codeplane_workflow_run_detail_requests_total{client="cli",endpoint="run_detail"}[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Open Grafana dashboard for `codeplane_workflow_run_detail_requests_total` and filter by `client=cli`, `status=5xx`.
  2. Check server error logs for stack traces correlated by `request_id`.
  3. Verify database connectivity: run `SELECT 1` and check `workflow_runs` and `workflow_definitions` table health.
  4. Check if the issue is isolated to a specific repository or run ID by filtering logs by `repository_id` and `run_id`.
  5. Check if Mermaid graph generation or XML plan generation is failing for specific runs (look for errors in `buildWorkflowRunMermaid` or `buildWorkflowPlanXML`).
  6. If a recent deployment occurred, review the diff for changes to workflow route handlers or `WorkflowService.getWorkflowRun`.
  7. If not resolved within 15 minutes, escalate to the backend on-call engineer.

#### Alert 2: `WorkflowRunViewCLIHighLatency`

- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_run_detail_duration_seconds_bucket{client="cli",endpoint="run_detail"}[5m])) > 3.0`
- **Severity:** Warning
- **Runbook:**
  1. Check which sub-operation is slow: run fetch, definition fetch, step fetch, Mermaid generation, or XML generation — by examining server `debug` logs with timing breakdowns.
  2. Check `codeplane_workflow_run_step_count` histogram — runs with 100+ steps can cause slow Mermaid/XML generation.
  3. Run `EXPLAIN ANALYZE` on the `getWorkflowRunById` and `listWorkflowSteps` queries for a sample slow run ID.
  4. Check for missing indexes on `workflow_runs(repository_id, id)` and `workflow_steps(workflow_run_id, position)`.
  5. If Mermaid generation is the bottleneck, consider caching generated graphs with a short TTL keyed by `(run_id, last_step_updated_at)`.
  6. If step count is the bottleneck, consider lazy-loading node details only when explicitly requested.

#### Alert 3: `WorkflowRunViewHighNotFoundRate`

- **Condition:** `rate(codeplane_workflow_run_detail_not_found_total{reason="run_missing"}[15m]) > 20`
- **Severity:** Info
- **Runbook:**
  1. Check if clients are following stale links or cached run IDs to deleted runs.
  2. Review recent bulk run cleanup/purge operations that may have deleted runs users are still referencing.
  3. Check server access logs for the `owner`/`repo`/`run_id` values producing 404s — look for patterns (same repo, sequential IDs).
  4. If many users are hitting the same nonexistent run, check whether a run retention/purge policy recently ran and whether the UI/CLI is linking to stale run IDs.
  5. No immediate action required unless accompanied by user reports.

#### Alert 4: `WorkflowRunViewDefinitionDeletedSpike`

- **Condition:** `rate(codeplane_workflow_run_detail_not_found_total{reason="definition_deleted"}[15m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Check if a workflow definition was recently deleted while its runs still exist.
  2. Review the `workflow_definitions` deletion log for the affected repository.
  3. Consider whether orphan runs should be cleaned up when their parent definition is deleted, or whether the detail endpoint should degrade gracefully by showing the run without workflow metadata.
  4. If this is a user-facing issue, communicate that viewing runs for deleted workflow definitions is currently unsupported and the definition must be restored.

### Error Cases & Failure Modes

| Error Case | Expected CLI Behavior | Detection |
|------------|----------------------|----------|
| No auth token configured | Print auth error, exit 1 | `requireAuthToken()` throws before API call |
| `--repo` format invalid (missing `/`) | Print argument validation error, exit 1 | `resolveRepoRef()` throws |
| Run ID is non-numeric (e.g., `abc`) | Print invalid ID error, exit 1 | `z.coerce.number()` rejects |
| Run ID is zero | Print invalid ID error, exit 1 | Server returns 400 |
| Run ID is negative | Print invalid ID error, exit 1 | Server returns 400 |
| Run ID is a float (e.g., `1.5`) | Coerced to integer by Zod, or rejected | `z.coerce.number()` + server validation |
| Repository does not exist | Print "repository not found", exit 1 | API returns 404 |
| Private repo, user lacks access | Print "repository not found", exit 1 | API returns 404 |
| Run does not exist | Print "Workflow run not found", exit 1 | API returns 404 |
| Parent workflow definition deleted | Print "Workflow definition not found", exit 1 | API returns 404 |
| Cross-repo isolation: run belongs to different repo | Print "Workflow run not found", exit 1 | API returns 404 |
| Auth token expired | Print auth error, exit 1 | API returns 401 |
| Auth token revoked | Print auth error, exit 1 | API returns 401 |
| Rate limit exceeded | Print rate limit message, exit 1 | API returns 429 |
| Server internal error | Print server error message, exit 1 | API returns 500 |
| Network timeout | Print connection error, exit 1 | `fetch()` rejects |
| DNS resolution failure | Print connection error, exit 1 | `fetch()` rejects |
| Malformed API response (invalid JSON) | Print parse error, exit 1 | JSON.parse throws |

## Verification

### CLI E2E Tests — Core Behavior

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.view.success` | Run `codeplane run view <id> --repo owner/repo` against a successful run with 3 steps | Output contains `✓ Success`, workflow name, trigger info, and 3 step rows; exit code 0 |
| `cli.run.view.failure` | Run against a failed run | Output contains `✗ Failure` and the failing step shows `✗` icon; exit code 0 |
| `cli.run.view.running` | Run against an in-progress run | Output contains `◎ Running`; running steps show `◎` icon; queued steps show `◌` |
| `cli.run.view.queued` | Run against a queued run (not yet started) | Output contains `◌ Queued`; shows `Created:` instead of `Started:`; omits `Duration:` |
| `cli.run.view.cancelled` | Run against a cancelled run | Output contains `✕ Cancelled` |
| `cli.run.view.timeout` | Run against a timed-out run | Output contains `⏱ Timeout` |
| `cli.run.view.header_fields` | Verify all header fields present | Output contains: `Run #<id>`, workflow name, workflow path in parentheses, `Trigger:`, `Started:` (or `Created:`), `Duration:` (if started) |
| `cli.run.view.trigger_push` | Run against a push-triggered run | Trigger line matches `push to {ref} @ {sha:7}` |
| `cli.run.view.trigger_manual` | Run against a manually dispatched run | Trigger line matches `manual to {ref} @ {sha:7}` |
| `cli.run.view.trigger_schedule` | Run against a scheduled run | Trigger line matches `schedule @ {ref}` |
| `cli.run.view.trigger_landing_request` | Run against a landing-request-triggered run | Trigger line matches `landing_request to {ref} @ {sha:7}` |
| `cli.run.view.trigger_workflow_run` | Run against a chained workflow run | Trigger line matches `workflow_run to {ref} @ {sha:7}` |
| `cli.run.view.trigger_no_sha` | Run against a run with empty `trigger_commit_sha` | Trigger line omits the `@ {sha}` portion |
| `cli.run.view.sha_abbreviated` | Verify commit SHA is abbreviated in formatted output | SHA shown as 7 characters in formatted output |
| `cli.run.view.duration_seconds` | Run against a run with 45s duration | Duration shows `45s` |
| `cli.run.view.duration_minutes` | Run against a run with 125s duration | Duration shows `2m 5s` |
| `cli.run.view.duration_zero` | Run against a run with 0s duration | Duration shows `0s` |

### CLI E2E Tests — Step Table

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.view.steps.list` | Run against a run with 5 steps | Output contains 5 step rows with position numbers 1-5 |
| `cli.run.view.steps.icons` | Run against a run with steps in various states | Each step shows the correct status icon (✓, ✗, ◎, ◌, ⊘) |
| `cli.run.view.steps.ordering` | Verify steps are in position order | Step positions are listed sequentially from 1 to N |
| `cli.run.view.steps.durations` | Verify step durations display | Each completed step shows its duration; running steps show in-progress duration |
| `cli.run.view.steps.no_steps` | Run against a run with zero steps | Output shows `No steps recorded` instead of a step table |
| `cli.run.view.steps.null_started_at` | Run with a queued step (null `started_at`) | Step shows icon only, no duration |

### CLI E2E Tests — Structured Output

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.view.json.full` | Run with `--json` | stdout is valid JSON with `run`, `workflow`, `nodes`, `mermaid`, `plan_xml` fields; exit code 0 |
| `cli.run.view.json.run_shape` | Verify `run` object in JSON | Has `id` (number), `status` (string), `trigger_event`, `trigger_ref`, `trigger_commit_sha`, `started_at`, `completed_at`, `created_at`, `updated_at` |
| `cli.run.view.json.workflow_shape` | Verify `workflow` object in JSON | Has `id` (number), `name` (string), `path` (string) |
| `cli.run.view.json.nodes_shape` | Verify `nodes` array in JSON | Each node has `id`, `step_id`, `name`, `position`, `status`, `iteration`, `started_at`, `completed_at`, `duration`, `duration_seconds` |
| `cli.run.view.json.sha_full` | Verify SHA is not abbreviated in JSON | `trigger_commit_sha` is full 40-character hex string |
| `cli.run.view.json.mermaid_present` | Verify Mermaid field | `mermaid` field starts with `graph TD` |
| `cli.run.view.json.plan_xml_present` | Verify plan XML field | `plan_xml` field starts with `<?xml version` |
| `cli.run.view.json.field_filter` | Run with `--json run.status` | Output contains only the `status` value |
| `cli.run.view.json.empty_nodes` | Run with `--json` against run with zero steps | `nodes` is an empty array `[]` |

### CLI E2E Tests — Repository Resolution

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.view.auto_repo` | Run `codeplane run view <id>` from inside a cloned repository directory | Command auto-detects repo and returns results; exit code 0 |
| `cli.run.view.explicit_repo` | Run `codeplane run view <id> --repo owner/repo` from a directory with no repo context | Command uses the explicit `--repo` flag successfully; exit code 0 |
| `cli.run.view.repo_with_hyphens` | Run `--repo my-org/my-repo-name` | Resolves correctly |
| `cli.run.view.repo_with_dots` | Run `--repo org/repo.js` | Resolves correctly |

### CLI E2E Tests — Error Handling

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.view.error.no_repo_context` | Run `codeplane run view 1` from a directory with no repository context and no `--repo` flag | Exit code 1, error about repository detection |
| `cli.run.view.error.invalid_repo_format` | Run with `--repo invalid-format` (no slash) | Exit code 1, error about invalid repository format |
| `cli.run.view.error.repo_not_found` | Run with `--repo nonexistent/repo` | Exit code 1, error "repository not found" |
| `cli.run.view.error.run_not_found` | Run with a valid repo but nonexistent run ID | Exit code 1, error "Workflow run not found" |
| `cli.run.view.error.definition_deleted` | Run against a run whose workflow definition was deleted | Exit code 1, error "Workflow definition not found" |
| `cli.run.view.error.cross_repo` | Run ID exists in repo A, viewed from repo B | Exit code 1, error "Workflow run not found" |
| `cli.run.view.error.id_non_numeric` | Run with `abc` as the ID | Exit code 1, error about invalid argument |
| `cli.run.view.error.id_zero` | Run with `0` as the ID | Exit code 1, error "invalid run id" |
| `cli.run.view.error.id_negative` | Run with `-1` as the ID | Exit code 1, error about invalid argument |
| `cli.run.view.error.id_float` | Run with `1.5` as the ID | Exit code 1 or coerced to 1 (verify behavior) |
| `cli.run.view.error.network` | Run with API server unreachable | Exit code 1, connection error message |
| `cli.run.view.error.auth_missing` | Run without configured auth token | Exit code 1, authentication error |
| `cli.run.view.error.auth_expired` | Run with expired auth token | Exit code 1, authentication error |
| `cli.run.view.error.private_no_access` | Authenticated user views run on private repo they lack access to | Exit code 1, "repository not found" (no existence leak) |

### CLI E2E Tests — Edge Cases & Boundaries

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `cli.run.view.edge.unicode_step_name` | Seed run with step name `テスト・ビルド` | Step name appears correctly in formatted output |
| `cli.run.view.edge.emoji_step_name` | Seed run with step name `🚀 Deploy` | Step name appears correctly |
| `cli.run.view.edge.max_step_name_255` | Seed run with 255-character step name | Full name appears in formatted output without truncation |
| `cli.run.view.edge.max_workflow_name_255` | Seed run with 255-character workflow name | Full name appears in formatted output |
| `cli.run.view.edge.max_path_512` | Seed run with 512-character workflow path | Full path appears in formatted output |
| `cli.run.view.edge.200_steps` | Seed run with 200 steps (maximum) | All 200 steps listed in step table; exit code 0 |
| `cli.run.view.edge.single_step` | Seed run with exactly 1 step | Step table has 1 row |
| `cli.run.view.edge.special_chars_step_name` | Seed step with name containing `<>&"'\|` | Characters display correctly in formatted output (no escaping artifacts) |
| `cli.run.view.edge.long_trigger_ref` | Seed run with 256-character `trigger_ref` | Ref displays correctly in trigger line |
| `cli.run.view.edge.empty_trigger_ref` | Seed run with empty `trigger_ref` | Trigger line gracefully omits ref portion |
| `cli.run.view.edge.large_run_id` | Seed run with ID near the max integer range | Command handles large IDs correctly |
| `cli.run.view.edge.mixed_step_statuses` | Seed run with steps in all possible statuses (success, failure, running, queued, cancelled, pending, skipped) | Each step shows the correct icon |
| `cli.run.view.edge.step_no_duration` | Step with `started_at = null` and `completed_at = null` | Duration column is blank for that step |

### API Integration Tests (CLI validates API contract)

| Test ID | Description | Expected Result |
|---------|-------------|----------------|
| `api.run.view.response_shape` | CLI `--json` output verified against expected schema | Response has `run` (object), `workflow` (object), `nodes` (array), `mermaid` (string), `plan_xml` (string) |
| `api.run.view.run_fields` | Verify `run` object fields | Has `id` (number > 0), `status` (string in valid set), timestamps (ISO 8601 or null) |
| `api.run.view.status_enum` | Verify `run.status` is a valid status | Status is one of: `success`, `failure`, `running`, `queued`, `cancelled`, `timeout` |
| `api.run.view.trigger_event_enum` | Verify `trigger_event` is valid | Event is one of: `push`, `landing_request`, `manual`, `schedule`, `webhook`, `workflow_run` |
| `api.run.view.node_positions_sequential` | Verify nodes are in position order | Node positions are 1, 2, 3, ..., N with no gaps |
| `api.run.view.duration_seconds_non_negative` | Verify `duration_seconds` is non-negative | Every node has `duration_seconds >= 0` |
| `api.run.view.timestamps_iso8601` | Verify all timestamp fields | `created_at`, `updated_at` match ISO 8601 pattern; `started_at`, `completed_at` are ISO 8601 or null |
| `api.run.view.mermaid_valid` | Verify Mermaid graph format | `mermaid` starts with `graph TD` and contains node definitions |
| `api.run.view.plan_xml_valid` | Verify XML plan format | `plan_xml` starts with `<?xml version` and contains `<workflow>` root element |
| `api.run.view.400_invalid_id` | Send non-numeric run ID | HTTP 400 with `{ "message": "invalid run id" }` |
| `api.run.view.404_run_missing` | Send valid numeric ID for nonexistent run | HTTP 404 with `{ "message": "workflow run not found" }` |
| `api.run.view.404_definition_deleted` | Delete definition, then view run | HTTP 404 with `{ "message": "workflow definition not found" }` |

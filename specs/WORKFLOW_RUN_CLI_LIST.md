# WORKFLOW_RUN_CLI_LIST

Specification for WORKFLOW_RUN_CLI_LIST.

## High-Level User POV

When developers are working on a repository in Codeplane, they frequently need to check the status of workflow runs from the command line—whether they're debugging a failing CI pipeline, confirming a deploy completed, or monitoring runs kicked off by agents. The `codeplane run list` command gives them exactly this: a fast, scriptable way to see every workflow run in a repository without leaving the terminal.

A developer types `codeplane run list` from inside a repository checkout and immediately sees a table of recent workflow runs, ordered from newest to oldest. Each row shows the run's status at a glance (with clear success/failure/running/queued/cancelled indicators), the run ID, which workflow produced it, what triggered it, the bookmark or ref involved, the abbreviated commit SHA, how long it took, and how long ago it happened. This answers the most common developer questions—"did my push pass?", "is the deploy still running?", "what broke?"—in a single command.

For developers who need to narrow down what they're looking at, a `--state` flag filters to only running, queued, succeeded, failed, cancelled, or all-terminal-state runs. This is invaluable when a repository has hundreds of historical runs and the developer only cares about failures or currently active work.

The command paginates results with `--page` and `--limit` flags, defaulting to 30 runs per page, so developers can page through history. For scripting and automation, `--json` outputs the raw API response as structured JSON, making it trivial to pipe into `jq`, feed into dashboards, or use from agent-driven workflows. The command infers the repository from the current working directory's jj or git remote, or accepts an explicit `--repo OWNER/REPO` override.

This command is the primary CLI entry point for workflow observability and serves as the foundation for deeper inspection—developers see a run in the list and follow up with `codeplane run view`, `codeplane run logs`, or `codeplane run watch` to drill into the details.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane run list` calls the `GET /api/repos/:owner/:repo/workflows/runs` endpoint (v2, with enrichment)
- [ ] Default output renders a human-readable table to stdout with columns: STATUS, ID, WORKFLOW, EVENT, REF, SHA, DURATION, AGE
- [ ] `--json` flag outputs the raw API response JSON to stdout with no table formatting
- [ ] `--state STATE` passes the state filter to the API query parameter
- [ ] `--page N` and `--limit N` control pagination
- [ ] `--repo OWNER/REPO` overrides automatic repository resolution
- [ ] Repository is automatically inferred from the current working directory when `--repo` is omitted
- [ ] Exit code is 0 on success and 1 on API errors (401, 403, 404, 5xx)
- [ ] The `formatWorkflowRunList()` function exists in `output.ts` and follows established formatting patterns
- [ ] The `shouldReturnStructuredOutput()` check routes between table and JSON output modes

### State Filter Behavior

- [ ] `--state running` filters to runs with status `running`, `in_progress`, or `in-progress`
- [ ] `--state queued` filters to runs with status `queued` or `pending`
- [ ] `--state success` filters to runs with status `success`, `completed`, `complete`, or `done`
- [ ] `--state failure` filters to runs with status `failure`, `failed`, or `error`
- [ ] `--state cancelled` filters to runs with status `cancelled` or `canceled`
- [ ] `--state finished` matches all terminal states (success, failure, cancelled)
- [ ] Omitting `--state` returns all runs regardless of status
- [ ] Unrecognized `--state` values are passed through to the API (which treats them as literal status matches)

### Pagination Constraints

- [ ] `--page` defaults to 1 if not specified
- [ ] `--limit` defaults to 30 if not specified
- [ ] `--limit` accepts values from 1 to 100
- [ ] `--limit 0` or `--limit -1` produces a validation error before the API call
- [ ] `--limit` values > 100 are rejected by the API with a 400 error
- [ ] A page beyond the total run count returns an empty table with an informative message, not an error
- [ ] `--page 0` or `--page -1` produces a validation error before the API call

### Table Output Constraints

- [ ] Table columns are auto-sized based on content width with 2-space separation
- [ ] STATUS column displays a status indicator: `✓` for success, `✗` for failure, `◎` for running, `◌` for queued, `✕` for cancelled, `⏱` for timeout
- [ ] ID column displays the run ID prefixed with `#` (e.g., `#1047`)
- [ ] WORKFLOW column displays the enriched `workflow_name` from the definition; empty if definition was deleted
- [ ] EVENT column displays `trigger_event` (e.g., `push`, `manual`, `schedule`)
- [ ] REF column displays `trigger_ref` (e.g., `main`, `feat/auth`); `—` if empty
- [ ] SHA column displays the first 7 characters of `trigger_commit_sha`; `—` if empty
- [ ] DURATION column displays human-readable duration computed from `started_at`/`completed_at`; `—` if not started
- [ ] AGE column displays relative time since `created_at` (e.g., `3h`, `5m`, `2d`)
- [ ] Empty result set displays `"No workflow runs found"` instead of an empty table

### Edge Cases

- [ ] Repository with zero workflow runs shows `"No workflow runs found"` with exit code 0
- [ ] Runs from deleted workflow definitions display with empty WORKFLOW column
- [ ] Non-existent repository returns error message to stderr and exit code 1
- [ ] Non-existent owner returns error message to stderr and exit code 1
- [ ] Expired or invalid token returns authentication error to stderr and exit code 1
- [ ] Network timeout returns connection error to stderr and exit code 1
- [ ] Very long workflow names are not truncated in table output (table auto-sizes)
- [ ] Repository names containing hyphens, underscores, and dots work correctly
- [ ] `--repo` flag with only repo name (no owner) produces a clear error
- [ ] Output with `NO_COLOR=1` or `--no-color` omits ANSI escape codes
- [ ] `--json` output is always valid JSON even when the result set is empty (`{ "runs": [] }`)
- [ ] Mixed trigger events in the same list render correctly with proper alignment
- [ ] Runs with `null` `started_at` and `null` `completed_at` render `—` placeholders
- [ ] Unicode and special characters in workflow names or refs display correctly

## Design

### CLI Command

```
codeplane run list [--repo OWNER/REPO] [--json] [--state STATE] [--page N] [--limit N]
```

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | (inferred) | Target repository in `OWNER/REPO` format |
| `--json` | boolean | false | Output raw JSON from the API |
| `--state` | string | (none) | Filter by run status: `running`, `queued`, `success`, `failure`, `cancelled`, `finished` |
| `--page` | integer | 1 | Page number for pagination |
| `--limit` | integer | 30 | Number of runs per page (max 100) |

**Example invocations:**

```bash
# List runs for the current repo
codeplane run list

# List only failed runs
codeplane run list --state failure

# List runs with JSON output for scripting
codeplane run list --json

# List runs for a specific repo
codeplane run list --repo acme/api-server

# Page 2 with 10 runs per page
codeplane run list --page 2 --limit 10

# Combined: failed runs as JSON for a specific repo
codeplane run list --repo acme/api-server --state failure --json

# Piping to jq for scripting
codeplane run list --json | jq '.runs[] | select(.status == "failure") | .id'
```

**Table output example:**

```
STATUS  ID      WORKFLOW        EVENT     REF           SHA      DURATION  AGE
------  ------  --------------  --------  ------------  -------  --------  ---
✓       #1047   CI              push      main          a3f8c21  1m 5s     3h
✗       #1046   CI              push      feat/auth     b7e2d09  45s       5h
◎       #1045   Deploy          manual    main          c1d4e56  12s       8m
◌       #1044   CI              schedule  main          —        —         2m
✕       #1043   Integration     push      main          d2e5f78  3m 12s    1d
```

**Empty state output:**

```
No workflow runs found
```

**Error output examples (stderr):**

```
Error: repository not found: nonexistent/repo
```

```
Error: unauthorized — run 'codeplane auth login' to authenticate
```

### API Shape

The CLI calls the v2 endpoint:

```
GET /api/repos/:owner/:repo/workflows/runs?page=1&per_page=30&state=running
```

Query parameters are built from CLI flags:
- `--page` → `page`
- `--limit` → `per_page`
- `--state` → `state`

The response envelope is `{ "runs": [...] }` where each run is an enriched workflow run object with `workflow_name` and `workflow_path` from the associated definition.

**Response shape per run:**

```json
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
```

### SDK Shape (output.ts additions)

The `formatWorkflowRunList()` function is added to `apps/cli/src/output.ts` following the existing `formatIssueList()`, `formatLandingList()` patterns. It accepts an array of workflow run records and produces a formatted table string.

Helper functions needed:
- `formatRunStatus(status: string): string` — maps status strings to status icons (✓, ✗, ◎, ◌, ✕, ⏱)
- `formatDuration(startedAt: string | null, completedAt: string | null): string` — computes human-readable duration or `—`
- `formatAge(createdAt: string): string` — computes relative time since creation (e.g., `3h`, `5m`, `2d`, `< 1m`)
- `abbreviateSha(sha: string): string` — returns first 7 characters or `—` if empty

### Documentation

End-user documentation should cover:

1. **"CLI Reference: `codeplane run list`"** — Full command reference with all flags, their types, defaults, and constraints. Include at least 5 example invocations covering common use cases (basic list, filtering by state, JSON output, explicit repo, pagination, and scripting with jq).

2. **"Viewing Workflow Runs from the CLI"** — A short guide in the workflows documentation explaining how `run list` fits into the workflow observability flow: list → view → logs → watch. Include the table column meanings and how to interpret status icons.

3. **"Filtering and Scripting Workflow Runs"** — Document the `--state` filter values and their aliases, the `--json` output shape, and patterns for piping into other tools. Cover the `finished` composite filter that groups all terminal states.

## Permissions & Security

### Authorization Roles

| Role | Public Repository | Private Repository |
|------|------------------|--------------------|
| Anonymous (unauthenticated) | ✅ Read run list | ❌ 401 Unauthorized |
| Authenticated (no repo access) | ✅ Read run list | ❌ 403 Forbidden |
| Read-only member | ✅ Read run list | ✅ Read run list |
| Write member | ✅ Read run list | ✅ Read run list |
| Admin | ✅ Read run list | ✅ Read run list |
| Owner | ✅ Read run list | ✅ Read run list |

This feature is strictly read-only. No mutation actions are exposed by the list command itself—cancel, rerun, and resume are separate commands with their own permission requirements.

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Authenticated user | 300 requests | 1 minute |
| Anonymous (per IP) | 60 requests | 1 minute |

The CLI should handle 429 responses gracefully, displaying the `Retry-After` header value and suggesting the user wait before retrying.

Rate limit headers are included in every response from the server:
- `X-RateLimit-Limit`: Maximum requests in the window
- `X-RateLimit-Remaining`: Remaining requests in the window
- `X-RateLimit-Reset`: Unix timestamp when the window resets
- `Retry-After`: Seconds to wait (on 429 responses only)

### Data Privacy

- The v2 API endpoint intentionally excludes `dispatch_inputs` and `agent_token_hash`/`agent_token_expires_at` fields from the response. The CLI must not attempt to add these fields back or expose them through any output path.
- `trigger_ref` may contain user-created bookmark names which could contain PII-adjacent information (e.g., `fix/john-doe-bug`). This is acceptable for users with read access.
- `trigger_commit_sha` is safe to expose to any user with repository read access.
- `--json` output should match the API response exactly—no additional field injection or transformation that could expose internal state.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workflow_runs.cli_list_invoked` | User runs `codeplane run list` | `repo_owner`, `repo_name`, `state_filter` (or `null`), `page`, `limit`, `json_mode` (boolean), `repo_source` (`flag` or `inferred`), `result_count`, `exit_code`, `duration_ms` |
| `workflow_runs.cli_list_filtered` | User provides `--state` flag | `repo_owner`, `repo_name`, `filter_value`, `result_count` |
| `workflow_runs.cli_list_paginated` | User provides `--page` > 1 | `repo_owner`, `repo_name`, `page_number`, `limit`, `result_count` |
| `workflow_runs.cli_list_empty` | Command returns zero runs | `repo_owner`, `repo_name`, `state_filter`, `page` |
| `workflow_runs.cli_list_error` | Command exits with code 1 | `repo_owner`, `repo_name`, `error_type` (`auth`, `not_found`, `rate_limit`, `network`, `server`), `http_status`, `error_message` |
| `workflow_runs.cli_list_json_piped` | `--json` output is piped (stdout is not TTY) | `repo_owner`, `repo_name`, `result_count` |

### Common Properties (all events)

- `user_id` (hashed)
- `cli_version`
- `timestamp` (ISO 8601)
- `os_platform`
- `os_arch`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------|
| Command success rate | > 95% | Most invocations should complete without error |
| Average command latency (p50) | < 500ms | The command should feel fast including network round-trip |
| Average command latency (p95) | < 2s | Even tail latencies should be tolerable for interactive use |
| `--state` filter adoption | > 15% of invocations | Filtering provides enough value that users engage with it |
| `--json` adoption | > 25% of invocations | JSON output is used frequently in scripting and agent workflows |
| Error-to-retry rate | > 50% | When a user hits an error, they should retry (indicating the error message was actionable) |
| Daily active CLI workflow list users / total CLI users | > 10% | Workflow observability from CLI should be a core use case |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------|
| `debug` | CLI command parsed | `command=run_list`, `repo_flag`, `state_flag`, `page`, `limit`, `json_mode` |
| `debug` | Repository resolution | `source` (`flag` or `inferred`), `owner`, `repo`, `resolution_ms` |
| `debug` | API request initiated | `method=GET`, `url`, `query_params`, `request_id` |
| `debug` | API response received | `status`, `body_size_bytes`, `run_count`, `response_ms` |
| `debug` | Output formatting | `mode` (`table` or `json`), `row_count`, `format_ms` |
| `info` | Command completed | `exit_code`, `total_duration_ms`, `run_count`, `output_mode` |
| `warn` | Rate limited by server | `retry_after_s`, `endpoint` |
| `warn` | Slow API response (> 2s) | `url`, `response_ms` |
| `error` | API request failed | `status`, `error_message`, `url` |
| `error` | Repository resolution failed | `repo_flag`, `cwd`, `error_message` |
| `error` | Authentication failed | `error_type` (`missing_token`, `expired_token`, `invalid_token`) |
| `error` | Network error | `error_message`, `url`, `error_code` |
| `error` | JSON parse failure on API response | `body_preview` (first 200 chars), `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_run_list_invocations_total` | Counter | `exit_code` (0/1), `state_filter`, `json_mode` (true/false) | Total CLI invocations of `run list` |
| `codeplane_cli_run_list_duration_seconds` | Histogram | `exit_code`, `output_mode` | End-to-end command duration (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10) |
| `codeplane_cli_run_list_api_duration_seconds` | Histogram | `status` | Time spent waiting for API response |
| `codeplane_cli_run_list_results_count` | Histogram | `state_filter` | Number of runs returned (buckets: 0, 1, 5, 10, 30, 50, 100) |
| `codeplane_cli_run_list_errors_total` | Counter | `error_type` (`auth`, `not_found`, `rate_limit`, `network`, `server`, `parse`) | Total errors by type |

### Alerts

#### Alert: `CLIRunListHighErrorRate`
- **Condition:** `rate(codeplane_cli_run_list_errors_total[15m]) / rate(codeplane_cli_run_list_invocations_total[15m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check which error type dominates: `sum by (error_type)(rate(codeplane_cli_run_list_errors_total[15m]))`
  2. If `auth` errors dominate: check if a token rotation or OAuth provider outage occurred. Verify the auth service is healthy.
  3. If `not_found` errors dominate: check if a migration or repo rename broke resolution. Review server 404 logs.
  4. If `network` errors dominate: check server availability, DNS resolution, and TLS certificate expiration.
  5. If `server` errors (5xx) dominate: escalate to server-side `WorkflowRunListHighErrorRate` alert runbook.
  6. If `rate_limit` errors dominate: check if a CI/CD pipeline or agent is polling too aggressively. Consider suggesting webhook/SSE alternatives.

#### Alert: `CLIRunListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_cli_run_list_duration_seconds_bucket[15m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. Isolate whether latency is in the API call: check `codeplane_cli_run_list_api_duration_seconds` p95
  2. If API latency is high: escalate to server-side `WorkflowRunListHighLatency` alert
  3. If API latency is normal but total duration is high: check DNS resolution time, TLS handshake time, or local repo resolution time
  4. Check if the issue is specific to a region or network path
  5. Verify no proxy or VPN is adding latency

#### Alert: `CLIRunListSuddenDropInUsage`
- **Condition:** `rate(codeplane_cli_run_list_invocations_total[1h]) < 0.1 * rate(codeplane_cli_run_list_invocations_total[1h] offset 1d)`
- **Severity:** Info
- **Runbook:**
  1. Check if a CLI release broke the `run list` command (test the latest release manually)
  2. Check if the server endpoint changed paths or response shape
  3. Check if package distribution (npm, brew) is working correctly
  4. Review recent CLI changelog for breaking changes
  5. This may be a normal weekend/holiday dip—check day-of-week patterns before escalating

### Error Cases and Failure Modes

| Error Case | Exit Code | Output (stderr) | Recovery |
|------------|-----------|-----------------|----------|
| Missing auth token | 1 | `Error: not authenticated — run 'codeplane auth login'` | User authenticates |
| Expired auth token | 1 | `Error: token expired — run 'codeplane auth login' to re-authenticate` | User re-authenticates |
| Repository not found | 1 | `Error: repository not found: OWNER/REPO` | User corrects repo reference |
| Access denied (private repo) | 1 | `Error: access denied to OWNER/REPO` | User requests access |
| Rate limited | 1 | `Error: rate limited — retry after Ns` | User waits and retries |
| Network unreachable | 1 | `Error: could not connect to API at URL` | User checks network/server |
| Server error (5xx) | 1 | `Error: server error (STATUS) — try again later` | User retries; server team investigates |
| Invalid `--page` value | 1 | `Error: --page must be a positive integer` | User fixes flag value |
| Invalid `--limit` value | 1 | `Error: --limit must be between 1 and 100` | User fixes flag value |
| Cannot resolve repo from cwd | 1 | `Error: could not determine repository — use --repo OWNER/REPO` | User provides explicit flag |
| Malformed API response | 1 | `Error: unexpected response from server` | Server team investigates |

## Verification

### CLI Integration Tests

**File: `e2e/cli/workflow-run-list.test.ts`**

| Test ID | Description |
|---------|-------------|
| CLI-WRLC-001 | `codeplane run list --repo OWNER/REPO --json` returns valid JSON with `runs` array key |
| CLI-WRLC-002 | `codeplane run list --repo OWNER/REPO` outputs a formatted table with headers STATUS, ID, WORKFLOW, EVENT, REF, SHA, DURATION, AGE |
| CLI-WRLC-003 | Table output includes a header separator row of dashes |
| CLI-WRLC-004 | Each run row in table output contains a status indicator (one of ✓, ✗, ◎, ◌, ✕, ⏱) |
| CLI-WRLC-005 | Run IDs in table output are prefixed with `#` |
| CLI-WRLC-006 | Empty repository returns `"No workflow runs found"` with exit code 0 |
| CLI-WRLC-007 | `--state running` filters output to only running-status runs |
| CLI-WRLC-008 | `--state success` filters output to only success-status runs |
| CLI-WRLC-009 | `--state failure` filters output to only failed-status runs |
| CLI-WRLC-010 | `--state cancelled` filters output to only cancelled-status runs |
| CLI-WRLC-011 | `--state queued` filters output to only queued-status runs |
| CLI-WRLC-012 | `--state finished` returns runs with status success, failure, or cancelled (all terminal states) |
| CLI-WRLC-013 | Omitting `--state` returns all runs regardless of status |
| CLI-WRLC-014 | `--page 1 --limit 5` returns at most 5 runs |
| CLI-WRLC-015 | `--page 2 --limit 5` returns the second page of runs (skips first 5) |
| CLI-WRLC-016 | Page beyond total results returns `"No workflow runs found"` with exit code 0 |
| CLI-WRLC-017 | `--limit 100` returns at most 100 runs (maximum valid input size) |
| CLI-WRLC-018 | `--limit 101` results in an error (rejected by API with 400) |
| CLI-WRLC-019 | `--limit 0` results in a validation error before the API call |
| CLI-WRLC-020 | `--limit -1` results in a validation error before the API call |
| CLI-WRLC-021 | `--page 0` results in a validation error before the API call |
| CLI-WRLC-022 | `--page -1` results in a validation error before the API call |
| CLI-WRLC-023 | `--repo nonexistent/repo` exits with code 1 and error message containing "not found" |
| CLI-WRLC-024 | Unauthenticated request to private repo exits with code 1 and authentication error |
| CLI-WRLC-025 | `--json` output is valid JSON even when the result set is empty |
| CLI-WRLC-026 | `--json` output contains enriched `workflow_name` and `workflow_path` fields |
| CLI-WRLC-027 | Runs from deleted workflow definitions show empty `workflow_name` in `--json` output |
| CLI-WRLC-028 | `--json` output with `--state` filter applies the filter correctly |
| CLI-WRLC-029 | Repository inferred from current directory when `--repo` is omitted (requires jj/git checkout) |
| CLI-WRLC-030 | Duration column shows human-readable duration for completed runs (e.g., `1m 5s`, `45s`, `3m 12s`) |
| CLI-WRLC-031 | Duration column shows `—` for runs that have not started (`started_at` is null) |
| CLI-WRLC-032 | AGE column shows relative timestamps (e.g., `3h`, `5m`, `2d`) |
| CLI-WRLC-033 | REF column shows `—` when `trigger_ref` is empty |
| CLI-WRLC-034 | SHA column shows first 7 characters of `trigger_commit_sha` |
| CLI-WRLC-035 | SHA column shows `—` when `trigger_commit_sha` is empty |
| CLI-WRLC-036 | Runs from multiple workflow definitions appear interleaved by creation order |
| CLI-WRLC-037 | Table columns auto-size based on content (long workflow names expand the WORKFLOW column) |
| CLI-WRLC-038 | Output respects `NO_COLOR=1` environment variable (no ANSI codes) |
| CLI-WRLC-039 | Combined flags `--state failure --page 1 --limit 10 --json` all work together |
| CLI-WRLC-040 | Repository names with hyphens work correctly (e.g., `my-org/my-repo`) |
| CLI-WRLC-041 | Repository names with underscores work correctly (e.g., `my_org/my_repo`) |
| CLI-WRLC-042 | Repository names with dots work correctly (e.g., `my.org/my.repo`) |
| CLI-WRLC-043 | Event column correctly displays all trigger types: push, manual, schedule, landing_request, webhook, workflow_run |
| CLI-WRLC-044 | Status column correctly maps all status values: success→✓, failure→✗, running→◎, queued→◌, cancelled→✕, timeout→⏱ |

### API Integration Tests (supporting CLI behavior)

**File: `e2e/api/workflow-run-list.test.ts`**

| Test ID | Description |
|---------|-------------|
| API-WRLC-001 | `GET /api/repos/:owner/:repo/workflows/runs` returns 200 with `{ "runs": [] }` for empty repo |
| API-WRLC-002 | Response includes enriched `workflow_name` and `workflow_path` on each run |
| API-WRLC-003 | Runs are ordered by ID descending (newest first) |
| API-WRLC-004 | `state=running` filter returns only running runs |
| API-WRLC-005 | `state=finished` filter returns success + failure + cancelled runs |
| API-WRLC-006 | `per_page=100` returns at most 100 runs (maximum valid page size) |
| API-WRLC-007 | `per_page=101` returns 400 error |
| API-WRLC-008 | Non-existent repo returns 404 |
| API-WRLC-009 | Private repo without auth returns 401 |
| API-WRLC-010 | Each run object contains all required fields per the response schema |
| API-WRLC-011 | Page beyond total results returns empty `runs` array with 200 status |
| API-WRLC-012 | Deleted workflow definition produces runs with empty string `workflow_name`/`workflow_path` |

All tests are left failing if the backend is unimplemented—never skipped or commented out.

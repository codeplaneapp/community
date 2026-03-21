# WORKFLOW_RUN_NODE_DETAIL

Specification for WORKFLOW_RUN_NODE_DETAIL.

## High-Level User POV

When a developer is investigating a workflow run, the run-level view shows which steps passed, failed, or are still running — but to understand *why* a step behaved the way it did, the developer needs to drill into a single node. The Workflow Run Node Detail feature provides this deep-dive inspection surface.

From any workflow run detail view — whether in the web UI, CLI, TUI, or API — the developer selects a specific step (also called a "node") and is presented with everything about that node's execution in one place. The node's metadata is shown front and center: its name, position in the workflow graph, current status, iteration count, and precise timing (when it started, when it completed, how long it took). For running nodes, the elapsed time ticks upward in real-time.

Below the metadata is the complete log output for that node. Every line of stdout and stderr produced during the node's execution is displayed in sequence order, with stderr lines visually distinguished. For running nodes, logs stream in real-time. For completed nodes, the full historical log is loaded and rendered statically. The developer can scroll through thousands of log lines, search within them, and quickly identify the exact point where a build failed or a test errored.

The node detail also includes contextual aids for understanding the node's place in the broader workflow. A Mermaid graph snippet shows the full workflow DAG with the current node highlighted, and an XML plan representation provides a machine-readable view of the execution plan. These representations allow the developer to see upstream dependencies and downstream consequences without navigating away.

Nodes can be addressed by either their numeric step ID or their human-readable name, so developers can share deep-links like "look at the 'Deploy' step in run #42" and the system resolves it naturally. This flexibility extends across all clients: the web URL, CLI command, and TUI navigation all accept either identifier.

This feature is the primary debugging surface for workflow failures. When a CI pipeline breaks, the developer's workflow is: see the red status on the run list → open the run detail → click the failing node → read the logs → understand the problem. The node detail view makes that final step as fast and information-rich as possible.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` returns the full node detail response for a valid run and node
- [ ] The response includes `run_id`, `node`, `logs`, `output`, `plan_xml`, and `mermaid` fields
- [ ] The `node` object includes all fields: `id`, `step_id`, `name`, `position`, `status`, `iteration`, `started_at`, `completed_at`, `duration`, `duration_seconds`
- [ ] Logs are filtered to only include entries belonging to the requested node's step ID
- [ ] Logs are ordered by `sequence` ascending
- [ ] The CLI command `codeplane run view <runId> --node <nodeId>` outputs the node detail
- [ ] The web UI renders a dedicated node detail panel/page accessible from the run detail view
- [ ] The TUI renders node detail when a step is selected in the run detail screen
- [ ] All clients display consistent data sourced from the same API endpoint

### Node Identifier Resolution

- [ ] `:nodeId` as a numeric string (e.g., `"7"`) matches a step by its `step.id`
- [ ] `:nodeId` as a name string (e.g., `"Build"`) matches a step by case-insensitive `step.name` comparison
- [ ] When both a numeric ID and a name could match different steps, numeric ID match takes precedence (the code uses `find()` which returns the first match; numeric comparison is checked first)
- [ ] Leading and trailing whitespace in `:nodeId` is trimmed before matching
- [ ] An empty or whitespace-only `:nodeId` returns 400 with `{ "message": "invalid node id" }`
- [ ] A `:nodeId` that matches no step returns 404 with `{ "message": "workflow node not found" }`

### Node Response Shape Constraints

- [ ] `node.id`: string representation of the step's numeric ID
- [ ] `node.step_id`: positive integer, the database primary key of the workflow step
- [ ] `node.name`: string, 1–255 characters, the step's declared name
- [ ] `node.position`: non-negative integer indicating execution order in the workflow
- [ ] `node.status`: string, one of `success`, `failure`, `running`, `queued`, `cancelled`, `timeout`, `pending`, `skipped`
- [ ] `node.iteration`: positive integer, defaults to 1 for first execution
- [ ] `node.started_at`: ISO 8601 timestamp string or `null` if the node has not started
- [ ] `node.completed_at`: ISO 8601 timestamp string or `null` if the node has not completed
- [ ] `node.duration`: human-readable duration string (e.g., `"1m 23s"`, `"45s"`, `""`); empty string if `started_at` is null
- [ ] `node.duration_seconds`: non-negative integer; 0 if `started_at` is null
- [ ] For running nodes (no `completed_at`), `duration` and `duration_seconds` reflect elapsed time from `started_at` to server's current time

### Log Response Constraints

- [ ] `logs` is an array of log entry objects
- [ ] Each log entry contains: `id` (positive integer), `sequence` (positive integer), `stream` (string: `"stdout"` or `"stderr"`), `entry` (string, the log line content), `created_at` (ISO 8601 timestamp)
- [ ] Logs are fetched with a limit of 10,000 entries per request
- [ ] Only logs with `workflow_step_id` matching the resolved step's `id` are included
- [ ] The `workflow_step_id` field is stripped from individual log entries in the response (not leaked)
- [ ] Log `entry` values may contain ANSI escape codes, UTF-8 multibyte characters, and empty strings
- [ ] Log `entry` maximum length per line: 65,536 characters (64 KB)
- [ ] Log `sequence` values are monotonically increasing within a step but may have gaps

### Contextual Representations

- [ ] `mermaid` contains a valid Mermaid `graph TD` string representing the full workflow DAG with all nodes
- [ ] Each node in the Mermaid graph is color-coded by status: success=#22c55e, failure=#ef4444, cancelled=#9ca3af, running=#3b82f6, queued=#6b7280, other=#94a3b8
- [ ] Edges between nodes show status and duration labels
- [ ] Pipe characters (`|`), double quotes (`"`), and newlines in node names are escaped in Mermaid labels
- [ ] `plan_xml` contains a valid XML document with `<?xml version="1.0" encoding="UTF-8"?>` header
- [ ] The XML `<workflow>` element includes `name`, `path`, `run_id`, and `status` attributes
- [ ] Each `<node>` element includes `id`, `step_id`, `name`, `position`, `status`, `iteration`, and optionally `duration`
- [ ] XML attribute values are properly escaped (quotes, ampersands, angle brackets)
- [ ] `output` is `null` in the current implementation (reserved for future structured output)

### Run and Repository Validation

- [ ] Invalid `:id` (non-numeric, zero, negative) returns 400 with `{ "message": "invalid run id" }`
- [ ] Run ID that does not exist in the repository returns 404 with `{ "message": "workflow run not found" }`
- [ ] Run ID that exists but belongs to a different repository returns 404
- [ ] Workflow definition referenced by the run that has been deleted returns 404 with `{ "message": "workflow definition not found" }`
- [ ] Non-existent repository returns 404
- [ ] Non-existent owner returns 404

### Edge Cases

- [ ] Node with zero log entries returns `{ "logs": [] }` with the node metadata intact
- [ ] Node that is still queued (never started) returns `started_at: null`, `completed_at: null`, `duration: ""`, `duration_seconds: 0`, and empty logs
- [ ] Node that started but has not completed returns `completed_at: null` with live-calculated duration
- [ ] Node with exactly 10,000 log entries returns all 10,000 (maximum valid log fetch size)
- [ ] Node with more than 10,000 log entries returns the first 10,000 (log entries beyond 10,000 are truncated)
- [ ] Node name containing special characters (spaces, hyphens, underscores, dots, unicode) resolves correctly
- [ ] Node name matching is case-insensitive: `"build"` matches step named `"Build"`
- [ ] Multiple steps with the same name: the first match (by array iteration order, which is position order) is returned
- [ ] Workflow run with a single step: Mermaid graph contains one node and no edges
- [ ] Workflow run with zero steps (edge case): returns 404 for any nodeId since no steps exist to match
- [ ] Step name that is also a valid numeric string (e.g., step named `"42"`): numeric ID match is attempted first; if step ID 42 exists, it wins; otherwise falls through to name match
- [ ] Very long step name (255 characters): handled correctly in response and Mermaid/XML generation
- [ ] Log entries with empty `entry` strings: included in response with `entry: ""`
- [ ] Log entries with multiline content (embedded newlines): preserved as-is in the `entry` field
- [ ] Concurrent log writes during fetch: snapshot consistency — the response reflects logs available at query time

## Design

### API Shape

**Endpoint**

```
GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId
```

**Path Parameters:**

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `owner` | string | Required, non-empty | Repository owner username or organization |
| `repo` | string | Required, non-empty | Repository name |
| `id` | string | Positive integer | Workflow run ID |
| `nodeId` | string | Non-empty after trim | Step ID (numeric) or step name (case-insensitive) |

**Response (200 OK):**

```json
{
  "run_id": 42,
  "node": {
    "id": "7",
    "step_id": 7,
    "name": "Build",
    "position": 1,
    "status": "success",
    "iteration": 1,
    "started_at": "2026-03-22T10:15:35.000Z",
    "completed_at": "2026-03-22T10:16:05.000Z",
    "duration": "30s",
    "duration_seconds": 30
  },
  "logs": [
    {
      "id": 100,
      "sequence": 1,
      "stream": "stdout",
      "entry": "Compiling project...",
      "created_at": "2026-03-22T10:15:36.000Z"
    },
    {
      "id": 101,
      "sequence": 2,
      "stream": "stderr",
      "entry": "warning: unused variable 'x'",
      "created_at": "2026-03-22T10:15:37.000Z"
    },
    {
      "id": 150,
      "sequence": 50,
      "stream": "stdout",
      "entry": "Build succeeded.",
      "created_at": "2026-03-22T10:16:04.000Z"
    }
  ],
  "output": null,
  "plan_xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<workflow name=\"CI\" path=\".codeplane/workflows/ci.ts\" run_id=\"42\" status=\"success\">\n  <node id=\"7\" step_id=\"7\" name=\"Build\" position=\"1\" status=\"success\" iteration=\"1\" duration=\"30s\"></node>\n  <node id=\"8\" step_id=\"8\" name=\"Test\" position=\"2\" status=\"success\" iteration=\"1\" duration=\"1m 12s\"></node>\n</workflow>",
  "mermaid": "graph TD\n    N1[\"Build\"]\n    N2[\"Test\"]\n    N1 -->|success 30s| N2\n    style N1 fill:#22c55e\n    style N2 fill:#22c55e\n"
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "message": "invalid run id" }` | `:id` is non-numeric, zero, or negative |
| 400 | `{ "message": "invalid node id" }` | `:nodeId` is empty or whitespace-only |
| 401 | `{ "message": "unauthorized" }` | Missing or invalid authentication for private repo |
| 403 | `{ "message": "forbidden" }` | Insufficient repository access |
| 404 | `{ "message": "repository not found" }` | Owner or repo does not exist |
| 404 | `{ "message": "workflow run not found" }` | Run ID does not exist in this repository |
| 404 | `{ "message": "workflow definition not found" }` | Associated definition has been deleted |
| 404 | `{ "message": "workflow node not found" }` | No step matches the given nodeId |

### SDK Shape

The existing `WorkflowService` in `@codeplane/sdk` already provides the building blocks. The node detail endpoint composes:

```typescript
// Fetch the run
getWorkflowRunById(repositoryId: string, runId: string): Promise<Result<WorkflowRun, APIError>>

// Fetch the definition (for plan_xml and mermaid context)
getWorkflowDefinitionById(repositoryId: string, definitionId: string): Promise<Result<WorkflowDefinition, APIError>>

// Fetch all steps for the run
listWorkflowSteps(runId: string): Promise<Result<WorkflowStep[], APIError>>

// Fetch logs for the run (filtered client-side to the matched step)
listWorkflowLogsSince(runId: string, afterId: number, limit: number): Promise<Result<WorkflowLogEntry[], APIError>>
```

The route handler orchestrates these calls, matches the requested node, filters logs, and assembles the composite response with `toWorkflowRunNodeResponse()`, `buildWorkflowPlanXML()`, and `buildWorkflowRunMermaid()` helpers.

A convenience method should be added to `@codeplane/ui-core` for client consumption:

```typescript
useWorkflowRunNodeDetail(owner: string, repo: string, runId: number, nodeId: string): {
  node: WorkflowRunNodeResponse | null;
  logs: WorkflowLogEntry[];
  mermaid: string;
  planXml: string;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

### CLI Command

```
codeplane run view <runId> --node <nodeId> [--repo OWNER/REPO] [--json]
```

**Behavior:**
- `<runId>` is a required positional argument (positive integer)
- `--node <nodeId>` is required for node detail (without it, the command shows run-level detail)
- `--repo` resolves the target repository; if omitted, inferred from the current working directory
- `--json` outputs the raw API JSON response to stdout
- Default output is a formatted detail view:

**Example output (human-readable mode):**

```
Node: Build (#7)
Status: ✓ success
Position: 1 of 3
Iteration: 1
Started: 2026-03-22T10:15:35Z
Completed: 2026-03-22T10:16:05Z
Duration: 30s

── Logs (50 lines) ─────────────────────────────────
   1 │ Compiling project...
   2 │ warning: unused variable 'x'                   [stderr]
   …
  50 │ Build succeeded.
```

- Stderr log lines are annotated with `[stderr]` suffix in muted color
- Log line numbers are right-aligned
- If no logs exist, displays `No log output.`
- Exit code 0 on success, 1 on API error

An additional subcommand alias for convenience:

```
codeplane run node <runId> <nodeId> [--repo OWNER/REPO] [--json]
```

This is equivalent to `codeplane run view <runId> --node <nodeId>`.

### Web UI Design

The node detail is presented as a drill-down panel within the workflow run detail page at route:

```
/:owner/:repo/workflows/runs/:runId/nodes/:nodeId
```

Alternatively, it can render as a side panel or expandable section within `/:owner/:repo/workflows/runs/:runId` when a node is selected.

**Layout:**

1. **Breadcrumb:** `{owner}/{repo} > Workflows > {workflow-name} > Run #{runId} > {node-name}`

2. **Node Header:**
   - Node name (large, bold)
   - Status badge (colored: green/success, red/failure, blue-animated/running, gray/queued, muted/cancelled, yellow/timeout)
   - Duration display (or live elapsed timer for running nodes)
   - Position indicator: "Step 2 of 5"
   - Iteration badge (shown only if iteration > 1)
   - Started/completed timestamps in relative format ("3 minutes ago") with ISO tooltip

3. **Workflow Graph (collapsible):**
   - Rendered Mermaid DAG showing all workflow nodes
   - The current node is highlighted/outlined
   - Clicking other nodes navigates to their detail

4. **Log Viewer (primary content area):**
   - Full log output with line numbers in a monospace font
   - Stdout lines in default text color
   - Stderr lines with a red left border and slightly different background
   - ANSI color codes rendered (using a terminal-to-HTML converter)
   - Search within logs (Ctrl+F or search icon)
   - Copy-to-clipboard button for individual lines or full log
   - Download full log as `.log` file button
   - "Scroll to bottom" sticky button when not at bottom
   - For running nodes: live streaming indicator, auto-scroll behavior, and a toggle to pause auto-scroll
   - For nodes with >10,000 lines: a notice that logs are truncated with the oldest lines omitted
   - Empty state: "No log output for this step." (for queued nodes: "Waiting for execution...")

5. **Plan View (tab or collapsible):**
   - Raw XML plan in a code block with syntax highlighting
   - Copy-to-clipboard button

**Navigation:**
- Previous/Next node buttons in the header to navigate between sibling nodes without returning to run detail
- Keyboard shortcuts: `[` for previous node, `]` for next node, `Esc` to return to run detail
- Back link to run detail page

### TUI UI

The TUI node detail is integrated into the Workflow Run Detail screen (see TUI_WORKFLOW_RUN_DETAIL spec). When a step is focused and expanded:

- The step's log output streams inline below the step row
- Pressing `l` on a focused step opens a full-screen log viewer for that step, which calls `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` to fetch the complete node detail including all logs
- The full-screen log viewer shows:
  - Node name and status in the header
  - Duration and timing
  - Full log output with line numbers
  - Stderr lines marked with red left border
  - ANSI passthrough
  - Search with `/` key
  - Auto-follow toggle with `f`
  - `q` to return to run detail

### Documentation

End-user documentation should cover:

1. **"Inspecting Workflow Steps"** — A guide explaining how to drill into a specific workflow step/node to view its execution details and logs. Includes screenshots of the web UI node detail panel, example CLI output, and TUI interaction description.

2. **"Reading Workflow Logs"** — Explains log output conventions: stdout vs stderr distinction, ANSI color rendering, line numbering, the 10,000-line fetch limit, and how to use search within logs.

3. **"CLI Reference: `codeplane run view --node`"** — Full flag documentation, examples with both numeric and name-based node identifiers, `--json` output piping patterns, and the `codeplane run node` alias.

4. **"API Reference: Get Workflow Run Node Detail"** — Endpoint documentation with the full request/response schema, node identifier resolution rules (ID vs name, case-insensitivity), error codes, and examples of Mermaid/XML contextual representations.

5. **"Understanding the Workflow Graph"** — Explains the Mermaid DAG and XML plan representations returned in the node detail response, how to render them, and how to use them for debugging complex multi-step workflows.

## Permissions & Security

### Authorization Roles

| Role | Public Repository | Private Repository |
|------|------------------|--------------------|
| Anonymous (unauthenticated) | ✅ Read node detail | ❌ 401 |
| Authenticated (no repo access) | ✅ Read node detail | ❌ 403 |
| Read-only member | ✅ Read node detail | ✅ Read node detail |
| Write member | ✅ Read node detail | ✅ Read node detail |
| Admin | ✅ Read node detail | ✅ Read node detail |
| Owner | ✅ Read node detail | ✅ Read node detail |

This feature is strictly read-only. There are no mutation operations on the node detail endpoint. Actions like cancel, rerun, and resume are performed at the run level and are covered by their own feature specs (WORKFLOW_RUN_CANCEL, WORKFLOW_RUN_RERUN, WORKFLOW_RUN_RESUME).

### Rate Limiting

| Endpoint | Limit | Scope |
|----------|-------|-------|
| `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` | 300 requests/minute | Per authenticated user |
| `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` (anonymous) | 60 requests/minute | Per IP address |

Rate limit headers included in every response:
- `X-RateLimit-Limit`: Maximum requests in the window
- `X-RateLimit-Remaining`: Remaining requests in the window
- `X-RateLimit-Reset`: Unix timestamp when the window resets
- `Retry-After`: Seconds to wait (on 429 responses only)

**Note:** The node detail endpoint fetches up to 10,000 log entries per request, which can be a heavier database operation than typical list endpoints. The rate limit accounts for this but operators should monitor for abusive patterns (e.g., automated polling of node detail for running steps instead of using the SSE log stream).

### Data Privacy

- Log `entry` content may contain sensitive information (environment variables printed to stdout, file paths, internal hostnames, error stack traces). These are user-generated outputs and are shown as-is to any user with repository read access.
- The `plan_xml` and `mermaid` representations expose step names and workflow structure. These are not considered sensitive for users who already have repository access.
- The `output` field is currently `null` but is reserved for structured step output. When implemented, it should be reviewed for potential PII in structured results.
- `workflow_step_id` is stripped from individual log entries in the response to avoid leaking internal database identifiers beyond the node-level `step_id` field.
- No secrets, tokens, or credentials should ever appear in log entries. Workflow runners must mask secrets before writing to the log stream. If a secret is detected in a log line, it must be redacted to `***` before storage.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workflow_run_node.detail_viewed` | Any client fetches the node detail endpoint | `repo_owner`, `repo_name`, `run_id`, `node_id`, `node_name`, `node_status`, `node_identifier_type` ("numeric" or "name"), `client` (web/cli/tui/api), `log_count`, `total_time_ms` |
| `workflow_run_node.logs_scrolled` | User scrolls through logs in web UI or TUI | `repo_owner`, `repo_name`, `run_id`, `node_id`, `scroll_depth_percent`, `client` |
| `workflow_run_node.log_searched` | User searches within log output | `repo_owner`, `repo_name`, `run_id`, `node_id`, `search_query_length`, `match_count`, `client` |
| `workflow_run_node.log_downloaded` | User downloads the log file (web UI) | `repo_owner`, `repo_name`, `run_id`, `node_id`, `log_line_count`, `log_size_bytes` |
| `workflow_run_node.log_copied` | User copies log content to clipboard | `repo_owner`, `repo_name`, `run_id`, `node_id`, `copied_line_count`, `client` |
| `workflow_run_node.graph_viewed` | User expands or views the Mermaid workflow graph | `repo_owner`, `repo_name`, `run_id`, `node_count`, `client` |
| `workflow_run_node.graph_navigated` | User clicks another node in the graph to navigate | `repo_owner`, `repo_name`, `run_id`, `from_node_id`, `to_node_id`, `client` |
| `workflow_run_node.sibling_navigated` | User uses previous/next node navigation | `repo_owner`, `repo_name`, `run_id`, `from_node_id`, `to_node_id`, `direction` ("prev"/"next"), `client` |
| `workflow_run_node.detail_error` | The endpoint returns a non-2xx status | `repo_owner`, `repo_name`, `run_id`, `node_id`, `http_status`, `error_message`, `client` |
| `workflow_run_node.logs_truncated` | Response contains 10,000 logs (indicating potential truncation) | `repo_owner`, `repo_name`, `run_id`, `node_id`, `log_count` |

### Common Properties (all events)

- `user_id` (hashed)
- `session_id`
- `timestamp` (ISO 8601)
- `codeplane_version`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------|
| Node detail view completion rate | > 98% | Users who request node detail should receive a successful response |
| Log scroll depth (median) | > 50% | Users are reading the logs, not just glancing at the top |
| Node detail from run detail rate | > 60% of run detail views | Most run inspections should lead to at least one node drill-down |
| Failed node detail view rate | > 80% of all node detail views target failing nodes | The primary use case is debugging failures |
| Log search usage rate | > 10% of node detail views | Log search is discovered and used for non-trivial logs |
| Sibling navigation rate | > 15% of node detail views | Users navigate between steps rather than going back to run detail |
| Average API latency (p50) | < 300ms | Node detail with logs should feel responsive |
| Average API latency (p95) | < 1500ms | Even with large log sets, tail latency should be acceptable |
| Log truncation rate | < 5% of node detail views | Most steps should produce fewer than 10,000 log lines |
| Error rate | < 1% | The endpoint should be highly reliable |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-----------|
| `debug` | Request received | `method=GET`, `path`, `owner`, `repo`, `run_id`, `node_id`, `request_id` |
| `debug` | Node identifier type resolved | `node_id`, `identifier_type` ("numeric"/"name"), `matched_step_id`, `request_id` |
| `debug` | Run fetched | `repository_id`, `run_id`, `run_status`, `duration_ms`, `request_id` |
| `debug` | Definition fetched | `definition_id`, `definition_name`, `duration_ms`, `request_id` |
| `debug` | Steps fetched | `run_id`, `step_count`, `duration_ms`, `request_id` |
| `debug` | Logs fetched | `run_id`, `step_id`, `total_logs_fetched`, `filtered_log_count`, `duration_ms`, `request_id` |
| `debug` | Mermaid and plan_xml generated | `node_count`, `generation_duration_ms`, `request_id` |
| `info` | Response sent | `status=200`, `node_id`, `node_name`, `node_status`, `log_count`, `total_duration_ms`, `request_id` |
| `warn` | Slow query (> 1000ms total) | `repository_id`, `run_id`, `node_id`, `total_duration_ms`, `log_fetch_duration_ms`, `log_count`, `request_id` |
| `warn` | Large log set (10,000 entries — fetch limit reached) | `repository_id`, `run_id`, `step_id`, `log_count`, `request_id` |
| `warn` | Rate limited | `user_id`, `ip`, `endpoint`, `retry_after_s`, `request_id` |
| `error` | Database query failure | `repository_id`, `run_id`, `query_name`, `error_message`, `error_code`, `request_id` |
| `error` | Repository resolution failure | `owner`, `repo`, `error_message`, `request_id` |
| `error` | Unexpected exception | `error_message`, `stack_trace`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_node_detail_requests_total` | Counter | `status` (200/400/401/403/404/429/500), `node_status`, `identifier_type` (numeric/name) | Total requests to the node detail endpoint |
| `codeplane_workflow_node_detail_duration_seconds` | Histogram | `status`, `node_status` | Total request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_workflow_node_detail_log_count` | Histogram | `node_status` | Number of log entries returned per request (buckets: 0, 1, 10, 50, 100, 500, 1000, 5000, 10000) |
| `codeplane_workflow_node_detail_log_fetch_duration_seconds` | Histogram | — | Time spent fetching and filtering log entries |
| `codeplane_workflow_node_detail_db_query_duration_seconds` | Histogram | `query` (run/definition/steps/logs) | Time spent per individual database query |
| `codeplane_workflow_node_detail_log_truncated_total` | Counter | — | Number of requests where log count hit the 10,000 limit |
| `codeplane_workflow_node_detail_rate_limited_total` | Counter | `scope` (user/ip) | Total rate-limited requests |
| `codeplane_workflow_node_detail_node_not_found_total` | Counter | `identifier_type` | Node-not-found 404s (potential UX issue indicator) |

### Alerts

#### Alert: `WorkflowNodeDetailHighErrorRate`
- **Condition:** `rate(codeplane_workflow_node_detail_requests_total{status=~"5.."}[5m]) / rate(codeplane_workflow_node_detail_requests_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check server error logs filtered by `request_id` for 5xx errors: `grep "error" logs | grep "workflow_node_detail"`
  2. Check database connectivity: run `SELECT 1` against the primary database
  3. Inspect `codeplane_workflow_node_detail_db_query_duration_seconds` to identify if a specific query (run/definition/steps/logs) is the bottleneck
  4. Check if a specific repository or run is causing all errors by examining `repository_id` and `run_id` in error logs
  5. Check the `workflow_logs` table for bloat — large step log sets may cause memory pressure during the fetch
  6. If the logs query is timing out, verify indexes exist on `workflow_logs(workflow_run_id, workflow_step_id, id)` and `workflow_logs(workflow_step_id, id)`
  7. If a single run has an extremely large number of logs, consider if the 10,000 limit needs to be enforced at the DB layer rather than application layer
  8. Restart the server process if connection pool is exhausted

#### Alert: `WorkflowNodeDetailHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_node_detail_duration_seconds_bucket[5m])) > 3`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_node_detail_log_fetch_duration_seconds` — log fetching is typically the slowest component
  2. Check `codeplane_workflow_node_detail_log_count` distribution — high log counts correlate with high latency
  3. Run `EXPLAIN ANALYZE` on `listWorkflowLogsSince` for a sample run_id to check query plan
  4. Verify index on `workflow_logs(workflow_run_id, id)` exists and is being used
  5. Check if the log filter (by step_id) is happening in application code — consider pushing it to the SQL query for large runs
  6. Check `codeplane_workflow_node_detail_db_query_duration_seconds{query="definition"}` — definition lookup should be fast; if slow, the definitions table may need vacuuming
  7. If Mermaid/XML generation is slow for runs with many nodes, consider caching the plan representations at the run level

#### Alert: `WorkflowNodeDetailHighTruncationRate`
- **Condition:** `rate(codeplane_workflow_node_detail_log_truncated_total[1h]) / rate(codeplane_workflow_node_detail_requests_total{status="200"}[1h]) > 0.15`
- **Severity:** Warning
- **Runbook:**
  1. Identify which repositories and workflows are producing steps with >10,000 log lines
  2. Check if those workflows are excessively verbose (e.g., debug logging enabled in CI)
  3. Consider whether the 10,000 line limit should be increased, or whether pagination should be added to the log fetch
  4. Evaluate offering a log download endpoint that returns the full log set as a streamed file
  5. Communicate to affected users that logs are truncated and suggest reducing log verbosity

#### Alert: `WorkflowNodeDetailHighNotFoundRate`
- **Condition:** `rate(codeplane_workflow_node_detail_node_not_found_total[5m]) > 20`
- **Severity:** Warning
- **Runbook:**
  1. Check `identifier_type` label to determine if users are failing with numeric IDs or names
  2. If name-based lookups are failing, check if step names have changed between workflow definition updates while users have stale links
  3. If numeric ID lookups are failing, check if clients are caching stale step IDs from previous runs
  4. Review web UI and CLI to ensure they're passing correct node identifiers from the run detail response
  5. Check if there's a naming collision or encoding issue (e.g., URL encoding of special characters in step names)

#### Alert: `WorkflowNodeDetailRateLimitSpike`
- **Condition:** `rate(codeplane_workflow_node_detail_rate_limited_total[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Identify the rate-limited user or IP from logs
  2. Determine if this is a polling pattern (client repeatedly fetching node detail for a running step instead of using SSE)
  3. For legitimate polling, recommend the SSE log stream endpoint (`GET /api/repos/:owner/:repo/runs/:id/logs`) as an alternative
  4. For abuse, consider temporary IP block or token revocation
  5. If the client is a web UI auto-refresh, ensure it's using SSE rather than polling the REST endpoint

### Error Cases and Failure Modes

| Error Case | HTTP Status | Log Level | Recovery |
|------------|-------------|-----------|----------|
| Invalid run ID format | 400 | debug | Client fixes the request URL |
| Empty/whitespace node ID | 400 | debug | Client fixes the request URL |
| Missing auth for private repo | 401 | info | Client re-authenticates |
| Insufficient repo access | 403 | info | User requests access from repo admin |
| Repository not found | 404 | info | Client corrects owner/repo |
| Run not found | 404 | info | Client corrects run ID or run was deleted |
| Definition deleted | 404 | warn | Orphaned run — admin may need to clean up |
| Node not found | 404 | info | Client corrects node identifier |
| Rate limited | 429 | warn | Client waits and retries with backoff |
| Database connection failure | 500 | error | Auto-retry with backoff; alert fires |
| Log query timeout | 500 | error | Check query plan; add index; reduce limit |
| Out-of-memory on large log set | 500 | error | Enforce streaming or pagination for logs; reduce in-memory buffering |
| Mermaid/XML generation failure | 500 | error | Likely a character encoding issue in step names; check escaping functions |

## Verification

### API Integration Tests

**File: `e2e/api/workflow-run-node-detail.test.ts`**

| Test ID | Description |
|---------|-------------|
| API-WRND-001 | `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` with valid numeric step ID returns 200 with full node detail response |
| API-WRND-002 | Response includes all required top-level fields: `run_id`, `node`, `logs`, `output`, `plan_xml`, `mermaid` |
| API-WRND-003 | `node` object includes all required fields: `id`, `step_id`, `name`, `position`, `status`, `iteration`, `started_at`, `completed_at`, `duration`, `duration_seconds` |
| API-WRND-004 | `node.id` is a string representation of the numeric step ID |
| API-WRND-005 | `node.step_id` matches the database step ID |
| API-WRND-006 | `node.duration` is a formatted string matching the pattern `"Xs"` or `"Xm Ys"` or `"Xh Ym"` or `""` |
| API-WRND-007 | `node.duration_seconds` is a non-negative integer consistent with `started_at` and `completed_at` |
| API-WRND-008 | `node.iteration` is 1 for first-run nodes |
| API-WRND-009 | Node lookup by name (case-insensitive): `GET .../nodes/Build` matches step named `"Build"` |
| API-WRND-010 | Node lookup by name (different case): `GET .../nodes/build` matches step named `"Build"` |
| API-WRND-011 | Node lookup by name (uppercase): `GET .../nodes/BUILD` matches step named `"Build"` |
| API-WRND-012 | Node lookup by numeric ID: `GET .../nodes/7` matches step with `id=7` |
| API-WRND-013 | Node ID with leading/trailing whitespace is trimmed: `GET .../nodes/%20Build%20` matches `"Build"` |
| API-WRND-014 | Empty node ID returns 400 with `{ "message": "invalid node id" }` |
| API-WRND-015 | Whitespace-only node ID returns 400 with `{ "message": "invalid node id" }` |
| API-WRND-016 | Non-existent node name returns 404 with `{ "message": "workflow node not found" }` |
| API-WRND-017 | Non-existent numeric node ID returns 404 with `{ "message": "workflow node not found" }` |
| API-WRND-018 | Invalid run ID (non-numeric) returns 400 with `{ "message": "invalid run id" }` |
| API-WRND-019 | Run ID of 0 returns 400 with `{ "message": "invalid run id" }` |
| API-WRND-020 | Negative run ID returns 400 with `{ "message": "invalid run id" }` |
| API-WRND-021 | Non-existent run ID returns 404 with `{ "message": "workflow run not found" }` |
| API-WRND-022 | Run belonging to a different repository returns 404 |
| API-WRND-023 | Non-existent repository returns 404 |
| API-WRND-024 | Non-existent owner returns 404 |
| API-WRND-025 | Deleted workflow definition returns 404 with `{ "message": "workflow definition not found" }` |
| API-WRND-026 | Logs are filtered to only include entries for the matched step's `workflow_step_id` |
| API-WRND-027 | Logs are ordered by `sequence` ascending |
| API-WRND-028 | Each log entry contains: `id`, `sequence`, `stream`, `entry`, `created_at` |
| API-WRND-029 | Log entries do NOT contain `workflow_step_id` field |
| API-WRND-030 | Log `stream` values are either `"stdout"` or `"stderr"` |
| API-WRND-031 | Log `created_at` values are ISO 8601 timestamps |
| API-WRND-032 | Node with zero log entries returns `{ "logs": [] }` |
| API-WRND-033 | Node with 1 log entry returns array with 1 element |
| API-WRND-034 | Node with 10,000 log entries returns all 10,000 (maximum valid fetch size) |
| API-WRND-035 | Node with more than 10,000 log entries returns exactly 10,000 (truncated) |
| API-WRND-036 | Log entries with empty `entry` strings are included in the response |
| API-WRND-037 | Log entries with ANSI escape codes in `entry` are preserved as-is |
| API-WRND-038 | Log entries with UTF-8 multibyte characters (emoji, CJK) in `entry` are preserved |
| API-WRND-039 | Log entries with embedded newlines in `entry` are preserved |
| API-WRND-040 | `output` field is `null` |
| API-WRND-041 | `mermaid` contains a valid Mermaid graph TD string |
| API-WRND-042 | `mermaid` includes all nodes from the workflow run, not just the requested node |
| API-WRND-043 | `mermaid` node colors correspond to step statuses |
| API-WRND-044 | `mermaid` escapes pipe characters in node names |
| API-WRND-045 | `mermaid` escapes double quotes in node names |
| API-WRND-046 | `plan_xml` starts with `<?xml version="1.0" encoding="UTF-8"?>` |
| API-WRND-047 | `plan_xml` contains `<workflow>` element with `name`, `path`, `run_id`, `status` attributes |
| API-WRND-048 | `plan_xml` contains `<node>` elements for all steps in the run |
| API-WRND-049 | `plan_xml` properly escapes XML special characters in step names |
| API-WRND-050 | Queued node (never started): `started_at` is null, `completed_at` is null, `duration` is `""`, `duration_seconds` is 0, logs are empty |
| API-WRND-051 | Running node (started, not completed): `completed_at` is null, `duration` and `duration_seconds` reflect elapsed time |
| API-WRND-052 | Completed success node: all fields populated, `status` is `"success"` |
| API-WRND-053 | Failed node: `status` is `"failure"`, all timing fields populated |
| API-WRND-054 | Cancelled node: `status` is `"cancelled"` |
| API-WRND-055 | Run with single step: Mermaid graph has one node and no edges |
| API-WRND-056 | Run with 10 steps: Mermaid graph has 10 nodes and 9 edges |
| API-WRND-057 | Node name with spaces resolves correctly: `GET .../nodes/Run%20Tests` |
| API-WRND-058 | Node name with hyphens resolves correctly: `GET .../nodes/build-project` |
| API-WRND-059 | Node name with underscores resolves correctly: `GET .../nodes/run_tests` |
| API-WRND-060 | Node name that is a valid numeric string (e.g., `"42"`) when step ID 42 exists: returns step with ID 42 |
| API-WRND-061 | Node name that is a valid numeric string (e.g., `"42"`) when step ID 42 does NOT exist but a step named `"42"` does: returns the named step |
| API-WRND-062 | Owner and repo names with hyphens, underscores, and dots resolve correctly |
| API-WRND-063 | Unauthenticated request to public repository returns 200 |
| API-WRND-064 | Unauthenticated request to private repository returns 401 |
| API-WRND-065 | Authenticated user without repo access on private repo returns 403 |
| API-WRND-066 | Concurrent requests to the same node detail endpoint return consistent data |
| API-WRND-067 | Step name with 255 characters resolves correctly and appears in response, Mermaid, and XML |
| API-WRND-068 | Step name with 256+ characters: verify behavior matches what the system stores (name should have been validated at creation time) |
| API-WRND-069 | `run_id` in the response matches the requested run ID |
| API-WRND-070 | Timestamps (`started_at`, `completed_at`, `created_at`) are in ISO 8601 format |

### CLI Integration Tests

**File: `e2e/cli/workflow-run-node-detail.test.ts`**

| Test ID | Description |
|---------|-------------|
| CLI-WRND-001 | `codeplane run view <runId> --node <nodeId> --repo owner/repo` outputs formatted node detail |
| CLI-WRND-002 | `codeplane run view <runId> --node <nodeId> --repo owner/repo --json` outputs valid JSON matching the API response shape |
| CLI-WRND-003 | `codeplane run node <runId> <nodeId> --repo owner/repo` outputs the same result as `run view --node` |
| CLI-WRND-004 | Output includes node name, status icon, position, duration, and timing |
| CLI-WRND-005 | Logs section shows line numbers and log content |
| CLI-WRND-006 | Stderr log lines are annotated with `[stderr]` |
| CLI-WRND-007 | Node with name identifier: `codeplane run view 42 --node Build` resolves correctly |
| CLI-WRND-008 | Node with numeric identifier: `codeplane run view 42 --node 7` resolves correctly |
| CLI-WRND-009 | Node with no logs displays `No log output.` |
| CLI-WRND-010 | Non-existent node exits with code 1 and error message |
| CLI-WRND-011 | Non-existent run exits with code 1 and error message |
| CLI-WRND-012 | Non-existent repo exits with code 1 and error message |
| CLI-WRND-013 | `codeplane run view <runId> --node <nodeId>` without `--repo` infers repository from current directory |
| CLI-WRND-014 | JSON output includes `run_id`, `node`, `logs`, `output`, `plan_xml`, `mermaid` |

### Playwright (Web UI) E2E Tests

**File: `e2e/web/workflow-run-node-detail.test.ts`**

| Test ID | Description |
|---------|-------------|
| WEB-WRND-001 | Navigate to `/:owner/:repo/workflows/runs/:runId/nodes/:nodeId` and see the node detail view |
| WEB-WRND-002 | Node header displays name, status badge, duration, and position |
| WEB-WRND-003 | Breadcrumb shows `owner/repo > Workflows > workflow-name > Run #runId > node-name` |
| WEB-WRND-004 | Log viewer renders all log lines with line numbers |
| WEB-WRND-005 | Stderr log lines have a red left border |
| WEB-WRND-006 | ANSI colors in log entries are rendered as styled HTML |
| WEB-WRND-007 | Log search (Ctrl+F) highlights matching lines |
| WEB-WRND-008 | Copy log button copies log content to clipboard |
| WEB-WRND-009 | Download log button downloads a .log file |
| WEB-WRND-010 | Mermaid workflow graph renders with color-coded nodes |
| WEB-WRND-011 | Clicking another node in the Mermaid graph navigates to that node's detail |
| WEB-WRND-012 | Previous/Next node buttons navigate between sibling nodes |
| WEB-WRND-013 | `[` key navigates to previous node, `]` key navigates to next node |
| WEB-WRND-014 | `Esc` key returns to run detail page |
| WEB-WRND-015 | Empty log state shows `No log output for this step.` |
| WEB-WRND-016 | Queued node shows `Waiting for execution...` |
| WEB-WRND-017 | Running node shows live elapsed timer |
| WEB-WRND-018 | Log truncation notice shown when 10,000 lines are returned |
| WEB-WRND-019 | Plan XML view renders in a code block with syntax highlighting |
| WEB-WRND-020 | Private repo without access shows 403 message |
| WEB-WRND-021 | Non-existent node shows 404 message |
| WEB-WRND-022 | Non-existent run shows 404 message |
| WEB-WRND-023 | Clicking from run detail step list navigates to correct node detail |

### TUI E2E Tests

**File: `e2e/tui/workflow-run-node-detail.test.ts`**

| Test ID | Description |
|---------|-------------|
| TUI-WRND-001 | Pressing `l` on a focused step in run detail opens full-screen log viewer |
| TUI-WRND-002 | Full-screen log viewer shows node name and status in header |
| TUI-WRND-003 | Full-screen log viewer displays log lines with line numbers |
| TUI-WRND-004 | Stderr lines have red left border in log viewer |
| TUI-WRND-005 | ANSI color codes are passed through to terminal |
| TUI-WRND-006 | `/` key opens search within logs |
| TUI-WRND-007 | `f` key toggles auto-follow mode |
| TUI-WRND-008 | `q` key returns to run detail screen |
| TUI-WRND-009 | Node with no logs shows `No output` in muted text |
| TUI-WRND-010 | Queued node shows `Waiting for logs…` placeholder |
| TUI-WRND-011 | Log viewer scrolls vertically for long output |
| TUI-WRND-012 | Long log lines scroll horizontally without wrapping |
| TUI-WRND-013 | Duration and timing information displayed correctly |
| TUI-WRND-014 | Log viewer fetches data from node detail API endpoint |
| TUI-WRND-015 | Terminal resize re-renders layout correctly |

All tests are left failing if the backend is unimplemented — never skipped or commented out.

# WORKFLOW_JOB_DEPENDENCY_GRAPH

Specification for WORKFLOW_JOB_DEPENDENCY_GRAPH.

## High-Level User POV

When you define a workflow in Codeplane, your jobs often depend on each other. A build job must finish before tests can run, and tests must pass before a deploy can happen. The **Workflow Job Dependency Graph** makes these relationships visible, interactive, and enforceable across every Codeplane surface — web, CLI, TUI, and editors.

When you author a workflow, you express job dependencies using the `needs` field on each job. Codeplane validates these dependencies immediately: it catches circular dependencies, self-references, and references to jobs that don't exist before anything runs. You never waste time discovering a broken workflow graph mid-execution.

When a workflow runs, you see the dependency graph come alive. Jobs that can run in parallel fan out visually. Jobs that are waiting on upstream dependencies are clearly shown as blocked, with lines connecting them to the jobs they depend on. As each job completes, its status propagates through the graph — you can see at a glance which downstream jobs are now unblocked, which are running, and which are still waiting. If an upstream job fails, you immediately understand which downstream jobs will be skipped or conditionally gated.

The graph is not just a static picture. On the web, you can click any job node to drill into its logs, timing, and task details. Hovering over edges reveals the status and duration of upstream jobs. The graph reflows in real time as jobs start, complete, or fail. On the CLI, a structured text representation shows the same dependency tree with status indicators. In the TUI, an ASCII-rendered DAG occupies the top of the run detail screen. In editors, the same information surfaces through status indicators and quick-access panels.

Conditional job execution is also visible in the graph. When a job has an `if` expression — such as "only run this deploy if all tests succeeded" or "always run the cleanup job" — the graph shows the condition alongside the dependency edge. You can understand at a glance not just *what* depends on *what*, but *under what conditions* each job will actually execute.

For teams using agents, the dependency graph is equally important. Agents dispatching workflows can inspect the graph structure programmatically through the API. The graph response includes a structured node list with dependency edges, a Mermaid diagram for rendering, and an XML plan document for machine consumption. This enables agents to reason about workflow structure, monitor execution progress, and make decisions based on which jobs have completed.

The dependency graph is the control panel for understanding workflow execution order, parallelism opportunities, and failure propagation — turning a flat list of jobs into a clear, navigable execution plan.

## Acceptance Criteria

### Definition of Done

- [ ] Job dependency declarations (`needs: string[]`) are validated at dispatch time with clear, actionable error messages
- [ ] The dependency graph is rendered visually on the web UI workflow run detail page
- [ ] The dependency graph is available as structured data via the API (nodes, edges, Mermaid, XML)
- [ ] The CLI displays dependency relationships in both human-readable and JSON output formats
- [ ] The TUI renders an ASCII dependency graph on the workflow run detail screen
- [ ] Real-time graph updates reflect job status changes as they happen via SSE
- [ ] Conditional execution expressions (`if`) are displayed on graph edges and nodes
- [ ] The graph correctly represents parallel execution lanes for independent jobs

### Validation Rules

- [ ] A job **must not** list itself in its `needs` array — returns error: `job "X" has a self-dependency`
- [ ] A job **must not** reference a job name that does not exist in the workflow — returns error: `job "X" depends on unknown job "Y"`
- [ ] The graph **must not** contain cycles — returns error: `dependency cycle detected involving job "X"`
- [ ] DAG validation **must** occur before any run, step, or task records are created
- [ ] A workflow with zero jobs produces an empty graph with no errors
- [ ] A workflow with a single job and no dependencies produces a single-node graph
- [ ] Job names in `needs` arrays are case-sensitive and must exactly match the declared job name
- [ ] Job names must match the pattern `[a-zA-Z0-9_-]+` (alphanumeric, underscore, hyphen)
- [ ] Maximum number of jobs in a single workflow: **256**
- [ ] Maximum length of a job name: **128 characters**
- [ ] Maximum number of dependencies per job (`needs` array length): **64**
- [ ] The `needs` array must not contain duplicate entries for the same job name
- [ ] A workflow where all jobs are independent (no `needs` declarations) renders as a parallel fan-out graph

### Status Propagation Rules

- [ ] Jobs with no `needs` start immediately when the run begins (status: `pending`)
- [ ] Jobs with `needs` start in `blocked` status until all dependencies reach a terminal state
- [ ] When all dependencies of a blocked job succeed and the job's `if` expression evaluates to true, the job transitions to `pending`
- [ ] When any dependency of a blocked job fails, the job's `if` expression is evaluated — if `failure()` is not referenced, the job is `skipped`
- [ ] The `always()` function causes the job to run regardless of dependency outcomes
- [ ] The `success()` function requires all dependencies to have succeeded
- [ ] The `failure()` function requires at least one dependency to have failed
- [ ] The `cancelled()` function requires at least one dependency to have been cancelled
- [ ] `needs.JOB_NAME.result == "value"` allows checking the specific result of a single dependency
- [ ] Conjunction (`&&`) is supported in `if` expressions for combining multiple conditions

### Edge Cases

- [ ] A workflow with 256 jobs and a single linear chain (A→B→C→...→ZZZ) renders correctly
- [ ] A workflow with 256 independent jobs renders as a wide parallel fan-out
- [ ] A diamond dependency (A→B, A→C, B→D, C→D) renders correctly with both paths visible
- [ ] A deep fan-in (jobs A, B, C, D, E all needed by job F) renders all five edges into F
- [ ] A deep fan-out (job A needed by B, C, D, E, F) renders all five edges from A
- [ ] If a workflow definition is updated between dispatches, new runs use the new graph structure
- [ ] Re-running a workflow preserves the original graph structure from the original definition config
- [ ] Cancelling a run immediately marks all blocked (not-yet-started) downstream jobs as cancelled

## Design

### Web UI Design

#### Workflow Run Detail Page — Graph Panel

The dependency graph occupies the **top section** of the workflow run detail page, above the step/job list. It is rendered as an interactive directed graph with the following visual properties:

**Layout:**
- Top-down (TD) directed graph layout
- Independent jobs (no dependencies) are arranged in parallel columns at the same vertical level
- Jobs with dependencies are placed below their upstream dependencies
- The graph auto-sizes based on the number of jobs but never exceeds 600px in height; a scroll container activates for larger graphs
- Minimum graph height: 120px (for single-node workflows)

**Node Rendering:**
- Each node is a rounded rectangle displaying the job name
- Node background color reflects the current status:
  - `success`: green (`#22c55e`)
  - `failure`: red (`#ef4444`)
  - `running`: blue (`#3b82f6`) with a subtle pulse animation
  - `queued`: dark gray (`#6b7280`)
  - `blocked`: amber (`#f59e0b`) with a lock icon
  - `cancelled`: gray (`#9ca3af`)
  - `skipped`: light gray (`#d1d5db`) with strikethrough text
  - `timeout`: orange (`#f97316`)
- Node text is white for dark backgrounds, dark for light backgrounds
- Each node shows a small duration badge in the bottom-right when completed (e.g., "2m 30s")
- A status icon appears in the top-left of each node (checkmark, X, spinner, clock, lock, skip)

**Edge Rendering:**
- Directed edges flow from dependency to dependent (upstream → downstream)
- Edge color matches the upstream node's status color
- Edge labels show the upstream node's status and duration when completed (e.g., "success · 2s")
- Edges for `if`-conditioned jobs display the condition in a small tooltip on hover
- Animated dashed edges indicate the downstream job is still blocked/waiting

**Interactions:**
- **Click node**: Navigates to the step/job detail view with full logs
- **Hover node**: Shows a tooltip with job name, status, start time, duration, runner, and `if` condition (if present)
- **Hover edge**: Shows the upstream job's status and the downstream job's dependency condition
- **Zoom**: Mouse wheel zooms in/out; pinch-to-zoom on touch devices
- **Pan**: Click-and-drag on the graph background to pan
- **Fit**: A "Fit" button resets the viewport to show all nodes
- **Fullscreen**: A "Fullscreen" button expands the graph to fill the viewport

**Real-time Updates:**
- When a job status changes (via SSE), the corresponding node's color, icon, and duration update immediately
- Edges animate when a blocked job transitions to running
- New log lines do not affect the graph; only status transitions trigger re-renders

#### Workflow Definition View — Static Graph

The workflow definition detail page displays a **static** dependency graph showing the declared job relationships without execution status. This graph uses the same layout engine but renders all nodes in a neutral color (slate) with no status indicators. `if` conditions are shown as labels on edges. This helps users understand the workflow structure before dispatching.

### API Shape

#### GET `/api/repos/:owner/:repo/workflows/runs/:id`

The existing run detail endpoint returns graph data in the response body:

```json
{
  "run": { },
  "workflow": { "id": 1, "name": "CI", "path": ".codeplane/workflows/ci.ts" },
  "nodes": [
    {
      "id": "step-uuid",
      "step_id": 42,
      "name": "build",
      "position": 1,
      "status": "success",
      "iteration": 1,
      "started_at": "2026-03-22T10:00:00Z",
      "completed_at": "2026-03-22T10:02:30Z",
      "duration": "2m 30s",
      "duration_seconds": 150,
      "needs": [],
      "if": null
    },
    {
      "id": "step-uuid-2",
      "step_id": 43,
      "name": "test",
      "position": 2,
      "status": "running",
      "iteration": 1,
      "started_at": "2026-03-22T10:02:31Z",
      "completed_at": null,
      "duration": "1m 12s",
      "duration_seconds": 72,
      "needs": ["build"],
      "if": "success()"
    }
  ],
  "edges": [
    {
      "from": "build",
      "to": "test",
      "condition": "success()",
      "from_status": "success",
      "from_duration": "2m 30s"
    }
  ],
  "mermaid": "graph TD\n    N1[\"build\"]\n    N2[\"test\"]\n    N1 -->|success 2m 30s| N2\n    style N1 fill:#22c55e\n    style N2 fill:#3b82f6\n",
  "plan_xml": "<?xml version=\"1.0\"?>..."
}
```

**New fields on each node:**
- `needs: string[]` — the job names this node depends on (empty array if none)
- `if: string | null` — the conditional execution expression (null if unconditional)

**New top-level field:**
- `edges: Edge[]` — explicit edge list for client-side graph rendering
  - `from: string` — source job name
  - `to: string` — target job name
  - `condition: string | null` — the `if` expression on the target job
  - `from_status: string` — current status of the source job
  - `from_duration: string` — duration label of the source job (empty if not completed)

**Mermaid generation changes:**
- Edges are generated from the `needs` declarations, not from sequential position
- Jobs with no dependencies are rendered as root nodes
- Parallel jobs at the same dependency depth are on the same row

#### GET `/api/repos/:owner/:repo/workflows/:id`

The definition detail endpoint returns a `graph` field:

```json
{
  "id": 1,
  "name": "CI",
  "path": ".codeplane/workflows/ci.ts",
  "config": { },
  "graph": {
    "jobs": [
      { "name": "build", "needs": [], "if": null, "runs_on": "default" },
      { "name": "test", "needs": ["build"], "if": "success()", "runs_on": "default" },
      { "name": "deploy", "needs": ["test"], "if": "needs.test.result == \"success\"", "runs_on": "default" }
    ],
    "edges": [
      { "from": "build", "to": "test", "condition": "success()" },
      { "from": "test", "to": "deploy", "condition": "needs.test.result == \"success\"" }
    ],
    "mermaid": "graph TD\n    ..."
  }
}
```

#### POST `/api/repos/:owner/:repo/workflows/:id/dispatches`

When dispatching, if the DAG is invalid, the endpoint returns:

```json
{ "message": "invalid workflow DAG: dependency cycle detected involving job \"deploy\"", "code": "INVALID_DAG" }
```

HTTP status: `400 Bad Request`

#### GET `/api/repos/:owner/:repo/workflows/runs/:id/graph`

A dedicated lightweight endpoint returning only graph data (nodes, edges, mermaid) for a run. Useful for polling/refreshing the graph without fetching the full run detail.

### SDK Shape

The `WorkflowService` in `@codeplane/sdk` exposes:

- `validateDAG(jobs: JobConfig[]): string | null` — returns null on valid graph, error message on invalid
- `parseJobsFromConfig(config: unknown): JobConfig[]` — extracts job list with `needs` and `if` fields
- `buildDependencyEdges(jobs: JobConfig[]): Edge[]` — computes the edge list from job declarations
- `evaluateIfExpression(expr, event, needsResults)` — evaluates conditional execution at runtime
- `topologicalSort(jobs: JobConfig[]): JobConfig[]` — returns jobs in a valid execution order respecting dependencies

The `WorkflowRunNode` type in `@codeplane/ui-core` is extended with:
- `needs: string[]`
- `if_condition: string | null`

### CLI Commands

#### `codeplane run view <id> --repo OWNER/REPO`

Human-readable output includes a dependency graph section:

```
Workflow Run #42 — CI
Status: running
Trigger: push (main, abc1234)

Dependency Graph:
  ┌─────────┐
  │  build   │ ✓ success (2m 30s)
  └────┬─────┘
       │
  ┌────▼─────┐
  │   test   │ ● running (1m 12s)
  └────┬─────┘
       │ if: success()
  ┌────▼─────┐
  │  deploy  │ ◌ blocked
  └──────────┘
```

For parallel workflows:

```
Dependency Graph:
  ┌──────────┐     ┌──────────┐
  │   lint   │     │  build   │
  └────┬─────┘     └────┬─────┘
       │                │
       └──────┬─────────┘
              │
         ┌────▼─────┐
         │   test   │
         └────┬─────┘
              │
         ┌────▼─────┐
         │  deploy  │
         └──────────┘
```

JSON output (`--json`) includes the full `nodes`, `edges`, and `mermaid` fields from the API response.

#### `codeplane run graph <id> --repo OWNER/REPO`

A dedicated subcommand that outputs only the dependency graph:

- `--format text` (default): ASCII art graph
- `--format mermaid`: Raw Mermaid markdown
- `--format json`: Structured nodes and edges
- `--format dot`: Graphviz DOT format

#### `codeplane workflow view <id> --repo OWNER/REPO`

Includes the static dependency graph from the definition.

### TUI UI

The TUI workflow run detail screen includes a **graph panel** at the top:

- Rendered as an ASCII box-drawing DAG using Unicode characters (┌ ─ ┐ │ ▼ └ ┘ ┬ ┴)
- Nodes are box-drawn rectangles with job name and status icon
- Status icons: `✓` (success), `✗` (failure), `●` (running, blinking), `◌` (queued/blocked), `⊘` (cancelled), `⊖` (skipped)
- Edges use `│` for vertical, `─` for horizontal, and `┬`/`└` for splits/merges
- The graph panel is collapsible (toggle with `g` key)
- Real-time SSE updates animate status icon changes
- The graph panel height scales with job count, capped at 40% of terminal height
- For workflows exceeding the visible area, scroll within the graph panel with `↑`/`↓` when focused

### Editor Integrations

#### VS Code

- The workflow run detail webview includes the interactive dependency graph (same as web UI, rendered in the webview)
- The status bar shows the overall run status with a click-through to the graph view
- A "Show Dependency Graph" command is available in the command palette when viewing a workflow run

#### Neovim

- `:Codeplane workflow graph <run-id>` opens a floating window with the ASCII graph (same format as CLI text output)
- The graph refreshes on `<leader>r` or when the run status changes

### Documentation

1. **Workflow Authoring Guide — Job Dependencies**: Explain the `needs` field, how to express serial, parallel, fan-in, and fan-out patterns. Include examples of diamond dependencies and conditional execution with `if` expressions.
2. **Workflow Run Visualization**: Document the interactive dependency graph on the web UI, how to navigate it, what each color and icon means, and how real-time updates work.
3. **CLI Workflow Graph Reference**: Document the `run graph` subcommand with all format options and example outputs.
4. **Conditional Execution Reference**: Document `always()`, `success()`, `failure()`, `cancelled()`, `needs.JOB.result`, `inputs.FIELD`, `contains()`, `trigger.type`, and conjunction (`&&`).
5. **Troubleshooting — DAG Validation Errors**: Document each validation error message, what causes it, and how to fix it.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member (Write) | Member (Read) | Anonymous (public repo) | Anonymous (private repo) |
|--------|-------|-------|-----------------|---------------|-------------------------|-------------------------|
| View dependency graph (run detail) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| View dependency graph (definition) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Fetch graph-only endpoint | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Dispatch workflow (triggers DAG validation) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel/resume/rerun (modifies graph state) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

### Rate Limiting

- **Authenticated users**: 300 requests/minute for graph endpoints (consistent with existing API rate limits)
- **Anonymous users** (public repos): 60 requests/minute
- **SSE streams**: Not rate-limited per-request, but limited to 5 concurrent SSE connections per user per repository
- **Dispatch endpoint**: 30 dispatches/minute per user per repository (to prevent graph-validation DoS via malicious configs)

### Data Privacy

- The dependency graph does not expose PII. Job names, statuses, durations, and conditions are operational metadata.
- If job names contain sensitive information (e.g., customer names in job labels), this is a user-authored concern; Codeplane does not sanitize job names beyond the character validation rules.
- Agent tokens embedded in task payloads are **never** exposed in the graph API response. The `payload` field of tasks is internal-only.
- Workflow configs containing secrets references (e.g., `${{ secrets.DEPLOY_KEY }}`) are rendered as the reference string, never as resolved values.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowDAGValidated` | DAG validation runs during dispatch | `repo_id`, `workflow_definition_id`, `job_count`, `edge_count`, `max_depth`, `has_parallel_jobs`, `has_conditions`, `validation_result` (valid/invalid), `error_type` (self_dependency/unknown_job/cycle/null) |
| `WorkflowGraphViewed` | User views the dependency graph on any surface | `repo_id`, `run_id`, `surface` (web/cli/tui/vscode/nvim), `format` (interactive/ascii/mermaid/json/dot), `job_count`, `run_status` |
| `WorkflowGraphNodeClicked` | User clicks a node in the interactive graph | `repo_id`, `run_id`, `job_name`, `job_status`, `surface` |
| `WorkflowGraphExported` | User exports graph via CLI format option | `repo_id`, `run_id`, `format` (mermaid/json/dot) |
| `WorkflowConditionalJobSkipped` | A job is skipped due to `if` expression evaluation | `repo_id`, `run_id`, `job_name`, `if_expression`, `dependency_results` |
| `WorkflowJobUnblocked` | A blocked job transitions to pending after dependencies complete | `repo_id`, `run_id`, `job_name`, `dependency_count`, `wait_duration_seconds` |

### Funnel Metrics & Success Indicators

1. **Graph Adoption Rate**: % of workflow run detail views where the graph panel is visible (not collapsed/hidden)
2. **Graph Interaction Depth**: Average number of node clicks per graph view session
3. **DAG Complexity Distribution**: Histogram of edge counts across dispatched workflows — indicates whether users are actually expressing complex dependency relationships
4. **Conditional Execution Usage**: % of workflows using `if` expressions on jobs
5. **Parallel Job Utilization**: % of workflows with at least two jobs that have no dependency relationship (true parallelism)
6. **CLI Graph Command Usage**: Invocations of `run graph` per week, broken down by format
7. **DAG Validation Error Rate**: % of dispatch attempts that fail DAG validation — should trend downward as users learn the system

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| DAG validation started | `debug` | `repo_id`, `workflow_definition_id`, `job_count` |
| DAG validation succeeded | `info` | `repo_id`, `workflow_definition_id`, `job_count`, `edge_count`, `max_depth`, `validation_duration_ms` |
| DAG validation failed | `warn` | `repo_id`, `workflow_definition_id`, `error`, `job_count` |
| Job blocked on dependencies | `debug` | `repo_id`, `run_id`, `job_name`, `blocked_by: string[]` |
| Job unblocked | `info` | `repo_id`, `run_id`, `job_name`, `wait_duration_ms`, `dependency_results` |
| Job skipped due to condition | `info` | `repo_id`, `run_id`, `job_name`, `if_expression`, `evaluation_result` |
| If-expression evaluation error | `error` | `repo_id`, `run_id`, `job_name`, `if_expression`, `error` |
| Graph endpoint served | `debug` | `repo_id`, `run_id`, `node_count`, `edge_count`, `response_time_ms` |
| Mermaid generation completed | `debug` | `repo_id`, `run_id`, `output_size_bytes`, `generation_time_ms` |

### Prometheus Metrics

**Counters:**
- `codeplane_workflow_dag_validations_total{result="valid|invalid",error_type="self_dependency|unknown_job|cycle|none"}` — total DAG validations
- `codeplane_workflow_job_unblocked_total{repo_id}` — total job unblock events
- `codeplane_workflow_job_skipped_total{repo_id,reason="condition|cancelled_dependency"}` — total skipped jobs
- `codeplane_workflow_graph_requests_total{surface="api|web|cli|tui",format="json|mermaid|dot|text"}` — graph endpoint requests

**Histograms:**
- `codeplane_workflow_dag_validation_duration_seconds{bucket}` — DAG validation latency
- `codeplane_workflow_graph_render_duration_seconds{bucket,format}` — graph rendering latency (Mermaid/XML/JSON generation)
- `codeplane_workflow_job_wait_duration_seconds{bucket}` — time a job spends in `blocked` state before unblocking
- `codeplane_workflow_dag_depth{bucket}` — distribution of DAG depths (longest chain)

**Gauges:**
- `codeplane_workflow_dag_job_count{repo_id,workflow_definition_id}` — number of jobs in the most recent dispatch
- `codeplane_workflow_blocked_jobs_current{repo_id}` — currently blocked jobs across all active runs

### Alerts & Runbooks

#### Alert: `WorkflowDAGValidationHighErrorRate`
- **Condition**: `rate(codeplane_workflow_dag_validations_total{result="invalid"}[5m]) / rate(codeplane_workflow_dag_validations_total[5m]) > 0.3`
- **Severity**: Warning
- **Runbook**:
  1. Check recent DAG validation errors in logs: `grep "DAG validation failed" | sort by repo_id`
  2. Identify if a single repository/user is producing most errors (indicates a user-side config problem) vs. widespread errors (indicates a platform bug)
  3. If concentrated: check the user's workflow definition for typos in `needs` references or accidental cycles
  4. If widespread: verify that `parseJobsFromConfig()` is correctly parsing the `needs` field from workflow configs — a parser regression could produce phantom validation failures
  5. Check recent deployments for changes to `validateDAG()` or `parseJobsFromConfig()`

#### Alert: `WorkflowJobBlockedTooLong`
- **Condition**: `codeplane_workflow_job_wait_duration_seconds{quantile="0.99"} > 3600` (99th percentile blocked duration exceeds 1 hour)
- **Severity**: Warning
- **Runbook**:
  1. Identify the blocked jobs: query `workflow_tasks` where `status = 'blocked'` and `created_at < now() - interval '1 hour'`
  2. Check if the upstream dependencies are stuck: query their task status
  3. If upstream tasks are `assigned` or `running` for too long, the runner may be unhealthy — check runner heartbeats
  4. If upstream tasks are `pending` and never picked up, check the task queue for runner availability
  5. If the blocked job is waiting on approval (`needsApproval: true`), this is expected — verify with the repository owner
  6. Consider surfacing a "stale blocked job" notification to the repository owner

#### Alert: `WorkflowGraphRenderLatencyHigh`
- **Condition**: `histogram_quantile(0.95, codeplane_workflow_graph_render_duration_seconds) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check if recent workflows have unusually high job counts (approaching the 256 limit)
  2. Profile `buildWorkflowRunMermaid()` and `buildDependencyEdges()` for N² behavior on large graphs
  3. Check memory usage on the server — large graph generation may cause GC pressure
  4. If persistent, consider caching rendered graphs and invalidating only on status changes

#### Alert: `WorkflowIfExpressionErrors`
- **Condition**: `increase(log_entries{message=~".*If-expression evaluation error.*"}[15m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check the error logs for the specific expression that failed parsing
  2. Verify the expression matches supported syntax: `always()`, `success()`, `failure()`, `cancelled()`, `needs.JOB.result`, `inputs.FIELD`, `contains()`, `trigger.type`
  3. If a new expression pattern is commonly attempted, consider adding support for it
  4. If the errors come from a single user/repo, reach out with documentation on supported expressions

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Code | User-Facing Message |
|------------|-------------|------------|---------------------|
| Self-dependency in DAG | 400 | `INVALID_DAG` | `invalid workflow DAG: job "X" has a self-dependency` |
| Unknown job in `needs` | 400 | `INVALID_DAG` | `invalid workflow DAG: job "X" depends on unknown job "Y"` |
| Circular dependency | 400 | `INVALID_DAG` | `invalid workflow DAG: dependency cycle detected involving job "X"` |
| Unsupported `if` expression | 400 | `INVALID_EXPRESSION` | `invalid if expression for job X: unsupported if expression: ...` |
| Graph endpoint for non-existent run | 404 | `NOT_FOUND` | `workflow run not found` |
| Graph endpoint for wrong repository | 404 | `NOT_FOUND` | `workflow run not found` |
| Workflow with > 256 jobs | 400 | `INVALID_WORKFLOW` | `workflow exceeds maximum job count of 256` |
| Job name exceeds 128 characters | 400 | `INVALID_WORKFLOW` | `job name exceeds maximum length of 128 characters` |
| Duplicate job name in `needs` | 400 | `INVALID_DAG` | `job "X" has duplicate dependency "Y"` |
| More than 64 dependencies on a single job | 400 | `INVALID_DAG` | `job "X" exceeds maximum dependency count of 64` |

## Verification

### API Integration Tests

#### DAG Validation

1. **Valid linear chain**: Dispatch a workflow with jobs A→B→C (A needs nothing, B needs A, C needs B). Assert run is created with 3 steps, step B task is `blocked`, step C task is `blocked`.
2. **Valid parallel fan-out**: Dispatch a workflow with jobs A, B, C (none have `needs`). Assert all 3 tasks are `pending` (not blocked).
3. **Valid diamond**: Dispatch with A→B, A→C, B→D, C→D. Assert D is blocked, A is pending.
4. **Valid fan-in (5 deps)**: Job F needs A, B, C, D, E. Assert F is blocked, all others are pending.
5. **Self-dependency rejected**: Dispatch with job A needs ["A"]. Assert 400 with `INVALID_DAG` and message containing "self-dependency".
6. **Unknown dependency rejected**: Dispatch with job B needs ["nonexistent"]. Assert 400 with `INVALID_DAG` and message containing "unknown job".
7. **Cycle detection (2-node)**: A needs B, B needs A. Assert 400 with "cycle detected".
8. **Cycle detection (3-node)**: A needs C, B needs A, C needs B. Assert 400 with "cycle detected".
9. **Cycle detection (self-referencing in chain)**: A→B→C→A. Assert 400 with "cycle detected".
10. **Empty workflow**: Dispatch a workflow with zero jobs. Assert run is created with zero steps (no error).
11. **Single job, no deps**: Dispatch a workflow with one job, no `needs`. Assert run is created with 1 step, task is `pending`.
12. **Maximum valid job count (256)**: Dispatch a workflow with exactly 256 jobs in a linear chain. Assert run is created successfully with 256 steps.
13. **Exceeds maximum job count (257)**: Dispatch a workflow with 257 jobs. Assert 400 with `INVALID_WORKFLOW`.
14. **Maximum job name length (128 chars)**: Dispatch with a job name of exactly 128 characters. Assert success.
15. **Exceeds max job name length (129 chars)**: Dispatch with a job name of 129 characters. Assert 400 with `INVALID_WORKFLOW`.
16. **Maximum dependencies per job (64)**: Job Z needs 64 other jobs. Assert success.
17. **Exceeds max deps per job (65)**: Job Z needs 65 other jobs. Assert 400 with `INVALID_DAG`.
18. **Duplicate dependency entry**: Job B needs ["A", "A"]. Assert 400 with "duplicate dependency".
19. **Case sensitivity**: Job "Build" needs ["build"] where only "Build" exists (no "build"). Assert 400 with "unknown job".

#### Graph API Response

20. **Run detail includes graph fields**: Fetch run detail. Assert response contains `nodes`, `edges`, and `mermaid` fields.
21. **Nodes include needs and if fields**: Each node in the response has `needs: string[]` and `if: string | null`.
22. **Edges match needs declarations**: For a workflow A→B→C, assert `edges` contains `{from: "A", to: "B"}` and `{from: "B", to: "C"}`.
23. **Edge condition reflects if expression**: Job B has `if: "success()"`. Assert the edge to B has `condition: "success()"`.
24. **Mermaid output reflects dependency edges, not sequential position**: For parallel jobs A and B both needed by C, assert Mermaid contains edges A→C and B→C, not A→B.
25. **Graph-only endpoint returns subset**: `GET /runs/:id/graph` returns the same `nodes`, `edges`, `mermaid` as the full detail but no `run` or `workflow` fields.
26. **Definition view includes graph field**: `GET /workflows/:id` response contains a `graph` field with `jobs`, `edges`, and `mermaid`.

#### If-Expression Evaluation

27. **success() with all deps succeeded**: All deps of job C succeeded. Assert C transitions from blocked to pending.
28. **success() with one dep failed**: One dep of job C failed. Assert C is skipped.
29. **failure() with one dep failed**: Assert job with `if: "failure()"` runs when a dependency fails.
30. **failure() with all deps succeeded**: Assert job with `if: "failure()"` is skipped.
31. **always()**: Assert job with `if: "always()"` runs regardless of dependency outcomes (success, failure, cancelled).
32. **cancelled()**: Assert job with `if: "cancelled()"` runs when a dependency is cancelled.
33. **needs.JOB.result == "success"**: Assert specific dependency result check works.
34. **needs.JOB.result != "success"**: Assert negation works.
35. **Conjunction**: `success() && needs.build.result == "success"` evaluates correctly.
36. **Empty if expression**: Defaults to true (job runs).
37. **Unsupported expression**: Returns 400 with clear error message.

#### Status Propagation

38. **Blocked job unblocks on dependency success**: Complete dependency A. Assert dependent B transitions from `blocked` to `pending`.
39. **Blocked job skipped on dependency failure (no failure() handler)**: Fail dependency A. Assert dependent B (with no `if` or with `if: "success()"`) is `skipped`.
40. **Multiple dependencies — all must complete before unblock**: Job C needs A and B. Complete A. Assert C remains blocked. Complete B. Assert C unblocks.
41. **Cancel propagates to blocked downstream**: Cancel a run with blocked downstream jobs. Assert all blocked jobs become `cancelled`.
42. **Rerun preserves original graph structure**: Rerun a completed run. Assert the new run has the same graph structure (nodes and edges).

### Playwright (Web UI) E2E Tests

43. **Graph panel renders on run detail page**: Navigate to a workflow run detail page. Assert the graph panel is visible with SVG/canvas content.
44. **Node colors match job status**: For a run with success, running, and blocked jobs, assert the corresponding node elements have the correct background colors.
45. **Click node navigates to step detail**: Click a node in the graph. Assert navigation to the step detail view.
46. **Hover node shows tooltip**: Hover over a node. Assert a tooltip appears with job name, status, and duration.
47. **Parallel jobs render side-by-side**: For a workflow with two independent jobs, assert both nodes are at the same vertical position (same Y coordinate within tolerance).
48. **Diamond dependency renders correctly**: For A→B, A→C, B→D, C→D, assert 4 nodes and 4 edges are visible.
49. **Graph updates in real-time**: Start a workflow run. Assert a node transitions from `queued` to `running` (color change) without page refresh.
50. **Collapse/expand graph panel**: Click the collapse button. Assert the graph panel is hidden. Click again. Assert it reappears.
51. **Fullscreen toggle**: Click the fullscreen button. Assert the graph expands to fill the viewport.
52. **Fit button resets zoom**: Zoom into the graph. Click "Fit". Assert all nodes are visible within the viewport.
53. **Definition page shows static graph**: Navigate to a workflow definition page. Assert a graph is rendered with all nodes in neutral color.
54. **Edge labels show condition**: For a job with `if: "success()"`, assert the edge label or tooltip includes "success()".

### CLI E2E Tests

55. **`run view` includes dependency graph**: Run `codeplane run view <id> --repo OWNER/REPO`. Assert output contains "Dependency Graph:" section with box-drawing characters.
56. **`run view --json` includes nodes and edges**: Run with `--json`. Assert JSON output contains `nodes` array with `needs` fields and `edges` array.
57. **`run graph` text format**: Run `codeplane run graph <id> --repo OWNER/REPO --format text`. Assert ASCII art graph output with correct job names and status icons.
58. **`run graph` mermaid format**: Run with `--format mermaid`. Assert output starts with `graph TD`.
59. **`run graph` json format**: Run with `--format json`. Assert valid JSON with `nodes` and `edges`.
60. **`run graph` dot format**: Run with `--format dot`. Assert output starts with `digraph` and contains node/edge declarations.
61. **`workflow view` shows static graph**: Run `codeplane workflow view <id>`. Assert output includes dependency graph section.
62. **DAG validation error in dispatch**: Run `codeplane workflow dispatch <id>` against a workflow with a cycle. Assert error message includes "dependency cycle detected".
63. **Graph with 50 jobs renders without timeout**: Dispatch and view a workflow with 50 jobs. Assert CLI completes within 10 seconds.

### TUI E2E Tests

64. **Graph panel appears on run detail screen**: Open TUI workflow run detail. Assert graph panel is rendered at the top with box-drawing characters.
65. **Graph panel toggle with `g` key**: Press `g`. Assert graph panel collapses. Press `g` again. Assert it expands.
66. **Status icons update in real-time**: While viewing a running workflow, assert status icons change as jobs complete.
67. **Scrollable graph for large workflows**: Open a run with 20+ jobs. Assert the graph panel is scrollable.

### Performance and Boundary Tests

68. **256-job linear chain renders within 5 seconds** (API response time): Dispatch a 256-job workflow. Fetch the run detail. Assert response time < 5000ms.
69. **256-job fully parallel graph renders within 5 seconds**: Same test with 256 independent jobs.
70. **Mermaid output size is bounded**: For a 256-job workflow, assert the mermaid string is less than 100KB.
71. **Graph endpoint handles concurrent requests**: Send 50 concurrent requests to the graph endpoint for the same run. Assert all return 200 with consistent data.
72. **SSE status updates arrive within 2 seconds of job state change**: Complete a job. Assert the SSE event with the new status arrives within 2 seconds.

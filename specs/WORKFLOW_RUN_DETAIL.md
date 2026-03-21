# WORKFLOW_RUN_DETAIL

Specification for WORKFLOW_RUN_DETAIL.

## High-Level User POV

When a workflow run completes — or while it is still in progress — developers need a single surface where they can deeply inspect every aspect of that run: what triggered it, which steps executed, how long each step took, what status each step reached, and what logs each step produced. The Workflow Run Detail feature is that surface.

From the web UI, a developer clicks on any run from the workflow run list and lands on a dedicated run detail page. At the top, a header immediately communicates the most important context: the run's overall status (success, failure, running, queued, or cancelled), the workflow name and file path, the trigger event that initiated it (push, manual dispatch, schedule, landing request, or another workflow), the commit SHA and bookmark or reference involved, and how long the run has taken or is taking. If the run was manually dispatched, the dispatch inputs provided by the user are shown.

Below the header, a visual step graph rendered as a Mermaid diagram shows the execution flow, with each step color-coded by its status — green for success, red for failure, blue for running, gray for queued or cancelled. This gives the developer an immediate sense of where the run succeeded and where it broke down.

The step list below the graph shows each step as an expandable card with its name, position, status, start time, and duration. Clicking a step expands it to show the step's logs inline — stdout and stderr interleaved in order, with stream indicators so the developer can distinguish between normal output and error output. For in-progress runs, logs stream in real time, automatically scrolling to follow new output. The developer can toggle auto-follow off to scroll back through earlier output, and toggle it back on to jump to the latest line.

From this detail view, the developer can also take action: cancel a running or queued run, rerun a completed run to trigger a fresh execution with the same inputs, or resume a cancelled or failed run to retry from where it left off. These actions are available as buttons in the web UI, keybindings in the TUI, and subcommands in the CLI.

The CLI provides `run view` for the structured run detail, `run logs` for streaming log output, and `run watch` for a combined view that displays status information while streaming logs until completion. The TUI provides a rich interactive detail screen with keyboard-driven step navigation, expandable log panels, and real-time SSE updates.

This feature is the primary debugging and observability tool for individual workflow executions. It answers "why did this run fail?", "which step is currently running?", "how long did each step take?", and "what did each step output?" — all without leaving Codeplane.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/workflows/runs/:id` returns a comprehensive run detail response including the run object, parent workflow metadata, step nodes with durations, a Mermaid graph, and an XML plan document
- [ ] The API endpoint `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` returns node-level detail with filtered logs for a specific step
- [ ] The API endpoint `GET /api/repos/:owner/:repo/actions/runs/:id/steps` returns all steps for a run in position order
- [ ] The SSE endpoint `GET /api/repos/:owner/:repo/runs/:id/logs` streams real-time log events, status changes, and completion notifications
- [ ] The SSE endpoint `GET /api/repos/:owner/:repo/workflows/runs/:id/events` streams real-time run status changes without log lines
- [ ] The CLI command `codeplane run view <id>` displays the full run detail in formatted or JSON output
- [ ] The CLI command `codeplane run logs <id>` streams logs to stderr with log content to stdout
- [ ] The CLI command `codeplane run watch <id>` displays run status and streams events until completion
- [ ] The TUI Workflow Run Detail screen renders a header, step list, expandable log panels, and action keybindings
- [ ] The web UI run detail page renders at route `/:owner/:repo/workflows/runs/:id` with header, Mermaid graph, step list, and log viewer
- [ ] All surfaces show consistent data sourced from the same API endpoints

### Run Detail Response Shape

- [ ] `run` object includes: `id`, `repository_id`, `workflow_definition_id`, `status`, `trigger_event`, `trigger_ref`, `trigger_commit_sha`, `started_at`, `completed_at`, `created_at`, `updated_at`
- [ ] `workflow` object includes: `id`, `name`, `path`
- [ ] `nodes` array includes for each step: `id`, `step_id`, `name`, `position`, `status`, `iteration`, `started_at`, `completed_at`, `duration` (human-readable label), `duration_seconds` (numeric)
- [ ] `mermaid` string contains a valid Mermaid `graph TD` diagram with color-coded nodes
- [ ] `plan_xml` string contains a valid XML document with `<workflow>` root and `<node>` children
- [ ] Run `status` is one of: `success`, `failure`, `running`, `queued`, `cancelled`, `timeout`
- [ ] Step/node `status` is one of: `success`, `failure`, `running`, `queued`, `cancelled`, `pending`, `skipped`
- [ ] `trigger_event` is one of: `push`, `landing_request`, `manual`, `schedule`, `webhook`, `workflow_run`
- [ ] All timestamps are ISO 8601 strings or `null`

### Node Detail Response Shape

- [ ] `run_id` is the parent workflow run ID
- [ ] `node` is a single `WorkflowRunNodeResponse` matching the requested step
- [ ] `logs` is an array of log entries filtered to this step only, each with: `id`, `sequence`, `stream` (stdout/stderr), `entry`, `created_at`
- [ ] `output` is `null` (reserved for future use)
- [ ] `plan_xml` and `mermaid` include the full run graph context

### SSE Log Stream Behavior

- [ ] The log stream sends an initial `status` event with the current run and step states
- [ ] `Last-Event-ID` header replays missed log entries since that ID (up to 1000 entries)
- [ ] Live `log` events include: `log_id`, `step` (step ID), `line` (sequence number), `content` (log text), `stream` (stdout/stderr)
- [ ] Live `status` events fire when run or step status changes
- [ ] A `done` event fires when the run reaches a terminal state, then the stream closes
- [ ] For already-terminal runs, the stream sends `status` + `done` events immediately and closes
- [ ] The stream subscribes to `workflow_run_events_{runId}` and `workflow_step_logs_{stepId}` channels for each step

### SSE Event Stream Behavior

- [ ] The event stream sends an initial `status` event with current run and step states
- [ ] Only `status` and `done` event types are emitted (no log lines)
- [ ] Subscribes to `workflow_run_events_{runId}` channel only
- [ ] For already-terminal runs, the stream sends `status` + `done` events immediately and closes

### Duration Calculation

- [ ] Duration is computed as `(completed_at ?? now) - started_at` in seconds
- [ ] Duration label format: `Xs` for < 60 seconds, `Xm Ys` for >= 60 seconds
- [ ] If `started_at` is null, duration is 0 with empty label
- [ ] If `completed_at` < `started_at`, duration is 0 with empty label
- [ ] Running steps use current time for duration calculation

### Mermaid Graph Generation

- [ ] Nodes are labeled `N1`, `N2`, ... in position order
- [ ] Node labels are step names, with pipe characters replaced by `/` and double quotes replaced by `'`
- [ ] Edges between sequential nodes show status and duration as edge labels
- [ ] Node fill colors: success=#22c55e (green), failure=#ef4444 (red), cancelled=#9ca3af (gray), running=#3b82f6 (blue), queued=#6b7280 (dark gray)
- [ ] A run with zero steps produces `graph TD\n` (valid but empty)

### Action Operations (from detail view)

- [ ] Cancel: `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel` returns 204 for running/queued runs
- [ ] Rerun: `POST /api/repos/:owner/:repo/workflows/runs/:id/rerun` returns 201 with new run result
- [ ] Resume: `POST /api/repos/:owner/:repo/workflows/runs/:id/resume` returns 204 for cancelled/failed runs
- [ ] Cancel is disabled/hidden for terminal-state runs
- [ ] Rerun is enabled only for terminal-state runs
- [ ] Resume is enabled only for cancelled or failed runs

### Boundary Constraints

- [ ] Run ID must be a positive integer; non-numeric, zero, negative, or float IDs return 400 with `{ "message": "invalid run id" }`
- [ ] Node ID can be a numeric step ID or a step name string; empty node ID returns 400
- [ ] Step names may contain any Unicode characters; max 255 characters
- [ ] Log entries may contain ANSI escape codes; max 64KB per entry
- [ ] Log sequences are monotonically increasing positive integers
- [ ] A single run may have up to 200 steps
- [ ] A single step may produce up to 1,000,000 log entries
- [ ] Node detail fetches up to 10,000 log entries per step (hard cap in current implementation)
- [ ] Last-Event-ID replay fetches up to 1,000 log entries
- [ ] Mermaid graph generation handles up to 200 nodes without performance degradation
- [ ] XML plan document stays under 10MB for runs with 200 steps
- [ ] Commit SHA in `trigger_commit_sha` is a full 40-character hex string or empty
- [ ] `trigger_ref` may be empty but is never null in the response

### Edge Cases

- [ ] Run not found returns 404 with `{ "message": "workflow run not found" }`
- [ ] Run exists but parent workflow definition was deleted returns 404 with `{ "message": "workflow definition not found" }`
- [ ] Run with zero steps returns empty `nodes` array, minimal Mermaid graph (`graph TD\n`), and XML with no `<node>` children
- [ ] Node ID that doesn't match any step returns 404 with `{ "message": "workflow node not found" }`
- [ ] Step with zero logs returns empty `logs` array in node detail
- [ ] Queued run with null `started_at` shows 0 duration and empty duration label
- [ ] Run belonging to a different repository returns 404 (cross-repo isolation)
- [ ] Concurrent step status changes during detail fetch are acceptable (eventual consistency)
- [ ] SSE connection dropped mid-stream can be resumed via `Last-Event-ID`
- [ ] SSE stream for a run that completes during streaming sends `done` event and closes
- [ ] Multiple concurrent SSE connections to the same run are supported
- [ ] Step names containing Mermaid-special characters (pipes, quotes, newlines) render correctly in the graph
- [ ] Unicode and emoji in step names, log content, and trigger refs render correctly across all surfaces
- [ ] Extremely large log output (1M+ lines) does not crash the node detail endpoint (limited to 10,000)
- [ ] Legacy endpoint `GET /api/repos/:owner/:repo/actions/runs/:id` returns flat run object without nodes/mermaid/plan_xml

## Design

### API Shape

#### Primary Endpoint: Run Detail (v2)

```
GET /api/repos/:owner/:repo/workflows/runs/:id
```

**Response (200 OK):**

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
    },
    {
      "id": "102",
      "step_id": 102,
      "name": "Build",
      "position": 2,
      "status": "success",
      "iteration": 1,
      "started_at": "2026-03-22T10:15:32.000Z",
      "completed_at": "2026-03-22T10:16:02.000Z",
      "duration": "30s",
      "duration_seconds": 30
    },
    {
      "id": "103",
      "step_id": 103,
      "name": "Test",
      "position": 3,
      "status": "success",
      "iteration": 1,
      "started_at": "2026-03-22T10:16:02.000Z",
      "completed_at": "2026-03-22T10:16:35.000Z",
      "duration": "33s",
      "duration_seconds": 33
    }
  ],
  "mermaid": "graph TD\n    N1[\"Checkout\"]\n    N2[\"Build\"]\n    N3[\"Test\"]\n    N1 -->|success 2s| N2\n    N2 -->|success 30s| N3\n    style N1 fill:#22c55e\n    style N2 fill:#22c55e\n    style N3 fill:#22c55e\n",
  "plan_xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<workflow name=\"CI\" path=\".codeplane/workflows/ci.ts\" run_id=\"1047\" status=\"success\">\n  <node id=\"101\" step_id=\"101\" name=\"Checkout\" position=\"1\" status=\"success\" iteration=\"1\" duration=\"2s\"></node>\n  <node id=\"102\" step_id=\"102\" name=\"Build\" position=\"2\" status=\"success\" iteration=\"1\" duration=\"30s\"></node>\n  <node id=\"103\" step_id=\"103\" name=\"Test\" position=\"3\" status=\"success\" iteration=\"1\" duration=\"33s\"></node>\n</workflow>"
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|----------|
| 400 | `{ "message": "invalid run id" }` | Non-numeric, zero, negative, or float ID |
| 401 | `{ "message": "unauthorized" }` | Missing or invalid authentication |
| 403 | `{ "message": "forbidden" }` | Insufficient repository access |
| 404 | `{ "message": "workflow run not found" }` | Run ID does not exist in repository |
| 404 | `{ "message": "workflow definition not found" }` | Parent definition has been deleted |

#### Node Detail Endpoint

```
GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId
```

The `:nodeId` parameter can be a numeric step ID or a step name (case-insensitive match).

**Response (200 OK):**

```json
{
  "run_id": 1047,
  "node": {
    "id": "102",
    "step_id": 102,
    "name": "Build",
    "position": 2,
    "status": "success",
    "iteration": 1,
    "started_at": "2026-03-22T10:15:32.000Z",
    "completed_at": "2026-03-22T10:16:02.000Z",
    "duration": "30s",
    "duration_seconds": 30
  },
  "logs": [
    {
      "id": 5001,
      "sequence": 1,
      "stream": "stdout",
      "entry": "$ bun run build",
      "created_at": "2026-03-22T10:15:33.000Z"
    },
    {
      "id": 5002,
      "sequence": 2,
      "stream": "stdout",
      "entry": "Build completed successfully",
      "created_at": "2026-03-22T10:16:01.000Z"
    }
  ],
  "output": null,
  "plan_xml": "...",
  "mermaid": "..."
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|----------|
| 400 | `{ "message": "invalid run id" }` | Invalid run ID |
| 400 | `{ "message": "invalid node id" }` | Empty node ID |
| 404 | `{ "message": "workflow run not found" }` | Run not found |
| 404 | `{ "message": "workflow definition not found" }` | Definition deleted |
| 404 | `{ "message": "workflow node not found" }` | No step matches the node ID |

#### Step List Endpoint (Legacy)

```
GET /api/repos/:owner/:repo/actions/runs/:id/steps
```

Returns `{ "steps": [...] }` with step objects including `id`, `workflow_run_id`, `name`, `position`, `status`, `started_at`, `completed_at`, `created_at`, `updated_at`.

#### Log Stream SSE Endpoint

```
GET /api/repos/:owner/:repo/runs/:id/logs
```

**Headers:**
- `Accept: text/event-stream`
- `Last-Event-ID: <log_id>` (optional, for replay)

**SSE Event Format:**

```
event: log
id: 5001
data: {"log_id":5001,"step":102,"line":1,"content":"$ bun run build","stream":"stdout"}

event: status
data: {"run":{...},"steps":[...]}

event: done
data: {"run":{...},"steps":[...]}
```

#### Event Stream SSE Endpoint

```
GET /api/repos/:owner/:repo/workflows/runs/:id/events
```

Same format as the log stream but only emits `status` and `done` events (no `log` events).

#### Legacy Run Detail Endpoint

```
GET /api/repos/:owner/:repo/actions/runs/:id
```

Returns the flat `WorkflowRun` object without `workflow`, `nodes`, `mermaid`, or `plan_xml` enrichment.

### SDK Shape

The `@codeplane/ui-core` package provides:

**Hook: `useWorkflowRunDetail(repoContext, runId)`**
- Fetches `GET /api/repos/:owner/:repo/workflows/runs/:id`
- Returns `{ data: WorkflowRunDetailResponse | null, loading: boolean, error: Error | null, refetch: () => void }`
- Caches by run ID with 30-second TTL for terminal runs, 5-second TTL for in-progress runs

**Hook: `useWorkflowRunNodeDetail(repoContext, runId, nodeId)`**
- Fetches `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId`
- Returns `{ data: WorkflowRunNodeDetailResponse | null, loading: boolean, error: Error | null, refetch: () => void }`

**Hook: `useWorkflowRunLogStream(repoContext, runId, options?)`**
- Establishes SSE connection to `GET /api/repos/:owner/:repo/runs/:id/logs`
- Manages `Last-Event-ID` for automatic reconnection replay
- Returns `{ logs: WorkflowLogEntry[], status: RunStatus, isConnected: boolean, error: Error | null }`
- Supports `options.lastEventId` for initial replay
- Implements exponential backoff on disconnect: 1s, 2s, 4s, 8s, capped at 30s

**Hook: `useWorkflowRunEventStream(repoContext, runId)`**
- Establishes SSE connection to `GET /api/repos/:owner/:repo/workflows/runs/:id/events`
- Returns `{ status: RunStatus, steps: StepStatus[], isConnected: boolean, error: Error | null }`

### CLI Command

#### `codeplane run view <id>`

```
codeplane run view <id> [--repo OWNER/REPO] [--json]
```

**Arguments:**
- `id` (required, positive integer): The workflow run ID

**Options:**
- `--repo OWNER/REPO`: Target repository (defaults to current repo context)
- `--json`: Output full API response as JSON

**Formatted output example:**

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

**Status prefixes:** ✓ (success), ✗ (failure), ◎ (running), ◌ (queued), ✕ (cancelled), ⊘ (skipped)

#### `codeplane run logs <id>`

```
codeplane run logs <id> [--repo OWNER/REPO] [--json]
```

Connects to the SSE log stream endpoint. Human-readable log content is written to stderr with step prefixes (`[step N]`). Status changes are written to stderr. With `--json`, collected events are output to stdout when the stream ends.

#### `codeplane run watch <id>`

```
codeplane run watch <id> [--repo OWNER/REPO] [--json]
```

Fetches current run status first. If the run is already terminal, displays the status and exits. Otherwise, streams events until the run completes. Combines status display with real-time log output.

**Error output:**
- Non-existent run: `Error: Workflow run not found`
- Invalid ID: `Error: Invalid run ID — must be a positive integer`
- No repository context: `Error: No repository context. Use --repo OWNER/REPO or run from a repository directory`
- SSE connection failure: `Error: Failed to connect to run stream: <status> <statusText>`
- Exit code 0 on success, 1 on errors

### TUI UI

**Screen name:** `workflow-run-detail`

**Entry points:**
- From the Workflow Run List screen, pressing `Enter` on a focused run opens the detail
- Command palette: `:run-view <id>`
- Deep link: `codeplane tui --screen run-detail --repo owner/repo --run-id 1047`

**Layout (120×40 standard):**

```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workflows > CI > Run #1047          │
├──────────────────────────────────────────────────────────────┤
│ ✓ Success    Run #1047                                       │
│ CI (.codeplane/workflows/ci.ts)                              │
│ push to main @ a3f8c21  │  Started: 10:15:30  │  1m 5s       │
├──────────────────────────────────────────────────────────────┤
│ Steps                                                        │
│ ▸ ✓ 1. Checkout                                    2s        │
│ ▾ ✓ 2. Build                                       30s       │
│   │ $ bun run build                                          │
│   │ Build completed successfully                             │
│ ▸ ✓ 3. Test                                        33s       │
├──────────────────────────────────────────────────────────────┤
│ c:cancel r:rerun R:resume j/k:nav Enter:expand l:logs q:back │
└──────────────────────────────────────────────────────────────┘
```

**Header section:**
- Status badge with icon and color (✓ green, ✗ red, ◎ blue animated, ◌ cyan, ✕ gray)
- Run number (`Run #1047`)
- Workflow name and path
- Trigger: `{event} to {ref} @ {sha:7}`
- Started timestamp, duration (live-updating for running runs), completed timestamp

**Step list:**
- Each step as a row with status icon, position number, name, and duration
- `▸` indicates collapsed, `▾` indicates expanded
- Expanded steps show inline log content with ANSI color passthrough
- Stream indicators: stdout lines are default color, stderr lines are red-tinted
- Line numbers shown to the left of log content

**Auto-follow:** When a step is running and expanded, new log lines scroll into view automatically. Press `f` to toggle auto-follow off/on.

**Keybindings:**

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move to next step | Step list focused |
| `k` / `Up` | Move to previous step | Step list focused |
| `Enter` | Expand/collapse step logs | Step focused |
| `l` | Open full-screen log viewer for focused step | Step focused |
| `c` | Cancel run | Run is running or queued |
| `r` | Rerun | Run is in terminal state |
| `R` | Resume | Run is cancelled or failed |
| `f` | Toggle auto-follow | Step expanded + running |
| `e` | Toggle dispatch inputs section | Run has dispatch inputs |
| `G` | Jump to last step | Always |
| `g g` | Jump to first step | Always |
| `Ctrl+D` / `Ctrl+U` | Page down / page up in logs | Step expanded |
| `Ctrl+R` | Refresh run data | Always |
| `q` / `Esc` | Pop screen | Always |

**Responsive behavior:**
- 80×24: Header as 2 lines (status + trigger), steps show name + status icon only, no inline logs (Enter navigates to log screen)
- 120×40: Full header, steps with durations, inline log panels (5 visible lines per expanded step)
- 200×60+: Full header with all metadata, steps with durations, inline log panels (15 visible lines per expanded step), Mermaid graph as ASCII art above step list

**Real-time behavior:**
- SSE subscription via `useWorkflowRunLogStream` for running runs
- Step statuses update inline as events arrive
- Running step shows animated spinner (◐◓◑◒ at 250ms interval)
- Connection health indicator: `●` green (connected), `○` gray (disconnected), `↻` yellow (reconnecting)
- On disconnect, exponential backoff with automatic reconnection using `Last-Event-ID`

**Confirmation overlays:**
- Cancel: "Cancel run #1047? This will stop all running steps. [Enter] Confirm  [Esc] Cancel"
- Rerun: "Rerun workflow CI with same inputs? A new run will be created. [Enter] Confirm  [Esc] Cancel"
- Resume: "Resume run #1047 from where it stopped? [Enter] Confirm  [Esc] Cancel"

### Web UI Design

**Route:** `/:owner/:repo/workflows/runs/:id`

**Page layout:**

1. **Breadcrumb:** `owner / repo / Workflows / workflow-name / Run #1047`
2. **Header card:**
   - Status badge (color-coded, with animated pulse for running)
   - Run number and workflow name (h1)
   - Workflow file path (monospace, muted)
   - Trigger pill: event icon + event name + ref badge + commit SHA (linked, abbreviated 7 chars)
   - Timing: started timestamp, duration (live counter for running runs), completed timestamp
   - Action buttons (right-aligned): "Cancel" (destructive, running/queued only), "Rerun" (terminal only), "Resume" (cancelled/failed only)
3. **Dispatch inputs section** (collapsible, only for manually dispatched runs): key-value table of user-provided inputs
4. **Step graph:** Mermaid diagram rendered as interactive SVG with color-coded nodes. Clicking a node scrolls to that step in the list below.
5. **Step list:** Vertical list of step cards:
   - Step card header: status icon, step name, position badge, duration badge
   - Collapsed by default; click to expand
   - Expanded view: log viewer with line numbers, stdout/stderr stream indicators, ANSI color rendering, auto-scroll toggle, search within logs
   - For running steps: live log streaming with auto-scroll enabled by default
   - Loading state: skeleton shimmer on log area while fetching node detail
6. **Tab bar** (below header): "Steps" (default), "Artifacts" (stub, shows empty state), "Raw JSON"
   - "Raw JSON" tab shows the full API response in a code block with syntax highlighting and copy button

**Empty/error states:**
- Run not found: 404 page with "Workflow run not found" message and back link
- Definition deleted: Warning banner "The parent workflow definition has been removed" above the run detail
- Zero steps: "No steps recorded for this run" message in the step list area
- SSE disconnected: Toast notification "Live updates disconnected. Reconnecting…" with manual refresh button

**Accessibility:**
- All interactive elements are keyboard-navigable
- Status badges include ARIA labels (e.g., `aria-label="Status: Success"`)
- Log viewer supports Ctrl+F browser search
- Color-coded elements also use icons/shapes for color-blind accessibility

### Documentation

End-user documentation should cover:

1. **"Inspecting Workflow Runs"** — a guide explaining how to view run details from web, CLI, and TUI, with screenshots. Covers the header information, step graph, step list, and log viewer.
2. **"Streaming Workflow Logs"** — explains real-time log streaming in the web UI and TUI, how auto-follow works, how to search within logs, and how reconnection works.
3. **"CLI Reference: `codeplane run view`"** — full argument and flag documentation, formatted and JSON output examples.
4. **"CLI Reference: `codeplane run logs`"** — streaming behavior, stderr vs stdout routing, `--json` collection mode.
5. **"CLI Reference: `codeplane run watch`"** — combined status + log streaming, terminal state early exit.
6. **"Managing Workflow Runs"** — how to cancel, rerun, and resume runs from any surface, with preconditions for each action.
7. **"API Reference: Workflow Run Detail"** — endpoint documentation for `GET /api/repos/:owner/:repo/workflows/runs/:id`, node detail, step list, log stream, and event stream, with request/response schemas and error codes.
8. **"Understanding the Step Graph"** — explanation of the Mermaid visualization, color codes, and how to interpret step dependencies and durations.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View run detail (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View run detail (private repo) | ❌ (401) | ✅ | ✅ | ✅ | ✅ |
| View node detail (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View node detail (private repo) | ❌ (401) | ✅ | ✅ | ✅ | ✅ |
| View step list (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View step list (private repo) | ❌ (401) | ✅ | ✅ | ✅ | ✅ |
| Stream logs (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stream logs (private repo) | ❌ (401) | ✅ | ✅ | ✅ | ✅ |
| Stream events (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stream events (private repo) | ❌ (401) | ✅ | ✅ | ✅ | ✅ |
| Cancel run | ❌ | ❌ (403) | ✅ | ✅ | ✅ |
| Rerun | ❌ | ❌ (403) | ✅ | ✅ | ✅ |
| Resume run | ❌ | ❌ (403) | ✅ | ✅ | ✅ |

- Run detail, node detail, step list, and SSE streams inherit repository visibility rules: public repos allow any authenticated user to read; private repos require at least read access.
- Cancel, rerun, and resume require write access to the repository.
- Action buttons/keybindings are visible to all users with view access but only functional for users with write access. Users without write access who attempt an action receive 403 with `"forbidden"`.
- SSE connections for private repos require authentication via the existing SSE ticket mechanism: the client obtains a short-lived ticket (30-second TTL, single-use) via `POST /api/auth/sse-ticket` and passes it as a query parameter.

### Rate Limiting

| Endpoint | Authenticated | Anonymous | Scope |
|----------|--------------|-----------|-------|
| `GET .../workflows/runs/:id` | 300/min | 60/min | Per user / per IP |
| `GET .../workflows/runs/:id/nodes/:nodeId` | 300/min | 60/min | Per user / per IP |
| `GET .../actions/runs/:id/steps` | 300/min | 60/min | Per user / per IP |
| `GET .../runs/:id/logs` (SSE) | 10 connections/user | 2 connections/IP | Concurrent |
| `GET .../workflows/runs/:id/events` (SSE) | 10 connections/user | 2 connections/IP | Concurrent |
| `POST .../workflows/runs/:id/cancel` | 30/min | N/A | Per user |
| `POST .../workflows/runs/:id/rerun` | 30/min | N/A | Per user |
| `POST .../workflows/runs/:id/resume` | 30/min | N/A | Per user |

Rate limit headers included in every non-SSE response:
- `X-RateLimit-Limit`: Maximum requests in the window
- `X-RateLimit-Remaining`: Remaining requests in the window
- `X-RateLimit-Reset`: Unix timestamp when the window resets
- `Retry-After`: Seconds to wait (on 429 responses only)

SSE connections exceeding the concurrent limit receive a 429 response.

### Data Privacy

- Log entries may contain user-generated output including file paths, error messages, and environment values. Log content is returned as-is with no server-side redaction; the assumption is that anyone with read access to the repository can also see workflow output.
- `trigger_commit_sha` and `trigger_ref` may reveal internal branch names; these are safe to expose to anyone with repository read access.
- Dispatch inputs (when present) may contain user-provided values; these are included in the run detail response for users with read access.
- `agent_token_hash` and `agent_token_expires_at` fields exist in the database but are excluded from all detail responses to prevent accidental credential exposure.
- The Mermaid graph and XML plan document contain step names and statuses but no log content or secret references.
- SSE ticket tokens should be treated as short-lived bearer credentials and must not be logged at any level.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workflow_run.detail_viewed` | User opens run detail on any surface | `repo_id`, `repo_owner`, `repo_name`, `run_id`, `run_status`, `workflow_name`, `workflow_definition_id`, `trigger_event`, `node_count`, `client` (web/cli/tui), `entry_method` (list_click/deep_link/command/url), `load_time_ms` |
| `workflow_run.node_detail_viewed` | User expands a step or fetches node detail | `repo_id`, `run_id`, `node_id`, `node_name`, `node_status`, `log_count`, `client`, `load_time_ms` |
| `workflow_run.logs_streamed` | User connects to log SSE stream | `repo_id`, `run_id`, `client`, `connection_duration_seconds`, `events_received`, `reconnect_count`, `used_last_event_id` |
| `workflow_run.events_streamed` | User connects to event SSE stream | `repo_id`, `run_id`, `client`, `connection_duration_seconds`, `events_received` |
| `workflow_run.step_expanded` | User expands a step in the step list (web/TUI) | `repo_id`, `run_id`, `step_id`, `step_name`, `step_status`, `step_position`, `client` |
| `workflow_run.mermaid_rendered` | Mermaid graph is rendered in web or TUI | `repo_id`, `run_id`, `node_count`, `client`, `render_time_ms` |
| `workflow_run.action_initiated` | User triggers cancel/rerun/resume from detail view | `repo_id`, `run_id`, `action` (cancel/rerun/resume), `run_status_before`, `client` |
| `workflow_run.action_completed` | Cancel/rerun/resume API call completes | `repo_id`, `run_id`, `action`, `success`, `new_run_id` (rerun only), `client` |
| `workflow_run.auto_follow_toggled` | User toggles auto-follow in log viewer | `repo_id`, `run_id`, `enabled`, `client` |
| `workflow_run.detail_not_found` | User navigates to a non-existent run | `repo_id`, `requested_run_id`, `client`, `entry_method` |
| `workflow_run.detail_error` | Run detail endpoint returns non-2xx | `repo_id`, `run_id`, `http_status`, `error_message`, `client` |
| `workflow_run.log_search_used` | User searches within step logs | `repo_id`, `run_id`, `step_id`, `query_length`, `match_count`, `client` |

### Common Properties (all events)

- `user_id` (hashed)
- `session_id`
- `timestamp` (ISO 8601)
- `codeplane_version`

### Funnel Metrics & Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------|
| Detail view completion rate (200 response) | >98% | Basic reliability |
| Node detail load rate (users who expand ≥1 step) | >60% of detail views | Confirms users are debugging, not just glancing |
| Log stream connection rate (for in-progress runs) | >80% of views for running runs | Real-time streaming is being used |
| Median time on detail page | >30 seconds | Users are inspecting, not bouncing |
| Action rate (cancel/rerun/resume) | >5% of detail views | Detail view is an effective launchpad for run management |
| Rerun-from-detail rate (vs. rerun from list) | >50% of all reruns | Detail view is the preferred rerun entry point |
| SSE reconnection success rate | >95% | `Last-Event-ID` replay is working reliably |
| Detail → definition view navigation | >15% of detail views | Users explore upstream from run to workflow definition |
| 404 rate on detail views | <3% | Users are finding valid runs |
| Log search usage | >10% of expanded steps | In-log search is valuable for debugging |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Run detail requested | `method=GET`, `path`, `owner`, `repo`, `run_id`, `request_id` |
| `debug` | Run fetched from DB | `repository_id`, `run_id`, `run_status`, `duration_ms`, `request_id` |
| `debug` | Definition fetched for run | `repository_id`, `definition_id`, `definition_name`, `duration_ms`, `request_id` |
| `debug` | Steps fetched for run | `run_id`, `step_count`, `duration_ms`, `request_id` |
| `debug` | Mermaid graph generated | `run_id`, `node_count`, `graph_size_bytes`, `duration_ms`, `request_id` |
| `debug` | Plan XML generated | `run_id`, `node_count`, `xml_size_bytes`, `duration_ms`, `request_id` |
| `debug` | Node detail requested | `run_id`, `node_id`, `request_id` |
| `debug` | Node logs fetched | `run_id`, `step_id`, `log_count`, `after_id`, `duration_ms`, `request_id` |
| `info` | Run detail response sent | `status=200`, `run_id`, `run_status`, `node_count`, `response_time_ms`, `request_id` |
| `info` | Node detail response sent | `status=200`, `run_id`, `node_id`, `log_count`, `response_time_ms`, `request_id` |
| `info` | SSE log stream opened | `run_id`, `user_id`, `channel_count`, `is_terminal`, `last_event_id`, `request_id` |
| `info` | SSE log stream closed | `run_id`, `user_id`, `duration_seconds`, `events_sent`, `request_id` |
| `info` | SSE event stream opened | `run_id`, `user_id`, `is_terminal`, `request_id` |
| `info` | SSE event stream closed | `run_id`, `user_id`, `duration_seconds`, `events_sent`, `request_id` |
| `warn` | Slow run detail response (>2s) | `run_id`, `response_time_ms`, `node_count`, `request_id` |
| `warn` | Slow node detail response (>3s) | `run_id`, `node_id`, `log_count`, `response_time_ms`, `request_id` |
| `warn` | Large log set fetched (>5000) | `run_id`, `step_id`, `log_count`, `request_id` |
| `warn` | Large Mermaid graph (>100 nodes) | `run_id`, `node_count`, `graph_size_bytes`, `request_id` |
| `warn` | SSE reconnect with Last-Event-ID | `run_id`, `last_event_id`, `replayed_count`, `request_id` |
| `warn` | Rate limited | `user_id`, `ip`, `endpoint`, `retry_after_s`, `request_id` |
| `error` | Database error on run fetch | `run_id`, `error_message`, `error_code`, `request_id` |
| `error` | Database error on step fetch | `run_id`, `error_message`, `error_code`, `request_id` |
| `error` | Database error on log fetch | `run_id`, `step_id`, `error_message`, `error_code`, `request_id` |
| `error` | SSE subscription error | `run_id`, `channel`, `error_message`, `request_id` |
| `error` | Unexpected server error | `endpoint`, `error_message`, `stack_trace`, `request_id` |

Server logs use structured JSON format. Client logs (TUI/CLI) go to stderr at the level controlled by `CODEPLANE_LOG_LEVEL`.

### Prometheus Metrics

**Counters:**
- `codeplane_workflow_run_detail_requests_total{status, endpoint}` — Total requests to run detail, node detail, and step list endpoints. Labels: HTTP status (200/400/401/403/404/429/500) and endpoint variant (run_detail/node_detail/step_list)
- `codeplane_workflow_run_detail_not_found_total{endpoint}` — Total 404 responses across detail endpoints
- `codeplane_workflow_run_sse_connections_total{stream_type}` — Total SSE connections opened. Labels: stream_type (logs/events)
- `codeplane_workflow_run_sse_events_sent_total{stream_type, event_type}` — Total SSE events sent. Labels: stream_type (logs/events), event_type (log/status/done)
- `codeplane_workflow_run_sse_reconnections_total` — Total SSE reconnections using Last-Event-ID
- `codeplane_workflow_run_action_total{action, status}` — Total cancel/rerun/resume requests. Labels: action (cancel/rerun/resume), HTTP status
- `codeplane_workflow_run_detail_rate_limited_total{scope}` — Total rate-limited requests. Labels: scope (user/ip)

**Histograms:**
- `codeplane_workflow_run_detail_duration_seconds{endpoint}` — Latency of detail endpoints (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
- `codeplane_workflow_run_node_log_count{run_id}` — Number of logs returned per node detail request (buckets: 0, 10, 100, 500, 1000, 5000, 10000)
- `codeplane_workflow_run_step_count` — Number of steps per run detail request (buckets: 0, 1, 5, 10, 20, 50, 100, 200)
- `codeplane_workflow_run_mermaid_size_bytes` — Size of generated Mermaid graphs (buckets: 100, 500, 1K, 5K, 10K, 50K)
- `codeplane_workflow_run_sse_connection_duration_seconds{stream_type}` — SSE connection duration (buckets: 1, 5, 30, 60, 300, 600, 1800, 3600)

**Gauges:**
- `codeplane_workflow_run_sse_active_connections{stream_type}` — Current number of active SSE connections

### Alerts

#### Alert: `WorkflowRunDetailHighErrorRate`
- **Condition:** `rate(codeplane_workflow_run_detail_requests_total{status=~"5.."}[5m]) / rate(codeplane_workflow_run_detail_requests_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check server logs for `error` level entries with `workflow_run_detail` context and the associated `request_id` values
  2. Identify whether errors are in run fetch, definition fetch, step fetch, or response building
  3. Check database connectivity: run `SELECT 1` against primary DB
  4. Check if a specific run or repository is causing all errors (look at `run_id` and `repository_id` in error logs)
  5. If database connection issue: check PG connection pool saturation (`pg_stat_activity`), restart server if pool is exhausted
  6. If a specific run has corrupted data: quarantine and investigate; consider returning a degraded response without Mermaid/XML
  7. Escalate if error rate persists after DB connectivity is confirmed

#### Alert: `WorkflowRunDetailHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_run_detail_duration_seconds_bucket{endpoint="run_detail"}[5m])) > 3.0`
- **Severity:** Warning
- **Runbook:**
  1. Check which sub-operation is slow: run fetch, definition fetch, step fetch, Mermaid generation, or XML generation
  2. Check `codeplane_workflow_run_step_count` histogram — high step counts (100+) can cause slow Mermaid/XML generation
  3. Run `EXPLAIN ANALYZE` on `getWorkflowRunById` and `listWorkflowSteps` queries for a sample run
  4. Check for missing indexes on `workflow_runs(repository_id, id)` and `workflow_steps(workflow_run_id, position)`
  5. If Mermaid generation is slow for large runs, consider caching generated graphs with a short TTL
  6. If step count is the bottleneck, consider paginating steps or lazy-loading node details

#### Alert: `WorkflowRunNodeDetailHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_run_detail_duration_seconds_bucket{endpoint="node_detail"}[5m])) > 5.0`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_run_node_log_count` — high log counts (10,000) are expected but slow
  2. Run `EXPLAIN ANALYZE` on `listWorkflowLogsSince` for a sample run/step with high log counts
  3. Check for missing indexes on `workflow_logs(workflow_run_id, workflow_step_id, id)`
  4. If a single step has extreme log volume, consider adding log truncation warnings in the response
  5. Consider reducing the 10,000 log entry hard cap if p95 latency remains high

#### Alert: `WorkflowRunSSEConnectionSurge`
- **Condition:** `codeplane_workflow_run_sse_active_connections > 500`
- **Severity:** Warning
- **Runbook:**
  1. Check if a specific run is attracting many concurrent viewers (popular CI run, deployment)
  2. Check for SSE connection leaks: clients not closing connections after run completion
  3. Review `codeplane_workflow_run_sse_connection_duration_seconds` — look for anomalously long-lived connections
  4. If connections are not closing on `done` events, check the SSE stream close logic
  5. If legitimate traffic, consider scaling horizontally or adding connection limits per-run
  6. Check memory usage — each SSE connection holds a channel subscription

#### Alert: `WorkflowRunSSEHighReconnectionRate`
- **Condition:** `rate(codeplane_workflow_run_sse_reconnections_total[5m]) > 50`
- **Severity:** Warning
- **Runbook:**
  1. Check if the server is restarting frequently (deployment, OOM kills)
  2. Check network infrastructure: load balancer timeouts, idle connection reaping
  3. Verify that SSE keep-alive comments are being sent at regular intervals (every 15-30 seconds)
  4. Check client-side logs for disconnect reasons
  5. If load balancer is the issue, increase idle timeout on the LB config
  6. If server restarts, investigate the cause (memory, panics, deploys)

#### Alert: `WorkflowRunDetailHighNotFoundRate`
- **Condition:** `rate(codeplane_workflow_run_detail_not_found_total[15m]) > 20`
- **Severity:** Info
- **Runbook:**
  1. Check if a client is following stale links to deleted runs
  2. Review recent bulk run cleanup/purge operations
  3. Check if there's a UI bug generating incorrect run IDs in navigation links
  4. No immediate action required unless correlated with user reports

### Error Cases and Failure Modes

| Error Case | HTTP Status | Log Level | Recovery |
|------------|-------------|-----------|----------|
| Invalid run ID (non-numeric, zero, negative) | 400 | debug | Client corrects input |
| Invalid node ID (empty) | 400 | debug | Client corrects input |
| Run not found | 404 | info | Client shows not-found state |
| Definition deleted (run exists but def gone) | 404 | warn | Client shows degraded state; consider returning partial response |
| Node not found (step doesn't match) | 404 | info | Client shows not-found for step |
| Missing auth token | 401 | info | Client re-authenticates |
| Insufficient repo access | 403 | info | User requests access |
| Rate limited | 429 | warn | Client waits and retries per `Retry-After` |
| Database connection failure on run fetch | 500 | error | Auto-retry with backoff; alert fires |
| Database connection failure on step fetch | 500 | error | Auto-retry with backoff |
| Database connection failure on log fetch | 500 | error | Auto-retry with backoff |
| SSE channel subscription failure | 500 | error | Client reconnects with `Last-Event-ID` |
| Mermaid generation OOM (extreme node count) | 500 | error | Add node count guard; return response without Mermaid |
| XML generation failure | 500 | error | Return response without XML; log error |
| SSE keep-alive timeout (client-side) | N/A | warn (client) | Client reconnects with `Last-Event-ID` |
| Concurrent run deletion during detail view | 404 on refresh | info | Client shows run-deleted state |

## Verification

### API Integration Tests

**File: `e2e/api/workflow-run-detail.test.ts`**

#### Run Detail Endpoint (`GET /api/repos/:owner/:repo/workflows/runs/:id`)

| Test ID | Description |
|---------|-------------|
| API-WRD-001 | Returns 200 with complete detail response including `run`, `workflow`, `nodes`, `mermaid`, and `plan_xml` fields |
| API-WRD-002 | `run` object includes all required fields: `id`, `repository_id`, `workflow_definition_id`, `status`, `trigger_event`, `trigger_ref`, `trigger_commit_sha`, `started_at`, `completed_at`, `created_at`, `updated_at` |
| API-WRD-003 | `workflow` object includes `id`, `name`, and `path` from the parent definition |
| API-WRD-004 | `nodes` array contains one entry per step in the correct position order |
| API-WRD-005 | Each node includes `id`, `step_id`, `name`, `position`, `status`, `iteration`, `started_at`, `completed_at`, `duration`, `duration_seconds` |
| API-WRD-006 | `mermaid` field is a valid Mermaid `graph TD` string with node declarations and edges |
| API-WRD-007 | `plan_xml` field is a valid XML document starting with `<?xml version="1.0"` |
| API-WRD-008 | Duration label is formatted as `Xs` for <60s and `Xm Ys` for >=60s |
| API-WRD-009 | `duration_seconds` is a non-negative integer matching the time between `started_at` and `completed_at` |
| API-WRD-010 | Queued run with null `started_at` returns `duration: ""` and `duration_seconds: 0` for all queued steps |
| API-WRD-011 | Running run with null `completed_at` returns a positive duration calculated from current time |
| API-WRD-012 | Run with `completed_at < started_at` returns `duration: ""` and `duration_seconds: 0` |
| API-WRD-013 | Non-existent run ID returns 404 with `{ "message": "workflow run not found" }` |
| API-WRD-014 | Non-numeric run ID (e.g., "abc") returns 400 with `{ "message": "invalid run id" }` |
| API-WRD-015 | Zero run ID returns 400 with `{ "message": "invalid run id" }` |
| API-WRD-016 | Negative run ID returns 400 with `{ "message": "invalid run id" }` |
| API-WRD-017 | Float run ID (e.g., "1.5") returns 400 with `{ "message": "invalid run id" }` |
| API-WRD-018 | Extremely large run ID (Number.MAX_SAFE_INTEGER + 1) returns 400 or 404 |
| API-WRD-019 | Run belonging to a different repository returns 404 (cross-repo isolation) |
| API-WRD-020 | Run with deleted parent definition returns 404 with `{ "message": "workflow definition not found" }` |
| API-WRD-021 | Run with zero steps returns empty `nodes` array, `graph TD\n` Mermaid, and XML with no `<node>` children |
| API-WRD-022 | Run with 200 steps (maximum) returns all 200 nodes with valid Mermaid and XML |
| API-WRD-023 | Mermaid graph contains `style` directives with correct fill colors per node status |
| API-WRD-024 | Mermaid graph edges between nodes include status and duration labels |
| API-WRD-025 | Step names containing pipe characters are escaped in Mermaid output |
| API-WRD-026 | Step names containing double quotes are escaped in Mermaid output |
| API-WRD-027 | Step names containing newlines are escaped in Mermaid output |
| API-WRD-028 | XML plan document has correct `name`, `path`, `run_id`, `status` attributes on root element |
| API-WRD-029 | XML node elements have correct attribute escaping for `<`, `>`, `&`, `"` characters |
| API-WRD-030 | Unicode and emoji in step names render correctly in response, Mermaid, and XML |
| API-WRD-031 | All run statuses are correctly represented: success, failure, running, queued, cancelled, timeout |
| API-WRD-032 | All trigger event types are correctly represented: push, landing_request, manual, schedule, webhook, workflow_run |
| API-WRD-033 | All timestamps in the response are valid ISO 8601 strings |
| API-WRD-034 | Response time for a run with 200 steps is under 3 seconds |
| API-WRD-035 | Unauthenticated request to private repository returns 401 |
| API-WRD-036 | Authenticated user without repo access on private repo returns 403 |
| API-WRD-037 | Public repository run is accessible without authentication |
| API-WRD-038 | Rate limiting returns 429 after exceeding 300 requests/minute with `Retry-After` header |

#### Node Detail Endpoint (`GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId`)

| Test ID | Description |
|---------|-------------|
| API-WND-001 | Returns 200 with `run_id`, `node`, `logs`, `output`, `plan_xml`, and `mermaid` fields |
| API-WND-002 | `node` object matches the requested step with all WorkflowRunNodeResponse fields |
| API-WND-003 | `logs` array contains only log entries belonging to the requested step |
| API-WND-004 | Each log entry includes `id`, `sequence`, `stream`, `entry`, and `created_at` |
| API-WND-005 | Log entries are filtered correctly — no logs from other steps leak into the response |
| API-WND-006 | `stream` field is either `stdout` or `stderr` |
| API-WND-007 | Node ID as numeric step ID resolves correctly |
| API-WND-008 | Node ID as step name (case-insensitive) resolves correctly |
| API-WND-009 | Node ID as step name with different casing resolves correctly |
| API-WND-010 | Non-existent node ID returns 404 with `{ "message": "workflow node not found" }` |
| API-WND-011 | Empty node ID returns 400 with `{ "message": "invalid node id" }` |
| API-WND-012 | Invalid run ID returns 400 |
| API-WND-013 | Non-existent run returns 404 |
| API-WND-014 | Step with zero logs returns empty `logs` array |
| API-WND-015 | Step with 10,000 logs (hard cap) returns exactly 10,000 entries |
| API-WND-016 | Step with >10,000 logs returns truncated at 10,000 entries |
| API-WND-017 | `output` field is `null` |
| API-WND-018 | `plan_xml` and `mermaid` include full run context (all steps, not just the requested one) |
| API-WND-019 | Log entries with ANSI escape codes are returned as-is |
| API-WND-020 | Log entries with Unicode content render correctly |
| API-WND-021 | Response time for a step with 10,000 logs is under 5 seconds |

#### Step List Endpoint (`GET /api/repos/:owner/:repo/actions/runs/:id/steps`)

| Test ID | Description |
|---------|-------------|
| API-WSL-001 | Returns 200 with `{ "steps": [...] }` containing all steps for the run |
| API-WSL-002 | Each step includes `id`, `workflow_run_id`, `name`, `position`, `status`, `started_at`, `completed_at`, `created_at`, `updated_at` |
| API-WSL-003 | Steps are ordered by position |
| API-WSL-004 | Run with zero steps returns `{ "steps": [] }` |
| API-WSL-005 | Invalid run ID returns 400 |
| API-WSL-006 | Non-existent run returns 404 |
| API-WSL-007 | Run belonging to different repository returns 404 |

#### Legacy Run Detail Endpoint (`GET /api/repos/:owner/:repo/actions/runs/:id`)

| Test ID | Description |
|---------|-------------|
| API-WRL-001 | Returns 200 with flat run object (no `workflow`, `nodes`, `mermaid`, or `plan_xml`) |
| API-WRL-002 | Non-existent run returns 404 |
| API-WRL-003 | Invalid run ID returns 400 |

#### SSE Log Stream (`GET /api/repos/:owner/:repo/runs/:id/logs`)

| Test ID | Description |
|---------|-------------|
| API-WSS-001 | Connecting to a running run returns `Content-Type: text/event-stream` |
| API-WSS-002 | First event is a `status` event with run and steps data |
| API-WSS-003 | Terminal run sends `status` event followed by `done` event then closes |
| API-WSS-004 | `done` event data contains the same shape as `status` event data |
| API-WSS-005 | `log` events include `log_id`, `step`, `line`, `content`, `stream` fields |
| API-WSS-006 | Each `log` event has a unique numeric `id` field |
| API-WSS-007 | `Last-Event-ID` header replays missed logs with correct event IDs |
| API-WSS-008 | `Last-Event-ID` with value 0 replays no extra events |
| API-WSS-009 | `Last-Event-ID` with non-numeric value is ignored (no replay, no error) |
| API-WSS-010 | `Last-Event-ID` replay fetches up to 1,000 log entries |
| API-WSS-011 | Non-existent run returns 404 (not SSE) |
| API-WSS-012 | Invalid run ID returns 400 (not SSE) |
| API-WSS-013 | Status events fire when step status changes |
| API-WSS-014 | Multiple concurrent SSE connections to the same run all receive events |

#### SSE Event Stream (`GET /api/repos/:owner/:repo/workflows/runs/:id/events`)

| Test ID | Description |
|---------|-------------|
| API-WES-001 | Connecting to a running run returns `Content-Type: text/event-stream` |
| API-WES-002 | First event is a `status` event |
| API-WES-003 | Terminal run sends `status` + `done` events then closes |
| API-WES-004 | Only `status` and `done` event types are emitted (no `log` events) |
| API-WES-005 | Non-existent run returns 404 |
| API-WES-006 | Invalid run ID returns 400 |

### CLI Integration Tests

**File: `e2e/cli/workflow-run-detail.test.ts`**

| Test ID | Description |
|---------|-------------|
| CLI-WRD-001 | `codeplane run view <id> --repo owner/repo` displays formatted run detail with status, workflow, trigger, steps |
| CLI-WRD-002 | `codeplane run view <id> --repo owner/repo --json` outputs valid JSON matching the API response shape |
| CLI-WRD-003 | `codeplane run view <id>` without `--repo` in a repo directory infers repository |
| CLI-WRD-004 | `codeplane run view` without ID shows usage error |
| CLI-WRD-005 | `codeplane run view abc` with non-numeric ID shows error |
| CLI-WRD-006 | `codeplane run view 99999` with non-existent ID shows "Workflow run not found" error |
| CLI-WRD-007 | `codeplane run view <id>` without repo context and without `--repo` shows "No repository context" error |
| CLI-WRD-008 | Formatted output shows status icon (✓/✗/◎/◌/✕) matching run status |
| CLI-WRD-009 | Formatted output shows trigger event, ref, and abbreviated commit SHA |
| CLI-WRD-010 | Formatted output shows each step with position, name, status icon, and duration |
| CLI-WRD-011 | Exit code is 0 for successful view, 1 for errors |
| CLI-WRD-012 | `codeplane run logs <id> --repo owner/repo` streams log content to stderr |
| CLI-WRD-013 | `codeplane run logs <id>` prefixes log lines with `[step N]` |
| CLI-WRD-014 | `codeplane run logs <id>` shows status changes on stderr |
| CLI-WRD-015 | `codeplane run logs <id>` exits after receiving `done` event |
| CLI-WRD-016 | `codeplane run logs <id>` for already-terminal run outputs status and exits |
| CLI-WRD-017 | `codeplane run logs <id>` with non-existent run shows error |
| CLI-WRD-018 | `codeplane run watch <id> --repo owner/repo` shows initial status then streams events |
| CLI-WRD-019 | `codeplane run watch <id>` for already-terminal run shows status and exits immediately |
| CLI-WRD-020 | `codeplane run watch <id>` exits after run completes |
| CLI-WRD-021 | `codeplane run cancel <id> --repo owner/repo` cancels a running run |
| CLI-WRD-022 | `codeplane run rerun <id> --repo owner/repo` reruns a completed run |
| CLI-WRD-023 | `codeplane run cancel` and `run rerun` with non-existent IDs show error |

### TUI E2E Tests

**File: `e2e/tui/workflow-run-detail.test.ts`**

#### Terminal Snapshot Tests

| Test ID | Description |
|---------|-------------|
| SNAP-WRDET-001 | Detail screen at 120×40 with completed successful run — header, steps, status bar |
| SNAP-WRDET-002 | Detail screen at 80×24 — compact layout with abbreviated header |
| SNAP-WRDET-003 | Detail screen at 200×60 — expanded layout with Mermaid ASCII art |
| SNAP-WRDET-004 | Success status badge (✓ green) |
| SNAP-WRDET-005 | Failure status badge (✗ red) |
| SNAP-WRDET-006 | Running status badge (◎ blue, animated) |
| SNAP-WRDET-007 | Queued status badge (◌ cyan) |
| SNAP-WRDET-008 | Cancelled status badge (✕ gray) |
| SNAP-WRDET-009 | Step list with mixed statuses |
| SNAP-WRDET-010 | Expanded step with inline logs showing stdout |
| SNAP-WRDET-011 | Expanded step with inline logs showing stderr (red-tinted) |
| SNAP-WRDET-012 | Loading state — "Loading run detail…" |
| SNAP-WRDET-013 | Error state — red error with "Press Ctrl+R to retry" |
| SNAP-WRDET-014 | Not-found state — "Workflow run not found" |
| SNAP-WRDET-015 | Run with zero steps — "No steps recorded for this run" |
| SNAP-WRDET-016 | Dispatch inputs section expanded |
| SNAP-WRDET-017 | Cancel confirmation overlay |
| SNAP-WRDET-018 | Rerun confirmation overlay |
| SNAP-WRDET-019 | Resume confirmation overlay |
| SNAP-WRDET-020 | Breadcrumb "Dashboard > owner/repo > Workflows > CI > Run #1047" |
| SNAP-WRDET-021 | Status bar hints "c:cancel r:rerun R:resume j/k:nav Enter:expand l:logs q:back" |
| SNAP-WRDET-022 | SSE connection indicator (● connected, ○ disconnected) |

#### Keyboard Interaction Tests

| Test ID | Description |
|---------|-------------|
| KEY-WRDET-001 | j/Down moves focus to next step |
| KEY-WRDET-002 | k/Up moves focus to previous step |
| KEY-WRDET-003 | G jumps to last step |
| KEY-WRDET-004 | g g jumps to first step |
| KEY-WRDET-005 | Enter expands focused step to show logs |
| KEY-WRDET-006 | Enter on expanded step collapses it |
| KEY-WRDET-007 | l opens full-screen log viewer for focused step |
| KEY-WRDET-008 | c opens cancel confirmation for running run |
| KEY-WRDET-009 | c is no-op for terminal-state run |
| KEY-WRDET-010 | r opens rerun confirmation for terminal run |
| KEY-WRDET-011 | r is no-op for running run |
| KEY-WRDET-012 | R opens resume confirmation for cancelled/failed run |
| KEY-WRDET-013 | R is no-op for running or successful run |
| KEY-WRDET-014 | f toggles auto-follow when step is expanded and running |
| KEY-WRDET-015 | e toggles dispatch inputs section |
| KEY-WRDET-016 | Ctrl+D pages down in expanded log panel |
| KEY-WRDET-017 | Ctrl+U pages up in expanded log panel |
| KEY-WRDET-018 | Ctrl+R refreshes run data |
| KEY-WRDET-019 | q pops screen |
| KEY-WRDET-020 | Esc pops screen |
| KEY-WRDET-021 | Enter on cancel confirmation triggers cancel API call |
| KEY-WRDET-022 | Esc on cancel confirmation dismisses overlay |

#### Responsive Tests

| Test ID | Description |
|---------|-------------|
| RESP-WRDET-001 | 80×24 shows header on 2 lines, steps without inline logs |
| RESP-WRDET-002 | 120×40 shows full header, steps with 5-line inline log panels |
| RESP-WRDET-003 | 200×60 shows Mermaid graph, steps with 15-line inline log panels |
| RESP-WRDET-004 | Resize between breakpoints preserves step focus |
| RESP-WRDET-005 | Below-minimum terminal (< 80×24) shows "Terminal too small" message |

#### Integration Tests

| Test ID | Description |
|---------|-------------|
| INT-WRDET-001 | Navigation from run list (Enter) opens correct run detail |
| INT-WRDET-002 | Back navigation (q) returns to run list with state preserved |
| INT-WRDET-003 | Deep link launch via `--screen run-detail --run-id 1047` |
| INT-WRDET-004 | Command palette entry `:run-view 1047` |
| INT-WRDET-005 | Cancel from detail → run status updates to cancelled |
| INT-WRDET-006 | Rerun from detail → new run created, navigates to new run detail |
| INT-WRDET-007 | Resume from detail → run status updates to running |
| INT-WRDET-008 | SSE updates step statuses inline for running run |
| INT-WRDET-009 | SSE disconnect → reconnection indicator → auto-reconnect |
| INT-WRDET-010 | Auth expiry during view → auth error screen |
| INT-WRDET-011 | Network error → error state with retry |
| INT-WRDET-012 | View run on private repo without access → permission error |

#### Edge Case Tests

| Test ID | Description |
|---------|-------------|
| EDGE-WRDET-001 | Run with 200 steps renders with scrolling |
| EDGE-WRDET-002 | Step with 10,000 log lines renders with scroll |
| EDGE-WRDET-003 | Log lines with ANSI color codes render correctly |
| EDGE-WRDET-004 | Step names with unicode/emoji render correctly |
| EDGE-WRDET-005 | Run detail for run whose definition was deleted shows appropriate error |
| EDGE-WRDET-006 | Concurrent status change during view — step updates without crash |
| EDGE-WRDET-007 | Run ID at INT64 max boundary — handled gracefully |
| EDGE-WRDET-008 | Multiple rapid expand/collapse of step does not cause flicker or data corruption |

### Playwright (Web UI) E2E Tests

**File: `e2e/web/workflow-run-detail.test.ts`**

| Test ID | Description |
|---------|-------------|
| WEB-WRD-001 | Navigate to `/:owner/:repo/workflows/runs/:id` displays run detail page |
| WEB-WRD-002 | Breadcrumb shows correct path with clickable segments |
| WEB-WRD-003 | Header shows status badge, run number, workflow name, file path, trigger info, timing |
| WEB-WRD-004 | Success run shows green status badge |
| WEB-WRD-005 | Failure run shows red status badge |
| WEB-WRD-006 | Running run shows animated blue status badge |
| WEB-WRD-007 | Queued run shows cyan status badge |
| WEB-WRD-008 | Cancelled run shows gray status badge |
| WEB-WRD-009 | Trigger pill shows event type, ref badge, and linked commit SHA |
| WEB-WRD-010 | Manually dispatched run shows dispatch inputs section |
| WEB-WRD-011 | Mermaid step graph renders with color-coded nodes |
| WEB-WRD-012 | Clicking a Mermaid node scrolls to corresponding step in list |
| WEB-WRD-013 | Step list shows all steps with status icons, names, positions, durations |
| WEB-WRD-014 | Clicking a step expands it to show logs |
| WEB-WRD-015 | Expanded step shows log lines with stream indicators (stdout/stderr) |
| WEB-WRD-016 | Expanded step supports search within logs |
| WEB-WRD-017 | Running step shows live-streaming logs with auto-scroll |
| WEB-WRD-018 | Auto-scroll toggle button works in log viewer |
| WEB-WRD-019 | "Cancel" button visible and functional for running run |
| WEB-WRD-020 | "Cancel" button hidden/disabled for terminal run |
| WEB-WRD-021 | "Rerun" button visible and functional for terminal run |
| WEB-WRD-022 | "Resume" button visible and functional for cancelled/failed run |
| WEB-WRD-023 | "Cancel"/"Rerun"/"Resume" buttons hidden for read-only users |
| WEB-WRD-024 | "Raw JSON" tab shows full API response with syntax highlighting |
| WEB-WRD-025 | Copy button in Raw JSON tab copies to clipboard |
| WEB-WRD-026 | Navigate to non-existent run shows 404 page |
| WEB-WRD-027 | Navigate to run in wrong repo shows 404 page |
| WEB-WRD-028 | Run with zero steps shows "No steps recorded" message |
| WEB-WRD-029 | Run with deleted definition shows warning banner |
| WEB-WRD-030 | Page loads within 3 seconds for a run with 50 steps |
| WEB-WRD-031 | Page is accessible (keyboard navigation, ARIA labels, screen reader compatible) |
| WEB-WRD-032 | Responsive layout at mobile viewport (375px width) |
| WEB-WRD-033 | Responsive layout at tablet viewport (768px width) |
| WEB-WRD-034 | Responsive layout at desktop viewport (1440px width) |
| WEB-WRD-035 | SSE disconnect shows toast notification with reconnecting message |
| WEB-WRD-036 | Duration counter updates live for running runs |
| WEB-WRD-037 | Step log lines with ANSI codes render with correct colors |
| WEB-WRD-038 | Step log lines with very long content (10KB single line) do not break layout |

All tests are left failing if the backend or frontend is unimplemented — never skipped or commented out.

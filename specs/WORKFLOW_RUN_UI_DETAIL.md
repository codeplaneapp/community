# WORKFLOW_RUN_UI_DETAIL

Specification for WORKFLOW_RUN_UI_DETAIL.

## High-Level User POV

When a developer navigates to a specific workflow run in the Codeplane web application, they land on a rich, purpose-built detail page that gives them everything they need to understand what happened, why it happened, and what to do next — all without leaving the browser.

The page opens with a clear header showing the run number, the workflow name it belongs to, the trigger that caused it (a push, a manual dispatch, a landing request event, etc.), and the current status displayed as a colored badge. If the run is still in progress, the status badge pulses to indicate live activity. Right next to the status information sit the action buttons: Cancel if the run is still going, Rerun if it finished, and Resume if it failed or was cancelled. These actions are contextually visible — you never see a button that doesn't apply to the current state.

Below the header, the page is organized into intuitive tabs. The first tab shows a visual pipeline graph rendered from the workflow's step topology. Each node in the graph is color-coded by its status — green for success, red for failure, blue for running, gray for queued or cancelled. Clicking a node in the graph scrolls the step list and opens that step's log output inline, creating a seamless connection between the visual overview and the detailed output.

The Steps tab presents every step in execution order as an expandable card. Each card shows the step name, position number, status icon, and elapsed duration. Expanding a card reveals the step's log output rendered with full ANSI color support, line numbers, and a stream indicator distinguishing stdout from stderr. For running steps, logs stream in real time — new lines appear as they're emitted by the workflow engine, and the view auto-scrolls to follow the latest output. A toggle lets you freeze auto-scroll when you want to read earlier output without being yanked to the bottom.

The Artifacts tab lists any files produced by the run. Each artifact shows its name, size, and creation time, with a download button and a delete option for users with write access. The Logs tab provides a unified, full-run log view that interleaves output from all steps in chronological order, with step-name prefixes and color coding to distinguish sources.

If the run is actively executing, the entire page stays alive through a real-time event stream. Step statuses update as they transition, the graph recolors nodes as they complete, and the overall run status in the header changes the moment the engine marks the run as done. When the run reaches a terminal state, the stream closes gracefully and the page settles into its final static view.

The run detail page is the single place a developer goes to answer: "What is this run doing right now?", "Why did this step fail?", "How long did the build take?", and "What should I do next — rerun, resume, or investigate?" It eliminates the need to switch between a CI dashboard, a log viewer, and a separate artifact store by putting everything in one cohesive, streaming-capable view.

## Acceptance Criteria

### Definition of Done

A workflow run detail page is considered complete when a user can navigate to any workflow run in a repository they have access to, see its full metadata, visually inspect the step graph, expand any step to read its logs (including real-time streaming for active runs), perform contextual actions (cancel, rerun, resume), download artifacts, and experience graceful degradation when the run has zero steps, when the workflow definition has been deleted, or when the user lacks write permissions.

### Functional Checklist

- [ ] Navigating to `/:owner/:repo/workflows/runs/:runId` renders the run detail page
- [ ] The page header displays: run number (prefixed with `#`), workflow name, workflow path, trigger event type, trigger ref, trigger commit SHA (truncated to 7 characters, linked to change/commit view), run status badge, and formatted duration
- [ ] The status badge uses correct color coding: green for success, red for failure, blue for running, gray for queued/cancelled, orange for timeout
- [ ] The status badge pulses/animates for `running` and `queued` states
- [ ] Duration displays as `Xs` for durations under 60 seconds and `XmYs` for durations 60 seconds or longer
- [ ] Duration for queued runs (null `started_at`) displays as `—` or `0s`
- [ ] Duration for running runs updates live, reflecting elapsed time from `started_at` to current time
- [ ] The Cancel button is visible and enabled only when run status is `running` or `queued`
- [ ] The Rerun button is visible and enabled only when run status is `success`, `failure`, `cancelled`, or `timeout`
- [ ] The Resume button is visible and enabled only when run status is `failure` or `cancelled`
- [ ] Clicking Cancel shows a confirmation dialog before executing
- [ ] Clicking Rerun shows a confirmation dialog, and on confirmation navigates to the new run's detail page
- [ ] Clicking Resume shows a confirmation dialog, and on confirmation the page reflects the run transitioning to `queued`
- [ ] The Graph tab renders a Mermaid-based pipeline visualization with nodes colored by status
- [ ] Clicking a node in the graph navigates to / highlights that step in the Steps tab
- [ ] The Steps tab lists all steps in `position` ascending order
- [ ] Each step card shows: name, position number, status icon, started timestamp, and duration
- [ ] Expanding a step card reveals its log output
- [ ] Log output renders with line numbers starting from 1
- [ ] Log output preserves and renders ANSI escape codes for color/formatting
- [ ] Log output distinguishes `stdout` and `stderr` streams (stderr has a colored left border or label)
- [ ] For running steps, log output streams in real time via SSE
- [ ] Auto-scroll is enabled by default for running steps and can be toggled off
- [ ] When auto-scroll is off and new logs arrive, a "Jump to bottom" indicator appears
- [ ] The Artifacts tab lists all artifacts with name, size (human-readable), and creation timestamp
- [ ] Each artifact has a Download button that initiates a file download
- [ ] Each artifact has a Delete button visible only to users with write access, with confirmation dialog
- [ ] The full Logs tab shows interleaved logs from all steps in chronological order with step name prefix
- [ ] The page subscribes to the SSE log stream endpoint for active runs
- [ ] SSE reconnection uses `Last-Event-ID` to replay missed events (up to 1,000 entries)
- [ ] SSE reconnection uses exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [ ] A connection health indicator shows SSE connection state (connected, reconnecting, disconnected)
- [ ] When the SSE stream emits a `done` event, the page transitions to static view and closes the connection
- [ ] The page handles 404 for non-existent runs with a clear "Run not found" message and a link back to the workflow runs list
- [ ] The page handles 404 for deleted workflow definitions gracefully, still showing run data with a note that the workflow definition no longer exists
- [ ] The page handles 401/403 with appropriate auth prompts or access-denied messages
- [ ] The page handles runs with zero steps: empty step list, minimal graph, no artifacts section
- [ ] The breadcrumb trail shows: Repository > Workflows > Workflow Name > Run #N
- [ ] The page title updates to include the run number and workflow name
- [ ] The page is accessible via deep link (direct URL navigation)
- [ ] Browser back/forward navigation works correctly within the run detail page tabs

### Edge Cases

- [ ] Run ID is non-numeric in the URL: renders 404 / "Invalid run" page
- [ ] Run ID is zero or negative: renders 404 / "Invalid run" page
- [ ] Run ID exceeds int64 range: renders 404 / "Invalid run" page
- [ ] Step names contain special characters (pipes, quotes, angle brackets, emoji, CJK, RTL text): rendered correctly in step list and graph
- [ ] Step names at maximum length (255 characters): truncated with tooltip in step cards, full name visible on expand
- [ ] Duplicate step names: each displayed with unique position number for disambiguation
- [ ] Log entries contain ANSI escape sequences: rendered as formatted text, not raw codes
- [ ] Log entries are empty strings: rendered as blank lines with line numbers
- [ ] Log entries at maximum length (65,536 characters): rendered with horizontal scroll, no layout break
- [ ] A step has more than 10,000 log entries: initial load shows first 10,000 with indication that logs are truncated; streaming provides live tail
- [ ] Run has the maximum 200 steps: graph renders legibly with zoom/pan controls; step list scrolls
- [ ] Network disconnection during SSE stream: reconnection indicator shown, automatic retry with backoff
- [ ] User's session expires during page view: graceful auth error with re-login prompt
- [ ] Concurrent cancel requests (double-click): idempotent handling, no duplicate error messages
- [ ] Rerun when workflow definition has been deleted since the original run: 404 error shown with clear message
- [ ] Multiple browser tabs open on the same run: each maintains independent SSE connection
- [ ] Very rapid log emission (>100 lines/second): UI batches renders to avoid jank

### Boundary Constraints

- Run ID: positive integer, 1 to 2^63-1
- Step count per run: 0 to 200
- Step name length: 1 to 255 characters (Unicode allowed)
- Log entry length: 0 to 65,536 characters per line
- Log entries per step: up to 1,000,000 (fetched in pages of up to 10,000)
- Artifact name length: 1 to 255 characters
- SSE Last-Event-ID replay: up to 1,000 entries
- SSE keep-alive interval: 15 seconds
- Commit SHA display: truncated to first 7 characters in UI, full value in tooltip and copy action
- Duration format: `Xs` for < 60s, `XmYs` for >= 60s, `XhYmZs` for >= 3600s
- Mermaid graph: up to 200 nodes with zoom/pan for large graphs

## Design

### Web UI Design

#### Route

`/:owner/:repo/workflows/runs/:runId`

This route is nested under the repository layout and inherits the repository context (owner, repo name, sidebar, breadcrumbs).

#### Page Layout

**Header Section**

The header spans the full content width and contains:

| Element | Position | Details |
|---------|----------|----------|
| Breadcrumb | Top-left | `{owner}/{repo}` > `Workflows` > `{workflow.name}` > `Run #{run.id}` |
| Run title | Left | `Run #{run.id}` in heading typography |
| Workflow name | Below title | `{workflow.name}` as subtitle, linked to workflow definition page, with `{workflow.path}` in muted text |
| Status badge | Right of title | Colored pill: `Success` (green), `Failure` (red), `Running` (blue, pulsing), `Queued` (gray, pulsing), `Cancelled` (gray), `Timeout` (orange) |
| Duration | Right of badge | Formatted duration string or live-updating counter for running state |
| Trigger info | Below subtitle | Icon + label for trigger type (`push`, `manual`, `landing_request`, `schedule`, etc.), trigger ref as a linked tag, truncated commit SHA (7 chars) linked to commit view |
| Action buttons | Far right | Cancel (red, destructive), Rerun (blue, primary), Resume (green, success) — contextually shown based on run state |
| Timestamps | Below trigger info | `Started: {started_at}` and `Completed: {completed_at}` in relative format with absolute tooltip |

**Connection indicator**: A small dot in the header (green = connected, yellow = reconnecting, red = disconnected) visible only during active runs.

**Tab Bar**

Four tabs below the header:

1. **Graph** (default for completed runs)
2. **Steps** (default for running runs)
3. **Artifacts** (with count badge)
4. **Logs** (unified)

Tab selection is preserved in URL hash (`#graph`, `#steps`, `#artifacts`, `#logs`) for deep linking.

**Graph Tab**

- Renders the server-provided `mermaid` string as an interactive SVG diagram
- Nodes are clickable — clicking switches to Steps tab and scrolls to / expands the clicked step
- For graphs with more than 10 nodes: zoom controls (zoom in, zoom out, fit-to-view) and pan via drag
- For graphs with 0 nodes: message "This run has no steps"
- Graph node colors match status badge colors
- Current/focused node has a highlighted border

**Steps Tab**

- Vertical list of step cards in position order
- Each card in collapsed state shows:
  - Status icon: `✓` (green), `✗` (red), `●` (blue, animated for running), `○` (gray), `✕` (gray for cancelled), `⏱` (orange for timeout), `⊘` (for skipped)
  - Position number: `#1`, `#2`, etc.
  - Step name (truncated at ~60 chars with tooltip for overflow)
  - Duration: formatted or live counter
  - Expand/collapse chevron
- Expanding a card reveals the log viewer for that step:
  - Line numbers in a gutter column
  - Log content with ANSI rendering
  - `stderr` lines have a red left border (4px)
  - Monospace font, dark background (log viewer theme)
  - Search within logs: `Ctrl+F` or search icon opens a filter bar
  - Copy button: copies visible log content to clipboard
  - Download button: downloads step logs as `.log` file
  - For running steps: auto-scroll toggle (pin icon), "Jump to bottom" floating button when scrolled up
  - For steps with >10,000 lines: "Showing first 10,000 lines. Stream for complete output." message
- Keyboard navigation:
  - `j` / `k`: move focus between steps
  - `Enter` or `Space`: expand/collapse focused step
  - `Escape`: collapse expanded step

**Artifacts Tab**

- Table layout with columns: Name, Size, Created, Actions
- Size displayed in human-readable format (KB, MB, GB)
- Actions column: Download button (always visible), Delete button (visible for write-access users)
- Delete shows confirmation dialog: "Delete artifact {name}? This cannot be undone."
- Empty state: "No artifacts were produced by this run."
- Artifacts sorted by creation time descending

**Logs Tab (Unified)**

- Interleaved log output from all steps in chronological order
- Each line prefixed with step name in a colored label (color derived from step position for visual grouping)
- Line numbers are global across the run
- Same ANSI rendering, search, and copy capabilities as step-level logs
- Filter dropdown to show/hide specific steps
- For running runs: real-time streaming with auto-scroll

#### Confirmation Dialogs

All action dialogs follow a consistent pattern:

| Action | Title | Body | Confirm Button | Confirm Color |
|--------|-------|------|----------------|---------------|
| Cancel | Cancel run #{id}? | This will stop the currently executing workflow run. | Cancel Run | Red (destructive) |
| Rerun | Rerun run #{id}? | This will create a new run with the same trigger context. The current workflow definition will be used. | Rerun | Blue (primary) |
| Resume | Resume run #{id}? | This will reactivate the run from where it stopped. Completed steps will be preserved. | Resume | Green (success) |
| Delete artifact | Delete artifact? | Delete "{name}"? This action cannot be undone. | Delete | Red (destructive) |

During API execution, the confirm button shows a loading spinner and is disabled. On success, the dialog closes. On error, the dialog stays open with an error message.

#### Responsive Behavior

- **>=1280px**: Full layout with graph, step cards, and log viewer side-by-side potential
- **768-1279px**: Stacked layout, graph scales down, step cards take full width
- **<768px**: Compact layout, graph is scrollable/pannable, step cards stack vertically, log viewer takes full width with smaller font

#### Loading States

- **Initial load**: Skeleton placeholder matching the header, tab bar, and first 3 step cards
- **Step logs loading**: Spinner within the expanded step card
- **SSE connecting**: Connection indicator shows yellow dot with "Connecting..." tooltip
- **Tab switch**: Instant for already-loaded data; spinner for first-load artifact data

#### Error States

- **404 (run not found)**: Full-page empty state with "Workflow run not found" heading, "The run you're looking for doesn't exist or has been removed." description, and a "Back to Workflows" link
- **404 (definition deleted)**: Run detail renders normally but workflow name shows "(deleted)" suffix and the workflow name link is removed
- **401**: Redirect to login with return URL
- **403**: Full-page "Access denied" with option to request access or return to repository
- **500 / network error**: Inline error banner at top of page with "Retry" button
- **SSE failure after retries**: Banner "Live updates unavailable. Refresh for latest status." with manual refresh button

### API Shape

The web UI consumes the following API endpoints:

**Run Detail**
```
GET /api/repos/:owner/:repo/workflows/runs/:runId
-> 200: { run, workflow, nodes[], mermaid, plan_xml }
-> 400/401/403/404
```

**Node Detail (on step expand)**
```
GET /api/repos/:owner/:repo/workflows/runs/:runId/nodes/:nodeId
-> 200: { run_id, node, logs[], output, plan_xml, mermaid }
-> 400/401/403/404
```

**Step List (fallback)**
```
GET /api/repos/:owner/:repo/actions/runs/:runId/steps
-> 200: { steps[] }
-> 400/401/403/404
```

**Log Stream (SSE)**
```
GET /api/repos/:owner/:repo/runs/:runId/logs
Headers: Accept: text/event-stream, Last-Event-ID: <optional>
-> text/event-stream with events: status, log, done
```

**Event Stream (SSE, lightweight)**
```
GET /api/repos/:owner/:repo/workflows/runs/:runId/events
Headers: Accept: text/event-stream
-> text/event-stream with events: status, done
```

**Cancel**
```
POST /api/repos/:owner/:repo/workflows/runs/:runId/cancel
-> 204 (no body)
-> 400/401/403/404
```

**Rerun**
```
POST /api/repos/:owner/:repo/workflows/runs/:runId/rerun
-> 201: { workflow_definition_id, workflow_run_id, steps[] }
-> 400/401/403/404
```

**Resume**
```
POST /api/repos/:owner/:repo/workflows/runs/:runId/resume
-> 204 (no body)
-> 400/401/403/404/409
```

**Artifacts**
```
GET /api/repos/:owner/:repo/actions/runs/:runId/artifacts
-> 200: { artifacts[] }
```

**Delete Artifact**
```
DELETE /api/repos/:owner/:repo/actions/runs/:runId/artifacts/:artifactId
-> 204
-> 401/403/404
```

### SDK Shape

The `@codeplane/ui-core` package provides the following shared hooks:

- `useWorkflowRunDetail(repo, runId)` — Fetches run detail with nodes, mermaid, plan_xml
- `useWorkflowRunArtifacts(repo, runId)` — Fetches paginated artifact list
- `useWorkflowActions(repo)` — Returns `{ cancel, rerun, resume }` mutation functions with optimistic update and rollback callbacks
- `useDeleteWorkflowArtifact(repo)` — Mutation for artifact deletion
- `useWorkflowRunLogStream(repo, runId, options)` — Manages SSE connection lifecycle, reconnection, Last-Event-ID tracking, and exposes a reactive log buffer and connection state
- `useWorkflowRunEventStream(repo, runId)` — Lightweight SSE for status-only updates

### CLI Command

```
# View run detail
codeplane run view <runId> [--repo OWNER/REPO] [--json]

# View specific step/node
codeplane run view <runId> --node <nodeId> [--repo OWNER/REPO] [--json]

# Stream logs
codeplane run logs <runId> [--repo OWNER/REPO] [--step <name|id>] [--follow]

# Watch run (status + live logs until completion)
codeplane run watch <runId> [--repo OWNER/REPO]

# Cancel
codeplane run cancel <runId> [--repo OWNER/REPO] [--json]

# Rerun
codeplane run rerun <runId> [--repo OWNER/REPO] [--json]

# Resume
codeplane run resume <runId> [--repo OWNER/REPO] [--json] [--quiet]
```

### TUI UI

The TUI Workflow Run Detail screen provides terminal-native access:

- **Header row**: Run `#{id}` | `{workflow.name}` | Status badge | Duration
- **Step list panel** (left or top): Scrollable list with `j`/`k` navigation, status icons, duration
- **Log panel** (right or bottom): Shows logs for focused step, auto-scrolls for running steps
- **Keybindings**: `c` (cancel), `r` (rerun), `R` (resume), `l` (full-screen log viewer), `f` (toggle auto-follow), `Enter` (expand/collapse), `q`/`Escape` (back)
- **Confirmation overlays**: Modal overlays for destructive actions
- **Connection indicator**: Shows SSE state in header
- **Responsive**: Adapts layout based on terminal dimensions (horizontal split >=120 cols, vertical split below)

### Documentation

The following end-user documentation should be written:

1. **"Inspecting Workflow Runs"** — A guide page explaining how to navigate to a run detail page, read the graph, expand steps, and understand log output. Include screenshots of each tab.
2. **"Workflow Run Actions"** — A reference page documenting Cancel, Rerun, and Resume: when each is available, what each does, and the differences between Rerun (new run) and Resume (same run).
3. **"Real-Time Log Streaming"** — A guide explaining how live log streaming works, the connection indicator, reconnection behavior, and the auto-scroll toggle.
4. **"Workflow Run CLI Reference"** — Command reference for `run view`, `run logs`, `run watch`, `run cancel`, `run rerun`, `run resume` with examples and flag descriptions.
5. **"Workflow Run Artifacts"** — A short guide on viewing, downloading, and deleting artifacts from the run detail page.

## Permissions & Security

### Authorization Matrix

| Action | Anonymous (public repo) | Anonymous (private repo) | Read-Only | Member/Write | Admin | Owner |
|--------|------------------------|-------------------------|-----------|--------------|-------|-------|
| View run detail | ✅ | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| View step logs | ✅ | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| View artifacts | ✅ | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| Download artifact | ✅ | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| Connect SSE log stream | ✅ | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| Connect SSE event stream | ✅ | ❌ 401 | ✅ | ✅ | ✅ | ✅ |
| Cancel run | ❌ 401 | ❌ 401 | ❌ 403 | ✅ | ✅ | ✅ |
| Rerun | ❌ 401 | ❌ 401 | ❌ 403 | ✅ | ✅ | ✅ |
| Resume | ❌ 401 | ❌ 401 | ❌ 403 | ✅ | ✅ | ✅ |
| Delete artifact | ❌ 401 | ❌ 401 | ❌ 403 | ✅ | ✅ | ✅ |

### Rate Limiting

| Endpoint | Authenticated | Anonymous | Scope |
|----------|--------------|-----------|-------|
| GET run detail | 300/min | 60/min | Per user / per IP |
| GET node detail | 300/min | 60/min | Per user / per IP |
| GET step list | 300/min | 60/min | Per user / per IP |
| GET artifacts | 300/min | 60/min | Per user / per IP |
| SSE log stream | 30/min | 10/min | Per user per repo / per IP per repo |
| SSE event stream | 60/min | 20/min | Per user per repo / per IP per repo |
| Concurrent SSE connections | 10 global | 3 global | Per user / per IP |
| POST cancel | 60/min | N/A | Per user per repo |
| POST rerun | 60/min | N/A | Per user per repo |
| POST resume | 30/min | N/A | Per user per repo |
| DELETE artifact | 60/min | N/A | Per user per repo |

### Data Privacy Constraints

- Log content may contain secrets inadvertently printed by user workflows. The UI must not cache log content in local storage or service workers.
- Commit SHAs and trigger refs are considered non-sensitive metadata.
- SSE connections must validate auth on initial connection. If a session expires mid-stream, the server should close the connection; the client should prompt for re-authentication on reconnect failure.
- Artifact downloads must validate auth per request — no pre-signed URLs without expiry.
- The Mermaid graph and plan XML may contain step names that include sensitive information chosen by the user. These should not be indexed by search engines (page should have `noindex` for private repos).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Required Properties |
|------------|---------|-------------------|
| `WorkflowRunDetailViewed` | User navigates to run detail page | `run_id`, `repository_id`, `workflow_definition_id`, `run_status`, `trigger_event`, `step_count`, `referrer` (tab, search, notification, direct link) |
| `WorkflowRunDetailTabSwitched` | User switches tabs | `run_id`, `tab_name`, `previous_tab`, `time_on_previous_tab_ms` |
| `WorkflowRunStepExpanded` | User expands a step card | `run_id`, `step_id`, `step_name`, `step_status`, `step_position`, `log_line_count` |
| `WorkflowRunLogStreamConnected` | SSE log stream established | `run_id`, `repository_id`, `is_reconnection`, `last_event_id` |
| `WorkflowRunLogStreamDisconnected` | SSE log stream closed | `run_id`, `duration_seconds`, `events_received`, `disconnect_reason` (done, error, user_navigation, session_expired) |
| `WorkflowRunCancelInitiated` | User confirms cancel action | `run_id`, `repository_id`, `run_status_at_cancel`, `run_duration_at_cancel_seconds` |
| `WorkflowRunRerunInitiated` | User confirms rerun action | `run_id`, `original_run_status`, `repository_id`, `new_run_id` |
| `WorkflowRunResumeInitiated` | User confirms resume action | `run_id`, `repository_id`, `run_status_at_resume`, `completed_step_count`, `failed_step_count` |
| `WorkflowRunArtifactDownloaded` | User downloads an artifact | `run_id`, `artifact_id`, `artifact_name`, `artifact_size_bytes` |
| `WorkflowRunArtifactDeleted` | User deletes an artifact | `run_id`, `artifact_id`, `artifact_name` |
| `WorkflowRunGraphNodeClicked` | User clicks a node in the Mermaid graph | `run_id`, `step_id`, `step_name`, `step_status` |

### Funnel Metrics

1. **Run Detail Engagement Funnel**: Page View -> Tab Switch -> Step Expand -> Log Scroll (>20 lines) -> Action Taken (cancel/rerun/resume)
2. **Streaming Engagement**: SSE Connected -> Events Received -> User remained on page until `done` event
3. **Action Completion Rate**: Confirmation dialog opened -> Action confirmed -> Action succeeded
4. **Rerun Follow-Through**: Rerun initiated -> New run detail viewed -> New run reached terminal state

### Success Indicators

- **P50 time-to-first-meaningful-paint** of the run detail page < 800ms
- **SSE reconnection success rate** > 99%
- **Action error rate** (cancel/rerun/resume server errors) < 0.5%
- **Artifact download success rate** > 99.5%
- **Median session duration on run detail page** during active runs > 30s (indicates users find streaming useful)
- **Rerun follow-through rate** > 80% (users who rerun actually visit the new run)

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|
| Run detail page data loaded | `info` | `run_id`, `repository_id`, `status`, `step_count`, `duration_ms` (load time) |
| Node detail data loaded | `info` | `run_id`, `node_id`, `log_count`, `duration_ms` |
| SSE log stream opened | `info` | `run_id`, `user_id`, `last_event_id`, `is_reconnection` |
| SSE log stream event sent | `debug` | `run_id`, `event_type`, `event_id`, `step_id` |
| SSE log stream closed | `info` | `run_id`, `user_id`, `reason`, `duration_seconds`, `events_sent` |
| SSE event stream opened | `info` | `run_id`, `user_id` |
| SSE event stream closed | `info` | `run_id`, `user_id`, `reason`, `duration_seconds` |
| SSE keep-alive sent | `debug` | `run_id`, `connection_age_seconds` |
| SSE Last-Event-ID replay | `info` | `run_id`, `last_event_id`, `replayed_count` |
| Cancel action executed | `info` | `run_id`, `user_id`, `previous_status` |
| Cancel action failed | `warn` | `run_id`, `user_id`, `error`, `previous_status` |
| Rerun action executed | `info` | `run_id`, `user_id`, `new_run_id` |
| Rerun action failed | `warn` | `run_id`, `user_id`, `error` |
| Resume action executed | `info` | `run_id`, `user_id`, `reset_step_count` |
| Resume action failed | `warn` | `run_id`, `user_id`, `error`, `run_status` |
| Artifact download served | `info` | `run_id`, `artifact_id`, `size_bytes`, `user_id` |
| Artifact deleted | `info` | `run_id`, `artifact_id`, `user_id` |
| Rate limit exceeded | `warn` | `user_id`, `endpoint`, `limit`, `window` |
| Run detail 404 | `info` | `run_id`, `repository_id`, `user_id` |
| Run detail 403 | `warn` | `run_id`, `repository_id`, `user_id`, `required_access` |

### Prometheus Metrics

**Counters**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_run_detail_requests_total` | `status_code`, `repository_id` | Total run detail page API requests |
| `codeplane_workflow_run_node_detail_requests_total` | `status_code`, `repository_id` | Total node detail API requests |
| `codeplane_workflow_log_stream_connections_total` | `status` (opened, closed_done, closed_error, closed_client) | Total SSE log stream connections |
| `codeplane_workflow_event_stream_connections_total` | `status` | Total SSE event stream connections |
| `codeplane_workflow_log_stream_events_sent_total` | `event_type` (log, status, done, keepalive) | Total SSE events emitted |
| `codeplane_workflow_run_action_total` | `action` (cancel, rerun, resume), `result` (success, error) | Total run actions |
| `codeplane_workflow_artifact_downloads_total` | `repository_id` | Total artifact downloads |
| `codeplane_workflow_artifact_deletions_total` | `repository_id` | Total artifact deletions |
| `codeplane_workflow_log_replay_total` | `repository_id` | Total Last-Event-ID replays |

**Gauges**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_log_stream_active_connections` | `repository_id` | Currently open SSE log stream connections |
| `codeplane_workflow_event_stream_active_connections` | `repository_id` | Currently open SSE event stream connections |
| `codeplane_sse_pg_listen_channels_active` | — | Currently subscribed PG LISTEN channels |

**Histograms**

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_workflow_run_detail_load_duration_seconds` | `repository_id` | 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 | Time to load run detail response |
| `codeplane_workflow_node_detail_load_duration_seconds` | `repository_id` | 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 | Time to load node detail response |
| `codeplane_workflow_log_stream_connection_duration_seconds` | — | 1, 5, 15, 30, 60, 120, 300, 600 | SSE connection lifetime |
| `codeplane_workflow_log_replay_count` | — | 0, 1, 10, 50, 100, 500, 1000 | Number of entries replayed per reconnection |
| `codeplane_workflow_run_action_duration_seconds` | `action` | 0.05, 0.1, 0.25, 0.5, 1, 2.5 | Time to complete cancel/rerun/resume |

### Alerts

#### Alert: `WorkflowRunDetailHighErrorRate`
- **Condition**: `rate(codeplane_workflow_run_detail_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_workflow_run_detail_requests_total[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check `codeplane_workflow_run_detail_load_duration_seconds` for latency spikes — if P99 > 5s, likely a database issue.
  2. Check server logs for `run_detail` errors with `level=error` — look for DB connection errors, timeout errors, or serialization failures.
  3. Check PostgreSQL connection pool metrics — if exhausted, scale pool or investigate slow queries.
  4. Check if a specific `repository_id` is dominating errors — may indicate a corrupted run or oversized workflow.
  5. If isolated to Mermaid generation, check for step names with unescaped characters causing template failures.
  6. Escalate to platform team if database is healthy but errors persist.

#### Alert: `WorkflowSSEConnectionLeaks`
- **Condition**: `codeplane_workflow_log_stream_active_connections > 500` sustained for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check if active connection count correlates with active workflow runs — if not, connections are leaking.
  2. Check `codeplane_workflow_log_stream_connections_total{status="closed_done"}` — if done events aren't firing, the workflow engine may be stalled.
  3. Check PG LISTEN channel count — if growing unbounded, channels aren't being unsubscribed.
  4. Check for long-lived connections: `codeplane_workflow_log_stream_connection_duration_seconds` P99 > 600s with no done events.
  5. If confirmed leak, restart affected server instance and investigate keep-alive/cleanup scheduler.

#### Alert: `WorkflowRunDetailSlowLoads`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workflow_run_detail_load_duration_seconds_bucket[5m])) > 3`
- **Severity**: Warning
- **Runbook**:
  1. Check if specific `repository_id` labels are disproportionately slow — may be a workflow with 200 steps generating large Mermaid/XML payloads.
  2. Check database slow query logs for workflow run and step queries.
  3. Check node detail loads separately — if fast, the bottleneck is Mermaid/XML generation.
  4. Consider caching Mermaid/plan_xml for completed (terminal) runs.
  5. If generalized slowness, check database CPU and I/O metrics.

#### Alert: `WorkflowRunActionFailureRate`
- **Condition**: `rate(codeplane_workflow_run_action_total{result="error"}[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check which `action` label is failing — cancel, rerun, or resume.
  2. For cancel failures: check if runs are reaching terminal state before cancel is processed (race condition, expected at low rates).
  3. For rerun failures: check if workflow definitions are being deleted — 404 on definition lookup is the most common cause.
  4. For resume failures: check for 409 status conflicts — may indicate UI is not properly gating the button by state.
  5. Check server logs for the specific error messages.

#### Alert: `WorkflowSSEHighReconnectionRate`
- **Condition**: `rate(codeplane_workflow_log_stream_connections_total{status="opened"}[5m]) > 3 * rate(codeplane_workflow_log_stream_connections_total{status="closed_done"}[5m])`
- **Severity**: Warning
- **Runbook**:
  1. High reconnection-to-completion ratio indicates connections are dropping before runs complete.
  2. Check load balancer idle timeout — if < 15s, keep-alive may not prevent connection drops.
  3. Check for network-level TLS termination issues.
  4. Check client-side error logs for connection reset reasons.
  5. Verify keep-alive events are being sent at 15s intervals by checking `codeplane_workflow_log_stream_events_sent_total{event_type="keepalive"}`.

### Error Cases and Failure Modes

| Failure Mode | Impact | Detection | Mitigation |
|-------------|--------|-----------|------------|
| Database unavailable | Run detail returns 500 | Error rate alert, health check | Circuit breaker, retry with backoff |
| PG LISTEN channel failure | SSE events stop delivery | Active connection gauge flat while runs are active | Reconnect PG LISTEN, restart SSE manager |
| Mermaid generation OOM | Large workflows crash response | Latency histogram spike, error rate | Cap graph rendering, return fallback |
| Log query timeout | Node detail returns 500 or slow | Latency histogram, error logs | Add query timeout, paginate more aggressively |
| SSE connection dropped by proxy | Client sees disconnection | Reconnection rate spike | Ensure keep-alive < proxy idle timeout |
| Concurrent cancel race condition | Duplicate cancel attempts | Action error logs | Idempotent handling (already implemented) |
| Artifact storage unavailable | Download returns 500 | Download error rate | Retry, degrade gracefully with error message |
| Session expiry during SSE | Stream closes, client prompts | SSE closed_error counter | Client re-auth flow, reconnect |

## Verification

### API Integration Tests

#### Run Detail Endpoint

- **API-RD-001**: `GET /api/repos/:owner/:repo/workflows/runs/:id` returns 200 with `run`, `workflow`, `nodes`, `mermaid`, and `plan_xml` fields for a valid completed run
- **API-RD-002**: Response `run` object contains all required fields: `id`, `repository_id`, `workflow_definition_id`, `status`, `trigger_event`, `trigger_ref`, `trigger_commit_sha`, `started_at`, `completed_at`, `created_at`, `updated_at`
- **API-RD-003**: Response `workflow` object contains `id`, `name`, `path`
- **API-RD-004**: Response `nodes` array is ordered by `position` ascending
- **API-RD-005**: Each node contains `id`, `step_id`, `name`, `position`, `status`, `iteration`, `started_at`, `completed_at`, `duration`, `duration_seconds`
- **API-RD-006**: `duration` field formats as `Xs` for durations under 60s
- **API-RD-007**: `duration` field formats as `XmYs` for durations of 60s or more
- **API-RD-008**: `duration` is empty string when `started_at` is null (queued step)
- **API-RD-009**: `duration_seconds` is 0 when `started_at` is null
- **API-RD-010**: `mermaid` field contains valid Mermaid `graph TD` syntax
- **API-RD-011**: Mermaid graph contains one node per step, labeled N1, N2, etc.
- **API-RD-012**: Mermaid node fill colors match status: success=#22c55e, failure=#ef4444, running=#3b82f6, queued=#6b7280, cancelled=#9ca3af
- **API-RD-013**: `plan_xml` contains valid XML with `<?xml version="1.0"?>` header and `<workflow>` root element
- **API-RD-014**: Plan XML contains one `<node>` child per step with correct attributes
- **API-RD-015**: Returns 400 for non-numeric run ID (e.g., "abc")
- **API-RD-016**: Returns 400 for zero run ID
- **API-RD-017**: Returns 400 for negative run ID
- **API-RD-018**: Returns 400 for floating-point run ID (e.g., "42.5")
- **API-RD-019**: Returns 400 for run ID exceeding int64 max (9223372036854775808)
- **API-RD-020**: Returns 404 for non-existent run ID
- **API-RD-021**: Returns 404 when run exists in different repository
- **API-RD-022**: Returns 401 for unauthenticated request to private repo
- **API-RD-023**: Returns 403 for user without repository read access
- **API-RD-024**: Returns 200 for anonymous request to public repo
- **API-RD-025**: Run with zero steps returns empty `nodes` array, minimal `mermaid`, and XML with no `<node>` children
- **API-RD-026**: Run with 200 steps returns all 200 nodes in correct order
- **API-RD-027**: Step names containing special characters (pipes `|`, quotes `"`, angle brackets `<>`) are properly escaped in Mermaid and XML
- **API-RD-028**: Step names containing emoji, CJK, and RTL characters render correctly in response
- **API-RD-029**: Step names at maximum length (255 characters) are returned in full
- **API-RD-030**: When workflow definition is deleted, run detail returns 404 for the definition but still includes run data (or returns 404 per current spec)
- **API-RD-031**: Run with maximum valid ID (2^63-1) returns correctly if it exists

#### Node Detail Endpoint

- **API-ND-001**: `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId` returns 200 with `run_id`, `node`, `logs`, `output`, `plan_xml`, `mermaid` for valid numeric node ID
- **API-ND-002**: Node resolved by numeric ID matches step with that `id`
- **API-ND-003**: Node resolved by name string matches case-insensitively
- **API-ND-004**: When nodeId is a number that also matches a step name, numeric ID match takes precedence
- **API-ND-005**: Logs array contains entries with `id`, `sequence`, `stream`, `entry`, `created_at`
- **API-ND-006**: Logs are ordered by `sequence` ascending
- **API-ND-007**: Logs are filtered to only the requested step
- **API-ND-008**: Log count is capped at 10,000 entries per request
- **API-ND-009**: Step with exactly 10,000 log entries returns all 10,000
- **API-ND-010**: Step with 10,001 log entries returns exactly 10,000
- **API-ND-011**: Step with zero logs returns empty `logs` array
- **API-ND-012**: Log entries with ANSI escape sequences are returned as-is (not stripped)
- **API-ND-013**: Log entries at maximum length (65,536 characters) are returned in full
- **API-ND-014**: Log `stream` field is exactly `"stdout"` or `"stderr"`
- **API-ND-015**: Returns 400 for empty or whitespace-only node ID
- **API-ND-016**: Returns 404 for non-existent node ID
- **API-ND-017**: Returns 404 when run has zero steps and any node is requested
- **API-ND-018**: Duplicate step names: first match by position order is returned
- **API-ND-019**: `output` field is null
- **API-ND-020**: Mermaid graph highlights the requested node

#### Log Stream SSE Endpoint

- **API-LS-001**: `GET /api/repos/:owner/:repo/runs/:id/logs` returns `Content-Type: text/event-stream` for active run
- **API-LS-002**: First event is `status` type with run and steps data
- **API-LS-003**: Log events contain `log_id`, `step`, `line`, `content`, `stream` fields
- **API-LS-004**: `done` event is emitted when run reaches terminal state
- **API-LS-005**: Connection closes after `done` event
- **API-LS-006**: For already-terminal run, emits `status` and `done` events immediately and closes
- **API-LS-007**: `Last-Event-ID` header triggers replay of missed events
- **API-LS-008**: Replay is capped at 1,000 entries
- **API-LS-009**: Invalid `Last-Event-ID` (non-numeric, negative) is silently ignored
- **API-LS-010**: Keep-alive comments are sent every 15 seconds
- **API-LS-011**: Returns 400 for invalid run ID
- **API-LS-012**: Returns 404 for non-existent run
- **API-LS-013**: Returns 429 when rate limit exceeded, with `Retry-After` header
- **API-LS-014**: Multiple concurrent SSE connections to the same run work independently
- **API-LS-015**: Log events have monotonically increasing `id` fields suitable for `Last-Event-ID`

#### Event Stream SSE Endpoint

- **API-ES-001**: `GET /api/repos/:owner/:repo/workflows/runs/:id/events` returns `text/event-stream`
- **API-ES-002**: Only emits `status` and `done` events (no `log` events)
- **API-ES-003**: Initial `status` event emitted on connection
- **API-ES-004**: `done` event emitted on terminal state, connection closes
- **API-ES-005**: For terminal run, emits `status` + `done` immediately
- **API-ES-006**: Keep-alive every 15 seconds

#### Action Endpoints

- **API-CA-001**: `POST .../cancel` returns 204 for running run
- **API-CA-002**: `POST .../cancel` returns 204 for queued run
- **API-CA-003**: `POST .../cancel` returns 204 idempotently for already-cancelled run
- **API-CA-004**: `POST .../cancel` returns 403 for read-only user
- **API-CA-005**: `POST .../cancel` returns 401 for anonymous user on private repo
- **API-CA-006**: `POST .../cancel` returns 400 for invalid run ID
- **API-CA-007**: `POST .../cancel` returns 404 for non-existent run

- **API-RR-001**: `POST .../rerun` returns 201 with `workflow_definition_id`, `workflow_run_id`, `steps` for terminal run
- **API-RR-002**: New `workflow_run_id` is strictly greater than original
- **API-RR-003**: New run preserves `trigger_event`, `trigger_ref`, `trigger_commit_sha`
- **API-RR-004**: New run preserves `dispatch_inputs` including nested objects, arrays, null, empty strings, and Unicode
- **API-RR-005**: Returns 404 when workflow definition has been deleted
- **API-RR-006**: Returns 403 for read-only user
- **API-RR-007**: Rerun of a rerun works correctly (chain depth >= 3)
- **API-RR-008**: Multiple reruns of the same original create independent runs

- **API-RE-001**: `POST .../resume` returns 204 for cancelled run
- **API-RE-002**: `POST .../resume` returns 204 for failed run
- **API-RE-003**: `POST .../resume` returns 409 for running run with descriptive message
- **API-RE-004**: `POST .../resume` returns 409 for queued run
- **API-RE-005**: `POST .../resume` returns 409 for successful run
- **API-RE-006**: Resumed run transitions to `queued` status
- **API-RE-007**: Successful steps are preserved after resume
- **API-RE-008**: Failed/cancelled steps are reset to `queued` after resume
- **API-RE-009**: Returns 403 for read-only user

#### Artifact Endpoints

- **API-AF-001**: `GET .../artifacts` returns list of artifacts with `name`, `size`, `created_at`
- **API-AF-002**: `DELETE .../artifacts/:id` returns 204 for write-access user
- **API-AF-003**: `DELETE .../artifacts/:id` returns 403 for read-only user
- **API-AF-004**: `DELETE .../artifacts/:id` returns 404 for non-existent artifact

### Playwright (Web UI) E2E Tests

#### Page Loading and Layout

- **E2E-UI-001**: Navigate to `/:owner/:repo/workflows/runs/:runId` and verify page renders with header, tabs, and step list
- **E2E-UI-002**: Verify breadcrumb shows correct hierarchy: repo > Workflows > workflow name > Run #N
- **E2E-UI-003**: Verify page title contains run number and workflow name
- **E2E-UI-004**: Verify status badge color matches run status (success=green, failure=red, running=blue, queued=gray, cancelled=gray, timeout=orange)
- **E2E-UI-005**: Verify status badge animates/pulses for `running` status
- **E2E-UI-006**: Verify duration displays in correct format (Xs, XmYs)
- **E2E-UI-007**: Verify trigger info shows event type, ref, and truncated commit SHA
- **E2E-UI-008**: Verify commit SHA is truncated to 7 characters and is clickable
- **E2E-UI-009**: Verify the page loads correctly when accessed via direct URL (deep link)

#### Action Buttons

- **E2E-UI-010**: For a running run, verify Cancel button is visible and Rerun/Resume are hidden
- **E2E-UI-011**: For a successful run, verify Rerun button is visible and Cancel/Resume are hidden
- **E2E-UI-012**: For a failed run, verify Rerun and Resume buttons are visible and Cancel is hidden
- **E2E-UI-013**: For a cancelled run, verify Rerun and Resume buttons are visible and Cancel is hidden
- **E2E-UI-014**: Click Cancel -> confirmation dialog appears -> confirm -> status changes to Cancelled
- **E2E-UI-015**: Click Cancel -> confirmation dialog appears -> dismiss -> no state change
- **E2E-UI-016**: Click Rerun -> confirmation dialog -> confirm -> navigated to new run detail page with incremented run ID
- **E2E-UI-017**: Click Resume -> confirmation dialog -> confirm -> status changes to Queued
- **E2E-UI-018**: For a read-only user, verify no action buttons are visible

#### Graph Tab

- **E2E-UI-019**: Verify Graph tab renders Mermaid diagram with correct number of nodes
- **E2E-UI-020**: Verify graph node colors match step statuses
- **E2E-UI-021**: Click a node in the graph -> switches to Steps tab and highlights/scrolls to that step
- **E2E-UI-022**: Verify graph handles run with zero steps (shows empty state message)
- **E2E-UI-023**: Verify graph handles run with 50+ steps (zoom/pan controls appear)

#### Steps Tab

- **E2E-UI-024**: Verify all steps are listed in position order
- **E2E-UI-025**: Verify each step shows name, position, status icon, and duration
- **E2E-UI-026**: Click to expand a step -> log viewer appears with log content
- **E2E-UI-027**: Verify log viewer shows line numbers
- **E2E-UI-028**: Verify log viewer renders ANSI colors (verify styled elements exist for colored text)
- **E2E-UI-029**: Verify stderr lines have red left border
- **E2E-UI-030**: Click to collapse an expanded step -> log viewer disappears
- **E2E-UI-031**: Verify step name longer than display width is truncated with tooltip
- **E2E-UI-032**: Verify step with zero logs shows empty log viewer with "No output" message
- **E2E-UI-033**: Verify step with special characters in name renders correctly

#### Real-Time Streaming (Active Run)

- **E2E-UI-034**: Navigate to detail page of a running run -> verify new log lines appear in real time
- **E2E-UI-035**: Verify auto-scroll follows new log lines for running step
- **E2E-UI-036**: Toggle auto-scroll off -> verify "Jump to bottom" indicator appears when new logs arrive
- **E2E-UI-037**: Verify status badge updates in real time when run completes
- **E2E-UI-038**: Verify step status icons update in real time as steps transition
- **E2E-UI-039**: Verify graph node colors update in real time (if graph tab is visible)
- **E2E-UI-040**: Verify connection indicator shows green dot during active SSE connection
- **E2E-UI-041**: Simulate network disconnect -> verify reconnecting indicator appears -> verify reconnection succeeds

#### Artifacts Tab

- **E2E-UI-042**: Verify Artifacts tab shows list of artifacts with name, size, and timestamp
- **E2E-UI-043**: Click Download on an artifact -> verify file download initiates
- **E2E-UI-044**: As write-access user, click Delete -> confirmation dialog -> confirm -> artifact removed from list
- **E2E-UI-045**: As read-only user, verify Delete button is not visible
- **E2E-UI-046**: Verify empty state message when run has no artifacts

#### Logs Tab (Unified)

- **E2E-UI-047**: Verify unified Logs tab shows interleaved output from all steps
- **E2E-UI-048**: Verify each line is prefixed with step name
- **E2E-UI-049**: Verify step filter dropdown filters logs to selected step(s)

#### Error States

- **E2E-UI-050**: Navigate to non-existent run ID -> verify "Run not found" error page
- **E2E-UI-051**: Navigate to invalid run ID (e.g., "abc") -> verify error page
- **E2E-UI-052**: Navigate to run in repository user lacks access to -> verify 403 error page
- **E2E-UI-053**: Verify run with deleted workflow definition shows "(deleted)" indicator

#### Responsive Design

- **E2E-UI-054**: At viewport 1280px+ -> verify full layout renders
- **E2E-UI-055**: At viewport 768px -> verify stacked layout renders correctly
- **E2E-UI-056**: At viewport 375px (mobile) -> verify compact layout, scrollable graph, full-width log viewer

#### Tab Navigation and URL State

- **E2E-UI-057**: Click each tab -> verify URL hash updates (`#graph`, `#steps`, `#artifacts`, `#logs`)
- **E2E-UI-058**: Navigate directly to URL with `#artifacts` hash -> verify Artifacts tab is active
- **E2E-UI-059**: Browser back/forward navigates between tabs correctly

### CLI E2E Tests

- **E2E-CLI-001**: `codeplane run view <id>` outputs formatted run detail with status, duration, workflow name, and step list
- **E2E-CLI-002**: `codeplane run view <id> --json` outputs valid JSON matching the API response shape
- **E2E-CLI-003**: `codeplane run view <id> --node <nodeId>` outputs node detail with logs
- **E2E-CLI-004**: `codeplane run view <id> --node <nodeId> --json` outputs valid JSON node detail
- **E2E-CLI-005**: `codeplane run logs <id>` streams log output to stderr for active run
- **E2E-CLI-006**: `codeplane run logs <id>` outputs all logs and exits for terminal run
- **E2E-CLI-007**: `codeplane run logs <id> --step <name>` filters logs to the specified step
- **E2E-CLI-008**: `codeplane run watch <id>` displays status, streams logs, and exits when run completes
- **E2E-CLI-009**: `codeplane run cancel <id>` cancels a running run and outputs confirmation
- **E2E-CLI-010**: `codeplane run cancel <id> --json` outputs JSON with cancelled status
- **E2E-CLI-011**: `codeplane run rerun <id>` triggers rerun and outputs new run ID
- **E2E-CLI-012**: `codeplane run rerun <id> --json` outputs JSON with new run details
- **E2E-CLI-013**: `codeplane run resume <id>` resumes a failed run and outputs confirmation
- **E2E-CLI-014**: `codeplane run resume <id> --json` outputs JSON with resumed status
- **E2E-CLI-015**: `codeplane run view <invalid>` exits with error code and descriptive message
- **E2E-CLI-016**: `codeplane run cancel <id>` on terminal run outputs "Run is not active" message
- **E2E-CLI-017**: `codeplane run resume <id>` on successful run outputs state conflict message

### TUI E2E Tests

- **E2E-TUI-001**: Navigate to Workflow Run Detail screen -> verify header shows run number, workflow name, status, duration
- **E2E-TUI-002**: Verify step list is scrollable with `j`/`k` keys
- **E2E-TUI-003**: Press `Enter` on a step -> verify log panel expands
- **E2E-TUI-004**: Press `l` on a focused step -> verify full-screen log viewer opens
- **E2E-TUI-005**: Press `c` on a running run -> verify confirmation overlay -> confirm -> status updates
- **E2E-TUI-006**: Press `r` on a terminal run -> verify confirmation overlay -> confirm -> navigate to new run
- **E2E-TUI-007**: Press `R` on a failed run -> verify confirmation overlay -> confirm -> status updates to queued
- **E2E-TUI-008**: Press `c` on a terminal run -> verify "Run is not active" flash message
- **E2E-TUI-009**: Press `q` -> verify navigation back to run list
- **E2E-TUI-010**: Verify connection indicator reflects SSE state
- **E2E-TUI-011**: Verify run with zero steps shows empty step list message
- **E2E-TUI-012**: Press `f` -> verify auto-follow toggle state changes

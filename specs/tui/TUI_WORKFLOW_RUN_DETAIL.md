# TUI_WORKFLOW_RUN_DETAIL

Specification for TUI_WORKFLOW_RUN_DETAIL.

## High-Level User POV

The Workflow Run Detail screen is the primary inspection surface for a single workflow run in the Codeplane TUI. It gives developers a complete picture of a running or completed workflow execution — its status, steps, logs, duration, trigger metadata, and available actions — without leaving the terminal. The screen is reached by pressing `Enter` on a focused run in the workflow run list, by navigating via the command palette (`:run <id>`), or by deep-linking with `codeplane tui --screen workflow-run --repo owner/repo --run 42`.

When the screen loads, the developer sees a vertically structured detail view divided into three logical sections. The top section is a metadata header showing the run's identity and state at a glance: the workflow name, run number (e.g., "#42"), status badge (colored: ✓ success in green, ✗ failure in red, ◎ running as animated spinner in yellow, ◌ queued in gray, ✕ cancelled in muted, ⏱ timeout in yellow), trigger event (e.g., "push to main"), commit SHA (abbreviated to 7 chars), the triggering ref, and timing information (started, duration or elapsed time, completed). For manually dispatched runs, any dispatch input parameters are shown in a collapsed section expandable with `e`.

Below the header is the step list — a vertically stacked list of workflow steps (also called "nodes") showing each step's name, status icon, and duration. The focused step is highlighted with reverse video. Steps are ordered by their position in the workflow DAG. The step list acts as the primary navigation surface: pressing `Enter` on a focused step expands its log output inline below the step row, and pressing `Enter` again collapses it. Pressing `l` on a focused step opens a full-screen log viewer for that step. The step statuses update in real-time via SSE when the run is active.

The bottom section is the log panel. When a step is selected and expanded, its log output streams directly below the step row within the scrollbox. Log lines render incrementally as they arrive via SSE, with ANSI color codes passed through to the terminal. Each log line is prefixed with a line number in muted color. Stderr output is shown with a red left border. The log panel auto-scrolls to follow new output by default; pressing `f` toggles auto-follow on and off (indicated in the status bar). When a run is in a terminal state (success, failure, cancelled, timeout), all logs are loaded from the API and rendered statically.

The status bar shows context-sensitive keybinding hints: `j/k:steps Enter:expand l:logs c:cancel r:rerun R:resume f:follow q:back`. Actions are available based on run state: `c` to cancel (only while running/queued), `r` to rerun (only when terminal), `R` to resume (only when cancelled or failed). Each action shows a confirmation overlay before executing. The header breadcrumb reads "Dashboard > owner/repo > Workflows > workflow-name > #42".

The screen supports live SSE streaming: when viewing an in-progress run, step statuses animate between states, log lines appear in real-time, and the run header updates its elapsed time every second. When the run completes, the SSE connection closes, the final status is shown, and the duration is finalized. If the SSE connection drops, the status bar shows a disconnection indicator and the TUI auto-reconnects with exponential backoff, replaying missed events via Last-Event-ID.

## Acceptance Criteria

### Definition of Done
- [ ] The Workflow Run Detail screen renders as a full-screen view between header and status bars
- [ ] The screen is reachable via `Enter` on a run in the workflow run list, `:run <id>` command palette, and `--screen workflow-run --repo owner/repo --run <id>` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Workflows > {workflow-name} > #{run-number}"
- [ ] Pressing `q` pops the screen and returns to the workflow run list (or previous screen)
- [ ] Run metadata is fetched via `useWorkflowRunDetail()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/workflows/runs/:id`
- [ ] The response includes `run`, `workflow`, `nodes`, `mermaid`, and `plan_xml` fields
- [ ] Step list shows all nodes from the response, ordered by `position`
- [ ] Each step row displays: status icon (colored), step name, iteration number (if > 1), and duration
- [ ] Run status badge uses correct glyph and color per status (success/failure/running/queued/cancelled/timeout)
- [ ] SSE streaming connects to `GET /api/repos/:owner/:repo/runs/:id/logs` for live runs
- [ ] SSE log events render incrementally in the expanded step's log section
- [ ] SSE status events update step statuses and run status in real-time
- [ ] SSE done event finalizes the display (status, duration, stop auto-scroll)
- [ ] Auto-follow mode scrolls to latest log line by default (toggleable with `f`)
- [ ] ANSI color codes in log content are passed through to the terminal renderer
- [ ] Cancel, rerun, and resume actions call the correct API endpoints with confirmation
- [ ] Actions are state-gated: cancel only for running/queued, rerun only for terminal, resume only for cancelled/failed

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next step
- [ ] `k` / `Up`: Move focus to previous step
- [ ] `Enter`: Toggle expand/collapse log output for focused step
- [ ] `l`: Open full-screen log viewer for focused step
- [ ] `c`: Cancel run (running/queued only, shows confirmation overlay)
- [ ] `r`: Rerun workflow (terminal states only, shows confirmation overlay)
- [ ] `R`: Resume run (cancelled/failed only, shows confirmation overlay)
- [ ] `f`: Toggle auto-follow for log streaming
- [ ] `e`: Toggle dispatch inputs section visibility (only for manually dispatched runs)
- [ ] `G`: Jump to last step
- [ ] `g g`: Jump to first step
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up within scrollbox
- [ ] `Esc`: Close overlay → collapse expanded step → pop screen (context-dependent priority)
- [ ] `q`: Pop screen (when not in overlay)
- [ ] `?`: Toggle help overlay

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Compact header (run # + status + elapsed on one line), step list shows name + status icon only, log line numbers hidden, duration hidden from steps
- [ ] 120×40 – 199×59: Full header with trigger info and commit SHA, step list shows name + status + duration, log line numbers visible, timing details shown
- [ ] 200×60+: Full header with dispatch inputs inline (if present), wider step names (40ch), log panel shows step name + stream type in gutter

### Truncation & Boundary Constraints
- [ ] Workflow name in header: truncated at 40ch with `…`
- [ ] Step name: truncated at remaining width minus status/duration columns, with `…`
- [ ] Commit SHA: always exactly 7 characters (abbreviated)
- [ ] Trigger ref: truncated at 30ch with `…`
- [ ] Duration: formatted as "1s", "45s", "1m 23s", "2h 5m", max 8ch
- [ ] Elapsed time (running): updates every second, same format as duration
- [ ] Log lines: no truncation — horizontal scroll within scrollbox
- [ ] Log line numbers: right-aligned, max 6 digits (999999 lines)
- [ ] Dispatch input keys: max 30ch, values max 50ch with `…`
- [ ] Step list: no pagination cap — all nodes rendered (typically <50 steps)
- [ ] Log buffer: max 10,000 lines per step in memory; older lines evicted FIFO

### Edge Cases
- [ ] Terminal resize while logs are streaming: layout re-renders, scroll position preserved, SSE uninterrupted
- [ ] Rapid j/k through steps: sequential, no debounce, one step per keypress
- [ ] Enter on already-expanded step: collapses it
- [ ] Enter on step with no logs yet (queued/pending): shows "Waiting for logs…" placeholder
- [ ] SSE disconnect during streaming: status bar shows "Disconnected", auto-reconnect with backoff, replay via Last-Event-ID
- [ ] SSE reconnect: missed log events replayed, no duplicate lines (dedup by log_id)
- [ ] Run completes while viewing: status updates, duration finalizes, action buttons change
- [ ] Cancel on already-cancelled run: no-op, status bar shows "Run is already cancelled"
- [ ] Rerun on running run: no-op, status bar shows "Run is still in progress"
- [ ] Resume on successful run: no-op, status bar shows "Run completed successfully"
- [ ] Network error on action: confirmation overlay shows error, user can retry or dismiss
- [ ] Unicode in step names: truncation respects grapheme clusters
- [ ] Null/missing fields: rendered as "—", no "null" text
- [ ] Step with zero duration (skipped): shows "skipped" in muted color instead of duration
- [ ] Extremely long log lines (1000+ chars): horizontal scrollable, no wrapping
- [ ] Empty log output for completed step: shows "No output" in muted
- [ ] Multiple steps expanded simultaneously: all render inline, scrollbox accommodates
- [ ] Run with dispatch_inputs: `e` shows/hides input section; null dispatch_inputs: `e` is no-op
- [ ] Concurrent resize + SSE event: both handled independently, no dropped events

## Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows > ci > #42          │
├─────────────────────────────────────────────────────────────────┤
│ ◎ Running  #42  ci                                              │
│ push to main  abc1234  started 2m ago  elapsed 1m 45s           │
├─────────────────────────────────────────────────────────────────┤
│ ✓ setup           12s                                           │
│ ◎ build           1m 23s  ← focused                             │
│ │ 1  Installing dependencies…                                   │
│ │ 2  Compiling src/index.ts…                                    │
│ │ 3  Build output: 42 modules                                   │
│ │ …streaming…                                                   │
│ ◌ test            —                                             │
│ ◌ deploy          —                                             │
├─────────────────────────────────────────────────────────────────┤
│ j/k:steps Enter:expand l:logs c:cancel f:follow q:back         │
└─────────────────────────────────────────────────────────────────┘
```

### Components Used

- `<box>` — Vertical/horizontal flexbox containers for header, step rows, log sections, action overlays
- `<scrollbox>` — Main scrollable area containing step list and inline log panels
- `<text>` — Status badges, step names, durations, metadata labels, log line numbers, timestamps
- `<code>` — Log output rendering with ANSI passthrough

### Run Header Section

The header uses two `<box>` rows. The first row shows the run status icon (colored per status), status label, run number in bold, and workflow name. The second row shows trigger event and ref in muted color, abbreviated commit SHA (7ch), relative start time, and duration/elapsed time. For running workflows, elapsed time updates every second via `useTimeline()`. Colors: status icon uses the semantic status color (green/red/yellow/gray); all metadata text uses muted (ANSI 245).

### Step List

Rendered inside a `<scrollbox>` with vertical `<box>` layout. Each step is a `<box flexDirection="column">` containing: (1) a step row `<box flexDirection="row">` with status icon, name, and duration; (2) conditionally, an expanded log panel below. The focused step row uses reverse video with primary color (ANSI 33). Steps are ordered by `position` from the API response.

### Step Status Icons & Colors

| Status | Icon | ANSI Color |
|--------|------|------------|
| success | `✓` | Green (34) |
| failure | `✗` | Red (196) |
| running | `◎` | Yellow (178) — animated |
| pending | `◌` | Gray (245) |
| skipped | `⊘` | Gray (240) |

### Log Panel (inline)

Rendered below an expanded step row with `paddingLeft={2}` and a left border (`borderLeft="single"` in default border color; `borderColor="error"` for stderr lines). Each log line is a `<box flexDirection="row">` with a right-aligned line number `<text color="muted">` and log content `<code>` for ANSI passthrough. A "…streaming…" indicator in muted color appears at the bottom during active SSE streaming. Empty completed steps show "No output" in muted. Pending steps show "Waiting for logs…" in muted.

### Confirmation Overlay

Centered modal `<box position="absolute" top="center" left="center" width="40%" height="20%" border="single" borderColor="primary">` with action label ("Cancel run #42?", "Rerun run #42?", "Resume run #42?"), workflow name in muted, and Confirm/Cancel buttons. During API call, shows spinner. On error, shows error message with retry option. `Esc` dismisses. Focus trapped within modal.

### Dispatch Inputs Section

Toggled by `e`. Rendered between header and step list with `borderTop="single"`. Shows "Dispatch Inputs" label in bold muted, followed by key-value pairs: key in primary color (truncated 30ch), value in default color (truncated 50ch). Hidden by default; shown as overlay at 80×24.

### Keybindings

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Next step | Step list focused |
| `k` / `Up` | Previous step | Step list focused |
| `Enter` | Toggle expand/collapse step logs | Step focused |
| `l` | Open full-screen log viewer | Step focused |
| `c` | Cancel run | Run is running or queued |
| `r` | Rerun workflow | Run is in terminal state |
| `R` | Resume run | Run is cancelled or failed |
| `f` | Toggle auto-follow | Logs are streaming |
| `e` | Toggle dispatch inputs | Run has dispatch_inputs |
| `G` | Jump to last step | Step list focused |
| `g g` | Jump to first step | Step list focused |
| `Ctrl+D` | Page down | Scrollbox |
| `Ctrl+U` | Page up | Scrollbox |
| `Esc` | Close overlay → collapse expanded → pop | Priority chain |
| `q` | Pop screen | Not in overlay |
| `?` | Toggle help overlay | Always |

### Responsive Behavior

**80×24 (minimum)**: Compact single-line header: `◎ #42 ci  1m 45s`. Step rows show icon (2ch) + name (fill−2) only. Log lines show no line numbers. Duration column hidden. Confirmation overlay uses 90% width. Dispatch inputs section hidden (use `e` to show as overlay instead).

**120×40 (standard)**: Full two-line header with trigger, SHA, timing. Step rows show icon (2ch) + name (30ch) + duration (8ch). Log lines show line numbers (6ch). Confirmation overlay at 40% width.

**200×60 (large)**: Full header with dispatch inputs shown inline when present. Step rows: icon (2ch) + name (40ch) + iteration (4ch) + duration (8ch). Log panel shows step name in left gutter. Wider confirmation overlay with more context.

Resize triggers synchronous re-layout. Focused step preserved. SSE streaming uninterrupted. Expanded step logs re-render at new width.

### Data Hooks

- `useWorkflowRunDetail(repo, runId)` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/workflows/runs/:id` — returns run metadata, workflow info, nodes, mermaid, plan_xml
- `useWorkflowRunLogs(repo, runId, stepId)` from `@codeplane/ui-core` → fetched on step expand via `GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId`
- `useSSE("workflow_run_logs")` from SSE context → `GET /api/repos/:owner/:repo/runs/:id/logs` — live log/status/done events for active runs
- `useWorkflowRunCancel(repo, runId)` → `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel`
- `useWorkflowRunRerun(repo, runId)` → `POST /api/repos/:owner/:repo/workflows/runs/:id/rerun`
- `useWorkflowRunResume(repo, runId)` → `POST /api/repos/:owner/:repo/workflows/runs/:id/resume`
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI navigation
- `useTimeline()` from `@opentui/react` — for elapsed time animation (1s tick)

### Navigation

- `l` → `push("workflow-log-viewer", { repo, runId, stepId, stepName })`
- `q` → `pop()`
- `r` (rerun confirm) → after success, `push("workflow-run-detail", { repo, runId: newRunId })`
- `R` (resume confirm) → stays on same screen, SSE reconnects for resumed run

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View run detail (public repo) | ✅ | ✅ | ✅ | ✅ |
| View run detail (private repo) | ❌ | ✅ | ✅ | ✅ |
| View step logs | Same as view | ✅ | ✅ | ✅ |
| Cancel run | ❌ | ❌ | ✅ | ✅ |
| Rerun workflow | ❌ | ❌ | ✅ | ✅ |
| Resume run | ❌ | ❌ | ✅ | ✅ |

- The screen requires repository context. Repository context is enforced at navigation level
- `GET /api/repos/:owner/:repo/workflows/runs/:id` respects repository visibility
- Action endpoints (cancel, rerun, resume) require write access. Read-only users see the keybinding hints dimmed (ANSI 245) and receive "Permission denied" in the status bar on action attempt
- The `c`, `r`, `R` keybinding hints are shown dimmed for users without write access

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- SSE connections use ticket-based auth: a short-lived ticket is obtained via the auth API and passed as a query parameter to the SSE endpoint
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen

### Rate Limiting
- 300 req/min for `GET` endpoints (run detail, node detail)
- 60 req/min for `POST` action endpoints (cancel, rerun, resume)
- SSE connections are long-lived and not subject to per-request rate limiting
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` to retry after waiting

### Input Sanitization
- Run ID is a numeric path parameter — validated as positive integer before API call
- Step ID is a numeric path parameter — validated as positive integer
- No user-entered text reaches the API on this screen
- Log content, step names, and workflow names rendered as plain `<text>` or `<code>` (no injection vector in terminal)
- SSE event data is JSON-parsed with try/catch; malformed events are silently dropped

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workflow_run.view` | Screen mounted, data loaded | `repo`, `run_id`, `workflow_id`, `workflow_name`, `run_status`, `trigger_event`, `step_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method`, `is_live` |
| `tui.workflow_run.step_expand` | Enter on step | `repo`, `run_id`, `step_id`, `step_name`, `step_status`, `step_position`, `is_first_expand` |
| `tui.workflow_run.step_collapse` | Enter on expanded step | `repo`, `run_id`, `step_id`, `step_name` |
| `tui.workflow_run.log_viewer_open` | Press l | `repo`, `run_id`, `step_id`, `step_name`, `step_status`, `log_line_count` |
| `tui.workflow_run.cancel` | Confirm cancel | `repo`, `run_id`, `workflow_name`, `success`, `action_time_ms` |
| `tui.workflow_run.cancel_denied` | 403 on cancel | `repo`, `run_id`, `workflow_name` |
| `tui.workflow_run.rerun` | Confirm rerun | `repo`, `run_id`, `workflow_name`, `success`, `action_time_ms`, `new_run_id` |
| `tui.workflow_run.rerun_denied` | 403 on rerun | `repo`, `run_id`, `workflow_name` |
| `tui.workflow_run.resume` | Confirm resume | `repo`, `run_id`, `workflow_name`, `success`, `action_time_ms` |
| `tui.workflow_run.resume_denied` | 403 on resume | `repo`, `run_id`, `workflow_name` |
| `tui.workflow_run.follow_toggle` | Press f | `repo`, `run_id`, `auto_follow_enabled` |
| `tui.workflow_run.dispatch_inputs_toggle` | Press e | `repo`, `run_id`, `visible` |
| `tui.workflow_run.sse_connect` | SSE connection established | `repo`, `run_id` |
| `tui.workflow_run.sse_disconnect` | SSE connection lost | `repo`, `run_id`, `duration_ms`, `was_intentional` |
| `tui.workflow_run.sse_reconnect` | SSE reconnection successful | `repo`, `run_id`, `attempt_number`, `backoff_ms` |
| `tui.workflow_run.run_completed` | Run transitions to terminal state while viewing | `repo`, `run_id`, `final_status`, `total_duration_s`, `view_duration_ms` |
| `tui.workflow_run.error` | API failure | `repo`, `run_id`, `error_type`, `http_status`, `request_type` |
| `tui.workflow_run.data_load_time` | All initial data loaded | `repo`, `run_id`, `detail_ms`, `total_ms` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Step expand rate | >70% of views |
| Log viewer open rate | >30% of views with expanded steps |
| Action usage (cancel/rerun/resume) | >15% of views on actionable runs |
| Action success rate | >95% of attempts |
| SSE connection stability | >99% uptime during active run viewing |
| SSE reconnect success rate | >95% |
| Error rate | <2% |
| Time to first log line (live runs) | <1s |
| Time to interactive | <2s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `WorkflowRunDetail: mounted [repo={r}] [run_id={id}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `WorkflowRunDetail: loaded [repo={r}] [run_id={id}] [status={s}] [steps={n}] [duration={ms}ms]` |
| `debug` | Step expanded | `WorkflowRunDetail: step expanded [repo={r}] [run_id={id}] [step_id={sid}] [name={name}]` |
| `debug` | Step collapsed | `WorkflowRunDetail: step collapsed [repo={r}] [run_id={id}] [step_id={sid}]` |
| `debug` | Follow toggled | `WorkflowRunDetail: follow toggled [repo={r}] [run_id={id}] [enabled={bool}]` |
| `debug` | SSE event received | `WorkflowRunDetail: sse event [repo={r}] [run_id={id}] [type={t}] [step={sid}]` |
| `info` | Fully loaded | `WorkflowRunDetail: ready [repo={r}] [run_id={id}] [steps={n}] [total_ms={ms}]` |
| `info` | Action initiated | `WorkflowRunDetail: action [repo={r}] [run_id={id}] [action={cancel|rerun|resume}]` |
| `info` | Action completed | `WorkflowRunDetail: action completed [repo={r}] [run_id={id}] [action={a}] [success={bool}] [duration={ms}ms]` |
| `info` | Run completed (live) | `WorkflowRunDetail: run completed [repo={r}] [run_id={id}] [status={s}] [duration={d}]` |
| `info` | SSE connected | `WorkflowRunDetail: sse connected [repo={r}] [run_id={id}]` |
| `warn` | Fetch failed | `WorkflowRunDetail: fetch failed [repo={r}] [run_id={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `WorkflowRunDetail: rate limited [repo={r}] [run_id={id}] [retry_after={s}]` |
| `warn` | Action failed | `WorkflowRunDetail: action failed [repo={r}] [run_id={id}] [action={a}] [status={code}] [error={msg}]` |
| `warn` | SSE disconnected | `WorkflowRunDetail: sse disconnected [repo={r}] [run_id={id}] [duration={ms}ms]` |
| `warn` | SSE reconnecting | `WorkflowRunDetail: sse reconnecting [repo={r}] [run_id={id}] [attempt={n}] [backoff={ms}ms]` |
| `warn` | Slow load (>3s) | `WorkflowRunDetail: slow load [repo={r}] [run_id={id}] [duration={ms}ms]` |
| `warn` | Log buffer eviction | `WorkflowRunDetail: log eviction [repo={r}] [run_id={id}] [step_id={sid}] [evicted={n}] [total={m}]` |
| `error` | Auth error | `WorkflowRunDetail: auth error [repo={r}] [run_id={id}] [status=401]` |
| `error` | Permission denied | `WorkflowRunDetail: permission denied [repo={r}] [run_id={id}] [action={a}]` |
| `error` | Render error | `WorkflowRunDetail: render error [repo={r}] [run_id={id}] [error={msg}]` |
| `error` | SSE parse error | `WorkflowRunDetail: sse parse error [repo={r}] [run_id={id}] [raw={data}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during log streaming | Layout re-renders; SSE continues; scroll position preserved | Independent |
| Resize with confirmation overlay open | Overlay resizes proportionally (min 30ch width, fallback to 90% at <80ch) | Synchronous |
| SSE disconnect during streaming | Status bar shows "⚡ Disconnected"; auto-reconnect 1s/2s/4s/8s…30s backoff; replay via Last-Event-ID | Automatic |
| SSE reconnect with missed events | Missed logs replayed; dedup by log_id prevents duplicates | Automatic |
| SSE malformed event | Event silently dropped; warning logged; stream continues | Automatic |
| Auth expiry during SSE | SSE closes; next API call → 401 → auth error screen | Re-auth via CLI |
| Auth expiry on action | Confirmation overlay shows error → dismiss → auth error screen | Re-auth via CLI |
| Network timeout (30s) on initial load | Loading → error state + "Press R to retry" | User retries |
| Network timeout on action | Confirmation overlay shows "Request timed out" + retry button | User retries |
| Action 403 | Status bar flash "Permission denied" | Informational |
| Action 404 | Status bar flash "Run not found" | Navigate back |
| Action 409 (wrong state) | Status bar flash "Run cannot be {action} in current state" | Informational |
| Run not found (404 on initial load) | Error state "Run #42 not found" with back navigation | User navigates back |
| Log buffer overflow (>10K lines) | Oldest lines evicted FIFO; scroll-to-top shows "Earlier logs truncated" | Client-side cap |
| Rapid j/k through steps | Client-side only, instant; no log fetches until Enter | No performance concern |
| No color support | Text markers replace icons: [OK]/[FAIL]/[RUN]/[WAIT]/[SKIP]/[CANCEL]/[TIME] | Theme detection |
| Concurrent action + SSE status update | SSE event takes precedence; optimistic UI reverts if conflict | Automatic |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Confirmation overlay crash → overlay dismissed, error flash; user retries action key
- All API fails → error state; `q` still works for navigation
- SSE fails permanently (>5 reconnect attempts) → static view with stale data; "SSE unavailable" in status bar; user can manually refresh
- Slow network → spinner shown on initial load; SSE buffered events render on arrival
- Partial data (run loaded, node detail fails) → run header renders with error in step list; independent retry per step
- Log fetch failure for individual step → "Failed to load logs. Press Enter to retry." in log panel

## Verification

### Test File: `e2e/tui/workflows.test.ts`

### Terminal Snapshot Tests (32 tests)

- SNAP-RD-001: Run detail at 120×40 with completed successful run — full header, step list, status badges
- SNAP-RD-002: Run detail at 80×24 minimum — compact header, icon+name only for steps
- SNAP-RD-003: Run detail at 200×60 large — full header with dispatch inputs, wider step names, iteration numbers
- SNAP-RD-004: Running run with animated spinner in header and on active step
- SNAP-RD-005: Failed run — red status badge, failed step highlighted
- SNAP-RD-006: Queued run — gray status, all steps pending
- SNAP-RD-007: Cancelled run — muted status, cancelled step icon
- SNAP-RD-008: Timed-out run — yellow timeout icon
- SNAP-RD-009: Step list with mixed statuses (success, failure, running, pending, skipped)
- SNAP-RD-010: Expanded step with log output — line numbers, log content, left border
- SNAP-RD-011: Expanded step with stderr output — red left border
- SNAP-RD-012: Expanded step with ANSI color codes in log output — colors preserved
- SNAP-RD-013: Expanded step with "Waiting for logs…" placeholder (pending step)
- SNAP-RD-014: Expanded step with "No output" (completed, empty logs)
- SNAP-RD-015: Multiple steps expanded simultaneously
- SNAP-RD-016: Focused step with reverse video highlight
- SNAP-RD-017: Cancel confirmation overlay
- SNAP-RD-018: Rerun confirmation overlay
- SNAP-RD-019: Resume confirmation overlay
- SNAP-RD-020: Confirmation overlay with spinner during API call
- SNAP-RD-021: Auto-follow indicator in status bar (enabled)
- SNAP-RD-022: Auto-follow indicator in status bar (disabled)
- SNAP-RD-023: Dispatch inputs section expanded (manually dispatched run)
- SNAP-RD-024: Dispatch inputs section collapsed
- SNAP-RD-025: Loading state — "Loading run…" with spinner
- SNAP-RD-026: Error state — red error with "Press R to retry"
- SNAP-RD-027: Run not found (404) error state
- SNAP-RD-028: Breadcrumb path "Dashboard > owner/repo > Workflows > ci > #42"
- SNAP-RD-029: Status bar hints with action keys (running run)
- SNAP-RD-030: Status bar hints with action keys (terminal run)
- SNAP-RD-031: Dimmed action keybinding hints for read-only user
- SNAP-RD-032: SSE disconnected indicator in status bar

### Keyboard Interaction Tests (45 tests)

- KEY-RD-001–004: j/k/Down/Up navigation through step rows
- KEY-RD-005–006: Enter expands step logs, Enter again collapses
- KEY-RD-007: Enter on pending step shows "Waiting for logs…"
- KEY-RD-008: Enter on completed step with no output shows "No output"
- KEY-RD-009: l opens full-screen log viewer for focused step
- KEY-RD-010: l on pending step (no-op, status bar: "Step has no logs yet")
- KEY-RD-011–012: c cancel on running run — opens overlay, Enter confirms, run status updates
- KEY-RD-013: c on terminal run — no-op, status bar "Run is not active"
- KEY-RD-014: c 403 — status bar "Permission denied"
- KEY-RD-015–016: r rerun on terminal run — opens overlay, Enter confirms, navigates to new run
- KEY-RD-017: r on running run — no-op, status bar "Run is still in progress"
- KEY-RD-018: r 403 — status bar "Permission denied"
- KEY-RD-019–020: R resume on cancelled run — opens overlay, Enter confirms, SSE reconnects
- KEY-RD-021: R on successful run — no-op, status bar "Run completed successfully"
- KEY-RD-022: R 403 — status bar "Permission denied"
- KEY-RD-023–024: f toggle auto-follow on/off — status bar indicator updates
- KEY-RD-025–026: e toggle dispatch inputs visible/hidden
- KEY-RD-027: e on run without dispatch inputs — no-op
- KEY-RD-028–029: G (jump to last step), g g (jump to first step)
- KEY-RD-030–031: Ctrl+D (page down), Ctrl+U (page up) within scrollbox
- KEY-RD-032: Esc closes confirmation overlay
- KEY-RD-033: Esc collapses expanded step (when no overlay open)
- KEY-RD-034: Esc pops screen (when no overlay or expanded step)
- KEY-RD-035: q pops screen
- KEY-RD-036: q during confirmation overlay — no-op (overlay must be dismissed with Esc first)
- KEY-RD-037: Rapid j presses (15× sequential, one step per keypress)
- KEY-RD-038: Enter during loading state — no-op
- KEY-RD-039: c during cancel in-flight — no-op, overlay already showing spinner
- KEY-RD-040: Tab/Shift+Tab in confirmation overlay — cycle between Confirm/Cancel buttons
- KEY-RD-041: ? opens help overlay showing all keybindings
- KEY-RD-042: Esc closes help overlay
- KEY-RD-043: Multiple steps expanded, Esc collapses most recently expanded first
- KEY-RD-044: Enter to expand step triggers log fetch; collapse cancels in-flight fetch
- KEY-RD-045: Keys during action in-flight (j/k still work for step navigation)

### Responsive Tests (16 tests)

- RESP-RD-001–003: 80×24 layout — compact header, icon+name steps, no line numbers, no duration
- RESP-RD-004–006: 120×40 layout — full header, step name+status+duration, line numbers in logs
- RESP-RD-007–008: 200×60 layout — full header with dispatch inputs inline, wide step names, gutter labels
- RESP-RD-009–010: Resize from 120×40 to 80×24 — columns collapse, log line numbers hide
- RESP-RD-011: Resize from 80×24 to 120×40 — columns expand, line numbers appear
- RESP-RD-012: Focus preserved through resize
- RESP-RD-013: Expanded step log panel adjusts width on resize
- RESP-RD-014: Resize during log streaming — SSE uninterrupted, layout re-renders
- RESP-RD-015: Resize with confirmation overlay open — overlay resizes proportionally
- RESP-RD-016: Resize during loading state — spinner repositions

### Integration Tests (24 tests)

- INT-RD-001–003: Auth expiry (→ auth screen), rate limit (→ inline message), network error (→ error state)
- INT-RD-004: Server 500 error handling on initial load
- INT-RD-005: Run not found (404) — error state with back navigation
- INT-RD-006–007: Cancel success (API call + status update + SSE done event), cancel failure (status bar error)
- INT-RD-008: Cancel 403 permission denied
- INT-RD-009: Cancel 409 (run already terminal)
- INT-RD-010–011: Rerun success (API call + navigate to new run), rerun failure (overlay error)
- INT-RD-012: Rerun 403 permission denied
- INT-RD-013–014: Resume success (API call + SSE reconnects), resume failure (overlay error)
- INT-RD-015: Resume 403 permission denied
- INT-RD-016: SSE connection lifecycle — connect, receive events, done event closes connection
- INT-RD-017: SSE disconnect + auto-reconnect — backoff 1s/2s/4s/8s, replay via Last-Event-ID
- INT-RD-018: SSE log deduplication — replayed events don't create duplicate log lines
- INT-RD-019: Run completes while viewing — live status transition, duration finalization
- INT-RD-020: Navigation round-trip (run detail → log viewer → back preserves focus and expanded state)
- INT-RD-021: Deep link launch (`--screen workflow-run --repo owner/repo --run 42`)
- INT-RD-022: Command palette entry (`:run 42`)
- INT-RD-023: Back navigation to run list preserves scroll position
- INT-RD-024: Log buffer eviction at 10,000 lines — "Earlier logs truncated" indicator

### Edge Case Tests (15 tests)

- EDGE-RD-001: No auth token → auth error screen
- EDGE-RD-002: Long workflow name (50+ chars) truncated with ellipsis
- EDGE-RD-003: Unicode/emoji in step names — truncation respects grapheme clusters
- EDGE-RD-004: Single step in run
- EDGE-RD-005: Run with 50+ steps — scrollbox handles all steps
- EDGE-RD-006: Concurrent resize + SSE event — both handled independently
- EDGE-RD-007: Step with zero duration (skipped) — shows "skipped" label
- EDGE-RD-008: Extremely long log lines (1000+ chars) — horizontal scroll
- EDGE-RD-009: Run ID 0 (boundary)
- EDGE-RD-010: Null/missing fields in API response — rendered as "—"
- EDGE-RD-011: Run with null started_at (queued, never started)
- EDGE-RD-012: Run with dispatch_inputs containing special characters
- EDGE-RD-013: SSE stream with 10,000+ log events — performance remains stable
- EDGE-RD-014: Rapid c/r/R presses — overlay already open, second press is no-op
- EDGE-RD-015: Network disconnect mid-action (confirmation overlay shows error + retry)

All 132 tests left failing if backend is unimplemented — never skipped or commented out.

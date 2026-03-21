# TUI_WORKFLOW_RUN_LIST

Specification for TUI_WORKFLOW_RUN_LIST.

## High-Level User POV

The Workflow Run List screen is the primary surface for monitoring and managing workflow runs in the Codeplane TUI. It shows all runs for a specific workflow definition within a repository, giving developers immediate visibility into their CI/CD pipeline execution history directly from the terminal. The screen is reached by pressing `Enter` on a focused workflow in the Workflow List screen (TUI_WORKFLOW_LIST_SCREEN), which pushes this screen onto the navigation stack with the selected workflow definition as context. It can also be reached via the command palette (`:workflow-runs <name>`) or by deep-linking with `codeplane tui --screen workflow-runs --repo owner/repo --workflow <id>`.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing the workflow name in bold primary color, followed by "Runs" and the total run count in parentheses (e.g., "ci › Runs (47)"). Below the title is a filter toolbar displaying the current status filter and a text search input for narrowing runs by trigger ref or commit SHA.

The main content area is a scrollable list of workflow run rows. Each row occupies a single line and shows: the run status icon (✓ green for success, ✗ red for failure, ◎ yellow for running, ◌ cyan for queued, ✕ gray for cancelled), the run ID prefixed with `#`, the trigger event type (push, landing_request, manual, schedule, webhook, workflow_run), the trigger ref (bookmark or change ID), a truncated commit SHA, the run duration (or elapsed time if still running), and a relative timestamp of when the run was created. Running runs show an animated spinner (◐◓◑◒ cycling) instead of a static icon, providing real-time visual feedback that the pipeline is active.

Status filtering is accessible via `f`, which cycles through: "All" (default), "Running", "Queued", "Success", "Failure", "Cancelled", and "Finished" (combines success + failure + cancelled). Text search via `/` focuses the search input for client-side substring matching on trigger ref and commit SHA. These filters compose.

The list supports page-based pagination (page size 30, 500-item memory cap) via the v2 API endpoint `GET /api/repos/:owner/:repo/workflows/runs` with `state` query parameter for server-side filtering. Users can act on focused runs: `Enter` opens the run detail view (TUI_WORKFLOW_RUN_DETAIL), `c` cancels a running/queued run, `r` reruns a completed run, `m` resumes a cancelled/failed run. Each action requires write access.

The screen adapts responsively across terminal sizes. At 80×24 only the status icon, run ID, trigger ref, and timestamp are shown. At 120×40 the trigger event, commit SHA, and duration appear. At 200×60+ the full column set renders with wider columns and additional metadata. The status bar shows context-sensitive keybinding hints for the current screen.

When a run is in progress, the screen can optionally subscribe to SSE events for real-time status updates. When a run transitions from running to a terminal state (success, failure, cancelled), the row updates inline without requiring manual refresh. The screen also supports manual refresh with `Ctrl+R` to re-fetch the current page.

## Acceptance Criteria

### Definition of Done
- [ ] The Workflow Run List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `Enter` from the Workflow List screen, `:workflow-runs <name>` command palette entry, and `--screen workflow-runs --repo owner/repo --workflow <id>` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Workflows > {name} > Runs"
- [ ] Pressing `q` pops the screen and returns to the Workflow List screen (or previous screen)
- [ ] Workflow runs are fetched via `useWorkflowRuns()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/workflows/runs?page=N&per_page=30&definition_id=:id` with page-based pagination (default page size 30)
- [ ] The list defaults to showing all runs sorted by `created_at` descending (newest first)
- [ ] Each row displays: status icon (colored glyph), run ID (#N), trigger event, trigger ref, commit SHA (7-char abbreviated), duration, and relative created_at timestamp
- [ ] The header shows "{workflow_name} › Runs (N)" where N is the total run count from the API response
- [ ] The filter toolbar is always visible below the title row
- [ ] Status filter "All" shows every run; "Running", "Queued", "Success", "Failure", "Cancelled" filter by exact status; "Finished" shows success + failure + cancelled
- [ ] Status filter change triggers a fresh API request with the `state` query parameter and resets pagination
- [ ] Enriched run responses include `workflow_name` and `workflow_path` from the v2 endpoint

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next run row
- [ ] `k` / `Up`: Move focus to previous run row
- [ ] `Enter`: Open focused run (push workflow run detail view)
- [ ] `/`: Focus search input in filter toolbar
- [ ] `Esc`: Close overlay → clear search → pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded run row
- [ ] `g g`: Jump to first run row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `Ctrl+R`: Refresh current page (re-fetch from API)
- [ ] `f`: Cycle status filter (All → Running → Queued → Success → Failure → Cancelled → Finished → All)
- [ ] `c`: Cancel focused run (if status is running or queued; POST cancel endpoint)
- [ ] `r`: Rerun focused run (if status is success, failure, or cancelled; POST rerun endpoint)
- [ ] `m`: Resume focused run (if status is cancelled or failure; POST resume endpoint)
- [ ] `q`: Pop screen

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Status icon (2ch), run ID (8ch), trigger ref (remaining, truncated), timestamp (4ch). Event/SHA/duration hidden. Toolbar: filter + search only
- [ ] 120×40 – 199×59: Status icon (2ch), run ID (8ch), trigger event (12ch), trigger ref (25ch, truncated), commit SHA (9ch), duration (8ch), timestamp (4ch). Full toolbar with column headers
- [ ] 200×60+: All columns wider: run ID (10ch), trigger event (15ch), trigger ref (35ch), commit SHA (9ch), duration (10ch), timestamp (6ch). Includes step count column (8ch)

### Truncation & Boundary Constraints
- [ ] Run ID: `#N` format, max 10ch (up to #99999999)
- [ ] Trigger event: truncated at 12ch (standard) / 15ch (large), e.g., "landing_req…"
- [ ] Trigger ref: truncated with `…` at column width (remaining/25ch/35ch)
- [ ] Commit SHA: always exactly 7 characters + 2ch padding = 9ch; show "—" if null
- [ ] Duration: formatted as "45s", "1m 23s", "2h 5m", "—" if not started; max 10ch
- [ ] Elapsed time for running runs: updates every 1s via local timer, formatted same as duration
- [ ] Timestamps: max 6ch ("3d", "1w", "2mo", "1y", "now", "12m", "—")
- [ ] Search input: max 120ch
- [ ] Memory cap: 500 workflow runs max
- [ ] Step count (large only): "N steps", max 8ch

### Edge Cases
- [ ] Terminal resize while scrolled: focus preserved, columns recalculate
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] Status filter change while search active: both filters compose (status + search)
- [ ] Status filter change cancels in-flight request and resets pagination cursor
- [ ] Unicode in trigger refs: truncation respects grapheme clusters
- [ ] Null/missing fields: rendered as "—", no "null" text
- [ ] 500+ runs: pagination cap, footer shows count
- [ ] Cancel on non-cancellable run (success/failure/cancelled): status bar shows "Run cannot be cancelled"
- [ ] Rerun on running/queued run: status bar shows "Run is still in progress"
- [ ] Resume on non-resumable run (success/queued/running): status bar shows "Run cannot be resumed"
- [ ] Action 403 (permission denied): status bar error "Permission denied"
- [ ] No runs: empty state "No runs found for this workflow."
- [ ] No runs matching filter: "No runs match the current filters."
- [ ] Network disconnect during load: error state with retry prompt
- [ ] Search with special regex characters: treated as literal strings
- [ ] Running run transitions to terminal state via SSE: row updates inline
- [ ] SSE disconnect: status bar shows disconnect indicator, manual refresh via Ctrl+R still works
- [ ] Cancel/rerun/resume confirmation: no overlay (immediate action with optimistic update + revert on error)
- [ ] Duration timer for running runs continues during search/filter operations
- [ ] Runs with null started_at: duration shows "—"
- [ ] Extremely long commit SHA (shouldn't happen, but): always truncate to 7 chars

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows > ci > Runs           │
├──────────────────────────────────────────────────────────────────┤
│ ci › Runs (47)                                          / search │
│ Status: All                                                      │
├──────────────────────────────────────────────────────────────────┤
│   STATUS  ID       EVENT    REF               SHA      DUR   AGE │
│ ✓ #1047   push     main                       a3f8c21  1m 5s  3h │
│ ✗ #1046   push     feat/auth                  b7e2d09  45s    5h │
│ ◎ #1045   manual   main                       c1d4e56  12s    8m │
│ ◌ #1044   schedule main                       —        —      2m │
│ ✕ #1043   push     fix/login                  e9f1a23  2m 1s  1d │
│ ✓ #1042   landing… feat/new-api               f2c8b67  3m 2s  1d │
│ …                                                                │
│                    Loading more…                                  │
├──────────────────────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:detail c:cancel r:rerun m:resume f:filter  │
└──────────────────────────────────────────────────────────────────┘
```

The screen is composed of: (1) title row "{workflow_name} › Runs (N)", (2) persistent filter toolbar with status filter and search input, (3) column header row (standard+ sizes), (4) `<scrollbox>` with run rows and pagination, (5) empty/error states.

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar, column alignment
- `<scrollbox>` — Scrollable run list with scroll-to-end pagination detection at 80%
- `<text>` — Run IDs, trigger events/refs, SHAs, durations, timestamps, filter labels, status icons
- `<input>` — Search input in filter toolbar (focused via `/`)

### RunRow

Status icon (colored glyph per status), run ID (default color), trigger event (muted ANSI 245), trigger ref (default color, bold if bookmark), commit SHA (muted ANSI 245, monospace), duration (muted; green if <1m, default 1-5m, yellow 5-15m, red >15m), timestamp (muted ANSI 245). Focused row uses reverse video with primary color (ANSI 33). Terminal-state runs (cancelled) render in fully muted color.

### Status Icon Mapping

| Status | Icon | Color | ANSI |
|--------|------|-------|------|
| success | ✓ | green | 34 |
| failure | ✗ | red | 196 |
| running | ◎ (animated ◐◓◑◒) | yellow | 178 |
| queued | ◌ | cyan | 37 |
| cancelled | ✕ | gray | 245 |

Running runs animate the spinner at 250ms intervals (◐ → ◓ → ◑ → ◒ → ◐). Animation pauses when the row is not visible in the scrollbox viewport.

### Duration Color Coding

| Duration | Color | ANSI |
|----------|-------|------|
| < 1 minute | green | 34 |
| 1–5 minutes | default | — |
| 5–15 minutes | yellow | 178 |
| > 15 minutes | red | 196 |

### Filter Toolbar

The filter toolbar shows the current status filter label and a search input. The filter label cycles through values on `f` press and is rendered as: `Status: {value}` where `{value}` is highlighted in the semantic color for that status (e.g., "Running" in yellow, "Success" in green, "Failure" in red, "All" in default).

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Next row | List focused |
| `k` / `Up` | Previous row | List focused |
| `Enter` | Open run detail | Run focused |
| `/` | Focus search | List focused |
| `Esc` | Close overlay → clear search → pop | Priority |
| `G` | Last row | List focused |
| `g g` | First row | List focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | List focused |
| `R` | Retry | Error state only |
| `Ctrl+R` | Refresh page | Always (not in input) |
| `f` | Cycle status filter | List focused |
| `c` | Cancel run | Running/queued run focused |
| `r` | Rerun | Terminal-state run focused |
| `m` | Resume run | Cancelled/failed run focused |
| `q` | Pop screen | Not in input |

### Responsive Behavior

**80×24**: icon (2), run ID (8), trigger ref (fill−6), timestamp (4). No event, SHA, or duration. No column headers. Compact toolbar.
**120×40**: Column headers visible. icon (2), run ID (8), event (12), ref (25), SHA (9), duration (8), timestamp (4).
**200×60**: All columns wider. icon (2), run ID (10), event (15), ref (35), SHA (9), duration (10), step count (8), timestamp (6).

Resize triggers synchronous re-layout; focused row and scroll position preserved.

### Data Hooks
- `useWorkflowRuns()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/workflows/runs?page=N&per_page=30&definition_id=:id&state=:state`
- `useWorkflowRunSSE()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/workflows/runs/:id/events` (SSE for real-time status updates on running runs)
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useTimeline()` from `@opentui/react` — for running run spinner animation (250ms cycle)
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI navigation

### Navigation
- `Enter` → `push("workflow-run-detail", { repo, runId, workflowName })`
- `c` → `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel` (optimistic: row status → cancelled)
- `r` → `POST /api/repos/:owner/:repo/workflows/runs/:id/rerun` (optimistic: new run appears at top)
- `m` → `POST /api/repos/:owner/:repo/workflows/runs/:id/resume` (optimistic: row status → queued)
- `q` → `pop()`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View run list (public repo) | ✅ | ✅ | ✅ | ✅ |
| View run list (private repo) | ❌ | ✅ | ✅ | ✅ |
| Open run detail | Same as view | ✅ | ✅ | ✅ |
| Cancel run | ❌ | ❌ | ✅ | ✅ |
| Rerun | ❌ | ❌ | ✅ | ✅ |
| Resume run | ❌ | ❌ | ✅ | ✅ |

- The Workflow Run List screen requires an active repository context and workflow definition context. Both are enforced at navigation level
- `GET /api/repos/:owner/:repo/workflows/runs` respects repository visibility: public repos accessible to all authenticated users; private repos require read access
- Cancel (`POST .../cancel`), rerun (`POST .../rerun`), and resume (`POST .../resume`) require write access. Read-only users see the `c`/`r`/`m` keybinding hints but receive "Permission denied" on action
- The `c`, `r`, `m` keybinding hints are shown dimmed (ANSI 245) for users without write access

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen

### Rate Limiting
- 300 req/min for `GET /api/repos/:owner/:repo/workflows/runs`
- 60 req/min for `POST` cancel/rerun/resume operations
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting

### Input Sanitization
- Search text is client-side only — never sent to API
- Status filter values from fixed enum ("", "running", "queued", "success", "failure", "cancelled", "finished") — no user strings reach API for filtering beyond the enum
- Run data rendered as plain `<text>` (no injection vector in terminal)
- Commit SHA values validated as hex strings before display

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workflow_runs.view` | Screen mounted, data loaded | `repo`, `workflow_id`, `workflow_name`, `total_count`, `status_filter`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.workflow_runs.open` | Enter on run | `repo`, `workflow_id`, `run_id`, `run_status`, `trigger_event`, `position_in_list`, `was_filtered`, `status_filter`, `has_search` |
| `tui.workflow_runs.filter_change` | Press f | `repo`, `workflow_id`, `new_filter`, `previous_filter`, `visible_count` |
| `tui.workflow_runs.search` | Type in search | `repo`, `workflow_id`, `query_length`, `match_count`, `total_loaded_count` |
| `tui.workflow_runs.cancel` | Cancel action | `repo`, `workflow_id`, `run_id`, `run_status_before`, `success`, `action_time_ms` |
| `tui.workflow_runs.rerun` | Rerun action | `repo`, `workflow_id`, `run_id`, `original_status`, `success`, `new_run_id`, `action_time_ms` |
| `tui.workflow_runs.resume` | Resume action | `repo`, `workflow_id`, `run_id`, `run_status_before`, `success`, `action_time_ms` |
| `tui.workflow_runs.action_denied` | 403 on action | `repo`, `workflow_id`, `run_id`, `action_type` |
| `tui.workflow_runs.paginate` | Next page loaded | `repo`, `workflow_id`, `page_number`, `items_loaded_total`, `total_count` |
| `tui.workflow_runs.refresh` | Ctrl+R pressed | `repo`, `workflow_id`, `current_page`, `stale_count` |
| `tui.workflow_runs.sse_update` | SSE status transition | `repo`, `workflow_id`, `run_id`, `old_status`, `new_status` |
| `tui.workflow_runs.error` | API failure | `repo`, `workflow_id`, `error_type`, `http_status`, `request_type` |
| `tui.workflow_runs.retry` | Press R | `repo`, `workflow_id`, `error_type`, `retry_success` |
| `tui.workflow_runs.empty` | Empty state shown | `repo`, `workflow_id`, `status_filter`, `has_search_text` |
| `tui.workflow_runs.data_load_time` | All data loaded | `repo`, `workflow_id`, `runs_ms`, `total_ms` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Run detail open rate (Enter to detail) | >55% of views |
| Filter usage | >25% of views |
| Search adoption | >10% of views |
| Cancel usage | >3% of views (when running runs visible) |
| Rerun usage | >8% of views |
| Resume usage | >2% of views |
| Action success rate | >95% of attempts |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <2s |
| SSE update delivery (when connected) | >99% |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `WorkflowRuns: mounted [repo={r}] [workflow={name}] [def_id={id}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `WorkflowRuns: loaded [repo={r}] [workflow={name}] [count={n}] [status_filter={f}] [duration={ms}ms]` |
| `debug` | Search/filter changes | `WorkflowRuns: search [repo={r}] [workflow={name}] [query_length={n}] [matches={m}]` |
| `debug` | Status filter changed | `WorkflowRuns: filter [repo={r}] [workflow={name}] [from={old}] [to={new}]` |
| `debug` | Pagination triggered | `WorkflowRuns: pagination [repo={r}] [workflow={name}] [page={n}]` |
| `debug` | SSE connected | `WorkflowRuns: sse connected [repo={r}] [run_ids={ids}]` |
| `debug` | SSE event received | `WorkflowRuns: sse event [repo={r}] [run_id={id}] [status={s}]` |
| `debug` | Refresh triggered | `WorkflowRuns: refresh [repo={r}] [workflow={name}] [page={n}]` |
| `info` | Fully loaded | `WorkflowRuns: ready [repo={r}] [workflow={name}] [runs={n}] [total_ms={ms}]` |
| `info` | Run navigated | `WorkflowRuns: navigated [repo={r}] [workflow={name}] [run_id={id}] [position={i}]` |
| `info` | Cancel initiated | `WorkflowRuns: cancel [repo={r}] [run_id={id}] [status_before={s}]` |
| `info` | Cancel completed | `WorkflowRuns: cancelled [repo={r}] [run_id={id}] [success={bool}] [duration={ms}ms]` |
| `info` | Rerun initiated | `WorkflowRuns: rerun [repo={r}] [run_id={id}]` |
| `info` | Rerun completed | `WorkflowRuns: rerun completed [repo={r}] [run_id={id}] [new_run_id={nid}] [success={bool}] [duration={ms}ms]` |
| `info` | Resume initiated | `WorkflowRuns: resume [repo={r}] [run_id={id}]` |
| `info` | Resume completed | `WorkflowRuns: resumed [repo={r}] [run_id={id}] [success={bool}] [duration={ms}ms]` |
| `warn` | Fetch failed | `WorkflowRuns: fetch failed [repo={r}] [workflow={name}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `WorkflowRuns: rate limited [repo={r}] [retry_after={s}]` |
| `warn` | Action failed | `WorkflowRuns: action failed [repo={r}] [run_id={id}] [action={a}] [status={code}] [error={msg}]` |
| `warn` | Slow load (>3s) | `WorkflowRuns: slow load [repo={r}] [workflow={name}] [duration={ms}ms]` |
| `warn` | Pagination cap | `WorkflowRuns: pagination cap [repo={r}] [workflow={name}] [total={n}] [cap=500]` |
| `warn` | SSE disconnect | `WorkflowRuns: sse disconnected [repo={r}] [reconnect_attempt={n}]` |
| `error` | Auth error | `WorkflowRuns: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `WorkflowRuns: permission denied [repo={r}] [run_id={id}] [action={a}]` |
| `error` | Render error | `WorkflowRuns: render error [repo={r}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during load | Layout re-renders; fetch continues | Independent |
| Resize while focused on running run | Spinner animation continues; columns recalculate | Synchronous |
| SSE disconnect | Status bar indicator; running run status freezes at last known; Ctrl+R to manual refresh | SSE provider auto-reconnects (1s, 2s, 4s, 8s, max 30s) |
| SSE disconnect during cancel/rerun/resume | Action completes via HTTP regardless of SSE | HTTP response authoritative |
| Auth expiry | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R to retry" | User retries |
| Cancel 409 (already terminal) | Status bar flash "Run already completed" | Informational; refresh to sync |
| Cancel 403 | Status bar flash "Permission denied" | Informational |
| Cancel 404 | Status bar flash "Run not found" | Refresh to sync |
| Rerun 403 | Status bar flash "Permission denied" | Informational |
| Rerun 404 | Status bar flash "Run not found" | Refresh to sync |
| Resume 409 (not resumable) | Status bar flash "Run cannot be resumed" | Informational |
| Resume 403 | Status bar flash "Permission denied" | Informational |
| Rapid f cycling | Each change cancels previous in-flight API request | Cancel semantics |
| No color support | Text markers [✓]/[✗]/[R]/[Q]/[X] replace status icons | Theme detection |
| Memory cap (500) | Stop pagination; show "Showing first 500 runs" | Client-side cap |
| Optimistic cancel reverts | Row flashes back to previous status with red flash indicator (200ms) | User retries action |
| Duration timer drift | Local timer resets on SSE update or manual refresh | Self-correcting |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Action API fails → optimistic state reverts, error flash in status bar; user retries
- All API fails → error state; `q` still works for navigation
- Slow network → spinner shown; user navigates away via go-to or palette
- SSE never connects → static list (HTTP-only mode); Ctrl+R for manual updates
- Partial data (some fields null) → "—" placeholder, no crash

## Verification

### Test File: `e2e/tui/workflows.test.ts`

### Terminal Snapshot Tests (32 tests)

- SNAP-WFR-001: Run list at 120×40 with populated runs — full layout, column headers, status icons, focus highlight
- SNAP-WFR-002: Run list at 80×24 minimum — icon, run ID, trigger ref, timestamp only
- SNAP-WFR-003: Run list at 200×60 large — all columns including step count, wider refs
- SNAP-WFR-004: Empty state (zero runs) — "No runs found for this workflow."
- SNAP-WFR-005: No filter matches — "No runs match the current filters."
- SNAP-WFR-006: Loading state — "Loading runs…" with title/toolbar visible
- SNAP-WFR-007: Error state — red error with "Press R to retry"
- SNAP-WFR-008: Focused row highlight — primary accent (ANSI 33) reverse video
- SNAP-WFR-009: Success run icon — ✓ green (ANSI 34)
- SNAP-WFR-010: Failure run icon — ✗ red (ANSI 196)
- SNAP-WFR-011: Running run icon — ◎ yellow (ANSI 178) with spinner animation frame
- SNAP-WFR-012: Queued run icon — ◌ cyan (ANSI 37)
- SNAP-WFR-013: Cancelled run icon — ✕ gray (ANSI 245) with muted row
- SNAP-WFR-014: Trigger event column values — push, landing_req…, manual, schedule, webhook, workflow_run
- SNAP-WFR-015: Trigger ref truncation — long bookmark names with `…`
- SNAP-WFR-016: Commit SHA display — 7-char abbreviated hex
- SNAP-WFR-017: Duration formatting — "45s", "1m 23s", "2h 5m"
- SNAP-WFR-018: Duration color coding — green (<1m), default (1-5m), yellow (5-15m), red (>15m)
- SNAP-WFR-019: Running run with elapsed timer — shows live-updating duration
- SNAP-WFR-020: Run with null started_at — duration shows "—"
- SNAP-WFR-021–024: Filter toolbar states (All/Running/Queued/Success/Failure/Cancelled/Finished)
- SNAP-WFR-025–026: Search input active + narrowed results
- SNAP-WFR-027: Pagination loading indicator at list bottom
- SNAP-WFR-028: Breadcrumb path "Dashboard > owner/repo > Workflows > ci > Runs"
- SNAP-WFR-029: Total count header "ci › Runs (47)"
- SNAP-WFR-030: Column headers at standard+ sizes
- SNAP-WFR-031: Status bar hints "j/k:nav Enter:detail c:cancel r:rerun m:resume f:filter q:back"
- SNAP-WFR-032: Pagination cap message "Showing first 500 runs"

### Keyboard Interaction Tests (50 tests)

- KEY-WFR-001–006: j/k/Down/Up navigation through run rows
- KEY-WFR-007–008: Enter opens run detail for focused run
- KEY-WFR-009–012: / search focusing, narrowing by trigger ref, narrowing by commit SHA, Esc clear
- KEY-WFR-013–015: Esc context priority (search active → clear search, no search → pop screen, overlay → close overlay)
- KEY-WFR-016–019: G (jump to bottom), g g (jump to top), Ctrl+D (page down), Ctrl+U (page up)
- KEY-WFR-020–021: R retry in error state (success + no-op when not in error)
- KEY-WFR-022: Ctrl+R refresh (re-fetches current page, preserves focus)
- KEY-WFR-023–029: f filter cycling (All → Running → Queued → Success → Failure → Cancelled → Finished → All) with API request and visible count update
- KEY-WFR-030–031: c cancel on running run (optimistic → cancelled icon, API call succeeds)
- KEY-WFR-032: c cancel on queued run (optimistic → cancelled icon)
- KEY-WFR-033: c on non-cancellable run (success/failure/cancelled) — status bar "Run cannot be cancelled"
- KEY-WFR-034–035: r rerun on success/failure run (API call, new run appears or navigation)
- KEY-WFR-036: r on running/queued run — status bar "Run is still in progress"
- KEY-WFR-037–038: m resume on cancelled/failed run (optimistic → queued icon, API call)
- KEY-WFR-039: m on non-resumable run (success/running/queued) — status bar "Run cannot be resumed"
- KEY-WFR-040: q pops screen
- KEY-WFR-041–043: Keys in search input (j/c/r/m type as text, not trigger actions)
- KEY-WFR-044: Pagination on scroll to 80% of list
- KEY-WFR-045: Rapid j presses (15× sequential, one row per keypress)
- KEY-WFR-046: Enter during loading state (no-op)
- KEY-WFR-047–049: Filter + search composition (running+search, failure+search, clear search keeps filter)
- KEY-WFR-050: c during cancel in-flight (no-op, action already pending for this run)

### Responsive Tests (16 tests)

- RESP-WFR-001–003: 80×24 layout with icon+ID+ref+timestamp only, no column headers, compact toolbar
- RESP-WFR-004–006: 120×40 layout with event, SHA, duration columns, column headers visible
- RESP-WFR-007–008: 200×60 layout with all columns (step count), wider columns
- RESP-WFR-009–010: Resize between breakpoints — columns collapse/expand dynamically
- RESP-WFR-011: Focus preserved through resize
- RESP-WFR-012: Resize during search (search input width adjusts, text preserved)
- RESP-WFR-013: Resize during loading state (spinner repositions)
- RESP-WFR-014: Resize while running run spinner animating (animation continues, column widths adjust)
- RESP-WFR-015: Resize from standard to minimum while duration timer running (duration column hides, timer continues internally)
- RESP-WFR-016: Resize at pagination boundary (scroll position recalculated, no duplicate fetch)

### Integration Tests (25 tests)

- INT-WFR-001–003: Auth expiry (→ auth screen), rate limit (→ inline message), network error (→ error state)
- INT-WFR-004–005: Pagination complete + pagination cap at 500
- INT-WFR-006–007: Navigation round-trips (run list → run detail → back preserves focus, scroll, and filter state)
- INT-WFR-008: Server 500 error handling
- INT-WFR-009–010: Cancel success (API call + optimistic update + row icon change), cancel failure (optimistic revert + status bar error)
- INT-WFR-011–012: Rerun success (API returns new run ID + status bar flash), rerun failure (status bar error)
- INT-WFR-013–014: Resume success (optimistic → queued + API call), resume failure (revert + status bar error)
- INT-WFR-015: Cancel 403 permission denied
- INT-WFR-016: Rerun 403 permission denied
- INT-WFR-017: Resume 409 not resumable
- INT-WFR-018: SSE real-time status update (running → success inline transition)
- INT-WFR-019: SSE real-time status update (running → failure inline transition)
- INT-WFR-020: SSE disconnect and reconnect (status bar indicator, data consistency on reconnect)
- INT-WFR-021–023: Deep link launch, command palette entry, workflow list → Enter navigation
- INT-WFR-024: Null/missing fields in API response (trigger_ref null, commit SHA null, started_at null)
- INT-WFR-025: Status filter API request with state param (verify server-side filtering)

### Edge Case Tests (15 tests)

- EDGE-WFR-001: No auth token → auth error screen
- EDGE-WFR-002–003: Long trigger refs (50+ chars), unicode/emoji in trigger refs
- EDGE-WFR-004: Single run in list
- EDGE-WFR-005: Concurrent resize + navigation
- EDGE-WFR-006: Search no matches with active status filter
- EDGE-WFR-007: All runs cancelled (all muted rows)
- EDGE-WFR-008: Extremely long commit SHA (still truncated to 7 chars)
- EDGE-WFR-009: Rapid c presses on same run (second c is no-op while action pending)
- EDGE-WFR-010: Network disconnect mid-pagination
- EDGE-WFR-011: Run ID 0 (boundary)
- EDGE-WFR-012: 100+ runs at minimum terminal size
- EDGE-WFR-013: Cancel then immediately navigate away (action completes in background)
- EDGE-WFR-014: Duration timer across midnight (continuous, no reset)
- EDGE-WFR-015: SSE event for run not in current page (ignored, no crash)

All 138 tests left failing if backend is unimplemented — never skipped or commented out.

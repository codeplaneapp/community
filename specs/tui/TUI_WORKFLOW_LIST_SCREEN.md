# TUI_WORKFLOW_LIST_SCREEN

Specification for TUI_WORKFLOW_LIST_SCREEN.

## High-Level User POV

The Workflow List screen is the top-level workflow management surface in the Codeplane TUI. It presents a full-screen view of all workflow definitions within a repository, giving developers a clear picture of their CI/CD pipeline configuration directly from the terminal. The screen is reached via the `g f` go-to keybinding from any screen with an active repository context, by selecting "Workflows" in the command palette (`:workflows`), or by launching the TUI with `codeplane tui --screen workflows --repo owner/repo`. It requires a repository context — if no repository is active when `g f` is pressed, the user is first prompted to select a repository from the repo list.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Workflows" in bold primary color, followed by the total workflow definition count in parentheses (e.g., "Workflows (8)"). Below the title is a filter toolbar displaying the current active/inactive filter state and a text search input for narrowing the list by workflow name.

The main content area is a scrollable list of workflow definition rows. Each row occupies a single line and shows: the workflow status icon (● green for active, ○ gray for inactive), the workflow name, the file path (e.g., `.codeplane/workflows/ci.ts`), the most recent run status badge (colored: ✓ green for success, ✗ red for failure, ◎ yellow for running, ◌ gray for queued, — for no runs), the trigger type, and a relative timestamp of the last run. Navigation uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused workflow pushes the workflow run list screen, showing all runs for that workflow definition. Pressing `d` dispatches the focused workflow manually (if it supports `manual_dispatch`).

Active/inactive filtering is accessible via `f`, which cycles through: "All" (default), "Active", and "Inactive". Text search via `/` focuses the search input for client-side substring matching on workflow name and path. These filters compose.

The list supports page-based pagination (page size 30, 300-item memory cap). The screen adapts responsively: at 80×24 only the status icon, workflow name, and latest run status are shown; at 120×40 the file path, trigger type, and last run timestamp appear; at 200×60+ the full column set including run count and duration renders.

Each workflow row also shows a quick-glance summary of the last five runs as a mini status bar — a compact sequence of colored dots (●●●●●) representing recent run outcomes, reading left-to-right from newest to oldest. This provides at-a-glance pipeline health without needing to drill into the run list.

## Acceptance Criteria

### Definition of Done
- [ ] The Workflow List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g f` go-to navigation (with repo context), `:workflows` command palette entry, and `--screen workflows --repo owner/repo` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Workflows"
- [ ] Pressing `q` pops the screen and returns to the repository overview (or previous screen)
- [ ] Workflow definitions are fetched via `useWorkflowDefinitions()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/workflows` with page-based pagination (default page size 30)
- [ ] The list defaults to showing all workflow definitions sorted by `name` ascending
- [ ] Each row displays: active status icon (● green / ○ gray), workflow name, file path, latest run status badge, trigger type, and relative last-run timestamp
- [ ] The header shows "Workflows (N)" where N is the total workflow definition count from the API response
- [ ] The filter toolbar is always visible below the title row
- [ ] Active/inactive filter changes trigger client-side filtering (all definitions are typically loaded in a single page for most repos)
- [ ] Latest run status is fetched by a secondary query or included in the workflow definitions response

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next workflow row
- [ ] `k` / `Up`: Move focus to previous workflow row
- [ ] `Enter`: Open focused workflow (push workflow run list view filtered to this definition)
- [ ] `/`: Focus search input in filter toolbar
- [ ] `Esc`: Close overlay → clear search → pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded workflow row
- [ ] `g g`: Jump to first workflow row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `f`: Cycle active filter (All → Active → Inactive → All)
- [ ] `d`: Dispatch focused workflow (manual dispatch, opens confirmation if workflow supports it)
- [ ] `q`: Pop screen

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Status icon (2ch), name (remaining, truncated), latest run badge (3ch), mini status bar (5ch). Path/trigger/timestamp hidden. Toolbar: filter + search only
- [ ] 120×40 – 199×59: Status icon (2ch), name (30ch), path (25ch, truncated), latest run badge (3ch), mini status bar (5ch), trigger (12ch), last run timestamp (4ch). Full toolbar
- [ ] 200×60+: All columns including run count (6ch) and avg duration (8ch). Name 40ch. Path 35ch. Trigger 15ch

### Truncation & Boundary Constraints
- [ ] Workflow name: truncated with `…` at column width (remaining/30ch/40ch)
- [ ] File path: truncated from the left with `…` (e.g., `…flows/ci.ts`) at 25ch (standard) / 35ch (large)
- [ ] Latest run status: single glyph + color, max 3ch (icon + space)
- [ ] Mini status bar: exactly 5ch (5 dots), colored per run status, `·····` (dim) when fewer than 5 runs
- [ ] Trigger type: truncated at 12ch (standard) / 15ch (large)
- [ ] Timestamps: max 4ch ("3d", "1w", "2mo", "1y", "now", "—")
- [ ] Search input: max 120ch
- [ ] Memory cap: 300 workflow definitions max
- [ ] Run count: K-abbreviated above 999, max 6ch
- [ ] Avg duration: formatted as "1m 23s", "45s", "2h 5m", max 8ch

### Edge Cases
- [ ] Terminal resize while scrolled: focus preserved, columns recalculate
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] Filter change while search active: both filters compose (active+search)
- [ ] Unicode in workflow names: truncation respects grapheme clusters
- [ ] Null/missing fields: rendered as "—", no "null" text
- [ ] 300+ definitions: pagination cap, footer shows count
- [ ] Dispatch on non-dispatchable workflow: status bar shows "Workflow does not support manual dispatch"
- [ ] Dispatch 403: status bar error "Permission denied"
- [ ] No workflows: empty state "No workflows found. Add a workflow definition to .codeplane/workflows/"
- [ ] All workflows inactive: shown in muted color, still navigable
- [ ] Workflow with no runs: latest run shows "—", mini status bar shows `·····` (dim dots)
- [ ] Network disconnect during load: error state with retry prompt
- [ ] Search with special regex characters: treated as literal strings

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows               │
├──────────────────────────────────────────────────────────┤
│ Workflows (8)                                   / search │
│ Filter: All                                              │
├──────────────────────────────────────────────────────────┤
│ ● ci               .codeplane/workflows/ci.ts     ✓  ●●●●● push    3d  │
│ ● deploy           .codeplane/workflows/deploy.ts ◎  ●●●●● push    1h  │
│ ○ legacy-lint       …workflows/legacy-lint.ts     —  ····· manual  2mo │
│ ● release-build    .codeplane/workflows/release…  ✗  ●●●●● schedule 5d │
│ …                                                        │
│                    Loading more…                          │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:runs d:dispatch f:filter q:back    │
└──────────────────────────────────────────────────────────┘
```

The screen is composed of: (1) title row "Workflows (N)", (2) persistent filter toolbar with active/inactive filter and search input, (3) column header row (standard+ sizes), (4) `<scrollbox>` with workflow rows and pagination, (5) empty/error states.

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar, column alignment
- `<scrollbox>` — Scrollable workflow list with scroll-to-end pagination detection at 80%
- `<text>` — Workflow names, paths, timestamps, filter labels, status icons, trigger types
- `<input>` — Search input in filter toolbar (focused via `/`)

### WorkflowRow

Active status icon (● green ANSI 34 / ○ gray ANSI 245), workflow name (default color), file path (muted ANSI 245), latest run badge (✓ green / ✗ red / ◎ yellow / ◌ gray / — muted), mini status bar (5 colored dots), trigger type (muted), timestamp (muted). Focused row uses reverse video with primary color (ANSI 33). Inactive workflows render name and path in muted color.

### Mini Status Bar

A compact 5-character sequence showing the last 5 run outcomes:
- `●` green (ANSI 34) = success
- `●` red (ANSI 196) = failure
- `●` yellow (ANSI 178) = running
- `●` cyan (ANSI 37) = queued
- `●` gray (ANSI 245) = cancelled
- `·` dim (ANSI 240) = no run (padding)

Reads left-to-right, newest first.

### Dispatch Confirmation Overlay

When `d` is pressed on a dispatchable workflow, a centered modal (40% × 30%) appears with border in primary color (ANSI 33), background surface (ANSI 236). Shows workflow name, current ref. `Enter` confirms dispatch, `Esc` cancels. Spinner shown during API call. Success flashes status bar message; error shows inline.

### Keybindings

| Key | Action | Condition |
|-----|--------|-----------||
| `j` / `Down` | Next row | List focused |
| `k` / `Up` | Previous row | List focused |
| `Enter` | Open workflow run list | Workflow focused |
| `/` | Focus search | List focused |
| `Esc` | Close overlay → clear search → pop | Priority |
| `G` | Last row | List focused |
| `g g` | First row | List focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | List focused |
| `R` | Retry | Error state |
| `f` | Cycle filter (All → Active → Inactive) | List focused |
| `d` | Dispatch workflow | Dispatchable workflow focused |
| `q` | Pop screen | Not in input/overlay |

### Responsive Behavior

**80×24**: icon (2), name (fill−10), run badge (3), mini bar (5). No path, trigger, or timestamp. Compact toolbar.
**120×40**: Column headers visible. icon (2), name (30), path (25), run badge (3), mini bar (5), trigger (12), timestamp (4).
**200×60**: All columns: icon (2), name (40), path (35), run badge (3), mini bar (5), trigger (15), run count (6), avg duration (8), timestamp (4).

Resize triggers synchronous re-layout; focused row preserved.

### Data Hooks
- `useWorkflowDefinitions()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/workflows?page=N&per_page=30`
- `useWorkflowRunsSummary()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/workflows/runs?limit=5&definition_id=:id` (batched per visible definition, or pre-joined in the definitions response)
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI navigation

### Navigation
- `Enter` → `push("workflow-run-list", { repo, workflowDefinitionId, workflowName })`
- `d` → Opens dispatch overlay; on confirm → `POST /api/repos/:owner/:repo/workflows/:id/dispatches`
- `q` → `pop()`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View workflow list (public repo) | ✅ | ✅ | ✅ | ✅ |
| View workflow list (private repo) | ❌ | ✅ | ✅ | ✅ |
| Open workflow run list | Same as view | ✅ | ✅ | ✅ |
| Dispatch workflow | ❌ | ❌ | ✅ | ✅ |

- The Workflow List screen requires an active repository context. Repository context is enforced at navigation level
- `GET /api/repos/:owner/:repo/workflows` respects repository visibility: public repos accessible to all authenticated users; private repos require read access
- Dispatch (`POST /api/repos/:owner/:repo/workflows/:id/dispatches`) requires write access. Read-only users see the `d` keybinding hint but receive "Permission denied" on action
- The `d` keybinding hint is shown dimmed (ANSI 245) for users without write access

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen

### Rate Limiting
- 300 req/min for `GET /api/repos/:owner/:repo/workflows`
- 60 req/min for `POST` dispatch operations
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting

### Input Sanitization
- Search text is client-side only — never sent to API
- Filter values from fixed enum ("all", "active", "inactive") — no user strings reach API for filtering
- Workflow names and paths rendered as plain `<text>` (no injection vector in terminal)
- Dispatch ref value validated against allowed bookmark patterns before sending

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workflows.view` | Screen mounted, data loaded | `repo`, `total_count`, `active_count`, `inactive_count`, `filter_state`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.workflows.open` | Enter on workflow | `repo`, `workflow_id`, `workflow_name`, `is_active`, `latest_run_status`, `position_in_list`, `was_filtered`, `filter_state`, `has_search` |
| `tui.workflows.filter_change` | Press f | `repo`, `new_filter`, `previous_filter`, `visible_count` |
| `tui.workflows.search` | Type in search | `repo`, `query_length`, `match_count`, `total_loaded_count` |
| `tui.workflows.dispatch` | Confirm dispatch | `repo`, `workflow_id`, `workflow_name`, `trigger_ref`, `success`, `dispatch_time_ms` |
| `tui.workflows.dispatch_cancel` | Cancel dispatch overlay | `repo`, `workflow_id` |
| `tui.workflows.dispatch_denied` | 403 on dispatch | `repo`, `workflow_id`, `workflow_name` |
| `tui.workflows.paginate` | Next page loaded | `repo`, `page_number`, `items_loaded_total`, `total_count` |
| `tui.workflows.error` | API failure | `repo`, `error_type`, `http_status`, `request_type` |
| `tui.workflows.retry` | Press R | `repo`, `error_type`, `retry_success` |
| `tui.workflows.empty` | Empty state shown | `repo`, `filter_state`, `has_search_text` |
| `tui.workflows.data_load_time` | All data loaded | `repo`, `definitions_ms`, `run_summaries_ms`, `total_ms` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Workflow open rate (Enter to run list) | >65% of views |
| Filter usage | >20% of views |
| Search adoption | >10% of views |
| Dispatch usage | >5% of views |
| Dispatch success rate | >95% of attempts |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <2s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `Workflows: mounted [repo={r}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `Workflows: loaded [repo={r}] [count={n}] [active={a}] [inactive={i}] [duration={ms}ms]` |
| `debug` | Search/filter changes | `Workflows: search [repo={r}] [query_length={n}] [matches={m}]` |
| `debug` | Filter changed | `Workflows: filter [repo={r}] [from={old}] [to={new}]` |
| `debug` | Pagination triggered | `Workflows: pagination [repo={r}] [page={n}]` |
| `info` | Fully loaded | `Workflows: ready [repo={r}] [definitions={n}] [total_ms={ms}]` |
| `info` | Workflow navigated | `Workflows: navigated [repo={r}] [workflow_id={id}] [name={name}] [position={i}]` |
| `info` | Dispatch initiated | `Workflows: dispatch [repo={r}] [workflow_id={id}] [name={name}] [ref={ref}]` |
| `info` | Dispatch completed | `Workflows: dispatched [repo={r}] [workflow_id={id}] [run_id={rid}] [success={bool}] [duration={ms}ms]` |
| `warn` | Fetch failed | `Workflows: fetch failed [repo={r}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Workflows: rate limited [repo={r}] [retry_after={s}]` |
| `warn` | Dispatch failed | `Workflows: dispatch failed [repo={r}] [workflow_id={id}] [status={code}] [error={msg}]` |
| `warn` | Slow load (>3s) | `Workflows: slow load [repo={r}] [duration={ms}ms]` |
| `warn` | Pagination cap | `Workflows: pagination cap [repo={r}] [total={n}] [cap=300]` |
| `error` | Auth error | `Workflows: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `Workflows: permission denied [repo={r}] [workflow_id={id}] [action=dispatch]` |
| `error` | Render error | `Workflows: render error [repo={r}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during load | Layout re-renders; fetch continues | Independent |
| Resize with dispatch overlay open | Overlay resizes proportionally (min 30ch width) | Synchronous |
| SSE disconnect | Status bar indicator; workflow list unaffected (SSE not used for list) | SSE provider reconnects |
| Auth expiry | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R to retry" | User retries |
| Dispatch 403 | Status bar flash "Permission denied" | Informational |
| Dispatch 404 | Status bar flash "Workflow not found" | Informational |
| Dispatch 409 | Status bar flash "Workflow is inactive" | Informational |
| Rapid f cycling | Client-side filter, instant | No cancellation needed |
| No color support | Text markers [A]/[I] replace ● / ○ icons; status uses [✓]/[✗]/[R]/[Q]/[—] | Theme detection |
| Memory cap (300) | Stop pagination; show cap message | Client-side cap |
| Run summary fetch failure | Mini status bar shows `?????` in yellow (ANSI 178) | Independent retry |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Dispatch overlay crash → overlay dismissed, error flash; user retries `d`
- All API fails → error state; `q` still works for navigation
- Slow network → spinner shown; user navigates away via go-to or palette
- Partial data (definitions loaded, run summaries fail) → definitions render with `?????` mini status bar; independent retry

## Verification

### Test File: `e2e/tui/workflows.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-WF-001: Workflow list at 120×40 with populated workflows — full layout, headers, columns, focus highlight
- SNAP-WF-002: Workflow list at 80×24 minimum — icon, name, latest run badge, mini status bar only
- SNAP-WF-003: Workflow list at 200×60 large — all columns including run count and avg duration
- SNAP-WF-004: Empty state (zero workflows) — "No workflows found. Add a workflow definition to .codeplane/workflows/"
- SNAP-WF-005: No filter matches — "No workflows match the current filters."
- SNAP-WF-006: Loading state — "Loading workflows…" with title/toolbar visible
- SNAP-WF-007: Error state — red error with "Press R to retry"
- SNAP-WF-008: Focused row highlight — primary accent (ANSI 33) reverse video
- SNAP-WF-009: Active workflow icon — ● green (ANSI 34)
- SNAP-WF-010: Inactive workflow icon — ○ gray (ANSI 245) with muted name/path
- SNAP-WF-011: Latest run status badges — ✓ green, ✗ red, ◎ yellow, ◌ gray, — muted
- SNAP-WF-012: Mini status bar rendering — 5 colored dots with correct colors per status
- SNAP-WF-013: Mini status bar with fewer than 5 runs — padding dots (·) in dim
- SNAP-WF-014: File path truncation from left — `…flows/ci.ts`
- SNAP-WF-015: Trigger type column values — push, landing_req…, manual, schedule, webhook
- SNAP-WF-016–018: Filter toolbar states (All/Active/Inactive)
- SNAP-WF-019–020: Search input active + narrowed results
- SNAP-WF-021: Dispatch confirmation overlay rendering
- SNAP-WF-022: Dispatch overlay with spinner during API call
- SNAP-WF-023: Pagination loading indicator at list bottom
- SNAP-WF-024: Breadcrumb path "Dashboard > owner/repo > Workflows"
- SNAP-WF-025: Total count header "Workflows (8)"
- SNAP-WF-026: Column headers at standard+ sizes
- SNAP-WF-027: Status bar hints "j/k:nav Enter:runs d:dispatch f:filter q:back"
- SNAP-WF-028: Workflow with no runs — "—" latest run, `·····` mini bar

### Keyboard Interaction Tests (40 tests)

- KEY-WF-001–006: j/k/Down/Up navigation through workflow rows
- KEY-WF-007–008: Enter opens workflow run list for focused definition
- KEY-WF-009–012: / search focusing, narrowing by name, narrowing by path, Esc clear
- KEY-WF-013–015: Esc context priority (overlay → search → pop screen)
- KEY-WF-016–019: G (jump to bottom), g g (jump to top), Ctrl+D (page down), Ctrl+U (page up)
- KEY-WF-020–021: R retry in error state (success + no-op when not in error)
- KEY-WF-022–024: f filter cycling (All → Active → Inactive → All) with visible count update
- KEY-WF-025–026: d dispatch on dispatchable workflow (opens overlay, Enter confirms)
- KEY-WF-027: d on non-dispatchable workflow (status bar message, no overlay)
- KEY-WF-028: Esc cancels dispatch overlay
- KEY-WF-029: q pops screen
- KEY-WF-030–032: Keys in search input (j/f/q type as text, not trigger actions)
- KEY-WF-033: Pagination on scroll to 80% of list
- KEY-WF-034: Rapid j presses (15× sequential, one row per keypress)
- KEY-WF-035: Enter during loading state (no-op)
- KEY-WF-036–038: Filter + search composition (active+search, inactive+search, clear search keeps filter)
- KEY-WF-039: d during dispatch in-flight (no-op, overlay already open)
- KEY-WF-040: Tab/Shift+Tab in dispatch overlay (cycle between Dispatch/Cancel buttons)

### Responsive Tests (14 tests)

- RESP-WF-001–003: 80×24 layout with icon+name+badge+minibar only, no column headers, compact toolbar
- RESP-WF-004–006: 120×40 layout with path, trigger, timestamp columns, column headers visible
- RESP-WF-007–008: 200×60 layout with all columns (run count, avg duration), wider columns
- RESP-WF-009–010: Resize between breakpoints — columns collapse/expand dynamically
- RESP-WF-011: Focus preserved through resize
- RESP-WF-012: Resize during search (search input width adjusts, text preserved)
- RESP-WF-013: Resize during loading state (spinner repositions)
- RESP-WF-014: Resize with dispatch overlay open (overlay resizes proportionally, min 30ch width)

### Integration Tests (20 tests)

- INT-WF-001–003: Auth expiry (→ auth screen), rate limit (→ inline message), network error (→ error state)
- INT-WF-004–005: Pagination complete + pagination cap at 300
- INT-WF-006–007: Navigation round-trips (workflow list → run list → back preserves focus and scroll)
- INT-WF-008: Server 500 error handling
- INT-WF-009–010: Dispatch success (API call + status bar flash + run summary refresh), dispatch failure (status bar error)
- INT-WF-011: Dispatch 403 permission denied
- INT-WF-012: Dispatch on inactive workflow (409 response)
- INT-WF-013–015: Deep link launch, command palette entry, g f without repo context (→ repo picker)
- INT-WF-016: Back navigation with data refresh (stale data detection)
- INT-WF-017: Null/missing fields in API response
- INT-WF-018: Run summary partial failure (definitions load, summaries fail → `?????` fallback)
- INT-WF-019: Number formatting for run count (K-abbreviation)
- INT-WF-020: Duration formatting (seconds, minutes, hours)

### Edge Case Tests (13 tests)

- EDGE-WF-001: No auth token → auth error screen
- EDGE-WF-002–003: Long workflow names (50+ chars), unicode/emoji in names
- EDGE-WF-004: Single workflow in list
- EDGE-WF-005: Concurrent resize + navigation
- EDGE-WF-006: Search no matches with active filter
- EDGE-WF-007: All workflows inactive
- EDGE-WF-008: Workflow with extremely long path (80+ chars)
- EDGE-WF-009: Rapid d presses (overlay already open, second d is no-op)
- EDGE-WF-010: Network disconnect mid-pagination
- EDGE-WF-011: Workflow definition ID 0 (boundary)
- EDGE-WF-012: 100+ workflows at minimum terminal size
- EDGE-WF-013: Dispatch with special characters in workflow name

All 115 tests left failing if backend is unimplemented — never skipped or commented out.

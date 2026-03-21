# TUI_WORKFLOW_LOG_STREAM

Specification for TUI_WORKFLOW_LOG_STREAM.

## High-Level User POV

When a terminal developer drills into a workflow run in the Codeplane TUI, the log stream screen is where they spend the majority of their workflow debugging time. This screen renders workflow run logs in real time as they are emitted by the runner, using a persistent Server-Sent Events connection to the Codeplane API. The experience is designed to feel like tailing a live process in the terminal — logs scroll by as they arrive, ANSI color codes are rendered natively (the terminal is already an ANSI interpreter), and the user can toggle auto-follow to keep up with the latest output or freeze the scroll position to inspect a specific section.

The screen is reached by navigating into a specific workflow run: from the workflow run list, pressing Enter on a run pushes the run detail screen, and the log panel is the primary content area of that detail view. For in-progress runs, the logs stream incrementally — each line appears as the runner produces it, with no buffering delay visible to the user. For completed runs, the full log is loaded from the server in a single batch and displayed immediately.

The log viewer occupies the majority of the screen. At the top is a step selector — a horizontal list of workflow step names, each with a status badge (spinner for running, checkmark for success, X for failure, dash for pending). The user navigates between steps using [ and ] or number keys 1-9, and the log panel below updates to show logs for the selected step. Each step has its own independent scroll position that is preserved when switching between steps.

The log content area is a scrollbox rendering log lines with line numbers in the gutter. Each line shows the line number (right-aligned, muted color), the stream indicator (stdout in default color, stderr in red), and the log content with ANSI color codes passed through to the terminal. The scrollbox supports vim-style navigation: j/k for line-by-line scrolling, Ctrl+D/Ctrl+U for page scrolling, G to jump to the bottom, and g g to jump to the top.

Auto-follow is the default behavior for in-progress runs: as new log lines arrive via SSE, the scrollbox automatically scrolls to the bottom, keeping the latest output visible. The user can toggle auto-follow off by pressing f, which freezes the scroll position and shows an AUTO-FOLLOW OFF indicator. Any manual scroll action also disables auto-follow. Pressing f again or pressing G re-enables it. When the run completes (the SSE stream emits a done event), auto-follow disables automatically.

The status bar at the bottom shows the run's overall status (queued, running, success, failure, cancelled), the elapsed time or total duration, the current step name, and the SSE connection health indicator. When the connection drops, the TUI reconnects automatically with exponential backoff, and on reconnection uses the Last-Event-ID header to replay any log lines missed during the disconnection window.

Search within logs is available via /, which opens a search input overlay at the bottom of the log panel. The search highlights all matching occurrences and provides n/N keybindings to jump between matches. Search operates on stripped (non-ANSI) text content so that color codes don't interfere with pattern matching.

At minimum terminal size (80×24), the step selector collapses to show only the current step name with arrows. The stream indicator column is hidden, and stderr lines are indicated by a red line number. At standard size (120×40), the full step selector bar is visible with status badges and both the line number gutter and stream indicator column are shown. At large terminal sizes (200×60+), step durations and a live byte-count indicator are added.

## Acceptance Criteria

### Definition of Done

- [ ] The workflow log stream screen renders as the primary content panel within the workflow run detail view
- [ ] The screen is reachable by pressing Enter on a run in the workflow run list, or via deep-link `codeplane tui --screen workflow-run --repo owner/repo --run-id 123`
- [ ] The breadcrumb reads "Dashboard > owner/repo > Workflows > {workflow-name} > Run #{id}"
- [ ] SSE connection to `GET /api/repos/:owner/:repo/runs/:id/logs` is established when the screen mounts
- [ ] SSE connection uses ticket-based authentication via `POST /api/auth/sse-ticket`
- [ ] If ticket acquisition fails (401), the TUI shows "Session expired. Run `codeplane auth login` to re-authenticate."
- [ ] The initial SSE `status` event populates the step selector and run metadata
- [ ] Subsequent SSE `log` events render individual log lines incrementally in the log panel
- [ ] SSE `status` events update the run status badge and step status badges in real-time
- [ ] The SSE `done` event signals run completion — auto-follow is disabled, the run status badge finalizes
- [ ] For terminal-status runs, the server sends all logs + done as a static SSE response — rendered immediately
- [ ] Log lines render within one frame (<16ms) of SSE event receipt
- [ ] ANSI color codes embedded in log content are passed through directly to the terminal renderer
- [ ] Each log line shows: line number (right-aligned, muted), stream indicator (stdout/stderr), and log content
- [ ] stderr lines have the stream indicator rendered in error color (ANSI 196)
- [ ] Line numbers are sequential per step, starting at 1
- [ ] Auto-follow is enabled by default for in-progress runs
- [ ] Auto-follow is disabled when the user scrolls manually (j, k, Ctrl+D, Ctrl+U, g g)
- [ ] Auto-follow is toggled via f key and re-enabled via G key
- [ ] An AUTO-FOLLOW OFF indicator appears when auto-follow is disabled during an active stream
- [ ] Pressing q pops the screen

### Step Navigation

- [ ] Step selector bar renders above the log panel showing all steps with status badges
- [ ] [ moves to previous step; ] moves to next step
- [ ] Number keys 1-9 jump to step by position
- [ ] Switching steps preserves scroll position of previous step
- [ ] Step badges update in real-time via SSE status events

### SSE Connection Lifecycle

- [ ] SSE connection opens within 500ms of screen mount
- [ ] SSE ticket has a 30-second TTL
- [ ] Keep-alive pings (every 15s) handled silently
- [ ] Dead connection detected after 45s of no events/keep-alive
- [ ] Reconnection uses exponential backoff: 1s, 2s, 4s, 8s, capped at 30s
- [ ] Each reconnection obtains a fresh SSE ticket
- [ ] Last-Event-ID header sent on reconnection for replay of missed logs
- [ ] Replayed log lines deduplicated by log_id
- [ ] Max 20 reconnection attempts before showing disconnected state
- [ ] R triggers manual reconnection, resetting backoff
- [ ] SSE connection cleaned up on unmount

### Search Within Logs

- [ ] / opens search input; Esc closes it
- [ ] Matches highlighted with reverse video; n/N navigate between matches
- [ ] Match count indicator shows M/N matches
- [ ] Search operates on ANSI-stripped text; case-insensitive; literal matching
- [ ] New log lines arriving during search are included in match set

### Edge Cases — Terminal

- [ ] Terminal resize does not interrupt SSE connection
- [ ] Below 80×24 shows "terminal too small" but SSE stays active
- [ ] Ctrl+Z/fg triggers reconnection if connection was lost
- [ ] No-color terminals: ANSI stripped, text labels used for stream/status
- [ ] 16-color terminals: closest ANSI colors used

### Edge Cases — Data Boundaries

- [ ] Run IDs up to 64-bit integer range handled
- [ ] Step names up to 128 characters truncated with …
- [ ] Log lines up to 64KB rendered (truncated with indicator if exceeded)
- [ ] Long lines wrap; line numbers only on first visual line
- [ ] 100,000 lines per step supported via 10,000-line virtual scroll window
- [ ] Malformed SSE events silently discarded
- [ ] Unknown SSE event types silently ignored
- [ ] Empty/whitespace-only log lines preserved
- [ ] Binary content rendered as replacement characters (�)
- [ ] Steps with zero logs show "No output"

### Edge Cases — Rapid Input

- [ ] Rapid j/k scrolls one line per keypress without debounce
- [ ] Rapid step switching is sequential
- [ ] Navigation away cancels in-flight ticket requests
- [ ] Rapid R presses debounced at 2 seconds
- [ ] q during streaming unmounts cleanly

## Design

### Layout Structure

The screen is composed of: (1) header bar with breadcrumb, (2) step selector bar with status badges and run status metadata, (3) log content scrollbox with line numbers and stream indicators, (4) optional search input overlay at bottom of log panel, (5) status bar with keybindings and connection indicator.

At standard terminal (120×40):
```
┌────────────────────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workflows > ci > Run #142            ● 3        │
├────────────────────────────────────────────────────────────────────────────┤
│ ✓ setup │ ⠹ build │ ◌ test │ ◌ deploy                [running] 2m 34s   │
├────────────────────────────────────────────────────────────────────────────┤
│     1  stdout  Cloning repository…                    AUTO-FOLLOW OFF    │
│     2  stdout  Installing dependencies…                                  │
│     7  stderr  Warning: peer dependency not met                          │
│    11  stdout  ████████████████████████████░░░░ 78%                      │
├────────────────────────────────────────────────────────────────────────────┤
│ j/k:scroll [/]:step f:follow /:search q:back        ⠹ running ● 2m 34s  │
└────────────────────────────────────────────────────────────────────────────┘
```

At 80×24: step selector collapses to `[< build >]`, gutter 4 chars, no stream column (stderr = red line number), abbreviated status.
At 200×60+: step durations shown, 8-char gutter, byte count in status bar.

### Components Used

- `<box>` — Layout containers for step selector, log rows, search overlay, run metadata
- `<scrollbox>` — Primary log viewer with virtual scrolling for large volumes
- `<text>` — Log content (ANSI passthrough), line numbers, step names, badges, timestamps, connection indicator, AUTO-FOLLOW OFF
- `<input>` — Search text input (focused via /)

### Step Selector Bar

Horizontal `<box flexDirection="row">` with steps as `<text>` elements. Selected step: reverse video + primary (ANSI 33). Badges: ⠋ spinner (yellow, 80ms via useTimeline), ✓ (green), ✗ (red), ◌ (gray), ⊘ (yellow).

### Log Content Panel

Each line: `<box flexDirection="row">` with line number gutter (`<text color="muted">`), stream indicator (`<text color={stderr ? "error" : "muted"}>` at 120+), and log content (`<text>` with ANSI passthrough). Gutter widths: 4ch (80×24), 6ch (120×40), 8ch (200×60+).

### Keybindings

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `Down` | Scroll log down one line | Log focused |
| `k` / `Up` | Scroll log up one line | Log focused |
| `G` | Jump to bottom, re-enable auto-follow | Log focused |
| `g g` | Jump to top, disable auto-follow | Log focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | Log focused |
| `f` | Toggle auto-follow | Stream active |
| `[` / `]` | Previous / next step | Step selector |
| `1`-`9` | Select step by position | Step selector |
| `/` | Open search input | Log focused |
| `n` / `N` | Next / previous search match | Search active |
| `Esc` | Close search → pop screen | Priority |
| `R` | Force SSE reconnection | Degraded state |
| `q` | Pop screen | Not in search |

### Data Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useWorkflowLogStream(owner, repo, runId)` | `@codeplane/ui-core` | SSE log/status/done events. Returns `{ logs, steps, runStatus, connectionHealth, reconnect, lastEventId }` |
| `useSSETicket()` | `@codeplane/ui-core` | Short-lived SSE ticket via `POST /api/auth/sse-ticket` |
| `useWorkflowRun(owner, repo, runId)` | `@codeplane/ui-core` | REST fetch for reconciliation on reconnect |
| `useWorkflowSteps(runId)` | `@codeplane/ui-core` | Step metadata, updated by SSE status events |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size for responsive layout |
| `useOnResize()` | `@opentui/react` | Re-layout on resize |
| `useKeyboard()` | `@opentui/react` | Keyboard input handling |
| `useTimeline()` | `@opentui/react` | Braille spinner animation at 80ms |
| `useNavigation()` | TUI navigation | Stack-based push/pop |
| `useStatusBarHints()` | TUI navigation | Context-sensitive keybinding hints |
| `useRepoContext()` | TUI navigation | Repository owner/repo context |

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View workflow run logs (public repo) | ✅ | ✅ | ✅ | ✅ |
| View workflow run logs (private repo) | ❌ | ✅ | ✅ | ✅ |
| Subscribe to SSE log stream | ❌ | ✅ | ✅ | ✅ |

- The log stream screen requires an active repository context enforced at navigation level
- `GET /api/repos/:owner/:repo/runs/:id/logs` respects repository visibility
- SSE ticket issuance (`POST /api/auth/sse-ticket`) requires a valid authentication token
- Anonymous users cannot obtain SSE tickets

### Token and Ticket Security

- TUI authenticates via token from `codeplane auth login` or `CODEPLANE_TOKEN` env var
- SSE connections use ticket-based auth: token exchanged for 30-second, single-use ticket via `POST /api/auth/sse-ticket`
- Long-lived token never passed as URL query parameter — only the short-lived ticket appears in the SSE URL
- SSE tickets are SHA-256 hashed before storage; raw ticket never persisted on server
- Revoked/expired token → 401 on next ticket request → re-authentication message shown
- SSE ticket consumed exactly once — replayed tickets rejected
- Log content never included in TUI debug logs (may contain CI secrets)

### Rate Limiting

- SSE ticket issuance: max 10 tickets per user per minute
- SSE connections: max 5 concurrent per user
- GET log endpoint: 60 req/min per user
- 429 responses extend reconnection backoff by Retry-After value
- Rate limit shown in status bar: "Rate limited. Retry in {N}s." in warning color
- No auto-retry on rate limit; user presses R after window expires

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|-----------|---------|------------|
| `tui.workflow_logs.view` | Screen mounted, initial data loaded | `repo`, `run_id`, `workflow_name`, `run_status`, `step_count`, `is_terminal`, `total_lines`, `load_time_ms`, `terminal_width`, `terminal_height`, `breakpoint`, `entry_method` |
| `tui.workflow_logs.sse.connected` | SSE connection established | `repo`, `run_id`, `connection_time_ms`, `is_reconnection`, `last_event_id` |
| `tui.workflow_logs.sse.disconnected` | SSE connection lost | `repo`, `run_id`, `connected_duration_ms`, `lines_received`, `reason` |
| `tui.workflow_logs.sse.reconnected` | Successful reconnection | `repo`, `run_id`, `reconnection_attempts`, `total_downtime_ms`, `replayed_lines` |
| `tui.workflow_logs.sse.reconnect_failed` | Max attempts exhausted | `repo`, `run_id`, `total_attempts`, `total_downtime_ms` |
| `tui.workflow_logs.sse.manual_reconnect` | User pressed R | `repo`, `run_id`, `previous_state` |
| `tui.workflow_logs.step_switch` | Step changed | `repo`, `run_id`, `from_step`, `to_step`, `method` |
| `tui.workflow_logs.follow_toggle` | Auto-follow toggled | `repo`, `run_id`, `new_state`, `trigger` |
| `tui.workflow_logs.search` | Search initiated | `repo`, `run_id`, `query_length`, `match_count`, `step_name` |
| `tui.workflow_logs.search_navigate` | Match navigation | `repo`, `run_id`, `direction`, `current_match`, `total_matches` |
| `tui.workflow_logs.run_completed` | Run completed while viewing | `repo`, `run_id`, `final_status`, `total_duration_ms`, `total_lines`, `viewing_duration_ms` |
| `tui.workflow_logs.sse.ticket_error` | Ticket acquisition failed | `repo`, `run_id`, `error_code`, `error_reason` |
| `tui.workflow_logs.error` | Any error | `repo`, `run_id`, `error_type`, `http_status`, `request_type` |

### Common Properties (all events)

`session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| SSE connection reliability | ≥ 99% of connections remain active for run duration |
| Reconnection success rate | ≥ 95% succeed within 3 attempts |
| Log line render latency | P95 within 50ms of SSE event receipt |
| Zero-data-loss rate | 100% of lines delivered via Last-Event-ID replay |
| Manual reconnection rate | < 5% of sessions require user pressing R |
| Search usage | > 15% of sessions include search |
| Step switching rate | > 40% of multi-step runs involve step switch |
| Screen load time (terminal runs) | P95 under 1s for up to 10,000 lines |
| Auto-follow usage | > 70% of in-progress views use auto-follow |

## Observability

### Logging Requirements

| Log Level | Event | Payload |
|-----------|-------|---------|
| `debug` | SSE connection opened | `{ run_id, channels, ticket_acquired_in_ms }` |
| `debug` | SSE log event received | `{ run_id, step_id, log_id, stream, line_length }` |
| `debug` | SSE status event received | `{ run_id, run_status, step_statuses }` |
| `debug` | SSE keep-alive received | `{ run_id }` |
| `debug` | SSE done event received | `{ run_id, final_status, total_lines }` |
| `debug` | Step switched | `{ run_id, from_step, to_step }` |
| `debug` | Auto-follow toggled | `{ run_id, new_state, trigger }` |
| `debug` | Search executed | `{ run_id, query_length, match_count }` |
| `info` | SSE reconnection successful | `{ run_id, attempt_number, downtime_ms, replayed_lines }` |
| `info` | Screen mounted | `{ run_id, is_terminal, initial_line_count }` |
| `info` | Run completed via SSE | `{ run_id, final_status, total_lines, viewing_duration_ms }` |
| `warn` | SSE connection lost | `{ run_id, reason, will_retry }` |
| `warn` | SSE ticket failed (non-401) | `{ status_code, error }` |
| `warn` | Malformed SSE event discarded | `{ run_id, raw_data_length, parse_error }` |
| `warn` | Log line exceeds 64KB | `{ run_id, step_id, log_id, line_length }` |
| `warn` | Virtual scroll eviction | `{ run_id, step_id, total_lines, evicted_lines }` |
| `error` | SSE reconnection exhausted | `{ run_id, total_attempts: 20, total_downtime_ms }` |
| `error` | SSE ticket 401 | `{ run_id }` |
| `error` | Run not found (404) | `{ run_id }` |

Logs written to TUI debug log file (enabled via `CODEPLANE_TUI_DEBUG=1` or `--debug`). Never rendered to terminal UI. **Log content itself is never included in debug logs** to avoid leaking CI secrets.

### Error Cases and Recovery

| Error Case | Detection | Recovery | User Impact |
|-----------|-----------|----------|-------------|
| SSE drops (network) | No event/keep-alive for 45s | Auto-reconnect + Last-Event-ID replay | Yellow dot; cached logs remain; missed lines appear on reconnect |
| SSE ticket 401 | HTTP 401 | Show auth message, stop reconnection | Red dot + "Session expired" |
| SSE ticket 429 | HTTP 429 | Extend backoff by Retry-After | Yellow dot + "Rate limited" |
| Run not found (404) | HTTP 404 | Show error, no reconnection | Error state with q to go back |
| Malformed SSE event | JSON parse error | Discard, log warning, continue | None |
| Run deleted during viewing | 404 on reconnect REST fetch | Show error, disable reconnection | Flash message; cached logs remain readable |
| Terminal resize | SIGWINCH | Re-layout, preserve scroll/SSE | Momentary re-render |
| Process suspend/resume | SIGTSTP + SIGCONT | Force reconnection + replay | Brief yellow dot |
| Server restart | SSE closed by server | Auto-reconnect after 1s + replay | Yellow dot |
| Max attempts exhausted | 20 failures | Stop retrying, show R hint | Red dot + "Disconnected. Press R to reconnect." |
| Long log line (>64KB) | Buffer limit | Truncate with indicator | Truncated line visible |
| Memory pressure (100K+ lines) | Virtual scroll threshold | Evict earliest lines | Slight delay scrolling to evicted regions |

### Health Check

The SSE provider exposes `connectionHealth`: `healthy` (active, receiving events), `degraded` (reconnecting), `disconnected` (all attempts failed). Surfaced in status bar and telemetry.

## Verification

### Test File: `e2e/tui/workflows.test.ts`

All 97 tests left failing if backend is unimplemented — never skipped or commented out.

### SSE Connection Lifecycle Tests (8)

- LOG-SSE-001: establishes SSE connection on log stream screen mount
- LOG-SSE-002: uses ticket-based authentication for SSE connection
- LOG-SSE-003: cleans up SSE connection on unmount
- LOG-SSE-004: sends Last-Event-ID on reconnection
- LOG-SSE-005: deduplicates replayed log lines
- LOG-SSE-006: handles static SSE response for terminal runs
- LOG-SSE-007: obtains fresh ticket on each reconnection
- LOG-SSE-008: connection survives terminal resize

### Real-Time Log Streaming Tests (7)

- LOG-STREAM-001: renders log lines incrementally as SSE events arrive
- LOG-STREAM-002: displays line numbers in gutter
- LOG-STREAM-003: distinguishes stdout and stderr lines
- LOG-STREAM-004: passes through ANSI color codes in log content
- LOG-STREAM-005: renders empty log lines as blank lines with line numbers
- LOG-STREAM-006: renders binary content as replacement characters
- LOG-STREAM-007: handles rapid log delivery (100 lines/second)

### Auto-Follow Tests (8)

- LOG-FOLLOW-001: auto-follow is on by default for in-progress runs
- LOG-FOLLOW-002: auto-follow disabled by manual j scroll
- LOG-FOLLOW-003: auto-follow disabled by Ctrl+U
- LOG-FOLLOW-004: f key toggles auto-follow
- LOG-FOLLOW-005: G re-enables auto-follow
- LOG-FOLLOW-006: g g disables auto-follow
- LOG-FOLLOW-007: auto-follow disabled when run completes
- LOG-FOLLOW-008: auto-follow is off for terminal runs

### Step Navigation Tests (10)

- LOG-STEP-001: step selector shows all steps with status badges
- LOG-STEP-002: ] selects next step
- LOG-STEP-003: [ selects previous step
- LOG-STEP-004: number keys select step by position
- LOG-STEP-005: step scroll positions are independent
- LOG-STEP-006: step badge updates when step completes via SSE
- LOG-STEP-007: new step appears in selector when it starts
- LOG-STEP-008: [ stops at first step
- LOG-STEP-009: ] stops at last step
- LOG-STEP-010: number key beyond step count is no-op

### Search Tests (10)

- LOG-SEARCH-001: / opens search input
- LOG-SEARCH-002: search highlights matching text
- LOG-SEARCH-003: n jumps to next match
- LOG-SEARCH-004: N jumps to previous match
- LOG-SEARCH-005: Esc closes search and clears highlights
- LOG-SEARCH-006: search strips ANSI codes before matching
- LOG-SEARCH-007: search with no matches shows 0/0
- LOG-SEARCH-008: new log lines included in search matches
- LOG-SEARCH-009: search in empty log
- LOG-SEARCH-010: search is case-insensitive

### Reconnection Tests (6)

- LOG-RECON-001: reconnects with exponential backoff
- LOG-RECON-002: replays missed logs on reconnection
- LOG-RECON-003: shows disconnected state after max attempts
- LOG-RECON-004: R key triggers manual reconnection
- LOG-RECON-005: R key debounced at 2 seconds
- LOG-RECON-006: reconnection preserves scroll position and step selection

### Run Status Update Tests (4)

- LOG-STATUS-001: run status badge updates on SSE status event
- LOG-STATUS-002: elapsed time updates live during running
- LOG-STATUS-003: elapsed time stops on run completion
- LOG-STATUS-004: step statuses update via SSE

### Connection Health Indicator Tests (3)

- LOG-HEALTH-001: shows green dot when SSE connected
- LOG-HEALTH-002: shows yellow dot when reconnecting
- LOG-HEALTH-003: shows red dot when disconnected

### Responsive Tests (8)

- LOG-RESP-001: 80×24 — collapsed step selector, narrow gutter, no stream column
- LOG-RESP-002: 80×24 — auto-follow indicator abbreviated to [F]
- LOG-RESP-003: 80×24 — status bar minimal
- LOG-RESP-004: 120×40 — full step selector, full columns
- LOG-RESP-005: 120×40 — search with match count
- LOG-RESP-006: 200×60 — step durations, byte count, wide gutter
- LOG-RESP-007: resize from 120×40 to 80×24 preserves state
- LOG-RESP-008: resize during search preserves search state

### Error Handling Tests (8)

- LOG-ERR-001: shows auth message on 401 ticket response
- LOG-ERR-002: handles 429 rate limit on ticket request
- LOG-ERR-003: discards malformed SSE events gracefully
- LOG-ERR-004: handles run not found (404)
- LOG-ERR-005: handles process suspend and resume
- LOG-ERR-006: handles step with no output ("No output" centered)
- LOG-ERR-007: handles extremely long log line (truncation)
- LOG-ERR-008: no-color terminal renders without ANSI codes

### Edge Case Tests (7)

- LOG-EDGE-001: rapid j/k scrolls one line per keypress
- LOG-EDGE-002: rapid step switching is sequential
- LOG-EDGE-003: q during active streaming unmounts cleanly
- LOG-EDGE-004: large log volume (10,000 lines)
- LOG-EDGE-005: step name with 128 characters truncated
- LOG-EDGE-006: unicode in log content preserved
- LOG-EDGE-007: concurrent resize + SSE event

### Terminal Snapshot Golden Files (14)

- workflow-log-streaming-5-lines
- workflow-log-line-numbers
- workflow-log-stdout-stderr
- workflow-log-step-selector
- workflow-log-step-completed
- workflow-log-search-results
- workflow-log-run-success
- workflow-log-connected
- workflow-log-disconnected
- workflow-log-80x24
- workflow-log-120x40
- workflow-log-200x60
- workflow-log-empty-step
- workflow-log-no-color

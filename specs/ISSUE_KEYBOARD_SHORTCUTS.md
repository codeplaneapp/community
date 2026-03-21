# ISSUE_KEYBOARD_SHORTCUTS

Specification for ISSUE_KEYBOARD_SHORTCUTS.

## High-Level User POV

When a user works with issues in Codeplane — whether in the web application, the terminal UI, or the desktop app — keyboard shortcuts transform issue management from a point-and-click workflow into a fluid, muscle-memory-driven experience. The user can navigate issue lists, triage issues, create and edit issues, add comments, apply labels and assignees, close and reopen issues, and perform bulk operations entirely from the keyboard, without ever reaching for a mouse or trackpad.

On the **web application**, the user presses a global shortcut to jump to the issues page for the current repository. Once on the issue list, arrow keys or `j`/`k` navigate between rows, `Enter` opens an issue, and single-key actions like `c` (create), `x` (close/reopen), or `l` (assign labels) trigger common operations. On the issue detail view, shortcuts let the user scroll through comments, jump between comments, toggle the issue state, start editing, or begin a new comment. The user always knows what shortcuts are available because a subtle hint strip is visible at the bottom of the page and a full keyboard shortcut reference is available via the `?` key. The global command palette (triggered by `:` or `Ctrl+K`) also lists all issue actions as searchable, fuzzy-matched commands.

On the **TUI**, the same conceptual keybinding model applies in a terminal-native form. The TUI's layered keyboard dispatch ensures that the same key performs the correct contextual action depending on whether the user is on the list, in a detail view, inside a form, or interacting with a filter overlay. Status bar hints at the bottom of the terminal update instantly as focus changes.

On the **desktop app**, the embedded web UI inherits all web keyboard shortcuts, and native menu accelerators are mapped to the most critical issue actions so they appear in system menus and work with standard OS shortcut patterns.

The overall value is speed, predictability, and power-user ergonomics: issue triage sessions that previously required dozens of clicks become fast keyboard-driven flows, and the consistent shortcut vocabulary across all Codeplane clients means the user only learns one set of bindings.

## Acceptance Criteria

### Definition of Done

- [ ] All issue-related keyboard shortcuts are operational across the web UI and TUI, with consistent action semantics (same key → same conceptual action)
- [ ] The web UI issue list supports keyboard navigation (`j`/`k` or `↑`/`↓`), issue opening (`Enter`), and single-key actions for create (`c`), close/reopen (`x`), label assignment (`l`), assignee assignment (`a`), and milestone assignment (`m`)
- [ ] The web UI issue detail view supports keyboard scrolling, comment navigation (`n`/`p`), inline comment creation (`c`), issue editing (`e`), and state toggle (`o`)
- [ ] The TUI implements the full keybinding dispatch hierarchy documented in the TUI_ISSUE_KEYBOARD_SHORTCUTS specification, including 6-layer priority resolution
- [ ] Pressing `?` on any issue screen (web or TUI) opens a keyboard shortcut help overlay showing all active context-sensitive shortcuts grouped by function
- [ ] The command palette (`:`  in TUI, `Ctrl+K` / `:` in web) includes all issue actions as searchable commands with keybinding hints displayed alongside each entry
- [ ] Status bar (TUI) or hint strip (web) displays context-sensitive keybinding hints that update within one render frame of focus or screen changes
- [ ] All single-key shortcuts are suppressed when a text input or textarea has focus, except `Esc` (blur/cancel), `Ctrl+C` (cancel in TUI), and `Ctrl+S` / `Cmd+S` (submit)
- [ ] All single-key shortcuts are suppressed when a modal overlay (help, command palette, filter picker) is open, except `Esc` (close) and `?` (close help)
- [ ] `g i` (TUI go-to mode) navigates to the issues list when a repository is in context
- [ ] Keyboard-triggered mutations (close, reopen, comment, label changes) apply optimistic UI updates and revert on server error
- [ ] Unauthorized shortcut actions display a non-disruptive permission error rather than hiding the shortcut
- [ ] Bulk selection via `Space` on the issue list (TUI) toggles per-row selection; `x` on a multi-selection performs bulk close/reopen with a confirmation prompt when more than 5 issues are selected
- [ ] All keyboard handlers execute within 16ms to maintain 60fps responsiveness
- [ ] No two keybindings within the same active context produce conflicting actions for the same key

### Edge Cases

- [ ] Empty issue list: navigation keys (`j`/`k`/`Enter`/`x`/`Space`) are no-ops; only `c` (create), `q`/`Esc` (back), `?` (help), and `:` (palette) remain active
- [ ] Issue list with a single issue: `j` and `k` do not move; `Enter` and `x` operate on the single row
- [ ] `c` key context disambiguation: triggers "create issue" on the list, "add comment" on the detail view, and inserts the character `c` in any text input
- [ ] `o` key context disambiguation: triggers "cycle sort order" on the list (web), "toggle open/closed state" on the detail, and inserts `o` in text inputs
- [ ] `x` with multi-selection exceeding 5 items: displays a confirmation dialog/prompt before executing
- [ ] `x` with multi-selection when some issues are already in the target state: skips no-op transitions, counts only actual state changes
- [ ] Rapid repeated key presses (>30/sec): all events processed sequentially, no drops, mutating actions debounced
- [ ] `g g` in TUI: recognized as "scroll to top" (not go-to destination `g`); the second `g` within the go-to 1500ms window triggers the scroll-to-top handler
- [ ] `g` then timeout (1500ms) in TUI: go-to mode cancelled silently
- [ ] `g` then unrecognized key in TUI: go-to mode cancelled silently
- [ ] Overlay stacking: opening `?` (help) while a filter overlay is open stacks help on top; `Esc` closes only the topmost overlay
- [ ] Form with unsaved changes then `Esc` or `q`: dirty check dialog asks for confirmation before discarding
- [ ] Browser or terminal resize during keyboard dispatch: handler completes before re-layout
- [ ] Network failure during keyboard-triggered mutation: optimistic UI reverts, status/hint area shows error message for 3 seconds
- [ ] 401 during keyboard-triggered action: propagates to auth expiry flow
- [ ] 429 rate limit during keyboard-triggered action: displays rate-limit message with retry countdown
- [ ] Locked issue: comment shortcut (`c`) shows "Issue is locked" error; navigation shortcuts still work
- [ ] Archived repository: all mutation shortcuts show "Repository is archived" error; navigation shortcuts still work

### Boundary Constraints

- [ ] Maximum keybinding groups in help overlay: 8
- [ ] Maximum keybindings per group in help overlay: 20
- [ ] Maximum total keybindings in help overlay: 80
- [ ] Go-to mode timeout (TUI): 1500ms
- [ ] Keybinding handler execution budget: 16ms per key event
- [ ] Key event queue depth (TUI): 64 events maximum; overflow silently dropped with a warning log
- [ ] Bulk selection maximum: 50 issues
- [ ] Confirmation dialog prompt maximum width: 60 characters
- [ ] Status bar hint text (TUI): maximum `terminal_width - 20` characters; rightmost hints dropped first
- [ ] Web hint strip: maximum 8 hint groups at widths ≥1280px; 5 at ≥1024px; 3 at <1024px
- [ ] Shortcut keys limited to single ASCII characters, single ASCII characters with Ctrl/Cmd modifier, or two-key sequences starting with `g`

## Design

### Web UI Design

#### Issue List Page Shortcuts

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `↓` | Move focus to next issue row | No text input focused |
| `k` / `↑` | Move focus to previous issue row | No text input focused |
| `Enter` | Open focused issue | Focused row exists |
| `Home` / `g g` | Jump to first issue | No text input focused |
| `End` / `G` | Jump to last loaded issue | No text input focused |
| `c` | Open create issue form/dialog | No text input focused, user has write access |
| `x` | Close or reopen focused issue | No text input focused, user has write access |
| `l` | Open label picker for focused issue | No text input focused, user has write access |
| `a` | Open assignee picker for focused issue | No text input focused, user has write access |
| `m` | Open milestone picker for focused issue | No text input focused, user has write access |
| `f` | Focus the state filter control | No text input focused |
| `/` | Focus the search input | No text input focused |
| `?` | Toggle keyboard shortcut help overlay | Always |
| `Ctrl+K` / `:` | Open command palette | No modal open |
| `Esc` | Close open overlay → blur search input → navigate back | Cascade priority |
| `Space` | Toggle row selection (bulk mode) | No text input focused |

Focused-row styling: the currently keyboard-focused issue row receives a visible focus ring or highlight background that is distinct from hover styling. Focus follows the `j`/`k` cursor, not the mouse pointer. Mouse click sets the keyboard focus to the clicked row.

#### Issue Detail Page Shortcuts

| Key | Action | Condition |
|-----|--------|-----------|
| `j` / `↓` | Scroll down | No text input focused |
| `k` / `↑` | Scroll up | No text input focused |
| `n` | Jump to next comment | No text input focused |
| `p` | Jump to previous comment | No text input focused |
| `c` | Focus comment textarea | No text input focused, user has write access, issue not locked |
| `e` | Open edit issue dialog/inline editor | No text input focused, user has write access |
| `o` | Toggle issue open/closed state | No text input focused, user has write access |
| `l` | Open label picker | No text input focused, user has write access |
| `a` | Open assignee picker | No text input focused, user has write access |
| `m` | Open milestone picker | No text input focused, user has write access |
| `Ctrl+S` / `Cmd+S` | Submit active form (comment, edit) | Text input focused |
| `?` | Toggle keyboard shortcut help overlay | Always |
| `Ctrl+K` / `:` | Open command palette | No modal open |
| `Esc` | Close overlay → blur input → navigate back | Cascade priority |

#### Keyboard Shortcut Help Overlay (Web)

Triggered by `?` from any issue page. Displays a modal overlay with a semi-transparent backdrop. Content is organized into groups:

- **Navigation**: `j`/`k`, `↑`/`↓`, `Enter`, `Home`/`End`, `n`/`p`
- **Actions**: `c`, `x`, `e`, `o`, `l`, `a`, `m`
- **Search & Filter**: `/`, `f`
- **Selection**: `Space`
- **Global**: `?`, `Ctrl+K`/`:`, `Esc`

Each entry shows the key on the left and a short description on the right. The overlay is scrollable if content overflows. Dismissed by `Esc` or pressing `?` again.

#### Hint Strip (Web)

A persistent horizontal bar at the bottom of the issue list and detail pages showing the most relevant shortcuts for the current context. On the issue list: `j/k Navigate  Enter Open  c New  x Close  ? Help`. On the detail: `j/k Scroll  n/p Comment  c Reply  e Edit  ? Help`. The strip is responsive: it shows fewer hints on narrow viewports and hides entirely on mobile (viewport width <768px). The strip can be dismissed/hidden via a user preference stored in local storage.

#### Command Palette Issue Commands

The global command palette (`Ctrl+K` or `:`) includes the following issue-scoped commands when a repository is in context:

- `Create issue` — opens the create form
- `Close issue` — closes the focused/current issue
- `Reopen issue` — reopens the focused/current issue
- `Edit issue` — opens the edit form
- `Add comment` — focuses the comment textarea
- `Assign labels` — opens label picker
- `Assign users` — opens assignee picker
- `Set milestone` — opens milestone picker
- `Filter issues: Open / Closed / All` — sets state filter

Each command displays its keyboard shortcut hint right-aligned in the palette row.

#### Optimistic Updates (Web)

When a keyboard shortcut triggers a mutation (close, reopen, label change, assignee change):

1. The UI updates immediately (optimistic).
2. If the server responds with success, no further action needed.
3. If the server responds with an error (4xx/5xx/network), the optimistic update is reverted and a toast notification displays the error for 5 seconds.

### TUI UI Design

The TUI implements the full keybinding model documented in the `TUI_ISSUE_KEYBOARD_SHORTCUTS` specification. Key differences from the web UI:

- **6-layer priority dispatch**: Text Input → Modal/Overlay → Go-to Mode → Active Sub-screen → Issue-wide → Global
- **Go-to mode**: `g` prefix with 1500ms timeout for second key; `g i` navigates to issues
- **Status bar hints**: Context-sensitive hints displayed at the bottom of the terminal, responsive to terminal width (3 hints at 80col, 5-6 at 100col, 6-8 at 120col, all at 200+)
- **Bulk actions**: `Space` for multi-select, `x` for bulk close/reopen with confirmation when >5 selected
- **Overlay filter pickers**: `L` for labels, `a` for assignees, `m` for milestones — modal overlays with `j`/`k` navigation, `Space` toggle, `Enter` confirm
- **Form mode**: `Tab`/`Shift+Tab` for field cycling, `Ctrl+S` for submit, `Esc` for cancel with dirty check
- **Esc cascade**: Close topmost overlay → close single overlay → blur search → dirty confirmation → pop screen

### CLI Considerations

The CLI does not have persistent keyboard shortcuts in the traditional sense because commands are discrete invocations. However, the CLI's `codeplane issue` subcommands support:

- `--json` structured output for scripting keyboard-macro integrations
- `codeplane issue list --state open` as the equivalent of the `f` filter shortcut
- `codeplane issue close <number>` and `codeplane issue reopen <number>` as equivalents of the `x` shortcut
- `codeplane tui --screen issues --repo owner/repo` as a deep-link that launches the TUI directly into the issue keyboard context

### Desktop App Design

The desktop app embeds the web UI and inherits all web keyboard shortcuts. Additionally:

- Native menu items for "New Issue" (`Cmd+N` / `Ctrl+N`), "Close Issue" (`Cmd+W` context-dependent), and "Find Issue" (`Cmd+F` / `Ctrl+F`) are wired to the same actions as web shortcuts
- Menu items display the keyboard accelerator alongside the action name
- The global `Cmd+K` / `Ctrl+K` command palette is registered as a native accelerator to ensure it works even when the webview does not have focus

### Documentation

The following end-user documentation should be written:

1. **Keyboard Shortcuts Reference** — A dedicated page in the Codeplane docs listing all issue keyboard shortcuts organized by context (list, detail, form). Includes a visual cheat sheet image.
2. **Issue Triage Workflow Guide** — A tutorial showing how to triage 20 issues using only the keyboard, demonstrating navigation, filtering, bulk selection, and close/reopen flows.
3. **Command Palette Guide** — An existing doc page updated to include all issue-specific palette commands.
4. **Customization Note** — A short section explaining that keyboard shortcuts are not currently user-customizable but follow standard conventions (vim-style `j`/`k`, `?` for help, `:` for command palette).

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View shortcut hints / help overlay | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Navigate issue list (`j`/`k`/`Enter`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Navigate issue detail (`j`/`k`/`n`/`p`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Filter / search issues (`f`/`/`/`l`/`a`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Create issue (`c` on list) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit issue (`e` on detail) | ❌ | ❌ | ✅ (own issues) | ✅ | ✅ |
| Close/reopen issue (`x` / `o`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add comment (`c` on detail) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Assign labels/assignees/milestones (`l`/`a`/`m`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Bulk close/reopen (`x` with selection) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Lock/pin issue (via command palette) | ❌ | ❌ | ❌ | ✅ | ✅ |

Unauthorized users can see all keybinding hints and the help overlay — shortcuts for unavailable actions are shown but marked with a lock icon or "(requires write access)" annotation. Attempting the action returns a non-disruptive inline error rather than silently hiding the shortcut.

### Rate Limiting

- Keyboard dispatch itself generates zero API requests; only the resulting actions hit the server
- Issue list GET: 300 requests/minute
- Issue close/reopen PATCH: 60 requests/minute per user
- Issue create POST: 60 requests/minute per user
- Comment create POST: 60 requests/minute per user
- Label/assignee/milestone mutations: 120 requests/minute per user
- 429 responses: web displays a toast "Rate limited — retry in {N}s"; TUI displays a status bar message for 2 seconds
- Rapid mutating keypresses are debounced at the action layer (not the keyboard layer) to prevent accidental double-fires
- Bulk close/reopen batches requests with 50ms stagger to avoid triggering rate limits

### Data Privacy

- No keybinding, shortcut key, or keyboard event data contains PII
- Auth tokens are never displayed in hints, help overlays, status bars, or error messages
- Telemetry events record the key pressed and action triggered but never record the content of issue titles, bodies, or comments
- Local storage for hint strip visibility preference contains only a boolean flag, no user-identifying information

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue.keyboard.shortcut_used` | Any issue keybinding activated | `client` (web/tui/desktop), `repo_full_name`, `key`, `action`, `context` (list/detail/form), `viewport_width`, `viewport_height` |
| `issue.keyboard.help_opened` | `?` pressed on any issue screen | `client`, `repo_full_name`, `context`, `total_bindings_shown`, `groups_shown` |
| `issue.keyboard.help_closed` | Help overlay dismissed | `client`, `close_method` (esc/question_mark/click_outside), `time_open_ms`, `scroll_depth_percent` |
| `issue.keyboard.command_palette_action` | Issue action executed via command palette | `client`, `action`, `search_query_length`, `result_position`, `repo_full_name` |
| `issue.keyboard.hint_strip_visibility_changed` | User shows/hides the hint strip | `client`, `new_state` (visible/hidden) |
| `issue.keyboard.bulk_action` | Bulk close/reopen triggered | `client`, `action` (close/reopen), `selection_count`, `success_count`, `failure_count`, `repo_full_name` |
| `issue.keyboard.action_error` | Keyboard-triggered action failed | `client`, `key`, `action`, `error_type` (auth/permission/rate_limit/network/server), `http_status` |
| `issue.keyboard.optimistic_revert` | Optimistic update reverted due to server error | `client`, `action`, `error_type`, `repo_full_name` |
| `issue.keyboard.goto_completed` | TUI go-to `g i` navigated to issues | `origin_screen`, `time_to_second_key_ms` |
| `issue.keyboard.goto_cancelled` | TUI go-to cancelled | `cancel_reason` (timeout/esc/unrecognized), `time_elapsed_ms` |
| `issue.keyboard.context_switch` | Key meaning changed due to screen transition | `key`, `from_context`, `to_context`, `from_action`, `to_action` |
| `issue.keyboard.form_submit_method` | Issue/comment form submitted | `client`, `method` (keyboard_shortcut/button_click/palette), `form_type` (create_issue/edit_issue/comment) |

### Common Properties

All events include: `session_id`, `timestamp` (ISO 8601), `viewer_id` (hashed), `client_version`.

### Success Indicators

| Metric | Target | Interpretation |
|--------|--------|----------------|
| Keybinding adoption rate | >60% of issue sessions use ≥1 shortcut | Users are discovering and adopting shortcuts |
| Help overlay open rate | <30% of sessions, decreasing over time | Decreasing usage = shortcuts becoming intuitive |
| Command palette fallback rate | <25% of issue actions via palette | Lower = keybindings are well-learned |
| Keyboard-vs-click ratio for mutations | >40% keyboard after 30 days | Power users shifting to keyboard |
| Bulk action adoption | >10% of close/reopen actions | Multi-select is useful |
| Form submit via `Ctrl+S`/`Cmd+S` | >50% of form submissions | Keyboard-first form completion |
| Action error rate from shortcuts | <2% | Shortcuts reliably trigger successful actions |
| Key processing latency p99 | <16ms | Shortcuts feel instant |
| Esc cascade correctness | >99% | Esc always does what user expects |
| TUI go-to completion rate | >80% of activations | Users complete the two-key sequence |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Key event received | `key`, `modifiers`, `context` (list/detail/form), `focus_element`, `client` |
| `debug` | Key dispatched to handler | `key`, `handler_name`, `priority_layer`, `context` |
| `debug` | Key suppressed by focus guard | `key`, `suppression_reason` (input_focused/modal_open/unauthorized), `context` |
| `debug` | Go-to mode entered (TUI) | `context`, `timestamp` |
| `debug` | Go-to mode resolved (TUI) | `destination`, `elapsed_ms` |
| `debug` | Status bar / hint strip updated | `hint_count`, `truncated`, `viewport_width`, `context` |
| `debug` | Esc cascade resolved | `cascade_level` (overlay/search/form/pop), `context` |
| `info` | Help overlay toggled | `action` (open/close), `context`, `groups_count`, `entries_count`, `client` |
| `info` | Issue mutation triggered via shortcut | `key`, `action`, `repo`, `issue_number`, `client` |
| `info` | Bulk action triggered | `action`, `selection_count`, `repo`, `client` |
| `warn` | Action failed after keyboard trigger | `key`, `action`, `error_type`, `http_status`, `repo`, `issue_number` |
| `warn` | Optimistic revert triggered | `action`, `error_type`, `repo`, `issue_number` |
| `warn` | Key event queue overflow (TUI) | `dropped_count`, `queue_depth` |
| `warn` | Rate limit hit from keyboard action | `action`, `retry_after_seconds` |
| `error` | Keyboard handler threw exception | `key`, `handler_name`, `error_message`, `stack_trace` |
| `error` | Auth error during keyboard action | `action`, `repo`, `http_status` |

Web logs go to the browser console (structured JSON in production builds). TUI logs go to stderr. Log level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_keyboard_events_total` | Counter | `client`, `key`, `action`, `context` | Total keyboard shortcut activations |
| `codeplane_issue_keyboard_handler_duration_ms` | Histogram | `client`, `action` | Time from key event to handler completion (buckets: 1, 2, 4, 8, 16, 32, 64ms) |
| `codeplane_issue_keyboard_suppressed_total` | Counter | `client`, `reason` | Keys suppressed by focus/modal guards |
| `codeplane_issue_keyboard_action_errors_total` | Counter | `client`, `action`, `error_type` | Failed keyboard-triggered mutations |
| `codeplane_issue_keyboard_optimistic_reverts_total` | Counter | `client`, `action` | Optimistic updates that were reverted |
| `codeplane_issue_keyboard_bulk_actions_total` | Counter | `client`, `action` | Bulk close/reopen operations |
| `codeplane_issue_keyboard_help_opens_total` | Counter | `client`, `context` | Help overlay opens |
| `codeplane_issue_keyboard_palette_actions_total` | Counter | `client`, `action` | Issue actions via command palette |
| `codeplane_issue_keyboard_goto_total` | Counter | `outcome` (completed/cancelled/timeout) | TUI go-to activations |
| `codeplane_issue_keyboard_queue_overflow_total` | Counter | | TUI key event queue overflows |

### Alerts and Runbooks

#### Alert: High keyboard action error rate

- **Condition**: `rate(codeplane_issue_keyboard_action_errors_total[5m]) / rate(codeplane_issue_keyboard_events_total[5m]) > 0.05` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_issue_keyboard_action_errors_total` by `error_type` label to identify if errors are auth, permission, rate_limit, network, or server errors.
  2. If `error_type=server`: check API server health, database connectivity, and recent deployments. Inspect server error logs for the issue endpoints.
  3. If `error_type=auth`: check session/token expiry rates. Investigate whether a recent deployment changed auth middleware behavior.
  4. If `error_type=rate_limit`: check if rate limit thresholds were recently changed or if a specific user/bot is triggering excessive mutations.
  5. If `error_type=network`: check client connectivity, CDN health, and DNS resolution.
  6. Verify the issue is not caused by a client-side regression by checking client version distribution in error events.

#### Alert: Keyboard handler latency spike

- **Condition**: `histogram_quantile(0.99, codeplane_issue_keyboard_handler_duration_ms) > 32` for 3 minutes
- **Severity**: Warning
- **Runbook**:
  1. Identify which `action` label has elevated latency using the histogram breakdown.
  2. If the slow handler is a mutation (close/reopen/comment), the bottleneck is likely the API call — check API endpoint latency.
  3. If the slow handler is navigation (j/k/scroll), the bottleneck is likely rendering — check for DOM thrashing, excessive re-renders, or layout recalculations.
  4. In the TUI, check terminal emulator performance and whether the terminal dimensions are unusually large.
  5. Check for memory leaks in the keyboard handler registration (leaked event listeners, un-cleaned-up timers).
  6. Review recent client-side code changes to the keyboard dispatch path.

#### Alert: Key event queue overflow (TUI)

- **Condition**: `rate(codeplane_issue_keyboard_queue_overflow_total[5m]) > 0` sustained for 2 minutes
- **Severity**: Warning
- **Runbook**:
  1. Queue overflow means >64 key events accumulated before being processed. This usually indicates a blocked event loop.
  2. Check if any keyboard handler is performing synchronous blocking work (e.g., synchronous file I/O, large computation).
  3. Check if the TUI rendering pipeline is backed up (excessive re-renders, slow layout calculations).
  4. If overflow correlates with a specific action, that action's handler likely has a performance regression.
  5. Increase `CODEPLANE_LOG_LEVEL=debug` to see individual key dispatch timing.

#### Alert: Optimistic revert rate spike

- **Condition**: `rate(codeplane_issue_keyboard_optimistic_reverts_total[5m]) / rate(codeplane_issue_keyboard_events_total{action=~"close|reopen|label_add|label_remove|assign|unassign"}[5m]) > 0.10` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. High revert rate means the server is rejecting mutations that the client applied optimistically.
  2. Check `codeplane_issue_keyboard_action_errors_total` by `error_type` to classify failures.
  3. If errors are 409 (conflict), a concurrent mutation race condition may exist — check if multiple users/agents are modifying the same issues.
  4. If errors are 403, check whether repository permissions were recently changed.
  5. If errors are 5xx, escalate to API server investigation.
  6. Verify that the optimistic update logic matches the server's validation rules (e.g., closing an already-closed issue).

### Error Cases and Failure Modes

| Error | Detection | User Impact | Recovery |
|-------|-----------|-------------|----------|
| Handler throws exception | try/catch in dispatch loop | Key ignored; toast/status flash for 2s | Error logged; no state corruption |
| Close/reopen API failure | PATCH rejects (4xx/5xx/network) | Optimistic revert; error toast/status for 3s | Retry manually or via `R` key (TUI) |
| Create issue API failure | POST rejects | Form re-enabled; error shown; field values preserved | Fix validation errors and resubmit |
| Comment creation API failure | POST rejects | Optimistic comment removed; textarea refilled with content | Resubmit via `Ctrl+S` |
| Bulk close partial failure | Mixed 2xx/4xx responses | Successful state changes kept; failed ones reverted; summary toast | Status shows "N of M failed" |
| Go-to timeout (TUI) | 1500ms timer fires | Cancelled silently; hints revert | Press `g` again |
| Resize during dispatch | Resize event during handler | Handler completes; re-layout after | Automatic |
| SSE disconnect | Connection drops | Keyboard works; data may be stale | Reconnect happens automatically |
| 401 auth expiry | API returns 401 | Redirected to login / auth error screen | Re-authenticate |
| 429 rate limit | API returns 429 | Toast/status with countdown; action not retried automatically | Wait and retry |
| Queue overflow (TUI, >64) | Depth check | Oldest events processed; newest dropped; warning logged | Automatic; transient |
| Help overlay >80 entries | Count guard | Extra entries not shown; "…" indicator | Reduce active keybinding scope |

## Verification

### E2E Tests — Web UI (Playwright)

#### Issue List Keyboard Navigation (12 tests)

1. `web-issue-keyboard-j-moves-focus-down` — Press `j`, verify next row has focus highlight
2. `web-issue-keyboard-k-moves-focus-up` — Press `k`, verify previous row has focus highlight
3. `web-issue-keyboard-down-arrow-moves-focus-down` — Press `↓`, same as `j`
4. `web-issue-keyboard-up-arrow-moves-focus-up` — Press `↑`, same as `k`
5. `web-issue-keyboard-enter-opens-issue-detail` — Focus row, press `Enter`, verify detail page loads
6. `web-issue-keyboard-home-jumps-to-first` — Press `Home`, verify first issue focused
7. `web-issue-keyboard-end-jumps-to-last` — Press `End`, verify last loaded issue focused
8. `web-issue-keyboard-j-at-bottom-does-not-wrap` — Focus last row, press `j`, verify focus stays
9. `web-issue-keyboard-k-at-top-does-not-move` — Focus first row, press `k`, verify focus stays
10. `web-issue-keyboard-empty-list-navigation-noop` — Empty list, press `j`/`k`/`Enter`, verify no errors
11. `web-issue-keyboard-single-item-navigation` — Single issue, press `j`/`k`, verify no movement; `Enter` opens
12. `web-issue-keyboard-focus-follows-click` — Click a row, verify keyboard focus moves to clicked row

#### Issue List Keyboard Actions (11 tests)

13. `web-issue-keyboard-c-opens-create-form` — Press `c`, verify create form/dialog opens
14. `web-issue-keyboard-x-closes-open-issue` — Focus open issue, press `x`, verify state changes to closed (optimistic)
15. `web-issue-keyboard-x-reopens-closed-issue` — Focus closed issue, press `x`, verify state changes to open (optimistic)
16. `web-issue-keyboard-x-reverts-on-server-error` — Mock 500, press `x`, verify optimistic revert and error toast
17. `web-issue-keyboard-l-opens-label-picker` — Press `l`, verify label picker overlay opens
18. `web-issue-keyboard-a-opens-assignee-picker` — Press `a`, verify assignee picker opens
19. `web-issue-keyboard-m-opens-milestone-picker` — Press `m`, verify milestone picker opens
20. `web-issue-keyboard-f-focuses-state-filter` — Press `f`, verify state filter control is focused
21. `web-issue-keyboard-slash-focuses-search` — Press `/`, verify search input is focused
22. `web-issue-keyboard-space-selects-row` — Press `Space`, verify row shows selection indicator
23. `web-issue-keyboard-space-deselects-row` — Select then `Space` again, verify deselection

#### Issue List Suppression (6 tests)

24. `web-issue-keyboard-suppressed-when-search-focused` — Focus search, press `j`, verify no row navigation
25. `web-issue-keyboard-suppressed-when-create-form-open` — Open create form, press `x`, verify no close action
26. `web-issue-keyboard-esc-blurs-search` — Focus search, press `Esc`, verify search blurred
27. `web-issue-keyboard-esc-closes-modal` — Open help, press `Esc`, verify help closed
28. `web-issue-keyboard-ctrl-s-submits-from-input` — In create form, press `Ctrl+S`, verify form submits
29. `web-issue-keyboard-c-types-in-search` — Focus search, press `c`, verify "c" typed, no create form

#### Issue Detail Keyboard Navigation (8 tests)

30. `web-issue-detail-keyboard-j-scrolls-down` — Press `j`, verify page scrolled down
31. `web-issue-detail-keyboard-k-scrolls-up` — Press `k`, verify page scrolled up
32. `web-issue-detail-keyboard-n-jumps-next-comment` — Press `n`, verify scroll to next comment
33. `web-issue-detail-keyboard-p-jumps-prev-comment` — Press `p`, verify scroll to previous comment
34. `web-issue-detail-keyboard-n-at-last-comment-noop` — At last comment, press `n`, verify no scroll change
35. `web-issue-detail-keyboard-p-at-first-comment-noop` — At first comment, press `p`, verify no scroll change
36. `web-issue-detail-keyboard-n-with-no-comments` — Issue with 0 comments, press `n`, verify no error
37. `web-issue-detail-keyboard-scroll-position-preserved-on-focus-change` — Scroll, open/close help, verify scroll position preserved

#### Issue Detail Keyboard Actions (8 tests)

38. `web-issue-detail-keyboard-c-focuses-comment-textarea` — Press `c`, verify comment textarea focused
39. `web-issue-detail-keyboard-e-opens-edit` — Press `e`, verify edit form/dialog opens
40. `web-issue-detail-keyboard-o-closes-open-issue` — On open issue, press `o`, verify closed (optimistic)
41. `web-issue-detail-keyboard-o-reopens-closed-issue` — On closed issue, press `o`, verify reopened
42. `web-issue-detail-keyboard-l-opens-label-picker` — Press `l`, verify label picker
43. `web-issue-detail-keyboard-a-opens-assignee-picker` — Press `a`, verify assignee picker
44. `web-issue-detail-keyboard-c-on-locked-issue-shows-error` — Locked issue, press `c`, verify error message
45. `web-issue-detail-keyboard-o-on-archived-repo-shows-error` — Archived repo, press `o`, verify error message

#### Help Overlay (7 tests)

46. `web-issue-keyboard-question-opens-help` — Press `?`, verify overlay visible with groups
47. `web-issue-keyboard-question-closes-help` — Help open, press `?`, verify overlay hidden
48. `web-issue-keyboard-esc-closes-help` — Help open, press `Esc`, verify overlay hidden
49. `web-issue-keyboard-help-shows-list-shortcuts` — On list, verify Navigation, Actions, Filter groups
50. `web-issue-keyboard-help-shows-detail-shortcuts` — On detail, verify Navigation, Actions groups
51. `web-issue-keyboard-help-scrollable` — With many bindings, verify scroll works
52. `web-issue-keyboard-help-not-triggered-in-input` — Focus search, press `?`, verify typed not triggered

#### Command Palette Issue Commands (5 tests)

53. `web-issue-keyboard-ctrl-k-opens-palette` — Press `Ctrl+K`, verify palette open
54. `web-issue-keyboard-palette-create-issue` — Open palette, type "create issue", select, verify form opens
55. `web-issue-keyboard-palette-close-issue` — On detail, palette "close issue", verify state change
56. `web-issue-keyboard-palette-shows-shortcut-hints` — Verify palette entries show keybinding hints
57. `web-issue-keyboard-palette-filter-issues` — Palette "filter open", verify state filter applied

#### Hint Strip (5 tests)

58. `web-issue-keyboard-hint-strip-visible-on-list` — Verify hint strip with correct shortcuts
59. `web-issue-keyboard-hint-strip-updates-on-detail` — Navigate to detail, verify hints change
60. `web-issue-keyboard-hint-strip-responsive-narrow` — Narrow viewport, verify fewer hints
61. `web-issue-keyboard-hint-strip-hidden-on-mobile` — Viewport <768px, verify strip hidden
62. `web-issue-keyboard-hint-strip-dismiss-preference` — Dismiss strip, reload, verify stays hidden

#### Optimistic Update Behavior (5 tests)

63. `web-issue-keyboard-close-optimistic-success` — Close via `x`, verify instant UI update, server confirms
64. `web-issue-keyboard-close-optimistic-revert` — Close via `x`, mock error, verify revert and toast
65. `web-issue-keyboard-label-add-optimistic` — Add label via picker, verify instant update
66. `web-issue-keyboard-comment-optimistic-revert` — Submit comment, mock error, verify content restored to textarea
67. `web-issue-keyboard-bulk-close-partial-failure` — Bulk close 3, mock 1 failure, verify 2 stay closed, 1 reverts

#### Permission & Auth Edge Cases (4 tests)

68. `web-issue-keyboard-unauthorized-action-shows-error` — Read-only user presses `c`, verify error message
69. `web-issue-keyboard-401-redirects-to-login` — Mock 401, trigger action, verify auth redirect
70. `web-issue-keyboard-429-shows-rate-limit-toast` — Mock 429, trigger action, verify toast with countdown
71. `web-issue-keyboard-shortcuts-visible-for-readonly` — Read-only user, verify hints still shown with lock indicators

### E2E Tests — TUI (`@microsoft/tui-test`)

The TUI E2E tests are comprehensively specified in `TUI_ISSUE_KEYBOARD_SHORTCUTS.md` and include **120 tests** across:

- Terminal snapshot tests for status bar hints (9 tests)
- Terminal snapshot tests for help overlay (6 tests)
- List navigation keyboard tests (11 tests)
- List action keyboard tests (9 tests)
- Filter keyboard tests (7 tests)
- Detail navigation keyboard tests (6 tests)
- Detail action keyboard tests (5 tests)
- Form keyboard tests (8 tests)
- Overlay keyboard tests (5 tests)
- Priority & suppression tests (7 tests)
- Go-to mode tests (8 tests)
- Rapid input tests (5 tests)
- Context disambiguation tests (6 tests)
- Responsive tests (14 tests)
- Integration workflow tests (14 tests)

### E2E Tests — API (supporting validation) (4 tests)

72. `api-issue-close-reopen-round-trip` — POST create, PATCH close, verify closed_at set, PATCH reopen, verify closed_at null
73. `api-issue-bulk-close-sequential` — Create 5 issues, close all sequentially, verify all closed
74. `api-issue-rate-limit-429` — Exceed rate limit on close endpoint, verify 429 with Retry-After header
75. `api-issue-mutation-on-archived-repo` — Archive repo, attempt PATCH close, verify 403

### Cross-Client Consistency Tests (3 tests)

76. `cross-client-issue-close-web-reflects-in-tui` — Close issue via web shortcut, verify TUI list reflects closed state on next fetch
77. `cross-client-issue-create-web-visible-in-cli` — Create issue via web `c` shortcut, verify `codeplane issue list` includes it
78. `cross-client-keyboard-action-parity` — Verify the set of keyboard-triggerable actions matches between web UI and TUI (no action available in one but missing in the other)

**Total: 78 web/API/cross-client tests + 120 TUI tests = 198 tests**

All tests that fail due to unimplemented backends are left failing — never skipped or commented out.

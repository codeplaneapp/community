# TUI_WORKFLOW_ACTIONS

Specification for TUI_WORKFLOW_ACTIONS.

## High-Level User POV

Workflow actions — cancel, rerun, and resume — are the primary mutation operations a developer performs on workflow runs in the Codeplane TUI. These actions appear on multiple screens (Workflow Run Detail, Workflow Run List) and follow a consistent interaction model that respects run state, user permissions, and terminal constraints.

When viewing a workflow run detail screen, the developer sees context-sensitive keybinding hints in the status bar: `c:cancel`, `r:rerun`, `R:resume`. Only the actions valid for the current run state are rendered in normal color; invalid actions appear dimmed (ANSI 245), and users without write access see all action hints dimmed. Pressing an action key opens a confirmation overlay — a centered modal with a clear action label ("Cancel run #42?", "Rerun run #42?", "Resume run #42?"), the workflow name, and two buttons: Confirm and Cancel. The user presses `Enter` to confirm or `Esc` to dismiss. During the API call, a spinner replaces the Confirm button text. On success, the modal dismisses and the screen state updates: cancel transitions the run to "cancelled" with steps halted, rerun navigates to the newly created run's detail screen, and resume reconnects SSE streaming and re-activates the run's step progression.

On the workflow run list screen, actions are more streamlined: pressing `c`, `r`, or `m` (resume) on a focused run row triggers an immediate optimistic update without a confirmation overlay. The row's status icon and color update instantly. If the API call fails, the row reverts to its previous state and a flash message appears in the status bar describing the error. This direct-action model suits the run list's browsing context where the developer is scanning multiple runs and wants to act quickly.

State gating is strict. Cancel (`c`) is only available when a run's status is `running` or `queued`. Rerun (`r`) is only available when the run has reached a terminal state: `success`, `failure`, `cancelled`, or `timeout`. Resume (`R` on detail, `m` on list) is only available when the run is `cancelled` or `failure`. Pressing an action key when the run is in an incompatible state produces no overlay or API call — instead, a brief status bar message explains why: "Run is not active", "Run is still in progress", or "Run completed successfully". These messages auto-dismiss after 3 seconds.

Error handling is layered. Permission errors (403) show "Permission denied" in the status bar. Conflict errors (409) show "Run cannot be {action} in current state" — this handles race conditions where the run's state changed between render and action. Network errors show an error message inside the confirmation overlay (on detail) or as a status bar flash (on list), with the option to retry. Rate limiting (429) shows "Rate limited. Retry in {N}s." in the status bar with no auto-retry.

After a successful rerun, the newly created run ID is returned by the API. On the run detail screen, the TUI automatically navigates to the new run's detail view. On the run list, the new run appears at the top of the list after the next data refresh (triggered automatically on action success). After a successful resume, the current run's SSE connection is re-established and step statuses begin updating in real-time. After a successful cancel, the run transitions to cancelled state, the SSE connection closes (if active), and any streaming log panels finalize.

The entire action system works at all terminal sizes. At 80×24, confirmation overlays use 90% width and 30% height with compact text. At 120×40, overlays use 40% width and 20% height. The keybinding hints in the status bar abbreviate at minimum sizes (e.g., `c:cancel` becomes just `c`). All action interactions are keyboard-only — no mouse targets.

## Acceptance Criteria

### Definition of Done
- [ ] Cancel, rerun, and resume actions are available from the Workflow Run Detail screen (TUI_WORKFLOW_RUN_DETAIL)
- [ ] Cancel, rerun, and resume actions are available from the Workflow Run List screen (TUI_WORKFLOW_RUN_LIST)
- [ ] Actions call the correct API endpoints: `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel`, `POST /api/repos/:owner/:repo/workflows/runs/:id/rerun`, `POST /api/repos/:owner/:repo/workflows/runs/:id/resume`
- [ ] Actions are state-gated: cancel only for `running`/`queued`, rerun only for `success`/`failure`/`cancelled`/`timeout`, resume only for `cancelled`/`failure`
- [ ] Pressing an action key in an incompatible run state shows a descriptive status bar message and performs no API call
- [ ] On the run detail screen, each action shows a confirmation overlay before executing
- [ ] On the run list screen, actions execute immediately with optimistic UI (no confirmation overlay)
- [ ] Confirmation overlays display action label, run number, workflow name, and Confirm/Cancel buttons
- [ ] Confirmation overlays show a spinner during the API call (replacing Confirm button text)
- [ ] Confirmation overlays handle API errors inline with a retry option
- [ ] On successful cancel: run status transitions to `cancelled`, SSE connection closes, streaming log panels finalize
- [ ] On successful rerun: API returns new run ID; detail screen navigates to new run; list screen triggers data refresh
- [ ] On successful resume: detail screen re-establishes SSE connection, step statuses resume updating
- [ ] Optimistic UI on the run list reverts on API error with status bar flash
- [ ] Read-only users see all action keybinding hints dimmed (ANSI 245) and receive "Permission denied" on action attempt
- [ ] Admin and write-access users see action keybinding hints in default color
- [ ] Status bar keybinding hints are context-sensitive, showing only valid action keys for the focused run state
- [ ] All actions log telemetry events on initiation, success, and failure

### Keyboard Interactions

#### Run Detail Screen
- [ ] `c`: Cancel run — opens confirmation overlay (only when run is `running` or `queued`)
- [ ] `r`: Rerun workflow — opens confirmation overlay (only when run is `success`, `failure`, `cancelled`, or `timeout`)
- [ ] `R`: Resume run — opens confirmation overlay (only when run is `cancelled` or `failure`)
- [ ] `Enter` (in overlay): Confirm action
- [ ] `Esc` (in overlay): Dismiss confirmation overlay
- [ ] `Tab` / `Shift+Tab` (in overlay): Cycle between Confirm and Cancel buttons

#### Run List Screen
- [ ] `c`: Cancel focused run immediately (optimistic, only when `running` or `queued`)
- [ ] `r`: Rerun focused run immediately (optimistic, only when terminal state)
- [ ] `m`: Resume focused run immediately (optimistic, only when `cancelled` or `failure`)

#### Invalid State Behavior
- [ ] `c` on terminal run → status bar: "Run is not active" (3s auto-dismiss)
- [ ] `r` on running/queued run → status bar: "Run is still in progress" (3s auto-dismiss)
- [ ] `R`/`m` on successful/queued/running run → status bar: "Run cannot be resumed in current state" (3s auto-dismiss)

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Confirmation overlay uses 90% width, 30% height; compact text (action label + buttons only, no workflow name); status bar hints abbreviate to single key letters only
- [ ] 120×40 – 199×59: Confirmation overlay uses 40% width, 20% height; full text with workflow name and run number; full keybinding hints
- [ ] 200×60+: Confirmation overlay uses 35% width, 18% height; includes additional context (trigger ref, commit SHA)

### Truncation & Boundary Constraints
- [ ] Workflow name in confirmation overlay: truncated at 35ch with `…`
- [ ] Run number in overlay: `#N` format, max 10ch
- [ ] Status bar flash messages: truncated at available status bar width minus fixed elements, with `…`
- [ ] Status bar flash messages auto-dismiss after 3 seconds
- [ ] Confirmation overlay minimum width: 30ch (even at smallest terminal sizes)
- [ ] Confirmation overlay minimum height: 5 rows (action label, blank line, buttons)
- [ ] Error messages in overlay: max 60ch, wrapped to 2 lines if needed
- [ ] Retry-After value in rate limit messages: displayed as integer seconds

### Edge Cases
- [ ] Terminal resize while confirmation overlay is open: overlay resizes proportionally (min 30ch width)
- [ ] Terminal resize during action API call: spinner continues, overlay resizes, API call uninterrupted
- [ ] Rapid action key presses (e.g., `c c c`): first press opens overlay, subsequent presses are no-ops while overlay is open
- [ ] Rapid action key presses on run list (e.g., `c c c`): first triggers optimistic update, subsequent are no-ops while in-flight
- [ ] Action key during another action's in-flight state: no-op
- [ ] SSE status update arrives while confirmation overlay is open: run state updates behind overlay; if state becomes incompatible (e.g., run completes while cancel overlay is open), overlay shows "Run state changed" and dismisses
- [ ] Network disconnect during action API call: overlay shows "Network error" with retry button (detail) or status bar flash (list)
- [ ] Run state changes between render and action press (race condition): 409 response handled gracefully with "Run cannot be {action} in current state"
- [ ] Rerun returns null (workflow definition deleted): overlay shows "Workflow no longer exists"
- [ ] Cancel on already-cancelled run: no-op, status bar "Run is already cancelled"
- [ ] Resume on successful run: no-op, status bar "Run completed successfully"
- [ ] Action after auth expiry: 401 → auth error screen
- [ ] Concurrent cancel from another user while viewing: SSE status event updates UI, action key reflects new state
- [ ] Unicode in workflow names in overlay: truncation respects grapheme clusters
- [ ] Null/missing workflow name in overlay: rendered as "Unknown workflow"
- [ ] No color support: action hints use text labels `[C:cancel]`/`[R:rerun]`/`[M:resume]` instead of colored text; overlay border uses ASCII (`+`,`-`,`|`) instead of box-drawing

## Design

### Layout Structure (Confirmation Overlay on Run Detail)

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows > ci > #42          │
├─────────────────────────────────────────────────────────────────┤
│ ◎ Running  #42  ci                                              │
│ push to main  abc1234  started 2m ago  elapsed 1m 45s           │
├───────────────────┬─────────────────────────────────────────────┤
│                   │                                             │
│     step list     │  ┌──────────────────────────┐              │
│     (dimmed)      │  │   Cancel run #42?         │              │
│                   │  │   ci                       │              │
│                   │  │                            │              │
│                   │  │   [Confirm]    [Cancel]    │              │
│                   │  └──────────────────────────┘              │
│                   │                                             │
├───────────────────┴─────────────────────────────────────────────┤
│ j/k:steps Enter:confirm Esc:dismiss                q:back       │
└─────────────────────────────────────────────────────────────────┘
```

### Layout Structure (Optimistic Action on Run List)

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows > ci > Runs           │
├──────────────────────────────────────────────────────────────────┤
│ ci › Runs (47)                                         / search  │
│ Filter: All                                                      │
├──────────────────────────────────────────────────────────────────┤
│ ✓  #47  push      main         abc1234  1m 23s  3h              │
│ ✕  #46  push      main         def5678  45s     1d   ← cancel  │
│ ◎  #45  manual    feature/x    012abcd  2m 10s  2d   optimistic │
│ …                                                                │
├──────────────────────────────────────────────────────────────────┤
│ j/k:nav Enter:detail c:cancel r:rerun m:resume f:filter q:back  │
│                              ⚡ Run #46 cancelled                │
└──────────────────────────────────────────────────────────────────┘
```

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for overlay layout, button rows, flash messages
- `<box position="absolute">` — Confirmation overlay centered on screen
- `<scrollbox>` — Not used directly by actions; actions overlay on top of parent screen scrollbox
- `<text>` — Action labels, workflow names, run numbers, status messages, button labels, error text, spinners
- `<input>` — Not used by actions (no text input required)

### Confirmation Overlay Component

The confirmation overlay is a reusable `<ActionConfirmationOverlay>` component accepting: `action` ("cancel" | "rerun" | "resume"), `runId`, `workflowName`, `onConfirm`, `onDismiss`, and `isLoading` props.

Structure:
```
<box position="absolute" top="center" left="center"
     width={overlayWidth} height={overlayHeight}
     border="single" borderColor="primary">
  <box flexDirection="column" padding={1} gap={1}>
    <text bold>{actionLabel} run #{runId}?</text>
    <text color="muted">{workflowName}</text>
    {error && <text color="error">{errorMessage}</text>}
    <box flexDirection="row" gap={2} justifyContent="center">
      <text reverse={confirmFocused} color={actionColor}>
        {isLoading ? "⠋ Working…" : "Confirm"}
      </text>
      <text reverse={cancelFocused}>Cancel</text>
    </box>
  </box>
</box>
```

Colors per action:
- Cancel: `error` (ANSI 196) — destructive action
- Rerun: `primary` (ANSI 33) — neutral action
- Resume: `success` (ANSI 34) — constructive action

Focus is trapped within the overlay. `Tab`/`Shift+Tab` cycles between Confirm and Cancel buttons. Default focus is on Confirm. Spinner animation cycles through `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms intervals via `useTimeline()`.

### Optimistic Action Component (Run List)

On the run list, actions use an `useOptimisticAction` hook pattern:

1. Action key pressed → validate run state client-side
2. Immediately update the row's status icon and color to the expected result state
3. Fire API call in background
4. On success: keep optimistic state; trigger silent data refresh for latest server state
5. On failure: revert row to previous state; show status bar flash with error message

For cancel: icon changes from `◎` (running, yellow) to `✕` (cancelled, muted) immediately.
For rerun: no visual change on the source row; after API returns, a refresh loads the new run at the top.
For resume: icon changes from `✕` (cancelled, muted) to `◎` (running, yellow) immediately.

### Status Bar Flash Messages

Flash messages appear in the left section of the status bar, replacing the keybinding hints temporarily. Messages use semantic colors:
- Success: green (ANSI 34) — "✓ Run #42 cancelled", "✓ Rerun started as #43", "✓ Run #42 resumed"
- Error: red (ANSI 196) — "✗ Permission denied", "✗ Run cannot be cancelled in current state"
- Warning: yellow (ANSI 178) — "⚠ Rate limited. Retry in 30s."
- Info: muted (ANSI 245) — "Run is not active", "Run is still in progress"

Flash messages auto-dismiss after 3 seconds. If a new flash arrives before the previous one dismisses, the new one replaces it immediately. After dismissal, keybinding hints are restored.

### Action State Machine

Each action follows a state machine:

```
idle → confirming → in_flight → success | error
                                 ↓         ↓
                              (screen    (retry or
                               update)   dismiss)
```

On the run list (no confirmation step):
```
idle → in_flight → success | error
                    ↓         ↓
                 (optimistic  (revert +
                  update)      flash)
```

### Keybindings

| Key | Screen | Action | Condition |
|-----|--------|--------|-----------|
| `c` | Run Detail | Open cancel confirmation overlay | Run is `running` or `queued` |
| `c` | Run List | Cancel focused run (optimistic) | Focused run is `running` or `queued` |
| `r` | Run Detail | Open rerun confirmation overlay | Run is `success`, `failure`, `cancelled`, or `timeout` |
| `r` | Run List | Rerun focused run (optimistic) | Focused run is terminal |
| `R` | Run Detail | Open resume confirmation overlay | Run is `cancelled` or `failure` |
| `m` | Run List | Resume focused run (optimistic) | Focused run is `cancelled` or `failure` |
| `Enter` | Overlay | Confirm action | Overlay open, not in-flight |
| `Esc` | Overlay | Dismiss overlay | Overlay open |
| `Tab` | Overlay | Focus next button | Overlay open |
| `Shift+Tab` | Overlay | Focus previous button | Overlay open |

### Responsive Behavior

**80×24 (minimum)**: Confirmation overlay uses 90% terminal width, 30% height (min 5 rows). Compact layout: action label on row 1, buttons on row 3, no workflow name shown. Status bar hints use abbreviated format: `c r R` (keys only, no labels). Flash messages truncated to fit.

**120×40 (standard)**: Confirmation overlay uses 40% width, 20% height. Full layout: action label, workflow name, gap, buttons. Status bar hints: `c:cancel r:rerun R:resume`. Flash messages full-length.

**200×60 (large)**: Confirmation overlay uses 35% width, 18% height. Expanded layout: action label, workflow name, trigger ref + commit SHA context line, gap, buttons. Status bar hints full with descriptions.

Resize during overlay: overlay proportions recalculate synchronously. Minimum overlay width enforced at 30ch — if terminal shrinks below threshold, overlay fills 95% width. API call state preserved across resize.

### Data Hooks
- `useWorkflowRunCancel(repo, runId)` from `@codeplane/ui-core` → `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel` — returns 204 on success
- `useWorkflowRunRerun(repo, runId)` from `@codeplane/ui-core` → `POST /api/repos/:owner/:repo/workflows/runs/:id/rerun` — returns new run object on success, null if workflow definition deleted
- `useWorkflowRunResume(repo, runId)` from `@codeplane/ui-core` → `POST /api/repos/:owner/:repo/workflows/runs/:id/resume` — returns 204 on success
- `useWorkflowRunDetail(repo, runId)` from `@codeplane/ui-core` → for re-fetching run state after action
- `useSSE("workflow_run_logs")` from SSE context → for reconnecting SSE after resume
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI navigation
- `useTimeline()` from `@opentui/react` — for spinner animation and flash message auto-dismiss timer

### Navigation
- `r` (rerun confirm, success) → `push("workflow-run-detail", { repo, runId: newRunId })` (navigates to the new run)
- `R` (resume confirm, success) → stays on same screen; SSE reconnects for resumed run
- `c` (cancel confirm, success) → stays on same screen; run status transitions to cancelled
- `Esc` (overlay) → returns to parent screen state (overlay dismissed, no navigation)

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View action keybinding hints | ✅ (dimmed) | ✅ (dimmed) | ✅ | ✅ |
| Cancel run | ❌ | ❌ | ✅ | ✅ |
| Rerun workflow | ❌ | ❌ | ✅ | ✅ |
| Resume run | ❌ | ❌ | ✅ | ✅ |

- All three action endpoints (cancel, rerun, resume) require write access to the repository
- Read-only and anonymous users see action keybinding hints dimmed in ANSI 245 (muted)
- Read-only users pressing an action key receive "Permission denied" in the status bar immediately (no overlay opens, no API call made)
- Permission check is performed client-side first (based on cached user role); server enforces authoritatively
- Admin users have all write-level permissions plus the ability to cancel/rerun/resume runs triggered by other users

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses during action API calls propagate to app-shell auth error screen
- Token is not passed in confirmation overlay rendering — only sent during the actual API call

### Rate Limiting
- 60 req/min for `POST` action endpoints (cancel, rerun, resume) — shared rate limit across all three
- 429 responses show "Rate limited. Retry in {Retry-After}s." in status bar
- No auto-retry on rate limit; user must wait and re-initiate the action
- Rate limit applies per-token, not per-action-type
- Confirmation overlay dismisses on rate limit (detail screen); optimistic update reverts (list screen)

### Input Sanitization
- Run ID is a numeric path parameter — validated as positive integer before API call
- No user-entered text is included in action API requests (cancel, rerun, resume are bodyless POSTs)
- Response bodies (new run ID from rerun) are validated as numeric before use in navigation
- Error messages from API responses are sanitized (stripped of HTML/control characters) before rendering in `<text>` elements

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workflow_action.initiated` | Action key pressed (valid state) | `repo`, `run_id`, `workflow_name`, `action` (cancel/rerun/resume), `source_screen` (detail/list), `run_status`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.workflow_action.confirmed` | Confirm pressed in overlay | `repo`, `run_id`, `workflow_name`, `action`, `source_screen`, `time_to_confirm_ms` |
| `tui.workflow_action.dismissed` | Esc pressed in overlay | `repo`, `run_id`, `workflow_name`, `action`, `source_screen`, `time_to_dismiss_ms` |
| `tui.workflow_action.success` | API returns success | `repo`, `run_id`, `workflow_name`, `action`, `source_screen`, `action_time_ms`, `new_run_id` (rerun only) |
| `tui.workflow_action.failure` | API returns error | `repo`, `run_id`, `workflow_name`, `action`, `source_screen`, `http_status`, `error_type`, `action_time_ms` |
| `tui.workflow_action.denied` | 403 on action | `repo`, `run_id`, `workflow_name`, `action`, `source_screen` |
| `tui.workflow_action.rate_limited` | 429 on action | `repo`, `run_id`, `action`, `retry_after_s` |
| `tui.workflow_action.invalid_state` | Action key on incompatible state | `repo`, `run_id`, `action`, `run_status`, `source_screen` |
| `tui.workflow_action.retry` | Retry after error in overlay | `repo`, `run_id`, `action`, `source_screen`, `retry_attempt` |
| `tui.workflow_action.optimistic_revert` | Optimistic update reverted on list | `repo`, `run_id`, `action`, `error_type`, `http_status` |
| `tui.workflow_action.sse_reconnect` | SSE reconnects after resume | `repo`, `run_id`, `reconnect_success`, `reconnect_time_ms` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Action success rate (all types) | >95% of confirmed attempts |
| Cancel success rate | >98% (most likely to succeed — run is still active) |
| Rerun success rate | >95% |
| Resume success rate | >90% (may fail if underlying issue persists) |
| Confirmation-to-action rate (detail) | >80% of overlay opens result in confirm |
| Dismissal rate (detail overlay) | <20% (low = users are intentional) |
| Optimistic revert rate (list) | <5% of optimistic actions |
| Invalid state press rate | <10% of action key presses |
| Permission denied rate | <3% (low = UI correctly dims hints) |
| Time to action completion | <2s for cancel/resume, <3s for rerun |
| SSE reconnect success after resume | >95% |
| Action usage rate | >15% of run detail views on actionable runs |
| Error rate | <2% |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Action key pressed | `WorkflowActions: key pressed [repo={r}] [run_id={id}] [action={a}] [run_status={s}] [screen={scr}]` |
| `debug` | State validation | `WorkflowActions: state check [repo={r}] [run_id={id}] [action={a}] [valid={bool}] [status={s}]` |
| `debug` | Overlay opened | `WorkflowActions: overlay opened [repo={r}] [run_id={id}] [action={a}]` |
| `debug` | Overlay dismissed | `WorkflowActions: overlay dismissed [repo={r}] [run_id={id}] [action={a}]` |
| `debug` | Optimistic update applied | `WorkflowActions: optimistic update [repo={r}] [run_id={id}] [action={a}] [old_status={old}] [new_status={new}]` |
| `info` | Action initiated (API call) | `WorkflowActions: initiated [repo={r}] [run_id={id}] [action={a}] [screen={scr}]` |
| `info` | Action completed | `WorkflowActions: completed [repo={r}] [run_id={id}] [action={a}] [success={bool}] [duration={ms}ms]` |
| `info` | Rerun created new run | `WorkflowActions: rerun created [repo={r}] [run_id={id}] [new_run_id={nid}] [duration={ms}ms]` |
| `info` | Resume SSE reconnect | `WorkflowActions: sse reconnected [repo={r}] [run_id={id}] [success={bool}]` |
| `warn` | Action API failed | `WorkflowActions: failed [repo={r}] [run_id={id}] [action={a}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `WorkflowActions: rate limited [repo={r}] [run_id={id}] [action={a}] [retry_after={s}]` |
| `warn` | Optimistic revert | `WorkflowActions: optimistic revert [repo={r}] [run_id={id}] [action={a}] [status={code}]` |
| `warn` | State conflict (409) | `WorkflowActions: state conflict [repo={r}] [run_id={id}] [action={a}] [expected={e}] [actual={a}]` |
| `warn` | Run state changed during overlay | `WorkflowActions: state changed during confirm [repo={r}] [run_id={id}] [action={a}] [new_status={s}]` |
| `error` | Auth error | `WorkflowActions: auth error [repo={r}] [run_id={id}] [action={a}] [status=401]` |
| `error` | Permission denied | `WorkflowActions: permission denied [repo={r}] [run_id={id}] [action={a}] [status=403]` |
| `error` | Network error | `WorkflowActions: network error [repo={r}] [run_id={id}] [action={a}] [error={msg}]` |
| `error` | Rerun returned null | `WorkflowActions: rerun null [repo={r}] [run_id={id}] — workflow definition may be deleted` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during confirmation overlay | Overlay resizes proportionally (min 30ch width, fallback to 95% at very small sizes) | Synchronous |
| Resize during API in-flight | Spinner continues, overlay/flash resizes, API call uninterrupted | Independent |
| SSE disconnect during resume in-flight | Resume API succeeds but SSE fails to reconnect; status bar shows "⚡ SSE disconnected"; run status shows resumed but logs don't stream | Auto-reconnect with backoff |
| SSE status update during confirmation overlay | Run state updates behind overlay; if state becomes incompatible, overlay shows "Run state changed" message and dismisses after 2s | Automatic |
| Auth expiry during action | 401 → overlay dismissed → auth error screen | Re-auth via CLI |
| Network timeout (30s) on action | Overlay: "Request timed out. Press Enter to retry or Esc to dismiss." / List: status bar flash + optimistic revert | User retries or dismisses |
| Action 403 (permission denied) | Overlay: error shown inline / List: status bar flash "Permission denied" + optimistic revert | Informational |
| Action 404 (run not found) | Overlay: "Run not found" / List: status bar flash + optimistic revert | Navigate back |
| Action 409 (state conflict) | Overlay: "Run cannot be {action} in current state" / List: status bar flash + optimistic revert + row status refreshed from server | Informational |
| Rerun returns null | Overlay shows "Workflow no longer exists. The workflow definition may have been deleted." with dismiss button | User dismisses |
| Rapid action key during in-flight | No-op — action state machine prevents re-entry while in `in_flight` state | Automatic |
| Multiple runs cancelled rapidly on list | Each triggers independent optimistic update + API call; failures revert independently | Independent |
| No color support | Overlay border uses ASCII (`+`/`-`/`|`); action labels use text prefixes `[CANCEL]`/`[RERUN]`/`[RESUME]`; status uses `[OK]`/`[ERR]` | Theme detection |
| Concurrent cancel from another user | SSE status event updates run state; action key reflects new state on next press | Automatic |

### Failure Modes
- Component crash in overlay → overlay dismissed, error flash in status bar; parent screen still functional; user retries action key
- Component crash in optimistic update → global error boundary → "Press r to restart"
- All action API calls fail → error displayed per context (overlay or flash); `q` still works for navigation; user can retry individually
- SSE fails permanently after resume → run shows as resumed but static; status bar shows "SSE unavailable"; user can manually refresh with `Ctrl+R`
- Rerun navigates to non-existent run (race condition) → run detail shows 404 error state; user navigates back

## Verification

### Test File: `e2e/tui/workflows.test.ts`

### Terminal Snapshot Tests (30 tests)

- SNAP-WA-001: Cancel confirmation overlay at 120×40 — action label, workflow name, Confirm/Cancel buttons, primary border
- SNAP-WA-002: Rerun confirmation overlay at 120×40 — blue-accented Confirm button
- SNAP-WA-003: Resume confirmation overlay at 120×40 — green-accented Confirm button
- SNAP-WA-004: Cancel overlay at 80×24 — 90% width, compact layout (no workflow name)
- SNAP-WA-005: Rerun overlay at 80×24 — compact layout
- SNAP-WA-006: Resume overlay at 80×24 — compact layout
- SNAP-WA-007: Cancel overlay at 200×60 — expanded layout with trigger ref and commit SHA
- SNAP-WA-008: Overlay with spinner during API call — "⠋ Working…" replacing Confirm text
- SNAP-WA-009: Overlay with error message — red error text, retry prompt
- SNAP-WA-010: Overlay with "Run state changed" message — auto-dismissing
- SNAP-WA-011: Overlay with "Request timed out" message and retry prompt
- SNAP-WA-012: Overlay with "Workflow no longer exists" message (rerun null)
- SNAP-WA-013: Status bar flash — success cancel "✓ Run #42 cancelled" in green
- SNAP-WA-014: Status bar flash — success rerun "✓ Rerun started as #43" in green
- SNAP-WA-015: Status bar flash — success resume "✓ Run #42 resumed" in green
- SNAP-WA-016: Status bar flash — error "✗ Permission denied" in red
- SNAP-WA-017: Status bar flash — error "✗ Run cannot be cancelled in current state" in red
- SNAP-WA-018: Status bar flash — warning "⚠ Rate limited. Retry in 30s." in yellow
- SNAP-WA-019: Status bar flash — info "Run is not active" in muted
- SNAP-WA-020: Status bar flash — info "Run is still in progress" in muted
- SNAP-WA-021: Dimmed action hints for read-only user on run detail
- SNAP-WA-022: Dimmed action hints for read-only user on run list
- SNAP-WA-023: Context-sensitive hints — running run shows `c:cancel` highlighted, `r:rerun` dimmed
- SNAP-WA-024: Context-sensitive hints — failed run shows `r:rerun R:resume` highlighted, `c:cancel` dimmed
- SNAP-WA-025: Optimistic cancel on run list — row icon changes from ◎ to ✕
- SNAP-WA-026: Optimistic resume on run list — row icon changes from ✕ to ◎
- SNAP-WA-027: Optimistic revert on run list — row returns to original state after error
- SNAP-WA-028: Overlay Confirm button focused (reverse video)
- SNAP-WA-029: Overlay Cancel button focused (reverse video)
- SNAP-WA-030: Status bar hints at 80×24 — abbreviated key-only format

### Keyboard Interaction Tests (48 tests)

- KEY-WA-001: `c` on running run (detail) → opens cancel confirmation overlay
- KEY-WA-002: `Enter` in cancel overlay → triggers API call, shows spinner
- KEY-WA-003: `Esc` in cancel overlay → dismisses overlay, no API call
- KEY-WA-004: `c` on queued run (detail) → opens cancel confirmation overlay
- KEY-WA-005: `c` on successful run (detail) → no overlay, status bar "Run is not active"
- KEY-WA-006: `c` on failed run (detail) → no overlay, status bar "Run is not active"
- KEY-WA-007: `c` on cancelled run (detail) → no overlay, status bar "Run is already cancelled"
- KEY-WA-008: `r` on successful run (detail) → opens rerun confirmation overlay
- KEY-WA-009: `r` on failed run (detail) → opens rerun confirmation overlay
- KEY-WA-010: `r` on cancelled run (detail) → opens rerun confirmation overlay
- KEY-WA-011: `r` on timed-out run (detail) → opens rerun confirmation overlay
- KEY-WA-012: `r` on running run (detail) → no overlay, status bar "Run is still in progress"
- KEY-WA-013: `r` on queued run (detail) → no overlay, status bar "Run is still in progress"
- KEY-WA-014: `R` on cancelled run (detail) → opens resume confirmation overlay
- KEY-WA-015: `R` on failed run (detail) → opens resume confirmation overlay
- KEY-WA-016: `R` on successful run (detail) → no overlay, status bar "Run completed successfully"
- KEY-WA-017: `R` on running run (detail) → no overlay, status bar "Run cannot be resumed in current state"
- KEY-WA-018: `R` on queued run (detail) → no overlay, status bar "Run cannot be resumed in current state"
- KEY-WA-019: `Tab` in overlay → focus moves from Confirm to Cancel
- KEY-WA-020: `Shift+Tab` in overlay → focus moves from Cancel to Confirm
- KEY-WA-021: `Enter` on Cancel button in overlay → dismisses overlay (same as Esc)
- KEY-WA-022: Cancel confirm success → overlay dismisses, run status updates to cancelled
- KEY-WA-023: Rerun confirm success → overlay dismisses, navigates to new run detail
- KEY-WA-024: Resume confirm success → overlay dismisses, SSE reconnects, status updates
- KEY-WA-025: Cancel confirm failure (403) → overlay shows "Permission denied" error
- KEY-WA-026: Cancel confirm failure (409) → overlay shows "Run cannot be cancelled in current state"
- KEY-WA-027: Cancel confirm failure (network) → overlay shows "Network error" with retry
- KEY-WA-028: `Enter` to retry after error in overlay → re-attempts API call
- KEY-WA-029: Rerun confirm returns null → overlay shows "Workflow no longer exists"
- KEY-WA-030: `c` on run list (running) → optimistic cancel, row updates immediately
- KEY-WA-031: `c` on run list (queued) → optimistic cancel, row updates immediately
- KEY-WA-032: `c` on run list (terminal) → no-op, status bar "Run is not active"
- KEY-WA-033: `r` on run list (failed) → optimistic rerun, API call fires
- KEY-WA-034: `r` on run list (running) → no-op, status bar "Run is still in progress"
- KEY-WA-035: `m` on run list (cancelled) → optimistic resume, row updates immediately
- KEY-WA-036: `m` on run list (failed) → optimistic resume, row updates immediately
- KEY-WA-037: `m` on run list (successful) → no-op, status bar "Run cannot be resumed in current state"
- KEY-WA-038: Optimistic cancel reverts on API error → row returns to original icon/color
- KEY-WA-039: Optimistic resume reverts on API error → row returns to original icon/color
- KEY-WA-040: Rapid `c` presses on detail → first opens overlay, subsequent no-ops
- KEY-WA-041: Rapid `c` presses on list → first triggers optimistic update, subsequent no-ops while in-flight
- KEY-WA-042: `j`/`k` still work during overlay (move behind overlay — no visible effect, debatable UX, but keys not consumed)
- KEY-WA-043: `q` during overlay → no-op (overlay traps focus)
- KEY-WA-044: Flash message auto-dismisses after 3 seconds, restoring keybinding hints
- KEY-WA-045: Multiple flash messages — new replaces old immediately
- KEY-WA-046: `c` during another action in-flight on detail → no-op
- KEY-WA-047: Action key as read-only user → "Permission denied" status bar flash, no overlay, no API call
- KEY-WA-048: SSE status update makes overlay state incompatible → overlay shows "Run state changed", auto-dismisses

### Responsive Tests (14 tests)

- RESP-WA-001: Cancel overlay at 80×24 — 90% width, 30% height, compact layout
- RESP-WA-002: Cancel overlay at 120×40 — 40% width, 20% height, full layout
- RESP-WA-003: Cancel overlay at 200×60 — 35% width, 18% height, expanded layout with context
- RESP-WA-004: Resize from 120×40 to 80×24 with overlay open → overlay shrinks to compact
- RESP-WA-005: Resize from 80×24 to 120×40 with overlay open → overlay expands to standard
- RESP-WA-006: Resize during API in-flight → spinner continues, overlay resizes
- RESP-WA-007: Status bar flash at 80×24 — message truncated to fit
- RESP-WA-008: Status bar flash at 120×40 — full message visible
- RESP-WA-009: Status bar hints at 80×24 — abbreviated format (keys only)
- RESP-WA-010: Status bar hints at 120×40 — full format (key:label)
- RESP-WA-011: Status bar hints at 200×60 — full format with descriptions
- RESP-WA-012: Overlay minimum width enforcement (terminal < 40ch wide) → overlay at 95% width
- RESP-WA-013: Optimistic update on run list at 80×24 — icon change visible in compact layout
- RESP-WA-014: Optimistic update on run list at 200×60 — icon change with full row context

### Integration Tests (22 tests)

- INT-WA-001: Cancel API call success → `POST /api/repos/:owner/:repo/workflows/runs/:id/cancel` returns 204, run status updates
- INT-WA-002: Rerun API call success → `POST /api/repos/:owner/:repo/workflows/runs/:id/rerun` returns new run, navigation to new run
- INT-WA-003: Resume API call success → `POST /api/repos/:owner/:repo/workflows/runs/:id/resume` returns 204, SSE reconnects
- INT-WA-004: Cancel API 403 → "Permission denied" shown, no state change
- INT-WA-005: Cancel API 409 → "Run cannot be cancelled in current state" shown
- INT-WA-006: Cancel API 404 → "Run not found" shown
- INT-WA-007: Rerun API 403 → "Permission denied" shown
- INT-WA-008: Rerun API returns null → "Workflow no longer exists" shown
- INT-WA-009: Resume API 403 → "Permission denied" shown
- INT-WA-010: Resume API 409 → "Run cannot be resumed in current state" shown
- INT-WA-011: Rate limit (429) on cancel → status bar shows retry-after, no auto-retry
- INT-WA-012: Rate limit (429) on rerun → status bar shows retry-after
- INT-WA-013: Auth expiry (401) during cancel → overlay dismissed, auth error screen
- INT-WA-014: Auth expiry (401) during rerun → overlay dismissed, auth error screen
- INT-WA-015: Network timeout during cancel → overlay shows timeout message with retry
- INT-WA-016: Network timeout during resume → overlay shows timeout message with retry
- INT-WA-017: Optimistic cancel on list + API success → row stays cancelled, data refreshes
- INT-WA-018: Optimistic cancel on list + API failure → row reverts, flash shown
- INT-WA-019: Optimistic resume on list + API failure → row reverts, flash shown
- INT-WA-020: Rerun on detail + navigate to new run → new run detail loads correctly
- INT-WA-021: Resume on detail + SSE reconnects → log streaming resumes
- INT-WA-022: Cancel on detail + SSE closes → no more log events received

### Edge Case Tests (15 tests)

- EDGE-WA-001: No auth token → action key → auth error screen
- EDGE-WA-002: Long workflow name (50+ chars) in overlay → truncated with ellipsis
- EDGE-WA-003: Unicode/emoji in workflow name in overlay → grapheme-aware truncation
- EDGE-WA-004: Run ID 0 (boundary) → action still works
- EDGE-WA-005: Concurrent resize + API in-flight → both handled independently
- EDGE-WA-006: SSE status update during overlay open → state conflict detected, overlay dismisses
- EDGE-WA-007: Multiple concurrent optimistic updates on run list (cancel run A, rerun run B) → independent
- EDGE-WA-008: Rerun on run with very large dispatch_inputs → API handles, no client impact
- EDGE-WA-009: Cancel on run that completes milliseconds before API call → 409, handled gracefully
- EDGE-WA-010: Resume immediately followed by cancel key → resume in-flight, cancel no-op
- EDGE-WA-011: Overlay open + terminal resized to < 30ch width → overlay uses 95% width fallback
- EDGE-WA-012: Flash message at exact moment of screen pop → flash discarded, no orphan state
- EDGE-WA-013: Action on run with null workflow_name → overlay shows "Unknown workflow"
- EDGE-WA-014: 100+ rapid cancel attempts on list (stress) → only first triggers, rest no-op
- EDGE-WA-015: No color support → overlay uses ASCII borders, action text uses `[CANCEL]`/`[RERUN]`/`[RESUME]` prefixes

All 129 tests left failing if backend is unimplemented — never skipped or commented out.

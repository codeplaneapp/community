# TUI_WORKFLOW_DISPATCH

Specification for TUI_WORKFLOW_DISPATCH.

## High-Level User POV

The Workflow Dispatch feature lets terminal users manually trigger a workflow run from within the Codeplane TUI. It surfaces as a modal overlay on the Workflow List screen, activated by pressing `d` on a focused workflow that has `workflow_dispatch` configured as one of its triggers. The overlay provides a focused, form-driven experience for selecting a target ref (bookmark), filling in any custom dispatch inputs defined by the workflow, and confirming the dispatch — all without leaving the terminal.

When the user presses `d` on a dispatchable workflow, a centered modal appears on top of the workflow list. The modal header shows "Dispatch Workflow" in bold primary color, with the workflow name displayed below it. The first field is a ref selector, pre-populated with "main", which the user can edit to target a different bookmark. If the workflow definition declares custom inputs (via its `on.workflow_dispatch.inputs` configuration), the modal dynamically renders a form field for each declared input. Each input field shows its key name as a label, its default value pre-filled if one is defined in the workflow config, and a description below the label if the workflow provides one. Text inputs accept freeform string values; boolean inputs render as toggleable `[true]` / `[false]` selectors; choice inputs render as a `<select>` dropdown with the allowed values.

The user navigates between form fields using `Tab` and `Shift+Tab`. The tab order is deterministic: Ref → Input 1 → Input 2 → … → Input N → Dispatch button → Cancel button. Pressing `Enter` on the Dispatch button (or `Ctrl+S` from anywhere in the form) submits the dispatch request. Pressing `Esc` or `Enter` on Cancel dismisses the overlay without dispatching.

During submission, the Dispatch button text changes to "Dispatching…" and a spinner renders next to it. All form fields become non-interactive. On success (204 response), the overlay closes and the status bar flashes "Workflow dispatched ✓" in green for 3 seconds. The workflow list refreshes its run summary data to reflect the new queued run. On error, the overlay remains open with an inline error message rendered in red below the form fields. The user can correct inputs and retry, or press `Esc` to dismiss.

If the user presses `d` on a workflow that does not have `workflow_dispatch` in its triggers, no overlay opens. Instead, the status bar briefly displays "Workflow does not support manual dispatch" in yellow for 3 seconds. If the user lacks write access, pressing `d` shows "Permission denied" in the status bar.

At minimum terminal size (80×24), the dispatch overlay expands to 90% width and adjusts its height to fit the visible input count (scrollable if inputs exceed available space). At standard and large sizes, the overlay is 50% × auto-height (minimum 30%, maximum 70%) centered on screen. Input fields span the full overlay width minus padding.

## Acceptance Criteria

### Definition of Done
- [ ] Pressing `d` on a dispatchable workflow in the Workflow List screen opens the dispatch overlay
- [ ] Pressing `d` on a non-dispatchable workflow shows a status bar message "Workflow does not support manual dispatch" and does not open the overlay
- [ ] The overlay renders as a centered modal with border in primary color (ANSI 33) and surface background (ANSI 236)
- [ ] The overlay header displays "Dispatch Workflow" in bold primary color and the workflow name below it in default color
- [ ] The ref field is pre-populated with "main" and editable as a text input
- [ ] If the workflow definition's `on.workflow_dispatch.inputs` declares custom inputs, a form field is rendered for each
- [ ] Input fields display the input key as a label, the default value pre-filled (if defined), and the description as muted helper text
- [ ] Boolean-typed inputs render as a toggle selector cycling between `[true]` and `[false]`
- [ ] Choice-typed inputs (with `options` array) render as a `<select>` dropdown
- [ ] String-typed inputs (default) render as text `<input>` fields
- [ ] Tab order: Ref → Input fields (in definition order) → Dispatch → Cancel
- [ ] `Tab` / `Shift+Tab` navigates between fields; keyboard focus is trapped within the overlay
- [ ] `Enter` on the Dispatch button submits the dispatch
- [ ] `Ctrl+S` submits the dispatch from any focused field
- [ ] `Esc` dismisses the overlay without dispatching
- [ ] `Enter` on Cancel dismisses the overlay without dispatching
- [ ] On submission, the API endpoint `POST /api/repos/:owner/:repo/workflows/:id/dispatches` is called with `{ ref, inputs }`
- [ ] During submission, Dispatch button text changes to "Dispatching…" with spinner, and all fields become non-interactive
- [ ] Double-submit prevention: additional `Ctrl+S` / `Enter` presses while submitting are ignored
- [ ] On 204 success: overlay closes, status bar flashes "Workflow dispatched ✓" (green) for 3 seconds, workflow run summaries refresh
- [ ] On 400 error: inline error "Invalid dispatch inputs" shown in red
- [ ] On 403 error: inline error "Permission denied — write access required" shown in red
- [ ] On 404 error: inline error "Workflow not found" shown in red
- [ ] On 409 error: inline error "Workflow is inactive" shown in red
- [ ] On 429 error: inline error "Rate limited. Retry in {Retry-After}s." shown in red
- [ ] On network error: inline error "Network error. Press Ctrl+S to retry." shown in red
- [ ] On 401 error: overlay closes, auth error screen shown ("Session expired. Run `codeplane auth login` to re-authenticate.")
- [ ] Ref input validates against bookmark name pattern (no slashes at start/end, no `..`, no control characters); invalid ref shows inline validation error
- [ ] Ref input maximum length: 255 characters
- [ ] Custom input values maximum length: 1000 characters per input
- [ ] Maximum number of rendered input fields: 20; if workflow defines >20 inputs, the overlay shows the first 20 with a note "Showing 20 of N inputs"

### Edge Cases
- [ ] Workflow with zero custom inputs: only ref field and buttons shown; overlay is compact
- [ ] Workflow with 20+ custom inputs: scrollbox wraps input fields; scroll indicator shown
- [ ] Terminal resize while overlay is open: overlay resizes proportionally (min 30ch width); focus and form state preserved
- [ ] Rapid `d` presses: if overlay is already open, subsequent `d` presses are no-op
- [ ] `d` during in-flight dispatch: overlay already showing "Dispatching…", second `d` is no-op
- [ ] Unicode in workflow name: displayed correctly in overlay header, truncated with `…` if exceeds overlay width minus padding
- [ ] Unicode in input keys/values: handled as grapheme clusters for truncation
- [ ] Empty ref (user clears input): defaults to "main" on submission
- [ ] Input with default value that user clears: sent as empty string (not omitted)
- [ ] Special characters in input values (quotes, backslashes, newlines): sent as-is; server validates
- [ ] Overlay open at 80×24 then resize below 80×24: "terminal too small" message replaces everything; enlarging back restores overlay with state
- [ ] No color support (`NO_COLOR=1`): border uses ASCII `+`, `-`, `|` characters; errors use bold/reverse instead of red
- [ ] Rapid Tab cycling: sequential, one field per keypress, no debounce

## Design

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workflows          │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ┌─────────── Dispatch Workflow ─────────────┐     │
│   │                                           │     │
│   │  ci-pipeline                              │     │
│   │                                           │     │
│   │  ┌─ Ref ────────────────────────────────┐ │     │
│   │  │ main                                 │ │     │
│   │  └──────────────────────────────────────┘ │     │
│   │                                           │     │
│   │  ┌─ environment ────────────────────────┐ │     │
│   │  │ staging              ▾               │ │     │
│   │  └──────────────────────────────────────┘ │     │
│   │  Deploy target environment                │     │
│   │                                           │     │
│   │  ┌─ debug ──────────────────────────────┐ │     │
│   │  │ [false]                              │ │     │
│   │  └──────────────────────────────────────┘ │     │
│   │  Enable debug logging                    │     │
│   │                                           │     │
│   │  ┌─ version ────────────────────────────┐ │     │
│   │  │ 1.0.0                                │ │     │
│   │  └──────────────────────────────────────┘ │     │
│   │                                           │     │
│   │  [ Dispatch ]   [ Cancel ]                │     │
│   │                                           │     │
│   │  ⚠ Error message here (if error)         │     │
│   │                                           │     │
│   └───────────────────────────────────────────┘     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Tab:next │ Ctrl+S:dispatch │ Esc:cancel   │ ?:help  │
└─────────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI)

The dispatch overlay is an absolutely-positioned `<box>` centered on screen with `border="single"`, `borderColor="primary"`, and `backgroundColor="surface"`. It contains a column-direction layout with: header (bold primary "Dispatch Workflow" + workflow name), a `<scrollbox>` wrapping the form fields (ref `<input>`, dynamic inputs based on type — `<input>` for strings, toggle `<text>` for booleans, `<select>` for choice types — each with optional muted description text), action buttons row (Dispatch + Cancel), and conditional error text.

Width is 90% at minimum breakpoint (80×24) and 50% at standard/large. Height is auto with min 30%, max 70%. Minimum enforced width is 30 characters.

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `d` | Open dispatch overlay | Workflow list focused, dispatchable workflow selected |
| `Tab` | Next form field | Overlay open |
| `Shift+Tab` | Previous form field | Overlay open |
| `Enter` | Activate button / toggle boolean | Dispatch or Cancel button focused / boolean field |
| `Space` | Toggle boolean / activate button | Boolean field / button focused |
| `Ctrl+S` | Submit dispatch | Overlay open, not currently dispatching |
| `Esc` | Dismiss overlay | Overlay open |
| `j` / `k` | Navigate within select dropdown | Choice input dropdown open |

All global keybindings (`q`, `?`, `:`, `j/k` for list) are suppressed while the overlay is open (focus trap).

### Responsive Behavior

| Size | Overlay Width | Overlay Height | Behavior |
|------|-------------|----------------|----------|
| 80×24 | 90% | auto (min 10 rows, max rows−4) | Descriptions hidden if height constrained; scrollbox wraps inputs |
| 120×40 | 50% | auto (min 30%, max 70%) | Full layout with descriptions |
| 200×60 | 50% | auto (min 30%, max 70%) | Full layout, extra vertical spacing between fields |

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useWorkflowDefinitions()` | `@codeplane/ui-core` | Provides workflow definition with `config` containing `on.workflow_dispatch.inputs` schema |
| `useDispatchWorkflow()` | `@codeplane/ui-core` | Mutation for `POST /api/repos/:owner/:repo/workflows/:id/dispatches` |
| `useWorkflowRunsSummary()` | `@codeplane/ui-core` | Invalidated/refetched on successful dispatch |
| `useKeyboard()` | `@opentui/react` | Overlay-level keybinding handlers with focus trap |
| `useTerminalDimensions()` | `@opentui/react` | Returns `{ columns, rows }` for responsive sizing |
| `useOnResize()` | `@opentui/react` | Triggers re-layout on terminal resize |

### Input Type Resolution

| Config shape | Rendered as | Behavior |
|-------------|-------------|----------|
| `{ type: "boolean", default: false }` | Boolean toggle | `Space` or `Enter` toggles between `[true]` / `[false]` |
| `{ type: "choice", options: [...], default: "x" }` | `<select>` dropdown | `Enter` opens, `j/k` navigates, `Enter` confirms |
| `{ type: "string", default: "foo" }` or bare key | Text `<input>` | Freeform text entry |
| `{ description: "..." }` | Muted helper text below field | Informational, not interactive |

### Navigation Flow

1. User presses `d` on a dispatchable workflow in the Workflow List
2. TUI reads the workflow definition's `config` to extract `on.workflow_dispatch.inputs`
3. Dispatch overlay opens with dynamically generated form fields
4. User fills in ref and inputs, presses `Ctrl+S` or `Enter` on Dispatch button
5. `POST /api/repos/:owner/:repo/workflows/:id/dispatches` called with `{ ref, inputs }`
6. On 204 success: overlay closes → status bar flash → run summaries refresh
7. On error: overlay stays open → inline error → user retries or dismisses

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| See `d` keybinding hint | ❌ | ✅ (dimmed) | ✅ | ✅ |
| Open dispatch overlay | ❌ | ❌ | ✅ | ✅ |
| Submit dispatch | ❌ | ❌ | ✅ | ✅ |

- Dispatch requires write access to the repository. The server endpoint checks `requireWriteAccess()` before processing
- Read-only users who press `d` see the status bar message "Permission denied" and the overlay does not open
- The `d` keybinding hint in the status bar is shown dimmed (ANSI 245) for users without write access
- Anonymous users cannot reach the Workflow List screen (private repo) or dispatch (public repo)

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses close the overlay and propagate to the app-shell auth error screen

### Rate Limiting
- `POST /api/repos/:owner/:repo/workflows/:id/dispatches` is rate-limited to 60 req/min
- 429 responses display inline error in the overlay: "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user manually retries via `Ctrl+S` or `Enter` on Dispatch button after waiting
- The overlay remains open during rate limit so the user does not lose form state

### Input Sanitization
- Ref value is client-side validated: must not contain control characters, `..`, or leading/trailing slashes
- Custom input values sent as-is to the server; server-side validation handles any security concerns
- All user-provided text rendered as plain `<text>` (no injection vector in terminal rendering)
- Workflow name displayed in overlay header is rendered as plain text, never executed or interpreted

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workflow_dispatch.opened` | Dispatch overlay opened | `repo`, `workflow_id`, `workflow_name`, `input_count`, `has_default_values`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.workflow_dispatch.submitted` | User confirms dispatch | `repo`, `workflow_id`, `workflow_name`, `ref`, `input_count`, `inputs_modified_count`, `time_in_overlay_ms` |
| `tui.workflow_dispatch.succeeded` | API returns 204 | `repo`, `workflow_id`, `workflow_name`, `ref`, `dispatch_time_ms` |
| `tui.workflow_dispatch.failed` | API returns non-2xx or network error | `repo`, `workflow_id`, `workflow_name`, `error_code`, `error_message`, `dispatch_time_ms` |
| `tui.workflow_dispatch.cancelled` | User dismisses overlay without dispatching | `repo`, `workflow_id`, `workflow_name`, `time_in_overlay_ms`, `fields_modified` |
| `tui.workflow_dispatch.blocked` | `d` pressed on non-dispatchable workflow | `repo`, `workflow_id`, `workflow_name`, `trigger_types` |
| `tui.workflow_dispatch.denied` | `d` pressed by user without write access | `repo`, `workflow_id`, `workflow_name` |
| `tui.workflow_dispatch.input_changed` | User modifies a custom input value | `repo`, `workflow_id`, `input_key`, `input_type`, `is_default_value` |
| `tui.workflow_dispatch.ref_changed` | User modifies the ref field | `repo`, `workflow_id`, `new_ref_length` |
| `tui.workflow_dispatch.retry` | User retries after error | `repo`, `workflow_id`, `previous_error_code`, `retry_success` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Dispatch completion rate (`opened` → `succeeded`) | >80% |
| Dispatch abandonment rate (`opened` → `cancelled` with `fields_modified > 0`) | <10% |
| Dispatch error rate (`submitted` → `failed`) | <3% |
| Median time in overlay (open to submit) | <15s |
| Blocked dispatch rate (`blocked` / total `d` presses) | Informational (no target) |
| Permission denied rate (`denied` / total `d` presses) | <5% |
| Retry success rate | >90% |
| Input modification rate (submissions with at least one non-default input) | >30% |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Overlay opened | `WorkflowDispatch: opened [repo={r}] [workflow_id={id}] [name={name}] [input_count={n}]` |
| `debug` | Input schema parsed | `WorkflowDispatch: inputs parsed [repo={r}] [workflow_id={id}] [string={s}] [boolean={b}] [choice={c}]` |
| `debug` | Form field changed | `WorkflowDispatch: field changed [repo={r}] [workflow_id={id}] [field={key}] [type={type}]` |
| `info` | Dispatch submitted | `WorkflowDispatch: submitted [repo={r}] [workflow_id={id}] [name={name}] [ref={ref}] [input_count={n}]` |
| `info` | Dispatch succeeded | `WorkflowDispatch: succeeded [repo={r}] [workflow_id={id}] [name={name}] [duration={ms}ms]` |
| `info` | Overlay dismissed | `WorkflowDispatch: cancelled [repo={r}] [workflow_id={id}] [fields_modified={n}]` |
| `warn` | Dispatch failed | `WorkflowDispatch: failed [repo={r}] [workflow_id={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `WorkflowDispatch: rate limited [repo={r}] [workflow_id={id}] [retry_after={s}]` |
| `warn` | Non-dispatchable workflow | `WorkflowDispatch: blocked [repo={r}] [workflow_id={id}] [triggers={triggers}]` |
| `warn` | Invalid ref entered | `WorkflowDispatch: invalid ref [repo={r}] [workflow_id={id}] [ref_length={n}]` |
| `error` | Auth error | `WorkflowDispatch: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `WorkflowDispatch: permission denied [repo={r}] [workflow_id={id}]` |
| `error` | Render error | `WorkflowDispatch: render error [repo={r}] [workflow_id={id}] [error={msg}]` |
| `error` | Network error | `WorkflowDispatch: network error [repo={r}] [workflow_id={id}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize while overlay open | Overlay resizes proportionally (min 30ch width); form state preserved | Synchronous re-layout |
| Resize below minimum with overlay open | "Terminal too small" replaces everything; form state preserved in memory | Resize back above minimum restores overlay |
| SSE disconnect while overlay open | Status bar indicator updates; overlay unaffected (uses REST, not SSE) | SSE provider reconnects independently |
| Auth expiry during dispatch | Overlay closes, auth error screen shown | Re-auth via CLI |
| Network timeout (30s) during dispatch | "Dispatching…" → inline error "Request timed out" | User retries via Ctrl+S |
| Dispatch 400 (invalid inputs) | Inline error; form re-enables | User corrects inputs, retries |
| Dispatch 403 (permission denied) | Inline error "Permission denied — write access required" | Informational; user dismisses |
| Dispatch 404 (workflow not found) | Inline error "Workflow not found" | Overlay dismisses or user Esc |
| Dispatch 409 (inactive workflow) | Inline error "Workflow is inactive" | Informational; user dismisses |
| Server 500 | Inline error "Server error. Please try again." | User retries |
| Rapid Ctrl+S during dispatch | Ignored (double-submit prevention) | Single in-flight request |
| Input config malformed (JSON parse error) | Overlay opens with ref-only (no custom inputs); warning logged | Graceful degradation |
| Workflow definition missing config | Overlay opens with ref-only; treated as zero custom inputs | Normal behavior |

### Failure Modes
- Overlay render crash → global error boundary → "Press r to restart"
- Individual input field crash → overlay dismissed, error flash; user retries `d`
- API client unreachable → inline error in overlay; `Esc` still works for dismissal
- Slow network → "Dispatching…" spinner; user can `Esc` to cancel (pending request is abandoned client-side but may still execute server-side; no cancel endpoint exists)
- Partial workflow config (inputs defined but config unparseable) → ref-only form; debug-level warning logged

## Verification

### Test File: `e2e/tui/workflows.test.ts`

### Terminal Snapshot Tests (16 tests)

- SNAP-WFD-001: Dispatch overlay at 120×40 with zero custom inputs — ref field, Dispatch/Cancel buttons only
- SNAP-WFD-002: Dispatch overlay at 120×40 with 3 custom inputs — ref, string input, boolean toggle, choice select
- SNAP-WFD-003: Dispatch overlay at 80×24 — 90% width, compact layout, descriptions hidden if height constrained
- SNAP-WFD-004: Dispatch overlay at 200×60 — 50% width, extra spacing, all descriptions visible
- SNAP-WFD-005: Dispatch overlay with "Dispatching…" spinner state — button text changed, fields dimmed
- SNAP-WFD-006: Dispatch overlay with inline error message — red error text below buttons
- SNAP-WFD-007: Boolean toggle field rendering — `[false]` unfocused, `[true]` after toggle
- SNAP-WFD-008: Choice select field with dropdown open — options visible with highlight on focused option
- SNAP-WFD-009: Ref input with custom value entered — shows user-typed ref instead of "main"
- SNAP-WFD-010: Dispatch overlay header — "Dispatch Workflow" bold primary, workflow name below
- SNAP-WFD-011: Input field with description text — muted helper text below input
- SNAP-WFD-012: Input field with pre-filled default value — default value shown in input
- SNAP-WFD-013: Status bar hints while overlay open — "Tab:next │ Ctrl+S:dispatch │ Esc:cancel"
- SNAP-WFD-014: Status bar flash "Workflow dispatched ✓" after success
- SNAP-WFD-015: Status bar message "Workflow does not support manual dispatch" for non-dispatchable workflow
- SNAP-WFD-016: Scrollable inputs overlay with 10+ custom inputs — scroll indicator visible

### Keyboard Interaction Tests (28 tests)

- KEY-WFD-001: `d` on dispatchable workflow opens overlay
- KEY-WFD-002: `d` on non-dispatchable workflow shows status bar message, no overlay
- KEY-WFD-003: `Esc` dismisses overlay
- KEY-WFD-004: `Enter` on Cancel button dismisses overlay
- KEY-WFD-005: `Tab` cycles through all form fields in order (Ref → inputs → Dispatch → Cancel)
- KEY-WFD-006: `Shift+Tab` cycles backward through form fields
- KEY-WFD-007: `Enter` on Dispatch button submits dispatch request
- KEY-WFD-008: `Ctrl+S` submits from ref input field
- KEY-WFD-009: `Ctrl+S` submits from custom input field
- KEY-WFD-010: `Ctrl+S` submits from Dispatch button
- KEY-WFD-011: Typing in ref input updates value (type "develop"; ref shows "develop")
- KEY-WFD-012: Typing in string input updates value
- KEY-WFD-013: `Space` on boolean toggle changes `[false]` to `[true]`
- KEY-WFD-014: `Space` on boolean toggle changes `[true]` to `[false]`
- KEY-WFD-015: `Enter` on boolean toggle also toggles value
- KEY-WFD-016: `Enter` on choice field opens dropdown
- KEY-WFD-017: `j`/`k` navigates choice dropdown options
- KEY-WFD-018: `Enter` in choice dropdown selects option and closes dropdown
- KEY-WFD-019: `Esc` in choice dropdown closes without selecting
- KEY-WFD-020: Successful dispatch closes overlay and flashes status bar
- KEY-WFD-021: Failed dispatch shows inline error, overlay stays open
- KEY-WFD-022: Double `Ctrl+S` during dispatch (second ignored)
- KEY-WFD-023: `d` while overlay already open (no-op)
- KEY-WFD-024: Global keys suppressed while overlay open (`q` does not pop screen, `j/k` does not move list)
- KEY-WFD-025: `Backspace` in ref input deletes character
- KEY-WFD-026: Empty ref submits with "main" as default
- KEY-WFD-027: `d` by read-only user shows "Permission denied" status bar message
- KEY-WFD-028: Rapid Tab cycling (10× sequential, one field per keypress)

### Responsive Tests (8 tests)

- RESP-WFD-001: Overlay at 80×24 — 90% width, compact height
- RESP-WFD-002: Overlay at 120×40 — 50% width, standard spacing
- RESP-WFD-003: Overlay at 200×60 — 50% width, expanded spacing
- RESP-WFD-004: Resize from 120×40 to 80×24 while overlay open — width adjusts, form state preserved
- RESP-WFD-005: Resize from 80×24 to 120×40 while overlay open — width adjusts, descriptions appear
- RESP-WFD-006: Resize below minimum with overlay open — "terminal too small" shown
- RESP-WFD-007: Resize back above minimum after below-minimum — overlay restored with state
- RESP-WFD-008: Resize during "Dispatching…" state — spinner and disabled state preserved

### Integration Tests (14 tests)

- INT-WFD-001: Successful dispatch calls `POST /api/repos/:owner/:repo/workflows/:id/dispatches` with correct ref and inputs
- INT-WFD-002: Successful dispatch triggers workflow run summary refresh on list screen
- INT-WFD-003: Dispatch with modified inputs sends user values (not defaults)
- INT-WFD-004: Dispatch with unmodified inputs sends default values from config
- INT-WFD-005: Dispatch with zero custom inputs sends `{ ref: "main" }` only
- INT-WFD-006: 403 response shows permission denied error inline
- INT-WFD-007: 404 response shows workflow not found error inline
- INT-WFD-008: 409 response shows workflow inactive error inline
- INT-WFD-009: 429 response shows rate limit error with Retry-After value
- INT-WFD-010: 401 response closes overlay and shows auth error screen
- INT-WFD-011: Network timeout (30s) shows timeout error inline
- INT-WFD-012: Server 500 shows generic server error inline
- INT-WFD-013: Malformed workflow config (unparseable JSON) opens overlay with ref-only
- INT-WFD-014: Workflow config with no `on.workflow_dispatch` section opens overlay with ref-only

### Edge Case Tests (10 tests)

- EDGE-WFD-001: Workflow with 20+ custom inputs — shows first 20 with "Showing 20 of N" note
- EDGE-WFD-002: Unicode in workflow name — displayed correctly, truncated with `…` if too long
- EDGE-WFD-003: Unicode in input keys — label displays correctly
- EDGE-WFD-004: Ref with 255 characters — accepted; 256th character rejected
- EDGE-WFD-005: Input value with 1000 characters — accepted; 1001st character rejected
- EDGE-WFD-006: Invalid ref characters (`..`, control chars) — inline validation error shown
- EDGE-WFD-007: Dispatch then immediate `q` on list screen — dispatch still processes server-side
- EDGE-WFD-008: `d` during workflow list loading state — no-op
- EDGE-WFD-009: Boolean input with no default — defaults to `[false]`
- EDGE-WFD-010: Choice input with empty options array — renders as text input fallback

All 76 tests left failing if backend is unimplemented — never skipped or commented out.

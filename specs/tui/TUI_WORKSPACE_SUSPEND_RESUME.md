# TUI_WORKSPACE_SUSPEND_RESUME

Specification for TUI_WORKSPACE_SUSPEND_RESUME.

## High-Level User POV

The suspend/resume feature gives terminal developers single-key actions to pause and restart workspaces directly from the TUI — the most important lifecycle operations for managing compute costs and session continuity. The interaction is designed to feel immediate through optimistic status updates while the potentially slower VM operations happen in the background, with real-time SSE streaming keeping the user informed of the actual transition.

There are two surfaces where suspend/resume is available:

**From the workspace list screen**, the user focuses a workspace row using `j`/`k` navigation, then presses `s` to suspend a running workspace or `r` to resume a suspended workspace. The status badge on the focused row updates optimistically — `[running]` in green changes to `[suspending…]` in yellow (then to `[suspended]` in muted gray when the server confirms), or `[suspended]` in gray changes to `[resuming…]` in yellow (then to `[running]` in green on confirmation). A brief status bar message confirms: "Workspace 'my-ws' suspended" or "Workspace 'my-ws' resumed". The keybinding hint in the status bar dynamically reflects the valid action for the focused row's current state — `s:suspend` when focused on a running workspace, `r:resume` when focused on a suspended workspace, or nothing when the workspace is in a transitional or terminal state.

**From the workspace detail screen**, the user presses `s` to suspend or `r` to resume the currently viewed workspace. The status badge in the detail header transitions through the same states. The detail view additionally shows a "Suspended at" timestamp that appears when the workspace enters the suspended state and disappears on resume. The SSH connection info section grays out and shows "(unavailable while suspended)" when the workspace is suspended. When the workspace resumes, the SSH connection info re-populates with fresh credentials.

Both surfaces integrate with the workspace SSE status stream (`GET /api/repos/:owner/:repo/workspaces/:id/stream`). After the user triggers suspend or resume, the optimistic status update provides instant visual feedback, but the authoritative state transition comes from the SSE stream. The status badge updates as each SSE event arrives: `running` → `suspended` on suspend, `suspended` → `running` on resume. If the SSE stream delivers a `failed` status, the badge turns red and shows `[failed]` with an error indicator.

The feature guards against invalid state transitions: pressing `s` on an already-suspended workspace is a no-op, pressing `r` on an already-running workspace is a no-op, and neither key works on workspaces in `pending`, `starting`, `stopped`, or `failed` states. The keybinding hint disappears entirely for workspaces where no action is valid. While a suspend or resume operation is in-flight, both keys are disabled to prevent double-fires.

At all terminal sizes (80×24 through 200×60+), the suspend/resume action behaves identically. The status badge is always visible regardless of breakpoint. The status bar confirmation adapts its text length to the available width (e.g., `"'my-ws' suspended"` at 80 columns vs. `"Workspace 'my-ws' suspended successfully"` at 120+ columns). Workspace names longer than 20 characters are truncated with `…` in status bar messages to prevent overflow.

Suspend and resume are slower operations than issue close/reopen — VM state transitions can take several seconds. The TUI communicates this through the transitional states (`[suspending…]` / `[resuming…]`) and a braille spinner animation in the status badge, clearly signaling to the user that an operation is in progress.

## Acceptance Criteria

### Definition of Done
- [ ] Pressing `s` on a focused running workspace row in the workspace list sends `POST /api/repos/:owner/:repo/workspaces/:id/suspend`
- [ ] Pressing `r` on a focused suspended workspace row in the workspace list sends `POST /api/repos/:owner/:repo/workspaces/:id/resume`
- [ ] Pressing `s` on the workspace detail screen (when workspace is running) sends the same suspend request
- [ ] Pressing `r` on the workspace detail screen (when workspace is suspended) sends the same resume request
- [ ] The status badge updates optimistically to a transitional state (`[suspending…]` / `[resuming…]`) before the API response arrives
- [ ] The transitional state badge displays in `warning` color (ANSI 178 / yellow) with a braille spinner
- [ ] On successful API response, the badge updates to the confirmed state (`[suspended]` in `muted` color or `[running]` in `success` color)
- [ ] On API error (403, 404, 409, 500, network error), the badge reverts to its previous state within one render frame
- [ ] On API error, a status bar notification appears in `error` color (ANSI 196) for 3 seconds with the error message
- [ ] SSE status stream events update the workspace status badge in real-time after the HTTP response
- [ ] The `s`/`r` key is disabled (no-op) while a suspend/resume mutation is in-flight
- [ ] Pressing `s` on a non-running workspace is a no-op (no API call, no visual change)
- [ ] Pressing `r` on a non-suspended workspace is a no-op (no API call, no visual change)
- [ ] No confirmation dialog is shown before suspend or resume (both are reversible operations)
- [ ] On the workspace detail screen, the "Suspended at" timestamp appears when status becomes `suspended`
- [ ] On the workspace detail screen, the SSH connection info section shows "(unavailable while suspended)" when workspace is suspended
- [ ] On the workspace detail screen, SSH connection info refreshes when workspace resumes to `running`
- [ ] The feature works identically at all supported terminal sizes (80×24, 120×40, 200×60+)
- [ ] Status badge is always visible at every breakpoint — it is never truncated or hidden

### Keyboard Interactions
- [ ] `s` on focused running workspace in list: suspend workspace
- [ ] `r` on focused suspended workspace in list: resume workspace
- [ ] `s` on workspace detail (running): suspend workspace
- [ ] `r` on workspace detail (suspended): resume workspace
- [ ] Both keys are no-op when a mutation is already in-flight (no queuing)
- [ ] Both keys are no-op when the workspace is in an invalid state for the action
- [ ] `R` retries the last failed suspend/resume if the error state is active
- [ ] Rapid keypresses (`s` pressed twice quickly): second press is ignored due to in-flight guard
- [ ] `s` on workspaces with status `pending`, `starting`, `stopped`, `failed`, `suspended`: no-op
- [ ] `r` on workspaces with status `pending`, `starting`, `stopped`, `failed`, `running`: no-op

### Status Bar Feedback
- [ ] On success (suspend): `"Workspace '{name}' suspended"` in `success` color (ANSI 34) for 3 seconds
- [ ] On success (resume): `"Workspace '{name}' resumed"` in `success` color (ANSI 34) for 3 seconds
- [ ] On error: `"Failed to suspend '{name}': {reason}"` or `"Failed to resume '{name}': {reason}"` in `error` color (ANSI 196) for 3 seconds
- [ ] On 403: reason is `"Permission denied"`
- [ ] On 404: reason is `"Workspace not found"`
- [ ] On 409: reason is `"Invalid state transition"`
- [ ] On 429: reason is `"Rate limited. Retry in {Retry-After}s."`
- [ ] On network error: reason is `"Network error"`
- [ ] On 500: reason is `"Server error"`
- [ ] At 80 columns: message truncates to `"'{name}' suspended"` / `"'{name}' error: {reason}"`
- [ ] At 120+ columns: full message shown
- [ ] During in-flight operation: status bar hint changes to `s:suspending…` or `r:resuming…`

### Optimistic UI Behavior
- [ ] Status badge transition to `[suspending…]` / `[resuming…]` renders in < 16ms from keypress
- [ ] Revert on error renders in < 16ms from error receipt
- [ ] Transitional state badge includes braille spinner animation (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) at 80ms intervals
- [ ] Workspace list: row remains at same position after action (no reorder during transition)
- [ ] Workspace detail: all sections remain visible during transition; only status badge and SSH info change

### Truncation & Boundary Constraints
- [ ] Workspace names up to 255 characters are supported; names > 20 characters are truncated with `…` in status bar messages
- [ ] Workspace IDs (UUIDs, 36 characters) are never shown in status bar messages — use workspace name
- [ ] Error reason strings are truncated at 40 characters with `…` in the status bar
- [ ] Status bar message total length capped at terminal width minus 20 characters
- [ ] Status badge text: `[running]` (9ch), `[suspended]` (11ch), `[suspending…]` (14ch), `[resuming…]` (12ch), `[pending]` (9ch), `[starting]` (10ch), `[stopped]` (9ch), `[failed]` (8ch)
- [ ] "Suspended at" timestamp in detail view: relative time for < 30 days, absolute ISO date otherwise

### Edge Cases
- [ ] Terminal resize during in-flight mutation: mutation continues normally, status bar message re-renders at new width
- [ ] SSE disconnect during mutation: HTTP mutation continues; status badge stays in transitional state until SSE reconnects or user refreshes
- [ ] SSE disconnect before mutation: mutation works but final status update may be delayed until SSE reconnects
- [ ] Rapid `s` presses (10+ times in < 1 second): only the first press triggers a mutation; all subsequent are ignored until completion
- [ ] Suspending an already-suspended workspace (stale local state): server returns workspace as-is; TUI state reconciles
- [ ] Resuming an already-running workspace (stale local state): server detects running state and returns as-is; TUI state reconciles
- [ ] Network timeout (> 30 seconds): mutation times out, transitional state reverts, error shown
- [ ] User navigates away (`q`) while mutation is in-flight: mutation completes in background, no error shown on new screen
- [ ] Workspace list re-fetch after suspend/resume: server data overwrites optimistic state (no flicker if states match)
- [ ] Workspace deleted by another user during suspend: server returns 404, badge reverts, error shown
- [ ] Sandbox client unavailable: resume returns 500; status bar shows "Server error"
- [ ] VM not provisioned (no `freestyle_vm_id`): resume returns 409; status bar shows "Invalid state transition"
- [ ] Unicode in workspace name within status bar message: grapheme-cluster-safe truncation
- [ ] Null `suspended_at` on a suspended workspace (unexpected): rendered as empty in detail view, no crash
- [ ] SSE delivers `failed` status during suspend/resume: badge updates to `[failed]` in `error` color
- [ ] Multiple workspaces actioned in sequence from list: each operates independently with its own in-flight guard

## Design

### Workspace List Screen — Suspend/Resume Interaction

The `s` and `r` keybindings on the workspace list operate on the currently focused row. The visual change is confined to the status badge column.

**Before (workspace is running):**
```
  my-workspace       [running]     30m idle    2h ago
```

**After pressing `s` (optimistic, transitional state):**
```
  my-workspace       [⠋ suspending…]           2h ago
```

**After SSE confirms suspended:**
```
  my-workspace       [suspended]   suspended 5s ago   2h ago
```

The status badge transitions through colors:
- `[running]` → `success` color (ANSI 34 / green)
- `[suspending…]` → `warning` color (ANSI 178 / yellow) with braille spinner
- `[suspended]` → `muted` color (ANSI 245 / gray)
- `[resuming…]` → `warning` color (ANSI 178 / yellow) with braille spinner
- `[failed]` → `error` color (ANSI 196 / red)

The reverse video highlight on the focused row is preserved through all transitions.

**Status bar during suspend mutation:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Status: j/k:nav Enter:open s:suspending… c:new D:delete q:back              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Status bar after successful suspend:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Workspace 'my-workspace' suspended     j/k:nav Enter:open r:resume q:back   │
└──────────────────────────────────────────────────────────────────────────────┘
```

The confirmation message disappears after 3 seconds. After suspend, the hint changes from `s:suspend` to `r:resume` because the focused workspace is now suspended.

**Resume flow (workspace is suspended → running):**
```
  my-workspace       [suspended]   suspended 2h ago   4h ago
  ↓ press `r`
  my-workspace       [⠋ resuming…]             4h ago
  ↓ SSE confirms running
  my-workspace       [running]     0s idle     4h ago
```

### Workspace Detail Screen — Suspend/Resume Interaction

**Before (workspace is running):**
```
┌─────────────────────────────────────────────────────────────────────┐
│ my-workspace                                            [running]   │
│ @alice · created 4h ago · idle 30m                                  │
├─────────────────────────────────────────────────────────────────────┤
│ SSH Connection                                                      │
│ ssh abc123+root:token@localhost                                      │
│ Host: localhost   Port: 22   User: root                             │
├─────────────────────────────────────────────────────────────────────┤
│ Details                                                             │
│ Persistence: persistent   Idle timeout: 30m                         │
│ VM ID: abc123-def4-5678-90ab-cdef12345678                           │
└─────────────────────────────────────────────────────────────────────┘
```

**After pressing `s` (optimistic, transitional):**
```
┌─────────────────────────────────────────────────────────────────────┐
│ my-workspace                                       [⠋ suspending…]  │
│ @alice · created 4h ago                                             │
├─────────────────────────────────────────────────────────────────────┤
│ SSH Connection                                                      │
│ (unavailable while suspending)                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Details                                                             │
│ Persistence: persistent   Idle timeout: 30m                         │
│ VM ID: abc123-def4-5678-90ab-cdef12345678                           │
└─────────────────────────────────────────────────────────────────────┘
```

**After SSE confirms suspended:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ my-workspace                                         [suspended]    │
│ @alice · created 4h ago · suspended just now                        │
├─────────────────────────────────────────────────────────────────────┤
│ SSH Connection                                                      │
│ (unavailable while suspended)                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Details                                                             │
│ Persistence: persistent   Idle timeout: 30m                         │
│ Suspended at: 2026-03-21T14:32:00Z                                  │
│ VM ID: abc123-def4-5678-90ab-cdef12345678                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Components Used

- `<box>` — Row containers for workspace list rows and detail header/sections
- `<text>` — Status badge (`[running]`/`[suspended]`/`[suspending…]`/`[resuming…]`), status bar messages, SSH info, timestamps
- `<scrollbox>` — Workspace list (parent component) and detail view content area (parent component)

No additional components are introduced. Suspend/resume modifies existing elements rendered by `TUI_WORKSPACE_LIST_SCREEN` and `TUI_WORKSPACE_DETAIL_VIEW`.

### Keybindings

| Key | Screen | Action | Condition |
|-----|--------|--------|-----------||
| `s` | Workspace list | Suspend focused workspace | Workspace status is `running`, no mutation in-flight |
| `r` | Workspace list | Resume focused workspace | Workspace status is `suspended`, no mutation in-flight |
| `s` | Workspace detail | Suspend current workspace | Workspace status is `running`, no mutation in-flight |
| `r` | Workspace detail | Resume current workspace | Workspace status is `suspended`, no mutation in-flight |
| `R` | Both (after error) | Retry failed suspend/resume | Error state active for suspend/resume |

### Responsive Behavior

| Terminal Size | Status Badge | Status Bar Message | SSH Section (detail) |
|--------------|-------------|-------------------|---------------------|
| 80×24 | Full badge visible (max 14ch for `[suspending…]`) | `"'{name}' suspended"` (truncated) | Single-line SSH command only |
| 120×40 | Full badge visible | `"Workspace '{name}' suspended"` | Full SSH info with host, port, user |
| 200×60+ | Full badge visible | `"Workspace '{name}' suspended successfully"` | Full SSH info with copy hint |

Resize during mutation: layout recalculates synchronously, status bar message adapts to new width, mutation and SSE stream continue unaffected.

### Data Hooks

| Hook | Source | Usage |
|------|--------|-------|
| `useWorkspaces()` | `@codeplane/ui-core` | Provides workspace list data; `.items[n].status` updated optimistically on `s`/`r` |
| `useWorkspace(owner, repo, id)` | `@codeplane/ui-core` | Provides single workspace data; `.workspace.status` updated optimistically |
| `useSuspendWorkspace(owner, repo, id)` | `@codeplane/ui-core` | `mutate()` — fires the POST suspend request |
| `useResumeWorkspace(owner, repo, id)` | `@codeplane/ui-core` | `mutate()` — fires the POST resume request |
| `useWorkspaceSSH(owner, repo, id)` | `@codeplane/ui-core` | Provides SSH connection info; invalidated on suspend, re-fetched on resume |
| `useSSE("workspace.status")` | `@codeplane/ui-core` | Subscribes to workspace status change events via SSE stream |
| `useTerminalDimensions()` | `@opentui/react` | Current terminal width for status bar message length |
| `useKeyboard()` | `@opentui/react` | Registers `s`, `r`, and `R` handlers with in-flight guard and state-based gating |
| `useStatusBarHints()` | local TUI | Updates hint text (`s:suspend`/`r:resume`, `s:suspending…`/`r:resuming…`) |
| `useRepoContext()` | local TUI | Provides `owner` and `repo` for API calls |

### API Endpoints

**Suspend:**
```
POST /api/repos/:owner/:repo/workspaces/:id/suspend
Authorization: token <token>
Response: 200 OK with full WorkspaceResponse body (status: "suspended")
```

**Resume:**
```
POST /api/repos/:owner/:repo/workspaces/:id/resume
Authorization: token <token>
Response: 200 OK with full WorkspaceResponse body (status: "running")
```

**SSE Stream:**
```
GET /api/repos/:owner/:repo/workspaces/:id/stream
Authorization: ticket-based (via SSE ticket auth)
Events:
  type: workspace.status
  data: { "workspace_id": "...", "status": "running" | "suspended" | "failed" | ... }
```

### Navigation

Suspend/resume does not push or pop any screen. The user remains on the current screen after the action completes.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| Suspend workspace | ❌ | ❌ | ✅ | ✅ |
| Resume workspace | ❌ | ❌ | ✅ | ✅ |

- Suspend and resume require **write access** to the repository. This is enforced server-side via the `POST /api/repos/:owner/:repo/workspaces/:id/suspend` and `/resume` endpoints.
- The TUI does **not** hide the `s`/`r` keybinding from read-only users. The keybinding hint is always visible when applicable. If a read-only user presses the key, the optimistic update fires, the server returns 403, the state reverts, and "Permission denied" appears in the status bar.
- Workspace operations are scoped to the workspace owner (user_id). A user cannot suspend or resume another user's workspace, even with write access to the repository. The server enforces this via the `getWorkspaceForUserRepo` query which filters by both repository_id and user_id.
- Organization admins can manage workspaces for all organization members (future capability, not currently enforced).

### Token-Based Auth

- The auth token is injected by the `<APIClientProvider>` at the application root. The suspend/resume feature does not handle tokens directly.
- A 401 response during suspend/resume propagates to the global auth error handler: "Session expired. Run `codeplane auth login` to re-authenticate." The optimistic state reverts before the auth error screen is shown.
- The SSE stream uses ticket-based authentication obtained via the auth API. The ticket is ephemeral and scoped to the SSE connection.
- The token is never included in log messages, status bar text, or telemetry events.

### Rate Limiting

- `POST /api/repos/:owner/:repo/workspaces/:id/suspend` and `/resume` are rate-limited at **30 requests per minute** per authenticated user (more conservative than issue operations due to VM resource cost).
- The in-flight guard (key disabled during mutation) provides natural rate limiting — at most 1 request in-flight at a time per workspace.
- A 429 response triggers optimistic revert and a status bar message: "Rate limited. Retry in {Retry-After}s." The `Retry-After` header value is parsed and displayed.
- The TUI does not auto-retry 429s. The user must wait and press the key again (or `R` to retry).

### Input Sanitization

- The only user-controlled input is the workspace ID (a UUID from the data model) included in the URL path. No request body is sent for suspend or resume.
- Workspace IDs are validated as UUIDs by the server route handler.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workspace.suspend` | User presses `s` (list or detail) to suspend a running workspace | `owner`, `repo`, `workspace_id`, `workspace_name`, `surface` ("list" | "detail"), `position_in_list` (list only), `success` (boolean), `duration_ms`, `was_optimistic_revert` (boolean), `error_type` (if failed), `idle_duration_seconds` (how long workspace was idle before suspend) |
| `tui.workspace.resume` | User presses `r` (list or detail) to resume a suspended workspace | `owner`, `repo`, `workspace_id`, `workspace_name`, `surface` ("list" | "detail"), `position_in_list` (list only), `success` (boolean), `duration_ms`, `was_optimistic_revert` (boolean), `error_type` (if failed), `suspended_duration_seconds` (how long workspace was suspended) |
| `tui.workspace.suspend_resume.error` | API returns an error for suspend/resume | `owner`, `repo`, `workspace_id`, `workspace_name`, `surface`, `http_status`, `error_type` ("permission_denied" | "not_found" | "conflict" | "rate_limited" | "server_error" | "network_error" | "timeout"), `attempted_action` ("suspend" | "resume") |
| `tui.workspace.suspend_resume.retry` | User presses `R` to retry a failed operation | `owner`, `repo`, `workspace_id`, `surface`, `original_error_type`, `retry_success` (boolean) |
| `tui.workspace.suspend_resume.ignored` | User presses `s`/`r` while mutation is in-flight or in invalid state | `owner`, `repo`, `workspace_id`, `surface`, `reason` ("in_flight" | "invalid_state"), `workspace_status` |
| `tui.workspace.sse.status_update` | SSE delivers a workspace status change | `owner`, `repo`, `workspace_id`, `new_status`, `previous_status`, `sse_latency_ms` (time from HTTP response to SSE event) |

### Common Properties (all events)

- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `layout`: `"compact"` | `"standard"` | `"expanded"`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Suspend/resume success rate | > 90% | At least 90% of operations succeed without optimistic revert |
| Permission error rate | < 5% | Less than 5% of attempts result in 403 |
| Optimistic revert rate | < 10% | Less than 10% of attempts require an optimistic revert |
| Mean suspend round-trip | < 5s | Average time from keypress to server confirmation for suspend |
| Mean resume round-trip | < 10s | Average time from keypress to server confirmation for resume (VM startup is slower) |
| SSE status delivery latency | < 2s | Time between HTTP response and SSE status event arrival |
| Double-press ignore rate | < 10% | Less than 10% of actions followed by an ignored duplicate keypress |
| Suspend-to-resume ratio | 1:1 ± 20% | Healthy ratio indicates workspaces are being cycled |
| Resume after idle suspend | > 60% | More than 60% of auto-idle-suspended workspaces are eventually resumed |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Suspend/resume initiated | `WorkspaceSuspendResume: initiated [owner={o}] [repo={r}] [workspace_id={id}] [workspace_name={n}] [action={suspend|resume}] [from_status={s}] [surface={list|detail}]` |
| `debug` | Optimistic state applied | `WorkspaceSuspendResume: optimistic applied [workspace_id={id}] [transitional_status={suspending|resuming}]` |
| `info` | Suspend/resume succeeded (HTTP) | `WorkspaceSuspendResume: http success [workspace_id={id}] [action={suspend|resume}] [new_status={s}] [duration={ms}ms]` |
| `info` | SSE status confirmed | `WorkspaceSuspendResume: sse confirmed [workspace_id={id}] [status={s}] [sse_delay={ms}ms]` |
| `warn` | Suspend/resume failed (client-recoverable) | `WorkspaceSuspendResume: failed [workspace_id={id}] [action={suspend|resume}] [http_status={code}] [error={msg}] [duration={ms}ms]` |
| `warn` | Optimistic revert | `WorkspaceSuspendResume: reverted [workspace_id={id}] [restored_status={s}] [reason={msg}]` |
| `debug` | Keypress ignored (in-flight) | `WorkspaceSuspendResume: ignored [workspace_id={id}] [reason=in_flight]` |
| `debug` | Keypress ignored (invalid state) | `WorkspaceSuspendResume: ignored [workspace_id={id}] [reason=invalid_state] [current_status={s}] [attempted_action={suspend|resume}]` |
| `warn` | SSE disconnect during operation | `WorkspaceSuspendResume: sse disconnected [workspace_id={id}] [transitional_status={s}] [reconnect_attempt={n}]` |
| `error` | Unexpected error (non-HTTP) | `WorkspaceSuspendResume: unexpected error [workspace_id={id}] [error={msg}] [stack={trace}]` |
| `debug` | Retry initiated | `WorkspaceSuspendResume: retry [workspace_id={id}] [action={suspend|resume}] [original_error={type}]` |
| `info` | Status bar message shown | `WorkspaceSuspendResume: status [workspace_id={id}] [message={text}] [color={success|error|warning}]` |

### Error Cases Specific to TUI

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| Terminal resize during in-flight mutation | Mutation continues; status bar message re-renders at new width after completion | Automatic |
| SSE disconnect during mutation | HTTP mutation continues; status badge stays in transitional state until SSE reconnects | Automatic on SSE reconnect; user can press `R` to force refresh |
| SSE disconnect before mutation | Mutation works normally; final status may be delayed | SSE auto-reconnect delivers missed events |
| Network timeout (> 30s) | Transitional state reverts; status bar shows "Network error" | User presses `R` or `s`/`r` again |
| User quits TUI (`Ctrl+C`) during mutation | Mutation may or may not reach the server; no guarantee of completion | User checks state via CLI (`codeplane workspace status`) |
| User pops screen (`q`) during mutation | Mutation completes in background; result is discarded | State is correct on next visit |
| Auth token expires during mutation | 401 propagates to auth error screen after optimistic revert | User runs `codeplane auth login` |
| Server returns unexpected status value | TUI renders whatever the server returns in the badge; unknown statuses shown in `muted` color | N/A (server is source of truth) |
| Concurrent modification (workspace deleted by another user) | Server returns 404; badge reverts; error shown | User refreshes workspace list |
| Sandbox client unavailable on server | Resume returns 500; status bar shows "Server error"; badge reverts | Sysadmin configures sandbox; user retries |
| VM not provisioned (empty `freestyle_vm_id`) | Resume returns 409; status bar shows "Invalid state transition" | User may need to delete and recreate workspace |
| SSE delivers `failed` status unexpectedly | Badge updates to `[failed]` in red, status bar shows "Workspace operation failed" | User investigates via CLI or recreates workspace |
| Rapid navigation between workspaces during list mutations | Each workspace tracks its own in-flight state independently | Automatic — no cross-contamination |

### Failure Modes and Recovery

1. **Transitional state stall**: If neither the HTTP response nor SSE event arrives within 30 seconds, the transitional state times out. The badge reverts to the previous state, and the status bar shows "Operation timed out. Workspace state may have changed — press R to refresh."
2. **SSE gap**: If the HTTP request succeeds but the SSE event is delayed or missed, the badge updates from the HTTP response body's `status` field as a fallback. The SSE event, when it arrives, is reconciled (no flicker if states match).
3. **Stale list after suspend**: When the workspace list re-fetches, server data overwrites any optimistic state. If the mutation succeeded, the states will match.
4. **Memory**: Each in-flight mutation stores the previous status (1 string per workspace). No memory accumulation occurs. SSE subscriptions are cleaned up when the workspace list/detail unmounts.

## Verification

### E2E Tests (`e2e/tui/workspaces.test.ts`)

Tests use `@microsoft/tui-test` for terminal snapshot matching, keyboard interaction simulation, and text assertions. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backends are left failing — never skipped.

#### Snapshot Tests (19 tests)

| Test ID | Description | Terminal Size |
|---------|-------------|---------------|
| `SNAP-SUSPEND-001` | Workspace list with running workspace focused, before suspend | 120×40 |
| `SNAP-SUSPEND-002` | Workspace list after pressing `s` — badge shows `[suspending…]` in yellow | 120×40 |
| `SNAP-SUSPEND-003` | Workspace list after SSE confirms suspended — badge shows `[suspended]` in gray | 120×40 |
| `SNAP-SUSPEND-004` | Workspace list status bar showing success message after suspend | 120×40 |
| `SNAP-SUSPEND-005` | Workspace list status bar showing error message after failed suspend (403) | 120×40 |
| `SNAP-RESUME-006` | Workspace list with suspended workspace focused, before resume | 120×40 |
| `SNAP-RESUME-007` | Workspace list after pressing `r` — badge shows `[resuming…]` in yellow | 120×40 |
| `SNAP-RESUME-008` | Workspace list after SSE confirms running — badge shows `[running]` in green | 120×40 |
| `SNAP-SUSPEND-009` | Workspace detail with running workspace, full layout including SSH info | 120×40 |
| `SNAP-SUSPEND-010` | Workspace detail after pressing `s` — badge transitional, SSH info grayed out | 120×40 |
| `SNAP-SUSPEND-011` | Workspace detail after SSE confirms suspended — "Suspended at" timestamp visible | 120×40 |
| `SNAP-RESUME-012` | Workspace detail after pressing `r` on suspended workspace — badge transitional | 120×40 |
| `SNAP-RESUME-013` | Workspace detail after SSE confirms running — SSH info re-populated | 120×40 |
| `SNAP-SUSPEND-014` | Workspace list at 80×24 with suspended workspace — compact layout | 80×24 |
| `SNAP-SUSPEND-015` | Workspace list at 200×60 with suspended workspace — expanded layout | 200×60 |
| `SNAP-SUSPEND-016` | Workspace detail at 80×24 after suspend — SSH section hidden, badge visible | 80×24 |
| `SNAP-SUSPEND-017` | Status bar hint showing `s:suspend` for running workspace focused | 120×40 |
| `SNAP-SUSPEND-018` | Status bar hint showing `r:resume` for suspended workspace focused | 120×40 |
| `SNAP-SUSPEND-019` | Status bar hint showing no suspend/resume hint for `failed` workspace | 120×40 |

#### Keyboard Interaction Tests (21 tests)

| Test ID | Description | Key Sequence | Expected State |
|---------|-------------|-------------|----------------|
| `KEY-SUSPEND-001` | Suspend running workspace from list | Focus running workspace → `s` | Badge changes to `[suspending…]`, API receives POST suspend |
| `KEY-SUSPEND-002` | Resume suspended workspace from list | Focus suspended workspace → `r` | Badge changes to `[resuming…]`, API receives POST resume |
| `KEY-SUSPEND-003` | Suspend running workspace from detail | Navigate to running workspace detail → `s` | Badge changes to `[suspending…]`, SSH info grays out |
| `KEY-SUSPEND-004` | Resume suspended workspace from detail | Navigate to suspended workspace detail → `r` | Badge changes to `[resuming…]` |
| `KEY-SUSPEND-005` | Rapid double-press `s` on list | Focus running workspace → `s` `s` (< 100ms apart) | Only one API call made, second keypress ignored |
| `KEY-SUSPEND-006` | Rapid double-press `r` on detail | Navigate to suspended detail → `r` `r` (< 100ms apart) | Only one API call made, second keypress ignored |
| `KEY-SUSPEND-007` | `s` on suspended workspace (invalid state) | Focus suspended workspace → `s` | No API call, no visual change, no-op |
| `KEY-SUSPEND-008` | `r` on running workspace (invalid state) | Focus running workspace → `r` | No API call, no visual change, no-op |
| `KEY-SUSPEND-009` | `s` on failed workspace | Focus failed workspace → `s` | No API call, no-op |
| `KEY-SUSPEND-010` | `r` on failed workspace | Focus failed workspace → `r` | No API call, no-op |
| `KEY-SUSPEND-011` | `s` on pending workspace | Focus pending workspace → `s` | No API call, no-op |
| `KEY-SUSPEND-012` | Suspend then navigate away | Focus workspace → `s` → `q` | Screen pops, mutation completes in background |
| `KEY-SUSPEND-013` | `R` to retry after failed suspend | Focus workspace → `s` (server returns 500) → wait → `R` | Retry fires same POST request |
| `KEY-SUSPEND-014` | `R` to retry after failed resume | Focus suspended workspace → `r` (server returns 500) → wait → `R` | Retry fires same POST request |
| `KEY-SUSPEND-015` | Suspend preserves focus position | Focus 3rd workspace → `s` | After action, 3rd row still focused |
| `KEY-SUSPEND-016` | Suspend from list, verify on detail | `s` on list → `Enter` to open detail → verify badge shows suspended state | Consistent state across screens |
| `KEY-SUSPEND-017` | Resume from detail, verify on list | `r` on detail → `q` to return to list → verify badge shows running state | Consistent state across screens |
| `KEY-SUSPEND-018` | Status bar hints update after suspend | Focus running workspace → `s` → wait for confirm | Hints change from `s:suspend` to `r:resume` |
| `KEY-SUSPEND-019` | Status bar hints update after resume | Focus suspended workspace → `r` → wait for confirm | Hints change from `r:resume` to `s:suspend` |
| `KEY-SUSPEND-020` | `s` with no workspace focused (empty list) | Navigate to empty workspace list → `s` | No API call, no-op |
| `KEY-SUSPEND-021` | Multiple workspaces: suspend one, move, suspend another | `s` on row 1 → `j` → `s` on row 2 | Two independent API calls, both badges update |

#### Error Handling Tests (10 tests)

| Test ID | Description | Setup | Expected |
|---------|-------------|-------|----------|
| `ERR-SUSPEND-001` | 403 Permission denied on suspend | Authenticate as read-only user → `s` | Optimistic revert, status bar shows "Permission denied" in red |
| `ERR-SUSPEND-002` | 404 Workspace not found on suspend | Workspace deleted by another user → `s` | Optimistic revert, status bar shows "Workspace not found" in red |
| `ERR-SUSPEND-003` | 409 Conflict on resume (VM not provisioned) | Workspace without VM → `r` | Optimistic revert, status bar shows "Invalid state transition" |
| `ERR-SUSPEND-004` | 429 Rate limited on suspend | Exhaust rate limit → `s` | Optimistic revert, status bar shows "Rate limited. Retry in Ns." |
| `ERR-SUSPEND-005` | 500 Server error on resume (sandbox unavailable) | Server has no sandbox → `r` | Optimistic revert, status bar shows "Server error" in red |
| `ERR-SUSPEND-006` | Network timeout on suspend (> 30s) | Simulate network delay > 30s → `s` | Transitional state reverts, status bar shows "Network error" |
| `ERR-SUSPEND-007` | 401 Auth expired on suspend | Expire token → `s` | Optimistic revert, auth error screen shown |
| `ERR-SUSPEND-008` | Error message auto-dismisses after 3 seconds | `s` on 403 → wait 3s | Status bar error message disappears, normal hints restored |
| `ERR-SUSPEND-009` | SSE delivers `failed` during suspend | SSE sends `{ status: "failed" }` after `s` | Badge changes to `[failed]`, status bar shows "Workspace operation failed" |
| `ERR-SUSPEND-010` | SSE disconnect during suspend | SSE drops after `s` pressed | Badge stays at `[suspending…]` until SSE reconnects; HTTP result updates on reconnect |

#### Responsive Tests (8 tests)

| Test ID | Description | Terminal Size | Expected |
|---------|-------------|---------------|----------|
| `RESP-SUSPEND-001` | Suspend action at minimum terminal size | 80×24 | Badge toggles, truncated status message |
| `RESP-SUSPEND-002` | Suspend action at standard terminal size | 120×40 | Badge toggles, full status message, SSH info visible in detail |
| `RESP-SUSPEND-003` | Suspend action at large terminal size | 200×60 | Badge toggles, extended status message, full metadata |
| `RESP-SUSPEND-004` | Resize during in-flight suspend | Start at 120×40 → `s` → resize to 80×24 before response | Status bar message renders at new width |
| `RESP-SUSPEND-005` | Status badge visible at all sizes after suspend | Suspend → check at 80×24, 120×40, 200×60 | `[suspended]` badge visible at every size |
| `RESP-SUSPEND-006` | Resume action at minimum terminal size | 80×24 | Badge toggles, truncated status message |
| `RESP-SUSPEND-007` | Workspace detail SSH section at 80×24 | 80×24 | SSH section shows command only (no host/port/user breakdown) |
| `RESP-SUSPEND-008` | Workspace detail SSH section at 200×60 | 200×60 | SSH section shows full breakdown with copy hint |

#### Integration Tests (12 tests)

| Test ID | Description | Expected |
|---------|-------------|----------|
| `INT-SUSPEND-001` | Suspend workspace and verify server state | Press `s` → GET workspace → status is "suspended" |
| `INT-SUSPEND-002` | Resume workspace and verify server state | Press `r` on suspended → GET workspace → status is "running" |
| `INT-SUSPEND-003` | Suspend from list, verify on detail | Press `s` on list → Enter to open detail → badge shows `[suspended]`, SSH unavailable |
| `INT-SUSPEND-004` | Resume from detail, verify on list | Press `r` on detail → `q` to return to list → badge shows `[running]` |
| `INT-SUSPEND-005` | Suspend/resume round-trip | Press `s` → wait → `r` → verify status returns to `running` |
| `INT-SUSPEND-006` | Optimistic revert does not corrupt list data | Trigger 403 → verify all other workspaces in list are unchanged |
| `INT-SUSPEND-007` | SSH info unavailable after suspend | Suspend → navigate to detail → SSH section shows "(unavailable while suspended)" |
| `INT-SUSPEND-008` | SSH info available after resume | Suspend → resume → navigate to detail → SSH section shows valid connection info |
| `INT-SUSPEND-009` | SSE stream delivers status updates in real-time | Suspend → verify SSE event with `{ status: "suspended" }` is received and rendered |
| `INT-SUSPEND-010` | Suspended_at timestamp populated after suspend | Suspend → GET workspace → `suspended_at` is non-null ISO timestamp |
| `INT-SUSPEND-011` | Suspended_at timestamp cleared after resume | Resume → GET workspace → `suspended_at` is null |
| `INT-SUSPEND-012` | Workspace idle timeout does not change after suspend/resume | Note idle_timeout before → suspend → resume → verify idle_timeout unchanged |

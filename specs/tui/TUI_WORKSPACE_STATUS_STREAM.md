# TUI_WORKSPACE_STATUS_STREAM

Specification for TUI_WORKSPACE_STATUS_STREAM.

## High-Level User POV

The workspace status stream is the real-time backbone that keeps every workspace surface in the TUI synchronized with actual server-side state. Without it, workspace status badges would only update when the user manually navigates away and back. With it, the terminal developer sees workspace state transitions — `starting` to `running`, `running` to `suspended`, any state to `failed` — reflected live across every screen that displays workspace information.

When the user opens the workspace list screen, an SSE connection is established for each visible workspace. When a workspace transitions from `starting` to `running`, the status badge on that row animates from `[⠋ starting…]` (yellow with spinner) to `[running]` (green, spinner removed) without the user pressing any key. If a workspace enters the `failed` state — perhaps because the underlying VM failed to provision — the badge turns red and shows `[failed]`, and an inline error indicator appears on that row. All of this happens while the user continues navigating the list, selecting other rows, or filtering — the streaming updates are non-disruptive to the user's current focus and keyboard interaction.

On the workspace detail screen, the status stream provides the same live updates but with richer feedback. When the status transitions, the badge in the detail header updates, and secondary effects cascade: if the workspace transitions to `running`, the SSH tab's connection info becomes available and the uptime counter starts ticking. If it transitions to `suspended`, the SSH info grays out and a "Suspended at" timestamp appears. If it transitions to `failed`, an error details section appears below the metadata. The user never needs to press `R` to refresh — the SSE stream pushes state automatically.

Connection health is visible in the global status bar. When the SSE connection is active, a small `●` indicator in the status bar shows green. When the connection drops (network interruption, server restart, sleep/wake), the indicator turns red and shows `○ disconnected`. The TUI automatically attempts to reconnect using exponential backoff: 1 second, 2 seconds, 4 seconds, 8 seconds, capped at 30 seconds. During reconnection attempts, the indicator pulses yellow with `○ reconnecting…`. When the connection is re-established, the TUI re-fetches the workspace data via REST to reconcile any events missed during the disconnection window, then resumes the SSE stream. The user is never asked to manually reconnect — it is fully automatic.

The SSE connection uses ticket-based authentication. On mount, the TUI obtains an ephemeral SSE ticket from the auth API and passes it as a query parameter on the SSE endpoint URL. If the ticket expires (long-lived sessions), the reconnection logic obtains a fresh ticket before reconnecting. The user never sees ticket mechanics — authentication is invisible.

At all terminal sizes (80×24 through 200×60+), the streaming behavior is identical. The status badge is always visible. The status bar flash messages adapt their length to the terminal width. The connection health indicator is always present in the status bar's rightmost position. Terminal resize during an active SSE connection does not interrupt the stream — the visual layout recalculates while the connection continues unaffected.

When the user leaves a workspace screen (presses `q` to go back), the SSE connection for that workspace is cleanly closed. No orphan connections persist. When the user navigates to a different workspace, the old connection closes and a new one opens. The TUI never maintains more SSE connections than there are visible workspace references on screen.

The entire SSE lifecycle — ticket acquisition, connection establishment, keep-alive handling, reconnection, and cleanup — is managed by the `<SSEProvider>` context that wraps the TUI application root. Individual workspace screens consume status updates through the `useWorkspaceStatusStream` hook, which provides the current status, a connection health indicator, and a manual reconnect trigger for the rare case where the user wants to force a reconnection (via `R` on the workspace detail screen).

## Acceptance Criteria

### Definition of Done

- [ ] SSE connection to `GET /api/repos/:owner/:repo/workspaces/:id/stream` is established when a workspace detail view mounts
- [ ] SSE connections for all visible workspace rows are established when the workspace list screen mounts
- [ ] SSE connection uses ticket-based authentication via `POST /api/auth/sse-ticket` — long-lived tokens are never passed as query parameters
- [ ] Ticket is obtained before opening the SSE connection; if ticket acquisition fails (401), the TUI shows "Session expired. Run `codeplane auth login` to re-authenticate."
- [ ] The initial SSE event (sent by the server on connection) is used to set the workspace status, avoiding a separate REST call on mount
- [ ] Subsequent SSE events of type `workspace.status` update the workspace status badge in real-time
- [ ] Status badge transitions render within one frame (<16ms) of SSE event receipt
- [ ] The status badge uses semantic colors: `success` (ANSI 34) for `running`, `warning` (ANSI 178) for transitional states, `error` (ANSI 196) for `error`/`failed`, `muted` (ANSI 245) for `suspended`/`deleted`/`stopped`
- [ ] Transitional statuses (`starting`, `stopping`, `suspending`, `resuming`) display a braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) animating at 80ms per frame
- [ ] The spinner animation runs via a local timer, not driven by SSE events
- [ ] SSE events that arrive during an optimistic update override the optimistic state (SSE is authoritative)
- [ ] A status bar flash message appears for 3 seconds when a status transition completes (e.g., "Workspace is now running")
- [ ] Flash messages use the semantic color of the new status (green for running, yellow for suspended, red for error)

### SSE Connection Lifecycle

- [ ] SSE connection opens within 500ms of screen mount
- [ ] The `<SSEProvider>` context manages all SSE connections centrally
- [ ] SSE ticket has a 30-second TTL — if the connection is not established within 30 seconds of ticket issuance, a new ticket is requested
- [ ] SSE keep-alive pings (every 15 seconds from the server) are handled silently — no UI update
- [ ] If no keep-alive or event is received for 45 seconds, the connection is considered dead and reconnection begins
- [ ] On SSE disconnect, reconnection uses exponential backoff: 1s, 2s, 4s, 8s, capped at 30s
- [ ] Each reconnection attempt obtains a fresh SSE ticket
- [ ] On successful reconnection, a REST call to `GET /api/repos/:owner/:repo/workspaces/:id` fetches the current workspace state to reconcile missed events
- [ ] Maximum reconnection attempts before giving up: 20 (approximately 10 minutes of backoff)
- [ ] After max reconnection attempts, the status bar shows "Disconnected. Press R to reconnect." in `error` color
- [ ] `R` on any workspace screen triggers a manual reconnection attempt, resetting the backoff counter
- [ ] SSE connections are cleaned up (closed) when the workspace screen unmounts
- [ ] SSE connections for workspace list rows are cleaned up when the row scrolls out of the visible viewport plus a 10-row buffer
- [ ] Multiple components subscribing to the same workspace ID share a single SSE connection (deduplication)

### Status Bar Connection Indicator

- [ ] A connection health indicator renders in the status bar when any workspace SSE stream is active
- [ ] Connected state: green dot `●` with "connected" text (text hidden at 80×24)
- [ ] Reconnecting state: yellow dot `●` with "reconnecting…" text (text hidden at 80×24)
- [ ] Disconnected state: red dot `●` with "disconnected" text (text hidden at 80×24)
- [ ] The indicator reflects the aggregate health of all active SSE connections (worst state wins)
- [ ] The indicator is not shown when no workspace SSE streams are active (non-workspace screens)

### Edge Cases — Terminal Environment

- [ ] Terminal resize during active SSE connection does not disconnect or interrupt the stream
- [ ] If the terminal is resized to below 80×24 while streaming, the "terminal too small" message is shown but the SSE connection remains active in the background
- [ ] When the terminal is resized back above 80×24, the workspace screen resumes with the latest SSE-delivered state
- [ ] Rapid terminal resizes (e.g., dragging a window edge) do not cause multiple reconnection attempts
- [ ] The SSE connection survives `Ctrl+Z` (suspend process) and resume (`fg`) — on resume, a reconnection is triggered if the connection was lost
- [ ] No-color terminals (`NO_COLOR=1` or `TERM=dumb`): status badge text renders without color but with text labels (e.g., `[RUNNING]`, `[SUSPENDED]`) for differentiation
- [ ] 16-color terminals: status badge uses the closest available ANSI color (green=2, yellow=3, red=1, gray=7)

### Edge Cases — Data Boundaries

- [ ] Workspace IDs up to 36 characters (UUID format) are handled without truncation in SSE channel subscription
- [ ] SSE event payloads up to 64KB are parsed without error
- [ ] Malformed SSE events (invalid JSON in data field) are logged and silently discarded — no crash, no user-visible error
- [ ] SSE events with unknown `type` values are silently ignored
- [ ] SSE events referencing a workspace ID that does not match the subscribed workspace are discarded
- [ ] If the workspace is deleted by another user while the detail screen is open, the SSE stream delivers the `deleted` status and the badge updates; a status bar message shows "Workspace deleted by another user"
- [ ] Rapid status transitions (e.g., `starting` → `running` → `suspending` → `suspended` within 1 second) are all rendered — no event coalescing that would skip intermediate states

### Edge Cases — Rapid Key Input

- [ ] If the user rapidly navigates between workspace screens (push detail, pop, push another), SSE connections for unmounted screens are cleaned up within one frame
- [ ] Navigation away from a workspace screen during an in-flight SSE ticket request cancels the ticket request
- [ ] Rapid `R` presses (manual reconnect) are debounced: only one reconnection attempt per 2 seconds

## Design

### SSE Provider Architecture

The `<SSEProvider>` wraps the TUI application root and provides SSE connection management to all descendant components:

```
<SSEProvider>
  <AppShell>
    <HeaderBar />
    <ScreenRouter>
      {/* workspace screens consume SSE via useWorkspaceStatusStream */}
    </ScreenRouter>
    <StatusBar connectionHealth={sseHealth} />
  </AppShell>
</SSEProvider>
```

### Workspace List Screen — SSE Integration

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workspaces                    ● 3  │
├─────────────────────────────────────────────────────────────┤
│ ● my-workspace           [running]    @dev   2h ago         │
│ ● staging-env            [⠹ starting…] @dev  5m ago        │  ← spinner animates
│   test-workspace         [suspended]   @dev  1d ago         │
│ ● preview-pr-42          [running]    @ci    30m ago        │
│   old-workspace          [error]       @dev  3d ago         │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ j/k:nav Enter:open s:suspend r:resume c:new    ● connected  │
└─────────────────────────────────────────────────────────────┘
```

Each visible workspace row subscribes to `workspace_status_{id}` via the SSE provider. The green dot `●` prefix on workspace rows indicates a running workspace; the status badge `[running]`, `[starting…]`, `[suspended]`, `[error]` updates in-place via SSE without re-fetching the list.

### Workspace Detail Screen — SSE Integration

```
┌─────────────────────────────────────────────────────────────┐
│ … > Workspaces > my-workspace                          ● 3  │
├─────────────────────────────────────────────────────────────┤
│ my-workspace                                                │
│ [running]  @developer  created 2h ago  [persistent]         │  ← badge live-updates
│ idle: 30m  Uptime: 1h 42m 18s                               │  ← counter ticks when running
│                                                             │
│ 1:Overview  2:SSH  3:Sessions  4:Snapshots                  │
│ ─────────────────────────────────────────────────────────── │
│ ─── SSH Connection ───                                      │
│ Command: ssh -p 2222 developer@ws-host.codeplane.io  (c)    │
│ Host:    ws-host.codeplane.io                               │
│ Port:    2222                                               │
│ User:    developer                                          │
│ Token:   ●●●●●●●● (v to reveal)   Token valid for 4m 32s   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ s:suspend D:delete q:back                      ● connected   │
└─────────────────────────────────────────────────────────────┘
```

When SSE delivers a status change from `running` to `suspended`:

```
┌─────────────────────────────────────────────────────────────┐
│ … > Workspaces > my-workspace                          ● 3  │
├─────────────────────────────────────────────────────────────┤
│ my-workspace                                                │
│ [suspended]  @developer  created 2h ago  [persistent]       │  ← badge updated via SSE
│ idle: 30m  Suspended: just now                              │  ← uptime replaced
│                                                             │
│ 1:Overview  2:SSH  3:Sessions  4:Snapshots                  │
│ ─────────────────────────────────────────────────────────── │
│ ─── SSH Connection ───                                      │
│ Workspace suspended. Press r to resume.                     │  ← SSH info cleared
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Workspace is now suspended     r:resume D:delete q:back  ●  │  ← flash message
└─────────────────────────────────────────────────────────────┘
```

### Disconnection State

When SSE reconnection is in progress:

```
┌─────────────────────────────────────────────────────────────┐
│ … > Workspaces > my-workspace                          ● 3  │
├─────────────────────────────────────────────────────────────┤
│ my-workspace                                                │
│ [running]  @developer  created 2h ago  [persistent]         │
│ idle: 30m  Uptime: 1h 42m 18s                               │
│                                                             │
│ ...                                                         │
├─────────────────────────────────────────────────────────────┤
│ s:suspend D:delete q:back               ● reconnecting…     │
└─────────────────────────────────────────────────────────────┘
```

After max reconnection attempts:

```
├─────────────────────────────────────────────────────────────┤
│ s:suspend R:reconnect D:delete q:back   ● disconnected      │
└─────────────────────────────────────────────────────────────┘
```

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `R` | Workspace detail or list | Force manual SSE reconnection (resets backoff counter) |
| `R` | Workspace detail (disconnected state) | Reconnect and re-fetch workspace state |

Note: `R` for reconnection is only active when the SSE connection is in a degraded state (reconnecting or disconnected). When the connection is healthy, `R` is reserved for retry on the detail screen per `TUI_WORKSPACE_SUSPEND_RESUME`. All other workspace keybindings (`s`, `r`, `c`, `d`, `q`, etc.) are defined in their respective feature specs and are unaffected by the SSE stream feature.

### Responsive Behavior

**80×24 (minimum):**
- Status badge always visible, never truncated
- SSE connection indicator: colored dot only (no text)
- Flash messages truncate to fit: e.g., "now running" instead of "Workspace is now running"
- Braille spinner animation runs at same speed (80ms)

**120×40 (standard):**
- Full flash messages with workspace name: "Workspace 'my-workspace' is now running"
- SSE connection indicator: dot + text ("connected", "reconnecting…", "disconnected")
- All status badge states render with full text

**200×60+ (large):**
- Same as standard with wider padding
- Flash messages include additional context: "Workspace 'my-workspace' is now running (uptime reset)"
- Connection indicator may include reconnection attempt count: "reconnecting… (3/20)"

### Data Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useWorkspaceStatusStream(owner, repo, workspaceId)` | `@codeplane/ui-core` | Subscribe to SSE status events for a single workspace. Returns `{ status, connectionHealth, reconnect }`. |
| `useWorkspaceListStatusStream(owner, repo, workspaceIds)` | `@codeplane/ui-core` | Subscribe to SSE status events for multiple workspaces (list view). Returns `Map<workspaceId, status>` and aggregate `connectionHealth`. |
| `useSSETicket()` | `@codeplane/ui-core` | Obtain a short-lived SSE authentication ticket via `POST /api/auth/sse-ticket`. |
| `useWorkspace(owner, repo, workspaceId)` | `@codeplane/ui-core` | Fetch workspace data via REST. Called on reconnection to reconcile missed events. |
| `useWorkspaces(owner, repo)` | `@codeplane/ui-core` | Fetch workspace list. Called on list-screen reconnection. |

### OpenTUI Component Usage

- `<box>`: Layout containers for status badge, connection indicator, flash message area
- `<text>`: Status badge text (`[running]`, `[suspended]`, etc.), connection health text, flash messages
- `<scrollbox>`: Workspace list container (triggers SSE subscription management on scroll)
- Status badge rendered as `<text color={statusColor} bold>{statusText}</text>`
- Braille spinner rendered as `<text color="warning">{spinnerFrame}</text>` with `useTimeline` for 80ms frame cycling
- Connection indicator rendered as `<text color={healthColor}>●</text>` in status bar

## Permissions & Security

### Authorization Roles

| Role | SSE Access |
|------|-----------|
| Anonymous | ❌ No SSE connections — 401 on ticket request |
| Read-only (repository read access) | ✅ Can subscribe to workspace status streams for workspaces they can view |
| Write (repository write access) | ✅ Full SSE access for all workspaces in the repository |
| Admin | ✅ Full SSE access |

### Token and Ticket Security

- The TUI authenticates via token stored by `codeplane auth login` or the `CODEPLANE_TOKEN` environment variable
- SSE connections use ticket-based auth: the TUI exchanges its token for a 30-second, single-use SSE ticket via `POST /api/auth/sse-ticket`
- The long-lived token is never passed as a URL query parameter — only the short-lived ticket appears in the SSE URL
- SSE tickets are SHA-256 hashed before storage; the raw ticket is never persisted on the server
- If the token is revoked or expires, the next SSE ticket request returns 401 and the TUI shows the re-authentication message
- SSE ticket is consumed exactly once on connection establishment — replayed tickets are rejected

### Rate Limiting

- SSE ticket issuance: maximum 10 tickets per user per minute (sufficient for reconnection scenarios but prevents abuse)
- SSE connection establishment: maximum 5 concurrent SSE connections per user (prevents resource exhaustion from leaked connections)
- If rate limited (429), the TUI extends the reconnection backoff by the `Retry-After` header value
- Rate limit errors are shown in the status bar: "Rate limited. Retry in {N}s." in `warning` color

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|-----------|---------|------------|
| `tui.workspace.sse.connected` | SSE connection successfully established | `workspace_id`, `repo`, `connection_time_ms`, `is_reconnection: boolean` |
| `tui.workspace.sse.disconnected` | SSE connection lost | `workspace_id`, `repo`, `connected_duration_ms`, `reason: "server_close" \| "network" \| "timeout" \| "navigate_away"` |
| `tui.workspace.sse.reconnected` | SSE successfully reconnected after a drop | `workspace_id`, `repo`, `reconnection_attempts`, `total_downtime_ms` |
| `tui.workspace.sse.reconnect_failed` | Max reconnection attempts exhausted | `workspace_id`, `repo`, `total_attempts`, `total_downtime_ms` |
| `tui.workspace.sse.manual_reconnect` | User pressed `R` to force reconnect | `workspace_id`, `repo`, `previous_state: "reconnecting" \| "disconnected"` |
| `tui.workspace.sse.status_transition` | Workspace status changed via SSE | `workspace_id`, `repo`, `from_status`, `to_status`, `latency_ms` (time from server event to render) |
| `tui.workspace.sse.ticket_error` | SSE ticket acquisition failed | `repo`, `error_code: number`, `error_reason: string` |

### Common Properties (all events)

- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `layout`: `"compact"` | `"standard"` | `"expanded"`
- `screen`: `"workspace_list"` | `"workspace_detail"`

### Success Indicators

- **Connection reliability**: ≥ 99% of SSE connections remain active for the duration of the user's session without manual reconnection
- **Reconnection success rate**: ≥ 95% of automatic reconnections succeed within 3 attempts
- **Status update latency**: P95 of status transitions render within 200ms of server event emission
- **Manual reconnection rate**: < 5% of sessions require the user to press `R` (indicates healthy auto-reconnect)
- **Ticket error rate**: < 0.1% of ticket requests fail with non-401 errors

## Observability

### Logging Requirements

| Log Level | Event | Payload |
|-----------|-------|---------|
| `debug` | SSE connection opened | `{ workspace_id, channel, ticket_acquired_in_ms }` |
| `debug` | SSE event received | `{ workspace_id, event_type, event_id }` |
| `debug` | SSE keep-alive received | `{ workspace_id, channel }` |
| `info` | SSE reconnection successful | `{ workspace_id, attempt_number, downtime_ms }` |
| `warn` | SSE connection lost | `{ workspace_id, reason, will_retry: boolean }` |
| `warn` | SSE ticket acquisition failed (non-401) | `{ status_code, error }` |
| `warn` | Malformed SSE event discarded | `{ workspace_id, raw_data_length, parse_error }` |
| `error` | SSE reconnection exhausted | `{ workspace_id, total_attempts: 20, total_downtime_ms }` |
| `error` | SSE ticket 401 (session expired) | `{ workspace_id }` |

Logs are written to the TUI's debug log file (enabled via `CODEPLANE_TUI_DEBUG=1` or `--debug` flag). They are never rendered to the terminal UI.

### Error Cases and Recovery

| Error Case | Detection | Recovery | User Impact |
|-----------|-----------|----------|-------------|
| SSE connection drops (network) | No event or keep-alive for 45s | Auto-reconnect with exponential backoff | Yellow dot in status bar; last known status retained |
| SSE ticket 401 (expired session) | HTTP 401 from `/api/auth/sse-ticket` | Show auth message, stop reconnection | Red dot + "Session expired" in status bar |
| SSE ticket 429 (rate limited) | HTTP 429 from `/api/auth/sse-ticket` | Extend backoff by `Retry-After` value | Yellow dot + "Rate limited" in status bar for `Retry-After` duration |
| Malformed SSE event | JSON parse error on event data | Discard event, log warning, continue | None — stream continues normally |
| SSE event for wrong workspace | `workspace_id` mismatch | Discard event | None |
| Workspace deleted during viewing | SSE event with `status: "deleted"` | Update badge to `[deleted]`, show flash message | Badge changes to muted `[deleted]`; "Workspace deleted by another user" flash |
| Terminal resize during stream | `SIGWINCH` signal | Re-layout without touching SSE connection | Momentary re-render; stream unaffected |
| Process suspend (`Ctrl+Z`) + resume (`fg`) | Process resumes, connection likely stale | Force reconnection on resume, REST fetch to reconcile | Brief yellow dot on resume; reconciles within seconds |
| Server restart | SSE connection closed by server | Auto-reconnect after 1s | Yellow dot; reconciles on reconnect |
| Max reconnection attempts exhausted | 20 failed attempts | Stop retrying, show manual reconnect hint | Red dot + "Disconnected. Press R to reconnect." |

### Health Check

The SSE provider exposes a `connectionHealth` state that aggregates across all active workspace streams:

- `healthy`: All connections active, receiving keep-alives
- `degraded`: One or more connections in reconnection
- `disconnected`: All connections failed

This state is surfaced in the status bar indicator and available to telemetry.

## Verification

All tests target `e2e/tui/workspaces.test.ts` using `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing — they are never skipped or commented out.

### SSE Connection Lifecycle Tests

```
TEST: "establishes SSE connection on workspace detail mount"
  → Mount workspace detail screen for a running workspace
  → Assert SSE connection is opened to /api/repos/:owner/:repo/workspaces/:id/stream
  → Assert initial status badge renders [running] in green

TEST: "establishes SSE connections for visible workspace list rows"
  → Mount workspace list with 5 workspaces
  → Assert SSE connections are opened for all 5 workspace IDs
  → Assert each row displays correct status badge from initial SSE event

TEST: "cleans up SSE connection on workspace detail unmount"
  → Mount workspace detail screen
  → Press q to navigate back
  → Assert SSE connection is closed

TEST: "cleans up SSE connections when list rows scroll out of viewport"
  → Mount workspace list with 50 workspaces
  → Scroll down past the first 10 rows
  → Assert SSE connections for rows 1-10 are closed (minus buffer)
  → Assert SSE connections for newly visible rows are opened

TEST: "deduplicates SSE connections for same workspace ID"
  → Subscribe to the same workspace from two components
  → Assert only one SSE connection is opened
  → Unmount one component
  → Assert SSE connection remains active
  → Unmount second component
  → Assert SSE connection is closed

TEST: "uses ticket-based authentication for SSE connections"
  → Mount workspace detail screen
  → Assert POST /api/auth/sse-ticket is called before SSE connection
  → Assert SSE URL contains ?ticket= parameter
  → Assert long-lived token is NOT in the SSE URL
```

### Real-Time Status Update Tests

```
TEST: "updates workspace detail badge on SSE status event"
  → Mount workspace detail with status running
  → Server sends SSE event: { type: "workspace.status", data: { status: "suspended" } }
  → Assert badge changes from [running] (green) to [suspended] (muted gray)
  → Terminal snapshot: workspace-detail-status-suspended

TEST: "updates workspace list row badge on SSE status event"
  → Mount workspace list with workspace-1 as running
  → Server sends SSE event for workspace-1: status: "suspended"
  → Assert workspace-1 row badge changes to [suspended]
  → Assert other rows are unaffected

TEST: "displays braille spinner for transitional statuses"
  → Mount workspace detail with status starting
  → Assert badge shows [⠋ starting…] in yellow
  → Wait 80ms
  → Assert spinner frame advances (e.g., [⠙ starting…])
  → Terminal snapshot: workspace-detail-starting-spinner

TEST: "shows flash message on status transition"
  → Mount workspace detail with status starting
  → Server sends SSE event: status: "running"
  → Assert status bar shows "Workspace is now running" in green
  → Wait 3 seconds
  → Assert flash message clears

TEST: "SSE event overrides optimistic state"
  → Mount workspace detail with status running
  → Press s to suspend (optimistic: [suspending…])
  → Server sends SSE event: status: "running" (server rejected suspend)
  → Assert badge reverts to [running]

TEST: "handles rapid status transitions without skipping intermediate states"
  → Mount workspace detail with status starting
  → Server sends SSE events in rapid succession: running, suspending, suspended
  → Assert all three transitions render (capture terminal state after each)
  → Final state: [suspended]

TEST: "updates SSH info when workspace transitions to running via SSE"
  → Mount workspace detail on SSH tab with status starting
  → Assert SSH section shows "Waiting for workspace to start…"
  → Server sends SSE event: status: "running"
  → Assert SSH section populates with connection details
  → Terminal snapshot: workspace-ssh-after-running-transition

TEST: "clears SSH info when workspace transitions away from running via SSE"
  → Mount workspace detail on SSH tab with status running
  → Assert SSH section shows connection details
  → Server sends SSE event: status: "suspended"
  → Assert SSH section shows "Workspace suspended. Press r to resume."

TEST: "starts uptime counter when status becomes running"
  → Mount workspace detail with status starting
  → Server sends SSE event: status: "running"
  → Assert uptime counter appears and ticks

TEST: "stops uptime counter when status leaves running"
  → Mount workspace detail with status running
  → Assert uptime counter is ticking
  → Server sends SSE event: status: "suspended"
  → Assert uptime counter is replaced with "Suspended: just now"
```

### Reconnection Tests

```
TEST: "reconnects with exponential backoff on SSE disconnect"
  → Mount workspace detail
  → Simulate SSE connection drop
  → Assert status bar shows yellow dot with "reconnecting…"
  → Assert first reconnection attempt after ~1s
  → Simulate second disconnect
  → Assert second reconnection attempt after ~2s
  → Terminal snapshot: workspace-sse-reconnecting

TEST: "fetches workspace state via REST on reconnection"
  → Mount workspace detail with status running
  → Simulate SSE connection drop
  → During disconnect, workspace status changes to suspended on server
  → Simulate successful reconnection
  → Assert REST GET /api/repos/:owner/:repo/workspaces/:id is called
  → Assert badge updates to [suspended] from REST response

TEST: "shows disconnected state after max reconnection attempts"
  → Mount workspace detail
  → Simulate 20 consecutive SSE connection failures
  → Assert status bar shows red dot with "disconnected"
  → Assert status bar shows "R:reconnect" hint
  → Terminal snapshot: workspace-sse-disconnected

TEST: "R key triggers manual reconnection"
  → Mount workspace detail in disconnected state
  → Press R
  → Assert new SSE ticket is requested
  → Assert SSE reconnection is attempted
  → Assert status bar changes to "reconnecting…"

TEST: "R key is debounced at 2-second intervals"
  → Mount workspace detail in disconnected state
  → Press R twice rapidly (within 500ms)
  → Assert only one reconnection attempt is made

TEST: "obtains fresh SSE ticket on each reconnection"
  → Mount workspace detail
  → Note initial ticket value
  → Simulate SSE disconnect and reconnection
  → Assert a new POST /api/auth/sse-ticket call is made
  → Assert new ticket differs from initial ticket

TEST: "SSE survives terminal resize"
  → Mount workspace detail at 120×40
  → Establish SSE connection
  → Resize terminal to 80×24
  → Assert SSE connection is not interrupted
  → Server sends SSE event: status change
  → Assert badge updates correctly at new size
```

### Connection Health Indicator Tests

```
TEST: "shows green dot when SSE is connected"
  → Mount workspace detail with active SSE
  → Assert status bar contains green ● character
  → Terminal snapshot: workspace-sse-connected-indicator

TEST: "shows yellow dot when SSE is reconnecting"
  → Mount workspace detail
  → Simulate SSE disconnect
  → Assert status bar contains yellow ● character with "reconnecting…" text

TEST: "shows red dot when SSE is disconnected"
  → Exhaust reconnection attempts
  → Assert status bar contains red ● character with "disconnected" text

TEST: "hides connection indicator on non-workspace screens"
  → Navigate to dashboard (no workspace SSE streams)
  → Assert status bar does not contain SSE connection indicator

TEST: "connection indicator shows worst aggregate state"
  → Mount workspace list with 3 workspaces
  → 2 SSE connections healthy, 1 reconnecting
  → Assert indicator shows yellow (reconnecting), not green
```

### Responsive Tests

```
TEST: "80×24 — status badge visible, connection indicator dot-only"
  → Set terminal to 80×24
  → Mount workspace detail with SSE connected
  → Assert status badge is fully visible
  → Assert connection indicator is a single dot (no text)
  → Assert flash messages are truncated to fit
  → Terminal snapshot: workspace-sse-80x24

TEST: "120×40 — full connection indicator text"
  → Set terminal to 120×40
  → Mount workspace detail with SSE connected
  → Assert connection indicator shows "● connected"
  → Assert flash messages include workspace name
  → Terminal snapshot: workspace-sse-120x40

TEST: "200×60 — expanded indicator with attempt count"
  → Set terminal to 200×60
  → Mount workspace detail with SSE reconnecting (attempt 3)
  → Assert connection indicator shows "● reconnecting… (3/20)"
  → Terminal snapshot: workspace-sse-200x60-reconnecting
```

### Error Handling Tests

```
TEST: "shows auth message on 401 ticket response"
  → Mount workspace detail
  → Mock /api/auth/sse-ticket to return 401
  → Assert screen shows "Session expired. Run `codeplane auth login` to re-authenticate."
  → Assert no SSE reconnection is attempted

TEST: "handles 429 rate limit on ticket request"
  → Mount workspace detail
  → Mock /api/auth/sse-ticket to return 429 with Retry-After: 10
  → Assert status bar shows "Rate limited. Retry in 10s." in yellow
  → Assert next reconnection attempt is delayed by 10 seconds

TEST: "discards malformed SSE events gracefully"
  → Mount workspace detail
  → Server sends SSE event with invalid JSON: "not-json"
  → Assert no crash
  → Assert status badge retains previous state
  → Server sends valid SSE event
  → Assert badge updates correctly

TEST: "handles workspace deletion via SSE"
  → Mount workspace detail with status running
  → Server sends SSE event: status: "deleted"
  → Assert badge shows [deleted] in muted gray
  → Assert flash message: "Workspace deleted by another user"
  → Terminal snapshot: workspace-deleted-via-sse

TEST: "handles process suspend and resume"
  → Mount workspace detail with active SSE
  → Simulate SIGTSTP (Ctrl+Z) and SIGCONT (fg)
  → Assert SSE reconnection is triggered on resume
  → Assert workspace state is reconciled via REST
```

### Terminal Snapshot Tests

The following golden-file snapshots capture the full terminal output at key states:

```
SNAPSHOT: workspace-detail-status-running — Detail view with [running] badge, SSE connected
SNAPSHOT: workspace-detail-status-suspended — Detail view with [suspended] badge after SSE transition
SNAPSHOT: workspace-detail-starting-spinner — Detail view with [⠋ starting…] spinner badge
SNAPSHOT: workspace-detail-status-error — Detail view with [error] badge in red
SNAPSHOT: workspace-list-mixed-statuses — List with rows showing various live statuses
SNAPSHOT: workspace-ssh-after-running-transition — SSH tab populated after SSE running event
SNAPSHOT: workspace-sse-connected-indicator — Status bar with green connected dot
SNAPSHOT: workspace-sse-reconnecting — Status bar with yellow reconnecting indicator
SNAPSHOT: workspace-sse-disconnected — Status bar with red disconnected indicator and R hint
SNAPSHOT: workspace-deleted-via-sse — Detail view showing deleted state from SSE event
SNAPSHOT: workspace-sse-80x24 — Minimum terminal with dot-only indicator
SNAPSHOT: workspace-sse-120x40 — Standard terminal with full indicator text
SNAPSHOT: workspace-sse-200x60-reconnecting — Large terminal with reconnection attempt count
```

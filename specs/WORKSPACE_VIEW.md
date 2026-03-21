# WORKSPACE_VIEW

Specification for WORKSPACE_VIEW.

## High-Level User POV

When a developer is managing their coding environments in Codeplane, they need to drill into a single workspace to understand its full state, access it, and manage its lifecycle. The workspace view is the detail screen — the control panel for one specific cloud development environment.

From the CLI, web UI, or TUI, a user selects a workspace from the list (or navigates directly by ID) and sees a comprehensive dashboard for that workspace. The view answers the immediate questions: "Is this workspace running? How do I connect to it? When was it last active? What persistence mode is it in? Is it a fork of another workspace?" It surfaces the workspace's name, status, creation and update timestamps, persistence mode, idle timeout, VM identifier, and fork lineage if applicable.

When the workspace is running, the view prominently displays SSH connection details — a ready-to-copy SSH command, host, port, username, and a short-lived access token. The user can copy the SSH command with a single keystroke or click and immediately open a terminal session. When the workspace is suspended, the view offers a one-step resume action. When it's in a failed state, the view shows clear status context so the user knows whether to retry or delete.

Beyond the overview, the workspace view organizes related workspace resources into logical sections: sessions (active terminal connections into the workspace), and snapshots (point-in-time images that can be used to restore or create new workspaces). Users can create and destroy terminal sessions, create and delete snapshots, and manage the workspace lifecycle — suspend, resume, or delete — all from this single view.

The workspace view supports real-time status updates. If the workspace transitions from "starting" to "running" while the user is watching, the status badge updates live without requiring a refresh. If another team member or an automated process suspends the workspace, the view reflects the change immediately. This real-time behavior is critical because workspaces are infrastructure with active resource costs, and users need trustworthy status to make decisions about connecting, suspending, or deleting.

For teams using AI agents that work in workspaces, this view is also the place to monitor whether an agent's workspace is still active, inspect its session state, and take manual control if needed.

## Acceptance Criteria

### Definition of Done

- A user can retrieve full details of a single workspace by ID from API, CLI, TUI, and web surfaces.
- The view displays all workspace metadata: name, status, persistence, idle timeout, timestamps, fork information, and VM identifier.
- SSH connection information is retrievable when the workspace is in a running state.
- The view supports workspace lifecycle actions: suspend, resume, and delete.
- Sessions and snapshots are browsable from the workspace detail view.
- Real-time status updates are delivered via SSE so the view reflects workspace state transitions without manual refresh.
- All clients handle error states (not found, forbidden, server error) with clear, actionable messaging.

### Functional Constraints

- **Scope**: The workspace view is always accessed by a specific workspace ID within a repository context (`/:owner/:repo/workspaces/:id`).
- **Response payload**: The workspace detail response includes all fields: `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`. Optional fields (`parent_workspace_id`, `ssh_host`, `snapshot_id`) are included only when non-empty.
- **Status values**: Workspace `status` is one of: `pending`, `starting`, `running`, `suspended`, `stopped`, `failed`.
- **Workspace ID format**: Must be a valid UUID (36 characters with dashes). Invalid IDs return HTTP 400.
- **SSH info availability**: SSH connection info is only available when the workspace status is `running`. Requesting SSH info for a non-running workspace returns an appropriate error or empty state.
- **Access token TTL**: SSH access tokens have a 5-minute time-to-live. Clients must support token refresh.
- **Real-time updates**: The SSE stream for workspace status uses PostgreSQL LISTEN/NOTIFY on channel `workspace_status_{uuid_no_dashes}`. The initial event includes current workspace status.
- **Lifecycle actions from the view**: Suspend (only when `running`), Resume (only when `suspended`), Delete (from any non-deleted state). Invalid state transitions return HTTP 409.
- **Sessions sub-view**: Lists active sessions for this workspace with pagination (page-based, max 100 per page). Each session shows: `id`, `workspace_id`, `status`, `cols`, `rows`, `last_activity_at`, `idle_timeout_secs`, `created_at`, `updated_at`.
- **Snapshots sub-view**: Lists snapshots for this workspace with pagination (page-based, max 100 per page). Each snapshot shows: `id`, `name`, `workspace_id`, `freestyle_snapshot_id`, `created_at`, `updated_at`.

### Boundary Constraints

- **Workspace ID**: Must be a valid UUID format (pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`). Non-UUID values return HTTP 400 with `"workspace id is required"`.
- **Workspace name display**: 1–63 characters, pattern `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`. Names must be displayed in full without truncation in the detail view.
- **SSH command string**: Variable length depending on hostname and VM ID. Clients must handle SSH commands up to 512 characters.
- **Access token**: UUID format, 36 characters. Must be masked by default in all display surfaces.
- **Session dimensions**: `cols` and `rows` are positive integers. Typical range 1–500 for cols, 1–200 for rows.
- **Snapshot name**: 1–63 characters, same pattern as workspace name. Must be validated client-side before submission.
- **Pagination for sessions and snapshots**: `page` ≥ 1, `per_page` 1–100 (default 30). Values outside range return HTTP 400.
- **Maximum sessions per workspace**: No enforced hard limit at the view layer. TUI caps displayed sessions at 100 in memory.
- **Maximum snapshots per workspace**: No enforced hard limit at the view layer. TUI caps displayed snapshots at 100 in memory.

### Edge Cases

- **Workspace not found**: Returns HTTP 404 with `"workspace not found"`. Clients show clear "Workspace not found" message with back-navigation.
- **Workspace deleted by another user while viewing**: SSE stream delivers a `deleted` status event. Clients must handle this by showing a "This workspace has been deleted" banner and disabling all actions.
- **Workspace transitions while user is viewing**: Status badge, available actions, and SSH info section all update reactively. For example, if a workspace goes from `starting` → `running`, the SSH info section should auto-fetch connection details.
- **SSH info request for non-running workspace**: Returns appropriate error. Clients show contextual guidance.
- **Access token expires while user is viewing**: Clients detect expiry via countdown and auto-refresh. If refresh fails, show appropriate error.
- **Empty sessions list**: Show "No active sessions." with a create session action.
- **Empty snapshots list**: Show "No snapshots." with a create snapshot action.
- **Repository does not exist**: Returns HTTP 404 with `"repository not found"`.
- **User lacks repository access**: Returns HTTP 403 with `"forbidden"`.
- **Unauthenticated request**: Returns HTTP 401 with `"authentication required"`.
- **Workspace ID is empty string**: Returns HTTP 400 with `"workspace id is required"`.
- **Concurrent lifecycle actions**: If a user tries to suspend while another suspend is in flight, the second request should be rejected or debounced client-side. Server returns 409 for invalid state transitions.
- **Network disconnection during SSE stream**: Client shows "Disconnected" indicator and reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s). Maximum 20 reconnection attempts.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspaces/:id`

**Authentication**: Required (session cookie or PAT).

**Path Parameters**:

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `owner` | string | Required | Repository owner username or org |
| `repo` | string | Required | Repository name |
| `id` | string (UUID) | Required, valid UUID | Workspace ID |

**Response**: HTTP 200

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "repository_id": 1,
  "user_id": 7,
  "name": "feature-auth",
  "status": "running",
  "is_fork": false,
  "freestyle_vm_id": "vm-abc123def456",
  "persistence": "persistent",
  "idle_timeout_seconds": 1800,
  "suspended_at": null,
  "created_at": "2026-03-22T10:30:00.000Z",
  "updated_at": "2026-03-22T14:15:00.000Z",
  "ssh_host": "vm-abc123def456@ssh.codeplane.dev",
  "parent_workspace_id": "e23dc10b-48bb-4372-a567-0e02b2c3d480",
  "snapshot_id": "snap-001"
}
```

**Error Responses**:

| Status | Body | Trigger |
|--------|------|--------|
| 400 | `{"message": "workspace id is required"}` | Missing or invalid workspace ID |
| 401 | `{"message": "authentication required"}` | No valid session or PAT |
| 403 | `{"message": "forbidden"}` | User lacks repository access |
| 404 | `{"message": "repository not found"}` | Owner or repo does not exist |
| 404 | `{"message": "workspace not found"}` | Workspace ID does not exist or user has no access |
| 500 | `{"message": "internal server error"}` | Unhandled service error |

**Related Endpoints Used by the View**:

| Endpoint | Method | Purpose |
|----------|--------|--------|
| `/api/repos/:owner/:repo/workspaces/:id/ssh` | GET | Fetch SSH connection info |
| `/api/repos/:owner/:repo/workspaces/:id/stream` | GET | SSE status stream |
| `/api/repos/:owner/:repo/workspaces/:id/suspend` | POST | Suspend workspace |
| `/api/repos/:owner/:repo/workspaces/:id/resume` | POST | Resume workspace |
| `/api/repos/:owner/:repo/workspaces/:id` | DELETE | Delete workspace |
| `/api/repos/:owner/:repo/workspace/sessions` | GET | List sessions |
| `/api/repos/:owner/:repo/workspace/sessions` | POST | Create session |
| `/api/repos/:owner/:repo/workspace/sessions/:id/destroy` | POST | Destroy session |
| `/api/repos/:owner/:repo/workspaces/:id/snapshot` | POST | Create snapshot |
| `/api/repos/:owner/:repo/workspace-snapshots` | GET | List snapshots |
| `/api/repos/:owner/:repo/workspace-snapshots/:id` | DELETE | Delete snapshot |

### SDK Shape

**Service method**: `WorkspaceService.getWorkspace(workspaceID: string, repositoryID: number, userID: number)`

**Returns**: `Promise<WorkspaceResponse | null>`

**Behavior**:
- Queries database for workspace matching the ID, repository, and user.
- Returns `null` if workspace is not found or user has no access.
- Maps database row to `WorkspaceResponse` including conditional optional fields (`parent_workspace_id`, `ssh_host`, `snapshot_id`).
- Does not trigger any side effects (pure read).

**SSH Info method**: `WorkspaceService.getWorkspaceSSHConnectionInfo(workspaceID: string, repositoryID: number, userID: number)`

**Returns**: `Promise<WorkspaceSSHConnectionInfo | null>`

**Behavior**:
- Generates a short-lived sandbox access token (5-minute TTL).
- Returns SSH host, port, username, full SSH command, and access token.
- Returns `null` if workspace not found.
- Throws if workspace is not in `running` state.

### CLI Command

**Command**: `codeplane workspace view <id>`

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Workspace ID (UUID) |

**Options**:

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--repo`, `-R` | string | No (auto-detected) | Repository in `OWNER/REPO` format |

**Output (default)**: Formatted workspace details including:
- Name, Status, ID
- Persistence mode, Idle timeout (human-readable)
- Created at, Updated at (relative timestamps)
- Uptime (if running, computed from `updated_at`)
- Snapshot ID (if applicable)
- SSH connection details: command, host, port, username (if running)

**Output (--json)**: Raw JSON workspace object from the API.

**Behavior**:
- Resolves repository from `--repo` flag or current working directory.
- Fetches workspace detail via `GET /api/repos/:owner/:repo/workspaces/:id`.
- If workspace is running, also fetches SSH info and displays connection details.
- Exits with code 0 on success, non-zero on error.
- Prints human-readable error messages for 401, 403, 404.

### TUI UI

**Screen name**: Workspace Detail View

**Entry points**:
- `Enter` on a workspace list row
- Command palette: `:workspace <id>`
- Deep link: `codeplane tui --screen workspaces --repo owner/repo --workspace <id>`

**Header**:
```
my-workspace                                 [running]
@alice · created 4h ago · idle 30m · persistent
```

The header displays the workspace name (bold, full width), status badge (color-coded), owner username, relative creation time, idle timeout, and persistence mode.

**Tab navigation**: Four tabs accessed via `1`–`4`, `Tab`/`Shift+Tab`, or `h`/`l`:

**Tab 1: Overview**
- Persistence mode (ephemeral / sticky / persistent)
- Idle timeout (human-readable, e.g., "30m")
- VM ID (first 12 characters)
- Fork info: "Forked from {parent_name}" if `is_fork` is true
- Timestamps: Created at, Updated at, Suspended at (if applicable)
- Live uptime counter when status is `running` (updates every second)
- Quick actions bar: `s` suspend, `r` resume, `D` delete

**Tab 2: SSH**
- Visible only when workspace status is `running`
- SSH command in a code block: `ssh -p {port} {user}@{host}`
- Connection fields: Host, Port, Username
- Access token: Masked by default (`••••••••••••`), toggled with `v`
- Token countdown timer: Updates every second, color-coded (green >60s, yellow <60s, red expired)
- Actions: `c` copy SSH command, `y` copy ssh_host, `r` refresh token
- Non-running states: Contextual message ("Workspace suspended. Press r to resume.", "Waiting for workspace to start…", "Workspace stopped.")

**Tab 3: Sessions**
- Paginated list of active sessions (page size 20, max 100 in memory)
- Columns: Session ID (12 chars), Status, Dimensions (cols×rows), Last Activity, Idle Timeout
- Actions: `c` create new session, `D` destroy focused session (confirmation required)
- Empty state: "No active sessions. Press c to create one."

**Tab 4: Snapshots**
- Paginated list of snapshots (page size 20, max 100 in memory)
- Columns: Name, Snapshot ID (12 chars), Created At
- Actions: `c` create snapshot (name input), `D` delete focused snapshot (confirmation required)
- Snapshot name validation: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, 1–63 characters
- Empty state: "No snapshots. Press c to create one."

**Global keybindings**:

| Key | Action |
|-----|--------|
| `1`–`4` | Jump to tab |
| `Tab` / `Shift+Tab` | Cycle tabs |
| `h` / `l` | Adjacent tab |
| `s` | Suspend workspace (running only) |
| `r` | Resume workspace (suspended only) |
| `D` | Delete workspace (confirmation required) |
| `q` / `Esc` | Back to workspace list |
| `?` | Help overlay |
| `:` | Command palette |
| `R` | Retry failed fetch |

**Real-time behavior**:
- SSE connection established on screen mount
- Status badge updates immediately on status transition events
- SSH tab auto-fetches connection info when status transitions to `running`
- Deleted status from SSE shows "This workspace has been deleted" banner
- Connection indicator in status bar: `●` green (connected), `●` yellow (reconnecting), `●` red (disconnected)

**Responsive breakpoints**:

| Breakpoint | Adaptation |
|------------|------------|
| 80×24 (minimum) | Status + owner only in header, abbreviated tab labels, minimal columns |
| 120×40 (standard) | Full header metadata, all tab columns, standard spacing |
| 200×60+ (large) | Extra padding, full timestamps, untruncated UUIDs, VM ID shown in full |

**Delete confirmation modal**:
```
Delete workspace "my-workspace"?
This action cannot be undone.

[y] Delete    [n] Cancel
```

### Web UI Design

**Route**: `/:owner/:repo/workspaces/:id`

**Layout**: Repository workbench with workspace detail as the main content area.

**Header section**:
- Workspace name (large, bold)
- Status badge (color-coded chip: green/running, yellow/pending, gray/suspended, red/failed)
- Metadata row: Owner avatar + username, persistence badge, idle timeout, created timestamp

**Tab bar**: Overview | SSH | Sessions | Snapshots

**Overview tab**:
- Property grid: Status, Persistence, Idle Timeout, VM ID, Fork Status, Created At, Updated At, Suspended At
- Live uptime counter for running workspaces
- Action buttons: Suspend/Resume (toggle), Delete (danger button with confirmation dialog)

**SSH tab**:
- Code block with copyable SSH command
- Connection detail cards: Host, Port, Username
- Token section: Masked by default, reveal toggle, countdown timer, refresh button
- Non-running state: Banner with contextual guidance

**Sessions tab**:
- Table with columns: ID, Status, Dimensions, Last Activity, Idle Timeout, Actions
- "Create Session" button at top
- Row-level "Destroy" button with confirmation
- Pagination controls

**Snapshots tab**:
- Table with columns: Name, ID, Created At, Actions
- "Create Snapshot" button at top (opens modal with name input)
- Row-level "Delete" button with confirmation
- Pagination controls

**Real-time updates**: Status badge and SSH info auto-update via SSE without page refresh.

**Empty states**: Each tab has a distinct empty state with illustration and primary action CTA.

### Documentation

The following user-facing documentation should be written:

- **"Viewing Workspace Details" guide**: Explains what information is available in the workspace detail view, how to interpret status values, and how lifecycle actions work.
- **"Connecting to Workspaces via SSH" guide**: Documents SSH connection info, the access token lifecycle, and troubleshooting.
- **CLI reference for `codeplane workspace view`**: Documents the command, arguments, flags, output formats, and examples.
- **API reference for `GET /api/repos/:owner/:repo/workspaces/:id`**: Documents path parameters, response schema, and error responses.
- **API reference for `GET /api/repos/:owner/:repo/workspaces/:id/ssh`**: Documents SSH connection info response and token TTL.
- **API reference for `GET /api/repos/:owner/:repo/workspaces/:id/stream`**: Documents SSE event types, reconnection, and authentication.
- **TUI keyboard reference**: Documents workspace detail view keybindings across all tabs.
- **"Managing Workspace Sessions" guide**: Documents creating and destroying terminal sessions.
- **"Workspace Snapshots" guide**: Documents creating, listing, deleting snapshots, naming constraints, and restoring from snapshots.

## Permissions & Security

### Authorization Roles

| Role | Can view workspace? | Can view SSH info? | Can suspend/resume? | Can delete? | Can manage sessions? | Can manage snapshots? |
|------|--------------------|--------------------|--------------------|-----------|--------------------|---------------------|
| Owner | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Admin | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Member (write) | ✅ Own only | ✅ Own only | ✅ Own only | ✅ Own only | ✅ Own only | ✅ Own only |
| Member (read-only) | ✅ Own only | ✅ Own only | ✅ Own only | ✅ Own only | ✅ Own only | ✅ Own only |
| Anonymous | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

- Workspace access is filtered by the authenticated user's ID. A user cannot view another user's workspace unless they are an organization owner or repository admin.
- The repository must exist and the user must have at least read access to the repository.
- SSH access tokens are short-lived (5-minute TTL) and scoped to a single workspace. They do not grant broader platform access.
- Access tokens are never included in workspace list responses — they are only available via the dedicated `/ssh` endpoint.

### Rate Limiting

- **Workspace detail endpoint**: 120 requests per minute per authenticated user.
- **SSH info endpoint**: 30 requests per minute per authenticated user (due to token generation cost).
- **Lifecycle actions (suspend/resume/delete)**: 10 requests per minute per authenticated user per workspace.
- **Session create/destroy**: 20 requests per minute per authenticated user.
- **Snapshot create/delete**: 10 requests per minute per authenticated user.
- **SSE stream**: One concurrent connection per workspace per user. Duplicate connections replace the previous one.
- **Burst allowance**: Up to 5 requests in a 1-second window for detail/SSH endpoints.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) included in responses.
- HTTP 429 returned when rate limit exceeded, with `Retry-After` header.

### Data Privacy

- Workspace responses include `user_id` (internal numeric identifier) and `repository_id`. These are acceptable as the endpoint is authenticated and scoped.
- `freestyle_vm_id` is an opaque infrastructure identifier that does not expose sensitive topology.
- SSH access tokens are sensitive credentials. They must be:
  - Masked by default in all display surfaces (TUI, web, CLI unless explicitly requested).
  - Never logged in application logs.
  - Never included in telemetry events.
  - Never cached beyond their 5-minute TTL.
- SSH host and port information reveals infrastructure endpoints. This is acceptable for authenticated users with workspace access.
- No PII beyond user IDs is exposed in the workspace detail response.
- Snapshot names are user-provided and may contain sensitive project information; they should not appear in public-facing surfaces.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workspace.detail.viewed` | User fetches workspace detail | `workspace_id`, `repository_id`, `owner`, `repo`, `user_id`, `client` (web/cli/tui/api), `workspace_status`, `is_fork`, `persistence` |
| `workspace.ssh_info.viewed` | User fetches SSH connection info | `workspace_id`, `repository_id`, `user_id`, `client` |
| `workspace.ssh_info.command_copied` | User copies SSH command | `workspace_id`, `user_id`, `client` |
| `workspace.ssh_info.token_refreshed` | User refreshes SSH token | `workspace_id`, `user_id`, `client`, `trigger` (manual/auto) |
| `workspace.suspended` | User suspends workspace from detail view | `workspace_id`, `repository_id`, `user_id`, `client`, `uptime_seconds` |
| `workspace.resumed` | User resumes workspace from detail view | `workspace_id`, `repository_id`, `user_id`, `client`, `suspended_duration_seconds` |
| `workspace.deleted` | User deletes workspace from detail view | `workspace_id`, `repository_id`, `user_id`, `client`, `workspace_status_at_deletion`, `age_seconds` |
| `workspace.session.created` | User creates a session | `workspace_id`, `session_id`, `user_id`, `client`, `cols`, `rows` |
| `workspace.session.destroyed` | User destroys a session | `workspace_id`, `session_id`, `user_id`, `client` |
| `workspace.snapshot.created` | User creates a snapshot | `workspace_id`, `snapshot_id`, `user_id`, `client`, `snapshot_name` |
| `workspace.snapshot.deleted` | User deletes a snapshot | `workspace_id`, `snapshot_id`, `user_id`, `client` |
| `workspace.detail.tab_switched` | User switches between tabs in detail view | `workspace_id`, `user_id`, `client`, `from_tab`, `to_tab` |
| `workspace.sse.connected` | SSE stream connection established | `workspace_id`, `user_id`, `client` |
| `workspace.sse.disconnected` | SSE stream connection lost | `workspace_id`, `user_id`, `client`, `reason` (timeout/error/navigation), `connected_duration_seconds` |
| `workspace.sse.reconnected` | SSE stream reconnected after disconnect | `workspace_id`, `user_id`, `client`, `reconnect_attempt_number`, `downtime_seconds` |

### Funnel Metrics

- **Detail → SSH copy conversion**: Percentage of workspace detail views that result in an SSH command copy. Target: > 40%.
- **Detail → Session creation**: Percentage of workspace detail views that result in a session creation. Target: > 20%.
- **Detail → Snapshot creation**: Percentage of workspace detail views that result in a snapshot creation. Target: > 10%.
- **SSH token auto-refresh rate**: Percentage of SSH info views where the token expires and is auto-refreshed (indicates users staying on the page). Target: < 30%.
- **Suspend → Resume round-trip time**: Average time between suspending and resuming the same workspace. Indicates workspace reuse patterns.
- **View-to-action ratio**: Percentage of detail views that result in any lifecycle action (suspend/resume/delete). Target: > 25%.
- **SSE connection health**: Percentage of SSE connections that remain stable for the duration of the detail view session. Target: > 95%.
- **Detail view load time P95**: Time from navigation to full render. Target: < 800ms.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Trigger |
|-----------|-------|-------------------|--------|
| Workspace detail request received | `info` | `request_id`, `workspace_id`, `repository_id`, `user_id`, `client_ip` | Every detail request |
| Workspace detail response sent | `info` | `request_id`, `workspace_id`, `workspace_status`, `duration_ms` | Every successful response |
| Workspace not found | `warn` | `request_id`, `workspace_id`, `repository_id`, `user_id` | 404 response |
| Workspace detail auth failure | `warn` | `request_id`, `workspace_id`, `client_ip`, `reason` | 401 or 403 response |
| Workspace detail service error | `error` | `request_id`, `workspace_id`, `error_message`, `stack_trace` | 500 response |
| SSH info request received | `info` | `request_id`, `workspace_id`, `user_id` | Every SSH info request |
| SSH access token generated | `info` | `request_id`, `workspace_id`, `token_ttl_seconds` | Successful SSH info response (token value NEVER logged) |
| SSH info for non-running workspace | `warn` | `request_id`, `workspace_id`, `workspace_status` | SSH info requested for non-running workspace |
| Workspace SSE connection opened | `info` | `request_id`, `workspace_id`, `user_id` | SSE stream established |
| Workspace SSE connection closed | `info` | `request_id`, `workspace_id`, `user_id`, `connected_duration_ms`, `events_sent` | SSE stream closed |
| Workspace lifecycle action executed | `info` | `request_id`, `workspace_id`, `action` (suspend/resume/delete), `user_id`, `duration_ms` | Successful lifecycle action |
| Workspace lifecycle action failed | `error` | `request_id`, `workspace_id`, `action`, `error_message`, `workspace_status` | Failed lifecycle action |
| Session created | `info` | `request_id`, `workspace_id`, `session_id`, `user_id`, `cols`, `rows` | Successful session creation |
| Session destroyed | `info` | `request_id`, `workspace_id`, `session_id`, `user_id` | Successful session destruction |
| Snapshot created | `info` | `request_id`, `workspace_id`, `snapshot_id`, `snapshot_name`, `user_id` | Successful snapshot creation |
| Snapshot deleted | `info` | `request_id`, `workspace_id`, `snapshot_id`, `user_id` | Successful snapshot deletion |
| Workspace database query timeout | `error` | `request_id`, `workspace_id`, `query`, `duration_ms` | DB query exceeds 5s |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_view_requests_total` | Counter | `status_code`, `client` | Total workspace detail requests |
| `codeplane_workspace_view_duration_seconds` | Histogram | `client` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_workspace_ssh_info_requests_total` | Counter | `status_code`, `client` | Total SSH info requests |
| `codeplane_workspace_ssh_info_duration_seconds` | Histogram | `client` | SSH info request duration |
| `codeplane_workspace_ssh_tokens_generated_total` | Counter | — | Total SSH access tokens generated |
| `codeplane_workspace_sse_connections_active` | Gauge | — | Currently active SSE connections for workspace status |
| `codeplane_workspace_sse_connections_total` | Counter | `close_reason` (normal/timeout/error) | Total SSE connections opened |
| `codeplane_workspace_sse_events_sent_total` | Counter | `event_type` | Total SSE events dispatched |
| `codeplane_workspace_lifecycle_actions_total` | Counter | `action` (suspend/resume/delete), `status_code` | Total lifecycle action requests |
| `codeplane_workspace_lifecycle_duration_seconds` | Histogram | `action` | Lifecycle action duration |
| `codeplane_workspace_sessions_created_total` | Counter | — | Total sessions created |
| `codeplane_workspace_sessions_destroyed_total` | Counter | — | Total sessions destroyed |
| `codeplane_workspace_snapshots_created_total` | Counter | — | Total snapshots created |
| `codeplane_workspace_snapshots_deleted_total` | Counter | — | Total snapshots deleted |
| `codeplane_workspace_view_errors_total` | Counter | `error_type` (auth/not_found/validation/internal) | Total errors by category |

### Alerts

#### Alert: High Workspace View Error Rate
- **Condition**: `rate(codeplane_workspace_view_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check Grafana dashboard for workspace view error rate panel.
  2. Query logs: filter by `level=error` and workspace_id for the last 15 minutes.
  3. Check database connectivity: verify PostgreSQL is accepting connections.
  4. Check if the workspace service is failing to deserialize database rows (common after schema migrations).
  5. If database is the root cause, check `pg_stat_activity` for long-running queries or lock contention.
  6. Check for recent deployments that may have introduced a regression in `getWorkspace` or `toWorkspaceResponse`.
  7. Escalate to platform team if not resolved within 15 minutes.

#### Alert: SSH Token Generation Failures
- **Condition**: `rate(codeplane_workspace_ssh_info_requests_total{status_code=~"5.."}[5m]) > 0.1`
- **Severity**: Critical
- **Runbook**:
  1. SSH token generation failures block users from connecting to workspaces.
  2. Check logs for SSH info error events.
  3. Verify the sandbox access token generation path: check that the token store (database) is writable.
  4. Check if the container sandbox service is reachable and healthy.
  5. Verify that the workspace VM is actually running by checking the container runtime directly.
  6. If specific workspaces fail: check if those VMs are in a zombie state (running in DB but stopped in container runtime).
  7. Escalate to infrastructure team if container runtime is unhealthy.

#### Alert: Workspace SSE Connection Saturation
- **Condition**: `codeplane_workspace_sse_connections_active > 500`
- **Severity**: Warning
- **Runbook**:
  1. High SSE connection counts consume server memory and file descriptors.
  2. Check if a specific user or automation is opening excessive connections.
  3. Verify that clients are properly closing SSE connections on navigation away.
  4. Check if SSE connection deduplication is working (one per user per workspace).
  5. Consider increasing file descriptor limits if legitimate usage is growing.
  6. If a bot is the cause, apply per-user SSE connection limits.

#### Alert: Workspace View Latency Degradation
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_view_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check Grafana dashboard for P95 latency trend.
  2. Run `EXPLAIN ANALYZE` on the workspace get query with affected workspace IDs.
  3. Check if the relevant index exists and is being used.
  4. Verify database connection pool is not saturated.
  5. Check if a specific workspace ID is causing the slowdown.
  6. If widespread: check overall database load and consider connection pool tuning.

#### Alert: Workspace Lifecycle Action Failure Spike
- **Condition**: `rate(codeplane_workspace_lifecycle_actions_total{status_code=~"5.."}[5m]) > 0.1`
- **Severity**: Critical
- **Runbook**:
  1. Lifecycle action failures mean users cannot suspend, resume, or delete workspaces.
  2. Check which action type is failing by filtering the counter.
  3. For suspend/resume failures: verify the container sandbox client is reachable.
  4. For delete failures: check if the workspace VM can be destroyed.
  5. Check for 409 errors separately — these are state transition conflicts, not infrastructure failures.
  6. Check database write path: verify the workspace status update query is succeeding.
  7. Escalate to infrastructure team if container runtime is the root cause.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Database connection lost | 500 | Internal server error | Automatic connection pool retry; alert fires if sustained |
| Database query timeout | 500 | Internal server error after 30s | Query cancelled; investigate slow queries |
| Workspace not found | 404 | "workspace not found" | Client shows message with back-navigation |
| Repository not found | 404 | "repository not found" | Client shows error; user corrects input |
| Invalid workspace ID format | 400 | "workspace id is required" | Client validates before submission |
| Access denied | 403 | "forbidden" | Client redirects to auth or access-denied page |
| Session expired | 401 | "authentication required" | Client triggers re-authentication flow |
| Invalid state transition | 409 | Conflict error | Client disables invalid actions based on current status |
| Container runtime unreachable | 500 | "internal server error" | Alert fires; infrastructure team investigates |
| SSE connection dropped | — | Client reconnects with exponential backoff | Automatic; user sees "reconnecting" indicator |
| Workspace deleted by another user | SSE event | "deleted" status delivered | Client shows deletion banner, disables actions |
| Snapshot creation fails | 500 | "internal server error" | User retries; check container runtime health |
| Session creation fails (workspace not running) | 400/409 | Error message | User must resume workspace first |

## Verification

### API Integration Tests

- **Get workspace by valid ID**: Create a workspace, fetch by ID, assert HTTP 200 with all required fields present.
- **Get workspace returns all required fields**: Assert response contains: `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`.
- **Get workspace `id` is a valid UUID**: Assert `id` matches UUID format.
- **Get workspace `name` matches creation name**: Create with name "my-ws", fetch, assert `name` is "my-ws".
- **Get workspace `status` is valid enum value**: Assert `status` is one of `pending`, `starting`, `running`, `suspended`, `stopped`, `failed`.
- **Get workspace `is_fork` is boolean**: Assert `is_fork` is `true` or `false`.
- **Get workspace `persistence` is a valid mode**: Assert `persistence` is one of `ephemeral`, `sticky`, `persistent`.
- **Get workspace `idle_timeout_seconds` is a positive number**: Assert it's a number > 0.
- **Get workspace `created_at` and `updated_at` are ISO-8601 strings**: Parse both timestamps and assert valid dates.
- **Get workspace `suspended_at` is null for running workspace**: Assert `suspended_at` is `null` when workspace is running.
- **Get workspace `suspended_at` is ISO-8601 for suspended workspace**: Suspend workspace, fetch, assert `suspended_at` is a valid timestamp.
- **Get workspace includes `parent_workspace_id` for forked workspace**: Fork a workspace, fetch the fork, assert `parent_workspace_id` is present and matches the parent ID.
- **Get workspace excludes `parent_workspace_id` for non-forked workspace**: Create regular workspace, fetch, assert `parent_workspace_id` is absent from response.
- **Get workspace includes `ssh_host` when VM ID is set**: Assert `ssh_host` is present when `freestyle_vm_id` is non-empty.
- **Get workspace includes `snapshot_id` when created from snapshot**: Create from snapshot, fetch, assert `snapshot_id` is present.
- **Get workspace excludes `snapshot_id` when not created from snapshot**: Create without snapshot, fetch, assert `snapshot_id` is absent.
- **Get workspace with non-existent ID returns 404**: Use a valid UUID that doesn't exist, assert HTTP 404 with `"workspace not found"`.
- **Get workspace with empty ID returns 400**: Request with empty `:id`, assert HTTP 400 with `"workspace id is required"`.
- **Get workspace for non-existent repository returns 404**: Use invalid `owner/repo`, assert HTTP 404 with `"repository not found"`.
- **Get workspace without authentication returns 401**: Request without auth, assert HTTP 401.
- **Get workspace for another user's workspace returns 404**: Create workspace as user A, fetch as user B (non-admin), assert 404.
- **Get workspace as repo admin for another user's workspace returns 200**: Create workspace as user A, fetch as repo admin, assert 200.
- **Get workspace with maximum-length name (63 chars) displays correctly**: Create with 63-character name, fetch, assert full name returned.
- **Get workspace with minimum-length name (1 char) displays correctly**: Create with 1-character name, fetch, assert name returned.

### SSH Info API Tests

- **Get SSH info for running workspace returns connection details**: Assert response includes `workspace_id`, `session_id`, `vm_id`, `host`, `ssh_host`, `username`, `port`, `access_token`, `command`.
- **Get SSH info `access_token` is a non-empty string**: Assert token is present and non-empty.
- **Get SSH info `command` contains ssh prefix**: Assert `command` starts with `ssh`.
- **Get SSH info `port` is a valid port number**: Assert `port` is an integer between 1 and 65535.
- **Get SSH info `username` is a non-empty string**: Assert `username` is present.
- **Get SSH info for non-running workspace returns appropriate error**: Suspend workspace, request SSH info, assert error response.
- **Get SSH info for non-existent workspace returns 404**: Assert HTTP 404.
- **Get SSH info without authentication returns 401**: Assert HTTP 401.
- **Get SSH info generates unique tokens on each call**: Call twice, assert tokens are different.
- **SSH info access token TTL is 5 minutes**: Assert token has appropriate TTL.

### Workspace SSE Stream Tests

- **SSE stream returns initial status event on connection**: Connect to stream, assert first event contains current workspace status.
- **SSE stream delivers status change events**: Suspend a running workspace while connected to stream, assert `workspace.status` event received with new status.
- **SSE stream uses correct content type**: Assert `Content-Type: text/event-stream`.
- **SSE stream for non-existent workspace returns 404**: Assert HTTP 404.
- **SSE stream without authentication returns 401**: Assert HTTP 401.
- **SSE stream sends keep-alive pings**: Connect and wait, assert ping events received within 30 seconds.

### Lifecycle Action Tests

- **Suspend running workspace from detail view**: Assert response status is `suspended` with `suspended_at` timestamp.
- **Resume suspended workspace from detail view**: Assert response status is `running` or `starting` with `suspended_at` cleared.
- **Suspend non-running workspace returns 409**: Assert HTTP 409 for invalid state transition.
- **Resume non-suspended workspace returns 409**: Assert HTTP 409 for invalid state transition.
- **Delete workspace from detail view returns 204**: Assert HTTP 204 No Content.
- **Delete already-deleted workspace returns 404**: Delete workspace, delete again, assert HTTP 404.
- **Get workspace after deletion returns 404**: Delete workspace, fetch, assert HTTP 404.

### Session Management Tests

- **Create session for running workspace**: Assert HTTP 201 with session object containing `id`, `workspace_id`, `status` (running), `cols`, `rows`.
- **Create session with custom cols and rows**: Pass `cols: 120`, `rows: 40`, assert response matches.
- **Create session with maximum valid cols (500) and rows (200)**: Assert HTTP 201 with matching dimensions.
- **Create session with cols exceeding 500 returns 400**: Assert HTTP 400 with validation error.
- **Create session without cols/rows uses defaults**: Assert response has reasonable default dimensions.
- **Create session for non-running workspace returns error**: Assert error indicating workspace must be running.
- **List sessions for workspace**: Create 3 sessions, list, assert array of 3 with correct `workspace_id`.
- **List sessions with pagination**: Create 35 sessions, list with `per_page=10`, assert 10 returned with `X-Total-Count: 35`.
- **List sessions with per_page=100 (maximum valid)**: Assert up to 100 returned.
- **List sessions with per_page=101 returns 400**: Assert HTTP 400.
- **Destroy session returns 204**: Assert HTTP 204.
- **Destroy non-existent session returns 404**: Assert HTTP 404.
- **Get session SSH info returns connection details**: Assert response includes all SSH connection fields.

### Snapshot Management Tests

- **Create snapshot from workspace**: Assert HTTP 201 with snapshot object.
- **Create snapshot with name**: Pass `name: "my-snapshot"`, assert response `name` matches.
- **Create snapshot with maximum name length (63 chars)**: Assert successful creation with 63-character name.
- **Create snapshot with name exceeding 63 chars returns 400**: Assert HTTP 400.
- **Create snapshot with invalid name characters returns 400**: Assert HTTP 400 for names with uppercase, spaces, or special characters.
- **Create snapshot with name starting with hyphen returns 400**: Assert HTTP 400.
- **Create snapshot with name ending with hyphen returns 400**: Assert HTTP 400.
- **Create snapshot with minimum name length (1 char)**: Assert HTTP 201.
- **List snapshots for workspace**: Create 3 snapshots, list, assert array of 3.
- **List snapshots with pagination**: Create 35 snapshots, list with `per_page=10`, assert 10 returned with `X-Total-Count: 35`.
- **List snapshots with per_page=100 (maximum valid)**: Assert up to 100 returned.
- **List snapshots with per_page=101 returns 400**: Assert HTTP 400.
- **Delete snapshot returns 204**: Assert HTTP 204.
- **Delete non-existent snapshot returns 404**: Assert HTTP 404.
- **Get snapshot by ID returns correct snapshot**: Assert all fields present and correct.

### CLI E2E Tests

- **`codeplane workspace view <id>` displays workspace details**: Create workspace, run view command, assert output contains workspace name, status, and ID.
- **`codeplane workspace view <id> --json` returns valid JSON**: Parse output as JSON, assert it's a valid workspace object.
- **`codeplane workspace view <id>` shows SSH info for running workspace**: Assert output contains SSH command, host, and port when workspace is running.
- **`codeplane workspace view <id>` with --repo flag**: Run with explicit `--repo owner/repo`, assert successful output.
- **`codeplane workspace view <id>` auto-detects repo from cwd**: From inside a cloned repository, run view command, assert correct repository resolution.
- **`codeplane workspace view <id>` exits with code 0 on success**: Assert exit code 0.
- **`codeplane workspace view <id>` exits non-zero for non-existent workspace**: Assert non-zero exit code and "not found" error message.
- **`codeplane workspace view <id>` exits non-zero without auth**: Assert non-zero exit code and auth error message.
- **`codeplane workspace view <id>` shows uptime for running workspace**: Assert output contains uptime information.
- **`codeplane workspace view <id>` shows persistence mode**: Assert output contains persistence value.
- **`codeplane workspace view <id>` shows idle timeout**: Assert output contains idle timeout value.
- **`codeplane workspace view <id>` shows snapshot ID when applicable**: Create from snapshot, view, assert snapshot ID shown.
- **`codeplane workspace view <id>` with maximum-length workspace name (63 chars)**: Assert full name displayed without truncation.

### TUI E2E Tests

- **Workspace detail screen renders with correct header**: Navigate to workspace detail, assert workspace name and status badge displayed.
- **Workspace detail screen shows metadata row**: Assert owner, creation time, persistence mode displayed.
- **Tab 1 (Overview) displays workspace properties**: Assert persistence, idle timeout, VM ID, timestamps shown.
- **Tab 2 (SSH) displays connection info for running workspace**: Navigate to SSH tab, assert SSH command, host, port, username displayed.
- **Tab 2 (SSH) shows contextual message for suspended workspace**: Assert "Workspace suspended" guidance message.
- **Tab 3 (Sessions) lists active sessions**: Create sessions, navigate to tab, assert sessions listed.
- **Tab 3 (Sessions) empty state shows create action**: With no sessions, assert "No active sessions. Press c to create one."
- **Tab 4 (Snapshots) lists snapshots**: Create snapshots, navigate to tab, assert snapshots listed.
- **Tab 4 (Snapshots) empty state shows create action**: With no snapshots, assert "No snapshots. Press c to create one."
- **Tab navigation with 1-4 keys**: Press `1`-`4`, assert correct tab is active.
- **Tab navigation with Tab/Shift+Tab**: Press Tab repeatedly, assert tabs cycle.
- **Status badge updates in real-time via SSE**: Suspend workspace via API, assert TUI status badge updates without manual refresh.
- **'s' key triggers suspend for running workspace**: Press `s`, assert workspace transitions to suspended state.
- **'r' key triggers resume for suspended workspace**: Press `r`, assert workspace transitions to running state.
- **'D' key triggers delete confirmation**: Press `D`, assert confirmation modal appears.
- **Delete confirmation 'y' deletes workspace**: Press `D` then `y`, assert workspace deleted and navigated back to list.
- **Delete confirmation 'n' cancels deletion**: Press `D` then `n`, assert workspace not deleted.
- **SSH command copy with 'c' key**: On SSH tab, press `c`, assert clipboard contains SSH command.
- **Token visibility toggle with 'v' key**: On SSH tab, press `v`, assert token visibility toggles.
- **Token countdown updates in real-time**: Assert countdown timer decrements.
- **'q' navigates back to workspace list**: Press `q`, assert workspace list screen displayed.
- **SSE connection indicator in status bar**: Assert green dot when connected.
- **SSE reconnection on disconnect**: Simulate disconnect, assert yellow reconnecting indicator, then green on reconnect.

### Playwright (Web UI) E2E Tests

- **Workspace detail page loads**: Navigate to `/:owner/:repo/workspaces/:id`, assert page renders with workspace name.
- **Workspace detail page shows status badge**: Assert status badge with correct color for current state.
- **Workspace detail page shows metadata**: Assert owner, persistence, idle timeout, timestamps visible.
- **Overview tab displays workspace properties**: Assert all properties listed.
- **SSH tab displays connection info**: Click SSH tab, assert SSH command block, host, port, username visible.
- **SSH tab copy button copies command**: Click copy button, verify clipboard content.
- **SSH tab token masked by default**: Assert token field shows mask characters, not plaintext.
- **SSH tab token reveal toggle**: Click reveal button, assert token becomes visible.
- **Sessions tab lists sessions**: Click Sessions tab, assert session table rendered.
- **Sessions tab create button opens form**: Click "Create Session", assert form/modal appears.
- **Snapshots tab lists snapshots**: Click Snapshots tab, assert snapshot table rendered.
- **Snapshots tab create button opens modal**: Click "Create Snapshot", assert name input modal appears.
- **Snapshot create validates name with maximum length (63 chars)**: Enter 63-character valid name, assert acceptance.
- **Snapshot create rejects name exceeding 63 chars**: Enter 64-character name, assert validation error.
- **Snapshot create validates name format**: Enter invalid name (uppercase, special chars), assert validation error.
- **Suspend button suspends running workspace**: Click Suspend, assert status updates to suspended.
- **Resume button resumes suspended workspace**: Click Resume, assert status updates to running/starting.
- **Delete button opens confirmation dialog**: Click Delete, assert confirmation dialog appears.
- **Delete confirmation deletes workspace and redirects**: Confirm delete, assert redirected to workspace list.
- **Real-time status update via SSE**: Suspend workspace via API while viewing detail, assert status badge updates without page refresh.
- **Page shows 404 for non-existent workspace**: Navigate to invalid workspace ID, assert "Workspace not found" message.
- **Pagination in sessions tab**: Create > 30 sessions, assert pagination controls appear and work.
- **Pagination in snapshots tab**: Create > 30 snapshots, assert pagination controls appear and work.

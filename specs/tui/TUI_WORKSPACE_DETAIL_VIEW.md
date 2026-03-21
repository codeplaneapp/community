# TUI_WORKSPACE_DETAIL_VIEW

Specification for TUI_WORKSPACE_DETAIL_VIEW.

## High-Level User POV

The workspace detail view is the screen a developer sees after selecting a workspace from the workspace list or navigating directly via the command palette (`:workspace abc123`) or deep link (`codeplane tui --screen workspaces --repo owner/repo --workspace abc123`). It is a single, vertically scrollable detail screen that shows everything about a workspace: its name, status, configuration, SSH connection info, sessions, and snapshots — all rendered in a dense, keyboard-navigable layout optimized for managing cloud development environments without leaving the terminal.

The screen opens with the workspace name prominently displayed at the top in bold text, followed by a status badge — a colored pill that live-updates via SSE streaming. The badge shows the current status: `[running]` in green, `[suspended]` in yellow, `[starting]` in yellow with a spinner, `[stopping]` in yellow with a spinner, `[error]` in red, or `[deleted]` in muted gray. Immediately below the name, a metadata row shows the owner's username, creation timestamp, persistence mode (ephemeral/sticky/persistent), idle timeout, and the repository this workspace belongs to.

Below the metadata, a tab bar provides navigation across four sections: **Overview** (1), **SSH** (2), **Sessions** (3), and **Snapshots** (4). Tab navigation uses `Tab`/`Shift+Tab` to cycle, number keys `1`–`4` to jump directly, or `h`/`l` to move between adjacent tabs. The active tab is highlighted with reverse video and underline.

The **Overview** tab is the default landing section and shows the workspace configuration: persistence mode, idle timeout duration, VM ID (truncated), whether the workspace is a fork and its parent workspace name if applicable, and timestamps (created, updated, suspended). When the workspace is running, a live uptime counter ticks in real-time. When suspended, the `suspended_at` timestamp is shown prominently. The overview also surfaces a quick-action bar at the bottom: `s` to suspend (when running), `r` to resume (when suspended), and `D` to delete (with confirmation).

The **SSH** tab shows the SSH connection information when the workspace is in a running state. The primary display is a copyable `ssh` command string rendered in a `<code>` block (e.g., `ssh -p 2222 root@localhost`). Below the command, a details section shows the individual connection fields: host, port, username, and access token (masked by default, revealed with `v` toggle). The access token has a 5-minute TTL and is generated on demand. When the workspace is not running, the SSH tab shows "Workspace must be running to connect via SSH. Press r to resume." in muted text.

The **Sessions** tab lists active terminal sessions attached to this workspace. Each session row shows the session ID (truncated to 12 characters), status, terminal dimensions (cols×rows), last activity timestamp, and idle timeout. The user can create a new session with `c` or destroy the focused session with `D` (with confirmation). When the last session is destroyed, the workspace auto-suspends if no active sessions remain. Empty state shows "No active sessions." in muted text.

The **Snapshots** tab lists snapshots created from this workspace. Each snapshot row shows the name, snapshot ID (truncated to 12 characters), and creation timestamp. The user can create a new snapshot with `c` (opens a name input form) or delete the focused snapshot with `D` (with confirmation). Empty state shows "No snapshots. Press c to create one." in muted text.

The workspace status streams in real-time via SSE. When the status transitions (e.g., from `starting` to `running`), the badge updates immediately, the SSH info becomes available, and a brief status bar confirmation flashes (e.g., "Workspace is now running"). When the workspace enters an error state, an error message section appears below the metadata with details about the failure. SSE uses PG LISTEN/NOTIFY on the `workspace_status_{id}` channel (UUID dashes removed).

The primary actions on the workspace detail are: `s` to suspend (available when running), `r` to resume (available when suspended), `D` to delete (available in any non-deleted state, with a confirmation modal), and `c` for context-sensitive creation (new session in Sessions tab, new snapshot in Snapshots tab). All destructive actions require a confirmation dialog: a modal overlay asking "Are you sure? Press y to confirm, n to cancel." Forking is not available in Community Edition (returns 501).

At the minimum 80×24 terminal size, the metadata row collapses to show only the status badge and owner. The SSH command block wraps to fit. Session and snapshot rows hide optional columns (idle timeout, terminal dimensions). At 120×40, the full metadata row is visible with all fields. At 200×60, wider content renders with more generous padding, full timestamps, and untruncated IDs.

The breadcrumb in the header bar shows the full navigation path: `Dashboard > owner/repo > Workspaces > workspace-name`. The status bar shows context-sensitive keybinding hints that change based on the active tab and the workspace's current state.

## Acceptance Criteria

### Screen lifecycle
- [ ] The workspace detail view is pushed onto the navigation stack when the user presses `Enter` on a workspace in the workspace list
- [ ] The workspace detail view is pushed via the command palette (`:workspace ID`)
- [ ] The workspace detail view is pushed via deep link (`codeplane tui --screen workspaces --repo owner/repo --workspace ID`)
- [ ] Pressing `q` pops the workspace detail view and returns to the previous screen
- [ ] The breadcrumb displays `… > Workspaces > {workspace-name}` where workspace-name is the workspace's name field
- [ ] The screen title in the navigation stack entry is `Workspace: {name}` (name truncated to 40 characters with `…`)

### Workspace header
- [ ] The workspace name renders in bold text, full width, wrapping to multiple lines if necessary
- [ ] The workspace name is never truncated on the detail screen — it wraps within the available width
- [ ] The status badge renders immediately after or below the name
- [ ] Status badge values and colors: `[running]` in `success` color (ANSI 34), `[suspended]` in `warning` color (ANSI 178), `[starting]` in `warning` (ANSI 178) with braille spinner, `[stopping]` in `warning` (ANSI 178) with braille spinner, `[resuming]` in `warning` (ANSI 178) with braille spinner, `[suspending]` in `warning` (ANSI 178) with braille spinner, `[pending]` in `muted` (ANSI 245) with braille spinner, `[error]` in `error` color (ANSI 196), `[failed]` in `error` color (ANSI 196), `[stopped]` in `muted` (ANSI 245), `[deleted]` in `muted` (ANSI 245)
- [ ] The status badge uses square brackets and text, not background color, for accessibility on 16-color terminals
- [ ] Transitional statuses (`starting`, `stopping`, `resuming`, `suspending`, `pending`) show a spinning braille character (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) at 100ms per frame before the status text
- [ ] The status badge updates in real-time via SSE without requiring user interaction

### Metadata row
- [ ] The owner's username renders as `@username` in `primary` color (ANSI 33)
- [ ] The creation timestamp renders as a relative time in `muted` color (ANSI 245): "just now", "5m ago", "2h ago", "3d ago", "Jan 15, 2025"
- [ ] The persistence mode renders as a badge: `[ephemeral]` in `muted`, `[sticky]` in cyan (ANSI 37), `[persistent]` in `primary` (ANSI 33)
- [ ] The idle timeout renders as "idle: {N}m" in `muted` color (converting seconds to minutes)
- [ ] The repository context renders as `owner/repo` in `primary` color (ANSI 33)
- [ ] The `updated_at` timestamp renders when different from `created_at`, as "updated 2h ago" in `muted` color
- [ ] When the workspace is a fork, a "Fork of: {parent-workspace-name}" line appears in the metadata
- [ ] The VM ID renders as the first 12 characters in `muted` color
- [ ] When `source_snapshot_id` is set, "From snapshot: {snapshot-name}" line appears in the metadata

### Tab bar
- [ ] Four tabs render below the metadata: Overview (1), SSH (2), Sessions (3), Snapshots (4)
- [ ] Active tab has reverse-video + underline styling; inactive tabs in `muted` color
- [ ] Each tab includes a numeric prefix (`1:Overview`, `2:SSH`, etc.)
- [ ] `Tab` / `Shift+Tab` cycle tabs forward/backward (with wrapping)
- [ ] `1`–`4` jump directly to the corresponding tab
- [ ] `h`/`l` navigate to adjacent tabs (no wrap)
- [ ] Tab change preserves scroll position per-tab (returning to a tab restores its scroll)
- [ ] Tab change does not trigger a full-screen loading spinner — each tab manages its own loading state

### Overview tab
- [ ] Shows workspace configuration as a key-value section: persistence, idle timeout (human-readable), VM ID, fork status
- [ ] When running: shows live uptime counter formatted as "Uptime: Xh Ym Zs" that ticks every second
- [ ] When suspended: shows `suspended_at` timestamp prominently as "Suspended: {relative time}" in `warning` color
- [ ] Shows timestamps section: Created, Updated, Suspended at (if applicable)
- [ ] Quick-action bar at the bottom of the overview: available actions depend on workspace state
- [ ] When running: action bar shows `s:suspend  D:delete  q:back`
- [ ] When suspended: action bar shows `r:resume  D:delete  q:back`
- [ ] When starting/stopping/resuming/suspending/pending: action bar shows `q:back` (no actions during transition)
- [ ] When error/failed: action bar shows `D:delete  q:back`
- [ ] When stopped: action bar shows `D:delete  q:back`
- [ ] When deleted: action bar shows `q:back` only

### SSH tab
- [ ] When workspace is running: displays SSH command in a `<code>` block
- [ ] SSH command format: `ssh -p {port} {username}@{host}` (default: `ssh -p {port} root@localhost`)
- [ ] Below the command: detailed connection info as key-value pairs (Host, Port, Username, Access Token)
- [ ] Access token is masked by default, displayed as `••••••••••••`
- [ ] Pressing `v` toggles access token visibility
- [ ] Pressing `y` copies the SSH command to clipboard (with status bar confirmation "SSH command copied")
- [ ] When workspace is not running: shows "Workspace must be running to connect via SSH." in `muted` text
- [ ] When workspace is suspended: appends "Press r to resume." after the not-running message
- [ ] SSH connection info loads via `getWorkspaceSSHConnectionInfo()` with 5-minute TTL access tokens
- [ ] Access tokens are SHA256-hashed server-side and never logged

### Sessions tab
- [ ] Lists active sessions as a navigable list with `j`/`k`
- [ ] Each session row shows: session ID (first 12 chars), status, dimensions (e.g., "80×24"), last activity (relative time), idle timeout
- [ ] Focused session row uses reverse-video highlighting
- [ ] `c` opens session creation form (terminal dimensions input: cols, rows; defaults: 80, 24)
- [ ] `D` on focused session opens confirmation modal, then destroys session on confirm
- [ ] `Enter` on focused session shows session SSH connection info (inline expand or sub-detail)
- [ ] Empty state: "No active sessions." in `muted` text
- [ ] Sessions list is paginated: page size 20, loads more on scroll past 80%
- [ ] When last session is destroyed, workspace auto-suspends (status badge updates via SSE)

### Snapshots tab
- [ ] Lists snapshots as a navigable list with `j`/`k`
- [ ] Each snapshot row shows: name (truncated to 30 chars), snapshot ID (first 12 chars), creation timestamp (relative)
- [ ] Focused snapshot row uses reverse-video highlighting
- [ ] `c` opens snapshot creation form (name input field; max 255 characters)
- [ ] Snapshot name validation: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, 1-63 characters
- [ ] `D` on focused snapshot opens confirmation modal, then deletes snapshot on confirm
- [ ] Empty state: "No snapshots. Press c to create one." in `muted` text
- [ ] Snapshots list is paginated: page size 20, loads more on scroll past 80%

### Actions
- [ ] `s` suspends workspace (running state only); shows error flash for non-running states
- [ ] `r` resumes workspace (suspended state only); shows error flash for non-suspended states
- [ ] `D` opens delete confirmation modal from any non-deleted state
- [ ] Delete confirmation modal: "Delete workspace '{name}'? This cannot be undone. (y/n)"
- [ ] Session destroy confirmation: "Destroy session {id}? (y/n)"
- [ ] Snapshot delete confirmation: "Delete snapshot '{name}'? (y/n)"
- [ ] All write actions disabled while another mutation is in-flight
- [ ] Suspend/resume actions apply optimistically: badge updates immediately, reverts on server error
- [ ] After successful suspend: SSH tab shows not-running message, uptime counter stops
- [ ] After successful resume: SSH tab loads connection info, uptime counter starts
- [ ] After successful delete: navigates back to workspace list automatically
- [ ] 409 Conflict on duplicate names shows inline error message
- [ ] 422 Unprocessable Entity for field validation errors shows inline error

### SSE streaming
- [ ] Workspace status SSE stream connects on mount via `GET /api/repos/:owner/:repo/workspaces/:id/stream`
- [ ] Status badge updates in real-time when SSE events arrive (event types: `workspace.status`, `workspace.session`)
- [ ] Status transitions trigger status bar flash: "Workspace is now {status}"
- [ ] SSE disconnection does not crash the screen; status bar shows disconnected indicator
- [ ] SSE reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [ ] On reconnection, workspace data is re-fetched via REST to catch missed events
- [ ] SSE uses ticket-based authentication obtained via the auth API
- [ ] Initial status event sent on SSE connection establishment

### Data loading
- [ ] Workspace detail loads from `useWorkspace(workspaceID, repositoryID, userID)` on mount
- [ ] SSH info loads from `getWorkspaceSSHConnectionInfo()` when SSH tab is activated and workspace is running
- [ ] Sessions load from `listSessions()` when Sessions tab is activated
- [ ] Snapshots load from `listWorkspaceSnapshots()` when Snapshots tab is activated
- [ ] Workspace request fires immediately on mount; tab-specific data loads lazily on tab activation
- [ ] A full-screen loading spinner with "Loading workspace…" appears during the initial workspace fetch
- [ ] If the workspace fetch fails with 404, the screen shows "Workspace not found" in `error` color with "Press q to go back"
- [ ] If the workspace fetch fails with a network error, the screen shows "Failed to load workspace" in `error` color with "Press R to retry"
- [ ] Tab data fetch failures show inline errors within their tabs, not full-screen errors
- [ ] Successful workspace data is cached for 30 seconds; re-navigating within that window shows cached data instantly
- [ ] Pagination defaults: page size 30 (server), max 100 per request; display page size 20

### Boundary constraints
- [ ] Workspace name: max display 60 characters, wraps if longer (never truncated on detail)
- [ ] Workspace name in breadcrumb/stack: truncated at 30 characters with `…`
- [ ] Workspace name format: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, 1-63 characters
- [ ] VM ID display: first 12 characters
- [ ] Session ID display: first 12 characters
- [ ] Snapshot ID display: first 12 characters
- [ ] Snapshot name: truncated at 30 characters with `…` in list rows
- [ ] Username: 39 character cap with `…`
- [ ] SSH host: 60 character cap with `…`
- [ ] Access token: always masked unless toggled; 64 character max display
- [ ] Sessions list: 100-item memory cap with "Showing 100 of N sessions" notice
- [ ] Snapshots list: 100-item memory cap with "Showing 100 of N snapshots" notice
- [ ] Relative timestamps switch to absolute format after 30 days
- [ ] Uptime counter updates every second; stops at 99d 23h 59m 59s and shows "99d+"
- [ ] Idle timeout display: converts seconds to human-readable (30m, 1h, etc.); 0 shows "idle: never"
- [ ] Default idle timeout: 1800 seconds (30 minutes)

### Responsive behavior
- [ ] 80×24: compact metadata (status + owner only), abbreviated tabs (1:Ovrvw, 2:SSH, 3:Sess, 4:Snap), hide optional columns (idle timeout, dimensions in sessions)
- [ ] 120×40: full metadata row, full tab labels, all columns visible
- [ ] 200×60: expanded padding, full timestamps, untruncated IDs (up to 36 chars)
- [ ] Below 80×24: "Terminal too small" message
- [ ] Resize during SSE stream does not disconnect or cause visual artifacts
- [ ] SSH command block wraps at available width — no horizontal overflow

### Edge cases
- [ ] Unicode/emoji in workspace names: no terminal corruption
- [ ] Workspace deleted by another user while viewing: next API interaction returns 404; "Workspace no longer exists" shown
- [ ] SSE stream delivers unknown status value: badge shows `[{status}]` in `muted` color
- [ ] Rapid suspend/resume toggling: debounced; second action blocked while first is in-flight
- [ ] Fork workspace (501 not implemented): shows "Forking not available" in `error` color
- [ ] No color support: ASCII fallback status indicators (`[RUNNING]`, `[SUSPENDED]`, etc.) without ANSI colors
- [ ] Rapid `j`/`k` in sessions/snapshots lists: no visual flickering or missed focus updates
- [ ] SSH connection info with very long hostnames: wraps within `<code>` block
- [ ] Workspace with zero idle timeout: shows "idle: never" instead of "idle: 0m"
- [ ] Confirmation modal focus trap: `Tab` and arrow keys stay within modal; only `y`/`n`/`Esc` dismiss
- [ ] Stale pending workspaces (>5 min without VM): server marks as failed; SSE delivers status change
- [ ] Session auto-suspend: destroying last session triggers workspace suspend via server; SSE delivers status change

## Design

### Layout structure

At standard terminal size (120×40), after subtracting header (1 row) and status bar (1 row), the content area is 38 rows × 120 columns:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ my-dev-workspace                                                                                       [running] ⠋ │
│ @alice · created 2h ago · updated 30m ago · [persistent] · idle: 30m · acme/widget · vm:a1b2c3d4e5f6              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  1:Overview    2:SSH    3:Sessions    4:Snapshots                                                                   │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                      │
│  Persistence:   persistent                                                                                           │
│  Idle timeout:  30 minutes                                                                                           │
│  VM ID:         a1b2c3d4e5f6                                                                                         │
│  Fork:          No                                                                                                   │
│                                                                                                                      │
│  Uptime:        2h 14m 32s                                                                                           │
│                                                                                                                      │
│  Created:       2h ago                                                                                               │
│  Updated:       30m ago                                                                                              │
│                                                                                                                      │
│                                                                                                                      │
│  ─── Actions ───                                                                                                     │
│  s:suspend  D:delete  q:back                                                                                         │
│                                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

SSH tab when running (120×40):

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  1:Overview    2:SSH    3:Sessions    4:Snapshots                                                                   │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐                               │
│  │ ssh -p 2222 root@localhost                                                        │                               │
│  └────────────────────────────────────────────────────────────────────────────────────┘                               │
│  y:copy command                                                                                                      │
│                                                                                                                      │
│  Host:          localhost                                                                                            │
│  Port:          2222                                                                                                 │
│  Username:      root                                                                                                 │
│  Access Token:  ••••••••••••  (v:reveal)                                                                             │
│                                                                                                                      │
│  Token expires in 5 minutes.                                                                                         │
│                                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Sessions tab (120×40):

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  1:Overview    2:SSH    3:Sessions    4:Snapshots                                                                   │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Session ID     Status     Dimensions    Last Activity    Idle Timeout                                               │
│  ────────────── ────────── ──────────── ──────────────── ────────────                                                │
│  ▸ a1b2c3d4e5f6 running    120×40        2m ago           30m                                                        │
│    b2c3d4e5f6a1 running    80×24         15m ago          30m                                                        │
│                                                                                                                      │
│  c:new session  D:destroy  Enter:ssh info  q:back                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Snapshots tab (120×40):

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  1:Overview    2:SSH    3:Sessions    4:Snapshots                                                                   │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Name                         Snapshot ID     Created                                                                │
│  ──────────────────────────── ────────────── ──────────                                                              │
│  ▸ pre-refactor                a1b2c3d4e5f6   3d ago                                                                 │
│    stable-baseline             b2c3d4e5f6a1   1w ago                                                                 │
│                                                                                                                      │
│  c:new snapshot  D:delete  q:back                                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

At minimum (80×24): Title wraps, metadata collapses to status+owner, tab labels abbreviated (1:Ovrvw, 2:SSH, 3:Sess, 4:Snap), session rows hide Idle Timeout and Dimensions columns.

### Components Used

- `<box>` — Flexbox containers for layout, rows, tab bar, header sections, confirmation modals
- `<scrollbox>` — Scrollable tab content with scroll-to-end pagination at 80%
- `<text>` — Names, badges, metadata, IDs, timestamps, usernames, key-value pairs
- `<code>` — SSH command display
- `<input>` — Session creation form (cols, rows), snapshot name input
- `<markdown>` — Not primary on this screen, but used if workspace description is added in future

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `j`/`Down` | Any tab | Scroll down / move focus down in list |
| `k`/`Up` | Any tab | Scroll up / move focus up in list |
| `G` | Any tab | Jump to bottom |
| `g g` | Any tab | Jump to top |
| `Ctrl+D`/`Ctrl+U` | Any tab | Page down/up |
| `Tab`/`Shift+Tab` | Any | Cycle tabs (wrapping) |
| `1`–`4` | Any | Jump to tab |
| `h`/`l` | Tab bar | Adjacent tab (no wrap) |
| `s` | Any (running) | Suspend workspace |
| `r` | Any (suspended) | Resume workspace |
| `D` | Any / Sessions / Snapshots | Delete workspace / destroy session / delete snapshot (with confirmation) |
| `c` | Sessions tab | Create new session |
| `c` | Snapshots tab | Create new snapshot |
| `v` | SSH tab | Toggle access token visibility |
| `y` | SSH tab | Copy SSH command to clipboard |
| `Enter` | Sessions tab | Show session SSH connection info |
| `R` | Error state | Retry failed fetch |
| `q` | Any | Pop screen |
| `Esc` | Form/modal/overlay | Close |
| `Ctrl+S` | Form | Submit |
| `y` | Confirmation modal | Confirm action |
| `n` | Confirmation modal | Cancel action |
| `?` | Any | Help overlay |
| `:` | Any | Command palette |

### Status bar hints (per-tab, per-state)

- Overview (running): `j/k:scroll  s:suspend  D:delete  Tab:tabs  q:back`
- Overview (suspended): `j/k:scroll  r:resume  D:delete  Tab:tabs  q:back`
- Overview (starting/stopping/resuming/suspending/pending): `j/k:scroll  Tab:tabs  q:back`
- Overview (error/failed/stopped): `j/k:scroll  D:delete  Tab:tabs  q:back`
- SSH (running): `v:token  y:copy  Tab:tabs  q:back`
- SSH (not running): `Tab:tabs  q:back`
- Sessions: `j/k:navigate  c:new  D:destroy  Enter:info  Tab:tabs  q:back`
- Snapshots: `j/k:navigate  c:new  D:delete  Tab:tabs  q:back`

### Responsive behavior

| Width × Height | Metadata | Tab Labels | Session Columns | Snapshot Columns |
|----------------|----------|------------|-----------------|------------------|
| 80×24 – 119×39 | Status + owner only | Abbreviated | ID, Status, Last Activity | Name, Created |
| 120×40 – 199×59 | Full row | Full | All 5 columns | Name, ID, Created |
| 200×60+ | Full + padding | Full + spacing | All + untruncated IDs | All + untruncated IDs |

### Data hooks consumed

- `useWorkspace(workspaceID, repositoryID, userID)` → `GET /api/repos/:owner/:repo/workspaces/:id`
- `useWorkspaceSSHInfo(workspaceID, repositoryID, userID)` → `GET /api/repos/:owner/:repo/workspaces/:id/ssh`
- `useWorkspaceSessions(repositoryID, userID)` → `GET /api/repos/:owner/:repo/workspace/sessions`
- `useWorkspaceSnapshots(repositoryID)` → `GET /api/repos/:owner/:repo/workspace-snapshots`
- `useSuspendWorkspace()` → `POST /api/repos/:owner/:repo/workspaces/:id/suspend`
- `useResumeWorkspace()` → `POST /api/repos/:owner/:repo/workspaces/:id/resume`
- `useDeleteWorkspace()` → `DELETE /api/repos/:owner/:repo/workspaces/:id`
- `useCreateSession()` → `POST /api/repos/:owner/:repo/workspace/sessions` (body: `workspace_id`, `cols`, `rows`)
- `useDestroySession()` → `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy`
- `useGetSessionSSHInfo()` → `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh`
- `useCreateWorkspaceSnapshot()` → `POST /api/repos/:owner/:repo/workspaces/:id/snapshot` (body: `name`)
- `useDeleteWorkspaceSnapshot()` → `DELETE /api/repos/:owner/:repo/workspace-snapshots/:id`
- `useSSE("workspace_status_{id}")` → `GET /api/repos/:owner/:repo/workspaces/:id/stream` (PG LISTEN/NOTIFY)
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI

### Optimistic UI

- Suspend: status badge changes to `[suspended]` immediately; uptime counter stops; reverts on error
- Resume: status badge changes to `[starting]` immediately; reverts on error (SSE will push actual `running` status)
- Delete session: session row removed immediately; reverts on error
- Delete snapshot: snapshot row removed immediately; reverts on error
- Delete workspace: does NOT apply optimistically — waits for server confirmation, then navigates back

### Pagination

- Sessions: page-based (size 20), scroll-to-end at 80%, 100-item memory cap
- Snapshots: page-based (size 20), scroll-to-end at 80%, 100-item memory cap
- Overview and SSH: single fetch, no pagination
- API supports both legacy (page/per_page) and cursor-based (limit/cursor) pagination; max limit: 100

## Permissions & Security

### Authorization

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View workspace detail (public repo) | ❌ | ✅ | ✅ | ✅ |
| View workspace detail (private repo) | ❌ | ✅ | ✅ | ✅ |
| View SSH connection info | ❌ | ❌ | ✅ (owner only) | ✅ |
| Suspend workspace | ❌ | ❌ | ✅ (owner only) | ✅ |
| Resume workspace | ❌ | ❌ | ✅ (owner only) | ✅ |
| Delete workspace | ❌ | ❌ | ✅ (owner only) | ✅ |
| Create session | ❌ | ❌ | ✅ (owner only) | ✅ |
| Destroy session | ❌ | ❌ | ✅ (owner only) | ✅ |
| Create snapshot | ❌ | ❌ | ✅ (owner only) | ✅ |
| Delete snapshot | ❌ | ❌ | ✅ (owner only) | ✅ |

- The workspace detail screen requires an active repository context
- Workspace operations are restricted to the workspace owner and repository admins
- All database queries filter by `repository_id` and `user_id` for permission enforcement
- `GET /api/repos/:owner/:repo/workspaces/:id` respects repository visibility: public repos accessible to all authenticated users with read access; private repos require explicit read access
- Write action keybinding hints (`s`, `r`, `D`, `c`) are hidden from the status bar for users who do not own the workspace and are not admins
- If a write action is attempted without permission, the server returns 403 and the TUI shows "Permission denied" in `error` color as a status bar flash that auto-dismisses after 3 seconds
- Anonymous users (no token) cannot view workspace details; the screen shows "Authentication required"

### Token-based auth

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- The TUI does not retry 401s; the user must re-authenticate via CLI
- SSH access tokens from the API are distinct from the user's auth token and have a 5-minute TTL (SANDBOX_ACCESS_TOKEN_TTL_MS: 300000)
- SSH access tokens are SHA256-hashed server-side before storage

### Rate limiting

- 1 GET request on mount (workspace detail); tab-specific data loads lazily (1 additional request per tab activation)
- SSE stream counts as a single long-lived connection, not per-event requests
- Write actions debounced: action key disabled while mutation is in-flight
- 300 req/min for GET endpoints; 60 req/min for mutation endpoints
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry on rate limit; user presses `R` after waiting

### Input sanitization

- Snapshot names validated client-side: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, 1-63 characters
- Session dimensions validated client-side: cols 1-500, rows 1-200
- Workspace names, SSH hosts, and IDs rendered as plain `<text>` — no injection vector in terminal
- Access tokens rendered as masked text by default; revealed text is plain, no markdown interpretation
- Form inputs have no character restrictions beyond API limits (snapshot name max: 255 characters)
- Server-side validation is authoritative; client-side is advisory

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workspace_detail.viewed` | Screen renders with data | `owner`, `repo`, `workspace_id`, `workspace_status`, `persistence`, `is_fork`, `session_count`, `snapshot_count`, `tab`, `terminal_width`, `terminal_height`, `entry_method` |
| `tui.workspace_detail.tab_changed` | Tab switch | `owner`, `repo`, `workspace_id`, `from_tab`, `to_tab`, `method` (key/number/click) |
| `tui.workspace_detail.suspended` | Suspend action | `owner`, `repo`, `workspace_id`, `uptime_seconds`, `success` |
| `tui.workspace_detail.resumed` | Resume action | `owner`, `repo`, `workspace_id`, `suspended_duration_seconds`, `success` |
| `tui.workspace_detail.deleted` | Delete confirmed | `owner`, `repo`, `workspace_id`, `workspace_status`, `lifetime_seconds`, `success` |
| `tui.workspace_detail.session_created` | Session creation | `owner`, `repo`, `workspace_id`, `session_id`, `cols`, `rows`, `success` |
| `tui.workspace_detail.session_destroyed` | Session destroy | `owner`, `repo`, `workspace_id`, `session_id`, `success` |
| `tui.workspace_detail.snapshot_created` | Snapshot creation | `owner`, `repo`, `workspace_id`, `snapshot_name`, `success` |
| `tui.workspace_detail.snapshot_deleted` | Snapshot deletion | `owner`, `repo`, `workspace_id`, `snapshot_id`, `success` |
| `tui.workspace_detail.ssh_copied` | SSH command copied | `owner`, `repo`, `workspace_id` |
| `tui.workspace_detail.ssh_token_revealed` | Token visibility toggled | `owner`, `repo`, `workspace_id` |
| `tui.workspace_detail.status_changed` | SSE status event | `owner`, `repo`, `workspace_id`, `from_status`, `to_status`, `sse_latency_ms` |
| `tui.workspace_detail.scrolled` | Scroll to bottom 20% | `tab`, `scroll_depth_percent`, `total_items_loaded` |
| `tui.workspace_detail.pagination` | Next page loaded | `tab`, `page_number`, `items_loaded_total`, `load_duration_ms` |
| `tui.workspace_detail.data_load_time` | Initial load complete | `workspace_ms`, `total_ms` |
| `tui.workspace_detail.retry` | Press R | `error_type`, `retry_count`, `tab` |
| `tui.workspace_detail.error` | API failure | `endpoint`, `error_type`, `http_status`, `tab` |
| `tui.workspace_detail.confirmation_modal` | Modal shown | `action`, `confirmed`, `time_to_decision_ms` |

### Common properties (all events)

- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode` ("truecolor"/"256"/"16"), `layout` ("compact"/"standard"/"expanded")

### Success indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Data load success rate | >98% |
| Mean time to interactive | <1.0s |
| Tab usage rate (2+ tabs per view) | >50% |
| SSH command copy rate | >30% of views with running workspace |
| Suspend/resume action rate | >25% of views |
| Session creation rate | >15% of views |
| Snapshot creation rate | >10% of views |
| SSE stream uptime | >95% of session duration |
| Error rate | <2% |
| Retry success rate | >80% |
| Tab switch time (p95) | <50ms |
| Status update latency (SSE, p95) | <2s |

## Observability

### Logging requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `WorkspaceDetail: mounted [workspace={id}] [repo={owner}/{repo}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Workspace loaded | `WorkspaceDetail: workspace loaded [id={id}] [status={s}] [persistence={p}] [duration={ms}ms]` |
| `debug` | SSH info loaded | `WorkspaceDetail: ssh info loaded [id={id}] [host={h}] [port={p}] [duration={ms}ms]` |
| `debug` | Sessions loaded | `WorkspaceDetail: sessions loaded [id={id}] [page={p}] [count={c}] [duration={ms}ms]` |
| `debug` | Snapshots loaded | `WorkspaceDetail: snapshots loaded [id={id}] [page={p}] [count={c}] [duration={ms}ms]` |
| `debug` | Tab switched | `WorkspaceDetail: tab switch [id={id}] [from={old}] [to={new}]` |
| `debug` | SSE connected | `WorkspaceDetail: sse connected [id={id}] [channel=workspace_status_{uuid}]` |
| `debug` | SSE event | `WorkspaceDetail: sse event [id={id}] [status={s}]` |
| `info` | Fully loaded | `WorkspaceDetail: ready [id={id}] [total_ms={ms}]` |
| `info` | Workspace suspended | `WorkspaceDetail: suspended [id={id}] [uptime={s}s]` |
| `info` | Workspace resumed | `WorkspaceDetail: resumed [id={id}]` |
| `info` | Workspace deleted | `WorkspaceDetail: deleted [id={id}]` |
| `info` | Session created | `WorkspaceDetail: session created [workspace={id}] [session={sid}] [cols={c}] [rows={r}]` |
| `info` | Session destroyed | `WorkspaceDetail: session destroyed [workspace={id}] [session={sid}]` |
| `info` | Snapshot created | `WorkspaceDetail: snapshot created [workspace={id}] [snapshot={sid}] [name={n}]` |
| `info` | Snapshot deleted | `WorkspaceDetail: snapshot deleted [workspace={id}] [snapshot={sid}]` |
| `info` | SSH copied | `WorkspaceDetail: ssh copied [id={id}]` |
| `warn` | Slow load | `WorkspaceDetail: slow load [endpoint={ep}] [duration={ms}ms]` (>3000ms) |
| `warn` | Items capped | `WorkspaceDetail: items capped [tab={t}] [total={n}] [cap=100]` |
| `warn` | Rate limited | `WorkspaceDetail: rate limited [endpoint={ep}] [retry_after={s}]` |
| `warn` | Action failed | `WorkspaceDetail: action failed [id={id}] [action={a}] [status={code}]` |
| `warn` | SSE disconnected | `WorkspaceDetail: sse disconnected [id={id}] [reason={r}]` |
| `warn` | SSE reconnecting | `WorkspaceDetail: sse reconnecting [id={id}] [attempt={n}] [backoff={ms}ms]` |
| `error` | Not found | `WorkspaceDetail: 404 [workspace={id}] [repo={owner}/{repo}]` |
| `error` | Auth error | `WorkspaceDetail: auth error [status=401]` |
| `error` | Permission denied | `WorkspaceDetail: permission denied [action={a}] [status=403]` |
| `error` | Fetch failed | `WorkspaceDetail: fetch failed [endpoint={ep}] [status={code}] [error={msg}]` |
| `error` | Render error | `WorkspaceDetail: render error [component={name}] [error={msg}]` |
| `error` | Optimistic revert | `WorkspaceDetail: optimistic revert [action={a}] [error={msg}]` |
| `error` | SSE error | `WorkspaceDetail: sse error [id={id}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-specific error cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during data load | Layout re-renders; data populates into new layout | Independent |
| Resize collapses metadata | Metadata reduces to status+owner; tabs abbreviate | Synchronous re-layout |
| SSE disconnect | Status bar shows disconnected; last known status retained | SSE provider auto-reconnects with exponential backoff; REST re-fetch on reconnect |
| SSE delivers stale event | Compare event timestamp with local state; discard if older | Automatic |
| Auth expiry | Next API call fails 401; inline error shown | Re-auth via CLI |
| Network timeout (30s) | Full-screen error with retry hint | User presses R |
| Tab data timeout | Inline error within tab | User presses R within tab |
| Workspace deleted while viewing | 404 on next interaction; "Workspace no longer exists" | User presses q |
| Rapid suspend/resume | Second action blocked while first is in-flight; status bar flash | Wait for completion |
| Resize during confirmation modal | Modal repositions to center of new dimensions | Synchronous re-layout |
| Clipboard copy failure | Status bar flash "Copy failed — terminal does not support clipboard" | Informational |
| SSH info unavailable for running workspace | Inline error in SSH tab; "SSH info unavailable — press R to retry" | User presses R |
| Session creation failure | Form shows inline error; "Failed to create session: {reason}" | User retries or cancels |
| Snapshot creation failure | Form shows inline error; "Failed to create snapshot: {reason}" | User retries or cancels |
| No color support | ASCII fallback `[RUNNING]`, `[SUSPENDED]` etc. without ANSI colors; spinner becomes `-\|/` rotation | Theme detection |
| 409 Conflict (duplicate name) | Inline error "A workspace/snapshot with this name already exists" | User changes name |
| 422 Validation error | Inline field-level error messages from server | User corrects input |
| Stale pending workspace | Server auto-fails after 5 min; SSE delivers `failed` status | User can delete |

### Failure modes

- Component crash → global error boundary → "Press r to restart"
- Tab crash → per-tab error boundary → "Tab rendering error — press R to retry"; other tabs functional
- SSE stream crash → status updates stop; status bar shows stale indicator; REST polling fallback (every 30s)
- Confirmation modal crash → modal dismissed; action not performed; error logged
- All API fail → full-screen error; go-to and palette still available
- Slow network → spinner; user navigates away via q/go-to/palette

## Verification

### Test File: `e2e/tui/workspaces.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-WDET-001: Workspace detail at 120×40 with Overview tab — full layout, header, metadata, tabs, config, uptime, actions
- SNAP-WDET-002: Workspace detail at 80×24 compact — abbreviated tabs, wrapped name, compact metadata
- SNAP-WDET-003: Workspace detail at 200×60 expanded — full timestamps, generous padding, untruncated IDs
- SNAP-WDET-004: Running status badge — [running] green (ANSI 34)
- SNAP-WDET-005: Suspended status badge — [suspended] yellow (ANSI 178) with suspended_at timestamp
- SNAP-WDET-006: Starting status badge — [starting] yellow (ANSI 178) with braille spinner
- SNAP-WDET-007: Stopping status badge — [stopping] yellow (ANSI 178) with braille spinner
- SNAP-WDET-008: Error status badge — [error] red (ANSI 196)
- SNAP-WDET-009: Deleted status badge — [deleted] muted (ANSI 245)
- SNAP-WDET-010: Persistence modes — ephemeral/sticky/persistent badges with correct colors
- SNAP-WDET-011: Fork workspace metadata — "Fork of: parent-name" line visible
- SNAP-WDET-012: Tab bar with Overview active (default)
- SNAP-WDET-013: Tab bar with SSH tab active
- SNAP-WDET-014: Abbreviated tab labels at 80×24
- SNAP-WDET-015: SSH tab running — command block, connection details, masked token
- SNAP-WDET-016: SSH tab running — token revealed with `v` toggle
- SNAP-WDET-017: SSH tab not running — muted message with resume hint
- SNAP-WDET-018: Sessions tab — session list with all columns
- SNAP-WDET-019: Sessions tab — empty state
- SNAP-WDET-020: Sessions tab — compact columns at 80×24
- SNAP-WDET-021: Snapshots tab — snapshot list with name, ID, timestamp
- SNAP-WDET-022: Snapshots tab — empty state
- SNAP-WDET-023: Loading state spinner
- SNAP-WDET-024: 404 error state
- SNAP-WDET-025: Network error state
- SNAP-WDET-026: Delete confirmation modal overlay
- SNAP-WDET-027: Breadcrumb display
- SNAP-WDET-028: Status bar hints for running workspace Overview tab

### Keyboard Interaction Tests (42 tests)

- KEY-WDET-001–004: j/k scroll, G bottom, g g top, Ctrl+D/U page
- KEY-WDET-005–008: Tab/Shift+Tab cycling with wrap across 4 tabs
- KEY-WDET-009: Number keys 1-4 jump to tabs
- KEY-WDET-010–012: h/l adjacent tab navigation, boundary no-ops
- KEY-WDET-013: s suspends running workspace (optimistic badge update)
- KEY-WDET-014: s on suspended workspace shows error flash
- KEY-WDET-015: r resumes suspended workspace (optimistic badge update)
- KEY-WDET-016: r on running workspace shows error flash
- KEY-WDET-017–019: D delete with confirmation (y confirms, n cancels, Esc cancels)
- KEY-WDET-020: D delete navigates back to workspace list on success
- KEY-WDET-021–022: c create session (opens form, submits with Ctrl+S)
- KEY-WDET-023–024: c create snapshot (opens form, submits with Ctrl+S)
- KEY-WDET-025–026: D destroy session with confirmation
- KEY-WDET-027–028: D delete snapshot with confirmation
- KEY-WDET-029: Enter on session shows SSH connection info
- KEY-WDET-030–031: v toggle token visibility (reveal, hide)
- KEY-WDET-032: y copies SSH command (status bar confirmation)
- KEY-WDET-033: j/k navigation in sessions list
- KEY-WDET-034: j/k navigation in snapshots list
- KEY-WDET-035: Tab preserves per-tab scroll position
- KEY-WDET-036: Suspend optimistic rollback on server 500
- KEY-WDET-037: Resume optimistic rollback on server 500
- KEY-WDET-038: Rapid s/r blocked while mutation in-flight
- KEY-WDET-039: R retry on error state
- KEY-WDET-040: q pops screen
- KEY-WDET-041: ? opens help overlay
- KEY-WDET-042: : opens command palette

### Responsive Resize Tests (12 tests)

- RESIZE-WDET-001–003: Breakpoint transitions (120→80, 80→120, 120→200)
- RESIZE-WDET-004: Scroll position preserved across resize
- RESIZE-WDET-005: Name rewrap on resize
- RESIZE-WDET-006: Rapid resize without artifacts
- RESIZE-WDET-007: SSH command block rewraps on resize
- RESIZE-WDET-008: Session columns collapse/expand on breakpoint change
- RESIZE-WDET-009: Tab labels abbreviate/expand on breakpoint change
- RESIZE-WDET-010: Below minimum shows too-small message
- RESIZE-WDET-011: Restore from below-minimum shows full layout
- RESIZE-WDET-012: Confirmation modal repositions on resize

### Data Loading & SSE Tests (22 tests)

- DATA-WDET-001: Workspace detail loads on mount
- DATA-WDET-002: SSH info loads lazily on SSH tab activation (running workspace)
- DATA-WDET-003: SSH info not requested for non-running workspace
- DATA-WDET-004: Sessions load lazily on Sessions tab activation
- DATA-WDET-005: Snapshots load lazily on Snapshots tab activation
- DATA-WDET-006: Session pagination on scroll past 80%
- DATA-WDET-007: Snapshot pagination on scroll past 80%
- DATA-WDET-008: Pagination stops at 100-item cap
- DATA-WDET-009: Cached data on re-navigation within 30 seconds
- DATA-WDET-010–011: 404 and 401 handling
- DATA-WDET-012–015: Independent tab fetch failures (SSH, sessions, snapshots, workspace)
- DATA-WDET-016: SSE stream connects on mount
- DATA-WDET-017: SSE status event updates badge in real-time
- DATA-WDET-018: SSE disconnect shows status bar indicator
- DATA-WDET-019: SSE reconnect with exponential backoff
- DATA-WDET-020: SSE reconnect triggers REST re-fetch
- DATA-WDET-021: Rate limit (429) handling
- DATA-WDET-022: Tab-specific retry only retries affected endpoint

### Edge Case Tests (18 tests)

- EDGE-WDET-001: No auth token
- EDGE-WDET-002–003: Long workspace name (200+ chars wraps), unicode/emoji in name
- EDGE-WDET-004: Workspace deleted by another user mid-view
- EDGE-WDET-005: Unknown status value from SSE
- EDGE-WDET-006: Rapid suspend/resume debouncing
- EDGE-WDET-007: Fork workspace display (is_fork=true, parent_workspace_id set)
- EDGE-WDET-008: Zero idle timeout displays "idle: never"
- EDGE-WDET-009: Very long SSH hostname wraps in code block
- EDGE-WDET-010: Access token toggle preserves scroll position
- EDGE-WDET-011: Confirmation modal focus trap (Tab stays in modal)
- EDGE-WDET-012: Clipboard copy failure handling
- EDGE-WDET-013: Session creation with invalid dimensions (handled by API)
- EDGE-WDET-014: Snapshot name at 255-char max
- EDGE-WDET-015: Rapid j/k in sessions list (20×)
- EDGE-WDET-016: Read-only user sees no write action hints
- EDGE-WDET-017: Workspace ID boundaries (UUID format)
- EDGE-WDET-018: SSE delivers status matching current status (no-op)

All 122 tests left failing if backend is unimplemented — never skipped or commented out.

# TUI_WORKSPACE_SSH_INFO

Specification for TUI_WORKSPACE_SSH_INFO.

## High-Level User POV

When a terminal user is viewing a workspace that is in the "running" state, they need immediate access to the SSH connection details so they can connect to the workspace from their terminal. The SSH info panel is rendered as a dedicated section within the workspace detail view, appearing automatically once the workspace transitions to the "running" status and SSH connection info becomes available.

The SSH info section sits below the workspace metadata (name, status, persistence, idle timeout) and above the actions section. It is visually separated by a labeled border: `─── SSH Connection ───`. Inside the section, the user sees four key-value rows: **Host** (the `ssh_host` value), **Port** (always a number), **Username** (the Linux user), and **Command** (the full ready-to-copy SSH command). The SSH command is the most prominent element — rendered in bold with a copy hint `(c to copy)` displayed in muted text beside it.

The user presses `c` to copy the full SSH command to the system clipboard. On success, a transient "Copied!" confirmation appears in the status bar for 2 seconds. If the clipboard is unavailable (headless server, no clipboard tool), the status bar shows "Copy not available" instead. The user can also press `y` to copy just the `ssh_host` value (useful for `~/.ssh/config` entries or scripts), which triggers the same copied/unavailable feedback.

Because SSH access tokens are short-lived (5-minute TTL), the panel includes a token expiration indicator. When the token has fewer than 60 seconds remaining, the indicator turns yellow: `Token expires in 45s`. When expired (0s remaining), the indicator turns red: `Token expired`. The user can press `r` to refresh the SSH connection info, which generates a new access token and updates the command. While refreshing, a braille spinner with "Refreshing…" replaces the SSH command temporarily.

If the workspace is not running (status is "pending", "starting", "suspended", or "stopped"), the SSH info section renders a status-appropriate message instead of connection details. For "starting" or "pending," it shows a braille spinner with "Waiting for workspace to start…" and streams status updates via SSE. For "suspended," it shows "Workspace suspended. Press `R` to resume." For "stopped," it shows "Workspace stopped."

The SSH info section is non-interactive when the workspace is not running — the `c`, `y`, and `r` keybindings are disabled and removed from the status bar hints. The section auto-updates when the workspace transitions to "running" via the SSE workspace status stream, meaning the user can watch the workspace start and see SSH info appear without manually refreshing.

At minimum terminal size (80×24), the SSH command is the only value displayed in the connection section, with host/port/username omitted to save vertical space. The command is truncated with `…` if it exceeds the terminal width minus padding, but copying still captures the full untruncated value. At standard size (120×40), all four fields are visible. At large size (200×60+), the section includes additional context: the workspace ID, VM ID, and token TTL countdown.

## Acceptance Criteria

### Definition of Done

- The SSH info section renders within the workspace detail view when `useWorkspaceSSH(owner, repo, workspaceId)` returns data
- SSH connection info is fetched via `GET /api/repos/:owner/:repo/workspaces/:id/ssh` through the `useWorkspaceSSH` hook
- The section displays `ssh_host`, `port`, `username`, and `command` fields from the `WorkspaceSSHConnectionInfo` response
- The SSH command is rendered in bold and is the primary copyable element
- `c` copies the full `command` string to the system clipboard and shows "Copied!" in the status bar for 2 seconds
- `y` copies the `ssh_host` string to the system clipboard and shows "Copied host!" in the status bar for 2 seconds
- `r` refreshes SSH connection info by re-calling the SSH endpoint, generating a new access token
- While refreshing, a braille spinner with "Refreshing…" replaces the SSH command line
- Double-refresh prevention: pressing `r` while a refresh is in flight is ignored

### Token Lifecycle

- Token TTL countdown is rendered showing remaining time (e.g., `Token valid for 4m 32s`)
- Countdown updates every second using a local timer synchronized to the token generation timestamp
- When remaining time falls below 60 seconds, the countdown text color changes from `muted` to `warning` (yellow)
- When remaining time reaches 0, the countdown text changes to `Token expired` in `error` color (red)
- Auto-refresh: when the token expires, the section automatically calls the SSH endpoint to obtain a new token (same behavior as pressing `r`)
- Auto-refresh is silent — no spinner unless the refresh takes more than 500ms
- If auto-refresh fails (e.g., workspace suspended between timer ticks), the error is displayed inline

### Workspace Status Gating

- SSH info section only shows connection details when workspace status is `"running"`
- Status `"pending"` or `"starting"`: section shows braille spinner with "Waiting for workspace to start…"
- Status `"suspended"`: section shows "Workspace suspended. Press `R` to resume." (`R` triggers the suspend/resume action from `TUI_WORKSPACE_SUSPEND_RESUME`)
- Status `"stopped"`: section shows "Workspace stopped." with no action hint
- When workspace transitions to `"running"` via SSE stream, the section automatically fetches SSH info and renders it without user intervention
- When workspace transitions away from `"running"` (e.g., idle timeout triggers suspension), the SSH info is cleared and replaced with the appropriate status message

### Display Constraints

- `ssh_host` maximum display length: 80 characters, truncated with `…` if exceeded (full value still copied)
- `command` maximum display length: `terminal_width - 6` characters, truncated with `…` if exceeded (full value still copied)
- `username` maximum display length: 32 characters (Linux username limit)
- `port` rendered as integer, max 5 digits (65535)
- Token countdown format: `Xm Ys` for times ≥ 60s, `Xs` for times < 60s, `Token expired` for 0
- All field values are monospace text (no rich formatting beyond bold for the command)

### Edge Cases

- **Terminal resize during SSH info display:** Layout recalculates synchronously. At resize below standard threshold, host/port/username rows collapse. SSH command truncation adjusts. Copy still captures full value.
- **Terminal below minimum (< 80×24):** "Terminal too small" shown; SSH info section is not rendered. State preserved for when terminal is enlarged.
- **Rapid `c` presses:** Each press triggers a new clipboard write. No debouncing — last write wins.
- **Rapid `r` presses:** Only one refresh request in flight at a time. Additional presses ignored until current completes.
- **SSE disconnect during workspace start:** Status bar shows disconnection. Section falls back to polling (re-fetch on `R` press). When SSE reconnects, real-time updates resume.
- **Workspace deleted while SSH info is displayed:** Next fetch returns 404. Error: "Workspace not found. Press `q` to go back."
- **Access token refresh fails with 401:** Auth error: "Session expired. Run `codeplane auth login` to re-authenticate."
- **Access token refresh fails with 409/423 (workspace locked):** Inline error: "Workspace is being modified. Try again shortly."
- **SSH endpoint returns null (no VM ID):** Section shows "SSH connection unavailable. Workspace may still be provisioning."
- **Copy to clipboard on systems without clipboard access:** Status bar shows "Copy not available" instead of "Copied!"
- **No-color terminals (`NO_COLOR=1`):** Token countdown uses bold/reverse instead of color. Copy hints use brackets instead of color.

## Design

### Screen Layout (within Workspace Detail View)

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workspaces > my-workspace │ ● conn │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name         my-workspace                                  │
│  Status       ● running                                     │
│  Persistence  persistent                                    │
│  Idle timeout 30m                                           │
│                                                             │
│  ─── SSH Connection ──────────────────────────────────────  │
│  Host      abc123+root@localhost                            │
│  Port      22                                               │
│  Username  root                                             │
│  Command   ssh abc123+root:<token>@localhost    (c to copy) │
│  Token     Token valid for 4m 32s                           │
│                                                             │
│  ─── Actions ─────────────────────────────────────────────  │
│  [Suspend]  [Delete]                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ c:copy cmd │ y:copy host │ r:refresh │ R:resume   │ ?:help  │
└─────────────────────────────────────────────────────────────┘
```

### Layout — Workspace Not Running (Starting)

```
│  ─── SSH Connection ──────────────────────────────────────  │
│  ⣾ Waiting for workspace to start…                         │
```

### Layout — Workspace Suspended

```
│  ─── SSH Connection ──────────────────────────────────────  │
│  Workspace suspended. Press R to resume.                    │
```

### Layout — Token Expired

```
│  ─── SSH Connection ──────────────────────────────────────  │
│  Host      abc123+root@localhost                            │
│  Port      22                                               │
│  Username  root                                             │
│  Command   ssh abc123+root:<token>@localhost    (c to copy) │
│  Token     Token expired                        (r:refresh) │
```

### Layout — Refreshing

```
│  ─── SSH Connection ──────────────────────────────────────  │
│  ⣾ Refreshing…                                              │
```

### Component Tree (OpenTUI)

```jsx
<box flexDirection="column" gap={0}>
  {/* Section header */}
  <box height={1}>
    <text color="border">─── </text>
    <text bold>SSH Connection</text>
    <text color="border"> ────────────────</text>
  </box>

  {workspace.status !== "running" ? (
    <SSHInfoPlaceholder status={workspace.status} />
  ) : refreshing ? (
    <box height={1} paddingX={2}>
      <text color="muted">⣾ Refreshing…</text>
    </box>
  ) : sshError ? (
    <box paddingX={2}>
      <text color="error">{sshError}</text>
    </box>
  ) : sshInfo ? (
    <box flexDirection="column" paddingX={2}>
      {isStandardOrLarger && (
        <>
          <box flexDirection="row" height={1}>
            <box width={labelWidth}><text color="muted">Host</text></box>
            <text>{truncate(sshInfo.ssh_host, hostMaxWidth)}</text>
          </box>
          <box flexDirection="row" height={1}>
            <box width={labelWidth}><text color="muted">Port</text></box>
            <text>{sshInfo.port}</text>
          </box>
          <box flexDirection="row" height={1}>
            <box width={labelWidth}><text color="muted">Username</text></box>
            <text>{sshInfo.username}</text>
          </box>
        </>
      )}
      <box flexDirection="row" height={1}>
        <box width={labelWidth}><text color="muted">Command</text></box>
        <text bold>{truncate(sshInfo.command, cmdMaxWidth)}</text>
        <text color="muted"> (c to copy)</text>
      </box>
      <box flexDirection="row" height={1}>
        <box width={labelWidth}><text color="muted">Token</text></box>
        <text color={tokenColor}>{tokenLabel}</text>
        {tokenExpired && <text color="muted"> (r:refresh)</text>}
      </box>
      {isLarge && (
        <>
          <box flexDirection="row" height={1}>
            <box width={labelWidth}><text color="muted">Workspace ID</text></box>
            <text color="muted">{sshInfo.workspace_id}</text>
          </box>
          <box flexDirection="row" height={1}>
            <box width={labelWidth}><text color="muted">VM ID</text></box>
            <text color="muted">{sshInfo.vm_id}</text>
          </box>
        </>
      )}
    </box>
  ) : (
    <box paddingX={2}>
      <text color="muted">SSH connection unavailable.</text>
    </box>
  )}
</box>
```

### SSHInfoPlaceholder Component

```jsx
function SSHInfoPlaceholder({ status }: { status: string }) {
  if (status === "pending" || status === "starting") {
    return (
      <box height={1} paddingX={2}>
        <text color="muted">⣾ Waiting for workspace to start…</text>
      </box>
    );
  }
  if (status === "suspended") {
    return (
      <box height={1} paddingX={2}>
        <text color="warning">Workspace suspended. Press R to resume.</text>
      </box>
    );
  }
  return (
    <box height={1} paddingX={2}>
      <text color="muted">Workspace stopped.</text>
    </box>
  );
}
```

### Keybindings

| Key | Action | Condition |
|-----|--------|-----------|
| `c` | Copy full SSH command to clipboard | SSH info loaded, workspace running |
| `y` | Copy `ssh_host` value to clipboard | SSH info loaded, workspace running |
| `r` | Refresh SSH connection info (new token) | SSH info loaded, workspace running, no refresh in flight |
| `R` | Resume suspended workspace | Workspace status is `"suspended"` |
| `j` / `Down` | Scroll workspace detail content down | Scrollbox focused |
| `k` / `Up` | Scroll workspace detail content up | Scrollbox focused |
| `Ctrl+D` | Page down | Scrollbox focused |
| `Ctrl+U` | Page up | Scrollbox focused |
| `G` | Scroll to bottom | Scrollbox focused |
| `g g` | Scroll to top | Scrollbox focused |
| `q` | Pop screen (go back) | Always |
| `Esc` | Pop screen (go back) | No overlay open |
| `?` | Show help overlay | Always |
| `:` | Open command palette | Always |

### Responsive Behavior

| Size | SSH Fields Shown | Label Width | Command Truncation | Extra Info |
|------|-----------------|-------------|-------------------|------------|
| 80×24 | Command, Token only | 10 chars | `terminal_width - 16` | None |
| 120×40 | Host, Port, Username, Command, Token | 14 chars | `terminal_width - 20` | None |
| 200×60 | Host, Port, Username, Command, Token, Workspace ID, VM ID | 16 chars | `terminal_width - 22` | Workspace ID, VM ID |

Terminal resize triggers synchronous re-layout via `useOnResize()`. If resizing hides the host/port/username rows (standard → minimum), the section collapses smoothly. If resizing reveals them (minimum → standard), they appear immediately. SSH info data and token countdown state are preserved across resize.

### Data Hooks

| Hook | Purpose |
|------|--------|
| `useWorkspaceSSH(owner, repo, workspaceId)` | Fetches SSH connection info from `GET /api/repos/:owner/:repo/workspaces/:id/ssh`. Returns `{ data: WorkspaceSSHConnectionInfo \| null, isLoading: boolean, error: Error \| null, refetch: () => Promise<void> }`. |
| `useWorkspace(owner, repo, workspaceId)` | Fetches workspace detail (for status gating). Consumed by the parent workspace detail view. |
| `useSSE("workspace_status")` | Subscribes to workspace status stream for real-time status transitions. |
| `useClipboard()` | Platform-aware clipboard write. Returns `{ copy: (text: string) => Promise<boolean>, supported: boolean }`. |
| `useKeyboard()` | Keybinding registration for `c`, `y`, `r`, `R`. |
| `useTerminalDimensions()` | Returns `{ columns, rows }` for responsive layout decisions. |
| `useOnResize()` | Triggers re-render on terminal resize events. |

### Navigation Context

The SSH info section is part of the workspace detail view and does not create its own screen stack entry. It receives workspace context from the parent workspace detail screen: `{ repo: "owner/name", workspaceId: "uuid" }`. The `owner` and `repo` are parsed from the repo context string.

## Permissions & Security

### Authorization

| Action | Read-Only | Member | Admin | Owner |
|--------|-----------|--------|-------|-------|
| View SSH connection info | ❌ | ✅ | ✅ | ✅ |
| Copy SSH command | ❌ | ✅ | ✅ | ✅ |
| Refresh SSH token | ❌ | ✅ | ✅ | ✅ |
| Resume suspended workspace | ❌ | ✅ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- The SSH endpoint `GET /api/repos/:owner/:repo/workspaces/:id/ssh` checks that the requesting user owns the workspace or has appropriate repository access
- Read-only users cannot access workspace SSH info (the workspace detail view shows the workspace metadata but the SSH section renders "Permission denied")
- The access token in the SSH command is a short-lived credential (5-minute TTL) — it is displayed in the terminal but never logged or sent to telemetry
- The `command` field contains the raw access token; the TUI does **not** mask or redact it because the user needs the full command to connect

### Token Handling

- Auth token loaded from CLI keychain or `CODEPLANE_TOKEN` at bootstrap
- Auth token passed as `Authorization: token <token>` on all API requests including the SSH info endpoint
- The SSH access token (in the `command` and `access_token` fields) is a **separate credential** from the auth token — it is a one-time-use sandbox access token for the SSH server
- The SSH access token is never logged, never sent to telemetry, never included in error messages
- Token values in the `command` string are rendered directly in the terminal — screen sharing or terminal recording may capture them; this is expected and accepted
- 401 responses on the SSH endpoint propagate to the app-shell auth error screen

### Rate Limiting

- SSH info fetch: subject to platform-wide rate limit (5,000 requests per hour per user)
- Token refresh via `r`: no additional client-side throttle beyond the in-flight guard (one request at a time). Server-side rate limiting applies.
- Auto-refresh on token expiry: limited to one auto-refresh per expiry cycle (5 minutes). If auto-refresh fails, no further auto-refresh until user presses `r`.
- 429 Too Many Requests: inline error "Rate limited. Retry in {Retry-After}s." shown in the SSH section. `r` keybinding remains active for manual retry after wait.

### Sensitive Data Handling

- The SSH `command` string contains the access token in plaintext — this is by design for SSH connection usability
- The TUI does not persist SSH connection info to disk
- Screen clear on quit: the TUI restores the terminal's alternate screen buffer on exit, which typically clears displayed SSH info from the terminal scrollback

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workspace.ssh_info.viewed` | SSH info section renders with connection data | `repo_owner`, `repo_name`, `workspace_id`, `workspace_name`, `terminal_columns`, `terminal_rows`, `breakpoint` (minimum/standard/large), `load_time_ms` |
| `tui.workspace.ssh_info.command_copied` | User presses `c` to copy SSH command | `repo_owner`, `repo_name`, `workspace_id`, `copy_success`, `token_remaining_seconds` |
| `tui.workspace.ssh_info.host_copied` | User presses `y` to copy ssh_host | `repo_owner`, `repo_name`, `workspace_id`, `copy_success` |
| `tui.workspace.ssh_info.refreshed` | User presses `r` to refresh token | `repo_owner`, `repo_name`, `workspace_id`, `refresh_success`, `duration_ms`, `previous_token_remaining_seconds` |
| `tui.workspace.ssh_info.auto_refreshed` | Token auto-refreshed on expiry | `repo_owner`, `repo_name`, `workspace_id`, `refresh_success`, `duration_ms` |
| `tui.workspace.ssh_info.token_expired` | Token countdown reaches 0 | `repo_owner`, `repo_name`, `workspace_id`, `was_auto_refreshed` |
| `tui.workspace.ssh_info.error` | SSH info fetch or refresh fails | `repo_owner`, `repo_name`, `workspace_id`, `error_code`, `error_type` (network/auth/not_found/rate_limit/server), `action` (initial_load/refresh/auto_refresh) |
| `tui.workspace.ssh_info.status_transition` | Workspace status changes while SSH section is visible | `repo_owner`, `repo_name`, `workspace_id`, `from_status`, `to_status`, `via` (sse/poll) |
| `tui.workspace.ssh_info.clipboard_unavailable` | Copy attempted but clipboard not supported | `repo_owner`, `repo_name`, `workspace_id`, `copy_target` (command/host) |

Note: `workspace_id` and `workspace_name` are sent; `access_token` and `command` are **never** sent.

### Success Indicators

- **SSH command copy rate:** % of `ssh_info.viewed` events that result in at least one `command_copied` event. Target: >60%. High rate indicates the feature is serving its primary purpose.
- **Token refresh rate:** % of sessions with at least one manual refresh. Target: <20%. Low rate indicates tokens last long enough for typical use.
- **Auto-refresh success rate:** % of `auto_refreshed` events with `refresh_success=true`. Target: >95%.
- **Clipboard success rate:** % of copy events with `copy_success=true`. Target: >90%. Lower rates indicate clipboard integration issues.
- **Error rate:** % of `ssh_info.viewed` preceded by at least one `ssh_info.error`. Target: <5%.
- **Time from workspace running to first copy:** Median time between `status_transition(to_status=running)` and first `command_copied`. Target: <10s. Indicates quick SSH info discovery and use.
- **Copy target distribution:** Ratio of `command_copied` vs `host_copied`. Tracks which copy target is more useful to users.

## Observability

### Logging

| Level | Event | Details |
|-------|-------|--------|
| `info` | SSH info loaded | `workspace_id`, `load_time_ms`, `has_connection_info` (boolean) |
| `info` | SSH command copied | `workspace_id`, `copy_success` |
| `info` | SSH host copied | `workspace_id`, `copy_success` |
| `info` | SSH token refreshed | `workspace_id`, `duration_ms`, `success` |
| `info` | SSH token auto-refreshed | `workspace_id`, `duration_ms`, `success` |
| `warn` | SSH info fetch failed | `workspace_id`, `http_status`, `error_message` (no token values) |
| `warn` | SSH token refresh failed | `workspace_id`, `http_status`, `error_message` (no token values) |
| `warn` | Clipboard write failed | `workspace_id`, `reason` (not_supported/permission_denied) |
| `warn` | SSE disconnect during workspace status stream | `workspace_id`, `reconnect_attempt`, `backoff_ms` |
| `debug` | Token countdown tick | `workspace_id`, `remaining_seconds` (logged every 60s, not every second) |
| `debug` | Workspace status transition via SSE | `workspace_id`, `from_status`, `to_status` |
| `debug` | Resize triggered in SSH info section | `old_dimensions`, `new_dimensions`, `breakpoint_change` |
| `error` | SSH info render error (React boundary) | `workspace_id`, `error_message`, `stack_trace` |
| `error` | Auth failure on SSH endpoint | `workspace_id`, `http_status` (401) |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`). Token values (`access_token`, `command`) are **never** logged.

### Error Cases and Recovery

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on SSH info fetch | Fetch timeout (30s) | Inline error: "Failed to load SSH info. Press `r` to retry." |
| SSH info returns null (no VM ID) | API returns `null` body | "SSH connection unavailable. Workspace may still be provisioning." |
| Workspace not found (404) | API returns 404 | "Workspace not found. Press `q` to go back." |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | "Rate limited. Retry in Ns." `r` remains active after wait. |
| Server error (500/502/503/504) | API returns 5xx | "Server error. Press `r` to retry." |
| Workspace locked (409/423) | API returns 409 or 423 | "Workspace is being modified. Try again shortly." |
| SSE disconnect during workspace start | SSE context reports disconnection | Status bar shows disconnected. SSH section continues showing last known state. Manual `r` refresh available. SSE auto-reconnects with backoff. |
| SSE reconnect after missed status transition | SSE reconnects with cursor/timestamp | SSE provider re-fetches missed events. If workspace transitioned to "running" while disconnected, SSH info is fetched on reconnect. |
| Terminal resize below minimum during SSH display | `columns < 80 \|\| rows < 24` | "Terminal too small" shown. SSH info state preserved; re-enlarging restores display. |
| Terminal resize during SSH token refresh | `useOnResize` fires while `refreshing=true` | Layout recalculates. Refresh continues. "Refreshing…" spinner preserved. |
| Token auto-refresh fails | Auto-refresh returns error | Token shows "Token expired (refresh failed)" in red. `r` remains active for manual retry. No further auto-refresh until user manually refreshes. |
| Workspace suspended while viewing SSH info | SSE delivers status transition | SSH info section clears and shows "Workspace suspended. Press `R` to resume." |
| Clipboard write throws | `useClipboard().copy()` rejects | Status bar shows "Copy failed" for 2 seconds. Error logged as `warn`. |
| Concurrent workspace deletion | Next refresh returns 404 | "Workspace not found. Press `q` to go back." |

### Health Signals

- SSH info initial load: <500ms from workspace detail render to SSH section populated
- Token refresh round-trip: <2000ms at p95
- SSE reconnection time after disconnect: median <5s
- Token countdown timer accuracy: within 1 second of server-side expiry
- Section re-render on resize: <50ms

## Verification

### Test File: `e2e/tui/workspaces.test.ts`

### Terminal Snapshot Tests

- `TUI_WORKSPACE_SSH_INFO > renders SSH connection info for running workspace at 120x40` — Snapshot shows section header "SSH Connection", Host, Port, Username, Command (bold), Token countdown, and copy hints
- `TUI_WORKSPACE_SSH_INFO > renders SSH connection info at 80x24 compact layout` — Only Command and Token fields visible; Host/Port/Username collapsed
- `TUI_WORKSPACE_SSH_INFO > renders SSH connection info at 200x60 expanded layout` — All fields visible plus Workspace ID and VM ID
- `TUI_WORKSPACE_SSH_INFO > renders waiting state for starting workspace` — Braille spinner with "Waiting for workspace to start…"
- `TUI_WORKSPACE_SSH_INFO > renders waiting state for pending workspace` — Braille spinner with "Waiting for workspace to start…"
- `TUI_WORKSPACE_SSH_INFO > renders suspended workspace message` — "Workspace suspended. Press R to resume."
- `TUI_WORKSPACE_SSH_INFO > renders stopped workspace message` — "Workspace stopped."
- `TUI_WORKSPACE_SSH_INFO > renders token expiring warning (yellow)` — Token countdown in yellow when <60s remaining
- `TUI_WORKSPACE_SSH_INFO > renders token expired state (red)` — "Token expired" in red with "(r:refresh)" hint
- `TUI_WORKSPACE_SSH_INFO > renders refreshing state with spinner` — Braille spinner with "Refreshing…" replacing SSH fields
- `TUI_WORKSPACE_SSH_INFO > renders error state on SSH info fetch failure` — Error message in red with retry hint
- `TUI_WORKSPACE_SSH_INFO > renders SSH connection unavailable when no VM ID` — "SSH connection unavailable. Workspace may still be provisioning."
- `TUI_WORKSPACE_SSH_INFO > renders copied confirmation in status bar` — Status bar shows "Copied!" after pressing `c`
- `TUI_WORKSPACE_SSH_INFO > renders copy not available in status bar` — Status bar shows "Copy not available" when clipboard unavailable
- `TUI_WORKSPACE_SSH_INFO > renders copied host confirmation in status bar` — Status bar shows "Copied host!" after pressing `y`
- `TUI_WORKSPACE_SSH_INFO > renders breadcrumb for workspace detail` — Breadcrumb shows "Dashboard > owner/repo > Workspaces > my-workspace"
- `TUI_WORKSPACE_SSH_INFO > renders help overlay with SSH keybindings` — Help overlay includes `c`, `y`, `r` keybindings
- `TUI_WORKSPACE_SSH_INFO > renders rate limit error inline` — "Rate limited. Retry in 30s." shown in SSH section
- `TUI_WORKSPACE_SSH_INFO > renders permission denied for read-only user` — SSH section shows "Permission denied"
- `TUI_WORKSPACE_SSH_INFO > command truncated at minimum terminal width` — SSH command ends with `…` when exceeding available width
- `TUI_WORKSPACE_SSH_INFO > renders auto-refresh failure state` — "Token expired (refresh failed)" in red

### Keyboard Interaction Tests

- `TUI_WORKSPACE_SSH_INFO > c copies SSH command to clipboard` — Press `c` on running workspace with SSH info → clipboard contains full SSH command string
- `TUI_WORKSPACE_SSH_INFO > c on non-running workspace is no-op` — Press `c` on suspended workspace → no clipboard write, no status bar change
- `TUI_WORKSPACE_SSH_INFO > y copies ssh_host to clipboard` — Press `y` on running workspace → clipboard contains `ssh_host` value
- `TUI_WORKSPACE_SSH_INFO > y on non-running workspace is no-op` — Press `y` on suspended workspace → no clipboard write
- `TUI_WORKSPACE_SSH_INFO > r refreshes SSH connection info` — Press `r` → new API call to SSH endpoint → updated command with new token
- `TUI_WORKSPACE_SSH_INFO > r during refresh is ignored` — Press `r`, then `r` again immediately → only one API call
- `TUI_WORKSPACE_SSH_INFO > r on non-running workspace is no-op` — Press `r` on starting workspace → no API call
- `TUI_WORKSPACE_SSH_INFO > R resumes suspended workspace` — Press `R` on suspended workspace → resume action triggered
- `TUI_WORKSPACE_SSH_INFO > R on running workspace is no-op` — Press `R` on running workspace → no action
- `TUI_WORKSPACE_SSH_INFO > c with clipboard unavailable shows fallback` — Press `c` with clipboard unsupported → status bar shows "Copy not available"
- `TUI_WORKSPACE_SSH_INFO > auto-refresh triggers on token expiry` — Wait for token TTL to elapse → SSH endpoint called automatically → new SSH info rendered
- `TUI_WORKSPACE_SSH_INFO > auto-refresh failure stops further auto-refresh` — Auto-refresh fails → no further auto-refresh attempts → `r` still works for manual refresh
- `TUI_WORKSPACE_SSH_INFO > q pops back from workspace detail` — Press `q` → returns to workspace list
- `TUI_WORKSPACE_SSH_INFO > Esc pops back from workspace detail` — Press `Esc` → returns to workspace list
- `TUI_WORKSPACE_SSH_INFO > ? shows help overlay` — Press `?` → help overlay displayed with SSH-specific keybindings
- `TUI_WORKSPACE_SSH_INFO > workspace starts via SSE and SSH info appears` — Workspace transitions from "starting" to "running" via SSE → spinner replaced with SSH connection info
- `TUI_WORKSPACE_SSH_INFO > workspace suspends via SSE and SSH info clears` — Running workspace transitions to "suspended" via SSE → SSH info replaced with suspended message
- `TUI_WORKSPACE_SSH_INFO > rapid c presses each trigger clipboard write` — Press `c` 3 times rapidly → 3 clipboard writes, last "Copied!" shown
- `TUI_WORKSPACE_SSH_INFO > token countdown updates display` — Observe token countdown field → value decreases over time

### Responsive Tests

- `TUI_WORKSPACE_SSH_INFO > responsive 80x24 shows only command and token` — At minimum size, only Command and Token rows visible. Host/Port/Username hidden.
- `TUI_WORKSPACE_SSH_INFO > responsive 120x40 shows all standard fields` — At standard size, Host, Port, Username, Command, Token all visible.
- `TUI_WORKSPACE_SSH_INFO > responsive 200x60 shows extended info` — At large size, Workspace ID and VM ID visible in addition to standard fields.
- `TUI_WORKSPACE_SSH_INFO > responsive 80x24 command truncation` — Long SSH command truncated with `…` at 80×24 width.
- `TUI_WORKSPACE_SSH_INFO > responsive 120x40 command fits` — Same SSH command displays in full at 120×40.
- `TUI_WORKSPACE_SSH_INFO > resize from 120x40 to 80x24 collapses fields` — Host/Port/Username rows disappear, Command truncates. SSH info data preserved.
- `TUI_WORKSPACE_SSH_INFO > resize from 80x24 to 120x40 expands fields` — Host/Port/Username rows appear. Full command shown.
- `TUI_WORKSPACE_SSH_INFO > resize from 120x40 to 200x60 adds extended fields` — Workspace ID and VM ID appear.
- `TUI_WORKSPACE_SSH_INFO > resize below minimum shows terminal too small` — 60×20: "Terminal too small" message. SSH info state preserved.
- `TUI_WORKSPACE_SSH_INFO > resize back above minimum restores SSH info` — 60×20 → 80×24: SSH info section restored with data intact.
- `TUI_WORKSPACE_SSH_INFO > resize during token refresh` — Resize while "Refreshing…" spinner shown → spinner still visible at new size, refresh completes normally.

### Integration Tests

- `TUI_WORKSPACE_SSH_INFO > full flow: create workspace, wait for running, copy SSH command` — Create workspace → wait for SSE transition to running → SSH info appears → press `c` → clipboard contains SSH command
- `TUI_WORKSPACE_SSH_INFO > SSH info re-fetched after workspace resume` — Suspend workspace → resume → workspace transitions to running → fresh SSH info with new token
- `TUI_WORKSPACE_SSH_INFO > 401 on SSH endpoint shows auth error` — SSH fetch returns 401 → app-shell auth error screen
- `TUI_WORKSPACE_SSH_INFO > 429 on SSH endpoint shows rate limit` — SSH fetch returns 429 with Retry-After: 30 → "Rate limited. Retry in 30s."
- `TUI_WORKSPACE_SSH_INFO > 404 on SSH endpoint shows workspace not found` — SSH fetch returns 404 → "Workspace not found. Press `q` to go back."
- `TUI_WORKSPACE_SSH_INFO > network error on SSH fetch shows retry hint` — Network timeout → "Failed to load SSH info. Press `r` to retry." → press `r` → retried
- `TUI_WORKSPACE_SSH_INFO > workspace deleted during SSH info display` — Workspace detail loaded → workspace deleted externally → next refresh returns 404 → error displayed
- `TUI_WORKSPACE_SSH_INFO > SSE reconnect recovers missed status transition` — SSE disconnects while workspace transitions to running → SSE reconnects → SSH info fetched and displayed
- `TUI_WORKSPACE_SSH_INFO > token refresh produces new command with new token` — Press `r` → API returns new WorkspaceSSHConnectionInfo → command field updated → token countdown resets to 5 minutes
- `TUI_WORKSPACE_SSH_INFO > copy captures full command even when truncated` — At 80×24 with truncated command → press `c` → clipboard contains full untruncated command

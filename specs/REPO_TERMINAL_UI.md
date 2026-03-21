# REPO_TERMINAL_UI

Specification for REPO_TERMINAL_UI.

## High-Level User POV

When a developer navigates to a repository on Codeplane, they can open an interactive terminal session directly within the web browser — no separate SSH client, no local environment setup, and no context-switching required. The terminal appears as a full-featured panel within the repository view, giving users immediate shell access to a workspace container scoped to that repository.

The terminal is the connective tissue between browsing code, triaging issues, reviewing landing requests, and actually making changes. A developer reading through an issue can open the terminal, run commands against the repository's workspace, make a fix, and create a landing request — all without leaving the Codeplane web interface. This is especially powerful for agent-assisted workflows where an AI agent and a human can share the same workspace context, with the human able to observe and intervene via the terminal at any time.

For new contributors or team members on unfamiliar machines, the repository terminal eliminates the "clone and set up" friction entirely. They land on the repository page, open the terminal, and they're in a fully provisioned environment with the repository already checked out and ready to work. The workspace container handles dependencies, tooling, and runtime setup so the human can focus on the task at hand.

The terminal is designed to feel native. It supports standard terminal behaviors: copy/paste, scrollback, resize, color output, keyboard shortcuts, and common shell interactions. It connects to the same workspace infrastructure that powers Codeplane's CLI workspace commands and agent sessions, meaning terminal work, CLI work, and agent work all operate on the same underlying sandbox. Sessions persist across page navigations within the same browser tab, and the terminal can be minimized to a dock at the bottom of the screen for quick access while working in other parts of the repository.

## Acceptance Criteria

### Definition of Done

- A user can open an interactive terminal session from any repository page in the web UI
- The terminal connects to a running workspace container scoped to the repository
- Terminal input and output stream bidirectionally with sub-200ms perceived latency on a healthy connection
- The terminal dock persists across page navigations within the repository scope
- Sessions are properly cleaned up on disconnect, tab close, or idle timeout
- The feature degrades gracefully when the container sandbox runtime is unavailable

### Functional Constraints

- [ ] The terminal panel must be accessible from the repository navigation sidebar or via a keyboard shortcut
- [ ] If no workspace exists for the repository, one must be auto-created when the terminal is opened
- [ ] If the workspace is suspended, it must be auto-resumed when the terminal is opened
- [ ] The terminal must render a standard VT100/xterm-compatible terminal emulator in the browser
- [ ] The terminal must support at least 256-color output and common ANSI escape sequences
- [ ] Copy/paste must work using standard OS clipboard shortcuts (Cmd+C / Ctrl+Shift+C for copy, Cmd+V / Ctrl+Shift+V for paste)
- [ ] The terminal must support scrollback with a configurable buffer (minimum 1,000 lines, default 5,000 lines, maximum 50,000 lines)
- [ ] Terminal dimensions (cols × rows) must dynamically resize when the panel is resized or the browser window changes
- [ ] Terminal dimensions must be clamped to 1–500 columns and 1–500 rows
- [ ] The terminal must render correctly at the minimum supported size of 80×24
- [ ] The terminal session must survive page navigation within the same repository scope without disconnecting
- [ ] The terminal dock must support minimize/maximize toggle via keyboard shortcut and click
- [ ] Multiple concurrent terminal sessions per user per repository must be supported (up to 5)
- [ ] Each terminal tab must display a label showing the session identifier or a user-assigned name
- [ ] Session names must be 1–64 characters, ASCII printable characters only (0x20–0x7E), no leading/trailing whitespace
- [ ] The terminal must display a clear loading state while the workspace is provisioning or resuming
- [ ] The terminal must display an explicit error message if the sandbox runtime is unavailable, with guidance to use SSH instead
- [ ] The terminal must display a reconnection prompt if the connection drops, with an automatic retry (up to 3 attempts with exponential backoff: 1s, 2s, 4s)
- [ ] Idle sessions must be automatically cleaned up after the configured workspace idle timeout (default: 30 minutes)
- [ ] The terminal must show a 5-minute warning before idle timeout disconnects the session
- [ ] When the browser tab or window is closed, the session must be destroyed via the `beforeunload` event or equivalent cleanup
- [ ] The terminal must not send input while in a disconnected state; keystrokes must be buffered or discarded with a visible indicator
- [ ] Terminal font must default to the system monospace font and support user override via settings
- [ ] Terminal font size must be configurable (range: 8–32px, default: 14px)
- [ ] The terminal must function correctly with screen readers by providing ARIA labels on the terminal container and a text-mode fallback for status messages

### Edge Cases

- [ ] Opening a terminal when the workspace container has been deleted must trigger workspace re-creation
- [ ] If workspace creation fails (e.g., container runtime error), the terminal must show an actionable error and not enter a retry loop
- [ ] Rapid open/close/reopen of the terminal must not create orphaned sessions
- [ ] Pasting text larger than 64 KB must be truncated with a user-visible warning
- [ ] Binary output (e.g., `cat /dev/urandom`) must not crash the terminal emulator; it should render garbled but remain functional
- [ ] If the WebSocket connection cannot be established (e.g., corporate proxy blocks), the terminal must fall back to showing SSH connection instructions
- [ ] Unicode and emoji input/output must render correctly in the terminal
- [ ] Right-to-left text must not break the terminal layout (it may render incorrectly, but must not crash)

## Design

### Web UI Design

#### Terminal Panel Layout

The repository terminal UI consists of two interconnected components:

1. **Terminal Dock** — A collapsible panel anchored to the bottom of the repository layout, similar to the terminal panel in VS Code. It sits alongside the existing Agent Dock and can be toggled independently.

2. **Full-Page Terminal View** — An optional full-viewport terminal accessible at `/:owner/:repo/terminal` for users who prefer a dedicated terminal experience.

#### Terminal Dock Behavior

- **Toggle**: The dock is toggled via the sidebar terminal icon, keyboard shortcut (`` Ctrl+` `` or `` Cmd+` `` on macOS), or the command palette (`Terminal: Toggle`).
- **Default Height**: 35% of the viewport, resizable via a drag handle on the top edge.
- **Minimum Height**: 150px. Maximum height: 80% of the viewport.
- **Tab Bar**: A horizontal tab strip at the top of the dock shows active terminal sessions. Each tab shows a session label (default: `Terminal 1`, `Terminal 2`, etc.) and a close button.
- **New Tab Button**: A `+` button at the end of the tab strip creates a new session (up to 5 per repo).
- **Overflow**: If tabs exceed available width, horizontal scrolling with arrow indicators is used.
- **Minimize**: A minimize button in the dock header collapses the dock to a thin status strip showing the number of active sessions and a restore button.

#### Terminal Emulator Component

- Built on `xterm.js` with the `@xterm/xterm` package.
- Addons: `@xterm/addon-fit` (auto-sizing), `@xterm/addon-web-links` (clickable URLs), `@xterm/addon-webgl` (GPU-accelerated rendering, with canvas fallback).
- Theme: Matches the current Codeplane UI theme (dark/light). Terminal colors are derived from the application's design tokens.
- Cursor: Block cursor, blinking, with user-configurable style (block/underline/bar).

#### Session Lifecycle UI States

| State | Visual Treatment |
|---|---|
| **Provisioning** | Centered spinner with "Starting workspace…" label. Progress steps shown (creating container → waiting for SSH → connecting). |
| **Connecting** | Spinner with "Connecting to session…" label. |
| **Connected** | Full terminal emulator visible and interactive. Green status dot on the session tab. |
| **Reconnecting** | Yellow status dot on tab. Overlay banner: "Connection lost. Reconnecting… (attempt 2/3)". Terminal remains visible but input is disabled. |
| **Disconnected** | Red status dot on tab. Overlay with "Session disconnected" message and "Reconnect" / "Close" buttons. |
| **Error** | Red status dot. Error message with details. For sandbox unavailable: "Terminal requires a workspace runtime. Connect via SSH instead: `ssh ...`". |
| **Idle Warning** | Yellow banner at top of terminal: "Session will disconnect in X:XX due to inactivity." Dismissible, resets on any input. |

#### Full-Page Terminal View

Route: `/:owner/:repo/terminal`

- Renders a single terminal session that fills the entire content area (no sidebar, no header strip beyond breadcrumb).
- Back navigation returns to the previous repository page.
- The full-page view shares session state with the dock — if a dock session exists, the full-page view attaches to it rather than creating a new one.

#### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `` Ctrl+` `` / `` Cmd+` `` | Toggle terminal dock |
| `` Ctrl+Shift+` `` / `` Cmd+Shift+` `` | Create new terminal session |
| `Ctrl+Shift+W` | Close active terminal session |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle terminal tabs forward/backward |
| `Ctrl+Shift+F` | Toggle full-page terminal view |
| `Ctrl+Shift+C` / `Cmd+C` (when text selected) | Copy selected text |
| `Ctrl+Shift+V` / `Cmd+V` | Paste from clipboard |

### API Shape

#### WebSocket Endpoint — Terminal I/O

```
GET /api/repos/:owner/:repo/workspace/sessions/:id/ws
Upgrade: websocket
```

**Authentication**: Session cookie or `Authorization: Bearer <PAT>` header sent during the WebSocket handshake.

**Message Protocol** (JSON frames):

Client → Server:
```json
{ "type": "stdin", "data": "<base64-encoded input>" }
{ "type": "resize", "cols": 120, "rows": 40 }
{ "type": "ping" }
```

Server → Client:
```json
{ "type": "stdout", "data": "<base64-encoded output>" }
{ "type": "stderr", "data": "<base64-encoded output>" }
{ "type": "exit", "code": 0 }
{ "type": "pong" }
{ "type": "error", "message": "Session not found", "code": "SESSION_NOT_FOUND" }
{ "type": "idle_warning", "seconds_remaining": 300 }
```

**Data Encoding**: All `stdin`/`stdout`/`stderr` payloads are base64-encoded to safely transport binary terminal data over JSON WebSocket frames.

**Keepalive**: Client sends `ping` every 30 seconds. Server responds with `pong`. If no `pong` is received within 10 seconds, client initiates reconnection.

**Maximum frame size**: 256 KB per WebSocket message. Frames larger than this are rejected with an error.

**Connection lifecycle**:
1. Client opens WebSocket with session ID
2. Server validates session ownership and status
3. Server attaches to the container's PTY (or creates one via `docker exec -it`)
4. Bidirectional streaming begins
5. On disconnect, server marks session activity timestamp
6. On explicit close or idle timeout, server destroys the session

#### Terminal Preferences Endpoint

```
PATCH /api/users/:username/settings/terminal
```

Request body:
```json
{
  "font_size": 14,
  "font_family": "JetBrains Mono, monospace",
  "cursor_style": "block",
  "cursor_blink": true,
  "scrollback_lines": 5000,
  "theme": "auto"
}
```

**Constraints**:
- `font_size`: integer, 8–32
- `font_family`: string, 1–256 characters
- `cursor_style`: one of `"block"`, `"underline"`, `"bar"`
- `cursor_blink`: boolean
- `scrollback_lines`: integer, 1000–50000
- `theme`: one of `"auto"`, `"dark"`, `"light"`

### SDK Shape

The `@codeplane/ui-core` package exposes:

- `useTerminalSession(repoContext)` — Hook that manages session creation, WebSocket connection, reconnection logic, and cleanup.
- `useTerminalDock()` — Hook for dock state (open/closed, active tab, tab list, dock height).
- `useTerminalPreferences()` — Hook for reading/writing terminal display preferences.
- `createTerminalStore()` — Store factory for managing multiple terminal sessions per repository.

### CLI Command

No new CLI commands are required. The existing `codeplane workspace ssh` command provides the CLI equivalent of this feature. The `codeplane tui` already has workspace screens.

### Documentation

The following end-user documentation must be written:

1. **"Using the Repository Terminal"** — A getting-started guide covering: how to open the terminal from a repository page, terminal dock basics (tabs, resize, minimize), keyboard shortcuts reference table, customizing terminal appearance (font, cursor, theme), session lifecycle and idle timeout behavior, troubleshooting connection issues.

2. **"Terminal Keyboard Shortcuts"** — A quick-reference card embedded in the keyboard help modal (`?`).

3. **"Terminal FAQ"** — Covering: "Why does the terminal say 'sandbox unavailable'?" (container runtime not configured), "How do I keep my terminal session alive?" (activity resets idle timer), "Can I use the terminal offline?" (No, requires server connectivity), "How do I connect from my local terminal instead?" (Use `codeplane workspace ssh`).

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member (Write) | Member (Read) | Anonymous |
|---|---|---|---|---|---|
| Open terminal (creates session) | ✅ | ✅ | ✅ | ❌ | ❌ |
| View terminal (read-only attach) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Resize terminal | ✅ | ✅ | ✅ | ❌ | ❌ |
| Destroy terminal session | ✅ (any) | ✅ (any) | ✅ (own) | ❌ | ❌ |
| Modify terminal preferences | ✅ (own) | ✅ (own) | ✅ (own) | ✅ (own) | ❌ |

- **Write access required**: Opening a terminal creates a workspace session, which implies write access to the repository's workspace sandbox. Read-only users cannot create sessions but may be able to view a read-only terminal replay in the future.
- **Anonymous users**: Terminal is never accessible without authentication. Anonymous repository visitors see the terminal icon disabled with a tooltip: "Sign in to use the terminal."

### Rate Limiting

| Action | Limit | Window |
|---|---|---|
| Session creation (per user per repo) | 10 | 1 minute |
| Session creation (global per user) | 30 | 1 minute |
| WebSocket connection attempts (per user per session) | 20 | 1 minute |
| Resize events (per session) | 60 | 1 minute |
| Terminal preferences update (per user) | 10 | 1 minute |

### Data Privacy & Security

- **No terminal I/O logging by default**: Terminal stdin/stdout/stderr data is not persisted server-side unless audit logging is explicitly enabled by an admin.
- **Session tokens are ephemeral**: 5-minute TTL, single-use, SHA-256 hashed at rest.
- **WebSocket frames are not logged**: Raw terminal data must never appear in application logs. Only metadata (session ID, connection events, error codes) may be logged.
- **Paste content is not inspected**: The server does not scan or filter pasted content. However, paste size is capped at 64 KB per operation.
- **Clipboard access**: The web UI requests clipboard permission via the browser's Clipboard API. If denied, paste falls back to Ctrl+Shift+V browser-native behavior.
- **PII exposure risk**: Terminal sessions may display environment variables, credentials, or other sensitive data. The terminal content is only visible to the authenticated user who owns the session. Screen-sharing or screenshots are the user's responsibility.
- **WebSocket TLS**: All WebSocket connections must use `wss://` in production. The server must reject non-TLS WebSocket upgrades in production mode.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `TerminalSessionOpened` | User opens a new terminal session | `repository_id`, `user_id`, `workspace_id`, `session_id`, `source` (`dock` | `full_page` | `command_palette` | `keyboard_shortcut`), `workspace_created` (bool), `workspace_resumed` (bool) |
| `TerminalSessionClosed` | Terminal session ends | `repository_id`, `user_id`, `session_id`, `duration_seconds`, `close_reason` (`user_closed` | `idle_timeout` | `tab_closed` | `error` | `session_destroyed`), `bytes_sent`, `bytes_received` |
| `TerminalReconnected` | WebSocket reconnects after drop | `repository_id`, `user_id`, `session_id`, `attempt_number`, `reconnect_latency_ms` |
| `TerminalReconnectFailed` | All reconnect attempts exhausted | `repository_id`, `user_id`, `session_id`, `total_attempts`, `last_error` |
| `TerminalDockToggled` | User opens/closes the dock | `repository_id`, `user_id`, `action` (`open` | `close` | `minimize` | `maximize`), `source` |
| `TerminalResized` | Terminal dimensions change | `repository_id`, `session_id`, `new_cols`, `new_rows`, `old_cols`, `old_rows` |
| `TerminalPreferencesUpdated` | User changes terminal settings | `user_id`, `changed_fields[]` |
| `TerminalFallbackShown` | Sandbox unavailable error shown | `repository_id`, `user_id`, `error_code` |

### Funnel Metrics

1. **Activation funnel**: Repository page view → Terminal dock opened → Session connected → First command typed (stdin event received within 60s of connection)
2. **Retention signal**: Users who open ≥3 terminal sessions per week
3. **Session quality**: Median session duration, p95 reconnection latency, % of sessions that end in error vs. clean close
4. **Workspace auto-create rate**: % of terminal opens that trigger workspace creation (indicates cold-start friction)
5. **Fallback rate**: % of terminal opens that show sandbox-unavailable error (indicates infrastructure gaps)

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| WebSocket connection opened | `info` | `session_id`, `user_id`, `repository_id`, `remote_ip` |
| WebSocket connection closed | `info` | `session_id`, `user_id`, `close_code`, `close_reason`, `duration_ms` |
| WebSocket connection error | `error` | `session_id`, `user_id`, `error_message`, `error_code` |
| Session created (workspace auto-provisioned) | `info` | `session_id`, `workspace_id`, `user_id`, `repository_id`, `provisioning_duration_ms` |
| Session idle timeout triggered | `info` | `session_id`, `user_id`, `idle_duration_seconds` |
| PTY attach failed | `error` | `session_id`, `workspace_id`, `vm_id`, `error_message` |
| Container exec failed | `error` | `session_id`, `vm_id`, `command`, `exit_code`, `stderr` (truncated to 1 KB) |
| WebSocket frame rejected (too large) | `warn` | `session_id`, `frame_size_bytes`, `max_allowed_bytes` |
| Resize event processed | `debug` | `session_id`, `cols`, `rows` |
| Terminal preferences updated | `info` | `user_id`, `changed_fields` |

**Critical rule**: Raw terminal I/O data (`stdin`, `stdout`, `stderr` payloads) must NEVER appear in logs at any level.

### Prometheus Metrics

#### Counters

- `codeplane_terminal_sessions_created_total{repository, source}` — Total terminal sessions created
- `codeplane_terminal_sessions_closed_total{repository, close_reason}` — Total sessions closed, by reason
- `codeplane_terminal_websocket_connections_total{repository}` — Total WebSocket connections established
- `codeplane_terminal_websocket_errors_total{repository, error_code}` — Total WebSocket errors
- `codeplane_terminal_reconnections_total{repository, success}` — Reconnection attempts (success=true/false)
- `codeplane_terminal_frames_sent_total{repository}` — Total WebSocket frames sent (server → client)
- `codeplane_terminal_frames_received_total{repository}` — Total WebSocket frames received (client → server)
- `codeplane_terminal_idle_timeouts_total{repository}` — Sessions closed due to idle timeout
- `codeplane_terminal_workspace_autocreations_total{repository}` — Workspaces auto-created by terminal open

#### Gauges

- `codeplane_terminal_active_sessions{repository}` — Currently active terminal sessions
- `codeplane_terminal_active_websockets` — Currently open WebSocket connections (global)
- `codeplane_terminal_dock_open_users` — Users with terminal dock currently open (sampled via heartbeat)

#### Histograms

- `codeplane_terminal_session_duration_seconds{repository}` — Session duration distribution (buckets: 30s, 1m, 5m, 15m, 30m, 1h, 2h, 4h)
- `codeplane_terminal_websocket_latency_ms{repository}` — Round-trip ping/pong latency (buckets: 10, 25, 50, 100, 200, 500, 1000, 2000)
- `codeplane_terminal_provisioning_duration_seconds{repository}` — Time from terminal open to connected state (buckets: 1s, 2s, 5s, 10s, 30s, 60s, 120s)
- `codeplane_terminal_frame_size_bytes{direction}` — WebSocket frame size distribution (direction=sent/received)

### Alerts

#### Alert: TerminalHighErrorRate

- **Condition**: `rate(codeplane_terminal_websocket_errors_total[5m]) / rate(codeplane_terminal_websocket_connections_total[5m]) > 0.1`
- **Severity**: Warning (>10%), Critical (>25%)
- **Runbook**:
  1. Check `codeplane_terminal_websocket_errors_total` by `error_code` to identify the dominant error type.
  2. If `SESSION_NOT_FOUND` dominates: Check if sessions are being prematurely cleaned up. Inspect idle timeout configuration and cleanup scheduler logs.
  3. If `PTY_ATTACH_FAILED` dominates: Check container runtime health (`docker ps`, `podman ps`). Verify containers are running and SSH port is accessible.
  4. If `UPGRADE_FAILED` dominates: Check reverse proxy/load balancer WebSocket support. Verify `Upgrade: websocket` headers are being forwarded.
  5. Check application logs filtered by `error_code` for stack traces.
  6. If container runtime is down, restart the container daemon and verify workspace containers recover.

#### Alert: TerminalHighProvisioningLatency

- **Condition**: `histogram_quantile(0.95, rate(codeplane_terminal_provisioning_duration_seconds_bucket[5m])) > 30`
- **Severity**: Warning (>30s), Critical (>60s)
- **Runbook**:
  1. Check if the issue is workspace creation or container start: inspect `codeplane_terminal_workspace_autocreations_total` rate.
  2. If auto-creation rate is high, check container image pull times. The workspace image may not be cached locally.
  3. Run `docker images | grep codeplane` to verify the workspace image is present.
  4. Check container healthcheck logs: `docker inspect <container_id>` → `State.Health.Log`.
  5. If healthcheck is timing out, SSH server inside the container may be failing to start. Check container logs: `docker logs <container_id>`.
  6. Monitor host resources (CPU, memory, disk). Container creation may be slow due to resource pressure.

#### Alert: TerminalSessionLeaks

- **Condition**: `codeplane_terminal_active_sessions > 500` (adjust threshold per deployment size)
- **Severity**: Warning
- **Runbook**:
  1. Query active sessions: check if a disproportionate number belong to one user or repository.
  2. Verify cleanup scheduler is running: check scheduler logs for `workspace_session_cleanup` task.
  3. Check if `beforeunload` cleanup is failing: high `active_sessions` with low `active_websockets` indicates orphaned sessions.
  4. Manually clean up orphaned sessions older than 2× the idle timeout via admin API.
  5. If cleanup scheduler is stuck, restart the server process.

#### Alert: TerminalWebSocketLatencyHigh

- **Condition**: `histogram_quantile(0.95, rate(codeplane_terminal_websocket_latency_ms_bucket[5m])) > 500`
- **Severity**: Warning (>500ms), Critical (>2000ms)
- **Runbook**:
  1. Check network path between server and container runtime. Run `ping` and `traceroute` to the container host.
  2. Check if the issue is global or per-repository: filter by `repository` label.
  3. Inspect host CPU and memory usage. High load can increase WebSocket frame processing time.
  4. Check if the container is under resource pressure: `docker stats <container_id>`.
  5. Verify no packet loss on the host network interface.
  6. If latency is only on specific containers, check container placement and network namespace configuration.

### Error Cases and Failure Modes

| Error | Code | User-Facing Message | Recovery |
|---|---|---|---|
| Sandbox runtime unavailable | WS close 4001 | "Terminal requires a workspace runtime. Use SSH: `codeplane workspace ssh`" | Show SSH fallback instructions |
| Session not found | WS close 4004 | "Terminal session not found. It may have expired." | Prompt to open new session |
| Unauthorized | WS close 4003 | "You don't have permission to access this terminal." | Redirect to login |
| Rate limited | WS close 4029 | "Too many terminal requests. Please wait." | Show retry timer |
| Max sessions exceeded | HTTP 429 | "Maximum of 5 terminal sessions reached. Close a session first." | Show session list with close buttons |
| Container start failed | WS close 4500 | "Failed to start workspace. Please try again or contact support." | Show retry button |
| WebSocket upgrade rejected (proxy) | HTTP 426 | "WebSocket connection failed. Your network may block WebSocket connections." | Show SSH fallback |
| Frame too large | WS close 4013 | "Input too large (max 256 KB)." | Truncate and retry |

## Verification

### API Tests

1. **WebSocket handshake with valid session cookie** — Verify WebSocket upgrade succeeds and server sends initial `pong` frame.
2. **WebSocket handshake with valid PAT** — Verify WebSocket upgrade succeeds with `Authorization: Bearer <PAT>` header.
3. **WebSocket handshake without auth** — Verify server rejects upgrade with 401.
4. **WebSocket handshake with expired session** — Verify server rejects with 4004 close code.
5. **WebSocket handshake for non-existent session** — Verify server rejects with 4004 close code.
6. **WebSocket handshake for session owned by another user** — Verify server rejects with 4003 close code.
7. **Send stdin frame and receive stdout** — Send `{ "type": "stdin", "data": "<base64 of 'echo hello\n'>" }` and verify stdout frame contains "hello".
8. **Send resize frame** — Send `{ "type": "resize", "cols": 120, "rows": 40 }` and verify no error. Verify session record updated.
9. **Send resize with boundary values (1×1)** — Verify accepted.
10. **Send resize with boundary values (500×500)** — Verify accepted.
11. **Send resize with out-of-range values (501×501)** — Verify rejected with error frame.
12. **Send resize with zero dimensions** — Verify rejected or clamped to minimum (1×1).
13. **Send resize with negative dimensions** — Verify rejected with error frame.
14. **Ping/pong keepalive** — Send `{ "type": "ping" }`, verify `{ "type": "pong" }` response within 5 seconds.
15. **Send oversized frame (>256 KB)** — Verify connection closes with 4013 code.
16. **Send frame at exactly 256 KB** — Verify accepted (boundary test).
17. **Send frame at 256 KB + 1 byte** — Verify rejected.
18. **Send malformed JSON** — Verify error frame returned, connection not dropped.
19. **Send unknown message type** — Verify error frame returned with `UNKNOWN_TYPE` code.
20. **Rapid reconnection** — Disconnect and reconnect 5 times in 10 seconds. Verify all connections succeed and no orphaned PTYs.
21. **Session destruction while WebSocket connected** — Call `POST .../destroy` via HTTP while WebSocket is open. Verify WebSocket receives close frame.
22. **Idle timeout** — Create session, send no input for configured timeout period, verify session receives `idle_warning` frame and then closes.
23. **Concurrent WebSocket connections to same session** — Open two WebSocket connections to the same session. Verify either second is rejected or both receive output.
24. **Terminal preferences PATCH with valid values** — Verify 200 response, values persisted.
25. **Terminal preferences PATCH with font_size=8 (minimum)** — Verify accepted.
26. **Terminal preferences PATCH with font_size=32 (maximum)** — Verify accepted.
27. **Terminal preferences PATCH with font_size=7 (below minimum)** — Verify 400 error.
28. **Terminal preferences PATCH with font_size=33 (above maximum)** — Verify 400 error.
29. **Terminal preferences PATCH with scrollback_lines=1000 (minimum)** — Verify accepted.
30. **Terminal preferences PATCH with scrollback_lines=50000 (maximum)** — Verify accepted.
31. **Terminal preferences PATCH with scrollback_lines=999** — Verify 400 error.
32. **Terminal preferences PATCH with scrollback_lines=50001** — Verify 400 error.
33. **Terminal preferences PATCH with invalid cursor_style** — Verify 400 error.
34. **Terminal preferences PATCH with font_family exceeding 256 characters** — Verify 400 error.
35. **Terminal preferences PATCH with font_family at exactly 256 characters** — Verify accepted.
36. **Rate limiting on session creation** — Create 11 sessions in under 1 minute for the same user/repo. Verify 11th returns 429.
37. **Rate limiting on WebSocket connections** — Attempt 21 WebSocket connections in 1 minute for the same user/session. Verify 21st is rejected.

### Playwright (Web UI) Tests

38. **Open terminal dock via keyboard shortcut** — Press `` Ctrl+` ``, verify dock appears with a terminal session.
39. **Open terminal dock via sidebar icon** — Click terminal icon in repo sidebar, verify dock opens.
40. **Open terminal dock via command palette** — Open palette, type "Terminal", select "Toggle Terminal", verify dock opens.
41. **Terminal renders shell prompt** — After opening, verify terminal contains a shell prompt (e.g., `$` or `#`).
42. **Type command and see output** — Type `echo codeplane-test` + Enter, verify "codeplane-test" appears in terminal output.
43. **Terminal dock resize via drag** — Drag the dock top edge upward, verify dock height increases and terminal re-renders.
44. **Terminal dock minimize/maximize** — Click minimize, verify dock collapses. Click restore, verify dock expands with terminal intact.
45. **Create multiple terminal tabs** — Click `+` button, verify second tab appears. Switch between tabs, verify each has independent content.
46. **Close terminal tab** — Click close button on tab, verify tab removed and session destroyed.
47. **Close last terminal tab** — Close the only tab, verify dock closes.
48. **Terminal persists across repo page navigation** — Open terminal, navigate to issues page, verify terminal dock remains open with session connected.
49. **Terminal disconnects on repo scope change** — Open terminal, navigate to a different repository, verify terminal dock closes.
50. **Full-page terminal view** — Navigate to `/:owner/:repo/terminal`, verify full-viewport terminal renders.
51. **Copy text from terminal** — Select text in terminal, press copy shortcut, verify clipboard contains selected text.
52. **Paste text into terminal** — Copy text to clipboard, press paste shortcut in terminal, verify text appears.
53. **Paste oversized text (>64 KB)** — Attempt to paste 65 KB of text, verify warning shown and input truncated.
54. **Terminal loading state** — Open terminal for a repo with no workspace, verify provisioning spinner and progress steps are shown.
55. **Terminal error state (sandbox unavailable)** — On a server without container runtime, open terminal, verify error message with SSH fallback instructions.
56. **Terminal reconnection UI** — Simulate network disconnect, verify yellow reconnecting banner appears.
57. **Terminal font size change** — Change font size in settings, verify terminal re-renders with new size.
58. **Terminal theme follows app theme** — Switch app theme from dark to light, verify terminal colors update.
59. **Keyboard shortcuts do not conflict** — While terminal is focused, press `Ctrl+Shift+P` (command palette), verify palette opens (not captured by terminal).
60. **Terminal accessible ARIA labels** — Verify terminal container has `role="terminal"` and appropriate `aria-label`.

### CLI Tests

61. **`codeplane workspace ssh` connects to same workspace as web terminal** — Open terminal in web, then run `codeplane workspace ssh` for same repo. Verify both connect to the same workspace container.
62. **Session cleanup after CLI disconnect** — Connect via CLI, disconnect, verify session is destroyed and not orphaned.

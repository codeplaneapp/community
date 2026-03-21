# TERMINAL_DOCK_UI

Specification for TERMINAL_DOCK_UI.

## High-Level User POV

The Terminal Dock is a persistent, dockable panel at the bottom of the Codeplane web application that gives developers instant terminal access to their workspace containers without leaving the repository workbench. It is part of the web app shell — always available alongside the sidebar, command palette, and agent dock — and lets developers seamlessly switch between browsing code, reviewing landing requests, and running commands in a live workspace environment.

When a developer clicks "New Terminal" from the dock bar or invokes the terminal command from the command palette, Codeplane handles everything behind the scenes. If no workspace exists for the repository, one is created automatically. If the workspace is suspended, it wakes up. A session is provisioned, SSH credentials are generated, and within seconds the developer has a fully interactive terminal connected to a sandbox container — all without manually managing SSH keys, connection strings, or container orchestration.

The Terminal Dock supports multiple concurrent terminal tabs. Each tab represents an independent workspace session with its own lifecycle, activity tracking, and idle timeout. Developers can name tabs, reorder them, close individual sessions, and switch between them fluidly. Status indicators on each tab update in real time via server-sent events, so the developer always knows whether a session is running, starting, or has stopped.

The dock panel itself can be resized vertically by dragging its top edge, collapsed to a compact tab bar, or fully hidden. Its state — open/closed, height, active tab — persists across page navigations within the same repository context. When a developer navigates to a different repository, the dock scopes to that repository's workspaces and sessions.

For agent-assisted workflows, the Terminal Dock works in concert with the Agent Dock. A developer might have an agent session open in the Agent Dock while simultaneously using the Terminal Dock to inspect the workspace filesystem, run tests, or verify changes the agent made. The two docks share the same workspace infrastructure but serve different interaction patterns — one conversational, the other hands-on-keyboard.

The Terminal Dock is gated behind the `workspaces` feature flag. When the feature flag is disabled, or when no container sandbox runtime is available, the dock bar is hidden and the command palette omits terminal-related commands. This ensures the UI degrades gracefully in environments where workspace functionality is not configured.

## Acceptance Criteria

### Definition of Done

- [ ] The Terminal Dock is rendered as a persistent shell component in the web application layout, below the main content area and above the footer/status bar
- [ ] The dock is visible on all repository-scoped routes (`/:owner/:repo/*`) when the `workspaces` feature flag is enabled and the user is authenticated with at least write access
- [ ] Clicking "New Terminal" (or pressing the keyboard shortcut) creates a workspace session via `POST /api/repos/:owner/:repo/workspace/sessions`, retrieves SSH info via `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh`, and establishes a terminal connection
- [ ] If no workspace exists for the current repository, a primary workspace is auto-created transparently during session creation
- [ ] If the workspace is suspended, it is auto-resumed when a new terminal is opened
- [ ] The terminal emulator renders an interactive SSH shell using the retrieved session credentials
- [ ] Multiple terminal tabs are supported; each tab maps to one workspace session
- [ ] The dock panel can be resized vertically by dragging its top edge (minimum height: 120px, maximum height: 80% of viewport)
- [ ] The dock panel can be collapsed to a compact tab bar (showing tab headers and the "New Terminal" button but hiding the terminal viewport)
- [ ] The dock panel can be fully hidden via a close button or keyboard shortcut
- [ ] Dock state (open/collapsed/hidden, panel height, active tab index) persists in `localStorage` and is restored on page navigation
- [ ] Each terminal tab displays a status indicator: green dot for running, yellow spinner for pending/starting, gray dot for stopped, red dot for failed
- [ ] Tab status indicators update in real time via SSE subscription to `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream`
- [ ] Individual terminal tabs can be closed, which destroys the corresponding session via `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy`
- [ ] Closing the last terminal tab auto-suspends the workspace (handled server-side) and the dock collapses to show "No active terminals"
- [ ] The terminal emulator correctly handles resize events; when the dock panel height changes, the terminal dimensions (cols/rows) are recalculated and sent to the backend
- [ ] The dock is hidden on non-repository routes (e.g., user settings, global search, admin)
- [ ] The dock is hidden when the `workspaces` feature flag is disabled
- [ ] The dock is hidden for unauthenticated users and read-only collaborators
- [ ] When the sandbox runtime is unavailable, clicking "New Terminal" shows an error toast: "Workspace terminals are not available in this environment"
- [ ] All SSE connections for terminal status are properly cleaned up when navigating away from the repository
- [ ] Post-logout, the dock is immediately hidden and all terminal connections are severed

### Input Constraints

- [ ] Tab names are optional, user-assignable strings: 1–64 characters, alphanumeric plus spaces, hyphens, and underscores; leading/trailing whitespace is trimmed; empty names fall back to auto-generated "Terminal 1", "Terminal 2", etc.
- [ ] Maximum concurrent tabs per dock: 10 (matching the per-repo session cap). Attempting to open an 11th tab shows an error toast.
- [ ] Panel height range: 120px to 80% of viewport height. Values outside this range are clamped.
- [ ] Panel height is stored as a pixel value in `localStorage` key `codeplane:terminal-dock:height`
- [ ] Dock visibility state is stored in `localStorage` key `codeplane:terminal-dock:state` with values `open`, `collapsed`, or `hidden`

### Edge Cases

- [ ] If the session creation API returns 500 (sandbox unavailable), the dock shows an inline error message in the tab area with a retry button
- [ ] If the SSH info API returns 404 (workspace has no VM), the dock shows a "Workspace provisioning..." message with a spinner and retries with exponential backoff (1s initial, 10s max, 10 attempts max)
- [ ] If the SSE connection drops, the terminal tab shows a subtle "Reconnecting..." overlay and attempts exponential backoff reconnection (1s initial, 30s max, 20 attempts max)
- [ ] If the SSH token expires (5-minute TTL) before the terminal connects, the dock auto-fetches new SSH info and retries the connection
- [ ] If the user navigates between repositories, existing dock state for the previous repository is preserved in memory and restored on return
- [ ] If the browser tab is backgrounded and foregrounded, the dock checks session status and reconnects terminals whose sessions are still running
- [ ] If multiple terminals are connected to the same workspace, destroying one does not affect the others
- [ ] If the workspace is deleted externally while terminals are open, the affected tabs show a "Session ended" banner
- [ ] Pasting text longer than 100KB into the terminal truncates at 100KB and shows a brief warning
- [ ] Copy-paste of terminal content preserves ANSI formatting when pasting into compatible targets
- [ ] Terminal font size is configurable (10px–24px range, default 14px), persisted in `localStorage`
- [ ] The dock handles viewport width < 600px by expanding to full width and hiding the tab list in favor of a tab dropdown selector

## Design

### Web UI Design

#### Component Architecture

The Terminal Dock consists of these SolidJS components:

- **`TerminalDock`** — Root shell component mounted in `AppLayout.tsx` below the main content `<Outlet>`. Manages dock state (open/collapsed/hidden), panel height, and tab collection.
- **`TerminalDockBar`** — Compact header bar always visible when the dock is not fully hidden. Contains the tab strip, "New Terminal" button (`+` icon), dock controls (collapse, expand, close), and workspace status summary.
- **`TerminalTab`** — Individual tab header in the tab strip. Shows tab name, session status indicator (colored dot), and close button (`×`). Supports drag-to-reorder.
- **`TerminalPanel`** — The resizable content area below the dock bar. Contains the active terminal viewport. A drag handle at the top edge enables vertical resizing.
- **`TerminalViewport`** — Wraps the xterm.js `Terminal` instance. Handles terminal initialization, SSH connection establishment, resize events, and teardown.
- **`TerminalStatusOverlay`** — Transparent overlay shown on top of the terminal viewport during connection, reconnection, or error states.

#### Layout Integration

The Terminal Dock is mounted as a sibling of the `<main>` content area inside `AppLayout`:

```
┌─────────────────────────────────────┐
│  Sidebar  │     Main Content Area   │
│           │  (router <Outlet>)       │
│           │                          │
│           ├──────────────────────────┤
│           │  Terminal Dock           │
│           │  ┌──────────────────────┐│
│           │  │ Tab1 │ Tab2 │ [+]   ││
│           │  ├──────────────────────┤│
│           │  │  $ terminal output   ││
│           │  │  $ _                 ││
│           │  └──────────────────────┘│
└─────────────────────────────────────┘
```

When collapsed, only the `TerminalDockBar` is visible (single row). When hidden, no dock elements render.

#### Terminal Emulator

The terminal emulator uses xterm.js with these addons:

- **`@xterm/addon-fit`** — Auto-fits terminal to container dimensions
- **`@xterm/addon-web-links`** — Makes URLs clickable
- **`@xterm/addon-webgl`** — GPU-accelerated rendering (with fallback to canvas)
- **`@xterm/addon-clipboard`** — Enhanced clipboard support
- **`@xterm/addon-unicode11`** — Full Unicode rendering

#### Connection Flow

1. User triggers "New Terminal" (button click or `Ctrl+`` keyboard shortcut)
2. `TerminalDock` adds a new tab in `pending` state with a spinner indicator
3. `createSession()` is called via `useCreateWorkspaceSession` hook with current viewport-derived cols/rows
4. On success, `getSessionSSHInfo()` is called via the session SSH info endpoint
5. The returned SSH credentials are used to establish a WebSocket-bridged SSH connection to the workspace container
6. The `TerminalViewport` initializes xterm.js and attaches the SSH data stream
7. The tab status transitions to `running` (green dot)
8. SSE subscription starts for the session's status stream

#### Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `` Ctrl+` `` | Toggle dock open/hidden | Global (repo pages) |
| `Ctrl+Shift+`` | New terminal tab | Global (repo pages) |
| `Ctrl+W` | Close active terminal tab | Terminal focused |
| `Ctrl+Tab` | Switch to next terminal tab | Terminal focused |
| `Ctrl+Shift+Tab` | Switch to previous terminal tab | Terminal focused |
| `Ctrl+Shift+C` | Copy selection from terminal | Terminal focused |
| `Ctrl+Shift+V` | Paste into terminal | Terminal focused |
| `Ctrl+Shift++` | Increase font size | Terminal focused |
| `Ctrl+Shift+-` | Decrease font size | Terminal focused |
| `Ctrl+Shift+0` | Reset font size to default (14px) | Terminal focused |

#### Command Palette Entries

| Command | ID | Category | Context |
|---------|----|----------|---------|
| "Terminal: New Terminal" | `terminal.new` | Action | Repo scope, write access |
| "Terminal: Toggle Dock" | `terminal.toggle` | Toggle | Repo scope |
| "Terminal: Close Terminal" | `terminal.close` | Action | Active terminal |
| "Terminal: Close All Terminals" | `terminal.closeAll` | Action | Active terminals exist |
| "Terminal: Focus Terminal" | `terminal.focus` | Action | Dock open, terminal exists |
| "Terminal: Increase Font Size" | `terminal.fontSizeIncrease` | Action | Dock open |
| "Terminal: Decrease Font Size" | `terminal.fontSizeDecrease` | Action | Dock open |
| "Terminal: Reset Font Size" | `terminal.fontSizeReset` | Action | Dock open |
| "Terminal: Rename Tab" | `terminal.rename` | Action | Active terminal |

#### Theme Integration

The terminal emulator uses theme tokens from the Codeplane design system:

- Background: `--color-surface-lowest` (dark terminal background)
- Foreground: `--color-text-primary`
- Cursor: `--color-accent-primary`
- Selection: `--color-accent-secondary` at 30% opacity
- ANSI colors: Mapped to the Codeplane color palette

The terminal theme updates when the user switches between light/dark mode.

#### Responsive Behavior

- **Width < 600px**: Dock expands to full viewport width; tab strip collapses to a dropdown selector
- **Width 600–1024px**: Standard layout; maximum 5 visible tab headers before horizontal scroll
- **Width > 1024px**: Extended layout; maximum 8 visible tab headers before horizontal scroll

#### Error States

| State | Display |
|-------|---------|
| Sandbox unavailable | Toast: "Workspace terminals are not available in this environment" — dock bar shows disabled "New Terminal" button with tooltip |
| Session creation failed | Tab shows inline error with message and "Retry" button |
| SSH info unavailable (no VM) | Tab shows "Provisioning workspace..." with animated spinner; auto-retries |
| SSH connection failed | Terminal viewport shows "Connection failed" overlay with "Retry" and "Close" buttons |
| SSH token expired before connect | Auto-fetches new SSH info; if that fails, shows error overlay |
| Session ended (stopped/failed) | Terminal viewport shows "Session ended" banner with status; tab indicator turns gray/red |
| SSE reconnection in progress | Subtle pulsing indicator on affected tab |
| Network offline | All tabs show "Offline" overlay; auto-reconnect when network returns |

#### Accessibility

- The dock bar and tabs are fully keyboard-navigable (Tab/Shift+Tab, Enter/Space to activate)
- Terminal content is exposed to screen readers via xterm.js accessibility buffer
- Status indicators use both color and icon shape (dot, spinner, X) for color-blind accessibility
- The dock resize handle has an ARIA label and is keyboard-operable (arrow keys adjust height by 20px increments)
- Focus management: opening the dock focuses the terminal; closing returns focus to the previously focused element

### UI-Core Hooks

```typescript
function useTerminalDock(): {
  state: 'open' | 'collapsed' | 'hidden';
  height: number;
  tabs: TerminalTab[];
  activeTabId: string | null;
  open: () => void;
  collapse: () => void;
  hide: () => void;
  setHeight: (px: number) => void;
  newTerminal: () => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  closeAllTabs: () => Promise<void>;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
}

interface TerminalTab {
  id: string;
  sessionId: string;
  workspaceId: string;
  name: string;
  status: 'pending' | 'running' | 'stopped' | 'failed';
  createdAt: string;
}
```

### Documentation

1. **"Using the Terminal Dock"** — End-user guide covering: how to open/close the dock, create and manage terminal tabs, keyboard shortcuts, resize behavior, and how terminals relate to workspace sessions.
2. **"Terminal Dock Keyboard Shortcuts"** — Quick-reference table of all terminal-specific shortcuts.
3. **"Workspace Terminals FAQ"** — Common questions: "What happens when I close a tab?", "Why did my terminal disconnect?", "How do I reconnect?", "What is the idle timeout?", "Can I use the terminal without the dock (e.g., full-page)?".
4. **"Troubleshooting Terminal Connections"** — Guide for common errors: sandbox unavailable, session creation failures, SSH token expiry, network disconnections.
5. **"Terminal Dock Configuration"** — Font size, theme customization, and localStorage keys for programmatic access.

## Permissions & Security

### Authorization Roles

| Role | Can Open Dock | Can Create Terminals | Can Close Terminals | Notes |
|------|--------------|---------------------|--------------------|---------|
| Repository Owner | ✅ | ✅ | ✅ (own sessions) | Full access |
| Repository Admin | ✅ | ✅ | ✅ (own sessions) | Full access |
| Organization Member with Write | ✅ | ✅ | ✅ (own sessions) | Must have write permission on the repo |
| Repository Collaborator (Write) | ✅ | ✅ | ✅ (own sessions) | Explicit collaborator grant |
| Repository Collaborator (Read-Only) | ❌ | ❌ | ❌ | Read access is insufficient; dock is hidden |
| Anonymous / Unauthenticated | ❌ | ❌ | ❌ | Dock is hidden; login required |
| Deploy Key (Write) | ❌ | ❌ | ❌ | Deploy keys are for git transport, not workspace sessions |

### Cross-User Isolation

- Users can only see and interact with their own workspace sessions in the dock
- Attempting to access another user's session returns 404 (not 403) to prevent enumeration
- A user cannot see another user's terminal tabs, even if they share the same repository
- Admin users can only manage their own sessions through the dock; admin session management is available in the admin console, not the dock

### Rate Limiting

- **Session creation ("New Terminal")**: Maximum 10 session creation requests per user per repository per minute
- **SSH info retrieval**: Standard platform rate limit (5,000 requests/hour/user) — each terminal open fetches SSH info once
- **SSE connections**: Maximum 30 new SSE connections per minute per user per repository; soft limit of 10 concurrent SSE connections per session
- **Global SSE cap**: 10,000 total active SSE connections server-wide
- **Concurrent sessions per repository**: Maximum 10 active sessions per user per repo (enforced server-side; dock disables "New Terminal" when limit reached)
- **Global per-user cap**: Maximum 50 active sessions globally per user

### Data Privacy & PII

- SSH access tokens are short-lived (5-minute TTL), single-use, and stored only as SHA-256 hashes
- Raw tokens are never logged, never stored in localStorage, and never persisted after the SSH connection is established
- Terminal input/output is not captured, logged, or stored by the Codeplane platform — it flows directly between xterm.js and the SSH connection
- Session IDs (UUIDs) are exposed in the DOM and localStorage but are not PII and are not guessable
- The dock does not store or cache any workspace filesystem content
- Post-logout, all terminal connections are severed and dock state is cleared from memory (localStorage keys remain for UX continuity on next login but contain no sensitive data)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `TerminalDockOpened` | User opens the dock (from hidden or collapsed state) | `user_id`, `repository_id`, `owner`, `repo`, `trigger` (keyboard/button/palette), `existing_tab_count` |
| `TerminalDockCollapsed` | User collapses the dock to tab bar | `user_id`, `repository_id`, `active_tab_count` |
| `TerminalDockHidden` | User fully hides the dock | `user_id`, `repository_id`, `active_tab_count` |
| `TerminalTabCreated` | New terminal tab created (session running) | `user_id`, `repository_id`, `session_id`, `workspace_id`, `tab_index`, `cols`, `rows`, `is_new_workspace`, `creation_duration_ms`, `trigger` (keyboard/button/palette) |
| `TerminalTabCreateFailed` | Terminal tab creation failed | `user_id`, `repository_id`, `error_type` (sandbox_unavailable/provision_failed/ssh_failed/rate_limited), `trigger` |
| `TerminalTabClosed` | User closes a terminal tab | `user_id`, `repository_id`, `session_id`, `tab_duration_seconds`, `was_last_tab` |
| `TerminalTabSwitched` | User switches active tab | `user_id`, `repository_id`, `from_session_id`, `to_session_id`, `trigger` (click/keyboard) |
| `TerminalTabRenamed` | User renames a tab | `user_id`, `repository_id`, `session_id`, `name_length` |
| `TerminalDockResized` | User changes dock panel height | `user_id`, `repository_id`, `new_height_px`, `viewport_height_px`, `height_ratio` |
| `TerminalReconnected` | Terminal re-establishes connection after dropout | `user_id`, `repository_id`, `session_id`, `disconnect_duration_ms`, `reconnect_attempt_number` |
| `TerminalSessionEnded` | Session ends while terminal is open (SSE event) | `user_id`, `repository_id`, `session_id`, `final_status` (stopped/failed), `session_duration_seconds` |
| `TerminalFontSizeChanged` | User changes terminal font size | `user_id`, `repository_id`, `new_size_px`, `trigger` (keyboard/palette) |

### Properties Attached to All Events

- `timestamp` (ISO 8601)
- `client` (always `"web"`)
- `deployment_mode` (`server` / `daemon` / `desktop`)
- `feature_flag_workspaces` (boolean)

### Funnel Metrics & Success Indicators

1. **Dock Activation Rate**: Percentage of authenticated repo-page visits where the terminal dock is opened at least once. Target: >30% of workspace-eligible users.
2. **Tab Creation Success Rate**: `TerminalTabCreated / (TerminalTabCreated + TerminalTabCreateFailed)`. Target: ≥99%.
3. **Time to Interactive Terminal**: Duration from "New Terminal" click to first byte of terminal output. Target: P50 < 5s, P95 < 15s, P99 < 30s.
4. **Session Duration Distribution**: Histogram of `tab_duration_seconds`. Healthy distribution: peak at 5–30 minutes (active development sessions).
5. **Reconnection Rate**: Percentage of sessions that experience at least one reconnection. Target: <10%.
6. **Multi-Tab Usage**: Average concurrent tabs per dock session. Higher values indicate power-user adoption.
7. **Dock Persistence**: Percentage of users who keep the dock open across page navigations (vs. opening/closing on each page). Higher = better integration with workflow.
8. **Terminal vs. CLI SSH Usage**: Ratio of web terminal sessions to CLI `workspace ssh` sessions. Indicates web terminal adoption relative to CLI.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Terminal dock mounted in layout | `debug` | `user_id`, `repository_id`, `feature_flag_workspaces` |
| Terminal dock opened | `info` | `user_id`, `repository_id`, `trigger`, `existing_tabs` |
| New terminal tab creation started | `info` | `user_id`, `repository_id`, `cols`, `rows` |
| Workspace session created for terminal | `info` | `user_id`, `repository_id`, `session_id`, `workspace_id`, `is_new_workspace` |
| SSH info retrieved for terminal | `info` | `user_id`, `repository_id`, `session_id`, `vm_auto_started` |
| Terminal SSH connection established | `info` | `user_id`, `repository_id`, `session_id`, `connection_duration_ms` |
| Terminal SSH connection failed | `warn` | `user_id`, `repository_id`, `session_id`, `error_message`, `attempt_number` |
| Terminal tab closed (session destroy requested) | `info` | `user_id`, `repository_id`, `session_id`, `tab_duration_seconds` |
| Terminal SSE stream opened | `debug` | `user_id`, `repository_id`, `session_id`, `channel` |
| Terminal SSE stream dropped | `warn` | `user_id`, `repository_id`, `session_id`, `reconnect_attempt` |
| Terminal SSE stream reconnected | `info` | `user_id`, `repository_id`, `session_id`, `disconnect_duration_ms` |
| Terminal session ended (SSE event received) | `info` | `user_id`, `repository_id`, `session_id`, `final_status` |
| Sandbox unavailable — dock disabled | `warn` | `user_id`, `repository_id` |
| Terminal dock unmounted (navigation away) | `debug` | `user_id`, `repository_id`, `active_tabs_cleaned` |
| Tab rename | `debug` | `user_id`, `repository_id`, `session_id`, `new_name_length` |
| Dock resize | `debug` | `user_id`, `repository_id`, `new_height`, `viewport_height` |

**Critical rule**: Raw SSH `access_token`, `command`, and `ssh_connection_info` JSON are **never** logged at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_terminal_dock_open_total` | Counter | `trigger` (keyboard/button/palette) | Total dock open events |
| `codeplane_terminal_tab_created_total` | Counter | `status` (success/failed), `auto_created_workspace` (true/false) | Total terminal tab creation attempts |
| `codeplane_terminal_tab_creation_duration_seconds` | Histogram | `status` | Time from "New Terminal" to interactive terminal (buckets: 0.5, 1, 2, 3, 5, 10, 15, 30, 60) |
| `codeplane_terminal_tabs_active` | Gauge | — | Currently active terminal tabs across all users |
| `codeplane_terminal_tab_duration_seconds` | Histogram | — | Duration of terminal tab sessions (buckets: 10, 30, 60, 300, 600, 1800, 3600, 7200) |
| `codeplane_terminal_ssh_connection_total` | Counter | `result` (success/failed/reconnected) | SSH connection outcomes |
| `codeplane_terminal_ssh_reconnection_total` | Counter | — | Total SSH reconnection attempts |
| `codeplane_terminal_sse_connections_active` | Gauge | — | Active SSE connections for terminal status streams |
| `codeplane_terminal_dock_resize_total` | Counter | — | Dock resize events |
| `codeplane_terminal_errors_total` | Counter | `error_type` (sandbox_unavailable/session_create_failed/ssh_failed/sse_dropped) | Categorized error counter |

### Alerts & Runbooks

#### Alert: `TerminalTabCreationHighErrorRate`
- **Condition**: `rate(codeplane_terminal_tab_created_total{status="failed"}[5m]) / rate(codeplane_terminal_tab_created_total[5m]) > 0.05`
- **Severity**: Warning (>5%), Critical (>20%)
- **Runbook**:
  1. Check error_type distribution in `codeplane_terminal_errors_total` to identify dominant failure mode.
  2. `sandbox_unavailable`: Verify container sandbox runtime is running and reachable. Check server startup logs for sandbox client initialization. Restart sandbox process if necessary.
  3. `session_create_failed`: Check workspace service logs for provisioning errors. Verify database connectivity. Check for disk/memory exhaustion on sandbox host.
  4. `ssh_failed`: Check SSH server health. Verify SSH port is open and accessible. Check token generation and validation path.
  5. Check `codeplane_workspace_session_created_total` to confirm whether the issue is terminal-dock-specific or affects all session creation paths.
  6. Escalate if errors persist after sandbox restart.

#### Alert: `TerminalTabCreationHighLatency`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_terminal_tab_creation_duration_seconds_bucket[5m])) > 15`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workspace_container_provision_duration_seconds` — slow container provisioning is the most common cause.
  2. Check if many sessions are triggering workspace auto-resume from suspended state. Compare `codeplane_workspace_resumed_for_session_total` rate.
  3. Check sandbox host CPU, memory, and disk I/O.
  4. Check database query latency for workspace/session lookups.
  5. Consider pre-warming workspaces for active repositories.

#### Alert: `TerminalSSEConnectionDropRate`
- **Condition**: `rate(codeplane_terminal_ssh_reconnection_total[5m]) > 1` (more than 1 reconnection/sec sustained over 5 min)
- **Severity**: Warning
- **Runbook**:
  1. Check network stability between clients and server (load balancer logs, proxy timeout settings).
  2. Verify SSE keep-alive interval (15s) is shorter than any intermediate proxy timeout.
  3. Check `codeplane_sse_connections_active` for connection saturation approaching global limit.
  4. Check PostgreSQL LISTEN/NOTIFY health if live updates are failing.
  5. If using PGLite/daemon mode, reconnections are expected (documented limitation).

#### Alert: `TerminalDockActiveTabsHigh`
- **Condition**: `codeplane_terminal_tabs_active > 500` for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. Verify workspace idle cleanup scheduler is running and cleaning up stale sessions.
  2. Check for automation or bots creating terminal sessions without destroying them.
  3. Review per-user session counts to identify outliers.
  4. If legitimate organic growth, scale sandbox capacity.

#### Alert: `SandboxUnavailableForTerminals`
- **Condition**: Any `codeplane_terminal_errors_total{error_type="sandbox_unavailable"}` increment in 5 minutes
- **Severity**: Critical
- **Runbook**:
  1. The container sandbox runtime is completely unreachable — blocks ALL terminal creation.
  2. Check sandbox/container runtime process health (Docker/Podman daemon status).
  3. Check service registry initialization logs for sandbox client configuration.
  4. Verify network connectivity between API server and sandbox host.
  5. If sandbox is intentionally disabled for this environment, ensure the `workspaces` feature flag is set to `false` so the dock is hidden.

### Error Cases & Failure Modes

| Error Case | User Impact | Recovery |
|------------|-------------|----------|
| Sandbox runtime unavailable | Cannot create any terminals; dock shows disabled state | Admin restarts sandbox; dock auto-recovers on next attempt |
| Session creation rate limited (429) | "New Terminal" blocked temporarily | Wait and retry; toast shows "Too many terminals, try again shortly" |
| Workspace provisioning timeout | Tab stuck in pending state | Auto-retry with exponential backoff; user can close tab and retry |
| SSH token expired before connection | Terminal fails to connect | Auto-fetch new SSH info and retry (transparent to user) |
| SSH server unreachable | Terminal shows connection error | Retry button; admin checks SSH server health |
| SSE connection dropped | Status indicator may be stale | Auto-reconnect with backoff; initial event on reconnect provides current state |
| Network offline | All terminals show offline overlay | Auto-reconnect when network returns |
| localStorage quota exceeded | Dock state not persisted | Graceful fallback to defaults; no crash |
| xterm.js WebGL context lost | Terminal rendering breaks | Fallback to canvas renderer; auto-reinitialize |

## Verification

### API Integration Tests (Session Lifecycle via Terminal Dock Flow)

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 1 | Create session with viewport-derived dimensions (cols=132, rows=43) | 201, session running with cols=132, rows=43 |
| 2 | Create session with empty body (dock defaults) | 201, session running with cols=80, rows=24 |
| 3 | Create session auto-creates primary workspace | 201, new workspace created, session running |
| 4 | Create session on suspended workspace auto-resumes | 201, workspace=running, session=running |
| 5 | Get SSH info for new session | 200, all fields populated, command format valid |
| 6 | SSH info generates unique token each call | Two calls → two different access_token values |
| 7 | SSH token has 5-minute TTL | expires_at ≈ now + 300s (±2s tolerance) |
| 8 | Destroy session via dock close | 204, session status=stopped |
| 9 | Destroy last session auto-suspends workspace | Workspace transitions to suspended |
| 10 | Destroy one of multiple sessions keeps workspace running | Other sessions unaffected, workspace stays running |
| 11 | SSE stream delivers initial status on subscribe | First event has current session status |
| 12 | SSE stream delivers stopped event on session destroy | `{"session_id":"...","status":"stopped"}` received |
| 13 | SSE keep-alive received within 20 seconds | `: keep-alive` comment received |
| 14 | Create 10 sessions (max per repo) | All 201, all sessions running |
| 15 | Create 11th session (exceeds per-repo cap) | 429 or appropriate error |
| 16 | Session with cols=1 (minimum valid) | 201, cols=1 |
| 17 | Session with rows=1 (minimum valid) | 201, rows=1 |
| 18 | Session with cols=500 (maximum valid) | 201, cols=500 |
| 19 | Session with rows=500 (maximum valid) | 201, rows=500 |
| 20 | Session with cols=501 (exceeds maximum) | 400 or clamped to 500 |
| 21 | Session with rows=501 (exceeds maximum) | 400 or clamped to 500 |
| 22 | Session with cols=-1 defaults to 80 | 201, cols=80 |
| 23 | Session with rows=-1 defaults to 24 | 201, rows=24 |
| 24 | Create session without auth | 401 |
| 25 | Create session as read-only user | 403 |
| 26 | Create session on nonexistent repo | 404 |
| 27 | SSH info for nonexistent session | 404 |
| 28 | SSH info for other user's session | 404 (not 403) |
| 29 | Destroy nonexistent session (idempotent) | 204 |
| 30 | Destroy already-stopped session (idempotent) | 204 |
| 31 | SSE stream for nonexistent session | 404 |
| 32 | SSE stream without auth | 401 |
| 33 | Concurrent SSH info requests return independent tokens | 5 concurrent → 5 unique tokens, all valid |
| 34 | Session response schema validation | All required fields present with correct types |
| 35 | Sandbox unavailable returns 500 | 500, `"sandbox client unavailable"` |

### Web UI (Playwright) E2E Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 36 | Terminal dock bar is visible on repository page when logged in with write access | Dock bar element present in DOM |
| 37 | Terminal dock bar is NOT visible on repository page for read-only user | Dock bar element absent |
| 38 | Terminal dock bar is NOT visible on non-repo pages (user settings) | Dock bar absent |
| 39 | Terminal dock bar is NOT visible when workspaces feature flag is disabled | Dock bar absent |
| 40 | "New Terminal" button creates a terminal tab | Tab appears, status transitions pending → running |
| 41 | Terminal tab shows running status (green indicator) after creation | Green dot visible on tab |
| 42 | Terminal viewport renders xterm.js content after connection | Terminal text content is visible |
| 43 | Multiple tabs can be created (up to 10) | 10 tabs created, all with running indicators |
| 44 | Clicking a tab switches the active terminal viewport | Active tab highlighted, viewport content changes |
| 45 | Closing a tab via × button destroys the session | Tab removed, session destroy API called |
| 46 | Closing last tab collapses dock to "No active terminals" state | Dock shows empty state message |
| 47 | Dock can be collapsed by clicking collapse button | Dock collapses to tab bar only |
| 48 | Dock can be expanded by clicking expand button | Dock expands to show terminal viewport |
| 49 | Dock can be hidden by clicking close button | Dock disappears entirely |
| 50 | Dock can be reopened via `` Ctrl+` `` keyboard shortcut | Dock appears and terminal is focused |
| 51 | Dock height persists after page navigation within repo | Navigate away and back; height is restored |
| 52 | Dock open/collapsed/hidden state persists after page navigation | Navigate away and back; state is restored |
| 53 | Dock resize by dragging top edge changes height | Panel height adjusts, min=120px enforced |
| 54 | Dock resize does not exceed 80% viewport height | Dragging beyond 80% clamps to maximum |
| 55 | Terminal tab shows error state when sandbox is unavailable | Error message and retry button visible |
| 56 | Session status badge updates in real time via SSE | Destroy session externally → tab status updates to stopped |
| 57 | Post-logout dock is hidden and connections severed | After logout, dock disappears; no console errors |
| 58 | Command palette "Terminal: New Terminal" creates tab | Open palette, select command, tab created |
| 59 | Command palette "Terminal: Toggle Dock" toggles visibility | Dock toggles between open and hidden |
| 60 | Tab rename via double-click on tab name | Inline editor appears, new name saved |
| 61 | Tab rename with empty string falls back to auto-generated name | Tab shows "Terminal N" |
| 62 | Tab rename with 64-character name (max valid) | Name saved and displayed (truncated in UI if needed) |
| 63 | Tab rename with 65-character name (exceeds max) | Name truncated to 64 characters |
| 64 | Terminal handles viewport resize correctly | Resize browser window → terminal cols/rows adjust |
| 65 | Terminal copy/paste works (Ctrl+Shift+C / Ctrl+Shift+V) | Text copied from terminal, pasted into terminal |
| 66 | Keyboard shortcut Ctrl+Shift+` creates new terminal | New tab appears |
| 67 | Keyboard shortcut Ctrl+Tab switches tabs | Active tab changes to next |
| 68 | Keyboard shortcut Ctrl+W closes active tab | Tab closed, session destroyed |
| 69 | Font size increase via Ctrl+Shift++ | Terminal font size increases |
| 70 | Font size decrease via Ctrl+Shift+- | Terminal font size decreases |
| 71 | Font size reset via Ctrl+Shift+0 | Terminal font returns to 14px default |
| 72 | Navigating to different repo scopes dock to new repo | Tabs from previous repo hidden; new repo context active |
| 73 | Returning to previous repo restores previous dock state | Previous tabs reappear (if sessions still running) |
| 74 | Terminal renders correctly in dark mode | Theme colors match dark mode palette |
| 75 | Terminal renders correctly in light mode | Theme colors match light mode palette |
| 76 | Dock is accessible via keyboard navigation only (no mouse) | All dock controls reachable via Tab key |
| 77 | Multiple browser tabs with same repo show independent dock state | Each tab has its own dock state |
| 78 | SSE reconnection after network disruption restores status | Simulate disconnect → reconnect → status badge accurate |

### CLI E2E Tests (Cross-Surface Validation)

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 79 | `codeplane workspace create` session is visible in web UI dock | Create via CLI → web UI shows session in dock context |
| 80 | Session destroyed via CLI is reflected in web UI dock | Destroy via CLI → web UI tab shows stopped status |
| 81 | `codeplane workspace ssh` creates session compatible with dock | SSH session via CLI → same session visible in web workspace list |
| 82 | `codeplane workspace list --json` returns sessions matching dock state | JSON output matches sessions shown in dock |

### Boundary & Stress Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 83 | 10 concurrent terminal tabs all functional | All 10 tabs rendering, all sessions running |
| 84 | Rapid tab open/close cycle (10 tabs in 5 seconds) | All sessions created and destroyed cleanly, no orphans |
| 85 | Dock state persists through 50 page navigations | localStorage read/write remains consistent |
| 86 | Terminal session survives 30 minutes with keep-alive | Session still running, SSE still connected |
| 87 | Paste 100KB of text into terminal | Text accepted (truncated with warning) |
| 88 | Paste 101KB of text into terminal | Text truncated to 100KB with visible warning |
| 89 | Terminal with cols=500, rows=500 (maximum valid dimensions) | Terminal renders correctly |
| 90 | Dock panel at minimum height (120px) renders terminal | Terminal visible and functional |
| 91 | Dock panel at maximum height (80% viewport) renders correctly | Layout does not overflow |
| 92 | LocalStorage quota exceeded gracefully handled | Dock falls back to defaults, no crash |
| 93 | xterm.js WebGL context loss triggers canvas fallback | Terminal continues rendering after context loss |
| 94 | 50 concurrent SSE connections for different sessions all receive events | All connections active, all receive destroy events |
| 95 | SSE connection survives for 30 minutes with keep-alive pings | Keep-alive received every 15s, connection remains open |

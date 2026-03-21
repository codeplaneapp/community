# WORKSPACE_SSH_ACCESS

Specification for WORKSPACE_SSH_ACCESS.

## High-Level User POV

Workspace SSH Access lets developers open a secure shell session directly into a Codeplane workspace container from any surface — the CLI, web terminal, TUI, or editor — without managing SSH keys, configuring hostnames, or copy-pasting connection strings.

When a developer wants to work inside a workspace, Codeplane handles everything behind the scenes: if no workspace exists for the repository yet, one is created and provisioned automatically. The platform waits for the container to become ready, generates a short-lived access credential, and either drops the developer straight into an interactive SSH shell (in the CLI) or surfaces the connection details for use by the web terminal, TUI, or editor integration. The entire flow — from "I want a shell" to typing commands inside the workspace — takes seconds, not minutes.

For agent-assisted workflows, the same SSH access path powers the `workspace issue` automation: Codeplane creates a workspace, establishes an SSH tunnel, bootstraps the development environment with jj and Node.js, seeds Claude Code credentials, and executes an AI agent that works on the issue inside the sandbox. When the agent finishes, the CLI can automatically extract the resulting changes and create a landing request. This means SSH access isn't just a human convenience — it's the runtime transport for Codeplane's agent-in-a-sandbox architecture.

The access credential is intentionally ephemeral (5 minutes) and single-use. If a developer's terminal disconnects and they reconnect, Codeplane generates a fresh credential. There is no persistent SSH password or long-lived token to leak. The workspace itself remains available (subject to idle timeout) even after the credential expires, so reconnecting is seamless.

Workspace SSH also supports the `workspace view` command, which shows the workspace status, uptime, SSH command, host, port, and username in a single glance. Developers can watch workspace status changes in real time through SSE streams, and the platform automatically suspends idle workspaces and cleans up stale sessions without manual intervention.

## Acceptance Criteria

### Definition of Done

- [ ] A user can SSH into a workspace from the CLI with `codeplane workspace ssh [id]` and receive an interactive shell
- [ ] If no workspace ID is provided, the CLI auto-selects a running workspace or creates one
- [ ] The SSH connection uses a short-lived (5-minute), single-use access token — never a permanent credential
- [ ] The access token is stored as a SHA-256 hash in the database; the raw token is never persisted
- [ ] The workspace container is auto-started if suspended when SSH info is requested
- [ ] The `workspace view` command displays SSH connection info (command, host, port, username) when the workspace is running
- [ ] SSE streams for both workspace and session status are functional and deliver real-time updates
- [ ] Session destruction triggers workspace suspension when no other active sessions remain
- [ ] Idle workspaces are automatically suspended after the configured timeout (default: 30 minutes)
- [ ] Stale pending workspaces (no VM ID after 5 minutes) are marked as failed
- [ ] The web terminal, TUI, and editor integrations can retrieve SSH connection info via the API

### Edge Cases

- [ ] Requesting SSH info for a workspace with no provisioned VM returns `null` (not an error)
- [ ] Requesting SSH info when the sandbox client is unavailable returns a `500 Internal Server Error` with message `"sandbox client unavailable"`
- [ ] Requesting SSH info for a non-existent workspace returns `404`
- [ ] Requesting SSH info for a workspace belonging to a different user returns `404` (not `403`, to prevent enumeration)
- [ ] Requesting SSH info for a workspace belonging to a different repository returns `404`
- [ ] Creating a session with `cols=0` or `rows=0` defaults to `80x24`
- [ ] Creating a session with negative `cols` or `rows` defaults to `80x24`
- [ ] Creating a session without a `workspace_id` auto-creates or reuses the primary workspace
- [ ] Destroying an already-stopped session is idempotent (no error)
- [ ] Destroying a session for a non-existent workspace is idempotent (no error)
- [ ] Multiple concurrent SSH info requests for the same workspace each generate independent tokens
- [ ] Expired tokens are cleaned up and cannot be reused
- [ ] Used tokens cannot be replayed (single-use enforcement via `used_at` column)
- [ ] The CLI SSH poll timeout (default: 120s) fires a descriptive error if the workspace never becomes SSH-ready
- [ ] The CLI SSH poll handles transient HTTP errors (404, 409, 423, 425, 429, 502, 503, 504) with retry; non-retryable errors (401, 403) fail immediately
- [ ] An empty or whitespace-only workspace ID in the URL path returns `400`
- [ ] Workspace fork via SSH returns `501` with a message directing to Codeplane Cloud

### Boundary Constraints

- [ ] Sandbox access token TTL: exactly 300,000 ms (5 minutes), no configuration override
- [ ] Sandbox access token format: UUID v4 (36 characters)
- [ ] Token hash algorithm: SHA-256
- [ ] Default SSH host: `localhost`
- [ ] Default SSH username: `root`
- [ ] Default idle timeout: 1800 seconds (30 minutes)
- [ ] Stale pending threshold: 300 seconds (5 minutes)
- [ ] CLI poll interval: configurable via `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` (default: 3000ms)
- [ ] CLI poll timeout: configurable via `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` (default: 120000ms)
- [ ] CLI SSH connect timeout: configurable via `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS` (default: 15s)
- [ ] Pagination max per_page: 100
- [ ] Pagination default per_page: 30
- [ ] Session cols/rows range: any positive integer accepted; 0 or negative defaults to 80/24
- [ ] Workspace name: may be empty string (auto-named or primary workspace)
- [ ] SSH command format: `ssh {vm_id}+{username}:{token}@{host}`

## Design

### API Shape

#### Workspace SSH Connection Info

```
GET /api/repos/:owner/:repo/workspaces/:id/ssh
```

**Response** (200):
```json
{
  "workspace_id": "uuid",
  "session_id": "",
  "vm_id": "container-id",
  "host": "localhost",
  "ssh_host": "container-id+root@localhost",
  "username": "root",
  "port": 22,
  "access_token": "uuid-v4-raw-token",
  "command": "ssh container-id+root:uuid-v4-raw-token@localhost"
}
```

**Error responses**:
- `400` — workspace id is required (empty/whitespace path param)
- `404` — workspace not found, or workspace has no VM provisioned
- `500` — sandbox client unavailable

#### Session SSH Connection Info

```
GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh
```

**Response** (200): Same shape as workspace SSH info, but `session_id` is populated. Additionally:
- Auto-starts the workspace container if it is stopped
- Persists SSH connection info to the session record
- Updates session status to `running`
- Emits SSE notification for session status change

#### Session CRUD

```
POST /api/repos/:owner/:repo/workspace/sessions
```

**Request body**:
```json
{
  "cols": 120,
  "rows": 40,
  "workspace_id": "uuid (optional)"
}
```

**Response** (201): `WorkspaceSessionResponse`

```
GET /api/repos/:owner/:repo/workspace/sessions/:id
GET /api/repos/:owner/:repo/workspace/sessions (paginated)
POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy
```

#### SSE Streams

```
GET /api/repos/:owner/:repo/workspaces/:id/stream
GET /api/repos/:owner/:repo/workspace/sessions/:id/stream
```

Both streams emit an initial status event followed by live PostgreSQL LISTEN/NOTIFY events. Event types: `workspace.status` and `workspace.session` respectively.

### SDK Shape

The `WorkspaceService` class in `@codeplane/sdk` exposes:

- `getWorkspaceSSHConnectionInfo(workspaceID, repositoryID, userID)` → `WorkspaceSSHConnectionInfo | null`
- `getSSHConnectionInfo(sessionID, repositoryID, userID)` → `WorkspaceSSHConnectionInfo | null`
- `createSession(input)` → `WorkspaceSessionResponse`
- `getSession(sessionID, repositoryID, userID)` → `WorkspaceSessionResponse | null`
- `listSessions(repositoryID, userID, page, perPage)` → `{ sessions, total }`
- `destroySession(sessionID, repositoryID, userID)` → `void`
- `cleanupIdleWorkspaces()` → `void`
- `cleanupIdleSessions()` → `void`
- `cleanupStalePendingWorkspaces()` → `void`

### CLI Command

#### `codeplane workspace ssh [id]`

**Behavior**:
1. If `id` is provided, use that workspace
2. If `id` is omitted:
   a. List workspaces for the repo
   b. Prefer a running workspace
   c. Fall back to any existing workspace
   d. If none exist, create one automatically
3. Poll `GET .../workspaces/:id/ssh` until `command` field is present (up to 120s, every 3s)
4. Retryable HTTP statuses: `{404, 409, 423, 425, 429, 502, 503, 504}`
5. Non-retryable statuses (401, 403, etc.) fail immediately
6. On success, spawn SSH with hardened flags:
   - `-o BatchMode=yes`
   - `-o StrictHostKeyChecking=accept-new`
   - `-o ConnectTimeout=15`
   - `-o UserKnownHostsFile=~/.codeplane/ssh/known_hosts`
   - `-o LogLevel=ERROR`
7. Pass control to the interactive SSH session with inherited stdio
8. On macOS and Linux, wrap SSH in `script` for proper PTY allocation

**Options**: `--repo OWNER/REPO` — override repository resolution

#### `codeplane workspace view <id>`

Fetches workspace details and, if running, SSH connection info. Displays status, SSH command, host, port, username, uptime, persistence, snapshot ID, and idle timeout.

#### `codeplane workspace watch <id>`

Connects to the workspace SSE stream and prints status change events in real time.

#### `codeplane workspace issue <issue-number>`

Orchestrated automation path:
1. Fetch the issue
2. Create or reuse a workspace
3. Poll SSH readiness
4. Bootstrap jj and Node.js in the workspace
5. Seed Claude Code authentication credentials
6. Execute Claude Code with the issue prompt
7. Extract resulting jj change IDs
8. Create a landing request if changes were produced

### Web UI Design

- **Terminal dock**: A docked terminal panel at the bottom of the repository workbench. When opened, it creates a session via `POST .../workspace/sessions`, fetches SSH info, and establishes the connection.
- **Workspace detail page**: Shows workspace status, SSH command (copy-to-clipboard), host, port, username, and a "Connect" button that opens the terminal dock.
- **Workspace list**: Displays all workspaces with status badges (running/suspended/failed/pending) and quick-action buttons for SSH, suspend, resume, and delete.
- **SSE-backed status indicators**: Workspace and session status badges update in real time via the stream endpoints.

### TUI UI

- **Workspace list screen**: Table of workspaces with status, name, and creation date. Keybindings: `s` SSH, `S` suspend, `R` resume, `d` delete, `n` new.
- **Workspace detail screen**: Full workspace info with SSH connection section. Keybindings: `c` copy SSH command, `y` copy host, `r` refresh SSH info (generates new token), `Enter` connect.
- **SSH connection section**: Displays host, port, username, SSH command, and token countdown. Auto-refreshes token before expiry.

### Editor Integrations

**VS Code**:
- `Codeplane: Connect to Workspace` command that creates/reuses a workspace and opens an integrated terminal with the SSH connection
- Status bar item showing workspace status (running/suspended/none)
- Workspace picker in the sidebar

**Neovim**:
- `:CodeplaneWorkspaceSSH` command that opens a terminal buffer with the SSH connection
- Statusline component showing workspace status

### Documentation

1. **Getting Started with Workspaces**: Covers creating a workspace, connecting via SSH, and the auto-create behavior
2. **CLI Workspace Reference**: Full command reference for `workspace create`, `workspace ssh`, `workspace view`, `workspace delete`, `workspace watch`, `workspace issue`, `workspace fork`, `workspace snapshots`
3. **Workspace SSH Security Model**: Explains ephemeral tokens, 5-minute TTL, single-use enforcement, and SHA-256 storage
4. **Workspace Lifecycle**: Covers idle timeout, auto-suspend, auto-cleanup, and state transitions (pending → starting → running → suspended → failed → deleted)
5. **Agent-in-a-Sandbox Guide**: Walkthrough of `workspace issue` automation, Claude Code bootstrapping, and landing request creation
6. **Environment Variables Reference**: Documents `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS`, `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS`, `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS`, `CODEPLANE_WORKSPACE_KNOWN_HOSTS_FILE`, `CODEPLANE_WORKSPACE_CLAUDE_TIMEOUT_MS`

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member | Read-Only | Anonymous |
|--------|-------|-------|--------|-----------|----------|
| Create workspace | ✅ | ✅ | ✅ | ❌ | ❌ |
| Get workspace SSH info | ✅ | ✅ | ✅ | ❌ | ❌ |
| Get session SSH info | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create session | ✅ | ✅ | ✅ | ❌ | ❌ |
| List workspaces | ✅ | ✅ | ✅ | ✅ | ❌ |
| View workspace | ✅ | ✅ | ✅ | ✅ | ❌ |
| Suspend workspace | ✅ | ✅ | ✅ (own) | ❌ | ❌ |
| Resume workspace | ✅ | ✅ | ✅ (own) | ❌ | ❌ |
| Delete workspace | ✅ | ✅ | ✅ (own) | ❌ | ❌ |
| Destroy session | ✅ | ✅ | ✅ (own) | ❌ | ❌ |
| Watch workspace stream | ✅ | ✅ | ✅ | ✅ | ❌ |

**Scope isolation**: All workspace queries are triple-scoped to `(workspace.id, repository_id, user_id)`. A user can never access another user's workspace even if they know the workspace ID. Cross-user workspace access returns `404` to prevent enumeration.

**Deploy keys**: Deploy keys authenticate git operations only and cannot create sessions or access workspace SSH. This is enforced in the SSH server's principal resolution.

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `GET .../workspaces/:id/ssh` | 30 requests | per minute per user |
| `GET .../workspace/sessions/:id/ssh` | 30 requests | per minute per user |
| `POST .../workspace/sessions` | 10 requests | per minute per user |
| `POST .../workspaces` | 5 requests | per minute per user |
| `GET .../workspaces/:id/stream` | 5 concurrent connections | per user |

The SSH info endpoints have a higher limit because the CLI polls them every 3 seconds during workspace provisioning. A user polling at 3s intervals uses 20 requests/minute per workspace.

### Data Privacy & PII

- **Raw access tokens**: Never persisted in the database. Only the SHA-256 hash is stored. The raw token appears exactly once in the API response and in the CLI's SSH command invocation.
- **Token in SSH command**: The raw token is embedded in the SSH username field (`vm+user:token@host`). It is visible in process listings (`ps`) for the duration of the SSH connection. This is acceptable because the token is single-use and expires in 5 minutes.
- **SSH connection info in session**: The full SSH connection info (including raw token) is persisted to the session's `ssh_connection_info` column. This is used for session replay. The info should be encrypted at rest and purged when the session is destroyed.
- **Known hosts file**: Workspace SSH fingerprints are stored in `~/.codeplane/ssh/known_hosts`, isolated from the user's system SSH known hosts.
- **Claude auth credentials**: When seeded to a workspace, credentials are written to `/home/developer/.codeplane/claude-env.sh` with `600` permissions, owned by the `developer` user.

## Telemetry & Product Analytics

### Key Business Events

| Event | Properties | Trigger |
|-------|------------|---------|
| `workspace.ssh.info_requested` | `workspace_id`, `session_id`, `user_id`, `repo_id`, `source` (workspace|session), `vm_state_before` (running|stopped) | SSH info endpoint called |
| `workspace.ssh.connected` | `workspace_id`, `user_id`, `repo_id`, `client` (cli|web|tui|vscode|nvim), `poll_duration_ms`, `auto_created` (bool) | SSH session established |
| `workspace.ssh.disconnected` | `workspace_id`, `session_id`, `user_id`, `duration_ms`, `exit_code` | SSH session ended |
| `workspace.ssh.poll_timeout` | `workspace_id`, `user_id`, `repo_id`, `poll_duration_ms`, `last_error` | CLI poll exceeded timeout |
| `workspace.ssh.token_generated` | `workspace_id`, `user_id`, `token_type` | Access token created |
| `workspace.ssh.token_expired_unused` | `workspace_id`, `token_id` | Token expired without being used |
| `workspace.session.created` | `session_id`, `workspace_id`, `user_id`, `repo_id`, `cols`, `rows`, `auto_workspace` (bool) | Session created |
| `workspace.session.destroyed` | `session_id`, `workspace_id`, `user_id`, `duration_ms`, `triggered_suspend` (bool) | Session destroyed |
| `workspace.auto_suspended` | `workspace_id`, `idle_duration_ms`, `active_sessions_at_timeout` | Idle cleanup ran |
| `workspace.issue.completed` | `workspace_id`, `issue_id`, `user_id`, `change_ids_count`, `landing_request_created` (bool), `claude_duration_ms` | `workspace issue` flow completed |

### Funnel Metrics

1. **SSH Access Funnel**: `workspace.created` → `workspace.ssh.info_requested` → `workspace.ssh.connected` → (productive session > 60s)
2. **Issue-to-Landing Funnel**: `workspace.issue.started` → `workspace.ssh.connected` → `workspace.issue.completed` → `landing_request.created`
3. **Reconnection Rate**: % of workspaces with > 1 `ssh.connected` event (indicates real repeated usage)
4. **Auto-Create Rate**: % of `workspace.ssh.connected` events where `auto_created=true` (indicates zero-friction UX)

### Success Indicators

- P50 time from `ssh.info_requested` to `ssh.connected` < 10 seconds for running workspaces
- P50 time from `ssh.info_requested` to `ssh.connected` < 45 seconds for cold-start workspaces
- Token expiry-before-use rate < 5%
- Poll timeout rate < 2%
- Auto-suspend saves > 60% of workspace hours vs always-on

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------||
| SSH info requested | `info` | `workspace_id`, `user_id`, `repo_id`, `source` |
| Token generated | `info` | `workspace_id`, `user_id`, `token_type`, `ttl_ms` (NEVER log raw token) |
| Token validated | `info` | `workspace_id`, `token_id`, `user_id` |
| Token expired/rejected | `warn` | `workspace_id`, `token_id`, `reason` (expired|used|not_found) |
| VM auto-started for SSH | `info` | `workspace_id`, `vm_id`, `previous_state` |
| VM start failed | `error` | `workspace_id`, `vm_id`, `error_message`, `error_code` |
| Session created | `info` | `session_id`, `workspace_id`, `user_id`, `cols`, `rows` |
| Session destroyed | `info` | `session_id`, `workspace_id`, `triggered_suspend` |
| Workspace auto-suspended | `info` | `workspace_id`, `idle_seconds`, `reason` |
| Stale workspace failed | `warn` | `workspace_id`, `pending_seconds` |
| Sandbox client unavailable | `error` | `endpoint`, `user_id` |
| CLI poll retry | `debug` | `workspace_id`, `attempt`, `status_code`, `elapsed_ms` |
| CLI poll timeout | `error` | `workspace_id`, `total_duration_ms`, `attempts` |
| SSH process spawned | `debug` | `workspace_id`, `ssh_flags` (NEVER log token) |
| SSH process exited | `info` | `workspace_id`, `exit_code`, `duration_ms` |

### Prometheus Metrics

**Counters**:
- `codeplane_workspace_ssh_info_requests_total{source,status}` — SSH info endpoint calls
- `codeplane_workspace_ssh_tokens_generated_total{type}` — tokens generated
- `codeplane_workspace_ssh_tokens_expired_unused_total` — tokens that expired without use
- `codeplane_workspace_ssh_tokens_used_total` — tokens successfully used
- `codeplane_workspace_sessions_created_total{auto_workspace}` — sessions created
- `codeplane_workspace_sessions_destroyed_total{trigger}` — sessions destroyed (manual, idle, error)
- `codeplane_workspace_auto_suspensions_total` — idle auto-suspensions
- `codeplane_workspace_stale_failures_total` — stale pending workspace failures
- `codeplane_workspace_vm_starts_total{trigger,status}` — VM start attempts

**Histograms**:
- `codeplane_workspace_ssh_info_duration_seconds` — time to generate SSH info (including potential VM start)
- `codeplane_workspace_ssh_poll_duration_seconds` — client-side poll duration until SSH ready
- `codeplane_workspace_session_duration_seconds` — session lifetime from create to destroy
- `codeplane_workspace_vm_cold_start_duration_seconds` — time from VM start to SSH-ready
- `codeplane_workspace_token_age_at_use_seconds` — how old tokens are when used

**Gauges**:
- `codeplane_workspace_active_sessions` — currently active sessions
- `codeplane_workspace_running_count` — currently running workspaces
- `codeplane_workspace_pending_tokens` — unexpired, unused tokens in the system

### Alerts

#### `WorkspaceSSHInfoHighErrorRate`
**Condition**: `rate(codeplane_workspace_ssh_info_requests_total{status="error"}[5m]) / rate(codeplane_workspace_ssh_info_requests_total[5m]) > 0.1`
**Severity**: Warning
**Runbook**:
1. Check `codeplane_workspace_vm_starts_total{status="failure"}` — if elevated, the container runtime (Docker/Podman) may be unhealthy
2. Run `docker ps` / `podman ps` on the host to verify container runtime is responsive
3. Check disk space — container images require disk
4. Check `sandbox client unavailable` error logs — if present, the sandbox client failed initialization
5. Restart the Codeplane server process if sandbox client is stuck

#### `WorkspaceVMColdStartSlow`
**Condition**: `histogram_quantile(0.95, codeplane_workspace_vm_cold_start_duration_seconds) > 60`
**Severity**: Warning
**Runbook**:
1. Check host resource utilization (CPU, memory, disk I/O)
2. Verify the workspace container image is pulled and cached locally: `docker images ghcr.io/codeplane-ai/workspace`
3. Check for Docker/Podman resource limits (max containers, cgroup limits)
4. If image is not cached, pull it manually: `docker pull ghcr.io/codeplane-ai/workspace:latest`
5. Review healthcheck timing — SSH port check runs every 5s with 10 retries (50s max)

#### `WorkspaceTokenExpiryRateHigh`
**Condition**: `rate(codeplane_workspace_ssh_tokens_expired_unused_total[1h]) / rate(codeplane_workspace_ssh_tokens_generated_total[1h]) > 0.2`
**Severity**: Warning
**Runbook**:
1. This indicates users are requesting SSH info but not connecting. Check if workspaces are failing to start.
2. Review `codeplane_workspace_vm_starts_total{status="failure"}` for container provisioning failures
3. Check CLI logs for `poll_timeout` events — users may be giving up
4. Verify SSH port is reachable from client networks (firewall, security group rules)
5. If token TTL (5 minutes) is too short for cold starts, this is a product decision to extend

#### `WorkspaceStaleCountHigh`
**Condition**: `rate(codeplane_workspace_stale_failures_total[15m]) > 3`
**Severity**: Warning
**Runbook**:
1. Stale workspaces are stuck in pending/starting without a VM ID for > 5 minutes
2. Check container runtime connectivity — `docker info` / `podman info`
3. Review workspace creation logs for `provisionAndActivateWorkspace` failures
4. Check if workspace image exists and is pullable
5. Verify database connectivity — the workspace record may be created but the VM provision step fails silently

#### `WorkspaceSandboxUnavailable`
**Condition**: Any `sandbox client unavailable` error log in the last 5 minutes
**Severity**: Critical
**Runbook**:
1. The container sandbox client is `null`, meaning no Docker or Podman runtime was detected at server startup
2. Verify Docker/Podman is installed: `which docker` or `which podman`
3. Verify the Docker socket is accessible: `docker info`
4. Check server startup logs for sandbox client initialization errors
5. Restart the Codeplane server — sandbox client is initialized once at boot

#### `WorkspaceActiveSessionsHigh`
**Condition**: `codeplane_workspace_active_sessions > 100`
**Severity**: Warning
**Runbook**:
1. Check if idle session cleanup is running (cleanup scheduler)
2. Verify cleanup cron is not stuck — check server logs for `cleanupIdleSessions` execution
3. Review `codeplane_workspace_session_duration_seconds` histogram — sessions may be legitimately long
4. If cleanup is running but sessions aren't closing, check for orphaned sessions where the SSH process has exited but `destroySession` was never called
5. Manually trigger cleanup or restart the server

### Error Cases & Failure Modes

| Error Case | HTTP Status | Behavior |
|------------|-------------|----------|
| Sandbox client not initialized | 500 | Server returns `sandbox client unavailable` |
| Workspace not found | 404 | No error logged (normal for ownership scoping) |
| VM not provisioned | null response (→404) | Workspace exists but has no container yet |
| Container runtime down | 500 | VM start/inspect fails; logged as error |
| Container start fails | 500 | Workspace marked as failed; SSE notification emitted |
| Database write fails (token) | 500 | Token not generated; no SSH info returned |
| SSE subscription fails | 500 | Stream endpoint returns error; client should reconnect |
| CLI poll timeout | Client error | Descriptive error message with elapsed time and last error |
| SSH connection refused | Client error | SSH exits non-zero; CLI reports exit code |
| Token expired before use | Client 401 (at sandbox) | Client must request new SSH info |
| Token already used (replay) | Client 401 (at sandbox) | Client must request new SSH info |

## Verification

### API Integration Tests

#### Workspace SSH Info Endpoint

- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns 200 with valid `WorkspaceSSHConnectionInfo` for a running workspace
- [ ] Response includes all required fields: `workspace_id`, `session_id`, `vm_id`, `host`, `ssh_host`, `username`, `port`, `access_token`, `command`
- [ ] `access_token` is a valid UUID v4 (36 characters, correct format)
- [ ] `command` matches pattern `ssh {vm_id}+{username}:{access_token}@{host}`
- [ ] `ssh_host` matches pattern `{vm_id}+{username}@{host}`
- [ ] `port` is 22
- [ ] Each request generates a unique `access_token` (call twice, compare tokens)
- [ ] Returns 404 for non-existent workspace ID
- [ ] Returns 404 for workspace owned by different user
- [ ] Returns 404 for workspace in different repository
- [ ] Returns 400 for empty workspace ID
- [ ] Returns 400 for whitespace-only workspace ID
- [ ] Returns 500 when sandbox client is unavailable (with message `sandbox client unavailable`)
- [ ] Returns null/404 when workspace has no VM provisioned (empty `freestyle_vm_id`)
- [ ] A sandbox access token is created in the database for each call
- [ ] The database token hash matches `SHA-256(raw_access_token)`
- [ ] The database token `expires_at` is approximately 5 minutes from creation (±5 seconds)
- [ ] The database token `used_at` is null on creation
- [ ] The database token `token_type` is `"ssh"`
- [ ] Activity timestamp (`last_activity_at`) is updated on the workspace after SSH info request
- [ ] Auto-starts a suspended workspace container when SSH info is requested (workspace status becomes `running`)

#### Session SSH Info Endpoint

- [ ] `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh` returns 200 with valid SSH info
- [ ] Response includes populated `session_id` (non-empty)
- [ ] Session `ssh_connection_info` column is populated after the call
- [ ] Session status is updated to `running` if it was not already
- [ ] SSE notification is emitted with session status `running`
- [ ] Both workspace and session `last_activity_at` are updated
- [ ] Auto-starts a stopped container when session SSH info is requested
- [ ] Returns 404 for non-existent session
- [ ] Returns 404 for session owned by different user

#### Session CRUD

- [ ] `POST .../workspace/sessions` with `cols=120, rows=40` creates a session with correct dimensions
- [ ] `POST .../workspace/sessions` with `cols=0, rows=0` creates a session with 80x24
- [ ] `POST .../workspace/sessions` with `cols=-5, rows=-10` creates a session with 80x24
- [ ] `POST .../workspace/sessions` with `cols=1, rows=1` creates a session with 1x1 (minimum positive)
- [ ] `POST .../workspace/sessions` with `cols=10000, rows=10000` succeeds (maximum large values)
- [ ] `POST .../workspace/sessions` without `workspace_id` auto-creates or reuses primary workspace
- [ ] `POST .../workspace/sessions` with valid `workspace_id` creates session for that workspace
- [ ] `POST .../workspace/sessions` with non-existent `workspace_id` returns 404
- [ ] `POST .../workspace/sessions` with empty body returns 400
- [ ] `POST .../workspace/sessions` with invalid JSON body returns 400
- [ ] `POST .../workspace/sessions` marks session as `failed` if workspace container fails to start
- [ ] `GET .../workspace/sessions/:id` returns session details
- [ ] `GET .../workspace/sessions` returns paginated session list with `X-Total-Count` header
- [ ] `POST .../workspace/sessions/:id/destroy` destroys the session
- [ ] Destroying the last active session on a workspace triggers workspace suspension
- [ ] Destroying a session when other active sessions remain does NOT suspend the workspace
- [ ] Destroying an already-stopped session is idempotent (204)
- [ ] Destroying a non-existent session is idempotent (204)

#### SSE Streams

- [ ] `GET .../workspaces/:id/stream` returns SSE response with initial `workspace.status` event
- [ ] Initial event contains `workspace_id` and `status`
- [ ] Subsequent workspace status changes are delivered as live events
- [ ] `GET .../workspace/sessions/:id/stream` returns SSE response with initial `workspace.session` event
- [ ] Initial event contains `session_id` and `status`
- [ ] Stream returns 404 for non-existent workspace/session
- [ ] Stream handles client disconnect gracefully

#### Pagination

- [ ] `page=1&per_page=10` returns first 10 results
- [ ] `page=2&per_page=10` returns next 10 results with correct offset
- [ ] `per_page=101` returns error `per_page must not exceed 100`
- [ ] `per_page=0` returns error `invalid per_page value`
- [ ] `page=0` returns error `invalid page value`
- [ ] `page=-1` returns error `invalid page value`
- [ ] Default pagination (no params) returns up to 30 results
- [ ] `X-Total-Count` header is accurate

#### Token Lifecycle

- [ ] Token with `expires_at` in the past is not returned by `getSandboxAccessTokenByHash`
- [ ] Token with `used_at` set is not returned by `getSandboxAccessTokenByHash`
- [ ] `markSandboxAccessTokenUsed` sets `used_at` to current timestamp
- [ ] `deleteExpiredSandboxAccessTokens` removes all tokens with `expires_at` < now
- [ ] Token hash is exactly 32 bytes (SHA-256 output)
- [ ] Two tokens with different UUIDs produce different hashes

### CLI Integration Tests

- [ ] `codeplane workspace ssh` with no args auto-creates workspace and connects
- [ ] `codeplane workspace ssh <id>` connects to specific workspace
- [ ] `codeplane workspace ssh` prefers running workspace over suspended workspace
- [ ] `codeplane workspace ssh` with `--repo owner/repo` overrides repository resolution
- [ ] `codeplane workspace ssh` retries on 404 (workspace provisioning)
- [ ] `codeplane workspace ssh` retries on 503 (server temporarily unavailable)
- [ ] `codeplane workspace ssh` fails immediately on 401 (unauthorized)
- [ ] `codeplane workspace ssh` fails immediately on 403 (forbidden)
- [ ] `codeplane workspace ssh` times out after `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` with descriptive error
- [ ] `codeplane workspace ssh` uses `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` for poll interval
- [ ] `codeplane workspace ssh` spawns SSH process with correct hardened flags
- [ ] `codeplane workspace ssh` uses `~/.codeplane/ssh/known_hosts` for known hosts
- [ ] `codeplane workspace ssh` creates the known hosts directory if it doesn't exist
- [ ] `codeplane workspace ssh` returns exit code from SSH process
- [ ] `codeplane workspace view <id>` shows SSH connection info when workspace is running
- [ ] `codeplane workspace view <id>` shows null SSH info when workspace is suspended
- [ ] `codeplane workspace create` returns workspace with ID and status
- [ ] `codeplane workspace list` returns workspace list
- [ ] `codeplane workspace delete <id>` deletes workspace

### Workspace Lifecycle Tests

- [ ] Creating a workspace provisions a container and transitions to `running` status
- [ ] Suspending a workspace stops the container and transitions to `suspended` status
- [ ] Resuming a workspace starts the container and transitions to `running` status
- [ ] Deleting a workspace removes the container and the database record
- [ ] Idle workspaces are automatically suspended after 1800 seconds of inactivity
- [ ] Stale pending workspaces (no VM after 300 seconds) are marked as `failed`
- [ ] Zombie workspaces (pending/starting with no VM ID for > 5 minutes) are detected and failed
- [ ] Workspace fork returns 501 with Codeplane Cloud message

### E2E Tests (Playwright - Web UI)

- [ ] Workspace list page displays workspaces with correct status badges
- [ ] Clicking "Connect" on a running workspace opens the terminal dock
- [ ] Terminal dock establishes SSH connection (verify SSH info API is called)
- [ ] Workspace status badge updates in real time when workspace is suspended
- [ ] Workspace status badge updates in real time when workspace is resumed
- [ ] Creating a new workspace from the UI shows pending → running transition
- [ ] Deleting a workspace removes it from the list
- [ ] Copy SSH command button copies the correct command to clipboard

### E2E Tests (CLI)

- [ ] Full `workspace issue` flow: create workspace → bootstrap → run Claude → extract changes → create landing request
- [ ] `workspace issue` handles Claude auth not configured (descriptive error)
- [ ] `workspace issue` handles workspace provisioning failure gracefully
- [ ] Remote shell command execution via SSH works end-to-end (bootstrap scripts)
- [ ] Remote shell command handles timeout (120s default)
- [ ] `workspace watch` connects to SSE stream and displays status changes

### Security Tests

- [ ] Access token is not present in server logs at any log level
- [ ] Access token is not present in database in plaintext (only hash)
- [ ] Expired token is rejected at the sandbox level
- [ ] Used token is rejected on replay
- [ ] Cross-user workspace access returns 404 (not 403)
- [ ] Cross-repo workspace access returns 404
- [ ] Unauthenticated request to SSH info returns 401
- [ ] Deploy key authentication cannot create workspace sessions
- [ ] Known hosts file has correct permissions (not world-readable)
- [ ] Claude auth file in workspace has 600 permissions
- [ ] Concurrent SSH info requests for the same workspace produce different tokens

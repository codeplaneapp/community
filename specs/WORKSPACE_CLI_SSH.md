# WORKSPACE_CLI_SSH

Specification for WORKSPACE_CLI_SSH.

## High-Level User POV

When a developer is working on a Codeplane repository, they often need direct terminal access to a cloud workspace — a containerized development environment scoped to that repository. The `codeplane workspace ssh` command is the single entry point for that experience. It removes all friction between "I want a shell in my workspace" and actually having one.

If the developer already has a running workspace, the command connects to it immediately. If they have a suspended workspace, it resumes and connects. If they have no workspace at all, it creates one, waits for it to become ready, and connects — all in one invocation. The developer never needs to manually manage workspace lifecycle just to get a shell.

The connection itself is secured with a short-lived, single-use token generated on every SSH attempt. The developer does not need to manage workspace-specific SSH keys or configure their SSH client. The CLI handles all of that transparently, including host-key management in a Codeplane-specific known-hosts file, connection timeouts, and retry logic during workspace startup.

This command is the foundational transport for higher-level automation. The `codeplane workspace issue` flow, for example, builds on workspace SSH to seed AI agent credentials into the workspace, run Claude Code against an issue, capture the resulting changes, and create a landing request — all without the developer manually SSHing in. Whether used directly for interactive sessions or as the transport layer for automated workflows, workspace SSH is the bridge between the developer's local machine and their cloud development environment.

## Acceptance Criteria

### Definition of Done

- [ ] A user can run `codeplane workspace ssh` with no arguments and be connected to a running or newly created workspace for the current repository
- [ ] A user can run `codeplane workspace ssh <workspace-id>` to connect to a specific workspace
- [ ] The command automatically creates a workspace if none exists for the repository
- [ ] The command automatically resumes a suspended workspace before connecting
- [ ] The command prefers an already-running workspace when multiple exist and no ID is specified
- [ ] The SSH connection uses a fresh, short-lived, single-use access token on every invocation
- [ ] The user receives clear, real-time feedback during the workspace readiness polling phase
- [ ] The SSH session provides an interactive TTY by default
- [ ] The command exits with the SSH process's exit code
- [ ] The command can be used non-interactively to execute a remote command (e.g., `codeplane workspace ssh -- ls /`)

### Edge Cases and Boundary Constraints

- [ ] **No repository context**: If the CLI cannot resolve a repository (no `--repo` flag and no local jj/git repo detected), the command exits with a clear error message
- [ ] **Workspace in "failed" status**: The command does not attempt to SSH into a failed workspace; it prints an error suggesting deletion and recreation
- [ ] **Workspace in "pending" or "starting" status**: The command polls until the workspace transitions to "running" or the timeout is reached
- [ ] **Workspace in "stopped" status**: The command reports the workspace is stopped and suggests resuming or creating a new one
- [ ] **Multiple running workspaces, no ID specified**: The command selects the most recently active running workspace
- [ ] **No sandbox runtime available**: The server returns a clear error indicating the workspace feature is unavailable; the CLI surfaces this to the user
- [ ] **SSH readiness poll timeout**: If the workspace does not become SSH-ready within the configurable timeout (default 120 seconds), the command exits with a timeout error
- [ ] **Authentication failure (401/403)**: The CLI does not retry; it immediately surfaces an authentication/authorization error
- [ ] **Transient server errors (502/503/504)**: The CLI retries these during the polling phase
- [ ] **SSH connection refused after token acquisition**: The CLI exits with an error indicating the container may not be fully ready; it does not retry the SSH connection itself
- [ ] **Workspace ID does not exist**: Returns a 404 error surfaced as "workspace not found"
- [ ] **Workspace ID belongs to a different user**: Returns a 404 error (does not reveal workspace existence to other users)
- [ ] **Workspace ID belongs to a different repository**: Returns a 404 error
- [ ] **Invalid workspace ID format (not a UUID)**: Returns a 400 error with a clear validation message
- [ ] **Token expiry during slow SSH handshake**: If the token expires (5-minute TTL) before SSH completes the handshake, the connection is rejected server-side; the CLI exits with a connection-refused error
- [ ] **Concurrent SSH attempts**: Each invocation gets its own independent token; multiple concurrent sessions to the same workspace are permitted
- [ ] **Network interruption during SSH session**: The SSH process exits with a non-zero code; the CLI surfaces that exit code
- [ ] **Known-hosts directory does not exist**: The CLI creates `~/.codeplane/ssh/` if it does not exist before invoking SSH
- [ ] **Environment variable overrides**: `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS`, `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS`, `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS` are all respected

## Design

### CLI Command

**Command**: `codeplane workspace ssh [workspace-id]`

**Arguments**:
| Argument | Required | Description |
|---|---|---|
| `workspace-id` | No | UUID of a specific workspace. If omitted, auto-selects or creates. |

**Flags**:
| Flag | Short | Default | Description |
|---|---|---|---|
| `--repo` | `-R` | Auto-detected from cwd | Repository in `owner/repo` format |
| `--json` | | `false` | Output SSH connection info as JSON instead of connecting |

**Behavior by scenario**:

1. **No workspace exists**: Create a new workspace → poll for SSH readiness → connect.
2. **One or more running workspaces exist (no ID given)**: Select the most recently updated running workspace → get SSH info → connect.
3. **Only suspended workspaces exist (no ID given)**: Resume the most recently updated suspended workspace → poll for SSH readiness → connect.
4. **Specific workspace ID provided**: Get that workspace → resume if suspended → poll for SSH readiness → connect.

**Output during polling**:
```
Creating workspace for owner/repo...
Workspace abc123 created. Waiting for SSH to become available...
⠋ Polling for SSH readiness... (elapsed: 12s)
Connecting to workspace abc123...
```

**Output with `--json`**:
```json
{
  "workspace_id": "abc12345-...",
  "host": "localhost",
  "ssh_host": "vm-id+root@localhost",
  "username": "root",
  "port": 22,
  "command": "ssh vm-id+root:token@localhost"
}
```
When `--json` is passed, the command prints connection info and exits without actually SSHing. This enables scripting and integration with external tools.

**Exit codes**:
| Code | Meaning |
|---|---|
| 0 | SSH session completed successfully |
| 1 | General error (workspace creation failed, auth error, etc.) |
| 2 | Timeout waiting for SSH readiness |
| 124 | SSH connection timeout (from SSH client) |
| 255 | SSH connection refused or failed |
| Other | Passthrough of the remote command's exit code |

### SSH Connection Details

The SSH invocation constructed by the CLI uses these options:

- **`-tt`**: Force pseudo-terminal allocation for interactive use
- **`-o BatchMode=yes`**: Prevent password prompts (token-based auth only)
- **`-o StrictHostKeyChecking=accept-new`**: Accept new host keys on first connection, reject changes thereafter
- **`-o ConnectTimeout=15`**: Configurable via `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS`
- **`-o UserKnownHostsFile=~/.codeplane/ssh/known_hosts`**: Isolated known-hosts file to avoid polluting the user's global SSH config
- **`-o LogLevel=ERROR`**: Suppress informational SSH output

The SSH user string encodes the workspace VM identity and access token: `{vm_id}+{username}:{token}@{host}`. This is parsed by the Codeplane SSH server to route the connection to the correct container and validate the token.

### API Shape

**Get Workspace SSH Connection Info**

```
GET /api/repos/:owner/:repo/workspaces/:id/ssh
```

**Response 200**:
```json
{
  "workspace_id": "uuid",
  "session_id": "",
  "vm_id": "container-id",
  "host": "localhost",
  "ssh_host": "container-id+root@localhost",
  "username": "root",
  "port": 22,
  "access_token": "short-lived-uuid",
  "command": "ssh container-id+root:token@localhost"
}
```

**Response 404**: Workspace not found or VM not yet provisioned.

**Response 500**: Sandbox runtime unavailable.

Each call to this endpoint generates a **new** short-lived access token (5-minute TTL, single-use). The raw token is returned in the response; only its SHA-256 hash is stored server-side.

**Get Session SSH Connection Info**

```
GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh
```

Same response shape, with `session_id` populated. Used by the web terminal and TUI session flows.

### SDK Shape

The workspace service exposes:

- `getWorkspaceSSHConnectionInfo(workspaceID, repositoryID, userID)` → `WorkspaceSSHConnectionInfo | null`
- `getSSHConnectionInfo(sessionID, repositoryID, userID)` → `WorkspaceSSHConnectionInfo | null`

Both methods:
1. Validate the sandbox client is available
2. Load the workspace/session scoped to the requesting user and repository
3. Return `null` if the VM is not yet provisioned
4. Generate a fresh UUID token
5. Store the SHA-256 hash in `sandbox_access_tokens` with a 5-minute TTL
6. Return the raw token in the response object

### TUI UI

The TUI workspace detail screen should display SSH connection status and provide a keybinding to launch an SSH session to the selected workspace. The TUI should show:

- Workspace status (pending/starting/running/suspended/stopped/failed)
- SSH readiness indicator when status is "running"
- A hotkey (e.g., `s` for SSH) that shells out to the `codeplane workspace ssh <id>` command
- Real-time status updates via SSE subscription

### Web UI Design

The web UI workspace view should display:

- A "Connect via SSH" button that reveals the SSH command for copy-paste
- The SSH command string (with token) refreshed on each button click
- A warning that the displayed token expires in 5 minutes
- An integrated web terminal (via workspace sessions) as the primary in-browser access path
- Workspace status with real-time SSE updates

### VS Code Integration

The VS Code extension should provide:

- A command `Codeplane: SSH to Workspace` accessible from the command palette
- A workspace picker when multiple workspaces exist
- Automatic terminal creation with the SSH command
- Status bar indicator showing workspace connection state

### Neovim Integration

The Neovim plugin should provide:

- A `:CodeplaneWorkspaceSSH` command
- Workspace selection via Telescope picker when multiple exist
- Terminal buffer creation with the SSH connection

### Documentation

End-user documentation should include:

- **Getting Started with Workspaces**: Overview of what workspaces are, how they relate to repositories, and the lifecycle states
- **SSH into a Workspace**: Step-by-step guide for `codeplane workspace ssh`, including auto-creation behavior, specifying a workspace ID, and the `--json` flag for scripting
- **Environment Variable Reference**: Table of all configurable environment variables (`CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS`, `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS`, `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS`)
- **Troubleshooting Workspace SSH**: Common error scenarios (timeout, auth failure, sandbox unavailable) with resolution steps
- **Automated Workflows with Workspace SSH**: How `workspace issue` builds on workspace SSH for AI-assisted development, including Claude auth seeding

## Permissions & Security

### Authorization

| Role | Create Workspace | SSH to Own Workspace | SSH to Others' Workspace | View SSH Info |
|---|---|---|---|---|
| **Repository Owner** | ✅ | ✅ | ❌ | Own only |
| **Repository Admin** | ✅ | ✅ | ❌ | Own only |
| **Repository Member (Write)** | ✅ | ✅ | ❌ | Own only |
| **Repository Member (Read)** | ❌ | N/A | ❌ | ❌ |
| **Anonymous** | ❌ | N/A | ❌ | ❌ |

Workspaces are **user-scoped**: a workspace belongs to the user who created it and cannot be accessed by other users, even repository owners or admins. This is a hard security boundary.

### Token Security

- **Token lifetime**: 5 minutes from generation
- **Token usage**: Single-use; marked as consumed on first SSH handshake
- **Token storage**: Only the SHA-256 hash is stored server-side; the raw token is returned exactly once in the API response
- **Token generation**: Fresh UUID on every SSH info request; no token reuse
- **Token validation**: The SSH server validates the token hash, checks expiry, and checks the used-at timestamp before granting access
- **Token rotation**: Not applicable (tokens are ephemeral per-request)

### Rate Limiting

- **SSH info endpoint**: 30 requests per minute per user per workspace (accommodates polling at 3-second intervals for 90 seconds)
- **Workspace creation**: 10 creations per hour per user per repository
- **SSH connection attempts**: Rate-limited at the SSH server level; 20 connection attempts per minute per source IP

### Data Privacy

- **Access tokens**: Never logged in plaintext; only the first 8 characters of the hash may appear in debug-level logs for correlation
- **SSH host keys**: Stored in `~/.codeplane/ssh/known_hosts`, not mixed with the user's `~/.ssh/known_hosts`
- **Workspace contents**: Workspace filesystem is scoped to the creating user; no cross-user access
- **PII in workspace**: Workspaces may contain repository code and user credentials (e.g., seeded Claude auth); these are sandboxed within the container and cleaned up on workspace deletion

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `WorkspaceSSHConnected` | SSH connection successfully established | `workspace_id`, `repository_id`, `user_id`, `auto_created` (bool), `auto_resumed` (bool), `poll_duration_ms`, `workspace_age_seconds` |
| `WorkspaceSSHFailed` | SSH connection failed after token acquisition | `workspace_id`, `repository_id`, `user_id`, `failure_reason` (timeout/refused/auth/error), `poll_duration_ms` |
| `WorkspaceSSHPollTimeout` | Polling for SSH readiness exceeded timeout | `workspace_id`, `repository_id`, `user_id`, `timeout_ms`, `last_status` |
| `WorkspaceSSHInfoRequested` | SSH info endpoint called | `workspace_id`, `repository_id`, `user_id`, `source` (cli/web/tui/editor) |
| `WorkspaceAutoCreated` | Workspace auto-created by SSH command | `workspace_id`, `repository_id`, `user_id` |
| `WorkspaceAutoResumed` | Workspace auto-resumed by SSH command | `workspace_id`, `repository_id`, `user_id`, `suspended_duration_seconds` |

### Funnel Metrics

1. **SSH readiness conversion**: % of `WorkspaceSSHInfoRequested` events that lead to a `WorkspaceSSHConnected` event within 5 minutes
2. **Auto-creation success rate**: % of `WorkspaceAutoCreated` events that lead to a successful SSH connection
3. **Time-to-shell**: p50/p95/p99 duration from CLI invocation to interactive shell prompt (measured as `poll_duration_ms` + SSH handshake time)
4. **SSH failure rate**: % of SSH attempts that result in `WorkspaceSSHFailed`
5. **Poll timeout rate**: % of SSH attempts that result in `WorkspaceSSHPollTimeout`

### Success Indicators

- Time-to-shell p50 < 15 seconds for workspaces that are already running
- Time-to-shell p50 < 45 seconds for newly created workspaces
- SSH failure rate < 2%
- Poll timeout rate < 1%
- Auto-creation success rate > 95%

## Observability

### Logging Requirements

| Event | Level | Structured Context |
|---|---|---|
| SSH info request received | INFO | `workspace_id`, `user_id`, `repository_id` |
| Token generated for workspace | DEBUG | `workspace_id`, `token_prefix` (first 8 chars of hash) |
| Token validated successfully | INFO | `workspace_id`, `token_prefix`, `age_ms` (time since generation) |
| Token validation failed (expired) | WARN | `workspace_id`, `token_prefix`, `expired_by_ms` |
| Token validation failed (already used) | WARN | `workspace_id`, `token_prefix`, `first_used_at` |
| Token validation failed (hash mismatch) | WARN | `workspace_id`, `source_ip` |
| Workspace SSH info returned null (VM not provisioned) | DEBUG | `workspace_id`, `workspace_status` |
| Sandbox client unavailable | ERROR | `workspace_id` |
| CLI SSH poll started | DEBUG | `workspace_id`, `poll_interval_ms`, `timeout_ms` |
| CLI SSH poll iteration | DEBUG | `workspace_id`, `attempt_number`, `elapsed_ms`, `response_status` |
| CLI SSH poll succeeded | INFO | `workspace_id`, `total_poll_duration_ms`, `attempts` |
| CLI SSH poll timed out | WARN | `workspace_id`, `timeout_ms`, `attempts` |
| CLI SSH process spawned | INFO | `workspace_id`, `ssh_host` |
| CLI SSH process exited | INFO | `workspace_id`, `exit_code` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workspace_ssh_info_requests_total` | Counter | `status` (200/404/500) | Total SSH info endpoint requests |
| `codeplane_workspace_ssh_token_generated_total` | Counter | | Total tokens generated |
| `codeplane_workspace_ssh_token_validation_total` | Counter | `result` (success/expired/used/mismatch) | Token validation outcomes |
| `codeplane_workspace_ssh_token_age_seconds` | Histogram | | Time between token generation and validation |
| `codeplane_workspace_ssh_poll_duration_seconds` | Histogram | `outcome` (success/timeout/error) | CLI polling duration |
| `codeplane_workspace_ssh_poll_attempts` | Histogram | `outcome` | Number of poll attempts before resolution |
| `codeplane_workspace_ssh_session_duration_seconds` | Histogram | | Duration of SSH sessions |
| `codeplane_workspace_ssh_active_sessions` | Gauge | | Currently active SSH sessions |
| `codeplane_workspace_ssh_connection_errors_total` | Counter | `reason` (refused/timeout/auth) | SSH connection failures |

### Alerts

#### Alert: WorkspaceSSHHighTokenExpiry

**Condition**: Rate of expired token validations > 10% of total validations over 15 minutes

**Severity**: Warning

**Runbook**:
1. Check `codeplane_workspace_ssh_token_age_seconds` histogram — are tokens being used after the 5-minute TTL?
2. If token age is clustered near 300s, the issue is likely slow SSH handshakes or slow container startup. Check `codeplane_workspace_ssh_poll_duration_seconds` for correlation.
3. Check container provisioning times — if containers are taking too long to start, the token may expire before SSH is ready.
4. Consider increasing the token TTL if the provisioning pipeline has a legitimate latency increase.
5. Check for clock skew between the API server and SSH server if token_age seems incorrect.

#### Alert: WorkspaceSSHHighPollTimeout

**Condition**: Rate of `codeplane_workspace_ssh_poll_duration_seconds{outcome="timeout"}` > 5% of total polls over 30 minutes

**Severity**: Warning

**Runbook**:
1. Check workspace status distribution — are workspaces getting stuck in "starting" or "pending"?
2. Check the sandbox runtime health — is the container backend (Docker/Firecracker) responsive?
3. Check `workspace_stale_pending_cleanup` metrics — are pending workspaces being cleaned up correctly?
4. Inspect the PostgreSQL NOTIFY channel — are status update notifications being delivered?
5. Check for resource exhaustion on the container host (CPU, memory, disk).
6. If isolated to specific repos or users, check for repository-specific provisioning failures.

#### Alert: WorkspaceSSHConnectionErrorSpike

**Condition**: `rate(codeplane_workspace_ssh_connection_errors_total[5m])` > 1 per second

**Severity**: Critical

**Runbook**:
1. Identify the dominant `reason` label — is it `refused`, `timeout`, or `auth`?
2. For `refused`: Check if the SSH server is running. Check if the SSH server port is reachable. Check firewall rules.
3. For `timeout`: Check network connectivity between CLI clients and the SSH server. Check SSH server connection backlog.
4. For `auth`: Check `codeplane_workspace_ssh_token_validation_total` for the dominant failure mode. If `mismatch`, investigate potential token corruption or man-in-the-middle.
5. Check recent deployments — did a server update change the SSH protocol or token format?
6. Verify the sandbox_access_tokens table is accessible and not locked.

#### Alert: WorkspaceSSHSandboxUnavailable

**Condition**: `codeplane_workspace_ssh_info_requests_total{status="500"}` > 0 sustained for 5 minutes

**Severity**: Critical

**Runbook**:
1. The sandbox client is unavailable. Check the container runtime (Docker daemon, Firecracker VMM).
2. Verify the sandbox client configuration in the service registry.
3. Check system resources on the container host.
4. If running in daemon/desktop mode, verify the local container runtime is installed and running.
5. Restart the container runtime if necessary; workspace SSH will self-heal once the runtime is back.

### Error Cases and Failure Modes

| Failure Mode | Detection | User Impact | Recovery |
|---|---|---|---|
| Sandbox runtime unavailable | 500 from SSH info endpoint | Cannot SSH to any workspace | Restore container runtime |
| Workspace stuck in "starting" | Poll timeout after 120s | Cannot connect | Delete and recreate workspace |
| Token expired before SSH handshake | SSH connection rejected | Must retry the command | Automatic on retry (new token) |
| SSH server process crash | Connection refused | Cannot SSH | Server auto-restart or manual restart |
| Database unavailable | 500 from all endpoints | Cannot create workspace or get tokens | Restore database connectivity |
| Container OOM killed | SSH session terminated | Session lost | Workspace re-provisioned on next SSH |
| Disk full on container host | Workspace creation fails | Cannot create new workspaces | Free disk space or expand storage |
| DNS resolution failure for SSH host | SSH connection timeout | Cannot connect | Fix DNS or use IP-based host config |

## Verification

### API Integration Tests

- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns 200 with valid SSH connection info for a running workspace with a provisioned VM
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns 404 when the workspace does not exist
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns 404 when the workspace exists but VM is not yet provisioned
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns 500 when the sandbox runtime is unavailable
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns 401 when the request has no auth token
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns 404 when the workspace belongs to a different user (no information leakage)
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns 404 when the workspace belongs to a different repository
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns a **different** access token on every invocation
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` access tokens are valid UUIDs
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` stores only the SHA-256 hash of the token, not the raw token
- [ ] The stored token hash has an expiry timestamp 5 minutes in the future
- [ ] An expired token hash is rejected during SSH validation
- [ ] A used token hash (with `used_at` set) is rejected on second use
- [ ] A valid token hash succeeds on first use and sets `used_at`
- [ ] `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh` returns 200 with session-scoped SSH info
- [ ] `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh` populates the `session_id` field
- [ ] `GET /api/repos/:owner/:repo/workspaces/:id/ssh` returns an empty `session_id` field
- [ ] Rate limiting: 31st request within 1 minute returns 429
- [ ] Invalid workspace ID format (non-UUID) returns 400

### CLI Integration Tests

- [ ] `codeplane workspace ssh` with no args and no existing workspace creates a workspace and prints creation messages
- [ ] `codeplane workspace ssh` with no args and one running workspace connects to it without creating a new one
- [ ] `codeplane workspace ssh` with no args and only suspended workspaces resumes the most recent one
- [ ] `codeplane workspace ssh <valid-id>` connects to the specified workspace
- [ ] `codeplane workspace ssh <nonexistent-id>` prints "workspace not found" error and exits with code 1
- [ ] `codeplane workspace ssh` with no repository context prints a clear "repository not found" error
- [ ] `codeplane workspace ssh --repo owner/repo` resolves the repository from the flag
- [ ] `codeplane workspace ssh -R owner/repo` resolves the repository from the short flag
- [ ] `codeplane workspace ssh --json` prints JSON connection info and does not spawn SSH
- [ ] `codeplane workspace ssh --json` output contains all required fields: `workspace_id`, `host`, `ssh_host`, `username`, `port`, `command`
- [ ] `codeplane workspace ssh` respects `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` and times out at the configured value
- [ ] `codeplane workspace ssh` with `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS=1` times out immediately with exit code 2
- [ ] `codeplane workspace ssh` respects `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` for polling cadence
- [ ] `codeplane workspace ssh` respects `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS` in the SSH invocation
- [ ] `codeplane workspace ssh` creates `~/.codeplane/ssh/` directory if it does not exist
- [ ] `codeplane workspace ssh` uses `~/.codeplane/ssh/known_hosts` as the known hosts file
- [ ] `codeplane workspace ssh -- ls /` executes the remote command and exits with its exit code
- [ ] `codeplane workspace ssh -- exit 42` exits with code 42 (passthrough)
- [ ] `codeplane workspace ssh` to a failed workspace prints an error suggesting recreation
- [ ] `codeplane workspace ssh` with multiple running workspaces and no ID picks the most recently updated one

### E2E Tests (Full Lifecycle, requires sandbox runtime)

- [ ] **Happy path**: Create workspace → poll for SSH readiness → SSH in → run `whoami` → verify output → exit → workspace still running
- [ ] **Auto-create path**: Start with no workspaces → `codeplane workspace ssh -- echo hello` → verify output is "hello" → workspace was created
- [ ] **Resume path**: Create workspace → suspend it → `codeplane workspace ssh -- echo resumed` → verify output → workspace status is "running"
- [ ] **Concurrent sessions**: SSH into same workspace from two CLI invocations simultaneously → both succeed → both can run commands
- [ ] **Token single-use**: Get SSH info → extract token → use token to SSH → attempt to reuse same token → second attempt is rejected
- [ ] **Token expiry**: Get SSH info → wait >5 minutes → attempt to SSH with the old token → connection is rejected
- [ ] **Workspace issue automation**: Create issue → `codeplane workspace issue <number>` → verify workspace created → verify Claude auth is seeded → verify landing request is created if changes produced
- [ ] **Session SSH**: Create workspace → create session → get session SSH info → SSH using session token → verify session status is "running"
- [ ] **Cleanup after last session**: Create workspace → create session → SSH in → exit → verify session is "stopped" → verify workspace auto-suspends if no other active sessions
- [ ] **Watch + SSH**: Start `codeplane workspace watch <id>` in background → `codeplane workspace ssh <id>` → verify watch stream shows status transitions
- [ ] **Fork + SSH**: Fork a workspace → SSH into the fork → verify it has the parent workspace's filesystem snapshot
- [ ] **Snapshot + SSH**: Create workspace → create snapshot → delete workspace → create new workspace from snapshot → SSH in → verify expected files exist

### Playwright (Web UI) Tests

- [ ] Workspace detail page shows "Connect via SSH" button when workspace is running
- [ ] Clicking "Connect via SSH" reveals the SSH command string
- [ ] The SSH command contains a valid token (not empty, UUID format)
- [ ] Clicking "Connect via SSH" a second time reveals a different token
- [ ] "Connect via SSH" button is hidden when workspace is not running
- [ ] "Connect via SSH" button is hidden when workspace is in "failed" status
- [ ] Token expiry warning (5-minute) is visible next to the SSH command
- [ ] Web terminal (session-based) connects successfully and shows a shell prompt
- [ ] Workspace status updates in real-time via SSE (no page refresh needed)

### Security Tests

- [ ] SSH info endpoint does not return workspace data for unauthenticated requests
- [ ] SSH info endpoint does not reveal workspace existence to non-owner users (returns 404, not 403)
- [ ] Token hash stored in database is a valid SHA-256 hex string (64 characters)
- [ ] Raw token does not appear in server logs at any log level
- [ ] Token prefix (first 8 chars of hash) appears in DEBUG logs for correlation
- [ ] SSH connection with an invalid token is rejected
- [ ] SSH connection with a malformed token (non-UUID) is rejected
- [ ] SSH connection with an empty token is rejected
- [ ] Workspace contents are not accessible via SSH by users other than the workspace owner

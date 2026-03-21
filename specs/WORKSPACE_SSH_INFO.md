# WORKSPACE_SSH_INFO

Specification for WORKSPACE_SSH_INFO.

## High-Level User POV

When a developer creates or opens a cloud workspace in Codeplane, they need a fast, reliable way to connect to it over SSH. The Workspace SSH Info feature provides exactly that: once a workspace reaches the "running" state, every Codeplane surface — the API, CLI, TUI, and web UI — can generate and present a ready-to-use SSH command that the user can copy and run immediately.

The user does not need to manage SSH keys, configure hosts, or look up port numbers. Codeplane generates a short-lived access token (valid for 5 minutes), embeds it directly into a single SSH command string, and hands it to the user. The command looks like `ssh <vm-id>+root:<token>@<host>` and works with any standard SSH client.

From the CLI, the experience is even more seamless: running `codeplane workspace ssh` will automatically find or create a workspace for the current repository, wait for it to become SSH-ready (polling the server until connection info is available), and then open an interactive SSH session directly — no copy-paste needed.

In the TUI, workspace SSH info appears as a dedicated section inside the workspace detail view. Users see the host, port, username, and the full SSH command with a prominent copy hint. A live token countdown shows how much time remains before the token expires, and the TUI automatically refreshes the token when it expires so the user always has a valid command ready.

The feature is designed around security and ephemerality. Tokens are single-use, short-lived, and SHA-256 hashed before storage. Expired tokens are automatically cleaned up. The raw token is displayed to the user exactly once (at generation time) and is never logged, persisted to disk, or sent to telemetry.

## Acceptance Criteria

### Definition of Done

- A user with workspace access can retrieve SSH connection info for any running workspace they own or have member-level access to
- The SSH connection info response includes: `workspace_id`, `session_id`, `vm_id`, `host`, `ssh_host`, `username`, `port`, `access_token`, and `command`
- The `command` field contains a complete, ready-to-execute SSH command string in the format `ssh <vm_id>+<username>:<token>@<host>`
- The `access_token` is a freshly generated UUID, valid for exactly 5 minutes from creation
- The token is SHA-256 hashed before database storage; only the raw token is returned to the client
- Each call to the SSH info endpoint generates a new token (tokens are not reused)
- The endpoint returns `404` when the workspace does not exist or the user lacks access
- The endpoint returns `null`/empty when the workspace exists but has no provisioned VM (no `vm_id`)
- The CLI `workspace ssh` command polls the endpoint until SSH info is available, with configurable timeout (default 120s) and poll interval (default 3s)
- The CLI opens an interactive SSH session using the returned command, with `StrictHostKeyChecking=accept-new`, `BatchMode=yes`, and `ConnectTimeout=15`
- The TUI displays SSH info within the workspace detail view with copy-to-clipboard keybindings
- Expired sandbox access tokens are periodically deleted from the database by the cleanup scheduler

### Boundary Constraints

- `workspace_id`: UUID format, 36 characters
- `vm_id`: non-empty string after trimming; if empty after trim, SSH info returns `null`
- `host`: defaults to `localhost` for Community Edition; configurable via server config
- `username`: defaults to `root`; maximum 32 characters (Linux username limit)
- `port`: always `22` (integer, range 1–65535)
- `access_token`: UUID v4 format, 36 characters
- `command`: maximum practical length ~200 characters (host + vm_id + token)
- `ssh_host`: format `{vm_id}+{username}@{host}`, maximum ~150 characters
- Token TTL: exactly 300,000 milliseconds (5 minutes), not configurable by the client
- CLI poll interval: configurable via `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` (default 3000ms)
- CLI poll timeout: configurable via `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` (default 120000ms)
- CLI SSH connect timeout: configurable via `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS` (default 15s)

### Edge Cases

- Requesting SSH info for a workspace with status `pending` or `starting`: endpoint may return `null` (no VM provisioned yet) — CLI retries, TUI shows spinner
- Requesting SSH info for a `suspended` workspace: returns `null` (VM not running) — TUI shows resume prompt
- Requesting SSH info for a `stopped` workspace: returns `null` — TUI shows "Workspace stopped"
- Requesting SSH info when sandbox client is unavailable: returns 500 "sandbox client unavailable"
- Concurrent SSH info requests for the same workspace: each generates a distinct token — all are valid until their respective expiry
- Token used after expiry: SSH server rejects authentication — user must refresh
- Token used after being marked as used: SSH server rejects authentication (single-use enforcement via `used_at IS NULL` check)
- Workspace deleted between SSH info retrieval and SSH connection attempt: SSH server rejects (no matching workspace/VM)
- Empty `id` route parameter: returns 400 "workspace id is required"
- Non-existent workspace ID: returns 404 "workspace not found"

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspaces/:id/ssh`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Repository owner |
| `repo` | string | Yes | Repository name |
| `id` | string (UUID) | Yes | Workspace ID |

**Response 200** (`WorkspaceSSHConnectionInfo`):
```json
{
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "",
  "vm_id": "container-abc123",
  "host": "localhost",
  "ssh_host": "container-abc123+root@localhost",
  "username": "root",
  "port": 22,
  "access_token": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "command": "ssh container-abc123+root:7c9e6679-7425-40de-944b-e07fc1f90ae7@localhost"
}
```

**Error Responses**:
| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "message": "workspace id is required" }` | Missing or empty `id` parameter |
| 404 | `{ "message": "workspace not found" }` | Workspace doesn't exist, user lacks access, or no VM provisioned |
| 500 | `{ "message": "sandbox client unavailable" }` | No container runtime configured |
| 429 | Rate limit error | Too many requests |

**Session SSH endpoint**: `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh` follows the same shape but is scoped to workspace sessions. It additionally persists SSH connection info to the session record and marks the session as "running".

### SDK Shape

**Interface**: `WorkspaceSSHConnectionInfo`
```typescript
interface WorkspaceSSHConnectionInfo {
  workspace_id: string;   // UUID
  session_id: string;     // UUID or empty string for workspace-level
  vm_id: string;          // Container/VM identifier
  host: string;           // SSH server hostname
  ssh_host: string;       // Formatted as "{vmId}+{username}@{host}"
  username: string;       // Linux user (default: "root")
  port: number;           // SSH port (always 22)
  access_token: string;   // Short-lived UUID token (5-minute TTL)
  command: string;        // Ready-to-execute SSH command string
}
```

**Service method**: `WorkspaceService.getWorkspaceSSHConnectionInfo(workspaceID, repositoryID, userID): Promise<WorkspaceSSHConnectionInfo | null>`

The method: (1) validates the sandbox client is available; (2) looks up the workspace by ID, repository ID, and user ID; (3) returns `null` if not found or if `freestyleVmId` is empty; (4) generates a random UUID token; (5) SHA-256 hashes the token; (6) stores the hash in `sandbox_access_tokens` with a 5-minute `expires_at`; (7) returns the `WorkspaceSSHConnectionInfo` with the raw token.

### CLI Command

**Command**: `codeplane workspace ssh [id]`

| Argument | Required | Description |
|----------|----------|-------------|
| `id` | No | Workspace ID. If omitted, auto-detects or creates a workspace for the current repo |

| Option | Description |
|--------|-------------|
| `--repo`, `-R` | Repository in `OWNER/REPO` format. Auto-detected from local jj/git context if omitted |

**Behavior**: (1) If `id` is omitted, list workspaces for the repo, prefer a running one, fall back to creating a new workspace. (2) Poll the SSH info endpoint until SSH info is returned with a valid command. (3) Retry on transient errors (404, 409, 423, 425, 429, 502, 503, 504). (4) Build SSH invocation with security flags: `BatchMode=yes`, `StrictHostKeyChecking=accept-new`, `ConnectTimeout=15`, custom `UserKnownHostsFile=~/.codeplane/ssh/known_hosts`, `LogLevel=ERROR`. (5) Execute SSH command for interactive session.

**Environment variables**: `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` (default 3000), `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` (default 120000), `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS` (default 15), `CODEPLANE_WORKSPACE_KNOWN_HOSTS_FILE` (default `~/.codeplane/ssh/known_hosts`).

### TUI UI

SSH info renders as a section within the workspace detail view.

**Section header**: `─── SSH Connection ───`

**Fields** (when workspace is running): Host (`ssh_host`), Port (22), Username, Command (bold, `(c to copy)` hint), Token (countdown timer).

**Keybindings**: `c` copy command, `y` copy host, `r` refresh token, `R` resume suspended workspace.

**Status-gated rendering**: `running` shows full details; `starting`/`pending` shows spinner; `suspended` shows resume prompt; `stopped` shows stopped message.

**Token countdown**: `Xm Ys` format (≥60s), `Xs` (<60s), `Token expired` (0s). Yellow warning at <60s, red at 0s. Auto-refresh on expiry.

**Responsive layout**: 80×24 shows Command+Token only; 120×40 shows all standard fields; 200×60+ adds Workspace ID and VM ID.

### Documentation

1. **"Connecting to Workspaces via SSH"** guide — covering `codeplane workspace ssh` usage, auto-detection, timeout configuration, token lifecycle, SSH client requirements
2. **CLI reference for `codeplane workspace ssh`** — arguments, options, environment variables, examples
3. **API reference for `GET /api/repos/:owner/:repo/workspaces/:id/ssh`** — parameters, response schema, error codes, token lifecycle
4. **TUI keyboard reference** — `c`, `y`, `r`, `R` keybindings in workspace detail context

## Permissions & Security

### Authorization

| Action | Anonymous | Read-Only | Member | Admin | Owner |
|--------|-----------|-----------|--------|-------|-------|
| Retrieve workspace SSH info | ❌ | ❌ | ✅ | ✅ | ✅ |
| Generate sandbox access token | ❌ | ❌ | ✅ | ✅ | ✅ |
| Use sandbox access token (SSH connect) | ❌ | ❌ | ✅ | ✅ | ✅ |

- The endpoint requires authentication (session cookie or PAT)
- The workspace query is scoped to the requesting user's ID and the repository ID — users can only access SSH info for workspaces they own within repositories they have member-level access to
- Read-only collaborators cannot access workspace SSH info
- Anonymous access is never permitted

### Rate Limiting

- Standard platform rate limit applies: 5,000 requests per hour per authenticated user
- Each SSH info request generates a new database record (sandbox access token) — the cleanup scheduler deletes expired tokens to prevent unbounded table growth
- CLI polling respects the configured interval (default 3s) and timeout (default 120s) to bound total requests per workspace connect attempt (max ~40 requests)
- No additional per-endpoint rate limiting beyond the platform default

### Data Privacy & Token Security

- The `access_token` field contains a plaintext short-lived credential — it is intentionally returned in the response body so the user can connect
- The raw token is **never** stored in the database; only its SHA-256 hash is persisted
- Tokens are single-use: after the SSH server validates a token, it marks it as used (`used_at` timestamp set), preventing replay
- Tokens auto-expire after 5 minutes regardless of use
- Expired tokens are hard-deleted by the cleanup scheduler (not soft-deleted)
- The `command` string contains the raw token — screen sharing, terminal recording, or log scraping may capture it; this is an accepted trade-off for usability
- The CLI does not log the SSH command or token to any file
- The TUI does not persist SSH connection info to disk
- The TUI uses the terminal's alternate screen buffer, so SSH info is cleared from scrollback on exit

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workspace.ssh_info.requested` | SSH info endpoint called | `workspace_id`, `repo_owner`, `repo_name`, `client` (api/cli/tui/web), `has_vm_id` (boolean), `response_time_ms` |
| `workspace.ssh_info.token_generated` | New sandbox access token created | `workspace_id`, `repo_owner`, `repo_name`, `token_type` ("ssh"), `ttl_ms` (300000) |
| `workspace.ssh_info.token_validated` | SSH server validates token on connect | `workspace_id`, `vm_id`, `token_age_ms`, `validation_result` (success/expired/used/not_found) |
| `workspace.ssh_info.token_expired` | Cleanup deletes expired token | `workspace_id`, `token_age_ms`, `was_used` (boolean) |
| `cli.workspace.ssh.started` | CLI `workspace ssh` command invoked | `repo_owner`, `repo_name`, `workspace_id`, `auto_detected` (boolean), `auto_created` (boolean) |
| `cli.workspace.ssh.connected` | CLI successfully opens SSH session | `repo_owner`, `repo_name`, `workspace_id`, `poll_attempts`, `total_wait_ms` |
| `cli.workspace.ssh.timeout` | CLI polling times out | `repo_owner`, `repo_name`, `workspace_id`, `poll_attempts`, `timeout_ms` |
| `tui.workspace.ssh_info.viewed` | TUI renders SSH info section | `repo_owner`, `repo_name`, `workspace_id`, `terminal_columns`, `terminal_rows` |
| `tui.workspace.ssh_info.command_copied` | User presses `c` in TUI | `repo_owner`, `repo_name`, `workspace_id`, `copy_success` |
| `tui.workspace.ssh_info.refreshed` | User presses `r` in TUI | `repo_owner`, `repo_name`, `workspace_id`, `refresh_success`, `duration_ms` |

**Never included in events**: `access_token`, `command`, `token_hash`, or any raw credential material.

### Funnel Metrics & Success Indicators

- **SSH info retrieval success rate**: % of `ssh_info.requested` events where `has_vm_id=true`. Target: >90% for running workspaces.
- **CLI SSH connect success rate**: % of `cli.workspace.ssh.started` events that result in a `cli.workspace.ssh.connected` event. Target: >85%.
- **Median time to SSH**: Time from `cli.workspace.ssh.started` to `cli.workspace.ssh.connected`. Target: <15s for already-running workspaces.
- **Token utilization rate**: % of generated tokens that are successfully validated (vs. expiring unused). Target: >50%.
- **TUI copy rate**: % of `tui.workspace.ssh_info.viewed` followed by `tui.workspace.ssh_info.command_copied`. Target: >60%.
- **Token refresh rate**: % of TUI sessions with at least one manual refresh. Target: <20% (indicates tokens last long enough).

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------|
| `info` | Workspace SSH info requested | `workspace_id`, `repository_id`, `user_id`, `has_vm_id` |
| `info` | Sandbox access token generated | `workspace_id`, `vm_id`, `user_id`, `token_type`, `expires_at` |
| `info` | Sandbox access token validated | `workspace_id`, `vm_id`, `validation_result` |
| `info` | SSH session established via workspace token | `workspace_id`, `vm_id`, `linux_user` |
| `warn` | SSH info requested for workspace with no VM | `workspace_id`, `repository_id` |
| `warn` | Sandbox client unavailable when SSH info requested | `workspace_id` |
| `warn` | Token validation failed (expired) | `workspace_id`, `vm_id`, `token_age_ms` |
| `warn` | Token validation failed (already used) | `workspace_id`, `vm_id` |
| `warn` | CLI SSH polling timeout | `workspace_id`, `poll_attempts`, `timeout_ms` |
| `error` | Token generation failed (DB error) | `workspace_id`, `error_message` |
| `error` | Cleanup scheduler failed to delete expired tokens | `error_message`, `batch_size` |
| `debug` | CLI SSH poll attempt | `workspace_id`, `attempt_number`, `status_code` |
| `debug` | Expired tokens cleaned up | `count_deleted` |

**Critical rule**: The raw `access_token` and `command` values are **never** logged at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_ssh_info_requests_total` | Counter | `status` (200/404/500), `has_vm_id` | Total SSH info endpoint requests |
| `codeplane_workspace_ssh_info_duration_seconds` | Histogram | — | SSH info endpoint latency |
| `codeplane_sandbox_access_tokens_generated_total` | Counter | `token_type` (ssh) | Total tokens generated |
| `codeplane_sandbox_access_tokens_validated_total` | Counter | `result` (success/expired/used/not_found) | Token validation outcomes |
| `codeplane_sandbox_access_tokens_active` | Gauge | — | Count of non-expired, non-used tokens |
| `codeplane_sandbox_access_tokens_expired_cleaned_total` | Counter | — | Total expired tokens cleaned up |
| `codeplane_cli_workspace_ssh_poll_attempts` | Histogram | `outcome` (success/timeout/error) | Poll attempts before SSH ready |
| `codeplane_cli_workspace_ssh_connect_duration_seconds` | Histogram | — | Time from CLI invocation to SSH session |

### Alerts

**Alert 1: SSH Info Endpoint Error Rate > 5%**
- Condition: `rate(codeplane_workspace_ssh_info_requests_total{status=~"5.."}[5m]) / rate(codeplane_workspace_ssh_info_requests_total[5m]) > 0.05`
- Severity: Warning
- Runbook: (1) Check if sandbox client is available — look for "sandbox client unavailable" in logs. (2) If sandbox client is down, check container runtime health and restart if necessary. (3) If DB errors, check database connectivity and `sandbox_access_tokens` table health. (4) Check recent deployments for regressions. (5) Verify workspace service initialization in service registry.

**Alert 2: Token Generation Failures**
- Condition: `rate(codeplane_sandbox_access_tokens_generated_total[5m]) == 0` when `rate(codeplane_workspace_ssh_info_requests_total{status="200"}[5m]) > 0`
- Severity: Critical
- Runbook: (1) Check database write availability for `sandbox_access_tokens` table. (2) Check for table locks or deadlocks. (3) Verify crypto functions (`randomUUID()`, `createHash("sha256")`) are working. (4) Check disk space on DB volume. (5) Examine recent schema migrations.

**Alert 3: Active Token Count > 10,000**
- Condition: `codeplane_sandbox_access_tokens_active > 10000`
- Severity: Warning
- Runbook: (1) Check if cleanup scheduler is running. (2) If stuck, restart server. (3) Check for runaway clients polling SSH info. (4) Manual cleanup: `DELETE FROM sandbox_access_tokens WHERE expires_at < NOW()`. (5) Review rate limiting.

**Alert 4: CLI SSH Connect Success Rate < 80%**
- Condition: Success rate below 80% over 1 hour
- Severity: Warning
- Runbook: (1) Check workspace provisioning pipeline for stuck workspaces. (2) Check SSH server health. (3) Review `workspace-exec` handler logs. (4) Check network connectivity. (5) Verify DNS for `sshHost`.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Recovery |
|------------|-------------|----------|
| Workspace not found | 404 | Verify workspace ID and permissions |
| Workspace has no VM | 404 (null) | Wait for provisioning |
| Sandbox client unavailable | 500 | Admin checks container runtime |
| DB insert failure for token | 500 | Retry; check DB health |
| Token expired before use | SSH auth failure | Request new SSH info |
| Token already used | SSH auth failure | Request new SSH info |
| Rate limited | 429 | Wait and retry after Retry-After |
| Auth token expired | 401 | Re-authenticate via `codeplane auth login` |
| CLI poll timeout | Client error | Increase timeout or check workspace status |
| SSH connection refused | Network error | Check SSH server is running |

## Verification

### API Integration Tests

- `WORKSPACE_SSH_INFO > returns SSH connection info for a running workspace` — Create workspace, provision VM, GET SSH info → 200 with all fields populated, `command` matches format `ssh {vm_id}+{username}:{token}@{host}`
- `WORKSPACE_SSH_INFO > returns 404 for non-existent workspace` — GET SSH info with random UUID → 404
- `WORKSPACE_SSH_INFO > returns 404 for workspace without VM` — Create workspace (no VM provisioned), GET SSH info → 404
- `WORKSPACE_SSH_INFO > returns 400 for missing workspace id` — GET with empty id → 400
- `WORKSPACE_SSH_INFO > returns 401 for unauthenticated request` — GET without auth → 401
- `WORKSPACE_SSH_INFO > returns 500 when sandbox client is unavailable` — No sandbox configured → 500 "sandbox client unavailable"
- `WORKSPACE_SSH_INFO > generates a unique token on each request` — Call SSH info twice → two different `access_token` values
- `WORKSPACE_SSH_INFO > token hash is stored in database` — Call SSH info → verify `sandbox_access_tokens` row exists with SHA-256 hash
- `WORKSPACE_SSH_INFO > token has 5-minute expiry` — Verify `expires_at` is ~300s from now (within 2s tolerance)
- `WORKSPACE_SSH_INFO > expired tokens are rejected on validation` — Generate token, advance clock past 5 minutes, validate → not found
- `WORKSPACE_SSH_INFO > used tokens are rejected on validation` — Generate token, mark as used, validate → not found
- `WORKSPACE_SSH_INFO > response includes correct ssh_host format` — `ssh_host` equals `{vm_id}+{username}@{host}`
- `WORKSPACE_SSH_INFO > response port is always 22` — `port` is `22`
- `WORKSPACE_SSH_INFO > response session_id is empty for workspace-level` — `session_id` is `""`
- `WORKSPACE_SSH_INFO > workspace scoped to user and repository` — User A creates workspace, User B requests SSH info → 404
- `WORKSPACE_SSH_INFO > handles concurrent requests without conflict` — 10 concurrent requests → all 200 with unique tokens
- `WORKSPACE_SSH_INFO > cleanup scheduler deletes expired tokens` — Create tokens, advance time, trigger cleanup → tokens deleted
- `WORKSPACE_SSH_INFO > maximum vm_id length (255 chars) produces valid command` — 255-char VM ID → valid command string
- `WORKSPACE_SSH_INFO > vm_id exceeding 256 chars is handled gracefully` — Oversized VM IDs truncate or error predictably

### Session SSH Info API Tests

- `WORKSPACE_SESSION_SSH_INFO > returns SSH info for active session` — Create session, GET session SSH → 200 with populated `session_id`
- `WORKSPACE_SESSION_SSH_INFO > persists SSH info to session record` — Call session SSH → session row updated
- `WORKSPACE_SESSION_SSH_INFO > marks session as running` — Call session SSH → session status is "running"

### CLI Integration Tests

- `CLI workspace ssh > connects to existing running workspace` — Create running workspace, `codeplane workspace ssh {id}` → SSH session opens
- `CLI workspace ssh > auto-detects workspace when id omitted` — Existing workspace, `codeplane workspace ssh` → connects
- `CLI workspace ssh > prefers running workspace over non-running` — Suspended + running workspaces → connects to running
- `CLI workspace ssh > creates workspace when none exist` — No workspaces → workspace created, SSH established
- `CLI workspace ssh > times out when workspace never becomes SSH-ready` — Workspace stuck pending, short timeout → error message
- `CLI workspace ssh > respects custom poll interval` — `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS=500` → faster polling
- `CLI workspace ssh > respects custom poll timeout` — `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS=5000` → timeout at ~5s
- `CLI workspace ssh > respects custom connect timeout` — `ConnectTimeout` matches env var
- `CLI workspace ssh > retries on 404` — First 404, second success → connects
- `CLI workspace ssh > retries on 409` — First 409, second success → connects
- `CLI workspace ssh > retries on 502/503/504` — Transient errors → retried and succeeds
- `CLI workspace ssh > does not retry on 401` — 401 → immediately throws
- `CLI workspace ssh > does not retry on 403` — 403 → immediately throws
- `CLI workspace ssh > uses custom known_hosts file` — `UserKnownHostsFile=~/.codeplane/ssh/known_hosts` in args
- `CLI workspace ssh > sets BatchMode=yes` — Verified in SSH args
- `CLI workspace ssh > sets StrictHostKeyChecking=accept-new` — Verified in SSH args
- `CLI workspace ssh > handles empty ssh command gracefully` — Error "workspace ssh command was empty"

### TUI Snapshot Tests

- `TUI_WORKSPACE_SSH_INFO > renders SSH connection info for running workspace at 120x40`
- `TUI_WORKSPACE_SSH_INFO > renders at 80x24 compact layout`
- `TUI_WORKSPACE_SSH_INFO > renders at 200x60 expanded layout`
- `TUI_WORKSPACE_SSH_INFO > renders waiting state for starting workspace`
- `TUI_WORKSPACE_SSH_INFO > renders suspended workspace message`
- `TUI_WORKSPACE_SSH_INFO > renders stopped workspace message`
- `TUI_WORKSPACE_SSH_INFO > renders token expiring warning (yellow)`
- `TUI_WORKSPACE_SSH_INFO > renders token expired state (red)`
- `TUI_WORKSPACE_SSH_INFO > renders refreshing state with spinner`
- `TUI_WORKSPACE_SSH_INFO > renders error state on fetch failure`
- `TUI_WORKSPACE_SSH_INFO > command truncated at minimum terminal width`

### TUI Keyboard Interaction Tests

- `TUI_WORKSPACE_SSH_INFO > c copies SSH command to clipboard`
- `TUI_WORKSPACE_SSH_INFO > c on non-running workspace is no-op`
- `TUI_WORKSPACE_SSH_INFO > y copies ssh_host to clipboard`
- `TUI_WORKSPACE_SSH_INFO > r refreshes SSH connection info`
- `TUI_WORKSPACE_SSH_INFO > r during refresh is ignored`
- `TUI_WORKSPACE_SSH_INFO > r on non-running workspace is no-op`
- `TUI_WORKSPACE_SSH_INFO > auto-refresh triggers on token expiry`
- `TUI_WORKSPACE_SSH_INFO > copy captures full command even when truncated`

### TUI Responsive Tests

- `TUI_WORKSPACE_SSH_INFO > resize from 120x40 to 80x24 collapses fields`
- `TUI_WORKSPACE_SSH_INFO > resize from 80x24 to 120x40 expands fields`
- `TUI_WORKSPACE_SSH_INFO > resize below minimum shows terminal too small`
- `TUI_WORKSPACE_SSH_INFO > resize back above minimum restores SSH info`

### E2E Integration Tests

- `WORKSPACE_SSH_INFO e2e > full flow: create workspace, provision, get SSH info, connect`
- `WORKSPACE_SSH_INFO e2e > SSH info re-fetched after workspace resume`
- `WORKSPACE_SSH_INFO e2e > token validation succeeds within TTL`
- `WORKSPACE_SSH_INFO e2e > token validation fails after TTL`
- `WORKSPACE_SSH_INFO e2e > token validation fails after use`
- `WORKSPACE_SSH_INFO e2e > cleanup removes expired tokens`
- `WORKSPACE_SSH_INFO e2e > concurrent token generation is safe` — 20 concurrent requests → 20 distinct valid tokens
- `WORKSPACE_SSH_INFO e2e > workspace deletion invalidates SSH info`

# WORKSPACE_SESSION_SSH_INFO

Specification for WORKSPACE_SESSION_SSH_INFO.

## High-Level User POV

When a developer has created a workspace session within a Codeplane workspace — typically through the web terminal, TUI, or CLI — they need SSH connection details specific to that session. The Workspace Session SSH Info feature provides a session-scoped SSH connection that is aware of the session's terminal dimensions, activity tracking, and lifecycle state.

Unlike workspace-level SSH info which gives general access to the workspace's underlying VM, session SSH info is tied to a specific interactive session. This means the system knows exactly who is connected, tracks session-level activity for idle timeout purposes, and can manage the lifecycle of each individual connection. When the last session disconnects, the workspace can automatically suspend to save resources.

From the user's perspective, the flow is straightforward: they create a workspace session (either explicitly or as part of opening a terminal), and then request SSH connection details for that session. The system hands back a single ready-to-run SSH command containing a short-lived access token. The token is valid for 5 minutes and is single-use — once the SSH connection is established, the token cannot be replayed by anyone who might have captured it.

If the workspace's underlying VM isn't currently running when session SSH info is requested, Codeplane automatically starts it. This means a user can resume a suspended workspace simply by requesting SSH info for a session — the system handles the orchestration transparently. The session is marked as "running" and activity timestamps are updated, ensuring that idle timeout tracking begins from the moment the user connects.

In the TUI and web terminal, this manifests as an automatic behind-the-scenes step: when the user opens a terminal panel for a workspace, the client creates a session and fetches its SSH info to establish the connection. The CLI's `workspace ssh` command can also leverage session SSH info when operating in session-aware mode. Across all surfaces, the user experiences a seamless path from "I want a terminal in my workspace" to an active SSH connection, without manual key management, host configuration, or credential handling.

## Acceptance Criteria

### Definition of Done

- An authenticated user with member-level (or higher) access to a repository can retrieve SSH connection info for any workspace session they own within that repository
- The session SSH info response includes all fields: `workspace_id`, `session_id`, `vm_id`, `host`, `ssh_host`, `username`, `port`, `access_token`, and `command`
- The `session_id` field is populated with the actual session UUID (not empty string, unlike workspace-level SSH info)
- The `command` field contains a complete, ready-to-execute SSH command in the format `ssh <vm_id>+<username>:<token>@<host>`
- The `access_token` is a freshly generated UUID v4, valid for exactly 5 minutes (300,000ms) from creation
- The raw token is SHA-256 hashed before database storage; only the raw token is returned in the response
- Each call generates a new, unique token — tokens are never reused
- If the workspace's underlying VM is not currently running, the service automatically starts it before returning SSH info
- The workspace status is updated to `running` if the VM is started
- The SSH connection info JSON is persisted to the session record (`ssh_connection_info` column)
- The session status is updated to `running` if it was not already running
- Both workspace and session activity timestamps (`last_activity_at`) are touched on each SSH info retrieval
- A `workspace.session` SSE notification is emitted with status `running` when the session transitions
- The endpoint returns `404` when the session does not exist, the user lacks access, or the workspace has no provisioned VM
- The endpoint returns `400` when the session ID parameter is missing or empty
- The endpoint returns `500` with message `"sandbox client unavailable"` when no container runtime is configured
- Expired sandbox access tokens are periodically deleted by the cleanup scheduler

### Boundary Constraints

- `session_id` (path parameter): UUID format, exactly 36 characters; must be a valid UUID
- `workspace_id` (in response): UUID format, 36 characters
- `vm_id`: non-empty string after trimming; if the associated workspace's `freestyle_vm_id` is empty after trim, returns `null` (404 at the route level)
- `host`: defaults to `localhost` for Community Edition; configurable via `WorkspaceService` constructor
- `username`: defaults to `root`; maximum 32 characters (Linux username limit)
- `port`: always `22` (integer, valid range 1–65535)
- `access_token`: UUID v4 format, exactly 36 characters
- `command`: maximum practical length ~200 characters (composed of host + vm_id + token)
- `ssh_host`: format `{vm_id}+{username}@{host}`, maximum ~150 characters
- Token TTL: fixed at 300,000 milliseconds (5 minutes); not configurable by the client
- `ssh_connection_info` persisted to session: JSON-serialized `WorkspaceSSHConnectionInfo`, maximum ~500 bytes
- Session `cols` and `rows`: non-negative integers; `cols` range 0–65535, `rows` range 0–65535

### Edge Cases

- Requesting SSH info for a session whose workspace has status `pending` or `starting` but no VM: returns `null` (404 response)
- Requesting SSH info for a session whose workspace has a VM in `stopped` state: the service auto-starts the VM before generating the token
- Requesting SSH info for a session whose workspace has a VM in `paused` state: the service auto-starts the VM
- Session exists but associated workspace does not (orphaned session): returns `null` (404 response)
- Session belongs to a different user: returns `null` (404 response) — no information leakage about existence
- Session belongs to a different repository: returns `null` (404 response)
- Concurrent SSH info requests for the same session: each generates a distinct token; all are valid until their respective expiry times
- Token used after expiry (5 minutes): SSH server rejects authentication; user must request new SSH info
- Token used after being marked as single-use: SSH server rejects (the `used_at IS NULL` check fails)
- Workspace deleted between SSH info retrieval and actual SSH connection attempt: SSH server rejects (no matching VM)
- Session destroyed between SSH info retrieval and SSH connection: token is still valid until expiry (the token is workspace-scoped, not session-scoped in the access token table)
- Sandbox client (container runtime) becomes unavailable after server startup: returns 500 "sandbox client unavailable"
- VM start fails during auto-start: the error propagates as a 500 and the session SSH info is not generated
- Empty `id` route parameter: returns 400 `"session id is required"`
- Non-UUID format `id` parameter: returns 404 (database lookup returns no match)
- Requesting SSH info for an already `stopped` session: the service still generates info if the workspace has a VM (the session status is updated back to `running`)
- Requesting SSH info for a `failed` session: same behavior as stopped — SSH info is generated and status updated to `running`

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Repository owner username |
| `repo` | string | Yes | Repository name |
| `id` | string (UUID) | Yes | Workspace session ID |

**Response 200** (`WorkspaceSSHConnectionInfo`):
```json
{
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
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
|--------|------|----------|
| 400 | `{ "message": "session id is required" }` | Missing or empty `id` parameter |
| 404 | `{ "message": "workspace session not found" }` | Session doesn't exist, user lacks access, workspace has no VM, or workspace not found |
| 500 | `{ "message": "sandbox client unavailable" }` | No container runtime configured |
| 429 | Rate limit error | Too many requests |

**Behavioral differences from workspace-level SSH info (`/workspaces/:id/ssh`)**:

1. The `session_id` field in the response is populated with the actual session UUID (workspace-level returns `""`)
2. The service auto-starts the workspace VM if it is not running (workspace-level does not)
3. The SSH connection info is persisted to the session record's `ssh_connection_info` column
4. The session status is transitioned to `running` if not already
5. Both session and workspace activity timestamps are touched
6. A `workspace.session` SSE event is emitted for status changes

### SDK Shape

**Interface**: `WorkspaceSSHConnectionInfo`
```typescript
interface WorkspaceSSHConnectionInfo {
  workspace_id: string;   // UUID of the parent workspace
  session_id: string;     // UUID of this session (non-empty for session-level)
  vm_id: string;          // Container/VM identifier
  host: string;           // SSH server hostname (default: "localhost")
  ssh_host: string;       // Formatted as "{vmId}+{username}@{host}"
  username: string;       // Linux user (default: "root")
  port: number;           // SSH port (always 22)
  access_token: string;   // Short-lived UUID token (5-minute TTL)
  command: string;        // Ready-to-execute SSH command string
}
```

**Service method**: `WorkspaceService.getSSHConnectionInfo(sessionID: string, repositoryID: number, userID: number): Promise<WorkspaceSSHConnectionInfo | null>`

The method performs these steps in order:
1. Validates the sandbox client is available (throws if not)
2. Looks up the session by ID, repository ID, and user ID
3. Returns `null` if session not found
4. Looks up the parent workspace by the session's workspace ID, repository ID, and user ID
5. Returns `null` if workspace not found
6. Extracts and trims `freestyleVmId`; returns `null` if empty
7. Checks VM status via sandbox client; auto-starts if not running; updates workspace status to `running`
8. Generates a UUID v4 token
9. SHA-256 hashes the token
10. Stores the hash in `sandbox_access_tokens` with 5-minute expiry
11. Constructs the `WorkspaceSSHConnectionInfo` response
12. Persists the SSH info JSON to the session record
13. Marks the session as `running` if not already
14. Touches activity timestamps on both workspace and session
15. Emits `workspace.session` SSE notification with status `running`
16. Returns the `WorkspaceSSHConnectionInfo` with the raw (unhashed) token

### Web UI Design

The web terminal dock uses session SSH info transparently:

1. When the user opens a terminal panel for a workspace, the UI creates a workspace session via `POST /api/repos/:owner/:repo/workspace/sessions`
2. The UI immediately fetches SSH info for the session via `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh`
3. The returned SSH command/credentials are used to establish the terminal connection
4. The terminal panel shows a connection indicator; if the SSH info request fails, a retry button and error message are displayed
5. The session's SSE stream (`/workspace/sessions/:id/stream`) is subscribed to track status changes

The user does not see the SSH info directly in the web UI — it is consumed programmatically by the terminal component.

### TUI UI

In the TUI workspace detail view, when a session is active:

- The SSH Connection section displays session-specific connection details
- The `session_id` is shown in expanded layouts (200×60+)
- Token countdown behavior matches the workspace-level spec: `Xm Ys` format, yellow at <60s, red at expired, auto-refresh on expiry
- Keybindings: `c` to copy command, `y` to copy host, `r` to refresh
- The TUI uses `useWorkspaceSSH` for workspace-level info and would use a corresponding session-level hook for session-scoped connections

### CLI Command

The CLI does not currently expose a dedicated `codeplane workspace session ssh <session-id>` subcommand. The existing `codeplane workspace ssh` command uses the workspace-level SSH info endpoint. However, the session SSH endpoint is consumed internally by the web terminal component, the TUI workspace detail screen, and any programmatic client that needs session-scoped SSH access.

### Documentation

1. **"Workspace Sessions and SSH Access"** guide — explains the difference between workspace-level and session-level SSH info, when each is used, session lifecycle, auto-start behavior, activity tracking, and idle timeout implications
2. **API reference for `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh`** — full parameter documentation, response schema, error codes, behavioral notes (auto-start, activity touch, session status transition), token lifecycle
3. **"Understanding Sandbox Access Tokens"** section — token generation, SHA-256 hashing, single-use enforcement, 5-minute TTL, cleanup scheduling, security properties
4. **Session lifecycle documentation** — how sessions transition between states, relationship to workspace lifecycle, auto-suspend when last session disconnects

## Permissions & Security

### Authorization

| Action | Anonymous | Read-Only | Member | Admin | Owner |
|--------|-----------|-----------|--------|-------|-------|
| Retrieve session SSH info | ❌ | ❌ | ✅ | ✅ | ✅ |
| Generate sandbox access token via session | ❌ | ❌ | ✅ | ✅ | ✅ |
| Auto-start workspace VM via session SSH | ❌ | ❌ | ✅ | ✅ | ✅ |

- The endpoint requires authentication (session cookie or PAT)
- The session query is scoped to the requesting user's ID and the repository ID — users can only access SSH info for sessions they own within repositories they have member-level access to
- The service performs a double lookup: first the session (scoped to user + repo), then the parent workspace (also scoped to user + repo). Both must pass.
- Read-only collaborators cannot access session SSH info
- Anonymous access is never permitted
- Admin and Owner roles can only access their own sessions (sessions are user-scoped, not org-scoped)

### Rate Limiting

- Standard platform rate limit applies: 5,000 requests per hour per authenticated user
- Each session SSH info request generates a new database record (sandbox access token) — the cleanup scheduler prevents unbounded table growth
- The endpoint may also trigger a VM start, which is a heavier operation — the container runtime should have its own concurrency limits
- No additional per-endpoint rate limiting beyond the platform default, but monitoring should flag users generating >100 tokens per hour as potential abuse
- Clients that poll this endpoint should use at least 3-second intervals (the CLI enforces this as the default)

### Data Privacy & Token Security

- The `access_token` is a plaintext short-lived credential returned in the response body for the user to connect
- The raw token is **never** stored in the database — only its SHA-256 hash is persisted
- Tokens are single-use: after the SSH server validates a token and establishes a connection, it sets `used_at`, preventing replay attacks
- Tokens auto-expire after exactly 5 minutes regardless of whether they are used
- Expired tokens are hard-deleted from the database by the cleanup scheduler (not soft-deleted)
- The SSH connection info JSON persisted to the session record **does** contain the raw token — this is an implementation detail that should be reviewed for security hardening (the persisted version could omit or redact the token)
- The `command` string contains the raw token — screen sharing, terminal recording, or log scraping may capture it; this is an accepted usability trade-off
- No PII beyond user ID is stored in the sandbox access token record
- Session SSH info is not cached at any layer — each request generates fresh credentials

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workspace.session.ssh_info.requested` | Session SSH info endpoint called | `session_id`, `workspace_id`, `repo_owner`, `repo_name`, `client` (api/cli/tui/web), `response_status` (200/404/500), `response_time_ms` |
| `workspace.session.ssh_info.token_generated` | New sandbox access token created for session | `session_id`, `workspace_id`, `repo_owner`, `repo_name`, `token_type` ("ssh"), `ttl_ms` (300000) |
| `workspace.session.ssh_info.vm_auto_started` | VM auto-started because it was not running | `session_id`, `workspace_id`, `vm_id`, `previous_vm_state`, `start_duration_ms` |
| `workspace.session.ssh_info.session_activated` | Session transitioned to "running" via SSH info request | `session_id`, `workspace_id`, `previous_status` |
| `workspace.session.ssh_info.token_validated` | SSH server validates a session-scoped token | `session_id`, `workspace_id`, `vm_id`, `token_age_ms`, `validation_result` (success/expired/used/not_found) |
| `workspace.session.ssh_info.token_expired` | Cleanup deletes expired session token | `workspace_id`, `token_age_ms`, `was_used` (boolean) |

**Never included in events**: `access_token`, `command`, `token_hash`, `ssh_connection_info`, or any raw credential material.

### Funnel Metrics & Success Indicators

- **Session SSH info retrieval success rate**: % of `session.ssh_info.requested` events with `response_status=200`. Target: >85% for sessions tied to running workspaces.
- **VM auto-start rate**: % of session SSH info requests that trigger a VM auto-start. This indicates how often users access sessions on suspended workspaces. Target: <30% (most sessions should be for already-running workspaces).
- **VM auto-start success rate**: % of `vm_auto_started` events that succeed vs. fail. Target: >95%.
- **Session activation rate**: % of created sessions that reach "running" via SSH info. Target: >90%.
- **Token utilization rate**: % of generated tokens that are successfully validated (vs. expiring unused). Target: >50%.
- **Median time to session SSH info**: `response_time_ms` for 200 responses, excluding VM auto-start time. Target: <500ms.
- **Median time to session SSH info with auto-start**: `response_time_ms` for requests that trigger VM start. Target: <10s.

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------||
| `info` | Session SSH info requested | `session_id`, `workspace_id`, `repository_id`, `user_id` |
| `info` | Sandbox access token generated for session | `session_id`, `workspace_id`, `vm_id`, `user_id`, `token_type`, `expires_at` |
| `info` | VM auto-started for session SSH | `session_id`, `workspace_id`, `vm_id`, `previous_state`, `duration_ms` |
| `info` | Session marked as running | `session_id`, `workspace_id`, `previous_status` |
| `info` | Session SSE notification emitted | `session_id`, `status` |
| `warn` | Session SSH info requested but workspace has no VM | `session_id`, `workspace_id`, `repository_id` |
| `warn` | Session SSH info requested but session not found | `session_id`, `repository_id`, `user_id` |
| `warn` | Session SSH info requested but workspace not found (orphaned session) | `session_id`, `workspace_id` |
| `warn` | Sandbox client unavailable when session SSH info requested | `session_id` |
| `warn` | VM auto-start failed | `session_id`, `workspace_id`, `vm_id`, `error_message` |
| `warn` | Token validation failed (expired) for session token | `session_id`, `workspace_id`, `vm_id`, `token_age_ms` |
| `warn` | Token validation failed (already used) for session token | `session_id`, `workspace_id`, `vm_id` |
| `error` | Token generation failed (DB error) | `session_id`, `workspace_id`, `error_message` |
| `error` | SSH info persistence to session record failed | `session_id`, `error_message` |
| `error` | Session status update failed | `session_id`, `target_status`, `error_message` |
| `debug` | Session activity timestamp touched | `session_id`, `workspace_id` |
| `debug` | Workspace activity timestamp touched via session | `workspace_id` |

**Critical rule**: The raw `access_token`, `command`, and `ssh_connection_info` JSON are **never** logged at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_session_ssh_info_requests_total` | Counter | `status` (200/400/404/500), `vm_auto_started` (true/false) | Total session SSH info endpoint requests |
| `codeplane_workspace_session_ssh_info_duration_seconds` | Histogram | `vm_auto_started` (true/false) | Session SSH info endpoint latency (including VM start time if applicable) |
| `codeplane_workspace_session_vm_auto_start_total` | Counter | `result` (success/failure) | Total VM auto-starts triggered by session SSH info |
| `codeplane_workspace_session_vm_auto_start_duration_seconds` | Histogram | — | Duration of VM auto-start operations |
| `codeplane_workspace_session_ssh_tokens_generated_total` | Counter | `token_type` (ssh) | Total tokens generated for session SSH |
| `codeplane_workspace_session_ssh_tokens_validated_total` | Counter | `result` (success/expired/used/not_found) | Token validation outcomes for session tokens |
| `codeplane_workspace_session_activations_total` | Counter | `previous_status` | Sessions transitioned to "running" via SSH info |
| `codeplane_sandbox_access_tokens_active` | Gauge | — | Count of non-expired, non-used tokens (shared with workspace-level) |
| `codeplane_sandbox_access_tokens_expired_cleaned_total` | Counter | — | Total expired tokens cleaned up (shared with workspace-level) |

### Alerts

**Alert 1: Session SSH Info Endpoint Error Rate > 5%**
- Condition: `rate(codeplane_workspace_session_ssh_info_requests_total{status=~"5.."}[5m]) / rate(codeplane_workspace_session_ssh_info_requests_total[5m]) > 0.05`
- Severity: Warning
- **Runbook**: (1) Check if sandbox client is available — grep logs for `"sandbox client unavailable"` with `session_id` context. (2) If sandbox client is down, check container runtime health (`docker ps` or `podman ps`) and restart if necessary. (3) If DB errors appear, check database connectivity and verify `sandbox_access_tokens` table is accessible and not locked. (4) Check if VM auto-starts are failing — review `codeplane_workspace_session_vm_auto_start_total{result="failure"}` for spikes. (5) Check recent deployments for regressions in the workspace service. (6) Verify the service registry initialization includes the workspace service with a valid sandbox client.

**Alert 2: VM Auto-Start Failure Rate > 10%**
- Condition: `rate(codeplane_workspace_session_vm_auto_start_total{result="failure"}[5m]) / rate(codeplane_workspace_session_vm_auto_start_total[5m]) > 0.10`
- Severity: Critical
- **Runbook**: (1) Check container runtime resource availability — disk space, memory, CPU. (2) Review VM error logs for the failing `vm_id` values. (3) Check if the container images are available and not corrupted. (4) Verify Docker/Podman daemon is healthy. (5) Check for OOM kills or cgroup limit breaches. (6) If specific VMs are failing, check if their containers are in a corrupted state and need manual cleanup. (7) Consider temporarily disabling auto-start and notifying affected users.

**Alert 3: Session SSH Info Latency p95 > 15s**
- Condition: `histogram_quantile(0.95, rate(codeplane_workspace_session_ssh_info_duration_seconds_bucket[5m])) > 15`
- Severity: Warning
- **Runbook**: (1) Check if the latency spike correlates with VM auto-starts — compare `codeplane_workspace_session_ssh_info_duration_seconds{vm_auto_started="true"}` vs `false`. (2) If auto-start is the cause, check container runtime performance and consider pre-warming VMs. (3) If non-auto-start requests are slow, check database query performance for workspace/session lookups. (4) Check `sandbox_access_tokens` table size — excessive rows slow inserts. (5) Verify cleanup scheduler is running and deleting expired tokens.

**Alert 4: Active Token Count > 10,000**
- Condition: `codeplane_sandbox_access_tokens_active > 10000`
- Severity: Warning
- **Runbook**: (1) Check if cleanup scheduler is running — look for `debug` logs with `count_deleted`. (2) If stuck, restart the server to reinitialize the scheduler. (3) Check for runaway clients generating excessive tokens. (4) Manual cleanup: `DELETE FROM sandbox_access_tokens WHERE expires_at < NOW()`. (5) Review rate limiting configuration and consider adding per-user token generation limits.

**Alert 5: Session Activation Stalls (tokens generated but no successful validations)**
- Condition: `rate(codeplane_workspace_session_ssh_tokens_generated_total[10m]) > 0.5 AND rate(codeplane_workspace_session_ssh_tokens_validated_total{result="success"}[10m]) == 0`
- Severity: Critical
- **Runbook**: (1) Check SSH server health — is it accepting connections? (2) Verify SSH server has access to validate tokens (database connectivity). (3) Check firewall rules for SSH port. (4) Verify the token validation path: the SSH server must SHA-256 hash the presented token and look up by hash. (5) Check if the SSH server's `workspace-exec` handler is correctly parsing the `vmId+username:token@host` format. (6) Look for SSH connection refused errors in client logs.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User Impact | Recovery |
|------------|-------------|-------------|----------|
| Session not found | 404 | Cannot connect | Verify session ID and permissions; create new session |
| Workspace not found (orphaned session) | 404 | Cannot connect | Session is invalid; create new session on a valid workspace |
| Workspace has no VM | 404 | Cannot connect | Wait for workspace provisioning to complete |
| Sandbox client unavailable | 500 | All session SSH blocked | Admin must check container runtime |
| DB insert failure for token | 500 | Cannot get SSH info | Retry request; admin checks DB health |
| VM auto-start fails | 500 | Cannot connect | Admin checks container runtime; user may manually resume workspace |
| SSH info persistence to session fails | 500 | Token generated but session not updated | Retry request; the token is still valid |
| Token expired before SSH connect | SSH auth rejection | Must re-request SSH info | Fetch new SSH info within 5-minute window |
| Token already used | SSH auth rejection | Must re-request SSH info | Each connection requires a fresh token |
| Rate limited | 429 | Temporarily blocked | Wait and retry after `Retry-After` header |
| Auth token expired | 401 | API access blocked | Re-authenticate via `codeplane auth login` |

## Verification

### API Integration Tests

- `WORKSPACE_SESSION_SSH_INFO > returns SSH connection info for an active session with running workspace` — Create workspace with VM, create session, GET session SSH info → 200 with all fields populated, `session_id` is non-empty, `command` matches format `ssh {vm_id}+{username}:{token}@{host}`
- `WORKSPACE_SESSION_SSH_INFO > session_id in response matches the requested session ID` — GET session SSH → `session_id` equals the path parameter
- `WORKSPACE_SESSION_SSH_INFO > workspace_id in response matches the session's parent workspace` — GET session SSH → `workspace_id` matches the session's `workspace_id`
- `WORKSPACE_SESSION_SSH_INFO > returns 404 for non-existent session ID` — GET SSH info with random UUID → 404 `"workspace session not found"`
- `WORKSPACE_SESSION_SSH_INFO > returns 404 for session belonging to different user` — User A creates session, User B requests SSH info → 404
- `WORKSPACE_SESSION_SSH_INFO > returns 404 for session belonging to different repository` — Session in repo A, request scoped to repo B → 404
- `WORKSPACE_SESSION_SSH_INFO > returns 404 when workspace has no VM (empty freestyle_vm_id)` — Create workspace without VM provisioning, create session, GET SSH → 404
- `WORKSPACE_SESSION_SSH_INFO > returns 400 for missing session id parameter` — GET with empty/no id → 400 `"session id is required"`
- `WORKSPACE_SESSION_SSH_INFO > returns 401 for unauthenticated request` — GET without auth → 401
- `WORKSPACE_SESSION_SSH_INFO > returns 500 when sandbox client is unavailable` — No sandbox configured → 500 `"sandbox client unavailable"`
- `WORKSPACE_SESSION_SSH_INFO > generates a unique token on each request` — Call session SSH info twice for same session → two different `access_token` values
- `WORKSPACE_SESSION_SSH_INFO > token hash is stored in sandbox_access_tokens table` — Call SSH info → verify `sandbox_access_tokens` row exists with SHA-256 hash of the returned token
- `WORKSPACE_SESSION_SSH_INFO > token has 5-minute expiry` — Verify `expires_at` is ~300s from now (within 2s tolerance)
- `WORKSPACE_SESSION_SSH_INFO > expired tokens are rejected on validation` — Generate token, advance clock past 5 minutes, validate by hash → not found
- `WORKSPACE_SESSION_SSH_INFO > used tokens are rejected on validation` — Generate token, mark as used, validate by hash → not found
- `WORKSPACE_SESSION_SSH_INFO > response includes correct ssh_host format` — `ssh_host` equals `{vm_id}+{username}@{host}`
- `WORKSPACE_SESSION_SSH_INFO > response port is always 22` — `port` is exactly `22` (number, not string)
- `WORKSPACE_SESSION_SSH_INFO > response username defaults to root` — `username` is `"root"`
- `WORKSPACE_SESSION_SSH_INFO > auto-starts stopped VM when requesting session SSH info` — Create workspace with stopped VM, create session, GET SSH → 200, workspace status updated to `running`
- `WORKSPACE_SESSION_SSH_INFO > auto-starts paused VM when requesting session SSH info` — Create workspace with paused VM, GET session SSH → 200, VM started
- `WORKSPACE_SESSION_SSH_INFO > persists SSH connection info to session record` — GET session SSH → query session row, verify `ssh_connection_info` column is populated with matching JSON
- `WORKSPACE_SESSION_SSH_INFO > marks session as running` — Create session (status not running), GET SSH → session status is `"running"`
- `WORKSPACE_SESSION_SSH_INFO > does not re-mark already-running session` — Session already running, GET SSH → no redundant status update
- `WORKSPACE_SESSION_SSH_INFO > touches workspace activity timestamp` — GET SSH → workspace `last_activity_at` updated
- `WORKSPACE_SESSION_SSH_INFO > touches session activity timestamp` — GET SSH → session `last_activity_at` updated
- `WORKSPACE_SESSION_SSH_INFO > emits SSE notification for session status change` — Subscribe to session stream, GET SSH (session was not running) → receive `workspace.session` event with `status: "running"`
- `WORKSPACE_SESSION_SSH_INFO > handles concurrent requests without conflict` — 10 concurrent requests for same session → all 200 with unique tokens
- `WORKSPACE_SESSION_SSH_INFO > cleanup scheduler deletes expired session tokens` — Create tokens, advance time past 5 minutes, trigger cleanup → tokens deleted
- `WORKSPACE_SESSION_SSH_INFO > maximum vm_id length (255 chars) produces valid response` — Workspace with 255-char VM ID → valid command and ssh_host strings
- `WORKSPACE_SESSION_SSH_INFO > vm_id exceeding 256 chars is handled gracefully` — Oversized VM ID → request completes without crash (may truncate or error predictably)
- `WORKSPACE_SESSION_SSH_INFO > orphaned session (workspace deleted) returns 404` — Delete workspace, request session SSH → 404

### Session-Specific Behavior Tests

- `WORKSPACE_SESSION_SSH_INFO > session SSH differs from workspace SSH by populating session_id` — Compare workspace SSH (session_id="") vs session SSH (session_id=UUID) for same workspace
- `WORKSPACE_SESSION_SSH_INFO > session SSH auto-starts VM unlike workspace SSH` — Workspace with stopped VM: workspace SSH returns null, session SSH auto-starts and returns info
- `WORKSPACE_SESSION_SSH_INFO > session SSH persists info to session record unlike workspace SSH` — After session SSH call, session row has ssh_connection_info; workspace SSH does not persist anywhere

### E2E Integration Tests

- `WORKSPACE_SESSION_SSH_INFO e2e > full flow: create workspace, create session, get session SSH info, validate token` — End-to-end happy path: workspace created → VM provisioned → session created → SSH info retrieved → token validated by hash in database
- `WORKSPACE_SESSION_SSH_INFO e2e > session SSH info re-fetched after workspace resume` — Suspend workspace → resume workspace → create new session → SSH info works
- `WORKSPACE_SESSION_SSH_INFO e2e > auto-start flow: suspended workspace, session SSH triggers start` — Suspend workspace → create session → request session SSH info → workspace auto-started → SSH info returned
- `WORKSPACE_SESSION_SSH_INFO e2e > token validation succeeds within TTL` — Generate session token → validate hash within 5 minutes → success
- `WORKSPACE_SESSION_SSH_INFO e2e > token validation fails after TTL` — Generate session token → wait >5 minutes → validate hash → not found
- `WORKSPACE_SESSION_SSH_INFO e2e > token validation fails after use` — Generate token → mark used → validate → not found
- `WORKSPACE_SESSION_SSH_INFO e2e > cleanup removes expired session tokens` — Generate tokens → advance time → trigger cleanup → tokens deleted from `sandbox_access_tokens`
- `WORKSPACE_SESSION_SSH_INFO e2e > concurrent session token generation is safe` — 20 concurrent requests for same session → 20 distinct valid tokens, no database constraint violations
- `WORKSPACE_SESSION_SSH_INFO e2e > workspace deletion invalidates session SSH info` — Create session → delete workspace → request session SSH → 404
- `WORKSPACE_SESSION_SSH_INFO e2e > session destruction after SSH info retrieval` — Get session SSH → destroy session → token still valid for SSH connection (tokens are workspace-scoped)
- `WORKSPACE_SESSION_SSH_INFO e2e > multiple sessions on same workspace get independent tokens` — Create 3 sessions on one workspace → each gets unique SSH info with unique tokens → all valid simultaneously
- `WORKSPACE_SESSION_SSH_INFO e2e > session SSH persists info then session can be queried` — Get session SSH → GET session detail → `ssh_connection_info` field present in response
- `WORKSPACE_SESSION_SSH_INFO e2e > SSE stream emits running status on session activation` — Subscribe to session stream → request session SSH (session was not running) → receive status event
- `WORKSPACE_SESSION_SSH_INFO e2e > last session destroy triggers workspace auto-suspend` — Create session → get SSH → destroy session (only active session) → workspace transitions to suspended

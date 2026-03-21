# PLATFORM_SSH_SERVER_BOOT

Specification for PLATFORM_SSH_SERVER_BOOT.

## High-Level User POV

When an administrator starts the Codeplane server, the SSH transport layer boots automatically alongside the HTTP API. This gives developers immediate access to clone, push, and pull repositories over SSH using standard `git` commands, exactly as they would with any familiar forge. The SSH server is a foundational piece of Codeplane infrastructure — it is the secure channel through which all SSH-based repository operations and workspace terminal access flow.

From a developer's perspective, the SSH server boot is invisible and seamless. Once the Codeplane server process starts, developers can add an SSH remote (e.g., `git clone ssh://git@codeplane.example.com:2222/owner/repo.git`) and interact with repositories using their registered SSH keys. There is no separate SSH daemon to manage, no external process to configure, and no additional firewall rules beyond the single SSH port. If a developer's SSH key is registered in their Codeplane profile, authentication and repository access simply work.

For platform operators, the SSH server provides sensible defaults that require zero configuration for development and small-team use. The server listens on port 2222, binds to all interfaces, auto-generates a host key on first boot if one does not exist, and gracefully degrades — if the SSH server cannot start (e.g., port conflict), the HTTP API continues to operate normally without SSH. Operators who need to customize the SSH behavior can do so through a small set of environment variables controlling the port, bind address, connection limits, and whether SSH is enabled at all.

The SSH server also provides workspace terminal access when a container runtime is available. This means developers can SSH into workspace containers for interactive development sessions, all through the same SSH endpoint. If no container runtime is detected, repository SSH continues to work while workspace SSH is gracefully disabled.

When the Codeplane server shuts down, the SSH server is stopped gracefully as part of the shutdown sequence, ensuring in-flight git operations have a chance to complete and connections are closed cleanly.

## Acceptance Criteria

## Definition of Done

The SSH server boot feature is complete when:

- The SSH server starts automatically as part of the Codeplane server boot sequence.
- Developers can clone, fetch, and push repositories over SSH using registered SSH keys.
- Deploy keys grant correctly scoped read or read/write access.
- The SSH server gracefully degrades if it cannot start, without affecting the HTTP API.
- The SSH server shuts down cleanly during server shutdown.
- All configuration is controllable via environment variables.
- Host keys are auto-generated on first boot and persisted across restarts.
- Connection limiting works at both global and per-IP levels.

## Functional Constraints

- [ ] SSH server MUST start after database initialization and service registry creation are complete.
- [ ] SSH server MUST start after feature flags are loaded.
- [ ] SSH server boot failure MUST NOT prevent the HTTP API server from starting.
- [ ] SSH server boot failure MUST be logged with the error message at ERROR level.
- [ ] SSH server MUST listen on the port specified by `CODEPLANE_SSH_PORT` (default: `2222`).
- [ ] SSH server MUST bind to the address specified by `CODEPLANE_SSH_HOST` (default: `0.0.0.0`).
- [ ] SSH server MUST be disableable by setting `CODEPLANE_SSH_ENABLED=false`.
- [ ] When disabled, the server MUST log a message indicating SSH is disabled and MUST NOT attempt to listen.
- [ ] SSH server MUST auto-generate an RSA-4096 host key if none exists at `{CODEPLANE_DATA_DIR}/ssh/ssh_host_ed25519_key`.
- [ ] Generated host key files MUST have permissions `0o600` (owner read/write only).
- [ ] Host key directory MUST be created recursively if it does not exist.
- [ ] The host key MUST persist across server restarts (written to disk, not ephemeral).
- [ ] On subsequent boots, the SSH server MUST reuse the existing host key (no regeneration).
- [ ] SSH server MUST only accept `publickey` authentication; all other methods MUST be rejected.
- [ ] SSH key lookup MUST first check user SSH keys by SHA256 fingerprint, then deploy keys.
- [ ] User key lookup MUST only match active, non-login-prohibited users.
- [ ] SHA256 fingerprints MUST use raw base64 encoding (no trailing `=` padding) with `SHA256:` prefix.
- [ ] Unauthenticated connections attempting git commands MUST receive a standard git permission-denied error.
- [ ] Global connection limit (`CODEPLANE_SSH_MAX_CONNS`) MUST reject new connections when the limit is reached. A value of `0` means unlimited.
- [ ] Per-IP connection limit (`CODEPLANE_SSH_MAX_CONNS_IP`) MUST reject new connections from an IP when that IP's limit is reached. A value of `0` means unlimited.
- [ ] Connection tracking counters MUST be decremented on connection close, even if the connection errored.
- [ ] The SSH server MUST support `git-upload-pack` (read/clone/fetch) and `git-receive-pack` (write/push) commands.
- [ ] Unsupported SSH exec commands MUST return exit code 1 with an error message.
- [ ] Interactive shell requests MUST be rejected with a message directing users to workspace SSH.
- [ ] Empty or missing exec commands MUST be rejected with an error message.
- [ ] Repository paths MUST be parsed with leading `/` stripped and trailing `.git` stripped.
- [ ] Repository path components MUST only contain alphanumeric characters, `-`, `_`, or `.`.
- [ ] Repository paths containing `..` MUST be rejected (path traversal prevention).
- [ ] Repository paths with more or fewer than exactly 2 segments (`owner/repo`) MUST be rejected.
- [ ] Repository lookups MUST be case-insensitive for both owner and repo name.
- [ ] Write operations to archived repositories MUST be denied.
- [ ] Read-only deploy keys MUST be denied write access.
- [ ] Deploy keys MUST only grant access to the specific repository they are assigned to.
- [ ] Any authenticated user MUST be able to read public repositories.
- [ ] Private repository access MUST require ownership (CE edition).
- [ ] After a successful `git-receive-pack`, JJ ref import (`jj git import`) MUST be triggered.
- [ ] JJ ref import failure MUST be non-fatal — the push is still reported as successful.
- [ ] Workspace exec commands MUST require authentication.
- [ ] Workspace exec MUST require a container sandbox runtime to be available.
- [ ] Workspace exec without a container runtime MUST return a clear error message.
- [ ] Graceful shutdown MUST stop the SSH server and resolve the shutdown promise.
- [ ] Graceful shutdown MUST occur after cleanup scheduler stop and preview cleanup.
- [ ] `ECONNRESET` errors from clients MUST be suppressed (not logged as errors).
- [ ] Non-`ECONNRESET` client errors MUST be logged at WARN level.

## Boundary Constraints

- [ ] `CODEPLANE_SSH_PORT`: integer, 1–65535. Non-integer values MUST fall back to default (`2222`).
- [ ] `CODEPLANE_SSH_HOST`: valid IPv4 address or hostname string. Default: `0.0.0.0`.
- [ ] `CODEPLANE_SSH_MAX_CONNS`: non-negative integer. Default: `0` (unlimited). Negative values treated as `0`.
- [ ] `CODEPLANE_SSH_MAX_CONNS_IP`: non-negative integer. Default: `0` (unlimited). Negative values treated as `0`.
- [ ] `CODEPLANE_DATA_DIR`: valid filesystem path with write permission. Default: `./data`.
- [ ] Repository owner/repo path segments: 1–255 characters, `[a-zA-Z0-9._-]` only.
- [ ] SSH public key data: arbitrary valid SSH key blob. Fingerprint is always SHA256 of the raw key data.

## Edge Cases

- [ ] Port already in use: SSH server boot fails, logs error, HTTP API continues.
- [ ] Host key file exists but is corrupt or unreadable: SSH server boot fails gracefully.
- [ ] Host key directory is not writable: SSH server boot fails gracefully.
- [ ] Client disconnects mid-authentication: connection counter is still decremented.
- [ ] Client disconnects mid-git-transfer: git subprocess is killed, connection counter is decremented.
- [ ] Multiple simultaneous connections from the same IP at the per-IP limit: excess connections are rejected.
- [ ] SSH key registered to a deactivated user: authentication is denied.
- [ ] SSH key registered to a login-prohibited user: authentication is denied.
- [ ] Deploy key fingerprint exists globally but not for the requested repository: permission denied.
- [ ] Repository path with only one segment (e.g., `repo` without owner): rejected as invalid.
- [ ] Repository path with three or more segments: rejected as invalid.
- [ ] Repository path with empty segments (e.g., `/owner/`): rejected as invalid.
- [ ] Repository path with unicode or special characters: rejected by safe-component check.
- [ ] `git-upload-pack` against a non-existent repository: permission denied (not "not found" to avoid enumeration).
- [ ] `git-receive-pack` against a non-existent repository: permission denied.
- [ ] Concurrent shutdown while connections are active: server close callback waits for cleanup.

## Design

## Server Boot Sequence Design

The SSH server boot is integrated into the Codeplane platform boot sequence at a specific, well-defined point:

1. **Database initialization** — `initDb()` must complete first.
2. **Service registry** — `initServices()` must complete, providing the `RepoHostService`.
3. **Feature flags** — Feature flag loading must complete.
4. **SSH server start** — `startSSHServer()` is called. This is intentionally non-blocking (fire-and-catch) so it does not delay HTTP API readiness.
5. **Cleanup scheduler** — Starts after SSH.
6. **HTTP server** — Begins accepting HTTP requests.

The SSH boot step is asynchronous and best-effort. The `.catch()` handler ensures any error from SSH startup is logged but does not propagate as an unhandled rejection.

## Configuration Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `CODEPLANE_SSH_ENABLED` | `"true"` or `"false"` | `"true"` | Master switch to enable/disable SSH server |
| `CODEPLANE_SSH_PORT` | Integer string | `"2222"` | TCP port for SSH listener |
| `CODEPLANE_SSH_HOST` | IP/hostname string | `"0.0.0.0"` | Bind address for SSH listener |
| `CODEPLANE_SSH_MAX_CONNS` | Integer string | `"0"` | Maximum total concurrent SSH connections (0 = unlimited) |
| `CODEPLANE_SSH_MAX_CONNS_IP` | Integer string | `"0"` | Maximum concurrent SSH connections per source IP (0 = unlimited) |
| `CODEPLANE_DATA_DIR` | Path string | `"./data"` | Base directory for persistent data, including SSH host keys |

## Host Key Management Design

On first boot, the SSH server generates an RSA-4096 private key in PEM (PKCS#1) format and writes it to `{CODEPLANE_DATA_DIR}/ssh/ssh_host_ed25519_key` with `0o600` file permissions. The key file name uses the Ed25519 convention for path compatibility, but the actual key is RSA-4096 due to the `ssh2` library's format requirements. On subsequent boots, the existing key is read and reused, ensuring host key stability for known-hosts verification by clients.

## Authentication Flow Design

1. Client connects and presents an SSH public key.
2. Server computes the SHA256 fingerprint of the presented key.
3. Server looks up the fingerprint against user SSH keys in the database.
   - Only active users who are not login-prohibited are considered.
4. If no user key matches, the server looks up the fingerprint against deploy keys.
5. If neither lookup succeeds, the connection is rejected with `publickey` as the only allowed method.
6. If a match is found, the authenticated principal (user or deploy key identity) is stored for the session.

## Git Transport Design

After authentication, the server handles `exec` requests containing git transport commands:

- `git-upload-pack 'owner/repo.git'` → spawns `git-upload-pack` subprocess for read operations
- `git-receive-pack 'owner/repo.git'` → spawns `git-receive-pack` subprocess for write operations

Data is piped bidirectionally between the SSH channel and the git subprocess. After a successful `git-receive-pack`, the server triggers `jj git import` to synchronize git refs into the jj repository state.

## Workspace SSH Design

When a container sandbox runtime (Docker/Podman) is available, the SSH server also handles workspace exec commands in the format `workspace-exec <workspace-id> <command>`. This allows developers to execute commands inside workspace containers over the same SSH endpoint. If no container runtime is available, workspace exec returns a clear error message while repository SSH continues to operate.

## Graceful Shutdown Design

On SIGINT or SIGTERM, the shutdown sequence proceeds in order:

1. Stop cleanup scheduler
2. Cleanup preview service
3. **Stop SSH server** — `server.close()` is called, which stops accepting new connections and resolves once existing connections complete
4. Close database connection
5. Exit process

## CLI Design

The CLI provides SSH key management commands under the `ssh-key` subcommand group:

- `codeplane ssh-key list` — List registered SSH keys
- `codeplane ssh-key add` — Add a new SSH key
- `codeplane ssh-key delete` — Remove an SSH key

These commands interact with the HTTP API, not the SSH server directly. The SSH server consumes the keys registered through these API/CLI flows.

## Web UI Design

The web UI provides SSH key management under user settings:

- **Settings → SSH Keys** — View, add, and delete SSH public keys
- Key fingerprint is displayed for identification
- Key title/label for human-readable identification
- Created date and last-used date for key lifecycle visibility

Repository clone URLs in the UI include the SSH URL format: `ssh://git@{host}:{port}/{owner}/{repo}.git`

## Documentation

The following end-user documentation should exist:

- **SSH Quick Start**: How to generate an SSH key, add it to Codeplane, and clone a repository.
- **SSH Configuration Reference**: Table of all `CODEPLANE_SSH_*` environment variables with descriptions and defaults.
- **Deploy Keys Guide**: How to create deploy keys for CI/CD systems, the difference between read-only and read-write deploy keys.
- **Troubleshooting SSH**: Common issues (port conflicts, permission denied, host key changed warnings) and resolution steps.
- **Self-Hosting SSH**: Firewall/port-forwarding guidance for exposing the SSH port, reverse proxy considerations (SSH cannot be reverse-proxied through HTTP proxies).

## Permissions & Security

## Authorization Model

| Role | SSH Repository Read | SSH Repository Write | SSH Workspace Exec | SSH Key Management (API) |
|---|---|---|---|---|
| Repository Owner | ✅ | ✅ | ✅ (if authenticated) | ✅ (own keys) |
| Authenticated User (public repo) | ✅ | ❌ | ✅ (if authenticated) | ✅ (own keys) |
| Authenticated User (private repo, not owner) | ❌ | ❌ | ✅ (if authenticated) | ✅ (own keys) |
| Deploy Key (read-only) | ✅ (scoped repo only) | ❌ | ❌ | N/A |
| Deploy Key (read-write) | ✅ (scoped repo only) | ✅ (scoped repo only) | ❌ | N/A |
| Unauthenticated | ❌ | ❌ | ❌ | ❌ |
| Admin | ✅ (all repos) | ✅ (all repos) | ✅ | ✅ (own keys) |

## Rate Limiting

- **Connection-level rate limiting**: Enforced by `CODEPLANE_SSH_MAX_CONNS` (global) and `CODEPLANE_SSH_MAX_CONNS_IP` (per-IP). Connections exceeding limits are immediately terminated (`client.end()`).
- **Authentication rate limiting**: Failed authentication attempts are logged with the remote IP. Operators should use external firewall/fail2ban integration for brute-force protection on the SSH port.
- **No application-layer per-user rate limiting** on SSH: The SSH protocol does not easily support HTTP-style rate limiting. Connection limits serve as the primary abuse prevention mechanism.

## Security Constraints

- **Host key file permissions**: MUST be `0o600`. If the file is world-readable, SSH clients will warn and the key material is at risk.
- **No password authentication**: The SSH server MUST only accept `publickey` authentication. Password-based SSH auth is never enabled.
- **Information disclosure prevention**: Repository-not-found and permission-denied errors produce the same user-facing message to prevent repository enumeration.
- **Path traversal prevention**: Repository paths with `..` segments are rejected before any filesystem access.
- **Safe component validation**: Repository path components are restricted to `[a-zA-Z0-9._-]` to prevent injection.
- **Deploy key scoping**: Deploy keys are verified against the specific repository, not just globally. A deploy key for repo A cannot access repo B.
- **Archived repository protection**: Write access to archived repositories is denied at the SSH authorization layer.
- **PII exposure**: SSH authentication logs include username and fingerprint. They MUST NOT include the raw public key material. Remote IP addresses are logged for security auditing.
- **Host key persistence**: The host key is persistent on disk. If the data directory is compromised, the host key is compromised. Operators should protect the data directory with appropriate filesystem permissions and encryption at rest.

## Telemetry & Product Analytics

## Key Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `SSHServerStarted` | SSH server successfully begins listening | `port`, `host`, `maxConnections`, `maxConnectionsPerIP`, `hostKeyGenerated` (boolean) |
| `SSHServerStartFailed` | SSH server fails to start | `errorMessage`, `port`, `host` |
| `SSHServerDisabled` | SSH is explicitly disabled via config | — |
| `SSHAuthSucceeded` | SSH public key authentication succeeds | `userId` (if user key), `isDeployKey`, `fingerprint`, `remoteIP` |
| `SSHAuthFailed` | SSH public key authentication fails | `fingerprint`, `remoteIP` |
| `SSHGitSessionStarted` | A git command begins executing over SSH | `username`, `gitCommand` (`git-upload-pack` or `git-receive-pack`), `repoOwner`, `repoName`, `remoteIP` |
| `SSHGitSessionCompleted` | A git command finishes over SSH | `username`, `gitCommand`, `repoOwner`, `repoName`, `durationMs`, `exitCode`, `remoteIP` |
| `SSHGitSessionFailed` | A git command fails over SSH | `username`, `gitCommand`, `repoOwner`, `repoName`, `durationMs`, `errorMessage`, `remoteIP` |
| `SSHConnectionRejectedLimit` | A connection is rejected due to connection limits | `remoteIP`, `limitType` (`global` or `per-ip`), `currentCount`, `maxAllowed` |
| `SSHWorkspaceExecStarted` | A workspace exec command begins | `userId`, `workspaceId`, `command`, `remoteIP` |
| `SSHWorkspaceExecCompleted` | A workspace exec command completes | `userId`, `workspaceId`, `exitCode`, `durationMs` |
| `SSHRefImportTriggered` | JJ ref import triggered after push | `repoOwner`, `repoName` |
| `SSHRefImportFailed` | JJ ref import failed (non-fatal) | `repoOwner`, `repoName`, `errorMessage` |
| `SSHServerShutdown` | SSH server has been gracefully shut down | `uptimeMs` |

## Funnel Metrics & Success Indicators

- **SSH adoption rate**: Percentage of active users who have at least one SSH key registered.
- **SSH vs HTTP transport ratio**: Ratio of git operations performed over SSH vs Smart HTTP.
- **SSH session success rate**: Percentage of SSH git sessions that complete with exit code 0.
- **SSH auth failure rate**: Percentage of SSH authentication attempts that fail (high rates indicate brute-force or misconfigured keys).
- **Mean git session duration**: Average time from session start to session end, broken down by `git-upload-pack` (fetch) and `git-receive-pack` (push).
- **Connection rejection rate**: Percentage of connection attempts rejected due to limits (indicates whether limits are too aggressive or under attack).
- **Host key regeneration events**: Number of times a host key was generated (should be 1 for the lifetime of a deployment; more indicates data loss).

## Observability

## Logging Requirements

| Log Event | Level | Structured Fields | When |
|---|---|---|---|
| SSH server disabled | INFO | — | `CODEPLANE_SSH_ENABLED=false` at boot |
| Generating SSH host key | INFO | `hostKeyPath` | First boot with no existing host key |
| SSH server listening | INFO | `host`, `port` | SSH server successfully bound |
| SSH server error | ERROR | `errorMessage` | Listener-level error on the SSH server |
| SSH auth succeeded | INFO | `userId`, `username`, `fingerprint`, `remoteIP`, `isDeployKey` | Successful public key auth |
| SSH auth failed | WARN | `fingerprint`, `remoteIP` | Failed public key auth |
| SSH auth error | ERROR | `errorMessage` | Exception during auth handler |
| SSH session start | INFO | `username`, `gitCommand`, `repoOwner`, `repoName`, `remoteIP` | Git exec command received |
| SSH session end | INFO | `username`, `gitCommand`, `repoOwner`, `repoName`, `durationMs`, `remoteIP` | Git session completed |
| SSH git proxy failed | ERROR | `gitCommand`, `repoOwner`, `repoName`, `errorMessage`, `durationMs` | Git subprocess or authorization failure |
| Failed to import refs after push | ERROR | `repoOwner`, `repoName`, `errorMessage` | JJ ref import failed (non-fatal) |
| SSH client error | WARN | `errorMessage` | Non-ECONNRESET client error |
| SSH client ECONNRESET | (suppressed) | — | Client disconnected abruptly |
| Failed to start SSH server | ERROR | `errorMessage` | SSH server boot failed |
| SSH server shut down | INFO | — | Graceful shutdown complete |

## Prometheus Metrics

### Counters

| Metric | Labels | Description |
|---|---|---|
| `codeplane_ssh_connections_total` | `result` (`accepted`, `rejected_global_limit`, `rejected_ip_limit`) | Total SSH connection attempts |
| `codeplane_ssh_auth_attempts_total` | `result` (`success`, `failure`), `key_type` (`user`, `deploy_key`) | Total authentication attempts |
| `codeplane_ssh_git_sessions_total` | `command` (`upload-pack`, `receive-pack`), `result` (`success`, `failure`) | Total git transport sessions |
| `codeplane_ssh_workspace_exec_total` | `result` (`success`, `failure`) | Total workspace exec commands |
| `codeplane_ssh_ref_imports_total` | `result` (`success`, `failure`) | JJ ref imports after push |
| `codeplane_ssh_host_key_generations_total` | — | Host key generations (should be 1) |

### Gauges

| Metric | Labels | Description |
|---|---|---|
| `codeplane_ssh_active_connections` | — | Currently active SSH connections |
| `codeplane_ssh_active_connections_by_ip` | `ip` | Active connections per source IP (top-N only to bound cardinality) |
| `codeplane_ssh_server_up` | — | 1 if SSH server is listening, 0 otherwise |

### Histograms

| Metric | Labels | Buckets | Description |
|---|---|---|---|
| `codeplane_ssh_git_session_duration_seconds` | `command` (`upload-pack`, `receive-pack`) | 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300 | Duration of git transport sessions |
| `codeplane_ssh_auth_duration_seconds` | — | 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1 | Duration of authentication lookups |
| `codeplane_ssh_workspace_exec_duration_seconds` | — | 0.1, 0.5, 1, 5, 10, 30, 60 | Duration of workspace exec commands |

## Alerts and Runbooks

### Alert: SSHServerDown
- **Condition**: `codeplane_ssh_server_up == 0` for 5 minutes
- **Severity**: Critical
- **Runbook**:
  1. Check the Codeplane server logs for "Failed to start SSH server" entries.
  2. Verify the SSH port (`CODEPLANE_SSH_PORT`, default 2222) is not in use by another process: `ss -tlnp | grep 2222`.
  3. Check if `CODEPLANE_SSH_ENABLED` is set to `"false"` — if so, this is expected.
  4. Verify the host key file is readable: `ls -la {CODEPLANE_DATA_DIR}/ssh/ssh_host_ed25519_key`.
  5. Check if the data directory is writable (for first-boot host key generation): `touch {CODEPLANE_DATA_DIR}/ssh/test && rm {CODEPLANE_DATA_DIR}/ssh/test`.
  6. Restart the Codeplane server process. SSH boot is best-effort, so a restart will re-attempt.
  7. If the port is blocked by a firewall or SELinux policy, adjust the policy or change the port.

### Alert: SSHAuthFailureRateHigh
- **Condition**: `rate(codeplane_ssh_auth_attempts_total{result="failure"}[5m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check SSH auth failure logs for repeated `fingerprint` and `remoteIP` values.
  2. If a single IP is producing most failures, it may be a brute-force attempt. Block the IP using firewall rules or fail2ban.
  3. If many different IPs are failing, check if a key rotation or user deactivation caused legitimate users to lose access.
  4. Verify the database is healthy — auth failures can spike if the `ssh_keys` table is unreachable.
  5. Check for clock skew that might affect key validity checks.

### Alert: SSHConnectionLimitReached
- **Condition**: `rate(codeplane_ssh_connections_total{result=~"rejected.*"}[5m]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_ssh_active_connections` gauge to see current load.
  2. Check `codeplane_ssh_active_connections_by_ip` for any single IP consuming disproportionate connections.
  3. If legitimate traffic is being rejected, increase `CODEPLANE_SSH_MAX_CONNS` and/or `CODEPLANE_SSH_MAX_CONNS_IP`.
  4. If a single IP is consuming all connections, block it at the firewall level.
  5. Check for hanging git sessions that are not completing — long-running sessions can exhaust the pool.

### Alert: SSHGitSessionFailureRateHigh
- **Condition**: `rate(codeplane_ssh_git_sessions_total{result="failure"}[10m]) / rate(codeplane_ssh_git_sessions_total[10m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for "SSH git proxy failed" entries.
  2. Verify `git-upload-pack` and `git-receive-pack` are available in the server's PATH.
  3. Check repository disk space — git operations fail if the filesystem is full.
  4. Verify repository integrity with `git fsck` on frequently failing repositories.
  5. Check if a specific repository is causing all failures (corrupted repo state).

### Alert: SSHRefImportFailureRate
- **Condition**: `rate(codeplane_ssh_ref_imports_total{result="failure"}[10m]) / rate(codeplane_ssh_ref_imports_total[10m]) > 0.2`
- **Severity**: Warning
- **Runbook**:
  1. Ref import failures are non-fatal (pushes still succeed), but persistent failures mean jj state drifts from git state.
  2. Check server logs for "Failed to import refs after push" entries.
  3. Verify `jj` binary is available in the server's PATH and is the correct version.
  4. Run `jj git import` manually on the affected repository to check for errors.
  5. If jj state is corrupted, consider running `jj git import --force` or reinitializing the jj colocated state.

### Alert: SSHGitSessionDurationP99High
- **Condition**: `histogram_quantile(0.99, rate(codeplane_ssh_git_session_duration_seconds_bucket[10m])) > 120`
- **Severity**: Warning
- **Runbook**:
  1. P99 git session duration exceeding 2 minutes indicates slow transfers.
  2. Check server disk I/O with `iostat` — repository operations are I/O-bound.
  3. Check if large pushes are in progress (LFS objects, binary blobs).
  4. Review network bandwidth between the server and clients.
  5. Check if `git gc` / `git repack` is needed on large repositories.
  6. Consider enabling git object caching or optimizing pack settings.

## Error Cases and Failure Modes

| Failure Mode | Impact | Recovery |
|---|---|---|
| SSH port already in use | SSH unavailable, HTTP API unaffected | Change port or stop conflicting process, restart |
| Host key file corrupt | SSH fails to start | Delete the host key file, restart (auto-regenerates). Warn users of host key change. |
| Data directory not writable | SSH fails to start on first boot | Fix directory permissions |
| Database unavailable during auth | All SSH auth fails | Restore database connectivity |
| `git-upload-pack` / `git-receive-pack` not in PATH | All git SSH operations fail | Install git on the server |
| `jj` binary not in PATH | Ref imports fail (pushes still succeed) | Install jj on the server |
| Repository directory missing or corrupt | Individual repo operations fail | Restore from backup |
| Container runtime unavailable | Workspace SSH exec disabled, repo SSH unaffected | Install Docker/Podman if workspace SSH is needed |
| Memory exhaustion from connection flood | Server OOM | Apply connection limits, firewall rate limiting |
| Disk full | Host key generation fails, git operations fail | Free disk space |

## Verification

## SSH Server Boot Lifecycle Tests

- [ ] **E2E: SSH server starts on default port** — Start the Codeplane server with default config, verify SSH server is listening on port 2222 by connecting with an SSH client.
- [ ] **E2E: SSH server starts on custom port** — Set `CODEPLANE_SSH_PORT=2345`, start server, verify SSH is listening on port 2345.
- [ ] **E2E: SSH server binds to custom host** — Set `CODEPLANE_SSH_HOST=127.0.0.1`, verify server only listens on localhost (cannot connect from external interface).
- [ ] **E2E: SSH server disabled via env** — Set `CODEPLANE_SSH_ENABLED=false`, start server, verify SSH port is not listening, verify HTTP API is operational.
- [ ] **E2E: SSH server boot failure does not crash HTTP API** — Start server with SSH port already bound by another process, verify HTTP API starts and serves requests, verify error is logged.
- [ ] **E2E: Host key auto-generation on first boot** — Start server with empty data directory, verify host key file is created at `{DATA_DIR}/ssh/ssh_host_ed25519_key`.
- [ ] **E2E: Host key file permissions** — After auto-generation, verify file permissions are `0o600`.
- [ ] **E2E: Host key persistence across restarts** — Start server, note host key fingerprint, stop and restart, verify fingerprint is identical.
- [ ] **E2E: Host key directory auto-creation** — Start server with `CODEPLANE_DATA_DIR` pointing to a non-existent directory, verify directory structure is created.
- [ ] **E2E: Graceful shutdown stops SSH** — Start server, initiate SIGTERM, verify SSH port stops accepting connections, verify shutdown completes cleanly.

## SSH Authentication Tests

- [ ] **E2E: Authenticate with registered user SSH key** — Register an SSH key for a user via the API, connect via SSH using that key, verify authentication succeeds.
- [ ] **E2E: Authentication fails with unregistered key** — Connect via SSH with a key not registered in Codeplane, verify authentication is rejected.
- [ ] **E2E: Authentication fails for deactivated user** — Deactivate a user who has an SSH key registered, attempt SSH connection, verify authentication fails.
- [ ] **E2E: Authentication fails for login-prohibited user** — Set login prohibition on a user, attempt SSH connection, verify authentication fails.
- [ ] **E2E: Authenticate with deploy key** — Register a deploy key for a repository, connect via SSH using that key, verify authentication succeeds.
- [ ] **E2E: Only publickey auth method accepted** — Attempt password authentication, verify it is rejected with `publickey` listed as the allowed method.
- [ ] **E2E: SSH key fingerprint format** — Register a key, verify the stored fingerprint matches `SHA256:` + base64 without padding.

## Repository Access Authorization Tests

- [ ] **E2E: Owner can clone own private repo** — Owner clones their private repository over SSH, verify success.
- [ ] **E2E: Owner can push to own repo** — Owner pushes to their repository over SSH, verify success.
- [ ] **E2E: Non-owner cannot access private repo** — Authenticated user who is not the owner attempts to clone a private repository, verify permission denied.
- [ ] **E2E: Any authenticated user can clone public repo** — Authenticated user (not the owner) clones a public repository, verify success.
- [ ] **E2E: Non-owner cannot push to public repo** — Authenticated user (not the owner) attempts to push to a public repository, verify permission denied.
- [ ] **E2E: Push to archived repo denied** — Attempt to push to an archived repository, verify permission denied.
- [ ] **E2E: Clone from archived repo succeeds** — Attempt to clone an archived repository, verify success (read-only access is allowed).
- [ ] **E2E: Clone non-existent repo returns permission denied** — Attempt to clone `owner/nonexistent`, verify permission denied (not "not found").
- [ ] **E2E: Read-only deploy key can clone** — Deploy key marked as read-only clones the associated repository, verify success.
- [ ] **E2E: Read-only deploy key cannot push** — Deploy key marked as read-only attempts to push, verify permission denied.
- [ ] **E2E: Read-write deploy key can push** — Deploy key with write access pushes to the associated repository, verify success.
- [ ] **E2E: Deploy key cannot access other repos** — Deploy key for repo A attempts to clone repo B, verify permission denied.
- [ ] **E2E: Unauthenticated git clone returns standard error** — Connect without authentication, attempt clone, verify standard git permission-denied error message.
- [ ] **E2E: Permission denied error matches git format** — Verify error output includes "ERROR: owner/repo: permission denied", "fatal: Could not read from remote repository.", and "Please make sure you have the correct access rights".

## Repository Path Parsing Tests

- [ ] **E2E: Clone with .git suffix** — `git clone ssh://.../{owner}/{repo}.git` works correctly.
- [ ] **E2E: Clone without .git suffix** — `git clone ssh://.../{owner}/{repo}` works correctly.
- [ ] **E2E: Clone with leading slash** — Repository path `/owner/repo` is parsed correctly.
- [ ] **E2E: Case-insensitive owner/repo lookup** — `Owner/Repo` resolves to `owner/repo`.
- [ ] **API: Path traversal rejected** — SSH exec with path `owner/../etc/passwd` returns invalid repository path error.
- [ ] **API: Single-segment path rejected** — SSH exec with path `repo` (no owner) returns invalid repository path error.
- [ ] **API: Three-segment path rejected** — SSH exec with path `a/b/c` returns invalid repository path error.
- [ ] **API: Empty path rejected** — SSH exec with empty repo path returns invalid repository path error.
- [ ] **API: Special characters in path rejected** — SSH exec with path `owner/repo!@#` returns invalid repository path error.
- [ ] **API: Maximum valid path length** — SSH exec with owner and repo names at 255 characters each succeeds.
- [ ] **API: Path exceeding maximum length** — SSH exec with owner or repo names exceeding 255 characters returns invalid repository path error.

## Connection Limiting Tests

- [ ] **E2E: Global connection limit enforced** — Set `CODEPLANE_SSH_MAX_CONNS=5`, open 5 SSH connections, verify the 6th connection is immediately closed.
- [ ] **E2E: Global limit 0 means unlimited** — Set `CODEPLANE_SSH_MAX_CONNS=0`, open 20 connections, verify all are accepted.
- [ ] **E2E: Per-IP connection limit enforced** — Set `CODEPLANE_SSH_MAX_CONNS_IP=3`, open 3 connections from the same IP, verify the 4th from that IP is closed.
- [ ] **E2E: Per-IP limit does not affect other IPs** — Set `CODEPLANE_SSH_MAX_CONNS_IP=3`, fill limit from IP A, verify IP B can still connect.
- [ ] **E2E: Connection counters decrement on close** — Open connections to the limit, close one, verify a new connection is accepted.
- [ ] **E2E: Connection counters decrement on error** — Force-close a connection (client-side kill), verify the counter is decremented and new connections are accepted.

## Git Transport Tests

- [ ] **E2E: git clone over SSH** — Perform a full `git clone` over SSH, verify all objects are transferred and working tree is correct.
- [ ] **E2E: git push over SSH** — Create commits locally, `git push` over SSH, verify refs are updated on the server.
- [ ] **E2E: git fetch over SSH** — After a push, `git fetch` from a second clone, verify new commits are received.
- [ ] **E2E: Large push (100MB binary blob)** — Push a commit with a 100MB binary blob, verify transfer completes successfully.
- [ ] **E2E: Concurrent git operations** — Run 5 simultaneous clones from different clients, verify all complete successfully.
- [ ] **E2E: JJ ref import after push** — Push via SSH, verify `jj log` on the server shows the new changes.
- [ ] **E2E: JJ ref import failure is non-fatal** — Push via SSH with a condition that causes ref import to fail, verify the push still reports success.
- [ ] **E2E: Unsupported SSH command rejected** — Execute `ls /` via SSH exec, verify it returns "unsupported command" and exit code 1.
- [ ] **E2E: Interactive shell rejected** — Request an interactive shell via SSH, verify error message about workspace target.

## Workspace SSH Tests

- [ ] **E2E: Workspace exec with container runtime** — With Docker/Podman available, execute `workspace-exec <id> echo hello` via SSH, verify stdout output.
- [ ] **E2E: Workspace exec without container runtime** — Without container runtime, execute workspace-exec, verify error "workspace containers are not configured".
- [ ] **E2E: Workspace exec requires authentication** — Attempt workspace-exec without authentication, verify error "authentication required".
- [ ] **E2E: Workspace exec with invalid format** — Execute `workspace-exec` with fewer than 3 tokens, verify usage error.

## Shutdown and Resilience Tests

- [ ] **E2E: SIGTERM triggers SSH shutdown** — Send SIGTERM to the server process, verify SSH server stops listening.
- [ ] **E2E: SIGINT triggers SSH shutdown** — Send SIGINT to the server process, verify SSH server stops listening.
- [ ] **E2E: In-flight git operation during shutdown** — Start a long-running clone, send SIGTERM, verify the operation completes or fails gracefully (no data corruption).
- [ ] **E2E: SSH server restart after failure** — Stop the SSH server (simulate failure), restart the Codeplane process, verify SSH is available again with the same host key.

## CLI Integration Tests

- [ ] **CLI: List SSH keys** — `codeplane ssh-key list` returns the user's registered SSH keys.
- [ ] **CLI: Add SSH key** — `codeplane ssh-key add` registers a new SSH key, verify it appears in list.
- [ ] **CLI: Delete SSH key** — `codeplane ssh-key delete` removes an SSH key, verify it no longer appears in list.
- [ ] **CLI: Clone via SSH URL** — `codeplane repo clone ssh://...` works correctly.

## API Integration Tests

- [ ] **API: Create SSH key** — `POST /api/users/me/ssh-keys` with valid key data returns 201 with key details.
- [ ] **API: List SSH keys** — `GET /api/users/me/ssh-keys` returns all registered keys.
- [ ] **API: Delete SSH key** — `DELETE /api/users/me/ssh-keys/{id}` removes the key and returns 204.
- [ ] **API: Create SSH key with duplicate fingerprint** — Attempting to register the same public key twice returns a conflict error.
- [ ] **API: Create SSH key with invalid key data** — Submitting malformed key data returns a 422 validation error.
- [ ] **API: Create deploy key** — `POST /api/repos/{owner}/{repo}/deploy-keys` with valid key data returns 201.
- [ ] **API: Deploy key read-only flag** — Create a deploy key with `readOnly: true`, verify SSH write access is denied.

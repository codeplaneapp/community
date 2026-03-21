# REPO_DEPLOY_KEY_SSH_AUTH

Specification for REPO_DEPLOY_KEY_SSH_AUTH.

## High-Level User POV

When a repository administrator registers an SSH public key as a "deploy key" on a repository, any SSH client that presents the corresponding private key can authenticate and access that specific repository through the SSH transport — without a personal Codeplane user account.

This is the mechanism that connects deploy key management to actual repository access. Once a deploy key has been added to a repository (via the web UI, CLI, or API), the SSH server recognizes incoming connections that present that key's fingerprint and grants the appropriate level of access. If the key was registered as read-only, the connecting client can clone and pull but cannot push. If the key was registered as read-write, the client can also push changes.

This feature is critical for CI/CD pipelines, deployment scripts, automated mirrors, and bots. These systems generate their own SSH key pair, register the public half as a deploy key on the target repository, and then use the private half to authenticate over SSH. The system never needs its own user account, never sees other repositories, and can be individually revoked without disrupting any human user's access.

From the operator's perspective, deploy key SSH authentication is invisible in the happy path — it just works when the SSH server receives a connection. What matters is that access is correctly scoped (one key = one repo), that read-only restrictions are enforced, and that denied attempts are logged so administrators can audit access patterns and detect misuse.

## Acceptance Criteria

### Definition of Done

- [ ] An SSH client presenting a private key whose public counterpart is registered as a deploy key on a repository can successfully authenticate with the Codeplane SSH server.
- [ ] After authentication, the deploy key is authorized only for the specific repository it was registered on. Access to any other repository is denied.
- [ ] A read-only deploy key can execute `git-upload-pack` (clone/fetch/pull) but is denied `git-receive-pack` (push).
- [ ] A read-write deploy key can execute both `git-upload-pack` and `git-receive-pack`.
- [ ] Write operations against an archived repository are denied even with a read-write deploy key.
- [ ] If the same SSH public key fingerprint is registered as a deploy key on multiple repositories, each connection is scoped to the repository being accessed — the key does not grant cross-repository access.
- [ ] If a deploy key is deleted from a repository, subsequent SSH connections with that key are denied for that repository.
- [ ] Deploy key SSH authentication is logged with structured fields: fingerprint, repository owner/name, access mode, result (success/denied), and remote IP.
- [ ] If a key fingerprint matches both a user SSH key and a deploy key, the user SSH key takes precedence (user identity is preferred).
- [ ] The SSH session username for deploy key connections is set to `deploy-key:<title>` where `<title>` is the human-readable title from the deploy key registration.

### Edge Cases

- [ ] A connection presenting an unregistered SSH key (no matching user key, no matching deploy key) is denied with a generic auth failure — no information leakage about which keys exist.
- [ ] A deploy key fingerprint that exists globally but is not registered on the target repository results in a "permission denied" error, not a "not found" error.
- [ ] A deploy key attempting to access a repository that does not exist results in "repository not found."
- [ ] An SSH connection that authenticates via deploy key but targets a non-git command (e.g., shell access) is denied.
- [ ] Concurrent SSH sessions using the same deploy key are allowed (deploy keys are not single-use).
- [ ] A deploy key whose public key contains a trailing comment or whitespace still matches correctly by fingerprint.
- [ ] If PGLite is unavailable or the database is down, deploy key authentication fails closed (deny) rather than open (allow).

### Boundary Constraints

- [ ] Fingerprint format: SHA256 base64-encoded hash of the SSH public key, matching the output of `ssh-keygen -lf`.
- [ ] Supported key types: `ssh-ed25519`, `ssh-rsa` (2048-bit minimum), `ecdsa-sha2-nistp256`, `ecdsa-sha2-nistp384`, `ecdsa-sha2-nistp521`.
- [ ] Title length from registration: 1–255 characters (enforced at registration time, not at SSH auth time).
- [ ] Repository name resolution is case-insensitive for the owner and repo components of the SSH path.

## Design

### SSH Transport Flow

When an SSH client connects to the Codeplane SSH server and presents a public key:

1. **Fingerprint computation**: The server computes the SHA256 fingerprint of the presented public key.
2. **Principal lookup** (`lookupPrincipal`):
   - First, the server checks the `ssh_keys` table for a user key matching the fingerprint.
   - If no user key matches, the server checks the `deploy_keys` table for any deploy key matching the fingerprint (global lookup, not repo-scoped).
   - If neither matches, authentication is denied.
3. **Principal type resolution**: If the matched key is a deploy key, the resulting principal is marked with `isDeployKey: true` and a placeholder username of `deploy-key`.
4. **Repository authorization** (`authorizeDeployKey`):
   - The server resolves the target repository from the SSH command path (e.g., `owner/repo.git`).
   - The server queries for the deploy key scoped to the resolved repository ID + fingerprint.
   - If no deploy key is registered for that specific repository, access is denied.
   - If the repository is archived and the operation is a write, access is denied.
   - If the deploy key is `read_only` and the operation is a write (`git-receive-pack`), access is denied with "permission denied: deploy key is read only."
   - On success, the principal's username is updated to `deploy-key:<title>` and the git command is proxied.

### Access Modes

| Git Command | Access Mode | Read-Only Key | Read-Write Key |
|---|---|---|---|
| `git-upload-pack` (clone, fetch, pull) | `read` | ✅ Allowed | ✅ Allowed |
| `git-receive-pack` (push) | `write` | ❌ Denied | ✅ Allowed |

### User Key Precedence

When the same SSH fingerprint matches both a user key and a deploy key, the user key wins. The connection is treated as a regular user session with full user-scoped repository authorization, not deploy-key-scoped authorization.

### CLI Interaction

The CLI does not have a specific command for deploy key SSH auth because SSH authentication happens transparently at the transport layer. Users interact with deploy key SSH auth by using standard `jj` or `git` commands that route through the Codeplane SSH server:

```bash
# Clone using a deploy key (SSH transport)
GIT_SSH_COMMAND="ssh -i ~/.ssh/codeplane_ci" jj git clone ssh://git@codeplane.example.com:2222/owner/repo.git

# Fetch using a deploy key
GIT_SSH_COMMAND="ssh -i ~/.ssh/codeplane_ci" jj git fetch --remote origin
```

No CLI subcommand is needed for this feature — it is entirely server-side.

### API Shape

Deploy key SSH auth itself has no dedicated API endpoint — it operates at the SSH transport layer. The management API endpoints that feed into this feature are:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/repos/:owner/:repo/keys` | Register a deploy key (creates the SSH auth binding) |
| `GET` | `/api/repos/:owner/:repo/keys` | List deploy keys |
| `GET` | `/api/repos/:owner/:repo/keys/:id` | Get a single deploy key |
| `DELETE` | `/api/repos/:owner/:repo/keys/:id` | Remove a deploy key (revokes SSH auth) |

**Create request body:**
```json
{
  "title": "CI Runner",
  "key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... deploy@ci",
  "read_only": true
}
```

**Response body (create and get):**
```json
{
  "id": 1,
  "title": "CI Runner",
  "key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...",
  "fingerprint": "SHA256:abc123...",
  "read_only": true,
  "created_at": "2026-02-15T10:00:00Z"
}
```

**Error codes:** 400 (missing fields), 401 (not authenticated), 403 (insufficient permissions), 409 (duplicate key on repo), 422 (invalid SSH key format).

### Documentation

1. **Deploy Keys guide** (`docs/guides/deploy-keys.mdx`) — already exists. Should be updated to include a section on SSH auth behavior:
   - How deploy keys authenticate over SSH.
   - That read-only keys are enforced at the SSH transport level.
   - How to configure `GIT_SSH_COMMAND` for deploy key usage.
   - Troubleshooting tips (wrong key file, key not registered, read-only key attempting push).
   - Scoping rules: one key = one repo.
   - Precedence rule: user keys matched before deploy keys.
2. **SSH access guide** — Mention deploy keys as an alternative authentication method alongside personal SSH keys.

## Permissions & Security

### Authorization Model

| Role | Can register deploy keys? | Can SSH-authenticate as a deploy key? |
|---|---|---|
| Repository Owner | Yes (via management API) | N/A (deploy keys are machine identities) |
| Repository Admin | Yes (via management API) | N/A |
| Repository Member (write) | No | N/A |
| Repository Member (read) | No | N/A |
| Anonymous | No | N/A |
| Machine with deploy key private key | N/A | Yes — scoped to the registered repository |

Deploy key SSH auth does not have a "role" in the traditional sense. Any SSH client presenting the correct private key is authenticated. Authorization is scoped entirely by the deploy key's registration on a specific repository plus the `read_only` flag.

### Security Constraints

- **No cross-repo access**: A deploy key fingerprint is checked against the specific target repository. Even if the same fingerprint is registered on multiple repos, each SSH session is authorized independently per-repo.
- **No shell access**: Deploy key principals must not be granted shell access, only git command execution.
- **No API access**: Deploy key SSH auth grants only git transport access, not HTTP API access.
- **Fail closed**: If the database is unreachable during fingerprint lookup, authentication must fail rather than succeed.
- **No key enumeration**: Failed auth attempts must not reveal whether a fingerprint exists in the system. The error message must be generic.
- **Archived repo protection**: Write operations to archived repositories are always denied, regardless of the deploy key's read-write status.
- **Fingerprint is the identity**: The full public key is stored for audit purposes, but the fingerprint is the functional identity used for all lookups.

### Rate Limiting

- SSH connection rate limiting should apply uniformly to all SSH connections (user keys and deploy keys). A per-remote-IP limit of **30 authentication attempts per minute** should prevent brute-force key probing.
- Failed authentication attempts should be subject to exponential backoff at the SSH transport layer: after 5 consecutive failures from the same IP, impose a 30-second cooldown.
- No per-fingerprint rate limit is needed because fingerprint lookup is a database read, not a computationally expensive operation.

### Data Privacy

- The full public key is stored in the database. Public keys are not considered PII.
- The deploy key title is user-provided and may contain PII. Treat titles as user-controlled strings; do not expose them in public-facing responses unless the requester has admin/owner access to the repository.
- Remote IP addresses logged during SSH auth are considered operational data. Retain for 90 days in structured logs.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|---|---|---|
| `DeployKeySSHAuthAttempted` | Every SSH authentication attempt that resolves to a deploy key (after fingerprint match) | `fingerprint` (truncated to first 12 chars), `repository_id`, `repository_owner`, `repository_name`, `access_mode` (read/write), `result` (success/denied), `denial_reason` (if denied), `remote_ip_hash` (SHA256 of IP for privacy) |
| `DeployKeySSHAuthSucceeded` | After successful deploy key authorization | `fingerprint` (truncated), `repository_id`, `repository_owner`, `repository_name`, `access_mode`, `deploy_key_id`, `deploy_key_title`, `is_read_only` |
| `DeployKeySSHAuthDenied` | After deploy key authorization is denied | `fingerprint` (truncated), `repository_id` (if resolvable), `repository_owner`, `repository_name`, `access_mode`, `denial_reason` (one of: `key_not_registered_on_repo`, `read_only_write_attempt`, `repository_archived`, `repository_not_found`) |

### Funnel Metrics

| Metric | Description | Target |
|---|---|---|
| Deploy key auth success rate | `DeployKeySSHAuthSucceeded / DeployKeySSHAuthAttempted` | >99% (failed attempts should be rare in a correctly configured system) |
| Read-only enforcement rate | Count of `read_only_write_attempt` denials | Should be non-zero (indicates keys are correctly scoped) but not excessively high (indicates user confusion) |
| Deploy keys in active use | Distinct deploy key IDs that had a successful auth in the last 7 days | Growing over time indicates adoption |
| Time-to-first-auth | Time between `DeployKeyCreated` and first `DeployKeySSHAuthSucceeded` for the same key | <1 hour median indicates good onboarding |

### Success Indicators

- At least 30% of repositories with >5 contributors have at least one deploy key registered.
- Deploy key SSH auth failures due to misconfiguration decrease over time (measured by denial reasons).
- No security incidents traced to deploy key cross-repo access.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | When |
|---|---|---|---|
| SSH auth succeeded (deploy key) | `INFO` | `event=ssh_auth_success`, `principal_type=deploy_key`, `fingerprint`, `deploy_key_title`, `repository=owner/repo`, `access_mode`, `remote_ip` | Every successful deploy key auth |
| SSH auth failed (no principal) | `WARN` | `event=ssh_auth_failed`, `fingerprint` (truncated), `reason=no_matching_key`, `remote_ip` | Key not found in user or deploy key tables |
| Deploy key auth denied (wrong repo) | `WARN` | `event=deploy_key_auth_denied`, `fingerprint`, `repository=owner/repo`, `reason=key_not_on_repo`, `remote_ip` | Key exists globally but not on target repo |
| Deploy key auth denied (read-only) | `WARN` | `event=deploy_key_auth_denied`, `fingerprint`, `deploy_key_title`, `repository=owner/repo`, `reason=read_only_write_attempt`, `remote_ip` | Read-only key attempted push |
| Deploy key auth denied (archived) | `WARN` | `event=deploy_key_auth_denied`, `fingerprint`, `repository=owner/repo`, `reason=repository_archived`, `remote_ip` | Write to archived repo |
| Deploy key auth denied (repo not found) | `WARN` | `event=deploy_key_auth_denied`, `fingerprint`, `repository_path=owner/repo`, `reason=repository_not_found`, `remote_ip` | Target repo doesn't exist |
| SSH connection closed | `DEBUG` | `event=ssh_session_closed`, `principal_type=deploy_key`, `fingerprint`, `duration_ms`, `bytes_transferred` | Session ends |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_ssh_auth_total` | Counter | `principal_type` (user, deploy_key), `result` (success, denied), `reason` | Total SSH authentication attempts |
| `codeplane_deploy_key_auth_total` | Counter | `access_mode` (read, write), `result` (success, denied), `denial_reason` | Deploy-key-specific auth counter |
| `codeplane_deploy_key_auth_duration_seconds` | Histogram | `result` | Time taken for deploy key auth (fingerprint lookup + repo authorization) |
| `codeplane_ssh_active_sessions` | Gauge | `principal_type` | Currently open SSH sessions by principal type |
| `codeplane_deploy_key_git_operation_duration_seconds` | Histogram | `operation` (upload-pack, receive-pack) | Duration of git operations initiated via deploy key |

### Alerts

#### Alert: `DeployKeyAuthHighDenialRate`

- **Condition**: `rate(codeplane_deploy_key_auth_total{result="denied"}[5m]) / rate(codeplane_deploy_key_auth_total[5m]) > 0.5` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `denial_reason` label distribution: `sum by (denial_reason)(rate(codeplane_deploy_key_auth_total{result="denied"}[15m]))`.
  2. If `key_not_on_repo` is dominant: Check if a deploy key was recently deleted or if a misconfigured CI system is targeting the wrong repo. Inspect recent `DeployKeyDeleted` events. Verify CI configuration.
  3. If `read_only_write_attempt` is dominant: A CI pipeline may have been upgraded to push but the key wasn't updated. Contact the repo admin to re-register the key as read-write.
  4. If `repository_not_found` is dominant: A repo may have been renamed or deleted. Check recent repo mutations.
  5. If from a single IP: Possible brute-force probing. Check rate-limit effectiveness. Consider temporary IP block.

#### Alert: `DeployKeyAuthLatencyHigh`

- **Condition**: `histogram_quantile(0.99, rate(codeplane_deploy_key_auth_duration_seconds_bucket[5m])) > 2` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency: `codeplane_db_query_duration_seconds{query=~".*deploy_key.*"}`.
  2. If DB latency is high: Check connection pool saturation, replica lag, or PGLite WAL size.
  3. If DB is fine: Check SSH server CPU/memory usage. A high number of concurrent SSH sessions could cause contention.
  4. Verify `deploy_keys` table has an index on `key_fingerprint` — if missing, fingerprint lookups degrade to full table scans.

#### Alert: `DeployKeyBruteForceDetected`

- **Condition**: `sum by (remote_ip_hash)(rate(codeplane_ssh_auth_total{result="denied"}[1m])) > 10` sustained for 2 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Identify the source IP from structured logs (look for `event=ssh_auth_failed` with high frequency).
  2. Verify the IP is not a known CI system or internal network.
  3. If external and unknown: Apply a temporary firewall block or SSH connection blacklist.
  4. If internal: Investigate misconfigured automation that may be retrying with bad credentials.
  5. Check if rate limiting is functioning: verify the SSH rate limiter is active and thresholds are appropriate.
  6. After resolution: Review if the attack probed specific fingerprints or was random. If specific, advise the repo admin to rotate the targeted deploy key.

### Error Cases and Failure Modes

| Error Case | Behavior | User-Facing Message |
|---|---|---|
| Database unavailable during fingerprint lookup | Auth fails closed | SSH connection rejected (generic SSH auth failure) |
| Deploy key table corrupted / query error | Auth fails closed, error logged at ERROR level | SSH connection rejected |
| Fingerprint matches deploy key but target repo doesn't exist | Auth denied | `repository not found` |
| Fingerprint matches deploy key on different repo | Auth denied | `permission denied` |
| Read-only key attempts push | Auth denied | `permission denied: deploy key is read only` |
| Write to archived repo | Auth denied | `permission denied: repository is archived` |
| SSH key type not supported by server | SSH handshake failure before auth | SSH protocol error |
| Concurrent session limit exceeded (if implemented) | Connection refused | SSH connection refused |

## Verification

### SSH-Level Integration Tests

| Test ID | Test Description | Expected Result |
|---|---|---|
| `DK-SSH-001` | Generate an ed25519 key pair, register the public key as a read-only deploy key on a repo, SSH clone the repo using the private key | Clone succeeds, repository contents are correct |
| `DK-SSH-002` | Using the read-only deploy key from DK-SSH-001, attempt to push a commit via SSH | Push is denied with "permission denied: deploy key is read only" |
| `DK-SSH-003` | Generate an ed25519 key pair, register as a read-write deploy key, SSH clone and then push a commit | Both clone and push succeed |
| `DK-SSH-004` | Register a deploy key on repo-A, attempt to SSH clone repo-B using that key | Clone is denied with "permission denied" |
| `DK-SSH-005` | Register the same public key as deploy keys on repo-A and repo-B, SSH clone repo-A, then SSH clone repo-B | Both clones succeed (key is independently authorized per-repo) |
| `DK-SSH-006` | Register a deploy key, delete it via API, then attempt SSH clone | Clone is denied |
| `DK-SSH-007` | Register a read-write deploy key, archive the repository, attempt SSH push | Push is denied with "permission denied: repository is archived" |
| `DK-SSH-008` | Register a read-write deploy key, archive the repository, attempt SSH clone (read) | Clone succeeds (reads still work on archived repos) |
| `DK-SSH-009` | Attempt SSH clone with an unregistered key (no user key, no deploy key match) | Connection is denied with generic auth failure |
| `DK-SSH-010` | Register an SSH key as both a user key and a deploy key with the same fingerprint, SSH clone a repo the user owns | Connection authenticates as the user (user key precedence), not as a deploy key |
| `DK-SSH-011` | Register a deploy key, attempt to SSH to the server requesting a shell | Shell access is denied |
| `DK-SSH-012` | Register a deploy key using an `ssh-rsa` 4096-bit key, SSH clone the repo | Clone succeeds (RSA keys are supported) |
| `DK-SSH-013` | Register a deploy key using an `ecdsa-sha2-nistp256` key, SSH clone the repo | Clone succeeds (ECDSA keys are supported) |
| `DK-SSH-014` | Perform two simultaneous SSH clones using the same deploy key | Both clones succeed (concurrent use is allowed) |
| `DK-SSH-015` | Register a deploy key on a repo with a mixed-case owner name, SSH clone using lowercase path | Clone succeeds (case-insensitive repo resolution) |

### E2E Tests (CLI + API)

| Test ID | Test Suite | Description |
|---|---|---|
| `DK-E2E-001` | `e2e/cli/deploy-keys.test.ts` | Add read-only deploy key via API, verify response contains id, fingerprint, read_only=true |
| `DK-E2E-002` | `e2e/cli/deploy-keys.test.ts` | List deploy keys, verify the created key appears in the list |
| `DK-E2E-003` | `e2e/cli/deploy-keys.test.ts` | Verify fingerprint format matches `SHA256:...` pattern |
| `DK-E2E-004` | `e2e/cli/deploy-keys.test.ts` | Delete deploy key, verify it no longer appears in list |
| `DK-E2E-005` | `e2e/cli/deploy-keys.test.ts` | Add read-write deploy key, verify `read_only=false` |
| `DK-E2E-006` | `e2e/ssh/deploy-key-auth.test.ts` | Full SSH clone using a registered read-only deploy key succeeds |
| `DK-E2E-007` | `e2e/ssh/deploy-key-auth.test.ts` | SSH push using a read-only deploy key is denied |
| `DK-E2E-008` | `e2e/ssh/deploy-key-auth.test.ts` | SSH push using a read-write deploy key succeeds |
| `DK-E2E-009` | `e2e/ssh/deploy-key-auth.test.ts` | SSH clone using a deploy key registered on a different repo is denied |
| `DK-E2E-010` | `e2e/ssh/deploy-key-auth.test.ts` | Delete a deploy key, then verify SSH clone with that key fails |
| `DK-E2E-011` | `e2e/ssh/deploy-key-auth.test.ts` | SSH clone using a completely unregistered key is denied |
| `DK-E2E-012` | `e2e/ssh/deploy-key-auth.test.ts` | SSH clone an archived repo with a read-write deploy key succeeds (read is ok) |
| `DK-E2E-013` | `e2e/ssh/deploy-key-auth.test.ts` | SSH push to an archived repo with a read-write deploy key fails |

### API Boundary Tests

| Test ID | Description | Expected Result |
|---|---|---|
| `DK-API-001` | Create deploy key with empty `title` | 400 Bad Request |
| `DK-API-002` | Create deploy key with `title` of 256 characters | 422 Unprocessable Entity (exceeds 255 max) |
| `DK-API-003` | Create deploy key with `title` of exactly 255 characters | 201 Created |
| `DK-API-004` | Create deploy key with empty `key` field | 400 Bad Request |
| `DK-API-005` | Create deploy key with malformed SSH key (random string) | 422 Unprocessable Entity |
| `DK-API-006` | Create deploy key with a valid key that already exists on the same repo | 409 Conflict |
| `DK-API-007` | Create deploy key with a valid key that exists on a different repo | 201 Created (same key allowed on different repos) |
| `DK-API-008` | Delete a deploy key that doesn't exist | 404 Not Found |
| `DK-API-009` | Get a single deploy key by ID | 200 OK with correct fields |
| `DK-API-010` | List deploy keys on a repo with no keys | 200 OK with empty array |
| `DK-API-011` | Create deploy key as a non-admin user on the repo | 403 Forbidden |
| `DK-API-012` | Create deploy key without authentication | 401 Unauthorized |
| `DK-API-013` | Create deploy key with special characters in title (`<script>`, `../../`, emoji, unicode) | 201 Created, title is stored as-is (sanitized on display) |
| `DK-API-014` | Create deploy key with a public key that includes a trailing comment | 201 Created, fingerprint computed correctly |
| `DK-API-015` | Create deploy key with a public key that has extra whitespace | 201 Created, key is trimmed before fingerprint computation |
| `DK-API-016` | List deploy keys — verify response includes all fields: `id`, `title`, `key`, `fingerprint`, `read_only`, `created_at` | 200 OK with correct schema |
| `DK-API-017` | Create 50 deploy keys on one repo, list them | 200 OK, all 50 returned, ordered by `created_at DESC` |

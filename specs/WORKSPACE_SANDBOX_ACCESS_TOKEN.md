# WORKSPACE_SANDBOX_ACCESS_TOKEN

Specification for WORKSPACE_SANDBOX_ACCESS_TOKEN.

## High-Level User POV

When a developer connects to a Codeplane workspace — whether through SSH, the web terminal, the TUI, or the CLI — they need a way to authenticate their connection to the workspace's underlying virtual machine without managing SSH keys, configuring host entries, or handling long-lived credentials. The Workspace Sandbox Access Token feature provides this seamless authentication bridge.

From the user's perspective, the entire token lifecycle is invisible. When a user requests SSH connection info for a workspace or workspace session, Codeplane automatically generates a short-lived, single-use access token and embeds it directly into the SSH command. The user simply copies the command (or lets the CLI run it automatically) and connects. There is nothing to configure, no keys to rotate, and no passwords to remember.

The token is deliberately ephemeral: it expires after 5 minutes and can only be used once. If a user takes too long to connect, or if they need to reconnect, they simply request fresh SSH info and get a new token. This design ensures that even if a token is accidentally exposed — through screen sharing, terminal recording, or log scraping — the window for misuse is extremely narrow.

Behind the scenes, Codeplane never stores the raw token. Only a cryptographic hash is persisted, and expired tokens are automatically cleaned up by a background process. The user never has to think about any of this. They experience a one-step connection flow: request access, get a working SSH command, connect.

For CLI users, the flow is even more automated. Running `codeplane workspace ssh` handles workspace discovery, SSH info retrieval with retry logic, and interactive SSH session establishment in a single command. The TUI presents the SSH command with a copy hint and a live countdown showing how much time remains before the token expires, automatically refreshing when needed.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with member-level (or higher) repository access can trigger sandbox access token generation by requesting workspace or session SSH connection info
- [ ] The generated token is a UUID v4, exactly 36 characters, returned in the API response as the `access_token` field
- [ ] The raw token is SHA-256 hashed before storage; the plaintext token is returned to the client exactly once and is never persisted in plaintext
- [ ] Each token has a fixed TTL of exactly 5 minutes (300,000 milliseconds) from creation time
- [ ] Each token is single-use: after successful validation by the SSH server, the token's `used_at` timestamp is set, preventing any subsequent use
- [ ] Token validation requires the token to be non-expired (`expires_at > NOW()`) AND unused (`used_at IS NULL`)
- [ ] The cleanup scheduler periodically hard-deletes all tokens where `expires_at < NOW()`
- [ ] The sandbox access token cleanup is included in the periodic token sweep (runs at the configured token cleanup interval, default 60 seconds)
- [ ] Token generation fails gracefully with a 500 response and structured error when the database write fails
- [ ] Token generation is atomic — a partial write does not leave orphaned records

### Boundary Constraints

- [ ] `access_token` value: UUID v4 format, exactly 36 characters (e.g., `7c9e6679-7425-40de-944b-e07fc1f90ae7`)
- [ ] `token_hash`: SHA-256 digest, exactly 32 bytes stored as a binary buffer
- [ ] `token_type`: exactly `"ssh"` (string, 3 characters); no other token types currently supported
- [ ] `workspace_id`: UUID format, 36 characters; nullable in the database (for future non-workspace token uses)
- [ ] `vm_id`: non-empty string; maximum 255 characters
- [ ] `user_id`: positive integer, referencing a valid user
- [ ] `linux_user`: maximum 32 characters (Linux username limit); defaults to `"root"`
- [ ] `expires_at`: timestamp exactly 300,000ms after `created_at`; must be in the future at generation time
- [ ] `used_at`: `NULL` for unused tokens, timestamp for used tokens; set exactly once and never cleared
- [ ] Maximum concurrent valid tokens per workspace: unbounded (but monitored; alert at >10,000 globally)
- [ ] Maximum concurrent valid tokens per user: unbounded (but recommended monitoring at >100/hour)

### Edge Cases

- [ ] Generating a token when the database is unavailable: returns 500 "internal server error" with no partial state
- [ ] Generating a token with a clock skew between application and database: tokens use application-side `Date.now()` for `expires_at`, which may differ from database `NOW()`; the validation query uses database-side `NOW()`, so clock skew could cause premature expiry or delayed expiry by the magnitude of the skew
- [ ] Concurrent token generation for the same workspace: all succeed independently; each produces a unique UUID and hash
- [ ] Attempting to validate a token that was generated but whose workspace was subsequently deleted: validation returns `null` (token row still exists but the SSH server independently verifies workspace/VM existence)
- [ ] Token hash collision (two UUIDs producing the same SHA-256 hash): cryptographically negligible probability (~1 in 2^128); if it occurred, both tokens would match the same database row, but the single-use enforcement would cause the second to fail
- [ ] Cleanup scheduler running while a token is being validated: the `used_at IS NULL` and `expires_at > NOW()` predicates ensure that a valid in-flight token cannot be deleted by cleanup (cleanup only deletes where `expires_at < NOW()`)
- [ ] Server restart between token generation and token validation: tokens persist in the database and remain valid after restart
- [ ] Generating a token when `randomUUID()` or `createHash("sha256")` fails: the error propagates as an unhandled exception, resulting in a 500 response
- [ ] Requesting SSH info rapidly (e.g., 100 times in 1 second): each generates a new token and DB row; no deduplication is performed; the cleanup scheduler will remove them after 5 minutes

## Design

### API Shape

Sandbox access tokens are not directly managed through a dedicated API surface. They are generated as a side effect of requesting workspace or session SSH connection info.

**Token-generating endpoints:**

1. `GET /api/repos/:owner/:repo/workspaces/:id/ssh` — generates a workspace-scoped sandbox access token
2. `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh` — generates a session-scoped sandbox access token

Both endpoints return `WorkspaceSSHConnectionInfo` which includes the `access_token` field containing the raw (unhashed) token.

**Response shape (common to both endpoints):**
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

There is no endpoint to list, revoke, or inspect sandbox access tokens. They are fully managed by the system — generated on SSH info request, validated by the SSH server, and cleaned up by the scheduler.

### SDK Shape

**Token generation** is encapsulated within `WorkspaceService`:

```typescript
// Token is generated inside these service methods:
WorkspaceService.getWorkspaceSSHConnectionInfo(workspaceID, repositoryID, userID): Promise<WorkspaceSSHConnectionInfo | null>
WorkspaceService.getSSHConnectionInfo(sessionID, repositoryID, userID): Promise<WorkspaceSSHConnectionInfo | null>
```

Both methods:
1. Generate a UUID v4 via `randomUUID()`
2. Compute `SHA-256(rawToken)` as a binary Buffer
3. Insert into `sandbox_access_tokens` with `token_type: "ssh"` and `expires_at: Date.now() + 300000`
4. Return the raw token in the response (never store or log it)

**Token validation** is performed by the SSH server when authenticating workspace connections. The SSH server:
1. Extracts the token from the SSH username field (format: `{vmId}+{username}:{token}@{host}`)
2. Computes `SHA-256(presentedToken)`
3. Looks up by hash: requires `used_at IS NULL AND expires_at > NOW()`
4. If found, immediately marks as used via `UPDATE SET used_at = NOW() WHERE id = ? AND used_at IS NULL`
5. Returns the associated `vm_id`, `user_id`, and `linux_user` for session establishment

**Token cleanup** via `deleteExpiredSandboxAccessTokens()`: `DELETE FROM sandbox_access_tokens WHERE expires_at < NOW()`

### CLI Command

The CLI does not expose direct sandbox access token management. Tokens are generated transparently when the CLI requests SSH connection info:

- `codeplane workspace ssh [id]` — polls SSH info endpoint (which generates tokens) until a valid connection is available
- The CLI discards the token after the SSH session ends; it does not persist it to disk or logs
- Environment variables control polling behavior: `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` (default 3000), `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` (default 120000)

### TUI UI

The TUI does not display the raw access token directly. In the workspace detail SSH Connection section:

- The SSH `command` field (which embeds the token) is displayed with a copy hint (`c to copy`)
- A countdown timer shows remaining token validity: `Xm Ys` (≥60s), `Xs` (<60s), `Token expired` (0s)
- Yellow warning coloring at <60s remaining, red at expiry
- Auto-refresh on token expiry triggers a new SSH info request (generating a new token)
- Keybinding `r` manually refreshes (generates a new token)

### Documentation

1. **"Understanding Sandbox Access Tokens"** — user-facing guide explaining: what sandbox access tokens are (short-lived SSH credentials), how they are generated (automatically when requesting SSH info), their lifecycle (5-minute TTL, single-use, auto-cleanup), and security properties (SHA-256 hashed at rest, never logged)
2. **"Connecting to Workspaces"** — end-user guide covering: how to obtain SSH connection info (API, CLI, TUI), how the embedded token works, what happens when a token expires, troubleshooting failed SSH connections due to expired or used tokens
3. **"Self-Hosting: Token Cleanup Configuration"** — admin-facing documentation explaining: the cleanup scheduler's token sweep interval, how to verify tokens are being cleaned up, monitoring token table growth, manual cleanup procedures

## Permissions & Security

### Authorization

| Action | Anonymous | Read-Only | Member | Admin | Owner |
|--------|-----------|-----------|--------|-------|-------|
| Generate sandbox access token (via SSH info) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Validate sandbox access token (SSH connect) | ❌ | ❌ | ✅ | ✅ | ✅ |
| List/inspect tokens | N/A | N/A | N/A | N/A | N/A |
| Revoke tokens | N/A | N/A | N/A | N/A | N/A |

- Token generation requires authentication (session cookie or PAT) and member-level repository access
- The workspace/session lookup is scoped to the requesting user's ID and the repository ID — users can only generate tokens for their own workspaces
- There is no admin override to generate tokens for other users' workspaces
- Anonymous and read-only users are completely blocked from token generation
- Token validation at SSH time uses the token itself as the credential — no additional auth is required beyond possessing a valid, unused, non-expired token

### Rate Limiting

- Standard platform rate limit applies: 5,000 requests per hour per authenticated user
- Each SSH info request creates one database row in `sandbox_access_tokens` — the cleanup scheduler prevents unbounded table growth
- No additional per-endpoint rate limiting beyond the platform default
- Monitoring should flag users generating >100 tokens per hour as potential abuse (programmatic polling at intervals shorter than recommended)
- The CLI enforces a minimum 3-second poll interval to prevent excessive token generation during workspace connection flow

### Data Privacy & Token Security

- The raw access token is a credential — it is returned in the response body and embedded in the SSH command, which is an accepted usability trade-off
- The raw token is **never** stored in the database; only the SHA-256 hash is persisted
- The raw token is **never** logged at any severity level (info, warn, error, debug)
- The raw token is **never** included in telemetry events or analytics payloads
- Tokens are single-use: the SSH server marks them used immediately upon successful validation via an atomic `UPDATE ... WHERE used_at IS NULL` to prevent race conditions
- Tokens auto-expire after 5 minutes; this is a server-side constant, not configurable by clients
- Expired tokens are hard-deleted (not soft-deleted) by the cleanup scheduler — no forensic trail of expired tokens remains in the database
- The `command` field in the API response and TUI display contains the raw token; screen sharing, terminal recording, or clipboard managers may capture it
- The session SSH info endpoint persists `WorkspaceSSHConnectionInfo` (including raw token) to the session's `ssh_connection_info` column — this is a known security consideration; the persisted version should ideally redact the token
- No PII beyond `user_id` (integer) is stored in the token record

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `sandbox_access_token.generated` | New token created via SSH info request | `workspace_id`, `vm_id`, `user_id`, `token_type` ("ssh"), `ttl_ms` (300000), `source` (workspace/session), `repo_owner`, `repo_name` |
| `sandbox_access_token.validated` | SSH server validates a token during connection | `workspace_id`, `vm_id`, `token_age_ms`, `validation_result` (success/expired/used/not_found) |
| `sandbox_access_token.marked_used` | Token successfully used and marked | `workspace_id`, `vm_id`, `token_age_ms` |
| `sandbox_access_token.expired_unused` | Cleanup deletes an unused expired token | `workspace_id`, `token_age_ms`, `was_used` (false) |
| `sandbox_access_token.expired_used` | Cleanup deletes a used expired token | `workspace_id`, `token_age_ms`, `was_used` (true) |
| `sandbox_access_token.cleanup_sweep` | Cleanup scheduler completes a sweep | `tokens_deleted`, `duration_ms` |

**Never included in events**: `access_token` (raw), `token_hash`, `command`, or any credential material.

### Funnel Metrics & Success Indicators

- **Token utilization rate**: % of generated tokens that are successfully validated and marked as used (vs. expiring unused). Target: >50%. A low utilization rate suggests tokens are being generated but connections are not completing, indicating UX friction or infrastructure issues.
- **Token-to-connection latency**: Median time from `sandbox_access_token.generated` to `sandbox_access_token.marked_used`. Target: <30 seconds. This measures how quickly users connect after getting SSH info.
- **Token expiry rate**: % of tokens that expire without being used. Target: <50%. High expiry rates indicate the 5-minute TTL may be too short or users are generating tokens without intending to connect.
- **Cleanup efficiency**: Ratio of `tokens_deleted` in each sweep vs. `sandbox_access_tokens_active` gauge. Target: steady state, no accumulation trend.
- **Token generation failure rate**: % of SSH info requests that fail at the token generation step (DB write failure). Target: <0.1%.

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------||
| `info` | Sandbox access token generated | `workspace_id`, `vm_id`, `user_id`, `token_type`, `expires_at`, `source` (workspace/session) |
| `info` | Sandbox access token validated successfully | `workspace_id`, `vm_id`, `linux_user`, `token_age_ms` |
| `warn` | Token validation failed: expired | `workspace_id`, `vm_id`, `token_age_ms` |
| `warn` | Token validation failed: already used | `workspace_id`, `vm_id` |
| `warn` | Token validation failed: not found (hash mismatch or no matching row) | — (no context available beyond the presented hash, which must NOT be logged) |
| `error` | Token generation failed: database insert error | `workspace_id`, `vm_id`, `user_id`, `error_message` |
| `error` | Token cleanup sweep failed | `error_message`, `sweep_job` ("sandbox-access-tokens") |
| `debug` | Token cleanup sweep completed | `tokens_deleted`, `duration_ms` |
| `debug` | Token marked as used | `token_id`, `workspace_id`, `vm_id` |

**Critical rule**: The raw `access_token`, `token_hash`, and `command` string are **never** logged at any severity level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_sandbox_access_tokens_generated_total` | Counter | `token_type` (ssh), `source` (workspace/session) | Total tokens generated |
| `codeplane_sandbox_access_tokens_validated_total` | Counter | `result` (success/expired/used/not_found) | Token validation outcomes |
| `codeplane_sandbox_access_tokens_active` | Gauge | — | Count of non-expired, non-used tokens currently in the database |
| `codeplane_sandbox_access_tokens_expired_cleaned_total` | Counter | — | Cumulative count of expired tokens deleted by cleanup |
| `codeplane_sandbox_access_token_generation_duration_seconds` | Histogram | — | Time to generate a token (UUID + hash + DB insert) |
| `codeplane_sandbox_access_token_validation_duration_seconds` | Histogram | `result` (success/expired/used/not_found) | Time to validate a token (hash + DB lookup + mark used) |
| `codeplane_sandbox_access_token_age_at_use_seconds` | Histogram | — | Age of tokens when successfully used (time between generation and use) |
| `codeplane_sandbox_access_token_cleanup_duration_seconds` | Histogram | — | Duration of each cleanup sweep for sandbox tokens |

### Alerts

**Alert 1: Token Generation Failures**
- Condition: `rate(codeplane_sandbox_access_tokens_generated_total[5m]) == 0` while `rate(codeplane_workspace_ssh_info_requests_total{status="200"}[5m]) > 0`
- Severity: Critical
- **Runbook**: (1) Check database connectivity — run a simple health query against the `sandbox_access_tokens` table. (2) Check for table locks or deadlocks in PostgreSQL: `SELECT * FROM pg_locks WHERE NOT granted;`. (3) Verify that `randomUUID()` and `createHash("sha256")` are functioning — check for Node.js/Bun crypto errors in logs. (4) Check disk space on the database volume. (5) Examine recent schema migrations that may have altered the `sandbox_access_tokens` table. (6) If the issue is transient, restart the server to reinitialize database connections.

**Alert 2: Active Token Count > 10,000**
- Condition: `codeplane_sandbox_access_tokens_active > 10000`
- Severity: Warning
- **Runbook**: (1) Verify the cleanup scheduler is running — look for `debug` logs with `tokens_deleted` context. (2) If the scheduler appears stuck, restart the server. (3) Check for runaway clients generating excessive tokens by examining the `user_id` distribution in `sandbox_access_tokens`. (4) Manual cleanup: execute `DELETE FROM sandbox_access_tokens WHERE expires_at < NOW()` directly. (5) Review rate limiting to see if any user is generating an abnormal number of SSH info requests. (6) Check if cleanup interval is appropriate (default: 60s).

**Alert 3: Token Validation Success Rate < 50%**
- Condition: `rate(codeplane_sandbox_access_tokens_validated_total{result="success"}[15m]) / rate(codeplane_sandbox_access_tokens_validated_total[15m]) < 0.5`
- Severity: Warning
- **Runbook**: (1) Check which failure mode dominates: `expired`, `used`, or `not_found`. (2) If `expired` dominates: users are taking >5 minutes between requesting SSH info and connecting — check workspace provisioning latency and consider whether 5-minute TTL is sufficient. (3) If `used` dominates: something is replaying tokens — check for SSH client retry behavior or man-in-the-middle. (4) If `not_found` dominates: the SSH server may be hashing tokens incorrectly — verify the SHA-256 implementation matches between token generation and validation. (5) Check for clock skew between the application server and database server.

**Alert 4: Cleanup Sweep Failures**
- Condition: `rate(codeplane_sandbox_access_token_cleanup_duration_seconds_count[10m]) == 0` for >10 minutes
- Severity: Warning
- **Runbook**: (1) Check if the cleanup scheduler is running at all — look for any `[cleanup]` log messages. (2) If the scheduler crashed, restart the server. (3) If the scheduler is running but sandbox token cleanup is not executing, check if the `deleteExpiredSandboxAccessTokens` query is included in the `sweepExpiredTokens` job list (it should be — if missing, this is a bug). (4) Check database connectivity.

**Alert 5: Token Generation Latency p99 > 1s**
- Condition: `histogram_quantile(0.99, rate(codeplane_sandbox_access_token_generation_duration_seconds_bucket[5m])) > 1`
- Severity: Warning
- **Runbook**: (1) Check database insert latency — the `sandbox_access_tokens` table may need vacuuming or index maintenance. (2) Check if the table has grown excessively (cleanup not running). (3) Review database connection pool health. (4) Check for lock contention on the table. (5) Verify hardware performance (disk I/O, CPU).

### Error Cases and Failure Modes

| Error Case | Symptom | Impact | Recovery |
|------------|---------|--------|----------|
| Database insert failure during token generation | 500 on SSH info endpoint | User cannot get SSH connection info | Retry the request; admin checks DB health |
| `randomUUID()` failure | Unhandled exception → 500 | Token generation blocked | Restart server; check Node.js/Bun crypto subsystem |
| `createHash("sha256")` failure | Unhandled exception → 500 | Token generation blocked | Restart server; check crypto availability |
| Token expired before use | SSH auth rejected | User must request fresh SSH info | Normal behavior; request new SSH info |
| Token already used (replay attempt) | SSH auth rejected | Replay prevented | Request new SSH info for a fresh token |
| Token hash not found (invalid/tampered token) | SSH auth rejected | Invalid credential blocked | User must request valid SSH info from the API |
| Cleanup scheduler not running | `sandbox_access_tokens` table grows unboundedly | Increased DB storage; slower queries over time | Restart server; manually run `DELETE FROM sandbox_access_tokens WHERE expires_at < NOW()` |
| Clock skew between app and DB | Tokens expire early or late relative to the 5-minute nominal TTL | Users may see unexpectedly expired tokens or tokens that linger slightly past 5 minutes | Synchronize clocks via NTP; acceptable tolerance is <5 seconds |

## Verification

### API Integration Tests — Token Generation

- `SANDBOX_ACCESS_TOKEN > token is generated when requesting workspace SSH info` — Create running workspace, GET SSH info → response contains `access_token` field, non-empty, UUID format
- `SANDBOX_ACCESS_TOKEN > token is generated when requesting session SSH info` — Create workspace + session, GET session SSH info → response contains `access_token`, non-empty, UUID format
- `SANDBOX_ACCESS_TOKEN > each request generates a unique token` — Call workspace SSH info 5 times → 5 different `access_token` values
- `SANDBOX_ACCESS_TOKEN > token is UUID v4 format` — Verify `access_token` matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
- `SANDBOX_ACCESS_TOKEN > token length is exactly 36 characters` — `access_token.length === 36`
- `SANDBOX_ACCESS_TOKEN > token hash is stored in database` — Generate token, compute SHA-256 of returned token, query `sandbox_access_tokens` by hash → row exists
- `SANDBOX_ACCESS_TOKEN > stored hash is SHA-256 of the raw token` — Generate token via API, hash raw token client-side with SHA-256, compare with database `token_hash` column → match
- `SANDBOX_ACCESS_TOKEN > token_type is "ssh"` — Query token row → `token_type === "ssh"`
- `SANDBOX_ACCESS_TOKEN > expires_at is approximately 5 minutes from creation` — Query token row → `expires_at` is within 2 seconds of `created_at + 300000ms`
- `SANDBOX_ACCESS_TOKEN > workspace_id is set on generated token` — Query token row → `workspace_id` matches the workspace
- `SANDBOX_ACCESS_TOKEN > vm_id is set on generated token` — Query token row → `vm_id` matches the workspace's `freestyle_vm_id`
- `SANDBOX_ACCESS_TOKEN > user_id is set on generated token` — Query token row → `user_id` matches the authenticated user
- `SANDBOX_ACCESS_TOKEN > linux_user defaults to root` — Query token row → `linux_user === "root"`
- `SANDBOX_ACCESS_TOKEN > used_at is null on newly generated token` — Query token row → `used_at IS NULL`
- `SANDBOX_ACCESS_TOKEN > raw token is not stored anywhere in database` — Search all columns of `sandbox_access_tokens` row → no column contains the raw token string

### API Integration Tests — Token Validation

- `SANDBOX_ACCESS_TOKEN > valid token is found by hash lookup` — Generate token, hash it, query `getSandboxAccessTokenByHash` → returns the row
- `SANDBOX_ACCESS_TOKEN > expired token is not found by hash lookup` — Generate token, advance time 6 minutes, query by hash → returns null
- `SANDBOX_ACCESS_TOKEN > used token is not found by hash lookup` — Generate token, mark as used, query by hash → returns null
- `SANDBOX_ACCESS_TOKEN > marking token as used sets used_at` — Generate token, mark used → `used_at` is non-null, approximately now
- `SANDBOX_ACCESS_TOKEN > marking already-used token is idempotent` — Mark used twice → no error, `used_at` unchanged
- `SANDBOX_ACCESS_TOKEN > token at exactly 5 minutes is still valid` — Generate token, advance time exactly 299999ms, validate → valid
- `SANDBOX_ACCESS_TOKEN > token at 5 minutes + 1ms is expired` — Generate token, advance time 300001ms, validate → null (expired)
- `SANDBOX_ACCESS_TOKEN > invalid hash returns null` — Query with a random hash → returns null
- `SANDBOX_ACCESS_TOKEN > empty hash returns null` — Query with empty buffer → returns null

### API Integration Tests — Token Cleanup

- `SANDBOX_ACCESS_TOKEN > deleteExpiredSandboxAccessTokens removes expired tokens` — Generate 5 tokens, advance time 6 minutes, run cleanup → 0 tokens remain
- `SANDBOX_ACCESS_TOKEN > cleanup does not remove non-expired tokens` — Generate 5 tokens, run cleanup immediately → 5 tokens remain
- `SANDBOX_ACCESS_TOKEN > cleanup removes expired-and-used tokens` — Generate token, mark used, advance time 6 minutes, run cleanup → token deleted
- `SANDBOX_ACCESS_TOKEN > cleanup removes expired-and-unused tokens` — Generate token (never used), advance time 6 minutes, run cleanup → token deleted
- `SANDBOX_ACCESS_TOKEN > cleanup is safe to run with empty table` — Run cleanup on empty `sandbox_access_tokens` → no error
- `SANDBOX_ACCESS_TOKEN > cleanup handles large batch (1000 expired tokens)` — Generate 1000 tokens, expire all, run cleanup → all deleted, no timeout
- `SANDBOX_ACCESS_TOKEN > cleanup does not affect tokens from other token types` — (Future-proofing) If tokens of type other than "ssh" existed, cleanup deletes all expired regardless of type

### API Integration Tests — Concurrency & Edge Cases

- `SANDBOX_ACCESS_TOKEN > 20 concurrent token generation requests all succeed` — 20 parallel SSH info requests for the same workspace → 20 unique tokens, 20 DB rows, no constraint violations
- `SANDBOX_ACCESS_TOKEN > concurrent validate and cleanup do not race` — Generate token, concurrently run validation and cleanup within the TTL window → validation succeeds, token not prematurely deleted
- `SANDBOX_ACCESS_TOKEN > token generation with maximum-length vm_id (255 chars)` — Workspace with 255-char VM ID → token generated successfully, command string valid
- `SANDBOX_ACCESS_TOKEN > token generation with 1-character vm_id` — Workspace with 1-char VM ID → token generated successfully
- `SANDBOX_ACCESS_TOKEN > token generation with special characters in vm_id` — VM ID containing hyphens, underscores, dots → token generated successfully, command string valid
- `SANDBOX_ACCESS_TOKEN > 401 when unauthenticated user requests SSH info` — No auth → 401, no token generated
- `SANDBOX_ACCESS_TOKEN > 500 when sandbox client unavailable` — No sandbox → 500 "sandbox client unavailable", no token generated

### CLI Integration Tests

- `CLI workspace ssh > token is embedded in SSH command` — Run `codeplane workspace ssh`, capture spawned SSH arguments → token present in username:password format
- `CLI workspace ssh > token is not logged to stdout or stderr` — Run `codeplane workspace ssh` with verbose output → raw token does not appear in logs
- `CLI workspace ssh > failed SSH connection does not leak token in error message` — SSH connection refused → error message does not contain the raw token
- `CLI workspace ssh > multiple retries generate different tokens` — First poll returns 404 (no VM), second returns 200 → two different tokens generated (first discarded)

### E2E Integration Tests

- `SANDBOX_ACCESS_TOKEN e2e > full lifecycle: generate, validate, mark used, cleanup` — Generate token → validate by hash → mark used → advance time → cleanup → token deleted
- `SANDBOX_ACCESS_TOKEN e2e > SSH connection flow: generate token, connect SSH, verify single-use` — Generate token via API → use token to authenticate SSH → attempt second SSH with same token → rejected
- `SANDBOX_ACCESS_TOKEN e2e > workspace SSH info through CLI to SSH connection` — `codeplane workspace ssh` → workspace created → SSH info with token → SSH session established → token marked used
- `SANDBOX_ACCESS_TOKEN e2e > token expiry during connection attempt` — Generate token → wait >5 minutes → attempt SSH → rejected with auth error
- `SANDBOX_ACCESS_TOKEN e2e > concurrent users on same repository get independent tokens` — User A and User B both have workspaces on same repo → each gets independent tokens → no cross-contamination
- `SANDBOX_ACCESS_TOKEN e2e > cleanup scheduler runs and removes expired tokens in production-like config` — Start server with cleanup scheduler, generate tokens, wait for cleanup interval to pass, verify expired tokens deleted
- `SANDBOX_ACCESS_TOKEN e2e > server restart preserves valid tokens` — Generate token → restart server → validate token → still valid (within TTL)
- `SANDBOX_ACCESS_TOKEN e2e > 50 concurrent SSH info requests under load` — 50 parallel requests → all succeed, 50 unique tokens, no database errors

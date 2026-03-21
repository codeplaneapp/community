# WORKSPACE_CLI_CREATE

Specification for WORKSPACE_CLI_CREATE.

## High-Level User POV

When a developer needs an isolated cloud-backed coding environment for a repository, they reach for `codeplane workspace create` in the terminal. This command is the CLI entry point for spinning up an on-demand workspace — a container-backed environment that contains the repository context, tooling, and SSH accessibility — without leaving the terminal workflow.

The experience is designed to be fast and frictionless. The developer runs the command, optionally gives the workspace a short memorable name like `feature-auth` or `debug-pipeline`, and optionally specifies a snapshot to restore pre-configured state from. If the developer is already inside a cloned repository directory, Codeplane auto-detects which repository to create the workspace for, so no `--repo` flag is needed. The command returns immediately with workspace metadata — including its ID, status, and configuration — so the developer can chain it into scripts or follow up with `workspace ssh` or `workspace watch`.

If the developer already has an active workspace for the same repository, Codeplane reuses it instead of creating a duplicate. This makes the command safe to run repeatedly — it's an idempotent "give me a workspace" operation that prevents resource sprawl while still guaranteeing the developer ends up with a usable environment.

The CLI outputs human-readable formatted text by default, showing the workspace ID, name, and status in a scannable layout. Developers who want to pipe workspace metadata into other tools or scripts pass `--json` to receive the raw API response. Exit codes follow standard conventions: 0 for success, 1 for any error. Error messages are actionable and human-friendly — they tell the developer what went wrong and how to fix it, whether the issue is a missing authentication token, a non-existent snapshot, or an unavailable container runtime.

For agent-driven and automated workflows, workspace creation from the CLI is the foundational building block. The higher-level `workspace issue` automation command depends on `workspace create` as its first step, and CI/CD pipelines can script workspace creation for ephemeral test environments. The command's simple interface, structured output, and predictable error behavior make it equally useful for human developers typing at a terminal and for machine-driven orchestration.

## Acceptance Criteria

### Definition of Done

- A user can create a workspace from the CLI using `codeplane workspace create` with optional `--name`, `--snapshot`, and `--repo` flags.
- The command returns workspace metadata including ID, name, status, and configuration defaults.
- The command auto-detects the repository from the current working directory when `--repo` is omitted.
- If an active non-fork workspace already exists for the same repository and user, it is returned instead of creating a duplicate.
- Snapshot-based workspace creation produces a fork workspace from the specified snapshot.
- Human-readable output is the default; `--json` returns the full API response as structured JSON.
- Exit code is 0 on success and 1 on any error.
- Error messages are actionable and human-readable, covering all server error responses.
- The command works consistently whether invoked interactively, from a script, or by an automated agent.

### Functional Constraints

- **Command signature**: `codeplane workspace create [--name <name>] [--snapshot <snapshot-id>] [--repo <OWNER/REPO>]`
- **`--name` option**:
  - Type: string, defaults to `""` (empty string).
  - The CLI passes the name directly to the API; client-side validation is recommended but not blocking.
  - Naming convention recommendation: lowercase alphanumeric and hyphens only, matching `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, maximum 63 characters.
  - Leading and trailing whitespace is trimmed by the server.
- **`--snapshot` option**:
  - Type: string, optional. When provided, included as `snapshot_id` in the API request body.
  - Must be a valid UUID of an existing snapshot belonging to the same repository and user.
  - If the snapshot does not exist, the server returns HTTP 404 and the CLI exits with code 1 and an error message.
  - When a snapshot is used, the resulting workspace is marked as a fork (`is_fork: true`).
- **`--repo` option**:
  - Type: string, optional, in `OWNER/REPO` format.
  - If omitted, resolved from the current working directory's jj/git remote configuration via `resolveRepoRef()`.
  - If resolution fails, the CLI exits with code 1 and an error explaining that `--repo` is required.
- **`--json` flag** (inherited from CLI framework):
  - When present, the full API response is printed as formatted JSON to stdout.
  - When absent, a human-readable summary is printed.
- **Idempotent behavior**: If the user already has a non-fork active workspace for the repository, the existing workspace is returned. Stale pending workspaces (pending/starting for >5 minutes without a VM) are automatically failed by the server before this check.
- **API endpoint**: `POST /api/repos/:owner/:repo/workspaces`
- **Request body**: `{ "name": "<name>", "snapshot_id": "<snapshot-id>" }` (snapshot_id included only when `--snapshot` is provided).
- **Authentication**: Requires a valid auth token (session cookie or PAT). Without authentication, exits with code 1.

### Edge Cases

- **No flags provided**: Creates a workspace with empty name, no snapshot, in the auto-detected repository.
- **Empty `--name ""` explicitly**: Accepted; passes empty string to API.
- **`--name` with whitespace only** (e.g., `--name "  "`): Passed to API, server trims to empty string.
- **`--name` with uppercase letters**: Passed directly to server; no client-side lowering in CLI.
- **`--name` longer than 63 characters**: No CLI-side rejection currently; server may accept. Future: should produce a clear error.
- **`--name` with special characters** (spaces, underscores, dots): Passed to API without client-side rejection.
- **`--snapshot` with invalid UUID format**: Passed to API; server returns 404 or 400.
- **`--snapshot` for snapshot in different repository**: Server returns 404.
- **`--repo` with invalid format** (missing slash): `resolveRepoRef()` throws; CLI exits with code 1.
- **`--repo` for non-existent repository**: API returns 404; CLI exits with code 1.
- **No authentication configured**: API returns 401; CLI exits with code 1.
- **Read-only access**: API returns 403; CLI exits with code 1.
- **Sandbox unavailable**: API returns 500; CLI exits with code 1.
- **Network error / server unreachable**: CLI exits with code 1 with connection error.
- **Concurrent invocations**: Server-side idempotent logic prevents duplicates.
- **Rate limit exceeded**: API returns 429; CLI exits with code 1 (no auto-retry).

## Design

### CLI Command

**Synopsis**:
```
codeplane workspace create [--name <name>] [--snapshot <snapshot-id>] [--repo <OWNER/REPO>]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--name` | string | `""` | Human-readable workspace name. Recommended: lowercase alphanumeric and hyphens, max 63 chars. |
| `--snapshot` | string | (none) | Snapshot UUID to restore workspace state from. Creates a fork workspace when provided. |
| `--repo` | string | (auto-detect) | Target repository in `OWNER/REPO` format. Auto-detected from current directory if omitted. |
| `--json` | boolean | false | Output the raw API response as JSON instead of human-readable text. |

**Human-readable output** (default):

```
Workspace created
  ID:     a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Name:   feature-auth
  Status: starting
  Fork:   no
```

If an existing workspace was reused:
```
Workspace (existing)
  ID:     a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Name:   feature-auth
  Status: running
  Fork:   no
```

**JSON output** (`--json`):
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "repository_id": 123,
  "user_id": 456,
  "name": "feature-auth",
  "status": "starting",
  "is_fork": false,
  "freestyle_vm_id": "vm-abc123",
  "persistence": "persistent",
  "idle_timeout_seconds": 1800,
  "suspended_at": null,
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z"
}
```

**Error output** (stderr):
```
Error: authentication required
Error: write access required
Error: workspace snapshot not found
Error: sandbox client unavailable
```

**Exit codes**:

| Code | Condition |
|------|-----------|
| 0 | Workspace created or reused successfully |
| 1 | Any error (auth, permission, validation, provisioning, network) |

**Repo auto-detection**: When `--repo` is omitted, the CLI inspects the current working directory for jj/git remote configuration. If not inside a repository, exits with:
```
Error: could not detect repository. Use --repo OWNER/REPO to specify explicitly.
```

### API Shape

**Endpoint**: `POST /api/repos/:owner/:repo/workspaces`

**Request Body**:
```json
{
  "name": "my-workspace",
  "snapshot_id": "optional-snapshot-uuid"
}
```

Both fields optional. Name defaults to `""`, snapshot_id omitted when not provided.

**Success Response** (HTTP 201):
```json
{
  "id": "uuid",
  "repository_id": 123,
  "user_id": 456,
  "name": "my-workspace",
  "status": "starting",
  "is_fork": false,
  "freestyle_vm_id": "vm-id",
  "persistence": "persistent",
  "idle_timeout_seconds": 1800,
  "suspended_at": null,
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z"
}
```

**Error Responses**:

| HTTP Status | Condition | Message |
|-------------|-----------|--------|
| 400 | Invalid JSON body | `"invalid request body"` |
| 401 | Unauthenticated | `"authentication required"` |
| 403 | Insufficient permission | `"write access required"` |
| 404 | Snapshot not found | `"workspace snapshot not found"` |
| 429 | Rate limit exceeded | `"rate limit exceeded"` |
| 500 | No sandbox runtime | `"sandbox client unavailable"` |
| 500 | Container creation failed | `"create sandbox container: {error}"` |
| 500 | DB insert failed | `"create workspace failed"` |

### SDK Shape

**Service method**: `WorkspaceService.createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceResponse>`

```typescript
interface CreateWorkspaceInput {
  repositoryID: number;
  userID: number;
  repoOwner: string;
  repoName: string;
  name: string;
  snapshotID: string;
}

interface WorkspaceResponse {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  status: string;
  is_fork: boolean;
  parent_workspace_id?: string;
  freestyle_vm_id: string;
  persistence: string;
  ssh_host?: string;
  snapshot_id?: string;
  idle_timeout_seconds: number;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}
```

### Documentation

End-user documentation for `WORKSPACE_CLI_CREATE` should include:

- **CLI reference page**: Full `codeplane workspace create` command documentation with synopsis, all options, defaults, output format, exit codes, and environment variable overrides.
- **Examples section**:
  - Basic creation: `codeplane workspace create --name my-feature`
  - Creation with explicit repo: `codeplane workspace create --name my-feature --repo acme/backend`
  - Snapshot-based creation: `codeplane workspace create --name from-snap --snapshot <uuid>`
  - JSON output for scripting: `codeplane workspace create --name scripted --json | jq .id`
  - Pipeline usage: `WS_ID=$(codeplane workspace create --name ci-env --repo acme/api --json | jq -r .id) && codeplane workspace ssh $WS_ID`
- **Naming conventions guide**: Explain DNS-safe naming constraints and why they matter.
- **Troubleshooting section**: "authentication required" → `codeplane auth login`; "could not detect repository" → use `--repo`; "sandbox client unavailable" → container runtime not configured; "workspace snapshot not found" → verify UUID with `codeplane workspace snapshots`.
- **Related commands**: Link to `workspace list`, `workspace view`, `workspace ssh`, `workspace watch`, `workspace issue`.

## Permissions & Security

### Authorization

| Role | Can Create Workspace? | Behavior |
|------|----------------------|----------|
| Owner | Yes | Full workspace creation with all options |
| Admin | Yes | Full workspace creation with all options |
| Member (Write) | Yes | Can create workspaces in repositories with write access |
| Member (Read) | No | HTTP 403 "write access required" |
| Anonymous / Unauthenticated | No | HTTP 401 "authentication required" |

Authorization is enforced server-side. The CLI does not perform client-side permission checks — it relies on the API response.

### Rate Limiting

- **Per-user**: Maximum 10 workspace creation requests per minute.
- **Per-repository**: Maximum 30 workspace creation requests per minute.
- **Global**: Subject to the server-wide rate limiting middleware.
- When rate-limited, the API returns HTTP 429 with a `Retry-After` header.
- The CLI does not auto-retry on 429. It prints the error and exits with code 1.

### Data Privacy Constraints

- Workspace creation records the `user_id` of the creator. This is not PII but links to user identity.
- Workspace names are visible to all users with read access to the repository. Users should be advised not to embed sensitive information in workspace names.
- The CLI transmits the auth token (PAT or session cookie) over HTTPS. The token is stored locally in the CLI configuration directory.
- Snapshot IDs are UUIDs and do not leak content information.
- SSH access tokens generated for workspace access are short-lived (5-minute TTL) and never stored or displayed by the create command.
- Repository secrets and environment variables injected into workspace containers are not logged or exposed in any CLI output.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workspace.created` | Workspace successfully created via CLI | `workspace_id`, `repository_id`, `user_id`, `name_length`, `has_snapshot`, `snapshot_id` (if used), `is_fork`, `status`, `persistence`, `provisioning_duration_ms`, `client: "cli"` |
| `workspace.create_failed` | Workspace creation failed | `repository_id`, `user_id`, `error_type` ("sandbox_unavailable" | "provisioning_failed" | "db_error" | "snapshot_not_found" | "auth_error" | "permission_error"), `error_message`, `has_snapshot`, `client: "cli"` |
| `workspace.create_reused` | Existing active workspace returned | `workspace_id`, `repository_id`, `user_id`, `original_created_at`, `workspace_age_seconds`, `client: "cli"` |
| `workspace.zombie_detected` | Stale pending workspace auto-failed | `workspace_id`, `repository_id`, `age_seconds` |
| `cli.workspace_create.invoked` | CLI command invoked | `has_name`, `has_snapshot`, `has_repo_flag`, `repo_auto_detected`, `output_format` ("human" | "json") |
| `cli.workspace_create.completed` | CLI command completed | `workspace_id`, `exit_code`, `duration_ms`, `was_reused`, `has_snapshot` |

### Funnel Metrics & Success Indicators

- **CLI creation success rate**: % of `cli.workspace_create.invoked` → `cli.workspace_create.completed` with `exit_code: 0`. Target: >90%.
- **Creation success rate (server)**: % of `workspace.created` / (`workspace.created` + `workspace.create_failed`). Target: >95%.
- **Reuse rate**: % of CLI creation requests returning an existing workspace. Insight metric (no target).
- **Snapshot utilization**: % of CLI creation requests including `--snapshot`. Tracks snapshot feature adoption.
- **Repo auto-detection success rate**: % of invocations where `repo_auto_detected: true` and command succeeded. Target: >95% when auto-detected.
- **Provisioning duration p50/p95/p99**: Histogram of `provisioning_duration_ms` for CLI-originated creations. Target: p95 < 30s.
- **CLI command duration p50/p95**: Total CLI execution time including network round-trip. Target: p95 < 5s.
- **Error distribution**: Breakdown of `error_type` values in `workspace.create_failed` to identify systemic issues.

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `info` | Workspace creation requested via CLI | `{ repository_id, user_id, repo_owner, repo_name, has_snapshot, snapshot_id, client: "cli" }` |
| `info` | Workspace created successfully | `{ workspace_id, repository_id, user_id, status, is_fork, provisioning_duration_ms }` |
| `info` | Existing workspace reused | `{ workspace_id, repository_id, user_id, original_status }` |
| `warn` | Zombie workspace detected and failed | `{ workspace_id, repository_id, age_seconds, original_status }` |
| `warn` | Snapshot not found during creation | `{ snapshot_id, repository_id, user_id }` |
| `error` | Sandbox client unavailable | `{ repository_id, user_id }` |
| `error` | Container provisioning failed | `{ workspace_id, repository_id, user_id, error_message, duration_ms }` |
| `error` | Database insert failed | `{ repository_id, user_id, error_message, operation: "createWorkspace" }` |
| `error` | VM cleanup failed after DB error | `{ workspace_id, vm_id, cleanup_error }` |
| `debug` | Stale pending workspaces check | `{ repository_id, stale_count }` |
| `debug` | VM provisioning started | `{ workspace_id, name_prefix, env_vars_count, labels }` |
| `debug` | VM provisioning completed | `{ workspace_id, vm_id, duration_ms }` |
| `debug` | CLI repo auto-detection result | `{ repo_owner, repo_name, auto_detected: true/false }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_creations_total` | Counter | `status` ("success" | "failed" | "reused"), `has_snapshot`, `client` | Total workspace creation attempts |
| `codeplane_workspace_provisioning_duration_seconds` | Histogram | `status` ("success" | "failed") | Time from creation request to final status |
| `codeplane_workspace_active_count` | Gauge | `status` ("pending" | "starting" | "running" | "suspended") | Current active workspaces by status |
| `codeplane_workspace_zombie_detections_total` | Counter | — | Total zombie workspaces auto-failed |
| `codeplane_workspace_sandbox_errors_total` | Counter | `error_type` ("unavailable" | "provisioning" | "start" | "cleanup") | Sandbox-related errors |
| `codeplane_workspace_db_errors_total` | Counter | `operation` ("create" | "update_status" | "update_execution_info") | Database operation failures |
| `codeplane_workspace_cli_command_duration_seconds` | Histogram | `status` ("success" | "failed"), `has_snapshot` | CLI-side total command execution time |

### Alerts

#### `WorkspaceProvisioningFailureRateHigh`
**Condition**: `rate(codeplane_workspace_creations_total{status="failed"}[5m]) / rate(codeplane_workspace_creations_total[5m]) > 0.1`
**Severity**: Critical
**Runbook**:
1. Check `codeplane_workspace_sandbox_errors_total` by `error_type`. If `"unavailable"` is spiking, the container runtime (Docker/Podman) is down — verify with `docker info` or `podman info` on the host.
2. If `"provisioning"` is spiking, check container runtime resource limits (disk, memory, CPU). Run `docker ps -a` to look for container accumulation.
3. Check application logs: `level=error AND operation=createWorkspace` for specific error messages.
4. If transient, existing workspaces are unaffected. Monitor for recovery over the next 5 minutes.
5. If persistent, escalate to infrastructure team for container runtime investigation.

#### `WorkspaceProvisioningLatencyHigh`
**Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_provisioning_duration_seconds_bucket[5m])) > 60`
**Severity**: Warning
**Runbook**:
1. Check container runtime performance: `docker system df` for disk pressure, `docker stats` for resource utilization.
2. Check if image pulls are slow (first-time provisioning requires pulling the workspace base image). Run `docker images` to verify base images are cached.
3. Review system load: high CPU or I/O wait can slow container creation. Check `top`, `iostat`, `vmstat`.
4. If latency is consistently high, consider pre-pulling workspace images via `docker pull` in a cron job.
5. Check network latency between the Codeplane server and the container runtime socket.

#### `WorkspaceZombieRateHigh`
**Condition**: `rate(codeplane_workspace_zombie_detections_total[1h]) > 5`
**Severity**: Warning
**Runbook**:
1. Zombie workspaces mean provisioning starts but never completes. Check sandbox client connectivity.
2. Review `docker logs` for containers that were created but never transitioned to running.
3. Check database connectivity — provisioning may succeed but status update writes may fail.
4. Check for network issues between the Codeplane server and the container runtime.
5. Review recent deployments that may have introduced provisioning regressions.

#### `WorkspaceSandboxUnavailable`
**Condition**: `increase(codeplane_workspace_sandbox_errors_total{error_type="unavailable"}[5m]) > 0`
**Severity**: Critical
**Runbook**:
1. The container sandbox client is not initialized. This means the container runtime is not configured or not reachable.
2. Verify `CODEPLANE_CONTAINER_RUNTIME` environment variable is set ("docker" or "podman").
3. Verify the container runtime is installed and running: `systemctl status docker` or `podman info`.
4. Restart the Codeplane server if the runtime was started after the server (sandbox client is initialized at boot).
5. All workspace operations are blocked until the sandbox client is restored. Communicate to affected users.

#### `WorkspaceDatabaseErrorsHigh`
**Condition**: `rate(codeplane_workspace_db_errors_total[5m]) > 0.5`
**Severity**: Critical
**Runbook**:
1. Check database connectivity and health: `pg_isready`, connection pool status.
2. Check for table lock contention on the `workspaces` table.
3. Review application logs for specific SQL error messages.
4. If VM provisioning succeeded but DB write failed, orphaned VMs may exist — check for VMs with `tech.codeplane.workspace.id` labels that don't correspond to database records. Clean up orphans with `docker rm -f`.
5. If using PGLite (daemon mode), check local disk space and file system health.

### Error Cases and Failure Modes

| Error Case | Detection | Impact | Recovery |
|------------|-----------|--------|----------|
| Container runtime down | `sandbox_errors{error_type="unavailable"}` | All workspace creation blocked | Restart runtime, restart server |
| Container provisioning timeout | Workspace stuck in `starting` >5 min | Single workspace affected | Automatic zombie detection marks as failed; user retries |
| Database write failure after VM creation | `db_errors{operation="create"}` with VM cleanup attempt | Orphaned VM possible | Automated cleanup attempted; manual VM cleanup if needed |
| Snapshot deleted between flag parse and API call | 404 from snapshot lookup | Single creation attempt fails | User selects different snapshot or creates without snapshot |
| Disk full on container host | Provisioning fails with I/O error | All new creation blocked | Free disk space, remove unused containers/images |
| Network partition to container runtime | `sandbox_errors{error_type="provisioning"}` spikes | New creation blocked, existing workspaces unaffected | Restore network connectivity |
| Concurrent CLI invocations | Idempotent logic returns same workspace | No impact (by design) | No action needed |
| Auth token expired/revoked | API returns 401 | Single user blocked | User re-authenticates with `codeplane auth login` |
| Server unreachable | Network connection error | CLI cannot reach API | Check network, verify server URL in CLI config |
| Rate limit exceeded | API returns 429 | Temporary creation block | Wait and retry after `Retry-After` duration |

## Verification

### API Integration Tests

- **`WORKSPACE_CLI_CREATE > API creates workspace with valid name`**: POST `/api/repos/:owner/:repo/workspaces` with `{ "name": "test-ws" }` returns 201 with workspace object containing `name: "test-ws"`, valid UUID `id`, `status` of `"starting"` or `"running"`, `is_fork: false`, `persistence: "persistent"`, `idle_timeout_seconds: 1800`.
- **`WORKSPACE_CLI_CREATE > API creates workspace with empty name`**: POST with `{ "name": "" }` returns 201 with `name: ""`.
- **`WORKSPACE_CLI_CREATE > API creates workspace with empty body`**: POST with `{}` returns 201 with workspace using default empty name and no snapshot.
- **`WORKSPACE_CLI_CREATE > API creates workspace with maximum length name (63 chars)`**: POST with name of exactly 63 valid characters returns 201 successfully.
- **`WORKSPACE_CLI_CREATE > API behavior with name longer than 63 characters`**: POST with a 64-character name — document whether accepted or rejected.
- **`WORKSPACE_CLI_CREATE > API creates workspace from valid snapshot`**: Create a snapshot, then POST with `{ "name": "from-snap", "snapshot_id": "<uuid>" }` returns 201 with `is_fork: true` and `snapshot_id` populated.
- **`WORKSPACE_CLI_CREATE > API returns existing active workspace (idempotent)`**: Create a workspace, then POST again for same repo/user returns the same workspace ID.
- **`WORKSPACE_CLI_CREATE > API rejects invalid JSON body`**: POST with malformed JSON returns 400 with `"invalid request body"`.
- **`WORKSPACE_CLI_CREATE > API returns 404 for non-existent snapshot`**: POST with `{ "snapshot_id": "00000000-0000-0000-0000-000000000000" }` returns 404.
- **`WORKSPACE_CLI_CREATE > API returns 401 for unauthenticated request`**: POST without auth returns 401.
- **`WORKSPACE_CLI_CREATE > API returns 403 for read-only user`**: POST from read-only user returns 403.
- **`WORKSPACE_CLI_CREATE > API handles concurrent creation requests`**: Two simultaneous POST requests for same user/repo do not produce duplicate non-fork workspaces.
- **`WORKSPACE_CLI_CREATE > API trims whitespace from name`**: POST with `{ "name": "  my-ws  " }` stores `"my-ws"`.
- **`WORKSPACE_CLI_CREATE > API returns 500 when sandbox unavailable`**: With no container runtime, POST returns 500.
- **`WORKSPACE_CLI_CREATE > API sets default idle timeout`**: Created workspace has `idle_timeout_seconds: 1800`.
- **`WORKSPACE_CLI_CREATE > API sets default persistence`**: Created workspace has `persistence: "persistent"`.
- **`WORKSPACE_CLI_CREATE > API response includes all required fields`**: Verify response includes `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`.
- **`WORKSPACE_CLI_CREATE > API response timestamps are valid ISO 8601`**: `created_at` and `updated_at` parse as valid dates.
- **`WORKSPACE_CLI_CREATE > API snapshot from different repo returns 404`**: POST with snapshot_id from different repository returns 404.
- **`WORKSPACE_CLI_CREATE > API name with consecutive hyphens at API level`**: POST with `{ "name": "my--ws" }` — document behavior.
- **`WORKSPACE_CLI_CREATE > API name starting with hyphen at API level`**: POST with `{ "name": "-myws" }` — document behavior.

### CLI E2E Tests

- **`codeplane workspace create > creates a workspace with --name`**: Run `codeplane workspace create --name cli-e2e-ws --repo owner/repo --json`, parse JSON output, verify `name` is `"cli-e2e-ws"`, `id` is a valid UUID, `status` is `"starting"` or `"running"`, exit code is 0.
- **`codeplane workspace create > creates a workspace without --name`**: Run `codeplane workspace create --repo owner/repo --json`, verify JSON output contains workspace metadata with `name: ""`, exit code is 0.
- **`codeplane workspace create > creates a workspace with --snapshot`**: Create a snapshot first, then run `codeplane workspace create --name snap-ws --snapshot <snapshot-id> --repo owner/repo --json`, verify `is_fork: true` and `snapshot_id` is set.
- **`codeplane workspace create > auto-detects repo from working directory`**: From inside a cloned repository, run `codeplane workspace create --name auto-detect-ws --json` without `--repo`, verify workspace is created for the correct repository, exit code is 0.
- **`codeplane workspace create > returns error for non-existent repo`**: Run `codeplane workspace create --repo nonexistent/repo --json`, verify exit code is 1, stderr contains error.
- **`codeplane workspace create > returns error for non-existent snapshot`**: Run with invalid `--snapshot` UUID, verify exit code is 1.
- **`codeplane workspace create > outputs human-readable format by default`**: Run without `--json`, verify stdout is not JSON, contains workspace info.
- **`codeplane workspace create > outputs JSON format with --json`**: Run with `--json`, verify stdout is valid JSON.
- **`codeplane workspace create > exit code 0 on success`**: Verify process exit code is 0.
- **`codeplane workspace create > exit code 1 on auth failure`**: Run without authentication, verify exit code is 1.
- **`codeplane workspace create > exit code 1 on permission failure`**: Run as read-only user, verify exit code is 1.
- **`codeplane workspace create > idempotent creation returns existing workspace`**: Create workspace, run create again for same repo, verify same workspace ID returned.
- **`codeplane workspace create > name with 63 characters succeeds`**: Run with `--name` of exactly 63 valid characters, verify exit code is 0 and name is correct.
- **`codeplane workspace create > name with 64 characters behavior documented`**: Run with 64-char `--name`, document whether it succeeds or fails.
- **`codeplane workspace create > created workspace appears in list`**: After creation, run `codeplane workspace list --repo owner/repo --json`, verify workspace appears.
- **`codeplane workspace create > created workspace is viewable`**: After creation, run `codeplane workspace view <id> --repo owner/repo --json`, verify details match.
- **`codeplane workspace create > created workspace is deletable`**: After creation, run `codeplane workspace delete <id> --repo owner/repo --yes`, verify exit code 0.
- **`codeplane workspace create > error message on network failure`**: With server down, run create, verify stderr contains readable connection error.
- **`codeplane workspace create > --repo accepts OWNER/REPO format`**: Run with `--repo myorg/myrepo`, verify correct API endpoint called.
- **`codeplane workspace create > works in scripting pipeline`**: Run `codeplane workspace create --name pipe-ws --repo owner/repo --json | jq -r .id` and verify a UUID is output.

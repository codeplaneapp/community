# WORKSPACE_CREATE

Specification for WORKSPACE_CREATE.

## High-Level User POV

When working on a repository in Codeplane, a developer often needs an isolated, cloud-backed coding environment — a workspace — to build, test, and iterate without affecting their local machine or conflicting with other team members. The workspace creation flow is the primary entry point for spinning up these on-demand development environments.

From any Codeplane surface — web UI, TUI, CLI, or editor integration — a user initiates workspace creation against a specific repository. The experience is intentionally lightweight: the user provides a short, human-readable name for the workspace (e.g., "feature-auth-flow" or "debug-pipeline") and optionally selects an existing snapshot to restore from. If no snapshot is selected, the workspace starts from a clean state. On submission, Codeplane provisions a container-backed environment, clones the repository context into it, and reports the workspace as ready when the container is running and SSH-accessible.

The workspace name acts as a friendly identifier for the user — something easy to remember and reference across the TUI status bar, CLI output, or notification messages. Codeplane enforces naming conventions that keep workspace names DNS-safe and container-compatible: lowercase alphanumeric characters and hyphens only, starting and ending with an alphanumeric character, and no longer than 63 characters.

Provisioning happens asynchronously. After the user submits, a provisioning indicator communicates that the container is being created. In the web and TUI, this transitions into a real-time status stream showing the workspace moving from "starting" to "running." In the CLI, the command returns immediately with the workspace metadata, including its current status, and the user can poll or watch for readiness separately.

When a user already has an active (non-fork) workspace for the same repository, Codeplane reuses it rather than creating a duplicate, returning the existing workspace and ensuring it is running. This prevents unnecessary resource sprawl while still making "give me a workspace" a safe, idempotent operation.

Snapshot-based creation enables teams to maintain pre-configured environments — with dependencies installed, tooling configured, and project state captured — so that new workspaces don't start from scratch every time. When a snapshot is selected, the workspace is created as a fork of that snapshot's state, and Codeplane provisions a fresh container seeded with the snapshot's configuration.

For agent-driven workflows, workspace creation is often fully automated. The CLI's `workspace issue` command creates a workspace, waits for SSH readiness, seeds authentication credentials, runs an AI agent against a repository issue, and creates a landing request if changes are produced — all without human intervention. The workspace creation step is the foundational building block of this automation pipeline.

## Acceptance Criteria

### Definition of Done

- A user can create a workspace scoped to a repository from the API, CLI, TUI, and web surfaces.
- Workspace creation provisions a running, SSH-accessible container environment.
- The user receives immediate feedback with workspace metadata and status transitions.
- Existing active workspaces are reused rather than duplicated (idempotent primary workspace behavior).
- Snapshot-based creation produces a fork workspace from the selected snapshot.
- All error states produce actionable, human-readable messages.
- The feature works consistently across all Codeplane clients.

### Functional Constraints

- **Repository scope**: Workspace creation is always scoped to a single repository via `/:owner/:repo/workspaces`. A workspace cannot be created without a repository context.
- **Name field**:
  - Optional at the API level (defaults to empty string if omitted).
  - Validated at the client level: must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`.
  - Maximum length: 63 characters (aligns with container name and DNS label constraints).
  - Minimum length: 1 character (after trimming whitespace), enforced at client level.
  - Leading and trailing whitespace is trimmed before storage.
  - Uppercase letters are silently lowered at the client input level.
  - Special characters other than hyphens are rejected at keystroke time in the TUI.
- **Snapshot field**:
  - Optional. If omitted or empty, the workspace is created from a blank state.
  - If provided, the snapshot must exist and belong to the same repository and user.
  - If the snapshot does not exist, the server returns HTTP 404.
  - When a snapshot is used, the resulting workspace is marked as a fork (`is_fork: true`) with the snapshot ID recorded as `source_snapshot_id`.
- **Idempotent primary workspace**: If the user already has a non-fork, active workspace for the repository, that workspace is returned and ensured running rather than creating a new one. Stale pending workspaces (pending/starting >5 minutes without a VM) are automatically failed before this check.
- **Initial status**: Newly created workspaces begin in `starting` status and transition to `running` once the container is provisioned and activated.
- **Response payload**: The creation response includes: `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`. Optional fields (`parent_workspace_id`, `ssh_host`, `snapshot_id`) are included only when non-empty.
- **Idle timeout**: Defaults to 1800 seconds (30 minutes).
- **Persistence**: Defaults to the server-configured persistence mode (default: "persistent").

### Edge Cases

- **Empty name**: Accepted at the API level; stored as empty string. Client-side validation should prevent this from the TUI and web UI.
- **Duplicate name**: Currently no server-side uniqueness constraint on workspace names within a repository. The TUI handles a 409 response with an inline error.
- **Missing/invalid JSON body**: Returns HTTP 400 with `"invalid request body"`.
- **Empty JSON body `{}`**: Accepted; creates a workspace with empty name and no snapshot.
- **Snapshot deleted between form load and submit**: Returns HTTP 404 with `"workspace snapshot not found"`.
- **Sandbox client unavailable** (no Docker/Podman runtime): Returns HTTP 500 with `"sandbox client unavailable"`. The workspace is not created.
- **Container provisioning failure**: Returns HTTP 500 with `"create sandbox container: {error details}"`. The workspace record may be partially created with `failed` status.
- **Zombie workspace detection**: Workspaces stuck in `pending` or `starting` for >5 minutes without a VM ID are automatically transitioned to `failed` status before new creation attempts.
- **Whitespace-only name**: Trimmed to empty string; behavior depends on client-side vs. server-side path.
- **Names with consecutive hyphens** (e.g., `my--workspace`): Rejected by the client-side regex.
- **Names starting/ending with hyphens**: Rejected by client-side regex.
- **Very long names (>63 chars)**: Rejected at input time in TUI (stops accepting characters); no server-side length check currently.
- **Concurrent creation requests**: The idempotent primary workspace logic handles concurrent requests by returning the existing active workspace.
- **Fork workspace creation**: The `forkWorkspace()` operation returns 501 (Not Implemented) in Community Edition. Snapshot-based creation is the supported path for workspace cloning.

## Design

### API Shape

**Endpoint**: `POST /api/repos/:owner/:repo/workspaces`

**Request Body**:
```json
{
  "name": "my-workspace",
  "snapshot_id": "optional-snapshot-uuid"
}
```

Both fields are optional. Name defaults to `""`, snapshot_id defaults to `""` (no snapshot).

**Success Response** (HTTP 201):
```json
{
  "id": "uuid",
  "repository_id": 123,
  "user_id": 456,
  "name": "my-workspace",
  "status": "running",
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
| 500 | No sandbox runtime | `"sandbox client unavailable"` |
| 500 | Container creation failed | `"create sandbox container: {error}"` |
| 500 | DB insert failed | `"create workspace failed"` |

### SDK Shape

**Exported types from `@codeplane/sdk`**:

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

**Service method**: `WorkspaceService.createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceResponse>`

### CLI Command

```
codeplane workspace create [--name <name>] [--snapshot <snapshot-id>] [--repo <OWNER/REPO>]
```

**Options**:
- `--name` (string, default: `""`): Human-readable workspace name.
- `--snapshot` (string, optional): Snapshot ID to restore from.
- `--repo` (string, optional): Repository in `OWNER/REPO` format. Auto-detected from current directory if omitted.

**Output** (default): Human-readable summary including workspace ID, name, and status.

**Output** (`--json`): Raw JSON response from the API.

**Exit codes**: 0 on success, 1 on error.

**Related automation command**:
```
codeplane workspace issue <issue-number> [--repo <OWNER/REPO>]
```
This higher-level command creates a workspace, waits for SSH, bootstraps tooling (jj, Node.js), seeds Claude authentication, runs an AI agent against the issue, and creates a landing request.

### TUI UI

**Entry points**:
- Press `c` from the workspace list screen.
- Open command palette (`:`) and type "create workspace".

**Form layout**: Full-screen form with breadcrumb (`Dashboard > owner/repo > Workspaces > New Workspace`), a name text input (pre-focused), an optional snapshot single-select dropdown, and Create/Cancel buttons.

**Screen Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workspaces > New Workspace │ ● conn │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Name ───────────────────────────────────────────────┐   │
│  │ [text input, single line]                            │   │
│  └──────────────────────────────────────────────────────┘   │
│  ⚠ Workspace name is required          (if validation)      │
│                                                             │
│  ┌─ Snapshot (optional) ────────────────────────────────┐   │
│  │ ▸ None                                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [ Create ]   [ Cancel ]                                    │
│                                                             │
│  ⣾ Provisioning workspace…          (if submitting)         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Tab:next field │ Ctrl+S:create │ Esc:cancel      │ ?:help   │
└─────────────────────────────────────────────────────────────┘
```

**Keybindings**:
- `Tab` / `Shift+Tab`: Navigate form fields (Name → Snapshot → Create → Cancel).
- `Ctrl+S`: Submit from any field.
- `Esc`: Cancel (with discard confirmation if dirty).
- `?`: Help overlay.

**Name input behavior**:
- Only `a-z`, `0-9`, `-` accepted.
- Uppercase auto-lowered.
- Stops accepting at 63 characters.
- Standard editing: Backspace, Delete, Left/Right, Home/End, Ctrl+K, Ctrl+U.

**Snapshot selector**:
- Lists all repository snapshots with name and relative creation date.
- `Enter` to open/confirm, `j`/`k` to navigate, `/` to filter, `Esc` to close.
- Shows `(no snapshots)` as disabled placeholder when none exist.

**Submission flow**:
1. Client-side validation (name required and format-valid).
2. Button changes to "Creating…", fields become non-interactive.
3. Braille spinner with "Provisioning workspace…" appears.
4. On success: navigate to workspace detail view with live status stream.
5. On error: form re-enables, error shown at top (or inline for 409/422).

**Responsive behavior**:
- 80×24: Abbreviated labels, 0 gap, inline snapshot summary.
- 120×40: Full labels, 1-line gap, dropdown overlay (8 items).
- 200×60: Full labels with descriptions, overlay (12 items), elapsed time.
- <80×24: "Terminal too small" message, form state preserved.

### Web UI Design

The web UI workspace creation should be accessible from the repository workspaces tab. A "New Workspace" button opens a modal or inline form with:

- Name text input with real-time format validation and 63-char limit.
- Optional snapshot dropdown populated from repository snapshots.
- Create and Cancel actions.
- Loading state with provisioning indicator.
- Real-time status update via SSE once the workspace is created.
- Error states with actionable messages.
- 409 conflict shown inline on name field.

### Documentation

End-user documentation should cover:

- **Concept guide**: What workspaces are, when to use them, and how they relate to repositories.
- **CLI reference**: Full `codeplane workspace create` command documentation with examples.
- **Naming rules**: Clear description of the naming constraints and why they exist (DNS/container compatibility).
- **Snapshot-based creation**: How to create a snapshot, and how to create a workspace from a snapshot.
- **Automation guide**: How `workspace issue` works end-to-end for agent-driven development.
- **Troubleshooting**: Common errors ("sandbox client unavailable", provisioning failures) and remediation steps.

## Permissions & Security

### Authorization

- **Required role**: Write access to the repository. The API endpoint checks `requireWriteAccess()` server-side.
- **Owner / Admin**: Full workspace creation capability, including snapshot-based creation.
- **Member (Write)**: Can create workspaces within repositories they have write access to.
- **Read-Only**: Cannot create workspaces. Receives HTTP 403 `"write access required"` on attempt.
- **Anonymous / Unauthenticated**: Cannot create workspaces. Receives HTTP 401.

### Rate Limiting

- Workspace creation should be rate-limited to prevent resource exhaustion:
  - **Per-user**: Maximum 10 workspace creation requests per minute.
  - **Per-repository**: Maximum 30 workspace creation requests per minute.
  - **Global**: Subject to server-wide rate limiting middleware.
- HTTP 429 with `Retry-After` header when exceeded.
- No auto-retry on 429 from any client.

### Data Privacy Constraints

- Workspace creation records the `user_id` of the creator. Workspace metadata (name, status, timestamps) is visible to all users with read access to the repository.
- SSH access tokens are short-lived (5-minute TTL) and stored as SHA-256 hashes in the database; the plaintext token is returned exactly once.
- Repository secrets and environment variables injected into workspace containers must be treated as sensitive and not logged or exposed in API responses.
- Workspace names should not contain PII; the naming regex prevents most problematic content, but the documentation should advise against embedding sensitive information in workspace names.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workspace.created` | Workspace successfully provisioned | `workspace_id`, `repository_id`, `user_id`, `name_length`, `has_snapshot`, `snapshot_id` (if used), `is_fork`, `status`, `persistence`, `provisioning_duration_ms`, `client` ("api" | "cli" | "tui" | "web" | "desktop") |
| `workspace.create_failed` | Workspace creation failed at any stage | `repository_id`, `user_id`, `error_type` ("sandbox_unavailable" | "provisioning_failed" | "db_error" | "snapshot_not_found"), `error_message`, `has_snapshot`, `client` |
| `workspace.create_reused` | Existing active workspace returned instead of new creation | `workspace_id`, `repository_id`, `user_id`, `original_created_at`, `client` |
| `workspace.zombie_detected` | Stale pending workspace automatically failed | `workspace_id`, `repository_id`, `age_seconds` |
| `tui.workspace_create_form.opened` | TUI create form pushed | `repo_owner`, `repo_name`, `entry_point` ("keybinding" | "command_palette"), `terminal_columns`, `terminal_rows`, `snapshot_count` |
| `tui.workspace_create_form.submitted` | TUI form submitted | `repo_owner`, `repo_name`, `name_length`, `has_snapshot`, `snapshot_id` |
| `tui.workspace_create_form.succeeded` | TUI form API returned 2xx | `repo_owner`, `repo_name`, `workspace_id`, `duration_ms`, `has_snapshot` |
| `tui.workspace_create_form.failed` | TUI form API error | `repo_owner`, `repo_name`, `error_code`, `error_message`, `duration_ms` |
| `tui.workspace_create_form.cancelled` | TUI form cancelled | `repo_owner`, `repo_name`, `was_dirty`, `fields_filled` |
| `tui.workspace_create_form.validation_error` | Client-side validation failed | `repo_owner`, `repo_name`, `field`, `error_type` ("empty" | "format" | "length") |

### Funnel Metrics & Success Indicators

- **Creation success rate**: % of `workspace.created` / (`workspace.created` + `workspace.create_failed`). Target: >95%.
- **TUI form completion rate**: % of `tui.workspace_create_form.opened` → `tui.workspace_create_form.succeeded`. Target: >75%.
- **TUI form abandonment rate**: % of `tui.workspace_create_form.opened` → `tui.workspace_create_form.cancelled` with `was_dirty=true`. Target: <10%.
- **TUI form error rate**: % of `tui.workspace_create_form.submitted` → `tui.workspace_create_form.failed`. Target: <3%.
- **Reuse rate**: % of creation requests that return an existing workspace. Insight metric (no target — high reuse is neutral-to-good).
- **Snapshot utilization**: % of successful creations using a snapshot. Tracks snapshot feature adoption.
- **Provisioning duration p50/p95/p99**: Histogram of `provisioning_duration_ms`. Target: p95 < 30s.
- **Time-to-first-SSH**: Duration from creation to first successful SSH connection. Target: p95 < 60s.
- **Zombie rate**: `workspace.zombie_detected` count per hour. Target: <1/hour under normal operation.

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-----------------|
| `info` | Workspace creation requested | `{ repository_id, user_id, repo_owner, repo_name, has_snapshot, snapshot_id }` |
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
| `debug` | Workspace status notification sent | `{ workspace_id, status, channel }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_creations_total` | Counter | `status` ("success" | "failed" | "reused"), `has_snapshot`, `client` | Total workspace creation attempts |
| `codeplane_workspace_provisioning_duration_seconds` | Histogram | `status` ("success" | "failed") | Time from creation request to final status |
| `codeplane_workspace_active_count` | Gauge | `status` ("pending" | "starting" | "running" | "suspended"), `repository_id` | Current count of workspaces by status |
| `codeplane_workspace_zombie_detections_total` | Counter | — | Total zombie workspaces automatically failed |
| `codeplane_workspace_sandbox_errors_total` | Counter | `error_type` ("unavailable" | "provisioning" | "start" | "cleanup") | Sandbox-related errors |
| `codeplane_workspace_db_errors_total` | Counter | `operation` ("create" | "update_status" | "update_execution_info") | Database operation failures |

### Alerts

#### `WorkspaceProvisioningFailureRateHigh`
**Condition**: `rate(codeplane_workspace_creations_total{status="failed"}[5m]) / rate(codeplane_workspace_creations_total[5m]) > 0.1`
**Severity**: Critical
**Runbook**:
1. Check `codeplane_workspace_sandbox_errors_total` for sandbox-related errors. If `error_type="unavailable"` is spiking, the container runtime (Docker/Podman) may be down or unreachable — verify with `docker info` or `podman info` on the host.
2. If `error_type="provisioning"` is spiking, check container runtime resource limits (disk, memory, CPU). Run `docker ps -a` to check for container accumulation.
3. Check application logs filtered by `level=error AND operation=createWorkspace` for specific error messages.
4. If the issue is transient, existing workspaces should be unaffected. Monitor for recovery over the next 5 minutes.

#### `WorkspaceProvisioningLatencyHigh`
**Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_provisioning_duration_seconds_bucket[5m])) > 60`
**Severity**: Warning
**Runbook**:
1. Check container runtime performance: `docker system df` for disk pressure, `docker stats` for resource utilization.
2. Check if image pulls are slow (first-time provisioning requires pulling the workspace base image).
3. Review system load: high CPU or I/O wait can slow container creation.
4. If latency is consistently high, consider pre-pulling workspace images.

#### `WorkspaceZombieRateHigh`
**Condition**: `rate(codeplane_workspace_zombie_detections_total[1h]) > 5`
**Severity**: Warning
**Runbook**:
1. Zombie workspaces indicate provisioning is starting but never completing. Check sandbox client connectivity.
2. Review `docker logs` for containers that were created but never transitioned to running.
3. Check database connectivity — provisioning may succeed but status updates may fail.
4. Check for network issues between the Codeplane server and the container runtime.

#### `WorkspaceSandboxUnavailable`
**Condition**: `increase(codeplane_workspace_sandbox_errors_total{error_type="unavailable"}[5m]) > 0`
**Severity**: Critical
**Runbook**:
1. The container sandbox client is not initialized. This typically means the container runtime is not configured or not reachable.
2. Verify `CODEPLANE_CONTAINER_RUNTIME` environment variable is set ("docker" or "podman").
3. Verify the container runtime is installed and running: `systemctl status docker` or `podman info`.
4. Restart the Codeplane server if the runtime was started after the server.
5. All workspace operations are blocked until the sandbox client is restored.

#### `WorkspaceDatabaseErrorsHigh`
**Condition**: `rate(codeplane_workspace_db_errors_total[5m]) > 0.5`
**Severity**: Critical
**Runbook**:
1. Check database connectivity and health.
2. Check for table lock contention on the `workspaces` table.
3. Review application logs for specific SQL error messages.
4. If VM provisioning succeeded but DB write failed, orphaned VMs may exist — check for VMs with `tech.codeplane.workspace.id` labels that don't correspond to database records.

### Error Cases and Failure Modes

| Error Case | Detection | Impact | Recovery |
|------------|-----------|--------|----------|
| Container runtime down | `sandbox_errors{error_type="unavailable"}` | All workspace creation blocked | Restart runtime, restart server |
| Container provisioning timeout | Workspace stuck in `starting` >5 min | Single workspace affected | Automatic zombie detection marks as failed; user retries |
| Database write failure after VM creation | `db_errors{operation="create"}` logged with VM cleanup attempt | Orphaned VM possible | Automated cleanup attempted; manual VM cleanup if needed |
| Snapshot deleted mid-creation | 404 from snapshot lookup | Single creation attempt fails | User selects different snapshot or creates without snapshot |
| Disk full on container host | Provisioning fails with I/O error | All new workspace creation blocked | Free disk space, remove unused containers/images |
| Network partition to container runtime | `sandbox_errors{error_type="provisioning"}` spikes | New creation blocked, existing workspaces unaffected | Restore network connectivity |
| Concurrent creation race condition | Multiple `starting` workspaces for same user/repo | Duplicate workspaces (mitigated by idempotent logic) | Stale detection cleans up within 5 minutes |

## Verification

### API Integration Tests

- **`WORKSPACE_CREATE > creates a workspace with valid name`**: POST with `{ "name": "test-ws" }` returns 201 with workspace object containing `name: "test-ws"`, `status: "running"` (or `"starting"`), and valid UUID `id`.
- **`WORKSPACE_CREATE > creates a workspace with empty name`**: POST with `{ "name": "" }` or `{}` returns 201 with workspace object containing `name: ""`.
- **`WORKSPACE_CREATE > creates a workspace with maximum length name (63 chars)`**: POST with name of exactly 63 lowercase alphanumeric/hyphen characters returns 201 successfully.
- **`WORKSPACE_CREATE > rejects name longer than 63 characters`**: POST with a 64-character name — behavior documented (server currently accepts; client-side only enforcement). If server-side validation is added, returns 400 or 422.
- **`WORKSPACE_CREATE > creates a workspace from a valid snapshot`**: Create a snapshot, then POST with `{ "name": "from-snap", "snapshot_id": "<snapshot-uuid>" }` returns 201 with `is_fork: true` and `snapshot_id` set.
- **`WORKSPACE_CREATE > returns existing active workspace (idempotent)`**: Create a workspace, then POST again with same repo/user returns 200 or 201 with the same workspace ID.
- **`WORKSPACE_CREATE > rejects invalid JSON body`**: POST with malformed JSON returns 400 with `"invalid request body"`.
- **`WORKSPACE_CREATE > returns 404 for non-existent snapshot`**: POST with `{ "snapshot_id": "non-existent-uuid" }` returns 404 with `"workspace snapshot not found"`.
- **`WORKSPACE_CREATE > returns 401 for unauthenticated request`**: POST without auth token/session returns 401.
- **`WORKSPACE_CREATE > returns 403 for read-only user`**: POST from a user with only read access returns 403.
- **`WORKSPACE_CREATE > handles concurrent creation requests gracefully`**: Two simultaneous POST requests for the same user/repo do not produce duplicate non-fork workspaces.
- **`WORKSPACE_CREATE > trims whitespace from name`**: POST with `{ "name": "  my-ws  " }` stores `"my-ws"`.
- **`WORKSPACE_CREATE > trims whitespace from snapshot_id`**: POST with `{ "snapshot_id": "  uuid  " }` uses `"uuid"` for lookup.
- **`WORKSPACE_CREATE > returns 500 when sandbox client is unavailable`**: With no container runtime configured, POST returns 500 with `"sandbox client unavailable"`.
- **`WORKSPACE_CREATE > sets correct default idle timeout`**: Created workspace has `idle_timeout_seconds: 1800`.
- **`WORKSPACE_CREATE > sets correct default persistence`**: Created workspace has `persistence: "persistent"` (or configured value).
- **`WORKSPACE_CREATE > response includes all required fields`**: Verify response includes `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`.
- **`WORKSPACE_CREATE > response timestamps are valid ISO strings`**: `created_at` and `updated_at` parse as valid dates.
- **`WORKSPACE_CREATE > workspace status transitions to running`**: After creation, poll/stream the workspace until status is `"running"` (within 120s timeout).
- **`WORKSPACE_CREATE > zombie workspace is failed before new creation`**: Create a workspace, simulate it being stuck in `"starting"` for >5 minutes, then create a new one — the stale workspace should be marked `"failed"`.
- **`WORKSPACE_CREATE > accepts empty JSON body`**: POST with `{}` returns 201 with workspace using default empty name.
- **`WORKSPACE_CREATE > handles name with only hyphens`**: POST with `{ "name": "---" }` — behavior documented (rejected by client regex, server accepts).
- **`WORKSPACE_CREATE > snapshot from different repo returns 404`**: POST with a snapshot_id belonging to a different repository returns 404.

### CLI E2E Tests

- **`codeplane workspace create > creates a workspace with --name`**: `codeplane workspace create --name cli-ws --repo owner/repo --json` returns JSON with `name: "cli-ws"`, `status: "running"`, and valid `id`.
- **`codeplane workspace create > creates a workspace without --name`**: `codeplane workspace create --repo owner/repo --json` returns JSON with workspace metadata.
- **`codeplane workspace create > creates a workspace with --snapshot`**: `codeplane workspace create --name snap-ws --snapshot <id> --repo owner/repo --json` returns workspace with `is_fork: true`.
- **`codeplane workspace create > auto-detects repo from cwd`**: From within a cloned repo directory, `codeplane workspace create --name auto-ws --json` succeeds without `--repo`.
- **`codeplane workspace create > returns error for invalid repo`**: `codeplane workspace create --repo nonexistent/repo --json` returns error.
- **`codeplane workspace create > outputs human-readable format by default`**: `codeplane workspace create --name fmt-ws --repo owner/repo` outputs formatted text (not JSON).
- **`codeplane workspace create > exit code 0 on success`**: Verify exit code is 0.
- **`codeplane workspace create > exit code 1 on failure`**: Verify exit code is 1 when creation fails.

### TUI E2E Tests

- **`TUI_WORKSPACE_CREATE_FORM > renders empty form at 120x40`**: Snapshot of initial form state with Name focused, snapshot "None", Create and Cancel visible.
- **`TUI_WORKSPACE_CREATE_FORM > renders empty form at 80x24`**: Minimum size with abbreviated labels, reduced spacing.
- **`TUI_WORKSPACE_CREATE_FORM > renders empty form at 200x60`**: Large size with wider fields, extra padding.
- **`TUI_WORKSPACE_CREATE_FORM > renders name validation error for empty name`**: Submit empty name; `"⚠ Workspace name is required"` shown.
- **`TUI_WORKSPACE_CREATE_FORM > renders name validation error for invalid format`**: Submit `"-invalid-"`; format error shown.
- **`TUI_WORKSPACE_CREATE_FORM > renders server error banner`**: API 500; red error banner at top.
- **`TUI_WORKSPACE_CREATE_FORM > renders submitting state`**: Create button shows "Creating…", braille spinner with "Provisioning workspace…" visible.
- **`TUI_WORKSPACE_CREATE_FORM > renders snapshot selector expanded`**: Dropdown open with snapshot list showing names and relative dates.
- **`TUI_WORKSPACE_CREATE_FORM > renders snapshot selector with no snapshots`**: `"(no snapshots)"` shown.
- **`TUI_WORKSPACE_CREATE_FORM > renders discard confirmation`**: Dirty form, Esc; `"Discard changes? (y/n)"` prompt shown.
- **`TUI_WORKSPACE_CREATE_FORM > Tab cycles through form fields`**: Tab × 4 cycles Name → Snapshot → Create → Cancel → Name.
- **`TUI_WORKSPACE_CREATE_FORM > Shift+Tab cycles backward`**: Shift+Tab navigates in reverse.
- **`TUI_WORKSPACE_CREATE_FORM > typing in name updates value`**: Type `"my-workspace"`; value reflects input.
- **`TUI_WORKSPACE_CREATE_FORM > uppercase letters are lowered`**: Type `"My-Workspace"`; displays `"my-workspace"`.
- **`TUI_WORKSPACE_CREATE_FORM > invalid characters rejected`**: Type `"my workspace!"`; only `"myworkspace"` accepted.
- **`TUI_WORKSPACE_CREATE_FORM > Ctrl+S submits from any field`**: Submit from name, snapshot, and button fields all work.
- **`TUI_WORKSPACE_CREATE_FORM > Ctrl+S with empty name shows validation error`**: Validation fires, API not called.
- **`TUI_WORKSPACE_CREATE_FORM > Esc on clean form pops immediately`**: No confirmation prompt.
- **`TUI_WORKSPACE_CREATE_FORM > Esc on dirty form shows confirmation`**: Confirmation prompt appears.
- **`TUI_WORKSPACE_CREATE_FORM > successful submit navigates to workspace detail`**: API 201; navigated to detail view.
- **`TUI_WORKSPACE_CREATE_FORM > successful submit with snapshot`**: Workspace created with `snapshot_id`.
- **`TUI_WORKSPACE_CREATE_FORM > failed submit shows error and re-enables form`**: API 500; error shown, form interactive again.
- **`TUI_WORKSPACE_CREATE_FORM > double submit is prevented`**: Ctrl+S twice; only one API call.
- **`TUI_WORKSPACE_CREATE_FORM > name max length enforced at 63 chars`**: Type 64 chars; only 63 accepted.
- **`TUI_WORKSPACE_CREATE_FORM > 409 name conflict shows inline error`**: API 409; inline `"already exists"` error on name field.
- **`TUI_WORKSPACE_CREATE_FORM > resize during submission preserves state`**: Resize from 120×40 to 80×24 mid-submission; spinner and state preserved.
- **`TUI_WORKSPACE_CREATE_FORM > resize below minimum shows warning`**: 60×20; `"terminal too small"` shown; resize back restores form.
- **`TUI_WORKSPACE_CREATE_FORM > c keybinding from workspace list opens form`**: On workspace list, press c; form pushed.
- **`TUI_WORKSPACE_CREATE_FORM > command palette create workspace`**: `:`, type "create workspace", Enter; form pushed.
- **`TUI_WORKSPACE_CREATE_FORM > R retries after error`**: Submit, error, R; re-submits.

### Web UI Playwright Tests

- **`Workspace Create UI > New Workspace button is visible on workspaces tab`**: Navigate to `/:owner/:repo/workspaces`; "New Workspace" button present.
- **`Workspace Create UI > clicking New Workspace opens creation form`**: Button click opens modal/form with name input and snapshot selector.
- **`Workspace Create UI > name input validates format in real-time`**: Type invalid characters; validation error shown.
- **`Workspace Create UI > name input enforces max 63 characters`**: Type beyond 63; input stops accepting.
- **`Workspace Create UI > submitting valid name creates workspace`**: Fill name, submit; workspace created, navigated to detail or list refreshed.
- **`Workspace Create UI > submitting with snapshot creates fork workspace`**: Select snapshot, submit; `is_fork: true` in result.
- **`Workspace Create UI > empty name submission shows validation error`**: Submit empty; error displayed.
- **`Workspace Create UI > cancel button closes form without creation`**: Cancel; form closed, no workspace created.
- **`Workspace Create UI > shows provisioning state during creation`**: Submit; loading indicator visible until response.
- **`Workspace Create UI > error state displays and allows retry`**: Mock 500; error shown, form re-enabled.
- **`Workspace Create UI > read-only user cannot see create button or gets 403`**: Login as read-only user; create button hidden or 403 on submit.
- **`Workspace Create UI > unauthenticated user is redirected to login`**: Not logged in; redirected to login page.
- **`Workspace Create UI > workspace status transitions in real-time via SSE`**: After creation, status badge updates from "starting" to "running" without page reload.

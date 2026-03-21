# WORKSPACE_FORK

Specification for WORKSPACE_FORK.

## High-Level User POV

When you're working in a Codeplane workspace — a cloud-backed, container-based development environment tied to a repository — there are times you want to branch your entire working environment into an independent copy. Maybe you're deep into debugging a production issue and want to try a risky approach without losing your current state. Maybe you want to hand off a pre-configured environment to a teammate or an AI agent so they can continue from exactly where you left off. Maybe you're running parallel experiments against different approaches to the same problem and want isolated sandboxes that each start from the same known-good state.

Workspace forking is the operation that creates a new, independent workspace from the state of an existing one. The forked workspace is a full workspace in its own right — it has its own name, its own lifecycle, its own SSH access, and its own container — but it retains a visible lineage back to the workspace it was forked from, so you always know where it originated.

In Codeplane's Community Edition, workspace forking works through a snapshot-based mechanism. You first take a snapshot of your running workspace (capturing its current file system state, installed dependencies, and configuration), and then create a new workspace from that snapshot. This two-step process is explicit and gives you control: you choose exactly when to capture state, and you can create multiple forks from the same snapshot at different times. The resulting workspace is marked as a fork, carries a reference to the source snapshot, and appears in your workspace list alongside your primary workspace.

For Codeplane Cloud users, a direct fork operation is also available. This single-step flow creates an independent copy of a running workspace without requiring you to manually take a snapshot first. The direct fork captures the workspace's current memory and file system state and provisions a new container from it. This path is designed for sub-second workspace duplication in environments that support VM-level snapshot and restore.

Whether you use the snapshot-based path or the direct fork, the forked workspace behaves identically from that point forward. It does not receive updates from the parent workspace. It does not share container resources. It is a standalone environment that you can modify, suspend, resume, snapshot again, or delete independently. Forked workspaces do not count against the "one active primary workspace per repository" limit — you can have your primary workspace plus as many forks as your quota allows.

Workspace forking is available from the API, CLI, TUI, and web UI. In agent-driven workflows, forking enables parallelism: an orchestrator can fork a workspace multiple times and dispatch different agents to each fork, all working from the same starting point.

## Acceptance Criteria

### Definition of Done

- A user can fork a workspace via the direct fork API endpoint (Codeplane Cloud) or via snapshot-based creation (Community Edition).
- The direct fork endpoint (`POST /api/repos/:owner/:repo/workspaces/:id/fork`) returns HTTP 201 with a full `WorkspaceResponse` when the backend supports direct VM forking, and returns HTTP 501 with a clear error message when it does not.
- The snapshot-based fork path (create snapshot → create workspace from snapshot) works end-to-end in Community Edition, producing a workspace with `is_fork: true` and `source_snapshot_id` set.
- Forked workspaces are fully independent: they have their own container, SSH access, lifecycle, and idle timeout.
- Forked workspaces do not interfere with the idempotent primary workspace behavior (one active non-fork workspace per user per repo).
- The fork relationship is visible in workspace detail views across API, CLI, TUI, and web surfaces.
- All error states produce actionable, human-readable messages.
- The feature works consistently across all Codeplane clients.

### Functional Constraints

- **Repository scope**: Workspace forking is always scoped to a single repository via `/:owner/:repo/workspaces/:id/fork`. A workspace cannot be forked without a repository context.
- **Source workspace must exist**: The workspace identified by `:id` must exist, belong to the specified repository, and belong to the authenticated user. If not found, the server returns HTTP 404 with `"workspace not found"`.
- **Source workspace must be running**: The source workspace must have status `running`. Forking a `pending`, `starting`, `suspended`, or `failed` workspace returns HTTP 409 with `"workspace must be running to fork"`.
- **Name field**:
  - Optional at the API level. If omitted or empty, defaults to `"fork-of-{source-workspace-name}"` (truncated to 63 characters if necessary).
  - Validated at the client level: must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`.
  - Maximum length: 63 characters (aligns with container name and DNS label constraints).
  - Minimum length: 1 character (after trimming whitespace), enforced at client level.
  - Leading and trailing whitespace is trimmed before storage.
  - Uppercase letters are silently lowered at the client input level.
  - Special characters other than hyphens are rejected at keystroke time in the TUI.
- **Fork metadata**:
  - The resulting workspace has `is_fork: true`.
  - The `parent_workspace_id` field is set to the source workspace's ID.
  - The `source_snapshot_id` field is set if the fork was created via the snapshot path.
- **No cascading lifecycle**: Deleting or suspending the parent workspace does not affect the forked workspace. Deleting a fork does not affect the parent.
- **Community Edition behavior**: The direct fork endpoint returns HTTP 501 with `"forking requires Codeplane Cloud — container-based workspaces cannot fork a running VM's memory state"`. Users are directed to the snapshot-based path.
- **Idle timeout**: Inherited from server defaults (1800 seconds), not from the parent workspace's current timeout.
- **Initial status**: A directly forked workspace begins in `starting` status and transitions to `running` once the container is provisioned. A snapshot-based fork also starts in `starting`.
- **Response payload**: The fork response includes: `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork` (always `true`), `parent_workspace_id`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`. Optional fields (`ssh_host`, `snapshot_id`) are included only when non-empty.

### Edge Cases

- **Empty name**: Accepted at the API level; server generates a default name derived from the source workspace name.
- **Name collision**: If a workspace with the same name already exists for the user in the same repository, the API returns HTTP 409 with `"workspace name already in use"`. The TUI handles this with an inline error.
- **Missing/invalid JSON body**: Returns HTTP 400 with `"invalid request body"`.
- **Empty JSON body `{}`**: Accepted; creates a fork with auto-generated name.
- **Sandbox client unavailable** (no Docker/Podman runtime): Returns HTTP 500 with `"sandbox client unavailable"`.
- **Container provisioning failure**: Returns HTTP 500 with `"create sandbox container: {error details}"`. The workspace record may be partially created with `failed` status.
- **Forking a fork**: Allowed. The resulting workspace's `parent_workspace_id` points to the immediate parent, not the root ancestor.
- **Parent workspace deleted between fork initiation and completion**: The fork is created referencing the now-deleted parent. The `parent_workspace_id` remains set but resolves to nothing. This is acceptable — the fork is independent.
- **Concurrent fork requests**: Multiple forks of the same workspace can be created simultaneously. Each produces an independent workspace. Name collisions are resolved by the uniqueness check.
- **Whitespace-only name**: Trimmed to empty string; default name generation kicks in.
- **Names with consecutive hyphens** (e.g., `my--fork`): Rejected by the client-side regex.
- **Names starting/ending with hyphens**: Rejected by client-side regex.
- **Very long names (>63 chars)**: Rejected at input time in TUI (stops accepting characters). Server should validate and return 400/422 if exceeded.
- **Forking a workspace owned by another user**: Returns HTTP 404 (do not reveal existence of other users' workspaces).
- **Rate limiting exceeded**: Returns HTTP 429 with `Retry-After` header.
- **Snapshot-based fork with deleted snapshot**: The snapshot-based creation path returns HTTP 404 with `"workspace snapshot not found"` if the snapshot has been deleted between form load and submit.
- **Maximum fork count**: If a per-user fork limit is enforced, exceeding it returns HTTP 422 with `"fork limit reached for this repository"`.

## Design

### API Shape

#### Direct Fork (Codeplane Cloud)

**Endpoint**: `POST /api/repos/:owner/:repo/workspaces/:id/fork`

**Authentication**: Required (session cookie, PAT, or OAuth2 token)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|--------|------------------------------------|
| `owner` | string | Repository owner |
| `repo` | string | Repository name |
| `id` | string | Source workspace ID (UUID) |

**Request Body** (optional JSON):
```json
{
  "name": "my-fork-workspace"
}
```

| Field | Type | Required | Default | Constraints |
|-------|--------|----------|------------------------------|------------------------------------------|
| `name` | string | No | `"fork-of-{source-name}"` | 1–63 chars, `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` |

**Success Response** (HTTP 201):
```json
{
  "id": "uuid",
  "repository_id": 123,
  "user_id": 456,
  "name": "my-fork-workspace",
  "status": "starting",
  "is_fork": true,
  "parent_workspace_id": "source-workspace-uuid",
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
| 400 | Missing workspace ID | `"workspace id is required"` |
| 401 | Unauthenticated | `"authentication required"` |
| 403 | Insufficient permission | `"write access required"` |
| 404 | Workspace not found | `"workspace not found"` |
| 409 | Workspace not running | `"workspace must be running to fork"` |
| 409 | Name already in use | `"workspace name already in use"` |
| 429 | Rate limited | `"rate limit exceeded"` |
| 500 | No sandbox runtime | `"sandbox client unavailable"` |
| 500 | Provisioning failed | `"create sandbox container: {error}"` |
| 501 | CE direct fork unsupported | `"forking requires Codeplane Cloud — container-based workspaces cannot fork a running VM's memory state"` |

#### Snapshot-Based Fork (Community Edition)

**Step 1 — Create Snapshot**: `POST /api/repos/:owner/:repo/workspaces/:id/snapshot`

Request Body:
```json
{
  "name": "pre-fork-snapshot"
}
```

Success Response (HTTP 201):
```json
{
  "id": "snapshot-uuid",
  "repository_id": 123,
  "user_id": 456,
  "name": "pre-fork-snapshot",
  "workspace_id": "source-workspace-uuid",
  "freestyle_snapshot_id": "codeplane-snapshot-abcdef12-1711100000000",
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z"
}
```

**Step 2 — Create Workspace from Snapshot**: `POST /api/repos/:owner/:repo/workspaces`

Request Body:
```json
{
  "name": "my-fork-workspace",
  "snapshot_id": "snapshot-uuid"
}
```

Success Response (HTTP 201): Same `WorkspaceResponse` shape with `is_fork: true` and `snapshot_id` set.

### SDK Shape

**Exported types from `@codeplane/sdk`**:

```typescript
export interface ForkWorkspaceInput {
  repositoryID: number;
  userID: number;
  workspaceID: string;
  name: string;
}

export interface WorkspaceResponse {
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

export interface CreateWorkspaceSnapshotInput {
  repositoryID: number;
  userID: number;
  workspaceID: string;
  name: string;
}

export interface WorkspaceSnapshotResponse {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  workspace_id?: string;
  freestyle_snapshot_id: string;
  created_at: string;
  updated_at: string;
}
```

**Service methods**:
- `WorkspaceService.forkWorkspace(input: ForkWorkspaceInput): Promise<WorkspaceResponse>` — Direct fork (throws 501 in CE)
- `WorkspaceService.createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceResponse>` — Snapshot-based fork when `snapshotID` is provided
- `WorkspaceService.createWorkspaceSnapshot(input: CreateWorkspaceSnapshotInput): Promise<WorkspaceSnapshotResponse>` — Creates a snapshot for later fork use

### CLI Command

#### Direct Fork

```
codeplane workspace fork <WORKSPACE_ID> [--name <name>] [--repo <OWNER/REPO>]
```

**Arguments**:
| Argument | Description |
|----------|----------------------------------------------|
| `WORKSPACE_ID` | UUID of the workspace to fork |

**Options**:
| Flag | Type | Default | Description |
|---------------------|--------|---------|------------------------------------------|
| `--name` | string | `""` | Human-readable name for the forked workspace |
| `--repo` | string | auto-detect | Repository in `OWNER/REPO` format |

**Output** (default): Human-readable summary including fork workspace ID, name, parent workspace ID, and status.

**Output** (`--json`): Raw JSON response from the API.

**Exit codes**: 0 on success, 1 on error.

**Example**:
```bash
$ codeplane workspace fork abc123-def456 --name experiment-b --repo alice/myapp
Forked workspace experiment-b (id: new-uuid)
  Parent: abc123-def456
  Status: starting
```

**CE behavior**: Prints the 501 error message and suggests the snapshot-based alternative:
```bash
$ codeplane workspace fork abc123-def456 --repo alice/myapp
Error: forking requires Codeplane Cloud — container-based workspaces cannot fork a running VM's memory state
Hint: Use 'codeplane workspace snapshot abc123-def456' to create a snapshot, then 'codeplane workspace create --snapshot <id>' to create a workspace from it.
```

#### Snapshot-Based Fork (two-step)

**Step 1**:
```bash
codeplane workspace snapshot <WORKSPACE_ID> [--name <name>] [--repo <OWNER/REPO>]
```

**Step 2**:
```bash
codeplane workspace create --name <fork-name> --snapshot <SNAPSHOT_ID> [--repo <OWNER/REPO>]
```

### TUI UI

**Entry points**:
- Press `f` from the workspace detail screen to initiate direct fork.
- Press `s` from the workspace detail screen to take a snapshot.
- Open command palette (`:`) and type "fork workspace" or "snapshot workspace".

**Fork Form Layout** (when direct fork is supported):
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workspaces > Fork Workspace │ ● conn │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Forking from: my-workspace (abc123)                        │
│                                                             │
│  ┌─ Name ───────────────────────────────────────────────┐   │
│  │ fork-of-my-workspace                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ⚠ Name is required                  (if validation)       │
│                                                             │
│  [ Fork ]   [ Cancel ]                                      │
│                                                             │
│  ⣾ Provisioning forked workspace…    (if submitting)        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Tab:next field │ Ctrl+S:fork │ Esc:cancel         │ ?:help   │
└─────────────────────────────────────────────────────────────┘
```

**CE Fallback UI**: When the server returns 501, the TUI should show an informational notice:
```
┌─────────────────────────────────────────────────────────────┐
│  ℹ Direct forking is not available in Community Edition.     │
│                                                             │
│  To fork this workspace:                                    │
│  1. Press 's' to take a snapshot                            │
│  2. Create a new workspace from the snapshot                │
│                                                             │
│  [ Take Snapshot ]   [ Cancel ]                             │
└─────────────────────────────────────────────────────────────┘
```

**Keybindings**:
- `Tab` / `Shift+Tab`: Navigate form fields.
- `Ctrl+S`: Submit from any field.
- `Esc`: Cancel (with discard confirmation if dirty).
- `?`: Help overlay.

**Name input behavior**:
- Only `a-z`, `0-9`, `-` accepted.
- Uppercase auto-lowered.
- Stops accepting at 63 characters.
- Pre-populated with `"fork-of-{source-name}"` (editable).

**Submission flow**:
1. Client-side validation (name required and format-valid).
2. Button changes to "Forking…", fields become non-interactive.
3. Braille spinner with "Provisioning forked workspace…" appears.
4. On success: navigate to forked workspace detail view with live status stream.
5. On 501: show CE fallback UI with snapshot alternative.
6. On other error: form re-enables, error shown at top (or inline for 409).

**Responsive behavior**:
- 80×24: Abbreviated labels, 0 gap, source workspace ID truncated.
- 120×40: Full labels, 1-line gap, full source workspace name and ID.
- 200×60: Full labels with descriptions, parent workspace details.
- <80×24: "Terminal too small" message, form state preserved.

### Web UI Design

**Fork Button on Workspace Detail Page**:
- A "Fork" button (or split button with "Fork" / "Snapshot") is displayed on the workspace detail page action bar, visible only when the workspace status is `running`.
- The button is disabled with a tooltip ("Workspace must be running") when the workspace is in any other status.

**Fork Dialog**:
- **Source workspace indicator**: Shows the workspace being forked (name, ID, current status).
- **Name input**: Pre-populated with `"fork-of-{source-name}"`, editable, with real-time format validation and 63-char limit.
- **Fork button**: Submits the fork. On success, navigates to the new forked workspace's detail page.
- **Cancel button**: Closes the dialog without action.
- **Loading state**: Spinner with "Creating forked workspace…" during submission.
- **501 CE notice**: If the server returns 501, the dialog content is replaced with an informational message directing the user to the snapshot workflow, with a "Take Snapshot Instead" button.
- **Error states**: Server errors shown as banner at top of dialog. 409 name conflict shown inline on the name field.

**Fork Indicator on Workspace Views**:
- Forked workspaces display a "Forked from {parent-workspace-name}" badge in the workspace detail header and in workspace list rows.
- The parent workspace name is a clickable link if the parent still exists.
- If the parent workspace has been deleted, the badge reads "Forked from a deleted workspace".

**Workspace List Enhancement**:
- Fork workspaces show a small fork icon or "fork" badge in the workspace list.
- An optional filter toggle ("Show forks" / "Hide forks") allows users to declutter the workspace list.

### Documentation

End-user documentation should cover:

- **"Forking a Workspace" guide**: Explains both the direct fork (Cloud) and snapshot-based fork (CE) workflows, with step-by-step instructions for CLI, TUI, and Web UI.
- **"Understanding Workspace Forks" explainer**: How forks differ from primary workspaces, that forks are independent, that deleting a parent does not affect forks, and the relationship to snapshots.
- **CLI reference for `workspace fork`**: Full synopsis, arguments, options, output formats, examples, and CE error handling.
- **CLI reference for `workspace snapshot`**: How to create a snapshot as the first step of snapshot-based forking.
- **API reference for `POST /api/repos/:owner/:repo/workspaces/:id/fork`**: Request/response schema, error codes, 501 behavior, and curl examples.
- **Troubleshooting guide**: Common errors ("sandbox client unavailable", 501 in CE, provisioning failures, name collisions) and remediation steps.
- **Agent orchestration guide**: How to use workspace forking for parallel agent execution, including example automation scripts that fork a workspace N times and dispatch agents to each.

## Permissions & Security

### Authorization

| Actor | Can Fork? | Notes |
|-------------------------------|-----------|---------------------------------------------------|
| Owner / Admin (repo) | Yes | Full workspace fork capability |
| Member (Write access) | Yes | Can fork their own workspaces within repos they have write access to |
| Read-Only | No | Returns HTTP 403 `"write access required"` |
| Anonymous / Unauthenticated | No | Returns HTTP 401 `"authentication required"` |

**Ownership constraint**: A user can only fork their own workspaces. Attempting to fork another user's workspace returns HTTP 404 (do not reveal existence of other users' workspaces).

### Rate Limiting

- Workspace fork creation should be rate-limited to prevent resource exhaustion:
  - **Per-user**: Maximum 10 workspace fork requests per minute.
  - **Per-repository**: Maximum 30 workspace fork requests per minute.
  - **Global**: Subject to server-wide rate limiting middleware.
- HTTP 429 with `Retry-After` header when exceeded.
- No auto-retry on 429 from any client.
- The snapshot-based fork path is subject to both the snapshot creation rate limit and the workspace creation rate limit independently.

### Data Privacy Constraints

- Workspace fork records the `user_id` of the creator. Forked workspace metadata (name, status, parent reference, timestamps) is visible to all users with read access to the repository.
- The parent workspace's internal state (files, environment variables, secrets) is captured in the snapshot or VM fork. Secrets injected into the parent workspace's container are present in the fork's container. This is acceptable because only the workspace owner can fork their own workspace.
- Workspace names should not contain PII; the naming regex prevents most problematic content, but documentation should advise against embedding sensitive information in workspace names.
- Fork lineage (parent_workspace_id) is visible to the workspace owner. It is not exposed to other users who can view the workspace list.
- SSH access tokens for the forked workspace are generated independently and are not shared with the parent workspace.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `workspace.forked` | Workspace fork successfully created (direct or snapshot-based) | `workspace_id`, `parent_workspace_id`, `repository_id`, `user_id`, `name_length`, `name_was_customized` (bool), `fork_method` ("direct" \| "snapshot"), `snapshot_id` (if snapshot-based), `status`, `provisioning_duration_ms`, `client` ("api" \| "cli" \| "tui" \| "web" \| "desktop") |
| `workspace.fork_failed` | Workspace fork creation failed | `parent_workspace_id`, `repository_id`, `user_id`, `error_type` ("not_implemented" \| "sandbox_unavailable" \| "provisioning_failed" \| "not_found" \| "not_running" \| "name_conflict" \| "db_error"), `error_message`, `fork_method`, `client` |
| `workspace.fork_501_shown` | CE user received 501 "not implemented" from direct fork attempt | `parent_workspace_id`, `repository_id`, `user_id`, `client` |
| `workspace.fork_501_to_snapshot` | CE user followed the 501 guidance and created a snapshot instead | `parent_workspace_id`, `repository_id`, `user_id`, `client`, `time_since_501_ms` |
| `tui.workspace_fork_form.opened` | TUI fork form pushed | `repo_owner`, `repo_name`, `parent_workspace_id`, `entry_point` ("keybinding" \| "command_palette"), `terminal_columns`, `terminal_rows` |
| `tui.workspace_fork_form.submitted` | TUI fork form submitted | `repo_owner`, `repo_name`, `parent_workspace_id`, `name_length`, `name_was_customized` |
| `tui.workspace_fork_form.succeeded` | TUI fork form API returned 2xx | `repo_owner`, `repo_name`, `workspace_id`, `parent_workspace_id`, `duration_ms` |
| `tui.workspace_fork_form.failed` | TUI fork form API error | `repo_owner`, `repo_name`, `error_code`, `error_message`, `duration_ms` |
| `tui.workspace_fork_form.cancelled` | TUI fork form cancelled | `repo_owner`, `repo_name`, `was_dirty`, `fields_filled` |
| `tui.workspace_fork_form.validation_error` | Client-side validation failed | `repo_owner`, `repo_name`, `field`, `error_type` ("empty" \| "format" \| "length") |

### Funnel Metrics & Success Indicators

- **Fork success rate**: % of `workspace.forked` / (`workspace.forked` + `workspace.fork_failed`). Target: >95% (excluding 501s).
- **Direct fork attempt rate (CE)**: Count of `workspace.fork_501_shown` per day. Insight metric — high values suggest users want direct fork but are on CE.
- **501-to-snapshot conversion rate**: % of `workspace.fork_501_to_snapshot` / `workspace.fork_501_shown`. Target: >50%. Measures whether the fallback guidance is effective.
- **TUI form completion rate**: % of `tui.workspace_fork_form.opened` → `tui.workspace_fork_form.succeeded`. Target: >70%.
- **TUI form abandonment rate**: % of `tui.workspace_fork_form.opened` → `tui.workspace_fork_form.cancelled` with `was_dirty=true`. Target: <15%.
- **Fork provisioning duration p50/p95/p99**: Histogram of `provisioning_duration_ms`. Target: p95 < 30s (snapshot-based), p95 < 5s (direct fork on Cloud).
- **Forks per workspace**: Average number of forks created from a single parent workspace. Insight metric — high values indicate parallel experimentation patterns.
- **Fork method distribution**: % direct vs. snapshot-based forks. Tracks Cloud adoption.
- **Name customization rate**: % of forks where `name_was_customized=true`. Insight metric for UX design.

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `info` | Workspace fork requested | `{ repository_id, user_id, parent_workspace_id, fork_method, has_custom_name }` |
| `info` | Workspace fork created successfully | `{ workspace_id, parent_workspace_id, repository_id, user_id, status, fork_method, provisioning_duration_ms }` |
| `info` | Direct fork returned 501 (CE) | `{ parent_workspace_id, repository_id, user_id }` |
| `warn` | Fork name conflict detected | `{ parent_workspace_id, repository_id, user_id, attempted_name }` |
| `warn` | Fork source workspace not found | `{ workspace_id, repository_id, user_id }` |
| `warn` | Fork source workspace not in running state | `{ workspace_id, repository_id, user_id, current_status }` |
| `error` | Sandbox client unavailable during fork | `{ repository_id, user_id, parent_workspace_id }` |
| `error` | Container provisioning failed during fork | `{ workspace_id, parent_workspace_id, repository_id, user_id, error_message, duration_ms }` |
| `error` | Database insert failed during fork | `{ parent_workspace_id, repository_id, user_id, error_message, operation: "forkWorkspace" }` |
| `error` | VM cleanup failed after fork DB error | `{ workspace_id, vm_id, cleanup_error }` |
| `debug` | Fork name auto-generated | `{ parent_workspace_name, generated_name }` |
| `debug` | Fork VM provisioning started | `{ workspace_id, parent_workspace_id, name_prefix, labels }` |
| `debug` | Fork VM provisioning completed | `{ workspace_id, vm_id, duration_ms }` |
| `debug` | Fork workspace status notification sent | `{ workspace_id, status, channel }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_forks_total` | Counter | `status` ("success" \| "failed" \| "not_implemented"), `fork_method` ("direct" \| "snapshot"), `client` | Total workspace fork attempts |
| `codeplane_workspace_fork_provisioning_duration_seconds` | Histogram | `status` ("success" \| "failed"), `fork_method` | Time from fork request to final status |
| `codeplane_workspace_fork_active_count` | Gauge | `repository_id` | Current count of active forked workspaces |
| `codeplane_workspace_fork_501_total` | Counter | `client` | Total 501 responses for direct fork in CE |
| `codeplane_workspace_fork_errors_total` | Counter | `error_type` ("sandbox_unavailable" \| "provisioning" \| "not_found" \| "not_running" \| "name_conflict" \| "db_error") | Fork-specific errors by type |
| `codeplane_workspace_fork_name_collisions_total` | Counter | — | 409 conflicts from duplicate fork names |

### Alerts

#### `WorkspaceForkProvisioningFailureRateHigh`
**Condition**: `rate(codeplane_workspace_forks_total{status="failed"}[5m]) / rate(codeplane_workspace_forks_total{status!="not_implemented"}[5m]) > 0.1`
**Severity**: Critical
**Runbook**:
1. Check `codeplane_workspace_fork_errors_total` by `error_type` to identify the dominant failure mode.
2. If `error_type="sandbox_unavailable"` is spiking, the container runtime (Docker/Podman) may be down — verify with `docker info` or `podman info` on the host.
3. If `error_type="provisioning"` is spiking, check container runtime resource limits (disk, memory, CPU). Run `docker ps -a` to check for container accumulation.
4. Check application logs filtered by `level=error AND operation=forkWorkspace` for specific error messages.
5. If the snapshot-based path is failing, verify snapshot storage is accessible and not corrupted.
6. If the issue is transient, existing workspaces and forks should be unaffected. Monitor for recovery over the next 5 minutes.

#### `WorkspaceForkProvisioningLatencyHigh`
**Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_fork_provisioning_duration_seconds_bucket[5m])) > 60`
**Severity**: Warning
**Runbook**:
1. Check container runtime performance: `docker system df` for disk pressure, `docker stats` for resource utilization.
2. If snapshot-based forks are slow, check if snapshot image pulls or restores are bottlenecked on I/O.
3. Review system load: high CPU or I/O wait can slow container creation.
4. Compare fork provisioning latency with regular workspace creation latency — if both are slow, the issue is systemic.
5. If latency is consistently high, consider pre-pulling workspace images or enabling image caching.

#### `WorkspaceFork501RateHigh`
**Condition**: `rate(codeplane_workspace_fork_501_total[1h]) > 10`
**Severity**: Info (P4)
**Runbook**:
1. This is not a failure — it indicates CE users are attempting direct fork, which is expected behavior.
2. Review the 501-to-snapshot conversion rate to ensure the fallback guidance is effective.
3. If the rate is very high, consider improving the UI/CLI messaging to preemptively guide users to the snapshot path.
4. If this is a Cloud deployment returning 501s, investigate why the direct fork backend is not enabled — check feature flags and sandbox client configuration.

#### `WorkspaceForkSandboxUnavailable`
**Condition**: `increase(codeplane_workspace_fork_errors_total{error_type="sandbox_unavailable"}[5m]) > 0`
**Severity**: Critical
**Runbook**:
1. The container sandbox client is not initialized. This means the container runtime is not configured or not reachable.
2. Verify `CODEPLANE_CONTAINER_RUNTIME` environment variable is set.
3. Verify the container runtime is installed and running: `systemctl status docker` or `podman info`.
4. Restart the Codeplane server if the runtime was started after the server.
5. All workspace fork operations are blocked until the sandbox client is restored.

#### `WorkspaceForkDatabaseErrorsHigh`
**Condition**: `rate(codeplane_workspace_fork_errors_total{error_type="db_error"}[5m]) > 0.5`
**Severity**: Critical
**Runbook**:
1. Check database connectivity and health.
2. Check for table lock contention on the `workspaces` table.
3. Review application logs for specific SQL error messages.
4. If VM provisioning succeeded but DB write failed, orphaned VMs may exist — check for VMs with `tech.codeplane.workspace.id` labels that don't correspond to database records.
5. Verify the `workspaces` table has not hit any row or storage limits.

### Error Cases and Failure Modes

| Error Case | Detection | Impact | Recovery |
|------------|-----------|--------|----------|
| Container runtime down | `fork_errors{error_type="sandbox_unavailable"}` | All workspace fork creation blocked | Restart runtime, restart server |
| Container provisioning timeout | Fork workspace stuck in `starting` >5 min | Single fork affected | Automatic zombie detection marks as failed; user retries |
| Database write failure after VM creation | `fork_errors{error_type="db_error"}` logged with VM cleanup attempt | Orphaned VM possible | Automated cleanup attempted; manual VM cleanup if needed |
| Parent workspace deleted mid-fork | Parent lookup returns null | Fork creation fails with 404 | User creates snapshot first, then forks from snapshot |
| Parent workspace suspended mid-fork | Status check rejects non-running workspace | Fork creation fails with 409 | User resumes parent workspace, then retries fork |
| Disk full on container host | Provisioning fails with I/O error | All new workspace/fork creation blocked | Free disk space, remove unused containers/images |
| Network partition to container runtime | `fork_errors{error_type="provisioning"}` spikes | New fork creation blocked, existing workspaces unaffected | Restore network connectivity |
| Name collision race condition | Two concurrent forks with same name | One succeeds, one gets 409 | User retries with different name |
| Snapshot corruption (snapshot-based path) | Container fails to start from snapshot image | Fork workspace created but fails to run | Delete corrupted snapshot, create new snapshot, retry |

## Verification

### API Integration Tests

#### Direct Fork — Happy Path

- [ ] **`WORKSPACE_FORK > forks a running workspace with custom name`**: Create a running workspace, then POST `/api/repos/:owner/:repo/workspaces/:id/fork` with `{ "name": "my-fork" }`. On Cloud: returns 201 with `is_fork: true`, `parent_workspace_id` set to source ID, `name: "my-fork"`. On CE: returns 501.
- [ ] **`WORKSPACE_FORK > forks a running workspace with empty body`**: POST with `{}` returns 201 (Cloud) with auto-generated name `"fork-of-{source-name}"` or 501 (CE).
- [ ] **`WORKSPACE_FORK > forks a running workspace with no body`**: POST with no request body returns 400 `"invalid request body"` (current behavior requires JSON).
- [ ] **`WORKSPACE_FORK > fork response includes all required fields`**: Verify response includes `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork` (true), `parent_workspace_id`, `freestyle_vm_id`, `persistence`, `idle_timeout_seconds`, `suspended_at`, `created_at`, `updated_at`.
- [ ] **`WORKSPACE_FORK > fork response timestamps are valid ISO strings`**: `created_at` and `updated_at` parse as valid dates.
- [ ] **`WORKSPACE_FORK > forked workspace has independent ID`**: Fork ID is different from parent workspace ID.
- [ ] **`WORKSPACE_FORK > forked workspace status transitions to running`**: After fork creation, poll/stream until status is `"running"` (within 120s timeout).
- [ ] **`WORKSPACE_FORK > fork sets correct default idle timeout`**: Forked workspace has `idle_timeout_seconds: 1800`.
- [ ] **`WORKSPACE_FORK > fork sets correct default persistence`**: Forked workspace has `persistence: "persistent"`.
- [ ] **`WORKSPACE_FORK > forked workspace appears in workspace list`**: After forking, GET workspace list includes the fork with `is_fork: true`.
- [ ] **`WORKSPACE_FORK > fork does not affect parent workspace`**: After forking, GET parent workspace returns unchanged status and metadata.
- [ ] **`WORKSPACE_FORK > forking a fork is allowed`**: Fork workspace A to get B, fork B to get C. C has `parent_workspace_id` pointing to B, not A.
- [ ] **`WORKSPACE_FORK > multiple forks of same workspace with different names`**: Fork same workspace three times with names `"fork-a"`, `"fork-b"`, `"fork-c"` — all succeed.

#### Direct Fork — Name Validation

- [ ] **`WORKSPACE_FORK > name with 1 character (minimum valid)`**: `{ "name": "a" }` succeeds.
- [ ] **`WORKSPACE_FORK > name with exactly 63 characters (maximum valid)`**: `{ "name": "<63-char valid string>" }` succeeds.
- [ ] **`WORKSPACE_FORK > name with 64 characters (exceeds max)`**: Returns 400 or 422 with validation error.
- [ ] **`WORKSPACE_FORK > trims whitespace from name`**: `{ "name": "  my-fork  " }` stores `"my-fork"`.
- [ ] **`WORKSPACE_FORK > whitespace-only name uses default`**: `{ "name": "   " }` generates default name.
- [ ] **`WORKSPACE_FORK > name with uppercase is lowered`**: Server-side behavior documented (clients lower before sending).
- [ ] **`WORKSPACE_FORK > name starting with hyphen`**: Rejected by client validation; server behavior documented.
- [ ] **`WORKSPACE_FORK > name ending with hyphen`**: Rejected by client validation; server behavior documented.
- [ ] **`WORKSPACE_FORK > name with consecutive hyphens`**: Rejected by client validation; server behavior documented.
- [ ] **`WORKSPACE_FORK > name with special characters`**: `{ "name": "my_fork!@#" }` — rejected or sanitized.

#### Direct Fork — Error Cases

- [ ] **`WORKSPACE_FORK > returns 501 in Community Edition`**: POST fork on CE returns 501 with `"forking requires Codeplane Cloud — container-based workspaces cannot fork a running VM's memory state"`.
- [ ] **`WORKSPACE_FORK > returns 400 for missing workspace ID`**: Malformed URL without `:id` returns 400.
- [ ] **`WORKSPACE_FORK > returns 400 for invalid JSON body`**: POST with `{invalid` returns 400 `"invalid request body"`.
- [ ] **`WORKSPACE_FORK > returns 401 for unauthenticated request`**: POST without auth returns 401.
- [ ] **`WORKSPACE_FORK > returns 403 for read-only user`**: POST from read-only user returns 403.
- [ ] **`WORKSPACE_FORK > returns 404 for non-existent workspace`**: POST fork with non-existent workspace UUID returns 404.
- [ ] **`WORKSPACE_FORK > returns 404 for workspace owned by another user`**: POST fork with another user's workspace ID returns 404 (no existence leak).
- [ ] **`WORKSPACE_FORK > returns 409 for non-running workspace (suspended)`**: POST fork on suspended workspace returns 409.
- [ ] **`WORKSPACE_FORK > returns 409 for non-running workspace (starting)`**: POST fork on starting workspace returns 409.
- [ ] **`WORKSPACE_FORK > returns 409 for non-running workspace (failed)`**: POST fork on failed workspace returns 409.
- [ ] **`WORKSPACE_FORK > returns 409 for duplicate fork name`**: Fork twice with same name — first succeeds, second returns 409.
- [ ] **`WORKSPACE_FORK > returns 500 when sandbox client is unavailable`**: With no container runtime configured, POST returns 500.
- [ ] **`WORKSPACE_FORK > handles concurrent fork requests`**: Two simultaneous fork requests with different names both succeed.
- [ ] **`WORKSPACE_FORK > handles concurrent fork requests with same name`**: Two simultaneous fork requests with same name — one succeeds, one gets 409.

#### Snapshot-Based Fork — Happy Path

- [ ] **`WORKSPACE_FORK_SNAPSHOT > creates snapshot from running workspace`**: POST snapshot endpoint returns 201 with snapshot metadata.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > creates workspace from snapshot`**: POST workspace create with `snapshot_id` returns 201 with `is_fork: true` and `snapshot_id` set.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > snapshot-based fork has independent container`**: Forked workspace has different `freestyle_vm_id` from parent.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > multiple workspaces from same snapshot`**: Create three workspaces from the same snapshot — all succeed with unique IDs.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > snapshot name defaults when empty`**: POST snapshot with empty name generates `"snapshot-{timestamp}"`.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > snapshot name with maximum valid length`**: 63-character snapshot name succeeds.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > snapshot from non-running workspace fails`**: Workspace without VM returns 409 `"workspace VM has not been provisioned"`.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > snapshot not found returns 404`**: Create workspace with non-existent snapshot ID returns 404 `"workspace snapshot not found"`.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > snapshot from different repo returns 404`**: Create workspace with snapshot belonging to a different repository returns 404.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > snapshot from different user returns 404`**: Create workspace with snapshot belonging to a different user returns 404.
- [ ] **`WORKSPACE_FORK_SNAPSHOT > deleted snapshot returns 404`**: Delete a snapshot, then try to create workspace from it — returns 404.

#### Fork Lifecycle

- [ ] **`WORKSPACE_FORK_LIFECYCLE > forked workspace can be deleted independently`**: Delete fork — succeeds. Parent workspace unaffected.
- [ ] **`WORKSPACE_FORK_LIFECYCLE > parent workspace can be deleted without affecting fork`**: Delete parent — succeeds. Fork workspace continues to exist and function.
- [ ] **`WORKSPACE_FORK_LIFECYCLE > forked workspace can be suspended and resumed`**: Suspend fork, verify status. Resume fork, verify running.
- [ ] **`WORKSPACE_FORK_LIFECYCLE > forked workspace can be snapshotted`**: Create snapshot from fork — succeeds.
- [ ] **`WORKSPACE_FORK_LIFECYCLE > forked workspace SSH access works`**: Get SSH info for fork — returns valid host/port/token.
- [ ] **`WORKSPACE_FORK_LIFECYCLE > fork does not count as primary workspace`**: Create fork, then create a new primary workspace — both exist (fork does not block primary creation).
- [ ] **`WORKSPACE_FORK_LIFECYCLE > primary workspace idempotent behavior unaffected by forks`**: Create primary workspace, create fork, create primary workspace again — returns same primary workspace ID.

### CLI E2E Tests

- [ ] **`codeplane workspace fork > forks a workspace with --name`**: `codeplane workspace fork <id> --name cli-fork --repo owner/repo --json` returns JSON with `is_fork: true`, `parent_workspace_id` set, `name: "cli-fork"` (Cloud) or prints 501 error with hint (CE).
- [ ] **`codeplane workspace fork > forks a workspace without --name`**: `codeplane workspace fork <id> --repo owner/repo --json` returns JSON with auto-generated name (Cloud) or 501 hint (CE).
- [ ] **`codeplane workspace fork > auto-detects repo from cwd`**: From within a cloned repo directory, `codeplane workspace fork <id> --json` succeeds without `--repo`.
- [ ] **`codeplane workspace fork > returns error for non-existent workspace`**: `codeplane workspace fork nonexistent-id --repo owner/repo` exits non-zero with error.
- [ ] **`codeplane workspace fork > 501 error includes snapshot hint in CE`**: Error output includes suggestion to use snapshot-based path.
- [ ] **`codeplane workspace fork > exit code 0 on success`**: Verify exit code is 0.
- [ ] **`codeplane workspace fork > exit code 1 on failure`**: Verify exit code is 1 when fork fails.
- [ ] **`codeplane workspace fork > outputs human-readable format by default`**: Without `--json`, outputs formatted text with fork ID, parent, and status.
- [ ] **`codeplane workspace fork > snapshot-based fork end-to-end`**: `codeplane workspace snapshot <id> --name snap --repo owner/repo --json` succeeds, then `codeplane workspace create --name from-snap --snapshot <snap-id> --repo owner/repo --json` succeeds with `is_fork: true`.

### TUI E2E Tests

- [ ] **`TUI_WORKSPACE_FORK_FORM > renders fork form at 120x40`**: Snapshot of form with source workspace info, name pre-populated, Fork and Cancel buttons.
- [ ] **`TUI_WORKSPACE_FORK_FORM > renders fork form at 80x24`**: Minimum size with abbreviated labels, truncated source workspace ID.
- [ ] **`TUI_WORKSPACE_FORK_FORM > renders fork form at 200x60`**: Large size with full labels and parent details.
- [ ] **`TUI_WORKSPACE_FORK_FORM > renders name validation error for empty name`**: Clear name and submit; validation error shown.
- [ ] **`TUI_WORKSPACE_FORK_FORM > renders name validation error for invalid format`**: Enter `"-invalid-"`; format error shown.
- [ ] **`TUI_WORKSPACE_FORK_FORM > renders CE fallback UI on 501`**: Submit fork; 501 returned; fallback notice with "Take Snapshot" button shown.
- [ ] **`TUI_WORKSPACE_FORK_FORM > renders submitting state`**: Fork button shows "Forking…", braille spinner visible.
- [ ] **`TUI_WORKSPACE_FORK_FORM > renders server error banner`**: API 500; red error banner at top.
- [ ] **`TUI_WORKSPACE_FORK_FORM > Tab cycles through form fields`**: Tab cycles Name → Fork → Cancel → Name.
- [ ] **`TUI_WORKSPACE_FORK_FORM > Ctrl+S submits from any field`**: Submit from name and button fields both work.
- [ ] **`TUI_WORKSPACE_FORK_FORM > Esc on clean form pops immediately`**: No confirmation prompt when name unchanged from default.
- [ ] **`TUI_WORKSPACE_FORK_FORM > Esc on dirty form shows confirmation`**: Modify name, Esc; confirmation prompt appears.
- [ ] **`TUI_WORKSPACE_FORK_FORM > successful submit navigates to fork detail`**: API 201; navigated to forked workspace detail view.
- [ ] **`TUI_WORKSPACE_FORK_FORM > failed submit shows error and re-enables form`**: API 500; error shown, form interactive again.
- [ ] **`TUI_WORKSPACE_FORK_FORM > double submit is prevented`**: Ctrl+S twice; only one API call.
- [ ] **`TUI_WORKSPACE_FORK_FORM > name max length enforced at 63 chars`**: Type 64 chars; only 63 accepted.
- [ ] **`TUI_WORKSPACE_FORK_FORM > 409 name conflict shows inline error`**: API 409; inline error on name field.
- [ ] **`TUI_WORKSPACE_FORK_FORM > f keybinding from workspace detail opens form`**: On workspace detail, press f; fork form pushed.
- [ ] **`TUI_WORKSPACE_FORK_FORM > command palette fork workspace`**: `:`, type "fork workspace", Enter; form pushed.
- [ ] **`TUI_WORKSPACE_FORK_FORM > resize during submission preserves state`**: Resize mid-submission; spinner and state preserved.
- [ ] **`TUI_WORKSPACE_FORK_FORM > resize below minimum shows warning`**: 60×20; "terminal too small" shown.

### Web UI Playwright Tests

- [ ] **`Workspace Fork UI > Fork button visible on running workspace detail`**: Navigate to workspace detail with status `running`; "Fork" button present.
- [ ] **`Workspace Fork UI > Fork button disabled on non-running workspace`**: Navigate to suspended workspace; Fork button disabled with tooltip.
- [ ] **`Workspace Fork UI > Fork button not visible for read-only user`**: Login as read-only; Fork button hidden.
- [ ] **`Workspace Fork UI > clicking Fork opens fork dialog`**: Button click opens dialog with name input pre-populated.
- [ ] **`Workspace Fork UI > fork dialog shows source workspace info`**: Dialog header shows parent workspace name and ID.
- [ ] **`Workspace Fork UI > name input validates format in real-time`**: Type invalid characters; validation error shown.
- [ ] **`Workspace Fork UI > name input enforces max 63 characters`**: Type beyond 63; input stops accepting.
- [ ] **`Workspace Fork UI > submitting creates forked workspace`**: Fill name, submit; workspace created, navigated to fork detail.
- [ ] **`Workspace Fork UI > fork indicator visible on forked workspace`**: Navigate to fork detail; "Forked from {parent-name}" badge visible.
- [ ] **`Workspace Fork UI > fork indicator links to parent workspace`**: Click parent link; navigates to parent workspace detail.
- [ ] **`Workspace Fork UI > fork badge visible in workspace list`**: Navigate to workspace list; fork entries show fork icon/badge.
- [ ] **`Workspace Fork UI > 501 CE notice shows snapshot alternative`**: Submit fork on CE; dialog shows informational message with "Take Snapshot Instead" button.
- [ ] **`Workspace Fork UI > cancel button closes dialog without action`**: Cancel; dialog closed, no fork created.
- [ ] **`Workspace Fork UI > loading state during fork creation`**: Submit; loading indicator visible until response.
- [ ] **`Workspace Fork UI > error state displays and allows retry`**: Mock 500; error shown, form re-enabled.
- [ ] **`Workspace Fork UI > 409 name conflict shown inline`**: Submit duplicate name; inline error on name field without closing dialog.
- [ ] **`Workspace Fork UI > workspace status transitions via SSE after fork`**: After fork creation, status badge updates from "starting" to "running" without page reload.
- [ ] **`Workspace Fork UI > unauthenticated user redirected to login`**: Not logged in; redirected to login page.

### Cross-Cutting Tests

- [ ] **`WORKSPACE_FORK_CROSS > rate limiting enforced`**: Make 11 fork requests in quick succession → 11th returns 429.
- [ ] **`WORKSPACE_FORK_CROSS > fork from API matches fork from CLI`**: Fork via API and CLI produce structurally identical responses.
- [ ] **`WORKSPACE_FORK_CROSS > fork of archived repository workspace`**: Fork a workspace in an archived repository — behavior documented (should be rejected or allowed based on policy).
- [ ] **`WORKSPACE_FORK_CROSS > fork does not copy workspace sessions`**: Fork a workspace with active sessions; fork has zero sessions.
- [ ] **`WORKSPACE_FORK_CROSS > fork preserves repository association`**: Fork workspace has same `repository_id` as parent.
- [ ] **`WORKSPACE_FORK_CROSS > concurrent forks do not corrupt parent`**: Fork same workspace 5 times in parallel; parent workspace metadata unchanged after all forks complete.
- [ ] **`WORKSPACE_FORK_CROSS > fork cleanup on provisioning failure`**: If container provisioning fails mid-fork, the workspace record is set to `failed` status and no orphaned VM remains.

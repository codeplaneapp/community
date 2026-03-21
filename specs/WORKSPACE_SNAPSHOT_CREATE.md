# WORKSPACE_SNAPSHOT_CREATE

Specification for WORKSPACE_SNAPSHOT_CREATE.

## High-Level User POV

When a developer has been working in a Codeplane workspace — perhaps configuring a complex development environment, installing dependencies, setting up debugging tools, or reaching a stable checkpoint in an agent-driven workflow — they need a way to capture that moment in time so they can return to it later or share it as a starting point for new workspaces.

Creating a workspace snapshot is the "save game" moment for cloud development environments. From the workspace detail view in the web UI, the workspace detail screen in the TUI, or a single CLI command, the user selects a running workspace and creates a named snapshot. The snapshot captures the full state of the workspace's container — installed packages, file system changes, configuration tweaks, everything — and stores it as a reusable image. The user gives the snapshot a short, descriptive name like `after-deps-install` or `clean-baseline` and receives immediate confirmation that the snapshot was created.

Once a snapshot exists, the user (or their teammates working in the same repository) can use it as a starting point when creating new workspaces. Instead of waiting for a fresh environment to bootstrap from scratch, they select an existing snapshot and get a workspace that picks up exactly where the snapshot left off. This is especially valuable for agent-assisted workflows where a known-good environment state is the foundation for repeatable automation.

Snapshots are scoped to the repository and owned by the user who created them. They appear in the snapshots sub-view of the workspace detail screen and in the top-level workspace-snapshots listing for the repository. Users can name, browse, and delete snapshots as part of their normal workspace lifecycle management.

The entire flow is designed to be low-friction: one action to create, a clear name to identify, and immediate availability for workspace creation. No configuration files, no manual export steps, no separate storage management.

## Acceptance Criteria

### Definition of Done

- A user can create a snapshot from any running, provisioned workspace via the API, CLI, web UI, and TUI.
- The snapshot is persisted with a user-provided name (or auto-generated fallback) and is immediately visible in snapshot listings.
- The snapshot can be used as the `snapshot_id` parameter when creating new workspaces.
- All clients (API, CLI, web UI, TUI) handle success, validation errors, and failure states with clear messaging.
- Snapshot creation is scoped to the authenticated user and target repository — no cross-user or cross-repo snapshot access.
- The feature is covered by integration and end-to-end tests across API, CLI, and web surfaces.

### Functional Constraints

- **Source workspace requirement**: A snapshot can only be created from a workspace that exists, belongs to the authenticated user within the target repository, and has a provisioned VM (`freestyle_vm_id` is non-empty).
- **Sandbox client requirement**: The server must have a sandbox client available. If the sandbox runtime is unavailable, snapshot creation returns an appropriate server error.
- **Name handling**: The `name` field is optional. When provided, it is trimmed of leading/trailing whitespace. When omitted or empty after trimming, the server auto-generates a name using the pattern `snapshot-{unix_timestamp_ms}`.
- **Two creation endpoints**: Snapshots can be created via either the workspace-scoped endpoint (`POST /api/repos/:owner/:repo/workspaces/:id/snapshot`) or the top-level endpoint (`POST /api/repos/:owner/:repo/workspace-snapshots` with `workspace_id` in the body). Both delegate to the same service method and produce identical results.
- **Response**: On success, the server returns HTTP 201 with the full `WorkspaceSnapshotResponse` payload including the generated `id`, resolved `name`, `freestyle_snapshot_id`, and timestamps.
- **Idempotency**: Creating two snapshots with the same name from the same workspace is allowed — each produces a distinct snapshot with a unique ID. Snapshot names are not unique-constrained.
- **No snapshot-from-snapshot**: Snapshots are created from workspaces, not from other snapshots. There is no "clone snapshot" operation.

### Boundary Constraints

- **Snapshot name length**: 0–63 characters after trimming. A name longer than 63 characters after trimming must be rejected with HTTP 400.
- **Snapshot name pattern**: When provided and non-empty, must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`. Names with uppercase letters, underscores, spaces (after trim), or special characters must be rejected with HTTP 400.
- **Snapshot name edge cases**: A name consisting entirely of whitespace is treated as empty (auto-generated). A single valid character like `a` is valid. The maximum valid name is 63 lowercase-alphanumeric-and-hyphen characters starting and ending with an alphanumeric character.
- **Workspace ID format**: Must be a valid UUID. Non-UUID workspace IDs return HTTP 400.
- **Request body**: Must be valid JSON when provided. Malformed JSON returns HTTP 400 with `"invalid request body"`.
- **Empty body**: A completely empty request body (no JSON at all) returns HTTP 400. An empty JSON object `{}` is valid (name defaults to auto-generated).
- **Repository path parameters**: `owner` and `repo` must be non-empty path segments.

### Edge Cases

- **Workspace not found**: Returns HTTP 404 with `"workspace not found"`.
- **Workspace exists but VM not provisioned**: Returns HTTP 409 with `"workspace VM has not been provisioned"`.
- **Workspace is suspended**: A suspended workspace still has a `freestyle_vm_id` but the VM is not running. The current implementation allows snapshot creation from any workspace with a provisioned VM ID regardless of workspace status. This is acceptable behavior.
- **Sandbox client unavailable**: Returns HTTP 500 with `"sandbox client unavailable"`.
- **Database persistence failure**: Returns HTTP 500 with `"persist workspace snapshot failed"`.
- **Duplicate snapshot names**: Allowed. Two snapshots with the name `my-snapshot` from the same workspace produce two distinct records.
- **Rapid successive snapshot creation**: No server-side debounce. Multiple concurrent requests each produce separate snapshots. Rate limiting at the API layer prevents abuse.
- **Workspace deleted after snapshot exists**: Orphaned snapshots remain accessible and deletable. The snapshot retains the `workspace_id` reference but the source workspace no longer exists.
- **Top-level endpoint missing workspace_id**: Returns HTTP 400 with `"workspace_id is required"`.
- **Name with leading/trailing hyphens**: After trim, a name like `-my-snapshot` is invalid per the naming pattern and must be rejected.
- **Name that is exactly 63 characters**: Valid and accepted.
- **Name that is 64 characters**: Rejected with HTTP 400.

## Design

### API Shape

#### Workspace-scoped endpoint

**Endpoint**: `POST /api/repos/:owner/:repo/workspaces/:id/snapshot`

**Authentication**: Required (session cookie or PAT).

**Path Parameters**:

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `owner` | string | Required, non-empty | Repository owner username or org |
| `repo` | string | Required, non-empty | Repository name |
| `id` | string (UUID) | Required, valid UUID | Source workspace ID |

**Request Body** (JSON):

```json
{
  "name": "after-deps-install"
}
```

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `name` | string | No | `snapshot-{timestamp}` | 0–63 chars, pattern `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` when non-empty | Human-readable snapshot name |

**Success Response**: HTTP 201

```json
{
  "id": "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
  "repository_id": 42,
  "user_id": 7,
  "name": "after-deps-install",
  "workspace_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "freestyle_snapshot_id": "codeplane-snapshot-f47ac10b-1711234567890",
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid JSON body | `{ "message": "invalid request body" }` |
| 400 | Workspace ID missing/invalid | `{ "message": "workspace id is required" }` |
| 400 | Name validation failure | `{ "message": "invalid snapshot name" }` |
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 404 | Workspace not found or not owned by user | `{ "message": "workspace not found" }` |
| 409 | Workspace VM not provisioned | `{ "message": "workspace VM has not been provisioned" }` |
| 500 | Sandbox client unavailable | `{ "message": "sandbox client unavailable" }` |
| 500 | Database write failure | `{ "message": "persist workspace snapshot failed" }` |

#### Top-level endpoint

**Endpoint**: `POST /api/repos/:owner/:repo/workspace-snapshots`

**Authentication**: Required (session cookie or PAT).

**Request Body** (JSON):

```json
{
  "workspace_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "after-deps-install"
}
```

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `workspace_id` | string (UUID) | Yes | — | Valid UUID | Source workspace to snapshot |
| `name` | string | No | `snapshot-{timestamp}` | 0–63 chars, pattern `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` when non-empty | Human-readable snapshot name |

**Success/Error responses**: Identical to the workspace-scoped endpoint, plus HTTP 400 with `"workspace_id is required"` when `workspace_id` is missing or empty.

### SDK Shape

**Input type**: `CreateWorkspaceSnapshotInput`

```typescript
interface CreateWorkspaceSnapshotInput {
  repositoryID: number;
  userID: number;
  workspaceID: string;
  name: string;
}
```

**Return type**: `WorkspaceSnapshotResponse`

```typescript
interface WorkspaceSnapshotResponse {
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

**Method**: `workspaceService.createWorkspaceSnapshot(input): Promise<WorkspaceSnapshotResponse>`

### CLI Command

**Command**: `codeplane workspace snapshot-create <workspace-id>`

**Options**:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--name` | string | (auto-generated) | Snapshot name |
| `--repo` | string | (inferred from cwd) | Repository in `OWNER/REPO` format |

**Example usage**:

```bash
# Create a named snapshot
codeplane workspace snapshot-create f47ac10b-58cc-4372-a567-0e02b2c3d479 --name after-deps-install

# Create with auto-generated name
codeplane workspace snapshot-create f47ac10b-58cc-4372-a567-0e02b2c3d479

# Specify repository explicitly
codeplane workspace snapshot-create f47ac10b --name clean-env --repo myorg/myrepo
```

**Standard output**:

```
Snapshot created:
  ID:      b1c2d3e4-f5a6-7890-abcd-ef1234567890
  Name:    after-deps-install
  Source:  f47ac10b-58cc-4372-a567-0e02b2c3d479
  Created: 2026-03-22T14:30:00.000Z
```

**JSON output** (`--json`): Returns the raw `WorkspaceSnapshotResponse` object.

**Error output**: CLI exits with code 1 and prints the error message to stderr.

### Web UI Design

The workspace snapshot create action is accessible from two locations:

1. **Workspace detail view — Snapshots section**: Below the sessions sub-view, the snapshots section shows existing snapshots and a "Create Snapshot" button. Clicking the button opens an inline form or modal with a single field for the snapshot name (optional, with placeholder text showing the auto-generated format). A "Create" button submits the form. On success, the new snapshot appears at the top of the snapshots list. On error, an inline error banner shows the error message.

2. **Workspace list — Row action menu**: Each workspace row's action menu includes a "Create Snapshot" option that opens the same creation modal pre-filled with the workspace ID.

**UI States**:

- **Idle**: "Create Snapshot" button is enabled.
- **Submitting**: Button shows loading spinner and is disabled. Name input is disabled.
- **Success**: Toast notification confirms creation. Snapshot list refreshes.
- **Error**: Inline error message below the form. Button re-enables. Name input retains user's value.

**Form Validation** (client-side):

- Name field: max 63 characters. Real-time character counter. Pattern validation on blur with inline error.
- Empty name is valid (will auto-generate).

### TUI UI

The TUI workspace detail screen includes a snapshot creation action:

- **Keybinding**: `s` to open "Create Snapshot" inline prompt.
- **Prompt**: Single-line text input for snapshot name with placeholder `(leave empty for auto-name)`.
- **Submit**: `Enter` to create. `Esc` to cancel.
- **Feedback**: Status line shows `"Creating snapshot..."` during request. On success: `"Snapshot 'name' created"`. On error: error message displayed.
- **List refresh**: The snapshots section auto-refreshes after successful creation.

### Documentation

1. **Workspace Snapshots Guide** — A conceptual overview explaining what snapshots are, when to use them (environment checkpointing, agent workflow baselines, team-shared templates), and how they relate to workspace creation.
2. **CLI Reference: `workspace snapshot-create`** — Command syntax, all flags, example invocations, and error message reference.
3. **API Reference: Create Workspace Snapshot** — Both endpoints documented with request/response schemas, authentication requirements, and error codes.
4. **Quick Start addition** — Add a "Save your workspace as a snapshot" step to the workspace quick start flow.

## Permissions & Security

### Authorization

| Role | Can Create Snapshot? | Condition |
|------|---------------------|----------|
| Workspace Owner | Yes | Must own the workspace (user_id matches) |
| Repository Admin | No (current implementation) | Snapshots are user-scoped; admin cannot snapshot another user's workspace |
| Repository Member | No | Cannot snapshot workspaces they don't own |
| Read-Only | No | No write access |
| Anonymous | No | Authentication required (HTTP 401) |

The current access model is strictly user-scoped: the authenticated user's `user_id` must match the workspace's `user_id` AND the workspace must belong to the specified `repository_id`. This is enforced at the service layer via `dbGetWorkspaceForUserRepo`.

### Rate Limiting

- **Per-user rate limit**: Maximum 30 snapshot creation requests per minute per authenticated user.
- **Per-repository rate limit**: Maximum 60 snapshot creation requests per minute across all users in a repository.
- **Rationale**: Snapshots involve container image operations and database writes. Unbounded creation could exhaust storage or overwhelm the container runtime.

### Data Privacy

- Snapshot names are user-provided strings and should not contain PII. No PII validation is enforced, but documentation should advise against including sensitive information in snapshot names.
- The `freestyle_snapshot_id` is an internal identifier and should not be treated as user-facing in client display, but it is included in the API response for advanced debugging.
- Snapshots contain the full container filesystem, which may include secrets, credentials, or sensitive configuration present in the workspace at snapshot time. Documentation must warn users that snapshots inherit the workspace's runtime state including any files written to disk.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceSnapshotCreated` | Successful snapshot creation | `snapshot_id`, `workspace_id`, `repository_id`, `user_id`, `name_provided` (boolean — whether user supplied a name or it was auto-generated), `source_endpoint` (`workspace_scoped` or `top_level`), `workspace_status` (status of the source workspace at creation time), `client` (`api`, `cli`, `web`, `tui`) |
| `WorkspaceSnapshotCreateFailed` | Snapshot creation failed | `workspace_id`, `repository_id`, `user_id`, `error_type` (`not_found`, `vm_not_provisioned`, `sandbox_unavailable`, `persist_failed`, `validation_error`), `client` |

### Funnel Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Snapshot creation success rate** | `WorkspaceSnapshotCreated / (WorkspaceSnapshotCreated + WorkspaceSnapshotCreateFailed)` | > 95% |
| **Snapshots used for workspace creation** | Percentage of snapshots that are later referenced as `snapshot_id` in `WorkspaceCreated` events | > 30% indicates snapshots are providing value |
| **Snapshot creation latency (p50, p95, p99)** | Time from request receipt to response | p50 < 2s, p95 < 5s, p99 < 10s |
| **Auto-name vs. user-name ratio** | Percentage of snapshots created without a user-supplied name | Informational — high auto-name usage may indicate UX friction in naming |
| **Snapshots per workspace distribution** | Histogram of how many snapshots are created per workspace | Informs storage planning and UX for snapshot management |

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `workspace_snapshot.create.start` | `info` | `workspace_id`, `repository_id`, `user_id`, `name_provided`, `endpoint` | Request received |
| `workspace_snapshot.create.success` | `info` | `snapshot_id`, `workspace_id`, `repository_id`, `user_id`, `name`, `freestyle_snapshot_id`, `duration_ms` | Snapshot persisted |
| `workspace_snapshot.create.workspace_not_found` | `warn` | `workspace_id`, `repository_id`, `user_id` | Workspace lookup failed |
| `workspace_snapshot.create.vm_not_provisioned` | `warn` | `workspace_id`, `repository_id`, `user_id`, `freestyle_vm_id` | VM ID is empty |
| `workspace_snapshot.create.sandbox_unavailable` | `error` | `repository_id`, `user_id` | Sandbox client is null |
| `workspace_snapshot.create.persist_failed` | `error` | `workspace_id`, `repository_id`, `user_id`, `name`, `freestyle_snapshot_id`, `error` | Database INSERT returned null |
| `workspace_snapshot.create.validation_error` | `warn` | `field`, `value`, `rule`, `user_id` | Input validation failed |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_snapshot_create_total` | Counter | `status` (`success`, `error`), `error_type` (`none`, `not_found`, `vm_not_provisioned`, `sandbox_unavailable`, `persist_failed`, `validation_error`) | Total snapshot creation attempts |
| `codeplane_workspace_snapshot_create_duration_seconds` | Histogram | `status` | End-to-end snapshot creation duration |
| `codeplane_workspace_snapshots_total` | Gauge | — | Total number of snapshots in the system (updated on create/delete) |
| `codeplane_workspace_snapshots_per_repo` | Histogram | — | Distribution of snapshots across repositories |

### Alerts

#### Alert: High Snapshot Creation Failure Rate

- **Condition**: `rate(codeplane_workspace_snapshot_create_total{status="error"}[5m]) / rate(codeplane_workspace_snapshot_create_total[5m]) > 0.20` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workspace_snapshot_create_total` by `error_type` to identify the dominant failure mode.
  2. If `sandbox_unavailable`: verify the container runtime (Docker daemon) is running and accessible. Check `docker ps` on the host. Restart the container runtime if needed.
  3. If `persist_failed`: check database connectivity and disk space. Run `SELECT count(*) FROM workspace_snapshots` to verify the table is accessible. Check PostgreSQL logs for constraint violations or connection pool exhaustion.
  4. If `not_found` or `vm_not_provisioned`: this indicates client-side issues (users trying to snapshot invalid workspaces). Check whether a UI bug is sending requests to deleted workspaces. Review recent deployments.
  5. Escalate if failure rate persists after runtime/DB checks.

#### Alert: Snapshot Creation Latency Spike

- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_snapshot_create_duration_seconds_bucket[5m])) > 10` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency. Run `SELECT * FROM pg_stat_activity WHERE query LIKE '%workspace_snapshots%'` to look for slow/blocked queries.
  2. Check container runtime load. High container activity on the host can slow image operations.
  3. Check disk I/O metrics on the database host.
  4. If the database is under load, consider whether a snapshot cleanup job should be run to reduce table size.
  5. Escalate if latency doesn't recover after 15 minutes.

#### Alert: Snapshot Storage Growth

- **Condition**: `codeplane_workspace_snapshots_total > 10000`
- **Severity**: Info
- **Runbook**:
  1. Review per-repository snapshot counts to identify heavy users: `SELECT repository_id, count(*) FROM workspace_snapshots GROUP BY repository_id ORDER BY 2 DESC LIMIT 20`.
  2. Consider implementing a snapshot retention policy or per-user/per-repo snapshot limit.
  3. Communicate with heavy users if needed.
  4. No immediate action required — this is a capacity planning signal.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|--------------|-----------|--------|------------|
| Sandbox client null | Service throws `internal("sandbox client unavailable")` | All snapshot creation blocked | Verify container runtime deployment. Expected in environments without container support. |
| Database connection failure | `dbCreateWorkspaceSnapshot` throws | Snapshot not persisted | Standard DB failover/retry. Check connection pool. |
| Database returns null on INSERT | Service throws `internal("persist workspace snapshot failed")` | Snapshot not created despite valid input | Check for constraint violations, disk space, or schema drift. |
| Workspace deleted between validation and INSERT | Race condition: FK constraint fails on INSERT | HTTP 500 | Low probability. FK constraint violation should be caught and returned as 409. |
| Container runtime timeout | If snapshot involves docker commit, the operation may timeout | Snapshot creation hangs or times out | Implement timeout on container operations. Surface timeout as HTTP 504. |

## Verification

### API Integration Tests

1. **Happy path: Create snapshot with explicit name via workspace-scoped endpoint** — `POST /api/repos/:owner/:repo/workspaces/:id/snapshot` with `{"name": "my-snapshot"}`. Assert HTTP 201, response contains `id` (UUID), `name` equals `"my-snapshot"`, `workspace_id` matches input, timestamps are valid ISO strings.

2. **Happy path: Create snapshot with explicit name via top-level endpoint** — `POST /api/repos/:owner/:repo/workspace-snapshots` with `{"workspace_id": "<id>", "name": "my-snapshot"}`. Assert identical response shape to workspace-scoped endpoint.

3. **Happy path: Create snapshot without name (auto-generated)** — `POST` with `{}` body. Assert HTTP 201, `name` matches pattern `snapshot-\d+`.

4. **Happy path: Create snapshot with empty string name** — `POST` with `{"name": ""}`. Assert HTTP 201, `name` is auto-generated.

5. **Happy path: Create snapshot with whitespace-only name** — `POST` with `{"name": "   "}`. Assert HTTP 201, `name` is auto-generated (trimmed to empty).

6. **Happy path: Create snapshot with minimum valid name (1 char)** — `POST` with `{"name": "a"}`. Assert HTTP 201, `name` equals `"a"`.

7. **Happy path: Create snapshot with maximum valid name (63 chars)** — `POST` with a 63-character valid name. Assert HTTP 201, `name` is the full 63-character string.

8. **Validation: Name exceeds 63 characters** — `POST` with 64-character name. Assert HTTP 400.

9. **Validation: Name contains uppercase letters** — `POST` with `{"name": "MySnapshot"}`. Assert HTTP 400.

10. **Validation: Name contains underscores** — `POST` with `{"name": "my_snapshot"}`. Assert HTTP 400.

11. **Validation: Name starts with hyphen** — `POST` with `{"name": "-my-snapshot"}`. Assert HTTP 400.

12. **Validation: Name ends with hyphen** — `POST` with `{"name": "my-snapshot-"}`. Assert HTTP 400.

13. **Validation: Name contains spaces** — `POST` with `{"name": "my snapshot"}`. Assert HTTP 400.

14. **Validation: Name contains special characters** — `POST` with `{"name": "snap@shot!"}`. Assert HTTP 400.

15. **Error: Workspace not found** — `POST` to a non-existent workspace UUID. Assert HTTP 404 with `"workspace not found"`.

16. **Error: Workspace exists but belongs to different user** — Create workspace as user A, attempt snapshot as user B. Assert HTTP 404 with `"workspace not found"`.

17. **Error: Workspace exists but in different repository** — Attempt snapshot with mismatched repository context. Assert HTTP 404.

18. **Error: Workspace VM not provisioned** — Create workspace without provisioned VM. Assert HTTP 409 with `"workspace VM has not been provisioned"`.

19. **Error: Invalid JSON body** — Send malformed JSON. Assert HTTP 400 with `"invalid request body"`.

20. **Error: Missing workspace_id on top-level endpoint** — `POST /api/repos/:owner/:repo/workspace-snapshots` with `{"name": "test"}`. Assert HTTP 400 with `"workspace_id is required"`.

21. **Error: Empty workspace_id on top-level endpoint** — `POST` with `{"workspace_id": "", "name": "test"}`. Assert HTTP 400 with `"workspace_id is required"`.

22. **Error: Workspace ID is not a valid UUID** — `POST` with `id = "not-a-uuid"`. Assert HTTP 400.

23. **Error: Unauthenticated request** — `POST` without auth headers/cookies. Assert HTTP 401.

24. **Duplicate names: Create two snapshots with same name** — Create snapshot "baseline" twice from the same workspace. Assert both return HTTP 201 with different `id` values.

25. **Snapshot response includes workspace_id** — Assert the response `workspace_id` field is present and matches the source workspace.

26. **Snapshot response freestyle_snapshot_id format** — Assert `freestyle_snapshot_id` matches pattern `codeplane-snapshot-<first8chars>-<timestamp>`.

27. **Snapshot appears in list after creation** — Create a snapshot, then `GET /api/repos/:owner/:repo/workspace-snapshots`. Assert the new snapshot appears in the response array.

28. **Snapshot retrievable by ID after creation** — Create a snapshot, then `GET /api/repos/:owner/:repo/workspace-snapshots/:id`. Assert full response matches creation response.

29. **Snapshot usable for workspace creation** — Create a snapshot, then `POST /api/repos/:owner/:repo/workspaces` with `{"snapshot_id": "<snapshot_id>"}`. Assert workspace is created with the snapshot reference.

### CLI Integration Tests

30. **CLI: Create snapshot with name** — `codeplane workspace snapshot-create <id> --name my-snap --repo owner/repo`. Assert exit code 0, output includes snapshot ID and name.

31. **CLI: Create snapshot without name** — `codeplane workspace snapshot-create <id> --repo owner/repo`. Assert exit code 0, output includes auto-generated name.

32. **CLI: Create snapshot JSON output** — `codeplane workspace snapshot-create <id> --name test --json`. Assert valid JSON output matching `WorkspaceSnapshotResponse`.

33. **CLI: Workspace not found error** — `codeplane workspace snapshot-create nonexistent-uuid --repo owner/repo`. Assert exit code 1, stderr contains error message.

34. **CLI: List snapshots includes created snapshot** — Create a snapshot via CLI, then `codeplane workspace snapshots <id> --repo owner/repo`. Assert the snapshot appears in the list.

### Playwright E2E Tests (Web UI)

35. **Web: Create snapshot from workspace detail** — Navigate to workspace detail view. Click "Create Snapshot". Enter name "e2e-test-snap". Click "Create". Assert toast notification confirms creation. Assert snapshot appears in the snapshots section.

36. **Web: Create snapshot with empty name** — Navigate to workspace detail. Click "Create Snapshot". Leave name empty. Click "Create". Assert success with auto-generated name.

37. **Web: Name validation in UI** — Enter an invalid name (e.g., "My Snapshot!"). Assert inline validation error appears before submission.

38. **Web: Error state for non-provisioned workspace** — Navigate to a workspace that is pending (no VM). Attempt to create a snapshot. Assert error message is displayed inline.

39. **Web: Loading state during snapshot creation** — Click "Create". Assert button shows loading state and name input is disabled during request.

40. **Web: Create snapshot then use it for new workspace** — Create a snapshot from workspace detail. Navigate to workspace list. Create new workspace with the snapshot selected. Assert workspace creation succeeds.

### Cross-Cutting Tests

41. **Rate limiting: Exceed per-user rate limit** — Send 31+ snapshot creation requests in rapid succession. Assert that requests beyond the limit return HTTP 429.

42. **Concurrent snapshot creation** — Send 5 simultaneous snapshot creation requests for the same workspace. Assert all 5 succeed with unique IDs (or some fail gracefully if rate-limited).

43. **Snapshot survives workspace deletion** — Create snapshot. Delete the source workspace. Assert snapshot is still retrievable via `GET /api/repos/:owner/:repo/workspace-snapshots/:id`.

44. **Cross-endpoint consistency** — Create a snapshot via workspace-scoped endpoint. Retrieve it via the top-level endpoint. Assert the response is identical.

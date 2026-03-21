# WORKSPACE_CLI_SNAPSHOTS

Specification for WORKSPACE_CLI_SNAPSHOTS.

## High-Level User POV

Codeplane workspaces are container-backed development environments tied to a repository. As you work inside a workspace — installing packages, modifying configuration, setting up tooling — you accumulate state that is expensive to recreate from scratch. Workspace snapshots let you freeze that state at a point in time and return to it later, or use it as a starting point for new workspaces.

The CLI snapshot commands give you full control over this lifecycle from your terminal. You can create a snapshot of a running workspace with a single command, browse your saved snapshots, inspect one for details, and delete snapshots you no longer need. Snapshots are tied to the repository they were created in and scoped to your user account, so your snapshots never collide with a teammate's.

A common workflow looks like this: you spin up a workspace, install your preferred tools and dependencies, verify everything works, then snapshot it. Next time you create a workspace for the same repository, you pass the snapshot ID and start with all of that setup already in place. When an issue comes in, you can launch a workspace from that golden snapshot and be productive in seconds rather than minutes.

Snapshots survive the deletion of their source workspace. If you delete a workspace, any snapshots you created from it remain available and can still be used to seed new workspaces. This makes snapshots a durable checkpoint rather than a fragile reference.

The CLI snapshot commands follow the same patterns you already know from other Codeplane CLI commands: structured JSON output, automatic repository detection, human-readable formatting by default, and consistent error messages.

## Acceptance Criteria

### Definition of Done

- All four CLI subcommands (`snapshot-create`, `snapshot-list`, `snapshot-view`, `snapshot-delete`) are registered under the `workspace` command group and appear in `codeplane workspace --help`.
- Each command works with both explicit `--repo OWNER/REPO` and automatic repository detection from the current directory.
- Each command supports `--format json` / `--json` for structured output and returns human-readable text by default.
- All commands are backed by the existing server API routes and SDK service methods.
- E2E CLI tests cover every command, every major edge case, and every error path.
- The existing `workspace snapshots` command (workspace-scoped list) is preserved for backward compatibility.

### Functional Constraints

- [ ] `snapshot-create` must accept a workspace ID as a required positional argument.
- [ ] `snapshot-create` must accept an optional `--name` flag for the snapshot name.
- [ ] When `--name` is omitted or empty, the server auto-generates a name in the format `snapshot-{unix_timestamp_ms}`.
- [ ] Snapshot names must be 0–63 characters after trimming whitespace.
- [ ] When non-empty, snapshot names must match the pattern `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` (lowercase alphanumeric and hyphens, no leading/trailing hyphens, no underscores, no uppercase).
- [ ] `snapshot-create` must fail with a clear error if the workspace does not exist.
- [ ] `snapshot-create` must fail with a clear error if the workspace's VM is not provisioned (no `freestyle_vm_id`).
- [ ] `snapshot-create` must fail with a clear error if the sandbox client is unavailable.
- [ ] `snapshot-create` must return the full snapshot object on success (HTTP 201).
- [ ] `snapshot-list` must accept optional `--page` (default 1) and `--limit` (default 30) pagination flags.
- [ ] `snapshot-list` must clamp `--limit` to a maximum of 100.
- [ ] `snapshot-list` must display results ordered by creation date, most recent first.
- [ ] `snapshot-list` must display a message like "No snapshots found" when the list is empty (in human-readable mode).
- [ ] `snapshot-list` in JSON mode must return an empty array `[]` when no snapshots exist.
- [ ] `snapshot-view` must accept a snapshot ID as a required positional argument.
- [ ] `snapshot-view` must return the full snapshot object including name, creation date, and optional workspace ID.
- [ ] `snapshot-view` must fail with a clear error if the snapshot does not exist or belongs to another user.
- [ ] `snapshot-delete` must accept a snapshot ID as a required positional argument.
- [ ] `snapshot-delete` must prompt for confirmation unless `--yes` is provided.
- [ ] `snapshot-delete` must be idempotent: deleting a non-existent snapshot must succeed silently (HTTP 204).
- [ ] `snapshot-delete` must not affect workspaces that were created from the deleted snapshot.
- [ ] All commands must require authentication (fail with a clear error if no token is available).
- [ ] Users can only see and manage their own snapshots (user-scoped isolation enforced server-side).

### Edge Cases

- [ ] Creating a snapshot with a name that is exactly 63 characters must succeed.
- [ ] Creating a snapshot with a name that is 64 characters must fail with a validation error.
- [ ] Creating a snapshot with a name containing uppercase letters must fail with a validation error.
- [ ] Creating a snapshot with a name containing underscores must fail with a validation error.
- [ ] Creating a snapshot with a name starting with a hyphen must fail with a validation error.
- [ ] Creating a snapshot with a name ending with a hyphen must fail with a validation error.
- [ ] Creating a snapshot with a name that is only whitespace must be treated as empty (auto-generate).
- [ ] Creating a snapshot with the name `"a"` (single character) must succeed.
- [ ] Listing snapshots with `--page 0` must be normalized to page 1.
- [ ] Listing snapshots with `--limit 0` must be normalized to the default (30).
- [ ] Listing snapshots with `--limit 200` must be clamped to 100.
- [ ] Viewing a snapshot whose source workspace has been deleted must still succeed, with `workspace_id` absent from the response.
- [ ] Deleting a snapshot that has already been deleted must return success (idempotent).
- [ ] All commands must produce a clear error when the `--repo` value cannot be resolved and no repository is detectable from the working directory.

## Design

### CLI Commands

All commands are registered as subcommands of `codeplane workspace`.

#### `codeplane workspace snapshot-create <workspace-id>`

Creates a point-in-time snapshot of a running workspace's container state.

**Positional Arguments:**
| Argument | Type | Required | Description |
|---|---|---|---|
| `workspace-id` | string (UUID) | Yes | The ID of the workspace to snapshot |

**Options:**
| Flag | Type | Default | Description |
|---|---|---|---|
| `--name` | string | (auto-generated) | Human-readable name for the snapshot |
| `--repo` / `-R` | string | (auto-detect) | Repository in `OWNER/REPO` format |

**Human-readable output:**
```
Created snapshot "clean-baseline" (a1b2c3d4-...) from workspace e5f6a7b8-...
```

**JSON output (`--format json`):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "repository_id": 42,
  "user_id": 7,
  "name": "clean-baseline",
  "workspace_id": "e5f6a7b8-...",
  "freestyle_snapshot_id": "codeplane-snapshot-e5f6a7b8-1711100000000",
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z"
}
```

**Error outputs:**
- Workspace not found → `Error: workspace not found`
- VM not provisioned → `Error: workspace VM is not provisioned — start the workspace first`
- Sandbox unavailable → `Error: sandbox runtime is not available`
- Invalid name → `Error: invalid snapshot name — must be lowercase alphanumeric and hyphens, 1-63 characters, no leading/trailing hyphens`
- Unauthenticated → `Error: authentication required — run 'codeplane auth login'`

#### `codeplane workspace snapshot-list`

Lists all workspace snapshots for the current repository, scoped to the authenticated user.

**Options:**
| Flag | Type | Default | Description |
|---|---|---|---|
| `--repo` / `-R` | string | (auto-detect) | Repository in `OWNER/REPO` format |
| `--page` | number | 1 | Page number |
| `--limit` | number | 30 | Results per page (max 100) |

**Human-readable output (table):**
```
ID                                    Name              Workspace    Created
a1b2c3d4-e5f6-7890-abcd-ef123456789  clean-baseline    e5f6a7b8-…   2 hours ago
b2c3d4e5-f6a7-8901-bcde-f12345678901  snapshot-17111…   (deleted)    3 days ago
```

**Empty state:**
```
No snapshots found
```

**JSON output:** Array of snapshot objects. Empty state returns `[]`.

#### `codeplane workspace snapshot-view <snapshot-id>`

Displays full details of a single workspace snapshot.

**Positional Arguments:**
| Argument | Type | Required | Description |
|---|---|---|---|
| `snapshot-id` | string (UUID) | Yes | The snapshot ID to view |

**Options:**
| Flag | Type | Default | Description |
|---|---|---|---|
| `--repo` / `-R` | string | (auto-detect) | Repository in `OWNER/REPO` format |

**Human-readable output:**
```
Snapshot: clean-baseline
ID:         a1b2c3d4-e5f6-7890-abcd-ef1234567890
Workspace:  e5f6a7b8-... (or "source workspace deleted")
Created:    2026-03-22T10:00:00.000Z (2 hours ago)
```

**JSON output:** Full snapshot object.

**Error outputs:**
- Not found → `Error: snapshot not found`

#### `codeplane workspace snapshot-delete <snapshot-id>`

Permanently deletes a workspace snapshot. Does not affect workspaces created from the snapshot.

**Positional Arguments:**
| Argument | Type | Required | Description |
|---|---|---|---|
| `snapshot-id` | string (UUID) | Yes | The snapshot ID to delete |

**Options:**
| Flag | Type | Default | Description |
|---|---|---|---|
| `--repo` / `-R` | string | (auto-detect) | Repository in `OWNER/REPO` format |
| `--yes` / `-y` | boolean | false | Skip confirmation prompt |

**Confirmation prompt (when `--yes` not provided):**
```
Delete snapshot "clean-baseline" (a1b2c3d4-...)? This cannot be undone. [y/N]
```

**Human-readable output (on success):**
```
Deleted snapshot a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**JSON output:**
```json
{ "status": "deleted", "snapshot": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

Deleting a non-existent snapshot returns the same success output (idempotent behavior).

### API Shape

The CLI commands map to the following existing API endpoints:

| CLI Command | HTTP Method | Endpoint |
|---|---|---|
| `snapshot-create` | POST | `/api/repos/:owner/:repo/workspaces/:id/snapshot` |
| `snapshot-list` | GET | `/api/repos/:owner/:repo/workspace-snapshots?page=N&per_page=N` |
| `snapshot-view` | GET | `/api/repos/:owner/:repo/workspace-snapshots/:id` |
| `snapshot-delete` | DELETE | `/api/repos/:owner/:repo/workspace-snapshots/:id` |

Response codes: 201 (create), 200 (list/view), 204 (delete), 400/401/403/404/409 (errors).

The list endpoint returns an `X-Total-Count` header with the total number of snapshots.

### SDK Shape

The CLI calls the existing `WorkspaceService` methods via the HTTP API:

- `createWorkspaceSnapshot(input: CreateWorkspaceSnapshotInput)` → `WorkspaceSnapshotResponse`
- `listWorkspaceSnapshots(repositoryID, userID, page, perPage)` → `{ snapshots: WorkspaceSnapshotResponse[], total: number }`
- `getWorkspaceSnapshot(snapshotID, repositoryID, userID)` → `WorkspaceSnapshotResponse | null`
- `deleteWorkspaceSnapshot(snapshotID, repositoryID, userID)` → `void`

### Backward Compatibility

The existing `codeplane workspace snapshots <workspace-id>` command (which lists snapshots for a specific workspace) must be preserved. The new `snapshot-list` command is repo-scoped (lists all snapshots for the repository), while the existing `snapshots` command remains workspace-scoped.

### Documentation

The following end-user documentation must be written:

- **CLI Reference — Workspace Snapshots**: A page documenting all four snapshot subcommands with usage examples, flag descriptions, and sample output.
- **Guide — Using Workspace Snapshots**: A walkthrough covering the golden-image workflow (create workspace → configure → snapshot → reuse), how to list and manage snapshots, and how snapshot lifecycle relates to workspace lifecycle.
- **FAQ entry**: "What happens to my snapshots when I delete a workspace?" — Snapshots are independent; they survive workspace deletion.
- **FAQ entry**: "Can other team members use my snapshots?" — No, snapshots are user-scoped. Each user manages their own snapshots.

## Permissions & Security

### Authorization

| Action | Owner | Admin | Member (Write) | Read-Only | Anonymous |
|---|---|---|---|---|---|
| Create snapshot | ✅ | ✅ | ✅ (own workspaces only) | ❌ | ❌ |
| List snapshots | ✅ | ✅ | ✅ (own only) | ❌ | ❌ |
| View snapshot | ✅ | ✅ | ✅ (own only) | ❌ | ❌ |
| Delete snapshot | ✅ | ✅ | ✅ (own only) | ❌ | ❌ |

- Snapshots are **user-scoped**: all CRUD operations are filtered by `user_id` at the database query level.
- Even repository owners and admins only see their own snapshots through these endpoints (there is no admin override for snapshot browsing in the current model).
- The workspace used for snapshot creation must belong to the authenticated user.

### Rate Limiting

| Action | Limit | Scope |
|---|---|---|
| Create snapshot | 30 requests/minute | Per user |
| List snapshots | 60 requests/minute | Per repository |
| View snapshot | 60 requests/minute | Per repository |
| Delete snapshot | 10 requests/minute | Per user |

Create and delete have lower per-user limits because they mutate state and potentially trigger expensive container operations.

### Data Privacy

- The `freestyle_snapshot_id` field is an internal container image reference. It must not contain user PII.
- Snapshot names are user-provided and may contain identifying information. They should be treated as user-controlled content, not logged at INFO level unless anonymized.
- The idempotent delete behavior (204 for non-existent snapshots) prevents enumeration attacks: an attacker cannot probe snapshot IDs to determine which ones exist for other users.
- Snapshot content (the actual container image) may contain secrets, credentials, or sensitive files that the user had in their workspace. Documentation should warn users about this risk.

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|---|---|---|
| `WorkspaceSnapshotCreated` | Snapshot successfully created | `snapshot_id`, `workspace_id`, `repository_id`, `name_provided` (bool), `name_length` |
| `WorkspaceSnapshotViewed` | Snapshot detail viewed | `snapshot_id`, `repository_id`, `client` ("cli") |
| `WorkspaceSnapshotListed` | Snapshot list requested | `repository_id`, `page`, `limit`, `result_count`, `total_count`, `client` ("cli") |
| `WorkspaceSnapshotDeleted` | Snapshot deleted | `snapshot_id`, `repository_id`, `snapshot_age_seconds`, `client` ("cli") |
| `WorkspaceCreatedFromSnapshot` | Workspace created with `--snapshot` | `workspace_id`, `snapshot_id`, `repository_id` |

### Funnel Metrics

- **Snapshot adoption rate**: % of users who have created at least one workspace that go on to create a snapshot.
- **Snapshot reuse rate**: % of snapshots that are used to create at least one new workspace.
- **Snapshot retention**: median age of snapshots at time of deletion. High values suggest snapshots are long-lived golden images; low values suggest they are ephemeral checkpoints.
- **Time-to-first-snapshot**: median time from a user's first workspace creation to their first snapshot creation.
- **CLI vs. API distribution**: % of snapshot operations originating from CLI vs. other clients.

### Success Indicators

- Snapshot creation count is growing week-over-week.
- ≥30% of snapshot-creating users reuse at least one snapshot within 7 days.
- Snapshot-based workspace creation reduces average workspace setup time (measured by time from workspace create to first SSH session).
- Error rate for snapshot operations is <1%.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Snapshot create request received | INFO | `workspace_id`, `repository_id`, `user_id`, `name_provided` |
| Snapshot created successfully | INFO | `snapshot_id`, `workspace_id`, `freestyle_snapshot_id`, `duration_ms` |
| Snapshot create failed — workspace not found | WARN | `workspace_id`, `user_id` |
| Snapshot create failed — VM not provisioned | WARN | `workspace_id`, `user_id` |
| Snapshot create failed — sandbox unavailable | ERROR | `workspace_id`, `user_id` |
| Snapshot create failed — name validation | WARN | `name_length`, `name_pattern_match` |
| Snapshot list request | DEBUG | `repository_id`, `user_id`, `page`, `limit` |
| Snapshot view request | DEBUG | `snapshot_id`, `repository_id`, `user_id` |
| Snapshot view — not found | WARN | `snapshot_id`, `user_id` |
| Snapshot delete request | INFO | `snapshot_id`, `repository_id`, `user_id` |
| Snapshot deleted successfully | INFO | `snapshot_id`, `duration_ms` |
| Snapshot delete — already absent | DEBUG | `snapshot_id`, `user_id` |
| Rate limit exceeded | WARN | `user_id`, `action`, `limit`, `window` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workspace_snapshots_created_total` | Counter | `repository_id`, `status` (success/error) | Total snapshot create attempts |
| `codeplane_workspace_snapshots_deleted_total` | Counter | `repository_id`, `status` (success/not_found) | Total snapshot delete attempts |
| `codeplane_workspace_snapshots_listed_total` | Counter | `repository_id` | Total snapshot list requests |
| `codeplane_workspace_snapshots_viewed_total` | Counter | `repository_id`, `status` (found/not_found) | Total snapshot view requests |
| `codeplane_workspace_snapshot_create_duration_seconds` | Histogram | `repository_id` | Time to create snapshot (container image capture) |
| `codeplane_workspace_snapshots_count` | Gauge | `repository_id` | Current number of snapshots per repository |
| `codeplane_workspace_snapshot_create_errors_total` | Counter | `error_type` (not_found/not_provisioned/sandbox_unavailable/validation/internal) | Breakdown of create failures |

### Alerts

#### Alert: High Snapshot Create Error Rate

**Condition:** `rate(codeplane_workspace_snapshot_create_errors_total[5m]) / rate(codeplane_workspace_snapshots_created_total[5m]) > 0.1` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check the `error_type` label breakdown to identify the dominant failure mode.
2. If `sandbox_unavailable`: verify the container runtime (Docker/Freestyle) is healthy. Check `systemctl status` of the sandbox service. Check disk space on the snapshot storage volume.
3. If `not_provisioned`: this is likely user error (trying to snapshot a stopped workspace). If the rate is abnormally high, check whether workspace VM provisioning is failing upstream.
4. If `validation`: check if a client is sending malformed names. Inspect recent WARN logs with `name_pattern_match: false`.
5. If `internal`: check server error logs for stack traces. Look for database connection issues or OOM conditions.

#### Alert: Snapshot Create Latency Spike

**Condition:** `histogram_quantile(0.95, rate(codeplane_workspace_snapshot_create_duration_seconds_bucket[5m])) > 120` sustained for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Container image capture is the dominant cost. Check the container runtime's snapshot/commit performance.
2. Check disk I/O on the host: `iostat -x 1`. High `%util` on the snapshot storage device indicates I/O saturation.
3. Check if many snapshots are being created concurrently (thundering herd). Look at `rate(codeplane_workspace_snapshots_created_total[1m])`.
4. If the host is under memory pressure, the container image commit may be swapping. Check `free -h` and `dmesg` for OOM messages.
5. Consider whether snapshot storage needs to be migrated to faster media.

#### Alert: Snapshot Storage Growth

**Condition:** `codeplane_workspace_snapshots_count > 500` per repository.

**Severity:** Info

**Runbook:**
1. This is informational. Some repositories may legitimately have many snapshots.
2. Check whether the repository has active automated snapshot creation (e.g., CI-driven).
3. Consider reaching out to the user to suggest cleanup if snapshots are very old and likely unused.
4. Monitor storage volume capacity alongside this alert.

### Error Cases and Failure Modes

| Error Case | HTTP Status | CLI Error Message | Recovery |
|---|---|---|---|
| Not authenticated | 401 | `authentication required — run 'codeplane auth login'` | User runs `codeplane auth login` |
| Repository not found | 404 | `repository not found: OWNER/REPO` | User checks repo slug |
| Workspace not found | 404 | `workspace not found` | User checks workspace ID with `workspace list` |
| Workspace VM not provisioned | 409 | `workspace VM is not provisioned — start the workspace first` | User starts/resumes the workspace |
| Sandbox runtime unavailable | 500 | `sandbox runtime is not available` | Admin checks container runtime health |
| Snapshot name too long | 400 | `invalid snapshot name — must be 0-63 characters` | User shortens name |
| Snapshot name invalid pattern | 400 | `invalid snapshot name — must be lowercase alphanumeric and hyphens, no leading/trailing hyphens` | User fixes name |
| Snapshot not found (view) | 404 | `snapshot not found` | User checks ID with `snapshot-list` |
| Rate limit exceeded | 429 | `rate limit exceeded — try again in N seconds` | User waits |
| Database error | 500 | `internal server error` | Admin checks database health |

## Verification

### CLI E2E Tests

All tests use the `cli()` test helper and follow the established CLI e2e test patterns.

#### snapshot-create

- [ ] **Create snapshot with explicit name**: `codeplane workspace snapshot-create <ws-id> --name my-snapshot --repo OWNER/REPO --format json` → returns 201 with snapshot object containing `name: "my-snapshot"`.
- [ ] **Create snapshot without name**: `codeplane workspace snapshot-create <ws-id> --repo OWNER/REPO --format json` → returns 201 with auto-generated name matching `snapshot-\d+`.
- [ ] **Create snapshot with empty string name**: `codeplane workspace snapshot-create <ws-id> --name "" --repo OWNER/REPO --format json` → auto-generates name.
- [ ] **Create snapshot with whitespace-only name**: `codeplane workspace snapshot-create <ws-id> --name "   " --repo OWNER/REPO --format json` → auto-generates name.
- [ ] **Create snapshot with maximum valid name (63 chars)**: `codeplane workspace snapshot-create <ws-id> --name "a<62 more valid chars>" --repo OWNER/REPO --format json` → succeeds.
- [ ] **Create snapshot with name exceeding 63 chars**: `codeplane workspace snapshot-create <ws-id> --name "a<63 more chars>" --repo OWNER/REPO` → fails with validation error.
- [ ] **Create snapshot with uppercase name**: `codeplane workspace snapshot-create <ws-id> --name "MySnapshot" --repo OWNER/REPO` → fails with validation error.
- [ ] **Create snapshot with underscore in name**: `codeplane workspace snapshot-create <ws-id> --name "my_snapshot" --repo OWNER/REPO` → fails with validation error.
- [ ] **Create snapshot with leading hyphen**: `codeplane workspace snapshot-create <ws-id> --name "-leading" --repo OWNER/REPO` → fails with validation error.
- [ ] **Create snapshot with trailing hyphen**: `codeplane workspace snapshot-create <ws-id> --name "trailing-" --repo OWNER/REPO` → fails with validation error.
- [ ] **Create snapshot with single char name**: `codeplane workspace snapshot-create <ws-id> --name "a" --repo OWNER/REPO --format json` → succeeds.
- [ ] **Create snapshot with name "0" (numeric)**: `codeplane workspace snapshot-create <ws-id> --name "0" --repo OWNER/REPO --format json` → succeeds.
- [ ] **Create snapshot for non-existent workspace**: `codeplane workspace snapshot-create nonexistent-id --repo OWNER/REPO` → fails with "workspace not found".
- [ ] **Create snapshot for workspace with no VM**: Create a workspace that is in a state without a VM provisioned, then attempt to snapshot → fails with provisioning error.
- [ ] **Create snapshot without authentication**: Unset token, run `codeplane workspace snapshot-create <ws-id> --repo OWNER/REPO` → fails with authentication error.
- [ ] **Create snapshot human-readable output**: Run without `--format json` → output matches `Created snapshot "..." (...) from workspace ...`.
- [ ] **Create snapshot JSON output structure**: Verify all expected fields are present: `id`, `repository_id`, `user_id`, `name`, `workspace_id`, `freestyle_snapshot_id`, `created_at`, `updated_at`.

#### snapshot-list

- [ ] **List snapshots with defaults**: `codeplane workspace snapshot-list --repo OWNER/REPO --format json` → returns array of snapshots ordered by `created_at` DESC.
- [ ] **List snapshots empty repo**: Create a fresh repo with no snapshots → `codeplane workspace snapshot-list --repo OWNER/REPO --format json` → returns `[]`.
- [ ] **List snapshots empty repo human-readable**: Same but without JSON → output contains "No snapshots found".
- [ ] **List snapshots with pagination**: Create >30 snapshots, list with default limit → returns exactly 30. List with `--page 2` → returns remaining.
- [ ] **List snapshots with custom limit**: `codeplane workspace snapshot-list --repo OWNER/REPO --limit 5 --format json` → returns at most 5.
- [ ] **List snapshots limit clamped to 100**: `codeplane workspace snapshot-list --repo OWNER/REPO --limit 200 --format json` → returns at most 100.
- [ ] **List snapshots limit 0 normalized**: `codeplane workspace snapshot-list --repo OWNER/REPO --limit 0 --format json` → uses default 30 (or returns results, does not error).
- [ ] **List snapshots page 0 normalized**: `codeplane workspace snapshot-list --repo OWNER/REPO --page 0 --format json` → normalized to page 1.
- [ ] **List snapshots ordering**: Create snapshot A, then snapshot B → list returns B before A.
- [ ] **List snapshots user isolation**: Snapshots created by another user do not appear in the list.
- [ ] **List snapshots without auth**: Unset token → fails with authentication error.
- [ ] **List snapshots table format**: Default output renders a table with ID, Name, Workspace, and Created columns.

#### snapshot-view

- [ ] **View existing snapshot**: `codeplane workspace snapshot-view <id> --repo OWNER/REPO --format json` → returns full snapshot object.
- [ ] **View snapshot human-readable**: Default output shows formatted snapshot details with name, ID, workspace, and creation date.
- [ ] **View non-existent snapshot**: `codeplane workspace snapshot-view nonexistent-uuid --repo OWNER/REPO` → fails with "snapshot not found".
- [ ] **View snapshot from deleted workspace**: Delete the source workspace, then view the snapshot → succeeds with `workspace_id` absent or marked as deleted.
- [ ] **View snapshot without auth**: → fails with authentication error.
- [ ] **View snapshot owned by another user**: → fails with "snapshot not found" (not 403, to prevent enumeration).
- [ ] **View snapshot JSON structure**: Verify all expected fields present and types correct.

#### snapshot-delete

- [ ] **Delete existing snapshot with --yes**: `codeplane workspace snapshot-delete <id> --yes --repo OWNER/REPO` → succeeds, snapshot no longer appears in list.
- [ ] **Delete snapshot human-readable output**: Output matches `Deleted snapshot <id>`.
- [ ] **Delete snapshot JSON output**: `--format json` → returns `{ "status": "deleted", "snapshot": "<id>" }`.
- [ ] **Delete non-existent snapshot**: `codeplane workspace snapshot-delete nonexistent-uuid --yes --repo OWNER/REPO` → succeeds silently (idempotent).
- [ ] **Delete snapshot without --yes**: Without `--yes` flag and non-interactive mode → appropriate behavior (error asking for confirmation or prompt).
- [ ] **Delete snapshot without auth**: → fails with authentication error.
- [ ] **Delete snapshot preserves derived workspaces**: Create workspace from snapshot, delete snapshot → workspace continues to function.
- [ ] **Delete snapshot owned by another user**: → returns 204 (idempotent, no information leakage).

#### Cross-command integration tests

- [ ] **Full lifecycle**: Create workspace → create snapshot → list (verify present) → view (verify details) → delete (verify removed) → list (verify absent).
- [ ] **Create workspace from snapshot**: Create snapshot → create new workspace with `--snapshot <id>` → verify workspace is created successfully.
- [ ] **Multiple snapshots per workspace**: Create 3 snapshots from same workspace → list → verify all 3 present with correct workspace_id.
- [ ] **Orphaned snapshot lifecycle**: Create workspace → create snapshot → delete workspace → view snapshot (still accessible) → delete snapshot (succeeds).
- [ ] **Repo resolution from working directory**: Inside a cloned repo directory, run `codeplane workspace snapshot-list` without `--repo` → succeeds using auto-detected repo.

### API Integration Tests

- [ ] **POST snapshot returns 201 with correct body**: Verify response schema matches `WorkspaceSnapshotResponse`.
- [ ] **POST snapshot with invalid name returns 400**: Body `{ "name": "INVALID" }` → 400 with error detail.
- [ ] **GET snapshot list returns 200 with X-Total-Count header**: Verify header is present and numeric.
- [ ] **GET snapshot list pagination**: Create known number of snapshots, verify page/per_page returns correct subset.
- [ ] **GET snapshot by ID returns 200**: Verify all fields present.
- [ ] **GET snapshot by ID returns 404 for wrong user**: User A's snapshot queried by User B → 404.
- [ ] **DELETE snapshot returns 204**: No response body.
- [ ] **DELETE non-existent snapshot returns 204**: Idempotent behavior.
- [ ] **All endpoints return 401 without auth**: Verify each endpoint.

### Backward Compatibility Tests

- [ ] **Existing `workspace snapshots <id>` command still works**: Verify the workspace-scoped snapshot list command continues to function.
- [ ] **`workspace --help` includes all new snapshot subcommands**: Verify `snapshot-create`, `snapshot-list`, `snapshot-view`, `snapshot-delete` appear in help output.

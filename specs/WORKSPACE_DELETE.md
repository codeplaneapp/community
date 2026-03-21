# WORKSPACE_DELETE

Specification for WORKSPACE_DELETE.

## High-Level User POV

When a user no longer needs a workspace—whether they've finished an issue, merged a landing request, or simply want to clean up—they should be able to delete it quickly and confidently from any Codeplane surface. Deleting a workspace permanently tears down the underlying container environment and frees its compute resources. The workspace disappears from listings and is no longer accessible via SSH, the web terminal, or any editor integration.

Before the workspace is destroyed, the user is always asked to confirm. The confirmation message makes it clear that this action cannot be undone and that any unsaved work inside the container will be lost. If the user has taken a snapshot of the workspace before deleting, that snapshot remains available and can be used to create a new workspace later—deletion only affects the live workspace itself, not its snapshots.

From the CLI, deleting a workspace is a single command. From the TUI, it's a keypress followed by a confirmation prompt. From the web UI, it's an action in the workspace's dropdown menu with a modal confirmation dialog. Regardless of the surface, the result is the same: the container is removed, the workspace is marked as stopped, and any active sessions inside it are terminated. The user sees immediate feedback that the workspace has been deleted, and if the deletion fails for any reason, the workspace reappears in its previous state with a clear error message.

Workspace deletion is scoped to the owner of the workspace. Only the user who created a workspace—or an administrator of the repository it belongs to—can delete it. This prevents accidental or unauthorized destruction of another team member's development environment.

## Acceptance Criteria

### Definition of Done

- [ ] A workspace can be deleted from the API, Web UI, CLI, and TUI
- [ ] The underlying container/VM is destroyed on deletion
- [ ] The workspace status transitions to `stopped` in the database (soft delete)
- [ ] All active sessions within the workspace are terminated on deletion
- [ ] An SSE notification is emitted on the `workspace_status_{id}` channel with status `stopped`
- [ ] Snapshots created from the workspace are NOT deleted and remain independently accessible
- [ ] The workspace no longer appears in workspace list responses after deletion
- [ ] The deleted workspace returns 404 on subsequent GET requests

### Authorization

- [ ] Only the workspace owner (matching `user_id`) can delete their own workspace
- [ ] Repository administrators can delete any workspace in their repository
- [ ] Anonymous or unauthenticated users receive 401
- [ ] Users without access to the repository receive 403
- [ ] Users attempting to delete another user's workspace (without admin role) receive 403

### Input Validation

- [ ] Workspace ID must be a valid UUID format; invalid formats return 400
- [ ] Workspace ID must not be empty; empty values return 400
- [ ] Workspace ID with only whitespace is treated as empty and returns 400
- [ ] Deleting a workspace that does not exist returns 204 (idempotent)
- [ ] Deleting a workspace that is already in `stopped` status returns 204 (idempotent)
- [ ] Deleting a workspace that belongs to a different repository returns 204 (no-op, workspace not found for that repo scope)

### Edge Cases

- [ ] Deleting a workspace while it is in `pending` or `starting` status succeeds and cancels any in-progress provisioning
- [ ] Deleting a workspace while it is `suspended` succeeds and cleans up the suspended container
- [ ] Deleting a workspace while it is in `failed` status succeeds (best-effort container cleanup)
- [ ] If the container runtime is unavailable, workspace deletion still succeeds (status updated, container cleanup is best-effort)
- [ ] If the container has already been removed externally, deletion still succeeds without error
- [ ] Concurrent delete requests for the same workspace both return 204 without error
- [ ] Deleting a workspace that has child snapshots does not cascade-delete those snapshots
- [ ] Deleting a workspace that was forked from another workspace does not affect the parent workspace
- [ ] Deleting a parent workspace does not affect forked child workspaces
- [ ] SSE clients listening to the workspace status stream receive a `stopped` event before the stream ends

### Boundary Constraints

- [ ] Workspace ID: UUID v4 format, exactly 36 characters including hyphens (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- [ ] Owner path segment: 1–39 characters, alphanumeric plus hyphens, must match existing user/org
- [ ] Repo path segment: 1–100 characters, alphanumeric plus hyphens/underscores/dots, must match existing repository

### Confirmation UX

- [ ] Web UI: modal confirmation dialog with workspace name, explicit "Delete" button, and cancel option
- [ ] TUI list view: `d` keypress opens inline confirmation overlay; `y` confirms, `n`/`Esc` cancels
- [ ] TUI detail view: `D` keypress opens inline confirmation overlay; `y` confirms, `n`/`Esc` cancels
- [ ] CLI: no interactive confirmation (scriptable by design); deletion is immediate upon command execution
- [ ] All confirmation dialogs display: "This action cannot be undone"

## Design

### API Shape

**Endpoint:** `DELETE /api/repos/:owner/:repo/workspaces/:id`

**Path Parameters:**

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `owner`   | string | Yes      | Repository owner username or org name    |
| `repo`    | string | Yes      | Repository name                          |
| `id`      | string | Yes      | Workspace UUID                           |

**Request Body:** None.

**Response Codes:**

| Code | Condition                                              |
|------|--------------------------------------------------------|
| 204  | Workspace deleted successfully (no response body)      |
| 204  | Workspace not found for this user/repo (idempotent)    |
| 400  | Workspace ID is missing or malformed                   |
| 401  | Unauthenticated request                                |
| 403  | User lacks permission to delete this workspace         |
| 500  | Unexpected server error                                |

**Response Body:** None (HTTP 204 No Content).

**Response Headers:** Standard Codeplane response headers (request ID, CORS).

**Side Effects:**

1. Underlying VM/container is destroyed via `ContainerSandboxClient.deleteVM()` (best-effort).
2. Workspace status is updated to `stopped` in the database.
3. An SSE event is published on channel `workspace_status_{uuid_no_dashes}` with payload `{"status": "stopped"}`.

### SDK Shape

```typescript
// WorkspaceService
async deleteWorkspace(
  workspaceID: string,
  repositoryID: number,
  userID: number
): Promise<void>
```

- Fetches the workspace scoped to `(workspaceID, repositoryID, userID)`.
- If not found, returns silently (no error).
- If found, calls `doDestroyWorkspace()` which:
  - Deletes the VM via sandbox client (best-effort, swallows errors).
  - Updates workspace status to `stopped`.
  - Emits SSE notification.

### Web UI Design

**Entry Points:**

1. **Workspace List Page** (`/:owner/:repo/workspaces`): Each workspace row has an actions dropdown menu containing a "Delete" option.
2. **Workspace Detail Page** (`/:owner/:repo/workspaces/:id`): An actions dropdown in the page header contains a "Delete" option.

**Confirmation Dialog:**

- Type: Modal dialog overlay
- Title: "Delete Workspace"
- Body: "Are you sure you want to delete workspace **{workspace_name}**? This action cannot be undone. Any unsaved work inside the workspace will be permanently lost."
- Workspace name displayed in monospace/bold for clarity
- If snapshots exist for this workspace, an informational note: "Snapshots created from this workspace will not be deleted."
- Primary action button: "Delete Workspace" (destructive/red styling)
- Secondary action button: "Cancel" (neutral styling)
- Keyboard: `Enter` on the primary button confirms; `Escape` cancels

**Post-Deletion Behavior:**

- From list page: workspace row is removed from the list with a brief success toast "Workspace deleted"
- From detail page: user is navigated back to the workspace list page with a success toast "Workspace deleted"
- Optimistic UI: the workspace is visually removed immediately; if the API call fails, it reappears with an error toast

**Disabled States:**

- The "Delete" option is hidden or disabled if the user lacks permission
- While a delete request is in flight, the button shows a loading spinner and is disabled to prevent double-clicks

### CLI Command

**Command:** `codeplane workspace delete <id>`

**Arguments:**

| Argument | Type   | Required | Description       |
|----------|--------|----------|-------------------|
| `id`     | string | Yes      | Workspace UUID    |

**Options:**

| Option   | Type   | Required | Default        | Description                          |
|----------|--------|----------|----------------|--------------------------------------|
| `--repo` | string | No       | Auto-detected  | Repository in `OWNER/REPO` format    |

**Output (default):**
```
Workspace abc12345-... deleted.
```

**Output (--json):**
```json
{
  "status": "deleted",
  "id": "abc12345-..."
}
```

**Exit Codes:**

| Code | Meaning                                    |
|------|--------------------------------------------|  
| 0    | Workspace deleted (or already gone)        |
| 1    | Error (network, auth, invalid input)       |

### TUI UI

**Workspace List Screen:**

- Keybinding: `d` on focused workspace row
- Confirmation overlay appears centered over the list:
  ```
  ┌─────────────────────────────────────────┐
  │ Delete workspace 'my-workspace'?        │
  │ This action cannot be undone.           │
  │                                         │
  │ [y] Confirm    [n/Esc] Cancel           │
  └─────────────────────────────────────────┘
  ```
- On `y`: row is optimistically removed; API call fires; error reverts with status bar flash
- On `n` or `Esc`: overlay dismissed, no action
- If last workspace is deleted, the list transitions to the empty state view

**Workspace Detail View:**

- Keybinding: `D` (uppercase) from any non-deleted state tab
- Same confirmation overlay pattern as list screen
- On successful deletion: auto-navigates back to workspace list
- Footer action bar updates per state:
  - Running: `s:suspend  D:delete  q:back`
  - Suspended: `r:resume  D:delete  q:back`
  - Stopped/Failed/Error: `D:delete  q:back`
  - Deleted (stopped): `q:back` (delete action hidden)

### Editor Integrations

**VS Code:**

- The workspace tree view item should include a "Delete Workspace" context menu action
- Triggers the same `DELETE /api/repos/:owner/:repo/workspaces/:id` endpoint
- Shows a VS Code confirmation dialog before proceeding
- On success: refreshes the workspace tree view
- On failure: shows a VS Code error notification

**Neovim:**

- Command: `:Codeplane workspace delete <id>` or via Telescope picker with delete action
- Confirmation prompt in command line: `Delete workspace 'name'? (y/N)`
- On success: prints confirmation message
- On failure: prints error with `vim.notify` at error level

### Documentation

- **CLI Reference:** Document `codeplane workspace delete <id>` with all options, output formats, and exit codes.
- **API Reference:** Document `DELETE /api/repos/:owner/:repo/workspaces/:id` with path parameters, response codes, and idempotency behavior.
- **User Guide — Workspaces:** Add a "Deleting a Workspace" section explaining: how to delete from each surface (web, CLI, TUI); that deletion is permanent and cannot be undone; that snapshots are preserved independently; that active sessions are terminated; that the user should snapshot before deleting if they want to preserve state.

## Permissions & Security

### Authorization Matrix

| Role                     | Can Delete? | Notes                                         |
|--------------------------|-------------|-----------------------------------------------|
| Workspace Owner          | ✅ Yes      | Can always delete their own workspaces         |
| Repository Admin         | ✅ Yes      | Can delete any workspace in the repository     |
| Repository Write Member  | ❌ No       | Cannot delete other users' workspaces          |
| Repository Read Member   | ❌ No       | Cannot delete workspaces                       |
| Anonymous                | ❌ No       | Receives 401                                   |
| Organization Owner       | ✅ Yes      | Inherits admin over all org repositories       |

### Rate Limiting

- **Per-user rate limit:** 30 delete requests per minute per user
- **Per-repository rate limit:** 60 delete requests per minute per repository
- **Burst allowance:** Up to 10 concurrent delete requests from the same user
- **Exceeded response:** HTTP 429 with `Retry-After` header

### Data Privacy

- Workspace deletion does NOT remove the database record; it soft-deletes by setting status to `stopped`. The record remains for audit purposes.
- The underlying container and its filesystem are destroyed, ensuring user code and secrets inside the workspace are not recoverable after deletion.
- Workspace metadata (name, timestamps, owner) persists in the database after deletion. This is acceptable for audit trails and is not considered PII exposure.
- No PII is included in SSE notification payloads (only workspace ID and status).
- Deletion logs must NOT include workspace contents, secrets, or environment variables.

### Security Considerations

- The delete endpoint must validate that the authenticated user has ownership or admin access before proceeding. The current implementation scopes the DB lookup to `(workspaceID, repositoryID, userID)`, which inherently prevents cross-user deletion.
- Container destruction is performed server-side; the user never has direct access to the container runtime API.
- Even if the container sandbox client is unavailable, the workspace status is updated to prevent re-access.

## Telemetry & Product Analytics

### Business Events

| Event Name            | Trigger                                      | Properties                                                                                                     |
|-----------------------|----------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `WorkspaceDeleted`    | Workspace successfully deleted (status → stopped) | `workspace_id`, `repository_id`, `user_id`, `workspace_name`, `workspace_status_before`, `workspace_age_seconds`, `had_active_sessions`, `had_snapshots`, `was_fork`, `deletion_surface` (web/cli/tui/editor), `container_cleanup_success` (boolean) |
| `WorkspaceDeleteFailed` | Deletion attempt failed                      | `workspace_id`, `repository_id`, `user_id`, `error_type`, `error_message`, `deletion_surface`                 |
| `WorkspaceDeleteCancelled` | User cancelled confirmation dialog          | `workspace_id`, `repository_id`, `user_id`, `deletion_surface`                                                |

### Funnel Metrics

| Metric                              | Definition                                                        | Success Target |
|--------------------------------------|-------------------------------------------------------------------|----------------|
| Delete confirmation rate             | % of delete confirmation dialogs where user confirms              | > 80%          |
| Delete success rate                  | % of delete API calls that return 204                             | > 99.5%        |
| Container cleanup success rate       | % of deletions where VM/container was successfully removed        | > 98%          |
| Mean time to delete                  | P50/P95/P99 latency of the delete API call                       | P95 < 5s       |
| Workspace lifetime before deletion   | Distribution of workspace age at deletion time                    | Informational  |
| Snapshot-before-delete rate          | % of deletions preceded by a snapshot creation within 5 minutes   | Informational  |

### Product Insights

- Track whether users tend to delete workspaces manually or let them be cleaned up by idle timeout. High manual deletion rates may indicate that idle cleanup thresholds are too conservative.
- Track the ratio of workspace deletions to workspace creations to understand workspace churn.
- Track deletion surface distribution to understand which clients are most used for workspace lifecycle management.

## Observability

### Logging Requirements

| Log Event                        | Level | Structured Context                                                                        |
|----------------------------------|-------|-------------------------------------------------------------------------------------------|
| Workspace delete request received | INFO  | `workspace_id`, `repository_id`, `user_id`, `request_id`                                |
| Workspace not found for deletion  | DEBUG | `workspace_id`, `repository_id`, `user_id` (idempotent no-op)                           |
| VM/container deletion initiated   | INFO  | `workspace_id`, `freestyle_vm_id`, `request_id`                                          |
| VM/container deletion succeeded   | INFO  | `workspace_id`, `freestyle_vm_id`, `duration_ms`                                         |
| VM/container deletion failed      | WARN  | `workspace_id`, `freestyle_vm_id`, `error_message` (best-effort, non-fatal)              |
| Workspace status updated to stopped | INFO | `workspace_id`, `previous_status`                                                        |
| SSE notification sent             | DEBUG | `workspace_id`, `channel`                                                                |
| SSE notification failed           | WARN  | `workspace_id`, `channel`, `error_message`                                               |
| Delete request authorization failed | WARN | `workspace_id`, `repository_id`, `user_id`, `reason`                                    |
| Delete request invalid input      | WARN  | `raw_workspace_id`, `validation_error`, `request_id`                                     |

### Prometheus Metrics

| Metric Name                                  | Type      | Labels                                  | Description                                           |
|----------------------------------------------|-----------|-----------------------------------------|-------------------------------------------------------|
| `codeplane_workspace_deletes_total`          | Counter   | `status` (success/error/noop)           | Total workspace delete attempts                       |
| `codeplane_workspace_delete_duration_seconds`| Histogram | `included_vm_cleanup` (true/false)      | End-to-end delete latency                             |
| `codeplane_workspace_vm_cleanup_total`       | Counter   | `result` (success/error/skipped)        | VM/container cleanup outcomes                         |
| `codeplane_workspace_vm_cleanup_duration_seconds` | Histogram |                                    | Time spent deleting the VM/container                  |
| `codeplane_workspace_active_count`           | Gauge     | `repository_id`, `status`               | Current count of workspaces by status                 |
| `codeplane_workspace_delete_sse_notifications_total` | Counter | `result` (sent/failed)            | SSE notification delivery outcomes for deletions      |

### Alerts

#### Alert: High Workspace Delete Error Rate

- **Condition:** `rate(codeplane_workspace_deletes_total{status="error"}[5m]) / rate(codeplane_workspace_deletes_total[5m]) > 0.05`
- **Severity:** Warning
- **Summary:** More than 5% of workspace delete requests are failing.

**Runbook:**
1. Check server logs filtered by `workspace_delete` and `level=ERROR` for the affected time window.
2. Determine if errors are auth-related (403s from permission changes), input-related (400s from client bugs), or infrastructure-related (500s).
3. If 500s: check database connectivity (`SELECT 1` health check), check workspace service initialization.
4. If the error is isolated to a specific repository, check for repository-level data integrity issues.
5. If errors correlate with deployment, consider rollback.

#### Alert: VM Cleanup Failure Spike

- **Condition:** `rate(codeplane_workspace_vm_cleanup_total{result="error"}[10m]) > 5`
- **Severity:** Warning
- **Summary:** Multiple VM/container cleanup failures during workspace deletion.

**Runbook:**
1. Check `codeplane_workspace_vm_cleanup_total{result="error"}` logs for error details.
2. Verify container runtime (Docker/Freestyle) is healthy and reachable from the server.
3. Check if the container runtime API is rate-limiting or returning transient errors.
4. Verify network connectivity between the Codeplane server and the container runtime.
5. Orphaned VMs may need manual cleanup: list all VMs in the container runtime and cross-reference with workspace records in `stopped` status that still have non-empty `freestyle_vm_id` values.
6. If the runtime is down, workspace deletions will still succeed (status updated to stopped) but VMs will be orphaned. Schedule manual cleanup when runtime recovers.

#### Alert: Workspace Delete Latency Degradation

- **Condition:** `histogram_quantile(0.95, rate(codeplane_workspace_delete_duration_seconds_bucket[5m])) > 10`
- **Severity:** Warning
- **Summary:** P95 workspace delete latency exceeds 10 seconds.

**Runbook:**
1. Check if latency is dominated by VM cleanup (`codeplane_workspace_vm_cleanup_duration_seconds`).
2. If VM cleanup is slow: check container runtime load and resource utilization.
3. If database updates are slow: check database connection pool saturation and query latency.
4. Check for lock contention on the workspaces table (concurrent deletes/updates to the same workspace).
5. If latency is transient, monitor. If sustained, consider increasing container runtime timeouts or adding a circuit breaker.

#### Alert: Orphaned VM Accumulation

- **Condition:** Custom periodic job comparing active VMs in the container runtime vs workspace records with `stopped` status. Alert if orphan count exceeds 10.
- **Severity:** Warning
- **Summary:** Orphaned VMs detected that were not cleaned up during workspace deletion.

**Runbook:**
1. Query workspaces with status `stopped` and non-empty `freestyle_vm_id`.
2. Cross-reference with VMs listed in the container runtime.
3. For each orphaned VM, attempt `sandbox.deleteVM(vmId)`.
4. If cleanup succeeds, clear the `freestyle_vm_id` field on the workspace record.
5. Investigate why the original deletion failed to clean up the VM (check logs from the deletion time).
6. If this recurs, consider adding a background reconciliation job.

### Error Cases and Failure Modes

| Failure Mode                        | Impact                                              | Mitigation                                                  |
|-------------------------------------|-----------------------------------------------------|-------------------------------------------------------------|
| Database unavailable                | Delete fails with 500                               | Standard DB health checks; retry from client                |
| Container runtime unreachable       | VM not cleaned up; workspace still marked stopped   | Best-effort pattern; orphan cleanup job                     |
| Container already deleted externally| No impact; sandbox.deleteVM error is swallowed      | Idempotent design                                           |
| SSE notification fails              | Connected clients don't receive status update        | Non-critical; clients can poll or refresh                   |
| Concurrent deletes on same workspace| Both succeed (idempotent); only one does real work  | DB query returns null for second caller                     |
| Network timeout during VM deletion  | VM may or may not be deleted; status updated anyway | Background reconciliation to catch orphans                  |
| Workspace in `pending` state        | Container may not exist yet; deletion still works   | deleteVM handles missing containers gracefully              |

## Verification

### API Integration Tests

- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with valid workspace returns 204
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with valid workspace updates status to `stopped` in database
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` for a `running` workspace calls sandbox.deleteVM() with correct VM ID
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` for a `suspended` workspace calls sandbox.deleteVM() with correct VM ID
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` for a `pending` workspace succeeds and updates status to `stopped`
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` for a `failed` workspace succeeds and updates status to `stopped`
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` for a workspace already in `stopped` status returns 204 (idempotent)
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with non-existent workspace ID returns 204 (idempotent)
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with empty workspace ID returns 400 with `"workspace id is required"`
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with whitespace-only workspace ID returns 400
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with malformed UUID returns 204 (no-op, not found in DB)
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with workspace belonging to different user returns 204 (no-op, scoped query finds nothing)
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with workspace belonging to different repository returns 204 (no-op)
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` without authentication returns 401
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` emits SSE event on `workspace_status_{id}` channel with `stopped` status
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` does not delete associated snapshots — verify snapshots are still accessible via GET after workspace deletion
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` succeeds when container runtime is unavailable (sandbox client is null)
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` succeeds when sandbox.deleteVM() throws an error (best-effort cleanup)
- [ ] Two concurrent `DELETE` requests for the same workspace both return 204 without error
- [ ] After deletion, `GET /api/repos/:owner/:repo/workspaces/:id` returns 404
- [ ] After deletion, workspace does not appear in `GET /api/repos/:owner/:repo/workspaces` list response
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with a maximum-length valid UUID (36 characters) succeeds
- [ ] `DELETE /api/repos/:owner/:repo/workspaces/:id` with a UUID longer than 36 characters is handled gracefully (no match in DB, returns 204)

### CLI Integration Tests

- [ ] `codeplane workspace delete <valid-id>` returns exit code 0 and outputs `{ "status": "deleted", "id": "<id>" }` in JSON mode
- [ ] `codeplane workspace delete <valid-id> --repo owner/repo` uses the specified repo context
- [ ] `codeplane workspace delete <valid-id>` without repo context (not in a repo directory) prints error message and exits with code 1
- [ ] `codeplane workspace delete <nonexistent-id>` returns exit code 0 (API returns 204)
- [ ] `codeplane workspace delete` without an ID argument prints usage help and exits with code 1
- [ ] `codeplane workspace delete <valid-id>` when unauthenticated prints authentication error and exits with code 1
- [ ] `codeplane workspace delete <id> --json` outputs valid JSON with `status` and `id` fields
- [ ] `codeplane workspace delete <id>` default text output includes confirmation message

### TUI Integration Tests

- [ ] Pressing `d` on a focused workspace in the list view opens the delete confirmation overlay
- [ ] The confirmation overlay displays the workspace name
- [ ] The confirmation overlay displays "This action cannot be undone."
- [ ] Pressing `y` in the confirmation overlay triggers the delete API call
- [ ] Pressing `n` in the confirmation overlay dismisses it without making an API call
- [ ] Pressing `Esc` in the confirmation overlay dismisses it without making an API call
- [ ] After confirming deletion, the workspace row is removed from the list
- [ ] If the delete API call fails, the workspace row reappears in the list
- [ ] If the delete API call fails, the status bar shows an error flash message
- [ ] Deleting the last workspace in the list shows the empty state view
- [ ] Pressing `D` on the workspace detail view opens the delete confirmation overlay
- [ ] After confirming deletion from detail view, the TUI navigates back to the workspace list
- [ ] The `D` action is not available when viewing a workspace already in `stopped` state

### Web UI E2E Tests (Playwright)

- [ ] Workspace list page: clicking "Delete" in workspace actions dropdown opens confirmation modal
- [ ] Confirmation modal displays workspace name and warning text
- [ ] Clicking "Delete Workspace" button in modal triggers API call and removes workspace from list
- [ ] Clicking "Cancel" button in modal dismisses it without API call
- [ ] Pressing `Escape` key dismisses the confirmation modal
- [ ] After deletion, a success toast notification appears with "Workspace deleted"
- [ ] Workspace detail page: clicking "Delete" in header actions opens confirmation modal
- [ ] After deletion from detail page, user is redirected to workspace list page
- [ ] Delete button shows loading spinner while API call is in flight
- [ ] Delete button is disabled while API call is in flight (no double-click)
- [ ] If API call fails, workspace reappears and error toast is shown
- [ ] The "Delete" action is not visible to users without delete permission

### SSE Stream Tests

- [ ] A client connected to `GET /api/repos/:owner/:repo/workspaces/:id/stream` receives a `workspace.status` event with `{"status": "stopped"}` when the workspace is deleted
- [ ] The SSE event is received within 2 seconds of the delete API call completing
- [ ] Multiple SSE clients connected to the same workspace stream all receive the stopped event

### Cross-Surface Consistency Tests

- [ ] Delete workspace via CLI → verify workspace is gone via API GET
- [ ] Delete workspace via API → verify workspace is absent from TUI workspace list on refresh
- [ ] Delete workspace via Web UI → verify CLI `workspace list` no longer includes it
- [ ] Create snapshot → delete workspace → verify snapshot is still accessible via API
- [ ] Create workspace → create session → delete workspace → verify session is no longer usable

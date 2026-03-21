# WORKSPACE_SNAPSHOT_DELETE

Specification for WORKSPACE_SNAPSHOT_DELETE.

## High-Level User POV

When a developer has been working with workspace snapshots in Codeplane — saving checkpoints of development environments, creating baselines for agent workflows, or capturing stable configurations — they inevitably accumulate snapshots that are no longer needed. Old snapshots clutter the snapshot list, make it harder to find the right one when creating a new workspace, and consume storage resources on the server. Deleting a snapshot should be as low-friction as creating one.

From the workspace detail view in the web UI, the snapshots section of the TUI, or a single CLI command, the user selects a snapshot they no longer need and deletes it. The system asks for a brief confirmation — because snapshot deletion is permanent and the captured environment state cannot be recovered — and then removes the snapshot immediately. The snapshot disappears from all listings and can no longer be used as a starting point for new workspaces.

Snapshot deletion is scoped to ownership: a user can only delete snapshots they created. This prevents accidental deletion of a teammate's saved environments. The operation is intentionally simple and irreversible. There is no soft-delete, no trash, and no undo. Once deleted, the snapshot's container image reference is released and the record is permanently removed.

Importantly, deleting a snapshot does not affect any workspaces that were previously created from it. A workspace that was restored from a snapshot continues to run independently — the snapshot was used as a template at creation time, and the resulting workspace has its own independent lifecycle. Similarly, deleting the source workspace does not prevent the user from deleting orphaned snapshots that were taken from it.

The deletion flow is designed for routine housekeeping. Users should feel confident deleting old snapshots without worrying about breaking running workspaces or losing access to active environments. The product communicates this clearly in confirmation dialogs and documentation.

## Acceptance Criteria

### Definition of Done

- A user can delete a workspace snapshot they own via the API, CLI, web UI, and TUI.
- The snapshot is permanently removed from the database and no longer appears in snapshot listings.
- The deleted snapshot can no longer be used as the `snapshot_id` parameter when creating new workspaces.
- Workspaces that were previously created from the deleted snapshot are not affected.
- All clients (API, CLI, web UI, TUI) handle success, authorization errors, not-found states, and server errors with clear messaging.
- Deletion is scoped to the authenticated user and target repository — a user cannot delete another user's snapshots.
- The feature is covered by integration and end-to-end tests across API, CLI, and web surfaces.

### Functional Constraints

- **Ownership enforcement**: A snapshot can only be deleted by the user who created it (matching `user_id`) within the repository context (matching `repository_id`). Attempting to delete another user's snapshot silently returns success (HTTP 204) to avoid leaking existence information — this matches the existing codebase pattern.
- **Permanent deletion**: Deletion is irreversible. There is no soft-delete, recycle bin, or undo mechanism.
- **Orphaned snapshot support**: A snapshot whose source workspace has been deleted is still deletable. The `workspace_id` foreign key on the snapshot is nullable and does not constrain deletion.
- **No cascade to workspaces**: Deleting a snapshot does not affect, suspend, or delete any workspaces that were created using that snapshot as a template.
- **Idempotency**: Deleting an already-deleted snapshot returns HTTP 204 (not 404). The service layer performs a lookup-then-delete; if the lookup returns nothing (either because the snapshot doesn't exist or doesn't belong to the user), it returns silently.
- **Single endpoint**: Snapshots are deleted via `DELETE /api/repos/:owner/:repo/workspace-snapshots/:id`. There is no workspace-scoped delete endpoint.
- **Response**: On success, the server returns HTTP 204 with an empty body.

### Boundary Constraints

- **Snapshot ID format**: Must be a valid UUID (pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`). Non-UUID values return HTTP 400 with `"workspace snapshot id is required"`.
- **Snapshot ID required**: An empty or missing snapshot ID in the path returns HTTP 400 with `"workspace snapshot id is required"`.
- **Repository path parameters**: `owner` and `repo` must be non-empty path segments.
- **Request body**: The DELETE request must not require a body. Any body sent is ignored.
- **Content-Type**: No Content-Type header is required for DELETE requests (no body expected).

### Edge Cases

- **Snapshot not found**: Returns HTTP 204 (not 404). The service layer silently returns when the snapshot is not found, making the operation idempotent.
- **Snapshot belongs to different user**: Returns HTTP 204. The ownership check is implicit in the database query (filters by `user_id`), so a non-owned snapshot appears as "not found" and the service returns silently.
- **Snapshot belongs to different repository**: Returns HTTP 204. Same implicit ownership behavior via `repository_id` filtering.
- **Concurrent deletion of same snapshot**: Two simultaneous DELETE requests for the same snapshot. The first succeeds and deletes the record. The second finds nothing and returns 204. Both clients receive 204.
- **Delete snapshot then attempt to create workspace from it**: The workspace creation attempt returns an error (snapshot not found or invalid snapshot ID), not a corrupted workspace.
- **Delete snapshot while workspace creation from that snapshot is in progress**: The workspace creation was already handed the snapshot reference at creation time. The in-progress workspace creation is not affected.
- **Delete all snapshots for a workspace**: Valid. The workspace continues to function. The snapshots section shows an empty state.
- **Unauthenticated request**: Returns HTTP 401 with `"authentication required"`.
- **Rapid successive deletions of different snapshots**: Each deletion is independent. No debounce. Rate limiting prevents abuse.
- **Snapshot ID is a valid UUID but not a real snapshot**: Returns HTTP 204 (idempotent behavior).
- **Delete the only snapshot in a repository**: Valid. Snapshot list becomes empty. No special behavior.

## Design

### API Shape

**Endpoint**: `DELETE /api/repos/:owner/:repo/workspace-snapshots/:id`

**Authentication**: Required (session cookie or PAT).

**Path Parameters**:

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `owner` | string | Required, non-empty | Repository owner username or org |
| `repo` | string | Required, non-empty | Repository name |
| `id` | string (UUID) | Required, valid UUID | Snapshot ID to delete |

**Request Body**: None. Any body is ignored.

**Success Response**: HTTP 204 (No Content), empty body.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Snapshot ID missing or empty | `{ "message": "workspace snapshot id is required" }` |
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 429 | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

Note: There is no 404 response. Non-existent or non-owned snapshots return 204 for idempotency and to avoid leaking snapshot existence to unauthorized users.

### SDK Shape

**Service method**: `WorkspaceService.deleteWorkspaceSnapshot(snapshotID: string, repositoryID: number, userID: number): Promise<void>`

**Behavior**:
1. Calls `dbGetWorkspaceSnapshotForUserRepo(sql, { id, repositoryId, userId })` to verify ownership.
2. If the snapshot is not found (doesn't exist, wrong user, or wrong repo), returns immediately without error.
3. If found, calls `dbDeleteWorkspaceSnapshot(sql, { id })` to permanently remove the record.

**Database functions used**:
- `getWorkspaceSnapshotForUserRepo(sql, { id, repositoryId, userId })` — ownership-checked lookup
- `deleteWorkspaceSnapshot(sql, { id })` — permanent deletion by primary key

### UI-Core Hook

**Hook**: `useDeleteWorkspaceSnapshot(owner: string, repo: string, callbacks?: DeleteWorkspaceSnapshotCallbacks)`

**Callbacks**:
- `onOptimistic(snapshotId)` — Called immediately before the request, enabling optimistic UI removal from the snapshot list.
- `onRevert(snapshotId)` — Called on failure, enabling the UI to restore the snapshot to the list.
- `onError(error, snapshotId)` — Called with the error object on failure.
- `onSettled(snapshotId)` — Called after success or failure for cleanup.

**Returns**: `{ mutate: (snapshotId: string) => Promise<void>, isLoading: boolean, error: HookError | null }`

**Deduplication**: If `mutate` is called with the same `snapshotId` while a request is already in-flight, the hook returns the existing promise rather than issuing a duplicate request.

**Cleanup**: On unmount, all in-flight requests are aborted via `AbortController`.

### CLI Command

**Command**: `codeplane workspace snapshot-delete <snapshot-id>`

**Options**:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | (inferred from cwd) | Repository in `OWNER/REPO` format |
| `--yes` / `-y` | boolean | false | Skip confirmation prompt |

**Example usage**:

```bash
# Delete a snapshot (with confirmation prompt)
codeplane workspace snapshot-delete b1c2d3e4-f5a6-7890-abcd-ef1234567890

# Delete without confirmation
codeplane workspace snapshot-delete b1c2d3e4-f5a6-7890-abcd-ef1234567890 --yes

# Explicit repository context
codeplane workspace snapshot-delete b1c2d3e4 --repo myorg/myrepo --yes
```

**Standard output** (on success):

```
Snapshot b1c2d3e4-f5a6-7890-abcd-ef1234567890 deleted.
```

**Confirmation prompt** (when `--yes` is not provided):

```
Delete snapshot b1c2d3e4-f5a6-7890-abcd-ef1234567890? This action cannot be undone. [y/N]
```

**JSON output** (`--json`): Returns `{ "deleted": true, "id": "<snapshot-id>" }`.

**Error output**: CLI exits with code 1 and prints the error message to stderr.

### Web UI Design

The snapshot delete action is accessible from the workspace detail view's snapshots section.

**Snapshot list row**: Each snapshot row in the snapshots section includes a delete action. This is presented as a red trash icon button at the end of the row, or as a "Delete" option in a row-level action menu (kebab menu).

**Confirmation dialog**: Clicking the delete action opens a confirmation dialog:
- **Title**: "Delete snapshot"
- **Body**: "Are you sure you want to delete snapshot **{snapshot-name}**? This action cannot be undone. Workspaces created from this snapshot will not be affected."
- **Primary action**: "Delete" button (destructive styling — red)
- **Secondary action**: "Cancel" button
- **Keyboard**: `Enter` confirms, `Escape` cancels

**UI States**:
- **Idle**: Delete button is enabled on each snapshot row.
- **Confirming**: Confirmation dialog is visible. Background list is dimmed/disabled.
- **Deleting**: Dialog primary button shows loading spinner and is disabled. Cancel button is disabled.
- **Success**: Dialog closes. Toast notification shows "Snapshot deleted." Snapshot is removed from the list with a fade-out animation. If the list is now empty, the empty state ("No snapshots. Press the button above to create one.") is shown.
- **Error**: Dialog remains open. Inline error message below the confirmation text. "Delete" button re-enables. User can retry or cancel.

**Optimistic removal**: The snapshot is visually removed from the list immediately when the user confirms deletion. If the server request fails, the snapshot is restored to its previous position in the list.

### TUI UI

The TUI workspace detail screen's Snapshots tab includes snapshot deletion:

- **Keybinding**: `D` (shift-d) on a focused snapshot to initiate deletion.
- **Confirmation**: Inline prompt: `Delete snapshot "{name}"? (y/N)`.
- **Submitting**: Status line shows `"Deleting snapshot..."`.
- **Success**: Status line shows `"Snapshot '{name}' deleted"`. Snapshot removed from list. Focus moves to the next snapshot (or previous if last item, or empty state if list is now empty).
- **Error**: Status line shows error message in red. Snapshot remains in list.
- **Empty state after last deletion**: "No snapshots. Press c to create one."

### Documentation

1. **CLI Reference: `workspace snapshot-delete`** — Command syntax, all flags, confirmation behavior, example invocations including `--yes` and `--json`, and error message reference.
2. **API Reference: Delete Workspace Snapshot** — Endpoint documented with path parameters, authentication requirements, response codes, and idempotency behavior. Must clearly note that 204 is returned for both successful deletion and non-existent snapshots.
3. **"Workspace Snapshots" guide update** — Add a "Deleting Snapshots" section explaining: deletion is permanent, workspaces created from deleted snapshots are not affected, only the snapshot creator can delete it, and storage is reclaimed after deletion.
4. **TUI keyboard reference update** — Document the `D` keybinding in the workspace detail Snapshots tab.

## Permissions & Security

### Authorization

| Role | Can Delete Snapshot? | Condition |
|------|---------------------|----------|
| Snapshot Owner | Yes | Must own the snapshot (`user_id` matches) AND snapshot must belong to the specified repository (`repository_id` matches) |
| Repository Owner | No (current implementation) | Snapshots are user-scoped; repo owner cannot delete another user's snapshots |
| Repository Admin | No (current implementation) | Same as repo owner — no admin override for snapshot deletion |
| Repository Member (write) | No | Cannot delete snapshots they don't own |
| Repository Member (read-only) | No | No write access |
| Anonymous | No | Authentication required (HTTP 401) |

The access model is strictly user-scoped. The authenticated user's `user_id` must match the snapshot's `user_id` AND the snapshot's `repository_id` must match the resolved repository context. This is enforced at the service layer via `dbGetWorkspaceSnapshotForUserRepo`. Non-owned or non-existent snapshots result in a silent 204 to prevent information leakage.

### Rate Limiting

- **Per-user snapshot delete rate limit**: Maximum 10 snapshot deletion requests per minute per authenticated user (consistent with WORKSPACE_VIEW spec's snapshot create/delete rate).
- **Global rate limit**: Standard 120 requests per minute per user across all endpoints.
- **Rationale**: Deletion is a destructive operation. Limiting to 10 per minute prevents accidental bulk deletion via script errors while allowing normal housekeeping workflows.

### Data Privacy

- Snapshot names are user-provided strings. Deletion permanently removes the name from the database. No audit log of deleted snapshot names is retained (in current implementation).
- The `freestyle_snapshot_id` (internal container image reference) is removed from the database record. Cleanup of the underlying container image is handled separately by the background cleanup scheduler.
- No PII is exposed by the deletion response (HTTP 204, empty body).
- The idempotent 204 response for non-existent snapshots prevents attackers from enumerating valid snapshot IDs.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceSnapshotDeleted` | Successful snapshot deletion (record found and deleted) | `snapshot_id`, `workspace_id` (of the source workspace, may be null if orphaned), `repository_id`, `user_id`, `snapshot_name`, `snapshot_age_seconds` (time since snapshot creation), `client` (`api`, `cli`, `web`, `tui`) |
| `WorkspaceSnapshotDeleteAttempted` | Delete request received (including for non-existent snapshots) | `snapshot_id`, `repository_id`, `user_id`, `snapshot_found` (boolean), `client` |
| `WorkspaceSnapshotDeleteFailed` | Delete request failed with server error | `snapshot_id`, `repository_id`, `user_id`, `error_type` (`db_error`, `auth_error`), `client` |

### Funnel Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Snapshot deletion success rate** | `WorkspaceSnapshotDeleted / WorkspaceSnapshotDeleteAttempted{snapshot_found=true}` | > 99% (deletion of found snapshots should almost never fail) |
| **Snapshot lifecycle completion** | Percentage of created snapshots that are eventually deleted (indicates active lifecycle management) | 40–70% indicates healthy hygiene; < 20% indicates snapshots are accumulating without cleanup |
| **Time to deletion** | Distribution of `snapshot_age_seconds` at deletion time | Informational — helps understand snapshot retention patterns |
| **Deletion-then-create ratio** | Users who delete a snapshot and create a new one within the same session | High ratio indicates snapshot rotation patterns |
| **Orphaned snapshot deletion rate** | Percentage of deletions where `workspace_id` is null (source workspace was already deleted) | Informational — high rate may indicate workspace deletion should prompt snapshot cleanup |
| **Client distribution** | Breakdown of `client` across deletion events | Informational — understanding which surfaces users prefer for cleanup tasks |

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `workspace_snapshot.delete.start` | `info` | `request_id`, `snapshot_id`, `repository_id`, `user_id` | Delete request received |
| `workspace_snapshot.delete.success` | `info` | `request_id`, `snapshot_id`, `repository_id`, `user_id`, `duration_ms` | Snapshot found and deleted |
| `workspace_snapshot.delete.not_found` | `debug` | `request_id`, `snapshot_id`, `repository_id`, `user_id` | Snapshot not found (either doesn't exist or not owned); still returns 204 |
| `workspace_snapshot.delete.db_error` | `error` | `request_id`, `snapshot_id`, `repository_id`, `user_id`, `error`, `duration_ms` | Database error during lookup or deletion |
| `workspace_snapshot.delete.validation_error` | `warn` | `request_id`, `field`, `value`, `rule`, `user_id` | Input validation failed (e.g., invalid UUID format) |
| `workspace_snapshot.delete.auth_missing` | `warn` | `request_id` | Request received without authentication |
| `workspace_snapshot.delete.rate_limited` | `warn` | `request_id`, `user_id`, `rate_limit_remaining` | Request rejected due to rate limiting |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_snapshot_delete_total` | Counter | `status` (`success`, `not_found`, `error`), `error_type` (`none`, `db_error`, `validation_error`, `auth_error`) | Total snapshot deletion attempts |
| `codeplane_workspace_snapshot_delete_duration_seconds` | Histogram | `status` | End-to-end deletion request duration |
| `codeplane_workspace_snapshots_total` | Gauge | — | Total number of snapshots in the system (decremented on delete, shared with create) |
| `codeplane_workspace_snapshot_age_at_deletion_seconds` | Histogram | — | Age of snapshots at the time they are deleted (only recorded for successful deletions of found snapshots) |

### Alerts

#### Alert: High Snapshot Deletion Failure Rate

- **Condition**: `rate(codeplane_workspace_snapshot_delete_total{status="error"}[5m]) / rate(codeplane_workspace_snapshot_delete_total[5m]) > 0.10` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workspace_snapshot_delete_total` by `error_type` to identify the dominant failure mode.
  2. If `db_error`: check database connectivity. Run `SELECT count(*) FROM workspace_snapshots` to verify the table is accessible. Check PostgreSQL logs for lock contention, connection pool exhaustion, or disk space issues.
  3. Check whether the failures correlate with a specific repository or user (examine structured logs for `repository_id` and `user_id` patterns).
  4. Check recent deployments for schema changes that might affect the `workspace_snapshots` table.
  5. If failures are isolated to a single user or repo, investigate whether there's a data corruption issue with specific snapshot records.
  6. Escalate if failure rate persists after database health checks pass.

#### Alert: Unusual Spike in Snapshot Deletions

- **Condition**: `rate(codeplane_workspace_snapshot_delete_total{status="success"}[5m]) > 50` for 5 minutes (more than 50 successful deletions per 5 minutes across all users)
- **Severity**: Info
- **Runbook**:
  1. Check whether a legitimate bulk cleanup operation is underway (e.g., a user scripting cleanup of old snapshots).
  2. Review structured logs to identify which user(s) are driving the spike.
  3. Verify rate limiting is functioning correctly — a single user should not exceed 10 deletions per minute.
  4. If the spike is from many users simultaneously, check whether an internal process or automation is triggering bulk deletions.
  5. No immediate action required unless the deletion rate is causing database performance issues (check `codeplane_workspace_snapshot_delete_duration_seconds` p95).

#### Alert: Snapshot Deletion Latency Spike

- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_snapshot_delete_duration_seconds_bucket[5m])) > 5` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency. Deletion involves two queries: a SELECT (ownership check) and a DELETE. Either could be slow.
  2. Run `SELECT * FROM pg_stat_activity WHERE query LIKE '%workspace_snapshots%'` to check for slow or blocked queries.
  3. Check for table bloat: `SELECT pg_size_pretty(pg_total_relation_size('workspace_snapshots'))`. If the table is large, consider running `VACUUM ANALYZE workspace_snapshots`.
  4. Check for lock contention — concurrent snapshot operations on the same rows can cause delays.
  5. Check disk I/O metrics on the database host.
  6. Escalate if latency doesn't recover after 10 minutes.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|--------------|-----------|--------|------------|
| Database connection failure during ownership lookup | `dbGetWorkspaceSnapshotForUserRepo` throws | Delete request fails with 500 | Standard DB failover/retry. Check connection pool. |
| Database connection failure during DELETE | `dbDeleteWorkspaceSnapshot` throws | Snapshot ownership verified but record not deleted | The record remains. User can retry. No data corruption. |
| Race condition: snapshot deleted between lookup and DELETE | DELETE affects 0 rows | No impact — DELETE by primary key is a no-op if row is gone | Acceptable. No error returned. |
| Race condition: workspace creation references snapshot during deletion | Workspace creation started before snapshot was deleted | Workspace creation may fail if it checks snapshot existence, or may succeed if the snapshot reference was already captured | Acceptable. Workspace creation should validate snapshot at the start and proceed independently. |
| Rate limiter state loss (in-memory store reset) | Server restart clears rate limit counters | Brief window where rate limits are not enforced | Acceptable for Community Edition. Limits re-establish within one window period. |

## Verification

### API Integration Tests

1. **Happy path: Delete an existing snapshot** — Create a snapshot, then `DELETE /api/repos/:owner/:repo/workspace-snapshots/:id`. Assert HTTP 204, empty body.

2. **Idempotent: Delete the same snapshot twice** — Create a snapshot, delete it (assert 204), delete it again with the same ID (assert 204). No error on second request.

3. **Delete non-existent snapshot ID (valid UUID format)** — `DELETE /api/repos/:owner/:repo/workspace-snapshots/00000000-0000-0000-0000-000000000000`. Assert HTTP 204 (not 404).

4. **Delete snapshot belonging to different user** — User A creates a snapshot. User B attempts to delete it. Assert HTTP 204 (silent denial, not 403).

5. **Delete snapshot in different repository context** — Create a snapshot in repo A. Attempt deletion via repo B's URL. Assert HTTP 204 (silent denial).

6. **Validation: Missing snapshot ID in path** — `DELETE /api/repos/:owner/:repo/workspace-snapshots/`. Assert HTTP 400 or 404 (route not matched).

7. **Validation: Snapshot ID is not a valid UUID** — `DELETE /api/repos/:owner/:repo/workspace-snapshots/not-a-uuid`. Assert HTTP 400 with `"workspace snapshot id is required"`.

8. **Validation: Snapshot ID is empty string** — `DELETE /api/repos/:owner/:repo/workspace-snapshots/%20`. Assert HTTP 400.

9. **Authentication: Unauthenticated request** — `DELETE` without auth headers/cookies. Assert HTTP 401 with `"authentication required"`.

10. **Snapshot removed from list after deletion** — Create 3 snapshots, delete one, `GET /api/repos/:owner/:repo/workspace-snapshots`. Assert only 2 snapshots in the list. Assert deleted snapshot's ID is not present.

11. **Snapshot not retrievable by ID after deletion** — Create a snapshot, delete it, `GET /api/repos/:owner/:repo/workspace-snapshots/:id`. Assert HTTP 404 with `"workspace snapshot not found"`.

12. **Deleted snapshot cannot be used for workspace creation** — Create a snapshot, delete it, attempt `POST /api/repos/:owner/:repo/workspaces` with `{"snapshot_id": "<deleted-snapshot-id>"}`. Assert workspace creation fails (snapshot not found).

13. **Delete orphaned snapshot (source workspace already deleted)** — Create a workspace, create a snapshot, delete the workspace, then delete the snapshot. Assert HTTP 204.

14. **Delete does not affect workspace created from that snapshot** — Create snapshot, create workspace from snapshot, delete snapshot. Assert workspace is still accessible via `GET /api/repos/:owner/:repo/workspaces/:id` with unchanged status.

15. **Concurrent deletion of the same snapshot** — Send 2 simultaneous DELETE requests for the same snapshot ID. Assert both return HTTP 204. Assert snapshot is gone from listings.

16. **Delete all snapshots in a repository** — Create 5 snapshots, delete all 5. Assert `GET /api/repos/:owner/:repo/workspace-snapshots` returns empty array with `X-Total-Count: 0`.

17. **Request body is ignored** — Send DELETE with a JSON body `{"extra": "data"}`. Assert HTTP 204 (body is ignored, not rejected).

18. **Response has no body** — Assert the response body is empty (content-length 0 or no body).

19. **Rate limiting: Exceed per-user rate limit** — Send 11+ DELETE requests in rapid succession (within 1 minute). Assert that requests beyond the limit return HTTP 429 with `Retry-After` header.

20. **X-Total-Count decremented after deletion** — Create 3 snapshots, note `X-Total-Count: 3` from list. Delete one. List again. Assert `X-Total-Count: 2`.

### CLI Integration Tests

21. **CLI: Delete snapshot with confirmation** — `echo "y" | codeplane workspace snapshot-delete <id> --repo owner/repo`. Assert exit code 0, output includes confirmation of deletion.

22. **CLI: Delete snapshot with --yes flag** — `codeplane workspace snapshot-delete <id> --repo owner/repo --yes`. Assert exit code 0, output includes `"Snapshot <id> deleted."`.

23. **CLI: Delete snapshot JSON output** — `codeplane workspace snapshot-delete <id> --yes --json`. Assert valid JSON output with `{ "deleted": true, "id": "<id>" }`.

24. **CLI: Abort deletion at confirmation prompt** — `echo "n" | codeplane workspace snapshot-delete <id> --repo owner/repo`. Assert exit code 0 (user cancelled), no deletion performed. Verify snapshot still exists via API.

25. **CLI: Delete non-existent snapshot** — `codeplane workspace snapshot-delete 00000000-0000-0000-0000-000000000000 --repo owner/repo --yes`. Assert exit code 0 (idempotent, no error).

26. **CLI: Delete snapshot without authentication** — `codeplane workspace snapshot-delete <id> --yes` (with no auth configured). Assert exit code 1, stderr contains authentication error.

27. **CLI: Snapshot no longer listed after deletion** — Create a snapshot via CLI, delete it, then `codeplane workspace snapshot-list --repo owner/repo` (or equivalent). Assert deleted snapshot is absent from output.

### Playwright E2E Tests (Web UI)

28. **Web: Delete snapshot from workspace detail** — Navigate to workspace detail view. Locate a snapshot in the snapshots section. Click the delete action. Assert confirmation dialog appears with correct snapshot name. Click "Delete". Assert toast notification confirms deletion. Assert snapshot is removed from the list.

29. **Web: Cancel snapshot deletion** — Click delete action on a snapshot. Assert confirmation dialog appears. Click "Cancel" (or press Escape). Assert dialog closes. Assert snapshot is still in the list.

30. **Web: Delete last snapshot shows empty state** — With only one snapshot in the list, delete it. Assert empty state message ("No snapshots.") is displayed.

31. **Web: Optimistic removal and error revert** — Simulate a network error. Click delete and confirm. Assert snapshot is optimistically removed. Assert snapshot reappears when the error response is received. Assert error message is displayed.

32. **Web: Loading state during deletion** — Click delete and confirm. Assert the "Delete" button in the dialog shows a loading spinner and is disabled during the request.

33. **Web: Delete one of multiple snapshots** — With 3 snapshots in the list, delete the middle one. Assert only 2 snapshots remain. Assert the other 2 snapshots are unchanged and in correct order.

34. **Web: Keyboard confirmation** — Open delete confirmation dialog. Press Enter. Assert deletion proceeds.

35. **Web: Keyboard cancellation** — Open delete confirmation dialog. Press Escape. Assert dialog closes without deleting.

### TUI E2E Tests

36. **TUI: Delete snapshot with D key** — Navigate to workspace detail, Snapshots tab. Focus a snapshot. Press `D`. Assert confirmation prompt appears. Type `y`. Assert status line shows deletion success. Assert snapshot is removed from list.

37. **TUI: Cancel deletion in TUI** — Focus a snapshot. Press `D`. Type `n` at confirmation prompt. Assert snapshot remains in list.

38. **TUI: Delete last snapshot shows empty state** — Delete the only snapshot. Assert empty state text "No snapshots. Press c to create one." is displayed.

39. **TUI: Focus moves after deletion** — With 3 snapshots, focus the second one. Delete it. Assert focus moves to the next snapshot (now the second item, previously the third).

40. **TUI: Focus moves to previous when deleting last item** — With 3 snapshots, focus the third (last) one. Delete it. Assert focus moves to the second item (now the last).

### Cross-Cutting Tests

41. **End-to-end: Create snapshot via API, delete via CLI, verify via web** — Create a snapshot using the API. Delete it using the CLI. Verify it is gone by fetching the snapshot list in a web-equivalent API call.

42. **End-to-end: Create snapshot, create workspace from it, delete snapshot, verify workspace** — Full lifecycle: create snapshot, use it to create a workspace, delete the snapshot, verify the workspace is running and unaffected.

43. **Pagination after deletion** — Create 25 snapshots. List with `per_page=10` (page 1 returns 10, page 2 returns 10, page 3 returns 5). Delete 3 snapshots from page 1. Re-list. Assert `X-Total-Count: 22`. Assert page 1 returns 10 snapshots. Assert page 3 returns 2 snapshots.

44. **Delete then re-create with same name** — Create snapshot named "baseline". Delete it. Create a new snapshot named "baseline". Assert the new snapshot has a different `id` than the deleted one. Assert it appears in listings.

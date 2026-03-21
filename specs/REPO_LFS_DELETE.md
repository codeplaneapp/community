# REPO_LFS_DELETE

Specification for REPO_LFS_DELETE.

## High-Level User POV

When teams accumulate large binary files in their LFS store — outdated machine learning models, superseded media assets, abandoned build artifacts, or accidentally tracked binaries — they need a way to reclaim storage and keep their repository's LFS footprint clean. Without a dedicated deletion workflow, repository administrators are stuck with ever-growing storage bills and no self-service option for removing objects they no longer need.

Codeplane's LFS Delete feature lets any user with write access to a repository permanently remove individual LFS objects from both the blob store and the tracking database. From the web UI's LFS Objects table, a user can click a delete action on any row and confirm the removal. From the CLI, a user can issue a single command to delete an object by its OID. The API accepts a straightforward DELETE request scoped to the repository and object identifier.

The deletion is permanent and immediate. Once an LFS object is deleted, any future `git lfs pull` or `jj` fetch that references that OID will fail to retrieve the blob. This is intentional — the feature is designed for deliberate cleanup, not casual use. The UI and CLI both require explicit confirmation before proceeding, and the system communicates clearly that the action cannot be undone.

For automation-oriented workflows, the delete endpoint is composable with the list endpoint: a script can enumerate objects, filter by age or size, and programmatically remove the ones that match. This enables teams to build garbage collection pipelines, enforce storage retention policies, or clean up after CI/CD produces temporary large artifacts.

The feature completes Codeplane's LFS object lifecycle — upload, confirm, list, and delete — giving self-hosted administrators full control over their repository's large-file storage without requiring backend access or manual database manipulation.

## Acceptance Criteria

### Core Functionality

- [ ] A user with write access to a repository can delete a specific LFS object by its OID.
- [ ] Deletion removes the blob from the underlying blob store (filesystem or cloud storage).
- [ ] Deletion removes the corresponding database record from the `lfs_objects` table.
- [ ] The blob is deleted before the database record, ensuring no orphaned database rows pointing to missing blobs if the process fails between steps.
- [ ] On successful deletion, the API returns HTTP 204 No Content with an empty body.
- [ ] After deletion, the object no longer appears in LFS object list results.
- [ ] After deletion, a batch download request for the deleted OID returns `exists: false`.

### Input Validation

- [ ] The `oid` path parameter must be a valid SHA-256 hex string: exactly 64 characters consisting only of `[0-9a-f]` after trimming and lowercasing.
- [ ] Leading and trailing whitespace in the OID is trimmed before validation.
- [ ] Uppercase hex characters in the OID are lowered before validation and lookup.
- [ ] An OID of 63 characters (too short) returns HTTP 422 (validation failed).
- [ ] An OID of 65 characters (too long) returns HTTP 422 (validation failed).
- [ ] An OID containing non-hex characters (e.g., `g`, `z`, `!`, Unicode) returns HTTP 422.
- [ ] An empty or whitespace-only OID returns HTTP 400.
- [ ] The owner and repo path parameters are resolved case-insensitively (lowercased and trimmed).
- [ ] An empty or whitespace-only owner returns HTTP 400.
- [ ] An empty or whitespace-only repo name returns HTTP 400.

### Authorization

- [ ] Unauthenticated requests return HTTP 401 Unauthorized, regardless of repository visibility.
- [ ] Authenticated users with only read access return HTTP 403 Forbidden.
- [ ] Anonymous users on public repositories return HTTP 401 Unauthorized (delete always requires auth).
- [ ] Repository owners, organization owners, admin collaborators, write collaborators, admin team members, and write team members can all delete.
- [ ] Read-only collaborators and read-only team members cannot delete (HTTP 403).

### Edge Cases

- [ ] Deleting an OID that does not exist in the repository returns HTTP 404 Not Found with `"lfs object not found"` message.
- [ ] Deleting an OID where the database record exists but the blob is missing from storage: the blob delete silently succeeds (no-op) and the database record is removed. The overall operation returns 204.
- [ ] Deleting the same OID twice: the first request succeeds (204), the second returns 404.
- [ ] Deleting an OID that belongs to a different repository: returns 404 (objects are repository-scoped).
- [ ] Repository does not exist: returns HTTP 404 with `"repository not found"`.
- [ ] Owner does not exist: returns HTTP 404 with `"repository not found"`.
- [ ] Concurrent delete requests for the same OID: one succeeds (204), the other returns 404. No 500 errors.
- [ ] Deleting an LFS object does not affect LFS locks associated with the repository.
- [ ] Deleting an LFS object does not cascade to any other LFS objects in the same repository.

### Boundary Constraints

- [ ] OID: exactly 64 characters, `[0-9a-f]` only, after trim/lowercase.
- [ ] Owner names: 1–39 characters, lowercase alphanumeric plus hyphens.
- [ ] Repository names: 1–100 characters, lowercase alphanumeric plus hyphens and underscores.
- [ ] No request body is accepted or required. Any body is ignored.

### Definition of Done

- [ ] All acceptance criteria above pass in automated tests.
- [ ] The endpoint is registered and reachable at `DELETE /api/repos/:owner/:repo/lfs/objects/:oid`.
- [ ] The CLI exposes a `codeplane lfs delete` command.
- [ ] The Web UI provides a delete action in the LFS Objects table with confirmation dialog.
- [ ] The TUI supports deletion via a `d` keybinding with confirmation.
- [ ] Telemetry events fire on delete success and delete failure.
- [ ] Structured logs capture delete operations for audit.
- [ ] Prometheus metrics track delete volume, latency, and error rates.
- [ ] Documentation covers the delete operation in the LFS guide.
- [ ] The feature is gated behind the `REPO_LFS_DELETE` feature flag.

## Design

### API Shape

**Endpoint:** `DELETE /api/repos/:owner/:repo/lfs/objects/:oid`

**Authentication:** Required (session cookie or `Authorization: Bearer <PAT>`).

**Path Parameters:**

| Parameter | Type   | Description                                           |
|-----------|--------|-------------------------------------------------------|
| `owner`   | string | Repository owner username or organization name        |
| `repo`    | string | Repository name                                       |
| `oid`     | string | SHA-256 object identifier (64-char lowercase hex)     |

**Request Body:** None. Any body is ignored.

**Success Response (HTTP 204 No Content):**

No body. Empty response.

Headers:
```
Content-Length: 0
```

**Error Responses:**

| Status | Condition                                                      | Body                                            |
|--------|----------------------------------------------------------------|-------------------------------------------------|
| `400`  | Empty or whitespace-only `oid`, `owner`, or `repo`             | `{"error": "oid is required"}` or `{"error": "owner is required"}` or `{"error": "repository name is required"}` |
| `401`  | No authentication provided                                     | `{"error": "authentication required"}`          |
| `403`  | Authenticated but insufficient permissions (read-only or none) | `{"error": "permission denied"}`                |
| `404`  | Repository not found                                           | `{"error": "repository not found"}`             |
| `404`  | LFS object with given OID not found in this repository         | `{"error": "lfs object not found"}`             |
| `422`  | Invalid OID format (wrong length, non-hex characters)          | `{"error": "Validation Failed", "errors": [{"resource": "LFSObject", "field": "oid", "code": "invalid"}]}` |

### SDK Shape

The `LFSService` in `@codeplane/sdk` exposes:

```typescript
class LFSService {
  async deleteObject(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    rawOid: string
  ): Promise<void>;
}
```

**Behavior:**
1. Resolve the repository by owner and name (case-insensitive).
2. Verify the actor has write access to the repository.
3. Validate and normalize the OID (trim, lowercase, 64-char hex check).
4. Look up the LFS object in the database by repository ID and OID.
5. If not found, throw `notFound("lfs object not found")`.
6. Delete the blob from the blob store (silently succeeds if already missing).
7. Delete the database record.

### CLI Command

**Command:** `codeplane lfs delete <oid>`

**Arguments:**

| Argument | Type   | Required | Description                                 |
|----------|--------|----------|---------------------------------------------|
| `oid`    | string | Yes      | Full 64-character SHA-256 OID to delete     |

**Options:**

| Flag      | Type    | Default | Description                                   |
|-----------|---------|---------|-----------------------------------------------|
| `--repo`  | string  | auto    | Repository in `OWNER/REPO` format             |
| `--force` | boolean | `false` | Skip confirmation prompt                      |
| `--json`  | boolean | `false` | Output raw JSON response                      |

**Interactive behavior (default):**

```
Delete LFS object abc123de...f456abc1 from acme/my-repo?
This action cannot be undone. The blob will be permanently removed.

Confirm deletion? [y/N]: y
✓ LFS object deleted.
```

**Non-interactive / `--force` behavior:**

```
✓ LFS object deleted.
```

**JSON output (`--json`):**

```json
{"deleted": true, "oid": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1"}
```

**Error output examples:**

```
Error: LFS object not found (404)
Error: Permission denied — write access required (403)
Error: Invalid OID format — must be 64-character hex string (422)
```

**Aliases:** `-R` rewrites to `--repo` per existing CLI convention.

### Web UI Design

**Location:** Repository Settings → "LFS Objects" tab (integrated into the existing LFS Object List table from REPO_LFS_OBJECT_LIST).

**Delete Action in Table Row:**

1. Each row in the LFS Objects table includes a **delete action** visible only to users with write access.
2. On viewports ≥ 640px, the delete action is a red trash-icon button in the "Actions" column.
3. On viewports < 640px, the delete action is inside a kebab (⋮) menu.
4. Read-only users and anonymous viewers do not see any delete controls.

**Confirmation Dialog:**

When the delete action is triggered, a modal dialog appears:

- **Title:** "Delete LFS Object"
- **Body:** "Are you sure you want to delete the LFS object `<truncated OID>`? This will permanently remove the blob from storage. Any future pulls referencing this object will fail."
- **OID Display:** The first 12 characters of the OID followed by `…` with the full OID displayed in a monospace code block below.
- **Buttons:**
  - "Cancel" (secondary, left) — closes dialog, no action.
  - "Delete" (destructive/red, right) — initiates deletion.
- **Loading state:** After clicking "Delete", the button shows a spinner and is disabled. The cancel button is also disabled.
- **Success state:** Dialog closes. The deleted row is removed from the table with a slide-out animation. A toast notification appears: "LFS object deleted." The total count in the header badge updates.
- **Error state:** Dialog remains open. An inline error banner appears above the buttons showing the error message (e.g., "Permission denied" or "Object not found"). The "Delete" button re-enables for retry.

**Optimistic UI:** No optimistic updates — wait for the server response before updating the table. LFS deletion is a destructive, non-undoable action and should only reflect confirmed server state.

### TUI UI

**Keybinding:** `d` on a selected LFS object row.

**Confirmation prompt:**

```
Delete LFS object abc123de...f456abc1? This cannot be undone. [y/N]
```

- `y` or `Y`: Proceed with deletion. Show spinner: "Deleting…". On success: "✓ Deleted." and remove row from list.
- `n`, `N`, `Esc`, or any other key: Cancel. Show "Cancelled." and return focus to list.

**Error handling:** On failure, display inline error: "✗ Failed to delete: <error message>".

### Documentation

1. **Update `docs/guides/git-lfs.mdx`**: Add a "Deleting LFS Objects" section explaining:
   - How to delete from the web UI (navigate to LFS Objects, click delete, confirm).
   - How to delete from the CLI (`codeplane lfs delete <oid>`).
   - How to delete via the API (`curl -X DELETE ...`).
   - A warning that deletion is permanent and references to the OID will fail.
   - Guidance on when to delete (orphaned objects, storage reclamation, expired artifacts).

2. **CLI help text**: `codeplane lfs delete --help` must describe all flags, include a usage example, and warn about permanence.

3. **API reference**: Document the `DELETE /api/repos/:owner/:repo/lfs/objects/:oid` endpoint with path parameters, error codes, and example `curl` commands.

## Permissions & Security

### Authorization Matrix

| Role                    | Can Delete LFS Objects? |
|-------------------------|------------------------|
| Repository Owner        | ✅                      |
| Organization Owner      | ✅                      |
| Admin Collaborator      | ✅                      |
| Write Collaborator      | ✅                      |
| Read Collaborator       | ❌ (403)               |
| Team (admin)            | ✅                      |
| Team (write)            | ✅                      |
| Team (read)             | ❌ (403)               |
| Anonymous (public repo) | ❌ (401)               |
| Anonymous (private repo)| ❌ (401)               |

### Permission Resolution Order

1. Check if the actor is the repository's direct user-owner → full access.
2. Check if the repository is org-owned and the actor is the org owner → full access.
3. Check the actor's highest team permission for the repository.
4. Check the actor's collaborator permission for the repository.
5. Take the highest of team and collaborator permissions.
6. If the highest permission is `write` or `admin` → allowed.
7. Otherwise → `403 Forbidden`.

Note: Unlike read operations, delete always requires authentication (step 0: check `actor` is not null, else 401). Public repository visibility does not grant delete access.

### Rate Limiting

- The delete endpoint inherits the global rate-limiting middleware.
- Additional per-repository rate limiting should be applied: **30 delete requests per minute per authenticated user per repository**.
- This rate limit prevents accidental bulk deletion from scripts without throttling while still allowing reasonable programmatic cleanup workflows.

### Security Constraints

- **Authentication mandatory:** All delete requests require authentication. Unlike list or download, public repository status does not waive auth.
- **No PII in responses:** The 204 response has no body. Error responses contain only object identifiers and generic error messages.
- **Audit trail:** All delete operations must be logged with the actor ID, OID, repository, and timestamp for post-incident review.
- **No cascading deletes:** Deleting an LFS object only removes that object. It does not affect other objects, locks, issues, or repository state.
- **Blob store isolation:** The blob store delete operation is key-scoped (`repos/{repositoryID}/lfs/{oid}`). Path traversal is prevented by key normalization in the blob store.
- **Idempotent blob deletion:** The blob store's `delete()` silently succeeds if the file is already absent, preventing errors from race conditions or retry scenarios.

## Telemetry & Product Analytics

### Business Events

| Event Name                | Trigger                                             | Properties                                                                                                      |
|---------------------------|-----------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `LFSObjectDeleted`        | LFS object successfully deleted                     | `repository_id`, `owner`, `repo_name`, `oid`, `object_size` (bytes), `actor_id`, `client` (web/cli/tui/api)    |
| `LFSObjectDeleteFailed`   | Delete request rejected (auth, permission, 404, 422)| `repository_id` (if resolvable), `owner`, `repo_name`, `oid`, `actor_id` (nullable), `error_code`, `client`    |
| `LFSObjectDeleteConfirmed`| User confirmed the deletion in UI/TUI/CLI prompt    | `repository_id`, `oid`, `actor_id`, `client`, `used_force_flag` (boolean, CLI only)                            |
| `LFSObjectDeleteCancelled`| User cancelled the deletion at the confirmation step| `repository_id`, `oid`, `actor_id`, `client`                                                                  |

### Funnel Metrics

1. **Delete initiation rate**: Percentage of `LFSObjectListViewed` sessions that result in at least one `LFSObjectDeleteConfirmed` event. Indicates whether the list is successfully serving as a management/cleanup surface.
2. **Delete success rate**: `LFSObjectDeleted` / (`LFSObjectDeleted` + `LFSObjectDeleteFailed`). Should be > 95% — failures indicate permission misunderstandings or stale UI state.
3. **Delete confirmation rate**: `LFSObjectDeleteConfirmed` / (`LFSObjectDeleteConfirmed` + `LFSObjectDeleteCancelled`). Tracks how often users commit to the deletion after seeing the confirmation prompt. A low rate may indicate the confirmation copy is confusing or users are accidentally triggering the flow.
4. **Force flag usage**: Percentage of CLI deletes using `--force`. High usage suggests automation; low usage suggests interactive human workflows.
5. **Client distribution**: Breakdown of `LFSObjectDeleted` by `client`. Tracks whether deletion is primarily a web, CLI, or API-driven activity.

### Success Indicators

- Delete success rate > 98% (failures are expected for permission errors, not server errors).
- < 0.1% of delete requests result in 5xx errors.
- Average delete latency < 500ms (includes blob store I/O).
- At least 20% of repositories with > 50 LFS objects have at least one `LFSObjectDeleted` event per month, indicating the feature is being used for storage hygiene.

## Observability

### Logging Requirements

| Log Point                            | Level   | Structured Context                                                                          |
|--------------------------------------|---------|-------------------------------------------------------------------------------------------------|
| LFS delete request received          | `info`  | `owner`, `repo`, `oid`, `actor_id`, `request_id`                                          |
| LFS delete completed successfully    | `info`  | `owner`, `repo`, `oid`, `actor_id`, `duration_ms`, `request_id`                           |
| LFS delete — object not found        | `warn`  | `owner`, `repo`, `oid`, `actor_id`, `request_id`                                          |
| LFS delete — permission denied       | `warn`  | `owner`, `repo`, `oid`, `actor_id`, `permission_level`, `request_id`                      |
| LFS delete — authentication required | `warn`  | `owner`, `repo`, `oid`, `request_id`                                                      |
| LFS delete — OID validation failed   | `warn`  | `owner`, `repo`, `raw_oid`, `request_id`                                                  |
| LFS delete — repository not found    | `warn`  | `owner`, `repo`, `request_id`                                                             |
| LFS delete — blob store delete error | `error` | `owner`, `repo`, `oid`, `blob_key`, `error_message`, `error_stack`, `request_id`          |
| LFS delete — database delete error   | `error` | `owner`, `repo`, `oid`, `repository_id`, `error_message`, `error_stack`, `request_id`     |
| LFS delete — blob already missing    | `debug` | `owner`, `repo`, `oid`, `blob_key`, `request_id`                                          |

### Prometheus Metrics

| Metric                                          | Type      | Labels                                                        | Description                                                          |
|-------------------------------------------------|-----------|---------------------------------------------------------------|----------------------------------------------------------------------|
| `codeplane_lfs_delete_requests_total`            | Counter   | `status_code`                                                 | Total LFS delete requests                                            |
| `codeplane_lfs_delete_duration_seconds`          | Histogram | —                                                             | End-to-end delete latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_lfs_delete_blob_duration_seconds`     | Histogram | —                                                             | Blob store delete operation latency                                  |
| `codeplane_lfs_delete_db_duration_seconds`       | Histogram | —                                                             | Database delete operation latency                                    |
| `codeplane_lfs_delete_errors_total`              | Counter   | `error_type` (`not_found`, `forbidden`, `unauthorized`, `validation`, `internal`) | Error breakdown                  |
| `codeplane_lfs_delete_blob_missing_total`        | Counter   | —                                                             | Deletes where the blob was already absent from storage               |
| `codeplane_lfs_objects_deleted_bytes_total`       | Counter   | —                                                             | Cumulative bytes freed by deletion (from `size` column)              |

### Alerts

#### Alert: `LFSDeleteHighErrorRate`
**Condition:** `rate(codeplane_lfs_delete_errors_total{error_type="internal"}[5m]) > 0.05`
**Severity:** Critical
**Runbook:**
1. Check server logs for `lfs_delete_blob_store_error` or `lfs_delete_database_error` entries. Filter by `request_id`.
2. Verify blob store health: check filesystem mount status, disk space, I/O error rates. For local blob store, verify the `CODEPLANE_DATA_DIR/blobs/` directory is accessible and writable.
3. Verify database health: run `SELECT 1` against the primary database. Check connection pool utilization.
4. Check for file permission issues: the server process must have write/delete permissions on the blob directory tree.
5. If blob deletes succeed but DB deletes fail: check for database lock contention on `lfs_objects`. Inspect `pg_stat_activity` for blocking queries.
6. If both blob and DB are healthy: check for recent code deployments that may have changed the delete path. Consider rollback.
7. Restart the server process if state appears corrupted. Verify recovery with a test delete.

#### Alert: `LFSDeleteHighLatency`
**Condition:** `histogram_quantile(0.95, rate(codeplane_lfs_delete_duration_seconds_bucket[5m])) > 3`
**Severity:** Warning
**Runbook:**
1. Check `codeplane_lfs_delete_blob_duration_seconds` — if blob store is slow, the issue is I/O bound.
2. Check `codeplane_lfs_delete_db_duration_seconds` — if DB is slow, check for lock contention or missing indexes.
3. For blob store latency: check disk I/O metrics (`iowait`), filesystem cache utilization, and whether the storage volume is near capacity.
4. For DB latency: verify the `lfs_objects(repository_id, oid)` index exists. Run `EXPLAIN ANALYZE` on the delete query.
5. If latency is correlated with a burst of delete requests: check if a bulk cleanup script is running and consider throttling it.

#### Alert: `LFSDeleteBlobOrphanRate`
**Condition:** `rate(codeplane_lfs_delete_blob_missing_total[1h]) / rate(codeplane_lfs_delete_requests_total{status_code="204"}[1h]) > 0.2`
**Severity:** Warning
**Runbook:**
1. A high blob-missing rate on successful deletes means database records exist for blobs that have already been removed from storage.
2. Check if another process (backup restoration, filesystem cleanup, cloud bucket lifecycle policy) is removing blobs independently.
3. Check if upload confirmations are creating DB records before blobs are fully written (race in the upload flow).
4. Audit recent infrastructure changes to the blob store backing volume.
5. This is not user-impacting (deletes still succeed) but indicates data consistency drift that should be investigated.

#### Alert: `LFSDeletePermissionDenialSpike`
**Condition:** `rate(codeplane_lfs_delete_errors_total{error_type="forbidden"}[15m]) > 3`
**Severity:** Warning
**Runbook:**
1. Check logs for the actors and repositories involved.
2. Verify that the users are expected to have write access — check for recent permission changes, team membership revocations, or collaborator removals.
3. If a CI/CD system is generating the denials: check the PAT scope and verify the token has write access.
4. If correlated with a deployment: check for permission resolution logic regressions.

### Error Cases and Failure Modes

| Error Case                              | HTTP Status | Behavior                                                                                    |
|-----------------------------------------|-------------|---------------------------------------------------------------------------------------------|
| No authentication                       | `401`       | Return `{"error": "authentication required"}`. Log at `warn`.                              |
| Insufficient permissions (read-only)    | `403`       | Return `{"error": "permission denied"}`. Log at `warn`.                                    |
| Repository does not exist               | `404`       | Return `{"error": "repository not found"}`. Log at `warn`.                                 |
| LFS object does not exist               | `404`       | Return `{"error": "lfs object not found"}`. Log at `warn`.                                 |
| Invalid OID format                      | `422`       | Return validation error. Log at `warn`.                                                     |
| Empty/whitespace OID                    | `400`       | Return `{"error": "oid is required"}`. Log at `warn`.                                      |
| Empty/whitespace owner or repo          | `400`       | Return `{"error": "owner is required"}` or similar. Log at `warn`.                         |
| Blob store I/O error during delete      | `500`       | Return `{"error": "internal server error"}`. Log at `error` with stack trace.              |
| Database error during delete            | `500`       | Return `{"error": "internal server error"}`. Log at `error` with stack trace. Blob may already be deleted — orphaned DB row is possible if blob delete succeeded. |
| Blob already missing from store         | `204`       | Blob delete no-ops silently; DB record still removed. Log at `debug`.                       |
| Concurrent delete of same OID           | `204`/`404` | First request succeeds, second returns 404. No 500 errors.                                  |

## Verification

### API Integration Tests

#### Happy Path Tests

- [ ] **Delete a single LFS object**: Upload and confirm an LFS object, then `DELETE /api/repos/:owner/:repo/lfs/objects/:oid`. Assert HTTP 204, empty body.
- [ ] **Deleted object absent from list**: After deletion, `GET /api/repos/:owner/:repo/lfs/objects`. Assert the deleted OID is not in the results and `X-Total-Count` decremented by 1.
- [ ] **Deleted object absent from batch download**: After deletion, `POST /api/repos/:owner/:repo/lfs/batch` with `operation: "download"` for the deleted OID. Assert `exists: false`, no `download_url`.
- [ ] **Delete as repository owner**: Delete as the direct repo owner. Assert 204.
- [ ] **Delete as org owner**: Delete from an org-owned repo as the org owner. Assert 204.
- [ ] **Delete as admin collaborator**: Add collaborator with `admin` permission. Delete as that user. Assert 204.
- [ ] **Delete as write collaborator**: Add collaborator with `write` permission. Delete as that user. Assert 204.
- [ ] **Delete as admin team member**: Add user to team with `admin` on the repo. Delete as that user. Assert 204.
- [ ] **Delete as write team member**: Add user to team with `write` on the repo. Delete as that user. Assert 204.

#### OID Validation Tests

- [ ] **Valid 64-char lowercase hex OID**: Assert 204 (assuming object exists).
- [ ] **Uppercase hex OID**: Assert lowercased and matched correctly (204 if exists, 404 if not).
- [ ] **OID with leading/trailing whitespace**: Assert trimmed and matched correctly.
- [ ] **63-char OID (too short)**: Assert HTTP 422.
- [ ] **65-char OID (too long)**: Assert HTTP 422.
- [ ] **OID with non-hex character `g`**: Assert HTTP 422.
- [ ] **OID with special characters (`!@#$`)**: Assert HTTP 422.
- [ ] **OID with Unicode characters**: Assert HTTP 422.
- [ ] **Empty OID (path segment is empty string)**: Assert HTTP 400 or 404 (depending on route matching).
- [ ] **Whitespace-only OID**: Assert HTTP 400.
- [ ] **OID with embedded spaces**: Assert HTTP 422.

#### Authorization Tests

- [ ] **Unauthenticated request on public repo**: Assert HTTP 401.
- [ ] **Unauthenticated request on private repo**: Assert HTTP 401.
- [ ] **Read-only collaborator**: Assert HTTP 403.
- [ ] **Read-only team member**: Assert HTTP 403.
- [ ] **User with no relationship to repo (private)**: Assert HTTP 403.
- [ ] **User with no relationship to repo (public)**: Assert HTTP 403 (write required even on public repos).
- [ ] **Expired PAT**: Assert HTTP 401.
- [ ] **Revoked PAT**: Assert HTTP 401.

#### Not Found Tests

- [ ] **Non-existent repository**: `DELETE /api/repos/nonexistent-owner/nonexistent-repo/lfs/objects/:oid`. Assert HTTP 404 with `"repository not found"`.
- [ ] **Non-existent owner with real repo name**: Assert HTTP 404.
- [ ] **Non-existent OID in existing repo**: Assert HTTP 404 with `"lfs object not found"`.
- [ ] **OID from a different repository**: Upload object to repo A, try deleting from repo B. Assert HTTP 404.

#### Edge Case Tests

- [ ] **Double delete (idempotency)**: Delete the same OID twice. First returns 204, second returns 404.
- [ ] **Delete with blob already missing from storage**: Create DB record (via upload+confirm), manually remove the blob file, then call delete. Assert 204 (blob delete no-ops, DB record removed).
- [ ] **Concurrent delete requests for same OID**: Fire two DELETE requests simultaneously. Assert one returns 204 and the other returns 404. Neither returns 500.
- [ ] **Delete does not affect other objects**: Upload objects A and B. Delete A. Assert B still appears in list with unchanged metadata.
- [ ] **Delete does not affect LFS locks**: Create a lock, upload an object, delete the object. Assert the lock still exists.
- [ ] **Empty/whitespace owner**: `DELETE /api/repos/%20/repo/lfs/objects/:oid`. Assert HTTP 400.
- [ ] **Empty/whitespace repo**: `DELETE /api/repos/owner/%20/lfs/objects/:oid`. Assert HTTP 400.

#### Response Shape Tests

- [ ] **204 response has no body**: Assert `Content-Length: 0` or empty body.
- [ ] **404 response has JSON error body**: Assert `{"error": "lfs object not found"}`.
- [ ] **401 response has JSON error body**: Assert `{"error": "authentication required"}`.
- [ ] **403 response has JSON error body**: Assert `{"error": "permission denied"}`.
- [ ] **422 response has structured validation error**: Assert response contains `errors` array with `resource`, `field`, and `code`.

#### Boundary Tests

- [ ] **Maximum valid OID (64-char, all `f`)**: `ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`. Assert 404 (valid format, object does not exist) — not 422.
- [ ] **Minimum valid OID (64-char, all `0`)**: `0000000000000000000000000000000000000000000000000000000000000000`. Assert 404 (valid format) — not 422.
- [ ] **OID with exactly 64 chars including one invalid char at position 64**: Assert 422.
- [ ] **Owner at maximum length (39 chars)**: Assert processed normally (404 for non-existent repo, not 400).
- [ ] **Repo name at maximum length (100 chars)**: Assert processed normally.

### CLI E2E Tests

- [ ] **`codeplane lfs delete <oid>` — successful delete**: Upload object via API, delete via CLI. Assert exit code 0 and success message.
- [ ] **`codeplane lfs delete <oid> --json`**: Assert output is valid JSON with `deleted: true` and the `oid`.
- [ ] **`codeplane lfs delete <oid> --force`**: Assert no confirmation prompt, immediate deletion, exit code 0.
- [ ] **`codeplane lfs delete <oid>` — object not found**: Assert non-zero exit code and descriptive error message.
- [ ] **`codeplane lfs delete <oid>` — permission denied**: As read-only user. Assert non-zero exit code and `Permission denied` error.
- [ ] **`codeplane lfs delete <oid>` — invalid OID**: Pass a 32-char string. Assert non-zero exit code and validation error.
- [ ] **`codeplane lfs delete` — missing OID argument**: Assert usage error message.
- [ ] **`codeplane lfs delete <oid> --repo owner/repo`**: Assert explicit repo flag works.
- [ ] **`codeplane lfs delete <oid> -R owner/repo`**: Assert `-R` alias works.
- [ ] **`codeplane lfs delete <oid>` — unauthenticated**: Assert non-zero exit code and auth error.
- [ ] **`codeplane lfs delete <oid>` then `codeplane lfs list --json`**: Assert the deleted OID no longer appears in the list.

### Playwright (Web UI) E2E Tests

- [ ] **Delete button visibility — write access user**: Log in as write-access user, navigate to LFS Objects. Assert delete action is visible on each row.
- [ ] **Delete button hidden — read-only user**: Log in as read-only collaborator. Assert no delete action visible.
- [ ] **Delete confirmation dialog opens**: Click delete on a row. Assert modal appears with correct OID, warning text, and Cancel/Delete buttons.
- [ ] **Cancel dismisses dialog**: Click Cancel. Assert dialog closes, row still present, no API call made.
- [ ] **Successful deletion flow**: Click delete, confirm. Assert: loading spinner on button, dialog closes, row removed from table, toast notification "LFS object deleted.", total count badge updates.
- [ ] **Deletion error display**: Mock a 403 API response. Click delete, confirm. Assert error banner appears in dialog with "Permission denied" message, Delete button re-enables.
- [ ] **Delete object not found**: Mock a 404 response (object already deleted). Confirm deletion. Assert appropriate error message in dialog.
- [ ] **Keyboard accessibility**: Tab to delete button, press Enter. Assert confirmation dialog opens. Tab to Delete button, press Enter. Assert deletion proceeds.
- [ ] **Multiple deletions**: Delete two objects sequentially. Assert both removed from table, total count decremented by 2.
- [ ] **Delete last object on page**: If on page 2 with 1 item, delete it. Assert navigation returns to page 1.

### TUI Integration Tests

- [ ] **`d` keybinding triggers confirmation**: Select an LFS object, press `d`. Assert confirmation prompt appears.
- [ ] **`y` confirms deletion**: Press `y` at prompt. Assert "Deleting…" spinner, then "✓ Deleted.", row removed from list.
- [ ] **`n` cancels deletion**: Press `n` at prompt. Assert "Cancelled.", row still present.
- [ ] **`Esc` cancels deletion**: Press `Esc` at prompt. Assert cancellation.
- [ ] **Delete error display**: On API failure, assert "✗ Failed to delete: <message>" appears inline.
- [ ] **Delete as read-only user**: Assert `d` keybinding is either disabled or shows permission error.

### End-to-End Flow Tests

- [ ] **Full LFS lifecycle: upload → list → delete → verify gone**: Create repo → batch (upload) → PUT blob → confirm → list (assert present) → delete → list (assert absent) → batch download (assert `exists: false`).
- [ ] **Bulk cleanup workflow**: Upload 10 objects, list them, delete 5 via sequential API calls, list again. Assert exactly 5 remain with correct OIDs.
- [ ] **Cross-user permission isolation**: User A (owner) uploads object. User B (read collaborator) attempts delete. Assert 403. User A deletes successfully. Assert 204.
- [ ] **Delete after re-upload**: Upload OID X, confirm, delete, re-upload OID X, confirm. Assert the re-uploaded object exists and can be listed/downloaded.
- [ ] **Delete and storage verification**: Upload object, verify blob exists on disk, delete, verify blob is removed from disk and DB record is gone.

# WORKFLOW_ARTIFACT_DELETE

Specification for WORKFLOW_ARTIFACT_DELETE.

## High-Level User POV

Workflow runs in Codeplane produce build artifacts — compiled binaries, test reports, coverage files, bundled archives, and other outputs. Over time, these artifacts accumulate and consume storage. The Workflow Artifact Delete feature gives users explicit control over cleaning up artifacts they no longer need, rather than waiting for automatic expiration to reclaim the space.

From any surface that shows workflow artifacts — the web UI's Artifacts tab on a workflow run detail page, the CLI, or the TUI's full-screen artifacts view — a user with write access to the repository can delete an individual artifact. Deletion is permanent and immediate: the artifact record is removed from the database and the underlying file is deleted from storage. There is no soft-delete, no trash, and no undo. Because of this finality, every client surface requires the user to confirm the deletion before it executes.

The most common use case is a developer cleaning up superseded build outputs after a newer run has produced replacement artifacts, or removing large artifacts that were created by mistake during workflow development. A secondary use case is a repository admin reclaiming storage for a repository that is approaching its storage quota.

Artifacts that have been attached to a release cannot be deleted directly. The user must detach the artifact from the release first, because release assets are a separate product surface with their own lifecycle guarantees. Attempting to delete a release-attached artifact returns a clear error explaining this constraint.

Deletion is scoped to a single artifact within a single workflow run. There is no bulk-delete endpoint — users who want to clear all artifacts for a run should delete them individually or rely on the automatic expiration cleanup. This keeps the deletion surface simple and auditable.

## Acceptance Criteria

### Definition of Done
- [ ] The API endpoint `DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name` deletes a single artifact by run ID and name and returns HTTP 204 on success
- [ ] The endpoint removes the artifact record from the database using `deleteWorkflowArtifact(sql, { workflowRunId, name })`
- [ ] The endpoint deletes the artifact's backing blob from the blob store using the artifact's `gcsKey`
- [ ] The endpoint returns HTTP 404 with `{ "message": "artifact not found" }` when the artifact does not exist for the given run and name
- [ ] The endpoint returns HTTP 404 with `{ "message": "run not found" }` when the workflow run does not exist or does not belong to the specified repository
- [ ] The endpoint returns HTTP 409 with `{ "message": "artifact is attached to a release; detach it first" }` when the artifact has a non-null `releaseTag`
- [ ] The endpoint validates the run ID parameter and returns HTTP 400 for non-numeric, zero, or negative values
- [ ] The endpoint validates the artifact name parameter and returns HTTP 400 for empty names
- [ ] The endpoint requires write access to the repository and returns HTTP 403 for users with only read access
- [ ] The endpoint returns HTTP 404 for private repositories when the user has no access at all (no information leak)
- [ ] The `gcs_key` field is never exposed in the API response
- [ ] The CLI `codeplane artifact delete <runId> <name>` command deletes an artifact with a confirmation prompt
- [ ] The web UI provides a delete button on artifact rows and the artifact detail panel, with a confirmation dialog
- [ ] The TUI provides delete via the `x` keybinding with a confirmation overlay
- [ ] All clients display consistent error messages for failed deletions
- [ ] Deleting a `pending` artifact (upload not yet confirmed) is allowed — it cleans up incomplete uploads
- [ ] Deleting an `expired` artifact is allowed — it removes the stale record even if the blob was already pruned

### Artifact Name Constraints
- Artifact names are case-sensitive strings between 1 and 255 characters
- Artifact names may contain alphanumeric characters, hyphens, underscores, dots, and forward slashes
- Artifact names must not contain `..` sequences (path traversal prevention)
- Artifact names must not start or end with whitespace
- Artifact names are resolved via percent-encoding in the URL path segment
- The compound key `(workflow_run_id, name)` uniquely identifies an artifact

### Edge Cases
- Artifact already deleted (by another user or concurrent request): returns 404 `{ "message": "artifact not found" }`
- Artifact whose blob was already pruned by the cleanup scheduler (expired): database record is deleted, blob deletion is a no-op (no error)
- Artifact attached to a release: returns 409 `{ "message": "artifact is attached to a release; detach it first" }`
- Artifact name containing URL-special characters (`%`, `+`, `#`, `?`, `&`): correctly resolved via percent-encoding in the URL path
- Artifact name containing Unicode characters: correctly resolved via percent-encoding
- Artifact name with path separators (e.g., `dist/bundle.js`): resolved as a single name, not a path
- Artifact name at maximum length (255 characters): deletion succeeds
- Artifact name exceeding maximum length (256+ characters): returns 400 (name validation)
- Artifact with status `pending`: deletion succeeds — cleans up abandoned uploads
- Artifact with status `expired`: deletion succeeds — removes stale database record
- Artifact with size 0 bytes: deletion succeeds — no blob to delete but record is removed
- Run ID is valid but artifact name has no match: returns 404
- Run belongs to a different repository than the URL path: returns 404
- Blob store deletion fails (I/O error): database record is still deleted, blob orphan is logged as a warning for cleanup to handle
- Concurrent delete requests for the same artifact: first succeeds with 204, second returns 404
- Delete immediately followed by list: deleted artifact no longer appears in list response
- Repository transfer after artifact creation: artifact remains accessible and deletable under the new owner path

## Design

### API Shape

**Endpoint:** `DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner (user or organization) |
| `repo` | string | Repository name |
| `id` | integer | Workflow run ID (positive int64) |
| `name` | string | Artifact name (percent-encoded) |

**Response (204 No Content):**
Empty body. Indicates the artifact was successfully deleted.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid run ID (non-numeric, negative, zero) | `{ "message": "invalid run id" }` |
| 400 | Missing or empty artifact name | `{ "message": "artifact name is required" }` |
| 401 | No valid session or token | `{ "message": "authentication required" }` |
| 403 | User has read-only access or insufficient permissions | `{ "message": "write access required" }` |
| 404 | Repository not found or user has no access to private repo | `{ "message": "repository not found" }` |
| 404 | Workflow run not found or does not belong to this repository | `{ "message": "run not found" }` |
| 404 | Artifact not found for the given run and name | `{ "message": "artifact not found" }` |
| 409 | Artifact is attached to a release | `{ "message": "artifact is attached to a release; detach it first" }` |

### SDK Shape

The SDK exposes artifact deletion through the workflow service:

**`WorkflowService.deleteArtifact(runId, name)`**
1. Look up the artifact record by `(workflowRunId, name)` using `getWorkflowArtifactByName`
2. If the artifact does not exist, return a not-found error result
3. If the artifact has a non-null `releaseTag`, return a conflict error result indicating the artifact must be detached from the release first
4. Read the `gcsKey` from the artifact record before deletion
5. Delete the database record using `deleteWorkflowArtifact(sql, { workflowRunId, name })`
6. If a blob store is configured and the artifact's status is not `expired`, delete the backing blob using `blobStore.delete(gcsKey)` — failures are logged as warnings but do not fail the operation
7. Return a success result

The route handler must:
1. Parse and validate the run ID path parameter
2. Decode the artifact name from the URL path
3. Resolve the repository from owner/repo path parameters
4. Check write access to the repository
5. Verify the run belongs to the resolved repository
6. Call `WorkflowService.deleteArtifact(runId, name)`
7. Return 204 on success or the appropriate error status

### CLI Command

**Command:** `codeplane artifact delete <runId> <name>`

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `runId` | number | yes | Workflow run ID |
| `name` | string | yes | Artifact name |

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--repo` | string | auto-detected from cwd | Repository in `OWNER/REPO` format |
| `--yes` / `-y` | boolean | false | Skip confirmation prompt |
| `--json` | boolean | false | Output result as JSON |

**Behavior:**
1. Resolve the repository reference from `--repo` or the current working directory
2. Unless `--yes` is passed, prompt the user: `Delete artifact "<name>" from run #<runId>? This cannot be undone. [y/N]`
3. If the user confirms (or `--yes` was passed), call `DELETE /api/repos/:owner/:repo/actions/runs/:runId/artifacts/:name`
4. On 204 success, print a confirmation message
5. On error, print the error message from the response body

**Default output:**
```
✓ Deleted artifact "coverage-report" from run #123
```

**JSON output (`--json`):**
```json
{
  "deleted": true,
  "run_id": 123,
  "artifact_name": "coverage-report"
}
```

**Error output:**
```
Error: artifact is attached to a release; detach it first (HTTP 409)
Error: artifact not found (HTTP 404)
Error: write access required (HTTP 403)
```

**Non-interactive mode:** When stdin is not a TTY (e.g., piped or in CI), the command refuses to delete without `--yes` and exits with code 1: `Error: use --yes to confirm deletion in non-interactive mode`

### Web UI Design

**Artifact Row Delete Button:**
- Each artifact row in the workflow run artifacts list displays a delete icon button (🗑 trash icon) on the right side of the row, next to the download button
- The button is only visible to users with write access to the repository
- The button is always enabled regardless of artifact status (pending, ready, or expired artifacts can all be deleted)
- The button is disabled with tooltip "Attached to release — detach first" if the artifact has a non-null `release_tag`
- Clicking the button opens a confirmation dialog

**Artifact Detail Panel Delete:**
- The artifact detail panel (opened by clicking an artifact row) includes a "Delete" action button
- Same visibility and enable/disable logic as the row button
- The button is styled in the destructive/error color palette

**Confirmation Dialog:**
- Modal overlay with title "Delete artifact?"
- Body: "Are you sure you want to delete **{artifact name}**? This action cannot be undone."
- Shows artifact size in human-readable format for context
- Two buttons: "Cancel" (secondary) and "Delete" (destructive/red)
- Cancel closes the dialog with no action
- Delete sends the API request; the dialog shows a spinner during the request

**Progress and Feedback:**
- On successful deletion, the artifact row is removed from the list with a brief fade-out animation and a toast notification: "Artifact deleted: {name}"
- The artifact count and total size in the header update immediately
- On error (409, 404, 403), the dialog shows the error message inline and the artifact row remains unchanged
- If the artifact was being viewed in the detail panel, the panel closes and the artifact is removed from the list

**Read-Only View:**
- Users with only read access see no delete button — the button is omitted from the DOM, not just hidden

### TUI UI

**Delete Action:**
- Pressing `x` on a focused artifact row (in the list or in the detail overlay) opens a deletion confirmation overlay
- If the artifact has a release tag, the status bar shows `"⚠ Artifact is attached to a release. Detach first."` in yellow for 3 seconds and no overlay is opened
- If the user lacks write permission, the status bar shows `"⚠ Permission denied"` in red for 3 seconds

**Delete Confirmation Overlay:**
- Centered modal occupying 40% width × 25% height (minimum 30 characters wide)
- Border in error color (ANSI 196), background surface (ANSI 236)
- Shows artifact name (bold) and size (human-readable)
- Text: "Are you sure you want to delete this artifact? This cannot be undone."
- `Enter` confirms deletion, `Esc` cancels
- During the API call, a spinner replaces the confirmation text
- On success: overlay closes, artifact row is removed optimistically, status bar shows "✓ Artifact deleted" in green for 3 seconds, artifact count/size in header updates
- On error: overlay shows error message inline in error color

**Optimistic Removal:**
- The row is removed from the list immediately upon confirmation, before the API response arrives
- If the API returns an error, the row is restored at its original position with a status bar error message
- Focus moves to the next artifact in the list, or to the previous if the deleted artifact was last

### Documentation

The following end-user documentation should be written:

1. **Deleting Workflow Artifacts** — An overview explaining when and why to delete artifacts, the permanence of deletion, and the relationship to release-attached artifacts. Cover the fact that expired artifacts are automatically cleaned up and explicit deletion is for immediate cleanup.

2. **CLI Reference: `artifact delete`** — Full command reference with arguments, options, examples of interactive and non-interactive usage, and common error messages. Include an example of using `--yes` in CI scripts.

3. **API Reference: Delete Artifact** — Full endpoint documentation with request path, authentication requirements, response codes, error messages, and curl examples.

4. **Troubleshooting: Artifact Deletion** — Common issues: release-attached artifacts (409), permission denied (403), artifact already deleted (404), and storage not reclaimed immediately. Include resolution steps for each.

## Permissions & Security

### Authorization Roles

| Role | Can View Artifacts | Can Delete Artifacts |
|------|-------------------|---------------------|
| Repository Owner | ✅ | ✅ |
| Repository Admin | ✅ | ✅ |
| Repository Write/Member | ✅ | ✅ |
| Repository Read | ✅ | ❌ |
| Anonymous (public repo) | ✅ | ❌ |
| Anonymous (private repo) | ❌ | ❌ |

- Deletion requires write access to the repository. Read-only collaborators and anonymous users cannot delete artifacts.
- The endpoint must not leak private repository existence: if a user lacks access, return 404 (not 403) to match the pattern used by repository not found.
- For users with read-only access who attempt deletion via direct API call, return 403 `{ "message": "write access required" }` (the user's access level is already known since they can see the repo).
- The `gcs_key` (internal storage path) must never appear in any API response or error message.
- Deletion is auditable: the server logs the user ID, repository, run ID, and artifact name for every successful deletion.

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name` | 30 requests per minute per authenticated user | Sliding window |

- Rate limit responses return HTTP 429 with `Retry-After` header
- The rate limit is intentionally lower than read endpoints because deletion is a destructive, low-frequency operation
- Unauthenticated requests are rejected with 401 before rate limiting applies (anonymous users cannot delete)

### Data Privacy Constraints

- Artifact content is permanently destroyed on deletion. Once the blob is removed, the data is unrecoverable.
- The `gcs_key` used for blob deletion must never appear in API responses, error messages, or client-visible logs.
- Audit logs record who deleted which artifact (user ID, repo ID, run ID, artifact name) but must not log artifact content, blob keys, or full request bodies.
- Bearer tokens are never logged or included in error responses.
- Deletion events should be recorded in the audit trail for compliance and forensics.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowArtifactDeleteRequested` | User initiates artifact deletion (confirmation shown) | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `artifact_status`, `has_release_tag`, `client` (web/cli/tui/api), `user_id` |
| `WorkflowArtifactDeleteConfirmed` | User confirms deletion (API call sent) | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `client`, `user_id` |
| `WorkflowArtifactDeleteCompleted` | Artifact successfully deleted (204 response) | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `artifact_status`, `blob_deleted`, `duration_ms`, `client`, `user_id` |
| `WorkflowArtifactDeleteCancelled` | User cancelled confirmation dialog/prompt | `repository_id`, `workflow_run_id`, `artifact_id`, `artifact_name`, `client`, `user_id` |
| `WorkflowArtifactDeleteFailed` | Deletion returned an error response | `repository_id`, `workflow_run_id`, `artifact_name`, `error_code` (400/403/404/409), `error_reason`, `client`, `user_id` |
| `WorkflowArtifactDeleteBlocked` | Deletion rejected due to rate limiting | `repository_id`, `user_id`, `client` |

### Common Properties (All Events)

- `user_id`, `session_id`, `timestamp`, `codeplane_version`, `client_type`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Delete success rate (confirmed → completed) | > 95% | Most confirmed deletions should succeed; failures indicate server issues |
| Cancel rate (requested → cancelled) | 20–40% | Some cancellation is healthy (users reconsidering); very low cancel rate suggests confirmation is skipped or unclear |
| Blocked by release rate | < 10% of attempts | High rate suggests users don't understand the release-artifact relationship or the detach flow is hard to find |
| Error rate (non-404 errors) | < 2% | 404 errors are expected for concurrent deletes; other errors indicate bugs |
| Time to delete (confirmation → completed) | P95 < 500ms | Deletion should be fast — it's a single DB delete + blob delete |
| Adoption (% of repos with >10 artifacts that have at least one manual delete) | > 15% | Indicates users are actively managing artifact lifecycle rather than relying solely on expiration |
| Post-delete list accuracy | 100% | After deletion, artifact must not appear in subsequent list calls |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Artifact delete request received | `request_id`, `run_id`, `artifact_name`, `repo_id`, `user_id` |
| `info` | Artifact deleted successfully | `request_id`, `run_id`, `artifact_id`, `artifact_name`, `artifact_size`, `artifact_status`, `blob_deleted`, `response_time_ms`, `repo_id`, `user_id` |
| `warn` | Artifact delete attempted on non-existent artifact (404) | `request_id`, `run_id`, `artifact_name`, `repo_id`, `user_id` |
| `warn` | Artifact delete blocked by release attachment (409) | `request_id`, `run_id`, `artifact_name`, `release_tag`, `repo_id`, `user_id` |
| `warn` | Artifact delete denied — insufficient permissions (403) | `request_id`, `run_id`, `artifact_name`, `repo_id`, `user_id`, `user_role` |
| `warn` | Artifact delete rate limited (429) | `request_id`, `user_id`, `ip`, `retry_after_seconds` |
| `warn` | Blob deletion failed after database record removed | `request_id`, `run_id`, `artifact_id`, `artifact_name`, `blob_key_prefix` (first 20 chars), `error_message` |
| `error` | Database delete query failure | `request_id`, `run_id`, `artifact_name`, `repo_id`, `error_message`, `error_code` |
| `error` | Unexpected exception in delete handler | `request_id`, `run_id`, `artifact_name`, `repo_id`, `error_message`, `stack_trace` |

All logs must include `request_id` for cross-service correlation. The `gcs_key` must never be logged in full — use `blob_key_prefix` (first 20 characters) for correlation when blob errors occur.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_artifact_delete_total` | Counter | `status` (204/400/401/403/404/409/429/500), `repo_id` | Total artifact delete requests |
| `codeplane_workflow_artifact_delete_duration_seconds` | Histogram | `status` | End-to-end delete request duration. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5 |
| `codeplane_workflow_artifact_delete_blob_duration_seconds` | Histogram | `success` (true/false) | Duration of blob store deletion specifically. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 5.0 |
| `codeplane_workflow_artifact_delete_blob_errors_total` | Counter | `error_type` (not_found/io_error/timeout) | Blob deletion errors (non-fatal, logged as warnings) |
| `codeplane_workflow_artifact_delete_size_bytes` | Histogram | — | Size of deleted artifacts. Buckets: 0, 1024, 102400, 1048576, 10485760, 104857600, 1073741824 |
| `codeplane_workflow_artifact_delete_release_blocked_total` | Counter | `repo_id` | Count of deletions blocked because artifact is attached to a release |

### Alerts and Runbooks

**Alert: `WorkflowArtifactDeleteErrorRateHigh`**
- **Condition:** `rate(codeplane_workflow_artifact_delete_total{status="500"}[5m]) / rate(codeplane_workflow_artifact_delete_total[5m]) > 0.05` for 5 minutes
- **Severity:** P2
- **Runbook:**
  1. Check server logs filtered by `workflow.artifact.delete` and `level=error` for the last 15 minutes
  2. Verify database connectivity: run `SELECT 1` against the primary database
  3. Check if there are transaction deadlocks: query `pg_stat_activity` for blocked queries involving `workflow_artifacts`
  4. Check database connection pool utilization via `codeplane_db_pool_active_connections`
  5. If database is healthy, check for recent deployments that may have introduced a regression in the delete handler
  6. Escalate to workflows team if unresolved after 15 minutes

**Alert: `WorkflowArtifactDeleteBlobErrorSpike`**
- **Condition:** `increase(codeplane_workflow_artifact_delete_blob_errors_total[15m]) > 20`
- **Severity:** P3
- **Runbook:**
  1. This indicates the database records are being deleted but the backing blobs are failing to be removed, creating orphaned storage
  2. Check disk I/O metrics and filesystem mount health on the blob store data directory
  3. Check for `ENOSPC`, `ENOENT`, or `EACCES` errors in server logs for the blob store
  4. Verify the blob store data directory permissions have not changed
  5. If the blob store is remote (GCS/S3), check network connectivity and credentials
  6. Orphaned blobs will be detected by the next cleanup sweep; no data loss occurs but storage is wasted
  7. Run a manual reconciliation if orphan count exceeds 100: list blob keys in storage, compare against `workflow_artifacts.gcs_key`, delete orphans

**Alert: `WorkflowArtifactDeleteLatencyHigh`**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_artifact_delete_duration_seconds_bucket[5m])) > 2.0` for 10 minutes
- **Severity:** P3
- **Runbook:**
  1. Check `codeplane_workflow_artifact_delete_blob_duration_seconds` — is blob deletion the bottleneck?
  2. If blob deletion is slow: check disk I/O saturation, consider async blob deletion (delete DB record immediately, queue blob for background deletion)
  3. If database deletion is slow: run `EXPLAIN ANALYZE` on `DELETE FROM workflow_artifacts WHERE workflow_run_id = $1 AND name = $2` with a representative run ID and name
  4. Check for table bloat or missing indexes on `workflow_artifacts(workflow_run_id, name)`
  5. Check database CPU and connection pool metrics

**Alert: `WorkflowArtifactDeleteReleaseBlockedSpike`**
- **Condition:** `increase(codeplane_workflow_artifact_delete_release_blocked_total[1h]) > 50`
- **Severity:** P4 (informational)
- **Runbook:**
  1. A high rate of 409 responses suggests users are trying to delete release-attached artifacts frequently
  2. Check if the "detach from release" flow is discoverable in the UI — it may need better visibility
  3. Review UX for the release-artifact relationship to determine if the workflow should offer a "detach and delete" compound action
  4. No immediate engineering action required; this is a product signal

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|-----------|-------------|----------|----------|
| Invalid run ID (non-numeric, zero, negative) | 400 | Return error JSON immediately | Client-side validation |
| Missing artifact name | 400 | Return error JSON | Client-side validation |
| Authentication missing or expired | 401 | Return error JSON | Client redirects to login |
| Insufficient permissions (read-only) | 403 | Return error JSON | User requests write access |
| Repository not found or no access | 404 | Same 404 (no info leak) | User checks permissions |
| Run not found | 404 | Return error JSON | User navigates to valid run |
| Artifact not found (already deleted or never existed) | 404 | Return error JSON | No action needed — artifact is already gone |
| Artifact attached to release | 409 | Return error JSON with explanation | User detaches artifact from release first |
| Database connection failure | 500 | Log error, return generic 500 | Auto-reconnect; alert fires |
| Database delete query failure | 500 | Log error, return generic 500 | Investigate query plan, table state |
| Blob deletion I/O failure | 204 (still succeeds) | Log warning, database record is deleted | Orphan detected by cleanup sweep |
| Rate limited | 429 | Return with Retry-After header | User waits and retries |

## Verification

### API Integration Tests (`e2e/api/workflow-artifact-delete.test.ts`)

- **API-ART-DEL-001**: Delete a ready artifact — verify 204 response with empty body
- **API-ART-DEL-002**: Delete a ready artifact — verify artifact no longer appears in subsequent list request
- **API-ART-DEL-003**: Delete a ready artifact — verify the backing blob is removed from storage
- **API-ART-DEL-004**: Delete a pending artifact — verify 204 (pending artifacts are deletable)
- **API-ART-DEL-005**: Delete an expired artifact — verify 204 (expired artifacts are deletable)
- **API-ART-DEL-006**: Delete a non-existent artifact name — verify 404 with `"artifact not found"`
- **API-ART-DEL-007**: Delete from a non-existent workflow run — verify 404 with `"run not found"`
- **API-ART-DEL-008**: Delete from a non-existent repository — verify 404
- **API-ART-DEL-009**: Delete artifact with run ID belonging to a different repository — verify 404
- **API-ART-DEL-010**: Delete with invalid run ID (string "abc") — verify 400 with `"invalid run id"`
- **API-ART-DEL-011**: Delete with run ID = 0 — verify 400 with `"invalid run id"`
- **API-ART-DEL-012**: Delete with negative run ID — verify 400 with `"invalid run id"`
- **API-ART-DEL-013**: Delete with empty artifact name — verify 400 with `"artifact name is required"`
- **API-ART-DEL-014**: Delete artifact attached to a release — verify 409 with `"artifact is attached to a release; detach it first"`
- **API-ART-DEL-015**: Delete same artifact twice — first returns 204, second returns 404
- **API-ART-DEL-016**: Delete artifact with special characters in name (`build/output+v2.0 (final).tar.gz`) — verify 204 with correct percent-encoded path resolution
- **API-ART-DEL-017**: Delete artifact with Unicode name (`レポート.pdf`) — verify 204 with correct percent-encoded path resolution
- **API-ART-DEL-018**: Delete artifact with maximum-length name (255 characters) — verify 204
- **API-ART-DEL-019**: Delete artifact with name exceeding maximum length (256 characters) — verify 400
- **API-ART-DEL-020**: Delete artifact with size 0 bytes — verify 204 (no blob to delete, record removed)
- **API-ART-DEL-021**: Delete as repository owner — verify 204
- **API-ART-DEL-022**: Delete as repository admin — verify 204
- **API-ART-DEL-023**: Delete as repository write/member — verify 204
- **API-ART-DEL-024**: Delete as repository read-only collaborator — verify 403 with `"write access required"`
- **API-ART-DEL-025**: Delete as anonymous user on public repo — verify 401 or 403
- **API-ART-DEL-026**: Delete as anonymous user on private repo — verify 404 (no info leak)
- **API-ART-DEL-027**: Delete as authenticated user without repo access on private repo — verify 404 (no info leak)
- **API-ART-DEL-028**: Verify response has no body content on 204 success
- **API-ART-DEL-029**: Verify `gcs_key` never appears in any error response body
- **API-ART-DEL-030**: Rate limiting — 31st delete request within 1 minute returns 429 with `Retry-After` header
- **API-ART-DEL-031**: Delete artifact, then attempt download — verify download returns 404
- **API-ART-DEL-032**: Concurrent delete requests for the same artifact — exactly one returns 204, the other returns 404
- **API-ART-DEL-033**: Delete artifact from a workflow run in `running` status — verify 204 (run status does not block artifact deletion)
- **API-ART-DEL-034**: Delete artifact, then create a new artifact with the same name on the same run — verify 204 on delete and successful creation of the new artifact
- **API-ART-DEL-035**: Delete response time under 500ms for a 100 MB artifact

### CLI Integration Tests (`e2e/cli/artifact-delete.test.ts`)

- **CLI-ART-DEL-001**: `codeplane artifact delete <runId> <name> --repo owner/repo --yes` — verify success message
- **CLI-ART-DEL-002**: `codeplane artifact delete <runId> <name> --yes --json` — verify JSON output with `deleted: true`
- **CLI-ART-DEL-003**: Interactive confirmation — pipe "y\n" to stdin, verify deletion proceeds
- **CLI-ART-DEL-004**: Interactive cancellation — pipe "n\n" to stdin, verify deletion is aborted with exit code 0
- **CLI-ART-DEL-005**: Non-interactive mode without `--yes` — verify error message about using `--yes`
- **CLI-ART-DEL-006**: Delete non-existent artifact — verify "artifact not found" error message
- **CLI-ART-DEL-007**: Delete release-attached artifact — verify "attached to a release" error message
- **CLI-ART-DEL-008**: Delete with insufficient permissions — verify "write access required" error message
- **CLI-ART-DEL-009**: Delete with invalid run ID — verify error message
- **CLI-ART-DEL-010**: Repo auto-detection from working directory — verify deletion succeeds without `--repo`
- **CLI-ART-DEL-011**: Explicit `--repo` flag from outside a repo directory — verify correct behavior
- **CLI-ART-DEL-012**: No auth configured — verify authentication error message
- **CLI-ART-DEL-013**: `codeplane artifact list` then `codeplane artifact delete` — verify artifact no longer appears in subsequent list
- **CLI-ART-DEL-014**: Delete artifact with special characters in name — verify correct URL encoding

### Web UI Playwright Tests (`e2e/web/workflow-artifact-delete.test.ts`)

- **WEB-ART-DEL-001**: Delete button visible on artifact row for write-access user
- **WEB-ART-DEL-002**: Delete button not visible for read-only user
- **WEB-ART-DEL-003**: Delete button disabled with tooltip for release-attached artifact
- **WEB-ART-DEL-004**: Click delete button opens confirmation dialog
- **WEB-ART-DEL-005**: Confirmation dialog shows artifact name and size
- **WEB-ART-DEL-006**: Confirmation dialog has Cancel and Delete buttons
- **WEB-ART-DEL-007**: Cancel button closes dialog without deletion
- **WEB-ART-DEL-008**: Escape key closes dialog without deletion
- **WEB-ART-DEL-009**: Confirm delete — artifact row removed from list
- **WEB-ART-DEL-010**: Confirm delete — toast notification "Artifact deleted: {name}"
- **WEB-ART-DEL-011**: Confirm delete — artifact count and total size in header update
- **WEB-ART-DEL-012**: Delete from artifact detail panel — panel closes and row removed
- **WEB-ART-DEL-013**: Delete error (409) — error message shown in dialog, row remains
- **WEB-ART-DEL-014**: Delete error (404, already deleted) — error message shown in dialog
- **WEB-ART-DEL-015**: Loading spinner shown during API call in confirmation dialog
- **WEB-ART-DEL-016**: Delete last artifact — list transitions to empty state
- **WEB-ART-DEL-017**: Delete while filter is active — filtered list updates correctly
- **WEB-ART-DEL-018**: Delete pending artifact — succeeds, row removed
- **WEB-ART-DEL-019**: Delete expired artifact — succeeds, row removed
- **WEB-ART-DEL-020**: Multiple sequential deletes — each succeeds independently

### TUI Integration Tests (`e2e/tui/workflow-artifact-delete.test.ts`)

- **TUI-ART-DEL-001**: Press `x` on ready artifact — confirmation overlay appears
- **TUI-ART-DEL-002**: Confirmation overlay shows artifact name, size, and warning text
- **TUI-ART-DEL-003**: Press `Enter` in confirmation — artifact deleted, row removed, status bar success message
- **TUI-ART-DEL-004**: Press `Esc` in confirmation — overlay closes, no deletion
- **TUI-ART-DEL-005**: Press `x` on release-attached artifact — status bar shows "Attached to release" warning, no overlay
- **TUI-ART-DEL-006**: Press `x` without write permission — status bar shows "Permission denied"
- **TUI-ART-DEL-007**: Delete last artifact — list transitions to empty state
- **TUI-ART-DEL-008**: Delete error (API failure) — row restored, status bar shows error
- **TUI-ART-DEL-009**: Focus moves to next artifact after deletion
- **TUI-ART-DEL-010**: Focus moves to previous artifact when deleting the last item in the list
- **TUI-ART-DEL-011**: Spinner shown in overlay during API call
- **TUI-ART-DEL-012**: Delete 404 (already deleted) — row removed, status bar shows "Artifact not found"
- **TUI-ART-DEL-013**: Rapid `x` presses — confirmation overlay already open, second `x` is no-op
- **TUI-ART-DEL-014**: Delete confirmation overlay resizes during terminal resize (min 30ch width)
- **TUI-ART-DEL-015**: Concurrent delete and download on same artifact — delete wins, download cancelled, status bar notifies
- **TUI-ART-DEL-016**: Delete with search filter active — filtered list updates correctly after deletion

All tests must be left failing if the backend is not yet implemented — never skipped or commented out.

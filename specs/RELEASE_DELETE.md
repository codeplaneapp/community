# RELEASE_DELETE

Specification for RELEASE_DELETE.

## High-Level User POV

When a Codeplane repository maintainer needs to remove a release that was published in error, contains incorrect artifacts, is no longer relevant, or was superseded by a corrected release, they delete it. Deleting a release permanently removes the release record, its release notes, its metadata, and all attached binary assets from both the database and blob storage. This is a destructive, irreversible action — once deleted, the release's download URLs stop working, the release no longer appears in any client's release list, and any automation or downstream systems referencing that release will encounter not-found errors.

From the user's perspective, the deletion workflow is straightforward. A maintainer identifies the release they want to remove — either by its numeric ID or by its tag name — and issues a delete. The web UI presents a delete button on the release detail page, guarded by a confirmation dialog that warns the user about the permanence of the action and the number of assets that will be destroyed. The CLI offers a concise `codeplane release delete <release>` command that accepts either a numeric release ID or a tag name as the selector, making it easy to incorporate into cleanup scripts or CI/CD teardown flows.

Deletion is only available to users with write access to the repository. Read-only collaborators, unauthenticated visitors, and users without repository access cannot delete releases. This matches the same permission boundary used for creating and updating releases, ensuring that the people who can publish software are the same people who can retract it.

When a non-draft release is deleted, Codeplane emits a real-time notification to any subscribers watching the repository's release channel, informing them that the release has been removed. Draft releases are deleted silently, since they were never publicly visible in the first place.

The delete operation is designed to be resilient. If some of the release's binary assets fail to be cleaned up from blob storage (due to transient storage errors), the database record is still removed and the release disappears from all product surfaces. Orphaned blobs are handled as a best-effort background concern rather than blocking the user's intent to retract the release.

## Acceptance Criteria

### Definition of Done

- [ ] Users with write access can delete a release by numeric ID via the API.
- [ ] Users with write access can delete a release by tag name via the API.
- [ ] Users with write access can delete a release by ID or tag name via the CLI.
- [ ] Deleting a release permanently removes its database record (hard delete, not soft delete).
- [ ] Deleting a release permanently removes all associated release assets from blob storage (best-effort).
- [ ] Deleting a release permanently removes all associated release asset database records (cascade from release deletion).
- [ ] After deletion, the release no longer appears in any release list, detail, latest, or tag lookup endpoint.
- [ ] After deletion, attempting to fetch the deleted release by ID or tag returns 404.
- [ ] After deletion, attempting to download any asset that belonged to the deleted release returns 404.
- [ ] Deleting a non-draft release emits an SSE notification with action `deleted` on the repository's release channel.
- [ ] Deleting a draft release does NOT emit an SSE notification.
- [ ] The API returns `204 No Content` with an empty body on successful deletion.
- [ ] The feature works identically across API, CLI, Web UI, and TUI clients.
- [ ] Feature flags `RELEASE_DELETE` and `CLI_RELEASE_DELETE` gate the respective surfaces.
- [ ] Telemetry events fire correctly for successful and failed deletion attempts.
- [ ] Observability metrics, logs, and alerts are instrumented per the observability plan.
- [ ] Documentation is published for API, CLI, and UI usage.

### Edge Cases

- [ ] Deleting a release that has zero assets succeeds without error (no blob cleanup needed).
- [ ] Deleting a release that has the maximum number of assets (50) succeeds and cleans up all blobs.
- [ ] Deleting a release where some asset blobs have already been externally removed (ENOENT) succeeds — the missing blobs are silently skipped.
- [ ] Deleting a release where blob storage is temporarily unavailable succeeds — the database record is still removed and blob cleanup errors are swallowed.
- [ ] Deleting a release that is the only release in the repository leaves the release list empty (not errored).
- [ ] Deleting a release that is currently the "latest" release causes the latest release endpoint to return the next most recent published release.
- [ ] Deleting a release by tag name that contains URL-special characters (e.g., `v1.0.0+build.123`, `v2/rc1`, `release@2026`) works correctly when the tag is properly URL-encoded.
- [ ] Deleting a release by tag name that does not exist returns 404.
- [ ] Deleting a release by numeric ID that does not exist returns 404.
- [ ] Deleting a release by a numeric ID string that also happens to match a tag name (e.g., tag named `42`) resolves via ID-first fallback-to-tag logic in the CLI.
- [ ] Concurrent deletion of the same release by two users: the first succeeds with 204, the second receives 404.
- [ ] Deleting a release does not affect other releases in the same repository.
- [ ] Deleting a release whose tag name is 255 characters long (the maximum) succeeds.
- [ ] Attempting to delete with a non-integer, non-tag string (e.g., an empty string) in the ID path returns 400.
- [ ] Attempting to delete by tag with an empty tag path segment returns 400.

### Boundary Constraints

- [ ] Release ID must be a valid positive integer (when using the by-ID endpoint).
- [ ] Tag name maximum length: 255 characters.
- [ ] Tag name must not contain control characters (U+0000–U+001F, U+007F–U+009F).
- [ ] Authentication is required for all delete operations (401 if missing).
- [ ] Write access to the repository is required (403 if insufficient).
- [ ] The release must exist in the specified repository (404 if not found).
- [ ] Private repository releases return 404 (not 403) to unauthenticated or unauthorized users to avoid leaking repository existence.

## Design

### API Shape

#### Delete by ID

**Endpoint:** `DELETE /api/repos/:owner/:repo/releases/:id`

**Authentication:** Required (session cookie, PAT, or OAuth2 token)

**Path Parameters:**

| Parameter | Type    | Description                    |
|-----------|---------|--------------------------------|
| `owner`   | string  | Repository owner (user or org) |
| `repo`    | string  | Repository name                |
| `id`      | integer | Numeric release ID             |

**Request Body:** None (empty).

**Success Response:** `204 No Content` — empty body.

**Error Responses:**

| Status | Condition                  | Body                                          |
|--------|----------------------------|-----------------------------------------------|
| 400    | `id` is not a valid integer | `{ "message": "invalid release id" }`         |
| 401    | Not authenticated          | `{ "message": "authentication required" }`    |
| 403    | No write access            | `{ "message": "forbidden" }`                  |
| 404    | Repository not found       | `{ "message": "repository not found" }`       |
| 404    | Release not found          | `{ "message": "release not found" }`          |

#### Delete by Tag

**Endpoint:** `DELETE /api/repos/:owner/:repo/releases/tags/:tag`

**Authentication:** Required (session cookie, PAT, or OAuth2 token)

**Path Parameters:**

| Parameter | Type   | Description                    |
|-----------|--------|--------------------------------|
| `owner`   | string | Repository owner (user or org) |
| `repo`    | string | Repository name                |
| `tag`     | string | Release tag name (wildcard path, URL-encoded) |

**Request Body:** None (empty).

**Success Response:** `204 No Content` — empty body.

**Error Responses:**

| Status | Condition                  | Body                                          |
|--------|----------------------------|-----------------------------------------------|
| 400    | Tag is empty               | `{ "message": "release tag is required" }`    |
| 401    | Not authenticated          | `{ "message": "authentication required" }`    |
| 403    | No write access            | `{ "message": "forbidden" }`                  |
| 404    | Repository not found       | `{ "message": "repository not found" }`       |
| 404    | Release not found          | `{ "message": "release not found" }`          |
| 422    | Tag contains control chars | Validation error (from `validateReleaseTag`)  |
| 422    | Tag exceeds 255 chars      | Validation error (from `validateReleaseTag`)  |

### SDK Shape

The `ReleaseService` exposes two authoritative service methods for deletion:

```typescript
// Delete by numeric ID
service.deleteRelease(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  releaseID: number
): Promise<void>

// Delete by tag name
service.deleteReleaseByTag(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  tag: string
): Promise<void>
```

**Service behavior:**

1. Resolve the repository by `owner/repo`.
2. Validate write access for the actor (throws `unauthorized` or `forbidden`).
3. Fetch the release (by ID or validated tag name). Throw `notFound` if absent.
4. List all assets associated with the release.
5. Execute the hard-delete SQL query with `RETURNING` clause.
6. Iterate through assets and delete each blob from storage (best-effort, errors swallowed).
7. If the deleted release was not a draft, emit an SSE notification with action `"deleted"` on channel `release_{repository_id}`.

### CLI Command

**Command:** `codeplane release delete <release>`

**Positional Arguments:**

| Argument  | Type   | Required | Description                        |
|-----------|--------|----------|------------------------------------|n| `release` | string | Yes      | Release ID (numeric) or tag name   |

**Options:**

| Option   | Type   | Default      | Description                       |
|----------|--------|--------------|-----------------------------------|
| `--repo` | string | (auto-detect) | Repository in `OWNER/REPO` format |

**Selector Resolution:** The CLI attempts to parse the `release` argument as a numeric ID first. If a numeric ID is valid, it tries the by-ID delete endpoint. If that returns 404, it falls back to the by-tag endpoint. If the argument is not a valid positive integer, it goes directly to the by-tag endpoint.

**Output (default, non-JSON):** `Deleted release <selector>`

**Output (`--json` explicit format):** `{ "status": "deleted", "release": "<selector>" }`

**Output (`--json` standard):** No output (undefined return, matching 204 semantics).

**Examples:**

```bash
# Delete a release by numeric ID
codeplane release delete 42 --repo myorg/myrepo

# Delete a release by tag name
codeplane release delete v1.0.0 --repo myorg/myrepo

# Delete from current repo context
codeplane release delete v2.0.0-beta

# Delete in JSON mode
codeplane release delete v1.0.0 --repo myorg/myrepo --json
```

### Web UI Design

**Route:** `/:owner/:repo/releases/:id`

The delete action lives on the release detail page, not on the release list.

**Delete Button:**
- Located in the release detail page header, alongside the "Edit" button.
- Styled as a destructive action button (red outline, red text).
- Only visible to users with write access to the repository.
- Hidden for read-only or unauthenticated users.

**Confirmation Dialog:**
- Modal overlay with:
  - Title: "Delete release?"
  - Body: "Are you sure you want to delete **{release_name || tag_name}**? This will permanently remove the release, its notes, and **{asset_count} attached asset(s)**. This action cannot be undone."
  - If `asset_count` is 0: "Are you sure you want to delete **{release_name || tag_name}**? This will permanently remove the release and its notes. This action cannot be undone."
  - Cancel button (secondary): closes the dialog.
  - Delete button (destructive/red): confirms and executes the deletion.
- Loading spinner on Delete button while request is in flight.

**Post-Deletion:** Redirect to `/:owner/:repo/releases` with toast: "Release {tag_name} deleted."

**Error Handling:**
- 403: Toast "You do not have permission to delete this release."
- 404: Toast "This release has already been deleted." + redirect to releases list.
- Network error: Toast "Failed to delete release. Please try again."

### TUI UI

**Access:** From the release detail screen, `d` key binding triggers delete.

**Confirmation:** Inline prompt: "Delete release {tag_name}? (y/N)". Default is "N".

**Success:** "Release {tag_name} deleted." and navigate back to releases list.

**Error:** Display error message inline, remain on detail screen.

### Documentation

1. **API Reference — Delete Release by ID:** Full endpoint docs with path parameters, auth requirements, response codes, and curl examples.
2. **API Reference — Delete Release by Tag:** Same for tag-based endpoint, including URL encoding notes.
3. **CLI Reference — `release delete`:** Command synopsis, ID-vs-tag resolution, output modes, examples.
4. **User Guide — Managing Releases (Delete section):** When/why to delete, permanence warning, asset impact, effect on latest release.
5. **Troubleshooting — Release Deletion:** Common issues (not found, permissions, concurrent deletion).

## Permissions & Security

### Authorization Matrix

| Role                  | Can Delete Release? | Notes                                                    |
|-----------------------|---------------------|----------------------------------------------------------|
| Repository Owner      | ✅ Yes              | Full access                                              |
| Organization Owner    | ✅ Yes              | Via org-level ownership                                  |
| Organization Admin    | ✅ Yes              | Via org-level admin permission                           |
| Team (Write)          | ✅ Yes              | Via team-to-repo assignment with write permission        |
| Collaborator (Write)  | ✅ Yes              | Via direct collaborator invitation with write permission |
| Team (Read)           | ❌ No               | 403 Forbidden                                            |
| Collaborator (Read)   | ❌ No               | 403 Forbidden                                            |
| Authenticated, no access | ❌ No            | 404 Not Found (for private repos) or 403                 |
| Anonymous             | ❌ No               | 401 Unauthorized                                         |

### Permission Resolution

The service resolves the highest permission from (in priority order):

1. Repository ownership (owner always has full admin)
2. Organization ownership / admin status
3. Team permission for the repository
4. Direct collaborator permission

If the highest resolved permission is `write` or `admin`, the request proceeds. Otherwise, it is rejected with 403 (or 404 for private repos to avoid leaking existence).

### Rate Limiting

- **Authenticated users:** Standard mutating endpoint rate limit (recommended: 60 requests per minute per user).
- **Unauthenticated users:** Rejected at the auth check (401) before rate limiting is relevant.
- **Natural abuse brake:** Deletion is bounded by the number of releases that exist (max 1,000 per repo), providing an inherent ceiling on delete operations.

### Data Privacy

- **Permanent data destruction:** Deletion is a hard delete. Release metadata, notes, and asset blobs are permanently removed. There is no soft-delete, recycle bin, or undo window.
- **Blob cleanup is best-effort:** In rare failure scenarios, orphaned blobs may persist in storage. These do not contain PII beyond what was in the asset file itself, but storage cleanup jobs should eventually reclaim them.
- **Audit trail:** The deletion event should be logged with the actor's identity for compliance and forensic purposes. The log entry persists even after the release record is gone.
- **No PII leakage:** The 204 response body is empty. Error responses contain only generic messages, not release content.
- **Private repository protection:** Unauthenticated or unauthorized delete attempts against private repositories return 404, not 403, to avoid confirming repository existence.

## Telemetry & Product Analytics

### Business Events

| Event                  | Trigger                                    | Properties                                                                                                                                                    |
|------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ReleaseDeleted`       | Successful release deletion                | `release_id`, `repository_id`, `owner`, `repo`, `tag_name`, `was_draft`, `was_prerelease`, `asset_count`, `total_asset_bytes`, `client` (api/cli/web/tui), `actor_id` |
| `ReleaseDeleteFailed`  | Failed release deletion attempt            | `repository_id` (if resolved), `owner`, `repo`, `selector` (ID or tag), `error_code` (400/401/403/404), `error_reason`, `client`, `actor_id` (if authenticated) |
| `ReleaseAssetsCleaned` | All assets successfully cleaned from blobs | `release_id`, `repository_id`, `asset_count`, `cleaned_count`, `failed_count`                                                                                 |

### Funnel Metrics

| Metric                                 | Description                                                                 | Success Indicator                                                       |
|----------------------------------------|-----------------------------------------------------------------------------|-------------------------------------------------------------------------|
| Release deletion success rate          | `ReleaseDeleted` / (`ReleaseDeleted` + `ReleaseDeleteFailed`)               | > 90% (failures should be mostly 404s from already-deleted releases)    |
| Delete-after-create velocity           | Time between `ReleaseCreated` and `ReleaseDeleted` for the same release     | Short times may indicate accidental publishes; monitor for patterns     |
| Asset cleanup success rate             | `cleaned_count` / `asset_count` across all `ReleaseAssetsCleaned` events    | > 99% — blob cleanup should almost always succeed                       |
| Deletion by client distribution        | Breakdown of `client` property across `ReleaseDeleted` events               | Validates multi-client value; CLI-heavy suggests automation use cases   |
| Confirmation dialog abandonment rate   | (Web UI) Dialog opened but Cancel clicked / Dialog opened                   | High abandonment is healthy — means the confirmation is doing its job   |

### Success Indicators

- Release deletion p95 latency < 2 seconds (including blob cleanup for up to 50 assets).
- Blob cleanup success rate > 99.5% over a 30-day rolling window.
- No user-reported incidents of "zombie releases" (releases that reappear after deletion) over a 90-day period.

## Observability

### Logging Requirements

| Log Event                              | Level   | Structured Context                                                                                    |
|----------------------------------------|---------|-------------------------------------------------------------------------------------------------------|
| Release delete request received        | `info`  | `owner`, `repo`, `selector` (id or tag), `delete_method` (by_id/by_tag), `actor_id`, `request_id`    |
| Release deleted successfully           | `info`  | `release_id`, `repository_id`, `tag_name`, `was_draft`, `asset_count`, `actor_id`, `duration_ms`, `request_id` |
| Asset blob deleted                     | `debug` | `release_id`, `asset_id`, `gcs_key`, `request_id`                                                    |
| Asset blob cleanup failed              | `warn`  | `release_id`, `asset_id`, `gcs_key`, `error_message`, `request_id`                                   |
| All asset blobs cleaned                | `info`  | `release_id`, `asset_count`, `cleaned_count`, `failed_count`, `cleanup_duration_ms`, `request_id`     |
| Release not found during delete        | `warn`  | `owner`, `repo`, `selector`, `actor_id`, `request_id`                                                |
| Permission denied for delete           | `warn`  | `owner`, `repo`, `selector`, `actor_id`, `resolved_permission`, `request_id`                         |
| Authentication missing for delete      | `warn`  | `owner`, `repo`, `selector`, `request_id`                                                            |
| Invalid release ID format              | `warn`  | `owner`, `repo`, `raw_id`, `request_id`                                                              |
| SSE notification emitted for deletion  | `debug` | `repository_id`, `release_id`, `action` (deleted), `request_id`                                      |
| SSE notification failed for deletion   | `error` | `repository_id`, `release_id`, `error_message`, `request_id`                                         |
| Database error during release delete   | `error` | `owner`, `repo`, `selector`, `actor_id`, `error_message`, `stack_trace`, `request_id`                |

### Prometheus Metrics

| Metric Name                                        | Type      | Labels                                             | Description                                                 |
|----------------------------------------------------|-----------|------------------------------------------------------|-------------------------------------------------------------|
| `codeplane_release_delete_total`                   | Counter   | `status` (success/error), `error_code`, `method` (by_id/by_tag) | Total release delete attempts                               |
| `codeplane_release_delete_duration_seconds`        | Histogram | `status`, `method`                                   | End-to-end delete latency including blob cleanup (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0) |
| `codeplane_release_delete_assets_cleaned_total`    | Counter   | `status` (success/failed)                            | Individual asset blob cleanup outcomes                      |
| `codeplane_release_delete_blob_cleanup_duration_seconds` | Histogram | —                                              | Duration of the blob cleanup phase only (buckets: 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0) |
| `codeplane_release_delete_sse_notifications_total` | Counter   | `status` (success/error)                             | SSE notifications for release deletions                     |

### Alerts

#### Alert: Release Delete Error Rate Spike
- **Condition:** `rate(codeplane_release_delete_total{status="error", error_code!="404"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check structured logs for `release delete request received` and `Database error during release delete` entries in the last 10 minutes.
  2. If errors are `403` heavy: check if a permission-related change was deployed (role resolution logic, team assignment change).
  3. If errors are `500` heavy: check database connectivity — run `SELECT 1` against the primary database and check connection pool stats.
  4. Check if the error correlates with a recent deployment by comparing error timestamps with deploy timestamps.
  5. If blob storage errors are involved: check the blob store health (disk space for local, API status for cloud storage).
  6. Verify the `releases` table schema is intact: `SELECT column_name FROM information_schema.columns WHERE table_name = 'releases'`.

#### Alert: Release Delete Latency Spike
- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_delete_duration_seconds_bucket[5m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. Check if the latency is in the database phase or the blob cleanup phase by comparing `codeplane_release_delete_duration_seconds` with `codeplane_release_delete_blob_cleanup_duration_seconds`.
  2. If database-bound: run `EXPLAIN ANALYZE` on `DELETE FROM releases WHERE repository_id = $1 AND id = $2` with sample parameters. Check for table bloat or missing indexes.
  3. If blob-bound: check if a release with many large assets (approaching 50 assets × 2 GiB each) is being deleted.
  4. Check for lock contention on the `releases` or `release_assets` tables via `SELECT * FROM pg_locks WHERE NOT granted`.
  5. If the issue is isolated to a single repository, check its release and asset count for abnormal volumes.

#### Alert: Blob Cleanup Failure Rate
- **Condition:** `rate(codeplane_release_delete_assets_cleaned_total{status="failed"}[1h]) / rate(codeplane_release_delete_assets_cleaned_total[1h]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check the blob store health: disk space (local), API errors (cloud), or network connectivity to the storage backend.
  2. Review `Asset blob cleanup failed` log entries for common error patterns (permission denied, path not found, timeout).
  3. If errors are ENOENT (file not found): this is expected for blobs that were already cleaned. Verify this is not masking a deeper issue.
  4. If errors are permission-based: check the blob store filesystem permissions or cloud IAM policies.
  5. Consider running a manual blob reconciliation job to identify and clean orphaned blobs.
  6. Note: blob cleanup failures do NOT affect the user experience (release is still deleted). This alert is for storage hygiene only.

#### Alert: Release Delete Availability Drop
- **Condition:** `sum(rate(codeplane_release_delete_total{error_code=~"5.."}[5m])) / sum(rate(codeplane_release_delete_total[5m])) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Immediately check `/health` endpoint and database connectivity.
  2. Check for OOM kills or process crashes via system journal (`journalctl -u codeplane`).
  3. Verify the release service is initialized in the service registry (check startup logs).
  4. If the issue is database-specific: check for schema migration issues, table locks, or replication lag.
  5. If the issue affects all mutating endpoints (not just release delete): escalate as a platform-wide incident.
  6. Roll back the most recent deployment if error timestamps correlate with deploy time.

### Error Cases and Failure Modes

| Error Case                                | HTTP Status | User-Facing Message                    | Recovery                                          |
|-------------------------------------------|-------------|----------------------------------------|---------------------------------------------------|
| Release not found (by ID)                 | 404         | "release not found"                    | User verifies the release ID                      |
| Release not found (by tag)                | 404         | "release not found"                    | User verifies the tag name                        |
| Repository not found                      | 404         | "repository not found"                 | User verifies owner/repo                          |
| Invalid release ID (not a number)         | 400         | "invalid release id"                   | User provides a valid numeric ID or uses tag name |
| Empty tag name                            | 400         | "release tag is required"              | User provides a non-empty tag name                |
| Not authenticated                         | 401         | "authentication required"              | User authenticates                                |
| No write access                           | 403         | "forbidden"                            | User requests write access from repo owner        |
| Database connection failure               | 500         | "Internal server error"                | Retry; alert fires                                |
| Blob storage unavailable                  | N/A         | (transparent — release still deleted)  | Orphaned blobs cleaned up later                   |
| SSE notification failure                  | N/A         | (transparent — deletion still succeeds)| SSE manager auto-recovers                         |
| Concurrent delete (second attempt)        | 404         | "release not found"                    | Expected behavior; no action needed               |
| Tag with control characters               | 422         | Validation error                       | User provides a valid tag name                    |
| Tag exceeding 255 characters              | 422         | Validation error                       | User provides a shorter tag name                  |

## Verification

### API Integration Tests

- [ ] **Delete a release by ID (happy path).** Create a release, DELETE by ID, verify 204 response with empty body. GET the same release by ID and verify 404.
- [ ] **Delete a release by tag name (happy path).** Create a release, DELETE by tag, verify 204 response with empty body. GET the same release by tag and verify 404.
- [ ] **Delete removes release from list.** Create 3 releases, delete the middle one by ID, list releases and verify only 2 remain and the deleted one is absent.
- [ ] **Delete updates X-Total-Count.** List releases and note `X-Total-Count`, delete one release, list again and verify `X-Total-Count` decreased by 1.
- [ ] **Delete a release with assets (blob cleanup).** Create a release, upload 2 assets (confirmed), DELETE the release, verify 204. Verify assets are no longer accessible via the asset download endpoint (404).
- [ ] **Delete a release with maximum assets (50).** Create a release, upload 50 assets, DELETE the release, verify 204 and all asset downloads return 404.
- [ ] **Delete a release with zero assets.** Create a release with no uploads, DELETE, verify 204.
- [ ] **Delete updates latest release.** Create release `v1.0.0`, create release `v2.0.0`. Verify latest is `v2.0.0`. Delete `v2.0.0`. Verify latest is now `v1.0.0`.
- [ ] **Delete the only release leaves latest empty.** Create one release, delete it, verify GET `/releases/latest` returns 404.
- [ ] **Delete a draft release.** Create a draft release, DELETE by ID, verify 204. Verify it no longer appears in the list even for write-access users.
- [ ] **Delete a prerelease.** Create a prerelease, DELETE by ID, verify 204.
- [ ] **Delete a draft+prerelease.** Create a release with both flags, DELETE, verify 204.
- [ ] **SSE notification emitted for non-draft deletion.** Subscribe to the release SSE channel, delete a published release, verify an event with action `"deleted"` is received.
- [ ] **No SSE notification for draft deletion.** Subscribe to the release SSE channel, delete a draft release, verify no event is received within a reasonable timeout.
- [ ] **Delete by ID — unauthenticated.** DELETE without auth, verify 401 with `"authentication required"`.
- [ ] **Delete by tag — unauthenticated.** DELETE without auth, verify 401.
- [ ] **Delete by ID — read-only user.** Authenticate as a user with only read access, DELETE, verify 403.
- [ ] **Delete by tag — read-only user.** Same as above for tag endpoint, verify 403.
- [ ] **Delete by ID — write-access collaborator.** Authenticate as collaborator with write access, DELETE, verify 204.
- [ ] **Delete by ID — repository owner.** Authenticate as repo owner, DELETE, verify 204.
- [ ] **Delete by ID — organization admin.** Authenticate as org admin, DELETE, verify 204.
- [ ] **Delete a release on a non-existent repository.** DELETE against a non-existent `owner/repo`, verify 404.
- [ ] **Delete by invalid release ID (non-integer).** DELETE `/releases/abc`, verify 400 with `"invalid release id"`.
- [ ] **Delete by invalid release ID (negative).** DELETE `/releases/-1`, verify 400 with `"invalid release id"`.
- [ ] **Delete by invalid release ID (zero).** DELETE `/releases/0`, verify 400 or 404.
- [ ] **Delete by invalid release ID (float).** DELETE `/releases/1.5`, verify 400 with `"invalid release id"`.
- [ ] **Delete by non-existent release ID.** DELETE `/releases/999999`, verify 404.
- [ ] **Delete by non-existent tag name.** DELETE `/releases/tags/nonexistent-tag`, verify 404.
- [ ] **Delete by empty tag name.** DELETE `/releases/tags/` (empty tag segment), verify 400 with `"release tag is required"`.
- [ ] **Delete by tag with URL-encoded special characters.** Create a release with tag `v1.0.0+build.1`, DELETE using the properly encoded tag, verify 204.
- [ ] **Delete by tag with slash in name.** Create a release with tag `release/v1`, DELETE using encoded tag, verify 204.
- [ ] **Delete by tag at maximum length (255 chars).** Create a release with a 255-character tag, DELETE by tag, verify 204.
- [ ] **Delete by tag exceeding maximum length (256 chars).** DELETE with a 256-character tag, verify 422.
- [ ] **Delete by tag with control characters.** DELETE with tag containing `\x00`, verify 422.
- [ ] **Concurrent delete of the same release.** Issue two DELETE requests simultaneously for the same release ID. Verify one returns 204 and the other returns 404.
- [ ] **Delete on private repository without access.** Create a private repo with a release, DELETE as an unauthenticated user, verify 404 (not 403).
- [ ] **Delete on private repository with access.** Create a private repo, add collaborator with write access, DELETE as collaborator, verify 204.
- [ ] **Idempotency: delete same release twice.** DELETE a release (204), then DELETE the same release again (404).
- [ ] **Delete does not affect other releases.** Create releases `v1.0.0` and `v2.0.0`. Delete `v1.0.0`. Verify `v2.0.0` is still retrievable with all its data intact.
- [ ] **Response body is empty on 204.** Verify the response body is literally empty (no JSON, no whitespace).

### CLI E2E Tests

- [ ] **`codeplane release delete <id> --repo OWNER/REPO`** — Delete by numeric ID, verify success message.
- [ ] **`codeplane release delete <tag> --repo OWNER/REPO`** — Delete by tag name, verify success message.
- [ ] **`codeplane release delete <id> --repo OWNER/REPO --json`** — Delete in explicit JSON mode, verify output is `{ "status": "deleted", "release": "<id>" }`.
- [ ] **`codeplane release delete <tag> --repo OWNER/REPO --json`** — Delete in explicit JSON mode with tag selector.
- [ ] **`codeplane release delete <numeric-id>` where numeric-id matches a tag name** — Verify ID-first resolution: if no release with that numeric ID exists, it falls back to tag lookup.
- [ ] **`codeplane release delete <tag>` (without `--repo`, from a repo directory)** — Verify repo resolution from working directory succeeds.
- [ ] **`codeplane release delete nonexistent-tag --repo OWNER/REPO`** — Verify clear 404 error message.
- [ ] **`codeplane release delete <id> --repo OWNER/REPO` as read-only user** — Verify 403 error message.
- [ ] **`codeplane release delete <id> --repo OWNER/REPO` unauthenticated** — Verify 401 error message.
- [ ] **Create then delete then list.** Create a release via CLI, delete it via CLI, list releases and verify the deleted release is absent.
- [ ] **Delete a release with uploaded assets via CLI.** Create a release, upload an asset, delete the release via CLI, verify the release and its asset are gone.

### Web UI E2E Tests (Playwright)

- [ ] **Delete button visibility for write-access user.** Navigate to a release detail page as a write-access user. Verify the delete button is visible.
- [ ] **Delete button hidden for read-only user.** Navigate to a release detail page as a read-only user. Verify no delete button is rendered.
- [ ] **Delete button hidden for unauthenticated user.** Navigate to a public release detail page while logged out. Verify no delete button.
- [ ] **Confirmation dialog appears on click.** Click the delete button. Verify the confirmation dialog appears with release name/tag, asset count warning, Cancel and Delete buttons.
- [ ] **Cancel closes dialog without deleting.** Click Delete, then Cancel in the confirmation dialog. Verify the dialog closes and the release is still present.
- [ ] **Confirm delete redirects to releases list.** Click Delete, confirm in the dialog. Verify redirect to `/:owner/:repo/releases` and toast notification "Release {tag} deleted."
- [ ] **Deleted release no longer in list.** After deletion, verify the releases list page does not contain the deleted release.
- [ ] **Delete button shows loading state during request.** Intercept the DELETE API request to delay it. Click confirm and verify the button shows a spinner and is disabled.
- [ ] **Error toast on 403.** Intercept the DELETE API request to return 403. Verify a toast error is shown.
- [ ] **Error toast on network failure.** Intercept the DELETE API request to fail. Verify a toast error with retry suggestion.
- [ ] **Dialog shows correct asset count.** Create a release with 3 assets. Navigate to its detail page. Click delete and verify the dialog mentions "3 attached asset(s)".
- [ ] **Dialog for release with no assets.** Navigate to a release with 0 assets. Verify the dialog omits the asset warning.

### TUI E2E Tests

- [ ] **`d` key triggers delete confirmation on release detail screen.** Navigate to a release detail screen, press `d`, verify confirmation prompt appears.
- [ ] **Confirm delete with `y`.** Press `d`, then `y`. Verify success message and navigation back to releases list.
- [ ] **Cancel delete with `n` or Enter.** Press `d`, then `n` or Enter. Verify the release remains and the prompt is dismissed.
- [ ] **Delete confirmation shows release tag name.** Verify the prompt includes the tag name of the release being deleted.

### Cross-Client Consistency Tests

- [ ] **Create via API, delete via CLI.** Create a release via the API. Delete it via the CLI. Verify it's gone via the API (404).
- [ ] **Create via CLI, delete via API.** Create a release via the CLI. Delete it via the API. Verify it's gone via the CLI (error/empty).
- [ ] **Create via CLI with assets, delete via API.** Create a release and upload assets via CLI. Delete via API. Verify both the release and assets are gone across all clients.
- [ ] **Delete via CLI, verify SSE notification received.** Subscribe to the SSE release channel via API. Delete a non-draft release via CLI. Verify the SSE event is received.

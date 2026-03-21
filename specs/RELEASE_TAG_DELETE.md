# RELEASE_TAG_DELETE

Specification for RELEASE_TAG_DELETE.

## High-Level User POV

When a Codeplane repository maintainer needs to remove a release and knows its tag name rather than its numeric ID, they can delete it directly by tag. This is the natural deletion path for most users, since tag names like `v1.0.0` or `v2.3.0-beta.1` are the human-meaningful identifiers people actually remember and reference in conversations, changelogs, scripts, and CI/CD pipelines. Rather than first looking up a release's numeric database ID just to delete it, the user supplies the tag name and the release is removed.

Deleting a release by tag has exactly the same effect as deleting it by numeric ID: the release record, its release notes, its metadata, and all attached binary assets are permanently removed from the system. Download URLs for the release's assets stop working immediately. The release disappears from all release lists, tag lookups, latest-release queries, and search results across every client — web, CLI, TUI, editors, and the API itself. This is a hard, irreversible action with no undo, recycle bin, or recovery window.

The tag-based deletion path is especially valuable in automation scenarios. A CI teardown script, a release rotation policy, or an agent performing repository hygiene can reference releases by the same tag strings used throughout the rest of the toolchain without needing to maintain a separate mapping of numeric IDs. The CLI's `codeplane release delete <release>` command already uses tag-based resolution as its fallback when the selector is not a numeric ID, making this the default path for human CLI usage as well.

From a permissions standpoint, deleting by tag requires exactly the same write access as deleting by ID. Users without write access to the repository cannot delete releases regardless of which selector they use. For private repositories, unauthenticated or unauthorized users receive a 404 rather than a 403, so the existence of the repository and its releases is never leaked.

When a non-draft release is deleted by tag, Codeplane emits a real-time notification on the repository's release channel so that subscribers — other users, dashboards, or automation consumers — are informed that the release has been retracted. Draft releases are deleted silently, since they were never publicly visible.

## Acceptance Criteria

### Definition of Done

- [ ] Users with write access can delete a release by tag name via the `DELETE /api/repos/:owner/:repo/releases/tags/:tag` endpoint.
- [ ] The tag path segment uses wildcard routing to correctly capture tag names containing slashes, dots, plus signs, and other URL-encoded characters.
- [ ] Deleting by tag permanently removes the release database record (hard delete with `RETURNING` clause).
- [ ] Deleting by tag permanently removes all associated release assets from blob storage (best-effort; errors swallowed).
- [ ] Deleting by tag permanently removes all associated release asset database records (cascaded from release deletion).
- [ ] After deletion, the release no longer appears in any release list, detail, latest, or tag lookup endpoint.
- [ ] After deletion, attempting to fetch the deleted release by tag or by ID returns 404.
- [ ] After deletion, attempting to download any asset that belonged to the deleted release returns 404.
- [ ] Deleting a non-draft release by tag emits an SSE notification with action `"deleted"` on the repository's release channel.
- [ ] Deleting a draft release by tag does NOT emit an SSE notification.
- [ ] The API returns `204 No Content` with an empty body on successful deletion.
- [ ] The CLI `codeplane release delete <tag>` resolves non-numeric selectors directly to the tag-based delete endpoint.
- [ ] The CLI `codeplane release delete <numeric-string>` falls back to the tag endpoint if the numeric-ID endpoint returns 404.
- [ ] Feature flag `RELEASE_TAG_DELETE` gates the tag-based delete endpoint.
- [ ] Telemetry events fire correctly for successful and failed tag-based deletion attempts.
- [ ] Observability metrics, logs, and alerts are instrumented per the observability plan.
- [ ] Documentation is published for the tag-based delete API endpoint and CLI tag resolution behavior.

### Edge Cases

- [ ] Deleting a release by tag that has zero assets succeeds without error (no blob cleanup needed).
- [ ] Deleting a release by tag that has the maximum number of assets (50) succeeds and all asset blobs are cleaned up.
- [ ] Deleting a release by tag where some asset blobs have already been externally removed (ENOENT) succeeds — missing blobs are silently skipped.
- [ ] Deleting a release by tag where blob storage is temporarily unavailable succeeds — the database record is still removed and blob cleanup errors are swallowed.
- [ ] Deleting a release by tag that is the only release in the repository leaves the release list empty (not errored) and the `/releases/latest` endpoint returns 404.
- [ ] Deleting a release by tag that is currently the "latest" release causes the latest release endpoint to return the next most recent published release.
- [ ] Deleting a release by a tag containing URL-special characters (e.g., `v1.0.0+build.123`, `v2/rc1`, `release@2026`, `v1.0.0-beta.1+sha.abc123`) works correctly when the tag is properly URL-encoded in the request path.
- [ ] Deleting a release by a tag containing forward slashes (e.g., `feature/v1.0`) works because the wildcard route captures the full remaining path.
- [ ] Deleting by a tag that does not exist returns 404 with `"release not found"`.
- [ ] Concurrent deletion of the same release by tag by two users: the first succeeds with 204, the second receives 404.
- [ ] Deleting a release by tag does not affect other releases in the same repository.
- [ ] Deleting a release by tag name that is also a valid positive integer string (e.g., tag named `42`) resolves to that tag, not to numeric release ID 42.
- [ ] After deleting a release by tag, creating a new release with the same tag name succeeds (the tag name is freed).
- [ ] Deleting a tag-only release (a release with `is_tag: true`) removes it exactly like a full release.
- [ ] Deleting a prerelease by tag succeeds with 204.
- [ ] Deleting a draft+prerelease by tag succeeds with 204.

### Boundary Constraints

- [ ] Tag name must not be empty after trimming (400 at route level: `"release tag is required"`; 422 at service level: validation error `missing_field`).
- [ ] Tag name maximum length: 255 characters (422 validation error with code `too_long`).
- [ ] Tag name must not contain control characters U+0000–U+001F or U+007F–U+009F (422 validation error with code `invalid`).
- [ ] Tag name is trimmed of leading/trailing whitespace before validation and lookup.
- [ ] Authentication is required for all tag-based delete operations (401 if missing).
- [ ] Write access to the repository is required (403 if insufficient; 404 for private repos to avoid leaking existence).
- [ ] The release must exist in the specified repository with the given tag name (404 if not found).
- [ ] The request body must be empty; any body is ignored.
- [ ] The Content-Type header is not required for DELETE requests with no body.

## Design

### API Shape

**Endpoint:** `DELETE /api/repos/:owner/:repo/releases/tags/:tag`

**Implementation Note:** The route uses Hono wildcard matching (`/api/repos/:owner/:repo/releases/tags/*`) to capture the full remaining path as the tag name. The tag is extracted by slicing the path after the `/releases/tags/` prefix. This allows tag names containing slashes to be correctly captured.

**Authentication:** Required (session cookie, PAT, or OAuth2 token).

**Path Parameters:**

| Parameter | Type   | Description                                           |
|-----------|--------|-------------------------------------------------------|
| `owner`   | string | Repository owner username or organization slug        |
| `repo`    | string | Repository name                                       |
| `tag`     | string | Release tag name (wildcard path segment, URL-encoded) |

**Request Body:** None (empty).

**Success Response:** `204 No Content` — empty body.

**Error Responses:**

| Status | Condition                          | Body                                                                                                  |
|--------|------------------------------------|-------------------------------------------------------------------------------------------------------|
| 400    | Tag segment is empty               | `{ "message": "release tag is required" }`                                                            |
| 401    | Not authenticated                  | `{ "message": "authentication required" }`                                                            |
| 403    | No write access (public repo)      | `{ "message": "forbidden" }`                                                                          |
| 404    | Repository not found               | `{ "message": "repository not found" }`                                                               |
| 404    | Release not found for tag          | `{ "message": "release not found" }`                                                                  |
| 404    | No access to private repo          | `{ "message": "repository not found" }` (existence not leaked)                                        |
| 422    | Tag contains control characters    | `{ "message": "Validation Failed", "errors": [{ "resource": "Release", "field": "tag_name", "code": "invalid" }] }` |
| 422    | Tag exceeds 255 characters         | `{ "message": "Validation Failed", "errors": [{ "resource": "Release", "field": "tag_name", "code": "too_long" }] }` |

**Curl Examples:**

```bash
# Delete by simple tag
curl -X DELETE \
  -H "Authorization: token <PAT>" \
  https://codeplane.example/api/repos/myorg/myrepo/releases/tags/v1.0.0

# Delete by tag with special characters (URL-encoded)
curl -X DELETE \
  -H "Authorization: token <PAT>" \
  https://codeplane.example/api/repos/myorg/myrepo/releases/tags/v1.0.0%2Bbuild.42

# Delete by tag with forward slash
curl -X DELETE \
  -H "Authorization: token <PAT>" \
  https://codeplane.example/api/repos/myorg/myrepo/releases/tags/release/v1
```

### SDK Shape

The `ReleaseService` exposes the tag-based deletion method:

```typescript
service.deleteReleaseByTag(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  tag: string
): Promise<void>
```

**Service behavior sequence:**

1. Validate the tag via `validateReleaseTag(tag)`: trim, check non-empty, check ≤ 255 chars, check no control characters. Throws 422 validation error on failure.
2. Resolve the repository by `owner/repo`. Throws 404 if not found.
3. Validate write access for the actor via `requireWriteAccess()`. Throws 401 (unauthenticated) or 403/404 (unauthorized).
4. Fetch the release by tag name from the database. Throw `notFound("release not found")` if absent.
5. List all assets associated with the release (for blob cleanup).
6. Execute the hard-delete SQL query `DELETE FROM releases WHERE repository_id = $1 AND tag_name = $2 RETURNING *`.
7. Iterate through assets and delete each blob from storage (best-effort; errors caught and swallowed).
8. If the deleted release was not a draft, map the release and emit an SSE notification with action `"deleted"` on channel `release_{repository_id}`.

### CLI Command

The CLI does not have a separate tag-delete subcommand. Tag-based deletion is part of the unified `codeplane release delete <release>` command.

**Command:** `codeplane release delete <release>`

**Selector Resolution:** When the `release` argument is not parseable as a valid positive integer, the CLI sends the request directly to the tag-based delete endpoint (`DELETE /api/repos/:owner/:repo/releases/tags/:tag`). When the argument IS a valid integer, the CLI tries the by-ID endpoint first and falls back to the tag endpoint if the by-ID endpoint returns 404.

**Tag URL Encoding:** The CLI URL-encodes the tag name via `encodeURIComponent(selector)` before inserting it into the request path.

**Examples:**

```bash
# Delete by tag name (goes directly to tag endpoint)
codeplane release delete v1.0.0 --repo myorg/myrepo

# Delete by tag with special chars
codeplane release delete "v1.0.0+build.42" --repo myorg/myrepo

# Numeric string that's actually a tag name (ID-first, falls back to tag)
codeplane release delete 42 --repo myorg/myrepo

# JSON output
codeplane release delete v1.0.0 --repo myorg/myrepo --json
```

### Web UI Design

The Web UI release detail page uses the by-ID endpoint for deletion (since it always has the release ID from the detail view context). No additional Web UI surfaces are needed specifically for `RELEASE_TAG_DELETE` beyond what `RELEASE_DELETE` provides.

### TUI UI

The TUI release detail screen deletes by ID (since the release is already loaded into context). No TUI-specific changes are needed for `RELEASE_TAG_DELETE`.

### Documentation

1. **API Reference — Delete Release by Tag:** Full endpoint documentation including wildcard path behavior, URL encoding requirements for special characters in tag names, all error responses, and curl examples covering simple tags, tags with `+`, `/`, and `@` characters.
2. **CLI Reference — `release delete` (tag resolution section):** Document the ID-first-then-tag resolution behavior, explain when and why the tag endpoint is used, clarify URL encoding is handled automatically.
3. **User Guide — Managing Releases (Delete by Tag section):** Explain that users can delete releases by the same tag names they use everywhere else, emphasize permanence, note that the tag name becomes available for reuse after deletion.
4. **API Migration / Changelog:** Note the availability of the `DELETE /api/repos/:owner/:repo/releases/tags/:tag` endpoint and its relationship to the by-ID endpoint.

## Permissions & Security

### Authorization Matrix

| Role                          | Can Delete by Tag? | Notes                                                           |
|-------------------------------|--------------------|-----------------------------------------------------------------|
| Repository Owner              | ✅ Yes             | Full access                                                     |
| Organization Owner            | ✅ Yes             | Via org-level ownership                                         |
| Organization Admin            | ✅ Yes             | Via org-level admin permission                                  |
| Team (Write)                  | ✅ Yes             | Via team-to-repo assignment with write permission               |
| Collaborator (Write)          | ✅ Yes             | Via direct collaborator invitation with write permission        |
| Team (Read)                   | ❌ No              | 403 Forbidden (or 404 for private repos)                        |
| Collaborator (Read)           | ❌ No              | 403 Forbidden (or 404 for private repos)                        |
| Authenticated, no access      | ❌ No              | 404 Not Found (private repos) or 403 (public repos)            |
| Anonymous / Unauthenticated   | ❌ No              | 401 Unauthorized                                                |

### Permission Resolution

The service resolves the highest permission from (in priority order):

1. Repository ownership (owner always has full admin)
2. Organization ownership / admin status
3. Team permission for the repository
4. Direct collaborator permission

If the highest resolved permission is `write` or `admin`, the request proceeds. Otherwise, it is rejected with 403 (or 404 for private repos to prevent existence leakage).

### Rate Limiting

- **Authenticated users:** Standard mutating endpoint rate limit (60 requests per minute per user).
- **Unauthenticated requests:** Rejected at the auth check (401) before rate limiting applies.
- **Natural abuse constraint:** Deletion is bounded by the number of releases that exist in a repository (maximum ~1,000 per repo), providing an inherent ceiling.

### Data Privacy

- **Permanent data destruction:** Deletion is a hard delete. Release metadata, notes, and asset blobs are permanently removed. There is no soft-delete, recycle bin, or undo.
- **Blob cleanup is best-effort:** In rare failure scenarios, orphaned blobs may persist in storage. A storage reconciliation job should eventually reclaim them.
- **Audit trail:** The deletion event is logged with the actor's identity, the tag name, and the repository. This log entry persists after the release record is gone.
- **No PII leakage in responses:** The 204 response body is empty. Error responses contain only generic messages, never release content or user data.
- **Private repository protection:** Unauthenticated or unauthorized tag-based delete attempts against private repositories return 404, not 403, to avoid confirming the repository's existence.
- **Tag name exposure:** Tag names are not considered sensitive data (they are publicly visible on public repositories), but they should not be included in error responses for private repository 404s.

## Telemetry & Product Analytics

### Business Events

| Event                          | Trigger                                   | Properties                                                                                                                                                                |
|--------------------------------|-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ReleaseTagDeleted`            | Successful release deletion via tag endpoint | `release_id`, `repository_id`, `owner`, `repo`, `tag_name`, `was_draft`, `was_prerelease`, `is_tag`, `asset_count`, `total_asset_bytes`, `client` (api/cli), `actor_id` |
| `ReleaseTagDeleteFailed`       | Failed tag-based deletion attempt         | `repository_id` (if resolved), `owner`, `repo`, `tag_name`, `error_code` (400/401/403/404/422), `error_reason`, `client`, `actor_id` (if authenticated)                  |
| `ReleaseTagDeleteAssetsCleaned`| All assets cleaned from blob storage      | `release_id`, `repository_id`, `tag_name`, `asset_count`, `cleaned_count`, `failed_count`, `cleanup_duration_ms`                                                         |

### Funnel Metrics

| Metric                                       | Description                                                                        | Success Indicator                                                                   |
|----------------------------------------------|------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| Tag-delete success rate                       | `ReleaseTagDeleted` / (`ReleaseTagDeleted` + `ReleaseTagDeleteFailed`)             | > 90% (failures should be mostly 404s from non-existent tags)                       |
| Tag-delete vs ID-delete ratio                 | `ReleaseTagDeleted` / (`ReleaseTagDeleted` + `ReleaseDeleted`)                     | Indicates whether users prefer tag-based or ID-based deletion                       |
| Tag-delete by client distribution             | Breakdown of `client` property across `ReleaseTagDeleted`                          | CLI-heavy suggests automation use cases; API-heavy suggests integration usage        |
| Asset cleanup success rate (tag-delete)       | `cleaned_count` / `asset_count` across `ReleaseTagDeleteAssetsCleaned` events      | > 99% — blob cleanup should almost always succeed                                   |
| 422 validation error rate                     | `ReleaseTagDeleteFailed{error_code=422}` / `ReleaseTagDeleteFailed`                | Should be near 0% — indicates clients sending invalid tag names                     |
| CLI tag fallback rate                         | CLI attempts that used ID-first then fell back to tag endpoint                     | High fallback rate may indicate users prefer tag selectors                          |

### Success Indicators

- Tag-based release deletion p95 latency < 2 seconds (including blob cleanup for up to 50 assets).
- Blob cleanup success rate > 99.5% over a 30-day rolling window.
- Zero user-reported incidents of releases surviving tag-based deletion attempts over a 90-day period.
- Tag-delete endpoint adoption: at least 30% of all release deletions use the tag-based endpoint within 60 days of launch.

## Observability

### Logging Requirements

| Log Event                                       | Level   | Structured Context                                                                                         |
|-------------------------------------------------|---------|-------------------------------------------------------------------------------------------------------------|
| Release tag delete request received             | `info`  | `owner`, `repo`, `tag_name`, `actor_id`, `request_id`                                                     |
| Tag validated successfully                      | `debug` | `tag_name`, `tag_length`, `request_id`                                                                     |
| Release resolved for tag delete                 | `debug` | `release_id`, `repository_id`, `tag_name`, `was_draft`, `asset_count`, `request_id`                       |
| Release deleted by tag successfully             | `info`  | `release_id`, `repository_id`, `tag_name`, `was_draft`, `asset_count`, `actor_id`, `duration_ms`, `request_id` |
| Asset blob deleted during tag cleanup           | `debug` | `release_id`, `asset_id`, `gcs_key`, `request_id`                                                         |
| Asset blob cleanup failed during tag delete     | `warn`  | `release_id`, `asset_id`, `gcs_key`, `error_message`, `request_id`                                        |
| All asset blobs cleaned (tag delete)            | `info`  | `release_id`, `tag_name`, `asset_count`, `cleaned_count`, `failed_count`, `cleanup_duration_ms`, `request_id` |
| Release not found for tag delete                | `warn`  | `owner`, `repo`, `tag_name`, `actor_id`, `request_id`                                                     |
| Permission denied for tag delete                | `warn`  | `owner`, `repo`, `tag_name`, `actor_id`, `resolved_permission`, `request_id`                              |
| Authentication missing for tag delete           | `warn`  | `owner`, `repo`, `tag_name`, `request_id`                                                                 |
| Empty tag name in delete request                | `warn`  | `owner`, `repo`, `request_id`                                                                             |
| Tag validation failed (control chars / too long)| `warn`  | `owner`, `repo`, `tag_name_length`, `validation_code` (invalid/too_long), `actor_id`, `request_id`        |
| SSE notification emitted for tag deletion       | `debug` | `repository_id`, `release_id`, `tag_name`, `action` (deleted), `request_id`                               |
| SSE notification failed for tag deletion        | `error` | `repository_id`, `release_id`, `tag_name`, `error_message`, `request_id`                                  |
| Database error during tag delete                | `error` | `owner`, `repo`, `tag_name`, `actor_id`, `error_message`, `stack_trace`, `request_id`                     |

### Prometheus Metrics

| Metric Name                                                  | Type      | Labels                                      | Description                                                               |
|--------------------------------------------------------------|-----------|----------------------------------------------|---------------------------------------------------------------------------|
| `codeplane_release_tag_delete_total`                         | Counter   | `status` (success/error), `error_code`       | Total tag-based release delete attempts                                   |
| `codeplane_release_tag_delete_duration_seconds`              | Histogram | `status`                                     | End-to-end tag-delete latency including blob cleanup (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0) |
| `codeplane_release_tag_delete_assets_cleaned_total`          | Counter   | `status` (success/failed)                    | Individual asset blob cleanup outcomes from tag-based deletions           |
| `codeplane_release_tag_delete_blob_cleanup_duration_seconds` | Histogram | —                                            | Duration of blob cleanup phase only (buckets: 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0) |
| `codeplane_release_tag_delete_validation_failures_total`     | Counter   | `code` (missing_field/too_long/invalid)      | Tag validation failures by type                                           |
| `codeplane_release_tag_delete_sse_notifications_total`       | Counter   | `status` (success/error)                     | SSE notifications emitted for tag-based deletions                         |

### Alerts

#### Alert: Release Tag Delete Error Rate Spike
- **Condition:** `rate(codeplane_release_tag_delete_total{status="error", error_code!~"404|422"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check structured logs for `Release tag delete request received` and `Database error during tag delete` entries in the last 10 minutes.
  2. If errors are `403` heavy: check if a permission-related change was recently deployed (role resolution, team assignment changes). Verify `requireWriteAccess()` is functioning correctly by testing with a known write-access user.
  3. If errors are `500` heavy: check database connectivity — run `SELECT 1` against the primary database. Check connection pool stats via the health endpoint.
  4. Correlate error timestamps with recent deployments using `git log --oneline --since="30 minutes ago"` on the deployment branch.
  5. If errors are isolated to a specific repository, check that repository's state (is it being transferred, archived, or deleted concurrently?).
  6. If blob storage errors are surfacing as 500s (they shouldn't, since they're swallowed): check the error handling in `deleteReleaseByTag` to confirm blob errors are properly caught.

#### Alert: Release Tag Delete Latency Spike
- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_tag_delete_duration_seconds_bucket[5m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. Determine whether latency is in the database phase or blob cleanup phase by comparing `codeplane_release_tag_delete_duration_seconds` with `codeplane_release_tag_delete_blob_cleanup_duration_seconds`.
  2. If database-bound: check for lock contention on the `releases` table via `SELECT * FROM pg_locks WHERE NOT granted`. Run `EXPLAIN ANALYZE` on `DELETE FROM releases WHERE repository_id = $1 AND tag_name = $2` with sample parameters. Check for table bloat.
  3. If blob-bound: check if a release with many large assets is being deleted. The blob cleanup iterates sequentially, so 50 assets with a slow storage backend will compound.
  4. Check blob storage backend health (disk I/O for local, API latency for cloud storage).
  5. If the issue is isolated to a single repository, inspect its release/asset counts for anomalies.

#### Alert: Tag Delete Blob Cleanup Failure Rate
- **Condition:** `rate(codeplane_release_tag_delete_assets_cleaned_total{status="failed"}[1h]) / rate(codeplane_release_tag_delete_assets_cleaned_total[1h]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check blob store health: disk space (local), API errors (cloud), network connectivity.
  2. Review `Asset blob cleanup failed during tag delete` log entries for common error patterns (permission denied, not found, timeout).
  3. If errors are ENOENT (not found): this is expected for already-cleaned blobs. Verify it's not masking a deeper issue by checking the blob storage directory structure.
  4. If errors are permission-based: check filesystem permissions or cloud IAM policies for the blob store service account.
  5. Note: blob cleanup failures do NOT affect user experience (the release is still deleted from the database). This alert is for storage hygiene monitoring only.
  6. If the failure rate is sustained, schedule a manual blob reconciliation job to identify and clean orphaned blobs.

#### Alert: Tag Delete Availability Drop
- **Condition:** `sum(rate(codeplane_release_tag_delete_total{error_code=~"5.."}[5m])) / sum(rate(codeplane_release_tag_delete_total[5m])) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Immediately check the `/health` endpoint and database connectivity.
  2. Check for OOM kills or process crashes via system journal (`journalctl -u codeplane`).
  3. Verify the release service is initialized in the service registry (check startup logs for service initialization sequence).
  4. If the issue is database-specific: check for schema migration issues, table locks, or replication lag.
  5. If the issue affects all mutating endpoints (not just tag-delete): escalate as a platform-wide incident.
  6. Roll back the most recent deployment if error timestamps correlate with deploy time.
  7. If the issue is isolated to tag-delete only (not by-ID delete): inspect the wildcard route handler for parsing errors and check if a recent Hono upgrade changed wildcard behavior.

#### Alert: Tag Validation Failure Spike
- **Condition:** `rate(codeplane_release_tag_delete_validation_failures_total[5m]) > 1`
- **Severity:** Info
- **Runbook:**
  1. Check if a specific client or actor is sending malformed tag names repeatedly (possible automation bug or fuzzing attempt).
  2. Review `Tag validation failed` log entries for the `actor_id` and `tag_name_length` to identify the source.
  3. If the failures are `too_long` type: a client may be constructing tag names incorrectly. Check recent CLI or SDK updates.
  4. If the failures are `invalid` (control chars): this may indicate a client encoding issue or an intentional injection attempt. Review the source IP and actor for abuse patterns.
  5. No immediate action required unless the volume suggests a coordinated attack or a broken client release.

### Error Cases and Failure Modes

| Error Case                                    | HTTP Status | User-Facing Message                           | Internal Log Level | Recovery                                              |
|-----------------------------------------------|-------------|-----------------------------------------------|-------------------|-------------------------------------------------------|
| Empty tag name (after path extraction)        | 400         | `"release tag is required"`                   | `warn`            | User provides a non-empty tag name                    |
| Tag with control characters                   | 422         | Validation error (`invalid`)                  | `warn`            | User provides a tag without control characters        |
| Tag exceeding 255 characters                  | 422         | Validation error (`too_long`)                 | `warn`            | User provides a shorter tag name                      |
| Not authenticated                             | 401         | `"authentication required"`                   | `warn`            | User authenticates via session, PAT, or OAuth         |
| No write access (public repo)                 | 403         | `"forbidden"`                                 | `warn`            | User requests write access from repo owner            |
| No access (private repo)                      | 404         | `"repository not found"`                      | `warn`            | User gains access or verifies repo exists             |
| Repository not found                          | 404         | `"repository not found"`                      | `warn`            | User verifies owner/repo spelling                     |
| Release not found for tag                     | 404         | `"release not found"`                         | `warn`            | User verifies tag name; release may already be gone   |
| Database connection failure                   | 500         | `"Internal server error"`                     | `error`           | Retry; alert fires; ops investigates                  |
| Blob storage unavailable during cleanup       | N/A         | (transparent — release still deleted)         | `warn`            | Orphaned blobs cleaned later by reconciliation job    |
| SSE notification failure                      | N/A         | (transparent — deletion still succeeds)       | `error`           | SSE manager auto-recovers; subscribers may miss event |
| Concurrent delete of same release by tag      | 404 (2nd)   | `"release not found"`                         | `warn`            | Expected race condition; no action needed             |

## Verification

### API Integration Tests

- [ ] **Delete a release by tag (happy path).** Create a release with tag `v1.0.0`, `DELETE /api/repos/:owner/:repo/releases/tags/v1.0.0`, verify 204 response with empty body. `GET` the same release by tag, verify 404.
- [ ] **Delete a release by tag, verify gone by ID.** Create a release, note its ID, delete by tag, `GET` by ID and verify 404.
- [ ] **Delete removes release from list.** Create releases `v1.0.0`, `v2.0.0`, `v3.0.0`. Delete `v2.0.0` by tag. List releases and verify only `v1.0.0` and `v3.0.0` remain.
- [ ] **Delete by tag updates X-Total-Count.** List releases and note count. Delete one by tag. List again and verify count decreased by 1.
- [ ] **Delete a release with assets by tag.** Create a release, upload 2 assets, DELETE by tag, verify 204. Verify both asset download URLs return 404.
- [ ] **Delete a release with maximum assets (50) by tag.** Create a release, upload 50 assets, DELETE by tag, verify 204 and all 50 asset downloads return 404.
- [ ] **Delete a release with zero assets by tag.** Create a release with no uploads, DELETE by tag, verify 204.
- [ ] **Delete by tag updates latest release.** Create `v1.0.0`, create `v2.0.0`. Verify latest is `v2.0.0`. Delete `v2.0.0` by tag. Verify latest is now `v1.0.0`.
- [ ] **Delete the only release by tag leaves latest empty.** Create one release, delete by tag, verify `GET /releases/latest` returns 404.
- [ ] **Delete a draft release by tag.** Create a draft release, DELETE by tag, verify 204.
- [ ] **Delete a prerelease by tag.** Create a prerelease, DELETE by tag, verify 204.
- [ ] **Delete a draft+prerelease by tag.** Create a release with both flags, DELETE by tag, verify 204.
- [ ] **Delete a tag-only release by tag.** Create a tag-only release (is_tag: true), DELETE by tag, verify 204.
- [ ] **SSE notification for non-draft tag deletion.** Subscribe to the release SSE channel, delete a published release by tag, verify an event with action `"deleted"` is received containing the release data.
- [ ] **No SSE notification for draft tag deletion.** Subscribe to the release SSE channel, delete a draft release by tag, verify no event is received within 2 seconds.
- [ ] **Delete by tag — unauthenticated.** DELETE without auth, verify 401 with `"authentication required"`.
- [ ] **Delete by tag — read-only collaborator.** Authenticate as read-only collaborator, DELETE, verify 403.
- [ ] **Delete by tag — write-access collaborator.** Authenticate as write collaborator, DELETE, verify 204.
- [ ] **Delete by tag — repository owner.** Authenticate as repo owner, DELETE, verify 204.
- [ ] **Delete by tag — organization admin.** Authenticate as org admin, DELETE, verify 204.
- [ ] **Delete by tag on non-existent repository.** DELETE against non-existent `owner/repo`, verify 404.
- [ ] **Delete by non-existent tag.** DELETE `/releases/tags/nonexistent-v99.99.99`, verify 404 with `"release not found"`.
- [ ] **Delete by empty tag.** DELETE `/releases/tags/` (empty tag segment), verify 400 with `"release tag is required"`.
- [ ] **Delete by tag at maximum length (255 chars).** Create a release with a 255-character tag, DELETE by tag, verify 204.
- [ ] **Delete by tag exceeding maximum length (256 chars).** DELETE with a 256-character tag, verify 422 with validation error `too_long`.
- [ ] **Delete by tag with control characters.** DELETE with tag containing `\x00`, verify 422 with validation error `invalid`.
- [ ] **Delete by tag with null byte mid-string.** DELETE with tag `v1\x00.0`, verify 422.
- [ ] **Delete by tag with DEL character (U+007F).** DELETE with tag containing `\x7f`, verify 422.
- [ ] **Delete by tag with C1 control character (U+0080).** DELETE with tag containing `\x80`, verify 422.
- [ ] **Delete by tag with URL-encoded plus sign.** Create release with tag `v1.0.0+build.1`, DELETE with properly encoded tag (`v1.0.0%2Bbuild.1`), verify 204.
- [ ] **Delete by tag with forward slash.** Create release with tag `release/v1`, DELETE `/releases/tags/release/v1` (captured by wildcard), verify 204.
- [ ] **Delete by tag with @ symbol.** Create release with tag `release@2026`, DELETE with encoded tag, verify 204.
- [ ] **Delete by tag with unicode characters.** Create release with tag `v1.0.0-über`, DELETE by tag, verify 204.
- [ ] **Delete by tag with only whitespace.** DELETE with tag `   ` (spaces only), verify 400 or 422 (trimmed to empty).
- [ ] **Delete by tag with leading/trailing whitespace.** Create release with tag `v1.0.0`, DELETE with tag ` v1.0.0 ` (padded), verify 204 (service trims before lookup).
- [ ] **Concurrent delete of the same release by tag.** Issue two DELETE requests simultaneously for the same tag. Verify one returns 204 and the other returns 404.
- [ ] **Delete on private repository without access by tag.** Create a private repo with a release, DELETE as an unauthenticated user, verify 404 (not 403).
- [ ] **Delete on private repository with write access by tag.** Create a private repo, add collaborator with write access, DELETE as collaborator, verify 204.
- [ ] **Idempotency: delete same tag twice.** DELETE a release by tag (204), then DELETE the same tag again (404).
- [ ] **Delete by tag does not affect other releases.** Create `v1.0.0` and `v2.0.0`. Delete `v1.0.0` by tag. GET `v2.0.0` and verify it is fully intact with all metadata and assets.
- [ ] **Response body is empty on 204.** Verify the response body is literally empty (zero bytes, no JSON, no whitespace).
- [ ] **Tag name is freed after deletion.** Delete release with tag `v1.0.0`, then create a new release with tag `v1.0.0`, verify it succeeds.
- [ ] **Numeric tag name resolves to tag (not ID).** Create a release with tag `42`, DELETE `/releases/tags/42`, verify 204. Verify that if release with ID 42 exists for a different tag, it is NOT deleted.

### CLI E2E Tests

- [ ] **`codeplane release delete <tag> --repo OWNER/REPO`** — Delete by non-numeric tag name, verify "Deleted release v1.0.0" message.
- [ ] **`codeplane release delete <tag> --repo OWNER/REPO --json`** — Verify explicit JSON output `{ "status": "deleted", "release": "v1.0.0" }`.
- [ ] **`codeplane release delete <numeric-tag> --repo OWNER/REPO`** — Delete where tag is `42` (numeric string), verify ID-first-then-tag fallback succeeds.
- [ ] **`codeplane release delete <tag>` (from repo directory, no `--repo`)** — Verify automatic repo resolution succeeds.
- [ ] **`codeplane release delete "v1.0.0+build.42" --repo OWNER/REPO`** — Verify special characters are URL-encoded correctly by the CLI.
- [ ] **`codeplane release delete nonexistent-tag --repo OWNER/REPO`** — Verify clear error message for 404.
- [ ] **`codeplane release delete <tag> --repo OWNER/REPO` as read-only user** — Verify 403 error message.
- [ ] **`codeplane release delete <tag> --repo OWNER/REPO` unauthenticated** — Verify 401 error message.
- [ ] **Create via CLI, delete by tag via CLI, then list.** Create a release, delete it by tag, list releases and verify it's absent.
- [ ] **Create with assets via CLI, delete by tag via CLI.** Upload assets, delete by tag, verify assets are also gone.
- [ ] **Delete by tag via CLI, verify gone via API.** Delete a release via `codeplane release delete v1.0.0`, then `GET /releases/tags/v1.0.0` via API and verify 404.

### Web UI E2E Tests (Playwright)

- [ ] **Delete from release detail page, then verify tag lookup returns 404.** Navigate to release detail, click delete, confirm, verify redirect. Then hit the tag-based API endpoint directly and confirm 404.
- [ ] **Navigate to release via tag-based URL, then delete.** Navigate to a release using a tag-based deep link, verify the detail page loads, click delete, confirm, verify the tag-based API returns 404 after deletion.

### Cross-Client Consistency Tests

- [ ] **Create via API, delete by tag via CLI.** Create a release via the API, delete it by tag via CLI, verify it's gone via API (both by-ID and by-tag return 404).
- [ ] **Create via CLI, delete by tag via API.** Create a release via CLI, delete by tag via the API endpoint, verify it's gone via CLI (`release list` output).
- [ ] **Create via CLI with assets, delete by tag via API.** Create release and upload assets via CLI, delete by tag via API, verify both release and assets are gone across all clients.
- [ ] **Delete by tag via CLI, verify SSE notification received.** Subscribe to SSE release channel via API, delete a non-draft release by tag via CLI, verify the SSE `"deleted"` event is received.
- [ ] **Delete by tag via API, verify CLI list reflects deletion.** List releases via CLI (note count), delete one by tag via API, list again via CLI, verify count decreased.

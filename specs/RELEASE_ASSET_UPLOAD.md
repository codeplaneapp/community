# RELEASE_ASSET_UPLOAD

Specification for RELEASE_ASSET_UPLOAD.

## High-Level User POV

When a Codeplane user publishes a release, they typically want to distribute compiled binaries, tarballs, ZIP archives, checksums, and other distribution artifacts alongside the release notes. The release asset upload feature is what makes this possible — it lets maintainers attach files to any release so that consumers can discover and download them from a single, authoritative location.

From the web UI, a maintainer navigates to a release's detail page and clicks the "Upload asset" button. A file picker opens, the user selects a file from their local machine, and the upload begins. A progress indicator shows the transfer status. Once the upload completes, the asset appears in the release's asset list with its file name, size, and content type. The maintainer can upload multiple files sequentially or in parallel, up to 50 assets per release. Each file can be up to 2 GiB in size. If the maintainer realizes they uploaded the wrong file or a filename was unclear, they can rename or delete individual assets without affecting the rest of the release.

From the CLI, a maintainer runs `codeplane release upload <release> <file>` to attach a local file to an existing release. The CLI automatically infers the content type from the file extension, reads the file, uploads it to the server, and confirms the upload — all in a single command. The maintainer can override the asset name and content type with flags if the defaults are not correct. This is especially valuable for CI/CD pipelines that build release artifacts and need to attach them to a release as part of an automated workflow.

From the API, integrators and agents use a three-phase workflow: first, they POST asset metadata (name, size, content type) to receive a signed upload URL and an asset record; second, they PUT the file contents to the signed upload URL; third, they POST a confirmation to transition the asset to a downloadable state. This two-phase design means the server never has to hold the full file in memory during the HTTP request, and the upload is resumable if the connection drops between phases.

The overall experience is designed so that attaching distribution files to a release feels fast, reliable, and consistent across every Codeplane client — web, CLI, API, and TUI.

## Acceptance Criteria

## Definition of Done

- [ ] Authenticated users with write access to a repository can upload an asset file to any release in that repository.
- [ ] The upload follows a three-phase workflow: (1) create asset metadata and receive a signed upload URL, (2) PUT the file to the signed upload URL, (3) confirm the upload to transition the asset from `pending` to `ready`.
- [ ] After confirmation, the asset is immediately visible to all users with read access to the repository and is downloadable.
- [ ] Pending assets (created but not yet confirmed) are visible only to users with write access.
- [ ] The feature works identically across API, CLI, Web UI, and TUI clients.
- [ ] SSE notifications are emitted for non-draft releases when an asset upload is confirmed.

## Edge Cases

- [ ] Uploading an asset with the same name as an existing asset on the same release returns HTTP 409 Conflict.
- [ ] Uploading to a release that has already reached the 50-asset limit returns HTTP 400 Bad Request with a clear message.
- [ ] Creating an asset record (phase 1) but never completing the upload leaves the asset in `pending` status. Pending assets do not block subsequent uploads or release operations.
- [ ] Confirming an upload when the blob does not exist in storage (e.g., the PUT was never completed) returns HTTP 400 Bad Request.
- [ ] Confirming an upload when the actual blob size does not match the declared size returns HTTP 400 Bad Request.
- [ ] Attempting to confirm an asset that is already in `ready` status returns an appropriate error (idempotency guard).
- [ ] Uploading an asset with an empty file (0 bytes) is rejected at the metadata creation phase with HTTP 422.
- [ ] Uploading a file that exceeds 2 GiB (2,147,483,648 bytes) is rejected at the metadata creation phase with HTTP 422.
- [ ] An asset name that is empty or contains only whitespace is rejected with HTTP 422.
- [ ] An asset name containing path separators (`/`, `\`) is rejected with HTTP 422.
- [ ] An asset name containing control characters (ASCII 0–31, 127) is rejected with HTTP 422.
- [ ] A signed upload URL that has expired (past the 5-minute window) rejects the PUT with an appropriate error.
- [ ] An invalid or tampered signed upload URL token rejects the PUT with an appropriate error.
- [ ] Uploading to a draft release succeeds (draft releases can have assets).
- [ ] Uploading to a release the user does not have write access to returns HTTP 403/404.
- [ ] Uploading to a non-existent release returns HTTP 404.
- [ ] Uploading to a non-existent repository returns HTTP 404.
- [ ] If blob storage is temporarily unavailable, the metadata creation (phase 1) still succeeds (it only writes to the database), but confirmation (phase 3) will fail with an appropriate error.
- [ ] Multiple concurrent uploads to the same release do not interfere with each other, even if they happen to have similar timing.

## Boundary Constraints

- [ ] Maximum asset file size: 2 GiB (2,147,483,648 bytes).
- [ ] Minimum asset file size: 1 byte.
- [ ] Maximum assets per release: 50.
- [ ] Maximum asset name length: 255 characters.
- [ ] Minimum asset name length: 1 character.
- [ ] Asset name must not contain path separators (`/`, `\`), control characters (ASCII 0–31 and 127), or be empty/whitespace-only.
- [ ] Asset names may contain Unicode characters, spaces, dots, hyphens, underscores, parentheses, and other printable characters.
- [ ] Content type: any valid MIME type string; defaults to `application/octet-stream` if not provided.
- [ ] Signed upload URL expiry: 5 minutes (300,000 ms) by default.
- [ ] Release ID path parameter: must be a positive integer.
- [ ] Asset ID path parameter: must be a positive integer.
- [ ] Declared size must be a positive integer (no floats, no negative values, no zero).

## Design

## API Shape

### Phase 1: Create Asset Metadata

**Endpoint:** `POST /api/repos/:owner/:repo/releases/:id/assets`

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `owner` | string | Repository owner (user or organization login) |
| `repo` | string | Repository name |
| `id` | integer | Release ID |

**Authentication:** Required. Must have write access to the repository.

**Request Body:**

```json
{
  "name": "codeplane-linux-amd64.tar.gz",
  "size": 52428800,
  "content_type": "application/gzip"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Asset file name (1–255 chars, no path separators or control chars) |
| `size` | integer | Yes | File size in bytes (1 to 2,147,483,648) |
| `content_type` | string | No | MIME type; defaults to `application/octet-stream` |

**Success Response (201):**

```json
{
  "asset": {
    "id": 101,
    "name": "codeplane-linux-amd64.tar.gz",
    "size": 52428800,
    "content_type": "application/gzip",
    "status": "pending",
    "download_count": 0,
    "confirmed_at": null,
    "created_at": "2026-03-22T12:00:00Z",
    "updated_at": "2026-03-22T12:00:00Z"
  },
  "upload_url": "/api/blobs/upload/repos%2F123%2Freleases%2F456%2Fassets%2F101%2Fcodeplane-linux-amd64.tar.gz?token=abc123&expires=1711186200000"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `400` | Invalid release ID (non-numeric) | `{ "message": "invalid release id" }` |
| `400` | Max assets (50) exceeded | `{ "message": "maximum assets per release reached" }` |
| `401` | Not authenticated | `{ "message": "authentication required" }` |
| `403` | No write access | `{ "message": "forbidden" }` |
| `404` | Repository or release not found | `{ "message": "not found" }` |
| `409` | Duplicate asset name on this release | `{ "message": "asset with this name already exists" }` |
| `422` | Invalid name, size, or content type | `{ "message": "<validation detail>" }` |

### Phase 2: Upload File to Signed URL

**Endpoint:** `PUT <upload_url>` (the signed URL returned in Phase 1)

The client PUTs the raw file body to the signed upload URL. This is a direct blob store write.

**Request Headers:**

| Header | Value |
|---|---|
| `Content-Type` | The asset's MIME type (should match what was declared) |

**Request Body:** Raw binary file contents.

**Success Response:** `200 OK`

**Error Responses:**

| Status | Condition |
|---|---|
| `400` | Invalid or expired token |
| `413` | Request body exceeds declared size |

### Phase 3: Confirm Upload

**Endpoint:** `POST /api/repos/:owner/:repo/releases/:id/assets/:asset_id/confirm`

**Authentication:** Required. Must have write access.

**Request Body:** None.

**Success Response (200):**

```json
{
  "id": 101,
  "name": "codeplane-linux-amd64.tar.gz",
  "size": 52428800,
  "content_type": "application/gzip",
  "status": "ready",
  "download_count": 0,
  "confirmed_at": "2026-03-22T12:05:00Z",
  "created_at": "2026-03-22T12:00:00Z",
  "updated_at": "2026-03-22T12:05:00Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `400` | Blob does not exist in storage | `{ "message": "asset blob not found" }` |
| `400` | Blob size does not match declared size | `{ "message": "asset size mismatch" }` |
| `400` | Asset is already confirmed | `{ "message": "asset already confirmed" }` |
| `400` | Invalid release ID or asset ID | `{ "message": "invalid release id" }` / `{ "message": "invalid release asset id" }` |
| `401` | Not authenticated | `{ "message": "authentication required" }` |
| `403` | No write access | `{ "message": "forbidden" }` |
| `404` | Release, asset, or repository not found | `{ "message": "not found" }` |

### Response Field Reference

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique asset identifier |
| `name` | string | Asset file name |
| `size` | number | File size in bytes |
| `content_type` | string | MIME type of the asset |
| `status` | string | `"pending"` (upload in progress) or `"ready"` (download available) |
| `download_count` | number | Total download count (always 0 when first created) |
| `confirmed_at` | string \| null | ISO 8601 timestamp of confirmation; null while pending |
| `created_at` | string | ISO 8601 timestamp of asset record creation |
| `updated_at` | string | ISO 8601 timestamp of last modification |

## SDK Shape

The `ReleaseService.attachAsset` method is the authoritative service contract for Phase 1:

```typescript
async attachAsset(
  actor: AuthUser,
  owner: string,
  repo: string,
  releaseID: number,
  input: ReleaseAssetUploadInput
): Promise<{ asset: ReleaseAssetResponse; upload_url: string }>
```

`ReleaseAssetUploadInput`:

```typescript
interface ReleaseAssetUploadInput {
  name: string;        // 1–255 chars, no path separators or control chars
  size: number;        // 1 to 2,147,483,648 bytes
  contentType?: string; // defaults to "application/octet-stream"
}
```

The `ReleaseService.confirmAssetUpload` method is the authoritative contract for Phase 3:

```typescript
async confirmAssetUpload(
  actor: AuthUser,
  owner: string,
  repo: string,
  releaseID: number,
  assetID: number
): Promise<ReleaseAssetResponse>
```

Behavior:
- `attachAsset` validates input, creates a database record with `status: 'pending'`, generates a blob storage key, and returns a signed upload URL with a 5-minute expiry.
- `confirmAssetUpload` verifies the blob exists in storage, checks that the actual file size matches the declared size, transitions the asset to `status: 'ready'`, sets `confirmed_at`, and emits an SSE notification for non-draft releases.

## CLI Command

**Command:** `codeplane release upload <release> <file>`

**Arguments:**

| Argument | Type | Description |
|---|---|---|
| `release` | string | Release ID (numeric) or tag name |
| `file` | string | Path to the local asset file |

**Flags:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--name` | string | File basename | Custom asset name |
| `--content-type` | string | Inferred from extension | Override MIME type |
| `--repo` | string | Auto-detected | Repository in `OWNER/REPO` format |

**Content type inference rules:**

| File extension | Inferred content type |
|---|---|
| `.tar.gz`, `.tgz` | `application/gzip` |
| `.zip` | `application/zip` |
| `.json` | `application/json` |
| `.txt`, `.log`, `.md` | `text/plain` |
| `.wasm` | `application/wasm` |
| All others | `application/octet-stream` |

**Workflow:**
1. Resolve the release by ID or tag name.
2. Stat the local file to get its size.
3. POST asset metadata to the API (Phase 1).
4. Read the file and PUT its contents to the signed upload URL (Phase 2).
5. POST the confirmation (Phase 3).
6. Output the confirmed asset record.

**Default output (text mode):**

```
Uploaded asset.txt (23 B) to release v1.0.0
```

**JSON output (`--json`):**

Returns the full confirmed asset object:

```json
{
  "id": 101,
  "name": "asset.txt",
  "size": 23,
  "content_type": "text/plain",
  "status": "ready",
  "download_count": 0,
  "confirmed_at": "2026-03-22T12:05:00Z",
  "created_at": "2026-03-22T12:00:00Z",
  "updated_at": "2026-03-22T12:05:00Z"
}
```

**Error states:**
- File not found or not a regular file: prints error message and exits with non-zero code.
- File exceeds 2 GiB: prints `"file too large (max 2 GiB)"` and exits with non-zero code.
- Release not found: prints error message and exits with non-zero code.
- Upload URL PUT fails: prints `"asset upload failed (<status>)"` and exits with non-zero code.
- Confirmation fails: prints the server error message and exits with non-zero code.

**Behavior notes:**
- The `release` argument first attempts numeric ID resolution, then falls back to tag name lookup.
- If `--repo` is not specified, the CLI infers the repository from the current working directory's jj/git remote.
- If `--name` is not specified, the CLI uses `basename(file)`.

## Web UI Design

**Location:** Release detail page (`/:owner/:repo/releases/:id`)

**Upload button:**
- An "Upload asset" button appears in the "Assets" section header, visible only to users with write access.
- The button opens a native browser file picker dialog.
- Multiple file selection is supported for batch uploads.

**Upload flow:**
1. User selects one or more files via the file picker.
2. For each file, the UI creates the asset metadata (Phase 1), then uploads the file body to the signed URL (Phase 2), then confirms (Phase 3).
3. During upload, each file shows a progress bar with file name, percentage, and size transferred.
4. Completed uploads transition to the normal asset row display with a brief success animation.
5. If an upload fails, the row shows an error state with a "Retry" button.

**Upload constraints enforced client-side:**
- File size check before starting: files > 2 GiB show an inline error and are not uploaded.
- File name validation: names with path separators or control characters are rejected with an inline error.
- Asset count check: if the release already has 50 assets, the upload button is disabled with a tooltip explaining the limit.

**Drag-and-drop:**
- The Assets section supports drag-and-drop file upload. A drop zone overlay appears when files are dragged over the section.

**Progress indicator states:**
- `Preparing` — metadata creation in progress
- `Uploading XX%` — file PUT in progress with percentage
- `Confirming` — confirmation POST in progress
- `Ready` — upload complete; asset transitions to normal row display
- `Error` — upload failed; error message and retry button shown

## TUI UI

**Screen:** Release detail screen

The TUI does not provide a file-picker-based upload flow (terminal file pickers are not practical). Instead, it shows:

- A note in the Assets section: `"Use 'codeplane release upload' to attach files."`
- Pending assets are shown with a `[pending]` status indicator for write-access users.

Users should use the CLI for asset uploads and use the TUI for browsing and inspecting the results.

## Documentation

The following end-user documentation should be written:

- **Uploading release assets (API):** REST API reference for the three-phase upload workflow. Covers the `POST .../assets` endpoint (Phase 1), the signed URL PUT (Phase 2), and the `POST .../confirm` endpoint (Phase 3). Includes full request/response schemas, error codes, and a complete working `curl` example.
- **Uploading release assets (CLI):** Reference for `codeplane release upload <release> <file>` including arguments, flags, content type inference table, and CI/CD pipeline examples.
- **Release assets overview:** Conceptual guide explaining what release assets are, the two-phase upload model (`pending` → `ready`), the 50-asset-per-release limit, the 2 GiB size limit, and how signed upload URLs work.
- **Uploading release assets (Web UI):** Guide covering the upload button, file picker, drag-and-drop, progress indicators, and error handling in the browser.
- **Troubleshooting asset uploads:** Guide covering common failure modes: expired upload URLs, size mismatches, blob storage unavailability, and how to retry failed uploads.

## Permissions & Security

## Authorization Matrix

| Role | Can create asset metadata | Can PUT to signed URL | Can confirm upload | Notes |
|---|---|---|---|---|
| Anonymous | ❌ (401) | ❌ (URL not obtainable) | ❌ (401) | Authentication required for all upload phases |
| Authenticated, no repo access (public repo) | ❌ (404) | ❌ | ❌ (404) | Write access required |
| Authenticated, no repo access (private repo) | ❌ (404) | ❌ | ❌ (404) | Repository existence not leaked |
| Read permission | ❌ (403) | ❌ | ❌ (403) | Write access required |
| Write permission | ✅ | ✅ | ✅ | Full upload capability |
| Admin permission | ✅ | ✅ | ✅ | Full upload capability |
| Repository owner | ✅ | ✅ | ✅ | Full upload capability |
| Organization owner | ✅ | ✅ | ✅ | Full upload capability |

### Draft Release Upload Permissions

Asset uploads to draft releases follow the same permission rules as any other release — write access is required. There is no additional restriction on draft releases beyond the standard write-access check.

### Signed Upload URL Security

- Signed upload URLs use HMAC-SHA256 tokens with a 5-minute expiry.
- The signing secret is configured via the `CODEPLANE_BLOB_SIGNING_SECRET` environment variable.
- Tokens encode both the blob storage key and the expiration timestamp; tampering with either invalidates the token.
- Signed URLs are single-use in intent: they correspond to a specific asset ID and blob key. Re-uploading to the same URL replaces the blob.
- Signed URLs are not scoped to a specific user — anyone who obtains a valid URL can PUT to it within the expiry window. This is acceptable because URLs are only issued to authenticated write-access users and expire quickly.

### Rate Limiting

- **Asset creation (Phase 1):** 30 requests per minute per user. Asset creation is a write operation that touches the database.
- **Signed URL PUT (Phase 2):** No per-user rate limit (the URL is self-expiring and single-purpose), but server-side body size limits apply (2 GiB max).
- **Confirmation (Phase 3):** 30 requests per minute per user.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in responses.
- HTTP 429 with `Retry-After` header when limits are exceeded.

### Data Privacy

- Asset file contents are user-authored and stored in the blob store. They are not inspected or scanned by the server.
- Asset names may reveal information about build targets, platforms, or internal tooling. This is considered acceptable as the names are user-authored and visible only to users with repository read access.
- The internal blob storage key (`gcs_key`) is never exposed in API responses.
- The uploader's identity is stored in the database (`uploader_id`) but is not included in the API response unless explicitly requested.
- No PII is collected or stored as part of the asset upload flow beyond the uploader's user ID.
- Private repository assets are not accessible without authentication and appropriate repository access.
- The signed upload URL contains a token but no user identity information.

## Telemetry & Product Analytics

## Business Events

| Event | Trigger | Properties |
|---|---|---|
| `ReleaseAssetUploadStarted` | Asset metadata is created (Phase 1 completes) | `repository_id`, `owner`, `repo`, `release_id`, `release_tag_name`, `asset_id`, `asset_name`, `declared_size`, `content_type`, `actor_id`, `client` (web/cli/api), `is_draft_release` |
| `ReleaseAssetUploadCompleted` | Asset upload is confirmed (Phase 3 completes) | `repository_id`, `owner`, `repo`, `release_id`, `release_tag_name`, `asset_id`, `asset_name`, `confirmed_size`, `content_type`, `actor_id`, `client`, `upload_duration_ms` (time from Phase 1 to Phase 3), `is_draft_release` |
| `ReleaseAssetUploadFailed` | Confirmation fails (blob missing or size mismatch) | `repository_id`, `owner`, `repo`, `release_id`, `asset_id`, `asset_name`, `actor_id`, `client`, `failure_reason` (`blob_not_found`, `size_mismatch`), `declared_size`, `actual_size` (if available), `is_draft_release` |
| `ReleaseAssetUploadAbandoned` | A pending asset is cleaned up without ever being confirmed (detected by the cleanup scheduler) | `repository_id`, `release_id`, `asset_id`, `asset_name`, `declared_size`, `pending_duration_ms` |

## Funnel Metrics

- **Upload completion rate:** Percentage of `ReleaseAssetUploadStarted` events followed by a `ReleaseAssetUploadCompleted` event for the same `asset_id`. A low rate indicates users are abandoning uploads or experiencing failures. Target: > 95%.
- **Upload failure rate:** Percentage of `ReleaseAssetUploadStarted` events followed by a `ReleaseAssetUploadFailed` event. Should be < 2%.
- **Upload abandonment rate:** Percentage of `ReleaseAssetUploadStarted` events that are never followed by either a `Completed` or `Failed` event (detected via the `Abandoned` event from the cleanup scheduler). Should be < 5%.
- **Mean upload duration:** Average `upload_duration_ms` from `ReleaseAssetUploadCompleted` events. Tracks how long it takes users to complete the full three-phase upload. Should be well under 60 seconds for files under 100 MB.
- **Assets per release distribution:** Histogram of the number of assets attached per release. Helps understand whether users are attaching single files or full release matrices.
- **Content type distribution:** Breakdown of `content_type` values across all completed uploads. Helps understand what users are distributing.
- **CLI vs. Web vs. API distribution:** Breakdown of uploads by `client` value. High CLI share indicates strong automation adoption.

## Success Indicators

- Upload completion rate > 95%.
- Upload failure rate < 2%.
- p95 upload duration < 30 seconds for files under 100 MB.
- > 50% of releases have at least one confirmed asset.
- CLI `release upload` command adoption grows month-over-month among automation and CI/CD users.
- Zero reports of data corruption (uploaded file contents differ from confirmed asset contents).

## Observability

## Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Asset metadata creation request received | `DEBUG` | `owner`, `repo`, `release_id`, `actor_id`, `asset_name`, `declared_size`, `content_type`, `request_id` |
| Asset metadata created successfully | `INFO` | `owner`, `repo`, `release_id`, `asset_id`, `asset_name`, `declared_size`, `content_type`, `upload_url_expiry`, `request_id` |
| Asset metadata creation rejected (validation) | `WARN` | `owner`, `repo`, `release_id`, `actor_id`, `rejection_reason`, `asset_name`, `declared_size`, `request_id` |
| Asset metadata creation rejected (limit exceeded) | `WARN` | `owner`, `repo`, `release_id`, `actor_id`, `current_count`, `max_count`, `request_id` |
| Asset metadata creation rejected (duplicate name) | `WARN` | `owner`, `repo`, `release_id`, `actor_id`, `asset_name`, `request_id` |
| Signed URL blob PUT received | `DEBUG` | `blob_key`, `content_length`, `content_type`, `request_id` |
| Signed URL blob PUT completed | `INFO` | `blob_key`, `bytes_written`, `duration_ms`, `request_id` |
| Signed URL blob PUT rejected (expired token) | `WARN` | `blob_key`, `token_expired_at`, `request_id` |
| Signed URL blob PUT rejected (invalid token) | `WARN` | `blob_key`, `request_id` |
| Confirmation request received | `DEBUG` | `owner`, `repo`, `release_id`, `asset_id`, `actor_id`, `request_id` |
| Confirmation successful | `INFO` | `owner`, `repo`, `release_id`, `asset_id`, `asset_name`, `confirmed_size`, `duration_ms`, `request_id` |
| Confirmation failed: blob not found | `WARN` | `owner`, `repo`, `release_id`, `asset_id`, `blob_key`, `request_id` |
| Confirmation failed: size mismatch | `WARN` | `owner`, `repo`, `release_id`, `asset_id`, `declared_size`, `actual_size`, `request_id` |
| Database error during asset operation | `ERROR` | `owner`, `repo`, `release_id`, `asset_id`, `operation`, `error_message`, `error_code`, `request_id` |
| Blob storage error during confirmation | `ERROR` | `owner`, `repo`, `release_id`, `asset_id`, `blob_key`, `error_message`, `request_id` |

## Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_release_asset_upload_started_total` | Counter | `status_code` | Total Phase 1 (metadata creation) requests |
| `codeplane_release_asset_upload_started_duration_seconds` | Histogram | `status_code` | Phase 1 request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_release_asset_blob_put_total` | Counter | `status_code` | Total Phase 2 (signed URL PUT) requests |
| `codeplane_release_asset_blob_put_bytes` | Histogram | — | Bytes uploaded per Phase 2 PUT (buckets: 1KB, 10KB, 100KB, 1MB, 10MB, 100MB, 500MB, 1GB, 2GB) |
| `codeplane_release_asset_blob_put_duration_seconds` | Histogram | `status_code` | Phase 2 PUT duration (buckets: 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300) |
| `codeplane_release_asset_confirm_total` | Counter | `status_code` | Total Phase 3 (confirmation) requests |
| `codeplane_release_asset_confirm_duration_seconds` | Histogram | `status_code` | Phase 3 request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_release_asset_upload_errors_total` | Counter | `error_type`, `phase` | Errors during upload (labels: `validation`, `limit_exceeded`, `duplicate_name`, `blob_not_found`, `size_mismatch`, `token_expired`, `token_invalid`, `internal`) |
| `codeplane_release_asset_pending_count` | Gauge | — | Current number of assets in `pending` status across all releases |
| `codeplane_release_asset_upload_e2e_duration_seconds` | Histogram | — | End-to-end duration from Phase 1 to Phase 3 completion (buckets: 1, 5, 10, 30, 60, 120, 300, 600) |

## Alerts

### Alert 1: Asset Upload Error Rate Spike

- **Condition:** `rate(codeplane_release_asset_upload_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check structured error logs for `release asset` entries with `ERROR` level in the last 10 minutes. Filter by `request_id` to trace individual failures.
  2. Identify whether errors are database-related (connection timeouts, query failures) or blob-storage-related (filesystem errors, disk full).
  3. If database-related: check PG connection pool status via `pg_stat_activity`. Look for lock contention on the `release_assets` table.
  4. If blob-storage-related: check disk space on the blob storage volume (`df -h $CODEPLANE_DATA_DIR`). Verify the `blobs/` directory has correct permissions.
  5. Check for recent deployments that may have changed the `attachAsset` or `confirmAssetUpload` code paths.
  6. If errors are transient, monitor for self-resolution over 15 minutes. If persistent, roll back the most recent deployment.

### Alert 2: High Pending Asset Count

- **Condition:** `codeplane_release_asset_pending_count > 100`
- **Severity:** Warning
- **Runbook:**
  1. A high pending count may indicate users are creating asset metadata but failing to complete uploads, or the cleanup scheduler is not running.
  2. Query the `release_assets` table: `SELECT count(*), min(created_at) FROM release_assets WHERE status = 'pending'`. If `min(created_at)` is older than 1 hour, the cleanup scheduler may be stuck.
  3. Verify the cleanup scheduler is running and not crashing on startup.
  4. Check if the blob store signed URL endpoint is reachable — if users cannot PUT to the signed URL, they'll create metadata but never confirm.
  5. Review `ReleaseAssetUploadFailed` telemetry events to identify the dominant failure reason.
  6. If the issue is a temporary traffic spike (many CI/CD pipelines running simultaneously), pending assets will self-resolve as uploads complete.

### Alert 3: Blob Storage Write Latency Degradation

- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_asset_blob_put_duration_seconds_bucket[5m])) > 60`
- **Severity:** Warning
- **Runbook:**
  1. Check if the latency spike correlates with increased upload volume (check `codeplane_release_asset_blob_put_total` rate).
  2. Check disk I/O metrics on the blob storage volume. High `iowait` or disk queue depth suggests the storage is saturated.
  3. Check blob sizes in recent uploads — a p95 latency spike is expected if users are uploading very large files (>1 GiB), but small files should complete in seconds.
  4. Verify no other process is competing for disk I/O on the blob storage volume.
  5. If the storage volume is on a network filesystem (NFS, EFS), check network latency and throughput.
  6. Consider whether the signed URL expiry (5 minutes) is too short for very large uploads on slow connections.

### Alert 4: Upload Completion Rate Drop

- **Condition:** `rate(codeplane_release_asset_confirm_total{status_code="200"}[30m]) / rate(codeplane_release_asset_upload_started_total{status_code="201"}[30m]) < 0.85`
- **Severity:** Warning
- **Runbook:**
  1. A completion rate below 85% means more than 15% of upload attempts are not resulting in confirmed assets.
  2. Check `ReleaseAssetUploadFailed` telemetry for the dominant failure reason (`blob_not_found` vs `size_mismatch`).
  3. If `blob_not_found` dominates: the signed URL PUT step is failing. Check blob storage availability, network connectivity, and signed URL expiry timing.
  4. If `size_mismatch` dominates: clients may be declaring incorrect sizes or the upload is being truncated. Check if a proxy or load balancer is truncating large request bodies.
  5. If neither `Failed` nor `Completed` events are firing, users are abandoning uploads. Check if the web UI progress indicator is working correctly, and if the CLI is hanging during upload.
  6. Review recent client-side (web UI, CLI) changes that may have broken the upload flow.

## Error Cases and Failure Modes

| Error Case | Phase | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|---|
| Asset name empty or whitespace | 1 | 422 | `"asset name is required"` | Provide a valid file name |
| Asset name too long (>255 chars) | 1 | 422 | `"asset name too long (max 255 characters)"` | Shorten the file name |
| Asset name contains path separators | 1 | 422 | `"asset name must not contain path separators"` | Remove `/` or `\` from name |
| Asset name contains control characters | 1 | 422 | `"asset name contains invalid characters"` | Remove control characters |
| Asset size is 0 or negative | 1 | 422 | `"asset size must be between 1 byte and 2 GiB"` | Provide a valid size |
| Asset size exceeds 2 GiB | 1 | 422 | `"asset size must be between 1 byte and 2 GiB"` | Use a smaller file |
| Max assets (50) exceeded | 1 | 400 | `"maximum assets per release reached"` | Delete existing assets first |
| Duplicate asset name | 1 | 409 | `"asset with this name already exists"` | Use a different name or delete the existing asset |
| Release not found | 1 | 404 | `"release not found"` | Verify the release ID/tag |
| No write access | 1 | 403/404 | `"forbidden"` / `"not found"` | Request write access |
| Signed URL expired | 2 | 400 | `"upload URL expired"` | Re-create the asset metadata to get a new URL |
| Invalid/tampered token | 2 | 400 | `"invalid upload token"` | Re-create the asset metadata |
| Blob not found at confirm time | 3 | 400 | `"asset blob not found"` | Re-upload the file |
| Size mismatch at confirm time | 3 | 400 | `"asset size mismatch"` | Re-upload with correct size declaration |
| Blob storage disk full | 2 | 500 | `"internal server error"` | Alert fires; ops resolves storage |
| Database unavailable | 1, 3 | 500 | `"internal server error"` | Automatic retry; alert fires |

## Verification

## API Integration Tests

### Phase 1: Create Asset Metadata

- [ ] **Successful asset creation returns 201:** POST valid metadata (name, size, content_type) to `/api/repos/:owner/:repo/releases/:id/assets`. Verify 201 response with `asset` object and `upload_url` string.
- [ ] **Created asset has status pending:** Verify `asset.status` is `"pending"` in the response.
- [ ] **Created asset has download_count 0:** Verify `asset.download_count` is `0`.
- [ ] **Created asset has null confirmed_at:** Verify `asset.confirmed_at` is `null`.
- [ ] **Created asset reflects declared name:** Verify `asset.name` matches the input name exactly.
- [ ] **Created asset reflects declared size:** Verify `asset.size` matches the input size exactly.
- [ ] **Created asset reflects declared content_type:** Verify `asset.content_type` matches the input.
- [ ] **Default content_type applied:** POST without `content_type` field. Verify `asset.content_type` is `"application/octet-stream"`.
- [ ] **Upload URL is non-empty and contains signed token:** Verify `upload_url` contains `token=` and `expires=` query parameters.
- [ ] **Asset with minimum name length (1 char):** POST `{ "name": "a", "size": 1 }`. Verify 201.
- [ ] **Asset with maximum name length (255 chars):** POST a 255-character name. Verify 201 and the full name is preserved in the response.
- [ ] **Asset with name containing spaces:** POST `{ "name": "my file (v2).tar.gz" }`. Verify 201.
- [ ] **Asset with name containing unicode:** POST `{ "name": "ビルド-v1.0.zip" }`. Verify 201.
- [ ] **Asset with name containing dots, hyphens, underscores:** POST `{ "name": "my-app_v2.0.tar.gz" }`. Verify 201.
- [ ] **Asset with minimum size (1 byte):** POST `{ "size": 1 }`. Verify 201.
- [ ] **Asset with maximum size (2 GiB):** POST `{ "size": 2147483648 }`. Verify 201.
- [ ] **Reject empty name:** POST `{ "name": "", "size": 1 }`. Verify 422.
- [ ] **Reject whitespace-only name:** POST `{ "name": "   ", "size": 1 }`. Verify 422.
- [ ] **Reject name longer than 255 chars:** POST a 256-character name. Verify 422.
- [ ] **Reject name with forward slash:** POST `{ "name": "path/file.txt" }`. Verify 422.
- [ ] **Reject name with backslash:** POST `{ "name": "path\\file.txt" }`. Verify 422.
- [ ] **Reject name with control characters:** POST `{ "name": "file\u0000.txt" }`. Verify 422.
- [ ] **Reject size of 0:** POST `{ "size": 0 }`. Verify 422.
- [ ] **Reject negative size:** POST `{ "size": -1 }`. Verify 422.
- [ ] **Reject size exceeding 2 GiB:** POST `{ "size": 2147483649 }`. Verify 422.
- [ ] **Reject non-integer size:** POST `{ "size": 1.5 }`. Verify 422 or appropriate handling.
- [ ] **Reject when max assets (50) already reached:** Create 50 assets on a release. POST a 51st. Verify 400.
- [ ] **Reject duplicate asset name:** Create an asset named `"foo.txt"`. Create another with the same name. Verify 409.
- [ ] **Reject when not authenticated:** POST without auth. Verify 401.
- [ ] **Reject when no write access:** POST as a read-only user. Verify 403 or 404.
- [ ] **Reject for non-existent release:** POST to a release ID that doesn't exist. Verify 404.
- [ ] **Reject for non-existent repository:** POST to a non-existent owner/repo. Verify 404.
- [ ] **Reject for invalid release ID (non-numeric):** POST to `/releases/abc/assets`. Verify 400.
- [ ] **Reject invalid request body (malformed JSON):** POST non-JSON body. Verify 400.
- [ ] **Upload to draft release succeeds:** Create a draft release. POST asset metadata. Verify 201.
- [ ] **Private repo returns 404 to unauthorized user:** POST as an authenticated user without repo access. Verify 404 (not 403).

### Phase 2: Signed URL PUT

- [ ] **Successful file upload via signed URL:** PUT file contents to the `upload_url` returned in Phase 1. Verify 200.
- [ ] **Expired signed URL rejected:** Wait > 5 minutes (or use a manipulated expiry). PUT to the URL. Verify rejection (400 or 403).
- [ ] **Tampered token rejected:** Modify the `token` parameter in the URL. PUT to the modified URL. Verify rejection.
- [ ] **Upload with correct Content-Type header:** Verify the PUT succeeds with the declared content type.
- [ ] **Upload of 1-byte file:** PUT a 1-byte body. Verify 200.
- [ ] **Upload of large file (e.g., 10 MB):** PUT a 10 MB body. Verify 200 and the blob is stored correctly.

### Phase 3: Confirm Upload

- [ ] **Successful confirmation transitions status to ready:** POST to `/assets/:asset_id/confirm`. Verify 200 with `status: "ready"`.
- [ ] **Confirmation sets confirmed_at:** Verify `confirmed_at` is a valid ISO 8601 timestamp.
- [ ] **Confirmation preserves other fields:** Verify `name`, `size`, `content_type`, `download_count` are unchanged after confirmation.
- [ ] **Reject confirmation when blob does not exist:** Create asset metadata but skip the PUT. POST confirm. Verify 400 with `"asset blob not found"`.
- [ ] **Reject confirmation when size does not match:** Create asset metadata with size 100, upload a file of size 50. POST confirm. Verify 400 with `"asset size mismatch"`.
- [ ] **Reject confirmation for already-confirmed asset:** Confirm an asset, then confirm again. Verify appropriate error.
- [ ] **Reject confirmation when not authenticated:** POST confirm without auth. Verify 401.
- [ ] **Reject confirmation with no write access:** POST confirm as a read-only user. Verify 403 or 404.
- [ ] **Reject confirmation for non-existent asset:** POST confirm for an asset ID that doesn't exist. Verify 404.
- [ ] **Reject confirmation for invalid asset ID:** POST to `/assets/abc/confirm`. Verify 400.

### End-to-End Upload Flow

- [ ] **Full three-phase upload flow:** Create metadata → PUT file → Confirm. Verify the asset appears in the asset list with `status: "ready"` and correct `size`, `name`, `content_type`.
- [ ] **Upload and download verify data integrity:** Upload a known file, confirm, get download URL, download the file, verify SHA-256 checksum matches the original.
- [ ] **Multiple assets uploaded to the same release:** Upload 3 different files. Verify all 3 appear in the asset list with correct data.
- [ ] **Upload to a release with existing assets:** Upload 2 assets, confirm both. Upload a 3rd. Verify all 3 are listed.
- [ ] **Concurrent uploads to the same release:** Start 5 upload flows simultaneously. Verify all 5 complete without errors or data corruption.
- [ ] **SSE notification emitted on confirm for non-draft release:** Subscribe to SSE, confirm an asset on a published release. Verify an `updated` event is received.
- [ ] **No SSE notification for draft release:** Confirm an asset on a draft release. Verify no SSE event is emitted.
- [ ] **Upload exactly 50 assets (maximum):** Upload and confirm 50 assets. Verify all 50 appear in the list and a 51st creation attempt fails with 400.

## CLI Integration Tests

- [ ] **`release upload <id> <file>` succeeds:** Create a release, create a temp file. Run `codeplane release upload <id> <file> --repo OWNER/REPO`. Verify exit code 0.
- [ ] **Upload output shows confirmed asset in JSON mode:** Run with `--json`. Verify output is valid JSON with `status: "ready"`, `download_count: 0`, and correct `name` and `size`.
- [ ] **Upload uses file basename as default name:** Upload `/tmp/mydir/artifact.tar.gz`. Verify asset name is `"artifact.tar.gz"`.
- [ ] **`--name` flag overrides asset name:** Run with `--name custom-name.bin`. Verify the uploaded asset has name `"custom-name.bin"`.
- [ ] **`--content-type` flag overrides inferred type:** Run with `--content-type application/x-custom`. Verify the asset has that content type.
- [ ] **Content type inferred for .tar.gz:** Upload a `.tar.gz` file. Verify `content_type` is `"application/gzip"`.
- [ ] **Content type inferred for .zip:** Upload a `.zip` file. Verify `content_type` is `"application/zip"`.
- [ ] **Content type inferred for .txt:** Upload a `.txt` file. Verify `content_type` is `"text/plain"`.
- [ ] **Content type inferred for .wasm:** Upload a `.wasm` file. Verify `content_type` is `"application/wasm"`.
- [ ] **Content type defaults to octet-stream for unknown extensions:** Upload a `.xyz` file. Verify `content_type` is `"application/octet-stream"`.
- [ ] **Upload by tag name:** Run `codeplane release upload v1.0.0 <file>`. Verify success.
- [ ] **Upload by numeric ID:** Run `codeplane release upload 42 <file>`. Verify success.
- [ ] **Error when file does not exist:** Run with a non-existent file path. Verify non-zero exit code and clear error message.
- [ ] **Error when path is a directory:** Run with a directory path. Verify non-zero exit code and `"not a file"` error.
- [ ] **Error when release does not exist:** Run with a non-existent release ID/tag. Verify non-zero exit code.
- [ ] **Error when no write access:** Run as a user without write access. Verify non-zero exit code.
- [ ] **Repo auto-detected from jj/git remote:** Inside a repo directory, run without `--repo`. Verify the correct repository is used.
- [ ] **Upload followed by download verifies data integrity:** Upload a file, then use `codeplane api` to get the download URL. Download and compare checksums.
- [ ] **Download count increments after download:** Upload an asset, download it via the download endpoint, then verify `download_count` is 1 via `release view --json`.

## Web UI E2E Tests (Playwright)

- [ ] **Upload button visible for write-access users:** Log in as repo admin. Navigate to release detail. Verify "Upload asset" button is present in the Assets section.
- [ ] **Upload button hidden for read-only users:** Log in as read-only user. Navigate to release detail. Verify no upload button is shown.
- [ ] **Upload button hidden for unauthenticated users:** Navigate to a public release without auth. Verify no upload button.
- [ ] **File picker opens on upload button click:** Click the upload button. Verify a file selection dialog is triggered (or mock the file input).
- [ ] **Upload progress indicator shown:** Select a file for upload. Verify a progress indicator appears with the file name.
- [ ] **Upload completes and asset appears in list:** Upload a file. Wait for confirmation. Verify the asset row appears in the asset list with correct name, size, and `ready` status.
- [ ] **Multiple files uploaded sequentially:** Upload 3 files. Verify all 3 appear in the asset list.
- [ ] **Upload error displays error message:** Intercept the API to return 422 on asset creation. Trigger upload. Verify an error message is displayed.
- [ ] **Upload button disabled when 50 assets reached:** Create a release with 50 assets (via API setup). Navigate to the release. Verify the upload button is disabled with an appropriate tooltip.
- [ ] **Drag-and-drop upload:** Simulate a file drop event on the Assets section. Verify the upload flow begins.
- [ ] **Pending asset shows uploading badge:** Begin an upload but intercept the confirm call. Verify the asset shows with a "Uploading" or "Pending" status badge.
- [ ] **Asset appears correctly after page refresh:** Upload an asset, refresh the page. Verify the asset is still listed with `ready` status.

## TUI Integration Tests

- [ ] **TUI release detail shows upload guidance:** Open release detail in TUI. Verify a message like `"Use 'codeplane release upload' to attach files"` is visible.
- [ ] **TUI shows pending assets for write users:** Upload an asset (via CLI or API) without confirming. Open release detail in TUI as a write-access user. Verify the pending asset is visible with `[pending]` indicator.
- [ ] **TUI hides pending assets for read-only users:** Same setup, but view as read-only user. Verify pending assets are not shown.
- [ ] **TUI shows confirmed assets correctly:** Upload and confirm an asset. Open release detail in TUI. Verify the asset row displays name, size, content type, status, and download count.

## Cross-Client Consistency Tests

- [ ] **Asset uploaded via CLI is visible in Web UI:** Upload via `codeplane release upload`. Navigate to the release in the web browser. Verify the asset appears.
- [ ] **Asset uploaded via Web UI is visible in CLI:** Upload via the web UI. Run `codeplane release assets <release> --json`. Verify the asset appears.
- [ ] **Asset uploaded via API is visible in TUI:** Upload via direct API calls. Open the release in TUI. Verify the asset appears.
- [ ] **Download count consistent across clients:** Download an asset via API. Verify the count is reflected in CLI, Web UI, and TUI.

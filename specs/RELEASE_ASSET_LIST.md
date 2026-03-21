# RELEASE_ASSET_LIST

Specification for RELEASE_ASSET_LIST.

## High-Level User POV

When a Codeplane repository publishes a release, it typically includes one or more downloadable assets — compiled binaries, tarballs, ZIP archives, checksums, or other distribution artifacts. The release asset list is the surface that lets users discover, inspect, and access every file attached to a specific release.

From the web UI, a user navigates to a release's detail page and sees the list of assets displayed below the release notes. Each asset shows its file name, size, content type, and download count. Users can click an asset to download it. Maintainers with write access also see assets that are still uploading (pending confirmation), giving them visibility into in-progress uploads before they become publicly visible.

From the CLI, users run `codeplane release assets <release>` to see all assets attached to a given release. The output is a clean table of asset names, sizes, and statuses in text mode, or a full JSON array for scripting and automation. This is especially useful for CI/CD pipelines that need to enumerate a release's artifacts before deciding which to download, or for agent-driven workflows that need to discover available binaries programmatically.

From the API, consumers call a single endpoint to retrieve the full asset manifest for a release. This is the machine-readable foundation for download pages, badge services, package managers, and any automation that needs to know what files a release contains and how to download them.

The release asset list is intentionally scoped to a single release. Users who want to see assets across all releases should use the release list (which includes an inline asset summary per release). The asset list for a specific release is the authoritative, complete manifest of that release's attachments.

## Acceptance Criteria

## Definition of Done

- [ ] Users can retrieve the complete list of assets for any release they have read access to.
- [ ] The list is ordered by `created_at DESC, id DESC` (newest assets first, with ID as tiebreaker).
- [ ] Each asset entry includes: `id`, `name`, `size`, `content_type`, `status`, `download_count`, `confirmed_at` (nullable), `created_at`, and `updated_at`.
- [ ] Assets with `status: "ready"` are visible to all users with read access to the repository.
- [ ] Assets with `status: "pending"` are visible only to users with write access to the repository.
- [ ] Unauthenticated users accessing a public repository see only `status: "ready"` assets.
- [ ] Unauthenticated users accessing a private repository receive HTTP 404 (not 403, to avoid leaking repository existence).
- [ ] Authenticated users without repository access receive HTTP 404.
- [ ] If the release ID is invalid (non-numeric), the API returns HTTP 400 with `"invalid release id"`.
- [ ] If the release does not exist or the user cannot access it, the API returns HTTP 404.
- [ ] If the release exists but has no qualifying assets, the API returns HTTP 200 with an empty JSON array `[]`.
- [ ] The response is a flat JSON array (no pagination wrapper), since the maximum asset count per release is 50.
- [ ] The feature works identically across API, CLI, and TUI clients.

## Edge Cases

- [ ] Release with zero assets returns an empty array `[]`, not an error.
- [ ] Release at the maximum asset limit (50 assets) returns all 50 assets correctly.
- [ ] A release with a mix of `pending` and `ready` assets returns only `ready` assets for read-only viewers, and all assets for write-access viewers.
- [ ] A release where all assets are `pending` returns an empty array for read-only viewers and the full list for write-access viewers.
- [ ] Two assets with identical `created_at` timestamps are ordered deterministically by `id DESC`.
- [ ] Asset names containing special characters (spaces, dots, hyphens, underscores, parentheses) are returned correctly.
- [ ] Asset names containing unicode characters are returned correctly.
- [ ] A draft release's assets are accessible via this endpoint only to users who can view draft releases (write access).
- [ ] Concurrent asset uploads during listing do not cause inconsistent results (each request sees a consistent snapshot).
- [ ] An asset whose blob storage entry was deleted but whose database record still exists (orphaned asset) is still returned in the list (the download will fail separately).

## Boundary Constraints

- [ ] Maximum assets per release: 50.
- [ ] Asset name maximum length: 255 characters.
- [ ] Asset name must not contain path separators (`/`, `\`), control characters, or be empty.
- [ ] Asset size range: 1 byte to 2 GiB (2,147,483,648 bytes).
- [ ] `content_type` field: any valid MIME type string; defaults to `"application/octet-stream"` if not explicitly set.
- [ ] `download_count`: non-negative integer, starts at 0.
- [ ] `status`: one of `"pending"` or `"ready"`.
- [ ] `confirmed_at`: ISO 8601 timestamp when status is `"ready"`, null/absent when status is `"pending"`.
- [ ] Release ID path parameter: must be a positive integer; non-integer values return HTTP 400.

## Design

## API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/releases/:id/assets`

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `owner` | string | Repository owner (user or organization login) |
| `repo` | string | Repository name |
| `id` | integer | Release ID |

**Authentication:** Optional. Anonymous access is allowed for public repositories. Private repositories require a valid session cookie, PAT, or OAuth token with repository read access.

**Request:** No body. No query parameters. This endpoint returns all assets without pagination because the maximum per release is 50.

**Success Response (200):**

```json
[
  {
    "id": 101,
    "name": "codeplane-linux-amd64.tar.gz",
    "size": 52428800,
    "content_type": "application/gzip",
    "status": "ready",
    "download_count": 347,
    "confirmed_at": "2026-03-20T14:30:00Z",
    "created_at": "2026-03-20T14:25:00Z",
    "updated_at": "2026-03-20T14:30:00Z"
  },
  {
    "id": 102,
    "name": "codeplane-darwin-arm64.tar.gz",
    "size": 48234496,
    "content_type": "application/gzip",
    "status": "ready",
    "download_count": 215,
    "confirmed_at": "2026-03-20T14:32:00Z",
    "created_at": "2026-03-20T14:27:00Z",
    "updated_at": "2026-03-20T14:32:00Z"
  },
  {
    "id": 103,
    "name": "checksums.txt",
    "size": 256,
    "content_type": "text/plain",
    "status": "ready",
    "download_count": 89,
    "confirmed_at": "2026-03-20T14:33:00Z",
    "created_at": "2026-03-20T14:33:00Z",
    "updated_at": "2026-03-20T14:33:00Z"
  }
]
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `400` | Invalid (non-numeric) release ID | `{ "message": "invalid release id" }` |
| `404` | Repository not found or insufficient access | `{ "message": "repository not found" }` |
| `404` | Release not found or user cannot view it | `{ "message": "release not found" }` |
| `500` | Internal server error | `{ "message": "internal server error" }` |

**Response Field Reference:**

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique asset identifier |
| `name` | string | Asset file name (max 255 chars, no path separators) |
| `size` | number | File size in bytes |
| `content_type` | string | MIME type of the asset |
| `status` | string | `"pending"` (upload in progress) or `"ready"` (download available) |
| `download_count` | number | Total number of times the asset has been downloaded |
| `confirmed_at` | string \| null | ISO 8601 timestamp when upload was confirmed; null for pending assets |
| `created_at` | string | ISO 8601 timestamp when the asset record was created |
| `updated_at` | string | ISO 8601 timestamp of the last modification |

## SDK Shape

The `ReleaseService.listReleaseAssets` method is the authoritative service contract:

```typescript
async listReleaseAssets(
  viewer: AuthUser | undefined,
  owner: string,
  repo: string,
  releaseID: number
): Promise<ReleaseAssetResponse[]>
```

Behavior:
- Resolves the repository by owner and name; requires read access.
- Resolves the release by ID within the repository; requires the release to be visible to the viewer (draft releases require write access).
- Fetches all asset rows for the release ordered by `created_at DESC, id DESC`.
- Filters out `status: "pending"` assets unless the viewer has write access to the repository.
- Maps database rows to `ReleaseAssetResponse` objects via the `mapReleaseAsset` helper.

## CLI Command

**Command:** `codeplane release assets <release>`

**Arguments:**

| Argument | Type | Description |
|---|---|---|
| `release` | string | Release ID (numeric) or tag name |

**Flags:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--repo` | string | (auto-detect) | Repository in `OWNER/REPO` format |

**Default output (text mode):**

A table with columns: `ID`, `NAME`, `SIZE`, `TYPE`, `STATUS`, `DOWNLOADS`.

Size is human-readable (e.g., `50.0 MB`, `256 B`). Status shows `ready` or `pending`. Pending assets are shown only if the authenticated user has write access.

Example:
```
ID    NAME                            SIZE      TYPE               STATUS  DOWNLOADS
101   codeplane-linux-amd64.tar.gz    50.0 MB   application/gzip   ready   347
102   codeplane-darwin-arm64.tar.gz   46.0 MB   application/gzip   ready   215
103   checksums.txt                   256 B     text/plain         ready   89
```

**JSON output (`--json`):**

Returns the raw API response array, suitable for piping to `jq` or other tools.

**Empty state:**

When the release has no assets (or no visible assets): prints `"No assets found for release <release>"` and exits with code 0.

**Error states:**
- Release not found: prints error message and exits with non-zero code.
- Repository not found: prints error message and exits with non-zero code.

**Behavior notes:**
- The `release` argument first attempts numeric ID resolution, then falls back to tag name lookup (consistent with existing `release view` behavior).
- If `--repo` is not specified, the CLI infers the repository from the current working directory's jj/git remote.

## Web UI Design

**Location:** Release detail page (`/:owner/:repo/releases/:id`)

The asset list appears as a distinct section below the release notes on the release detail page.

**Section header:**
- "Assets" with an asset count badge (e.g., "Assets (3)").
- For users with write access: a "+" or "Upload asset" button to initiate a new asset upload.

**Asset row layout (per asset):**
- **File icon:** An icon matching the content type (archive icon for `.tar.gz`/`.zip`, document icon for `.txt`/`.md`, generic file icon for others).
- **File name:** Displayed as a clickable link that initiates a download.
- **Size:** Human-readable file size (e.g., "50.0 MB").
- **Download count:** Download icon with count (e.g., "↓ 347").
- **Status badge:** Only shown for `pending` assets — a yellow "Uploading" badge.
- **Actions menu (write-access only):** Kebab menu with "Rename" and "Delete" options.

**Ordering:** Assets are displayed newest first (matching the API's `created_at DESC, id DESC` ordering).

**Empty state:**
- When a release has no assets: "No assets attached to this release." with an upload call-to-action for write-access users.

**Loading state:**
- Skeleton rows matching the asset row layout during data fetch.

**Pending asset visibility:**
- Pending assets are shown only to users with write access, with a yellow "Uploading" status badge.
- Read-only users never see pending assets.

## TUI UI

**Screen:** Release detail screen (accessible from the releases list or repository navigation)

The TUI release detail screen includes an "Assets" section below the release metadata and body.

**Layout:**
- Section header: "Assets (N)" where N is the count of visible assets.
- Selectable list of assets with vi-style navigation (j/k or arrow keys).
- Each row shows: asset name, human-readable size, content type, status, download count.
- `Enter` on a selected asset opens the download URL (or copies it to clipboard if terminal download is impractical).
- `d` on a selected asset triggers download (if supported by the TUI runtime).
- Pending assets are shown with a `[pending]` indicator for write-access users.

**Empty state:**
- "No assets" displayed inline.

## Documentation

The following end-user documentation should be written:

- **Listing release assets (API):** REST API reference for `GET /api/repos/:owner/:repo/releases/:id/assets` including response schema, field descriptions, visibility rules for pending vs. ready assets, and authentication behavior for public/private repositories.
- **Listing release assets (CLI):** Reference for `codeplane release assets <release>` including arguments, flags, output modes, and common usage patterns like `codeplane release assets v1.0.0 --json | jq '.[].name'`.
- **Release assets overview:** Conceptual guide explaining what release assets are, the two-phase upload model (pending → ready), the 50-asset-per-release limit, and the 2 GiB size limit.
- **Downloading release assets:** Guide covering how to download assets from the web UI, CLI, and API, including how the download count is tracked.

## Permissions & Security

## Authorization Matrix

| Role | Can list assets (public repo) | Can see `ready` assets | Can see `pending` assets |
|---|---|---|---|
| Anonymous (public repo) | ✅ | ✅ | ❌ |
| Anonymous (private repo) | ❌ (404) | ❌ | ❌ |
| Authenticated, no repo access (public repo) | ✅ | ✅ | ❌ |
| Authenticated, no repo access (private repo) | ❌ (404) | ❌ | ❌ |
| Read permission | ✅ | ✅ | ❌ |
| Write permission | ✅ | ✅ | ✅ |
| Admin permission | ✅ | ✅ | ✅ |
| Repository owner | ✅ | ✅ | ✅ |
| Organization owner | ✅ | ✅ | ✅ |

### Draft Release Asset Visibility

Assets attached to draft releases follow the same visibility rules as draft releases themselves:
- Only users with write access can view draft releases.
- Therefore, only users with write access can list assets on draft releases.
- Read-only users and anonymous users receive a 404 when attempting to list assets for a draft release (the release itself is not visible to them).

### Rate Limiting

- **Authenticated users:** 60 requests per minute per user for the release asset list endpoint.
- **Unauthenticated users:** 30 requests per minute per IP address.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be included in responses.
- HTTP 429 with `Retry-After` header when limits are exceeded.
- The asset list endpoint is read-only and lightweight (max 50 items, no blob content served), so standard rate limits are sufficient.

### Data Privacy

- Private repository releases and their assets are not visible to unauthorized viewers. The API returns 404 (not 403) to avoid leaking the existence of private repositories.
- Asset names may reveal information about the project's build targets, platforms, or internal tooling. This is user-authored content and is considered acceptable to expose to anyone with repository read access.
- No PII is included in the asset list response. The uploader's identity is not exposed in the asset response (unlike releases, which include author information).
- Asset content is not served by this endpoint — only metadata. Actual file content requires a separate download URL request with its own authorization check.
- `gcs_key` (internal blob storage path) is never exposed in the API response.

## Telemetry & Product Analytics

## Business Events

| Event | Trigger | Properties |
|---|---|---|
| `ReleaseAssetListViewed` | User loads the asset list for a release (any client) | `repository_id`, `owner`, `repo`, `release_id`, `release_tag_name`, `viewer_id` (nullable), `client` (web/cli/tui/api), `asset_count` (number of assets returned), `pending_count` (number of pending assets included, 0 for read-only viewers) |
| `ReleaseAssetListEmpty` | Asset list is viewed but contains zero assets | `repository_id`, `owner`, `repo`, `release_id`, `viewer_id` (nullable), `client` |

## Funnel Metrics

- **Asset discovery rate:** Percentage of release detail views that also trigger an asset list view (web/API). High rates indicate users actively look for downloadable artifacts.
- **Download conversion:** Percentage of `ReleaseAssetListViewed` events followed by at least one `ReleaseAssetDownloaded` event for the same release within 10 minutes. This measures how effectively the asset list drives downloads.
- **Empty asset list rate:** Percentage of `ReleaseAssetListViewed` events where `asset_count = 0`. A high rate may indicate releases are being created without assets, or that uploads are failing.
- **Pending visibility rate:** Percentage of asset list views where `pending_count > 0`. A high rate may indicate slow or frequently failing uploads.
- **API vs. CLI vs. Web distribution:** Breakdown of asset list views by client type. A high API share indicates strong automation adoption.

## Success Indicators

- Asset list load time p95 < 100ms (the query is simple with max 50 rows and no joins).
- > 70% of releases with assets have their asset list viewed at least once.
- Download conversion rate from asset list > 40% (indicating users who view assets are finding what they need).
- CLI `release assets` command adoption grows month-over-month among automation users.
- Empty asset list rate < 15% of total asset list views (indicating releases are being properly populated with assets).

## Observability

## Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Release asset list request received | `DEBUG` | `owner`, `repo`, `release_id`, `viewer_id`, `request_id` |
| Release asset list response served | `INFO` | `owner`, `repo`, `release_id`, `asset_count`, `pending_filtered_count`, `duration_ms`, `status_code`, `request_id` |
| Pending assets filtered for non-write viewer | `DEBUG` | `owner`, `repo`, `release_id`, `viewer_id`, `pending_count`, `request_id` |
| Release not found during asset list | `WARN` | `owner`, `repo`, `release_id`, `viewer_id`, `request_id` |
| Repository not found during asset list | `WARN` | `owner`, `repo`, `viewer_id`, `request_id` |
| Invalid release ID parameter | `WARN` | `owner`, `repo`, `raw_id_value`, `request_id` |
| Database error during asset list | `ERROR` | `owner`, `repo`, `release_id`, `error_message`, `error_code`, `request_id` |
| Rate limit exceeded for asset list | `WARN` | `owner`, `repo`, `viewer_id`, `ip_address`, `request_id` |

## Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_release_asset_list_requests_total` | Counter | `status_code` | Total release asset list requests |
| `codeplane_release_asset_list_duration_seconds` | Histogram | `status_code` | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_release_asset_list_results_total` | Histogram | — | Number of assets returned per request (buckets: 0, 1, 5, 10, 20, 30, 50) |
| `codeplane_release_asset_list_errors_total` | Counter | `error_type` | Errors during asset listing (labels: `not_found`, `bad_request`, `internal`, `rate_limited`) |
| `codeplane_release_asset_list_pending_filtered_total` | Counter | — | Count of requests where pending assets were filtered out for non-write viewers |

## Alerts

### Alert 1: Release Asset List Error Rate Spike

- **Condition:** `rate(codeplane_release_asset_list_errors_total{error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check structured error logs for `release asset list` entries with `ERROR` level in the last 10 minutes.
  2. Identify if errors are database-related (connection timeouts, query failures) or application-level (mapping/serialization errors).
  3. If database-related: check PG connection pool status and active connections via `pg_stat_activity`. Look for long-running queries or lock contention on the `release_assets` table.
  4. If application-related: check for recent deployments that may have changed the `mapReleaseAsset` function or the `listReleaseAssets` SQL query.
  5. Verify the `release_assets` table integrity by running `SELECT count(*) FROM release_assets GROUP BY release_id ORDER BY count DESC LIMIT 10` to check for anomalous asset counts.
  6. If errors are transient, monitor for self-resolution. If persistent after 15 minutes, roll back the most recent deployment.

### Alert 2: Release Asset List Latency Degradation

- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_asset_list_duration_seconds_bucket[5m])) > 0.2`
- **Severity:** Warning
- **Runbook:**
  1. Check if the latency spike correlates with increased request rate (check `codeplane_release_asset_list_requests_total` rate for traffic spikes).
  2. Run `EXPLAIN ANALYZE` on the `listReleaseAssets` query (`SELECT ... FROM release_assets WHERE release_id = $1 ORDER BY created_at DESC, id DESC`) to verify the query plan uses the index.
  3. Verify the index on `release_assets(release_id, created_at DESC, id DESC)` exists and is not bloated.
  4. Check if the `resolveReadableRelease` step (which resolves the repository and release before listing assets) is the bottleneck — it involves additional queries for repository and release lookup.
  5. If a specific release has 50 assets (the maximum), this is expected to be slightly slower but should still be well under 200ms. Investigate if the serialization/mapping step is slow.
  6. Check overall database load, connection pool saturation, and disk I/O.

### Alert 3: Elevated Invalid Release ID Requests

- **Condition:** `rate(codeplane_release_asset_list_errors_total{error_type="bad_request"}[5m]) > 1`
- **Severity:** Info
- **Runbook:**
  1. Check logs for `invalid release ID parameter` entries to identify the source of bad requests.
  2. Look for patterns: if a single IP or user is generating all bad requests, it may be a misconfigured automation script or a fuzzing attempt.
  3. If the requests come from Codeplane's own clients (CLI, web, TUI), investigate a potential client-side routing or URL generation bug.
  4. If the requests are from external sources, consider whether the API documentation is unclear about the release ID format (must be a positive integer).
  5. No immediate action required unless combined with other suspicious activity.

## Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Invalid release ID (non-numeric) | 400 | `"invalid release id"` | User should provide a valid numeric release ID |
| Repository not found | 404 | `"repository not found"` | User should verify owner/repo spelling |
| Private repo, no auth | 404 | `"repository not found"` | User should authenticate |
| Release not found | 404 | `"release not found"` | User should verify the release ID exists |
| Draft release, no write access | 404 | `"release not found"` | User needs write access to see draft release assets |
| Database connection failure | 500 | `"internal server error"` | Automatic retry; alert fires |
| Query timeout | 500 | `"internal server error"` | Alert fires; DBA investigates |
| Rate limit exceeded | 429 | `"rate limit exceeded"` | User waits for reset window |

## Verification

## API Integration Tests

### Basic Functionality

- [ ] **List assets for a release with multiple confirmed assets:** Create a release, upload 3 assets and confirm them. `GET /api/repos/:owner/:repo/releases/:id/assets`. Verify 200, array of 3 items, each with correct fields (`id`, `name`, `size`, `content_type`, `status: "ready"`, `download_count`, `confirmed_at`, `created_at`, `updated_at`).
- [ ] **List assets returns correct ordering:** Upload 3 assets with different creation times. Verify the list is ordered by `created_at DESC, id DESC` (newest first).
- [ ] **List assets for a release with zero assets:** Create a release with no assets. Verify 200 with empty array `[]`.
- [ ] **Response body schema validation:** Verify every field in every asset matches the expected type: `id` (number), `name` (string), `size` (number), `content_type` (string), `status` (string, "ready" or "pending"), `download_count` (number), `confirmed_at` (string or null), `created_at` (string), `updated_at` (string).
- [ ] **Each asset has a unique ID:** Upload multiple assets. Verify all returned asset IDs are distinct.
- [ ] **Asset `confirmed_at` is set for ready assets:** Verify every asset with `status: "ready"` has a non-null `confirmed_at` ISO 8601 timestamp.
- [ ] **Asset `download_count` starts at 0:** Upload a new asset and confirm it. Verify `download_count` is 0 in the list.

### Visibility and Permissions

- [ ] **Ready assets visible to unauthenticated users (public repo):** Create a public repo, upload and confirm assets. GET without auth. Verify all confirmed assets are returned.
- [ ] **Pending assets hidden from unauthenticated users:** Upload an asset but do not confirm it. GET without auth. Verify the pending asset is NOT in the response.
- [ ] **Pending assets visible to write-access users:** Upload an asset but do not confirm. GET as authenticated user with write access. Verify the pending asset IS in the response with `status: "pending"` and `confirmed_at: null`.
- [ ] **Pending assets hidden from read-only users:** Upload an unconfirmed asset. GET as a user with only read access. Verify the pending asset is not returned.
- [ ] **Mixed ready and pending assets:** Upload 3 assets, confirm 2. GET as read-only user: verify 2 items. GET as write-access user: verify 3 items.
- [ ] **All assets pending, read-only viewer:** Upload 2 assets without confirming. GET as read-only user. Verify empty array `[]`.
- [ ] **Draft release assets invisible to read-only users:** Create a draft release with confirmed assets. GET as read-only user. Verify 404 (the release itself is not visible).
- [ ] **Draft release assets visible to write-access users:** Same setup. GET as write-access user. Verify 200 with assets.
- [ ] **Private repository, unauthenticated:** Create a private repo with a release and assets. GET without auth. Verify 404.
- [ ] **Private repository, authenticated with access:** Same setup. GET as authorized user. Verify 200 with assets.
- [ ] **Private repository, authenticated without access:** GET as a different authenticated user without repo access. Verify 404 (no existence leak).

### Error Handling

- [ ] **Invalid release ID (non-numeric string):** GET with release ID `abc`. Verify 400 with `"invalid release id"`.
- [ ] **Invalid release ID (negative number):** GET with release ID `-1`. Verify 404 (parseInt succeeds but release does not exist).
- [ ] **Invalid release ID (zero):** GET with release ID `0`. Verify 404.
- [ ] **Invalid release ID (float):** GET with release ID `3.14`. Verify behavior (parseInt parses to 3, then 404 or valid depending on existence).
- [ ] **Non-existent release ID:** GET with a release ID that does not exist. Verify 404.
- [ ] **Non-existent repository:** GET with a nonexistent `owner/repo`. Verify 404.
- [ ] **Release ID as very large number:** GET with release ID `999999999999`. Verify 404 (not a server crash).

### Boundary Tests

- [ ] **Maximum assets per release (50):** Upload and confirm exactly 50 assets on a release. GET. Verify all 50 are returned correctly.
- [ ] **Asset with maximum name length (255 chars):** Upload an asset with a 255-character name. Verify it appears correctly in the list with the full name preserved.
- [ ] **Asset with minimum name length (1 char):** Upload an asset named `"a"`. Verify it appears correctly.
- [ ] **Asset with special characters in name:** Upload assets named `"build (x86_64).tar.gz"`, `"my-app_v2.0.zip"`, `"CHANGELOG.md"`. Verify all names are returned correctly.
- [ ] **Asset with maximum size (2 GiB):** Upload an asset declared as 2,147,483,648 bytes. Verify the `size` field in the list matches exactly.
- [ ] **Asset with minimum size (1 byte):** Upload a 1-byte asset. Verify `size: 1` in the list.
- [ ] **Asset with various content types:** Upload assets with `application/gzip`, `application/zip`, `text/plain`, `application/octet-stream`, `application/wasm`. Verify each `content_type` is returned correctly.
- [ ] **Two assets with identical created_at timestamps:** If possible via rapid sequential creation, verify deterministic ordering by `id DESC`.

### Data Correctness

- [ ] **Download count reflects actual downloads:** Upload an asset, confirm it, download it 3 times via the download endpoint. List assets. Verify `download_count: 3`.
- [ ] **Asset renamed appears with new name:** Upload an asset, confirm it, rename it via the PATCH endpoint. List assets. Verify the new name is returned.
- [ ] **Deleted asset no longer appears:** Upload and confirm 2 assets, delete one. List assets. Verify only 1 asset is returned.
- [ ] **Timestamps are valid ISO 8601:** Verify all `created_at`, `updated_at`, and `confirmed_at` values are valid ISO 8601 strings parseable by `new Date()`.

## CLI Integration Tests

- [ ] **`release assets <release>` by release ID:** Create a release with assets. Run `codeplane release assets <id> --repo OWNER/REPO`. Verify output contains asset names and sizes.
- [ ] **`release assets <release>` by tag name:** Run `codeplane release assets v1.0.0 --repo OWNER/REPO`. Verify the same assets are returned as when using the numeric ID.
- [ ] **`release assets <release> --json`:** Run with `--json` flag. Verify output is valid JSON array with all expected fields.
- [ ] **`release assets <release> --json` field filtering:** Run with `--json .name`. Verify only asset names are output (if supported by the CLI's JSON filtering).
- [ ] **`release assets` with auto-detected repo:** Run in a directory with a jj/git remote configured. Verify the repo is resolved automatically.
- [ ] **`release assets` empty release:** Run for a release with no assets. Verify graceful output: `"No assets found for release <release>"`.
- [ ] **`release assets` for nonexistent release:** Verify clear error message and non-zero exit code.
- [ ] **`release assets` for nonexistent repo:** Verify clear error message and non-zero exit code.
- [ ] **`release assets` output table format:** Verify the text output includes columns for ID, NAME, SIZE, TYPE, STATUS, and DOWNLOADS.
- [ ] **`release assets` human-readable sizes:** Verify sizes are formatted as human-readable strings (e.g., `50.0 MB`, `256 B`) in text mode.

## Web UI E2E Tests (Playwright)

- [ ] **Asset list appears on release detail page:** Navigate to `/:owner/:repo/releases/:id`. Verify an "Assets" section is visible with the correct number of assets.
- [ ] **Asset names are displayed:** Verify each asset's file name is visible in the asset list.
- [ ] **Asset sizes are human-readable:** Verify sizes are displayed in a human-readable format (e.g., "50.0 MB").
- [ ] **Asset download counts are displayed:** Verify each asset shows its download count.
- [ ] **Asset download link works:** Click an asset name/download link. Verify the download is initiated (or the download URL is generated).
- [ ] **Pending assets visible to write-access users:** Log in as a repo admin. Upload an asset without confirming. Navigate to the release. Verify the pending asset appears with an "Uploading" badge.
- [ ] **Pending assets hidden from read-only users:** Log in as a read-only user. Verify pending assets are not visible.
- [ ] **Empty asset state:** Navigate to a release with no assets. Verify the empty state message ("No assets attached to this release.") is displayed.
- [ ] **Upload button visible for write-access users:** Log in as a repo admin. Verify the "Upload asset" button is present.
- [ ] **Upload button hidden for read-only users:** Log in as a read-only user. Verify no upload button is shown.
- [ ] **Asset list ordering:** Upload multiple assets. Verify they appear newest-first in the UI.
- [ ] **File type icons:** Verify appropriate icons are shown for different content types (archive icon for `.tar.gz`, document icon for `.txt`).
- [ ] **Loading state:** Intercept the API request to delay it. Verify skeleton loading UI is displayed.
- [ ] **Error state:** Intercept the API request to return 500. Verify an error message is shown.
- [ ] **Asset actions menu (write-access):** Log in as admin. Verify the kebab/actions menu appears with "Rename" and "Delete" options.
- [ ] **Responsive layout:** Verify the asset list renders correctly on mobile-width viewports.

## TUI Integration Tests

- [ ] **Assets section in release detail:** Open release detail in TUI. Verify "Assets (N)" section is present with correct count.
- [ ] **Asset rows display correct data:** Verify each row shows name, size, content type, status, download count.
- [ ] **Keyboard navigation between assets:** Verify j/k or arrow keys move selection between assets.
- [ ] **Enter on asset triggers download/copy URL:** Verify pressing Enter on a selected asset initiates the expected action.
- [ ] **Pending asset indicator for write users:** Verify `[pending]` indicator is shown for pending assets.
- [ ] **Empty assets section:** Open a release with no assets. Verify "No assets" message.

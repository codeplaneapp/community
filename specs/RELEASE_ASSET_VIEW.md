# RELEASE_ASSET_VIEW

Specification for RELEASE_ASSET_VIEW.

## High-Level User POV

When a Codeplane user navigates to a specific release, they often need to inspect the details of individual assets attached to that release — binary packages, source archives, documentation bundles, or any other downloadable file the maintainer has published. The release asset view provides a way to retrieve the full metadata for a single asset, including its name, file size, content type, upload status, and total download count.

From the user's perspective, viewing a release asset answers the questions: "What exactly is this file? How large is it? What type of content is it? Has its upload been completed? How many times has it been downloaded?" This is useful when a user needs to verify that an asset was correctly uploaded before sharing the release, when automation scripts need to check an asset's status before consuming it, or when maintainers want to audit individual download counts for analytics purposes.

The asset view experience is available across all Codeplane clients. A developer can inspect an asset from the CLI while scripting a release pipeline, from the API as part of a CI/CD health check, or from the web UI while reviewing a release before publishing it. The same metadata shape is returned everywhere, so automation and human inspection workflows produce consistent results.

Pending assets — those whose upload has been initiated but not yet confirmed — are only visible to users with write access to the repository. This ensures that consumers of a release never see partially uploaded or broken files. For everyone else, a pending asset behaves as if it does not exist.

The asset view does not initiate a download or increment the download counter. It is a metadata-only inspection surface. To actually download the asset's file content, the user must use the separate download endpoint, which generates a time-limited signed URL and records the download event.

## Acceptance Criteria

- **Release ID must be a valid positive integer.** Non-integer or non-positive values return `400 Bad Request`.
- **Asset ID must be a valid positive integer.** Non-integer or non-positive values return `400 Bad Request`.
- **The release must exist within the specified repository.** If the release does not exist, the endpoint returns `404 Not Found`.
- **The asset must belong to the specified release.** If the asset does not exist on the given release, the endpoint returns `404 Not Found`.
- **Draft release visibility rules apply.** If the release is a draft and the viewer does not have write access, the response is `404 Not Found` (not `403 Forbidden`), to avoid leaking the existence of draft releases.
- **Pending asset visibility rules apply.** If the asset has `status: "pending"` and the viewer does not have write access, the response is `404 Not Found`.
- **Ready assets are visible to any user with read access** to the repository (including anonymous users for public repos).
- **The response must include the full asset object** with the following fields: `id`, `name`, `size`, `content_type`, `status`, `download_count`, `confirmed_at` (present only when status is `"ready"`), `created_at`, `updated_at`.
- **The response status code must be `200 OK` on success.**
- **The `size` field is returned in bytes as a number.**
- **The `content_type` field reflects the MIME type** declared at upload time (or the default `application/octet-stream` if none was specified).
- **The `download_count` field reflects the total number of times** the download endpoint has been invoked for this asset (not the number of times the metadata has been viewed).
- **The `confirmed_at` timestamp is only present** when the asset has `status: "ready"`. For pending assets visible to write-access users, the field is omitted.
- **Timestamps (`confirmed_at`, `created_at`, `updated_at`) are returned in ISO 8601 format.**
- **Viewing asset metadata does NOT increment the download count.** This is a read-only metadata operation.
- **Repository-scoped access is enforced.** The `owner` and `repo` path parameters are required and validated. Missing or empty values return `400 Bad Request`.
- **Private repositories require authentication.** Anonymous requests to private repository assets return `403 Forbidden`.
- **Invalid JSON or malformed request paths return `400 Bad Request`.**

### Definition of Done

The feature is complete when:
1. All acceptance criteria above pass in automated tests.
2. The API endpoint, CLI command, and (when built) Web UI and TUI surfaces all retrieve asset metadata with identical semantics.
3. Feature flag `RELEASE_ASSET_VIEW` gates the respective surfaces.
4. Telemetry events fire correctly for successful and failed view attempts.
5. Observability metrics, logs, and alerts are instrumented per the observability plan.
6. Documentation is published for API and CLI usage.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/releases/:id/assets/:asset_id`

**Authentication:** Optional for public repos, required for private repos

**Request Headers:**
- `Authorization: Bearer <token>` or session cookie (optional for public repos)

**Path Parameters:**
| Parameter  | Type   | Description                         |
|------------|--------|-------------------------------------|
| `owner`    | string | Repository owner (user or org)      |
| `repo`     | string | Repository name                     |
| `id`       | number | Release ID (positive integer)       |
| `asset_id` | number | Release asset ID (positive integer) |

**Request Body:** None (GET request)

**Query Parameters:** None

**Success Response:** `200 OK`
```json
{
  "id": 17,
  "name": "codeplane-linux-amd64.tar.gz",
  "size": 52428800,
  "content_type": "application/gzip",
  "status": "ready",
  "download_count": 342,
  "confirmed_at": "2026-03-20T14:30:00.000Z",
  "created_at": "2026-03-20T14:28:00.000Z",
  "updated_at": "2026-03-20T14:30:00.000Z"
}
```

**Response Fields:**
| Field            | Type    | Always Present | Description                                                  |
|------------------|---------|----------------|--------------------------------------------------------------|
| `id`             | number  | Yes            | Unique asset identifier                                      |
| `name`           | string  | Yes            | Asset filename (1–255 chars, no `/`, `\`, control chars)     |
| `size`           | number  | Yes            | File size in bytes (0–2 GiB)                                 |
| `content_type`   | string  | Yes            | MIME type (default: `application/octet-stream`)              |
| `status`         | string  | Yes            | `"ready"` or `"pending"` (pending only for write-access)     |
| `download_count` | number  | Yes            | Total download count (non-negative integer)                  |
| `confirmed_at`   | string  | No             | ISO 8601 timestamp, only present when status is `"ready"`    |
| `created_at`     | string  | Yes            | ISO 8601 timestamp of asset creation                         |
| `updated_at`     | string  | Yes            | ISO 8601 timestamp of last update                            |

**Error Responses:**

| Status | Condition                                                          | Body                                          |
|--------|--------------------------------------------------------------------|-----------------------------------------------|
| `400`  | `id` or `asset_id` is not a valid positive integer                 | `{ "error": "invalid release id" }` or `{ "error": "invalid release asset id" }` |
| `400`  | `owner` or `repo` is empty                                        | `{ "error": "owner is required" }` or `{ "error": "repository name is required" }` |
| `403`  | Private repo, viewer has no read access                            | `{ "error": "permission denied" }`            |
| `404`  | Repository does not exist                                          | `{ "error": "repository not found" }`         |
| `404`  | Release does not exist (or is a draft and viewer lacks write)      | `{ "error": "release not found" }`            |
| `404`  | Asset does not exist (or is pending and viewer lacks write)        | `{ "error": "release asset not found" }`      |

### SDK Shape

**Service Method:** `ReleaseService.getReleaseAsset(viewer, owner, repo, releaseID, assetID)`

**Parameters:**
| Parameter   | Type                    | Description                          |
|-------------|-------------------------|--------------------------------------|
| `viewer`    | `AuthUser \| undefined` | Authenticated user or anonymous      |
| `owner`     | `string`                | Repository owner                     |
| `repo`      | `string`                | Repository name                      |
| `releaseID` | `number`                | Release ID                           |
| `assetID`   | `number`                | Asset ID                             |

**Returns:** `Promise<ReleaseAssetResponse>`

**Behavior:**
1. Resolve repository by owner and name (case-insensitive).
2. Enforce read access (public repos allow anonymous; private repos require auth + permission).
3. Look up release by ID within the repository.
4. If release is a draft and viewer lacks write access, throw `notFound("release not found")`.
5. Look up asset by ID within the release.
6. If asset status is `"pending"` and viewer lacks write access, throw `notFound("release asset not found")`.
7. Map the asset row to `ReleaseAssetResponse` and return.

### CLI Command

**Existing behavior:** `codeplane release view <release>` already returns the full release object including the embedded `assets[]` array. Each asset in the array includes all fields described in the API shape.

```bash
# View a release and its assets
codeplane release view v1.0.0 --repo myorg/myrepo --json

# Filter to a specific asset using jq
codeplane release view v1.0.0 --repo myorg/myrepo --json | jq '.assets[] | select(.name == "codeplane-linux-amd64.tar.gz")'
```

**Dedicated asset view command (new):** `codeplane release asset <release> <asset_name_or_id>`

```bash
# View a specific asset by name
codeplane release asset v1.0.0 codeplane-linux-amd64.tar.gz --repo myorg/myrepo

# View a specific asset by ID
codeplane release asset v1.0.0 17 --repo myorg/myrepo --json
```

**Options:**
| Flag        | Type   | Default     | Description                        |
|-------------|--------|-------------|------------------------------------|  
| `--repo`    | string | auto-detect | Repository in `OWNER/REPO` format |
| `--json`    | flag   | false       | Output as JSON                     |

**Text Output Format:**
```
Name:           codeplane-linux-amd64.tar.gz
Size:           50.0 MB
Content-Type:   application/gzip
Status:         ready
Downloads:      342
Uploaded:       2026-03-20T14:28:00Z
Confirmed:      2026-03-20T14:30:00Z
```

**Error Behavior:**
- If the release is not found, print an error and exit with code 1.
- If the asset is not found (by name or ID), print an error and exit with code 1.
- If authentication is needed and no credentials are configured, prompt the user to authenticate.

### Web UI Design

**Route:** `/:owner/:repo/releases/:id` (release detail page, asset section)

The release detail page must include an **Assets** section listing all attached assets. Each asset row in the list should display:

- **File icon** appropriate to the content type (archive icon for `.tar.gz`/`.zip`, document icon for `.md`/`.txt`, binary icon for executables, generic file icon as fallback).
- **Asset name** as a clickable link that initiates the download flow.
- **File size** displayed in human-readable format (e.g., "50.0 MB", "2.3 KB").
- **Download count** displayed as a badge or secondary text (e.g., "342 downloads").
- **Status badge** — only visible to users with write access. Shows `"pending"` badge in yellow/amber for assets awaiting confirmation, `"ready"` badge in green for confirmed assets.
- **Upload timestamp** shown as relative time (e.g., "2 days ago") with a tooltip showing the full ISO 8601 timestamp.

**Empty State:** When a release has zero assets, display a message: "No assets attached to this release." If the viewer has write access, include a call-to-action: "Upload an asset" linking to the upload flow.

**Pending Asset Visibility:** Pending assets are only rendered for users with write access. Read-only and anonymous users see only `"ready"` assets.

**Asset Detail Popover/Panel:** Clicking an asset name (for metadata inspection, not download) should expand or open a panel showing:
- Full filename
- Exact byte size (e.g., "52,428,800 bytes")
- MIME content type
- Upload date and confirmation date
- Total download count
- Copy-to-clipboard for the direct download API URL

### TUI Design

**Screen:** Release Detail → Assets Section

The TUI release detail screen should include an assets table rendered beneath the release notes. Each row shows:
- Asset name (truncated to fit terminal width, with `…` suffix if needed)
- Size in human-readable format
- Status (only for write-access viewers)
- Download count

**Keyboard bindings:**
- `d` on a selected asset: initiate download (fetch signed URL and open or print it)
- `Enter` on a selected asset: show full asset metadata in a detail pane
- `c` on a selected asset: copy download URL to clipboard

### Documentation

The following documentation must be provided:

1. **API Reference — Get Release Asset:**
   - Endpoint path, method, parameters, request/response examples
   - Authentication requirements
   - Error codes and their meanings
   - Note that this endpoint does NOT increment download count

2. **CLI Reference — `codeplane release asset`:**
   - Usage, arguments, flags
   - Text and JSON output examples
   - Common workflows (e.g., scripting asset verification in CI)

3. **Conceptual Guide — Release Assets:**
   - Explanation of the pending → ready lifecycle
   - Visibility rules for draft releases and pending assets
   - Difference between asset view (metadata) and asset download (file retrieval + counter increment)

## Permissions & Security

### Authorization Matrix

| Role              | View ready asset (public repo) | View ready asset (private repo) | View pending asset | Notes                                        |
|-------------------|-------------------------------|--------------------------------|-------------------|----------------------------------------------|
| Anonymous         | ✅                             | ❌ (403)                        | ❌ (404)           | Public repos allow anonymous metadata reads  |
| Read-only member  | ✅                             | ✅                              | ❌ (404)           | Pending assets are invisible                 |
| Write member      | ✅                             | ✅                              | ✅                 | Full visibility including pending            |
| Admin             | ✅                             | ✅                              | ✅                 | Full visibility                              |
| Owner             | ✅                             | ✅                              | ✅                 | Full visibility                              |
| Org owner         | ✅                             | ✅                              | ✅                 | Treated as owner for their org's repos       |

### Draft Release Interaction

- Draft releases are invisible to viewers without write access. Attempting to view an asset on a draft release returns `404 Not Found`, not `403 Forbidden`, to avoid revealing the existence of drafts.
- Pending assets on non-draft releases follow the same pattern: `404 Not Found` for unauthorized viewers.

### Rate Limiting

- **Authenticated users:** 600 requests per minute per user across all release asset view calls.
- **Anonymous users:** 60 requests per minute per IP address.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be included in responses.

### Data Privacy

- No PII is exposed in the asset response. The response contains only asset metadata (name, size, content type, timestamps, download count).
- The `uploader_id` is stored internally but is NOT exposed in the asset response object to avoid leaking user identity associations.
- Signed download URLs (from the separate download endpoint) are time-limited and should not be cached or shared beyond their expiry window. The asset view endpoint does not return download URLs.

## Telemetry & Product Analytics

### Business Events

| Event Name             | Trigger                                   | Properties                                                                                              |
|------------------------|-------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `ReleaseAssetViewed`   | Successful `200 OK` response              | `repo_id`, `repo_owner`, `repo_name`, `release_id`, `release_tag`, `asset_id`, `asset_name`, `asset_size`, `asset_content_type`, `asset_status`, `viewer_id` (nullable), `client` (`api`/`cli`/`web`/`tui`) |
| `ReleaseAssetViewFailed` | Any non-200 response                    | `repo_owner`, `repo_name`, `release_id`, `asset_id`, `error_code`, `error_message`, `viewer_id` (nullable), `client` |

### Funnel Metrics

- **Asset View → Asset Download conversion rate:** Percentage of `ReleaseAssetViewed` events followed by a `ReleaseAssetDownloaded` event for the same `asset_id` within a 30-minute window. A high conversion rate indicates that users viewing asset metadata are proceeding to download, which validates the usefulness of the metadata surface.
- **Asset View frequency by content type:** Distribution of `asset_content_type` across all `ReleaseAssetViewed` events. Helps the product team understand which asset types are most inspected.
- **Asset View by client:** Distribution of `client` property across `ReleaseAssetViewed` events. Indicates which surfaces (API, CLI, Web, TUI) are most used for asset inspection.
- **404 rate on asset views:** Ratio of `ReleaseAssetViewFailed` with `error_code: 404` to total asset view attempts. A high rate may indicate broken links, stale references, or documentation issues.

### Success Indicators

- Asset view latency p50 < 100ms, p99 < 500ms.
- 404 error rate < 5% of total asset view requests (excluding intentional probes).
- At least 30% of `ReleaseAssetViewed` events convert to a `ReleaseAssetDownloaded` event within 30 minutes.

## Observability

### Logging Requirements

| Log Event                  | Level | Structured Context                                                                                   | Condition                                           |
|---------------------------|-------|-----------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| Asset metadata fetched     | INFO  | `repo_id`, `release_id`, `asset_id`, `asset_name`, `viewer_id`, `request_id`                        | Successful 200 response                            |
| Asset not found            | WARN  | `repo_id`, `release_id`, `asset_id`, `viewer_id`, `request_id`, `reason` (`"not_found"`, `"pending_hidden"`, `"draft_hidden"`) | 404 response                                       |
| Invalid release/asset ID   | WARN  | `raw_id`, `raw_asset_id`, `request_id`                                                              | 400 response due to malformed IDs                  |
| Permission denied          | WARN  | `repo_id`, `viewer_id`, `request_id`                                                                | 403 response                                       |
| Internal service error     | ERROR | `repo_id`, `release_id`, `asset_id`, `error`, `stack_trace`, `request_id`                           | 500 response or unexpected exception               |

### Prometheus Metrics

| Metric Name                                        | Type      | Labels                                          | Description                                                      |
|---------------------------------------------------|-----------|-------------------------------------------------|------------------------------------------------------------------|
| `codeplane_release_asset_view_total`              | Counter   | `status` (`200`, `400`, `403`, `404`, `500`)    | Total asset view requests by response status                     |
| `codeplane_release_asset_view_duration_seconds`   | Histogram | `status`                                        | Request duration for asset view (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_release_asset_view_pending_hidden_total` | Counter | —                                               | Number of times a pending asset was hidden from a non-write viewer |
| `codeplane_release_asset_view_draft_hidden_total`   | Counter | —                                               | Number of times a draft release caused an asset view 404         |

### Alerts

#### Alert: High Asset View Error Rate
- **Condition:** `rate(codeplane_release_asset_view_total{status="500"}[5m]) / rate(codeplane_release_asset_view_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check the server logs for `level: ERROR` entries with `release_id` and `asset_id` context.
  2. Verify the database connection pool is healthy (`SELECT 1` probe).
  3. Check if the `release_assets` table is accessible and not locked.
  4. Review recent deployments for regressions in the release service.
  5. If the issue is database-related, check PGBouncer/PGLite health and restart the connection pool.
  6. If the issue is code-related, roll back to the previous deployment.

#### Alert: High Asset View Latency
- **Condition:** `histogram_quantile(0.99, rate(codeplane_release_asset_view_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check the database query latency for `getReleaseAssetByID` — run `EXPLAIN ANALYZE` on the query.
  2. Verify that the `release_assets` table has proper indexes on `(release_id, id)`.
  3. Check overall database load — look for competing heavy queries or locks.
  4. If the database is under heavy load, consider scaling read replicas or connection pool size.
  5. Check network latency between the server and database.

#### Alert: Elevated 404 Rate on Asset Views
- **Condition:** `rate(codeplane_release_asset_view_total{status="404"}[15m]) / rate(codeplane_release_asset_view_total[15m]) > 0.3`
- **Severity:** Warning
- **Runbook:**
  1. Check if there was a recent bulk release or asset deletion that may have invalidated cached URLs or links.
  2. Review the WARN-level logs to distinguish between `not_found`, `pending_hidden`, and `draft_hidden` reasons.
  3. If `pending_hidden` dominates, this may indicate a UI bug showing pending asset links to read-only users.
  4. If `not_found` dominates, check whether automated tools are referencing stale asset IDs.
  5. Verify the asset list endpoint is consistent with the asset view endpoint (no data staleness).

### Error Cases and Failure Modes

| Error Case                        | HTTP Status | User-Visible Message                    | System Behavior                                    |
|-----------------------------------|-------------|-----------------------------------------|----------------------------------------------------|
| Malformed release ID              | 400         | "invalid release id"                    | Request rejected at route layer, no DB query       |
| Malformed asset ID                | 400         | "invalid release asset id"              | Request rejected at route layer, no DB query       |
| Repository not found              | 404         | "repository not found"                  | DB lookup returns null                             |
| Release not found                 | 404         | "release not found"                     | DB lookup returns null or draft visibility blocked |
| Asset not found                   | 404         | "release asset not found"               | DB lookup returns null or pending visibility blocked|
| Private repo, no auth             | 403         | "permission denied"                     | Auth middleware rejects anonymous viewer           |
| Private repo, insufficient access | 403         | "permission denied"                     | Permission check fails                             |
| Database connection failure       | 500         | "internal server error"                 | DB connection pool exhausted or timeout            |
| Unexpected service exception      | 500         | "internal server error"                 | Unhandled exception in service layer               |

## Verification

### API Integration Tests

1. **Happy path: view a ready asset on a public repo (authenticated)**
   - Create a repo, create a release, upload and confirm an asset.
   - `GET /api/repos/:owner/:repo/releases/:id/assets/:asset_id` with auth.
   - Assert `200 OK`, response body includes all expected fields (`id`, `name`, `size`, `content_type`, `status: "ready"`, `download_count: 0`, `confirmed_at` present, `created_at`, `updated_at`).

2. **Happy path: view a ready asset on a public repo (anonymous)**
   - Create a public repo, create a release, upload and confirm an asset.
   - `GET /api/repos/:owner/:repo/releases/:id/assets/:asset_id` without auth.
   - Assert `200 OK`, same response shape.

3. **Pending asset hidden from anonymous viewer**
   - Create a public repo, create a release, initiate asset upload (do NOT confirm).
   - `GET /api/repos/:owner/:repo/releases/:id/assets/:asset_id` without auth.
   - Assert `404 Not Found` with `"release asset not found"`.

4. **Pending asset visible to write-access user**
   - Create a repo, create a release, initiate asset upload (do NOT confirm).
   - `GET /api/repos/:owner/:repo/releases/:id/assets/:asset_id` with write-access auth.
   - Assert `200 OK`, `status: "pending"`, `confirmed_at` absent.

5. **Pending asset hidden from read-only collaborator**
   - Create a private repo, add a read-only collaborator, create a release, initiate asset upload.
   - `GET` as the read-only collaborator.
   - Assert `404 Not Found`.

6. **Draft release asset hidden from anonymous viewer**
   - Create a public repo, create a draft release, upload and confirm an asset.
   - `GET` without auth.
   - Assert `404 Not Found` with `"release not found"`.

7. **Draft release asset visible to write-access user**
   - Create a repo, create a draft release, upload and confirm an asset.
   - `GET` with write-access auth.
   - Assert `200 OK`.

8. **Private repo asset requires authentication**
   - Create a private repo, create a release with a ready asset.
   - `GET` without auth.
   - Assert `403 Forbidden`.

9. **Private repo asset accessible to authenticated reader**
   - Create a private repo, add a read-only collaborator, create a release with a ready asset.
   - `GET` as the read-only collaborator.
   - Assert `200 OK`.

10. **Non-existent release returns 404**
    - `GET /api/repos/:owner/:repo/releases/99999/assets/1`.
    - Assert `404 Not Found` with `"release not found"`.

11. **Non-existent asset returns 404**
    - Create a release with no assets.
    - `GET /api/repos/:owner/:repo/releases/:id/assets/99999`.
    - Assert `404 Not Found` with `"release asset not found"`.

12. **Non-existent repository returns 404**
    - `GET /api/repos/nonexistent/nonexistent/releases/1/assets/1`.
    - Assert `404 Not Found` with `"repository not found"`.

13. **Invalid release ID (string) returns 400**
    - `GET /api/repos/:owner/:repo/releases/abc/assets/1`.
    - Assert `400 Bad Request` with `"invalid release id"`.

14. **Invalid release ID (negative) returns 400**
    - `GET /api/repos/:owner/:repo/releases/-1/assets/1`.
    - Assert `400 Bad Request` with `"invalid release id"`.

15. **Invalid release ID (zero) returns 400**
    - `GET /api/repos/:owner/:repo/releases/0/assets/1`.
    - Assert `400 Bad Request` with `"invalid release id"`.

16. **Invalid release ID (float) returns 400**
    - `GET /api/repos/:owner/:repo/releases/1.5/assets/1`.
    - Assert `400 Bad Request` with `"invalid release id"`.

17. **Invalid asset ID (string) returns 400**
    - `GET /api/repos/:owner/:repo/releases/:id/assets/abc`.
    - Assert `400 Bad Request` with `"invalid release asset id"`.

18. **Invalid asset ID (negative) returns 400**
    - `GET /api/repos/:owner/:repo/releases/:id/assets/-1`.
    - Assert `400 Bad Request` with `"invalid release asset id"`.

19. **Invalid asset ID (zero) returns 400**
    - `GET /api/repos/:owner/:repo/releases/:id/assets/0`.
    - Assert `400 Bad Request` with `"invalid release asset id"`.

20. **Download count is not incremented by asset view**
    - Create a release with a ready asset.
    - `GET /api/repos/:owner/:repo/releases/:id/assets/:asset_id` three times.
    - Assert `download_count` remains `0` on each response.

21. **Download count reflects separate download endpoint calls**
    - Create a release with a ready asset.
    - Call the download endpoint twice.
    - `GET` the asset view endpoint.
    - Assert `download_count` is `2`.

22. **Asset with maximum valid name length (255 chars)**
    - Upload an asset with a 255-character name.
    - Confirm the upload.
    - `GET` the asset view.
    - Assert `200 OK`, `name` matches the 255-character input.

23. **Asset with maximum valid size (2 GiB)**
    - Initiate an asset upload with `size: 2147483648` (2 GiB).
    - `GET` the asset view (pending, with write access).
    - Assert `200 OK`, `size` is `2147483648`.

24. **Response timestamp format validation**
    - View a ready asset.
    - Assert `created_at` matches ISO 8601 format (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/`).
    - Assert `updated_at` matches ISO 8601 format.
    - Assert `confirmed_at` matches ISO 8601 format.

25. **Multiple assets on same release — correct asset returned**
    - Upload and confirm three assets on the same release (`a.tar.gz`, `b.zip`, `c.txt`).
    - `GET` the view endpoint for each asset ID.
    - Assert each returns the correct name and metadata.

### CLI Integration Tests

26. **`codeplane release view` includes assets in JSON output**
    - Create a release, upload and confirm an asset.
    - `codeplane release view <tag> --repo <repo> --json`.
    - Parse JSON output, assert `assets` array contains one entry with expected fields.

27. **`codeplane release view` shows asset details in text output**
    - `codeplane release view <tag> --repo <repo>`.
    - Assert output contains the asset name, size, and download count.

28. **CLI handles non-existent release gracefully**
    - `codeplane release view nonexistent-tag --repo <repo>`.
    - Assert exit code 1 and error message.

### E2E Playwright Tests (Web UI)

29. **Release detail page shows assets section**
    - Navigate to `/:owner/:repo/releases/:id`.
    - Assert the Assets section is visible with a header.
    - Assert each asset row shows name, size, and download count.

30. **Empty assets state shown when no assets**
    - Navigate to a release with zero assets.
    - Assert "No assets attached to this release" message is displayed.

31. **Pending assets hidden for read-only viewers**
    - Log in as a read-only collaborator.
    - Navigate to a release with one pending and one ready asset.
    - Assert only the ready asset is visible.

32. **Pending assets shown for write-access viewers**
    - Log in as the repo owner.
    - Navigate to a release with one pending asset.
    - Assert the pending asset is visible with a "pending" status badge.

33. **Asset name is clickable and triggers download flow**
    - Navigate to a release with a ready asset.
    - Click the asset name.
    - Assert that the download flow is initiated (network request to the download endpoint).

34. **Asset file size is displayed in human-readable format**
    - Navigate to a release with an asset of known size.
    - Assert the UI shows the size in appropriate units (KB, MB, GB).

35. **Asset metadata panel shows full details**
    - Navigate to a release with a ready asset.
    - Click to expand asset details.
    - Assert full metadata is displayed: exact byte size, MIME type, timestamps, download count.

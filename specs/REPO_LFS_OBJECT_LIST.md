# REPO_LFS_OBJECT_LIST

Specification for REPO_LFS_OBJECT_LIST.

## High-Level User POV

When working with large binary files — models, datasets, media assets, compiled artifacts — tracked via Git LFS, users need visibility into what objects are stored in their repository's LFS store. Today, without a dedicated LFS object listing surface, users have no way to audit their LFS usage, find specific large objects, understand storage consumption over time, or decide which objects to clean up — short of issuing raw API calls.

The LFS Object List feature gives repository collaborators a paginated, browsable view of every LFS object currently stored in a repository. From the web UI's repository settings area, the CLI, or the TUI, a user can see each object's content-addressable OID (SHA-256 hash), its size in human-readable form, and when it was uploaded. The list supports pagination for repositories with hundreds or thousands of tracked objects and provides a total count so users can gauge their storage footprint at a glance.

For repository administrators, this view serves as a storage audit tool — they can identify the largest objects, spot duplicates, and make informed decisions about what to delete. For automation-oriented users and agents, the same data is available via the API and CLI, enabling scripted LFS housekeeping workflows such as garbage collection of orphaned objects or storage usage reporting.

The feature fits naturally into Codeplane's existing repository settings experience. It is a read-oriented surface that requires no new jj-specific concepts — LFS objects are content-addressed blobs associated with a repository — but it completes the LFS management story alongside the already-implemented batch, confirm, and delete operations.

## Acceptance Criteria

### Definition of Done

- [ ] A user with read access to a repository can retrieve a paginated list of all LFS objects stored in that repository.
- [ ] The list endpoint returns each object's `id`, `oid` (SHA-256 hex string), `size` (in bytes), and `created_at` (ISO 8601 timestamp).
- [ ] The total number of LFS objects is conveyed via the `X-Total-Count` response header.
- [ ] Pagination parameters (`page`, `per_page`) are accepted and behave correctly.
- [ ] The Web UI displays the LFS object list in the repository settings area with pagination controls.
- [ ] The CLI exposes a `codeplane lfs list` command that prints the object list in tabular and JSON formats.
- [ ] The TUI includes an LFS objects screen accessible from the repository detail view.
- [ ] All client surfaces handle the empty state (zero LFS objects) gracefully.
- [ ] The feature is gated behind the `REPO_LFS_OBJECT_LIST` feature flag.
- [ ] End-to-end tests covering API, CLI, and UI validation are passing.

### Pagination Constraints

- [ ] `page` defaults to `1` when omitted or when a non-positive integer is provided.
- [ ] `per_page` defaults to `30` when omitted or when a non-positive integer is provided.
- [ ] `per_page` is clamped to a maximum of `100` at the service layer and `50` at the route layer (the route layer enforces the stricter limit).
- [ ] Requesting a `page` beyond the last page of results returns an empty array with a valid `X-Total-Count` header (not a 404).
- [ ] Non-integer values for `page` or `per_page` are coerced via `parseInt` and default to their fallback if `NaN`.

### Data Constraints

- [ ] `oid` values in responses are always lowercase 64-character hexadecimal strings.
- [ ] `size` values are non-negative integers representing bytes.
- [ ] `created_at` values are ISO 8601 UTC timestamps.
- [ ] `id` values are positive integers, unique per repository.
- [ ] The list is ordered by `id` ascending (stable insertion order).

### Edge Cases

- [ ] A repository with zero LFS objects returns an empty array with `X-Total-Count: 0`.
- [ ] A private repository returns `403 Forbidden` for unauthenticated requests.
- [ ] A public repository returns LFS objects for unauthenticated viewers.
- [ ] A non-existent repository returns `404 Not Found`.
- [ ] An owner or repo name that is empty or whitespace-only returns `400 Bad Request`.
- [ ] The list endpoint does not expose the internal `gcs_path` / storage path field to consumers.
- [ ] Concurrent upload-confirm and list operations are safe — a newly confirmed object may or may not appear in an in-flight list request, but the response is always consistent (no partial rows).

### Boundary Constraints

- [ ] Repository names: 1–100 characters, lowercase alphanumeric plus hyphens and underscores.
- [ ] Owner names: 1–39 characters, lowercase alphanumeric plus hyphens.
- [ ] `page` parameter: integer ≥ 1 (values ≤ 0 normalized to 1).
- [ ] `per_page` parameter: integer in range [1, 50] at route layer, [1, 100] at service layer.
- [ ] Maximum total LFS objects per repository: no enforced hard limit at the list layer (pagination handles scale).

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/lfs/objects`

**Authentication**: Optional for public repositories; required for private repositories.

**Query Parameters**:

| Parameter  | Type    | Default | Max | Description                  |
|------------|---------|---------|-----|------------------------------|
| `page`     | integer | `1`     | —   | 1-indexed page number        |
| `per_page` | integer | `30`    | `50`| Number of results per page   |

**Success Response** (`200 OK`):

Headers:
```
X-Total-Count: 42
Content-Type: application/json
```

Body:
```json
[
  {
    "id": 1,
    "repository_id": 789,
    "oid": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    "size": 10485760,
    "created_at": "2026-03-15T08:30:00.000Z"
  }
]
```

**Error Responses**:

| Status | Condition                                       |
|--------|-------------------------------------------------|
| `400`  | Empty or whitespace-only owner or repo name     |
| `403`  | Private repo, viewer lacks read access           |
| `404`  | Repository does not exist                        |

### SDK Shape

The `LFSService.listObjects` method in `@codeplane/sdk` is the authoritative implementation:

```typescript
async listObjects(
  viewer: AuthUser | undefined,
  owner: string,
  repo: string,
  page: number,
  perPage: number
): Promise<{ items: LFSObjectResponse[]; total: number }>
```

Where `LFSObjectResponse` is:

```typescript
interface LFSObjectResponse {
  id: number;
  repository_id: number;
  oid: string;        // 64-char lowercase hex SHA-256
  size: number;       // bytes
  created_at: string; // ISO 8601
}
```

### CLI Command

**Command**: `codeplane lfs list`

**Options**:

| Flag         | Type    | Default | Description                         |
|--------------|---------|---------|-------------------------------------|
| `--repo`     | string  | auto    | Repository in `OWNER/REPO` format   |
| `--page`     | number  | `1`     | Page number                          |
| `--limit`    | number  | `30`    | Results per page                     |
| `--json`     | boolean | `false` | Output raw JSON                      |

**Default (tabular) output**:

```
LFS Objects for acme/my-repo (42 total)

OID                                                               SIZE        UPLOADED
abc123def456abc123def456abc123def456abc123def456abc123def456abc1    10.0 MB     2026-03-15
def456abc123def456abc123def456abc123def456abc123def456abc123def4    256.3 KB    2026-03-14
...

Page 1 of 2 — use --page 2 to see more
```

**JSON output**: Raw array from API response.

**Aliases**: `-R` rewrites to `--repo` per existing CLI convention.

### Web UI Design

**Location**: Repository Settings → "LFS Objects" tab (or panel within the existing repo settings layout).

**Layout**:

1. **Header**: "LFS Objects" with a count badge showing the total (e.g., "LFS Objects (42)").
2. **Empty State**: When there are zero objects, display a centered empty-state illustration with the message: "No LFS objects in this repository. Push large files tracked by Git LFS to see them listed here." Include a link to the Git LFS documentation guide.
3. **Table View**:
   - **Columns**:
     - **OID**: Truncated to first 12 characters with full OID in a tooltip and a copy-to-clipboard button.
     - **Size**: Human-readable (e.g., "10.0 MB", "256.3 KB", "1.2 GB").
     - **Uploaded**: Relative time (e.g., "3 days ago") with full ISO timestamp in a tooltip.
     - **Actions**: Delete button (visible only to users with write access).
   - Rows are striped for readability.
4. **Pagination**: Standard page-based navigation at the bottom — "Previous" / "Next" buttons with current page indicator (e.g., "Page 1 of 2") and total count. Disabled buttons at boundaries.
5. **Loading State**: Skeleton rows while the initial fetch is in flight.
6. **Error State**: Inline error banner if the fetch fails, with a "Retry" button.

**Responsive Behavior**:
- At narrow viewports (< 640px), the OID column truncates further and the "Uploaded" column collapses into a row subtitle.
- The delete action moves into a kebab (⋮) menu on narrow viewports.

### TUI UI

**Screen Name**: LFS Objects

**Access**: From the repository detail screen, select "LFS Objects" from the navigation menu.

**Layout**:

1. **Header**: `LFS Objects (42)` — repository name on left, total count on right.
2. **Column Headers** (bold, muted): `OID`, `SIZE`, `UPLOADED`
3. **Rows**: One per LFS object. OID truncated to terminal width. Size human-readable. Uploaded as relative time.
4. **Keybindings**:
   - `j`/`k` or `↑`/`↓`: Navigate rows.
   - `Enter`: View object detail (full OID, exact size, full timestamp).
   - `d`: Delete object (with confirmation; write access only).
   - `y`: Copy full OID to clipboard.
   - `q` / `Esc`: Return to repository detail.
   - `G` / `g g`: Jump to last / first item.
   - `Ctrl+D` / `Ctrl+U`: Page down / page up.
5. **Pagination**: Auto-fetch next page at 80% scroll. "Loading more…" indicator.
6. **Empty State**: Centered text: "No LFS objects."

**Responsive Columns**:
- **80×24** (minimum): OID (12 chars), Size, Uploaded (date only).
- **120×40**: OID (20 chars), Size, Uploaded (relative), ID.
- **200×60+**: OID (full 64 chars), Size (exact bytes + human), Uploaded (full timestamp), ID.

### Documentation

1. **Update `docs/guides/git-lfs.mdx`**: Add a "Viewing LFS Objects" section explaining how to browse LFS objects from the web UI, CLI, and TUI. Include API usage examples with `curl` and pagination. Document the response format and headers.
2. **CLI help text**: `codeplane lfs list --help` must describe all flags and include a usage example.
3. **API reference**: Add the `GET /api/repos/:owner/:repo/lfs/objects` endpoint with query parameters, response format, and error codes.

## Permissions & Security

### Authorization Matrix

| Role               | Can List LFS Objects? | Can Delete LFS Objects? |
|--------------------|----------------------|------------------------|
| Repository Owner   | ✅                    | ✅                      |
| Organization Owner | ✅                    | ✅                      |
| Admin Collaborator | ✅                    | ✅                      |
| Write Collaborator | ✅                    | ✅                      |
| Read Collaborator  | ✅                    | ❌                      |
| Team (admin)       | ✅                    | ✅                      |
| Team (write)       | ✅                    | ✅                      |
| Team (read)        | ✅                    | ❌                      |
| Anonymous (public) | ✅                    | ❌                      |
| Anonymous (private)| ❌ (403)             | ❌ (403)               |

### Permission Resolution Order

1. Check if the viewer is the repository's direct user-owner → full access.
2. Check if the repository is org-owned and the viewer is the org owner → full access.
3. Check the viewer's highest team permission for the repository.
4. Check the viewer's collaborator permission for the repository.
5. Take the highest of team and collaborator permissions.
6. If the repository is public and the viewer has no explicit permission → read access granted.
7. Otherwise → `403 Forbidden`.

### Rate Limiting

- The LFS object list endpoint inherits the global rate limiter configured in the Hono middleware stack.
- No additional per-endpoint rate limiting is required for the list operation, as it is a lightweight read query.
- If abuse is observed, a per-repository rate limit of **60 requests per minute per authenticated user** and **20 requests per minute per unauthenticated IP** should be introduced.

### Data Privacy

- The LFS object list does **not** expose file names, paths, or content. It only exposes content-addressable OIDs (SHA-256 hashes), sizes, and timestamps.
- The internal storage path (`gcs_path`) is **never** included in API responses.
- No PII is exposed in the LFS object response. The `repository_id` is an internal numeric identifier.
- For private repositories, the mere existence and count of LFS objects is considered repository-private data and requires authentication.

## Telemetry & Product Analytics

### Business Events

| Event Name             | Trigger                                           | Properties                                                                                                              |
|------------------------|---------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `LFSObjectListViewed`  | User loads the LFS object list (any surface)       | `repository_id`, `owner`, `repo`, `page`, `per_page`, `total_objects`, `viewer_id` (nullable), `client` (web/cli/tui/api), `is_public` |
| `LFSObjectListPageChanged` | User navigates to a different page              | `repository_id`, `page`, `per_page`, `client`                                                                           |
| `LFSObjectListEmpty`   | LFS object list returns zero results               | `repository_id`, `owner`, `repo`, `client`                                                                              |

### Funnel Metrics

1. **Adoption**: Percentage of active repositories where `LFSObjectListViewed` has fired at least once in the last 30 days.
2. **Engagement depth**: Average number of pages viewed per session (indicates whether users browse beyond page 1).
3. **Conversion to action**: Rate of `LFSObjectListViewed` → `LFSObjectDeleted` (indicates the list is being used as a management tool).
4. **Client distribution**: Breakdown of `LFSObjectListViewed` by `client` (web vs. CLI vs. TUI vs. raw API).
5. **Empty state rate**: Percentage of `LFSObjectListViewed` events where `total_objects == 0`.

### Success Indicators

- ≥ 30% of repositories with LFS objects have at least one `LFSObjectListViewed` event per month.
- Empty-state-to-documentation click-through rate exceeds 10%.
- CLI usage of `codeplane lfs list` grows month-over-month after launch.

## Observability

### Logging Requirements

| Log Point                          | Level  | Structured Context                                                    |
|------------------------------------|--------|-----------------------------------------------------------------------|
| LFS object list request received   | `info` | `owner`, `repo`, `page`, `per_page`, `viewer_id`, `request_id`       |
| LFS object list returned           | `info` | `owner`, `repo`, `total`, `items_returned`, `duration_ms`, `request_id` |
| Repository not found               | `warn` | `owner`, `repo`, `request_id`                                        |
| Permission denied                  | `warn` | `owner`, `repo`, `viewer_id`, `permission`, `request_id`             |
| Database query failure             | `error`| `owner`, `repo`, `error_message`, `error_code`, `request_id`         |
| Pagination normalization applied   | `debug`| `original_page`, `original_per_page`, `resolved_page`, `resolved_per_page` |

### Prometheus Metrics

| Metric Name                                    | Type      | Labels                                     | Description                                         |
|------------------------------------------------|-----------|---------------------------------------------|-----------------------------------------------------|
| `codeplane_lfs_object_list_requests_total`     | Counter   | `owner`, `repo`, `status_code`              | Total LFS object list requests                       |
| `codeplane_lfs_object_list_duration_seconds`   | Histogram | `owner`, `repo`                             | Request latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_lfs_object_list_items_returned`     | Histogram | —                                           | Number of items per response (buckets: 0, 1, 10, 30, 50, 100) |
| `codeplane_lfs_objects_total`                  | Gauge     | `repository_id`                             | Total LFS objects per repository (sampled on list)   |
| `codeplane_lfs_object_list_errors_total`       | Counter   | `error_type` (`not_found`, `forbidden`, `internal`) | Error breakdown                              |

### Alerts

#### Alert: `LFSObjectListHighErrorRate`
- **Condition**: `rate(codeplane_lfs_object_list_errors_total{error_type="internal"}[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs filtered by `request_id` for the failing requests.
  2. Verify database connectivity: run `SELECT 1` against the primary database.
  3. Check for database connection pool exhaustion (`pg_stat_activity`).
  4. Check for recent schema migrations that may have broken `lfs_objects` table queries.
  5. If database is healthy, check for OOM or resource exhaustion on the server process.
  6. Escalate to the data/infrastructure team if the issue persists beyond 15 minutes.

#### Alert: `LFSObjectListHighLatency`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_lfs_object_list_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check if a specific repository is generating slow queries (filter by `owner`, `repo` labels).
  2. Run `EXPLAIN ANALYZE` on the `listLFSObjects` query for the affected repository.
  3. Verify that the `lfs_objects` table has an index on `(repository_id, id)`.
  4. Check database CPU and I/O metrics for contention.
  5. If a single repository has millions of LFS objects, consider a count cache or materialized count.
  6. Temporarily increase `per_page` limits if clients are making excessive paginated requests.

#### Alert: `LFSObjectListAvailabilityDrop`
- **Condition**: `1 - (rate(codeplane_lfs_object_list_requests_total{status_code="200"}[10m]) / rate(codeplane_lfs_object_list_requests_total[10m])) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Immediately check error logs for the most common error type.
  2. If `403` errors dominate: check for misconfigured auth middleware or recent permissions changes.
  3. If `404` errors dominate: check for recent repository renames, transfers, or deletion waves.
  4. If `500` errors dominate: follow the `LFSObjectListHighErrorRate` runbook.
  5. Check for recent deployments that may have introduced a regression.
  6. If deployment-related, consider rolling back.

### Error Cases and Failure Modes

| Error Case                        | HTTP Status | Behavior                                                                 |
|-----------------------------------|-------------|--------------------------------------------------------------------------|
| Repository does not exist          | `404`       | Return `{"error": "repository not found"}`. Log at `warn`.              |
| Private repo, no auth             | `403`       | Return `{"error": "permission denied"}`. Log at `warn`.                 |
| Private repo, insufficient perms  | `403`       | Return `{"error": "permission denied"}`. Log at `warn`.                 |
| Empty owner or repo parameter      | `400`       | Return `{"error": "owner is required"}` or similar. Log at `warn`.      |
| Database connection failure        | `500`       | Return `{"error": "internal server error"}`. Log at `error` with trace. |
| Database query timeout             | `500`       | Return `{"error": "internal server error"}`. Log at `error`.            |
| Malformed page/per_page values     | —           | Silently normalize to defaults. Log at `debug`.                          |

## Verification

### API Integration Tests

- [ ] **List objects for a new empty repository**: Create a repository, call `GET /api/repos/:owner/:repo/lfs/objects`. Assert response is `200`, body is `[]`, and `X-Total-Count` is `0`.
- [ ] **List objects after uploading one object**: Create a repo, upload and confirm one LFS object, then list. Assert response contains exactly one item with matching `oid`, `size`, and a valid `created_at`.
- [ ] **List objects after uploading multiple objects**: Upload 5 objects, list with default pagination. Assert response contains 5 items, `X-Total-Count` is `5`, and items are ordered by `id` ascending.
- [ ] **Pagination — page 1 of 2**: Upload 40 objects, request `page=1&per_page=30`. Assert 30 items returned, `X-Total-Count` is `40`.
- [ ] **Pagination — page 2 of 2**: Same 40 objects, request `page=2&per_page=30`. Assert 10 items returned, `X-Total-Count` is `40`.
- [ ] **Pagination — page beyond last**: Request `page=100&per_page=30` on a repo with 5 objects. Assert `200`, empty array, `X-Total-Count` is `5`.
- [ ] **Pagination — per_page=1**: List with `per_page=1`. Assert exactly 1 item returned.
- [ ] **Pagination — per_page at maximum (50)**: Upload 60 objects, request `per_page=50`. Assert 50 items returned.
- [ ] **Pagination — per_page exceeds maximum**: Request `per_page=200`. Assert at most 50 items returned (route-layer clamp).
- [ ] **Pagination — per_page=0**: Assert defaults to 30 items (or total if < 30).
- [ ] **Pagination — page=0**: Assert behaves as page=1.
- [ ] **Pagination — page=-5**: Assert behaves as page=1.
- [ ] **Pagination — per_page=-10**: Assert defaults to 30.
- [ ] **Pagination — non-numeric page**: Pass `page=abc`. Assert defaults to page 1 (NaN → fallback).
- [ ] **Pagination — non-numeric per_page**: Pass `per_page=xyz`. Assert defaults to 30.
- [ ] **Response shape validation**: Assert each item has exactly `id` (number), `repository_id` (number), `oid` (string, 64 hex chars), `size` (number, > 0), `created_at` (valid ISO 8601 string). Assert `gcs_path` is **not** present.
- [ ] **OID format in response**: Assert all OIDs are exactly 64 lowercase hex characters.
- [ ] **Ordering**: Upload objects A, B, C in order. List and assert they appear in insertion order (by `id` ascending).
- [ ] **Public repo — unauthenticated access**: Create a public repo with LFS objects. List without auth. Assert `200` with correct data.
- [ ] **Private repo — unauthenticated access**: Create a private repo with LFS objects. List without auth. Assert `403`.
- [ ] **Private repo — authenticated with read access**: Add a collaborator with read permission. List as that user. Assert `200`.
- [ ] **Private repo — authenticated with no access**: List as a user with no relationship to the repo. Assert `403`.
- [ ] **Non-existent repository**: Call list on `nonexistent-owner/nonexistent-repo`. Assert `404`.
- [ ] **Non-existent owner, real repo name**: Assert `404`.
- [ ] **Empty owner parameter**: Request `/api/repos/%20/myrepo/lfs/objects`. Assert `400`.
- [ ] **Empty repo parameter**: Request `/api/repos/myowner/%20/lfs/objects`. Assert `400`.
- [ ] **X-Total-Count header correctness after deletion**: Upload N objects, delete M, assert `X-Total-Count` equals N - M.
- [ ] **Concurrent list and upload**: Start a list request and a confirm-upload concurrently. Assert both complete without errors.
- [ ] **List after delete**: Upload 3 objects, delete 1, list. Assert 2 items remain and deleted OID is absent.
- [ ] **Large object size**: Upload an object with `size` near `Number.MAX_SAFE_INTEGER` (9007199254740991). List and assert size is faithfully returned.
- [ ] **Maximum valid per_page (50)**: Assert response succeeds and contains up to 50 items.
- [ ] **per_page=51**: Assert response contains at most 50 items (clamped).

### CLI Integration Tests

- [ ] **`codeplane lfs list` — empty repo**: Run against a repo with no LFS objects. Assert clean output indicating no objects.
- [ ] **`codeplane lfs list` — with objects**: Upload objects, then list. Assert tabular output includes OID (truncated), human-readable size, and upload date.
- [ ] **`codeplane lfs list --json`**: Assert output is valid JSON array matching the API response shape.
- [ ] **`codeplane lfs list --page 2 --limit 10`**: Assert pagination parameters are passed correctly and output reflects page 2.
- [ ] **`codeplane lfs list --repo owner/repo`**: Assert explicit repo flag overrides auto-detection.
- [ ] **`codeplane lfs list -R owner/repo`**: Assert `-R` alias works.
- [ ] **`codeplane lfs list` — unauthenticated**: Assert clean error message for private repos.
- [ ] **`codeplane lfs list` — non-existent repo**: Assert clean error message indicating repo not found.

### Playwright (Web UI) E2E Tests

- [ ] **Navigate to LFS Objects tab**: Log in, navigate to repository settings, click "LFS Objects". Assert page loads with correct heading.
- [ ] **Empty state**: On a repo with no LFS objects, assert empty state message is displayed with documentation link.
- [ ] **Populated list**: On a repo with LFS objects, assert table renders with OID, Size, and Uploaded columns with at least one row.
- [ ] **OID truncation and tooltip**: Assert OID column shows truncated value; hovering reveals full 64-character OID.
- [ ] **Copy OID button**: Click copy button. Assert clipboard contains full 64-character OID.
- [ ] **Human-readable sizes**: Assert sizes displayed in human-readable format (KB, MB, GB).
- [ ] **Pagination controls**: On a repo with > 30 objects, assert "Next" is visible and clickable. Click and assert table updates.
- [ ] **Pagination boundary**: On page 1 assert "Previous" is disabled. On last page assert "Next" is disabled.
- [ ] **Delete button visibility — write access**: As write-access user, assert delete action is visible.
- [ ] **Delete button visibility — read-only access**: As read-only user, assert delete action is hidden.
- [ ] **Loading state**: Assert skeleton rows visible during initial fetch.
- [ ] **Error state**: Mock failed API response. Assert error banner with "Retry" button. Click retry, assert re-fetch.
- [ ] **Total count in header**: Assert header badge matches `X-Total-Count`.

### TUI Integration Tests

- [ ] **Navigate to LFS Objects screen**: From repository detail, select "LFS Objects". Assert screen renders with correct header.
- [ ] **Empty state**: On a repo with no objects, assert "No LFS objects." is displayed.
- [ ] **Row rendering**: Assert rows display truncated OID, human-readable size, and relative timestamp.
- [ ] **Keyboard navigation**: Press `j` to move down, `k` to move up. Assert highlight moves correctly.
- [ ] **Enter to view detail**: Press `Enter` on a row. Assert detail view shows full OID, exact size, and full timestamp.
- [ ] **`q` to exit**: Press `q`. Assert return to repository detail screen.
- [ ] **Auto-pagination**: Scroll to bottom. Assert additional items are fetched and "Loading more…" appears.

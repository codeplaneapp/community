# RELEASE_LIST

Specification for RELEASE_LIST.

## High-Level User POV

When working with a Codeplane repository, users need a clear way to browse and discover the published releases for that project. The release list is the primary surface where maintainers, contributors, and consumers go to find downloadable artifacts, changelogs, and versioned snapshots of a repository's history.

From the web UI, a user navigates to a repository's "Releases" tab and sees a chronologically ordered feed of releases — newest first. Each entry displays the release tag, title, author, publication date, and a preview of the release notes. Draft releases appear only for users who have write access to the repository, giving maintainers a staging area for upcoming releases without leaking unfinished announcements to the public. Pre-release entries are visually distinguished so consumers can easily tell stable releases apart from beta or release-candidate versions.

Users can filter the list to hide drafts or pre-releases when they only care about stable, published versions. Pagination keeps the list performant even for repositories with hundreds of releases. Each release entry links through to a detail view where users can read full release notes and download attached assets.

From the CLI, the `release list` command provides the same information in a terminal-friendly format. Users can pipe the output to other tools, filter by draft or pre-release status, and paginate through results. JSON output mode supports automation and scripting workflows.

From the TUI, a dedicated releases screen within the repository view lets keyboard-driven users browse releases with the same filtering and pagination capabilities as other clients.

The release list is essential for open-source distribution, internal deployment workflows, and agent-driven automation that needs to discover the latest version of a project programmatically.

## Acceptance Criteria

### Definition of Done

- [ ] Users can retrieve a paginated list of releases for any repository they have read access to.
- [ ] The list is ordered by publication date (or creation date for unpublished drafts) descending, with release ID as a tiebreaker.
- [ ] Each release entry includes: id, tag name, target commitish, display name, body (release notes), draft flag, prerelease flag, is_tag flag, author summary, assets array, created_at, updated_at, and published_at (if published).
- [ ] Draft releases are automatically excluded for unauthenticated users and authenticated users without write permission to the repository.
- [ ] Users with write or admin permission can see draft releases in the list.
- [ ] The `exclude_drafts` query parameter allows explicit filtering of draft releases even for users who could otherwise see them.
- [ ] The `exclude_prereleases` query parameter allows filtering of pre-release entries.
- [ ] Pagination uses `page` (1-indexed, default: 1) and `per_page` (default: 30, maximum: 50) parameters.
- [ ] The API response includes an `X-Total-Count` header with the total number of matching releases.
- [ ] An empty list returns HTTP 200 with an empty JSON array and `X-Total-Count: 0`.
- [ ] Requesting a repository that does not exist returns HTTP 404.
- [ ] Requesting a private repository without authentication or sufficient permission returns HTTP 404 (not 403, to avoid leaking repository existence).
- [ ] Invalid boolean query parameter values (anything other than `true`, `false`, `1`, `0`) return HTTP 400 with a descriptive error message.
- [ ] Non-integer or negative `page` values are handled gracefully (coerced to 1 via parseInt).
- [ ] `per_page` values exceeding 50 are clamped to 50.
- [ ] `per_page` values of 0 or negative are handled gracefully (returning a valid but empty page or defaulting).
- [ ] The feature works identically across API, CLI, and TUI clients.

### Edge Cases

- [ ] Repository with zero releases returns an empty array, not an error.
- [ ] Repository at the maximum release limit (1,000) returns the first page of results normally.
- [ ] Requesting page numbers beyond the last page returns an empty array with the correct total count.
- [ ] Release entries where `published_at` is null are sorted by `created_at` via COALESCE.
- [ ] Assets with `status: pending` (upload not yet confirmed) are still included in the asset array for the release.
- [ ] A release whose only distinction from another is the `id` is correctly sorted by `id DESC` as secondary ordering.
- [ ] Concurrent release creation during listing does not cause inconsistent pagination (offset-based pagination caveat is accepted).

### Boundary Constraints

- [ ] Maximum `per_page`: 50 (server-enforced cap).
- [ ] Maximum releases per repository: 1,000.
- [ ] Maximum assets per release: 50.
- [ ] Tag name maximum length: 255 characters.
- [ ] Release title maximum length: 255 characters.
- [ ] Asset name maximum length: 255 characters.
- [ ] Boolean query parameter values must be one of: `true`, `false`, `1`, `0`.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/releases`

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | 1-indexed page number |
| `per_page` | integer | `30` | Items per page (max 50) |
| `exclude_drafts` | boolean | `false` | When `true`, omit draft releases from results |
| `exclude_prereleases` | boolean | `false` | When `true`, omit pre-release versions from results |

**Response:** `200 OK`

**Response Headers:**
- `X-Total-Count`: Total number of releases matching the current filter criteria.

**Response Body:** JSON array of `ReleaseResponse` objects:

```json
[
  {
    "id": 42,
    "tag_name": "v1.2.0",
    "target_commitish": "main",
    "name": "Version 1.2.0",
    "body": "## What's Changed\n- Feature A\n- Bug fix B",
    "draft": false,
    "prerelease": false,
    "is_tag": false,
    "author": {
      "id": 7,
      "login": "alice"
    },
    "assets": [
      {
        "id": 101,
        "name": "app-linux-amd64.tar.gz",
        "size": 15728640,
        "content_type": "application/gzip",
        "status": "ready",
        "download_count": 342,
        "confirmed_at": "2026-03-20T10:30:00Z",
        "created_at": "2026-03-20T10:28:00Z",
        "updated_at": "2026-03-20T10:30:00Z"
      }
    ],
    "created_at": "2026-03-20T10:25:00Z",
    "updated_at": "2026-03-20T10:30:00Z",
    "published_at": "2026-03-20T10:30:00Z"
  }
]
```

**Error Responses:**

| Status | Condition |
|---|---|
| `400` | Invalid boolean query parameter value |
| `404` | Repository not found or insufficient access |
| `500` | Internal server error |

### SDK Shape

The `ReleaseService.listReleases` method is the authoritative service contract:

```typescript
listReleases(
  viewer: AuthUser | undefined,
  owner: string,
  repo: string,
  opts: ListReleasesOptions
): Promise<{ items: ReleaseResponse[]; total: number }>
```

Where `ListReleasesOptions` is:

```typescript
interface ListReleasesOptions {
  page: number;
  perPage: number;
  excludeDrafts: boolean;
  excludePrereleases: boolean;
}
```

The service handles permission-based draft filtering internally: if the viewer is unauthenticated or lacks write access, `excludeDrafts` is forced to `true` regardless of the caller's request.

### CLI Command

**Command:** `codeplane release list`

**Flags:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--page` | number | `1` | Page number |
| `--limit` | number | `30` | Results per page |
| `--drafts` | boolean | `false` | Include draft releases |
| `--prereleases` | boolean | `true` | Include pre-releases |
| `--repo` | string | (auto-detect) | Repository in `OWNER/REPO` format |

**Default output (text mode):**

A table with columns: TAG, NAME, STATUS, DATE. Drafts are labeled with a `[draft]` indicator. Pre-releases are labeled with a `[prerelease]` indicator.

**JSON output (`--json`):**

Returns the raw API response array, suitable for piping to `jq` or other tools.

**Behavior notes:**
- The `--drafts` flag defaults to `false`, meaning drafts are excluded unless the user explicitly asks for them via `--drafts`.
- The `--prereleases` flag defaults to `true`, meaning pre-releases are included by default.
- When `--drafts` is `false`, `exclude_drafts=true` is sent to the API.
- When `--prereleases` is `false`, `exclude_prereleases=true` is sent to the API.
- If `--repo` is not specified, the CLI infers the repository from the current working directory's jj/git remote.

### Web UI Design

**Route:** `/:owner/:repo/releases`

**Layout:**
- The release list is a top-level tab within the repository view, accessible from the repository navigation bar alongside Code, Issues, Landings, Workflows, Wiki, and Settings.
- The page header includes a "New release" button (visible only to users with write access).
- Below the header, a filter bar allows toggling:
  - "Include drafts" checkbox (visible only to users with write access).
  - "Include pre-releases" checkbox.
- The main content area displays a vertical list of release cards.

**Release card content:**
- Tag name displayed as a prominent badge (e.g., `v1.2.0`).
- Release title as the heading.
- Author avatar and login name.
- Relative timestamp (e.g., "3 days ago") with full date on hover.
- Draft badge (yellow, only shown for drafts).
- Pre-release badge (orange, only shown for pre-releases).
- Truncated release notes preview (first 3 lines or 200 characters).
- Asset count indicator (e.g., "3 assets").
- Total download count across all assets.

**Empty state:**
- When the repository has no releases: "No releases yet. Create your first release to distribute software to your users."
- When filters exclude all results: "No releases match the current filters."

**Pagination:**
- Page-based pagination controls at the bottom of the list.
- Displays "Showing X–Y of Z releases".
- Previous/Next buttons with page number indicators.

**Loading state:**
- Skeleton cards matching the release card layout during initial load.

**Error state:**
- Repository not found: redirect to 404 page.
- Network error: inline error message with retry action.

### TUI UI

**Screen:** Releases (accessible from repository detail navigation)

**Layout:**
- Selectable list of releases with vi-style navigation (j/k or arrow keys).
- Each row shows: tag name, title, draft/prerelease indicators, author, date.
- Footer shows pagination info and filter toggles.
- `d` key toggles draft inclusion, `p` key toggles pre-release inclusion.
- `Enter` navigates to release detail.
- `q` or `Escape` returns to the repository overview.

**Empty state:**
- Centered text: "No releases found."

### Documentation

The following end-user documentation should be written:

- **Releases overview page**: Explains what releases are, how they relate to tags and jj bookmarks, and the distinction between published, draft, and pre-release versions.
- **Browsing releases (Web)**: Step-by-step guide for navigating to the release list, using filters, and understanding the release card layout.
- **Listing releases (CLI)**: Reference for `codeplane release list` including all flags, output modes, and common usage patterns like `codeplane release list --json | jq '.[0].tag_name'`.
- **Listing releases (API)**: REST API reference for `GET /api/repos/:owner/:repo/releases` including query parameters, response schema, pagination headers, and authentication behavior for draft visibility.
- **Release visibility rules**: Explanation of how draft visibility works based on authentication and permission level.

## Permissions & Security

### Authorization Matrix

| Role | Can list public releases | Can see drafts | Can see pre-releases |
|---|---|---|---|
| Anonymous (public repo) | ✅ | ❌ | ✅ |
| Anonymous (private repo) | ❌ | ❌ | ❌ |
| Authenticated, no repo access | ✅ (public) / ❌ (private) | ❌ | ✅ |
| Read permission | ✅ | ❌ | ✅ |
| Write permission | ✅ | ✅ | ✅ |
| Admin permission | ✅ | ✅ | ✅ |
| Repository owner | ✅ | ✅ | ✅ |
| Organization owner | ✅ | ✅ | ✅ |

### Rate Limiting

- **Authenticated users:** 60 requests per minute per user for the release list endpoint.
- **Unauthenticated users:** 30 requests per minute per IP address.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) should be included in responses.
- HTTP 429 with `Retry-After` header when limits are exceeded.

### Data Privacy

- Private repository releases are not visible to unauthorized viewers. The API returns 404 (not 403) to avoid leaking the existence of private repositories.
- Release bodies may contain user-authored content including links and markdown; clients must sanitize rendered HTML to prevent XSS.
- Author information (id and login) is included in responses — this is public profile data, not PII.
- No email addresses, API tokens, or other sensitive data should ever appear in release response payloads.

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|---|---|---|
| `ReleaseListViewed` | User loads the release list (any client) | `repository_id`, `owner`, `repo`, `viewer_id` (nullable), `client` (web/cli/tui/api), `page`, `per_page`, `exclude_drafts`, `exclude_prereleases`, `result_count`, `total_count` |
| `ReleaseListFiltered` | User changes filter settings in the web UI or TUI | `repository_id`, `filter_type` (drafts/prereleases), `filter_value` (true/false), `client` |
| `ReleaseListPaginated` | User navigates to a non-first page | `repository_id`, `page`, `client` |

### Funnel Metrics

- **Discovery rate**: Percentage of repository visitors who navigate to the release list.
- **Drill-down rate**: Percentage of release list views that lead to a release detail view.
- **Download conversion**: Percentage of release list views that eventually lead to an asset download.
- **API adoption**: Ratio of API/CLI release list calls vs. web UI views, indicating automation adoption.
- **Draft workflow health**: How often users with write access view releases with drafts included, indicating active use of the draft staging workflow.

### Success Indicators

- Release list load time p95 < 200ms.
- > 80% of repositories with releases have had their release list viewed in the last 30 days.
- CLI `release list` usage grows month-over-month as automation workflows mature.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Release list request received | `debug` | `owner`, `repo`, `page`, `per_page`, `exclude_drafts`, `exclude_prereleases`, `viewer_id`, `request_id` |
| Release list response served | `info` | `owner`, `repo`, `result_count`, `total_count`, `duration_ms`, `status_code`, `request_id` |
| Draft filter override (forced for non-write user) | `debug` | `owner`, `repo`, `viewer_id`, `original_exclude_drafts`, `effective_exclude_drafts`, `request_id` |
| Release list query error | `error` | `owner`, `repo`, `error_message`, `error_code`, `request_id` |
| Repository not found during release list | `warn` | `owner`, `repo`, `viewer_id`, `request_id` |
| Invalid query parameter | `warn` | `owner`, `repo`, `parameter_name`, `parameter_value`, `request_id` |
| Rate limit exceeded | `warn` | `owner`, `repo`, `viewer_id`, `ip_address`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_release_list_requests_total` | counter | `owner`, `repo`, `status_code` | Total release list requests |
| `codeplane_release_list_duration_seconds` | histogram | `owner`, `repo` | Request duration in seconds (buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_release_list_results_total` | histogram | `owner`, `repo` | Number of results returned per request (buckets: 0, 1, 5, 10, 20, 30, 50) |
| `codeplane_release_list_errors_total` | counter | `owner`, `repo`, `error_type` | Errors during release listing (labels: `not_found`, `bad_request`, `internal`, `rate_limited`) |

### Alerts

**Alert: Release List Error Rate Spike**
- **Condition:** `rate(codeplane_release_list_errors_total{error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check the structured error logs for `release list query error` entries filtered by the last 10 minutes.
  2. Identify if the errors are database-related (connection timeouts, query failures) or application-level.
  3. If database-related: check PG connection pool status, run `SELECT pg_stat_activity` to look for blocking queries, and check disk I/O on the database host.
  4. If application-related: check recent deployments, review the error stack traces, and roll back if a regression is identified.
  5. Verify the `releases` table is not corrupted by running `SELECT count(*) FROM releases` and comparing to `X-Total-Count` from recent responses.

**Alert: Release List Latency Degradation**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_list_duration_seconds_bucket[5m])) > 0.5`
- **Severity:** Warning
- **Runbook:**
  1. Check if the latency spike correlates with increased traffic (check `codeplane_release_list_requests_total` rate).
  2. Run `EXPLAIN ANALYZE` on the release list query with typical parameters to check for missing indexes or sequential scans.
  3. Verify the index on `releases(repository_id, COALESCE(published_at, created_at) DESC, id DESC)` exists and is being used.
  4. Check if a specific repository has an unusually high number of releases (approaching the 1,000 limit) causing slower queries.
  5. If traffic-driven: check for automated scraping or abuse and consider IP-level rate limiting.

**Alert: Release List Availability Drop**
- **Condition:** `sum(rate(codeplane_release_list_requests_total{status_code=~"5.."}[5m])) / sum(rate(codeplane_release_list_requests_total[5m])) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Immediately check server health endpoint (`/health`) and database connectivity.
  2. Check for OOM kills or process restarts via system logs.
  3. Verify the release service is properly initialized in the service registry (check server startup logs for initialization errors).
  4. If the issue is isolated to release list: check for database migration issues that may have altered the `releases` table schema.
  5. Escalate to on-call database admin if the issue is persistent and database-related.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Repository not found | 404 | "Not found" | User should verify owner/repo spelling |
| Private repo, no auth | 404 | "Not found" | User should authenticate |
| Invalid boolean parameter | 400 | "invalid exclude_drafts value" / "invalid exclude_prereleases value" | User should use true/false/1/0 |
| Database connection failure | 500 | "Internal server error" | Automatic retry; alert fires |
| Query timeout | 500 | "Internal server error" | Alert fires; DBA investigates |
| Rate limit exceeded | 429 | "Rate limit exceeded" | User waits for reset window |
| Malformed page/per_page (NaN) | 200 | Returns results with defaulted page=NaN→1 | Client should validate inputs |

## Verification

### API Integration Tests

- [ ] **List releases for a public repository (unauthenticated)**: Create a repo with 3 published releases; GET without auth; verify 200, array of 3 items, correct fields present.
- [ ] **List releases returns correct ordering**: Create releases with different published_at timestamps; verify the list is ordered by `COALESCE(published_at, created_at) DESC, id DESC`.
- [ ] **List releases with pagination (page 1)**: Create 5 releases; GET with `per_page=2&page=1`; verify 2 items returned, `X-Total-Count=5`.
- [ ] **List releases with pagination (page 2)**: Same setup; GET with `per_page=2&page=2`; verify 2 different items returned.
- [ ] **List releases with pagination (last page partial)**: GET with `per_page=2&page=3`; verify 1 item returned, `X-Total-Count=5`.
- [ ] **List releases with pagination (beyond last page)**: GET with `per_page=2&page=10`; verify empty array, `X-Total-Count=5`.
- [ ] **Default pagination values**: GET without page/per_page params; verify defaults to page 1 with up to 30 items.
- [ ] **per_page clamped to 50**: Create 51 releases; GET with `per_page=100`; verify at most 50 items returned.
- [ ] **per_page=0 handled gracefully**: GET with `per_page=0`; verify the response is valid (empty or defaults).
- [ ] **Draft exclusion for unauthenticated users**: Create 2 published + 1 draft release; GET without auth; verify only 2 items returned, no drafts.
- [ ] **Draft inclusion for write-access users**: Same setup; GET as authenticated user with write access; verify 3 items returned (including draft).
- [ ] **Draft exclusion for read-only users**: Same setup; GET as authenticated user with only read access; verify only 2 items returned, no drafts.
- [ ] **Explicit exclude_drafts=true for write-access users**: GET as write user with `exclude_drafts=true`; verify drafts are excluded even though user could see them.
- [ ] **exclude_prereleases=true**: Create 2 stable + 1 prerelease; GET with `exclude_prereleases=true`; verify only 2 stable releases returned.
- [ ] **Both filters combined**: Create 1 published, 1 draft, 1 prerelease, 1 draft+prerelease; GET as write user with both `exclude_drafts=true&exclude_prereleases=true`; verify only the 1 published release returned.
- [ ] **Invalid exclude_drafts value**: GET with `exclude_drafts=yes`; verify 400 with descriptive error.
- [ ] **Invalid exclude_prereleases value**: GET with `exclude_prereleases=maybe`; verify 400 with descriptive error.
- [ ] **Boolean values as 1/0**: GET with `exclude_drafts=1&exclude_prereleases=0`; verify correct filtering behavior.
- [ ] **X-Total-Count header present**: Verify the `X-Total-Count` header is present and correct on every successful response.
- [ ] **X-Total-Count reflects filters**: Create 3 published + 2 draft; GET without auth; verify `X-Total-Count=3` (not 5).
- [ ] **Empty repository (no releases)**: GET for a repo with no releases; verify 200 with empty array and `X-Total-Count=0`.
- [ ] **Repository not found**: GET with nonexistent owner/repo; verify 404.
- [ ] **Private repository without auth**: Create a private repo with releases; GET without auth; verify 404.
- [ ] **Private repository with auth and access**: GET with authenticated user who has access; verify 200 with correct releases.
- [ ] **Response body schema validation**: Verify every field in the response matches the expected type (id: number, tag_name: string, draft: boolean, assets: array, etc.).
- [ ] **Assets included in release list items**: Create a release with 2 assets (confirmed); verify the list includes both assets with correct fields.
- [ ] **Release with no assets**: Verify releases with empty asset arrays are included and `assets` is `[]`.
- [ ] **published_at present for published releases**: Verify `published_at` is a valid ISO8601 timestamp for non-draft releases.
- [ ] **published_at absent for draft releases**: Verify `published_at` is null/undefined for draft releases.
- [ ] **Maximum per_page boundary (50)**: Create 51 releases; GET with `per_page=50`; verify exactly 50 returned.
- [ ] **Repository at maximum release limit (1000)**: Create 1000 releases; GET with default pagination; verify the first page returns 30 items with `X-Total-Count=1000`.

### CLI Integration Tests

- [ ] **`release list` basic output**: Create releases; run `codeplane release list --repo OWNER/REPO`; verify output contains release tag names and titles.
- [ ] **`release list --json`**: Run with `--json` flag; verify output is valid JSON array with expected fields.
- [ ] **`release list --limit`**: Run with `--limit 2`; verify only 2 items returned.
- [ ] **`release list --page`**: Run with `--page 2 --limit 1`; verify different release than page 1.
- [ ] **`release list --drafts`**: Run with `--drafts`; verify draft releases are included in output.
- [ ] **`release list` without `--drafts`**: Verify draft releases are excluded by default.
- [ ] **`release list --no-prereleases`** (or `--prereleases false`): Verify pre-releases are excluded.
- [ ] **`release list` with auto-detected repo**: Run in a directory with a jj/git remote configured; verify the repo is resolved automatically.
- [ ] **`release list` for nonexistent repo**: Verify clear error message.
- [ ] **`release list` empty repository**: Verify graceful output indicating no releases.

### Web UI E2E Tests (Playwright)

- [ ] **Navigate to releases tab**: Go to `/:owner/:repo/releases`; verify the page loads with a release list or empty state.
- [ ] **Release cards display correct data**: Create releases via API; navigate to list; verify tag name, title, author, date, and badges are visible.
- [ ] **Draft badge visibility for write-access user**: Log in as repo admin; verify draft releases show a "Draft" badge.
- [ ] **Draft releases hidden for read-only user**: Log in as a user with read access; verify draft releases are not visible.
- [ ] **Pre-release badge**: Verify pre-release entries display a distinct pre-release badge.
- [ ] **Filter: exclude drafts checkbox**: Toggle the drafts filter; verify the list updates to show/hide draft entries.
- [ ] **Filter: exclude pre-releases checkbox**: Toggle the pre-releases filter; verify the list updates accordingly.
- [ ] **Pagination controls**: Create enough releases to span multiple pages; verify Previous/Next buttons work and page indicators update.
- [ ] **Empty state**: Navigate to releases for a repo with no releases; verify the empty state message is displayed.
- [ ] **Empty state with filters**: Apply filters that exclude all releases; verify the filter-specific empty message is shown.
- [ ] **Release card click navigates to detail**: Click a release card; verify navigation to the release detail view.
- [ ] **"New release" button visibility**: Verify the button appears for write-access users and is hidden for read-only users.
- [ ] **Loading state**: Intercept the API request to delay it; verify skeleton/loading UI is displayed.
- [ ] **Error state**: Intercept the API request to return 500; verify an error message with retry is shown.
- [ ] **Asset count displayed on card**: Create a release with assets; verify the card shows the correct asset count.
- [ ] **Responsive layout**: Verify the release list renders correctly on mobile-width viewports.

### TUI Tests

- [ ] **Navigate to releases screen**: Verify the releases screen is accessible from the repository navigation.
- [ ] **Release list displays entries**: Verify release tag names, titles, and dates are rendered in the list.
- [ ] **Keyboard navigation**: Verify j/k or arrow keys move selection between releases.
- [ ] **Enter navigates to detail**: Press Enter on a selected release; verify navigation to release detail screen.
- [ ] **Draft filter toggle**: Press `d` to toggle draft inclusion; verify the list updates.
- [ ] **Pre-release filter toggle**: Press `p` to toggle pre-release inclusion; verify the list updates.
- [ ] **Empty state**: Open releases for a repo with no releases; verify centered empty message.
- [ ] **Pagination**: Navigate through multiple pages if enough releases exist.

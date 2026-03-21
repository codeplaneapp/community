# REPO_STARGAZERS_LIST

Specification for REPO_STARGAZERS_LIST.

## High-Level User POV

When users visit a repository on Codeplane, they want to know who else finds that repository valuable. The stargazers list provides social proof and community visibility by showing all users who have starred a given repository. This is the complement to the star/unstar action — once a repository accumulates stars, anyone browsing the repository should be able to see who has expressed interest.

A developer browsing an open-source project may want to see which colleagues or community members have starred it, to gauge community interest, to discover collaborators, or simply to confirm that the project is actively valued by peers. The stargazers list surfaces this information in a paginated, browsable format across every Codeplane surface: the web UI, CLI, TUI, and API.

For public repositories, the stargazers list is visible to everyone, including unauthenticated visitors. For private repositories, only users with read access can see the list. The total star count is always visible as a number on the repository overview; the stargazers list expands that number into identifiable user profiles — showing username, display name, and avatar for each stargazer.

The stargazers list is a read-only social discovery surface. Users cannot modify who appears on the list (that is governed by the star/unstar actions, which are separate features). The list is ordered consistently and supports pagination so that repositories with thousands of stargazers remain usable.

## Acceptance Criteria

### Definition of Done

- [ ] The `GET /api/repos/:owner/:repo/stargazers` endpoint returns a paginated list of users who have starred the repository.
- [ ] The response includes `id`, `username`, `display_name`, and `avatar_url` for each stargazer.
- [ ] The response sets an `X-Total-Count` header with the total number of stargazers.
- [ ] Pagination uses cursor/limit query parameters (`page` and `per_page`).
- [ ] The default page size is 30 items. The maximum page size is 100 items.
- [ ] A `per_page` value below 1 is normalized to 30. A value above 100 is clamped to 100.
- [ ] A `page` value below 1 is normalized to 1.
- [ ] For public repositories, unauthenticated users can view the stargazers list.
- [ ] For private repositories, only users with read access to the repository can view the stargazers list; unauthenticated users receive a 404 (not a 403, to avoid leaking repo existence).
- [ ] If the repository does not exist, the API returns 404.
- [ ] If the `owner` path parameter is empty or missing, the API returns 400 with `"owner is required"`.
- [ ] If the `repo` path parameter is empty or missing, the API returns 400 with `"repository name is required"`.
- [ ] A repository with zero stars returns an empty array `[]` with `X-Total-Count: 0`.
- [ ] Stargazers are returned ordered by user ID ascending (stable, deterministic ordering).
- [ ] The list does not expose private user fields (email, wallet address, admin status, login status, search vector, etc.).
- [ ] The web UI has a "Stargazers" tab or page accessible from the repository navigation.
- [ ] The CLI provides a `codeplane repo stargazers <owner/repo>` command that lists stargazers.
- [ ] The TUI can display stargazers for a repository.
- [ ] All clients correctly handle pagination for repositories with many stargazers.
- [ ] The feature is documented in the OpenAPI specification.

### Edge Cases

- [ ] A user who has been deactivated (`is_active = false`) should still appear in the stargazers list if they have an active star record (their star is not automatically removed on deactivation).
- [ ] A user who starred and then unstarred the repository does NOT appear in the stargazers list.
- [ ] Requesting a page beyond the total number of pages returns an empty array (not an error).
- [ ] Non-numeric `page` or `per_page` values are handled gracefully (either treated as defaults or returned as 400 errors per the pagination library behavior).
- [ ] Repository names with special characters (hyphens, underscores, dots) are handled correctly.
- [ ] Owner names are case-insensitive for repository resolution.
- [ ] The reserved name `"stargazers"` cannot be used as a repository name (already enforced at repo creation).

### Boundary Constraints

- [ ] `page`: integer ≥ 1 (values < 1 normalized to 1)
- [ ] `per_page`: integer, 1–100 (values < 1 normalized to 30, values > 100 clamped to 100)
- [ ] `owner`: non-empty string, must match an existing user or organization
- [ ] `repo`: non-empty string, must match an existing repository under the given owner
- [ ] Response array length: 0 to `per_page` items
- [ ] `X-Total-Count` header: integer ≥ 0

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/stargazers`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | yes | Repository owner username or organization name |
| `repo` | string | yes | Repository name |

**Query Parameters:**
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | integer | 1 | — | 1-based page number |
| `per_page` | integer | 30 | 100 | Number of results per page |

**Response: `200 OK`**

Headers:
- `X-Total-Count: <total_stargazers>`
- `Content-Type: application/json`

Body:
```json
[
  {
    "id": 42,
    "username": "alice",
    "display_name": "Alice Developer",
    "avatar_url": "https://example.com/avatars/alice.png"
  }
]
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | User's numeric ID |
| `username` | string | User's login handle |
| `display_name` | string | User's human-readable display name |
| `avatar_url` | string | URL to the user's avatar image |

**Error Responses:**
| Status | Condition |
|--------|----------|
| 400 | Missing or empty `owner` or `repo` parameter |
| 404 | Repository not found, or private repo accessed by unauthorized/unauthenticated user |

### SDK Shape

The `RepoService` class exposes:

```typescript
listRepoStargazers(
  viewer: RepoActor | null,
  owner: string,
  repo: string,
  page: number,
  perPage: number
): Promise<Result<{ users: StargazerRow[]; total: number }, APIError>>
```

- `viewer` is null for unauthenticated requests.
- The method first resolves the repository through `resolveReadableRepo`, which enforces visibility/access checks.
- Pagination is normalized internally (page ≥ 1, perPage clamped to 1–100).

### CLI Command

**Command:** `codeplane repo stargazers <owner/repo>`

**Flags:**
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--page` | integer | 1 | Page number |
| `--per-page` | integer | 30 | Results per page |
| `--json` | boolean | false | Output as structured JSON |

**Default Output (table format):**
```
USERNAME        DISPLAY NAME         AVATAR
alice           Alice Developer      https://…
bob             Bob Engineer         https://…

Total: 47 stargazers (showing page 1 of 2)
```

**JSON Output:**
```json
{
  "stargazers": [
    {
      "id": 42,
      "username": "alice",
      "display_name": "Alice Developer",
      "avatar_url": "https://example.com/avatars/alice.png"
    }
  ],
  "total": 47,
  "page": 1,
  "per_page": 30
}
```

**Error handling:**
- If the repo is not found, display `"Error: repository not found"` and exit with code 1.
- If not authenticated and the repo is private, display `"Error: repository not found"` and exit with code 1.

### Web UI Design

**Location:** A "Stargazers" tab within the repository navigation, accessible at `/:owner/:repo/stargazers`.

**Layout:**
- Page heading: "Stargazers" with the total count displayed as a badge (e.g., "Stargazers · 47").
- User list rendered as a vertical card list or avatar-row list, each entry showing:
  - Avatar image (circular, 32×32px)
  - Username as a clickable link to the user's profile (`/:username`)
  - Display name in secondary text
- Pagination controls at the bottom of the list (page-based navigation or "Load more").
- Empty state: when no stargazers exist, show a centered message: "No one has starred this repository yet."

**Repository sidebar/header:**
- The star count already appears in the repository overview. It should link to the stargazers page.

### TUI UI

**Screen:** Stargazers list accessible from the repository detail view.

**Layout:**
- Title bar: `Stargazers — owner/repo (47 total)`
- Scrollable list of entries, each showing: `@username — Display Name`
- Keyboard navigation: `j`/`k` or arrow keys to scroll, `Enter` to view user profile, `q` to go back
- Pagination: automatic page loading on scroll, or `n`/`p` for next/previous page
- Empty state: `"No stargazers yet."`

### Documentation

- **OpenAPI specification:** The `GET /api/repos/:owner/:repo/stargazers` endpoint must be fully documented with request parameters, response schema (array of stargazer objects), error responses, and pagination headers.
- **CLI help text:** `codeplane repo stargazers --help` must describe the command, its arguments, and flags.
- **User guide:** A section in the repository collaboration documentation explaining what stargazers are, how to view them, and how the star count relates to the stargazers list.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Anonymous (unauthenticated) | Can view stargazers of **public** repositories only |
| Authenticated user (any) | Can view stargazers of **public** repositories and any **private** repository they have read access to |
| Repository member (Read/Write/Admin/Owner) | Can view stargazers |
| Organization member | Can view stargazers of org repos they have access to |
| Site admin | Can view stargazers of all repositories |

**Important:** Private repository access denial MUST return 404 (not 403) to avoid leaking the existence of private repositories.

### Rate Limiting

- **Unauthenticated requests:** Standard API rate limit (shared across all unauthenticated API endpoints). Recommended: 60 requests/hour per IP.
- **Authenticated requests:** Standard authenticated rate limit. Recommended: 5,000 requests/hour per user.
- The stargazers list endpoint is read-only and cacheable; it does not require stricter rate limiting than other list endpoints.

### Data Privacy

- The response MUST NOT include the user's email address, wallet address, admin status, login prohibition status, bio, or any internal fields.
- Only public profile information (`id`, `username`, `display_name`, `avatar_url`) is returned.
- Users who have starred a repository have implicitly consented to their username appearing in the stargazers list — this is inherently a public social signal.
- The `search_vector`, `lower_username`, `lower_email`, and other internal fields from the database query MUST be filtered out at the route layer.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `RepoStargazersViewed` | A user views the stargazers list (any page) | `repo_id`, `repo_owner`, `repo_name`, `viewer_id` (null if anonymous), `page`, `per_page`, `total_stargazers`, `client` (web/cli/tui/api) |

### Key Properties

- `repo_id`: Numeric repository ID
- `repo_owner`: Owner username string
- `repo_name`: Repository name string
- `viewer_id`: Authenticated user ID, or null for anonymous
- `page`: Page number requested
- `per_page`: Page size requested
- `total_stargazers`: Total count of stargazers at time of request
- `client`: Identifies the surface that triggered the view (web, cli, tui, api, vscode, neovim)

### Success Indicators

- **Engagement rate:** Percentage of repository page views that navigate to the stargazers list. A healthy baseline is 2–5% of repository visitors clicking through to stargazers.
- **Pagination depth:** Average page depth viewed. High pagination depth indicates the list is being actively browsed, not just glanced at.
- **Downstream navigation:** Percentage of stargazers list views that lead to a user profile click (indicates social discovery value).
- **Correlation with star actions:** Track whether viewing the stargazers list correlates with increased starring activity (discovery-driven engagement).
- **Zero-result rate:** Percentage of stargazers list views returning an empty list. A very high rate may indicate the feature is discoverable but not useful until repos accumulate stars.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Stargazers list request received | `DEBUG` | `owner`, `repo`, `page`, `per_page`, `viewer_id`, `request_id` | Entry point logging for the request |
| Stargazers list request completed | `INFO` | `owner`, `repo`, `total_stargazers`, `result_count`, `duration_ms`, `request_id` | Successful response logging |
| Repository not found for stargazers | `WARN` | `owner`, `repo`, `viewer_id`, `request_id` | Indicates a 404 — could be legitimate or a probe |
| Repository access denied for stargazers | `WARN` | `owner`, `repo`, `viewer_id`, `request_id` | Private repo accessed by unauthorized user (still returns 404) |
| Stargazers list internal error | `ERROR` | `owner`, `repo`, `error_message`, `stack_trace`, `request_id` | Unexpected error in the handler or service layer |
| Pagination parameter validation failure | `WARN` | `raw_page`, `raw_per_page`, `request_id` | Non-numeric or out-of-range pagination values |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_repo_stargazers_list_requests_total` | Counter | `status` (200, 400, 404, 500), `owner` | Total stargazers list requests |
| `codeplane_repo_stargazers_list_duration_seconds` | Histogram | `status` | Request latency distribution (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_repo_stargazers_list_result_count` | Histogram | — | Number of stargazers returned per request (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_repo_stargazers_total` | Gauge | `owner`, `repo` | Total stargazer count per repository (updated on star/unstar, not per list request) |

### Alerts

#### Alert: `StargazersListHighErrorRate`
- **Condition:** `rate(codeplane_repo_stargazers_list_requests_total{status="500"}[5m]) / rate(codeplane_repo_stargazers_list_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Summary:** More than 5% of stargazers list requests are returning 500 errors.
- **Runbook:**
  1. Check server logs for `ERROR`-level entries with `stargazers` context in the last 15 minutes.
  2. Look for database connection errors or query timeouts — the stargazers query joins `stars` and `users` tables.
  3. Check if the `stars` table is locked or experiencing high contention (concurrent star/unstar operations).
  4. Verify that the `users` table is healthy and the join index on `stars.user_id` is not degraded.
  5. If the issue is a specific repository with an abnormally large stargazer count, check for pagination edge cases or query plan regression.
  6. Restart the server process if the issue appears to be a connection pool exhaustion.

#### Alert: `StargazersListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_repo_stargazers_list_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Summary:** 95th percentile latency for stargazers list requests exceeds 2 seconds.
- **Runbook:**
  1. Check for slow database queries by inspecting structured logs for `duration_ms` values above 1000.
  2. Run `EXPLAIN ANALYZE` on the `ListRepoStargazers` query for the affected repository to check query plan.
  3. Verify that the index on `stars.repository_id` exists and is being used.
  4. Check if the affected repository has an unusually high stargazer count (>100K) that might cause sequential scan fallback.
  5. Consider adding a composite index on `(repository_id, user_id)` to the `stars` table if missing.
  6. Check overall database CPU and I/O utilization for saturation.

#### Alert: `StargazersListHigh404Rate`
- **Condition:** `rate(codeplane_repo_stargazers_list_requests_total{status="404"}[5m]) > 50`
- **Severity:** Info
- **Summary:** High rate of 404 responses on stargazers list endpoint — may indicate enumeration/probing.
- **Runbook:**
  1. Check request logs for repeated 404s from the same IP or user agent.
  2. If a single IP is generating most 404s, confirm rate limiting is active and consider temporary IP block.
  3. Verify that the 404 responses do not leak information about repository existence (private repos should return 404, not 403).
  4. If the 404s are from legitimate users, check whether a repository was recently deleted, renamed, or transferred.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status |
|------------|-------------------|-------------|
| Repository does not exist | Return "not found" error | 404 |
| Private repo, unauthenticated viewer | Return "not found" error (same as non-existent) | 404 |
| Private repo, authenticated but no access | Return "not found" error (same as non-existent) | 404 |
| Empty owner parameter | Return "owner is required" | 400 |
| Empty repo parameter | Return "repository name is required" | 400 |
| Database connection failure | Return internal error, log ERROR | 500 |
| Database query timeout | Return internal error, log ERROR | 500 |
| Invalid pagination parameters | Normalize to defaults (graceful degradation) | 200 |
| Page beyond total pages | Return empty array with correct X-Total-Count | 200 |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `API-SG-001` | GET stargazers for a public repo with 0 stars | 200, empty array, `X-Total-Count: 0` |
| `API-SG-002` | GET stargazers for a public repo with 1 star | 200, array with 1 entry, correct user fields |
| `API-SG-003` | GET stargazers for a public repo with multiple stars, default pagination | 200, up to 30 entries, correct `X-Total-Count` |
| `API-SG-004` | GET stargazers with `per_page=5` for a repo with 12 stars, page 1 | 200, 5 entries, `X-Total-Count: 12` |
| `API-SG-005` | GET stargazers with `per_page=5` for a repo with 12 stars, page 3 | 200, 2 entries, `X-Total-Count: 12` |
| `API-SG-006` | GET stargazers with `per_page=5` for a repo with 12 stars, page 4 (beyond last) | 200, empty array, `X-Total-Count: 12` |
| `API-SG-007` | GET stargazers with `per_page=0` (below minimum) | 200, normalized to 30 per page |
| `API-SG-008` | GET stargazers with `per_page=200` (above maximum) | 200, clamped to 100 per page |
| `API-SG-009` | GET stargazers with `page=0` (below minimum) | 200, normalized to page 1 |
| `API-SG-010` | GET stargazers with `per_page=100` for a repo with exactly 100 stars | 200, 100 entries — validates maximum page size works |
| `API-SG-011` | GET stargazers with `per_page=101` for a repo with 101 stars | 200, clamped to 100 entries |
| `API-SG-012` | GET stargazers for a nonexistent repo | 404 |
| `API-SG-013` | GET stargazers for a nonexistent owner | 404 |
| `API-SG-014` | GET stargazers with empty owner (if route allows) | 400, `"owner is required"` |
| `API-SG-015` | GET stargazers with empty repo name (if route allows) | 400, `"repository name is required"` |
| `API-SG-016` | GET stargazers for a private repo, unauthenticated | 404 |
| `API-SG-017` | GET stargazers for a private repo, authenticated user without access | 404 |
| `API-SG-018` | GET stargazers for a private repo, authenticated user with read access | 200, correct stargazers |
| `API-SG-019` | GET stargazers for a private repo as repository owner | 200, correct stargazers |
| `API-SG-020` | Verify response does NOT contain `email`, `wallet_address`, `is_admin`, `bio`, `search_vector` fields | No private fields in response |
| `API-SG-021` | Verify response contains exactly `id`, `username`, `display_name`, `avatar_url` for each entry | All and only expected fields present |
| `API-SG-022` | Verify stargazers are ordered by user ID ascending | IDs in strictly ascending order |
| `API-SG-023` | Star a repo, then verify the user appears in stargazers list | User appears in list |
| `API-SG-024` | Star a repo, unstar it, then verify the user does NOT appear in stargazers list | User absent from list |
| `API-SG-025` | Star a repo twice (idempotent), verify user appears only once in list | Single entry |
| `API-SG-026` | Verify `X-Total-Count` header is present and is an integer | Header exists and is numeric |
| `API-SG-027` | GET stargazers for a repo with a hyphenated name (e.g., `my-cool-repo`) | 200, correct response |
| `API-SG-028` | GET stargazers for a repo owned by an organization | 200, correct response |
| `API-SG-029` | Verify content-type is `application/json` | Correct content type |
| `API-SG-030` | GET stargazers with non-numeric `page` value (e.g., `page=abc`) | Graceful handling (400 or normalize to default) |
| `API-SG-031` | GET stargazers with negative `per_page` (e.g., `per_page=-5`) | Normalized to default (30) |

### CLI E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `CLI-SG-001` | `codeplane repo stargazers owner/repo` for a repo with stars | Lists stargazers in table format, exit code 0 |
| `CLI-SG-002` | `codeplane repo stargazers owner/repo --json` | Outputs valid JSON with stargazers array and total |
| `CLI-SG-003` | `codeplane repo stargazers owner/repo --page 2 --per-page 5` | Correct pagination applied |
| `CLI-SG-004` | `codeplane repo stargazers nonexistent/repo` | Error message, exit code 1 |
| `CLI-SG-005` | `codeplane repo stargazers owner/repo` for a repo with 0 stars | Empty list or "no stargazers" message, exit code 0 |
| `CLI-SG-006` | `codeplane repo stargazers` (missing repo argument) | Usage error, exit code 1 |

### Web UI Playwright E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `UI-SG-001` | Navigate to `/:owner/:repo/stargazers` for a public repo with stars | Page loads, stargazers are displayed with avatar, username, display name |
| `UI-SG-002` | Navigate to stargazers page for a repo with 0 stars | Empty state message is displayed |
| `UI-SG-003` | Click a stargazer's username | Navigates to the user's profile page |
| `UI-SG-004` | Navigate to stargazers page for a private repo while unauthenticated | 404 page or redirect to login |
| `UI-SG-005` | Navigate to stargazers page for a nonexistent repo | 404 page |
| `UI-SG-006` | Verify the star count badge/link on repo overview links to stargazers page | Click navigates to `/:owner/:repo/stargazers` |
| `UI-SG-007` | Verify pagination controls work when there are more stargazers than one page | Next page loads different users, page controls update |
| `UI-SG-008` | Star a repo, then navigate to its stargazers page | Current user appears in the list |
| `UI-SG-009` | Unstar a repo, then navigate to its stargazers page | Current user does NOT appear in the list |
| `UI-SG-010` | Verify each stargazer entry displays avatar image, username, and display name | All elements are visible and correctly rendered |

### TUI Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `TUI-SG-001` | Open stargazers screen for a repo with stars | Stargazers listed with username and display name |
| `TUI-SG-002` | Open stargazers screen for a repo with 0 stars | Empty state message displayed |
| `TUI-SG-003` | Navigate stargazers list with `j`/`k` keys | Cursor moves correctly |
| `TUI-SG-004` | Press `Enter` on a stargazer | Navigates to user profile view |
| `TUI-SG-005` | Pagination loads when scrolling past current page | Next page of stargazers loads seamlessly |

# USER_STARRED_REPOSITORY_LIST

Specification for USER_STARRED_REPOSITORY_LIST.

## High-Level User POV

When you want to see which repositories a user has starred — either your own or someone else's — Codeplane gives you a paginated, browsable list from every client surface.

On the web, the starred repositories list appears as a tab on the user profile page. When you visit someone's profile and click the "Starred" tab, you see every public repository they've starred, ordered by when they starred it (most recent first). Each repository entry shows the repository name (as a link), its owner, a short description, star count, default bookmark name, and when it was last updated. If the user hasn't starred anything, you see a friendly empty-state message rather than a blank page.

When you're viewing your own stars — either by visiting your own profile or through a dedicated "my starred repos" surface — you see both your public and private starred repositories. Other visitors only see the public ones. This distinction is automatic: Codeplane never leaks the existence of private repositories to anyone who shouldn't see them.

From the CLI, you can list your own starred repositories with `codeplane repo list --starred`, or view another user's starred repositories with `codeplane user starred <username>`. Both commands support `--json` for structured machine-readable output and pagination flags for working with large star lists.

From the TUI, starred repositories appear in the user profile detail screen with the same tab-switching model as the web UI.

The starred repository list is a lightweight but important social and discovery feature. It helps you bookmark repositories for later, signal interest to maintainers, and browse what colleagues or community members find noteworthy.

## Acceptance Criteria

### Definition of Done

- [ ] Any visitor (authenticated or anonymous) can list the public starred repositories of any active user by username.
- [ ] Authenticated users can list their own starred repositories (including private repos they have starred) via `GET /api/user/starred`.
- [ ] The public endpoint `GET /api/users/:username/starred` returns only repositories where `is_public = true`.
- [ ] Results are ordered by star creation time descending (most recently starred first), with star ID as tiebreaker.
- [ ] The response is paginated with `X-Total-Count` and `Link` headers.
- [ ] Each repository item in the response includes: `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`.
- [ ] Requesting a nonexistent username returns 404 with `{ "message": "user not found" }`.
- [ ] Requesting a deactivated/disabled user returns 404 (no information leak).
- [ ] Username resolution is case-insensitive.
- [ ] The CLI command `codeplane repo list --starred` lists the authenticated user's starred repos.
- [ ] The CLI command `codeplane user starred <username>` lists a public user's starred repos.
- [ ] Both CLI commands support `--json`, `--limit`, and `--page` flags.
- [ ] The web UI "Starred" tab on a user profile displays starred repos with pagination controls.
- [ ] The TUI user profile screen displays a starred repos section.
- [ ] All timestamps in responses are ISO 8601 formatted.

### Edge Cases

- [ ] A username that is entirely whitespace returns 400 with `{ "message": "username is required" }`.
- [ ] A username that does not match any user returns 404 — never a 500.
- [ ] An empty username path segment is handled gracefully.
- [ ] A user with zero starred repos returns 200 with an empty array and `X-Total-Count: 0`.
- [ ] A user who has starred only private repos appears to have zero stars when viewed publicly.
- [ ] If a starred repository is subsequently deleted, it does not appear in the list (the join naturally excludes it).
- [ ] If a starred repository transitions from public to private, it disappears from the public starred list but remains on the owner's own authenticated starred list (if the viewer starred it and still has access).
- [ ] If a user stars the same repository twice (race condition / duplicate request), the list does not contain duplicates.
- [ ] Pagination with `page=0` returns 400.
- [ ] Pagination with `per_page=0` returns 400.
- [ ] Pagination with `per_page > 100` is silently capped to 100.
- [ ] Pagination with non-numeric values returns 400.
- [ ] Requesting a page beyond the last page returns 200 with an empty array.
- [ ] Repository descriptions containing special characters (unicode, emoji, HTML entities) render correctly.
- [ ] Repository descriptions that are `null` or empty string are returned as empty string.

### Boundary Constraints

- [ ] `username` path parameter: 1–39 characters, alphanumeric and hyphens only, must not start or end with a hyphen.
- [ ] Pagination `per_page` / `limit`: minimum 1, maximum 100, default 30.
- [ ] Pagination `page`: minimum 1, default 1.
- [ ] Maximum items returned per page: 100.
- [ ] Both page/per_page and cursor/limit pagination styles are supported (matching existing API convention).

## Design

### Web UI Design

**Route**: `/:owner` (user profile page, "Starred" tab)

**Tab interaction**: The user profile page has a tab bar with "Repositories" (default) and "Starred" tabs. Clicking "Starred" loads the starred repositories list. The URL should reflect the active tab (e.g., `/:owner?tab=starred`) so the tab state is shareable and bookmarkable.

**Repository list item layout**: Each item renders:
- Repository full name (`owner/name`) as a clickable link to `/:owner/:repo`.
- Description text, truncated to a single line with ellipsis if longer than the available width.
- Star icon with star count.
- Default bookmark name in a monospace badge.
- Relative "last updated" timestamp (e.g., "Updated 3 days ago"), with full ISO timestamp on hover tooltip.

**Empty state**: When the user has no starred repositories, display centered text: "This user hasn't starred any repositories yet."

**Pagination**: Page-based pagination controls at the bottom of the list showing "Page X of Y" with Previous/Next buttons. Default 30 items per page.

**Loading state**: A skeleton loader should appear while the starred repos are being fetched, matching the repository list item shape.

**Error state**: If the API returns an error, display an inline error message with a "Retry" button.

### API Shape

#### List Public User's Starred Repositories

```
GET /api/users/:username/starred
```

**Authentication**: Not required.

**Path Parameters**:
| Parameter  | Type   | Description                               |
|------------|--------|-------------------------------------------|
| `username` | string | The username to look up (case-insensitive) |

**Query Parameters**:
| Parameter  | Type   | Default | Description                    |
|------------|--------|---------|--------------------------------|
| `page`     | number | 1       | Page number (page pagination)  |
| `per_page` | number | 30      | Items per page (max 100)       |
| `cursor`   | string | ""      | Offset cursor (cursor pagination) |
| `limit`    | number | 30      | Items per page (max 100)       |

**Success Response** (`200 OK`):

Response Headers: `X-Total-Count`, `Link` (with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable).

Response Body: Array of `RepoSummary` objects:
```json
[
  {
    "id": 1,
    "owner": "janedoe",
    "full_name": "janedoe/my-project",
    "name": "my-project",
    "description": "A jj-native project",
    "is_public": true,
    "num_stars": 42,
    "default_bookmark": "main",
    "created_at": "2025-06-15T10:30:00.000Z",
    "updated_at": "2026-03-20T14:22:00.000Z"
  }
]
```

**Error Responses**:
| Status | Condition                       | Body                                    |
|--------|---------------------------------|-----------------------------------------|
| 400    | Username is empty or whitespace | `{ "message": "username is required" }` |
| 400    | Invalid pagination parameters   | `{ "message": "<validation details>" }` |
| 404    | User not found or inactive      | `{ "message": "user not found" }`       |

#### List Authenticated User's Starred Repositories

```
GET /api/user/starred
```

**Authentication**: Required. Uses session cookie or PAT.

**Query Parameters**: Same as the public endpoint above.

**Success Response** (`200 OK`): Same shape as above, but includes both public and private starred repositories the authenticated user can access.

**Error Responses**:
| Status | Condition             | Body                                           |
|--------|-----------------------|-------------------------------------------------|
| 401    | Not authenticated     | `{ "message": "authentication required" }`      |
| 400    | Invalid pagination    | `{ "message": "<validation details>" }`         |

### SDK Shape

The `UserService` class in `@codeplane/sdk` exposes:

- `listUserStarredReposByUsername(username: string, page: number, perPage: number): Promise<Result<RepoListResult, APIError>>` — public starred repos for any user.
- `listAuthenticatedUserStarredRepos(userID: number, page: number, perPage: number): Promise<Result<RepoListResult, APIError>>` — all starred repos for the authenticated user.

The `RepoListResult` type:
```typescript
interface RepoListResult {
  items: RepoSummary[];
  total_count: number;
  page: number;
  per_page: number;
}
```

### CLI Command

#### List own starred repos

```
codeplane repo list --starred [--limit N] [--page N] [--json]
```

- Requires authentication.
- Calls `GET /api/user/starred`.
- Human-readable output: renders the same `formatRepoList` tabular format used by `codeplane repo list`.
- `--json`: outputs the raw JSON array.

#### List another user's starred repos

```
codeplane user starred <username> [--limit N] [--page N] [--json]
```

- Does not require authentication.
- Calls `GET /api/users/:username/starred`.
- Human-readable output: renders the same `formatRepoList` format.
- `--json`: outputs the raw JSON array.
- Nonexistent user prints error to stderr and exits with code 1.

### TUI UI

The TUI user profile detail screen includes a "Starred" tab or section. Navigating to it loads the starred repos via the API. The list is rendered with the same repository summary format used in the main repositories screen. Pagination is handled with `j`/`k` scrolling and explicit page navigation keybindings.

### Documentation

- **API Reference — Users**: Document both `GET /api/users/:username/starred` and `GET /api/user/starred` with full request/response schemas, pagination parameters, headers, and error codes.
- **CLI Reference — `repo list --starred`**: Document usage with examples showing human-readable and JSON output.
- **CLI Reference — `user starred`**: Document usage with examples including nonexistent user error handling.
- **Web Guide — User Profiles**: Reference the Starred tab and how it relates to the star/unstar actions on repositories.

## Permissions & Security

### Authorization Roles

| Action                                        | Anonymous | Authenticated | Admin |
|-----------------------------------------------|-----------|---------------|-------|
| List public user's starred repos (`/api/users/:username/starred`) | ✅ | ✅ | ✅ |
| List own starred repos (`/api/user/starred`)  | ❌         | ✅             | ✅     |

- The public endpoint only returns repositories where `is_public = true`. Private repositories a user has starred are never exposed to other users.
- The authenticated endpoint returns all starred repositories the authenticated user has access to (including their own private repos).
- No elevated role (admin, org owner, etc.) is required for any starred repo listing operation.

### Rate Limiting

- **Anonymous callers**: 60 requests per minute per IP address to `/api/users/:username/starred`. Prevents enumeration and scraping.
- **Authenticated callers**: 300 requests per minute per user to `/api/user/starred` and `/api/users/:username/starred`.
- Rate limit responses use `429 Too Many Requests` with `Retry-After` header.
- The `per_page` / `limit` cap at 100 prevents large payload extraction per request.

### Data Privacy & PII

- The starred repos response contains only repository summary fields. No user PII (email, admin status, wallet address, etc.) is included.
- The existence of private starred repositories is never exposed to other users — the public count and list exclude them entirely.
- If a user has starred a private repository belonging to someone else (which they were previously granted access to), that repository still does not appear in their public starred list.
- Inactive/disabled users return 404 on the public endpoint, preventing account enumeration.

## Telemetry & Product Analytics

### Key Business Events

| Event Name                       | Trigger                                                 | Properties                                                                                              |
|----------------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `UserStarredReposListed`         | `GET /api/users/:username/starred` returns 200          | `viewed_username`, `viewer_user_id` (nullable if anonymous), `page`, `per_page`, `total_count`, `client` (web/cli/tui/api) |
| `AuthenticatedStarredReposListed`| `GET /api/user/starred` returns 200                     | `user_id`, `page`, `per_page`, `total_count`, `client`                                                  |
| `UserStarredReposNotFound`       | `GET /api/users/:username/starred` returns 404          | `requested_username`, `viewer_user_id` (nullable), `client`                                              |
| `StarredRepoClicked`             | User clicks a repository link from the starred list (web) | `viewed_username`, `clicked_repo_full_name`, `viewer_user_id`, `position_in_list`, `page`               |

### Funnel Metrics & Success Indicators

- **Starred tab engagement rate**: Percentage of user profile views that result in clicking the "Starred" tab. Target: >10%.
- **Starred list → Repository click-through rate**: Percentage of starred list views where the user clicks through to a repository. Target: >25%.
- **CLI starred list adoption**: Percentage of CLI-active users who use `codeplane repo list --starred` or `codeplane user starred` at least once per month.
- **Pagination depth**: Average page depth reached on starred listings. If most users never paginate past page 1, consider increasing default `per_page` or adding search/filter to the starred list.
- **Empty starred list rate**: Percentage of starred list requests that return `total_count: 0`. A high rate may indicate the star feature itself is underused.
- **Public vs authenticated list ratio**: Ratio of public `/api/users/:username/starred` calls to authenticated `/api/user/starred` calls. Indicates whether users primarily browse their own stars or others'.

## Observability

### Logging Requirements

| Log Event                              | Level | Structured Context                                                                              |
|----------------------------------------|-------|-------------------------------------------------------------------------------------------------|
| Public starred list success            | INFO  | `username`, `user_id`, `page`, `per_page`, `total_count`, `request_id`, `response_time_ms`, `client_ip` |
| Authenticated starred list success     | INFO  | `user_id`, `page`, `per_page`, `total_count`, `request_id`, `response_time_ms`                  |
| Starred list 404 (user not found)      | WARN  | `requested_username`, `request_id`, `client_ip`                                                  |
| Starred list 400 (bad pagination)      | WARN  | `requested_username`, `request_id`, `validation_error`, `client_ip`                              |
| Rate limit triggered                   | WARN  | `client_ip`, `user_id` (nullable), `endpoint`, `request_id`                                     |
| Unexpected service error               | ERROR | `username`, `request_id`, `error_message`, `stack_trace`                                         |

### Prometheus Metrics

| Metric Name                                              | Type      | Labels                                   | Description                                    |
|----------------------------------------------------------|-----------|------------------------------------------|------------------------------------------------|
| `codeplane_user_starred_list_requests_total`                 | Counter   | `status` (200/400/404/429/500), `endpoint` (public/authenticated), `client` | Total starred list requests |
| `codeplane_user_starred_list_request_duration_seconds`       | Histogram | `status`, `endpoint`                     | Latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_user_starred_list_result_count`                   | Histogram | `endpoint`                               | Number of items returned per request (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_user_starred_list_rate_limited_total`             | Counter   | `client_type` (anonymous/authenticated)  | Total rate-limited starred list requests       |

### Alerts

#### Alert: High Starred List 404 Rate
- **Condition**: `rate(codeplane_user_starred_list_requests_total{status="404"}[5m]) / rate(codeplane_user_starred_list_requests_total[5m]) > 0.20` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check access logs for patterns — is a single IP or small set of IPs generating most 404s? If so, this is likely username enumeration; confirm and rate-limit or block the source.
  2. Check if there has been a recent bulk user deactivation or username migration by querying the admin audit log.
  3. Check if the web UI or CLI is constructing starred-list URLs incorrectly (e.g., after a profile URL change).
  4. Check for broken external links pointing to deleted user profiles.
  5. If no clear cause, increase monitoring granularity and wait for the next window.

#### Alert: Elevated Starred List Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_user_starred_list_request_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool health and active query count.
  2. Run `EXPLAIN ANALYZE` on the `ListPublicUserStarredRepos` query — verify the `stars(user_id)` index and the `repositories(id)` join are being used.
  3. Check if a concurrent migration, vacuum, or bulk star insertion is holding locks.
  4. Check if the result set size for specific users is anomalously large (a user with thousands of stars may produce slow queries).
  5. If the index has degraded, run `REINDEX` on the `stars` table.
  6. Check overall server CPU and memory load.

#### Alert: Starred List Endpoint Error Spike
- **Condition**: `rate(codeplane_user_starred_list_requests_total{status="500"}[5m]) > 0.5` sustained for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for ERROR-level entries with the `user_starred_list` tag.
  2. Verify database connectivity — run a health check query.
  3. Verify the user service was correctly initialized in the service registry (check boot logs for initialization errors).
  4. If errors correlate with a specific username, check for data corruption in the `stars` or `repositories` tables.
  5. If errors started immediately after a deploy, roll back to the previous version.

#### Alert: Rate Limiting Spike on Starred List
- **Condition**: `rate(codeplane_user_starred_list_rate_limited_total[5m]) > 10` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify top source IPs from access logs.
  2. Determine if the traffic is a legitimate integration (e.g., a dashboard polling starred repos) or an attack.
  3. For legitimate integrations, advise the caller to implement client-side caching with `If-None-Match` / ETags or reduce polling frequency.
  4. For attacks, add the source IP to the blocklist.
  5. Evaluate whether current rate limit thresholds need adjustment for legitimate traffic patterns.

### Error Cases and Failure Modes

| Failure Mode                                | Expected Behavior                                          | Detection                                    |
|---------------------------------------------|------------------------------------------------------------|----------------------------------------------|
| Database unavailable                        | Return 500 with `{ "message": "internal error" }`. Log ERROR. | `status=500` counter spike                  |
| Stars table index missing or corrupted      | Query degrades to sequential scan. Latency increases.       | Latency histogram p95 alert fires            |
| User has starred a deleted repository       | Join naturally excludes it. No error. Consistent count.     | None needed — correct by design              |
| Concurrent star/unstar during pagination    | May produce slight inconsistencies between pages. Acceptable. | No alert — eventual consistency              |
| User has starred thousands of repositories  | Pagination keeps response size bounded. Query may be slow.  | Latency alert if p95 > threshold             |
| Malformed username (path traversal attempt) | Hono route matching prevents it. Returns 404.               | WARN log for unusual path patterns           |
| Extremely long username in path (> 39 chars)| Returns 404 or 400 — never 500.                            | 400/404 counter                              |
| NULL `created_at` on star record            | Star ordering degrades but query does not crash.            | Defensive code; log WARN if encountered      |

## Verification

### API Integration Tests

| #  | Test Description | Method / Setup | Expected |
|----|-----------------|----------------|----------|
| 1  | List starred repos for a user who has starred repos | `GET /api/users/testuser/starred` | 200, non-empty array, `X-Total-Count > 0` |
| 2  | Each item has required fields | `GET /api/users/testuser/starred` | Every item has `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at` |
| 3  | All returned repos are public | `GET /api/users/testuser/starred` | Every item has `is_public === true` |
| 4  | Private starred repos are NOT returned on public endpoint | Setup: testuser has starred a private repo. `GET /api/users/testuser/starred` | Private repo absent from results |
| 5  | Authenticated user sees private starred repos on `/api/user/starred` | Setup: user has starred own private repo. `GET /api/user/starred` (authenticated) | Private repo present in results |
| 6  | List starred repos for user with no stars | `GET /api/users/newuser/starred` | 200, empty array, `X-Total-Count: 0` |
| 7  | Nonexistent user returns 404 | `GET /api/users/no-such-user-xyz/starred` | 404, `{ "message": "user not found" }` |
| 8  | Deactivated user returns 404 | `GET /api/users/deactivated-user/starred` | 404 |
| 9  | Username is case-insensitive | `GET /api/users/TESTUSER/starred` | 200, same results as `testuser` |
| 10 | Mixed-case username works | `GET /api/users/TeStUsEr/starred` | 200, same results |
| 11 | Whitespace-only username returns 400 | `GET /api/users/%20/starred` | 400, `{ "message": "username is required" }` |
| 12 | Results ordered by star time descending | `GET /api/users/testuser/starred` (user has starred A then B then C) | C appears first, then B, then A |
| 13 | Pagination `page=1&per_page=1` returns exactly 1 item | `GET /api/users/testuser/starred?page=1&per_page=1` | 200, array length = 1, `X-Total-Count` reflects total |
| 14 | Pagination `page=2` returns next set | Setup: user has 3 stars. `GET /api/users/testuser/starred?page=2&per_page=1` | 200, different item than page 1 |
| 15 | `per_page=100` (max valid) works | `GET /api/users/testuser/starred?per_page=100` | 200, at most 100 items |
| 16 | `per_page=101` is capped to 100 | `GET /api/users/testuser/starred?per_page=101` | 200, at most 100 items |
| 17 | `page=0` returns 400 | `GET /api/users/testuser/starred?page=0` | 400 |
| 18 | `per_page=0` returns 400 | `GET /api/users/testuser/starred?per_page=0` | 400 |
| 19 | `page=-1` returns 400 | `GET /api/users/testuser/starred?page=-1` | 400 |
| 20 | `per_page=abc` returns 400 | `GET /api/users/testuser/starred?per_page=abc` | 400 |
| 21 | Page beyond last page returns empty array | `GET /api/users/testuser/starred?page=999` | 200, empty array |
| 22 | `X-Total-Count` header is present and numeric | `GET /api/users/testuser/starred` | Header present, value parseable as integer |
| 23 | `Link` header contains pagination rel values | `GET /api/users/testuser/starred?page=1&per_page=1` (user has > 1 stars) | `Link` header has `rel="next"` |
| 24 | Cursor-based pagination works | `GET /api/users/testuser/starred?cursor=0&limit=5` | 200, length ≤ 5 |
| 25 | `limit` exceeding max is capped | `GET /api/users/testuser/starred?limit=200` | 200, at most 100 items |
| 26 | Unauthenticated request to public endpoint succeeds | `GET /api/users/testuser/starred` (no auth) | 200 |
| 27 | Unauthenticated request to `/api/user/starred` fails | `GET /api/user/starred` (no auth) | 401 |
| 28 | Authenticated request to `/api/user/starred` succeeds | `GET /api/user/starred` (with auth) | 200 |
| 29 | Star a repo, verify it appears in starred list | `PUT /api/user/starred/owner/repo`, then `GET /api/user/starred` | Repo present in list |
| 30 | Unstar a repo, verify it disappears from starred list | `DELETE /api/user/starred/owner/repo`, then `GET /api/user/starred` | Repo absent from list |
| 31 | Deleted repo does not appear in starred list | Setup: user stars repo, repo is deleted. `GET /api/user/starred` | Deleted repo absent |
| 32 | `created_at` and `updated_at` are valid ISO 8601 | `GET /api/users/testuser/starred` | All timestamps parse as Date |
| 33 | Response content-type is `application/json` | `GET /api/users/testuser/starred` | Content-Type header is `application/json` |
| 34 | Username at max valid length (39 chars) resolves | Setup: create user with 39-char name, star a repo. `GET /api/users/<39-char-name>/starred` | 200 if user exists |
| 35 | Username over max length (40 chars) returns 404 or 400 | `GET /api/users/<40-char-name>/starred` | Not 500 |

### CLI E2E Tests

| #  | Test Description | Command | Expected |
|----|-----------------|---------|----------|
| 36 | List own starred repos (JSON) | `codeplane repo list --starred --json` | Exit 0, valid JSON array |
| 37 | List own starred repos (human-readable) | `codeplane repo list --starred` | Exit 0, stdout contains formatted repo list or "No repositories found" |
| 38 | List own starred repos with pagination | `codeplane repo list --starred --limit 1 --page 1 --json` | Exit 0, JSON array with at most 1 item |
| 39 | List other user's starred repos (JSON) | `codeplane user starred testuser --json` | Exit 0, valid JSON array |
| 40 | List starred repos for nonexistent user | `codeplane user starred nonexistent-user-xyz --json` | Exit 1, stderr contains error |
| 41 | Star then list confirms presence | `codeplane repo star owner/repo` then `codeplane repo list --starred --json` | Repo appears in list |
| 42 | Unstar then list confirms absence | `codeplane repo unstar owner/repo` then `codeplane repo list --starred --json` | Repo absent from list |

### Web UI E2E Tests (Playwright)

| #  | Test Description | Expected |
|----|-----------------|----------|
| 43 | Navigate to `/:username`, click "Starred" tab | Tab switches, starred repos load |
| 44 | Starred tab shows repo name as link | At least one repo name is a clickable link |
| 45 | Clicking a starred repo navigates to `/:owner/:repo` | URL changes to repository page |
| 46 | Starred tab shows star count for each repo | Star count visible for every listed repo |
| 47 | Empty starred list shows empty state message | Page shows "This user hasn't starred any repositories yet." |
| 48 | Starred tab URL is shareable (`?tab=starred`) | Navigating directly to `/:username?tab=starred` loads the starred tab |
| 49 | Pagination controls appear when starred count exceeds page size | Previous/Next visible with >30 stars |
| 50 | Clicking "Next" loads the next page of starred repos | New items appear, page indicator updates |
| 51 | Starred tab loads without authentication | Page renders for logged-out user |
| 52 | Starred repos do not include private repos for anonymous visitor | No items with `is_public: false` visible |
| 53 | Loading skeleton appears while data is fetched | Skeleton loader visible before data loads |

### Load & Boundary Tests

| #  | Test Description | Expected |
|----|-----------------|----------|
| 54 | Starred list responds within 500ms at p95 | Latency check passes |
| 55 | 100 concurrent requests to starred list succeed | All return 200 |
| 56 | User with 1000 starred repos — page 1 loads within 1s | Response time < 1s |
| 57 | User with 1000 starred repos — `per_page=100` returns exactly 100 items | Array length = 100, `X-Total-Count: 1000` |
| 58 | Rate limiting engages after threshold (anonymous: 60/min) | 61st request returns 429 with `Retry-After` header |

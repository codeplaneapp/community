# USER_PUBLIC_REPOSITORY_LIST

Specification for USER_PUBLIC_REPOSITORY_LIST.

## High-Level User POV

When you visit someone's profile on Codeplane — through a link in a landing request review, an issue mention, or by navigating directly to their username — you see a list of their public repositories underneath the profile header. This repository list is the primary way to discover what a person or contributor is working on.

The list shows each repository's name, description, star count, default bookmark, and when it was last updated. Repositories are sorted by most recently updated so that active projects appear first. If the user has many repositories, the list is paginated so you can browse through all of them without loading everything at once.

This works whether you are signed in or not. An anonymous visitor landing on a profile sees the same public repository list as an authenticated user. Private repositories are never shown — the list only contains repositories that the owner has marked as public. If the user has no public repositories, you see a clear empty state rather than a confusing blank page.

From the CLI, you can fetch any user's public repositories by username and get back the same information in a table or as structured JSON. This is useful for scripting, building dashboards, or quickly checking what someone has published. The TUI provides a similar browsable list in a terminal-friendly format.

The public repository list is a companion to the public profile view. Together they form the front door to any user's presence on Codeplane — safe to expose, useful for discovery, and consistent across every client surface.

## Acceptance Criteria

### Definition of Done

The feature is complete when any visitor — anonymous or authenticated — can retrieve a paginated list of a user's public repositories by username, receiving consistent results across API, web UI, CLI, and TUI. Only public repositories are returned. Private repositories, archived repositories marked as non-public, and repositories belonging to organizations are never included. Pagination, empty states, and error handling are consistent across all surfaces.

### Functional Constraints

- [ ] The endpoint returns only repositories where `is_public = TRUE` and the repository is owned by the resolved user (user-owned, not org-owned repositories listed here).
- [ ] Username lookup is case-insensitive. Requesting `Alice`, `alice`, or `ALICE` all resolve the same user's repositories.
- [ ] Each item in the response includes exactly these fields: `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`.
- [ ] The response never includes private repository fields such as `shard_id`, `search_vector`, `workspace_dependencies`, `workspace_idle_timeout_secs`, `workspace_persistence`, `landing_queue_mode`, `landing_queue_required_checks`, or internal counters like `next_issue_number` and `next_landing_number`.
- [ ] Repositories are ordered by `updated_at` descending, then by `id` descending (deterministic tiebreaker).
- [ ] Default page size is 30 items.
- [ ] Maximum page size is 100 items. Requests for a page size exceeding 100 must be clamped to 100 (not rejected).
- [ ] The response includes a `X-Total-Count` header containing the total number of public repositories for the user.
- [ ] The response includes standard `Link` pagination headers (rel="first", rel="prev", rel="next", rel="last") when applicable.
- [ ] If the username does not match any active user, the endpoint returns 404 with `"user not found"`.
- [ ] If the username is empty or whitespace-only after trimming, the endpoint returns 400 with `"username is required"`.
- [ ] A deactivated or inactive user returns 404 with the same `"user not found"` message (no distinction from nonexistent).
- [ ] If the user exists but has zero public repositories, the endpoint returns 200 with an empty array `[]` and `X-Total-Count: 0`.
- [ ] Pagination beyond the last page returns 200 with an empty array (not 404).
- [ ] Both legacy pagination (`?page=N&per_page=M`) and cursor-based pagination (`?cursor=N&limit=M`) must work.

### Boundary Constraints

- [ ] **Username:** 1–39 characters, `[a-zA-Z0-9-]`. May not start or end with a hyphen. May not contain consecutive hyphens.
- [ ] **Repository name in response:** 1–100 characters, `[a-zA-Z0-9._-]`.
- [ ] **Repository description in response:** 0–2048 characters. May contain Unicode.
- [ ] **`full_name`:** Always formatted as `{owner}/{name}`. The `owner` portion uses the canonical casing of the username (as stored), not the casing from the request.
- [ ] **`num_stars`:** Non-negative integer. May be 0.
- [ ] **`default_bookmark`:** Non-empty string (typically `"main"`). Must reflect the repository's configured default bookmark.
- [ ] **Timestamps:** ISO 8601 strings in UTC.
- [ ] **`page` parameter:** Positive integer ≥ 1. Values ≤ 0 must be normalized to 1.
- [ ] **`per_page` / `limit` parameter:** Integer 1–100. Values > 100 must be clamped to 100. Values ≤ 0 must default to 30.
- [ ] **`cursor` parameter:** String-encoded non-negative integer offset. Non-numeric cursor values must return 400 or be treated as offset 0.

### Edge Cases

- [ ] A user with exactly one public repository returns an array of length 1.
- [ ] A user with 101 public repositories returns exactly 30 on the first page (default) and appropriate pagination headers.
- [ ] Requesting `?page=2&per_page=100` when there are 50 total repos returns an empty array with `X-Total-Count: 50`.
- [ ] Requesting `?per_page=0` uses the default (30), not zero.
- [ ] Requesting `?per_page=-1` uses the default (30).
- [ ] Requesting `?per_page=200` clamps to 100.
- [ ] Requesting `?page=0` normalizes to page 1.
- [ ] A user whose username is exactly 1 character (e.g., `a`) returns their repos correctly.
- [ ] A user whose username is exactly 39 characters returns their repos correctly.
- [ ] A repository with an empty description returns `description: ""`.
- [ ] A repository with a description containing emoji, CJK, or accented characters returns with correct encoding.
- [ ] A repository with `num_stars: 0` returns the integer 0 (not the string `"0"`).
- [ ] Two rapid consecutive identical requests return identical results (idempotency).
- [ ] A URL-encoded username with null bytes (e.g., `%00`) does not cause a 500 error.
- [ ] A user who owns both public and private repositories only has their public repositories listed.

## Design

### API Shape

#### `GET /api/users/:username/repos`

**Description:** Retrieve a paginated list of a user's public repositories.

**Authentication:** None required. Works for anonymous and authenticated callers.

**Path parameters:**

| Parameter | Type | Description |
|-----------|--------|--------------------------------------|
| `username` | string | The username to look up (case-insensitive) |

**Query parameters (legacy pagination):**

| Parameter | Type | Default | Description |
|-----------|--------|---------|--------------------------------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 30 | Items per page (max 100) |

**Query parameters (cursor pagination):**

| Parameter | Type | Default | Description |
|-----------|--------|---------|--------------------------------------|
| `cursor` | string | `"0"` | String-encoded offset |
| `limit` | integer | 30 | Items per page (max 100) |

**Success response — `200 OK`:**

```json
[
  {
    "id": 7,
    "owner": "alice",
    "full_name": "alice/my-project",
    "name": "my-project",
    "description": "A jj-native tool for project scaffolding",
    "is_public": true,
    "num_stars": 42,
    "default_bookmark": "main",
    "created_at": "2025-09-01T10:00:00.000Z",
    "updated_at": "2026-03-20T14:30:00.000Z"
  },
  {
    "id": 3,
    "owner": "alice",
    "full_name": "alice/dotfiles",
    "name": "dotfiles",
    "description": "",
    "is_public": true,
    "num_stars": 5,
    "default_bookmark": "main",
    "created_at": "2025-06-15T08:00:00.000Z",
    "updated_at": "2026-02-10T09:15:00.000Z"
  }
]
```

**Response headers:**

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Total-Count` | Total number of public repos for this user |
| `Link` | Standard pagination `Link` header with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable |

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Empty or whitespace-only username | `{ "message": "username is required" }` |
| `400 Bad Request` | Invalid pagination parameters | `{ "message": "invalid pagination parameters" }` |
| `404 Not Found` | No active user with that username | `{ "message": "user not found" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `UserService` exposes:

```typescript
listUserReposByUsername(
  username: string,
  page: number,
  perPage: number
): Promise<Result<RepoListResult, APIError>>
```

Where:

```typescript
interface RepoSummary {
  id: number;
  owner: string;
  full_name: string;
  name: string;
  description: string;
  is_public: boolean;
  num_stars: number;
  default_bookmark: string;
  created_at: string;
  updated_at: string;
}

interface RepoListResult {
  items: RepoSummary[];
  total_count: number;
  page: number;
  per_page: number;
}
```

The method:
1. Trims the input username.
2. Returns `badRequest("username is required")` if the trimmed input is empty.
3. Performs a case-insensitive lookup via `getUserByLowerUsername`.
4. Returns `notFound("user not found")` if no row is found or the user is inactive.
5. Normalizes pagination parameters (clamp page ≥ 1, clamp perPage to 1–100, default 30).
6. Counts total public repos for the user via `countPublicUserRepos`.
7. Lists public repos for the user via `listPublicUserRepos` with `ORDER BY updated_at DESC, id DESC` and LIMIT/OFFSET.
8. Maps each database row to `RepoSummary` via `mapRepoSummary`, setting `owner` to the canonical username.
9. Returns `RepoListResult` with `items`, `total_count`, `page`, and `per_page`.

### CLI Command

#### `codeplane repo list --user <username>`

**New flag:** `--user <username>` (or `--owner <username>`) to list another user's public repos. When omitted, the existing behavior (list authenticated user's own repos) is preserved.

**Behavior:**
- `codeplane repo list` — lists the authenticated user's own repositories (existing behavior, calls `GET /api/user/repos`).
- `codeplane repo list --user alice` — lists alice's public repositories (calls `GET /api/users/alice/repos`). No auth required.

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--user` | string | (none) | Username to list repos for |
| `--limit` | number | 30 | Number of results per page |
| `--page` | number | 1 | Page number |

**Output (human-readable, default):**

```
Name         Visibility  Default  Updated
my-project   public      main     2026-03-20T14:30:00.000Z
dotfiles     public      main     2026-02-10T09:15:00.000Z
```

**Output (JSON, with `--json`):**

```json
[
  {
    "id": 7,
    "owner": "alice",
    "full_name": "alice/my-project",
    "name": "my-project",
    "description": "A jj-native tool for project scaffolding",
    "is_public": true,
    "num_stars": 42,
    "default_bookmark": "main",
    "created_at": "2025-09-01T10:00:00.000Z",
    "updated_at": "2026-03-20T14:30:00.000Z"
  }
]
```

**Empty state:** When the user has no public repositories, human-readable output shows `"No repositories found"`.

**Error behavior:**
- `codeplane repo list --user nonexistent-user` → non-zero exit code, stderr: `Error: user not found`
- `codeplane repo list --user ""` → non-zero exit code, stderr: `Error: username is required`

### TUI UI

The TUI repositories screen should support viewing another user's repositories:

```
┌── alice's repositories ──────────────────────────────────────┐
│                                                              │
│  ★ 42  my-project                                           │
│        A jj-native tool for project scaffolding              │
│        main · Updated Mar 20, 2026                           │
│                                                              │
│  ★  5  dotfiles                                             │
│        main · Updated Feb 10, 2026                           │
│                                                              │
│  Page 1 of 3  ← →                                           │
└──────────────────────────────────────────────────────────────┘
```

- Each repository card shows: star count, name (bold), description (dimmed, single-line truncated), default bookmark, and relative update time.
- Pressing Enter on a repository navigates to repository detail.
- Left/right arrow keys or `[` / `]` navigate pages.
- Empty state: `"alice hasn't created any public repositories yet."`
- Error state for nonexistent user: `"User 'xyz' not found."`

### Web UI Design

The web UI renders the public repository list as the default tab on the `/:owner` profile page.

**Layout:**
- **Profile header** (from `USER_PUBLIC_PROFILE_VIEW`): avatar, display name, @username, bio.
- **Tab bar:** "Repositories" (default active, shows count badge), "Starred".
- **Repository list** below the tab bar.

**Each repository card displays:**
- **Repository name** as a link to `/:owner/:repo` (bold, colored).
- **Description** (one or two lines, truncated with ellipsis if needed). Omitted if empty.
- **Star count** with a star icon (★).
- **Default bookmark** shown as a tag/badge.
- **Last updated** as a relative time (e.g., "Updated 3 hours ago").
- **Fork indicator** if the repository is a fork (optional, if `is_fork` is available in the future response).

**Pagination:**
- Below the repository list, a pagination control shows page numbers and prev/next buttons.
- First load fetches page 1 with 30 items.
- URL updates to `/:owner?tab=repositories&page=2` on navigation (no full page reload).

**Empty state:**
- "This user hasn't created any public repositories yet." centered in the content area with a muted icon.

**Responsive behavior:**
- On narrow viewports (< 640px), the star count and default bookmark collapse into a single line below the description.
- The tab bar remains sticky below the profile header.

**SEO:**
- Page title: `"{display_name} ({username}) · Codeplane"`.
- Meta description includes bio if present.

### Documentation

The following end-user documentation should be written:

1. **API Reference — List User Repositories:** Document `GET /api/users/:username/repos` with request/response examples, pagination headers, error codes, and field descriptions. Include notes on both legacy and cursor pagination styles. Note that the endpoint is public and does not require authentication.
2. **CLI Reference — `codeplane repo list`:** Document the `--user` flag for listing another user's public repos. Show both human-readable and JSON output examples. Document error behavior for nonexistent users.
3. **User Guide — Discovering Repositories:** A short guide explaining how to find other users' public repositories from the profile page, CLI, and TUI. Include tips on using pagination for prolific users.

## Permissions & Security

### Authorization Model

| Role | Can list a user's public repos? |
|------|----------------------------------|
| Anonymous (unauthenticated) | ✅ Yes |
| Authenticated user | ✅ Yes |
| Read-only token | ✅ Yes |
| Admin | ✅ Yes |

No authorization is required for this endpoint. It is intentionally public. Only repositories with `is_public = TRUE` are returned regardless of the caller's identity.

An authenticated admin does **not** see private repositories via this endpoint. The public repository list is privacy-bounded by design. To list all of a user's repositories (including private ones), admins must use the separate admin API surface.

### Rate Limiting

- **Anonymous callers:** 60 requests per minute per IP address.
- **Authenticated callers:** 300 requests per minute per token/session.
- **Rate limit response:** `429 Too Many Requests` with `Retry-After` header indicating seconds until reset.
- Rate limiting is enforced at the middleware layer (`PLATFORM_HTTP_MIDDLEWARE_RATE_LIMITING`), shared with other user-scoped endpoints.

### Data Privacy Constraints

- **Private repositories excluded:** The SQL query filters on `is_public = TRUE`. There is no code path that could expose private repository names, descriptions, or metadata via this endpoint.
- **No internal fields exposed:** The `mapRepoSummary` function explicitly selects only safe fields. Internal fields such as `shard_id`, `search_vector`, `workspace_dependencies`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, and `next_landing_number` are never included in the response.
- **User identity protection:** The endpoint resolves a username but does not reveal whether a username was ever registered if the user is deactivated — both "nonexistent" and "deactivated" produce the same 404 message.
- **No email or PII exposure:** The response contains the `owner` field (username only). No email addresses, login history, or other PII is included in the repository list response.
- **Enumeration resistance:** Rate limiting is the primary defense against using this endpoint for user enumeration. The 404 response is intentionally opaque.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `UserPublicRepoListViewed` | On successful 200 response from `GET /api/users/:username/repos` | `target_username`, `viewer_user_id` (null if anonymous), `client` (web/cli/tui/api), `response_time_ms`, `result_count`, `total_count`, `page`, `per_page` |
| `UserPublicRepoListEmpty` | On successful 200 response with zero results and page 1 | `target_username`, `viewer_user_id` (null if anonymous), `client` |
| `UserPublicRepoListNotFound` | On 404 response (user not found) | `requested_username`, `viewer_user_id` (null if anonymous), `client` |
| `UserPublicRepoListPaginated` | On successful 200 response with page > 1 | `target_username`, `viewer_user_id`, `client`, `page`, `per_page`, `total_count` |

### Event Properties

- `target_username` (string): The resolved canonical username whose repos were listed.
- `requested_username` (string): The raw username string from the request path (for 404 analysis).
- `viewer_user_id` (number | null): The authenticated viewer's user ID, or null for anonymous.
- `client` (string enum): One of `"web"`, `"cli"`, `"tui"`, `"api"`, `"desktop"`, `"vscode"`, `"neovim"`.
- `response_time_ms` (number): Server-side response latency in milliseconds.
- `result_count` (number): Number of items returned in this page.
- `total_count` (number): Total number of public repos for the target user.
- `page` (number): Current page number.
- `per_page` (number): Page size used.

### Funnel Metrics and Success Indicators

- **Repo list view volume:** Total `UserPublicRepoListViewed` events per day, segmented by client. Indicates feature adoption and discovery behavior.
- **Empty profile rate:** Ratio of `UserPublicRepoListEmpty` to total `UserPublicRepoListViewed` on page 1. A high rate (> 40%) may indicate that users are reaching profiles before they have published content.
- **Pagination depth:** Distribution of `page` values from `UserPublicRepoListPaginated` events. A heavy tail (many page > 3 requests) indicates users actively exploring prolific contributors' repos.
- **Profile → Repo click-through rate (web only):** Percentage of `UserPublicRepoListViewed` events followed by a repository view event within the same session. Primary indicator of profile utility.
- **404 rate:** Ratio of `UserPublicRepoListNotFound` to total attempts. Sustained rate above 15% warrants investigation of broken links or abuse.
- **CLI vs web split:** Client distribution. Tracks whether the CLI `--user` flag is being adopted.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Condition |
|-----------|-------|-------------------|----------|
| Repo list request received | `DEBUG` | `username`, `request_id`, `client_ip`, `page`, `per_page` | Every request |
| Repo list succeeded | `INFO` | `username`, `user_id`, `request_id`, `duration_ms`, `result_count`, `total_count` | 200 response |
| Repo list user not found | `WARN` | `username`, `request_id`, `client_ip` | 404 response |
| Repo list bad request | `WARN` | `raw_input`, `request_id`, `client_ip`, `reason` | 400 response |
| Repo list internal error | `ERROR` | `username`, `request_id`, `error_message`, `stack_trace` | 500 response |
| Rate limit exceeded on repo list endpoint | `WARN` | `client_ip`, `request_id`, `rate_limit_bucket` | 429 response |
| Pagination clamped | `DEBUG` | `username`, `request_id`, `requested_per_page`, `clamped_per_page` | When per_page > 100 is clamped |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_repo_list_requests_total` | Counter | `status` (200, 400, 404, 429, 500), `client` | Total user repo list requests |
| `codeplane_user_repo_list_request_duration_seconds` | Histogram | `status` | Response latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_user_repo_list_result_count` | Histogram | — | Distribution of result counts per page (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_user_repo_list_total_count` | Histogram | — | Distribution of total public repo counts per user queried (buckets: 0, 1, 5, 10, 25, 50, 100, 500, 1000) |
| `codeplane_user_repo_list_not_found_total` | Counter | `client` | Total 404s on repo list lookups |

### Alerts

#### Alert: High Repo List 404 Rate

**Condition:** `rate(codeplane_user_repo_list_not_found_total[5m]) / rate(codeplane_user_repo_list_requests_total[5m]) > 0.3` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a deployment just occurred that may have broken user routing or database migrations.
2. Query recent `UserPublicRepoListNotFound` events for the top `requested_username` values. Determine if the 404s are concentrated on a few usernames (broken links) or broadly distributed (enumeration or crawler).
3. If concentrated: check whether those users were recently deactivated, renamed, or merged. Verify no broken links in the web UI or external referrers.
4. If distributed and from few IPs: check for abuse patterns. Consider temporary IP blocks via rate limiting escalation.
5. If distributed and from many IPs: check if a search engine crawler or third-party integration is generating bad requests. Review referrer logs and user-agent strings.

#### Alert: Repo List Endpoint Elevated Latency

**Condition:** `histogram_quantile(0.99, rate(codeplane_user_repo_list_request_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database connection pool health via `SELECT count(*) FROM pg_stat_activity;`.
2. Check if slow queries exist via `pg_stat_statements` for `listPublicUserRepos` and `countPublicUserRepos` queries.
3. Verify the `user_id` and `is_public` columns on the `repositories` table have a composite index. Run `EXPLAIN ANALYZE` on the listing query with a known user_id.
4. Check if a user with an unusually large number of public repos (> 1000) is being queried repeatedly, causing large OFFSET scans.
5. If the problem is OFFSET-based pagination degradation for deep pages: consider adding cursor-based keyset pagination using `(updated_at, id)` as the cursor key.
6. Check if the server is under memory pressure or CPU contention from concurrent requests.

#### Alert: Repo List Endpoint 5xx Spike

**Condition:** `rate(codeplane_user_repo_list_requests_total{status="500"}[5m]) > 0.1` sustained for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server error logs for stack traces associated with the user repo list route (`GET /api/users/:username/repos`).
2. Common causes: database connection failure, `mapRepoSummary` mapping error (e.g., unexpected null field), pagination arithmetic overflow.
3. Verify database connectivity: attempt a direct SQL query against `repositories`.
4. Check for recent deployments. If the 5xx spike correlates with a deploy, consider rolling back.
5. If the error is in the mapping function: check if a database migration changed the `repositories` row shape without updating the TypeScript mapper.
6. Check if the `getUserByLowerUsername` lookup is failing upstream, preventing the repo query from executing.

#### Alert: Abnormal Empty Repo List Rate

**Condition:** `rate(codeplane_user_repo_list_result_count_bucket{le="0"}[15m]) / rate(codeplane_user_repo_list_requests_total{status="200"}[15m]) > 0.8` sustained for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Verify the `is_public` column values in the `repositories` table. Check if a migration or bulk operation accidentally set `is_public = FALSE` for all repositories.
2. Query `SELECT COUNT(*) FROM repositories WHERE is_public = TRUE;` to verify public repos exist.
3. Check if the `countPublicUserRepos` query is returning 0 for users who should have public repos.
4. If this is a data issue: restore from backup or run a corrective query. If this is a query bug: investigate the SQL or user_id resolution logic.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | User-Visible Error |
|---|---|---|
| Database connection lost | 500 Internal Server Error | `"internal server error"` |
| `mapRepoSummary` receives null field | 500 (should not happen if DB schema is correct) | `"internal server error"` |
| Username contains null bytes | 400 or 404 (sanitized before query) | `"user not found"` |
| Username exceeds 39 characters | 404 (no user will match) | `"user not found"` |
| `per_page` set to extremely large value | Clamped to 100, 200 response | Normal paginated response |
| Negative page number | Normalized to page 1, 200 response | Normal first-page response |
| Non-numeric cursor value | 400 Bad Request | `"invalid pagination parameters"` |
| Concurrent user deactivation during request | 404 (race condition is acceptable) | `"user not found"` |
| Concurrent repository deletion during listing | Stale count possible; item may be missing from page | Normal response (eventually consistent) |
| Rate limit exceeded | 429 | `"rate limit exceeded"` with `Retry-After` header |
| OFFSET exceeds total rows | Empty array returned, 200 | Empty result set |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `GET /api/users/:username/repos returns 200 with correct shape` | Create a user with a public repo, request their repo list, assert 200 and each item has exactly the 10 required fields (`id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`). |
| 2 | `GET /api/users/:username/repos returns only public repos` | Create a user with 2 public repos and 1 private repo. Request their repo list. Assert response contains exactly 2 items and `X-Total-Count: 2`. |
| 3 | `GET /api/users/:username/repos is case-insensitive` | Create user `TestRepoUser`, request as `testrepouser`, assert 200 and `owner` matches canonical casing `TestRepoUser`. |
| 4 | `GET /api/users/:username/repos returns repos ordered by updated_at desc` | Create a user with 3 public repos, update them in known order. Request repo list. Assert items are sorted by `updated_at` descending. |
| 5 | `GET /api/users/:username/repos excludes private fields` | Assert response items do NOT contain `shard_id`, `search_vector`, `workspace_dependencies`, `workspace_idle_timeout_secs`, `workspace_persistence`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, `next_landing_number`, `lower_name`, `topics`, `user_id`, `org_id`. |
| 6 | `GET /api/users/:username/repos for nonexistent user returns 404` | Request repos for `nonexistent-user-xyz123`, assert 404 with body `{ "message": "user not found" }`. |
| 7 | `GET /api/users/:username/repos for deactivated user returns 404` | Create a user, deactivate them, request their repos, assert 404. |
| 8 | `GET /api/users/:username/repos with empty username returns 400` | Request `/api/users/%20/repos`, assert 400 with `"username is required"`. |
| 9 | `GET /api/users/:username/repos returns empty array for user with no public repos` | Create a user with only private repos (or no repos). Request their repo list. Assert 200, body is `[]`, `X-Total-Count: 0`. |
| 10 | `GET /api/users/:username/repos default pagination is 30` | Create a user with 35 public repos. Request without pagination params. Assert response has exactly 30 items and `X-Total-Count: 35`. |
| 11 | `GET /api/users/:username/repos respects per_page` | Request with `?per_page=5`. Assert response has exactly 5 items. |
| 12 | `GET /api/users/:username/repos clamps per_page to 100` | Create a user with 120 public repos. Request with `?per_page=200`. Assert response has exactly 100 items. |
| 13 | `GET /api/users/:username/repos page 2 returns next set` | Create user with 35 repos. Request `?page=1&per_page=20` and `?page=2&per_page=20`. Assert page 1 has 20 items, page 2 has 15 items, no overlap in IDs. |
| 14 | `GET /api/users/:username/repos page beyond last returns empty` | Create user with 5 repos. Request `?page=2&per_page=30`. Assert 200 with empty array. |
| 15 | `GET /api/users/:username/repos cursor pagination works` | Request with `?cursor=0&limit=10`, then `?cursor=10&limit=10`. Assert no overlap and correct offset behavior. |
| 16 | `GET /api/users/:username/repos X-Total-Count header is correct` | Create user with 7 public repos. Assert `X-Total-Count` header equals `7`. |
| 17 | `GET /api/users/:username/repos Link header contains pagination links` | Create user with 50 repos. Request `?page=2&per_page=10`. Assert `Link` header contains `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`. |
| 18 | `GET /api/users/:username/repos works without authentication` | Request repo list with no auth header or cookie, assert 200. |
| 19 | `GET /api/users/:username/repos works with PAT authentication` | Request repo list with a valid PAT, assert 200 and same content as unauthenticated. |
| 20 | `GET /api/users/:username/repos full_name format is correct` | Assert every item's `full_name` equals `{owner}/{name}`. |
| 21 | `GET /api/users/:username/repos num_stars is a number not a string` | Assert `typeof item.num_stars === "number"` for each item. |
| 22 | `GET /api/users/:username/repos timestamps are valid ISO 8601` | Assert `created_at` and `updated_at` parse as valid Date objects and match ISO 8601 format. |
| 23 | `GET /api/users/:username/repos with URL-encoded special chars returns 404 not 500` | Request `/api/users/%00null/repos`, assert 404 (not 500). |
| 24 | `GET /api/users/:username/repos idempotency` | Make the same request twice rapidly, assert both return identical 200 responses. |
| 25 | `GET /api/users/:username/repos per_page=0 defaults to 30` | Request with `?per_page=0`, assert response has up to 30 items. |
| 26 | `GET /api/users/:username/repos page=0 normalizes to page 1` | Request with `?page=0`, assert response is the same as `?page=1`. |
| 27 | `GET /api/users/:username/repos with max-length username (39 chars)` | Create a user with 39-character username and a public repo, request their repos, assert 200. |
| 28 | `GET /api/users/:username/repos with single-char username` | Create a user with username `x` and a public repo, request their repos, assert 200. |
| 29 | `GET /api/users/:username/repos description with Unicode` | Create repo with description `"📦 测试 éàü"`. Assert round-trip fidelity. |
| 30 | `GET /api/users/:username/repos with max per_page=100 and exactly 100 repos` | Create user with exactly 100 public repos. Request with `?per_page=100`. Assert response has exactly 100 items. |
| 31 | `GET /api/users/:username/repos response Content-Type is application/json` | Assert `Content-Type` header. |
| 32 | `GET /api/users/:username/repos does not include org-owned repos` | Create a user who is a member of an org. Create repos under the org. Assert user's repo list does not include org repos. |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 33 | `codeplane repo list returns authenticated user repos` | Run `codeplane repo list --json`, assert exit code 0, assert array contains at least one repo. |
| 34 | `codeplane repo list --user <username> returns public repos` | Create a user with public repos. Run `codeplane repo list --user <username> --json`, assert exit code 0, assert response is an array of repos with correct owner. |
| 35 | `codeplane repo list --user <username> --json output has correct fields` | Parse stdout as JSON array. Assert each item has `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`. |
| 36 | `codeplane repo list --user nonexistent-user returns error` | Run `codeplane repo list --user nonexistent-user-12345`, assert non-zero exit code and stderr contains `"user not found"`. |
| 37 | `codeplane repo list --user <username> human-readable shows table` | Run without `--json`, assert stdout contains `Name`, `Visibility`, `Default`, `Updated` headers. |
| 38 | `codeplane repo list --user <username> with no public repos shows empty` | Run `codeplane repo list --user <user-with-no-repos>`, assert exit code 0, human-readable output contains `"No repositories found"`. |
| 39 | `codeplane repo list --user <username> --limit 5 respects limit` | Run with `--limit 5 --json`, assert array length ≤ 5. |
| 40 | `codeplane repo list --user <username> --page 2 respects pagination` | Create user with > 30 repos. Run with `--page 2 --json`, assert array is non-empty and different from page 1. |
| 41 | `codeplane repo list --user <USERNAME> case-insensitive` | Run with uppercase username, assert exit code 0 and results match canonical casing. |

### Web UI E2E Tests (Playwright)

| # | Test Name | Description |
|---|-----------|-------------|
| 42 | `Profile page shows repositories tab by default` | Navigate to `/:username`, assert "Repositories" tab is active and repo list is visible. |
| 43 | `Profile page repo list shows correct repo count` | Create user with known number of public repos. Assert the tab badge and visible items match. |
| 44 | `Profile page repo card displays name, description, stars, and updated time` | Assert at least one repo card contains all four visible fields. |
| 45 | `Profile page repo name links to repo page` | Click on a repo name, assert navigation to `/:owner/:repo`. |
| 46 | `Profile page shows empty state for user with no public repos` | Navigate to a user with no public repos, assert "This user hasn't created any public repositories yet." is visible. |
| 47 | `Profile page repo list pagination` | Create user with > 30 repos. Assert pagination controls are visible. Click "Next", assert new repos load. |
| 48 | `Profile page repo list is accessible without authentication` | Navigate to profile in incognito/unauthenticated session, assert repo list loads. |
| 49 | `Profile page does not show private repos` | Create user with 2 public and 1 private repo. Navigate to profile, assert only 2 repos visible. |
| 50 | `Profile page 404 for nonexistent user shows no repo list` | Navigate to `/nonexistent-user-xyz`, assert error page and no repo list rendered. |
| 51 | `Profile page repo card handles empty description gracefully` | Navigate to user with a repo that has no description, assert card renders without broken layout. |
| 52 | `Profile page repo list sorted by most recently updated` | Create user with repos updated at different times. Assert first visible repo has the most recent updated_at. |

### TUI Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 53 | `TUI user repos screen renders for valid user` | Navigate to user repos screen in TUI, assert screen contains repo names and star counts. |
| 54 | `TUI user repos screen shows error for nonexistent user` | Navigate to nonexistent user's repos, assert "not found" error message. |
| 55 | `TUI user repos screen shows empty state` | Navigate to user with no public repos, assert empty state message. |
| 56 | `TUI user repos screen pagination` | Navigate to a user with many repos, assert pagination indicators and navigation work. |

### Rate Limiting Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 57 | `Repo list endpoint returns 429 after rate limit exceeded (anonymous)` | Send 61 unauthenticated requests in rapid succession from same IP, assert 429 on the 61st request. |
| 58 | `Repo list endpoint returns Retry-After header on 429` | Assert `Retry-After` header is present and contains a positive integer. |
| 59 | `Repo list endpoint allows higher rate for authenticated callers` | Send 61 authenticated requests in rapid succession, assert all succeed (within 300/min limit). |

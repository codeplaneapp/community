# REPO_PERSONAL_LIST_API

Specification for REPO_PERSONAL_LIST_API.

## High-Level User POV

When you are signed in to Codeplane, your personal repository list is your home base for everything you own. It appears as the default view when you visit your own dashboard, settings, or profile — a single place where all your repositories, both public and private, are gathered.

Unlike visiting another user's profile, which only shows their public work, your personal repository list gives you full visibility into everything under your account. Private repositories that nobody else can see appear right alongside your public ones, each clearly labeled so you always know what is visible to the world and what is yours alone. The list is sorted by the most recently updated repository first, so whatever you are actively working on rises to the top.

You can page through your repositories if you have many, and the list tells you how many total repositories you own. Whether you are working from the browser, the CLI, the TUI, or your editor, the experience is the same — your complete personal repository inventory is always one command or one click away.

From the CLI, running `codeplane repo list` without any flags gives you your own repositories in a clean table. Adding `--json` gives you machine-readable output for scripts and integrations. The TUI and desktop app present the same list with terminal-friendly navigation, and the web dashboard makes your repositories the natural starting point for your day.

This feature exists so you never have to wonder "where did I put that repo?" Your personal repository list is always current, always complete, and always private to you.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can retrieve a paginated list of all their own repositories — both public and private — with consistent results across API, web UI, CLI, TUI, and desktop. Unauthenticated requests are rejected with a clear 401 error. The response includes both public and private repositories owned by the user. Organization-owned repositories are excluded. Pagination, sorting, empty states, and error handling are consistent across all surfaces.

### Functional Constraints

- [ ] The endpoint returns all repositories owned by the authenticated user, including both public and private repositories.
- [ ] Organization-owned repositories are excluded — only user-owned repositories appear in this list.
- [ ] Repositories are ordered by `updated_at` descending, then by `id` descending (deterministic tiebreaker).
- [ ] Each item in the response includes exactly these fields: `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`.
- [ ] The response never includes internal fields such as `shard_id`, `search_vector`, `workspace_dependencies`, `workspace_idle_timeout_secs`, `workspace_persistence`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, `next_landing_number`, `lower_name`, `topics`, `user_id`, or `org_id`.
- [ ] Default page size is 30 items.
- [ ] Maximum page size is 100 items. Requests for a page size exceeding 100 are clamped to 100 (not rejected).
- [ ] The response includes a `X-Total-Count` header containing the total number of repositories for the authenticated user.
- [ ] The response includes standard `Link` pagination headers (`rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`) when applicable.
- [ ] If the authenticated user has zero repositories, the endpoint returns 200 with an empty array `[]` and `X-Total-Count: 0`.
- [ ] Pagination beyond the last page returns 200 with an empty array (not 404).
- [ ] Both legacy pagination (`?page=N&per_page=M`) and cursor-based pagination (`?cursor=N&limit=M`) must work.
- [ ] An unauthenticated request returns 401 with `"authentication required"`.
- [ ] An expired or revoked session/token returns 401.
- [ ] The `owner` field in every response item uses the canonical casing of the authenticated user's username.

### Boundary Constraints

- [ ] **Repository name in response:** 1–100 characters, `[a-zA-Z0-9._-]`.
- [ ] **Repository description in response:** 0–2048 characters. May contain Unicode.
- [ ] **`full_name`:** Always formatted as `{owner}/{name}`, using the canonical username casing.
- [ ] **`is_public`:** Boolean. Must be `true` for public repos, `false` for private repos.
- [ ] **`num_stars`:** Non-negative integer. May be 0. Must be a number, not a string.
- [ ] **`default_bookmark`:** Non-empty string (typically `"main"`).
- [ ] **Timestamps:** ISO 8601 strings in UTC.
- [ ] **`page` parameter:** Positive integer ≥ 1. Values ≤ 0 are normalized to 1.
- [ ] **`per_page` / `limit` parameter:** Integer 1–100. Values > 100 are clamped to 100. Values ≤ 0 default to 30.
- [ ] **`cursor` parameter:** String-encoded non-negative integer offset. Non-numeric cursor values return 400 or are treated as offset 0.

### Edge Cases

- [ ] A user with exactly one repository (private) returns an array of length 1 with `is_public: false`.
- [ ] A user with exactly one repository (public) returns an array of length 1 with `is_public: true`.
- [ ] A user with 101 repositories returns exactly 30 on the first page (default) and appropriate pagination headers.
- [ ] Requesting `?page=2&per_page=100` when there are 50 total repos returns an empty array with `X-Total-Count: 50`.
- [ ] Requesting `?per_page=0` uses the default (30), not zero.
- [ ] Requesting `?per_page=-1` uses the default (30).
- [ ] Requesting `?per_page=200` clamps to 100.
- [ ] Requesting `?page=0` normalizes to page 1.
- [ ] A repository with an empty description returns `description: ""`.
- [ ] A repository with a description containing emoji, CJK, or accented characters returns with correct encoding.
- [ ] A repository with `num_stars: 0` returns the integer 0 (not the string `"0"`).
- [ ] Two rapid consecutive identical requests return identical results (idempotency).
- [ ] A newly created repository appears in the list immediately (within the same request cycle, no delayed indexing).
- [ ] A recently deleted repository does not appear in the list.
- [ ] A repository that was just made private still appears in this list (unlike the public list).
- [ ] Archived repositories are included in the list (they are still owned by the user).
- [ ] Forked repositories owned by the user are included in the list.
- [ ] A user who has repositories and also belongs to organizations — only user-owned repos appear, not org repos.

## Design

### API Shape

#### `GET /api/user/repos`

**Description:** Retrieve a paginated list of the authenticated user's own repositories, including both public and private.

**Authentication:** Required. Session cookie, PAT, or OAuth2 token.

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
    "id": 12,
    "owner": "alice",
    "full_name": "alice/secret-project",
    "name": "secret-project",
    "description": "Private agent orchestration layer",
    "is_public": false,
    "num_stars": 0,
    "default_bookmark": "main",
    "created_at": "2026-03-01T10:00:00.000Z",
    "updated_at": "2026-03-21T08:30:00.000Z"
  },
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

**Response headers:**

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Total-Count` | Total number of repositories for this user (public + private) |
| `Link` | Standard pagination `Link` header with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable |

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `401 Unauthorized` | No valid session, token, or cookie | `{ "message": "authentication required" }` |
| `400 Bad Request` | Invalid pagination parameters | `{ "message": "invalid pagination parameters" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `UserService` exposes:

```typescript
listAuthenticatedUserRepos(
  userID: number,
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
1. Looks up the user by ID via `getUserByID`.
2. Returns `notFound("user not found")` if no row is found.
3. Normalizes pagination parameters (clamp page ≥ 1, clamp perPage to 1–100, default 30).
4. Counts total repos for the user via `countUserRepos` (no public filter).
5. Lists all repos for the user via `listUserRepos` with `ORDER BY updated_at DESC, id DESC` and LIMIT/OFFSET.
6. Maps each database row to `RepoSummary` via `mapRepoSummary`, setting `owner` to the canonical username.
7. Returns `RepoListResult` with `items`, `total_count`, `page`, and `per_page`.

### CLI Command

#### `codeplane repo list`

**Description:** Lists the authenticated user's own repositories (public and private).

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--limit` | number | 30 | Number of results per page |
| `--page` | number | 1 | Page number |

**Output (human-readable, default):**

```
Name              Visibility  Default  Updated
secret-project    private     main     2026-03-21T08:30:00.000Z
my-project        public      main     2026-03-20T14:30:00.000Z
dotfiles          public      main     2026-02-10T09:15:00.000Z
```

**Output (JSON, with `--json`):**

```json
[
  {
    "id": 12,
    "owner": "alice",
    "full_name": "alice/secret-project",
    "name": "secret-project",
    "description": "Private agent orchestration layer",
    "is_public": false,
    "num_stars": 0,
    "default_bookmark": "main",
    "created_at": "2026-03-01T10:00:00.000Z",
    "updated_at": "2026-03-21T08:30:00.000Z"
  }
]
```

**Empty state:** When the user has no repositories, human-readable output shows `"No repositories found"`.

**Error behavior:**
- Unauthenticated: non-zero exit code, stderr: `Error: authentication required`

### TUI UI

The TUI repositories screen shows the authenticated user's own repos:

```
┌── Your repositories ─────────────────────────────────────────┐
│                                                              │
│  🔒  secret-project                                         │
│        Private agent orchestration layer                     │
│        main · Updated Mar 21, 2026                           │
│                                                              │
│  ★ 42  my-project                                           │
│        A jj-native tool for project scaffolding              │
│        main · Updated Mar 20, 2026                           │
│                                                              │
│  ★  5  dotfiles                                              │
│        main · Updated Feb 10, 2026                           │
│                                                              │
│  Page 1 of 3  ← →                                            │
└──────────────────────────────────────────────────────────────┘
```

- Private repos show a lock icon (🔒) instead of a star count.
- Public repos show star count (★ N).
- Each repository card shows: visibility indicator, name (bold), description (dimmed, single-line truncated), default bookmark, and relative update time.
- Pressing Enter on a repository navigates to repository detail.
- Left/right arrow keys or `[` / `]` navigate pages.
- Empty state: `"You haven't created any repositories yet."`

### Web UI Design

The web UI renders the personal repository list on the authenticated user's dashboard and profile page.

**Layout:**
- **Dashboard / home view:** Repository list is the primary content area.
- **Self-profile view (`/:username` when viewing your own profile):** Repository list appears under a "Repositories" tab, identical to the public profile but including private repos.
- **Tab bar:** "Repositories" (default active, shows count badge including private repos), "Starred".

**Each repository card displays:**
- **Repository name** as a link to `/:owner/:repo` (bold, colored).
- **Visibility badge** — "public" or "private" tag next to the name.
- **Description** (one or two lines, truncated with ellipsis if needed). Omitted if empty.
- **Star count** with a star icon (★).
- **Default bookmark** shown as a tag/badge.
- **Last updated** as a relative time (e.g., "Updated 3 hours ago").
- **Fork indicator** if the repository is a fork.
- **Archived indicator** if the repository is archived.

**Pagination:**
- Below the repository list, a pagination control shows page numbers and prev/next buttons.
- First load fetches page 1 with 30 items.
- URL updates to `?tab=repositories&page=2` on navigation (no full page reload).

**Empty state:**
- "You haven't created any repositories yet." centered in the content area with a muted icon and a "Create repository" call-to-action button.

**Responsive behavior:**
- On narrow viewports (< 640px), the star count and default bookmark collapse into a single line below the description.
- The tab bar remains sticky below the profile header.

### Documentation

The following end-user documentation should be written:

1. **API Reference — List Authenticated User Repositories:** Document `GET /api/user/repos` with request/response examples, pagination headers, error codes, field descriptions, and authentication requirements. Include notes on both legacy and cursor pagination styles. Note that the endpoint requires authentication and returns both public and private repos.
2. **CLI Reference — `codeplane repo list`:** Document the default behavior (listing your own repos), the `--limit` and `--page` flags, human-readable and JSON output examples, and error behavior for unauthenticated calls.
3. **User Guide — Managing Your Repositories:** A short guide explaining how to view your personal repository list from the web dashboard, CLI, TUI, and desktop. Include tips on pagination for prolific users and clarify the difference between this and the public profile repository list.

## Permissions & Security

### Authorization Model

| Role | Can list their own repos via `GET /api/user/repos`? |
|------|------------------------------------------------------|
| Anonymous (unauthenticated) | ❌ No — returns 401 |
| Authenticated user | ✅ Yes — sees all their own repos (public + private) |
| PAT-authenticated user | ✅ Yes — sees all their own repos (public + private) |
| OAuth2 token holder | ✅ Yes — sees all their own repos (scope-dependent in future) |
| Admin | ✅ Yes — sees their own repos only (not other users' private repos) |

This endpoint is strictly self-scoped. An authenticated admin sees only their own repositories, not all repositories on the platform. Viewing other users' private repositories requires the separate admin API surface.

### Rate Limiting

- **Authenticated callers:** 300 requests per minute per token/session.
- **Rate limit response:** `429 Too Many Requests` with `Retry-After` header indicating seconds until reset.
- Rate limiting is enforced at the middleware layer, shared with other user-scoped endpoints.
- Anonymous callers cannot reach this endpoint (401 before rate limit check).

### Data Privacy Constraints

- **Self-scoped only:** The endpoint only returns repositories owned by the requesting user. There is no code path where user A can see user B's private repositories via this endpoint.
- **No internal fields exposed:** The `mapRepoSummary` function explicitly selects only safe fields. Internal fields such as `shard_id`, `search_vector`, `workspace_dependencies`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, and `next_landing_number` are never included in the response.
- **No PII exposure beyond the user's own data:** The response contains the `owner` field (the user's own username). No email addresses, login history, or other PII is included.
- **Token scope validation (future):** When OAuth2 scopes are enforced, this endpoint should require a `read:repos` or equivalent scope. Without the correct scope, the response should be 403.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `PersonalRepoListViewed` | On successful 200 response from `GET /api/user/repos` | `user_id`, `client` (web/cli/tui/desktop/vscode/neovim/api), `response_time_ms`, `result_count`, `total_count`, `page`, `per_page`, `has_private_repos` (boolean) |
| `PersonalRepoListEmpty` | On successful 200 response with zero results and page 1 | `user_id`, `client`, `account_age_days` |
| `PersonalRepoListPaginated` | On successful 200 response with page > 1 | `user_id`, `client`, `page`, `per_page`, `total_count` |
| `PersonalRepoListAuthFailed` | On 401 response | `client`, `auth_method_attempted` (cookie/pat/oauth2/none), `request_id` |

### Event Properties

- `user_id` (number): The authenticated user's ID.
- `client` (string enum): One of `"web"`, `"cli"`, `"tui"`, `"desktop"`, `"vscode"`, `"neovim"`, `"api"`.
- `response_time_ms` (number): Server-side response latency in milliseconds.
- `result_count` (number): Number of items returned in this page.
- `total_count` (number): Total number of repositories for the user (public + private).
- `page` (number): Current page number.
- `per_page` (number): Page size used.
- `has_private_repos` (boolean): Whether any of the returned items have `is_public: false`.
- `account_age_days` (number): Days since the user's account was created (for empty-list analysis).
- `auth_method_attempted` (string): Which auth mechanism was tried when a 401 occurred.
- `request_id` (string): Request correlation ID.

### Funnel Metrics and Success Indicators

- **Personal repo list view volume:** Total `PersonalRepoListViewed` events per day, segmented by client. Primary adoption metric.
- **Empty list rate for new users:** Ratio of `PersonalRepoListEmpty` where `account_age_days < 7` to total first-week views. If > 60%, the onboarding flow may need a "create your first repo" nudge.
- **Pagination depth:** Distribution of `page` values from `PersonalRepoListPaginated`. Users paging beyond 3 indicates the need for search/filter on this endpoint.
- **Private repo visibility ratio:** Percentage of `PersonalRepoListViewed` where `has_private_repos = true`. Indicates adoption of private repos.
- **CLI vs web split:** Client distribution across events. Tracks whether CLI users are actively using `codeplane repo list`.
- **Auth failure rate:** Ratio of `PersonalRepoListAuthFailed` to total attempts. A sudden spike suggests session expiry issues or breaking auth changes.
- **Repo list → Repo view click-through (web):** Percentage of `PersonalRepoListViewed` events followed by a repository view event within the same session. Measures whether the list is useful as a navigation surface.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Condition |
|-----------|-------|-------------------|----------|
| Personal repo list request received | `DEBUG` | `user_id`, `request_id`, `page`, `per_page` | Every authenticated request |
| Personal repo list succeeded | `INFO` | `user_id`, `request_id`, `duration_ms`, `result_count`, `total_count` | 200 response |
| Personal repo list auth failed | `WARN` | `request_id`, `client_ip`, `auth_method` | 401 response |
| Personal repo list bad request | `WARN` | `request_id`, `user_id`, `reason` | 400 response |
| Personal repo list internal error | `ERROR` | `user_id`, `request_id`, `error_message`, `stack_trace` | 500 response |
| Rate limit exceeded on personal repo list | `WARN` | `user_id`, `request_id`, `rate_limit_bucket` | 429 response |
| Pagination clamped | `DEBUG` | `user_id`, `request_id`, `requested_per_page`, `clamped_per_page` | When per_page > 100 is clamped |
| User not found during self-repo lookup | `ERROR` | `user_id`, `request_id` | getUserByID returns null for authenticated user (data inconsistency) |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_personal_repo_list_requests_total` | Counter | `status` (200, 400, 401, 429, 500), `client` | Total personal repo list requests |
| `codeplane_personal_repo_list_request_duration_seconds` | Histogram | `status` | Response latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_personal_repo_list_result_count` | Histogram | — | Distribution of result counts per page (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_personal_repo_list_total_count` | Histogram | — | Distribution of total repo counts per user queried (buckets: 0, 1, 5, 10, 25, 50, 100, 500, 1000) |
| `codeplane_personal_repo_list_auth_failures_total` | Counter | `auth_method` | Total 401 failures segmented by auth method attempted |

### Alerts

#### Alert: Personal Repo List Endpoint Elevated Latency

**Condition:** `histogram_quantile(0.99, rate(codeplane_personal_repo_list_request_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database connection pool health via `SELECT count(*) FROM pg_stat_activity;`.
2. Check if slow queries exist via `pg_stat_statements` for `listUserRepos` and `countUserRepos` queries.
3. Verify the `user_id` column on the `repositories` table has an index. Run `EXPLAIN ANALYZE` on the listing query with a known user_id.
4. Check if a user with an unusually large number of repos (> 1000) is being queried repeatedly, causing large OFFSET scans.
5. If the problem is OFFSET-based degradation for deep pages: consider keyset pagination using `(updated_at, id)` as the cursor key.
6. Check if the server is under memory pressure or CPU contention from concurrent requests.

#### Alert: Personal Repo List Endpoint 5xx Spike

**Condition:** `rate(codeplane_personal_repo_list_requests_total{status="500"}[5m]) > 0.1` sustained for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server error logs for stack traces associated with the personal repo list route (`GET /api/user/repos`).
2. Common causes: database connection failure, `mapRepoSummary` mapping error (e.g., unexpected null field), pagination arithmetic overflow.
3. Verify database connectivity: attempt a direct SQL query against `repositories`.
4. Check for recent deployments. If the 5xx spike correlates with a deploy, consider rolling back.
5. If the error is in the mapping function: check if a database migration changed the `repositories` row shape without updating the TypeScript mapper.
6. Check if the `getUserByID` lookup is failing for authenticated user IDs that should exist — this indicates a data integrity issue.

#### Alert: Elevated Auth Failure Rate on Personal Repo List

**Condition:** `rate(codeplane_personal_repo_list_auth_failures_total[5m]) > 5` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a deployment changed the auth middleware or session validation logic.
2. Query recent `PersonalRepoListAuthFailed` events segmented by `auth_method`. Determine if the failures are concentrated on cookies (session expiry), PATs (revoked tokens), or OAuth2 (token expiry).
3. If cookie-based: check session store health and cookie configuration (domain, secure flag, SameSite).
4. If PAT-based: check if a batch token revocation occurred or if the PAT validation query is failing.
5. If broadly distributed: check if the `requireUser` middleware has a regression.

#### Alert: Abnormal Empty Personal Repo List Rate

**Condition:** `rate(codeplane_personal_repo_list_result_count_bucket{le="0"}[15m]) / rate(codeplane_personal_repo_list_requests_total{status="200"}[15m]) > 0.8` sustained for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Verify the `repositories` table has data. Run `SELECT COUNT(*) FROM repositories;`.
2. Check if the `user_id` foreign key resolution is working correctly — ensure `getUserByID` returns valid user rows.
3. Check if a migration or bulk operation accidentally deleted or reassigned user-owned repositories.
4. If this is a data issue: restore from backup or run a corrective query. If this is a query bug: investigate the SQL or user_id resolution logic.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | User-Visible Error |
|---|---|---|
| Database connection lost | 500 Internal Server Error | `"internal server error"` |
| `mapRepoSummary` receives null field | 500 (should not happen if DB schema is correct) | `"internal server error"` |
| Authenticated user ID not found in users table | 500 (data inconsistency) | `"internal server error"` |
| `per_page` set to extremely large value | Clamped to 100, 200 response | Normal paginated response |
| Negative page number | Normalized to page 1, 200 response | Normal first-page response |
| Non-numeric cursor value | 400 Bad Request | `"invalid pagination parameters"` |
| Expired session cookie | 401 Unauthorized | `"authentication required"` |
| Revoked PAT | 401 Unauthorized | `"authentication required"` |
| Rate limit exceeded | 429 | `"rate limit exceeded"` with `Retry-After` header |
| OFFSET exceeds total rows | Empty array returned, 200 | Empty result set |
| Concurrent repository creation during listing | May or may not include new repo; eventually consistent | Normal response |
| Concurrent repository deletion during listing | Stale count possible; item may be missing from page | Normal response |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `GET /api/user/repos returns 200 with correct shape` | Authenticate as a user with repos, request their repo list, assert 200 and each item has exactly the 10 required fields (`id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`). |
| 2 | `GET /api/user/repos returns both public and private repos` | Create a user with 2 public repos and 1 private repo. Request their repo list. Assert response contains exactly 3 items and `X-Total-Count: 3`. |
| 3 | `GET /api/user/repos includes private repos with is_public false` | Create a user with a private repo. Request repo list. Assert at least one item has `is_public: false`. |
| 4 | `GET /api/user/repos returns repos ordered by updated_at desc` | Create a user with 3 repos, update them in known order. Request repo list. Assert items are sorted by `updated_at` descending. |
| 5 | `GET /api/user/repos excludes internal fields` | Assert response items do NOT contain `shard_id`, `search_vector`, `workspace_dependencies`, `workspace_idle_timeout_secs`, `workspace_persistence`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, `next_landing_number`, `lower_name`, `topics`, `user_id`, `org_id`. |
| 6 | `GET /api/user/repos without auth returns 401` | Request with no auth header or cookie. Assert 401 with body `{ "message": "authentication required" }`. |
| 7 | `GET /api/user/repos with expired token returns 401` | Use a revoked PAT. Assert 401. |
| 8 | `GET /api/user/repos returns empty array for user with no repos` | Create a fresh user with no repos. Request their repo list. Assert 200, body is `[]`, `X-Total-Count: 0`. |
| 9 | `GET /api/user/repos default pagination is 30` | Create a user with 35 repos. Request without pagination params. Assert response has exactly 30 items and `X-Total-Count: 35`. |
| 10 | `GET /api/user/repos respects per_page` | Request with `?per_page=5`. Assert response has exactly 5 items. |
| 11 | `GET /api/user/repos clamps per_page to 100` | Create a user with 120 repos. Request with `?per_page=200`. Assert response has exactly 100 items. |
| 12 | `GET /api/user/repos page 2 returns next set` | Create user with 35 repos. Request `?page=1&per_page=20` and `?page=2&per_page=20`. Assert page 1 has 20 items, page 2 has 15 items, no overlap in IDs. |
| 13 | `GET /api/user/repos page beyond last returns empty` | Create user with 5 repos. Request `?page=2&per_page=30`. Assert 200 with empty array. |
| 14 | `GET /api/user/repos cursor pagination works` | Request with `?cursor=0&limit=10`, then `?cursor=10&limit=10`. Assert no overlap and correct offset behavior. |
| 15 | `GET /api/user/repos X-Total-Count header is correct` | Create user with 7 repos (mix of public and private). Assert `X-Total-Count` header equals `7`. |
| 16 | `GET /api/user/repos Link header contains pagination links` | Create user with 50 repos. Request `?page=2&per_page=10`. Assert `Link` header contains `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`. |
| 17 | `GET /api/user/repos with PAT auth returns same results as session auth` | Authenticate via both PAT and session cookie. Assert identical response bodies. |
| 18 | `GET /api/user/repos full_name format is correct` | Assert every item's `full_name` equals `{owner}/{name}`. |
| 19 | `GET /api/user/repos num_stars is a number not a string` | Assert `typeof item.num_stars === "number"` for each item. |
| 20 | `GET /api/user/repos timestamps are valid ISO 8601` | Assert `created_at` and `updated_at` parse as valid Date objects and match ISO 8601 format. |
| 21 | `GET /api/user/repos does not include org-owned repos` | Create a user who is a member of an org. Create repos under the org. Assert user's personal repo list does not include org repos. |
| 22 | `GET /api/user/repos includes archived repos` | Create a repo and archive it. Assert it still appears in the personal repo list. |
| 23 | `GET /api/user/repos includes forked repos` | Fork a repo. Assert the fork appears in the personal repo list. |
| 24 | `GET /api/user/repos per_page=0 defaults to 30` | Request with `?per_page=0`, assert response has up to 30 items. |
| 25 | `GET /api/user/repos page=0 normalizes to page 1` | Request with `?page=0`, assert response is the same as `?page=1`. |
| 26 | `GET /api/user/repos idempotency` | Make the same authenticated request twice rapidly, assert both return identical 200 responses. |
| 27 | `GET /api/user/repos description with Unicode` | Create repo with description `"📦 测试 éàü"`. Assert round-trip fidelity. |
| 28 | `GET /api/user/repos with max per_page=100 and exactly 100 repos` | Create user with exactly 100 repos. Request with `?per_page=100`. Assert response has exactly 100 items. |
| 29 | `GET /api/user/repos with per_page=101 clamps and returns max 100` | Create user with 105 repos. Request `?per_page=101`. Assert response has exactly 100 items. |
| 30 | `GET /api/user/repos response Content-Type is application/json` | Assert `Content-Type` header is `application/json`. |
| 31 | `GET /api/user/repos owner field uses canonical username casing` | Create user `TestUser`, authenticate. Assert every repo's `owner` field is `TestUser` (not `testuser`). |
| 32 | `GET /api/user/repos newly created repo appears immediately` | Create a repo, then immediately list repos. Assert the new repo appears in the list. |
| 33 | `GET /api/user/repos deleted repo does not appear` | Create a repo, delete it, then list repos. Assert the deleted repo is absent. |
| 34 | `GET /api/user/repos repo toggled to private still appears` | Create a public repo, make it private, then list repos. Assert it appears with `is_public: false`. |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 35 | `codeplane repo list returns authenticated user repos` | Run `codeplane repo list --json`, assert exit code 0, assert array contains at least one repo. |
| 36 | `codeplane repo list --json output has correct fields` | Parse stdout as JSON array. Assert each item has `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`. |
| 37 | `codeplane repo list includes private repos` | Create a private repo. Run `codeplane repo list --json`. Assert at least one item has `is_public: false`. |
| 38 | `codeplane repo list human-readable shows table` | Run without `--json`, assert stdout contains `Name`, `Visibility`, `Default`, `Updated` headers. |
| 39 | `codeplane repo list with no repos shows empty message` | As a fresh user, run `codeplane repo list`, assert exit code 0, output contains `"No repositories found"`. |
| 40 | `codeplane repo list --limit 5 respects limit` | Run with `--limit 5 --json`, assert array length ≤ 5. |
| 41 | `codeplane repo list --page 2 respects pagination` | Create user with > 30 repos. Run with `--page 2 --json`, assert array is non-empty and different from page 1. |
| 42 | `codeplane repo list unauthenticated returns error` | Run without auth config. Assert non-zero exit code and stderr contains `"authentication required"`. |
| 43 | `codeplane repo list private repos show 'private' visibility` | Run `codeplane repo list` (human-readable). Assert private repos show "private" in the Visibility column. |

### Web UI E2E Tests (Playwright)

| # | Test Name | Description |
|---|-----------|-------------|
| 44 | `Dashboard shows personal repositories` | Sign in, navigate to dashboard/home, assert repository list is visible with repo cards. |
| 45 | `Dashboard repo list shows both public and private repos` | Create public and private repos. Assert both appear in the dashboard repo list. |
| 46 | `Dashboard repo card displays name, visibility badge, description, stars, and updated time` | Assert at least one repo card contains all expected visual fields. |
| 47 | `Dashboard repo card private badge visible for private repos` | Assert that private repos show a "private" badge/tag. |
| 48 | `Dashboard repo name links to repo page` | Click on a repo name, assert navigation to `/:owner/:repo`. |
| 49 | `Dashboard shows empty state for user with no repos` | Sign in as fresh user, assert "You haven't created any repositories yet." is visible with a create button. |
| 50 | `Dashboard repo list pagination` | Create user with > 30 repos. Assert pagination controls are visible. Click "Next", assert new repos load. |
| 51 | `Dashboard repo list not accessible without authentication` | Navigate to dashboard in unauthenticated session, assert redirect to login page. |
| 52 | `Dashboard repo card handles empty description gracefully` | Create a repo with no description. Assert card renders without broken layout. |
| 53 | `Dashboard repo list sorted by most recently updated` | Create repos updated at different times. Assert first visible repo has the most recent updated_at. |
| 54 | `Self-profile view shows personal repos including private` | Navigate to own profile `/:username`. Assert "Repositories" tab is active and both public and private repos appear. |

### TUI Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 55 | `TUI repos screen renders for authenticated user` | Launch TUI, navigate to repositories screen, assert screen contains repo names, visibility indicators, and star counts. |
| 56 | `TUI repos screen shows private repos with lock icon` | Assert that private repos display a lock/private indicator. |
| 57 | `TUI repos screen shows empty state for user with no repos` | Launch TUI as fresh user, navigate to repos, assert empty state message. |
| 58 | `TUI repos screen pagination` | As a user with many repos, assert pagination indicators and navigation keys work. |

### Rate Limiting Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 59 | `Personal repo list endpoint returns 429 after rate limit exceeded` | Send 301 authenticated requests in rapid succession, assert 429 on the 301st request. |
| 60 | `Personal repo list endpoint returns Retry-After header on 429` | Assert `Retry-After` header is present and contains a positive integer. |

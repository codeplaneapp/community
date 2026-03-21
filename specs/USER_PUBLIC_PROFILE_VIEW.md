# USER_PUBLIC_PROFILE_VIEW

Specification for USER_PUBLIC_PROFILE_VIEW.

## High-Level User POV

When you visit another user's profile on Codeplane — whether by clicking their name on a repository, issue, landing request, or search result, or by navigating directly to their username URL — you see a public overview of who they are and what they've been working on.

The profile page shows the person's display name, username, avatar, and bio. Below that, you see a list of their public repositories, along with a tab for repositories they've starred. Every repository listing shows the repository name, description, star count, and when it was last updated, giving you a quick sense of what the person works on and what they find interesting.

Usernames are case-insensitive. If you type a username in the wrong case, the system resolves it to the correct user. If the username doesn't exist or belongs to a deactivated account, you get a clear "user not found" message rather than a confusing blank page.

The profile is fully accessible without signing in. Anonymous visitors see the same public information as authenticated users. No private data — such as email addresses, admin status, or private repositories — is ever exposed on the public profile. This makes the profile safe to share and link to externally.

From the CLI, you can view any user's public profile with `codeplane user view <username>`, or view your own authenticated profile with `codeplane user view` (no argument). The output is machine-parseable with `--json` and human-readable by default.

The profile is the starting point for understanding who someone is on Codeplane — a lightweight, public, always-available identity surface.

## Acceptance Criteria

### Definition of Done

- [ ] Any visitor (authenticated or anonymous) can view the public profile of any active user by username.
- [ ] The public profile displays: avatar, display name, username, bio, and account creation date.
- [ ] The public profile does NOT expose: email, admin status, or any private/internal fields.
- [ ] A tab or section shows the user's public repositories, paginated.
- [ ] A tab or section shows the user's starred public repositories, paginated.
- [ ] Usernames are resolved case-insensitively (e.g., `JaneDoe`, `janedoe`, `JANEDOE` all resolve to the same user).
- [ ] Requesting a nonexistent username returns a 404 with a structured error body.
- [ ] Requesting a deactivated/disabled user returns a 404 (same as nonexistent — no information leak).
- [ ] The CLI command `codeplane user view <username>` returns the public profile as structured JSON.
- [ ] The CLI command `codeplane user view` (no argument, authenticated) returns the caller's full profile.
- [ ] All API responses use ISO 8601 timestamps.

### Edge Cases

- [ ] A username that is entirely whitespace returns a 400 "username is required" error.
- [ ] A username containing only valid characters but not matching any user returns 404.
- [ ] An empty string username path segment is handled gracefully (never a 500).
- [ ] If a user has no public repositories, the repos tab renders an empty list with `total_count: 0`.
- [ ] If a user has no starred repositories, the starred tab renders an empty list with `total_count: 0`.
- [ ] A user whose `bio` is an empty string displays the bio section as absent or blank — not as `null` or `undefined`.
- [ ] A user whose `avatar_url` is an empty string displays a default/fallback avatar — not a broken image.
- [ ] A user whose `display_name` is empty falls back to showing the username.
- [ ] Pagination with `page=0` or `per_page=0` returns a 400 error.
- [ ] Pagination with `per_page` greater than 100 is silently capped to 100.
- [ ] Pagination with a non-numeric `page` value returns a 400 error.
- [ ] The profile API returns consistent JSON field names (`display_name`, `avatar_url`, `created_at`, `updated_at`) — never camelCase.

### Boundary Constraints

- [ ] `username` path parameter: 1–39 characters, alphanumeric and hyphens only, must not start or end with a hyphen.
- [ ] `bio` field: up to 160 characters displayed; longer values are truncated in UI with an ellipsis.
- [ ] `display_name` field: up to 255 characters.
- [ ] `avatar_url` field: must be a valid HTTP or HTTPS URL when non-empty.
- [ ] Pagination `per_page` / `limit`: minimum 1, maximum 100, default 30.
- [ ] Pagination `page`: minimum 1, default 1.
- [ ] Repo listing returned per page: maximum 100 items.

## Design

### Web UI Design

**Route**: `/:owner` — resolves to the user public profile when `owner` matches a user (not an organization).

**Layout**:

- **Profile Header**: Rendered at the top of the page.
  - Avatar image (120×120px, rounded). Falls back to a generated identicon or initials badge when `avatar_url` is empty.
  - Display name in large font. If empty, show username.
  - Username in lighter text prefixed with `@`.
  - Bio text below the name, rendered as plain text (no markdown).
  - "Joined" date showing the relative time since `created_at` (e.g., "Joined 3 months ago"), with full date on hover tooltip.

- **Tab Bar**: Two tabs below the header.
  - **Repositories** (default active): Lists public repositories owned by this user.
  - **Starred**: Lists public repositories this user has starred.

- **Repository List Items**: Each item shows:
  - Repository name as a link to `/:owner/:repo`.
  - Description (truncated to one line if long).
  - Star count with star icon.
  - Default bookmark name.
  - Last updated relative timestamp.

- **Empty States**:
  - Repositories tab empty: "This user has no public repositories yet."
  - Starred tab empty: "This user hasn't starred any repositories yet."

- **Pagination**: Page-based pagination at the bottom of each tab, showing "Page X of Y" with previous/next controls. Default 30 items per page.

- **404 State**: When the username doesn't exist, show a centered message: "User not found" with a link back to the home page.

### API Shape

#### Get Public User Profile

```
GET /api/users/:username
```

**Authentication**: Not required.

**Path Parameters**:
| Parameter  | Type   | Description                        |
|------------|--------|------------------------------------|\n| `username` | string | The username to look up (case-insensitive) |

**Success Response** (`200 OK`):
```json
{
  "id": 42,
  "username": "janedoe",
  "display_name": "Jane Doe",
  "bio": "Building things with jj.",
  "avatar_url": "https://example.com/avatars/janedoe.png",
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2026-03-20T14:22:00.000Z"
}
```

**Error Responses**:
| Status | Condition                         | Body                                        |
|--------|-----------------------------------|---------------------------------------------|
| 400    | Username is empty or whitespace   | `{ "message": "username is required" }`     |
| 404    | User not found or inactive        | `{ "message": "user not found" }`           |

#### List User's Public Repositories

```
GET /api/users/:username/repos
```

**Authentication**: Not required.

**Query Parameters**:
| Parameter  | Type   | Default | Description                          |
|------------|--------|---------|--------------------------------------|
| `page`     | number | 1       | Page number (legacy pagination)      |
| `per_page` | number | 30      | Items per page (max 100)             |
| `cursor`   | string | ""      | Offset cursor (cursor pagination)    |
| `limit`    | number | 30      | Items per page (max 100)             |

**Success Response** (`200 OK`): Array of `RepoSummary` objects.

**Response Headers**: `X-Total-Count`, `Link` (pagination).

**Error Responses**: 400 for invalid pagination, 404 for nonexistent user.

#### List User's Starred Repositories

```
GET /api/users/:username/starred
```

Same shape as `/repos` above, but returns repositories the user has starred.

### SDK Shape

The `UserService` class in `@codeplane/sdk` exposes:

- `getUserByUsername(username: string): Promise<Result<PublicUserProfile, APIError>>`
- `listUserReposByUsername(username: string, page: number, perPage: number): Promise<Result<RepoListResult, APIError>>`
- `listUserStarredReposByUsername(username: string, page: number, perPage: number): Promise<Result<RepoListResult, APIError>>`

The `PublicUserProfile` type:
```typescript
interface PublicUserProfile {
  id: number;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}
```

### CLI Command

```
codeplane user view [username]
```

- With `<username>` argument: Calls `GET /api/users/:username` and displays the public profile.
- Without argument (authenticated): Calls `GET /api/user` and displays the caller's full profile.
- Without argument (unauthenticated): Prints an error message and exits with code 1.

**Flags**: `--json` for raw JSON output.

**Human-readable output**:
```
@janedoe (Jane Doe)
Building things with jj.

Joined: June 15, 2025
```

### TUI UI

The TUI should include a user profile detail view accessible from search results and user links. Shows username, display name, bio, join date, and public repositories.

### Documentation

- **API Reference — Users**: Document `GET /api/users/:username`, `GET /api/users/:username/repos`, and `GET /api/users/:username/starred` with full schemas, pagination, and errors.
- **CLI Reference — `user view`**: Document usage examples for public and authenticated profile viewing, including `--json`.
- **Web Guide — User Profiles**: Brief guide on public profile information and navigation.

## Permissions & Security

### Authorization Roles

| Action                         | Anonymous | Authenticated | Admin |
|--------------------------------|-----------|---------------|-------|
| View public user profile       | ✅         | ✅             | ✅     |
| View user's public repos       | ✅         | ✅             | ✅     |
| View user's starred repos      | ✅         | ✅             | ✅     |
| View own full profile (`/api/user`) | ❌    | ✅             | ✅     |

No elevated role is required for any public profile operation. All public profile endpoints are fully open.

### Rate Limiting

- **Anonymous callers**: 60 requests per minute per IP address to `/api/users/*` endpoints. This prevents enumeration and scraping.
- **Authenticated callers**: 300 requests per minute per user to `/api/users/*` endpoints.
- **Pagination abuse**: The `per_page`/`limit` cap at 100 prevents large payload extraction. No additional rate limit is needed.
- Rate limit responses must use `429 Too Many Requests` with `Retry-After` header.

### Data Privacy & PII

- The public profile endpoint MUST NOT return `email`, `is_admin`, `prohibit_login`, `wallet_address`, `email_notifications_enabled`, `last_login_at`, or any field not in the `PublicUserProfile` type.
- Inactive/disabled users MUST return 404, not a different status. This prevents account enumeration of disabled accounts.
- The `user_type` field is not exposed in the public profile.
- The `id` field is exposed (numeric identifier, not sensitive). If sequential ID enumeration becomes a concern, consider switching to opaque identifiers.
- The username lookup is case-insensitive but always returns the canonical (original) casing of the username in the response.

## Telemetry & Product Analytics

### Key Business Events

| Event Name               | Trigger                                       | Properties                                                                                      |
|--------------------------|-----------------------------------------------|------------------------------------------------------------------------------------------------|
| `UserProfileViewed`      | `GET /api/users/:username` returns 200        | `viewed_username`, `viewer_user_id` (nullable if anonymous), `client` (web/cli/tui/api), `referrer_type` (search/repo/issue/direct) |
| `UserReposListed`        | `GET /api/users/:username/repos` returns 200  | `viewed_username`, `viewer_user_id` (nullable), `page`, `per_page`, `total_count`, `client`    |
| `UserStarredReposListed` | `GET /api/users/:username/starred` returns 200| `viewed_username`, `viewer_user_id` (nullable), `page`, `per_page`, `total_count`, `client`    |
| `UserProfileNotFound`    | `GET /api/users/:username` returns 404        | `requested_username`, `viewer_user_id` (nullable), `client`                                    |

### Funnel Metrics & Success Indicators

- **Profile view → Repository click-through rate**: Percentage of profile views that lead to a repository page view within the same session. Target: >20%.
- **Profile views per active user per week**: Measures how often users explore other users' profiles. Upward trend indicates healthy community discovery.
- **404 rate on profile lookups**: High 404 rates may indicate broken links, username changes, or enumeration attacks. Alert if >15% of profile lookups are 404s over a rolling 1-hour window.
- **CLI profile view adoption**: Percentage of CLI-active users who use `codeplane user view` at least once per month.
- **Pagination depth**: Average page depth reached on repos/starred listings. If most users never paginate past page 1, consider increasing default `per_page` or improving repository sort order.

## Observability

### Logging Requirements

| Log Event                  | Level | Structured Context                                                          |
|----------------------------|-------|-----------------------------------------------------------------------------|
| Profile lookup success     | INFO  | `username`, `user_id`, `request_id`, `response_time_ms`, `client_ip`       |
| Profile lookup 404         | WARN  | `requested_username`, `request_id`, `client_ip`                             |
| Profile lookup 400         | WARN  | `requested_username`, `request_id`, `validation_error`, `client_ip`         |
| Repo list success          | INFO  | `username`, `page`, `per_page`, `total_count`, `request_id`, `response_time_ms` |
| Starred list success       | INFO  | `username`, `page`, `per_page`, `total_count`, `request_id`, `response_time_ms` |
| Rate limit triggered       | WARN  | `client_ip`, `user_id` (nullable), `endpoint`, `request_id`                |
| Unexpected service error   | ERROR | `username`, `request_id`, `error_message`, `stack_trace`                    |

### Prometheus Metrics

| Metric Name                                      | Type      | Labels                                     | Description                                                |
|--------------------------------------------------|-----------|--------------------------------------------|------------------------------------------------------------|\n| `codeplane_user_profile_requests_total`              | Counter   | `status` (200/400/404/429/500), `client`   | Total profile lookup requests                              |
| `codeplane_user_profile_request_duration_seconds`    | Histogram | `status`, `endpoint`                       | Latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5)  |
| `codeplane_user_repos_list_requests_total`           | Counter   | `status`, `client`                         | Total user repo list requests                              |
| `codeplane_user_repos_list_request_duration_seconds` | Histogram | `status`                                   | Latency of repo list requests                              |
| `codeplane_user_starred_list_requests_total`         | Counter   | `status`, `client`                         | Total user starred list requests                           |
| `codeplane_user_starred_list_request_duration_seconds`| Histogram| `status`                                   | Latency of starred list requests                           |
| `codeplane_user_profile_rate_limited_total`          | Counter   | `client_type` (anonymous/authenticated)    | Total rate-limited profile requests                        |

### Alerts

#### Alert: High Profile 404 Rate
- **Condition**: `rate(codeplane_user_profile_requests_total{status="404"}[5m]) / rate(codeplane_user_profile_requests_total[5m]) > 0.15` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if there has been a recent bulk user deactivation or username migration by querying admin audit logs.
  2. Check access logs for patterns — is a single IP or small set of IPs generating most 404s? If so, this is likely enumeration; confirm and block/rate-limit the source.
  3. Check if there are broken links in the web UI or external integrations pointing to deleted users.
  4. If the 404 rate correlates with a deploy, check for routing regressions in the user route handler.
  5. If no clear cause, increase monitoring granularity and wait for the next window.

#### Alert: Elevated Profile Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_user_profile_request_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool health.
  2. Run `EXPLAIN ANALYZE` on the `getUserByLowerUsername` query for missing indexes on `lower_username`.
  3. Check if a concurrent migration or vacuum is locking the users table.
  4. Check overall server load.
  5. If query plan regressed, run `ANALYZE users` to refresh statistics.

#### Alert: Profile Endpoint Error Spike
- **Condition**: `rate(codeplane_user_profile_requests_total{status="500"}[5m]) > 0.5` sustained for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for ERROR-level entries with the `user_profile` tag.
  2. Verify database connectivity.
  3. Check if the user service was correctly initialized in the service registry.
  4. If errors correlate with a specific username pattern, check for data corruption.
  5. Roll back most recent deployment if errors started immediately after deploy.

#### Alert: Rate Limiting Spike
- **Condition**: `rate(codeplane_user_profile_rate_limited_total[5m]) > 10` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify top source IPs using access logs.
  2. Determine if traffic is legitimate integration or attack.
  3. For legitimate integrations, work with caller to implement caching.
  4. For attacks, consider adding IP to blocklist.
  5. Check if rate limit thresholds are appropriate for current traffic.

### Error Cases and Failure Modes

| Failure Mode                          | Expected Behavior                                           | Detection                                           |
|---------------------------------------|-------------------------------------------------------------|-----------------------------------------------------|
| Database unavailable                  | Return 500 with `{ "message": "internal error" }`. Log ERROR. | `status=500` counter spike                         |
| Malformed username (path traversal)   | Hono route matching prevents it. Return 404.                 | WARN log for unusual path patterns                  |
| Extremely long username in path       | Return 400 or 414 (not 500).                                 | 400/414 counter                                     |
| Case-insensitive lookup index missing | Query degrades to sequential scan. Latency increases.        | Latency histogram p95 alert                         |
| User row has NULL timestamps          | `mapPublicUserProfile` converts gracefully. No crash.        | Defensive code; no specific alert needed            |
| Concurrent user deletion during read  | Return 404.                                                  | Normal 404 path                                     |

## Verification

### API Integration Tests

| # | Test Description | Method | Expected |
|---|-----------------|--------|----------|
| 1 | Fetch existing user's public profile by exact username | `GET /api/users/testuser` | 200, body matches `PublicUserProfile` shape |
| 2 | Fetch existing user's public profile by uppercase username | `GET /api/users/TESTUSER` | 200, `username` returns canonical casing |
| 3 | Fetch existing user's public profile by mixed-case | `GET /api/users/TeStUsEr` | 200, same user returned |
| 4 | Fetch nonexistent username | `GET /api/users/no-such-user-xyz` | 404, `{ "message": "user not found" }` |
| 5 | Fetch with whitespace-only username | `GET /api/users/%20` | 400, `{ "message": "username is required" }` |
| 6 | Response does NOT contain `email` field | `GET /api/users/testuser` | 200, assert `email` key absent |
| 7 | Response does NOT contain `is_admin` field | `GET /api/users/testuser` | 200, assert `is_admin` key absent |
| 8 | `created_at` is valid ISO 8601 | `GET /api/users/testuser` | 200, parses as Date |
| 9 | `updated_at` is valid ISO 8601 | `GET /api/users/testuser` | 200, parses as Date |
| 10 | Deactivated user returns 404 | `GET /api/users/deactivated-user` | 404 |
| 11 | `avatar_url` is a string (possibly empty) | `GET /api/users/testuser` | 200, `typeof avatar_url === "string"` |
| 12 | `bio` is a string (possibly empty) | `GET /api/users/testuser` | 200, `typeof bio === "string"` |
| 13 | `id` is a positive integer | `GET /api/users/testuser` | 200, `id > 0` |
| 14 | List public repos for user with repositories | `GET /api/users/testuser/repos` | 200, array, `X-Total-Count` header present |
| 15 | List public repos for user with no repos | `GET /api/users/newuser/repos` | 200, empty array, `X-Total-Count: 0` |
| 16 | List repos with `page=1&per_page=2` | `GET /api/users/testuser/repos?page=1&per_page=2` | 200, length ≤ 2, `Link` header has `rel="next"` if more |
| 17 | `per_page=101` is capped to 100 | `GET /api/users/testuser/repos?per_page=101` | 200, at most 100 items |
| 18 | `page=0` returns 400 | `GET /api/users/testuser/repos?page=0` | 400 |
| 19 | `page=-1` returns 400 | `GET /api/users/testuser/repos?page=-1` | 400 |
| 20 | `per_page=0` returns 400 | `GET /api/users/testuser/repos?per_page=0` | 400 |
| 21 | `per_page=abc` returns 400 | `GET /api/users/testuser/repos?per_page=abc` | 400 |
| 22 | List repos for nonexistent user | `GET /api/users/ghost/repos` | 404 |
| 23 | Cursor-based pagination works | `GET /api/users/testuser/repos?cursor=0&limit=5` | 200, length ≤ 5 |
| 24 | `limit` exceeding max is capped | `GET /api/users/testuser/repos?limit=200` | 200, at most 100 items |
| 25 | Repo items include all required fields | `GET /api/users/testuser/repos` | Each item has `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at` |
| 26 | All repos returned are public | `GET /api/users/testuser/repos` | Every item has `is_public === true` |
| 27 | Private repos are NOT returned | Setup: user has private repo. `GET /api/users/testuser/repos` | Private repo absent |
| 28 | List starred repos | `GET /api/users/testuser/starred` | 200, array |
| 29 | List starred repos for user with no stars | `GET /api/users/newuser/starred` | 200, empty array, `X-Total-Count: 0` |
| 30 | Starred repos pagination | `GET /api/users/testuser/starred?page=1&per_page=1` | 200, length ≤ 1 |
| 31 | Starred repos for nonexistent user | `GET /api/users/ghost/starred` | 404 |
| 32 | Maximum valid `per_page` (100) works | `GET /api/users/testuser/repos?per_page=100` | 200 |
| 33 | Profile request without auth succeeds | `GET /api/users/testuser` (no auth) | 200 |
| 34 | Repos request without auth succeeds | `GET /api/users/testuser/repos` (no auth) | 200 |
| 35 | `Link` header contains `rel="first"` | `GET /api/users/testuser/repos?page=1&per_page=5` | Header present |

### CLI E2E Tests

| # | Test Description | Command | Expected |
|---|-----------------|---------|----------|
| 36 | View authenticated user's own profile | `codeplane user view --json` | Exit 0, JSON with `username` matching authenticated user |
| 37 | View public profile by username | `codeplane user view testuser --json` | Exit 0, JSON with `username: "testuser"` |
| 38 | View nonexistent user | `codeplane user view nonexistent-user-xyz --json` | Exit 1, error in stderr |
| 39 | Human-readable output | `codeplane user view testuser` | Exit 0, stdout contains `@testuser` |
| 40 | Own profile includes email | `codeplane user view --json` | Exit 0, JSON contains `email` field |
| 41 | Other user's profile does NOT include email | `codeplane user view testuser --json` | Exit 0, JSON does NOT contain `email` |

### Web UI E2E Tests (Playwright)

| # | Test Description | Expected |
|---|-----------------|----------|
| 42 | Navigate to `/:username` shows display name | Page contains display name text |
| 43 | Navigate to `/:username` shows avatar | Avatar element visible |
| 44 | Navigate to `/:username` shows bio | Bio text visible |
| 45 | Navigate to `/:username` shows join date | Page contains "Joined" text |
| 46 | Repositories tab active by default | Tab has active styling |
| 47 | Clicking Starred tab shows starred repos | Tab switches, starred repos load |
| 48 | Nonexistent user shows 404 page | Page shows "User not found" |
| 49 | Repo items link to `/:owner/:repo` | Click navigates to repo page |
| 50 | Pagination controls appear when needed | Pagination nav visible |
| 51 | Profile loads without authentication | Page renders without login redirect |
| 52 | Empty bio shows no "undefined" text | Bio area empty, no literal "undefined" |
| 53 | Empty avatar shows fallback | Fallback element visible |

### Load & Boundary Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 54 | Profile responds within 500ms at p95 | Latency check passes |
| 55 | 100 concurrent requests succeed | All return 200 |
| 56 | Username at max valid length (39 chars) resolves | 200 if user exists |
| 57 | Username over max length returns 404 or 400 (not 500) | No server error |

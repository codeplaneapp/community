# USER_SELF_PROFILE_VIEW

Specification for USER_SELF_PROFILE_VIEW.

## High-Level User POV

When you are signed into Codeplane and want to see your own profile — the same identity other people see when they visit your page, plus additional private details only you should know — you navigate to your profile page or use the CLI to inspect your account.

Your self-profile view shows everything the public sees — your display name, username, avatar, and bio — plus private information that only you can access: your email address, your admin status, and the full list of all your repositories including private ones. You also see your starred repositories and your organization memberships. This is the "home base" for understanding what your account looks like to the outside world, with the additional context of your private data layered on top.

The self-profile is the natural entry point before editing your profile. You can see exactly what's currently set — if your display name is blank, you'll see your username used as a fallback. If your bio is empty, the bio area is simply absent rather than showing placeholder noise. If your avatar URL is missing or broken, you see a clean default identicon. The timestamps tell you when your account was created and when it was last modified, both in a human-friendly relative format with exact dates available on hover.

From the CLI, running `codeplane user view` without any username argument returns your full authenticated profile. The output is human-readable by default and machine-parseable with `--json`. Unlike viewing another user's public profile, your own view includes your email address and admin flag — private fields that are never shown to anyone else.

The self-profile view is strictly read-only. It does not let you change anything; that's the role of the profile settings page. It answers the question "what does Codeplane currently know about me?" in a single glance.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user can view their own full profile via the API, web, CLI, and TUI.
- [ ] The self-profile displays: avatar, display name, username, bio, email address, admin status, and account creation/update timestamps.
- [ ] The self-profile includes the user's email address (private field not shown on public profiles).
- [ ] The self-profile includes the user's admin status (private field not shown on public profiles).
- [ ] A tab or section shows all of the user's repositories (public AND private), paginated.
- [ ] A tab or section shows the user's starred repositories, paginated.
- [ ] A tab or section shows the user's organization memberships, paginated.
- [ ] Unauthenticated requests to the self-profile endpoint return 401 with a structured error body.
- [ ] The CLI command `codeplane user view` (no argument, authenticated) returns the caller's full profile.
- [ ] The CLI command `codeplane user view` (no argument, unauthenticated) exits with code 1 and a clear error message.
- [ ] All API responses use ISO 8601 timestamps.
- [ ] The self-profile view is strictly read-only; no mutations are possible from this surface.

### Edge Cases

- [ ] If the authenticated user's account has been deactivated between login and profile fetch, the API returns 404 (not 500).
- [ ] If the authenticated user has no repositories, the repos tab/section renders an empty list with `total_count: 0`.
- [ ] If the authenticated user has no starred repositories, the starred tab/section renders an empty list with `total_count: 0`.
- [ ] If the authenticated user has no organization memberships, the orgs tab/section renders an empty list with `total_count: 0`.
- [ ] A user whose `bio` is an empty string displays the bio section as absent or blank — not as `null` or `undefined`.
- [ ] A user whose `avatar_url` is an empty string displays a default/fallback avatar — not a broken image.
- [ ] A user whose `display_name` is empty falls back to showing the username.
- [ ] A user whose `email` is an empty string displays the email section as absent — not as `null` or literal empty string.
- [ ] Pagination with `page=0` or `per_page=0` on sub-resources returns a 400 error.
- [ ] Pagination with `per_page` greater than 100 is silently capped to 100.
- [ ] Pagination with a non-numeric `page` value returns a 400 error.
- [ ] An expired or revoked session token returns 401, not 500.
- [ ] An invalid PAT returns 401, not 500.
- [ ] The self-profile API returns consistent JSON field names (`display_name`, `avatar_url`, `created_at`, `updated_at`, `is_admin`) — never camelCase.
- [ ] Concurrent requests to the self-profile endpoint from the same user are safe and idempotent.

### Boundary Constraints

- [ ] `bio` field: up to 160 characters displayed in UI; longer values are truncated with an ellipsis.
- [ ] `display_name` field: up to 255 characters.
- [ ] `avatar_url` field: must be a valid HTTP or HTTPS URL when non-empty.
- [ ] `email` field: valid email format, up to 254 characters per RFC 5321.
- [ ] Pagination `per_page` / `limit`: minimum 1, maximum 100, default 30.
- [ ] Pagination `page`: minimum 1, default 1.
- [ ] Repo listing returned per page: maximum 100 items.
- [ ] Org listing returned per page: maximum 100 items.

## Design

### Web UI Design

**Route**: `/settings/profile` or reachable via the user avatar dropdown → "Your profile" entry point. The authenticated self-profile is also accessible when navigating to `/:username` where the username matches the currently authenticated user — in this case the view should enhance the standard public profile with the additional private fields and an "Edit profile" link.

**Layout**:

- **Profile Header**: Rendered at the top of the page.
  - Avatar image (120×120px, rounded). Falls back to a generated identicon or initials badge when `avatar_url` is empty.
  - Display name in large font. If empty, show username.
  - Username in lighter text prefixed with `@`.
  - Bio text below the name, rendered as plain text (no markdown). Truncated at 160 characters with ellipsis if longer.
  - Email address shown below the bio, with a mail icon prefix. Visible only to the authenticated user viewing their own profile.
  - Admin badge (pill/tag) shown inline with the display name if `is_admin` is true.
  - "Joined" date showing the relative time since `created_at` (e.g., "Joined 3 months ago"), with full ISO date on hover tooltip.
  - "Last updated" date showing relative time since `updated_at`, with full ISO date on hover tooltip.
  - "Edit profile" button/link that navigates to the profile editing settings page.

- **Tab Bar**: Three tabs below the header.
  - **Repositories** (default active): Lists all repositories owned by this user, including private repos. Private repos should be visually distinguished with a lock icon or "Private" badge.
  - **Starred**: Lists repositories this user has starred.
  - **Organizations**: Lists organizations this user belongs to.

- **Repository List Items**: Each item shows:
  - Repository name as a link to `/:owner/:repo`.
  - Visibility indicator (lock icon for private, globe icon for public).
  - Description (truncated to one line if long).
  - Star count with star icon.
  - Default bookmark name.
  - Last updated relative timestamp.

- **Organization List Items**: Each item shows:
  - Organization name as a link to the org page.
  - Description (truncated to one line).
  - Visibility label.

- **Empty States**:
  - Repositories tab empty: "You don't have any repositories yet." with a "Create repository" call-to-action.
  - Starred tab empty: "You haven't starred any repositories yet."
  - Organizations tab empty: "You're not a member of any organizations yet."

- **Pagination**: Page-based pagination at the bottom of each tab, showing "Page X of Y" with previous/next controls. Default 30 items per page.

- **Responsive behavior**: Profile header stacks vertically on narrow viewports. Tab content remains paginated.

### API Shape

#### Get Authenticated User Profile

```
GET /api/user
```

**Authentication**: Required (session cookie or PAT).

**Success Response** (`200 OK`):
```json
{
  "id": 42,
  "username": "janedoe",
  "display_name": "Jane Doe",
  "email": "jane@example.com",
  "bio": "Building things with jj.",
  "avatar_url": "https://example.com/avatars/janedoe.png",
  "is_admin": false,
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2026-03-20T14:22:00.000Z"
}
```

**Error Responses**:
| Status | Condition                           | Body                                             |
|--------|-------------------------------------|--------------------------------------------------|
| 401    | No valid session or token           | `{ "message": "authentication required" }`       |
| 404    | Authenticated user account inactive | `{ "message": "user not found" }`                |
| 500    | Internal server error               | `{ "message": "internal error" }`                |

#### List Authenticated User's Repositories

```
GET /api/user/repos
```

**Authentication**: Required.

**Query Parameters**:
| Parameter  | Type   | Default | Description                          |
|------------|--------|---------|--------------------------------------|
| `page`     | number | 1       | Page number (legacy pagination)      |
| `per_page` | number | 30      | Items per page (max 100)             |
| `cursor`   | string | ""      | Offset cursor (cursor pagination)    |
| `limit`    | number | 30      | Items per page (max 100)             |

**Success Response** (`200 OK`): Array of `RepoSummary` objects (includes both public AND private repos).

**Response Headers**: `X-Total-Count`, `Link` (pagination).

**Error Responses**: 401 for unauthenticated, 400 for invalid pagination.

#### List Authenticated User's Starred Repositories

```
GET /api/user/starred
```

Same shape as `/api/user/repos` above, but returns repositories the user has starred.

#### List Authenticated User's Organizations

```
GET /api/user/orgs
```

**Authentication**: Required.

**Query Parameters**: Same pagination parameters as repos.

**Success Response** (`200 OK`): Array of `OrgSummary` objects.

**Response Headers**: `X-Total-Count`, `Link` (pagination).

### SDK Shape

The `UserService` class in `@codeplane/sdk` exposes:

- `getAuthenticatedUser(userID: number): Promise<Result<UserProfile, APIError>>`
- `listAuthenticatedUserRepos(userID: number, page: number, perPage: number): Promise<Result<RepoListResult, APIError>>`
- `listAuthenticatedUserStarredRepos(userID: number, page: number, perPage: number): Promise<Result<RepoListResult, APIError>>`
- `listAuthenticatedUserOrgs(userID: number, page: number, perPage: number): Promise<Result<OrgListResult, APIError>>`

The `UserProfile` type:
```typescript
interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  email: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}
```

The `RepoSummary` type:
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
```

The `OrgSummary` type:
```typescript
interface OrgSummary {
  id: number;
  name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
}
```

### CLI Command

```
codeplane user view
```

- Without argument (authenticated): Calls `GET /api/user` and displays the caller's full profile including email and admin status.
- Without argument (unauthenticated): Prints "Error: authentication required. Run `codeplane auth login` first." and exits with code 1.

**Flags**: `--json` for raw JSON output.

**Human-readable output**:
```
@janedoe (Jane Doe)
jane@example.com
Building things with jj.

Admin: No
Joined: June 15, 2025
Updated: March 20, 2026
```

**JSON output** (`--json`):
```json
{
  "id": 42,
  "username": "janedoe",
  "display_name": "Jane Doe",
  "email": "jane@example.com",
  "bio": "Building things with jj.",
  "avatar_url": "https://example.com/avatars/janedoe.png",
  "is_admin": false,
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2026-03-20T14:22:00.000Z"
}
```

### TUI UI

The TUI should include a self-profile view accessible from the dashboard or a "Profile" menu item. The screen shows:

- Username and display name prominently at the top.
- Email address.
- Bio (if set).
- Admin status badge.
- Joined date.
- Tabbed sections for: Repositories (with private visibility indicator), Starred, Organizations.
- Pagination controls within each tab using arrow keys.
- Keyboard shortcut `e` to jump to edit profile flow.

### Documentation

- **API Reference — Authenticated User**: Document `GET /api/user`, `GET /api/user/repos`, `GET /api/user/starred`, and `GET /api/user/orgs` with full schemas, pagination, and error responses. Clearly distinguish these from the public `/api/users/:username` endpoints.
- **CLI Reference — `user view`**: Document usage examples showing authenticated self-profile viewing with both human-readable and `--json` output. Include the distinction between `codeplane user view` (self) and `codeplane user view <username>` (public).
- **Web Guide — Your Profile**: Brief guide explaining what data is visible on your self-profile vs. what others see, how to navigate to the edit page, and the meaning of the private fields (email, admin status).
- **Privacy Guide**: Explain which fields are private (email, admin status, private repos) and confirm they are never exposed on public profile views.

## Permissions & Security

### Authorization Roles

| Action                                      | Anonymous | Authenticated | Admin |
|---------------------------------------------|-----------|---------------|-------|
| View own full profile (`GET /api/user`)     | ❌         | ✅             | ✅     |
| List own repos (`GET /api/user/repos`)      | ❌         | ✅             | ✅     |
| List own starred (`GET /api/user/starred`)  | ❌         | ✅             | ✅     |
| List own orgs (`GET /api/user/orgs`)        | ❌         | ✅             | ✅     |

All self-profile endpoints require authentication. There is no elevated role requirement — any authenticated user can view their own profile.

### Rate Limiting

- **Authenticated callers**: 300 requests per minute per user to `/api/user` and `/api/user/*` endpoints.
- **Pagination abuse**: The `per_page`/`limit` cap at 100 prevents large payload extraction. No additional rate limit is needed.
- Rate limit responses must use `429 Too Many Requests` with `Retry-After` header.
- There is no anonymous access to self-profile endpoints, so no anonymous rate limit tier is needed.

### Data Privacy & PII

- The self-profile endpoint returns `email` and `is_admin` because the requesting user is the owner of the data.
- These private fields MUST NOT be included in any response where the viewer is not the authenticated owner (i.e., the public profile endpoint `/api/users/:username` must never return them).
- The `email` field is PII. It must not be logged in plain text in server logs. If the email appears in log context, it must be masked (e.g., `j***@example.com`).
- Session tokens and PATs used to authenticate self-profile requests must never be logged.
- The `id` field is a sequential integer. While not sensitive, it reveals approximate registration order. This is acceptable for Community Edition.

## Telemetry & Product Analytics

### Key Business Events

| Event Name                     | Trigger                                        | Properties                                                                                    |
|--------------------------------|------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `SelfProfileViewed`            | `GET /api/user` returns 200                    | `user_id`, `client` (web/cli/tui/api), `has_bio` (bool), `has_avatar` (bool), `is_admin`     |
| `SelfReposListed`              | `GET /api/user/repos` returns 200              | `user_id`, `page`, `per_page`, `total_count`, `private_count`, `client`                      |
| `SelfStarredListed`            | `GET /api/user/starred` returns 200            | `user_id`, `page`, `per_page`, `total_count`, `client`                                       |
| `SelfOrgsListed`               | `GET /api/user/orgs` returns 200               | `user_id`, `page`, `per_page`, `total_count`, `client`                                       |
| `SelfProfileAuthFailed`        | `GET /api/user` returns 401                    | `client`, `auth_method` (cookie/pat/none), `client_ip`                                       |

### Funnel Metrics & Success Indicators

- **Self-profile view → Edit profile rate**: Percentage of self-profile views that lead to a profile edit within the same session. Target: >10%. This indicates users are using the self-profile as a review step before editing.
- **Self-profile view frequency**: Average views per active user per week. A healthy range is 1–3 views/week during active development periods.
- **Auth failure rate on self-profile**: Percentage of self-profile requests that return 401. Should be <2% among users who have recently authenticated. Spikes indicate session management issues.
- **Profile completeness**: Percentage of users who have both `bio` and `avatar_url` set at the time of viewing their self-profile. Upward trend indicates healthy profile adoption.
- **Client distribution**: Breakdown of self-profile views by client (web, CLI, TUI, API). Indicates which surfaces are most used for identity verification.
- **Pagination depth on repos/starred/orgs**: Average page depth reached. Most users should not need to paginate past page 1 for orgs.

## Observability

### Logging Requirements

| Log Event                        | Level | Structured Context                                                              |
|----------------------------------|-------|---------------------------------------------------------------------------------|
| Self-profile lookup success      | INFO  | `user_id`, `request_id`, `response_time_ms`, `client_ip`                       |
| Self-profile auth failure        | WARN  | `request_id`, `client_ip`, `auth_method` (cookie/pat/none)                     |
| Self-repos list success          | INFO  | `user_id`, `page`, `per_page`, `total_count`, `request_id`, `response_time_ms` |
| Self-starred list success        | INFO  | `user_id`, `page`, `per_page`, `total_count`, `request_id`, `response_time_ms` |
| Self-orgs list success           | INFO  | `user_id`, `page`, `per_page`, `total_count`, `request_id`, `response_time_ms` |
| Pagination validation failure    | WARN  | `user_id`, `request_id`, `validation_error`, `raw_params`                      |
| Rate limit triggered             | WARN  | `user_id`, `endpoint`, `request_id`, `client_ip`                               |
| Unexpected service error         | ERROR | `user_id`, `request_id`, `error_message`, `stack_trace`                        |
| Deactivated user self-profile    | WARN  | `user_id`, `request_id` (user was active at login but inactive at profile fetch)|

### Prometheus Metrics

| Metric Name                                         | Type      | Labels                                     | Description                                                 |
|-----------------------------------------------------|-----------|--------------------------------------------|-------------------------------------------------------------|
| `codeplane_self_profile_requests_total`                 | Counter   | `status` (200/401/404/429/500), `client`   | Total self-profile lookup requests                          |
| `codeplane_self_profile_request_duration_seconds`       | Histogram | `status`, `endpoint`                       | Latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5)   |
| `codeplane_self_repos_list_requests_total`              | Counter   | `status`, `client`                         | Total authenticated repo list requests                      |
| `codeplane_self_repos_list_request_duration_seconds`    | Histogram | `status`                                   | Latency of authenticated repo list requests                 |
| `codeplane_self_starred_list_requests_total`            | Counter   | `status`, `client`                         | Total authenticated starred list requests                   |
| `codeplane_self_orgs_list_requests_total`               | Counter   | `status`, `client`                         | Total authenticated orgs list requests                      |
| `codeplane_self_profile_rate_limited_total`             | Counter   | —                                          | Total rate-limited self-profile requests                    |
| `codeplane_self_profile_auth_failures_total`            | Counter   | `auth_method` (cookie/pat/none)            | Total 401 responses on self-profile endpoints               |

### Alerts

#### Alert: Elevated Self-Profile Auth Failure Rate
- **Condition**: `rate(codeplane_self_profile_auth_failures_total[5m]) > 5` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if there has been a recent deployment that may have broken session or PAT validation middleware.
  2. Check if session store (database/Redis) is healthy and accepting reads.
  3. Look for a spike in expired sessions — if the session TTL was recently shortened, legitimate users may be hitting 401s.
  4. Check if a specific `auth_method` is disproportionately affected (e.g., all PAT failures vs. all cookie failures).
  5. If PAT-specific, check if the token hashing or lookup query has regressed.
  6. If cookie-specific, verify the cookie domain and secure flag configuration.

#### Alert: Self-Profile Endpoint Latency Spike
- **Condition**: `histogram_quantile(0.95, rate(codeplane_self_profile_request_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool health and active connection count.
  2. Run `EXPLAIN ANALYZE` on the `getUserByID` query to check for missing indexes or plan regression.
  3. Check if a concurrent migration, vacuum, or long-running transaction is locking the users table.
  4. Check overall server CPU and memory utilization.
  5. If query plan has regressed, run `ANALYZE users` to refresh query planner statistics.
  6. Check if the service registry initialization is healthy — a lazy-init failure could cause repeated retries.

#### Alert: Self-Profile 500 Error Spike
- **Condition**: `rate(codeplane_self_profile_requests_total{status="500"}[5m]) > 0.5` sustained for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for ERROR-level entries associated with the `/api/user` path.
  2. Verify database connectivity by running a health check query.
  3. Check if the user service was correctly initialized in the service registry on startup.
  4. If errors contain specific user IDs, check for data corruption in those user rows (e.g., NULL in non-nullable columns).
  5. Check if the error correlates with a recent deployment and roll back if so.
  6. If the error is intermittent, check for connection pool exhaustion or database failover events.

#### Alert: Rate Limiting Spike on Self-Profile
- **Condition**: `rate(codeplane_self_profile_rate_limited_total[5m]) > 10` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify the top user IDs triggering rate limits from structured logs.
  2. Determine if the traffic is from a legitimate integration (e.g., a CI/CD pipeline polling user context) or from a misbehaving client.
  3. For legitimate integrations, advise the caller to implement caching of the profile response (it changes infrequently).
  4. For misbehaving clients, check if a desktop/editor integration has an overly aggressive polling interval.
  5. Review rate limit thresholds — 300/min per user should be sufficient for all normal use cases.

### Error Cases and Failure Modes

| Failure Mode                            | Expected Behavior                                              | Detection                                           |
|-----------------------------------------|----------------------------------------------------------------|-----------------------------------------------------|
| Database unavailable                    | Return 500 with `{ "message": "internal error" }`. Log ERROR. | `status=500` counter spike                          |
| Session store unavailable               | Return 401 (cannot verify auth). Log ERROR.                    | `auth_failures_total` spike with ERROR logs         |
| User deactivated after login            | Return 404 with `{ "message": "user not found" }`             | WARN log for deactivated user self-profile access   |
| Malformed session cookie                | Return 401.                                                    | Normal 401 path                                     |
| Expired PAT                             | Return 401.                                                    | Normal 401 path                                     |
| Concurrent user deletion during read    | Return 404.                                                    | Normal 404 path                                     |
| NULL timestamps in user row             | Map gracefully to empty string or epoch. No crash.             | Defensive code; no specific alert needed            |
| Connection pool exhaustion              | Return 500 after timeout. Log ERROR.                           | Latency histogram + 500 counter                     |

## Verification

### API Integration Tests

| # | Test Description | Method | Expected |
|---|-----------------|--------|----------|
| 1 | Fetch authenticated user's full profile | `GET /api/user` (with valid session) | 200, body matches `UserProfile` shape |
| 2 | Response includes `email` field | `GET /api/user` | 200, `email` key present and is a string |
| 3 | Response includes `is_admin` field | `GET /api/user` | 200, `is_admin` key present and is a boolean |
| 4 | Response includes `username` matching authenticated user | `GET /api/user` | 200, `username` matches expected value |
| 5 | `created_at` is valid ISO 8601 | `GET /api/user` | 200, parses as Date |
| 6 | `updated_at` is valid ISO 8601 | `GET /api/user` | 200, parses as Date |
| 7 | `id` is a positive integer | `GET /api/user` | 200, `id > 0` |
| 8 | `avatar_url` is a string (possibly empty) | `GET /api/user` | 200, `typeof avatar_url === "string"` |
| 9 | `bio` is a string (possibly empty) | `GET /api/user` | 200, `typeof bio === "string"` |
| 10 | `display_name` is a string (possibly empty) | `GET /api/user` | 200, `typeof display_name === "string"` |
| 11 | Unauthenticated request returns 401 | `GET /api/user` (no auth) | 401, `{ "message": "authentication required" }` |
| 12 | Invalid PAT returns 401 | `GET /api/user` (with `Authorization: token invalid_xxx`) | 401 |
| 13 | Expired session cookie returns 401 | `GET /api/user` (with expired cookie) | 401 |
| 14 | Deactivated user returns 404 | `GET /api/user` (auth for deactivated user) | 404, `{ "message": "user not found" }` |
| 15 | Response uses snake_case field names | `GET /api/user` | 200, verify `display_name` not `displayName`, `avatar_url` not `avatarUrl`, `is_admin` not `isAdmin`, `created_at` not `createdAt` |
| 16 | List authenticated user repos (has repos) | `GET /api/user/repos` | 200, array, `X-Total-Count` header present |
| 17 | Repo list includes private repos | `GET /api/user/repos` (user has private repo) | 200, array contains item with `is_public: false` |
| 18 | Repo list includes public repos | `GET /api/user/repos` (user has public repo) | 200, array contains item with `is_public: true` |
| 19 | List repos for user with no repos | `GET /api/user/repos` (new user) | 200, empty array, `X-Total-Count: 0` |
| 20 | List repos with `page=1&per_page=2` | `GET /api/user/repos?page=1&per_page=2` | 200, length ≤ 2, `Link` header has `rel="next"` if more |
| 21 | `per_page=101` is capped to 100 | `GET /api/user/repos?per_page=101` | 200, at most 100 items |
| 22 | Maximum valid `per_page` (100) works | `GET /api/user/repos?per_page=100` | 200 |
| 23 | `page=0` returns 400 | `GET /api/user/repos?page=0` | 400 |
| 24 | `page=-1` returns 400 | `GET /api/user/repos?page=-1` | 400 |
| 25 | `per_page=0` returns 400 | `GET /api/user/repos?per_page=0` | 400 |
| 26 | `per_page=abc` returns 400 | `GET /api/user/repos?per_page=abc` | 400 |
| 27 | Cursor-based pagination works | `GET /api/user/repos?cursor=0&limit=5` | 200, length ≤ 5 |
| 28 | `limit` exceeding max is capped | `GET /api/user/repos?limit=200` | 200, at most 100 items |
| 29 | Repo items include all required fields | `GET /api/user/repos` | Each item has `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at` |
| 30 | `Link` header contains `rel="first"` | `GET /api/user/repos?page=1&per_page=5` | Header present |
| 31 | Unauthenticated repos request returns 401 | `GET /api/user/repos` (no auth) | 401 |
| 32 | List starred repos | `GET /api/user/starred` | 200, array |
| 33 | List starred for user with no stars | `GET /api/user/starred` (user with no stars) | 200, empty array, `X-Total-Count: 0` |
| 34 | Starred repos pagination | `GET /api/user/starred?page=1&per_page=1` | 200, length ≤ 1 |
| 35 | Unauthenticated starred request returns 401 | `GET /api/user/starred` (no auth) | 401 |
| 36 | List orgs | `GET /api/user/orgs` | 200, array |
| 37 | List orgs for user with no org memberships | `GET /api/user/orgs` (user with no orgs) | 200, empty array, `X-Total-Count: 0` |
| 38 | Orgs pagination | `GET /api/user/orgs?page=1&per_page=2` | 200, length ≤ 2 |
| 39 | Unauthenticated orgs request returns 401 | `GET /api/user/orgs` (no auth) | 401 |
| 40 | Org items include all required fields | `GET /api/user/orgs` | Each item has `id`, `name`, `description`, `visibility`, `website`, `location` |
| 41 | Profile request with PAT authentication succeeds | `GET /api/user` (with valid PAT in `Authorization` header) | 200 |
| 42 | Profile request with session cookie succeeds | `GET /api/user` (with valid session cookie) | 200 |
| 43 | Concurrent identical requests return consistent data | 10x `GET /api/user` in parallel | All return 200 with identical body |

### CLI E2E Tests

| # | Test Description | Command | Expected |
|---|-----------------|---------|----------|
| 44 | View authenticated user's own profile (JSON) | `codeplane user view --json` | Exit 0, JSON with `username`, `email`, `is_admin` fields |
| 45 | View authenticated user's own profile (human-readable) | `codeplane user view` | Exit 0, stdout contains `@<username>` |
| 46 | Own profile JSON includes email | `codeplane user view --json` | Exit 0, JSON contains `email` field with valid email |
| 47 | Own profile JSON includes is_admin | `codeplane user view --json` | Exit 0, JSON contains `is_admin` field (boolean) |
| 48 | Unauthenticated self-profile view fails | `codeplane user view` (no auth configured) | Exit 1, stderr contains "authentication required" |
| 49 | Own profile human output shows email | `codeplane user view` | Exit 0, stdout contains email address |
| 50 | Own profile human output shows join date | `codeplane user view` | Exit 0, stdout contains "Joined" |

### Web UI E2E Tests (Playwright)

| # | Test Description | Expected |
|---|-----------------|----------|
| 51 | Authenticated user can navigate to self-profile | Self-profile page loads with display name visible |
| 52 | Self-profile shows avatar or fallback | Avatar element or identicon visible |
| 53 | Self-profile shows email address | Email text visible on page |
| 54 | Self-profile shows admin badge if admin | Admin badge element visible for admin users |
| 55 | Self-profile does NOT show admin badge for non-admin | Admin badge element absent for non-admin users |
| 56 | Self-profile shows "Joined" date | Page contains "Joined" text |
| 57 | Repositories tab active by default | Repos tab has active styling |
| 58 | Repositories tab shows private repos with lock icon | At least one repo item with private indicator visible |
| 59 | Clicking Starred tab shows starred repos | Tab switches, starred repos load |
| 60 | Clicking Organizations tab shows orgs | Tab switches, org list loads |
| 61 | Empty repos state shows correct message | "You don't have any repositories yet." visible for user with no repos |
| 62 | Empty starred state shows correct message | "You haven't starred any repositories yet." visible |
| 63 | Empty orgs state shows correct message | "You're not a member of any organizations yet." visible |
| 64 | Pagination controls appear when > 30 items | Pagination nav visible |
| 65 | "Edit profile" link navigates to settings | Clicking "Edit profile" navigates to profile edit page |
| 66 | Self-profile requires authentication | Navigating to self-profile while logged out redirects to login |
| 67 | Bio shows empty gracefully (no "undefined") | Bio area empty, no literal "undefined" or "null" text |
| 68 | Empty display_name falls back to username | Username displayed when display_name is empty |
| 69 | Repo item links navigate to repo page | Clicking repo name navigates to `/:owner/:repo` |

### Load & Boundary Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 70 | Self-profile responds within 500ms at p95 | Latency check passes |
| 71 | 100 concurrent authenticated requests succeed | All return 200 |
| 72 | User with 100+ repos paginates correctly | Page 1 returns 30 items (default), page 2 returns next batch |
| 73 | User with 0 repos returns empty list in < 100ms | 200 with empty array |
| 74 | `per_page=100` on repos for user with 100+ repos returns exactly 100 | Length === 100 |
| 75 | `per_page=1` on repos returns exactly 1 | Length === 1 |
| 76 | Rate limit triggers at 301st request in 1 minute | 429 response with `Retry-After` header |
| 77 | Bio at maximum display length (160 chars) renders without truncation | Full bio visible in UI |
| 78 | Bio at 161 chars is truncated with ellipsis in UI | Truncation visible |
| 79 | Display name at 255 chars renders correctly | Full name visible, no overflow/crash |
| 80 | Display name at 256 chars — verify API behavior | Either accepted and stored, or rejected with 422 |

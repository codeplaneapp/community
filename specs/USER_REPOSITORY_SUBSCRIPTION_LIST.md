# USER_REPOSITORY_SUBSCRIPTION_LIST

Specification for USER_REPOSITORY_SUBSCRIPTION_LIST.

## High-Level User POV

When you want to see which repositories you're subscribed to — that is, which repositories you've chosen to watch for notifications — Codeplane gives you a dedicated, browsable list from every client surface.

On the web, your repository subscriptions appear in your user settings under a "Subscriptions" or "Watching" section. Each entry in the list shows the repository name (as a link), its owner, a short description, your current watch mode, and when you last changed your subscription. The watch mode tells you at a glance how notifications are filtered for that repository: "watching" means you receive all notifications, "participating" means you only receive notifications for conversations you're directly involved in, and "ignored" means you've explicitly muted that repository. If you haven't subscribed to anything yet, you see a friendly empty-state message explaining what subscriptions are and how to start watching repositories.

Because subscriptions are inherently personal — they represent your own notification preferences — there is no public-facing subscription list. Only you can see which repositories you're watching. Other users cannot see your subscriptions, and you cannot browse someone else's subscriptions. This is by design: subscriptions are private notification configuration, not a social signal like stars.

From the CLI, you can list your subscriptions with `codeplane repo list --watched`, which shows every repository you're currently subscribed to along with the watch mode. You can filter by mode (`--mode watching`) to see only repositories where you receive all notifications. Both human-readable and `--json` output are supported, along with pagination flags for large subscription lists.

From the TUI, your subscriptions appear on a dedicated "Watching" screen accessible from the main navigation. The list uses the same repository summary format as other repository lists, with an additional indicator showing your watch mode for each entry.

Your subscription list is the central place to audit and manage your notification surface area. It answers the question: "What am I paying attention to?" It's especially important for active contributors who watch many repositories and need to periodically prune or adjust their notification diet.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can list all repositories they are currently subscribed to (watching) via `GET /api/user/subscriptions`.
- [ ] The response includes the watch mode (`watching`, `participating`, or `ignored`) for each subscription entry.
- [ ] Results are ordered by subscription update time descending (most recently changed subscription first).
- [ ] The response is paginated with `X-Total-Count` and `Link` headers.
- [ ] Each item in the response includes: `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`, and `subscription` object containing `mode`, `subscribed_at`, `updated_at`.
- [ ] An optional `mode` query parameter filters results to only subscriptions with the specified watch mode.
- [ ] Unauthenticated requests to `GET /api/user/subscriptions` return 401.
- [ ] The CLI command `codeplane repo list --watched` lists the authenticated user's subscribed repos.
- [ ] The CLI command supports `--mode`, `--json`, `--limit`, and `--page` flags.
- [ ] The web UI "Subscriptions" / "Watching" section under user settings displays subscribed repos with watch mode badges and pagination controls.
- [ ] The TUI "Watching" screen displays subscribed repos with watch mode indicators.
- [ ] All timestamps in responses are ISO 8601 formatted.
- [ ] Private repositories the user is subscribed to appear in their own subscription list (only visible to themselves).
- [ ] Deleted repositories do not appear in the subscription list.

### Edge Cases

- [ ] A user with zero subscriptions returns 200 with an empty array and `X-Total-Count: 0`.
- [ ] If a subscribed repository is subsequently deleted, it does not appear in the list (the join naturally excludes it).
- [ ] If a subscribed repository transitions from public to private, it still appears in the user's own subscription list (subscriptions are personal, not public).
- [ ] If a user watches the same repository twice via concurrent requests (race condition), the list does not contain duplicates (the `ON CONFLICT` upsert handles this).
- [ ] Filtering by `mode=watching` excludes `participating` and `ignored` entries.
- [ ] Filtering by `mode=participating` excludes `watching` and `ignored` entries.
- [ ] Filtering by `mode=ignored` returns only explicitly ignored repositories.
- [ ] Filtering by an invalid mode value (e.g., `mode=invalid`) returns 400 with a validation error message.
- [ ] Pagination with `page=0` returns 400.
- [ ] Pagination with `per_page=0` returns 400.
- [ ] Pagination with `per_page > 100` is silently capped to 100.
- [ ] Pagination with non-numeric values returns 400.
- [ ] Requesting a page beyond the last page returns 200 with an empty array.
- [ ] Repository descriptions containing special characters (unicode, emoji, HTML entities) render correctly.
- [ ] Repository descriptions that are `null` or empty string are returned as empty string.
- [ ] If the user's session is invalidated mid-request, the endpoint returns 401 rather than a 500.

### Boundary Constraints

- [ ] Pagination `per_page` / `limit`: minimum 1, maximum 100, default 30.
- [ ] Pagination `page`: minimum 1, default 1.
- [ ] Maximum items returned per page: 100.
- [ ] Both page/per_page and cursor/limit pagination styles are supported (matching existing API convention).
- [ ] The `mode` filter parameter must be one of: `watching`, `participating`, `ignored`. Any other value returns 400.
- [ ] The maximum number of subscriptions per user is unbounded (no artificial cap), but pagination ensures response sizes remain manageable.

## Design

### Web UI Design

**Route**: `/settings/subscriptions` (under authenticated user settings)

**Layout**: The subscriptions page lives within the user settings shell. It displays a list of repositories the user is currently watching, grouped or filterable by watch mode.

**Filter bar**: A filter bar at the top of the list provides:
- A mode selector dropdown with options: "All", "Watching", "Participating", "Ignored". Defaults to "All".
- The active filter state is reflected in the URL query string (e.g., `?mode=watching`) for bookmark and share support.

**Repository list item layout**: Each item renders:
- Repository full name (`owner/name`) as a clickable link to `/:owner/:repo`.
- Description text, truncated to a single line with ellipsis if longer than the available width.
- A watch mode badge: green "Watching" badge, blue "Participating" badge, or gray "Ignored" badge.
- Star icon with star count.
- Relative "last updated" timestamp for the subscription itself (e.g., "Subscribed 3 days ago"), with full ISO timestamp on hover tooltip.
- An inline "Unwatch" or "Change mode" action button that opens a dropdown to switch between modes or unsubscribe entirely.

**Empty state**: When the user has no subscriptions, display centered text: "You aren't watching any repositories yet." with a subtext: "Watch a repository from its main page to receive notifications about activity."

**Empty state for filtered view**: When a mode filter is applied and no results match, display: "No repositories match the selected filter." with a link to clear the filter.

**Pagination**: Page-based pagination controls at the bottom of the list showing "Page X of Y" with Previous/Next buttons. Default 30 items per page.

**Loading state**: A skeleton loader should appear while the subscriptions are being fetched, matching the repository list item shape.

**Error state**: If the API returns an error, display an inline error message with a "Retry" button.

**Inline mutation**: When a user changes their watch mode or unwatches directly from the list, the list item should update optimistically without a full page reload. If the mutation fails, revert the optimistic update and display a toast error.

### API Shape

#### List Authenticated User's Repository Subscriptions

```
GET /api/user/subscriptions
```

**Authentication**: Required. Uses session cookie or PAT.

**Query Parameters**:
| Parameter  | Type   | Default | Description                                     |
|------------|--------|---------|-------------------------------------------------|
| `page`     | number | 1       | Page number (page pagination)                   |
| `per_page` | number | 30      | Items per page (max 100)                        |
| `cursor`   | string | ""      | Offset cursor (cursor pagination)               |
| `limit`    | number | 30      | Items per page (max 100)                        |
| `mode`     | string | (none)  | Filter by watch mode: `watching`, `participating`, `ignored` |

**Success Response** (`200 OK`):

Response Headers: `X-Total-Count`, `Link` (with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable).

Response Body: Array of `WatchedRepoSummary` objects:
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
    "updated_at": "2026-03-20T14:22:00.000Z",
    "subscription": {
      "mode": "watching",
      "created_at": "2026-01-10T08:00:00.000Z",
      "updated_at": "2026-03-18T12:00:00.000Z"
    }
  }
]
```

**Error Responses**:
| Status | Condition                           | Body                                              |
|--------|-------------------------------------|----------------------------------------------------|
| 401    | Not authenticated                   | `{ "message": "authentication required" }`         |
| 400    | Invalid pagination parameters       | `{ "message": "<validation details>" }`            |
| 400    | Invalid mode filter value           | `{ "message": "invalid mode: must be one of watching, participating, ignored" }` |

### SDK Shape

The `UserService` class in `@codeplane/sdk` exposes:

- `listAuthenticatedUserSubscriptions(userID: number, page: number, perPage: number, mode?: string): Promise<Result<WatchedRepoListResult, APIError>>` — all subscribed repos for the authenticated user, optionally filtered by watch mode.

The `WatchedRepoListResult` type:
```typescript
interface WatchedRepoListResult {
  items: WatchedRepoSummary[];
  total_count: number;
  page: number;
  per_page: number;
}

interface WatchedRepoSummary {
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
  subscription: {
    mode: "watching" | "participating" | "ignored";
    created_at: string;
    updated_at: string;
  };
}
```

### CLI Command

#### List own subscribed repos

```
codeplane repo list --watched [--mode MODE] [--limit N] [--page N] [--json]
```

- Requires authentication.
- Calls `GET /api/user/subscriptions`.
- `--mode`: optional filter, one of `watching`, `participating`, `ignored`.
- Human-readable output: renders the same `formatRepoList` tabular format used by `codeplane repo list`, with an additional `MODE` column showing the watch mode.
- `--json`: outputs the raw JSON array.
- If the user has no subscriptions, outputs "No watched repositories found." to stdout and exits with code 0.

#### Example output (human-readable)

```
NAME                DESCRIPTION          MODE           STARS  UPDATED
janedoe/my-project  A jj-native project  watching       42     3 days ago
acme/backend        Backend services     participating  18     1 week ago
```

### TUI UI

The TUI includes a "Watching" screen accessible from the main navigation menu. Navigating to it loads the user's subscriptions via the API. The list is rendered with the standard repository summary format, plus a colored mode indicator next to each repository name:
- Green `[W]` for watching
- Blue `[P]` for participating
- Gray `[I]` for ignored

Pagination is handled with `j`/`k` scrolling and explicit page navigation keybindings. A filter toggle cycles through All / Watching / Participating / Ignored modes with the `f` key.

### Documentation

- **API Reference — Users**: Document `GET /api/user/subscriptions` with full request/response schema, query parameters (including `mode` filter), pagination headers, and error codes.
- **CLI Reference — `repo list --watched`**: Document usage with examples showing human-readable and JSON output, mode filtering, and empty-list behavior.
- **Web Guide — User Settings — Subscriptions**: Document the subscriptions management page, explain watch modes, and describe how to audit and manage notification scope.
- **Concepts Guide — Watching vs Starring**: Explain the distinction between watching (notification subscription) and starring (bookmarking / social signal), and when to use each.

## Permissions & Security

### Authorization Roles

| Action                                           | Anonymous | Authenticated | Admin |
|--------------------------------------------------|-----------|---------------|-------|
| List own subscriptions (`/api/user/subscriptions`) | ❌         | ✅             | ✅     |

- This is a strictly personal endpoint. No user can view another user's subscription list.
- No elevated role (admin, org owner, etc.) is required — the endpoint returns data only for the calling user.
- Admin users see their own subscriptions like any other user; there is no admin override to view another user's subscriptions.
- The existence of private repositories in the subscription list is not a privacy risk because the list is only visible to the owning user.

### Rate Limiting

- **Authenticated callers**: 300 requests per minute per user to `/api/user/subscriptions`.
- Rate limit responses use `429 Too Many Requests` with `Retry-After` header.
- The `per_page` / `limit` cap at 100 prevents large payload extraction per request.
- No anonymous access is permitted, so no anonymous rate limiting is needed for this endpoint.

### Data Privacy & PII

- The subscription list response contains only repository summary fields plus the watch mode and timestamps. No other-user PII (email, admin status, etc.) is included.
- The `owner` field on each repository is a public username, not PII.
- Subscription data itself (which repos a user watches, at what mode) is treated as private user configuration. It is never exposed via any public API or profile view.
- If a user is deactivated, their subscription data is retained but inaccessible (the authentication layer prevents access).

## Telemetry & Product Analytics

### Key Business Events

| Event Name                            | Trigger                                              | Properties                                                                                                  |
|---------------------------------------|------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `UserSubscriptionsListed`             | `GET /api/user/subscriptions` returns 200            | `user_id`, `page`, `per_page`, `mode_filter` (nullable), `total_count`, `client` (web/cli/tui/api)          |
| `UserSubscriptionsFilterApplied`      | `GET /api/user/subscriptions?mode=X` returns 200     | `user_id`, `mode`, `result_count`, `client`                                                                  |
| `SubscriptionListRepoClicked`         | User clicks a repo link from the subscription list (web) | `user_id`, `clicked_repo_full_name`, `watch_mode`, `position_in_list`, `page`                               |
| `SubscriptionModeChangedFromList`     | User changes watch mode inline from the subscription list (web) | `user_id`, `repo_full_name`, `old_mode`, `new_mode`                                                        |
| `SubscriptionRemovedFromList`         | User unwatches a repo inline from the subscription list (web) | `user_id`, `repo_full_name`, `previous_mode`                                                                |

### Funnel Metrics & Success Indicators

- **Subscription list visit rate**: Percentage of active users who visit the subscription list at least once per month. Target: >15% of users with ≥1 active subscription.
- **Subscription list → Repository click-through rate**: Percentage of subscription list views where the user clicks through to a repository. Target: >20%.
- **Inline mode change rate**: Percentage of subscription list views where the user modifies a watch mode directly from the list. A low rate is acceptable (indicates subscriptions are already well-configured); a high rate indicates the list is a useful management tool.
- **Filter usage rate**: Percentage of subscription list requests that include a `mode` filter. Indicates whether users find mode-specific views valuable.
- **CLI watched list adoption**: Percentage of CLI-active users who use `codeplane repo list --watched` at least once per month.
- **Average subscriptions per user**: Mean and median subscription count across active users. Useful for capacity planning and understanding user engagement depth.
- **Ignored mode usage**: Percentage of total subscriptions that are in "ignored" mode. A high percentage may indicate notification fatigue.

## Observability

### Logging Requirements

| Log Event                                    | Level | Structured Context                                                                                       |
|----------------------------------------------|-------|----------------------------------------------------------------------------------------------------------|
| Subscription list success                    | INFO  | `user_id`, `page`, `per_page`, `mode_filter`, `total_count`, `request_id`, `response_time_ms`            |
| Subscription list 400 (bad pagination)       | WARN  | `user_id`, `request_id`, `validation_error`                                                               |
| Subscription list 400 (invalid mode filter)  | WARN  | `user_id`, `request_id`, `invalid_mode_value`                                                             |
| Subscription list 401 (unauthenticated)      | WARN  | `request_id`, `client_ip`                                                                                 |
| Rate limit triggered                         | WARN  | `user_id`, `endpoint`, `request_id`, `client_ip`                                                          |
| Unexpected service error                     | ERROR | `user_id`, `request_id`, `error_message`, `stack_trace`                                                   |
| Slow query (>500ms)                          | WARN  | `user_id`, `page`, `per_page`, `mode_filter`, `total_count`, `request_id`, `response_time_ms`, `query_type` |

### Prometheus Metrics

| Metric Name                                                   | Type      | Labels                                      | Description                                           |
|---------------------------------------------------------------|-----------|---------------------------------------------|-------------------------------------------------------|
| `codeplane_user_subscriptions_list_requests_total`                | Counter   | `status` (200/400/401/429/500), `client`    | Total subscription list requests                      |
| `codeplane_user_subscriptions_list_request_duration_seconds`      | Histogram | `status`                                    | Latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_user_subscriptions_list_result_count`                  | Histogram | `mode_filter` (all/watching/participating/ignored) | Number of items returned per request (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_user_subscriptions_list_rate_limited_total`            | Counter   | (none)                                      | Total rate-limited subscription list requests         |
| `codeplane_user_subscriptions_total_per_user`                     | Histogram | (none)                                      | Total subscriptions per user (sampled, buckets: 0, 1, 5, 10, 25, 50, 100, 500, 1000) |

### Alerts

#### Alert: Elevated Subscription List Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_user_subscriptions_list_request_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool health and active query count via the admin health endpoint or PG metrics.
  2. Run `EXPLAIN ANALYZE` on the `ListUserWatchedRepos` query — verify that the `watches(user_id)` index and the `repositories(id)` join index are being used correctly.
  3. Check if a concurrent migration, vacuum, or bulk watch insertion is holding locks.
  4. Check if the result set size for specific users is anomalously large (a user with thousands of subscriptions may produce slow queries). Query the `watches` table for users with count > 500.
  5. If the index has degraded, run `REINDEX` on the `watches` table.
  6. Check overall server CPU and memory load via the system monitoring dashboard.

#### Alert: Subscription List Endpoint Error Spike
- **Condition**: `rate(codeplane_user_subscriptions_list_requests_total{status="500"}[5m]) > 0.5` sustained for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for ERROR-level entries containing `user_subscriptions` or related context tags.
  2. Verify database connectivity — run a health check query against the primary DB.
  3. Verify the user service was correctly initialized in the service registry (check boot logs for initialization errors or missing DB migrations).
  4. If errors correlate with specific user IDs, check for data corruption in the `watches` or `repositories` tables (e.g., orphaned foreign keys to deleted repositories not yet cleaned up).
  5. If errors started immediately after a deploy, roll back to the previous version and investigate the diff.

#### Alert: Rate Limiting Spike on Subscription List
- **Condition**: `rate(codeplane_user_subscriptions_list_rate_limited_total[5m]) > 10` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify top source user IDs from access logs.
  2. Determine if the traffic is a legitimate integration (e.g., a dashboard polling subscriptions) or a misbehaving client.
  3. For legitimate integrations, advise the caller to implement client-side caching and reduce polling frequency. Recommend using the notification SSE stream as an alternative to polling the subscription list.
  4. For misbehaving clients or scripts, rate limit the specific user or token via admin controls.
  5. Evaluate whether current rate limit thresholds need adjustment.

#### Alert: High 401 Rate on Subscription List
- **Condition**: `rate(codeplane_user_subscriptions_list_requests_total{status="401"}[5m]) > 5` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if there's a client-side bug causing unauthenticated requests to the endpoint (e.g., web UI not attaching session cookie, CLI token expired).
  2. Check if there's been a mass session invalidation or token rotation event.
  3. Check if the auth middleware is correctly loading session context (review recent middleware changes).
  4. If 401s correlate with a specific client version, flag the release as potentially broken.

### Error Cases and Failure Modes

| Failure Mode                                     | Expected Behavior                                           | Detection                                      |
|--------------------------------------------------|-------------------------------------------------------------|-------------------------------------------------|
| Database unavailable                             | Return 500 with `{ "message": "internal error" }`. Log ERROR. | `status=500` counter spike                     |
| Watches table index missing or corrupted         | Query degrades to sequential scan. Latency increases.        | Latency histogram p95 alert fires              |
| User has watched a deleted repository            | Join naturally excludes it. No error. Consistent count.      | None needed — correct by design                |
| Concurrent watch/unwatch during pagination       | May produce slight inconsistencies between pages. Acceptable. | No alert — eventual consistency                |
| User has thousands of subscriptions              | Pagination keeps response size bounded. Query may be slow.   | Latency alert if p95 > threshold               |
| Invalid mode filter value                        | Returns 400 with validation error. Never 500.                | 400 counter                                    |
| Auth token expired mid-request                   | Returns 401. Never 500.                                      | 401 counter                                    |
| NULL `updated_at` on watch record                | Ordering degrades but query does not crash.                  | Defensive code; log WARN if encountered         |
| Foreign key integrity issue (watch points to deleted repo) | Join excludes it naturally. Count may be slightly off. | Periodic integrity check job                   |

## Verification

### API Integration Tests

| #  | Test Description | Method / Setup | Expected |
|----|-----------------|----------------|----------|
| 1  | List subscriptions for authenticated user who has subscriptions | `GET /api/user/subscriptions` (authenticated) | 200, non-empty array, `X-Total-Count > 0` |
| 2  | Each item has required repo fields | `GET /api/user/subscriptions` | Every item has `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at` |
| 3  | Each item has subscription object with mode | `GET /api/user/subscriptions` | Every item has `subscription.mode` which is one of `watching`, `participating`, `ignored` |
| 4  | Each item has subscription timestamps | `GET /api/user/subscriptions` | Every item has `subscription.created_at` and `subscription.updated_at` as valid ISO 8601 strings |
| 5  | Subscription list includes private repos the user watches | Setup: user watches own private repo. `GET /api/user/subscriptions` | Private repo present in results |
| 6  | List subscriptions for user with no subscriptions | Setup: new user with no watches. `GET /api/user/subscriptions` | 200, empty array, `X-Total-Count: 0` |
| 7  | Unauthenticated request returns 401 | `GET /api/user/subscriptions` (no auth) | 401, `{ "message": "authentication required" }` |
| 8  | Results ordered by subscription update time descending | Setup: user watches A then B then C. `GET /api/user/subscriptions` | C appears first, then B, then A |
| 9  | Filter by mode=watching returns only watching subscriptions | Setup: user has watching and participating subs. `GET /api/user/subscriptions?mode=watching` | All items have `subscription.mode === "watching"` |
| 10 | Filter by mode=participating returns only participating subscriptions | `GET /api/user/subscriptions?mode=participating` | All items have `subscription.mode === "participating"` |
| 11 | Filter by mode=ignored returns only ignored subscriptions | `GET /api/user/subscriptions?mode=ignored` | All items have `subscription.mode === "ignored"` |
| 12 | Filter by invalid mode returns 400 | `GET /api/user/subscriptions?mode=invalid` | 400, body contains validation error |
| 13 | Filter by empty mode string is treated as no filter | `GET /api/user/subscriptions?mode=` | 200, returns all subscriptions |
| 14 | Pagination `page=1&per_page=1` returns exactly 1 item | `GET /api/user/subscriptions?page=1&per_page=1` | 200, array length = 1, `X-Total-Count` reflects total |
| 15 | Pagination `page=2` returns next set | Setup: user has 3 subscriptions. `GET /api/user/subscriptions?page=2&per_page=1` | 200, different item than page 1 |
| 16 | `per_page=100` (max valid) works | `GET /api/user/subscriptions?per_page=100` | 200, at most 100 items |
| 17 | `per_page=101` is capped to 100 | `GET /api/user/subscriptions?per_page=101` | 200, at most 100 items |
| 18 | `page=0` returns 400 | `GET /api/user/subscriptions?page=0` | 400 |
| 19 | `per_page=0` returns 400 | `GET /api/user/subscriptions?per_page=0` | 400 |
| 20 | `page=-1` returns 400 | `GET /api/user/subscriptions?page=-1` | 400 |
| 21 | `per_page=abc` returns 400 | `GET /api/user/subscriptions?per_page=abc` | 400 |
| 22 | Page beyond last page returns empty array | `GET /api/user/subscriptions?page=999` | 200, empty array |
| 23 | `X-Total-Count` header is present and numeric | `GET /api/user/subscriptions` | Header present, value parseable as integer |
| 24 | `Link` header contains pagination rel values | Setup: user has > 1 subscription. `GET /api/user/subscriptions?page=1&per_page=1` | `Link` header has `rel="next"` |
| 25 | Cursor-based pagination works | `GET /api/user/subscriptions?cursor=0&limit=5` | 200, length ≤ 5 |
| 26 | `limit` exceeding max is capped | `GET /api/user/subscriptions?limit=200` | 200, at most 100 items |
| 27 | Watch a repo, verify it appears in subscriptions | `PUT /api/repos/owner/repo/subscription` (with mode=watching), then `GET /api/user/subscriptions` | Repo present in list with mode `watching` |
| 28 | Change watch mode, verify subscription list reflects new mode | `PUT /api/repos/owner/repo/subscription` (mode=participating), then `GET /api/user/subscriptions` | Repo present with mode `participating` |
| 29 | Unwatch a repo, verify it disappears from subscriptions | `DELETE /api/repos/owner/repo/subscription`, then `GET /api/user/subscriptions` | Repo absent from list |
| 30 | Deleted repo does not appear in subscription list | Setup: user watches repo, repo is deleted. `GET /api/user/subscriptions` | Deleted repo absent |
| 31 | `X-Total-Count` reflects filtered count when mode filter is applied | Setup: user has 2 watching, 1 participating. `GET /api/user/subscriptions?mode=watching` | `X-Total-Count: 2` |
| 32 | All timestamps are valid ISO 8601 | `GET /api/user/subscriptions` | All `created_at`, `updated_at`, `subscription.created_at`, `subscription.updated_at` parse as Date |
| 33 | Response content-type is `application/json` | `GET /api/user/subscriptions` | Content-Type header is `application/json` |
| 34 | Mode filter is case-sensitive | `GET /api/user/subscriptions?mode=WATCHING` | 400 (invalid mode) |
| 35 | Subscription list does not include repos user has only starred (not watched) | Setup: user stars repo A, watches repo B. `GET /api/user/subscriptions` | Only repo B appears |
| 36 | Combined mode filter and pagination work together | Setup: user has 3 watching subs. `GET /api/user/subscriptions?mode=watching&page=1&per_page=1` | 200, array length = 1, `X-Total-Count: 3` |

### CLI E2E Tests

| #  | Test Description | Command | Expected |
|----|-----------------|---------|----------|
| 37 | List own subscriptions (JSON) | `codeplane repo list --watched --json` | Exit 0, valid JSON array |
| 38 | List own subscriptions (human-readable) | `codeplane repo list --watched` | Exit 0, stdout contains formatted repo list with MODE column or "No watched repositories found." |
| 39 | List own subscriptions with pagination | `codeplane repo list --watched --limit 1 --page 1 --json` | Exit 0, JSON array with at most 1 item |
| 40 | Filter by mode | `codeplane repo list --watched --mode watching --json` | Exit 0, all items have `subscription.mode === "watching"` |
| 41 | Filter by invalid mode | `codeplane repo list --watched --mode invalid` | Exit 1, stderr contains error about invalid mode |
| 42 | Watch then list confirms presence | `codeplane repo watch owner/repo` then `codeplane repo list --watched --json` | Repo appears in list |
| 43 | Unwatch then list confirms absence | `codeplane repo unwatch owner/repo` then `codeplane repo list --watched --json` | Repo absent from list |
| 44 | Unauthenticated request fails | `codeplane repo list --watched` (without auth) | Exit 1, stderr contains authentication error |
| 45 | Empty subscription list | Setup: user with no watches. `codeplane repo list --watched` | Exit 0, stdout contains "No watched repositories found." |
| 46 | JSON output with mode filter includes subscription object | `codeplane repo list --watched --mode participating --json` | Each JSON item has `subscription.mode === "participating"` |

### Web UI E2E Tests (Playwright)

| #  | Test Description | Expected |
|----|-----------------|----------|
| 47 | Navigate to `/settings/subscriptions` shows subscription list | Page loads, subscription list is visible |
| 48 | Subscription list shows repo name as clickable link | At least one repo name is a clickable link |
| 49 | Clicking a subscribed repo navigates to `/:owner/:repo` | URL changes to repository page |
| 50 | Each subscription shows watch mode badge | Mode badge (Watching / Participating / Ignored) visible for every listed repo |
| 51 | Mode filter dropdown changes displayed results | Selecting "Watching" filter shows only watching subscriptions |
| 52 | Mode filter is reflected in URL query string | After selecting "Watching", URL contains `?mode=watching` |
| 53 | Direct navigation to `?mode=watching` loads filtered view | Navigating to `/settings/subscriptions?mode=watching` shows only watching repos |
| 54 | Empty subscription list shows empty state message | Page shows "You aren't watching any repositories yet." |
| 55 | Empty filtered view shows filter-specific empty state | Select "Ignored" when no repos are ignored → shows "No repositories match the selected filter." |
| 56 | Pagination controls appear when subscription count exceeds page size | Previous/Next visible with >30 subscriptions |
| 57 | Clicking "Next" loads the next page | New items appear, page indicator updates |
| 58 | Inline unwatch action removes repo from list | Click unwatch button → repo disappears from list without full reload |
| 59 | Inline mode change updates badge | Change mode from Watching to Participating → badge updates |
| 60 | Loading skeleton appears while data is fetched | Skeleton loader visible before data loads |
| 61 | Page requires authentication | Unauthenticated visit to `/settings/subscriptions` redirects to login |

### Load & Boundary Tests

| #  | Test Description | Expected |
|----|-----------------|----------|
| 62 | Subscription list responds within 500ms at p95 | Latency check passes |
| 63 | 100 concurrent requests to subscription list succeed | All return 200 |
| 64 | User with 1000 subscriptions — page 1 loads within 1s | Response time < 1s |
| 65 | User with 1000 subscriptions — `per_page=100` returns exactly 100 items | Array length = 100, `X-Total-Count: 1000` |
| 66 | User with 1000 subscriptions — filter by mode=watching returns correct subset | `X-Total-Count` matches actual watching count, not total subscription count |
| 67 | Rate limiting engages after threshold (300/min authenticated) | 301st request returns 429 with `Retry-After` header |
| 68 | `per_page=100` (maximum valid boundary) returns correct result set | 200, exactly min(100, total) items |
| 69 | `per_page=101` is silently capped to 100 | 200, at most 100 items |

# SEARCH_USERS

Specification for SEARCH_USERS.

## High-Level User POV

When a Codeplane user needs to find another person on the instance — to assign them to an issue, add them as a reviewer on a landing request, mention them in a comment, or simply look up their profile — they use user search. User search is available everywhere Codeplane is: in the web UI's global search page, in the CLI as `codeplane search users`, in the TUI's search screen under the Users tab, and through the API for automation and editor integrations.

The experience is simple and immediate. The user types a name or username into a search field, and matching users appear ranked by relevance. Partial matches work — typing "ali" surfaces "alice", "alicejohnson", and "alice_dev". Both usernames and display names are searchable, so a team member known informally as "AJ" can be found whether the searcher knows their handle or their real name. Results appear quickly, with the most relevant matches at the top.

User search is a discovery tool. It shows every active user on the Codeplane instance whose username or display name matches the query, regardless of whether the searcher shares repository access with them. User profiles are considered public information within an instance — the same way one can see who else is in a GitHub organization. Deactivated or deleted accounts never appear in results.

Each result shows the user's username and display name. In graphical contexts like the web UI, the user's avatar is also shown. In the TUI, where rendering is text-only, results are compact single-line entries. Clicking or pressing Enter on a result navigates to that user's public profile, where their repositories, activity, and bio are visible.

Pagination keeps large result sets manageable. The first page loads immediately, and additional pages load as the user scrolls or requests more. The total number of matching users is always visible, so the searcher knows how broad their query matched even if they only browse the first few results.

User search transforms Codeplane from a tool where you must already know someone's exact handle into one where you can discover collaborators by partial name, explore who is on the instance, and quickly navigate to anyone's profile — all from whichever client surface you happen to be working in.

## Acceptance Criteria

### Definition of Done

- [ ] Users can search for other users by username via `GET /api/search/users?q=<query>`
- [ ] Users can search for other users by display name via the same endpoint
- [ ] Search uses PostgreSQL full-text search with prefix matching (`to_tsquery('simple', query || ':*')`)
- [ ] Search is case-insensitive
- [ ] Only active users (`is_active = TRUE`) appear in results
- [ ] Deactivated, deleted, or login-prohibited users are excluded from results
- [ ] Results are ranked by FTS relevance (ts_rank descending), then by user ID ascending as tiebreaker
- [ ] Each result includes: `id`, `username`, `display_name`, `avatar_url`
- [ ] The response includes: `items` array, `total_count`, `page`, `per_page`
- [ ] The `X-Total-Count` response header is set to the total number of matching users
- [ ] Pagination defaults: page 1, 30 results per page
- [ ] Maximum results per page: 100
- [ ] The `q` parameter is required and must be non-empty after trimming; returns 422 if empty
- [ ] Both `page`/`per_page` and `cursor`/`limit` pagination styles are supported
- [ ] Invalid pagination parameters (non-numeric, zero, negative) return 400
- [ ] The CLI command `codeplane search users <query>` calls the API and outputs JSON results
- [ ] The CLI supports `--page` and `--limit` options
- [ ] The web UI global search page includes a Users tab showing user search results
- [ ] The TUI search screen includes a Users tab (third tab) showing user search results
- [ ] All clients URL-encode the query parameter before transmission
- [ ] The feature is registered as `SEARCH_USERS` in `specs/features.ts` under `SEARCH_AND_NOTIFICATIONS`

### Boundary Constraints

- [ ] Query string: minimum 1 character after trimming, no explicit maximum enforced by the API (PostgreSQL FTS handles arbitrarily long queries)
- [ ] Query string: leading and trailing whitespace is trimmed before processing
- [ ] Query string: special characters, SQL wildcards (`%`, `_`), and Unicode are handled transparently by FTS tokenization — no manual escaping is needed and no injection is possible
- [ ] Username field: up to 40 characters in the system; display truncation varies by client
- [ ] Display name field: no enforced maximum in the user model; display truncation varies by client
- [ ] Page parameter: must be ≥ 1; values < 1 are normalized to 1
- [ ] Per-page parameter: must be ≥ 1; values < 1 are normalized to 30 (default); values > 100 are clamped to 100
- [ ] Total count: accurately reflects the number of matching active users, not the number of returned items on the current page
- [ ] Avatar URL: included in results but may be empty string if the user has no avatar set

### Edge Cases

- [ ] Query matches zero users: returns `{ items: [], total_count: 0, page: 1, per_page: 30 }`
- [ ] Query is only whitespace: returns 422 validation error after trimming
- [ ] Query with special characters (e.g., `@`, `#`, `.`, `-`, `_`): processed by FTS tokenizer; non-word characters are treated as separators
- [ ] Query with Unicode characters (e.g., CJK, emoji, accented): matched if present in username/display_name search vectors
- [ ] Query with SQL injection attempts (e.g., `'; DROP TABLE users;--`): safely parameterized; no injection possible
- [ ] Duplicate display names: both users appear in results, each with their unique username
- [ ] User with identical username and display name: result shows both fields (e.g., `alice (alice)`)
- [ ] User with empty display name: result shows empty string for `display_name`; clients must not render empty parentheses
- [ ] User with very long username (40 chars): returned in full by API; clients truncate for display
- [ ] Request page beyond available results (e.g., page 1000 when only 5 users match): returns `{ items: [], total_count: 5, page: 1000, per_page: 30 }`
- [ ] Concurrent user deactivation during search: if a user is deactivated between the count query and the results query, the total_count may be off by one — this is acceptable eventual consistency
- [ ] Very large instance (100,000+ users): FTS index ensures sub-second response times; pagination prevents unbounded payloads

## Design

### API Shape

**Endpoint:** `GET /api/search/users`

**Query Parameters:**

| Parameter | Type | Required | Default | Constraints | Description |
|-----------|------|----------|---------|-------------|-------------|
| `q` | string | Yes | — | ≥ 1 char after trim | Search query matched against username and display_name |
| `page` | integer | No | 1 | ≥ 1 | Page number (1-indexed) |
| `per_page` | integer | No | 30 | 1–100 | Results per page |
| `cursor` | string | No | — | — | Cursor-based pagination offset (alternative to page/per_page) |
| `limit` | integer | No | 30 | 1–100 | Results limit (used with cursor) |

**Response (200 OK):**

```json
{
  "items": [
    {
      "id": "42",
      "username": "alicejohnson",
      "display_name": "Alice Johnson",
      "avatar_url": "https://codeplane.example/avatars/42.png"
    }
  ],
  "total_count": 3,
  "page": 1,
  "per_page": 30
}
```

**Response Headers:**

| Header | Value | Description |
|--------|-------|-------------|
| `X-Total-Count` | `"3"` | Total matching users across all pages |

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid `limit` or pagination parameter | `{ "error": "invalid limit value" }` |
| 422 | Empty or missing `q` parameter | `{ "error": "query required" }` |
| 429 | Rate limit exceeded | Standard rate limit response with `Retry-After` header |
| 500 | Internal server error | `{ "error": "internal server error" }` |

### SDK Shape

**SearchService method:**

```typescript
searchUsers(input: SearchUsersInput): Promise<UserSearchResultPage>
```

**Input:**
```typescript
interface SearchUsersInput {
  query: string;   // Required, trimmed, must be non-empty
  page: number;    // Normalized: min 1
  perPage: number; // Normalized: min 1, max 100, default 30
}
```

**Output:**
```typescript
interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

interface UserSearchResultPage {
  items: UserSearchResult[];
  total_count: number;
  page: number;
  per_page: number;
}
```

Note: Unlike `searchRepositories`, `searchIssues`, and `searchCode`, the `searchUsers` method does not accept a `viewer` parameter. User search results are not filtered by the caller's identity — all active users matching the query are returned.

### CLI Command

**Command:** `codeplane search users <query>`

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--page` | number | 1 | Page number |
| `--limit` | number | 30 | Results per page |

**Output:** JSON object matching the API response shape.

**Example:**

```bash
$ codeplane search users alice
{
  "items": [
    { "id": "42", "username": "alicejohnson", "display_name": "Alice Johnson", "avatar_url": "..." },
    { "id": "78", "username": "alicew", "display_name": "Alice Wang", "avatar_url": "..." }
  ],
  "total_count": 2,
  "page": 1,
  "per_page": 30
}
```

**Error behavior:** If the query is empty or missing, the CLI exits with a non-zero exit code and prints the error message.

### Web UI Design

The web UI global search page (`/search`) includes a Users tab alongside Repositories, Issues, and Code tabs.

**Search input:** A single text input at the top of the page with a search icon. Typing triggers a 300ms debounce before dispatching parallel API requests to all four search endpoints.

**Users tab:**
- Tab label shows "Users" with a count badge indicating `total_count` (e.g., "Users (3)")
- Each user result row displays:
  - User avatar (small, circular)
  - Username as a link to `/:username` profile page
  - Display name in muted/secondary text
- Results are rendered in relevance order as returned by the API
- Pagination: "Load more" or infinite scroll loads the next page when the user reaches the bottom
- Empty state: "No users match '{query}'." with a suggestion to try a different query
- Error state: inline error message with a retry button
- Loading state: skeleton rows or spinner

**Tab auto-selection:** When results arrive, if the currently active tab has zero results but the Users tab has results, the Users tab auto-selects.

### TUI UI

The TUI search screen includes the Users tab as the third tab (position between Issues and Code).

**Entry:** `g s` to open search, then `3` or `Tab`/`Shift+Tab` to reach the Users tab.

**Result row format:**
- Standard (120×40): `► username                      (Display Name)`
- Minimum (80×24): `► username` (no display name)
- Username in primary color (ANSI 33), display name in muted color (ANSI 245)
- Focused row: reverse video
- Username truncation: max 20 chars at standard, max 76 chars at minimum
- Display name truncation: max 30 chars

**Keyboard interactions:**
- `j`/`k`/`Up`/`Down`: navigate results
- `Enter`: navigate to user profile screen
- `G`/`g g`: jump to last/first result
- `Ctrl+D`/`Ctrl+U`: page down/up
- `/`: focus search input
- `R`: retry on error
- `q`/`Esc`: pop search screen
- `3`: switch to Users tab
- `Tab`/`Shift+Tab`: cycle tabs

**Responsive behavior:**
- Below 80×24: "Terminal too small" from app shell
- 80×24: abbreviated tab labels ("Users(N)"), username only, ~16 visible rows
- 120×40: full labels with pipe separators ("Users (N)"), username + display_name, ~30 visible rows
- 200×60+: same as standard, ~50 visible rows

**Pagination:** Auto-loads next page at 80% scroll depth. Capped at 300 loaded items (10 pages × 30). "Loading more…" indicator shown during fetch.

**State preservation:** Query, active tab, scroll position, and focused item are preserved across tab switches and back-navigation from user profile.

### Neovim Plugin API

The Neovim plugin provides user search through the existing search command infrastructure:

- `:Codeplane search users <query>` opens a Telescope picker with user results
- Each result shows username and display name
- Selecting a result opens the user profile in a browser or Codeplane webview

### VS Code Extension

The VS Code extension includes user search in its search/picker flows:

- Command palette: "Codeplane: Search Users" opens a QuickPick with live search
- Each result shows username and display name with avatar icon
- Selecting a result opens the user profile in a webview panel or external browser

### Documentation

The following end-user documentation should be written:

- **Search guide** (`docs/guides/search.mdx`): Ensure the existing guide documents user search alongside repository, issue, and code search. Include: example CLI commands (`codeplane search users alice`), example curl requests (`curl /api/search/users?q=alice`), a note that user search returns all active users regardless of repository visibility, and pagination examples.
- **CLI reference**: The `search users` subcommand should appear in the CLI command reference with parameter descriptions, option flags, and example output.
- **API reference**: The `GET /api/search/users` endpoint should be documented with all query parameters, response schema, error codes, pagination behavior, and rate limit information.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (any role) | Admin |
|--------|-----------|--------------------------|-------|
| Search users via API | ✅ (no auth required) | ✅ | ✅ |
| Search users via CLI | ✅ (with token) | ✅ | ✅ |
| Search users via TUI | ❌ (TUI requires auth at bootstrap) | ✅ | ✅ |
| Search users via Web UI | ✅ (if search page is accessible) | ✅ | ✅ |

**Key security properties:**

- The `GET /api/search/users` endpoint does not require authentication. The route handler does not call `getUser(c)` to extract a viewer — this is intentional, as user profiles are considered public information within a Codeplane instance.
- All active users matching the query are returned. There is no visibility filtering based on the caller's identity (unlike repository search, which scopes results by access).
- Deactivated users (`is_active = FALSE`) and users with `prohibit_login = TRUE` are excluded by the database query.
- The `email` field is never included in user search results. Only `id`, `username`, `display_name`, and `avatar_url` are returned.
- Admin users see the same user search results as regular users — there is no elevated view.

### Rate Limiting

- User search shares the global API rate limit tier.
- The search endpoint should be subject to a stricter per-endpoint rate limit of **30 requests per minute per IP** for unauthenticated callers, and **60 requests per minute per user** for authenticated callers.
- Rate limit responses return HTTP 429 with a `Retry-After` header indicating the number of seconds to wait.
- Client-side debounce (300ms in web UI and TUI) reduces request volume during interactive typing.

### Data Privacy Constraints

- **Email addresses** are never included in search results. The `UserSearchResult` type explicitly omits email.
- **Bio** is returned by the database query but is not included in the API response — this is a defense-in-depth measure to limit unnecessary PII exposure in search results. Bio is available on the user profile endpoint.
- **Avatar URL** is included and is considered non-sensitive (it's a public URL).
- **User IDs** are opaque strings and do not encode sensitive information.
- Rate limit keys for unauthenticated users use IP addresses, which are PII. IP-keyed rate limit events must not be logged at INFO level; they may be logged at DEBUG level only.
- Search queries themselves may contain PII (e.g., a person's real name). Queries must not be logged at INFO level in plaintext. If logged for debugging, they should be hashed or truncated.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `search.users.executed` | API request to `/api/search/users` completes | `query_length`, `total_count`, `page`, `per_page`, `result_count` (items on this page), `duration_ms`, `source` ("api", "cli", "web", "tui", "vscode", "nvim"), `authenticated` (boolean) |
| `search.users.zero_results` | User search returns zero results | `query_length`, `query_hash` (SHA-256 of query, not plaintext), `source`, `authenticated` |
| `search.users.result_clicked` | User clicks/selects a search result to view profile | `query_length`, `result_position` (0-indexed), `total_count`, `username_hash`, `source`, `time_to_click_ms` |
| `search.users.paginated` | User loads a subsequent page of results | `page_number`, `query_length`, `total_count`, `source` |
| `search.users.error` | User search API call fails | `error_type` ("validation", "rate_limit", "internal", "timeout"), `http_status`, `query_length`, `source` |

### Common Event Properties

All user search events include:
- `timestamp`: ISO 8601
- `request_id`: correlation ID from the `X-Request-Id` header
- `instance_id`: Codeplane instance identifier

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Search-to-profile conversion rate | ≥ 25% | At least 25% of user search sessions result in navigating to a user profile |
| Zero-result rate | < 20% | Fewer than 20% of user search queries return zero results |
| P95 response time | < 500ms | 95th percentile response time for user search queries |
| P99 response time | < 2000ms | 99th percentile response time for user search queries |
| Daily active searchers | Growing week-over-week | Number of unique users performing user searches per day |
| Pagination depth | Median ≤ 2 pages | Median number of pages loaded per search session; deeper pagination suggests poor ranking |
| Error rate | < 1% | Fewer than 1% of user search API calls result in 5xx errors |

## Observability

### Logging Requirements

| Log Level | Event | Structured Context | Message |
|-----------|-------|--------------------|--------|
| `debug` | Search query received | `{ query_length, page, per_page, request_id }` | `search.users: query received` |
| `debug` | FTS query executed | `{ query_length, duration_ms, result_count, total_count, request_id }` | `search.users: FTS completed` |
| `info` | Search completed successfully | `{ total_count, page, per_page, duration_ms, request_id }` | `search.users: completed` |
| `warn` | Slow search response (> 3000ms) | `{ query_length, duration_ms, total_count, request_id }` | `search.users: slow response` |
| `warn` | Rate limit triggered | `{ client_ip_hash, user_id, retry_after_s, request_id }` | `search.users: rate limited` |
| `warn` | Validation error (empty query) | `{ request_id }` | `search.users: empty query rejected` |
| `error` | Database query failed | `{ error_message, error_code, query_length, request_id }` | `search.users: database error` |
| `error` | Unexpected exception in route handler | `{ error_message, stack_trace_hash, request_id }` | `search.users: unhandled error` |

**Privacy rules:**
- Never log the raw query text at INFO level or above. Use `query_length` or `query_hash` instead.
- Never log email addresses, even in debug.
- IP addresses in rate-limit logs: hash at INFO, plaintext only at DEBUG.

### Prometheus Metrics

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_search_users_requests_total` | `status` (2xx, 4xx, 5xx), `source` | Total user search requests |
| `codeplane_search_users_results_total` | — | Total user search results returned (sum of all items) |
| `codeplane_search_users_zero_results_total` | `source` | Total user searches returning zero results |
| `codeplane_search_users_errors_total` | `error_type` (validation, rate_limit, internal) | Total user search errors by type |

**Histograms:**

| Metric | Buckets | Labels | Description |
|--------|---------|--------|-------------|
| `codeplane_search_users_duration_seconds` | 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0 | `status` | Response time for user search requests |
| `codeplane_search_users_result_count` | 0, 1, 5, 10, 20, 30, 50, 100 | — | Number of results per search response |

**Gauges:**

| Metric | Description |
|--------|-------------|
| `codeplane_users_active_total` | Total number of active users in the system (for search coverage context) |

### Alerts

**Alert 1: High Error Rate**

| Field | Value |
|-------|-------|
| Name | `SearchUsersHighErrorRate` |
| Condition | `rate(codeplane_search_users_errors_total{error_type="internal"}[5m]) / rate(codeplane_search_users_requests_total[5m]) > 0.05` |
| Duration | 5 minutes |
| Severity | Warning |

**Runbook:**
1. Check server logs for `search.users: database error` and `search.users: unhandled error` entries in the last 10 minutes.
2. Verify database connectivity: run `SELECT 1` against the primary database.
3. Check if the `users` table's `search_vector` index is corrupted: run `REINDEX INDEX CONCURRENTLY idx_users_search_vector`.
4. Check for resource exhaustion: examine database connection pool usage, CPU, and memory.
5. If a specific query pattern is causing errors, check the PostgreSQL logs for query plan issues.
6. Escalate to the database team if the index reindex does not resolve the issue.

**Alert 2: High Latency**

| Field | Value |
|-------|-------|
| Name | `SearchUsersHighLatency` |
| Condition | `histogram_quantile(0.95, rate(codeplane_search_users_duration_seconds_bucket[5m])) > 2.0` |
| Duration | 10 minutes |
| Severity | Warning |

**Runbook:**
1. Check `search.users: slow response` warn-level logs for query_length patterns — very long queries may cause slow FTS parsing.
2. Run `EXPLAIN ANALYZE` on a representative `searchUsersFTS` query to check for sequential scans.
3. Verify the GIN index on `users.search_vector` exists and is not bloated: `SELECT pg_size_pretty(pg_relation_size('idx_users_search_vector'))`.
4. Check for table bloat: `SELECT n_dead_tup, n_live_tup FROM pg_stat_user_tables WHERE relname = 'users'`. If dead tuples > 20% of live tuples, run `VACUUM ANALYZE users`.
5. Check concurrent query load on the database — high connection count or lock contention can cause latency spikes.
6. If the index is large, consider whether the instance has grown to a scale requiring index partitioning or read replicas.

**Alert 3: Elevated Zero-Result Rate**

| Field | Value |
|-------|-------|
| Name | `SearchUsersHighZeroResultRate` |
| Condition | `rate(codeplane_search_users_zero_results_total[1h]) / rate(codeplane_search_users_requests_total[1h]) > 0.4` |
| Duration | 1 hour |
| Severity | Info |

**Runbook:**
1. This is a product health signal, not an infrastructure alert. It indicates users are searching for terms that don't match any active users.
2. Check if a large batch of user deactivations recently occurred (admin audit log).
3. Check if the `search_vector` column is being populated correctly for new users: query `SELECT id, username, search_vector FROM users WHERE search_vector IS NULL AND is_active = TRUE`.
4. If search vectors are NULL for active users, verify the database trigger that populates `search_vector` on INSERT/UPDATE is functioning.
5. Report findings to the product team for UX improvements (e.g., fuzzy matching, search suggestions).

**Alert 4: Rate Limit Spike**

| Field | Value |
|-------|-------|
| Name | `SearchUsersRateLimitSpike` |
| Condition | `rate(codeplane_search_users_errors_total{error_type="rate_limit"}[5m]) > 10` |
| Duration | 5 minutes |
| Severity | Warning |

**Runbook:**
1. Check if a single IP or user is generating excessive search requests: examine rate-limit warn logs.
2. If a single source, it may be a scraper or misconfigured automation. Consider temporary IP block if abuse is confirmed.
3. If distributed across many users, the rate limit threshold may be too aggressive for the instance size. Consider adjusting the per-endpoint rate limit.
4. Verify client-side debounce is working correctly — a broken debounce in the web UI or TUI could cause excessive requests.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Detection | Impact | Recovery |
|------------|-------------|-----------|--------|----------|
| Empty query after trim | 422 | Input validation in service layer | None — user gets clear error message | User provides a non-empty query |
| Invalid pagination parameters | 400 | Route-layer parsing | None — user gets clear error message | User corrects parameters |
| Database connection failure | 500 | Database query throws | Search unavailable | Automatic reconnection via connection pool; alert fires |
| FTS index corruption | 500 | Database query returns unexpected error | Search returns errors or incorrect results | `REINDEX INDEX CONCURRENTLY`; alert fires |
| Search vector NULL for active users | Degraded results | Zero-result alert fires | Some users not discoverable | Fix database trigger; backfill search vectors |
| Extremely long query (>10KB) | 200 (slow) | Latency alert fires | Slow response for that request | FTS handles gracefully; consider adding query length limit |
| Concurrent user deactivation | 200 (stale count) | No detection needed | total_count off by ≤1 | Acceptable eventual consistency |
| Memory pressure from large result set | 200 | Application memory monitoring | None — capped at 100 per page | Pagination enforces bounded payloads |

## Verification

### API Integration Tests

**File:** `e2e/api/search-users.test.ts`

```
API-SEARCH-001: GET /api/search/users with valid query returns 200 and matching users
  → Create users "alice_test_001" and "bob_test_001"
  → GET /api/search/users?q=alice_test_001
  → Assert status 200
  → Assert response has items array containing user with username "alice_test_001"
  → Assert response has total_count ≥ 1
  → Assert response has page = 1, per_page = 30
  → Assert X-Total-Count header matches total_count

API-SEARCH-002: GET /api/search/users with query matching display name returns results
  → Create user with username "usr_002" and display_name "Unique Display Name 002"
  → GET /api/search/users?q=Unique+Display+Name+002
  → Assert items contains user with username "usr_002"

API-SEARCH-003: GET /api/search/users with prefix query returns prefix matches
  → Create users "prefix_aaa", "prefix_aab", "prefix_bbb"
  → GET /api/search/users?q=prefix_aa
  → Assert items contains "prefix_aaa" and "prefix_aab"
  → Assert items does not contain "prefix_bbb"

API-SEARCH-004: GET /api/search/users with empty query returns 422
  → GET /api/search/users?q=
  → Assert status 422
  → Assert error message "query required"

API-SEARCH-005: GET /api/search/users with missing q parameter returns 422
  → GET /api/search/users
  → Assert status 422

API-SEARCH-006: GET /api/search/users with whitespace-only query returns 422
  → GET /api/search/users?q=%20%20%20
  → Assert status 422

API-SEARCH-007: GET /api/search/users with no matches returns empty items and total_count 0
  → GET /api/search/users?q=zzz_nonexistent_user_xyz_999
  → Assert status 200
  → Assert items is empty array
  → Assert total_count = 0

API-SEARCH-008: GET /api/search/users with page parameter paginates results
  → Ensure ≥ 31 users matching "common_prefix" exist
  → GET /api/search/users?q=common_prefix&page=1&per_page=30
  → Assert items.length = 30
  → GET /api/search/users?q=common_prefix&page=2&per_page=30
  → Assert items.length ≥ 1
  → Assert no overlap between page 1 and page 2 items (by id)

API-SEARCH-009: GET /api/search/users with per_page=1 returns exactly 1 result
  → GET /api/search/users?q=alice&per_page=1
  → Assert items.length ≤ 1

API-SEARCH-010: GET /api/search/users with per_page=100 (maximum) returns up to 100 results
  → GET /api/search/users?q=a&per_page=100
  → Assert items.length ≤ 100

API-SEARCH-011: GET /api/search/users with per_page=101 clamps to 100
  → GET /api/search/users?q=a&per_page=101
  → Assert per_page in response = 100

API-SEARCH-012: GET /api/search/users with per_page=0 normalizes to default 30
  → GET /api/search/users?q=a&per_page=0
  → Assert per_page in response = 30

API-SEARCH-013: GET /api/search/users with invalid limit returns 400
  → GET /api/search/users?q=test&limit=abc
  → Assert status 400
  → Assert error contains "invalid limit"

API-SEARCH-014: GET /api/search/users with cursor pagination works
  → GET /api/search/users?q=a&cursor=0&limit=5
  → Assert status 200
  → Assert items.length ≤ 5

API-SEARCH-015: GET /api/search/users does not return deactivated users
  → Create user "deactivated_user_015", then deactivate
  → GET /api/search/users?q=deactivated_user_015
  → Assert items does not contain "deactivated_user_015"

API-SEARCH-016: GET /api/search/users search is case-insensitive
  → Create user "CaseSensitiveUser016"
  → GET /api/search/users?q=casesensitiveuser016
  → Assert items contains user with username matching case-insensitively

API-SEARCH-017: GET /api/search/users result does not include email field
  → GET /api/search/users?q=alice
  → Assert no item in results has an "email" property

API-SEARCH-018: GET /api/search/users results are ordered by relevance
  → Create users "exact_match_018" and "exact_match_018_suffix"
  → GET /api/search/users?q=exact_match_018
  → Assert "exact_match_018" appears before "exact_match_018_suffix" (exact > prefix)

API-SEARCH-019: GET /api/search/users with special characters does not error
  → GET /api/search/users?q=%27%3B+DROP+TABLE+users%3B--
  → Assert status 200 (not 500)
  → Assert items is empty array or contains only legitimately matching users

API-SEARCH-020: GET /api/search/users with Unicode query works
  → Create user with display_name containing Unicode (e.g., "Ünïcödé")
  → GET /api/search/users?q=Ünïcödé
  → Assert items contains the matching user

API-SEARCH-021: GET /api/search/users with page beyond results returns empty items but correct total_count
  → GET /api/search/users?q=alice&page=9999
  → Assert items is empty
  → Assert total_count reflects actual matching count (not 0)

API-SEARCH-022: GET /api/search/users without authentication succeeds
  → GET /api/search/users?q=alice (no Authorization header, no session cookie)
  → Assert status 200

API-SEARCH-023: GET /api/search/users X-Total-Count header is present and correct
  → GET /api/search/users?q=alice
  → Assert X-Total-Count header exists
  → Assert parseInt(X-Total-Count) === response.total_count

API-SEARCH-024: GET /api/search/users with maximum valid per_page (100) and many results
  → Ensure ≥ 100 users exist matching a common prefix
  → GET /api/search/users?q=common&per_page=100
  → Assert items.length = 100
  → Assert total_count > 100
```

### CLI E2E Tests

**File:** `e2e/cli/search.test.ts` (extend existing file)

```
CLI-SEARCH-USERS-001: codeplane search users with valid query returns matching users
  → Run: codeplane search users alice
  → Assert exit code 0
  → Assert JSON output has items array
  → Assert items contains user with username "alice"

CLI-SEARCH-USERS-002: codeplane search users with --page option paginates
  → Run: codeplane search users alice --page 1 --limit 1
  → Assert exit code 0
  → Assert items.length ≤ 1

CLI-SEARCH-USERS-003: codeplane search users with no matches returns empty items
  → Run: codeplane search users zzz_nonexistent_xyz_999
  → Assert exit code 0
  → Assert items is empty
  → Assert total_count = 0

CLI-SEARCH-USERS-004: codeplane search users with empty query fails
  → Run: codeplane search users ""
  → Assert exit code ≠ 0

CLI-SEARCH-USERS-005: codeplane search users output includes username and display_name
  → Run: codeplane search users alice
  → Assert each item in items has "username" and "display_name" fields

CLI-SEARCH-USERS-006: codeplane search users with --limit 100 (maximum)
  → Run: codeplane search users a --limit 100
  → Assert exit code 0
  → Assert items.length ≤ 100
```

### CLI Input Validation Tests

**File:** `e2e/cli/input-validation.test.ts` (extend existing file)

```
CLI-VALID-USERS-001: search users with invalid per_page fails
  → Run: codeplane api /api/search/users?q=test&per_page=abc
  → Assert exit code ≠ 0

CLI-VALID-USERS-002: search users with page=0 returns error or normalizes
  → Run: codeplane api /api/search/users?q=test&page=0
  → Assert behavior is defined (either error or normalized to page 1)

CLI-VALID-USERS-003: search users with negative limit fails
  → Run: codeplane api /api/search/users?q=test&limit=-1
  → Assert exit code ≠ 0
```

### Web UI E2E Tests (Playwright)

**File:** `e2e/ui/search-users.test.ts`

```
UI-SEARCH-USERS-001: Global search page loads with Users tab
  → Navigate to /search
  → Type "alice" in search input
  → Wait for results
  → Assert Users tab is visible with count badge
  → Click Users tab
  → Assert user results are displayed with username and display name

UI-SEARCH-USERS-002: Clicking a user result navigates to user profile
  → Navigate to /search, type "alice", click Users tab
  → Click first user result
  → Assert URL changes to /:username
  → Assert user profile page loads

UI-SEARCH-USERS-003: Users tab shows zero-result state
  → Navigate to /search, type "zzz_nonexistent_999"
  → Click Users tab
  → Assert "No users match" message is displayed

UI-SEARCH-USERS-004: Users tab shows correct count badge
  → Navigate to /search, type "alice"
  → Assert Users tab badge shows a number matching total_count from API

UI-SEARCH-USERS-005: Search input debounces requests
  → Navigate to /search
  → Type "a", "l", "i", "c", "e" rapidly
  → Assert only 1-2 search API requests were made (not 5)

UI-SEARCH-USERS-006: Users tab pagination loads more results
  → Navigate to /search, type a broad query matching many users
  → Click Users tab
  → Scroll to bottom
  → Assert additional results load (or "Load more" button works)

UI-SEARCH-USERS-007: User result displays avatar
  → Navigate to /search, type "alice", click Users tab
  → Assert user result rows include an avatar image element

UI-SEARCH-USERS-008: User result does not display email
  → Navigate to /search, type "alice", click Users tab
  → Assert no email text is visible in user result rows

UI-SEARCH-USERS-009: Search with special characters does not crash
  → Navigate to /search, type "'; DROP TABLE users;--"
  → Assert page does not error
  → Assert results show (empty or matching)

UI-SEARCH-USERS-010: Tab auto-selection when Users tab has results but current tab is empty
  → Navigate to /search, type a query that matches users but not repositories
  → Assert Users tab auto-selects (or first non-empty tab)
```

### TUI E2E Tests

**File:** `e2e/tui/search-users.test.ts`

```
TUI-SEARCH-USERS-001: Users tab renders results at 120×40
  → Launch TUI at 120×40, type g s to open search
  → Type "alice", press 3 to switch to Users tab
  → Assert Users tab is active with bold/underline styling
  → Assert user rows show username in primary color

TUI-SEARCH-USERS-002: Users tab renders at 80×24 without display names
  → Launch TUI at 80×24, open search, type "alice", press 3
  → Assert abbreviated tab labels
  → Assert user rows show username only (no display_name)

TUI-SEARCH-USERS-003: j/k keyboard navigation works on Users tab
  → Open search, type "alice", press 3
  → Press j twice
  → Assert third user is focused (reverse video)
  → Press k
  → Assert second user is focused

TUI-SEARCH-USERS-004: Enter navigates to user profile
  → Open search, type "alice", press 3, press Enter
  → Assert screen changes to user profile
  → Press q
  → Assert returns to search with Users tab active and state preserved

TUI-SEARCH-USERS-005: Users tab zero results shows message
  → Open search, type "zzz_nonexistent", press 3
  → Assert "No users match 'zzz_nonexistent'." is displayed

TUI-SEARCH-USERS-006: Users tab error state shows retry hint
  → Open search with mocked API returning 500 for users
  → Press 3
  → Assert "Search error. Press R to retry." is shown

TUI-SEARCH-USERS-007: R retries failed user search
  → From error state, press R
  → Assert search is retried

TUI-SEARCH-USERS-008: Tab switching preserves Users tab state
  → Open search, type "alice", press 3, scroll down
  → Press Tab (switch to Code), then Shift+Tab (back to Users)
  → Assert scroll position and focused item are preserved

TUI-SEARCH-USERS-009: Pagination auto-loads at 80% scroll
  → Open search with query matching 60+ users
  → Press 3, scroll to ~80% of loaded results
  → Assert "Loading more…" appears and additional results load

TUI-SEARCH-USERS-010: Pagination stops at 300 item cap
  → Open search with query matching 1000+ users
  → Scroll through 10 pages
  → Assert no further pages are loaded after 300 items
```

### Multi-Repository Search Integration Tests

**File:** `e2e/cli/multi-repo-search.test.ts` (extend existing)

```
MULTI-SEARCH-USERS-001: User search returns results independent of repository context
  → Create user "multisearch_usr_001"
  → Run: codeplane search users multisearch_usr_001
  → Assert user appears in results regardless of which repos exist
```

### Performance / Load Tests

```
PERF-SEARCH-USERS-001: User search returns within 500ms for 10,000 active users
  → Ensure database has 10,000+ active users with populated search vectors
  → GET /api/search/users?q=a
  → Assert response time < 500ms

PERF-SEARCH-USERS-002: User search with very long query (1000 chars) does not timeout
  → GET /api/search/users?q=<1000 char string>
  → Assert response returns within 10 seconds (does not timeout)
  → Assert status is 200

PERF-SEARCH-USERS-003: Concurrent user search requests are handled without errors
  → Send 50 concurrent GET /api/search/users?q=test requests
  → Assert all return 200 or 429 (rate limited)
  → Assert no 500 errors
```

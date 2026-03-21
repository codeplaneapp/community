# SEARCH_CLI_USERS

Specification for SEARCH_CLI_USERS.

## High-Level User POV

When a Codeplane user needs to find other people on the platform—whether to assign them to an issue, add them as collaborators, mention them in a landing request, or simply look up a colleague—they should be able to do so instantly from the command line without leaving their terminal workflow.

`codeplane search users` lets any user type a partial name or username and immediately see matching profiles across the entire Codeplane instance. The command returns usernames, display names, and avatar URLs, making it straightforward to identify the right person and feed that information into subsequent commands like issue assignment, team membership, or landing request review. The results are sorted by relevance so the best match appears first.

This command is especially valuable for agent-augmented workflows where an automated agent needs to resolve a human-readable name to an exact Codeplane username before performing an operation—something that must happen reliably without interactive UI. It also supports scripting pipelines through structured JSON output, allowing `codeplane search users "alice" --json` to be piped into `jq` or consumed by automation tooling.

Because user profiles are public discovery data, this command works without requiring the caller to be authenticated. Any user or automated process with network access to the Codeplane API can discover active users. Inactive or deactivated users are never returned, ensuring the directory stays clean and actionable.

## Acceptance Criteria

### Definition of Done

- [ ] The CLI subcommand `codeplane search users <query>` is registered and functional.
- [ ] It sends a `GET /api/search/users?q=<query>&page=<page>&limit=<limit>` request to the configured Codeplane API.
- [ ] Results are displayed in a human-readable table format by default and as structured JSON when `--json` or `--format` is specified.
- [ ] Pagination is supported via `--page` and `--limit` flags.
- [ ] The command exits with code 0 on success (including zero results) and non-zero on errors.
- [ ] Existing e2e tests for `search users` pass.

### Input Constraints

- [ ] The `query` positional argument is required. The CLI must error if no query is provided.
- [ ] The `query` string is trimmed by the server; if the trimmed result is empty, the server returns HTTP 422 with `"query required"` and the CLI surfaces this error.
- [ ] The query is URL-encoded before transmission (special characters `&`, `=`, `+`, `#`, `%`, `/`, `?`, unicode, emoji must be safe).
- [ ] There is no explicit maximum query length enforced by the CLI; however, the underlying HTTP URL length limit (~8,192 bytes in common practice) acts as a practical ceiling. Queries exceeding this limit should produce a clear HTTP error, not a silent truncation.
- [ ] The `--page` option must be a positive integer. Defaults to `1`. Values less than 1 are normalized to 1 by the server.
- [ ] The `--limit` option must be a positive integer. Defaults to `30`. The server caps this at `100`. Values less than 1 are normalized to 30. Values over 100 are silently capped to 100.

### Output Constraints

- [ ] Each result item must include: `id`, `username`, `display_name`, `avatar_url`.
- [ ] The structured output envelope must include: `items` (array), `total_count` (number), `page` (number), `per_page` (number).
- [ ] When `total_count` is 0, `items` must be an empty array (not null or omitted).
- [ ] The human-readable table output must show `username` and `display_name` at minimum.

### Search Behavior

- [ ] User search uses prefix matching. Searching "alic" must match the user "alice".
- [ ] Only active users (`is_active = TRUE`) are returned. Deactivated or banned users must never appear.
- [ ] Results are ranked by relevance (PostgreSQL `ts_rank`), with ties broken by user ID ascending.
- [ ] The search is case-insensitive.

### Edge Cases

- [ ] Query with only whitespace → 422 error (`"query required"`).
- [ ] Query that matches no users → 200 with `{ items: [], total_count: 0 }`.
- [ ] Query with special characters (e.g., `@`, `-`, `_`, `.`) → must not crash; returns results or empty set.
- [ ] Query with SQL injection attempts (e.g., `'; DROP TABLE users;--`) → safely parameterized; returns empty results.
- [ ] Duplicate usernames are impossible by DB constraint; no dedup logic is needed.
- [ ] Requesting `--page` beyond the last page → 200 with `{ items: [], total_count: <actual> }`.
- [ ] Non-numeric `--limit` or `--page` → the CLI framework (Zod) rejects the input before the request is sent.
- [ ] Server unreachable → CLI exits non-zero with a connection error message.
- [ ] Invalid or expired token → does not matter because user search does not require authentication; however, if a token is supplied and invalid, the request still succeeds since the `/api/search/users` endpoint does not call `getUser(c)`.

## Design

### CLI Command

**Invocation:**
```
codeplane search users <query> [--page <n>] [--limit <n>] [--json] [--format <format>]
```

**Positional arguments:**

| Argument | Type   | Required | Description                         |
|----------|--------|----------|-------------------------------------|
| `query`  | string | Yes      | The search query (username or name) |

**Options:**

| Option     | Type   | Default | Description                                     |
|------------|--------|---------|-------------------------------------------------|
| `--page`   | number | 1       | Page number for paginated results               |
| `--limit`  | number | 30      | Number of results per page (max 100)            |
| `--json`   | flag   | false   | Output raw JSON response                        |
| `--format` | string | toon    | Output format: `json`, `yaml`, `md`, `jsonl`, `toon` |

**Human-readable output (default):**

When `--json` / `--format` is not specified, the command outputs an aligned ASCII table:

```
USERNAME     DISPLAY NAME
---------    ---------------
alice        Alice Smith
alice-dev    Alice Developer
```

If no results are found:
```
No users found
```

**Structured output (`--json`):**

```json
{
  "items": [
    {
      "id": "123",
      "username": "alice",
      "display_name": "Alice Smith",
      "avatar_url": "https://example.com/avatars/alice.png"
    }
  ],
  "total_count": 1,
  "page": 1,
  "per_page": 30
}
```

The `--filter-output` / `--json fields` syntax is supported for field selection. For example, `codeplane search users alice --json username,display_name` returns only those fields per item.

**Exit codes:**

| Code | Meaning                                |
|------|----------------------------------------|
| 0    | Success (including zero results)       |
| 1    | API error (422 validation, 5xx, etc.)  |
| 1    | Network/connection error               |
| 1    | CLI argument validation error          |

### API Shape

**Endpoint:** `GET /api/search/users`

**Query parameters:**

| Parameter  | Type   | Required | Default | Max  | Description                    |
|------------|--------|----------|---------|------|--------------------------------|
| `q`        | string | Yes      | —       | —    | Search query                   |
| `page`     | int    | No       | 1       | —    | Page number (1-indexed)        |
| `limit`    | int    | No       | 30      | 100  | Results per page               |
| `cursor`   | string | No       | —       | —    | Cursor-based pagination offset |
| `per_page` | int    | No       | 30      | 100  | Legacy alias for `limit`       |

**Response:** `200 OK`

```json
{
  "items": [
    {
      "id": "string",
      "username": "string",
      "display_name": "string",
      "avatar_url": "string"
    }
  ],
  "total_count": 0,
  "page": 1,
  "per_page": 30
}
```

**Response headers:**
- `X-Total-Count`: total number of matching users (string integer).

**Error responses:**
- `400 Bad Request`: invalid `limit` value (non-numeric, negative).
- `422 Unprocessable Entity`: empty query after trimming.

### SDK Shape

The `SearchService.searchUsers(input: SearchUsersInput)` method in `@codeplane/sdk` is the authoritative implementation. It accepts `{ query: string, page: number, perPage: number }` and returns `UserSearchResultPage`.

The `SearchUsersInput` and `UserSearchResultPage` types are exported from `@codeplane/sdk` for consumption by any client.

### Documentation

The following end-user documentation must exist:

1. **CLI reference entry** for `codeplane search users`:
   - Synopsis, arguments, options, examples.
   - Example: `codeplane search users "alice"` — find users whose name or username contains "alice".
   - Example: `codeplane search users "alice" --json` — same, but output as JSON for scripting.
   - Example: `codeplane search users "dev" --limit 5 --page 2` — paginated discovery.
   - Note that authentication is not required for user search.

2. **API reference entry** for `GET /api/search/users`:
   - Query parameters, response schema, error codes.
   - Note that this endpoint does not require authentication.

3. **Search overview page** mentioning all four search types (repos, issues, code, users) with cross-links.

## Permissions & Security

### Authorization

| Role       | Access                                     |
|------------|--------------------------------------------|
| Anonymous  | ✅ Full access. User search is public.      |
| Read-Only  | ✅ Full access.                             |
| Member     | ✅ Full access.                             |
| Admin      | ✅ Full access.                             |
| Owner      | ✅ Full access.                             |

The `/api/search/users` endpoint does not call `getUser(c)`. It is one of the few endpoints that does not require authentication. This is by design: user discovery is a public directory operation.

### Rate Limiting

- The standard server-wide rate limiter applies to this endpoint.
- The endpoint must be rate-limited to prevent enumeration attacks. Recommended limits:
  - **Unauthenticated callers:** 30 requests per minute per IP.
  - **Authenticated callers:** 60 requests per minute per user.
- If rate limits are exceeded, the server should return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy and PII

- **Exposed fields:** `id`, `username`, `display_name`, `avatar_url`. These are intentionally public profile fields.
- **Not exposed:** email address, password hash, `is_admin`, `is_active`, `created_at`, `updated_at`, `bio` (bio is fetched from the DB but not returned to the API consumer), internal IDs beyond the public user ID.
- **Enumeration risk:** Because user search is unauthenticated and uses prefix matching, a determined attacker could enumerate all usernames by iterating single-character prefixes. Rate limiting is the primary mitigation. If this becomes a concern, consider requiring authentication or adding CAPTCHA for high-volume enumeration patterns.
- **Inactive user filtering:** Deactivated users (`is_active = FALSE`) are excluded at the database query level, preventing discovery of banned or removed accounts.

## Telemetry & Product Analytics

### Business Events

| Event Name           | Description                                    |
|----------------------|------------------------------------------------|
| `SearchUsersQueried` | Fired each time a user search query is executed |

### Event Properties

| Property         | Type   | Description                                         |
|------------------|--------|-----------------------------------------------------|
| `query`          | string | The search query text (truncated to 100 chars for privacy) |
| `query_length`   | number | Character length of the original query              |
| `result_count`   | number | Number of items returned on this page               |
| `total_count`    | number | Total number of matching users across all pages     |
| `page`           | number | Page number requested                               |
| `per_page`       | number | Results per page requested                          |
| `client`         | string | `cli`, `web`, `tui`, `api` — identifies the caller |
| `is_authenticated` | boolean | Whether the request included valid auth           |
| `response_time_ms` | number | Server-side response latency in milliseconds      |
| `is_empty_result`  | boolean | Whether `total_count` is 0                       |

### Funnel Metrics and Success Indicators

- **Search adoption rate:** Percentage of active CLI users who use `search users` at least once per week.
- **Zero-result rate:** Percentage of `SearchUsersQueried` events where `total_count` is 0. A high zero-result rate (> 40%) suggests the search index quality or user onboarding has issues.
- **Query-to-action conversion:** How often a `search users` query is followed within 5 minutes by an action involving a returned username (e.g., issue assignment, landing request reviewer, team add).
- **Pagination depth:** Average and P90 page number requested. If most users only see page 1, the ranking is effective.
- **Repeat search rate:** How often the same user searches again within 60 seconds with a different query, indicating the first result was unsatisfactory.

## Observability

### Logging Requirements

| Log Point                          | Level  | Structured Context                                                   |
|------------------------------------|--------|----------------------------------------------------------------------|
| Search request received            | INFO   | `{ endpoint: "search_users", query_length, page, limit, ip, user_id? }` |
| Empty query rejected               | WARN   | `{ endpoint: "search_users", error: "query_required", ip }`         |
| Invalid limit rejected             | WARN   | `{ endpoint: "search_users", error: "invalid_limit", raw_limit, ip }` |
| Search completed                   | INFO   | `{ endpoint: "search_users", query_length, total_count, result_count, duration_ms }` |
| Database query error               | ERROR  | `{ endpoint: "search_users", error: <message>, query_length, stack }` |
| Rate limit exceeded                | WARN   | `{ endpoint: "search_users", ip, user_id?, rate_limit_bucket }`     |

All logs must include the `request_id` from the middleware for correlation.

Sensitive data: the raw `query` string should NOT be logged at INFO level. Only `query_length` is logged. At DEBUG level, the full query may be logged for troubleshooting.

### Prometheus Metrics

| Metric                                          | Type      | Labels                              | Description                                    |
|-------------------------------------------------|-----------|-------------------------------------|------------------------------------------------|
| `codeplane_search_users_requests_total`         | Counter   | `status` (2xx, 4xx, 5xx)           | Total number of user search requests           |
| `codeplane_search_users_duration_seconds`       | Histogram | `status`                            | Latency distribution of user search requests   |
| `codeplane_search_users_results_total`          | Histogram | —                                   | Distribution of `total_count` per query        |
| `codeplane_search_users_empty_results_total`    | Counter   | —                                   | Requests returning zero results                |
| `codeplane_search_users_validation_errors_total`| Counter   | `error_type` (query_required, invalid_limit) | Validation errors                  |

### Alerts

#### Alert: `SearchUsersHighErrorRate`
- **Condition:** `rate(codeplane_search_users_requests_total{status="5xx"}[5m]) / rate(codeplane_search_users_requests_total[5m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check the server error logs filtered by `endpoint: "search_users"` and `request_id` for stack traces.
  2. Verify PostgreSQL connectivity and health (`SELECT 1` heartbeat).
  3. Check if the `users` table `search_vector` index is corrupted: `REINDEX INDEX users_search_vector_idx;`
  4. Check for recent schema migrations that may have altered the `users` table or `search_vector` column.
  5. If the issue is a query timeout, check `pg_stat_activity` for long-running queries on the `users` table.
  6. If the database is healthy, check if the Hono server process is OOM or CPU-saturated.
  7. Escalate to database or platform on-call if not resolvable within 15 minutes.

#### Alert: `SearchUsersHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_search_users_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check `pg_stat_user_tables` for the `users` table — look for sequential scans indicating a missing or invalidated index.
  2. Run `EXPLAIN ANALYZE` on the `searchUsersFTS` query with a sample query term to see if `ts_rank` is dominating execution time.
  3. Check if the `search_vector` GIN index on `users` needs a `VACUUM` or `REINDEX`.
  4. Check overall database load — high concurrent query counts can increase latency.
  5. If the table has grown significantly, consider whether the `simple` text search configuration is still appropriate or whether query optimization is needed.

#### Alert: `SearchUsersHighEmptyResultRate`
- **Condition:** `rate(codeplane_search_users_empty_results_total[1h]) / rate(codeplane_search_users_requests_total{status="2xx"}[1h]) > 0.6`
- **Severity:** Info
- **Runbook:**
  1. This is a product health signal, not necessarily an infrastructure issue.
  2. Check if the `search_vector` column is being populated on user creation/update — query `SELECT COUNT(*) FROM users WHERE search_vector IS NULL AND is_active = TRUE`.
  3. Check recent user creation flows to ensure the `search_vector` trigger is functioning.
  4. Review the most common query terms from analytics to determine if users are searching for terms that the current FTS configuration cannot match.
  5. Notify the product team if the rate sustains above 60% for more than 24 hours.

#### Alert: `SearchUsersRateLimitSpike`
- **Condition:** `rate(codeplane_search_users_requests_total{status="429"}[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Check the source IP addresses from logs for the rate-limited requests.
  2. Determine if this is a single IP performing enumeration or a legitimate burst (e.g., CI pipeline searching for users).
  3. If it is a single IP, consider adding it to a temporary blocklist.
  4. If it is a legitimate use case, evaluate whether the rate limit thresholds should be adjusted for authenticated callers.

### Error Cases and Failure Modes

| Error Case                         | HTTP Status | User-Facing Message            | Recovery                                      |
|------------------------------------|-------------|--------------------------------|-----------------------------------------------|
| Empty query after trim             | 422         | `"query required"`             | User provides a non-empty query               |
| Invalid limit (non-numeric)        | 400         | `"invalid limit value"`        | User provides a valid numeric limit           |
| Database connection failure        | 500         | `"internal server error"`      | Retry; check database health                  |
| FTS query parse failure            | 500         | `"internal server error"`      | Check query for unusual characters; file bug  |
| Server unreachable (CLI)           | N/A         | `"connection refused"` / similar | Verify API URL and server availability       |
| Timeout (server overloaded)        | 504/timeout | `"request timed out"`          | Retry with backoff; check server load         |

## Verification

### API Integration Tests

| Test ID | Test Description | Input | Expected Outcome |
|---------|-----------------|-------|------------------|
| API-USR-001 | Search users with valid query returns matching results | `GET /api/search/users?q=alice` | 200; `items` contains user with `username: "alice"` |
| API-USR-002 | Search users with prefix query returns prefix matches | `GET /api/search/users?q=alic` | 200; `items` contains user with `username: "alice"` |
| API-USR-003 | Search users with no matches returns empty items | `GET /api/search/users?q=zzzznonexistent999` | 200; `items: []`, `total_count: 0` |
| API-USR-004 | Search users with empty query returns 422 | `GET /api/search/users?q=` | 422; error body contains `"query required"` |
| API-USR-005 | Search users with whitespace-only query returns 422 | `GET /api/search/users?q=%20%20%20` | 422; error body contains `"query required"` |
| API-USR-006 | Search users with no `q` parameter returns 422 | `GET /api/search/users` | 422; error body contains `"query required"` |
| API-USR-007 | Search users respects `limit` parameter | `GET /api/search/users?q=a&limit=2` | 200; `items.length <= 2`, `per_page: 2` |
| API-USR-008 | Search users caps limit at 100 | `GET /api/search/users?q=a&limit=500` | 200; `per_page: 100` |
| API-USR-009 | Search users respects `page` parameter | `GET /api/search/users?q=a&page=2&limit=1` | 200; `page: 2`; results differ from page 1 (if total > 1) |
| API-USR-010 | Search users page beyond results returns empty items | `GET /api/search/users?q=alice&page=9999` | 200; `items: []`, `total_count >= 1` |
| API-USR-011 | Invalid limit returns 400 | `GET /api/search/users?q=alice&limit=abc` | 400; error about invalid limit |
| API-USR-012 | Search users returns X-Total-Count header | `GET /api/search/users?q=alice` | Response header `X-Total-Count` matches `total_count` in body |
| API-USR-013 | Search users does not require authentication | `GET /api/search/users?q=alice` (no auth header) | 200; returns results |
| API-USR-014 | Search users does not return inactive users | Create user, deactivate, then search | 200; deactivated user not in results |
| API-USR-015 | Search users result shape includes all required fields | `GET /api/search/users?q=alice` | Each item has `id`, `username`, `display_name`, `avatar_url` |
| API-USR-016 | Search users with special characters does not error | `GET /api/search/users?q=%26%3D%2B%23` | 200 (may return empty items, but no 500) |
| API-USR-017 | Search users with SQL injection attempt is safe | `GET /api/search/users?q=';DROP TABLE users;--` | 200; returns empty or unrelated results; no DB damage |
| API-USR-018 | Search users with unicode query | `GET /api/search/users?q=名前` | 200; either matches or returns empty |
| API-USR-019 | Search users with 200-character query succeeds | `GET /api/search/users?q=<200 char string>` | 200; query is processed without error |
| API-USR-020 | Search users with cursor-based pagination | `GET /api/search/users?q=a&cursor=0&limit=5` | 200; equivalent to page 1, limit 5 |
| API-USR-021 | Search users with legacy `per_page` parameter | `GET /api/search/users?q=a&page=1&per_page=10` | 200; `per_page: 10` |

### CLI End-to-End Tests

| Test ID | Test Description | Command | Expected Outcome |
|---------|-----------------|---------|------------------|
| CLI-USR-001 | Search users with valid query returns results | `codeplane search users alice --json` | Exit 0; JSON with `items` array containing `username: "alice"` |
| CLI-USR-002 | Search users with prefix match | `codeplane search users alic --json` | Exit 0; JSON with `items` containing `username: "alice"` |
| CLI-USR-003 | Search users with no match returns empty items | `codeplane search users zzzznotauser --json` | Exit 0; JSON `items: []`, `total_count: 0` |
| CLI-USR-004 | Search users with --page and --limit | `codeplane search users a --page 1 --limit 2 --json` | Exit 0; `items.length <= 2`, `page: 1`, `per_page: 2` |
| CLI-USR-005 | Search users with --limit exceeding max is capped | `codeplane search users a --limit 200 --json` | Exit 0; `per_page: 100` |
| CLI-USR-006 | Search users default format shows human-readable table | `codeplane search users alice` | Exit 0; stdout contains "alice" in a formatted table or listing |
| CLI-USR-007 | Search users --json returns valid JSON | `codeplane search users alice --json` | Exit 0; stdout is valid JSON with `items`, `total_count`, `page`, `per_page` |
| CLI-USR-008 | Search users missing query argument errors | `codeplane search users` | Exit non-zero; stderr contains usage or missing argument error |
| CLI-USR-009 | Search users with special characters in query | `codeplane search users "al@ice" --json` | Exit 0; returns results or empty items (no crash) |
| CLI-USR-010 | Search users with --format yaml produces YAML output | `codeplane search users alice --format yaml` | Exit 0; stdout is valid YAML |
| CLI-USR-011 | Search users without auth token still works | `codeplane search users alice --json` (with empty/no token) | Exit 0; returns results (user search is public) |
| CLI-USR-012 | Search users result items contain expected fields | `codeplane search users alice --json` | Each item in `items` has `id`, `username`, `display_name`, `avatar_url` |
| CLI-USR-013 | Search users with server unreachable exits non-zero | `CODEPLANE_API_URL=http://localhost:1 codeplane search users alice` | Exit non-zero; stderr contains connection error |
| CLI-USR-014 | Search users with very long query (200+ chars) | `codeplane search users "<200 char string>" --json` | Exit 0; query is processed (may return empty results) |
| CLI-USR-015 | Search users with page beyond results | `codeplane search users alice --page 9999 --json` | Exit 0; `items: []` |

### Playwright (Web UI) Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| UI-USR-001 | Global search with users tab shows user results | Navigate to global search, type "alice", switch to Users tab; see alice in results |
| UI-USR-002 | Global search with no matching users shows empty state | Search for "zzzznotauser"; Users tab shows "No users found" or equivalent |
| UI-USR-003 | Clicking a user result in search navigates to user profile | Click on "alice" result; URL changes to `/@alice` or `/users/alice` |

### Cross-Client Consistency Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| XCLNT-001 | CLI and API return identical result shapes for the same query | `codeplane search users alice --json` output matches raw `GET /api/search/users?q=alice` response |
| XCLNT-002 | CLI and API return identical total counts | `total_count` from CLI `--json` equals `X-Total-Count` header from direct API call |

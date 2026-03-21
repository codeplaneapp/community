# WORKFLOW_CACHE_STATS

Specification for WORKFLOW_CACHE_STATS.

## High-Level User POV

When working with workflow caches in Codeplane, developers need immediate visibility into how much cache storage their repository is consuming, what limits apply, and whether cache eviction pressure is approaching. The Workflow Cache Stats feature provides this at-a-glance intelligence across every Codeplane client surface.

From the web UI's workflow section, the cache management page displays a statistics banner at the top of the cache view showing the total number of finalized caches, the total storage consumed formatted in human-readable bytes, the repository's cache quota with a visual usage bar, the maximum allowed size for a single cache archive, the default time-to-live for cache entries, the timestamp of the most recent cache hit, and the latest expiration date among all active caches. This banner gives the developer an instant read on cache budget utilization and whether they need to clean up stale entries before their next workflow run fails due to quota exhaustion.

From the CLI, running `codeplane cache stats` against a repository returns the same aggregate information as structured JSON output, making it straightforward to integrate cache monitoring into scripts, dashboards, and CI health checks. The TUI's Workflow Cache View screen renders the same statistics in a terminal-native format with a visual usage bar rendered using Unicode block characters, color-coded by usage percentage — green for healthy usage, yellow as a warning threshold, and red when the repository is near or at its quota ceiling.

The statistics are always scoped to a single repository. They reflect only finalized cache entries — pending or in-progress uploads are excluded from the aggregates. When no caches exist, all numeric values return zero and timestamp fields return null, which clients render as "never" or "—" as appropriate. The feature is read-only and non-destructive: viewing stats never modifies cache state.

This feature serves three primary user needs. First, developers troubleshooting slow or failed workflow runs can quickly determine whether cache quota exhaustion contributed to the problem. Second, platform engineers monitoring repository health can incorporate cache stats into operational dashboards and alerting. Third, team leads reviewing repository settings can assess whether the configured quota, TTL, and archive-size limits are appropriate for their team's usage patterns.

## Acceptance Criteria

### Definition of Done

- [ ] The server exposes a `GET /api/repos/:owner/:repo/caches/stats` endpoint that returns aggregate cache statistics for the specified repository
- [ ] The response payload contains exactly these fields: `cache_count` (integer), `total_size_bytes` (integer), `repo_quota_bytes` (integer), `archive_max_bytes` (integer), `ttl_seconds` (integer), `last_hit_at` (ISO 8601 string or null), `max_expires_at` (ISO 8601 string or null)
- [ ] The CLI command `codeplane cache stats` calls the endpoint and prints the result
- [ ] The TUI Workflow Cache View screen displays the stats in a statistics banner
- [ ] The web UI cache management surface includes a stats banner consuming the same endpoint
- [ ] All clients render null timestamp fields gracefully (as "never", "—", or equivalent)

### Functional Constraints

- [ ] Statistics MUST only count caches with `status = 'finalized'`; pending, uploading, or failed caches are excluded
- [ ] `cache_count` MUST be a non-negative integer; zero when no finalized caches exist
- [ ] `total_size_bytes` MUST be a non-negative integer representing the sum of `object_size_bytes` across all finalized caches for the repository
- [ ] `repo_quota_bytes` MUST reflect the repository's configured or default cache quota limit and MUST be greater than zero
- [ ] `archive_max_bytes` MUST reflect the maximum allowed size for a single cache archive and MUST be greater than zero
- [ ] `ttl_seconds` MUST reflect the default cache entry TTL and MUST be greater than zero
- [ ] `last_hit_at` MUST be the most recent `last_hit_at` timestamp among all finalized caches, or null if no cache has ever been hit
- [ ] `max_expires_at` MUST be the latest `expires_at` timestamp among all finalized caches, or null if no finalized caches exist
- [ ] Timestamps MUST be returned as ISO 8601 UTC strings (e.g., `"2025-03-15T08:30:00Z"`)
- [ ] The endpoint MUST return a 404 if the repository does not exist
- [ ] The endpoint MUST return a 404 if the repository is private and the requester lacks read access
- [ ] The endpoint MUST return a 200 with zero-valued statistics if the repository exists but has no finalized caches
- [ ] `cache_count` MUST never be negative, even if underlying data is inconsistent
- [ ] `total_size_bytes` MUST never be negative

### Boundary Constraints

- [ ] `cache_count` can range from `0` to `2^63 - 1` (bigint); clients MUST handle large integers
- [ ] `total_size_bytes` can range from `0` to `2^63 - 1` (bigint); clients MUST render values up to petabyte scale without overflow
- [ ] `repo_quota_bytes` and `archive_max_bytes` are configuration-derived values; the server MUST NOT return zero or negative values for these fields
- [ ] `ttl_seconds` is configuration-derived; the server MUST NOT return zero or negative values
- [ ] `owner` path parameter: 1–39 characters, alphanumeric plus hyphens, must not start or end with a hyphen
- [ ] `repo` path parameter: 1–100 characters, alphanumeric plus hyphens, underscores, and dots; must not end with `.git`
- [ ] Invalid `owner` or `repo` path parameters MUST return 404, not 400

### Edge Cases

- [ ] Repository with zero caches: returns `{ cache_count: 0, total_size_bytes: 0, repo_quota_bytes: <configured>, archive_max_bytes: <configured>, ttl_seconds: <configured>, last_hit_at: null, max_expires_at: null }`
- [ ] Repository with only pending (non-finalized) caches: same as zero caches — pending entries excluded
- [ ] Repository with a single cache of 0 bytes (e.g., empty archive): `cache_count: 1`, `total_size_bytes: 0`
- [ ] Repository with extremely large total size (near quota): `total_size_bytes` approaches or equals `repo_quota_bytes`; clients show 100% usage
- [ ] All caches expired but still in the database: `max_expires_at` is in the past; `cache_count` includes expired but not-yet-evicted finalized entries
- [ ] No caches have ever been hit: `last_hit_at` is null
- [ ] Concurrent cache creation during stats query: stats reflect a consistent point-in-time snapshot; exact-moment consistency is not required but response must not contain partial/corrupt data
- [ ] Repository deleted between URL resolution and query execution: 404 response
- [ ] Rate limit exceeded: 429 with `Retry-After` header

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/caches/stats`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner (user or organization name) |
| `repo` | string | Repository name |

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | No (public repos) | `Bearer <token>` for authenticated access |
| `Cookie` | No | Session cookie alternative to Authorization |

**Success Response (200 OK):**
```json
{
  "cache_count": 47,
  "total_size_bytes": 149160345,
  "repo_quota_bytes": 1073741824,
  "archive_max_bytes": 52428800,
  "ttl_seconds": 604800,
  "last_hit_at": "2025-03-15T08:30:00Z",
  "max_expires_at": "2025-03-22T08:30:00Z"
}
```

**Empty Repository Response (200 OK):**
```json
{
  "cache_count": 0,
  "total_size_bytes": 0,
  "repo_quota_bytes": 1073741824,
  "archive_max_bytes": 52428800,
  "ttl_seconds": 604800,
  "last_hit_at": null,
  "max_expires_at": null
}
```

**Error Responses:**
| Status | Body | Condition |
|--------|------|-----------||
| 404 | `{ "message": "repository not found" }` | Repository does not exist or requester lacks access |
| 401 | `{ "message": "authentication required" }` | Private repo, no credentials provided |
| 429 | `{ "message": "rate limit exceeded" }` | Too many requests; includes `Retry-After` header |
| 500 | `{ "message": "internal server error" }` | Unexpected server failure |

**Route Path Note:** The canonical path MUST be `/api/repos/:owner/:repo/caches/stats`. The current server stub at `/api/repos/:owner/:repo/actions/cache/stats` must be updated to match the path consumed by the CLI and specified in the TUI design. A redirect or alias from the old path MAY be provided for backward compatibility during transition.

### SDK Shape

The `@codeplane/sdk` package provides the database query function and the service-layer method:

**Database function** (already implemented in `packages/sdk/src/db/workflow_caches_sql.ts`):
- `getWorkflowCacheStats(sql, { repositoryId })` → `{ cacheCount, totalSizeBytes, lastHitAt, maxExpiresAt } | null`

**Service method** (to be exposed on the workflow service):
- `workflowService.getCacheStats(repositoryId)` → `WorkflowCacheStatsResponse`
- The service is responsible for combining DB-sourced aggregate fields with configuration-sourced fields (`repo_quota_bytes`, `archive_max_bytes`, `ttl_seconds`)
- The service converts `cacheCount` and `totalSizeBytes` from string (bigint) to number
- The service formats `lastHitAt` and `maxExpiresAt` as ISO 8601 strings or null

### CLI Command

**Command:** `codeplane cache stats`

**Options:**
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | Auto-detected from CWD | Repository in `OWNER/REPO` format |

**Default output (human-readable):**
```
Repository: acme/webapp
Caches:     47
Used:       142.3 MB / 1.0 GB (14.2%)
Max archive: 50.0 MB
TTL:        7 days
Last hit:   2 minutes ago
Expires:    Mar 22, 2025
```

**JSON output (`--json`):**
Prints the raw API response object.

**Error behavior:**
- Repository not found: exit code 1, stderr message "Error: repository not found"
- Authentication required: exit code 1, stderr message "Error: authentication required"
- Rate limited: exit code 1, stderr message "Error: rate limited. Retry in {n}s"
- Network failure: exit code 1, stderr message "Error: could not connect to server"

### TUI UI

The TUI displays cache stats in a statistics banner at the top of the Workflow Cache View screen. The banner is the primary consumer of the `useWorkflowCacheStats(repo)` hook from `@codeplane/ui-core`.

**Statistics Banner Layout:**

At 120×40 (standard terminal):
```
📦 Caches: 47   Used: 142.3 MB / 1.0 GB  ████████████████░░░░ 78%
Max archive: 50 MB   TTL: 7d   Last hit: 2m ago
```

At 80×24 (minimum terminal):
```
📦 47  142.3 MB / 1.0 GB  ████████░░ 78%
```

At 200×60 (large terminal):
```
📦 Caches: 47   Used: 142.3 MB / 1.0 GB  ██████████████████████████████ 78%
Max archive: 50 MB   TTL: 7d   Last hit: 2m ago   Latest expiry: Mar 22
```

**Usage bar color coding:**
| Usage % | Color | ANSI Code |
|---------|-------|-----------|
| 0–74% | Green | 34 |
| 75–89% | Yellow | 178 |
| 90–100% | Red | 196 |

**No-color fallback:** `[###-------] 30%` using ASCII characters

**Loading state:** Spinner with "Loading stats…"

**Error state:** Stats banner shows "—" for all values; cache list can still render independently if its own fetch succeeds

**Null field rendering:**
- `last_hit_at: null` → "never"
- `max_expires_at: null` → "—"

### Web UI Design

The web UI cache management page (accessible under the repository's Workflows section) displays the same statistics banner above the cache entry list.

**Banner components:**
- Cache count badge: "47 caches"
- Storage usage meter: horizontal progress bar showing `total_size_bytes / repo_quota_bytes` with percentage label
- Usage meter color: green (0–74%), yellow (75–89%), red (90–100%)
- Configuration summary: "Max archive: 50 MB · TTL: 7 days"
- Temporal info: "Last hit: 2 minutes ago · Latest expiry: Mar 22, 2025"

**Empty state:** Banner shows "0 caches · 0 B used" with an empty progress bar

**Error state:** Banner shows a muted "Unable to load cache statistics" message with a retry link

**Responsive behavior:**
- On narrow viewports (<768px): banner stacks vertically — count + usage bar on first row, config on second row, temporal info on third row
- On wide viewports (≥768px): banner displays as a single horizontal strip with all information inline

### Documentation

The following end-user documentation should be written:

1. **CLI Reference** (`docs/cli-reference/commands.mdx`): Under the `cache stats` subcommand, document the `--repo` flag, the human-readable output format, the JSON output format, and all exit codes with their meanings.

2. **API Reference** (`docs/api-reference/workflow-caches.mdx`): Document `GET /api/repos/:owner/:repo/caches/stats` including path parameters, authentication requirements, response schema with field descriptions and types, and all error response codes.

3. **User Guide — Workflow Caches** (`docs/guides/workflow-caches.mdx`): Add a "Monitoring cache usage" section explaining how to check cache statistics from the web UI, CLI, and TUI, including interpreting the usage bar colors and understanding when to clear caches to avoid quota-related workflow failures.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View cache stats (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View cache stats (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |

Cache stats is a read-only endpoint. Any user with read access to the repository can view cache statistics. For public repositories, unauthenticated access is permitted. For private repositories, authentication is required and the user must have at least read-level access to the repository.

### Authentication Methods

All supported authentication methods grant access:
- Session cookies (`codeplane_session`)
- Personal access tokens (`Authorization: Bearer codeplane_...`)
- OAuth2 access tokens (`Authorization: Bearer codeplane_oat_...`)

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `GET /caches/stats` | 300 req/min | Per authenticated user per repository | Authenticated |
| `GET /caches/stats` | 60 req/min | Per IP | Unauthenticated |

When rate limited, the response includes:
- HTTP 429 status
- `Retry-After` header (seconds)
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers

### Data Privacy

- Cache statistics are aggregate numbers; no individual cache keys, contents, or user identifiers are exposed
- `last_hit_at` and `max_expires_at` are aggregate timestamps that do not identify specific users or cache entries
- `repo_quota_bytes`, `archive_max_bytes`, and `ttl_seconds` are configuration values, not user-generated data
- No PII is present in the response payload
- Response payloads MUST NOT include `repository_id` (internal database identifier); only the `owner/repo` slug appears in the URL path

### Input Validation

- `owner` and `repo` path parameters are validated against the standard repository resolution logic
- No request body or query parameters are accepted; any provided body MUST be ignored
- The endpoint MUST NOT accept mutation verbs (POST, PUT, PATCH, DELETE) — only GET

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workflow_cache_stats.viewed` | Successful stats response returned | `repo_owner`, `repo_name`, `cache_count`, `total_size_bytes`, `repo_quota_bytes`, `usage_percent`, `client` (web|cli|tui), `response_time_ms` |
| `workflow_cache_stats.empty` | Stats returned with `cache_count: 0` | `repo_owner`, `repo_name`, `client` |
| `workflow_cache_stats.high_usage` | Stats returned with usage ≥ 90% | `repo_owner`, `repo_name`, `cache_count`, `total_size_bytes`, `repo_quota_bytes`, `usage_percent`, `client` |
| `workflow_cache_stats.error` | Stats endpoint returns 4xx or 5xx | `repo_owner`, `repo_name`, `http_status`, `error_message`, `client` |
| `workflow_cache_stats.rate_limited` | 429 response returned | `repo_owner`, `repo_name`, `client`, `retry_after_seconds` |

### Common Event Properties (attached to all events)

- `timestamp` (ISO 8601)
- `actor_id` (user ID or "anonymous")
- `session_id`
- `client` (web, cli, tui, api)
- `client_version`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------|
| Daily unique repos with stats viewed | Trending upward | Feature adoption |
| Stats endpoint availability | ≥ 99.9% | Reliability |
| P95 response time | < 200ms | Performance |
| Error rate (5xx) | < 0.1% | Stability |
| High-usage alerts (≥90%) leading to cache clear within 1 hour | > 50% | Feature driving action |
| CLI vs Web vs TUI usage ratio | Tracked | Client adoption balance |

### Funnel Metrics

1. **Stats → Clear funnel**: What percentage of users who view stats with high usage (≥75%) subsequently perform a cache clear within the same session?
2. **Stats → Settings funnel**: What percentage of users who view stats navigate to repository cache configuration settings?
3. **Repeated viewing**: How often do users view stats for the same repository within a 24-hour window? (Indicates monitoring behavior vs. one-time check)

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------|
| `debug` | Cache stats query started | `repo_id`, `owner`, `repo` |
| `debug` | Cache stats query completed | `repo_id`, `owner`, `repo`, `cache_count`, `total_size_bytes`, `duration_ms` |
| `info` | Cache stats served | `repo_id`, `owner`, `repo`, `cache_count`, `total_size_bytes`, `usage_percent`, `status_code`, `duration_ms`, `actor_id` |
| `info` | High cache usage detected (≥90%) | `repo_id`, `owner`, `repo`, `cache_count`, `total_size_bytes`, `repo_quota_bytes`, `usage_percent` |
| `warn` | Cache stats query slow (>500ms) | `repo_id`, `owner`, `repo`, `duration_ms` |
| `warn` | Rate limit triggered | `actor_id`, `ip`, `owner`, `repo`, `remaining`, `retry_after` |
| `error` | Cache stats query failed | `repo_id`, `owner`, `repo`, `error_message`, `error_stack`, `duration_ms` |
| `error` | Repository resolution failed | `owner`, `repo`, `error_message` |

All log entries include: `request_id`, `timestamp`, `method` (GET), `path`, `actor_id` (or "anonymous"), `ip`.

### Prometheus Metrics

**Counters:**
| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_cache_stats_requests_total` | `status_code`, `owner`, `repo` | Total number of cache stats requests |
| `codeplane_workflow_cache_stats_errors_total` | `error_type` (db_error, not_found, auth_error, rate_limited) | Total cache stats errors by type |

**Histograms:**
| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_workflow_cache_stats_duration_seconds` | `owner`, `repo` | 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 | Latency distribution of cache stats queries |
| `codeplane_workflow_cache_stats_db_query_duration_seconds` | — | 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25 | Raw DB query latency |

**Gauges:**
| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_cache_usage_ratio` | `owner`, `repo` | Current cache usage as a ratio (0.0–1.0) of `total_size_bytes / repo_quota_bytes`, sampled on each stats request |

### Alerts

**Alert 1: High Error Rate**
- **Condition:** `rate(codeplane_workflow_cache_stats_errors_total{error_type!="not_found"}[5m]) / rate(codeplane_workflow_cache_stats_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_cache_stats_errors_total` by `error_type` to identify the dominant failure mode
  2. If `db_error`: check database connectivity and query performance via `codeplane_workflow_cache_stats_db_query_duration_seconds`. Look for connection pool exhaustion or lock contention in the `workflow_caches` table. Check database logs for errors matching `GetWorkflowCacheStats`.
  3. If `auth_error`: check if the auth middleware or token validation service is experiencing issues; correlate with `codeplane_auth_errors_total`.
  4. If `rate_limited`: verify rate limiting is not misconfigured; check for bot traffic or automated scraping.
  5. Check application logs filtered by `request_id` for the failing requests to identify stack traces.
  6. If the issue is database-related, consider restarting the application or scaling the database connection pool.

**Alert 2: High Latency**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_cache_stats_duration_seconds_bucket[5m])) > 0.5`
- **Severity:** Warning
- **Runbook:**
  1. Compare `codeplane_workflow_cache_stats_db_query_duration_seconds` P95 to total endpoint P95 to isolate whether latency is in the DB query or in request handling/serialization.
  2. If DB query is slow: check for missing indexes on `workflow_caches(repository_id, status)`. Run `EXPLAIN ANALYZE` on the `GetWorkflowCacheStats` query for the affected repository.
  3. Check if the affected repository has an unusually high number of cache entries (>10,000). Large repositories may benefit from materialized aggregates.
  4. Check for database connection pool saturation or high query concurrency.
  5. Consider adding a short-lived cache (30s TTL) for stats responses if the query is consistently slow.

**Alert 3: Sustained 5xx Error Spike**
- **Condition:** `sum(rate(codeplane_workflow_cache_stats_requests_total{status_code=~"5.."}[5m])) > 1`
- **Severity:** Critical
- **Runbook:**
  1. Immediately check application logs for error-level entries related to cache stats. Filter by `path=/api/repos/*/caches/stats` and `status_code>=500`.
  2. Check database health: connection count, replication lag, disk space.
  3. Check if the issue is isolated to specific repositories (check `owner`, `repo` labels on metrics).
  4. If isolated: the specific repository's cache data may be corrupted; inspect the `workflow_caches` table for that `repository_id`.
  5. If widespread: check for application deployment issues, OOM kills, or infrastructure problems.
  6. Escalate to database on-call if the issue appears to be data-layer.

### Error Cases and Failure Modes

| Error | HTTP Status | Behavior | Recovery |
|-------|-------------|----------|----------|
| Repository not found | 404 | Standard error response | User verifies repo exists |
| Private repo, no auth | 401 | Standard error response | User authenticates |
| Private repo, insufficient access | 404 | Same as not found (avoid leaking existence) | User requests access |
| Database query failure | 500 | Error logged, generic message returned | Automatic retry by client; investigate if persistent |
| Database timeout | 500 | Error logged with duration | Check DB health, query performance |
| Rate limit exceeded | 429 | Rate limit headers returned | Client waits `Retry-After` seconds |
| Invalid owner/repo format | 404 | Treated as not found | User corrects input |
| Null DB result (no row returned) | 200 | Return zero-valued response with config defaults | Normal behavior for empty repos |
| Integer overflow in sum | 500 | Logged; bigint prevents in practice | Investigate data anomalies |

## Verification

### API Integration Tests (`e2e/api/workflow-cache-stats.test.ts`)

- **API-STATS-001:** `GET /api/repos/:owner/:repo/caches/stats` on a new repo with no caches returns 200 with `cache_count: 0`, `total_size_bytes: 0`, `last_hit_at: null`, `max_expires_at: null`
- **API-STATS-002:** `GET /api/repos/:owner/:repo/caches/stats` on a new repo returns `repo_quota_bytes > 0`, `archive_max_bytes > 0`, `ttl_seconds > 0`
- **API-STATS-003:** After creating one finalized cache entry, `cache_count` is `1` and `total_size_bytes` matches the cache's `object_size_bytes`
- **API-STATS-004:** After creating multiple finalized cache entries, `cache_count` equals the number of entries and `total_size_bytes` equals the sum of all `object_size_bytes`
- **API-STATS-005:** Pending (non-finalized) cache entries are excluded from `cache_count` and `total_size_bytes`
- **API-STATS-006:** `last_hit_at` reflects the most recent `last_hit_at` among finalized caches
- **API-STATS-007:** `max_expires_at` reflects the latest `expires_at` among finalized caches
- **API-STATS-008:** When no caches have been hit, `last_hit_at` is `null`
- **API-STATS-009:** Expired but not-yet-evicted finalized caches are included in `cache_count` and `total_size_bytes`
- **API-STATS-010:** After clearing all caches, stats return to zero-valued state
- **API-STATS-011:** `GET` on a non-existent repository returns 404 with `{ "message": "repository not found" }`
- **API-STATS-012:** `GET` on a private repository without authentication returns 401
- **API-STATS-013:** `GET` on a private repository with a read-access token returns 200
- **API-STATS-014:** `GET` on a private repository with a token for a user without access returns 404
- **API-STATS-015:** `GET` on a public repository without authentication returns 200
- **API-STATS-016:** `POST /api/repos/:owner/:repo/caches/stats` returns 404 or 405 (method not allowed)
- **API-STATS-017:** Response `Content-Type` is `application/json`
- **API-STATS-018:** Response body conforms to the exact schema: all required fields present, no extra fields
- **API-STATS-019:** `cache_count` and `total_size_bytes` are integers, not strings
- **API-STATS-020:** `last_hit_at` and `max_expires_at` are either null or valid ISO 8601 date strings
- **API-STATS-021:** `repo_quota_bytes`, `archive_max_bytes`, and `ttl_seconds` are positive integers
- **API-STATS-022:** Stats endpoint handles repository with a single cache of 0 bytes (`cache_count: 1`, `total_size_bytes: 0`)
- **API-STATS-023:** Stats endpoint handles maximum valid cache count (create 500 caches, verify `cache_count: 500`)
- **API-STATS-024:** Rate limiting: send 301 GET requests in rapid succession; the 301st returns 429 with `Retry-After` header
- **API-STATS-025:** Rate limiting response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
- **API-STATS-026:** Invalid `owner` (e.g., `---`) returns 404
- **API-STATS-027:** Invalid `repo` (e.g., empty string) returns 404
- **API-STATS-028:** `owner` at maximum length (39 characters) returns valid response for existing repo
- **API-STATS-029:** `repo` at maximum length (100 characters) returns valid response for existing repo

### CLI Integration Tests (`e2e/cli/workflow-cache.test.ts`)

- **CLI-STATS-001:** `codeplane cache stats --repo owner/repo --json` exits 0 and returns valid JSON with all expected fields
- **CLI-STATS-002:** `cache_count` is a number type in JSON output
- **CLI-STATS-003:** `total_size_bytes` is a number type in JSON output
- **CLI-STATS-004:** `repo_quota_bytes` is a positive number in JSON output
- **CLI-STATS-005:** `ttl_seconds` is a positive number in JSON output
- **CLI-STATS-006:** `last_hit_at` is null or a string in JSON output
- **CLI-STATS-007:** `max_expires_at` is null or a string in JSON output
- **CLI-STATS-008:** `codeplane cache stats` without `--repo` infers repository from the current working directory (when inside a repo)
- **CLI-STATS-009:** `codeplane cache stats --repo nonexistent/repo` exits 1 with stderr containing "not found"
- **CLI-STATS-010:** `codeplane cache stats` without auth returns exit 1 with stderr containing "authentication" (for private repos)
- **CLI-STATS-011:** Human-readable output (no `--json`) includes "Caches:", "Used:", and quota information
- **CLI-STATS-012:** JSON output for a repo with zero caches has `cache_count: 0` and `total_size_bytes: 0`
- **CLI-STATS-013:** JSON field filtering (`--json cache_count total_size_bytes`) returns only the requested fields

### TUI Integration Tests (`e2e/tui/workflows.test.ts`)

- **TUI-STATS-001:** Workflow Cache View screen renders statistics banner on load
- **TUI-STATS-002:** Stats banner shows cache count, used/quota, and usage percentage
- **TUI-STATS-003:** Usage bar renders with correct color for 0% usage (green)
- **TUI-STATS-004:** Usage bar renders with correct color for 78% usage (green)
- **TUI-STATS-005:** Usage bar renders with correct color for 85% usage (yellow)
- **TUI-STATS-006:** Usage bar renders with correct color for 95% usage (red)
- **TUI-STATS-007:** Usage bar renders with correct color for 100% usage (red)
- **TUI-STATS-008:** Stats banner at 80×24 shows single-line compressed format
- **TUI-STATS-009:** Stats banner at 120×40 shows full two-line format
- **TUI-STATS-010:** Stats banner at 200×60 shows three-line format with TTL and archive max
- **TUI-STATS-011:** Null `last_hit_at` renders as "never" in stats banner
- **TUI-STATS-012:** Null `max_expires_at` renders as "—" in stats banner
- **TUI-STATS-013:** Stats banner updates after cache deletion (count and size decrease)
- **TUI-STATS-014:** Stats banner updates after bulk clear (count drops to 0)
- **TUI-STATS-015:** Stats fetch failure shows "—" for all stats values; cache list still renders
- **TUI-STATS-016:** `R` key refreshes stats banner data
- **TUI-STATS-017:** Loading state shows spinner with "Loading stats…"
- **TUI-STATS-018:** No-color terminal renders ASCII usage bar `[###-------] 30%`

### Playwright Web UI Tests (`e2e/web/workflow-cache-stats.test.ts`)

- **WEB-STATS-001:** Cache management page displays statistics banner above cache list
- **WEB-STATS-002:** Stats banner shows cache count, storage usage meter, and percentage
- **WEB-STATS-003:** Usage meter is green for repositories at <75% usage
- **WEB-STATS-004:** Usage meter is yellow for repositories at 75–89% usage
- **WEB-STATS-005:** Usage meter is red for repositories at ≥90% usage
- **WEB-STATS-006:** Configuration summary shows "Max archive" and "TTL" values
- **WEB-STATS-007:** Temporal section shows "Last hit" and "Latest expiry"
- **WEB-STATS-008:** Empty repo shows "0 caches · 0 B used" in the banner
- **WEB-STATS-009:** Null `last_hit_at` renders as "never"
- **WEB-STATS-010:** Stats banner updates after clearing caches from the same page
- **WEB-STATS-011:** Stats endpoint failure shows "Unable to load cache statistics" with retry link
- **WEB-STATS-012:** Clicking retry after stats failure re-fetches and displays stats
- **WEB-STATS-013:** Responsive layout — narrow viewport stacks banner vertically
- **WEB-STATS-014:** Responsive layout — wide viewport shows banner as single horizontal strip
- **WEB-STATS-015:** Anonymous user can view stats on a public repository
- **WEB-STATS-016:** Anonymous user cannot view stats on a private repository (redirected to login)

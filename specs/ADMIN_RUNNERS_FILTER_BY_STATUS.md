# ADMIN_RUNNERS_FILTER_BY_STATUS

Specification for ADMIN_RUNNERS_FILTER_BY_STATUS.

## High-Level User POV

As a Codeplane instance administrator, I need to filter the runner pool list by runner status so I can quickly focus on the runners that matter most for a given operational task — whether that is identifying idle capacity, investigating busy runners that may be stuck, monitoring runners that are gracefully draining, or auditing runners that have gone offline.

The runner pool is the backbone of workflow execution in Codeplane. When I open the admin runners view — in the web console, the CLI, or the TUI — I currently see every runner in a single flat list. On a busy instance with dozens or hundreds of runners, this list becomes unwieldy. I need to narrow the view to just the runners in a particular state so I can take the right action without manually scanning through irrelevant rows.

With status filtering, I can select one of the four runner states — idle, busy, draining, or offline — and the list immediately narrows to show only the runners in that state. The total count updates to reflect the filtered result, so I know at a glance how many runners are in the chosen state. When I clear the filter, I see the full pool again. The filter is available across all clients: as a query parameter in the API, a dropdown or tab bar in the web UI, a flag in the CLI, and a selectable filter in the TUI.

This feature is especially valuable during incident response. If workflow runs are queueing up, I can filter to "idle" to see if any capacity is available. If I suspect a runner is stuck, I can filter to "busy" and sort by heartbeat age to find the problem. If I am performing a maintenance window, I can filter to "draining" to track which runners are still winding down. And after an outage, I can filter to "offline" to understand the scope of what went down.

The filter composes naturally with pagination: I can page through a filtered view just as I would page through the full list. The total count always reflects the active filter, so pagination controls remain accurate.

## Acceptance Criteria

### Definition of Done

- [ ] The `GET /api/admin/runners` endpoint accepts an optional `status` query parameter that restricts results to runners matching the specified status.
- [ ] The `X-Total-Count` response header reflects the filtered total when a status filter is active.
- [ ] The CLI `admin runner list` command supports a `--status` option that passes the filter to the API.
- [ ] The web admin console runner list includes a status filter control that narrows the displayed runners.
- [ ] The TUI admin runners screen includes a status filter selector.
- [ ] When no `status` parameter is provided, the endpoint returns all runners (backward-compatible).
- [ ] Invalid status values produce a clear 400 error response.
- [ ] All existing admin runner tests continue to pass.
- [ ] New tests comprehensively cover all status filter values, edge cases, and cross-client consistency.

### Functional Constraints

- [ ] Valid status filter values are exactly: `idle`, `busy`, `draining`, `offline`.
- [ ] Status values are case-sensitive. `Idle`, `IDLE`, and `Idle ` are not valid.
- [ ] An empty string or absent `status` parameter means "return all runners" (no filter applied).
- [ ] When a valid status is provided, only runners whose `status` field exactly matches are returned.
- [ ] The `X-Total-Count` header must equal the total number of runners matching the filter, not the total number of all runners.
- [ ] Pagination (page, per_page) composes with the status filter: `?status=idle&page=2&per_page=10` returns the second page of idle runners only.
- [ ] The response body format is identical whether or not a filter is applied — the same JSON array of runner objects.
- [ ] The response field set for each runner object is unchanged: `id`, `name`, `status`, `last_heartbeat_at`, `metadata`, `created_at`, `updated_at`.
- [ ] When the filter is active and no runners match, the endpoint returns an empty array `[]` with `X-Total-Count: 0`.

### Edge Cases

- [ ] An unrecognized status value (e.g., `?status=running`, `?status=active`, `?status=foo`) returns a `400 Bad Request` with an error message listing valid values.
- [ ] A status value with leading/trailing whitespace (e.g., `?status= idle `) is rejected as invalid — no automatic trimming.
- [ ] Multiple `status` parameters in the query string (e.g., `?status=idle&status=busy`) — only the first value is used.
- [ ] A status value of `null` (literal string "null") is rejected as invalid.
- [ ] A status value of an empty string (`?status=`) is treated as "no filter" (return all runners).
- [ ] When the database has zero runners of any status, the endpoint returns an empty array with `X-Total-Count: 0` regardless of filter.
- [ ] When filtering by a valid status that currently has zero runners (e.g., no draining runners exist), the endpoint returns an empty array with `X-Total-Count: 0`.
- [ ] Pagination edge cases with filtering: `?status=idle&page=99999` returns an empty array with the correct `X-Total-Count` for idle runners.

### Boundary Constraints

- [ ] `status` parameter: string, exactly one of `idle`, `busy`, `draining`, `offline`, or absent/empty.
- [ ] `status` parameter maximum length: reject any value longer than 20 characters with 400 (prevents abuse).
- [ ] `page` parameter: integer, minimum effective value 1, no maximum (returns empty array when past last page).
- [ ] `per_page` parameter: integer, minimum effective value 1, maximum 50.
- [ ] Runner `name` field in response: string, 1–255 characters.
- [ ] Runner `status` field in response: always one of `idle`, `busy`, `draining`, `offline`.
- [ ] Runner `last_heartbeat_at` in response: ISO 8601 date string or `null`.
- [ ] Runner `metadata` in response: JSON object or `null`.

### CLI Parameter Alignment

- [ ] The CLI `--status` option value is passed directly as the `status` query parameter to the API.
- [ ] The CLI `--limit` option maps to the API `per_page` query parameter.
- [ ] The CLI `--page` option maps to the API `page` query parameter.
- [ ] The CLI validates the `--status` value locally before making the API call and emits a helpful error if invalid.

## Design

### API Shape

**Endpoint:** `GET /api/admin/runners`

**Authentication:** Required. Caller must have `isAdmin = true`.

**Query Parameters:**

| Parameter  | Type    | Default | Constraints                                        | Description                            |
|------------|---------|---------|----------------------------------------------------|----------------------------------------|
| `page`     | integer | `1`     | Min 1                                              | Page number (1-indexed)                |
| `per_page` | integer | `30`    | Min 1, Max 50                                      | Number of results per page             |
| `status`   | string  | (none)  | One of: `idle`, `busy`, `draining`, `offline`, or absent | Filter runners by status          |

**Response Headers:**

| Header          | Type   | Description                                         |
|-----------------|--------|-----------------------------------------------------|
| `X-Total-Count` | string | Total number of runners matching the active filter   |

**Success Response:** `200 OK`

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "runner-us-east-01",
    "status": "idle",
    "last_heartbeat_at": "2026-03-22T10:15:30Z",
    "metadata": { "region": "us-east-1", "version": "1.2.0" },
    "created_at": "2026-01-10T08:00:00Z",
    "updated_at": "2026-03-22T10:15:30Z"
  }
]
```

**Error Responses:**

| Status | Condition                                 | Body                                                                                          |
|--------|-------------------------------------------|-----------------------------------------------------------------------------------------------|
| `400`  | Invalid status value                      | `{ "error": "invalid status filter: must be one of idle, busy, draining, offline" }`          |
| `401`  | No authentication provided                | `{ "error": "authentication required" }`                                                      |
| `401`  | Authenticated but not admin               | `{ "error": "admin access required" }`                                                        |
| `429`  | Rate limit exceeded                       | `{ "error": "rate limit exceeded" }` with `Retry-After` header                                |
| `500`  | Internal server error                     | `{ "error": "<message>" }`                                                                    |

**Notes:**
- The response body is a JSON array, not wrapped in an envelope object.
- When no `status` parameter is provided (or it is an empty string), all runners are returned regardless of status.
- The `status` query parameter enables this feature to layer on top of the existing `ADMIN_RUNNERS_LIST` behavior without breaking backward compatibility.

### SDK Shape

The `@codeplane/sdk` package must expose an admin runner service method:

```typescript
type RunnerStatus = "idle" | "busy" | "draining" | "offline";

interface AdminListRunnersInput {
  page: number;           // 1-indexed
  perPage: number;        // clamped to [1, 50]
  statusFilter?: string;  // one of RunnerStatus or empty string
}

interface AdminRunnerRow {
  id: string;
  name: string;
  status: RunnerStatus;
  lastHeartbeatAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminListRunnersResult {
  items: AdminRunnerRow[];
  total: number;
}
```

The service method validates `statusFilter` against the allowed set (or empty/absent), computes `offset = (page - 1) * perPage`, delegates to `listRunners` and `countRunners` database functions, and returns the combined result. The route handler maps `AdminRunnerRow` to the snake_case JSON response format.

### CLI Command

**Command:** `codeplane admin runner list`

**Options:**

| Flag       | Type    | Default | Description                                       |
|------------|---------|---------|---------------------------------------------------|
| `--page`   | number  | `1`     | Page number                                       |
| `--limit`  | number  | `30`    | Results per page (max 50)                         |
| `--status` | string  | (none)  | Filter by status: idle, busy, draining, offline   |
| `--json`   | flag    | off     | Output raw JSON                                   |

**Default (table) output:**

```
ID                                     NAME                STATUS    LAST HEARTBEAT         CREATED
a1b2c3d4-e5f6-7890-abcd-ef1234567890  runner-us-east-01   idle      2 minutes ago          2026-01-10
b2c3d4e5-f6a7-8901-bcde-f12345678901  runner-us-west-01   idle      5 minutes ago          2026-01-12

Showing 1–2 of 2 idle runners (page 1)
```

When no status filter is active, the summary line reads "Showing 1–N of M runners (page P)" without mentioning a status.

**Error output for invalid status:**

```
Error: invalid --status value "running". Must be one of: idle, busy, draining, offline
```

**Exit codes:**
- `0` — success
- `1` — validation error (invalid status value)
- `1` — authentication or authorization failure
- `1` — network or server error

### Web UI Design

**Route:** `/admin/runners` (within the admin console layout)

**Status Filter Control:**

- A horizontal segmented button group (pill tabs) positioned above the data table, below the page title.
- Segments: **All** | **Idle** | **Busy** | **Draining** | **Offline**
- Each segment shows a count badge: e.g., "Idle (12)", "Busy (3)", "Offline (7)".
- The "All" segment shows the total unfiltered count.
- Selecting a segment immediately re-fetches the runner list with the corresponding `status` parameter.
- The "All" segment is selected by default on initial page load.
- The active filter is reflected in the URL query string: `/admin/runners?status=idle&page=1` for shareability and back-button support.
- Count badges are fetched in parallel on page load to populate the filter bar before the user interacts.

**Table Updates:**

- When a filter is active, the page title subtitle updates to reflect the filtered count: "3 busy runners" instead of "25 runners".
- Pagination resets to page 1 when the filter changes.
- The table shows only runners matching the active filter.

**Color-coded status badges in the table:**

| Status     | Badge Color     | Icon  |
|------------|-----------------|-------|
| `idle`     | Green / success | ●     |
| `busy`     | Blue / info     | ◉     |
| `draining` | Yellow / warning| ◐     |
| `offline`  | Gray / muted    | ○     |

**Empty state with filter active:** Contextual message: "No idle runners found" (using the active filter name).

**Interactions:**
- Clicking a filter segment triggers: set URL `status` param → reset `page` to 1 → fetch filtered list.
- Browser back/forward correctly restores the previous filter and page state.
- The per-page selector and page navigation work within the active filter context.

### TUI UI

**Screen:** Accessible via the TUI command palette or an admin menu entry.

**Filter Control:**

- A horizontal tab-style selector at the top: `[All] [Idle] [Busy] [Draining] [Offline]`
- Navigate between tabs with `Tab` / `Shift+Tab` or `h` / `l` keys.
- Each tab label includes the count when available: `Idle (12)`.
- Selecting a tab re-fetches the runner list with the corresponding filter.

**Vim-style navigation:**
- `j` / `k` to navigate within the filtered runner list.
- `Tab` / `Shift+Tab` to switch between status filter tabs.
- `Enter` to view runner detail.
- `r` to refresh the current view.

### Documentation

End-user documentation must include:

- **Admin Guide — Runner Pool Management**: A section explaining runner statuses (idle, busy, draining, offline), how to use the status filter to isolate runners in each state, and common operational scenarios (finding idle capacity, investigating stuck runners, tracking a maintenance window, auditing after an outage).
- **CLI Reference — `codeplane admin runner list`**: A reference entry documenting the `--status` option with valid values, example invocations for each status, and how the filter composes with `--page` and `--limit`.
- **API Reference — `GET /api/admin/runners`**: Updated reference documenting the `status` query parameter, its valid values, the validation behavior for invalid values, and the interaction with pagination and the `X-Total-Count` header.

## Permissions & Security

### Authorization

| Role                              | Access           |
|-----------------------------------|------------------|
| Site Admin                        | Full access      |
| Authenticated (non-admin)         | Denied (401)     |
| Anonymous / Unauthenticated       | Denied (401)     |
| PAT with `admin` or `read:admin`  | Full access      |
| PAT without admin scope           | Denied (401)     |

- The `requireAdmin()` guard checks both that a valid session/token exists AND that the user has `isAdmin = true`.
- The status filter parameter does not change or relax authorization requirements. All authorization checks occur before the filter is evaluated.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **60 requests per minute** per authenticated user applies to all `/api/admin/*` routes.
- The status filter does not consume any additional rate-limit budget beyond the single request cost.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.
- Web UI count-badge prefetch requests (up to 5 parallel calls to populate filter counts) count toward the rate limit. The web UI should debounce or batch these calls if approaching the limit.

### Data Privacy & PII

- Runner metadata may contain infrastructure details (region, IP addresses, version strings). This is operational data, not user PII, but it should still be restricted to admin-only access.
- Runner names may encode infrastructure topology (e.g., `runner-us-east-01`). This is acceptable for admin consumption but must not be exposed to non-admin users.
- The status filter parameter value itself is not sensitive but should be included in audit logging for operational traceability.
- No additional PII exposure is introduced by the status filter feature beyond what the base runner list already exposes.

## Telemetry & Product Analytics

### Business Events

| Event Name                          | Trigger                                                        | Properties                                                                                                   |
|-------------------------------------|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `AdminRunnersListViewed`            | Admin successfully retrieves the runner list                   | `admin_user_id`, `page`, `per_page`, `status_filter` (or "all"), `total_runners`, `result_count`, `client`   |
| `AdminRunnersFilterApplied`         | Admin applies or changes the status filter (non-"all")         | `admin_user_id`, `status_filter`, `result_count`, `client`                                                   |
| `AdminRunnersFilterCleared`         | Admin clears the filter (returns to "all")                     | `admin_user_id`, `previous_filter`, `client`                                                                 |
| `AdminRunnersFilterInvalidAttempt`  | Admin provides an invalid status value                         | `admin_user_id`, `attempted_value`, `client`                                                                 |
| `AdminRunnersListDenied`            | Non-admin attempts to access the runner list                   | `user_id` (if authenticated), `reason` ("not_authenticated" or "not_admin"), `client`                        |

### Funnel Metrics

- **Filter adoption rate**: What percentage of admin runner list views include a status filter? Target: >40% within 30 days of launch. A low adoption rate may indicate the filter is not discoverable or not useful.
- **Filter distribution**: Which statuses are filtered most frequently? Expect `busy` and `offline` to dominate during incident response, `idle` during capacity planning. If `draining` is never used, consider whether the draining concept needs better documentation.
- **Filter-to-action conversion**: What percentage of filtered views lead to a follow-up admin action (e.g., terminating a runner, viewing runner detail)? This measures whether filtering helps admins find actionable information.
- **Client distribution**: Track which clients (web, CLI, TUI, raw API) use the status filter. This informs UX investment priority.

### Success Indicators

- Admins who use the status filter reach their target runner faster (measured by reduced time-on-page or reduced pagination depth compared to unfiltered views).
- The base runner list endpoint receives fewer unfiltered requests over time as admins learn to filter first.
- Support tickets or operational confusion related to "can't find my runner" decrease.

## Observability

### Logging

| Log Event                            | Level  | Structured Context                                                                                | When                                               |
|--------------------------------------|--------|---------------------------------------------------------------------------------------------------|----------------------------------------------------|
| `admin.runners.list.success`         | `info` | `admin_id`, `page`, `per_page`, `status_filter`, `total`, `result_count`, `duration_ms`           | Successful filtered runner list retrieval            |
| `admin.runners.list.denied`          | `warn` | `user_id` (nullable), `reason`, `ip`, `user_agent`                                               | Unauthorized access attempt                          |
| `admin.runners.list.invalid_filter`  | `warn` | `admin_id`, `attempted_value`, `ip`, `user_agent`                                                 | Request with invalid status filter value             |
| `admin.runners.list.error`           | `error`| `admin_id`, `page`, `per_page`, `status_filter`, `error_message`, `stack_trace`                   | Internal error during runner list retrieval          |
| `admin.runners.list.slow`            | `warn` | `admin_id`, `page`, `per_page`, `status_filter`, `duration_ms`                                    | Response time exceeds 2000ms threshold               |

### Prometheus Metrics

| Metric Name                                         | Type      | Labels                                          | Description                                                      |
|-----------------------------------------------------|-----------|------------------------------------------------|------------------------------------------------------------------|
| `codeplane_admin_runners_list_requests_total`        | Counter   | `status_code` (2xx, 4xx, 5xx), `filter` (idle, busy, draining, offline, all) | Total admin runner list requests by response status and filter   |
| `codeplane_admin_runners_list_duration_ms`           | Histogram | `filter`                                       | Latency distribution (buckets: 50, 100, 250, 500, 1000, 2500, 5000ms)  |
| `codeplane_admin_runners_list_denied_total`          | Counter   | `reason` (not_authenticated, not_admin)        | Denied access attempts                                            |
| `codeplane_admin_runners_list_invalid_filter_total`  | Counter   | —                                              | Requests with invalid status filter values                        |
| `codeplane_runners_by_status`                        | Gauge     | `status` (idle, busy, draining, offline)       | Current count of runners per status (updated on list call or periodic scrape) |

### Alerts

#### Alert: `AdminRunnersListHighErrorRate`
- **Condition:** `rate(codeplane_admin_runners_list_requests_total{status_code="5xx"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `admin.runners.list.error` entries — look for database connection failures or query timeouts.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check whether the `runner_pool` table exists and has the expected schema. A missing or altered table after a migration could cause query failures.
  4. Check for lock contention on the `runner_pool` table — concurrent `claimAvailableRunner` operations use `FOR UPDATE SKIP LOCKED` which should not block reads, but verify there is no unexpected table-level lock.
  5. If the database is healthy, check for memory pressure or resource exhaustion on the API server process.
  6. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `AdminRunnersListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_admin_runners_list_duration_ms_bucket[5m])) > 2000`
- **Severity:** Warning
- **Runbook:**
  1. Check `admin.runners.list.slow` log entries for the affected time period. Note which `status_filter` values are slow.
  2. Check database query performance for the `listRunners` and `countRunners` queries. The `WHERE status = $1` clause should use an index on the `status` column.
  3. If the unfiltered query is slow but filtered queries are fast, the issue is likely the `COUNT(*)` on the full table. Consider adding periodic caching for the total count.
  4. Check for table bloat — a high ratio of dead tuples in `runner_pool` may slow sequential scans.
  5. Run `ANALYZE runner_pool` to update query planner statistics if they are stale.

#### Alert: `AdminRunnersFilterInvalidSpike`
- **Condition:** `rate(codeplane_admin_runners_list_invalid_filter_total[5m]) > 3`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.runners.list.invalid_filter` log entries for the `attempted_value` to understand what clients are sending.
  2. If the invalid values are close to valid ones (e.g., "Idle" instead of "idle"), check whether a client version was deployed with incorrect casing. Coordinate with the client team to fix.
  3. If the values are random or adversarial, check whether rate limiting is correctly applied to the source.
  4. No immediate action required unless the pattern suggests systematic misconfiguration.

#### Alert: `RunnerPoolStatusImbalance`
- **Condition:** `codeplane_runners_by_status{status="offline"} / (sum(codeplane_runners_by_status) > 0) > 0.5` (more than 50% of runners offline)
- **Severity:** Critical
- **Runbook:**
  1. This alert fires when over half the runner pool is offline. Check whether a deployment or infrastructure event caused mass runner disconnection.
  2. Run `codeplane admin runner list --status offline` to identify the affected runners and their last heartbeat times.
  3. Check the runner infrastructure (container orchestrator, VM host) for failures.
  4. If runners were intentionally decommissioned, acknowledge and silence the alert.
  5. If unexpected, trigger the runner recovery runbook to restart or replace affected runners.
  6. Verify workflow runs are not stuck in queued state due to insufficient capacity.

### Error Cases and Failure Modes

| Failure Mode                                | Symptom                              | Behavior                                                       |
|---------------------------------------------|--------------------------------------|----------------------------------------------------------------|
| Database unreachable                        | 500 Internal Server Error            | Returns error JSON, logs `admin.runners.list.error`            |
| Database query timeout                      | 500 or slow response                 | Returns error JSON after timeout, logs slow query               |
| Invalid session/token                       | 401 Unauthorized                     | Returns error JSON, no database query executed                  |
| Admin flag revoked mid-session              | 401 Unauthorized on next request     | Session/token still valid but `isAdmin` check fails             |
| Invalid status filter value                 | 400 Bad Request                      | Returns error JSON with valid values listed, logs invalid filter |
| Status column index missing                 | Slow filtered queries                | Functional but degraded; logged as slow query                   |
| Runner pool table empty                     | Empty array returned                 | Normal behavior, `X-Total-Count: 0`                             |
| Concurrent runner status changes            | Slight count inconsistency           | Normal eventual consistency; list and count are separate queries |
| Very large runner pool (10,000+ runners)    | Potential slow COUNT(*)              | Pagination still works; consider count caching                  |

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                              | Expected Result                                                        |
|----------|-----------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| API-01   | `GET /api/admin/runners` without `status` param returns all runners (backward compatibility)  | Status 200, body is array, includes runners of all statuses            |
| API-02   | `GET /api/admin/runners?status=idle` returns only idle runners                                | Status 200, every item has `status: "idle"`                            |
| API-03   | `GET /api/admin/runners?status=busy` returns only busy runners                                | Status 200, every item has `status: "busy"`                            |
| API-04   | `GET /api/admin/runners?status=draining` returns only draining runners                        | Status 200, every item has `status: "draining"`                        |
| API-05   | `GET /api/admin/runners?status=offline` returns only offline runners                          | Status 200, every item has `status: "offline"`                         |
| API-06   | `X-Total-Count` with `?status=idle` matches the number of idle runners (not all runners)      | Header value equals count of idle runners from separate verification   |
| API-07   | `X-Total-Count` without status filter equals total runner count                               | Header value equals sum of all per-status counts                       |
| API-08   | `?status=idle&page=1&per_page=2` with 5 idle runners returns exactly 2                        | Array length = 2, all items have `status: "idle"`                      |
| API-09   | `?status=idle&page=3&per_page=2` with 5 idle runners returns exactly 1                        | Array length = 1, `status: "idle"`                                     |
| API-10   | `?status=idle&page=99999` returns empty array with correct idle total in header               | Array length = 0, `X-Total-Count` matches idle count                   |
| API-11   | `?status=running` (invalid value) returns 400 with descriptive error                          | Status 400, body contains "idle, busy, draining, offline"              |
| API-12   | `?status=IDLE` (wrong case) returns 400                                                       | Status 400, body contains valid values                                 |
| API-13   | `?status=Busy` (mixed case) returns 400                                                       | Status 400                                                             |
| API-14   | `?status= idle` (leading space) returns 400                                                   | Status 400                                                             |
| API-15   | `?status=idle ` (trailing space) returns 400                                                  | Status 400                                                             |
| API-16   | `?status=null` (literal string) returns 400                                                   | Status 400                                                             |
| API-17   | `?status=` (empty string) returns all runners (same as no filter)                             | Status 200, includes all statuses                                      |
| API-18   | `?status=aaaaaaaaaaaaaaaaaaaaaaaaa` (>20 chars) returns 400                                   | Status 400, rejects overly long values                                 |
| API-19   | Response items contain all required fields: `id`, `name`, `status`, `last_heartbeat_at`, `metadata`, `created_at`, `updated_at` | Every item has all specified keys |
| API-20   | `?status=idle` with no idle runners returns empty array and `X-Total-Count: 0`                | Status 200, array length = 0, header = "0"                             |
| API-21   | Paginating through all pages of `?status=idle` yields all idle runners, no duplicates         | Union of all pages = full idle set, no ID appears twice                |
| API-22   | Request without authentication and `?status=idle` returns 401                                 | Status 401, body contains "authentication required"                    |
| API-23   | Request with valid non-admin token and `?status=idle` returns 401                             | Status 401, body contains "admin access required"                      |
| API-24   | Request with expired/invalid token and `?status=idle` returns 401                             | Status 401                                                             |
| API-25   | Request with PAT having `read:admin` scope and `?status=idle` succeeds                        | Status 200                                                             |
| API-26   | Request with PAT lacking admin scope and `?status=idle` is denied                             | Status 401                                                             |
| API-27   | Filter-then-unfilter consistency: sum of counts for each individual status equals unfiltered total | `count(idle) + count(busy) + count(draining) + count(offline) == count(all)` |
| API-28   | Concurrent status change between list and count queries does not cause a server error          | Status 200 (counts may be slightly inconsistent, but no 500)           |
| API-29   | `?per_page=50&status=idle` (maximum valid per_page with filter) succeeds                      | Status 200, array length ≤ 50, all idle                                |
| API-30   | `?per_page=51&status=idle` (exceeds max) is clamped to 50                                     | Status 200, array length ≤ 50                                          |
| API-31   | `created_at` and `updated_at` in filtered results are valid ISO 8601 date strings             | `new Date(field).toISOString()` does not throw                         |
| API-32   | `last_heartbeat_at` in filtered results is null or a valid ISO 8601 date string               | Null or valid date parse                                               |

### CLI E2E Tests

| Test ID  | Test Description                                                                              | Expected Result                                                        |
|----------|-----------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| CLI-01   | `codeplane admin runner list --status idle` returns only idle runners                         | Exit code 0, all items have `status: "idle"`                           |
| CLI-02   | `codeplane admin runner list --status busy` returns only busy runners                         | Exit code 0, all items have `status: "busy"`                           |
| CLI-03   | `codeplane admin runner list --status draining` returns only draining runners                 | Exit code 0, all items have `status: "draining"`                       |
| CLI-04   | `codeplane admin runner list --status offline` returns only offline runners                   | Exit code 0, all items have `status: "offline"`                        |
| CLI-05   | `codeplane admin runner list` without --status returns all runners                            | Exit code 0, includes mixed statuses                                   |
| CLI-06   | `codeplane admin runner list --status idle --json` outputs valid JSON                         | `JSON.parse(stdout)` succeeds, all items have `status: "idle"`         |
| CLI-07   | `codeplane admin runner list --status idle --page 1 --limit 5` returns ≤ 5 idle runners      | Exit code 0, array length ≤ 5                                          |
| CLI-08   | `codeplane admin runner list --status idle --limit 50` (max valid) succeeds                   | Exit code 0, array length ≤ 50                                         |
| CLI-09   | `codeplane admin runner list --status idle --limit 51` is clamped to 50                       | Exit code 0, array length ≤ 50                                         |
| CLI-10   | `codeplane admin runner list --status running` (invalid) fails with helpful error              | Exit code ≠ 0, stderr contains valid values                            |
| CLI-11   | `codeplane admin runner list --status IDLE` (wrong case) fails with helpful error              | Exit code ≠ 0, stderr contains valid values                            |
| CLI-12   | `codeplane admin runner list --status idle` with non-admin token fails                        | Exit code ≠ 0, stderr contains error message                           |
| CLI-13   | `codeplane admin runner list --status idle` without any token fails                           | Exit code ≠ 0, stderr contains error message                           |
| CLI-14   | `codeplane admin runner list --status idle --page 99999` returns empty result                 | Exit code 0, array length = 0                                          |
| CLI-15   | Table output with --status includes status-specific summary: "Showing 1–N of M idle runners"  | stdout contains "idle runners"                                         |
| CLI-16   | `--limit` is correctly translated to `per_page` API parameter with status filter active       | Verified via response size matching the limit                          |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                              | Expected Result                                                        |
|----------|-----------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| UI-01    | Admin navigates to `/admin/runners` and sees the status filter segmented control              | Filter bar with "All", "Idle", "Busy", "Draining", "Offline" visible   |
| UI-02    | "All" filter is selected by default on initial load                                           | "All" segment has active/selected styling                              |
| UI-03    | Clicking "Idle" filter shows only idle runners in the table                                   | Table rows all have idle status badge, "All" is deselected             |
| UI-04    | Clicking "Busy" filter shows only busy runners                                                | Table rows all have busy status badge                                  |
| UI-05    | Clicking "Draining" filter shows only draining runners                                        | Table rows all have draining status badge                              |
| UI-06    | Clicking "Offline" filter shows only offline runners                                          | Table rows all have offline status badge                               |
| UI-07    | Clicking "All" after a filter is active restores the full list                                | Table includes runners of all statuses                                 |
| UI-08    | Page title subtitle updates to reflect filtered count (e.g., "3 busy runners")                | Subtitle text matches filter and count                                 |
| UI-09    | URL query string includes `status=idle` when idle filter is active                            | `window.location.search` contains `status=idle`                        |
| UI-10    | Navigating directly to `/admin/runners?status=busy` loads with busy filter pre-selected       | "Busy" segment has active styling, table shows only busy runners       |
| UI-11    | Pagination resets to page 1 when filter changes                                               | Page indicator shows "Page 1" after filter change                      |
| UI-12    | Pagination works within filtered view: next page shows more runners of same status            | All rows on page 2 have the filtered status                            |
| UI-13    | Filter count badges display correct counts for each status                                    | Badge numbers match actual runner counts per status                    |
| UI-14    | Empty state with active filter shows contextual message (e.g., "No draining runners found")   | Empty state message includes the filter name                           |
| UI-15    | Browser back button restores previous filter state                                            | Filter and table state match the previous URL                          |
| UI-16    | Status badges in table are color-coded: green (idle), blue (busy), yellow (draining), gray (offline) | Badge colors match specification                                |
| UI-17    | Non-admin user navigating to `/admin/runners?status=idle` sees access denied                  | Error message or redirect                                              |
| UI-18    | Loading state is shown when filter changes trigger a new fetch                                | Skeleton rows visible during transition                                |
| UI-19    | Network error during filtered request shows retry banner                                      | Error banner visible, retry restores current filter                    |
| UI-20    | Per-page selector works correctly with active filter                                          | Row count respects per-page within filtered set                        |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                              | Expected Result                                                        |
|----------|-----------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| CC-01    | API `?status=idle&page=1&per_page=10` returns the same runner IDs as CLI `--status idle --page 1 --limit 10` | ID sets are identical                                      |
| CC-02    | `X-Total-Count` from API `?status=busy` matches the total displayed in the web UI "Busy" filter badge | Values are equal                                               |
| CC-03    | Sum of `X-Total-Count` for each individual status filter equals `X-Total-Count` with no filter | `idle_count + busy_count + draining_count + offline_count == total`   |
| CC-04    | Invalid status values produce consistent error messages across API and CLI                     | Both mention the valid values: idle, busy, draining, offline           |

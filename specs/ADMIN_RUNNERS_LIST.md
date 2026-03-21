# ADMIN_RUNNERS_LIST

Specification for ADMIN_RUNNERS_LIST.

## High-Level User POV

As a Codeplane instance administrator, I need to see every runner registered in the runner pool so I can understand the health and capacity of my workflow execution infrastructure at a glance.

The Admin Runners List is the primary runner inventory surface within the Codeplane admin console. When I navigate to the admin area — whether through the web UI, CLI, or TUI — I see a paginated table of all runners that have ever registered with the instance. Each row shows me the runner's identity (its unique name), its current operational status (idle, busy, draining, or offline), when it last sent a heartbeat, any attached metadata, and when it was first registered.

This list is essential for operational visibility. As an admin, I can immediately see how many runners are available for work, how many are currently occupied, which runners are gracefully draining, and which have gone offline. This lets me make informed decisions about scaling, investigating stuck workflow runs, or diagnosing infrastructure issues without resorting to direct database queries.

I can filter the list by status to focus on specific operational states — for example, viewing only offline runners to identify hosts that need attention, or viewing only busy runners to understand current load. Pagination keeps the list usable even on instances with large runner pools.

The experience must be consistent across all Codeplane clients: the web admin console, the `codeplane admin runner list` CLI command, and the TUI admin screen should all surface the same data in a format appropriate for their medium.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated admin user can retrieve a paginated list of all runners in the runner pool.
- [ ] The list endpoint is backed by a real service implementation that delegates to the `listRunners` and `countRunners` database functions (not a stub returning empty arrays).
- [ ] The response includes the total runner count (optionally filtered by status) for pagination affordances.
- [ ] The optional `status` query parameter filters runners by their operational status (`idle`, `busy`, `draining`, `offline`).
- [ ] The CLI `admin runner list` command displays the runner list and supports `--page`, `--limit`, `--status`, and `--json` options.
- [ ] The web admin console displays the runner list in a table with pagination controls and status filter.
- [ ] Non-admin authenticated users receive a 401 Unauthorized response.
- [ ] Unauthenticated requests receive a 401 Unauthorized response.
- [ ] All existing e2e tests pass, and new tests cover the full specification.

### Functional Constraints

- [ ] The endpoint returns runners in all statuses unless the `status` filter is applied.
- [ ] Runners are ordered by ID descending (most recently registered first — matches the existing `listRunnersQuery` ordering).
- [ ] Pagination uses page-based pagination with `page` (1-indexed) and `per_page` query parameters.
- [ ] Default page is `1`. Default `per_page` is `30`.
- [ ] Maximum `per_page` is `50`. Values above 50 are clamped to 50.
- [ ] The `X-Total-Count` response header contains the total number of runners (matching the applied status filter) as a string integer.
- [ ] Each runner object in the response array contains at minimum: `id`, `name`, `status`, `last_heartbeat_at`, `metadata`, `created_at`, `updated_at`.
- [ ] The `status` field is one of: `idle`, `busy`, `draining`, `offline`.
- [ ] The `last_heartbeat_at` field may be `null` for runners that have never sent a heartbeat.
- [ ] The `metadata` field is a JSON object or `null`. It may contain arbitrary key-value pairs supplied by the runner on registration.
- [ ] The `id` field is a UUID string.
- [ ] When the `status` query parameter is provided but not one of the four valid values, the server returns a 400 Bad Request error with a descriptive message.

### Edge Cases

- [ ] When `page` exceeds the total number of pages, the endpoint returns an empty array with the correct `X-Total-Count`.
- [ ] When `page` is `0` or negative, the server treats it as page `1`.
- [ ] When `per_page` is `0` or negative, the server uses the default value of `30`.
- [ ] When `per_page` exceeds `50`, the server clamps it to `50`.
- [ ] When no runners exist in the pool, the endpoint returns an empty array with `X-Total-Count: 0`.
- [ ] When filtering by a status that has zero matching runners, the endpoint returns an empty array with `X-Total-Count: 0`.
- [ ] When `page` or `per_page` query parameters are non-numeric strings, the server uses default values rather than returning a 400.
- [ ] The response is a JSON array — not wrapped in an object — consistent with the existing admin route pattern.
- [ ] When `status` filter is an empty string, it is treated as "no filter" (all statuses).
- [ ] Runners with identical `last_heartbeat_at` timestamps are still deterministically ordered by `id` descending.

### Boundary Constraints

- [ ] `page` parameter: integer, minimum effective value 1, no maximum (returns empty array when past last page).
- [ ] `per_page` parameter: integer, minimum effective value 1, maximum 50.
- [ ] `status` parameter: string, must be one of `idle`, `busy`, `draining`, `offline`, or omitted/empty for no filter.
- [ ] `id` field in response: UUID string, 36 characters.
- [ ] `name` field in response: string, 1–255 characters, unique across the runner pool.
- [ ] `metadata` field in response: JSON object or null, max serialized size 64 KB.
- [ ] `last_heartbeat_at`, `created_at`, `updated_at` fields in response: ISO 8601 date strings or null (for `last_heartbeat_at` only).

### CLI Parameter Alignment

- [ ] The CLI `--limit` option maps to the API `per_page` query parameter. The CLI must translate `limit` to `per_page` when making the API request.
- [ ] The CLI `--status` option maps to the API `status` query parameter.

## Design

### API Shape

**Endpoint:** `GET /api/admin/runners`

**Authentication:** Required. Caller must have `isAdmin = true`.

**Query Parameters:**

| Parameter  | Type    | Default | Constraints                          | Description                              |
|------------|---------|---------|--------------------------------------|------------------------------------------|
| `page`     | integer | `1`     | Min 1                                | Page number (1-indexed)                  |
| `per_page` | integer | `30`    | Min 1, Max 50                        | Number of results per page               |
| `status`   | string  | (none)  | `idle`, `busy`, `draining`, `offline` | Optional filter by runner status         |

**Response Headers:**

| Header          | Type   | Description                                       |
|-----------------|--------|---------------------------------------------------|
| `X-Total-Count` | string | Total number of runners matching the status filter |

**Success Response:** `200 OK`

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "runner-us-east-1",
    "status": "idle",
    "last_heartbeat_at": "2026-03-22T10:45:00Z",
    "metadata": {
      "region": "us-east-1",
      "version": "1.2.3",
      "capacity": 4
    },
    "created_at": "2026-01-15T09:00:00Z",
    "updated_at": "2026-03-22T10:45:00Z"
  }
]
```

**Error Responses:**

| Status | Condition                         | Body                                            |
|--------|-----------------------------------|-------------------------------------------------|
| `400`  | Invalid `status` filter value     | `{ "error": "invalid status filter, must be one of: idle, busy, draining, offline" }` |
| `401`  | No authentication provided        | `{ "error": "authentication required" }`        |
| `401`  | Authenticated but not admin       | `{ "error": "admin access required" }`          |
| `500`  | Internal server error             | `{ "error": "<message>" }`                      |

**Notes:**
- The response body is a JSON array, not wrapped in an envelope object.
- The `metadata` field is passed through as-is from the database. Consumers should treat it as opaque JSON.
- The route handler must map camelCase database fields (`lastHeartbeatAt`, `createdAt`, `updatedAt`) to snake_case JSON response fields (`last_heartbeat_at`, `created_at`, `updated_at`).

### SDK Shape

The `@codeplane/sdk` package must expose an admin runner service method:

```typescript
interface AdminListRunnersInput {
  page: number;         // 1-indexed
  perPage: number;      // clamped to [1, 50]
  statusFilter: string; // empty string = no filter
}

interface AdminRunnerRow {
  id: string;
  name: string;
  status: string;
  lastHeartbeatAt: Date | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminListRunnersResult {
  items: AdminRunnerRow[];
  total: number;
}
```

The service method computes `offset = (page - 1) * perPage`, delegates to the existing `listRunners` and `countRunners` database functions from `runner_pool_sql.ts`, and returns the combined result. The route handler maps `AdminRunnerRow` to the snake_case JSON response format.

### CLI Command

**Command:** `codeplane admin runner list`

**Options:**

| Flag       | Type    | Default | Description                                |
|------------|---------|---------|---------------------------------------------|
| `--page`   | number  | `1`     | Page number                                |
| `--limit`  | number  | `30`    | Results per page (max 50)                  |
| `--status` | string  | (none)  | Filter by status (idle/busy/draining/offline) |
| `--json`   | flag    | off     | Output raw JSON                            |

**Default (table) output:**

```
ID                                     NAME               STATUS    LAST HEARTBEAT        CREATED
a1b2c3d4-e5f6-7890-abcd-ef1234567890  runner-us-east-1   idle      2 minutes ago         2026-01-15
b2c3d4e5-f6a7-8901-bcde-f12345678901  runner-eu-west-1   busy      2 minutes ago         2026-02-01
c3d4e5f6-a7b8-9012-cdef-123456789012  runner-ap-south-1  offline   3 days ago            2026-03-01

Showing 1–3 of 3 runners (page 1)
```

**Filtered output example:**

```
$ codeplane admin runner list --status offline

ID                                     NAME               STATUS    LAST HEARTBEAT        CREATED
c3d4e5f6-a7b8-9012-cdef-123456789012  runner-ap-south-1  offline   3 days ago            2026-03-01

Showing 1–1 of 1 runners (page 1, status: offline)
```

**JSON output:** Outputs the raw JSON array from the API response.

**Error output:**

```
Error: admin access required (401)
```

**Exit codes:**
- `0` — success
- `1` — authentication or authorization failure
- `1` — network or server error

### Web UI Design

**Route:** `/admin/runners` (within the admin console layout)

**Layout:**
- Page title: "Runners" with a subtitle showing the total count (e.g., "12 runners").
- A status filter bar above the table with toggle buttons for: All, Idle, Busy, Draining, Offline. Each filter option shows its count badge (e.g., "Idle (5)").
- A data table with columns:
  - **Name** — the runner's registered name, displayed as a monospace string.
  - **Status** — a color-coded status badge: green for `idle`, amber for `busy`, blue for `draining`, red/gray for `offline`.
  - **Last Heartbeat** — relative time (e.g., "2 minutes ago") with a tooltip showing the absolute ISO timestamp. Shows "Never" for null values.
  - **Metadata** — a truncated preview of the metadata JSON. Expandable on click or hover for full JSON view.
  - **Registered** — relative time with tooltip for absolute `created_at` timestamp.
- Pagination controls at the bottom: Previous / Next buttons, page indicator ("Page 1 of 3"), and a per-page selector dropdown (10, 20, 30, 50).
- Empty state: "No runners registered." when there are zero runners total, or "No runners match the selected filter." when a status filter yields zero results.
- Loading state: Skeleton rows matching the table column layout.
- Error state: Inline error banner with retry action.

**Interactions:**
- Clicking a status filter option updates the table and URL query string.
- The per-page selector and page navigation trigger new API requests.
- The current page, per_page, and status filter are reflected in the URL query string for shareability and back-button support (e.g., `/admin/runners?status=idle&page=2&per_page=10`).
- Hovering over a metadata cell shows the full JSON payload in a tooltip or popover.

**Status badge color mapping:**
| Status    | Background | Text   |
|-----------|-----------|--------|
| idle      | Green-100 | Green  |
| busy      | Amber-100 | Amber  |
| draining  | Blue-100  | Blue   |
| offline   | Gray-100  | Gray   |

### TUI UI

**Screen:** Accessible via the TUI command palette or a top-level admin menu entry (when the current user is an admin).

**Layout:**
- Header: "Admin > Runners" with the total count.
- Status filter: Tab-style selectors at the top: `[All] [Idle] [Busy] [Draining] [Offline]`. Navigate with left/right arrows or number keys.
- Scrollable list of runner rows, each showing: name (truncated to fit), status (with color), last heartbeat (relative), metadata preview (first key-value pair or "—" if null).
- Vim-style `j`/`k` navigation and Enter to view expanded runner detail.
- `f` to cycle through status filters.
- `r` to refresh the runner list.
- Pagination: Automatic loading of the next page when scrolling past the bottom of the current page, or explicit "Load more" action.

### Documentation

End-user documentation must include:

- **Admin Guide — Managing Runners**: A section in the admin guide that explains what runners are, how to interpret runner statuses (idle, busy, draining, offline), how heartbeat-based health detection works, how pagination and filtering work, and what the metadata field may contain.
- **CLI Reference — `codeplane admin runner list`**: A reference entry documenting the command, its options (`--page`, `--limit`, `--status`, `--json`), output formats, and example invocations including filtered queries and JSON output.
- **API Reference — `GET /api/admin/runners`**: A reference entry documenting the endpoint, authentication requirements, query parameters, response schema, response headers, and error codes.

## Permissions & Security

### Authorization

| Role                            | Access           |
|---------------------------------|------------------|
| Site Admin                      | Full access      |
| Authenticated (non-admin)       | Denied (401)     |
| Anonymous / Unauthenticated     | Denied (401)     |

- The `requireAdmin()` guard checks both that a valid session/token exists AND that the user has `isAdmin = true`.
- PAT-scoped access: Tokens with `admin` or `read:admin` scopes should grant access. Tokens without admin scopes should be denied.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **60 requests per minute** per authenticated user should be applied to all `/api/admin/*` routes to prevent abuse or accidental tight polling loops.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- The runner list does not directly contain PII. However, the `metadata` field is opaque JSON supplied by runners at registration and could theoretically contain infrastructure details (IP addresses, hostnames, cloud account identifiers).
- Admin access to the runner list should be logged in the audit trail (see Observability).
- The `metadata` field should not be exposed to non-admin users through any other API surface.
- Runner names should not encode secrets or credentials. The specification does not enforce this at the API layer, but documentation should warn runner operators against embedding sensitive data in runner names or metadata.

## Telemetry & Product Analytics

### Business Events

| Event Name                  | Trigger                                         | Properties                                                                                                    |
|-----------------------------|------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| `AdminRunnersListViewed`    | Admin successfully retrieves the runner list   | `admin_user_id`, `page`, `per_page`, `status_filter`, `total_runners`, `result_count`, `client` (web/cli/tui/api) |
| `AdminRunnersListFiltered`  | Admin applies a status filter to the list      | `admin_user_id`, `status_filter`, `filtered_count`, `client`                                                   |
| `AdminRunnersListDenied`    | Non-admin attempts to access the runner list   | `user_id` (if authenticated), `reason` ("not_authenticated" or "not_admin"), `client`                          |

### Funnel Metrics

- **Runner operations funnel**: Track whether admins who view the runner list subsequently take actions on runners (when runner management features are added). This baseline usage data informs future feature investment.
- **Filter usage**: Track how often admins use the status filter versus viewing all runners. High filter usage suggests admins have large runner pools and need targeted views.
- **Client distribution**: Track which clients (web, CLI, TUI, raw API) are used to access the admin runner list. This informs investment priority across surfaces.
- **Page depth**: Track average maximum page number accessed per session. If admins consistently page deeply, the per-page default may be too low or a search/sort feature is needed.

### Success Indicators

- The stub service is replaced by a real implementation returning actual runner data.
- E2E tests pass with non-empty runner arrays when runners are registered.
- Admin users on self-hosted instances are able to monitor their runner pool without resorting to direct database queries.
- Filter usage grows over time as runner pools scale.

## Observability

### Logging

| Log Event                       | Level   | Structured Context                                                            | When                                          |
|---------------------------------|---------|-------------------------------------------------------------------------------|-----------------------------------------------|
| `admin.runners.list.success`    | `info`  | `admin_id`, `page`, `per_page`, `status_filter`, `total`, `result_count`, `duration_ms` | Successful runner list retrieval              |
| `admin.runners.list.denied`     | `warn`  | `user_id` (nullable), `reason`, `ip`, `user_agent`                             | Unauthorized access attempt                   |
| `admin.runners.list.error`      | `error` | `admin_id`, `page`, `per_page`, `status_filter`, `error_message`, `stack_trace`| Internal error during runner list retrieval   |
| `admin.runners.list.slow`       | `warn`  | `admin_id`, `page`, `per_page`, `status_filter`, `duration_ms`                 | Response time exceeds 2000ms threshold        |
| `admin.runners.list.bad_filter` | `info`  | `admin_id`, `invalid_status_value`, `ip`                                       | Invalid status filter value provided          |

### Prometheus Metrics

| Metric Name                                    | Type      | Labels                                         | Description                                              |
|------------------------------------------------|-----------|-------------------------------------------------|----------------------------------------------------------|
| `codeplane_admin_runners_list_requests_total`  | Counter   | `status` (2xx, 4xx, 5xx)                       | Total admin runner list requests by response status      |
| `codeplane_admin_runners_list_duration_ms`     | Histogram | `status`                                        | Latency distribution (buckets: 50, 100, 250, 500, 1000, 2500, 5000ms) |
| `codeplane_admin_runners_list_denied_total`    | Counter   | `reason` (not_authenticated, not_admin)         | Denied access attempts                                   |
| `codeplane_runner_pool_total`                  | Gauge     | `status` (idle, busy, draining, offline)        | Current runner count by status (updated on list call or periodic scrape) |

### Alerts

#### Alert: `AdminRunnersListHighErrorRate`
- **Condition:** `rate(codeplane_admin_runners_list_requests_total{status="5xx"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `admin.runners.list.error` entries — look for database connection failures or query timeouts.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check for recent schema migrations that may have broken the `runner_pool` table query.
  4. Verify the `runner_pool` table exists and has the expected columns (`id`, `name`, `status`, `last_heartbeat_at`, `metadata`, `created_at`, `updated_at`).
  5. If the database is healthy, check for lock contention — the `runner_pool` table is written to frequently by heartbeat and claim operations, which could cause read contention under high load.
  6. Escalate to the database team if the issue is a query performance regression.

#### Alert: `AdminRunnersListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_admin_runners_list_duration_ms_bucket[5m])) > 2000`
- **Severity:** Warning
- **Runbook:**
  1. Check `admin.runners.list.slow` log entries for the affected time period.
  2. Check database query performance — the `ListRunners` query uses `ORDER BY id DESC` with `LIMIT/OFFSET`. Ensure an index exists on the `runner_pool.id` column (primary key should suffice).
  3. If filtering by status, check that the `status` column has an index or that the `runner_pool` table is small enough for a sequential scan to be acceptable.
  4. Look for lock contention from concurrent `ClaimAvailableRunner` calls, which use `FOR UPDATE SKIP LOCKED` and may hold row-level locks.
  5. If persistent, consider adding a composite index on `(status, id)` for filtered queries.

#### Alert: `AdminRunnersListDeniedSpike`
- **Condition:** `rate(codeplane_admin_runners_list_denied_total[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.runners.list.denied` log entries for source IPs and user agents.
  2. Determine if the spike is from a misconfigured integration or a single user repeatedly trying to access admin endpoints.
  3. If the source is a single IP or user, consider whether this represents a credential stuffing or privilege escalation attempt.
  4. If from a known integration, assist the integration owner in configuring correct admin credentials.
  5. No immediate action required unless the pattern suggests an active attack.

#### Alert: `RunnerPoolAllOffline`
- **Condition:** `codeplane_runner_pool_total{status="idle"} == 0 AND codeplane_runner_pool_total{status="busy"} == 0 AND codeplane_runner_pool_total{status="draining"} == 0 AND codeplane_runner_pool_total{status="offline"} > 0`
- **Severity:** Critical
- **Runbook:**
  1. All runners in the pool are offline — no workflow runs can be dispatched.
  2. Check if this is expected (e.g., during a planned maintenance window or infrastructure migration).
  3. Verify runner host health: check whether runner processes are running and able to reach the Codeplane server.
  4. Check `CleanupStaleRunners` job history — a misconfigured stale interval could be marking healthy runners as offline.
  5. Check network connectivity between runner hosts and the Codeplane server (heartbeat requests must be reaching the API).
  6. If runners are running but not registering heartbeats, check for TLS certificate issues, DNS resolution failures, or firewall changes.
  7. Restart runner processes if necessary and monitor for heartbeat recovery.

### Error Cases and Failure Modes

| Failure Mode                         | Symptom                               | Behavior                                              |
|--------------------------------------|---------------------------------------|-------------------------------------------------------|
| Database unreachable                 | 500 Internal Server Error             | Returns error JSON, logs `admin.runners.list.error`   |
| Database query timeout               | 500 or slow response                  | Returns error JSON after timeout, logs slow query      |
| Invalid session/token                | 401 Unauthorized                      | Returns error JSON, no database query executed         |
| Admin flag revoked mid-session        | 401 Unauthorized on next request      | Session/token still valid but `isAdmin` check fails    |
| Invalid status filter value          | 400 Bad Request                       | Returns error JSON with descriptive message            |
| Extremely large runner pool          | Slow `COUNT(*)` query                 | Pagination still works; consider caching total count   |
| Corrupt runner row (null name)       | Potential serialization error         | Row should be skipped or return with placeholder       |
| Runner metadata exceeds expected size | Slow serialization                   | Large metadata objects may slow JSON encoding          |
| Concurrent runner state churn        | Stale data between list and action    | List shows point-in-time snapshot; runner status may change between list retrieval and any subsequent admin action |

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                               | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| API-01   | `GET /api/admin/runners` with valid admin session returns 200 and a JSON array                | Status 200, body is array, `X-Total-Count` header present             |
| API-02   | Response array items contain all required fields (`id`, `name`, `status`, `last_heartbeat_at`, `metadata`, `created_at`, `updated_at`) | Every item in the array has all specified keys |
| API-03   | Default pagination: no query params returns up to 30 runners                                  | Array length ≤ 30                                                     |
| API-04   | `?per_page=5` returns at most 5 runners                                                       | Array length ≤ 5                                                      |
| API-05   | `?per_page=50` (maximum valid) returns at most 50 runners                                     | Array length ≤ 50                                                     |
| API-06   | `?per_page=51` (exceeds maximum) is clamped to 50                                             | Array length ≤ 50                                                     |
| API-07   | `?per_page=100` (well above maximum) is clamped to 50                                         | Array length ≤ 50                                                     |
| API-08   | `?page=1&per_page=1` returns exactly 1 runner when runners exist                              | Array length = 1                                                      |
| API-09   | `?page=99999` (beyond last page) returns empty array with correct total                       | Array length = 0, `X-Total-Count` > 0                                |
| API-10   | `?page=0` is treated as page 1                                                                | Same result as `?page=1`                                              |
| API-11   | `?page=-1` is treated as page 1                                                               | Same result as `?page=1`                                              |
| API-12   | `?per_page=0` uses default value of 30                                                        | Array length ≤ 30                                                     |
| API-13   | `?per_page=-5` uses default value of 30                                                       | Array length ≤ 30                                                     |
| API-14   | `?page=abc&per_page=xyz` (non-numeric) uses defaults                                          | Status 200, uses page=1 and per_page=30 defaults                      |
| API-15   | `X-Total-Count` header value matches the actual total number of runners                       | Header value equals count from a separate count query                  |
| API-16   | Runners are ordered by `id` descending                                                        | `items[i].id > items[i+1].id` lexicographically for UUID ordering      |
| API-17   | `?status=idle` returns only runners with `status: "idle"`                                     | Every item has `status: "idle"`, `X-Total-Count` matches idle count    |
| API-18   | `?status=busy` returns only runners with `status: "busy"`                                     | Every item has `status: "busy"`                                        |
| API-19   | `?status=draining` returns only runners with `status: "draining"`                             | Every item has `status: "draining"`                                    |
| API-20   | `?status=offline` returns only runners with `status: "offline"`                               | Every item has `status: "offline"`                                     |
| API-21   | `?status=invalid_value` returns 400 Bad Request                                               | Status 400, body contains descriptive error message                    |
| API-22   | `?status=IDLE` (uppercase) returns 400 Bad Request (case-sensitive)                            | Status 400                                                             |
| API-23   | `?status=` (empty string) returns all runners (no filter)                                     | Same result as no status parameter                                     |
| API-24   | Filtered total count in `X-Total-Count` matches the filter (not global total)                 | `X-Total-Count` matches count of idle runners when `?status=idle`      |
| API-25   | Paginating through all pages yields all runners with no duplicates and no gaps                 | Union of all pages = full runner set, no ID appears twice               |
| API-26   | Request without authentication returns 401                                                    | Status 401, body contains "authentication required"                    |
| API-27   | Request with valid non-admin token returns 401                                                | Status 401, body contains "admin access required"                      |
| API-28   | Request with expired/invalid token returns 401                                                | Status 401                                                             |
| API-29   | Request with PAT having `read:admin` scope succeeds                                           | Status 200                                                             |
| API-30   | Request with PAT lacking admin scope is denied                                                | Status 401                                                             |
| API-31   | `created_at` and `updated_at` are valid ISO 8601 date strings                                 | `new Date(field).toISOString()` does not throw                         |
| API-32   | `last_heartbeat_at` is null or a valid ISO 8601 date string                                   | Null or valid date parse                                               |
| API-33   | `id` field is a valid UUID string                                                             | Matches UUID regex pattern                                             |
| API-34   | `metadata` field is a JSON object or null                                                     | `typeof metadata === "object"`                                         |
| API-35   | Runner with null metadata is returned correctly                                               | `metadata` is `null` in response                                       |
| API-36   | Runner with complex nested metadata JSON is returned correctly                                | Nested metadata object round-trips without loss                        |
| API-37   | When zero runners exist, returns empty array with `X-Total-Count: 0`                          | Status 200, body `[]`, header `X-Total-Count: 0`                       |
| API-38   | Combining `status` and `page` filters works correctly                                         | `?status=idle&page=2&per_page=5` returns correct offset of idle runners|
| API-39   | `name` field in response is a non-empty string                                                | Every item has a non-empty `name` string                               |
| API-40   | `status` field in response is one of the four valid enum values                               | Every item status ∈ {idle, busy, draining, offline}                    |

### CLI E2E Tests

| Test ID  | Test Description                                                                               | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| CLI-01   | `codeplane admin runner list` with admin token exits 0 and returns output                     | Exit code 0, stdout contains runner data or empty table                |
| CLI-02   | `codeplane admin runner list --json` output is valid JSON                                     | `JSON.parse(stdout)` succeeds, result is array                         |
| CLI-03   | `codeplane admin runner list --page 1 --limit 5` returns ≤ 5 runners                         | Array length ≤ 5 (JSON mode)                                          |
| CLI-04   | `codeplane admin runner list --limit 50` (max valid) succeeds                                 | Exit code 0, array length ≤ 50                                        |
| CLI-05   | `codeplane admin runner list --limit 51` (exceeds max) is clamped to 50                       | Exit code 0, array length ≤ 50                                        |
| CLI-06   | `codeplane admin runner list` with non-admin token fails                                      | Exit code ≠ 0, stderr contains error message                          |
| CLI-07   | `codeplane admin runner list` without any token fails                                         | Exit code ≠ 0, stderr contains error message                          |
| CLI-08   | `codeplane admin runner list --page 99999` returns empty result                               | Exit code 0, empty output or empty JSON array                         |
| CLI-09   | Response items have expected shape (id, name, status, last_heartbeat_at)                      | All required fields present in each item (JSON mode)                   |
| CLI-10   | `--limit` parameter is correctly translated to `per_page` API parameter                       | Verified via response size matching the limit                         |
| CLI-11   | `codeplane admin runner list --status idle` returns only idle runners                         | Every item has `status: "idle"` (JSON mode)                            |
| CLI-12   | `codeplane admin runner list --status busy` returns only busy runners                         | Every item has `status: "busy"` (JSON mode)                            |
| CLI-13   | `codeplane admin runner list --status offline` returns only offline runners                   | Every item has `status: "offline"` (JSON mode)                         |
| CLI-14   | `codeplane admin runner list --status invalid` returns error                                  | Exit code ≠ 0, stderr contains error message                          |
| CLI-15   | `codeplane admin runner list --status idle --page 1 --limit 2 --json` combines all options    | Exit code 0, valid JSON, all constraints met                           |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                               | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| UI-01    | Admin user navigates to `/admin/runners` and sees the runner table                            | Table element is visible                                               |
| UI-02    | Table columns include Name, Status, Last Heartbeat, Metadata, Registered                     | All column headers are visible                                        |
| UI-03    | Total runner count is displayed in the page header                                            | Header subtitle text matches "N runners" pattern                      |
| UI-04    | Pagination controls are visible when total runners exceed per-page count                      | Previous/Next buttons and page indicator are rendered                 |
| UI-05    | Clicking "Next" page loads the next set of runners                                            | Table rows change, page indicator increments                          |
| UI-06    | Changing per-page selector updates the number of visible rows                                 | Row count matches the selected per-page value                         |
| UI-07    | URL query string reflects current page, per_page, and status filter                           | `window.location.search` contains expected parameters                 |
| UI-08    | Navigating directly to `/admin/runners?page=2&per_page=10` loads correct page                 | Table shows expected offset of runners                                |
| UI-09    | Non-admin user navigating to `/admin/runners` sees an access denied message or redirect       | Error message or redirect to home/login                               |
| UI-10    | Loading state shows skeleton rows before data arrives                                         | Skeleton elements visible during network request                      |
| UI-11    | Network error displays inline error banner with retry button                                  | Error banner visible, retry button triggers new request               |
| UI-12    | Status badges use correct color coding (green=idle, amber=busy, blue=draining, gray=offline)  | Badge elements have expected color classes/styles                     |
| UI-13    | Clicking "Idle" status filter shows only idle runners                                         | All visible rows have idle status badge                               |
| UI-14    | Clicking "Offline" status filter shows only offline runners                                   | All visible rows have offline status badge                            |
| UI-15    | Clicking "All" status filter clears the filter and shows all runners                          | Row count matches total runner count                                  |
| UI-16    | Status filter selection is reflected in the URL query string                                  | URL contains `?status=idle` when idle filter is active                 |
| UI-17    | Navigating directly to `/admin/runners?status=busy` pre-selects the busy filter               | Busy filter is active, only busy runners shown                        |
| UI-18    | Empty state is shown when no runners exist                                                    | "No runners registered." message displayed                            |
| UI-19    | Empty filter state is shown when filter has no matches                                        | "No runners match the selected filter." message displayed             |
| UI-20    | Last Heartbeat column shows relative time with full-date tooltip                              | Relative text visible, tooltip shows ISO date on hover                |
| UI-21    | Last Heartbeat shows "Never" for runners with null last_heartbeat_at                          | "Never" text displayed for null heartbeat                             |
| UI-22    | Metadata column shows truncated preview with expandable detail                                | Truncated text visible, expansion shows full JSON                     |
| UI-23    | Metadata column shows "—" for runners with null metadata                                      | Dash character displayed for null metadata                            |

### TUI E2E Tests

| Test ID  | Test Description                                                                               | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| TUI-01   | Admin user can navigate to the runners screen                                                 | Runners screen header is displayed                                    |
| TUI-02   | Runner list displays runner names and statuses                                                | Runner names and status indicators visible in output                  |
| TUI-03   | Status filter toggles correctly with `f` key                                                  | Display updates to show only filtered runners                         |
| TUI-04   | `r` key refreshes the runner list                                                             | List content refreshes without screen navigation                      |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                               | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| CC-01    | API response for page 1 with per_page=10 returns the same runner IDs as CLI with --page 1 --limit 10 | ID sets are identical |
| CC-02    | `X-Total-Count` from API matches the total displayed in the web UI header                     | Values are equal                                                      |
| CC-03    | API response with `?status=idle` returns the same IDs as CLI with `--status idle`             | ID sets are identical                                                  |
| CC-04    | Filtered `X-Total-Count` from API matches the filtered count displayed in the web UI          | Values are equal                                                      |

# ADMIN_SYSTEM_HEALTH_VIEW

Specification for ADMIN_SYSTEM_HEALTH_VIEW.

## High-Level User POV

When a Codeplane administrator needs to understand whether their instance is operating correctly, the System Health View provides a dedicated, real-time diagnostic surface that goes beyond a simple "up or down" signal. It answers the question every operator eventually asks: "My users are reporting something feels slow — is the system actually healthy?"

The System Health View presents a consolidated picture of every critical subsystem in a running Codeplane instance. The administrator sees the status of the database, the SSH server, the background cleanup scheduler, and the runner pool, each with its own health indicator and measured latency where applicable. When everything is working, the view is reassuringly green and boring. When something is degraded or down, the affected component lights up immediately with a clear error description, giving the operator enough context to begin investigation without needing to SSH into the host and read raw logs.

From the web UI, the System Health View is a dedicated page within the admin area. It presents a status card for each monitored component, auto-refreshes every 30 seconds, and provides a manual refresh button for operators who want an immediate update. The overall system status — "Healthy", "Degraded", or "Down" — is displayed prominently at the top of the page so the administrator can triage at a glance.

From the CLI, `codeplane admin health` fetches the same underlying data and presents it as structured JSON or a human-readable table. This makes it easy to integrate system health checks into deployment scripts, CI/CD pipelines, and monitoring cron jobs. An operator can run `codeplane admin health` after a deployment and immediately confirm that all subsystems came up cleanly.

From the TUI, the system health status is embedded as a top-level section in the admin overview screen, showing compact health indicators with color-coded status for each component.

The System Health View is intentionally read-only. It does not offer restart buttons, configuration toggles, or mutation controls. Its purpose is pure visibility: give the administrator the fastest possible path from "something might be wrong" to "here is exactly which subsystem is affected."

## Acceptance Criteria

### Definition of Done

The feature is complete when an admin user can view real-time system health status for all monitored subsystems (database, SSH server, runner pool, and background scheduler) from the web UI, CLI, and TUI; when non-admin users are denied access across all surfaces; when degraded or failed subsystems are clearly and accurately reported; and when the entire flow is covered by passing integration and E2E tests.

### Functional Constraints

- [ ] The admin system health endpoint `GET /api/admin/system/health` MUST return the overall system status as one of: `"ok"`, `"degraded"`.
- [ ] The response MUST include a `database` object with fields `status` (string) and `latency` (string formatted as `"<N>ms"`) when healthy, or `status` and `error` (string) when degraded.
- [ ] The response MUST include a `components` map (may be empty initially, reserved for future subsystem checks such as SSH, scheduler, runner pool).
- [ ] When all subsystems are healthy, the endpoint MUST return HTTP 200 with `status: "ok"`.
- [ ] When any subsystem is degraded or down, the endpoint MUST return HTTP 503 with `status: "degraded"`.
- [ ] The `database.latency` field MUST be measured in real time by executing a lightweight database ping query (not a stub).
- [ ] The health service `ping()` method in the SDK MUST execute an actual database connectivity check (e.g., `SELECT 1`) rather than returning a hardcoded stub response.
- [ ] The web UI MUST display a dedicated System Health page within the admin area at `/admin/health`.
- [ ] The web UI MUST show the overall system status as a prominent badge ("Healthy" / "Degraded").
- [ ] The web UI MUST list each monitored subsystem with its current status and measured latency.
- [ ] The web UI MUST auto-refresh every 30 seconds via polling.
- [ ] The web UI MUST provide a manual refresh button that immediately re-fetches health data.
- [ ] The CLI `codeplane admin health` command MUST call `GET /api/admin/system/health` and display the result.
- [ ] The CLI MUST support `--json` output mode returning the raw API response.
- [ ] The CLI MUST support a human-readable table format as the default output mode.
- [ ] The TUI MUST render health status indicators within the admin overview screen.

### Edge Cases

- [ ] If the database is unreachable, `database.status` MUST be `"error"` and `database.error` MUST be a non-empty sanitized string (no connection strings, passwords, hostnames, or file paths).
- [ ] If the health ping query takes longer than 5 seconds, it MUST be timed out and reported as degraded with error `"database health check timed out"`.
- [ ] If multiple subsystems are degraded simultaneously, the overall status MUST be `"degraded"` and each affected component MUST independently report its own error.
- [ ] If the database is in PGLite mode, the health check MUST work identically to PostgreSQL mode.
- [ ] If the server has just started (cold start, no prior requests processed), the health endpoint MUST work correctly on the first request.
- [ ] If the health endpoint is called during graceful shutdown, it MUST still respond until the process exits.
- [ ] If a component check throws an unexpected exception, the overall response MUST still be returned with that component marked as `"error"` rather than the entire endpoint returning 500.
- [ ] The endpoint MUST handle concurrent requests without blocking or race conditions.
- [ ] When the `components` map is empty (no additional subsystems registered beyond database), it MUST be returned as an empty object `{}`, not omitted or `null`.

### Boundary Constraints

- [ ] The response body MUST be valid JSON and MUST NOT exceed 4 KB.
- [ ] The `database.latency` string MUST match the regex pattern `^\d+ms$`.
- [ ] The `database.error` string, when present, MUST NOT exceed 256 characters.
- [ ] Error messages in the response MUST NOT contain: database connection strings, passwords, hostnames, file system paths, environment variable values, or stack traces.
- [ ] The endpoint MUST respond within 10 seconds under all conditions (including timeout scenarios).
- [ ] Component status values MUST be one of: `"ok"`, `"error"`. No other values are valid.
- [ ] Overall status values MUST be one of: `"ok"`, `"degraded"`. No other values are valid.

## Design

### API Shape

#### `GET /api/admin/system/health`

**Authentication**: Required. Admin role required (session cookie or PAT with `read:admin` scope on an admin user).

**Request**: No body, no query parameters.

**Response (200 OK — healthy):**
```json
{
  "status": "ok",
  "database": {
    "status": "ok",
    "latency": "3ms"
  },
  "components": {}
}
```

**Response (503 Service Unavailable — degraded):**
```json
{
  "status": "degraded",
  "database": {
    "status": "error",
    "error": "database unreachable"
  },
  "components": {}
}
```

**Error Responses:**
- `401 Unauthorized`: No credentials provided or non-admin user.
- Response body for auth errors: `{ "error": "authentication required" }` or `{ "error": "admin access required" }`.

**Component Extension Model**: When additional subsystems are added to the `components` map in the future, each entry follows the same shape:

```json
{
  "components": {
    "ssh_server": { "status": "ok" },
    "runner_pool": { "status": "ok" },
    "cleanup_scheduler": { "status": "ok" }
  }
}
```

Each component value has:
- `status` (required): `"ok"` or `"error"`.
- `latency` (optional): String formatted as `"<N>ms"`.
- `error` (optional): Human-readable sanitized error description (max 256 characters).

### Web UI Design

The System Health View is rendered at `/admin/health` as a dedicated page within the admin area. It is linked from the Admin Overview Dashboard's health indicator row and from the admin sidebar navigation.

**Page Layout:**

1. **Page Header**: Title "System Health" with:
   - An overall status badge: green pill with "Healthy" text, or red/yellow pill with "Degraded" text.
   - A "Last checked: N seconds ago" timestamp.
   - A manual "Refresh" button (icon: circular arrow).

2. **Component Status Cards** (vertical list, full width):
   - **Database** card:
     - Status indicator (green dot / red dot).
     - Label: "Database".
     - Status text: "Healthy" or "Error".
     - Latency badge: "3ms" (only shown when healthy).
     - Error message: inline red text (only shown when status is error).
   - (Future) **SSH Server** card — same layout.
   - (Future) **Runner Pool** card — same layout.
   - (Future) **Cleanup Scheduler** card — same layout.

3. **Empty Component State**: When the `components` map is empty and only `database` is monitored, a subtle note reads: "Additional subsystem checks (SSH, runners, scheduler) will appear here when enabled."

**Auto-Refresh Behavior:**
- The page polls `GET /api/admin/system/health` every 30 seconds.
- The "Last checked" timestamp updates on each successful poll.
- If a poll fails (network error, session expired), the page shows a banner: "Unable to refresh health status — check your connection."
- The manual refresh button triggers an immediate fetch and resets the 30-second timer.

**Access Denied Behavior:**
- Non-admin users navigating to `/admin/health` see a 403 page or are redirected to the home page.
- Unauthenticated users are redirected to the login page.

**Responsive Behavior:**
- On screens narrower than 768px, component cards stack vertically (single column).
- The status badge and refresh button remain in the header on all viewports.

### CLI Command

#### `codeplane admin health`

Fetches detailed system health from the admin endpoint.

**Options**: None (inherits global `--json` flag).

**Default Output (human-readable):**
```
System Health: Healthy

  Database     ok      3ms

✓ All systems operational
```

**Default Output (degraded):**
```
System Health: Degraded

  Database     error   database unreachable

✗ 1 subsystem degraded — investigate immediately
```

**JSON Output (`--json`):** Returns the raw JSON response from `GET /api/admin/system/health`.

**Exit Codes:**
- `0`: Request succeeded (regardless of health status — the status is in the output).
- `1`: Request failed (auth error, network error, non-2xx/503 status).

### TUI UI

The TUI does not have a standalone health screen. Instead, health indicators are displayed as the top row of the Admin Overview screen. The health row shows:

```
┌─ System Health ─────────────────────────────┐
│  ● Database: ok (3ms)                       │
│  (additional components shown when enabled) │
└─────────────────────────────────────────────┘
```

Color coding: Green (●) for "ok", Red (●) for "error". Keybinding: `h` refreshes health data.

### SDK Shape

The SDK health service exposes:

```typescript
interface HealthPingResult {
  ok: boolean;
  error?: string;
  latency?: string;
}

interface HealthService {
  ping(): Promise<HealthPingResult>;
}
```

The `ping()` method MUST: (1) Record a start timestamp; (2) Execute a lightweight database query (e.g., `SELECT 1`); (3) Record an end timestamp; (4) Return `{ ok: true, latency: "<N>ms" }` on success; (5) Return `{ ok: false, error: "<sanitized message>" }` on failure; (6) Enforce a 5-second timeout on the query.

### Documentation

1. **Admin Guide — System Health section** (in `/docs/guides/administration.mdx`): Add a section explaining the System Health View, what each component means, how to interpret status indicators, the auto-refresh behavior, and recommended monitoring integration using `codeplane admin health`.
2. **CLI Reference — `admin health` command**: Document the command, output formats (table and JSON), exit codes, and example output for both healthy and degraded states.
3. **API Reference — `GET /api/admin/system/health`**: Document the endpoint path, required authentication, response schema for 200 and 503, the component extension model, and error responses.
4. **Operator Guide — Health Monitoring**: A page explaining how to integrate the admin health endpoint with monitoring systems (Prometheus blackbox exporter, Grafana, Datadog), including recommended poll intervals and alerting thresholds.

## Permissions & Security

### Authorization Matrix

| Role | API Access | Web UI Access | CLI Access | TUI Access |
|---|---|---|---|---|
| **Site Admin** (`is_admin: true`, session) | ✅ 200 | ✅ Full page | ✅ Exit 0 | ✅ Health row visible |
| **Site Admin** (PAT with `read:admin` scope) | ✅ 200 | N/A | ✅ Exit 0 | N/A |
| **Site Admin** (PAT without `read:admin` scope) | ❌ 401 | N/A | ❌ Exit 1 | N/A |
| **Regular User** (session or PAT) | ❌ 401 | ❌ 403/redirect | ❌ Exit 1 | ❌ Admin nav hidden |
| **Anonymous / Unauthenticated** | ❌ 401 | ❌ Redirect to login | ❌ Exit 1 | ❌ Login required |
| **Deploy Key** | ❌ 401 | N/A | N/A | N/A |

### Rate Limiting

- The `GET /api/admin/system/health` endpoint is subject to the global rate limiter (120 requests per minute per identity/IP).
- No additional per-endpoint rate limit is applied because the endpoint is lightweight (single DB ping) and admin-only usage is inherently low volume.
- The web UI's 30-second auto-refresh produces 2 requests per minute, well within the global limit.
- Automated scripts polling the admin health endpoint should be configured to poll at most once every 10 seconds.

### Data Privacy

- The response exposes database latency in milliseconds — this is operational data, not PII.
- Error messages MUST be sanitized to exclude connection strings, passwords, database hostnames, file system paths, and environment variable values.
- No user data, email addresses, IP addresses, or repository information is exposed in the response.
- The endpoint does not log the request body (there is none) and logs only the requesting admin's user ID.
- No PII exposure risk exists in this feature.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|---|---|---|
| `AdminHealthCheckRequested` | Admin system health endpoint is called | `admin_user_id`, `overall_status` (`"ok"` / `"degraded"`), `database_status` (`"ok"` / `"error"`), `database_latency_ms` (integer), `surface` (`"api"` / `"web"` / `"cli"` / `"tui"`), `component_count` (number of components checked) |
| `AdminHealthPageViewed` | Admin navigates to `/admin/health` in the web UI | `admin_user_id` |
| `AdminHealthPageRefreshed` | Admin manually clicks the refresh button in the web UI | `admin_user_id`, `seconds_since_last_refresh` |
| `AdminHealthDegradedDetected` | Endpoint returns `status: "degraded"` | `admin_user_id`, `degraded_components` (string array of component names with errors), `database_error` (sanitized error string, if applicable) |

### Funnel Metrics / Success Indicators

- **Degraded detection rate**: Percentage of `AdminHealthCheckRequested` events where `overall_status` is `"degraded"`. Target: <0.1% over any 24-hour window. A spike indicates real infrastructure issues.
- **Admin adoption**: Count of distinct admin users calling the health endpoint per week (across all surfaces). Indicates whether administrators are actively monitoring their instance.
- **Mean time to detect degradation (MTTD)**: Time between the first degraded health response and the first `AdminHealthDegradedDetected` event seen by an admin user. Lower is better — indicates the health view is being checked frequently enough.
- **CLI vs. web distribution**: Ratio of CLI-originated health checks to web-originated health checks. Indicates whether admins prefer scripted monitoring or manual dashboard checks.
- **Auto-refresh engagement**: Percentage of `AdminHealthPageViewed` events followed by the admin staying on the page long enough for at least one auto-refresh cycle (30+ seconds). Indicates whether the page is being used as a monitoring dashboard.

## Observability

### Logging Requirements

| Event | Log Level | Structured Context |
|---|---|---|
| Admin health check — healthy | `info` | `admin_user_id`, `database_latency_ms`, `overall_status: "ok"` |
| Admin health check — degraded | `warn` | `admin_user_id`, `database_error` (sanitized), `database_latency_ms` (if measurable), `overall_status: "degraded"` |
| Health ping database timeout | `error` | `timeout_ms: 5000`, `error_message: "database health check timed out"` |
| Health ping unexpected exception | `error` | `error_message` (sanitized), `error_type` (exception class name) |
| Admin health check — auth denied | `info` | `user_id` (if available), `reason` (`"not_authenticated"` / `"not_admin"`) |

Logging MUST NOT include: database connection strings, passwords, full stack traces in production, or any PII.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_admin_health_checks_total` | Counter | `status` (`ok`, `degraded`) | Total admin health checks by result |
| `codeplane_admin_health_db_latency_seconds` | Histogram | — | Database ping latency as observed by admin health endpoint. Buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 |
| `codeplane_admin_health_request_duration_seconds` | Histogram | — | Total admin health endpoint response duration |
| `codeplane_system_component_status` | Gauge | `component` (`database`) | 1 = healthy, 0 = degraded/error. Updated on each admin health check. |
| `codeplane_admin_health_errors_total` | Counter | `component`, `error_type` (`timeout`, `connection_refused`, `unexpected`) | Count of health check failures by component and type |

### Alerts

#### Alert: `CodeplaneDatabaseDegraded`

**Condition**: `codeplane_system_component_status{component="database"}` == 0 for 2 consecutive minutes OR `codeplane_admin_health_checks_total{status="degraded"}` rate > 0 over 2 minutes.

**Severity**: Critical (P1)

**Runbook**:
1. Confirm the degraded status: run `codeplane admin health` or `curl -H "Authorization: token <admin_pat>" https://<host>/api/admin/system/health`.
2. If the error message says "database unreachable": check database process status (`pg_isready -h <host> -p <port>` for PostgreSQL, or check disk availability for PGLite).
3. If the error message says "database health check timed out": check database load (`SELECT count(*) FROM pg_stat_activity`), look for long-running queries or lock contention.
4. Check network connectivity between the Codeplane server and the database host: `telnet <db_host> <db_port>`.
5. Check database disk space: `df -h` on the database volume.
6. If the connection pool is exhausted, restart the Codeplane server process to reset connections: `systemctl restart codeplane`.
7. After remediation, re-run `codeplane admin health` and confirm `status: "ok"` with normal latency.
8. If the database cannot be restored within 15 minutes, escalate to the database on-call engineer.

#### Alert: `CodeplaneHealthDBLatencyHigh`

**Condition**: `codeplane_admin_health_db_latency_seconds` p99 > 1 second for 5 minutes.

**Severity**: Warning (P2)

**Runbook**:
1. The database is reachable but responding slowly to the health ping. This may indicate broader database performance issues.
2. Check database CPU and I/O utilization on the database host.
3. Check for long-running queries: `SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 10`.
4. Check connection pool utilization — if near capacity, consider increasing pool size or identifying connection leaks.
5. Check for vacuum or autovacuum operations that may be causing I/O contention.
6. If latency correlates with increased traffic, consider scaling the database or adding read replicas.
7. Monitor for 15 minutes after investigation; if latency returns to normal, close the alert.

#### Alert: `CodeplaneAdminHealthEndpointErrors`

**Condition**: `codeplane_admin_health_errors_total` rate > 3 per minute for any component over 5 minutes.

**Severity**: Warning (P2)

**Runbook**:
1. Check the `component` and `error_type` labels to identify the failing component and failure mode.
2. For `error_type: "timeout"`: the database ping is consistently exceeding 5 seconds. Follow the `CodeplaneHealthDBLatencyHigh` runbook.
3. For `error_type: "connection_refused"`: the database is not accepting connections. Check database process status and network path.
4. For `error_type: "unexpected"`: check server logs (`journalctl -u codeplane --since "10 min ago" | grep health`) for exception details.
5. Verify the error is not transient by running `codeplane admin health` manually 3 times in succession.
6. If errors persist, restart the Codeplane server and monitor.

### Error Cases and Failure Modes

| Failure Mode | Behavior | Detection |
|---|---|---|
| Database connection refused | Returns 503 with `database.status: "error"`, `database.error: "database unreachable"` | `CodeplaneDatabaseDegraded` alert, `codeplane_admin_health_checks_total{status="degraded"}` counter |
| Database query timeout (>5s) | Returns 503 with `database.status: "error"`, `database.error: "database health check timed out"` | `codeplane_admin_health_errors_total{error_type="timeout"}` counter |
| Database slow but responding (<5s) | Returns 200 with `database.status: "ok"` and elevated `database.latency` | `codeplane_admin_health_db_latency_seconds` histogram |
| Health service throws unexpected exception | Returns 503 with `database.status: "error"`, sanitized error message | `codeplane_admin_health_errors_total{error_type="unexpected"}` counter |
| Admin user's session expired | Returns 401 | Web UI shows "Session expired" banner |
| Rate limit exceeded | Returns 429 Too Many Requests | Global rate limit counter |
| Network partition between client and server | Connection timeout / refused at client | CLI exits 1 with "unable to reach Codeplane API" |
| Server in graceful shutdown | Endpoint continues responding until process exit | No special behavior |

## Verification

### API Integration Tests

- [ ] **Test: Admin health returns 200 with `status: "ok"` for admin user** — Authenticate as admin, call `GET /api/admin/system/health`, verify HTTP 200 and `body.status === "ok"`.
- [ ] **Test: Admin health response contains `database` object** — Verify response body has a `database` key that is an object.
- [ ] **Test: Admin health `database.status` is `"ok"` on healthy system** — Verify `body.database.status === "ok"`.
- [ ] **Test: Admin health `database.latency` matches pattern `\d+ms`** — Verify `body.database.latency` matches regex `/^\d+ms$/`.
- [ ] **Test: Admin health `database.latency` is a reasonable value** — Parse the numeric portion and verify it is between 0 and 5000 (milliseconds).
- [ ] **Test: Admin health response contains `components` key** — Verify response body has a `components` key (object, may be empty).
- [ ] **Test: Admin health response does not contain `database.error` when healthy** — Verify `body.database.error` is undefined when status is "ok".
- [ ] **Test: Admin health returns 401 without credentials** — Call without any auth headers, verify HTTP 401.
- [ ] **Test: Admin health returns 401 for non-admin authenticated user** — Authenticate as a regular user, call endpoint, verify HTTP 401 with body containing "admin access required".
- [ ] **Test: Admin health returns 401 for expired or invalid PAT** — Use a revoked or malformed PAT, verify HTTP 401.
- [ ] **Test: Admin health response Content-Type is JSON** — Verify response header `Content-Type` includes `application/json`.
- [ ] **Test: Admin health response body is valid JSON** — Parse response body with `JSON.parse`, verify no exception.
- [ ] **Test: Admin health response body does not exceed 4 KB** — Measure response body byte length, verify it is ≤ 4096.
- [ ] **Test: Admin health response does not contain connection strings** — Search response body string for patterns like `postgresql://`, `postgres://`, `host=`, `password=`, verify none found.
- [ ] **Test: Admin health response does not contain file paths** — Search response body for `/usr/`, `/var/`, `/home/`, `/tmp/`, `C:\`, verify none found.
- [ ] **Test: Admin health completes within 10 seconds** — Measure response time, verify < 10000ms.
- [ ] **Test: Admin health works immediately after server start** — Start a fresh server, immediately call the endpoint, verify 200 response.
- [ ] **Test: Admin health handles concurrent requests** — Send 10 concurrent requests from admin user, verify all return 200 with consistent status.
- [ ] **Test: Admin health `overall_status` is valid enum** — Verify `body.status` is one of `"ok"` or `"degraded"`.
- [ ] **Test: Admin health `database.status` is valid enum** — Verify `body.database.status` is one of `"ok"` or `"error"`.

### CLI Integration Tests

- [ ] **Test: `codeplane admin health` returns exit code 0 with admin credentials** — Run command as admin, verify exit code 0.
- [ ] **Test: `codeplane admin health --json` returns valid JSON** — Run with `--json` flag, parse output, verify valid JSON.
- [ ] **Test: `codeplane admin health --json` contains `status` field** — Parse JSON output, verify `status` key exists.
- [ ] **Test: `codeplane admin health --json` contains `database` object** — Parse JSON output, verify `database` key exists with `status` and `latency` fields.
- [ ] **Test: `codeplane admin health` default output includes "System Health"** — Run without `--json`, verify stdout contains health status text.
- [ ] **Test: `codeplane admin health` default output includes database status** — Verify stdout contains database component and "ok" text.
- [ ] **Test: `codeplane admin health` fails with exit code 1 for non-admin user** — Run with non-admin token, verify exit code 1.
- [ ] **Test: `codeplane admin health` fails with exit code 1 without auth** — Run without authentication, verify exit code 1.
- [ ] **Test: `codeplane admin health` error output is human-readable** — On auth failure, verify stderr or stdout contains a clear error message (not a raw HTTP response or stack trace).

### Web UI E2E Tests (Playwright)

- [ ] **Test: Admin health page loads for admin user** — Log in as admin, navigate to `/admin/health`, verify the page title "System Health" is visible.
- [ ] **Test: Admin health page shows overall status badge** — Verify a status badge with text "Healthy" or "Degraded" is visible.
- [ ] **Test: Admin health page shows database component** — Verify a card or row containing "Database" with a status indicator is visible.
- [ ] **Test: Admin health page shows database latency** — Verify a latency value matching the pattern `/\d+ms/` is visible.
- [ ] **Test: Admin health page refresh button works** — Click the refresh/reload button, verify the "Last checked" timestamp updates.
- [ ] **Test: Admin health page auto-refreshes** — Wait 35 seconds on the page, verify the "Last checked" timestamp changes without user interaction.
- [ ] **Test: Admin health page not accessible to non-admin user** — Log in as regular user, navigate to `/admin/health`, verify redirect or 403 page.
- [ ] **Test: Admin health page not accessible when unauthenticated** — Without logging in, navigate to `/admin/health`, verify redirect to login page.
- [ ] **Test: Admin health page shows green indicator when healthy** — Verify the database status indicator uses a green or success color class.
- [ ] **Test: Admin health page navigable from admin sidebar** — Verify there is a "System Health" or "Health" link in the admin navigation sidebar that navigates to `/admin/health`.
- [ ] **Test: Admin health page responsive on mobile** — Set viewport to 375x667, verify page renders without horizontal overflow.

### API E2E Tests (Against Running Server)

- [ ] **Test: Cold-start health check** — Start the server, immediately call `GET /api/admin/system/health` with admin credentials, verify 200 response with `status: "ok"`.
- [ ] **Test: Concurrent admin health requests under load** — Send 20 concurrent admin health requests, verify all return consistent responses (either all 200 or all 503).
- [ ] **Test: Admin health endpoint respects rate limiting** — Send 130 requests within 60 seconds from a single admin identity, verify that requests beyond the global limit receive 429.
- [ ] **Test: Admin health round-trip** — Start server → authenticate as admin → call admin health → verify "ok" → authenticate as non-admin → call admin health → verify 401.

### TUI E2E Tests

- [ ] **Test: TUI admin screen shows health indicators for admin user** — Launch TUI as admin, navigate to admin overview, verify health status row is visible with "Database" component.
- [ ] **Test: TUI admin screen health uses color coding** — Verify the database health indicator renders with the appropriate color (green for ok, red for error).
- [ ] **Test: TUI admin screen health refresh keybinding works** — Press the refresh keybinding, verify health data updates.

# PLATFORM_HEALTHCHECK_ENDPOINTS

Specification for PLATFORM_HEALTHCHECK_ENDPOINTS.

## High-Level User POV

When you deploy Codeplane — whether as a self-hosted server, a local daemon, or an embedded desktop application — you need confidence that the system is alive, ready to serve traffic, and operating normally. Platform healthcheck endpoints give you that confidence without requiring you to log in or have special credentials.

As an operator or infrastructure engineer, you point your load balancer, Kubernetes orchestrator, or monitoring stack at Codeplane's health endpoints and immediately know whether the instance is accepting requests. You get a clear "ok" signal when everything is running, and a clear failure signal — an HTTP error or connection refusal — when it is not. This is the simplest, most fundamental operational contract the product offers.

For deeper visibility, administrators can access a richer system health view that reports on individual subsystem status — database connectivity, background job schedulers, SSH server availability — with measured latencies. This tells you not just "is it up?" but "is it healthy?" and helps you triage degraded states before they become outages.

From the CLI, you can run a single command to check whether your configured Codeplane server is reachable and responding, with measured round-trip time. This is useful for scripting, CI/CD pipelines, smoke tests after deployment, and quick manual verification from a terminal. The daemon mode offers its own operational status that includes sync health, queue depth, and conflict counts — giving local-first users the same operational confidence as server-hosted teams.

The healthcheck surface is intentionally boring. It does one job — tell you whether Codeplane is working — and it does it reliably, cheaply, and without side effects.

## Acceptance Criteria

## Definition of Done

The feature is complete when all public and admin healthcheck endpoints are operational, tested end-to-end across API, CLI, and daemon modes, correctly report degraded state, and are documented for operators.

## Public Health Endpoints

- [ ] `GET /health` returns `{ "status": "ok" }` with HTTP 200 when the server is running.
- [ ] `GET /healthz` returns `{ "status": "ok" }` with HTTP 200 (Kubernetes liveness probe convention).
- [ ] `GET /readyz` returns `{ "status": "ok" }` with HTTP 200 (Kubernetes readiness probe convention).
- [ ] `GET /api/health` returns `{ "status": "ok" }` with HTTP 200 (API-namespaced variant).
- [ ] All four endpoints return identical response bodies and status codes.
- [ ] All four endpoints are accessible without authentication (no session, no token, no API key).
- [ ] All four endpoints respond to `GET` requests only; other HTTP methods return 405 Method Not Allowed.
- [ ] Response `Content-Type` is `application/json; charset=utf-8`.
- [ ] Response body is always valid JSON and never exceeds 64 bytes.
- [ ] Endpoints complete within 50ms under normal operating conditions (no database queries, no I/O).
- [ ] Endpoints do not create sessions, emit audit events, or produce any side effects.
- [ ] Endpoints are subject to the same global rate limiter as other routes (120 req/min per identity/IP).

## Admin System Health Endpoint

- [ ] `GET /api/admin/system/health` requires an authenticated admin user.
- [ ] Returns HTTP 401 if no credentials are provided.
- [ ] Returns HTTP 403 if credentials belong to a non-admin user.
- [ ] Returns `{ "status": "ok", "database": { "status": "ok", "latency": "<N>ms" } }` with HTTP 200 when all subsystems are healthy.
- [ ] Returns `{ "status": "degraded", "database": { "status": "error", "error": "<message>" } }` with HTTP 503 when the database is unreachable or unresponsive.
- [ ] The `database.latency` field is measured in real time by executing a lightweight ping query.
- [ ] The `components` map, if present, uses string keys for subsystem names and `{ status, latency?, error? }` values.
- [ ] Response body is valid JSON and does not exceed 4 KB.

## CLI Health Command

- [ ] `codeplane health` checks the configured API URL (defaulting to `http://localhost:3000`).
- [ ] `codeplane health --url <URL>` overrides the target API URL.
- [ ] Returns `{ "status": "healthy", "url": "<URL>", "response_ms": <N> }` with exit code 0 when the server responds with `{ "status": "ok" }`.
- [ ] Returns `{ "status": "unhealthy", "url": "<URL>", "http_status": <N>, "response_ms": <N>, "body": <object> }` with exit code 0 when the server responds with a non-ok body.
- [ ] Returns `{ "status": "unreachable", "url": "<URL>", "error": "<message>" }` with exit code 0 when the server cannot be reached.
- [ ] The `--url` flag accepts any valid HTTP or HTTPS URL.
- [ ] The `--url` flag rejects empty strings and non-URL values gracefully.
- [ ] `codeplane admin health` calls `GET /api/admin/system/health` and returns the full system health payload.
- [ ] `codeplane admin health` fails with exit code 1 and a clear error message when the current user is not an admin.

## Daemon Status Endpoint

- [ ] `GET /api/daemon/status` returns process-level operational data with all required fields.
- [ ] `sync_status` is one of: `"offline"`, `"syncing"`, `"idle"`, `"error"`.
- [ ] `pending_count` and `conflict_count` are non-negative integers.
- [ ] `last_sync_at` is either a valid ISO 8601 timestamp string or `null`.
- [ ] `error` is either a human-readable string or `null`.
- [ ] `remote_url` is either a valid URL string or `null`.

## Daemon Remote Health Verification

- [ ] `POST /api/daemon/connect` health-checks the remote URL via `GET /api/health` before establishing sync.
- [ ] The remote health check uses a 10-second timeout.
- [ ] If the remote returns a non-2xx status, the connect request fails with HTTP 400.
- [ ] If the remote is unreachable, the connect request fails with HTTP 400 and a descriptive error.

## Edge Cases and Boundary Constraints

- [ ] Health endpoints work correctly when the database is in PGLite mode.
- [ ] Health endpoints work correctly when the database is in PostgreSQL mode.
- [ ] Public health endpoints still return 200 even if the database is degraded (they do not query the database).
- [ ] Admin health endpoint correctly reports degraded status if the database ping fails.
- [ ] Health endpoints work immediately after server startup, before any user requests have been processed.
- [ ] Health endpoints continue to work during graceful shutdown (until the process actually exits).
- [ ] The CLI health command handles URLs with trailing slashes correctly.
- [ ] The CLI health command handles URLs without a scheme gracefully (error, not crash).
- [ ] Concurrent requests to health endpoints do not block or degrade each other.
- [ ] Health endpoints do not leak internal implementation details in any response.

## Design

## API Shape

### Public Health Endpoints

```
GET /health
GET /healthz
GET /readyz
GET /api/health
```

**Request:** No body, no query parameters, no authentication required.

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

All four endpoints are functionally identical. They exist at different paths to support different infrastructure conventions:
- `/health` — general-purpose health check.
- `/healthz` — Kubernetes liveness probe convention.
- `/readyz` — Kubernetes readiness probe convention.
- `/api/health` — API-namespaced variant for clients that prefix all calls with `/api`.

### Admin System Health Endpoint

```
GET /api/admin/system/health
```

**Request:** Requires admin authentication via session cookie or PAT.

**Response (200 OK — healthy):**
```json
{
  "status": "ok",
  "database": {
    "status": "ok",
    "latency": "3ms"
  }
}
```

**Response (503 Service Unavailable — degraded):**
```json
{
  "status": "degraded",
  "database": {
    "status": "error",
    "error": "database unreachable"
  }
}
```

The `components` field is reserved for future subsystem checks (SSH server, cleanup scheduler, sync engine) and may be absent or an empty object when no additional components are monitored.

### Daemon Status Endpoint

```
GET /api/daemon/status
```

**Request:** No authentication required (daemon runs locally).

**Response (200 OK):**
```json
{
  "pid": 12345,
  "uptime": "2h 15m 30s",
  "uptime_ms": 8130000,
  "port": "3000",
  "db_mode": "pglite",
  "sync_status": "idle",
  "pending_count": 0,
  "conflict_count": 0,
  "last_sync_at": "2026-03-21T10:30:00.000Z",
  "error": null,
  "remote_url": "https://codeplane.example.com"
}
```

## CLI Command

### `codeplane health`

Checks connectivity and health of the configured Codeplane API server.

```
Usage: codeplane health [--url <API_URL>]

Options:
  --url    API URL to check (defaults to configured API URL or http://localhost:3000)

Output (JSON):
  status        "healthy" | "unhealthy" | "unreachable"
  url           The URL that was checked
  response_ms   Round-trip time in milliseconds (present when server responds)
  http_status   HTTP status code (present when "unhealthy")
  body          Response body (present when "unhealthy")
  error         Error message (present when "unreachable")
```

**Human-readable output** (non-JSON mode): Prints a one-line summary such as:
- `✓ Codeplane is healthy at http://localhost:3000 (12ms)`
- `✗ Codeplane is unhealthy at http://localhost:3000 (HTTP 503)`
- `✗ Codeplane is unreachable at http://localhost:3000 (connection refused)`

### `codeplane admin health`

Fetches detailed system health from the admin endpoint.

```
Usage: codeplane admin health

Output (JSON):
  status      "ok" | "degraded"
  database    { status, latency?, error? }
  components  { [name]: { status, latency?, error? } }  (optional)
```

### `codeplane daemon status`

Shows the operational status of the local daemon.

```
Usage: codeplane daemon status

Output (JSON):
  pid             Process ID
  uptime          Human-readable uptime
  uptime_ms       Uptime in milliseconds
  port            Listening port
  db_mode         "pglite" | "postgresql"
  sync_status     "offline" | "syncing" | "idle" | "error"
  pending_count   Number of pending sync items
  conflict_count  Number of sync conflicts
  last_sync_at    ISO 8601 timestamp or null
  error           Error message or null
  remote_url      Connected remote URL or null
```

## Web UI Design

The web UI exposes health information in the **Admin > System Health** panel. This view:

- Shows the overall system status as a prominent badge ("Healthy" / "Degraded").
- Lists each checked subsystem (database, and any future components) with its status and measured latency.
- If any subsystem is in an error state, shows the error message inline.
- Auto-refreshes on an interval (every 30 seconds) or on manual refresh.
- Is accessible only to admin users; non-admins see a 403 page.

## SDK Shape

The SDK exposes a `healthService` object with:

- `ping(): Promise<{ ok: boolean; error?: string; latency?: string }>` — performs a lightweight database connectivity check and returns the result.

This service is consumed by the admin route handler and may be extended to support additional subsystem checks.

## Documentation

The following documentation should be provided:

- **Operator Guide: Health Checks** — A page explaining all available health endpoints, their paths, expected responses, and recommended use with load balancers (NGINX, HAProxy), Kubernetes probes (livenessProbe, readinessProbe, startupProbe), and monitoring systems (Prometheus blackbox exporter, UptimeRobot, Datadog HTTP checks).
- **CLI Reference: `codeplane health`** — Command usage, flags, output format, and examples.
- **CLI Reference: `codeplane admin health`** — Command usage, required permissions, output format, and examples.
- **CLI Reference: `codeplane daemon status`** — Command usage, output format, field descriptions, and examples.
- **API Reference** — OpenAPI entries for `/health`, `/healthz`, `/readyz`, `/api/health`, `/api/admin/system/health`, and `/api/daemon/status`.

## Permissions & Security

## Authorization Matrix

| Endpoint | Anonymous | Authenticated (non-admin) | Admin |
|---|---|---|---|
| `GET /health` | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| `GET /healthz` | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| `GET /readyz` | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| `GET /api/health` | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| `GET /api/admin/system/health` | ❌ 401 | ❌ 403 | ✅ Allowed |
| `GET /api/daemon/status` | ✅ Allowed (local only) | ✅ Allowed | ✅ Allowed |

## Rate Limiting

- Public health endpoints are subject to the global rate limiter (120 requests/minute per IP).
- This prevents health endpoint abuse from consuming server resources.
- Infrastructure probes should be configured to poll at most once every 5–10 seconds to stay well within limits.
- The admin health endpoint is additionally rate-limited by the global rate limiter. No special escalation is needed since admin usage is inherently low-volume.

## Data Privacy

- Public health endpoints expose no PII, no user data, no configuration details, and no internal state.
- Admin health endpoint exposes database latency and error messages. Error messages must be sanitized to exclude connection strings, passwords, hostnames, or file paths that could aid an attacker.
- Daemon status exposes `remote_url`, which is the URL of the configured remote server. This is acceptable because the daemon runs locally and is not exposed to the internet.
- No health endpoint should ever include stack traces, environment variable values, or internal module paths in its response.

## Telemetry & Product Analytics

## Business Events

| Event Name | When Fired | Properties |
|---|---|---|
| `HealthCheckRequested` | Any public health endpoint is hit | `endpoint` (path), `response_status` (http code), `response_time_ms` |
| `AdminHealthCheckRequested` | Admin system health endpoint is hit | `admin_user_id`, `overall_status` ("ok"/"degraded"), `database_status`, `database_latency_ms` |
| `CLIHealthCheckPerformed` | CLI `codeplane health` command completes | `result_status` ("healthy"/"unhealthy"/"unreachable"), `target_url`, `response_ms` |
| `DaemonStatusRequested` | Daemon status endpoint is hit | `db_mode`, `sync_status`, `pending_count`, `conflict_count`, `has_remote` (boolean) |

**Note:** `HealthCheckRequested` events should be sampled (e.g., 1% sampling rate) to avoid overwhelming the analytics pipeline, since health checks are high-frequency by design.

## Funnel Metrics / Success Indicators

- **Uptime signal reliability:** If `HealthCheckRequested` events stop arriving from a known monitoring source, the monitoring pipeline should alert (dead man's switch).
- **Degraded state frequency:** Ratio of `AdminHealthCheckRequested` events with `overall_status: "degraded"` vs. `"ok"`. Target: <0.1% degraded over any 24-hour window.
- **CLI adoption:** Count of distinct users issuing `CLIHealthCheckPerformed` per week. Indicates operator tooling adoption.
- **Daemon health distribution:** Distribution of `sync_status` values across `DaemonStatusRequested` events. Target: >95% "idle" or "syncing" (not "error" or "offline" with a configured remote).

## Observability

## Logging Requirements

| Event | Log Level | Structured Context |
|---|---|---|
| Server startup complete | `info` | `port`, `db_mode`, `ssh_enabled` |
| Health endpoint hit | *Not logged* (too noisy; rely on metrics) | — |
| Admin health check — healthy | `info` | `admin_user_id`, `database_latency_ms` |
| Admin health check — degraded | `warn` | `admin_user_id`, `database_error`, `database_latency_ms` |
| Database ping failure (background) | `error` | `error_message`, `latency_ms` |
| Daemon status requested | `debug` | `sync_status`, `pending_count`, `conflict_count` |
| Remote health check during daemon connect — success | `info` | `remote_url`, `latency_ms` |
| Remote health check during daemon connect — failure | `warn` | `remote_url`, `error_message`, `http_status` |
| Graceful shutdown initiated | `info` | `signal` ("SIGINT"/"SIGTERM") |

## Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_health_requests_total` | Counter | `endpoint` (`/health`, `/healthz`, `/readyz`, `/api/health`) | Total health endpoint requests |
| `codeplane_health_request_duration_seconds` | Histogram | `endpoint` | Health endpoint response latency (should be <1ms) |
| `codeplane_admin_health_checks_total` | Counter | `status` (`ok`, `degraded`) | Total admin health checks by result |
| `codeplane_admin_health_db_latency_seconds` | Histogram | — | Database ping latency as observed by admin health |
| `codeplane_system_status` | Gauge | `component` (`database`, `ssh`, `scheduler`) | 1 = healthy, 0 = degraded/down |
| `codeplane_daemon_uptime_seconds` | Gauge | — | Daemon uptime in seconds |
| `codeplane_daemon_sync_pending_count` | Gauge | — | Number of pending sync items |
| `codeplane_daemon_sync_conflict_count` | Gauge | — | Number of sync conflicts |
| `codeplane_daemon_sync_status` | Gauge | `status` (`offline`, `syncing`, `idle`, `error`) | 1 for current status, 0 for others |

## Alerts

### Alert: `CodeplaneHealthEndpointDown`

**Condition:** `codeplane_health_requests_total` rate drops to 0 for 5 minutes (when a known probe is configured) OR external blackbox probe fails for 3 consecutive checks.

**Severity:** Critical (P1)

**Runbook:**
1. Check whether the Codeplane server process is running: `ps aux | grep codeplane` or check the systemd service status.
2. Check whether the port is bound: `ss -tlnp | grep 3000`.
3. Attempt a manual health check: `curl -s http://localhost:3000/health`.
4. If the process is running but not responding, check for event loop starvation in logs: `journalctl -u codeplane --since "5 min ago"`.
5. If the process has exited, check exit code and last log lines for OOM kills, unhandled rejections, or segfaults.
6. Restart the service: `systemctl restart codeplane`.
7. If restart fails, check disk space (`df -h`), memory (`free -m`), and database connectivity.
8. Escalate if the service cannot be restored within 15 minutes.

### Alert: `CodeplaneDatabaseDegraded`

**Condition:** `codeplane_system_status{component="database"}` == 0 for 2 minutes OR `codeplane_admin_health_checks_total{status="degraded"}` increases.

**Severity:** Critical (P1)

**Runbook:**
1. Run `codeplane admin health` or hit `GET /api/admin/system/health` to confirm degraded status and see the error message.
2. Check database connectivity: if PostgreSQL, run `pg_isready -h <host> -p <port>`. If PGLite, check disk space and file locks.
3. Check database logs for errors (connection pool exhaustion, disk full, replication lag).
4. Check network connectivity between the Codeplane server and the database host.
5. If connection pool is exhausted, consider restarting Codeplane to reset connections.
6. If disk is full, free space or expand the volume.
7. Verify recovery by re-running `codeplane admin health` and confirming `status: "ok"`.

### Alert: `CodeplaneHealthLatencyHigh`

**Condition:** `codeplane_health_request_duration_seconds` p99 > 500ms for 5 minutes.

**Severity:** Warning (P3)

**Runbook:**
1. Health endpoints should respond in <1ms since they perform no I/O. High latency indicates event loop congestion.
2. Check CPU usage on the Codeplane host: `top` or `htop`.
3. Check active request count and look for slow endpoints consuming the event loop.
4. Check for runaway background jobs (cleanup scheduler, sync engine).
5. If CPU is saturated, consider scaling horizontally or investigating the hottest code paths.

### Alert: `CodeplaneDaemonSyncErrors`

**Condition:** `codeplane_daemon_sync_status{status="error"}` == 1 for 10 minutes.

**Severity:** Warning (P2)

**Runbook:**
1. Run `codeplane daemon status` to get the current error message and remote URL.
2. Check connectivity to the remote: `curl -s <remote_url>/api/health`.
3. If the remote is unreachable, check network, DNS, and firewall rules.
4. If the remote is healthy but sync still fails, check the daemon logs for authentication errors or schema mismatches.
5. Try disconnecting and reconnecting: `codeplane daemon disconnect && codeplane daemon connect <url>`.
6. If conflicts are accumulating, review them with `codeplane daemon conflicts` and resolve or retry.

### Alert: `CodeplaneDaemonConflictAccumulation`

**Condition:** `codeplane_daemon_sync_conflict_count` > 10 for 30 minutes.

**Severity:** Warning (P3)

**Runbook:**
1. Run `codeplane daemon conflicts` to list all current sync conflicts.
2. Review each conflict and determine if it can be automatically retried or requires manual resolution.
3. Use `codeplane daemon retry` to retry resolvable conflicts.
4. Use `codeplane daemon resolve <id>` for conflicts requiring manual intervention.
5. Investigate the root cause — are multiple clients editing the same resources? Is there a schema mismatch?

## Error Cases and Failure Modes

| Failure Mode | Behavior | Detection |
|---|---|---|
| Server process crashed | Health endpoints return connection refused | External blackbox probe, `CodeplaneHealthEndpointDown` alert |
| Server running but event loop blocked | Health endpoints timeout or respond slowly | `CodeplaneHealthLatencyHigh` alert |
| Database unreachable | Public health returns 200 (no DB call); admin health returns 503 degraded | `CodeplaneDatabaseDegraded` alert |
| Database slow but reachable | Public health returns 200; admin health returns 200 with high latency | `codeplane_admin_health_db_latency_seconds` histogram |
| SSH server failed to start | Health endpoints return 200 (SSH failure is non-fatal) | Server startup log warning, `codeplane_system_status{component="ssh"}` gauge |
| Daemon cannot reach remote | Daemon connect returns 400; daemon status shows `sync_status: "error"` | `CodeplaneDaemonSyncErrors` alert |
| Daemon remote responds but is unhealthy | Daemon connect returns 400 with remote HTTP status | CLI error output |
| Rate limit exceeded on health endpoint | Returns 429 Too Many Requests | `codeplane_health_requests_total` counter continues incrementing; probe configuration should be adjusted |
| Malformed URL in CLI `--url` flag | CLI prints human-readable error and exits 1 | Local CLI error handling |

## Verification

## API Integration Tests

### Public Health Endpoints

- [ ] `GET /health` returns 200 with `{ "status": "ok" }`.
- [ ] `GET /healthz` returns 200 with `{ "status": "ok" }`.
- [ ] `GET /readyz` returns 200 with `{ "status": "ok" }`.
- [ ] `GET /api/health` returns 200 with `{ "status": "ok" }`.
- [ ] All four endpoints return `Content-Type: application/json` (or `application/json; charset=utf-8`).
- [ ] `POST /health` returns 404 or 405 (method not allowed).
- [ ] `PUT /health` returns 404 or 405.
- [ ] `DELETE /health` returns 404 or 405.
- [ ] Health endpoint response body is valid JSON parseable by `JSON.parse`.
- [ ] Health endpoint response body contains exactly one key (`status`) with value `"ok"`.
- [ ] Health endpoint responds without any `Authorization` header.
- [ ] Health endpoint responds without any session cookie.
- [ ] Health endpoint response time is under 100ms (performance gate).
- [ ] 50 concurrent requests to `/health` all return 200 with `{ "status": "ok" }` (concurrency test).
- [ ] Health endpoint works on first request after cold server start (no warm-up dependency).

### Admin System Health Endpoint

- [ ] `GET /api/admin/system/health` with admin credentials returns 200 with `status: "ok"`.
- [ ] Response includes `database.status` field.
- [ ] Response includes `database.latency` field matching pattern `\d+ms`.
- [ ] `GET /api/admin/system/health` without credentials returns 401.
- [ ] `GET /api/admin/system/health` with non-admin user credentials returns 403.
- [ ] `GET /api/admin/system/health` with expired/invalid PAT returns 401.
- [ ] When database is degraded, response returns 503 with `status: "degraded"` and `database.status: "error"`.
- [ ] When database is degraded, `database.error` field is a non-empty string.
- [ ] Admin health response body does not contain connection strings, passwords, file paths, or environment variables in any field.

### Daemon Status Endpoint

- [ ] `GET /api/daemon/status` returns 200 with all required fields.
- [ ] `pid` is a positive integer.
- [ ] `uptime_ms` is a non-negative integer.
- [ ] `port` is a string representation of a valid port number.
- [ ] `db_mode` is one of `"pglite"` or `"postgresql"`.
- [ ] `sync_status` is one of `"offline"`, `"syncing"`, `"idle"`, `"error"`.
- [ ] `pending_count` is a non-negative integer.
- [ ] `conflict_count` is a non-negative integer.
- [ ] `last_sync_at` is either `null` or a valid ISO 8601 string.
- [ ] `error` is either `null` or a non-empty string.
- [ ] `remote_url` is either `null` or a valid URL string.
- [ ] Daemon status reflects correct `db_mode` based on startup configuration.

### Daemon Connect Health Verification

- [ ] `POST /api/daemon/connect` with a valid, reachable remote URL succeeds (2xx).
- [ ] `POST /api/daemon/connect` with an unreachable URL returns 400 with error message containing "Cannot reach remote".
- [ ] `POST /api/daemon/connect` with a URL that returns HTTP 500 returns 400 with error message containing the HTTP status code.
- [ ] `POST /api/daemon/connect` with a URL that times out (>10s) returns 400 with a timeout-related error.
- [ ] `POST /api/daemon/connect` with an empty URL string returns 400.

## CLI Integration Tests

- [ ] `codeplane health` against a running server returns exit code 0 and JSON with `"status": "healthy"`.
- [ ] `codeplane health` output includes `response_ms` as a positive number.
- [ ] `codeplane health` output includes `url` matching the default or configured API URL.
- [ ] `codeplane health --url http://localhost:3000` returns the same result as the default.
- [ ] `codeplane health --url http://localhost:99999` (invalid port / unreachable) returns `"status": "unreachable"` with an `error` field.
- [ ] `codeplane health --url http://nonexistent.invalid` returns `"status": "unreachable"` with a DNS-related error.
- [ ] `codeplane health --url ""` (empty string) produces a graceful error, not a stack trace.
- [ ] `codeplane health --url http://localhost:3000/` (trailing slash) still works correctly.
- [ ] `codeplane admin health` with admin credentials returns exit code 0.
- [ ] `codeplane admin health` with admin credentials returns JSON containing `"status"` and `"database"` fields.
- [ ] `codeplane admin health` with non-admin credentials returns exit code 1.
- [ ] `codeplane daemon status` when daemon is running returns exit code 0 with all expected fields.

## End-to-End (E2E) Tests

### Playwright (Web UI)

- [ ] Admin user navigates to the System Health admin page and sees a "Healthy" badge when all systems are operational.
- [ ] Admin user sees database latency displayed on the System Health page.
- [ ] Non-admin user attempting to navigate to the System Health admin page sees a 403 or redirect.
- [ ] The System Health page auto-refreshes and updates the status badge without full page reload.

### API E2E (Against Running Server)

- [ ] Cold-start E2E: start the server, immediately hit `/health`, receive 200. Stop the server.
- [ ] Graceful-shutdown E2E: start the server, send SIGTERM, verify `/health` becomes unreachable within 5 seconds.
- [ ] Multi-endpoint E2E: hit all four public health endpoints in parallel, verify all return identical responses.
- [ ] Rate-limit E2E: send 150 requests to `/health` within 60 seconds from a single IP, verify that requests beyond 120 receive 429.

### CLI E2E

- [ ] Full round-trip: start server → run `codeplane health` → verify "healthy" → stop server → run `codeplane health` → verify "unreachable".
- [ ] Admin round-trip: start server → authenticate as admin → run `codeplane admin health` → verify "ok" → authenticate as non-admin → run `codeplane admin health` → verify failure.
- [ ] Daemon round-trip: start daemon → run `codeplane daemon status` → verify response contains `sync_status: "offline"` and `db_mode: "pglite"` → stop daemon.

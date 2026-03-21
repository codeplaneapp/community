# PLATFORM_SERVICE_REGISTRY_INITIALIZATION

Specification for PLATFORM_SERVICE_REGISTRY_INITIALIZATION.

## High-Level User POV

When a user deploys Codeplane — whether as a self-hosted server, a local daemon on their laptop, or embedded inside the desktop application — the system must reliably and predictably come to life. The service registry initialization is the foundational startup event that determines whether Codeplane is ready to serve requests. It is the moment that decides which capabilities the user will have access to during that session.

From the user's perspective, this manifests in several critical ways. When a self-hosting administrator starts the Codeplane server process, they expect to hit the health endpoint and receive a clear signal that the system is ready — or, if something went wrong, a clear signal about what is degraded. They expect repositories, issues, workflows, workspaces, and every other product surface to be fully operational once the health check passes. If optional infrastructure like a container runtime is not available, the system should still start and serve the features it can, while clearly communicating that workspace-related features are unavailable.

For a developer using Codeplane in daemon mode on their local machine, the experience should be seamless: the daemon starts, connects to a local database, and surfaces like issues, landing requests, sync, and editor integrations become available within seconds. If the developer later connects to a remote Codeplane server via the daemon, the sync service should initialize cleanly and begin reconciling state without disrupting the features that were already working locally.

For the desktop application user, the experience is even more invisible. They launch the app, and the embedded daemon starts in the background. A tray icon appears, the web UI loads, and the system is ready. The user should never see a partially-initialized state — either the app is ready, or it reports what went wrong during startup.

In all deployment modes, the user's core expectation is: Codeplane starts reliably, starts fast, communicates its readiness state honestly, degrades gracefully when optional components are unavailable, and shuts down cleanly without losing in-flight work. The service registry is the internal mechanism that makes this possible, but the user experiences it as "Codeplane just works when I start it."

## Acceptance Criteria

### Definition of Done

The service registry initialization feature is complete when Codeplane boots in all three deployment modes (server, daemon, desktop), all required services are initialized in the correct order, optional services degrade gracefully, health endpoints accurately reflect readiness, and the system handles all failure modes without crashing or entering an inconsistent state.

### Core Initialization

- [ ] The service registry MUST initialize all 19 core services (user, repo, issue, label, milestone, landing, org, wiki, search, webhook, workflow, notification, secret, release, oauth2, lfs, sse, workspace, preview, billing) as singletons.
- [ ] Services MUST be initialized only after the database connection is established and verified.
- [ ] The SSE manager MUST be initialized with a live database connection for PostgreSQL LISTEN/NOTIFY support.
- [ ] The feature flag service MUST be initialized and flags loaded before any route is mounted.
- [ ] The cleanup scheduler MUST be started after services are initialized, running all 6 background jobs (idle workspace cleanup, expired token cleanup, stale session cleanup, stale workflow run cleanup, sync queue cleanup, artifact expiry cleanup).
- [ ] The SSH server MUST be started on a best-effort basis — SSH startup failure MUST NOT prevent the HTTP server from starting.
- [ ] All route families (23 total) MUST be mounted after the service registry is fully initialized.

### Deployment Mode Support

- [ ] **Server mode**: MUST initialize with a PostgreSQL database connection (configured via `CODEPLANE_DATABASE_URL` or individual `CODEPLANE_DB_*` environment variables).
- [ ] **Daemon mode**: MUST initialize with PGLite (in-process WASM PostgreSQL) when `CODEPLANE_DB_MODE=pglite`, storing data in `CODEPLANE_DATA_DIR/db/` (default `./data/db/`).
- [ ] **Desktop mode**: MUST embed the daemon in-process using PGLite and start the web UI from the local daemon URL.
- [ ] The sync service in daemon mode MUST be lazily initialized — only created when the user explicitly connects to a remote server via `POST /api/daemon/connect`.

### Graceful Degradation

- [ ] If the container sandbox client (Docker/Podman) is unavailable, initialization MUST succeed with workspace and preview features disabled.
- [ ] If the SSE manager fails to start its LISTEN subscriptions, initialization MUST succeed with a warning logged — SSE is best-effort, especially in PGLite mode.
- [ ] If the SSH server fails to bind its port, initialization MUST succeed and the HTTP server MUST continue operating.
- [ ] Unavailable optional features MUST be clearly logged at startup so administrators can diagnose their deployment.

### Health and Readiness

- [ ] `GET /health`, `GET /healthz`, `GET /readyz`, and `GET /api/health` MUST return `{"status": "ok"}` with HTTP 200 once all required services are initialized.
- [ ] Health endpoints MUST NOT require authentication.
- [ ] Health endpoints MUST return `{"status": "shutting_down"}` with HTTP 503 once a shutdown signal has been received.
- [ ] The public feature flags endpoint `GET /api/feature-flags` MUST return the current flag state without authentication.

### Singleton and Ordering Guarantees

- [ ] Calling `getServices()` before `initServices()` MUST throw a clear error: `"Services not initialized"`.
- [ ] Calling `getDb()` before `initDb()` MUST throw a clear error: `"Database not initialized"`.
- [ ] `initServices()` MUST be idempotent — calling it multiple times MUST return the same singleton instance (or throw if the registry is already initialized).
- [ ] The initialization order MUST be: database → service registry → feature flags → SSH server → cleanup scheduler → middleware → route mounting.

### Shutdown

- [ ] On `SIGINT` or `SIGTERM`, the cleanup scheduler MUST be stopped first.
- [ ] Preview environments MUST be cleaned up during shutdown.
- [ ] The SSH server MUST be stopped during shutdown.
- [ ] The database connection pool MUST be drained and closed during shutdown.
- [ ] Shutdown MUST complete within a configurable deadline (`CODEPLANE_SHUTDOWN_TIMEOUT_MS`, default 30 seconds).

### Configuration Boundaries

- [ ] `CODEPLANE_SSH_PORT` MUST default to `2222` and accept any valid port number (1–65535).
- [ ] `CODEPLANE_SSH_HOST` MUST default to `0.0.0.0`.
- [ ] `CODEPLANE_SSH_ENABLED` MUST default to `true` and accept `"true"` or `"false"`.
- [ ] `CODEPLANE_SSH_MAX_CONNS` MUST default to `0` (unlimited).
- [ ] `CODEPLANE_SSH_MAX_CONNS_IP` MUST default to `0` (unlimited).
- [ ] `CODEPLANE_CONTAINER_RUNTIME` MUST default to `"docker"` and accept `"docker"` or `"podman"`.
- [ ] `CODEPLANE_WORKSPACE_SSH_HOST` MUST fall back to `"localhost"` when not set.
- [ ] Feature flags MUST be overridable via `CODEPLANE_FEATURE_FLAGS_<FLAG_NAME>` environment variables.
- [ ] Environment variable names containing invalid characters MUST be rejected with a clear error message.
- [ ] Empty string values for required environment variables (e.g., `CODEPLANE_DATABASE_URL=""`) MUST be treated as unset, falling back to defaults.

### Edge Cases

- [ ] If the database is unreachable at startup, initialization MUST fail fast with a clear error — the system MUST NOT start in a degraded state without a database.
- [ ] If PGLite data directory does not exist, it MUST be created automatically.
- [ ] If PGLite data directory exists but is corrupt, initialization MUST fail with a clear error message identifying the data directory path.
- [ ] Concurrent calls to `initServices()` MUST be safe — only one initialization should proceed.
- [ ] If a cleanup scheduler job throws an error, it MUST be caught, logged, and MUST NOT affect other cleanup jobs or the main server.
- [ ] If the SSH port is already in use, the SSH server MUST fail to start but the HTTP server MUST continue.

## Design

### Health Endpoint Design

The health endpoint is the primary user-facing surface of the service registry initialization. It serves as the readiness probe for container orchestrators (Kubernetes, Docker Compose), load balancers, and monitoring systems.

**Endpoints:**

| Path | Purpose | Auth Required |
|------|---------|---------------|
| `GET /health` | Liveness check | No |
| `GET /healthz` | Kubernetes liveness probe | No |
| `GET /readyz` | Kubernetes readiness probe | No |
| `GET /api/health` | API-scoped health check | No |

**Response when ready:**
```json
{ "status": "ok" }
```

**Response during shutdown:**
```json
{
  "status": "shutting_down",
  "shutdown_initiated_at": "2026-03-21T12:00:00.000Z"
}
```

### Feature Flags Endpoint Design

The feature flags endpoint exposes the current product capability state, allowing clients to adapt their UI and behavior based on what the server has enabled.

**Endpoint:** `GET /api/feature-flags`

**Response:**
```json
{
  "workspaces": true,
  "agents": true,
  "preview": true,
  "sync": true,
  "billing": true,
  "readout_dashboard": true,
  "landing_queue": true,
  "tool_skills": true,
  "tool_policies": true,
  "repo_snapshots": true,
  "integrations": true,
  "session_replay": true,
  "secrets_manager": true,
  "web_editor": true,
  "client_error_reporting": true,
  "client_metrics": true
}
```

### Daemon Status Endpoint Design

In daemon mode, the user can query the daemon's operational state, which reflects the service registry's runtime health.

**Endpoint:** `GET /api/daemon/status`

**Response:**
```json
{
  "uptime": 3600,
  "db_mode": "pglite",
  "sync_status": "connected",
  "pending_count": 3,
  "conflict_count": 0
}
```

### CLI Design

The CLI provides commands that interact with the service registry lifecycle:

- `codeplane serve` — Starts the server in full server mode. Initializes the complete service registry with PostgreSQL.
- `codeplane daemon start` — Starts the daemon in PGLite mode. Initializes the service registry with local-first settings.
- `codeplane daemon stop` — Sends a shutdown signal to the daemon, triggering graceful shutdown.
- `codeplane daemon status` — Queries `GET /api/daemon/status` to display the current daemon state, including sync status and pending/conflict counts.
- `codeplane health` — Queries the health endpoint and displays the server's readiness state.

**CLI output for `codeplane health`:**
```
✓ Codeplane is healthy
  Status: ok
  URL: http://localhost:3000
```

**CLI output for `codeplane health` when server is shutting down:**
```
⚠ Codeplane is shutting down
  Status: shutting_down
  Shutdown initiated: 2026-03-21T12:00:00Z
```

**CLI output for `codeplane health` when server is unreachable:**
```
✗ Codeplane is not reachable
  URL: http://localhost:3000
  Error: Connection refused
```

### TUI Design

The TUI dashboard screen displays the connection status to the Codeplane server or daemon. The sync status screen shows:

- Whether the daemon is connected to a remote server
- The number of pending sync items
- The number of sync conflicts
- The uptime of the daemon

### Desktop App Design

The desktop application starts the embedded daemon automatically on launch. The tray icon reflects the daemon's state:

- **Green dot**: Daemon is running and healthy
- **Yellow dot**: Daemon is running but sync has conflicts
- **Red dot**: Daemon failed to start

The tray menu provides:

- "Status" — Shows daemon uptime, sync status, pending/conflict counts
- "Force Sync" — Triggers an immediate sync flush
- "Restart Daemon" — Stops and restarts the embedded daemon

### VS Code Extension Design

The VS Code extension interacts with the daemon's service registry state through:

- A status bar item showing the daemon connection state (connected/disconnected/error)
- A "Codeplane: Check Health" command that queries the health endpoint
- Automatic daemon startup when the extension activates (if configured)

### Neovim Plugin Design

The Neovim plugin provides:

- `:Codeplane health` command to check daemon/server health
- `:Codeplane daemon start` and `:Codeplane daemon stop` for lifecycle management
- Statusline integration showing daemon connection state

### SDK Shape

The SDK exposes the following public API for service registry consumers:

```typescript
// Database initialization
async function initDb(): Promise<void>
function getDb(): Sql
async function closeDb(): Promise<void>

// Service registry
function initServices(): Services
function getServices(): Services

// Services interface
interface Services {
  user: UserService
  repo: RepoService
  issue: IssueService
  label: LabelService
  milestone: MilestoneService
  landing: LandingService
  org: OrgService
  wiki: WikiService
  search: SearchService
  webhook: WebhookService
  workflow: WorkflowService
  notification: NotificationService
  secret: SecretService
  release: ReleaseService
  oauth2: OAuth2Service
  lfs: LfsService
  sse: SSEManager
  workspace: WorkspaceService
  preview: PreviewService
  billing: BillingService
}

// Feature flags
function getFeatureFlagService(): FeatureFlagService
```

### Documentation

The following documentation should be written for end users:

1. **Self-Hosting Guide — Startup Configuration**: Document all environment variables that affect server startup, their defaults, and valid values. Include a table of all `CODEPLANE_*` variables with descriptions, defaults, and examples.

2. **Health Checks Reference**: Document the health endpoints, their response shapes, and how to use them with Kubernetes probes, Docker Compose health checks, and monitoring tools.

3. **Feature Flags Reference**: Document all available feature flags, their defaults, and how to override them via environment variables. Include guidance on which flags disable which product surfaces.

4. **Daemon Mode Guide**: Document how to start Codeplane in daemon mode, how to connect to a remote server, and how to monitor sync status. Include troubleshooting for common daemon startup failures.

5. **Desktop App Quick Start**: Document the expected startup behavior, tray icon states, and how to troubleshoot startup failures.

6. **Deployment Troubleshooting**: Document common startup failure scenarios (database unreachable, port in use, container runtime unavailable) and their resolutions.

## Permissions & Security

### Authorization Roles

| Surface | Required Role |
|---------|---------------|
| `GET /health`, `/healthz`, `/readyz`, `/api/health` | Anonymous (no auth required) |
| `GET /api/feature-flags` | Anonymous (no auth required) |
| `GET /api/daemon/status` | Local access only (daemon mode) |
| `POST /api/daemon/connect` | Local access only (daemon mode) |
| `POST /api/daemon/disconnect` | Local access only (daemon mode) |
| `POST /api/daemon/sync` | Local access only (daemon mode) |
| `GET /api/daemon/conflicts` | Local access only (daemon mode) |
| `POST /api/daemon/conflicts/:id/resolve` | Local access only (daemon mode) |
| `POST /api/daemon/conflicts/:id/retry` | Local access only (daemon mode) |
| Admin health dashboard | Admin role required |

### Rate Limiting

- Health endpoints (`/health`, `/healthz`, `/readyz`, `/api/health`) MUST be exempt from rate limiting to allow continuous probe access from orchestrators.
- The feature flags endpoint MUST be rate-limited at 120 requests/minute per IP to prevent abuse.
- Daemon endpoints MUST be accessible only from localhost — no rate limiting needed since they are not externally exposed.
- During shutdown, health endpoints MUST continue to respond (with 503) and remain exempt from rate limiting.

### Data Privacy and Security

- Health endpoints MUST NOT expose internal service names, versions, database connection strings, or infrastructure details.
- Feature flags MUST NOT expose user-specific data — the response is the same for all callers.
- Daemon status MUST NOT be accessible from external networks. The daemon listener should bind to `127.0.0.1` only.
- Database credentials, SSH host keys, and service tokens MUST NOT appear in startup logs, even at debug level.
- PGLite data directories MUST have restrictive filesystem permissions (owner-only read/write).
- Error messages during initialization MUST NOT leak connection strings or credentials — they should reference the environment variable name, not its value.

## Telemetry & Product Analytics

### Key Business Events

| Event | When Fired | Properties |
|-------|------------|------------|
| `ServerStarted` | Server is fully initialized and accepting requests | `deployment_mode` (server/daemon/desktop), `db_mode` (postgres/pglite), `ssh_enabled`, `container_runtime_available`, `feature_flags_loaded_count`, `startup_duration_ms`, `services_initialized_count` |
| `ServerShutdownInitiated` | SIGINT/SIGTERM received | `deployment_mode`, `uptime_seconds`, `active_connections_count`, `pending_cleanup_items` |
| `ServerShutdownCompleted` | Graceful shutdown finished | `deployment_mode`, `shutdown_duration_ms`, `shutdown_reason` (signal/error), `cleanup_errors_count` |
| `DaemonConnected` | Daemon connects to a remote server | `remote_url_host` (hostname only, no credentials), `sync_mode` |
| `DaemonDisconnected` | Daemon disconnects from remote | `uptime_seconds`, `total_synced_items`, `total_conflicts` |
| `ServiceDegraded` | An optional service fails to initialize | `service_name` (ssh/container_sandbox/sse), `error_category`, `deployment_mode` |
| `FeatureFlagsLoaded` | Feature flags loaded successfully | `flags_enabled_count`, `flags_disabled_count`, `overridden_flags` (list of flag names overridden via env) |
| `CleanupJobCompleted` | A cleanup scheduler job finishes | `job_name`, `items_cleaned`, `duration_ms`, `errors_count` |

### Funnel Metrics and Success Indicators

- **Startup success rate**: Percentage of server start attempts that reach the `ServerStarted` event. Target: >99.9%.
- **Startup latency (P50, P95, P99)**: Time from process start to `ServerStarted`. Target: P95 < 5 seconds for server mode, P95 < 3 seconds for daemon mode.
- **Degraded startup rate**: Percentage of startups where one or more optional services fail. This should be tracked and trended — a rising rate indicates infrastructure or configuration issues.
- **Graceful shutdown success rate**: Percentage of shutdowns that complete within the timeout deadline. Target: >99.5%.
- **Daemon connection success rate**: Percentage of `POST /api/daemon/connect` calls that succeed. Target: >95% (lower because it depends on remote server availability).
- **Cleanup job error rate**: Percentage of cleanup job runs that encounter errors. Target: <1%.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields |
|-----------|-------|-------------------|
| Database initialized | `info` | `db_mode`, `db_host` (postgres only, no password), `duration_ms` |
| Service registry initialized | `info` | `services_count`, `duration_ms` |
| Feature flags loaded | `info` | `flags_count`, `overrides` (list of overridden flag names) |
| SSH server started | `info` | `ssh_port`, `ssh_host` |
| SSH server failed to start | `warn` | `error_message`, `ssh_port` |
| Cleanup scheduler started | `info` | `job_count`, `job_names` |
| Container sandbox client unavailable | `warn` | `runtime` (docker/podman), `error_message` |
| SSE manager start failed | `warn` | `error_message` |
| Health check responded | `debug` | `status`, `path`, `response_code` |
| Shutdown signal received | `info` | `signal` (SIGINT/SIGTERM), `uptime_seconds` |
| Shutdown phase completed | `info` | `phase` (cleanup_scheduler/preview/ssh/database), `duration_ms` |
| Shutdown completed | `info` | `total_duration_ms`, `errors` |
| Cleanup job completed | `debug` | `job_name`, `items_cleaned`, `duration_ms` |
| Cleanup job failed | `error` | `job_name`, `error_message`, `stack_trace` |
| Daemon connected to remote | `info` | `remote_host`, `sync_started` |
| Daemon disconnected from remote | `info` | `uptime_seconds` |
| PGLite data directory created | `info` | `data_dir` |
| Service access before initialization | `error` | `caller` |

### Prometheus Metrics

**Counters:**
- `codeplane_server_starts_total{mode, db_mode, result}` — Total server start attempts, labeled by deployment mode and outcome (success/failure).
- `codeplane_server_shutdowns_total{mode, reason, result}` — Total shutdown attempts.
- `codeplane_cleanup_job_runs_total{job_name, result}` — Cleanup job execution count.
- `codeplane_cleanup_items_cleaned_total{job_name}` — Total items cleaned by each job.
- `codeplane_service_degradations_total{service_name}` — Count of optional service initialization failures.
- `codeplane_health_checks_total{path, status}` — Health endpoint request count.

**Gauges:**
- `codeplane_server_uptime_seconds` — Current server uptime.
- `codeplane_services_initialized{service_name}` — 1 if service is initialized, 0 if degraded.
- `codeplane_feature_flags_enabled_total` — Number of feature flags currently enabled.
- `codeplane_cleanup_scheduler_active` — 1 if cleanup scheduler is running, 0 if stopped.
- `codeplane_ssh_server_active` — 1 if SSH server is running, 0 if not.
- `codeplane_container_runtime_available` — 1 if container sandbox is available, 0 if not.
- `codeplane_daemon_sync_pending_count` — Number of items in the sync queue (daemon mode).
- `codeplane_daemon_sync_conflict_count` — Number of sync conflicts (daemon mode).

**Histograms:**
- `codeplane_server_startup_duration_seconds{mode}` — Server startup latency distribution.
- `codeplane_server_shutdown_duration_seconds{mode}` — Shutdown latency distribution.
- `codeplane_cleanup_job_duration_seconds{job_name}` — Cleanup job execution time distribution.
- `codeplane_health_check_duration_seconds{path}` — Health endpoint response latency.

### Alerts

#### Alert: `CodeplaneStartupFailure`
**Condition:** `codeplane_server_starts_total{result="failure"}` increases.
**Severity:** Critical
**Runbook:**
1. Check server logs for the initialization error: `journalctl -u codeplane --since "5 minutes ago" | grep -i "error\|fatal"`.
2. Most common causes: database unreachable (check `CODEPLANE_DATABASE_URL` and network connectivity), PGLite data corruption (check `CODEPLANE_DATA_DIR/db/` permissions and integrity), port conflict (check if `CODEPLANE_SSH_PORT` is already bound).
3. If database is unreachable: verify PostgreSQL is running, check firewall rules, verify credentials.
4. If PGLite is corrupt: back up the data directory, delete and reinitialize. Data will be re-synced from the remote server on next daemon connect.
5. Restart the Codeplane process after resolving the root cause.

#### Alert: `CodeplaneShutdownTimeout`
**Condition:** `codeplane_server_shutdown_duration_seconds` > 30 seconds (or configured `CODEPLANE_SHUTDOWN_TIMEOUT_MS`).
**Severity:** Warning
**Runbook:**
1. Check which shutdown phase is taking too long: look for "Shutdown phase completed" log entries and identify the stalled phase.
2. If preview cleanup is slow: check container runtime responsiveness. There may be hung containers.
3. If database drain is slow: there may be long-running queries. Check active database connections.
4. If SSH shutdown is slow: there may be active SSH sessions. Check `codeplane_ssh_active_connections` gauge.
5. Consider reducing `CODEPLANE_SHUTDOWN_TIMEOUT_MS` if the system can tolerate faster forced shutdown.

#### Alert: `CodeplaneServiceDegraded`
**Condition:** `codeplane_services_initialized{service_name}` is 0 for any service.
**Severity:** Warning
**Runbook:**
1. Check which service is degraded via `codeplane_services_initialized` gauge labels.
2. If SSH server: check port availability (`ss -tlnp | grep 2222`), check `CODEPLANE_SSH_ENABLED` setting, verify SSH host key exists.
3. If container sandbox: verify Docker/Podman is installed and the daemon is running (`docker info` or `podman info`). Check `CODEPLANE_CONTAINER_RUNTIME` setting.
4. If SSE manager: check PostgreSQL LISTEN/NOTIFY support. In PGLite mode, SSE degradation is expected — no action needed.
5. Degraded services do not require immediate action unless they affect user-facing features that the deployment needs.

#### Alert: `CodeplaneCleanupJobFailures`
**Condition:** Rate of `codeplane_cleanup_job_runs_total{result="error"}` > 5 in 10 minutes.
**Severity:** Warning
**Runbook:**
1. Check cleanup job error logs: filter by `job_name` structured field.
2. If workspace cleanup fails: check container runtime health and workspace table integrity.
3. If token cleanup fails: check for database connectivity issues.
4. If artifact cleanup fails: check blob store connectivity and permissions.
5. Individual job failures are non-fatal. Only escalate if the same job fails repeatedly, as this may indicate a persistent infrastructure issue.

#### Alert: `CodeplaneHighSyncConflicts`
**Condition:** `codeplane_daemon_sync_conflict_count` > 10.
**Severity:** Warning
**Runbook:**
1. This alert is daemon-mode specific. Check the daemon's conflict list: `codeplane daemon conflicts`.
2. Review each conflict to determine if it can be auto-resolved or needs manual intervention.
3. Common causes: concurrent edits to the same resource from multiple devices, stale sync state after a long offline period.
4. Use `codeplane daemon conflicts resolve <id>` or `codeplane daemon conflicts retry <id>` to address individual conflicts.
5. If conflicts are systemic, consider disconnecting and reconnecting the daemon: `codeplane daemon disconnect && codeplane daemon connect`.

### Error Cases and Failure Modes

| Failure Mode | Impact | Recovery |
|--------------|--------|----------|
| Database unreachable at startup | Fatal — server cannot start | Fix database connectivity and restart |
| PGLite data directory missing | Non-fatal — directory created automatically | Automatic |
| PGLite data directory corrupt | Fatal — server cannot start | Delete data directory and restart; data re-syncs on next connect |
| SSH port already in use | Degraded — SSH transport unavailable | Free the port or change `CODEPLANE_SSH_PORT` and restart |
| Container runtime unavailable | Degraded — workspace/preview features disabled | Install/start Docker or Podman |
| SSE LISTEN/NOTIFY failure | Degraded — real-time streaming may not work | Check PostgreSQL connection; PGLite mode has limited SSE support |
| Feature flag environment variable malformed | Non-fatal — flag uses default value | Fix environment variable |
| Shutdown timeout exceeded | Forced exit — in-flight requests may be dropped | Increase `CODEPLANE_SHUTDOWN_TIMEOUT_MS` or investigate hung subsystem |
| Cleanup job database error | Non-fatal — job retries on next interval | Investigate database connectivity |
| Daemon remote server unreachable on connect | Connect fails — daemon continues in local-only mode | Fix remote server URL/connectivity and retry connect |

## Verification

### API Integration Tests

- [ ] **Startup: Server mode with PostgreSQL** — Start the server with a valid PostgreSQL connection string. Verify `GET /health` returns `{"status": "ok"}` with HTTP 200.
- [ ] **Startup: Daemon mode with PGLite** — Start the server with `CODEPLANE_DB_MODE=pglite`. Verify `GET /health` returns `{"status": "ok"}` with HTTP 200.
- [ ] **Startup: PGLite creates data directory** — Start with `CODEPLANE_DB_MODE=pglite` and a non-existent `CODEPLANE_DATA_DIR`. Verify the data directory is created and the server starts successfully.
- [ ] **Health endpoint: all paths** — Verify `GET /health`, `GET /healthz`, `GET /readyz`, and `GET /api/health` all return `{"status": "ok"}` with HTTP 200.
- [ ] **Health endpoint: no auth required** — Verify all health endpoints return 200 without any authentication headers or cookies.
- [ ] **Feature flags endpoint: returns all flags** — Verify `GET /api/feature-flags` returns a JSON object with all 16 flags and their boolean values.
- [ ] **Feature flags endpoint: no auth required** — Verify `GET /api/feature-flags` returns 200 without authentication.
- [ ] **Feature flags: environment override** — Set `CODEPLANE_FEATURE_FLAGS_WORKSPACES=false`, restart the server. Verify `GET /api/feature-flags` returns `workspaces: false`.
- [ ] **Feature flags: multiple overrides** — Set multiple `CODEPLANE_FEATURE_FLAGS_*` variables. Verify all are reflected in the response.
- [ ] **Service access before init: getServices()** — In a test harness, call `getServices()` before `initServices()`. Verify it throws `"Services not initialized"`.
- [ ] **Service access before init: getDb()** — In a test harness, call `getDb()` before `initDb()`. Verify it throws `"Database not initialized"`.
- [ ] **All routes accessible after init** — After server startup, verify at least one endpoint in each of the 23 route families responds (not 404).
- [ ] **Middleware stack applied** — Verify responses include `X-Request-Id` header (request ID middleware). Verify CORS headers are present for cross-origin requests.
- [ ] **Rate limiting applied** — Send 121 requests to a rate-limited endpoint within 1 minute. Verify the 121st request returns HTTP 429.
- [ ] **Rate limiting not applied to health** — Send 200 requests to `GET /health` within 1 minute. Verify all return HTTP 200.

### Daemon Mode Integration Tests

- [ ] **Daemon status before connect** — Start in daemon mode. Verify `GET /api/daemon/status` returns `sync_status: "disconnected"` and `pending_count: 0`.
- [ ] **Daemon connect** — Start daemon mode and call `POST /api/daemon/connect` with a valid remote URL and token. Verify response indicates successful connection.
- [ ] **Daemon connect: invalid remote URL** — Call `POST /api/daemon/connect` with an unreachable remote URL. Verify it returns an error without crashing the daemon.
- [ ] **Daemon disconnect** — After connecting, call `POST /api/daemon/disconnect`. Verify `GET /api/daemon/status` returns `sync_status: "disconnected"`.
- [ ] **Daemon force sync** — After connecting, call `POST /api/daemon/sync`. Verify it completes without error.
- [ ] **Daemon conflicts list** — Verify `GET /api/daemon/conflicts` returns an array (possibly empty).

### Graceful Shutdown Tests

- [ ] **SIGINT shutdown** — Send SIGINT to a running server. Verify the process exits with code 0.
- [ ] **SIGTERM shutdown** — Send SIGTERM to a running server. Verify the process exits with code 0.
- [ ] **Health returns 503 during shutdown** — Send SIGTERM, then immediately query `GET /health`. Verify it returns `{"status": "shutting_down"}` with HTTP 503.
- [ ] **Shutdown order** — Send SIGTERM and verify logs show shutdown phases in order: cleanup scheduler stopped, preview cleanup completed, SSH server stopped, database closed.
- [ ] **Shutdown within timeout** — Send SIGTERM and verify the process exits within 30 seconds (default timeout).

### Degraded Startup Tests

- [ ] **SSH disabled** — Start with `CODEPLANE_SSH_ENABLED=false`. Verify the server starts, health returns OK, and SSH port is not listening.
- [ ] **SSH port conflict** — Start with a port that is already in use. Verify the server starts, health returns OK, and a warning is logged.
- [ ] **Container runtime unavailable** — Start without Docker/Podman installed. Verify the server starts, health returns OK, and workspace endpoints return appropriate errors.
- [ ] **Invalid database URL** — Start with an unreachable database URL. Verify the server fails to start with a clear error message.
- [ ] **Empty database URL** — Start with `CODEPLANE_DATABASE_URL=""`. Verify the server falls back to default database configuration.

### Cleanup Scheduler Tests

- [ ] **Cleanup jobs start on boot** — Verify cleanup scheduler is active after server startup (check logs or metrics).
- [ ] **Idle workspace cleanup** — Create a workspace, let it become idle. Verify the cleanup job marks it as suspended.
- [ ] **Expired token cleanup** — Create an auth session with a past expiry. Verify the cleanup job removes it.
- [ ] **Stale workflow run cleanup** — Create a workflow run stuck in "running" for >1 hour. Verify the cleanup job marks it as failed.
- [ ] **Cleanup job error isolation** — Force one cleanup job to fail (e.g., by corrupting its expected table). Verify other cleanup jobs continue running.
- [ ] **Cleanup scheduler stops on shutdown** — Send SIGTERM and verify cleanup jobs stop firing.

### CLI Tests

- [ ] **`codeplane health` when server is running** — Start the server, run `codeplane health`. Verify output shows "healthy" status.
- [ ] **`codeplane health` when server is unreachable** — Run `codeplane health` without a running server. Verify output shows "not reachable" with an error message.
- [ ] **`codeplane daemon start`** — Run `codeplane daemon start`. Verify the daemon starts and `codeplane health` succeeds.
- [ ] **`codeplane daemon status`** — After daemon start, run `codeplane daemon status`. Verify output shows uptime, db_mode, and sync_status.
- [ ] **`codeplane daemon stop`** — After daemon start, run `codeplane daemon stop`. Verify the daemon process exits cleanly.
- [ ] **`codeplane serve`** — Run `codeplane serve`. Verify the full server starts and `codeplane health` succeeds.

### Playwright (Web UI) E2E Tests

- [ ] **App loads after server init** — Navigate to the Codeplane web UI root URL. Verify the app loads without errors and the sidebar appears.
- [ ] **Feature-gated routes hidden when flag is off** — Start the server with `CODEPLANE_FEATURE_FLAGS_WORKSPACES=false`. Navigate to the workspaces route. Verify the route is not accessible or shows a "feature not available" message.
- [ ] **Health status visible in admin dashboard** — Log in as admin. Navigate to the admin health view. Verify server status is displayed.

### Configuration Boundary Tests

- [ ] **SSH port: minimum valid (1)** — Start with `CODEPLANE_SSH_PORT=1`. Verify the server attempts to bind (may fail due to permissions, but the value is accepted).
- [ ] **SSH port: maximum valid (65535)** — Start with `CODEPLANE_SSH_PORT=65535`. Verify the server attempts to bind.
- [ ] **SSH port: invalid (0)** — Start with `CODEPLANE_SSH_PORT=0`. Verify appropriate error or fallback behavior.
- [ ] **SSH port: invalid (65536)** — Start with `CODEPLANE_SSH_PORT=65536`. Verify appropriate error or fallback behavior.
- [ ] **SSH port: non-numeric** — Start with `CODEPLANE_SSH_PORT=abc`. Verify appropriate error handling.
- [ ] **Container runtime: valid docker** — Start with `CODEPLANE_CONTAINER_RUNTIME=docker`. Verify accepted.
- [ ] **Container runtime: valid podman** — Start with `CODEPLANE_CONTAINER_RUNTIME=podman`. Verify accepted.
- [ ] **Container runtime: invalid value** — Start with `CODEPLANE_CONTAINER_RUNTIME=lxc`. Verify appropriate error or fallback.
- [ ] **Feature flag name: maximum valid length** — Set a feature flag override with a flag name of 256 characters. Verify it is processed without error (even if not recognized).
- [ ] **Feature flag name: exceeds maximum** — Set a feature flag override with a flag name of 1024 characters. Verify it is handled gracefully.
- [ ] **Multiple deployment mode conflict** — Set both `CODEPLANE_DATABASE_URL` and `CODEPLANE_DB_MODE=pglite`. Verify one takes precedence clearly (PGLite should win if `CODEPLANE_DB_MODE=pglite` is explicit).

### Concurrency and Stress Tests

- [ ] **Concurrent health checks under startup load** — During server startup, send 100 concurrent requests to `GET /health`. Verify no crashes and all requests receive a response (either 200 or 503).
- [ ] **Rapid SIGTERM during startup** — Send SIGTERM to the server process during the initialization sequence. Verify the process exits without hanging or crashing.
- [ ] **Multiple SIGTERM signals** — Send SIGTERM twice in rapid succession. Verify the server handles it gracefully (shutdown is idempotent).

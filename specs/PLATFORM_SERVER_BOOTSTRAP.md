# PLATFORM_SERVER_BOOTSTRAP

Specification for PLATFORM_SERVER_BOOTSTRAP.

## High-Level User POV

When a self-hosting administrator, platform operator, or developer launches Codeplane for the first time — or restarts it after an upgrade — the server must come to life reliably, predictably, and quickly. The bootstrap sequence is the critical path between "I ran the start command" and "my team can use Codeplane." If it fails, nothing else in the product works. If it succeeds partially, users may encounter confusing behavior: repositories that can't be cloned over SSH, notifications that don't stream, workspaces that can't be created, or feature flags that don't match what the admin configured.

From the administrator's perspective, starting Codeplane should feel like starting any well-behaved server application. You set a handful of environment variables — database connection, ports, data directory — and run the process. The server initializes its database connection, creates all the internal services it needs, loads the feature flag configuration, starts an SSH server for repository transport and workspace access, launches background housekeeping jobs, applies its HTTP middleware stack, mounts all API routes, and begins listening for requests. Each phase either succeeds or produces a clear, actionable error message. The admin should be able to tell from the startup logs exactly what happened, what is ready, and what (if anything) degraded gracefully rather than hard-failing.

For daemon and desktop users, the same bootstrap sequence applies but in a local-first context. The daemon boots with an embedded PGLite database instead of external PostgreSQL, listens on localhost, and prepares the same service surface. The desktop app embeds this daemon transparently, so from the desktop user's perspective the app simply opens and works — but under the hood, the full server bootstrap sequence has run within the application process.

The bootstrap sequence must also be resilient. Not every subsystem is equally critical. If the SSH server can't bind to its port (perhaps another process is using it), the HTTP API should still start and serve web, CLI, and TUI clients. If the container runtime isn't available, workspace features should degrade gracefully rather than crash the process. The administrator should see clear log messages explaining what degraded and why, so they can fix the issue without guessing.

The end result is that Codeplane moves from "process started" to "fully operational" in a deterministic, observable, and fault-tolerant way — giving administrators confidence in deployments, upgrades, and recovery scenarios.

## Acceptance Criteria

### Definition of Done

The PLATFORM_SERVER_BOOTSTRAP feature is complete when all of the following are true:

**Database Initialization**
- [ ] The server initializes a database connection as the first step in the boot sequence.
- [ ] In server mode (`CODEPLANE_DB_MODE=postgres` or unset), the server connects to an external PostgreSQL database using either `CODEPLANE_DATABASE_URL` or individual `CODEPLANE_DB_HOST`, `CODEPLANE_DB_PORT`, `CODEPLANE_DB_NAME`, `CODEPLANE_DB_USER`, `CODEPLANE_DB_PASSWORD` variables.
- [ ] In daemon/desktop mode (`CODEPLANE_DB_MODE=pglite`), the server initializes an embedded PGLite database stored at `${CODEPLANE_DATA_DIR}/db/`.
- [ ] Database initialization failure is fatal — the server must not start if the database cannot be reached or initialized.
- [ ] The database connection must be fully ready (queries can execute) before any subsequent initialization step runs.

**Service Registry Initialization**
- [ ] After database initialization, the server creates singleton instances for all domain services: user, repo, issue, label, milestone, landing, org, wiki, search, webhook, workflow, notification, secret, release, oauth2, lfs, sse, workspace, preview, and billing.
- [ ] Service initialization must not be called before database initialization — doing so must produce a clear error.
- [ ] Services that depend on optional infrastructure (e.g., container sandbox client for workspaces, blob store for releases/LFS) degrade gracefully when that infrastructure is unavailable, logging a warning rather than crashing.
- [ ] The SSE manager initialization is best-effort and non-fatal — if PostgreSQL LISTEN/NOTIFY setup fails, the server continues with SSE degraded.
- [ ] The container sandbox client (Docker/Podman) is optional — if the configured runtime is unavailable, workspace and preview features are marked as unavailable and the server logs a warning.

**Feature Flag Loading**
- [ ] After services are initialized, the server loads feature flags.
- [ ] In Community Edition, all 16 feature flags default to enabled.
- [ ] Feature flags are overridable via `CODEPLANE_FEATURE_FLAGS_<FLAG_NAME>` environment variables (set to `false` or `0` to disable).
- [ ] Invalid or unrecognized flag names in environment variables are ignored with a warning log.
- [ ] Feature flags must be loaded before any route handler or middleware that depends on them executes.

**SSH Server Startup**
- [ ] After feature flags are loaded, the server starts the SSH server.
- [ ] SSH server startup is non-fatal — if it fails, the HTTP server continues and a clear error message is logged.
- [ ] The SSH server binds to `CODEPLANE_SSH_HOST` (default `0.0.0.0`) and `CODEPLANE_SSH_PORT` (default `2222`).
- [ ] SSH can be explicitly disabled via `CODEPLANE_SSH_ENABLED=false`.
- [ ] The SSH host key is generated (RSA-4096) on first boot and persisted at `${CODEPLANE_DATA_DIR}/ssh/` for reuse across restarts.
- [ ] The SSH server supports configurable connection limits via `CODEPLANE_SSH_MAX_CONNS` and `CODEPLANE_SSH_MAX_CONNS_IP`.

**Cleanup Scheduler Startup**
- [ ] After SSH server startup, the background cleanup scheduler starts with six independent sweep jobs.
- [ ] The cleanup scheduler is initialized with the current database connection and optional blob store.
- [ ] Cleanup scheduler startup is non-fatal — if it fails to start, the server continues and logs an error.

**Middleware Stack Application**
- [ ] The HTTP middleware stack is applied in the exact order: request ID → logger → CORS → rate limiting → JSON content-type enforcement → auth context loading.
- [ ] Middleware ordering is not configurable and must not be altered by plugins or extensions.
- [ ] Each middleware is applied unconditionally to all routes.

**Route Mounting**
- [ ] All route families are mounted after middleware: health, auth, users, repos, jj, issues, landings, workflows, workspaces, orgs, labels, milestones, releases, webhooks, search, wiki, secrets, agents, notifications, admin, oauth2, lfs, integrations, daemon, previews, and billing.
- [ ] Route mounting failure is fatal — if any route family fails to mount, the server must not start.

**HTTP Server Listen**
- [ ] The HTTP server begins listening on `CODEPLANE_PORT` (default `3000`).
- [ ] The server logs a clear startup-complete message including the HTTP port, SSH port (or "disabled"), database mode, and total bootstrap duration.

**Graceful Shutdown Registration**
- [ ] The server registers `SIGINT` and `SIGTERM` handlers that trigger the graceful shutdown sequence.
- [ ] The shutdown sequence stops the cleanup scheduler, cleans up preview resources, stops the SSH server, and closes the database connection, in that order.

**Edge Cases**
- [ ] Starting the server when the configured HTTP port is already in use produces a clear error and exits with a non-zero code.
- [ ] Starting the server with an unreachable database (wrong host, wrong credentials) produces a clear error and exits with a non-zero code within 30 seconds (connection timeout).
- [ ] Starting the server with `CODEPLANE_DB_MODE` set to an unrecognized value produces a clear error.
- [ ] Starting the server with `CODEPLANE_PORT` set to a non-numeric value produces a clear error.
- [ ] Starting the server with `CODEPLANE_PORT` set to a privileged port (<1024) without appropriate permissions produces a clear error.
- [ ] Starting the server with `CODEPLANE_SSH_PORT` set to the same value as `CODEPLANE_PORT` produces a clear error about port conflict.
- [ ] Starting the daemon when a PID file already exists for a running process produces a clear error ("daemon already running").
- [ ] Starting the daemon when a stale PID file exists (process no longer running) cleans up the PID file and proceeds.
- [ ] The server can be started with no environment variables set (all defaults) and reaches a functional state with PGLite and default ports.
- [ ] The server can be started and reach health-check readiness within 10 seconds under normal conditions (no migration backlog).

**Boundary Constraints**
- [ ] `CODEPLANE_PORT`: Valid range 1–65535. Non-numeric or out-of-range values produce a clear error.
- [ ] `CODEPLANE_SSH_PORT`: Valid range 1–65535. Non-numeric or out-of-range values produce a clear error.
- [ ] `CODEPLANE_DATA_DIR`: Must be a writable filesystem path. Maximum path length: OS limit (typically 4096 characters). The server must create the directory if it does not exist.
- [ ] `CODEPLANE_DATABASE_URL`: Maximum length 2048 characters. Must be a valid PostgreSQL connection string when provided.
- [ ] `CODEPLANE_DB_MODE`: Must be exactly `postgres` or `pglite` (case-insensitive). Any other value is rejected.
- [ ] `CODEPLANE_SSH_MAX_CONNS`: Non-negative integer. 0 means unlimited. Non-numeric values fall back to 0 with a warning.
- [ ] `CODEPLANE_SSH_MAX_CONNS_IP`: Non-negative integer. 0 means unlimited. Non-numeric values fall back to 0 with a warning.
- [ ] Feature flag environment variable names must match the pattern `CODEPLANE_FEATURE_FLAGS_<UPPERCASE_FLAG_NAME>`. Values must be `true`, `false`, `1`, or `0`.

## Design

### Boot Sequence Design

The server bootstrap follows a strict phased sequence. Each phase must complete before the next begins. Phases are categorized as either **fatal** (failure stops the process) or **resilient** (failure is logged and the server continues in a degraded state).

**Phase 1 — Database Initialization (fatal)**
Connect to the configured database. In postgres mode, establish a connection pool. In pglite mode, initialize the embedded database and wait for readiness. If this phase fails, exit with code 1 and a clear error.

**Phase 2 — Service Registry Initialization (fatal, with resilient sub-steps)**
Create all domain service singletons. The SSE manager startup and container sandbox client creation are resilient sub-steps — their failure degrades specific features but does not block the server.

**Phase 3 — Feature Flag Loading (fatal)**
Load and evaluate all feature flags from the configured provider and environment variable overrides. Flags must be resolved before any request can be served.

**Phase 4 — SSH Server Startup (resilient)**
Start the SSH transport server. If it fails (port conflict, permission error, missing dependencies), log the error clearly and continue. Repository SSH access and workspace SSH access will be unavailable, but all HTTP-based functionality remains operational.

**Phase 5 — Cleanup Scheduler Startup (resilient)**
Start the six background cleanup sweep jobs. If the scheduler fails to start, log the error. The server continues, but administrators are warned that automatic housekeeping is not running.

**Phase 6 — HTTP Server Assembly (fatal)**
Apply the middleware stack and mount all route families. If any route module fails to mount, exit with code 1.

**Phase 7 — Listen (fatal)**
Bind to the configured HTTP port and begin accepting requests. If the port is unavailable, exit with code 1.

**Phase 8 — Shutdown Handler Registration (fatal)**
Register SIGINT and SIGTERM handlers. This must happen after the server is listening.

### API Shape

**Health Endpoints**

`GET /health`, `GET /healthz`, `GET /readyz`, `GET /api/health`

All return:
```json
{ "status": "ok" }
```
Response code: `200 OK`

These endpoints are unauthenticated and exempt from rate limiting. They are available as soon as the HTTP server begins listening (Phase 7 complete).

**Feature Flags Endpoint**

`GET /api/feature-flags`

Returns:
```json
{
  "flags": {
    "workspaces": true,
    "agents": true,
    "preview": true,
    "sync": true,
    "billing": false
  }
}
```
Response code: `200 OK`

This endpoint is unauthenticated and provides the current feature flag state to all clients.

**Admin System Health Endpoint**

`GET /api/admin/system/health`

Returns:
```json
{
  "status": "ok",
  "database": { "status": "ok", "latency_ms": 2 },
  "ssh": { "status": "ok", "port": 2222 },
  "cleanup_scheduler": { "status": "running", "jobs": 6 }
}
```
Or, if degraded:
```json
{
  "status": "degraded",
  "database": { "status": "ok", "latency_ms": 2 },
  "ssh": { "status": "unavailable", "error": "EADDRINUSE: port 2222" },
  "cleanup_scheduler": { "status": "running", "jobs": 6 }
}
```
Response code: `200` for ok, `503` for degraded.

### CLI Command

**`codeplane serve`**

Starts the Codeplane server in server mode (foreground).

```
codeplane serve [--port PORT] [--host HOST]
```

Output on success:
```
Codeplane server starting...
  Database:  postgres (codeplane@localhost:5432/codeplane)
  HTTP:      http://0.0.0.0:3000
  SSH:       ssh://0.0.0.0:2222
  Features:  16/16 enabled
  Bootstrap: 847ms

Codeplane is ready.
```

Output on degraded start:
```
Codeplane server starting...
  Database:  postgres (codeplane@localhost:5432/codeplane)
  HTTP:      http://0.0.0.0:3000
  SSH:       UNAVAILABLE (EADDRINUSE: port 2222 already in use)
  Features:  15/16 enabled (billing disabled)
  Bootstrap: 923ms

Codeplane is ready (SSH degraded — see logs for details).
```

**`codeplane daemon start`**

Starts the Codeplane daemon in local-first mode.

```
codeplane daemon start [--port PORT] [--host HOST] [--data-dir DIR] [--foreground]
```

Default behavior: detached process, PGLite database, localhost binding.

Output:
```
Codeplane daemon started (PID 12345)
  Database:  pglite (~/.codeplane/data/db/)
  HTTP:      http://127.0.0.1:3000
  SSH:       ssh://127.0.0.1:2222
  Log:       ~/.codeplane/daemon.log
```

**`codeplane health`**

Checks server/daemon health:

```
codeplane health [--host URL]
```

Output:
```
Status:  ok
URL:     http://localhost:3000
Latency: 12ms
```

Or if unreachable:
```
Status:  unreachable
URL:     http://localhost:3000
Error:   ECONNREFUSED
```

**`codeplane daemon status`**

Returns detailed daemon status:

```
codeplane daemon status
```

Output:
```
PID:          12345
Uptime:       2h 15m
Port:         3000
Database:     pglite
Sync Status:  online
Pending:      0
Conflicts:    0
Last Sync:    2026-03-21T10:30:00Z
Remote:       https://codeplane.example.com
```

### SDK Shape

The SDK exposes the bootstrap primitives consumed by the server, daemon, and desktop entry points:

- `initDb()` — Async database initialization. Reads `CODEPLANE_DB_MODE` and connects accordingly. Must be called before any service initialization.
- `initServices()` — Creates the service registry singleton. Must be called after `initDb()`.
- `getServices()` — Returns the initialized service registry. Throws if called before `initServices()`.
- `getDb()` — Returns the database connection. Throws if called before `initDb()`.
- `closeDb()` — Closes the database connection pool.
- `getFeatureFlagService()` — Returns the feature flag service singleton.
- `CleanupScheduler` — Configurable background job runner with `start()` and `stop()` methods.

### Web UI Design

The web UI does not have a bootstrap-specific page. However:

- If the web UI loads and the API is unreachable (server hasn't finished bootstrapping), the API client layer displays a full-page loading state: **"Connecting to Codeplane..."** with an automatic retry every 2 seconds.
- Once the API health endpoint responds with `200`, the loading state is replaced with the normal application shell.
- If the health endpoint returns `503` with `shutting_down` status, the UI displays: **"Codeplane is restarting. Your connection will be restored automatically."**

### TUI UI

- The TUI attempts to connect to the configured API URL on launch.
- If the server is unreachable, the TUI displays: `Connecting to Codeplane at {url}...` with a spinner and automatic retry.
- Once connected, the TUI transitions to the dashboard screen.
- If the daemon is the target and is not running, the TUI offers to start it: `Daemon is not running. Start it? [Y/n]`

### Desktop App Design

- On launch, the desktop app starts the embedded daemon in-process using PGLite.
- A splash screen or loading indicator is shown while the daemon bootstraps.
- Once the daemon's health endpoint responds, the webview loads the UI from `http://localhost:{port}`.
- If daemon bootstrap fails, the desktop app displays an error dialog with the failure reason and a "Retry" button.
- The tray icon reflects the daemon state: initializing → ready → syncing → error.

### Documentation

The following user-facing documentation should be written:

1. **Self-Hosting Quick Start**: Step-by-step guide covering environment variable configuration, database setup, first boot, and verification via health endpoint and web UI. Must cover both PostgreSQL and PGLite modes.
2. **Environment Variable Reference**: Complete table of all `CODEPLANE_*` environment variables with types, defaults, valid ranges, and descriptions. Organized by category (database, SSH, server, features, workspaces, previews, billing).
3. **Daemon Mode Guide**: How to start, stop, check status, and configure the daemon. Covers PID file location, log file location, sync setup, and desktop integration.
4. **Deployment Guide — Boot Sequence**: Explains the phased bootstrap, which phases are fatal vs. resilient, and how to diagnose startup failures from logs.
5. **Troubleshooting — Startup Failures**: Common failure scenarios (wrong DB credentials, port conflicts, permission errors, missing data directory) with solutions.

## Permissions & Security

### Authorization

- **Starting the server process**: Requires OS-level permissions to execute the binary and bind to the configured ports. No Codeplane-level authorization applies.
- **Starting the daemon**: Requires write access to the Codeplane state directory (`~/.local/state/codeplane/` or equivalent) for PID file and log file creation.
- **Health endpoints** (`/health`, `/healthz`, `/readyz`, `/api/health`): Accessible to all roles including Anonymous. No authentication required.
- **Feature flags endpoint** (`/api/feature-flags`): Accessible to all roles including Anonymous. No authentication required.
- **Admin system health endpoint** (`/api/admin/system/health`): Requires Admin role.
- **Daemon status/stop/sync commands**: Requires local OS access to the daemon process (implicitly scoped to the user who started it).

### Rate Limiting

- Health endpoints (`/health`, `/healthz`, `/readyz`, `/api/health`) are exempt from per-user rate limiting. They must remain accessible for load balancer probes and monitoring systems even under heavy load.
- The feature flags endpoint (`/api/feature-flags`) is subject to the standard rate limit (120 requests/minute per identity).
- The global rate limit applies to all other API endpoints at 120 requests per 60-second window, keyed by authenticated user ID or client IP address.
- Rate limit state is in-memory and is cleared on server restart. This is acceptable because rate limiting is a best-effort abuse-prevention mechanism, not a security boundary.

### Data Privacy

- Startup logs must NOT include database passwords, connection strings with credentials, or secret values from environment variables.
- Startup logs MAY include: database host, port, database name, ports being listened on, feature flag states, bootstrap duration, and subsystem status.
- The `CODEPLANE_DATABASE_URL` environment variable may contain credentials — the server must mask or omit credentials when logging connection information.
- The health endpoint must not expose internal implementation details (library versions, OS information, file paths) to unauthenticated callers.
- SSH host key fingerprint MAY be logged on startup for verification purposes.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `ServerBootstrapStarted` | `db_mode` (postgres/pglite), `port`, `ssh_port`, `ssh_enabled`, `feature_flags_count`, `container_runtime` | Phase 1 begins |
| `ServerBootstrapCompleted` | `total_duration_ms`, `db_mode`, `port`, `ssh_port`, `ssh_available`, `services_count`, `feature_flags_enabled_count`, `feature_flags_disabled_count`, `cleanup_scheduler_running`, `degraded_subsystems` (array) | Server begins listening |
| `ServerBootstrapFailed` | `failed_phase`, `error_message`, `duration_ms`, `db_mode` | Any fatal phase fails |
| `DaemonStarted` | `pid`, `port`, `data_dir`, `mode` (foreground/detached) | Daemon process created |
| `DaemonStartFailed` | `error_message`, `reason` (port_conflict/db_error/pid_exists/permission_denied) | Daemon fails to start |
| `SSHServerDegraded` | `error_message`, `configured_port` | SSH server fails to start but HTTP continues |
| `ContainerRuntimeUnavailable` | `configured_runtime` (docker/podman) | Container sandbox client creation fails |

### Funnel Metrics & Success Indicators

- **Bootstrap Success Rate**: Percentage of `ServerBootstrapCompleted` / (`ServerBootstrapCompleted` + `ServerBootstrapFailed`). Target: >99.5%.
- **Mean Bootstrap Duration**: Average `total_duration_ms` from `ServerBootstrapCompleted`. Target: <5 seconds for postgres mode, <3 seconds for pglite mode.
- **P99 Bootstrap Duration**: Target: <15 seconds (accounts for cold database migration scenarios).
- **SSH Availability Rate**: Percentage of boots where `ssh_available == true`. Target: >99%.
- **Full-Feature Boot Rate**: Percentage of boots with zero degraded subsystems. Target: >95%.
- **Daemon First-Start Success Rate**: Percentage of `DaemonStarted` on first attempt (no `DaemonStartFailed` preceding it). Target: >98%.

## Observability

### Logging Requirements

**Structured Log Context**

All bootstrap-related logs must include:
- `component: "bootstrap"`
- `phase: "db" | "services" | "feature_flags" | "ssh" | "cleanup" | "middleware" | "routes" | "listen" | "shutdown_registration"`
- `boot_id`: Unique ID for this boot sequence (for correlating all startup logs)

**Log Events**

| Log | Level | Structured Fields | When |
|-----|-------|-------------------|------|
| `Bootstrap started` | `info` | `db_mode`, `port`, `ssh_port`, `data_dir` | Process begins |
| `Database connected` | `info` | `db_mode`, `db_host` (postgres only), `duration_ms` | Database ready |
| `Database connection failed` | `error` | `db_mode`, `error_message`, `db_host` | Database init fails |
| `Services initialized` | `info` | `services_count`, `duration_ms` | All services created |
| `SSE manager started` | `info` | `duration_ms` | SSE ready |
| `SSE manager degraded` | `warn` | `error_message` | SSE startup failed |
| `Container runtime available` | `info` | `runtime` (docker/podman) | Sandbox client created |
| `Container runtime unavailable` | `warn` | `runtime`, `error_message` | Sandbox client creation failed |
| `Feature flags loaded` | `info` | `total`, `enabled`, `disabled`, `overridden_count` | Flags resolved |
| `Feature flag override applied` | `debug` | `flag_name`, `value`, `source` (env) | Per-flag override |
| `Feature flag override ignored` | `warn` | `env_var`, `reason` | Invalid env var |
| `SSH server started` | `info` | `host`, `port`, `host_key_fingerprint` | SSH ready |
| `SSH server failed` | `error` | `host`, `port`, `error_message` | SSH startup failed |
| `SSH server disabled` | `info` | — | SSH explicitly disabled via env |
| `Cleanup scheduler started` | `info` | `jobs_count` | Scheduler running |
| `Middleware applied` | `debug` | `middleware_count`, `middleware_names` | Stack configured |
| `Routes mounted` | `debug` | `route_families_count`, `route_families` | All routes registered |
| `Server listening` | `info` | `port`, `host`, `url` | HTTP accept loop started |
| `Bootstrap complete` | `info` | `total_duration_ms`, `degraded_subsystems` | Fully ready |
| `Daemon PID file written` | `info` | `pid`, `pid_file_path` | Daemon mode: PID persisted |
| `Stale PID file cleaned` | `warn` | `stale_pid`, `pid_file_path` | Old PID file removed |
| `Port conflict detected` | `error` | `port`, `type` (http/ssh) | Bind failed |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_bootstrap_duration_seconds` | histogram | `db_mode`, `status` (success/failure) | Total bootstrap duration |
| `codeplane_bootstrap_phase_duration_seconds` | histogram | `phase`, `status` (success/failure/skipped) | Per-phase duration |
| `codeplane_bootstrap_total` | counter | `db_mode`, `status` (success/failure) | Total bootstrap attempts |
| `codeplane_server_info` | gauge | `version`, `db_mode`, `port`, `ssh_port` | Server metadata (always 1) |
| `codeplane_server_uptime_seconds` | gauge | — | Seconds since bootstrap completed |
| `codeplane_feature_flags_enabled` | gauge | — | Number of enabled feature flags |
| `codeplane_feature_flags_disabled` | gauge | — | Number of disabled feature flags |
| `codeplane_subsystem_status` | gauge | `subsystem` (ssh/sse/container_runtime/cleanup) | 1 = available, 0 = degraded |
| `codeplane_rate_limit_store_size` | gauge | — | Number of entries in the in-memory rate limit store |

### Alerts

**Alert 1: Bootstrap Failure**
- **Condition**: `increase(codeplane_bootstrap_total{status="failure"}[5m]) > 0`
- **Severity**: Critical
- **Runbook**:
  1. Check application logs for `component=bootstrap` and `level=error` entries.
  2. Identify the failed phase from the `phase` label.
  3. If `phase=db`: verify database connectivity — check PostgreSQL is running, credentials are correct, and the database exists. Test with `psql`.
  4. If `phase=listen`: check for port conflicts — `ss -tlnp | grep <port>`. Another process may be using the port.
  5. If `phase=routes`: this indicates a code-level issue — check for missing dependencies or syntax errors in route modules.
  6. Check if the deployment configuration changed recently (environment variables, secrets, infrastructure).
  7. Attempt to start the server locally with the same configuration to reproduce.

**Alert 2: Slow Bootstrap**
- **Condition**: `histogram_quantile(0.99, codeplane_bootstrap_duration_seconds) > 15`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_bootstrap_phase_duration_seconds` to identify which phase is slow.
  2. If `phase=db`: check database latency and connection pool settings. PGLite first-boot may take longer due to WASM initialization.
  3. If `phase=services`: check if SSE manager is timing out on PostgreSQL LISTEN/NOTIFY setup.
  4. If `phase=ssh`: check if host key generation is slow (RSA-4096 generation on constrained hardware).
  5. If persistent across restarts: check system resources (disk I/O, available memory, CPU).
  6. If only on first boot: this may be database migration overhead — check migration log and consider pre-migration.

**Alert 3: Subsystem Degradation**
- **Condition**: `codeplane_subsystem_status{subsystem=~"ssh|sse|container_runtime"} == 0`
- **Severity**: Warning
- **Runbook**:
  1. Identify the degraded subsystem from the `subsystem` label.
  2. If `ssh`: check if the SSH port is available — `ss -tlnp | grep <ssh_port>`. Verify `CODEPLANE_SSH_ENABLED` is not `false`. Check file permissions on `${CODEPLANE_DATA_DIR}/ssh/`.
  3. If `sse`: check PostgreSQL LISTEN/NOTIFY capability. Verify the database user has LISTEN permissions. SSE degradation means notifications and live streams won't work.
  4. If `container_runtime`: verify Docker or Podman is installed and the server process has access to the container socket. Run `docker ps` or `podman ps` to test. Workspace and preview features will be unavailable.
  5. Check system logs (`journalctl`, `dmesg`) for related infrastructure issues.

**Alert 4: Repeated Bootstrap Restarts**
- **Condition**: `increase(codeplane_bootstrap_total[10m]) > 3`
- **Severity**: Critical
- **Runbook**:
  1. This indicates the server is crash-looping. Check orchestrator logs (Kubernetes pod events, systemd journal).
  2. Look for OOM kills: `dmesg | grep -i oom` or check pod `OOMKilled` status.
  3. Check if the server exits immediately after starting (configuration error) vs. crashes after running for a short time (runtime error).
  4. Review recent deployments or configuration changes.
  5. If the process is being killed by a health check probe timing out, increase the probe's `initialDelaySeconds` to give the bootstrap more time.

### Error Cases and Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|------------|
| PostgreSQL unreachable | Fatal — server does not start | Clear error message with host/port. Admin must fix database connectivity. |
| PostgreSQL wrong credentials | Fatal — server does not start | Clear error message (without leaking password). Admin must update credentials. |
| PGLite data directory not writable | Fatal — server does not start | Clear error with path and permission info. Admin must fix directory permissions. |
| HTTP port already in use | Fatal — server does not start | Clear error with port number. Admin must stop the conflicting process or change the port. |
| SSH port already in use | Non-fatal — SSH features unavailable | Warning log. HTTP server starts normally. Admin should free the port or change SSH port. |
| Container runtime unavailable | Non-fatal — workspace/preview features unavailable | Warning log. All other features work. Admin should install Docker/Podman. |
| Feature flag env var malformed | Non-fatal — flag ignored, default used | Warning log with the invalid variable name. |
| Data directory doesn't exist | Server attempts to create it | If creation fails (permissions), fatal error with clear message. |
| SSH host key file corrupted | SSH server fails to start (non-fatal) | Warning log. Delete the key file and restart — a new key will be generated. |
| PGLite WASM load failure | Fatal — embedded database can't initialize | Clear error. May indicate missing system dependencies or incompatible architecture. |
| Stale daemon PID file | Daemon appears to be "already running" | Detect stale PID (process doesn't exist), clean up PID file, and proceed. |
| `initServices()` called before `initDb()` | Fatal — programming error | Throws clear error: "Database must be initialized before services." |

## Verification

### Integration Tests — Database Initialization

- [ ] **Postgres mode connection**: Start server with valid PostgreSQL configuration, verify database connection succeeds and health endpoint returns 200.
- [ ] **Postgres mode connection failure**: Start server with invalid PostgreSQL host, verify server exits with code 1 and error log contains connection details (without password).
- [ ] **Postgres mode wrong password**: Start server with wrong database password, verify server exits with code 1 and error log indicates authentication failure.
- [ ] **PGLite mode initialization**: Start server with `CODEPLANE_DB_MODE=pglite`, verify database initializes at the configured data directory and health endpoint returns 200.
- [ ] **PGLite mode data directory creation**: Start server with `CODEPLANE_DB_MODE=pglite` and a non-existent `CODEPLANE_DATA_DIR`, verify the directory is created automatically.
- [ ] **PGLite mode data directory not writable**: Start server with `CODEPLANE_DB_MODE=pglite` and a read-only data directory, verify server exits with code 1 and clear error.
- [ ] **Invalid DB mode**: Start server with `CODEPLANE_DB_MODE=sqlite`, verify server exits with code 1 and error message mentions invalid mode.
- [ ] **DATABASE_URL takes precedence**: Start server with both `CODEPLANE_DATABASE_URL` and individual `CODEPLANE_DB_*` variables set, verify the connection uses `DATABASE_URL`.

### Integration Tests — Service Registry

- [ ] **Services initialized after DB**: Start server normally, verify all services are accessible via `getServices()` and each service can execute a basic operation.
- [ ] **Services before DB throws**: In a test harness, call `initServices()` without calling `initDb()` first, verify it throws with a clear error message.
- [ ] **Container runtime unavailable**: Start server without Docker/Podman available, verify server starts, workspace-related service is degraded, and warning log is emitted.
- [ ] **SSE manager degradation**: Start server with a database configuration that prevents LISTEN/NOTIFY, verify server starts with SSE degraded and warning log is emitted.

### Integration Tests — Feature Flags

- [ ] **All flags enabled by default**: Start server with no `CODEPLANE_FEATURE_FLAGS_*` variables, query `GET /api/feature-flags`, verify all 16 flags are `true`.
- [ ] **Flag disabled via env var**: Start server with `CODEPLANE_FEATURE_FLAGS_BILLING=false`, query `GET /api/feature-flags`, verify `billing` is `false` and all others are `true`.
- [ ] **Flag disabled with 0**: Start server with `CODEPLANE_FEATURE_FLAGS_BILLING=0`, verify `billing` is `false`.
- [ ] **Multiple flags disabled**: Start server with `CODEPLANE_FEATURE_FLAGS_BILLING=false` and `CODEPLANE_FEATURE_FLAGS_AGENTS=false`, verify both are `false`.
- [ ] **Invalid flag name ignored**: Start server with `CODEPLANE_FEATURE_FLAGS_NONEXISTENT=false`, verify server starts successfully and a warning is logged.
- [ ] **Feature flags endpoint is unauthenticated**: Query `GET /api/feature-flags` without any auth, verify 200 response.

### Integration Tests — SSH Server

- [ ] **SSH server starts on configured port**: Start server with `CODEPLANE_SSH_PORT=2223`, verify SSH server is listening on port 2223.
- [ ] **SSH server disabled**: Start server with `CODEPLANE_SSH_ENABLED=false`, verify no SSH listener and startup log confirms SSH is disabled.
- [ ] **SSH port conflict — server continues**: Occupy port 2222, start server, verify HTTP server starts normally and SSH degradation is logged.
- [ ] **SSH host key generation**: Start server with empty data directory, verify RSA host key is generated and persisted at `${CODEPLANE_DATA_DIR}/ssh/`.
- [ ] **SSH host key reuse**: Start server, stop it, start again, verify the same host key fingerprint is used (no regeneration).
- [ ] **SSH connection limits applied**: Start server with `CODEPLANE_SSH_MAX_CONNS=5`, verify that the 6th concurrent SSH connection is rejected.

### Integration Tests — HTTP Server and Middleware

- [ ] **Server listens on configured port**: Start server with `CODEPLANE_PORT=4000`, verify health endpoint responds on port 4000.
- [ ] **Default port 3000**: Start server with no `CODEPLANE_PORT`, verify health endpoint responds on port 3000.
- [ ] **Port conflict exits**: Occupy port 3000, start server with default port, verify server exits with code 1 and clear error.
- [ ] **Request ID middleware**: Send request to any endpoint, verify response includes `X-Request-Id` header.
- [ ] **Request ID preserved**: Send request with `X-Request-Id: custom-123`, verify response echoes the same request ID.
- [ ] **CORS headers present**: Send OPTIONS request, verify CORS headers are present in response.
- [ ] **Rate limiting headers present**: Send authenticated request, verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- [ ] **Rate limiting enforced**: Send 121 requests within 60 seconds from the same identity, verify the 121st returns 429 with `Retry-After` header.
- [ ] **JSON content type enforced on mutations**: Send POST request without `Content-Type: application/json`, verify 415 or 400 rejection.
- [ ] **JSON content type not enforced on GET**: Send GET request without `Content-Type`, verify request succeeds.
- [ ] **Auth loader loads token**: Send request with valid `Authorization: token codeplane_xxx`, verify the request is authenticated.
- [ ] **Auth loader loads session cookie**: Send request with valid `codeplane_session` cookie, verify the request is authenticated.
- [ ] **Auth loader graceful with invalid token**: Send request with `Authorization: token invalid_token`, verify request proceeds as unauthenticated (not error).
- [ ] **Health endpoints exempt from rate limiting**: Send 200 requests to `/health` within 60 seconds, verify none return 429.

### Integration Tests — Cleanup Scheduler

- [ ] **Scheduler starts with server**: Start server, verify cleanup scheduler logs indicate it is running.
- [ ] **Scheduler stops on shutdown**: Start server, send SIGTERM, verify cleanup scheduler stop is logged before database close.

### Integration Tests — Boot Sequence Order

- [ ] **Full bootstrap under 10 seconds**: Start server with valid configuration, measure time from process start to health endpoint returning 200, verify it is under 10 seconds.
- [ ] **Bootstrap with all defaults**: Start server with zero environment variables set (relying on all defaults), verify it reaches a functional state.
- [ ] **Startup log includes summary**: Start server, verify startup logs include HTTP port, SSH status, database mode, feature flag count, and total duration.

### Integration Tests — Port and Config Validation

- [ ] **Non-numeric HTTP port**: Start server with `CODEPLANE_PORT=abc`, verify clear error and exit code 1.
- [ ] **HTTP port 0**: Start server with `CODEPLANE_PORT=0`, verify server either picks an ephemeral port or exits with a clear error.
- [ ] **HTTP port 99999**: Start server with `CODEPLANE_PORT=99999`, verify clear error about invalid port range.
- [ ] **SSH and HTTP port conflict**: Start server with `CODEPLANE_PORT=3000` and `CODEPLANE_SSH_PORT=3000`, verify clear error about port conflict.
- [ ] **Non-numeric SSH port**: Start server with `CODEPLANE_SSH_PORT=abc`, verify clear error.
- [ ] **Maximum valid port 65535**: Start server with `CODEPLANE_PORT=65535`, verify server starts (or produces permission error, not a validation error).

### Integration Tests — Daemon Mode

- [ ] **Daemon start creates PID file**: Run `codeplane daemon start`, verify PID file is created at the expected path.
- [ ] **Daemon start sets PGLite mode**: Run `codeplane daemon start`, check daemon status, verify `db_mode` is `pglite`.
- [ ] **Daemon start when already running**: Start daemon, attempt to start again, verify clear error "daemon already running" with PID.
- [ ] **Daemon start with stale PID file**: Create a PID file with a non-existent PID, run `codeplane daemon start`, verify stale PID file is cleaned and daemon starts.
- [ ] **Daemon foreground mode**: Run `codeplane daemon start --foreground`, verify server runs in the foreground and health endpoint responds.
- [ ] **Daemon custom port**: Run `codeplane daemon start --port 4000`, verify daemon listens on port 4000.
- [ ] **Daemon custom data directory**: Run `codeplane daemon start --data-dir /tmp/codeplane-test`, verify PGLite database is created in that directory.
- [ ] **Daemon status when running**: Start daemon, run `codeplane daemon status`, verify output includes PID, uptime, port, and database mode.
- [ ] **Daemon status when not running**: Without daemon running, run `codeplane daemon status`, verify clear message "daemon is not running".

### E2E Tests — API

- [ ] **Full bootstrap and health check**: Start server with all defaults, query `GET /api/health`, verify `{ "status": "ok" }` with 200.
- [ ] **Feature flags available immediately**: Start server, query `GET /api/feature-flags` as soon as health check passes, verify all flags are present.
- [ ] **Admin health endpoint requires auth**: Query `GET /api/admin/system/health` without authentication, verify 401 response.
- [ ] **Admin health endpoint with auth**: Query `GET /api/admin/system/health` with admin credentials, verify 200 response with database status.
- [ ] **All route families reachable**: After bootstrap, send a request to at least one endpoint in each major route family (repos, issues, landings, workflows, etc.), verify none return 404 for the route family prefix.

### E2E Tests — CLI

- [ ] **`codeplane health` against running server**: Start server, run `codeplane health`, verify output shows `Status: ok` and latency.
- [ ] **`codeplane health` against non-running server**: Without server running, run `codeplane health`, verify output shows `Status: unreachable` with connection error.
- [ ] **`codeplane daemon start` and `stop` lifecycle**: Run `codeplane daemon start`, verify health check passes, run `codeplane daemon stop`, verify daemon exits and PID file is removed.
- [ ] **`codeplane daemon start --foreground` with Ctrl-C**: Run `codeplane daemon start --foreground`, send SIGINT, verify clean exit.
- [ ] **`codeplane serve` starts server**: Run `codeplane serve`, verify health check passes, send SIGTERM, verify clean exit.

### E2E Tests — Web UI (Playwright)

- [ ] **Loading state when server unavailable**: Open web UI pointed at non-running server, verify loading/connecting message is displayed.
- [ ] **UI loads after bootstrap**: Start server, open web UI, verify the application shell renders (login page or dashboard depending on auth state).
- [ ] **Feature-gated UI surfaces respect flags**: Start server with `CODEPLANE_FEATURE_FLAGS_WORKSPACES=false`, open web UI, verify workspace navigation is hidden or inaccessible.

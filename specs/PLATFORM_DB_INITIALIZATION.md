# PLATFORM_DB_INITIALIZATION

Specification for PLATFORM_DB_INITIALIZATION.

## High-Level User POV

When an operator starts Codeplane — whether as a self-hosted server, a local daemon on their laptop, or via the desktop application — the platform must establish a working database connection before any product functionality becomes available. This initialization step is invisible to the end user under normal circumstances: the server starts, the database is ready, and every surface — web UI, CLI, TUI, editor plugins, and the desktop app — immediately works.

Codeplane supports two deployment personas. A self-hosting administrator deploys Codeplane against an external PostgreSQL database. They configure a connection string or individual host/port/database/user/password parameters, start the server, and the platform connects to their database and becomes operational. An individual developer or small-team user starts Codeplane in daemon mode — either via the CLI (`codeplane daemon start`) or by launching the desktop app — and the platform automatically provisions an embedded PostgreSQL database (PGLite) in-process with zero external dependencies. In this mode, data is persisted to a local directory and the user never has to install, configure, or administer a separate database server.

The value of this feature is reliability, simplicity, and flexibility. Operators should never have to think about which database driver to load, whether the connection pool is healthy, or whether their daemon's embedded database will corrupt on unclean shutdown. The platform should start quickly, degrade gracefully when the database is unreachable, report its database health clearly through status endpoints, and shut down without data loss.

From the user's perspective, the only visible touchpoints for database initialization are: the server/daemon start command, health check endpoints for monitoring, the daemon status command, and — in error cases — clear, actionable error messages explaining what went wrong and how to fix it.

## Acceptance Criteria

### Definition of Done

- [ ] The server process successfully initializes a database connection in both `postgres` and `pglite` modes before accepting any HTTP or SSH traffic
- [ ] All 18+ domain services (user, repo, issue, label, milestone, landing, org, wiki, search, webhook, workflow, notification, secret, release, oauth2, lfs, workspace, preview, billing) are instantiated with the initialized database connection before any route handler executes
- [ ] Health check endpoints respond with `200 OK` only after database initialization has completed
- [ ] Graceful shutdown closes the database connection pool without data loss
- [ ] The daemon status endpoint reports the current database mode (`postgres` or `pglite`) accurately

### Database Mode Selection

- [ ] When `CODEPLANE_DB_MODE` is unset or set to `"postgres"`, the platform connects to an external PostgreSQL instance
- [ ] When `CODEPLANE_DB_MODE` is set to `"pglite"`, the platform provisions an embedded PGLite database in-process
- [ ] When `CODEPLANE_DB_MODE` is set to any value other than `"postgres"` or `"pglite"`, the platform fails with a clear error message identifying the invalid mode value
- [ ] The database mode is immutable for the lifetime of the process — it cannot be changed after `initDb()` completes

### Postgres Mode Constraints

- [ ] The platform accepts a full connection URL via `CODEPLANE_DATABASE_URL` (takes precedence when set)
- [ ] When `CODEPLANE_DATABASE_URL` is not set, the platform constructs connection parameters from `CODEPLANE_DB_HOST` (default: `localhost`), `CODEPLANE_DB_PORT` (default: `5432`), `CODEPLANE_DB_NAME` (default: `codeplane`), `CODEPLANE_DB_USER` (default: `codeplane`), `CODEPLANE_DB_PASSWORD` (default: empty string)
- [ ] Connection URLs with special characters in the password (e.g., `@`, `#`, `%`, spaces) are handled correctly
- [ ] Connection URLs with IPv6 host addresses are handled correctly
- [ ] The maximum length of `CODEPLANE_DATABASE_URL` must be at most 4096 characters
- [ ] When the PostgreSQL server is unreachable, initialization fails with an error message that includes the host and port being connected to
- [ ] When authentication fails (wrong user/password), the error message must not leak the password value

### PGLite Mode Constraints

- [ ] The PGLite data directory defaults to `{CODEPLANE_DATA_DIR}/db/` (where `CODEPLANE_DATA_DIR` defaults to `./data`)
- [ ] If the data directory does not exist, it is created automatically (including intermediate directories)
- [ ] If the data directory path is not writable, the platform fails with a clear filesystem permission error
- [ ] PGLite data directories with paths up to 255 characters are supported
- [ ] The data directory path must not contain null bytes
- [ ] PGLite mode supports both persistent (disk-backed) and in-memory (no `dataDir`) operation
- [ ] Calling `initDbSync()` in PGLite mode throws a descriptive error directing the caller to use `initDb()` instead

### Idempotency and Singleton Behavior

- [ ] Calling `initDb()` multiple times returns the same connection instance without creating additional connections
- [ ] Calling `getDb()` before `initDb()` throws an error with the message `"Database not initialized. Call initDb() first."`
- [ ] After `closeDb()`, calling `getDb()` throws an error (the instance is nullified)
- [ ] `closeDb()` is safe to call multiple times (idempotent)
- [ ] `closeDb()` on a never-initialized database is a no-op (does not throw)

### Blob Store Initialization

- [ ] The blob store singleton is lazily initialized on first access via `getBlobStore()`
- [ ] The blob store base directory defaults to `{CODEPLANE_DATA_DIR}/blobs/`
- [ ] The blob store signing secret defaults to `CODEPLANE_BLOB_SIGNING_SECRET` or the development sentinel `"codeplane-local-dev-secret"`
- [ ] Blob store directory creation is deferred to first write, not to initialization
- [ ] Path traversal via `..` in blob keys is neutralized

### Graceful Shutdown

- [ ] On `SIGINT`, the process stops the cleanup scheduler, cleans up preview environments, stops the SSH server, and closes the database connection before exiting
- [ ] On `SIGTERM`, the identical shutdown sequence executes
- [ ] The shutdown sequence completes within 10 seconds under normal conditions
- [ ] The daemon PID file is removed on graceful shutdown

### Edge Cases

- [ ] Starting the server with a completely empty environment (no `CODEPLANE_*` variables set) uses all defaults and succeeds in `postgres` mode pointing at `localhost:5432/codeplane`
- [ ] `CODEPLANE_DB_PORT` set to a non-numeric value produces a clear error
- [ ] `CODEPLANE_DB_PORT` set to `0` or a value above `65535` produces a clear error
- [ ] A database URL pointing to a TLS-required server works when the URL includes `?sslmode=require`
- [ ] If the PGLite WASM binary fails to load (e.g., due to memory constraints), the error is surfaced with a clear message

## Design

### Health Check Endpoints

The following endpoints serve as the primary user-facing interface for verifying database initialization:

| Endpoint | Method | Response | Purpose |
|---|---|---|---|
| `/health` | GET | `{ "status": "ok" }` | Generic health check |
| `/healthz` | GET | `{ "status": "ok" }` | Kubernetes liveness probe compatible |
| `/readyz` | GET | `{ "status": "ok" }` | Kubernetes readiness probe compatible |
| `/api/health` | GET | `{ "status": "ok" }` | API-prefixed health check |

All health check endpoints return HTTP `200` with a JSON body. They are unauthenticated and public. They are only reachable after the full initialization sequence (including database) has completed.

### Daemon Status Endpoint

| Endpoint | Method | Auth | Response |
|---|---|---|---|
| `/api/daemon/status` | GET | None (localhost only) | Full daemon status including `db_mode` |

Response shape:

```json
{
  "pid": 12345,
  "uptime": "2h 30m 15s",
  "uptime_ms": 9015000,
  "port": "3000",
  "db_mode": "pglite",
  "sync_status": "idle",
  "pending_count": 0,
  "conflict_count": 0,
  "last_sync_at": null,
  "error": null,
  "remote_url": null
}
```

The `db_mode` field is the key indicator of which database backend is active. It is always either `"postgres"` or `"pglite"`.

### CLI Commands

**`codeplane serve`** — Starts the server in postgres mode (default). Accepts `--port` (default `3000`) and `--host` (default `0.0.0.0`).

**`codeplane daemon start`** — Starts the server in PGLite mode. Accepts `--port` (default `3000`), `--host` (default `127.0.0.1`), `--data-dir` (default `./data`), and `--foreground`. Sets `CODEPLANE_DB_MODE=pglite` automatically. If a daemon is already running, returns `already_running` status with the existing PID.

**`codeplane daemon status`** — Reports whether the daemon is running, its PID, uptime, port, database mode, sync state, pending/conflict counts, and remote URL. If the process is alive but the API is unreachable, reports `healthy: false`.

**`codeplane daemon stop`** — Sends `SIGTERM` to the daemon, waits up to 3 seconds, then `SIGKILL` if necessary. Cleans up the PID file.

**`codeplane health`** — Queries the configured API URL's `/api/health` endpoint and reports the result.

### Feature Flag Endpoint

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/feature-flags` | GET | None | Returns the current feature flag state (loaded post-DB-init) |

This endpoint depends on database initialization having completed, as the feature flag service reads from the database or environment after `initDb()`.

### Environment Variable Reference

The following environment variables control database initialization behavior:

| Variable | Default | Mode | Description |
|---|---|---|---|
| `CODEPLANE_DB_MODE` | `"postgres"` | Both | Selects database backend (`postgres` or `pglite`) |
| `CODEPLANE_DATABASE_URL` | None | Postgres | Full PostgreSQL connection URL (takes precedence) |
| `CODEPLANE_DB_HOST` | `"localhost"` | Postgres | PostgreSQL host |
| `CODEPLANE_DB_PORT` | `"5432"` | Postgres | PostgreSQL port |
| `CODEPLANE_DB_NAME` | `"codeplane"` | Postgres | PostgreSQL database name |
| `CODEPLANE_DB_USER` | `"codeplane"` | Postgres | PostgreSQL username |
| `CODEPLANE_DB_PASSWORD` | `""` | Postgres | PostgreSQL password |
| `CODEPLANE_DATA_DIR` | `"./data"` | PGLite | Base directory for PGLite data and blobs |
| `CODEPLANE_BLOB_SIGNING_SECRET` | `"codeplane-local-dev-secret"` | Both | HMAC secret for signed blob URLs |
| `CODEPLANE_PORT` | `"3000"` | Both | HTTP listen port |
| `CODEPLANE_HOST` | `"0.0.0.0"` (serve) / `"127.0.0.1"` (daemon) | Both | HTTP bind address |

### Documentation

The following documentation should be provided to end users:

1. **Self-Hosting Guide — Database Setup**: How to provision a PostgreSQL database, create the `codeplane` user and database, configure the connection via environment variables, and verify connectivity with `codeplane health`.

2. **Local Daemon Quickstart**: How to start Codeplane locally with `codeplane daemon start`, where data is stored, how to check status with `codeplane daemon status`, and how to stop with `codeplane daemon stop`.

3. **Environment Variable Reference**: A complete table of all `CODEPLANE_*` environment variables that affect database initialization, with defaults, descriptions, and examples.

4. **Health Check Integration Guide**: How to configure Kubernetes liveness (`/healthz`) and readiness (`/readyz`) probes, Docker `HEALTHCHECK` directives, and monitoring system checks against the health endpoints.

5. **Troubleshooting — Database Connection Errors**: Common error messages, their causes, and remediation steps (e.g., "Connection refused" → check PostgreSQL is running; "Authentication failed" → check credentials; "Permission denied on data directory" → check filesystem permissions for PGLite mode).

## Permissions & Security

### Authorization

Database initialization is an internal platform operation that occurs before the auth middleware is loaded. No user-facing authorization role is required to trigger it — it is triggered by the process start itself.

| Surface | Required Role |
|---|---|
| Starting the server (`codeplane serve`) | System operator (host-level access) |
| Starting the daemon (`codeplane daemon start`) | Local user (file-level access to data directory) |
| Health check endpoints (`/health`, `/healthz`, `/readyz`, `/api/health`) | Anonymous (no auth required) |
| Daemon status endpoint (`/api/daemon/status`) | Anonymous (intended for localhost access only) |
| Feature flags endpoint (`/api/feature-flags`) | Anonymous (public by design) |

### Rate Limiting

- Health check endpoints are subject to the global rate limiter (120 requests/minute per identity), but since they are unauthenticated, the rate limit is per-IP.
- The daemon status endpoint is subject to the same rate limiter. Given that it is only exposed on localhost, this is primarily a defense against runaway monitoring scripts.

### Data Privacy and PII

- Database connection strings may contain passwords. The `CODEPLANE_DATABASE_URL` value must never be logged in full. If logged for diagnostics, the password component must be redacted.
- The PGLite data directory contains all platform data. File permissions on the `CODEPLANE_DATA_DIR` directory must be restrictive (owner-only read/write, mode `0700`).
- The blob signing secret (`CODEPLANE_BLOB_SIGNING_SECRET`) is sensitive and must not appear in health check responses, status endpoints, or logs.
- The default blob signing secret (`"codeplane-local-dev-secret"`) must trigger a warning log on server startup in production-like environments.

### Security Constraints

- The PGLite adapter neutralizes path traversal (`..`) in blob keys to prevent local file inclusion.
- The `initDbSync()` function correctly refuses to operate in PGLite mode, preventing accidental synchronous blocking of the event loop with WASM.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `PlatformDbInitialized` | Database connection successfully established | `db_mode` ("postgres" \| "pglite"), `duration_ms`, `data_dir` (PGLite only, path redacted to length), `host` (postgres only, hostname only — no credentials) |
| `PlatformDbInitFailed` | Database connection failed | `db_mode`, `error_type` (e.g., "connection_refused", "auth_failed", "pglite_wasm_error", "permission_denied"), `duration_ms` |
| `PlatformServiceRegistryInitialized` | All 18 services created successfully | `service_count`, `container_sandbox_available` (boolean), `duration_ms` |
| `PlatformShutdownCompleted` | Graceful shutdown finished | `uptime_ms`, `db_mode`, `shutdown_duration_ms`, `signal` ("SIGINT" \| "SIGTERM") |
| `PlatformShutdownTimeout` | Shutdown exceeded 10-second grace period | `uptime_ms`, `db_mode`, `signal` |
| `DaemonStarted` | Daemon process launched | `mode` ("foreground" \| "background"), `port`, `data_dir_size_bytes` |
| `DaemonStopped` | Daemon process stopped | `pid`, `uptime_ms`, `method` ("sigterm" \| "sigkill") |
| `HealthCheckServed` | A health check endpoint was hit | `endpoint` ("/health", "/healthz", "/readyz", "/api/health"), `response_time_ms` |

### Funnel Metrics and Success Indicators

- **Initialization success rate**: Percentage of server starts that reach the "all services initialized" state. Target: >99.9%.
- **Initialization p99 latency**: Time from process start to first health check returning 200. Target: <5s (postgres), <10s (PGLite first boot), <3s (PGLite warm boot).
- **Shutdown success rate**: Percentage of shutdowns that complete the full cleanup sequence. Target: >99%.
- **Health check availability**: Percentage of health check requests that return 200 during uptime. Target: 100%.
- **PGLite adoption**: Ratio of `PlatformDbInitialized` events with `db_mode=pglite` vs `db_mode=postgres`. Tracks local-first adoption.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | When |
|---|---|---|---|
| Database initialization started | `info` | `{ db_mode, host?, port?, data_dir? }` | Entry to `initDb()` |
| Database initialization succeeded | `info` | `{ db_mode, duration_ms }` | `initDb()` resolves |
| Database initialization failed | `error` | `{ db_mode, error_message, error_type, duration_ms }` | `initDb()` rejects |
| PGLite data directory created | `info` | `{ data_dir }` | First PGLite boot creates directory |
| Service registry initialized | `info` | `{ service_count, container_sandbox_available }` | `initServices()` completes |
| Container sandbox unavailable | `warn` | `{ runtime }` | `ContainerSandboxClient.withRuntime()` fails |
| SSE manager start failed | `warn` | `{ error_message }` | `sse.start()` rejects |
| SSH server start failed | `error` | `{ error_message }` | `startSSHServer()` rejects |
| Cleanup scheduler started | `info` | `{ worker_count: 6 }` | `cleanupScheduler.start()` |
| Server listening | `info` | `{ port, host }` | HTTP server begins accepting connections |
| Shutdown initiated | `info` | `{ signal }` | SIGINT or SIGTERM received |
| Database connection closed | `info` | `{ db_mode }` | `closeDb()` completes |
| Shutdown complete | `info` | `{ uptime_ms, shutdown_duration_ms }` | Process exit |
| Duplicate `initDb()` call (no-op) | `debug` | `{ db_mode }` | `initDb()` returns existing instance |
| `getDb()` called before init | `error` | `{}` | Thrown error |
| Default blob signing secret in use | `warn` | `{}` | `getBlobStore()` with default secret |
| Database URL password redacted for log | `debug` | `{ url_redacted }` | Postgres connection URL used |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_db_init_duration_seconds` | Histogram | `mode` ("postgres" \| "pglite"), `status` ("success" \| "failure") | Time to initialize database |
| `codeplane_db_init_total` | Counter | `mode`, `status` | Total database initialization attempts |
| `codeplane_service_registry_init_duration_seconds` | Histogram | `status` | Time to initialize all services |
| `codeplane_server_uptime_seconds` | Gauge | `db_mode` | Current server uptime |
| `codeplane_health_check_requests_total` | Counter | `endpoint`, `status_code` | Health check request count |
| `codeplane_health_check_duration_seconds` | Histogram | `endpoint` | Health check response latency |
| `codeplane_shutdown_duration_seconds` | Histogram | `signal`, `status` ("clean" \| "forced") | Time to complete shutdown |
| `codeplane_db_connections_active` | Gauge | `mode` | Number of active database connections (postgres mode) |
| `codeplane_pglite_data_dir_bytes` | Gauge | — | Size of PGLite data directory |
| `codeplane_cleanup_scheduler_running` | Gauge | — | 1 if cleanup scheduler is active, 0 otherwise |

### Alerts

#### Alert: `CodeplaneDbInitFailure`

**Condition**: `codeplane_db_init_total{status="failure"}` increases by 1 or more within a 5-minute window.

**Severity**: Critical

**Runbook**:
1. Check the server logs for the `error_type` in the structured log at `error` level.
2. If `error_type` is `connection_refused`: verify PostgreSQL is running on the expected host:port. Check `CODEPLANE_DB_HOST` and `CODEPLANE_DB_PORT`. Run `pg_isready -h <host> -p <port>`.
3. If `error_type` is `auth_failed`: verify `CODEPLANE_DB_USER` and `CODEPLANE_DB_PASSWORD` match the database's `pg_hba.conf` and user credentials. Test with `psql -U <user> -h <host> -d <database>`.
4. If `error_type` is `pglite_wasm_error`: check available memory (PGLite WASM requires ~128MB). Check `CODEPLANE_DATA_DIR` for disk space. Try deleting `{CODEPLANE_DATA_DIR}/db/` and restarting.
5. If `error_type` is `permission_denied`: check filesystem permissions on `CODEPLANE_DATA_DIR`. Ensure the process user owns the directory.
6. Restart the process after fixing the underlying issue.

#### Alert: `CodeplaneDbInitSlow`

**Condition**: `codeplane_db_init_duration_seconds{status="success"}` p99 > 10 seconds over a 15-minute window.

**Severity**: Warning

**Runbook**:
1. Check if this is a cold PGLite boot (first start, no existing data). Cold boots can take 5-10s due to WASM compilation. This is expected.
2. For postgres mode: check network latency to the database host. Run `ping <host>` and `psql` connection timing.
3. Check if the database server is under load (high CPU, memory pressure, disk I/O). Query `pg_stat_activity` for active connections.
4. Check if SSL/TLS negotiation is adding latency. Verify `sslmode` in connection URL.

#### Alert: `CodeplaneHealthCheckDown`

**Condition**: Probe to `/healthz` returns non-200 or times out (>5s) for 3 consecutive checks (30s check interval).

**Severity**: Critical

**Runbook**:
1. Check if the Codeplane process is running: `ps aux | grep codeplane` or check the daemon PID file.
2. Check the process logs for crash or panic output.
3. If the process is running but the health check fails, check if the port is bound: `lsof -i :<port>`.
4. Check system resource exhaustion: disk space, file descriptors, memory.
5. If in daemon mode, check `codeplane daemon status` for detailed information.
6. Restart the process: `codeplane daemon stop && codeplane daemon start` or restart the systemd/container.

#### Alert: `CodeplaneShutdownStalled`

**Condition**: `codeplane_shutdown_duration_seconds{status="forced"}` increases by 1 or more.

**Severity**: Warning

**Runbook**:
1. Check logs for which shutdown step stalled (preview cleanup, SSH shutdown, or DB close).
2. If preview cleanup stalled: inspect running preview environments. Container runtime may be unresponsive.
3. If SSH shutdown stalled: check for long-running SSH sessions. The SSH server may be waiting for active connections.
4. If DB close stalled: check for in-flight transactions or long-running queries. In postgres mode, check `pg_stat_activity`.
5. Consider increasing the shutdown grace period or fixing the stalling component.

### Error Cases and Failure Modes

| Failure Mode | Symptom | Impact | Recovery |
|---|---|---|---|
| PostgreSQL unreachable | `initDb()` throws connection error | Server does not start; no routes served | Fix network/database and restart |
| Invalid credentials | `initDb()` throws auth error | Server does not start | Correct credentials and restart |
| PGLite data directory not writable | `createPGLiteInstance()` throws filesystem error | Daemon does not start | Fix permissions or change `CODEPLANE_DATA_DIR` |
| PGLite WASM load failure | `createPGLiteInstance()` throws runtime error | Daemon does not start | Check memory, reinstall dependencies |
| Corrupted PGLite data | PGLite throws during `waitReady` | Daemon does not start | Delete `{CODEPLANE_DATA_DIR}/db/` and restart (data loss) |
| Container runtime unavailable | `ContainerSandboxClient.withRuntime()` throws | Server starts but workspace/preview features disabled | Install Docker/Podman or accept degraded mode |
| SSE manager initialization failure | `sse.start()` rejects | Server starts but SSE streaming degraded | Check logs and restart |
| SSH server port conflict | `startSSHServer()` throws `EADDRINUSE` | Server starts but SSH access unavailable | Free port 2222 or change `CODEPLANE_SSH_PORT` |
| `getDb()` called before `initDb()` | Throws "Database not initialized" | Caller receives thrown error | Ensure `initDb()` is awaited before any service access |
| Double shutdown signal | Both handlers fire | Potential double-close on DB connection | `closeDb()` is idempotent; safe |

## Verification

### API Integration Tests

1. **Health check returns 200 after server start** — Start a test server, wait for ready, `GET /health` → expect `200`, body `{ "status": "ok" }`.
2. **Healthz returns 200** — `GET /healthz` → expect `200`, body `{ "status": "ok" }`.
3. **Readyz returns 200** — `GET /readyz` → expect `200`, body `{ "status": "ok" }`.
4. **API health returns 200** — `GET /api/health` → expect `200`, body `{ "status": "ok" }`.
5. **Feature flags endpoint returns valid JSON after init** — `GET /api/feature-flags` → expect `200`, body is a JSON object with boolean values for all known feature flags.
6. **Daemon status returns db_mode=postgres for server mode** — Start server in postgres mode, `GET /api/daemon/status` → expect response with `db_mode: "postgres"`.
7. **Daemon status returns db_mode=pglite for daemon mode** — Start daemon with PGLite, `GET /api/daemon/status` → expect response with `db_mode: "pglite"`.
8. **Daemon status uptime increases over time** — Query daemon status twice with a 2-second gap, verify `uptime_ms` increased.
9. **Daemon status pid matches process** — Query daemon status, verify `pid` matches the running daemon's PID.
10. **Health check response time is under 100ms** — `GET /health` → verify response completes within 100ms.

### CLI Integration Tests

11. **`codeplane daemon start` creates PID file** — Run `codeplane daemon start`, verify PID file exists at the expected state directory path.
12. **`codeplane daemon start` with `--data-dir` uses specified directory** — Start daemon with `--data-dir /tmp/test-codeplane-data`, verify PGLite data is created under `/tmp/test-codeplane-data/db/`.
13. **`codeplane daemon start` when already running returns `already_running`** — Start daemon, run start again, expect status `already_running` with existing PID.
14. **`codeplane daemon status` when running returns full status** — Start daemon, run status, expect `running` with pid, uptime, port, db_mode, sync fields.
15. **`codeplane daemon status` when stopped returns `stopped`** — Ensure daemon is not running, run status, expect `stopped`.
16. **`codeplane daemon stop` sends SIGTERM and cleans PID** — Start daemon, run stop, verify PID file is removed and process is gone.
17. **`codeplane daemon stop` when not running returns `not_running`** — Ensure daemon is not running, run stop, expect `not_running`.
18. **`codeplane serve` starts server on specified port** — Run `codeplane serve --port 4567`, verify `/health` responds on port 4567.
19. **`codeplane serve` defaults to port 3000** — Run `codeplane serve` without `--port`, verify `/health` responds on port 3000.
20. **`codeplane health` reports OK when server is running** — Start server, run `codeplane health`, expect success output.

### Database Mode Tests

21. **Postgres mode connects with `CODEPLANE_DATABASE_URL`** — Set `CODEPLANE_DATABASE_URL=postgresql://user:pass@localhost:5432/testdb`, start server, verify health check passes.
22. **Postgres mode connects with individual env vars** — Set `CODEPLANE_DB_HOST`, `CODEPLANE_DB_PORT`, `CODEPLANE_DB_NAME`, `CODEPLANE_DB_USER`, `CODEPLANE_DB_PASSWORD`, start server, verify health check passes.
23. **Postgres mode with `CODEPLANE_DATABASE_URL` takes precedence over individual vars** — Set both `CODEPLANE_DATABASE_URL` and individual vars pointing to different databases, verify server connects to the URL target.
24. **PGLite mode creates data directory automatically** — Set `CODEPLANE_DATA_DIR` to a non-existent path, start daemon, verify directory is created.
25. **PGLite mode persists data across restarts** — Start daemon, perform a write (e.g., create a user), stop daemon, restart, verify data persists.
26. **PGLite in-memory mode works** — Start server with PGLite mode and no data directory specified, verify health check passes.

### Idempotency and Lifecycle Tests

27. **Multiple `initDb()` calls return same instance** — Call `initDb()` twice, verify both return the same object reference.
28. **`getDb()` before `initDb()` throws descriptive error** — Call `getDb()` without prior `initDb()`, expect error containing "Database not initialized".
29. **`closeDb()` followed by `getDb()` throws** — Call `initDb()`, then `closeDb()`, then `getDb()`, expect error.
30. **`closeDb()` called twice is a no-op** — Call `closeDb()` twice, expect no error on second call.
31. **`closeDb()` on uninitialized DB is a no-op** — Call `closeDb()` without `initDb()`, expect no error.
32. **`initDbSync()` in PGLite mode throws** — Set `CODEPLANE_DB_MODE=pglite`, call `initDbSync()`, expect error containing "Cannot use initDbSync() with PGLite mode".

### Service Registry Tests

33. **`initServices()` before `initDb()` throws** — Call `initServices()` without `initDb()`, expect error about uninitialized database.
34. **`getServices()` before `initServices()` throws** — Call `getServices()` without `initServices()`, expect error "Services not initialized".
35. **All 18 services are present after initialization** — After init, verify `getServices()` returns an object with all 18 expected service keys.
36. **Service registry is a singleton** — Call `getServices()` twice, verify same object reference.

### Blob Store Tests

37. **`getBlobStore()` returns a singleton** — Call `getBlobStore()` twice, verify same instance.
38. **Blob store uses `CODEPLANE_DATA_DIR/blobs/` as default base** — Verify blob store path includes the configured data directory.
39. **Blob store neutralizes path traversal** — Write a blob with key `../../etc/passwd`, verify it does not escape the base directory.
40. **Blob store with custom signing secret** — Create blob store with custom secret, verify signed URLs differ from default.

### Graceful Shutdown Tests

41. **SIGTERM triggers clean shutdown** — Start server, send SIGTERM, verify process exits with code 0 and DB connection is closed.
42. **SIGINT triggers clean shutdown** — Start server, send SIGINT, verify process exits with code 0.
43. **Shutdown cleans up preview environments** — Start server with active previews, send SIGTERM, verify preview cleanup is called.
44. **Shutdown stops SSH server** — Start server with SSH, send SIGTERM, verify SSH port is released.
45. **Shutdown stops cleanup scheduler** — Start server, verify cleanup scheduler is running, send SIGTERM, verify scheduler is stopped.

### Error Handling Tests

46. **Server start with unreachable Postgres fails gracefully** — Set `CODEPLANE_DB_HOST=192.0.2.1` (non-routable), start server, expect process to exit with non-zero code and a descriptive error in logs.
47. **Server start with wrong Postgres password fails gracefully** — Set incorrect `CODEPLANE_DB_PASSWORD`, start server, expect auth error without leaking the password in logs or stdout.
48. **Daemon start with read-only data directory fails gracefully** — Create a read-only directory, set as `CODEPLANE_DATA_DIR`, start daemon, expect permission error.
49. **Server start with port conflict fails gracefully** — Start two servers on the same port, expect second to fail with `EADDRINUSE`.
50. **SSH port conflict does not crash server** — Start server when port 2222 is in use, verify HTTP server starts successfully with SSH degraded.

### Boundary and Limit Tests

51. **Database URL at maximum length (4096 chars) connects** — Construct a valid 4096-character database URL (with padding in the database name), verify connection succeeds.
52. **Database URL exceeding 4096 chars fails with clear error** — Construct a 4097-character URL, verify the platform rejects it.
53. **PGLite data directory path at 255 characters works** — Create a 255-char path, start daemon with it, verify success.
54. **Connection with special characters in password** — Set `CODEPLANE_DATABASE_URL` with password containing `@#$%&*()`, verify connection.
55. **Port boundary: 1 (minimum valid)** — Set `CODEPLANE_DB_PORT=1`, verify connection attempt is made (may fail for network reasons, but no parse error).
56. **Port boundary: 65535 (maximum valid)** — Set `CODEPLANE_DB_PORT=65535`, verify no parse error.
57. **Port boundary: 0 (invalid)** — Set `CODEPLANE_DB_PORT=0`, verify clear error.
58. **Port boundary: 65536 (invalid)** — Set `CODEPLANE_DB_PORT=65536`, verify clear error.
59. **Port boundary: non-numeric** — Set `CODEPLANE_DB_PORT=abc`, verify clear error.

### E2E Playwright Tests

60. **Web UI loads after successful DB initialization** — Navigate to the Codeplane web UI root, verify the application shell renders (sidebar, navigation).
61. **Web UI shows error state if server is unreachable** — Point browser at non-running server, verify a user-friendly connection error.

### E2E CLI Full-Stack Tests

62. **Full lifecycle: daemon start → health → status → stop** — Run the complete daemon lifecycle through CLI commands, verify each step succeeds.
63. **Full lifecycle: serve → health check → SIGTERM** — Start server via `codeplane serve`, verify health check, send SIGTERM, verify clean exit.
64. **Daemon data persistence round-trip** — Start daemon, create a repository via API, stop daemon, restart daemon, verify repository still exists.
65. **Concurrent daemon start attempts** — Launch two `codeplane daemon start` commands simultaneously, verify exactly one succeeds and the other reports `already_running`.

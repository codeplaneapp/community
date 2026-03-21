# PLATFORM_GRACEFUL_SHUTDOWN

Specification for PLATFORM_GRACEFUL_SHUTDOWN.

## High-Level User POV

When a Codeplane administrator or operator restarts, upgrades, or shuts down a Codeplane server instance, all in-progress user activity should complete safely without data loss or abrupt disconnection. Users who are currently pushing code, streaming workflow logs, reviewing landing requests, or interacting with workspaces should experience a smooth wind-down rather than a hard cut.

From the user's perspective, a graceful shutdown is invisible when done well. A developer who is mid-push over SSH should see their push complete rather than receive a broken pipe error. A teammate watching a workflow run's live log stream should see either a clean end-of-stream event or a reconnectable interruption rather than a silent hang. A CI pipeline that dispatched a workflow should receive a deterministic final status rather than a run stuck forever in "running." An operator using the daemon on their laptop should see the daemon exit cleanly, with sync state preserved so the next startup resumes from where it left off.

The graceful shutdown system also protects the platform itself. Background cleanup jobs should finish their current cycle before stopping. The database connection pool should drain rather than abandon active transactions. Preview environments should have their idle timers cleared so they don't fire into a half-dead process. The SSH server should stop accepting new connections while allowing in-flight sessions to finish within a reasonable deadline.

For self-hosting administrators, the shutdown behavior should be observable. The operator should be able to see that shutdown was initiated, how long it took, which subsystems completed cleanup, and whether any subsystem timed out or failed. This information is critical for upgrade confidence and incident diagnosis.

For daemon and desktop users, the same principles apply at a smaller scale. Stopping the daemon should flush pending sync queue items, close filesystem watchers, unsubscribe from shape subscriptions, and remove the PID file. The desktop app should tear down its embedded daemon cleanly so that the next launch starts from consistent state.

The overall user promise is: **Codeplane never loses your work because of a shutdown, and it always tells you what happened.**

## Acceptance Criteria

### Definition of Done

The PLATFORM_GRACEFUL_SHUTDOWN feature is complete when all of the following are true:

**Signal Handling**
- [ ] The server process handles `SIGINT` and `SIGTERM` signals and initiates the shutdown sequence.
- [ ] The server process handles `SIGQUIT` for immediate diagnostic dump (heap/thread state) without initiating shutdown.
- [ ] Duplicate signals within the shutdown window are ignored (no double-shutdown race).
- [ ] A third signal (after two ignored duplicates) forces an immediate `process.exit(1)` as an escape hatch.
- [ ] The shutdown sequence has a configurable maximum deadline (default: 30 seconds). If the deadline expires, the process exits with code 1 and logs which subsystems did not complete.

**HTTP Server Draining**
- [ ] After shutdown is initiated, the server stops accepting new TCP connections.
- [ ] In-flight HTTP requests are allowed to complete up to the shutdown deadline.
- [ ] New requests that arrive on already-accepted connections receive a `503 Service Unavailable` response with a `Retry-After` header.
- [ ] The health endpoint (`/api/health`) returns `{ "status": "shutting_down" }` with HTTP 503 once shutdown begins, so load balancers can remove the instance.
- [ ] Long-polling or SSE connections receive a clean close event before the server exits.

**SSH Server Draining**
- [ ] The SSH server stops accepting new connections after shutdown is initiated.
- [ ] Active SSH sessions (git push/pull, workspace access) are allowed to complete up to the shutdown deadline.
- [ ] The SSH server emits a structured log when all active sessions have drained or when the deadline forced closure.

**SSE Stream Cleanup**
- [ ] All active SSE subscribers receive a terminal event (e.g., `event: shutdown`) before their streams are closed.
- [ ] All PostgreSQL LISTEN channels are unsubscribed.
- [ ] All keep-alive intervals are cleared.
- [ ] SSE cleanup completes within 5 seconds or is force-closed.

**Background Job Cleanup**
- [ ] The CleanupScheduler stops all interval timers.
- [ ] Currently executing cleanup tasks are allowed to finish their current iteration (but no new iterations start).
- [ ] Each cleanup task has an individual timeout of 10 seconds.

**Preview Service Cleanup**
- [ ] All idle timers for preview environments are cleared.
- [ ] Preview containers are NOT terminated (they persist for later reconnection).
- [ ] In-memory preview state is cleared.

**Database Connection Draining**
- [ ] The database connection pool is drained (all borrowed connections returned, pending queries completed or cancelled).
- [ ] The pool `.end()` call completes before process exit.
- [ ] If the database drain exceeds 10 seconds, the pool is force-closed and the event is logged as a warning.

**Daemon Mode Shutdown**
- [ ] The daemon process removes its PID file on clean exit.
- [ ] The sync service flushes any pending sync queue items before stopping.
- [ ] Filesystem watchers (auto-push) are closed.
- [ ] ElectricSQL shape subscriptions are unsubscribed.
- [ ] The daemon stop command sends SIGTERM, waits up to 5 seconds, then escalates to SIGKILL.
- [ ] Stale PID files from crashed processes are detected and cleaned on next startup.

**Desktop App Shutdown**
- [ ] The desktop app shuts down its embedded daemon using the same daemon shutdown sequence.
- [ ] The tray icon is removed before process exit.
- [ ] The webview is closed before daemon shutdown to prevent requests to a dying server.

**Edge Cases**
- [ ] Shutdown during database migration does not leave the schema in a partially-migrated state (migrations are transactional).
- [ ] Shutdown during a workflow run marks the run as `interrupted` rather than leaving it as `running` forever.
- [ ] Shutdown with zero active connections completes in under 1 second.
- [ ] Shutdown with the maximum number of concurrent connections (configurable, default 10,000) completes within the deadline.
- [ ] If the preview cleanup throws, shutdown continues (best-effort, logged).
- [ ] If the SSH server close callback errors, shutdown continues (best-effort, logged).
- [ ] If the database close throws, shutdown logs the error and exits with code 1.

**Boundary Constraints**
- [ ] Shutdown deadline: minimum 5 seconds, maximum 300 seconds, default 30 seconds. Configured via `CODEPLANE_SHUTDOWN_TIMEOUT_MS` environment variable.
- [ ] Daemon stop timeout: minimum 1 second, maximum 30 seconds, default 5 seconds. Configured via `CODEPLANE_DAEMON_STOP_TIMEOUT_MS` environment variable.
- [ ] Individual subsystem cleanup timeout: minimum 1 second, maximum 60 seconds, default 10 seconds.
- [ ] Environment variable values that are non-numeric or out of range fall back to defaults with a warning log.

## Design

### Shutdown Sequence Design

The shutdown follows a deterministic phased sequence. Each phase must complete (or timeout) before the next begins:

**Phase 1 — Stop Accepting Work (immediate)**
- Set server state to `shutting_down`.
- Health endpoint begins returning 503.
- HTTP server stops accepting new TCP connections.
- SSH server stops accepting new connections.
- CleanupScheduler stops all timers (no new iterations).

**Phase 2 — Drain Active Connections (up to deadline)**
- In-flight HTTP requests complete or receive 503.
- Active SSH sessions complete or are closed.
- SSE subscribers receive `event: shutdown` and streams close.
- SSE PostgreSQL LISTEN channels are unsubscribed.
- Keep-alive intervals are cleared.

**Phase 3 — Service Cleanup (up to 10s per service)**
- Preview idle timers cleared, in-memory state cleared.
- Daemon sync queue flushed (daemon mode only).
- Filesystem watchers closed (daemon mode only).

**Phase 4 — Data Layer Shutdown (up to 10s)**
- Database connection pool drained and closed.

**Phase 5 — Exit**
- Log final shutdown report (duration, subsystem statuses).
- Exit with code 0 (clean) or 1 (deadline exceeded or error).

### API Shape

**Health Endpoint Change**

`GET /api/health`

During normal operation:
```json
{ "status": "healthy", "version": "1.0.0", "uptime": 3600 }
```
Response code: `200 OK`

During shutdown:
```json
{ "status": "shutting_down", "shutdown_initiated_at": "2026-03-21T12:00:00Z" }
```
Response code: `503 Service Unavailable`
Header: `Retry-After: 30`

**Rejected Request During Shutdown**

Any non-health request arriving after Phase 1:
```json
{ "error": "server_shutting_down", "message": "This server is shutting down. Please retry against another instance.", "retry_after": 30 }
```
Response code: `503 Service Unavailable`
Header: `Retry-After: 30`

### CLI Command

**`codeplane daemon stop`**

Behavior:
1. Reads PID from `~/.codeplane/daemon.pid`.
2. Sends `SIGTERM` to the daemon process.
3. Polls every 100ms for up to `CODEPLANE_DAEMON_STOP_TIMEOUT_MS` (default 5000ms).
4. If process exits within timeout: prints `Daemon stopped.` and removes PID file.
5. If process does not exit: sends `SIGKILL`, waits 1 second, removes PID file, prints `Daemon force-killed after timeout.`
6. If PID file does not exist or process is not running: prints `Daemon is not running.` and exits 0.

Output (normal):
```
Stopping daemon (PID 12345)...
Daemon stopped. (took 1.2s)
```

Output (force-kill):
```
Stopping daemon (PID 12345)...
Daemon did not exit within 5s, sending SIGKILL...
Daemon force-killed after timeout.
```

Output (not running):
```
Daemon is not running.
```

**`codeplane health`**

Should reflect the `shutting_down` state when targeting a server in shutdown:
```
Status: shutting_down
Shutdown initiated: 2026-03-21T12:00:00Z
```

### SDK Shape

The SDK exposes a `GracefulShutdown` coordinator used by the server, daemon, and desktop app:

- `GracefulShutdown.register(name, cleanupFn, timeoutMs?)` — Registers a named subsystem with its cleanup function and optional per-subsystem timeout.
- `GracefulShutdown.initiate(reason)` — Begins the shutdown sequence. Returns a promise that resolves when all phases complete or the global deadline expires.
- `GracefulShutdown.state` — Returns `"running"` | `"shutting_down"` | `"stopped"`.
- `GracefulShutdown.onStateChange(callback)` — Allows middleware and health routes to react to state transitions.

### Web UI Design

The web UI does not have a dedicated shutdown page. However:

- If the API returns `503` with `error: "server_shutting_down"`, the API client layer should display a non-dismissible banner: **"This Codeplane instance is restarting. Your connection will be restored automatically."**
- The banner should include a reconnection countdown that attempts to reach the health endpoint every 5 seconds.
- When the health endpoint returns `200` again, the banner disappears and the page state is refreshed.
- SSE streams that receive the `shutdown` event should trigger automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s).

### TUI UI

- If the API returns `503 server_shutting_down`, the TUI should display a status bar message: `Server restarting — reconnecting...`
- The TUI should retry API calls with exponential backoff.
- SSE-based screens (notifications, sync status) should reconnect automatically.

### Documentation

The following user-facing documentation should be written:

1. **Self-Hosting Guide — Graceful Shutdown Section**: Explain how Codeplane handles SIGINT/SIGTERM, the shutdown phases, the `CODEPLANE_SHUTDOWN_TIMEOUT_MS` environment variable, and how to verify clean shutdown from logs.
2. **Daemon CLI Reference — `daemon stop`**: Document the stop command behavior, timeout configuration, and force-kill escalation.
3. **API Reference — Health Endpoint**: Document the `shutting_down` status response and `Retry-After` header semantics.
4. **Upgrade Guide**: Explain rolling upgrade procedure: send SIGTERM to old instance, wait for exit, start new instance. Document how load balancers should use the health endpoint to drain traffic.
5. **Troubleshooting — Shutdown Issues**: Document common problems: shutdown hangs (stuck database query), PID file stale after crash, preview containers orphaned after ungraceful exit.

## Permissions & Security

### Authorization

- **Triggering shutdown via signal**: Requires OS-level process signal permission. Only the process owner or root can send SIGINT/SIGTERM. No Codeplane-level authorization applies.
- **`daemon stop` CLI command**: Requires the ability to read `~/.codeplane/daemon.pid` and send signals to the daemon process. This is implicitly scoped to the local user who started the daemon.
- **Health endpoint (`/api/health`)**: Accessible to all roles including Anonymous. The `shutting_down` status is not sensitive information — load balancers and monitoring systems need it.
- **Admin shutdown API (if ever exposed)**: Must require `Admin` role. This is not currently implemented and should be gated behind a feature flag if added.

### Rate Limiting

- The health endpoint should be exempt from per-user rate limiting during shutdown, as load balancers may poll it aggressively.
- The 503 rejection response during shutdown should NOT count against the caller's rate limit budget.
- Rate limiting state (in-memory store) is cleared during shutdown and does not need to be persisted.

### Data Privacy

- Shutdown logs must NOT include request bodies, authentication tokens, or user PII.
- Shutdown logs MAY include: request count, connection count, subsystem names, durations, and error messages.
- The `shutting_down` health response must NOT leak internal subsystem names, IP addresses, or configuration details.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `ServerShutdownInitiated` | `reason` (sigint/sigterm/api), `active_http_connections`, `active_ssh_sessions`, `active_sse_subscribers`, `server_uptime_seconds` | Phase 1 begins |
| `ServerShutdownCompleted` | `total_duration_ms`, `exit_code`, `subsystems_completed` (array of names), `subsystems_timed_out` (array of names), `requests_drained`, `requests_rejected` | Phase 5, before exit |
| `DaemonStopRequested` | `pid`, `timeout_ms` | CLI `daemon stop` invoked |
| `DaemonStopCompleted` | `pid`, `duration_ms`, `force_killed` (boolean) | Daemon process confirmed exited |

### Funnel Metrics & Success Indicators

- **Clean Shutdown Rate**: Percentage of `ServerShutdownCompleted` events where `exit_code == 0` and `subsystems_timed_out` is empty. Target: >99%.
- **Mean Shutdown Duration**: Average `total_duration_ms` from `ServerShutdownCompleted`. Target: <5 seconds under normal load.
- **Request Drain Success Rate**: `requests_drained / (requests_drained + requests_rejected)`. Target: >95% (most requests should complete, few should be rejected).
- **Daemon Force-Kill Rate**: Percentage of `DaemonStopCompleted` where `force_killed == true`. Target: <1%.
- **Zero-Downtime Upgrade Success Rate**: Measured externally by monitoring — percentage of upgrades with no user-visible errors. Target: >99.9%.

## Observability

### Logging Requirements

**Structured Log Context**

All shutdown-related logs must include:
- `component: "shutdown"`
- `phase: "drain" | "cleanup" | "close" | "exit"`
- `shutdown_id`: Unique ID for this shutdown sequence (for correlating logs)

**Log Events**

| Log | Level | Structured Fields | When |
|-----|-------|-------------------|------|
| `Shutdown initiated` | `info` | `reason`, `deadline_ms`, `active_connections` | Signal received |
| `Subsystem cleanup started` | `info` | `subsystem`, `timeout_ms` | Each subsystem begins cleanup |
| `Subsystem cleanup completed` | `info` | `subsystem`, `duration_ms` | Each subsystem finishes |
| `Subsystem cleanup timed out` | `warn` | `subsystem`, `timeout_ms` | Subsystem exceeded its timeout |
| `Subsystem cleanup failed` | `error` | `subsystem`, `error_message`, `stack` | Subsystem threw during cleanup |
| `HTTP drain complete` | `info` | `drained_count`, `rejected_count`, `duration_ms` | All HTTP connections closed |
| `SSH drain complete` | `info` | `sessions_drained`, `sessions_forced`, `duration_ms` | All SSH sessions closed |
| `SSE cleanup complete` | `info` | `subscribers_closed`, `channels_unsubscribed` | SSE fully torn down |
| `Database connection pool closed` | `info` | `duration_ms` | Pool `.end()` resolved |
| `Database close timed out` | `error` | `timeout_ms` | Pool did not drain in time |
| `Shutdown complete` | `info` | `total_duration_ms`, `exit_code` | Process about to exit |
| `Duplicate signal ignored` | `debug` | `signal`, `count` | Second SIGINT/SIGTERM received |
| `Force exit on third signal` | `warn` | `signal` | Third signal triggers immediate exit |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_shutdown_total` | counter | `reason`, `exit_code` | Total shutdown events |
| `codeplane_shutdown_duration_seconds` | histogram | `reason` | End-to-end shutdown duration |
| `codeplane_shutdown_subsystem_duration_seconds` | histogram | `subsystem`, `status` (completed/timeout/error) | Per-subsystem cleanup duration |
| `codeplane_shutdown_connections_drained` | gauge | `type` (http/ssh/sse) | Connections drained during last shutdown |
| `codeplane_shutdown_connections_forced` | gauge | `type` (http/ssh/sse) | Connections force-closed during last shutdown |
| `codeplane_shutdown_requests_rejected_total` | counter | — | Requests rejected with 503 during shutdown |
| `codeplane_server_state` | gauge | — | 0 = running, 1 = shutting_down, 2 = stopped |

### Alerts

**Alert 1: Shutdown Duration Exceeded SLO**
- **Condition**: `codeplane_shutdown_duration_seconds > 25` (within 5s of the 30s deadline)
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_shutdown_subsystem_duration_seconds` to identify which subsystem is slow.
  2. If database: check for long-running queries with `SELECT * FROM pg_stat_activity WHERE state = 'active'`. Consider reducing `CODEPLANE_SHUTDOWN_TIMEOUT_MS` or adding statement timeout.
  3. If SSH: check for stuck SSH sessions (large file transfers). Consider reducing max upload size or adding per-session timeout.
  4. If SSE: check subscriber count — many subscribers may slow down the shutdown loop. Verify SSE cleanup has parallelism.
  5. If persistent: scale down max connections or add connection deadline middleware.

**Alert 2: Shutdown Subsystem Failure**
- **Condition**: `increase(codeplane_shutdown_total{exit_code="1"}[1h]) > 0`
- **Severity**: Critical
- **Runbook**:
  1. Search logs for `component=shutdown` and `level=error` in the affected time window.
  2. Identify the failing subsystem from `subsystem_cleanup_failed` log entries.
  3. If database: verify database connectivity and check for connection pool exhaustion.
  4. If preview: check container runtime health (`docker ps` or equivalent).
  5. If SSH: check for kernel-level socket issues (`ss -tn | grep CLOSE_WAIT`).
  6. File a bug if the subsystem failure is reproducible and not infrastructure-related.

**Alert 3: High Force-Kill Rate for Daemon**
- **Condition**: `rate(codeplane_daemon_force_killed_total[1d]) / rate(codeplane_daemon_stopped_total[1d]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check daemon logs for what is blocking graceful exit.
  2. Common cause: sync flush taking too long due to upstream API timeout. Increase `CODEPLANE_DAEMON_STOP_TIMEOUT_MS` or add sync flush timeout.
  3. Check for filesystem watcher FD leaks (`lsof -p <daemon_pid> | wc -l`).
  4. If persistent: profile daemon shutdown with `--inspect` flag and check for unresolved promises.

**Alert 4: Shutdown During Active Workflow Runs**
- **Condition**: Log event `Shutdown initiated` with `active_workflow_runs > 0`
- **Severity**: Info
- **Runbook**:
  1. This is informational — workflow runs should be marked `interrupted` and are retriable.
  2. Verify interrupted runs appear correctly in the UI and can be retried.
  3. If runs are stuck in `running` after restart, the stale run cleanup job (60s interval) should catch them within 1 hour.
  4. For immediate resolution, use `codeplane admin workflow-runs --stale --fix`.

### Error Cases and Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Database connection pool won't drain | Shutdown hangs until deadline, exits with code 1 | Force-close pool after 10s; log offending queries |
| SSH session won't close (stuck transfer) | SSH drain hangs | Per-session timeout (configurable, default 15s); force-close socket |
| SSE UNLISTEN throws (PG connection lost) | Best-effort; logged and skipped | Catch per-channel, continue loop |
| PID file write fails on daemon start | Daemon stop command can't find process | Log warning; fall back to process name lookup |
| SIGKILL during Phase 4 (database close) | Potential connection leak on PG server side | PG idle connection timeout will reclaim; no data loss since transactions are committed or rolled back |
| Preview container runtime unreachable | Preview cleanup throws | Catch and log; containers persist and are cleaned on next startup |
| Filesystem watcher close hangs | Daemon shutdown delayed | Per-watcher close timeout (2s); force-close FD |

## Verification

### Integration Tests — Server Shutdown

- [ ] **Shutdown on SIGINT**: Start server, send SIGINT, verify process exits with code 0 within 30 seconds.
- [ ] **Shutdown on SIGTERM**: Start server, send SIGTERM, verify process exits with code 0 within 30 seconds.
- [ ] **Shutdown with zero connections**: Start server, send SIGTERM, verify process exits within 2 seconds.
- [ ] **Health endpoint returns 503 during shutdown**: Start server, send SIGTERM, immediately poll `/api/health`, verify 503 with `shutting_down` status and `Retry-After` header.
- [ ] **Requests rejected with 503 during shutdown**: Start server, send SIGTERM, send a request to any API endpoint, verify 503 with `server_shutting_down` error.
- [ ] **In-flight HTTP request completes**: Start server, begin a slow request (e.g., large file upload simulation), send SIGTERM during the request, verify the request completes successfully.
- [ ] **In-flight HTTP request exceeding deadline is terminated**: Start server, begin an extremely slow request, send SIGTERM, verify the request is terminated and the server exits within deadline + 1 second.
- [ ] **Duplicate SIGTERM ignored**: Start server, send SIGTERM twice rapidly, verify only one shutdown sequence runs (check logs for single "Shutdown initiated" entry).
- [ ] **Third signal forces immediate exit**: Start server, mock a slow subsystem cleanup (>30s), send SIGTERM three times, verify process exits immediately on third signal with code 1.
- [ ] **Shutdown deadline respected**: Start server, mock a subsystem that never completes cleanup, send SIGTERM, verify process exits within `CODEPLANE_SHUTDOWN_TIMEOUT_MS` + 1 second.
- [ ] **Custom shutdown timeout via environment variable**: Start server with `CODEPLANE_SHUTDOWN_TIMEOUT_MS=5000`, send SIGTERM with a hanging subsystem, verify exit within 6 seconds.
- [ ] **Invalid shutdown timeout falls back to default**: Start server with `CODEPLANE_SHUTDOWN_TIMEOUT_MS=not_a_number`, send SIGTERM, verify 30-second default is used (check logs for warning).
- [ ] **Shutdown timeout below minimum clamps to minimum**: Start server with `CODEPLANE_SHUTDOWN_TIMEOUT_MS=1000`, verify it clamps to 5000 (check logs).
- [ ] **Shutdown timeout above maximum clamps to maximum**: Start server with `CODEPLANE_SHUTDOWN_TIMEOUT_MS=999999`, verify it clamps to 300000 (check logs).

### Integration Tests — SSH Draining

- [ ] **SSH server stops accepting new connections**: Start server, send SIGTERM, attempt new SSH connection, verify connection is refused.
- [ ] **Active SSH session completes during shutdown**: Start server, begin SSH git push, send SIGTERM during push, verify push completes successfully.
- [ ] **SSH sessions force-closed at deadline**: Start server, begin a very slow SSH transfer, send SIGTERM, verify session is closed when deadline expires.

### Integration Tests — SSE Cleanup

- [ ] **SSE subscribers receive shutdown event**: Connect an SSE subscriber to notifications stream, send SIGTERM, verify subscriber receives `event: shutdown` before disconnection.
- [ ] **SSE keep-alive intervals cleared**: Connect multiple SSE subscribers, send SIGTERM, verify no keep-alive comments are sent after shutdown event.
- [ ] **PostgreSQL LISTEN channels unsubscribed**: Connect SSE subscribers to multiple channels, send SIGTERM, verify LISTEN channels are removed from PG (query `pg_listening_channels()`).

### Integration Tests — Background Job Cleanup

- [ ] **CleanupScheduler timers stopped**: Start server, verify cleanup tasks are running (via metrics or logs), send SIGTERM, verify no new cleanup task iterations start after shutdown signal.
- [ ] **In-progress cleanup task completes**: Start server, trigger a cleanup task, send SIGTERM during execution, verify the task's current iteration completes.

### Integration Tests — Database Draining

- [ ] **Database pool drained on clean shutdown**: Start server, create a few active DB queries, send SIGTERM, verify pool `.end()` completes and all connections are returned.
- [ ] **Database drain timeout logged**: Start server, mock a query that runs for 30 seconds, send SIGTERM, verify database close timeout warning is logged and process exits with code 1.

### Integration Tests — Daemon Shutdown

- [ ] **`daemon stop` with running daemon**: Start daemon, run `daemon stop`, verify daemon exits cleanly and PID file is removed.
- [ ] **`daemon stop` with non-running daemon**: Ensure no daemon is running, run `daemon stop`, verify message "Daemon is not running" and exit code 0.
- [ ] **`daemon stop` with stale PID file**: Create a stale PID file with a non-existent PID, run `daemon stop`, verify stale PID file is cleaned up and appropriate message is displayed.
- [ ] **`daemon stop` force-kill escalation**: Start daemon, mock a cleanup that hangs, run `daemon stop`, verify SIGKILL is sent after timeout and PID file is removed.
- [ ] **`daemon stop` with custom timeout**: Start daemon, run `daemon stop` with `CODEPLANE_DAEMON_STOP_TIMEOUT_MS=1000`, verify timeout is respected.
- [ ] **Daemon sync flush on shutdown**: Start daemon with pending sync queue items, send SIGTERM, verify sync queue is flushed before exit.
- [ ] **Daemon filesystem watchers closed**: Start daemon with active auto-push watchers, send SIGTERM, verify all watchers are closed (no FD leaks).

### Integration Tests — Preview Cleanup

- [ ] **Preview idle timers cleared on shutdown**: Create preview environments with idle timers, send SIGTERM, verify timers are cleared and no timer callbacks fire post-shutdown.
- [ ] **Preview containers persist after shutdown**: Create preview environments with running containers, send SIGTERM, verify containers are still running after server exits.

### E2E Tests — Web UI (Playwright)

- [ ] **Reconnection banner on server restart**: Load the web UI, restart the server (kill and relaunch), verify the "instance is restarting" banner appears and disappears when the server is back.
- [ ] **SSE reconnection after shutdown**: Open a page with SSE (e.g., workflow log stream), restart the server, verify the SSE stream reconnects and resumes.
- [ ] **No data loss on form submission during shutdown**: Begin filling out an issue creation form, shut down the server, verify the UI shows the reconnection banner (not a crash or lost form state).

### E2E Tests — CLI

- [ ] **CLI handles 503 gracefully**: Run a CLI command while the server is shutting down, verify the CLI displays a user-friendly message like "Server is restarting, please try again shortly" rather than a raw error.
- [ ] **`codeplane health` shows shutting_down**: Run `codeplane health` against a server in shutdown, verify it displays `Status: shutting_down`.

### E2E Tests — API

- [ ] **Full shutdown lifecycle via API**: Start server, create active state (push repo, start SSE, dispatch workflow), send SIGTERM, verify: health returns 503, new requests get 503, SSE receives shutdown event, process exits with code 0, and logs contain complete shutdown report.
- [ ] **Concurrent shutdown and heavy load**: Start server, generate sustained load (100 concurrent API requests), send SIGTERM during load, verify all in-flight requests complete or receive 503, no requests hang forever, and process exits within deadline.

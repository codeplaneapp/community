# WORKFLOW_LOG_STORAGE

Specification for WORKFLOW_LOG_STORAGE.

## High-Level User POV

As a platform engineer or self-hosting administrator, I need workflow run logs to be stored durably and retrievable so that I can debug failed runs, audit execution history, and stream logs in real-time during active runs. The system should handle log ingestion from workflow runners, persist logs with structured metadata (step, task, severity, timestamps), support real-time SSE streaming for in-progress runs, and serve historical log retrieval with pagination and filtering. Logs should be accessible from the web UI, CLI, TUI, and API with consistent behavior across all clients.

## Acceptance Criteria

1. Workflow run logs are persisted with structured metadata: run ID, step ID, task ID, severity level, timestamp, and content.
2. Logs can be streamed in real-time via SSE during active workflow runs using the existing SSE manager.
3. Historical logs are retrievable via GET /api/repos/:owner/:repo/workflows/runs/:runId/logs with pagination (cursor/limit) and filtering by step, task, and severity.
4. Log ingestion accepts batched writes from workflow runners via POST with idempotency keys to prevent duplicates.
5. Log retention policies are configurable per-repository with default retention of 90 days.
6. Log storage supports both database-backed storage (for metadata and small logs) and blob store (for large log payloads exceeding 64KB).
7. CLI `workflow run logs` command streams or fetches logs with --follow, --step, --task, and --severity flags.
8. TUI and web UI display logs with auto-scroll during streaming and severity-based coloring.
9. Logs are automatically cleaned up by the existing cleanup scheduler when retention period expires.
10. Log count and storage size are included in workflow run detail responses.

## Design

### Storage Model
- **Table: `workflow_run_logs`** with columns: id (uuid), run_id (fk), step_id (nullable), task_id (nullable), severity (enum: debug|info|warn|error|fatal), timestamp (timestamptz), content (text for ≤64KB), blob_ref (text, nullable, for >64KB), sequence_number (bigint, monotonic per run), idempotency_key (text, unique).
- **Index**: composite on (run_id, sequence_number) for ordered retrieval; partial index on (run_id, severity) for filtered queries; unique index on idempotency_key.
- **Blob overflow**: When log line content exceeds 64KB, content is stored in the shared blob store (same abstraction used by release assets and LFS) and blob_ref is populated instead of content.

### Service Layer (packages/sdk/src/services/workflow-log.ts)
- `appendLogs(runId, entries[])`: Batch insert with idempotency key dedup. Emits SSE events via SSE manager for each entry.
- `getLogs(runId, opts: {cursor?, limit?, stepId?, taskId?, severity?})`: Cursor-based pagination using sequence_number. Returns log entries with content resolved from blob store if needed.
- `streamLogs(runId)`: Returns SSE-compatible stream using existing SSE manager patterns. Replays existing logs then switches to live tail.
- `getLogStats(runId)`: Returns count and total size for inclusion in run detail.
- `purgeExpiredLogs(retentionDays)`: Called by cleanup scheduler. Deletes logs and associated blobs older than retention threshold.

### Route Layer (apps/server/src/routes/workflows.ts)
- `GET /api/repos/:owner/:repo/workflows/runs/:runId/logs` — paginated historical retrieval
- `GET /api/repos/:owner/:repo/workflows/runs/:runId/logs/stream` — SSE streaming endpoint
- `POST /api/repos/:owner/:repo/workflows/runs/:runId/logs` — batch log ingestion (runner-facing)

### Client Integration
- SDK API client adds `getRunLogs()`, `streamRunLogs()` methods to existing workflow client.
- CLI `workflow run logs <runId>` with --follow (SSE), --step, --task, --severity, --json flags.
- TUI workflow run detail screen adds log panel with severity coloring and auto-scroll.
- Web UI workflow run detail adds log viewer component reusing existing SSE event source patterns.

### Pagination
- Uses cursor/limit pattern (consistent with other cursor-based APIs in the codebase) where cursor is the last-seen sequence_number.

## Permissions & Security

- **Log read**: Any user with read access to the repository can read workflow run logs (same permission as viewing workflow runs).
- **Log write/ingest**: Only authenticated workflow runners with a valid run-scoped token can POST logs. The run-scoped token is issued during workflow run creation and validated in the ingestion middleware.
- **Log purge**: Only repository admins and system-level cleanup scheduler can purge logs.
- **SSE streaming**: Requires the same read access as log retrieval; SSE connection is authenticated via session cookie or PAT.
- **Admin override**: Server admins can access logs for any repository via admin routes.

## Telemetry & Product Analytics

- **log_entries_ingested_total** (counter): Total log entries ingested, labeled by repository and severity.
- **log_bytes_ingested_total** (counter): Total bytes of log content ingested.
- **log_blob_overflow_total** (counter): Number of log entries that exceeded 64KB and were stored in blob store.
- **log_retrieval_duration_seconds** (histogram): Latency of log retrieval queries.
- **log_sse_connections_active** (gauge): Number of active SSE log streaming connections.
- **log_purge_entries_deleted_total** (counter): Number of log entries deleted during retention cleanup.
- **log_storage_bytes** (gauge): Total log storage consumption per repository (sampled periodically by cleanup scheduler).

## Observability

- **Structured logging**: All log service operations emit structured log entries with run_id, step_id, operation type, and duration.
- **Error tracking**: Failed log ingestions (idempotency conflicts, blob store failures, DB errors) are logged at WARN/ERROR with full context for debugging.
- **Health check integration**: Log storage health (DB connectivity, blob store reachability) is included in the existing /health endpoint response.
- **SSE connection monitoring**: Active SSE connections for log streaming are tracked and exposed via the existing SSE manager's connection accounting. Stale connections are cleaned up on configurable timeout (default 5 minutes of inactivity).
- **Cleanup scheduler reporting**: Each retention cleanup run logs the number of entries purged, bytes reclaimed, duration, and any errors encountered.
- **Alerting signals**: Log ingestion failure rate > 1% over 5 minutes, SSE connection count exceeding 1000 per server instance, and blob store latency exceeding 500ms p99 should trigger alerts.

## Verification

### Unit Tests (packages/sdk)
1. `workflow-log.service.test.ts`: Test appendLogs with valid entries, idempotency key dedup, blob overflow threshold, cursor-based pagination, severity filtering, step/task filtering, and purge behavior.
2. Test that sequence numbers are monotonically increasing per run even under concurrent appends.
3. Test blob store fallback: entries >64KB are stored in blob store and content is resolved on retrieval.

### Integration Tests (apps/server)
1. `workflow-logs.routes.test.ts`: Test full HTTP lifecycle — POST logs, GET with pagination, GET with filters, verify SSE stream delivers real-time entries.
2. Test auth enforcement: unauthenticated requests return 401, read-only users cannot POST, runner tokens are validated.
3. Test idempotency: duplicate POST with same idempotency key returns success without creating duplicate entries.
4. Test large payload handling: POST with entries exceeding 64KB content triggers blob store path.

### E2E Tests
1. `workflow-log-streaming.e2e.ts`: Start a workflow run, connect SSE stream, POST logs from simulated runner, verify SSE client receives entries in order with correct metadata.
2. `workflow-log-retention.e2e.ts`: Create logs with backdated timestamps, trigger cleanup, verify expired logs are purged and unexpired logs remain.

### CLI Tests
1. Test `workflow run logs <runId>` outputs formatted logs with severity coloring.
2. Test `--follow` flag establishes SSE connection and prints new entries as they arrive.
3. Test `--json` flag outputs structured JSON log entries.
4. Test `--step` and `--severity` filters are passed to API and results are correctly filtered.

### Manual Verification Checklist
- [ ] Web UI: Navigate to workflow run detail, verify log panel loads and auto-scrolls during active run.
- [ ] TUI: Open workflow run detail, verify logs display with severity coloring.
- [ ] CLI: Run `codeplane workflow run logs` with --follow on an active run, verify real-time output.
- [ ] Retention: Configure 1-day retention, create logs, advance time, run cleanup, verify purge.

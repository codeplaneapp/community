# WORKSPACE_SESSION_INPUT_CLIENT

Specification for WORKSPACE_SESSION_INPUT_CLIENT.

## High-Level User POV

When a Codeplane user opens a terminal for their workspace — whether from the web terminal dock, the TUI workspace screen, or through the desktop app — they expect to type commands and see their output in real time, just like a local terminal. Today, Codeplane creates workspace sessions, provisions SSH connection info, and streams session status updates. But the web-based terminal experience has a critical missing piece: there is no way for browser-based clients to send keyboard input (keystrokes, paste operations, control sequences) to the running workspace container over HTTP.

Native terminal clients like the CLI and TUI can use the SSH connection info directly because they run in environments that support SSH. The web browser cannot. The Workspace Session Input Client feature closes this gap by providing an HTTP-based channel for web terminal clients to send terminal input data to an active workspace session. This enables the web terminal dock, desktop webview terminal, and any browser-based integration to deliver a fully interactive terminal experience without requiring the user to install SSH tools or leave the browser.

From the user's perspective, this is invisible plumbing. They open a terminal panel in the web UI, and it works. They type commands, paste text, hit Ctrl-C, resize their window, and everything flows through to the workspace container and back. The terminal dock becomes a real, usable terminal rather than a status display that tells you to SSH in manually.

This feature also supports terminal resize. When the user adjusts their browser window or drags the terminal dock taller, the client sends updated dimensions so the workspace container can reflow its output accordingly. This means that programs like vim, htop, or any TUI application inside the workspace respond correctly to the user's actual terminal size.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access to a repository can send terminal input to an active workspace session they own via a server-exposed HTTP endpoint.
- [ ] An authenticated user can send a terminal resize signal to an active workspace session they own via a server-exposed HTTP endpoint.
- [ ] The web terminal dock in the web UI uses the input endpoint to deliver keystrokes, paste data, and control sequences to the workspace container.
- [ ] The web terminal dock uses the resize endpoint to update terminal dimensions when the panel is resized.
- [ ] Terminal output from the workspace container is streamed back to the web client via an SSE or streaming HTTP response so the user sees real-time command output.
- [ ] The full lifecycle — create session → connect → send input → receive output → resize → disconnect — works end-to-end in the web UI without the user needing SSH tools.
- [ ] The desktop app's embedded webview terminal dock works identically to the browser-based web terminal.
- [ ] Input delivery latency is below 100ms p95 for keystrokes under normal conditions.
- [ ] The terminal session remains interactive under sustained typing and program output (e.g., `cat /dev/urandom | hexdump` does not block input).
- [ ] The feature degrades gracefully when the sandbox client is unavailable (clear error message, no hung state).
- [ ] Session idle tracking is updated on every input, preventing premature idle suspension while the user is actively working.
- [ ] All API, SDK, Web UI, and integration tests pass.

### Input Constraints

- [ ] `data` (terminal input payload): base64-encoded binary string. Maximum decoded size: 64 KB per request. Empty payload is allowed (no-op, used for keepalive).
- [ ] `type` field: must be one of `"input"` or `"resize"`. Any other value returns HTTP 400.
- [ ] For `"input"` type: `data` is required and must be a non-empty base64-encoded string (unless explicitly used as keepalive with empty string).
- [ ] For `"resize"` type: `cols` and `rows` are required. `cols` must be a positive integer between 1 and 500 inclusive. `rows` must be a positive integer between 1 and 500 inclusive. `data` field is ignored.
- [ ] Session ID (path parameter): must be a valid UUID (36 characters, hyphenated format). Empty or malformed IDs return HTTP 400.
- [ ] The request body must be valid JSON. Maximum request body size: 128 KB. Unparseable body returns HTTP 400.
- [ ] Base64 `data` must be valid base64 encoding. Invalid base64 returns HTTP 400 with `"invalid base64 data"`.

### Edge Cases

- [ ] Sending input to a session in `stopped` status returns HTTP 409 with `"session is not running"`.
- [ ] Sending input to a session in `failed` status returns HTTP 409 with `"session is not running"`.
- [ ] Sending input to a session in `pending` status returns HTTP 409 with `"session is not running"`.
- [ ] Sending input to a nonexistent session ID returns HTTP 404 with `"workspace session not found"`.
- [ ] Sending input to a session belonging to a different user returns HTTP 404 (no information leakage).
- [ ] Sending input to a session belonging to a different repository returns HTTP 404.
- [ ] If the underlying workspace container has crashed or been removed, returns HTTP 502 with `"workspace container is not reachable"`.
- [ ] If the sandbox client is unavailable, returns HTTP 500 with `"sandbox client unavailable"`.
- [ ] Sending a resize with `cols=0` or `rows=0` returns HTTP 400 with `"cols and rows must be positive integers"`.
- [ ] Sending a resize with fractional values (e.g., `cols=80.5`) returns HTTP 400.
- [ ] Rapid-fire input requests (e.g., paste of 50 KB) are processed in order. The server must not reorder input chunks.
- [ ] If the docker/podman exec for input delivery fails (container OOM, exec timeout), the error is returned as HTTP 502 and the session is not automatically destroyed.
- [ ] Concurrent input from multiple browser tabs for the same session is allowed. Inputs are delivered in arrival order (no cross-tab synchronization guarantee).
- [ ] Sending input with `data` containing null bytes (`\x00`) is valid — binary data must pass through unmodified.
- [ ] Sending input with `data` exceeding 64 KB (decoded) returns HTTP 413 with `"input data exceeds maximum size"`.

### Boundary Constraints

- [ ] Maximum decoded `data` size per request: 64 KB (65,536 bytes).
- [ ] Maximum request body size: 128 KB (131,072 bytes).
- [ ] `cols` range for resize: 1–500 inclusive.
- [ ] `rows` range for resize: 1–500 inclusive.
- [ ] Session ID: exactly 36 characters, UUID format.
- [ ] Activity timestamp touch granularity: at most once per second per session to avoid excessive DB writes under rapid input.
- [ ] Output stream chunk size: up to 16 KB per SSE event.
- [ ] Output stream keepalive interval: 15 seconds (consistent with existing SSE streams).
- [ ] Output stream buffer: up to 256 KB of pending output before backpressure pauses container output reads.

## Design

### API Shape

#### Send Session Input

**Endpoint:** `POST /api/repos/:owner/:repo/workspace/sessions/:id/input`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Repository owner username or organization slug |
| `repo` | string | Yes | Repository name |
| `id` | string (UUID) | Yes | Workspace session ID |

**Request Body (JSON):**

```json
{
  "type": "input",
  "data": "bHMgLWxhCg=="
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"input"` \| `"resize"` | Yes | Message type |
| `data` | string (base64) | Yes for `input` type | Base64-encoded terminal input bytes |
| `cols` | integer | Yes for `resize` type | New terminal width in columns (1–500) |
| `rows` | integer | Yes for `resize` type | New terminal height in rows (1–500) |

**Resize example:**
```json
{
  "type": "resize",
  "cols": 120,
  "rows": 40
}
```

**Success Response:** `200 OK`
```json
{
  "ok": true,
  "bytes_written": 7
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Whether the input was delivered |
| `bytes_written` | integer | Number of decoded bytes delivered to the container (0 for resize) |

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid JSON body | `{ "message": "invalid request body" }` |
| 400 | Missing or invalid `type` | `{ "message": "type must be 'input' or 'resize'" }` |
| 400 | Invalid base64 `data` | `{ "message": "invalid base64 data" }` |
| 400 | Missing `cols`/`rows` for resize | `{ "message": "cols and rows must be positive integers" }` |
| 400 | Empty session ID | `{ "message": "session id is required" }` |
| 401 | Unauthenticated | `{ "message": "unauthorized" }` |
| 403 | No write access | `{ "message": "forbidden" }` |
| 404 | Session/workspace not found | `{ "message": "workspace session not found" }` |
| 409 | Session not running | `{ "message": "session is not running" }` |
| 413 | Input data too large | `{ "message": "input data exceeds maximum size" }` |
| 429 | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |
| 500 | Sandbox unavailable | `{ "message": "sandbox client unavailable" }` |
| 502 | Container unreachable | `{ "message": "workspace container is not reachable" }` |

#### Session Output Stream

**Endpoint:** `GET /api/repos/:owner/:repo/workspace/sessions/:id/output`

**Response:** `200 OK` with `Content-Type: text/event-stream`

Server-Sent Events stream carrying terminal output from the workspace container.

**Event format:**
```
event: output
data: {"data":"base64-encoded-output-chunk","timestamp":"2026-03-22T14:30:00.123Z"}

event: resize
data: {"cols":120,"rows":40,"timestamp":"2026-03-22T14:30:01.456Z"}

event: exit
data: {"exit_code":0,"timestamp":"2026-03-22T14:30:02.789Z"}

:keepalive
```

| Event Type | Description |
|------------|-------------|
| `output` | Terminal output chunk (stdout/stderr interleaved, base64-encoded) |
| `resize` | Confirmation of terminal resize |
| `exit` | Session process has exited |
| keepalive | Sent every 15 seconds |

### SDK Shape

**New types:**
```typescript
interface SessionInputMessage {
  type: "input" | "resize";
  data?: string;       // base64-encoded for type="input"
  cols?: number;       // for type="resize"
  rows?: number;       // for type="resize"
}

interface SessionInputResult {
  ok: boolean;
  bytes_written: number;
}

interface SessionOutputEvent {
  type: "output" | "resize" | "exit";
  data?: string;       // base64-encoded terminal output
  cols?: number;
  rows?: number;
  exit_code?: number;
  timestamp: string;
}
```

**New service methods on `WorkspaceService`:**
```typescript
WorkspaceService.sendSessionInput(
  sessionID: string,
  repositoryID: number,
  userID: number,
  message: SessionInputMessage
): Promise<SessionInputResult>

WorkspaceService.subscribeSessionOutput(
  sessionID: string,
  repositoryID: number,
  userID: number
): AsyncGenerator<SessionOutputEvent>
```

**New sandbox client methods on `ContainerSandboxClient`:**
```typescript
ContainerSandboxClient.execInteractive(
  vmId: string,
  sessionId: string,
  options?: { cols?: number; rows?: number; shell?: string }
): { stdin: WritableStream; stdout: ReadableStream; resize: (cols: number, rows: number) => void; kill: () => void }

ContainerSandboxClient.writeToSession(
  vmId: string,
  sessionId: string,
  data: Buffer
): Promise<{ bytes_written: number }>

ContainerSandboxClient.resizeSession(
  vmId: string,
  sessionId: string,
  cols: number,
  rows: number
): Promise<void>
```

### UI-Core Hook Shape

```typescript
function useSessionTerminal(options: {
  owner: string;
  repo: string;
  sessionId: string;
}): {
  sendInput: (data: string) => Promise<void>;
  sendResize: (cols: number, rows: number) => Promise<void>;
  output$: ReadableStream<SessionOutputEvent>;
  status: "connecting" | "connected" | "disconnected" | "error";
  error: Error | null;
  reconnect: () => void;
}
```

- `sendInput` buffers keystrokes and flushes in 16ms batches to reduce HTTP overhead.
- `sendResize` debounces with 100ms trailing delay.
- `output$` auto-reconnects on SSE disconnection with exponential backoff (1s, 2s, 4s, max 30s).

### Web UI Design

**Terminal Dock Integration:**

1. "New Terminal" creates a workspace session with viewport-derived `cols`/`rows`, subscribes to output stream, initializes xterm.js, and wires `onData` → `sendInput` and `onResize` → `sendResize`.
2. Connection indicator: green dot (connected), yellow (reconnecting), red (error) in terminal tab header.
3. Error states: sandbox unavailable → "Workspace containers are not available"; container unreachable → "Lost connection. [Reconnect]"; session ended → "This session has ended. [New Terminal]".
4. Copy/paste: Ctrl+Shift+C / Ctrl+Shift+V (Cmd+C/Cmd+V on macOS).
5. Multiple tabs: up to 5 concurrent terminal tabs per repository.
6. Cleanup: closing a tab calls destroy; navigating away destroys all repo sessions.

**Repository Terminal Page (`/:owner/:repo/terminal`):** Full-viewport terminal with toolbar showing session info, reconnect button, and resize indicators.

### TUI UI

The TUI connects via direct SSH and does not use the HTTP input endpoint. No TUI changes required.

### CLI Command

The CLI connects via SSH and does not use the HTTP input endpoint. No CLI changes required.

### Documentation

1. **"Web Terminal" guide** — How to use the terminal dock, keyboard shortcuts, copy/paste, resize, troubleshooting.
2. **API Reference: Session Input** — `POST .../sessions/:id/input` with full schema, errors, rate limits.
3. **API Reference: Session Output** — `GET .../sessions/:id/output` with SSE event format, reconnection guidance.
4. **"Workspace Terminal Architecture" overview** — Web terminal vs SSH access, latency, security model.
5. **Troubleshooting: "Terminal not responding"** — Common causes, diagnostics, recovery.

## Permissions & Security

### Authorization Roles

| Role | Can Send Input | Can Read Output | Notes |
|------|---------------|-----------------|-------|
| Repository Owner | Yes | Yes | Full access to own sessions |
| Repository Admin | Yes | Yes | Full access to own sessions |
| Organization Member with Write | Yes | Yes | Must have write permission on the repo |
| Repository Collaborator (Write) | Yes | Yes | Explicit collaborator grant |
| Repository Collaborator (Read-Only) | No | No | Read access is insufficient |
| Anonymous / Unauthenticated | No | No | Must be authenticated |
| Deploy Key (Write) | No | No | Deploy keys are for git transport only |

**Session ownership enforcement:** Users can only send input to and read output from sessions they created. An admin of a repository cannot access another user's terminal session. Enforced by triple lookup: session ID + repository ID + user ID.

### Rate Limiting

- **Input endpoint:** Maximum 120 requests per second per session (sufficient for rapid typing + paste).
- **Input endpoint per-user global:** Maximum 600 requests per second across all sessions.
- **Output endpoint:** Maximum 10 concurrent SSE connections per user.
- **Input payload size:** 64 KB decoded maximum per request.
- **Burst protection:** A single IP may send at most 1,000 input requests per minute across all users.

### Data Privacy & PII

- Terminal input may contain sensitive data (passwords, tokens, secrets). Input data is not logged, persisted, or recorded at any level.
- Terminal output may contain sensitive data. Output data is not logged or persisted.
- The base64-encoded `data` field is transient — it exists only in memory during request processing and is never written to the database.
- Session records do not store terminal input/output history.
- The output SSE stream is authenticated and session-scoped. A user cannot subscribe to another user's terminal output.
- Container sandbox exec operations may appear in container runtime logs. Ensure the container runtime limits log retention and access.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceSessionInputSent` | Input message successfully delivered to container | `session_id`, `workspace_id`, `repository_id`, `user_id`, `input_type` (input/resize), `bytes_written`, `client` (web/desktop), `latency_ms` |
| `WorkspaceSessionOutputStreamOpened` | Client subscribes to output SSE stream | `session_id`, `workspace_id`, `repository_id`, `user_id`, `client` |
| `WorkspaceSessionOutputStreamClosed` | Client disconnects from output SSE stream | `session_id`, `workspace_id`, `repository_id`, `user_id`, `client`, `duration_seconds`, `bytes_received` |
| `WorkspaceSessionTerminalResized` | Resize message processed | `session_id`, `workspace_id`, `cols`, `rows`, `client` |
| `WorkspaceSessionInputFailed` | Input delivery failed | `session_id`, `workspace_id`, `error_type` (container_unreachable/session_not_running/sandbox_unavailable/payload_too_large), `client` |
| `WorkspaceWebTerminalOpened` | User opens a terminal tab in the web UI | `session_id`, `workspace_id`, `repository_id`, `user_id`, `initial_cols`, `initial_rows` |
| `WorkspaceWebTerminalClosed` | User closes a terminal tab in the web UI | `session_id`, `workspace_id`, `duration_seconds`, `total_input_bytes`, `total_output_bytes` |

**Never included in events:** `data` field contents (terminal input/output), raw keystrokes, or any content flowing through the terminal.

### Funnel Metrics & Success Indicators

1. **Web Terminal Adoption Rate:** Unique users opening at least one web terminal per week. Growth target: 15% week-over-week for first 3 months.
2. **Session Input Success Rate:** `WorkspaceSessionInputSent / (WorkspaceSessionInputSent + WorkspaceSessionInputFailed)`. Target: ≥ 99.9%.
3. **Input-to-Output Roundtrip Latency:** Time from input POST to first output SSE event. Target: p50 < 100ms, p95 < 300ms.
4. **Web Terminal Session Duration:** Median time a web terminal tab is open.
5. **Output Stream Reconnection Rate:** Reconnections per terminal session. Target: < 0.5 reconnections per hour-long session.
6. **Web Terminal vs SSH Usage Ratio:** Percentage of workspace interactions through web terminal vs. CLI SSH.
7. **Terminal Tab Count Distribution:** Average number of concurrent terminal tabs per user.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Session input request received | `debug` | `session_id`, `workspace_id`, `user_id`, `input_type`, `data_size_bytes` |
| Session input delivered to container | `debug` | `session_id`, `vm_id`, `bytes_written`, `latency_ms` |
| Session input delivery failed | `error` | `session_id`, `vm_id`, `error`, `input_type` |
| Session resize processed | `info` | `session_id`, `workspace_id`, `cols`, `rows` |
| Session resize failed | `error` | `session_id`, `vm_id`, `cols`, `rows`, `error` |
| Output stream opened | `info` | `session_id`, `workspace_id`, `user_id` |
| Output stream closed | `info` | `session_id`, `workspace_id`, `user_id`, `duration_seconds`, `reason` |
| Output stream error | `error` | `session_id`, `vm_id`, `error` |
| Output stream reconnected | `info` | `session_id`, `reconnect_count` |
| Container exec for input timed out | `error` | `session_id`, `vm_id`, `timeout_ms` |
| Container not reachable during input | `warn` | `session_id`, `vm_id`, `container_state` |
| Sandbox client unavailable for input | `error` | `session_id`, `repository_id` |
| Session activity timestamp debounce skipped | `debug` | `session_id`, `last_touch_age_ms` |
| Input payload exceeds maximum size | `warn` | `session_id`, `user_id`, `payload_size_bytes`, `max_size_bytes` |
| Invalid base64 in input payload | `warn` | `session_id`, `user_id` |

**Critical rule:** The `data` field content (raw terminal input/output) is NEVER logged at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_session_input_total` | Counter | `type` (input/resize), `status` (200/400/404/409/413/429/500/502) | Total session input requests |
| `codeplane_workspace_session_input_duration_seconds` | Histogram | `type` (input/resize) | Input endpoint latency (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_workspace_session_input_bytes_total` | Counter | | Total decoded input bytes delivered |
| `codeplane_workspace_session_output_streams_active` | Gauge | | Currently active output SSE streams |
| `codeplane_workspace_session_output_bytes_total` | Counter | | Total output bytes streamed to clients |
| `codeplane_workspace_session_output_events_total` | Counter | `type` (output/resize/exit/keepalive) | Total SSE events emitted |
| `codeplane_workspace_session_output_stream_duration_seconds` | Histogram | | Duration of output stream connections |
| `codeplane_workspace_session_output_reconnects_total` | Counter | | Client-side output stream reconnections |
| `codeplane_workspace_session_container_exec_errors_total` | Counter | `error_type` (timeout/unreachable/exec_failed) | Container exec failures |
| `codeplane_workspace_session_input_payload_size_bytes` | Histogram | | Decoded input payload size (buckets: 1, 10, 100, 1000, 10000, 65536) |

### Alerts & Runbooks

#### Alert: `WorkspaceSessionInputHighErrorRate`
- **Condition:** `rate(codeplane_workspace_session_input_total{status=~"5.."}[5m]) / rate(codeplane_workspace_session_input_total[5m]) > 0.05`
- **Severity:** Warning (>5%), Critical (>20%)
- **Runbook:**
  1. Check `status` label distribution: 500s (sandbox unavailable) vs 502s (container unreachable).
  2. If 500s: verify container sandbox runtime is running (`docker info`). Restart if needed.
  3. If 502s: check for mass container crashes via `docker ps -a --filter label=tech.codeplane.workspace=true`. Check OOM kills via `dmesg | grep oom`.
  4. Check disk space on sandbox host.
  5. Check `codeplane_workspace_session_container_exec_errors_total` by `error_type`.
  6. If transient, self-resolves. If persistent, escalate to infrastructure.

#### Alert: `WorkspaceSessionInputHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workspace_session_input_duration_seconds_bucket[5m])) > 0.5`
- **Severity:** Warning
- **Runbook:**
  1. Check container exec performance — `docker exec` latency may be high under host CPU pressure.
  2. Check container resource contention.
  3. Check API server event loop for high request queue depth.
  4. Check database query latency for session lookups.
  5. Consider session lookup cache (LRU, 5s TTL).

#### Alert: `WorkspaceSessionOutputStreamCountHigh`
- **Condition:** `codeplane_workspace_session_output_streams_active > 500`
- **Severity:** Warning
- **Runbook:**
  1. Each output stream holds an open HTTP connection and container exec process. 500+ may exhaust file descriptors.
  2. Check for orphaned streams.
  3. Verify `ulimit -n` ≥ 65536.
  4. Check memory usage (256 KB buffer per stream).
  5. If legitimate load, scale horizontally.

#### Alert: `WorkspaceSessionContainerExecTimeouts`
- **Condition:** `rate(codeplane_workspace_session_container_exec_errors_total{error_type="timeout"}[5m]) > 1`
- **Severity:** Warning
- **Runbook:**
  1. Container exec timeout means shell didn't respond.
  2. Check container health: `docker exec <id> echo alive`.
  3. Check container CPU/memory limits.
  4. Check init process: `docker top <id>`.
  5. If single container, destroy and recreate session.
  6. If widespread, check host I/O saturation.

#### Alert: `WorkspaceSessionOutputStreamErrors`
- **Condition:** High exit rate relative to input rate.
- **Severity:** Warning
- **Runbook:**
  1. High exit rate suggests containers crashing.
  2. Check container logs: `docker logs <vm_id>`.
  3. Check OOM kills: `docker events --filter type=container`.
  4. Verify workspace images are stable.
  5. Roll back problematic image versions.

### Error Cases & Failure Modes

| Error Case | HTTP Status | User Impact | Recovery |
|------------|-------------|-------------|----------|
| Sandbox runtime unavailable | 500 | No terminal functionality | Admin restarts sandbox |
| Container exec timeout | 502 | Input not delivered | Retry; recreate session if persistent |
| Container crashed/removed | 502 | Terminal disconnects | Create new terminal |
| Session already stopped | 409 | Cannot type | Create new session |
| Base64 decode failure | 400 | Input rejected | Fix client encoding |
| Payload too large | 413 | Paste rejected | Client chunks large pastes |
| Rate limited | 429 | Typing briefly blocked | Automatic retry with backoff |
| DB connection failure | 500 | Session lookup fails | Retry; admin checks DB |
| SSE stream disconnected | N/A | Output pauses | Client auto-reconnects |
| Host out of memory | 502 | Container exec fails | Admin scales infrastructure |
| Docker daemon unresponsive | 502 | All inputs fail | Admin restarts Docker |

## Verification

### API Integration Tests — Input Endpoint

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 1 | Send `type=input` with valid base64 data to running session | 200, `ok=true`, `bytes_written` matches decoded data length |
| 2 | Send `type=resize` with valid cols/rows to running session | 200, `ok=true`, `bytes_written=0` |
| 3 | Send empty `data` for keepalive | 200, `ok=true`, `bytes_written=0` |
| 4 | Send input to nonexistent session ID | 404, `"workspace session not found"` |
| 5 | Send input to session owned by different user | 404, `"workspace session not found"` |
| 6 | Send input to session in different repository | 404, `"workspace session not found"` |
| 7 | Send input to stopped session | 409, `"session is not running"` |
| 8 | Send input to failed session | 409, `"session is not running"` |
| 9 | Send input to pending session | 409, `"session is not running"` |
| 10 | Send input without authentication | 401 |
| 11 | Send input with read-only access | 403 |
| 12 | Send input with invalid JSON body | 400, `"invalid request body"` |
| 13 | Send input with missing `type` field | 400, `"type must be 'input' or 'resize'"` |
| 14 | Send input with invalid `type` value `"foo"` | 400, `"type must be 'input' or 'resize'"` |
| 15 | Send input with invalid base64 in `data` | 400, `"invalid base64 data"` |
| 16 | Send resize with `cols=0` | 400, `"cols and rows must be positive integers"` |
| 17 | Send resize with `rows=0` | 400, `"cols and rows must be positive integers"` |
| 18 | Send resize with `cols=-1` | 400, `"cols and rows must be positive integers"` |
| 19 | Send resize with `cols=501` | 400, `"cols must be between 1 and 500"` |
| 20 | Send resize with `rows=501` | 400, `"rows must be between 1 and 500"` |
| 21 | Send resize with fractional `cols=80.5` | 400 |
| 22 | Send maximum valid input (64 KB decoded, ~87 KB base64) | 200, `bytes_written=65536` |
| 23 | Send input exceeding maximum (64 KB + 1 byte decoded) | 413, `"input data exceeds maximum size"` |
| 24 | Send input with null bytes in data | 200, `bytes_written` includes null bytes |
| 25 | Send input with empty session ID path param | 400, `"session id is required"` |
| 26 | Send resize with valid boundary cols=1, rows=1 | 200 |
| 27 | Send resize with valid boundary cols=500, rows=500 | 200 |
| 28 | Response has correct `Content-Type: application/json` | Header check passes |
| 29 | Activity timestamp updated after input | Session `last_activity_at` advanced |
| 30 | Activity timestamp debounced on rapid input | 10 rapid inputs produce ≤ 2 DB timestamp writes |
| 31 | Sandbox client unavailable returns 500 | 500, `"sandbox client unavailable"` |
| 32 | Container crashed returns 502 | 502, `"workspace container is not reachable"` |
| 33 | Rate limit enforcement (burst 130 requests in 1 second) | Requests beyond 120/s return 429 |
| 34 | Request body exceeding 128 KB returns error | 400 or 413 |
| 35 | Resize updates session `cols` and `rows` in DB | Session record reflects new dimensions |

### API Integration Tests — Output Endpoint

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 36 | Subscribe to output stream for running session | 200, SSE stream opens |
| 37 | Output stream receives `output` events after input | Send `echo hello\n`, receive output containing `hello` |
| 38 | Output stream receives keepalive within 20 seconds | Keepalive comment received |
| 39 | Output stream for nonexistent session | 404 |
| 40 | Output stream for session owned by different user | 404 |
| 41 | Output stream for stopped session | 409 |
| 42 | Output stream unauthenticated | 401 |
| 43 | Output stream receives `exit` event when process exits | `exit` event with `exit_code` |
| 44 | Output stream receives `resize` confirmation after resize input | `resize` event with matching cols/rows |
| 45 | Multiple concurrent output subscribers for same session | All receive same events |
| 46 | Output stream client disconnect handled cleanly | Server cleans up resources |
| 47 | Output data is valid base64 | Decode all `data` fields without error |
| 48 | Large output streams without blocking input | Input still accepted during large output |

### End-to-End Integration Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 49 | Full lifecycle: create → subscribe output → send `ls\n` → receive listing → destroy | All steps succeed, output contains directory listing |
| 50 | Interactive command: send `echo $((2+2))\n` → receive `4` | Output contains `4` |
| 51 | Control sequence: send Ctrl-C (`\x03`) → process interrupted | Process receives SIGINT |
| 52 | Tab completion: send `ech\t` → receive completion | Output reflects tab behavior |
| 53 | Resize: resize to 40x10 → `tput cols` → output `40` | Dimensions propagated |
| 54 | Paste 10 KB: send base64-encoded 10 KB → verify received | `bytes_written=10240` |
| 55 | Paste at maximum 64 KB: send 64 KB → verify received | `bytes_written=65536` |
| 56 | Paste over maximum 65 KB: send 65 KB → receive 413 | Error returned, no partial delivery |
| 57 | Rapid 100 keystrokes in 500ms: all succeed in order | Output reflects all characters |
| 58 | Multiple sessions: 3 sessions with different commands, independent output | Each session isolated |
| 59 | Session destroy closes output stream | Exit event or connection closes |
| 60 | Workspace suspend during terminal: input returns error | Error returned, UI shows reconnect |
| 61 | Workspace resume then new session: input works | Full functionality restored |
| 62 | Browser refresh: reconnect output stream | Output resumes |
| 63 | Container OOM: output stream emits exit event | Exit event received |
| 64 | Concurrent input from two clients | Both inputs delivered |

### Web UI Playwright E2E Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 65 | Terminal dock "New Terminal" creates session and connects | Terminal panel with blinking cursor |
| 66 | Type `echo hello` + Enter → see `hello` | Output appears in panel |
| 67 | Ctrl+C interrupts running command | `^C` visible, prompt returns |
| 68 | Resize terminal dock → dimensions update | `tput cols`/`tput lines` reflect new size |
| 69 | Close terminal tab → session destroyed | Tab removed, session stopped |
| 70 | Multiple terminal tabs open | Each tab shows independent terminal |
| 71 | Terminal reconnects after network interruption | Indicator goes yellow then green |
| 72 | Sandbox unavailable shows error message | "Workspace containers are not available" |
| 73 | Copy text from terminal (Ctrl+Shift+C) | Text copied to clipboard |
| 74 | Paste text into terminal (Ctrl+Shift+V) | Pasted text appears as input |
| 75 | Navigate away from repo → sessions destroyed | No orphaned sessions |
| 76 | At most 5 terminal tabs | 6th attempt shows limit message |
| 77 | Connection indicator colors correct | Green=connected, Yellow=reconnecting, Red=error |

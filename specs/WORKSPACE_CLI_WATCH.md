# WORKSPACE_CLI_WATCH

Specification for WORKSPACE_CLI_WATCH.

## High-Level User POV

When you're working with Codeplane workspaces — cloud-backed development environments tied to your repositories — knowing what your workspace is doing at any moment is essential. The `workspace watch` command gives you a live, continuously-updating window into a workspace's lifecycle, right from your terminal.

Imagine you've just created a workspace, or you've asked one to resume from a suspended state. Rather than polling with `workspace view` over and over, you run `codeplane workspace watch <id>` and immediately see the current status followed by every state transition as it happens: pending → starting → running. If something goes wrong, you see it the moment the workspace enters a failed or error state, and the command exits so you can act on it.

The watch command is especially valuable during long-running operations like workspace provisioning, snapshot restoration, or suspend/resume cycles. It replaces the anxiety of "is it ready yet?" with a clear, human-readable stream of events. You can pipe the structured JSON output for scripting, or just read the human-friendly stderr messages as they arrive.

For agent-assisted workflows — where a workspace might be created automatically to work on an issue — the watch command provides the observability bridge that lets a human or automation system track exactly what stage the workspace is in without needing to open a browser or repeatedly call the API.

The command connects to a real-time event stream from the server, so updates arrive within seconds of the actual state change. It handles network interruptions gracefully, and automatically exits when the workspace reaches a terminal state (deleted or error), returning the full event log as structured output.

## Acceptance Criteria

### Definition of Done

- [ ] The `codeplane workspace watch <id>` command connects to the workspace SSE stream and displays real-time status updates until a terminal state or stream end is reached.
- [ ] The command is documented in CLI help, shell completions, and user-facing documentation.
- [ ] All integration and E2E tests pass, covering happy paths, edge cases, and failure modes.

### Functional Constraints

- [ ] **Required argument**: The command requires exactly one positional argument: the workspace ID (UUID format).
- [ ] **Repository context**: The command accepts an optional `--repo OWNER/REPO` flag; if omitted, it resolves the repository from the current working directory's jj/git remote context.
- [ ] **Initial status display**: On connection, the command first fetches the current workspace state via `GET /api/repos/:owner/:repo/workspaces/:id` and prints the workspace ID, optional name, and current status to stderr.
- [ ] **SSE connection**: The command connects to `GET /api/repos/:owner/:repo/workspaces/:id/stream` using the user's auth token with `Accept: text/event-stream`.
- [ ] **Event parsing**: The command correctly parses the SSE wire format including `event:`, `id:`, `data:` fields, blank-line event delimiters, and `:` comment lines (keep-alive).
- [ ] **Human-readable output**: Status events are printed to stderr in the format `Status: <status>`. Action events are printed as `Event: <action> — <message>`. Raw data events without `status` or `action` fields are printed to stdout.
- [ ] **Terminal state exit**: The command exits automatically when the workspace status becomes `deleted`, `error`, `stopped`, or `failed`.
- [ ] **Stream end exit**: If the server closes the SSE stream, the command exits gracefully.
- [ ] **Structured output**: On exit, the command returns a JSON object containing the initial workspace metadata and a chronological array of all received events, supporting `--json` output filtering.
- [ ] **Authentication required**: The command fails with a clear error if no auth token is available.
- [ ] **Non-existent workspace**: The command fails with a clear error if the workspace ID does not exist (404 from initial fetch).
- [ ] **Invalid UUID**: The command fails with a clear error if the provided ID is not a valid UUID string.

### Edge Cases

- [ ] **Already terminal workspace**: If the workspace is already in a terminal state at initial fetch time, the command should still connect to the stream, receive the initial event, and exit immediately.
- [ ] **Empty event data**: If an SSE event has an empty or unparseable `data:` field, the command logs the raw data to stdout and continues without crashing.
- [ ] **Malformed JSON in event**: If the `data:` field contains invalid JSON, the command treats the payload as a raw string, logs it, and continues.
- [ ] **Concurrent watch sessions**: Multiple `watch` commands on the same workspace ID must work independently without interference.
- [ ] **Keep-alive handling**: SSE comment lines (`:keep-alive`) must be silently ignored and not produce output.
- [ ] **Multi-line SSE data**: If an SSE event uses multiple `data:` lines, they must be concatenated with newlines per the SSE specification before parsing.
- [ ] **No response body**: If the server returns a 200 but the response has no readable body, the command throws a clear error.
- [ ] **Permission denied**: If the user does not have access to the workspace's repository, the command fails with an appropriate permission error.
- [ ] **Network interruption**: If the SSE stream drops mid-connection, the command exits with the events collected so far and a non-zero exit code.

### Boundary Constraints

- [ ] **Workspace ID format**: Must be a valid UUID (8-4-4-4-12 hex format). Maximum length: 36 characters. Only lowercase hex digits and hyphens are accepted.
- [ ] **Repository reference format**: `--repo` must match the `OWNER/REPO` pattern. Owner: 1–39 characters, alphanumeric plus hyphens, no leading/trailing hyphens. Repo: 1–100 characters, alphanumeric plus hyphens, underscores, dots.
- [ ] **Event accumulation**: The command accumulates all events in memory. For extremely long-lived watch sessions (hours), the event array grows unbounded. This is acceptable given the expected use pattern (minutes, not hours).
- [ ] **Status values**: The command must handle all known workspace status values: `pending`, `starting`, `running`, `suspended`, `stopped`, `failed`. Unknown status values must be displayed without error.

## Design

### CLI Command

**Command**: `codeplane workspace watch <id>`

**Synopsis**:
```
codeplane workspace watch <workspace-id> [--repo OWNER/REPO]
```

**Arguments**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string (UUID) | Yes | The workspace ID to watch |

**Options**:
| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--repo` | string | No | Auto-detected from cwd | Repository in `OWNER/REPO` format |

**Output Streams**:
- **stderr**: Human-readable status messages for interactive use. Format:
  ```
  Watching workspace abc123-... (my-workspace) (status: pending)...
  Status: starting
  Status: running
  Event: workspace provisioned — VM ready
  ```
- **stdout**: Raw event data payloads that lack `status` or `action` fields. Also used for structured JSON output with `--json`.

**Exit Behavior**:
| Condition | Exit Code | Behavior |
|-----------|-----------|----------|
| Terminal status received (`deleted`, `error`, `stopped`, `failed`) | 0 | Returns workspace metadata + events |
| Server closes stream cleanly | 0 | Returns workspace metadata + events collected |
| Auth token missing | 1 | Prints error to stderr |
| Workspace not found (404) | 1 | Prints error to stderr |
| Network/connection failure | 1 | Returns partial events if any |
| Server error (5xx) | 1 | Prints error to stderr |

**Return Shape** (JSON):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "name": "my-workspace",
  "persistence": "persistent",
  "created_at": "2026-03-22T10:00:00Z",
  "updated_at": "2026-03-22T10:02:00Z",
  "events": [
    {
      "type": "workspace.status",
      "data": { "workspace_id": "550e8400-...", "status": "pending" },
      "id": "1"
    },
    {
      "type": "workspace.status",
      "data": { "workspace_id": "550e8400-...", "status": "starting" }
    },
    {
      "type": "workspace.status",
      "data": { "workspace_id": "550e8400-...", "status": "running" }
    }
  ]
}
```

### API Shape

The watch command consumes two existing API endpoints:

**1. Initial workspace fetch**:
```
GET /api/repos/:owner/:repo/workspaces/:id
Authorization: token <PAT>
```
Response: `200 OK` with workspace JSON, or `404 Not Found`.

**2. SSE status stream**:
```
GET /api/repos/:owner/:repo/workspaces/:id/stream
Authorization: token <PAT>
Accept: text/event-stream
```
Response: `200 OK` with `Content-Type: text/event-stream`.

SSE event format:
```
id: 1
event: workspace.status
data: {"workspace_id":"...","status":"running"}

: keep-alive

```

The stream emits:
- An initial event with the current workspace status on connection.
- Live events as workspace status changes via PostgreSQL NOTIFY.
- Keep-alive comments (`: keep-alive`) every 15 seconds.

### SDK Shape

The watch command uses the existing SDK/service infrastructure:

- **`WorkspaceService.getWorkspace(id, repoID, userID)`**: Fetches workspace metadata with authorization check.
- **`SSEManager.subscribe(channel, options)`**: Subscribes to PostgreSQL NOTIFY channel `workspace_status_{uuid_no_dashes}` and returns a `ReadableStream<string>`.
- **`sseStreamWithInitial(initialEvents, liveStream)`**: Composes initial status event with the live stream.
- **`sseResponse(stream)`**: Wraps the composed stream in a proper SSE HTTP response.

No new SDK methods are required for this feature.

### TUI UI

The TUI does not require a dedicated "watch" screen. The existing workspace detail screen should display live status updates using the same SSE stream. The TUI workspace screens already have planned SSE adapter integration (`useWorkspaceStatusStream` hook) that mirrors the watch functionality in a UI context.

### Documentation

The following documentation should be written for end users:

1. **CLI Reference Entry** (`workspace watch`):
   - Command synopsis with all arguments and options
   - Description of real-time streaming behavior
   - Examples: basic watch, watch with `--repo`, watch with `--json` output, piping to `jq`
   - Explanation of exit conditions
   - Note about authentication requirements

2. **Workspace Guide Section** ("Monitoring workspace status"):
   - When to use `watch` vs `view`
   - Integration with workspace lifecycle: create → watch → ssh
   - Scripting patterns: `codeplane workspace create | jq -r .id | xargs codeplane workspace watch`
   - Using watch in CI/CD to wait for workspace readiness

3. **CLI Help Text** (built-in):
   - One-line description: "Watch a workspace for real-time status updates"
   - Argument description: "Workspace ID"
   - Option descriptions for `--repo`

## Permissions & Security

### Authorization Roles

| Role | Can use `workspace watch`? | Notes |
|------|---------------------------|-------|
| **Owner** | Yes | Full access to all workspaces in owned repositories |
| **Admin** | Yes | Full access to all workspaces in administered repositories |
| **Member** (Write) | Yes | Can watch their own workspaces in the repository |
| **Member** (Read-only) | No | Cannot access workspace resources |
| **Anonymous** | No | Authentication is required |

The authorization check is performed at two points:
1. The initial `GET /workspaces/:id` fetch validates the user has access to the workspace.
2. The `GET /workspaces/:id/stream` endpoint validates the same access before subscribing to the channel.

### Rate Limiting

- **Initial workspace fetch**: Subject to standard API rate limiting (shared with all `GET` workspace endpoints).
- **SSE stream connection**: Limited to **5 concurrent SSE connections per user** across all workspace streams. This prevents a single user from exhausting server-side PostgreSQL LISTEN slots.
- **Reconnection backoff**: If a client rapidly reconnects (>10 connections in 60 seconds), subsequent connections should receive `429 Too Many Requests`.

### Data Privacy

- The SSE stream only emits workspace status fields (`workspace_id`, `status`). It does not expose SSH credentials, access tokens, VM identifiers, or other sensitive infrastructure details.
- The initial workspace fetch may include `freestyle_vm_id` and `ssh_host` in the response — these are acceptable for authenticated users with workspace access but should not be logged at INFO level on the server.
- The auth token used for SSE connections is transmitted in the `Authorization` header, not as a query parameter, to avoid token leakage in server access logs or proxy logs.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceWatchStarted` | User initiates `workspace watch` | `workspace_id`, `repo_owner`, `repo_name`, `initial_status`, `client` ("cli") |
| `WorkspaceWatchCompleted` | Watch exits (terminal state or stream end) | `workspace_id`, `repo_owner`, `repo_name`, `final_status`, `exit_reason` ("terminal_state" | "stream_ended" | "error"), `duration_seconds`, `event_count`, `client` ("cli") |
| `WorkspaceWatchError` | Watch fails (auth, 404, network) | `workspace_id`, `repo_owner`, `repo_name`, `error_type`, `http_status`, `client` ("cli") |

### Funnel Metrics

| Metric | Definition | Success Target |
|--------|-----------|----------------|
| **Watch adoption rate** | % of workspace create commands followed by a watch command within 60 seconds | > 20% indicates discoverability |
| **Watch success rate** | % of watch sessions that complete without error | > 95% |
| **Watch-to-SSH conversion** | % of watch sessions where the user subsequently runs `workspace ssh` | > 40% (indicates watch is used for readiness waiting) |
| **Average watch duration** | Median time spent in a watch session | 30–120 seconds (healthy; >5 minutes suggests provisioning is too slow) |
| **Terminal state distribution** | Breakdown of final statuses when watch exits | `running` should be >80% (most watches are waiting for readiness) |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| SSE stream subscription created | INFO | `workspace_id`, `channel`, `user_id`, `repo_id` | Client connects to stream endpoint |
| SSE stream subscription closed | INFO | `workspace_id`, `channel`, `user_id`, `duration_ms`, `events_sent` | Client disconnects or stream ends |
| Workspace status notification broadcast | DEBUG | `workspace_id`, `channel`, `new_status`, `subscriber_count` | PostgreSQL NOTIFY received and distributed |
| SSE keep-alive sent | TRACE | `channel`, `subscriber_count` | Every 15-second keep-alive cycle |
| Stream connection rejected (rate limit) | WARN | `user_id`, `concurrent_streams`, `limit` | Rate limit exceeded |
| Stream connection error | ERROR | `workspace_id`, `channel`, `error`, `user_id` | Internal error during stream setup |
| PostgreSQL LISTEN failure | ERROR | `channel`, `error` | Database connection or LISTEN failure |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_watch_connections_total` | Counter | `repo`, `status` (success/error) | Total SSE connections attempted |
| `codeplane_workspace_watch_active_connections` | Gauge | `repo` | Currently active SSE watch connections |
| `codeplane_workspace_watch_duration_seconds` | Histogram | `repo`, `exit_reason` | Duration of watch sessions, buckets: 5, 15, 30, 60, 120, 300, 600 |
| `codeplane_workspace_watch_events_total` | Counter | `repo`, `event_type` | Total SSE events emitted across all watch connections |
| `codeplane_sse_keepalive_sent_total` | Counter | `channel_prefix` | Keep-alive comments sent |
| `codeplane_sse_pg_notify_received_total` | Counter | `channel_prefix` | PostgreSQL NOTIFY messages received by SSE manager |
| `codeplane_sse_pg_listen_errors_total` | Counter | `channel_prefix` | PostgreSQL LISTEN failures |

### Alerts

#### 1. High SSE Connection Count
- **Condition**: `codeplane_workspace_watch_active_connections > 500` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workspace_watch_active_connections` by repo label to identify if a single repo is responsible.
  2. Check for runaway automation scripts creating many watch sessions: query `codeplane_workspace_watch_connections_total` rate by user.
  3. If a single user/API token has excessive connections, consider temporary token revocation.
  4. Check PostgreSQL connection pool utilization — each LISTEN channel uses a shared connection, but excessive channels can degrade PG performance.
  5. If organic growth, consider increasing the per-user concurrent SSE limit or implementing connection multiplexing.

#### 2. SSE PostgreSQL LISTEN Failures
- **Condition**: `rate(codeplane_sse_pg_listen_errors_total[5m]) > 0`
- **Severity**: Critical
- **Runbook**:
  1. Check PostgreSQL connectivity: `pg_isready` and connection pool status.
  2. Check if the database is under high load: query `pg_stat_activity` for blocked queries.
  3. Check if max_connections is exhausted in PostgreSQL.
  4. Review server logs for the specific error message on the LISTEN failure.
  5. If PostgreSQL is healthy but LISTEN fails, check if the channel name is malformed (dash-stripping bug).
  6. Restart the SSE manager if the LISTEN connection is in a bad state: this requires a server restart in the current architecture.

#### 3. Watch Session Duration Anomaly
- **Condition**: `histogram_quantile(0.95, codeplane_workspace_watch_duration_seconds) > 600` for 15 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check if workspace provisioning is slow: review workspace provision duration metrics or container runtime health.
  2. Check if workspaces are stuck in `pending` or `starting` state: query the database for workspaces in non-terminal states older than 5 minutes.
  3. Check if the stale-pending cleanup job is running (should mark stuck workspaces as `failed` after 5 minutes).
  4. If provisioning is healthy, users may be leaving watch sessions open intentionally — this is not necessarily a problem but consumes server resources.

#### 4. High Watch Error Rate
- **Condition**: `rate(codeplane_workspace_watch_connections_total{status="error"}[5m]) / rate(codeplane_workspace_watch_connections_total[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check the most common error types from server logs (auth failures, 404s, rate limiting).
  2. If auth failures dominate, check if a token rotation or OAuth change broke existing CLI installations.
  3. If 404s dominate, check if workspace cleanup is running too aggressively, deleting workspaces before users can watch them.
  4. If network errors dominate, check load balancer and reverse proxy health — SSE connections require long-lived HTTP connections that some proxies may terminate.

### Error Cases and Failure Modes

| Error | HTTP Status | CLI Behavior | Likely Cause |
|-------|-------------|--------------|---------------|
| No auth token | N/A | Exit 1, print auth instructions | User not logged in |
| Invalid workspace ID format | 400 | Exit 1, print validation error | Typo in UUID |
| Workspace not found | 404 | Exit 1, print "workspace not found" | Wrong ID or workspace deleted |
| Permission denied | 403 | Exit 1, print "permission denied" | User lacks repo access |
| Rate limited | 429 | Exit 1, print "rate limited, try again later" | Too many concurrent streams |
| Server error | 500/502/503 | Exit 1, print server error | Server-side failure |
| SSE stream drops mid-session | N/A | Exit 1, return partial events | Network interruption or server restart |
| SSE body missing | N/A | Exit 1, print "no response body" | Proxy stripping response body |
| Malformed SSE event | N/A | Log raw data, continue | Server bug or payload corruption |

## Verification

### API Integration Tests

| # | Test | Input | Expected |
|---|------|-------|----------|
| A1 | Stream returns initial status event | Valid workspace ID, authed user | 200 with SSE stream; first event contains current workspace status |
| A2 | Stream requires authentication | Valid workspace ID, no auth header | 401 Unauthorized |
| A3 | Stream returns 404 for non-existent workspace | Random UUID, authed user | 404 Not Found |
| A4 | Stream returns 400 for invalid ID format | `"not-a-uuid"`, authed user | 400 Bad Request |
| A5 | Stream includes correct event type | Valid workspace ID | First event has `event: workspace.status` |
| A6 | Stream sends keep-alive comments | Valid workspace, hold connection 20s | At least one `: keep-alive` comment received |
| A7 | Multiple concurrent streams on same workspace | Two authed connections to same stream | Both receive identical events independently |
| A8 | Stream reflects status changes | Change workspace status while streaming | New status event arrives on stream within 5 seconds |
| A9 | Stream respects repository-scoped access | User without repo access, valid workspace ID | 403 Forbidden |
| A10 | Initial event contains workspace_id and status | Valid workspace in `running` state | `data` contains `{"workspace_id":"...","status":"running"}` |

### CLI Integration Tests

| # | Test | Command | Expected |
|---|------|---------|----------|
| C1 | Watch displays initial status | `workspace watch <id> --repo owner/repo` | stderr contains `Watching workspace <id>` and `Status:` line |
| C2 | Watch exits on `deleted` status | Watch workspace, then delete it | Command exits with `status === "deleted"` in events |
| C3 | Watch exits on `error`/`failed` status | Watch workspace that transitions to failed | Command exits with terminal status in events |
| C4 | Watch returns structured JSON | `workspace watch <id> --json` | Valid JSON with `id`, `status`, `events` array |
| C5 | Watch fails without auth | `workspace watch <id>` (no auth) | Exit 1 with auth error message |
| C6 | Watch fails for non-existent workspace | `workspace watch 00000000-0000-0000-0000-000000000000` | Exit 1 with "not found" error |
| C7 | Watch with `--repo` flag | `workspace watch <id> --repo owner/repo` | Uses specified repo instead of auto-detection |
| C8 | Watch accumulates events | Watch workspace through pending→starting→running | Events array contains 3+ entries in chronological order |
| C9 | Watch handles stream end gracefully | Server closes SSE connection | Command exits 0 with collected events |
| C10 | Watch stderr shows human-readable output | Watch a workspace through transitions | stderr shows `Status: pending`, `Status: starting`, `Status: running` lines |
| C11 | Watch ignores keep-alive comments | Watch for >15 seconds | No `: keep-alive` text appears in stderr or stdout |
| C12 | Watch handles malformed event data | SSE event with `data: not-json` | Command continues, raw data printed to stdout |

### E2E Tests (Full Stack)

| # | Test | Scenario | Expected |
|---|------|----------|----------|
| E1 | Create-and-watch lifecycle | Create workspace → immediately watch → wait for running | Watch outputs transition events; final status is `running` |
| E2 | Watch during suspend/resume | Watch running workspace → suspend → resume | Events include transition through `suspended` then back to `running` |
| E3 | Watch during delete | Watch running workspace → delete | Watch exits with `deleted` or `stopped` terminal event |
| E4 | Concurrent watch and SSH | Watch workspace while also running `workspace ssh` | Watch shows `running` status; SSH connects successfully; watch continues |
| E5 | Watch workspace restored from snapshot | Create workspace from snapshot → watch | Watch shows provisioning and running transitions |
| E6 | Watch with `--json` piped to jq | `workspace watch <id> --json | jq '.events | length'` | Outputs numeric event count |
| E7 | Watch unauthorized repository | Watch workspace in repo user cannot access | Exit 1 with permission error |
| E8 | Watch already-terminal workspace | Create workspace → delete → watch (after deletion) | Watch receives initial `stopped`/`deleted` event and exits immediately |

### Boundary and Validation Tests

| # | Test | Input | Expected |
|---|------|-------|----------|
| B1 | Maximum valid UUID | `ffffffff-ffff-ffff-ffff-ffffffffffff` | Accepted as valid ID (likely 404, but no validation error) |
| B2 | UUID with uppercase letters | `550E8400-E29B-41D4-A716-446655440000` | Accepted (UUIDs are case-insensitive) or normalized |
| B3 | ID longer than 36 characters | `550e8400-e29b-41d4-a716-446655440000x` | Rejected with validation error |
| B4 | Empty string ID | `workspace watch ""` | Rejected with "workspace ID is required" error |
| B5 | `--repo` with invalid format | `workspace watch <id> --repo "just-owner"` | Rejected with repo format error |
| B6 | `--repo` with empty owner | `workspace watch <id> --repo "/repo"` | Rejected with validation error |
| B7 | `--repo` with owner exceeding 39 chars | `workspace watch <id> --repo "aaaa...40chars.../repo"` | Rejected with validation error |
| B8 | Event array accumulation (100+ events) | Rapidly change workspace status 100 times while watching | All 100+ events captured in output array |
| B9 | Very long event data payload | SSE event with 10KB JSON data field | Parsed correctly without truncation |
| B10 | SSE event with no `data:` field | Event with only `event:` and blank line | Ignored gracefully, no crash |

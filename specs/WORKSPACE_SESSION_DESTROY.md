# WORKSPACE_SESSION_DESTROY

Specification for WORKSPACE_SESSION_DESTROY.

## High-Level User POV

When a developer is finished with a terminal connection into their workspace — or wants to clean up idle or orphaned sessions — they should be able to destroy individual sessions quickly and confidently from any Codeplane surface. Destroying a session ends that specific terminal connection without affecting other active sessions on the same workspace or deleting the workspace itself.

Session destruction is a lightweight cleanup action. A developer who has three terminal tabs open in a workspace can destroy one without disturbing the other two. An agent workflow that spawned a temporary session can clean up after itself by destroying the session when its task is complete. A user reviewing their session list in the TUI or web UI can identify stale sessions and remove them one by one.

The most important lifecycle behavior tied to session destruction is **automatic workspace suspension**. When a user destroys the last active session on a workspace, Codeplane automatically suspends the workspace to conserve compute resources. This means session destruction is not just a cleanup action — it is the primary mechanism by which workspace resources are released. Users who understand this can explicitly destroy their last session to trigger suspension, or simply let idle timeout handle it.

Destroying a session is idempotent and safe. Destroying a session that is already stopped or failed is a no-op that succeeds silently. Destroying a session that does not exist or belongs to another user also succeeds silently to avoid leaking information about other users' sessions. The session record is not deleted from the system — it transitions to "stopped" status and remains visible in session listings for audit and history purposes.

From the CLI, destroying a session is a single command. From the TUI, it is a keypress with a confirmation prompt. From the web UI, it is an action in the session row's dropdown menu. Regardless of surface, the result is the same: the session status transitions to "stopped," an SSE notification is emitted so any connected clients update in real time, and if this was the last active session on the workspace, the workspace suspends.

## Acceptance Criteria

### Definition of Done

- [ ] A workspace session can be destroyed from the API, Web UI, CLI, and TUI
- [ ] The session status transitions to `stopped` in the database (soft delete — the record is not removed)
- [ ] An SSE notification is published on the `workspace_status_{sessionId}` channel (UUID without dashes) with `{"status": "stopped"}`
- [ ] If the destroyed session was the last active session (pending/starting/running) on its parent workspace, the workspace is automatically suspended
- [ ] If other active sessions remain on the workspace, the workspace continues running unaffected
- [ ] The destroyed session remains visible in session list responses with `status: "stopped"`
- [ ] The destroy operation is idempotent: destroying an already-stopped or already-failed session returns success without error
- [ ] The destroy operation returns 204 No Content with no response body on success
- [ ] All API, CLI, TUI, and Web UI flows are covered by integration and E2E tests

### Authorization

- [ ] Only the session owner (matching `user_id`) can destroy their own session
- [ ] Repository administrators can destroy any session in their repository
- [ ] Organization owners can destroy any session in repositories they own
- [ ] Anonymous or unauthenticated users receive 401
- [ ] Users without access to the repository receive 403
- [ ] Users attempting to destroy another user's session (without admin role) receive a silent 204 no-op (session not found for that user scope — no information leakage)

### Input Validation

- [ ] Session ID must be a non-empty string; an empty or whitespace-only value returns 400 with `"session id is required"`
- [ ] Session ID should be a valid UUID format (36 characters, hyphenated); malformed UUIDs result in a 204 no-op (not found in DB)
- [ ] No request body is required or expected
- [ ] Any request body content is ignored

### Edge Cases

- [ ] Destroying a session that does not exist returns 204 (idempotent no-op)
- [ ] Destroying a session that is already `stopped` returns 204 without re-triggering workspace suspension logic
- [ ] Destroying a session that is already `failed` returns 204 without modifying its status
- [ ] Destroying a session in `pending` status succeeds and transitions it to `stopped`
- [ ] Destroying a session in `starting` status succeeds and transitions it to `stopped`
- [ ] Destroying a session while it is actively connected via SSH succeeds — the session record is marked stopped; the SSH connection may terminate independently
- [ ] Destroying the last active session triggers workspace suspension; if suspension fails, session destruction still succeeds (best-effort suspension)
- [ ] Concurrent destroy requests for the same session both return 204 without error — only the first performs the actual status transition
- [ ] Destroying a session that belongs to a workspace in `suspended` or `stopped` state still succeeds (status update is still applied if session is not already stopped/failed)
- [ ] SSE clients listening to the session stream receive a `stopped` event before the stream ends
- [ ] If the SSE notification fails to publish, the destroy operation still succeeds (notification is best-effort)
- [ ] Destroying a session does not affect snapshots created from the parent workspace
- [ ] If the parent workspace has already been deleted, session destruction still succeeds

### Boundary Constraints

- [ ] Session ID: UUID v4 format, exactly 36 characters including hyphens (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- [ ] Owner path segment: 1–39 characters, alphanumeric plus hyphens, must match existing user/org
- [ ] Repo path segment: 1–100 characters, alphanumeric plus hyphens/underscores/dots, must match existing repository
- [ ] No request body size constraint (body is ignored), but standard server-wide request size limits apply

### Confirmation UX

- [ ] Web UI: clicking "Destroy" in the session actions dropdown opens a confirmation dialog before calling the API
- [ ] TUI session list: `d` keypress on focused session opens inline confirmation overlay; `y` confirms, `n`/`Esc` cancels
- [ ] CLI: no interactive confirmation (scriptable by design); destruction is immediate upon command execution
- [ ] All confirmation surfaces display the session ID being destroyed

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy`

**Method:** POST (not DELETE — uses an action verb endpoint for consistency with existing workspace session patterns and to avoid CSRF risks with DELETE in certain browser configurations)

**Path Parameters:**

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `owner`   | string | Yes      | Repository owner username or org name    |
| `repo`    | string | Yes      | Repository name                          |
| `id`      | string | Yes      | Workspace session UUID                   |

**Request Body:** None. Any body content is ignored.

**Response Codes:**

| Code | Condition                                                          |
|------|--------------------------------------------------------------------|
| 204  | Session destroyed successfully (no response body)                 |
| 204  | Session not found for this user/repo scope (idempotent no-op)     |
| 204  | Session already in stopped or failed state (idempotent no-op)     |
| 400  | Session ID is missing or empty                                     |
| 401  | Unauthenticated request                                            |
| 403  | User lacks permission to access this repository                   |
| 429  | Rate limit exceeded                                                |
| 500  | Unexpected server error                                            |

**Response Body:** None (HTTP 204 No Content).

**Response Headers:** Standard Codeplane response headers (request ID, CORS).

**Side Effects:**

1. Session status is updated to `stopped` in the database (unless already `stopped` or `failed`).
2. An SSE event is published on channel `workspace_status_{uuid_no_dashes}` with payload `{"status": "stopped"}`.
3. If no other active sessions (status in `pending`, `starting`, `running`) remain for the parent workspace, the workspace is suspended via `doSuspendWorkspace()` (best-effort — failures do not propagate).

**Related Endpoints:**
- `POST /api/repos/:owner/:repo/workspace/sessions` — Create session
- `GET /api/repos/:owner/:repo/workspace/sessions` — List sessions
- `GET /api/repos/:owner/:repo/workspace/sessions/:id` — Get session details
- `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh` — Get SSH connection info
- `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream` — SSE status stream

### SDK Shape

```typescript
// WorkspaceService
async destroySession(
  sessionID: string,
  repositoryID: number,
  userID: number
): Promise<void>
```

**Behavior:**

1. Fetches the session scoped to `(sessionID, repositoryID, userID)` via `dbGetWorkspaceSessionForUserRepo()`.
2. If not found, returns silently (no error — idempotent no-op).
3. If session status is not `stopped` and not `failed`, updates status to `stopped` via `dbUpdateWorkspaceSessionStatus()`.
4. Publishes SSE notification with `stopped` status via `notifySession()`.
5. Counts remaining active sessions for the parent workspace via `dbCountActiveSessionsForWorkspace()`.
6. If active session count is 0:
   - Fetches the parent workspace via `dbGetWorkspaceForUserRepo()`.
   - If workspace found, calls `doSuspendWorkspace()` wrapped in a try/catch (best-effort — suspension failure does not propagate).

### UI-Core Hook Shape

```typescript
function useDestroyWorkspaceSession(
  owner: string,
  repo: string,
  callbacks?: DestroyWorkspaceSessionCallbacks
): {
  mutate: (sessionId: string) => Promise<void>;
  isLoading: boolean;
  error: HookError | null;
}
```

**Callback interface:**
```typescript
interface DestroyWorkspaceSessionCallbacks {
  onOptimistic?: (sessionId: string) => void;
  onRevert?: (sessionId: string) => void;
  onError?: (error: HookError, sessionId: string) => void;
  onSettled?: (sessionId: string) => void;
}
```

Client-side behavior:
- Deduplicates concurrent destroy requests for the same session ID (returns existing promise)
- `onOptimistic` fires immediately for optimistic UI updates before the network call completes
- `onRevert` fires if the destroy fails, allowing the UI to revert the optimistic update
- On unmount: aborts in-flight requests via AbortController cleanup
- The hook uses POST method (not DELETE) to match the API endpoint convention

### Web UI Design

**Entry Points:**

1. **Workspace Detail Page — Sessions Tab** (`/:owner/:repo/workspaces/:id`): Each session row has an actions dropdown menu containing a "Destroy Session" option.
2. **Terminal Dock**: Active terminal tabs show a close/destroy action that terminates the session.

**Confirmation Dialog:**

- Type: Modal dialog overlay
- Title: "Destroy Session"
- Body: "Are you sure you want to destroy session **{session_id_truncated}**? The terminal connection will be ended."
- If this is the last active session for the workspace, an additional warning: "This is the last active session on this workspace. Destroying it will automatically suspend the workspace."
- Primary action button: "Destroy Session" (destructive/red styling)
- Secondary action button: "Cancel" (neutral styling)
- Keyboard: `Enter` on the primary button confirms; `Escape` cancels

**Post-Destruction Behavior:**

- Session row status updates to `stopped` with gray status indicator
- If the session list was filtered to show only running sessions, the destroyed session disappears from the filtered view
- A brief success toast: "Session destroyed"
- If workspace was auto-suspended, a follow-up info toast: "Workspace suspended (no active sessions)"
- From the terminal dock: the terminal tab is closed and removed

**Disabled States:**

- While a destroy request is in flight, the "Destroy" button shows a loading spinner and is disabled
- The "Destroy" option is hidden for sessions already in `stopped` or `failed` state

### CLI Command

**Command:** `codeplane workspace session destroy <id>`

**Arguments:**

| Argument | Type   | Required | Description           |
|----------|--------|----------|-----------------------|
| `id`     | string | Yes      | Workspace session UUID |

**Options:**

| Option   | Type   | Required | Default        | Description                          |
|----------|--------|----------|----------------|--------------------------------------|
| `--repo` | string | No       | Auto-detected  | Repository in `OWNER/REPO` format    |

**Output (default):**
```
Session a1b2c3d4-... destroyed.
```

**Output (--json):**
```json
{
  "status": "destroyed",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Exit Codes:**

| Code | Meaning                                    |
|------|--------------------------------------------|
| 0    | Session destroyed (or already gone)        |
| 1    | Error (network, auth, invalid input)       |

**Examples:**
```bash
# Destroy a specific session
codeplane workspace session destroy a1b2c3d4-e5f6-7890-abcd-ef1234567890

# Destroy a session with explicit repo context
codeplane workspace session destroy a1b2c3d4-... --repo alice/my-repo

# Destroy a session with JSON output for scripting
codeplane workspace session destroy a1b2c3d4-... --json
```

### TUI UI

**Workspace Sessions Screen:**

- Keybinding: `d` on focused session row
- Confirmation overlay appears centered over the list:
  ```
  ┌─────────────────────────────────────────┐
  │ Destroy session 'a1b2c3d4'?            │
  │ This will end the terminal connection. │
  │                                         │
  │ [y] Confirm    [n/Esc] Cancel           │
  └─────────────────────────────────────────┘
  ```
- If this is the last active session, the overlay includes: "Workspace will be suspended."
- On `y`: status indicator transitions to gray `●` (stopped); API call fires; error reverts with status bar flash
- On `n` or `Esc`: overlay dismissed, no action
- After destruction, the session remains in the list with `stopped` status (not removed)

**Session Detail View:**

- Keybinding: `D` (uppercase) from a running/pending session detail view
- Same confirmation overlay pattern as list screen
- On successful destruction: session detail view updates status display; user can navigate back with `q`
- Footer action bar updates per state:
  - Running: `S:ssh  D:destroy  q:back`
  - Pending: `D:destroy  q:back`
  - Stopped/Failed: `q:back` (destroy action hidden)

### Editor Integrations

**VS Code:**

- The workspace sessions tree view item should include a "Destroy Session" context menu action on running/pending sessions
- Triggers `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy`
- Shows a VS Code confirmation dialog: "Destroy session {id}?"
- On success: refreshes the workspace sessions tree view
- On failure: shows a VS Code error notification

**Neovim:**

- Command: `:Codeplane workspace session destroy <id>` or via Telescope picker with destroy action
- Confirmation prompt in command line: `Destroy session 'a1b2c3d4'? (y/N)`
- On success: prints confirmation message
- On failure: prints error with `vim.notify` at error level

### Documentation

- **CLI Reference:** Document `codeplane workspace session destroy <id>` with all options, output formats, exit codes, and examples.
- **API Reference:** Document `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with path parameters, response codes, idempotency behavior, and side effects (workspace auto-suspension).
- **User Guide — Workspaces — Session Lifecycle:** Add a "Destroying Sessions" section explaining:
  - How to destroy from each surface (web, CLI, TUI)
  - That session destruction is a soft delete (session record remains in listings with `stopped` status)
  - That destroying the last active session automatically suspends the workspace
  - That destruction is idempotent and safe to retry
  - The difference between session destruction and workspace deletion
- **User Guide — Resource Management:** Explain how session destruction ties into workspace suspension and compute resource reclamation.

## Permissions & Security

### Authorization Matrix

| Role                     | Can Destroy? | Notes                                                 |
|--------------------------|-------------|-------------------------------------------------------|
| Session Owner            | ✅ Yes      | Can always destroy their own sessions                 |
| Repository Admin         | ✅ Yes      | Can destroy any session in the repository             |
| Repository Write Member  | ❌ No       | Cannot destroy other users' sessions                  |
| Repository Read Member   | ❌ No       | Cannot destroy sessions                               |
| Anonymous                | ❌ No       | Receives 401                                          |
| Organization Owner       | ✅ Yes      | Inherits admin over all org repositories              |
| Deploy Key               | ❌ No       | Deploy keys are for git transport, not session mgmt   |

### Rate Limiting

- **Per-user rate limit:** 20 destroy requests per minute per user (matches session create rate limiting)
- **Per-repository rate limit:** 60 destroy requests per minute per repository
- **Burst allowance:** Up to 10 concurrent destroy requests from the same user
- **Exceeded response:** HTTP 429 with `Retry-After` header and `{"message": "rate limit exceeded"}`

### Data Privacy

- Session destruction does NOT remove the database record; it soft-deletes by setting status to `stopped`. The record remains for audit and history purposes.
- No PII is included in SSE notification payloads (only session ID and status).
- Destruction logs must NOT include SSH connection details, access tokens, or environment variables.
- The `user_id` in structured logs is an internal numeric identifier, not PII.
- The session scoping query (`repositoryID + userID`) inherently prevents cross-user destruction; unauthorized attempts see a no-op rather than an error, preventing enumeration attacks.

### Security Considerations

- The destroy endpoint validates that the authenticated user has ownership or admin access before proceeding. The current implementation scopes the DB lookup to `(sessionID, repositoryID, userID)`, which inherently prevents cross-user destruction.
- The endpoint uses POST rather than DELETE to avoid CSRF risks with DELETE methods in certain browser configurations.
- Even when session destruction fails partially (e.g., SSE notification error), the session status is updated to prevent re-access via SSH.
- Workspace suspension on last session destroy is best-effort; the session is always marked stopped regardless of suspension outcome.

## Telemetry & Product Analytics

### Business Events

| Event Name                        | Trigger                                                     | Properties                                                                                                                                           |
|-----------------------------------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `WorkspaceSessionDestroyed`       | Session successfully transitioned to `stopped`              | `session_id`, `workspace_id`, `repository_id`, `user_id`, `session_age_seconds`, `session_status_before`, `was_last_active_session`, `workspace_auto_suspended`, `destruction_surface` (web/cli/tui/editor/idle_cleanup/api), `was_idle_timeout` (boolean) |
| `WorkspaceSessionDestroyNoop`     | Destroy called on already stopped/failed or nonexistent session | `session_id`, `repository_id`, `user_id`, `reason` (already_stopped/already_failed/not_found), `destruction_surface`                                |
| `WorkspaceSessionDestroyFailed`   | Destroy attempt failed with an error                        | `session_id`, `repository_id`, `user_id`, `error_type`, `error_message`, `destruction_surface`                                                      |
| `WorkspaceAutoSuspendedViaSession`| Workspace auto-suspended because last session was destroyed | `workspace_id`, `repository_id`, `user_id`, `session_id` (the last session), `workspace_age_seconds`, `total_sessions_destroyed`                    |
| `WorkspaceAutoSuspendFailed`      | Auto-suspension triggered but failed (best-effort)          | `workspace_id`, `repository_id`, `user_id`, `session_id`, `error_message`                                                                           |

### Funnel Metrics

| Metric                                     | Definition                                                             | Success Target  |
|--------------------------------------------|------------------------------------------------------------------------|-----------------|
| Destroy success rate                       | % of destroy API calls that return 204                                 | > 99.9%         |
| Destroy confirmation rate (UI surfaces)    | % of destroy confirmation dialogs where user confirms                  | > 85%           |
| Mean time to destroy                       | P50/P95/P99 latency of the destroy API call                           | P95 < 2s        |
| Session lifetime before destruction        | Distribution of session age at destruction time                        | Informational   |
| Explicit vs. idle destroy ratio            | Ratio of user-initiated destroys to idle-timeout-triggered destroys   | Informational   |
| Auto-suspend trigger rate                  | % of session destroys that trigger workspace auto-suspension          | Informational   |
| Auto-suspend success rate                  | % of auto-suspension attempts that succeed                            | > 98%           |

### Product Insights

- Track whether users tend to destroy sessions manually or let idle timeout handle cleanup. High manual destroy rates suggest users are actively managing resources; low rates suggest idle timeouts are doing the work.
- Track the ratio of "last session destroy" (triggers auto-suspend) to "one of many session destroy" to understand typical session concurrency patterns.
- Track destruction surface distribution (CLI vs. TUI vs. web vs. idle cleanup) to understand which clients are most used for session lifecycle management.
- Correlate session lifetime with destruction surface — e.g., agent-spawned sessions may be shorter-lived and destroyed programmatically via API, while human sessions may run longer and be destroyed via UI.

### Never Log

- SSH access tokens
- SSH connection details (host, port, connection strings)
- Raw `Authorization` headers or cookie values

## Observability

### Logging Requirements

| Log Event                                 | Level | Structured Context                                                                        |
|-------------------------------------------|-------|-------------------------------------------------------------------------------------------|
| Session destroy request received          | INFO  | `session_id`, `repository_id`, `user_id`, `request_id`                                  |
| Session not found for destruction         | DEBUG | `session_id`, `repository_id`, `user_id` (idempotent no-op)                             |
| Session already stopped/failed            | DEBUG | `session_id`, `previous_status` (idempotent no-op)                                      |
| Session status updated to stopped         | INFO  | `session_id`, `previous_status`, `workspace_id`                                          |
| SSE notification sent (session stopped)   | DEBUG | `session_id`, `channel`                                                                   |
| SSE notification failed                   | WARN  | `session_id`, `channel`, `error_message`                                                  |
| Active session count checked              | DEBUG | `workspace_id`, `active_count`                                                            |
| Workspace auto-suspend triggered          | INFO  | `workspace_id`, `session_id` (last session), `repository_id`, `user_id`                 |
| Workspace auto-suspend succeeded          | INFO  | `workspace_id`, `duration_ms`                                                             |
| Workspace auto-suspend failed             | WARN  | `workspace_id`, `error_message` (best-effort, non-fatal)                                 |
| Destroy request authorization failed      | WARN  | `session_id`, `repository_id`, `user_id`, `reason`                                      |
| Destroy request invalid input             | WARN  | `raw_session_id`, `validation_error`, `request_id`                                       |
| Idle session cleanup invoked              | INFO  | `idle_session_count`                                                                      |
| Idle session cleanup completed            | INFO  | `destroyed_count`, `failed_count`, `duration_ms`                                          |

### Prometheus Metrics

| Metric Name                                              | Type      | Labels                                           | Description                                            |
|----------------------------------------------------------|-----------|--------------------------------------------------|--------------------------------------------------------|
| `codeplane_workspace_session_destroys_total`             | Counter   | `status` (success/noop/error), `trigger` (user/idle_cleanup) | Total session destroy attempts                         |
| `codeplane_workspace_session_destroy_duration_seconds`   | Histogram | `trigger` (user/idle_cleanup)                    | End-to-end destroy latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_workspace_session_active`                     | Gauge     | `repository_id`                                  | Currently active sessions per repository               |
| `codeplane_workspace_auto_suspend_total`                 | Counter   | `result` (success/error)                         | Workspace auto-suspensions triggered by session destroy |
| `codeplane_workspace_auto_suspend_duration_seconds`      | Histogram |                                                  | Time spent suspending workspace after last session destroy |
| `codeplane_workspace_session_destroy_sse_notifications_total` | Counter | `result` (sent/failed)                          | SSE notification delivery outcomes for session destroys |
| `codeplane_workspace_session_lifetime_seconds`           | Histogram | `trigger` (user/idle_cleanup)                    | Session age at destruction time (buckets: 60, 300, 600, 1800, 3600, 7200, 14400, 28800, 86400) |

### Alerts

#### Alert: High Session Destroy Error Rate

- **Condition:** `rate(codeplane_workspace_session_destroys_total{status="error"}[5m]) / rate(codeplane_workspace_session_destroys_total[5m]) > 0.05`
- **Severity:** Warning
- **Summary:** More than 5% of workspace session destroy requests are failing.

**Runbook:**
1. Check server logs filtered by `session_destroy` and `level=ERROR` for the affected time window.
2. Determine if errors are auth-related (401/403), input-related (400s from client bugs), or infrastructure-related (500s).
3. If 500s: check database connectivity with `SELECT 1` health check. Verify the workspace service is properly initialized.
4. Check if errors are isolated to a specific repository or user — may indicate data integrity issues in the `workspace_sessions` table.
5. Review the `dbGetWorkspaceSessionForUserRepo` and `dbUpdateWorkspaceSessionStatus` queries for failures.
6. If errors correlate with a recent deployment, consider rollback.
7. Escalate to platform team if not resolved within 15 minutes.

#### Alert: Workspace Auto-Suspend Failure Spike

- **Condition:** `rate(codeplane_workspace_auto_suspend_total{result="error"}[10m]) > 3`
- **Severity:** Warning
- **Summary:** Multiple workspace auto-suspension failures after last session destroyed.

**Runbook:**
1. Check logs for `workspace_auto_suspend_failed` events to identify error patterns.
2. Verify container runtime (Docker/Freestyle) is healthy and reachable from the server.
3. Check if the container runtime API is rate-limiting or returning transient errors.
4. Verify network connectivity between the Codeplane server and the container runtime.
5. Note that session destruction itself still succeeds even when auto-suspend fails — the risk is orphaned running workspaces consuming resources.
6. Cross-reference `codeplane_workspace_active_count` with workspaces that should be suspended. Manually suspend orphaned workspaces if needed.
7. If the runtime is down, workspaces will remain running but unused. Monitor resource consumption and schedule manual cleanup when runtime recovers.

#### Alert: Session Destroy Latency Degradation

- **Condition:** `histogram_quantile(0.95, rate(codeplane_workspace_session_destroy_duration_seconds_bucket[5m])) > 5`
- **Severity:** Warning
- **Summary:** P95 session destroy latency exceeds 5 seconds.

**Runbook:**
1. Check if latency is dominated by workspace auto-suspension (`codeplane_workspace_auto_suspend_duration_seconds`).
2. If auto-suspend is slow: check container runtime load and resource utilization. Suspension involves VM state snapshots which can be IO-bound.
3. If database updates are slow: check database connection pool saturation and query latency. The destroy operation performs 2-4 DB queries sequentially.
4. Check for lock contention on the `workspace_sessions` table (concurrent destroys for sessions on the same workspace).
5. If latency is transient, monitor. If sustained, consider adding async workspace suspension (fire-and-forget after session status update).

#### Alert: Idle Session Cleanup Backlog

- **Condition:** `codeplane_workspace_session_active > 100` sustained for 30 minutes AND `rate(codeplane_workspace_session_destroys_total{trigger="idle_cleanup"}[30m]) == 0`
- **Severity:** Warning
- **Summary:** Many active sessions exist but idle cleanup is not running.

**Runbook:**
1. Verify the cleanup scheduler is running — check for `idle_session_cleanup_invoked` log events.
2. Check if the cleanup scheduler was properly started during server bootstrap.
3. If the scheduler is running but finding no idle sessions, verify session `last_activity_at` timestamps are being updated correctly by `touchWorkspaceSessionActivity`.
4. Check the `idle_timeout_secs` values on sessions — if set very high, sessions may not be eligible for cleanup.
5. If the scheduler process crashed, restart the server.

### Error Cases and Failure Modes

| Failure Mode                           | Impact                                                    | Mitigation                                                        |
|----------------------------------------|-----------------------------------------------------------|-------------------------------------------------------------------|
| Database unavailable                   | Destroy fails with 500                                    | Standard DB health checks; retry from client                      |
| Session not found in DB                | No impact — returns 204 (idempotent)                      | By design                                                         |
| Session already stopped/failed         | No impact — returns 204, skips status update              | Idempotent design; SSE still published                            |
| SSE notification fails                 | Connected clients don't receive real-time status update   | Non-critical; clients can poll or refresh                         |
| Concurrent destroys on same session    | Both succeed; only first does real work                   | DB query returns record for first caller; second sees stopped     |
| Auto-suspend fails                     | Workspace remains running without active sessions         | Best-effort; workspace idle cleanup catches it later              |
| Cleanup scheduler not running          | Idle sessions accumulate; workspaces stay running         | Alert on active session gauge; restart server                     |
| Network timeout during auto-suspend    | Workspace may or may not be suspended; session is stopped | Background reconciliation catches orphaned workspaces             |
| High concurrent destroy volume         | DB connection pool pressure                               | Rate limiting; connection pool sizing                             |

## Verification

### API Integration Tests

- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with a valid running session returns 204
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with a valid running session updates status to `stopped` in database
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with a valid `pending` session transitions it to `stopped`
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with a valid `starting` session transitions it to `stopped`
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with a session already in `stopped` status returns 204 (idempotent)
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with a session already in `failed` status returns 204 (does not change status to stopped)
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with non-existent session ID returns 204 (idempotent no-op)
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with empty session ID returns 400 with `"session id is required"`
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with whitespace-only session ID returns 400 with `"session id is required"`
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with malformed UUID returns 204 (no-op, not found in DB)
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with session belonging to different user returns 204 (no-op, scoped query finds nothing)
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with session belonging to different repository returns 204 (no-op)
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` without authentication returns 401
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with read-only access returns 403
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` returns no response body (empty body with 204)
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with a maximum-length valid UUID (36 characters) succeeds
- [ ] `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` with a UUID longer than 36 characters is handled gracefully (no match in DB, returns 204)
- [ ] Two concurrent `POST` requests to destroy the same session both return 204 without error
- [ ] After destroying a session, `GET /api/repos/:owner/:repo/workspace/sessions/:id` returns the session with `status: "stopped"`
- [ ] After destroying a session, `GET /api/repos/:owner/:repo/workspace/sessions` list still includes the session with `status: "stopped"`

### Session-Workspace Interaction Tests

- [ ] Destroy the only active session on a workspace → workspace status transitions to `suspended`
- [ ] Destroy one of two active sessions on a workspace → workspace remains `running`
- [ ] Destroy the second of two sessions (after destroying the first) → workspace transitions to `suspended` after the second destroy
- [ ] Create 3 sessions, destroy all 3 → workspace transitions to `suspended` only after the last one is destroyed
- [ ] Destroy a session when workspace auto-suspend fails → session still shows `stopped` status, workspace remains `running`
- [ ] Destroy a session on an already-suspended workspace → session transitions to `stopped`, no redundant suspend attempt
- [ ] Destroy a session, verify `dbCountActiveSessionsForWorkspace` returns the correct decremented count
- [ ] Destroy a session whose parent workspace has been deleted → session transitions to `stopped` without error

### SSE Stream Tests

- [ ] A client connected to `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream` receives a `workspace.session` event with `{"status": "stopped"}` when the session is destroyed
- [ ] The SSE event is received within 2 seconds of the destroy API call completing
- [ ] Multiple SSE clients connected to the same session stream all receive the stopped event
- [ ] SSE notification failure does not cause the destroy API call to fail (best-effort)
- [ ] SSE channel uses session UUID without dashes: `workspace_status_{uuid_no_dashes}`

### Idle Session Cleanup Tests

- [ ] A session idle beyond `idle_timeout_secs` is automatically destroyed by the cleanup scheduler
- [ ] An idle session cleanup correctly transitions the session status to `stopped`
- [ ] An idle session cleanup on the last active session triggers workspace auto-suspension
- [ ] Multiple idle sessions are cleaned up in a single cleanup run
- [ ] A session with recent activity (within `idle_timeout_secs`) is NOT cleaned up
- [ ] A session with `last_activity_at` exactly at the timeout boundary is NOT cleaned up (not yet idle)
- [ ] A session 1 second past the idle timeout IS cleaned up

### CLI E2E Tests

- [ ] `codeplane workspace session destroy <valid-id>` returns exit code 0 and outputs confirmation message
- [ ] `codeplane workspace session destroy <valid-id> --json` returns exit code 0 and outputs `{"status": "destroyed", "id": "<id>"}`
- [ ] `codeplane workspace session destroy <valid-id> --repo owner/repo` uses the specified repo context
- [ ] `codeplane workspace session destroy <nonexistent-id>` returns exit code 0 (API returns 204)
- [ ] `codeplane workspace session destroy` without an ID argument prints usage help and exits with code 1
- [ ] `codeplane workspace session destroy <valid-id>` when unauthenticated prints authentication error and exits with code 1
- [ ] `codeplane workspace session destroy <valid-id>` without repo context (not in a repo directory and no --repo flag) prints error message and exits with code 1
- [ ] `codeplane workspace session destroy <id> --json` outputs valid JSON with `status` and `id` fields

### TUI E2E Tests

- [ ] Pressing `d` on a focused session in the sessions list opens the destroy confirmation overlay
- [ ] The confirmation overlay displays the session ID (truncated to 8 characters)
- [ ] The confirmation overlay displays "This will end the terminal connection."
- [ ] When destroying the last active session, the overlay additionally displays "Workspace will be suspended."
- [ ] Pressing `y` in the confirmation overlay triggers the destroy API call
- [ ] Pressing `n` in the confirmation overlay dismisses it without making an API call
- [ ] Pressing `Esc` in the confirmation overlay dismisses it without making an API call
- [ ] After confirming destruction, the session status indicator changes to gray `●` (stopped)
- [ ] If the destroy API call fails, the session status reverts and the status bar shows an error flash message
- [ ] The `d` key is not available (no overlay) when the focused session is already in `stopped` state
- [ ] The `d` key is not available (no overlay) when the focused session is in `failed` state
- [ ] Pressing `D` on the session detail view opens the destroy confirmation overlay for a running session
- [ ] After confirming destruction from detail view, the status display updates to `stopped`
- [ ] The `D` action is not available on the session detail view when the session is already `stopped`

### Web UI E2E Tests (Playwright)

- [ ] Workspace sessions tab: clicking "Destroy Session" in session actions dropdown opens confirmation modal
- [ ] Confirmation modal displays truncated session ID and warning text
- [ ] When destroying the last active session, confirmation modal shows workspace suspension warning
- [ ] Clicking "Destroy Session" button in modal triggers API call and updates session status to stopped
- [ ] Clicking "Cancel" button in modal dismisses it without API call
- [ ] Pressing `Escape` key dismisses the confirmation modal
- [ ] After destruction, a success toast notification appears with "Session destroyed"
- [ ] If workspace was auto-suspended, an info toast appears with "Workspace suspended (no active sessions)"
- [ ] Destroy button shows loading spinner while API call is in flight
- [ ] Destroy button is disabled while API call is in flight (no double-click)
- [ ] If API call fails, session remains in previous state and error toast is shown
- [ ] The "Destroy Session" action is not visible for sessions in `stopped` or `failed` state
- [ ] Real-time update: destroying a session via direct API call causes the session list to update status to `stopped` without page refresh (SSE)

### Cross-Surface Consistency Tests

- [ ] Destroy session via CLI → verify session shows `stopped` via API GET
- [ ] Destroy session via API → verify session shows `stopped` in TUI session list on refresh
- [ ] Destroy session via Web UI → verify CLI `workspace sessions` shows `stopped` status
- [ ] Destroy last session via CLI → verify workspace shows `suspended` via API GET
- [ ] Create 2 sessions → destroy 1 via API → verify other session is still `running` via API GET
- [ ] Create 2 sessions → destroy both via CLI → verify workspace is `suspended`
- [ ] Destroy session → create new session on same workspace → verify workspace resumes and new session runs

# WORKSPACE_SESSION_CREATE

Specification for WORKSPACE_SESSION_CREATE.

## High-Level User POV

When a developer needs to interact with a Codeplane workspace — whether to run terminal commands, connect via SSH, or kick off an agent-driven coding task — they begin by creating a workspace session. A workspace session is a live, interactive connection to a running sandbox environment that is scoped to a specific repository.

From the user's perspective, creating a session is simple: they tell Codeplane which repository workspace they want to connect to (or let Codeplane pick or create a default one), optionally specify their preferred terminal size, and Codeplane handles everything else. Behind the scenes, the platform ensures the underlying workspace container is running, provisions the session, and makes SSH connection details available so the user can start working immediately.

Sessions are the bridge between a user and their workspace. If a workspace was previously suspended due to inactivity, creating a new session automatically wakes it up. If no workspace exists yet for the repository, Codeplane creates a primary workspace on the fly. The user never needs to think about container orchestration — they just ask for a session and start coding.

Sessions also serve as the unit of activity tracking. Codeplane monitors session activity to decide when to suspend idle workspaces, ensuring resources are released when nobody is actively working. When a user destroys their last session on a workspace, the workspace is automatically suspended to conserve resources.

This feature is available across all Codeplane surfaces: the web UI's terminal dock, the CLI's `workspace create` command, the TUI's workspace screen, and programmatically through the API. Regardless of which client they use, the experience is consistent — create a session, get connection details, start working.

## Acceptance Criteria

### Definition of Done

- [ ] A user with write access to a repository can create a workspace session through any Codeplane client (API, CLI, TUI, Web UI).
- [ ] Creating a session against a repository with no existing workspace automatically provisions a primary workspace.
- [ ] Creating a session against a suspended workspace automatically resumes the workspace before the session becomes active.
- [ ] The created session transitions from `pending` → `running` and the user receives a session ID and status in the response.
- [ ] Real-time status updates are streamed to connected clients via SSE during session creation.
- [ ] SSH connection information is retrievable for the running session.
- [ ] The session is scoped to the authenticated user and the target repository; other users cannot access it.
- [ ] Idle sessions are automatically cleaned up after the configured idle timeout (default: 30 minutes).
- [ ] When all sessions for a workspace are destroyed, the workspace is automatically suspended.
- [ ] All API, CLI, TUI, and Web UI flows are covered by integration and E2E tests.

### Input Constraints

- [ ] `workspace_id` is optional. If provided, it must be a valid UUID (36 characters, hyphenated format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). If empty or omitted, the system creates or reuses a primary workspace.
- [ ] `cols` is optional. Must be a positive integer between 1 and 500 inclusive. Defaults to 80 if omitted or ≤ 0.
- [ ] `rows` is optional. Must be a positive integer between 1 and 500 inclusive. Defaults to 24 if omitted or ≤ 0.
- [ ] The request body must be valid JSON. An unparseable body returns HTTP 400.
- [ ] An empty JSON object `{}` is a valid request (all fields optional) and creates a session with default dimensions on the primary workspace.

### Edge Cases

- [ ] If `workspace_id` refers to a workspace that does not exist, the system returns HTTP 404 with `"workspace not found"`.
- [ ] If `workspace_id` refers to a workspace belonging to a different user or repository, the system returns HTTP 404 (not 403, to avoid information leakage).
- [ ] If the sandbox/container runtime is unavailable, the system returns HTTP 500 with `"sandbox client unavailable"`.
- [ ] If workspace container provisioning fails, the session is marked as `failed` and an SSE notification is published before the error is returned.
- [ ] If `cols` or `rows` are provided as negative numbers, they are treated as ≤ 0 and defaulted to 80/24 respectively.
- [ ] If `cols` or `rows` are provided as non-numeric values (e.g., strings), the JSON parse succeeds but the value is coerced; the API should validate and return 400 for non-numeric types.
- [ ] Concurrent session creation requests for the same user/repo must not create duplicate primary workspaces (race condition guard).
- [ ] If the user has no write access to the repository, the request is rejected with HTTP 403.
- [ ] If the repository does not exist, the request is rejected with HTTP 404.
- [ ] If the request body exceeds 1 MB, the server rejects it.

### Boundary Constraints

- [ ] `workspace_id` maximum length: 36 characters (UUID).
- [ ] `cols` range: 1–500 (values outside this range are clamped or defaulted).
- [ ] `rows` range: 1–500 (values outside this range are clamped or defaulted).
- [ ] Sessions inherit the workspace's idle timeout (default: 1800 seconds / 30 minutes).
- [ ] Sandbox access tokens generated for SSH have a TTL of exactly 5 minutes.
- [ ] Pagination for session listing defaults to 30 per page, maximum 100 per page.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/workspace/sessions`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Repository owner username or organization slug |
| `repo` | string | Yes | Repository name |

**Request Body (JSON):**
```json
{
  "workspace_id": "optional-uuid-string",
  "cols": 120,
  "rows": 40
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `workspace_id` | string (UUID) | No | `""` (auto-create primary) | Target workspace. If empty, finds or creates the user's primary workspace for this repo. |
| `cols` | integer | No | 80 | Terminal width in columns. |
| `rows` | integer | No | 24 | Terminal height in rows. |

**Success Response:** `201 Created`
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "workspace_id": "f0e1d2c3-b4a5-6789-0abc-def123456789",
  "repository_id": 42,
  "user_id": 7,
  "status": "running",
  "cols": 120,
  "rows": 40,
  "last_activity_at": "2026-03-22T14:30:00.000Z",
  "idle_timeout_secs": 1800,
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**
| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid JSON body | `{ "message": "invalid request body" }` |
| 403 | No write access | `{ "message": "forbidden" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 404 | Workspace not found | `{ "message": "workspace not found" }` |
| 429 | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |
| 500 | Sandbox unavailable | `{ "message": "sandbox client unavailable" }` |
| 500 | Container provisioning failed | `{ "message": "<error detail>" }` |

**Related Endpoints:**
- `GET /api/repos/:owner/:repo/workspace/sessions/:id` — Get session details
- `GET /api/repos/:owner/:repo/workspace/sessions` — List sessions (paginated, `X-Total-Count` header)
- `GET /api/repos/:owner/:repo/workspace/sessions/:id/ssh` — Get SSH connection info
- `POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy` — Destroy session (204 No Content)
- `GET /api/repos/:owner/:repo/workspace/sessions/:id/stream` — SSE status stream

### SDK Shape

**Input type:**
```typescript
interface CreateWorkspaceSessionInput {
  repositoryID: number;
  userID: number;
  cols: number;       // Defaults to 80 if ≤ 0
  rows: number;       // Defaults to 24 if ≤ 0
  repoOwner: string;
  repoName: string;
  workspaceID: string; // Empty string triggers primary workspace auto-creation
}
```

**Response type:**
```typescript
interface WorkspaceSessionResponse {
  id: string;
  workspace_id: string;
  repository_id: number;
  user_id: number;
  status: string;       // "pending" | "running" | "stopped" | "failed"
  cols: number;
  rows: number;
  last_activity_at: string;
  idle_timeout_secs: number;
  created_at: string;
  updated_at: string;
}
```

**Service method:** `WorkspaceService.createSession(input: CreateWorkspaceSessionInput): Promise<WorkspaceSessionResponse>`

### UI-Core Hook Shape

```typescript
function useCreateWorkspaceSession(options: {
  owner: string;
  repo: string;
}): {
  createSession: (request: CreateWorkspaceSessionRequest) => Promise<WorkspaceSession>;
  isCreating: boolean;
  error: Error | null;
}

interface CreateWorkspaceSessionRequest {
  workspace_id: string;
  cols?: number;
  rows?: number;
}
```

Client-side validation: `workspace_id` required when selecting a specific workspace; `cols`/`rows` non-negative; double-submit prevention via `isCreating` guard.

### CLI Command

**Command:** `codeplane workspace create`

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--name` | `-n` | string | auto-generated | Workspace name |
| `--repo` | `-R` | string | detected from cwd | Repository slug (`owner/repo`) |
| `--workspace-id` | | string | | Existing workspace ID to attach to |
| `--cols` | | integer | 80 | Terminal columns |
| `--rows` | | integer | 24 | Terminal rows |
| `--json` | | boolean | false | Output as structured JSON |

**Examples:**
```bash
# Create session on default primary workspace
codeplane workspace create -R alice/my-repo

# Create session on specific workspace with custom terminal size
codeplane workspace create -R alice/my-repo --workspace-id abc123 --cols 120 --rows 40

# JSON output for scripting
codeplane workspace create -R alice/my-repo --json
```

### TUI UI

- **Workspace List View:** Displays workspaces with `WorkspaceStatusBadge` — animated braille spinners for transitional states, static indicators for final states (running=green, stopped=gray, error=red).
- **Create Session:** Press `c` or `Enter` on workspace row to create session with optional dimension dialog.
- **Status Streaming:** TUI subscribes to session SSE stream; badge updates in real-time as session transitions `pending` → `running`.
- **Responsive Layout:** 80×24 shows icon-only badges; 120×40+ shows icon + text labels.

### Web UI Design

1. **Terminal Dock:** "New Terminal" creates session against current repo's primary workspace with viewport-matched dimensions. Displays session status and supports switching between active sessions.
2. **Workspace Detail Page (`/:owner/:repo/workspaces`):** Lists workspaces and sessions. "New Session" button with optional dimension form.

### Documentation

- **Workspaces → Getting Started:** What workspace sessions are, relationship to workspaces, automatic lifecycle (auto-create primary, auto-suspend on last destroy).
- **Workspaces → CLI Reference:** `codeplane workspace create` command with all flags, examples, JSON output format.
- **Workspaces → API Reference:** `POST /api/repos/:owner/:repo/workspace/sessions` endpoint with request/response schemas and error codes.
- **Workspaces → SSH Access:** How to retrieve SSH connection info, 5-minute token TTL, `codeplane workspace ssh` flow.
- **Workspaces → Idle Management:** 30-minute default idle timeout, automatic session cleanup, workspace auto-suspend behavior.

## Permissions & Security

### Authorization Roles

| Role | Can Create Session | Notes |
|------|-------------------|-------|
| Repository Owner | ✅ | Full access |
| Repository Admin | ✅ | Full access |
| Organization Member with Write | ✅ | Must have write permission on the repo |
| Repository Collaborator (Write) | ✅ | Explicit collaborator grant |
| Repository Collaborator (Read-Only) | ❌ | Read access is insufficient for session creation |
| Anonymous / Unauthenticated | ❌ | Must be authenticated |
| Deploy Key (Write) | ❌ | Deploy keys are for git transport, not workspace sessions |

### Rate Limiting

- **Session creation:** Maximum 10 session creation requests per user per repository per minute.
- **Global per-user:** Maximum 30 session creation requests per user across all repositories per minute.
- **Concurrent session cap:** A single user may have at most 10 active (non-stopped, non-failed) sessions per repository and 50 active sessions globally.
- **Burst protection:** A single IP address may create at most 60 sessions per hour across all users.

### Data Privacy & PII

- Session records include `user_id` and `repository_id`, which are internal identifiers not exposed to other users.
- SSH access tokens are stored as SHA-256 hashes in the database; the plaintext token is returned exactly once at creation time and never stored.
- SSH connection info (host, port, username, access token) is sensitive and must only be served to the session owner over HTTPS.
- Session SSE streams are user-scoped; a user cannot subscribe to another user's session status stream.
- Workspace sandbox containers run as an isolated Linux user (`root` by default, configurable). Container isolation must prevent cross-workspace filesystem or network access.
- Audit logs should record session creation events but must not include the plaintext access token.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceSessionCreated` | Session successfully transitions to `running` | `session_id`, `workspace_id`, `repository_id`, `user_id`, `cols`, `rows`, `is_new_workspace` (boolean), `client` (api/cli/tui/web), `duration_ms` |
| `WorkspaceSessionCreateFailed` | Session transitions to `failed` | `session_id`, `workspace_id`, `repository_id`, `user_id`, `error_type`, `client`, `duration_ms` |
| `WorkspaceAutoCreated` | Primary workspace auto-provisioned during session creation | `workspace_id`, `repository_id`, `user_id`, `client` |
| `WorkspaceResumedForSession` | Suspended workspace resumed to serve a session | `workspace_id`, `repository_id`, `user_id`, `suspend_duration_seconds` |

### Funnel Metrics & Success Indicators

1. **Session Creation Success Rate:** `WorkspaceSessionCreated / (WorkspaceSessionCreated + WorkspaceSessionCreateFailed)` — Target: ≥ 99%.
2. **Session Creation Latency (p50, p95, p99):** Time from API request to `running` status. Target: p50 < 3s, p95 < 10s, p99 < 30s.
3. **Sessions Per Workspace:** Average sessions created per workspace per day. Indicates workspace reuse.
4. **Auto-Create Ratio:** `WorkspaceAutoCreated / WorkspaceSessionCreated`. How often users rely on implicit primary workspace creation.
5. **Session Idle Timeout Rate:** Percentage of sessions cleaned up by idle timeout vs. explicitly destroyed.
6. **Daily Active Session Users:** Unique users creating at least one workspace session per day.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Session creation request received | `info` | `owner`, `repo`, `user_id`, `workspace_id`, `cols`, `rows` |
| Primary workspace auto-created | `info` | `workspace_id`, `repository_id`, `user_id` |
| Workspace container provisioning started | `info` | `workspace_id`, `vm_id` |
| Workspace container provisioning succeeded | `info` | `workspace_id`, `vm_id`, `duration_ms` |
| Workspace container provisioning failed | `error` | `workspace_id`, `error`, `duration_ms` |
| Session status transition | `info` | `session_id`, `from_status`, `to_status` |
| Session SSE notification published | `debug` | `session_id`, `status`, `channel` |
| Workspace resumed from suspended state | `info` | `workspace_id`, `suspend_duration_seconds` |
| Sandbox client unavailable | `error` | `repository_id`, `user_id` |
| Session creation completed | `info` | `session_id`, `workspace_id`, `status`, `total_duration_ms` |
| Invalid request body | `warn` | `owner`, `repo`, `user_id`, `parse_error` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_session_created_total` | Counter | `status`, `client`, `auto_created_workspace` | Total session creation attempts |
| `codeplane_workspace_session_create_duration_seconds` | Histogram | `status`, `client` | End-to-end creation latency (buckets: 0.1, 0.5, 1, 2, 5, 10, 30, 60) |
| `codeplane_workspace_session_active` | Gauge | `repository_id` | Currently active sessions per repository |
| `codeplane_workspace_container_provision_duration_seconds` | Histogram | `status` | Container start/resume latency (buckets: 0.5, 1, 2, 5, 10, 30, 60, 120) |
| `codeplane_workspace_auto_created_total` | Counter | | Workspaces auto-created during session creation |
| `codeplane_workspace_resumed_for_session_total` | Counter | | Suspended workspaces resumed for session creation |
| `codeplane_workspace_session_create_errors_total` | Counter | `error_type` | Categorized error counter |

### Alerts & Runbooks

#### Alert: `WorkspaceSessionCreateHighErrorRate`
- **Condition:** Error rate > 5% over 5 minutes
- **Severity:** Warning (>5%), Critical (>20%)
- **Runbook:**
  1. Check `error_type` label distribution to identify dominant failure mode.
  2. `sandbox_unavailable`: Verify container sandbox runtime is running and reachable. Restart if necessary.
  3. `provision_failed`: Check container runtime logs for OOM, disk, or quota issues. Inspect provision latency histogram.
  4. `workspace_not_found`: Check for stale workspace IDs in client caches.
  5. `auth_failed`: Check auth middleware logs for token expiration.
  6. Escalate if errors persist after sandbox restart.

#### Alert: `WorkspaceSessionCreateHighLatency`
- **Condition:** p95 latency > 15s for 10 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check container provision duration histogram — slow provisioning is most common cause.
  2. Check sandbox host CPU, memory, disk I/O.
  3. Check for concurrent suspended workspace resume storms.
  4. Check PostgreSQL connection pool and query latency.
  5. Consider scaling sandbox host resources.

#### Alert: `WorkspaceSessionActiveCountHigh`
- **Condition:** Active sessions > 200 for 15 minutes
- **Severity:** Warning
- **Runbook:**
  1. Verify idle session cleanup scheduler is executing.
  2. Check for sessions stuck in `pending` status.
  3. If legitimate load, scale sandbox capacity.

#### Alert: `SandboxClientUnavailable`
- **Condition:** Any `sandbox_unavailable` errors in 5 minutes
- **Severity:** Critical
- **Runbook:**
  1. Container sandbox runtime is unreachable — blocks ALL session creation.
  2. Check sandbox client configuration in service registry.
  3. Verify sandbox process is running.
  4. Check network connectivity between API server and sandbox.
  5. If sandbox intentionally disabled (CE without VMs), ensure workspace UI shows "unavailable".

### Error Cases & Failure Modes

| Error Case | HTTP Status | Recovery |
|------------|-------------|----------|
| Sandbox runtime unavailable | 500 | Restart sandbox process; workspace features degrade gracefully |
| Container provisioning timeout | 500 | Retry; check host resources; scale capacity |
| Container provisioning OOM | 500 | Increase VM memory limits |
| Database connection failure | 500 | Check PG connection pool; restart server |
| Race: duplicate primary workspace | 409 | Retry; `findOrCreatePrimaryWorkspace` handles upsert |
| Session DB insert failure | 500 | Check DB disk space and constraints |
| SSE notification failure | Silent | Non-fatal; clients fall back to polling |
| Workspace in deleted state | 404/409 | User must create new workspace |
| Auth token expired | 401 | User re-authenticates |

## Verification

### API Integration Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 1 | Create session with empty body `{}` | 201, status=running, cols=80, rows=24 |
| 2 | Create session with custom dimensions `{cols:120, rows:40}` | 201, cols=120, rows=40 |
| 3 | Create session with valid `workspace_id` | 201, session linked to specified workspace |
| 4 | Create session auto-creates primary workspace | 201, new workspace + session running |
| 5 | Create session on suspended workspace resumes it | 201, workspace=running, session=running |
| 6 | Create session with nonexistent `workspace_id` | 404, `"workspace not found"` |
| 7 | Create session with malformed JSON body | 400, `"invalid request body"` |
| 8 | Create session with no body | 400, `"invalid request body"` |
| 9 | Create session unauthenticated | 401 |
| 10 | Create session without write access (read-only token) | 403 |
| 11 | Create session on nonexistent repo | 404 |
| 12 | Create session with cols=0 defaults to 80 | 201, cols=80 |
| 13 | Create session with rows=0 defaults to 24 | 201, rows=24 |
| 14 | Create session with negative cols defaults to 80 | 201, cols=80 |
| 15 | Create session with negative rows defaults to 24 | 201, rows=24 |
| 16 | Create session with max valid cols (500) | 201, cols=500 |
| 17 | Create session with max valid rows (500) | 201, rows=500 |
| 18 | Create session with cols exceeding max (501) | 400 or clamped to 500 |
| 19 | Create session with rows exceeding max (501) | 400 or clamped to 500 |
| 20 | Response includes all required fields with correct types | Schema validation passes |
| 21 | Session id is a valid UUID | Matches UUID v4 pattern |
| 22 | Session created_at is ISO 8601 | Valid ISO 8601 timestamp |
| 23 | Multiple sessions on same workspace | Both 201, different session IDs, same workspace_id |
| 24 | Session inherits idle_timeout_secs (1800) | idle_timeout_secs=1800 |
| 25 | SSE stream emits initial status after creation | Receives `workspace.session` event with `running` |
| 26 | Rate limit enforcement (11 rapid requests) | 11th returns 429 |

### CLI E2E Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 27 | `codeplane workspace create -R owner/repo --json` | JSON with id, status=running |
| 28 | `codeplane workspace create --name my-ws --json` | JSON with specified name |
| 29 | `codeplane workspace create --cols 120 --rows 40 --json` | Session with cols=120, rows=40 |
| 30 | `codeplane workspace list` after create | List includes created workspace |
| 31 | `codeplane workspace delete <id> --yes` | Exit 0, subsequent list shows stopped/absent |
| 32 | `codeplane workspace create` without auth | Error, non-zero exit code |
| 33 | `codeplane workspace create -R owner/nonexistent` | Error, non-zero exit code |

### TUI E2E Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 34 | Workspace list renders on navigation | Workspace list displayed |
| 35 | Create session updates status badge | Badge transitions spinner → green dot |
| 36 | Status badge responsive at 80×24 | Icon-only badges |
| 37 | Status badge responsive at 120×40 | Icon + text label badges |
| 38 | SSE status update reflected in badge | Badge updates without user action |
| 39 | Multiple transitional badges synchronized | Spinners animate in sync |

### Web UI (Playwright) E2E Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 40 | Terminal dock "New Terminal" creates session | Session created, terminal connects |
| 41 | Workspace page shows sessions | Sessions listed with status badges |
| 42 | Workspace page "New Session" button | Session created, status=running |
| 43 | Session status updates in real-time | Transitions visible without refresh |
| 44 | Error state on sandbox failure | Error message shown to user |

### Session Lifecycle Integration Tests

| # | Test Name | Expected Result |
|---|-----------|----------------|
| 45 | Full lifecycle: create → ssh → destroy | All ops succeed, final status=stopped |
| 46 | Destroy last session auto-suspends workspace | Workspace becomes suspended |
| 47 | Destroy one of many sessions keeps workspace running | Workspace stays running |
| 48 | SSH info includes valid access token and command | Non-empty access_token and command |
| 49 | SSH token expires after 5 minutes | Token rejected after TTL |
| 50 | Idle session cleanup after timeout | Session auto-marked stopped |
| 51 | Session on deleted workspace fails | 404 error |
| 52 | 5 concurrent creation requests (same user/repo) | All succeed; no duplicate primary workspaces |

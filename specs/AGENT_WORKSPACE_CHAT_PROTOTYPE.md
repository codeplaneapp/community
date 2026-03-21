# AGENT_WORKSPACE_CHAT_PROTOTYPE

Specification for AGENT_WORKSPACE_CHAT_PROTOTYPE.

## High-Level User POV

When a developer opens a workspace for a repository, they should be able to start a conversational agent session that is directly connected to that workspace's sandbox environment. Today, the Agent Dock and Terminal Dock are separate tools — one for talking to an agent, the other for typing commands. The Agent Workspace Chat prototype unifies these two worlds: the agent doesn't just answer questions about the codebase, it executes tools inside the same live workspace container the developer can see and touch.

A developer working on a bug might open a workspace, then start an agent workspace chat from the workspace detail view or the Agent Dock. The agent greets them with awareness of the workspace — it knows the repository, the checked-out change, the jj status, and has direct read/write/bash access inside the sandbox. The developer types "investigate why the auth middleware is timing out under load" and watches the agent read files, run grep commands, execute tests, and report findings — all happening in the same container. Meanwhile, the developer can flip to the Terminal Dock and see the files the agent modified, run the tests themselves, or inspect jj status.

This is different from a regular agent session in a critical way: regular agent sessions are repository-scoped abstractions that may or may not have a workspace behind them. An agent workspace chat is explicitly workspace-bound — the conversation is tied to a running workspace, tools execute against that workspace's filesystem and runtime, and the chat lifecycle is linked to the workspace lifecycle. If the workspace is suspended, the chat pauses. If the workspace is resumed, the chat can continue. If the workspace is deleted, the chat ends.

The prototype is intentionally scoped. It provides a working conversational interface to a workspace-backed agent with tool execution transparency, but it does not attempt multi-agent orchestration, automatic landing request creation from chat, or persistent conversation memory across workspace recreations. These are future extensions. The prototype validates the core user value: "I can talk to an agent that is inside my workspace, watch it work, and take over manually whenever I want."

The feature is available across the web UI (as a workspace-scoped variant of the Agent Dock), the CLI (as `agent ask --sandbox` and `agent workspace chat`), and the TUI (as a workspace-bound agent chat screen). It is gated behind the `AGENT_WORKSPACE_CHAT_PROTOTYPE` feature flag and requires both the `agents` and `workspaces` feature flags to be enabled.

## Acceptance Criteria

### Definition of Done

- [ ] A user can start an agent chat session that is explicitly bound to a specific workspace
- [ ] The agent executes all tools (read, write, edit, bash, find, ls) inside the workspace container via SSH, not locally
- [ ] The chat interface shows tool calls and their results with expand/collapse transparency
- [ ] The user can send messages and receive streamed (or polled) agent responses
- [ ] The workspace status is visible within the chat interface at all times
- [ ] The chat session lifecycle is coupled to the workspace lifecycle (suspend pauses, resume continues, delete ends)
- [ ] The feature is gated behind `AGENT_WORKSPACE_CHAT_PROTOTYPE`, `agents`, and `workspaces` feature flags
- [ ] The feature works in web UI, CLI, and TUI clients
- [ ] All acceptance criteria below are validated by passing integration and e2e tests

### Workspace Binding

- [ ] An agent workspace chat session is created with an explicit `workspace_id` parameter
- [ ] The `workspace_id` must reference a workspace that belongs to the same repository as the agent session
- [ ] The `workspace_id` must reference a workspace owned by the requesting user (or an admin)
- [ ] If the referenced workspace does not exist, creation returns 404 with "Workspace not found"
- [ ] If the referenced workspace is in `stopped` status, creation returns 409 with "Workspace is stopped; resume or create a new workspace"
- [ ] If the referenced workspace is in `pending` or `starting` status, creation succeeds but the chat displays a "Waiting for workspace…" state until the workspace is `running`
- [ ] If the referenced workspace is in `suspended` status, creation returns 409 with "Workspace is suspended; resume the workspace first"
- [ ] Each workspace can have at most 3 concurrent active agent chat sessions; exceeding this returns 429 with "Maximum concurrent agent sessions reached for this workspace"
- [ ] The session metadata includes `workspace_id` in the response payload
- [ ] The session cannot be re-bound to a different workspace after creation

### Chat Lifecycle Coupling

- [ ] When the bound workspace transitions to `suspended`, all active chat sessions for that workspace transition to `paused` status
- [ ] When the bound workspace transitions from `suspended` to `running`, all `paused` chat sessions transition back to `active` status
- [ ] When the bound workspace transitions to `stopped`, all chat sessions transition to `completed` with a system message "Workspace stopped"
- [ ] When the bound workspace is deleted, all chat sessions transition to `completed` with a system message "Workspace deleted"
- [ ] A `paused` session displays "Workspace suspended — resume to continue" in the chat area; the message input is disabled
- [ ] An `active` session with a `running` workspace allows normal message send/receive
- [ ] The transition from `paused` to `active` is seamless — the conversation history is preserved and the user can continue immediately

### Tool Execution

- [ ] All file and shell tools execute inside the workspace container, not on the server or the user's local machine
- [ ] Tool execution uses the workspace's SSH credentials (obtained via the workspace SSH info API)
- [ ] Tool execution timeout is 30 seconds per individual tool call (configurable via `CODEPLANE_AGENT_TOOL_TIMEOUT_MS`)
- [ ] If a tool call times out, the tool result part shows `isError: true` with message "Tool execution timed out after 30 seconds"
- [ ] If the SSH connection to the workspace fails during tool execution, the tool result shows `isError: true` with message "Workspace connection lost"
- [ ] Tool calls are displayed in the chat with the same expand/collapse rendering as the standard Agent Dock
- [ ] The `bash` tool captures stdout, stderr, and exit code; exit code > 0 is marked as `isError: true` in the result
- [ ] The `read` tool supports reading files up to 1 MB from the workspace; files larger than 1 MB are truncated with a "Content truncated" indicator
- [ ] The `write` tool supports writing files up to 1 MB to the workspace
- [ ] The `edit` tool supports exact string replacement within workspace files
- [ ] The `find` tool uses `fd` (preferred) or `find` on the workspace and returns up to 200 results
- [ ] The `ls` tool lists directory contents on the workspace and returns up to 500 entries

### Input Constraints

- [ ] Session title: 1–255 characters; trimmed; whitespace-only rejected; any Unicode characters allowed
- [ ] Message text: 1–4,000 characters after trim; whitespace-only rejected
- [ ] Message parts: 1–100 parts per message
- [ ] Text part content: maximum 100,000 characters
- [ ] Tool content: maximum 1 MB serialized JSON
- [ ] Total message body: maximum 5 MB
- [ ] Workspace ID: valid UUID format; must reference an existing workspace in the same repository

### Edge Cases

- [ ] If the user sends a message while the agent is streaming a response, the send is rejected client-side with "Wait for the agent to finish responding"
- [ ] If the workspace becomes unreachable mid-conversation (network issue, container crash), the chat shows "Workspace unreachable — retrying…" and attempts 3 reconnection attempts at 5-second intervals before transitioning to a "Workspace connection lost" error state
- [ ] If the agent session is created for a workspace that becomes `running` after a brief `starting` phase, the "Waiting for workspace…" indicator transitions to the normal chat interface without message loss
- [ ] If two users attempt to chat with agents on the same workspace (via separate sessions), both sessions function independently
- [ ] If the workspace's idle timeout fires while an agent chat is active, the workspace remains alive as long as the agent session is `active` (agent chat counts as workspace activity)
- [ ] If the user closes the browser tab during an active agent session, the session remains `active` on the server; reopening the workspace chat reconnects to the existing session
- [ ] If the agent attempts to write to a read-only filesystem path inside the workspace, the tool result shows the permission error from the container
- [ ] Creating a workspace chat session for a repository where the user has only read access returns 403
- [ ] Creating a workspace chat session when the `agents` feature flag is disabled returns 404
- [ ] Creating a workspace chat session when the `workspaces` feature flag is disabled returns 404
- [ ] Sending a message with an empty `parts` array returns 400
- [ ] Sending a message with `role` other than "user" from the client returns 400 (only "user" role allowed from external clients)
- [ ] Agent workspace chat sessions are included in the standard agent session list endpoint, distinguished by a non-null `workspace_id` field

## Design

### Web UI Design

#### Workspace Detail Integration

The agent workspace chat is accessible from two entry points in the web UI:

1. **Workspace Detail View**: A new "Agent Chat" tab appears alongside existing workspace tabs. Clicking it opens an inline chat panel scoped to that workspace.
2. **Agent Dock**: When the user creates a new agent session from the Agent Dock while viewing a workspace, the dock offers a "Connect to workspace" option that binds the session to the current workspace.

#### Workspace Chat Panel (Workspace Detail View)

The workspace chat panel is a full-height panel within the workspace detail view:

```
┌──────────────────────────────────────────────┐
│  Workspace: issue-42                         │
│  Status: ● Running     Agent: ● Active       │
├──────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  │
│  │  [Agent Chat] [Terminal] [Files] [Logs]│  │
│  ├────────────────────────────────────────┤  │
│  │                                        │  │
│  │  You:                                  │  │
│  │  Investigate the auth timeout issue    │  │
│  │                                        │  │
│  │  ⠋ Agent:                              │  │
│  │  I'll look at the auth middleware...   │  │
│  │                                        │  │
│  │  🔧 read_file("src/auth.ts")       ▸  │  │
│  │  ✓ Result: 245 lines read          ▸  │  │
│  │                                        │  │
│  │  🔧 bash("grep -n 'timeout'...")   ▸  │  │
│  │  ✓ Result: 3 matches               ▸  │  │
│  │                                        │  │
│  │  The timeout is set to 5000ms in...   │  │
│  │                                        │  │
│  ├────────────────────────────────────────┤  │
│  │  [Type a message...]            Send   │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

#### Workspace Status Bar

A persistent workspace status indicator is shown at the top of the chat panel:

- **Running**: Green dot with "Workspace running" — tools execute normally
- **Starting**: Yellow spinner with "Workspace starting…" — message input disabled, queued
- **Suspended**: Yellow pause icon with "Workspace suspended — resume to continue" — message input disabled
- **Stopped**: Gray stop icon with "Workspace stopped" — replay mode, no input
- **Connection Lost**: Red warning icon with "Connection lost — retrying…" — shows retry countdown

#### Agent Dock Workspace Binding

When the Agent Dock creates a new session while a workspace is available for the current repository:

1. The "New Agent Session" modal gains a "Workspace" dropdown listing available workspaces (running or starting)
2. Selecting a workspace binds the session and shows a workspace status pill in the tab header
3. Workspace-bound tabs show a container icon (📦) prefix in the tab title to distinguish them from repository-only agent sessions

#### Message Rendering

Message rendering follows the same specification as AGENT_DOCK_UI with these additions:

- Tool call blocks show a "📦 workspace" badge to indicate remote execution
- Bash tool results include exit code display: `Exit 0 ✓` or `Exit 1 ✗`
- File read/write results show the workspace-relative path (e.g., `/home/developer/workspace/src/auth.ts`)
- Long-running bash commands (>5s) show an animated "Running…" indicator with elapsed time

#### Paused State

When the workspace transitions to `suspended`:

- The chat area is overlaid with a semi-transparent "Workspace Suspended" banner
- The message input is disabled with placeholder "Resume workspace to continue"
- A "Resume Workspace" button is displayed in the banner, which calls `POST /api/repos/:owner/:repo/workspaces/:id/resume`
- Upon resumption, the overlay fades, the input enables, and the conversation continues

### API Shape

#### Create Workspace-Bound Agent Session

```
POST /api/repos/:owner/:repo/agent/sessions
```

Extended request body:

```json
{
  "title": "Investigate auth timeout",
  "workspace_id": "uuid-of-workspace"
}
```

Response (201):

```json
{
  "id": "session-uuid",
  "title": "Investigate auth timeout",
  "status": "pending",
  "workspace_id": "uuid-of-workspace",
  "workspace_status": "running",
  "repository_id": "repo-uuid",
  "user_id": "user-uuid",
  "message_count": 0,
  "workflow_run_id": null,
  "created_at": "2026-03-22T10:00:00Z",
  "started_at": null,
  "finished_at": null
}
```

The `workspace_id` field is optional. When omitted, the session behaves as a standard repository-scoped agent session (backward-compatible). When provided, the session is workspace-bound with coupled lifecycle and workspace-backed tool execution.

#### Agent Session List (Extended)

The existing `GET /api/repos/:owner/:repo/agent/sessions` response now includes `workspace_id` on each session object (null for non-workspace sessions). Supports filtering:

```
GET /api/repos/:owner/:repo/agent/sessions?workspace_id=uuid
```

#### Workspace Status in Session Stream

The SSE stream for workspace-bound sessions emits additional event types:

```
event: workspace_status
data: {"status": "suspended", "workspace_id": "uuid"}

event: workspace_status
data: {"status": "running", "workspace_id": "uuid"}
```

### CLI Command

#### `agent ask --sandbox`

Existing command — now creates a workspace-bound agent session on the server (not just a local session). The `--sandbox` flag triggers workspace resolution, SSH provisioning, and workspace tool binding.

#### `agent workspace chat`

New command:

```
codeplane agent workspace chat [workspace-id] [--repo OWNER/REPO]
```

- If `workspace-id` is omitted, uses the most recently created running workspace for the repository
- Creates a new agent session bound to the workspace
- Opens an interactive chat in the terminal with streamed responses
- Tool calls and results are displayed inline with collapsible formatting
- Workspace status changes are shown as system messages inline
- `Ctrl+C` ends the local chat view but the session remains active on the server
- `--message "prompt"` for non-interactive single-message mode

#### `agent workspace list`

```
codeplane agent workspace list [--repo OWNER/REPO]
```

Lists agent sessions filtered by workspace binding:

```
ID          WORKSPACE     TITLE                    STATUS     MESSAGES  CREATED
abc123      issue-42      Investigate auth timeout active     12        2m ago
def456      issue-42      Fix failing tests        completed  28        1h ago
```

### TUI UI

#### Workspace Agent Chat Screen

A new screen accessible from the Workspace Detail screen via an "Agent Chat" action:

```
┌─ Agent Chat: issue-42 ──────────────── ● Running ┐
│                                                    │
│  You (2m ago)                                      │
│  Investigate the auth timeout issue                │
│                                                    │
│  Agent (1m ago)                                    │
│  I'll investigate the auth middleware...           │
│                                                    │
│  📦 read_file src/auth.ts                     [▸]  │
│  ✓ 245 lines                                       │
│                                                    │
│  📦 bash grep -n 'timeout' src/auth.ts        [▸]  │
│  ✓ 3 matches                                       │
│                                                    │
│  The timeout is configured on line 42...           │
│                                                    │
├────────────────────────────────────────────────────┤
│ > Type a message...                                │
│                                                    │
│ [Enter] Send  [Esc] Back  [Tab] Expand tools       │
└────────────────────────────────────────────────────┘
```

**TUI-specific behaviors:**

- Status line at top shows workspace name and status with color-coded indicator
- Tool blocks use `[▸]` / `[▾]` expand/collapse toggles navigable with Tab/Shift+Tab
- `Ctrl+T` toggles between agent chat and terminal for the same workspace (if TUI terminal is available)
- Workspace status changes render as inline system messages
- Paused workspace shows `[R] Resume` hotkey

### SDK Shape

The `@codeplane/sdk` agent service adds:

- `createSession` accepts optional `workspace_id` parameter
- `getSession` returns `workspace_id` if set
- `listSessions` supports `workspace_id` filter parameter
- Session status transition logic accounts for workspace lifecycle coupling (pause/resume/stop/delete)
- New `handleWorkspaceStatusChange(workspaceId, newStatus)` method that cascades status to bound sessions

The `@codeplane/ui-core` package adds:

- `useAgentWorkspaceChat(repoSlug, workspaceId)` hook that manages session creation, message send, and workspace status subscription
- `useWorkspaceAgentSessions(repoSlug, workspaceId)` hook for listing workspace-bound sessions

### Documentation

The following end-user documentation should be written:

- **"Agent Workspace Chat" guide**: Explains how to start an agent conversation inside a workspace, what tools the agent has access to, how to monitor tool execution, and how workspace lifecycle affects the conversation.
- **CLI reference update**: Document `agent workspace chat`, `agent workspace list`, and the `--sandbox` flag behavior.
- **Web UI walkthrough**: Screenshot-annotated guide showing the workspace detail "Agent Chat" tab and the Agent Dock workspace binding flow.
- **Workspace lifecycle FAQ**: Explains what happens when a workspace is suspended/resumed/deleted during an active agent chat.

## Permissions & Security

### Authorization

| Role | Create Session | Send Message | View Session | Delete Session |
|------|---------------|-------------|-------------|---------------|
| Owner | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ | ✓ |
| Member (write) | ✓ | ✓ (own sessions) | ✓ | ✓ (own sessions) |
| Member (read) | ✗ | ✗ | ✓ | ✗ |
| Anonymous | ✗ | ✗ | ✗ | ✗ |

- Workspace-bound agent sessions require **write** access to the repository (same as workspace creation)
- The workspace must be owned by the requesting user (or the requesting user must be an admin)
- Cross-user workspace chat is not permitted in the prototype: a user cannot create an agent session bound to another user's workspace
- Admins can view and delete any session for audit purposes

### Rate Limiting

| Action | Limit | Window | Scope |
|--------|-------|--------|-------|
| Create workspace agent session | 10 | 1 minute | Per user |
| Send message | 30 | 1 minute | Per user per session |
| List sessions | 120 | 1 minute | Per user |
| SSE connect/reconnect | 20 | 1 minute | Per user per session |

- Rate limit responses return `429` with `Retry-After` header
- Burst allowance: 3x the per-minute rate within a 5-second window

### Data Privacy

- Agent messages may contain source code, file contents, and command outputs from the workspace
- No message content is logged at INFO level or above; only session IDs and metadata are logged
- Tool call arguments and results are stored in the database as JSON; they follow the same data retention policy as agent messages
- SSH access tokens for workspace tool execution are single-use, 5-minute TTL, and never stored in agent message content
- Workspace credentials used for tool execution are never echoed back in tool result parts
- The agent does not have access to repository secrets or variables — only to the workspace filesystem and runtime

## Telemetry & Product Analytics

### Business Events

| Event | Properties | Trigger |
|-------|-----------|--------|
| `AgentWorkspaceChatSessionCreated` | `sessionId`, `workspaceId`, `repositoryId`, `userId`, `client` (web/cli/tui) | Session created with workspace binding |
| `AgentWorkspaceChatMessageSent` | `sessionId`, `workspaceId`, `userId`, `role`, `partCount`, `textLength`, `client` | User message sent in workspace chat |
| `AgentWorkspaceChatToolExecuted` | `sessionId`, `workspaceId`, `toolName`, `durationMs`, `isError`, `exitCode` (for bash) | Agent executes a tool in the workspace |
| `AgentWorkspaceChatSessionCompleted` | `sessionId`, `workspaceId`, `status`, `messageCount`, `durationSeconds`, `toolCallCount` | Session reaches terminal state |
| `AgentWorkspaceChatSessionPaused` | `sessionId`, `workspaceId`, `reason` (suspended/unreachable) | Session paused due to workspace state |
| `AgentWorkspaceChatSessionResumed` | `sessionId`, `workspaceId`, `pauseDurationSeconds` | Session resumed after workspace resume |
| `AgentWorkspaceChatFallbackToPolling` | `sessionId`, `workspaceId`, `client` | SSE 501 triggered polling fallback |

### Funnel Metrics

1. **Adoption funnel**: Workspace created → Agent chat session started → First message sent → Agent responded → User sent follow-up message
2. **Completion rate**: Sessions that reach `completed` status vs `failed` or `timed_out`
3. **Tool execution success rate**: Successful tool calls / total tool calls per session
4. **Session depth**: Average messages per session (indicates engagement)
5. **Workspace coupling events**: Pause/resume frequency (indicates whether lifecycle coupling helps or hinders)
6. **Cross-surface usage**: Users who start a workspace chat and also use the Terminal Dock in the same session (validates the "two docks" hypothesis)
7. **Time-to-first-response**: Median time from first user message to first agent response token

### Success Indicators

- >40% of workspace users start at least one agent workspace chat session within 7 days of first workspace use
- Average session depth ≥ 4 messages (indicates real conversation, not just test-and-abandon)
- Tool execution success rate ≥ 90% (indicates workspace environment stability)
- <5% of sessions end in `failed` or `timed_out` status

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Session created | INFO | `sessionId`, `workspaceId`, `repositoryId`, `userId` | New workspace-bound session |
| Session status change | INFO | `sessionId`, `workspaceId`, `fromStatus`, `toStatus`, `reason` | Any status transition |
| Message appended | DEBUG | `sessionId`, `messageId`, `role`, `partCount` | Message added to session |
| Tool dispatch | DEBUG | `sessionId`, `toolName`, `workspaceId` | Tool execution started |
| Tool result | DEBUG | `sessionId`, `toolName`, `durationMs`, `isError` | Tool execution completed |
| Tool timeout | WARN | `sessionId`, `toolName`, `workspaceId`, `timeoutMs` | Tool exceeded timeout |
| Workspace SSH failure | WARN | `sessionId`, `workspaceId`, `errorCode`, `errorMessage` | SSH connection to workspace failed |
| Workspace status cascade | INFO | `workspaceId`, `newStatus`, `affectedSessionCount` | Workspace state change cascaded to sessions |
| SSE connection established | DEBUG | `sessionId`, `userId`, `clientIP` | Client connected to SSE stream |
| SSE connection dropped | DEBUG | `sessionId`, `userId`, `reason` | Client SSE connection closed |
| Rate limit exceeded | WARN | `userId`, `endpoint`, `limit`, `window` | Rate limit triggered |
| Session creation rejected | WARN | `userId`, `workspaceId`, `reason` | Session creation failed (max concurrent, permissions, etc.) |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_agent_workspace_sessions_total` | Counter | `status` (created/completed/failed/timed_out), `repository` | Total workspace-bound sessions |
| `codeplane_agent_workspace_sessions_active` | Gauge | `repository` | Currently active workspace sessions |
| `codeplane_agent_workspace_messages_total` | Counter | `role`, `repository` | Messages in workspace sessions |
| `codeplane_agent_workspace_tool_executions_total` | Counter | `tool_name`, `status` (success/error/timeout) | Tool execution count |
| `codeplane_agent_workspace_tool_duration_seconds` | Histogram | `tool_name` | Tool execution duration (buckets: 0.1, 0.5, 1, 2, 5, 10, 30) |
| `codeplane_agent_workspace_session_duration_seconds` | Histogram | `status` | Total session duration (buckets: 60, 300, 600, 1800, 3600) |
| `codeplane_agent_workspace_ssh_errors_total` | Counter | `error_type` (auth/connection/timeout) | SSH failures during tool execution |
| `codeplane_agent_workspace_lifecycle_cascades_total` | Counter | `from_status`, `to_status` | Workspace → session status cascades |
| `codeplane_agent_workspace_sse_connections_active` | Gauge | — | Active SSE connections for workspace sessions |
| `codeplane_agent_workspace_polling_fallbacks_total` | Counter | `client` | Times clients fell back to polling |

### Alerts

#### `AgentWorkspaceToolErrorRateHigh`

**Condition**: `rate(codeplane_agent_workspace_tool_executions_total{status="error"}[5m]) / rate(codeplane_agent_workspace_tool_executions_total[5m]) > 0.2` for 5 minutes.

**Severity**: Warning

**Runbook**:
1. Check `codeplane_agent_workspace_ssh_errors_total` — if SSH errors are spiking, the workspace container runtime may be unhealthy.
2. Check container orchestrator logs for workspace VM failures (Freestyle/container runtime).
3. Verify SSH key provisioning is functional: `GET /api/repos/:owner/:repo/workspaces/:id/ssh` should return valid credentials.
4. Check if tool timeout rate is elevated — may indicate container CPU/memory pressure.
5. If errors are concentrated on a single workspace, inspect that workspace's container logs.
6. If errors are widespread, check the sandbox runtime health endpoint and restart if necessary.

#### `AgentWorkspaceSessionFailureRateHigh`

**Condition**: `rate(codeplane_agent_workspace_sessions_total{status="failed"}[15m]) / rate(codeplane_agent_workspace_sessions_total{status="created"}[15m]) > 0.1` for 10 minutes.

**Severity**: Warning

**Runbook**:
1. Check recent failed session logs for common error patterns.
2. Verify agent dispatch is functioning — check the agent execution service health.
3. Check if workspace creation or SSH provisioning is failing upstream.
4. Check database connection pool — session creation requires DB writes.
5. If the failure is agent-side (not infrastructure), check the LLM provider status page.

#### `AgentWorkspaceSSHErrorSpike`

**Condition**: `rate(codeplane_agent_workspace_ssh_errors_total[5m]) > 5`.

**Severity**: Critical

**Runbook**:
1. Immediately check workspace container runtime health.
2. Verify SSH server is running inside workspace containers: `ssh -o ConnectTimeout=5 <workspace_ssh_host>`.
3. Check if access token generation/validation is broken — tokens have 5-minute TTL.
4. Check network connectivity between the API server and workspace containers.
5. If specific to one host, drain and replace the affected container host.
6. If widespread, escalate to infrastructure on-call and consider temporarily disabling workspace agent chat via feature flag.

#### `AgentWorkspaceSessionsStale`

**Condition**: `codeplane_agent_workspace_sessions_active > 0` AND no messages appended for >1 hour (checked via `listStaleActiveSessions` query).

**Severity**: Warning

**Runbook**:
1. Query stale sessions: check if the workspace is still running.
2. If workspace is running but agent is stuck, inspect agent dispatch logs.
3. If workspace is gone (deleted/stopped) but session is still `active`, the lifecycle cascade failed — manually transition to `completed`.
4. Check the agent timeout mechanism — sessions should time out after the configured threshold.
5. If timeout mechanism is broken, restart the cleanup scheduler.

#### `AgentWorkspaceLifecycleCascadeFailure`

**Condition**: Workspace status change logged but `codeplane_agent_workspace_lifecycle_cascades_total` does not increment within 30 seconds.

**Severity**: Critical

**Runbook**:
1. Check workspace NOTIFY channel — the listener may have disconnected.
2. Verify the cascade handler is registered and receiving events.
3. Check for database transaction deadlocks that might block session status updates.
4. Manually cascade: query sessions with `workspace_id` matching the workspace, update their status.
5. Restart the workspace status listener if it has crashed.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Client Behavior |
|-------|------------|-------|------------------|
| Workspace not found | 404 | Invalid workspace ID | Show "Workspace not found" error |
| Workspace not running | 409 | Workspace suspended/stopped | Show status-specific message with action button |
| Max concurrent sessions | 429 | 3 active sessions on workspace | Show "Close an existing session" message |
| Repository access denied | 403 | User lacks write access | Show "Insufficient permissions" |
| Workspace owned by another user | 403 | Cross-user workspace binding | Show "Cannot access another user's workspace" |
| Feature flag disabled | 404 | `agents` or `workspaces` flag off | Feature not visible in UI |
| Agent dispatch failed | 500 | Agent execution service unavailable | Show "Agent service unavailable — try again" with retry |
| SSH credential expired | 401 (internal) | 5-minute TTL exceeded | Auto-refresh credentials transparently |
| Database connection lost | 500 | DB unavailable | Show "Service temporarily unavailable" |
| Message validation failed | 400 | Invalid role, empty parts, oversized content | Show specific validation error message |

## Verification

### API Integration Tests

1. **Create workspace-bound session**: POST with valid `workspace_id` → 201 with `workspace_id` in response
2. **Create session without workspace_id**: POST without `workspace_id` → 201, backward-compatible, `workspace_id` is null
3. **Create session with invalid workspace_id format**: POST with `workspace_id: "not-a-uuid"` → 400
4. **Create session with nonexistent workspace_id**: POST with valid UUID that doesn't exist → 404
5. **Create session with workspace in wrong repository**: POST with workspace from a different repo → 404
6. **Create session with stopped workspace**: POST with stopped workspace → 409
7. **Create session with suspended workspace**: POST with suspended workspace → 409
8. **Create session with pending workspace**: POST with pending workspace → 201 (session created in pending state)
9. **Create session with starting workspace**: POST with starting workspace → 201
10. **Create session exceeding max concurrent**: Create 3 sessions, attempt 4th → 429
11. **Create session after one completes**: Create 3 sessions, complete 1, create new → 201
12. **Create session with workspace owned by another user**: POST → 403
13. **Create session as admin on another user's workspace**: POST → 201
14. **Create session with read-only access**: POST → 403
15. **Create session with agents flag disabled**: POST → 404
16. **Create session with workspaces flag disabled**: POST → 404
17. **Create session with both title and workspace_id**: POST → 201 with both fields set
18. **Create session with title at maximum length (255 chars)**: POST → 201
19. **Create session with title exceeding maximum (256 chars)**: POST → 400
20. **Create session with empty title and workspace_id**: POST → 201 with auto-generated title
21. **Create session with whitespace-only title**: POST → 400

### Message Send Integration Tests

22. **Send user message in workspace session**: POST message with role "user" → 201
23. **Send message in paused session**: POST message → 409 "Session is paused"
24. **Send message in completed session**: POST message → 409 "Session is completed"
25. **Send message with maximum text length (100,000 chars)**: POST → 201
26. **Send message with text exceeding maximum (100,001 chars)**: POST → 400
27. **Send message with maximum parts (100)**: POST → 201
28. **Send message with parts exceeding maximum (101)**: POST → 400
29. **Send message with empty parts array**: POST → 400
30. **Send message with whitespace-only text**: POST → 400
31. **Send message with total body exceeding 5 MB**: POST → 413
32. **Verify message sequence numbering is monotonic**: Send 5 messages, verify sequences 1–5
33. **Concurrent message sends**: Send 2 messages simultaneously → both succeed with distinct sequence numbers (no collision due to FOR UPDATE lock)

### Workspace Lifecycle Cascade Tests

34. **Workspace suspended → sessions paused**: Suspend workspace, verify all active sessions transition to paused
35. **Workspace resumed → sessions resumed**: Resume workspace, verify paused sessions transition back to active
36. **Workspace stopped → sessions completed**: Stop workspace, verify sessions transition to completed with system message
37. **Workspace deleted → sessions completed**: Delete workspace, verify sessions transition to completed with system message
38. **Cascade with no active sessions**: Suspend workspace with 0 active sessions → no errors
39. **Cascade with mixed session states**: Workspace has active and completed sessions → only active sessions affected
40. **Cascade preserves message history**: Suspend, resume → all messages intact and retrievable

### Session List and Filter Tests

41. **List sessions filtered by workspace_id**: GET with `workspace_id` param → only matching sessions returned
42. **List sessions without filter**: GET → all sessions including workspace-bound ones, each with `workspace_id` field
43. **List sessions with nonexistent workspace_id filter**: GET → empty list (not 404)
44. **Verify workspace_id in session detail**: GET single session → `workspace_id` present and correct
45. **Verify workspace_status in session detail**: GET session → `workspace_status` matches current workspace state

### Streaming and Polling Tests

46. **SSE stream includes workspace_status events**: Connect to SSE → suspend workspace → receive `workspace_status` event
47. **SSE stream fallback to polling**: Mock 501 SSE → verify client polls at 3-second intervals
48. **SSE reconnection after disconnect**: Drop SSE connection → verify client reconnects with exponential backoff
49. **Polling detects workspace status change**: Poll after workspace suspend → session status reflects paused

### Permission Tests

50. **Owner can create workspace session**: 201
51. **Admin can create workspace session on any user's workspace**: 201
52. **Write member can create session on own workspace**: 201
53. **Write member cannot create session on another member's workspace**: 403
54. **Read member cannot create session**: 403
55. **Anonymous cannot create session**: 401
56. **Write member can delete own session**: 204
57. **Write member cannot delete another user's session**: 403
58. **Admin can delete any session**: 204

### Rate Limit Tests

59. **Session creation rate limit**: Create 11 sessions in 1 minute → 11th returns 429
60. **Message send rate limit**: Send 31 messages in 1 minute → 31st returns 429
61. **Rate limit returns Retry-After header**: Verify header present on 429 response
62. **Rate limit resets after window**: Wait for window expiry, verify next request succeeds

### Web UI E2E Tests (Playwright)

63. **Workspace detail → Agent Chat tab visible**: Navigate to workspace detail → tab present when feature flags enabled
64. **Agent Chat tab hidden when agents flag disabled**: Disable agents flag → tab not rendered
65. **Start agent chat from workspace detail**: Click "Agent Chat" tab → chat panel renders with input area
66. **Send message and receive response**: Type message, click Send → message appears, agent response streams in
67. **Tool call rendering**: Agent executes read_file → tool block renders with 📦 badge, expandable
68. **Tool result expand/collapse**: Click tool block → arguments/output expand; click again → collapse
69. **Workspace suspended overlay**: Suspend workspace → chat shows "Workspace Suspended" banner, input disabled
70. **Resume from suspended overlay**: Click "Resume Workspace" → workspace resumes, overlay disappears, input enables
71. **Workspace stopped → replay mode**: Stop workspace → chat transitions to read-only, no input area
72. **Agent Dock workspace binding**: Create new session from Agent Dock with workspace selected → tab shows 📦 icon
73. **Message input character limit**: Type >4000 chars → counter shown, Send disabled
74. **Whitespace-only message rejected**: Type spaces only, press Send → nothing sent, validation message shown
75. **Multiple concurrent sessions**: Open 3 chat sessions on same workspace → all function independently
76. **Session persists across navigation**: Start chat, navigate away, return → chat restored with history
77. **Keyboard shortcut: Ctrl+Shift+A toggles dock**: Press shortcut → dock toggles
78. **Responsive: mobile layout**: Resize to <600px → full-width, tabs collapse to dropdown

### CLI E2E Tests

79. **`agent workspace chat` creates session**: Run command → session created with workspace binding, prompt accepted
80. **`agent workspace chat` without workspace-id uses latest**: Run without ID → resolves most recent running workspace
81. **`agent workspace chat` with invalid workspace-id**: Run → error "Workspace not found"
82. **`agent workspace chat --message` non-interactive**: Send single message, receive response, exit
83. **`agent workspace list` shows workspace-bound sessions**: Run → table output with workspace column populated
84. **`agent workspace list` filters by workspace**: Run with `--workspace-id` → filtered results
85. **`agent ask --sandbox` creates workspace session**: Run → workspace resolved, session created, tools execute in workspace
86. **`agent ask --sandbox` workspace SSH failure**: Simulate SSH failure → error displayed, session transitions to failed
87. **Ctrl+C in interactive chat**: Press Ctrl+C → local session ends, server session remains active

### TUI E2E Tests

88. **Workspace Agent Chat screen accessible**: Navigate to workspace detail → "Agent Chat" action available
89. **Send message in TUI chat**: Type message, press Enter → message sent, response rendered
90. **Tool block expand/collapse**: Tab to tool block → press Enter → expanded; again → collapsed
91. **Workspace suspended indicator**: Suspend workspace → status line shows suspended, input disabled, [R] hotkey shown
92. **Resume via [R] hotkey**: Press R → workspace resumes, chat continues
93. **Workspace stopped transitions to read-only**: Stop workspace → input area removed, "Session ended" shown

### Cross-Client Consistency Tests

94. **Session created in CLI visible in web**: Create via CLI → verify in web UI session list
95. **Session created in web visible in CLI**: Create via web → verify in CLI `agent workspace list`
96. **Message sent in CLI visible in web**: Send message via CLI → verify appears in web session view
97. **Workspace status change reflects across clients**: Suspend workspace → CLI, web, and TUI all show paused state

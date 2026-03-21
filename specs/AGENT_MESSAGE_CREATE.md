# AGENT_MESSAGE_CREATE

Specification for AGENT_MESSAGE_CREATE.

## High-Level User POV

When a user is working in a Codeplane agent session, sending a message is the primary way they communicate with the agent. A message is a structured turn in an ongoing conversation — the user types a prompt, instruction, or follow-up question, and submits it. The agent receives the message, processes it in the context of the repository, and responds. This back-and-forth is the core interaction loop of the agent experience.

Messages are multi-part by design. Most of the time, a user sends a simple text message — "Explain what this function does" or "Create a landing request from these changes." Under the hood, however, every message is composed of one or more parts. This structure allows the system to record not only plain text, but also tool invocations the agent makes and the results those tools return. A single assistant message might include a text explanation followed by a tool call to read a file, followed by the tool result. The user does not need to understand or manage these parts directly — from their point of view, they just send text messages and read the agent's responses — but the multi-part structure is what makes the conversation replayable, auditable, and useful for debugging.

Messages are always appended to an existing session. The user must have an active agent session before they can send a message. When the user sends a message with the `user` role, Codeplane automatically dispatches an agent run — the system kicks off the agent's reasoning and response generation without any additional user action. This means sending a user message is the trigger that makes the agent do work. The user sends a message, and the response starts arriving.

The feature is accessible across all Codeplane clients. In the web UI and TUI, the user types into a chat input at the bottom of the session view and presses enter. In the CLI, the user runs a `chat` command with the session ID and the message text, or uses the `run` command which creates a session and sends the first message in one step. From the user's perspective, there is no difference between the first message in a session and subsequent ones — the interaction is always: type, send, wait for response.

If something goes wrong — a network failure, an invalid session, a rate limit — the user sees a clear error and their message text is preserved so they can retry. Failed messages never silently disappear from the conversation.

## Acceptance Criteria

### Definition of Done

- An authenticated user with write access to a repository can append a message to an existing agent session.
- The message is persisted with a server-assigned ID, deterministic sequence number, and timestamp.
- All message parts are stored in order and are retrievable via the message list endpoint.
- When the message role is `"user"`, an agent run is automatically dispatched.
- All clients (API, CLI, TUI, web) converge on the same message creation contract.
- All error cases are handled gracefully with user-facing messages and input preservation.
- The feature is covered by comprehensive integration and end-to-end tests.

### Input Constraints

- **Role**: Required. Must be one of `"user"`, `"assistant"`, `"system"`, `"tool"`. Case-sensitive, trimmed server-side before validation.
- **Parts**: Required. Must be a non-empty array. An empty array or missing `parts` field returns 400.
- **Parts — maximum count**: 100 parts per message. Requests with more than 100 parts must be rejected with 400.
- **Part type**: Required for each part. Must be one of `"text"`, `"tool_call"`, `"tool_result"`. Trimmed server-side before validation.
- **Part content**: Required for each part. Must not be `null` or `undefined`.
  - For `"text"` parts: content may be a bare string (normalized to `{ value: string }`) or an object with a `value` field.
  - For `"tool_call"` parts: content must be an object (e.g., `{ id, name, input }`). A bare string returns 400.
  - For `"tool_result"` parts: content must be an object (e.g., `{ id, name, output, isError }`). A bare string returns 400.
- **Part content — text maximum length**: 100,000 characters per text part value. Text parts exceeding this limit must be rejected with 400.
- **Part content — tool_call/tool_result maximum serialized size**: 1 MB when serialized as JSON per part. Parts exceeding this limit must be rejected with 400.
- **Total request body maximum size**: 5 MB. Requests exceeding this limit must be rejected with 413.
- **Session ID**: Required (path parameter). Must be a valid UUID format. An invalid or missing session ID returns 400.
- **Session existence**: The target session must exist. A non-existent session returns 404.
- **Session ownership**: The session must belong to the specified repository (`:owner/:repo`). A session that exists but belongs to a different repository returns 404.

### Behavioral Constraints

- [ ] Message creation requires a valid repository context (owner + repo name).
- [ ] Message creation requires authentication (valid session cookie or PAT).
- [ ] Message creation requires write access to the repository.
- [ ] The created message has a server-generated UUID `id`.
- [ ] The created message has a server-assigned monotonically increasing `sequence` number within the session.
- [ ] Message sequencing uses a `FOR UPDATE` lock on the session row to prevent concurrent sequence collisions.
- [ ] All parts are stored with sequential `partIndex` values (0-based) matching the order in the request.
- [ ] The response includes all message fields: `id`, `sessionId`, `role`, `sequence`, `createdAt`, and the full `parts` array.
- [ ] Each part in the response includes: `id`, `messageId`, `partIndex`, `partType`, `content`, `createdAt`.
- [ ] Timestamps (`createdAt`) are server-generated ISO-8601 values.
- [ ] When `role` is `"user"`, an agent run is dispatched after successful message creation, passing `sessionId`, `repositoryId`, `userId`, and `triggerMessageId`.
- [ ] When `role` is not `"user"` (e.g., `"assistant"`, `"system"`, `"tool"`), no agent run is dispatched.
- [ ] If agent dispatch fails after the message is successfully persisted, the server returns the dispatch error (not the message).
- [ ] A PostgreSQL `NOTIFY` is emitted on the session's channel after message creation, enabling downstream SSE listeners.
- [ ] Empty request body returns 400 with `"invalid request body"`.
- [ ] Request body with non-JSON content returns 400.
- [ ] Request body with missing `role` returns 400 with `"invalid role"`.
- [ ] Request body with invalid `role` value returns 400 with `"invalid role"`.
- [ ] Request body with missing `parts` returns 400 with `"parts are required"`.
- [ ] Request body with empty `parts` array returns 400 with `"parts are required"`.
- [ ] Part with missing or invalid `type` returns 400 with `"invalid part type"`.
- [ ] Part with `null` or `undefined` content returns 400 with `"part content is required"`.
- [ ] Part with bare string content for non-text type returns 400 with `"part content must be an object for {partType}"`.
- [ ] Unauthenticated request returns 401.
- [ ] Authenticated user without write access returns 403.
- [ ] Message for non-existent session returns 404.
- [ ] Rate-limited request returns 429 with `Retry-After` header.
- [ ] Server error returns 500 with a structured error payload.
- [ ] Duplicate/concurrent message submissions to the same session each produce separate messages with distinct sequence numbers.
- [ ] Text part bare string `""` (empty string) is valid — it is normalized to `{ value: "" }`.
- [ ] Request with extra unknown fields in the body is handled gracefully (extra fields are ignored).

### Edge Cases

- [ ] Text part content at exactly 100,000 characters: accepted.
- [ ] Text part content at 100,001 characters: rejected with 400.
- [ ] Parts array with exactly 100 parts: accepted.
- [ ] Parts array with 101 parts: rejected with 400.
- [ ] Part content containing only emoji: accepted.
- [ ] Part content containing HTML/script tags: stored as literal text, never interpreted.
- [ ] Part content containing null bytes: rejected with 400.
- [ ] Part content as an empty object `{}` for `tool_call`: accepted (content shape validation is application-level, not schema-level).
- [ ] Text part with bare string content: normalized to `{ value: "..." }` in storage and response.
- [ ] Text part with object content `{ value: "hello" }`: stored as-is.
- [ ] Session ID with invalid UUID format: returns 400.
- [ ] Session ID as empty string after trim: returns 400 with `"session id is required"`.
- [ ] Multiple concurrent message POSTs to the same session: all succeed with distinct, sequential sequence numbers.
- [ ] Message to a `"completed"` or `"failed"` or `"timed_out"` session: accepted (intentional design — allows post-mortem annotation).
- [ ] Extremely large JSON object as `tool_call` content (approaching 1 MB): accepted if under limit.
- [ ] `role` field with leading/trailing whitespace: trimmed and validated successfully.
- [ ] `type` field with leading/trailing whitespace on parts: trimmed and validated successfully.
- [ ] Request body as a JSON array instead of object: returns 400.
- [ ] Message creation on archived repository: returns 403.
- [ ] Message creation on non-existent repository: returns 404.

## Design

### API Shape

**Endpoint**: `POST /api/repos/:owner/:repo/agent/sessions/:id/messages`

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner (user or org name) |
| `repo` | string | Repository name |
| `id` | string (UUID) | Agent session ID |

**Request Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `Authorization` | Yes | `token <PAT>` or session cookie |

**Request Body**:
```json
{
  "role": "user",
  "parts": [
    { "type": "text", "content": "Explain what the auth middleware does" }
  ]
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `role` | string | Yes | One of `"user"`, `"assistant"`, `"system"`, `"tool"` |
| `parts` | array | Yes | Non-empty array of part objects, max 100 items |
| `parts[].type` | string | Yes | One of `"text"`, `"tool_call"`, `"tool_result"` |
| `parts[].content` | string \| object | Yes | Bare string allowed only for `"text"` type; object required for others |

**Request Body Examples**:

Simple text message:
```json
{
  "role": "user",
  "parts": [
    { "type": "text", "content": "What does this function do?" }
  ]
}
```

Text message with object content:
```json
{
  "role": "user",
  "parts": [
    { "type": "text", "content": { "value": "What does this function do?" } }
  ]
}
```

Multi-part assistant message with tool calls:
```json
{
  "role": "assistant",
  "parts": [
    { "type": "text", "content": { "value": "Let me check that file for you." } },
    { "type": "tool_call", "content": { "id": "call_1", "name": "read_file", "input": "{\"path\": \"src/auth.ts\"}" } }
  ]
}
```

Tool result message:
```json
{
  "role": "tool",
  "parts": [
    { "type": "tool_result", "content": { "id": "call_1", "name": "read_file", "output": "export function authenticate() {...}", "isError": false } }
  ]
}
```

**Success Response**: `201 Created`
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "user",
  "sequence": "0",
  "parts": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "messageId": "660e8400-e29b-41d4-a716-446655440001",
      "partIndex": "0",
      "partType": "text",
      "content": { "value": "Explain what the auth middleware does" },
      "createdAt": "2026-03-22T10:31:00.000Z"
    }
  ],
  "createdAt": "2026-03-22T10:31:00.000Z"
}
```

**Error Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| `400` | Invalid or missing JSON body | `{ "message": "invalid request body" }` |
| `400` | Missing or invalid `role` | `{ "message": "invalid role" }` |
| `400` | Missing or empty `parts` array | `{ "message": "parts are required" }` |
| `400` | Invalid part `type` | `{ "message": "invalid part type" }` |
| `400` | Part content is null/undefined | `{ "message": "part content is required" }` |
| `400` | Non-text part has bare string content | `{ "message": "part content must be an object for tool_call" }` |
| `400` | Session ID empty or missing | `{ "message": "session id is required" }` |
| `400` | Text content exceeds 100,000 chars | `{ "message": "text content exceeds maximum length" }` |
| `400` | Parts array exceeds 100 items | `{ "message": "too many parts" }` |
| `401` | No authentication provided | `{ "message": "authentication required" }` |
| `403` | User lacks write access | `{ "message": "write access required" }` |
| `404` | Session not found | `{ "message": "session not found" }` |
| `404` | Repository not found | `{ "message": "repository not found" }` |
| `413` | Request body exceeds 5 MB | `{ "message": "request body too large" }` |
| `429` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` + `Retry-After` header |
| `500` | Internal server error | `{ "message": "internal error" }` |

### SDK Shape

**Hook: `useSendAgentMessage`**

```typescript
interface SendAgentMessageInput {
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: Array<{
    type: "text" | "tool_call" | "tool_result";
    content: string | Record<string, unknown>;
  }>;
}

interface AgentMessagePart {
  id: string;
  messageId: string;
  partIndex: string;
  partType: "text" | "tool_call" | "tool_result";
  content: Record<string, unknown>;
  createdAt: string;
}

interface AgentMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  sequence: string;
  parts: AgentMessagePart[];
  createdAt: string;
}

function useSendAgentMessage(options: {
  owner: string;
  repo: string;
}): {
  send: (input: SendAgentMessageInput) => Promise<AgentMessage>;
  sending: boolean;
  error: Error | null;
};
```

**Service method: `agentService.appendMessage`**

```typescript
interface AppendMessageInput {
  sessionId: string;
  role: string;
  parts: Array<{ partType: string; content: unknown }>;
}

interface AppendMessageResult {
  id: string;
  sessionId: string;
  role: string;
  sequence: string;
  parts: Array<{
    id: string;
    messageId: string;
    partIndex: string;
    partType: string;
    content: unknown;
    createdAt: Date;
  }>;
  createdAt: Date;
}

function appendMessage(input: AppendMessageInput): Promise<AppendMessageResult>;
```

### CLI Command

**Send a message to an existing session**:
```
codeplane agent session chat <session-id> <message> [--repo OWNER/REPO]
```

**Create a session and send the first message in one step**:
```
codeplane agent session run <prompt> [--title "session title"] [--repo OWNER/REPO]
```

**Examples**:
```bash
# Send a follow-up message
codeplane agent session chat 550e8400-e29b-41d4-a716-446655440000 "Now fix the tests too"

# Send to a specific repo
codeplane agent session chat abc123 "Explain the auth flow" --repo myorg/myrepo

# Create session and send first message
codeplane agent session run "Fix the flaky CI test" --title "CI fix session"
```

**Output (default JSON)**:
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "user",
  "sequence": "3",
  "createdAt": "2026-03-22T10:31:00.000Z"
}
```

### Web UI Design

The message input is the primary interaction element in the agent session chat view.

**Chat input area**:
- A text input (or expandable textarea) pinned to the bottom of the session chat view.
- Placeholder text: "Type a message..."
- Submit on `Enter` (or `Cmd+Enter` / `Ctrl+Enter` for multi-line input).
- A send button (arrow icon) to the right of the input, enabled only when the input is non-empty after trim.
- The input is disabled and shows a spinner while a message is being sent.
- On successful send, the input clears and the new message appears in the chat scroll.
- On error, a toast or inline error appears below the input. The typed message text is preserved in the input.

**Optimistic rendering**:
- When the user presses send, the message should appear in the chat immediately (optimistic UI) with a subtle "sending" indicator.
- If the request succeeds, the indicator disappears and the server-assigned fields (id, sequence, createdAt) replace the optimistic placeholders.
- If the request fails, the message is marked with a failure icon and a "Retry" affordance.

**Scroll behavior**:
- After sending, the chat scrolls to the bottom to show the new message.
- If the user has scrolled up to read history, a "scroll to bottom" floating button appears when a new message is added.

### TUI UI Design

**Input mode**:
- The agent chat screen has a focused text input at the bottom.
- The user types their message and presses `Enter` to send.
- While sending, the input is replaced by a "Sending..." status line.
- On success, the message appears in the message list and the input resets.
- On error, an inline error message appears and the input text is preserved.

**Keybindings**:
| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Escape` | Clear input / exit chat |
| `↑` / `↓` | Scroll message history |
| `Tab` | Cycle focus between input and message list |

### Documentation

The following documentation should be written for end users:

- **Agent sessions guide** section on "Sending messages": Explain how to type and send messages in web, TUI, and CLI. Cover text messages, retry on failure, and the automatic agent dispatch behavior.
- **CLI reference**: Document `codeplane agent session chat` and `codeplane agent session run` with examples and flag descriptions.
- **API reference**: Document the `POST /api/repos/:owner/:repo/agent/sessions/:id/messages` endpoint with request/response examples, error codes, and part type descriptions.
- **FAQ entry**: "What happens when I send a message?" — Explain the automatic agent run dispatch and that the agent begins working immediately.

## Permissions & Security

### Authorization Roles

| Role | Can create messages? | Notes |
|------|---------------------|-------|
| Anonymous | No | Returns 401 |
| Read-only | No | Returns 403 |
| Member (write) | Yes | Can send messages to sessions in repositories they have write access to |
| Admin | Yes | Full access |
| Owner | Yes | Full access |

### Rate Limiting

- **Global rate limit**: 120 requests per 60-second window per authenticated user (shared with all API endpoints).
- **Agent message-specific burst limit**: No additional message-specific rate limit beyond the global cap. The global 120 req/min is sufficient given the conversational cadence of agent sessions.
- **Response headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response. `Retry-After` on 429 responses.
- **Unauthenticated requests**: Always return 401 before any rate limit evaluation.

### Data Privacy

- **Message content may contain PII**: User messages, tool outputs, and agent responses can contain arbitrary text including code, names, and other sensitive information. Message content must never be logged at INFO level or below.
- **Content stored as-is**: No server-side redaction or sanitization of message content beyond structural normalization.
- **Repository scoping**: Messages are accessible only to users with read access to the repository the session belongs to.
- **No cross-repository message leakage**: The session-to-repository binding must be enforced on every message creation and retrieval path.
- **Audit trail**: Message creation events should be auditable (who sent what to which session) but the full message content should not appear in audit logs.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `agent.message.created` | Message successfully persisted | `sessionId`, `messageId`, `role`, `partCount`, `partTypes[]`, `repositoryId`, `userId`, `sequenceNumber`, `textContentLength`, `durationMs` |
| `agent.message.create_failed` | Message creation returned an error | `sessionId`, `role`, `errorCode`, `errorMessage`, `repositoryId`, `userId` |
| `agent.run.dispatched` | Agent run dispatched after user message | `sessionId`, `messageId`, `repositoryId`, `userId` |
| `agent.run.dispatch_failed` | Agent dispatch failed after message creation | `sessionId`, `messageId`, `repositoryId`, `userId`, `errorCode`, `errorMessage` |

### Common Properties (attached to all events)

- `timestamp` (ISO-8601)
- `clientType` (`"api"`, `"cli"`, `"tui"`, `"web"`, `"desktop"`)
- `serverVersion`

### Funnel Metrics and Success Indicators

- **Message send success rate**: Target ≥ 99.5% of message creation attempts succeed (excluding 4xx client errors).
- **Median message creation latency**: Target ≤ 200ms (p50), ≤ 500ms (p95), ≤ 1000ms (p99).
- **Agent dispatch success rate**: Target ≥ 99% of dispatches succeed when a user message triggers them.
- **Messages per session**: Track mean and median messages per session. A healthy indicator is ≥ 3 messages per session (users are having real conversations, not abandoning after one message).
- **Multi-part adoption**: Track percentage of messages that contain more than one part (indicates tool usage maturity).
- **Session reuse**: Percentage of sessions that receive more than one user message (indicates users returning to the same conversation).

## Observability

### Logging Requirements

| Level | Event | Structured Fields |
|-------|-------|-------------------|
| `INFO` | Message created | `sessionId`, `messageId`, `role`, `partCount`, `sequence`, `durationMs` |
| `INFO` | Agent run dispatched | `sessionId`, `messageId`, `repositoryId`, `userId` |
| `WARN` | Agent dispatch failed (after message success) | `sessionId`, `messageId`, `error`, `errorCode` |
| `WARN` | Rate limit hit on message creation | `userId`, `ip`, `retryAfter` |
| `ERROR` | Message creation failed (5xx) | `sessionId`, `role`, `error`, `stackTrace` |
| `ERROR` | Sequence lock contention timeout | `sessionId`, `role`, `lockWaitMs` |
| `DEBUG` | Part normalization details | `sessionId`, `partIndex`, `partType`, `contentNormalized` (boolean, not content) |
| `DEBUG` | Request body parsing | `sessionId`, `bodySize`, `parseSuccess` |

**Content must never be logged**: Message text, tool call inputs, and tool result outputs must not appear in any log line at any level. Only structural metadata (lengths, types, counts) should be logged.

### Prometheus Metrics

**Counters**:
- `codeplane_agent_messages_created_total` — labels: `role`, `repository_id`, `status` (`success`, `error`)
- `codeplane_agent_message_parts_created_total` — labels: `part_type`, `repository_id`
- `codeplane_agent_run_dispatches_total` — labels: `repository_id`, `status` (`success`, `error`)
- `codeplane_agent_message_validation_errors_total` — labels: `error_type` (`invalid_role`, `invalid_part_type`, `missing_content`, `content_too_large`, `too_many_parts`)

**Histograms**:
- `codeplane_agent_message_create_duration_seconds` — labels: `role` — buckets: `0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0`
- `codeplane_agent_message_body_size_bytes` — labels: `role` — buckets: `100, 1000, 10000, 100000, 1000000, 5000000`
- `codeplane_agent_message_parts_count` — labels: `role` — buckets: `1, 2, 5, 10, 25, 50, 100`

**Gauges**:
- `codeplane_agent_message_sequence_lock_wait_seconds` — current lock acquisition wait time

### Alerts

**Alert: AgentMessageCreationErrorRateHigh**
- **Condition**: `rate(codeplane_agent_messages_created_total{status="error"}[5m]) / rate(codeplane_agent_messages_created_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_agent_message_validation_errors_total` for spikes in specific error types — if validation errors dominate, this may be a client bug sending malformed requests rather than a server issue.
  2. Check server error logs for `message creation failed` entries. Look at the `error` and `stackTrace` fields.
  3. Check database connectivity: run `SELECT 1` against the agent database. If the DB is unreachable, escalate to the database on-call.
  4. Check if `codeplane_agent_message_create_duration_seconds` p99 has spiked — prolonged latency can cause timeouts that manifest as errors.
  5. Check for lock contention on `agent_sessions` via `pg_stat_activity` — the `FOR UPDATE` lock could be starved under high concurrency.
  6. If the error rate is isolated to one repository, investigate whether that repository has an unusually large number of concurrent agent sessions.

**Alert: AgentMessageLatencyHigh**
- **Condition**: `histogram_quantile(0.99, rate(codeplane_agent_message_create_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_agent_message_sequence_lock_wait_seconds` — high lock wait times indicate contention on the `FOR UPDATE` lock. This is expected during bursts of concurrent messages to the same session.
  2. Check database slow query logs for queries matching `agent_messages` or `agent_parts`.
  3. Check system resources (CPU, memory, disk I/O) on the database host.
  4. If the latency is isolated to specific sessions, check if those sessions have an unusually high message count (thousands) which could slow sequence computation.
  5. Consider whether a connection pool exhaustion is occurring — check `pg_stat_activity` for idle-in-transaction connections.

**Alert: AgentDispatchFailureRateHigh**
- **Condition**: `rate(codeplane_agent_run_dispatches_total{status="error"}[5m]) / rate(codeplane_agent_run_dispatches_total[5m]) > 0.1`
- **Severity**: Critical
- **Runbook**:
  1. Check agent dispatch error logs for the specific failure reason. Common causes: workflow engine unavailable, workspace runtime unavailable, or agent backend misconfigured.
  2. Verify the workflow engine is healthy by checking its health endpoint.
  3. Check if the agent backend (local or workspace) is reachable and has available capacity.
  4. Note: the user message is already persisted even if dispatch fails. The message is safe, but the user will not receive an agent response until dispatch is retried or manually triggered.
  5. If the dispatch target is a workspace-backed agent, check workspace service health and container runtime availability.

**Alert: AgentMessageSequenceLockContention**
- **Condition**: `codeplane_agent_message_sequence_lock_wait_seconds > 5.0`
- **Severity**: Warning
- **Runbook**:
  1. Identify which session(s) have lock contention by checking the `sessionId` label on the metric (if available) or querying `pg_stat_activity` for `FOR UPDATE` waits on `agent_sessions`.
  2. Check whether a long-running transaction is holding the lock — look for idle-in-transaction sessions.
  3. If a single session is the bottleneck, consider whether an agent is appending messages at an unusually high rate.
  4. In extreme cases, terminate the blocking transaction with `pg_terminate_backend()` after confirming it is safe to do so.

### Error Cases and Failure Modes

| Error Case | Detection | Impact | Recovery |
|------------|-----------|--------|----------|
| Database unreachable | Connection error on INSERT | 500 returned, message not persisted | Automatic reconnection via connection pool; user retries |
| Sequence lock timeout | Lock wait exceeds statement timeout | 500 returned, message not persisted | User retries; investigate blocking transactions |
| Agent dispatch timeout | HTTP/gRPC timeout to agent backend | Message persisted but agent does not respond | Retry dispatch; manual agent run trigger |
| Invalid JSON body | JSON parse error | 400 returned | User fixes request format |
| Content exceeds size limit | Server-side length check | 400 or 413 returned | User reduces message size |
| Session not found | DB lookup returns null | 404 returned | User verifies session ID |
| Auth token expired | Auth middleware rejects | 401 returned | User re-authenticates |
| Repository permissions changed mid-session | Auth check fails | 403 returned | User requests access or admin restores permissions |
| Concurrent message race | FOR UPDATE lock serializes | Both succeed with distinct sequences | No action needed |
| Notification channel failure | pg_notify fails | Message persisted but SSE listeners not notified | Listeners fall back to polling; investigate pg_notify health |

## Verification

### API Integration Tests

1. **Happy path — text message**: POST a valid user message with a single text part. Verify 201 response with `id`, `sessionId`, `role`, `sequence`, `parts`, `createdAt`.
2. **Happy path — multi-part message**: POST a message with 3 parts (text + tool_call + tool_result). Verify all parts are returned in order with correct `partIndex` values.
3. **Happy path — assistant role**: POST a message with role `"assistant"`. Verify 201 and that no agent run is dispatched.
4. **Happy path — system role**: POST a message with role `"system"`. Verify 201.
5. **Happy path — tool role**: POST a message with role `"tool"` and a `tool_result` part. Verify 201.
6. **Bare string text normalization**: POST a text part with bare string content `"hello"`. Verify response content is `{ "value": "hello" }`.
7. **Object text content passthrough**: POST a text part with object content `{ "value": "hello" }`. Verify response content is `{ "value": "hello" }`.
8. **Sequence ordering**: POST 3 messages to the same session. Verify sequences are `"0"`, `"1"`, `"2"`.
9. **Agent dispatch on user role**: POST a user message. Verify that the agent run dispatch is triggered (mock dispatch service and assert it was called with correct parameters).
10. **No dispatch on assistant role**: POST an assistant message. Verify dispatch is NOT called.
11. **Authentication required**: POST without auth header. Verify 401 with `"authentication required"`.
12. **PAT authentication**: POST with a valid PAT in `Authorization: token <PAT>` header. Verify 201.
13. **Session cookie authentication**: POST with a valid session cookie. Verify 201.
14. **Write access required**: POST as a user with only read access. Verify 403.
15. **Non-existent session**: POST to a session ID that does not exist. Verify 404.
16. **Non-existent repository**: POST to an owner/repo that does not exist. Verify 404.
17. **Empty session ID**: POST with empty `:id` path parameter. Verify 400 with `"session id is required"`.
18. **Invalid JSON body**: POST with `Content-Type: application/json` but invalid JSON. Verify 400 with `"invalid request body"`.
19. **Empty request body**: POST with empty body. Verify 400.
20. **Missing role field**: POST with `{ "parts": [...] }`. Verify 400 with `"invalid role"`.
21. **Invalid role value**: POST with `{ "role": "narrator", "parts": [...] }`. Verify 400 with `"invalid role"`.
22. **Missing parts field**: POST with `{ "role": "user" }`. Verify 400 with `"parts are required"`.
23. **Empty parts array**: POST with `{ "role": "user", "parts": [] }`. Verify 400 with `"parts are required"`.
24. **Invalid part type**: POST with part `{ "type": "image", "content": "..." }`. Verify 400 with `"invalid part type"`.
25. **Null part content**: POST with part `{ "type": "text", "content": null }`. Verify 400 with `"part content is required"`.
26. **Undefined part content**: POST with part `{ "type": "text" }` (content field missing). Verify 400 with `"part content is required"`.
27. **Bare string for tool_call**: POST with part `{ "type": "tool_call", "content": "string" }`. Verify 400 with `"part content must be an object for tool_call"`.
28. **Bare string for tool_result**: POST with part `{ "type": "tool_result", "content": "string" }`. Verify 400 with `"part content must be an object for tool_result"`.
29. **Role with whitespace**: POST with `{ "role": "  user  ", "parts": [...] }`. Verify 201 (role is trimmed).
30. **Part type with whitespace**: POST with part `{ "type": "  text  ", "content": "hello" }`. Verify 201 (type is trimmed).
31. **Unicode text content**: POST text containing emoji, CJK characters, RTL text, and combining characters. Verify stored and returned exactly.
32. **HTML in text content**: POST text containing `<script>alert('xss')</script>`. Verify stored as literal string.
33. **Empty string text content**: POST text part with `""`. Verify 201 and content normalized to `{ "value": "" }`.
34. **Extra fields in body**: POST with `{ "role": "user", "parts": [...], "extra": "ignored" }`. Verify 201 (extra fields ignored).
35. **Extra fields in parts**: POST with part `{ "type": "text", "content": "hi", "extra": "ignored" }`. Verify 201.
36. **Maximum text length (100,000 chars)**: POST text part with exactly 100,000 character string. Verify 201.
37. **Text exceeds maximum length (100,001 chars)**: POST text part with 100,001 character string. Verify 400.
38. **Maximum parts count (100)**: POST message with exactly 100 parts. Verify 201.
39. **Parts count exceeds maximum (101)**: POST message with 101 parts. Verify 400.
40. **Large tool_call content near 1 MB**: POST a tool_call part with ~999 KB JSON content. Verify 201.
41. **Tool_call content exceeds 1 MB**: POST a tool_call part with >1 MB JSON content. Verify 400.
42. **Total body exceeds 5 MB**: POST a request body that exceeds 5 MB total. Verify 413.
43. **Concurrent message creation**: POST 10 messages concurrently to the same session. Verify all 10 succeed with distinct, sequential sequence numbers and no gaps.
44. **Rate limit enforcement**: Send 121 requests within 60 seconds. Verify the 121st returns 429 with `Retry-After` header.
45. **Rate limit headers present**: Send a valid request. Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers are present.
46. **Session belongs to different repository**: Create a session in repo A, then POST a message to that session ID under repo B's path. Verify 404.
47. **Message persisted after creation**: POST a message, then GET the session's message list. Verify the new message appears.
48. **Message appears in correct sequence position**: Create a session, POST 3 messages, GET messages. Verify order matches sequence numbers.
49. **Archived repository**: POST a message to a session in an archived repository. Verify 403.
50. **Dispatch error does not lose message**: Mock dispatch to fail. POST a user message. Verify the message is still persisted and retrievable even though dispatch failed.

### CLI E2E Tests

51. **`agent session chat` — happy path**: Run `codeplane agent session chat <id> "hello"`. Verify exit code 0 and JSON output with message fields.
52. **`agent session chat` — with `--repo` flag**: Run with explicit `--repo owner/name`. Verify correct API path is used.
53. **`agent session chat` — invalid session ID**: Run with non-existent session ID. Verify error output with 404.
54. **`agent session chat` — empty message**: Run with empty string `""`. Verify the message is created with `{ value: "" }`.
55. **`agent session run` — creates session and sends message**: Run `codeplane agent session run "Fix the bug"`. Verify a session is created and a message is sent (two API calls).
56. **`agent session run` — with `--title` flag**: Run with `--title "My session"`. Verify session title matches.
57. **`agent session run` — default title from prompt**: Run without `--title`. Verify session title is first 60 chars of prompt.
58. **`agent session chat` — unauthenticated**: Run without auth configured. Verify error output with 401.
59. **`agent session chat` — JSON output format**: Verify the output is valid parseable JSON.
60. **`agent session run` — long prompt**: Run with a 10,000-character prompt. Verify success and title truncated to 60 chars.

### Web UI E2E Tests (Playwright)

61. **Chat input visible**: Navigate to agent session view. Verify the message input is visible and focused.
62. **Send text message**: Type a message, press Enter. Verify the message appears in the chat.
63. **Optimistic rendering**: Type and send. Verify the message appears immediately before server response.
64. **Send button disabled when empty**: Verify the send button is disabled when the input is empty.
65. **Send button enabled with text**: Type text. Verify the send button becomes enabled.
66. **Error toast on failure**: Mock API to return 500. Send a message. Verify error toast appears.
67. **Input preserved on error**: Mock API to return 500. Send. Verify the typed text remains in the input.
68. **Scroll to bottom on send**: Scroll up in a long conversation. Send a message. Verify the view scrolls to the bottom.
69. **Message appears in correct order**: Send 3 messages. Verify they appear in chronological order.
70. **Loading state during send**: Send a message (with delayed mock). Verify the input is disabled and shows loading state.
71. **Enter key sends message**: Type text, press Enter. Verify the message is sent.
72. **Retry on failure**: Mock first attempt to fail, second to succeed. Verify retry affordance works.
73. **Empty input after successful send**: Send a message successfully. Verify the input is cleared.

### TUI E2E Tests

74. **Chat input renders**: Open agent session screen. Verify the input area renders at the bottom.
75. **Type and send message**: Type text, press Enter. Verify the message appears in the message list.
76. **Sending state indicator**: Send a message. Verify "Sending..." indicator appears during request.
77. **Error display on failure**: Mock API error. Send. Verify error message appears inline.
78. **Input preserved on error**: Mock API error. Verify typed text is preserved after error.
79. **Escape clears input**: Type text, press Escape. Verify input is cleared.
80. **Scroll through messages**: With 20+ messages, verify Up/Down arrow keys scroll through history.
81. **Tab cycles focus**: Press Tab. Verify focus moves between input and message list.
82. **Message sequence displayed correctly**: Send 3 messages. Verify they appear in sequence order.

### Cross-Client Consistency Tests

83. **API message visible in CLI**: Create a message via API, read it via CLI. Verify fields match.
84. **CLI message visible in web**: Create a message via CLI, verify it appears in web UI.
85. **Sequence consistency across clients**: Send messages from different clients. Verify sequence numbers are globally consistent.
86. **Response shape consistency**: Send the same message from API, CLI, and SDK. Verify all response shapes match the contract.

### Edge Case Integration Tests

87. **Message to completed session**: Create a session, mark it completed, POST a message. Verify the message is accepted (sessions allow post-mortem annotation).
88. **Message to timed_out session**: POST a message to a timed-out session. Verify accepted.
89. **Message with null bytes in content**: POST content containing `\x00`. Verify 400.
90. **Message with extremely long tool_call input field**: POST a tool_call with a 500 KB `input` string. Verify 201.
91. **Rapid sequential messages**: POST 50 messages in rapid succession (serial, not concurrent). Verify all succeed with correct sequences.
92. **Message after session deletion**: Delete a session, then POST a message to it. Verify 404.
93. **Unicode in all message fields**: POST with Unicode role (invalid), Unicode part type (invalid), and Unicode content (valid). Verify correct validation for each.

**Total: 93 tests**

# AGENT_RESPONSE_STREAM

Specification for AGENT_RESPONSE_STREAM.

## High-Level User POV

As a developer using Codeplane's agent features, I want to see real-time streaming responses from agent sessions so that I can interact with AI agents naturally without waiting for complete responses. Currently the CE agent streaming endpoint returns a 501 placeholder, making the agent chat experience non-functional for live interactions.

## Acceptance Criteria

1. The agent session streaming endpoint (currently 501) returns a valid SSE stream for active agent sessions.
2. The SSE stream emits delta events as agent response tokens are generated, with each event containing the session ID, message ID, and content delta.
3. The stream emits a final 'done' event when the agent response is complete, including the full message metadata.
4. The stream emits 'error' events with structured error payloads if the agent backend fails mid-response.
5. The web UI agent dock and TUI agent chat screens consume the SSE stream and render incremental content as it arrives.
6. The CLI agent helper mode displays streaming output to stdout as it arrives.
7. Concurrent viewers of the same session each receive their own SSE connection with the same event sequence.
8. If the client disconnects mid-stream, the server cleans up the SSE connection without affecting the underlying agent session.
9. Session replay continues to work by reading completed messages from the database, independent of the live stream path.
10. The streaming endpoint respects the same auth model (session cookies, PAT, OAuth) as all other authenticated endpoints.

## Design

The implementation replaces the 501 placeholder in the agent streaming route with a real SSE-backed response stream.

**Server layer** (`apps/server/src/routes/agents.ts`):
- The `GET /api/repos/:owner/:repo/agent-sessions/:sessionId/stream` endpoint is updated to create an SSE response using the existing `SseManager` from `@codeplane/sdk`.
- On connection, the handler subscribes to the agent session's event channel via `sseManager.subscribe(channel, callback)`.
- The handler validates session ownership and repository access before opening the stream.
- The response uses `Content-Type: text/event-stream` with `Cache-Control: no-cache` and `Connection: keep-alive`.

**Service layer** (`packages/sdk/src/services/agent.ts`):
- The agent service gains a `streamResponse(sessionId, messageId)` method that emits events to the SSE channel as the agent backend produces tokens.
- Events follow the schema: `{ event: 'delta' | 'done' | 'error', data: { sessionId, messageId, content?, metadata?, error? } }`.
- The CE agent backend adapter (local or workspace-based) is responsible for calling `emit('delta', ...)` as tokens arrive and `emit('done', ...)` on completion.
- The service writes the completed message to the database once the 'done' event fires, ensuring session replay consistency.

**Client layer**:
- `packages/ui-core` gains a `useAgentStream(sessionId)` hook that wraps `EventSource` and exposes reactive state for the current streaming message.
- The web agent dock (`apps/ui`) and TUI agent chat (`apps/tui`) consume this hook/store to render incremental content.
- The CLI agent helper uses the SDK's fetch-based SSE reader to print streaming output.

**Event channel naming**: `agent:session:{sessionId}` — scoped per session to avoid cross-talk.

**Backpressure**: The SSE connection is dropped server-side if the client stops reading for >30 seconds (heartbeat timeout).

**No new database tables**: Events are transient over SSE; only the final completed message is persisted.

## Permissions & Security

- The streaming endpoint requires the same authentication as the existing agent session endpoints: valid session cookie, PAT, or OAuth token.
- The user must have read access to the repository that owns the agent session.
- Repository deploy keys are NOT permitted to access agent streams (agent sessions are user-scoped, not automation-scoped).
- Admin users can access any agent session stream for debugging purposes.
- No new permission scopes are introduced; this reuses the existing `repo:read` + `agent-session:read` authorization checks.

## Telemetry & Product Analytics

- `agent.stream.connected` — counter, incremented when a client opens an SSE connection. Tags: `repo`, `session_id`.
- `agent.stream.disconnected` — counter, incremented on client disconnect or timeout. Tags: `repo`, `session_id`, `reason` (client_close | timeout | error).
- `agent.stream.delta_events` — counter, incremented per delta event emitted. Tags: `session_id`.
- `agent.stream.duration_ms` — histogram, measures total SSE connection duration from open to close.
- `agent.stream.error` — counter, incremented when the agent backend emits an error event. Tags: `session_id`, `error_type`.

## Observability

- Structured log at INFO level when a stream connection is opened: `{ event: 'agent_stream_open', sessionId, userId, repo }`.
- Structured log at INFO level when a stream connection is closed: `{ event: 'agent_stream_close', sessionId, reason, durationMs }`.
- Structured log at WARN level on stream errors: `{ event: 'agent_stream_error', sessionId, error }`.
- The existing `/health` endpoint is unaffected; active SSE connections are tracked in the SseManager's internal connection count, which is already exposed.
- Alert condition: if `agent.stream.error` rate exceeds 5% of `agent.stream.connected` over a 5-minute window, fire a warning alert.
- Grafana dashboard panel: 'Active Agent Streams' showing real-time count of open SSE connections by repository.

## Verification

1. **Unit tests** (`packages/sdk`): Test that `AgentService.streamResponse` emits delta, done, and error events in the correct sequence via a mock backend adapter.
2. **Unit tests** (`packages/sdk`): Test that completed messages are persisted to the database only after the 'done' event.
3. **Route integration tests** (`apps/server`): Test that the streaming endpoint returns 401 for unauthenticated requests, 403 for users without repo access, and 404 for non-existent sessions.
4. **Route integration tests** (`apps/server`): Test that the streaming endpoint returns `Content-Type: text/event-stream` and emits well-formed SSE events.
5. **Route integration tests** (`apps/server`): Test that disconnecting the client mid-stream does not throw unhandled errors on the server.
6. **E2E tests**: Test the full flow — create an agent session, send a message, open the stream, receive delta events, receive the done event, verify the message appears in session replay.
7. **E2E tests**: Test concurrent viewers on the same session both receive events.
8. **Client tests** (`packages/ui-core`): Test that the `useAgentStream` hook correctly accumulates deltas into a rendered message and transitions to 'complete' on the done event.
9. **Load test**: Verify the server handles 100 concurrent SSE connections without degraded response latency on other API endpoints.
10. **Manual verification**: Open the web agent dock, send a message, and visually confirm tokens appear incrementally rather than as a single block.

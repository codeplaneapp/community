# AGENT_SESSION_DELETE

Specification for AGENT_SESSION_DELETE.

## High-Level User POV

As a Codeplane user (human or agent), I want to delete an agent session so that I can clean up completed, abandoned, or errored sessions from my repository's agent session list, freeing up resources and keeping my workspace organized.

## Acceptance Criteria

1. DELETE /api/v1/repos/:owner/:repo/agents/sessions/:sessionId returns 204 No Content on success.
2. Returns 404 if the session does not exist or does not belong to the specified repository.
3. Returns 401 if the request is unauthenticated.
4. Returns 403 if the authenticated user lacks write access to the repository.
5. Deleting a session also deletes all associated messages (cascade).
6. Deleting an active/running session first terminates any in-progress agent activity before removing the record.
7. The CLI command `codeplane agent session delete <session-id>` calls the API and prints confirmation or error.
8. The TUI agent sessions screen supports deleting a selected session with a confirmation prompt.
9. The web UI agent sessions list includes a delete action with confirmation dialog.
10. After deletion, SSE subscribers for the deleted session receive a terminal event and the stream closes.
11. The operation is idempotent — deleting an already-deleted session returns 404, not 500.

## Design

### API Layer
- Add DELETE handler in `apps/server/src/routes/agents.ts` at `/:owner/:repo/agents/sessions/:sessionId`.
- Handler resolves repo via `repoService.getByOwnerAndName()`, authenticates user, checks write permission, then calls `agentService.deleteSession(repoId, sessionId)`.
- If session is in 'running' or 'active' status, call `agentService.terminateSession()` before deletion.
- Return 204 on success, 404 if not found, 403 if unauthorized.

### SDK Service Layer
- Add `deleteSession(repoId: string, sessionId: string): Promise<void>` to `packages/sdk/src/services/agent.ts`.
- Implementation: check session exists and belongs to repo, terminate if active, delete messages (CASCADE or explicit batch), delete session record, emit SSE close event via `sseManager.emit()`.

### Database
- Agent messages table should already CASCADE on session deletion. Verify FK constraint; if missing, add migration.
- No new tables or columns required.

### Web UI
- In `apps/ui/src/pages/repo/agents/sessions.tsx`, add delete button per session row with confirmation dialog.
- Call `api.agents.sessions.delete(owner, repo, sessionId)` from `@codeplane/ui-core`.
- On success, invalidate/refetch session list.

### CLI
- Add `delete` subcommand to `apps/cli/src/commands/agent.ts` under `session` group.
- Accepts `<session-id>` positional arg, `--repo` / `-R` flag, `--force` to skip confirmation.
- Prints success message or structured JSON output.

### TUI
- In agent sessions screen, add `d` keybinding for delete with inline confirmation.
- On confirm, call API and refresh list.

### SSE Cleanup
- On deletion, emit `session:deleted` event to any active SSE subscribers for that session, then close the stream.

### Shared API Client
- Add `delete(owner: string, repo: string, sessionId: string): Promise<void>` to `packages/ui-core/src/api/agents.ts`.

## Permissions & Security

- Authentication required (401 if missing).
- User must have write access to the repository (repo collaborator with write+, org member with write+, or repo owner). Returns 403 otherwise.
- Admin users can delete any session regardless of repo membership.
- Deploy keys with write access are permitted.
- PAT tokens with `repo:write` scope are permitted.
- The session creator (even with read-only repo access) is NOT permitted to delete — write access is the boundary, not ownership.

## Telemetry & Product Analytics

- Emit `agent.session.deleted` event with properties: `repoId`, `sessionId`, `userId`, `sessionStatus` (status at time of deletion), `messageCount` (number of messages deleted), `sessionAgeSeconds` (time since creation), `wasActive` (boolean, whether termination was required).
- Increment counter metric `codeplane.agent.sessions.deleted.total` with labels: `repo`, `status`, `terminated`.
- Track deletion latency in histogram `codeplane.agent.sessions.delete.duration_ms`.

## Observability

- Log at INFO level: `Agent session deleted` with fields `repoId`, `sessionId`, `userId`, `deletedMessageCount`, `wasTerminated`.
- Log at WARN level if termination of active session fails (but still proceed with deletion).
- Log at ERROR level if database deletion fails after successful termination.
- Health check: no new health endpoints needed, but the existing admin audit log should capture session deletions.
- Dashboard: agent session deletion rate should be visible in the admin metrics view alongside creation rate.

## Verification

### Unit Tests
1. `agentService.deleteSession()` — deletes session and messages for valid repo+session.
2. `agentService.deleteSession()` — returns not-found error for non-existent session.
3. `agentService.deleteSession()` — returns not-found error when session belongs to different repo.
4. `agentService.deleteSession()` — terminates active session before deletion.
5. `agentService.deleteSession()` — emits SSE close event on deletion.

### Integration / Route Tests
6. DELETE endpoint returns 204 for authorized user with valid session.
7. DELETE endpoint returns 404 for non-existent session ID.
8. DELETE endpoint returns 401 for unauthenticated request.
9. DELETE endpoint returns 403 for user without write access.
10. DELETE endpoint cascades message deletion (verify messages table is empty for that session after).
11. DELETE endpoint is idempotent — second call returns 404.

### CLI Tests
12. `codeplane agent session delete <id>` succeeds and prints confirmation.
13. `codeplane agent session delete <id> --json` outputs structured JSON.
14. `codeplane agent session delete <bad-id>` prints error and exits non-zero.

### E2E Tests
15. Create session → add messages → delete session → verify session and messages gone from list.
16. Create session → start SSE subscription → delete session → verify SSE stream receives terminal event and closes.
17. Web UI: create session → click delete → confirm → verify session removed from list.

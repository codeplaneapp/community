# AUTH_ACTIVE_SESSION_REVOKE

Specification for AUTH_ACTIVE_SESSION_REVOKE.

## High-Level User POV

When a user reviews their active sessions — whether in the web settings page, the CLI, or the TUI — they may discover sessions they no longer recognize or no longer need. Perhaps they signed in on a hotel business center computer and forgot to log out, or they spot an entry from a device they've since given away. The Active Session Revoke capability lets them take immediate, decisive action: they select the unwanted session and revoke it. That session is invalidated instantly. The next time any client tries to use that session — whether it's a browser tab, an API request, or a desktop app — the request is rejected and the client is effectively signed out.

Revoking a session is permanent and immediate. There is no grace period and no undo. The user does not need to change their password or file a support ticket. They simply point at the session they want to remove and it is gone.

If the user chooses to revoke their own current session — the very session they're using right now — they are warned that doing so will sign them out immediately. If they confirm, the session is destroyed and they are redirected to the login page. This is intentional: a user who wants to sign out of everything, including their current device, should be able to do so with confidence.

This feature works hand-in-hand with the Active Session List. Together, they give users full transparency and full control over every place they are signed in. For teams with compliance requirements, this is essential: users must be able to not only audit their sessions but act on what they find. For individual developers, it is basic security hygiene — the ability to clean up after themselves without friction.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user can revoke any of their own active sessions by session ID.
- [ ] Revoking a session immediately invalidates it — subsequent requests using the revoked session's cookie receive a 401 Unauthorized response.
- [ ] The revoked session no longer appears in the session list returned by `GET /api/user/sessions`.
- [ ] A user can revoke their current session (the session they are using to make the request), which effectively signs them out.
- [ ] When the current session is revoked via the Web UI, the user is redirected to the login page.
- [ ] A user cannot revoke sessions belonging to other users. Attempting to revoke another user's session returns a 404 Not Found (not 403, to avoid session ID enumeration).
- [ ] Attempting to revoke a session that does not exist returns a 404 Not Found.
- [ ] Attempting to revoke a session that has already been revoked returns a 404 Not Found (idempotent from the caller's perspective).
- [ ] Attempting to revoke a session using an invalid session ID format (non-UUID) returns a 404 Not Found.
- [ ] The revocation endpoint returns 204 No Content on success with no response body.
- [ ] The feature is accessible from the Web UI (Settings → Sessions), CLI (`codeplane auth session revoke <id>`), and TUI (Settings/Sessions screen, `r` or `Delete` key).
- [ ] An unauthenticated request to the revocation endpoint returns a 401 Unauthorized error.
- [ ] The revocation operation is atomic — either the session is fully deleted or nothing happens.
- [ ] The feature is documented in end-user help content covering Web UI, CLI, and TUI access paths.

### Edge Cases

- [ ] Revoking the only active session (which must be the current session) succeeds, signs the user out, and results in an empty session list if the user signs in again and checks.
- [ ] Revoking a session ID that is a valid UUID but does not exist in the database returns 404.
- [ ] Revoking a session that expired between the time the user loaded the session list and the time they clicked "Revoke" returns 404 (the cleanup scheduler may have already removed it).
- [ ] If the database becomes temporarily unavailable during a revocation request, the endpoint returns a 500 Internal Server Error with a structured error payload — the session is NOT left in an inconsistent state.
- [ ] Concurrent revocation of the same session from two different clients (e.g., web and CLI simultaneously) results in one 204 and one 404 — no double-delete errors.
- [ ] Revoking a session does not affect any other sessions for the same user.
- [ ] After revoking a non-current session, the current session remains valid and the session list refreshes correctly without requiring re-authentication.
- [ ] Whitespace-padded session IDs are trimmed before validation (e.g., `"  a1b2c3d4-... "` is treated as `"a1b2c3d4-..."`).
- [ ] An empty string session ID returns an error, not a server crash.
- [ ] A session ID consisting only of whitespace returns an error.

### Boundary Constraints

- [ ] Session ID: exactly 36 characters in UUID v4 format (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`) after trimming.
- [ ] Session IDs shorter than 36 characters after trimming return 404.
- [ ] Session IDs longer than 36 characters after trimming return 404.
- [ ] Session IDs containing characters outside `[0-9a-f-]` return 404.
- [ ] The `:id` path parameter has no maximum length enforcement at the router level, but the service rejects anything that is not a valid UUID v4.
- [ ] The endpoint must respond within 500ms for a single revocation.
- [ ] The response body for a successful revocation is empty (0 bytes, status 204).

## Design

### API Shape

```
DELETE /api/user/sessions/:id
```

**Authentication:** Required. Accepts session cookie (`codeplane_session`) or personal access token (`Authorization: Bearer codeplane_*` / `Authorization: token codeplane_*`).

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | UUID v4 session key of the session to revoke. |

**Request:** No query parameters. No request body.

**Success Response (204 No Content):**

No response body. The session has been permanently deleted.

**Error Responses:**

| Status | Condition | Response Body |
|--------|-----------|---------------|
| 401 | Request is not authenticated (missing or invalid session/token). | `{ "error": "authentication required" }` |
| 404 | Session ID is invalid, does not exist, does not belong to the authenticated user, or has already been revoked. | `{ "error": "session not found" }` |
| 429 | Rate limit exceeded. | `{ "error": "rate limit exceeded" }` with `Retry-After` header. |
| 500 | Internal server error (database unavailable, unexpected failure). | `{ "error": "internal server error" }` |

**Important design decisions:**

- 404 is returned for both "session doesn't exist" and "session belongs to another user" to prevent session ID enumeration attacks.
- The endpoint uses DELETE semantics, not POST, because it is removing a specific identified resource.
- The endpoint is scoped to the authenticated user — there is no admin override on this path.

### SDK Shape

The `UserService` exposes:

```typescript
interface UserService {
  revokeSession(userID: number, sessionKey: string): Promise<Result<void, APIError>>;
}
```

**Behavior:**

1. Trims the `sessionKey` input.
2. Validates that the trimmed value is a non-empty, valid UUID v4.
3. Queries all sessions for the given `userID`.
4. Checks that the session belongs to the requesting user.
5. Deletes the session from the database.
6. Returns `Result.ok(undefined)` on success, or `Result.err(notFound(...))` if validation or ownership checks fail.

The `AuthService` exposes:

```typescript
interface AuthService {
  revokeUserSession(userId: string, sessionKey: string): Promise<void>;
}
```

The `@codeplane/ui-core` API client exposes:

```typescript
function revokeSession(sessionId: string): Promise<void>;
```

This method calls `DELETE /api/user/sessions/:id` with the current authentication context. On 204, it resolves. On any error status, it rejects with a structured error.

### Web UI Design

**Location:** Settings → Sessions (route: `/settings/sessions`)

Session revocation is part of the Sessions settings page, which also hosts the session list (see `AUTH_ACTIVE_SESSION_LIST`).

**Revoke Button:**

Each session row in the session list includes a "Revoke" button. The button is styled with destructive semantics (red text or red-outlined button). The button label is "Revoke".

**Revoking a Non-Current Session:**

1. User clicks "Revoke" on a session row where `is_current` is `false`.
2. The session row is optimistically removed from the list (or faded/disabled with a spinner).
3. The API call `DELETE /api/user/sessions/:id` is made.
4. On success (204), the row is permanently removed and a toast notification appears: "Session revoked."
5. On failure, the row is restored to its original state and an error toast appears: "Failed to revoke session. Please try again."

**Revoking the Current Session:**

1. User clicks "Revoke" on the session row marked with the "Current session" badge.
2. A confirmation dialog appears:
   - **Title:** "Revoke current session?"
   - **Body:** "You will be signed out of this device immediately. You will need to sign in again to continue."
   - **Actions:** "Cancel" (secondary button) and "Sign out" (destructive/red primary button).
3. If the user clicks "Cancel", the dialog closes and nothing happens.
4. If the user clicks "Sign out":
   a. The API call `DELETE /api/user/sessions/:id` is made.
   b. On success, the session cookie is cleared client-side and the user is redirected to `/login`.
   c. On failure, the dialog closes and an error toast appears: "Failed to revoke session. Please try again."

**Revoke All Other Sessions:**

Below the session list, if the user has more than one active session, a "Revoke all other sessions" link or button is displayed. Clicking it:

1. Shows a confirmation dialog: "This will sign out all your other devices and browsers. Your current session will not be affected."
2. On confirmation, iterates over all non-current sessions and calls `DELETE /api/user/sessions/:id` for each.
3. On completion, the list shows only the current session and a toast appears: "All other sessions revoked."

**Loading/Disabled States:**

- While a revocation request is in flight, the "Revoke" button for that session is disabled and shows a spinner.
- If the session list is in a loading or error state, revoke buttons are not interactive.

### CLI Command

```
codeplane auth session revoke <session-id>
```

**Description:** Revokes (deletes) an active session by its session ID.

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `session-id` | Yes | The UUID v4 session ID to revoke. Obtained from `codeplane auth session list`. |

**Flags:**

| Flag | Description |
|------|-------------|
| `--yes`, `-y` | Skip the confirmation prompt and proceed immediately. |

**Interactive behavior (default):**

```
Revoke session a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d? [y/N]: y
✓ Session revoked.
```

**Error cases:**

- Invalid ID format: `Error: invalid session ID format. Session IDs are UUIDs (e.g., a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d).`
- Not found: `Error: session not found.`
- Not logged in: `Error: not logged in. Run \`codeplane auth login\` first.`
- Server unreachable: `Error: unable to connect to Codeplane server at <host>.`

**Exit codes:** 0 on success, 1 on any error.

**JSON output (`--json`):** On success, empty output. On error, `{ "error": "..." }`.

### TUI UI

**Screen:** Settings → Sessions

Revocation is integrated into the session list screen:

1. User navigates to a session row using arrow keys.
2. User presses `r` or `Delete`.
3. Inline confirmation prompt appears:
   - Non-current: "Revoke this session? (y/n)"
   - Current: "Revoke current session? You will be signed out. (y/n)"
4. `y` confirms, `n`/`Escape` cancels.
5. Success: row removed, status message shown. Failure: list unchanged, error message shown.

### Neovim Plugin API

The Neovim plugin does not expose a dedicated session revocation command. Session management is performed via the CLI or Web UI.

### VS Code Extension

The VS Code extension does not expose a dedicated session revocation command. Users manage sessions via the Web UI or CLI.

### Documentation

1. **"Managing Your Active Sessions"** — extend the help article to cover revocation: how to revoke from Web UI, CLI, and TUI; what happens when you revoke the current session; the "Revoke all other sessions" action; that revocation is immediate and permanent.
2. **CLI Reference: `codeplane auth session revoke`** — command reference with usage, arguments, flags (`--yes`), output format, exit codes, and examples.
3. **Security Best Practices** — recommend revoking unrecognized sessions immediately, using "Revoke all other sessions" after suspected compromise, and periodic session pruning.

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| Revoke own session | Authenticated user (any role) |
| Revoke another user's session | Not permitted via this endpoint (returns 404) |
| Admin: revoke any user's session | Admin role (via admin panel, separate endpoint — not this feature) |

### Rate Limiting

- **`DELETE /api/user/sessions/:id`**: 30 requests per minute per authenticated user. This is more restrictive than the list endpoint (60/min) because revocation is a destructive write operation.
- The rate limit applies per-user, not per-IP, because the endpoint requires authentication.
- Rate limit responses use HTTP 429 with a `Retry-After` header.
- The "Revoke all other sessions" UI action counts as one revocation per session against the rate limit. If a user has more than 30 other sessions, some may fail. The UI should handle partial failure gracefully by retrying after the rate limit window.

### Data Privacy and PII

- The revocation request contains a session ID (UUID) in the URL path. This is not PII.
- The revocation response contains no data (204 No Content on success). No PII is exposed.
- The session ID in the URL path must be treated as potentially sensitive in server logs — only the first 8 characters should appear in structured log fields.
- The endpoint does not reveal whether a session ID belongs to a different user (returns 404 in all "not found" cases), preventing enumeration of other users' session IDs.
- Revocation does not cascade to any other user data — it only removes the session row.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.session.revoked` | User successfully revokes a session | `user_id`, `was_current_session` (boolean), `client` (web, cli, tui, api), `session_age_hours`, `remaining_sessions` |
| `auth.session.revoke_failed` | Session revocation fails (any error) | `user_id`, `error_type` (not_found, database_error, rate_limited, unauthorized), `client` |
| `auth.session.revoke_all_others` | User triggers "Revoke all other sessions" | `user_id`, `sessions_revoked_count`, `sessions_failed_count`, `client` |
| `auth.session.current_session_revoked` | User explicitly revokes their own current session | `user_id`, `client` |

### Properties Attached to Events

- `user_id`: The authenticated user's internal ID (integer).
- `was_current_session`: Boolean — `true` if the user revoked the session they were currently using.
- `client`: The access surface — one of `web`, `cli`, `tui`, or `api`.
- `session_age_hours`: Age of the revoked session in hours (`now - created_at`). Useful for understanding stale-session cleanup patterns.
- `remaining_sessions`: Active sessions remaining after revocation. 0 means the user signed themselves out entirely.
- `error_type`: For failure events, the category of error.
- `sessions_revoked_count` / `sessions_failed_count`: For bulk revocation events.

### Funnel Metrics and Success Indicators

1. **List-to-Revoke Conversion**: Percentage of `auth.session.list_viewed` events followed by `auth.session.revoked` within 5 minutes. Target: 5–15%.
2. **Current Session Revoke Rate**: Percentage of revocations where `was_current_session` is true. Should be under 10%.
3. **Revoke Error Rate**: `auth.session.revoke_failed` / total revoke attempts. Target: <1%.
4. **Bulk Revoke Adoption**: Weekly count of `auth.session.revoke_all_others` events.
5. **Session Hygiene Score**: Average `remaining_sessions` after revocation — lower trends indicate active pruning.
6. **Stale Session Cleanup**: Distribution of `session_age_hours` — revocations of old sessions indicate healthy hygiene behavior.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Session revocation requested | `DEBUG` | `user_id`, `session_id_prefix` (first 8 chars), `request_id` |
| Session revoked successfully | `INFO` | `user_id`, `session_id_prefix`, `was_current_session`, `request_id` |
| Session revocation failed: not found | `INFO` | `user_id`, `session_id_prefix`, `request_id` |
| Session revocation failed: invalid UUID | `DEBUG` | `user_id`, `request_id` |
| Session revocation failed: database error | `ERROR` | `user_id`, `session_id_prefix`, `error_message`, `error_code`, `request_id` |
| Session revocation failed: unexpected error | `ERROR` | `user_id`, `error_message`, `stack_trace_id`, `request_id` |
| Rate limit hit on session revoke endpoint | `WARN` | `user_id`, `endpoint`, `request_id` |
| Unauthorized session revoke request | `DEBUG` | `request_id`, `ip_hash` |
| Current session self-revocation | `INFO` | `user_id`, `session_id_prefix`, `request_id` |

**CRITICAL:** Full session key values must **NEVER** appear in logs. Only the first 8 characters (`session_id_prefix`) may be logged.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_auth_session_revoke_requests_total` | Counter | `status` (success, not_found, error, unauthorized, rate_limited), `client` | Total session revocation requests |
| `codeplane_auth_session_revoke_duration_seconds` | Histogram | `status` | Latency of session revoke endpoint |
| `codeplane_auth_session_revoke_errors_total` | Counter | `error_type` (database_error, timeout, unknown) | Revocation failures by error category |
| `codeplane_auth_session_revoke_rate_limit_hits_total` | Counter | — | Rate limit rejections on the revoke endpoint |
| `codeplane_auth_session_revoke_current_session_total` | Counter | — | Times users revoked their own current session |

### Alerts and Runbooks

#### Alert: `AuthSessionRevokeErrorRateHigh`
- **Condition:** `rate(codeplane_auth_session_revoke_errors_total[5m]) / rate(codeplane_auth_session_revoke_requests_total{status!="not_found"}[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check the `error_type` label distribution on `codeplane_auth_session_revoke_errors_total` to identify the dominant failure mode.
  2. If `database_error`: Check database connectivity and connection pool health. Run `SELECT 1` against the database.
  3. If `timeout`: Check `codeplane_auth_session_revoke_duration_seconds` p99. Investigate `auth_sessions` table lock contention.
  4. If `unknown`: Check application error logs for stack traces correlated by `request_id`.
  5. If persistent, consider pausing the expired session cleanup scheduler to reduce write contention.

#### Alert: `AuthSessionRevokeLatencyHigh`
- **Condition:** `histogram_quantile(0.99, rate(codeplane_auth_session_revoke_duration_seconds_bucket[5m])) > 1.0`
- **Severity:** Warning
- **Runbook:**
  1. The revocation path involves two DB operations: SELECT (ownership check) and DELETE. Profile which is slow.
  2. Verify expired session cleanup scheduler is running and the `auth_sessions` table is not excessively large.
  3. Check for lock contention between cleanup scheduler and user-initiated revocations.
  4. In PGLite/daemon mode, check local disk I/O and memory usage.
  5. Profile the application code path from route handler through service to SQL.

#### Alert: `AuthSessionRevokeSpikeDetected`
- **Condition:** `rate(codeplane_auth_session_revoke_requests_total[5m]) > 50`
- **Severity:** Info
- **Runbook:**
  1. Check if a single user is performing bulk revocations (expected for "Revoke all other sessions").
  2. If spread across users, correlate with security incident.
  3. Verify rate limits are being enforced.
  4. No action needed if correlated with a known event.

#### Alert: `AuthSessionRevokeCurrentSessionAnomalous`
- **Condition:** `rate(codeplane_auth_session_revoke_current_session_total[1h]) > 20`
- **Severity:** Info
- **Runbook:**
  1. High current-session self-revocation rate may indicate UX confusion.
  2. Check client distribution — if concentrated in web, review confirmation dialog prominence.
  3. Escalate to product team for UX review if sustained.

### Error Cases and Failure Modes

| Error Case | Behavior | HTTP Status | User-Facing Message |
|------------|----------|-------------|---------------------|
| Not authenticated | Reject with auth error | 401 | "Authentication required." |
| Session ID is empty/whitespace | Return not found | 404 | "Session not found." |
| Session ID is not a valid UUID | Return not found | 404 | "Session not found." |
| Session ID does not exist | Return not found | 404 | "Session not found." |
| Session belongs to different user | Return not found (prevents enumeration) | 404 | "Session not found." |
| Session already revoked | Return not found | 404 | "Session not found." |
| Session expired and was cleaned up | Return not found | 404 | "Session not found." |
| Database unavailable | Return error, session NOT deleted | 500 | "Unable to revoke session. Please try again." |
| Database query timeout | Return error | 500 | "Unable to revoke session. Please try again." |
| Rate limit exceeded | Reject with retry info | 429 | "Too many requests. Please wait before trying again." |

## Verification

### API Integration Tests

#### Core Revoke Functionality
- [ ] `test: DELETE /api/user/sessions/:id with valid session cookie and valid session ID returns 204`
- [ ] `test: DELETE /api/user/sessions/:id with valid PAT and valid session ID returns 204`
- [ ] `test: after revoking a session, GET /api/user/sessions no longer includes the revoked session`
- [ ] `test: after revoking a session, a request using the revoked session's cookie returns 401`
- [ ] `test: revoking the current session (the session cookie used to make the DELETE request) returns 204`
- [ ] `test: after revoking the current session, the next request using that cookie returns 401`
- [ ] `test: revoking a non-current session does not affect the current session's validity`
- [ ] `test: response body for 204 is empty (Content-Length: 0 or no body)`
- [ ] `test: response Content-Type header is not set for 204 responses`

#### Ownership and Authorization
- [ ] `test: attempting to revoke a session belonging to a different user returns 404`
- [ ] `test: attempting to revoke a session belonging to a different user does NOT delete that session`
- [ ] `test: two different users each can only revoke their own sessions`
- [ ] `test: the error response for "belongs to another user" is identical to "does not exist" (no enumeration)`

#### Authentication Requirements
- [ ] `test: DELETE /api/user/sessions/:id without any auth credentials returns 401`
- [ ] `test: DELETE /api/user/sessions/:id with an expired session cookie returns 401`
- [ ] `test: DELETE /api/user/sessions/:id with an invalid session cookie (non-UUID) returns 401`
- [ ] `test: DELETE /api/user/sessions/:id with an empty Authorization header returns 401`
- [ ] `test: DELETE /api/user/sessions/:id with a revoked PAT returns 401`

#### Invalid Session ID Handling
- [ ] `test: DELETE /api/user/sessions/ (empty ID) returns 404 or 400`
- [ ] `test: DELETE /api/user/sessions/not-a-uuid returns 404`
- [ ] `test: DELETE /api/user/sessions/12345 (too short) returns 404`
- [ ] `test: DELETE /api/user/sessions/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d-extra (too long) returns 404`
- [ ] `test: DELETE /api/user/sessions/ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ (invalid hex chars) returns 404`
- [ ] `test: DELETE /api/user/sessions/%20%20%20 (whitespace-encoded) returns 404`
- [ ] `test: DELETE /api/user/sessions/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d (valid UUID, 36 chars exactly) that does not exist returns 404`

#### Idempotency and Concurrency
- [ ] `test: revoking the same session twice returns 204 first, then 404 second`
- [ ] `test: revoking a session that was just revoked by another concurrent request returns 404`
- [ ] `test: concurrent revocations of different sessions for the same user all succeed independently`

#### Atomicity
- [ ] `test: if the user has sessions A, B, and C, revoking B leaves A and C intact`
- [ ] `test: if revocation of session B fails (simulated DB error), session B is still present in the session list`

#### Session List Integration
- [ ] `test: after revoking a session, immediately listing sessions excludes the revoked session`
- [ ] `test: revoking all sessions one by one results in an empty list (when listing from a PAT)`
- [ ] `test: revoking a session and then creating a new session shows only the new session`

#### Rate Limiting
- [ ] `test: 30 revocation requests within 1 minute from the same user succeed`
- [ ] `test: 31st revocation request within 1 minute from the same user returns 429`
- [ ] `test: 429 response includes Retry-After header`
- [ ] `test: after waiting for the rate limit window to reset, revocation requests succeed again`
- [ ] `test: rate limit for revocation is independent of rate limit for listing`

#### Response Schema Validation
- [ ] `test: 404 response body is valid JSON with an "error" field`
- [ ] `test: 401 response body is valid JSON with an "error" field`
- [ ] `test: 404 response does not leak session metadata (no created_at, expires_at, user_id)`

#### Maximum Input Boundary
- [ ] `test: session ID of exactly 36 characters (valid UUID) is accepted and processed correctly`
- [ ] `test: session ID of 37 characters (UUID + one extra char) is rejected with 404`
- [ ] `test: session ID of 1000 characters is rejected with 404 (not a server error)`
- [ ] `test: session ID of 10,000 characters is rejected gracefully (no crash, returns 404 or 414)`

### End-to-End (E2E) Tests — Playwright

- [ ] `e2e: clicking "Revoke" on a non-current session row removes it from the session list`
- [ ] `e2e: after revoking a non-current session, a success toast "Session revoked." appears`
- [ ] `e2e: the revoked session's row is no longer visible in the DOM after revocation`
- [ ] `e2e: clicking "Revoke" on the current session shows a confirmation dialog`
- [ ] `e2e: confirmation dialog title reads "Revoke current session?"`
- [ ] `e2e: confirmation dialog has "Cancel" and "Sign out" buttons`
- [ ] `e2e: clicking "Cancel" in the confirmation dialog closes the dialog without revoking`
- [ ] `e2e: after clicking "Cancel", the current session row is unchanged`
- [ ] `e2e: clicking "Sign out" in the confirmation dialog revokes the session and redirects to /login`
- [ ] `e2e: after being redirected to /login, navigating to /settings/sessions returns 401 or redirects to /login`
- [ ] `e2e: the "Revoke" button is disabled (spinner shown) while the revocation request is in flight`
- [ ] `e2e: if the revocation API returns an error, an error toast appears and the session row is restored`
- [ ] `e2e: "Revoke all other sessions" button is visible when user has more than one session`
- [ ] `e2e: "Revoke all other sessions" button is NOT visible when user has only one session`
- [ ] `e2e: clicking "Revoke all other sessions" shows a confirmation dialog`
- [ ] `e2e: confirming "Revoke all other sessions" removes all non-current sessions from the list`
- [ ] `e2e: after "Revoke all other sessions", only the current session remains in the list`
- [ ] `e2e: session list on the Settings → Sessions page is accessible from the sidebar navigation`
- [ ] `e2e: multiple rapid clicks on "Revoke" do not send duplicate API requests`

### CLI Integration Tests

- [ ] `cli: codeplane auth session revoke <valid-id> returns exit code 0 and prints success message`
- [ ] `cli: codeplane auth session revoke <valid-id> --yes skips confirmation and revokes immediately`
- [ ] `cli: codeplane auth session revoke <valid-id> without --yes prompts for confirmation`
- [ ] `cli: codeplane auth session revoke <valid-id> with "n" at confirmation prompt does NOT revoke the session`
- [ ] `cli: codeplane auth session revoke <non-existent-uuid> prints "session not found" and exits with code 1`
- [ ] `cli: codeplane auth session revoke <invalid-format> prints "invalid session ID format" and exits with code 1`
- [ ] `cli: codeplane auth session revoke (no argument) prints usage help and exits with code 1`
- [ ] `cli: codeplane auth session revoke <id> when not authenticated prints auth error and exits with code 1`
- [ ] `cli: codeplane auth session revoke <id> when server is unreachable prints connection error and exits with code 1`
- [ ] `cli: codeplane auth session revoke <id> --json on error outputs valid JSON error object`
- [ ] `cli: after revoking a session, codeplane auth session list no longer shows the revoked session`
- [ ] `cli: revoking the same session twice prints success first, then "session not found" second`

### TUI Integration Tests

- [ ] `tui: pressing 'r' on a highlighted non-current session shows revocation confirmation prompt`
- [ ] `tui: pressing 'Delete' on a highlighted non-current session shows revocation confirmation prompt`
- [ ] `tui: pressing 'y' at the confirmation prompt revokes the session and removes it from the list`
- [ ] `tui: pressing 'n' at the confirmation prompt cancels and returns to the session list`
- [ ] `tui: pressing 'Escape' at the confirmation prompt cancels and returns to the session list`
- [ ] `tui: revoking the current session shows a warning message including "You will be signed out"`
- [ ] `tui: after successfully revoking a session, a status message "Session revoked." appears`
- [ ] `tui: after a failed revocation, a status message "Failed to revoke session." appears`
- [ ] `tui: the session list correctly updates after revocation (revoked session disappears)`

### Security-Focused Tests

- [ ] `security: revoking a session for user A using user B's credentials returns 404, not 403`
- [ ] `security: the 404 response when revoking another user's session is byte-identical to the 404 for a non-existent session`
- [ ] `security: the revoke endpoint does not accept a user ID as a query/body parameter (always scoped to authenticated user)`
- [ ] `security: the revoke endpoint is not accessible via CORS preflight from an unauthorized origin`
- [ ] `security: after revocation, the session cookie value is fully invalidated — not just marked inactive`
- [ ] `security: server logs after a revocation do not contain the full session key (only first 8 chars)`
- [ ] `security: rate limiting prevents brute-force session ID guessing (429 after 30 attempts/min)`

# AUTH_ACTIVE_SESSION_LIST

Specification for AUTH_ACTIVE_SESSION_LIST.

## High-Level User POV

When you use Codeplane across multiple devices — your work laptop's browser, a personal machine's CLI, an editor integration, or the desktop app — each sign-in creates an independent session. The active session list gives you a single, authoritative view of every device and context where your account is currently signed in, so you always know exactly where you are authenticated and can act immediately if something looks wrong.

From the web UI's Settings > Sessions page, or by running `codeplane auth sessions` in the CLI, you see a clear summary of each session: a short identifier (the first eight characters of the session UUID), when the session was created, and when it will expire. The session you are currently using is visually distinguished so you can tell at a glance which entry corresponds to "this device." No sensitive information like full session keys or internal user IDs is ever exposed — only enough to identify and manage each session.

This view is the starting point for session hygiene. From the list, you can identify sessions you do not recognize and revoke them. You can spot sessions on devices you no longer use and clean them up. If you suspect your account may have been compromised, the list gives you the information you need to find and revoke the suspicious session immediately without affecting your other active sessions.

The session list is strictly private to you. No other user can see your sessions through this endpoint. Admin users have a separate admin panel path for session management — the user-facing list is always scoped to the authenticated user's own sessions only.

The feature works across all product surfaces: the API returns a consistent JSON response, the web UI renders a polished session management table, the CLI provides both human-readable and structured JSON output, and the TUI exposes a session management screen. Regardless of which surface you use, you see the same data and can take the same actions.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can retrieve a complete, accurate, and consistently ordered list of all their active (non-expired) sessions across all product surfaces (API, Web UI, CLI), with each session showing its identifier, creation time, and expiration time, with the current session clearly identified, and with all edge cases handled predictably.

### Functional Criteria

- [ ] An authenticated user can list all of their active sessions via `GET /api/user/sessions`.
- [ ] The response is a JSON array of session summary objects, ordered by `created_at` descending (newest first).
- [ ] Each session summary includes: `id` (the session UUID), `created_at` (ISO 8601 timestamp), and `expires_at` (ISO 8601 timestamp).
- [ ] The full session key is used as the `id` field (it is a UUID, not a secret token — it is only meaningful when combined with the cookie transport).
- [ ] The list reflects the current state: a session created moments ago appears immediately; a session revoked or expired moments ago does not appear.
- [ ] The list is scoped exclusively to the authenticated user's sessions. A user cannot see another user's sessions.
- [ ] If the user has zero active sessions (edge case: authenticating via PAT while having no cookie sessions), the endpoint returns an empty array `[]` with status `200`.
- [ ] Sessions that have passed their `expires_at` timestamp do not appear in the list.
- [ ] The current session (identified by matching the requesting session's key) should be identifiable by the client for UI annotation purposes.
- [ ] Both session cookie authentication and PAT-based authentication can be used to retrieve the session list.

### Edge Cases

- [ ] Unauthenticated request (no token, no session): returns `401 Unauthorized`.
- [ ] Request authenticated with a PAT that has been revoked between issuance and this request: returns `401 Unauthorized`.
- [ ] Request authenticated with a PAT whose owning user has `prohibit_login = true`: returns `401 Unauthorized`.
- [ ] Request authenticated with a valid session cookie (browser): returns the session list normally.
- [ ] Request authenticated with a valid PAT (no active cookie sessions): returns empty array `[]` with `200` if the user has no cookie sessions.
- [ ] User with exactly one session (the current one): returns an array with one element.
- [ ] User signs in from 10 different browsers/devices simultaneously: all 10 sessions appear in the list.
- [ ] User with sessions that have various expiration times: all non-expired sessions appear; expired ones do not.
- [ ] Concurrent list requests from multiple sessions of the same user: all return consistent snapshots; no partial results.
- [ ] Session created via GitHub OAuth and session created via key-based auth: both appear in the list with no distinction in shape (auth method is not exposed).
- [ ] Session ID is a valid UUID v4 format: always 36 characters including hyphens.
- [ ] Request with a malformed `Authorization` header (e.g., `Bearer not-a-token`): returns `401 Unauthorized`.
- [ ] User revokes a session, then immediately lists sessions: the revoked session does not appear.
- [ ] The background cleanup scheduler removes expired sessions: those sessions do not appear even before a manual list refresh.

### Boundary Constraints

- [ ] `id` in response: UUID v4 string, exactly 36 characters, matching the regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`.
- [ ] `created_at`: ISO 8601 string, always non-null, always a valid timestamp.
- [ ] `expires_at`: ISO 8601 string, always non-null, always a valid timestamp, always in the future relative to the session's inclusion in the list.
- [ ] Response content-type: `application/json`.
- [ ] Response body: JSON array (not wrapped in an envelope object). Zero or more elements.
- [ ] No upper bound on the number of sessions returned (the endpoint returns all active sessions for the user without pagination).
- [ ] Session IDs in the response are the actual `session_key` UUIDs from the database.

## Design

### API Shape

#### List Sessions

```
GET /api/user/sessions
Authorization: Bearer codeplane_<token>
```

Or authenticated via `codeplane_session` cookie (browser context).

Response `200 OK`:

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "created_at": "2026-03-20T12:00:00Z",
    "expires_at": "2026-04-19T12:00:00Z"
  },
  {
    "id": "f9e8d7c6-b5a4-3210-fedc-ba9876543210",
    "created_at": "2026-03-15T08:30:00Z",
    "expires_at": "2026-04-14T08:30:00Z"
  }
]
```

Response `200 OK` (empty list):

```json
[]
```

Response `401 Unauthorized`:

```json
{
  "error": "unauthorized",
  "message": "authentication required"
}
```

**Notes:**
- The array is ordered by `created_at` descending (newest first).
- The `session_key` is exposed as `id`. While this is the actual session identifier, it is not a bearer credential — it is meaningful only when set as a cookie by the server. Exposure here is equivalent to what GitHub and similar forges provide.
- Internal fields (`user_id`, `username`, `is_admin`, `data`, `updated_at`) are never present in any response element.
- This endpoint does not support pagination parameters today. If pagination is added in the future, the non-paginated form must remain backward-compatible.
- Both `Bearer` and `token` authorization schemes are accepted (case-insensitive scheme matching).
- Session cookie authentication is also accepted (browser context).

### SDK Shape

The SDK exposes session listing through both the `UserService` and `AuthService`:

- `UserService.listSessions(userId: number)` -> `Result<SessionResponse[], APIError>`
- `AuthService.listUserSessions(userId: string)` -> `Promise<SessionRow[]>`

The `SessionResponse` interface:

```typescript
interface SessionResponse {
  id: string;          // session_key UUID
  created_at: string;  // ISO 8601
  expires_at: string;  // ISO 8601
}
```

The `UserService.listSessions` method maps the raw database rows to the `SessionResponse` shape, converting `sessionKey` to `id` and formatting timestamps as ISO 8601 strings.

### CLI Command

```bash
codeplane auth sessions
```

**Default output (human-readable table):**

```
ID                                     CREATED           EXPIRES
a1b2c3d4-e5f6-7890-abcd-ef1234567890  2 hours ago       in 29 days
f9e8d7c6-b5a4-3210-fedc-ba9876543210  5 days ago        in 25 days
```

**Structured JSON output (`--json`):**

```bash
codeplane auth sessions --json
```

Returns the raw API response array.

**Behavior details:**
- Requires authentication. If no token is available (env var, keyring, or config), exits with a non-zero code and a message directing the user to `codeplane auth login`.
- When no sessions exist, outputs a message: "No active sessions found."
- When no sessions exist in JSON mode, outputs `[]`.
- Timestamps in the human-readable table use relative formatting ("2 hours ago") for `created_at` and relative future formatting ("in 29 days") for `expires_at`.
- The `--json` flag outputs the raw JSON array for programmatic consumption and piping.
- Exit code 0 on success (including empty list), non-zero on auth or network errors.
- The `--json` flag supports field filtering: `codeplane auth sessions --json id,created_at`.

### Web UI Design

**Route:** `/settings/sessions`

**Session list table:**

| Column | Content | Format |
|--------|---------|--------|
| Session ID | First 8 characters of `id` | Monospace font, `a1b2c3d4` style, with "Current" badge on the active session |
| Created | `created_at` | Relative time ("2 hours ago") |
| Expires | `expires_at` | Relative time ("in 29 days") |
| Actions | Revoke button | Red/destructive style button labeled "Revoke" |

**Current session indicator:**
- The session matching the authenticated user's current session cookie is annotated with a green "Current" badge next to the session ID.
- The "Revoke" button for the current session is labeled "Sign out" and triggers a logout flow (calls `POST /api/auth/logout`) instead of the session revocation endpoint.

**Table behaviors:**
- Sorted by `created_at` descending (newest first), matching the API order.
- No client-side sorting controls (order matches the API contract).
- The table updates after session revocation without a full page reload.

**Empty state:**
- When the user has no sessions (authenticated via PAT), display a centered message: "No active browser sessions."
- A brief explanation: "Browser sessions are created when you sign in via GitHub OAuth or key-based authentication. CLI and API access uses personal access tokens."

**Loading state:**
- Show a skeleton/placeholder table while the session list is loading.

**Error state:**
- If the API returns an error, display an inline error banner with a retry button.

**Revocation confirmation:**
- Revoking a non-current session shows a confirmation dialog: "Revoke this session? The device using this session will be signed out immediately."
- Revoking the current session (clicking "Sign out") shows a confirmation dialog: "Sign out? You will need to sign in again on this device."

### TUI UI

The TUI should expose a session management screen accessible from the settings or account area:

- Displays a list of active sessions with ID (first 8 chars), Created (relative), Expires (relative).
- Current session is highlighted or badged.
- Supports revoke action via keyboard shortcut or selection.
- Navigation via arrow keys and enter.

### Editor Integrations (VS Code, Neovim)

Editor integrations do not provide session listing UI. Session management is handled through the CLI or web UI. Editors consume stored tokens transparently for authentication.

### Documentation

The following end-user documentation should exist:

1. **"Managing Active Sessions"** — A guide covering how to view your active sessions (web UI walkthrough with screenshots and CLI `codeplane auth sessions` examples), what each field means (session ID, created, expires), how to identify and revoke suspicious sessions, and how the list relates to sign-in and logout flows.

2. **"Session Lifecycle"** — Explains that sessions are created when you sign in via OAuth or key-based auth, have a default 30-day lifetime, and are automatically cleaned up after expiration. Documents the distinction between browser sessions (cookie-based) and CLI/API tokens.

3. **"API Reference: GET /api/user/sessions"** — OpenAPI-style documentation for the list endpoint including request headers, response schema, status codes, and example responses.

## Permissions & Security

### Authorization Roles

| Operation | Required Role |
|-----------|---------------|
| List own sessions via API | Authenticated user (any role) — requires valid session or PAT |
| List own sessions via CLI | Authenticated user (any role) — requires token in env/keyring/config |
| List own sessions via Web UI | Authenticated user (any role) — requires active session |
| List another user's sessions | Not permitted. No user-facing endpoint exists. |
| Admin: view/revoke any session | Admin role (via admin panel — separate endpoint, not this feature) |

### Scope Enforcement

- The `GET /api/user/sessions` endpoint does not currently enforce scope restrictions beyond requiring authentication.
- Session cookie authentication (browser) is not scope-gated — session auth implies full user-level access.
- PAT-based authentication is accepted regardless of scope (listing your own sessions is a fundamental account operation).

### Rate Limiting

- Rate-limited by authenticated user ID: `user:{userId}`.
- Limit: **60 requests per minute per user** (standard read tier).
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included on every response.
- Exceeding the limit returns `429 Too Many Requests` with `Retry-After`.
- Failed authentication attempts are rate-limited by IP address: `ip:{clientIp}`.

### Data Privacy Constraints

- The response includes the session UUID as the `id`. This is an opaque identifier, not a bearer credential — knowing the UUID does not allow an attacker to hijack the session (the session cookie is transported via `HttpOnly` cookie, not via the session ID alone).
- Internal fields (`user_id`, `username`, `is_admin`, `data`) are never exposed in the response.
- The endpoint is strictly user-scoped. No API path, admin override (via this endpoint), or service-level call exposes one user's sessions to another user.
- Server logs for this endpoint must not log the full session IDs in the response body. Log only counts or truncated identifiers.
- The `Authorization` header used to authenticate the request must be redacted in all log output.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.session_list_viewed` | User retrieves their session list | `user_id`, `session_count` (number of sessions returned), `client` (web/cli/api/tui), `has_expiring_soon` (bool — true if any session expires within 48 hours), `oldest_session_age_days` (age of the oldest session in the list) |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Session list view frequency** | Number of session list views per active user per week | Indicates engagement with session lifecycle management |
| **List-to-revoke conversion** | % of session list views followed by a session revocation within the same user session | > 0 indicates users actively managing sessions |
| **Multi-session rate** | % of session list views that return > 1 session | Indicates multi-device usage patterns |
| **Empty list rate** | % of session list views that return zero sessions | Should be very low unless PAT-only users are common |
| **Surface distribution** | Breakdown of session list views by `client` (web vs cli vs tui vs direct api) | Indicates which surfaces users prefer for session management |
| **Session age distribution** | Histogram of session ages at time of list view | Indicates whether users check sessions early or only after extended periods |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Session list request received | `debug` | `user_id`, `request_id`, `client_ip` | Entry point log for correlation |
| Session list returned successfully | `debug` | `user_id`, `session_count`, `request_id`, `latency_ms` | Success with count for monitoring |
| Session list failed — auth required | `warn` | `client_ip`, `request_id`, `user_agent` | Unauthenticated access attempt |
| Session list failed — internal error | `error` | `user_id`, `request_id`, `error_message`, `stack_trace` | Database or service layer failure |
| Session list failed — rate limited | `warn` | `user_id`, `request_id`, `rate_limit_key`, `retry_after_seconds` | Abuse or misconfigured client |

**CRITICAL:** Full session key values (UUIDs) must NOT be logged. Only the first 8 characters (prefix) may be logged for correlation purposes.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_session_list_requests_total` | Counter | `status` (200/401/429/500) | Total session list API requests by response status |
| `codeplane_user_session_list_duration_seconds` | Histogram | `status` | Request-to-response latency for session list endpoint |
| `codeplane_user_session_list_count` | Histogram | — | Distribution of session counts per list response (how many sessions does a typical user have?) |
| `codeplane_auth_sessions_active` | Gauge | — | Total number of non-expired sessions across all users (system-wide) |

### Alerts

#### Alert: Session List Endpoint Error Rate

- **Condition**: `rate(codeplane_user_session_list_requests_total{status="500"}[5m]) / rate(codeplane_user_session_list_requests_total[5m]) > 0.05` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check server error logs for the `/api/user/sessions` endpoint — look for database connection failures or query errors.
  2. Verify database health: connection pool saturation, query latency on `auth_sessions` table, table locks.
  3. Check if a recent deployment introduced a regression in the `listSessions` service method or the route handler.
  4. If the `auth_sessions` table is unexpectedly large, verify that the `user_id` index is healthy and that the expired session cleanup scheduler is running.
  5. If database is healthy, check for service registry initialization failures or dependency injection issues.

#### Alert: Session List Latency Spike

- **Condition**: `histogram_quantile(0.99, rate(codeplane_user_session_list_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query performance for `SELECT ... FROM auth_sessions WHERE user_id = $1 ORDER BY created_at DESC`.
  2. Verify the `auth_sessions(user_id)` index exists and is not bloated.
  3. Check if expired session cleanup is running — a large number of expired rows can slow the query if they are not being purged.
  4. Check overall database CPU/IO load — this endpoint's query should be very fast under normal conditions.
  5. Run `EXPLAIN ANALYZE` on the session listing query in production to identify index misses or sequential scans.

#### Alert: Elevated 401 Rate on Session List Endpoint

- **Condition**: `rate(codeplane_user_session_list_requests_total{status="401"}[5m]) > 50` sustained for 10 minutes.
- **Severity**: Informational
- **Runbook**:
  1. This may indicate a client misconfiguration where expired or revoked sessions/tokens are being used to poll the session list.
  2. Check client IP distribution — if concentrated, may be a single misconfigured automation or browser extension.
  3. Check if a batch session revocation or cleanup happened recently that left clients holding stale cookies.
  4. No immediate action required unless the rate is abnormally high or correlated with other auth anomalies.

#### Alert: Anomalously High Session Count Per User

- **Condition**: `histogram_quantile(0.99, codeplane_user_session_list_count) > 50` sustained for 30 minutes.
- **Severity**: Warning
- **Runbook**:
  1. A user having > 50 active sessions is unusual and may indicate a bot or misconfigured automation repeatedly signing in without reusing sessions.
  2. Query the `auth_sessions` table for users with high session counts: `SELECT user_id, COUNT(*) FROM auth_sessions WHERE expires_at > NOW() GROUP BY user_id HAVING COUNT(*) > 50`.
  3. If the user is legitimate, no action is needed — but consider adding a per-user session limit as a future improvement.
  4. If the user appears to be a bot, consider rate-limiting their sign-in endpoint or contacting the user.

### Error Cases and Failure Modes

| Failure Mode | Impact | Behavior |
|-------------|--------|----------|
| Database unavailable | User cannot list sessions | `500 Internal Server Error`; logged at `error` level |
| Database query timeout | User sees a slow or failed request | `500` after timeout; logged with latency |
| Auth middleware failure | Request treated as unauthenticated | `401 Unauthorized`; logged at `warn` level |
| User deleted between auth and list | Edge case race condition | Auth succeeds (token/session still valid briefly), but list query returns empty or fails; returns empty list or `500` depending on service behavior |
| Rate limit exceeded | User gets a throttle response | `429 Too Many Requests` with `Retry-After` header |
| Network timeout (client-side) | CLI/UI shows timeout error | Clients should display a retry prompt; no server-side impact |
| Expired session cleanup lag | Expired sessions may briefly appear in the list | Sessions past `expires_at` should be filtered at query or service level; cleanup scheduler provides eventual consistency |
| Corrupted session data in DB | Session may have invalid timestamps | Service layer should handle gracefully; malformed entries returned as-is with ISO 8601 conversion |

## Verification

### API Integration Tests

- [ ] **List sessions — authenticated with session cookie**: Authenticated browser session calls `GET /api/user/sessions` -> `200` with array of session summaries.
- [ ] **List sessions — authenticated with PAT**: `Authorization: Bearer codeplane_<valid-token>` -> `200`.
- [ ] **List sessions — authenticated with `token` scheme**: `Authorization: token codeplane_<valid-token>` -> `200`.
- [ ] **List sessions — case-insensitive auth scheme**: `Authorization: BEARER codeplane_<valid-token>` -> `200`.
- [ ] **List sessions — unauthenticated**: No `Authorization` header, no session -> `401`.
- [ ] **List sessions — revoked PAT**: Use a token that has been revoked -> `401`.
- [ ] **List sessions — deactivated user's PAT**: PAT belonging to a deactivated user -> `401`.
- [ ] **List sessions — suspended user (prohibit_login=true)**: PAT belonging to a user with `prohibit_login = true` -> `401`.
- [ ] **List sessions — empty list**: User authenticated via PAT who has no active cookie sessions -> `200` with `[]`.
- [ ] **List sessions — response shape**: Each item has exactly `id`, `created_at`, and `expires_at`. No extra fields.
- [ ] **List sessions — no internal fields in response**: Verify no item contains `user_id`, `username`, `is_admin`, `data`, or `updated_at` fields.
- [ ] **List sessions — ordering**: Create sessions A (first), B (second), C (third) -> list returns `[C, B, A]` (newest first).
- [ ] **List sessions — id is valid UUID**: Every `id` matches `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`.
- [ ] **List sessions — created_at is present and non-null**: Every session has a `created_at` ISO 8601 timestamp.
- [ ] **List sessions — expires_at is present and non-null**: Every session has an `expires_at` ISO 8601 timestamp.
- [ ] **List sessions — expires_at is in the future**: Every listed session's `expires_at` is after the current time.
- [ ] **List sessions — user isolation**: User A creates sessions, User B lists sessions -> User B does not see User A's sessions.
- [ ] **List sessions — after revocation**: Create session, revoke it via `DELETE /api/user/sessions/:id`, list sessions -> revoked session does not appear.
- [ ] **List sessions — after logout**: Sign in (creating a session), log out via `POST /api/auth/logout`, list sessions from another session -> logged-out session does not appear.
- [ ] **List sessions — multiple concurrent sessions**: Sign in from 5 different contexts -> list returns all 5 sessions.
- [ ] **List sessions — 20 sessions (no truncation)**: Create 20 sessions -> list returns all 20 sessions without pagination or truncation.
- [ ] **List sessions — concurrent list requests**: Send 10 concurrent `GET /api/user/sessions` requests -> all return `200` with consistent results.
- [ ] **List sessions — rate limit headers present**: Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- [ ] **List sessions — rate limit exhaustion**: Exceed the rate limit for the user -> `429 Too Many Requests` with `Retry-After`.
- [ ] **List sessions — response content-type**: Response `Content-Type` header is `application/json`.
- [ ] **List sessions — expired sessions excluded**: Create a session with a very short duration (if testable), wait for expiration, list -> expired session does not appear.
- [ ] **List sessions — session created via key-based auth appears**: Complete key-based auth flow -> list sessions -> new session appears.
- [ ] **List sessions — session created via GitHub OAuth appears**: Complete GitHub OAuth flow -> list sessions -> new session appears.
- [ ] **List sessions — current session appears**: Authenticate with a session cookie, list sessions -> the current session's ID appears in the list.
- [ ] **List sessions — revoke one of multiple sessions**: Create 3 sessions, revoke 1 -> list returns exactly 2.
- [ ] **List sessions — response body is a JSON array**: Response parses as a JSON array, not an object wrapper.
- [ ] **List sessions — empty array response is valid JSON**: Response for user with no sessions parses as `[]`.

### CLI E2E Tests

- [ ] **`codeplane auth sessions` returns sessions**: Sign in first, then run `codeplane auth sessions` -> output contains session information.
- [ ] **`codeplane auth sessions --json` returns valid JSON array**: Output parses as a JSON array with expected fields.
- [ ] **`codeplane auth sessions --json` has correct fields**: Each item in JSON output has `id`, `created_at`, `expires_at`. No `user_id` or `is_admin` field.
- [ ] **`codeplane auth sessions` with no auth fails**: Run without a stored token or `CODEPLANE_TOKEN` -> non-zero exit code with message directing to `codeplane auth login`.
- [ ] **`codeplane auth sessions` shows empty state**: User with no cookie sessions (PAT-only auth) -> output shows a helpful message (non-JSON mode) or empty array (JSON mode).
- [ ] **`codeplane auth sessions --json` after create/revoke round-trip**: Sign in (creating session), verify it appears in list, revoke it, verify it does not appear in list.
- [ ] **`codeplane auth sessions` with `CODEPLANE_TOKEN` env var**: Set env var to a valid token -> list succeeds.
- [ ] **`codeplane auth sessions --json` field values match API**: JSON output from CLI matches the API response schema exactly (same field names, same types).
- [ ] **`codeplane auth sessions` exit code 0 on success**: Command exits with code 0 when the list is returned, even if the list is empty.
- [ ] **`codeplane auth sessions` table output format**: Human-readable output includes column headers: ID, CREATED, EXPIRES.
- [ ] **`codeplane auth sessions --json` field filtering**: `codeplane auth sessions --json id,created_at` returns only the specified fields.
- [ ] **`codeplane auth sessions` relative time formatting**: Created column shows relative time ("2 hours ago"), Expires column shows relative future time ("in 29 days").

### Playwright (Web UI) E2E Tests

- [ ] **Navigate to Settings > Sessions**: Authenticated user navigates to `/settings/sessions` -> sees the session list page.
- [ ] **Session list displays correct columns**: Table has columns for Session ID, Created, Expires, and Actions.
- [ ] **Session list shows current session**: The session used by the current browser is annotated with a "Current" badge.
- [ ] **Session list shows multiple sessions**: User signed in from multiple contexts -> all sessions appear in the list.
- [ ] **Session list shows relative timestamps**: `created_at` is displayed as relative time ("2 hours ago"), `expires_at` as relative future time ("in 29 days").
- [ ] **Session list shows monospace ID**: The session ID column renders in a monospace font with truncated ID (first 8 chars).
- [ ] **Empty state renders correctly**: User with no sessions (edge case) sees an appropriate empty state message.
- [ ] **Session list updates after revocation**: Revoke a non-current session from the list -> the session disappears from the table without a full page reload.
- [ ] **Revoke current session triggers logout**: Clicking "Sign out" on the current session logs the user out and redirects to the login page.
- [ ] **Revoke confirmation dialog**: Clicking "Revoke" on a non-current session shows a confirmation dialog before proceeding.
- [ ] **Session list loading state**: Navigating to the page shows a loading skeleton before data arrives.
- [ ] **Session list error state**: Simulate an API error -> an error banner with a retry button is displayed.
- [ ] **Session list with many sessions**: User with 10+ sessions -> all sessions render correctly.
- [ ] **Session list does not expose internal fields**: No element on the page displays `user_id`, `username`, `is_admin`, or raw internal data.

### Security-Focused Tests

- [ ] **Internal fields never in response body**: Intercept API response for `GET /api/user/sessions` -> no field named `user_id`, `username`, `is_admin`, `data`, or `updated_at` exists in any element.
- [ ] **Cross-user session isolation**: User A signs in creating sessions; User B authenticates and calls `GET /api/user/sessions` -> none of User A's sessions appear.
- [ ] **Session list not accessible via query-string auth**: `GET /api/user/sessions?token=codeplane_<valid>` -> treated as unauthenticated (`401`).
- [ ] **Session cookie HttpOnly prevents JS access**: The `codeplane_session` cookie is not accessible via `document.cookie` in a browser context.
- [ ] **Revoked session immediately rejected**: After revoking a session via the list, use that session's cookie for an API call -> `401 Unauthorized`.
- [ ] **No PII in session response**: The response contains only `id` (UUID), `created_at`, and `expires_at` — no email, IP address, user agent, or other PII.
- [ ] **Authorization header redacted in logs**: After making a session list request, search server logs -> the `Authorization` header value does not appear.

# INTEGRATION_LINEAR_LIST

Specification for INTEGRATION_LINEAR_LIST.

## High-Level User POV

When a Codeplane user has connected one or more Linear teams to Codeplane repositories, they need a way to see all of their active and inactive Linear integrations in one place. The "list integrations" feature provides this at-a-glance inventory across every product surface — the web UI, CLI, and TUI.

From the user's perspective, they navigate to the Integrations page in the Codeplane web UI and immediately see a list of all Linear integrations they have configured. Each integration card shows the Linear team name and team key, the Codeplane repository it is bound to, whether the integration is currently active or paused, and when the last successful sync occurred. This makes it easy to audit which repositories are connected, which syncs are healthy, and which integrations may need attention.

From the CLI, a user runs `codeplane extension linear list` and receives a structured list of their integrations, suitable for both human reading and machine consumption with `--json` filtering. This is useful for automation scripts, CI/CD pipelines, and agent-driven workflows that need to verify integration state before performing operations.

The feature provides value by giving users confidence that their Linear-to-Codeplane connections are correctly set up and healthy. Without this visibility, users would have to check each repository individually or rely on sync failures to discover broken integrations. The list serves as the central dashboard for managing the lifecycle of Linear integrations — from here, users can navigate to remove an integration, trigger a sync, or connect a new team.

If the user has no integrations, the page displays an empty state with a clear call-to-action to connect their first Linear team. If the user is not authenticated, they are prompted to sign in before the integration list can be retrieved.

## Acceptance Criteria

- **Authentication required**: The user must be authenticated with a valid Codeplane session or PAT before the integration list can be retrieved. Unauthenticated requests must receive a `401 Unauthorized` response with body `{ "error": "authentication required" }`.
- **User-scoped isolation**: A user must only see integrations they personally created. Integrations created by other users — even for the same organization or repository — must not appear in the response.
- **All integration states returned**: The response must include both active (`is_active: true`) and inactive (`is_active: false`) integrations. There is no implicit filter on status.
- **Ordered by creation date**: Integrations must be returned in reverse chronological order (newest first), sorted by `created_at DESC`.
- **No sensitive data in response**: The response must never include `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`, or `webhook_secret`. These fields must be stripped by the service layer before returning to the client.
- **Empty array for no integrations**: When the user has zero integrations, the response must be an empty JSON array `[]` with status `200`, not `404` or any other error status.
- **Feature flag gating**: The endpoint must only be active when the `INTEGRATION_LINEAR_LIST` feature flag is enabled. When disabled, the endpoint must return `404 Not Found` or not be mounted.
- **Response payload shape**: Each integration object in the array must contain exactly these fields: `id` (string), `linear_team_id` (string), `linear_team_name` (string), `linear_team_key` (string), `codeplane_repo_id` (string), `codeplane_repo_owner` (string), `codeplane_repo_name` (string), `org_id` (string | null), `linear_actor_id` (string), `is_active` (boolean), `last_sync_at` (ISO-8601 string | null), `created_at` (ISO-8601 string), `updated_at` (ISO-8601 string).
- **No pagination required (initial)**: The current design returns all integrations for a user in a single response. Given the expected cardinality (low tens per user), pagination is not required in the initial implementation but should be designed to be additive later.
- **Maximum expected integrations per user**: The system should behave correctly with up to 500 integrations per user. Beyond 500, the server should still return a valid response (not error), but performance degradation is acceptable.
- **String field constraints**: `linear_team_name` may be up to 255 characters. `linear_team_key` may be up to 10 characters (Linear's constraint). `codeplane_repo_owner` and `codeplane_repo_name` follow Codeplane's repository naming constraints (1-100 characters, alphanumeric plus hyphens/underscores/dots).
- **Timestamp format**: All timestamp fields must be serialized as ISO-8601 UTC strings (e.g., `"2026-03-22T14:30:00.000Z"`).
- **Null handling**: `org_id` and `last_sync_at` may be `null`. They must be serialized as JSON `null`, not omitted or empty strings.
- **Idempotent GET**: The endpoint must be safe and idempotent — calling it multiple times must produce the same result with no side effects.
- **Concurrent request safety**: Multiple simultaneous list requests from the same user must not interfere with each other or produce partial results.
- **Graceful degradation on database errors**: If the database query fails, the endpoint must return `500 Internal Server Error` with a structured error payload. It must not return a partial list.

### Definition of Done
- The `GET /api/integrations/linear` endpoint is implemented with the `linearService.listIntegrations` service method fully wired (not a stub).
- The endpoint is gated behind the `INTEGRATION_LINEAR_LIST` feature flag.
- The service layer strips all encrypted/sensitive fields before returning.
- The CLI `codeplane extension linear list` command correctly calls and displays the response.
- The web UI Integrations page renders the list with proper empty state, active/inactive indicators, and last-sync timestamps.
- All error cases return structured JSON error responses.
- Integration, E2E, and CLI tests pass with near-100% confidence.
- Documentation for listing integrations is published.

## Design

### API Shape

**Endpoint**: `GET /api/integrations/linear`

**Request**:
- Method: `GET`
- Authentication: Session cookie or PAT-based `Authorization` header (required)
- No request body or query parameters

**Success Response** (200):
```json
[
  {
    "id": "42",
    "linear_team_id": "abc123-def456",
    "linear_team_name": "Engineering",
    "linear_team_key": "ENG",
    "codeplane_repo_id": "17",
    "codeplane_repo_owner": "acme-corp",
    "codeplane_repo_name": "main-app",
    "org_id": "5",
    "linear_actor_id": "usr_lin_789",
    "is_active": true,
    "last_sync_at": "2026-03-21T08:00:00.000Z",
    "created_at": "2026-03-01T10:30:00.000Z",
    "updated_at": "2026-03-21T08:00:00.000Z"
  },
  {
    "id": "38",
    "linear_team_id": "xyz789-uvw012",
    "linear_team_name": "Design",
    "linear_team_key": "DES",
    "codeplane_repo_id": "22",
    "codeplane_repo_owner": "acme-corp",
    "codeplane_repo_name": "design-system",
    "org_id": "5",
    "linear_actor_id": "usr_lin_789",
    "is_active": false,
    "last_sync_at": null,
    "created_at": "2026-02-15T14:20:00.000Z",
    "updated_at": "2026-03-10T09:00:00.000Z"
  }
]
```

**Empty Response** (200):
```json
[]
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | User not authenticated | `{ "error": "authentication required" }` |
| 404 | Feature flag disabled | Not found / not mounted |
| 500 | Database error or service failure | `{ "error": "internal server error" }` |

**Response Field Descriptions**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique integration identifier |
| `linear_team_id` | string | The Linear team UUID this integration syncs with |
| `linear_team_name` | string | Display name of the Linear team (e.g., "Engineering") |
| `linear_team_key` | string | Short Linear team key prefix (e.g., "ENG") |
| `codeplane_repo_id` | string | Codeplane repository ID the integration is bound to |
| `codeplane_repo_owner` | string | Repository owner (user or org) |
| `codeplane_repo_name` | string | Repository name |
| `org_id` | string \| null | Codeplane organization ID, if the integration is org-scoped |
| `linear_actor_id` | string | Linear user ID used for loop-guard attribution |
| `is_active` | boolean | Whether the integration is currently syncing |
| `last_sync_at` | string \| null | ISO-8601 timestamp of last successful sync, or null if never synced |
| `created_at` | string | ISO-8601 timestamp when integration was created |
| `updated_at` | string | ISO-8601 timestamp of last modification |

### SDK Shape

The `linearService.listIntegrations(userId)` method in the service layer must:

1. Call `listLinearIntegrationsByUser(sql, { userId })` from the generated SQL layer.
2. Map each row to the public response shape, explicitly omitting `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`, and `webhook_secret`.
3. Serialize `Date` fields to ISO-8601 strings.
4. Return `[]` if no rows match.

### Web UI Design

The Linear integrations list is displayed on the Integrations page (`/integrations/linear`).

**List View**:
- Each integration is rendered as a card or table row with:
  - **Linear team badge**: Team name and team key (e.g., "Engineering (ENG)").
  - **Codeplane repository link**: `owner/repo` as a clickable link to the repository.
  - **Status indicator**: Green dot/badge for active, gray dot/badge for inactive.
  - **Last synced**: Human-readable relative time (e.g., "2 hours ago") with exact timestamp in tooltip. Shows "Never synced" if `last_sync_at` is null.
  - **Actions**: Kebab/overflow menu with "Trigger Sync", "Disable"/"Enable", and "Remove" actions.
- The list is sorted by creation date (newest first), matching the API order.
- If the API returns an empty array, show an empty state illustration with the heading "No Linear integrations" and a "Connect Linear" call-to-action button.
- While the API request is in flight, show skeleton loading placeholders for 3 rows.
- If the API returns an error, show an error banner with a "Retry" button.

**Header Area**:
- Page title: "Linear Integrations".
- "Connect Linear" primary action button (links to the OAuth start flow).
- Integration count badge (e.g., "3 integrations").

### CLI Command

**Command**: `codeplane extension linear list`

**Behavior**:
- Sends `GET /api/integrations/linear` using the CLI's API client.
- Default output: Human-readable table with columns: `ID`, `TEAM`, `KEY`, `REPOSITORY`, `ACTIVE`, `LAST SYNC`.
- With `--json`: Raw JSON array from the API response.
- With `--json .id`: Filtered JSON output extracting only the `id` field from each integration.
- If no integrations exist, the table output shows a message: "No Linear integrations found. Run `codeplane extension linear install` or visit the web UI to connect Linear."
- If authentication fails, shows the standard CLI auth error message directing the user to `codeplane auth login`.

**Example Output (table)**:
```
ID   TEAM          KEY   REPOSITORY              ACTIVE   LAST SYNC
42   Engineering   ENG   acme-corp/main-app      yes      2 hours ago
38   Design        DES   acme-corp/design-system  no       never
```

### TUI UI

The TUI does not currently have a dedicated Linear integrations screen. When a TUI-level integrations view is implemented (tracked under `INTEGRATION_LINEAR_UI`), the list should be rendered as a navigable list with the same information as the web UI cards. For this feature, no TUI changes are required.

### Documentation

1. **Managing Linear Integrations** — A guide section explaining how to view all configured Linear integrations from the web UI and CLI, including screenshots of the list view and example CLI output.
2. **CLI Reference: `codeplane extension linear list`** — Command reference with usage, output format, JSON filtering examples, and common error troubleshooting.
3. **Integration Status Guide** — Explanation of the `is_active` and `last_sync_at` fields: what "active" vs "inactive" means, how to interpret "never synced", and when to take corrective action.

## Permissions & Security

### Authorization Roles

| Role | Can list Linear integrations? | Notes |
|------|-------------------------------|-------|
| Owner | Yes | Sees only their own integrations |
| Admin | Yes | Sees only their own integrations |
| Member | Yes | Sees only their own integrations |
| Read-Only | Yes | Sees only their own integrations (integration creation requires higher privileges, but listing what you created is always allowed) |
| Anonymous / Unauthenticated | No | Returns 401 |

**Important**: The list endpoint is strictly user-scoped. Even organization admins cannot see integrations created by other users through this endpoint. This is a privacy-by-default design. Organization-wide integration auditing is a separate future capability.

### Rate Limiting

- **Per-user rate limit**: Maximum 60 requests per user per minute (1 req/sec sustained). This is a read-only list endpoint, so the limit is generous.
- **Global rate limit**: Maximum 600 requests per minute across all users.
- **Rate limit response**: `429 Too Many Requests` with a `Retry-After` header and structured JSON error body `{ "error": "rate limit exceeded" }`.
- **Burst allowance**: Up to 10 requests in a 1-second window per user before rate limiting engages.

### Data Privacy & PII

- **Encrypted tokens never returned**: `access_token_encrypted`, `refresh_token_encrypted`, and `webhook_secret` must never appear in the API response. The service layer must strip them before serialization.
- **Token expiry not returned**: `token_expires_at` is omitted from the response to avoid leaking OAuth token lifecycle details.
- **Linear actor ID**: The `linear_actor_id` is a Linear-internal UUID. It is not PII by itself but correlates to a Linear user. It is included in the response because the user created the integration and already knows their own Linear identity.
- **Server logs**: The response body must not be logged at any level. Only the count of integrations returned should be logged (at DEBUG level).
- **No cross-user enumeration**: The endpoint must not reveal the existence or count of integrations belonging to other users, even through timing side-channels.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `LinearIntegrationListViewed` | User successfully retrieves their integration list | `user_id`, `integration_count`, `active_count`, `inactive_count`, `timestamp`, `client` (`web`, `cli`, `tui`, `api`) |
| `LinearIntegrationListEmpty` | User retrieves an empty integration list | `user_id`, `timestamp`, `client` |
| `LinearIntegrationListFailed` | Service layer throws during list retrieval | `user_id`, `error_type`, `timestamp`, `client` |
| `LinearIntegrationListUnauthenticated` | Unauthenticated request hits the endpoint | `timestamp`, `request_ip` (hashed) |
| `LinearIntegrationListRateLimited` | User is rate-limited on the list endpoint | `user_id`, `timestamp`, `retry_after_seconds` |

### Funnel Metrics

The list endpoint sits in the middle of the integration lifecycle funnel:

1. **OAuth Start** → `LinearOAuthStartInitiated`
2. **OAuth Callback** → `LinearOAuthCallbackCompleted`
3. **Setup Resolution** → `LinearOAuthSetupResolved`
4. **Integration Created** → `LinearIntegrationCreated`
5. **Integration List Viewed** → `LinearIntegrationListViewed` ← this feature
6. **Sync Triggered** → `LinearSyncTriggered`
7. **Integration Deleted** → `LinearIntegrationDeleted`

**Key success indicators**:

- **List view frequency**: Average number of `LinearIntegrationListViewed` events per active user per week. Higher frequency indicates users are actively managing integrations. Target: >2 views/user/week for users with at least one integration.
- **Empty-to-connected conversion**: Percentage of `LinearIntegrationListEmpty` events that are followed by a `LinearOAuthStartInitiated` event within 24 hours. Indicates the empty state CTA is effective. Target: >30%.
- **List-to-action rate**: Percentage of `LinearIntegrationListViewed` events followed by a sync, delete, or new integration action within the same session. Target: >15%.
- **Error rate**: Percentage of `LinearIntegrationListFailed` events relative to total list attempts. Target: <0.1%.
- **Client distribution**: Breakdown of `client` property across events. Healthy distribution shows web, CLI, and programmatic API usage.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Integration list retrieved | `INFO` | `user_id`, `request_id`, `integration_count` | Successful response returned |
| Integration list empty | `DEBUG` | `user_id`, `request_id` | Zero integrations returned (not an error, but useful for debugging) |
| Integration list failed | `ERROR` | `user_id`, `request_id`, `error_message`, `error_type`, `stack_trace` | Service or database layer throws |
| Integration list unauthorized | `WARN` | `request_id`, `remote_addr` | Unauthenticated request |
| Integration list rate limited | `WARN` | `user_id`, `request_id`, `rate_limit_key`, `retry_after` | Rate limit hit |
| Integration list db query duration | `DEBUG` | `user_id`, `request_id`, `duration_ms`, `row_count` | Database query completed (for performance profiling) |
| Feature flag check | `DEBUG` | `flag_name`, `flag_value`, `user_id` | Feature flag evaluated |

**Log rules**:
- Never log the response body (contains integration identifiers and team names).
- Never log encrypted tokens or webhook secrets at any level.
- Always include `request_id` for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_linear_integration_list_total` | Counter | `status` (`success`, `empty`, `error`, `unauthorized`, `rate_limited`) | Total list requests by outcome |
| `codeplane_linear_integration_list_duration_seconds` | Histogram | — | End-to-end request duration from handler entry to response |
| `codeplane_linear_integration_list_db_duration_seconds` | Histogram | — | Database query duration only |
| `codeplane_linear_integration_list_count` | Histogram | — | Number of integrations returned per successful request (measures data volume) |

### Alerts

#### Alert: `LinearIntegrationListErrorRateHigh`
- **Condition**: `rate(codeplane_linear_integration_list_total{status="error"}[5m]) / rate(codeplane_linear_integration_list_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `integration list failed` entries filtered by the alert window. Look for `error_type` and `error_message`.
  2. Verify database connectivity. Run `SELECT 1` against the primary database to confirm it is reachable.
  3. Check if `linear_integrations` table is locked or experiencing contention. Run `SELECT * FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%linear_integrations%'`.
  4. Check recent deployments for regressions in the `listIntegrations` service method or the `listLinearIntegrationsByUser` SQL wrapper.
  5. If the error is transient (e.g., brief connection pool exhaustion), monitor for auto-recovery within 5 minutes.
  6. If persistent, escalate to the integrations team with the error log entries and query plan.

#### Alert: `LinearIntegrationListLatencyHigh`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_linear_integration_list_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. The list endpoint should respond in <200ms at p99 under normal conditions (simple indexed query by `user_id`).
  2. Check `codeplane_linear_integration_list_db_duration_seconds` to isolate whether latency is in the database or application layer.
  3. If database latency is high, check `EXPLAIN ANALYZE` for the `ListLinearIntegrationsByUser` query. Verify the `user_id` column has an index.
  4. Check if a specific user has an unusually large number of integrations (>100) that could slow serialization.
  5. Check server resource utilization (CPU, memory, event loop lag, connection pool saturation).
  6. If isolated to one user, consider adding pagination. If systemic, investigate database performance.

#### Alert: `LinearIntegrationListRateLimitSpiking`
- **Condition**: `rate(codeplane_linear_integration_list_total{status="rate_limited"}[5m]) > 30`
- **Severity**: Info
- **Runbook**:
  1. Identify user(s) triggering rate limits from structured logs (filter by `rate_limit_key`).
  2. Determine if the traffic is from a legitimate polling script (e.g., CI pipeline checking integration state) or abuse.
  3. If legitimate automation, advise the user to reduce polling frequency or use webhook-based notifications instead.
  4. If abuse, consider temporary IP-based blocks or account suspension.
  5. Review whether the per-user rate limit (60/min) is too restrictive for valid use cases.

### Error Cases & Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Log Level |
|-------------|-------------|---------------------|--------------------|
| User not authenticated | 401 | `"authentication required"` | WARN |
| Feature flag disabled | 404 | Not found | — |
| Database connection failure | 500 | `"internal server error"` | ERROR: full connection error |
| Database query timeout | 500 | `"internal server error"` | ERROR: timeout details |
| Service method throws unexpected exception | 500 | `"internal server error"` | ERROR: full stack trace |
| Rate limit exceeded | 429 | `"rate limit exceeded"` | WARN |
| Serialization error (malformed date, unexpected null) | 500 | `"internal server error"` | ERROR: serialization details |

## Verification

### API Integration Tests

1. **Authenticated user with integrations receives 200 with array**: Create 2 integrations for a test user. Send `GET /api/integrations/linear` with valid session. Assert status `200`. Assert body is a JSON array with length 2.

2. **Response objects contain all expected public fields**: For each integration in the response, assert presence of: `id`, `linear_team_id`, `linear_team_name`, `linear_team_key`, `codeplane_repo_id`, `codeplane_repo_owner`, `codeplane_repo_name`, `org_id`, `linear_actor_id`, `is_active`, `last_sync_at`, `created_at`, `updated_at`.

3. **Response objects do NOT contain sensitive fields**: For each integration in the response, assert absence of: `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`, `webhook_secret`, `user_id`.

4. **Empty list returns 200 with empty array**: Create a user with no integrations. Send `GET /api/integrations/linear`. Assert status `200`. Assert body is `[]`.

5. **Integrations ordered by created_at DESC (newest first)**: Create 3 integrations with known timestamps. Assert first item in response has the most recent `created_at`, last item has the oldest.

6. **User isolation — cannot see other users' integrations**: Create integrations for User A and User B. Authenticate as User A. Assert response only contains User A's integrations. Assert none of User B's integration IDs appear.

7. **Both active and inactive integrations returned**: Create one active and one inactive integration. Assert both appear in the response. Assert `is_active` values are `true` and `false` respectively.

8. **Null fields serialized correctly**: Create an integration with `org_id = null` and `last_sync_at = null`. Assert response contains `"org_id": null` and `"last_sync_at": null` (not omitted, not empty string).

9. **Timestamps in ISO-8601 format**: Assert all `created_at`, `updated_at`, and non-null `last_sync_at` fields match ISO-8601 pattern (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/`).

10. **Unauthenticated user receives 401**: Send `GET /api/integrations/linear` without session or authorization. Assert status `401`. Assert body contains `"authentication required"`. Assert response is not an array.

11. **Expired PAT receives 401**: Send request with an expired/revoked PAT in `Authorization` header. Assert `401`.

12. **Valid PAT authentication works**: Send request with a valid PAT. Assert `200` and valid integration list.

13. **Feature flag disabled returns 404**: Disable `INTEGRATION_LINEAR_LIST` flag. Send authenticated request. Assert `404`.

14. **Idempotent — repeated calls return same result**: Send the same `GET` request 3 times with same session. Assert all 3 responses are identical.

15. **Large number of integrations (100) returns correctly**: Create 100 integrations for a single user. Assert response contains exactly 100 items. Assert response returns within 2 seconds.

16. **Maximum expected scale (500 integrations) returns correctly**: Create 500 integrations for a single user. Assert response contains exactly 500 items. Assert HTTP status is `200`.

17. **Rate limiting enforced per user**: Send 61 requests rapidly with the same session within 1 minute. Assert the 61st returns `429` with `Retry-After` header.

18. **Rate limiting does not cross users**: Send 60 requests with User A. Send 1 request with User B within the same minute. Assert User B gets `200`.

19. **Database error returns 500 with structured error**: Simulate a database failure (e.g., kill DB connection). Send request. Assert status `500`. Assert body contains `{ "error": "internal server error" }`. Assert body does NOT contain stack traces or SQL.

20. **Concurrent requests from same user do not interfere**: Send 5 simultaneous `GET /api/integrations/linear` requests for the same user. Assert all 5 return identical `200` responses.

21. **Integration with maximum-length team name (255 chars) appears correctly**: Create an integration with a 255-character `linear_team_name`. Assert it appears in the list with the full name.

22. **Integration with special characters in team name**: Create an integration with `linear_team_name` containing Unicode, emoji, and special characters (e.g., `"Ünïcödé Team 🚀 & <Friends>"`). Assert it appears correctly in the response without escaping corruption.

23. **Content-Type header is application/json**: Assert the `Content-Type` response header is `application/json` (or `application/json; charset=utf-8`).

24. **GET request has no side effects**: Count rows in `linear_integrations`, `linear_sync_ops`, and `linear_issue_map` before and after the request. Assert all counts are unchanged.

25. **Newly created integration appears immediately in list**: Create a new integration via `POST /api/integrations/linear`. Immediately call `GET /api/integrations/linear`. Assert the new integration appears in the response.

26. **Deleted integration disappears immediately from list**: Delete an integration via `DELETE /api/integrations/linear/:id`. Immediately call `GET /api/integrations/linear`. Assert the deleted integration does not appear.

### E2E Tests (Playwright)

27. **Integration list page loads with integrations**: Sign in as a user with 2 configured Linear integrations. Navigate to `/integrations/linear`. Assert 2 integration cards/rows are visible. Assert each shows team name, repository link, and status indicator.

28. **Empty state shown when no integrations exist**: Sign in as a user with no integrations. Navigate to `/integrations/linear`. Assert the empty state illustration and "Connect Linear" CTA button are visible. Assert no integration cards/rows are rendered.

29. **Active integration shows green status indicator**: Assert an active integration card displays a green dot/badge and the text "Active" or equivalent.

30. **Inactive integration shows gray status indicator**: Assert an inactive integration card displays a gray dot/badge and the text "Inactive" or equivalent.

31. **Last sync time displayed as relative time**: Assert an integration with a recent `last_sync_at` shows relative text like "2 hours ago". Hover over it and assert the tooltip shows the exact ISO timestamp.

32. **Never-synced integration shows "Never synced"**: Assert an integration with `last_sync_at: null` displays "Never synced" or equivalent.

33. **Repository link navigates to repository page**: Click the `owner/repo` link on an integration card. Assert navigation to `/:owner/:repo`.

34. **Connect Linear button visible when integrations exist**: Assert the "Connect Linear" button is visible in the header area even when integrations already exist.

35. **Loading skeleton shown while fetching**: Intercept the API request to add a delay. Assert skeleton placeholders are visible before the response arrives.

36. **Error state shown on API failure**: Intercept the API request and return a 500 error. Assert an error banner is displayed with a "Retry" button. Click "Retry" and assert the request is re-sent.

37. **Page requires authentication**: Navigate to `/integrations/linear` without signing in. Assert redirect to login page or auth-required message.

### CLI Tests

38. **`codeplane extension linear list` returns table output**: Set up 2 integrations. Run `codeplane extension linear list`. Assert stdout contains a table with columns ID, TEAM, KEY, REPOSITORY, ACTIVE, LAST SYNC. Assert 2 data rows are present.

39. **`codeplane extension linear list --json` returns raw JSON**: Run `codeplane extension linear list --json`. Assert stdout is valid JSON. Assert it parses to an array.

40. **`codeplane extension linear list` with no integrations shows empty message**: Run with a user with no integrations. Assert stdout contains "No Linear integrations found".

41. **`codeplane extension linear list` without auth shows error**: Run without a valid session/token. Assert stderr contains an authentication error. Assert exit code is non-zero.

42. **`codeplane extension linear list --json .id` filters output**: Run with JSON field filter. Assert output contains only integration IDs.

43. **CLI list reflects newly created integration**: Run `codeplane extension linear install ...` then `codeplane extension linear list`. Assert the new integration appears in the list output.

44. **CLI list reflects deleted integration**: Run `codeplane extension linear remove <id>` then `codeplane extension linear list`. Assert the removed integration no longer appears.

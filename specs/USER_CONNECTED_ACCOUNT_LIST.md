# USER_CONNECTED_ACCOUNT_LIST

Specification for USER_CONNECTED_ACCOUNT_LIST.

## High-Level User POV

When you sign into Codeplane, you may link your account to one or more external identity providers — currently GitHub, with the architecture supporting additional providers in the future. These linked services are called "connected accounts." They represent the bridge between your Codeplane identity and the third-party services you used to sign in or that you connected after initial account creation.

The **connected accounts list** is your single view of every external provider currently linked to your Codeplane account. You access it from your account settings under the "Connected Accounts" section, and it shows you at a glance which providers are connected, which external username or identity is associated with each provider, and when the connection was originally established.

This view gives you confidence and control over your identity. If you signed up with GitHub OAuth, you can see that GitHub is connected and confirm the correct external identity is linked. If you ever need to disconnect a provider — for example, because you changed GitHub accounts or want to reduce the number of external systems that can access your Codeplane account — the connected accounts list is where you start. Each entry shows enough information to identify the external account without exposing sensitive tokens or credentials.

The connected accounts list is strictly private. Only you can see your own connected accounts. No other user, administrator, or anonymous visitor can enumerate which external providers are linked to your account through this endpoint.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user can retrieve a complete list of all external OAuth accounts linked to their Codeplane account.
- [ ] The list is returned as a JSON array, even when the user has zero connected accounts (empty array) or exactly one.
- [ ] Each connected account entry includes: a numeric identifier, the provider name (e.g., `"github"`), the external provider user ID, and timestamps for when the connection was created and last updated.
- [ ] Connected accounts are sorted by `id` ascending (stable insertion order).
- [ ] An unauthenticated request receives a `401 Unauthorized` response and no connected account data is leaked.
- [ ] The response payload does not include sensitive internal-only fields (e.g., `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `profile_data`, `user_id`).
- [ ] The feature works identically whether the user authenticates via session cookie or personal access token.

### Edge Cases

- [ ] A user who signed up via key-based authentication and has never linked an OAuth provider receives an empty array `[]` — not `null`, not an error.
- [ ] A user who signed up via GitHub OAuth sees exactly one connected account entry with `provider: "github"`.
- [ ] A user who linked GitHub, disconnected it (via `USER_CONNECTED_ACCOUNT_REMOVE`), and then re-linked sees exactly one entry for GitHub (the re-linked one), not two.
- [ ] If a user has connected accounts from multiple providers (future state), all are listed in `id` ascending order.
- [ ] Concurrent calls to the connected accounts list endpoint return consistent, identical results.
- [ ] If the `provider_user_id` from the external provider is a very long string (up to 255 characters), it is returned in full without truncation.

### Boundary Constraints

- [ ] The maximum number of connected accounts a single user may have is bounded by the number of supported providers. The endpoint does not paginate, as the list is expected to remain very small (typically 1–5 entries).
- [ ] The `id` field is a positive integer.
- [ ] The `provider` field is a non-empty string, maximum 50 characters, lowercase alphanumeric and hyphens only.
- [ ] The `provider_user_id` field is a non-empty string, maximum 255 characters.
- [ ] The `created_at` field is a valid ISO 8601 datetime string in UTC.
- [ ] The `updated_at` field is a valid ISO 8601 datetime string in UTC.
- [ ] The `updated_at` timestamp is always greater than or equal to the `created_at` timestamp.

## Design

### API Shape

**Endpoint:** `GET /api/user/connections`

**Authentication:** Required. Session cookie or `Authorization: token <PAT>` header.

**Request:** No query parameters. No request body.

**Success Response:** `200 OK`

```json
[
  {
    "id": 42,
    "provider": "github",
    "provider_user_id": "12345678",
    "created_at": "2025-03-10T08:22:15.000Z",
    "updated_at": "2025-03-10T08:22:15.000Z"
  }
]
```

**Empty list response:** `200 OK`

```json
[]
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `401` | Missing or invalid authentication | `{ "message": "authentication required" }` |
| `500` | Unexpected server error | `{ "message": "internal server error" }` |

**Response field contract:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Unique numeric identifier for this connected account record. |
| `provider` | `string` | Name of the external OAuth provider (e.g., `"github"`). |
| `provider_user_id` | `string` | The user's identifier on the external provider (e.g., GitHub numeric user ID as a string). |
| `created_at` | `string` | ISO 8601 UTC timestamp of when the account was initially connected. |
| `updated_at` | `string` | ISO 8601 UTC timestamp of the last update to this connection record (e.g., token refresh, re-link). |

**Fields explicitly excluded from the response:**

| Excluded Field | Reason |
|----------------|--------|
| `access_token_encrypted` | Sensitive credential — must never be exposed to clients. |
| `refresh_token_encrypted` | Sensitive credential — must never be exposed to clients. |
| `expires_at` | Internal token lifecycle detail — not useful to end users. |
| `profile_data` | Internal provider profile cache — not part of the public contract. |
| `user_id` | Internal foreign key — the user already knows their own identity. |

### SDK Shape

The shared SDK exposes `UserService.listConnectedAccounts(userID)` which:

- Accepts a numeric user ID.
- Returns `Result<ConnectedAccountResponse[], APIError>`.
- Delegates to the `listUserOAuthAccounts` database function.
- Maps database rows to the `ConnectedAccountResponse` interface, converting `Date` objects to ISO 8601 strings and internal numeric IDs to the `number` type.
- Does not accept pagination parameters (returns all connected accounts for the user).
- Filters out all sensitive fields (`access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `profile_data`) before returning.

### CLI Command

Connected accounts are listed via the generic API command:

```bash
codeplane api /api/user/connections
```

**Output:** JSON array printed to stdout. Exit code `0` on success, non-zero on error.

**Structured output filtering** applies: users can pipe through `--json` field filters per standard CLI behavior.

Example with filtering:

```bash
codeplane api /api/user/connections --json provider
```

A future dedicated `codeplane auth connections list` subcommand may be added, but the current product surface is the generic `api` command.

### Web UI Design

The connected accounts list is rendered in the **User Settings → Connected Accounts** page (`USER_CONNECTED_ACCOUNTS_UI`).

**Layout:**

- Page title: "Connected accounts"
- Subtitle/description text: "External services linked to your Codeplane account. You can disconnect a service at any time."
- Each connected account is displayed as a card or row containing:
  - A **provider icon** (e.g., the GitHub logo/octocat) alongside the provider name in title case (e.g., "GitHub").
  - The **external identity**: the `provider_user_id`, displayed in a secondary text style. If the provider is GitHub, this should be labeled "GitHub User ID" or show the GitHub username if available from the provider profile.
  - The **connection date**, shown in a human-friendly relative format (e.g., "Connected Mar 10, 2025").
  - A **Disconnect** button (rendered as a destructive/red action) — this triggers the sibling `USER_CONNECTED_ACCOUNT_REMOVE` feature, but the list view must render the correct state for it to attach to.
- When the list is empty (no providers connected), a placeholder state should display:
  - Heading: "No connected accounts"
  - Body text: "Link an external account to enable quick sign-in and identity verification."
  - A call-to-action button to connect GitHub (or other supported providers).
- The list loads on page mount and shows a skeleton/loading state while the API call is in flight.
- Errors display an inline error banner (e.g., "Failed to load connected accounts. Please try again.") with a Retry button.

**Visual hierarchy:**

- Connected providers should be visually distinct cards with clear provider branding.
- The Disconnect action should require a confirmation dialog before executing (handled by the remove feature).
- If only one authentication method remains (e.g., the user signed up via GitHub OAuth and has no password or key-auth), the Disconnect button should either be disabled or show a warning tooltip explaining that disconnecting would leave the account inaccessible.

### TUI UI

The TUI does not currently have a dedicated connected accounts management screen. The connected accounts list is accessible via the generic API flow. If a TUI connected accounts screen is added in the future, it should mirror the web UI layout adapted for terminal rendering:

- Tabular format: `PROVIDER | EXTERNAL ID | CONNECTED`
- Row per connected account.
- Empty state: "No connected accounts."

### Documentation

End-user documentation should cover:

- **"Managing your connected accounts"** guide explaining:
  - How to view your connected accounts from the web settings page.
  - How to view your connected accounts from the CLI using `codeplane api /api/user/connections`.
  - What a "connected account" represents (an external OAuth provider linked to your Codeplane identity).
  - Which providers are currently supported (GitHub).
  - That disconnecting a provider does not delete your Codeplane account, but may prevent sign-in via that provider.
  - The difference between a connected account and an OAuth2 application (the former is your identity link; the latter is a third-party app you authorize).
- **API reference** for `GET /api/user/connections` documenting the request, authentication requirements, response schema, excluded fields, and error codes.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Authenticated user (self)** | Full access to their own connected accounts list |
| **Other authenticated user** | Cannot access another user's connected accounts list |
| **Organization admin** | Cannot access a member's connected accounts through this endpoint |
| **Site admin** | Cannot access a user's connected accounts through this endpoint (admin audit surfaces are separate) |
| **Anonymous / unauthenticated** | 401 Unauthorized |

The endpoint is strictly self-scoped. The user ID is derived from the authenticated session context, not from a URL parameter. There is no path-based user targeting, which eliminates IDOR risk by design.

### Rate Limiting

- **Authenticated users:** Subject to the standard authenticated rate limit (5,000 requests/hour).
- **Unauthenticated callers:** Subject to the standard unauthenticated rate limit (60 requests/hour) — they will hit 401 before meaningful data is returned, but the rate limit still applies to prevent auth-probing floods.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in every response.
- Exceeding the rate limit returns `429 Too Many Requests`.

### Data Privacy & PII

- Provider user IDs may be considered pseudonymous identifiers. The endpoint must **never** return connected account data belonging to a different user.
- Encrypted access tokens and refresh tokens must **never** appear in the response. The service layer explicitly excludes `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, and `profile_data` from the response mapping.
- Server logs must **not** log `provider_user_id` values at INFO level or below. Connected account list access may be logged at DEBUG level with the Codeplane `user_id`, but the external provider IDs should be omitted or redacted in production log configurations.
- The endpoint must be excluded from any public API caching layer (e.g., CDN). The response must include `Cache-Control: no-store` or equivalent.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `UserConnectedAccountsListed` | Successful `GET /api/user/connections` returning 200 | `user_id`, `account_count`, `providers` (array of distinct provider names), `client` (web/cli/tui/api) |

### Funnel Metrics

- **Connected accounts settings visit rate:** Percentage of active users who visit the connected accounts settings page at least once per month. Indicates discoverability.
- **Provider distribution:** Breakdown of connected account providers across the user base (e.g., 95% GitHub, 5% other). Informs investment in additional provider integrations.
- **Connected account density:** Histogram of how many connected accounts users typically have (0, 1, 2+). If most users have 0, it suggests the OAuth linking flow is underused or most users prefer key-based auth.
- **Disconnection funnel:** Percentage of users who view the connected accounts list and subsequently disconnect a provider within the same session. High rates may indicate a confusing or unwanted linking experience.

### Success Indicators

- The endpoint has a p99 latency under 100ms.
- Zero occurrences of cross-user connected account data leakage (verified via audit log and test).
- Zero occurrences of sensitive fields (`access_token_encrypted`, `refresh_token_encrypted`) appearing in any API response.
- The connected accounts settings page is visited by at least 5% of users who signed in via OAuth within 60 days of account creation (indicating discoverability).

## Observability

### Logging

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Connected accounts list requested | `DEBUG` | `user_id`, `request_id` | Do **not** log provider user IDs. |
| Connected accounts list returned | `DEBUG` | `user_id`, `account_count`, `request_id` | Count only, no PII or external IDs. |
| Connected accounts list failed (service error) | `ERROR` | `user_id`, `request_id`, `error_code`, `error_message` | Include error details for debugging. |
| Auth failure on connected accounts endpoint | `WARN` | `request_id`, `source_ip` | Potential probe attempt. |
| Connected accounts query slow (>200ms) | `WARN` | `user_id`, `request_id`, `duration_ms` | Unexpected for a bounded-list query. |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_connections_list_total` | Counter | `status` (200, 401, 429, 500) | Total number of connected accounts list requests by response status. |
| `codeplane_user_connections_list_duration_seconds` | Histogram | — | Request duration histogram for the connected accounts list endpoint. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_user_connected_accounts_count` | Gauge | `provider` | Number of connected accounts across all users, segmented by provider. Updated periodically via background job, not per-request. |

### Alerts

#### Alert: `UserConnectionsListHighErrorRate`

**Condition:** `rate(codeplane_user_connections_list_total{status="500"}[5m]) / rate(codeplane_user_connections_list_total[5m]) > 0.05`

**Severity:** Warning

**Runbook:**
1. Check the server error logs filtered by `request_id` for the failing requests.
2. Verify database connectivity — the connected accounts list query is a simple `SELECT ... WHERE user_id = $1 ORDER BY id ASC`; failures here usually indicate a database connection issue.
3. Check if the `oauth_accounts` table is accessible and not locked by a migration.
4. If the error is transient (e.g., connection pool exhaustion), monitor for 5 more minutes. If it persists, restart the server process and investigate connection pool settings.
5. Check for recent deployments that may have introduced a regression in the `listConnectedAccounts` service method or the `listUserOAuthAccounts` database function.
6. Escalate to the database team if the issue is upstream of the application.

#### Alert: `UserConnectionsListHighLatency`

**Condition:** `histogram_quantile(0.99, rate(codeplane_user_connections_list_duration_seconds_bucket[5m])) > 0.5`

**Severity:** Warning

**Runbook:**
1. Check database query latency for the `listUserOAuthAccounts` query. Run `EXPLAIN ANALYZE` against `SELECT ... FROM oauth_accounts WHERE user_id = $1 ORDER BY id ASC`.
2. Verify that the index on `oauth_accounts(user_id)` exists and is not bloated.
3. Check for table bloat or vacuum backlog on the `oauth_accounts` table.
4. If latency is only elevated for specific users, check if any user has an unusually large number of OAuth account records (should be very unlikely given the bounded provider set).
5. If the issue is systemic, check overall database load and connection pool saturation.

#### Alert: `UserConnectionsListAuthFailureSpike`

**Condition:** `rate(codeplane_user_connections_list_total{status="401"}[5m]) > 50`

**Severity:** Info

**Runbook:**
1. This may indicate a credential-stuffing or enumeration attempt targeting the connections endpoint.
2. Check the source IP distribution in logs for auth failure entries on this endpoint.
3. If concentrated from a small number of IPs, consider temporary IP-level rate limiting or blocking.
4. Verify that legitimate clients (web UI, CLI) are not misconfigured and sending expired tokens.
5. No immediate action required unless the rate exceeds 500/5m, in which case escalate to security.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | User Impact | Recovery |
|-------|-------------|-------|-------------|----------|
| Unauthenticated | 401 | Missing/expired/invalid token or session | User sees login prompt or CLI error | Re-authenticate |
| Database unavailable | 500 | DB connection failure | User sees error message; list cannot load | Automatic retry on next request; server health check should catch this |
| Query timeout | 500 | Slow query or DB overload | User sees error message | Retry; investigate if persistent |
| Rate limited | 429 | Too many requests in window | User sees rate limit error with retry-after | Wait and retry after the reset window |
| Corrupted OAuth row | 500 | Null/malformed data in a provider or provider_user_id column | Partial or empty list returned; error logged | Database investigation and manual data repair |

## Verification

### API Integration Tests

| # | Test | Expected Result |
|---|------|------------------|
| 1 | `GET /api/user/connections` with valid PAT for a user who signed in via GitHub | `200` with JSON array containing at least 1 element; each element has `id` (number), `provider` (string), `provider_user_id` (string), `created_at` (string), `updated_at` (string) |
| 2 | `GET /api/user/connections` with no auth header | `401` with error message; response body contains no connected account data |
| 3 | `GET /api/user/connections` with expired/revoked PAT | `401` |
| 4 | `GET /api/user/connections` with invalid PAT format (e.g., `token garbage`) | `401` |
| 5 | `GET /api/user/connections` for a user with no connected accounts (key-auth only user) | `200`; response is `[]` (empty array, not `null`) |
| 6 | `GET /api/user/connections` for a user with exactly one GitHub connection | `200`; array has exactly 1 element; element has `provider: "github"` |
| 7 | `GET /api/user/connections` — verify sort order: entries sorted by `id` ascending | For all consecutive pairs, `result[i].id < result[i+1].id` |
| 8 | `GET /api/user/connections` — verify no sensitive fields leaked: response items must NOT contain `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `profile_data`, or `user_id` | Assert absence of these keys on every element |
| 9 | `GET /api/user/connections` — verify `created_at` is a valid ISO 8601 string | Parse each `created_at` with `new Date()` and assert it is not `NaN` |
| 10 | `GET /api/user/connections` — verify `updated_at` is a valid ISO 8601 string | Parse each `updated_at` with `new Date()` and assert it is not `NaN` |
| 11 | `GET /api/user/connections` — verify `updated_at >= created_at` for every entry | `new Date(updated_at).getTime() >= new Date(created_at).getTime()` |
| 12 | `GET /api/user/connections` — verify `id` is a positive integer for every element | `id > 0` and `Number.isInteger(id)` for every element |
| 13 | `GET /api/user/connections` — verify `provider` is a non-empty string for every element | `typeof provider === "string"` and `provider.length > 0` |
| 14 | `GET /api/user/connections` — verify `provider_user_id` is a non-empty string for every element | `typeof provider_user_id === "string"` and `provider_user_id.length > 0` |
| 15 | `GET /api/user/connections` with session cookie auth (not PAT) | `200` with same schema |
| 16 | `GET /api/user/connections` — content-type header is `application/json` | Assert response `Content-Type` starts with `application/json` |
| 17 | `GET /api/user/connections` after user disconnects a provider (via `DELETE /api/user/connections/:id`) and re-lists | `200`; disconnected provider is absent from the array |
| 18 | `GET /api/user/connections` after user re-links a provider (sign in via GitHub OAuth again after disconnect) | `200`; new entry for that provider present with new `id` and `created_at` |
| 19 | `GET /api/user/connections` — verify response does not contain duplicate provider entries for the same provider | Group by `provider`, assert each group has at most 1 entry |
| 20 | `GET /api/user/connections` — verify the endpoint returns `200` (not `204` or other) even for empty lists | Assert HTTP status code is exactly `200` |
| 21 | `GET /api/user/connections` with `provider_user_id` at maximum length (255 chars) — verify it is returned in full without truncation | Seed a connected account with a 255-char provider_user_id; list; assert the full string is returned |
| 22 | Cross-user isolation: User A lists connections and sees only their own; User B lists connections and sees only their own | Authenticate as A, list, note results; authenticate as B, list, note results; assert no overlap of `id` values |

### CLI E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 23 | `codeplane api /api/user/connections` with valid auth | Exit code `0`; stdout is valid JSON array matching the schema |
| 24 | `codeplane api /api/user/connections` with empty/missing token | Exit code non-zero; stderr contains error message |
| 25 | `codeplane api /api/user/connections` — stdout output parses as JSON and matches API schema | Validate each field type (`id`: number, `provider`: string, etc.) |
| 26 | `codeplane api /api/user/connections --json provider` — structured field filtering works | Output contains only the `provider` field(s) |
| 27 | Round-trip: list connections via CLI, disconnect via CLI `DELETE`, list again, verify disconnected account is absent | Full lifecycle passes |

### Playwright (Web UI) E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 28 | Navigate to Settings → Connected Accounts page while authenticated | Page loads; connected accounts list is visible |
| 29 | Verify provider icon and name are displayed for each connected account | Each connected account row has a recognizable provider name (e.g., "GitHub") |
| 30 | Verify external identity (provider_user_id) is displayed for each connected account | Each row shows the external ID |
| 31 | Verify connection date is displayed for each connected account | Each row shows a human-readable date |
| 32 | Verify each connected account row has a Disconnect action element | Disconnect button is present and interactive |
| 33 | Verify loading state is shown before data arrives | Skeleton or spinner is visible momentarily (use network throttling if needed) |
| 34 | Verify error state when API returns 500 (mock/intercept the request) | Error banner is displayed with a user-friendly message and Retry button |
| 35 | Verify empty state when user has no connected accounts | Empty state message is displayed ("No connected accounts") with a call-to-action |
| 36 | Navigate to Settings → Connected Accounts while unauthenticated | Redirected to login page |
| 37 | After disconnecting a provider (via the sibling remove feature), the list refreshes and the disconnected provider is absent | Provider card is removed from the DOM |

### Boundary and Stress Tests

| # | Test | Expected Result |
|---|------|------------------|
| 38 | User with maximum expected connected accounts (5 providers) — list returns all 5 in correct order | Array length is 5; sorted by `id` ascending |
| 39 | User with `provider_user_id` at maximum valid length (255 characters) — list returns it correctly | The 255-char ID is present and not truncated |
| 40 | User with `provider_user_id` exceeding 255 characters — creation is rejected; list does not contain it | Creation returns validation error; list excludes it |
| 41 | Concurrent list requests (5 parallel `GET /api/user/connections`) — all return consistent results | All 5 responses are identical JSON arrays |
| 42 | `GET /api/user/connections` response time is under 200ms for a user with 3 connected accounts | Assert response latency |
| 43 | `GET /api/user/connections` response time is under 200ms for a user with 0 connected accounts | Assert response latency (empty-list fast path) |

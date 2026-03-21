# AUTH_PERSONAL_ACCESS_TOKEN_LIST

Specification for AUTH_PERSONAL_ACCESS_TOKEN_LIST.

## High-Level User POV

When you are working with Codeplane across multiple contexts — a CI pipeline, a local CLI session, editor integrations, desktop app, or API scripts — you accumulate Personal Access Tokens over time. The token list feature gives you a single, authoritative view of every active PAT associated with your account, so you always know exactly what credentials exist, what they can do, and when they were last used.

From the web UI's Settings > Tokens page, or by running `codeplane auth token list` in the CLI, you see a clear summary of each token: its human-readable name, a short identifier (the last eight characters of its hash), the permission scopes it carries, when it was created, and when it was most recently used to authenticate a request. The raw token itself is never shown again after initial creation — only the last-eight identifier appears, which is enough to correlate a token in the list with the one you have stored locally or in a CI secret.

This view is the starting point for token lifecycle management. From the list, you can identify stale tokens that haven't been used in months and revoke them. You can spot tokens with overly broad scopes and replace them with more restrictive alternatives. You can verify that a token you just created via the key-based exchange or CLI login actually appears in your account. If you suspect a token has been compromised, the list gives you the information you need to find the right one and revoke it immediately.

The token list is strictly private to you. No other user — not even an admin — can see your tokens through this endpoint. Exchange-minted tokens (created automatically during CLI or agent login) appear alongside manually created tokens, giving you complete visibility regardless of how the token was originally issued.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can retrieve a complete, accurate, and consistently ordered list of all their active Personal Access Tokens across all product surfaces (API, Web UI, CLI), with each token showing its name, last-eight identifier, scopes, creation time, and last-used time, and with all edge cases handled predictably.

### Functional Criteria

- [ ] An authenticated user can list all of their active PATs via `GET /api/user/tokens`.
- [ ] The response is a JSON array of token summary objects, ordered by `created_at` descending (newest first).
- [ ] Each token summary includes: `id`, `name`, `token_last_eight`, `scopes` (as an array of canonical scope strings), `last_used_at` (ISO 8601 timestamp or `null`), and `created_at` (ISO 8601 timestamp).
- [ ] The raw token value is never included in the list response.
- [ ] The `token_hash` value is never included in the list response.
- [ ] Exchange-minted tokens (name: `"codeplane-cli"`) appear in the list alongside manually created tokens.
- [ ] The list reflects the current state: a token created moments ago appears immediately; a token revoked moments ago does not appear.
- [ ] The list is scoped exclusively to the authenticated user's tokens. A user cannot see another user's tokens.
- [ ] If the user has zero tokens, the endpoint returns an empty array `[]` with status `200`.

### Edge Cases

- [ ] Unauthenticated request (no token, no session): returns `401 Unauthorized`.
- [ ] Request authenticated with a PAT that has been revoked between issuance and this request: returns `401 Unauthorized`.
- [ ] Request authenticated with a PAT whose owning user is deactivated: returns `401 Unauthorized`.
- [ ] Request authenticated with a valid session cookie (browser): returns the token list normally.
- [ ] User with exactly one token that has never been used: `last_used_at` is `null` in the response.
- [ ] User with tokens that have duplicate names (e.g., two tokens named "CI"): both appear in the list, distinguished by `id` and `token_last_eight`.
- [ ] User creates 100+ tokens: all appear in the list (no implicit pagination truncation without explicit pagination parameters).
- [ ] Concurrent list requests: all return consistent snapshots; no partial results.
- [ ] Token with all available non-admin scopes: scopes array is fully populated and correctly formatted.
- [ ] Token created with alias scopes (e.g., `"repo"`): appears in the list with canonical scope (`"write:repository"`), never the alias.
- [ ] Token with maximum-length name (255 characters): appears in the list with the full name intact.
- [ ] Token with a single-character name: appears correctly.
- [ ] Token with unicode characters in name (e.g., emoji, CJK): appears correctly with the original characters preserved.
- [ ] Token with leading/trailing whitespace in name at creation: name is trimmed; list reflects the trimmed value.

### Boundary Constraints

- [ ] Token name in response: string, maximum 255 characters, as originally provided at creation (trimmed of leading/trailing whitespace).
- [ ] `token_last_eight` in response: exactly 8 lowercase hexadecimal characters, matching the regex `/^[0-9a-f]{8}$/`.
- [ ] `scopes` in response: array of canonical scope strings (e.g., `"write:repository"`, not aliases like `"repo"`). Array is never empty.
- [ ] `id` in response: numeric identifier (integer, > 0).
- [ ] `last_used_at`: ISO 8601 string or `null`. When non-null, must be a valid timestamp.
- [ ] `created_at`: ISO 8601 string, always non-null, always a valid timestamp.
- [ ] Response content-type: `application/json`.
- [ ] Response body: JSON array (not wrapped in an envelope object). Zero or more elements.
- [ ] No upper bound on the number of tokens returned (the endpoint returns all active tokens for the user without pagination).

## Design

### API Shape

#### List Tokens

```
GET /api/user/tokens
Authorization: Bearer codeplane_<token>
```

Response `200 OK`:

```json
[
  {
    "id": 42,
    "name": "CI Pipeline",
    "token_last_eight": "a1b2c3d4",
    "scopes": ["read:repository", "write:repository"],
    "last_used_at": "2026-03-20T12:00:00Z",
    "created_at": "2026-01-15T08:30:00Z"
  },
  {
    "id": 41,
    "name": "codeplane-cli",
    "token_last_eight": "e5f6a7b8",
    "scopes": ["write:repository", "write:user", "write:organization"],
    "last_used_at": "2026-03-21T09:15:00Z",
    "created_at": "2026-01-10T14:00:00Z"
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

Response `403 Forbidden` (insufficient scope):

```json
{
  "error": "insufficient_scope",
  "message": "Token does not have the required scope: read:user"
}
```

**Notes:**
- The array is ordered by `created_at` descending.
- The `token` and `token_hash` fields are never present in any element.
- This endpoint does not support pagination parameters today. If pagination is added in the future, the non-paginated form must remain backward-compatible.
- Both `Bearer` and `token` authorization schemes are accepted (case-insensitive scheme matching).
- Session cookie authentication is also accepted (browser context).

### SDK Shape

The SDK exposes token listing through both the `UserService` and `AuthService`:

- `UserService.listTokens(userId: number)` → `Result<TokenSummary[], APIError>`
- `AuthService.listTokens(userId: string)` → `Promise<TokenSummary[]>`

The `TokenSummary` interface must include:

```typescript
interface TokenSummary {
  id: number;
  name: string;
  token_last_eight: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
}
```

**Current gap:** The existing `TokenSummary` in `packages/sdk/src/services/user.ts` does not include `last_used_at` or `created_at`. The database query already returns these fields. The service mapping must be updated to include them.

### CLI Command

```bash
codeplane auth token list
```

**Default output (human-readable table):**

```
ID    NAME            LAST EIGHT   SCOPES                                   LAST USED        CREATED
42    CI Pipeline     a1b2c3d4     read:repository, write:repository        2 hours ago      Jan 15, 2026
41    codeplane-cli       e5f6a7b8     write:repository, write:user, write:org  5 minutes ago    Jan 10, 2026
```

**Structured JSON output (`--json`):**

```bash
codeplane auth token list --json
```

Returns the raw API response array.

**Behavior details:**
- Requires authentication. If no token is available (env var, keyring, or config), exits with a non-zero code and a message directing the user to `codeplane auth login`.
- When no tokens exist, outputs a message: "No tokens found. Create one with: codeplane auth token create <name> --scopes <scopes>".
- When no tokens exist in JSON mode, outputs `[]`.
- Timestamps in the human-readable table use relative formatting ("2 hours ago", "Never") for `last_used_at` and date formatting ("Jan 15, 2026") for `created_at`.
- The `--json` flag outputs the raw JSON array for programmatic consumption and piping.
- Exit code 0 on success (including empty list), non-zero on auth or network errors.

### Web UI Design

**Route:** `/settings/tokens`

**Token list table:**

| Column | Content | Format |
|--------|---------|--------|
| Name | Token name | Plain text, truncated with ellipsis at 40 chars in the table cell |
| Identifier | `token_last_eight` | Monospace font, `a1b2c3d4` style |
| Scopes | Scope list | Tags/badges, one per scope, wrapping if needed |
| Last Used | `last_used_at` | Relative time ("2 hours ago") or "Never" if null |
| Created | `created_at` | Relative time ("3 days ago") |
| Actions | Revoke button | Red/destructive style button labeled "Revoke" |

**Table behaviors:**
- Sorted by `created_at` descending (newest first), matching the API order.
- No client-side sorting controls (order matches the API contract).
- The table updates after token creation or revocation without a full page reload.
- Long token names are truncated with a tooltip showing the full name on hover.

**Empty state:**
- When the user has no tokens, display a centered message: "You don't have any personal access tokens yet."
- Below the message, a brief explanation: "Personal access tokens are used to authenticate with Codeplane from the CLI, CI pipelines, scripts, and editor integrations."
- A primary action button: "Generate new token" linking to the creation form on the same page.

**Loading state:**
- Show a skeleton/placeholder table while the token list is loading.

**Error state:**
- If the API returns an error, display an inline error banner with a retry button.

### TUI UI

The TUI does not expose a dedicated token management screen. Users manage tokens via the CLI or web UI. This is an intentional product decision, not a gap.

### Editor Integrations (VS Code, Neovim)

Editor integrations do not provide token listing UI. Token management is handled through the CLI or web UI. Editors consume stored tokens transparently for authentication.

### Documentation

The following end-user documentation should exist:

1. **"Managing Personal Access Tokens"** — A guide covering how to view your tokens (web UI walkthrough with screenshots and CLI `codeplane auth token list` examples), what each field means (name, last-eight, scopes, last used, created), how to identify stale or suspicious tokens, and how the list relates to creation and revocation flows.

2. **"Token Scopes Reference"** — A reference table of all canonical scopes with descriptions of what each scope permits. This documentation is shared with the CREATE spec but must be linkable from the list context.

3. **"API Reference: GET /api/user/tokens"** — OpenAPI-style documentation for the list endpoint including request headers, response schema, status codes, and example responses.

## Permissions & Security

### Authorization Roles

| Operation | Required Role |
|-----------|---------------|
| List own tokens via API | Authenticated user (any role) — requires valid session or PAT |
| List own tokens via CLI | Authenticated user (any role) — requires token in env/keyring/config |
| List own tokens via Web UI | Authenticated user (any role) — requires active session |
| List another user's tokens | Not permitted. No admin override exists. |

### Scope Enforcement

- The `GET /api/user/tokens` endpoint requires the `read:user` or `write:user` scope when authenticated via PAT.
- Session cookie authentication (browser) is not scope-gated — session auth implies full user-level access.
- A PAT with only `read:repository` scope attempting to list tokens must receive `403 Forbidden`.
- A PAT with `all` or `admin` scope can list tokens (these are supersets).

### Rate Limiting

- Rate-limited by authenticated user ID: `user:{userId}`.
- Uses the standard API rate limit tier (not the stricter auth-specific tier used for token creation).
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included on every response.
- Exceeding the limit returns `429 Too Many Requests` with `Retry-After`.
- Failed authentication attempts are rate-limited by IP address: `ip:{clientIp}`.

### Data Privacy Constraints

- The response must never include `token_hash` or the raw `token` value.
- Only `token_last_eight` is returned as a token identifier — this is an 8-character suffix of the SHA-256 hash and is not reversible.
- The endpoint is strictly user-scoped. No API path, admin override, or service-level call exposes one user's tokens to another user.
- Server logs for this endpoint must not log the response body (it contains token metadata).
- The `Authorization` header used to authenticate the request must be redacted in all log output.
- Token metadata (names, scopes) should be considered sensitive and not logged at levels above `debug`.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.token_list_viewed` | User retrieves their token list | `user_id`, `token_count` (number of tokens returned), `client` (web/cli/api), `has_unused_tokens` (bool — true if any token has `last_used_at = null`), `oldest_token_age_days` (age of the oldest token in the list), `has_stale_tokens` (bool — true if any token has `last_used_at` > 90 days ago or null) |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Token list view frequency** | Number of token list views per active user per week | Indicates engagement with token lifecycle management |
| **List-to-revoke conversion** | % of token list views followed by a token revocation within the same session | > 0 indicates users actively cleaning up tokens |
| **List-to-create conversion** | % of token list views followed by a token creation within the same session | Indicates the list is a useful launchpad for token management |
| **Stale token ratio** | % of tokens in list responses where `last_used_at` is null or > 90 days old | High ratio may indicate tokens are being created but forgotten |
| **Empty list rate** | % of token list views that return zero tokens | High rate may indicate confusion about where tokens are managed |
| **Surface distribution** | Breakdown of token list views by `client` (web vs cli vs direct api) | Indicates which surfaces users prefer for token management |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Token list request received | `debug` | `user_id`, `request_id`, `client_ip` | Entry point log for correlation |
| Token list returned successfully | `debug` | `user_id`, `token_count`, `request_id`, `latency_ms` | Success with count for monitoring |
| Token list failed — auth required | `warn` | `client_ip`, `request_id`, `user_agent` | Unauthenticated access attempt |
| Token list failed — insufficient scope | `info` | `user_id`, `token_id`, `required_scope`, `held_scopes`, `request_id` | Scope mismatch for debugging |
| Token list failed — internal error | `error` | `user_id`, `request_id`, `error_message`, `stack_trace` | Database or service layer failure |
| Token list failed — rate limited | `warn` | `user_id`, `request_id`, `rate_limit_key`, `retry_after_seconds` | Abuse or misconfigured client |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_token_list_requests_total` | Counter | `status` (200/401/403/429/500) | Total token list API requests by response status |
| `codeplane_user_token_list_duration_seconds` | Histogram | `status` | Request-to-response latency for token list endpoint |
| `codeplane_user_token_list_count` | Histogram | — | Distribution of token counts per list response (how many tokens does a typical user have?) |
| `codeplane_user_tokens_active` | Gauge | — | Total number of non-revoked tokens across all users (system-wide) |

### Alerts

#### Alert: Token List Endpoint Error Rate

- **Condition**: `rate(codeplane_user_token_list_requests_total{status="500"}[5m]) / rate(codeplane_user_token_list_requests_total[5m]) > 0.05` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check server error logs for the `/api/user/tokens` endpoint — look for database connection failures or query errors.
  2. Verify database health: connection pool saturation, query latency on `access_tokens` table, table locks.
  3. Check if a recent deployment introduced a regression in the `listTokens` service method or the route handler.
  4. If the `access_tokens` table is unexpectedly large, verify that the `user_id` index is healthy.
  5. If database is healthy, check for service registry initialization failures or dependency injection issues.

#### Alert: Token List Latency Spike

- **Condition**: `histogram_quantile(0.99, rate(codeplane_user_token_list_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query performance for `SELECT ... FROM access_tokens WHERE user_id = $1 ORDER BY created_at DESC`.
  2. Verify the `access_tokens(user_id)` index exists and is not bloated.
  3. Check for users with an unusually large number of tokens (> 1000) that may cause slow queries.
  4. Check overall database CPU/IO load — this endpoint's query should be very fast under normal conditions.
  5. If the issue is isolated to specific users, consider adding a per-user token count limit as a future improvement.

#### Alert: Elevated 401 Rate on Token List Endpoint

- **Condition**: `rate(codeplane_user_token_list_requests_total{status="401"}[5m]) > 50` sustained for 10 minutes.
- **Severity**: Informational
- **Runbook**:
  1. This may indicate a client misconfiguration where expired or revoked tokens are being used to poll the token list.
  2. Check client IP distribution — if concentrated, may be a single misconfigured CI system.
  3. Check if a batch token revocation happened recently that left clients holding stale credentials.
  4. No immediate action required unless the rate is abnormally high or correlated with other auth anomalies.

#### Alert: Elevated 403 Rate on Token List Endpoint

- **Condition**: `rate(codeplane_user_token_list_requests_total{status="403"}[5m]) > 20` sustained for 10 minutes.
- **Severity**: Informational
- **Runbook**:
  1. This indicates tokens with insufficient scopes are being used to access the token list.
  2. Check if a client version was recently released that attempts to list tokens without requesting `read:user` scope.
  3. Review the distribution of scopes on recently created tokens — users may not be requesting `read:user` or `write:user` when they should be.
  4. Consider surfacing a clearer error message in clients directing users to create a token with the appropriate scope.

### Error Cases and Failure Modes

| Failure Mode | Impact | Behavior |
|-------------|--------|----------|
| Database unavailable | User cannot list tokens | `500 Internal Server Error`; logged at `error` level |
| Database query timeout | User sees a slow or failed request | `500` after timeout; logged with latency |
| Auth middleware failure | Request treated as unauthenticated | `401 Unauthorized`; logged at `warn` level |
| Scope check failure | User gets a permission error | `403 Forbidden`; logged at `info` level |
| Corrupted scope data in DB | Scopes may appear malformed | The `splitScopes` function should handle gracefully; malformed entries returned as-is |
| User deleted between auth and list | Edge case race condition | Auth succeeds (token valid), but user context may be inconsistent; returns empty list or `500` depending on service behavior |
| Rate limit exceeded | User gets a throttle response | `429 Too Many Requests` with `Retry-After` header |
| Network timeout (client-side) | CLI/UI shows timeout error | Clients should display a retry prompt; no server-side impact |

## Verification

### API Integration Tests

- [ ] **List tokens — authenticated with session cookie**: Authenticated browser session calls `GET /api/user/tokens` → `200` with array of token summaries.
- [ ] **List tokens — authenticated with PAT (write:user scope)**: `Authorization: Bearer codeplane_<valid-write-user-token>` → `200`.
- [ ] **List tokens — authenticated with PAT (read:user scope)**: `Authorization: Bearer codeplane_<valid-read-user-token>` → `200`.
- [ ] **List tokens — authenticated with PAT (all scope)**: `Authorization: Bearer codeplane_<valid-all-scope-token>` → `200`.
- [ ] **List tokens — authenticated with PAT (admin scope)**: `Authorization: Bearer codeplane_<valid-admin-scope-token>` → `200`.
- [ ] **List tokens — PAT without user scope**: `Authorization: Bearer codeplane_<read-repo-only-token>` → `403 Forbidden`.
- [ ] **List tokens — PAT with write:repository only**: `Authorization: Bearer codeplane_<write-repo-only-token>` → `403 Forbidden`.
- [ ] **List tokens — unauthenticated**: No `Authorization` header, no session → `401`.
- [ ] **List tokens — revoked PAT**: Use a token that has been revoked → `401`.
- [ ] **List tokens — deactivated user's PAT**: PAT belonging to a deactivated user → `401`.
- [ ] **List tokens — suspended user's PAT**: PAT belonging to a user with `prohibit_login = true` → `401`.
- [ ] **List tokens — empty list**: New user with no tokens → `200` with `[]`.
- [ ] **List tokens — response shape**: Each item has exactly `id`, `name`, `token_last_eight`, `scopes`, `last_used_at`, `created_at`. No extra fields.
- [ ] **List tokens — no raw token in response**: Verify no item contains a `token` field or `token_hash` field.
- [ ] **List tokens — ordering**: Create tokens A (first), B (second), C (third) → list returns `[C, B, A]` (newest first).
- [ ] **List tokens — token_last_eight format**: Every `token_last_eight` matches `/^[0-9a-f]{8}$/`.
- [ ] **List tokens — scopes are canonical**: A token created with alias scope `"repo"` appears in the list with `"write:repository"`.
- [ ] **List tokens — scopes are sorted**: Scopes within each token's `scopes` array are sorted alphabetically.
- [ ] **List tokens — scopes are arrays**: Each item's `scopes` is an array, never a comma-separated string.
- [ ] **List tokens — last_used_at is null for unused token**: Create a token, immediately list → `last_used_at` is `null`.
- [ ] **List tokens — last_used_at is populated after use**: Create a token, use it to make an API call, list tokens → `last_used_at` is a non-null ISO 8601 timestamp.
- [ ] **List tokens — created_at is present and non-null**: Every token in the response has a `created_at` ISO 8601 timestamp.
- [ ] **List tokens — user isolation**: User A creates tokens, User B lists tokens → User B does not see User A's tokens.
- [ ] **List tokens — duplicate names**: Create two tokens both named "CI" → both appear in the list with different `id` and `token_last_eight` values.
- [ ] **List tokens — exchange-minted token appears**: Perform a key-auth exchange → list tokens → a token named `"codeplane-cli"` appears.
- [ ] **List tokens — after revocation**: Create token, revoke it, list tokens → revoked token does not appear.
- [ ] **List tokens — many tokens (50)**: Create 50 tokens → list returns all 50 tokens.
- [ ] **List tokens — 100 tokens (no truncation)**: Create 100 tokens → list returns all 100 tokens without pagination or truncation.
- [ ] **List tokens — maximum name length (255 chars)**: Create a token with a 255-character name → it appears correctly in the list with the full name.
- [ ] **List tokens — single-character name**: Create a token with name "X" → it appears in the list with name "X".
- [ ] **List tokens — unicode name**: Create a token with unicode characters in the name → it appears correctly in the list.
- [ ] **List tokens — concurrent list requests**: Send 10 concurrent `GET /api/user/tokens` requests → all return `200` with consistent results.
- [ ] **List tokens — rate limit headers present**: Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- [ ] **List tokens — rate limit exhaustion**: Exceed the rate limit for the user → `429 Too Many Requests` with `Retry-After`.
- [ ] **List tokens — response content-type**: Response `Content-Type` header is `application/json`.
- [ ] **List tokens — Bearer scheme (lowercase)**: `Authorization: Bearer codeplane_<valid>` → `200`.
- [ ] **List tokens — token scheme**: `Authorization: token codeplane_<valid>` → `200`.
- [ ] **List tokens — BEARER scheme (uppercase)**: `Authorization: BEARER codeplane_<valid>` → `200`.
- [ ] **List tokens — multiple scopes on one token**: Token created with `["write:repository", "read:user", "write:organization"]` → all three scopes appear in the list response.
- [ ] **List tokens — id field is numeric**: Every `id` in the response is an integer greater than 0, not a string.

### CLI E2E Tests

- [ ] **`codeplane auth token list` returns tokens**: Create a token first, then run `codeplane auth token list` → output contains the token name and last-eight.
- [ ] **`codeplane auth token list --json` returns valid JSON array**: Output parses as a JSON array with expected fields.
- [ ] **`codeplane auth token list --json` has correct fields**: Each item in JSON output has `id`, `name`, `token_last_eight`, `scopes` array. No `token` field.
- [ ] **`codeplane auth token list` with no auth fails**: Run without a stored token or `CODEPLANE_TOKEN` → non-zero exit code.
- [ ] **`codeplane auth token list` shows empty state**: User with no tokens → output shows a helpful message (non-JSON mode) or empty array (JSON mode).
- [ ] **`codeplane auth token list --json` after create/delete round-trip**: Create a token, verify it appears in list, delete it, verify it does not appear in list.
- [ ] **`codeplane auth token list` with read-only token**: Token with only `read:repository` scope → exits with non-zero code (insufficient permissions).
- [ ] **`codeplane auth token list` with `CODEPLANE_TOKEN` env var**: Set env var to a valid token with `write:user` scope → list succeeds.
- [ ] **`codeplane auth token list` with `read:user` scope token**: Token with `read:user` scope → list succeeds.
- [ ] **`codeplane auth token list --json` field values match API**: JSON output from CLI matches the API response schema exactly (same field names, same types).
- [ ] **`codeplane auth token list` exit code 0 on success**: Command exits with code 0 when the list is returned, even if the list is empty.
- [ ] **`codeplane auth token list` table output format**: Human-readable output includes column headers: ID, NAME, LAST EIGHT, SCOPES, LAST USED, CREATED.

### Playwright (Web UI) E2E Tests

- [ ] **Navigate to Settings → Tokens**: Authenticated user navigates to `/settings/tokens` → sees the token list page.
- [ ] **Token list displays correct columns**: Table has columns for Name, Identifier, Scopes, Last Used, Created, and Actions.
- [ ] **Token list shows created token**: Create a token via the UI form → the new token appears in the list after dismissing the creation banner.
- [ ] **Token list shows exchange-minted tokens**: User authenticated via CLI exchange → navigates to `/settings/tokens` → sees `"codeplane-cli"` token.
- [ ] **Token list shows scopes as badges/tags**: Each scope is rendered as a distinct visual element (badge/tag), not a comma-separated string.
- [ ] **Token list shows relative timestamps**: `last_used_at` is displayed as relative time ("2 hours ago"), `created_at` as relative time.
- [ ] **Token list shows "Never" for unused tokens**: A token that has never been used displays "Never" in the Last Used column.
- [ ] **Empty state renders correctly**: User with no tokens sees the empty state message and a "Generate new token" call-to-action.
- [ ] **Token list updates after revocation**: Revoke a token from the list → the token disappears from the table without a full page reload.
- [ ] **Token list does not expose raw token**: No element on the page contains a `codeplane_` prefixed string for existing tokens (only at creation time).
- [ ] **Token list loading state**: Navigating to the page shows a loading skeleton before data arrives.
- [ ] **Token list error state**: Simulate an API error → an error banner with a retry button is displayed.
- [ ] **Token list with many tokens**: User with 20+ tokens → all tokens render correctly, the table scrolls or paginates as needed.
- [ ] **Token name truncation**: A token with a name longer than 40 characters is truncated with an ellipsis in the table cell.
- [ ] **Token name tooltip on hover**: Hovering over a truncated token name shows a tooltip with the full name.
- [ ] **Identifier uses monospace font**: The `token_last_eight` column renders in a monospace font.

### Security-Focused Tests

- [ ] **Raw token never in list response body**: Intercept API response for `GET /api/user/tokens` → no field value matches `codeplane_[0-9a-f]{40}` pattern.
- [ ] **Token hash never in list response body**: Intercept API response → no field value is a 64-character hex string (SHA-256 hash length).
- [ ] **Authorization header redacted in logs**: After making a token list request, search server logs → the `Authorization` header value does not appear.
- [ ] **Cross-user token isolation**: User A creates tokens; User B authenticates and calls `GET /api/user/tokens` → none of User A's tokens appear.
- [ ] **Token list not accessible via query-string auth**: `GET /api/user/tokens?token=codeplane_<valid>` → treated as unauthenticated (`401`).
- [ ] **Response body not logged**: After making a token list request, search server logs → the JSON response body is not present in any log line.
- [ ] **OAuth2 token cannot list PATs without user scope**: An OAuth2 access token (`codeplane_oat_` prefix) without `read:user` scope → `403`.

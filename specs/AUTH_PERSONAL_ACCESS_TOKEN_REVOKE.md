# AUTH_PERSONAL_ACCESS_TOKEN_REVOKE

Specification for AUTH_PERSONAL_ACCESS_TOKEN_REVOKE.

## High-Level User POV

When you have Personal Access Tokens that are no longer needed — because a CI pipeline was decommissioned, a local machine was retired, a token was shared by mistake, or you simply want to rotate credentials — you need a fast and irreversible way to kill that token immediately. The revoke feature gives you exactly that: one action, immediate effect, no ambiguity.

From the web UI's Settings > Tokens page, each token in your list has a "Revoke" button. Clicking it opens a confirmation dialog that reminds you this action is permanent and cannot be undone. Once you confirm, the token vanishes from the list instantly, and any system or script that was using that token will start receiving authentication failures on its very next request. There is no grace period, no soft-delete, no undo.

From the CLI, `codeplane auth token delete <id>` does the same thing. In interactive mode, it asks you to confirm before proceeding. In non-interactive mode or with the `--yes` flag, it executes immediately. If you are revoking a token you are currently authenticated with, the CLI warns you that your current session will stop working.

From the API, a single `DELETE /api/user/tokens/:id` call revokes the token and returns a `204 No Content`. It is simple, predictable, and idempotent-friendly — if you accidentally call it twice, the second call returns `404` because the token is already gone, which is a safe and expected outcome.

Revoking a token is strictly limited to your own tokens. You cannot revoke another user's token, and no admin-level override exists for this operation. This is a deliberate security boundary: the only person who can destroy a credential is the person who owns it.

The revocation feature is the critical counterpart to token creation. Without it, your account accumulates stale credentials indefinitely. With it, you maintain a clean, auditable set of active tokens and can respond instantly when a credential needs to be killed.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can permanently and immediately revoke any of their own Personal Access Tokens from all product surfaces (API, Web UI, CLI), when the revoked token is immediately rejected on any subsequent authentication attempt, and when all edge cases around invalid input, ownership boundaries, concurrent revocation, and self-revocation are handled predictably.

### Functional Criteria

- [ ] An authenticated user can revoke one of their own PATs via `DELETE /api/user/tokens/:id`.
- [ ] A successful revocation returns `204 No Content` with an empty response body.
- [ ] After revocation, the token no longer appears in the `GET /api/user/tokens` list response.
- [ ] After revocation, any API request authenticated with the revoked token returns `401 Unauthorized`.
- [ ] Revocation is immediate — there is no TTL, cache delay, or eventual-consistency window.
- [ ] Revocation is permanent — there is no undelete, restore, or undo operation.
- [ ] The user can revoke the token they are currently using to authenticate the revocation request (self-revocation).
- [ ] The CLI provides `codeplane auth token delete <id>` as the revocation command.
- [ ] The CLI prompts for confirmation in interactive mode and accepts `--yes` to skip the prompt.
- [ ] The Web UI provides a "Revoke" button per token in the token list, with a confirmation dialog before executing.
- [ ] Exchange-minted tokens (name: `"codeplane-cli"`) can be revoked the same way as manually created tokens.

### Edge Cases

- [ ] Revoking a token that does not exist: returns `404 Not Found`.
- [ ] Revoking a token that belongs to another user: returns `404 Not Found` (not `403`, to prevent user enumeration).
- [ ] Revoking a token that was already revoked (double-revoke): returns `404 Not Found`.
- [ ] Revoking the token currently being used to authenticate the request: returns `204` and the token is invalidated. The client must handle re-authentication gracefully.
- [ ] Unauthenticated revocation request: returns `401 Unauthorized`.
- [ ] Revocation request authenticated via session cookie: succeeds (browser-originated revocation).
- [ ] Revocation with a PAT that lacks `write:user` scope: returns `403 Forbidden`.
- [ ] Token ID is `0`: returns `400 Bad Request` ("invalid token id").
- [ ] Token ID is negative: returns `400 Bad Request` ("invalid token id").
- [ ] Token ID is not a number (e.g., `"abc"`): returns `400 Bad Request`.
- [ ] Token ID is a very large number that does not match any token: returns `404 Not Found`.
- [ ] Token ID is a floating point number (e.g., `42.5`): returns `400 Bad Request`.
- [ ] Concurrent revocation of the same token (race condition): exactly one request succeeds with `204`; the other returns `404`. No crash, no double-delete.
- [ ] User is deactivated between authentication and revocation (unlikely race): either the request completes successfully or returns `401`, but never corrupts state.
- [ ] Token revocation while the token is concurrently being used for another API request: the other request may succeed if it was already past the auth middleware, but the next request with that token fails with `401`.
- [ ] CLI `codeplane auth token delete` in non-interactive mode without `--yes`: exits with a non-zero code and a message asking for explicit confirmation.
- [ ] CLI `codeplane auth token delete` with no arguments: exits with a non-zero code and a usage message.

### Boundary Constraints

- [ ] Token ID parameter: must be a positive integer (> 0). Maximum value is the database's integer range.
- [ ] Response body on `204`: must be empty (zero bytes).
- [ ] Response body on `404`: JSON object with `error` and `message` fields.
- [ ] Response body on `400`: JSON object with `error` and `message` fields.
- [ ] Response body on `401`: JSON object with `error` and `message` fields.
- [ ] Response body on `403`: JSON object with `error` and `message` fields.
- [ ] Response content-type on error responses: `application/json`.
- [ ] Response has no content-type header on `204` (empty body).
- [ ] The `DELETE` method is the only accepted HTTP method for this endpoint. `POST`, `GET`, `PUT`, `PATCH` to the same path must return `405 Method Not Allowed`.

## Design

### API Shape

#### Revoke Token

```
DELETE /api/user/tokens/:id
Authorization: Bearer codeplane_<token>
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | Yes | The numeric ID of the token to revoke |

**Response `204 No Content`** (success):

Empty body. The token has been permanently deleted.

**Response `400 Bad Request`** (invalid token ID):

```json
{
  "error": "bad_request",
  "message": "invalid token id"
}
```

**Response `401 Unauthorized`** (not authenticated):

```json
{
  "error": "unauthorized",
  "message": "authentication required"
}
```

**Response `403 Forbidden`** (insufficient scope):

```json
{
  "error": "insufficient_scope",
  "message": "Token does not have the required scope: write:user"
}
```

**Response `404 Not Found`** (token does not exist or belongs to another user):

```json
{
  "error": "not_found",
  "message": "token not found"
}
```

**Response `429 Too Many Requests`** (rate limited):

```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests"
}
```

Includes `Retry-After` header.

**Notes:**

- Both `Bearer` and `token` authorization schemes are accepted (case-insensitive scheme matching).
- Session cookie authentication is also accepted (browser context).
- The 404 response is intentionally used for both "token does not exist" and "token belongs to another user" to prevent user/token enumeration.
- Self-revocation (revoking the token used to authenticate this request) is permitted and succeeds with `204`.

### SDK Shape

The SDK exposes token revocation through both the `UserService` and `AuthService`:

- `UserService.deleteToken(userId: number, tokenID: number)` → `Result<void, APIError>`
- `AuthService.deleteToken(userId: string, tokenId: string)` → `Promise<void>`

**Validation behavior:**

- If `tokenID <= 0`, return `Result.err(badRequest("invalid token id"))`.
- If the `DELETE` query affects zero rows, return `Result.err(notFound("token not found"))`.
- The query `DELETE FROM access_tokens WHERE id = $1 AND user_id = $2` ensures ownership enforcement at the database level.
- On success, return `Result.ok(undefined)`.

### CLI Command

```bash
codeplane auth token delete <id> [--yes]
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | The numeric ID of the token to revoke |

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--yes` | `-y` | Skip confirmation prompt |

**Interactive behavior (no `--yes` flag):**

```
⚠ This will permanently revoke token ID 42. Any system using this token will lose access immediately.

Are you sure? (y/N): y

✓ Token 42 revoked successfully.
```

**Non-interactive behavior (with `--yes`):**

```bash
codeplane auth token delete 42 --yes
# Output:
✓ Token 42 revoked successfully.
```

**Self-revocation warning (when revoking the token you are authenticated with):**

```
⚠ You are about to revoke the token you are currently authenticated with. You will need to re-authenticate after this action.

Are you sure? (y/N): y

✓ Token 42 revoked successfully.
⚠ Your current authentication has been invalidated. Run `codeplane auth login` to re-authenticate.
```

**JSON output (`--json`):**

```bash
codeplane auth token delete 42 --yes --json
```

On success, exits with code 0 and outputs:

```json
{ "ok": true }
```

On failure, exits with non-zero code and outputs the error:

```json
{
  "error": "not_found",
  "message": "token not found"
}
```

**Error cases:**

- No `<id>` argument: exits with non-zero code, prints usage.
- Invalid `<id>` (non-numeric): exits with non-zero code, prints "invalid token id".
- No authentication: exits with non-zero code, prints "Not authenticated. Run `codeplane auth login` to authenticate."
- Token not found: exits with non-zero code, prints "Token not found."
- Insufficient scope: exits with non-zero code, prints the scope error message.
- Non-interactive without `--yes`: exits with non-zero code, prints "Use --yes to confirm in non-interactive mode."

### Web UI Design

**Route:** `/settings/tokens` (shared with the token list view)

**Revoke button:**

- Each token row in the token list table includes a "Revoke" action button in the rightmost column.
- The button is styled as destructive (red text or red outline) to indicate an irreversible action.
- The button text is "Revoke" (not "Delete" — revocation language is preferred for credential lifecycle).

**Confirmation dialog:**

- Clicking "Revoke" opens a modal/dialog before executing the action.
- Dialog title: "Revoke personal access token"
- Dialog body: `Are you sure you want to revoke "${tokenName}"? This action is permanent and cannot be undone. Any system using this token will immediately lose access.`
- The token name in the body is displayed verbatim (not truncated).
- Dialog actions: "Cancel" (secondary) and "Revoke token" (destructive/primary).
- The "Revoke token" button is styled as destructive (red background).
- While the revocation request is in-flight, the "Revoke token" button shows a loading spinner and is disabled.
- On success: the dialog closes, the token is removed from the list with a brief fade-out animation, and a success toast appears: "Token revoked successfully."
- On failure: the dialog remains open and an inline error message appears within the dialog (e.g., "Failed to revoke token. Please try again.").
- Pressing Escape or clicking the backdrop closes the dialog without revoking.

**Optimistic update:**

- After a successful `DELETE` response, the token is removed from the local list state immediately without re-fetching the list from the API.

**Self-revocation behavior (Web UI):**

- If the user is authenticated via session cookie, self-revocation of a PAT does not affect the browser session. The token disappears from the list and the user remains logged in.
- If the user somehow initiated the request with the token being revoked (unlikely in browser context), the next API call would fail, and the UI should gracefully redirect to the login page.

### TUI UI

The TUI does not expose a dedicated token management or revocation screen. Users manage token revocation via the CLI or web UI. This is an intentional product decision, not a gap.

### Editor Integrations (VS Code, Neovim)

Editor integrations do not provide token revocation UI. Token management is handled through the CLI or web UI. If the underlying daemon token is revoked externally, the editor integration should detect the `401` response and surface a notification prompting the user to re-authenticate.

### Documentation

The following end-user documentation should exist:

1. **"Revoking a Personal Access Token"** — A step-by-step guide covering how to revoke a token from the web UI (with screenshots of the confirmation dialog) and from the CLI (`codeplane auth token delete <id> --yes`), what happens after revocation (immediate authentication failure for any system using the token), and guidance on when to revoke tokens (compromised credentials, decommissioned systems, credential rotation).

2. **"Personal Access Token Lifecycle"** — A conceptual guide covering the full token lifecycle from creation → usage → last-used tracking → revocation, linking to the CREATE, LIST, and REVOKE documentation sections. This shared document should emphasize that tokens have no automatic expiration and that manual revocation is the only way to invalidate a token.

3. **"API Reference: DELETE /api/user/tokens/:id"** — OpenAPI-style documentation for the revoke endpoint including path parameters, request headers, response status codes, example responses, and error code reference.

4. **"Troubleshooting: Revoked Token Errors"** — A help article for users who encounter `401 Unauthorized` after a token they were using was revoked, explaining what happened and how to create a new token or re-authenticate.

## Permissions & Security

### Authorization Roles

| Operation | Required Role |
|-----------|---------------|
| Revoke own token via API | Authenticated user (any role) — requires valid session or PAT with `write:user` scope |
| Revoke own token via CLI | Authenticated user (any role) — requires token in env/keyring/config with `write:user` scope |
| Revoke own token via Web UI | Authenticated user (any role) — requires active session |
| Revoke another user's token | Not permitted. No admin override exists. Returns `404`. |

### Scope Enforcement

- The `DELETE /api/user/tokens/:id` endpoint requires the `write:user` scope when authenticated via PAT.
- Session cookie authentication (browser) is not scope-gated — session auth implies full user-level access.
- A PAT with only `read:user` scope attempting to revoke a token must receive `403 Forbidden`.
- A PAT with only `read:repository` scope attempting to revoke a token must receive `403 Forbidden`.
- A PAT with `all` scope can revoke tokens (superset of `write:user`).
- A PAT with `admin` scope can revoke tokens (superset of `write:user`).
- Self-revocation is explicitly permitted — a token with `write:user` scope can revoke itself.

### Rate Limiting

- Rate-limited by authenticated user ID: `user:{userId}`.
- Uses the standard API mutation rate limit tier (stricter than read-only endpoints, less strict than the auth-specific tier used for login attempts).
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included on every response.
- Exceeding the limit returns `429 Too Many Requests` with `Retry-After`.
- Failed authentication attempts (401 responses) are rate-limited by IP address: `ip:{clientIp}`.
- The mutation rate limit prevents a compromised session from being used to rapidly revoke all of a user's tokens (though the blast radius is limited to the user's own tokens).

### Data Privacy & Security Constraints

- The revocation endpoint must not return any token metadata in the `204` response body — not the token hash, not the raw token, not the name or scopes.
- Error responses (`404`) must not leak whether the token ID exists but belongs to another user vs. does not exist at all. The message is always `"token not found"`.
- Server logs must not log the `Authorization` header used to authenticate the request.
- Server logs may log the token ID being revoked, as it is a non-sensitive identifier.
- The `user_id` + `token_id` pair should be logged for audit trail purposes at `info` level.
- Revocation must be a hard delete, not a soft delete. The row is removed from the `access_tokens` table. There is no `revoked_at` column or "revoked" state — the token simply ceases to exist.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.token_revoked` | User successfully revokes a PAT | `user_id`, `token_id`, `token_name`, `token_scopes` (array), `token_age_days` (days since creation), `token_last_used_at` (ISO 8601 or null), `was_self_revocation` (bool — true if the revoked token was used to authenticate this request), `client` (web/cli/api), `was_exchange_token` (bool — true if name was `"codeplane-cli"`), `user_remaining_token_count` (number of tokens the user has after revocation) |
| `auth.token_revoke_failed` | User attempts to revoke a token and receives an error | `user_id`, `attempted_token_id`, `error_code` (400/404/403/429), `client` (web/cli/api) |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **List-to-revoke conversion** | % of token list views followed by a successful token revocation within the same session | > 0 indicates users are actively managing their token hygiene |
| **Revocation confirmation rate** | % of revocation confirmation dialogs (Web UI) where the user clicks "Revoke token" vs. "Cancel" | Indicates whether the confirmation dialog is appropriate friction |
| **Self-revocation rate** | % of revocations where the user revokes the token they are currently authenticated with | Should be low; high rate may indicate confusion |
| **Stale token revocation rate** | % of revoked tokens where `last_used_at` was null or > 90 days old | High rate indicates users are cleaning up unused tokens (positive behavior) |
| **Post-revocation re-auth rate** | % of self-revocations followed by a new `auth login` within 10 minutes | Indicates healthy credential rotation |
| **Exchange token revocation rate** | % of revoked tokens where `was_exchange_token` is true | Indicates whether exchange-minted tokens are being actively managed or accumulating |
| **Time-to-revoke** | Median time between token creation and revocation | Helps understand token lifecycle patterns |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Token revocation request received | `debug` | `user_id`, `token_id`, `request_id`, `client_ip` | Entry point for correlation |
| Token revoked successfully | `info` | `user_id`, `token_id`, `request_id`, `latency_ms`, `was_self_revocation` | Audit-critical log. Must always be emitted on success. |
| Token revocation failed — token not found | `info` | `user_id`, `attempted_token_id`, `request_id` | Expected failure (idempotent retry, wrong ID, or cross-user attempt) |
| Token revocation failed — invalid token ID | `warn` | `user_id`, `raw_token_id_param`, `request_id` | Bad input from client |
| Token revocation failed — auth required | `warn` | `client_ip`, `request_id`, `user_agent` | Unauthenticated revocation attempt |
| Token revocation failed — insufficient scope | `info` | `user_id`, `token_id`, `required_scope`, `held_scopes`, `request_id` | Scope mismatch |
| Token revocation failed — rate limited | `warn` | `user_id`, `request_id`, `rate_limit_key`, `retry_after_seconds` | Abuse or misconfigured client |
| Token revocation failed — internal error | `error` | `user_id`, `token_id`, `request_id`, `error_message`, `stack_trace` | Database or service layer failure |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_token_revoke_requests_total` | Counter | `status` (204/400/401/403/404/429/500) | Total token revocation API requests by response status |
| `codeplane_user_token_revoke_duration_seconds` | Histogram | `status` | Request-to-response latency for the revoke endpoint |
| `codeplane_user_token_self_revocations_total` | Counter | — | Number of times a user revoked the token they were currently authenticated with |
| `codeplane_user_tokens_active` | Gauge | — | Total number of non-revoked tokens across all users (system-wide, decremented on revocation). Shared with the LIST spec. |

### Alerts

#### Alert: Token Revoke Endpoint Error Rate

- **Condition**: `rate(codeplane_user_token_revoke_requests_total{status="500"}[5m]) / rate(codeplane_user_token_revoke_requests_total[5m]) > 0.05` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check server error logs for the `DELETE /api/user/tokens/:id` endpoint — filter by `request_id` and look for database connection failures, query errors, or service exceptions.
  2. Verify database health: connection pool saturation, query latency on `access_tokens` table, table locks. A `DELETE` query on `access_tokens` should be sub-millisecond under normal conditions.
  3. Check if a recent deployment introduced a regression in the `deleteToken` service method or the route handler.
  4. Verify the `access_tokens(id, user_id)` index is healthy and not corrupted.
  5. If the issue is intermittent, check for database failover or network instability between the server and database.
  6. Escalate to database on-call if the issue persists beyond 15 minutes.

#### Alert: Unusual Revocation Spike

- **Condition**: `rate(codeplane_user_token_revoke_requests_total{status="204"}[5m]) > 100` sustained for 5 minutes.
- **Severity**: Informational
- **Runbook**:
  1. Check if a single user is revoking many tokens (bulk cleanup behavior — likely benign).
  2. Check if multiple users are revoking tokens simultaneously (possible coordinated response to a security incident).
  3. Cross-reference with `auth.token_revoked` telemetry events — check the `user_id` distribution.
  4. If a single user is revoking hundreds of tokens, check whether their account may be compromised and someone is trying to deny them access.
  5. If this coincides with an active security incident, engage the security response process.
  6. No immediate action required for normal bulk cleanup.

#### Alert: Elevated 401 Rate on Revoke Endpoint

- **Condition**: `rate(codeplane_user_token_revoke_requests_total{status="401"}[5m]) > 30` sustained for 10 minutes.
- **Severity**: Informational
- **Runbook**:
  1. This may indicate automated systems attempting to revoke tokens with stale or revoked credentials.
  2. Check IP distribution — concentrated IPs may indicate a misconfigured CI pipeline or attack.
  3. Cross-reference with recent bulk revocations — if tokens were recently mass-revoked, systems holding those tokens may be retrying revocation requests.
  4. No immediate action unless correlated with other suspicious activity.

#### Alert: Token Revoke Latency Spike

- **Condition**: `histogram_quantile(0.99, rate(codeplane_user_token_revoke_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query performance for `DELETE FROM access_tokens WHERE id = $1 AND user_id = $2`.
  2. Check for table-level locks on `access_tokens` that may be blocking deletes.
  3. Check overall database IO/CPU — the delete query should be extremely fast (< 10ms) under normal conditions.
  4. If latency is isolated to specific requests, check whether those requests involve concurrent operations on the same row.
  5. If the issue is systemic, check connection pool health and network latency to the database.

### Error Cases and Failure Modes

| Failure Mode | Impact | Behavior |
|-------------|--------|----------|
| Database unavailable | User cannot revoke tokens | `500 Internal Server Error`; logged at `error` level |
| Database query timeout | Revocation may or may not have succeeded | `500`; client should retry — the subsequent call will return either `204` (if retry succeeds) or `404` (if the original call actually completed). Both are safe outcomes. |
| Auth middleware failure | Request treated as unauthenticated | `401 Unauthorized`; logged at `warn` level |
| Scope check failure | User gets a permission error | `403 Forbidden`; logged at `info` level |
| Token ID parsing failure | Client sent a non-integer ID | `400 Bad Request`; logged at `warn` level |
| Race condition: concurrent delete of same token | One succeeds, one gets 404 | Both outcomes are correct; no data corruption |
| Race condition: token used for auth while being deleted | Auth middleware may pass if it resolved before delete committed | The in-flight request completes; the next request with that token fails. Acceptable eventual consistency. |
| Network timeout (client-side) | Client is unsure if revocation succeeded | Client should retry; outcome is safe (either `204` on retry success or `404` if first call succeeded) |
| Rate limit exceeded | User cannot revoke tokens temporarily | `429 Too Many Requests` with `Retry-After`; logged at `warn` |

## Verification

### API Integration Tests

- [ ] **Revoke token — happy path**: Create a token, revoke it via `DELETE /api/user/tokens/:id` → `204 No Content` with empty body.
- [ ] **Revoke token — token no longer in list**: Create a token, revoke it, call `GET /api/user/tokens` → revoked token is absent from the list.
- [ ] **Revoke token — revoked token fails authentication**: Create a token, use it to make an authenticated request (succeeds), revoke it, use it again for an authenticated request → `401 Unauthorized`.
- [ ] **Revoke token — self-revocation**: Authenticate with token A (which has `write:user` scope), revoke token A → `204`. Next request with token A → `401`.
- [ ] **Revoke token — session cookie auth**: Authenticate via session cookie, revoke a PAT → `204`.
- [ ] **Revoke token — exchange-minted token**: Create a token via key-auth exchange (name: `"codeplane-cli"`), revoke it → `204`.
- [ ] **Revoke token — non-existent token ID**: `DELETE /api/user/tokens/999999` → `404 Not Found` with `{"error":"not_found","message":"token not found"}`.
- [ ] **Revoke token — already revoked token (double-revoke)**: Create token, revoke it → `204`, revoke same ID again → `404`.
- [ ] **Revoke token — another user's token**: User A creates token, User B authenticates and tries `DELETE /api/user/tokens/:userA_token_id` → `404 Not Found`.
- [ ] **Revoke token — unauthenticated**: No `Authorization` header, no session → `401 Unauthorized`.
- [ ] **Revoke token — PAT without write:user scope (read:user only)**: `DELETE /api/user/tokens/:id` with `read:user` scoped token → `403 Forbidden`.
- [ ] **Revoke token — PAT without any user scope (read:repository only)**: → `403 Forbidden`.
- [ ] **Revoke token — PAT with write:user scope**: → `204`.
- [ ] **Revoke token — PAT with all scope**: → `204`.
- [ ] **Revoke token — PAT with admin scope**: → `204`.
- [ ] **Revoke token — token ID is 0**: → `400 Bad Request` with `"invalid token id"`.
- [ ] **Revoke token — token ID is negative (-1)**: → `400 Bad Request` with `"invalid token id"`.
- [ ] **Revoke token — token ID is non-numeric ("abc")**: → `400 Bad Request`.
- [ ] **Revoke token — token ID is a float (42.5)**: → `400 Bad Request`.
- [ ] **Revoke token — token ID is very large (9999999999)**: → `404 Not Found`.
- [ ] **Revoke token — empty token ID path segment**: `DELETE /api/user/tokens/` → `404` or `405` (route not matched).
- [ ] **Revoke token — response body is empty on 204**: Read response body → zero bytes.
- [ ] **Revoke token — response content-type on error**: 400, 401, 403, 404 responses all have `Content-Type: application/json`.
- [ ] **Revoke token — Bearer scheme (lowercase)**: `Authorization: Bearer codeplane_<valid>` → succeeds.
- [ ] **Revoke token — token scheme**: `Authorization: token codeplane_<valid>` → succeeds.
- [ ] **Revoke token — BEARER scheme (uppercase)**: `Authorization: BEARER codeplane_<valid>` → succeeds.
- [ ] **Revoke token — rate limit headers present**: Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- [ ] **Revoke token — rate limit exhaustion**: Exceed the rate limit → `429 Too Many Requests` with `Retry-After`.
- [ ] **Revoke token — concurrent revocation of same token**: Send two `DELETE` requests for the same token ID concurrently → one gets `204`, the other gets `404`. No server error.
- [ ] **Revoke token — HTTP methods other than DELETE**: `POST /api/user/tokens/:id` → `405 Method Not Allowed`. `GET /api/user/tokens/:id` → `405` (or route-defined behavior). `PUT /api/user/tokens/:id` → `405`.
- [ ] **Revoke token — verify `last_used_at` was populated before revocation**: Create a token, use it to authenticate a request, verify its `last_used_at` is non-null in the list, then revoke it → confirms the token lifecycle tracking was working.
- [ ] **Revoke token — user with multiple tokens revokes one**: User has tokens A, B, C. Revoke B. List tokens → A and C are present, B is absent.
- [ ] **Revoke token — user revokes all tokens one by one**: User has tokens A, B, C. Revoke A → `204`, revoke B → `204`, revoke C → `204`. List tokens → `[]`.
- [ ] **Revoke token — deactivated user's PAT cannot revoke**: PAT belonging to a deactivated user → `401 Unauthorized`.
- [ ] **Revoke token — suspended user's PAT cannot revoke**: PAT belonging to a user with `prohibit_login = true` → `401 Unauthorized`.

### CLI E2E Tests

- [ ] **`codeplane auth token delete <id> --yes` succeeds**: Create a token, delete it with `--yes` → exit code 0, success message.
- [ ] **`codeplane auth token delete <id> --yes --json` returns JSON**: → exit code 0, JSON output with `{"ok": true}`.
- [ ] **`codeplane auth token delete` then verify with list**: Create token, note ID, delete it, run `codeplane auth token list --json` → token is not in the list.
- [ ] **`codeplane auth token delete` for non-existent ID**: `codeplane auth token delete 999999 --yes` → non-zero exit code, error message.
- [ ] **`codeplane auth token delete` for non-existent ID (JSON)**: `codeplane auth token delete 999999 --yes --json` → non-zero exit code, JSON error output.
- [ ] **`codeplane auth token delete` without `--yes` in non-interactive mode**: → non-zero exit code, message about requiring confirmation.
- [ ] **`codeplane auth token delete` with no arguments**: → non-zero exit code, usage message.
- [ ] **`codeplane auth token delete abc --yes`**: Non-numeric ID → non-zero exit code, error message.
- [ ] **`codeplane auth token delete` without authentication**: `--token ""` → non-zero exit code, auth error message.
- [ ] **`codeplane auth token delete` with read-only token**: `--token $READ_TOKEN` → non-zero exit code, permission error.
- [ ] **`codeplane auth token delete` double-delete**: Create token, delete it, delete it again → first succeeds, second fails with not-found error.
- [ ] **`codeplane auth token delete` with `-y` short flag**: Create token, delete it with `-y` → exit code 0 (verifies alias works).
- [ ] **Create-delete-create round-trip**: Create token A, delete A, create token B → B gets a new ID (not reusing A's ID). List → only B appears.

### Playwright (Web UI) E2E Tests

- [ ] **Revoke button visible**: Navigate to `/settings/tokens` with at least one token → each token row has a "Revoke" button.
- [ ] **Revoke button opens confirmation dialog**: Click "Revoke" → a modal appears with the token name, warning text, and "Cancel" / "Revoke token" buttons.
- [ ] **Confirmation dialog shows correct token name**: Create a token named "My Test Token", click Revoke → dialog body contains "My Test Token".
- [ ] **Cancel closes dialog without revoking**: Click "Revoke", then click "Cancel" → dialog closes, token still appears in the list.
- [ ] **Escape closes dialog without revoking**: Click "Revoke", press Escape → dialog closes, token still appears in the list.
- [ ] **Backdrop click closes dialog without revoking**: Click "Revoke", click outside the dialog → dialog closes, token still appears in the list.
- [ ] **Confirm revokes and removes token**: Click "Revoke", click "Revoke token" → dialog closes, token disappears from the list, success toast appears.
- [ ] **Revoke button shows loading state during request**: Click "Revoke token" → button shows a spinner and is disabled until the request completes.
- [ ] **Success toast appears after revocation**: After revoking → a toast notification with "Token revoked successfully" appears.
- [ ] **Token list updates without full page reload**: Verify the page does not navigate or fully reload after revocation — only the table updates.
- [ ] **Revoke all tokens leaves empty state**: Create one token, revoke it → the empty state message appears ("You don't have any personal access tokens yet.").
- [ ] **Revoke one of multiple tokens**: User has 3 tokens, revoke the middle one → the other two remain in the list, in correct order.
- [ ] **Error state in dialog**: Simulate a network error during revocation → the dialog stays open, an error message appears inside the dialog, the user can retry or cancel.
- [ ] **Revoked token fails authentication**: After revoking a token via the UI, use the revoked token's raw value (from creation) to call the API directly → `401`.
- [ ] **Long token name in confirmation dialog**: Token with a 255-character name → the full name is displayed in the dialog (not truncated).

### Security-Focused Tests

- [ ] **Cross-user isolation**: User A creates a token. User B authenticates and sends `DELETE /api/user/tokens/:userA_token_id` → `404`. User A's token is still valid.
- [ ] **No token metadata in 204 response**: Intercept the `DELETE /api/user/tokens/:id` response → response body is exactly empty.
- [ ] **404 response does not distinguish ownership**: User B sends `DELETE /api/user/tokens/:userA_token_id` → `404` with `"token not found"`. User B sends `DELETE /api/user/tokens/99999999` (non-existent) → `404` with `"token not found"`. The responses are identical.
- [ ] **Authorization header redacted in logs**: After making a revoke request, search server logs → the `Authorization` header value does not appear.
- [ ] **Token ID logged but not token hash**: After making a revoke request, search server logs → `token_id` appears, but no `token_hash` or raw `codeplane_` prefixed string appears.
- [ ] **Query-string auth not accepted**: `DELETE /api/user/tokens/:id?token=codeplane_<valid>` → `401` (query-string auth is not supported).
- [ ] **Revocation is a hard delete**: After revoking a token, verify via direct database query (test-only) that the row no longer exists in the `access_tokens` table — it is not soft-deleted or marked as revoked.

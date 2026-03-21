# USER_CONNECTED_ACCOUNT_REMOVE

Specification for USER_CONNECTED_ACCOUNT_REMOVE.

## High-Level User POV

When you have linked an external identity provider — such as GitHub — to your Codeplane account, you may at some point want to disconnect it. Perhaps you changed GitHub accounts, you want to reduce the external services that can authenticate into your Codeplane account, or you simply no longer need the integration. The **connected account removal** feature gives you a clean, safe way to sever that link.

You access this from your account settings under "Connected Accounts," where each linked provider displays a Disconnect button. When you click it, Codeplane asks you to confirm that you really want to disconnect the provider. Once confirmed, the connection is removed immediately. The external service can no longer be used to sign into your Codeplane account, and the entry disappears from your connected accounts list.

Codeplane protects you from accidentally locking yourself out. If the provider you are trying to disconnect is your only remaining way to sign into Codeplane — meaning you have no SSH keys registered and no other connected provider — Codeplane will refuse the disconnection and explain why. You must set up an alternative authentication method first before you can remove the last one.

Disconnecting a provider does not delete your Codeplane account, your repositories, or any data. It only removes the identity link. If you later want to re-connect the same provider, you can do so through the standard OAuth sign-in flow, and Codeplane will create a fresh connection record.

This feature is strictly private. Only you can disconnect your own connected accounts. No administrator, teammate, or anonymous visitor can trigger this action on your behalf.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user can disconnect a connected account by specifying the account's numeric ID.
- [ ] A successful disconnection returns an empty response with HTTP status `204 No Content`.
- [ ] After disconnection, the removed account no longer appears in the `GET /api/user/connections` list.
- [ ] After disconnection, the user can no longer sign into Codeplane using the removed provider's OAuth flow (until they re-link it).
- [ ] If the connected account being removed is the user's **only remaining authentication method** (no SSH keys registered and no other connected accounts), the request is rejected with HTTP `409 Conflict` and a clear error message explaining why.
- [ ] Attempting to disconnect an account that does not exist returns `404 Not Found`.
- [ ] Attempting to disconnect an account that belongs to another user returns `404 Not Found` (not `403`, to prevent enumeration).
- [ ] An unauthenticated request returns `401 Unauthorized` with no data leakage.
- [ ] The feature works identically whether the user authenticates via session cookie or personal access token.
- [ ] The Web UI shows a confirmation dialog before executing the disconnect action.
- [ ] The Web UI refreshes the connected accounts list after a successful disconnect, removing the disconnected provider from the page without a full page reload.

### Edge Cases

- [ ] A user with one connected account and at least one SSH key can disconnect the connected account (SSH key is an alternative auth method).
- [ ] A user with two connected accounts and no SSH keys can disconnect one of them (the other connected account remains as an auth method).
- [ ] A user with one connected account and zero SSH keys cannot disconnect it; the request returns `409 Conflict` with message `"cannot remove the last authentication method"`.
- [ ] Disconnecting a provider that was used for the current active session does not terminate the session immediately (the session remains valid until it expires naturally or is revoked).
- [ ] Disconnecting and then immediately re-listing connected accounts returns a list that does not contain the removed entry — the operation is strongly consistent.
- [ ] Disconnecting a connected account, then re-linking the same provider via OAuth, produces a new record with a new `id` and fresh `created_at` timestamp.
- [ ] Concurrent disconnect requests for the same account ID by the same user: the first succeeds with `204`, the second returns `404` (already deleted).
- [ ] A request with the account ID `0` returns `400 Bad Request` with message `"invalid account id"`.
- [ ] A request with the account ID `-1` returns `400 Bad Request`.
- [ ] A request with a non-numeric account ID (e.g., `"abc"`, `"null"`, `""`) returns `400 Bad Request`.
- [ ] A request with an extremely large numeric account ID (e.g., `99999999999999`) that does not exist returns `404 Not Found`.
- [ ] A request with a floating-point account ID (e.g., `"3.14"`) returns `400 Bad Request`.

### Boundary Constraints

- [ ] The `:id` path parameter must be a positive integer (> 0).
- [ ] The `:id` path parameter must parse as a valid 32-bit signed integer (max value `2147483647`).
- [ ] The request body is ignored (DELETE requests with extraneous body content do not cause errors).
- [ ] No query parameters are accepted or required.
- [ ] The operation is idempotent in terms of side effects: deleting an already-deleted account simply returns `404`.

## Design

### API Shape

**Endpoint:** `DELETE /api/user/connections/:id`

**Authentication:** Required. Session cookie or `Authorization: token <PAT>` header.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | The numeric ID of the connected account to remove (as returned by `GET /api/user/connections`). |

**Request Body:** None. Any body content is ignored.

**Success Response:** `204 No Content`

No response body.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Invalid account ID (non-numeric, zero, negative, float) | `{ "message": "invalid account id" }` |
| `401` | Missing or invalid authentication | `{ "message": "authentication required" }` |
| `404` | Account ID does not exist or belongs to another user | `{ "message": "connected account not found" }` |
| `409` | Removing this account would leave the user with no authentication methods | `{ "message": "cannot remove the last authentication method" }` |
| `429` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| `500` | Unexpected server error | `{ "message": "internal server error" }` |

**Response Headers:**

| Header | Value | Condition |
|--------|-------|-----------|
| `X-RateLimit-Limit` | Numeric | Always |
| `X-RateLimit-Remaining` | Numeric | Always |
| `X-RateLimit-Reset` | Numeric (epoch seconds) | Always |
| `Cache-Control` | `no-store` | Always |

### SDK Shape

The shared SDK exposes `UserService.deleteConnectedAccount(userID, accountID)` which:

- Accepts a numeric user ID (from auth context) and a numeric connected account ID (from path parameter).
- Returns `Result<void, APIError>`.
- Validates that `accountID` is a positive integer, returning `badRequest("invalid account id")` if not.
- Before deleting, checks that the user would still have at least one remaining authentication method (another connected account or at least one SSH key). Returns `conflict("cannot remove the last authentication method")` if removal would leave zero methods.
- Delegates to the `deleteOAuthAccount` database function, which includes a `WHERE user_id = $2` clause to enforce ownership.
- If the delete operation affected zero rows (account does not exist or does not belong to the user), returns `notFound("connected account not found")`.
- On success, returns `Result.ok(undefined)`.

### CLI Command

Connected account removal is available via the generic API command:

```bash
codeplane api /api/user/connections/42 --method DELETE
```

**Output:** No stdout output on success (204 response). Exit code `0` on success, non-zero on error with error message to stderr.

A future dedicated `codeplane auth connections remove <id>` subcommand may be added, but the current product surface is the generic `api` command.

### Web UI Design

The disconnect action is triggered from within the **User Settings → Connected Accounts** page (`USER_CONNECTED_ACCOUNTS_UI`).

**Disconnect Button:**

- Each connected account card/row includes a **Disconnect** button.
- The button is styled as a destructive action (red text or red-outlined button) to signal the irreversible nature of the action.
- The button label is "Disconnect".
- When the user has only one connected account **and** zero SSH keys, the button is **disabled** and displays a tooltip on hover: "You cannot disconnect your only authentication method. Add an SSH key or connect another provider first."
- When the user has only one connected account but at least one SSH key, the button remains active.

**Confirmation Dialog:**

- Clicking the active Disconnect button opens a confirmation dialog (modal).
- Dialog title: "Disconnect {Provider}?" (e.g., "Disconnect GitHub?")
- Dialog body: "This will remove the link between your Codeplane account and your {Provider} account ({provider_user_id}). You will no longer be able to sign in using {Provider} unless you reconnect it."
- Two action buttons:
  - **Cancel** (secondary/neutral) — closes the dialog with no action.
  - **Disconnect** (destructive/red) — executes the `DELETE` request.
- While the DELETE request is in flight, the Disconnect button in the dialog shows a loading spinner and is disabled to prevent double-submission.

**Post-Disconnect Behavior:**

- On `204` success: the dialog closes, a success toast notification appears ("GitHub disconnected successfully"), and the connected accounts list re-fetches and re-renders without the removed entry.
- On `409` conflict: the dialog displays an inline error message — "Cannot disconnect: this is your only authentication method. Add an SSH key or connect another provider first." The dialog remains open.
- On `404`: the dialog displays an inline error — "This connected account was already removed." The dialog closes and the list re-fetches.
- On `401`: the user is redirected to the login page.
- On `500` or network error: the dialog displays an inline error — "Something went wrong. Please try again." with a Retry button.

**Accessibility:**

- The confirmation dialog traps focus and is closable via Escape key.
- The Disconnect button has `aria-label="Disconnect {Provider} account"`.
- The disabled state conveys the reason via `aria-describedby` pointing to the tooltip text.

### TUI UI

The TUI does not currently have a dedicated connected accounts management screen. Connected account removal is accessible via the generic API flow. If a TUI connected accounts screen is added in the future, it should support:

- Selecting a connected account row and pressing `d` or `Delete` to trigger disconnection.
- A confirmation prompt: "Disconnect GitHub? (y/N)"
- Success message: "Disconnected GitHub."
- Error messages matching the API error conditions.

### Documentation

End-user documentation should cover:

- **"Disconnecting a connected account"** guide explaining:
  - How to disconnect a provider from the web settings page, including the confirmation step.
  - How to disconnect a provider via the CLI using `codeplane api /api/user/connections/:id --method DELETE`.
  - What happens when you disconnect (you can no longer sign in via that provider; your Codeplane data is unaffected).
  - That you must have at least one remaining authentication method — either another connected account or an SSH key — before Codeplane will allow disconnection.
  - How to re-connect a provider after disconnecting (sign in via OAuth again).
  - Clarification that disconnecting does not revoke Codeplane's access token on the provider side — if the user wants to revoke Codeplane's access from GitHub's settings, they must do so on GitHub separately.
- **API reference** for `DELETE /api/user/connections/:id` documenting the path parameter, authentication requirements, success response, all error codes, and the last-auth-method protection behavior.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Authenticated user (self)** | ✅ Can disconnect their own connected accounts |
| **Other authenticated user** | ❌ Cannot disconnect another user's connected account. Returns `404` to prevent enumeration. |
| **Organization admin** | ❌ Cannot disconnect a member's connected accounts through this endpoint |
| **Site admin** | ❌ Cannot disconnect a user's connected account through this endpoint (admin audit/management surfaces are separate) |
| **Anonymous / unauthenticated** | ❌ `401 Unauthorized` |

The endpoint is strictly self-scoped. The user ID is derived from the authenticated session context, not from a URL parameter. The database query enforces ownership via `WHERE id = $1 AND user_id = $2`, making IDOR attacks ineffective.

### Rate Limiting

- **Authenticated users:** Subject to the standard authenticated rate limit (5,000 requests/hour).
- **Unauthenticated callers:** Subject to the standard unauthenticated rate limit (60 requests/hour) — they will hit `401` before any deletion is performed, but the rate limit still applies.
- **Burst protection for destructive actions:** An additional stricter rate limit of **10 DELETE requests per minute per user** on this endpoint to prevent mass-deletion abuse, accidental or programmatic.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in every response.
- Exceeding the rate limit returns `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- The DELETE endpoint does not return any connected account data in the response body (204 No Content).
- Error responses do not leak whether a given account ID exists for a different user — both "does not exist" and "belongs to another user" return identical `404` responses.
- Server logs must **not** log the `provider_user_id` of the account being deleted at INFO level or below. The deletion event may be logged at DEBUG/AUDIT level with the Codeplane `user_id` and `account_id`, but external provider identifiers should be omitted or redacted.
- Deletion is a hard delete — the `oauth_accounts` row is removed from the database entirely, including encrypted tokens. No soft-delete or tombstone is created in the connected accounts table. This supports data minimization principles.
- The audit log should record the fact that a disconnection occurred (user ID, provider name, timestamp) without storing the encrypted tokens that were removed.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `UserConnectedAccountRemoved` | Successful `DELETE /api/user/connections/:id` returning 204 | `user_id`, `account_id`, `provider` (e.g., "github"), `remaining_account_count`, `remaining_ssh_key_count`, `client` (web/cli/tui/api), `session_type` (cookie/pat) |
| `UserConnectedAccountRemoveBlocked` | `DELETE /api/user/connections/:id` returning 409 (last auth method) | `user_id`, `account_id`, `provider`, `client` |
| `UserConnectedAccountRemoveFailed` | `DELETE /api/user/connections/:id` returning 404, 400, or 500 | `user_id` (if authenticated), `account_id_raw`, `error_code`, `client` |

### Funnel Metrics

- **Disconnect initiation rate:** Of users who visit the connected accounts settings page, what percentage click the Disconnect button? High rates may signal dissatisfaction with the OAuth integration.
- **Disconnect confirmation rate:** Of users who open the confirmation dialog, what percentage confirm the disconnect? A low confirmation rate suggests the dialog is doing its job as a safety net.
- **Disconnect → re-link rate:** Of users who disconnect a provider, what percentage re-link the same provider within 30 days? High rates may indicate accidental disconnections or workflow issues.
- **Last-auth-method block rate:** How often does the `409 Conflict` protection trigger? If frequently, users may not understand they need an alternative auth method.
- **Post-disconnect sign-in failure rate:** Of users who disconnect a provider, do any subsequently fail to sign in within 7 days? This measures whether the feature causes lockout incidents.

### Success Indicators

- The endpoint has a p99 latency under 200ms.
- Zero occurrences of a user being locked out of their account due to connected account removal (the last-auth-method guard should prevent this).
- Zero occurrences of cross-user connected account deletion (IDOR).
- The `409 Conflict` guard successfully prevents every attempt to remove the last authentication method.
- Disconnect → re-link churn rate stays below 10% (indicating disconnections are intentional).

## Observability

### Logging

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Connected account disconnect requested | `DEBUG` | `user_id`, `account_id`, `request_id` | Log at entry to the route handler. Do **not** log `provider_user_id`. |
| Connected account disconnect succeeded | `INFO` | `user_id`, `account_id`, `provider`, `request_id` | Important lifecycle event — log provider name (e.g., "github") but not external user ID. |
| Connected account disconnect blocked (last auth method) | `WARN` | `user_id`, `account_id`, `provider`, `remaining_accounts`, `remaining_keys`, `request_id` | Important safety guard — worth warning-level visibility. |
| Connected account not found (404) | `DEBUG` | `user_id`, `account_id`, `request_id` | May indicate stale UI state or enumeration attempt. |
| Invalid account ID (400) | `DEBUG` | `user_id`, `raw_id`, `request_id` | Input validation failure. |
| Connected account disconnect failed (service error) | `ERROR` | `user_id`, `account_id`, `request_id`, `error_code`, `error_message` | Unexpected failure — needs investigation. |
| Auth failure on disconnect endpoint | `WARN` | `request_id`, `source_ip` | Potential unauthorized access attempt. |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_connections_delete_total` | Counter | `status` (204, 400, 401, 404, 409, 429, 500) | Total connected account disconnect requests by response status. |
| `codeplane_user_connections_delete_duration_seconds` | Histogram | — | Request duration histogram for the disconnect endpoint. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_user_connections_delete_last_auth_blocked_total` | Counter | `provider` | Total number of disconnect attempts blocked by the last-auth-method guard, by provider. |

### Alerts

#### Alert: `UserConnectionsDeleteHighErrorRate`

**Condition:** `rate(codeplane_user_connections_delete_total{status="500"}[5m]) / rate(codeplane_user_connections_delete_total[5m]) > 0.05`

**Severity:** Warning

**Runbook:**
1. Check server error logs filtered by `request_id` for the failing `DELETE /api/user/connections/:id` requests.
2. Verify database connectivity — the delete query is a simple `DELETE FROM oauth_accounts WHERE id = $1 AND user_id = $2`. Failures usually indicate a database connection issue.
3. Check if the `oauth_accounts` table is locked by a migration or long-running transaction.
4. Check if the last-auth-method check query (listing connected accounts and SSH keys) is failing upstream of the actual delete.
5. If the error is transient (e.g., connection pool exhaustion), monitor for 5 more minutes. If it persists, restart the server process and investigate connection pool settings.
6. Check for recent deployments that may have introduced a regression in the `deleteConnectedAccount` service method.
7. Escalate to the database team if the issue is upstream of the application.

#### Alert: `UserConnectionsDeleteHighLatency`

**Condition:** `histogram_quantile(0.99, rate(codeplane_user_connections_delete_duration_seconds_bucket[5m])) > 1.0`

**Severity:** Warning

**Runbook:**
1. Check database query latency for the `deleteOAuthAccount` query and the last-auth-method check queries.
2. Run `EXPLAIN ANALYZE` against `DELETE FROM oauth_accounts WHERE id = $1 AND user_id = $2` to check for missing indexes or bloat.
3. Verify that the index on `oauth_accounts(user_id)` exists and the `id` primary key index is healthy.
4. Check if the last-auth-method guard is executing slow queries (listing connected accounts and SSH keys).
5. Check overall database load and connection pool saturation.
6. If latency is isolated to specific requests, check if those requests involve unusually large transaction logs or cascading deletions.

#### Alert: `UserConnectionsDeleteLastAuthBlockSpike`

**Condition:** `rate(codeplane_user_connections_delete_last_auth_blocked_total[1h]) > 20`

**Severity:** Info

**Runbook:**
1. A spike in last-auth-method blocks may indicate a UX issue — users are seeing the Disconnect button but not understanding why they can't use it.
2. Check if the Web UI is correctly disabling the Disconnect button when the user has only one auth method. If the button is clickable, the UI guard is broken and needs fixing.
3. Check if the spike is from CLI/API usage (where there is no pre-check guard) vs. Web UI.
4. Review the provider distribution — if blocks are concentrated on one provider, it may indicate a population of users who signed up exclusively via that provider.
5. No immediate action required unless paired with user complaints or support tickets.

#### Alert: `UserConnectionsDeleteAuthFailureSpike`

**Condition:** `rate(codeplane_user_connections_delete_total{status="401"}[5m]) > 30`

**Severity:** Info

**Runbook:**
1. This may indicate a credential-stuffing attempt or automated script targeting the disconnect endpoint.
2. Check the source IP distribution in logs for auth failure entries.
3. If concentrated from a small number of IPs, consider temporary IP-level rate limiting or blocking.
4. Verify that legitimate clients are not sending expired tokens (e.g., after a session timeout, the Web UI should redirect to login rather than retrying the DELETE).
5. No immediate action required unless the rate exceeds 200/5m, in which case escalate to security.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | User Impact | Recovery |
|-------|-------------|-------|-------------|----------|
| Invalid account ID | 400 | Non-numeric, zero, negative, or float `:id` parameter | User sees error message | Fix the account ID; use the value from the connected accounts list |
| Unauthenticated | 401 | Missing/expired/invalid token or session | User sees login prompt or CLI error | Re-authenticate |
| Account not found | 404 | Account ID does not exist or belongs to another user | User sees "not found" error; no data leakage | Re-fetch the connected accounts list; the account may have already been removed |
| Last auth method | 409 | Removing this account would leave zero auth methods | User sees explanation of the guard | Add an SSH key or connect another provider first, then retry |
| Rate limited | 429 | Too many requests in window | User sees rate limit error with retry-after | Wait and retry after the reset window |
| Database unavailable | 500 | DB connection failure | User sees generic error | Automatic retry on next request; server health check should catch this |
| Concurrent delete race | 404 (second request) | Two requests to delete the same account; first succeeds, second finds no row | Second request sees "not found" | Benign; the account is already removed |

## Verification

### API Integration Tests

| # | Test | Expected Result |
|---|------|------------------|
| 1 | `DELETE /api/user/connections/:id` with valid PAT for a user with 2 connected accounts, removing one | `204 No Content`; subsequent `GET /api/user/connections` returns array without the removed entry |
| 2 | `DELETE /api/user/connections/:id` with no auth header | `401` with error message; no deletion occurs |
| 3 | `DELETE /api/user/connections/:id` with expired/revoked PAT | `401` |
| 4 | `DELETE /api/user/connections/:id` with invalid PAT format (e.g., `token garbage`) | `401` |
| 5 | `DELETE /api/user/connections/:id` where `:id` is `0` | `400` with `"invalid account id"` |
| 6 | `DELETE /api/user/connections/:id` where `:id` is `-1` | `400` with `"invalid account id"` |
| 7 | `DELETE /api/user/connections/:id` where `:id` is `abc` | `400` with `"invalid account id"` |
| 8 | `DELETE /api/user/connections/:id` where `:id` is `3.14` | `400` with `"invalid account id"` |
| 9 | `DELETE /api/user/connections/:id` where `:id` is an empty string (path: `/api/user/connections/`) | `400` or `404` (route does not match) |
| 10 | `DELETE /api/user/connections/:id` where `:id` is `null` (string literal) | `400` with `"invalid account id"` |
| 11 | `DELETE /api/user/connections/:id` where `:id` is `2147483647` (max int32) and does not exist | `404` |
| 12 | `DELETE /api/user/connections/:id` where `:id` is `2147483648` (exceeds int32) and does not exist | `400` or `404` |
| 13 | `DELETE /api/user/connections/:id` where `:id` is `99999999999999` (very large) and does not exist | `404` with `"connected account not found"` |
| 14 | `DELETE /api/user/connections/:id` for a valid account that belongs to a different user | `404` (not `403`); no deletion occurs on the other user's account |
| 15 | Cross-user isolation: User A deletes User B's connected account ID → `404`; User B's account is unaffected (verify via User B list) | `404` for A; B's list unchanged |
| 16 | `DELETE /api/user/connections/:id` for an account that does not exist at all | `404` with `"connected account not found"` |
| 17 | `DELETE /api/user/connections/:id` — delete the same account twice in sequence | First: `204`; Second: `404` |
| 18 | `DELETE /api/user/connections/:id` when user has 1 connected account and 0 SSH keys (last auth method) | `409` with `"cannot remove the last authentication method"` |
| 19 | `DELETE /api/user/connections/:id` when user has 1 connected account and 1 SSH key | `204` (SSH key serves as alternative auth) |
| 20 | `DELETE /api/user/connections/:id` when user has 2 connected accounts and 0 SSH keys | `204` (other connected account serves as alternative auth) |
| 21 | `DELETE /api/user/connections/:id` when user has 1 connected account and 2 SSH keys | `204` |
| 22 | After successful DELETE, verify `GET /api/user/connections` returns the correct reduced count | Array length decreases by 1 |
| 23 | After successful DELETE, verify the response status is exactly `204` (not `200` or `202`) | Status code === 204 |
| 24 | After successful DELETE, verify the response body is empty | Body is null or empty string |
| 25 | `DELETE /api/user/connections/:id` with session cookie auth (not PAT) | `204` on success (same behavior as PAT) |
| 26 | `DELETE /api/user/connections/:id` with request body `{"extra": "data"}` — body is ignored | `204` (body does not cause error) |
| 27 | After deleting a GitHub connected account, attempt to OAuth-sign-in as the same GitHub user — it creates a new connected account record (not reuse old) | New `GET /api/user/connections` shows entry with new `id` and fresh `created_at` |
| 28 | `DELETE /api/user/connections/:id` — response includes `Cache-Control: no-store` header | Assert header presence |
| 29 | `DELETE /api/user/connections/:id` — response includes rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) | Assert all three headers present |
| 30 | Concurrent DELETE requests for the same account ID (5 parallel) — exactly one returns `204`, the rest return `404` | One `204`, four `404`s; account is deleted exactly once |

### CLI E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 31 | `codeplane api /api/user/connections/42 --method DELETE` with valid auth for an existing account | Exit code `0`; no stdout (204 response) |
| 32 | `codeplane api /api/user/connections/42 --method DELETE` with empty/missing token | Exit code non-zero; stderr contains error message |
| 33 | `codeplane api /api/user/connections/0 --method DELETE` | Exit code non-zero; stderr contains `"invalid account id"` |
| 34 | Round-trip: list connections via CLI, pick an ID, delete it via CLI, list again, verify deleted ID is absent | Full lifecycle passes; exit codes are `0` for all valid operations |
| 35 | `codeplane api /api/user/connections/99999 --method DELETE` (non-existent ID) | Exit code non-zero; stderr contains "not found" |
| 36 | Attempting to delete last auth method via CLI | Exit code non-zero; stderr contains `"cannot remove the last authentication method"` |

### Playwright (Web UI) E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 37 | Navigate to Settings → Connected Accounts; click Disconnect on a provider with 2+ auth methods | Confirmation dialog appears with correct provider name and external ID |
| 38 | In the confirmation dialog, click Cancel | Dialog closes; connected accounts list is unchanged |
| 39 | In the confirmation dialog, click Disconnect | Loading spinner appears on button; after success, dialog closes, success toast appears, provider card removed from list |
| 40 | After disconnecting, the connected accounts list no longer shows the removed provider | Assert the provider card/row is absent from the DOM |
| 41 | When only one connected account and no SSH keys, the Disconnect button is disabled | Button has `disabled` attribute; tooltip explains why |
| 42 | When only one connected account but at least one SSH key, the Disconnect button is enabled | Button is clickable; disconnect succeeds |
| 43 | When API returns `409` (simulated via network interception), the dialog shows the appropriate error message | Inline error message visible in the dialog; dialog remains open |
| 44 | When API returns `500` (simulated via network interception), the dialog shows a generic error message with Retry button | Error banner with Retry visible; clicking Retry re-sends the request |
| 45 | When API returns `404` (account already removed), the dialog shows "already removed" message and list refreshes | Dialog closes; list re-fetches and reflects the removal |
| 46 | Confirmation dialog is closable via Escape key | Dialog closes; no action taken |
| 47 | Confirmation dialog traps focus (keyboard focus does not leave the dialog) | Tab cycling stays within the dialog |
| 48 | Disconnect button has correct `aria-label` | `aria-label` matches "Disconnect {Provider} account" |
| 49 | Double-clicking the Disconnect confirmation button does not send two requests | Only one `DELETE` request is sent (button disabled during request) |
| 50 | Navigate to Settings → Connected Accounts while unauthenticated | Redirected to login page; no disconnect action is possible |

### Boundary and Stress Tests

| # | Test | Expected Result |
|---|------|------------------|
| 51 | Disconnect with `:id` at maximum valid integer (2147483647) that does not exist | `404`; no server error |
| 52 | Disconnect with `:id` at 2147483648 (int32 overflow) | `400` or `404`; no server crash |
| 53 | Disconnect with `:id` as a URL-encoded special character string (e.g., `%00`, `%27`) | `400`; no server crash or injection |
| 54 | Rapid sequential disconnects (10 requests in 1 second for different valid account IDs) — all succeed if accounts exist | All return `204`; rate limit not exceeded if under burst threshold |
| 55 | Rapid sequential disconnects (20 requests in 1 second for different valid account IDs) — rate limiting kicks in | Some return `429` after the burst limit is exceeded |
| 56 | `DELETE /api/user/connections/:id` response time is under 200ms for a user with 3 connected accounts and 5 SSH keys | Assert response latency (the last-auth-method check should be fast) |
| 57 | `DELETE /api/user/connections/:id` response time is under 200ms for the simple case (user has 2 connected accounts, no SSH keys) | Assert response latency |

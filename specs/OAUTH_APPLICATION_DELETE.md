# OAUTH_APPLICATION_DELETE

Specification for OAUTH_APPLICATION_DELETE.

## High-Level User POV

When you no longer need an OAuth2 application — because the integration it powered has been retired, you're rotating credentials and prefer to start fresh, or you simply registered it by mistake — you delete it from JJHub. Deleting an OAuth2 application is a permanent, irreversible action that immediately and completely removes the application registration and revokes every token that was ever issued through it.

The moment you confirm the deletion, every access token and refresh token that the application issued to any user stops working. Third-party services or bots that rely on those tokens will begin receiving authentication errors on their next API call. Authorization codes that were in flight — for example, a user who was in the middle of granting access on the consent screen — become invalid. There is no grace period, no soft-delete, and no recovery path. If you need the integration again, you must register a new application from scratch with a new client ID and client secret.

You can delete an application from the **Settings → OAuth Applications** page in the web UI, via the CLI, or through the API. On the web, clicking the "Delete" action on an application row opens a confirmation dialog that names the application and clearly explains the consequences: that all issued tokens will be revoked, that the client ID and secret will stop working, and that this action cannot be undone. You must type the application name to confirm. In the CLI, the command prompts for confirmation unless you pass a `--yes` flag to skip it for scripted workflows.

Only you — the owner who registered the application — can delete it. No other user, organization member, or administrator can delete your application through this endpoint. This is the same ownership boundary that governs listing and viewing applications. After deletion, the application disappears from your list, and its client ID can never be reused. Anyone who previously authorized your application will no longer see it in their list of authorized applications, and the tokens it issued on their behalf are silently cleaned up.

This feature gives developers confidence that decommissioning an integration is clean and final. You don't have to worry about orphaned tokens floating around after removing an application — everything associated with it is removed atomically.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can permanently delete an OAuth2 application they own through the API, Web UI, and CLI — with all associated tokens and authorization codes revoked, proper confirmation workflows enforced, ownership isolation maintained, and all edge cases below handled correctly.

### Functional Criteria

- [ ] An authenticated user can delete an OAuth2 application they own via `DELETE /api/oauth2/applications/:id`.
- [ ] The server returns `204 No Content` with an empty body on successful deletion.
- [ ] The application record is permanently removed from the database — this is a hard delete, not a soft delete.
- [ ] All access tokens issued by the deleted application are revoked (deleted from the database) as part of the same operation.
- [ ] All refresh tokens issued by the deleted application are revoked (deleted from the database) as part of the same operation.
- [ ] All in-flight authorization codes associated with the deleted application are invalidated (deleted from the database) as part of the same operation.
- [ ] After deletion, the application no longer appears in `GET /api/oauth2/applications` (the owner's list).
- [ ] After deletion, `GET /api/oauth2/applications/:id` for the deleted ID returns `404 Not Found`.
- [ ] After deletion, any attempt to initiate an OAuth2 authorization flow using the deleted application's `client_id` fails with an appropriate error.
- [ ] After deletion, any attempt to exchange a token using the deleted application's `client_id` and `client_secret` fails.
- [ ] After deletion, any access token previously issued by the application returns `401 Unauthorized` when used to authenticate API requests.
- [ ] After deletion, any refresh token previously issued by the application fails to produce a new access token.
- [ ] The deletion is scoped by `owner_id` — only the application's owner can delete it. Attempting to delete another user's application returns `404 Not Found` (not `403`), to avoid leaking the existence of other users' applications.
- [ ] Deleting an application that does not exist returns `404 Not Found`.
- [ ] Deleting an application with a non-numeric `:id` parameter returns `400 Bad Request` with `"invalid application id"`.
- [ ] The endpoint requires authentication. Unauthenticated requests receive `401 Unauthorized`.
- [ ] The deletion is idempotent in the sense that deleting an already-deleted application returns `404` — it does not crash, return `500`, or produce side effects.
- [ ] The deletion does not affect other applications owned by the same user.
- [ ] The deletion does not affect applications owned by other users.

### Edge Cases

- [ ] **Empty token set**: Application was registered but never used in an authorization flow → `204`, no token cleanup errors.
- [ ] **Active tokens from multiple users**: Application issued tokens to 10 different users → all tokens are revoked, `204` returned.
- [ ] **Expired tokens**: Application has tokens that have already expired → `204`, no errors from cleaning up already-expired records.
- [ ] **In-flight authorization code**: An authorization code was issued but not yet exchanged → code is invalidated, `204` returned.
- [ ] **Double-delete**: Delete an application, then attempt to delete it again → first returns `204`, second returns `404`.
- [ ] **Cross-user delete attempt**: User A tries to delete User B's application → `404 Not Found`.
- [ ] **Non-numeric ID**: `DELETE /api/oauth2/applications/abc` → `400 Bad Request`.
- [ ] **Negative ID**: `DELETE /api/oauth2/applications/-1` → `404 Not Found`.
- [ ] **Zero ID**: `DELETE /api/oauth2/applications/0` → `404 Not Found`.
- [ ] **Very large ID**: `DELETE /api/oauth2/applications/999999999999` → `404 Not Found`.
- [ ] **Floating-point ID**: `DELETE /api/oauth2/applications/1.5` → deterministic behavior (`400` or `parseInt → 1`).
- [ ] **Concurrent delete requests**: Two simultaneous `DELETE` requests for the same application → one returns `204`, the other returns `404`. No data corruption.
- [ ] **Delete then use client_id**: Authorization flow with deleted client_id → fails.
- [ ] **Delete then use access token**: Previously valid token → `401`.
- [ ] **Network interruption**: Atomic transaction ensures either full deletion or no deletion.

### Boundary Constraints

- [ ] Application `:id` parameter: Must be a positive integer when parsed via `parseInt(id, 10)`. `NaN` results in `400`.
- [ ] Ownership enforcement: The `DELETE` query includes both `id` and `owner_id` in the `WHERE` clause.
- [ ] Token cascade: All tokens (access, refresh) and authorization codes referencing the application's `app_id` must be removed.
- [ ] Response body: `204 No Content` responses must have an empty body.

## Design

### API Shape

**Endpoint**: `DELETE /api/oauth2/applications/:id`

**Authentication**: Required. Session cookie or PAT.

**Path parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer (in URL) | Yes | The numeric ID of the OAuth2 application to delete. |

**Request body**: None. Any request body is ignored.

**Success response**: `204 No Content` — no response body.

**Error responses**:

| Status | Condition | Body shape |
|--------|-----------|------------|
| `400` | Non-numeric `:id` parameter | `{ "message": "invalid application id" }` |
| `401` | No auth session/token | `{ "message": "authentication required" }` |
| `404` | Application not found, or not owned by the authenticated user | `{ "message": "oauth2 application not found" }` |
| `500` | Database failure during deletion | `{ "message": "internal server error" }` |

**Cascading behavior**: The service layer must ensure all of the following are deleted atomically (within a single transaction):
1. All rows in `oauth2_access_tokens` where `app_id` matches the deleted application
2. All rows in `oauth2_refresh_tokens` where `app_id` matches the deleted application
3. All rows in `oauth2_authorization_codes` where `app_id` matches the deleted application
4. The row in `oauth2_applications` matching `id` and `owner_id`

### SDK Shape

The `OAuth2Service.deleteApplication(appID, ownerID)` method in `@jjhub/sdk`:
- Accepts `appID: number` and `ownerID: number`
- Returns `Promise<void>`
- Throws `notFound("oauth2 application not found")` if zero rows are deleted
- Throws `internal(...)` on database failure
- Must cascade-delete all associated access tokens, refresh tokens, and authorization codes within a single transaction

### CLI Command

**Command**: `jjhub auth oauth2 delete <id>`

**Aliases**: `jjhub auth oauth2 rm <id>`, `jjhub auth oauth2 remove <id>`

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | The numeric ID of the application to delete |

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--yes` | `-y` | boolean | `false` | Skip confirmation prompt |
| `--json` | | boolean | `false` | Output result as JSON |

**Interactive behavior** (no `--yes`):
```
⚠ You are about to delete OAuth2 application "My Integration" (ID: 42).

This will:
  • Permanently delete the application registration
  • Revoke all access tokens issued through this application
  • Revoke all refresh tokens issued through this application
  • Invalidate the client ID and client secret

This action cannot be undone.

Are you sure? [y/N]:
```

**Standard output**: `Deleted OAuth2 application "My Integration" (ID: 42).`

**JSON output**: `{ "deleted": true, "id": 42 }`

**Exit codes**: 0 = success or user aborted, 1 = error.

Raw API access: `jjhub api /api/oauth2/applications/42 --method DELETE`

### Web UI Design

**Location**: Settings > OAuth Applications (`/settings/oauth-applications`)

**Delete trigger**: Each application row has a destructive-styled "Delete" action in the Actions column.

**Confirmation dialog**:
1. Title: "Delete OAuth2 application?"
2. Body explains consequences: all tokens revoked, client ID invalidated, action is permanent.
3. Name confirmation input: user must type the exact application name to enable the delete button.
4. Cancel button dismisses with no effect.
5. Delete button: red/destructive styling, disabled until name matches, shows loading spinner during request.

**Post-deletion**: Dialog closes, success toast appears, table re-fetches and the application is removed. If `404` (concurrent deletion), warning toast appears instead.

**Error handling**: Dialog stays open with error message and re-enabled delete button on `500`.

### Documentation

1. **OAuth2 Applications guide** (`/docs/guides/oauth2-applications`): Update "Managing Applications → Delete an Application" section covering deletion semantics, token revocation, all surfaces (Web, CLI, API with curl examples).
2. **CLI reference** (`/docs/cli/auth-oauth2-delete`): Document arguments, flags, confirmation behavior, output formats, examples.
3. **API reference** (`/docs/api/oauth2-applications#delete`): Document the DELETE endpoint with request/response shapes, error codes, cascading behavior.

## Permissions & Security

### Authorization Roles

| Role | Can delete OAuth2 applications? |
|------|---------------------------------|
| Authenticated user (session) — owns the application | Yes |
| Authenticated user (PAT) — owns the application | Yes |
| Authenticated user — does NOT own the application | No — returns `404` (not `403`, to avoid leaking existence) |
| OAuth2 token holder (third-party) | No — OAuth2 tokens carry third-party trust level and cannot manage OAuth2 applications or other credentials |
| Admin — for another user's application | No — admin cannot delete another user's applications through this endpoint |
| Unauthenticated / Anonymous | No — returns `401 Unauthorized` |

### Rate Limiting

- **Standard mutation rate limit** applies to `DELETE /api/oauth2/applications/:id`, consistent with other write/delete endpoints.
- **Burst protection**: The global rate limiter prevents a single user from flooding the endpoint.
- **No elevated or reduced rate limit**: Deletion is low-frequency and uses the standard mutation limit.

### Data Privacy and PII

- **Deletion is permanent**: Application metadata (name, redirect URIs, scopes, client ID) is removed from the database.
- **Token cleanup removes user associations**: Access and refresh tokens linking the application to authorizing users are deleted.
- **Audit logging must not include secrets**: Logs should include `application_id`, `client_id`, and `owner_id`, but never the client secret hash, token values, or token hashes.
- **No cross-user data exposure**: The `404` response for non-owned applications prevents enumeration of another user's application IDs.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | When fired |
|-------|-----------|------------|
| `OAuth2ApplicationDeleted` | `application_id`, `client_id`, `owner_id`, `confidential`, `application_age_days`, `access_token_count_revoked`, `refresh_token_count_revoked`, `surface` (`api`/`web`/`cli`), `timestamp` | On successful `204` response |
| `OAuth2ApplicationDeleteFailed` | `owner_id`, `attempted_application_id`, `error_code` (`not_found`/`unauthorized`/`system`), `surface`, `timestamp` | On error response |
| `OAuth2ApplicationDeleteConfirmationAborted` | `owner_id`, `application_id`, `surface` (`web`/`cli`), `timestamp` | When user cancels confirmation dialog or declines CLI prompt |

### Funnel Metrics

- **Delete rate**: Number of applications deleted per week as a percentage of total applications — indicates active portfolio management.
- **Delete-to-recreate rate**: Percentage of users who delete an application and create a new one within 24 hours — indicates credential rotation behavior.
- **Confirmation abort rate**: `OAuth2ApplicationDeleteConfirmationAborted` events relative to total deletion attempts — indicates confirmation UX quality (healthy range: 10-40%).
- **Application lifespan**: Median age of applications at deletion — indicates typical integration lifecycle duration.
- **Post-delete authorization failures**: Count of `401` errors from previously-valid OAuth2 access tokens within 1 hour of deletion — indicates downstream disruption.

### Success Indicators

- Less than 1% of delete attempts result in a system error (500).
- Confirmation abort rate is between 10-40%.
- No orphaned tokens remain in the database after application deletion.
- Token-based `401` errors after deletion resolve within 1 hour.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-----------------|
| OAuth2 application deletion attempt | `info` | `owner_id`, `application_id` |
| OAuth2 application deleted successfully | `info` | `owner_id`, `application_id`, `client_id`, `access_tokens_revoked`, `refresh_tokens_revoked`, `authorization_codes_invalidated`, `duration_ms` |
| OAuth2 application deletion — not found | `warn` | `owner_id`, `attempted_application_id`, `request_ip` |
| OAuth2 application deletion — invalid ID | `warn` | `owner_id`, `raw_id_param`, `request_ip` |
| OAuth2 application deletion — unauthenticated | `warn` | `request_ip`, `user_agent` |
| OAuth2 application deletion — system error | `error` | `owner_id`, `application_id`, `error_message`, `stack_trace`, `duration_ms` |
| OAuth2 application deletion — token cascade failure | `error` | `owner_id`, `application_id`, `cascade_step`, `error_message`, `stack_trace` |

**Critical rules**: `client_secret_hash` and token hashes must NEVER appear in logs. `client_id` MAY appear. Log token counts, not token values.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `jjhub_oauth2_applications_deleted_total` | Counter | `status` (`success`, `not_found`, `unauthorized`, `invalid_id`, `system_error`) | Total delete requests by outcome |
| `jjhub_oauth2_application_delete_duration_seconds` | Histogram | `status` | Latency of the deletion endpoint |
| `jjhub_oauth2_application_delete_tokens_revoked_total` | Counter | `token_type` (`access`, `refresh`, `authorization_code`) | Total tokens revoked as cascade side effect |
| `jjhub_oauth2_applications_active_total` | Gauge | | Current total active OAuth2 applications (decremented on delete) |

### Alerts

#### Alert: `OAuth2ApplicationDeleteErrorRateHigh`
**Condition**: `rate(jjhub_oauth2_applications_deleted_total{status="system_error"}[5m]) > 0.1`
**Severity**: Warning
**Runbook**:
1. Check server logs for `error`-level entries with `oauth2` and `delete` context.
2. Determine if errors are in app delete step or token cascade step via `cascade_step` field.
3. Check for foreign key constraint issues on token tables.
4. Verify database health: connection pool, replication lag, disk space.
5. If transaction deadlock, monitor for 10 minutes (may self-resolve).
6. If database healthy and no deadlocks, check for code regressions in `OAuth2Service.deleteApplication`.
7. Escalate to platform team if infrastructure-related.

#### Alert: `OAuth2ApplicationDeleteLatencyHigh`
**Condition**: `histogram_quantile(0.95, rate(jjhub_oauth2_application_delete_duration_seconds_bucket[5m])) > 5`
**Severity**: Warning
**Runbook**:
1. Check token cascade volume via `jjhub_oauth2_application_delete_tokens_revoked_total`.
2. Run `EXPLAIN ANALYZE` on cascade delete queries; verify `app_id` indexes exist.
3. Check for table bloat or vacuum backlog on token tables.
4. Check for lock contention from concurrent token operations.
5. If isolated to one large-token-count application, this is expected; consider batched cascade in future.

#### Alert: `OAuth2ApplicationDelete404Spike`
**Condition**: `rate(jjhub_oauth2_applications_deleted_total{status="not_found"}[5m]) > 5`
**Severity**: Info
**Runbook**:
1. Check structured logs for requesting `owner_id` and `attempted_application_id`.
2. Single user with repeated 404s = benign cleanup script.
3. Different users targeting sequential IDs = possible enumeration attack; check source IPs.
4. If enumeration confirmed, verify rate limiter; consider IP-level blocking.
5. No action if transient.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Invalid application ID | 400 | Non-numeric `:id` parameter | Fix ID to valid integer |
| Authentication required | 401 | No session/PAT | Log in or provide valid token |
| Application not found | 404 | Wrong ID or not owned by user | Verify ID and ownership |
| Database failure (cascade) | 500 | DB error during token cleanup | Retry; check DB health |
| Database failure (app delete) | 500 | DB error during app deletion | Retry; transaction rolled back |
| Transaction deadlock | 500 | Concurrent operations on same app | Retry after short delay |

## Verification

### API Integration Tests

- [ ] **Happy path — delete existing application**: Create an application, `DELETE /api/oauth2/applications/:id` → `204 No Content`, empty response body.
- [ ] **Deleted application no longer in list**: Create an application, delete it, `GET /api/oauth2/applications` → deleted application is absent.
- [ ] **Deleted application returns 404 on get**: Create, delete, `GET /api/oauth2/applications/:id` → `404`.
- [ ] **Double delete returns 404**: Create, delete (→ `204`), delete again (→ `404`).
- [ ] **Delete non-existent application**: `DELETE /api/oauth2/applications/999999` → `404`.
- [ ] **Delete with non-numeric ID (`abc`)**: → `400` with `"invalid application id"`.
- [ ] **Delete with floating-point ID (`1.5`)**: → deterministic behavior (400 or parseInt → 1).
- [ ] **Delete with negative ID (`-1`)**: → `404`.
- [ ] **Delete with zero ID (`0`)**: → `404`.
- [ ] **Delete with very large ID (`9999999999999`)**: → `404`.
- [ ] **Delete unauthenticated**: No credentials → `401`.
- [ ] **Ownership isolation**: User A creates app, User B attempts delete → `404`.
- [ ] **Delete does not affect other applications**: Create A, B, C. Delete B. List → A and C present, B absent.
- [ ] **Delete the only application**: Create one, delete it, list → `[]`.
- [ ] **Cascade — access tokens revoked**: Create app, complete authorization flow, verify access token works, delete app, verify access token → `401`.
- [ ] **Cascade — refresh tokens revoked**: Create app, issue token pair, verify refresh works, delete app, verify refresh fails.
- [ ] **Cascade — authorization codes invalidated**: Create app, obtain auth code (don't exchange), delete app, attempt exchange → fails.
- [ ] **Delete application with zero tokens**: Create app (never authorize), delete → `204`, no errors.
- [ ] **Delete application with tokens from multiple users**: 3 users authorize app, delete app → `204`, all 3 users' tokens revoked.
- [ ] **Response body is empty on 204**: Verify no body content on `204`.
- [ ] **Concurrent delete of same application**: Two simultaneous DELETEs → one `204`, one `404`, no `500`.
- [ ] **Delete then create new application**: Delete, create new → new app gets new `id` and `client_id`.
- [ ] **Rate limiting on delete endpoint**: Exceed rate limit → `429`.

### CLI Integration Tests

- [ ] **CLI delete via `api` subcommand**: Create app, `jjhub api /api/oauth2/applications/:id --method DELETE` → exit code 0.
- [ ] **CLI delete then verify in list**: Create, delete via CLI, list via API → absent.
- [ ] **CLI delete non-existent application**: → non-zero exit code or error output.
- [ ] **CLI delete with invalid ID**: → error response.
- [ ] **CLI delete unauthenticated**: → exit code 1, authentication error.
- [ ] **CLI `auth oauth2 delete` interactive confirmation (accept)**: Type `y` → application deleted.
- [ ] **CLI `auth oauth2 delete` interactive confirmation (reject)**: Type `n` → exits 0, application still exists.
- [ ] **CLI `auth oauth2 delete --yes`**: Skips confirmation, deletes directly.
- [ ] **CLI `auth oauth2 delete --json`**: Outputs `{ "deleted": true, "id": <id> }`.

### E2E Tests — Playwright (Web UI)

- [ ] **Delete button visible in application list**: Create app, navigate to settings → "Delete" action present.
- [ ] **Confirmation dialog opens**: Click Delete → dialog with app name, warning text, name-input field.
- [ ] **Delete button disabled until name typed**: Empty/wrong name → button disabled.
- [ ] **Delete button enabled when name matches**: Exact name typed → button enabled.
- [ ] **Cancel dismisses without deleting**: Click Cancel → dialog closes, app still in list.
- [ ] **Escape dismisses without deleting**: Press Escape → dialog closes, app still in list.
- [ ] **Successful deletion removes app from list**: Complete confirmation → dialog closes, toast appears, app removed.
- [ ] **Success toast message**: Toast reads `OAuth2 application "<name>" deleted.`
- [ ] **Loading state during deletion**: Intercept to delay → spinner on button, both buttons disabled.
- [ ] **Error state in dialog**: Intercept to return 500 → error message in dialog, button re-enables.
- [ ] **404 during delete (concurrent)**: Intercept to return 404 → dialog closes, warning toast, table refreshes.
- [ ] **Empty state after deleting last app**: Delete only app → empty state displayed.
- [ ] **Delete one of many**: Delete middle app from 3 → remaining 2 displayed correctly.
- [ ] **Keyboard accessibility**: Dialog navigable via Tab, Enter, Escape.
- [ ] **Delete preserves scroll position**: Scroll to app in long list, delete → scroll preserved.

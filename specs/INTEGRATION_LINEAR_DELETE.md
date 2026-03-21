# INTEGRATION_LINEAR_DELETE

Specification for INTEGRATION_LINEAR_DELETE.

## High-Level User POV

When you no longer want a Linear team connected to a Codeplane repository — because the project has ended, the team has moved to a different tool, or the integration was configured incorrectly — you remove it. Removing a Linear integration is a permanent, irreversible action that immediately disconnects the sync link between the Linear team and the Codeplane repository.

The moment you confirm the removal, the integration stops syncing. New issues created in Linear will no longer flow to Codeplane, and new Codeplane issues will no longer flow to Linear. The encrypted OAuth tokens that powered the sync are permanently deleted from Codeplane's servers. Webhook deliveries from Linear for this team will stop being processed. There is no soft-disable (that is a separate "pause" capability) — this is a full teardown of the integration record. If you want to reconnect the same Linear team later, you must go through the OAuth flow and configuration steps again from scratch.

You can remove an integration from the Codeplane web UI, the CLI, or the API. On the web, clicking "Remove" in the integration's action menu opens a confirmation dialog that names the Linear team and the Codeplane repository and clearly explains that sync will stop and tokens will be deleted. You must confirm before anything happens. From the CLI, `codeplane extension linear remove <id>` deletes the integration immediately and prints a confirmation. Through the API, a `DELETE` request produces a clean `204 No Content` response.

Only you — the user who created the integration — can remove it. No other user can see or delete your integrations through this endpoint, even if they are an organization admin for the same repository. Historical sync records and issue/comment mapping data are preserved for audit purposes after removal, but the live sync link and stored credentials are gone permanently.

This feature gives users confidence that decommissioning an integration is clean and final. You don't need to worry about orphaned credentials or phantom sync operations continuing after you've decided to disconnect.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can permanently delete a Linear integration they own through the API, Web UI, and CLI — with encrypted tokens removed, sync stopped, ownership isolation enforced, confirmation workflows in place, and all edge cases below handled correctly.

### Functional Criteria

- [ ] An authenticated user can delete a Linear integration they own via `DELETE /api/integrations/linear/:id`.
- [ ] The server returns `204 No Content` with an empty body on successful deletion.
- [ ] The integration record is permanently removed from the `linear_integrations` table — this is a hard delete, not a soft delete.
- [ ] Encrypted access tokens and refresh tokens stored for this integration are deleted as part of the integration record removal.
- [ ] After deletion, the integration no longer appears in `GET /api/integrations/linear` (the user's list).
- [ ] After deletion, `GET /api/integrations/linear/:id` for the deleted integration ID returns `404 Not Found` (when a get-by-ID endpoint exists) or simply does not appear in the list.
- [ ] After deletion, Linear webhook deliveries referencing this integration's team are no longer processed (no matching active integration found).
- [ ] After deletion, triggering `POST /api/integrations/linear/:id/sync` for the deleted integration returns `404 Not Found`.
- [ ] The deletion is scoped by `user_id` — only the integration's creator can delete it. Attempting to delete another user's integration returns `404 Not Found` (not `403`), to avoid leaking the existence of other users' integrations.
- [ ] Deleting an integration that does not exist returns `404 Not Found`.
- [ ] Deleting an integration with a non-numeric `:id` parameter returns `400 Bad Request` with `"invalid integration id"`.
- [ ] The endpoint requires authentication. Unauthenticated requests receive `401 Unauthorized` with `{ "error": "authentication required" }`.
- [ ] The deletion is idempotent in the sense that deleting an already-deleted integration returns `404` — it does not crash, return `500`, or produce side effects.
- [ ] The deletion does not affect other integrations owned by the same user.
- [ ] The deletion does not affect integrations owned by other users.
- [ ] Historical `linear_issue_map`, `linear_comment_map`, and `linear_sync_ops` records referencing the deleted integration's ID are preserved for audit trail purposes — they are NOT cascade-deleted.
- [ ] The feature flag `INTEGRATION_LINEAR_DELETE` gates this endpoint. When disabled, the endpoint returns `404 Not Found` or is not mounted.

### Edge Cases

- [ ] **Integration with no synced data**: Integration was created but never synced (no issue maps, no comment maps, no sync ops) → `204`, no cleanup errors.
- [ ] **Integration with extensive sync history**: Integration has hundreds of issue maps, comment maps, and sync ops → `204` returned promptly; historical data preserved.
- [ ] **Integration that was paused (`is_active: false`)**: Deleting an inactive integration → `204`, record removed.
- [ ] **Integration that was actively syncing**: Deleting while a sync is in flight → `204`, integration deleted; in-flight sync fails gracefully on its next DB lookup.
- [ ] **Double-delete**: Delete an integration, then attempt to delete it again → first returns `204`, second returns `404`.
- [ ] **Cross-user delete attempt**: User A tries to delete User B's integration → `404 Not Found`.
- [ ] **Non-numeric ID**: `DELETE /api/integrations/linear/abc` → `400 Bad Request` with `"invalid integration id"`.
- [ ] **Negative ID**: `DELETE /api/integrations/linear/-1` → `404 Not Found`.
- [ ] **Zero ID**: `DELETE /api/integrations/linear/0` → `404 Not Found`.
- [ ] **Very large ID**: `DELETE /api/integrations/linear/999999999999` → `404 Not Found`.
- [ ] **Floating-point ID**: `DELETE /api/integrations/linear/1.5` → deterministic behavior (`400` or `parseInt → 1`).
- [ ] **Concurrent delete requests**: Two simultaneous `DELETE` requests for the same integration → one returns `204`, the other returns `404`. No data corruption.
- [ ] **Request body present but ignored**: Sending a JSON body with the DELETE request → body is ignored, deletion proceeds normally.
- [ ] **Empty `:id` path segment**: `DELETE /api/integrations/linear/` → should not match the route (caught by router).

### Boundary Constraints

- [ ] Integration `:id` parameter: Must be a positive integer when parsed via `parseInt(id, 10)`. `NaN` results in `400`.
- [ ] Ownership enforcement: The delete query includes both `id` and `user_id` in the `WHERE` clause — this is the sole authorization mechanism.
- [ ] Response body: `204 No Content` responses must have an empty body.
- [ ] If `deleteLinearIntegration` deletes zero rows (no match on `id + user_id`), the service must throw a `notFound` error.

## Design

### API Shape

**Endpoint**: `DELETE /api/integrations/linear/:id`

**Authentication**: Required. Session cookie or PAT-based `Authorization` header.

**Path parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer (in URL) | Yes | The numeric ID of the Linear integration to delete. |

**Request body**: None. Any request body is ignored.

**Success response**: `204 No Content` — no response body.

**Error responses**:

| Status | Condition | Body shape |
|--------|-----------|------------|
| `400` | Non-numeric `:id` parameter | `{ "error": "invalid integration id" }` |
| `401` | No auth session/token | `{ "error": "authentication required" }` |
| `404` | Integration not found, or not owned by the authenticated user | `{ "error": "integration not found" }` |
| `404` | Feature flag `INTEGRATION_LINEAR_DELETE` disabled | Not found / not mounted |
| `500` | Database failure during deletion | `{ "error": "internal server error" }` |

**Deletion behavior**: The service layer deletes the row from `linear_integrations` matching both the `id` and the authenticated user's `user_id`. Associated rows in `linear_issue_map`, `linear_comment_map`, and `linear_sync_ops` are intentionally preserved as historical audit records. The service must verify that at least one row was deleted; if zero rows were affected, it throws a `notFound` error.

### SDK Shape

The `linearService.deleteIntegration(userId, integrationId)` method in the service layer must:

1. Call `deleteLinearIntegration(sql, { id: String(integrationId), userId: String(userId) })` from the generated SQL layer.
2. Verify that the deletion affected at least one row. If zero rows were deleted, throw `notFound("integration not found")`.
3. Return `void` on success.

The method must NOT:
- Cascade-delete `linear_issue_map`, `linear_comment_map`, or `linear_sync_ops` rows.
- Attempt to deregister webhooks from Linear's API (webhook delivery failures will be handled gracefully by the webhook handler when it finds no matching active integration).
- Return the deleted integration object.

### Web UI Design

**Location**: Integrations page (`/integrations/linear`)

**Delete trigger**: Each integration card/row in the list has a kebab/overflow menu. The menu contains a destructive-styled "Remove" action item (red text).

**Confirmation dialog**:
1. Title: "Remove Linear integration?"
2. Body: "This will permanently disconnect the **{team_name} ({team_key})** Linear team from **{repo_owner}/{repo_name}**. Sync will stop immediately and stored OAuth credentials will be deleted. This action cannot be undone."
3. Cancel button: dismisses the dialog with no side effects.
4. Remove button: red/destructive styling, shows a loading spinner during the request.

**Post-deletion behavior**:
- Dialog closes.
- Success toast appears: "Linear integration removed."
- Integration list re-fetches and the removed integration disappears.
- If the deleted integration was the last one, the empty state is displayed with the "Connect Linear" CTA.

**Error handling**:
- `404` response (concurrent deletion): dialog closes, warning toast "Integration was already removed." appears, list refreshes.
- `500` response: dialog stays open, inline error message displayed, Remove button re-enables.
- Network failure: dialog stays open, inline error message, Remove button re-enables.

### CLI Command

**Command**: `codeplane extension linear remove <id>`

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer (positional) | Yes | The numeric ID of the integration to remove |

**Behavior**:
- Sends `DELETE /api/integrations/linear/:id` using the CLI's API client.
- On success (204): prints `{ "status": "removed", "id": <id> }` as JSON to stdout.
- On `401`: shows the standard CLI auth error directing user to `codeplane auth login`. Exit code 1.
- On `400` (invalid ID): shows error message. Exit code 1.
- On `404` (not found or not owned): shows "Integration not found" error. Exit code 1.
- On `500`: shows "Internal server error" message. Exit code 1.

**Raw API access**: `codeplane api /api/integrations/linear/42 --method DELETE`

**Example**:
```
$ codeplane extension linear remove 42
{ "status": "removed", "id": 42 }
```

### TUI UI

The TUI does not currently have a dedicated Linear integrations screen. When a TUI-level integrations view is implemented (tracked under `INTEGRATION_LINEAR_UI`), the delete action should be available through a focused-item action menu. For this feature, no TUI changes are required.

### Documentation

1. **Linear Integration guide** (`/docs/guides/linear-integration`): The "Manage an Existing Integration" section already includes `codeplane extension linear remove 7`. Update this section to add a paragraph explaining the consequences of removal: sync stops, tokens deleted, historical data preserved, and how to reconnect if needed.
2. **CLI Reference: `codeplane extension linear remove`**: Document the positional `id` argument, output format, error cases, and example usage.
3. **API Reference: `DELETE /api/integrations/linear/:id`**: Document the endpoint with path parameters, authentication requirements, response codes, and example `curl` invocations:
   ```bash
   curl -X DELETE https://codeplane.example.com/api/integrations/linear/42 \
     -H "Authorization: Bearer <token>"
   ```

## Permissions & Security

### Authorization Roles

| Role | Can delete Linear integrations? | Notes |
|------|---------------------------------|-------|
| Authenticated user (session) — owns the integration | Yes | Ownership is the sole authorization |
| Authenticated user (PAT) — owns the integration | Yes | Same behavior as session auth |
| Authenticated user — does NOT own the integration | No — returns `404` (not `403`, to avoid leaking existence) | User-scoped WHERE clause |
| Organization Admin — for another user's integration | No — returns `404` | Organization admins cannot delete other users' integrations through this endpoint |
| Unauthenticated / Anonymous | No — returns `401 Unauthorized` | Standard auth requirement |

**Important**: The delete endpoint uses the same ownership model as the list endpoint — strictly user-scoped. The `user_id` column in the `WHERE` clause of the delete query is the sole authorization boundary. There is no separate permission check beyond authentication + ownership.

### Rate Limiting

- **Standard mutation rate limit** applies to `DELETE /api/integrations/linear/:id`, consistent with other write/delete endpoints.
- **Burst protection**: The global rate limiter prevents a single user from flooding the endpoint.
- **No elevated or reduced rate limit**: Deletion is low-frequency and uses the standard mutation limit.
- **Rate limit response**: `429 Too Many Requests` with a `Retry-After` header and structured JSON error body `{ "error": "rate limit exceeded" }`.

### Data Privacy & PII

- **Encrypted tokens permanently deleted**: The integration record, including `access_token_encrypted` and `refresh_token_encrypted`, is hard-deleted from the database. No residual token material remains.
- **Webhook secret deleted**: The `webhook_secret` associated with the integration is removed.
- **Audit records preserved**: `linear_sync_ops` records are retained. These contain integration IDs and entity IDs but no PII or secrets.
- **No cross-user enumeration**: The `404` response for non-owned integrations prevents enumeration of another user's integration IDs.
- **Audit logs must not include secrets**: Logs should include `integration_id` and `user_id` but never token values, token hashes, or webhook secrets.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `LinearIntegrationDeleted` | On successful `204` response | `user_id`, `integration_id`, `linear_team_id`, `linear_team_key`, `codeplane_repo_id`, `codeplane_repo_owner`, `codeplane_repo_name`, `integration_age_days`, `was_active` (boolean), `had_synced` (boolean, based on `last_sync_at`), `surface` (`api`/`web`/`cli`), `timestamp` |
| `LinearIntegrationDeleteFailed` | On error response (400, 404, 500) | `user_id`, `attempted_integration_id`, `error_code` (`invalid_id`/`not_found`/`unauthorized`/`system`), `surface`, `timestamp` |
| `LinearIntegrationDeleteConfirmationAborted` | When user cancels confirmation dialog in web UI | `user_id`, `integration_id`, `surface` (`web`), `timestamp` |

### Funnel Metrics

The delete endpoint sits at the end of the integration lifecycle funnel:

1. **OAuth Start** → `LinearOAuthStartInitiated`
2. **OAuth Callback** → `LinearOAuthCallbackCompleted`
3. **Setup Resolution** → `LinearOAuthSetupResolved`
4. **Integration Created** → `LinearIntegrationCreated`
5. **Integration List Viewed** → `LinearIntegrationListViewed`
6. **Sync Triggered** → `LinearSyncTriggered`
7. **Integration Deleted** → `LinearIntegrationDeleted` ← this feature

### Success Indicators

- **Deletion rate**: Number of `LinearIntegrationDeleted` events per week as a percentage of total active integrations. Low, steady deletion is healthy (portfolio management). A sudden spike may indicate a product problem.
- **Integration lifespan**: Median number of days between `LinearIntegrationCreated` and `LinearIntegrationDeleted` for the same integration. Longer lifespans indicate the integration is providing sustained value. Target: median lifespan > 30 days.
- **Delete-then-recreate rate**: Percentage of users who delete an integration and create a new one for the same Linear team + Codeplane repo within 24 hours. High rate may indicate misconfiguration friction. Target: < 10%.
- **Confirmation abort rate**: `LinearIntegrationDeleteConfirmationAborted` events relative to total web-initiated delete attempts. Healthy range: 10-40%. Below 10% suggests the confirmation is too easy to bypass; above 40% suggests the copy is too alarming.
- **Error rate**: Percentage of `LinearIntegrationDeleteFailed` events with `error_code=system` relative to total delete attempts. Target: < 0.5%.
- **Surface distribution**: Breakdown of `surface` property. Healthy usage shows both web and CLI adoption.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Linear integration deletion attempt | `INFO` | `user_id`, `integration_id`, `request_id` | Handler entry, before service call |
| Linear integration deleted successfully | `INFO` | `user_id`, `integration_id`, `request_id`, `duration_ms` | Successful deletion |
| Linear integration deletion — not found | `WARN` | `user_id`, `attempted_integration_id`, `request_id`, `remote_addr` | Zero rows deleted |
| Linear integration deletion — invalid ID | `WARN` | `user_id`, `raw_id_param`, `request_id`, `remote_addr` | `parseInt` produces `NaN` |
| Linear integration deletion — unauthenticated | `WARN` | `request_id`, `remote_addr`, `user_agent` | No valid session or PAT |
| Linear integration deletion — system error | `ERROR` | `user_id`, `integration_id`, `request_id`, `error_message`, `stack_trace`, `duration_ms` | Database failure or unexpected exception |
| Linear integration deletion — rate limited | `WARN` | `user_id`, `request_id`, `rate_limit_key`, `retry_after` | Rate limit hit |

**Log rules**:
- Never log encrypted tokens, webhook secrets, or token hashes at any level.
- Always include `request_id` for correlation.
- Log `integration_id` (the numeric ID), not the integration's internal metadata.
- Do not log the response body (it is empty on 204).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_linear_integration_delete_total` | Counter | `status` (`success`, `not_found`, `invalid_id`, `unauthorized`, `rate_limited`, `system_error`) | Total delete requests by outcome |
| `codeplane_linear_integration_delete_duration_seconds` | Histogram | `status` | End-to-end request duration from handler entry to response |
| `codeplane_linear_integrations_active_total` | Gauge | — | Current total active Linear integrations (decremented on delete of active integration) |

### Alerts

#### Alert: `LinearIntegrationDeleteErrorRateHigh`
- **Condition**: `rate(codeplane_linear_integration_delete_total{status="system_error"}[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `ERROR`-level entries with `linear integration deletion — system error` context, filtered to the alert window. Examine `error_message` and `stack_trace`.
  2. Verify database connectivity. Run `SELECT 1` against the primary database.
  3. Check if the `linear_integrations` table is locked or experiencing contention. Look for long-running transactions: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%linear_integrations%'`.
  4. Check recent deployments for regressions in the `deleteIntegration` service method or the `deleteLinearIntegration` SQL wrapper.
  5. If the error is transient (e.g., brief connection pool exhaustion), monitor for auto-recovery within 5 minutes.
  6. If persistent, escalate to the integrations team with the error log entries and affected integration IDs.

#### Alert: `LinearIntegrationDeleteLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_linear_integration_delete_duration_seconds_bucket[5m])) > 3`
- **Severity**: Warning
- **Runbook**:
  1. The delete endpoint should respond in < 100ms at p95 under normal conditions (single-row DELETE with indexed `id + user_id`).
  2. Check `codeplane_linear_integration_delete_duration_seconds` histogram to determine if latency is sustained or a one-off spike.
  3. Run `EXPLAIN ANALYZE` on `DELETE FROM linear_integrations WHERE id = $1 AND user_id = $2`. Verify that both `id` and `user_id` columns have an index.
  4. Check for table lock contention (concurrent inserts, updates, or vacuum).
  5. Check server resource utilization (CPU, memory, event loop lag, connection pool saturation).
  6. If isolated to database, investigate vacuum backlog or index bloat. If application-level, check for middleware-introduced latency.

#### Alert: `LinearIntegrationDelete404Spike`
- **Condition**: `rate(codeplane_linear_integration_delete_total{status="not_found"}[5m]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Check structured logs for the requesting `user_id` and `attempted_integration_id` values.
  2. If a single user is making repeated 404 requests with sequential or random IDs → possible enumeration attempt. Check source IPs.
  3. If a single user is retrying the same ID → likely a benign retry from a script or UI that didn't update state after the first successful delete.
  4. If different users targeting sequential IDs → possible enumeration attack. Verify rate limiter is engaging. Consider IP-level blocking if rate is aggressive.
  5. No action if transient or caused by benign cleanup scripts.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Log Level |
|-------------|-------------|---------------------|--------------------||
| User not authenticated | 401 | `"authentication required"` | WARN |
| Feature flag disabled | 404 | Not found | — |
| Non-numeric integration ID | 400 | `"invalid integration id"` | WARN |
| Integration not found or not owned | 404 | `"integration not found"` | WARN |
| Database connection failure | 500 | `"internal server error"` | ERROR: full connection error |
| Database query timeout | 500 | `"internal server error"` | ERROR: timeout details |
| Service method throws unexpected exception | 500 | `"internal server error"` | ERROR: full stack trace |
| Rate limit exceeded | 429 | `"rate limit exceeded"` | WARN |

## Verification

### API Integration Tests

1. **Happy path — delete existing integration**: Create an integration for a test user. Send `DELETE /api/integrations/linear/:id` with valid session. Assert status `204`. Assert empty response body.

2. **Deleted integration no longer in list**: Create an integration. Delete it. Send `GET /api/integrations/linear`. Assert the deleted integration's ID does not appear in the response array.

3. **Double delete returns 404**: Create an integration. Delete it (→ `204`). Delete it again (→ `404` with `"integration not found"`).

4. **Delete non-existent integration**: Send `DELETE /api/integrations/linear/999999` with valid session. Assert `404`.

5. **Delete with non-numeric ID (`abc`)**: Send `DELETE /api/integrations/linear/abc`. Assert `400` with `"invalid integration id"`.

6. **Delete with floating-point ID (`1.5`)**: Send `DELETE /api/integrations/linear/1.5`. Assert deterministic behavior (either `400` or `parseInt` truncates to `1` and proceeds as normal).

7. **Delete with negative ID (`-1`)**: Send `DELETE /api/integrations/linear/-1`. Assert `404`.

8. **Delete with zero ID (`0`)**: Send `DELETE /api/integrations/linear/0`. Assert `404`.

9. **Delete with very large ID (`9999999999999`)**: Send `DELETE /api/integrations/linear/9999999999999`. Assert `404`.

10. **Delete unauthenticated**: Send `DELETE /api/integrations/linear/:id` without credentials. Assert `401` with `"authentication required"`.

11. **Delete with expired PAT**: Send delete request with an expired/revoked PAT. Assert `401`.

12. **Delete with valid PAT authentication**: Create integration, send delete with valid PAT. Assert `204`.

13. **Ownership isolation — cannot delete another user's integration**: User A creates integration. User B sends `DELETE /api/integrations/linear/:id` for User A's integration ID. Assert `404`.

14. **Delete does not affect other integrations**: Create integrations A, B, C for the same user. Delete B. List integrations. Assert A and C are present, B is absent.

15. **Delete the only integration**: Create one integration. Delete it. List → `[]` (empty array, status `200`).

16. **Delete integration with no sync history**: Create integration that has never been synced (no issue maps, no sync ops). Delete it. Assert `204`.

17. **Delete integration with extensive sync history**: Create integration with issue maps, comment maps, and sync ops in the database. Delete the integration. Assert `204`. Assert historical `linear_issue_map`, `linear_comment_map`, and `linear_sync_ops` rows are NOT deleted (they remain in the database for audit).

18. **Delete inactive (paused) integration**: Create an integration and set `is_active = false`. Delete it. Assert `204`.

19. **Sync endpoint fails after delete**: Create integration. Delete it. Send `POST /api/integrations/linear/:id/sync`. Assert `404`.

20. **Webhook stops processing after delete**: Create integration with known `linear_team_id`. Delete integration. Send `POST /webhooks/linear` with a payload referencing that team. Assert the webhook handler does not find a matching active integration (graceful no-op or appropriate error).

21. **Concurrent delete of same integration**: Send two simultaneous `DELETE` requests for the same integration ID from the same user. Assert one returns `204` and the other returns `404`. Assert no `500` responses.

22. **Feature flag disabled returns 404**: Disable `INTEGRATION_LINEAR_DELETE` flag. Send authenticated delete request. Assert `404`.

23. **Response body is empty on 204**: Verify the response body has zero bytes on successful deletion. Verify `Content-Length` is 0 or absent.

24. **Content-Type header on error responses is JSON**: Assert `400`, `401`, and `404` error responses have `Content-Type: application/json`.

25. **Request body is ignored**: Send `DELETE /api/integrations/linear/:id` with a JSON request body (`{"foo": "bar"}`). Assert deletion proceeds normally and returns `204`.

26. **Rate limiting enforced**: Send delete requests exceeding the per-user rate limit. Assert `429` with `Retry-After` header.

27. **Delete then recreate integration for same team/repo**: Delete integration, then create a new integration for the same Linear team + Codeplane repo via `POST /api/integrations/linear`. Assert the new integration gets a new `id`.

28. **Maximum valid ID size (largest integer before overflow)**: Send `DELETE /api/integrations/linear/2147483647`. Assert `404` (not `400` or `500`).

29. **ID larger than max integer**: Send `DELETE /api/integrations/linear/99999999999999999999`. Assert deterministic behavior (either `400` if `parseInt` returns `NaN` or `Infinity`, or `404` if it truncates to a number).

### E2E Tests (Playwright)

30. **Remove action visible in integration list**: Sign in as a user with a configured Linear integration. Navigate to `/integrations/linear`. Assert the kebab/overflow menu contains a "Remove" action.

31. **Confirmation dialog opens on Remove click**: Click "Remove" from the action menu. Assert dialog appears with the team name, repository name, warning text, and Cancel + Remove buttons.

32. **Cancel dismisses dialog without deleting**: Click Cancel in the confirmation dialog. Assert dialog closes. Assert the integration is still present in the list.

33. **Escape key dismisses dialog without deleting**: Open confirmation dialog. Press Escape. Assert dialog closes. Assert integration still present.

34. **Successful removal updates the list**: Click Remove and confirm. Assert dialog closes. Assert success toast "Linear integration removed." appears. Assert the integration disappears from the list.

35. **Empty state shown after deleting last integration**: Create one integration. Delete it via the UI. Assert the empty state with "Connect Linear" CTA is displayed.

36. **Error state in dialog on 500**: Intercept the DELETE request and return 500. Click Remove and confirm. Assert the dialog stays open with an error message. Assert the Remove button is re-enabled.

37. **Concurrent deletion shows warning toast**: Intercept the DELETE request and return 404. Click Remove and confirm. Assert dialog closes. Assert warning toast "Integration was already removed." appears. Assert the list refreshes.

38. **Loading state during deletion**: Intercept the DELETE request to add a delay. Click Remove and confirm. Assert the Remove button shows a loading spinner and both buttons are disabled during the request.

39. **Delete one of many integrations**: Configure 3 integrations. Delete the middle one. Assert the remaining 2 are displayed correctly in the list.

40. **Page requires authentication for delete**: Navigate to `/integrations/linear` without signing in. Assert redirect to login page or auth-required message.

### CLI Tests

41. **`codeplane extension linear remove <id>` succeeds**: Create an integration. Run `codeplane extension linear remove <id>`. Assert stdout contains `{ "status": "removed", "id": <id> }`. Assert exit code 0.

42. **CLI remove then verify with list**: Create integration. Run `codeplane extension linear remove <id>`. Run `codeplane extension linear list`. Assert the removed integration does not appear.

43. **CLI remove non-existent integration**: Run `codeplane extension linear remove 999999`. Assert non-zero exit code. Assert stderr contains error message.

44. **CLI remove with invalid ID**: Run `codeplane extension linear remove abc`. Assert exit code is non-zero (argument validation via `z.coerce.number()` should reject non-numeric input).

45. **CLI remove without authentication**: Run without a valid session/token. Assert stderr contains an authentication error. Assert exit code 1.

46. **CLI raw API delete**: Run `codeplane api /api/integrations/linear/42 --method DELETE`. Assert exit code 0 on valid integration.

47. **CLI remove reflects immediately in API list**: Create integration via CLI, delete via CLI, list via API. Assert deleted integration absent.

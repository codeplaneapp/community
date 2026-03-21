# ADMIN_USER_GRANT_ADMIN

Specification for ADMIN_USER_GRANT_ADMIN.

## High-Level User POV

As a Codeplane instance administrator, I need the ability to promote or demote other users to and from admin status so I can delegate administrative responsibilities or revoke elevated access when someone's role changes.

When I am viewing the user list in the admin console — whether through the web UI, CLI, or TUI — I should be able to select a user and toggle their admin status. Promoting a user to admin gives them full access to every admin surface in Codeplane: user management, repository oversight, runner management, audit logs, system health, alpha access controls, and billing administration. Demoting a user revokes all of these elevated privileges and returns them to a standard user.

This action is deliberately guarded. Only existing site administrators can grant or revoke admin status. The system must prevent an admin from accidentally removing their own admin status, since that could leave the instance with no administrators. Every grant or revocation is recorded in the audit trail so there is a clear chain of accountability for who promoted or demoted whom and when.

The experience must feel immediate and clear. After changing a user's admin status, the admin console reflects the change right away — the admin badge appears or disappears in the user list, and the affected user's next request to any admin endpoint will succeed or fail based on their updated role. No instance restart or session invalidation is required; the admin flag is checked on every request, so the change takes effect naturally.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated site admin can promote a non-admin user to admin.
- [ ] An authenticated site admin can demote an admin user to non-admin.
- [ ] The server endpoint `PATCH /api/admin/users/:username/admin` is backed by a real service implementation (not the current stub returning an empty object).
- [ ] The CLI exposes `codeplane admin user grant-admin <username>` and `codeplane admin user revoke-admin <username>` commands.
- [ ] The web admin console provides a toggle or action button on the user row to change admin status.
- [ ] The TUI admin screen provides an action to toggle admin status for a selected user.
- [ ] The response returns the updated user profile with the new `is_admin` value.
- [ ] A site admin cannot revoke their own admin status.
- [ ] Non-admin authenticated users receive a 401 response.
- [ ] Unauthenticated requests receive a 401 response.
- [ ] The action is recorded in the audit log.
- [ ] All existing e2e tests pass, and new tests cover the full specification.

### Functional Constraints

- [ ] The endpoint accepts a JSON body with a single boolean field `is_admin`.
- [ ] When `is_admin` is `true`, the target user is promoted to admin. When `false`, the target user is demoted.
- [ ] The target user must exist and be active (`is_active = true`). Attempting to modify a non-existent or deactivated user returns a 404.
- [ ] The endpoint resolves the target user by `username` (case-insensitive, matched on `lower_username`).
- [ ] The response is the full updated user profile object (same shape as items in the `GET /api/admin/users` list).
- [ ] If the target user already has the requested admin status, the operation succeeds idempotently and returns the unchanged profile.
- [ ] The `updated_at` timestamp is refreshed to `NOW()` on any state change.
- [ ] If `is_admin` already matches the current state, `updated_at` is still refreshed (idempotent write).

### Edge Cases

- [ ] Attempting to revoke admin from yourself (the requesting admin) returns a 400 with message `"cannot revoke your own admin status"`.
- [ ] Attempting to grant/revoke admin for a username that does not exist returns a 404 with message `"user not found"`.
- [ ] Attempting to grant/revoke admin for a deactivated user returns a 404 with message `"user not found"`.
- [ ] An empty JSON body (`{}`) returns a 400 with message `"is_admin field is required"`.
- [ ] A JSON body with `is_admin` set to a non-boolean value (e.g., `"is_admin": "yes"`, `"is_admin": 1`, `"is_admin": null`) returns a 400 with message `"is_admin must be a boolean"`.
- [ ] A malformed JSON body (not valid JSON) returns a 400 with message `"invalid request body"`.
- [ ] A request with an empty or whitespace-only `:username` path parameter returns a 400 with message `"username is required"`.
- [ ] A request with no `Content-Type: application/json` header on the PATCH request returns a 400 (enforced by the JSON mutation middleware).

### Boundary Constraints

- [ ] `username` path parameter: string, 1–39 characters, lowercase alphanumeric and hyphens (resolved case-insensitively).
- [ ] `is_admin` body field: strict boolean (`true` or `false`), required.
- [ ] Response `username` field: string, 1–39 characters.
- [ ] Response `display_name` field: string, 0–255 characters, UTF-8.
- [ ] Response `email` field: string or null, when present conforms to email format, max 254 characters.

## Design

### API Shape

**Endpoint:** `PATCH /api/admin/users/:username/admin`

**Authentication:** Required. Caller must have `isAdmin = true`.

**Path Parameters:**

| Parameter  | Type   | Constraints          | Description              |
|------------|--------|----------------------|--------------------------|
| `username` | string | 1–39 chars, non-empty | Target user's username   |

**Request Body:**

```json
{
  "is_admin": true
}
```

| Field      | Type    | Required | Description                            |
|------------|---------|----------|----------------------------------------|
| `is_admin` | boolean | Yes      | `true` to promote, `false` to demote   |

**Success Response:** `200 OK`

```json
{
  "id": 2,
  "username": "bob",
  "display_name": "Bob Jones",
  "email": "bob@example.com",
  "avatar_url": "https://example.com/avatar.png",
  "bio": "Backend engineer",
  "user_type": "individual",
  "is_active": true,
  "is_admin": true,
  "prohibit_login": false,
  "last_login_at": "2026-03-19T09:12:00Z",
  "created_at": "2026-02-01T10:00:00Z",
  "updated_at": "2026-03-22T15:30:00Z"
}
```

**Error Responses:**

| Status | Condition                                     | Body                                                  |
|--------|-----------------------------------------------|-------------------------------------------------------|
| `400`  | Missing or non-boolean `is_admin`             | `{ "error": "is_admin must be a boolean" }`           |
| `400`  | Empty `is_admin` field                        | `{ "error": "is_admin field is required" }`           |
| `400`  | Malformed JSON body                           | `{ "error": "invalid request body" }`                 |
| `400`  | Empty username path parameter                 | `{ "error": "username is required" }`                 |
| `400`  | Admin attempting self-demotion                | `{ "error": "cannot revoke your own admin status" }`  |
| `401`  | No authentication provided                    | `{ "error": "authentication required" }`              |
| `401`  | Authenticated but not admin                   | `{ "error": "admin access required" }`                |
| `404`  | Target user not found or deactivated          | `{ "error": "user not found" }`                       |
| `500`  | Internal server error                         | `{ "error": "<message>" }`                            |

### SDK Shape

The `@codeplane/sdk` package must expose an admin service method that replaces the current stub in `apps/server/src/routes/admin.ts`:

```typescript
interface SetUserAdminInput {
  actingUserId: number;     // the admin performing the action
  targetUsername: string;    // case-insensitive username to look up
  isAdmin: boolean;          // new admin status
}

interface AdminUserRow {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  bio: string;
  userType: string;
  isActive: boolean;
  isAdmin: boolean;
  prohibitLogin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

The service method:
1. Looks up the target user by `lower_username`.
2. Returns a `notFound("user not found")` error if the user does not exist or `is_active = false`.
3. Returns a `badRequest("cannot revoke your own admin status")` error if `actingUserId === target.id` and `isAdmin === false`.
4. Calls the existing `setUserAdmin` database function.
5. Re-fetches and returns the updated user row.

### CLI Command

**Command (promote):** `codeplane admin user grant-admin <username>`

**Command (revoke):** `codeplane admin user revoke-admin <username>`

**Arguments:**

| Argument   | Type   | Required | Description                   |
|------------|--------|----------|-------------------------------|
| `username` | string | Yes      | Target user's username        |

**Options:**

| Flag       | Type | Default | Description       |
|------------|------|---------|-------------------|
| `--json`   | flag | off     | Output raw JSON   |

**Default output (promote):**

```
✓ bob is now a site administrator.
```

**Default output (revoke):**

```
✓ bob is no longer a site administrator.
```

**JSON output:** Outputs the full user profile JSON from the API response.

**Error output:**

```
Error: cannot revoke your own admin status (400)
```

```
Error: user not found (404)
```

**Exit codes:**
- `0` — success
- `1` — any error (auth, validation, not found)

### Web UI Design

**Location:** Within the admin user list at `/admin/users` and on any future admin user detail view.

**User List Row Action:**

- Each user row in the admin user list includes an "Actions" column or overflow menu (⋯).
- For non-admin users, the overflow menu includes "Promote to Admin".
- For admin users (other than the currently logged-in admin), the overflow menu includes "Revoke Admin".
- The currently logged-in admin's row does NOT show a "Revoke Admin" option (client-side prevention of self-demotion).

**Confirmation Dialog:**

- Promoting a user shows a confirmation dialog: "Promote **{username}** to site administrator? They will have full access to all admin features."
  - Buttons: "Cancel" (secondary), "Promote" (primary/danger).
- Revoking admin shows a confirmation dialog: "Revoke admin access for **{username}**? They will lose access to all admin features."
  - Buttons: "Cancel" (secondary), "Revoke" (danger).

**Post-Action Behavior:**

- On success, the dialog closes, a toast notification appears ("**{username}** promoted to admin" or "**{username}** admin access revoked"), and the user row's admin badge updates immediately without a full page reload.
- On error, the dialog shows the error message inline with a dismiss action.

**Loading State:**

- While the PATCH request is in flight, the confirm button shows a spinner and is disabled.

### TUI UI

**Screen:** Accessible from the admin user list screen.

**Interaction:**

- When a user row is selected (highlighted), pressing `a` or Enter and selecting "Toggle Admin" from a context menu triggers the admin toggle flow.
- A confirmation prompt appears inline: "Promote {username} to admin? (y/n)" or "Revoke admin from {username}? (y/n)".
- On confirmation, the TUI sends the PATCH request and updates the admin badge in the user list.
- On error, the error message is displayed as a flash message at the bottom of the screen.

### Documentation

End-user documentation must include:

- **Admin Guide — Granting and Revoking Admin Status**: A section explaining what admin privileges entail, how to promote and demote users, the self-demotion safety guard, and what the affected user experiences after the change.
- **CLI Reference — `codeplane admin user grant-admin`**: A reference entry documenting the command, argument, output formats, and example invocations.
- **CLI Reference — `codeplane admin user revoke-admin`**: A reference entry documenting the command, argument, output formats, and example invocations.
- **API Reference — `PATCH /api/admin/users/:username/admin`**: A reference entry documenting the endpoint, authentication requirements, request body schema, response schema, and all error codes.

## Permissions & Security

### Authorization

| Role                           | Access           |
|--------------------------------|------------------|
| Site Admin                     | Full access      |
| Authenticated (non-admin)      | Denied (401)     |
| Anonymous / Unauthenticated    | Denied (401)     |

- The `requireAdmin()` guard checks both that a valid session/token exists AND that the user has `isAdmin = true`.
- PAT-scoped access: Tokens with `admin` or `write:admin` scopes should grant access. Tokens with only `read:admin` scopes should be denied (this is a write operation). Tokens without any admin scope should be denied.
- Self-demotion prevention is enforced server-side, not only in the UI, to prevent bypass via direct API calls.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **60 requests per minute** per authenticated user applies to all `/api/admin/*` routes to prevent abuse.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.
- A burst limit of **10 requests per 10 seconds** to the specific `PATCH /api/admin/users/:username/admin` endpoint should apply, preventing rapid bulk admin grant/revoke scripts from being weaponized.

### Data Privacy & PII

- This endpoint modifies a user's privilege level, which is a security-sensitive operation.
- The response contains PII (email, username, display name). This is acceptable because the caller is already a verified admin.
- The response must NOT include: password hashes, authentication tokens, session IDs, wallet addresses, or internal search vectors.
- Every admin grant/revoke action must be recorded in the audit log with: acting admin ID, target user ID, old admin status, new admin status, timestamp, and source IP.
- No PII beyond what is already visible in the admin user list is exposed by this endpoint.

## Telemetry & Product Analytics

### Business Events

| Event Name                  | Trigger                                                   | Properties                                                                                                 |
|-----------------------------|-----------------------------------------------------------|------------------------------------------------------------------------------------------------------------||
| `AdminPrivilegeGranted`     | Admin successfully promotes a user to admin               | `admin_user_id`, `target_user_id`, `target_username`, `client` (web/cli/tui/api), `timestamp`              |
| `AdminPrivilegeRevoked`     | Admin successfully demotes a user from admin              | `admin_user_id`, `target_user_id`, `target_username`, `client` (web/cli/tui/api), `timestamp`              |
| `AdminPrivilegeChangeDenied`| Non-admin attempts to change admin status                 | `user_id` (if authenticated), `reason` ("not_authenticated", "not_admin", "self_demotion"), `client`        |
| `AdminPrivilegeChangeError` | Admin grant/revoke fails due to target not found or error | `admin_user_id`, `target_username`, `error_type` ("not_found", "internal"), `client`                       |

### Funnel Metrics

- **Admin delegation rate**: Track how many instances have more than one admin. Healthy self-hosted instances should have at least two admins for redundancy. Target: >60% of instances with >5 users have ≥2 admins.
- **Admin churn**: Track how frequently admin status is revoked relative to grants. A high revocation rate may indicate poor onboarding or accidental promotions.
- **Self-demotion attempt rate**: Track how often admins attempt to revoke their own admin status. If this is high, it suggests the UI isn't clearly communicating the guard rail.
- **Client distribution**: Track which clients (web, CLI, TUI, raw API) are used for admin privilege changes. This informs investment priority.

### Success Indicators

- The stub service is replaced by a real implementation that modifies and returns actual user data.
- E2e tests pass, confirming grant, revoke, self-demotion guard, auth guard, and idempotency.
- Admins on self-hosted instances can delegate admin access without direct database access.
- Audit logs capture every admin status change.

## Observability

### Logging

| Log Event                              | Level   | Structured Context                                                                           | When                                        |
|----------------------------------------|---------|----------------------------------------------------------------------------------------------|---------------------------------------------|
| `admin.user.set_admin.success`         | `info`  | `admin_id`, `target_user_id`, `target_username`, `old_is_admin`, `new_is_admin`, `duration_ms` | Successful admin status change              |
| `admin.user.set_admin.noop`            | `info`  | `admin_id`, `target_user_id`, `target_username`, `is_admin`, `duration_ms`                   | Idempotent call (no status change)          |
| `admin.user.set_admin.denied`          | `warn`  | `user_id` (nullable), `reason`, `ip`, `user_agent`                                          | Unauthorized access attempt                 |
| `admin.user.set_admin.self_demotion`   | `warn`  | `admin_id`, `admin_username`, `ip`                                                           | Admin attempted self-demotion               |
| `admin.user.set_admin.not_found`       | `warn`  | `admin_id`, `target_username`, `ip`                                                          | Target user not found                       |
| `admin.user.set_admin.validation`      | `warn`  | `admin_id`, `target_username`, `validation_error`, `ip`                                      | Request body validation failure             |
| `admin.user.set_admin.error`           | `error` | `admin_id`, `target_username`, `error_message`, `stack_trace`                                | Internal error during admin status change   |

### Prometheus Metrics

| Metric Name                                      | Type      | Labels                                        | Description                                                     |
|--------------------------------------------------|-----------|-----------------------------------------------|-----------------------------------------------------------------|
| `codeplane_admin_user_set_admin_total`           | Counter   | `status` (2xx, 4xx, 5xx), `action` (grant, revoke) | Total admin grant/revoke requests by status and action     |
| `codeplane_admin_user_set_admin_duration_ms`     | Histogram | `status`, `action`                            | Latency distribution (buckets: 25, 50, 100, 250, 500, 1000ms)  |
| `codeplane_admin_user_set_admin_denied_total`    | Counter   | `reason` (not_authenticated, not_admin, self_demotion) | Denied admin change attempts by reason                 |
| `codeplane_admin_users_total`                    | Gauge     | —                                             | Total number of admin users on the instance                     |

### Alerts

#### Alert: `AdminUserSetAdminHighErrorRate`
- **Condition:** `rate(codeplane_admin_user_set_admin_total{status="5xx"}[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `admin.user.set_admin.error` entries — look for database connection failures or query errors.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check for recent schema migrations that may have broken the `users` table or the `SetUserAdmin` query.
  4. Verify the `setUserAdmin` SQL function exists and is properly parameterized — the query updates `is_admin` and `updated_at` on the `users` table by `id`.
  5. If the database is healthy, check for row-level locks or contention on the target user row.
  6. Escalate to the database team if the issue persists after basic connectivity checks.

#### Alert: `AdminUserSetAdminDeniedSpike`
- **Condition:** `rate(codeplane_admin_user_set_admin_denied_total[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.user.set_admin.denied` log entries for source IPs and user agents.
  2. Determine if the spike is from a single user or IP repeatedly attempting to access the admin endpoint.
  3. If from a single source with `reason="not_admin"`, this may be a privilege escalation attempt. Review the source IP against known users and consider temporary IP-level rate limiting.
  4. If from a known automation script, assist the operator in configuring correct admin credentials.
  5. If `reason="self_demotion"` is spiking, consider improving the UI to make the self-demotion guard more visible.
  6. No immediate action required unless the pattern suggests an active attack.

#### Alert: `AdminUserCountDroppedToOne`
- **Condition:** `codeplane_admin_users_total == 1`
- **Severity:** Warning
- **Runbook:**
  1. This alert fires when only one admin remains on the instance. This is a bus-factor risk.
  2. Check audit logs for recent admin revocations to understand why admin count dropped.
  3. Contact the remaining admin and recommend they promote at least one additional trusted user to admin.
  4. If the sole admin is unreachable, a database-level intervention may be required to restore a second admin.
  5. This is an advisory alert — no immediate production impact, but the instance is in a fragile administrative state.

#### Alert: `AdminUserCountZero`
- **Condition:** `codeplane_admin_users_total == 0`
- **Severity:** Critical
- **Runbook:**
  1. This should be impossible given the self-demotion guard, but could theoretically occur through direct database modification or a bug.
  2. Immediately check the `users` table for rows where `is_admin = true`. If none exist, this is a critical administrative lockout.
  3. Use direct database access to promote a known trusted user: `UPDATE users SET is_admin = true WHERE username = '<trusted_user>';`
  4. Investigate how the zero-admin state occurred — check audit logs for the sequence of events.
  5. File a bug report if the self-demotion guard was bypassed through a code path.

### Error Cases and Failure Modes

| Failure Mode                          | Symptom                              | Behavior                                                      |
|---------------------------------------|--------------------------------------|---------------------------------------------------------------|
| Database unreachable                  | 500 Internal Server Error            | Returns error JSON, logs `admin.user.set_admin.error`         |
| Database query timeout                | 500 or slow response                 | Returns error JSON after timeout, logs error                  |
| Target user not found                 | 404 Not Found                        | Returns `"user not found"`, no DB write executed              |
| Target user deactivated               | 404 Not Found                        | Same as not found — deactivated users are invisible to admin  |
| Self-demotion attempt                 | 400 Bad Request                      | Returns `"cannot revoke your own admin status"`, no DB write  |
| Invalid/missing `is_admin` field      | 400 Bad Request                      | Returns validation error, no DB write executed                |
| Concurrent admin revocation           | Race condition                       | Last write wins; `updated_at` reflects final state            |
| Admin flag revoked mid-request        | 401 on next request                  | Current request may succeed if auth check passed already      |
| Network timeout (client-side)         | Client error / retry                 | Server may have applied the change; client should re-fetch    |

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                              | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| API-01   | `PATCH /api/admin/users/:username/admin` with `is_admin: true` on a non-admin user returns 200 | Status 200, response `is_admin` is `true`                             |
| API-02   | `PATCH /api/admin/users/:username/admin` with `is_admin: false` on an admin user returns 200   | Status 200, response `is_admin` is `false`                            |
| API-03   | Response body contains all required fields: `id`, `username`, `display_name`, `email`, `avatar_url`, `bio`, `user_type`, `is_active`, `is_admin`, `prohibit_login`, `last_login_at`, `created_at`, `updated_at` | All fields present                                                    |
| API-04   | Response body does NOT contain internal fields: `lower_username`, `lower_email`, `search_vector`, `wallet_address`, `email_notifications_enabled` | None of the excluded keys present                                     |
| API-05   | Granting admin to an already-admin user succeeds idempotently                                  | Status 200, `is_admin: true`, no error                                |
| API-06   | Revoking admin from an already-non-admin user succeeds idempotently                            | Status 200, `is_admin: false`, no error                               |
| API-07   | `updated_at` changes after a successful grant/revoke                                           | `updated_at` is different (more recent) than before the request        |
| API-08   | Admin attempting to revoke their own admin status returns 400                                   | Status 400, body contains `"cannot revoke your own admin status"`     |
| API-09   | Admin granting admin to themselves (already admin) succeeds idempotently                        | Status 200, `is_admin: true` (self-grant is safe, only self-revoke blocked) |
| API-10   | Target username that does not exist returns 404                                                | Status 404, body contains `"user not found"`                          |
| API-11   | Target username that is deactivated returns 404                                                | Status 404, body contains `"user not found"`                          |
| API-12   | Empty JSON body `{}` returns 400                                                               | Status 400, body contains `"is_admin field is required"`              |
| API-13   | JSON body with `is_admin: "yes"` (string) returns 400                                          | Status 400, body contains `"is_admin must be a boolean"`              |
| API-14   | JSON body with `is_admin: 1` (number) returns 400                                              | Status 400, body contains `"is_admin must be a boolean"`              |
| API-15   | JSON body with `is_admin: null` returns 400                                                    | Status 400, body contains `"is_admin must be a boolean"`              |
| API-16   | Malformed JSON body returns 400                                                                | Status 400, body contains `"invalid request body"`                    |
| API-17   | Empty username path parameter returns 400                                                      | Status 400, body contains `"username is required"`                    |
| API-18   | Username with leading/trailing whitespace is trimmed and resolved correctly                     | Status 200 or 404 depending on whether trimmed username exists        |
| API-19   | Username lookup is case-insensitive (e.g., `BOB` resolves to `bob`)                            | Status 200, response shows the canonical lowercase username           |
| API-20   | Request without authentication returns 401                                                     | Status 401, body contains `"authentication required"`                 |
| API-21   | Request with valid non-admin token returns 401                                                 | Status 401, body contains `"admin access required"`                   |
| API-22   | Request with expired/invalid token returns 401                                                 | Status 401                                                            |
| API-23   | Request with PAT having `write:admin` scope succeeds                                           | Status 200                                                            |
| API-24   | Request with PAT having only `read:admin` scope is denied                                      | Status 401 or 403 (write operation)                                   |
| API-25   | Request with PAT lacking any admin scope is denied                                             | Status 401                                                            |
| API-26   | After granting admin, the target user can access `GET /api/admin/users` successfully            | Target user's request returns 200                                     |
| API-27   | After revoking admin, the target user cannot access `GET /api/admin/users`                      | Target user's request returns 401                                     |
| API-28   | `created_at` and `updated_at` are valid ISO 8601 date strings                                  | `new Date(field).toISOString()` does not throw                        |
| API-29   | Verify the audit log contains an entry for the admin status change                              | Audit log API returns a record with the correct action and actor       |
| API-30   | Username at maximum length (39 chars) resolves correctly when the user exists                   | Status 200 or 404 depending on existence                              |
| API-31   | Username longer than 39 characters returns 404 (no such user can exist)                        | Status 404                                                            |

### CLI E2E Tests

| Test ID  | Test Description                                                                              | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| CLI-01   | `codeplane admin user grant-admin <username>` with admin token and valid non-admin user exits 0 | Exit code 0, stdout confirms promotion                               |
| CLI-02   | `codeplane admin user revoke-admin <username>` with admin token and valid admin user exits 0   | Exit code 0, stdout confirms revocation                              |
| CLI-03   | `codeplane admin user grant-admin <username> --json` outputs valid JSON with `is_admin: true`  | Exit code 0, `JSON.parse(stdout)` has `is_admin === true`            |
| CLI-04   | `codeplane admin user revoke-admin <username> --json` outputs valid JSON with `is_admin: false`| Exit code 0, `JSON.parse(stdout)` has `is_admin === false`           |
| CLI-05   | `codeplane admin user grant-admin <nonexistent>` returns error for unknown user                | Exit code ≠ 0, stderr contains "user not found"                      |
| CLI-06   | `codeplane admin user revoke-admin <self>` returns error for self-demotion                     | Exit code ≠ 0, stderr contains "cannot revoke your own admin status" |
| CLI-07   | `codeplane admin user grant-admin <username>` with non-admin token fails                       | Exit code ≠ 0, stderr contains error message                        |
| CLI-08   | `codeplane admin user grant-admin <username>` without any token fails                          | Exit code ≠ 0, stderr contains error message                        |
| CLI-09   | `codeplane admin user grant-admin` without a username argument fails with usage help            | Exit code ≠ 0, stderr contains usage or missing argument message     |
| CLI-10   | After grant, `codeplane admin user list --json` shows the user with `is_admin: true`           | The target user's entry has `is_admin: true`                          |
| CLI-11   | After revoke, `codeplane admin user list --json` shows the user with `is_admin: false`         | The target user's entry has `is_admin: false`                         |
| CLI-12   | Grant idempotency: granting admin to an already-admin user exits 0                              | Exit code 0, no error                                                |
| CLI-13   | Revoke idempotency: revoking admin from a non-admin user exits 0                                | Exit code 0, no error                                                |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                              | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| UI-01    | Admin navigates to `/admin/users` and sees action menu on a non-admin user row                 | Overflow menu (⋯) is visible and clickable                           |
| UI-02    | Clicking "Promote to Admin" on a non-admin user shows a confirmation dialog                    | Dialog is visible with correct username and promote/cancel buttons     |
| UI-03    | Confirming promotion closes the dialog and shows a success toast                               | Toast says "{username} promoted to admin", dialog is closed           |
| UI-04    | After promotion, the user row shows an admin badge without page reload                         | Admin badge element appears in the row                                |
| UI-05    | Clicking "Revoke Admin" on an admin user (not self) shows a confirmation dialog                | Dialog is visible with correct username and revoke/cancel buttons     |
| UI-06    | Confirming revocation closes the dialog and shows a success toast                              | Toast says "{username} admin access revoked", dialog is closed        |
| UI-07    | After revocation, the admin badge disappears from the user row without page reload             | Admin badge element is removed from the row                           |
| UI-08    | The current admin user's row does NOT show a "Revoke Admin" action                             | Overflow menu does not contain "Revoke Admin" for self                |
| UI-09    | Canceling the confirmation dialog does not change the user's admin status                      | Badge remains unchanged, no API call made                             |
| UI-10    | While the PATCH request is in flight, the confirm button shows a spinner and is disabled        | Spinner visible, button is disabled                                   |
| UI-11    | If the API returns a 404 (user deleted concurrently), the dialog shows an error message         | Error text visible inside the dialog                                  |
| UI-12    | Non-admin user navigating to `/admin/users` cannot see or interact with admin toggle actions    | Access denied or redirect; no action menu visible                     |
| UI-13    | After promoting a user, refreshing the page still shows the updated admin status               | Admin badge persists after full page reload                           |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                              | Expected Result                                                       |
|----------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| CC-01    | Promote a user via CLI, verify via API that `is_admin` is `true`                               | API response shows `is_admin: true`                                   |
| CC-02    | Revoke admin via API, verify via CLI `admin user list --json` that `is_admin` is `false`       | CLI output shows `is_admin: false`                                    |
| CC-03    | Promote via web UI action, verify via CLI that the user now appears as admin                    | CLI list output shows admin badge for the user                        |

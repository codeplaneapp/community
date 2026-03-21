# ADMIN_USER_DELETE

Specification for ADMIN_USER_DELETE.

## High-Level User POV

As a Codeplane instance administrator, I sometimes need to permanently remove a user account from the platform. This may happen because an employee has left the company, a user has violated usage policies, a spam or bot account was created, or a test account needs to be cleaned up. The admin user delete action is the most destructive single-user operation available and must be handled with appropriate safeguards.

When I decide to delete a user, I identify them by username and issue the delete command — whether from the web UI admin console, the CLI, or the API. Before the deletion executes, I am warned about the consequences: the user's account will be deactivated, their login will be prohibited, and their active sessions and tokens will be invalidated. The system uses a soft-delete model, meaning the user record is retained in a deactivated state rather than being physically removed from the database. This preserves referential integrity for repositories, issues, comments, and other data authored by or associated with the user.

After the deletion completes, the deleted user can no longer log in, use API tokens, or access Codeplane in any way. Their username remains reserved — it cannot be reused for new account creation. Repositories owned solely by the deleted user remain on the instance but become inaccessible for writes. Organization-owned repositories that the user contributed to are unaffected. The deletion is recorded in the audit log with full context about which admin performed it and when.

The experience must be consistent across all Codeplane clients: the web admin console should present a confirmation dialog before proceeding, the CLI should support both interactive confirmation and a `--yes` flag for scripted use, and the API should respond with a clear success or failure signal. An admin cannot delete their own account through this mechanism — self-deletion is explicitly prevented to avoid accidental lockout of the last administrator.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated admin user can delete any non-self user account by username via the API, CLI, and web UI.
- [ ] The delete endpoint is backed by a real service implementation (not a stub returning void without side effects).
- [ ] Deletion soft-deletes the user by setting `is_active = false` and `prohibit_login = true`.
- [ ] All active sessions belonging to the deleted user are revoked immediately upon deletion.
- [ ] All personal access tokens belonging to the deleted user are revoked immediately upon deletion.
- [ ] The CLI `admin user delete` command prompts for confirmation in interactive mode and supports `--yes` to skip the prompt.
- [ ] The web admin console shows a confirmation dialog before executing the deletion.
- [ ] An audit log entry is created recording the deletion, including the admin who performed it and the target username.
- [ ] Non-admin authenticated users receive a 401 Unauthorized response.
- [ ] Unauthenticated requests receive a 401 Unauthorized response.
- [ ] All existing e2e tests pass, and new tests cover the full specification.

### Functional Constraints

- [ ] The endpoint accepts the target user's username as a URL path parameter.
- [ ] The endpoint returns `204 No Content` with an empty body on successful deletion.
- [ ] The endpoint returns `404 Not Found` when the specified username does not exist or is already deleted (already inactive).
- [ ] The endpoint returns `400 Bad Request` when the username path parameter is empty or whitespace-only.
- [ ] The endpoint returns `403 Forbidden` when the admin attempts to delete their own account (self-deletion prevention).
- [ ] The endpoint returns `403 Forbidden` when the admin attempts to delete the last remaining admin on the instance.
- [ ] After deletion, the user's `is_active` field is `false` and `prohibit_login` field is `true`.
- [ ] After deletion, the user's `updated_at` timestamp is set to the current time.
- [ ] After deletion, the deleted user no longer appears in the `GET /api/admin/users` list (which filters by `is_active = true`).
- [ ] After deletion, the deleted user's username cannot be used to create a new user (the soft-deleted record with `lower_username` still occupies the unique index).
- [ ] After deletion, repositories owned by the user are NOT deleted — they remain on the instance in a read-only state.
- [ ] After deletion, organization memberships held by the user are removed.
- [ ] After deletion, team memberships held by the user are removed.
- [ ] The operation is idempotent at the API level: deleting an already-deleted (inactive) user returns `404 Not Found` rather than `204`.

### Edge Cases

- [ ] When the username contains only whitespace characters, the endpoint returns `400 Bad Request` with `"username is required"`.
- [ ] When the username does not match any user record (case-insensitive lookup on `lower_username`), the endpoint returns `404 Not Found`.
- [ ] When the target user is the same as the requesting admin, the endpoint returns `403 Forbidden` with `"cannot delete your own account"`.
- [ ] When the target user is the only remaining admin on the instance, the endpoint returns `403 Forbidden` with `"cannot delete the last admin user"`.
- [ ] When the target user has already been soft-deleted (is_active = false), the endpoint returns `404 Not Found` (treats inactive users as non-existent for admin purposes).
- [ ] When the target user has active webhook subscriptions, those webhooks remain but stop triggering for user-scoped events.
- [ ] When the target user is the sole owner of an organization, the organization is NOT deleted — it becomes an ownerless org that must be managed by a site admin.
- [ ] When the target user has pending landing requests as author, those landing requests remain open but the author is shown as deleted.
- [ ] When the target user has open issues assigned to them, those issues have the assignee cleared.
- [ ] When two concurrent delete requests target the same user, only one should succeed with 204 and the other should see 404 (already deleted).
- [ ] Usernames with URL-special characters (e.g., containing periods, hyphens at boundaries) are correctly decoded from the URL path.

### Boundary Constraints

- [ ] `username` path parameter: string, 1–39 characters, lowercase alphanumeric and hyphens, cannot start or end with a hyphen, cannot contain consecutive hyphens.
- [ ] The username lookup is case-insensitive (matches against `lower_username`).
- [ ] The audit log entry for the deletion must include: `event_type: "user.delete"`, `actor_id`, `actor_name`, `target_type: "user"`, `target_id`, `target_name`, `ip_address`, and `metadata` with the reason if provided.

## Design

### API Shape

**Endpoint:** `DELETE /api/admin/users/:username`

**Authentication:** Required. Caller must have `isAdmin = true`. PAT must have `write:admin` scope.

**Path Parameters:**

| Parameter  | Type   | Constraints                      | Description                |
|------------|--------|----------------------------------|----------------------------|
| `username` | string | 1–39 chars, alphanumeric/hyphens | Username of user to delete |

**Request Body:** None. The endpoint does not accept a request body.

**Success Response:** `204 No Content`

Empty body.

**Error Responses:**

| Status | Condition                             | Body                                                        |
|--------|---------------------------------------|-------------------------------------------------------------|
| `400`  | Username is empty or whitespace       | `{ "error": "username is required" }`                       |
| `401`  | No authentication provided            | `{ "error": "authentication required" }`                    |
| `401`  | Authenticated but not admin           | `{ "error": "admin access required" }`                      |
| `403`  | Admin attempting self-deletion        | `{ "error": "cannot delete your own account" }`             |
| `403`  | Target is the last admin user         | `{ "error": "cannot delete the last admin user" }`          |
| `404`  | Username not found or already deleted | `{ "error": "user not found" }`                             |
| `429`  | Rate limit exceeded                   | `{ "error": "rate limit exceeded" }` with `Retry-After` hdr |
| `500`  | Internal server error                 | `{ "error": "<message>" }`                                  |

**Side Effects on Success:**

1. User record updated: `is_active = false`, `prohibit_login = true`, `updated_at = NOW()`.
2. All active sessions for the user are deleted.
3. All personal access tokens for the user are revoked (deleted or deactivated).
4. Organization memberships for the user are removed.
5. Team memberships for the user are removed.
6. Issue assignments for the user are cleared (assignee set to null).
7. An audit log entry is recorded.

### SDK Shape

The `@codeplane/sdk` package must expose an admin service method:

```typescript
interface AdminDeleteUserInput {
  actorId: string;          // ID of the admin performing the deletion
  actorUsername: string;    // Username of the admin
  targetUsername: string;   // Username of the user to delete
  ipAddress: string;        // IP address for audit logging
}

interface AdminDeleteUserError {
  code: "NOT_FOUND" | "SELF_DELETE" | "LAST_ADMIN" | "INVALID_USERNAME";
  message: string;
}

type AdminDeleteUserResult = Result<void, AdminDeleteUserError>;
```

The service method must:

1. Validate the target username is non-empty.
2. Look up the target user by `lower_username` (case-insensitive).
3. Return `NOT_FOUND` if the user does not exist or `is_active = false`.
4. Return `SELF_DELETE` if `actorId === targetUser.id`.
5. Count remaining active admin users. Return `LAST_ADMIN` if the target is an admin and is the only one.
6. Execute the soft-delete: set `is_active = false`, `prohibit_login = true`, `updated_at = NOW()`.
7. Revoke all sessions for the target user.
8. Revoke all personal access tokens for the target user.
9. Remove organization memberships for the target user.
10. Remove team memberships for the target user.
11. Clear issue assignments for the target user.
12. Write an audit log entry.

All steps 6–12 should execute within a single database transaction.

### CLI Command

**Command:** `codeplane admin user delete <username>`

**Arguments:**

| Argument   | Type   | Required | Description              |
|------------|--------|----------|---------------------------|
| `username` | string | yes      | Username of user to delete|

**Options:**

| Flag       | Type    | Default | Description                        |
|------------|---------|---------|-------------------------------------|
| `--yes`    | boolean | false   | Skip interactive confirmation       |
| `--json`   | flag    | off     | Output raw JSON                     |

**Interactive behavior (default when TTY is attached):**

```
⚠  You are about to delete user "alice".

   This will:
   • Deactivate the account (soft delete)
   • Revoke all sessions and tokens
   • Remove organization and team memberships

   The username "alice" will remain reserved and cannot be reused.

Are you sure? [y/N] y
User "alice" deleted.
```

**Non-interactive / `--yes` behavior:**

```
User "alice" deleted.
```

**JSON output:**

```json
{ "status": "deleted", "username": "alice" }
```

**Error output:**

```
Error: cannot delete your own account (403)
```

```
Error: user not found (404)
```

**Exit codes:**
- `0` — success
- `1` — authentication/authorization failure, user not found, or server error

### Web UI Design

**Trigger Location:** The delete action is accessible from two places:

1. **Admin Users List table** (`/admin/users`): Each user row has a kebab menu (⋮) with actions including "Delete user". The menu item is styled in a destructive (red) color. The menu item is disabled for the current admin's own row, with a tooltip "You cannot delete your own account."

2. **Admin User Detail page** (future, when implemented): A "Danger Zone" section at the bottom with a "Delete this user" button.

**Confirmation Dialog:**

When the admin clicks "Delete user", a modal dialog appears:

- **Title:** "Delete user"
- **Body:** "You are about to delete the user **{username}**. This will deactivate their account, revoke all sessions and tokens, and remove their organization and team memberships. The username will remain reserved and cannot be reused."
- **Confirmation input:** The admin must type the username to confirm (matching the pattern used in repository deletion flows for destructive operations).
- **Buttons:**
  - "Cancel" (secondary, default focus)
  - "Delete user" (destructive/red, disabled until username is typed correctly)
- **Loading state:** After clicking "Delete user", the button shows a spinner and is disabled. The dialog cannot be dismissed during the request.
- **Success:** The dialog closes, a success toast appears ("User {username} deleted"), and the user list table refreshes to remove the deleted user row.
- **Error:** An inline error message appears within the dialog (e.g., "Cannot delete the last admin user") and the dialog remains open.

**Table State After Deletion:**
- The deleted user row is removed from the table.
- The total user count in the page header decrements.
- The `X-Total-Count` is re-fetched with the refreshed list.

### TUI UI

**Trigger:** From the Admin Users list screen, pressing `d` or `Delete` on a selected user row opens a confirmation prompt.

**Confirmation Prompt:**

```
⚠ Delete user "alice"?

This will deactivate the account, revoke sessions/tokens, and remove memberships.

[Y]es / [N]o (default: No)
```

**Success:** The user row is removed from the list and a status bar message shows "User deleted."

**Error:** An inline error message replaces the prompt: "Error: cannot delete the last admin user."

### Documentation

End-user documentation must include:

- **Admin Guide — User Management section** (`/docs/guides/administration.mdx`): Update the existing user management section to include detailed documentation of the delete operation, including what soft-delete means, what data is preserved, what data is removed, and the self-deletion and last-admin safeguards. Include both CLI and API examples.

- **CLI Reference — `codeplane admin user delete`**: A reference entry documenting the command, its arguments, options (`--yes`), output formats, confirmation behavior, and example invocations including error cases.

- **API Reference — `DELETE /api/admin/users/:username`**: A reference entry documenting the endpoint, authentication requirements, path parameters, response codes, side effects, and error conditions with example `curl` commands.

- **Changelog entry**: A brief entry noting the addition of user deletion with soft-delete semantics, session/token revocation, and safety guardrails.

## Permissions & Security

### Authorization

| Role                           | Access                                                                 |
|--------------------------------|------------------------------------------------------------------------|
| Site Admin (`is_admin: true`)  | Full access to delete any user except themselves and the last admin     |
| Authenticated (non-admin)      | Denied (401 Unauthorized)                                              |
| Anonymous / Unauthenticated    | Denied (401 Unauthorized)                                              |
| PAT with `write:admin` scope   | Allowed, if the token owner is an admin                                |
| PAT without `write:admin`      | Denied (403 Forbidden) even if user is admin                           |
| PAT with `read:admin` only     | Denied (403 Forbidden) — deletion is a write operation                 |
| Deploy Key                     | Denied — deploy keys have no admin access path                         |
| OAuth2 Application Token       | Denied — OAuth2 apps cannot perform admin operations                   |

### Self-Deletion Prevention

- The `requireAdmin()` guard identifies the requesting admin by session or token.
- The service layer compares the requesting admin's user ID against the target user's ID.
- If they match, the request is rejected with `403 Forbidden` and message `"cannot delete your own account"`.
- This rule applies regardless of how many other admins exist on the instance.

### Last-Admin Prevention

- Before deleting an admin user, the service counts the number of active users with `is_admin = true`.
- If the count is 1 and the target user is that sole admin, the request is rejected with `403 Forbidden` and message `"cannot delete the last admin user"`.
- This prevents complete admin lockout of the instance.
- If the target user is not an admin, this check is skipped.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **60 requests per minute** per authenticated user is applied to all `/api/admin/*` routes.
- A stricter per-endpoint rate limit of **10 delete requests per minute** per admin user is applied to `DELETE /api/admin/users/:username` to prevent mass-deletion attacks or scripting errors.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- The deleted user's PII (email, display name, avatar) remains in the soft-deleted record. This is necessary for audit trail integrity and potential legal holds.
- No PII is returned in the `204 No Content` success response.
- Error responses do not leak information about whether a username exists vs. was already deleted — both return `404 Not Found` with the same message.
- The audit log entry for the deletion contains the actor's identity and the target's identity, which is appropriate for administrative audit purposes.
- GDPR/right-to-erasure: The soft-delete model may need to be supplemented with a hard-delete or anonymization capability in the future, but that is out of scope for this feature. The current model satisfies operational needs.
- Session and token revocation ensures the deleted user's credentials cannot be used to access any PII after deletion.

## Telemetry & Product Analytics

### Business Events

| Event Name                    | Trigger                                                    | Properties                                                                                                    |
|-------------------------------|------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| `AdminUserDeleted`            | Admin successfully deletes a user                          | `admin_user_id`, `admin_username`, `target_user_id`, `target_username`, `target_was_admin`, `client` (web/cli/tui/api), `sessions_revoked_count`, `tokens_revoked_count`, `org_memberships_removed_count`, `team_memberships_removed_count` |
| `AdminUserDeleteDenied`       | Deletion rejected for authorization or policy reasons      | `admin_user_id` (nullable), `target_username`, `reason` ("not_authenticated", "not_admin", "self_delete", "last_admin", "scope_missing"), `client` |
| `AdminUserDeleteNotFound`     | Deletion attempted on non-existent or already-deleted user | `admin_user_id`, `target_username`, `client`                                                                  |
| `AdminUserDeleteConfirmed`    | User confirms the deletion in the web UI or CLI prompt     | `admin_user_id`, `target_username`, `client`, `confirmation_method` ("typed_username", "yes_flag", "prompt_yes") |
| `AdminUserDeleteCancelled`    | User cancels the deletion in the web UI or CLI prompt      | `admin_user_id`, `target_username`, `client`                                                                  |

### Funnel Metrics

- **Confirmation-to-completion rate**: Percentage of delete confirmations that result in a successful deletion. A rate below 95% suggests UX friction or backend errors at the point of execution.
- **Cancel rate**: Percentage of delete dialog openings that result in cancellation rather than confirmation. A healthy cancel rate (10–30%) indicates the confirmation step is working — users are pausing and reconsidering.
- **Self-deletion attempt rate**: How often admins attempt to delete their own account. A non-trivial rate may indicate confusion about how to deactivate one's own account vs. admin-deleting another user.
- **Last-admin block rate**: How often the last-admin safeguard fires. On single-admin instances this could be noisy; on multi-admin instances it should be near zero.
- **Time-to-delete**: Median time between opening the confirmation dialog and completing the deletion in the web UI. Longer times suggest the confirmation step is causing hesitation (expected for destructive operations).

### Success Indicators

- Admin users can reliably remove accounts without resorting to direct database access.
- Zero instances of accidental self-deletion or last-admin lockout due to the safeguards.
- Audit log captures every deletion with sufficient context for post-incident review.
- Session and token revocation is immediate — no window exists where a deleted user retains access.

## Observability

### Logging

| Log Event                          | Level   | Structured Context                                                                                       | When                                                   |
|------------------------------------|---------|----------------------------------------------------------------------------------------------------------|---------------------------------------------------------|
| `admin.user.delete.request`        | `info`  | `admin_id`, `admin_username`, `target_username`, `ip`, `user_agent`                                      | Every delete request received                           |
| `admin.user.delete.success`        | `info`  | `admin_id`, `admin_username`, `target_user_id`, `target_username`, `sessions_revoked`, `tokens_revoked`, `org_memberships_removed`, `team_memberships_removed`, `duration_ms` | Successful deletion                                    |
| `admin.user.delete.not_found`      | `warn`  | `admin_id`, `admin_username`, `target_username`, `ip`                                                    | Target user not found or already inactive               |
| `admin.user.delete.self_delete`    | `warn`  | `admin_id`, `admin_username`, `ip`                                                                       | Admin attempted to delete their own account             |
| `admin.user.delete.last_admin`     | `warn`  | `admin_id`, `admin_username`, `target_username`, `target_user_id`, `ip`                                  | Attempted to delete the last remaining admin            |
| `admin.user.delete.denied`         | `warn`  | `user_id` (nullable), `reason`, `ip`, `user_agent`                                                       | Unauthorized access attempt                             |
| `admin.user.delete.error`          | `error` | `admin_id`, `admin_username`, `target_username`, `error_message`, `stack_trace`, `duration_ms`           | Internal error during deletion                          |
| `admin.user.delete.sessions_revoked` | `info`| `target_user_id`, `target_username`, `count`                                                             | Sessions revoked as part of deletion                    |
| `admin.user.delete.tokens_revoked` | `info`  | `target_user_id`, `target_username`, `count`                                                             | Tokens revoked as part of deletion                      |
| `admin.user.delete.slow`           | `warn`  | `admin_id`, `target_username`, `duration_ms`                                                             | Deletion took longer than 3000ms threshold              |

### Prometheus Metrics

| Metric Name                                    | Type      | Labels                                                    | Description                                                  |
|------------------------------------------------|-----------|-----------------------------------------------------------|--------------------------------------------------------------|
| `codeplane_admin_user_delete_requests_total`   | Counter   | `status` (204, 400, 401, 403, 404, 429, 500)              | Total admin user delete requests by response status          |
| `codeplane_admin_user_delete_duration_ms`      | Histogram | `status`                                                   | Latency distribution (buckets: 50, 100, 250, 500, 1000, 2500, 5000ms) |
| `codeplane_admin_user_delete_denied_total`     | Counter   | `reason` (not_authenticated, not_admin, self_delete, last_admin, scope_missing) | Denied delete attempts by reason |
| `codeplane_admin_user_delete_side_effects`     | Histogram | `effect` (sessions_revoked, tokens_revoked, org_memberships_removed, team_memberships_removed, assignments_cleared) | Count of side-effect items per deletion |
| `codeplane_admin_user_delete_not_found_total`  | Counter   | —                                                          | Delete attempts on non-existent or already-deleted users     |

### Alerts

#### Alert: `AdminUserDeleteHighErrorRate`
- **Condition:** `rate(codeplane_admin_user_delete_requests_total{status="500"}[10m]) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Check server logs for `admin.user.delete.error` entries — examine `error_message` and `stack_trace` for root cause.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check for transaction deadlocks — the delete operation touches multiple tables (users, sessions, tokens, org_members, team_members, issue_assignees) in a single transaction. Look for lock contention.
  4. If the error is a constraint violation, check whether a new foreign key dependency has been added to the users table without updating the delete service.
  5. If database is healthy but errors persist, check if the session/token revocation queries are failing — these may indicate schema drift.
  6. Escalate to the database team if the issue involves deadlocks or constraint violations that cannot be resolved by retrying.

#### Alert: `AdminUserDeleteHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_admin_user_delete_duration_ms_bucket[10m])) > 3000`
- **Severity:** Warning
- **Runbook:**
  1. Check `admin.user.delete.slow` log entries for the affected time period.
  2. Identify which step is slow — the transaction includes user deactivation, session revocation, token revocation, membership removal, and assignment clearing. Check if a specific table is large or unindexed.
  3. For large session/token tables: verify indexes exist on `user_id` columns in the sessions and tokens tables.
  4. For large org/team membership tables: verify indexes exist on `user_id` in `org_members` and `team_members`.
  5. If the user being deleted has an exceptionally large number of issue assignments, the `UPDATE issues SET assignee_id = NULL WHERE assignee_id = $1` query may be slow. Consider batching.
  6. If latency is consistently high across all deletions, the transaction scope may be too broad — consider breaking non-critical side effects (like assignment clearing) into async post-deletion tasks.

#### Alert: `AdminUserDeleteDeniedSpike`
- **Condition:** `rate(codeplane_admin_user_delete_denied_total[5m]) > 3`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.user.delete.denied` log entries for source IPs and user agents.
  2. If the denials are `not_admin` or `not_authenticated`, determine whether a misconfigured script or integration is calling the delete endpoint with wrong credentials.
  3. If the denials are `self_delete`, a single admin may be confused about the self-deletion prevention. No action needed unless persistent.
  4. If the denials are `scope_missing`, an admin's PAT needs the `write:admin` scope. Advise the admin to regenerate their token.
  5. If denials come from a single IP with varied usernames, this may indicate a privilege escalation attempt. Investigate and consider IP-level blocking.

#### Alert: `AdminUserDeleteBurst`
- **Condition:** `increase(codeplane_admin_user_delete_requests_total{status="204"}[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. A burst of successful deletions may indicate an authorized bulk cleanup (acceptable) or a compromised admin account (critical).
  2. Check audit logs (`GET /api/admin/audit-logs?since=<5min_ago>`) to identify which admin performed the deletions.
  3. Contact the admin to confirm the deletions were intentional.
  4. If the admin did not initiate the deletions, immediately: (a) revoke all sessions for the compromised admin, (b) rotate the admin's credentials, (c) assess whether deleted users need to be restored.
  5. Consider enabling mandatory MFA for admin accounts if not already enforced.

### Error Cases and Failure Modes

| Failure Mode                              | Symptom                              | Behavior                                                                    |
|-------------------------------------------|--------------------------------------|-----------------------------------------------------------------------------|
| Database unreachable                      | 500 Internal Server Error            | Returns error JSON, logs `admin.user.delete.error`, no side effects execute |
| Transaction deadlock                      | 500 or timeout                       | Transaction rolls back, no partial state, error is logged                   |
| User lookup query fails                   | 500 Internal Server Error            | Returns error JSON, deletion does not proceed                               |
| Session revocation fails mid-transaction  | 500 Internal Server Error            | Entire transaction rolls back including the soft-delete                     |
| Token revocation fails mid-transaction    | 500 Internal Server Error            | Entire transaction rolls back including the soft-delete                     |
| Invalid session/token (auth failure)      | 401 Unauthorized                     | Returns error JSON, no database mutation                                    |
| Admin flag revoked mid-request            | 401 Unauthorized                     | Auth check happens at entry; if revoked after check, deletion may proceed   |
| Target user has thousands of tokens       | Slow response (>3s)                  | Transaction may be slow; logged as `admin.user.delete.slow`                 |
| Concurrent deletion of same user          | First succeeds (204), second gets 404| Acceptable behavior — no data corruption                                    |
| Network timeout before 204 is received    | Client sees timeout                  | Deletion may have completed; client should check user status                |

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                                     | Expected Result                                                          |
|----------|------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| API-01   | `DELETE /api/admin/users/:username` with valid admin session and existing user returns 204            | Status 204, empty body                                                   |
| API-02   | After successful deletion, the target user no longer appears in `GET /api/admin/users`               | User array does not contain the deleted username                         |
| API-03   | After successful deletion, the target user's profile `GET /api/users/:username` returns 404 or shows inactive | Profile is inaccessible                                          |
| API-04   | After successful deletion, the target user's sessions are revoked (logging in with old session fails)| Auth with old session cookie returns 401                                 |
| API-05   | After successful deletion, the target user's PATs are revoked (API call with old PAT fails)          | Auth with old PAT returns 401                                            |
| API-06   | After successful deletion, creating a new user with the same username returns 409 or appropriate conflict error | Username is reserved, creation fails                            |
| API-07   | `DELETE /api/admin/users/:username` returns 404 when username does not exist                         | Status 404, body contains `"user not found"`                             |
| API-08   | `DELETE /api/admin/users/:username` returns 404 when user is already deleted (inactive)              | Status 404, body contains `"user not found"`                             |
| API-09   | `DELETE /api/admin/users/:username` returns 403 when admin deletes themselves                        | Status 403, body contains `"cannot delete your own account"`             |
| API-10   | `DELETE /api/admin/users/:username` returns 403 when deleting the last admin                         | Status 403, body contains `"cannot delete the last admin user"`          |
| API-11   | `DELETE /api/admin/users/:username` returns 400 when username is empty string                        | Status 400, body contains `"username is required"`                       |
| API-12   | `DELETE /api/admin/users/:username` returns 400 when username is whitespace-only                     | Status 400, body contains `"username is required"`                       |
| API-13   | `DELETE /api/admin/users/:username` without authentication returns 401                               | Status 401, body contains `"authentication required"`                    |
| API-14   | `DELETE /api/admin/users/:username` with valid non-admin token returns 401                           | Status 401, body contains `"admin access required"`                      |
| API-15   | `DELETE /api/admin/users/:username` with expired/invalid token returns 401                           | Status 401                                                               |
| API-16   | `DELETE /api/admin/users/:username` with PAT having `write:admin` scope succeeds                     | Status 204                                                               |
| API-17   | `DELETE /api/admin/users/:username` with PAT having only `read:admin` scope is denied                | Status 403                                                               |
| API-18   | `DELETE /api/admin/users/:username` with PAT lacking any admin scope is denied                        | Status 401 or 403                                                        |
| API-19   | Deleting a non-admin user when multiple admins exist succeeds                                         | Status 204                                                               |
| API-20   | Deleting an admin user when multiple admins exist succeeds                                            | Status 204                                                               |
| API-21   | Username lookup is case-insensitive: `DELETE /api/admin/users/Alice` matches user `alice`             | Status 204 (or consistent behavior matching user lookup)                 |
| API-22   | Username with valid special characters (hyphens): `DELETE /api/admin/users/alice-smith` works         | Status 204 for existing user, 404 for non-existing                       |
| API-23   | Username at maximum length (39 chars) is correctly handled                                            | Status 204 for existing user, 404 for non-existing                       |
| API-24   | Username exceeding maximum length (40+ chars) returns 404 (no such user can exist)                   | Status 404                                                               |
| API-25   | Concurrent delete requests for the same user: first returns 204, second returns 404                   | Exactly one 204 and one 404 across two concurrent requests               |
| API-26   | After deletion, user's organization memberships are removed                                           | `GET /api/orgs/:org/members` no longer lists the deleted user            |
| API-27   | After deletion, user's team memberships are removed                                                   | Team member lists no longer include the deleted user                     |
| API-28   | After deletion, issues assigned to the user have assignee cleared                                     | `GET /api/repos/:owner/:repo/issues/:id` shows null assignee             |
| API-29   | Audit log contains an entry for the deletion with correct event_type, actor, and target               | `GET /api/admin/audit-logs?since=...` includes `user.delete` entry       |
| API-30   | Rate limiting: sending 11+ delete requests in rapid succession triggers 429                           | At least one response is 429 with `Retry-After` header                   |
| API-31   | Deleting a user who owns repositories does NOT delete those repositories                              | Repositories still exist after user deletion                             |
| API-32   | Deleting a user preserves their authored issue comments (comments remain with author attribution)     | Issue comments by the deleted user are still retrievable                  |

### CLI E2E Tests

| Test ID  | Test Description                                                                                     | Expected Result                                                          |
|----------|------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| CLI-01   | `codeplane admin user delete <username> --yes` with admin token exits 0                              | Exit code 0, stdout contains `"deleted"`                                 |
| CLI-02   | `codeplane admin user delete <username> --yes --json` outputs valid JSON                             | `JSON.parse(stdout)` succeeds, contains `status: "deleted"` and username |
| CLI-03   | `codeplane admin user delete <nonexistent> --yes` returns non-zero exit and error message             | Exit code 1, stderr contains "not found" or "404"                        |
| CLI-04   | `codeplane admin user delete <self> --yes` returns non-zero exit with self-deletion error             | Exit code 1, stderr contains "cannot delete your own account"            |
| CLI-05   | `codeplane admin user delete <username> --yes` with non-admin token fails                            | Exit code 1, stderr contains authorization error                         |
| CLI-06   | `codeplane admin user delete <username> --yes` without any token fails                               | Exit code 1, stderr contains authentication error                        |
| CLI-07   | `codeplane admin user delete <username> --yes` followed by `codeplane admin user list` shows user gone | User not present in subsequent list output                             |
| CLI-08   | `codeplane admin user delete <already-deleted> --yes` returns not found                              | Exit code 1, stderr contains "not found"                                 |
| CLI-09   | `codeplane admin user delete <username-with-hyphens> --yes` works for valid hyphenated usernames      | Exit code 0 for existing user                                            |
| CLI-10   | `codeplane admin user delete` without username argument shows usage error                             | Exit code 1, stderr contains usage/help information                      |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                                     | Expected Result                                                          |
|----------|------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| UI-01    | Admin navigates to `/admin/users`, clicks kebab menu on a user row, and sees "Delete user" option    | Menu item with destructive styling is visible                            |
| UI-02    | Clicking "Delete user" opens a confirmation dialog with the target username displayed                 | Modal is visible with correct username                                   |
| UI-03    | Confirmation dialog has a text input requiring the username to be typed                               | Input field is present, delete button is disabled until username matches |
| UI-04    | Typing the correct username enables the "Delete user" button                                         | Button becomes enabled/clickable                                         |
| UI-05    | Typing an incorrect username keeps the "Delete user" button disabled                                  | Button remains disabled                                                  |
| UI-06    | Clicking "Cancel" closes the dialog without deleting the user                                         | Dialog closes, user still appears in the table                           |
| UI-07    | Completing deletion shows success toast and removes the user from the table                           | Toast appears, table row disappears, total count decrements              |
| UI-08    | Attempting to delete own account shows the kebab menu item as disabled with tooltip                    | Menu item is disabled, tooltip shows explanation                         |
| UI-09    | Deletion error (e.g., last admin) shows inline error in the dialog                                    | Error message visible inside the modal, dialog remains open              |
| UI-10    | During deletion request, the confirm button shows a loading spinner and is disabled                    | Spinner visible, button not clickable                                    |
| UI-11    | Non-admin user navigating to `/admin/users` cannot see or trigger delete actions                       | Admin page is inaccessible (redirect or 403)                             |
| UI-12    | After deletion, navigating away and back to `/admin/users` still shows the user as deleted (not cached)| User is absent from refreshed list                                     |
| UI-13    | Dialog body text accurately describes consequences (sessions, tokens, memberships)                     | All consequence items are listed in the dialog body                      |
| UI-14    | Pressing Escape closes the confirmation dialog without deleting                                        | Dialog closes, no deletion occurs                                        |
| UI-15    | Clicking outside the confirmation dialog does NOT close it (prevents accidental dismissal)             | Dialog remains open when clicking the backdrop                           |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                                     | Expected Result                                                          |
|----------|------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| CC-01    | User deleted via API is no longer visible in CLI `admin user list`                                    | CLI list output does not contain the deleted username                     |
| CC-02    | User deleted via CLI is no longer visible in web UI admin user table                                  | Web UI table does not contain the deleted username                        |
| CC-03    | Error messages for self-deletion are consistent across API (JSON), CLI (stderr), and web UI (dialog)  | All surfaces communicate the same constraint with equivalent wording     |
| CC-04    | Error messages for last-admin prevention are consistent across API, CLI, and web UI                   | All surfaces communicate the same constraint with equivalent wording     |
| CC-05    | Audit log entry created by CLI delete is visible through the API `GET /api/admin/audit-logs`          | Audit entry present with matching `event_type`, `actor_name`, `target_name` |

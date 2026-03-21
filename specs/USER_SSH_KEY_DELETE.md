# USER_SSH_KEY_DELETE

Specification for USER_SSH_KEY_DELETE.

## High-Level User POV

When you manage your Codeplane account, your SSH keys are the credentials that let you push and pull code without a password. Over time, keys accumulate — from old laptops you no longer use, CI runners that have been decommissioned, or security keys you've replaced. Deleting an SSH key removes that credential from your account permanently, instantly revoking its ability to authenticate against Codeplane's SSH server.

From the web UI settings page, the CLI, or the TUI, you can select an SSH key you want to remove and delete it. The experience is straightforward: you identify the key you want to remove (using the title, fingerprint, or ID from your key list), confirm the deletion, and the key is gone. Any machine that was using that key to connect to Codeplane over SSH will immediately lose access. If you accidentally delete a key you still need, you can simply re-add the public key material — there is no "undo" because the key itself still exists on your machine.

This is a critical credential hygiene action. It lets you revoke access for a lost device, rotate to a new key, or clean up keys you added during testing. The delete action is always scoped to your own account — you can only delete your own keys, never anyone else's — and it requires explicit confirmation to prevent accidental removal.

## Acceptance Criteria

- **Authenticated access required**: The delete endpoint must return `401 Unauthorized` when called without a valid session cookie or personal access token.
- **Write scope required**: The delete endpoint must reject read-only personal access tokens. Deleting a key is a destructive mutation and requires write scope.
- **User-scoped ownership**: A user may only delete SSH keys belonging to their own account. Attempting to delete another user's key must return `404 Not Found` (not `403`), to avoid leaking the existence of other users' keys.
- **Key ID validation**: The key ID must be a positive integer. Non-numeric values, zero, negative numbers, floating-point numbers, and values exceeding `Number.MAX_SAFE_INTEGER` must be rejected with `400 Bad Request`.
- **Key existence check**: If the key ID does not correspond to any existing SSH key, the endpoint must return `404 Not Found`.
- **Immediate effect**: Once deleted, the key must no longer appear in the user's SSH key list (`GET /api/user/keys`), and SSH authentication attempts using that key's fingerprint must fail.
- **Idempotent safety**: Deleting an already-deleted key must return `404 Not Found` (not a server error). The operation must not crash, corrupt data, or leave orphan records.
- **No cascading deletes**: Deleting an SSH key must not affect the user's repositories, issues, landing requests, or any other data. The only effect is the removal of the key credential itself.
- **Confirmation required in interactive clients**: The CLI must support a `--yes` flag to skip confirmation. Without `--yes`, the CLI should prompt the user to confirm before proceeding. The web UI must show a confirmation dialog before executing the delete.
- **HTTP response**: Successful deletion must return `204 No Content` with an empty body.
- **Content-Type on errors**: Error responses must have `Content-Type: application/json`.
- **Key ID path parameter constraints**: The key ID is provided as a URL path segment. Leading zeros are acceptable (e.g., `007` is parsed as `7`). Non-integer strings (e.g., `abc`, `1.5`, empty string) must be rejected.
- **Maximum key ID value**: Key IDs up to `2^53 - 1` (JavaScript safe integer range) must be accepted. Values beyond this range must be rejected with `400 Bad Request`.
- **No request body required**: The `DELETE` request must not require a request body. Any body sent must be ignored.
- **Defense-in-depth deletion**: The database deletion query must filter on both `id` AND `user_id` to prevent cross-user deletion even if the application-layer ownership check is bypassed.

### Definition of Done

1. The API correctly returns `204 No Content` for a valid delete and appropriate error codes for all invalid cases.
2. All acceptance criteria pass in automated E2E tests (API, CLI, and Playwright).
3. The CLI `ssh-key delete <id>` command works with `--yes` flag and prompts without it.
4. The web UI settings page shows a delete button per key row, presents a confirmation dialog, and removes the key from the list on success.
5. User isolation is verified by a cross-user deletion test.
6. SSH authentication with a deleted key fails.
7. The documentation accurately reflects the delete behavior, CLI usage, and API shape.

## Design

### API Shape

**Endpoint**: `DELETE /api/user/keys/:id`

**Authentication**: Required. Session cookie or `Authorization: token <PAT>` header. Write scope required.

**Path Parameters**:

| Parameter | Type | Description | Constraints |
|-----------|------|-------------|-------------|
| `id` | `number` | Unique identifier of the SSH key to delete | Positive integer, 1 to 2^53 - 1 |

**Request Body**: None. Any body sent is ignored.

**Success Response** (`204 No Content`): Empty body. No `Content-Type` header required for empty bodies.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Key ID is not a valid positive integer | `{"message": "invalid key id"}` |
| `401 Unauthorized` | No valid session or token | `{"message": "authentication required"}` |
| `403 Forbidden` | Token lacks write scope | `{"message": "write scope required"}` |
| `404 Not Found` | Key does not exist or does not belong to the authenticated user | `{"message": "ssh key not found"}` |
| `429 Too Many Requests` | Rate limit exceeded | `{"message": "rate limit exceeded"}` |

**Idempotency**: Deleting an already-deleted key returns `404 Not Found`. There is no `410 Gone` distinction.

### SDK Shape

The `UserService.deleteSSHKey(userID: number, keyID: number)` method in `@codeplane/sdk` returns `Result<void, APIError>`. The method: (1) validates `userID > 0`, (2) validates `keyID > 0`, (3) looks up the key by `keyID` using `getSSHKeyByID`, (4) verifies `key.userId === String(userID)`, (5) deletes using `deleteSSHKey(id, userId)` with both parameters in the WHERE clause, (6) returns `Result.ok(undefined)` on success.

### CLI Command

**Command**: `codeplane ssh-key delete <id> [--yes]`

**Arguments**: `id` (positional, required) — The numeric ID of the SSH key to delete.

**Options**: `--yes` (boolean, default `false`) — Skip confirmation prompt.

**Behavior**: Parse `id` argument; reject if not a valid positive safe integer. Without `--yes`, prompt: `Are you sure you want to delete SSH key <id>? This will revoke SSH access for any machine using this key. (y/N)`. On confirm, send `DELETE /api/user/keys/<id>`. On `204`: output `{"status":"deleted","id":<id>}` in JSON mode or `SSH key <id> deleted.` in human-readable mode. Exit code 0. On `404`: print `Error: SSH key not found.` and exit 1.

### Web UI Design

**Location**: User Settings → SSH Keys (`/settings/keys`)

**Delete affordance per key row**: Each row includes a right-aligned delete button styled as a destructive action (red text or trash icon). `aria-label="Delete SSH key <key title>"` for accessibility.

**Confirmation dialog**: Modal with title "Delete SSH Key", body: `Are you sure you want to delete "<key title>"? Any machine using this key will no longer be able to connect to Codeplane over SSH.` Key fingerprint shown in monospace. Buttons: "Cancel" (default focus, secondary) and "Delete" (destructive, red). Escape or click-outside cancels. Loading spinner on Delete button during API call, both buttons disabled during request.

**After successful deletion**: Dialog closes, key row removed (with fade-out animation), toast: `SSH key "<key title>" deleted.` If last key, show empty state.

**Error handling**: On API failure, dialog stays open with inline error: `Failed to delete key. Please try again.` Delete button re-enables. On 404, close dialog, remove row, toast: `Key was already deleted.`

### TUI UI

**Delete flow**: With key highlighted, press `d` or `Delete`. Confirmation bar at bottom: `Delete SSH key "<title>"? [y/N]`. On `y`: API call, key removed, status message. On `n`: dismissed. On error: error message replaces confirmation bar.

### Documentation

The `docs/guides/ssh-keys.mdx` must include a "Deleting an SSH Key" section covering: when to delete a key (lost device, rotation, CI cleanup); warning about immediate effect; CLI usage example with and without `--yes`; finding the key ID via `codeplane ssh-key list`; API curl example for `DELETE /api/user/keys/:id`; re-adding accidentally deleted keys; troubleshooting "Permission denied (publickey)" after deletion.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Authenticated user (write scope)** | Can delete their own SSH keys. Always scoped to the calling user. |
| **Read-only PAT** | Denied. Returns `403`. Deletion requires write scope. |
| **Full-scope PAT** | Permitted. Can delete the user's own keys. |
| **Session cookie** | Permitted. Can delete the user's own keys. |
| **Unauthenticated** | Denied. Returns `401`. |
| **Admin** | Cannot delete another user's SSH keys via this endpoint. Admin key management is a separate admin surface. |

### Rate Limiting

- **Standard API rate limit**: Subject to the global per-user rate limiter.
- **Recommended limit**: 30 requests per minute per authenticated user (lower than read endpoints due to destructive nature).
- **Response on limit breach**: `429 Too Many Requests` with a `Retry-After` header.
- **Burst protection**: Rate limiting must prevent automated scripts from deleting all keys in rapid succession.

### Data Privacy & PII

- **Key material is never exposed**: The delete response returns no key data (204 empty body).
- **Audit trail**: Deletion logged with key ID and user ID; key title (potential PII) only at DEBUG level.
- **Fingerprints in logs**: Deleted key's fingerprint at DEBUG level only, not INFO or higher.
- **Hard delete**: SSH keys are hard-deleted, no residual key material retained.
- **No notification to other users**: Deleting a key does not trigger notifications to anyone.

### Security Considerations

- **CSRF protection**: Web UI delete flow includes CSRF token validation.
- **Timing attack resistance**: Response for "key belongs to another user" is indistinguishable from "key does not exist" — both return `404` with identical message.
- **Defense in depth**: SQL DELETE includes both `id` AND `user_id` in WHERE clause.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ssh_key.deleted` | User successfully deletes an SSH key | `user_id`, `key_id`, `key_type`, `key_age_days`, `remaining_key_count`, `client`, `timestamp` |
| `ssh_key.delete_failed` | Delete attempt fails | `user_id` (if authenticated), `key_id`, `error_reason` (`not_found`, `auth_error`, `rate_limited`, `invalid_id`, `server_error`), `client`, `timestamp` |
| `ssh_key.delete_confirmed` | User confirms deletion in dialog (web/TUI) | `user_id`, `key_id`, `client`, `timestamp`, `time_to_confirm_ms` |
| `ssh_key.delete_cancelled` | User cancels deletion in dialog | `user_id`, `key_id`, `client`, `timestamp` |

### Properties Required on All Events

- `user_id` (anonymized in analytics pipeline)
- `client` (one of: `web`, `cli`, `tui`, `api`, `vscode`, `nvim`)
- `timestamp` (ISO 8601)
- `request_id` (for correlation)

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Delete completion rate** | % of delete initiations that result in successful deletion | > 80% |
| **Key hygiene rate** | % of users who delete at least one key per quarter | Increasing over time |
| **Orphaned key detection** | % of deletions where `key_age_days` > 365 | If high, consider prompting users to review old keys |
| **Zero-key-after-delete rate** | % of deletions that leave user with 0 remaining keys | Should be low |
| **Re-add rate** | % of users who add a new key within 1 hour of deleting one | Indicates rotation (healthy) vs. accidental deletion |

## Observability

### Logging

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Delete request received | DEBUG | `user_id`, `request_id`, `key_id` | Entry point |
| Key ownership verified | DEBUG | `user_id`, `request_id`, `key_id`, `key_fingerprint` | Key exists and belongs to user |
| Key deleted successfully | INFO | `user_id`, `request_id`, `key_id`, `duration_ms` | Successful deletion (no PII) |
| Delete — key not found | INFO | `user_id`, `request_id`, `key_id` | Key does not exist or belongs to another user |
| Delete — invalid key ID | WARN | `request_id`, `raw_id`, `ip` | Malformed key ID |
| Delete — auth failure | WARN | `request_id`, `ip`, `auth_method_attempted` | Unauthenticated or invalid token |
| Delete — write scope missing | WARN | `user_id`, `request_id`, `ip` | Read-only token for destructive operation |
| Delete — service error | ERROR | `user_id`, `request_id`, `key_id`, `error_message`, `stack` | Database or internal failure |
| Delete — rate limited | WARN | `user_id`, `request_id`, `ip` | Rate limit exceeded |
| Delete — ownership mismatch | WARN | `request_id`, `key_id`, `requesting_user_id` | Cross-user deletion attempt |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_ssh_key_delete_total` | Counter | `status` (`success`, `not_found`, `auth_error`, `invalid_id`, `rate_limited`, `error`) | Total delete requests by outcome |
| `codeplane_ssh_key_delete_duration_seconds` | Histogram | — | Latency distribution |
| `codeplane_ssh_key_delete_confirmation_total` | Counter | `result` (`confirmed`, `cancelled`) | Confirmation dialog outcomes (client-side) |
| `codeplane_ssh_keys_total` | Gauge | — | Total SSH keys in the system |

### Alerts

#### Alert: `SSHKeyDeleteHighErrorRate`
**Condition**: `rate(codeplane_ssh_key_delete_total{status="error"}[5m]) / rate(codeplane_ssh_key_delete_total[5m]) > 0.1` for 5 minutes.
**Severity**: Warning.
**Runbook**: 1. Check server error logs for ssh_key delete failures. 2. Verify database connectivity. 3. Check ssh_keys table accessibility. 4. Look for database lock contention. 5. Check recent deployments or migrations. 6. Check service layer for unhandled rejections. 7. Escalate to platform team if DB degraded.

#### Alert: `SSHKeyDeleteLatencyHigh`
**Condition**: `histogram_quantile(0.95, rate(codeplane_ssh_key_delete_duration_seconds_bucket[5m])) > 3.0` for 5 minutes.
**Severity**: Warning.
**Runbook**: 1. Check DB query performance for ssh_keys. 2. Verify indices on id and user_id. 3. Check connection pool utilization. 4. Check server resources. 5. Verify getSSHKeyByID is not table-scanning. 6. Investigate automated script users. 7. Consider query-level timeouts.

#### Alert: `SSHKeyDeleteOwnershipMismatchSpike`
**Condition**: `rate(codeplane_ssh_key_delete_total{status="not_found"}[5m]) > 20` for 3 minutes with correlated ownership mismatch WARN logs.
**Severity**: Critical.
**Runbook**: 1. May indicate cross-user key deletion attack or client bug. 2. Check WARN logs for requesting_user_id and ip. 3. If single IP, consider temporary rate-limit escalation or IP blocking. 4. If multiple users, check client releases for regressions. 5. Confirm defense-in-depth SQL WHERE clause is intact.

#### Alert: `SSHKeyMassDeleteBurst`
**Condition**: `increase(codeplane_ssh_key_delete_total{status="success"}[1m]) > 20`.
**Severity**: Warning.
**Runbook**: 1. May indicate compromised account or unintentional automation. 2. Correlate user_id from INFO logs. 3. Check if user also created keys recently (rotation vs. unexpected). 4. Contact user out-of-band if suspicious. 5. Consider temporary account lock via admin.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status |
|------------|-------------------|-------------|
| No auth token / expired session | Return `401`, log at WARN | 401 |
| Invalid PAT (malformed) | Return `401`, log at WARN | 401 |
| Revoked PAT | Return `401`, log at WARN | 401 |
| Read-only PAT | Return `403`, log at WARN | 403 |
| Key ID not a number | Return `400`, log at WARN | 400 |
| Key ID zero or negative | Return `400`, log at WARN | 400 |
| Key ID is float | Return `400`, log at WARN | 400 |
| Key ID exceeds MAX_SAFE_INTEGER | Return `400`, log at WARN | 400 |
| Key does not exist | Return `404`, log at INFO | 404 |
| Key belongs to another user | Return `404`, log at WARN | 404 |
| Database unreachable | Return `500`, log at ERROR | 500 |
| Database query timeout | Return `500`, log at ERROR | 500 |
| Rate limit exceeded | Return `429` with Retry-After, log at WARN | 429 |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `API-DEL-001` | `DELETE /api/user/keys/:id` with valid auth and valid key ID belonging to the user | `204 No Content`, empty body |
| `API-DEL-002` | After successful delete, `GET /api/user/keys` no longer includes the deleted key | Deleted key's `id` is absent from the list |
| `API-DEL-003` | `DELETE /api/user/keys/:id` without auth header | `401 Unauthorized` |
| `API-DEL-004` | `DELETE /api/user/keys/:id` with expired/invalid token | `401 Unauthorized` |
| `API-DEL-005` | `DELETE /api/user/keys/:id` with read-only PAT | `403 Forbidden` |
| `API-DEL-006` | `DELETE /api/user/keys/:id` where key does not exist (e.g., ID `999999999`) | `404 Not Found` |
| `API-DEL-007` | `DELETE /api/user/keys/:id` where key belongs to a different user (User A tries to delete User B's key) | `404 Not Found` (not `403`) |
| `API-DEL-008` | `DELETE /api/user/keys/:id` with ID `0` | `400 Bad Request` with `"invalid key id"` |
| `API-DEL-009` | `DELETE /api/user/keys/:id` with ID `-1` | `400 Bad Request` |
| `API-DEL-010` | `DELETE /api/user/keys/:id` with ID `abc` | `400 Bad Request` |
| `API-DEL-011` | `DELETE /api/user/keys/:id` with ID `1.5` | `400 Bad Request` |
| `API-DEL-012` | `DELETE /api/user/keys/:id` with ID as empty string (path `/api/user/keys/`) | `400 Bad Request` or `404` (route miss) |
| `API-DEL-013` | `DELETE /api/user/keys/:id` with ID exceeding `Number.MAX_SAFE_INTEGER` (`9007199254740992`) | `400 Bad Request` |
| `API-DEL-014` | `DELETE /api/user/keys/:id` with a valid maximum key ID (the largest `id` in the database) | `204 No Content` |
| `API-DEL-015` | Idempotency: delete the same key twice | First call returns `204`, second call returns `404` |
| `API-DEL-016` | Delete a key then re-add the same public key material | Re-add succeeds (fingerprint uniqueness cleared) |
| `API-DEL-017` | Response has no body on success | Response body is empty (length 0) |
| `API-DEL-018` | Error response `Content-Type` is `application/json` | Header present and correct |
| `API-DEL-019` | Delete with a request body present (`{"foo": "bar"}`) — body is ignored | `204 No Content` |
| `API-DEL-020` | Cross-user isolation: User A adds key, User B attempts delete | `404` for User B; User A's key still present |
| `API-DEL-021` | Add 3 keys, delete the middle one, verify other 2 remain in correct order | List returns 2 keys in reverse chronological order |
| `API-DEL-022` | Delete the user's only SSH key (last remaining key) | `204`, subsequent list returns `[]` |
| `API-DEL-023` | Key ID with leading zeros (e.g., `007`) | `204 No Content` (parsed as `7`) |
| `API-DEL-024` | Key ID with whitespace (e.g., ` 7 `) | `400 Bad Request` |
| `API-DEL-025` | Key ID `NaN` | `400 Bad Request` |
| `API-DEL-026` | Key ID `Infinity` | `400 Bad Request` |

### CLI Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `CLI-DEL-001` | `codeplane ssh-key delete <id> --yes` with valid auth | Exit code 0, output includes `deleted` |
| `CLI-DEL-002` | `codeplane ssh-key delete <id> --yes --json` returns structured JSON | Exit code 0, parseable JSON with status and id |
| `CLI-DEL-003` | Round-trip: add → list → delete → list → verify absent | Key appears after add, disappears after delete |
| `CLI-DEL-004` | `codeplane ssh-key delete 999999999 --yes` for non-existent key | Exit code ≠ 0 |
| `CLI-DEL-005` | `codeplane ssh-key delete <id>` without `--yes` and without TTY | Defined non-interactive behavior |
| `CLI-DEL-006` | `codeplane ssh-key delete abc --yes` | Exit code ≠ 0, error mentions invalid ID |
| `CLI-DEL-007` | `codeplane ssh-key delete 0 --yes` | Exit code ≠ 0 |
| `CLI-DEL-008` | `codeplane ssh-key delete -1 --yes` | Exit code ≠ 0 |
| `CLI-DEL-009` | Delete without auth token | Exit code ≠ 0, error mentions authentication |
| `CLI-DEL-010` | Delete with read-only token | Exit code ≠ 0 |
| `CLI-DEL-011` | Delete via CLI, verify via API that it's gone | API list no longer contains the key |
| `CLI-DEL-012` | Delete via API, attempt CLI delete of same key | CLI exits non-zero with not-found error |

### Playwright (Web UI) E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `UI-DEL-001` | Navigate to `/settings/keys`, each key row has a delete button | Delete button visible per row |
| `UI-DEL-002` | Click delete button, confirmation dialog appears with key title and fingerprint | Dialog visible with correct metadata |
| `UI-DEL-003` | Click "Cancel" in dialog, key NOT deleted | Dialog closes, key remains, API unchanged |
| `UI-DEL-004` | Press Escape while dialog open | Dialog closes, key not deleted |
| `UI-DEL-005` | Click "Delete" in dialog, key removed from list | Key row disappears, toast appears |
| `UI-DEL-006` | After delete, page refresh doesn't show deleted key | Key gone from server-side list |
| `UI-DEL-007` | Delete last remaining key, empty state appears | Empty state message and Add CTA visible |
| `UI-DEL-008` | Delete button shows loading state during API call | Spinner visible, buttons disabled |
| `UI-DEL-009` | Simulate API failure, error message in dialog | Error visible, Delete button re-enabled |
| `UI-DEL-010` | Delete button has correct aria-label | Attribute present with key title |
| `UI-DEL-011` | Navigate to `/settings/keys` without auth | Redirected to login |
| `UI-DEL-012` | Concurrent delete: another tab deletes key first, confirm in first tab | Handles 404 gracefully, key removed |

### Cross-Cutting Validation Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `CROSS-DEL-001` | Add key via CLI, delete via API | API returns `204`, CLI list confirms absence |
| `CROSS-DEL-002` | Add key via API, delete via CLI | CLI exits 0, API list confirms absence |
| `CROSS-DEL-003` | Add via web UI (API), delete via web UI, verify via CLI | All surfaces agree key is gone |
| `CROSS-DEL-004` | Delete key, re-add same public key material | Re-add succeeds |
| `CROSS-DEL-005` | Two parallel DELETE requests for same key | One `204`, one `404`, no server errors |
| `CROSS-DEL-006` | Add 50 keys, delete all 50 sequentially, verify empty | All deletes succeed, final list is `[]` |
| `CROSS-DEL-007` | Add 20 keys, delete all 20 concurrently | All complete (mix of `204`/`404`), final list is `[]` |
| `CROSS-DEL-008` | After deleting key, SSH auth with that key fails | SSH rejected with permission denied |
| `CROSS-DEL-009` | Delete key A, verify key B still works for SSH | SSH with key B succeeds |
| `CROSS-DEL-010` | User A deletes their key, User B's key unaffected | User B can still list and use their keys |

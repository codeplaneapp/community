# USER_EMAIL_DELETE

Specification for USER_EMAIL_DELETE.

## High-Level User POV

Over time, a Codeplane user may accumulate email addresses that are no longer relevant — an old work address after changing employers, a personal address they no longer use, or a test address they added while exploring the product. The ability to remove these stale addresses keeps their account clean, reduces clutter in their email settings, and ensures that only addresses they actively use remain associated with their identity.

Deleting an email address is a simple, deliberate action. The user navigates to their email settings, identifies the address they want to remove, and clicks a "Remove" button (or issues a delete command from the CLI or TUI). Codeplane confirms the deletion, and the address immediately disappears from their email list. The deletion is permanent — once removed, the email address is no longer associated with the user's account and could be claimed by another user in the future.

There is one important safety constraint: the user's primary email address cannot be deleted. The primary email is the address Codeplane uses for notifications, commit attribution, and account recovery. It must always be present. If the user wants to remove their current primary email, they must first designate a different email as primary, and then remove the old one. This two-step requirement prevents the user from accidentally leaving their account without a notification address.

The experience is protective and communicative. If the user tries to delete their primary email, they see a clear explanation of why that is not allowed and what they need to do instead. If the email they are trying to delete does not exist or does not belong to them, the system returns a clean error without leaking information about other accounts. After deletion, the email list refreshes to reflect the change immediately.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can delete any non-primary email address from their account via the web UI, CLI, and TUI, and the email is permanently removed from their email list with clear feedback for all success and error conditions.

### Functional Constraints

- [ ] Authenticated users can delete an email address via `DELETE /api/user/emails/:id`.
- [ ] On success, the API returns `204 No Content` with an empty response body.
- [ ] The deleted email no longer appears in the user's email list (`GET /api/user/emails`).
- [ ] A user cannot delete their primary email address. Attempting to do so returns a `400 Bad Request` with message `"cannot delete primary email address"`.
- [ ] A user can only delete their own email addresses. Attempting to delete an email belonging to another user returns `404 Not Found`.
- [ ] The deletion is permanent — the `email_addresses` row is hard-deleted from the database.
- [ ] After deletion, the email address is freed for use and can be added by any user (including the same user who deleted it).

### Input Validation Constraints

- [ ] The `:id` path parameter must be a positive integer. Non-numeric values (e.g., `abc`, `null`, `undefined`, empty string) return `400` with `"invalid email id"`.
- [ ] Zero and negative integers for `:id` return `400` with `"invalid email id"`.
- [ ] Floating-point numbers (e.g., `3.14`) are parsed to their integer portion (e.g., `3`) via `parseInt` behavior. If the resulting integer is a valid email ID, the request proceeds; otherwise it follows standard not-found behavior.
- [ ] Extremely large integers (e.g., `9999999999999999`) are accepted for parsing but will result in `404` if no matching record exists.

### Edge Cases

- [ ] Deleting an email that does not exist returns `404 Not Found` with `"email not found"`.
- [ ] Deleting an email ID that exists but belongs to a different user returns `404 Not Found` (not `403`) to avoid leaking the existence of the email record.
- [ ] Deleting an already-deleted email (double delete) returns `404 Not Found`.
- [ ] Deleting an unverified email is allowed — verification status does not affect deletability.
- [ ] Deleting the user's only non-primary email (leaving only the primary) succeeds — the user is left with a single email.
- [ ] After deleting a non-primary email and then re-adding it, the email receives a new `id` and `created_at` timestamp.
- [ ] Concurrent deletion of the same email by the same user (race condition) results in one `204` and one `404` — no 500 errors.
- [ ] If a user has exactly 10 emails and deletes one, they can immediately add a new email (bringing back to 10).

### Boundary Constraints

- [ ] The `:id` parameter must be a valid positive integer within the platform's ID range.
- [ ] The endpoint does not accept a request body — any body is ignored.
- [ ] The endpoint does not require a `Content-Type` header since there is no request body.
- [ ] The response has no body (204), so no `Content-Type` is returned on success.

## Design

### API Shape

**Endpoint:** `DELETE /api/user/emails/:id`

**Authentication:** Required. Session cookie or `Authorization: token <PAT>` header.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | The numeric ID of the email address to delete. |

**Request:** No query parameters. No request body.

**Success Response:** `204 No Content` — empty body.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `400` | `:id` is not a valid positive integer | `{ "message": "invalid email id" }` |
| `400` | Email is the user's primary email | `{ "message": "cannot delete primary email address" }` |
| `401` | Missing or invalid authentication | `{ "message": "authentication required" }` |
| `404` | Email ID does not exist or does not belong to authenticated user | `{ "message": "email not found" }` |
| `429` | Rate limited | `{ "message": "rate limit exceeded" }` |
| `500` | Unexpected server error | `{ "message": "internal server error" }` |

### SDK Shape

The `UserService` in `@codeplane/sdk` exposes:

- `deleteEmail(userId: number, emailId: number): Promise<Result<void, APIError>>`

The service method:
1. Validates that `emailId` is a positive integer (returns `400 "invalid email id"` if not).
2. Fetches the email record by ID via `getEmailByID`.
3. Verifies the email belongs to the requesting user (returns `404 "email not found"` if not).
4. Checks that the email is not the user's primary email (returns `400 "cannot delete primary email address"` if it is).
5. Executes `deleteEmail(sql, { id, userId })` to hard-delete the record.
6. Returns `Result.ok(undefined)` on success.

### CLI Command

Emails are deleted via the generic API command:

```bash
codeplane api /api/user/emails/42 --method DELETE
```

**Success output:** Exit code `0`. No output to stdout (mirrors the 204 empty body).

**Error output:** Exit code non-zero. Error JSON printed to stderr.

A future dedicated `codeplane email delete <id>` subcommand may be added, but the current product surface is the generic `api` command.

### Web UI Design

#### Settings — Emails Page

The delete action is part of the email list rendered on the **User Settings → Emails** page.

**Layout per email row:**

```
┌──────────────────────────────────────────────────────┐
│  work@example.com               ⚠ Unverified         │
│                          [Set primary]  [Remove]      │
└──────────────────────────────────────────────────────┘
```

**Interactions:**

- Each non-primary email row displays a **"Remove"** button (text button or icon, styled as a destructive/danger action — e.g., red text or red icon).
- The primary email row does **not** display a "Remove" button. Instead, a tooltip or disabled state conveys: "You cannot remove your primary email. Set a different email as primary first."
- Clicking **"Remove"** opens a confirmation dialog:
  ```
  ┌──────────────────────────────────────────┐
  │  Remove email address?                    │
  │                                           │
  │  Are you sure you want to remove          │
  │  work@example.com from your account?      │
  │  This action cannot be undone.            │
  │                                           │
  │           [Cancel]  [Remove]              │
  └──────────────────────────────────────────┘
  ```
- The confirmation dialog shows the email address being removed.
- The "Remove" button in the dialog is styled as a destructive action (red).
- Clicking **"Cancel"** closes the dialog with no side effects.
- Clicking **"Remove"** in the dialog sends the `DELETE` request. The button shows a spinner during the request.
- On success: the dialog closes, the email row is removed from the list with a smooth transition, and a toast notification confirms "Email removed successfully."
- On error (e.g., 404 if the email was already deleted in another session): the dialog shows an inline error message. The email list refreshes.
- On error (400 — primary email race condition): the dialog shows "This email is now your primary email and cannot be removed." The dialog closes and the list refreshes to reflect the updated state.

### TUI UI

In the email settings screen:

```
Email Addresses

  user@example.com          PRIMARY ✓ Verified
> work@example.com          ⚠ Unverified

  [a] Add email   [d] Delete selected   [q] Back
```

- The user navigates to a non-primary email using arrow keys.
- Pressing `d` on a non-primary email triggers a confirmation prompt: `Remove work@example.com? [y/N]`
- Pressing `y` confirms deletion. On success, the email row is removed and a confirmation message appears.
- Pressing `N` or `Esc` cancels.
- Pressing `d` on the primary email displays: "Cannot remove primary email. Set a different email as primary first."

### Documentation

End-user documentation should cover:

- **User Guide: "Managing Your Email Addresses"** section on removing emails: How to remove an email from the web settings page (with screenshots of the confirmation dialog). How to remove an email from the CLI using `codeplane api /api/user/emails/<id> --method DELETE`. Explanation that the primary email cannot be removed and the steps to change the primary email first. Note that deletion is permanent and the email address becomes available for other users.
- **API Reference: User Email Endpoints**: Documentation for `DELETE /api/user/emails/:id` including path parameters, authentication requirements, response codes, and error conditions.
- **FAQ Entry**: "Why can't I remove my primary email?" — explains the primary email protection rule and how to change primary first.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Authenticated user (self)** | ✅ Can delete their own non-primary emails |
| **Other authenticated user** | ❌ Cannot delete another user's emails (returns 404) |
| **Organization admin** | ❌ Cannot delete a member's emails through this endpoint |
| **Anonymous / unauthenticated** | ❌ 401 Unauthorized |

The endpoint is strictly self-scoped. The user ID is derived from the authenticated session, not from a URL parameter. The email ID in the path is validated against the authenticated user's email records, eliminating IDOR risk by design.

### Rate Limiting

- **Authenticated users:** Subject to the standard authenticated rate limit (5,000 requests/hour).
- **Unauthenticated callers:** Subject to the standard unauthenticated rate limit (60 requests/hour) — they will hit 401 before any deletion occurs, but the rate limit still applies to prevent auth-probing floods.
- **Delete-specific rate limit:** 10 delete requests per 10 minutes per authenticated user. This prevents accidental or scripted mass deletion.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in every response.
- Exceeding the rate limit returns `429 Too Many Requests`.

### Data Privacy & PII

- Email addresses are PII. The 404 response for non-existent or other-user emails must not distinguish between "email does not exist" and "email belongs to another user" — both return the same `"email not found"` message.
- Server logs must **not** log the deleted email address value at INFO level or below. Logs should reference `email_id` and `user_id` only.
- The deletion event (for audit purposes) should record `user_id` and `email_id` but must not store the email string in the audit log.
- After deletion, the email address must not be recoverable from the API. The deletion is a hard delete, not a soft delete.

### Input Sanitization

- The `:id` path parameter is parsed as an integer. No further sanitization is needed since it is a numeric value.
- Any request body is ignored — no body parsing is required for DELETE requests.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `EmailDeleted` | User successfully deletes an email address | `user_id`, `email_id`, `was_verified` (boolean — whether the deleted email was activated), `emails_remaining` (int — count after deletion), `client` (web/cli/tui/api), `timestamp` |
| `EmailDeleteFailed` | Email delete attempt fails (any reason) | `user_id`, `failure_reason` (invalid_id/not_found/is_primary/rate_limited), `client` (web/cli/tui/api), `timestamp` |
| `EmailDeletePrimaryBlocked` | User specifically attempted to delete their primary email | `user_id`, `email_id`, `client`, `timestamp` |

### Funnel Metrics

1. **Email Deletion Rate**: Number of `EmailDeleted` events per week. Provides insight into email churn and account hygiene behavior.
2. **Primary Block Rate**: `EmailDeletePrimaryBlocked / (EmailDeleted + EmailDeleteFailed)`. A high rate suggests users are confused about the primary email constraint — the UX may need clearer guidance.
3. **Delete-after-Add Velocity**: Time between `EmailAdded` and `EmailDeleted` for the same email ID. Very short durations (< 5 minutes) may indicate users are testing the system or making mistakes during add.
4. **Email Capacity Utilization Post-Delete**: When users delete an email, do they subsequently add a new one? Track `EmailAdded` events within 1 hour of an `EmailDeleted` event for the same user. This indicates whether deletion is used to "make room" for a replacement.
5. **Unverified Deletion Ratio**: Percentage of deleted emails that were unverified. A high ratio suggests users are cleaning up emails they never completed verification for — the verification flow may need improvement.

### Success Indicators

- The endpoint has a p99 latency under 100ms.
- Zero occurrences of cross-user email deletion (verified via test and audit).
- The primary email protection consistently prevents accidental removal of the notification address (measured by `EmailDeletePrimaryBlocked` never leading to data loss).
- Delete confirmation dialog conversion rate (users who click Remove → users who confirm) is between 70–95%. Below 70% suggests the dialog is too aggressive; above 95% suggests users are clicking through without reading.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Email delete requested | `INFO` | `user_id`, `email_id`, `request_id` | Do **not** log the email address string. |
| Email delete succeeded | `INFO` | `user_id`, `email_id`, `request_id` | Confirms deletion for audit trail. |
| Email delete failed: invalid ID | `WARN` | `user_id`, `raw_id` (the unparsed path parameter), `request_id` | May indicate a bug in a client. |
| Email delete failed: not found | `WARN` | `user_id`, `email_id`, `request_id` | Could be a stale reference or enumeration attempt. |
| Email delete failed: primary email | `INFO` | `user_id`, `email_id`, `request_id` | Expected user behavior, not an error. |
| Email delete failed: DB error | `ERROR` | `user_id`, `email_id`, `error_message`, `error_stack`, `request_id` | Requires investigation. |
| Email delete auth failure | `WARN` | `request_id`, `source_ip` | Potential unauthorized access attempt. |
| Email delete rate limited | `WARN` | `user_id`, `request_id`, `retry_after_seconds` | User or script exceeding rate limit. |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_email_delete_total` | Counter | `status` (success/invalid_id/not_found/is_primary/internal_error), `client` (web/cli/tui/api) | Total email delete attempts by result. |
| `codeplane_email_delete_duration_seconds` | Histogram | `status` | Request duration for the delete email endpoint. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_email_delete_primary_blocked_total` | Counter | `client` | Number of attempts to delete a primary email (blocked by business rule). |
| `codeplane_email_delete_rate_limited_total` | Counter | — | Number of email delete requests rejected by rate limiter. |

### Alerts

#### Alert: `EmailDeleteHighErrorRate`

**Condition:** `rate(codeplane_email_delete_total{status="internal_error"}[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check server error logs filtered by `email_delete` context and `request_id` for stack traces.
2. Verify database connectivity — the delete operation is a simple `DELETE FROM email_addresses WHERE id = $1 AND user_id = $2`; failures indicate a database-level issue.
3. Check if the `email_addresses` table is accessible and not locked by a running migration or long transaction.
4. Verify the index on `email_addresses(id, user_id)` exists and is not corrupted.
5. If errors are transient (e.g., connection pool exhaustion), monitor for 5 more minutes. If persistent, restart the server process and check connection pool settings.
6. Escalate to the database team if the issue is upstream of the application.

#### Alert: `EmailDeleteHighLatency`

**Condition:** `histogram_quantile(0.99, rate(codeplane_email_delete_duration_seconds_bucket[5m])) > 0.5`

**Severity:** Warning

**Runbook:**
1. Check database query latency for the `deleteEmail` and `getEmailByID` queries. Run `EXPLAIN ANALYZE` against both.
2. Look for lock contention on the `email_addresses` table — deletes should not lock, but concurrent schema operations could.
3. Check if the `getEmailByID` lookup (which precedes the delete) is slow due to missing index on `email_addresses(id)`.
4. Review overall database load, connection pool saturation, and replication lag.
5. If isolated to specific requests, check if those requests involve unusual email IDs (e.g., very large integer values).

#### Alert: `EmailDeleteNotFoundSpike`

**Condition:** `rate(codeplane_email_delete_total{status="not_found"}[5m]) > 20`

**Severity:** Info

**Runbook:**
1. A high 404 rate may indicate an enumeration attack — someone is probing email IDs to discover valid records.
2. Check the source IP distribution in logs for `email_delete` not-found entries.
3. If concentrated from a small number of IPs or user IDs, consider temporary rate limiting or account investigation.
4. Verify that legitimate clients (web UI, CLI) are not sending stale email IDs due to caching issues.
5. No immediate action required unless the rate exceeds 200/5m, in which case escalate to security.

#### Alert: `EmailDeleteAuthFailureSpike`

**Condition:** `rate(codeplane_email_delete_total{status="401"}[5m]) > 50`

**Severity:** Info

**Runbook:**
1. This may indicate a credential-stuffing or unauthorized delete attempt.
2. Check the source IP distribution in logs for auth failure entries on the delete endpoint.
3. If concentrated from a small number of IPs, consider temporary IP-level blocking.
4. Verify that legitimate clients are not sending expired tokens due to session management bugs.
5. Escalate to security if the rate exceeds 500/5m.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | User Impact | Recovery |
|-------|-------------|-------|-------------|----------|
| Invalid email ID format | 400 | Non-numeric or non-positive `:id` parameter | User sees validation error | Fix the ID parameter |
| Primary email deletion blocked | 400 | User attempted to delete their primary email | User sees explanation message | Set a different email as primary first, then delete |
| Unauthenticated | 401 | Missing/expired/invalid token or session | User sees login prompt or CLI error | Re-authenticate |
| Email not found | 404 | Email ID does not exist or belongs to another user | User sees "email not found" error | Verify the email ID; refresh email list |
| Rate limited | 429 | Too many delete requests in window | User sees rate limit error with retry-after | Wait and retry after the reset window |
| Database unavailable | 500 | DB connection failure during lookup or delete | User sees generic error message | Automatic retry on next request; server health check should catch this |
| Query timeout | 500 | Slow query or DB overload during delete | User sees generic error message | Retry; investigate if persistent |
| Concurrent delete race | 204 + 404 | Two simultaneous delete requests for the same email | First succeeds, second sees "not found" | No action needed; this is expected behavior |

## Verification

### API Integration Tests

| # | Test | Expected Result |
|---|------|------------------|
| 1 | `DELETE /api/user/emails/:id` with valid PAT and valid non-primary email ID | `204 No Content`; empty response body |
| 2 | `DELETE /api/user/emails/:id` then `GET /api/user/emails` — deleted email is absent | List does not contain the deleted email ID |
| 3 | `DELETE /api/user/emails/:id` for the user's primary email | `400` with `"cannot delete primary email address"` |
| 4 | `DELETE /api/user/emails/:id` with no auth header | `401` with `"authentication required"` |
| 5 | `DELETE /api/user/emails/:id` with expired/revoked PAT | `401` |
| 6 | `DELETE /api/user/emails/:id` with invalid PAT format (e.g., `token garbage`) | `401` |
| 7 | `DELETE /api/user/emails/:id` with session cookie auth (not PAT) | `204` (cookie-based access works) |
| 8 | `DELETE /api/user/emails/:id` where `:id` belongs to a different user | `404` with `"email not found"` |
| 9 | `DELETE /api/user/emails/:id` where `:id` does not exist in the database | `404` with `"email not found"` |
| 10 | `DELETE /api/user/emails/:id` with `:id` = `0` | `400` with `"invalid email id"` |
| 11 | `DELETE /api/user/emails/:id` with `:id` = `-1` | `400` with `"invalid email id"` |
| 12 | `DELETE /api/user/emails/:id` with `:id` = `abc` | `400` with `"invalid email id"` |
| 13 | `DELETE /api/user/emails/:id` with `:id` = empty string (trailing slash) | `400` or `404` (route does not match) |
| 14 | `DELETE /api/user/emails/:id` with `:id` = `3.14` | Parses as `3`; result depends on whether email ID 3 exists for this user |
| 15 | `DELETE /api/user/emails/:id` with `:id` = `9999999999999999` (very large integer) | `404` (no matching record) |
| 16 | Double delete: `DELETE /api/user/emails/:id` twice for the same ID | First returns `204`, second returns `404` |
| 17 | Delete an unverified email (`is_activated: false`) | `204` — verification status does not block deletion |
| 18 | Delete a verified email (`is_activated: true`) that is not primary | `204` — verified non-primary emails are deletable |
| 19 | Full lifecycle: `POST /api/user/emails` to add → `GET /api/user/emails` to verify presence → `DELETE /api/user/emails/:id` → `GET /api/user/emails` to verify absence | Each step succeeds; the email appears then disappears |
| 20 | Delete and re-add: `DELETE /api/user/emails/:id` → `POST /api/user/emails` with the same email address | Re-add succeeds with `201`; new record has different `id` and `created_at` |
| 21 | Delete email, reducing count below 10, then add new email to reach 10 again | Add succeeds with `201` |
| 22 | Verify response has no body on success: response `Content-Length` is `0` or body is empty | Assert empty body on `204` |
| 23 | Verify response content-type is not set on 204 (no body to type) | No `Content-Type` header or it is absent |
| 24 | Delete the only non-primary email (leaving user with exactly 1 email — the primary) | `204`; `GET /api/user/emails` returns array of length 1 |
| 25 | Add email as primary (demoting old primary), then delete the old (now non-primary) email | `204`; old email is removed, new primary remains |
| 26 | `DELETE /api/user/emails/:id` with a request body present (ignored) | `204` — body is ignored, delete proceeds normally |
| 27 | Verify that the 404 response for "email belongs to another user" is identical to "email does not exist" (same status code, same message body) | Both return `404` with `{ "message": "email not found" }` |

### CLI E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 28 | `codeplane api /api/user/emails/42 --method DELETE` with valid auth and valid email ID | Exit code `0`; no stdout output |
| 29 | `codeplane api /api/user/emails/42 --method DELETE` with invalid/missing auth | Exit code non-zero; error output |
| 30 | `codeplane api /api/user/emails/99999 --method DELETE` (non-existent ID) | Exit code non-zero; error JSON on stderr |
| 31 | Round-trip via CLI: add email via POST, list via GET (verify present), delete via DELETE, list via GET (verify absent) | Full lifecycle passes; exit code `0` at each step |
| 32 | `codeplane api /api/user/emails/abc --method DELETE` (invalid ID) | Exit code non-zero; error output with "invalid email id" |

### Playwright (Web UI) E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 33 | Navigate to Settings → Emails with multiple emails, verify "Remove" button is visible on non-primary emails | "Remove" button element is present for each non-primary email row |
| 34 | Verify "Remove" button is NOT present (or is disabled/hidden) on the primary email row | Primary email row has no actionable remove button |
| 35 | Click "Remove" on a non-primary email → confirmation dialog appears with the correct email address displayed | Dialog is visible; contains the email address text |
| 36 | Click "Cancel" in the confirmation dialog → dialog closes, email is still in the list | Dialog dismissed; email row still rendered |
| 37 | Click "Remove" in the confirmation dialog → email is removed from the list | Email row disappears; toast "Email removed successfully" is visible |
| 38 | After successful deletion, verify the email list count decreased by 1 | Count of email rows is one less than before |
| 39 | Delete email, then refresh the page → deleted email is still absent | After page reload, the email is not in the list |
| 40 | Attempt to remove primary email (if a remove action is reachable via DOM manipulation) → error is shown | Error message indicates primary cannot be deleted |
| 41 | With 10 emails, delete one → "Add new email" form reappears (was hidden at limit) | Add form section becomes visible after deletion |
| 42 | Simulate API returning 500 on delete (via network intercept) → error is displayed in the dialog | Inline error message in the dialog; email is NOT removed from the list |
| 43 | Navigate to Settings → Emails while unauthenticated | Redirected to login page |
| 44 | Verify the confirmation dialog "Remove" button shows a loading spinner during the API call (network throttle) | Spinner/loading indicator is visible while request is in-flight |

### TUI Integration Tests

| # | Test | Expected Result |
|---|------|------------------|
| 45 | Navigate to email settings → select non-primary email → press `d` → confirmation prompt appears | Prompt "Remove <email>? [y/N]" is displayed |
| 46 | At confirmation prompt, press `y` → email is removed from the list | Email disappears; confirmation message displayed |
| 47 | At confirmation prompt, press `N` → email is NOT removed | Email remains in the list |
| 48 | At confirmation prompt, press `Esc` → cancels deletion | Email remains in the list |
| 49 | Select primary email → press `d` → error message displayed | "Cannot remove primary email. Set a different email as primary first." |

### Boundary and Stress Tests

| # | Test | Expected Result |
|---|------|------------------|
| 50 | User with 10 emails — delete all 9 non-primary emails one by one | Each deletion returns `204`; final list has 1 email (the primary) |
| 51 | User with an email address at maximum valid length (254 characters) — delete it | `204`; the 254-char email is removed successfully |
| 52 | Concurrent delete: 5 parallel `DELETE /api/user/emails/:id` for the same email ID | Exactly one returns `204`; the rest return `404`. No `500` errors. |
| 53 | Concurrent delete: 5 parallel `DELETE /api/user/emails/:id` for 5 different non-primary email IDs | All 5 return `204`; all 5 emails are removed |
| 54 | `DELETE /api/user/emails/:id` response time is under 200ms for a user with 5 emails | Assert response latency < 200ms |
| 55 | Delete email with `:id` = `2147483647` (max 32-bit signed int) — no matching record | `404` (not a server crash or overflow error) |
| 56 | Delete email with `:id` = `2147483648` (exceeds 32-bit signed int) — no matching record | `404` or `400` (graceful handling, no crash) |

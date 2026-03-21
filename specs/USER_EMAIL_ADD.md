# USER_EMAIL_ADD

Specification for USER_EMAIL_ADD.

## High-Level User POV

When a Codeplane user wants to associate additional email addresses with their account, they navigate to their account settings and use the "Add Email" capability. This allows them to register secondary email addresses beyond the one they signed up with. A user might add a work email alongside a personal email, or associate a team-specific alias so that notifications, commit attribution, and account recovery options span multiple addresses.

After adding an email, it appears in the user's email list in an unverified state. The user can see at a glance which of their emails is the primary address, which are verified, and which are still pending verification. They can also remove any non-primary email address they no longer need.

Adding emails is a foundational identity action. It underpins notification routing, commit identity association, and account security. The experience should be lightweight — a single field and a button — and should give immediate, clear feedback about whether the email was accepted, rejected due to formatting issues, or rejected because it's already in use by another account.

This feature is accessible from the Web UI email settings page, through the CLI via the generic API command interface, and through any other client that consumes the Codeplane HTTP API. Regardless of how the user adds the email, the behavior, validation, and response contract are identical.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can add a new email address to their account, see it reflected in their email list, and receive clear error feedback for all invalid or conflicting inputs — consistently across every client surface.

### Functional Criteria

- [ ] An authenticated user can add a new email address by providing a valid email string.
- [ ] The newly added email is created in an **unverified** (`is_activated: false`) state.
- [ ] The newly added email defaults to **non-primary** (`is_primary: false`) unless explicitly specified.
- [ ] If `is_primary: true` is specified, the previously primary email is demoted to non-primary atomically.
- [ ] The added email immediately appears in the user's email list on subsequent list calls.
- [ ] The response includes the email's `id`, `email`, `is_activated`, `is_primary`, and `created_at`.

### Validation & Edge Cases

- [ ] An empty email string (`""`) is rejected with a `422 Validation Failed` error (`missing_field`).
- [ ] A whitespace-only email string (e.g., `"   "`) is rejected after trimming, as if empty.
- [ ] An email missing the `@` character (e.g., `"notanemail"`) is rejected with a `422 Validation Failed` error (`invalid`).
- [ ] An email shorter than 3 characters (e.g., `"a@"` which is 2 chars) is rejected with a `422 Validation Failed` error (`invalid`).
- [ ] An email that is already associated with **any** user account (case-insensitively) is rejected with a `409 Conflict` error: `"email address is already in use"`.
- [ ] Case-insensitive duplicate detection works: adding `User@Example.COM` when `user@example.com` exists is rejected as a conflict.
- [ ] If the same user re-adds an email they already own (same `user_id` + `lower_email`), the record is upserted — updating `is_primary` and `is_activated` fields rather than creating a duplicate.
- [ ] Leading and trailing whitespace in the email input is trimmed before processing.

### Boundary Constraints

- [ ] Email address maximum length: 254 characters (per RFC 5321).
- [ ] Email address minimum length: 3 characters (e.g., `a@b`).
- [ ] The local part (before `@`) may contain alphanumerics, dots, hyphens, underscores, and plus signs.
- [ ] The domain part (after `@`) must contain at least one dot for realistic addresses, though the current validation only requires the presence of `@`.
- [ ] No limit is enforced on the total number of email addresses per user, but this should be monitored for abuse.
- [ ] The `is_primary` field in the request body is optional and defaults to `false` when omitted.

### Authentication & Authorization

- [ ] Unauthenticated requests are rejected with a `401 Unauthorized` error.
- [ ] Only the authenticated user can add emails to their own account; there is no admin override for adding emails to another user.

### Idempotency

- [ ] Adding the exact same email address (case-insensitively) that the user already owns results in an upsert, not a new row or an error.
- [ ] The upsert updates `is_primary` and `is_activated` per the new request values and returns the updated record.

## Design

### API Shape

**Endpoint:** `POST /api/user/emails`

**Authentication:** Required (session cookie or PAT `Authorization` header).

**Request Body:**
```json
{
  "email": "user@example.com",
  "is_primary": false
}
```

| Field        | Type    | Required | Default | Description                                      |
|--------------|---------|----------|---------|--------------------------------------------------|
| `email`      | string  | Yes      | —       | The email address to add. Trimmed server-side.   |
| `is_primary` | boolean | No       | `false` | Whether to set this as the primary email.        |

**Success Response:** `201 Created`
```json
{
  "id": 42,
  "email": "user@example.com",
  "is_activated": false,
  "is_primary": false,
  "created_at": "2026-03-21T12:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition                        | Body shape                                                                 |
|--------|----------------------------------|----------------------------------------------------------------------------|
| 401    | Not authenticated                | `{ "message": "authentication required" }`                                |
| 409    | Email already used by any user   | `{ "message": "email address is already in use" }`                         |
| 422    | Empty or missing email           | `{ "message": "Validation Failed", "errors": [{ "resource": "Email", "field": "email", "code": "missing_field" }] }` |
| 422    | Invalid email format             | `{ "message": "Validation Failed", "errors": [{ "resource": "Email", "field": "email", "code": "invalid" }] }` |
| 500    | Unexpected server error          | `{ "message": "failed to add email address" }`                            |

### SDK Shape

The `UserService.addEmail(userID, req)` method in `@codeplane/sdk` is the canonical service-layer entry point:

- **Input:** `userID: number`, `req: { email: string; is_primary?: boolean }`
- **Output:** `Result<EmailResponse, APIError>`
- **Behavior:** Trims input, validates format, calls `upsertEmailAddress` in the database layer, catches unique violations for cross-user conflicts, and returns a structured `EmailResponse`.

### CLI Command

There is no dedicated `codeplane email add` subcommand currently. Users add emails via the generic API command:

```bash
codeplane api /api/user/emails --method POST -f email=user@example.com
```

Optionally setting primary:

```bash
codeplane api /api/user/emails --method POST -f email=user@example.com -f is_primary=true
```

The CLI displays the returned email object on success, or the error message on failure, formatted according to the user's output preferences (JSON, table, etc.).

### Web UI Design

The email management page lives under User Settings → Emails.

**Add Email Form:**

- A single text input labeled "Email address" with placeholder text `you@example.com`.
- An optional checkbox or toggle labeled "Set as primary email" (default unchecked).
- A submit button labeled "Add email".
- On submission, the form sends `POST /api/user/emails`.
- On success (`201`), the new email appears in the email list below the form with an "Unverified" badge.
- On `409` conflict, an inline error appears below the input: "This email address is already in use."
- On `422` validation error, an inline error appears: "Please enter a valid email address."
- The input is cleared on successful submission.

**Email List:**

- Each email row shows: email address, primary badge (if applicable), verified/unverified status badge, and a delete action (disabled for the primary email).
- The newly added email should appear at the bottom of the list (ordered by `created_at ASC` within non-primary emails) after the primary email.

### Documentation

The following end-user documentation should be written:

- **User Guide: Managing Email Addresses** — How to add, view, and remove email addresses from your Codeplane account. Include screenshots of the settings page.
- **API Reference: POST /api/user/emails** — Request/response schema, authentication requirements, error codes, and example `curl` commands.
- **CLI Reference: Email Management** — How to add and list emails using `codeplane api` commands, with worked examples.
- **FAQ: "Why is my new email unverified?"** — Explain that newly added emails start unverified and describe the verification flow (once implemented).

## Permissions & Security

### Authorization

| Role          | Can Add Email? | Notes                                              |
|---------------|----------------|----------------------------------------------------|
| Authenticated | Yes            | Only to their own account.                         |
| Anonymous     | No             | Receives `401 Unauthorized`.                       |
| Admin         | No (to others) | No admin endpoint exists to add emails to other users. Admins can add emails to their own account. |

There is no organization-level or team-level permission relevant to this feature. Email management is strictly a personal account operation.

### Rate Limiting

- **Rate limit:** The global rate-limiting middleware applies. The `POST /api/user/emails` endpoint should be subject to a stricter per-user rate limit of **10 requests per minute** to prevent email enumeration and spam abuse.
- **Soft cap monitoring:** Although no hard limit on emails per user is enforced, any user exceeding **50 email addresses** should generate an alert for abuse review.

### Data Privacy & PII

- Email addresses are PII. They must not be logged in plaintext at `INFO` level or above. Structured logs should redact or hash email values.
- The `lower_email` field is stored for case-insensitive uniqueness but should not be exposed in API responses.
- Email addresses should not appear in error messages returned to other users (the conflict error says "already in use" without revealing who owns it).
- Account deletion must cascade-delete all associated email addresses.

## Telemetry & Product Analytics

### Business Events

| Event Name       | Trigger                              | Properties                                                                                                |
|------------------|--------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `EmailAdded`     | Successful `POST /api/user/emails`   | `user_id`, `email_id`, `is_primary`, `is_activated`, `email_domain` (extracted domain, e.g., `example.com`), `timestamp` |
| `EmailAddFailed` | Failed `POST /api/user/emails`       | `user_id`, `error_code` (`missing_field`, `invalid`, `conflict`, `unauthorized`), `timestamp`             |

### Funnel Metrics

- **Email add success rate:** `count(EmailAdded) / count(EmailAdded + EmailAddFailed)` — target > 85%.
- **Emails per user distribution:** Histogram of email count per user — expect median of 1, mean < 2.
- **Duplicate email attempt rate:** `count(EmailAddFailed where error_code=conflict) / count(total attempts)` — if > 20%, investigate whether the UI is guiding users poorly.
- **Primary email switch rate:** `count(EmailAdded where is_primary=true) / count(EmailAdded)` — useful for understanding how often users change their primary email through the add flow.

### Success Indicators

- Users who add a second email address have higher retention (hypothesis to validate).
- Low conflict error rate indicates good UX guidance.
- The add-to-verify funnel conversion rate (once verification is implemented) should exceed 70%.

## Observability

### Logging Requirements

| Log Point                    | Level  | Structured Context                                                                 |
|------------------------------|--------|------------------------------------------------------------------------------------|
| Email add request received   | DEBUG  | `user_id`, `has_is_primary` (boolean, not the value), request source               |
| Email validation failed      | WARN   | `user_id`, `validation_code` (`missing_field` or `invalid`), input length          |
| Email conflict detected      | WARN   | `user_id`, `email_domain` (not full email)                                         |
| Email successfully added     | INFO   | `user_id`, `email_id`, `is_primary`, `email_domain`                                |
| Email add internal error     | ERROR  | `user_id`, `error_message`, stack trace                                            |
| Upsert triggered (same user) | INFO   | `user_id`, `email_id`, `fields_updated`                                            |

**PII Rule:** Never log the full email address at INFO or above. Use `email_domain` or a hashed/truncated form at DEBUG.

### Prometheus Metrics

| Metric Name                              | Type      | Labels                              | Description                                           |
|------------------------------------------|-----------|-------------------------------------|-------------------------------------------------------|
| `codeplane_email_add_total`                  | Counter   | `status` (`success`, `error`), `error_code` | Total email add attempts                             |
| `codeplane_email_add_duration_seconds`       | Histogram | —                                   | Latency of the email add operation                   |
| `codeplane_email_validation_failures_total`  | Counter   | `code` (`missing_field`, `invalid`) | Count of validation failures                         |
| `codeplane_email_conflict_total`             | Counter   | —                                   | Count of duplicate/conflict rejections               |
| `codeplane_emails_per_user`                  | Gauge     | —                                   | Distribution of email count per user (sampled)       |

### Alerts

#### Alert: `EmailAddErrorRateHigh`

- **Condition:** `rate(codeplane_email_add_total{status="error"}[5m]) / rate(codeplane_email_add_total[5m]) > 0.5` sustained for 10 minutes.
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_email_validation_failures_total` — if spiking, a client may be sending malformed requests (bot, broken UI deploy).
  2. Check `codeplane_email_conflict_total` — if spiking, a user or bot may be enumerating email addresses.
  3. Check server logs at ERROR level for database connectivity or constraint issues.
  4. If database errors: check PG connection pool health, query latency, and disk space.
  5. If validation spike from single IP/user: consider temporary rate-limit escalation.

#### Alert: `EmailAddLatencyHigh`

- **Condition:** `histogram_quantile(0.99, codeplane_email_add_duration_seconds) > 2.0` sustained for 5 minutes.
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency — the `upsertEmailAddress` query involves a CTE with a subquery; check if `email_addresses` table needs vacuuming or if the unique index on `(user_id, lower_email)` is bloated.
  2. Check for lock contention — the upsert updates existing primary emails; high concurrency from a single user could cause row-level lock waits.
  3. Check overall Postgres health: connections, CPU, I/O wait.
  4. If isolated to a single user: inspect for abuse (bulk email adds).

#### Alert: `EmailConflictRateSpike`

- **Condition:** `rate(codeplane_email_conflict_total[5m]) > 10` sustained for 5 minutes.
- **Severity:** Warning
- **Runbook:**
  1. This may indicate email enumeration. Check if a single IP or user is generating the conflicts.
  2. Review rate-limiting effectiveness — escalate rate limit for the offending source.
  3. If legitimate: a UI bug may be re-submitting the same email. Check recent UI deployments.
  4. Consider adding CAPTCHA or proof-of-work to the email add flow if sustained.

#### Alert: `EmailsPerUserAnomaly`

- **Condition:** Any user with more than 50 email addresses.
- **Severity:** Info
- **Runbook:**
  1. Query the `email_addresses` table for the user.
  2. Determine if the emails are legitimate (e.g., plus-addressed variations) or abuse.
  3. If abuse: disable the account and purge the excess emails.
  4. Consider implementing a per-user email cap (e.g., 20).

### Error Cases and Failure Modes

| Failure Mode                        | User-Facing Behavior              | System Behavior                                                     |
|-------------------------------------|-----------------------------------|---------------------------------------------------------------------|
| Database unreachable                | `500 Internal Server Error`       | Log ERROR with connection details, increment error counter          |
| Unique constraint violation         | `409 Conflict`                    | Caught in service layer, no stack trace needed, log WARN            |
| Malformed JSON body                 | `400 Bad Request`                 | Caught by `decodeJSONBody`, returned before service layer           |
| Missing `Content-Type` header       | `400 Bad Request`                 | Caught by JSON content-type enforcement middleware                  |
| Auth session expired                | `401 Unauthorized`                | Caught by auth middleware before route handler                      |
| Primary email upsert race condition | Last write wins (atomic CTE)     | The upsert CTE handles primary demotion atomically within one query |
| Extremely long email (>10KB body)   | `422 Validation Failed`          | Trimmed first, then validated; request body size limits also apply  |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| API-EMAIL-ADD-001 | `POST /api/user/emails` with valid email `test-{uuid}@example.com` | `201 Created` with response body containing `id` (number), `email` (matching input), `is_activated` (false), `is_primary` (false), `created_at` (ISO string) |
| API-EMAIL-ADD-002 | `POST /api/user/emails` with valid email and `is_primary: true` | `201 Created` with `is_primary: true`; subsequent `GET /api/user/emails` shows this as primary and the previously primary email demoted |
| API-EMAIL-ADD-003 | `POST /api/user/emails` with empty email `""` | `422` with error code `missing_field` |
| API-EMAIL-ADD-004 | `POST /api/user/emails` with whitespace-only email `"   "` | `422` with error code `missing_field` |
| API-EMAIL-ADD-005 | `POST /api/user/emails` with email missing `@` (`"notanemail"`) | `422` with error code `invalid` |
| API-EMAIL-ADD-006 | `POST /api/user/emails` with 2-character email (`"a@"`) | `422` with error code `invalid` (length < 3) |
| API-EMAIL-ADD-007 | `POST /api/user/emails` with 3-character email (`"a@b"`) | `201 Created` (minimum valid length) |
| API-EMAIL-ADD-008 | `POST /api/user/emails` with 254-character valid email | `201 Created` (maximum valid length per RFC 5321) |
| API-EMAIL-ADD-009 | `POST /api/user/emails` with 255-character email | `422` with error code `invalid` (exceeds maximum length) |
| API-EMAIL-ADD-010 | `POST /api/user/emails` with duplicate email (same user, same email) | `201` or `200` — upsert behavior, no error; returned record reflects current state |
| API-EMAIL-ADD-011 | `POST /api/user/emails` with email owned by a different user | `409 Conflict` with message "email address is already in use" |
| API-EMAIL-ADD-012 | `POST /api/user/emails` with case-variant of existing email (`USER@EXAMPLE.COM` when `user@example.com` exists for another user) | `409 Conflict` |
| API-EMAIL-ADD-013 | `POST /api/user/emails` with no auth token | `401 Unauthorized` |
| API-EMAIL-ADD-014 | `POST /api/user/emails` with expired/invalid auth token | `401 Unauthorized` |
| API-EMAIL-ADD-015 | `POST /api/user/emails` with email containing leading/trailing whitespace `"  user@example.com  "` | `201 Created` with `email` field trimmed to `"user@example.com"` |
| API-EMAIL-ADD-016 | `POST /api/user/emails` with missing request body | `400 Bad Request` or `422` (malformed JSON) |
| API-EMAIL-ADD-017 | `POST /api/user/emails` with email containing special characters in local part (`"user+tag@example.com"`) | `201 Created` |
| API-EMAIL-ADD-018 | `POST /api/user/emails` with email containing dots in local part (`"first.last@example.com"`) | `201 Created` |
| API-EMAIL-ADD-019 | `POST /api/user/emails` with `is_primary` omitted from body | `201 Created` with `is_primary: false` (default) |
| API-EMAIL-ADD-020 | Verify newly added email appears in `GET /api/user/emails` response | Email is present in the list with matching `id` and properties |
| API-EMAIL-ADD-021 | `POST /api/user/emails` with `Content-Type: text/plain` | `400 Bad Request` (JSON content-type enforcement middleware) |
| API-EMAIL-ADD-022 | `POST /api/user/emails` with email containing unicode characters in domain (`"user@exämple.com"`) | Behavior is defined (either accepted or rejected with `invalid`); test documents the contract |
| API-EMAIL-ADD-023 | Add email, then delete it, then re-add the same email | `201 Created` on re-add — the email can be recycled |

### CLI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| CLI-EMAIL-ADD-001 | `codeplane api /api/user/emails --method POST -f email=cli-test-{uuid}@example.com` | Exit code 0, stdout contains valid JSON with `id`, `email`, `is_activated: false` |
| CLI-EMAIL-ADD-002 | `codeplane api /api/user/emails --method POST -f email=notanemail` | Non-zero exit code, stderr/stdout contains error about invalid email |
| CLI-EMAIL-ADD-003 | `codeplane api /api/user/emails --method POST -f email=` | Non-zero exit code, error about missing/empty email |
| CLI-EMAIL-ADD-004 | `codeplane api /api/user/emails --method POST -f email=cli-test-{uuid}@example.com` without auth | Non-zero exit code, unauthorized error |
| CLI-EMAIL-ADD-005 | Add email via CLI, then `codeplane api /api/user/emails` to list, verify new email is present | Email appears in the list output |

### Web UI E2E Tests (Playwright)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| UI-EMAIL-ADD-001 | Navigate to Settings → Emails, enter valid email in input, click "Add email" | New email appears in email list with "Unverified" badge; input is cleared |
| UI-EMAIL-ADD-002 | Submit an empty email input | Inline validation error shown; no API request fired (or if fired, error displayed) |
| UI-EMAIL-ADD-003 | Submit an invalid email (no `@`) | Inline error: "Please enter a valid email address" |
| UI-EMAIL-ADD-004 | Submit a duplicate email (one already owned by the user) | Either silent upsert success or informational message; no crash |
| UI-EMAIL-ADD-005 | Submit an email owned by another user | Inline error: "This email address is already in use" |
| UI-EMAIL-ADD-006 | Add email with "Set as primary" checked | New email appears as primary; previous primary loses its badge |
| UI-EMAIL-ADD-007 | Verify the form is not accessible when logged out (redirect to login) | User is redirected to login page |
| UI-EMAIL-ADD-008 | Add email and verify the email list re-renders without a full page reload | The list updates reactively after successful submission |

### Concurrency & Stress Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| STRESS-EMAIL-001 | Send 20 concurrent `POST /api/user/emails` requests with different emails for the same user | All 20 succeed with `201`; all 20 emails appear in the list |
| STRESS-EMAIL-002 | Send 10 concurrent `POST /api/user/emails` requests with `is_primary: true` for the same user | Exactly one email ends up as primary; no data corruption |
| STRESS-EMAIL-003 | Send 5 concurrent requests adding the same email for different users | Exactly one succeeds with `201`; the rest get `409 Conflict` |

# USER_EMAIL_VERIFICATION_CONFIRM

Specification for USER_EMAIL_VERIFICATION_CONFIRM.

## High-Level User POV

After a user adds a new email address to their Codeplane account and requests a verification email, they receive a message in their inbox containing a one-time verification link. The email verification confirmation flow is what happens when the user clicks that link — it is the final step that proves the user owns the address and transitions it from "unverified" to "verified."

The user clicks the link in their email, which opens a page in their browser. If the token is valid and hasn't expired, the email is immediately marked as verified. The user sees a clear success message confirming which address was verified, and can navigate back to their email settings to see the updated status — the address now shows a green verified badge instead of the previous warning indicator.

If something goes wrong — the link has expired, was already used, or is malformed — the user sees a helpful error message explaining what happened and how to fix it. In most cases, the resolution is straightforward: go back to email settings and request a new verification email. The experience is designed to be forgiving. Expired links are a normal part of email workflows, and Codeplane handles them gracefully rather than showing cryptic errors.

This confirmation step is essential to the integrity of the account. Until an email is verified, it cannot be used for notifications, commit attribution, or account recovery. Verification confirmation is the gate that unlocks these capabilities, giving both the user and Codeplane confidence that the email address truly belongs to the account holder.

The verification can also be triggered programmatically via the API — for instance, from the CLI using `codeplane api /api/user/emails/verify-token --method POST -f token=<token>`. This supports automated testing workflows and advanced users who prefer to confirm tokens without opening a browser.

## Acceptance Criteria

### Definition of Done

The feature is complete when a user can click a verification link received via email and have their email address reliably transitioned to verified status; the web UI displays a clear success or failure landing page; the API endpoint correctly validates, consumes, and activates the token; expired, already-used, and malformed tokens produce distinct, user-friendly error messages; and the behavior is consistent across the web landing page, CLI, and API.

### Functional Criteria

- [ ] Submitting a valid, unexpired, unused verification token via `POST /api/user/emails/verify-token` marks the corresponding email address as verified (`is_activated = true`).
- [ ] The token is consumed atomically — `used_at` is set to `NOW()` in the same operation that validates the token.
- [ ] After successful verification, the email's `is_activated` status is `true` in subsequent `GET /api/user/emails` responses.
- [ ] On success, the API returns `200 OK` with a body containing the verified email details (`id`, `email`, `is_activated: true`, `is_primary`).
- [ ] The web landing page at `/verify-email?token=<raw_token>` automatically submits the token on page load and displays the result.
- [ ] On successful verification via the web landing page, the user sees a success message with the verified email address and a link to their email settings.
- [ ] On failure via the web landing page, the user sees a descriptive error message and a link to request a new verification email.
- [ ] No authentication is required to confirm a verification token — the token itself is the proof of ownership.
- [ ] Consuming a token does not require the user to be logged in, because the email may be opened on a different device or browser than the one where the user is authenticated.

### Validation & Edge Cases

- [ ] An empty token string (`""`) is rejected with a `400 Bad Request` error: `"token is required"`.
- [ ] A missing `token` field in the request body is rejected with a `400 Bad Request` error: `"token is required"`.
- [ ] A token that does not match any record in the database is rejected with a `404 Not Found` error: `"invalid or expired verification token"`.
- [ ] An expired token (where `expires_at < NOW()`) is rejected with a `410 Gone` error: `"verification token has expired"`.
- [ ] An already-used token (where `used_at IS NOT NULL`) is rejected with a `409 Conflict` error: `"verification token has already been used"`.
- [ ] A token consisting only of whitespace is rejected after trimming, as if empty.
- [ ] If the email address associated with the token has been deleted between sending and confirming, the token is consumed but no email is activated. The API returns `404 Not Found` with `"email address no longer exists"`.
- [ ] If the email address is already verified (`is_activated = true`) when the token is consumed, the API returns `200 OK` idempotently — the email remains verified.
- [ ] The token hash comparison uses constant-time comparison to prevent timing attacks.
- [ ] Submitting a syntactically valid but incorrect token (wrong hash) returns `404 Not Found` with the same generic message — no information leakage about which tokens exist.
- [ ] A malformed JSON body (not valid JSON) returns `400 Bad Request`.
- [ ] A request with `Content-Type` other than `application/json` is rejected by the middleware.

### Boundary Constraints

- [ ] The raw verification token is a hex- or base64url-encoded string of at least 32 bytes (64 hex characters or 43 base64url characters).
- [ ] Maximum token string length accepted: 256 characters. Tokens longer than this are rejected with `400 Bad Request`: `"token is required"`.
- [ ] The token field must be a string type in the JSON body. Numeric, boolean, array, or object values are rejected.
- [ ] The token hash is a 64-character hex-encoded SHA-256 digest.
- [ ] Token expiration window: 24 hours from creation (matches the SEND spec).

### Idempotency

- [ ] Submitting the same valid token twice: the first request succeeds with `200 OK` and activates the email; the second request returns `409 Conflict` with `"verification token has already been used"`.
- [ ] If the email is already verified (e.g., via a different token or admin action), confirming a valid token for that email still succeeds — the token is consumed and the email remains verified.

## Design

### Web UI Design

#### Verification Landing Page — `/verify-email`

This is a standalone page outside the authenticated app shell. It does not require a logged-in session. The page is reached when a user clicks the verification link in their email.

**URL format:** `/verify-email?token=<raw_token>`

**On page load:**

1. The page extracts the `token` query parameter from the URL.
2. If no `token` parameter is present or it is empty, the page immediately displays an error state.
3. If a token is present, the page automatically sends `POST /api/user/emails/verify-token` with `{ "token": "<raw_token>" }`.
4. While the request is in flight, a loading state is displayed.

**Success state layout:**

```
┌──────────────────────────────────────────────────────────────┐
│                        ✓ Email Verified                      │
│                                                              │
│  Your email address work@example.com has been verified       │
│  successfully.                                               │
│                                                              │
│  You can now receive notifications, have commits attributed  │
│  to this address, and use it for account recovery.           │
│                                                              │
│        [Go to email settings]    [Go to dashboard]           │
└──────────────────────────────────────────────────────────────┘
```

- The verified email address is displayed in the success message (from the API response body).
- Two navigation links: "Go to email settings" → `/settings/emails`; "Go to dashboard" → `/`.
- If the user is not logged in, both links lead to the login page, which redirects to the target after authentication.

**Expired token state layout:**

```
┌──────────────────────────────────────────────────────────────┐
│                     ⏰ Link Expired                          │
│                                                              │
│  This verification link has expired. Verification links are  │
│  valid for 24 hours.                                         │
│                                                              │
│  To verify your email, go to your email settings and         │
│  request a new verification email.                           │
│                                                              │
│                  [Go to email settings]                       │
└──────────────────────────────────────────────────────────────┘
```

**Already-used token state layout:**

```
┌──────────────────────────────────────────────────────────────┐
│                  ✓ Already Verified                          │
│                                                              │
│  This verification link has already been used. Your email    │
│  address is verified.                                        │
│                                                              │
│        [Go to email settings]    [Go to dashboard]           │
└──────────────────────────────────────────────────────────────┘
```

**Invalid/missing token state layout:**

```
┌──────────────────────────────────────────────────────────────┐
│                     ✗ Verification Failed                     │
│                                                              │
│  This verification link is invalid or has expired. Please    │
│  request a new verification email from your email settings.  │
│                                                              │
│                  [Go to email settings]                       │
└──────────────────────────────────────────────────────────────┘
```

**Loading state:**

```
┌──────────────────────────────────────────────────────────────┐
│                    Verifying your email...                    │
│                          [spinner]                            │
└──────────────────────────────────────────────────────────────┘
```

**Interactions:**
- The page is visually branded with Codeplane branding (logo, consistent styling with the login page).
- The page does not require authentication to render.
- The page does not auto-redirect — the user decides when to navigate away.
- The page should be rendered as a lightweight standalone page to minimize time-to-interactive.

#### Email Settings Page Updates

After successful verification, if the user navigates to `/settings/emails`, the verified email must display:
- A green ✓ **Verified** badge instead of ⚠ **Unverified**.
- The "Send verification email" / "Resend verification email" button is removed.

### API Shape

#### Confirm Email Verification Token

```
POST /api/user/emails/verify-token
Content-Type: application/json
```

**No authentication required.** The token is the credential.

**Request Body:**
```json
{
  "token": "<raw_verification_token>"
}
```

| Field   | Type   | Required | Description                                    |
|---------|--------|----------|------------------------------------------------|
| `token` | string | Yes      | The raw verification token from the email link. |

**Success Response:** `200 OK`
```json
{
  "id": 42,
  "email": "work@example.com",
  "is_activated": true,
  "is_primary": false,
  "created_at": "2026-03-20T10:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition                                 | Body Shape                                                                |
|--------|-------------------------------------------|--------------------------------------------------------------------------|
| 400    | Missing, empty, or whitespace-only token  | `{ "message": "token is required" }`                                     |
| 400    | Malformed JSON body                       | `{ "message": "invalid request body" }`                                  |
| 404    | Token hash not found in database          | `{ "message": "invalid or expired verification token" }`                 |
| 404    | Email address deleted after token creation | `{ "message": "email address no longer exists" }`                        |
| 409    | Token already used (`used_at` set)        | `{ "message": "verification token has already been used" }`              |
| 410    | Token exists but has expired              | `{ "message": "verification token has expired" }`                        |
| 429    | Rate limit exceeded                       | `{ "message": "rate limit exceeded" }` with `Retry-After` header         |

### SDK Shape

The `UserService` in `@codeplane/sdk` exposes:

- `confirmEmailVerification(token: string): Promise<Result<EmailResponse, APIError>>`

The service method:
1. Trims and validates that the token string is non-empty. Returns `badRequest("token is required")` if empty.
2. Rejects tokens longer than 256 characters.
3. Computes `SHA-256(token)` to produce the token hash.
4. Calls `getEmailVerificationTokenByHash(sql, { tokenHash })` to retrieve the token record.
5. If no record is found, returns `notFound("invalid or expired verification token")`.
6. If `usedAt` is not null, returns `conflict("verification token has already been used")`.
7. If `expiresAt < now`, returns `gone("verification token has expired")`.
8. Calls `consumeEmailVerificationToken(sql, { tokenHash })` to atomically set `used_at = NOW()`.
9. Verifies the consume affected exactly 1 row (race condition guard). If 0 rows affected, returns `conflict("verification token has already been used")`.
10. Looks up the email address record by email string from the token record.
11. If the email record is not found, returns `notFound("email address no longer exists")`.
12. Calls `activateEmail(sql, { id: emailRecord.id, userId: tokenRecord.userId })`.
13. Returns `Result.ok(emailResponse)` with the activated email details.

### CLI Command

```bash
codeplane api /api/user/emails/verify-token --method POST -f token=<raw_token>
```

**Success output (exit code 0):**
JSON object with verified email details printed to stdout.

**Error output (exit code 1):**
Structured error JSON printed to stderr.

### TUI UI

The TUI does not have a dedicated email verification confirmation screen. After verification (via browser or CLI), the TUI email settings screen reflects the updated state:
- Verified emails show `✓ Verified` badge.
- The `[v] Send verification` keybinding is hidden for verified emails.

### Documentation

- **User Guide: "Verifying Your Email Address"** — Step-by-step flow: receiving the email, clicking the link, understanding the confirmation page states (success, expired, already used, invalid). Include screenshots.
- **API Reference: `POST /api/user/emails/verify-token`** — Full request/response schema, all error codes, and `curl` example.
- **FAQ: "My verification link expired"** — 24-hour window explanation, how to resend from settings.
- **FAQ: "I clicked the link but it says 'already used'"** — Single-use tokens; email is likely verified.
- **FAQ: "Can I verify my email without clicking the link?"** — CLI method for advanced users.

## Permissions & Security

### Authorization

| Action | Required Role | Notes |
|--------|---------------|-------|
| Confirm email verification token | **None (unauthenticated)** | The token itself is the credential. The user may be clicking the link from a different device or browser. |
| View verification landing page | **None** | The page is publicly accessible but only functional with a valid token. |

No organization-level, team-level, or repository-level permissions are involved. Email verification confirmation is a token-authenticated, per-user operation.

**Important design rationale:** This endpoint is intentionally unauthenticated because:
1. Users often check email on a mobile device while Codeplane is open on a desktop.
2. Users may not have an active session when they click the link hours later.
3. The verification token provides sufficient proof of ownership — the user received it at the target email address.

### Rate Limiting

- `POST /api/user/emails/verify-token`: **20 requests per IP per 15 minutes** to prevent brute-force token guessing.
- Failed attempts (404 — invalid token) count toward the rate limit.
- Successful attempts (200) also count toward the rate limit but are not expected to be frequent.
- 429 responses include a `Retry-After` header with seconds until the window resets.
- The global unauthenticated rate limit (60 requests/hour) also applies as an outer boundary.
- The 256-bit token entropy makes brute-force infeasible even without rate limiting, but rate limiting provides defense-in-depth.

### Data Privacy & PII

- The raw verification token must not be logged at any level. Only the first 8 characters (for correlation) or the token hash may appear in logs.
- The confirmed email address must not be logged at INFO level or above. Use `email_id` or `email_domain` in structured log fields.
- The API response body includes the email address — this is acceptable because the caller proved ownership by possessing the token.
- The verification landing page must not cache or store the token in browser local storage, session storage, or cookies after submission.
- The verification landing page URL (containing the token) should include `rel="noreferrer"` on any outbound links to prevent token leakage via the Referer header.
- The response must include `Cache-Control: no-store` to prevent proxy caching.

### Input Sanitization

- The token is trimmed of leading/trailing whitespace before processing.
- The token is hashed with SHA-256 before any database lookup — the raw token never touches the database layer.
- The token string is validated for maximum length (256 characters) to prevent oversized input attacks.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `EmailVerified` | Successful `POST /api/user/emails/verify-token` that activates an email | `user_id` (from token record), `email_id`, `email_domain`, `time_to_verify_seconds` (time between token creation and consumption), `client` (web/cli/api), `timestamp` |
| `EmailVerificationFailed` | Failed `POST /api/user/emails/verify-token` | `failure_reason` (token_missing/token_not_found/token_expired/token_already_used/email_deleted/rate_limited), `client`, `timestamp` |
| `EmailVerificationPageVisited` | User loads the `/verify-email` landing page | `has_token` (boolean), `referrer_domain`, `client` (always "web"), `timestamp` |

### Funnel Metrics

1. **Verification Completion Rate**: `count(EmailVerified) / count(EmailVerificationSent)` — target: ≥80%. Core success metric for the SEND + CONFIRM flow.
2. **Time-to-Verify Distribution**: Histogram of `time_to_verify_seconds`. Target: median < 10 minutes.
3. **Expired Token Rate**: `count(EmailVerificationFailed{failure_reason="token_expired"}) / count(total confirm attempts)`. Target: <15%.
4. **Already-Used Token Rate**: `count(EmailVerificationFailed{failure_reason="token_already_used"}) / count(total confirm attempts)`. Target: <5%.
5. **Invalid Token Rate**: `count(EmailVerificationFailed{failure_reason="token_not_found"}) / count(total confirm attempts)`. Target: <2%.
6. **Landing Page to Settings Navigation Rate**: After successful verification, how many users click "Go to email settings" vs. "Go to dashboard" vs. closing the tab.

### Success Indicators

- Verification completion rate exceeds 80% within 48 hours of token send.
- Median time-to-verify is under 10 minutes.
- Expired token rate stays below 15%.
- Invalid token (404) rate stays below 2% (anything higher suggests bot activity).
- Zero incidents of cross-user email activation (a token activating an email on the wrong account).

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Verification confirm request received | `info` | `request_id`, `source_ip`, `has_token` (boolean), `token_prefix` (first 8 chars) | Never log the full token |
| Token hash computed and lookup started | `debug` | `request_id`, `token_hash_prefix` (first 16 chars of hash) | Debugging correlation |
| Token found in database | `debug` | `request_id`, `token_id` (DB row ID), `user_id`, `email_id`, `expires_at`, `is_expired`, `is_used` | Never log email or full hash |
| Token not found in database | `warn` | `request_id`, `source_ip` | Potential brute-force or stale link |
| Token expired | `info` | `request_id`, `token_id`, `expired_at`, `expired_duration_seconds` | How long ago it expired |
| Token already used | `info` | `request_id`, `token_id`, `used_at` | Double-click or bookmark |
| Token consumed successfully | `info` | `request_id`, `token_id`, `user_id`, `email_id` | Core success event |
| Email activated | `info` | `request_id`, `user_id`, `email_id`, `email_domain`, `time_to_verify_seconds` | The email is now verified |
| Email not found after token consumption | `warn` | `request_id`, `token_id`, `user_id`, `email_address_from_token` (masked) | Email was deleted between send and confirm |
| Rate limit hit on verify-token | `warn` | `request_id`, `source_ip`, `retry_after_seconds` | Potential abuse |
| Database error during token lookup | `error` | `request_id`, `error_message`, `error_stack` | DB connectivity issue |
| Database error during token consumption | `error` | `request_id`, `token_id`, `error_message`, `error_stack` | Critical — token may be in inconsistent state |
| Database error during email activation | `error` | `request_id`, `token_id`, `email_id`, `error_message`, `error_stack` | Critical — token consumed but email not activated |

**PII Rule:** Never log the raw token, the full token hash, or the full email address at any level. Use `token_prefix`, `token_hash_prefix`, `email_id`, and `email_domain` only.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_email_verification_confirm_total` | Counter | `status` (success/token_missing/token_not_found/token_expired/token_already_used/email_deleted/rate_limited/internal_error), `client` (web/cli/api) | Total confirmation attempts |
| `codeplane_email_verification_confirm_duration_seconds` | Histogram | `status` | End-to-end latency (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2) |
| `codeplane_email_verification_time_to_verify_seconds` | Histogram | — | Time between token creation and successful verification (buckets: 60, 300, 600, 1800, 3600, 7200, 14400, 43200, 86400) |
| `codeplane_email_verification_expired_token_total` | Counter | — | Count of expired token submissions |
| `codeplane_email_verification_invalid_token_total` | Counter | — | Count of submissions with no matching token hash |
| `codeplane_email_verified_total` | Counter | — | Total emails successfully verified |
| `codeplane_email_verification_confirm_rate_limited_total` | Counter | — | Rate-limited confirmation attempts |

### Alerts and Runbooks

#### Alert: `EmailVerificationConfirmHighErrorRate`

**Condition:** `rate(codeplane_email_verification_confirm_total{status="internal_error"}[5m]) > 0.05` for 5 minutes.
**Severity:** Critical.
**Runbook:**
1. Check server error logs filtered by `email_verification_confirm` context for stack traces.
2. Verify database connectivity — the `getEmailVerificationTokenByHash`, `consumeEmailVerificationToken`, and `activateEmail` queries all need a healthy DB connection.
3. Look for partial failures: tokens consumed but emails not activated (logged at ERROR). If found, run manual remediation: `UPDATE email_addresses SET is_activated = true WHERE id IN (<affected_ids>)`.
4. Check if a migration has altered the `email_verification_tokens` or `email_addresses` table schemas.
5. If transient (connection pool exhaustion), monitor for recovery. If persistent, restart server and investigate pool settings.
6. Escalate to database on-call if query execution plans have degraded.

#### Alert: `EmailVerificationInvalidTokenSpike`

**Condition:** `rate(codeplane_email_verification_invalid_token_total[5m]) > 20` for 10 minutes.
**Severity:** Warning.
**Runbook:**
1. May indicate brute-force token guessing, bot scanners, or email security gateways pre-fetching links.
2. Check source IP distribution in logs for `token_not_found` events.
3. If concentrated from few IPs: add to temporary block list or escalate rate limit.
4. If IPs are known email security scanners (Barracuda, Proofpoint), consider adding click-through confirmation on landing page.
5. Check for URL encoding issues from corporate email gateway link-rewriting.

#### Alert: `EmailVerificationExpiredTokenRateHigh`

**Condition:** `rate(codeplane_email_verification_expired_token_total[1h]) / rate(codeplane_email_verification_confirm_total[1h]) > 0.25` for 1 hour.
**Severity:** Warning.
**Runbook:**
1. High expired rate means users wait too long between receiving and clicking the verification email.
2. Check `codeplane_email_verification_time_to_verify_seconds` histogram — if median is close to 24h, consider extending expiry.
3. Check email delivery latency with provider dashboard.
4. If concentrated on specific email domains, those may be slow or spam-filtering.
5. Consider extending token expiry from 24h to 48h if chronic.

#### Alert: `EmailVerificationConfirmLatencyHigh`

**Condition:** `histogram_quantile(0.99, codeplane_email_verification_confirm_duration_seconds) > 2.0` for 5 minutes.
**Severity:** Warning.
**Runbook:**
1. Check database query latency for `getEmailVerificationTokenByHash`, `consumeEmailVerificationToken`, and `activateEmail`.
2. Verify index on `email_verification_tokens(token_hash)` exists and is healthy.
3. Check table bloat or vacuum backlog on both tables.
4. Check overall Postgres health: connections, CPU, I/O wait.
5. If transient and correlates with cleanup job burst, consider staggering intervals.

#### Alert: `EmailVerificationConfirmRateLimitSpike`

**Condition:** `rate(codeplane_email_verification_confirm_rate_limited_total[15m]) > 50` for 15 minutes.
**Severity:** Warning.
**Runbook:**
1. Check if rate-limited requests come from small number of IPs — likely brute-force.
2. Review whether email security gateways are triggering rapid link pre-fetches.
3. If single IP responsible, add to temporary block list.
4. If widespread, evaluate rate limit thresholds.
5. Check landing page for bugs causing rapid repeated submissions.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User Impact | System Behavior |
|-------------|-------------|-------------|------------------|
| Empty/missing token | 400 | Landing page shows "Verification Failed" | No DB query; log WARN |
| Token not found | 404 | Landing page shows "Verification Failed" | Hash computed and looked up; log WARN |
| Token expired | 410 | Landing page shows "Link Expired" | Token found but expired; log INFO |
| Token already used | 409 | Landing page shows "Already Verified" | Token found but used; log INFO |
| Email deleted after send | 404 | Landing page shows "Verification Failed" | Token consumed but email gone; log WARN |
| DB unreachable during lookup | 500 | "Something went wrong" | Log ERROR; increment error counter |
| DB unreachable during consume | 500 | "Something went wrong" | Log ERROR; token may be inconsistent |
| DB unreachable during activate | 500 | Token consumed but email not activated | Log ERROR; **requires manual remediation** |
| Malformed JSON body | 400 | CLI/API user sees parse error | Caught by `decodeJSONBody` |
| Race: concurrent same-token submissions | First wins (200), rest get 409 | One success, others see "already used" | Atomic `consumeEmailVerificationToken` guard |
| Rate limit exceeded | 429 | "Too many attempts" | Log WARN; `Retry-After` header |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| API-VERIFY-CONFIRM-001 | `POST /api/user/emails/verify-token` with a valid, unexpired, unused token | `200 OK` with body containing `id` (number), `email` (string), `is_activated: true`, `is_primary` (boolean), `created_at` (ISO string) |
| API-VERIFY-CONFIRM-002 | After successful confirmation, `GET /api/user/emails` (authed) shows the email with `is_activated: true` | The verified email appears in the list with `is_activated: true` |
| API-VERIFY-CONFIRM-003 | `POST /api/user/emails/verify-token` with empty token `""` | `400 Bad Request` with `"token is required"` |
| API-VERIFY-CONFIRM-004 | `POST /api/user/emails/verify-token` with missing `token` field in body `{}` | `400 Bad Request` with `"token is required"` |
| API-VERIFY-CONFIRM-005 | `POST /api/user/emails/verify-token` with whitespace-only token `"   "` | `400 Bad Request` with `"token is required"` |
| API-VERIFY-CONFIRM-006 | `POST /api/user/emails/verify-token` with a token that does not match any DB record | `404 Not Found` with `"invalid or expired verification token"` |
| API-VERIFY-CONFIRM-007 | `POST /api/user/emails/verify-token` with an expired token (created >24h ago) | `410 Gone` with `"verification token has expired"` |
| API-VERIFY-CONFIRM-008 | `POST /api/user/emails/verify-token` with a token that has already been used | `409 Conflict` with `"verification token has already been used"` |
| API-VERIFY-CONFIRM-009 | Submit the same valid token twice in sequence | First: `200 OK`; Second: `409 Conflict` |
| API-VERIFY-CONFIRM-010 | `POST /api/user/emails/verify-token` with no request body | `400 Bad Request` |
| API-VERIFY-CONFIRM-011 | `POST /api/user/emails/verify-token` with malformed JSON body | `400 Bad Request` |
| API-VERIFY-CONFIRM-012 | `POST /api/user/emails/verify-token` with `Content-Type: text/plain` | `400 Bad Request` (middleware enforcement) |
| API-VERIFY-CONFIRM-013 | `POST /api/user/emails/verify-token` without authentication headers | `200 OK` (authentication not required) |
| API-VERIFY-CONFIRM-014 | `POST /api/user/emails/verify-token` with a token string longer than 256 characters | `400 Bad Request` with `"token is required"` |
| API-VERIFY-CONFIRM-015 | `POST /api/user/emails/verify-token` where `token` is an integer | `400 Bad Request` |
| API-VERIFY-CONFIRM-016 | `POST /api/user/emails/verify-token` where `token` is a boolean | `400 Bad Request` |
| API-VERIFY-CONFIRM-017 | Verify the response includes `Cache-Control: no-store` header | Header is present |
| API-VERIFY-CONFIRM-018 | Verify the response `Content-Type` is `application/json` | Header starts with `application/json` |
| API-VERIFY-CONFIRM-019 | Verify the `id` in the response is a positive integer | `id > 0 && Number.isInteger(id)` |
| API-VERIFY-CONFIRM-020 | Verify `created_at` in the response is a valid ISO 8601 string | `new Date(created_at)` is not NaN |
| API-VERIFY-CONFIRM-021 | Verify the response does not include `lower_email`, `user_id`, or `updated_at` fields | Assert absence of internal fields |

### End-to-End Flow Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| E2E-VERIFY-FLOW-001 | Full flow: add email → request verification → extract token (via test hook or DB query) → confirm token → verify email is activated | Email transitions from `is_activated: false` to `is_activated: true` |
| E2E-VERIFY-FLOW-002 | Full flow with expired token: add email → request verification → fast-forward expiry (manipulate DB `expires_at`) → confirm token | `410 Gone` — token expired |
| E2E-VERIFY-FLOW-003 | Full flow with replaced token: add email → request verification (token A) → request verification again (token B) → confirm token A → fail; confirm token B → success | Token A should fail (superseded); Token B succeeds |
| E2E-VERIFY-FLOW-004 | Full flow: add email → request verification → delete the email → confirm token | Token consumed but email not found; `404` with `"email address no longer exists"` |
| E2E-VERIFY-FLOW-005 | Full flow: add email → request verification → confirm token → request verification for same email again | Second request returns `422 "email is already verified"` |
| E2E-VERIFY-FLOW-006 | Full flow: add email → request verification → confirm token → list emails → verify activated | `GET /api/user/emails` shows `is_activated: true` |
| E2E-VERIFY-FLOW-007 | Full flow: verify token → verify that the token record in DB has `used_at` set | DB inspection confirms `used_at IS NOT NULL` |

### CLI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| CLI-VERIFY-CONFIRM-001 | `codeplane api /api/user/emails/verify-token --method POST -f token=<valid_token>` | Exit code 0; stdout contains JSON with `is_activated: true` |
| CLI-VERIFY-CONFIRM-002 | `codeplane api /api/user/emails/verify-token --method POST -f token=invalidtoken` | Exit code non-zero; stderr contains error about invalid token |
| CLI-VERIFY-CONFIRM-003 | `codeplane api /api/user/emails/verify-token --method POST -f token=` | Exit code non-zero; stderr contains error about missing token |
| CLI-VERIFY-CONFIRM-004 | `codeplane api /api/user/emails/verify-token --method POST` (no `-f` flag) | Exit code non-zero; error about missing body or token |
| CLI-VERIFY-CONFIRM-005 | Confirm token via CLI without auth configured | Exit code 0 (auth not required); `200 OK` |
| CLI-VERIFY-CONFIRM-006 | Full lifecycle: add email (CLI) → send verification (CLI) → extract token → confirm (CLI) → list emails (CLI) → verify activated | End-to-end success |

### Web UI E2E Tests (Playwright)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| UI-VERIFY-CONFIRM-001 | Navigate to `/verify-email?token=<valid_token>` | Page shows loading spinner briefly, then success message with verified email address |
| UI-VERIFY-CONFIRM-002 | Success page shows "Go to email settings" link | Link present, points to `/settings/emails` |
| UI-VERIFY-CONFIRM-003 | Success page shows "Go to dashboard" link | Link present, points to `/` |
| UI-VERIFY-CONFIRM-004 | Navigate to `/verify-email?token=expired_token` (setup expired token) | Page shows "Link Expired" message with resend guidance |
| UI-VERIFY-CONFIRM-005 | Navigate to `/verify-email?token=used_token` (previously consumed) | Page shows "Already Verified" message |
| UI-VERIFY-CONFIRM-006 | Navigate to `/verify-email?token=invalid_garbage_string` | Page shows "Verification Failed" with link to email settings |
| UI-VERIFY-CONFIRM-007 | Navigate to `/verify-email` without `token` query parameter | Page shows "Verification Failed" — missing token |
| UI-VERIFY-CONFIRM-008 | Navigate to `/verify-email?token=` (empty token) | Page shows "Verification Failed" — missing token |
| UI-VERIFY-CONFIRM-009 | Verify the landing page does not require authentication | Page renders and processes token without login |
| UI-VERIFY-CONFIRM-010 | After verification, navigate to `/settings/emails` → verified email shows ✓ Verified badge | Green verified badge, not unverified warning |
| UI-VERIFY-CONFIRM-011 | After verification, "Send verification email" button absent for the verified email | Button does not exist for this email |
| UI-VERIFY-CONFIRM-012 | Verify landing page displays Codeplane branding (logo) | Logo element visible |
| UI-VERIFY-CONFIRM-013 | Verify loading spinner shown before API response (use network throttling) | Spinner/loading state visible |
| UI-VERIFY-CONFIRM-014 | Simulate `500` error from API on verification page | "Something went wrong. Please try again." with retry option |
| UI-VERIFY-CONFIRM-015 | Simulate `429` rate limit on verification page | "Too many attempts. Please wait." |

### Concurrency & Race Condition Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| RACE-VERIFY-001 | Submit same valid token concurrently from 5 requests | Exactly one returns `200 OK`; remaining 4 return `409 Conflict` |
| RACE-VERIFY-002 | Request verification (SEND) and immediately confirm (CONFIRM) | Confirm succeeds with the token from the most recent SEND |
| RACE-VERIFY-003 | Send verification, send again (replaces token), confirm first token | First token fails (superseded); second token succeeds |

### Boundary Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| BOUNDARY-VERIFY-001 | Confirm token with exactly 64 hex characters (32 bytes) | `200 OK` if valid |
| BOUNDARY-VERIFY-002 | Confirm token with exactly 256 characters | `200 OK` if valid (at maximum accepted length) |
| BOUNDARY-VERIFY-003 | Confirm token with 257 characters | `400 Bad Request` (exceeds maximum length) |
| BOUNDARY-VERIFY-004 | Confirm token with 1 character | `404 Not Found` (valid input but no matching hash) |
| BOUNDARY-VERIFY-005 | Confirm token containing special characters (`+`, `/`, `=`, `%`, unicode) | Deterministic behavior — either accepted and hashed or rejected |
| BOUNDARY-VERIFY-006 | Confirm token with null bytes or control characters | `400 Bad Request` |

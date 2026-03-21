# USER_EMAIL_VERIFICATION_SEND

Specification for USER_EMAIL_VERIFICATION_SEND.

## High-Level User POV

When you add a new email address to your Codeplane account, it begins in an "unverified" state. Until that email is verified, Codeplane cannot trust that you actually own it — and so it cannot be used for notifications, commit attribution, or account recovery. Verification is how you prove ownership of an address.

To verify an email, you go to your email settings — on the web, in the CLI, or in the TUI — find the unverified address, and click or invoke "Send verification." Codeplane sends a one-time verification link to that email address. You open the email, click the link (or paste a token), and the address is marked as verified. This spec covers the "send" side of that flow: requesting that Codeplane generate and deliver the verification email.

The experience is designed to be low-friction and safe. You can request verification for any unverified email on your account at any time. If you request verification again for the same email — because the first email was lost, delayed, or expired — Codeplane invalidates any previous token and sends a fresh one. You cannot request verification for an email that is already verified, because there is nothing to do. You cannot request verification for an email that belongs to someone else's account, because the endpoint is scoped to your own emails.

Codeplane protects against abuse. Verification requests are rate-limited to prevent flooding someone's inbox or consuming email-delivery budget. Tokens expire after a reasonable window, and expired tokens are automatically cleaned up. The verification email itself contains minimal information — just enough for the recipient to complete the flow — and does not expose account internals.

From the CLI, a single command triggers the verification email and prints a confirmation. From the TUI, the action is one keypress away on the email management screen. From the web, it is a button next to each unverified email. In every case, the user sees clear feedback: the email was sent, or an error explains why it was not.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can request a verification email for any unverified email address on their account via the web UI, CLI, and TUI; the system generates a secure, time-limited token; a verification email is delivered to the target address; and the user receives clear feedback for all success and error conditions across all product surfaces.

### Functional Constraints

- [ ] Authenticated users can request a verification email via `POST /api/user/emails/:id/verify`.
- [ ] The `:id` parameter refers to the numeric ID of an email address owned by the authenticated user.
- [ ] On success, the API returns `204 No Content` with an empty body.
- [ ] The system generates a cryptographically random verification token (minimum 32 bytes of entropy).
- [ ] The token is stored as a SHA-256 hash in the `email_verification_tokens` table; the raw token is never persisted.
- [ ] The token has a `token_type` of `"email_verification"`.
- [ ] The token expires 24 hours after creation.
- [ ] Any existing unused, unexpired verification tokens for the same user+email combination are invalidated (deleted or marked used) before the new token is created.
- [ ] A verification email is sent to the target email address containing the raw token or a verification URL.
- [ ] The verification email includes: the Codeplane instance name, the email address being verified, a verification link containing the token, and a note that the link expires in 24 hours.
- [ ] The email does not include the user's username, password, or any other account secrets.
- [ ] If the email address is already verified (`is_activated: true`), the API returns `422` with a message indicating the email is already verified. No token is created and no email is sent.
- [ ] If the email ID does not exist or does not belong to the authenticated user, the API returns `404` with a generic "email not found" message.
- [ ] If the email ID is not a valid positive integer, the API returns `400` with "invalid email id."

### Input Validation Constraints

- [ ] The `:id` URL parameter must be a string that parses to a positive integer. Values like `0`, `-1`, `abc`, `1.5`, or empty string return `400`.
- [ ] The request body is ignored (the endpoint takes no body). Extra JSON body content does not cause an error.
- [ ] The request must be authenticated. Missing or invalid authentication returns `401`.

### Boundary Constraints

- [ ] A user can request verification for any of their unverified emails, up to the per-endpoint rate limit.
- [ ] Re-requesting verification for the same email before the previous token expires is allowed (generates a new token, invalidates the old one).
- [ ] The email delivery is asynchronous from the API response — the `204` indicates the token was created and the send was enqueued, not that delivery succeeded.
- [ ] If the email delivery subsystem is unavailable, the API still returns `204` (fire-and-forget semantics), but the failure is logged and metrics are incremented.
- [ ] Token length: the raw token is a 64-character hex string (32 bytes of randomness encoded as hex).
- [ ] The verification URL in the email must not exceed 2048 characters (safe URL length across email clients).

### Request Shape Constraints

- [ ] The endpoint accepts any `Content-Type` (including none) since no body is required.
- [ ] Authentication is required via session cookie or PAT bearer token.

## Design

### Web UI Design

#### Settings — Emails Page

The verification send action is integrated into the existing email list on the **Emails** section of the user settings page (`/settings/emails`).

**Layout (additions to the existing email list):**

```
┌─────────────────────────────────────────────────────────┐
│  Email Addresses                                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  user@example.com          PRIMARY ✓ Verified     │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  work@example.com          ⚠ Unverified           │   │
│  │           [Send verification]  [Set primary] [Remove] │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  side@example.com          ⚠ Unverified           │   │
│  │           [Send verification]  [Remove]           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ── Add new email ──────────────────────────────────    │
│  Email: [_________________________]                      │
│  ☐ Set as primary                                        │
│  [Add email]                                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Interactions:**

- The **"Send verification"** button appears only on email rows where `is_activated` is `false`.
- Verified emails do not show the button; they display a green "✓ Verified" badge instead.
- Clicking **"Send verification"** immediately sends the API request. The button shows a spinner and becomes disabled during the request.
- On success (204): a green toast appears: "Verification email sent to work@example.com. Check your inbox." The button text changes to "Resend verification" and remains enabled (for re-sends).
- On error (404): inline error "Email not found."
- On error (422, already verified): inline message "This email is already verified." The UI refreshes the email list to update the badge.
- On error (429, rate limited): inline error "Too many verification requests. Please try again in X minutes." where X is derived from the `Retry-After` header.
- On error (401): redirect to login page.
- On error (500): inline error "Something went wrong. Please try again later."
- After a successful send, a subtle timer or note below the email row reads "Verification email sent. Link expires in 24 hours." This note fades after 10 seconds or on next page interaction.

### API Shape

#### Send Verification Email

```
POST /api/user/emails/:id/verify
Authorization: Bearer <token> | Cookie session
```

No request body required.

**Success (204 No Content):**
Empty body.

**Errors:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 400 | Invalid email ID (non-numeric, zero, negative) | `{ "message": "invalid email id" }` |
| 401 | No auth cookie/token | `{ "message": "authentication required" }` |
| 404 | Email ID not found or not owned by the authenticated user | `{ "message": "email not found" }` |
| 422 | Email is already verified | `{ "message": "email is already verified" }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| 500 | Internal server error | `{ "message": "internal server error" }` |

**Response headers on success:**

- Standard rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### SDK Shape

The `UserService` in `@codeplane/sdk` exposes:

- `sendEmailVerification(userId: number, emailId: number): Promise<Result<void, APIError>>`

The service method:
1. Fetches the email by ID and verifies it belongs to the given user.
2. Checks that `is_activated` is `false`; returns 422 if already verified.
3. Deletes any existing unused verification tokens for this user+email pair.
4. Generates a 32-byte cryptographically random token using `crypto.getRandomValues()`.
5. Hashes the token with SHA-256.
6. Calls `createEmailVerificationToken` with the hash, `token_type: "email_verification"`, and `expires_at` set to `now + 24 hours`.
7. Enqueues the verification email for delivery (via the email delivery service), passing the raw (unhashed) token.
8. Returns `Result.ok(undefined)`.

### CLI Command

```bash
codeplane api /api/user/emails/<id>/verify --method POST
```

The CLI currently supports sending verification via the generic `codeplane api` passthrough.

**Success output (exit code 0):** No output (204 response).

**Error output (exit code non-zero):** Structured error JSON printed to stderr.

**Example workflow:**
```bash
# List emails to find the ID of the unverified email
codeplane api /api/user/emails

# Request verification for email with ID 42
codeplane api /api/user/emails/42/verify --method POST
```

A future dedicated `codeplane email verify <id>` subcommand may be added, but the current product surface is the generic `api` command.

### TUI UI

In the settings/email screen, the verification action is accessible from the email list:

```
Email Addresses

  user@example.com          PRIMARY ✓ Verified
  work@example.com          ⚠ Unverified
  side@example.com          ⚠ Unverified

  [v] Verify selected   [a] Add email   [d] Delete   [q] Back

> work@example.com selected
```

- The user navigates the email list with arrow keys or `j`/`k`.
- Pressing `v` on an unverified email triggers the verification send.
- A confirmation message appears: "Verification email sent to work@example.com."
- If the email is already verified, pressing `v` shows: "This email is already verified."
- If rate limited, the message shows: "Too many requests. Try again later."
- The `v` key is inactive (greyed out in the help bar) when the selected email is already verified.

### Documentation

- **User Guide: "Verifying Your Email Addresses"**: Step-by-step walkthrough explaining why verification is needed, how to request a verification email from the web settings page, what to expect in your inbox, and what to do if the email doesn't arrive (check spam, resend, check for typos). Includes CLI usage for terminal-oriented users.
- **API Reference: `POST /api/user/emails/:id/verify`**: Full endpoint documentation including authentication requirements, URL parameter description, response codes, and error shapes.
- **FAQ Entry: "I didn't receive my verification email"**: Troubleshooting guide covering: check spam/junk, wait a few minutes, request a new one (old link is invalidated), verify the email address is correct in your settings, check with your email administrator if using a corporate domain.
- **FAQ Entry: "My verification link expired"**: Explains the 24-hour window and how to request a fresh link.

## Permissions & Security

### Authorization

| Action | Required Role |
|--------|---------------|
| Send verification for own email | Authenticated user (any role) |
| Send verification for another user's email | Not permitted (no admin override) |
| Anonymous access | Not permitted — 401 |

No organization-level, team-level, or repository-level permissions are involved. Email verification is strictly per-user self-service for the authenticated user. The user ID is derived from the session, not a URL parameter, eliminating IDOR risk for the user dimension. The email ID is validated against the authenticated user's emails.

### Rate Limiting

- `POST /api/user/emails/:id/verify`: **3 requests per 15 minutes** per authenticated user (across all email IDs).
- This is more restrictive than the general email add limit because each request triggers an outbound email.
- Failed requests (404, 422) still count toward the rate limit to prevent probing.
- The 429 response includes a `Retry-After` header with the number of seconds until the rate limit resets.
- Global authenticated rate limiting (5,000 requests/hour) also applies.

### Data Privacy

- The verification token is a bearer credential. The raw token is sent via email and used in the confirmation URL; it must never be stored in plaintext in the database or logged.
- Only the SHA-256 hash of the token is persisted.
- The verification email must not include the username, account password, or any other account data beyond the email address being verified and the verification link.
- The 404 error for non-owned emails does not disclose whether the email ID exists on another user's account. The message is generically "email not found."
- Email addresses must not appear in server logs at `info` level or below. Logs should reference `email_id`, not the email string.
- The verification URL must use HTTPS in production environments.

### Token Security

- Token entropy: 32 bytes (256 bits) of cryptographic randomness — sufficient to prevent brute-force guessing within the 24-hour window.
- Token hash: SHA-256 (not reversible from the stored hash).
- Token lifetime: 24 hours from creation. Expired tokens are cleaned up by the background sweep.
- Token single-use: once consumed (by USER_EMAIL_VERIFICATION_CONFIRM), it cannot be reused.
- Re-requesting invalidates previous tokens for the same email, preventing token accumulation.

### Input Sanitization

- The `:id` URL parameter is parsed as an integer. Non-numeric, negative, zero, and floating-point values are rejected with 400.
- No request body is parsed, so body-based injection attacks are not applicable.
- The verification URL constructed for the email is built using URL-safe encoding of the token and must not be susceptible to header injection or open redirect.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `EmailVerificationSent` | Verification token created and email enqueued | `user_id`, `email_id`, `client` (web/cli/tui/api), `is_resend` (bool — true if a previous token existed for this email), `timestamp` |
| `EmailVerificationSendFailed` | Verification send attempt failed (any reason) | `user_id`, `email_id` (if available), `failure_reason` (invalid_id/not_found/already_verified/rate_limited/internal_error), `client`, `timestamp` |
| `EmailVerificationAlreadyVerified` | User requested verification for an already-verified email | `user_id`, `email_id`, `client`, `timestamp` |

### Funnel Metrics

1. **Verification Request Rate**: `EmailVerificationSent` events per day. Establishes baseline demand for the feature.
2. **Verification Completion Funnel**: `EmailVerificationSent` → `EmailVerificationConfirmed` (from the sibling CONFIRM feature). Target: ≥60% of sent verifications are confirmed within 24 hours.
3. **Resend Rate**: Percentage of `EmailVerificationSent` where `is_resend: true`. A high resend rate (>30%) suggests emails are not being delivered or users are confused by the flow.
4. **Already-Verified Rejection Rate**: `EmailVerificationAlreadyVerified / (EmailVerificationSent + EmailVerificationAlreadyVerified)`. If high (>10%), the UI may not be updating verification status promptly enough.
5. **Time to Verify**: Distribution of time between `EmailVerificationSent` and `EmailVerificationConfirmed`. Median target: <10 minutes (most users verify immediately upon receiving the email).
6. **Unverified Email Age**: Number of emails that remain unverified >48 hours after a verification email was sent. A growing count indicates delivery or UX problems.

### Success Indicators

- The endpoint has a p99 latency under 200ms (excluding email delivery, which is async).
- ≥90% of `EmailVerificationSent` events result in actual email delivery (tracked via delivery service callbacks).
- Verification completion rate (send → confirm) ≥60% within 24 hours.
- Zero instances of raw tokens appearing in server logs (verified via periodic audit).

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | Notes |
|-----------|-------|--------------------|-------|
| Verification send request received | `info` | `user_id`, `email_id`, `request_id`, `client` | Entry log for every request |
| Verification token created | `info` | `user_id`, `email_id`, `token_id`, `expires_at`, `request_id` | Do NOT log the token value or hash |
| Previous tokens invalidated | `debug` | `user_id`, `email_id`, `invalidated_count`, `request_id` | Count of old tokens removed |
| Verification email enqueued | `info` | `user_id`, `email_id`, `request_id` | Do NOT log the email address |
| Verification email delivery confirmed | `info` | `email_id`, `delivery_id`, `request_id` | Async callback from email provider |
| Verification email delivery failed | `error` | `email_id`, `delivery_error`, `request_id` | Async callback from email provider |
| Email already verified (422) | `info` | `user_id`, `email_id`, `request_id` | Expected user behavior, not an error |
| Email not found (404) | `warn` | `user_id`, `requested_email_id`, `request_id` | Could be stale UI or probing |
| Invalid email ID (400) | `warn` | `user_id`, `raw_id_param`, `request_id` | Input validation failure |
| Token creation DB error | `error` | `user_id`, `email_id`, `error_message`, `error_stack`, `request_id` | Unexpected DB failure |
| Rate limited (429) | `warn` | `user_id`, `request_id`, `retry_after_seconds` | Track for abuse patterns |
| Auth failure (401) | `warn` | `request_id`, `source_ip` | Potential unauthorized access attempt |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_email_verification_send_total` | Counter | `status` (success/not_found/already_verified/invalid_id/rate_limited/internal_error), `client` (web/cli/tui/api) | Total verification send attempts |
| `codeplane_email_verification_send_duration_seconds` | Histogram | `status` | Latency of the verification send operation (token creation + email enqueue). Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_email_verification_token_created_total` | Counter | — | Total verification tokens successfully created |
| `codeplane_email_verification_tokens_invalidated_total` | Counter | — | Total old tokens invalidated during resend flows |
| `codeplane_email_verification_email_enqueued_total` | Counter | — | Total verification emails successfully enqueued for delivery |
| `codeplane_email_verification_email_delivery_total` | Counter | `status` (delivered/bounced/failed) | Email delivery outcomes from the email provider |
| `codeplane_email_verification_send_rate_limited_total` | Counter | — | Number of verification send requests rejected by rate limiter |

### Alerts and Runbooks

#### Alert: High Verification Send Internal Error Rate

**Condition**: `rate(codeplane_email_verification_send_total{status="internal_error"}[5m]) > 0.05` for 5 minutes.

**Severity**: Critical.

**Runbook**:
1. Check server error logs filtered by `email_verification_send` context for stack traces.
2. Verify database connectivity — run a health check against the primary DB.
3. Check if the `email_verification_tokens` table is accessible: `SELECT 1 FROM email_verification_tokens LIMIT 1`.
4. Check if the `createEmailVerificationToken` query is failing — look at the DB error logs for constraint violations or timeouts.
5. Verify the crypto random number generator is functional (extremely unlikely to fail, but check system entropy pool on Linux).
6. If the email delivery service is the source of errors, check its status page and dashboard. The API should still return 204 even if delivery fails, so this alert specifically points to token creation/DB issues.
7. If the issue is transient (e.g., connection pool exhaustion), monitor for recovery. If persistent, page the database on-call.

#### Alert: Email Delivery Failure Rate Spike

**Condition**: `rate(codeplane_email_verification_email_delivery_total{status="failed"}[15m]) / rate(codeplane_email_verification_email_delivery_total[15m]) > 0.2` for 15 minutes.

**Severity**: Warning.

**Runbook**:
1. Check the email delivery service dashboard (e.g., Resend, SendGrid) for global delivery issues or quota exhaustion.
2. Examine delivery failure reasons: bounced addresses, spam blocks, rate limits from the provider, or configuration errors.
3. Check if the `from` address or sending domain has been flagged or suspended.
4. Verify DKIM/SPF/DMARC records are correctly configured for the sending domain.
5. If delivery is failing to specific domains (e.g., corporate email), check if those domains are rejecting Codeplane emails.
6. If the email delivery service is down, consider pausing the verification send endpoint (return a 503) until delivery is restored, to prevent creating tokens that can never be delivered.
7. Escalate to the email delivery service provider if the issue is on their end.

#### Alert: Verification Send Latency Spike

**Condition**: `histogram_quantile(0.95, rate(codeplane_email_verification_send_duration_seconds_bucket[5m])) > 1.0` for 10 minutes.

**Severity**: Warning.

**Runbook**:
1. Check if the latency is in the database operations (token invalidation, token creation) or the email enqueue step.
2. Run `EXPLAIN ANALYZE` against the token creation and deletion queries.
3. Check for lock contention on the `email_verification_tokens` table.
4. Check if the email delivery service enqueue call is timing out — switch to async fire-and-forget if not already.
5. Verify the SHA-256 hashing is not bottlenecking (extremely unlikely, but check CPU usage).
6. If database-related, check index health on `email_verification_tokens(user_id, email)` and `email_verification_tokens(token_hash)`.

#### Alert: Verification Send Rate Limit Spike

**Condition**: `rate(codeplane_email_verification_send_rate_limited_total[5m]) > 10` for 10 minutes.

**Severity**: Info.

**Runbook**:
1. Check if rate-limited requests are concentrated from a small number of user IDs.
2. If a single user is triggering rate limits repeatedly, this may be confusion (check their unverified email count and whether they are receiving emails).
3. If many users are hitting rate limits simultaneously, the limit may be too aggressive — review the 3-per-15-minute threshold.
4. If the pattern looks like automated abuse, check if the user accounts are legitimate and consider temporary account-level restrictions.
5. No immediate action required unless the pattern suggests an attack vector.

### Error Cases and Failure Modes

| Failure | HTTP Status | Impact | Mitigation |
|---------|-------------|--------|------------|
| DB connection failure during token creation | 500 | User sees error, no email sent | Retry on next user request; alert fires on sustained failures |
| Email delivery service unavailable | 204 (to user) | Token created but email never arrives | Logged as error; delivery failure metric; user can resend |
| Email delivery bounced | 204 (to user) | Token created but email bounces | Delivery metric tracks bounce; user may have a typo in the email address |
| Crypto random generation failure | 500 | No token created | Extremely rare; alert fires; requires system-level investigation |
| Token table full / disk space | 500 | No token created | Alert fires; DBA investigation; cleanup job should prevent this |
| Race condition: email deleted between check and token creation | 500 (FK violation) | Unexpected error | Handled as internal error; logged; user retries and gets 404 |
| Rate limiter state lost (restart) | Allows burst | Brief window of unlimited requests | Acceptable risk; rate limit is defense-in-depth |
| User requests verification then immediately deletes the email | Orphaned token | Token exists for deleted email | Cleanup job removes expired tokens; confirm step will fail gracefully |

## Verification

### API Integration Tests

- [ ] `POST /api/user/emails/:id/verify` with a valid unverified email ID → `204 No Content` with empty body
- [ ] `POST /api/user/emails/:id/verify` with a valid verified email ID → `422` with `{ "message": "email is already verified" }`
- [ ] `POST /api/user/emails/:id/verify` with an email ID belonging to a different user → `404` with `{ "message": "email not found" }`
- [ ] `POST /api/user/emails/:id/verify` with email ID `0` → `400` with `{ "message": "invalid email id" }`
- [ ] `POST /api/user/emails/:id/verify` with email ID `-1` → `400`
- [ ] `POST /api/user/emails/:id/verify` with email ID `abc` → `400`
- [ ] `POST /api/user/emails/:id/verify` with email ID `1.5` → `400`
- [ ] `POST /api/user/emails/:id/verify` with email ID `999999` (non-existent) → `404`
- [ ] `POST /api/user/emails/:id/verify` without authentication → `401`
- [ ] `POST /api/user/emails/:id/verify` with expired/revoked PAT → `401`
- [ ] `POST /api/user/emails/:id/verify` with valid session cookie auth → `204`
- [ ] `POST /api/user/emails/:id/verify` with valid PAT auth → `204`
- [ ] Verify response includes rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] Call `POST /api/user/emails/:id/verify` for the same email twice in quick succession → both return `204`; the second invalidates the first token
- [ ] After sending verification, verify a token record exists in the database with correct `user_id`, `email`, `token_type = "email_verification"`, `expires_at` approximately 24 hours in the future, and `used_at = null`
- [ ] After sending verification twice for the same email, verify only one active (unused, unexpired) token exists for that email
- [ ] Verify the stored `token_hash` is a valid SHA-256 hex digest (64 hex characters)
- [ ] After sending verification, verify the verification email was enqueued/sent (via email service mock or test mailbox)
- [ ] Verify the verification email contains a link with the raw token
- [ ] Verify the verification email does not contain the user's username or password
- [ ] Verify the token in the email, when SHA-256 hashed, matches the `token_hash` stored in the database
- [ ] Add an email, request verification, delete the email, verify the orphaned token is cleaned up by the background job (or at minimum does not interfere with future operations)
- [ ] Request verification with a JSON body containing extra fields → `204` (extra body content is ignored)
- [ ] Request verification with no `Content-Type` header → `204` (no body required)
- [ ] Request verification with `Content-Type: text/plain` → `204` (no body required)
- [ ] Full lifecycle: add email → request verification → confirm token → list emails → email shows `is_activated: true`

### Rate Limiting Tests

- [ ] Send 3 verification requests within 15 minutes → all return `204`
- [ ] Send a 4th verification request within the same 15-minute window → `429` with `Retry-After` header
- [ ] Verify the `Retry-After` header value is a positive integer (seconds until reset)
- [ ] After waiting for the rate limit window to reset, the next request succeeds with `204`
- [ ] Verify that 404 and 422 responses also count toward the rate limit (send 2 requests to a non-existent email, then 1 to a valid email, then verify the 4th is rate-limited)

### CLI Integration Tests

- [ ] `codeplane api /api/user/emails/<id>/verify --method POST` with a valid unverified email ID → exit code `0`, no stdout output
- [ ] `codeplane api /api/user/emails/<id>/verify --method POST` with a non-existent email ID → exit code non-zero, error message on stderr
- [ ] `codeplane api /api/user/emails/<id>/verify --method POST` without auth configured → exit code non-zero, auth error
- [ ] `codeplane api /api/user/emails/<id>/verify --method POST` with an already-verified email → exit code non-zero, "already verified" error
- [ ] Full CLI round-trip: add email via POST → request verification via POST → verify email appears in list as unverified → (confirm token) → verify email appears in list as verified

### Web UI E2E Tests (Playwright)

- [ ] Navigate to `/settings/emails` → unverified emails display a "Send verification" button; verified emails do not
- [ ] Click "Send verification" on an unverified email → button shows spinner → toast "Verification email sent to ..." appears → button text changes to "Resend verification"
- [ ] Click "Resend verification" on the same email → succeeds with a new toast confirmation
- [ ] Intercept API to return 422 (already verified) → click send → inline message "This email is already verified" appears and email list refreshes to show verified badge
- [ ] Intercept API to return 429 → click send → inline error "Too many verification requests. Please try again in X minutes" appears
- [ ] Intercept API to return 500 → click send → inline error "Something went wrong. Please try again later" appears
- [ ] Verify the "Send verification" button is disabled while the request is in flight (prevent double-click)
- [ ] Navigate to `/settings/emails` while unauthenticated → redirected to login page
- [ ] After sending verification, the email row does NOT change its verification badge (still shows "Unverified" until the confirm step completes)
- [ ] Verify the spinner/loading state is visible during the API call (use network throttling if needed)

### TUI Integration Tests

- [ ] Navigate to email settings → select an unverified email → press `v` → confirmation message "Verification email sent" appears
- [ ] Select a verified email → press `v` → message "This email is already verified" appears
- [ ] Press `v` without selecting an email → no action taken / helpful hint displayed
- [ ] After sending verification, email list still shows the email as unverified (until confirm)

### Boundary and Edge Case Tests

- [ ] Add the maximum number of emails (10), leave all unverified, request verification for each → all 10 succeed
- [ ] Request verification for an email with the maximum valid length (254 characters) → `204` success, verification email is sent
- [ ] Request verification immediately after adding an email (no delay) → `204` success
- [ ] Two concurrent verification requests for the same email (parallel API calls) → both return `204`, only one active token remains
- [ ] Request verification, wait for the token to expire (24 hours, can be simulated), then request again → new token is created successfully
- [ ] Verify the cleanup background job removes expired verification tokens (create a token, advance time or set short expiry in test, run cleanup, verify token is gone)
- [ ] `POST /api/user/emails/:id/verify` response time is under 300ms for the typical case (measured via test harness)

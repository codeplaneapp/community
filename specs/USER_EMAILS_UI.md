# USER_EMAILS_UI

Specification for USER_EMAILS_UI.

## High-Level User POV

Your email addresses are fundamental to your Codeplane identity. They connect your commits to your account, receive notifications, and serve as recovery credentials. The Emails settings page is your single place to manage all of this — adding new addresses, removing ones you no longer use, verifying ownership, and choosing which address is your primary.

When you open your user settings and click "Emails" in the sidebar, you see a clean, organized view of every email address on your account. Your primary email is always at the top, clearly badged so you know which address Codeplane is using for notifications and commit attribution. Each address shows whether it has been verified — verified addresses display a green checkmark badge, while unverified ones show an amber warning indicator along with a button to request a verification email.

Adding a new email is straightforward: you type the address into the input field at the top of the page, optionally check a box to make it your new primary, and submit. The new address appears immediately in the list as unverified. You can then request a verification email, click the link in your inbox, and watch the badge change to "Verified" on your next visit.

Removing an email you no longer need is a single click on the "Remove" button, followed by a confirmation dialog to prevent accidents. Your primary email cannot be removed — if you want to change your primary, you first designate a different address as primary, then remove the old one.

The same information is available from the CLI via `codeplane api /api/user/emails`, and a future TUI email management screen will provide terminal-native access. The web UI, CLI, and API always show consistent data — changes made in one surface are immediately reflected in the others on refresh.

The Emails page is private to you. No other user can see your email addresses. Platform administrators have separate admin surfaces for account management, but your settings page is scoped entirely to your own identity.

## Acceptance Criteria

### Definition of Done

- [ ] The `/settings/emails` route exists in the SolidJS web application and is accessible from the settings sidebar.
- [ ] The settings sidebar highlights "Emails" when the user is on this page.
- [ ] Authenticated users see a complete list of their email addresses with primary, verification, and date information.
- [ ] Users can add a new email address via an inline form at the top of the page.
- [ ] Users can optionally set a new email as primary during addition.
- [ ] Users can remove any non-primary email address via a "Remove" button with confirmation dialog.
- [ ] Users can request a verification email for any unverified address via a "Send verification" button.
- [ ] Users who click a verification link in their email are taken to `/verify-email?token=<token>` and see a clear success, error, or expired state.
- [ ] Unauthenticated users visiting `/settings/emails` are redirected to the login page.
- [ ] The page shows appropriate loading, empty, and error states.
- [ ] All actions provide immediate visual feedback (toasts, inline status changes, spinner on buttons).
- [ ] The page is fully keyboard-navigable and screen-reader accessible.
- [ ] The page is responsive across desktop, tablet, and mobile viewports.
- [ ] All state shown on the page matches the API response exactly — no client-only fabrication.

### Functional Criteria

- [ ] The email list is fetched from `GET /api/user/emails` on page load.
- [ ] The list is sorted with the primary email first, then by creation date ascending.
- [ ] Each email row displays: the email address, a "Primary" badge (if applicable), a "Verified" or "Unverified" badge, the date added, and contextual action buttons.
- [ ] The "Add email" form validates input client-side before submission: non-empty, contains `@`, length between 3 and 254 characters.
- [ ] Server-side validation errors (format, duplicate, maximum reached) are displayed inline beneath the form field.
- [ ] Adding an email with `is_primary: true` atomically promotes it and demotes the previous primary.
- [ ] After a successful add, the email list refreshes automatically without a full page reload.
- [ ] The "Remove" button is hidden or disabled on the primary email row.
- [ ] The removal confirmation dialog displays the email address being removed for clarity.
- [ ] After a successful removal, the email is removed from the displayed list immediately.
- [ ] The "Send verification" button is only visible on unverified email rows.
- [ ] After clicking "Send verification", the button enters a disabled/cooldown state for 15 seconds to discourage rapid re-clicks.
- [ ] The verification landing page (`/verify-email?token=<token>`) does not require authentication.
- [ ] The verification landing page displays distinct states: loading, success, expired token, already used token, and invalid/missing token.
- [ ] On verification success, the page shows the verified email address and a link to return to settings.

### Edge Cases

- [ ] A user with exactly one email address sees it marked as primary; the "Remove" button is hidden.
- [ ] A user who signed up via GitHub OAuth and has never added additional emails sees the GitHub-provided email.
- [ ] A user at the maximum of 10 emails sees the add form disabled with a message: "You have reached the maximum of 10 email addresses."
- [ ] Adding a duplicate email that already belongs to the same user results in an upsert (updates primary status if changed) and does not show a duplicate error.
- [ ] Adding an email already registered to a different user shows a 409 Conflict error: "This email address is already associated with another account."
- [ ] An email address with international characters in the local part (e.g., `ñ@example.com`) is displayed correctly.
- [ ] An email address with `+` alias (e.g., `user+codeplane@example.com`) is accepted and displayed correctly.
- [ ] Mixed-case email addresses (e.g., `User@EXAMPLE.COM`) are displayed with preserved original casing.
- [ ] Submitting the add form with only whitespace shows a validation error.
- [ ] Submitting the add form with an email exceeding 254 characters shows a client-side validation error before any API call.
- [ ] Submitting the add form with a string missing `@` shows a client-side validation error.
- [ ] Clicking "Remove" and then canceling the confirmation dialog does not remove the email.
- [ ] If the API returns a 500 during add, the form remains filled so the user can retry without retyping.
- [ ] If the API returns a 500 during list fetch, an error banner is displayed with a "Retry" button.
- [ ] Rapidly clicking "Add" multiple times does not create duplicate submissions (button disables on first click).
- [ ] If the verification token URL has no `token` query parameter, the landing page shows "Invalid verification link."
- [ ] If the verification token is expired, the landing page shows "This verification link has expired. Please request a new one." with a link to settings.
- [ ] If the verification token has already been used, the landing page shows "This email has already been verified."
- [ ] Network disconnection during an action shows a clear error toast rather than silently failing.

### Boundary Constraints

- [ ] Email address: minimum 3 characters, maximum 254 characters (RFC 5321).
- [ ] Maximum 10 email addresses per user.
- [ ] Email must contain exactly one `@` character with at least one character on each side.
- [ ] Email address original casing is preserved for display; duplicate detection is case-insensitive.
- [ ] The add form trims leading and trailing whitespace before submission.
- [ ] The "Set as primary" checkbox defaults to unchecked.
- [ ] Verification token: 32-byte random value, URL-safe base64 encoded.
- [ ] Verification token expiry: 24 hours from creation.
- [ ] Rate limit for sending verification: 3 requests per 15 minutes per user.
- [ ] Rate limit for confirming verification: 20 requests per IP per 15 minutes.
- [ ] Rate limit for adding emails: 10 requests per minute per user.
- [ ] Rate limit for deleting emails: 10 requests per 10 minutes per user.

## Design

### Web UI Design

**Route**: `/settings/emails` — accessible from the user settings sidebar under "Emails."

**Settings Sidebar Integration**:
- The "Emails" item appears in the settings sidebar between "Profile" and "SSH Keys."
- Icon: envelope/mail icon.
- Active state: 4px left-border accent (primary color), bold text, subtle background highlight.

**Page Layout**:

```
┌─────────────────────────────────────────────────────────┐
│ Email addresses                                         │
│ Manage email addresses associated with your account.    │
│ Your primary email is used for notifications and        │
│ commit attribution.                                     │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Add email address                                   │ │
│ │ ┌──────────────────────────────┐ ☐ Set as primary   │ │
│ │ │ name@example.com             │ [Add email]        │ │
│ │ └──────────────────────────────┘                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ alice@example.com   [Primary] [✓ Verified]          │ │
│ │ Added Jan 15, 2025                                  │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ alice-work@company.org   [⚠ Unverified]             │ │
│ │ Added Jun 20, 2025       [Send verification] [Remove]│ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ alice-personal@gmail.com [✓ Verified]               │ │
│ │ Added Aug 1, 2025        [Set primary]     [Remove] │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Add Email Section** (persistent inline form, not a modal):
- **Email input**: Text input with placeholder `name@example.com`. Monospace or system font. Auto-trims whitespace on blur.
- **"Set as primary" checkbox**: Unchecked by default. Label: "Set as primary." Tooltip on hover: "This email will become your primary address for notifications and commit attribution."
- **"Add email" button**: Disabled when the input is empty or invalid. Shows a spinner during submission. Disabled entirely (with message) when user has 10 emails.
- **Validation messages**: Appear below the input. Red text for errors. Examples: "Please enter a valid email address." / "Email address must be between 3 and 254 characters." / "You have reached the maximum of 10 email addresses."
- **Server error messages**: Appear as an inline error banner below the form. Examples: "This email address is already associated with another account." (409) / "Something went wrong. Please try again." (500).
- **Success feedback**: Toast notification: "Email address added successfully." Form clears. List refreshes.

**Email List Section**:
- Each email is a row in a card-style list (with subtle borders between rows).
- **Email address**: Semi-bold text, slightly larger font size.
- **Badges** (inline, right of the email address):
  - "Primary": Solid accent-color pill (e.g., blue). Only on the primary email.
  - "Verified": Green outline pill with checkmark icon. On all verified emails.
  - "Unverified": Amber/orange outline pill with warning icon. On all unverified emails.
- **Date**: Below the email address in smaller, muted text. Format: "Added Jan 15, 2025" with tooltip showing full ISO timestamp on hover.
- **Action buttons** (right-aligned in each row):
  - "Send verification": Visible only on unverified, non-primary rows. After click, shows "Verification email sent" toast. Button enters 15-second cooldown (shows countdown or "Sent" state).
  - "Set primary": Visible on verified, non-primary rows. After click, list re-sorts with new primary at top. Toast: "Primary email updated."
  - "Remove": Visible on all non-primary rows. Opens confirmation dialog.
- **Primary email row**: Subtle background highlight (very light accent color) or top-border accent line. No "Remove" button. No "Set primary" button.

**Confirmation Dialog** (for Remove):
- Title: "Remove email address?"
- Body: `Are you sure you want to remove **{email}** from your account? This action cannot be undone.`
- Buttons: "Cancel" (secondary) | "Remove" (destructive/red).
- Pressing Escape or clicking outside dismisses the dialog without action.

**States**:
- **Loading**: 3 skeleton rows with shimmer animation matching row dimensions. No layout shift on data load.
- **Empty**: Centered message: "No email addresses configured." with CTA button: "Add your first email address."
- **Error**: Inline error banner at the top of the list section: "Failed to load email addresses. Please try again." with "Retry" button.
- **Rate limited**: Toast: "You're doing this too quickly. Please wait before trying again."

**Verification Landing Page** (`/verify-email?token=<token>`):
- Standalone page (not inside settings layout). Minimal branding: Codeplane logo, centered content card.
- **Loading state**: Spinner with text: "Verifying your email address..."
- **Success state**: Green checkmark icon. Heading: "Email verified!" Body: "Your email address **{email}** has been successfully verified." Button: "Go to settings" (links to `/settings/emails`). If user is authenticated, also show "Go to dashboard."
- **Expired state**: Warning icon. Heading: "Verification link expired." Body: "This verification link has expired. Please request a new verification email from your settings." Button: "Go to settings."
- **Already used state**: Info icon. Heading: "Already verified." Body: "This email address has already been verified." Button: "Go to settings."
- **Invalid/missing token state**: Error icon. Heading: "Invalid verification link." Body: "This verification link is invalid or malformed. Please check your email for the correct link." Button: "Go to settings."

**Responsive Behavior**:
- Desktop (>=1024px): Two-column layout with sidebar. Email rows show badges and buttons inline.
- Tablet (768-1023px): Two-column layout with narrower sidebar. Badges may wrap below the address.
- Mobile (<768px): Sidebar collapses to top-level navigation. Badges stack below the email address. Action buttons stack vertically.

**Keyboard Accessibility**:
- Tab navigates: email input -> checkbox -> add button -> email rows -> action buttons within each row.
- Enter on "Remove" button opens confirmation dialog. Enter on "Cancel" dismisses it. Enter on "Remove" in dialog executes removal.
- Focus management: after adding an email, focus returns to the email input. After removing, focus moves to the next row (or previous if last).
- Screen reader: email rows use `role="listitem"`, badges use `aria-label` (e.g., "Primary email", "Verified", "Unverified"). Loading skeletons use `aria-busy="true"`.

### API Shape

This UI composes the following API endpoints:

| Action | Method | Endpoint | Auth | Request Body | Success Status |
|--------|--------|----------|------|-------------|----------------|
| List emails | GET | `/api/user/emails` | Required | — | 200 |
| Add email | POST | `/api/user/emails` | Required | `{ "email": string, "is_primary"?: boolean }` | 201 |
| Delete email | DELETE | `/api/user/emails/:id` | Required | — | 204 |
| Send verification | POST | `/api/user/emails/:id/verify` | Required | — | 204 |
| Confirm verification | POST | `/api/user/emails/verify-token` | Not required | `{ "token": string }` | 200 |

**EmailResponse** (common response shape):
```json
{
  "id": "number",
  "email": "string",
  "is_activated": "boolean",
  "is_primary": "boolean",
  "created_at": "string (ISO 8601 UTC)"
}
```

**Error response shape**:
```json
{ "message": "string" }
```

**Error status codes used by this UI**: 400, 401, 404, 409, 410, 422, 429, 500, 501.

### CLI Command

Email management via CLI uses the generic `codeplane api` passthrough:

```bash
# List all emails
codeplane api /api/user/emails

# Add a new email
codeplane api /api/user/emails --method POST -f email=newaddr@example.com

# Add as primary
codeplane api /api/user/emails --method POST -f email=newaddr@example.com -f is_primary=true

# Remove an email
codeplane api /api/user/emails/42 --method DELETE

# Request verification
codeplane api /api/user/emails/42/verify --method POST

# Confirm verification
codeplane api /api/user/emails/verify-token --method POST -f token=<raw_token>
```

A future dedicated `codeplane email` subcommand group may be added for richer tabular output and interactive flows.

### TUI UI

The TUI does not currently have a dedicated email management screen. When added, it should provide:
- A tabular list view: `EMAIL | PRIMARY | VERIFIED | ADDED`.
- Primary email row highlighted with accent color.
- Inline keybinding hints: `a` to add, `d` to delete (with confirmation), `v` to send verification, `p` to set primary.
- Form input for adding emails (text input + checkbox toggle).

### Documentation

- **"Managing your email addresses"** user guide: covers viewing, adding, removing, verifying, and changing primary email from the web settings page and CLI.
- **"Email verification"** guide: explains why verification matters, how the verification flow works, what to do if the link expires.
- **API Reference** entries for all five email endpoints with request/response schemas, error codes, and examples.
- **FAQ entries**: "Can other users see my email addresses?", "What happens if I remove my primary email?", "How many email addresses can I have?", "My verification email didn't arrive — what should I do?"

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Self) | Authenticated (Other User) | Org Admin | Platform Admin |
|--------|-----------|----------------------|---------------------------|-----------|----------------|
| View `/settings/emails` page | Redirect to login | Allowed | No route | No access | Via admin API |
| List own emails | Not allowed | Allowed | Not allowed | Not allowed | Via admin API |
| Add email | Not allowed | Allowed | Not allowed | Not allowed | Not allowed |
| Remove email | Not allowed | Allowed | Not allowed | Not allowed | Not allowed |
| Send verification | Not allowed | Allowed | Not allowed | Not allowed | Not allowed |
| Confirm verification | Allowed (token-based) | Allowed (token-based) | Allowed (token-based) | Allowed (token-based) | Allowed (token-based) |

- User ID is always derived from the authenticated session — never from a URL parameter. This eliminates IDOR by design.
- The verify-token endpoint is intentionally unauthenticated because the user may click the link in a different browser/device.
- Organization admins have no visibility into member email addresses through this surface.

### Rate Limiting

| Endpoint | Limit | Scope | Rationale |
|----------|-------|-------|-----------|
| `GET /api/user/emails` | 5,000/hour | Per user | Standard read limit; may be polled |
| `POST /api/user/emails` | 10/minute | Per user | Prevents email-bombing own account |
| `DELETE /api/user/emails/:id` | 10/10 minutes | Per user | Prevents rapid destructive actions |
| `POST /api/user/emails/:id/verify` | 3/15 minutes | Per user | Prevents email spam via verification |
| `POST /api/user/emails/verify-token` | 20/15 minutes | Per IP | Prevents brute-force token guessing |

All rate-limited responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

### Data Privacy & PII

- Email addresses are PII. The API never returns `lower_email`, `user_id`, or `updated_at` fields.
- Server logs must never log email address values at INFO level or below. Email count may be logged.
- Verification tokens are stored as SHA-256 hashes only — raw tokens are never persisted.
- Token comparison uses constant-time comparison to prevent timing attacks.
- All email-related API responses include `Cache-Control: no-store`.
- The verification landing page does not display the token in the page body; it only submits it to the API.
- HTTPS is required in production for all email-related endpoints and the verification landing page.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `UserEmailSettingsOpened` | User navigates to `/settings/emails` | `user_id`, `client` (web), `referrer_path` |
| `UserEmailsListed` | `GET /api/user/emails` returns 200 | `user_id`, `email_count`, `verified_count`, `has_primary`, `client` |
| `UserEmailAdded` | `POST /api/user/emails` returns 201 | `user_id`, `is_primary` (boolean), `client` |
| `UserEmailAddFailed` | `POST /api/user/emails` returns 4xx/5xx | `user_id`, `error_status`, `error_reason` (format/conflict/limit), `client` |
| `UserEmailDeleted` | `DELETE /api/user/emails/:id` returns 204 | `user_id`, `was_verified` (boolean), `client` |
| `UserEmailDeleteFailed` | `DELETE /api/user/emails/:id` returns 4xx | `user_id`, `error_status`, `error_reason` (primary/not_found), `client` |
| `UserEmailVerificationSent` | `POST /api/user/emails/:id/verify` returns 204 | `user_id`, `client` |
| `UserEmailVerificationSendFailed` | `POST /api/user/emails/:id/verify` returns 4xx | `user_id`, `error_status`, `error_reason`, `client` |
| `UserEmailVerified` | `POST /api/user/emails/verify-token` returns 200 | `user_id`, `time_to_verify_seconds` (from token creation to confirmation) |
| `UserEmailVerificationFailed` | `POST /api/user/emails/verify-token` returns 4xx | `error_status`, `error_reason` (expired/used/invalid) |
| `UserEmailPrimaryChanged` | Email added with `is_primary: true` and replaces existing primary | `user_id`, `client` |
| `UserEmailVerifyLandingViewed` | User loads `/verify-email` page | `has_token` (boolean), `outcome` (success/expired/used/invalid) |

### Funnel Metrics & Success Indicators

- **Email settings visit rate**: % of active users visiting `/settings/emails` per month. Target: >=10% within 30 days of account creation.
- **Multi-email adoption**: % of users with >1 email address. Target: >10% of active users.
- **Verification completion rate**: % of added emails that reach `is_activated: true` within 48 hours. Target: >80%.
- **Time to verify**: Median time between verification email send and token confirmation. Target: <10 minutes median.
- **Add-to-verify funnel**: % of newly added emails where the user sends verification within 5 minutes of adding. Target: >60%.
- **Verification failure rate**: % of verification attempts that fail (expired, invalid, already used). Target: <15%.
- **Email count distribution**: Histogram of emails per user (1, 2, 3-5, 6-10). Tracked weekly.
- **Client distribution**: Breakdown of email operations by client (web, CLI, API). Helps prioritize client investment.
- **Error rate**: % of all email operations returning 5xx. Target: <0.5%.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Email settings page loaded | DEBUG | `user_id`, `request_id` |
| Email list requested | DEBUG | `user_id`, `request_id` |
| Email list returned | DEBUG | `user_id`, `email_count`, `request_id` |
| Email added | INFO | `user_id`, `email_id`, `is_primary`, `request_id`. NO email address. |
| Email add failed (validation) | WARN | `user_id`, `error_code`, `request_id` |
| Email add failed (conflict) | WARN | `user_id`, `error_code`, `request_id` |
| Email deleted | INFO | `user_id`, `email_id`, `request_id`. NO email address. |
| Email delete rejected (primary) | WARN | `user_id`, `email_id`, `request_id` |
| Verification email requested | INFO | `user_id`, `email_id`, `request_id` |
| Verification email sent | INFO | `user_id`, `email_id`, `request_id`. NO email address, NO token. |
| Verification email send failed | ERROR | `user_id`, `email_id`, `error_message`, `request_id` |
| Verification token submitted | INFO | `request_id`, `client_ip`. NO token value. |
| Verification confirmed | INFO | `user_id`, `email_id`, `request_id` |
| Verification failed (expired) | WARN | `request_id`, `client_ip` |
| Verification failed (already used) | WARN | `request_id`, `client_ip` |
| Verification failed (invalid token) | WARN | `request_id`, `client_ip` |
| Auth failure on email endpoint | WARN | `request_id`, `client_ip`, `auth_method` |
| Rate limit hit | WARN | `user_id` or `client_ip`, `endpoint`, `retry_after_seconds`, `request_id` |
| Unexpected error | ERROR | `user_id`, `request_id`, `error_message`, `stack_trace`, `response_time_ms` |

**Rules**: NEVER log email addresses at INFO or WARN (PII). At DEBUG level, email addresses may be logged for development only. NEVER log raw verification tokens at any level. All entries MUST include `request_id`.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_emails_list_total` | Counter | `status` (200/401/429/500) | Total email list requests |
| `codeplane_user_emails_list_duration_seconds` | Histogram | — | List request latency. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_user_emails_add_total` | Counter | `status` (201/400/409/422/429/500) | Total email add requests |
| `codeplane_user_emails_add_duration_seconds` | Histogram | — | Add request latency |
| `codeplane_user_emails_delete_total` | Counter | `status` (204/400/404/429/500) | Total email delete requests |
| `codeplane_user_emails_verify_send_total` | Counter | `status` (204/400/404/422/429/501) | Total verification send requests |
| `codeplane_user_emails_verify_confirm_total` | Counter | `status` (200/400/404/409/410/429) | Total verification confirm requests |
| `codeplane_user_emails_verify_confirm_duration_seconds` | Histogram | — | Verification confirm latency |
| `codeplane_user_emails_count` | Gauge | — | Average emails per user (periodic background job) |
| `codeplane_user_emails_unverified_ratio` | Gauge | — | Ratio of unverified to total emails (periodic) |
| `codeplane_user_emails_rate_limited_total` | Counter | `endpoint` | Total rate-limited requests across all email endpoints |

### Alerts

#### Alert: `UserEmailAddHighErrorRate`
**Condition**: `rate(codeplane_user_emails_add_total{status=~"5.."}[5m]) / rate(codeplane_user_emails_add_total[5m]) > 0.05`
**Severity**: Warning
**Runbook**:
1. Check ERROR logs filtered by `request_id` for failing add requests.
2. Verify database connectivity — the upsert CTE is the most complex email query; failures often indicate DB issues.
3. Check if the `email_addresses` table is locked by a migration.
4. Check for unique constraint violations in Postgres logs (unexpected schema state).
5. If transient, monitor for 5 more minutes. If persistent, restart server and investigate connection pool.
6. Escalate to database team if upstream.

#### Alert: `UserEmailListHighErrorRate`
**Condition**: `rate(codeplane_user_emails_list_total{status="500"}[5m]) / rate(codeplane_user_emails_list_total[5m]) > 0.05`
**Severity**: Warning
**Runbook**:
1. Check server ERROR logs for the failing requests.
2. Verify database connectivity — email list is a simple SELECT.
3. Check if `email_addresses` table is accessible and not locked.
4. If transient (pool exhaustion), wait 5 min. If persistent, restart and investigate pool settings.
5. Check if a recent migration affected the schema.

#### Alert: `UserEmailVerificationSendHighFailureRate`
**Condition**: `rate(codeplane_user_emails_verify_send_total{status=~"5.."}[5m]) > 5`
**Severity**: Critical
**Runbook**:
1. Check if the endpoint is still returning 501 (unimplemented). If so, this is expected and the alert threshold should be adjusted.
2. If implemented, check email delivery service connectivity (e.g., Resend API key, SendGrid status).
3. Check for token creation failures in database logs.
4. Verify the `email_verification_tokens` table exists and is writable.
5. Check email service rate limits (provider-side).
6. If delivery service is down, page email service provider and temporarily disable verification UI button with a maintenance message.

#### Alert: `UserEmailVerificationBruteForce`
**Condition**: `rate(codeplane_user_emails_verify_confirm_total{status=~"4.."}[5m]) > 50`
**Severity**: Warning
**Runbook**:
1. Check source IP distribution in access logs for verify-token failures.
2. If concentrated from few IPs, apply temporary IP-level blocking.
3. Verify rate limiting is functioning (20/15min per IP).
4. Check if tokens are being enumerated (sequential patterns in logged request IDs).
5. Escalate to security if rate exceeds 200/5min.

#### Alert: `UserEmailDeleteHighRate`
**Condition**: `rate(codeplane_user_emails_delete_total{status="204"}[5m]) > 20`
**Severity**: Info
**Runbook**:
1. May indicate account cleanup or abuse.
2. Identify users performing bulk deletes from access logs.
3. Verify rate limiting is functional.
4. No immediate action unless combined with other suspicious activity.

#### Alert: `UserEmailHighLatency`
**Condition**: `histogram_quantile(0.99, rate(codeplane_user_emails_add_duration_seconds_bucket[5m])) > 1.0`
**Severity**: Warning
**Runbook**:
1. Check database query latency for the `upsertEmailAddress` CTE.
2. Verify indexes on `email_addresses(user_id)` and `email_addresses(lower_email)`.
3. Check for table bloat or vacuum backlog.
4. Review overall database load and connection pool saturation.
5. If isolated, check for lock contention from concurrent primary-email swaps.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | Detection | Recovery |
|-------------|-------------------|-----------|----------|
| Database unavailable | 500 error; UI shows error banner with retry | `status=500` counter spike | Automatic retry; health check |
| Database timeout | 500 after timeout; UI shows error with retry | Latency histogram alert | Retry; investigate if persistent |
| Email delivery service down | Verification send returns 500; UI shows error toast | Verify send 5xx counter | Page provider; disable verify button with message |
| Auth cookie expired | 401; UI redirects to login | Normal 401 counter | User re-authenticates |
| Unique constraint violation (race) | 409 conflict; UI shows duplicate error | Normal 409 counter | User informed; no action needed |
| Max emails reached | 422; UI disables add form | Normal 422 counter | User removes an email first |
| Primary email delete attempt | 400; UI prevents via hidden button | Normal 400 counter | Expected behavior |
| Expired verification token | 410; landing page shows expired state | Expired token counter | User requests new verification |
| Used verification token | 409; landing page shows already-verified state | Used token counter | No action needed |
| Rate limited | 429 with Retry-After; UI shows cooldown toast | Rate limit counter | Wait and retry |
| Service registry not initialized | 500 on startup | `status=500` on all email endpoints | Restart server |
| Token hash collision (astronomically unlikely) | Wrong email verified | Manual audit log review | Investigate; invalidate tokens |

## Verification

### API Integration Tests

| # | Test | Method / Setup | Expected |
|---|------|----------------|----------|
| 1 | List emails for authenticated user | `GET /api/user/emails` with valid PAT | 200, JSON array |
| 2 | Each email has required fields | Parse response | Every element has `id`, `email`, `is_activated`, `is_primary`, `created_at` |
| 3 | No internal fields exposed | Parse response | No `lower_email`, `user_id`, `updated_at` |
| 4 | `created_at` is valid ISO 8601 | Parse each `created_at` | Valid Date parse |
| 5 | `id` is a positive integer | Parse each `id` | > 0 and integer |
| 6 | At least one email for signed-up user | `GET /api/user/emails` | Array length >= 1 |
| 7 | Primary email appears first | User with 3+ emails | First element `is_primary: true` |
| 8 | Exactly one primary email | User with multiple emails | Count of `is_primary: true` is exactly 1 |
| 9 | Non-primary sorted by `created_at` ASC | User with 3+ emails | After primary, each `created_at` >= previous |
| 10 | Unauthenticated returns 401 | `GET /api/user/emails` no auth | 401 |
| 11 | Invalid PAT returns 401 | `Authorization: token garbage` | 401 |
| 12 | Add email returns 201 | `POST /api/user/emails` with valid email | 201 with email object |
| 13 | Added email appears in list | Add then list | New email present |
| 14 | Added email is unverified | Add then list | `is_activated: false` |
| 15 | Added email is non-primary by default | Add without `is_primary` | `is_primary: false` |
| 16 | Add with `is_primary: true` demotes old primary | Add primary, then list | New email is primary; old is not |
| 17 | Add duplicate email to same user (upsert) | Add same email twice | Second call succeeds, no duplicate in list |
| 18 | Add email owned by another user returns 409 | Create user A email, user B adds same | 409 |
| 19 | Add email with invalid format returns 422 | `POST` with `email: "notanemail"` | 422 |
| 20 | Add email with empty string returns 422 | `POST` with `email: ""` | 422 |
| 21 | Add email with only whitespace returns 422 | `POST` with `email: "   "` | 422 |
| 22 | Add email at 254 characters succeeds | Generate 254-char valid email | 201 |
| 23 | Add email at 255 characters fails | Generate 255-char email | 422 |
| 24 | Add 11th email fails (max 10) | Add 10 emails, then add 11th | 422 or 409 |
| 25 | Add email with `+` alias succeeds | `user+test@example.com` | 201 |
| 26 | Add email with mixed casing preserves case | `User@EXAMPLE.COM` | Returned `email` field matches casing |
| 27 | Case-insensitive duplicate detection | Add `user@example.com` then `USER@example.com` | Second is upsert or conflict |
| 28 | Delete non-primary email returns 204 | Add email, then `DELETE /api/user/emails/:id` | 204 |
| 29 | Deleted email absent from list | Delete then list | Deleted email not in array |
| 30 | Delete primary email returns 400 | `DELETE` on primary email ID | 400 |
| 31 | Delete email belonging to other user returns 404 | User A tries to delete user B's email | 404 |
| 32 | Delete non-existent email returns 404 | `DELETE /api/user/emails/999999` | 404 |
| 33 | Send verification returns 204 (or 501 if stub) | `POST /api/user/emails/:id/verify` | 204 or 501 |
| 34 | Send verification on already-verified email returns 422 | Verify already-activated email | 422 |
| 35 | Confirm verification with valid token returns 200 | Generate token, then confirm | 200 with email object |
| 36 | Confirm verification with expired token returns 410 | Use expired token | 410 |
| 37 | Confirm verification with used token returns 409 | Use token twice | 409 |
| 38 | Confirm verification with invalid token returns 404 | `POST` with `token: "garbage"` | 404 |
| 39 | Confirm verification with missing token returns 400 | `POST` with empty body | 400 |
| 40 | Emails from user A never appear in user B's list | Two users each list | Isolation confirmed |
| 41 | Content-Type is `application/json` on all responses | Check headers | Starts with `application/json` |
| 42 | Rate limit returns 429 with `Retry-After` header | Exceed add rate limit | 429, header present |
| 43 | Full lifecycle: add -> verify -> set primary -> remove old primary -> list | Multi-step | Each step succeeds, final list correct |

### CLI E2E Tests

| # | Test | Command | Expected |
|---|------|---------|----------|
| 44 | List emails via CLI | `codeplane api /api/user/emails` | Exit 0, valid JSON array |
| 45 | CLI list requires auth | `codeplane api /api/user/emails` (no token) | Non-zero exit |
| 46 | Add email via CLI | `codeplane api /api/user/emails --method POST -f email=cli@test.com` | Exit 0, 201 response |
| 47 | Delete email via CLI | `codeplane api /api/user/emails/<id> --method DELETE` | Exit 0, 204 response |
| 48 | Round-trip: add, list, delete, list | Sequential commands | Email appears after add, gone after delete |
| 49 | CLI JSON output has correct field types | Parse output | Each field matches expected type |

### Web UI E2E Tests (Playwright)

| # | Test | Expected |
|---|------|----------|
| 50 | Navigate to `/settings/emails` while authenticated | Page loads with "Email addresses" heading |
| 51 | Settings sidebar highlights "Emails" | Sidebar nav item has active styling |
| 52 | Email list displays at least one email | At least one email row visible |
| 53 | Primary email has "Primary" badge | Primary row has badge element with text "Primary" |
| 54 | Verified email has "Verified" badge | Verified rows show green badge |
| 55 | Unverified email has "Unverified" indicator | Unverified rows show amber indicator |
| 56 | Each email row shows the email address | Each row contains email string text |
| 57 | Each email row shows the added date | Each row shows date string |
| 58 | Primary email appears first | First email row has "Primary" badge |
| 59 | Loading state shows skeletons | Skeleton elements visible before data |
| 60 | Add email form is visible | Input and "Add email" button present |
| 61 | Add email with valid address | Type email, click add -> Toast "Email address added", new row appears |
| 62 | Add email form clears after success | After successful add -> Input is empty |
| 63 | Add email with invalid format shows error | Type "notanemail", click add -> Inline error message visible |
| 64 | Add email with empty input shows error | Click add with empty input -> Inline error message visible |
| 65 | Add button disabled when input empty | No text in input -> Button has disabled attribute |
| 66 | Add button shows spinner during submission | Click add with valid email -> Spinner visible on button |
| 67 | "Set as primary" checkbox works | Check box, add email -> New email has "Primary" badge |
| 68 | Remove button visible on non-primary emails | Inspect non-primary rows -> "Remove" button present |
| 69 | Remove button hidden on primary email | Inspect primary row -> No "Remove" button |
| 70 | Remove shows confirmation dialog | Click "Remove" -> Dialog with email address text visible |
| 71 | Cancel removal dismisses dialog | Click "Cancel" in dialog -> Dialog closes, email still present |
| 72 | Confirm removal removes email from list | Click "Remove" in dialog -> Email row disappears, success toast |
| 73 | "Send verification" visible on unverified emails | Inspect unverified rows -> Button present |
| 74 | "Send verification" hidden on verified emails | Inspect verified rows -> Button not present |
| 75 | Click "Send verification" shows toast | Click button -> "Verification email sent" toast |
| 76 | "Send verification" enters cooldown after click | Click button -> Button disabled/shows "Sent" state |
| 77 | Navigate to `/settings/emails` unauthenticated | Visit page -> Redirected to login |
| 78 | Error state with retry on API failure | Simulate 500 -> Error banner with "Retry" button |
| 79 | Click "Retry" refetches email list | Click retry after error -> List loads (or re-errors) |
| 80 | Verification landing page — success state | Visit `/verify-email?token=<valid>` -> "Email verified!" heading, email address shown |
| 81 | Verification landing page — expired state | Visit with expired token -> "Verification link expired" heading |
| 82 | Verification landing page — already used state | Visit with used token -> "Already verified" heading |
| 83 | Verification landing page — missing token | Visit `/verify-email` without token param -> "Invalid verification link" heading |
| 84 | Verification landing page — invalid token | Visit with `token=garbage` -> "Invalid verification link" heading |
| 85 | Responsive: mobile layout stacks elements | Viewport < 768px -> Badges and buttons stack vertically |
| 86 | Keyboard navigation: tab through form and list | Tab key -> Focus moves through input -> checkbox -> button -> rows |
| 87 | Screen reader: email rows have accessible labels | Inspect ARIA -> `role="listitem"` and `aria-label` on badges |
| 88 | Max emails: form disabled at 10 | User with 10 emails -> Add form disabled with message |
| 89 | Server 409 on duplicate: inline error shown | Add email owned by another user -> Error message displayed |
| 90 | "Set primary" button on verified non-primary | Click "Set primary" -> Primary badge moves, toast shown |

### Boundary and Stress Tests

| # | Test | Expected |
|---|------|----------|
| 91 | User with 10 emails (max) — all render in correct order | 10 rows visible, primary first |
| 92 | Email at exactly 254 characters renders without truncation | Full address visible in row |
| 93 | Email at 255 characters rejected client-side | Validation error shown before API call |
| 94 | Concurrent add requests (5 parallel with same email) | Exactly one email in final list (no duplicates) |
| 95 | Concurrent delete + list requests | List never returns deleted email after delete completes |
| 96 | Response time < 200ms for list with 10 emails | Latency assertion |
| 97 | Rate limit hit on add shows 429 toast | Exceed 10/min -> Toast with retry message |
| 98 | Rate limit hit on verification send shows cooldown | Exceed 3/15min -> Toast with retry message |
| 99 | Email with 3-character minimum (e.g., `a@b`) accepted | 201 |
| 100 | Email with 2-character string rejected | 422 |

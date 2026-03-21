# USER_EMAIL_LIST

Specification for USER_EMAIL_LIST.

## High-Level User POV

Your email addresses are a core part of your Codeplane identity. They connect your commits to your account, enable notifications, and serve as a recovery mechanism. The email list feature lets you see every email address associated with your account, understand which one is your primary address, and know which addresses have been verified.

When you navigate to the email settings page in the web UI, you see a clean, organized list of all your email addresses. Each entry shows the address itself, whether it is your primary email, and whether it has been activated (verified). Your primary email is clearly marked — it is the one used for notifications, commit attribution, and account recovery. Verified addresses show a confirmation badge, while unverified addresses display a visual indicator that verification is still pending.

From the CLI, you can list your emails with `codeplane api /api/user/emails` and see the same information in JSON format. This makes it easy to audit your email configuration programmatically or from a terminal-first workflow. A future dedicated `codeplane email list` subcommand may provide a richer tabular output, but the current product surface is the generic API passthrough command with structured output filtering.

The email list is always sorted consistently: your primary email appears first, followed by remaining addresses in the order they were added. This ensures that the most important address is always immediately visible, regardless of how many addresses you have associated with your account.

The email list is a private view — only you (and platform admins through separate admin surfaces) can see which email addresses are on your account. Other users never see your email list. This respects privacy while still letting you manage your identity across multiple email addresses.

The list is the starting point for all email management actions. From here you can see the verification status of every address, understand which address Codeplane is using for notifications and commit attribution, and decide whether to add new addresses, remove old ones, or re-verify an address that hasn't been confirmed yet. The list is always up to date — if you add or remove an address in another client (the CLI or API), the list reflects that immediately when refreshed.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can retrieve their own email list via `GET /api/user/emails`.
- [ ] The response is a JSON array of email objects, each containing `id`, `email`, `is_activated`, `is_primary`, and `created_at`.
- [ ] The list is sorted with primary email first, then by `created_at` ascending.
- [ ] The web UI settings page at `/settings/emails` displays the email list with status badges for primary and activation state.
- [ ] The CLI command `codeplane api /api/user/emails` outputs the raw JSON response.
- [ ] Unauthenticated requests return 401 with no email data leaked.
- [ ] An account with a single email address returns a one-element array.
- [ ] An account with multiple email addresses returns all of them in the correct sort order.
- [ ] The response payload does not include internal-only fields (`lower_email`, `updated_at`, `user_id`).
- [ ] All clients (web, CLI) display consistent information for each email address.

### Functional Criteria

- [ ] The response body is always a JSON array, even if the user has only one email address.
- [ ] Each email object contains exactly the fields: `id` (number), `email` (string), `is_activated` (boolean), `is_primary` (boolean), `created_at` (ISO 8601 string).
- [ ] The `id` field is a positive integer unique across all email records.
- [ ] The `email` field contains the email address as originally provided (not lowercased).
- [ ] The `is_primary` field is `true` for exactly one email in the list (when the list is non-empty).
- [ ] The `is_activated` field reflects whether the email has been verified.
- [ ] The `created_at` field is a valid ISO 8601 timestamp in UTC.
- [ ] The response never includes emails belonging to other users.
- [ ] The response does not include soft-deleted email records.
- [ ] The endpoint returns 200 with an empty array `[]` if the user has no email addresses (defensive edge case).
- [ ] The response Content-Type header is `application/json`.

### Edge Cases

- [ ] A user with exactly one email address (which is primary and activated) sees a single-element list.
- [ ] A user who signed up via GitHub OAuth and has never added additional emails sees the GitHub-provided email.
- [ ] A user with the maximum number of email addresses (10) receives all 10 in the response.
- [ ] A user whose primary email is NOT activated sees `is_primary: true` and `is_activated: false` on that entry.
- [ ] Email addresses with international characters in the local part (e.g., `ñ@example.com`) are returned exactly as stored.
- [ ] Email addresses with `+` aliases (e.g., `user+codeplane@example.com`) are returned correctly.
- [ ] Email addresses at subdomains (e.g., `user@mail.example.co.uk`) are returned correctly.
- [ ] Emails added with mixed casing (e.g., `User@EXAMPLE.COM`) are returned with the original casing, not lowercased.
- [ ] If two emails were added at the exact same `created_at` timestamp, the sort order is deterministic.
- [ ] A freshly added but unverified email shows `is_activated: false`.
- [ ] The endpoint is idempotent — calling it multiple times returns the same data (assuming no mutations).
- [ ] Very long email addresses (up to 254 characters per RFC 5321) are returned without truncation.
- [ ] If the user has exactly zero email records (exceptional), the endpoint returns `[]` — not `null`, not an error.

### Boundary Constraints

- [ ] Maximum emails per user: 10. Enforced at add-email, not at listing.
- [ ] `email` string: 1–254 characters (per RFC 5321). No truncation at list time.
- [ ] `id` field: positive integer.
- [ ] `created_at` field: valid ISO 8601 datetime string in UTC.
- [ ] `is_primary`: boolean, exactly one entry `true` when list is non-empty.
- [ ] `is_activated`: boolean.
- [ ] Response payload bounded by ~3.5 KB (10 emails × ~350 bytes). No pagination needed.
- [ ] Request has no body (GET). Any body content is ignored.
- [ ] All string values UTF-8 encoded.
- [ ] No query parameters accepted. Unknown query parameters silently ignored.

## Design

### Web UI Design

**Route**: `/settings/emails` — accessible from the user settings sidebar under "Emails".

**Layout**:

- **Page Title**: "Email addresses" at the top of the settings content area.
- **Description Text**: "Manage email addresses associated with your account. Your primary email is used for notifications and commit attribution."
- **Email List**:
  - Each email is displayed as a row in a card-style list.
  - Each row contains:
    - The email address in monospace or semi-bold text.
    - A "Primary" badge (solid accent color, e.g., blue pill) displayed inline next to the primary email.
    - A "Verified" badge (green outline with checkmark) or "Unverified" indicator (amber/orange outline with warning icon) displayed inline.
    - The `created_at` date displayed as a human-friendly relative format (e.g., "Added Jan 15, 2025") with tooltip showing the full ISO timestamp.
    - Action buttons contextual to the email (e.g., "Request verification", "Remove") — part of sibling features but the list must render the correct state for them to attach to.
  - The primary email row is visually distinguished (subtle background highlight or top-border accent).
- **Empty State**: "No email addresses configured." with a call-to-action to add an email.
- **Loading State**: Skeleton placeholder rows (3 rows with shimmer animation).
- **Error State**: Inline error banner: "Failed to load email addresses. Please try again." with a "Retry" button.

**Keyboard Accessibility**: Tab navigates through email list rows and action buttons. Each email row can be focused for screen reader announcement.

**Responsive Behavior**: On narrow viewports, badges stack below the email address.

### API Shape

**Endpoint**: `GET /api/user/emails`

**Authentication**: Required (session cookie or `Authorization: token <PAT>`).

**Request**: No query parameters. No request body.

**Success Response** (`200 OK`):
```json
[
  {
    "id": 1,
    "email": "alice@example.com",
    "is_activated": true,
    "is_primary": true,
    "created_at": "2025-01-15T10:30:00.000Z"
  },
  {
    "id": 7,
    "email": "alice-work@company.org",
    "is_activated": false,
    "is_primary": false,
    "created_at": "2025-06-20T14:12:33.000Z"
  }
]
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique numeric identifier for the email record |
| `email` | string | The email address as originally provided |
| `is_activated` | boolean | Whether the email has been verified |
| `is_primary` | boolean | Whether this is the user's primary email |
| `created_at` | string | ISO 8601 UTC timestamp when the email was added |

**Sort Order**: Primary email first (`is_primary DESC`), then by `created_at ASC`.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| 500 | Internal server error | `{ "message": "internal server error" }` |

### SDK Shape

The `UserService` class in `@codeplane/sdk` exposes:

```typescript
listEmails(userID: number): Promise<Result<EmailResponse[], APIError>>
```

The `EmailResponse` type:
```typescript
interface EmailResponse {
  id: number;
  email: string;
  is_activated: boolean;
  is_primary: boolean;
  created_at: string;
}
```

The SDK method accepts a numeric user ID, returns `Result<EmailResponse[], APIError>`, maps database rows to the `EmailResponse` interface, and does not accept pagination parameters.

### CLI Command

Emails are listed via the generic API command:

```bash
codeplane api /api/user/emails
```

**Output**: JSON array printed to stdout. Exit code `0` on success, non-zero on error.

Structured output filtering applies: users can pipe through `--json` field filters per standard CLI behavior.

A future dedicated `codeplane email list` subcommand may be added, but the current product surface is the generic `api` command.

### TUI UI

The TUI does not currently have a dedicated email management screen. The email list is accessible via the generic API flow. If a TUI email screen is added in the future, it should mirror the web UI layout adapted for terminal rendering: tabular format (`EMAIL | PRIMARY | VERIFIED | ADDED`) with primary email row highlighted.

### Neovim Plugin API

The Neovim plugin does not expose a direct email list command but provides `:Codeplane status` (shows primary email in status output) and `:Codeplane dashboard` (opens web UI for email settings).

### VS Code Extension

The VS Code extension provides a status bar item showing the authenticated user's username (email not shown for privacy) and `codeplane.openSettings` command to open the web UI settings.

### Documentation

- **"Managing your email addresses"** guide: viewing emails from web settings and CLI, what primary email is used for, verified vs unverified meaning, sort order explanation.
- **API Reference**: `GET /api/user/emails` with full response schema, error codes, sort order, and authentication requirements.
- **FAQ**: "Where do my email addresses come from?" and "Can other users see my email addresses?"

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Self) | Authenticated (Other) | Org Admin | Platform Admin |
|--------|-----------|----------------------|-----------------------|-----------|----------------|
| List own emails (`GET /api/user/emails`) | ❌ | ✅ | ❌ | ❌ | ✅ (via admin API) |

- Only the authenticated user can list their own emails via `/api/user/emails`.
- There is no mechanism to list another user's emails through this endpoint.
- The user ID is derived from the authenticated session, not from a URL parameter. There is no path-based user targeting, which eliminates IDOR risk by design.
- Organization admins cannot access a member's email list through this endpoint.
- Platform admin users can view any user's emails through the admin API (`/api/admin/users/:id`), which is a separate feature surface.

### Rate Limiting

- **Authenticated users**: Subject to the standard authenticated rate limit (5,000 requests/hour). Email listing is a read-only operation and may be polled by clients.
- **Unauthenticated callers**: Subject to the standard unauthenticated rate limit (60 requests/hour) — they will hit 401 before meaningful data is returned, but the rate limit still applies to prevent auth-probing floods.
- **Burst tolerance**: Up to 10 requests in a 5-second window, then throttled.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in every response.
- Exceeding the rate limit returns `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- Email addresses are PII. The endpoint MUST only return emails belonging to the authenticated user.
- The response MUST NOT include the `lower_email` internal field, the `user_id` field, or the `updated_at` timestamp — these are internal-only.
- Server logs MUST NOT log email address values at INFO level or below. Email list access may be logged at DEBUG level with the user ID, but actual email strings should be omitted or redacted in production.
- The endpoint MUST be excluded from any public API caching layer. The response MUST include `Cache-Control: no-store` or equivalent header.
- The `email_count` (number of emails returned) may be logged at INFO level as it is useful for monitoring without exposing PII.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `UserEmailsListed` | `GET /api/user/emails` returns 200 | `user_id`, `email_count` (number of emails returned), `verified_count` (number with `is_activated: true`), `has_primary` (boolean), `client` (web/cli/tui/api) |
| `UserEmailListFailed` | `GET /api/user/emails` returns 4xx/5xx | `user_id` (nullable if 401), `client`, `error_status` (401/429/500) |
| `UserEmailSettingsOpened` | User navigates to `/settings/emails` in Web UI | `user_id`, `client` (web), `referrer_path` (where the user navigated from) |

### Funnel Metrics & Success Indicators

- **Email settings visit rate**: Percentage of active users who visit the email settings page at least once per month. Baseline: ~5% of active users. Target discoverability: at least 10% of active users visit within 30 days of account creation.
- **Multi-email adoption**: Percentage of users with more than one email address. Target: >10% of active users.
- **Email count distribution**: Histogram of how many emails users typically have (1, 2, 3+). If most users have exactly 1, the add-email flow may be underused.
- **Verification gap**: Percentage of listed emails that are unverified (`is_activated: false`). A high ratio (>30%) suggests the verification flow is broken or unclear.
- **Client distribution**: Breakdown of email list requests by client (web vs CLI vs raw API). Helps prioritize client investment.
- **Error rate**: Percentage of email list requests returning non-200 responses. Target: <0.5% (excluding 401 from unauthenticated callers).
- **P99 latency**: Target under 100ms.
- **Zero cross-user email leakage**: Verified via audit log and test.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|
| Email list requested | DEBUG | `user_id`, `request_id`. Do NOT log email addresses. |
| Email list returned | DEBUG | `user_id`, `email_count`, `request_id`. Count only, no PII. |
| Email list auth failure | WARN | `request_id`, `client_ip`, `auth_method` (cookie/pat/none). Potential probe attempt. |
| Email list rate limited | WARN | `user_id`, `request_id`, `client_ip`, `retry_after_seconds` |
| Email list service error | ERROR | `user_id`, `request_id`, `error_code`, `error_message`, `stack_trace`, `response_time_ms` |
| Email list unexpected error | ERROR | `user_id`, `request_id`, `error_message`, `stack_trace` |

**Rules**: NEVER log email addresses at INFO or WARN level (PII). At DEBUG level, email addresses may be logged for development only. All log entries MUST include `request_id` for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_emails_list_total` | Counter | `status` (200/401/429/500) | Total email list requests by response status |
| `codeplane_user_emails_list_duration_seconds` | Histogram | — | Request duration. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_user_emails_count` | Gauge | — | Average emails per user (updated periodically via background job) |
| `codeplane_user_emails_list_rate_limited_total` | Counter | — | Total rate-limited email list attempts |

### Alerts

#### Alert: `UserEmailListHighErrorRate`
**Condition**: `rate(codeplane_user_emails_list_total{status="500"}[5m]) / rate(codeplane_user_emails_list_total[5m]) > 0.05`
**Severity**: Warning
**Runbook**:
1. Check server ERROR logs filtered by `request_id` for the failing requests.
2. Verify database connectivity — the email list query is a simple SELECT; failures usually indicate a DB connection issue.
3. Check if the `email_addresses` table is accessible and not locked by a migration.
4. If transient (e.g., connection pool exhaustion), monitor for 5 more minutes. If persistent, restart the server process and investigate connection pool settings.
5. Check if a recent schema migration affected the `email_addresses` table.
6. If errors are isolated to specific user IDs, check for data corruption.
7. Escalate to the database team if upstream.

#### Alert: `UserEmailListHighLatency`
**Condition**: `histogram_quantile(0.99, rate(codeplane_user_emails_list_duration_seconds_bucket[5m])) > 0.5`
**Severity**: Warning
**Runbook**:
1. Check database query latency for the `listUserEmails` query. Run `EXPLAIN ANALYZE`.
2. Verify that the index on `email_addresses(user_id)` exists and is not bloated.
3. Check for table bloat or vacuum backlog on the `email_addresses` table.
4. If elevated for specific users, check for unusually large email record counts.
5. If systemic, check overall database load and connection pool saturation.
6. Review server CPU and memory metrics.

#### Alert: `UserEmailListAuthFailureSpike`
**Condition**: `rate(codeplane_user_emails_list_total{status="401"}[5m]) > 50`
**Severity**: Info
**Runbook**:
1. May indicate credential-stuffing or enumeration attempt.
2. Check source IP distribution in logs for auth failure entries.
3. If concentrated from few IPs, consider temporary IP-level rate limiting.
4. Verify legitimate clients aren't misconfigured with expired tokens.
5. No immediate action unless rate exceeds 500/5m, then escalate to security.

#### Alert: `UserEmailListRateLimitSpike`
**Condition**: `rate(codeplane_user_emails_list_rate_limited_total[5m]) > 10`
**Severity**: Warning
**Runbook**:
1. Identify source user(s) from access logs.
2. Determine if traffic is from legitimate polling client or abuse.
3. For legitimate polling, advise reducing frequency.
4. For abuse, consider additional IP-based restrictions.
5. Check if a recent client deployment introduced an aggressive polling loop.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | Detection | Recovery |
|-------------|-------------------|-----------|----------|
| Database unavailable | Return 500 with `{ "message": "internal server error" }`. Log ERROR. | `status=500` counter spike | Automatic retry; server health check |
| Database timeout on SELECT | Return 500 after timeout. Log ERROR. | Latency histogram p99 alert | Retry; investigate if persistent |
| User row deleted between auth and email fetch | Return `[]`. Log WARN. | Unusual 0-count in email count histogram | Investigate user deletion path |
| Auth cookie/token expired or revoked | Return 401. No service call. | Normal 401 counter | User re-authenticates |
| Auth middleware misconfiguration | Return 401 for all requests. | Mass 401 alert | Restart server, check middleware |
| Service registry not initialized | Return 500 (null reference). Log ERROR. | `status=500` on startup | Restart server, check startup logs |
| Email table schema mismatch after migration | Return 500. Log ERROR. | `status=500` spike after deployment | Roll back migration or fix schema |
| Rate limited | Return 429 with `Retry-After`. | Rate limit counter | Wait and retry |

## Verification

### API Integration Tests

| # | Test Description | Method / Setup | Expected |
|---|-----------------|----------------|----------|
| 1 | List emails for authenticated user | `GET /api/user/emails` with valid PAT | 200, response is a JSON array |
| 2 | Each email object has required fields | `GET /api/user/emails` | Every element has `id` (number), `email` (string), `is_activated` (boolean), `is_primary` (boolean), `created_at` (string) |
| 3 | No extra/internal fields in email objects | `GET /api/user/emails` | No element contains `lower_email`, `user_id`, or `updated_at` keys |
| 4 | `created_at` is a valid ISO 8601 timestamp | `GET /api/user/emails` | Every `created_at` value can be parsed as a valid Date |
| 5 | `id` is a positive integer | `GET /api/user/emails` | Every `id` is > 0 and is an integer |
| 6 | At least one email exists for a signed-up user | `GET /api/user/emails` | Array length >= 1 |
| 7 | Primary email appears first in the list | `GET /api/user/emails` (user with multiple emails) | First element has `is_primary: true` |
| 8 | Exactly one email has `is_primary: true` | `GET /api/user/emails` (user with multiple emails) | Exactly one element with `is_primary: true` |
| 9 | Non-primary emails sorted by `created_at` ascending | `GET /api/user/emails` (user with 3+ emails) | After primary, each `created_at` >= previous |
| 10 | Unauthenticated request returns 401 | `GET /api/user/emails` with no auth header | 401, no email data in body |
| 11 | Request with invalid PAT returns 401 | `GET /api/user/emails` with `Authorization: token garbage` | 401 |
| 12 | Request with expired/revoked PAT returns 401 | `GET /api/user/emails` with expired token | 401 |
| 13 | Newly added email appears in subsequent list | `POST /api/user/emails` then `GET /api/user/emails` | New email present with correct value |
| 14 | Newly added email shows `is_activated: false` | Add email then list | New entry has `is_activated: false` |
| 15 | Newly added non-primary email shows `is_primary: false` | Add email without `is_primary: true` then list | New entry has `is_primary: false` |
| 16 | Deleted email does not appear in subsequent list | Add email, delete it, then list | Deleted email absent from array |
| 17 | Idempotent — calling list twice returns same data | Two sequential `GET /api/user/emails` | Both responses identical |
| 18 | Response does not contain `lower_email` field | `GET /api/user/emails` | No `lower_email` key on any element |
| 19 | Email with `+` alias returned correctly | Add `user+test@example.com`, then list | Email value exactly `user+test@example.com` |
| 20 | Email with mixed casing preserved | Add `User@EXAMPLE.COM`, then list | Email value is `User@EXAMPLE.COM`, not lowercased |
| 21 | Email at a subdomain returned correctly | Add `user@mail.example.co.uk`, then list | Email value exactly `user@mail.example.co.uk` |
| 22 | Maximum valid email length (254 chars) returned without truncation | Add 254-char email, then list | Email has length 254 and matches |
| 23 | Email longer than 254 chars rejected at add, not in list | Attempt 255-char email add, then list | Add returns error; list excludes it |
| 24 | User with 10 emails (maximum) returns all 10 | Add emails to reach 10, then list | Array length is 10 |
| 25 | Response body is a bare JSON array | `GET /api/user/emails` | Response starts with `[`, not wrapped |
| 26 | GET request ignores any body content | `GET /api/user/emails` with body | 200, normal list returned |
| 27 | Emails belonging to other users never returned | Two users each list own emails | Each response only contains own emails |
| 28 | Response is deterministic across multiple calls | Call list 5 times | All responses identical |
| 29 | Content-Type header is `application/json` | `GET /api/user/emails` | Header starts with `application/json` |
| 30 | Session cookie auth works | `GET /api/user/emails` with cookie auth | 200 with same schema |

### CLI E2E Tests

| # | Test Description | Command | Expected |
|---|-----------------|---------|----------|
| 31 | List emails via CLI API passthrough | `codeplane api /api/user/emails` | Exit 0, stdout is valid JSON array |
| 32 | CLI list requires authentication | `codeplane api /api/user/emails` (no token) | Exit code non-zero |
| 33 | JSON output has correct field types | `codeplane api /api/user/emails` | Each element has correct field types |
| 34 | Round-trip lifecycle: add, list, delete, list | POST add, GET list, DELETE, GET list | Email appears after add, disappears after delete |

### Web UI E2E Tests (Playwright)

| # | Test Description | Expected |
|---|-----------------|----------|
| 35 | Navigate to `/settings/emails` while authenticated | Page loads with "Email addresses" heading |
| 36 | Email list displays at least one email | At least one email row visible |
| 37 | Primary email has a "Primary" badge | Primary email row has badge element |
| 38 | Verified email has a "Verified" badge | Verified rows show verification badge |
| 39 | Unverified email has an "Unverified" indicator | Unverified rows show indicator |
| 40 | Each email row displays the email address | Each row contains email string |
| 41 | Each email row displays the added date | Each row shows date/relative timestamp |
| 42 | Primary email appears first in the list | First email row has "Primary" badge |
| 43 | Loading state shows skeleton/spinner | Skeleton or spinner visible before data loads |
| 44 | Settings sidebar highlights "Emails" | Sidebar nav item is visually active |
| 45 | Error state displays retry option | On simulated 500, error message with retry shown |
| 46 | Navigate to `/settings/emails` while unauthenticated | Redirected to login |
| 47 | After adding a new email, refresh shows it in list | New email present in rendered list |

### Boundary and Load Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 48 | User with 10 emails — all returned in correct order | Array length 10; primary first; ascending `created_at` |
| 49 | Email at max valid length (254 chars) returned correctly | 254-char email present and not truncated |
| 50 | Email exceeding 254 chars — add rejected, not in list | Add returns error; list excludes it |
| 51 | Concurrent list requests (5 parallel) return consistent results | All 5 responses identical |
| 52 | Response time under 200ms for user with 5 emails | Latency assertion passes |
| 53 | Response time under 200ms for user with 10 emails (max) | Latency assertion passes |
| 54 | Exceeding rate limit returns 429 with Retry-After header | 429, header present with valid integer |

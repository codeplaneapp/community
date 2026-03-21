# AUTH_CLOSED_ALPHA_IDENTITY_ENFORCEMENT

Specification for AUTH_CLOSED_ALPHA_IDENTITY_ENFORCEMENT.

## High-Level User POV

When a Codeplane instance is operating in closed alpha mode, access to the platform is restricted exclusively to users who have been explicitly invited. This creates a controlled, invite-only environment where the instance operator can manage exactly who is allowed to sign in and use the product.

From a prospective user's perspective, the journey begins at a waitlist. Anyone — even without an existing Codeplane account — can submit their email address to request access. They provide their email and optionally a short note explaining why they'd like access. After submitting, they see a confirmation that their request is pending. There is no promise of a timeline; access is granted at the discretion of the instance administrators.

When an administrator approves a waitlist request, the user's email is added to the whitelist. Alternatively, administrators can directly add any identity — an email address, a username, or a wallet address — to the whitelist without requiring the person to have joined the waitlist first. This gives operators flexibility for direct invitations, partner onboarding, or team bootstraps.

Once a user's identity is on the whitelist, they can sign in through any supported authentication method — GitHub OAuth or key-based wallet authentication. The system checks all of the user's known identities (username, email addresses, wallet address) against the whitelist. If any single identity matches, access is granted. If none match, the user sees a clear error indicating that closed alpha access requires a whitelist invite. The user is never left wondering why sign-in failed; the messaging is explicit about the invite requirement.

Administrators are always exempt from whitelist checks — they can sign in regardless of whether they appear on the whitelist. This ensures that operators never accidentally lock themselves out of their own instance.

The closed alpha gate is a platform-wide toggle. When the instance operator has not enabled it, every authentication flow behaves normally with no whitelist checks. When enabled, the gate applies uniformly across all sign-in methods and all client surfaces — web, CLI, TUI, desktop, and editor integrations all rely on the same underlying auth enforcement.

This feature provides value during early product rollouts, private betas, or controlled deployments where the operator needs to manage growth, collect feedback from a curated audience, or ensure infrastructure can handle load before opening access broadly.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- A Codeplane instance with `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true` blocks all non-whitelisted, non-admin users from completing any sign-in flow.
- Whitelisted users can sign in through every supported auth method.
- Administrators can manage the whitelist and waitlist through API, CLI, and admin UI.
- The public waitlist join endpoint works without authentication.
- All clients display a meaningful error when sign-in is blocked by the closed alpha gate.

### Core Constraints

- [ ] When `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED` is not set or set to any value other than `"true"`, no whitelist enforcement occurs and all sign-in flows behave normally.
- [ ] When closed alpha is enabled, a user whose identities do not appear in the whitelist receives HTTP 403 with message `"closed alpha access requires a whitelist invite"`.
- [ ] When closed alpha is enabled, a user with `isAdmin=true` bypasses all whitelist checks and can always sign in.
- [ ] The whitelist check applies at sign-in time for both new account creation and existing account login.
- [ ] For GitHub OAuth sign-in, the system checks the user's GitHub username and all associated GitHub email addresses against the whitelist.
- [ ] For key-based (wallet) sign-in, the system checks the wallet address, username, and email against the whitelist.
- [ ] If any single identity matches a whitelist entry, access is granted (logical OR across identities).
- [ ] Identity matching is case-insensitive for all identity types (email, username, wallet).
- [ ] Whitelist entries are deduplicated by `(identity_type, lower_identity_value)` — adding a duplicate identity upserts rather than creating a second entry.

### Waitlist Constraints

- [ ] The public waitlist join endpoint requires no authentication.
- [ ] Waitlist email must contain an `@` character.
- [ ] Waitlist email is stored in both original and lowercase-normalized forms.
- [ ] Submitting a waitlist entry for an already-approved email preserves the `approved` status and does not reset it to `pending`.
- [ ] Submitting a waitlist entry with an empty note for an email that already has a note preserves the existing note.
- [ ] Submitting a waitlist entry for an email that is already `pending` updates the source and note (if non-empty) but keeps the status as `pending`.
- [ ] Waitlist entry `status` must be one of: `pending`, `approved`, `rejected`.
- [ ] The `source` field should default to `"cli"` when submitted via CLI and should be a free-form tag up to 255 characters.

### Whitelist Constraints

- [ ] Whitelist identity types must be one of: `email`, `wallet`, `username`.
- [ ] Email identities must contain an `@` character; invalid emails are rejected.
- [ ] Wallet identities must be exactly 42 characters, start with `0x`, and contain only hex characters after the prefix.
- [ ] Username identities are normalized to lowercase; no format restrictions beyond non-empty.
- [ ] Empty identity type or empty identity value is rejected.
- [ ] Removing a whitelist entry that does not exist is idempotent (returns success, no error).

### Boundary Constraints

- [ ] Email identity value: maximum 254 characters (per RFC 5321).
- [ ] Username identity value: maximum 255 characters.
- [ ] Wallet identity value: exactly 42 characters.
- [ ] Waitlist note field: maximum 1000 characters.
- [ ] Waitlist source field: maximum 255 characters.
- [ ] Waitlist email field: maximum 254 characters.
- [ ] Empty string for email, identity type, or identity value must be rejected.

### Edge Cases

- [ ] A user who was whitelisted and later removed from the whitelist can still use existing sessions but cannot create new sessions.
- [ ] A user signing in with GitHub OAuth who has multiple email addresses — if any one is whitelisted, access is granted.
- [ ] A suspended user (`prohibitLogin=true`) is rejected with "account is suspended" even if whitelisted — suspension takes precedence over whitelist status.
- [ ] Approving a waitlist entry that does not exist returns an appropriate error (entry not found).
- [ ] The waitlist join endpoint with a duplicate email (same `lower_email`) upserts the existing entry rather than failing.

## Design

### API Shape

#### Public Endpoints (No Authentication Required)

**POST `/api/alpha/waitlist`** — Join the closed alpha waitlist

Request body:
```json
{
  "email": "user@example.com",
  "note": "I'd love to try Codeplane for my team",
  "source": "website"
}
```

Response `201`:
```json
{
  "email": "user@example.com",
  "status": "pending"
}
```

Error responses:
- `400` — Missing or invalid email (no `@`, empty, exceeds 254 chars)
- `429` — Rate limited

#### Admin Endpoints (Admin Authentication Required)

**GET `/api/admin/alpha/whitelist`** — List all whitelist entries

Response `200`:
```json
[
  {
    "id": "uuid",
    "identity_type": "email",
    "identity_value": "user@example.com",
    "lower_identity_value": "user@example.com",
    "created_by": "admin-user-id",
    "created_at": "2026-03-21T00:00:00Z",
    "updated_at": "2026-03-21T00:00:00Z"
  }
]
```

**POST `/api/admin/alpha/whitelist`** — Add a whitelist entry

Request body:
```json
{
  "identity_type": "email",
  "identity_value": "user@example.com"
}
```

Response `201`:
```json
{
  "id": "uuid",
  "identity_type": "email",
  "identity_value": "user@example.com",
  "lower_identity_value": "user@example.com",
  "created_by": "admin-user-id",
  "created_at": "2026-03-21T00:00:00Z",
  "updated_at": "2026-03-21T00:00:00Z"
}
```

Error responses:
- `400` — Invalid identity type, invalid identity value format, or empty values
- `401` — Not authenticated
- `403` — Not an admin

**DELETE `/api/admin/alpha/whitelist/:identity_type/:identity_value`** — Remove a whitelist entry

Response: `204 No Content`

Error responses:
- `401` — Not authenticated
- `403` — Not an admin

**GET `/api/admin/alpha/waitlist`** — List waitlist entries

Query parameters:
- `status` — Filter by status (`pending`, `approved`, `rejected`). Empty string returns all.
- `page` — Page number (default: 1)
- `per_page` — Results per page (default: 50, max: 100)

Response `200`:
```json
{
  "items": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "lower_email": "user@example.com",
      "note": "Interested in trying Codeplane",
      "status": "pending",
      "source": "website",
      "approved_by": null,
      "approved_at": null,
      "created_at": "2026-03-21T00:00:00Z",
      "updated_at": "2026-03-21T00:00:00Z"
    }
  ],
  "total": 42
}
```

**POST `/api/admin/alpha/waitlist/approve`** — Approve a waitlist entry

Request body:
```json
{
  "email": "user@example.com"
}
```

Response `200`:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "status": "approved",
  "approved_by": "admin-user-id",
  "approved_at": "2026-03-21T00:00:00Z"
}
```

Approving a waitlist entry should also automatically add the email to the whitelist.

Error responses:
- `400` — Missing or invalid email
- `401` — Not authenticated
- `403` — Not an admin
- `404` — No waitlist entry found for that email

### CLI Commands

**Public commands (no auth required):**

```
codeplane alpha waitlist join --email <email> [--note <text>] [--source <tag>]
```
- Submits a waitlist request. Outputs the entry status as JSON.
- `--email` is required.
- `--note` defaults to empty string.
- `--source` defaults to `"cli"`.

**Admin commands (requires admin PAT):**

```
codeplane admin alpha waitlist list [--status <pending|approved|rejected>] [--page N] [--per-page N]
```
- Lists waitlist entries. Supports JSON output filtering.

```
codeplane admin alpha waitlist approve --email <email>
```
- Approves a specific waitlist entry by email.

```
codeplane admin alpha whitelist add --type <email|wallet|username> --value <identity>
```
- Adds an identity to the whitelist.

```
codeplane admin alpha whitelist list
```
- Lists all whitelist entries.

```
codeplane admin alpha whitelist remove --type <email|wallet|username> --value <identity>
```
- Removes a whitelist entry. Idempotent.

All CLI commands support `--json` structured output.

### Web UI Design

**Waitlist Page (`/waitlist`):**
- A simple public-facing page with a form: email input, optional note textarea, and a submit button.
- On successful submission, display a "Thank you" confirmation with the user's email and a message that they'll be notified when access is granted.
- On error (invalid email, rate limit), display an inline error message.
- No authentication required to view or submit.

**Thank You Page (`/waitlist/thank-you`):**
- Displayed after successful waitlist submission.
- Shows a confirmation message and sets expectations (no guaranteed timeline).

**Admin Alpha Access UI (`/admin/alpha`):**
- **Waitlist Tab**: Paginated table of waitlist entries showing email, note, source, status, submitted date, and approved date. Filter by status. "Approve" action button on pending entries.
- **Whitelist Tab**: Table of whitelist entries showing identity type, identity value, created by, and created date. "Add entry" form with identity type dropdown and value text input. "Remove" action per entry with confirmation.

**Sign-in Error State:**
- When a non-whitelisted user attempts to sign in and is rejected, the login page should display: "Access to this instance requires an invitation. If you haven't already, you can join the waitlist."
- Include a link to the `/waitlist` page.

### SDK Shape

The `AuthService` interface and `DatabaseAuthService` class in `@codeplane/sdk` expose:

- `enforceClosedBetaForUser(user, extraIdentities)` — internal method, checks whitelist for user identities, throws 403 if not allowed.
- `isAnyClosedBetaIdentityWhitelisted(identities)` — internal method, returns boolean.

These are consumed internally by `verifyKeyAuth` and `handleGitHubOAuthCallback` — not exposed as public SDK API.

The alpha access SQL layer (`alpha_access_sql.ts`) provides:
- `addWhitelistEntry` / `removeWhitelistEntry` / `listWhitelistEntries` / `isWhitelistedIdentity`
- `upsertWaitlistEntry` / `getWaitlistEntryByLowerEmail` / `listWaitlistEntries` / `countWaitlistEntries` / `approveWaitlistEntryByLowerEmail`

### TUI UI

No dedicated TUI screen is required for alpha access management. Admin alpha operations are handled through the CLI. The TUI should surface the same sign-in error message when closed alpha enforcement blocks access.

### Documentation

The following end-user documentation should be written:

1. **Self-Hosting Guide — Closed Alpha Mode**: How to enable closed alpha mode via `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=true`, what it does, and when to use it.
2. **Admin Guide — Managing the Waitlist**: How to view, filter, and approve waitlist entries via the admin UI and CLI.
3. **Admin Guide — Managing the Whitelist**: How to add, list, and remove whitelist entries via the admin UI and CLI. Include the three identity types and their format requirements.
4. **User Guide — Joining the Waitlist**: How to request access to a closed alpha Codeplane instance via the web form or CLI.
5. **FAQ — "Why can't I sign in?"**: Troubleshooting page explaining that the instance may be in closed alpha mode, how to check, and how to request access.

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| Join waitlist | Anonymous (no auth) |
| View waitlist page | Anonymous (no auth) |
| Sign in (subject to whitelist check) | Any identity with whitelisted credentials |
| List whitelist entries | Admin |
| Add whitelist entry | Admin |
| Remove whitelist entry | Admin |
| List waitlist entries | Admin |
| Approve waitlist entry | Admin |
| Bypass whitelist check on sign-in | Admin (automatic) |

### Rate Limiting

- **POST `/api/alpha/waitlist`**: Strict rate limiting — maximum 5 requests per IP per minute, 20 per IP per hour. This is a public, unauthenticated endpoint and must be protected against abuse.
- **Admin whitelist/waitlist endpoints**: Standard authenticated rate limits (matching the platform default for admin routes).
- **Sign-in endpoints with whitelist check**: No additional rate limiting beyond existing auth rate limits. The whitelist check is a lightweight operation within an already rate-limited flow.

### Data Privacy

- **PII exposure**: Waitlist entries contain email addresses and optional notes. The waitlist list endpoint is admin-only and must never be exposed publicly. Whitelist entries may contain email addresses, usernames, or wallet addresses — all PII.
- **Whitelist response payloads**: The `identity_value` in whitelist list responses should be returned in full to admins (they need to see what they've whitelisted), but must never leak to non-admin API consumers.
- **Waitlist notes**: Notes may contain free-form user text. They should be treated as user-submitted content and sanitized for display in admin UIs (XSS prevention).
- **Audit trail**: The `created_by` field on whitelist entries and `approved_by` on waitlist entries provide an audit trail of who granted access. This data should be preserved and not be deletable independently.
- **Log redaction**: Email addresses and wallet addresses must not be logged at `info` level or below. They may appear in `debug` level logs in non-production environments. In production, log the identity type and a truncated hash of the identity value.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `WaitlistJoinRequested` | User submits waitlist form | `email_domain`, `source`, `has_note`, `is_duplicate` |
| `WaitlistEntryApproved` | Admin approves a waitlist entry | `approved_by_user_id`, `time_to_approval_hours`, `source` |
| `WhitelistEntryAdded` | Admin adds a whitelist entry | `identity_type`, `added_by_user_id`, `via` (api/cli/ui) |
| `WhitelistEntryRemoved` | Admin removes a whitelist entry | `identity_type`, `removed_by_user_id`, `via` (api/cli/ui) |
| `ClosedAlphaSignInBlocked` | Non-whitelisted user attempts sign-in | `auth_method` (github/wallet), `identity_types_checked_count` |
| `ClosedAlphaSignInAllowed` | Whitelisted user successfully passes gate | `auth_method`, `matching_identity_type` |
| `ClosedAlphaAdminBypassed` | Admin bypasses whitelist check | `auth_method`, `user_id` |

### Properties Detail

- `email_domain`: The domain portion of the waitlist email (e.g., `"example.com"`). Never log the full email in analytics.
- `source`: The source tag from the waitlist submission.
- `has_note`: Boolean, whether the user provided a note.
- `is_duplicate`: Boolean, whether this email already had a waitlist entry.
- `time_to_approval_hours`: Difference between `created_at` and `approved_at` in hours.
- `identity_types_checked_count`: How many identity candidates were checked before the decision.
- `matching_identity_type`: Which identity type matched (`email`, `wallet`, or `username`).
- `auth_method`: The authentication method used (`github`, `wallet`).
- `via`: The client surface used (`api`, `cli`, `ui`).

### Funnel Metrics & Success Indicators

- **Waitlist-to-Approval Conversion Rate**: % of waitlist entries that reach `approved` status. Track trend over time.
- **Median Time to Approval**: Median hours between waitlist submission and admin approval. Lower is better for user experience.
- **Whitelist Hit Rate**: % of sign-in attempts that pass the whitelist check vs. are blocked. A decreasing hit rate might indicate the whitelist is stale or incomplete.
- **Blocked Sign-In Rate**: Count of `ClosedAlphaSignInBlocked` events per day. Spikes indicate either organic demand or potential abuse.
- **Waitlist Submission Rate**: Count of `WaitlistJoinRequested` per day, segmented by `source`. Indicates demand and marketing channel effectiveness.
- **Admin Engagement**: Frequency of admin interactions with waitlist/whitelist management. Low engagement may indicate the feature is forgotten or the approval flow is too manual.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------||
| Closed alpha enforcement triggered | `info` | `user_id`, `auth_method`, `identity_count`, `result` (allowed/blocked) |
| Whitelist check performed | `debug` | `identity_type`, `identity_hash` (truncated SHA256 of value), `found` |
| Waitlist entry created | `info` | `email_domain`, `source`, `is_duplicate` |
| Waitlist entry approved | `info` | `approved_by`, `entry_id`, `email_domain` |
| Whitelist entry added | `info` | `identity_type`, `identity_hash`, `created_by` |
| Whitelist entry removed | `info` | `identity_type`, `identity_hash`, `removed_by` |
| Invalid identity normalization | `warn` | `identity_type`, `reason` (missing_at, invalid_wallet_length, empty_value) |
| Closed alpha config loaded | `info` | `enabled` (boolean) — logged once at startup |
| Whitelist check SQL error | `error` | `identity_type`, `error_message`, `stack` |

### Prometheus Metrics

**Counters:**

- `codeplane_closed_alpha_signin_total{result="allowed|blocked|admin_bypass", auth_method="github|wallet"}` — Total sign-in attempts subject to closed alpha enforcement, partitioned by outcome and auth method.
- `codeplane_waitlist_submissions_total{source, is_duplicate}` — Total waitlist submission attempts.
- `codeplane_waitlist_approvals_total` — Total waitlist approvals.
- `codeplane_whitelist_entries_added_total{identity_type}` — Total whitelist additions.
- `codeplane_whitelist_entries_removed_total{identity_type}` — Total whitelist removals.
- `codeplane_closed_alpha_identity_check_errors_total` — Total errors during whitelist identity lookups.

**Gauges:**

- `codeplane_waitlist_entries_pending` — Current count of pending waitlist entries.
- `codeplane_whitelist_entries_count{identity_type}` — Current count of whitelist entries by type.

**Histograms:**

- `codeplane_closed_alpha_check_duration_seconds` — Duration of the whitelist check within a sign-in flow.
- `codeplane_waitlist_approval_time_hours` — Histogram of time between waitlist submission and approval.

### Alerts

#### Alert: `ClosedAlphaHighBlockRate`
- **Condition**: `rate(codeplane_closed_alpha_signin_total{result="blocked"}[5m]) > 10`
- **Severity**: Warning
- **Description**: More than 10 blocked sign-in attempts per 5 minutes.

**Runbook:**
1. Check `codeplane_closed_alpha_signin_total{result="blocked"}` dashboard for the spike pattern.
2. If the spike correlates with a known marketing event or announcement, this is expected — verify the waitlist is accessible and consider batch-approving entries.
3. If the pattern looks like automated probing (same IP, high frequency), check access logs for the source IP and consider adding IP-level rate limiting.
4. If legitimate users are repeatedly blocked, verify the whitelist contains their current identities.
5. Resolve by acknowledging if expected, or escalating to security if abuse is suspected.

#### Alert: `ClosedAlphaCheckErrors`
- **Condition**: `rate(codeplane_closed_alpha_identity_check_errors_total[5m]) > 0`
- **Severity**: Critical
- **Description**: Whitelist identity check is failing at the database level. Users may be unable to sign in even if whitelisted.

**Runbook:**
1. Check the `codeplane_closed_alpha_identity_check_errors_total` counter and correlate with database health metrics.
2. Inspect server logs for `error` level entries from the whitelist check code path.
3. Verify `alpha_whitelist_entries` table exists and is accessible.
4. If the database is unreachable, follow the standard database recovery runbook.
5. If the table is missing, run database migrations.
6. If the error is transient, consider increasing pool size or restarting the server.
7. As an immediate mitigation, consider temporarily disabling closed alpha (`CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=false`) to unblock all sign-ins.

#### Alert: `WaitlistBacklogGrowing`
- **Condition**: `codeplane_waitlist_entries_pending > 100` sustained for 24 hours
- **Severity**: Info
- **Description**: The pending waitlist backlog has exceeded 100 entries for over 24 hours.

**Runbook:**
1. Check the admin panel or run `codeplane admin alpha waitlist list --status pending`.
2. Notify the instance administrators that the waitlist needs attention.
3. If this is intentional (slow rollout), acknowledge the alert.
4. If admins are unaware, consider setting up a daily digest notification.

#### Alert: `ClosedAlphaCheckLatency`
- **Condition**: `histogram_quantile(0.99, codeplane_closed_alpha_check_duration_seconds) > 0.5`
- **Severity**: Warning
- **Description**: The 99th percentile of whitelist check duration exceeds 500ms.

**Runbook:**
1. Check database query performance for `alpha_whitelist_entries` lookups.
2. Verify the index on `(identity_type, lower_identity_value)` exists and is being used.
3. Check if the whitelist table has grown unexpectedly large.
4. Check for database connection pool contention.
5. If a single user has an unusually large number of identities, investigate the sign-in payload.

### Error Cases and Failure Modes

| Error Case | Behavior | HTTP Status |
|------------|----------|-------------|
| Closed alpha enabled, user not whitelisted | Sign-in rejected | 403 |
| Closed alpha enabled, database unreachable for whitelist check | Sign-in fails with internal error | 500 |
| Waitlist submission with invalid email (no `@`) | Submission rejected | 400 |
| Waitlist submission with empty email | Submission rejected | 400 |
| Waitlist submission rate limited | Submission rejected | 429 |
| Admin whitelist add with unknown identity type | Normalization fails, entry rejected | 400 |
| Admin whitelist add with invalid wallet format | Normalization fails, entry rejected | 400 |
| Admin waitlist approve for non-existent email | Not found | 404 |
| Admin endpoint accessed by non-admin | Access denied | 403 |
| Admin endpoint accessed by unauthenticated user | Unauthorized | 401 |
| Whitelist remove for non-existent entry | Idempotent success | 204 |

## Verification

### API Integration Tests

#### Waitlist Join (Public)

- [ ] **Successful waitlist join**: POST `/api/alpha/waitlist` with valid email returns `201` with `status: "pending"`.
- [ ] **Waitlist join without auth**: POST `/api/alpha/waitlist` with no auth header returns `201` (public endpoint).
- [ ] **Waitlist join with note**: POST with `email` + `note` + `source` returns all fields correctly.
- [ ] **Waitlist join missing email**: POST with empty body returns `400`.
- [ ] **Waitlist join empty email**: POST with `email: ""` returns `400`.
- [ ] **Waitlist join invalid email (no @)**: POST with `email: "notanemail"` returns `400`.
- [ ] **Waitlist join email at max length (254 chars)**: POST with a 254-character valid email succeeds.
- [ ] **Waitlist join email exceeding max length (255+ chars)**: POST with a 255-character email returns `400`.
- [ ] **Waitlist join duplicate email**: POST twice with the same email returns `201` both times; second entry is an upsert, not a duplicate.
- [ ] **Waitlist join duplicate with updated note**: POST twice — first with note "A", then with note "B" — verify the entry now has note "B".
- [ ] **Waitlist join duplicate with empty note preserves original**: POST with note "A", then POST with `note: ""` — verify note remains "A".
- [ ] **Waitlist join for already-approved email preserves approval**: Approve an entry, then POST waitlist join again — verify status remains `approved`.
- [ ] **Waitlist join rate limiting**: Send 6 rapid requests from the same context — verify the 6th returns `429`.
- [ ] **Waitlist join with source field**: POST with `source: "marketing-page"` returns the source in the response.
- [ ] **Waitlist join note at max length (1000 chars)**: POST with a 1000-character note succeeds.
- [ ] **Waitlist join note exceeding max length (1001 chars)**: POST with a 1001-character note returns `400`.
- [ ] **Waitlist join source at max length (255 chars)**: POST with a 255-character source succeeds.
- [ ] **Waitlist join source exceeding max length (256 chars)**: POST with a 256-character source returns `400`.

#### Admin Waitlist Management

- [ ] **List waitlist entries (admin)**: GET `/api/admin/alpha/waitlist` with admin auth returns `200` with items array.
- [ ] **List waitlist entries filtered by status**: GET with `?status=pending` returns only pending entries.
- [ ] **List waitlist entries filtered by "approved"**: GET with `?status=approved` returns only approved entries.
- [ ] **List waitlist entries no filter**: GET with no status filter returns all entries regardless of status.
- [ ] **List waitlist entries pagination**: Submit 5 entries, GET with `?page=1&per_page=2` returns 2 items; `?page=2&per_page=2` returns next 2.
- [ ] **List waitlist entries per_page capped at 100**: GET with `?per_page=200` returns at most 100 entries.
- [ ] **List waitlist entries unauthenticated**: GET without auth returns `401`.
- [ ] **List waitlist entries non-admin**: GET with non-admin token returns `403`.
- [ ] **Approve waitlist entry**: POST `/api/admin/alpha/waitlist/approve` with valid email returns `200` with `status: "approved"`.
- [ ] **Approve waitlist entry adds to whitelist**: After approving, verify the email appears in whitelist list.
- [ ] **Approve waitlist entry non-existent email**: POST with unknown email returns `404`.
- [ ] **Approve waitlist entry unauthenticated**: POST without auth returns `401`.
- [ ] **Approve waitlist entry non-admin**: POST with non-admin token returns `403`.
- [ ] **Approve already-approved entry**: POST approve for already-approved email is idempotent, returns `200`.
- [ ] **Count waitlist entries**: Verify total count is accurate after additions and approvals.

#### Admin Whitelist Management

- [ ] **Add whitelist entry (email)**: POST `/api/admin/alpha/whitelist` with `identity_type: "email"`, `identity_value: "user@example.com"` returns `201`.
- [ ] **Add whitelist entry (username)**: POST with `identity_type: "username"`, `identity_value: "johndoe"` returns `201`.
- [ ] **Add whitelist entry (wallet)**: POST with `identity_type: "wallet"`, `identity_value: "0x" + 40 hex chars` returns `201`.
- [ ] **Add whitelist entry invalid type**: POST with `identity_type: "phone"` returns `400`.
- [ ] **Add whitelist entry empty type**: POST with `identity_type: ""` returns `400`.
- [ ] **Add whitelist entry empty value**: POST with `identity_value: ""` returns `400`.
- [ ] **Add whitelist entry invalid email (no @)**: POST with email type and value `"notanemail"` returns `400`.
- [ ] **Add whitelist entry invalid wallet (wrong length)**: POST with wallet `"0x123"` returns `400`.
- [ ] **Add whitelist entry invalid wallet (not hex)**: POST with wallet `"0x" + 40 'g' chars` returns `400`.
- [ ] **Add whitelist entry invalid wallet (no 0x prefix)**: POST with wallet `42 hex chars without 0x` returns `400`.
- [ ] **Add whitelist entry case-insensitive dedup**: POST email `"User@Example.com"`, then POST `"user@example.com"` — only one entry exists.
- [ ] **Add whitelist entry unauthenticated**: POST without auth returns `401`.
- [ ] **Add whitelist entry non-admin**: POST with non-admin token returns `403`.
- [ ] **List whitelist entries**: GET `/api/admin/alpha/whitelist` returns array of all entries ordered by creation date descending.
- [ ] **List whitelist entries unauthenticated**: GET without auth returns `401`.
- [ ] **List whitelist entries non-admin**: GET with non-admin token returns `403`.
- [ ] **Remove whitelist entry**: DELETE `/api/admin/alpha/whitelist/email/user@example.com` returns `204`.
- [ ] **Remove whitelist entry idempotent**: DELETE an entry that doesn't exist returns `204` (not `404`).
- [ ] **Remove whitelist entry unauthenticated**: DELETE without auth returns `401`.
- [ ] **Remove whitelist entry non-admin**: DELETE with non-admin token returns `403`.

#### Sign-In Enforcement

- [ ] **GitHub OAuth sign-in allowed (whitelisted email)**: With closed alpha enabled, whitelist an email, sign in via GitHub with that email — sign-in succeeds.
- [ ] **GitHub OAuth sign-in allowed (whitelisted username)**: Whitelist a GitHub username, sign in — sign-in succeeds.
- [ ] **GitHub OAuth sign-in blocked**: With closed alpha enabled, attempt GitHub OAuth for a non-whitelisted user — returns `403` with message `"closed alpha access requires a whitelist invite"`.
- [ ] **GitHub OAuth new user blocked**: First-time GitHub OAuth user with no whitelist entry — returns `403`.
- [ ] **GitHub OAuth existing user blocked**: Existing user whose identities were removed from whitelist — returns `403` on new sign-in.
- [ ] **Wallet sign-in allowed**: With closed alpha enabled, whitelist a wallet address, sign in via wallet — sign-in succeeds.
- [ ] **Wallet sign-in blocked**: Attempt wallet sign-in for non-whitelisted address — returns `403`.
- [ ] **Wallet new user blocked**: New wallet user with no whitelist entry — returns `403`.
- [ ] **Admin bypasses whitelist**: Admin user signs in without being on whitelist — succeeds.
- [ ] **Closed alpha disabled**: With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED` not set, non-whitelisted users can sign in normally.
- [ ] **Multiple identities — any match grants access**: User has email on whitelist but username not — sign-in succeeds (email match is sufficient).
- [ ] **Suspended user rejected despite whitelist**: Whitelisted user with `prohibitLogin=true` gets `403` "account is suspended" (not whitelist error).

### CLI Integration Tests

- [ ] **`codeplane alpha waitlist join` success**: Submits waitlist entry, outputs JSON with `status: "pending"`.
- [ ] **`codeplane alpha waitlist join` without auth**: Works without a configured token (public endpoint).
- [ ] **`codeplane alpha waitlist join` missing --email**: Exits with non-zero code and usage error.
- [ ] **`codeplane admin alpha waitlist list`**: Returns paginated list of entries as JSON.
- [ ] **`codeplane admin alpha waitlist list --status pending`**: Returns only pending entries.
- [ ] **`codeplane admin alpha waitlist approve --email <email>`**: Approves entry, outputs JSON with `status: "approved"`.
- [ ] **`codeplane admin alpha whitelist add --type email --value user@example.com`**: Adds entry, outputs JSON.
- [ ] **`codeplane admin alpha whitelist add --type wallet --value 0x...`**: Adds wallet entry.
- [ ] **`codeplane admin alpha whitelist add --type username --value johndoe`**: Adds username entry.
- [ ] **`codeplane admin alpha whitelist list`**: Returns all whitelist entries as JSON array.
- [ ] **`codeplane admin alpha whitelist remove --type email --value user@example.com`**: Removes entry, exits 0.
- [ ] **Non-admin CLI user denied admin commands**: Running admin alpha commands without admin token returns non-zero exit code.

### E2E (Playwright) Tests

- [ ] **Waitlist page renders**: Navigate to `/waitlist`, verify email input and submit button are visible.
- [ ] **Waitlist form submission success**: Fill email, submit, verify redirect to thank-you page or success message.
- [ ] **Waitlist form validation**: Submit with empty email, verify inline error displayed.
- [ ] **Waitlist form invalid email**: Submit with `"notanemail"`, verify error.
- [ ] **Sign-in blocked shows alpha message**: With closed alpha enabled, attempt sign-in as non-whitelisted user — verify error message mentions whitelist invite and links to waitlist.
- [ ] **Admin alpha UI — whitelist tab**: Sign in as admin, navigate to `/admin/alpha`, verify whitelist table renders.
- [ ] **Admin alpha UI — add whitelist entry**: Use form to add email entry, verify it appears in the table.
- [ ] **Admin alpha UI — remove whitelist entry**: Click remove on an entry, confirm, verify it disappears.
- [ ] **Admin alpha UI — waitlist tab**: Switch to waitlist tab, verify pending entries table renders.
- [ ] **Admin alpha UI — approve waitlist entry**: Click approve on a pending entry, verify status changes to "approved".
- [ ] **Admin alpha UI — filter waitlist by status**: Select "pending" filter, verify only pending entries shown.
- [ ] **Non-admin cannot access admin alpha page**: Sign in as regular user, navigate to `/admin/alpha`, verify redirect or 403 page.

### Full Flow E2E Tests

- [ ] **Waitlist-to-sign-in flow**: (1) Submit waitlist via web form, (2) Admin approves via CLI, (3) User signs in via GitHub OAuth — sign-in succeeds.
- [ ] **Whitelist-to-sign-in flow**: (1) Admin adds email to whitelist via API, (2) User signs in with that email via GitHub OAuth — sign-in succeeds.
- [ ] **Revoked access flow**: (1) Admin adds email to whitelist, (2) User signs in successfully, (3) Admin removes email from whitelist, (4) User's existing session still works, (5) User tries to create a new session — blocked with 403.

# PUBLIC_WAITLIST_JOIN

Specification for PUBLIC_WAITLIST_JOIN.

## High-Level User POV

When a Codeplane instance is operating in closed alpha mode, only invited users can sign in and use the platform. For anyone who wants access but hasn't received a direct invite, the waitlist is their front door.

A prospective user discovers the waitlist through the Codeplane marketing site, a link shared by someone on an existing team, or by attempting to sign in and being told the instance is invite-only. They navigate to the waitlist page and see a simple, welcoming form: an email input field, an optional note where they can share why they're interested, and a submit button.

The user types in their email address and optionally writes a short message — perhaps "I'm building a jj-native workflow for my team and would love early access." They click submit, and immediately see a confirmation screen thanking them for their interest and letting them know they'll hear back when access is granted. There is no promise of a timeline, no countdown, and no position-in-queue number — just a clear acknowledgment that their request was received.

If the user accidentally submits twice with the same email, nothing breaks. Their existing entry is updated rather than duplicated. If they come back a week later and submit again with a different note, the new note replaces the old one while everything else stays intact. If they've already been approved, resubmitting doesn't reset their status — they remain approved.

From the CLI, a developer can accomplish the same thing by running a single command: `codeplane alpha waitlist join --email user@example.com`. This is useful for developers who live in the terminal and prefer not to open a browser, or for scripts that register interest on behalf of team members.

The waitlist join flow requires no authentication. It is deliberately open to the public — the entire point is to capture interest from people who do not yet have accounts. The only constraint is that the email must be valid and the request must not be part of an abuse pattern. The system enforces reasonable rate limits to prevent spam without impeding legitimate signups.

This feature provides value by creating a low-friction, high-trust onboarding funnel for closed alpha instances. It gives operators a manageable queue of interested users, provides prospective users a clear path to access, and establishes the email identity that administrators will later approve — automatically whitelisting that email so the user can sign in immediately after approval.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- Any unauthenticated user can submit their email to the waitlist via the web form at `/waitlist` and receive a visible confirmation.
- Any unauthenticated user can submit their email to the waitlist via `codeplane alpha waitlist join --email <email>` and receive a JSON response confirming the submission.
- The public API endpoint `POST /api/alpha/waitlist` accepts submissions, persists them, and returns the correct response without requiring authentication.
- Duplicate email submissions are handled gracefully as upserts across all surfaces.
- Input validation rejects malformed, empty, or oversized payloads with clear error messages.
- Rate limiting prevents abuse of the unauthenticated endpoint.
- All existing E2E tests pass and new tests for this feature are green.

### Core Constraints

- [ ] The `POST /api/alpha/waitlist` endpoint requires no authentication — it is fully public.
- [ ] A valid submission creates a waitlist entry with `status: "pending"`.
- [ ] The response includes at minimum the submitted `email` and the resulting `status`.
- [ ] The `email` field is required and must contain at least one `@` character.
- [ ] The `email` is stored in both its original casing and a lowercase-normalized form for deduplication.
- [ ] The `note` field is optional and defaults to an empty string if omitted.
- [ ] The `source` field is optional. It defaults to `"website"` when submitted via the web UI and `"cli"` when submitted via the CLI.
- [ ] The `source` field is a free-form string tag.

### Upsert and Idempotency Constraints

- [ ] Submitting a waitlist entry for an email that already exists (same `lower_email`) performs an upsert — it does not create a duplicate row.
- [ ] Upserting with a non-empty `note` replaces the existing note.
- [ ] Upserting with an empty `note` (or omitting it) preserves the existing note unchanged.
- [ ] Upserting for an email that is already in `approved` status preserves the `approved` status — it does not reset to `pending`.
- [ ] Upserting for an email that is already in `approved` status preserves the existing `approved_by` and `approved_at` values.
- [ ] Upserting for a `pending` email updates `source` and `note` (if non-empty) but keeps the status as `pending`.
- [ ] The `updated_at` timestamp is refreshed on every upsert regardless of what changed.

### Boundary Constraints

- [ ] `email`: minimum 3 characters (e.g., `a@b`), maximum 254 characters (per RFC 5321).
- [ ] `email`: must contain exactly one or more `@` characters; at minimum one `@` is required.
- [ ] `note`: maximum 1,000 characters. Empty string and omission are both valid.
- [ ] `source`: maximum 255 characters. Empty string and omission are both valid.
- [ ] All three fields reject `null` values — only strings or omission are accepted.

### Edge Cases

- [ ] An email with leading/trailing whitespace is trimmed before validation and storage.
- [ ] An email consisting only of whitespace (after trimming) is rejected as empty.
- [ ] An email of exactly 254 characters is accepted.
- [ ] An email of 255 characters is rejected with HTTP 400.
- [ ] A note of exactly 1,000 characters is accepted.
- [ ] A note of 1,001 characters is rejected with HTTP 400.
- [ ] A source of exactly 255 characters is accepted.
- [ ] A source of 256 characters is rejected with HTTP 400.
- [ ] A request body with no fields at all returns HTTP 400 with a message indicating `email` is required.
- [ ] A request body with `email: ""` returns HTTP 400.
- [ ] A request body with `email: "notanemail"` (no `@`) returns HTTP 400.
- [ ] A request with a non-JSON content type on the body returns HTTP 400 or 415.
- [ ] Concurrent upserts for the same email do not produce duplicate rows or data corruption.
- [ ] Unicode characters in the `note` field are accepted and stored correctly.
- [ ] Unicode characters in the `email` local-part are accepted (internationalized email addresses).
- [ ] The endpoint works regardless of whether the instance has `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED` set to `true` or not — the waitlist is always available for submissions.

## Design

### API Shape

**`POST /api/alpha/waitlist`** — Public, unauthenticated endpoint to join the waitlist.

**Request:**

```
POST /api/alpha/waitlist
Content-Type: application/json

{
  "email": "user@example.com",
  "note": "I'd love early access for my team",
  "source": "website"
}
```

| Field    | Type   | Required | Default | Constraints                        |
|----------|--------|----------|---------|------------------------------------|  
| `email`  | string | Yes      | —       | Must contain `@`, max 254 chars    |
| `note`   | string | No       | `""`    | Max 1,000 chars                    |
| `source` | string | No       | `""`    | Max 255 chars, free-form tag       |

**Success Response — `201 Created`:**

```json
{
  "email": "user@example.com",
  "status": "pending"
}
```

When the email already existed and was `approved`, the status in the response reflects `"approved"`.

**Error Responses:**

| Status | Condition                                   | Body                                                           |
|--------|---------------------------------------------|----------------------------------------------------------------|
| `400`  | Missing `email` field                       | `{ "error": "email is required" }`                            |
| `400`  | Empty `email` (after trim)                  | `{ "error": "email is required" }`                            |
| `400`  | `email` has no `@` character                | `{ "error": "email must be a valid email address" }`          |
| `400`  | `email` exceeds 254 characters              | `{ "error": "email must be at most 254 characters" }`         |
| `400`  | `note` exceeds 1,000 characters             | `{ "error": "note must be at most 1000 characters" }`         |
| `400`  | `source` exceeds 255 characters             | `{ "error": "source must be at most 255 characters" }`        |
| `429`  | Rate limit exceeded                         | `{ "error": "too many requests, please try again later" }`    |

### Web UI Design

**Waitlist Page (`/waitlist`):**

The waitlist page is a public, unauthenticated page with a focused, single-purpose layout:

- **Header**: "Request Access to Codeplane" or equivalent product-branded copy.
- **Subheader**: A brief sentence explaining that this instance is in closed alpha and access is granted on an invite basis.
- **Form fields**:
  - **Email** (required): Standard email input field. Placeholder text: `"you@example.com"`. Client-side validation ensures a non-empty value containing `@` before the form submits. Displays inline error text below the field on validation failure.
  - **Note** (optional): A textarea with placeholder text: `"Tell us why you're interested (optional)"`. Character counter showing `X / 1000` that appears once the user begins typing. The counter text turns red when approaching or exceeding the limit.
- **Submit button**: Labeled "Join Waitlist" or "Request Access". Disabled while the form is submitting (shows a loading spinner). Disabled if client-side validation fails (missing/invalid email).
- **Error state**: If the server returns a `400` or `429`, display the error message inline above or below the form, styled as an alert. The form remains editable so the user can correct and resubmit.
- **Success state**: On a `201` response, the form is replaced with a thank-you confirmation (either in-place or via navigation to `/waitlist/thank-you`).

**Thank You Page / Confirmation State (`/waitlist/thank-you`):**

- **Confirmation heading**: "You're on the list!"
- **Body text**: "We've received your request for access to Codeplane. We'll notify you by email when your access is approved. There's no guaranteed timeline — we're reviewing requests as quickly as we can."
- **Displayed email**: Show the email address the user submitted, lightly styled, so they can confirm it was correct.
- **Secondary action**: A link back to the marketing page or product homepage.
- **No login prompt**: This page should not show a login form or suggest the user try to sign in yet.

**Sign-in Blocked State:**

When a user who is not on the whitelist attempts to sign in and receives a `403` with the closed alpha message:

- The login page should display: "Access to this instance requires an invitation."
- Below the error, display a link: "Haven't been invited yet? Join the waitlist." linking to `/waitlist`.

### CLI Command

```
codeplane alpha waitlist join --email <email> [--note <text>] [--source <tag>]
```

| Flag       | Type   | Required | Default  | Description                          |
|------------|--------|----------|----------|--------------------------------------|
| `--email`  | string | Yes      | —        | Email address to submit              |
| `--note`   | string | No       | `""`     | Optional note for admins             |
| `--source` | string | No       | `"cli"`  | Source tag identifying the channel   |

**Behavior:**

- The CLI trims whitespace from `--email` and `--source` before sending.
- The CLI calls `POST /api/alpha/waitlist` without an `Authorization` header (unauthenticated fetch).
- On success, outputs the JSON response to stdout: `{ "email": "...", "status": "pending" }`.
- On HTTP error, the CLI prints the error message to stderr and exits with a non-zero code.
- The `--email` flag is required; omitting it produces a usage error from the CLI argument parser (not an API call).
- Supports `--json` for structured output filtering consistent with other Codeplane CLI commands.

### SDK Shape

The SDK layer (`@codeplane/sdk`) exposes the following function from `packages/sdk/src/db/alpha_access_sql.ts`:

- **`upsertWaitlistEntry(sql, { email, lowerEmail, note, source })`** — Inserts a new waitlist entry or upserts an existing one. Returns the full entry row including `id`, `email`, `status`, `note`, `source`, and timestamps.

The route handler is responsible for:
1. Parsing and validating the request body.
2. Trimming and normalizing the email to lowercase.
3. Enforcing length constraints on `email`, `note`, and `source`.
4. Calling `upsertWaitlistEntry`.
5. Returning the appropriate `201` response with `email` and `status`.

### Documentation

The following end-user documentation should be written:

1. **"Joining the Waitlist"** — A short guide explaining how to request access to a closed alpha Codeplane instance. Covers both the web form and the CLI command. Includes the purpose of the `note` field and sets expectations about the approval process.

2. **"CLI Reference: `codeplane alpha waitlist join`"** — Command reference page documenting the `--email`, `--note`, and `--source` flags, example usage, and expected output format.

3. **FAQ entry: "I tried to sign in but got an access error"** — Troubleshooting entry explaining that the instance may be in closed alpha mode, what that means, and directing the user to the waitlist page or CLI command.

## Permissions & Security

### Authorization Roles

| Action                          | Required Role  |
|---------------------------------|----------------|
| Submit a waitlist entry (API)   | Anonymous — no authentication required |
| Submit via web form             | Anonymous — no authentication required |
| Submit via CLI                  | Anonymous — no authentication token needed |
| View the `/waitlist` page       | Anonymous |
| View the `/waitlist/thank-you` page | Anonymous |

### Rate Limiting

The `POST /api/alpha/waitlist` endpoint is unauthenticated and public, making it the most abuse-prone surface in the alpha access system. The following rate limits apply:

- **Per-IP short burst**: Maximum **5 requests per minute** per source IP address.
- **Per-IP hourly cap**: Maximum **20 requests per hour** per source IP address.
- **Global sustained cap**: Maximum **200 requests per minute** across all source IPs (protects against distributed abuse or bot swarms).
- **Response on rate limit**: HTTP `429 Too Many Requests` with a `Retry-After` header indicating the number of seconds until the next request will be accepted. Body: `{ "error": "too many requests, please try again later" }`.
- **Web form mitigation**: The web form should not submit if the button is already in a loading state (client-side debounce). This reduces accidental double-submissions before they reach the rate limiter.

### Data Privacy

- **PII captured**: The waitlist entry contains an email address (PII) and an optional free-form note (may contain PII). Both are stored persistently.
- **Email exposure**: The email is returned in the `201` response only to the submitter. It is never exposed publicly via any unauthenticated list endpoint. Only admins can see waitlist entries via the admin endpoints.
- **Note content**: The note is user-supplied free text. It must be sanitized for display in admin UIs (XSS prevention). It should not be logged at `info` level or below.
- **No third-party sharing**: Waitlist emails are never shared with external systems, analytics tools, or third-party services by default.
- **Log redaction**: The full email address must not appear in `info`-level or production logs. Logs should reference the `email_domain` (the part after `@`) and a truncated hash of the full email for correlation.

## Telemetry & Product Analytics

### Key Business Events

| Event Name               | When Fired                                      | Properties                                                                 |
|--------------------------|--------------------------------------------------|----------------------------------------------------------------------------|
| `WaitlistJoinRequested`  | A waitlist entry is successfully created or upserted via `POST /api/alpha/waitlist` | `email_domain`, `source`, `has_note` (boolean), `is_duplicate` (boolean), `client` ("web" | "cli" | "api"), `status_after` ("pending" | "approved") |

### Properties Detail

- **`email_domain`**: The domain portion of the submitted email (e.g., `"example.com"`, `"gmail.com"`). Never log or emit the full email address in analytics events.
- **`source`**: The free-form source tag from the submission (e.g., `"website"`, `"cli"`, `"marketing-page"`, `"partner-link"`).
- **`has_note`**: `true` if the user provided a non-empty note, `false` otherwise. Useful for understanding engagement depth.
- **`is_duplicate`**: `true` if the email already had an existing waitlist entry (upsert path), `false` if this is the first submission for this email. Tracks re-engagement or confusion.
- **`client`**: Identifies which surface originated the submission. Inferred from the `source` field or a request header, not from the user.
- **`status_after`**: The status of the entry after the upsert completes. Normally `"pending"` for new entries, but could be `"approved"` if the email was previously approved and resubmitted.

### Funnel Metrics & Success Indicators

- **Waitlist Submission Rate**: Count of `WaitlistJoinRequested` events per day, segmented by `source`. Indicates demand and measures the effectiveness of marketing channels.
- **Unique Email Submission Rate**: Count of `WaitlistJoinRequested` events where `is_duplicate` is `false` per day. The true new-interest signal.
- **Duplicate Submission Rate**: Ratio of `is_duplicate=true` to total submissions. A high ratio may indicate UX confusion (users unsure whether their submission went through) or a stale approval queue (users re-requesting because they haven't heard back).
- **Note Attachment Rate**: Percentage of submissions where `has_note=true`. Higher rates indicate engaged, high-intent users.
- **Waitlist-to-Approval Conversion Rate**: (Downstream metric) Percentage of waitlist entries that eventually reach `approved` status. Not fired by this feature directly, but depends on this feature creating the entries.
- **Median Time to Approval**: (Downstream metric) Median time between `WaitlistJoinRequested` and the corresponding `WaitlistEntryApproved` event. Tracks operator responsiveness.
- **Form Completion Rate**: (Client-side metric, web only) Percentage of users who land on `/waitlist` and successfully submit the form. Measures form UX effectiveness.

## Observability

### Logging Requirements

| Log Point                                   | Level   | Structured Context                                                           |
|---------------------------------------------|---------|------------------------------------------------------------------------------|
| Waitlist entry created (new email)          | `info`  | `email_domain`, `source`, `is_duplicate: false`                             |
| Waitlist entry upserted (existing email)    | `info`  | `email_domain`, `source`, `is_duplicate: true`, `status_preserved`          |
| Waitlist submission validation failed       | `warn`  | `reason` (e.g., `"missing_email"`, `"invalid_email"`, `"note_too_long"`), `source` |
| Waitlist submission rate limited            | `warn`  | `ip_hash` (truncated SHA256 of source IP), `requests_in_window`             |
| Waitlist upsert database error              | `error` | `email_domain`, `error_message`, `error_code`, `stack`                      |
| Waitlist endpoint called                    | `debug` | `method: "POST"`, `path: "/api/alpha/waitlist"`, `has_email`, `has_note`, `source` |

**Redaction rules:**
- Full email addresses must never appear in `info`-level logs in production. Use `email_domain` and a truncated SHA256 hash for correlation.
- The `note` field content must never be logged (may contain PII or sensitive user text).
- Source IP addresses must be logged as truncated hashes, not raw IPs.

### Prometheus Metrics

**Counters:**

- **`codeplane_waitlist_submissions_total{source, is_duplicate, status_code}`** — Total waitlist submission attempts. Labels: `source` (the source tag from the request body), `is_duplicate` (`"true"` or `"false"`), `status_code` (`"201"`, `"400"`, `"429"`).
- **`codeplane_waitlist_validation_failures_total{reason}`** — Total validation failures on the waitlist endpoint. Labels: `reason` (`"missing_email"`, `"invalid_email"`, `"email_too_long"`, `"note_too_long"`, `"source_too_long"`).
- **`codeplane_waitlist_rate_limited_total`** — Total requests rejected by rate limiting on the waitlist endpoint.
- **`codeplane_waitlist_upsert_errors_total`** — Total database errors during waitlist upsert operations.

**Gauges:**

- **`codeplane_waitlist_entries_pending`** — Current count of waitlist entries in `pending` status. Updated after each successful upsert or approval.

**Histograms:**

- **`codeplane_waitlist_submission_duration_seconds`** — End-to-end latency of the `POST /api/alpha/waitlist` handler, from request receipt to response sent. Bucket boundaries: `0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5`.

### Alerts

#### Alert: `WaitlistSubmissionErrorRate`
- **Condition**: `rate(codeplane_waitlist_upsert_errors_total[5m]) > 0`
- **Severity**: Critical
- **Description**: The waitlist upsert is failing at the database layer. New signups are being lost.

**Runbook:**
1. Check `codeplane_waitlist_upsert_errors_total` for the error rate trend.
2. Correlate with `error`-level logs from the waitlist handler — look for `email_domain` and `error_message`.
3. Verify the `alpha_waitlist_entries` table exists and is writable: run a health query against it.
4. Check database connection pool metrics — are connections exhausted?
5. If the database is unreachable, follow the standard database recovery runbook.
6. If the table schema is missing, run pending migrations.
7. If the issue is transient (e.g., brief connection blip), monitor for auto-recovery and acknowledge the alert if the rate returns to zero.

#### Alert: `WaitlistRateLimitSpike`
- **Condition**: `rate(codeplane_waitlist_rate_limited_total[5m]) > 20`
- **Severity**: Warning
- **Description**: High volume of rate-limited requests on the waitlist endpoint, suggesting abuse or a bot swarm.

**Runbook:**
1. Check the rate-limited request logs for `ip_hash` patterns — is the traffic from a single source or distributed?
2. If from a single IP/range: consider adding the IP to a WAF block list or temporary ban.
3. If distributed: check for patterns in the request payloads (automated form fills, sequential email patterns). Consider adding a CAPTCHA to the web form.
4. If the traffic correlates with a known marketing event or launch announcement, this may be legitimate surge — acknowledge the alert and consider temporarily raising the rate limit.
5. Verify that legitimate users are not being impacted by checking `codeplane_waitlist_submissions_total{status_code="201"}` — if successful submissions are still flowing, the rate limiter is correctly isolating abuse.

#### Alert: `WaitlistHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_waitlist_submission_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Description**: The 99th percentile of waitlist submission latency exceeds 1 second.

**Runbook:**
1. Check database query latency for `alpha_waitlist_entries` upserts.
2. Verify the unique index on `lower_email` exists and is being used by the query planner.
3. Check for table bloat — if the table has grown to millions of rows, consider whether the upsert is triggering excessive index maintenance.
4. Check database connection pool wait time — high latency may indicate pool exhaustion rather than query slowness.
5. If latency is due to network between the application and database, check network metrics.

### Error Cases and Failure Modes

| Error Case                                       | Expected Behavior                                          | HTTP Status |
|--------------------------------------------------|------------------------------------------------------------|-------------|
| `email` field missing from request body          | Rejected with clear validation error                       | `400`       |
| `email` is empty string                          | Rejected with clear validation error                       | `400`       |
| `email` is whitespace only                       | Rejected after trim (treated as empty)                     | `400`       |
| `email` has no `@` character                     | Rejected with email format error                           | `400`       |
| `email` exceeds 254 characters                   | Rejected with length error                                 | `400`       |
| `note` exceeds 1,000 characters                  | Rejected with length error                                 | `400`       |
| `source` exceeds 255 characters                  | Rejected with length error                                 | `400`       |
| Rate limit exceeded                              | Rejected with rate limit error and `Retry-After` header    | `429`       |
| Database unreachable during upsert               | Internal server error logged; user sees generic error      | `500`       |
| Database unique constraint violation (race)      | Handled by upsert ON CONFLICT — no user-facing error       | `201`       |
| Malformed JSON body                              | Request parsing failure                                    | `400`       |
| Non-JSON Content-Type on POST                    | Rejected by JSON mutation enforcement middleware           | `400`/`415` |
| Extremely large request body (DoS attempt)       | Rejected by body size limit middleware before parsing       | `413`       |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **Successful waitlist join with all fields**: `POST /api/alpha/waitlist` with `{ email: "test@example.com", note: "interested", source: "website" }` returns `201` with `{ email: "test@example.com", status: "pending" }`.
- [ ] **Successful waitlist join with only email**: `POST /api/alpha/waitlist` with `{ email: "minimal@example.com" }` returns `201` with `status: "pending"`.
- [ ] **Waitlist join without auth header**: `POST /api/alpha/waitlist` with no `Authorization` header succeeds with `201`.
- [ ] **Waitlist join with an auth header present**: `POST /api/alpha/waitlist` with a valid auth token still succeeds with `201` (endpoint ignores auth gracefully).
- [ ] **Response contains email and status**: Verify the `201` response body has exactly `email` and `status` fields.
- [ ] **Source field is persisted**: Submit with `source: "partner-link"`, then verify via admin list endpoint that the entry has `source: "partner-link"`.
- [ ] **Note field is persisted**: Submit with `note: "my reason"`, then verify via admin list endpoint that the entry has `note: "my reason"`.

#### Upsert Behavior

- [ ] **Duplicate email upsert returns 201**: Submit twice with the same email — both return `201`, not `409` or error.
- [ ] **Duplicate email does not create second row**: Submit twice with the same email, then list via admin — only one entry exists for that email.
- [ ] **Upsert with new note replaces old note**: Submit with `note: "A"`, then submit again with `note: "B"` — verify note is now `"B"`.
- [ ] **Upsert with empty note preserves existing note**: Submit with `note: "A"`, then submit again with `note: ""` — verify note remains `"A"`.
- [ ] **Upsert with omitted note preserves existing note**: Submit with `note: "A"`, then submit again without `note` field — verify note remains `"A"`.
- [ ] **Upsert for approved email preserves approval**: Approve an entry via admin endpoint, then submit waitlist join again with the same email — verify `status` in response is `"approved"`.
- [ ] **Upsert for approved email preserves approved_by and approved_at**: Approve, resubmit, verify via admin list that `approved_by` and `approved_at` are unchanged.
- [ ] **Upsert updates source**: Submit with `source: "cli"`, then submit again with `source: "website"` — verify source is now `"website"`.
- [ ] **Case-insensitive email dedup**: Submit `User@Example.COM`, then submit `user@example.com` — only one entry exists.
- [ ] **Case-insensitive email preserves latest casing**: Submit `User@Example.COM`, then submit `user@example.com` — the stored `email` field reflects `user@example.com`.

#### Validation — Email

- [ ] **Missing email field returns 400**: `POST` with `{}` returns `400`.
- [ ] **Empty email returns 400**: `POST` with `{ email: "" }` returns `400`.
- [ ] **Whitespace-only email returns 400**: `POST` with `{ email: "   " }` returns `400`.
- [ ] **Email without @ returns 400**: `POST` with `{ email: "notanemail" }` returns `400`.
- [ ] **Email at exactly 254 characters is accepted**: Construct a valid 254-char email — returns `201`.
- [ ] **Email at 255 characters is rejected**: Construct a 255-char email — returns `400` with message referencing the 254 character limit.
- [ ] **Email with leading whitespace is trimmed**: Submit `" user@example.com"` — the stored email is `"user@example.com"`.
- [ ] **Email with trailing whitespace is trimmed**: Submit `"user@example.com "` — the stored email is `"user@example.com"`.

#### Validation — Note

- [ ] **Note at exactly 1,000 characters is accepted**: Submit a 1,000-character note — returns `201`.
- [ ] **Note at 1,001 characters is rejected**: Submit a 1,001-character note — returns `400`.
- [ ] **Note with unicode characters is accepted**: Submit a note with emoji and non-ASCII characters — returns `201` and content is preserved.
- [ ] **Note of empty string is accepted**: Submit `{ email: "x@y.com", note: "" }` — returns `201`.

#### Validation — Source

- [ ] **Source at exactly 255 characters is accepted**: Submit a 255-character source — returns `201`.
- [ ] **Source at 256 characters is rejected**: Submit a 256-character source — returns `400`.
- [ ] **Source of empty string is accepted**: Submit `{ email: "x@y.com", source: "" }` — returns `201`.

#### Rate Limiting

- [ ] **Rate limit triggers on burst**: Send 6 requests from the same context within 1 minute — the 6th returns `429`.
- [ ] **Rate limit response includes Retry-After header**: When `429` is returned, the response includes a `Retry-After` header.
- [ ] **Rate-limited requests do not create entries**: After receiving `429`, verify via admin list that no additional entries were created beyond those from the first 5 requests.

#### Content-Type and Body

- [ ] **Non-JSON content type rejected**: `POST` with `Content-Type: text/plain` and a body returns `400` or `415`.
- [ ] **Malformed JSON body rejected**: `POST` with `Content-Type: application/json` and body `{invalid` returns `400`.

### CLI Integration Tests

- [ ] **`codeplane alpha waitlist join --email <email>` succeeds**: Outputs JSON with `email` and `status: "pending"`, exits with code 0.
- [ ] **CLI waitlist join works without configured token**: Run with no stored auth token — still succeeds (public endpoint).
- [ ] **CLI waitlist join with --note and --source**: Run with all flags — verify the note and source are persisted (cross-check via admin list).
- [ ] **CLI waitlist join with --source defaults to "cli"**: Run without `--source` — verify the persisted entry has `source: "cli"`.
- [ ] **CLI waitlist join missing --email exits non-zero**: Run `codeplane alpha waitlist join` without `--email` — exits with non-zero code and prints usage help.
- [ ] **CLI waitlist join with invalid email exits non-zero**: Run with `--email notanemail` — exits non-zero and prints the server error message.
- [ ] **CLI waitlist join supports --json output**: Run with `--json` flag — output is valid parseable JSON.
- [ ] **CLI waitlist join trims email whitespace**: Run with `--email " user@example.com "` — the stored email (verified via admin) is `"user@example.com"`.

### E2E (Playwright) Tests — Web UI

- [ ] **Waitlist page renders correctly**: Navigate to `/waitlist` — verify the email input, note textarea, and submit button are visible and the page is publicly accessible without login.
- [ ] **Successful form submission shows confirmation**: Fill in a valid email, click submit — verify the thank-you message is displayed with the submitted email.
- [ ] **Form submission with note shows confirmation**: Fill in email and note, submit — verify success state is reached.
- [ ] **Empty email shows validation error**: Click submit without entering an email — verify an inline error message appears and no network request is fired.
- [ ] **Invalid email shows validation error**: Enter `"notanemail"`, click submit — verify error about email format.
- [ ] **Submit button is disabled during submission**: Click submit with valid email — verify the button enters a disabled/loading state until the response arrives.
- [ ] **Double-click does not produce double submission**: Click submit rapidly twice — verify only one waitlist entry is created (check via admin endpoint).
- [ ] **Rate limit error is displayed**: (If testable) Trigger a rate limit and verify the error message is displayed inline on the form.
- [ ] **Thank-you page displays submitted email**: After submission, verify the confirmation screen shows the email the user entered.
- [ ] **Thank-you page has link back**: Verify the confirmation screen has a link to the homepage or marketing page.
- [ ] **Note character counter displays correctly**: Type into the note field — verify a character counter appears showing current length out of 1,000.
- [ ] **Note exceeding 1,000 chars is prevented client-side**: Type a note exceeding 1,000 characters — verify the form prevents submission or truncates before sending.
- [ ] **Sign-in blocked state links to waitlist**: (Requires closed alpha enabled) Attempt to sign in as a non-whitelisted user — verify the error page includes a link to `/waitlist`.

### Full Flow E2E Tests

- [ ] **Web form submission → admin approval → sign-in**: (1) Submit waitlist via web form at `/waitlist`, (2) approve via CLI `codeplane admin alpha waitlist approve --email <email>`, (3) verify the email now appears in the whitelist, (4) verify a user with that email can sign in (if closed alpha is enabled).
- [ ] **CLI submission → admin approval via API → whitelist verification**: (1) Submit via `codeplane alpha waitlist join --email <email>`, (2) approve via `POST /api/admin/alpha/waitlist/approve`, (3) verify via `GET /api/admin/alpha/whitelist` that the email is present.
- [ ] **Duplicate submission across surfaces**: (1) Submit via web form, (2) submit same email via CLI — verify only one entry exists and the later source/note updates are reflected.

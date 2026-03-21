# CLOSED_ALPHA_WHITELIST_ADD

Specification for CLOSED_ALPHA_WHITELIST_ADD.

## High-Level User POV

When a Codeplane instance is running in closed alpha mode, only explicitly invited users can sign in. The whitelist add operation is the primary mechanism by which an instance administrator grants access to a specific person. Rather than requiring someone to first join a waitlist, an admin can directly add any identity — an email address, a username, or a wallet address — to the whitelist, immediately authorizing that person to sign in.

From the administrator's perspective, this is a fast, intentional act. An admin opens the admin panel in the web UI, navigates to the alpha access section, selects the whitelist tab, picks an identity type from a dropdown, enters the identity value, and submits. The new entry appears immediately in the whitelist table. Alternatively, an admin can accomplish the same thing from the command line by running `codeplane admin alpha whitelist add --type email --value user@example.com`, which is useful for scripted onboarding, batch provisioning, or headless environments.

The system enforces strict identity validation. Emails must contain an `@` symbol. Wallet addresses must be well-formed Ethereum-style addresses (42 hex characters starting with `0x`). Usernames are free-form but must be non-empty. All identities are normalized to lowercase for case-insensitive matching, so adding `User@Example.com` and `user@example.com` produces one entry, not two.

If an admin adds an identity that already exists on the whitelist, the system treats it as an update rather than a duplicate. The entry's metadata refreshes (the `created_by` field updates to the current admin, and `updated_at` advances), but no error is raised and no second row is created. This upsert behavior means admins can confidently re-run provisioning scripts or re-add identities without worrying about conflicts.

Once added, the whitelisted identity takes effect immediately. The next time a user attempts to sign in — through GitHub OAuth, wallet-based authentication, or any other supported method — the system checks their known identities against the whitelist. If the identity the admin just added matches any of the user's identities, access is granted. There is no propagation delay, cache invalidation, or restart required.

This operation provides value for direct team invitations, partner onboarding, investor demos, and any scenario where the admin knows exactly who should have access and wants to grant it without waiting for a waitlist submission.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- An authenticated admin can add any valid identity to the closed alpha whitelist via the API, CLI, and admin web UI.
- The whitelist entry is persisted immediately and takes effect on the next sign-in attempt by any user whose identities match.
- Invalid identity types, invalid identity value formats, empty payloads, and unauthorized requests are all rejected with clear error responses.
- Duplicate identity additions are handled as upserts with no errors and no duplicate rows.
- The feature is covered by API integration tests, CLI integration tests, and Playwright E2E tests.

### Core Constraints

- [ ] The endpoint `POST /api/admin/alpha/whitelist` accepts `{ identity_type, identity_value }` and returns `201` with the created/updated entry.
- [ ] `identity_type` must be one of: `email`, `wallet`, `username`. Any other value is rejected with `400`.
- [ ] `identity_value` must be non-empty after trimming. An empty or whitespace-only value is rejected with `400`.
- [ ] The response body includes: `id`, `identity_type`, `identity_value`, `lower_identity_value`, `created_by`, `created_at`, `updated_at`.
- [ ] `created_by` is populated with the authenticated admin's user ID.
- [ ] The entry takes effect immediately with no cache delay or restart required.
- [ ] Identity matching is case-insensitive: `identity_value` is stored in its original form, `lower_identity_value` is stored as the normalized lowercase form, and uniqueness is enforced on `(identity_type, lower_identity_value)`.

### Identity Validation Constraints

- [ ] **Email**: must contain at least one `@` character. Normalized to lowercase. Maximum 254 characters (per RFC 5321).
- [ ] **Wallet**: must be exactly 42 characters, start with `0x`, and contain only hexadecimal characters (`0-9`, `a-f`) after the prefix. Normalized to lowercase.
- [ ] **Username**: must be non-empty after trimming. Normalized to lowercase. Maximum 255 characters.
- [ ] An email value without `@` (e.g., `"notanemail"`) is rejected with `400`.
- [ ] A wallet value with wrong length (e.g., `"0x123"`) is rejected with `400`.
- [ ] A wallet value with non-hex characters (e.g., `"0x" + 40 'g' characters`) is rejected with `400`.
- [ ] A wallet value without the `0x` prefix (e.g., `42 hex characters without 0x`) is rejected with `400`.

### Upsert Behavior

- [ ] Adding an identity that already exists on the whitelist upserts: the `created_by` updates to the current admin, `updated_at` advances, but no second row is created.
- [ ] The response for an upsert is identical in shape to a fresh insert (same `201` status, same response body).
- [ ] Case-variant duplicates are treated as the same identity: adding `User@Example.com` after `user@example.com` updates the existing entry.

### Boundary Constraints

- [ ] Email identity value: maximum 254 characters.
- [ ] Email identity value at exactly 254 characters with a valid `@`: accepted.
- [ ] Email identity value at 255 characters: rejected with `400`.
- [ ] Username identity value: maximum 255 characters.
- [ ] Username identity value at exactly 255 characters: accepted.
- [ ] Username identity value at 256 characters: rejected with `400`.
- [ ] Wallet identity value: exactly 42 characters. Values shorter or longer are rejected with `400`.
- [ ] Empty string `""` for `identity_type`: rejected with `400`.
- [ ] Empty string `""` for `identity_value`: rejected with `400`.
- [ ] Missing `identity_type` field in the request body: rejected with `400`.
- [ ] Missing `identity_value` field in the request body: rejected with `400`.
- [ ] Entirely empty JSON body `{}`: rejected with `400`.
- [ ] Non-JSON content type: rejected with `415` or `400` per middleware enforcement.

### Edge Cases

- [ ] Leading and trailing whitespace in `identity_value` is trimmed before validation and storage.
- [ ] Leading and trailing whitespace in `identity_type` is trimmed and lowercased before validation.
- [ ] Unicode characters in an email local part (e.g., `ñ@example.com`) are accepted as long as the value contains `@` and is within length limits.
- [ ] A `null` value for `identity_type` or `identity_value` is rejected with `400`.
- [ ] Adding a whitelist entry when closed alpha mode is disabled still succeeds — the whitelist is managed independently of the enforcement toggle.

## Design

### API Shape

**POST `/api/admin/alpha/whitelist`** — Add or update a whitelist entry

**Request:**

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer <admin-pat>` or valid admin session cookie

Body:
```json
{
  "identity_type": "email",
  "identity_value": "user@example.com"
}
```

**Successful Response — `201 Created`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "identity_type": "email",
  "identity_value": "user@example.com",
  "lower_identity_value": "user@example.com",
  "created_by": "admin-user-uuid",
  "created_at": "2026-03-22T12:00:00.000Z",
  "updated_at": "2026-03-22T12:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `400` | Invalid or missing `identity_type` | `{ "message": "identity_type must be one of: email, wallet, username" }` |
| `400` | Empty or missing `identity_value` | `{ "message": "identity_value must not be empty" }` |
| `400` | Email without `@` | `{ "message": "invalid email format: must contain @" }` |
| `400` | Wallet with wrong length | `{ "message": "invalid wallet format: must be exactly 42 characters starting with 0x" }` |
| `400` | Wallet with non-hex characters | `{ "message": "invalid wallet format: must be exactly 42 characters starting with 0x" }` |
| `400` | Value exceeds maximum length | `{ "message": "identity_value exceeds maximum length" }` |
| `401` | Not authenticated | `{ "message": "authentication required" }` |
| `403` | Authenticated but not admin | `{ "message": "admin access required" }` |
| `429` | Rate limited | `{ "message": "rate limit exceeded" }` |

### CLI Command

```
codeplane admin alpha whitelist add --type <email|wallet|username> --value <identity>
```

**Options:**
- `--type` (required): Identity type. Must be `email`, `wallet`, or `username`.
- `--value` (required): The identity value. Whitespace is trimmed automatically.

**Behavior:**
- Sends `POST /api/admin/alpha/whitelist` with `{ identity_type: type, identity_value: value.trim() }`.
- Requires an admin personal access token in the CLI config.
- On success, outputs the created entry as JSON to stdout.
- On error, prints the error message to stderr and exits with a non-zero code.
- Supports `--json` structured output filtering.

**Example usage:**
```bash
# Add an email to the whitelist
codeplane admin alpha whitelist add --type email --value "partner@company.com"

# Add a username
codeplane admin alpha whitelist add --type username --value "janedoe"

# Add a wallet address
codeplane admin alpha whitelist add --type wallet --value "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"

# Pipe output through jq
codeplane admin alpha whitelist add --type email --value "dev@startup.io" --json | jq '.id'
```

### Web UI Design

**Location:** `/admin/alpha` → Whitelist Tab

**Add Entry Form:**
- Positioned at the top of the whitelist tab, above the entries table.
- Contains:
  - A dropdown/select labeled **"Identity Type"** with options: `Email`, `Wallet Address`, `Username`.
  - A text input labeled **"Identity Value"** with placeholder text that changes based on the selected type:
    - Email: `"user@example.com"`
    - Wallet Address: `"0x..."`
    - Username: `"johndoe"`
  - A primary action button labeled **"Add to Whitelist"**.
- The form should disable the submit button while the request is in flight and show a loading indicator.
- On success:
  - The new entry appears at the top of the whitelist table immediately (optimistic or refetch).
  - A brief success toast/notification: `"Added {identity_value} to the whitelist"`.
  - The form clears its inputs.
- On validation error:
  - An inline error message appears beneath the identity value input describing the issue (e.g., "Email must contain @", "Wallet must be 42 hex characters starting with 0x").
  - The form does not clear.
- On duplicate/upsert:
  - The entry is updated in the table. No error is shown. The success toast reads `"Added {identity_value} to the whitelist"` (same as fresh add — upsert is transparent to the admin).

**Whitelist Entries Table:**
- Columns: Identity Type, Identity Value, Added By, Date Added.
- Sorted by creation date descending (most recent first).
- Each row has a "Remove" action (covered by the `CLOSED_ALPHA_WHITELIST_REMOVE` feature, not this spec).

### SDK Shape

The database layer in `@codeplane/sdk` exposes:

- `addWhitelistEntry(sql, args)` — Accepts `{ identityType, identityValue, lowerIdentityValue, createdBy }` and performs a SQL UPSERT on `(identity_type, lower_identity_value)`. Returns the full `AddWhitelistEntryRow` or `null`.
- `normalizeWhitelistIdentity(identityType, identityValue)` — Validates and normalizes the identity. Returns `{ kind, value, lower }` on success or `null` on invalid input. This function is the authoritative validation gate.

The route handler must:
1. Parse the request body for `identity_type` and `identity_value`.
2. Call `normalizeWhitelistIdentity` to validate and normalize.
3. If normalization returns `null`, respond `400` with an appropriate error message.
4. Call `addWhitelistEntry` with the normalized values and the authenticated admin's user ID.
5. Return `201` with the created/updated row.

### Documentation

The following end-user documentation should be written:

1. **Admin Guide — Adding Users to the Whitelist**: Step-by-step instructions for adding identities via the admin web UI and CLI. Include the three identity types, their format requirements, and examples. Explain that entries take effect immediately. Note the upsert behavior for duplicates.
2. **CLI Reference — `codeplane admin alpha whitelist add`**: Command syntax, required options, example invocations for each identity type, expected output format, and common error messages.
3. **API Reference — `POST /api/admin/alpha/whitelist`**: Request/response schema, identity type and value validation rules, authentication requirements, and error codes.

## Permissions & Security

### Authorization Roles

| Action | Required Role | Enforcement |
|--------|---------------|-------------|
| Add a whitelist entry | **Admin** | Server-side `requireAdmin` middleware check. Returns `403` if authenticated user is not admin. Returns `401` if not authenticated. |

- **Owner**: N/A (instance-level operation, not org/repo-scoped).
- **Member / Read-Only / Anonymous**: All denied with `403` or `401`.
- There is no delegation mechanism. Only users with `isAdmin=true` can add whitelist entries.

### Rate Limiting

- **Standard admin rate limits** apply: the same limits as other admin endpoints (platform default for authenticated admin routes).
- No special elevated rate limit is needed, since this endpoint is admin-only and abuse surface is small.
- If batch provisioning is needed (e.g., onboarding 100 users), the admin should script sequential calls. No bulk-add endpoint is specified for this feature.

### Data Privacy

- **PII in request/response**: `identity_value` may contain email addresses, wallet addresses, or usernames — all PII. The response payload is only returned to the authenticated admin who made the request.
- **PII in logs**: The full `identity_value` must never appear in production logs at `info` level or below. Log the `identity_type` and a truncated SHA-256 hash of the value instead. Full values may appear at `debug` level in non-production environments.
- **PII in telemetry**: Analytics events must not include the full `identity_value`. Use `identity_type` and domain-level aggregation (e.g., `email_domain` for email types) only.
- **Audit trail**: The `created_by` field provides a non-deletable record of which admin granted access. This is an important compliance artifact.
- **No public exposure**: The whitelist list endpoint is admin-only. No public-facing API, webhook payload, or SSE event should ever expose whitelist entries.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `WhitelistEntryAdded` | Admin successfully adds or upserts a whitelist entry | `identity_type`, `added_by_user_id`, `via` (`api`, `cli`, `ui`), `is_upsert` (boolean), `email_domain` (if email type, otherwise `null`) |

### Properties Detail

- `identity_type`: One of `email`, `wallet`, `username`. Indicates which identity class was whitelisted.
- `added_by_user_id`: The admin's user ID. Essential for audit and engagement tracking.
- `via`: The client surface used to trigger the add. Determined by user-agent header or explicit client context. Values: `api` (direct API call), `cli` (Codeplane CLI), `ui` (web admin panel).
- `is_upsert`: `true` if the identity already existed and was updated, `false` if it was a fresh insert. Tracks how often admins re-add existing identities (possible UX signal).
- `email_domain`: For `email` identity types, the domain portion (e.g., `"company.com"`). Never the full email. `null` for non-email types. Useful for understanding which organizations are being onboarded.

### Funnel Metrics & Success Indicators

- **Whitelist Additions Per Day**: Count of `WhitelistEntryAdded` events per day, segmented by `identity_type` and `via`. Tracks admin engagement with the access management flow.
- **Identity Type Distribution**: Proportion of whitelist adds by type (`email` vs. `wallet` vs. `username`). Indicates which auth methods are dominant.
- **Client Surface Preference**: Distribution of `via` values. Indicates whether admins prefer the UI, CLI, or direct API calls.
- **Upsert Rate**: Percentage of adds that are upserts (`is_upsert=true`). A high upsert rate may signal confusion (admins unsure if they already added someone) or scripted re-provisioning.
- **Time From Whitelist Add to First Sign-In**: Correlate `WhitelistEntryAdded` with `ClosedAlphaSignInAllowed` events where `matching_identity_type` matches. Measures how quickly invited users activate. Long gaps may indicate the invitation communication is not reaching users.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-----------|
| Whitelist entry added successfully | `info` | `identity_type`, `identity_hash` (truncated SHA-256 of `lower_identity_value`), `created_by` (admin user ID), `is_upsert` (boolean), `entry_id` |
| Whitelist add validation failed | `warn` | `identity_type`, `reason` (e.g., `"missing_at"`, `"invalid_wallet_length"`, `"empty_value"`, `"unknown_type"`), `request_id` |
| Whitelist add unauthorized (not admin) | `warn` | `user_id` (of the requesting non-admin user), `request_id` |
| Whitelist add unauthenticated | `info` | `request_id`, `remote_ip` |
| Whitelist add database error | `error` | `identity_type`, `error_message`, `stack`, `request_id` |
| Whitelist add request received | `debug` | `identity_type`, `identity_hash`, `request_id` |

### Prometheus Metrics

**Counters:**

- `codeplane_whitelist_entries_added_total{identity_type, is_upsert}` — Total successful whitelist additions, partitioned by identity type and whether it was an upsert.
- `codeplane_whitelist_add_errors_total{error_type}` — Total failed whitelist add attempts, partitioned by error type (`validation_error`, `auth_error`, `db_error`).

**Gauges:**

- `codeplane_whitelist_entries_count{identity_type}` — Current count of whitelist entries by type. Updated after each add/remove.

**Histograms:**

- `codeplane_whitelist_add_duration_seconds` — Duration of the whitelist add operation (from request receipt to response), bucketed for latency analysis.

### Alerts

#### Alert: `WhitelistAddDatabaseErrors`
- **Condition**: `rate(codeplane_whitelist_add_errors_total{error_type="db_error"}[5m]) > 0`
- **Severity**: Critical
- **Description**: Whitelist add operations are failing at the database level. Admins cannot grant access.

**Runbook:**
1. Check `codeplane_whitelist_add_errors_total{error_type="db_error"}` counter and correlate with database health metrics (`pg_up`, connection pool saturation).
2. Inspect server logs for `error` level entries from the whitelist add code path. Look for the `error_message` and `stack` fields.
3. Verify the `alpha_whitelist_entries` table exists: `SELECT count(*) FROM alpha_whitelist_entries;`
4. Check for migration drift — run pending migrations if the table or indexes are missing.
5. Check database connection pool utilization. If the pool is saturated, increase `max_connections` or investigate long-running queries.
6. If the database is unreachable, follow the standard database recovery runbook.
7. As immediate mitigation, admins can still manage the whitelist via direct database access if the application layer is down.

#### Alert: `WhitelistAddHighValidationErrorRate`
- **Condition**: `rate(codeplane_whitelist_add_errors_total{error_type="validation_error"}[15m]) > 5`
- **Severity**: Info
- **Description**: Elevated rate of validation errors on whitelist add. May indicate a confusing UI, a misbehaving script, or an API consumer sending bad data.

**Runbook:**
1. Check the `reason` field in `warn`-level log entries for the validation failures.
2. If the errors are from the same admin user, reach out to help them with the correct format.
3. If the errors are from an automated script, check if the script has a bug in identity formatting.
4. If the errors are from the web UI, check whether the form validation is running client-side before submission. Consider adding stricter client-side validation.
5. Acknowledge the alert if the rate is within expected bounds for normal admin usage.

#### Alert: `WhitelistAddLatencyHigh`
- **Condition**: `histogram_quantile(0.99, codeplane_whitelist_add_duration_seconds) > 1.0`
- **Severity**: Warning
- **Description**: The 99th percentile of whitelist add latency exceeds 1 second.

**Runbook:**
1. Check database query performance for `alpha_whitelist_entries` upserts.
2. Verify the unique index on `(identity_type, lower_identity_value)` exists and is being used by the upsert query.
3. Check for table bloat or lock contention on `alpha_whitelist_entries`.
4. Check overall database latency metrics. If this alert correlates with system-wide slowness, follow the general database performance runbook.
5. If isolated to this endpoint, investigate whether the table needs a `VACUUM` or `REINDEX`.

### Error Cases and Failure Modes

| Error Case | Behavior | HTTP Status | Log Level |
|------------|----------|-------------|----------|
| Valid request from admin | Entry created/upserted, returned in response | `201` | `info` |
| Missing `identity_type` | Rejected with validation error | `400` | `warn` |
| Unknown `identity_type` (e.g., `"phone"`) | Rejected with validation error | `400` | `warn` |
| Empty `identity_value` | Rejected with validation error | `400` | `warn` |
| Invalid email (no `@`) | Rejected with validation error | `400` | `warn` |
| Invalid wallet (wrong length or non-hex) | Rejected with validation error | `400` | `warn` |
| Value exceeds max length | Rejected with validation error | `400` | `warn` |
| Not authenticated | Rejected | `401` | `info` |
| Authenticated but not admin | Rejected | `403` | `warn` |
| Rate limited | Rejected | `429` | `info` |
| Database unreachable | Internal server error | `500` | `error` |
| Database constraint violation (unexpected) | Internal server error | `500` | `error` |
| Non-JSON content type | Rejected by middleware | `400` or `415` | `warn` |

## Verification

### API Integration Tests

#### Successful Add Operations

- [ ] **Add email entry**: POST `/api/admin/alpha/whitelist` with `{ identity_type: "email", identity_value: "user@example.com" }` as admin returns `201` with `identity_type: "email"`, `identity_value: "user@example.com"`, `lower_identity_value: "user@example.com"`, non-null `id`, non-null `created_by`, non-null `created_at`, non-null `updated_at`.
- [ ] **Add username entry**: POST with `{ identity_type: "username", identity_value: "johndoe" }` returns `201` with `lower_identity_value: "johndoe"`.
- [ ] **Add wallet entry**: POST with `{ identity_type: "wallet", identity_value: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18" }` returns `201` with `lower_identity_value` as the lowercase version.
- [ ] **`created_by` is populated**: The returned `created_by` matches the authenticated admin's user ID.
- [ ] **Entry persisted**: After adding, GET `/api/admin/alpha/whitelist` includes the new entry.

#### Case Normalization

- [ ] **Email normalized to lowercase**: POST with `identity_value: "User@EXAMPLE.COM"` returns `lower_identity_value: "user@example.com"`.
- [ ] **Username normalized to lowercase**: POST with `identity_value: "JohnDoe"` returns `lower_identity_value: "johndoe"`.
- [ ] **Wallet normalized to lowercase**: POST with `identity_value: "0x742D35CC6634C0532925A3B844BC9E7595F2BD18"` returns `lower_identity_value` with all hex in lowercase.

#### Upsert/Duplicate Handling

- [ ] **Case-insensitive dedup (email)**: Add `User@Example.com`, then add `user@example.com` — GET list returns exactly one entry with that email.
- [ ] **Case-insensitive dedup (username)**: Add `JohnDoe`, then add `johndoe` — one entry.
- [ ] **Upsert updates `created_by`**: Admin A adds entry, Admin B re-adds same entry — `created_by` is now Admin B's ID.
- [ ] **Upsert updates `updated_at`**: Re-add the same entry — `updated_at` advances beyond the original `created_at`.
- [ ] **Upsert returns `201`**: The response status for a duplicate/upsert is `201`, not `200` or `409`.

#### Validation Errors

- [ ] **Invalid type `"phone"`**: POST with `identity_type: "phone"` returns `400`.
- [ ] **Empty type `""`**: POST with `identity_type: ""` returns `400`.
- [ ] **Missing type**: POST with `{ identity_value: "foo" }` (no `identity_type`) returns `400`.
- [ ] **Empty value `""`**: POST with `identity_value: ""` returns `400`.
- [ ] **Missing value**: POST with `{ identity_type: "email" }` (no `identity_value`) returns `400`.
- [ ] **Empty body `{}`**: POST with `{}` returns `400`.
- [ ] **Email without `@`**: POST with `identity_type: "email"`, `identity_value: "notanemail"` returns `400`.
- [ ] **Email with only `@`**: POST with `identity_value: "@"` — accepted (minimal valid format containing `@`; email delivery validation is not in scope).
- [ ] **Wallet wrong length (too short)**: POST with `identity_type: "wallet"`, `identity_value: "0x123"` returns `400`.
- [ ] **Wallet wrong length (too long)**: POST with `identity_type: "wallet"`, `identity_value: "0x" + 42 hex chars` (44 total) returns `400`.
- [ ] **Wallet non-hex characters**: POST with `identity_type: "wallet"`, `identity_value: "0x" + 40 'g' characters` returns `400`.
- [ ] **Wallet missing `0x` prefix**: POST with `identity_type: "wallet"`, `identity_value: 42 hex characters without 0x` returns `400`.
- [ ] **`null` identity_type**: POST with `identity_type: null` returns `400`.
- [ ] **`null` identity_value**: POST with `identity_value: null` returns `400`.

#### Boundary Tests

- [ ] **Email at max length (254 chars)**: Construct a valid email address that is exactly 254 characters long (e.g., `"a" * 245 + "@b.com"`). POST succeeds with `201`.
- [ ] **Email exceeding max length (255 chars)**: Construct a 255-character email. POST returns `400`.
- [ ] **Username at max length (255 chars)**: POST with a 255-character username. Succeeds with `201`.
- [ ] **Username exceeding max length (256 chars)**: POST with a 256-character username. Returns `400`.
- [ ] **Wallet at exact length (42 chars)**: POST with valid 42-char wallet. Succeeds with `201`.
- [ ] **Wallet at 41 chars**: Returns `400`.
- [ ] **Wallet at 43 chars**: Returns `400`.
- [ ] **Whitespace-only value `"   "`**: POST with `identity_value: "   "` returns `400` (trims to empty).
- [ ] **Value with leading/trailing whitespace**: POST with `identity_value: "  user@example.com  "` — accepted, stored as trimmed `"user@example.com"`.

#### Auth/Permission Tests

- [ ] **Unauthenticated**: POST without auth returns `401`.
- [ ] **Non-admin authenticated**: POST with a valid non-admin user token returns `403`.
- [ ] **Admin authenticated**: POST with a valid admin token returns `201`.
- [ ] **Admin PAT authentication**: POST with a valid admin PAT in the `Authorization` header returns `201`.
- [ ] **Admin session cookie authentication**: POST with a valid admin session cookie returns `201`.

#### Independence from Closed Alpha Toggle

- [ ] **Add entry when closed alpha is disabled**: With `CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=false`, POST to add a whitelist entry still succeeds with `201`. The whitelist is managed independently of the enforcement toggle.

### CLI Integration Tests

- [ ] **`codeplane admin alpha whitelist add --type email --value user@example.com`**: Outputs JSON with `identity_type: "email"`, `identity_value: "user@example.com"`, exits 0.
- [ ] **`codeplane admin alpha whitelist add --type username --value janedoe`**: Outputs JSON with `identity_type: "username"`, exits 0.
- [ ] **`codeplane admin alpha whitelist add --type wallet --value 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18`**: Outputs JSON with `identity_type: "wallet"`, exits 0.
- [ ] **Value trimming**: `codeplane admin alpha whitelist add --type email --value "  user@example.com  "` — succeeds, value is trimmed.
- [ ] **Invalid type**: `codeplane admin alpha whitelist add --type phone --value "123"` — exits non-zero with error message.
- [ ] **Missing --type flag**: `codeplane admin alpha whitelist add --value "user@example.com"` — exits non-zero with usage error.
- [ ] **Missing --value flag**: `codeplane admin alpha whitelist add --type email` — exits non-zero with usage error.
- [ ] **Non-admin user**: Running with a non-admin PAT returns non-zero exit code with a permissions error.
- [ ] **No auth configured**: Running without any configured token returns non-zero exit code with an auth error.
- [ ] **JSON output**: `codeplane admin alpha whitelist add --type email --value user@example.com --json` — outputs valid JSON that can be parsed by `jq`.
- [ ] **Appears in list**: After add, `codeplane admin alpha whitelist list` includes the new entry.

### E2E (Playwright) Tests

- [ ] **Admin alpha page loads**: Sign in as admin, navigate to `/admin/alpha`, verify the page renders with Whitelist and Waitlist tabs.
- [ ] **Whitelist tab renders add form**: Click Whitelist tab, verify identity type dropdown and identity value input are visible.
- [ ] **Add email via UI**: Select "Email" from dropdown, enter `"playwright-test@example.com"`, click "Add to Whitelist" — verify the entry appears in the table and a success indicator is shown.
- [ ] **Add username via UI**: Select "Username", enter `"playwright-user"`, submit — verify entry appears in table.
- [ ] **Add wallet via UI**: Select "Wallet Address", enter a valid 42-char hex address, submit — verify entry appears in table.
- [ ] **Validation error displayed (email without @)**: Select "Email", enter `"notanemail"`, submit — verify an inline error message appears and the entry does NOT appear in the table.
- [ ] **Validation error displayed (empty value)**: Leave the value field empty, submit — verify an error appears.
- [ ] **Duplicate add shows success (upsert)**: Add the same email twice — verify no error on the second add, table still shows one entry.
- [ ] **Form clears after success**: After a successful add, verify the identity type and value fields are reset.
- [ ] **Non-admin cannot access admin alpha page**: Sign in as a regular user, navigate to `/admin/alpha` — verify redirect to a 403/unauthorized page or the admin navigation is not visible.
- [ ] **Loading state**: Click "Add to Whitelist" — verify the button shows a loading/disabled state while the request is in flight.

### Full Flow E2E Tests

- [ ] **Whitelist-add-to-sign-in flow**: (1) Admin adds an email to the whitelist via API. (2) A user with that email signs in via GitHub OAuth with closed alpha enabled. (3) Sign-in succeeds (no 403 error).
- [ ] **CLI-add-to-sign-in flow**: (1) Admin adds a username via CLI. (2) A user with that username signs in. (3) Sign-in succeeds.
- [ ] **Add then verify in list**: (1) Admin adds an entry via POST. (2) Admin calls GET list. (3) The entry appears in the response. (4) Admin adds same entry again via POST. (5) Admin calls GET list. (6) Exactly one entry with that identity exists (no duplicates).
- [ ] **Add via UI, verify via CLI**: (1) Admin adds email via Playwright UI. (2) Run CLI `whitelist list`. (3) The email appears in the CLI output.

# ADMIN_USER_CREATE

Specification for ADMIN_USER_CREATE.

## High-Level User POV

## High-Level User POV

As a Codeplane instance administrator, I need to manually create user accounts on my instance so I can onboard team members, provision service accounts, and set up identities for people who cannot or should not go through the self-service OAuth sign-up flow.

The Admin User Create capability lets me create a new user by providing a username, email address, and optionally a display name and initial password. I can do this from the web admin console, the CLI, or the TUI — whichever surface is most convenient. The workflow is straightforward: I fill in the required information, submit, and the system either creates the account and confirms success with the new user's profile, or tells me exactly what went wrong — for instance, that the username is already taken or the email is invalid.

When I omit a password, the system generates a secure random one for me and displays it exactly once so I can share it with the new user through a secure channel. I can also indicate that the user must change their password on first login, which is the default — this ensures I never have long-lived knowledge of another user's credentials.

The new account is immediately active and usable. The user appears in the admin user list, can log in (subject to any password-change requirement), and is ready to be added to organizations and teams. If I'm provisioning a service account or bot identity, I can also immediately create an API token for the new user through the adjacent admin token creation flow.

This capability is restricted to site administrators. Non-admin users and unauthenticated visitors cannot create accounts through this path. Every admin user creation is logged in the audit trail so there is always a record of who provisioned which account and when.

The experience is consistent across all clients: the web form, the `codeplane admin user create` CLI command, and the TUI creation dialog all validate the same constraints and return the same information. The only difference is the medium — a visual form in the browser, flags on the command line, or an interactive prompt in the terminal UI.

## Acceptance Criteria

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated admin user can create a new user account via `POST /api/admin/users` and receive a `201 Created` response containing the new user's full profile.
- [ ] The endpoint is backed by a real service implementation (not a stub returning `{}`).
- [ ] The CLI `admin user create` command creates a user and displays the result, including the generated password when applicable.
- [ ] The web admin console provides a user creation form accessible from the admin users page.
- [ ] The TUI provides a user creation dialog accessible from the admin users screen.
- [ ] Non-admin authenticated users receive a `401 Unauthorized` response.
- [ ] Unauthenticated requests receive a `401 Unauthorized` response.
- [ ] Duplicate username or email returns a `409 Conflict` response with a descriptive error message.
- [ ] All existing e2e tests pass, and new tests cover the full specification.

### Functional Constraints

- [ ] The `username` field is required, must be 1–39 characters, must contain only lowercase alphanumeric characters and hyphens, must not start or end with a hyphen, and must not contain consecutive hyphens.
- [ ] The `username` is stored and compared case-insensitively. The API lowercases the provided value before validation and storage.
- [ ] The `email` field is required, must be a valid email address conforming to a reasonable subset of RFC 5321, and must not exceed 254 characters.
- [ ] The `email` is stored and compared case-insensitively.
- [ ] The `display_name` field is optional and defaults to the username. When provided it must be 0–255 characters of valid UTF-8 text.
- [ ] The `password` field is optional. When omitted, the server generates a cryptographically secure random password of at least 20 characters.
- [ ] The generated or provided password is returned in the response body exactly once. It is never stored in plaintext and is never retrievable after this response.
- [ ] The `must_change_password` field is optional and defaults to `true`. When `true`, the user is required to change their password on first login.
- [ ] The `is_admin` field is optional and defaults to `false`. When `true`, the new user is created with admin privileges.
- [ ] All string inputs are trimmed of leading and trailing whitespace before validation.
- [ ] The newly created user has `is_active = true` and `prohibit_login = false` by default.
- [ ] The newly created user has `user_type = "individual"` by default.
- [ ] The response contains the full user profile object plus a `password` field containing the plaintext password (provided or generated).
- [ ] The response status code is `201 Created` on success.

### Edge Cases

- [ ] Creating a user with a username that differs from an existing username only in case returns `409 Conflict` (e.g., `Alice` when `alice` exists).
- [ ] Creating a user with an email that differs from an existing email only in case returns `409 Conflict`.
- [ ] An empty `username` (or whitespace-only) returns `400 Bad Request` with a field-level error indicating the username is required.
- [ ] An empty `email` (or whitespace-only) returns `400 Bad Request` with a field-level error indicating the email is required.
- [ ] A `username` containing uppercase letters is normalized to lowercase before storage (not rejected).
- [ ] A `username` of exactly 1 character (e.g., `a`) is accepted.
- [ ] A `username` of exactly 39 characters is accepted.
- [ ] A `username` of 40 characters returns `400 Bad Request`.
- [ ] A `username` containing special characters (`@`, `_`, `.`, spaces, emoji) returns `400 Bad Request`.
- [ ] A `username` starting or ending with a hyphen (e.g., `-bob`, `bob-`) returns `400 Bad Request`.
- [ ] A `username` containing consecutive hyphens (e.g., `bob--smith`) returns `400 Bad Request`.
- [ ] Reserved usernames (`admin`, `api`, `system`, `root`, `null`, `undefined`, `login`, `signup`, `settings`, `new`, `explore`, `help`, `about`, `pricing`, `contact`, `terms`, `privacy`, `security`, `status`, `health`, `notifications`, `search`, `inbox`, `integrations`, `workspaces`, `organizations`) return `400 Bad Request` or `409 Conflict`.
- [ ] An `email` without an `@` symbol returns `400 Bad Request`.
- [ ] An `email` exceeding 254 characters returns `400 Bad Request`.
- [ ] A `display_name` of exactly 255 characters is accepted.
- [ ] A `display_name` of 256 characters returns `400 Bad Request`.
- [ ] A `password` shorter than 8 characters (when explicitly provided) returns `400 Bad Request`.
- [ ] A `password` of exactly 72 characters (bcrypt maximum) is accepted.
- [ ] A `password` exceeding 72 characters returns `400 Bad Request` (to avoid silent truncation by bcrypt).
- [ ] Submitting a request body that is not valid JSON returns `400 Bad Request` with "invalid request body".
- [ ] Submitting a request body that is valid JSON but missing required fields returns `400 Bad Request` with specific field-level errors.
- [ ] Submitting unexpected additional fields in the request body has no effect (they are silently ignored).
- [ ] Creating two users in rapid succession with the same username — the second returns `409 Conflict`.

### Boundary Constraints

- [ ] `username`: string, 1–39 characters, pattern `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` (no consecutive hyphens).
- [ ] `email`: string, 3–254 characters, valid email format.
- [ ] `display_name`: string, 0–255 characters, UTF-8.
- [ ] `password`: string when provided, 8–72 characters, UTF-8.
- [ ] `must_change_password`: boolean, defaults to `true`.
- [ ] `is_admin`: boolean, defaults to `false`.

### CLI Parameter Alignment

- [ ] The CLI `--username` option maps to the API `username` field.
- [ ] The CLI `--email` option maps to the API `email` field.
- [ ] The CLI `--password` option maps to the API `password` field.
- [ ] The CLI `--must-change-password` option maps to the API `must_change_password` field.
- [ ] The CLI must add `--display-name` and `--admin` options to match the API surface.
- [ ] When the API returns a generated password, the CLI must display it prominently with a warning that it will not be shown again.

## Design

## Design

### API Shape

**Endpoint:** `POST /api/admin/users`

**Authentication:** Required. Caller must have `isAdmin = true`.

**Request Content-Type:** `application/json`

**Request Body:**

| Field                 | Type    | Required | Default       | Constraints                                 |
|-----------------------|---------|----------|---------------|---------------------------------------------|
| `username`            | string  | Yes      | —             | 1–39 chars, `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, no consecutive hyphens |
| `email`               | string  | Yes      | —             | Valid email, 3–254 chars                    |
| `display_name`        | string  | No       | username      | 0–255 chars, UTF-8                          |
| `password`            | string  | No       | auto-generated| 8–72 chars                                  |
| `must_change_password`| boolean | No       | `true`        | —                                           |
| `is_admin`            | boolean | No       | `false`       | —                                           |

**Success Response:** `201 Created`

```json
{
  "id": 42,
  "username": "alice",
  "display_name": "Alice Smith",
  "email": "alice@example.com",
  "avatar_url": "",
  "bio": "",
  "user_type": "individual",
  "is_active": true,
  "is_admin": false,
  "prohibit_login": false,
  "must_change_password": true,
  "last_login_at": null,
  "created_at": "2026-03-22T10:00:00Z",
  "updated_at": "2026-03-22T10:00:00Z",
  "password": "generated-or-provided-plaintext-password"
}
```

**Notes:**
- The `password` field is included ONLY in the `201 Created` response from this endpoint. It is never returned by any other endpoint.
- The response body is a single JSON object, not wrapped in an envelope.
- Sensitive internal fields (`lower_username`, `lower_email`, `search_vector`, `wallet_address`, `email_notifications_enabled`) are excluded from the response.

**Error Responses:**

| Status | Condition                        | Body                                                                |
|--------|----------------------------------|---------------------------------------------------------------------|
| `400`  | Invalid or missing request body  | `{ "error": "invalid request body" }`                              |
| `400`  | Validation failure               | `{ "error": "validation failed", "details": { "username": "must be 1-39 lowercase alphanumeric characters or hyphens" } }` |
| `401`  | No authentication provided       | `{ "error": "authentication required" }`                           |
| `401`  | Authenticated but not admin      | `{ "error": "admin access required" }`                             |
| `409`  | Username already exists          | `{ "error": "username is already in use" }`                        |
| `409`  | Email already exists             | `{ "error": "email address is already in use" }`                   |
| `429`  | Rate limit exceeded              | `{ "error": "rate limit exceeded" }` with `Retry-After` header    |
| `500`  | Internal server error            | `{ "error": "<message>" }`                                         |

### SDK Shape

The `@codeplane/sdk` package must expose an admin service method:

```typescript
interface AdminCreateUserInput {
  username: string;             // raw input, will be trimmed and lowercased
  email: string;                // raw input, will be trimmed and lowercased
  displayName?: string;         // defaults to username
  password?: string;            // when omitted, generated by the service
  mustChangePassword?: boolean; // defaults to true
  isAdmin?: boolean;            // defaults to false
}

interface AdminCreateUserResult {
  user: AdminUserRow;           // same shape as ADMIN_USERS_LIST AdminUserRow
  password: string;             // plaintext password (generated or provided), returned once
}
```

The service method must:
1. Trim and lowercase `username` and `email`.
2. Validate all fields against the boundary constraints.
3. Check for reserved usernames.
4. Generate a secure random password if none was provided.
5. Hash the password using bcrypt before storage.
6. Insert the user row.
7. Return the created profile and the plaintext password.
8. Throw a `ConflictError` on duplicate username or email.
9. Throw a `ValidationError` on constraint violations.

### CLI Command

**Command:** `codeplane admin user create`

**Options:**

| Flag                      | Type    | Required | Default | Description                              |
|---------------------------|---------|----------|---------|------------------------------------------|
| `--username`              | string  | Yes      | —       | Username for the new account             |
| `--email`                 | string  | Yes      | —       | Email address for the new account        |
| `--display-name`          | string  | No       | —       | Display name (defaults to username)      |
| `--password`              | string  | No       | —       | Initial password (generated if omitted)  |
| `--must-change-password`  | boolean | No       | `true`  | Require password change on first login   |
| `--admin`                 | boolean | No       | `false` | Grant admin privileges                   |
| `--json`                  | flag    | No       | off     | Output raw JSON                          |

**Default (human-readable) output:**

```
✓ User created successfully

  Username:       alice
  Display Name:   Alice Smith
  Email:          alice@example.com
  Admin:          No
  Password:       Xk9#mP2$vL7nQ4wR8bYz

  ⚠ Save this password now — it will not be shown again.
  ⚠ The user must change their password on first login.
```

**JSON output:** Outputs the full JSON response from the API.

**Error output:**

```
Error: username is already in use (409)
```

```
Error: validation failed — username: must be 1-39 lowercase alphanumeric characters or hyphens (400)
```

**Exit codes:**
- `0` — success
- `1` — validation error, conflict, auth failure, or server error

### Web UI Design

**Entry Point:** A "Create User" button on the `/admin/users` page (the admin user list), positioned in the page header area next to the total user count.

**Route:** `/admin/users/new` (or a modal dialog triggered from the admin users list — either approach is acceptable, but a dedicated route is preferred for deep-linkability).

**Layout:**
- Page title: "Create User"
- A form card with the following fields:
  - **Username** (text input, required): placeholder "e.g., alice", real-time validation showing character count and pattern match status. Inline error message on blur if invalid.
  - **Email** (email input, required): placeholder "e.g., alice@example.com". Inline validation on blur.
  - **Display Name** (text input, optional): placeholder "Alice Smith". Character counter showing N/255.
  - **Password** (password input with show/hide toggle, optional): placeholder "Leave blank to generate". Strength indicator when typing. Helper text: "If left blank, a secure password will be generated."
  - **Require Password Change** (checkbox, default checked): label "Require password change on first login".
  - **Admin** (checkbox, default unchecked): label "Grant admin privileges". Helper text: "Admin users have full access to the admin console."
- A "Create User" primary submit button and a "Cancel" secondary button.
- Loading state: submit button shows spinner and is disabled during submission.

**Success behavior:**
- A success banner appears at the top of the form with the message: "User created successfully."
- The generated/provided password is displayed in a prominent, copy-to-clipboard card with a warning: "Save this password now — it will not be shown again."
- A "Go to Users List" link navigates back to `/admin/users`.
- A "Create Another" link resets the form.

**Error behavior:**
- `409 Conflict` errors display an inline error on the conflicting field (username or email) with the specific error message.
- `400` validation errors display inline errors on the relevant fields.
- `500` errors display a top-of-form error banner with a generic message and a retry option.
- Network errors display a banner with a retry action.

**Accessibility:**
- All form fields have associated labels.
- Error messages are announced to screen readers via `aria-live` regions.
- Focus moves to the first field with an error after a failed submission.
- The password reveal toggle has an accessible label.

### TUI UI

**Entry Point:** A "Create User" action accessible from the admin users screen via a keyboard shortcut (`c`) or the command palette.

**Layout:**
- A form overlay/dialog titled "Create User".
- Sequential field prompts: Username → Email → Display Name → Password → Must Change Password → Admin.
- Tab/Shift-Tab to navigate between fields. Enter to submit.
- Inline validation feedback after each field.

**Success behavior:**
- Success message with the user's username and the generated/provided password displayed prominently.
- Warning text: "Save this password — it will not be shown again."
- Press any key to return to the admin users list, which refreshes to include the new user.

**Error behavior:**
- Error messages displayed inline below the relevant field.
- The cursor returns to the first errored field.

### Documentation

End-user documentation must include:

- **Admin Guide — Creating Users**: A section in the admin guide explaining when and why an admin would manually create a user account (onboarding, service accounts, bot identities), the information required, password handling, and the must-change-password flow.
- **CLI Reference — `codeplane admin user create`**: A reference entry documenting the command, all options, output formats (human and JSON), password handling, and example invocations including:
  - Basic creation: `codeplane admin user create --username alice --email alice@example.com`
  - With explicit password: `codeplane admin user create --username bob --email bob@example.com --password 'S3cure!Pass'`
  - Creating an admin: `codeplane admin user create --username ops-bot --email ops@example.com --admin`
  - JSON output: `codeplane admin user create --username charlie --email charlie@example.com --json`
- **API Reference — `POST /api/admin/users`**: A reference entry documenting the endpoint, authentication requirements, request body schema, response schema, the one-time password field, and all error codes.

## Permissions & Security

## Permissions & Security

### Authorization

| Role                          | Access           |
|-------------------------------|------------------|
| Site Admin                    | Full access      |
| Authenticated (non-admin)     | Denied (401)     |
| Anonymous / Unauthenticated   | Denied (401)     |

- The `requireAdmin()` guard checks both that a valid session/token exists AND that the user has `isAdmin = true`.
- PAT-scoped access: Tokens with `admin` or `write:admin` scopes should grant access. Tokens with only `read:admin` should be denied (user creation is a write operation). Tokens without admin scopes should be denied.
- Only site admins can set `is_admin = true` on new users. This is inherently enforced since the endpoint itself is admin-only.

### Rate Limiting

- Standard API rate limiting applies (shared with other authenticated endpoints).
- An additional admin-specific rate limit of **30 requests per minute** per authenticated admin user should be applied to `POST /api/admin/users` to prevent accidental bulk creation loops or abuse.
- A stricter burst limit of **5 requests per 10 seconds** prevents rapid-fire creation.
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- The request body contains PII: username, email address, display name, and optionally a plaintext password.
- The response body contains PII and a one-time plaintext password.
- The plaintext password must NEVER be logged at any log level.
- The plaintext password must NEVER be stored in the database. Only the bcrypt hash is stored.
- The plaintext password must NEVER appear in telemetry events.
- The `lower_username`, `lower_email`, `search_vector`, and `wallet_address` internal fields must be excluded from the API response.
- Request bodies should be logged with the `password` field redacted (replaced with `"[REDACTED]"`).
- Admin user creation operations must be recorded in the audit trail with the creating admin's identity and the created user's username/email.
- Email addresses are PII and their exposure is inherently constrained to admin-only access.
- The response should include `Cache-Control: no-store` to prevent caching of the password-containing response.

### Password Security

- Generated passwords must use a cryptographically secure random number generator (`crypto.getRandomValues` or equivalent).
- Generated passwords must be at least 20 characters and include uppercase, lowercase, digits, and symbols.
- Provided passwords must be at least 8 characters.
- Provided passwords must not exceed 72 characters (bcrypt input limit — to avoid silent truncation).
- Passwords are hashed with bcrypt using a cost factor of at least 12.
- The `must_change_password` flag should be stored and enforced at login time — a user with this flag set must change their password before accessing any other resource.

## Telemetry & Product Analytics

## Telemetry & Product Analytics

### Business Events

| Event Name                | Trigger                                        | Properties                                                                                             |
|---------------------------|------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| `AdminUserCreated`        | Admin successfully creates a new user          | `admin_user_id`, `created_user_id`, `created_username`, `is_admin_grant`, `password_was_generated`, `must_change_password`, `client` (web/cli/tui/api), `duration_ms` |
| `AdminUserCreateFailed`   | Admin attempts to create a user but fails      | `admin_user_id`, `error_type` (validation/conflict/server_error), `error_field` (username/email/password/null), `client`, `attempted_username` (if validation error, else null) |
| `AdminUserCreateDenied`   | Non-admin attempts to create a user            | `user_id` (if authenticated, else null), `reason` ("not_authenticated" or "not_admin"), `client`       |

**IMPORTANT:** The `password` field must NEVER appear in any telemetry event.

### Funnel Metrics

- **Admin user provisioning funnel**: Track from admin users list view → create form open → form submission → successful creation. Target conversion from form open to success: >80% (low drop-off indicates good form UX and validation messaging).
- **Password generation rate**: Track what percentage of admin-created users use generated passwords vs. explicitly provided passwords. High generation rate (>70%) indicates admins trust the generated password flow.
- **Must-change-password opt-out rate**: Track how often admins uncheck the must-change-password flag. High opt-out (>30%) may indicate the feature is annoying or that admins are creating service accounts that shouldn't be forced to change passwords.
- **Time to first login**: Track how long it takes admin-created users to log in for the first time. Target: >80% within 24 hours of creation.
- **Client distribution**: Track which clients (web, CLI, TUI, raw API) are used for admin user creation. This informs investment priority.

### Success Indicators

- The stub endpoint is replaced by a real implementation returning actual created user data.
- E2e tests pass with user creation, login, and password change flows.
- Admins on self-hosted instances can provision users without direct database access.
- The generated password flow is trusted (low rate of admins immediately creating a PAT instead of using the generated password).

## Observability

## Observability

### Logging

| Log Event                         | Level   | Structured Context                                                                           | When                                              |
|-----------------------------------|---------|----------------------------------------------------------------------------------------------|---------------------------------------------------|
| `admin.users.create.success`      | `info`  | `admin_id`, `created_user_id`, `created_username`, `is_admin_grant`, `password_generated`, `duration_ms` | Successful user creation                          |
| `admin.users.create.denied`       | `warn`  | `user_id` (nullable), `reason`, `ip`, `user_agent`                                           | Unauthorized creation attempt                     |
| `admin.users.create.validation`   | `info`  | `admin_id`, `error_details`, `ip`                                                            | Request rejected due to validation failure        |
| `admin.users.create.conflict`     | `info`  | `admin_id`, `conflict_field` (username/email), `attempted_value`, `ip`                       | Duplicate username or email                       |
| `admin.users.create.error`        | `error` | `admin_id`, `error_message`, `stack_trace`, `ip`                                             | Internal error during user creation               |
| `admin.users.create.slow`         | `warn`  | `admin_id`, `duration_ms`                                                                    | Response time exceeds 2000ms threshold            |
| `admin.users.create.rate_limited` | `warn`  | `admin_id`, `ip`, `requests_in_window`                                                       | Admin hit rate limit for user creation            |

**CRITICAL:** The `password` field must NEVER appear in any log entry at any level. Request body logging must redact the `password` field.

### Prometheus Metrics

| Metric Name                                   | Type      | Labels                                       | Description                                                  |
|-----------------------------------------------|-----------|----------------------------------------------|--------------------------------------------------------------|
| `codeplane_admin_user_create_requests_total`  | Counter   | `status` (201, 400, 401, 409, 429, 500)      | Total admin user create requests by response status          |
| `codeplane_admin_user_create_duration_ms`     | Histogram | `status`                                     | Latency distribution (buckets: 50, 100, 250, 500, 1000, 2500, 5000ms) |
| `codeplane_admin_user_create_denied_total`    | Counter   | `reason` (not_authenticated, not_admin)       | Denied creation attempts                                     |
| `codeplane_admin_user_create_conflict_total`  | Counter   | `field` (username, email)                     | Conflict errors by conflicting field                         |
| `codeplane_admin_user_create_validation_total`| Counter   | `field` (username, email, display_name, password) | Validation errors by field                              |
| `codeplane_admin_user_create_password_type`   | Counter   | `type` (generated, provided)                  | Password source distribution                                 |
| `codeplane_users_total_active`                | Gauge     | —                                            | Total active users on the instance (incremented on create)   |

### Alerts

#### Alert: `AdminUserCreateHighErrorRate`
- **Condition:** `rate(codeplane_admin_user_create_requests_total{status="500"}[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `admin.users.create.error` entries — look for database connection failures, unique constraint race conditions, or bcrypt computation errors.
  2. Verify database connectivity: run `codeplane admin health` or `GET /api/admin/system/health`.
  3. Check for recent schema migrations that may have broken the `users` table or its unique indexes.
  4. Check if the bcrypt hashing is causing CPU pressure — high cost factors on underpowered hardware can cause timeouts.
  5. If the error is a unique constraint violation not caught by the service layer, check for a race condition in the duplicate-check-then-insert sequence and consider using an upsert or retry pattern.
  6. Escalate to the database team if the issue is a persistent write failure.

#### Alert: `AdminUserCreateHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_admin_user_create_duration_ms_bucket[5m])) > 3000`
- **Severity:** Warning
- **Runbook:**
  1. Check `admin.users.create.slow` log entries for the affected time period.
  2. Profile the bcrypt hashing step — it is computationally expensive and dominates request latency. Consider whether the cost factor is appropriate for the server hardware.
  3. Check database write latency — the INSERT query should be fast, but lock contention on the `users` table or its unique indexes could cause delays.
  4. Check for concurrent bulk user creation that might be saturating the bcrypt computation.
  5. If latency is consistently high, consider offloading password hashing to an async worker, though this changes the API contract.

#### Alert: `AdminUserCreateConflictSpike`
- **Condition:** `rate(codeplane_admin_user_create_conflict_total[5m]) > 2`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.users.create.conflict` log entries for patterns — is the same admin repeatedly trying to create the same username?
  2. This may indicate a UI bug where the form is being double-submitted, or a CLI script with a race condition.
  3. Check if an automated provisioning script is running without idempotency checks.
  4. No immediate action required — conflicts are handled gracefully. Monitor for admin frustration signals.

#### Alert: `AdminUserCreateDeniedSpike`
- **Condition:** `rate(codeplane_admin_user_create_denied_total[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.users.create.denied` log entries for source IPs and user agents.
  2. Determine if the spike is from a misconfigured integration, a user who lost admin privileges but still has cached credentials, or a potential privilege escalation attempt.
  3. If from a single IP or user, verify the account's admin status and assist if it's a legitimate configuration issue.
  4. If the pattern suggests an attack, consider IP-based blocking at the reverse proxy layer.

#### Alert: `AdminUserCreateRateLimitHit`
- **Condition:** `rate(codeplane_admin_user_create_requests_total{status="429"}[5m]) > 1`
- **Severity:** Info
- **Runbook:**
  1. Check `admin.users.create.rate_limited` logs to identify the admin user.
  2. Determine if this is a legitimate bulk provisioning need or an accidental tight loop.
  3. If legitimate bulk provisioning is needed, advise the admin to use a scripted approach with appropriate delays, or consider providing a bulk-create endpoint in a future release.
  4. If accidental, assist the admin in debugging their automation script.

### Error Cases and Failure Modes

| Failure Mode                          | Symptom                          | Behavior                                                                |
|---------------------------------------|----------------------------------|-------------------------------------------------------------------------|
| Database unreachable                  | 500 Internal Server Error        | Returns error JSON, logs `admin.users.create.error`                    |
| Database write timeout                | 500 or slow response             | Returns error JSON after timeout, logs slow query and error             |
| Unique constraint race condition      | 500 (if not caught) or 409       | Should be caught as 409; if not, logs error for investigation           |
| bcrypt computation timeout            | 500 or very slow response        | Logs `admin.users.create.slow`, returns error if timeout exceeded       |
| Invalid session/token                 | 401 Unauthorized                 | Returns error JSON, no database write attempted                         |
| Admin flag revoked mid-request        | 401 Unauthorized                 | `requireAdmin()` check fails, returns 401                               |
| Request body too large                | 413 or 400                       | Framework-level rejection before route handler                          |
| Malformed JSON body                   | 400 Bad Request                  | Returns "invalid request body", no database operation                   |
| Password hashing failure              | 500 Internal Server Error        | Logs error with stack trace, returns generic error                       |
| Generated password entropy failure    | 500 Internal Server Error        | Logs critical error — crypto PRNG unavailable is a serious issue        |

## Verification

## Verification

### API Integration Tests

| Test ID  | Test Description                                                                                          | Expected Result                                                         |
|----------|-----------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| API-01   | `POST /api/admin/users` with valid admin session and valid body returns 201 and a user object              | Status 201, body is object with `id`, `username`, `password`            |
| API-02   | Response contains all required fields: `id`, `username`, `display_name`, `email`, `avatar_url`, `bio`, `user_type`, `is_active`, `is_admin`, `prohibit_login`, `must_change_password`, `last_login_at`, `created_at`, `updated_at`, `password` | Every specified key is present |
| API-03   | Response does NOT contain internal fields: `lower_username`, `lower_email`, `search_vector`, `wallet_address`, `email_notifications_enabled` | None of the excluded keys are present |
| API-04   | Created user appears in `GET /api/admin/users` list                                                        | User with matching `id` and `username` exists in the list               |
| API-05   | Omitting `password` returns a generated password of at least 20 characters                                  | `password` field present, length ≥ 20                                   |
| API-06   | Providing an explicit `password` returns that same password in the response                                  | `response.password === provided_password`                               |
| API-07   | Omitting `display_name` defaults it to the username                                                         | `response.display_name === response.username`                           |
| API-08   | Providing `display_name` sets it correctly                                                                  | `response.display_name === provided_display_name`                       |
| API-09   | Omitting `must_change_password` defaults to `true`                                                          | `response.must_change_password === true`                                |
| API-10   | Setting `must_change_password` to `false` is respected                                                      | `response.must_change_password === false`                               |
| API-11   | Omitting `is_admin` defaults to `false`                                                                     | `response.is_admin === false`                                           |
| API-12   | Setting `is_admin` to `true` creates an admin user                                                          | `response.is_admin === true`                                            |
| API-13   | Created user has `is_active = true`                                                                         | `response.is_active === true`                                           |
| API-14   | Created user has `prohibit_login = false`                                                                   | `response.prohibit_login === false`                                     |
| API-15   | Created user has `last_login_at = null`                                                                     | `response.last_login_at === null`                                       |
| API-16   | `created_at` and `updated_at` are valid ISO 8601 date strings close to current time                        | Valid date parse, within 30 seconds of test execution time              |
| API-17   | Username with uppercase letters is normalized to lowercase                                                   | Send `"Alice"`, response has `username: "alice"`                        |
| API-18   | Username is trimmed of whitespace                                                                           | Send `" alice "`, response has `username: "alice"`                      |
| API-19   | Email is trimmed and lowercased                                                                             | Send `" Alice@Example.COM "`, response has `email: "alice@example.com"` |
| API-20   | Duplicate username returns 409 with "username is already in use"                                            | Status 409, body contains "username is already in use"                  |
| API-21   | Duplicate username differing only in case returns 409                                                        | Create `alice`, then try `Alice` → Status 409                           |
| API-22   | Duplicate email returns 409 with "email address is already in use"                                           | Status 409, body contains "email address is already in use"             |
| API-23   | Duplicate email differing only in case returns 409                                                           | Create with `a@x.com`, then try `A@X.COM` → Status 409                 |
| API-24   | Empty username returns 400                                                                                  | Status 400, error references username                                    |
| API-25   | Whitespace-only username returns 400                                                                        | Status 400, error references username                                    |
| API-26   | Empty email returns 400                                                                                     | Status 400, error references email                                       |
| API-27   | Whitespace-only email returns 400                                                                           | Status 400, error references email                                       |
| API-28   | Username of exactly 1 character (`a`) is accepted                                                           | Status 201                                                               |
| API-29   | Username of exactly 39 characters is accepted                                                               | Status 201                                                               |
| API-30   | Username of 40 characters returns 400                                                                       | Status 400                                                               |
| API-31   | Username with special characters (`@`, `_`, `.`, space) returns 400                                         | Status 400 for each invalid character                                    |
| API-32   | Username starting with hyphen (`-bob`) returns 400                                                          | Status 400                                                               |
| API-33   | Username ending with hyphen (`bob-`) returns 400                                                            | Status 400                                                               |
| API-34   | Username with consecutive hyphens (`bob--smith`) returns 400                                                | Status 400                                                               |
| API-35   | Username containing emoji returns 400                                                                       | Status 400                                                               |
| API-36   | Reserved username (`admin`) returns 400 or 409                                                              | Status 400 or 409                                                        |
| API-37   | Reserved username (`api`) returns 400 or 409                                                                | Status 400 or 409                                                        |
| API-38   | Reserved username (`settings`) returns 400 or 409                                                           | Status 400 or 409                                                        |
| API-39   | Email without `@` returns 400                                                                               | Status 400                                                               |
| API-40   | Email exceeding 254 characters returns 400                                                                  | Status 400                                                               |
| API-41   | Email of exactly 254 characters (valid format) is accepted                                                  | Status 201                                                               |
| API-42   | Display name of exactly 255 characters is accepted                                                          | Status 201, `display_name` length is 255                                 |
| API-43   | Display name of 256 characters returns 400                                                                  | Status 400                                                               |
| API-44   | Display name with Unicode characters (emoji, CJK, diacritics) is accepted                                   | Status 201, `display_name` preserved correctly                           |
| API-45   | Password of exactly 8 characters is accepted                                                                | Status 201                                                               |
| API-46   | Password of 7 characters returns 400                                                                        | Status 400                                                               |
| API-47   | Password of exactly 72 characters is accepted                                                               | Status 201                                                               |
| API-48   | Password of 73 characters returns 400                                                                       | Status 400                                                               |
| API-49   | Password with Unicode characters is accepted                                                                | Status 201                                                               |
| API-50   | Request without authentication returns 401                                                                  | Status 401, body contains "authentication required"                      |
| API-51   | Request with valid non-admin token returns 401                                                              | Status 401, body contains "admin access required"                        |
| API-52   | Request with expired/invalid token returns 401                                                              | Status 401                                                               |
| API-53   | Request with PAT having `write:admin` scope succeeds                                                        | Status 201                                                               |
| API-54   | Request with PAT having only `read:admin` scope is denied                                                   | Status 401                                                               |
| API-55   | Request with PAT lacking any admin scope is denied                                                          | Status 401                                                               |
| API-56   | Invalid JSON body returns 400 with "invalid request body"                                                   | Status 400                                                               |
| API-57   | Empty request body returns 400                                                                              | Status 400                                                               |
| API-58   | Request body with extra unknown fields still succeeds (fields ignored)                                       | Status 201, extra fields not in response                                 |
| API-59   | Created user can log in with the returned password (when `must_change_password = false`)                     | Login succeeds with username + password                                  |
| API-60   | Created user with `must_change_password = true` is prompted to change password on login                     | Login requires password change                                           |
| API-61   | Two rapid sequential creates with the same username — second returns 409                                    | First: 201, Second: 409                                                  |
| API-62   | Response includes `Cache-Control: no-store` header                                                          | Header present with value `no-store`                                     |
| API-63   | Creating a user with `is_admin = true` — user appears as admin in `GET /api/admin/users`                   | List shows `is_admin: true` for the new user                             |

### CLI E2E Tests

| Test ID  | Test Description                                                                                          | Expected Result                                                         |
|----------|-----------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| CLI-01   | `codeplane admin user create --username alice --email alice@example.com` exits 0                           | Exit code 0, stdout contains "User created successfully"                |
| CLI-02   | Output includes the generated password with a "will not be shown again" warning                            | Password string present, warning text present                            |
| CLI-03   | `--json` flag outputs valid JSON with `password` field                                                     | `JSON.parse(stdout)` succeeds, has `password` key                       |
| CLI-04   | `--password 'MyP@ssw0rd'` uses the provided password                                                       | Response password matches provided value                                 |
| CLI-05   | `--display-name 'Alice Smith'` sets the display name                                                       | Response `display_name` is "Alice Smith"                                 |
| CLI-06   | `--must-change-password=false` disables the password change requirement                                    | Response `must_change_password` is false                                 |
| CLI-07   | `--admin` flag creates an admin user                                                                       | Response `is_admin` is true                                              |
| CLI-08   | Missing `--username` flag returns error                                                                    | Exit code ≠ 0, stderr contains error about missing username             |
| CLI-09   | Missing `--email` flag returns error                                                                       | Exit code ≠ 0, stderr contains error about missing email                |
| CLI-10   | Duplicate username returns non-zero exit with conflict message                                              | Exit code 1, stderr contains "already in use"                           |
| CLI-11   | Non-admin token returns non-zero exit with auth error                                                      | Exit code 1, stderr contains error message                               |
| CLI-12   | No token returns non-zero exit with auth error                                                             | Exit code 1, stderr contains error message                               |
| CLI-13   | Invalid username (e.g., `@invalid`) returns non-zero exit with validation error                            | Exit code 1, stderr describes the validation failure                     |
| CLI-14   | `--password` with fewer than 8 chars returns validation error                                               | Exit code 1, stderr describes password length requirement                |

### Web UI Playwright Tests

| Test ID  | Test Description                                                                                          | Expected Result                                                         |
|----------|-----------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| UI-01    | Admin navigates to `/admin/users` and sees a "Create User" button                                         | Button element is visible                                                |
| UI-02    | Clicking "Create User" navigates to the creation form                                                     | Form with username, email, display name, password fields is visible      |
| UI-03    | Submitting valid form data creates a user and shows success message                                        | Success banner visible, password displayed                               |
| UI-04    | Generated password is displayed with copy-to-clipboard functionality                                       | Password card visible, copy button functional                            |
| UI-05    | "Save this password" warning is displayed                                                                 | Warning text visible                                                     |
| UI-06    | "Go to Users List" link navigates back to `/admin/users`                                                  | URL changes to `/admin/users`, new user visible in list                  |
| UI-07    | "Create Another" link resets the form                                                                     | Form fields are empty, ready for new input                               |
| UI-08    | Submitting with empty username shows inline validation error                                               | Error message visible on username field                                  |
| UI-09    | Submitting with empty email shows inline validation error                                                  | Error message visible on email field                                     |
| UI-10    | Submitting with invalid username format shows inline validation error                                      | Error message describes valid format                                     |
| UI-11    | Submitting with duplicate username shows inline conflict error on username field                            | Error message says username is taken                                     |
| UI-12    | Submitting with duplicate email shows inline conflict error on email field                                  | Error message says email is taken                                        |
| UI-13    | Submit button shows loading spinner during submission                                                       | Spinner visible, button disabled during request                          |
| UI-14    | Non-admin user navigating to create form sees access denied                                                | Error message or redirect                                                |
| UI-15    | Password show/hide toggle works                                                                            | Password input type toggles between `password` and `text`                |
| UI-16    | Display name character counter updates in real-time                                                        | Counter shows current length / 255                                       |
| UI-17    | Username field shows real-time format validation                                                           | Valid pattern shows check, invalid shows error styling                   |
| UI-18    | "Require Password Change" checkbox is checked by default                                                  | Checkbox is checked on form load                                         |
| UI-19    | "Grant Admin Privileges" checkbox is unchecked by default                                                 | Checkbox is unchecked on form load                                       |
| UI-20    | Form is keyboard-navigable (Tab through fields, Enter to submit)                                          | Focus moves correctly, Enter triggers submission                         |
| UI-21    | Server error (500) shows top-of-form error banner with retry                                               | Error banner visible with retry button                                   |
| UI-22    | Network error shows banner with retry action                                                               | Error banner visible                                                     |

### Cross-Client Consistency Tests

| Test ID  | Test Description                                                                                          | Expected Result                                                         |
|----------|-----------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| CC-01    | User created via API appears in CLI `admin user list` output                                               | User with matching username present in CLI output                        |
| CC-02    | User created via CLI appears in API `GET /api/admin/users` response                                        | User with matching username present in API response                      |
| CC-03    | User created via API with `is_admin = true` shows admin badge in web UI                                    | Admin badge visible in user list                                         |
| CC-04    | User created via CLI can log in through the web UI                                                         | Login succeeds with the password returned by CLI                         |
| CC-05    | Validation error messages are consistent between API and CLI (same error wording)                          | Error messages match between clients                                     |
| CC-06    | Conflict error messages are consistent between API and CLI                                                 | Error messages match between clients                                     |

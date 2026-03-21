# USER_PROFILE_UPDATE

Specification for USER_PROFILE_UPDATE.

## High-Level User POV

When you sign in to Codeplane, your profile is how the rest of the community sees you — your display name, avatar, and bio appear on repositories, issues, landing requests, and anywhere your username is shown. The profile update feature lets you shape that identity.

From the web UI, you navigate to your user settings page and see a simple form with your current display name, bio, and avatar. You edit whichever fields you like, hit save, and your changes take effect immediately across the entire platform. The next time someone visits your profile, clicks your name on an issue, or sees your avatar on a landing request, they see the updated information.

You can set a display name that's different from your username — a full name, a preferred name, or anything you want people to see alongside your @handle. Your bio is a short freeform blurb that tells people who you are and what you work on. Your avatar is represented by a URL pointing to an image hosted elsewhere; if you leave it empty, Codeplane shows a default generated avatar.

From the CLI, you can update your profile with `codeplane user update` and pass flags for the fields you want to change. This makes it easy to script or batch profile updates, or to adjust your profile from a terminal-first workflow without opening a browser.

The TUI exposes the same editing capability in a form-based screen accessible from the dashboard or settings area. VS Code and Neovim integrations surface your profile status in the status bar and can open the settings webview for editing.

Profile updates are partial — you only send the fields you want to change, and everything else stays the same. If you clear your display name, the system falls back to showing your username. If you clear your bio, it simply appears empty. If you provide an avatar URL that isn't a valid HTTP or HTTPS link, the system tells you immediately rather than silently accepting bad data.

Your profile is yours. Only you can edit it (or an admin acting on your behalf). No other user can modify your display name, bio, or avatar, and your private information like email address is never exposed through the public profile.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can update their own `display_name`, `bio`, and `avatar_url` via `PATCH /api/user`.
- [ ] The `POST /api/user/avatar` endpoint allows updating the avatar independently.
- [ ] Partial updates work correctly — omitted fields retain their current values.
- [ ] Updated fields are immediately reflected in `GET /api/user` and `GET /api/users/:username`.
- [ ] The web UI settings page shows the current profile values and allows inline editing with save.
- [ ] The CLI command `codeplane user update` supports `--display-name`, `--bio`, and `--avatar-url` flags.
- [ ] The TUI provides a profile edit screen with form fields for display name, bio, and avatar URL.
- [ ] All validation errors return structured error responses with field-level detail.
- [ ] The `updated_at` timestamp is refreshed on every successful profile update.
- [ ] All clients (web, CLI, TUI) show consistent validation error messages.

### Functional Criteria

- [ ] Sending an empty JSON body `{}` to `PATCH /api/user` is a no-op that returns the current profile unchanged (200, not an error).
- [ ] Sending `{ "display_name": "" }` clears the display name; subsequent profile views fall back to showing the username.
- [ ] Sending `{ "bio": "" }` clears the bio; the field is returned as an empty string, never `null`.
- [ ] Sending `{ "avatar_url": "" }` clears the avatar; the field is returned as an empty string, and UIs show a fallback avatar.
- [ ] Sending `{ "avatar_url": "https://example.com/photo.png" }` with a valid URL succeeds.
- [ ] Sending `{ "avatar_url": "ftp://example.com/photo.png" }` returns a 422 validation error because only HTTP/HTTPS is allowed.
- [ ] Sending `{ "avatar_url": "not-a-url" }` returns a 422 validation error.
- [ ] Leading and trailing whitespace on `display_name` is trimmed before storage.
- [ ] Leading and trailing whitespace on `avatar_url` is trimmed before storage.
- [ ] `bio` is stored as-is (whitespace is not trimmed) to preserve intentional formatting.
- [ ] The response body after a successful update contains the full `UserProfile` object with all updated fields.
- [ ] Concurrent updates from the same user are serialized and the last write wins; no 409 conflicts.
- [ ] Updates are idempotent — sending the same values again returns 200 with the same profile.

### Edge Cases

- [ ] A `display_name` consisting only of whitespace is trimmed to empty string (equivalent to clearing it).
- [ ] A `display_name` of exactly 255 characters succeeds.
- [ ] A `display_name` of 256 characters returns a 422 validation error with a field-level message.
- [ ] A `bio` of exactly 160 characters succeeds.
- [ ] A `bio` of 161 characters succeeds at the API level (storage allows it), but the web UI truncates display to 160 characters with ellipsis.
- [ ] A `bio` of exactly 500 characters succeeds (storage limit).
- [ ] A `bio` of 501 characters returns a 422 validation error.
- [ ] An `avatar_url` of 2048 characters (valid HTTPS URL) succeeds.
- [ ] An `avatar_url` of 2049 characters returns a 422 validation error.
- [ ] An `avatar_url` with a valid HTTPS URL but no image extension (e.g., `https://example.com/avatar`) succeeds — the server does not validate content type.
- [ ] Unicode characters in `display_name` and `bio` are accepted and preserved (emoji, CJK, Arabic, etc.).
- [ ] A `display_name` containing HTML tags stores them as literal text, not interpreted as HTML.
- [ ] A `bio` containing markdown-like syntax stores it as literal text.
- [ ] Sending unknown fields in the request body (e.g., `{ "username": "hacker" }`) does not update the username; unknown fields are ignored.
- [ ] An unauthenticated request to `PATCH /api/user` returns 401.
- [ ] A request with an expired or revoked token returns 401.
- [ ] The `email` field in the PATCH body is currently accepted but does NOT change the user's primary email through this endpoint (email changes go through the email management flow).
- [ ] A user who has been deactivated cannot update their profile (returns 404 as if user does not exist).

### Boundary Constraints

- [ ] `display_name`: 0–255 characters after trimming. Empty string is valid (clears the field).
- [ ] `bio`: 0–500 characters. Empty string is valid (clears the field).
- [ ] `avatar_url`: 0–2048 characters after trimming. Empty string is valid (clears the field). Non-empty value must be a valid HTTP or HTTPS URL with a non-empty host.
- [ ] Request body maximum size: 64 KB. Larger payloads return 413 or 400.
- [ ] All string fields are UTF-8 encoded. NUL bytes (`\0`) in any field return a 400 error.
- [ ] `updated_at` is always set to the server's current timestamp on successful update, regardless of whether field values actually changed.

## Design

### Web UI Design

**Route**: `/settings/profile` — accessible from the user settings sidebar under "Profile".

**Layout**:

- **Page Title**: "Profile" at the top of the settings content area.
- **Avatar Section**:
  - Current avatar displayed at 120×120px (rounded). Falls back to a generated identicon when `avatar_url` is empty.
  - Below the avatar, a text input for "Avatar URL" with placeholder text `https://example.com/your-avatar.png`.
  - Helper text: "Enter the URL of an image hosted elsewhere. Must be an HTTP or HTTPS link."
  - On valid URL change, a live preview of the new avatar appears alongside the current one.
- **Display Name Field**:
  - Text input labeled "Display name" with the current value pre-filled.
  - Helper text: "Your display name is shown alongside your @username. Max 255 characters."
  - Character counter showing `N / 255`.
- **Bio Field**:
  - Textarea labeled "Bio" with the current value pre-filled.
  - Helper text: "A short description of yourself. Max 500 characters. Only the first 160 characters are shown on your public profile card."
  - Character counter showing `N / 500`.
- **Save Button**:
  - Primary action button labeled "Update profile".
  - Disabled when no fields have changed from their loaded values.
  - Shows a loading spinner while the request is in flight.
  - On success, shows a toast notification: "Profile updated".
  - On validation error, shows inline error messages below the offending fields.
  - On network or server error, shows a toast: "Failed to update profile. Please try again."
- **Cancel / Reset**:
  - A secondary "Reset" link that reverts all fields to their last-saved values.

**Keyboard Accessibility**:
- Tab order: Avatar URL → Display name → Bio → Update profile button.
- Enter key in any text input submits the form.
- Escape key resets the form.

**Responsive Behavior**:
- On narrow viewports, the avatar section stacks vertically above the form fields.

### API Shape

#### Update Authenticated User Profile

```
PATCH /api/user
```

**Authentication**: Required (session cookie or PAT).

**Request Body** (`application/json`):
```json
{
  "display_name": "Jane Doe",
  "bio": "Building things with jj.",
  "avatar_url": "https://example.com/avatars/janedoe.png"
}
```

All fields are optional. Omitted fields are not changed. Explicitly setting a field to `""` clears it.

| Field          | Type   | Constraints                                     |
|----------------|--------|-------------------------------------------------|
| `display_name` | string | 0–255 characters after trimming                 |
| `bio`          | string | 0–500 characters                                |
| `avatar_url`   | string | 0–2048 characters; valid HTTP(S) URL if non-empty |
| `email`        | string | Accepted but reserved for email management flow |

**Success Response** (`200 OK`):
```json
{
  "id": 42,
  "username": "janedoe",
  "display_name": "Jane Doe",
  "email": "jane@example.com",
  "bio": "Building things with jj.",
  "avatar_url": "https://example.com/avatars/janedoe.png",
  "is_admin": false,
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2026-03-21T08:15:00.000Z"
}
```

**Error Responses**:

| Status | Condition                              | Body                                                                                  |
|--------|----------------------------------------|---------------------------------------------------------------------------------------|
| 400    | Malformed JSON body                    | `{ "message": "invalid request body" }`                                               |
| 401    | Not authenticated                      | `{ "message": "authentication required" }`                                            |
| 404    | User not found (deactivated)           | `{ "message": "user not found" }`                                                     |
| 413    | Body exceeds 64 KB                     | `{ "message": "request body too large" }`                                             |
| 422    | Invalid avatar_url format              | `{ "message": "validation failed", "errors": [{ "resource": "User", "field": "avatar_url", "code": "invalid" }] }` |
| 422    | display_name exceeds 255 chars         | `{ "message": "validation failed", "errors": [{ "resource": "User", "field": "display_name", "code": "invalid" }] }` |
| 422    | bio exceeds 500 chars                  | `{ "message": "validation failed", "errors": [{ "resource": "User", "field": "bio", "code": "invalid" }] }` |
| 422    | avatar_url exceeds 2048 chars          | `{ "message": "validation failed", "errors": [{ "resource": "User", "field": "avatar_url", "code": "invalid" }] }` |
| 429    | Rate limited                           | `{ "message": "rate limit exceeded" }` with `Retry-After` header                     |

#### Update Avatar (Dedicated Endpoint)

```
POST /api/user/avatar
```

**Authentication**: Required.

**Request Body**:
```json
{
  "avatar_url": "https://example.com/avatars/janedoe.png"
}
```

| Field       | Type   | Constraints                                      |
|-------------|--------|--------------------------------------------------|
| `avatar_url`| string | Required, non-empty, valid HTTP(S) URL, max 2048 |

**Success Response**: Same `UserProfile` shape as `PATCH /api/user`.

**Error Responses**: Same as `PATCH /api/user`, plus `400` if `avatar_url` is missing or empty.

### SDK Shape

The `UserService` class in `@codeplane/sdk` exposes:

```typescript
updateAuthenticatedUser(
  userID: number,
  req: {
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    email?: string;
  }
): Promise<Result<UserProfile, APIError>>
```

The `UserProfile` type returned:
```typescript
interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  email: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}
```

The SDK client used by web, TUI, and CLI:
```typescript
api.user.update({
  display_name?: string;
  bio?: string;
  avatar_url?: string;
}): Promise<UserProfile>
```

### CLI Command

```
codeplane user update [flags]
```

**Flags**:
| Flag              | Short | Type   | Description                   |
|-------------------|-------|--------|-------------------------------|
| `--display-name`  | `-d`  | string | Set the display name          |
| `--bio`           | `-b`  | string | Set the bio                   |
| `--avatar-url`    | `-a`  | string | Set the avatar URL            |
| `--json`          |       | bool   | Output raw JSON response      |

**Behavior**:
- At least one flag must be provided. If none are given, print usage help and exit with code 1.
- On success (exit code 0), print the updated profile in human-readable format:
  ```
  ✓ Profile updated

  @janedoe (Jane Doe)
  Building things with jj.
  ```
- With `--json`, print the full `UserProfile` JSON.
- On validation error, print the error message to stderr and exit with code 1.
- On auth failure, print "Not authenticated. Run `codeplane auth login` first." to stderr and exit with code 1.

**Clear a field**: Pass an empty string, e.g. `--display-name ""`.

### TUI UI

**Screen**: "Edit Profile" — accessible from the dashboard sidebar or settings menu.

**Layout**:
- Form with three fields rendered as Ink `<TextInput>` components:
  - Display Name (single line)
  - Bio (multi-line, up to 5 visible lines)
  - Avatar URL (single line)
- Each field shows the current saved value as the initial value.
- A "Save" button (focused with Tab) triggers the PATCH request.
- A status line at the bottom shows "Saving…", "✓ Profile updated", or the error message.
- Escape exits the screen without saving.

### Neovim Plugin API

The Neovim plugin does not expose a direct profile edit command but provides:
- `:Codeplane status` — shows the current user's display name and username in the status area.
- `:Codeplane dashboard` — opens the web UI where the user can navigate to profile settings.

### VS Code Extension

The VS Code extension provides:
- Status bar item showing the authenticated user's display name.
- Command `codeplane.openSettings` that opens the Codeplane web UI settings page in a webview or browser.
- After a profile update via the web UI, the status bar refreshes on the next sync cycle.

### Documentation

- **API Reference — Users**: Document `PATCH /api/user` and `POST /api/user/avatar` with full request/response schemas, all error codes, and validation rules.
- **CLI Reference — `user update`**: Document all flags, usage examples for setting each field, clearing fields with empty strings, and `--json` output.
- **Web Guide — Profile Settings**: Step-by-step guide showing how to update display name, bio, and avatar from the settings page, with screenshots of the form, character counters, and validation feedback.
- **FAQ**: "How do I change my username?" → Usernames cannot be changed through the profile update feature. Contact an admin if a username change is needed.

## Permissions & Security

### Authorization Roles

| Action                                  | Anonymous | Authenticated (Self) | Authenticated (Other) | Admin |
|-----------------------------------------|-----------|----------------------|-----------------------|-------|
| Update own profile (`PATCH /api/user`)  | ❌        | ✅                    | ❌                    | ✅ (via admin API) |
| Update own avatar (`POST /api/user/avatar`) | ❌   | ✅                    | ❌                    | ✅ (via admin API) |
| View updated profile (public)           | ✅        | ✅                    | ✅                    | ✅     |

- Only the authenticated user can update their own profile via `/api/user`.
- There is no mechanism for one user to update another user's profile through this endpoint.
- Admin users can modify any user's profile through the admin API (`/api/admin/users/:id`), which is a separate feature.

### Rate Limiting

- **Authenticated callers**: 30 profile update requests per hour per user. Profile updates are infrequent by nature; this limit prevents automated abuse while allowing reasonable editing sessions.
- **Burst tolerance**: Up to 5 requests in a 10-second window, then throttled.
- Rate limit responses use `429 Too Many Requests` with a `Retry-After` header indicating seconds until the next allowed request.
- The dedicated avatar endpoint (`POST /api/user/avatar`) shares the same rate limit budget as `PATCH /api/user`.

### Data Privacy & PII

- The `display_name` and `bio` are considered public data and are exposed via `GET /api/users/:username`.
- The `email` field in the `UserProfile` response is only returned to the authenticated user themselves, never via the public profile endpoint.
- The `avatar_url` is public data. Users should be informed that any URL they provide will be fetched by browsers of other users visiting their profile — they should only use URLs they control.
- The server MUST NOT fetch or proxy the avatar URL server-side to avoid SSRF vulnerabilities. The URL is stored as-is and rendered client-side.
- Profile updates are logged with the user ID and request ID but MUST NOT log the full request body (which may contain PII) at INFO level. Full body logging is acceptable at DEBUG level only.
- The `is_admin` field is returned to the authenticated user but MUST NOT be modifiable through the `PATCH /api/user` endpoint.
- The `username` field MUST NOT be modifiable through this endpoint.

## Telemetry & Product Analytics

### Key Business Events

| Event Name               | Trigger                                          | Properties                                                                                              |
|--------------------------|--------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `UserProfileUpdated`     | `PATCH /api/user` returns 200                    | `user_id`, `client` (web/cli/tui/api), `fields_changed` (array of field names that differed from previous values, e.g. `["display_name", "bio"]`), `display_name_set` (bool), `bio_set` (bool), `avatar_url_set` (bool) |
| `UserAvatarUpdated`      | `POST /api/user/avatar` returns 200              | `user_id`, `client`, `avatar_url_domain` (domain of the new avatar URL, e.g. `gravatar.com`)            |
| `UserProfileUpdateFailed`| `PATCH /api/user` returns 4xx                    | `user_id` (nullable if 401), `client`, `error_status` (400/401/422/429), `failed_field` (if 422)        |
| `UserProfileEditStarted` | User opens the profile settings page in Web UI   | `user_id`, `client` (web)                                                                               |
| `UserProfileEditAbandoned`| User navigates away from settings without saving | `user_id`, `client` (web), `time_on_page_seconds`, `fields_modified_count`                              |

### Funnel Metrics & Success Indicators

- **Profile completion rate**: Percentage of users who have set a non-empty `display_name`, `bio`, and `avatar_url`. Target: >40% of active users.
- **Profile edit conversion rate**: Of users who open the settings page (`UserProfileEditStarted`), what percentage successfully save changes (`UserProfileUpdated`). Target: >70%.
- **Profile update frequency**: Average number of profile updates per active user per month. Expected: 0.5–2. A spike may indicate a UX issue (users struggling to save correctly).
- **Field adoption**: Breakdown of which fields users update most frequently. If `bio` adoption is low, consider prompting users to add a bio after signup.
- **Client distribution**: Breakdown of profile updates by client (web vs CLI vs TUI). Helps prioritize client investment.
- **Validation error rate**: Percentage of update attempts that result in 422 errors. Target: <5%. A high rate suggests unclear UI constraints or confusing documentation.

## Observability

### Logging Requirements

| Log Event                          | Level | Structured Context                                                                                   |
|------------------------------------|-------|------------------------------------------------------------------------------------------------------|
| Profile update success             | INFO  | `user_id`, `request_id`, `fields_changed` (array of field names), `response_time_ms`, `client_ip`    |
| Profile update validation error    | WARN  | `user_id`, `request_id`, `failed_field`, `validation_code`, `client_ip`                               |
| Profile update auth failure        | WARN  | `request_id`, `client_ip`, `auth_method` (cookie/pat/none)                                           |
| Profile update rate limited        | WARN  | `user_id`, `request_id`, `client_ip`, `retry_after_seconds`                                          |
| Avatar update success              | INFO  | `user_id`, `request_id`, `avatar_url_domain`, `response_time_ms`                                    |
| Avatar update validation error     | WARN  | `user_id`, `request_id`, `validation_code`, `client_ip`                                              |
| Profile update DB error            | ERROR | `user_id`, `request_id`, `error_message`, `stack_trace`, `response_time_ms`                          |
| Profile update unexpected error    | ERROR | `user_id`, `request_id`, `error_message`, `stack_trace`                                              |

**Rules**:
- NEVER log the full request body at INFO or WARN level (it contains PII).
- At DEBUG level, the full request body may be logged for development troubleshooting.
- All log entries MUST include `request_id` for correlation.

### Prometheus Metrics

| Metric Name                                           | Type      | Labels                                     | Description                                              |
|-------------------------------------------------------|-----------|--------------------------------------------|----------------------------------------------------------|
| `codeplane_user_profile_update_requests_total`            | Counter   | `status` (200/400/401/404/422/429/500), `client` | Total profile update requests                           |
| `codeplane_user_profile_update_duration_seconds`          | Histogram | `status`                                   | Latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5)|
| `codeplane_user_avatar_update_requests_total`             | Counter   | `status`, `client`                         | Total avatar-specific update requests                    |
| `codeplane_user_profile_update_validation_errors_total`   | Counter   | `field` (display_name/bio/avatar_url)      | Validation errors broken down by field                   |
| `codeplane_user_profile_update_rate_limited_total`        | Counter   | (none)                                     | Total rate-limited profile update attempts               |
| `codeplane_user_profile_fields_updated_total`             | Counter   | `field` (display_name/bio/avatar_url)      | Count of individual field updates (one increment per field per request) |

### Alerts

#### Alert: Profile Update Error Spike
- **Condition**: `rate(codeplane_user_profile_update_requests_total{status="500"}[5m]) > 0.1` sustained for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check server ERROR logs filtered by the `user_profile_update` tag for stack traces.
  2. Verify database connectivity by checking the connection pool metrics and running a health check query.
  3. Check if the `users` table is locked by a migration or long-running transaction (`SELECT * FROM pg_stat_activity WHERE state = 'active'`).
  4. Verify the user service was correctly initialized by checking server startup logs.
  5. If errors started after a deployment, roll back to the previous version.
  6. If errors are isolated to specific user IDs, check for data corruption on those rows.

#### Alert: Elevated Profile Update Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_user_profile_update_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool utilization — if saturated, increase pool size or investigate connection leaks.
  2. Run `EXPLAIN ANALYZE` on the `UPDATE users SET ... WHERE id = $1` query to check for missing indexes (primary key index should always be present).
  3. Check for table bloat on the `users` table; run `VACUUM ANALYZE users` if needed.
  4. Check if concurrent bulk operations (migrations, backfills) are contending with profile updates.
  5. Review server CPU and memory metrics for resource exhaustion.

#### Alert: High Validation Error Rate
- **Condition**: `rate(codeplane_user_profile_update_validation_errors_total[15m]) / rate(codeplane_user_profile_update_requests_total[15m]) > 0.2` sustained for 15 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check which field is producing the most validation errors by examining the `field` label breakdown.
  2. If `avatar_url` is the primary source, investigate whether users are confused about the URL format or pasting relative URLs.
  3. If `display_name` length is the source, check if the Web UI character counter is working correctly.
  4. Review recent UI deployments for regressions in client-side validation.
  5. If a single user is generating most errors, check for programmatic abuse and consider reaching out.

#### Alert: Profile Update Rate Limiting Spike
- **Condition**: `rate(codeplane_user_profile_update_rate_limited_total[5m]) > 5` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify the source user(s) from access logs.
  2. Determine if the traffic is from a legitimate script (e.g., migration tool) or abuse.
  3. For legitimate automation, advise the user on batch update strategies or temporary rate limit increases.
  4. For abuse, verify the rate limit configuration is appropriate and consider additional IP-based restrictions.

### Error Cases and Failure Modes

| Failure Mode                                | Expected Behavior                                                    | Detection                                |
|---------------------------------------------|----------------------------------------------------------------------|------------------------------------------|
| Database unavailable                        | Return 500 with `{ "message": "internal error" }`. Log ERROR.       | `status=500` counter spike               |
| Database timeout on UPDATE                  | Return 500 after timeout. Log ERROR with timeout context.            | Latency histogram p95 alert              |
| User row deleted between fetch and update   | Return 404. Service re-fetches after update; null → 404.             | Normal 404 counter                       |
| Body larger than 64 KB                      | Return 413 before parsing. No service call made.                     | 413 counter (low priority)               |
| Malformed JSON body                         | Return 400 with parse error message.                                 | 400 counter                              |
| NUL bytes in string fields                  | Return 400. Database would reject anyway.                            | 400 counter                              |
| Extremely long avatar_url (within limit)    | Accept and store. URL resolution is client-side.                     | No alert needed                          |
| Invalid UTF-8 in body                       | Return 400 at JSON parse level.                                      | 400 counter                              |
| Concurrent PATCH from same user             | Both succeed; last write wins. No conflict.                          | No specific detection needed             |
| Service registry not initialized            | Return 500 (null reference). Log ERROR.                              | `status=500` counter on startup          |

## Verification

### API Integration Tests

| #  | Test Description                                                    | Method                     | Expected                                                                                                     |
|----|---------------------------------------------------------------------|----------------------------|--------------------------------------------------------------------------------------------------------------|
| 1  | Update display_name only                                            | `PATCH /api/user` `{ "display_name": "New Name" }` | 200, `display_name === "New Name"`, other fields unchanged                                                  |
| 2  | Update bio only                                                     | `PATCH /api/user` `{ "bio": "Hello world" }`       | 200, `bio === "Hello world"`, other fields unchanged                                                        |
| 3  | Update avatar_url only                                              | `PATCH /api/user` `{ "avatar_url": "https://example.com/a.png" }` | 200, `avatar_url === "https://example.com/a.png"`                                               |
| 4  | Update all three fields simultaneously                              | `PATCH /api/user` `{ "display_name": "A", "bio": "B", "avatar_url": "https://x.com/c.png" }` | 200, all three fields updated                |
| 5  | Empty body `{}` is a no-op                                          | `PATCH /api/user` `{}`                              | 200, profile unchanged, `updated_at` refreshed                                                              |
| 6  | Clear display_name with empty string                                | `PATCH /api/user` `{ "display_name": "" }`          | 200, `display_name === ""`                                                                                  |
| 7  | Clear bio with empty string                                         | `PATCH /api/user` `{ "bio": "" }`                   | 200, `bio === ""`                                                                                           |
| 8  | Clear avatar_url with empty string                                  | `PATCH /api/user` `{ "avatar_url": "" }`            | 200, `avatar_url === ""`                                                                                    |
| 9  | display_name whitespace is trimmed                                  | `PATCH /api/user` `{ "display_name": "  Foo  " }`  | 200, `display_name === "Foo"`                                                                               |
| 10 | avatar_url whitespace is trimmed                                    | `PATCH /api/user` `{ "avatar_url": " https://x.com/a.png " }` | 200, `avatar_url === "https://x.com/a.png"`                                                    |
| 11 | Invalid avatar_url (ftp protocol) returns 422                       | `PATCH /api/user` `{ "avatar_url": "ftp://x.com/a" }` | 422, validation error on `avatar_url`                                                                     |
| 12 | Invalid avatar_url (no protocol) returns 422                        | `PATCH /api/user` `{ "avatar_url": "not-a-url" }`  | 422, validation error on `avatar_url`                                                                       |
| 13 | Invalid avatar_url (javascript: protocol) returns 422               | `PATCH /api/user` `{ "avatar_url": "javascript:alert(1)" }` | 422, validation error on `avatar_url`                                                              |
| 14 | Invalid avatar_url (data: URI) returns 422                          | `PATCH /api/user` `{ "avatar_url": "data:image/png;base64,..." }` | 422, validation error on `avatar_url`                                                            |
| 15 | display_name at max length (255 chars) succeeds                     | `PATCH /api/user` `{ "display_name": "A".repeat(255) }` | 200                                                                                                  |
| 16 | display_name over max length (256 chars) returns 422                | `PATCH /api/user` `{ "display_name": "A".repeat(256) }` | 422, validation error on `display_name`                                                              |
| 17 | bio at max storage length (500 chars) succeeds                      | `PATCH /api/user` `{ "bio": "B".repeat(500) }`     | 200                                                                                                         |
| 18 | bio over max storage length (501 chars) returns 422                 | `PATCH /api/user` `{ "bio": "B".repeat(501) }`     | 422, validation error on `bio`                                                                              |
| 19 | avatar_url at max length (2048 chars) succeeds                      | `PATCH /api/user` with 2048-char HTTPS URL          | 200                                                                                                         |
| 20 | avatar_url over max length (2049 chars) returns 422                 | `PATCH /api/user` with 2049-char HTTPS URL          | 422, validation error on `avatar_url`                                                                       |
| 21 | Unicode emoji in display_name preserved                             | `PATCH /api/user` `{ "display_name": "Jane 🚀 Doe" }` | 200, `display_name === "Jane 🚀 Doe"`                                                                    |
| 22 | CJK characters in bio preserved                                     | `PATCH /api/user` `{ "bio": "こんにちは世界" }`     | 200, `bio === "こんにちは世界"`                                                                               |
| 23 | HTML in display_name stored as literal text                         | `PATCH /api/user` `{ "display_name": "<script>alert(1)</script>" }` | 200, stored as literal string, not interpreted                                             |
| 24 | Unknown fields ignored (username not changed)                       | `PATCH /api/user` `{ "username": "hacker" }`        | 200, `username` unchanged from original                                                                     |
| 25 | Unknown fields ignored (is_admin not changed)                       | `PATCH /api/user` `{ "is_admin": true }`            | 200, `is_admin` unchanged from original                                                                     |
| 26 | Unauthenticated request returns 401                                 | `PATCH /api/user` with no auth header               | 401                                                                                                         |
| 27 | Expired token returns 401                                           | `PATCH /api/user` with expired PAT                  | 401                                                                                                         |
| 28 | `updated_at` changes after successful update                        | Two sequential `PATCH /api/user` calls              | Second `updated_at` > first `updated_at`                                                                    |
| 29 | Response matches UserProfile shape                                  | `PATCH /api/user` `{ "display_name": "X" }`         | Response has exactly: `id`, `username`, `display_name`, `email`, `bio`, `avatar_url`, `is_admin`, `created_at`, `updated_at` |
| 30 | `created_at` is not modified by profile update                      | `PATCH /api/user` `{ "bio": "new" }`                | `created_at` matches pre-update value                                                                       |
| 31 | Public profile reflects update immediately                          | Update `bio` via PATCH, then `GET /api/users/:username` | Public profile `bio` matches updated value                                                             |
| 32 | Email is NOT exposed on public profile after update                 | `PATCH /api/user` then `GET /api/users/:username`   | Public response does not contain `email` key                                                                |
| 33 | Idempotent update (same values) returns 200                         | Send same body twice                                 | Both return 200 with identical bodies (except possibly `updated_at`)                                        |
| 34 | `POST /api/user/avatar` with valid URL succeeds                    | `POST /api/user/avatar` `{ "avatar_url": "https://x.com/a.png" }` | 200, `avatar_url` updated                                                                |
| 35 | `POST /api/user/avatar` with empty URL returns 400                 | `POST /api/user/avatar` `{ "avatar_url": "" }`     | 400, "avatar_url is required"                                                                               |
| 36 | `POST /api/user/avatar` with missing field returns 400             | `POST /api/user/avatar` `{}`                        | 400, "avatar_url is required"                                                                               |
| 37 | `POST /api/user/avatar` with invalid URL returns 422               | `POST /api/user/avatar` `{ "avatar_url": "bad" }`  | 422, validation error                                                                                       |
| 38 | `POST /api/user/avatar` unauthenticated returns 401                | No auth header                                       | 401                                                                                                         |
| 39 | Malformed JSON body returns 400                                     | `PATCH /api/user` with body `{invalid`              | 400                                                                                                         |
| 40 | `Content-Type: text/plain` returns 400 or 415                      | PATCH with wrong content type                        | 400 or 415, not 500                                                                                         |
| 41 | Only-whitespace display_name trimmed to empty                       | `PATCH /api/user` `{ "display_name": "   " }`      | 200, `display_name === ""`                                                                                  |
| 42 | bio with leading/trailing whitespace NOT trimmed                    | `PATCH /api/user` `{ "bio": " hello " }`           | 200, `bio === " hello "` (whitespace preserved)                                                             |

### CLI E2E Tests

| #  | Test Description                                                   | Command                                              | Expected                                                                   |
|----|--------------------------------------------------------------------|------------------------------------------------------|----------------------------------------------------------------------------|
| 43 | Update display name via CLI                                        | `codeplane user update --display-name "CLI User"`       | Exit 0, stdout contains "Profile updated" and "CLI User"                   |
| 44 | Update bio via CLI                                                 | `codeplane user update --bio "Updated from CLI"`        | Exit 0, stdout contains "Profile updated"                                  |
| 45 | Update avatar URL via CLI                                          | `codeplane user update --avatar-url "https://x.com/a.png"` | Exit 0, stdout contains "Profile updated"                              |
| 46 | Update multiple fields via CLI                                     | `codeplane user update --display-name "A" --bio "B"`   | Exit 0, both fields updated                                               |
| 47 | JSON output for profile update                                     | `codeplane user update --display-name "JSON" --json`   | Exit 0, stdout is valid JSON with `display_name === "JSON"`                |
| 48 | Clear display name via CLI                                         | `codeplane user update --display-name ""`              | Exit 0, display_name cleared                                               |
| 49 | No flags shows help and exits non-zero                             | `codeplane user update`                                 | Exit 1, stderr contains usage information                                  |
| 50 | Invalid avatar URL via CLI                                         | `codeplane user update --avatar-url "bad-url"`         | Exit 1, stderr contains error about invalid URL                            |
| 51 | Unauthenticated CLI update                                         | `codeplane user update --display-name "X"` (no auth)   | Exit 1, stderr contains auth error message                                 |
| 52 | Verify update persists via user view                               | `codeplane user update --bio "check"` then `codeplane user view --json` | Second command output contains `"bio": "check"`                |

### Web UI E2E Tests (Playwright)

| #  | Test Description                                                   | Expected                                                                     |
|----|--------------------------------------------------------------------|------------------------------------------------------------------------------|
| 53 | Navigate to `/settings/profile` shows profile form                 | Page contains "Display name", "Bio", "Avatar URL" inputs                     |
| 54 | Form pre-populated with current profile values                     | Input values match the authenticated user's current profile                  |
| 55 | Edit display name and save                                         | Toast shows "Profile updated", page reflects new name                        |
| 56 | Edit bio and save                                                  | Bio field updated, subsequent page load shows new bio                        |
| 57 | Edit avatar URL and save                                           | Avatar preview updates, profile page shows new avatar                        |
| 58 | Save button disabled when no changes                               | Button has `disabled` attribute when form matches saved state                |
| 59 | Save button enabled after making changes                           | Button loses `disabled` attribute when a field is modified                   |
| 60 | Character counter shows correct count for display name             | Counter updates as user types, shows "N / 255"                               |
| 61 | Character counter shows correct count for bio                      | Counter updates as user types, shows "N / 500"                               |
| 62 | Invalid avatar URL shows inline error                              | Typing an invalid URL and saving shows error below the avatar URL field      |
| 63 | Clearing all fields and saving works                               | All fields cleared, toast shown, subsequent load shows empty fields          |
| 64 | Reset button reverts unsaved changes                               | After editing but not saving, clicking reset restores original values        |
| 65 | Loading spinner shown during save                                  | Button shows spinner after click, disappears after response                  |
| 66 | Network error shows error toast                                    | Simulated network failure shows "Failed to update profile" toast             |
| 67 | Updated profile visible on public profile page                     | After saving new display name, navigate to `/:username`, see new name        |
| 68 | Form is keyboard-accessible                                        | Tab navigates through fields and to save button; Enter submits               |
| 69 | Long display name (255 chars) accepted in form                     | Save succeeds with 255-character display name                                |
| 70 | Display name exceeding 255 chars shows client-side validation      | UI prevents submission or shows error before server roundtrip                |

### TUI E2E Tests

| #  | Test Description                                                   | Expected                                                                     |
|----|--------------------------------------------------------------------|------------------------------------------------------------------------------|
| 71 | Edit profile screen renders with current values                    | Fields show current display_name, bio, avatar_url                            |
| 72 | Editing display name and saving updates profile                    | Status line shows "Profile updated"                                          |
| 73 | Escape exits without saving                                        | Profile unchanged after pressing Escape                                      |

### Load & Boundary Tests

| #  | Test Description                                                   | Expected                                                                     |
|----|--------------------------------------------------------------------|------------------------------------------------------------------------------|
| 74 | Profile update responds within 500ms at p95                        | Latency check passes under normal load                                       |
| 75 | 50 concurrent update requests from same user all succeed           | All return 200 (last write wins)                                             |
| 76 | 100 concurrent update requests from different users all succeed    | All return 200                                                               |
| 77 | Request body of exactly 64 KB succeeds (within limit)              | 200 (if fields within individual constraints)                                |
| 78 | Request body of 65 KB returns 413 or 400                           | 413 or 400, not 500                                                          |
| 79 | Rapid sequential updates (10 in 5 seconds) within burst limit      | All succeed                                                                  |
| 80 | Exceeding rate limit returns 429 with Retry-After header           | 429, header present with valid integer value                                 |

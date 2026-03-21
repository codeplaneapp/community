# USER_NOTIFICATION_SETTINGS_UPDATE

Specification for USER_NOTIFICATION_SETTINGS_UPDATE.

## High-Level User POV

Codeplane keeps you informed about what matters — issue assignments, comments on your landing requests, workspace status changes, workflow completions, and mentions across the platform. But notifications are only useful if you control which ones reach you and how. The notification settings update feature gives you that control.

From the web UI, you open your user settings and find the notifications page. There you see your current preferences — right now, the primary control is whether Codeplane delivers email notifications to you at all. When email notifications are enabled, Codeplane sends you messages for issue assignments, comments, landing request reviews, workspace status changes, and workflow completions. When you toggle them off, Codeplane stops generating those notification records entirely for your account. It's a single, clear on/off switch that governs whether the notification fanout system considers you a valid recipient.

This isn't about marking individual notifications as read or clearing your inbox — those are separate actions. This feature is about configuring the upstream behavior: should Codeplane produce notifications for you in the first place?

From the CLI, you update your notification preferences with a straightforward command, passing a flag to enable or disable email notifications. This is useful for automation, scripting onboarding flows, or quickly toggling notifications during focused work periods without opening a browser.

The TUI exposes the same toggle in its settings flow. Editor integrations (VS Code and Neovim) can surface your notification status and link to the settings webview where you can adjust it.

The change takes effect immediately. The moment you disable email notifications, the next event that would have notified you — an issue assignment, a review on your landing request, a mention in a comment — simply skips you. The moment you re-enable them, you're back in the loop. There's no batching delay, no "changes will take effect in 24 hours" caveat. The setting is read in real time by the notification fanout service.

This feature matters because notification noise is one of the top reasons developers disengage from a forge. Giving users a reliable, instant way to control their notification volume is essential to keeping them engaged on their own terms.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can update their notification preferences via the API, CLI, and web UI, and the updated preferences are immediately respected by the notification fanout system when deciding whether to create notification records for that user.

### Functional Constraints

- A user MUST be authenticated to update notification settings. Unauthenticated requests return `401 Unauthorized`.
- Only the authenticated user can update their own notification settings. There is no endpoint for one user to modify another user's notification preferences (admin user management is a separate surface).
- The request body is a JSON object with optional fields. Omitted fields retain their current values (partial update semantics).
- The `email_notifications_enabled` field, when provided, MUST be a boolean (`true` or `false`). Non-boolean values (strings, numbers, null) MUST be rejected with `422 Validation Failed`.
- Sending an empty JSON body `{}` MUST be treated as a no-op: the current preferences are returned unchanged with a `200 OK` response. This is not an error.
- Sending `{ "email_notifications_enabled": true }` when the setting is already `true` MUST succeed idempotently, returning the unchanged preferences with `200 OK`.
- Sending `{ "email_notifications_enabled": false }` when the setting is already `false` MUST succeed idempotently, returning the unchanged preferences with `200 OK`.
- On success, the response MUST return `200 OK` with a JSON body containing the full current state of the user's notification preferences after the update.
- The `updated_at` timestamp on the user record MUST be refreshed on every successful update that changes a value.
- The updated preference MUST take effect immediately. The notification fanout service reads the `email_notifications_enabled` value from the user record at fan-out time, so disabling notifications immediately stops new notification creation for that user.
- When `email_notifications_enabled` is `false`, the notification fanout service MUST skip that user entirely during fan-out — no notification row is created and no `pg_notify` is emitted for them.
- When `email_notifications_enabled` is `true` (or re-enabled), the notification fanout service MUST resume creating notifications for that user for all subsequent events.
- Disabling notifications MUST NOT delete or modify any existing notifications already in the user's inbox. Previously created notifications remain readable and markable.
- Re-enabling notifications MUST NOT retroactively create notifications for events that occurred while notifications were disabled.
- The user's notification preference state MUST be consistent across all surfaces: what the API returns, what the web UI shows, and what the CLI reports must agree.

### Edge Cases

- Submitting a non-JSON content type (e.g., `text/plain`, `application/x-www-form-urlencoded`) MUST return `400 Bad Request`.
- Submitting malformed JSON (e.g., `{email_notifications_enabled: true}` without quotes) MUST return `400 Bad Request`.
- Submitting unknown/extra fields in the JSON body (e.g., `{ "email_notifications_enabled": true, "push_enabled": true }`) MUST be silently ignored; only recognized preference fields are processed.
- Submitting `{ "email_notifications_enabled": null }` MUST be rejected with `422 Validation Failed` (null is not a valid boolean).
- Submitting `{ "email_notifications_enabled": "true" }` (string instead of boolean) MUST be rejected with `422 Validation Failed`.
- Submitting `{ "email_notifications_enabled": 1 }` (number instead of boolean) MUST be rejected with `422 Validation Failed`.
- Submitting a request body larger than the server's maximum allowed body size MUST return `413 Payload Too Large` or equivalent.
- If the authenticated user's account has been deactivated between authentication and the settings update call, the request MUST return `404 Not Found` (user not found).
- Concurrent updates from the same user are serialized by the database; the last write wins with no `409 Conflict`.
- A request with a valid session cookie, a valid PAT with write scope, or a valid OAuth2 bearer token MUST all be accepted equivalently.
- A request with an expired or revoked PAT MUST return `401 Unauthorized`.

### Boundary Constraints

- The request body MUST NOT exceed 1 KB. Bodies larger than this are rejected before parsing.
- The only currently recognized preference field is `email_notifications_enabled` (boolean). The contract is designed for forward-compatible extension with additional preference fields in the future.

## Design

### API Shape

**Endpoint:** `PUT /api/user/settings/notifications`

**Authentication:** Required. Session cookie, `Authorization: token <PAT>`, or OAuth2 bearer token with write scope.

**Request Headers:**
- `Content-Type: application/json` (required for mutations; enforced by middleware)

**Request Body:**
```json
{
  "email_notifications_enabled": false
}
```

All fields are optional. Omitted fields are left unchanged.

**Success Response: `200 OK`**
```json
{
  "email_notifications_enabled": false
}
```

**Error Responses:**

| Status | Condition |
|--------|----------|
| `400 Bad Request` | Non-JSON content type or malformed JSON body |
| `401 Unauthorized` | Missing, expired, or invalid authentication |
| `404 Not Found` | Authenticated user's account no longer exists or is deactivated |
| `422 Validation Failed` | `email_notifications_enabled` is not a boolean |
| `500 Internal Server Error` | Database update failure |

### Web UI Design

**Location:** User Settings > Notifications (route: `/settings/notifications`)

**Layout:**
- Page title: "Notification Preferences"
- A settings card with a clear heading and description.

**Controls:**
- A labeled toggle switch for "Email notifications" with descriptive help text beneath it: "Receive notifications for issue assignments, comments, reviews, workspace updates, and workflow completions."
- The toggle reflects the current server-side state on page load.
- Toggling the switch immediately sends a `PUT /api/user/settings/notifications` request.
- While the request is in flight, the toggle shows a loading/saving indicator and is disabled to prevent double-submission.
- On success, a transient success toast appears: "Notification preferences updated."
- On failure, the toggle reverts to its previous state and a transient error toast appears with the error message.

**Navigation:**
- The notifications settings page is accessible from the user settings sidebar under "Notifications".
- The page is listed alongside other settings pages: Profile, Emails, SSH Keys, API Tokens, Connected Accounts, Notifications.

### CLI Command

**Command:** `codeplane notification settings update`

**Flags:**
- `--email-notifications` (boolean, optional): Enable or disable email notifications. Accepts `true` or `false`.

**Usage:**
```
# Disable email notifications
codeplane notification settings update --email-notifications=false

# Enable email notifications
codeplane notification settings update --email-notifications=true
```

**Output (JSON mode):**
```json
{
  "email_notifications_enabled": false
}
```

**Output (human-readable mode):**
```
Notification preferences updated.
  Email notifications: disabled
```

**Exit codes:**
- `0` on success
- `1` on error

### TUI UI

**Screen:** Settings > Notification Preferences

**Layout:**
- A form screen with a labeled checkbox or toggle for "Email notifications".
- Help text below the toggle explaining what it controls.
- A save/apply action with auto-save behavior or explicit save keybinding.
- Status indicator showing "Saved" or "Error" after update.

### SDK Shape

The SDK's `UserService` exposes:

**`getNotificationPreferences(userID: number)`** — Returns `Result<NotificationPreferences, APIError>` where `NotificationPreferences` is `{ email_notifications_enabled: boolean }`.

**`updateNotificationPreferences(userID: number, req: UpdateNotificationPreferencesRequest)`** — Returns `Result<NotificationPreferences, APIError>` where `UpdateNotificationPreferencesRequest` is `{ email_notifications_enabled?: boolean }`. Reads current state, merges the partial update, writes the merged state, and returns the full post-update preferences.

### Documentation

1. **User Guide: Managing Notification Preferences** — A short guide explaining how to enable/disable email notifications from the web UI, CLI, and TUI. Include screenshots of the web UI toggle. Explain that the change takes effect immediately and does not affect existing notifications in the inbox.

2. **CLI Reference: `codeplane notification settings update`** — Command reference with flag documentation, usage examples, and expected output formats for both JSON and human-readable modes.

3. **API Reference: `PUT /api/user/settings/notifications`** — Endpoint documentation including authentication requirements, request/response schemas, error codes, and example cURL commands.

## Permissions & Security

### Authorization

- **Authenticated User (any role):** Can update their own notification preferences. This is a self-service setting with no role hierarchy — every authenticated user controls their own notifications.
- **Anonymous / Unauthenticated:** Cannot access this endpoint. Returns `401 Unauthorized`.
- **Admin:** Admins update their own preferences through the same endpoint. There is no admin override to change another user's notification preferences through this endpoint; admin-level user management is a separate surface.

### Rate Limiting

- The endpoint MUST be subject to the platform's standard authenticated-user rate limit.
- An additional per-user rate limit of **10 requests per minute** SHOULD be applied to this specific endpoint to prevent toggle-spamming (accidental or automated).
- Rate limit violations return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy

- The notification preferences object contains no PII — it is a single boolean preference field.
- The response MUST NOT leak any user fields beyond the notification preferences themselves (no email, no internal IDs, no admin status).
- The `PUT` endpoint operates exclusively on the authenticated user's own record. There is no path parameter for a target user ID, eliminating IDOR risk by design.
- Audit logs for preference changes SHOULD record the user ID and the old/new values, but MUST NOT be exposed to other users.

## Telemetry & Product Analytics

### Business Events

**`NotificationSettingsUpdated`**
- Fired on every successful preference update that changes at least one value.
- Properties:
  - `user_id` (string): The user who updated their preferences.
  - `email_notifications_enabled` (boolean): The new value of the email notifications setting.
  - `previous_email_notifications_enabled` (boolean): The value before the update.
  - `source` (string): The client surface that initiated the update (`web`, `cli`, `tui`, `api`).
  - `timestamp` (ISO 8601 string): When the update occurred.

**`NotificationSettingsViewed`** *(companion event, for context)*
- Fired when a user views their notification settings page.
- Properties:
  - `user_id` (string)
  - `source` (string)
  - `email_notifications_enabled` (boolean): The current value at view time.

### Funnel Metrics & Success Indicators

- **Adoption rate:** Percentage of active users who have visited the notification settings page at least once.
- **Opt-out rate:** Percentage of users who have disabled email notifications. A high opt-out rate may signal notification fatigue or poor notification relevance.
- **Re-enable rate:** Percentage of users who disabled notifications and later re-enabled them. A healthy re-enable rate suggests users value the control but still find notifications useful.
- **Toggle frequency:** Average number of preference changes per user per month. Very high values may indicate UX confusion or automation misuse.
- **Notification volume before/after opt-out:** Correlation between notification volume and opt-out decisions, to inform future granular preference controls.

## Observability

### Logging

| Log Event | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| `notification_preferences_update_requested` | `info` | `user_id`, `request_id` | On receiving a valid PUT request |
| `notification_preferences_update_success` | `info` | `user_id`, `request_id`, `email_notifications_enabled` (new value), `changed` (boolean) | After successful database update |
| `notification_preferences_update_failed` | `error` | `user_id`, `request_id`, `error_code`, `error_message` | On any failure (validation, DB, auth) |
| `notification_preferences_validation_error` | `warn` | `user_id`, `request_id`, `field`, `reason` | When a submitted field fails type validation |
| `notification_preferences_user_not_found` | `warn` | `user_id`, `request_id` | When the authenticated user's row is missing from the DB |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_notification_preferences_update_total` | Counter | `status` (`success`, `error`), `changed` (`true`, `false`) | Total notification preference update attempts |
| `codeplane_notification_preferences_update_duration_seconds` | Histogram | `status` | Latency of the full update request (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_notification_preferences_email_enabled_total` | Gauge | — | Current count of users with email notifications enabled (updated on change) |
| `codeplane_notification_preferences_rate_limited_total` | Counter | — | Number of requests rejected by rate limiting on this endpoint |

### Alerts

**Alert: `NotificationPreferencesUpdateErrorRateHigh`**
- **Condition:** `rate(codeplane_notification_preferences_update_total{status="error"}[5m]) / rate(codeplane_notification_preferences_update_total[5m]) > 0.1` sustained for 5 minutes.
- **Severity:** Warning
- **Runbook:**
  1. Check the `notification_preferences_update_failed` logs for the dominant `error_code`.
  2. If `error_code` is `internal` or `500`, investigate database connectivity: check PostgreSQL connection pool health, query latency, and error logs.
  3. If `error_code` is `not_found`, check whether a user migration or deactivation job is running that may be removing user rows mid-session.
  4. If `error_code` is `422`, check whether a client is sending malformed payloads (likely a client bug or API consumer error). Examine request bodies in logs.
  5. If the error rate resolves within 10 minutes, it was likely a transient database issue. Monitor for recurrence.
  6. If persistent, page the on-call database engineer.

**Alert: `NotificationPreferencesUpdateLatencyHigh`**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_notification_preferences_update_duration_seconds_bucket[5m])) > 0.5` sustained for 10 minutes.
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency for the `UpdateUserNotificationPreferences` query specifically.
  2. Check for table lock contention on the `users` table.
  3. Review PostgreSQL slow query logs for queries matching the `UPDATE users SET email_notifications_enabled` pattern.
  4. Check connection pool saturation in the server metrics.
  5. If the latency spike correlates with a deployment, consider rolling back.
  6. If isolated to this endpoint, investigate whether a large batch update or migration is contending for the same rows.

**Alert: `NotificationOptOutRateSpike`**
- **Condition:** More than 5% of active users disable email notifications within a 24-hour window (computed from `NotificationSettingsUpdated` events where `email_notifications_enabled` changed from `true` to `false`).
- **Severity:** Info (product alert, not ops)
- **Runbook:**
  1. Check whether a notification volume spike preceded the opt-out wave (high-volume workflow runs, mass issue creation, etc.).
  2. Check whether a product change or marketing email prompted users to visit settings.
  3. Review the notification fanout logs for unusually high per-user notification counts.
  4. If opt-outs correlate with a specific event type, consider adding per-type notification controls as a product follow-up.
  5. Share findings with the product team for triage.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Recovery |
|------------|-------------|----------|
| User not authenticated | `401` | Client redirects to login |
| Request body is not valid JSON | `400` | Client fixes request format |
| `email_notifications_enabled` is not a boolean | `422` | Client fixes value type |
| User record not found in database | `404` | Likely deactivated account; no user action possible |
| Database write failure (connection lost) | `500` | Automatic retry by client; if persistent, ops investigation required |
| Database write failure (constraint violation) | `500` | Should not occur for this query; investigate schema corruption |
| Rate limited | `429` | Client waits per `Retry-After` header and retries |

## Verification

### API Integration Tests

- [ ] `PUT /api/user/settings/notifications` with `{ "email_notifications_enabled": false }` returns `200` with `{ "email_notifications_enabled": false }`.
- [ ] `PUT /api/user/settings/notifications` with `{ "email_notifications_enabled": true }` returns `200` with `{ "email_notifications_enabled": true }`.
- [ ] `PUT /api/user/settings/notifications` with `{}` (empty body) returns `200` with the current unchanged preferences.
- [ ] `PUT /api/user/settings/notifications` without authentication returns `401`.
- [ ] `PUT /api/user/settings/notifications` with an expired PAT returns `401`.
- [ ] `PUT /api/user/settings/notifications` with a revoked PAT returns `401`.
- [ ] `PUT /api/user/settings/notifications` with `{ "email_notifications_enabled": null }` returns `422`.
- [ ] `PUT /api/user/settings/notifications` with `{ "email_notifications_enabled": "true" }` returns `422`.
- [ ] `PUT /api/user/settings/notifications` with `{ "email_notifications_enabled": 1 }` returns `422`.
- [ ] `PUT /api/user/settings/notifications` with `{ "email_notifications_enabled": 0 }` returns `422`.
- [ ] `PUT /api/user/settings/notifications` with `{ "email_notifications_enabled": "yes" }` returns `422`.
- [ ] `PUT /api/user/settings/notifications` with a non-JSON content type returns `400`.
- [ ] `PUT /api/user/settings/notifications` with malformed JSON body returns `400`.
- [ ] `PUT /api/user/settings/notifications` with extra unknown fields `{ "email_notifications_enabled": true, "push_enabled": true }` returns `200` and ignores the unknown field.
- [ ] After disabling notifications, `GET /api/user/settings/notifications` returns `{ "email_notifications_enabled": false }`.
- [ ] After re-enabling notifications, `GET /api/user/settings/notifications` returns `{ "email_notifications_enabled": true }`.
- [ ] Idempotent update: setting `email_notifications_enabled` to `true` when it is already `true` returns `200` with no error.
- [ ] Idempotent update: setting `email_notifications_enabled` to `false` when it is already `false` returns `200` with no error.

### Notification Fanout Integration Tests

- [ ] With `email_notifications_enabled: true`, triggering an issue assignment for the user creates a notification record in their inbox.
- [ ] With `email_notifications_enabled: false`, triggering an issue assignment for the user does NOT create a notification record.
- [ ] Disabling notifications does not delete existing unread notifications in the user's inbox.
- [ ] Re-enabling notifications does not retroactively create notifications for events that occurred while disabled.
- [ ] With `email_notifications_enabled: false`, triggering a landing request review for the user does NOT create a notification.
- [ ] With `email_notifications_enabled: false`, triggering a comment mention for the user does NOT create a notification.
- [ ] With `email_notifications_enabled: true`, the real-time SSE notification stream delivers new notifications after re-enabling.

### CLI Integration Tests

- [ ] `codeplane notification settings update --email-notifications=false` succeeds with exit code `0` and outputs the updated preferences.
- [ ] `codeplane notification settings update --email-notifications=true` succeeds with exit code `0` and outputs the updated preferences.
- [ ] `codeplane notification settings update --email-notifications=false --json` returns valid JSON with `{ "email_notifications_enabled": false }`.
- [ ] `codeplane notification settings update` without authentication returns exit code `1` with an auth error message.
- [ ] After `codeplane notification settings update --email-notifications=false`, running `codeplane notification settings view` shows notifications are disabled.

### Web UI End-to-End Tests (Playwright)

- [ ] Navigate to `/settings/notifications` — the page loads and shows the current notification toggle state.
- [ ] Toggle email notifications off — the toggle visually changes, a success toast appears, and refreshing the page shows the toggle in the off position.
- [ ] Toggle email notifications on — the toggle visually changes, a success toast appears, and refreshing the page shows the toggle in the on position.
- [ ] Toggle email notifications off while unauthenticated (session expired) — an error toast appears and the toggle reverts to its previous state.
- [ ] The notification settings page is accessible from the user settings sidebar navigation.
- [ ] The notification toggle shows a loading state while the PUT request is in flight.
- [ ] Rapidly clicking the toggle multiple times does not cause inconsistent state (debounce or disable during flight).

### Boundary and Stress Tests

- [ ] Sending a request body of exactly 1 KB (maximum allowed) succeeds if the JSON is valid.
- [ ] Sending a request body of 1 KB + 1 byte is rejected with `413` or `400`.
- [ ] Sending 10 valid update requests within 1 minute from the same user succeeds (within rate limit).
- [ ] Sending 20 valid update requests within 1 minute from the same user triggers rate limiting on the excess requests (`429`).
- [ ] Concurrent `PUT` requests from the same user with conflicting values (`true` and `false`) both succeed individually; the final database state reflects the last write.

### Cross-Client Consistency Tests

- [ ] Update notification preferences via the API, then read them via the CLI — values match.
- [ ] Update notification preferences via the CLI, then read them via the API — values match.
- [ ] Update notification preferences via the web UI, then read them via the CLI and API — values match across all three surfaces.

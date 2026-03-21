# USER_NOTIFICATION_SETTINGS_VIEW

Specification for USER_NOTIFICATION_SETTINGS_VIEW.

## High-Level User POV

Your notification preferences determine how and when Codeplane contacts you about activity across your repositories and collaborations. The notification settings view gives you a single, clear place to understand and control your notification behavior.

When you open your user settings and navigate to the "Notifications" section, you see your current notification configuration at a glance. The most prominent control is the master email notifications toggle — this determines whether Codeplane creates in-app notifications for you at all. When notifications are enabled, you receive real-time alerts about issues assigned to you, comments on your issues and landing requests, reviews on your landing requests, workspace status changes, and workflow run completions. When notifications are disabled, Codeplane's fanout pipeline skips you entirely, and your inbox stays silent.

The settings view is read-only — it shows you exactly what your current preferences are. This is important because the view and the update are separate product actions. You can visit this page to audit your configuration without worrying about accidentally changing anything. The companion update action (a separate feature) lets you flip toggles and save changes.

From the CLI, you can inspect your notification preferences with a simple command and see the same information rendered as structured JSON output. This is useful for scripting, auditing, or confirming your preferences from a terminal-first workflow. The API endpoint that backs this view is the single source of truth — whether you check from the web, CLI, or any other client, you see the same data.

The notification settings view is strictly private. Only you can see your own notification preferences. Other users, including organization admins, have no access to your personal notification configuration through this endpoint. Platform administrators can access user preferences through separate admin surfaces, but the user-facing endpoint is scoped to your own account only.

This view is the starting point for all notification management decisions. It tells you whether you are currently receiving notifications, and it anchors the broader notification experience — the inbox, the SSE real-time stream, the fanout pipeline — in a clear, auditable user preference.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can retrieve their own notification preferences via `GET /api/user/settings/notifications`.
- [ ] The response is a JSON object containing `email_notifications_enabled` (boolean).
- [ ] The web UI settings page at `/settings/notifications` displays the current notification preference state with a clear visual indicator for enabled/disabled.
- [ ] The CLI command `codeplane notification settings` outputs the current preferences as JSON.
- [ ] Unauthenticated requests return 401 with no preference data leaked.
- [ ] All clients (web, CLI, API) display consistent preference values for the same user.
- [ ] The view is strictly read-only — no mutations occur when viewing preferences.

### Functional Criteria

- [ ] The response body is always a JSON object, never null or an array.
- [ ] The object contains exactly the field `email_notifications_enabled` (boolean).
- [ ] The `email_notifications_enabled` field is `true` when notifications are enabled, `false` when disabled.
- [ ] The response does not contain any internal-only fields (e.g., `id`, `username`, `email`, `updated_at`, `created_at`).
- [ ] The response does not contain preferences belonging to other users.
- [ ] The response Content-Type header is `application/json`.
- [ ] The endpoint is safe and idempotent — calling it does not modify any state.
- [ ] The endpoint uses the authenticated user's identity from the session, not from a URL parameter.

### Edge Cases

- [ ] A user who has never explicitly updated their notification preferences sees the system default (`email_notifications_enabled: true`).
- [ ] A user who signed up via GitHub OAuth and has never visited settings sees the default preference.
- [ ] A user who disabled notifications and then re-enabled them sees `email_notifications_enabled: true`.
- [ ] A user who was created by an admin (non-interactive account) has valid default preferences.
- [ ] If the user record exists but has a `null` value for `email_notifications_enabled` in the database, the endpoint returns a deterministic default (`true`) rather than `null`.
- [ ] Concurrent reads of the same user's preferences from multiple clients return consistent values.
- [ ] A user whose account is deactivated (`is_active: false`) but still has a valid session receives 401 or 403, not their preferences.
- [ ] A user with `prohibit_login: true` cannot access this endpoint.
- [ ] The endpoint remains responsive when the notification preferences column has just been updated by a concurrent write.

### Boundary Constraints

- [ ] `email_notifications_enabled`: boolean (no other type accepted in response).
- [ ] Response payload size: ~50 bytes. No pagination needed.
- [ ] Request has no body (GET). Any body content is ignored.
- [ ] No query parameters accepted. Unknown query parameters are silently ignored.
- [ ] All string values UTF-8 encoded.
- [ ] Response object always has exactly one key (`email_notifications_enabled`). Future preference keys may be added but must not break existing consumers.

## Design

### Web UI Design

**Route**: `/settings/notifications` — accessible from the user settings sidebar under "Notifications".

**Layout**:

- **Page Title**: "Notification preferences" at the top of the settings content area.
- **Description Text**: "Control how Codeplane notifies you about activity in your repositories, issues, landing requests, and workspaces."
- **Preference Display**:
  - A card-style section titled "Email & in-app notifications".
  - Inside the card, a single row containing:
    - **Label**: "Enable notifications" in standard body text.
    - **Description**: "When enabled, you receive in-app notifications for issues assigned to you, comments, reviews, workspace events, and workflow completions. When disabled, Codeplane's notification pipeline skips your account entirely."
    - **Status Indicator**: A clearly visible pill/badge showing "Enabled" (green) or "Disabled" (gray/red) reflecting the current value of `email_notifications_enabled`.
    - **Toggle Control**: A toggle switch reflecting the current state. The toggle is rendered in the view, but toggling it triggers the companion `USER_NOTIFICATION_SETTINGS_UPDATE` feature. The view itself is read-only in the sense that it loads and displays the current state.
  - Below the toggle, a contextual info note:
    - When enabled: "You will receive notifications for: issue assignments, issue comments, landing request reviews, landing request comments, workspace status changes, workspace sharing, and workflow run completions."
    - When disabled: "You are not receiving any notifications. Enable notifications to stay informed about activity."
- **Loading State**: Skeleton placeholder with shimmer animation over the preference card.
- **Error State**: Inline error banner: "Failed to load notification preferences. Please try again." with a "Retry" button.
- **Empty/Default State**: If the user has never modified preferences, display the default enabled state with no special indicator.

**Keyboard Accessibility**: Tab navigates to the toggle. Screen reader announces "Enable notifications, currently [on/off]".

**Responsive Behavior**: On narrow viewports, the description text wraps below the label. Toggle remains inline-end aligned.

**Sidebar Integration**: The settings sidebar highlights "Notifications" when this route is active. The sidebar item shows a bell icon.

### API Shape

**Endpoint**: `GET /api/user/settings/notifications`

**Authentication**: Required (session cookie or `Authorization: token <PAT>`).

**Request**: No query parameters. No request body.

**Success Response** (`200 OK`):
```json
{
  "email_notifications_enabled": true
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `email_notifications_enabled` | boolean | Whether the user receives notifications from the fanout pipeline |

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 404 | User record not found (defensive) | `{ "message": "user not found" }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| 500 | Internal server error | `{ "message": "internal server error" }` |

### SDK Shape

The `UserService` class in `@codeplane/sdk` exposes:

```typescript
getNotificationPreferences(userID: number): Promise<Result<NotificationPreferences, APIError>>
```

The `NotificationPreferences` type:
```typescript
interface NotificationPreferences {
  email_notifications_enabled: boolean;
}
```

The SDK method accepts a numeric user ID, returns `Result<NotificationPreferences, APIError>`, queries the user record for the `email_notifications_enabled` column, and returns a `404` error if the user record does not exist.

### CLI Command

Notification preferences are viewable via a dedicated subcommand:

```bash
codeplane notification settings
```

**Output**: JSON object printed to stdout. Exit code `0` on success, non-zero on error.

```json
{
  "email_notifications_enabled": true
}
```

Structured output filtering applies: users can pipe through `--json` field filters per standard CLI behavior.

Alternatively, the generic API passthrough command also works:

```bash
codeplane api /api/user/settings/notifications
```

### TUI UI

The TUI does not currently have a dedicated notification settings screen. Notification preferences are accessible via the generic API flow. If a TUI notification settings screen is added, it should display a simple key-value view:

```
Notification Preferences
────────────────────────
Email notifications:  ✅ Enabled
```

### Neovim Plugin API

The Neovim plugin exposes notification preference viewing via:

- `:Codeplane notification-settings` — prints current notification preferences to the command line.
- `:Codeplane dashboard` — opens the web UI where notification settings can be managed.

### VS Code Extension

The VS Code extension provides:

- `codeplane.openNotificationSettings` command — opens the web UI notification settings page in the default browser or embedded webview.
- Status bar tooltip shows "Notifications: enabled" or "Notifications: disabled" as part of the daemon status display.

### Documentation

- **"Managing your notification preferences"** guide: viewing preferences from web settings and CLI, what the email notifications toggle controls, which event types generate notifications (issue assignments, comments, reviews, workspace events, workflow completions), and how disabling notifications affects the fanout pipeline.
- **API Reference**: `GET /api/user/settings/notifications` with full response schema, error codes, and authentication requirements.
- **CLI Reference**: `codeplane notification settings` command documentation with output format and examples.
- **FAQ**: "What happens when I disable notifications?" (fanout pipeline skips your account — no in-app notifications are created), "Can I selectively disable certain notification types?" (not yet — the current preference is a global toggle; granular per-type preferences are planned).

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Self) | Authenticated (Other) | Org Admin | Platform Admin |
|--------|-----------|----------------------|-----------------------|-----------|----------------|
| View own notification preferences (`GET /api/user/settings/notifications`) | ❌ | ✅ | ❌ | ❌ | ✅ (via admin API) |

- Only the authenticated user can view their own notification preferences via `/api/user/settings/notifications`.
- There is no mechanism to view another user's notification preferences through this endpoint.
- The user ID is derived from the authenticated session, not from a URL parameter. There is no path-based user targeting, eliminating IDOR risk by design.
- Organization admins cannot access a member's notification preferences through this endpoint.
- Platform admin users can view any user's preferences through the admin API (`/api/admin/users/:id`), which is a separate feature surface.
- Users with `prohibit_login: true` or `is_active: false` must not be able to access this endpoint even if they possess a valid session token — the auth middleware must enforce account status checks.

### Rate Limiting

- **Authenticated users**: Subject to the standard authenticated rate limit (5,000 requests/hour). Preference viewing is a lightweight read-only operation.
- **Unauthenticated callers**: Subject to the standard unauthenticated rate limit (60 requests/hour) — they will hit 401 before any data is returned, but the rate limit still applies to prevent auth-probing floods.
- **Burst tolerance**: Up to 10 requests in a 5-second window, then throttled.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in every response.
- Exceeding the rate limit returns `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- Notification preferences are not PII themselves, but the endpoint requires authentication and must never leak preferences for other users.
- The response must not include the user's `id`, `email`, `username`, or any other identifying field — only the preference values.
- Server logs must not log the preference values at INFO level (although the values are not PII, consistent logging hygiene is preferred). The `user_id` accessing the endpoint may be logged.
- The endpoint should include `Cache-Control: no-store` to prevent proxy caching of personal preferences.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `NotificationPreferencesViewed` | `GET /api/user/settings/notifications` returns 200 | `user_id`, `email_notifications_enabled` (current value), `client` (web/cli/tui/api/vscode/neovim) |
| `NotificationPreferencesViewFailed` | `GET /api/user/settings/notifications` returns 4xx/5xx | `user_id` (nullable if 401), `client`, `error_status` (401/404/429/500) |
| `NotificationSettingsPageOpened` | User navigates to `/settings/notifications` in Web UI | `user_id`, `client` (web), `referrer_path` (where the user navigated from) |

### Funnel Metrics & Success Indicators

- **Notification settings visit rate**: Percentage of active users who visit the notification settings page at least once per month. Baseline expectation: ~3–5% of active users. Target: at least 8% of active users visit within 30 days of account creation.
- **Preference awareness ratio**: Of users who visit notification settings, what percentage subsequently update their preferences (tracked by the companion `USER_NOTIFICATION_SETTINGS_UPDATE` feature). A high view-to-update ratio suggests users are finding and understanding the controls.
- **Opt-out rate**: Percentage of users who have `email_notifications_enabled: false`. Healthy range: 5–15%. Above 30% suggests the notification system is too noisy; below 2% suggests users are unaware they can control notifications.
- **Client distribution**: Breakdown of preference view requests by client (web vs CLI vs raw API). Helps prioritize client investment.
- **Error rate**: Percentage of preference view requests returning non-200 responses. Target: <0.5% (excluding 401 from unauthenticated callers).
- **P99 latency**: Target under 50ms (single-row SELECT by primary key).

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Notification preferences requested | DEBUG | `user_id`, `request_id` |
| Notification preferences returned | DEBUG | `user_id`, `email_notifications_enabled`, `request_id`, `response_time_ms` |
| Notification preferences auth failure | WARN | `request_id`, `client_ip`, `auth_method` (cookie/pat/none) |
| Notification preferences rate limited | WARN | `user_id`, `request_id`, `client_ip`, `retry_after_seconds` |
| Notification preferences user not found | WARN | `user_id`, `request_id`. Indicates possible data integrity issue — user authenticated but row missing. |
| Notification preferences service error | ERROR | `user_id`, `request_id`, `error_code`, `error_message`, `stack_trace`, `response_time_ms` |

**Rules**: All log entries must include `request_id` for correlation. Preference values may be logged at DEBUG level since they are not PII. Production log level should be INFO or above.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_notification_prefs_view_total` | Counter | `status` (200/401/404/429/500) | Total notification preferences view requests by response status |
| `codeplane_notification_prefs_view_duration_seconds` | Histogram | — | Request duration. Buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5 |
| `codeplane_notification_prefs_view_rate_limited_total` | Counter | — | Total rate-limited preference view attempts |
| `codeplane_notification_prefs_enabled_ratio` | Gauge | — | Ratio of users with notifications enabled (updated periodically via background job) |

### Alerts

#### Alert: `NotificationPrefsViewHighErrorRate`
**Condition**: `rate(codeplane_notification_prefs_view_total{status="500"}[5m]) / rate(codeplane_notification_prefs_view_total[5m]) > 0.05`
**Severity**: Warning
**Runbook**:
1. Check server ERROR logs filtered by `request_id` for the failing requests.
2. Verify database connectivity — the preferences query is a simple single-row SELECT by primary key; failures usually indicate a DB connection issue.
3. Check if the `users` table is accessible and not locked by a migration.
4. Verify the `email_notifications_enabled` column exists on the `users` table — a failed migration could drop or rename it.
5. If transient (e.g., connection pool exhaustion), monitor for 5 more minutes. If persistent, restart the server process and investigate connection pool settings.
6. If errors are isolated to specific user IDs, check for data corruption on those user rows.
7. Escalate to the database team if upstream.

#### Alert: `NotificationPrefsViewHighLatency`
**Condition**: `histogram_quantile(0.99, rate(codeplane_notification_prefs_view_duration_seconds_bucket[5m])) > 0.2`
**Severity**: Warning
**Runbook**:
1. Check database query latency for the `getUserNotificationPreferences` query. This is a primary-key lookup; elevated latency is unusual.
2. Verify that the primary key index on `users(id)` is intact.
3. Check for table bloat or vacuum backlog on the `users` table.
4. Check overall database load, connection pool saturation, and server CPU/memory.
5. If the database is healthy, check for middleware-level latency (rate limiter, auth context loading).
6. If systemic, consider whether a recent deployment introduced a regression in the auth middleware or service registry.

#### Alert: `NotificationPrefsViewAuthFailureSpike`
**Condition**: `rate(codeplane_notification_prefs_view_total{status="401"}[5m]) > 50`
**Severity**: Info
**Runbook**:
1. May indicate credential-stuffing or enumeration attempt targeting the settings API.
2. Check source IP distribution in logs for auth failure entries.
3. If concentrated from few IPs, consider temporary IP-level rate limiting.
4. Verify legitimate clients aren't misconfigured with expired tokens (common after token rotation).
5. No immediate action unless rate exceeds 500/5m, then escalate to security.

#### Alert: `NotificationPrefsViewUserNotFoundSpike`
**Condition**: `rate(codeplane_notification_prefs_view_total{status="404"}[5m]) > 5`
**Severity**: Warning
**Runbook**:
1. A 404 means the user passed authentication but their user row was not found — this indicates a data integrity issue.
2. Check if user deletion is running concurrently with active sessions.
3. Verify the auth middleware is correctly resolving user IDs from session tokens.
4. Check if a database migration or restore dropped user rows.
5. Cross-reference the `user_id` values from WARN logs with the `users` table to confirm the rows are missing.
6. Escalate to the data integrity team if more than 10 occurrences in 15 minutes.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | Detection | Recovery |
|-------------|-------------------|-----------|----------|
| Database unavailable | Return 500 with `{ "message": "internal server error" }`. Log ERROR. | `status=500` counter spike | Automatic retry by client; server health check |
| Database timeout on SELECT | Return 500 after timeout. Log ERROR. | Latency histogram p99 alert | Retry; investigate if persistent |
| User row deleted between auth and preference fetch | Return 404 with `{ "message": "user not found" }`. Log WARN. | `status=404` counter | Investigate user deletion path |
| Auth cookie/token expired or revoked | Return 401. No service call. | Normal 401 counter | User re-authenticates |
| Auth middleware misconfiguration | Return 401 for all requests. | Mass 401 alert | Restart server, check middleware |
| Service registry not initialized | Return 500 (null reference). Log ERROR. | `status=500` on startup | Restart server, check startup logs |
| User table schema mismatch after migration | Return 500. Log ERROR. | `status=500` spike after deployment | Roll back migration or fix schema |
| Rate limited | Return 429 with `Retry-After`. | Rate limit counter | Wait and retry |
| `email_notifications_enabled` column is NULL | SDK returns default `true`. No error. | Logged at DEBUG with `null_default` flag | No action needed; expected for legacy rows |

## Verification

### API Integration Tests

| # | Test Description | Method / Setup | Expected |
|---|-----------------|----------------|----------|
| 1 | Retrieve notification preferences for authenticated user | `GET /api/user/settings/notifications` with valid PAT | 200, response is a JSON object |
| 2 | Response contains `email_notifications_enabled` field | `GET /api/user/settings/notifications` | Object has key `email_notifications_enabled` |
| 3 | `email_notifications_enabled` is a boolean | `GET /api/user/settings/notifications` | `typeof email_notifications_enabled === "boolean"` |
| 4 | Response object has exactly one key | `GET /api/user/settings/notifications` | `Object.keys(body).length === 1` |
| 5 | No internal fields leaked (id, email, username, updated_at, created_at) | `GET /api/user/settings/notifications` | None of `id`, `email`, `username`, `updated_at`, `created_at` present as keys |
| 6 | Default preference for new user is `email_notifications_enabled: true` | Create new user, then `GET /api/user/settings/notifications` | `email_notifications_enabled === true` |
| 7 | Unauthenticated request returns 401 | `GET /api/user/settings/notifications` with no auth | 401, no preference data in body |
| 8 | Request with invalid PAT returns 401 | `GET /api/user/settings/notifications` with `Authorization: token garbage` | 401 |
| 9 | Request with expired/revoked PAT returns 401 | `GET /api/user/settings/notifications` with expired token | 401 |
| 10 | Session cookie auth works | `GET /api/user/settings/notifications` with session cookie | 200, same schema |
| 11 | Idempotent — calling twice returns same data | Two sequential `GET /api/user/settings/notifications` | Both responses identical |
| 12 | View does not mutate state | `GET /api/user/settings/notifications`, then verify DB state unchanged | No write operations occurred |
| 13 | Content-Type header is `application/json` | `GET /api/user/settings/notifications` | Header starts with `application/json` |
| 14 | GET request ignores any body content | `GET /api/user/settings/notifications` with `{"email_notifications_enabled": false}` body | 200, preference unchanged |
| 15 | Preferences reflect prior update | `PUT` to update to `false`, then `GET` | `email_notifications_enabled === false` |
| 16 | Preferences reflect re-enable after disable | `PUT` to `false`, then `PUT` to `true`, then `GET` | `email_notifications_enabled === true` |
| 17 | Two different users see their own preferences | User A has enabled, User B has disabled; each GETs | User A sees `true`, User B sees `false` |
| 18 | Cannot view another user's preferences via this endpoint | No URL parameter to target a different user | Endpoint always returns the caller's preferences |
| 19 | Response payload size is under 100 bytes | `GET /api/user/settings/notifications` | `Content-Length` or body size < 100 |
| 20 | Unknown query parameters are silently ignored | `GET /api/user/settings/notifications?foo=bar` | 200, normal response |
| 21 | Concurrent reads (5 parallel) return consistent results | 5 parallel `GET` requests | All 5 responses identical |
| 22 | Response time under 50ms for single-row lookup | `GET /api/user/settings/notifications` with timing | Latency assertion passes |
| 23 | Rate limit returns 429 with Retry-After header | Exceed rate limit, then request | 429, `Retry-After` header present |
| 24 | 401 response body does not leak preference data | `GET /api/user/settings/notifications` without auth | Body does not contain `email_notifications_enabled` |
| 25 | Request with OPTIONS method returns CORS headers (preflight) | `OPTIONS /api/user/settings/notifications` | Appropriate CORS headers returned |

### CLI E2E Tests

| # | Test Description | Command | Expected |
|---|-----------------|---------|----------|
| 26 | View notification settings via CLI | `codeplane notification settings` | Exit 0, stdout is valid JSON object with `email_notifications_enabled` |
| 27 | CLI view requires authentication | `codeplane notification settings` (no token) | Exit code non-zero, error message |
| 28 | CLI output has correct field type | `codeplane notification settings` | `email_notifications_enabled` is boolean |
| 29 | CLI output matches API response | `codeplane notification settings` vs `GET /api/user/settings/notifications` | Both return same value |
| 30 | CLI generic API passthrough works | `codeplane api /api/user/settings/notifications` | Exit 0, same JSON object |
| 31 | CLI JSON field filtering works | `codeplane notification settings --json email_notifications_enabled` | Outputs only the boolean value |

### Web UI E2E Tests (Playwright)

| # | Test Description | Expected |
|---|-----------------|----------|
| 32 | Navigate to `/settings/notifications` while authenticated | Page loads with "Notification preferences" heading |
| 33 | Notification preference toggle is visible | Toggle switch element is present on the page |
| 34 | Toggle reflects correct state (enabled by default) | Toggle is in the "on" position for a new user |
| 35 | Description text explains notification types | Text mentioning "issues", "landing requests", "workspaces", "workflows" is visible |
| 36 | Enabled state shows "Enabled" badge/indicator | Green pill or "Enabled" text visible |
| 37 | After disabling (via companion feature), view shows "Disabled" | Toggle is in "off" position, "Disabled" indicator shown |
| 38 | Contextual info note updates based on state | When enabled: shows notification types list. When disabled: shows "not receiving" message. |
| 39 | Loading state shows skeleton/spinner | Skeleton or spinner visible before data loads |
| 40 | Settings sidebar highlights "Notifications" | Sidebar nav item is visually active |
| 41 | Error state displays retry option | On simulated 500, error message with "Retry" button shown |
| 42 | Navigate to `/settings/notifications` while unauthenticated | Redirected to login page |
| 43 | Page is keyboard accessible | Tab reaches the toggle; screen reader text includes current state |
| 44 | Narrow viewport renders correctly | On mobile viewport, description wraps and toggle stays visible |
| 45 | Bell icon appears in sidebar next to "Notifications" | Icon element present in sidebar item |
| 46 | Refresh shows same state (no stale cache) | Hard refresh shows current preference value |

### Boundary and Consistency Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 47 | API returns exactly one field — no future fields leak backwards | `Object.keys(body)` is `["email_notifications_enabled"]` |
| 48 | Boolean field is strictly boolean (not 0/1, not "true"/"false") | `body.email_notifications_enabled === true` or `=== false` (strict equality) |
| 49 | Response is a JSON object (not array, not string) | `typeof body === "object" && !Array.isArray(body)` |
| 50 | PUT with same value then GET returns that value (round-trip) | PUT `true`, GET returns `true`; PUT `false`, GET returns `false` |
| 51 | Rapid toggle cycle: disable → enable → view | Final GET returns `true` |
| 52 | Cross-client consistency: update via CLI, verify via web | CLI PUTs `false`, web UI GET shows disabled |
| 53 | Cross-client consistency: update via web, verify via CLI | Web PUTs `true`, CLI GET shows enabled |

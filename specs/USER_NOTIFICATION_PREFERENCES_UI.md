# USER_NOTIFICATION_PREFERENCES_UI

Specification for USER_NOTIFICATION_PREFERENCES_UI.

## High-Level User POV

Codeplane keeps you informed through real-time notifications about issue assignments, comments on your landing requests, workspace status changes, workflow completions, and mentions across repositories. But notifications are only valuable when you control them. The notification preferences UI is where that control lives — a single, consistent experience across every Codeplane surface.

From the web, you navigate to your user settings and find "Notifications" in the sidebar. The page loads immediately and shows you a clean summary of your current notification configuration. At the top is the master toggle: when enabled, Codeplane's notification pipeline includes you in its fanout — you receive alerts for issue assignments, comments, reviews on your landing requests, workspace events, workflow completions, and @mentions. When you flip it off, the pipeline skips you entirely. The toggle saves instantly; there is no separate "save" button to forget. A brief success confirmation tells you the change has been recorded, and if anything goes wrong, the toggle rolls back to its previous state with a clear error message.

Below the global toggle, the page shows which notification-producing event types you'll receive when notifications are enabled. This is informational today — Codeplane currently offers a single global on/off control — but the design explicitly reserves space for future per-type granular controls (e.g., "only notify me for direct mentions and reviews, not all issue activity"). The interface communicates this clearly: you see the list of event types, and you understand what the toggle governs.

Further down, the page links to your repository subscription list — the set of repositories you are explicitly watching, participating in, or have muted. Each repository subscription has its own mode (watching, participating, or ignored) that filters which events from that repository produce notifications for you. From this page, you can navigate directly to manage those subscriptions, creating a natural flow from "do I want notifications at all?" to "which repositories am I watching?" to "what kind of watching am I doing?"

From the CLI, you inspect your notification preferences with `codeplane notification settings` and update them with `codeplane notification settings update --email-notifications=true/false`. These commands are scriptable, composable, and produce structured JSON output. The CLI is a first-class citizen for notification management, not a secondary afterthought.

From the TUI, the notification preferences screen is accessible through the settings navigation. It displays the same toggle and status information in a terminal-native layout with keyboard-driven interaction. Toggling the setting sends the update immediately and shows confirmation inline.

From VS Code and Neovim, you can check your notification status from the status bar or status line, and a command opens the web notification settings page directly. Editor integrations surface notification state but delegate full preference management to the web UI or CLI.

The notification preferences UI matters because it is the trust boundary between Codeplane and the developer's attention. If developers can't easily see and change how they're notified, they will either drown in noise and disengage, or disable notifications entirely and miss critical information. This UI is the product's answer to that problem: clear, instant, and consistent across every surface.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can view their notification preferences from the web UI at `/settings/notifications`, the CLI via `codeplane notification settings`, the TUI via the settings screen, and editor integrations via status indicators.
- [ ] Authenticated users can update the `email_notifications_enabled` toggle from the web UI, CLI, and TUI, and see the change reflected immediately across all surfaces.
- [ ] The web UI page includes a global notification toggle, event type summary, and a link/section for repository subscription management.
- [ ] The CLI exposes both `codeplane notification settings` (view) and `codeplane notification settings update` (mutate) as first-class subcommands.
- [ ] The TUI exposes a notification preferences screen with a toggle and status display.
- [ ] VS Code and Neovim surface notification enabled/disabled status and provide a command to open the web settings.
- [ ] Toggling notifications off immediately prevents new notification creation by the fanout service.
- [ ] Toggling notifications on immediately resumes notification creation for subsequent events.
- [ ] Existing notifications in the user's inbox are unaffected by toggling.
- [ ] No retroactive notification creation occurs when re-enabling.
- [ ] All surfaces display consistent state for the same user.
- [ ] The UI is fully keyboard-accessible and screen-reader compatible.
- [ ] Loading, error, and empty states are explicitly handled in every surface.

### Functional Constraints

- [ ] The web UI toggle must save automatically on interaction (no separate "Save" button). While the request is in flight, the toggle is disabled with a loading indicator to prevent double submission.
- [ ] On success, a transient toast confirms "Notification preferences updated." On failure, the toggle reverts to its previous state and an error toast explains the problem.
- [ ] The CLI `notification settings` command outputs JSON to stdout and exits 0. The `notification settings update` command accepts `--email-notifications=true|false`, outputs the updated preferences as JSON, and exits 0 on success or 1 on error.
- [ ] The TUI toggle uses keyboard interaction (space/enter to toggle) and displays inline confirmation.
- [ ] The web UI page must not render if the user is unauthenticated; it redirects to login.
- [ ] The page must load within 200ms under normal conditions.
- [ ] The update must take effect within the same request/response cycle — no batching or delayed propagation.
- [ ] The `email_notifications_enabled` field, when provided for update, MUST be a boolean. Non-boolean values (strings, numbers, null) MUST be rejected with 422.
- [ ] Empty JSON body `{}` for update is treated as a no-op: current preferences returned unchanged with 200.
- [ ] Sending the same value that is already set MUST succeed idempotently.
- [ ] Unknown/extra fields in the update body are silently ignored.

### Edge Cases

- [ ] A brand-new user who has never visited settings sees `email_notifications_enabled: true` (system default).
- [ ] A user created via GitHub OAuth who has never modified settings sees the default preference.
- [ ] A user whose account is deactivated or has `prohibit_login: true` receives 401/403.
- [ ] `null`, string `"true"`, or numeric `1` values for `email_notifications_enabled` are rejected with 422.
- [ ] Non-JSON content types on update return 400.
- [ ] Malformed JSON on update returns 400.
- [ ] Request body exceeding 1 KB on update is rejected (413 or 400).
- [ ] Rapidly toggling the web UI switch multiple times does not cause inconsistent state.
- [ ] Concurrent updates from multiple clients produce consistent last-write-wins outcome.
- [ ] If server returns 500 on page load, a retry-capable error state is shown, not a blank page.
- [ ] If `email_notifications_enabled` is NULL in the database, the endpoint returns default `true`.
- [ ] The notification event type summary correctly lists all current fanout source types.

### Boundary Constraints

- [ ] `email_notifications_enabled`: strictly boolean — no other type accepted in request or response.
- [ ] Update request body maximum: 1 KB.
- [ ] Response payload: ~50 bytes, no pagination needed.
- [ ] Response object contains exactly `{ email_notifications_enabled: boolean }` — no internal fields leaked.
- [ ] All string values UTF-8 encoded.
- [ ] Design is forward-compatible: additional preference fields may be added without breaking consumers.

## Design

### Web UI Design

**Route**: `/settings/notifications` — accessible from the user settings sidebar under "Notifications."

**Sidebar Integration**: The settings sidebar highlights "Notifications" when this route is active. The sidebar item shows a bell icon. The item appears alongside Profile, Emails, SSH Keys, API Tokens, Connected Accounts, and OAuth Applications.

**Page Structure**:

1. **Page Header**
   - Title: "Notification preferences"
   - Subtitle: "Control how Codeplane notifies you about activity across your repositories, issues, landing requests, and workspaces."

2. **Global Notification Toggle Card**
   - Card heading: "Email & in-app notifications"
   - Row layout:
     - **Label**: "Enable notifications" (standard body text)
     - **Description**: "When enabled, you receive in-app notifications for activity in repositories you watch. When disabled, Codeplane's notification pipeline skips your account entirely."
     - **Toggle switch**: Reflects current server-side state. Toggling immediately triggers `PUT /api/user/settings/notifications`.
     - **Status pill**: Green "Enabled" pill when on, gray "Disabled" pill when off.
   - **Contextual info note** (below the toggle):
     - When enabled: "You will receive notifications for: issue assignments, issue comments, landing request reviews, landing request comments, workspace status changes, workspace sharing, and workflow run completions."
     - When disabled: "You are not receiving any notifications. Enable notifications to stay informed about activity."
   - **Saving state**: Toggle shows spinner and is disabled during PUT request.
   - **Success**: Transient toast: "Notification preferences updated."
   - **Error**: Toggle reverts; error toast with message.

3. **Notification Types Summary Section**
   - Heading: "Notification types"
   - Read-only list of event types with descriptions:
     - **Issue assigned** — "When you are assigned to an issue."
     - **Issue comment** — "When someone comments on an issue you authored, are assigned to, or are mentioned in."
     - **Landing request review** — "When someone reviews your landing request."
     - **Landing request comment** — "When someone comments on a landing request you authored or are mentioned in."
     - **Workspace status** — "When a workspace you own fails or changes status."
     - **Workspace shared** — "When someone shares a workspace with you."
     - **Workflow run completed** — "When a workflow run you initiated completes."
   - Footer note: "Granular per-type notification controls are coming soon."

4. **Repository Subscriptions Link Section**
   - Heading: "Repository subscriptions"
   - Description: "Manage which repositories you watch and how you receive notifications from them."
   - Link: "Manage subscriptions →" linking to `/settings/subscriptions`.
   - Summary stat: "You are watching N repositories."

**States**: Loading (skeleton shimmer), Error on load (inline banner + retry), Error on update (toast + toggle revert), Success (toast).

**Keyboard Accessibility**: Tab navigates to toggle. Space/Enter activates. Screen reader: "Enable notifications, currently [on/off], toggle switch."

**Responsive**: Description wraps below label on narrow viewports. Toggle stays inline-end. Types list stacks vertically. Subscriptions link becomes full-width.

### API Shape

**View**: `GET /api/user/settings/notifications`
- Auth: Required (session cookie, PAT, OAuth2 bearer).
- Response `200`: `{ "email_notifications_enabled": boolean }`
- Errors: 401, 404, 429, 500.

**Update**: `PUT /api/user/settings/notifications`
- Auth: Required.
- Request: `{ "email_notifications_enabled"?: boolean }` (partial update).
- Response `200`: `{ "email_notifications_enabled": boolean }` (full post-update state).
- Errors: 400 (bad JSON), 401, 404, 422 (non-boolean), 429, 500.

### SDK Shape

```typescript
interface NotificationPreferences {
  email_notifications_enabled: boolean;
}

interface UpdateNotificationPreferencesRequest {
  email_notifications_enabled?: boolean;
}

// UserService methods:
getNotificationPreferences(userID: number): Promise<Result<NotificationPreferences, APIError>>
updateNotificationPreferences(userID: number, req: UpdateNotificationPreferencesRequest): Promise<Result<NotificationPreferences, APIError>>
```

### CLI Command

**View**: `codeplane notification settings` — outputs JSON to stdout, exit 0.
**Update**: `codeplane notification settings update --email-notifications=true|false` — outputs updated JSON, exit 0 on success, 1 on error.
**Passthrough**: `codeplane api /api/user/settings/notifications` and `codeplane api -X PUT /api/user/settings/notifications -d '{...}'`.

### TUI UI

Screen: Settings → Notification Preferences. Layout: toggle with label, status indicator, event types list. Interaction: Space/Enter toggles, immediate save. Status: "Saving...", "Saved ✓", or "Error — press r to retry". Navigation: Esc/q returns.

### VS Code Extension

- Status bar tooltip includes "Notifications: enabled/disabled".
- Command: `codeplane.openNotificationSettings` opens `/settings/notifications`.
- Command palette: "Codeplane: Notification Settings".

### Neovim Plugin API

- `:Codeplane notification-settings` — prints preference to command line.
- `:Codeplane dashboard` — opens web UI.
- Statusline: notification icon (bell/muted bell) reflecting preference.

### Documentation

1. **User Guide: "Managing your notification preferences"** — finding settings, what the toggle controls, event types, CLI commands, editor status, relationship to subscriptions, FAQ.
2. **API Reference**: `GET` and `PUT /api/user/settings/notifications` with schemas, errors, cURL examples.
3. **CLI Reference**: `codeplane notification settings` and `codeplane notification settings update` with flags, examples, output formats.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Self) | Authenticated (Other) | Org Admin | Platform Admin |
|--------|-----------|----------------------|----------------------|-----------|----------------|
| View own notification preferences | ❌ | ✅ | ❌ | ❌ | ✅ (via admin API) |
| Update own notification preferences | ❌ | ✅ | ❌ | ❌ | ✅ (via admin API) |
| View another user's notification preferences | ❌ | ❌ | ❌ | ❌ | ✅ (via admin API) |

- Only the authenticated user can view or modify their own notification preferences via `/api/user/settings/notifications`.
- There is no mechanism to view or modify another user's notification preferences through this endpoint. The user ID is derived from the authenticated session, not from a URL parameter — IDOR is impossible by design.
- Organization admins cannot access or modify a member's notification preferences through this endpoint.
- Platform administrators can access any user's preferences through the admin API (`/api/admin/users/:id`), which is a separate feature surface.
- Users with `prohibit_login: true` or `is_active: false` must not access this endpoint even with a valid session token.

### Rate Limiting

- **View** (`GET`): Standard authenticated rate limit (5,000 requests/hour).
- **Update** (`PUT`): Standard authenticated rate limit plus per-user rate limit of **10 requests per minute** to prevent toggle-spamming.
- **Unauthenticated callers**: Standard unauthenticated limit (60 requests/hour) — receive 401 before data, but limit prevents auth-probing floods.
- **Burst tolerance**: Up to 10 requests in a 5-second window, then throttled.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) on every response.
- 429 `Too Many Requests` with `Retry-After` header on excess.

### Data Privacy & PII

- Notification preferences are not PII, but the endpoint requires auth and must never leak preferences for other users.
- Response must not include `id`, `email`, `username`, or any identifying field — only preference values.
- Server logs must not log preference values at INFO level. `user_id` may be logged.
- Response includes `Cache-Control: no-store` to prevent proxy caching.
- Audit logs for preference changes record `user_id` and old/new values but are not exposed to other users.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `NotificationPreferencesViewed` | `GET /api/user/settings/notifications` returns 200 | `user_id`, `email_notifications_enabled` (current), `client` (web/cli/tui/api/vscode/neovim) |
| `NotificationSettingsPageOpened` | User navigates to `/settings/notifications` in web UI | `user_id`, `client` (web), `referrer_path` |
| `NotificationSettingsUpdated` | `PUT` returns 200 and a value changed | `user_id`, `email_notifications_enabled` (new), `previous_email_notifications_enabled` (old), `source` (web/cli/tui/api), `timestamp` |
| `NotificationSettingsToggleFailed` | `PUT` returns 4xx/5xx | `user_id`, `source`, `error_status`, `error_message` |
| `NotificationPreferencesViewFailed` | `GET` returns 4xx/5xx | `user_id` (nullable if 401), `client`, `error_status` |
| `NotificationSettingsTUIOpened` | User navigates to preferences in TUI | `user_id`, `client` (tui) |
| `NotificationSettingsCLIUsed` | CLI settings or settings update executed | `user_id`, `subcommand` (view/update), `exit_code` |
| `SubscriptionLinkClicked` | User clicks "Manage subscriptions" on settings page | `user_id`, `source` (web) |

### Funnel Metrics & Success Indicators

- **Notification settings visit rate**: % of active users visiting `/settings/notifications` per month. Baseline: 3–5%. Target: ≥8% within 30 days of signup.
- **Preference awareness ratio**: Of visitors, % who update preferences. High ratio = controls are discoverable.
- **Opt-out rate**: % of users with `email_notifications_enabled: false`. Healthy: 5–15%. >30% = too noisy. <2% = unaware.
- **Re-enable rate**: % who disabled then re-enabled. Healthy rate = users value control.
- **Toggle frequency**: Avg changes/user/month. Very high = UX confusion or automation misuse.
- **Client distribution**: View/update breakdown by client (web/CLI/TUI/API). Informs investment.
- **Error rate**: Non-200 responses (excluding 401). Target: <0.5%.
- **P99 latency**: View <50ms. Update <100ms.
- **Subscription link click-through**: % of settings visits where user clicks "Manage subscriptions."
- **Notification volume before/after opt-out**: Correlation to inform granular preference controls.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Notification preferences requested | DEBUG | `user_id`, `request_id` |
| Notification preferences returned | DEBUG | `user_id`, `email_notifications_enabled`, `request_id`, `response_time_ms` |
| Notification preferences update requested | INFO | `user_id`, `request_id` |
| Notification preferences update success | INFO | `user_id`, `request_id`, `email_notifications_enabled` (new), `changed` (boolean), `response_time_ms` |
| Notification preferences update failed | ERROR | `user_id`, `request_id`, `error_code`, `error_message`, `stack_trace`, `response_time_ms` |
| Notification preferences validation error | WARN | `user_id`, `request_id`, `field`, `reason` |
| Notification preferences auth failure | WARN | `request_id`, `client_ip`, `auth_method` |
| Notification preferences rate limited | WARN | `user_id`, `request_id`, `client_ip`, `retry_after_seconds` |
| Notification preferences user not found | WARN | `user_id`, `request_id` |
| Notification preferences service error | ERROR | `user_id`, `request_id`, `error_code`, `error_message`, `stack_trace` |

All log entries include `request_id`. Preference values logged at DEBUG only. Production: INFO+.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_notification_prefs_view_total` | Counter | `status` (200/401/404/429/500) | Total view requests |
| `codeplane_notification_prefs_view_duration_seconds` | Histogram | — | View latency. Buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5 |
| `codeplane_notification_prefs_update_total` | Counter | `status` (200/400/401/404/422/429/500), `changed` (true/false) | Total update requests |
| `codeplane_notification_prefs_update_duration_seconds` | Histogram | `status` | Update latency. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_notification_prefs_view_rate_limited_total` | Counter | — | Rate-limited view attempts |
| `codeplane_notification_prefs_update_rate_limited_total` | Counter | — | Rate-limited update attempts |
| `codeplane_notification_prefs_enabled_ratio` | Gauge | — | Ratio of users with notifications enabled |
| `codeplane_notification_prefs_toggle_count_total` | Counter | `direction` (enable/disable) | Cumulative toggle events |

### Alerts

#### Alert: `NotificationPrefsViewHighErrorRate`
**Condition**: `rate(codeplane_notification_prefs_view_total{status="500"}[5m]) / rate(codeplane_notification_prefs_view_total[5m]) > 0.05`
**Severity**: Warning
**Runbook**:
1. Check ERROR logs filtered by `request_id` for failing requests.
2. Verify database connectivity — single-row SELECT by PK; failures indicate DB issues.
3. Check if `users` table is locked by migration.
4. Verify `email_notifications_enabled` column exists.
5. If transient (pool exhaustion), monitor 5 min. If persistent, restart and investigate pools.
6. If isolated to specific user IDs, check for data corruption.
7. Escalate to DB team if upstream.

#### Alert: `NotificationPrefsUpdateHighErrorRate`
**Condition**: `rate(codeplane_notification_prefs_update_total{status=~"5.."}[5m]) / rate(codeplane_notification_prefs_update_total[5m]) > 0.1` sustained 5 min.
**Severity**: Warning
**Runbook**:
1. Check `notification_preferences_update_failed` logs for dominant `error_code`.
2. If 500: investigate DB connectivity, pool health, query latency.
3. If 404: check user migration/deactivation running mid-session.
4. If 422: check client sending malformed payloads (client bug).
5. If resolves in 10 min, likely transient. Monitor.
6. If persistent, page on-call DB engineer.

#### Alert: `NotificationPrefsViewHighLatency`
**Condition**: `histogram_quantile(0.99, rate(codeplane_notification_prefs_view_duration_seconds_bucket[5m])) > 0.2`
**Severity**: Warning
**Runbook**:
1. Check DB query latency for `getUserNotificationPreferences` — PK lookup, elevated latency unusual.
2. Verify PK index on `users(id)` intact.
3. Check table bloat or vacuum backlog.
4. Check DB load, pool saturation, CPU/memory.
5. Check middleware latency (rate limiter, auth loading).
6. If systemic, check recent deployment regression.

#### Alert: `NotificationPrefsUpdateLatencyHigh`
**Condition**: `histogram_quantile(0.95, rate(codeplane_notification_prefs_update_duration_seconds_bucket[5m])) > 0.5` sustained 10 min.
**Severity**: Warning
**Runbook**:
1. Check DB latency for `UpdateUserNotificationPreferences`.
2. Check table lock contention on `users`.
3. Review PG slow query logs for `UPDATE users SET email_notifications_enabled`.
4. Check connection pool saturation.
5. If correlated with deployment, consider rollback.
6. If isolated, investigate batch update/migration row contention.

#### Alert: `NotificationPrefsAuthFailureSpike`
**Condition**: `rate(codeplane_notification_prefs_view_total{status="401"}[5m]) + rate(codeplane_notification_prefs_update_total{status="401"}[5m]) > 50`
**Severity**: Info
**Runbook**:
1. May indicate credential-stuffing or enumeration.
2. Check source IP distribution.
3. If concentrated, consider temporary IP rate limiting.
4. Verify clients not misconfigured with expired tokens.
5. Escalate to security if >500/5m.

#### Alert: `NotificationOptOutRateSpike`
**Condition**: >5% of active users disable notifications within 24 hours.
**Severity**: Info (product alert)
**Runbook**:
1. Check if notification volume spike preceded opt-out wave.
2. Check if product change or marketing email prompted settings visits.
3. Review fanout logs for high per-user notification counts.
4. If correlated with specific event type, consider per-type controls.
5. Share with product team.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | Detection | Recovery |
|-------------|-------------------|-----------|----------|
| Database unavailable (view) | 500, log ERROR | Counter spike | Client retry; health check |
| Database unavailable (update) | 500, toggle reverts | Counter spike | Client retry; health check |
| DB timeout on SELECT | 500 after timeout | Latency p99 alert | Retry; investigate |
| DB timeout on UPDATE | 500 after timeout, toggle reverts | Latency p95 alert | Retry; investigate |
| User row deleted between auth and fetch | 404, log WARN | 404 counter | Investigate deletion path |
| Auth expired | 401, no service call | Normal counter | Re-authenticate |
| Auth middleware misconfigured | 401 for all | Mass 401 alert | Restart, check middleware |
| Service registry uninitialized | 500 null ref | 500 on startup | Restart, check logs |
| Schema mismatch post-migration | 500, log ERROR | 500 spike after deploy | Roll back migration |
| Rate limited | 429 + Retry-After | Rate limit counter | Wait and retry |
| NULL column value | Default true returned | DEBUG log | No action; expected |
| Invalid boolean submitted | 422, toggle reverts | 422 counter | Fix client validation |
| Non-JSON content type | 400 | 400 counter | Fix client content-type |
| Malformed JSON | 400 | 400 counter | Fix client serialization |
| Body exceeds 1 KB | 413/400 | 413 counter | Fix client payload |
| Web UI JS error | Error boundary | Client error tracking | Fix in next deploy |
| SSE disconnect after toggle | Reconnects via Last-Event-ID | Client reconnection | Automatic |

## Verification

### API Integration Tests

| # | Test Description | Method / Setup | Expected |
|---|-----------------|----------------|----------|
| 1 | Retrieve preferences for authenticated user | `GET /api/user/settings/notifications` with valid PAT | 200, JSON object |
| 2 | Response contains `email_notifications_enabled` | GET | Has key `email_notifications_enabled` |
| 3 | Field is strictly boolean | GET | `typeof val === "boolean"` |
| 4 | Response has exactly one key | GET | `Object.keys(body).length === 1` |
| 5 | No internal fields leaked (id, email, username, timestamps) | GET | None present |
| 6 | Default for new user is `true` | Create user, GET | `true` |
| 7 | Unauthenticated GET returns 401 | No auth | 401, no pref data |
| 8 | Invalid PAT returns 401 | Garbage token | 401 |
| 9 | Expired/revoked PAT returns 401 | Expired token | 401 |
| 10 | Session cookie auth works | Cookie | 200 |
| 11 | Idempotent reads | Two GETs | Identical |
| 12 | GET does not mutate | GET, check DB | No writes |
| 13 | Content-Type is application/json | GET | Header matches |
| 14 | GET ignores body | GET with body | 200, unchanged |
| 15 | PUT false returns 200 with false | PUT `{"email_notifications_enabled": false}` | 200, false |
| 16 | PUT true returns 200 with true | PUT `{"email_notifications_enabled": true}` | 200, true |
| 17 | PUT empty body is no-op | PUT `{}` | 200, unchanged |
| 18 | PUT unauthenticated returns 401 | No auth | 401 |
| 19 | PUT expired PAT returns 401 | Expired | 401 |
| 20 | PUT null value returns 422 | `{"email_notifications_enabled": null}` | 422 |
| 21 | PUT string "true" returns 422 | `{"email_notifications_enabled": "true"}` | 422 |
| 22 | PUT number 1 returns 422 | `{"email_notifications_enabled": 1}` | 422 |
| 23 | PUT number 0 returns 422 | `{"email_notifications_enabled": 0}` | 422 |
| 24 | PUT string "yes" returns 422 | `{"email_notifications_enabled": "yes"}` | 422 |
| 25 | PUT non-JSON content type returns 400 | text/plain | 400 |
| 26 | PUT malformed JSON returns 400 | Invalid JSON | 400 |
| 27 | PUT with extra fields succeeds, ignores extras | Extra `push_enabled` | 200, extra not in response |
| 28 | Round-trip: PUT false → GET returns false | Sequential | false |
| 29 | Round-trip: PUT true → GET returns true | Sequential | true |
| 30 | Rapid toggle: false → true → GET | Three calls | true |
| 31 | Idempotent: PUT true when already true | PUT | 200 |
| 32 | Idempotent: PUT false when already false | PUT | 200 |
| 33 | Two users see own preferences | A=true, B=false | Correct per-user |
| 34 | Cannot view another user's prefs | No URL param | Always caller's |
| 35 | Response under 100 bytes | GET | Size < 100 |
| 36 | Unknown query params ignored | `?foo=bar` | 200 |
| 37 | 5 concurrent reads consistent | 5 parallel GETs | All identical |
| 38 | View latency under 50ms | Timed GET | < 50ms |
| 39 | Rate limit returns 429 + Retry-After | Exceed limit | 429, header present |
| 40 | 401 body has no pref data | Unauthed GET | No `email_notifications_enabled` |
| 41 | CORS preflight works | OPTIONS | CORS headers |
| 42 | PUT body exactly 1 KB (max) succeeds | Padded valid body | 200 |
| 43 | PUT body 1 KB + 1 byte rejected | 1025 bytes | 413 or 400 |

### Notification Fanout Integration Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 44 | Enabled: issue assignment → notification created | Row exists |
| 45 | Disabled: issue assignment → no notification | No row |
| 46 | Disabling does not delete existing notifications | Unread count unchanged |
| 47 | Re-enabling does not create retroactive notifications | No catch-up rows |
| 48 | Disabled: LR review → no notification | No row |
| 49 | Disabled: comment @mention → no notification | No row |
| 50 | Re-enabled: SSE stream delivers new events | Event received |
| 51 | Disabled: workspace failure → no notification | No row |
| 52 | Disabled: workflow completion → no notification | No row |

### CLI E2E Tests

| # | Test Description | Command | Expected |
|---|-----------------|---------|----------|
| 53 | View settings | `codeplane notification settings` | Exit 0, valid JSON |
| 54 | View requires auth | No token | Exit 1, error |
| 55 | Field type is boolean | View | boolean type |
| 56 | CLI matches API | CLI vs GET | Same value |
| 57 | API passthrough | `codeplane api /api/user/settings/notifications` | Exit 0, same JSON |
| 58 | JSON field filter | `--json email_notifications_enabled` | Boolean only |
| 59 | Update: disable | `--email-notifications=false` | Exit 0, false |
| 60 | Update: enable | `--email-notifications=true` | Exit 0, true |
| 61 | Update: JSON output | `--email-notifications=false --json` | Valid JSON |
| 62 | Update: requires auth | No token | Exit 1 |
| 63 | Update then view match | Update false, view | false |

### Web UI E2E Tests (Playwright)

| # | Test Description | Expected |
|---|-----------------|----------|
| 64 | Navigate to `/settings/notifications` authenticated | "Notification preferences" heading |
| 65 | Toggle visible and interactive | Element present, clickable |
| 66 | Default state enabled for new user | Toggle on |
| 67 | Description mentions event types | Text contains keywords |
| 68 | Enabled badge shown | Green pill / "Enabled" |
| 69 | Toggle off → Disabled badge | Badge updates |
| 70 | Toggle off → success toast | Toast visible |
| 71 | Toggle off → refresh persists | Hard refresh, still off |
| 72 | Toggle on → Enabled badge | Badge updates |
| 73 | Toggle on → success toast | Toast visible |
| 74 | Error: 500 → toast + revert | Toggle reverts |
| 75 | Loading skeleton shown | Skeleton before data |
| 76 | Sidebar highlights Notifications | Active state |
| 77 | Bell icon in sidebar | Icon present |
| 78 | Types summary section visible | Event type list |
| 79 | Subscriptions link → `/settings/subscriptions` | Navigation works |
| 80 | Watching count displayed | "N repositories" text |
| 81 | Contextual note changes with state | On/off messaging |
| 82 | Unauthenticated → login redirect | Redirect |
| 83 | Tab reaches toggle | Keyboard nav works |
| 84 | Screen reader announces state | ARIA attributes |
| 85 | Narrow viewport adapts | Mobile layout correct |
| 86 | Rapid toggle → consistent state | 5 clicks, final consistent |
| 87 | Saving indicator during update | Spinner/disabled |
| 88 | Load error → retry button | Button present, functional |

### TUI E2E Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 89 | Settings screen loads | Heading visible |
| 90 | Toggle shows current state | Matches API |
| 91 | Space toggles setting | State changes |
| 92 | Saving indicator shown | "Saving..." text |
| 93 | Success confirmation | "Saved ✓" |
| 94 | Error shows retry | Retry prompt |
| 95 | Event types displayed | List visible |
| 96 | Esc returns to previous | Navigation works |

### Cross-Client Consistency Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 97 | Update via API → verify via CLI | Match |
| 98 | Update via CLI → verify via API | Match |
| 99 | Update via web → verify via CLI + API | All match |
| 100 | Update via CLI → web shows update | Toggle reflects |
| 101 | Update via API → TUI shows update | Toggle reflects |
| 102 | Concurrent web + CLI updates → consistent | Last write wins |

### Rate Limiting Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 103 | 10 updates in 1 min succeed | All 200 |
| 104 | 20 updates in 1 min: excess rate limited | 11th+ return 429 |
| 105 | 429 includes Retry-After | Header present |
| 106 | After window passes, requests succeed | 200 again |

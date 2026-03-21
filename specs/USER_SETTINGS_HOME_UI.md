# USER_SETTINGS_HOME_UI

Specification for USER_SETTINGS_HOME_UI.

## High-Level User POV

When you click your avatar in Codeplane and choose "Settings," you land on your settings home page — a single screen that gives you an at-a-glance summary of your entire account configuration. Think of it as the front door to everything about your Codeplane identity: your profile, email addresses, security credentials, notification preferences, and connected services.

The settings home page is not just a menu of links. It shows you meaningful, live summaries of your account state. You can see how many email addresses you have (and whether any are unverified), how many SSH keys are configured, when your last active session was created, and whether your notification preferences are turned on. Each summary card links directly to the detail page for that settings area, so you are always one click away from managing anything.

This page is designed for the user who wants a quick health check on their account without clicking through every individual settings page. If you just connected a new GitHub account, you can glance at the settings home and confirm the connection is there. If you are unsure whether you set up your SSH keys, the count is right there. If your team requires email verification, you can see at a glance which addresses need attention.

The settings home also serves as the anchor for the settings sidebar navigation. Every settings sub-page — Profile, Emails, SSH Keys, Tokens, Sessions, Connected Accounts, Notifications, and OAuth Applications — is reachable from the sidebar, and the settings home is always the first item. This gives you a consistent way to orient yourself no matter which settings page you are on.

From the CLI, a `codeplane user settings` command outputs a structured summary of the same account state — email count, key count, session count, and notification preferences — so terminal-first users get the same at-a-glance view without opening a browser. The TUI provides a similar settings dashboard screen accessible from the main navigation.

The settings home is a private view. Only you can see your settings summary. It requires authentication and cannot be accessed by other users, organization admins, or anonymous visitors.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users see a settings home page at `/settings` that summarizes their account state.
- [ ] The settings sidebar navigation renders on every `/settings/*` page and highlights the current page.
- [ ] The sidebar contains links to: Settings Home, Profile, Emails, SSH Keys, Tokens, Sessions, Connected Accounts, Notifications, and OAuth Applications.
- [ ] Each summary card on the home page displays live data from the corresponding API endpoint.
- [ ] Each summary card links to its detail settings page.
- [ ] Unauthenticated visitors to `/settings` are redirected to the login page.
- [ ] The CLI command `codeplane user settings` outputs a structured account summary.
- [ ] The TUI includes a settings dashboard screen with equivalent summary information.
- [ ] The page loads within 2 seconds on a standard connection, even when all summary data must be fetched.
- [ ] The settings home page is accessible via keyboard navigation and screen readers.

### Functional Criteria

- [ ] The settings home page fetches data from the authenticated user's existing endpoints: `GET /api/user`, `GET /api/user/emails`, `GET /api/user/keys`, `GET /api/user/tokens`, `GET /api/user/sessions`, `GET /api/user/connections`, `GET /api/user/settings/notifications`.
- [ ] The page does not require any new server endpoints — it composes data from existing APIs.
- [ ] Summary cards display counts and status indicators, not full detail lists.
- [ ] The profile summary card shows the user's avatar, display name (or username as fallback), and bio (truncated to 80 characters with ellipsis if longer).
- [ ] The emails summary card shows the total email count, verified count, and the primary email address (masked as `a***e@example.com` with first character, asterisks, last character before @, and the full domain).
- [ ] The SSH keys summary card shows the total key count and the date of the most recently added key.
- [ ] The tokens summary card shows the total active token count.
- [ ] The sessions summary card shows the total active session count and a "current session" indicator.
- [ ] The connected accounts summary card shows the count of connected providers and their names (e.g., "GitHub").
- [ ] The notifications summary card shows whether email notifications are enabled or disabled.
- [ ] Each summary card has a clear "Manage →" or equivalent link navigating to the detail page.
- [ ] If any summary fetch fails, the individual card shows an inline error state with a "Retry" button, without breaking other cards.
- [ ] All summary API requests are fired in parallel on page load for performance.
- [ ] The sidebar navigation item for "Settings" (the home page) uses an appropriate icon (e.g., a gear/cog).
- [ ] The currently active sidebar item is visually highlighted (background accent, bold text, or left-border indicator).

### Edge Cases

- [ ] A user with zero emails (exceptional edge case) sees "0 email addresses" with a call-to-action to add one.
- [ ] A user with zero SSH keys sees "No SSH keys" with a call-to-action to add one.
- [ ] A user with zero tokens sees "No personal access tokens" with a call-to-action to create one.
- [ ] A user with zero connected accounts sees "No connected accounts" with a call-to-action to connect one.
- [ ] A user with a very long display name (255 characters) sees the name truncated with ellipsis in the profile summary card.
- [ ] A user with a very long bio (500 characters) sees the bio truncated to 80 characters with ellipsis in the summary card.
- [ ] A user with an empty display name sees their username used as fallback in the profile card.
- [ ] A user with an empty bio sees no bio line in the profile card (the space is not rendered, not shown as "No bio").
- [ ] A user with 10 emails (the maximum) sees "10 email addresses" and the correct verified count.
- [ ] A user with no primary email set sees the email card without a primary email indicator.
- [ ] A user whose avatar URL is empty or invalid sees a fallback identicon in the profile card.
- [ ] If the network is slow, each card independently shows a loading skeleton. Fast-loading cards render immediately while slow ones continue loading.
- [ ] If one API call returns a 500 error, only that card shows an error state — all other cards render normally.
- [ ] If the user's session expires while the page is open, any subsequent "Retry" or navigation action redirects to login.
- [ ] A user who navigates directly to `/settings/` (with trailing slash) is treated the same as `/settings`.
- [ ] The page does not flash or re-layout when data loads asynchronously — card skeletons match the dimensions of loaded cards.

### Boundary Constraints

- [ ] The page must render correctly for a user with 0 to 10 emails (the maximum).
- [ ] The page must render correctly for a user with 0 to 100 SSH keys.
- [ ] The page must render correctly for a user with 0 to 100 active tokens.
- [ ] The page must render correctly for a user with 0 to 50 active sessions.
- [ ] The page must render correctly for a user with 0 to 10 connected accounts.
- [ ] Display name truncation in the profile card occurs at 50 characters for visual balance.
- [ ] Bio truncation in the profile card occurs at 80 characters.
- [ ] Primary email masking always shows at least `x***x@domain` — if the local part is 1 character, display `x***@domain`; if 2 characters, display `x***x@domain`.
- [ ] All text content is UTF-8 encoded. Emoji, CJK, and RTL characters render correctly in summary cards.
- [ ] The settings sidebar renders correctly with all 9 navigation items without overflow or truncation on viewport widths ≥ 320px.
- [ ] The page is responsive: on viewports < 768px, the sidebar collapses into a horizontal tab bar or hamburger menu.

## Design

### Web UI Design

**Route**: `/settings` — the default landing page within the user settings area.

**Layout**:

The page uses a two-column layout consistent with all `/settings/*` pages:

- **Left column (sidebar, ~240px fixed)**: Vertical navigation list with links to all settings sub-pages.
- **Right column (content area, fluid)**: The settings home content.

**Sidebar Navigation**:

The sidebar is rendered as a vertical list with the following items, each with an icon and label:

| Order | Icon | Label | Route | Notes |
|-------|------|-------|-------|-------|
| 1 | 🏠 (home) | Settings | `/settings` | Home/overview page |
| 2 | 👤 (user) | Profile | `/settings/profile` | Display name, bio, avatar |
| 3 | ✉️ (mail) | Emails | `/settings/emails` | Email addresses |
| 4 | 🔑 (key) | SSH Keys | `/settings/keys` | SSH public keys |
| 5 | 🎟️ (ticket) | Tokens | `/settings/tokens` | Personal access tokens |
| 6 | 🖥️ (monitor) | Sessions | `/settings/sessions` | Active sessions |
| 7 | 🔗 (link) | Connected Accounts | `/settings/connections` | OAuth provider links |
| 8 | 🔔 (bell) | Notifications | `/settings/notifications` | Notification preferences |
| 9 | 📱 (app) | OAuth Applications | `/settings/applications` | Developer OAuth apps |

The active page item has a left-border accent (4px, primary color), bold label text, and a subtle background highlight. Non-active items have no left border and normal-weight text.

**Settings Home Content Area**:

- **Page Title**: "Settings" displayed as a large heading (h1) at the top of the content area.
- **Subtitle**: "Manage your account settings, security credentials, and preferences."

**Summary Cards**:

The content area displays a grid of summary cards. On wide viewports (≥1024px), the grid is 2 columns. On medium viewports (768px–1023px), the grid is 1 column. On narrow viewports (<768px), the grid is 1 column with the sidebar collapsed.

Each summary card follows this structure:

```
┌──────────────────────────────────┐
│ [Icon]  Card Title               │
│                                  │
│  Primary metric or status        │
│  Secondary detail line           │
│                                  │
│                    [Manage →]    │
└──────────────────────────────────┘
```

**Card 1 — Profile**:
- Title: "Profile"
- Content: Avatar (48×48, rounded) inline with display name (or username fallback) in semi-bold. Bio below, truncated to 80 chars with ellipsis.
- Link: "Edit profile →" → `/settings/profile`

**Card 2 — Email Addresses**:
- Title: "Email Addresses"
- Primary metric: "{count} email address(es)" (e.g., "3 email addresses")
- Secondary: "Primary: a***e@example.com" | "{verified_count} verified"
- Warning badge: If any email is unverified, show an amber "⚠ {unverified_count} unverified" indicator.
- Link: "Manage emails →" → `/settings/emails`

**Card 3 — SSH Keys**:
- Title: "SSH Keys"
- Primary metric: "{count} SSH key(s)" or "No SSH keys"
- Secondary: "Last added: {relative_date}" (e.g., "Last added: 3 days ago") — only shown if count > 0.
- Empty CTA: If count is 0, show "Add your first SSH key to push code securely."
- Link: "Manage SSH keys →" → `/settings/keys`

**Card 4 — Personal Access Tokens**:
- Title: "Personal Access Tokens"
- Primary metric: "{count} active token(s)" or "No tokens"
- Empty CTA: If count is 0, show "Create a token for CLI and API access."
- Link: "Manage tokens →" → `/settings/tokens`

**Card 5 — Active Sessions**:
- Title: "Sessions"
- Primary metric: "{count} active session(s)"
- Secondary: "Including this session" (always at least 1 since the user is authenticated).
- Link: "Manage sessions →" → `/settings/sessions`

**Card 6 — Connected Accounts**:
- Title: "Connected Accounts"
- Primary metric: "{count} connected" or "No connected accounts"
- Secondary: Comma-separated list of provider names (e.g., "GitHub") if count > 0.
- Empty CTA: If count is 0, show "Connect an external account for sign-in and integration."
- Link: "Manage connections →" → `/settings/connections`

**Card 7 — Notifications**:
- Title: "Notifications"
- Primary metric: "Email notifications: On" or "Email notifications: Off"
- Secondary: Status pill — green "Enabled" or gray "Disabled".
- Link: "Manage notifications →" → `/settings/notifications`

**Loading State**:

Each card renders as a skeleton placeholder (matching the card dimensions) with a shimmer animation while its data is loading. The page title and sidebar render immediately. Cards appear independently as their data resolves.

**Error State (per-card)**:

If a card's API call fails, the card displays:
- The card title (still rendered).
- An inline error message: "Failed to load {section name}."
- A "Retry" button that re-fetches only that card's data.

**Full-page Error State**:

If the user's profile fetch (`GET /api/user`) fails, the entire page shows a centered error: "Unable to load your settings. Please try again." with a "Retry" button. This is because the profile is the anchor identity for the page.

**Keyboard Accessibility**:

- Tab navigates through sidebar items, then through summary cards in reading order.
- Each card's "Manage →" link is focusable.
- The sidebar active item has `aria-current="page"`.
- Each card has a role of `region` with an `aria-label` matching the card title.
- Screen readers announce "Settings home page" on navigation.

**Responsive Behavior**:

- ≥1024px: Two-column sidebar + two-column card grid.
- 768px–1023px: Two-column sidebar + single-column card grid.
- <768px: Sidebar collapses to a horizontal scrollable tab bar above the content area. Cards stack in a single column.

### API Shape

No new API endpoints are required. The settings home page composes data from the following existing endpoints:

- `GET /api/user` — Returns the authenticated user's profile (display_name, username, bio, avatar_url, email, is_admin).
- `GET /api/user/emails` — Returns the list of email addresses with `is_activated` and `is_primary` fields.
- `GET /api/user/keys` — Returns the list of SSH keys with `name`, `fingerprint`, `key_type`, `created_at`.
- `GET /api/user/tokens` — Returns the list of personal access tokens.
- `GET /api/user/sessions` — Returns the list of active sessions.
- `GET /api/user/connections` — Returns the list of connected OAuth accounts with `provider` field.
- `GET /api/user/settings/notifications` — Returns notification preferences including `email_notifications_enabled`.

All endpoints require authentication (session cookie or PAT). All return 401 for unauthenticated requests. All responses include standard rate limit headers.

### CLI Command

**Command**: `codeplane user settings`

**Description**: Displays a summary of the authenticated user's account settings.

**Output** (default table format):
```
Profile
  Username:     alice
  Display Name: Alice Johnson
  Bio:          Working on distributed systems
  Avatar:       https://example.com/alice.png

Email Addresses: 3 (2 verified, 1 unverified)
SSH Keys:        2
Access Tokens:   1
Active Sessions: 3
Connected:       GitHub
Notifications:   Email enabled
```

**Output** (with `--json`):
```json
{
  "profile": {
    "username": "alice",
    "display_name": "Alice Johnson",
    "bio": "Working on distributed systems",
    "avatar_url": "https://example.com/alice.png"
  },
  "emails": { "total": 3, "verified": 2, "unverified": 1 },
  "ssh_keys": { "total": 2 },
  "tokens": { "total": 1 },
  "sessions": { "total": 3 },
  "connected_accounts": { "total": 1, "providers": ["GitHub"] },
  "notifications": { "email_enabled": true }
}
```

**Flags**:
- `--json`: Output in JSON format.
- `--section <name>`: Show only a specific section (e.g., `--section emails`). Allowed values: `profile`, `emails`, `ssh_keys`, `tokens`, `sessions`, `connected_accounts`, `notifications`.

**Exit codes**: `0` on success, `1` on authentication failure, `2` on network/server error.

### TUI UI

**Screen**: "Settings" — accessible from the TUI main navigation or dashboard sidebar.

The TUI settings screen renders a vertically scrollable view with sections matching the web UI summary cards:

- **Profile section**: Username, display name, bio (truncated to terminal width).
- **Email section**: Count + verified count.
- **SSH Keys section**: Count.
- **Tokens section**: Count.
- **Sessions section**: Count.
- **Connected Accounts section**: Count + provider names.
- **Notifications section**: Email enabled/disabled.

Each section is a focusable region. Pressing Enter on a section navigates to the detail screen for that settings area (if a detail screen exists in the TUI). Arrow keys navigate between sections. The active section is highlighted with a border or background color.

### Documentation

The following end-user documentation should be written:

- **"Your settings dashboard"** guide: Explains what the settings home page shows, how to navigate to it (avatar menu → Settings), what each summary card means, and how to use the sidebar to reach detail pages.
- **"Managing your account from the CLI"** guide section: Documents the `codeplane user settings` command, its output format, the `--json` flag, and the `--section` filter.
- **"Keyboard navigation in settings"** accessibility note: Documents tab order through the sidebar and cards, screen reader labels, and responsive behavior.
- **API Reference**: No new endpoints — but the settings home documentation should cross-reference the existing endpoints it composes: `GET /api/user`, `GET /api/user/emails`, `GET /api/user/keys`, `GET /api/user/tokens`, `GET /api/user/sessions`, `GET /api/user/connections`, `GET /api/user/settings/notifications`.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (Self) | Authenticated (Other) | Org Admin | Platform Admin |
|--------|-----------|----------------------|-----------------------|-----------|----------------|
| View settings home (`/settings`) | ❌ Redirect to login | ✅ | ❌ (sees own settings only) | ❌ (sees own settings only) | ✅ (sees own settings only) |
| Run `codeplane user settings` | ❌ Error (exit 1) | ✅ | N/A | N/A | ✅ |
| View TUI settings dashboard | ❌ Error | ✅ | N/A | N/A | ✅ |

- The settings home page exclusively displays data belonging to the authenticated user.
- There is no path parameter or query parameter to view another user's settings summary. The user ID is derived from the authenticated session.
- Organization admins and platform admins see only their own settings when visiting `/settings`. Admin-specific user management is a separate surface (`/admin/users`).

### Rate Limiting

- The settings home page triggers up to 7 parallel API requests on load. All requests are subject to the standard authenticated rate limit (5,000 requests/hour per user).
- Burst tolerance: Up to 20 requests in a 5-second window (to accommodate the parallel fan-out on page load).
- Aggressive refresh behavior (e.g., rapidly hitting F5) should not degrade other users. The rate limiter applies per-user, not globally.
- The CLI command `codeplane user settings` fires the same set of API requests and is subject to the same rate limits.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included on each response.
- If rate-limited (429), the UI should show a user-friendly message: "You're refreshing too quickly. Please wait a moment." and not auto-retry.

### Data Privacy & PII

- The primary email address displayed on the settings home page is masked (e.g., `a***e@example.com`). The full email is only visible on the `/settings/emails` detail page.
- The settings page content is private and must never be cached by a CDN or shared cache. Responses must include `Cache-Control: no-store`.
- Server logs must not log email addresses, SSH key content, or token values at INFO level or below. Only counts and user IDs are safe to log.
- The settings home page does not expose any data that is not already accessible through the individual settings endpoints. It introduces no new PII surface.
- Connected account provider user IDs (e.g., GitHub username) are displayed. These are considered non-sensitive as they are public on the provider's platform.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `UserSettingsHomeViewed` | User navigates to `/settings` in Web UI | `user_id`, `client` ("web"), `referrer_path` (previous route), `email_count`, `ssh_key_count`, `token_count`, `session_count`, `connected_account_count`, `email_notifications_enabled` |
| `UserSettingsHomeCLIViewed` | User runs `codeplane user settings` | `user_id`, `client` ("cli"), `output_format` ("table" or "json"), `section_filter` (null or section name) |
| `UserSettingsHomeTUIViewed` | User opens settings screen in TUI | `user_id`, `client` ("tui") |
| `UserSettingsCardClicked` | User clicks "Manage →" on a summary card | `user_id`, `client` ("web"), `card_name` (e.g., "emails", "ssh_keys"), `source` ("settings_home") |
| `UserSettingsCardRetried` | User clicks "Retry" on an errored summary card | `user_id`, `client` ("web"), `card_name`, `error_status` (HTTP status of the failed request) |
| `UserSettingsHomeLoadFailed` | The profile fetch fails, showing the full-page error state | `user_id`, `client` ("web"), `error_status` |
| `UserSettingsSidebarNavigated` | User clicks a sidebar link on any `/settings/*` page | `user_id`, `client` ("web"), `from_page` (current settings sub-route), `to_page` (clicked settings sub-route) |

### Funnel Metrics & Success Indicators

- **Settings home visit rate**: Percentage of active users who visit `/settings` at least once per month. Baseline target: ≥15% of active users.
- **Settings home → detail page click-through rate**: Percentage of settings home visits that result in a click to a detail settings page. Target: ≥60%. A low rate suggests the summary is sufficient or that links are not discoverable.
- **Card click distribution**: Which summary cards are clicked most often. Informs relative importance and potential re-ordering of cards.
- **Error rate on settings home**: Percentage of settings home visits where at least one summary card fails to load. Target: <1%.
- **Full-page error rate**: Percentage of settings home visits where the profile fetch fails (full-page error). Target: <0.1%.
- **CLI usage**: Number of unique users running `codeplane user settings` per week. Tracks terminal-first workflow adoption.
- **Time to first interaction**: Median time from page load to first click or scroll. Helps evaluate whether the page is useful at a glance.
- **Retry rate**: Percentage of settings home visits where the user clicks "Retry" on a failed card. A high rate indicates intermittent backend issues.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|---|
| Settings home page requested | DEBUG | `user_id`, `request_id`, `client` (web/cli/tui) |
| Settings home summary data assembled | DEBUG | `user_id`, `request_id`, `email_count`, `ssh_key_count`, `token_count`, `session_count`, `connected_account_count`. No PII. |
| Settings home partial fetch failure | WARN | `user_id`, `request_id`, `failed_endpoint` (e.g., "/api/user/keys"), `error_status`, `error_message` |
| Settings home full load failure (profile fetch) | ERROR | `user_id`, `request_id`, `error_status`, `error_message`, `stack_trace` |
| Settings sidebar navigation | DEBUG | `user_id`, `request_id`, `from_page`, `to_page` |
| Settings home rate limited | WARN | `user_id`, `request_id`, `client_ip`, `retry_after_seconds` |

**Rules**: NEVER log email addresses, SSH key content, token values, or session tokens at any level. Log only counts and identifiers. All log entries MUST include `request_id` for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_settings_home_views_total` | Counter | `client` (web/cli/tui), `status` (success/partial_error/full_error) | Total settings home page views by outcome |
| `codeplane_settings_home_load_duration_seconds` | Histogram | `client` | Time to load all summary data. Buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0 |
| `codeplane_settings_home_card_errors_total` | Counter | `card` (profile/emails/keys/tokens/sessions/connections/notifications), `error_status` | Total per-card fetch failures |
| `codeplane_settings_home_card_clicks_total` | Counter | `card` | Total clicks on "Manage →" links per card |
| `codeplane_settings_home_retries_total` | Counter | `card` | Total "Retry" button clicks per card |
| `codeplane_settings_sidebar_navigations_total` | Counter | `from_page`, `to_page` | Sidebar navigation transitions |

### Alerts

#### Alert: `SettingsHomeHighErrorRate`
**Condition**: `rate(codeplane_settings_home_views_total{status="full_error"}[5m]) / rate(codeplane_settings_home_views_total[5m]) > 0.05`
**Severity**: Warning
**Runbook**:
1. Check server ERROR logs filtered by `request_id` for settings home failures.
2. The full-page error means `GET /api/user` failed. Verify database connectivity.
3. Check if the `users` table is accessible and not locked by a migration.
4. Verify the auth middleware is loading user context correctly — a broken auth cookie or session store will cause mass failures.
5. If transient (connection pool exhaustion), monitor for 5 more minutes. If persistent, restart the server process.
6. Check recent deployments for regressions in the user profile endpoint.
7. Escalate to the database team if the issue is upstream.

#### Alert: `SettingsHomeHighCardErrorRate`
**Condition**: `sum(rate(codeplane_settings_home_card_errors_total[5m])) / rate(codeplane_settings_home_views_total[5m]) > 0.1`
**Severity**: Warning
**Runbook**:
1. Identify which card(s) are failing by checking the `card` label on `codeplane_settings_home_card_errors_total`.
2. If a single card (e.g., `ssh_keys`) is failing, check the corresponding endpoint (`GET /api/user/keys`) independently.
3. Run the endpoint manually with a test token to confirm the failure.
4. Check database table health for the failing resource (e.g., `ssh_keys`, `personal_access_tokens`).
5. If multiple cards are failing, suspect a systemic issue: database connectivity, auth middleware, or upstream dependency.
6. Check for recent migrations that may have altered table schemas.
7. If the error rate is declining, it may be a transient spike — continue monitoring.

#### Alert: `SettingsHomeHighLatency`
**Condition**: `histogram_quantile(0.99, rate(codeplane_settings_home_load_duration_seconds_bucket[5m])) > 3.0`
**Severity**: Warning
**Runbook**:
1. The settings home fires up to 7 parallel API requests. High latency may indicate one slow endpoint.
2. Check individual endpoint latencies to identify the bottleneck.
3. If a single endpoint is slow, investigate that endpoint's database query performance.
4. If all endpoints are slow, check overall database load and connection pool saturation.
5. Check server CPU and memory utilization — high resource consumption can slow all endpoints.
6. Verify no N+1 query patterns were introduced in recent changes to the summary endpoints.
7. If the issue is client-side (browser rendering), the server-side histogram will show normal values — check browser performance metrics separately.

#### Alert: `SettingsHomeRateLimitSpike`
**Condition**: `rate(codeplane_settings_home_views_total{status="rate_limited"}[5m]) > 5`
**Severity**: Info
**Runbook**:
1. Identify the source user(s) from access logs.
2. Determine if traffic is a legitimate rapid-refresh pattern or automated abuse.
3. For legitimate users, the 7-request fan-out can consume rate limit budget quickly. Verify the burst tolerance (20 requests/5 seconds) is sufficient.
4. If a client-side bug is causing infinite refresh loops, check for recent UI deployments.
5. For abuse, consider additional IP-based restrictions.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | Detection | Recovery |
|-------------|-------------------|-----------|----------|
| Profile endpoint (`GET /api/user`) unavailable | Full-page error state with "Retry" button | `status=full_error` counter spike | User retries; server health check |
| Individual summary endpoint returns 500 | That card shows error state; other cards render normally | `card_errors_total` counter per card | User retries individual card; investigate endpoint |
| Database unavailable | All cards fail; full-page error likely | Mass 500s across all endpoints | Automatic retry; check database connectivity |
| Auth session expired | 401 on any fetch; redirect to login | 401 counter spike on settings endpoints | User re-authenticates |
| Network timeout on one endpoint | That card shows error after timeout; others render | Latency histogram and card error counter | User retries; check network/server health |
| Rate limit exceeded | 429 response; UI shows "refreshing too quickly" message | Rate limit counter | User waits; no automated retry |
| Sidebar navigation fails to render | Content area renders without sidebar | Client-side error boundary detection | Hard refresh; check for JS bundle errors |
| Invalid or corrupt user profile data | Profile card shows fallback (username, identicon) | No explicit detection — graceful fallback | Investigate data integrity |
| Extremely slow endpoint (>5s) | Card shows loading skeleton for extended time, then error on timeout | Latency histogram p99 | Investigate slow endpoint; consider client-side timeout |

## Verification

### Web UI E2E Tests (Playwright)

| # | Test Description | Expected |
|---|-----------------|----------|
| 1 | Navigate to `/settings` while authenticated | Page loads with "Settings" heading and subtitle |
| 2 | Settings sidebar renders with all 9 navigation items | Sidebar contains: Settings, Profile, Emails, SSH Keys, Tokens, Sessions, Connected Accounts, Notifications, OAuth Applications |
| 3 | Settings sidebar "Settings" item is highlighted as active | Settings item has active visual indicator (bold, left border, or background) |
| 4 | Profile summary card displays avatar and display name | Card contains avatar image element and display name text |
| 5 | Profile summary card falls back to username when display name is empty | Clear display name via API, reload, card shows username |
| 6 | Profile summary card falls back to identicon when avatar URL is empty | Clear avatar via API, reload, card shows fallback image |
| 7 | Profile summary card truncates bio at 80 characters with ellipsis | Set bio to 100 chars via API, reload, card shows 80 chars + "…" |
| 8 | Profile summary card shows no bio line when bio is empty | Clear bio via API, reload, no empty bio placeholder shown |
| 9 | Email summary card shows correct count | Add 3 emails via API, reload, card shows "3 email addresses" |
| 10 | Email summary card shows verified and unverified counts | Card displays verified count and unverified warning badge |
| 11 | Email summary card shows masked primary email | Primary email "alice@example.com" displays as "a***e@example.com" |
| 12 | Email summary card shows "0 email addresses" for user with no emails | Card shows count of 0 with CTA |
| 13 | SSH keys summary card shows correct count | Add 2 keys via API, reload, card shows "2 SSH keys" |
| 14 | SSH keys summary card shows "No SSH keys" when count is 0 | Card shows empty CTA text |
| 15 | SSH keys summary card shows "Last added" date when keys exist | Card shows relative date of most recent key |
| 16 | Tokens summary card shows correct count | Create 1 token via API, reload, card shows "1 active token" |
| 17 | Tokens summary card shows "No tokens" when count is 0 | Card shows empty CTA text |
| 18 | Sessions summary card shows at least 1 active session | Card shows ≥1 session count with "Including this session" |
| 19 | Connected accounts summary card shows provider names | Connect GitHub via OAuth, reload, card shows "GitHub" |
| 20 | Connected accounts summary card shows "No connected accounts" when none exist | Card shows empty CTA text |
| 21 | Notifications summary card shows "Email notifications: On" when enabled | Enable notifications via API, reload, card shows enabled state |
| 22 | Notifications summary card shows "Email notifications: Off" when disabled | Disable notifications via API, reload, card shows disabled state |
| 23 | Clicking "Edit profile →" navigates to `/settings/profile` | URL changes, profile edit page renders |
| 24 | Clicking "Manage emails →" navigates to `/settings/emails` | URL changes, emails page renders |
| 25 | Clicking "Manage SSH keys →" navigates to `/settings/keys` | URL changes, SSH keys page renders |
| 26 | Clicking "Manage tokens →" navigates to `/settings/tokens` | URL changes, tokens page renders |
| 27 | Clicking "Manage sessions →" navigates to `/settings/sessions` | URL changes, sessions page renders |
| 28 | Clicking "Manage connections →" navigates to `/settings/connections` | URL changes, connected accounts page renders |
| 29 | Clicking "Manage notifications →" navigates to `/settings/notifications` | URL changes, notifications page renders |
| 30 | Sidebar navigation from settings home to Profile works | Click "Profile" in sidebar, URL changes to `/settings/profile`, sidebar highlights "Profile" |
| 31 | Sidebar navigation from settings home to every other sub-page works | Click each sidebar item, verify URL and highlight update correctly |
| 32 | Navigate to `/settings` while unauthenticated | Redirected to login page |
| 33 | Navigate to `/settings/` (trailing slash) while authenticated | Same page as `/settings` renders correctly |
| 34 | Loading state shows skeleton cards before data resolves | Intercept API responses with delay, assert skeleton elements visible |
| 35 | Error state on a single card shows inline error with Retry button | Intercept `GET /api/user/keys` with 500, assert SSH keys card shows error, other cards render |
| 36 | Retry button on errored card re-fetches and renders data | Intercept first request with 500, then allow second, click Retry, card renders data |
| 37 | Full-page error when profile fetch fails | Intercept `GET /api/user` with 500, assert full-page error message and Retry button |
| 38 | Full-page Retry button recovers from profile error | Intercept first profile request with 500, allow second, click Retry, page renders |
| 39 | Tab key navigates through sidebar items then through cards | Focus starts in sidebar, tabs through each item, then into card links |
| 40 | Summary cards have appropriate ARIA labels | Each card has `role="region"` and `aria-label` matching its title |
| 41 | Sidebar active item has `aria-current="page"` | Active sidebar item has the correct ARIA attribute |
| 42 | Responsive: viewport 1024px shows two-column card grid | Resize to 1024px, assert cards in 2 columns |
| 43 | Responsive: viewport 767px shows single-column cards and collapsed sidebar | Resize to 767px, assert single-column layout and tab bar/hamburger |
| 44 | User with 10 emails — card shows "10 email addresses" | Pre-create 10 emails, navigate to settings, assert count |
| 45 | User with 255-character display name — card truncates at 50 chars with ellipsis | Set long display name, navigate, assert truncation |
| 46 | User with 500-character bio — card truncates at 80 chars with ellipsis | Set long bio, navigate, assert truncation |
| 47 | User with emoji in display name — card renders emoji correctly | Set display name with emoji, navigate, assert emoji visible |
| 48 | User with CJK characters in bio — card renders CJK correctly | Set bio with CJK text, navigate, assert text visible |
| 49 | Concurrent navigation away and back preserves loaded state | Navigate to Profile, immediately back to Settings, data still rendered |
| 50 | Cards do not flash or re-layout on data load | Assert no layout shift (CLS) during card loading |

### CLI E2E Tests

| # | Test Description | Command | Expected |
|---|-----------------|---------|----------|
| 51 | Settings summary with valid auth | `codeplane user settings` | Exit 0, output contains "Profile", "Email Addresses", "SSH Keys", "Access Tokens", "Active Sessions", "Connected", "Notifications" |
| 52 | Settings summary JSON output | `codeplane user settings --json` | Exit 0, stdout is valid JSON with keys: profile, emails, ssh_keys, tokens, sessions, connected_accounts, notifications |
| 53 | Settings summary without auth | `codeplane user settings` (no token) | Exit code 1, error message about authentication |
| 54 | Settings summary with section filter | `codeplane user settings --section emails` | Exit 0, output contains only email summary |
| 55 | Settings summary with invalid section filter | `codeplane user settings --section invalid` | Exit code non-zero, error message listing valid sections |
| 56 | Settings summary JSON with section filter | `codeplane user settings --json --section ssh_keys` | Exit 0, JSON contains only `ssh_keys` key |
| 57 | Settings summary shows correct email count after adding email | Add email via API, then `codeplane user settings` | Output shows incremented email count |
| 58 | Settings summary shows correct SSH key count after adding key | Add key via API, then `codeplane user settings` | Output shows incremented key count |
| 59 | Settings summary shows notification status as enabled | Enable notifications via API, then `codeplane user settings` | Output shows "Email enabled" |
| 60 | Settings summary shows notification status as disabled | Disable notifications via API, then `codeplane user settings` | Output shows "Email disabled" |

### API Integration Tests

| # | Test Description | Method / Setup | Expected |
|---|-----------------|----------------|----------|
| 61 | All 7 summary endpoints return 200 for authenticated user | GET each endpoint with valid PAT | All return 200 with valid JSON |
| 62 | All 7 summary endpoints return 401 for unauthenticated request | GET each endpoint without auth | All return 401 |
| 63 | Parallel fetch of all 7 endpoints completes within 2 seconds | Fire all 7 GET requests concurrently | All resolve within 2000ms |
| 64 | Email count matches `GET /api/user/emails` array length | Compare settings email count to array length | Counts match |
| 65 | SSH key count matches `GET /api/user/keys` array length | Compare settings key count to array length | Counts match |
| 66 | Token count matches `GET /api/user/tokens` array length | Compare settings token count to array length | Counts match |
| 67 | Session count matches `GET /api/user/sessions` array length | Compare settings session count to array length | Counts match |
| 68 | Connected account count matches `GET /api/user/connections` array length | Compare count to array length | Counts match |
| 69 | Rate limit headers present on all responses | Check `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | All headers present with valid values |
| 70 | Exceeding rate limit returns 429 with Retry-After | Fire requests until rate limited | 429 response with `Retry-After` header |

### Boundary and Load Tests

| # | Test Description | Expected |
|---|-----------------|----------|
| 71 | User with maximum emails (10), keys (100), tokens (100), sessions (50) — page renders all counts correctly | All summary cards show correct counts |
| 72 | User with zero of everything (no extra emails, no keys, no tokens, 1 session, no connections) — page renders all empty/zero states | All cards show empty CTAs or zero counts |
| 73 | Display name at exactly 50 characters — card shows full name without truncation | Name displayed in full, no ellipsis |
| 74 | Display name at 51 characters — card truncates with ellipsis | Name truncated to 50 chars + "…" |
| 75 | Bio at exactly 80 characters — card shows full bio without truncation | Bio displayed in full, no ellipsis |
| 76 | Bio at 81 characters — card truncates with ellipsis | Bio truncated to 80 chars + "…" |
| 77 | Primary email with 1-character local part — masked correctly | "a@example.com" → "a***@example.com" |
| 78 | Primary email with 2-character local part — masked correctly | "ab@example.com" → "a***b@example.com" |
| 79 | Primary email with 254-character total length — masked correctly | Masking applies, no overflow |
| 80 | 5 concurrent page loads from the same user — all return consistent data | All responses identical |
| 81 | Settings home page load time under 2 seconds for user with moderate data | Latency assertion passes |
| 82 | Settings home page load time under 3 seconds for user with maximum data | Latency assertion passes |

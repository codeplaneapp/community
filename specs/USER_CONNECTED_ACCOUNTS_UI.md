# USER_CONNECTED_ACCOUNTS_UI

Specification for USER_CONNECTED_ACCOUNTS_UI.

## High-Level User POV

When you navigate to your account settings in Codeplane and click "Connected Accounts" in the sidebar, you land on a dedicated page that shows you every external identity provider linked to your Codeplane account. Today that means GitHub, with the architecture ready for additional providers in the future.

This page is your control center for external identity links. Each connected provider appears as a clearly branded card showing the provider's logo, the external identity associated with the connection, and when you first linked it. If you signed up using GitHub OAuth, you will see a GitHub card here confirming which external account is tied to your Codeplane identity.

You can disconnect any provider directly from this page. Clicking the Disconnect button opens a confirmation dialog that explains what will happen — you will no longer be able to sign in using that provider, but your Codeplane account, repositories, and data remain untouched. Codeplane protects you from accidentally locking yourself out: if the provider you are trying to disconnect is your only way to sign in (no SSH keys and no other connected providers), the Disconnect button is disabled and a tooltip explains why.

If you have no connected accounts — for example, if you signed up using key-based authentication — the page shows a friendly empty state with a call-to-action to connect GitHub. After connecting or disconnecting a provider, the page updates immediately without a full reload.

The connected accounts page is strictly private. Only you can see and manage your own connections. The page requires authentication and cannot be accessed by other users, administrators, or anonymous visitors.

From the CLI, you can list your connected accounts using `codeplane api /api/user/connections` and disconnect one using `codeplane api /api/user/connections/:id --method DELETE`. The TUI does not currently have a dedicated connected accounts screen, but the data is accessible through the generic API flow. Future iterations may add a dedicated `codeplane auth connections` subcommand and a TUI settings screen.

## Acceptance Criteria

### Definition of Done

- [ ] The route `/settings/connections` renders a Connected Accounts page within the settings layout.
- [ ] The page uses the shared settings sidebar navigation and highlights "Connected Accounts" as the active item.
- [ ] The page fetches connected account data from `GET /api/user/connections` on mount.
- [ ] Each connected account is rendered as a visually distinct card displaying the provider icon, provider name, external identity, connection date, and a Disconnect button.
- [ ] When the user has zero connected accounts, an empty state is displayed with a heading, explanation text, and a call-to-action button to connect GitHub.
- [ ] A loading skeleton is displayed while the API request is in flight.
- [ ] An inline error banner with a Retry button is displayed if the API request fails.
- [ ] The Disconnect button triggers a confirmation dialog (specified in `USER_CONNECTED_ACCOUNT_REMOVE`).
- [ ] When the user has only one connected account and zero SSH keys, the Disconnect button is visually disabled with a tooltip explaining why.
- [ ] After a successful disconnect, the connected accounts list re-fetches and re-renders without the removed entry and without a page reload.
- [ ] After connecting a new provider via OAuth (returning from the OAuth callback), the page reflects the new connection on next visit.
- [ ] Unauthenticated visitors to `/settings/connections` are redirected to the login page.
- [ ] The page is fully keyboard-accessible and screen-reader-compatible.
- [ ] The page is responsive and renders correctly at viewport widths from 320px to 2560px.
- [ ] The connected accounts summary card on the Settings Home page (`/settings`) correctly reflects the count and provider names shown on this page.
- [ ] The CLI command `codeplane api /api/user/connections` returns the same data the UI consumes.

### Edge Cases

- [ ] A user who signed up via key-based authentication and has never linked an OAuth provider sees the empty state — not an error, not a blank page.
- [ ] A user who signed up via GitHub OAuth sees exactly one connected account card for GitHub.
- [ ] A user who disconnected GitHub and then re-connected it sees one card with a new `id` and fresh connection date — not two cards, not a stale card.
- [ ] If the user has connected accounts from multiple providers (future state), all are displayed in insertion order (`id` ascending).
- [ ] A user with a very long `provider_user_id` (up to 255 characters) sees the full ID rendered without truncation. The card layout accommodates the length via text wrapping or horizontal scroll within the identity field.
- [ ] If the API returns a provider name the UI does not have a specific icon for, a generic link/chain icon is used as fallback, and the provider name is displayed in title case.
- [ ] If the user's session expires while the page is open, clicking Retry or navigating redirects to the login page.
- [ ] Navigating to `/settings/connections/` (trailing slash) behaves identically to `/settings/connections`.
- [ ] Navigating to `/settings/connections` with a hash or query string (e.g., `?ref=home`) does not break the page.
- [ ] If the user disconnects their only connected account while they have at least one SSH key, the page transitions from showing one card to the empty state.
- [ ] Rapid navigation between settings pages does not cause stale data or race conditions on the connected accounts page.

### Boundary Constraints

- [ ] The page renders correctly for 0 to 10 connected accounts (the maximum expected given the bounded provider set).
- [ ] The `provider` name is a non-empty string, max 50 characters, lowercase alphanumeric and hyphens. The UI title-cases it for display (e.g., `"github"` → `"GitHub"`).
- [ ] The `provider_user_id` is a non-empty string, max 255 characters. The UI renders it in full without truncation.
- [ ] The `created_at` and `updated_at` fields are valid ISO 8601 UTC datetime strings. The UI displays `created_at` as a relative date with full timestamp in a hover tooltip.
- [ ] All text content supports UTF-8 encoding. Emoji, CJK, and RTL characters render correctly.
- [ ] The sidebar renders all 9 navigation items without overflow or truncation at viewport widths ≥ 320px.
- [ ] On viewports < 768px, the sidebar collapses into a horizontal tab bar or hamburger menu.
- [ ] The loading skeleton matches the dimensions of loaded cards to prevent cumulative layout shift (CLS).
- [ ] The connect GitHub CTA button in the empty state initiates the standard GitHub OAuth flow at `GET /api/auth/github`.

## Design

### Web UI Design

**Route**: `/settings/connections`

**Layout**: Two-column settings layout, consistent with all `/settings/*` pages.

- **Left column (sidebar, ~240px fixed)**: Shared settings sidebar navigation. The "Connected Accounts" item (🔗 icon) is highlighted with a 4px left-border accent in primary color, bold text, and subtle background.
- **Right column (content area, fluid)**: Connected accounts content.

**Page Header**:
- **Title**: "Connected accounts" — rendered as an `h1` heading.
- **Subtitle**: "External services linked to your Codeplane account. You can disconnect a service at any time." — secondary text color.

**Connected Account Cards**:

Each connected account rendered as a card in a vertical list:

```
┌──────────────────────────────────────────────────────┐
│ [Provider Icon 32×32]  Provider Name (title case)    │
│                                                      │
│  External ID: {provider_user_id}                     │
│  Connected {relative_date}                           │
│                                                      │
│                              [Disconnect] (red)      │
└──────────────────────────────────────────────────────┘
```

| Element | Specification |
|---------|---------------|
| Provider icon | 32×32px. GitHub: Octocat logo. Unknown: generic link icon. |
| Provider name | Title-cased (e.g., `"github"` → `"GitHub"`). Semi-bold, primary color. |
| External identity | `provider_user_id` in secondary text. Prefixed "GitHub User ID:" for GitHub. Monospace font. |
| Connection date | `created_at` as relative date (e.g., "Connected Mar 10, 2025"). Full ISO timestamp in hover tooltip. |
| Disconnect button | Red text/outlined button labeled "Disconnect". Right-aligned. |

**Disconnect Button States**:
- **Active**: User has ≥ 2 auth methods. Clickable, opens confirmation dialog.
- **Disabled**: User has 1 connected account AND 0 SSH keys. Tooltip: "You cannot disconnect your only authentication method. Add an SSH key or connect another provider first." `aria-describedby` linked.

**Confirmation Dialog**:
- Modal with backdrop. Title: "Disconnect {Provider}?"
- Body explains consequences including `provider_user_id`.
- Cancel (secondary) and Disconnect (destructive/red) buttons.
- Spinner on confirm button while DELETE in flight. Focus trap. Escape closes.

**Post-Disconnect UI Responses**:
- `204`: Dialog closes, toast "{Provider} disconnected successfully", list re-fetches.
- `409`: Inline error in dialog about last auth method. Dialog stays open.
- `404`: "Already removed" message, dialog closes, list re-fetches.
- `401`: Redirect to login.
- `500`/network: "Something went wrong" with Retry button in dialog.

**Empty State** (0 accounts):
- Centered. Link icon 48×48. "No connected accounts" heading.
- "Link an external account to enable quick sign-in and identity verification."
- "Connect GitHub →" button navigates to `GET /api/auth/github`.
- Hidden when GitHub already connected (upsert semantics).

**Loading State**: Skeleton card with shimmer. 1 skeleton card by default. Title/sidebar render immediately.

**Error State**: "Failed to load connected accounts." with Retry button. Title/sidebar still rendered.

**Responsive**: ≥1024px two-column; 768–1023px narrower sidebar; <768px collapsed sidebar, full-width cards.

### API Shape

**List**: `GET /api/user/connections` → `200 OK` with `ConnectedAccountResponse[]`
**Disconnect**: `DELETE /api/user/connections/:id` → `204 No Content`
**Connect**: `GET /api/auth/github` → OAuth redirect flow
**SSH Keys** (for guard check): `GET /api/user/keys`

### SDK Shape

`@codeplane/ui-core` should provide:
- `useConnectedAccounts()` — reactive resource fetching/caching connected accounts list.
- `useDisconnectAccount()` — mutation helper firing DELETE, invalidating cache on success.
- `useSSHKeys()` — reactive resource for SSH key count (last-auth-method guard).

### CLI Command

```bash
codeplane api /api/user/connections          # list
codeplane api /api/user/connections --json provider  # filtered
codeplane api /api/user/connections/42 --method DELETE  # disconnect
```

Future: `codeplane auth connections list` and `codeplane auth connections remove <id>`.

### TUI UI

No dedicated screen currently. Future: tabular list (PROVIDER | EXTERNAL ID | CONNECTED), `d`/Delete to disconnect, confirmation prompt.

### Documentation

**"Managing your connected accounts" guide** covering:
- Viewing connected accounts from web settings and CLI.
- What a connected account represents.
- Supported providers (GitHub).
- How to connect/disconnect providers.
- Last-auth-method protection.
- Re-connecting after disconnect.
- Difference between connected accounts and OAuth2 applications.
- That disconnecting from Codeplane does not revoke the token on the provider side.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Authenticated user (self)** | ✅ Full access: view, connect, disconnect |
| **Other authenticated user** | ❌ Cannot access. Route is self-scoped (user ID from session context). |
| **Organization admin** | ❌ Cannot access a member's connected accounts |
| **Site admin** | ❌ Cannot access through this page (admin audit surfaces are separate) |
| **Anonymous / unauthenticated** | ❌ Redirected to login page |

No IDOR risk — user ID always derived from authenticated session context, never from URL.

### Rate Limiting

| Action | Limit | Scope |
|--------|-------|-------|
| List (`GET`) | 5,000 req/hour | Per authenticated user (standard) |
| Disconnect (`DELETE`) | 5,000 req/hour + **10/min burst** for destructive actions | Per authenticated user |
| Connect (OAuth initiation) | Governed by auth rate limits | Per IP / per user |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) on every response. `429` returned when exceeded with `Retry-After` header.

### Data Privacy & PII

- `provider_user_id` is a pseudonymous identifier, displayed only to the owning user.
- Encrypted tokens (`access_token_encrypted`, `refresh_token_encrypted`) are **never** sent to the client.
- `expires_at` and `profile_data` are excluded from API responses.
- `Cache-Control: no-store` enforced at API layer.
- UI must not persist connected account data in `localStorage`/`sessionStorage` beyond the page session.
- Server logs must not log `provider_user_id` at INFO level or below.
- DELETE is a hard delete — row removed entirely, supporting data minimization.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `UserConnectedAccountsPageViewed` | User navigates to `/settings/connections` and data loads | `user_id`, `account_count`, `providers` (array), `client` ("web") |
| `UserConnectedAccountsListed` | Successful `GET /api/user/connections` returning 200 | `user_id`, `account_count`, `providers`, `client` (web/cli/tui/api) |
| `UserConnectedAccountDisconnectInitiated` | User clicks Disconnect button (opens dialog) | `user_id`, `account_id`, `provider`, `client` ("web") |
| `UserConnectedAccountDisconnectConfirmed` | User confirms in dialog (before DELETE) | `user_id`, `account_id`, `provider`, `client` ("web") |
| `UserConnectedAccountDisconnectCancelled` | User clicks Cancel in dialog | `user_id`, `account_id`, `provider`, `client` ("web") |
| `UserConnectedAccountRemoved` | Successful DELETE returning 204 | `user_id`, `account_id`, `provider`, `remaining_account_count`, `remaining_ssh_key_count`, `client`, `session_type` |
| `UserConnectedAccountRemoveBlocked` | DELETE returning 409 | `user_id`, `account_id`, `provider`, `client` |
| `UserConnectedAccountConnectInitiated` | User clicks "Connect GitHub" CTA | `user_id`, `target_provider`, `client`, `source` ("empty_state" or "add_button") |
| `UserConnectedAccountsEmptyStateViewed` | User sees empty state (0 accounts) | `user_id`, `client` ("web") |

### Funnel Metrics

- **Settings → Connected Accounts visit rate**: % of users navigating from `/settings/*` to `/settings/connections`.
- **Page → Disconnect click rate**: % of visitors who click Disconnect.
- **Disconnect click → Confirm rate**: % who confirm after opening dialog. Low = dialog is effective safety net.
- **Empty state → Connect click rate**: % who click "Connect GitHub". Low = CTA not compelling.
- **Disconnect → Re-link within 30 days**: High = possible accidental disconnections.
- **Last-auth-method block frequency**: How often users hit the disabled button or 409.
- **Connected account density**: Distribution of accounts per user (0, 1, 2+).

### Success Indicators

- Page loads (first meaningful paint) in under 1 second on 3G.
- API `GET /api/user/connections` p99 latency under 100ms.
- Zero cross-user data leakage incidents.
- Zero occurrences of encrypted tokens in client payloads.
- Empty state CTA click-through rate ≥ 15%.
- Page visited by ≥ 5% of OAuth-registered users within 60 days of creation.

## Observability

### Logging

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Connected accounts page data fetched | `DEBUG` | `user_id`, `account_count`, `request_id` | Do NOT log `provider_user_id` |
| Connected accounts data fetch failed | `ERROR` | `user_id`, `request_id`, `error_code`, `error_message` | Include error details |
| Connected account disconnect requested | `DEBUG` | `user_id`, `account_id`, `request_id` | Entry to DELETE handler |
| Disconnect succeeded | `INFO` | `user_id`, `account_id`, `provider`, `remaining_accounts`, `remaining_keys`, `request_id` | Log provider name, not external user ID |
| Disconnect blocked (last auth method) | `WARN` | `user_id`, `account_id`, `provider`, `remaining_accounts`, `remaining_keys`, `request_id` | Safety guard triggered |
| Disconnect failed (404) | `DEBUG` | `user_id`, `account_id`, `request_id` | Stale UI or enumeration attempt |
| Disconnect failed (service error) | `ERROR` | `user_id`, `account_id`, `request_id`, `error_code`, `error_message` | Unexpected failure |
| Auth failure on endpoints | `WARN` | `request_id`, `source_ip` | Potential probe attempt |
| Slow query (>200ms) | `WARN` | `user_id`, `request_id`, `duration_ms` | Unexpected for bounded-list query |
| OAuth connect initiated from page | `INFO` | `user_id`, `provider`, `request_id` | User clicked Connect CTA |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_connections_list_total` | Counter | `status` (200,401,429,500) | List requests by status |
| `codeplane_user_connections_list_duration_seconds` | Histogram | — | List endpoint latency. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_user_connections_delete_total` | Counter | `status` (204,400,401,404,409,429,500) | Delete requests by status |
| `codeplane_user_connections_delete_duration_seconds` | Histogram | — | Delete endpoint latency. Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 |
| `codeplane_user_connections_delete_last_auth_blocked_total` | Counter | `provider` | Deletes blocked by last-auth guard |
| `codeplane_user_connected_accounts_count` | Gauge | `provider` | Total accounts across all users. Background job updated. |
| `codeplane_web_connected_accounts_page_loads_total` | Counter | `status` (success, error) | Page loads by data-fetch outcome |

### Alerts

#### `UserConnectionsListHighErrorRate`
**Condition:** `rate(codeplane_user_connections_list_total{status="500"}[5m]) / rate(codeplane_user_connections_list_total[5m]) > 0.05`
**Severity:** Warning
**Runbook:**
1. Check server error logs by `request_id`.
2. Verify DB connectivity — query is `SELECT ... WHERE user_id = $1 ORDER BY id ASC`.
3. Check if `oauth_accounts` table is locked by migration.
4. If transient (pool exhaustion), monitor 5 min. If persistent, restart server.
5. Check recent deployments for regressions.
6. Escalate to DB team if upstream.

#### `UserConnectionsListHighLatency`
**Condition:** `histogram_quantile(0.99, rate(codeplane_user_connections_list_duration_seconds_bucket[5m])) > 0.5`
**Severity:** Warning
**Runbook:**
1. Check `listUserOAuthAccounts` query latency via `EXPLAIN ANALYZE`.
2. Verify index on `oauth_accounts(user_id)` exists and is healthy.
3. Check table bloat or vacuum backlog.
4. Check if specific users have unusually many records.
5. Check overall DB load and connection pool.

#### `UserConnectionsDeleteHighErrorRate`
**Condition:** `rate(codeplane_user_connections_delete_total{status="500"}[5m]) / rate(codeplane_user_connections_delete_total[5m]) > 0.05`
**Severity:** Warning
**Runbook:**
1. Check error logs for DELETE failures.
2. Verify DB connectivity.
3. Check if table is locked.
4. Check if last-auth-method check query is failing.
5. If transient, monitor. If persistent, restart.
6. Check recent deployments.
7. Escalate to DB team.

#### `UserConnectionsDeleteHighLatency`
**Condition:** `histogram_quantile(0.99, rate(codeplane_user_connections_delete_duration_seconds_bucket[5m])) > 1.0`
**Severity:** Warning
**Runbook:**
1. Check DELETE and last-auth-method query latency.
2. `EXPLAIN ANALYZE` on `DELETE FROM oauth_accounts WHERE id = $1 AND user_id = $2`.
3. Verify PK and `user_id` indexes.
4. Check overall DB load.

#### `UserConnectionsDeleteLastAuthBlockSpike`
**Condition:** `rate(codeplane_user_connections_delete_last_auth_blocked_total[1h]) > 20`
**Severity:** Info
**Runbook:**
1. Check if UI correctly disables Disconnect button when only 1 auth method.
2. Check if spike is from CLI/API vs. Web UI.
3. Review provider distribution.
4. No immediate action unless paired with user complaints.

#### `UserConnectionsAuthFailureSpike`
**Condition:** `rate(codeplane_user_connections_list_total{status="401"}[5m]) + rate(codeplane_user_connections_delete_total{status="401"}[5m]) > 50`
**Severity:** Info
**Runbook:**
1. Check source IP distribution.
2. If concentrated IPs, consider temporary blocking.
3. Verify clients aren't sending expired tokens.
4. Escalate to security if > 500/5m.

### Error Cases and Failure Modes

| Error | Status | Cause | User Impact | Recovery |
|-------|--------|-------|-------------|----------|
| Unauthenticated | 401 | Invalid session/token | Redirect to login | Re-authenticate |
| DB unavailable (list) | 500 | Connection failure | Error banner + Retry | Retry |
| DB unavailable (delete) | 500 | Connection failure | Dialog error + Retry | Retry |
| Query timeout | 500 | Slow query/overload | Error + Retry | Investigate if persistent |
| Invalid account ID | 400 | Bad `:id` param | Error message | Use correct ID |
| Account not found | 404 | Already removed/other user | "Already removed" | Benign |
| Last auth method | 409 | Would leave 0 methods | Dialog error explains guard | Add SSH key first |
| Rate limited | 429 | Too many requests | Rate limit error | Wait for reset |
| Network error | — | No connectivity | Error + Retry | Check network |
| OAuth flow failure | — | Provider error/denial | Error on return | Retry OAuth |
| Corrupted row | 500 | Malformed DB data | Partial/empty list | DB investigation |

## Verification

### API Integration Tests

| # | Test | Expected Result |
|---|------|------------------|
| 1 | `GET /api/user/connections` with valid PAT, user has GitHub connected | `200`; array with ≥1 element; each has `id` (number), `provider` (string), `provider_user_id` (string), `created_at` (string), `updated_at` (string) |
| 2 | `GET /api/user/connections` with no auth header | `401`; no account data leaked |
| 3 | `GET /api/user/connections` with expired/revoked PAT | `401` |
| 4 | `GET /api/user/connections` for user with 0 accounts | `200`; `[]` (not `null`) |
| 5 | `GET /api/user/connections` — sorted by `id` ascending | `result[i].id < result[i+1].id` for all pairs |
| 6 | `GET /api/user/connections` — no sensitive fields | No `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `profile_data`, `user_id` |
| 7 | `GET /api/user/connections` — `created_at`/`updated_at` are valid ISO 8601 | `new Date(field)` is not NaN |
| 8 | `GET /api/user/connections` — `updated_at >= created_at` | Timestamp comparison passes |
| 9 | `GET /api/user/connections` — `id` is positive integer | `id > 0 && Number.isInteger(id)` |
| 10 | `GET /api/user/connections` — content-type `application/json` | Header assertion |
| 11 | Cross-user isolation: User A and B see only their own accounts | No `id` overlap |
| 12 | `DELETE /api/user/connections/:id` with valid auth, 2 accounts | `204`; subsequent GET excludes removed |
| 13 | `DELETE /api/user/connections/:id` no auth | `401` |
| 14 | `DELETE` with `:id` = `0` | `400` `"invalid account id"` |
| 15 | `DELETE` with `:id` = `-1` | `400` |
| 16 | `DELETE` with `:id` = `abc` | `400` |
| 17 | `DELETE` with `:id` = `3.14` | `400` |
| 18 | `DELETE` for another user's account | `404` (not `403`); other user unaffected |
| 19 | `DELETE` for non-existent ID | `404` |
| 20 | `DELETE` same ID twice | First `204`, second `404` |
| 21 | `DELETE` when 1 account, 0 SSH keys (last auth) | `409` `"cannot remove the last authentication method"` |
| 22 | `DELETE` when 1 account, 1 SSH key | `204` |
| 23 | `DELETE` when 2 accounts, 0 SSH keys | `204` |
| 24 | `DELETE` returns exactly `204` with empty body | Status and body assertion |
| 25 | `DELETE` with session cookie auth | `204` |
| 26 | `DELETE` with extraneous body | Body ignored, `204` |
| 27 | `GET` with `provider_user_id` at 255 chars | Full string returned |
| 28 | Concurrent DELETE same ID (5 parallel) | One `204`, four `404` |

### CLI E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 29 | `codeplane api /api/user/connections` valid auth | Exit `0`; valid JSON array |
| 30 | `codeplane api /api/user/connections` no token | Exit non-zero; stderr error |
| 31 | `codeplane api /api/user/connections --json provider` | Filtered output |
| 32 | `codeplane api /api/user/connections/42 --method DELETE` existing | Exit `0`; no stdout |
| 33 | `codeplane api /api/user/connections/0 --method DELETE` | Exit non-zero; `"invalid account id"` |
| 34 | Round-trip: list → delete → list → verify absence | Full lifecycle |
| 35 | Delete last auth method via CLI | Exit non-zero; `"cannot remove the last authentication method"` |

### Playwright (Web UI) E2E Tests

| # | Test | Expected Result |
|---|------|------------------|
| 36 | Navigate to `/settings/connections` authenticated | Title "Connected accounts" visible |
| 37 | Sidebar highlights "Connected Accounts" | Active visual indicator |
| 38 | Provider icon and name displayed | Each card has provider name + icon |
| 39 | External identity displayed | Card shows `provider_user_id` |
| 40 | Connection date in human-readable format | Date visible |
| 41 | Date hover tooltip shows full ISO timestamp | Tooltip appears |
| 42 | Each card has Disconnect button | Button labeled "Disconnect" |
| 43 | Loading skeleton shown before data | Skeleton visible with throttling |
| 44 | Error state on API 500 (intercepted) | Error banner + Retry |
| 45 | Retry after error re-fetches | Data loads on retry |
| 46 | Empty state with 0 accounts | "No connected accounts" + CTA |
| 47 | "Connect GitHub" CTA navigates to OAuth | URL → `/api/auth/github` |
| 48 | Disconnect disabled with 1 account, 0 keys | `disabled` attribute |
| 49 | Disabled button tooltip on hover | Tooltip explains why |
| 50 | Active Disconnect opens confirmation dialog | Modal with provider name |
| 51 | Dialog title matches provider | "Disconnect GitHub?" |
| 52 | Dialog body includes `provider_user_id` | External ID in body |
| 53 | Cancel closes dialog, no action | List unchanged |
| 54 | Escape closes dialog, no action | List unchanged |
| 55 | Confirm shows spinner on button | Spinner + disabled |
| 56 | Success: dialog closes, toast appears | Toast "{Provider} disconnected" |
| 57 | Success: removed card disappears | DOM element removed |
| 58 | Disconnect all → empty state appears | Empty state visible |
| 59 | Double-click confirm sends 1 DELETE | Network: exactly 1 request |
| 60 | Dialog traps keyboard focus | Tab cycling within dialog |
| 61 | Disconnect button `aria-label` correct | `"Disconnect {Provider} account"` |
| 62 | 409 in dialog shows inline error | Error about last auth method |
| 63 | 500 in dialog shows error + Retry | Error + Retry button |
| 64 | Unauthenticated → redirect to login | Login page |
| 65 | Trailing slash `/settings/connections/` works | Same page |
| 66 | Rapid navigation: no stale data | Fresh data |
| 67 | 320px viewport: responsive layout | Sidebar collapsed, no overflow |
| 68 | 2560px viewport: proper layout | Two-column, content constrained |

### Boundary and Stress Tests

| # | Test | Expected Result |
|---|------|------------------|
| 69 | 5 connected accounts displayed correctly | 5 cards, sorted by `id` ASC |
| 70 | `provider_user_id` at 255 chars displayed in full | Not truncated |
| 71 | `provider_user_id` > 255 chars rejected at creation | Validation error; excluded from list |
| 72 | 5 concurrent GET requests return consistent results | Identical responses |
| 73 | GET response time < 200ms with 3 accounts | Latency assertion |
| 74 | GET response time < 200ms with 0 accounts | Latency assertion |
| 75 | DELETE response time < 200ms | Latency assertion |
| 76 | DELETE with `:id` = `2147483647` (max int32), non-existent | `404`; no crash |
| 77 | DELETE with `:id` = `2147483648` (int32 overflow) | `400` or `404`; no crash |
| 78 | DELETE with URL-encoded special chars (`%00`, `%27`) | `400`; no injection |
| 79 | 10 rapid sequential DELETEs (different IDs) | All succeed under burst limit |
| 80 | 20 rapid sequential DELETEs in 1 second | Some return `429` after burst exceeded |

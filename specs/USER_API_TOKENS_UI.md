# USER_API_TOKENS_UI

Specification for USER_API_TOKENS_UI.

## High-Level User POV

When you work with Codeplane across multiple tools — your CLI, CI pipelines, editor integrations, AI agents, or API scripts — each of those connections is powered by a Personal Access Token. The API Tokens settings page is where you see, create, and manage every one of those tokens from a single place inside the web UI.

You reach this page by navigating to **Settings → Tokens** in the sidebar. The page is divided into two main areas: a creation form at the top and a list of your existing tokens below it.

To create a new token, you give it a descriptive name — something like "CI deploy pipeline" or "VS Code integration" — and select one or more permission scopes from organized checkbox groups. Scopes are grouped by what they control: Repository access, Organization access, and User account access. If you are an administrator, you also see admin-level scopes. Once you click "Generate token," Codeplane creates the credential and displays it in a prominent banner. This is the only time you will ever see the full token — you must copy it immediately. The banner includes a one-click copy button and a clear warning that the token cannot be retrieved later. After you dismiss the banner, the new token appears at the top of your token list.

The token list shows every active token on your account, including tokens you created manually and tokens that were automatically minted during CLI or agent login flows (these appear with the name "codeplane-cli"). For each token, you can see its name, a short identifier (the last eight characters of its hash), the scopes it carries, when it was last used to authenticate a request, and when it was created. You can scan this list to find stale tokens that haven't been used in months, tokens with overly broad scopes, or tokens you no longer recognize.

When you no longer need a token — or you suspect one has been compromised — you click the "Revoke" button on that token's row. A confirmation dialog warns you that revocation is permanent and immediate: any system using that token will lose access on its very next request. Once you confirm, the token vanishes from the list and is permanently destroyed. There is no undo.

This page is private to you. No other user, not even an administrator, can see or manage your tokens. It is the central place to maintain credential hygiene — creating tokens with the minimum scopes needed, identifying and revoking tokens you no longer use, and keeping your account's credential surface area small and auditable.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can navigate to `/settings/tokens` in the web UI and perform the full token lifecycle — create tokens with scoped permissions, view all active tokens with metadata, copy newly created tokens, and revoke tokens with confirmation — with all validation, security, empty states, loading states, error states, and edge cases handled correctly and consistently with the underlying API contract.

### Functional Criteria

- [ ] The page is accessible at `/settings/tokens` for any authenticated user.
- [ ] The page renders within the settings layout with a left sidebar showing all settings navigation items, with "Tokens" highlighted as active.
- [ ] The page contains a token creation form above the token list.
- [ ] The creation form includes a text input for the token name.
- [ ] The creation form includes a checkbox-based scope selector organized by resource category.
- [ ] The "Generate token" button is disabled when the name is empty or no scopes are selected.
- [ ] Clicking "Generate token" sends `POST /api/user/tokens` and shows a loading spinner on the button.
- [ ] On successful creation, a token reveal banner appears displaying the raw token in a monospace read-only field.
- [ ] The token reveal banner includes a "Copy" button that copies the token to the clipboard and shows visual confirmation ("Copied!").
- [ ] The token reveal banner includes a warning: "Make sure to copy this token now. You won't be able to see it again."
- [ ] The token reveal banner includes a "Done" or "Dismiss" button to close it.
- [ ] After the reveal banner is dismissed, the token list refreshes to include the new token at the top — without a full page reload.
- [ ] The token list table displays columns: Name, Identifier, Scopes, Last Used, Created, and Actions.
- [ ] The token list is ordered by `created_at` descending (newest first), matching the API response order.
- [ ] The `token_last_eight` column renders in a monospace font.
- [ ] Scopes are displayed as individual badges/tags, not as a comma-separated string.
- [ ] `last_used_at` is displayed as relative time ("2 hours ago") or "Never" when null.
- [ ] `created_at` is displayed as relative time ("3 days ago").
- [ ] Long token names (>40 characters) are truncated with an ellipsis in the table cell and show the full name in a tooltip on hover.
- [ ] Each token row includes a "Revoke" button styled as a destructive action.
- [ ] Clicking "Revoke" opens a confirmation dialog with the token name, a permanence warning, and "Cancel" / "Revoke token" buttons.
- [ ] The "Revoke token" button in the dialog is styled destructively (red) and shows a loading spinner while the `DELETE` request is in-flight.
- [ ] On successful revocation (`204`), the dialog closes, the token is removed from the list, and a success toast appears.
- [ ] On revocation failure, the dialog stays open and displays an inline error message.
- [ ] Pressing Escape, clicking "Cancel", or clicking the dialog backdrop closes the dialog without revoking.
- [ ] The raw token value is never displayed anywhere on the page for existing tokens — only during the creation reveal banner.
- [ ] Exchange-minted tokens (name: `"codeplane-cli"`) appear in the list and can be revoked identically to manually created tokens.

### Edge Cases

- [ ] Unauthenticated user navigating to `/settings/tokens`: Redirected to the login page.
- [ ] User with zero tokens: Empty state message is shown with description and "Generate new token" CTA.
- [ ] Empty name on form submit: Inline validation error "Token name is required"; no API call.
- [ ] Whitespace-only name: Inline validation error after client-side trimming.
- [ ] Name at maximum length (255 characters): Form accepts and submits successfully.
- [ ] Name exceeding maximum length (256 characters): Client-side validation prevents submission.
- [ ] Unicode characters in name (emoji, CJK): Accepted and displayed correctly.
- [ ] No scopes selected: "Generate token" button remains disabled.
- [ ] Admin scopes for non-admin user: Admin scope checkboxes not rendered.
- [ ] Admin scopes for admin user: Admin scope checkboxes visible and functional.
- [ ] API returns `403` for privileged scopes: Error banner within the form area.
- [ ] Network error during creation: Error banner with retry suggestion.
- [ ] Network error during revocation: Dialog stays open with inline error.
- [ ] Duplicate token names: Both tokens appear with different identifiers.
- [ ] User with 50+ tokens: All tokens render; table scrolls vertically.
- [ ] Revoking the last remaining token: Empty state appears.
- [ ] Double-clicking "Revoke token": Button disabled after first click.
- [ ] Navigating away and returning: Raw token from previous creation no longer visible.
- [ ] Session expires while on page: Next API call redirects to login.

### Boundary Constraints

- [ ] Token name input: `maxlength="255"` attribute. Client-side rejects empty/whitespace-only.
- [ ] Token name display in list: truncated at ~40 characters with tooltip for full name.
- [ ] Token name in revocation dialog: displayed in full, not truncated.
- [ ] `token_last_eight` display: exactly 8 lowercase hex characters, monospace font.
- [ ] Scope badges: each scope is a distinct visual element.
- [ ] Relative time: consistent formatting ("just now", "2 minutes ago", "3 hours ago", etc.).
- [ ] "Never" for unused tokens: displayed as literal string "Never".
- [ ] Raw token in reveal banner: read-only monospace field, selectable for manual copy.
- [ ] Clipboard copy: uses `navigator.clipboard.writeText` with graceful fallback.
- [ ] Confirmation dialog: modal that traps focus and prevents background interaction.
- [ ] Toast notifications: auto-dismiss after 5 seconds; manually dismissible.

## Design

### Web UI Design

**Route:** `/settings/tokens`

**Layout:** Standard settings layout — persistent left sidebar for settings navigation, main content area to the right.

**Settings sidebar navigation items** (with "Tokens" active):
- Profile
- Emails
- SSH Keys
- **Tokens** ← active
- Sessions
- Connected Accounts
- Notifications
- OAuth Applications

**Page structure (top to bottom):**

1. **Page header**: "Personal Access Tokens" title with subtitle: "Tokens are used to authenticate with Codeplane from the CLI, CI pipelines, scripts, and editor integrations."

2. **Token creation form** (card/bordered section):
   - **Name input**: `<input type="text" maxlength="255" placeholder="e.g., CI Deploy Pipeline" />`. Required. Client-side validation on blur and submit. Error state: red border + inline error text.
   - **Scope selector**: Grouped checkboxes under category headings. **Repository**: `read:repository` ("Read-only access to repositories"), `write:repository` ("Read and write access to repositories"). **Organization**: `read:organization` ("Read-only access to organizations"), `write:organization` ("Read and write access to organizations"). **User**: `read:user` ("Read-only access to user settings"), `write:user` ("Read and write access to user settings, including token management"). **Admin** (admin users only): `admin`, `read:admin`, `write:admin`, `all` with descriptions.
   - **Generate button**: Primary style, label "Generate token". Disabled when name empty (after trim) OR no scope checked. Spinner during API call.

3. **Token reveal banner** (after creation success):
   - Visually distinct success banner.
   - Title: "Personal access token created successfully"
   - Token: `<input type="text" readonly value="codeplane_..." />` in monospace, full width.
   - Copy button: changes to "Copied!" for 2s after click.
   - Warning: "Make sure to copy this token now. You won't be able to see it again."
   - Dismiss: "Done" button hides banner, clears form, ensures list is current.

4. **Token list table**:
   - Columns: Name (~200px flex, truncated at ~40 chars), Identifier (~100px, monospace), Scopes (~250px flex, pill badges), Last Used (~120px, relative time or "Never"), Created (~120px, relative time), Actions (~80px, red "Revoke" button).
   - Sorted by `created_at` descending.

5. **Empty state**: Centered icon, "You don't have any personal access tokens yet.", description text, "Generate new token" primary button.

6. **Loading state**: Skeleton rows matching table layout. Form renders immediately.

7. **Error state**: Inline error banner "Failed to load tokens. Please try again." with retry button.

**Revocation confirmation dialog:**
- Modal with backdrop overlay.
- Title: "Revoke personal access token"
- Body: `Are you sure you want to revoke "${tokenName}"? This action is permanent and cannot be undone. Any system using this token will immediately lose access.`
- Token name displayed in full.
- Actions: "Cancel" (secondary, left), "Revoke token" (destructive/red, right).
- Loading: spinner on "Revoke token", both buttons disabled during request.
- Success: dialog closes, token removed from list with fade-out, toast "Token revoked successfully."
- Error: dialog stays open, inline error above buttons.
- Dismiss: Escape, backdrop click, or Cancel all close without API call.

**Optimistic updates**: After `204` revocation, token removed from local state. After `201` creation, token prepended to local state.

### API Shape

**List**: `GET /api/user/tokens` → `200` with `TokenSummary[]`.
**Create**: `POST /api/user/tokens` with `{ name, scopes }` → `201` with `CreateTokenResult`.
**Revoke**: `DELETE /api/user/tokens/:id` → `204` empty body.

### SDK Shape

```typescript
interface TokenSummary {
  id: number;
  name: string;
  token_last_eight: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
}

interface CreateTokenRequest {
  name: string;
  scopes: string[];
}

interface CreateTokenResult extends TokenSummary {
  token: string;
}
```

UI-core client methods: `listTokens()`, `createToken(req)`, `deleteToken(tokenId)`.

### CLI Command

CLI equivalents (specified in sibling specs):
- `codeplane auth token list [--json]`
- `codeplane auth token create <name> --scopes <scopes> [--json]`
- `codeplane auth token delete <id> [--yes] [--json]`

### TUI UI

The TUI does not expose token management. Users use CLI or web UI. Intentional product decision.

### Editor Integrations (VS Code, Neovim)

Editors do not provide token management UI. Tokens managed via CLI or web UI.

### Documentation

1. **"Managing Personal Access Tokens"** — Step-by-step guide: navigating to Settings → Tokens, creating tokens (annotated screenshots), the reveal banner and copying, reading the token list, revoking tokens, managing exchange-minted `"codeplane-cli"` tokens.
2. **"Token Scopes Reference"** — Reference table of all canonical scopes with descriptions. Shared with CREATE/LIST/REVOKE specs.
3. **"Security Best Practices for PATs"** — Least-privilege scopes, not committing tokens, rotation, revocation, exchange vs manual tokens.

## Permissions & Security

### Authorization Roles

| Operation | Required Role |
|-----------|---------------|
| View `/settings/tokens` page | Authenticated user (any role) — requires active browser session |
| List tokens on the page | Authenticated user — session cookie auth (not scope-gated) |
| Create a token via the form | Authenticated user — session cookie auth (not scope-gated) |
| Create a token with admin scopes | Authenticated user with `is_admin = true` |
| Revoke a token via the Revoke button | Authenticated user — session cookie auth (not scope-gated) |
| View another user's tokens | Not permitted. No admin override. No URL path exposes another user's tokens. |

### Scope Enforcement

- The web UI authenticates via session cookies, which are not scope-gated. All token CRUD operations are available to any authenticated browser session.
- Admin scope checkboxes in the creation form are only rendered when `is_admin = true`. The server also enforces this with a `403` response as defense-in-depth.
- The UI must never display a URL or control that could be used to view another user's tokens.

### Rate Limiting

- All API calls are subject to standard API rate limiting by authenticated user ID.
- Token creation uses a stricter per-user rate limit (30 tokens per hour per user).
- `429` responses displayed as inline error: "Too many requests. Please wait and try again."
- Rate limit headers available in browser network inspector but not surfaced in UI.

### Data Privacy Constraints

- Raw token displayed only in creation reveal banner, only until dismissed. Never persisted in client-side storage (localStorage, sessionStorage, cookies, IndexedDB).
- Raw token must not be included in any client-side error reporting payloads (Sentry).
- `token_hash` is never returned by the API and never available to the UI.
- Token names may contain PII. Displayed only on the authenticated user's own settings page.
- Clipboard copy uses secure `navigator.clipboard.writeText` API. Graceful fallback if denied.
- No token values in URL query strings or fragments on this page.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ui.settings.tokens.page_viewed` | User navigates to `/settings/tokens` | `user_id`, `token_count`, `has_unused_tokens` (bool), `has_stale_tokens` (bool), `has_exchange_tokens` (bool) |
| `ui.settings.tokens.create_form_submitted` | User clicks "Generate token" | `user_id`, `token_name_length` (int), `scope_count` (int), `scopes` (string[]), `has_admin_scope` (bool) |
| `ui.settings.tokens.token_created` | Creation succeeds (201) | `user_id`, `token_id`, `scope_count`, `scopes`, `has_admin_scope` (bool) |
| `ui.settings.tokens.token_creation_failed` | Creation fails | `user_id`, `error_code` (int), `error_type` (string) |
| `ui.settings.tokens.token_copied` | User clicks "Copy" on reveal banner | `user_id`, `token_id` |
| `ui.settings.tokens.reveal_dismissed` | User clicks "Done" | `user_id`, `token_id`, `time_on_reveal_seconds` (float) |
| `ui.settings.tokens.revoke_initiated` | User clicks "Revoke" to open dialog | `user_id`, `token_id`, `token_name`, `token_age_days`, `was_exchange_token` (bool) |
| `ui.settings.tokens.revoke_confirmed` | User clicks "Revoke token" in dialog | `user_id`, `token_id`, `was_exchange_token` (bool) |
| `ui.settings.tokens.revoke_cancelled` | User cancels dialog | `user_id`, `token_id` |
| `ui.settings.tokens.token_revoked` | Revocation succeeds (204) | `user_id`, `token_id`, `token_age_days`, `was_exchange_token` (bool), `user_remaining_token_count` |
| `ui.settings.tokens.revoke_failed` | Revocation fails | `user_id`, `token_id`, `error_code` (int) |
| `ui.settings.tokens.empty_state_cta_clicked` | User clicks "Generate new token" in empty state | `user_id` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Page engagement rate** | % of active web users visiting `/settings/tokens` per month | Tracked |
| **Create form completion rate** | % of form submissions resulting in successful creation | > 90% |
| **Token copy rate** | % of creations followed by a copy action | > 95% |
| **Reveal-to-dismiss time** | Median `time_on_reveal_seconds` | 5–30 seconds |
| **List-to-revoke conversion** | % of page views followed by a confirmed revocation | > 0 |
| **Revoke confirmation rate** | % of revoke_initiated where user confirms vs cancels | 60–80% |
| **Stale token visibility** | % of page views where `has_stale_tokens = true` | Tracked |
| **Exchange token management** | % of revocations where `was_exchange_token = true` | Tracked |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Client-side API call to list tokens | `debug` | `request_id`, `status_code`, `latency_ms`, `token_count` | API client layer; for client perf debugging |
| Client-side API call to create token | `debug` | `request_id`, `status_code`, `latency_ms` | Do NOT log raw token or request body |
| Client-side API call to revoke token | `debug` | `request_id`, `token_id`, `status_code`, `latency_ms` | Token ID is safe to log |
| Clipboard copy failed | `warn` | `error_message` | Browser denied clipboard access |
| Unhandled error rendering tokens page | `error` | `error_message`, `component_name`, `stack_trace` | Error boundary triggered; must NOT include token values |

Server-side logging for the three API endpoints is specified in `AUTH_PERSONAL_ACCESS_TOKEN_LIST.md`, `AUTH_PERSONAL_ACCESS_TOKEN_CREATE.md`, and `AUTH_PERSONAL_ACCESS_TOKEN_REVOKE.md`.

### Prometheus Metrics

**Server-side (defined in sibling specs, critical for UI health):**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_token_list_requests_total` | Counter | `status` (200/401/403/429/500) | Token list API requests — corresponds to page loads |
| `codeplane_user_token_list_duration_seconds` | Histogram | `status` | List latency — impacts page load time |
| `codeplane_user_token_create_requests_total` | Counter | `status` (201/400/401/403/429/500) | Creation requests from form |
| `codeplane_user_token_create_duration_seconds` | Histogram | `status` | Creation latency — form responsiveness |
| `codeplane_user_token_revoke_requests_total` | Counter | `status` (204/400/401/403/404/429/500) | Revocation requests from dialog |
| `codeplane_user_token_revoke_duration_seconds` | Histogram | `status` | Revocation latency |
| `codeplane_user_token_list_count` | Histogram | — | Token count distribution per list response |
| `codeplane_user_tokens_active` | Gauge | — | System-wide active token count |

**Client-side:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_ui_settings_tokens_page_load_seconds` | Histogram | — | Time from navigation to fully rendered token list |
| `codeplane_ui_settings_tokens_clipboard_copy_total` | Counter | `result` (success/failed) | Clipboard copy attempts and outcomes |

### Alerts

#### Alert: Token List Page Load Degradation
- **Condition**: `histogram_quantile(0.95, rate(codeplane_user_token_list_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. `/settings/tokens` page loading slowly due to slow token list API.
  2. Check database query performance for `SELECT ... FROM access_tokens WHERE user_id = $1 ORDER BY created_at DESC`.
  3. Verify `access_tokens(user_id)` index is healthy.
  4. Check for users with unusually large token counts (> 500).
  5. Check overall database load — CPU, connections, IO.
  6. Consider per-user token count limit if isolated to specific users.

#### Alert: Token Creation Error Spike from Web UI
- **Condition**: `rate(codeplane_user_token_create_requests_total{status="500"}[5m]) > 1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Users clicking "Generate token" see errors.
  2. Check server error logs for `POST /api/user/tokens` — database write failures.
  3. Verify database write health: connection pool, disk space, lock contention.
  4. Check `crypto.randomBytes` for OS entropy pool exhaustion.
  5. Check for recent deployment regression in `createToken` service method.
  6. If intermittent, check transient database connectivity.

#### Alert: Elevated Token Revocation Failures
- **Condition**: `rate(codeplane_user_token_revoke_requests_total{status="500"}[5m]) > 1` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Users clicking "Revoke token" see errors in the confirmation dialog.
  2. Check server error logs for `DELETE /api/user/tokens/:id`.
  3. Verify database health and `access_tokens` table integrity.
  4. Check for table-level locks preventing deletes.
  5. If isolated, check for concurrent operations on the same row.

#### Alert: Clipboard API Failure Rate
- **Condition**: Client metric `clipboard_copy_total{result="failed"} / total > 0.1` sustained for 1 hour.
- **Severity**: Informational
- **Runbook**:
  1. >10% of copy clicks failing — users may not be copying tokens.
  2. Check browser/OS correlation via user-agent analytics.
  3. Verify page served over HTTPS (Clipboard API requires secure context).
  4. Check for browser updates changing clipboard permission behavior.
  5. Ensure fallback (selectable read-only input) is functional.
  6. No server-side action required.

### Error Cases and Failure Modes

| Failure Mode | User Impact | Behavior |
|-------------|-------------|----------|
| Token list API returns `500` | Cannot see tokens | Error banner with retry button |
| Token list API returns `401` | Session expired | Redirect to login page |
| Token creation API returns `400` | Validation failure | Error banner in form with specific message |
| Token creation API returns `403` | Insufficient privileges | Error banner with permission error |
| Token creation API returns `500` | Server failure | Error banner: "Failed to create token. Please try again." |
| Clipboard copy fails | User may not copy token | Warning toast; raw token remains in selectable input |
| Token revocation API returns `404` | Already revoked elsewhere | Dialog closes, token removed, toast: "Token was already revoked." |
| Token revocation API returns `500` | Server failure | Dialog stays open with inline error |
| Network timeout | Loading state hangs | After 10s, show error with retry |
| Browser tab loses focus during reveal | May forget to copy | Banner remains until explicitly dismissed |
| JS error in component | Page fails to render | Error boundary with "Something went wrong" + reload button |

## Verification

### Playwright (Web UI) E2E Tests — Page Load and Navigation

- [ ] **Navigate to Settings → Tokens**: Authenticated user navigates to `/settings/tokens` → page loads with settings sidebar and token content.
- [ ] **Settings sidebar shows correct items**: Sidebar includes Profile, Emails, SSH Keys, Tokens, Sessions, Connected Accounts, Notifications, OAuth Applications. "Tokens" highlighted.
- [ ] **Page title is correct**: Heading reads "Personal Access Tokens".
- [ ] **Page subtitle is present**: Subtitle describes what tokens are used for.
- [ ] **Unauthenticated user redirected**: Visit `/settings/tokens` without auth → redirected to `/login`.
- [ ] **Direct URL access works**: Typing `/settings/tokens` directly loads correctly.

### Playwright (Web UI) E2E Tests — Token Creation Form

- [ ] **Form visible on page load**: Name input, scope checkboxes, and button visible.
- [ ] **Generate button disabled initially**: Empty name + no scopes → disabled.
- [ ] **Button disabled with name but no scopes**: Name filled, no scopes → disabled.
- [ ] **Button disabled with scopes but no name**: Scope selected, no name → disabled.
- [ ] **Button enabled with name and scope**: Both provided → enabled.
- [ ] **Scope checkboxes organized by category**: Repository, Organization, User grouped.
- [ ] **Admin scopes hidden for non-admin**: Not in DOM for non-admin users.
- [ ] **Admin scopes visible for admin**: Visible and functional for admin users.
- [ ] **Each scope has a description**: Label with description text visible.
- [ ] **Name input has maxlength 255**: `maxlength="255"` attribute present.
- [ ] **Name input placeholder text**: Shows placeholder.
- [ ] **Client validation — empty name**: Inline error "Token name is required".
- [ ] **Client validation — whitespace-only name**: Treated as empty.

### Playwright (Web UI) E2E Tests — Token Creation Success

- [ ] **Successful creation shows reveal banner**: Fill form, submit → banner appears with raw token.
- [ ] **Reveal banner token format**: Matches `codeplane_[0-9a-f]{40}`.
- [ ] **Token field is monospace**: Monospace font family.
- [ ] **Copy button present**: Visible adjacent to token field.
- [ ] **Copy button works**: Click → clipboard contains token, button shows "Copied!".
- [ ] **Warning message present**: "Make sure to copy..." text visible.
- [ ] **Dismiss button present**: "Done" button visible.
- [ ] **Dismiss hides banner**: Click "Done" → banner disappears, form resets.
- [ ] **Token list updates**: After dismiss, new token at top of list.
- [ ] **New token at top**: Newest first ordering verified.
- [ ] **No page reload**: URL unchanged, DOM updated in-place.
- [ ] **Form cleared**: Name empty, checkboxes unchecked after dismiss.
- [ ] **Token shown only once**: Navigate away and return → raw token not visible.

### Playwright (Web UI) E2E Tests — Creation Edge Cases

- [ ] **Unicode name**: Emoji/CJK name → creation succeeds, displays correctly.
- [ ] **Maximum length name (255 chars)**: Succeeds; truncated in list, full in tooltip.
- [ ] **Multiple scopes**: Three scopes selected → all shown as badges.
- [ ] **Duplicate names**: Two "CI" tokens → both in list with different identifiers.
- [ ] **Loading state on button**: Spinner visible during API call.
- [ ] **Network error**: Error banner: "Failed to create token. Please try again."
- [ ] **Create then verify list**: Created token's metadata matches in the list.

### Playwright (Web UI) E2E Tests — Token List Display

- [ ] **Correct columns**: Name, Identifier, Scopes, Last Used, Created, Actions.
- [ ] **Identifier is monospace**: `token_last_eight` in monospace.
- [ ] **Scopes as badges**: Each scope a distinct visual badge.
- [ ] **"Never" for unused**: Unused token shows "Never".
- [ ] **Relative time for used**: Used token shows relative time.
- [ ] **Created relative time**: Not absolute timestamp.
- [ ] **Long name truncated**: 100-char name truncated with ellipsis.
- [ ] **Tooltip on hover**: Full name shown on hover.
- [ ] **Exchange tokens appear**: `"codeplane-cli"` tokens visible.
- [ ] **Multiple exchange tokens**: All shown with distinct identifiers.
- [ ] **Newest first ordering**: C, B, A after creating A, B, C.
- [ ] **Many tokens render**: 25 tokens all visible.
- [ ] **No raw token in list**: No `codeplane_` prefixed string in DOM.

### Playwright (Web UI) E2E Tests — States

- [ ] **Empty state**: Zero tokens → message + CTA visible.
- [ ] **Empty state CTA**: Clicking focuses creation form.
- [ ] **Loading state**: Skeleton rows while API loads.
- [ ] **Error state**: API 500 → error banner with retry.
- [ ] **Retry works**: Retry loads the list on success.

### Playwright (Web UI) E2E Tests — Revocation

- [ ] **Revoke button per row**: Each row has "Revoke".
- [ ] **Destructive styling**: Red text/outline.
- [ ] **Opens dialog**: Click "Revoke" → modal appears.
- [ ] **Dialog title correct**: "Revoke personal access token".
- [ ] **Dialog shows token name**: Name visible in body.
- [ ] **Permanence warning**: Warning text present.
- [ ] **Cancel/Revoke buttons**: Both present.
- [ ] **Revoke button red**: Destructive styling.
- [ ] **Cancel closes dialog**: Token still in list.
- [ ] **Escape closes dialog**: Token still in list.
- [ ] **Backdrop closes dialog**: Token still in list.
- [ ] **Confirm revokes**: Dialog closes, token removed.
- [ ] **Success toast**: "Token revoked successfully." appears.
- [ ] **Toast auto-dismisses**: Gone after ~5 seconds.
- [ ] **No page reload**: URL unchanged.
- [ ] **Loading state in dialog**: Spinner on button, both disabled.
- [ ] **Error state in dialog**: API 500 → inline error, dialog stays.
- [ ] **Revoke all shows empty state**: Last token revoked → empty state.
- [ ] **Revoke one of multiple**: Others remain in order.
- [ ] **Long name in dialog**: 255-char name shown in full.
- [ ] **Double-click prevention**: Only one DELETE sent.

### Playwright (Web UI) E2E Tests — Full Lifecycle

- [ ] **Create-list-revoke round-trip**: Create → appears → revoke → disappears.
- [ ] **Create multiple, revoke one**: A, B, C → revoke B → A, C remain.
- [ ] **Create, navigate away, return**: Raw token gone, list entry remains.
- [ ] **Create via UI, verify via API**: API response matches UI data.
- [ ] **Revoke via UI, verify via API**: API shows token absent.
- [ ] **Revoke via UI, verify token invalidated**: Raw token returns 401.

### Security-Focused Tests

- [ ] **No raw token in list DOM**: No `codeplane_[0-9a-f]{40}` in DOM after load.
- [ ] **No token hash in page**: No 64-char hex string.
- [ ] **Reveal token is readonly**: `readonly` attribute on input.
- [ ] **Cross-user isolation**: User B sees none of User A's tokens.
- [ ] **API response no raw token**: Network response has no `codeplane_` match.
- [ ] **API response no hash**: No 64-char hex in response.
- [ ] **Revocation response empty**: DELETE response body is empty.
- [ ] **No token in localStorage**: No `codeplane_` strings in storage.
- [ ] **No token in error reporting**: Sentry payloads contain no token.

### API Integration Tests (supporting the UI)

- [ ] **List shape**: `GET /api/user/tokens` → each item has `id`, `name`, `token_last_eight`, `scopes`, `last_used_at`, `created_at`.
- [ ] **Create shape**: `POST /api/user/tokens` → `201` with `id`, `name`, `token`, `token_last_eight`, `scopes`, `created_at`.
- [ ] **Create — empty name rejected**: `400`.
- [ ] **Create — name > 255 chars rejected**: `400`.
- [ ] **Create — max name (255) accepted**: `201`.
- [ ] **Create — empty scopes rejected**: `400`.
- [ ] **Create — unknown scope rejected**: `400`.
- [ ] **Create — alias normalized**: `repo` → `write:repository`.
- [ ] **Create — duplicates deduplicated**: Single scope in response.
- [ ] **Create — privileged denied for non-admin**: `403`.
- [ ] **Create — privileged allowed for admin**: `201`.
- [ ] **Revoke — happy path**: `204`.
- [ ] **Revoke — not found**: `404`.
- [ ] **Revoke — double delete**: `204` then `404`.
- [ ] **Revoke — cross-user**: `404`.
- [ ] **Revoke — invalid ID (0)**: `400`.
- [ ] **Revoke — invalid ID (negative)**: `400`.
- [ ] **Revoke — invalid ID (non-numeric)**: `400`.
- [ ] **Created appears in list**: Token present after creation.
- [ ] **Revoked absent from list**: Token absent after revocation.
- [ ] **Token format**: Matches `/^codeplane_[0-9a-f]{40}$/`.
- [ ] **token_last_eight format**: Matches `/^[0-9a-f]{8}$/`.
- [ ] **created_at ISO 8601**: Parses as valid date.
- [ ] **last_used_at null for unused**: `null` initially.
- [ ] **last_used_at populated after use**: Non-null after API call.
- [ ] **Newest first ordering**: B before A when B created after A.
- [ ] **100 tokens no truncation**: All 100 returned.
- [ ] **Concurrent list consistency**: 10 parallel GETs return identical results.

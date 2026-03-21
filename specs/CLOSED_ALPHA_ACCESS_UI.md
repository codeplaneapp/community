# CLOSED_ALPHA_ACCESS_UI

Specification for CLOSED_ALPHA_ACCESS_UI.

## High-Level User POV

When a Codeplane instance is running in closed alpha mode, the administrator needs a single, dedicated place in the admin console to manage who can access the platform. The Closed Alpha Access UI is that place — a purpose-built admin page at `/admin/alpha` that consolidates every aspect of closed alpha access management into one unified view.

An administrator navigates to the admin console sidebar and clicks "Alpha Access." They land on a page with two clearly labeled tabs: **Whitelist** and **Waitlist**. The whitelist tab shows every identity that has been explicitly granted access — emails, usernames, and wallet addresses — along with who added each entry and when. From this same tab, the admin can add new identities directly through a simple form, or remove existing ones. The waitlist tab shows every person who has requested access through the public waitlist, organized by status (pending, approved, rejected), with the ability to filter, paginate, and approve entries.

The two tabs work together as a complete access management workflow. An admin might start on the waitlist tab, review incoming requests, approve a handful of promising applicants (which automatically whitelists their email), then switch to the whitelist tab to verify the entries landed and to directly add a partner's email that didn't come through the waitlist. The page always reflects the current state of the database — there is no caching delay, no stale data, and no need to refresh the browser.

The alpha access sidebar item includes a badge showing the number of pending waitlist entries, giving administrators a persistent visual signal that new access requests need attention without requiring them to navigate to the page.

This feature is valuable for any Codeplane deployment operating in closed alpha mode. It removes the need for administrators to manage access through CLI commands or direct API calls alone, providing a visual, navigable, and auditable interface for the entire access lifecycle — from a user requesting access, to an admin reviewing and approving, to verifying the whitelist is correct.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- An authenticated admin can navigate to `/admin/alpha` and see the Alpha Access page with two functional tabs: Whitelist and Waitlist.
- The Whitelist tab renders a live data table from `GET /api/admin/alpha/whitelist` with all specified columns, an add-entry form, and per-row remove actions.
- The Waitlist tab renders a paginated, filterable data table from `GET /api/admin/alpha/waitlist` with all specified columns and per-row approve actions for pending entries.
- Non-admin users cannot see the "Alpha Access" link in the admin sidebar and are denied access to `/admin/alpha`.
- The page handles loading, error, and empty states consistently with the admin console design language.
- The admin sidebar badge shows the count of pending waitlist entries.
- All tab switching, filtering, pagination, and mutation actions preserve expected URL state and are deep-linkable.
- All integration and E2E tests pass.

### Functional Constraints

- [ ] The Alpha Access page MUST be rendered at the route `/admin/alpha` within the admin console SolidJS route tree.
- [ ] The page MUST display two tabs labeled **"Whitelist"** and **"Waitlist"**.
- [ ] The active tab MUST be reflected in the URL as a query parameter `?tab=whitelist` or `?tab=waitlist`, defaulting to `whitelist` when omitted.
- [ ] Clicking a tab MUST update the URL without a full page reload.
- [ ] The browser back button MUST restore the previously active tab.
- [ ] The admin sidebar "Alpha Access" link MUST display a badge showing the count of pending waitlist entries.
- [ ] The sidebar badge MUST update every 60 seconds (consistent with the admin shell badge refresh interval).
- [ ] The sidebar badge MUST NOT render when the pending count is zero.

#### Whitelist Tab Constraints

- [ ] The whitelist tab MUST render a data table with columns: Identity Type, Identity Value, Added By, Added.
- [ ] Identity Type MUST display as a color-coded badge: email=blue, username=green, wallet=orange.
- [ ] Identity Value MUST use monospaced font for wallet addresses and standard font for email/username.
- [ ] Added By MUST show the admin username (linked to their profile) or "System" if `created_by` is null.
- [ ] Added MUST show relative time (e.g., "2 hours ago") with the full ISO 8601 timestamp on hover tooltip.
- [ ] The table MUST be sorted by creation date descending (most recent first), matching the API order.
- [ ] An "Add Entry" form MUST be positioned above the table containing: an identity type dropdown (`Email`, `Username`, `Wallet Address`), an identity value text input, and a primary "Add to Whitelist" button.
- [ ] The identity value input placeholder MUST change based on the selected type: `"user@example.com"` for email, `"johndoe"` for username, `"0x..."` for wallet.
- [ ] On successful add, the form MUST clear, a success toast MUST appear, and the table MUST refresh to include the new entry.
- [ ] On validation error, an inline error message MUST appear beneath the identity value input; the form MUST NOT clear.
- [ ] On upsert (duplicate add), no error MUST be shown; the entry updates in the table and a success toast appears.
- [ ] Each table row MUST have a "Remove" action button.
- [ ] Clicking "Remove" MUST open a confirmation dialog stating the identity being removed.
- [ ] On confirmed removal, the entry MUST disappear from the table, a success toast MUST appear, and the table MUST refresh.
- [ ] Empty state MUST display: "No whitelist entries yet. Add an identity to grant closed alpha access."

#### Waitlist Tab Constraints

- [ ] The waitlist tab MUST render a paginated data table with columns: Email, Note, Source, Status, Submitted, Approved By, Approved At.
- [ ] Email MUST be truncated with ellipsis at 40 characters; full email visible on hover tooltip.
- [ ] Note MUST be truncated at 80 characters with an expand-on-click affordance; HTML-escaped for XSS safety.
- [ ] Source MUST display as a monospaced badge.
- [ ] Status MUST display as a color-coded badge: pending=yellow, approved=green, rejected=red.
- [ ] A status filter dropdown MUST be present above the table with options: All, Pending, Approved, Rejected. Default: All.
- [ ] Changing the status filter MUST reset pagination to page 1.
- [ ] The status filter value MUST be reflected in the URL as `?status=<value>` and be deep-linkable.
- [ ] Pagination controls MUST appear below the table showing current page, total pages, and previous/next buttons.
- [ ] The current page and per-page MUST be reflected in URL query parameters `?page=N&per_page=N`.
- [ ] Default pagination: page 1, 50 per page. Per-page selector MUST offer options: 10, 25, 50, 100.
- [ ] Total count MUST be displayed (e.g., "Showing 1–50 of 142 entries").
- [ ] Each pending row MUST have an "Approve" action button.
- [ ] Clicking "Approve" MUST open a confirmation dialog.
- [ ] On confirmed approval, the row status badge MUST update to green "approved," the Approved By and Approved At columns MUST populate, and the "Approve" button MUST disappear from that row.
- [ ] Empty state (no filter): "No waitlist entries yet." Empty state (with filter): "No {status} entries found."

### Edge Cases

- [ ] If the admin's admin status is revoked while viewing `/admin/alpha`, the next API request MUST receive a 403 and the UI MUST redirect to `/` with a toast: "Admin access has been revoked."
- [ ] If the admin navigates directly to `/admin/alpha?tab=invalid`, the tab MUST default to `whitelist`.
- [ ] If the admin navigates to `/admin/alpha?tab=waitlist&page=999` and no data exists on that page, the table MUST show an empty state with the accurate total count.
- [ ] If the admin navigates to `/admin/alpha?tab=waitlist&page=-1`, the page MUST clamp to 1.
- [ ] If the admin navigates to `/admin/alpha?tab=waitlist&per_page=500`, the per_page MUST be capped at 100.
- [ ] If the admin navigates to `/admin/alpha?tab=waitlist&page=abc`, the page MUST default to 1.
- [ ] Modal dialogs (add entry, remove entry, approve) MUST close on Escape without submitting.
- [ ] The whitelist add form MUST suppress duplicate submissions while a request is in flight (button disabled during inflight).
- [ ] If the API returns a 500 error for either tab, the page MUST display an inline error banner with a "Retry" button — not a full-page crash.
- [ ] If the admin has two browser tabs open on `/admin/alpha` and performs a mutation in one, the other tab MUST continue to function (showing stale data until refreshed, not crashing).
- [ ] Notes containing `<script>` tags or HTML MUST render as escaped text, not executed markup.
- [ ] Adding a whitelist entry while closed alpha mode is disabled (`CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED=false`) MUST still succeed — the UI manages the whitelist independently of the enforcement toggle.

### Boundary Constraints

- [ ] The whitelist tab MUST render correctly with zero entries and with 1,000+ entries.
- [ ] The waitlist tab MUST render correctly with zero entries and with 10,000+ entries (via pagination).
- [ ] The page MUST render correctly at viewport widths from 768px (tablet) to 2560px (ultra-wide).
- [ ] Below 768px, the admin sidebar MUST collapse and the tab layout MUST remain usable.
- [ ] All timestamp columns MUST show relative time with full ISO 8601 in tooltip.
- [ ] Notes containing 1,000 characters MUST be renderable without layout breakage.
- [ ] Emails up to 254 characters MUST display correctly with truncation and tooltip.
- [ ] Wallet addresses at exactly 42 characters MUST display in full without truncation.
- [ ] The page MUST support both light and dark theme modes without custom overrides.
- [ ] The page MUST load and render within 3 seconds on a standard broadband connection.

## Design

### Web UI Design

#### Route and Layout

The Alpha Access page is mounted at `/admin/alpha` within the admin console route tree. It inherits the admin shell layout: the admin sidebar (left, 240px), breadcrumbs (`Admin > Alpha Access`), and page title ("Alpha Access") from the admin console shell.

#### Page Header

- **Title**: "Alpha Access"
- **Breadcrumbs**: `Admin > Alpha Access`
- **No primary action button** in the header — mutations are handled within tabs.

#### Tab Bar

A horizontal tab bar immediately below the page header with two tabs:

| Tab Label | URL State | Active Indicator |
|-----------|-----------|------------------|
| Whitelist | `?tab=whitelist` | Bottom border accent (primary color) |
| Waitlist | `?tab=waitlist` | Bottom border accent (primary color) |

Default active tab: Whitelist. The tab bar is keyboard-navigable with arrow keys.

#### Whitelist Tab Content

**Add Entry Form** (above the table):

- Identity Type dropdown: `Email` (default), `Username`, `Wallet Address`.
- Identity Value: text input, placeholder varies by type (`"user@example.com"` for email, `"johndoe"` for username, `"0x..."` for wallet).
- "Add to Whitelist" button: primary style, disabled during inflight.
- On success: toast "Added {value} to the whitelist", form clears, table refreshes.
- On validation error: inline error below input (e.g., "Email must contain @").

**Whitelist Entries Table**:

| Column | Description | Formatting |
|--------|-------------|------------|
| Identity Type | Badge showing type | Color-coded: email=blue, username=green, wallet=orange |
| Identity Value | The identity string | Monospaced for wallet; standard for email/username |
| Added By | Admin username or "System" | Links to admin user profile when available |
| Added | Timestamp | Relative time with full ISO 8601 on hover |

- Row hover: light highlight.
- Row action: "Remove" button (right-aligned, icon + text).
- Loading state: 5 skeleton rows.
- Error state: inline banner with "Retry" button.
- Empty state: "No whitelist entries yet. Add an identity to grant closed alpha access."

**Remove Confirmation Dialog**: Modal showing the identity value being removed. Warning text: "This identity will no longer be able to sign in under closed alpha mode." Buttons: "Cancel" and destructive-styled "Remove" (red). Closes on Escape. Focus trap within dialog.

#### Waitlist Tab Content

**Status Filter** (above the table): Dropdown with options: All (default), Pending, Approved, Rejected. Changing the filter resets page to 1 and updates URL `?status=<value>`.

**Waitlist Entries Table**:

| Column | Description | Formatting |
|--------|-------------|------------|
| Email | Submitted email | Truncated at 40 chars with ellipsis; full on hover tooltip |
| Note | User-submitted note | Truncated at 80 chars; expand-on-click; HTML-escaped |
| Source | Submission source tag | Monospaced badge (e.g., `cli`, `website`) |
| Status | Current status | Badge: pending=yellow, approved=green, rejected=red |
| Submitted | Submission timestamp | Relative time with full ISO 8601 on hover |
| Approved By | Admin who approved | Username linking to profile; "—" if not approved |
| Approved At | Approval timestamp | Relative time with tooltip; "—" if not approved |

- Row action (pending only): "Approve" button.
- Pagination bar below table (shared pagination component): Previous/Next buttons (disabled at boundaries), page indicator ("Page N of M"), per-page selector (10, 25, 50, 100), total count display ("Showing X–Y of Z entries"). URL query params update on change.
- Loading state: 5 skeleton rows. Error state: inline banner with "Retry". Empty states: contextual messages.

**Approve Confirmation Dialog**: Modal confirming the email address to approve. Text: "This will add their email to the whitelist, allowing them to sign in." Buttons: "Cancel" and primary "Approve". Closes on Escape. Loading spinner on submit button during inflight.

#### Admin Sidebar Badge

The "Alpha Access" item in the admin sidebar shows a yellow numeric badge with the count of pending waitlist entries. Fetched via the waitlist count API (with `status=pending`) on admin shell mount and refreshed every 60 seconds. Badge hidden when count is 0. Format: plain number (e.g., "5").

### API Shape

This feature is a UI composition layer that consumes existing API endpoints — no new endpoints are introduced:

| Endpoint | Purpose | Backing Spec |
|----------|---------|------|
| `GET /api/admin/alpha/whitelist` | List whitelist entries | CLOSED_ALPHA_WHITELIST_LIST |
| `POST /api/admin/alpha/whitelist` | Add whitelist entry | CLOSED_ALPHA_WHITELIST_ADD |
| `DELETE /api/admin/alpha/whitelist/:type/:value` | Remove whitelist entry | (pending spec — CLOSED_ALPHA_WHITELIST_REMOVE) |
| `GET /api/admin/alpha/waitlist` | List waitlist entries (paginated, filtered) | CLOSED_ALPHA_WAITLIST_LIST |
| `POST /api/admin/alpha/waitlist/approve` | Approve waitlist entry | CLOSED_ALPHA_WAITLIST_APPROVE |

### SDK Shape

No new SDK functions are required. The UI consumes the API client from `@codeplane/ui-core` which wraps the admin API endpoints.

### CLI Command

No new CLI commands are introduced. The CLI equivalents for whitelist and waitlist management are covered by their respective feature specs.

### TUI UI

No TUI surface is specified for this feature. The TUI delegates admin operations to the CLI.

### Documentation

The following end-user documentation MUST be written:

1. **Admin Guide — Alpha Access Management**: A walkthrough of the `/admin/alpha` page covering both tabs. Includes: how to navigate from the sidebar; what the pending badge means; how to add/remove whitelist entries (email, username, wallet) with identity type badges and color coding; how to filter/paginate/approve waitlist entries; how whitelist and waitlist relate (approving auto-whitelists, direct adds bypass waitlist); common workflows ("Review and approve new requests," "Directly invite a user," "Audit who has access").

2. **Admin Guide — Closed Alpha FAQ**: Answers to common questions: What happens when adding a whitelist entry while closed alpha is disabled? (Saved for later enablement.) Can a user be on both waitlist and whitelist? (Yes — waitlist tracks requests, whitelist controls access.) What happens when removing a whitelisted identity? (Can't create new sessions, existing sessions remain valid.) How quickly do changes take effect? (Immediately, on next sign-in attempt.)

## Permissions & Security

### Authorization Roles

| Caller | Access to `/admin/alpha` |
|--------|---------------------------|
| Anonymous (no auth) | Redirect to `/login?redirect=/admin/alpha` |
| Authenticated non-admin user | Silent redirect to `/` |
| Authenticated admin user | Full access — both tabs, all read and mutation actions |
| PAT-based admin (API-only) | N/A — this is a web UI feature; PAT-based access applies to the underlying APIs |

### Enforcement

- The admin console shell route guard checks `isAdmin === true` before rendering any `/admin/*` route.
- Every API call made by the UI includes the admin session cookie.
- If any API call returns `401` or `403`, the UI MUST redirect to `/` with a toast indicating access was revoked.
- The "Alpha Access" link in the admin sidebar MUST NOT be rendered for non-admin users.
- There is no delegation mechanism — only users with `isAdmin=true` can access this page.

### Rate Limiting

- No additional rate limiting is introduced at the UI layer. The underlying API endpoints enforce their own rate limits (platform default: 60 requests per minute per authenticated admin for admin endpoints).
- The sidebar badge refresh (every 60 seconds) is a single lightweight API call and should not contribute meaningfully to rate limit consumption.
- If an admin triggers rapid mutations (e.g., removing many entries quickly), the API's per-endpoint rate limits protect against abuse.

### Data Privacy

- **PII displayed**: The page shows email addresses, usernames, wallet addresses, and user-submitted notes. All are PII.
- **Visibility scope**: All PII is visible only to authenticated admin users. The page MUST NOT be cached by CDNs or shared caches. Response headers: `Cache-Control: no-store, private`.
- **XSS prevention**: User-submitted notes MUST be HTML-escaped before rendering. Notes MUST NOT be rendered as raw HTML or within `innerHTML` assignments.
- **URL exposure**: PII MUST NOT appear in URL query parameters. Pagination and filter state use `page`, `per_page`, `status`, and `tab` — never email or identity values.
- **Clipboard**: No automatic clipboard or analytics exfiltration of PII. Admins may manually copy values for operational use.
- **Audit trail**: All mutations (add, remove, approve) record the admin's user ID server-side via `created_by` and `approved_by` fields.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `AlphaAccessPageViewed` | Admin navigates to `/admin/alpha` | `admin_user_id`, `initial_tab`, `pending_waitlist_count` |
| `AlphaAccessTabSwitched` | Admin switches between Whitelist and Waitlist tabs | `admin_user_id`, `from_tab`, `to_tab` |
| `WhitelistEntryAddedViaUI` | Admin successfully adds a whitelist entry through the UI form | `admin_user_id`, `identity_type`, `is_upsert` |
| `WhitelistEntryRemovedViaUI` | Admin successfully removes a whitelist entry through the UI | `admin_user_id`, `identity_type` |
| `WaitlistEntryApprovedViaUI` | Admin successfully approves a waitlist entry through the UI | `admin_user_id`, `wait_duration_hours` |
| `WaitlistFilterChanged` | Admin changes the status filter on the waitlist tab | `admin_user_id`, `filter_value` |
| `AlphaAccessErrorEncountered` | An API error prevents a mutation or data load from completing | `admin_user_id`, `tab`, `error_status`, `endpoint` |

### Properties Detail

- `admin_user_id`: The authenticated admin's user ID. Essential for audit and engagement tracking.
- `initial_tab`: Which tab was active on first page load (`whitelist` or `waitlist`). Indicates default usage pattern.
- `pending_waitlist_count`: The number of pending entries at page load time. Indicates urgency and backlog size.
- `from_tab` / `to_tab`: Tab navigation direction. Tracks workflow patterns between management modes.
- `identity_type`: `email`, `username`, or `wallet`. Indicates which auth methods are dominant.
- `is_upsert`: Whether the add was a fresh insert or an update of an existing identity. High upsert rate may signal UX confusion.
- `wait_duration_hours`: Hours from waitlist entry `created_at` to approval time. Key conversion and responsiveness metric.
- `filter_value`: The selected status filter (`all`, `pending`, `approved`, `rejected`). Indicates triage vs. audit behavior.
- `error_status`: The HTTP status code of the failed API call. For debugging and correlation.
- `endpoint`: Which API endpoint failed. For debugging and identifying systemic issues.

### Funnel Metrics & Success Indicators

- **Page Visit Frequency**: Daily/weekly unique admin visits to `/admin/alpha`. Increasing frequency during onboarding waves is healthy. Zero visits for 7+ days while `pending_waitlist_count > 0` is a concern indicating waitlist neglect.
- **Tab Distribution**: Percentage of sessions visiting whitelist tab vs. waitlist tab. Helps determine which management mode (direct invite vs. request triage) is primary.
- **Add-to-Visit Ratio**: Ratio of `WhitelistEntryAddedViaUI` to `AlphaAccessPageViewed`. Higher ratio means admins are efficiently adding entries per visit.
- **Approve-to-Visit Ratio**: Ratio of `WaitlistEntryApprovedViaUI` to waitlist tab views. Indicates triage efficiency.
- **Average Wait Duration on Approval**: Mean `wait_duration_hours` from `WaitlistEntryApprovedViaUI`. Shorter is better — long waits may indicate neglect or communication gaps.
- **Error Rate**: Ratio of `AlphaAccessErrorEncountered` to total page views. Should be < 1%.
- **Filter Usage Distribution**: Distribution of `WaitlistFilterChanged` values. Predominantly "pending" suggests triage workflows. Broad distribution suggests auditing behavior.

## Observability

### Logging Requirements

Since this is a UI feature, logging is split between the browser (client-side observability) and the server (API-side logging, covered by individual endpoint specs).

**Client-Side Logging (structured, shipped to observability backend):**

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Alpha access page loaded | `info` | `admin_user_id`, `tab`, `pending_count` |
| Whitelist entry added via UI | `info` | `admin_user_id`, `identity_type`, `is_upsert` |
| Whitelist entry removed via UI | `info` | `admin_user_id`, `identity_type` |
| Waitlist entry approved via UI | `info` | `admin_user_id`, `wait_duration_hours` |
| API call failed on alpha access page | `error` | `admin_user_id`, `endpoint`, `status`, `error_message`, `request_id` |
| Tab switch | `debug` | `admin_user_id`, `from_tab`, `to_tab` |
| Filter changed | `debug` | `admin_user_id`, `filter_value` |
| Pagination changed | `debug` | `admin_user_id`, `page`, `per_page` |

**Log redaction rules**: Identity values (emails, usernames, wallet addresses) MUST NOT appear in client-side logs. Log the `identity_type` and a truncated SHA-256 hash of the value if correlation is needed. Full identity values may appear at `debug` level in non-production environments only.

**Server-Side Logging**: Covered by the individual API endpoint specs (CLOSED_ALPHA_WHITELIST_LIST, CLOSED_ALPHA_WHITELIST_ADD, CLOSED_ALPHA_WAITLIST_LIST, CLOSED_ALPHA_WAITLIST_APPROVE). No additional server-side logging is introduced by this UI feature.

### Prometheus Metrics

**Counters:**

- `codeplane_ui_alpha_access_page_views_total` — Total page views of `/admin/alpha`.
- `codeplane_ui_alpha_access_mutations_total{action="add|remove|approve", result="success|error"}` — Total mutation actions attempted from the UI, partitioned by action type and outcome.

**Histograms:**

- `codeplane_ui_alpha_access_page_load_seconds` — Time from navigation to fully rendered page (including initial API response). Buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0.

**Gauges:**

- `codeplane_ui_alpha_access_pending_badge_count` — The pending waitlist count displayed in the sidebar badge (last observed value). Useful for tracking backlog trends without querying the DB directly.

### Alerts

#### Alert: `AlphaAccessPageLoadTimeHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_ui_alpha_access_page_load_seconds_bucket[15m])) > 3.0`
- **Severity**: Warning
- **Description**: The 95th percentile of the Alpha Access page load time exceeds 3 seconds.

**Runbook:**
1. Check the underlying API latency metrics for `codeplane_admin_whitelist_list_duration_seconds` and `codeplane_admin_waitlist_list_duration_seconds`.
2. If API latency is normal, investigate client-side rendering performance. Check if the whitelist table has grown extremely large (1,000+ entries) causing slow DOM rendering.
3. If API latency is high, follow the runbooks for the individual endpoint alerts (`WhitelistListHighLatency`, `WaitlistListHighLatency`).
4. Check network conditions between the client and server.
5. If the issue is isolated to specific admin users, investigate their browser/network conditions.

#### Alert: `AlphaAccessUIErrorRateHigh`
- **Condition**: `rate(codeplane_ui_alpha_access_mutations_total{result="error"}[15m]) / rate(codeplane_ui_alpha_access_mutations_total[15m]) > 0.1`
- **Severity**: Critical
- **Description**: More than 10% of Alpha Access UI mutations are failing.

**Runbook:**
1. Check server-side error logs for the admin alpha endpoints. Correlate with `request_id` from the client error logs.
2. Verify the `alpha_whitelist_entries` and `alpha_waitlist_entries` tables are accessible.
3. Check if the admin user's session or PAT has expired or been revoked.
4. If the errors are `403`, verify the admin's `isAdmin` flag has not been inadvertently changed.
5. If the errors are `500`, follow the database recovery runbook.
6. If the errors are `429`, the admin may be performing rapid bulk operations — advise using the CLI for batch workflows.

#### Alert: `PendingWaitlistBacklogGrowing`
- **Condition**: `codeplane_ui_alpha_access_pending_badge_count > 50 AND changes(codeplane_ui_alpha_access_page_views_total[7d]) == 0`
- **Severity**: Info
- **Description**: The pending waitlist backlog exceeds 50 and no admin has visited the Alpha Access page in 7 days.

**Runbook:**
1. This is a product health alert, not an infrastructure alert. The waitlist is accumulating without review.
2. Notify the instance operator or designated admin.
3. Check if closed alpha mode is still intentionally enabled (`CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED`). If the product has moved past closed alpha, the operator may need to disable the gate.
4. If intentionally enabled, suggest the admin review pending entries.

### Error Cases and Failure Modes

| Error Case | UI Behavior |
|------------|-------------|
| Whitelist list API returns 500 | Whitelist tab shows error banner with retry button |
| Waitlist list API returns 500 | Waitlist tab shows error banner with retry button |
| Whitelist add API returns 400 (validation) | Inline error below the identity value input |
| Whitelist add API returns 500 | Toast error: "Failed to add entry. Please try again." |
| Whitelist remove API returns 500 | Toast error: "Failed to remove entry. Please try again." Dialog remains open. |
| Waitlist approve API returns 500 | Toast error: "Failed to approve entry. Please try again." Dialog remains open. |
| Any API returns 401 | Redirect to `/login?redirect=/admin/alpha` |
| Any API returns 403 | Redirect to `/` with toast: "Admin access has been revoked." |
| Network timeout on any API call | Same as 500 behavior — error banner or toast with retry |
| JavaScript error during rendering | Error boundary catches and shows a full-tab error state with "Reload" button |
| Badge count API fails | Badge silently hides (shows no count rather than broken UI) |

## Verification

### E2E (Playwright) Tests — Page Structure and Navigation

- [ ] **Alpha access page renders**: Sign in as admin, navigate to `/admin/alpha`. Verify the page renders with "Alpha Access" as the title and breadcrumbs showing `Admin > Alpha Access`.
- [ ] **Two tabs visible**: Verify both "Whitelist" and "Waitlist" tabs are visible.
- [ ] **Default tab is whitelist**: Navigate to `/admin/alpha` (no query params). Verify the Whitelist tab is active and `?tab=whitelist` is in the URL.
- [ ] **Tab switching**: Click "Waitlist" tab. Verify it becomes active, URL updates to `?tab=waitlist`, and waitlist content is shown.
- [ ] **Tab switching back**: From waitlist tab, click "Whitelist" tab. Verify whitelist content is shown and URL updates.
- [ ] **Deep link to waitlist tab**: Navigate directly to `/admin/alpha?tab=waitlist`. Verify the Waitlist tab is active.
- [ ] **Browser back restores tab**: From whitelist, click waitlist tab, click browser back. Verify whitelist tab is restored.
- [ ] **Invalid tab defaults to whitelist**: Navigate to `/admin/alpha?tab=invalid`. Verify the Whitelist tab is active.
- [ ] **Non-admin cannot access**: Sign in as non-admin. Navigate to `/admin/alpha`. Verify redirect to `/` (admin not visible).
- [ ] **Unauthenticated redirects to login**: Navigate to `/admin/alpha` while signed out. Verify redirect to `/login?redirect=/admin/alpha`.
- [ ] **Sidebar badge — pending count**: Pre-populate waitlist with 3 pending entries via API. Navigate to admin console. Verify "Alpha Access" sidebar item shows badge "3".
- [ ] **Sidebar badge — zero count**: With zero pending entries, verify no badge is shown on the "Alpha Access" sidebar item.

### E2E (Playwright) Tests — Whitelist Tab

- [ ] **Whitelist table renders entries**: Pre-populate 3 whitelist entries (1 email, 1 username, 1 wallet) via API. Navigate to `/admin/alpha`. Verify 3 rows in the table with correct data.
- [ ] **Identity type badges have correct colors**: Verify email badge is blue, username badge is green, wallet badge is orange.
- [ ] **Wallet address uses monospaced font**: Verify the wallet identity value element has a monospaced font-family.
- [ ] **Relative timestamps**: Verify the "Added" column shows relative time. Hover over it and verify a tooltip with the full ISO 8601 timestamp appears.
- [ ] **Empty state message**: With no whitelist entries, verify the empty state message "No whitelist entries yet. Add an identity to grant closed alpha access." is displayed.
- [ ] **Add email via form**: Select "Email" from dropdown, enter `"playwright-e2e@example.com"`, click "Add to Whitelist". Verify entry appears in the table and a success toast is shown.
- [ ] **Add username via form**: Select "Username", enter `"playwright-user"`, submit. Verify entry appears.
- [ ] **Add wallet via form**: Select "Wallet Address", enter a valid 42-char hex address, submit. Verify entry appears.
- [ ] **Form clears on success**: After a successful add, verify the identity value input is empty and the type resets to default.
- [ ] **Placeholder changes with type**: Select "Email" — verify placeholder is `"user@example.com"`. Switch to "Username" — verify placeholder is `"johndoe"`. Switch to "Wallet Address" — verify placeholder is `"0x..."`.
- [ ] **Validation error — email without @**: Select "Email", enter `"notanemail"`, submit. Verify inline error appears below input and no new row is added.
- [ ] **Validation error — empty value**: Leave value empty, submit. Verify inline error appears.
- [ ] **Validation error — short wallet**: Select "Wallet Address", enter `"0x123"`, submit. Verify inline error.
- [ ] **Duplicate add (upsert) — no error**: Add the same email twice. Verify no error on second add, success toast shown, still only one row in table.
- [ ] **Button disabled during inflight**: Click "Add to Whitelist". Verify button shows loading state and is disabled until the response returns.
- [ ] **Remove entry — dialog appears**: Click "Remove" on a row. Verify confirmation dialog appears with the identity value.
- [ ] **Remove confirmation — cancel**: Click "Cancel" in the remove dialog. Verify the entry is still in the table.
- [ ] **Remove confirmation — confirm**: Click "Remove" in the dialog. Verify the entry disappears, a success toast is shown.
- [ ] **Remove dialog closes on Escape**: Open remove dialog, press Escape. Verify dialog closes without removing.
- [ ] **Loading state**: Intercept whitelist GET API call with a delay. Verify skeleton rows are shown while loading.
- [ ] **Error state**: Intercept whitelist GET API call, return 500. Verify error banner with "Retry" button is shown.
- [ ] **Error retry**: From error state, click "Retry". Intercept with success response. Verify table renders correctly.

### E2E (Playwright) Tests — Waitlist Tab

- [ ] **Waitlist table renders entries**: Pre-populate 3 waitlist entries via API. Switch to waitlist tab. Verify 3 rows with correct data.
- [ ] **Status badges have correct colors**: Verify pending=yellow, approved=green, rejected=red badges.
- [ ] **Source badges are monospaced**: Verify source column badges use monospaced font.
- [ ] **Email truncation with tooltip**: Pre-populate an entry with a 50-character email. Verify it is truncated with ellipsis. Hover to verify full email in tooltip.
- [ ] **Note truncation and expand**: Pre-populate an entry with a 200-character note. Verify truncation at ~80 chars. Click to expand and verify full note is visible.
- [ ] **Note XSS safety**: Pre-populate an entry with note `<script>alert(1)</script>`. Verify the text is rendered as escaped text, not executed.
- [ ] **Relative timestamps**: Verify "Submitted" column shows relative time with full timestamp on hover.
- [ ] **Approved By and Approved At for approved entries**: Pre-populate an approved entry. Verify "Approved By" shows the admin username and "Approved At" shows the timestamp.
- [ ] **Approved By and Approved At for pending entries**: Verify these columns show "—" for pending entries.
- [ ] **Empty state (unfiltered)**: With no waitlist entries, verify "No waitlist entries yet." is displayed.
- [ ] **Empty state (filtered)**: With entries that are all pending, filter by "Approved". Verify "No approved entries found."
- [ ] **Status filter — pending**: Pre-populate mixed statuses. Select "Pending" from filter. Verify only pending rows appear.
- [ ] **Status filter — approved**: Select "Approved". Verify only approved rows appear.
- [ ] **Status filter — all**: Select "All". Verify all entries appear.
- [ ] **Filter change resets page**: Navigate to page 2 on the waitlist. Change the status filter. Verify page resets to 1.
- [ ] **Filter reflected in URL**: Select "Pending" filter. Verify URL contains `?status=pending`.
- [ ] **Deep link with filter**: Navigate to `/admin/alpha?tab=waitlist&status=approved`. Verify the filter shows "Approved" and only approved entries are displayed.
- [ ] **Pagination — controls visible**: Pre-populate 60 entries. Verify pagination controls are visible below the table.
- [ ] **Pagination — page 1 default**: Verify first page shows 50 entries (default per_page).
- [ ] **Pagination — next page**: Click "Next" on pagination. Verify page 2 shows remaining entries.
- [ ] **Pagination — total count displayed**: Verify "Showing 1–50 of 60 entries" (or similar) is displayed.
- [ ] **Pagination reflected in URL**: Navigate to page 2. Verify URL contains `?page=2`.
- [ ] **Deep link with pagination**: Navigate to `/admin/alpha?tab=waitlist&page=2&per_page=10`. Verify page 2 with 10 entries per page is shown.
- [ ] **Approve action — button visible on pending rows only**: Verify "Approve" button appears only on rows with pending status.
- [ ] **Approve action — confirmation dialog**: Click "Approve" on a pending row. Verify confirmation dialog appears.
- [ ] **Approve action — cancel**: Click "Cancel" in dialog. Verify row remains pending.
- [ ] **Approve action — confirm**: Click "Approve" in dialog. Verify row updates to approved status, Approved By and Approved At populate, Approve button disappears.
- [ ] **Approve dialog closes on Escape**: Open approve dialog, press Escape. Verify dialog closes.
- [ ] **Loading state**: Intercept waitlist GET call with delay. Verify skeleton rows.
- [ ] **Error state**: Intercept waitlist GET call, return 500. Verify error banner with retry.
- [ ] **Error retry**: Click retry, intercept with success. Verify table renders.

### E2E (Playwright) Tests — Boundary and Edge Cases

- [ ] **Maximum valid email in whitelist (254 chars)**: Add a 254-character email via the UI form. Verify it succeeds and the entry appears in the table, correctly truncated with tooltip.
- [ ] **Email exceeding max (255 chars) rejected**: Enter a 255-character email in the add form. Submit. Verify it is rejected with a validation error.
- [ ] **Valid wallet (42 chars)**: Add a valid 42-character wallet address. Verify success.
- [ ] **Invalid wallet (41 chars) rejected**: Enter a 41-character wallet address. Submit. Verify validation error.
- [ ] **Username at max (255 chars)**: Add a 255-character username. Verify success.
- [ ] **Username exceeding max (256 chars) rejected**: Enter a 256-character username. Submit. Verify validation error.
- [ ] **Note with 1000 characters renders without breakage**: Pre-populate a waitlist entry with a 1000-character note via API. Verify the note truncation and expand work without layout breaking.
- [ ] **Per_page clamping in URL**: Navigate to `/admin/alpha?tab=waitlist&per_page=500`. Verify the table shows at most 100 entries per page.
- [ ] **Invalid page in URL**: Navigate to `/admin/alpha?tab=waitlist&page=abc`. Verify it defaults to page 1.
- [ ] **Negative page in URL**: Navigate to `/admin/alpha?tab=waitlist&page=-1`. Verify it clamps to page 1.
- [ ] **Large whitelist (100 entries)**: Pre-populate 100 whitelist entries via API. Navigate to whitelist tab. Verify all 100 rows render correctly.
- [ ] **Responsive layout — 768px**: Resize viewport to 768px. Verify the page remains usable with collapsed sidebar.
- [ ] **Dark mode**: Enable dark mode. Navigate to `/admin/alpha`. Verify all elements are readable and styled correctly.

### Full Flow E2E Tests

- [ ] **Waitlist join → admin sees in waitlist tab → approves → entry appears in whitelist**: (1) Join waitlist via API with email `"flow-test@example.com"`. (2) Sign in as admin, navigate to `/admin/alpha?tab=waitlist`. (3) Verify the entry appears with status "pending". (4) Click "Approve", confirm. (5) Switch to whitelist tab. (6) Verify the email appears as a whitelist entry.
- [ ] **Direct whitelist add via UI → user can sign in**: (1) Sign in as admin, navigate to `/admin/alpha`. (2) Add email `"direct-add@example.com"` via the whitelist form. (3) Sign out. (4) Attempt sign-in as a user with that email (with closed alpha enabled). (5) Verify sign-in succeeds.
- [ ] **Remove whitelist entry via UI → user cannot sign in**: (1) Add email to whitelist. (2) Verify user can sign in. (3) Remove the entry via the admin UI "Remove" action. (4) Sign out the user. (5) Attempt to sign in again. (6) Verify sign-in is blocked with the closed alpha error message.
- [ ] **Cross-client consistency — add via CLI, see in UI**: (1) Add a whitelist entry via `codeplane admin alpha whitelist add --type email --value "cli-added@example.com"`. (2) Navigate to `/admin/alpha` in the browser. (3) Verify the entry appears in the whitelist table.
- [ ] **Cross-client consistency — approve via CLI, see in UI**: (1) Join waitlist via API. (2) Approve via `codeplane admin alpha waitlist approve --email <email>`. (3) Navigate to `/admin/alpha?tab=waitlist` in the browser. (4) Verify the entry shows as approved.
- [ ] **Sidebar badge updates after approval**: (1) Pre-populate 3 pending entries. (2) Navigate to admin console — verify badge shows "3". (3) Approve one entry. (4) Wait for badge refresh (or trigger manually). (5) Verify badge shows "2".

### API Integration Tests (UI-Triggered Flows)

- [ ] **Whitelist add from UI sends correct payload**: Intercept the POST request when adding via the form. Verify the request body contains `{ identity_type, identity_value }` with correct values.
- [ ] **Waitlist approve from UI sends correct payload**: Intercept the POST request when approving. Verify the request body contains the email.
- [ ] **Whitelist remove from UI sends correct DELETE request**: Intercept the DELETE request when removing. Verify the URL path contains the correct identity type and value.
- [ ] **Pagination URL params map to API query params**: Navigate to page 2 with filter. Intercept the GET request. Verify `?page=2&per_page=50&status=pending` (or equivalent) is sent to the API.

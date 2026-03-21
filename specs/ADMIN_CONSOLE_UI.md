# ADMIN_CONSOLE_UI

Specification for ADMIN_CONSOLE_UI.

## High-Level User POV

When a Codeplane administrator logs in and navigates to the admin area, they need a single, unified console that consolidates every administrative capability into one coherent, navigable experience. Today, each individual admin feature — user management, organization oversight, repository inventory, runner monitoring, system health, audit logs, alpha access control, and billing administration — exists as separate API endpoints and CLI commands. The Admin Console UI is the web-based shell that ties all of these surfaces together into a cohesive, navigable administrative workbench.

The Admin Console UI is not a single feature widget. It is the web application frame, navigation, layout, and routing infrastructure that presents the entire admin area as a first-class product surface within the Codeplane web application. It is the admin equivalent of the repository workbench: a sidebar-driven, route-aware shell that lets administrators move between admin sub-pages without losing context, that shows breadcrumbs and page titles, that surfaces the most critical status information at a glance, and that provides a consistent visual language across every admin capability.

An administrator accesses the console by clicking "Admin" in the main application sidebar, which is only visible to users with the admin role. This takes them to the Admin Overview Dashboard — a read-only summary of instance health, resource counts, recent activity, and capacity utilization. From there, the sidebar navigation within the admin area provides direct access to dedicated pages for Users, Organizations, Repositories, Runners, Workflows, System Health, Audit Logs, Alpha Access, and Billing.

Each sub-page follows a consistent design language: paginated data tables with sort and filter controls, detail views reachable by clicking row items, action dialogs for mutations (create user, delete user, grant admin, create token), and inline status indicators that use color and iconography consistently. Loading states, error states, and empty states are handled uniformly so the administrator always knows whether data is loading, unavailable, or simply absent.

The console is designed for the self-hosted administrator who may be the sole operator of a small team deployment or a platform engineer responsible for a larger organization. It must work well at the scale of 5 users and at the scale of 10,000 users. It must be accessible via keyboard navigation, respect system color preferences, and degrade gracefully when individual subsystem data is unavailable.

The admin console is a web-only surface. The CLI and TUI provide equivalent data access through their own interfaces, but the console layout, navigation, sidebar, and visual shell described in this specification apply exclusively to the SolidJS web application.

## Acceptance Criteria

### Definition of Done

The Admin Console UI is complete when: (a) an admin user can navigate to `/admin` and see the full admin shell with sidebar navigation, breadcrumbs, and overview dashboard; (b) all admin sub-pages (Users, Organizations, Repositories, Runners, Workflows, System Health, Audit Logs, Alpha Access, Billing) are routable and render data from the existing API endpoints; (c) non-admin users see no admin entry point in the sidebar and are denied access to all `/admin/*` routes with a redirect to the home page; (d) every admin page handles loading, error, and empty states consistently; and (e) the entire flow is covered by passing Playwright E2E tests.

### Functional Constraints

- [ ] The admin console shell MUST be rendered as a SolidJS route tree under `/admin/*` within the existing web application.
- [ ] The global application sidebar MUST show an "Admin" link only when the authenticated user has `isAdmin === true`.
- [ ] The "Admin" sidebar link MUST NOT be visible to non-admin users or anonymous visitors.
- [ ] Navigating to any `/admin/*` route as a non-admin user MUST redirect to `/` with no error flash (silent redirect).
- [ ] Navigating to any `/admin/*` route as an unauthenticated visitor MUST redirect to `/login` with a `?redirect=/admin/...` query parameter.
- [ ] The admin console MUST include a persistent sidebar with links to: Overview, Users, Organizations, Repositories, Runners, Workflows, System Health, Audit Logs, Alpha Access, and Billing.
- [ ] The admin sidebar MUST highlight the currently active section.
- [ ] The admin console MUST include breadcrumbs on every sub-page (e.g., Admin > Users > alice).
- [ ] The admin console MUST include a page title on every sub-page that reflects the current section name.
- [ ] The default admin route (`/admin`) MUST render the Admin Overview Dashboard.
- [ ] The admin console MUST use the existing web application shell (global header, command palette access, keyboard help) without duplicating it.
- [ ] All paginated admin list pages MUST reflect pagination state in the URL query string (`?page=N&per_page=N`) so that pages are deep-linkable and browser-back works correctly.
- [ ] All paginated admin list pages MUST display the total count returned by the `X-Total-Count` response header.
- [ ] All paginated admin list pages MUST default to page 1, 30 results per page.
- [ ] The per-page selector MUST offer options: 10, 20, 30, 50.
- [ ] All admin list tables MUST show skeleton loading rows (minimum 5 skeleton rows) while data is being fetched.
- [ ] All admin list tables MUST show an inline error banner with a "Retry" button if the API request fails.
- [ ] All admin list tables MUST show a contextual empty state message when the result set is empty (e.g., "No users found", "No runners configured").
- [ ] Admin mutation dialogs (create user, delete user, grant/revoke admin, create token) MUST be modal dialogs, not full-page navigations.
- [ ] Mutation dialogs MUST show a loading spinner on the submit button while the request is in flight.
- [ ] Mutation dialogs MUST show inline validation errors returned by the API.
- [ ] After a successful mutation, the affected list page MUST automatically re-fetch to show the updated data.
- [ ] The admin console MUST be navigable entirely by keyboard (Tab, Enter, Escape for dialogs, arrow keys for table rows).

### Edge Cases

- [ ] If the user's admin status is revoked while they are viewing the admin console, the next API request MUST receive a 401 and the UI MUST redirect the user to `/` with a toast notification: "Admin access has been revoked."
- [ ] If the admin navigates directly to `/admin/users?page=999` and the page is beyond the last page, the table MUST show an empty state with the correct total count, not an error.
- [ ] If the admin navigates to `/admin/users?page=-1`, the page parameter MUST be clamped to 1.
- [ ] If the admin navigates to `/admin/users?per_page=200`, the per_page parameter MUST be clamped to 50.
- [ ] If the admin navigates to `/admin/users?page=abc`, the page MUST default to 1.
- [ ] If a modal mutation dialog is open and the user presses Escape, the dialog MUST close without submitting.
- [ ] If a modal mutation dialog is open and the user presses the browser back button, the dialog MUST close without navigating away from the admin page.
- [ ] If the server returns a 503 for the system health endpoint, the System Health page MUST render the degraded data from the response body, not a generic error page.
- [ ] If the admin console is loaded while the server is completely down, the shell MUST render with a full-page error state and a retry button.
- [ ] If the admin has two browser tabs open on the admin Users list and deletes a user in one tab, the other tab MUST continue to function (showing stale data until refreshed, not crashing).

### Boundary Constraints

- [ ] Admin page title strings MUST NOT exceed 64 characters.
- [ ] Admin breadcrumb labels MUST NOT exceed 32 characters; longer labels MUST be truncated with an ellipsis and a full-text tooltip.
- [ ] The admin sidebar MUST render correctly at viewport widths from 768px (tablet) to 2560px (ultra-wide). Below 768px, the sidebar MUST collapse into a hamburger menu.
- [ ] All timestamp columns MUST display relative time (e.g., "2 hours ago") with the full ISO 8601 timestamp in a tooltip.
- [ ] All username, organization name, and repository name columns MUST be rendered as clickable links to the appropriate profile/detail pages.
- [ ] The admin console MUST load and render the initial page (overview dashboard) within 3 seconds on a standard broadband connection.
- [ ] All admin pages MUST support the current light and dark theme modes of the application without custom overrides.

## Design

### Web UI Design

#### Route Structure

The admin console is routed under `/admin` within the SolidJS web application. The route tree is:

| Route | Page | Backing API Endpoint |
|---|---|---|
| `/admin` | Overview Dashboard | `GET /api/admin/overview` |
| `/admin/users` | Users List | `GET /api/admin/users` |
| `/admin/orgs` | Organizations List | `GET /api/admin/orgs` |
| `/admin/repos` | Repositories List | `GET /api/admin/repos` |
| `/admin/runners` | Runners List | `GET /api/admin/runners` |
| `/admin/workflows` | Workflows (cross-repo runs) | `GET /api/admin/workflows/runs` |
| `/admin/health` | System Health | `GET /api/admin/system/health` |
| `/admin/audit-logs` | Audit Logs | `GET /api/admin/audit-logs` |
| `/admin/alpha` | Alpha Access (Whitelist/Waitlist) | `GET /api/admin/alpha/whitelist`, `GET /api/admin/alpha/waitlist` |
| `/admin/billing` | Billing Administration | `POST /api/admin/billing/credits`, `POST /api/admin/billing/grant-monthly` |

#### Shell Layout

The admin console shares the application's global layout (top header, auth context, command palette, keyboard help) but adds an admin-specific sub-layout:

- **Admin Sidebar** (left, 240px fixed width): Contains the section navigation links. Each link shows an icon and label. The currently active section is visually highlighted with a left border accent and background tint. The sidebar collapses to icon-only at viewport widths below 1024px and becomes a hamburger drawer below 768px.

- **Admin Content Area** (right, fluid width): Contains the breadcrumb trail at the top, the page title and optional action buttons below, and the page content filling the remaining space.

- **Breadcrumbs**: Format is `Admin > Section Name` for top-level pages, and `Admin > Section Name > Detail Name` for detail views. "Admin" is always a link back to `/admin`.

#### Admin Sidebar Navigation Items

| Icon | Label | Route | Badge |
|------|-------|-------|-------|
| Dashboard icon | Overview | `/admin` | — |
| Person icon | Users | `/admin/users` | Total count |
| Building icon | Organizations | `/admin/orgs` | Total count |
| Repository icon | Repositories | `/admin/repos` | Total count |
| Server icon | Runners | `/admin/runners` | Active count |
| Workflow icon | Workflows | `/admin/workflows` | Running count |
| Heart icon | System Health | `/admin/health` | Status dot (green/amber/red) |
| Scroll icon | Audit Logs | `/admin/audit-logs` | — |
| Shield icon | Alpha Access | `/admin/alpha` | Pending waitlist count |
| CreditCard icon | Billing | `/admin/billing` | — |

Badge counts on sidebar items are fetched once on admin shell mount and refreshed every 60 seconds (not on every page navigation).

#### Overview Dashboard Page (`/admin`)

- **System Health Banner**: Full-width card at the top showing the aggregate system status (Healthy / Degraded / Down) with a colored status dot. Each monitored subsystem (database, SSH, runner pool) shown as a chip with its individual status.
- **Metric Cards Row**: Four cards in a horizontal row: Total Users, Total Organizations, Total Repositories, Active Workflow Runs. Each card shows the count as a large number with a label beneath.
- **Runner Pool Summary**: Card showing total/idle/busy/draining/offline runner counts with a horizontal stacked bar chart.
- **Recent Activity Feed**: Scrollable list showing the 15 most recent audit log entries (timestamp, actor, action, target). Each entry is a single line. "View all" link navigates to `/admin/audit-logs`.
- **Billing Gauges**: (Conditional — only shown if billing is enabled) Progress bars for CI minutes, workspace compute, storage, LLM tokens showing consumed vs. included quantity.
- Auto-refreshes every 30 seconds via polling.

#### Users List Page (`/admin/users`)

- **Header**: "Users" title with total count badge and a "Create User" primary action button.
- **Table Columns**: Avatar (32px circle), Username (link to `/:username`), Display Name, Email, Role (badge: "Admin" or "User"), Status (badge: "Active" or "Disabled"), Last Login (relative time), Created (relative time).
- **Row Actions** (visible on hover or via kebab menu): "Grant Admin" / "Revoke Admin", "Create Token", "Delete User".
- **Create User Dialog**: Modal with fields: Username (required, 1–40 chars, alphanumeric + hyphens, no leading/trailing hyphens), Email (required, valid email format, max 255 chars), Display Name (optional, max 64 chars). Submit calls `POST /api/admin/users`. On success, closes dialog and refreshes list.
- **Delete User Dialog**: Confirmation modal showing the username prominently. Requires typing the username to confirm. Submit calls `DELETE /api/admin/users/:username`. Shows warning about irreversibility.
- **Grant/Revoke Admin Dialog**: Confirmation modal. Submit calls `PATCH /api/admin/users/:username/admin` with `{ is_admin: true/false }`.
- **Create Token Dialog**: Modal with fields: Token Name (required, 1–64 chars), Scopes (multi-select checkboxes). Submit calls `POST /api/admin/users/:username/tokens`. On success, shows the raw token value once with a copy button and a warning that it cannot be retrieved again.

#### Organizations List Page (`/admin/orgs`)

- **Header**: "Organizations" title with total count badge.
- **Table Columns**: Name (link to org profile), Description (truncated at 100 chars), Visibility (badge: "Public" / "Limited" / "Private"), Website, Location, Created (relative time), Updated (relative time).
- Read-only list view; no mutation actions in this page.

#### Repositories List Page (`/admin/repos`)

- **Header**: "Repositories" title with total count badge.
- **Table Columns**: Name (link to `/:owner/:repo`), Owner (link to owner profile), Visibility (badge: "Public" / "Private"), Status (badges for archived, fork, mirror, template as applicable), Stars, Open Issues, Updated (relative time).
- Read-only list view; no mutation actions in this page.

#### Runners List Page (`/admin/runners`)

- **Header**: "Runners" title with total count badge.
- **Filter Tabs**: All | Idle | Busy | Draining | Offline — each tab shows a count badge.
- **Table Columns**: ID, Name, Status (color-coded badge: green=idle, blue=busy, amber=draining, red=offline), Last Heartbeat (relative time), Metadata (JSON preview, expandable), Created (relative time).

#### System Health Page (`/admin/health`)

- **Overall Status Banner**: Large status indicator ("Healthy" / "Degraded") with colored background.
- **Component Cards**: One card per monitored subsystem (Database, SSH Server, Runner Pool, Cleanup Scheduler). Each card shows: status badge, latency (if available), error message (if degraded).
- **Manual Refresh Button**: In the header, triggers an immediate re-fetch.
- Auto-refreshes every 30 seconds.

#### Audit Logs Page (`/admin/audit-logs`)

- **Header**: "Audit Logs" title.
- **Date Filter**: Date picker for the `since` parameter. Defaults to 7 days ago.
- **Table Columns**: Timestamp (absolute + relative), Actor (link to user profile), Action (e.g., "user.create", "admin.grant"), Target Type, Target Name (link if applicable), IP Address.
- Pagination with default 50 per page, max 100.

#### Alpha Access Page (`/admin/alpha`)

- **Two-tab layout**: Whitelist | Waitlist.
- **Whitelist Tab**: Table of whitelisted entries with columns: Identity Type, Identity Value, Added At. "Add" button opens a dialog. "Remove" action on each row.
- **Waitlist Tab**: Table of waitlist entries with columns: Identity, Requested At, Status. "Approve" action button per row or bulk approve.

#### Billing Page (`/admin/billing`)

- **Credit Grant Form**: Fields for Owner Type (select: user/org), Owner ID (text input), Amount (cents, positive integer), Reason (text, required), Category (select: adjustment/promotion/refund), Idempotency Key (optional). Submit calls `POST /api/admin/billing/credits`.
- **Monthly Grant Trigger**: Button to trigger monthly credit grants via `POST /api/admin/billing/grant-monthly`. Requires confirmation dialog.

### Common UI Patterns

#### Pagination Component

All list pages share a common pagination bar:
- Previous / Next buttons (disabled at boundaries)
- Current page indicator: "Page N of M"
- Per-page selector dropdown (10, 20, 30, 50)
- Total count display: "Showing X–Y of Z"
- URL query parameters update on every pagination change

#### Table Component

All list pages share a common table component:
- Sortable column headers (click to toggle asc/desc)
- Hover highlight on rows
- Skeleton loading state (5 rows of pulsing placeholder blocks)
- Error state (inline banner with error message and Retry button)
- Empty state (centered icon, message, optional action button)

#### Modal Dialog Component

All mutation dialogs share:
- Overlay backdrop (click outside to close)
- Close button (X) in top-right corner
- Escape key to close
- Submit button with loading spinner
- Inline field validation errors
- Focus trap (Tab cycling within dialog)

### Documentation

The following end-user documentation MUST be written:

- **Admin Guide: Getting Started** — How to access the admin console, what permissions are required, and a walkthrough of the overview dashboard.
- **Admin Guide: User Management** — How to list, create, delete users, grant/revoke admin, and create tokens on behalf of users.
- **Admin Guide: System Health** — How to interpret the system health page, what each subsystem status means, and what to do when a subsystem is degraded.
- **Admin Guide: Audit Logs** — How to browse audit logs, what actions are logged, and how to use date filters.
- **Admin Guide: Runners** — How to monitor the runner pool, interpret status values, and use status filters.
- **Admin Guide: Alpha Access** — How to manage the closed-alpha whitelist and approve waitlist entries.
- **Admin Guide: Billing** — How to grant credits, trigger monthly grants, and interpret billing data.

## Permissions & Security

### Authorization Model

#### Role Requirements

| Surface | Required Role | Behavior for Insufficient Role |
|---------|---------------|-------------------------------|
| "Admin" link in global sidebar | `isAdmin === true` | Link not rendered |
| Any `/admin/*` web route | `isAdmin === true` | Redirect to `/` (if authenticated, non-admin) or `/login` (if unauthenticated) |
| All `GET /api/admin/*` endpoints | `isAdmin === true` | 401 Unauthorized |
| All `POST/PATCH/DELETE /api/admin/*` endpoints | `isAdmin === true` | 401 Unauthorized |
| PAT-based access to admin read endpoints | PAT with `read:admin` scope on an admin user | 401 if scope missing or user not admin |
| PAT-based access to admin write endpoints | PAT with `write:admin` scope on an admin user | 401 if scope missing or user not admin |
| Deploy key access to admin endpoints | N/A — always denied | 401 Unauthorized |

#### Self-Protection Rules

- An admin MUST NOT be able to revoke their own admin status through the UI. The "Revoke Admin" action MUST be disabled on the current user's row with a tooltip: "You cannot revoke your own admin status."
- An admin MUST NOT be able to delete their own account through the admin console. The "Delete" action MUST be disabled on the current user's row.
- If there is only one admin user in the system, the "Revoke Admin" action MUST be disabled on that user with a tooltip: "Cannot revoke the last admin."

#### Session and Token Security

- Admin API requests from the web UI MUST use the existing session cookie mechanism (not a separate admin token).
- Admin session cookies MUST have `HttpOnly`, `Secure` (when not localhost), and `SameSite=Lax` attributes.
- Admin console MUST NOT store any sensitive data (tokens, passwords, secrets) in browser localStorage or sessionStorage.
- The raw token value returned by the Create Token flow MUST NOT be persisted in the browser after the dialog closes.

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Global rate limit (all routes) | 120 requests | per minute per identity |
| Admin-specific rate limit (`/api/admin/*`) | 60 requests | per minute per admin user |
| Admin user creation | 10 requests | per 10 seconds per admin user |
| Admin user deletion | 5 requests | per 10 seconds per admin user |
| Admin grant/revoke admin | 10 requests | per 10 seconds per admin user |
| Admin token creation | 10 requests | per 10 seconds per admin user |
| Admin billing credit grant | 5 requests | per minute per admin user |

When a rate limit is exceeded, the API MUST return HTTP 429 with a `Retry-After` header. The UI MUST display a toast notification: "Too many requests. Please wait before trying again."

### Data Privacy

- Admin list views intentionally expose PII (email addresses, private repository names, user activity timestamps) because the admin role is authorized to see this data.
- System health error messages MUST be sanitized: no database connection strings, passwords, hostnames, file paths, environment variables, or stack traces may appear in the response or UI.
- Audit log entries MUST NOT contain request bodies, passwords, or token values — only action names, actor identifiers, and target identifiers.
- Browser network requests to admin endpoints are visible in browser dev tools; no secrets should be transmitted in query parameters (only in request bodies or headers).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `admin.console.viewed` | Admin navigates to any `/admin/*` page | `admin_id`, `admin_username`, `page` (e.g., "overview", "users", "runners"), `timestamp` |
| `admin.user.created` | Admin successfully creates a user | `admin_id`, `admin_username`, `created_username`, `created_email`, `timestamp` |
| `admin.user.deleted` | Admin successfully deletes a user | `admin_id`, `admin_username`, `deleted_username`, `timestamp` |
| `admin.user.admin_granted` | Admin grants admin role | `admin_id`, `admin_username`, `target_username`, `timestamp` |
| `admin.user.admin_revoked` | Admin revokes admin role | `admin_id`, `admin_username`, `target_username`, `timestamp` |
| `admin.user.token_created` | Admin creates a token for a user | `admin_id`, `admin_username`, `target_username`, `token_name`, `scopes`, `timestamp` |
| `admin.billing.credits_added` | Admin adds credits | `admin_id`, `admin_username`, `owner_type`, `owner_id`, `amount_cents`, `category`, `timestamp` |
| `admin.billing.monthly_grant_triggered` | Admin triggers monthly grant | `admin_id`, `admin_username`, `timestamp` |
| `admin.alpha.whitelist_added` | Admin adds to whitelist | `admin_id`, `admin_username`, `identity_type`, `identity_value`, `timestamp` |
| `admin.alpha.whitelist_removed` | Admin removes from whitelist | `admin_id`, `admin_username`, `identity_type`, `identity_value`, `timestamp` |
| `admin.alpha.waitlist_approved` | Admin approves waitlist entry | `admin_id`, `admin_username`, `approved_identity`, `timestamp` |
| `admin.console.access_denied` | Non-admin attempts to access admin route | `user_id`, `username`, `attempted_route`, `timestamp` |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|---|---|---|
| Admin Console Adoption | % of admin users who visit `/admin` at least once per week | > 80% of admin users |
| Admin Task Completion Rate | % of admin mutation dialogs opened that result in a successful submission | > 90% |
| Time to First Admin Action | Median time from first `/admin` page load to first mutation (create user, delete user, etc.) | < 60 seconds |
| Admin Console Page Load P95 | 95th percentile page load time for any admin page | < 2 seconds |
| Error Rate | % of admin API requests that return 5xx | < 0.1% |
| Admin Health Check Frequency | Average number of System Health page views per admin per week | Tracked but no threshold — used for product insight |

## Observability

### Logging Requirements

#### Structured Log Fields (all admin requests)

Every admin API request MUST produce a structured log entry with:
- `level`: `info` for success, `warn` for denied access, `error` for 5xx failures
- `request_id`: from the X-Request-ID middleware
- `admin_id`: numeric user ID of the requesting admin
- `admin_username`: username of the requesting admin
- `route`: the matched API route pattern (e.g., `GET /api/admin/users`)
- `status_code`: HTTP response status code
- `duration_ms`: request processing time in milliseconds
- `page`, `per_page`: pagination parameters (for list endpoints)

#### Mutation-Specific Log Fields

For write operations, additionally log:
- `action`: the mutation performed (e.g., `user.create`, `user.delete`, `user.admin.grant`)
- `target_username`: the user affected (for user mutations)
- `target_type` and `target_value`: for alpha whitelist/waitlist mutations

#### Log Level Guidelines

| Scenario | Level | Context |
|----------|-------|---------|
| Successful list/read | `info` | Standard fields |
| Successful mutation | `info` | Standard fields + mutation fields |
| Access denied (non-admin) | `warn` | `user_id`, `username`, `attempted_route` |
| Access denied (unauthenticated) | `warn` | `ip_address`, `attempted_route` |
| Rate limit exceeded | `warn` | `admin_id`, `route`, `retry_after_seconds` |
| Validation error (400) | `info` | Standard fields + `error_message` |
| Service error (500) | `error` | Standard fields + sanitized `error_message` (no connection strings, passwords, or stack traces) |
| Database timeout | `error` | Standard fields + `component: "database"`, `timeout_ms` |

### Prometheus Metrics

#### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_admin_requests_total` | `route`, `method`, `status` | Total admin API requests |
| `codeplane_admin_mutations_total` | `action`, `status` | Total admin write operations |
| `codeplane_admin_access_denied_total` | `reason` (`not_authenticated`, `not_admin`, `rate_limited`) | Total denied admin access attempts |
| `codeplane_admin_user_created_total` | — | Total users created via admin |
| `codeplane_admin_user_deleted_total` | — | Total users deleted via admin |

#### Histograms

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_admin_request_duration_ms` | `route`, `method` | 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000 | Admin request latency |
| `codeplane_admin_list_result_count` | `route` | 0, 1, 5, 10, 20, 30, 50 | Number of items returned by list endpoints |

#### Gauges

| Metric | Description |
|--------|-------------|
| `codeplane_instance_users_total` | Current total user count |
| `codeplane_instance_repos_total` | Current total repository count |
| `codeplane_instance_orgs_total` | Current total organization count |
| `codeplane_instance_runners_total` | Current total runner count by status |

### Alerts

#### Alert: AdminAPIHighErrorRate
- **Condition**: `rate(codeplane_admin_requests_total{status=~"5.."}[5m]) / rate(codeplane_admin_requests_total[5m]) > 0.05`
- **Severity**: critical
- **Summary**: More than 5% of admin API requests are returning 5xx errors.
- **Runbook**:
  1. Check `codeplane_admin_request_duration_ms` histogram — if p99 is elevated, the issue may be database latency or timeout.
  2. Query structured logs for `level=error AND route=~"/api/admin/*"` in the last 15 minutes to identify the failing route(s).
  3. Check `codeplane_admin_requests_total` by route label to isolate the affected endpoint.
  4. If the health endpoint itself is returning 503, check database connectivity: `SELECT 1` against the primary database.
  5. If a specific service stub is causing the error (e.g., runner listing), check whether the SDK service implementation has been wired — stubs return empty results, not errors, so a 500 indicates an unexpected exception.
  6. Restart the Codeplane server process if the issue is transient. Escalate if it persists after restart.

#### Alert: AdminAPIHighLatency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_admin_request_duration_ms_bucket[5m])) > 3000`
- **Severity**: warning
- **Summary**: Admin API p95 latency exceeds 3 seconds.
- **Runbook**:
  1. Check which route has the highest latency using the `route` label on the histogram.
  2. If the overview dashboard endpoint is slow, individual sub-queries may be timing out — check the `errors` array in the overview response.
  3. Check database connection pool utilization and slow query logs.
  4. If the issue is isolated to the audit logs endpoint, verify the `since` parameter is not requesting an extremely large time range.
  5. Check for table bloat on the audit_logs table (large installations may need index tuning).

#### Alert: AdminAccessDeniedSpike
- **Condition**: `rate(codeplane_admin_access_denied_total[5m]) > 10`
- **Severity**: warning
- **Summary**: Elevated rate of denied admin access attempts — possible privilege escalation attempt.
- **Runbook**:
  1. Query structured logs for `level=warn AND attempted_route=~"/api/admin/*"` to identify the source IP(s) and user(s).
  2. If a single user or IP is responsible for the spike, consider whether the account has been compromised.
  3. If the denied requests come from legitimate users, it may indicate a misconfigured client or a recent admin role change that the user hasn't noticed.
  4. If the spike correlates with a deployment, verify that the auth middleware is functioning correctly.

#### Alert: AdminConsoleDatabaseUnreachable
- **Condition**: `codeplane_admin_requests_total{route="GET /api/admin/system/health", status="503"} > 0` sustained for 2 minutes
- **Severity**: critical
- **Summary**: System health endpoint reports database as unreachable.
- **Runbook**:
  1. Immediately verify database connectivity from the Codeplane host: attempt a direct connection to the configured database.
  2. Check if the database process is running.
  3. Check disk space on the database host.
  4. If using PGLite (daemon mode), check if the PGLite data directory is accessible and not corrupted.
  5. If using PostgreSQL, check connection pool exhaustion, max_connections setting, and pg_stat_activity for long-running queries.
  6. Restart the database and Codeplane server if necessary.

### Error Cases and Failure Modes

| Error | HTTP Status | UI Behavior | Log Level |
|-------|-------------|-------------|----------|
| Not authenticated | 401 | Redirect to `/login` | `warn` |
| Not admin | 401 | Redirect to `/` | `warn` |
| Rate limited | 429 | Toast notification with retry timer | `warn` |
| Invalid request body | 400 | Inline validation errors in dialog | `info` |
| User not found (delete/grant) | 404 | Error toast: "User not found" | `info` |
| Duplicate username (create) | 409 | Inline field error: "Username already exists" | `info` |
| Duplicate email (create) | 409 | Inline field error: "Email already in use" | `info` |
| Database timeout | 500 | Error banner with Retry button | `error` |
| Database unreachable | 500/503 | Full-page error state | `error` |
| Service not implemented (stub) | 200 (empty) | Empty state in table | `info` |
| Unexpected server error | 500 | Error banner with Retry button | `error` |

## Verification

### API Integration Tests

#### Admin Authentication & Authorization
- [ ] `GET /api/admin/users` with a valid admin session cookie returns 200 and a JSON array.
- [ ] `GET /api/admin/users` with a valid admin PAT (scope: `read:admin`) returns 200.
- [ ] `GET /api/admin/users` with a non-admin session cookie returns 401.
- [ ] `GET /api/admin/users` with a non-admin PAT returns 401.
- [ ] `GET /api/admin/users` with no authentication returns 401.
- [ ] `GET /api/admin/users` with an expired session cookie returns 401.
- [ ] `GET /api/admin/users` with a revoked PAT returns 401.
- [ ] `POST /api/admin/users` with a PAT that has `read:admin` scope but not `write:admin` returns 401.
- [ ] `GET /api/admin/runners` with a deploy key returns 401.
- [ ] All admin endpoints (users, orgs, repos, runners, health, audit-logs, alpha/whitelist, alpha/waitlist, billing/credits, billing/grant-monthly) return 401 for non-admin users.

#### Admin User List
- [ ] `GET /api/admin/users` returns a JSON array with `X-Total-Count` header.
- [ ] `GET /api/admin/users?page=1&per_page=5` returns at most 5 items.
- [ ] `GET /api/admin/users?page=1&per_page=50` returns at most 50 items (maximum valid per_page).
- [ ] `GET /api/admin/users?per_page=100` clamps to 50 items.
- [ ] `GET /api/admin/users?per_page=-1` clamps to default (30).
- [ ] `GET /api/admin/users?page=0` treats as page 1.
- [ ] `GET /api/admin/users?page=abc` treats as page 1.
- [ ] `GET /api/admin/users?page=99999` returns an empty array with correct `X-Total-Count`.
- [ ] Each user object in the response has fields: `id`, `username`, `email`, `display_name`, `is_admin`, `created_at`.
- [ ] User objects do NOT contain `password_hash`, `session_key`, or `token_hash` fields.

#### Admin User Create
- [ ] `POST /api/admin/users` with valid `{ username, email, display_name }` returns 201 with the created user profile.
- [ ] `POST /api/admin/users` with a username that already exists returns 409.
- [ ] `POST /api/admin/users` with an email that already exists returns 409.
- [ ] `POST /api/admin/users` with an empty username returns 400.
- [ ] `POST /api/admin/users` with an empty email returns 400.
- [ ] `POST /api/admin/users` with a username containing spaces returns 400.
- [ ] `POST /api/admin/users` with a username of exactly 1 character returns 201 (minimum valid).
- [ ] `POST /api/admin/users` with a username of exactly 40 characters returns 201 (maximum valid).
- [ ] `POST /api/admin/users` with a username of 41 characters returns 400.
- [ ] `POST /api/admin/users` with a malformed JSON body returns 400.
- [ ] `POST /api/admin/users` with an empty body returns 400.
- [ ] `POST /api/admin/users` with extra unknown fields in the body succeeds (ignores unknown fields).
- [ ] `POST /api/admin/users` with an email of exactly 255 characters returns 201 (maximum valid).
- [ ] `POST /api/admin/users` with an email of 256 characters returns 400.

#### Admin User Delete
- [ ] `DELETE /api/admin/users/testuser` for an existing user returns 204.
- [ ] `DELETE /api/admin/users/nonexistent` returns 404.
- [ ] `DELETE /api/admin/users/` (empty username) returns 400.
- [ ] Admin cannot delete themselves: `DELETE /api/admin/users/<own_username>` returns 403 or 400.

#### Admin Grant/Revoke Admin
- [ ] `PATCH /api/admin/users/targetuser/admin` with `{ is_admin: true }` returns 200 with updated profile.
- [ ] `PATCH /api/admin/users/targetuser/admin` with `{ is_admin: false }` returns 200 with updated profile.
- [ ] `PATCH /api/admin/users/nonexistent/admin` returns 404.
- [ ] Admin cannot revoke their own admin status: returns 403 or 400.
- [ ] `PATCH /api/admin/users/targetuser/admin` with `{}` (missing is_admin) returns 400.
- [ ] `PATCH /api/admin/users/targetuser/admin` with `{ is_admin: "yes" }` (wrong type) returns 400.

#### Admin Token Create
- [ ] `POST /api/admin/users/targetuser/tokens` with `{ name: "test", scopes: ["read"] }` returns 201 with a `token` field.
- [ ] The `token` field starts with `codeplane_`.
- [ ] `POST /api/admin/users/nonexistent/tokens` returns 404.
- [ ] `POST /api/admin/users/targetuser/tokens` with empty name returns 400.
- [ ] `POST /api/admin/users/targetuser/tokens` with a token name of exactly 64 characters returns 201 (maximum valid).
- [ ] `POST /api/admin/users/targetuser/tokens` with a token name of 65 characters returns 400.

#### Admin Organization List
- [ ] `GET /api/admin/orgs` returns a JSON array with `X-Total-Count` header.
- [ ] `GET /api/admin/orgs?page=1&per_page=50` returns at most 50 items.
- [ ] Each org object has fields: `name`, `description`, `visibility`, `created_at`.

#### Admin Repository List
- [ ] `GET /api/admin/repos` returns a JSON array with `X-Total-Count` header.
- [ ] `GET /api/admin/repos?page=1&per_page=50` returns at most 50 items.
- [ ] Private repositories are included in the response (admin bypass).

#### Admin Runner List
- [ ] `GET /api/admin/runners` returns a JSON array with `X-Total-Count` header.
- [ ] `GET /api/admin/runners?status=idle` returns only runners with status `idle`.
- [ ] `GET /api/admin/runners?status=busy` returns only runners with status `busy`.
- [ ] `GET /api/admin/runners?status=draining` returns only runners with status `draining`.
- [ ] `GET /api/admin/runners?status=offline` returns only runners with status `offline`.
- [ ] `GET /api/admin/runners?status=invalid` returns 400.
- [ ] Each runner object has fields: `id`, `name`, `status`, `last_heartbeat_at`.

#### Admin System Health
- [ ] `GET /api/admin/system/health` returns 200 with `{ status: "ok", database: { status: "ok", latency: "<N>ms" } }` when healthy.
- [ ] The `database.latency` field matches the regex `^\d+ms$`.
- [ ] Response body is under 4 KB.

#### Admin Audit Logs
- [ ] `GET /api/admin/audit-logs?since=2024-01-01` returns 200 with a JSON array.
- [ ] `GET /api/admin/audit-logs` without `since` parameter returns 400.
- [ ] `GET /api/admin/audit-logs?since=not-a-date` returns 400.
- [ ] `GET /api/admin/audit-logs?since=2024-01-01T00:00:00Z` (RFC3339 format) returns 200.
- [ ] `GET /api/admin/audit-logs?per_page=100` returns at most 100 entries.
- [ ] `GET /api/admin/audit-logs?per_page=200` clamps to 100.

#### Admin Alpha Whitelist/Waitlist
- [ ] `GET /api/admin/alpha/whitelist` returns 200 with a JSON array.
- [ ] `POST /api/admin/alpha/whitelist` with valid body returns 201.
- [ ] `DELETE /api/admin/alpha/whitelist/email/test@example.com` returns 204.
- [ ] `GET /api/admin/alpha/waitlist` returns 200 with a JSON array.
- [ ] `POST /api/admin/alpha/waitlist/approve` with valid body returns 200.

#### Rate Limiting
- [ ] Sending 61 requests to `GET /api/admin/users` within 60 seconds returns 429 on the 61st request.
- [ ] The 429 response includes a `Retry-After` header.

### Playwright E2E Tests (Web UI)

#### Admin Console Access Control
- [ ] As a non-admin user, the global sidebar does NOT show an "Admin" link.
- [ ] As an admin user, the global sidebar shows an "Admin" link.
- [ ] As a non-admin user, navigating directly to `/admin` redirects to `/`.
- [ ] As an unauthenticated visitor, navigating to `/admin` redirects to `/login?redirect=/admin`.
- [ ] As an admin user, clicking the "Admin" sidebar link navigates to `/admin`.

#### Admin Overview Dashboard
- [ ] The overview page (`/admin`) loads and displays the system health banner.
- [ ] The overview page displays metric cards (Users, Organizations, Repositories, Active Runs).
- [ ] The overview page displays the recent activity feed.
- [ ] The overview page auto-refreshes (verify that data re-fetches after 30 seconds by checking network requests).

#### Admin Users Page
- [ ] Navigating to `/admin/users` shows the users table with at least one row (the current admin user).
- [ ] The table shows columns: Avatar, Username, Display Name, Email, Role, Status, Last Login, Created.
- [ ] The "Create User" button opens a modal dialog.
- [ ] Submitting the Create User dialog with valid data creates the user and refreshes the list.
- [ ] Submitting the Create User dialog with a duplicate username shows an inline error.
- [ ] Submitting the Create User dialog with an empty username shows a validation error.
- [ ] The Delete User action opens a confirmation dialog requiring the username to be typed.
- [ ] Confirming the Delete User dialog removes the user and refreshes the list.
- [ ] Pressing Escape on the Delete User dialog closes it without deleting.
- [ ] The Grant Admin / Revoke Admin action opens a confirmation dialog.
- [ ] Confirming the Grant Admin dialog updates the user's role badge in the table.
- [ ] The Create Token action opens a dialog, and on success displays the raw token with a copy button.
- [ ] The raw token is no longer visible after closing the Create Token dialog.

#### Admin Pagination
- [ ] The pagination bar displays "Page 1 of N" on the users page.
- [ ] Clicking "Next" updates the URL to `?page=2` and loads the next page of results.
- [ ] Clicking "Previous" on page 2 navigates back to page 1.
- [ ] Changing the per-page selector to 10 updates the URL and reduces the visible rows.
- [ ] Navigating directly to `/admin/users?page=2&per_page=10` loads the correct page.
- [ ] Using browser back/forward buttons correctly navigates between pagination states.

#### Admin Runners Page
- [ ] Navigating to `/admin/runners` shows the runners table.
- [ ] The filter tabs (All, Idle, Busy, Draining, Offline) are visible with count badges.
- [ ] Clicking a status tab filters the table to show only runners with that status.
- [ ] Runner status badges have correct colors (green=idle, blue=busy, amber=draining, red=offline).

#### Admin System Health Page
- [ ] Navigating to `/admin/health` shows the overall status banner.
- [ ] Component cards for database (and other subsystems) are visible with status badges.
- [ ] The manual refresh button triggers a new fetch (verify via network tab).

#### Admin Audit Logs Page
- [ ] Navigating to `/admin/audit-logs` shows the audit log table.
- [ ] The date picker defaults to 7 days ago.
- [ ] Changing the date picker re-fetches the audit log data.

#### Admin Navigation
- [ ] The admin sidebar highlights the correct section on each page.
- [ ] Breadcrumbs show "Admin > Users" on the users page.
- [ ] Clicking "Admin" in the breadcrumbs navigates back to `/admin`.
- [ ] All sidebar links navigate to the correct page.
- [ ] The admin sidebar collapses correctly at narrow viewport widths.

#### Admin Keyboard Navigation
- [ ] Tab key cycles through sidebar links, table rows, and pagination controls.
- [ ] Enter key activates the focused sidebar link or table row action.
- [ ] Escape key closes any open modal dialog.

#### Admin Error States
- [ ] When the API returns a 500, the table shows an error banner with a "Retry" button.
- [ ] Clicking "Retry" re-fetches the data.
- [ ] When the API returns empty results, the table shows the contextual empty state message.

#### Admin Loading States
- [ ] While data is loading, skeleton rows are visible in the table.
- [ ] While a mutation is in flight, the submit button shows a loading spinner and is disabled.

### CLI Integration Tests

- [ ] `codeplane admin user list` returns users as JSON (with `--json` flag).
- [ ] `codeplane admin user list --page 1 --limit 5` returns at most 5 users.
- [ ] `codeplane admin user create --username testcli --email testcli@example.com` returns 0 exit code.
- [ ] `codeplane admin user delete testcli` returns 0 exit code.
- [ ] `codeplane admin runner list` returns 0 exit code with JSON array.
- [ ] `codeplane admin workflow list` returns 0 exit code.
- [ ] `codeplane admin health` returns 0 exit code with health status.
- [ ] `codeplane admin user list` with a non-admin token returns non-zero exit code.
- [ ] `codeplane admin user list` with no authentication returns non-zero exit code.
- [ ] `codeplane admin runner list` with a non-admin token returns non-zero exit code.

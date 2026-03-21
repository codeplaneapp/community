# ADMIN_OVERVIEW_DASHBOARD

Specification for ADMIN_OVERVIEW_DASHBOARD.

## High-Level User POV

When a Codeplane administrator navigates to the admin area, the first thing they see is the Admin Overview Dashboard — a single, glanceable view that communicates the health, scale, and activity of their entire Codeplane instance. This dashboard answers the questions an administrator asks daily: Is the system healthy? How many users and repositories exist? Are workflows running successfully? Are there any capacity problems?

The dashboard is designed for self-hosted administrators who may be the sole operator of a small team deployment or a platform engineer responsible for a larger organization. In either case, they should not have to visit five separate admin pages, run CLI commands, or query audit logs just to understand the current state of the system.

The overview is organized into clear sections. At the top, a system health summary shows the operational status of every critical subsystem — database, SSH server, workflow runners, and workspace containers — using simple healthy/degraded/down indicators. Below that, high-level counters show the total number of users, organizations, repositories, and active workflow runs. A recent activity feed shows the latest significant events (new user registrations, repository creations, admin actions) drawn from the audit log. Usage gauges show resource consumption for billing-tracked metrics such as CI minutes, storage, and workspace compute hours. Finally, an at-a-glance capacity section shows runner pool utilization and workspace session counts.

This dashboard is accessible from the web UI admin area, from the CLI via `codeplane admin overview`, and as a dedicated TUI screen. Each surface renders the same underlying data in a format appropriate to that client. The CLI emits structured JSON suitable for scripting and monitoring integration. The TUI renders a compact dashboard screen. The web UI provides the richest visual experience with trend indicators and color-coded status signals.

The dashboard is read-only. It does not provide any mutation controls — those remain in the dedicated admin sub-pages for users, repos, runners, and settings. This separation keeps the overview fast to load and safe to leave on a monitor without risk of accidental changes.

## Acceptance Criteria

### Definition of Done

- An admin user can view the overview dashboard in the web UI, CLI, and TUI and see consistent data across all three.
- A non-admin user is denied access to the overview dashboard across all surfaces.
- The dashboard loads in under 2 seconds on a Codeplane instance with up to 10,000 users and 50,000 repositories.
- All data displayed on the dashboard is real, sourced from the existing SDK count/aggregation functions and service layer — no hardcoded or placeholder data.

### Functional Constraints

- [ ] The dashboard MUST display: total user count, total organization count, total repository count (public and private breakdowns), and total active workflow run count.
- [ ] The dashboard MUST display system health status for: database, SSH server, and runner pool.
- [ ] Each health component MUST show one of three states: `healthy`, `degraded`, or `down`.
- [ ] The dashboard MUST display a recent activity feed sourced from the audit log, showing the 15 most recent entries.
- [ ] The recent activity feed MUST display: timestamp, actor name, action, target type, and target name for each entry.
- [ ] The dashboard MUST display billing/usage summary gauges when billing is enabled, covering: CI minutes consumed, workspace compute minutes consumed, storage bytes used, and LLM tokens consumed.
- [ ] The dashboard MUST display runner pool summary: total runners, idle runners, busy runners, offline runners.
- [ ] The dashboard MUST display active workspace session count and active agent session count.
- [ ] The dashboard MUST display the count of pending waitlist entries when closed-alpha mode is active.
- [ ] The dashboard MUST auto-refresh in the web UI every 30 seconds via polling (not SSE for the overview).
- [ ] The CLI `codeplane admin overview` command MUST return all dashboard data as a single JSON object.
- [ ] The TUI dashboard screen MUST render a compact summary with health status, counters, and recent activity.

### Edge Cases

- [ ] If the database health check fails, the dashboard MUST still render with a `down` status indicator for the database component and display whatever cached or partial data is available for other sections.
- [ ] If the audit log has zero entries (fresh installation), the recent activity section MUST display an empty state message: "No activity recorded yet."
- [ ] If billing is not enabled (no billing accounts exist), the usage gauges section MUST be hidden entirely rather than showing zeroes.
- [ ] If there are zero runners configured, the runner pool section MUST display "No runners configured" instead of showing zeroes for all states.
- [ ] If the runner service or workspace service is unavailable, the affected section MUST show a "Data unavailable" indicator rather than failing the entire dashboard.
- [ ] If the instance has exactly 0 users (edge: initial setup before first admin is created), the API MUST still return valid data with count 0.

### Boundary Constraints

- [ ] The recent activity feed MUST be limited to a maximum of 50 entries per request, defaulting to 15.
- [ ] The `activity_limit` query parameter MUST accept values between 1 and 50 inclusive. Values outside this range MUST be clamped, not rejected.
- [ ] All count values MUST be returned as integers, not strings.
- [ ] The overview API response MUST complete within 5 seconds. If any subsystem query exceeds 3 seconds, it MUST be timed out and the affected section returned as `null` with an `errors` array entry.
- [ ] The auto-refresh interval MUST NOT be configurable below 10 seconds to prevent accidental self-DoS.

## Design

### API Shape

#### `GET /api/admin/overview`

**Authentication**: Required. Admin role required.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `activity_limit` | integer | `15` | Number of recent audit log entries to include (1–50) |
| `include_billing` | boolean | `true` | Whether to include billing/usage gauges |

**Response** (`200 OK`):

```json
{
  "system_health": {
    "status": "healthy",
    "components": {
      "database": { "status": "healthy", "latency_ms": 2 },
      "ssh_server": { "status": "healthy" },
      "runner_pool": { "status": "healthy" }
    }
  },
  "counts": {
    "users": 142,
    "organizations": 8,
    "repositories": 1203,
    "repositories_public": 891,
    "repositories_private": 312,
    "active_workflow_runs": 3,
    "active_workspace_sessions": 7,
    "active_agent_sessions": 2,
    "pending_waitlist": 14
  },
  "runner_pool": {
    "total": 5,
    "idle": 2,
    "busy": 2,
    "offline": 1,
    "draining": 0
  },
  "billing_usage": {
    "enabled": true,
    "period_start": "2026-03-01T00:00:00Z",
    "period_end": "2026-03-31T23:59:59Z",
    "metrics": {
      "ci_minutes": { "consumed": 4500, "included": 10000 },
      "workspace_compute_minutes": { "consumed": 120, "included": 500 },
      "storage_gb_hours": { "consumed": 340, "included": 1000 },
      "llm_tokens": { "consumed": 85000, "included": 500000 }
    }
  },
  "recent_activity": [
    {
      "id": "auditlog_abc123",
      "event_type": "user.create",
      "actor_name": "alice",
      "action": "create",
      "target_type": "user",
      "target_name": "bob",
      "created_at": "2026-03-22T10:15:00Z"
    }
  ],
  "errors": []
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication.
- `403 Forbidden`: Authenticated user is not an admin.
- `500 Internal Server Error`: Unrecoverable server failure.

**Partial Failure Model**: If individual subsystem queries fail, the response still returns `200` with the failed section set to `null` and an error descriptor appended to the `errors` array:

```json
{
  "runner_pool": null,
  "errors": [
    { "component": "runner_pool", "message": "runner service query timed out after 3000ms" }
  ]
}
```

### Web UI Design

The Admin Overview Dashboard is the default landing page when an admin navigates to `/admin` or clicks the "Admin" entry in the sidebar navigation.

**Layout**:

1. **Page Header**: Title "Admin Overview" with a "Last refreshed: X seconds ago" indicator and a manual refresh button.

2. **System Health Banner** (full width):
   - A horizontal row of health indicators, one per component (Database, SSH, Runners).
   - Each indicator shows a colored dot: green (`healthy`), yellow (`degraded`), red (`down`).
   - Clicking a component navigates to the relevant admin detail page (e.g., clicking "Runners" goes to `/admin/runners`).

3. **Counters Row** (grid of cards, 4 columns on desktop, 2 on tablet, 1 on mobile):
   - **Users** card: Total count, with a link to `/admin/users`.
   - **Organizations** card: Total count, with a link to `/admin/orgs`.
   - **Repositories** card: Total count with "N public / M private" subtitle, link to `/admin/repos`.
   - **Workflows** card: Active run count, link to `/admin/workflows`.

4. **Secondary Counters Row** (grid of cards, 3 columns):
   - **Workspaces** card: Active session count.
   - **Agents** card: Active agent session count.
   - **Waitlist** card: Pending entries count (hidden if closed-alpha is not active).

5. **Runner Pool Summary** (card with horizontal bar):
   - Stacked horizontal bar showing idle/busy/offline/draining distribution.
   - Numeric labels for each state.
   - "No runners configured" empty state when total is 0.

6. **Usage Gauges** (card, conditionally shown):
   - Four horizontal progress bars showing consumed vs. included for each billing metric.
   - Label format: "4,500 / 10,000 CI minutes".
   - Progress bars turn yellow at 75% utilization and red at 90%.
   - Hidden entirely when billing is not enabled.

7. **Recent Activity Feed** (card, bottom section):
   - Vertical timeline list of recent audit log entries.
   - Each entry shows: relative timestamp ("2 minutes ago"), actor avatar + name, action verb, target type icon + target name.
   - Empty state: "No activity recorded yet" with a subtle icon.
   - "View all audit logs" link at the bottom navigates to `/admin/audit-logs`.

**Auto-Refresh**: The page polls `GET /api/admin/overview` every 30 seconds. A countdown timer in the header shows seconds until next refresh. The manual refresh button resets the timer.

**Responsive Behavior**: On screens narrower than 768px, counter cards stack vertically and the runner bar chart switches to a vertical list layout.

### CLI Command

#### `codeplane admin overview`

**Options**:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--activity-limit` | integer | `15` | Number of recent activity entries |
| `--no-billing` | boolean | `false` | Exclude billing/usage data |

**Output** (default: formatted table):

```
System Health
  Database     healthy  (2ms)
  SSH Server   healthy
  Runner Pool  healthy

Counts
  Users           142
  Organizations     8
  Repositories   1203  (891 public, 312 private)
  Active Runs       3
  Active Sessions   7
  Agent Sessions    2

Runner Pool
  Total: 5  Idle: 2  Busy: 2  Offline: 1

Recent Activity (last 5)
  2m ago   alice   created user      bob
  15m ago  alice   deleted repo      old-project
  1h ago   system  workflow.failed   deploy-prod
```

**Output** (`--json`): Returns the raw JSON from `GET /api/admin/overview`.

### TUI UI

The TUI adds a new "Admin Overview" screen accessible from the command palette and the main navigation when the authenticated user is an admin.

**Screen Layout**:
- Top row: Three boxed sections showing health status indicators with color codes.
- Middle row: Counter summary in a compact grid format.
- Bottom half: Scrollable recent activity list showing the last 15 entries.
- Footer: Keybindings — `r` to refresh, `q` to go back, `u` to jump to Users, `o` to jump to Orgs.

### SDK Shape

A new method is added to the admin service layer:

```typescript
interface AdminOverviewData {
  systemHealth: {
    status: "healthy" | "degraded" | "down";
    components: Record<string, { status: "healthy" | "degraded" | "down"; latencyMs?: number; error?: string }>;
  };
  counts: {
    users: number;
    organizations: number;
    repositories: number;
    repositoriesPublic: number;
    repositoriesPrivate: number;
    activeWorkflowRuns: number;
    activeWorkspaceSessions: number;
    activeAgentSessions: number;
    pendingWaitlist: number;
  };
  runnerPool: {
    total: number;
    idle: number;
    busy: number;
    offline: number;
    draining: number;
  } | null;
  billingUsage: {
    enabled: boolean;
    periodStart: string;
    periodEnd: string;
    metrics: Record<string, { consumed: number; included: number }>;
  } | null;
  recentActivity: Array<{
    id: string;
    eventType: string;
    actorName: string;
    action: string;
    targetType: string;
    targetName: string;
    createdAt: string;
  }>;
  errors: Array<{ component: string; message: string }>;
}

getAdminOverview(options: { activityLimit?: number; includeBilling?: boolean }): Promise<AdminOverviewData>
```

### Documentation

The following documentation should be written:

1. **Admin Guide — Overview Dashboard section** (in `/docs/guides/administration.mdx`): Add a new section at the top of the admin guide explaining the overview dashboard, what each section means, how to interpret health indicators, and how to use the auto-refresh.

2. **CLI Reference — `admin overview` command**: Document the command, its flags, and example output in both table and JSON formats.

3. **API Reference — `GET /api/admin/overview`**: Document the endpoint, query parameters, response schema, partial failure model, and error responses.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Site Admin** (`is_admin: true`) | Full read access to the overview dashboard across all surfaces (web, CLI, TUI). |
| **Regular User** | Denied. Returns `403 Forbidden` on API, hides admin navigation in UI, omits admin screens in TUI. |
| **Anonymous / Unauthenticated** | Denied. Returns `401 Unauthorized` on API. |
| **PAT-authenticated** | Allowed only if the token has the `read:admin` scope AND the token's owner has `is_admin: true`. |
| **Deploy Key** | Denied. Deploy keys have no admin access path. |

### Rate Limiting

- The `GET /api/admin/overview` endpoint inherits the global rate limit of 120 requests per minute per identity.
- An additional per-endpoint rate limit of **10 requests per minute** per admin user is applied to prevent excessive polling. The 30-second auto-refresh interval produces 2 requests per minute under normal use, leaving ample headroom.
- CLI batch scripts calling `admin overview` in a loop MUST be rate-limited by the same per-endpoint limiter.

### Data Privacy

- The recent activity feed contains actor usernames and target names (repository names, user names). These are internal identifiers already visible to admins in other admin views. No additional PII exposure.
- The overview endpoint MUST NOT expose email addresses, IP addresses, or password hashes. The audit log entries in the overview are a subset of the full audit log: only `actor_name`, `action`, `target_type`, `target_name`, and `created_at` are included. The full audit log's `ip_address` and `metadata` fields are excluded from the overview response.
- Health check latency values MUST NOT expose internal hostnames or connection strings.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `AdminOverviewViewed` | Admin loads the overview dashboard (web, CLI, or TUI) | `surface` ("web" / "cli" / "tui"), `admin_user_id`, `instance_user_count`, `instance_repo_count` |
| `AdminOverviewRefreshed` | Admin manually refreshes (not auto-refresh) | `surface`, `admin_user_id`, `seconds_since_last_refresh` |
| `AdminOverviewAutoRefreshed` | Auto-refresh fires in web UI | `admin_user_id`, `refresh_interval_seconds` |
| `AdminOverviewPartialFailure` | One or more sections returned null due to timeout/error | `admin_user_id`, `failed_components` (string array) |
| `AdminOverviewNavigated` | Admin clicks a link from the overview to a detail page | `admin_user_id`, `destination` ("users" / "repos" / "orgs" / "runners" / "workflows" / "audit-logs") |

### Funnel Metrics

- **Adoption rate**: Percentage of admin users who view the overview dashboard at least once per week.
- **Return rate**: Percentage of admin users who view the overview dashboard more than 3 times per week (indicates habitual use).
- **Navigation-through rate**: Percentage of overview views that result in a click-through to a detail page (indicates the overview is a useful starting point, not a dead end).
- **Partial failure rate**: Percentage of overview loads that include at least one section error (indicates infrastructure reliability).
- **Time-on-page**: Median time spent on the overview before navigating away (target: < 15 seconds for a "healthy" check, > 30 seconds for investigative sessions).

## Observability

### Logging

| Log Point | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| Overview request received | `info` | `admin_user_id`, `activity_limit`, `include_billing` | Every request to `GET /api/admin/overview` |
| Component query completed | `debug` | `component`, `duration_ms`, `success` | After each subsystem query (health, counts, runners, billing, activity) |
| Component query timeout | `warn` | `component`, `timeout_ms`, `error_message` | When a subsystem query exceeds 3s timeout |
| Component query failure | `error` | `component`, `error_message`, `error_stack` | When a subsystem query fails with an unexpected error |
| Overview response sent | `info` | `admin_user_id`, `total_duration_ms`, `partial_failure` (boolean), `failed_components` | After response is sent |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_admin_overview_requests_total` | Counter | `status` (200, 401, 403, 500) | Total overview API requests |
| `codeplane_admin_overview_duration_seconds` | Histogram | — | End-to-end request duration |
| `codeplane_admin_overview_component_duration_seconds` | Histogram | `component` (database, users, repos, orgs, runners, billing, activity) | Per-component query duration |
| `codeplane_admin_overview_component_errors_total` | Counter | `component`, `error_type` (timeout, query_error, service_unavailable) | Component-level failures |
| `codeplane_admin_overview_partial_failures_total` | Counter | — | Requests with at least one component error |
| `codeplane_instance_users_total` | Gauge | — | Current total user count (updated on each overview request) |
| `codeplane_instance_repos_total` | Gauge | `visibility` (public, private) | Current total repository count |
| `codeplane_instance_orgs_total` | Gauge | — | Current total organization count |

### Alerts

#### Alert: `AdminOverviewHighLatency`
- **Condition**: `codeplane_admin_overview_duration_seconds` p99 > 4 seconds for 5 minutes.
- **Severity**: Warning.
- **Runbook**:
  1. Check `codeplane_admin_overview_component_duration_seconds` to identify which component is slow.
  2. If `database` is slow: check database connection pool saturation, run `EXPLAIN ANALYZE` on count queries, verify disk I/O.
  3. If `runners` is slow: check runner service connectivity and container runtime health.
  4. If `billing` is slow: check billing table indexes and row counts.
  5. If `activity` is slow: verify audit_log table has an index on `created_at` and consider running `deleteAuditLogsOlderThan()` to prune old entries.

#### Alert: `AdminOverviewComponentDown`
- **Condition**: `codeplane_admin_overview_component_errors_total` increases by > 5 in 5 minutes for any single component.
- **Severity**: Critical.
- **Runbook**:
  1. Identify the affected component from the `component` label.
  2. For `database`: check database process, connections, and disk space. Run `/api/health` to confirm. Restart database if needed.
  3. For `runners`: check runner pool process, network connectivity to runner hosts. Restart runner agent if needed.
  4. For `billing`: check billing service initialization. Verify billing tables exist. If billing is intentionally disabled, this alert can be silenced.
  5. Escalate if the component does not recover within 10 minutes.

#### Alert: `AdminOverviewPartialFailureRate`
- **Condition**: Rate of `codeplane_admin_overview_partial_failures_total` > 20% of `codeplane_admin_overview_requests_total` over 15 minutes.
- **Severity**: Warning.
- **Runbook**:
  1. Check which components are consistently failing via `codeplane_admin_overview_component_errors_total` labels.
  2. A single consistently failing component suggests a service outage — investigate that service.
  3. Multiple components failing intermittently suggest resource contention (CPU, memory, connection pool) — check system resource utilization.
  4. If the issue is transient and self-resolving, consider increasing the per-component timeout from 3s to 5s.

### Error Cases and Failure Modes

| Error Case | Behavior | User Impact |
|------------|----------|-------------|
| Database unreachable | Health shows `down`, count queries return `null`, errors array populated | Dashboard renders with partial data and visible error indicators |
| Runner service timeout | Runner pool section returns `null` | Runner section shows "Data unavailable" |
| Billing service not initialized | `billing_usage` returns `{ enabled: false }` | Usage gauges hidden |
| Audit log table empty | `recent_activity` returns `[]` | Empty state message shown |
| Admin user's session expired mid-refresh | Auto-refresh returns 401 | UI shows "Session expired" banner, stops auto-refresh |
| Concurrent admin overview requests | Each handled independently, no caching contention | Normal response, possible increased DB load |
| Instance with 100k+ repos | Count queries may be slow | Component timeout may fire; gauge shows "Data unavailable" for slow components |

## Verification

### API Integration Tests

- [ ] **Test: Admin overview returns 200 for admin user** — Authenticate as an admin user, call `GET /api/admin/overview`, verify 200 status and that response contains `system_health`, `counts`, `runner_pool`, `recent_activity`, and `errors` keys.
- [ ] **Test: Admin overview returns 401 for unauthenticated request** — Call `GET /api/admin/overview` without auth headers, verify 401.
- [ ] **Test: Admin overview returns 403 for non-admin user** — Authenticate as a regular user, call `GET /api/admin/overview`, verify 403.
- [ ] **Test: Admin overview returns 403 for PAT without read:admin scope** — Create a PAT for an admin user without `read:admin` scope, call endpoint, verify 403.
- [ ] **Test: Admin overview returns 200 for PAT with read:admin scope on admin user** — Create a PAT with `read:admin` scope on an admin user, call endpoint, verify 200.
- [ ] **Test: Admin overview counts are integers** — Verify that `counts.users`, `counts.organizations`, `counts.repositories`, `counts.repositories_public`, `counts.repositories_private`, `counts.active_workflow_runs`, `counts.active_workspace_sessions`, `counts.active_agent_sessions`, and `counts.pending_waitlist` are all integers (not strings).
- [ ] **Test: Admin overview system_health contains all required components** — Verify `system_health.components` contains keys `database`, `ssh_server`, and `runner_pool`, each with a valid `status` value.
- [ ] **Test: Admin overview system_health status values are valid** — Verify each component status is one of `"healthy"`, `"degraded"`, or `"down"`.
- [ ] **Test: Admin overview database health includes latency_ms** — Verify `system_health.components.database.latency_ms` is a non-negative number.
- [ ] **Test: Admin overview recent_activity respects activity_limit** — Call with `?activity_limit=3`, verify `recent_activity` has at most 3 entries.
- [ ] **Test: Admin overview activity_limit defaults to 15** — Call without `activity_limit`, verify `recent_activity` has at most 15 entries.
- [ ] **Test: Admin overview activity_limit clamps to 50** — Call with `?activity_limit=100`, verify `recent_activity` has at most 50 entries.
- [ ] **Test: Admin overview activity_limit clamps minimum to 1** — Call with `?activity_limit=0`, verify `recent_activity` has at most 1 entry (or at least 1 entry if data exists).
- [ ] **Test: Admin overview excludes billing when include_billing=false** — Call with `?include_billing=false`, verify `billing_usage` is `null` or not present.
- [ ] **Test: Admin overview recent_activity entries have correct shape** — Verify each entry contains `id`, `event_type`, `actor_name`, `action`, `target_type`, `target_name`, and `created_at` fields.
- [ ] **Test: Admin overview recent_activity excludes sensitive fields** — Verify no entry contains `ip_address` or `metadata` fields.
- [ ] **Test: Admin overview runner_pool has correct shape** — Verify `runner_pool` contains `total`, `idle`, `busy`, `offline`, and `draining` as integers.
- [ ] **Test: Admin overview runner_pool totals are consistent** — Verify `idle + busy + offline + draining == total`.
- [ ] **Test: Admin overview errors array is empty on healthy system** — On a healthy instance, verify `errors` is an empty array.
- [ ] **Test: Admin overview responds within 5 seconds** — Measure response time, verify it is under 5000ms.
- [ ] **Test: Admin overview rate limit enforced** — Send 11 requests in rapid succession from the same admin user, verify the 11th returns 429.
- [ ] **Test: Admin overview on fresh instance with zero users/repos** — On a freshly initialized instance, verify all counts are 0 or appropriate initial values and no errors.
- [ ] **Test: Admin overview billing_usage when billing not enabled** — On an instance without billing accounts, verify `billing_usage.enabled` is `false`.

### CLI E2E Tests

- [ ] **Test: `codeplane admin overview` returns valid JSON** — Run `codeplane admin overview --json`, verify output parses as valid JSON with expected top-level keys.
- [ ] **Test: `codeplane admin overview` formatted output includes health section** — Run without `--json`, verify stdout contains "System Health" and component names.
- [ ] **Test: `codeplane admin overview` formatted output includes counts section** — Verify stdout contains "Users", "Organizations", "Repositories".
- [ ] **Test: `codeplane admin overview --activity-limit 3` limits activity** — Run with `--activity-limit 3 --json`, parse JSON, verify `recent_activity` has at most 3 entries.
- [ ] **Test: `codeplane admin overview --no-billing` excludes billing** — Run with `--no-billing --json`, verify `billing_usage` is null or absent.
- [ ] **Test: `codeplane admin overview` fails for non-admin user** — Run with a non-admin token, verify non-zero exit code.
- [ ] **Test: `codeplane admin overview` fails without auth** — Run with empty token, verify non-zero exit code.
- [ ] **Test: `codeplane admin overview --json` field types are correct** — Parse JSON output, verify all count fields are numbers, all status fields are strings, `errors` is an array.

### Web UI E2E Tests (Playwright)

- [ ] **Test: Admin overview page loads for admin user** — Log in as admin, navigate to `/admin`, verify the page title "Admin Overview" is visible.
- [ ] **Test: Admin overview page shows health indicators** — Verify health status dots are visible for Database, SSH, and Runners.
- [ ] **Test: Admin overview page shows counter cards** — Verify cards for Users, Organizations, Repositories, and Workflows are visible with numeric values.
- [ ] **Test: Admin overview counter cards link to detail pages** — Click the Users card, verify navigation to `/admin/users`.
- [ ] **Test: Admin overview page shows recent activity feed** — Verify at least one activity entry is visible (after seeding test data), or the empty state message is shown.
- [ ] **Test: Admin overview page hides billing section when billing disabled** — On a non-billing instance, verify the usage gauges section is not visible.
- [ ] **Test: Admin overview page shows billing section when billing enabled** — On a billing-enabled instance, verify usage gauge progress bars are visible.
- [ ] **Test: Admin overview page auto-refreshes** — Wait 35 seconds, verify the "Last refreshed" timestamp updates.
- [ ] **Test: Admin overview manual refresh button works** — Click the refresh button, verify data reloads and timestamp updates.
- [ ] **Test: Admin overview page not accessible to non-admin user** — Log in as a regular user, navigate to `/admin`, verify redirect to a 403 or home page.
- [ ] **Test: Admin overview page not accessible to unauthenticated user** — Without logging in, navigate to `/admin`, verify redirect to login.
- [ ] **Test: Admin overview page responsive layout on mobile** — Set viewport to 375x667, verify counter cards stack vertically.
- [ ] **Test: Admin overview runner pool shows empty state when no runners** — On an instance with zero runners, verify "No runners configured" text is visible.
- [ ] **Test: Admin overview activity feed shows empty state on fresh instance** — On an instance with no audit entries, verify "No activity recorded yet" is visible.
- [ ] **Test: Admin overview "View all audit logs" link navigates correctly** — Click the link at the bottom of the activity feed, verify navigation to `/admin/audit-logs`.
- [ ] **Test: Admin overview usage gauges show warning color at 75%+** — Seed usage data at 76% of quota, verify the progress bar has a warning color class.
- [ ] **Test: Admin overview usage gauges show danger color at 90%+** — Seed usage data at 91% of quota, verify the progress bar has a danger color class.

### TUI E2E Tests

- [ ] **Test: TUI admin overview screen renders for admin user** — Launch TUI as admin, navigate to admin overview, verify health indicators and counter rows render.
- [ ] **Test: TUI admin overview screen refresh keybinding works** — Press `r`, verify data refreshes.
- [ ] **Test: TUI admin overview screen is not available to non-admin user** — Launch TUI as regular user, verify admin overview is not in navigation.

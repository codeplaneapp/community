# LANDING_CHECKS_VIEW

Specification for LANDING_CHECKS_VIEW.

## High-Level User POV

When a developer opens a landing request in Codeplane, they need to quickly understand whether the automated checks — CI builds, security scans, linting, test suites — have passed for every change in the stack before landing. Today, checks information is available through the CLI (`codeplane land checks <number>`), but there is no dedicated visual surface in the web UI or TUI to inspect check status in context.

The Landing Checks View introduces a **Checks tab** on the landing request detail page across the web UI, TUI, and existing CLI. When a user navigates to a landing request and opens the Checks tab, they see a grouped, scannable summary of every automated check that has reported status against the changes in that landing request. Checks are grouped by change in the stack so the user can immediately identify which specific change introduced a failure. A summary bar at the top gives an at-a-glance health indicator: all passing, some pending, or failures present.

For repositories that enforce required checks through protected bookmark rules, the Checks tab makes it unmistakably clear which checks are required, which are satisfied, and which are missing or failing. If a required check has not yet reported any status at all, the view shows it as an explicit "missing" entry so the user never has to wonder whether a check was skipped or simply hasn't run. This removes the guesswork from the "why can't I land this?" question.

The Checks tab is read-only — users inspect and refresh check status, but creating or modifying checks is the responsibility of external CI integrations that report status through the commit status API. The view supports manual refresh so users can re-fetch the latest statuses without reloading the entire page. For large stacked landings with many changes, statuses are loaded lazily and progressively so the interface remains responsive.

This feature is designed to close the feedback loop between writing code, running automation, and landing changes. A developer should be able to look at one screen and answer: "Is my landing request ready to land, and if not, exactly which check on which change is blocking me?"

## Acceptance Criteria

### Definition of Done

- [ ] A "Checks" tab is visible and functional on the landing request detail page in the web UI
- [ ] A "Checks" tab (tab position 6) is visible and functional on the landing request detail screen in the TUI
- [ ] The CLI `codeplane land checks <number>` command returns accurate, formatted check data
- [ ] All three clients consume the same underlying `GET /api/repos/:owner/:repo/commits/:ref/statuses` endpoint
- [ ] The commit statuses API endpoint returns real data (no longer 501)
- [ ] Required check contexts from protected bookmark configuration are visually distinguished from optional checks
- [ ] Missing required checks (no status reported) are surfaced as explicit "missing" entries
- [ ] The feature is gated behind the `LANDING_CHECKS_VIEW` feature flag
- [ ] Documentation is published covering the Checks tab in web UI, TUI, and CLI usage

### Functional Constraints

- [ ] Checks are grouped by change ID, preserving the stack order from the landing request's `change_ids` array
- [ ] Within each change group, checks are sorted alphabetically by `context` string
- [ ] The summary bar displays one of four aggregate states: all passed, some pending (no failures), some failed/errored, or no checks found
- [ ] Required checks summary shows count of satisfied, failing, and missing required contexts
- [ ] The Checks tab content is lazy-loaded only when the tab is activated, not when the landing detail page first loads
- [ ] Manual refresh re-fetches all check statuses; refresh is debounced to a minimum 2-second interval
- [ ] For landing requests with 10 or more changes, status fetches are batched in groups of 5 with 100ms delay between batches to avoid rate-limit spikes
- [ ] If the commit statuses endpoint returns 501 (not yet implemented), the UI displays a clear "Checks API not yet available" message with a retry affordance
- [ ] If fetching statuses for one change fails but others succeed, the view displays partial results with an error indicator on the failed group
- [ ] Empty state (zero checks across all changes) displays a helpful message explaining that no CI integrations have reported status
- [ ] Each check status entry displays: status icon, context, description, and relative timestamp at minimum
- [ ] Expanded/detailed view of a check additionally shows `target_url` (link to external CI system)

### Edge Cases

- [ ] Landing request with zero changes: Checks tab shows empty state "No changes in this landing request"
- [ ] Landing request with a single change and zero checks: Shows "No checks reported for this change"
- [ ] Landing request with 50+ changes: Batched fetching completes without timeout; progressive rendering shows results as they arrive
- [ ] Check `context` string with maximum length (255 characters): Truncated with ellipsis in compact views, fully visible in expanded detail
- [ ] Check `description` string with maximum length (1000 characters): Truncated in list, fully visible in detail
- [ ] Check `target_url` that is empty or null: Detail view omits the URL field gracefully
- [ ] Check `target_url` that is extremely long (2048 characters): Truncated in display with full URL accessible via click/copy
- [ ] Protected bookmark with zero `required_status_contexts`: No "[required]" badges shown, no "missing" rows
- [ ] Protected bookmark with required contexts that exactly match all reported contexts: All required satisfied
- [ ] Protected bookmark with required contexts where some have no status reported at all: Missing rows shown
- [ ] Duplicate `context` strings across different statuses for the same change: All entries shown; the latest should be displayed prominently
- [ ] Landing request targeting a non-protected bookmark: No required checks logic applies; all checks shown as informational
- [ ] Network timeout during status fetch: Timeout after 10 seconds per batch, show error state for affected changes
- [ ] Authentication token expired mid-session: Show re-authentication prompt on 401 response

### Boundary Constraints

- [ ] Maximum checks per change: 100 (pagination cap)
- [ ] Maximum total checks across all changes: 500 (memory/render cap)
- [ ] Check `context` maximum length: 255 characters
- [ ] Check `description` maximum length: 1,000 characters
- [ ] Check `target_url` maximum length: 2,048 characters
- [ ] Refresh debounce interval: 2 seconds minimum between refresh requests
- [ ] Batch size for concurrent fetches: 5 changes per batch
- [ ] Batch delay: 100ms between batches
- [ ] API pagination: 50 statuses per page, maximum 2 pages per change

## Design

### Web UI Design

#### Tab Placement

The Checks tab is the 6th tab on the landing request detail page, positioned after Diff:

```
Overview | Changes | Reviews | Comments | Diff | Checks
```

The tab label includes a status badge:
- Green checkmark icon + "Checks" when all checks pass
- Yellow clock icon + "Checks" when checks are pending (no failures)
- Red X icon + "Checks" when any check has failed or errored
- Gray dash + "Checks" when no checks exist
- No badge until checks data is loaded (lazy loading)

#### Summary Bar

A horizontal bar at the top of the Checks tab content area:

```
┌──────────────────────────────────────────────────────────────┐
│ ✓ All 12 checks passed · 3 required satisfied   Updated 5s ago │
└──────────────────────────────────────────────────────────────┘
```

Variants:
- `✓ All N checks passed` — green background tint
- `⏳ X of N checks pending` — yellow background tint
- `✗ X of N checks failed` — red background tint
- `No checks reported` — neutral/muted background

Required checks sub-summary (only when target bookmark is protected with required checks):
- `N required satisfied` — green text
- `N required failing` — red text
- `N required missing` — yellow/amber text

Right-aligned: "Updated Xs ago" with a refresh button (circular arrow icon).

#### Check Groups

Checks are rendered in collapsible groups, one per change in the stack:

```
▾ Change 1 · abcdef123456 — "Fix login validation"
  ✓  ci/build              Build succeeded                     2m ago
  ✓  ci/test               All 847 tests passed                1m ago
  ✓  security/snyk         No vulnerabilities found             3m ago
  ✗  lint/eslint    [req]  2 errors in src/auth.ts             45s ago

▾ Change 2 · 789abc456def — "Add rate limiting middleware"
  ✓  ci/build              Build succeeded                     2m ago
  ⏳ ci/test               Running... (67%)                    30s ago
  ○  security/snyk  [req]  Missing — no status reported           —
```

Each group header shows:
- Expand/collapse chevron
- Change position in stack ("Change 1", "Change 2", ...)
- Short change ID (first 12 characters)
- Change description/first line of commit message (truncated to 50 chars)

Each check row shows:
- Status icon: ✓ (success/green), ✗ (failure/red), ⚠ (error/orange), ⏳ (pending/yellow), ○ (missing/gray)
- Context string (e.g., `ci/build`)
- `[req]` badge for required check contexts (amber/warning color)
- Description text (truncated, muted color)
- Relative timestamp

#### Check Detail Expansion

Clicking a check row expands an inline detail panel:

```
  ✗  lint/eslint    [req]  2 errors in src/auth.ts             45s ago
  ┌─────────────────────────────────────────────────────────┐
  │ Context:     lint/eslint                                │
  │ Status:      failure                                    │
  │ Description: 2 errors in src/auth.ts                    │
  │ Change:      abcdef123456                               │
  │ URL:         https://ci.example.com/runs/4521  ↗        │
  │ Reported:    2024-03-22T14:32:01Z (45 seconds ago)      │
  └─────────────────────────────────────────────────────────┘
```

The URL is a clickable link that opens in a new tab.

#### Empty State

When no checks exist:

```
  ┌───────────────────────────────────────────────┐
  │                                               │
  │        No checks have been reported           │
  │                                               │
  │  CI integrations report check status through  │
  │  the commit status API. Once a workflow or    │
  │  external CI system reports status, checks    │
  │  will appear here.                            │
  │                                               │
  │              [Refresh]  [Learn more]          │
  │                                               │
  └───────────────────────────────────────────────┘
```

#### Error States

- **501 Not Implemented**: "Checks API not yet available. This feature requires the commit status API to be enabled. [Retry]"
- **Partial failure**: Error banner at the top "Failed to load checks for N change(s). Showing partial results." with per-group error indicators
- **Network failure**: "Unable to load checks. Check your connection and try again. [Retry]"
- **Rate limited**: "Too many requests. Please wait a moment and try again. [Retry in Xs]"

#### Loading State

- Skeleton loader with pulsing placeholder rows matching the check group layout
- Progressive rendering: groups appear as their data arrives; later groups show skeleton until loaded
- Refresh button shows a spinning indicator during refresh

### API Shape

#### List Commit Statuses

```
GET /api/repos/:owner/:repo/commits/:ref/statuses
```

**Path Parameters:**
- `owner` — Repository owner (user or org)
- `repo` — Repository name
- `ref` — Change ID or commit SHA

**Query Parameters:**
- `page` — Page number (default: 1, min: 1)
- `per_page` — Items per page (default: 50, min: 1, max: 100)

**Response (200):**
```json
{
  "statuses": [
    {
      "id": "string",
      "context": "string",
      "status": "success | failure | error | pending",
      "description": "string | null",
      "target_url": "string | null",
      "change_id": "string",
      "created_at": "string (ISO 8601)",
      "updated_at": "string (ISO 8601)"
    }
  ],
  "total": 0,
  "page": 1,
  "per_page": 50
}
```

**Error Responses:**
- `401` — Not authenticated
- `403` — Not authorized to access this repository
- `404` — Repository or ref not found
- `429` — Rate limited
- `501` — Commit status API not yet implemented

#### Create Commit Status

```
POST /api/repos/:owner/:repo/statuses/:sha
```

**Path Parameters:**
- `owner` — Repository owner
- `repo` — Repository name
- `sha` — Commit SHA or change ID

**Request Body:**
```json
{
  "context": "string (required, max 255 chars)",
  "status": "success | failure | error | pending (required)",
  "description": "string (optional, max 1000 chars)",
  "target_url": "string (optional, max 2048 chars, valid URL)"
}
```

**Response (201):**
```json
{
  "id": "string",
  "context": "string",
  "status": "string",
  "description": "string | null",
  "target_url": "string | null",
  "change_id": "string",
  "created_at": "string (ISO 8601)"
}
```

#### Get Protected Bookmark Configuration

```
GET /api/repos/:owner/:repo/protected-bookmarks/:pattern
```

**Response (200):**
```json
{
  "pattern": "string",
  "require_status_checks": true,
  "required_status_contexts": ["ci/build", "security/scan"],
  "require_review": true,
  "required_approvals": 1
}
```

### CLI Command

**Command:** `codeplane land checks <number>`

**Arguments:**
- `<number>` — Landing request number (required, positive integer)

**Options:**
- `--repo <owner/repo>` — Repository (defaults to current repo context)
- `--json` — Output raw JSON
- `--json <field>` — Output specific JSON field

**Default Output:**
```
Landing Request #42 — Checks Summary
All 8 checks passed (3 required satisfied)

Change ID       Context          Status    Description
────────────────────────────────────────────────────────────
abcdef123456    ci/build         success   Build succeeded
abcdef123456    ci/test          success   All 847 tests passed
abcdef123456    lint/eslint      success   No lint errors
abcdef123456    security/snyk    success   No vulnerabilities found
789abc456def    ci/build         success   Build succeeded
789abc456def    ci/test          success   All 312 tests passed
789abc456def    lint/eslint      success   No lint errors
789abc456def    security/snyk    success   No vulnerabilities found
```

**Empty Output:**
```
Landing Request #42 — No checks found

No CI integrations have reported status for the changes in this landing request.
```

**Error Output:**
```
Error: Checks API not yet available (501)
The commit status API has not been implemented on this server.
```

**Exit Codes:**
- `0` — All checks passing (or no checks and no required checks)
- `1` — Any check in failure or error state, or required checks missing
- `2` — API error or network failure

### TUI UI

#### Tab Position and Activation

The Checks tab is the 6th tab in the landing detail view. It is activated via:
- `Tab` / `Shift+Tab` cycling
- Direct press of `6`
- `h` / `l` adjacent tab navigation

#### Summary Bar

Rendered as a full-width box at the top of the Checks tab content:

```
╔════════════════════════════════════════════════════════════╗
║ ✓ All 8 checks passed · 3 required satisfied  Updated 5s ago ║
╚════════════════════════════════════════════════════════════╝
```

Color coding:
- All success: green (ANSI 34) background/text
- Any pending: yellow (ANSI 178)
- Any failure/error: red (ANSI 196)

#### Check Group Headers

Non-focusable header rows separating change groups:

```
── Change 1 · abcdef123456 ──────────────────────────────
```

#### Check Rows

Focusable rows with the following columns:

| Column | Width | Notes |
|--------|-------|-------|
| Status icon | 2ch | ✓ ✗ ⚠ ⏳ ○ with semantic color |
| Context | 25ch | Truncated with `…` if needed |
| [req] badge | 6ch | Only for required contexts, warning color |
| Description | flex | Muted color (ANSI 245), truncated |
| Change ID | 14ch | First 12 chars, muted |
| Timestamp | 6ch | Relative format, muted |

#### Keyboard Navigation

- `j` / `↓` — Next check row (skip group headers)
- `k` / `↑` — Previous check row (skip group headers)
- `Enter` — Expand/collapse inline detail panel for focused check
- `n` — Jump to first check of next change group
- `p` — Jump to first check of previous change group
- `G` — Jump to last check row
- `g g` — Jump to first check row
- `Ctrl+D` / `Ctrl+U` — Page down/up
- `R` — Refresh (debounced 2s)
- `q` — Pop screen / go back
- `Esc` — Close detail panel, or pop screen if no panel open
- `?` — Help overlay

#### Responsive Breakpoints

- **80×24 (minimum)**: Icon + context (truncated to 20ch) + status text only. Group headers show change ID only. Summary bar shows aggregate icon + count only.
- **120×40 (standard)**: Full columns visible. `[req]` badges shown. Description visible. Summary bar includes required checks sub-summary.
- **160×50 (wide)**: All standard columns plus expanded description. Detail panel shows URL inline.
- **200×60+ (extra large)**: Full detail columns including target URL shown inline in check rows without expansion.

#### Detail Panel

When `Enter` is pressed on a focused check row, an inline detail panel expands below:

```
  ┌─ Detail ───────────────────────────────────────────────┐
  │ Context:     ci/build                                  │
  │ Status:      success                                   │
  │ Description: Build succeeded in 2m 34s                 │
  │ Change:      abcdef123456                              │
  │ URL:         https://ci.example.com/runs/4521          │
  │ Reported:    2024-03-22 14:32:01 (45s ago)             │
  └────────────────────────────────────────────────────────┘
```

### Documentation

The following documentation should be written for end users:

1. **Landing Requests > Viewing Checks** — Explains how to use the Checks tab in the web UI, including how to read the summary bar, what status icons mean, how required vs optional checks differ, and how to refresh.
2. **CLI Reference > `codeplane land checks`** — Command reference with usage, options, output format, exit codes, and examples.
3. **TUI Guide > Landing Detail > Checks Tab** — Keyboard shortcuts, navigation model, and responsive layout behavior.
4. **Repository Settings > Protected Bookmarks > Required Checks** — How to configure required status check contexts on a protected bookmark, and how these appear in the Checks tab.
5. **Integrations > Reporting Check Status** — How external CI systems use the `POST /api/repos/:owner/:repo/statuses/:sha` endpoint to report check status, including authentication, payload format, and best practices for context naming.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member (Write) | Member (Read) | Anonymous |
|--------|-------|-------|-----------------|---------------|----------|
| View Checks tab | ✓ | ✓ | ✓ | ✓ | ✓ (public repos only) |
| Refresh checks | ✓ | ✓ | ✓ | ✓ | ✓ (public repos only) |
| Create commit status | ✓ | ✓ | ✓ | ✗ | ✗ |
| View protected bookmark config | ✓ | ✓ | ✓ | ✓ | ✓ (public repos only) |
| Modify protected bookmark config | ✓ | ✓ | ✗ | ✗ | ✗ |

- The Checks tab is read-only for all users. It inherits visibility from the landing request detail page — if a user can view the landing request, they can view the Checks tab.
- Creating commit statuses (the write path) requires at least Write/Member access to the repository, or a valid deploy key / PAT with appropriate scopes.
- Protected bookmark configuration (which defines required check contexts) can only be modified by repository Owners and Admins.

### Rate Limiting

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `GET .../commits/:ref/statuses` | 300 requests | per minute per user | Read-heavy; clients batch requests for stacked landings |
| `POST .../statuses/:sha` | 60 requests | per minute per user | Write path for CI integrations |
| `GET .../protected-bookmarks/:pattern` | 120 requests | per minute per user | Lightweight config read |

Rate limit headers must be included in responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

When rate limited (429), the response body must include `retry_after` in seconds.

### Data Privacy

- Check statuses may contain CI system URLs in `target_url` that point to external systems. These URLs are displayed as-is and should not be proxied through Codeplane.
- Check `description` fields may contain build output snippets. These must respect the same repository access controls — private repo checks are only visible to authorized users.
- No PII is stored in check statuses themselves. The `context`, `description`, and `target_url` fields are CI-integration-controlled strings.
- Protected bookmark configuration (required check contexts) is repository-scoped metadata, not user PII.
- Audit logs should record who created each commit status (user ID or deploy key ID) but this metadata is not exposed in the Checks tab UI.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `landing.checks.viewed` | User activates the Checks tab | `landing_number`, `repo_id`, `owner`, `change_count`, `client` (web/tui/cli), `has_required_checks` |
| `landing.checks.refreshed` | User manually refreshes checks | `landing_number`, `repo_id`, `client`, `time_since_last_refresh_s` |
| `landing.checks.detail_expanded` | User expands a check detail | `landing_number`, `repo_id`, `client`, `check_context`, `check_status`, `is_required` |
| `landing.checks.external_link_clicked` | User clicks target_url link | `landing_number`, `repo_id`, `client`, `check_context`, `target_url_domain` |
| `landing.checks.empty_state_shown` | Checks tab shows empty state | `landing_number`, `repo_id`, `client`, `change_count` |
| `landing.checks.error` | API error during checks fetch | `landing_number`, `repo_id`, `client`, `error_code`, `error_type` (network/auth/rate_limit/501) |
| `landing.checks.partial_load` | Some changes failed to load | `landing_number`, `repo_id`, `client`, `loaded_count`, `failed_count`, `total_count` |
| `landing.checks.blocking_detected` | Required checks are failing or missing | `landing_number`, `repo_id`, `client`, `failing_required_count`, `missing_required_count`, `total_required_count` |
| `commit_status.created` | External system reports a check status | `repo_id`, `owner`, `context`, `status`, `ref_type` (change_id/sha), `auth_method` (pat/deploy_key/session) |

### Funnel Metrics

1. **Checks Tab Activation Rate**: % of landing request detail views that include a Checks tab activation → Target: >25%
2. **Checks-to-Land Conversion**: % of users who view Checks tab and then land the request within the same session → Measures whether checks visibility accelerates landing
3. **Refresh Usage Rate**: % of Checks tab views that include at least one manual refresh → Target: >15% (indicates users are actively monitoring)
4. **Error Rate**: % of Checks tab activations that result in an error event → Target: <5% (excluding expected 501s during rollout)
5. **Time-to-Land After Green**: Median time between all checks turning green and the landing request being landed → Lower is better, indicates the Checks tab is reducing wait time
6. **External Link Click-Through**: % of check detail expansions that lead to an external link click → Measures integration value
7. **CLI Exit Code Distribution**: Distribution of exit codes from `codeplane land checks` → Monitors CI health across the user base

### Success Indicators

- Checks tab becomes the 2nd or 3rd most-visited landing request tab (after Overview)
- Reduction in "why can't I land?" support requests
- Increase in landing request throughput (faster time-to-land) after feature adoption
- >90% of repos with protected bookmarks have required checks configured within 30 days of feature launch

## Observability

### Logging Requirements

#### Server-Side Logs

| Log Level | Event | Structured Context |
|-----------|-------|-------------------|
| `DEBUG` | Commit statuses query started | `repo_id`, `ref`, `page`, `per_page`, `user_id` |
| `DEBUG` | Commit statuses query completed | `repo_id`, `ref`, `result_count`, `duration_ms` |
| `INFO` | Commit status created | `repo_id`, `ref`, `context`, `status`, `user_id`, `auth_method` |
| `INFO` | Commit status updated (same context, new status) | `repo_id`, `ref`, `context`, `old_status`, `new_status`, `user_id` |
| `WARN` | Commit status creation with invalid URL | `repo_id`, `ref`, `context`, `target_url` (sanitized) |
| `WARN` | Rate limit approaching (>80% consumed) | `user_id`, `endpoint`, `remaining`, `limit` |
| `WARN` | Large landing request checks fetch (>20 changes) | `repo_id`, `landing_number`, `change_count` |
| `ERROR` | Database error during status query | `repo_id`, `ref`, `error_message`, `stack_trace` |
| `ERROR` | Database error during status creation | `repo_id`, `ref`, `context`, `error_message` |
| `ERROR` | Protected bookmark lookup failure | `repo_id`, `pattern`, `error_message` |

#### Client-Side Logs (Web/TUI)

| Log Level | Event | Structured Context |
|-----------|-------|-------------------|
| `DEBUG` | Checks tab activated | `landing_number`, `change_count` |
| `DEBUG` | Fetch started for change | `landing_number`, `change_id`, `batch_index` |
| `DEBUG` | Fetch completed for change | `landing_number`, `change_id`, `status_count`, `duration_ms` |
| `INFO` | All checks loaded | `landing_number`, `total_checks`, `total_duration_ms`, `change_count` |
| `INFO` | Manual refresh triggered | `landing_number`, `time_since_last_refresh_ms` |
| `WARN` | Fetch failed for change | `landing_number`, `change_id`, `error_code`, `error_message` |
| `WARN` | Rate limited response received | `landing_number`, `retry_after_s` |
| `WARN` | Slow load detected (>5s) | `landing_number`, `elapsed_ms`, `loaded_count`, `total_count` |
| `WARN` | API returned 501 | `landing_number`, `endpoint` |
| `ERROR` | Auth error (401) | `landing_number`, `endpoint` |
| `ERROR` | Render error / component crash | `landing_number`, `error_message`, `component` |

### Prometheus Metrics

#### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_commit_status_queries_total` | `repo_id`, `status_code` | Total commit status list requests |
| `codeplane_commit_status_creates_total` | `repo_id`, `status`, `auth_method` | Total commit statuses created |
| `codeplane_landing_checks_views_total` | `client` (web/tui/cli) | Total Checks tab activations |
| `codeplane_landing_checks_refreshes_total` | `client` | Total manual refresh actions |
| `codeplane_landing_checks_errors_total` | `client`, `error_type` | Total errors during checks fetch |

#### Histograms

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_commit_status_query_duration_seconds` | `repo_id` | 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 | Duration of status list queries |
| `codeplane_landing_checks_load_duration_seconds` | `client` | 0.1, 0.5, 1, 2, 3, 5, 10, 20 | Total time to load all checks for a landing |
| `codeplane_commit_status_create_duration_seconds` | — | 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5 | Duration of status creation |

#### Gauges

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_landing_checks_pending_fetches` | `client` | Currently in-flight checks fetches |
| `codeplane_commit_status_count_per_landing` | — | Number of statuses across all changes in a landing (observed on view) |

### Alerts

#### Alert: High Commit Status Query Error Rate

**Condition:** `rate(codeplane_commit_status_queries_total{status_code=~"5.."}[5m]) / rate(codeplane_commit_status_queries_total[5m]) > 0.05`

**Severity:** Warning (>5%), Critical (>20%)

**Runbook:**
1. Check server logs for `ERROR` entries matching `commit_status_query` — look for database connection failures or query timeouts.
2. Verify database health: check connection pool utilization and query latency via PG metrics.
3. If the error is 501 (not implemented), this is expected during rollout — confirm feature flag state.
4. If errors are 500, check for recent deployments or schema migrations that may have broken the statuses table.
5. Check disk space on the database server — full disks can cause query failures.
6. If the issue is transient (spike then recovery), check for concurrent large landing request views that may have overwhelmed the query layer.
7. Escalate to database on-call if errors persist beyond 10 minutes.

#### Alert: Commit Status Query Latency Degradation

**Condition:** `histogram_quantile(0.95, rate(codeplane_commit_status_query_duration_seconds_bucket[5m])) > 2`

**Severity:** Warning (>2s p95), Critical (>5s p95)

**Runbook:**
1. Check database slow query log for queries involving the commit_statuses table.
2. Verify index health on `(repo_id, ref)` and `(repo_id, ref, context)` composite indices.
3. Check if a specific repository has an unusually high number of statuses (>1000 per ref) causing slow scans.
4. Review recent schema changes or migrations.
5. Check database CPU and memory utilization — high utilization suggests resource contention.
6. If specific repos are causing the issue, consider adding a cache layer for frequently-accessed status data.
7. Temporary mitigation: reduce `per_page` default to 25 to reduce per-query load.

#### Alert: Landing Checks Client Error Spike

**Condition:** `rate(codeplane_landing_checks_errors_total[5m]) > 10`

**Severity:** Warning

**Runbook:**
1. Check error_type label distribution — is it `network`, `auth`, `rate_limit`, or `501`?
2. For `rate_limit` errors: check if a specific user/integration is sending excessive requests. Review rate limit configuration.
3. For `auth` errors: check if there was a recent auth system change or token rotation that invalidated sessions.
4. For `network` errors: check server health, load balancer status, and network connectivity.
5. For `501` errors: verify feature flag status — if the commit status API is not yet deployed, 501 is expected.
6. Check for correlated alerts on the server side (query errors, latency).

#### Alert: Zero Commit Status Creates for Extended Period

**Condition:** `increase(codeplane_commit_status_creates_total[1h]) == 0` (only when previous hour had >0)

**Severity:** Info

**Runbook:**
1. This alert fires when CI integrations stop reporting statuses. It may indicate a CI system outage.
2. Check the status of known CI integrations (workflow engine, external CI systems).
3. Verify that the `POST .../statuses/:sha` endpoint is returning 2xx responses — check for 401/403 errors that might indicate expired integration credentials.
4. Check if this coincides with a deployment or configuration change.
5. If the workflow engine is the primary status reporter, check workflow execution health.
6. This may be a false alarm during low-activity periods (weekends, holidays). Check traffic patterns.

### Error Cases and Failure Modes

| Error Case | Server Behavior | Client Behavior | Recovery |
|------------|----------------|-----------------|----------|
| Database unreachable | 500 with structured error | Show error banner, offer retry | Automatic retry with exponential backoff |
| Ref/change not found | 404 | Show "Change not found" in group | No retry; change may have been rebased |
| Repository not found | 404 | Redirect to 404 page | N/A |
| User not authorized | 403 | Show "Not authorized" message | Prompt re-authentication |
| Session expired | 401 | Show login redirect | Re-authenticate |
| Rate limited | 429 with `retry_after` | Show rate limit message, disable refresh for `retry_after` seconds | Automatic retry after delay |
| Status API not implemented | 501 | Show "not available" message with retry | Manual retry via refresh |
| Malformed status data in DB | 500 or partial response | Show partial results with error indicator | Log and investigate data integrity |
| Network timeout (client) | N/A | Show timeout error per change group | Manual retry via refresh |
| Excessively large response (>500 statuses) | Paginated response | Client stops fetching after cap reached, shows "showing first 500 checks" | By design; prevents memory issues |

## Verification

### API Integration Tests

#### Commit Status CRUD

- [ ] **Create a commit status with all fields** — POST a status with `context`, `status`, `description`, `target_url`; verify 201 response with all fields present and correct
- [ ] **Create a commit status with only required fields** — POST with only `context` and `status`; verify `description` and `target_url` are null in response
- [ ] **Create multiple statuses for the same ref and context** — POST two statuses with same `context` but different `status`; verify both are stored and list returns them in chronological order (newest first)
- [ ] **Create statuses for different contexts on the same ref** — POST statuses with `ci/build` and `ci/test`; verify list returns both
- [ ] **Create status with maximum-length context (255 chars)** — Verify 201 success
- [ ] **Create status with context exceeding maximum length (256 chars)** — Verify 400/422 validation error
- [ ] **Create status with empty context** — Verify 400/422 validation error
- [ ] **Create status with maximum-length description (1000 chars)** — Verify 201 success
- [ ] **Create status with description exceeding maximum (1001 chars)** — Verify 400/422 validation error
- [ ] **Create status with maximum-length target_url (2048 chars)** — Verify 201 success
- [ ] **Create status with target_url exceeding maximum (2049 chars)** — Verify 400/422 validation error
- [ ] **Create status with invalid target_url (not a URL)** — Verify 400/422 validation error
- [ ] **Create status with invalid status value** — POST with `status: "unknown"`; verify 400/422 validation error
- [ ] **Create status with each valid status value** — Verify `success`, `failure`, `error`, `pending` all succeed
- [ ] **Create status without authentication** — Verify 401
- [ ] **Create status with read-only access** — Verify 403
- [ ] **Create status on non-existent repository** — Verify 404
- [ ] **Create status on non-existent ref** — Verify 404

#### Commit Status Listing

- [ ] **List statuses for a ref with multiple statuses** — Verify all statuses returned, sorted by creation time descending
- [ ] **List statuses for a ref with zero statuses** — Verify empty array returned, 200 status
- [ ] **List statuses with pagination (page 1)** — Create 60 statuses, request page=1 per_page=50; verify 50 returned with correct total
- [ ] **List statuses with pagination (page 2)** — Request page=2 per_page=50; verify remaining 10 returned
- [ ] **List statuses with per_page=1** — Verify exactly 1 returned
- [ ] **List statuses with per_page=100 (maximum)** — Verify succeeds
- [ ] **List statuses with per_page=101 (over maximum)** — Verify clamped to 100 or returns validation error
- [ ] **List statuses with per_page=0** — Verify validation error
- [ ] **List statuses with negative page number** — Verify validation error
- [ ] **List statuses for non-existent ref** — Verify 404
- [ ] **List statuses for non-existent repository** — Verify 404
- [ ] **List statuses without authentication on private repo** — Verify 401
- [ ] **List statuses without authentication on public repo** — Verify 200
- [ ] **List statuses with read-only access** — Verify 200 (read access is sufficient)

#### Landing Request Checks Integration

- [ ] **Fetch checks for a landing request with multiple changes** — Create landing with 3 change IDs, add statuses to each, verify fetching statuses per change returns correct data
- [ ] **Fetch checks for a landing request with no statuses** — Verify empty results per change
- [ ] **Fetch checks for a landing request with mixed status results** — Some changes have statuses, some don't; verify partial results are correct

### Web UI E2E Tests (Playwright)

#### Tab Navigation

- [ ] **Checks tab is visible on landing request detail page** — Navigate to a landing request, verify "Checks" tab exists as the 6th tab
- [ ] **Clicking Checks tab loads check content** — Click the Checks tab, verify the summary bar and check groups appear
- [ ] **Checks tab shows loading skeleton initially** — Click tab, verify skeleton/loading state appears before data
- [ ] **Checks tab lazy loads (not on page load)** — Monitor network requests; verify no statuses API calls until Checks tab is clicked
- [ ] **Tab badge shows correct aggregate status** — Create all-passing checks, verify green checkmark on tab badge

#### Summary Bar

- [ ] **Summary shows "All N checks passed" when all succeed** — Create only success statuses; verify green summary
- [ ] **Summary shows "X of N checks pending" with pending checks** — Create mix of success and pending; verify yellow summary
- [ ] **Summary shows "X of N checks failed" with failures** — Create a failure status; verify red summary
- [ ] **Summary shows "No checks reported" when empty** — Verify neutral summary on landing with no statuses
- [ ] **Required checks sub-summary visible for protected bookmarks** — Configure required checks on bookmark; verify "N required satisfied" text
- [ ] **Required checks sub-summary shows "missing" for unreported required checks** — Configure required context that has no status; verify "N required missing"
- [ ] **Refresh timestamp updates after manual refresh** — Click refresh, verify "Updated" timestamp resets

#### Check Groups

- [ ] **Checks are grouped by change ID in stack order** — Verify group headers match change_ids order from landing request
- [ ] **Group header shows change ID and description** — Verify both are rendered
- [ ] **Checks within a group are sorted alphabetically by context** — Add checks with contexts "z-check", "a-check", "m-check"; verify alphabetical order
- [ ] **Required checks show [req] badge** — Configure required context; verify badge renders on matching check row
- [ ] **Missing required check shows as hollow circle row** — Configure required context with no status reported; verify ○ row with "Missing" label

#### Check Detail Expansion

- [ ] **Clicking a check row expands detail panel** — Click a check, verify detail panel with context, status, description, change ID, URL, and timestamp
- [ ] **Clicking expanded check row collapses it** — Click again, verify panel collapses
- [ ] **Detail panel shows clickable target_url** — Verify URL is an anchor tag with target="_blank"
- [ ] **Detail panel handles null target_url** — Check with no URL; verify URL field is omitted gracefully
- [ ] **Only one detail panel is expanded at a time** — Expand one check, click another; verify first collapses

#### Refresh

- [ ] **Refresh button re-fetches all statuses** — Click refresh, verify network requests fired for all change IDs
- [ ] **Refresh button is debounced** — Click refresh twice within 2 seconds; verify only one set of requests fires
- [ ] **Refresh button shows loading indicator** — Click refresh, verify spinner/loading state on button
- [ ] **Data updates after refresh** — Change a status in the backend between views, click refresh, verify new status appears

#### Empty and Error States

- [ ] **Empty state shown when no checks exist** — Navigate to Checks tab for landing with no statuses; verify empty state message and "Learn more" link
- [ ] **501 error shows "not available" message** — With commit status API returning 501; verify appropriate message and retry button
- [ ] **Partial failure shows error banner with partial results** — Mock one change's statuses as failing, others succeeding; verify banner and partial data
- [ ] **Network error shows retry prompt** — Simulate network failure; verify error message and retry button

#### Responsive Behavior

- [ ] **Layout renders correctly at 1024px width** — Verify all columns visible
- [ ] **Layout renders correctly at 768px width** — Verify description column truncated or hidden
- [ ] **Layout renders correctly at 480px width (mobile)** — Verify graceful degradation with essential columns only

### CLI E2E Tests

#### Happy Path

- [ ] **`land checks <number>` displays formatted table** — Create landing with statuses; run command; verify table output with columns: Change ID, Context, Status, Description
- [ ] **`land checks <number> --json` outputs raw JSON** — Verify valid JSON output matching API response structure
- [ ] **`land checks <number> --json status` outputs filtered field** — Verify only status values in output
- [ ] **`land checks <number>` with no checks shows empty message** — Verify "No checks found" output
- [ ] **`land checks <number>` exits 0 when all checks pass** — Verify exit code
- [ ] **`land checks <number>` exits 1 when any check fails** — Add a failure status; verify exit code 1
- [ ] **`land checks <number>` exits 1 when required checks are missing** — Configure required context with no status; verify exit code 1
- [ ] **`land checks <number>` with --repo flag** — Specify explicit repo; verify correct API calls

#### Error Handling

- [ ] **`land checks` with no number argument** — Verify usage error message
- [ ] **`land checks 999999` with non-existent landing** — Verify "not found" error and exit code 2
- [ ] **`land checks <number>` with invalid authentication** — Verify auth error and exit code 2
- [ ] **`land checks <number>` when API returns 501** — Verify "not available" error message and exit code 2
- [ ] **`land checks <number>` with rate limiting** — Verify rate limit error message

### TUI E2E Tests

#### Tab Navigation

- [ ] **Checks tab accessible via `6` key** — Press `6` on landing detail; verify Checks tab activates
- [ ] **Checks tab accessible via Tab cycling** — Press Tab 5 times from Overview; verify Checks tab activates
- [ ] **Summary bar renders with correct aggregate status** — Verify text and color match expected state

#### Keyboard Navigation

- [ ] **`j`/`k` navigate between check rows** — Verify focus moves, skipping group headers
- [ ] **`n`/`p` jump between change groups** — Verify focus moves to first check of next/previous group
- [ ] **`G` jumps to last check** — Verify focus on last check row
- [ ] **`g g` jumps to first check** — Verify focus on first check row
- [ ] **`Enter` expands check detail** — Verify detail panel renders
- [ ] **`Esc` closes detail panel** — Verify panel closes without leaving screen
- [ ] **`R` triggers refresh** — Verify data re-fetched (monitor output or loading indicator)
- [ ] **`q` exits to landing list** — Verify screen pops

#### Responsive Rendering

- [ ] **Renders correctly at 80×24 terminal size** — Verify minimal layout with icon + context + status only
- [ ] **Renders correctly at 120×40 terminal size** — Verify standard layout with all columns
- [ ] **Renders correctly at 200×60 terminal size** — Verify extended layout with inline URLs

#### Edge Cases

- [ ] **Landing with 50 changes renders progressively** — Verify batched loading with progressive group appearance
- [ ] **Check with 255-char context truncates correctly** — Verify truncation with ellipsis in compact view, full in detail
- [ ] **Rapid `R` presses debounced** — Press R 5 times quickly; verify only one refresh cycle

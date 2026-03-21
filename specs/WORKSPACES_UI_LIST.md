# WORKSPACES_UI_LIST

Specification for WORKSPACES_UI_LIST.

## High-Level User POV

When a developer navigates to the Workspaces view in Codeplane — whether from the web application's global workspaces page, the TUI's `g w` shortcut, or the CLI's `workspace list` command — they see a consolidated list of all container-backed development environments they have access to within a repository. This is the primary surface for workspace management: it shows every workspace's current status (running, suspended, pending, starting, stopped, or failed), its name, who created it, how long before it auto-suspends, and when it was last active.

The value of this view is immediate situational awareness. Developers working across multiple workspaces — a debugging session, a feature branch environment, a staging preview — can see the state of all of them in one place. They can quickly identify which workspaces are running and consuming resources, which are suspended and ready to resume, and which have failed and need attention. From this single list, they can suspend a running workspace to free resources, resume a suspended workspace to get back to work, delete stale environments, copy SSH connection details to connect directly, or navigate into a workspace's detail view for deeper inspection.

The list updates in real time. When a workspace transitions from "starting" to "running" — whether because the user just created it or because an agent spun one up in the background — the status indicator changes live without requiring a manual refresh. This is essential for teams where both humans and agents create and manage workspaces concurrently.

Filtering and search let users cut through noise. A developer with twenty workspaces can quickly filter to only "running" environments or search by name to find the one they need. Pagination ensures the view stays responsive even for repositories with hundreds of workspaces.

The experience is consistent across surfaces. The web UI provides a rich, visually detailed table. The TUI offers a full-screen terminal experience with vim-style keyboard navigation. The CLI outputs a structured, scriptable list suitable for piping and automation. All three surfaces consume the same API endpoint and present the same data model, so the mental model is identical regardless of which client the developer is using.

## Acceptance Criteria

### Definition of Done

- The workspace list is accessible from the web UI global workspaces route, the TUI `g w` keybinding and command palette, and the CLI `codeplane workspace list` command
- All three surfaces call `GET /api/repos/:owner/:repo/workspaces` and display the returned workspace data
- The list is paginated with a default page size of 30, a maximum page size of 100, and a memory cap of 200 items in interactive clients (TUI/web)
- The `X-Total-Count` header from the API is displayed as a total count indicator in the header/title area
- Each workspace row displays at minimum: status indicator, workspace name, and a relative timestamp
- Real-time status updates are delivered via SSE (`workspace.status` events) in the web UI and TUI, updating inline without full list re-fetch
- Users can perform suspend, resume, and delete actions directly from the list view (web UI and TUI)
- The view is authenticated; anonymous access is denied
- Users see only workspaces they have permission to view within the repository context

### Functional Constraints

- [ ] Workspace names follow the pattern `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` and are 1–63 characters long
- [ ] Workspace names that are null or empty render as `<unnamed>` in muted/italic styling
- [ ] Workspace IDs are UUIDs; when displayed, they are truncated to the first 8 characters followed by `…`
- [ ] Workspace statuses are one of: `pending`, `starting`, `running`, `suspended`, `stopped`, `failed`
- [ ] The idle timeout is displayed as a human-readable duration (e.g., "30m", "1h", "24h"); zero displays as "—"
- [ ] Relative timestamps never exceed 4 characters in compact form (e.g., "3d", "1mo", "2y", "now")
- [ ] `suspended_at` and `created_at` are displayed in relative format, max 12 characters (e.g., "3d ago")
- [ ] The total count display abbreviates above 9,999 (e.g., "10k+")
- [ ] Pagination uses offset-based semantics: `page` (default 1) and `per_page` (default 30, max 100)
- [ ] `per_page` values above 100 are rejected with HTTP 400
- [ ] Invalid pagination parameters (non-numeric, zero, negative) are rejected with HTTP 400
- [ ] Sorting is by `created_at` descending (newest first); not user-configurable in this iteration

### Edge Cases

- [ ] Repository with zero workspaces renders an empty state with a prompt to create one
- [ ] Unicode characters in workspace names are truncated respecting grapheme cluster boundaries
- [ ] A workspace created server-side does not appear until the next fetch or an SSE event triggers a refresh
- [ ] Repositories with 200+ workspaces display a "Showing first 200 of N" indicator and do not attempt to load beyond the cap
- [ ] Concurrent suspend/resume actions on the same workspace deduplicate to a single API call
- [ ] Delete confirmation dismissal (cancel) produces no API call
- [ ] Suspend on a non-running workspace is a no-op (no API call, no error)
- [ ] Resume on a non-suspended workspace is a no-op (no API call, no error)
- [ ] SSE delivers a malformed event: silently ignored, no crash
- [ ] SSE disconnects during a workspace transition: reconnection triggers a full list re-fetch to reconcile state
- [ ] API returns a workspace with optional fields missing (`parent_workspace_id`, `ssh_host`, `snapshot_id`): rendered gracefully with absent columns blank or omitted
- [ ] 409 conflict on suspend/resume: optimistic update reverted, user-visible conflict message displayed
- [ ] Clipboard write fails (e.g., SSH session): SSH command displayed inline for manual copy
- [ ] Search/filter input is capped at 120 characters

## Design

### Web UI Design

The web UI workspace list is accessible as a global route at `/workspaces` and also under the repository context at `/:owner/:repo/workspaces`. It renders as a full-page table within the app shell layout (sidebar, header bar, content area).

**Header area**: Displays "Workspaces" as the page title with the total count in parentheses. A "New Workspace" primary action button sits in the top-right corner. Below the title is a toolbar with a search input (client-side substring match on name) and a status filter dropdown with options: All, Running, Suspended, Pending, Starting, Failed, Stopped.

**Table columns**: Status (colored dot + label), Name (link to detail), Owner (username), Idle Timeout (human-readable), Created (relative timestamp), Updated (relative timestamp). An actions column on the right provides a kebab menu (⋮) per row with: Open, Suspend, Resume, Delete, Copy SSH Command.

**Pagination**: A footer pagination bar showing "Page X of Y" with previous/next controls and a per-page selector (10, 30, 50, 100).

**Empty state**: A centered illustration with text "No workspaces yet" and a call-to-action button "Create your first workspace".

**Real-time updates**: SSE connection via `EventSource` to the workspace status stream updates individual row status indicators inline. A small connectivity indicator in the toolbar area shows green when connected, gray when reconnecting.

**Delete confirmation**: A modal dialog: "Are you sure you want to delete workspace '{name}'? This action cannot be undone." with Cancel and Delete buttons. Delete button is styled as destructive (red).

**Optimistic updates**: Suspend, resume, and delete actions update the UI immediately. On failure, the previous state is restored and a toast notification shows the error.

### TUI UI Design

The TUI workspace list screen is a full-screen terminal view. Key design elements:

**Layout**: Title row ("Workspaces (N)"), filter toolbar (search input + status label), optional column headers, scrollable list, status bar with keybinding hints: `j/k:nav  Enter:open  /:filter  f:status  c:create  p:pause  r:resume  q:back`.

**Responsive breakpoints**:
- 80×24 (minimum): Status icon + name + timestamp only. No column headers. Toolbar shows search input only.
- 120×40 (standard): Full columns — name (30ch), status label (12ch), owner (15ch), idle timeout (8ch), timestamp (4ch). Column headers visible. Full toolbar with status filter label.
- 200×60+ (large): All columns including workspace ID (12ch truncated), suspended_at (12ch), created_at (12ch).

**Keyboard navigation**: vim-style `j`/`k` for up/down, `Enter` to open, `/` for search, `f` for status filter cycling (All → Running → Suspended → Pending → Failed → Stopped → All), `c` to create, `p` to suspend, `r` to resume, `d` to delete (with `y`/`n` confirmation), `S` to copy SSH command, `G`/`g g` for jump-to-end/start, `Ctrl+D`/`Ctrl+U` for page navigation, `Space` for row selection, `q` to go back.

**Status icon colors**: Running = green ●, Starting/Pending = yellow ●, Suspended = gray ●, Stopped = dark gray ●, Failed = red ●. No-color terminals use text markers: `[R]`, `[S]`, `[P]`, `[F]`, `[X]`.

**Delete confirmation overlay**: Centered modal with workspace name, "This action cannot be undone." warning, and `[y] Confirm / [n/Esc] Cancel` prompt. Focus is trapped within the overlay. All other keybindings disabled.

**Layout diagram (standard breakpoint)**:
```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workspaces     │
├─────────────────────────────────────────────────┤
│ Workspaces (5)                        / filter  │
│ Status: All                                     │
├─────────────────────────────────────────────────┤
│ NAME           STATUS     OWNER    IDLE   AGE   │
├─────────────────────────────────────────────────┤
│ ► ● dev-env    running    alice    30m    3d    │
│   ● staging    suspended  alice    1h     1w    │
│   ● test-env   running    bob      30m    2d    │
│   ● debug      failed     alice    —      5d    │
│   ● preview    stopped    carol    —      2w    │
├─────────────────────────────────────────────────┤
│ j/k:nav Enter:open /:filter f:status c:new q:back│
└─────────────────────────────────────────────────┘
```

### CLI Command Design

**Command**: `codeplane workspace list`

**Flags**:
- `--repo OWNER/REPO` (or `-R`): Target repository. Defaults to inference from current directory's git remote.
- `--json`: Output as JSON array
- `--limit N`: Number of workspaces to fetch (default 30, max 100)
- `--page N`: Page number for pagination

**Default output**: Formatted table to stdout:
```
ID         NAME        STATUS     OWNER   IDLE    CREATED
a1b2c3d4   dev-env     running    alice   30m     3d ago
e5f6g7h8   staging     suspended  alice   1h      1w ago
```

**Empty output**: "No workspaces found." to stderr, exit 0.
**Error output**: Error message to stderr, non-zero exit code.

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspaces`

**Query parameters**:
| Parameter | Type | Default | Constraints |
|-----------|------|---------|-------------|
| `page` | integer | 1 | ≥ 1 |
| `per_page` | integer | 30 | 1–100 |
| `limit` | integer | 30 | 1–100 (alternative to per_page) |
| `cursor` | integer | 0 | ≥ 0 (alternative to page) |

**Response**: `200 OK`
Headers: `X-Total-Count: <integer>`
Body: JSON array of `WorkspaceResponse` objects with fields: `id` (UUID string), `repository_id` (number), `user_id` (number), `name` (string), `status` (enum), `is_fork` (boolean), `parent_workspace_id` (optional string), `freestyle_vm_id` (string), `persistence` (string), `ssh_host` (optional string), `snapshot_id` (optional string), `idle_timeout_seconds` (number), `suspended_at` (ISO-8601 string or null), `created_at` (ISO-8601 string), `updated_at` (ISO-8601 string).

**Error responses**: 400 (invalid params), 401 (unauthenticated), 403 (insufficient permissions), 404 (repo not found), 429 (rate limited with Retry-After), 500 (server error).

### SDK Shape

`@codeplane/ui-core` provides `useWorkspaces(owner, repo, options?)` returning `{ workspaces, totalCount, isLoading, error, hasMore, fetchMore, refetch }`. Mutation hooks: `useSuspendWorkspace()`, `useResumeWorkspace()`, `useDeleteWorkspace()` with optimistic update callbacks (`onOptimistic`, `onRevert`, `onError`, `onSettled`).

### Documentation

- **Web UI guide**: "Managing Workspaces" — Navigating to the workspace list, understanding status indicators, filtering and searching, performing actions (suspend/resume/delete), understanding real-time updates
- **TUI guide**: "Workspace List Screen" — Keybinding reference table, breakpoint behavior, deep-link launch flags (`--screen workspaces --repo owner/repo`), search and filter usage
- **CLI reference**: `codeplane workspace list` — Full flag documentation, output format examples (table and JSON), exit codes, error messages
- **API reference**: `GET /api/repos/:owner/:repo/workspaces` — Request/response schemas, pagination parameters, error codes, rate limits

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Write (own) | Write (others') | Admin |
|--------|-----------|-----------|-------------|------------------|-------|
| View workspace list | ❌ | ✅ | ✅ | ✅ | ✅ |
| Open workspace detail | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create workspace | ❌ | ❌ | ✅ | — | ✅ |
| Suspend workspace | ❌ | ❌ | ✅ | ❌ | ✅ |
| Resume workspace | ❌ | ❌ | ✅ | ❌ | ✅ |
| Delete workspace | ❌ | ❌ | ✅ | ❌ | ✅ |
| Copy SSH command | ❌ | ❌ | ✅ | ❌ | ✅ |

- All workspace list access requires authentication. Unauthenticated requests receive HTTP 401.
- The API returns only workspaces the authenticated user has access to within the repository context. Users with Write permissions can see and manage their own workspaces. Admins can see and manage all workspaces in the repository.
- Write-level users attempting to suspend/resume/delete another user's workspace receive HTTP 403 unless they have Admin role.
- In the TUI, keybinding hints for `c` (create) are hidden for read-only users. Action keys `p`, `r`, `d`, `S` are disabled for workspaces not owned by the current user (unless admin).
- In the web UI, action menu items are hidden/disabled based on permissions.

### Rate Limiting

- `GET /api/repos/:owner/:repo/workspaces`: 300 requests/minute per authenticated user
- Workspace action endpoints (suspend/resume/delete): 30 requests/minute per user
- On 429, the UI displays the `Retry-After` value. No automatic retry; user must manually retry.

### Data Privacy

- Auth tokens are never displayed in the UI, logged in application logs, or included in error messages.
- SSE connections use ticket-based authentication; the bearer token is not sent over the SSE connection directly.
- SSH connection info (including access tokens) is only accessible for workspaces the user owns or has admin access to.
- Workspace names, IDs, and status data do not constitute PII. However, the `user_id` and owner display name are user identifiers and should be handled per the platform's standard PII policies.
- Search/filter input is client-side only and is never transmitted to the server.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workspaces.list.view` | Workspace list page/screen loaded with initial data | `total_count`, `surface` (web/tui/cli), `breakpoint` (tui only), `load_time_ms`, `entry_method` (navigation/deeplink/palette/cli), `repo_full_name` |
| `workspaces.list.open` | User opens a workspace from the list | `workspace_id`, `workspace_status`, `position_in_list`, `was_filtered`, `surface` |
| `workspaces.list.filter` | User activates search filter | `filter_text_length`, `matched_count`, `total_loaded_count`, `surface` |
| `workspaces.list.status_filter` | User changes status filter | `new_status_filter`, `previous_status_filter`, `matched_count`, `surface` |
| `workspaces.list.paginate` | Next page of workspaces loaded | `page_number`, `items_loaded_total`, `total_count`, `surface` |
| `workspaces.list.suspend` | User suspends a workspace from the list | `workspace_id`, `workspace_name`, `success`, `surface` |
| `workspaces.list.resume` | User resumes a workspace from the list | `workspace_id`, `workspace_name`, `success`, `surface` |
| `workspaces.list.delete` | User confirms workspace deletion | `workspace_id`, `workspace_name`, `success`, `surface` |
| `workspaces.list.delete_cancel` | User cancels workspace deletion | `workspace_id`, `surface` |
| `workspaces.list.ssh_copy` | User copies SSH connection command | `workspace_id`, `workspace_name`, `surface` |
| `workspaces.list.sse_update` | SSE delivers a workspace status change | `workspace_id`, `old_status`, `new_status` |
| `workspaces.list.error` | API request fails | `error_type` (network/auth/rate_limit/server/conflict), `http_status`, `request_type` (list/suspend/resume/delete/ssh), `surface` |
| `workspaces.list.retry` | User retries after error | `error_type`, `retry_success`, `surface` |
| `workspaces.list.empty` | Empty state rendered | `has_filters_active`, `surface` |
| `workspaces.list.create_initiated` | User navigates to create workspace from list | `repo_full_name`, `surface` |

### Common Properties (attached to all events)

`session_id`, `user_id`, `timestamp`, `client_version`, `surface` (web/tui/cli)

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Screen load completion rate | >98% | Basic reliability signal |
| Workspace open rate (per view) | >50% | Users are finding what they need |
| Create adoption (per view) | >15% | List is an effective on-ramp to creation |
| Suspend/resume usage (per view) | >10% | Resource management is discoverable |
| SSH copy rate (per view) | >20% | Workspace connection is a core workflow |
| Filter adoption (per view) | >15% | Users benefit from filtering |
| SSE update delivery latency (<5s) | >95% | Real-time updates are timely |
| Error rate | <2% | Platform stability |
| Time to first interaction | <1.5s median | Perceived performance |

## Observability

### Logging

| Log Level | Event | Structured Context |
|-----------|-------|-----------------|
| `info` | Workspace list loaded | `total_count`, `items_in_page`, `load_time_ms`, `repo_full_name`, `user_id`, `page`, `per_page` |
| `info` | Workspace opened from list | `workspace_id`, `workspace_name`, `workspace_status`, `position_in_list` |
| `info` | Workspace suspended from list | `workspace_id`, `workspace_name`, `success`, `user_id` |
| `info` | Workspace resumed from list | `workspace_id`, `workspace_name`, `success`, `user_id` |
| `info` | Workspace deleted from list | `workspace_id`, `workspace_name`, `success`, `user_id` |
| `info` | SSH command copied | `workspace_id`, `user_id` |
| `info` | SSE workspace status update received | `workspace_id`, `old_status`, `new_status` |
| `info` | Pagination page loaded | `page_number`, `items_count`, `total_loaded` |
| `warn` | API error on workspace list fetch | `http_status`, `error_message` (token redacted), `repo_full_name` |
| `warn` | Rate limited on workspace list | `retry_after_seconds`, `user_id` |
| `warn` | Rate limited on workspace action | `retry_after_seconds`, `workspace_id`, `action`, `user_id` |
| `warn` | Suspend/resume conflict (409) | `workspace_id`, `workspace_status`, `attempted_action` |
| `warn` | Delete failed | `workspace_id`, `http_status`, `error_message` (token redacted) |
| `warn` | Pagination cap reached | `total_count`, `cap` (200) |
| `warn` | SSE connection lost | `reconnect_attempt`, `backoff_seconds` |
| `debug` | Filter activated | `filter_text_length`, `status_filter` |
| `debug` | Status filter changed | `new_status_filter`, `previous_status_filter` |
| `debug` | Scroll position updated | `scroll_percent`, `focused_index`, `total_loaded` |
| `debug` | SSE reconnection attempt | `attempt_number`, `backoff_ms` |
| `debug` | Delete confirmation overlay shown/cancelled | `workspace_id` |

Logs written to stderr (TUI/CLI) or structured JSON (server). Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`). Auth tokens and secrets are never included in log output.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_list_requests_total` | counter | `status`, `repo` | Total workspace list API requests |
| `codeplane_workspace_list_request_duration_seconds` | histogram | `repo` | Latency of workspace list API requests |
| `codeplane_workspace_list_items_returned` | histogram | `repo` | Number of items returned per request |
| `codeplane_workspace_action_total` | counter | `action` (suspend/resume/delete), `status` (success/failure/conflict), `repo` | Total workspace actions from list |
| `codeplane_workspace_sse_connections_active` | gauge | `repo` | Active SSE connections for workspace status |
| `codeplane_workspace_sse_events_total` | counter | `event_type`, `repo` | Total SSE events delivered |
| `codeplane_workspace_sse_reconnections_total` | counter | `repo` | Total SSE reconnection attempts |
| `codeplane_workspace_list_errors_total` | counter | `error_type` (auth/rate_limit/server/network), `repo` | Total errors on list endpoint |

### Alerts

**Alert: WorkspaceListHighErrorRate**
- Condition: `codeplane_workspace_list_errors_total / codeplane_workspace_list_requests_total > 0.05` for 5 minutes
- Severity: Warning
- Runbook:
  1. Check `codeplane_workspace_list_errors_total` by `error_type` label to identify the dominant error class
  2. If `error_type=server`: check server logs for 500s, inspect database connectivity, check workspace service health
  3. If `error_type=auth`: check auth service health, verify token validation is working, check for mass token expiry
  4. If `error_type=rate_limit`: check if a single user/bot is generating excessive requests; consider adjusting rate limit or blocking the source
  5. Verify the database is responsive: `SELECT 1` against the workspaces table
  6. Check for recent deployments that may have introduced a regression

**Alert: WorkspaceListSlowRequests**
- Condition: `histogram_quantile(0.95, codeplane_workspace_list_request_duration_seconds) > 3s` for 5 minutes
- Severity: Warning
- Runbook:
  1. Check database query performance: look for slow query logs on `listWorkspacesByRepo` and `countWorkspacesByRepo`
  2. Check if the parallel `Promise.all` for list + count is timing out on one leg
  3. Verify database connection pool is not exhausted
  4. Check for missing indexes on `workspaces(repository_id, user_id, created_at)`
  5. If load-related, check for unusual spikes in `codeplane_workspace_list_requests_total`
  6. Consider enabling query plan logging to identify full table scans

**Alert: WorkspaceSSEConnectionDrop**
- Condition: `rate(codeplane_workspace_sse_reconnections_total[5m]) > 10`
- Severity: Warning
- Runbook:
  1. Check SSE service health and PostgreSQL LISTEN/NOTIFY channel status
  2. Verify network stability between clients and server
  3. Check for proxy/load balancer timeouts that may be killing long-lived connections
  4. Inspect server memory for connection leak indicators
  5. Verify SSE channel names are being constructed correctly (UUID dash removal)
  6. Check if the issue correlates with server restarts or deployments

**Alert: WorkspaceActionConflictSpike**
- Condition: `rate(codeplane_workspace_action_total{status="conflict"}[5m]) > 5`
- Severity: Info
- Runbook:
  1. Check if multiple users/agents are managing the same workspaces concurrently
  2. Review workspace status transition logs for race conditions
  3. Verify the workspace service's status guard logic is correct
  4. If systematic, consider adding workspace locking or a queue for state transitions

### Error Cases and Failure Modes

| Error Case | Detection | User-Facing Recovery | Operational Recovery |
|------------|-----------|---------------------|---------------------|
| Network timeout on initial fetch | 30s timeout | Error state + "Press R to retry" | Check connectivity, server health |
| Network timeout on pagination | 30s timeout | Inline error, existing items remain | Same as above |
| Auth token expired (401) | API returns 401 | Redirect to auth error screen | Verify auth service, token validity |
| Rate limited (429) | API returns 429 + Retry-After | Inline error with countdown | Check for bot traffic, adjust limits |
| Server error (500+) | API returns 5xx | Generic error + retry | Check server logs, database health |
| Suspend/resume conflict (409) | API returns 409 | Optimistic revert + flash message | Check concurrent workspace operations |
| Delete fails | API returns non-2xx | Row reappears + error flash | Check workspace service, permissions |
| SSH info fetch fails | API returns non-2xx | Flash message | Check workspace VM status |
| Permission denied (403) | API returns 403 | Flash message "Permission denied." | Verify role assignments |
| SSE disconnect | EventSource error | Reconnect with exponential backoff (1s → 30s max) | Check SSE infrastructure |
| Malformed SSE event | JSON parse error | Silently ignored | Log at warn level for investigation |
| Clipboard write fails | System clipboard unavailable | SSH command shown inline | Expected in headless/SSH environments |
| Memory pressure (200+ items) | Pagination cap reached | "Showing first 200 of N" | Expected behavior; no action needed |
| Component crash | React error boundary | "Press r to restart / q to quit" | Investigate stack trace in logs |

## Verification

### API Integration Tests (`e2e/api/workspaces.test.ts`) — 27 tests

- **API-WS-001** `list-workspaces-empty-repo`: `GET /api/repos/:owner/:repo/workspaces` on a repo with no workspaces returns `200` with empty array and `X-Total-Count: 0`
- **API-WS-002** `list-workspaces-single`: Create one workspace, list returns array with one item matching all fields
- **API-WS-003** `list-workspaces-multiple`: Create 5 workspaces, list returns all 5 sorted by `created_at` descending
- **API-WS-004** `list-workspaces-default-pagination`: Create 35 workspaces, default list returns first 30 with `X-Total-Count: 35`
- **API-WS-005** `list-workspaces-custom-page-size`: `per_page=10` returns exactly 10 items
- **API-WS-006** `list-workspaces-page-2`: `page=2&per_page=10` with 15 workspaces returns items 11–15
- **API-WS-007** `list-workspaces-max-per-page`: `per_page=100` returns up to 100 items
- **API-WS-008** `list-workspaces-per-page-exceeds-max`: `per_page=101` returns HTTP 400
- **API-WS-009** `list-workspaces-invalid-page-zero`: `page=0` returns HTTP 400
- **API-WS-010** `list-workspaces-invalid-page-negative`: `page=-1` returns HTTP 400
- **API-WS-011** `list-workspaces-invalid-page-non-numeric`: `page=abc` returns HTTP 400
- **API-WS-012** `list-workspaces-invalid-per-page-zero`: `per_page=0` returns HTTP 400
- **API-WS-013** `list-workspaces-invalid-per-page-negative`: `per_page=-1` returns HTTP 400
- **API-WS-014** `list-workspaces-cursor-pagination`: `limit=10&cursor=10` returns items starting from offset 10
- **API-WS-015** `list-workspaces-unauthenticated`: Request without auth token returns HTTP 401
- **API-WS-016** `list-workspaces-nonexistent-repo`: Request for non-existent repo returns HTTP 404
- **API-WS-017** `list-workspaces-response-shape`: Verify every field in the response matches the `WorkspaceResponse` schema
- **API-WS-018** `list-workspaces-optional-fields-present`: Workspace with parent_workspace_id, ssh_host, and snapshot_id includes those fields
- **API-WS-019** `list-workspaces-optional-fields-absent`: Workspace without parent/ssh/snapshot omits those fields
- **API-WS-020** `list-workspaces-total-count-header`: Verify `X-Total-Count` header matches actual total
- **API-WS-021** `list-workspaces-iso8601-timestamps`: Verify timestamps are valid ISO-8601 strings
- **API-WS-022** `list-workspaces-user-isolation`: User A's workspaces not visible to User B (non-admin)
- **API-WS-023** `list-workspaces-after-delete`: Create workspace, delete it, list returns empty
- **API-WS-024** `list-workspaces-mixed-statuses`: Workspaces in various statuses all appear in list
- **API-WS-025** `list-workspaces-page-beyond-total`: `page=999` returns empty array
- **API-WS-026** `list-workspaces-concurrent-requests`: Two concurrent list requests return consistent results
- **API-WS-027** `list-workspaces-rate-limit`: Exceed 300 requests/minute returns 429 with Retry-After header

### CLI Integration Tests (`e2e/cli/workspaces.test.ts`) — 9 tests

- **CLI-WS-001** `workspace-list-default`: Outputs formatted table with workspace data
- **CLI-WS-002** `workspace-list-json`: `--json` outputs valid JSON array
- **CLI-WS-003** `workspace-list-empty`: Empty repo outputs "No workspaces found."
- **CLI-WS-004** `workspace-list-json-empty`: `--json` on empty repo outputs `[]`
- **CLI-WS-005** `workspace-list-limit`: `--limit 5` returns at most 5 items
- **CLI-WS-006** `workspace-list-page`: `--page 2 --limit 5` returns correct page
- **CLI-WS-007** `workspace-list-unauthenticated`: Without auth token, non-zero exit code
- **CLI-WS-008** `workspace-list-repo-inference`: Correctly infers repository from directory
- **CLI-WS-009** `workspace-list-invalid-repo`: Non-existent repo exits with error

### TUI Snapshot Tests (`e2e/tui/workspaces.test.ts`) — 19 tests

- **SNAP-WS-001** `workspace-list-screen-initial-load`: 120×40 snapshot matches golden file with header, toolbar, column headers, rows
- **SNAP-WS-002** `workspace-list-screen-empty-state`: Zero workspaces → "No workspaces found. Press `c` to create one."
- **SNAP-WS-003** `workspace-list-screen-loading-state`: Slow API → "Loading workspaces…" spinner
- **SNAP-WS-004** `workspace-list-screen-error-state`: Failed API → error + "Press R to retry"
- **SNAP-WS-005** `workspace-list-screen-focused-row`: First row highlighted
- **SNAP-WS-006** `workspace-list-screen-status-icons`: Correct colored icons per status
- **SNAP-WS-007** `workspace-list-screen-filter-active`: `/` focuses search input
- **SNAP-WS-008** `workspace-list-screen-filter-results`: Search narrows list
- **SNAP-WS-009** `workspace-list-screen-filter-no-results`: No match → filter empty message
- **SNAP-WS-010** `workspace-list-screen-status-filter`: `f` cycles to Running
- **SNAP-WS-011** `workspace-list-screen-pagination-loading`: "Loading more…" at bottom
- **SNAP-WS-012** `workspace-list-screen-header-total-count`: Correct "Workspaces (N)"
- **SNAP-WS-013** `workspace-list-screen-delete-confirmation`: Delete overlay with name
- **SNAP-WS-014** `workspace-list-screen-breadcrumb`: Correct breadcrumb
- **SNAP-WS-015** `workspace-list-screen-column-headers`: Visible at 120×40
- **SNAP-WS-016** `workspace-list-screen-selected-row`: "✓" prefix on Space
- **SNAP-WS-017** `workspace-list-screen-unnamed-workspace`: Null name → `<unnamed>`
- **SNAP-WS-018** `workspace-list-screen-idle-timeout-display`: Correct human-readable durations
- **SNAP-WS-019** `workspace-list-screen-suspended-status-text`: Correct label + color

### TUI Keyboard Interaction Tests — 44 tests

- **KEY-WS-001** through **KEY-WS-044**: Complete coverage of `j`/`k` movement, boundary behavior (no wrap), arrow key equivalence, `Enter` to open (including second item), `/` search focus, filter narrowing, case-insensitive filter, `Esc` priority chain (filter → overlay → pop), `G`/`g g` jump, `Ctrl+D`/`Ctrl+U` paging, `R` retry (error state only, no-op when loaded), `f` status filter cycling with wrap-around, `c` create navigation, `p` suspend (running only, no-op on other states), `r` resume (suspended only, no-op on other states), `d` delete with `y` confirm and `n` cancel, `S` SSH copy (running only), `Space` selection toggle, `q` back, input isolation (all navigation keys type into search when input focused), rapid keypress handling (15 sequential j presses), Enter during loading no-op, combined text+status filter, and delete overlay focus trap

### TUI Responsive Tests — 17 tests

- **RESP-WS-001** through **RESP-WS-017**: Coverage of 80×24 layout (minimal columns), truncation at minimum, hidden column headers at minimum, collapsed toolbar at minimum, delete overlay width at minimum (90%), 120×40 full layout and column headers, name truncation at standard, 200×60 expanded layout with ID column, resize transitions between all breakpoint pairs, focus preservation on resize, filter preservation on resize, resize during loading, resize with overlay, search input at minimum

### TUI Integration Tests — 24 tests

- **INT-WS-001** through **INT-WS-024**: Auth expiry (401 → auth error screen), rate limit (429 → inline message), network error → retry, pagination across multiple pages, 200-item cap with footer, navigation round-trip preserving state, goto-from-detail fresh render, server 500 error, optimistic suspend/resume and revert on failure, delete lifecycle (success, revert, last item), SSH copy for running/non-running, permission denied 403, SSE real-time update, SSE disconnect/reconnect reconciliation, deep-link entry, command palette entry, concurrent navigation stability, create-and-return refresh

### TUI Edge Case Tests — 16 tests

- **EDGE-WS-001** through **EDGE-WS-016**: No auth token, max-length workspace name (63 chars), Unicode grapheme-safe truncation, single workspace layout, concurrent resize + navigation, search with no matches, null name rendering, zero idle timeout ("—"), large idle timeout (86400s → "24h"), deleted user owner ("unknown"), rapid suspend dedupe, rapid delete dedupe (single overlay), network disconnect mid-pagination, clipboard unavailable, malformed SSE event, non-standard workspace ID format

**Total: 156 tests across API (27), CLI (9), and TUI (120) surfaces.**

**All tests must be left failing if the backend is unimplemented — never skipped or commented out.**

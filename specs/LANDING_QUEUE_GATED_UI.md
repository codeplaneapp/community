# LANDING_QUEUE_GATED_UI

Specification for LANDING_QUEUE_GATED_UI.

## High-Level User POV

When a team is actively developing across many repositories — or even intensely within a single repository — landing requests pile up in various stages: some are approved and waiting to merge, some are currently in the process of landing, and others recently completed. Today, users can only see the landing queue state from within a single repository's landing list or from an individual landing request's detail page. There is no unified view that answers the question: "What is happening across all my merge queues right now?"

The Landing Queue is a cross-repository dashboard that gives users a single, real-time view of all landing requests that are currently queued or actively landing. It surfaces the merge pipeline — the ordered list of landing requests waiting to be processed and the one currently being merged — for every repository the user has access to. This lets a developer, team lead, or platform engineer understand at a glance whether the merge pipeline is flowing smoothly, whether anything is stuck, and what order their changes will land in.

For individual contributors, the Landing Queue answers "Where is my landing request in the queue?" without forcing them to navigate to each repository individually. For team leads and platform engineers, it answers "Are any merge queues backed up?" and "Did anything fail during landing?" — questions that are critical for unblocking teams and maintaining velocity.

The Landing Queue is gated behind the `landing_queue` feature flag. When the flag is disabled, the route is not accessible — users are redirected away and the navigation entry point is hidden. When the flag is enabled, the queue appears as a top-level navigation item, giving it the prominence it deserves as a cross-cutting operational view.

The queue updates in near-real-time. As landing requests transition through `queued → landing → merged` (or encounter errors), the dashboard reflects these state changes without requiring a manual refresh. Users can filter by repository, by state (queued, landing, recently merged, errored), and drill through to the landing request detail page for any item in the queue.

This feature is designed for both human-driven and agent-augmented workflows. Agents that create landing requests from automated issue resolution flows produce entries in the queue just like human-authored ones, and the queue gives visibility into the full pipeline regardless of who initiated the work.

## Acceptance Criteria

### Definition of Done

- [ ] A global Landing Queue page is accessible at `/landings/queue` in the web UI when the `landing_queue` feature flag is enabled.
- [ ] The page displays a cross-repository list of all landing requests in `queued` or `landing` state that the current user has read access to.
- [ ] Each queue entry shows: queue position (per-repository), repository owner/name, landing request number, title, author, target bookmark, stack size, time since queued, and current state (`queued` or `landing`).
- [ ] The page includes a "Recently Landed" section showing landing requests that transitioned to `merged` within the last 24 hours, with a completion timestamp.
- [ ] The page includes an "Errored" section showing landing tasks that failed, with the last error message visible.
- [ ] Users can filter the queue by repository (dropdown or search-select) to narrow to a single repo's queue.
- [ ] Users can filter by state: All Active (queued + landing), Queued Only, Landing Only, Recently Landed, Errored.
- [ ] The queue updates in near-real-time via SSE without requiring manual page refresh.
- [ ] Clicking any landing request entry navigates to the landing request detail page (`/:owner/:repo/landings/:number`).
- [ ] Clicking any repository name navigates to the repository landing list (`/:owner/:repo/landings`).
- [ ] When the `landing_queue` feature flag is disabled, navigating to `/landings/queue` redirects to the dashboard (`/`).
- [ ] When the feature flag is disabled, the "Landing Queue" navigation entry is hidden from the sidebar.
- [ ] The page gracefully handles an empty queue state with a descriptive empty message.
- [ ] The API endpoint powering this view returns only landing requests in repositories the authenticated user has at least read access to.
- [ ] The CLI provides a `codeplane land queue` command that lists the current global queue in tabular or JSON format.
- [ ] The TUI provides a Landing Queue screen reachable via `g q` or `:queue` command palette entry.

### Edge Cases

- [ ] A user with access to zero repositories sees an empty queue with the message "No landing requests in queue" rather than an error.
- [ ] A user who loses read access to a repository mid-session no longer sees that repo's queue entries on the next data refresh.
- [ ] A landing request that transitions from `queued` to `landing` to `merged` in rapid succession (within the SSE update window) displays each intermediate state or the final `merged` state without visual glitches.
- [ ] A landing request that transitions from `queued` to `errored` displays the error inline with a human-readable message (not a raw stack trace).
- [ ] A repository with 50+ queued landing requests displays all entries with correct per-repository queue positions (1 through N).
- [ ] Two repositories with independent queues show independent position numbering (both start at 1).
- [ ] A landing task with `last_error` longer than 500 characters truncates the error display with an expand/collapse affordance.
- [ ] An errored landing task with zero retry attempts shows "No retries attempted" rather than leaving the retry count blank.
- [ ] The "Recently Landed" section caps at 50 items; repositories with extremely high merge throughput do not produce unbounded lists.
- [ ] An unauthenticated user accessing `/landings/queue` is redirected to the login page.
- [ ] A user with only anonymous/public access does not see the queue (the queue is an authenticated-only surface).
- [ ] Unicode and emoji in landing request titles, repository names, and author names render correctly.
- [ ] The empty state for "Errored" and "Recently Landed" each show their own tailored message rather than a generic empty state.
- [ ] When the landing queue mode for a repository is `parallel`, multiple landing requests can show `state: landing` simultaneously; the queue position column for those displays "—" (dash) since order is not meaningful in parallel mode.
- [ ] When there are 0 errored tasks and 0 recently landed items, those sections are collapsed by default (not taking up vertical space).

### Boundary Constraints

| Field | Min | Max | Notes |
|---|---|---|---|
| Queue items per page | 1 | 200 | Default 100 |
| Recently Landed lookback | — | 24 hours | Configurable per-user in future |
| Recently Landed max items | — | 50 | Hard cap per page |
| Errored tasks max items | — | 50 | Hard cap per page |
| Repository filter search | 1 char | 255 chars | Substring match, case-insensitive |
| `last_error` display | 0 chars | 500 chars truncated | Full text available on expand |
| Queue position | 1 | Unbounded | Integer, per-repository |
| SSE reconnect interval | — | 5 seconds | Exponential backoff on failure |

## Design

### Web UI Design

#### Route

`/landings/queue`

This is a global route (not repository-scoped). It appears in the main application sidebar under a "Landing Queue" entry with a queue/pipeline icon.

#### Feature Flag Gating

The route is wrapped in a `FlaggedRoute` component that checks the `landing_queue` feature flag. When disabled:
- The sidebar entry is hidden.
- Direct navigation to `/landings/queue` redirects to `/` with no error message.
- Deep links to the page from external sources (bookmarks, shared URLs) also redirect.

#### Page Layout

**Header:**
- Title: "Landing Queue" in bold, large text.
- Subtitle: "Active merge queue across your repositories" in muted text.
- Total count badge: "N active" showing the sum of queued + landing items.

**Filter Bar:**
- **Repository filter**: A searchable dropdown (combobox) defaulting to "All repositories". Typing filters the dropdown by substring match against `owner/repo`. Selecting a repository narrows the queue to that repo only.
- **State filter**: Segmented control with options: "Active" (default, shows queued + landing), "Queued", "Landing", "Recently Landed", "Errored".
- **Refresh indicator**: A subtle timestamp showing "Updated 3s ago" that ticks up and resets on each SSE update.

**Active Queue Section:**

A table with the following columns:

| Column | Width | Description |
|---|---|---|
| Position | 60px fixed | Per-repo queue position as `#N` or `—` for parallel mode |
| Repository | 180px min | `owner/repo` as a linked chip |
| Landing | 80px fixed | `#N` linked to detail page |
| Title | Flexible (fill) | Landing request title, truncated with ellipsis |
| Author | 120px | Avatar + username |
| Target | 100px | Bookmark name with `→` prefix |
| Stack | 60px | "N changes" |
| State | 80px | Colored badge: `Queued` (yellow) or `Landing` (yellow/animated) |
| Queued | 100px | Relative time since `queued_at` (e.g., "3m ago") |

Rows are sorted by: repository name ascending, then queue position ascending (within each repo).

When a repository name appears more than once, the repository column merges visually into a group header row showing the repo name and queue mode (serialized/parallel), with individual landing rows indented below.

**Recently Landed Section:**

Collapsed by default if empty. When populated, shows a collapsible section with a table:

| Column | Description |
|---|---|
| Repository | `owner/repo` linked |
| Landing | `#N` linked |
| Title | Truncated title |
| Author | Avatar + username |
| Landed | Relative timestamp of `merged_at` |
| Duration | Time from `queued_at` to `merged_at` |

Sorted by `merged_at` descending (most recently landed first).

**Errored Section:**

Collapsed by default if empty. Shows a warning-colored section header with count. Each errored entry shows:

| Column | Description |
|---|---|
| Repository | `owner/repo` linked |
| Landing | `#N` linked |
| Title | Truncated title |
| Error | Truncated `last_error` with expand toggle |
| Attempts | Retry attempt count |
| Failed | Relative timestamp of `finished_at` |

Each errored row has a "Retry" button (visible to users with write access to the repository).

**Empty States:**
- No active queue items: "No landing requests are currently queued for merge. When you or your teammates queue a landing request, it will appear here."
- No recently landed: Section is hidden entirely.
- No errored tasks: Section is hidden entirely.
- No items at all (all sections empty): Full-page empty state with the message above and a link to "Browse repositories" pointing to the user's repository list.

#### Keyboard Shortcuts

| Key | Action |
|---|---|
| `j` / `Down` | Move focus to next queue entry |
| `k` / `Up` | Move focus to previous queue entry |
| `Enter` | Navigate to focused landing request detail |
| `o` | Navigate to focused landing request's repository landings page |
| `/` | Focus the repository filter search |
| `Esc` | Clear filter / close overlay |
| `1` | Switch to Active filter |
| `2` | Switch to Queued filter |
| `3` | Switch to Landing filter |
| `4` | Switch to Recently Landed filter |
| `5` | Switch to Errored filter |

### API Shape

#### Global Landing Queue Endpoint

**Endpoint:** `GET /api/landings/queue`

**Authentication:** Required. Returns 401 if unauthenticated.

**Feature Flag:** Gated behind `landing_queue`. Returns 403 with `{ message: "Feature not available" }` if disabled.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `state` | string | `active` | Filter: `active` (queued+landing), `queued`, `landing`, `recently_landed`, `errored` |
| `repo` | string | — | Optional `owner/repo` filter |
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 100 | Items per page (max 200) |

**Response (200):**

```json
{
  "items": [
    {
      "queue_position": 1,
      "repository": {
        "id": 42,
        "owner": "acme",
        "name": "backend",
        "landing_queue_mode": "serialized"
      },
      "landing_request": {
        "number": 37,
        "title": "Add user authentication",
        "state": "queued",
        "author": { "id": 5, "login": "alice" },
        "target_bookmark": "main",
        "stack_size": 3,
        "change_ids": ["abc123", "def456", "ghi789"],
        "conflict_status": "clean",
        "queued_at": "2026-03-22T10:30:00Z",
        "queued_by": { "id": 5, "login": "alice" }
      },
      "task": {
        "id": 101,
        "status": "pending",
        "priority": 1,
        "attempt": 0,
        "last_error": null,
        "started_at": null,
        "finished_at": null,
        "created_at": "2026-03-22T10:30:00Z"
      }
    }
  ],
  "total": 12
}
```

**Response Headers:**
- `X-Total-Count`: Total matching items.
- `Link`: RFC 5988 pagination relations.

**Error Responses:**
- `400`: Invalid query parameters.
- `401`: Not authenticated.
- `403`: Feature flag disabled.

#### Landing Queue SSE Stream

**Endpoint:** `GET /api/landings/queue/stream`

**Authentication:** Required (SSE ticket or session cookie).

**Events:**

| Event | Data | Description |
|---|---|---|
| `queue:enqueued` | `{ repository, landing_request, task, queue_position }` | New landing request queued |
| `queue:landing_started` | `{ repository, landing_request, task }` | Merge started |
| `queue:landed` | `{ repository, landing_request, merged_at, duration_seconds }` | Landing completed |
| `queue:errored` | `{ repository, landing_request, task, last_error }` | Task failed |
| `queue:position_changed` | `{ repository, landing_request, old_position, new_position }` | Position shifted |
| `queue:retried` | `{ repository, landing_request, task, attempt }` | Errored task retried |

Events are filtered per-user based on repository access.

### CLI Command

**Command:** `codeplane land queue`

**Aliases:** `codeplane lr queue`

**Flags:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--repo`, `-R` | string | — | Filter to specific `owner/repo` |
| `--state` | string | `active` | Filter: `active`, `queued`, `landing`, `recently_landed`, `errored` |
| `--json` | boolean | false | Output as JSON |
| `--limit` | integer | 30 | Max items to display |

**Table Output:**

```
LANDING QUEUE

Repository       Landing  Title                      State    Position  Queued
acme/backend     #37      Add user authentication    queued   1         3m ago
acme/backend     #35      Fix error handling         queued   2         12m ago
acme/frontend    #102     Update dashboard           landing  —         1h ago
```

### TUI Screen

**Navigation:** `g q` from any screen, or `:queue` in command palette.

**Layout:**
- Title: "Landing Queue (N active)" in primary color
- Filter toolbar: state filter cyclable with `f`, repo filter with `/`
- Table rows with vim-style navigation (`j`/`k`, `Enter` to drill into detail)

**Keyboard:** `j`/`k` navigate, `Enter` opens detail, `f` cycles state filter, `/` focuses repo filter, `r` retries errored task, `q` pops screen, `R` force refreshes.

**Responsive columns:** Follow the same responsive breakpoint pattern as the TUI Landing List screen (80×24 minimal → 120×40 standard → 200×60 full).

### Documentation

- **Web UI guide section**: "Using the Landing Queue" — accessing from sidebar, column meanings, filtering, real-time updates.
- **CLI reference entry**: `codeplane land queue` with flag descriptions, example output, and common usage patterns.
- **TUI help entry**: Landing Queue screen description in the TUI keyboard help overlay.
- **Concepts page update**: Update "Landing Requests" concepts to mention the global queue view.
- **Admin guide section**: Note the `landing_queue` feature flag and how to disable via environment variable.

## Permissions & Security

### Authorization Matrix

| Action | Anonymous | Read-Only | Member (Write) | Admin | Owner |
|---|---|---|---|---|---|
| View landing queue page | ❌ | ✅ (own repos) | ✅ (own repos) | ✅ (own repos) | ✅ (all repos) |
| View queue SSE stream | ❌ | ✅ (own repos) | ✅ (own repos) | ✅ (own repos) | ✅ (all repos) |
| Retry errored task | ❌ | ❌ | ✅ | ✅ | ✅ |
| Access CLI `land queue` | ❌ | ✅ (own repos) | ✅ (own repos) | ✅ (own repos) | ✅ (all repos) |

"Own repos" means repositories where the user has at least read-level access (via direct collaborator permission, team membership, or organization membership). Private repositories the user cannot access are never included in queue results.

Site-level administrators (the Owner column) can see the global queue across all repositories for operational monitoring.

### Rate Limiting

| Endpoint | Rate Limit | Window |
|---|---|---|
| `GET /api/landings/queue` | 60 requests | per minute per user |
| `GET /api/landings/queue/stream` | 5 connections | concurrent per user |
| `POST /api/landings/queue/:task_id/retry` | 10 requests | per minute per user |

### Data Privacy

- The queue endpoint must never return landing request data for repositories the user cannot access. Authorization filtering is applied at the database query level, not post-fetch.
- Error messages from `last_error` may contain internal server details. These must be sanitized before exposure in the API response — strip file paths, stack traces, and internal hostnames. Show only the user-facing error classification (e.g., "Merge conflict detected", "Protected bookmark check failed", "Runner unavailable").
- The SSE stream must not leak event data for repositories the user has lost access to mid-stream. Re-evaluate access on each event emission.
- No PII beyond username and user ID is exposed in queue responses. Email addresses, IP addresses, and other sensitive fields are never included.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `landing_queue.viewed` | User loads the landing queue page | `user_id`, `client` (web/cli/tui), `total_active_count`, `filter_state`, `filter_repo` (if set) |
| `landing_queue.filtered` | User changes a filter | `user_id`, `client`, `filter_type` (state/repo), `filter_value`, `result_count` |
| `landing_queue.entry_clicked` | User navigates to a landing detail from the queue | `user_id`, `client`, `repo_id`, `landing_number`, `entry_state` |
| `landing_queue.repo_clicked` | User navigates to a repository from the queue | `user_id`, `client`, `repo_id` |
| `landing_queue.errored_task_retried` | User retries an errored task from the queue | `user_id`, `client`, `repo_id`, `landing_number`, `task_id`, `attempt_number` |
| `landing_queue.sse_connected` | SSE stream connection established | `user_id`, `client` |
| `landing_queue.sse_reconnected` | SSE stream reconnected after disconnect | `user_id`, `client`, `disconnect_duration_seconds` |
| `landing_queue.empty_state_seen` | User sees the empty queue state | `user_id`, `client` |

### Funnel Metrics

1. **Queue View → Landing Detail drillthrough rate**: % of queue page views that result in at least one landing detail click. Target: >30%. Indicates the queue is providing useful navigation.
2. **Queue View → Error Retry rate**: % of queue views with errored items where a retry action is taken. Target: >40% within 15 minutes of error appearance.
3. **Repeat usage rate**: % of users who view the landing queue on >3 distinct days within a 14-day window. Target: >20% of active users.
4. **SSE adoption rate**: % of queue page sessions where an SSE connection is established and maintained for >30 seconds. Target: >80%.
5. **Time-to-merge visibility**: Track median time between `landing_queue.viewed` and the viewed landing requests transitioning to `merged`.
6. **Feature flag adoption**: % of instances with `landing_queue` enabled. Target: >90% of CE deployments.

## Observability

### Logging Requirements

| Event | Log Level | Structured Context | Purpose |
|---|---|---|---|
| Queue page loaded | INFO | `user_id`, `filter_state`, `filter_repo`, `result_count` | Usage tracking |
| Queue SSE connection opened | INFO | `user_id`, `connection_id` | Connection lifecycle |
| Queue SSE connection closed | INFO | `user_id`, `connection_id`, `duration_seconds`, `events_sent` | Connection lifecycle |
| Queue SSE event emitted | DEBUG | `event_type`, `repo_id`, `landing_number`, `recipients_count` | Debug event delivery |
| Queue API query slow (>1s) | WARN | `user_id`, `filter_state`, `filter_repo`, `duration_ms`, `result_count` | Performance degradation |
| Queue access denied (private repo filtered) | DEBUG | `user_id`, `repo_id` | Security audit |
| Queue feature flag check failed | INFO | `user_id`, `endpoint` | Feature gating audit |
| Errored task retry requested | INFO | `user_id`, `repo_id`, `landing_number`, `task_id`, `attempt` | Operational audit |
| Errored task retry failed | WARN | `user_id`, `task_id`, `error` | Operational issue |
| Queue query authorization error | WARN | `user_id`, `error` | Security concern |
| Queue SSE backpressure (>100 pending events) | WARN | `connection_id`, `pending_count` | Performance concern |

### Prometheus Metrics

**Counters:**
- `codeplane_landing_queue_views_total{client, filter_state}` — Total queue page loads.
- `codeplane_landing_queue_drillthrough_total{client, target}` — Clicks through to landing detail or repo.
- `codeplane_landing_queue_retries_total{repo_id, result}` — Task retry attempts.
- `codeplane_landing_queue_sse_connections_total{client}` — Total SSE connections opened.
- `codeplane_landing_queue_sse_events_total{event_type}` — Total SSE events emitted.
- `codeplane_landing_queue_errors_total{endpoint, error_type}` — API errors by type.

**Histograms:**
- `codeplane_landing_queue_response_time_seconds{endpoint}` — API response latency. Buckets: 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s.
- `codeplane_landing_queue_sse_connection_duration_seconds` — SSE connection duration. Buckets: 10s, 30s, 1m, 5m, 15m, 30m, 1h.
- `codeplane_landing_queue_result_count{filter_state}` — Number of items returned per query. Buckets: 0, 1, 5, 10, 25, 50, 100, 200.

**Gauges:**
- `codeplane_landing_queue_active_sse_connections` — Current open SSE connections.
- `codeplane_landing_queue_depth_total` — Global total of queued + landing tasks.
- `codeplane_landing_queue_errored_total` — Global total of errored tasks.

### Alerts

#### Alert: LandingQueueEndpointDown
- **Condition**: `rate(codeplane_landing_queue_errors_total{error_type="500"}[5m]) > 0.1`
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for errors matching `landing_queue` in the structured context.
  2. Verify database connectivity — the queue query joins landing_requests, landing_tasks, and repositories tables.
  3. Check if recent schema migrations have affected the landing_tasks or landing_requests tables.
  4. If the error is authorization-related, verify the user resolution query is not failing.
  5. Restart the server process if the issue is a transient connection pool exhaustion.
  6. If systemic, roll back the most recent deployment.

#### Alert: LandingQueueLatencyHigh
- **Condition**: `histogram_quantile(0.95, codeplane_landing_queue_response_time_seconds{endpoint="GET_queue"}) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check the database query plan for the queue query — missing indexes on `landing_tasks.status` or `landing_requests.state` are likely causes.
  2. Check if the user has access to an unusually large number of repositories (>500).
  3. Look for lock contention on the `landing_tasks` table from concurrent `claimPendingLandingTask` operations.
  4. Check server CPU and memory.
  5. Consider adding a database index on `(status, created_at)` for the `landing_tasks` table.

#### Alert: LandingQueueSSEConnectionsHigh
- **Condition**: `codeplane_landing_queue_active_sse_connections > 500`
- **Severity**: Warning
- **Runbook**:
  1. Verify connection count correlates with active user count.
  2. Check for SSE connection leaks (connections with 0 events sent in 5 minutes).
  3. Verify SSE heartbeat mechanism and idle cleanup.
  4. Check for single-user reconnection loops.
  5. Enforce per-user connection limits (spec'd at 5 concurrent).

#### Alert: LandingQueueGlobalDepthHigh
- **Condition**: `codeplane_landing_queue_depth_total > 100` sustained for >15 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check if the landing task worker/consumer is running.
  2. Verify worker process has not crashed.
  3. Check for a repository with disproportionately large queue.
  4. Check for lock contention on landing_tasks.
  5. Manually inspect the oldest pending task.

#### Alert: LandingQueueErroredTasksAccumulating
- **Condition**: `codeplane_landing_queue_errored_total > 10` sustained for >30 minutes
- **Severity**: Warning
- **Runbook**:
  1. Query errored tasks and look for `last_error` patterns.
  2. Common causes: merge conflicts, runner disk full, protected bookmark config changes, jj subprocess crashes.
  3. If all errors are merge conflicts: consider enabling parallel queue mode or rebasing.
  4. If infrastructure-related: check runner health, disk, jj binary availability.
  5. Decide per-task whether to retry or manually dequeue.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Unauthenticated access | 401 | "Please log in to view the landing queue." | Redirect to login |
| Feature flag disabled | 403 | "Landing queue feature is not available." | Admin must enable flag |
| Invalid state filter value | 400 | "Invalid state filter. Must be one of: active, queued, landing, recently_landed, errored." | Fix query parameter |
| Invalid pagination parameters | 400 | "Invalid pagination parameters." | Fix query parameters |
| Database query timeout | 500 | "Unable to load the landing queue. Please try again." | Auto-retry after 5s |
| SSE connection dropped | — | (Client-side) Reconnect silently with backoff | Automatic |
| No repositories accessible | 200 | Empty items array, empty state UI | Informational only |
| Retry on non-errored task | 409 | "This task is not in an errored state." | No action needed |
| Retry without write access | 403 | "You do not have permission to retry this task." | Contact repo admin |

## Verification

### API Integration Tests

- [ ] `GET /api/landings/queue` returns 401 when unauthenticated.
- [ ] `GET /api/landings/queue` returns 403 when `landing_queue` feature flag is disabled.
- [ ] `GET /api/landings/queue` returns 200 with empty `items` array when no landing requests are queued.
- [ ] `GET /api/landings/queue` returns only landing requests in repositories the authenticated user has read access to.
- [ ] `GET /api/landings/queue` does not return landing requests from private repositories the user cannot access.
- [ ] `GET /api/landings/queue` with `state=active` returns items with state `queued` or `landing` only.
- [ ] `GET /api/landings/queue` with `state=queued` returns items with state `queued` only.
- [ ] `GET /api/landings/queue` with `state=landing` returns items with state `landing` only.
- [ ] `GET /api/landings/queue` with `state=recently_landed` returns items that transitioned to `merged` within the last 24 hours.
- [ ] `GET /api/landings/queue` with `state=errored` returns only tasks with errored status.
- [ ] `GET /api/landings/queue` with `state=invalid_value` returns 400.
- [ ] `GET /api/landings/queue` with `repo=acme/backend` filters results to only that repository.
- [ ] `GET /api/landings/queue` with `repo=nonexistent/repo` returns 200 with empty items (not 404).
- [ ] `GET /api/landings/queue` with `repo=private/repo` where user lacks access returns 200 with empty items.
- [ ] `GET /api/landings/queue` with `page=1&per_page=5` returns at most 5 items with correct `X-Total-Count`.
- [ ] `GET /api/landings/queue` with `per_page=201` returns 400 ("per_page must not exceed 200").
- [ ] `GET /api/landings/queue` with `per_page=200` (maximum valid) returns up to 200 items.
- [ ] `GET /api/landings/queue` with `per_page=0` returns 400.
- [ ] `GET /api/landings/queue` with `page=0` returns 400.
- [ ] `GET /api/landings/queue` with `per_page=-1` returns 400.
- [ ] `GET /api/landings/queue` with `page=abc` returns 400.
- [ ] `GET /api/landings/queue` returns items sorted by repository name ascending, then queue position ascending.
- [ ] `GET /api/landings/queue` includes correct `queue_position` per repository (1-indexed, contiguous).
- [ ] `GET /api/landings/queue` returns `queue_position: null` for items in repositories with `landing_queue_mode: "parallel"` when state is `landing`.
- [ ] `GET /api/landings/queue` includes `task.last_error` sanitized (no file paths or stack traces).
- [ ] `GET /api/landings/queue` includes `Link` header with correct pagination relations.
- [ ] `GET /api/landings/queue` where user is site admin returns items from all repositories.
- [ ] `GET /api/landings/queue` response `items[].landing_request` includes all required fields: `number`, `title`, `state`, `author`, `target_bookmark`, `stack_size`, `change_ids`, `conflict_status`, `queued_at`, `queued_by`.
- [ ] `GET /api/landings/queue` response `items[].repository` includes `id`, `owner`, `name`, `landing_queue_mode`.
- [ ] `GET /api/landings/queue` response `items[].task` includes `id`, `status`, `priority`, `attempt`, `last_error`, `started_at`, `finished_at`, `created_at`.

### SSE Stream Tests

- [ ] `GET /api/landings/queue/stream` returns 401 when unauthenticated.
- [ ] `GET /api/landings/queue/stream` returns 403 when feature flag is disabled.
- [ ] `GET /api/landings/queue/stream` establishes an SSE connection and emits a `queue:enqueued` event when a landing request is queued.
- [ ] SSE stream emits `queue:landing_started` when a task is claimed.
- [ ] SSE stream emits `queue:landed` when a task completes successfully.
- [ ] SSE stream emits `queue:errored` when a task fails.
- [ ] SSE stream emits `queue:position_changed` when a queue item is removed (positions shift).
- [ ] SSE stream does not emit events for repositories the user cannot access.
- [ ] SSE stream continues delivering events after a user gains access to a new repository.
- [ ] SSE stream stops delivering events for a repository after the user loses access.
- [ ] SSE connection is dropped and cleaned up after idle timeout (no events for 30 minutes).
- [ ] Multiple concurrent SSE connections from the same user are allowed up to the limit (5).
- [ ] The 6th concurrent SSE connection from the same user is rejected with 429.

### Retry Endpoint Tests

- [ ] `POST /api/landings/queue/:task_id/retry` returns 401 when unauthenticated.
- [ ] `POST /api/landings/queue/:task_id/retry` returns 403 when the user lacks write access to the task's repository.
- [ ] `POST /api/landings/queue/:task_id/retry` returns 404 when the task ID does not exist.
- [ ] `POST /api/landings/queue/:task_id/retry` returns 409 when the task is not in errored status.
- [ ] `POST /api/landings/queue/:task_id/retry` resets the task to `pending` status and increments the attempt counter.
- [ ] `POST /api/landings/queue/:task_id/retry` returns 200 with the updated task object.
- [ ] `POST /api/landings/queue/:task_id/retry` is rate-limited to 10 requests per minute per user.

### CLI Tests

- [ ] `codeplane land queue` without authentication prints an auth error and exits 1.
- [ ] `codeplane land queue` with authentication prints a formatted table of active queue items.
- [ ] `codeplane land queue` with no active items prints "No landing requests in queue." and exits 0.
- [ ] `codeplane land queue --json` outputs valid JSON matching the API response schema.
- [ ] `codeplane land queue --repo acme/backend` filters results to the specified repository.
- [ ] `codeplane land queue --state queued` shows only queued items.
- [ ] `codeplane land queue --state recently_landed` shows only recently landed items.
- [ ] `codeplane land queue --state errored` shows only errored items.
- [ ] `codeplane land queue --state invalid` prints an error message and exits 1.
- [ ] `codeplane land queue --limit 5` shows at most 5 items.
- [ ] `codeplane land queue --limit 0` prints an error and exits 1.
- [ ] `codeplane land queue --json --repo acme/backend --state queued` correctly combines all filters in JSON output.
- [ ] `codeplane land queue` table columns align correctly with Unicode characters in titles.
- [ ] `codeplane land queue` table correctly truncates titles longer than the terminal width.

### Web UI E2E Tests (Playwright)

- [ ] Navigate to `/landings/queue` when logged in and `landing_queue` flag is enabled — page loads with "Landing Queue" heading.
- [ ] Navigate to `/landings/queue` when not logged in — redirected to login page.
- [ ] Navigate to `/landings/queue` when `landing_queue` flag is disabled — redirected to `/`.
- [ ] Sidebar shows "Landing Queue" entry when flag is enabled.
- [ ] Sidebar does not show "Landing Queue" entry when flag is disabled.
- [ ] With 3 queued landing requests across 2 repos, all 3 appear in the active queue table with correct positions.
- [ ] Repository group headers display the repo name and queue mode.
- [ ] Clicking a landing request number navigates to `/:owner/:repo/landings/:number`.
- [ ] Clicking a repository name navigates to `/:owner/:repo/landings`.
- [ ] Selecting "Queued" in the state filter shows only queued items.
- [ ] Selecting "Recently Landed" shows items with `merged_at` within the last 24 hours.
- [ ] Selecting "Errored" shows items with task errors and displays truncated error messages.
- [ ] Typing in the repository filter narrows results to matching repositories.
- [ ] Clearing the repository filter restores the full cross-repo view.
- [ ] The "Recently Landed" section is collapsed/hidden when empty.
- [ ] The "Errored" section is collapsed/hidden when empty.
- [ ] Empty state message appears when there are no queue items at all.
- [ ] The "Retry" button appears on errored rows for users with write access.
- [ ] The "Retry" button does not appear for users with only read access.
- [ ] Clicking "Retry" triggers a retry and removes the item from the errored section.
- [ ] Keyboard shortcut `j` moves focus to the next row.
- [ ] Keyboard shortcut `k` moves focus to the previous row.
- [ ] Keyboard shortcut `Enter` on a focused row navigates to the landing detail page.
- [ ] Keyboard shortcut `/` focuses the repository filter input.
- [ ] Keyboard shortcuts `1`–`5` switch state filter tabs.
- [ ] The page updates in real-time when a new landing request is queued.
- [ ] The page updates in real-time when a queued item transitions to `landing` state.
- [ ] The page updates in real-time when a landing item transitions to `merged` and moves to Recently Landed.
- [ ] The "Updated X ago" indicator resets on each SSE update.
- [ ] A landing request title with 255 characters (maximum) renders correctly with truncation.
- [ ] A landing request title with Unicode/emoji characters renders correctly.
- [ ] A repository with 50 queued items displays all with correct queue positions 1–50.

### TUI E2E Tests

- [ ] `g q` navigates to the Landing Queue screen from the dashboard.
- [ ] `:queue` in the command palette opens the Landing Queue screen.
- [ ] The Landing Queue screen displays active queue items with correct columns.
- [ ] `j`/`k` navigation moves focus between queue entries.
- [ ] `Enter` on a focused entry navigates to the landing detail screen.
- [ ] `f` cycles the state filter through Active → Queued → Landing → Recently Landed → Errored → Active.
- [ ] `q` pops the Landing Queue screen.
- [ ] `R` triggers a manual refresh of the queue data.
- [ ] Empty state displays "No landing requests in queue." message.
- [ ] At 80×24 terminal size, only essential columns (number, title, state) are shown.
- [ ] At 120×40 terminal size, additional columns (repo, author, position) appear.

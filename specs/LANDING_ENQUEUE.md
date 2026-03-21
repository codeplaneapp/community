# LANDING_ENQUEUE

Specification for LANDING_ENQUEUE.

## High-Level User POV

When a contributor finishes reviewing a landing request and is satisfied that it is ready to merge, they need a way to signal "this should be merged now." In Codeplane, this action is called **enqueueing a landing request for merge**. Rather than performing an immediate, synchronous merge that blocks the user and risks race conditions with other concurrent landings, Codeplane places the landing request into a **per-repository merge queue** that processes landings serially, ensuring each merge is applied cleanly against the latest repository state.

From the user's perspective, the flow is simple: they open a landing request, confirm it meets the project's requirements — approved reviews, clean conflict status, passing checks — and click **Queue for Merge** (or run `codeplane land land <number>` from the CLI). Codeplane immediately confirms the action with a queue position number ("Queued for merge at position 3"), and the landing request's state badge transitions from "Open" to "Queued" with a distinctive yellow indicator.

Once queued, the user can see their landing request's position in the queue and monitor its progress. The queue processes one landing at a time per repository, so each merge happens against the true latest state of the target bookmark, eliminating "merge skew" where two landing requests pass checks against the same base but produce conflicts when both land. If a queued landing fails to merge — because a conflict emerged or a check failed against the rebased state — the user is notified and the landing request returns to a state where they can address the issue and re-enqueue.

This queue-based approach is especially valuable for teams using jj's stacked change model, where landing a stack of ordered changes must happen atomically and in the correct sequence. The merge queue ensures that each stack lands as a coherent unit against the current bookmark tip.

The enqueue action is available consistently across all Codeplane clients: as a button in the web UI, a CLI command, a keyboard action in the TUI, and through editor integration commands. Regardless of which client triggers the enqueue, the user sees the same feedback — confirmation of the queue position and the landing request's transition to the "Queued" state.

## Acceptance Criteria

### Definition of Done

- [ ] A user with write access can enqueue an open, conflict-clean landing request for merge from the web UI, CLI, TUI, and editor integrations.
- [ ] The enqueue action transitions the landing request state from `open` to `queued` atomically.
- [ ] The enqueue response includes a `queue_position` (1-based integer) and a `task_id` (string identifier for the landing task).
- [ ] The queue position reflects the landing request's position among all pending and running landing tasks for the same repository.
- [ ] Per-repository serialization is enforced: only one landing task is in the `running` state at a time per repository.
- [ ] The landing request detail view (web, CLI, TUI) displays the queue position when the landing request is in the `queued` state.
- [ ] The landing request state badge displays as yellow "Queued" across all clients when the landing request is enqueued.
- [ ] Protected bookmark approval requirements are validated before enqueue — if insufficient approvals exist, the enqueue is rejected with a clear message indicating the shortfall.
- [ ] A landing request with zero change IDs cannot be enqueued; the action is rejected with a validation error.
- [ ] A landing request that is not in the `open` state cannot be enqueued; the action is rejected with a conflict error.
- [ ] Concurrent enqueue attempts on the same landing request are handled safely: the first succeeds, subsequent attempts receive a conflict error because the state is no longer `open`.
- [ ] The enqueue action records the `queued_by` user and `queued_at` timestamp on the landing request.
- [ ] A landing task record is created with status `pending`, priority `1`, and attempt count `0`.
- [ ] The `landing_detail.merge_queued` telemetry event fires on successful enqueue with all required properties.
- [ ] The `codeplane_landing_merges_queued_total` Prometheus counter increments on successful enqueue.
- [ ] The `codeplane_landing_merge_queue_depth` gauge reflects the current queue depth per repository.
- [ ] Failed enqueue attempts (blocked by conflicts, approvals, or invalid state) are logged at WARN level with structured context.
- [ ] Rate limiting is enforced at 10 requests per minute per user for the enqueue endpoint.

### Edge Cases

- [ ] Enqueueing a landing request that was closed between the user opening the detail page and clicking "Queue for Merge" returns a 409 conflict error with a clear message ("Landing request is not open").
- [ ] Enqueueing a landing request that was already enqueued by another user (race condition) returns a 409 conflict error.
- [ ] Enqueueing a landing request whose target bookmark has a protected bookmark rule requiring 3 approvals, where only 2 exist, returns a 409 with message specifying "2 of 3 required approvals met."
- [ ] Enqueueing a landing request whose target bookmark matches multiple protected bookmark glob patterns uses the highest approval requirement among all matching rules.
- [ ] Enqueueing a landing request with exactly 1 change ID succeeds.
- [ ] Enqueueing a landing request with exactly 500 change IDs (maximum stack) succeeds.
- [ ] Enqueueing a landing request whose target bookmark name contains slashes (e.g., `release/v2.0`), dots, or hyphens succeeds without encoding issues.
- [ ] Enqueueing when the repository already has 99 pending landing tasks succeeds and returns queue position 100.
- [ ] The queue position accurately reflects pending/running tasks only — completed or failed tasks are excluded from the count.
- [ ] If the landing task record cannot be created (database error), the enqueue operation fails atomically — the landing request state is not changed to `queued`.
- [ ] Enqueueing a merged landing request returns 409 (not 404 or 500).
- [ ] Enqueueing a landing request in `draft` state returns 409.
- [ ] Enqueueing a landing request on a non-existent repository returns 404.
- [ ] Enqueueing a landing request with a non-existent landing number returns 404.

### Boundary Constraints

| Constraint | Value | Behavior When Exceeded |
|---|---|---|
| Minimum change IDs for enqueue | 1 | 422 validation error: "Landing request must have at least one change" |
| Maximum change IDs (stack) | 500 | Enforced at creation; enqueue does not re-validate max |
| Landing number | Positive integer | 404 if non-existent |
| Queue position | 1-based positive integer | Always ≥ 1 |
| Task priority | Integer (default: 1) | Higher priority tasks are claimed first |
| Rate limit on enqueue endpoint | 10 requests/minute/user | 429 with Retry-After header |
| Valid source states for enqueue | `open` only | 409 for any other state |
| Required approval count | 0–∞ (per protected bookmark rules) | 409 with shortfall details if not met |

## Design

### Web UI Design

#### Trigger Location

The **Queue for Merge** button appears in the action sidebar (desktop) or action bar (mobile/tablet) of the landing request detail page at `/:owner/:repo/landings/:number`.

#### Visibility Rules

The button is **visible** when all of these are true:
- The authenticated user has write access to the repository.
- The landing request is in `open` state.

The button is **hidden entirely** (not grayed out) when:
- The user lacks write access.
- The landing request is in any state other than `open` (`draft`, `closed`, `merged`, `queued`, `landing`).

#### Button Design

- Label: **"Queue for Merge"**
- Icon: A merge/queue icon to the left of the label.
- Style: Primary action button (solid fill, prominent placement).
- Disabled state: The button is visually disabled (grayed, non-clickable) when `conflict_status` is `"conflicted"`. A tooltip on hover explains: "Conflicts must be resolved before merging."

#### Confirmation Dialog

Clicking the button opens a confirmation dialog:

- **Title**: "Queue Landing Request #N for Merge?"
- **Body**: "This will add the landing request to the merge queue for the `{target_bookmark}` bookmark. It will be merged when it reaches the front of the queue."
- **Protected bookmark notice** (if applicable): "This bookmark requires N approval(s). Currently M approval(s) are met." (shown only if there are protected bookmark rules)
- **Stack summary**: "N change(s) will be landed onto `{target_bookmark}`."
- **Actions**: "Confirm" (primary) and "Cancel" (secondary).
- **Loading state**: On confirm click, the button shows a spinner and the label changes to "Queueing…". The dialog remains open until the response arrives.

#### Success State

On successful enqueue (HTTP 202):
- The confirmation dialog closes.
- A toast notification appears: "Landing #N queued for merge (position: M)".
- The state badge on the page header transitions from green "Open" to yellow "Queued".
- A "Queue Position: M" metadata field appears in the header metadata area.
- The "Queue for Merge" button is replaced by a disabled "Queued" indicator.
- The page data is refetched to reflect the updated state.

#### Error States

On failure:
- **409 (conflicts)**: Toast error: "This landing request has conflicts that must be resolved before merging." Dialog remains open.
- **409 (approvals)**: Toast error: "This landing request requires N approvals (currently has M)." Dialog remains open.
- **409 (invalid state)**: Toast error: "This landing request is no longer open and cannot be queued." Dialog closes; page refetches to show current state.
- **401**: Redirect to login.
- **403**: Toast error: "You do not have permission to queue this landing request for merge."
- **429**: Toast error: "Rate limit exceeded. Please try again in N seconds."
- **500**: Toast error: "Something went wrong. Please try again."

#### Queued State Display

When viewing a landing request in `queued` state:
- State badge: Yellow pill labeled "Queued".
- Metadata shows: "Queue position: N" (where N is the position when last fetched).
- Metadata shows: "Queued by @username M minutes ago".
- The action area shows no merge-related actions.

#### Landing State Display (Active Merge)

When the landing request transitions to `landing` state:
- State badge: Yellow/animated pill labeled "Landing" (subtle pulse animation).
- Metadata shows: "Merge in progress…".
- The action area shows no merge-related actions.

### API Shape

#### Enqueue Endpoint

```
PUT /api/repos/:owner/:repo/landings/:number/land
```

**Request**: No body required. Authentication via session cookie or PAT `Authorization` header.

**Success Response** (HTTP 202 Accepted):
```json
{
  "number": 37,
  "title": "Implement user profile caching",
  "body": "...",
  "state": "queued",
  "author": { "id": 1, "login": "williamcory" },
  "change_ids": ["kpqvxrms", "yzlnwtkx", "rmvqxnkl"],
  "target_bookmark": "main",
  "source_bookmark": "feature/caching",
  "conflict_status": "clean",
  "stack_size": 3,
  "created_at": "2026-03-20T14:30:00Z",
  "updated_at": "2026-03-22T10:00:00Z",
  "queued_at": "2026-03-22T10:00:00Z",
  "queue_position": 1,
  "task_id": "lt_abc123"
}
```

**Error Responses**:
- `401 Unauthorized`: `{ "message": "Authentication required" }`
- `403 Forbidden`: `{ "message": "You do not have permission to perform this action" }`
- `404 Not Found`: `{ "message": "Landing request #N not found in owner/repo" }`
- `409 Conflict` (state): `{ "message": "Landing request is not open" }`
- `409 Conflict` (conflicts): `{ "message": "This landing request has conflicts that must be resolved before merging" }`
- `409 Conflict` (approvals): `{ "message": "This landing request requires N approvals (currently has M)", "details": { "required": N, "current": M } }`
- `422 Unprocessable Entity` (no changes): `{ "message": "Landing request must have at least one change", "errors": [{ "resource": "LandingRequest", "field": "change_ids", "code": "invalid" }] }`
- `429 Too Many Requests`: `{ "message": "Rate limit exceeded" }` with `Retry-After` header.

### SDK Shape

In `@codeplane/ui-core`:

```
useLandLanding(owner, repo, number) → {
  mutate(): Promise<void>,
  loading: boolean,
  error: APIError | null,
  data: { queue_position: number, task_id: string } | null
}
```

The hook:
- Calls `PUT /api/repos/:owner/:repo/landings/:number/land`.
- Sets `loading` to `true` during the request.
- On success, populates `data` with `queue_position` and `task_id`, and triggers a refetch of the parent `useLanding` hook.
- On error, populates `error` with the structured API error.

### CLI Command

**`codeplane land land <number>`**

Queues an open landing request for merge.

```
$ codeplane land land 37
✓ Landing request #37 queued for merge (position: 1)
  Task ID: lt_abc123

$ codeplane land land 37 --repo owner/repo
✓ Landing request #37 queued for merge (position: 3)
  Task ID: lt_def456

$ codeplane land land 37 --json
{
  "number": 37,
  "state": "queued",
  "queue_position": 1,
  "task_id": "lt_abc123",
  ...
}
```

**Options**:
- `--repo <owner/repo>` — Override the repository context (otherwise inferred from the current working directory's jj repository remote).
- `--json` — Output the full `LandLandingRequestAccepted` response as JSON. Supports field filtering: `--json .queue_position`.

**Error output**:
- Non-existent landing: `✗ Landing request #999 was not found` (exit code 1).
- Cannot land (conflicts): `✗ Landing request #37 cannot be landed: conflicts must be resolved` (exit code 1).
- Cannot land (approvals): `✗ Landing request #37 cannot be landed: requires 3 approvals (has 1)` (exit code 1).
- Cannot land (wrong state): `✗ Landing request #37 cannot be landed: landing request is not open` (exit code 1).

### TUI UI

The TUI landing detail screen supports the enqueue action via the `m` keyboard shortcut.

**Action Key**: `m` — "Queue for Merge"

**Availability**: The `m` key is shown in the bottom status bar keybinding hints only when:
- The user has write access.
- The landing request is in `open` state.
- `conflict_status` is not `"conflicted"`.

**Interaction Flow**:
1. User presses `m`.
2. A confirmation prompt appears in the status area: "Queue landing #N for merge? [y/N]"
3. User presses `y` to confirm, any other key to cancel.
4. On confirm, the TUI shows a spinner with "Queueing…" in the status area.
5. On success: Status message "Landing #N queued for merge (position: M)" displayed for 5 seconds. State badge updates to `[queued]` (yellow). Queue position appears in the metadata row.
6. On error: Status message shows the error (e.g., "Error: requires 3 approvals (has 1)") in red for 5 seconds.

**Queued State Display**:
- State badge: `[queued]` in yellow ANSI color.
- Metadata row includes: "Queue position: N".
- `m` key is removed from the keybinding hints.

### VS Code Extension

- The landing request tree view item for a queued landing shows a yellow icon and "Queued (position N)" suffix.
- No dedicated "Queue for Merge" button in the tree view — users are directed to the web UI or CLI for the enqueue action.
- Opening the landing request detail webview includes the full web UI with the "Queue for Merge" button.

### Neovim Plugin

- `:CodeplaneLandLand <number>` command queues the specified landing request for merge via CLI delegation.
- Success output: "Landing #N queued for merge (position: M)"
- Error output: displays the error message in the Neovim command line.

### Documentation

The following end-user documentation should be written:

- **User Guide: The Merge Queue** — Explains the concept of the merge queue, why it exists (serialized merges prevent merge skew), how to enqueue a landing request, what the queue position means, and what happens when a queued landing fails to merge.
- **CLI Reference: `land land`** — Documents the command syntax, options, output format, JSON filtering, error cases, and example invocations.
- **FAQ: Merge Queue** — Addresses common questions: "Why is my landing stuck in the queue?", "Can I cancel a queued landing?", "What happens if conflicts appear after queueing?", "How is priority determined?", "Who can enqueue a landing request?"

## Permissions & Security

### Authorization Matrix

| Action | Anonymous (public repo) | Anonymous (private repo) | Read-Only Member | Write Member | Admin | Owner |
|---|---|---|---|---|---|---|
| View queue position (in detail) | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Queue for merge | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

**Notes**:
- Write-level repository access is the minimum required to enqueue a landing request. This aligns with the ability to submit reviews and modify landing request state.
- The service layer currently checks for admin access; the specification requires write access as the minimum. If the implementation is stricter (admin-only), the spec and implementation should be aligned — the recommendation is to require **write** access, not admin.
- Anonymous users and read-only members cannot enqueue, even if the repository is public.
- The `queued_by` field records which user triggered the enqueue for audit purposes.

### Rate Limiting

| Endpoint | Rate Limit | Window | Rationale |
|---|---|---|---|
| `PUT .../landings/:number/land` | 10 requests | per minute per user | Heavy operation; prevents accidental rapid retries and abuse. Also prevents a single user from flooding the queue. |

### Data Privacy

- The `queued_by` user ID and login are visible in the landing request detail to anyone who can view the landing request. This is consistent with the `author` field's visibility.
- The `task_id` is an opaque identifier; it does not contain PII.
- The `queue_position` is a transient value derived from the current queue state; it does not contain PII.
- Request bodies for the enqueue endpoint are empty, so there is no PII in the request payload.
- Landing request content (title, body, change IDs) that is included in the 202 response follows the same privacy rules as the `GET` detail endpoint.
- Private repository landing enqueue attempts by unauthorized users must return 404 (not 403) to avoid leaking repository existence.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `landing_detail.merge_queued` | Successful enqueue (HTTP 202 returned) | `repo_id`, `landing_number`, `stack_size`, `review_count`, `approval_count`, `queue_position`, `task_id`, `client` (web/cli/tui/vscode/nvim), `time_since_creation_hours` (time from landing creation to enqueue), `time_since_last_review_hours` |
| `landing_detail.merge_blocked` | Enqueue rejected (HTTP 409 returned) | `repo_id`, `landing_number`, `block_reason` (conflicts/approvals/invalid_state), `client`, `required_approvals` (if applicable), `current_approvals` (if applicable), `conflict_status` |
| `landing_detail.merge_queue_button_clicked` | User clicks "Queue for Merge" button (before confirmation) | `repo_id`, `landing_number`, `client` |
| `landing_detail.merge_queue_confirmed` | User confirms enqueue in dialog | `repo_id`, `landing_number`, `client` |
| `landing_detail.merge_queue_cancelled` | User cancels enqueue in dialog | `repo_id`, `landing_number`, `client` |

### Funnel Metrics

1. **Button Click → Confirmation → Success Funnel**: Track the ratio of `merge_queue_button_clicked` → `merge_queue_confirmed` → `merge_queued`. A low confirm-to-success ratio indicates users are frequently blocked by preconditions they don't see until after clicking.
   - Target: >80% of confirmations result in successful enqueue.

2. **Open → Queued Conversion**: % of landing requests that reach `queued` state. Measures adoption of the queue-based flow.
   - Target: >60% of merged landing requests went through the queue.

3. **Time to Queue**: Median time from landing request creation to first enqueue attempt. Measures review/approval velocity.
   - Target: <24 hours for active repositories.

4. **Re-enqueue Rate**: % of landing requests that are enqueued more than once (indicates failures and retries).
   - Target: <10%.

5. **Queue Depth Distribution**: Histogram of queue depths when new landings are enqueued. Measures whether teams are batching or serializing.
   - Healthy: 80% of enqueues see position ≤ 3.

6. **Block Rate by Reason**: Breakdown of `merge_blocked` events by `block_reason`. Identifies the most common barrier to merging.
   - Actionable if `approvals` blocks >30% of attempts (suggests approval requirements may be too strict or unclear).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|---|---|---|---|
| Enqueue attempt started | INFO | `repo_id`, `landing_number`, `user_id`, `request_id` | Entry point log |
| Enqueue validation: state check | DEBUG | `repo_id`, `landing_number`, `current_state` | Pre-condition trace |
| Enqueue validation: change IDs check | DEBUG | `repo_id`, `landing_number`, `change_id_count` | Pre-condition trace |
| Enqueue validation: protected bookmark lookup | DEBUG | `repo_id`, `landing_number`, `target_bookmark`, `matching_rules_count` | Shows which rules matched |
| Enqueue validation: approval count check | DEBUG | `repo_id`, `landing_number`, `required`, `actual` | Only logged when protected bookmark rules apply |
| Enqueue blocked: landing not open | WARN | `repo_id`, `landing_number`, `user_id`, `current_state` | Expected user error; high volume may indicate UI staleness |
| Enqueue blocked: insufficient approvals | WARN | `repo_id`, `landing_number`, `user_id`, `required`, `actual`, `target_bookmark` | Expected user error |
| Enqueue blocked: no change IDs | WARN | `repo_id`, `landing_number`, `user_id` | Unusual; may indicate data integrity issue |
| Enqueue: state transition committed | INFO | `repo_id`, `landing_number`, `user_id`, `queued_at` | Critical audit event |
| Enqueue: landing task created | INFO | `repo_id`, `landing_number`, `task_id`, `queue_position` | Critical audit event |
| Enqueue: database error during state update | ERROR | `repo_id`, `landing_number`, `user_id`, `error_message`, `error_stack` | Infrastructure issue |
| Enqueue: database error during task creation | ERROR | `repo_id`, `landing_number`, `user_id`, `error_message`, `error_stack` | Infrastructure issue; state may be inconsistent |
| Enqueue: completed successfully | INFO | `repo_id`, `landing_number`, `user_id`, `queue_position`, `task_id`, `response_time_ms` | End-to-end success log |
| Rate limit exceeded on enqueue | WARN | `user_id`, `endpoint`, `limit`, `window`, `request_id` | Abuse detection |

### Prometheus Metrics

**Counters:**
- `codeplane_landing_merges_queued_total{repo_id}` — Total successful enqueue operations per repository.
- `codeplane_landing_merges_blocked_total{repo_id, reason}` — Blocked enqueue attempts. `reason` labels: `conflicts`, `approvals`, `invalid_state`, `no_changes`, `permission_denied`.
- `codeplane_landing_enqueue_errors_total{error_type}` — Internal errors during enqueue. `error_type` labels: `db_state_update`, `db_task_creation`, `db_position_query`.

**Histograms:**
- `codeplane_landing_enqueue_duration_seconds` — End-to-end enqueue operation latency. Buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5.

**Gauges:**
- `codeplane_landing_merge_queue_depth{repo_id}` — Current depth of the merge queue per repository (count of `pending` + `running` tasks).

### Alerts

#### Alert: LandingEnqueueHighBlockRate
- **Condition**: `rate(codeplane_landing_merges_blocked_total[15m]) / (rate(codeplane_landing_merges_queued_total[15m]) + rate(codeplane_landing_merges_blocked_total[15m])) > 0.5`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_landing_merges_blocked_total` by `reason` label to identify the dominant block cause.
  2. If `approvals` is the dominant reason: review protected bookmark rules for the affected repositories. Consider if approval thresholds are too high or if team members are not receiving review notifications.
  3. If `conflicts` is the dominant reason: check whether the repository has high commit velocity causing frequent rebasing issues. Consider whether the conflict detection is stale (e.g., not refreshing before enqueue).
  4. If `invalid_state` is the dominant reason: investigate whether the web UI is presenting stale state data. Check client-side caching and refetch logic.
  5. Communicate findings to the product team for potential UX improvements (e.g., pre-flight checks before showing the button).

#### Alert: LandingMergeQueueStuck
- **Condition**: `codeplane_landing_merge_queue_depth > 0` sustained for 30 minutes without any `codeplane_landing_merges_queued_total` increase or state transition.
- **Severity**: Warning (30 min), Critical (2 hours)
- **Runbook**:
  1. Query the `landing_tasks` table for tasks with `status = 'pending'` or `status = 'running'` and check their `created_at` timestamps.
  2. If a task is `running` for >15 minutes: check the task processor/worker logs for the associated `task_id`. Common causes: jj merge subprocess hanging, disk I/O contention on repository storage, or the worker process crashing.
  3. If all tasks are `pending` and none are `running`: the queue worker is not polling. Check worker health, restart the worker process, and verify the `claimPendingLandingTask` query returns results.
  4. If the worker is healthy but claims fail: check for database lock contention (`FOR UPDATE SKIP LOCKED` may be affected by long-running transactions).
  5. As a last resort: manually mark the stuck task as `done` via admin API and notify the landing request author to re-enqueue if needed.

#### Alert: LandingEnqueueLatencyHigh
- **Condition**: `histogram_quantile(0.95, codeplane_landing_enqueue_duration_seconds) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check database connection pool availability (`codeplane_db_connection_pool_available`). Exhausted pools cause queuing delays.
  2. Profile the three database operations in the enqueue path: `enqueueLandingRequest`, `createLandingTask`, `getLandingQueuePositionByTaskID`. Identify which is slow.
  3. If `getLandingQueuePositionByTaskID` is slow: check if the `landing_tasks` table has grown very large. Consider adding an index on `(repository_id, status, created_at)`.
  4. If `enqueueLandingRequest` is slow: check for row-level lock contention on the `landing_requests` table.
  5. Check if the protected bookmark approval count query is slow for repositories with many reviews.

#### Alert: LandingEnqueueInternalErrors
- **Condition**: `rate(codeplane_landing_enqueue_errors_total[5m]) > 0`
- **Severity**: Critical
- **Runbook**:
  1. Check `error_type` label to identify which database operation is failing.
  2. If `db_state_update`: check database connectivity and `landing_requests` table health. Look for constraint violations or schema drift.
  3. If `db_task_creation`: check `landing_tasks` table for constraint violations (e.g., duplicate `landing_request_id` if a task already exists for this landing). This may indicate a partial failure recovery issue.
  4. If `db_position_query`: this is a read-only query and should rarely fail. Check database availability.
  5. For any internal error: check the structured error logs for the `request_id` to get the full stack trace. The error context should include `repo_id`, `landing_number`, and `user_id`.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Internal Impact | Recovery |
|---|---|---|---|---|
| Landing not found | 404 | "Landing request #N not found" | None | User checks landing number |
| Repository not found | 404 | "Repository not found" | None | User checks URL |
| Not authenticated | 401 | "Authentication required" | None | Redirect to login |
| No write access | 403 | "Permission denied" | None | User contacts admin |
| No write access (private repo) | 404 | "Repository not found" | None | Does not leak existence |
| Landing not open | 409 | "Landing request is not open" | None | User checks current state |
| No change IDs | 422 | "Landing request must have at least one change" | None | User adds changes |
| Insufficient approvals | 409 | "Requires N approvals (has M)" | None | User solicits reviews |
| DB error on state update | 500 | "Something went wrong" | State unchanged, no task created | Ops investigates; user retries |
| DB error on task creation | 500 | "Something went wrong" | State may be `queued` without task | **Critical**: potential inconsistency. Ops must check state and create task manually or revert state. |
| DB error on position query | 500 | "Something went wrong" | State is `queued`, task exists, but position unknown | Low severity; task will still be processed. User can refresh to see position. |
| Rate limit | 429 | "Rate limit exceeded" | Request not processed | User waits and retries |

## Verification

### API Integration Tests

#### Successful Enqueue
- [ ] `PUT /api/repos/:owner/:repo/landings/:number/land` on an open, conflict-clean landing with sufficient approvals returns HTTP 202.
- [ ] The 202 response body includes `queue_position` as a positive integer ≥ 1.
- [ ] The 202 response body includes `task_id` as a non-empty string.
- [ ] The 202 response body includes `state: "queued"`.
- [ ] The 202 response body includes `queued_at` as a valid ISO 8601 timestamp within the last 5 seconds.
- [ ] After enqueue, `GET /api/repos/:owner/:repo/landings/:number` returns `state: "queued"`.
- [ ] After enqueue, `GET /api/repos/:owner/:repo/landings/:number` response includes `queued_at` matching the 202 response.

#### Queue Position Accuracy
- [ ] Enqueueing the first landing request for a repository returns `queue_position: 1`.
- [ ] Enqueueing a second landing request (while the first is still pending) returns `queue_position: 2`.
- [ ] Enqueueing a third landing request returns `queue_position: 3`.
- [ ] After the first task completes, enqueueing a new landing returns a queue position that does not count the completed task.

#### Concurrent Enqueue Race Condition
- [ ] Two concurrent `PUT .../land` requests on the same landing request: exactly one succeeds with 202, the other returns 409.
- [ ] The winning request's state transition and task creation are both committed atomically.

#### State Precondition Checks
- [ ] `PUT .../land` on a landing with `state: "closed"` returns 409 with message "Landing request is not open".
- [ ] `PUT .../land` on a landing with `state: "draft"` returns 409.
- [ ] `PUT .../land` on a landing with `state: "merged"` returns 409.
- [ ] `PUT .../land` on a landing with `state: "queued"` returns 409 (already queued).
- [ ] `PUT .../land` on a landing with `state: "landing"` returns 409 (already being landed).

#### Change ID Validation
- [ ] `PUT .../land` on a landing request with zero `change_ids` returns 422.
- [ ] `PUT .../land` on a landing request with exactly 1 change ID succeeds.
- [ ] `PUT .../land` on a landing request with 500 change IDs (maximum valid stack) succeeds.

#### Protected Bookmark Approval Enforcement
- [ ] `PUT .../land` on a landing targeting a protected bookmark requiring 1 approval, with 1 approval, succeeds.
- [ ] `PUT .../land` on a landing targeting a protected bookmark requiring 2 approvals, with 1 approval, returns 409 with details `{ required: 2, current: 1 }`.
- [ ] `PUT .../land` on a landing targeting a protected bookmark requiring 2 approvals, with 2 approvals, succeeds.
- [ ] `PUT .../land` on a landing targeting a bookmark matched by multiple protected rules uses the highest requirement.
- [ ] `PUT .../land` on a landing targeting an unprotected bookmark succeeds without any approval check.
- [ ] `PUT .../land` with an approval that has been dismissed does not count toward the required approval total.

#### Authentication and Authorization
- [ ] `PUT .../land` without authentication returns 401.
- [ ] `PUT .../land` by a user with read-only access returns 403.
- [ ] `PUT .../land` by a user with write access succeeds.
- [ ] `PUT .../land` by a repository admin succeeds.
- [ ] `PUT .../land` by the repository owner succeeds.
- [ ] `PUT .../land` on a private repository by an unauthorized user returns 404 (not 403).

#### Error Response Format
- [ ] All 409 responses include a `message` string field.
- [ ] 409 responses for approval shortfall include `details.required` and `details.current` fields.
- [ ] 422 responses include an `errors` array with `resource`, `field`, and `code` entries.

#### Rate Limiting
- [ ] Sending 10 `PUT .../land` requests within 1 minute succeeds for the first 10.
- [ ] The 11th request within the same minute returns 429 with a `Retry-After` header.

### CLI E2E Tests

- [ ] `codeplane land land <number>` on an open, approved landing request outputs a success message including "queued for merge" and a queue position.
- [ ] `codeplane land land <number>` exit code is 0 on success.
- [ ] `codeplane land land <number> --json` outputs valid JSON with `queue_position` and `task_id` fields.
- [ ] `codeplane land land <number> --json .queue_position` outputs just the queue position integer.
- [ ] `codeplane land land <number> --repo owner/repo` uses the specified repository context.
- [ ] `codeplane land land 999999` (non-existent) outputs an error message containing "not found" and exits with code 1.
- [ ] `codeplane land land <number>` on a closed landing request outputs an error message containing "not open" and exits with code 1.
- [ ] `codeplane land land <number>` on a landing requiring 2 approvals with only 1 outputs an error mentioning the approval shortfall and exits with code 1.
- [ ] `codeplane land land <number>` on an already-landed (merged) landing request outputs an error and exits with code 1.
- [ ] Running `codeplane land land <number>` twice on the same landing: first succeeds, second fails with "not open" error.

### Web UI Playwright E2E Tests

- [ ] Navigate to an open landing request detail page; verify the "Queue for Merge" button is visible for a write-access user.
- [ ] Navigate to an open landing request detail page as a read-only user; verify the "Queue for Merge" button is not visible.
- [ ] Navigate to a closed landing request detail page; verify the "Queue for Merge" button is not visible.
- [ ] Navigate to a merged landing request detail page; verify the "Queue for Merge" button is not visible.
- [ ] Click "Queue for Merge" button; verify the confirmation dialog appears with the correct landing number, target bookmark, and stack size.
- [ ] In the confirmation dialog, click "Cancel"; verify the dialog closes and the landing remains in `open` state.
- [ ] In the confirmation dialog, click "Confirm"; verify a loading spinner appears on the confirm button.
- [ ] After successful enqueue: verify the state badge changes to yellow "Queued", the queue position appears in metadata, and a success toast is shown.
- [ ] After successful enqueue: verify the "Queue for Merge" button is no longer visible.
- [ ] Attempt to queue a landing with insufficient approvals; verify the error toast mentions the approval shortfall.
- [ ] Attempt to queue a conflicted landing; verify the "Queue for Merge" button is disabled and has a tooltip explaining conflicts must be resolved.
- [ ] Navigate to a `queued` landing request; verify "Queue position: N" appears in the metadata area.
- [ ] Navigate to a `queued` landing request; verify the state badge displays "Queued" in yellow.

### TUI E2E Tests

- [ ] On the TUI landing detail screen for an open landing, verify `m` appears in the keybinding hints.
- [ ] Press `m` on the TUI landing detail screen; verify a confirmation prompt appears.
- [ ] Press `y` to confirm enqueue; verify the status message shows "Landing #N queued for merge (position: M)".
- [ ] After enqueue in TUI, verify the state badge updates to `[queued]` in yellow.
- [ ] Press `m` then `n` to cancel; verify no state change occurs.
- [ ] On a closed landing in TUI, verify `m` does not appear in keybinding hints.
- [ ] On a queued landing in TUI, verify "Queue position: N" appears in the metadata row.

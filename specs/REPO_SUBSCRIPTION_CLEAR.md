# REPO_SUBSCRIPTION_CLEAR

Specification for REPO_SUBSCRIPTION_CLEAR.

## High-Level User POV

When you've accumulated subscriptions to many repositories over time — perhaps dozens or even hundreds — and you want to start fresh with a clean notification slate, Codeplane lets you clear all of your repository subscriptions at once. This is the "unwatch everything" action: it removes every repository subscription you have, regardless of watch mode, in a single operation.

This situation comes up more often than you might think. A developer joins a new team and inherits a noisy notification feed from repositories they watched at a previous company or on a previous project. An engineer who has been using Codeplane for months realizes their notification inbox has become so crowded that individual unsubscribes feel futile — they'd rather wipe the board and re-subscribe only to the repositories they actively care about today. A team lead who was temporarily watching a broad set of repositories during a release cycle wants to quickly return to their normal, focused subscription set.

On the web, the "Clear all subscriptions" action lives on your subscriptions management page under user settings. It's a deliberate, destructive action: clicking the button presents a confirmation dialog that tells you exactly how many subscriptions will be removed, and requires you to confirm before proceeding. Once confirmed, all your repository subscriptions are deleted, the list clears, and you stop receiving notifications from every previously-watched repository. You can immediately begin re-subscribing to specific repositories as needed.

From the CLI, you can clear all subscriptions with a single command. The command tells you how many subscriptions were removed and confirms the operation. Because this is a destructive bulk action, the CLI requires an explicit `--confirm` flag (or interactive confirmation prompt) before proceeding.

From the TUI, the clear action is available on the subscriptions screen. It prompts for confirmation and then removes all subscriptions, updating the list in real time.

This feature is purely about your own notification preferences. It does not affect the repository watcher counts for other users, it does not notify repository owners, and it does not touch your starred repositories, issue assignments, or any other Codeplane state. After clearing, you remain a member or collaborator on all the same repositories — you simply stop receiving watch-based notifications from them.

The clear action is intentionally all-or-nothing. If you want to selectively remove some subscriptions, you should unwatch individual repositories instead. The clear action exists specifically for the "reset everything" workflow where granular control would be tedious.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can remove all their repository subscriptions via `DELETE /api/user/subscriptions`.
- [ ] The endpoint deletes every row in the `watches` table for the authenticated user, regardless of watch mode.
- [ ] The response returns `200 OK` with a body containing `{ "cleared_count": <number> }` indicating how many subscriptions were removed.
- [ ] If the user has zero subscriptions, the endpoint returns `200 OK` with `{ "cleared_count": 0 }` (idempotent — not an error).
- [ ] After clearing, the repository watcher counts (`num_watches`) for all previously-watched repositories are decremented appropriately.
- [ ] After clearing, `GET /api/user/subscriptions` returns an empty list with `total_count: 0`.
- [ ] After clearing, `GET /api/repos/:owner/:repo/subscription` returns `{ "subscribed": false }` for any previously-watched repository.
- [ ] Unauthenticated requests return `401`.
- [ ] The web UI provides a "Clear all subscriptions" button on the subscriptions settings page with a confirmation dialog showing the count of subscriptions to be removed.
- [ ] The CLI command `codeplane repo unwatch-all` clears all subscriptions and outputs the count of removed subscriptions.
- [ ] The CLI command requires `--confirm` or an interactive confirmation prompt before proceeding.
- [ ] The TUI provides a clear-all action on the subscriptions screen with a confirmation prompt.
- [ ] No notifications are sent to repository owners when a user clears their subscriptions.
- [ ] Starred repositories, issue assignments, team memberships, and all other user state are unaffected.

### Edge Cases

- [ ] A user with zero subscriptions receives `200` with `{ "cleared_count": 0 }` — not a 404 or error.
- [ ] Clearing subscriptions is idempotent: calling the endpoint twice in quick succession returns `{ "cleared_count": 0 }` on the second call.
- [ ] If a user is subscribed to both public and private repositories, all subscriptions are cleared regardless of visibility.
- [ ] If a user is subscribed to repositories across multiple organizations and personal accounts, all subscriptions are cleared.
- [ ] If a user has subscriptions with different modes (some `watching`, some `participating`, some `ignored`), all are cleared regardless of mode.
- [ ] Concurrent clear requests from the same user do not produce negative watcher counts on any repository (counter decrements use `GREATEST(num_watches - 1, 0)`).
- [ ] If a subscribed repository is deleted between the time the user initiates the clear and the time the clear executes, the operation still succeeds.
- [ ] After clearing, re-subscribing to any repository works normally — the clear does not place any cooldown or lock on the user.
- [ ] Clearing subscriptions does not remove the user's stars on any repository (stars and watches are independent).
- [ ] Clearing subscriptions does not affect notification preferences (email toggle remains unchanged).
- [ ] If the operation partially fails (e.g., some counter decrements succeed but the transaction rolls back), no subscriptions are removed — the operation is atomic.
- [ ] A request body sent with the DELETE is ignored (no error, no effect).
- [ ] Unknown query parameters are ignored.

### Boundary Constraints

- [ ] No path parameters are required.
- [ ] No query parameters are required.
- [ ] No request body is required. Any body sent is ignored.
- [ ] The `cleared_count` in the response is a non-negative integer.
- [ ] The maximum number of subscriptions that can be cleared in a single request is unbounded — there is no artificial cap.
- [ ] The operation must complete within 30 seconds even for users with up to 10,000 subscriptions.

## Design

### Web UI Design

**Location**: User settings → Subscriptions page (`/settings/subscriptions`)

**"Clear all" button placement**: Below the filter bar and above the subscription list, right-aligned. The button is styled as a destructive action (red/danger variant) with a trash icon and the label "Clear all subscriptions". The button is only visible when the user has at least one subscription. When the list is empty, the button is hidden.

**Button states**:
1. **Default**: Red outlined button with label "Clear all subscriptions" and a trash icon.
2. **Hover**: Red filled background with white text.
3. **Disabled**: Gray, non-interactive. Shown during the clearing operation or when the list is empty.
4. **Loading**: Shows a spinner, label changes to "Clearing…". The button is non-interactive. The subscription list dims with an overlay.

**Confirmation dialog**:
- **Title**: "Clear all subscriptions?"
- **Body**: "This will remove your subscription to **{count} repositories**. You will stop receiving watch notifications from all of them. This action cannot be undone."
- If the count is 1, the body reads "**1 repository**" (singular).
- **Primary action**: "Clear all" (red/danger button).
- **Secondary action**: "Cancel" (neutral button).
- **Escape key and backdrop click**: Dismiss the dialog without action.

**Post-clear behavior**:
1. The confirmation dialog closes.
2. A success toast appears: "Cleared {count} subscriptions".
3. The subscription list transitions to the empty state.
4. The "Clear all subscriptions" button is hidden.

**Error handling**: If the API call fails, the confirmation dialog closes, the subscription list remains unchanged, and an error toast appears: "Failed to clear subscriptions. Please try again."

**Optimistic update**: This feature does NOT use optimistic updates. Because it is a destructive bulk action, the UI waits for server confirmation before updating the list.

### API Shape

#### Clear All Subscriptions

```
DELETE /api/user/subscriptions
```

**Authentication**: Required. Uses session cookie or PAT.

**Path Parameters**: None.

**Query Parameters**: None.

**Request Body**: None. Any body sent is ignored.

**Success Response** (`200 OK`):
```json
{
  "cleared_count": 42
}
```

| Field           | Type   | Description                                      |
|-----------------|--------|--------------------------------------------------|
| `cleared_count` | number | Number of subscriptions that were removed. 0 if the user had no subscriptions. |

**Error Responses**:

| Status | Condition                    | Body                                       |
|--------|------------------------------|---------------------------------------------|
| 401    | Not authenticated            | `{ "message": "authentication required" }`  |
| 429    | Rate limit exceeded          | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| 500    | Unexpected server error      | `{ "message": "internal error" }`           |

**Idempotency**: Calling this endpoint when the user has no subscriptions returns `200` with `{ "cleared_count": 0 }`.

**Atomicity**: The operation is atomic. Either all subscriptions are cleared and all watcher counts decremented, or none are. This is enforced via a database transaction.

### SDK Shape

The `RepoService` class in `@codeplane/sdk` exposes:

```typescript
clearSubscriptions(
  userId: string
): Promise<Result<{ cleared_count: number }, APIError>>
```

The `ClearedSubscriptionsResult` type:
```typescript
interface ClearedSubscriptionsResult {
  cleared_count: number;
}
```

### CLI Command

**Command**: `codeplane repo unwatch-all [--confirm] [--json]`

**Flags**:

| Flag        | Type    | Required | Default | Description                                                         |
|-------------|---------|----------|---------|---------------------------------------------------------------------|
| `--confirm` | boolean | no       | false   | Skip interactive confirmation prompt (for scripting)                |
| `--json`    | boolean | no       | false   | Output raw JSON response                                           |

**Behavior**:
1. If `--confirm` is not set and the terminal is interactive, display a confirmation prompt: `This will clear all your repository subscriptions. Continue? (y/N)`
2. If the user enters `y` or `Y`, proceed. Any other input (including empty) aborts with exit code 0 and message "Aborted."
3. If `--confirm` is set, proceed without prompting.
4. If the terminal is not interactive and `--confirm` is not set, abort with exit code 1 and message: "Use --confirm to clear subscriptions non-interactively."
5. Send `DELETE /api/user/subscriptions`.
6. In text mode, print: `Cleared {count} subscriptions` (or `Cleared 1 subscription` for singular).
7. In JSON mode, output the raw response: `{ "cleared_count": 42 }`.
8. On API error, display the error message to stderr and exit with code 1.

**Example usage**:
```bash
# Interactive confirmation
$ codeplane repo unwatch-all
This will clear all your repository subscriptions. Continue? (y/N) y
Cleared 42 subscriptions

# Non-interactive / scripting
$ codeplane repo unwatch-all --confirm
Cleared 42 subscriptions

# JSON output
$ codeplane repo unwatch-all --confirm --json
{"cleared_count": 42}

# Already empty
$ codeplane repo unwatch-all --confirm
Cleared 0 subscriptions

# Abort
$ codeplane repo unwatch-all
This will clear all your repository subscriptions. Continue? (y/N) n
Aborted.

# Error case
$ codeplane repo unwatch-all --confirm
Error: authentication required
```

### TUI UI

**Location**: Subscriptions/Watching screen.

**Action binding**: A keyboard shortcut (e.g., `Shift+C` or accessible via the command palette `clear all subscriptions`) triggers the clear-all flow.

**Confirmation prompt**: An inline confirmation prompt appears at the bottom of the screen: `Clear all {count} subscriptions? [y/N]`

**Post-clear behavior**:
- A status message appears: "Cleared {count} subscriptions".
- The subscription list transitions to the empty state.
- The status message fades after 3 seconds.

**Error handling**: If the operation fails, the status message reads "Failed to clear subscriptions" in red/error styling.

### Documentation

- **API Reference — User Subscriptions**: Document `DELETE /api/user/subscriptions` with authentication requirements, response schema (`cleared_count`), idempotency behavior, and error codes.
- **CLI Reference — `repo unwatch-all`**: Document usage with examples for interactive, non-interactive, JSON, empty, and error scenarios. Document the `--confirm` and `--json` flags.
- **Web Guide — User Settings — Subscriptions**: Document the "Clear all subscriptions" button, the confirmation dialog, and post-clear behavior.
- **Concepts Guide — Subscriptions and Notifications**: Add a section explaining the difference between clearing subscriptions and managing individual subscriptions, and note that clearing does not affect stars, assignments, or notification preferences.

## Permissions & Security

### Authorization Roles

| Action                                | Anonymous | Authenticated |
|---------------------------------------|-----------|---------------|
| Clear own subscriptions               | ❌         | ✅             |

- This endpoint only operates on the calling user's own subscriptions. There is no mechanism to clear another user's subscriptions.
- Admin users cannot clear other users' subscriptions through this endpoint.
- The user ID is always derived from the authenticated session or token — no user ID parameter is accepted.
- PATs with sufficient scope can invoke this endpoint (for scripting and automation).
- Deploy keys cannot invoke this endpoint (deploy keys are repo-scoped, not user-scoped).

### Rate Limiting

- **Authenticated callers**: 10 requests per minute per user to `DELETE /api/user/subscriptions`. This is deliberately restrictive because:
  - The operation is expensive (bulk database write with counter decrements).
  - There is no legitimate reason to call it more than once in quick succession.
  - Rapid repeated calls could cause unnecessary database load.
- Rate limit responses use `429 Too Many Requests` with a `Retry-After` header.
- No anonymous access is permitted, so no anonymous rate limiting is needed.

### Data Privacy & PII

- The response contains only a numeric count. No user PII, no repository names, and no subscription details are included.
- No PII is exposed through this endpoint.
- The removal of subscriptions is not broadcast to other users. No webhook, notification, or activity feed entry is created.
- Watch history (when subscriptions were originally created) is not retained after deletion — watch records are hard-deleted.
- The operation does not reveal which repositories the user was watching (the count alone does not constitute PII).

## Telemetry & Product Analytics

### Key Business Events

| Event Name                           | Trigger                                                                                         | Properties                                                                                                                                         |
|--------------------------------------|-------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `RepoSubscriptionsClearedAll`        | `DELETE /api/user/subscriptions` returns 200 with `cleared_count > 0`                           | `user_id`, `cleared_count`, `modes_breakdown` (`{ watching: N, participating: N, ignored: N }`), `client` (web/cli/tui/api), `account_age_days`     |
| `RepoSubscriptionsClearedAllEmpty`   | `DELETE /api/user/subscriptions` returns 200 with `cleared_count === 0`                         | `user_id`, `client`                                                                                                                                |
| `RepoSubscriptionsClearAborted`      | User opens the confirmation dialog in the web UI or CLI prompt but cancels                      | `user_id`, `pending_count` (number of subscriptions that would have been cleared), `client`                                                         |
| `RepoSubscriptionsClearFailed`       | `DELETE /api/user/subscriptions` returns a 5xx error                                            | `user_id`, `status_code`, `client`, `error_message`                                                                                                |

### Event Properties

| Property            | Type    | Description                                                      |
|---------------------|---------|------------------------------------------------------------------|
| `user_id`           | string  | Authenticated user's ID                                          |
| `cleared_count`     | number  | Number of subscriptions removed                                  |
| `modes_breakdown`   | object  | Count of subscriptions per mode that were cleared                |
| `client`            | string  | Surface that triggered the action: `web`, `cli`, `tui`, `api`   |
| `account_age_days`  | number  | Days since user account creation (context for churn analysis)    |
| `pending_count`     | number  | Subscriptions that would have been cleared (for abort events)    |
| `status_code`       | number  | HTTP status code (for failure events)                            |
| `error_message`     | string  | Error details (for failure events)                               |

### Funnel Metrics & Success Indicators

- **Clear action conversion rate**: Percentage of users who visit the subscriptions page and then clear all subscriptions within the same session. Target: < 5%. If this exceeds 10%, it may indicate that the notification system is too noisy or that users can't find individual-unwatch flows.
- **Re-subscription rate after clear**: Percentage of users who re-subscribe to at least one repository within 24 hours of clearing. Target: > 60%. This indicates the clear was a deliberate "reset" rather than frustration-driven abandonment.
- **Time to first re-subscription**: Median time between clearing and subscribing to the first new repository. A short median (< 1 hour) suggests healthy reset behavior. A long median (> 1 week) may indicate the user is disengaging from the platform.
- **Cleared count distribution**: Histogram of `cleared_count` values. If most users are clearing < 5 subscriptions, the bulk-clear feature may be over-engineered and individual unwatches are sufficient. If most are clearing > 20, the feature is serving its purpose.
- **Abort rate**: Percentage of confirmation dialogs where the user cancels. Target: 20–40% (indicates the confirmation dialog is working — users are reading it).
- **Clear-to-churn correlation**: Track whether users who clear all subscriptions have higher 30-day churn rates. If so, consider proactive engagement measures.

## Observability

### Logging Requirements

| Log Event                                           | Level | Structured Context                                                                                              |
|-----------------------------------------------------|-------|-----------------------------------------------------------------------------------------------------------------|
| Subscription clear request received                 | INFO  | `user_id`, `request_id`                                                                                         |
| Subscriptions cleared successfully                  | INFO  | `user_id`, `cleared_count`, `modes_breakdown`, `duration_ms`, `request_id`                                       |
| Subscription clear — no subscriptions to clear      | DEBUG | `user_id`, `request_id`                                                                                         |
| Subscription clear — unauthenticated                | WARN  | `request_id`, `client_ip`                                                                                        |
| Subscription clear — rate limited                   | WARN  | `user_id`, `endpoint`, `request_id`, `client_ip`                                                                 |
| Subscription clear — transaction started            | DEBUG | `user_id`, `subscription_count`, `request_id`                                                                    |
| Subscription clear — watcher counts decremented     | DEBUG | `user_id`, `repository_ids_count`, `request_id`                                                                  |
| Subscription clear — transaction committed          | DEBUG | `user_id`, `cleared_count`, `duration_ms`, `request_id`                                                          |
| Subscription clear — transaction failed / rolled back | ERROR | `user_id`, `error_message`, `stack_trace`, `request_id`, `subscription_count`                                    |
| Subscription clear — slow operation (>5s)           | WARN  | `user_id`, `cleared_count`, `duration_ms`, `request_id`                                                          |

Note: The request receipt and success are logged at INFO level (not DEBUG) because this is an infrequent, destructive bulk operation.

### Prometheus Metrics

| Metric Name                                                        | Type      | Labels                          | Description                                                       |
|--------------------------------------------------------------------|-----------|---------------------------------|-------------------------------------------------------------------|
| `codeplane_repo_subscription_clear_requests_total`                 | Counter   | `status` (200/401/429/500)      | Total subscription clear requests by response status              |
| `codeplane_repo_subscription_clear_duration_seconds`               | Histogram | `status`                        | Request latency (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30) |
| `codeplane_repo_subscription_clear_subscriptions_removed_total`    | Counter   | —                               | Total number of individual subscriptions removed across all clear operations |
| `codeplane_repo_subscription_clear_batch_size`                     | Histogram | —                               | Distribution of `cleared_count` values (buckets: 0, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000) |
| `codeplane_repo_subscription_clear_rate_limited_total`             | Counter   | —                               | Total rate-limited clear requests                                 |

### Alerts

#### Alert: Subscription Clear High Error Rate
- **Condition**: `rate(codeplane_repo_subscription_clear_requests_total{status="500"}[10m]) > 0.5` sustained for 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. This endpoint involves a multi-step database transaction. Check server ERROR logs filtered by `subscription_clear` context.
  2. Check database connectivity and connection pool health.
  3. Look for transaction deadlocks — the clear operation touches both the `watches` table and potentially many rows in the `repositories` table (for counter decrements). Check PostgreSQL deadlock logs.
  4. Verify the `watches(user_id)` index exists and is not corrupted — the bulk DELETE depends on this index for performance.
  5. Check if a concurrent migration or bulk operation is holding locks on the `watches` or `repositories` tables.
  6. If errors started after a deployment, roll back and investigate.
  7. As a temporary mitigation, the individual `DELETE /api/repos/:owner/:repo/subscription` endpoint can be used as an alternative.

#### Alert: Subscription Clear High Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_subscription_clear_duration_seconds_bucket[10m])) > 10` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check the `codeplane_repo_subscription_clear_batch_size` histogram to determine if high latency correlates with large batch sizes.
  2. For large batches (>1000), the watcher-count decrement loop may be the bottleneck. Check if the decrements are batched efficiently.
  3. Run `EXPLAIN ANALYZE` on `DELETE FROM watches WHERE user_id = $1` — verify the `user_id` index is being used.
  4. Check overall database CPU, I/O, and connection utilization.
  5. If latency is caused by large batch sizes, consider implementing batched counter decrements (e.g., `UPDATE repositories SET num_watches = GREATEST(num_watches - 1, 0) WHERE id = ANY($1::int[])`).
  6. Monitor `pg_stat_activity` for long-running transactions from this endpoint.

#### Alert: Subscription Clear Spike
- **Condition**: `rate(codeplane_repo_subscription_clear_requests_total{status="200"}[1h]) > 10 * avg_over_time(rate(codeplane_repo_subscription_clear_requests_total{status="200"}[1h])[7d:1h])` sustained for 30 minutes.
- **Severity**: Info
- **Runbook**:
  1. A spike in clear-all operations may indicate a platform-wide notification fatigue event.
  2. Check if there was a recent mass-notification event by reviewing `notification_fanout` logs.
  3. Check if a UI or API change inadvertently made the clear button easier to trigger accidentally.
  4. Review the `client` label distribution — if the spike is concentrated on one client, check for client-side bugs.
  5. If the spike is organic user behavior, no action is needed, but consider investigating notification UX.

#### Alert: Subscription Clear Rate Limiting Spike
- **Condition**: `rate(codeplane_repo_subscription_clear_rate_limited_total[5m]) > 5` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify the source user IDs from access logs.
  2. Determine if the traffic is from a misbehaving script or automation retrying in a tight loop.
  3. If the user is legitimate, advise them that the operation is idempotent and does not need to be retried.
  4. If the traffic is abusive, consider applying a targeted block via admin controls.

### Error Cases and Failure Modes

| Failure Mode                                        | Expected Behavior                                                           | Detection                                   |
|-----------------------------------------------------|-----------------------------------------------------------------------------|---------------------------------------------|
| Database unavailable                                | Return 500. Log ERROR. Transaction not started.                             | `status=500` counter spike                 |
| Transaction deadlock during counter decrements      | Transaction rolls back. Return 500. No subscriptions deleted.               | ERROR log with deadlock context             |
| `watches` table index missing                       | DELETE becomes slow (sequential scan). Operation may timeout.               | Latency histogram p95 alert fires           |
| Counter decrement causes negative count             | `GREATEST(num_watches - 1, 0)` prevents negative. Worst case: count = 0.   | No alert — self-healing                     |
| Auth token expired mid-request                      | Return 401. Transaction not started.                                        | 401 counter                                 |
| Concurrent clear requests from same user            | First completes normally. Second returns `{ "cleared_count": 0 }`.          | No alert — idempotency handles this         |
| Very large subscription set (>5000)                 | Operation takes longer but completes within timeout. May trigger latency alert. | Latency and batch_size histograms          |
| Repository deleted during clear (FK issue)          | DELETE succeeds (watches row deleted, no counter decrement needed for deleted repo). | No alert — normal operation               |
| Partial counter decrement failure                   | Transaction rolls back entirely. No subscriptions removed.                  | ERROR log with transaction rollback context |

## Verification

### API Integration Tests

| Test ID          | Test Description                                                                                              | Expected Result                                                                                   |
|------------------|---------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| `API-RSC-001`    | `DELETE /api/user/subscriptions` when user has 3 subscriptions (one each of watching, participating, ignored)  | `200`, `{ "cleared_count": 3 }`                                                                  |
| `API-RSC-002`    | After clearing, `GET /api/user/subscriptions` returns empty list                                               | `200`, `{ "items": [], "total_count": 0 }`                                                       |
| `API-RSC-003`    | After clearing, `GET /api/repos/:owner/:repo/subscription` for previously-watched repo returns not subscribed  | `200`, `{ "subscribed": false }`                                                                 |
| `API-RSC-004`    | After clearing, repository's watcher count is decremented correctly                                            | `GET /api/repos/:owner/:repo` shows `num_watches` decremented by 1 for each previously-watched repo |
| `API-RSC-005`    | `DELETE /api/user/subscriptions` when user has zero subscriptions                                              | `200`, `{ "cleared_count": 0 }`                                                                  |
| `API-RSC-006`    | Call `DELETE /api/user/subscriptions` twice in quick succession                                                 | First: `200`, `{ "cleared_count": N }`. Second: `200`, `{ "cleared_count": 0 }`                  |
| `API-RSC-007`    | Unauthenticated request to `DELETE /api/user/subscriptions`                                                    | `401`, `{ "message": "authentication required" }`                                                |
| `API-RSC-008`    | `DELETE /api/user/subscriptions` with expired PAT                                                              | `401`                                                                                             |
| `API-RSC-009`    | Clearing does not remove the user's starred repositories                                                        | After clear, `GET /api/user/starred` still lists previously-starred repos                         |
| `API-RSC-010`    | Clearing does not affect another user's subscriptions                                                           | User B watches the same repo as User A. User A clears. User B's subscription remains intact.     |
| `API-RSC-011`    | Watcher count for a repo watched by two users: after one clears, count decrements by 1 (not 2)                 | `num_watches` goes from 2 to 1                                                                    |
| `API-RSC-012`    | Watcher count never goes below 0 even under race conditions                                                     | Watch repo (count=1), clear, then manually decrement → count stays at 0                           |
| `API-RSC-013`    | Clear with mixed public and private repo subscriptions                                                          | All subscriptions cleared, `cleared_count` includes both public and private repos                 |
| `API-RSC-014`    | Clear with subscriptions to repos across multiple owners (personal + org)                                       | All subscriptions cleared regardless of owner type                                                |
| `API-RSC-015`    | After clearing, re-subscribing to a previously-watched repo works                                               | `PUT /api/repos/:owner/:repo/subscription` succeeds, subscription is re-established              |
| `API-RSC-016`    | Response content-type is `application/json`                                                                     | `Content-Type` header is `application/json`                                                       |
| `API-RSC-017`    | Request body sent with DELETE is ignored — no error                                                             | `200`, `{ "cleared_count": N }` — body does not affect behavior                                  |
| `API-RSC-018`    | Unknown query parameters are ignored                                                                            | `DELETE /api/user/subscriptions?foo=bar` → `200`, normal response                                |
| `API-RSC-019`    | PAT authentication works for clear                                                                              | `200` with valid PAT                                                                              |
| `API-RSC-020`    | Session cookie authentication works for clear                                                                   | `200` with valid session cookie                                                                   |
| `API-RSC-021`    | `cleared_count` is an exact integer, not a string                                                               | `typeof response.cleared_count === "number"`                                                      |
| `API-RSC-022`    | User watches 1 repo, clears, watches same repo again, clears again                                              | First clear: `{ "cleared_count": 1 }`. Second clear: `{ "cleared_count": 1 }`. Both succeed.    |
| `API-RSC-023`    | Clear subscriptions for a user who watches a repo that was subsequently deleted                                  | `200`, subscription to deleted repo is silently cleaned up, `cleared_count` reflects actual deletions |
| `API-RSC-024`    | Clear subscriptions when user watches a repo that was transferred to a new owner                                 | `200`, subscription cleared. New owner path has correct watcher count.                            |
| `API-RSC-025`    | Verify atomicity: if counter decrement for one repo would fail, no subscriptions are removed                     | Database transaction rollback: 500 error, subscription list remains unchanged                    |
| `API-RSC-026`    | Clear with exactly 1 subscription                                                                                | `200`, `{ "cleared_count": 1 }`                                                                  |
| `API-RSC-027`    | Clear with 100 subscriptions — verify all watcher counts decremented                                             | All 100 repos have `num_watches` decremented by 1                                                |
| `API-RSC-028`    | Maximum valid subscription count test: user with 1000 subscriptions                                              | `200`, `{ "cleared_count": 1000 }`, completes within 30s                                         |
| `API-RSC-029`    | Notification preferences (email toggle) are unchanged after clear                                                | `GET /api/user/settings/notifications` returns same `email_notifications_enabled` value           |
| `API-RSC-030`    | Rate limiting: 11th request within 1 minute returns 429                                                          | `429` with `Retry-After` header                                                                  |

### CLI E2E Tests

| Test ID          | Test Description                                                                              | Expected Result                                                                |
|------------------|-----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `CLI-RSC-001`    | `codeplane repo unwatch-all --confirm` when user has subscriptions                             | Exit 0, output contains "Cleared N subscriptions"                              |
| `CLI-RSC-002`    | `codeplane repo unwatch-all --confirm --json` when user has subscriptions                      | Exit 0, valid JSON `{ "cleared_count": N }`                                    |
| `CLI-RSC-003`    | `codeplane repo unwatch-all --confirm` when user has zero subscriptions                        | Exit 0, output contains "Cleared 0 subscriptions"                              |
| `CLI-RSC-004`    | `codeplane repo unwatch-all --confirm --json` when user has zero subscriptions                 | Exit 0, `{ "cleared_count": 0 }`                                              |
| `CLI-RSC-005`    | `codeplane repo unwatch-all --confirm` when not authenticated                                  | Exit 1, stderr contains "authentication"                                       |
| `CLI-RSC-006`    | `codeplane repo unwatch-all` with no `--confirm` in non-interactive terminal                   | Exit 1, stderr contains "Use --confirm"                                        |
| `CLI-RSC-007`    | Watch 3 repos via CLI, then `codeplane repo unwatch-all --confirm`, then `codeplane repo list --watched --json` | Clear output: "Cleared 3 subscriptions". List output: empty items array.       |
| `CLI-RSC-008`    | `codeplane repo unwatch-all --confirm` output uses correct singular ("1 subscription")         | Exit 0, output says "Cleared 1 subscription" (not "1 subscriptions")           |
| `CLI-RSC-009`    | `codeplane repo unwatch-all --json` output (without --confirm) in non-interactive terminal     | Exit 1 (confirmation required even with --json if no --confirm)                |
| `CLI-RSC-010`    | `codeplane repo unwatch-all --confirm`, then `codeplane repo watch owner/repo`, then `codeplane repo unwatch-all --confirm --json` | Final clear returns `{ "cleared_count": 1 }`                                   |

### Web UI Playwright E2E Tests

| Test ID          | Test Description                                                                                 | Expected Result                                                                          |
|------------------|--------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| `UI-RSC-001`     | "Clear all subscriptions" button is visible on subscriptions page when user has subscriptions      | Button with "Clear all subscriptions" label is visible                                   |
| `UI-RSC-002`     | "Clear all subscriptions" button is NOT visible when user has zero subscriptions                   | Button is hidden; empty state message is shown                                           |
| `UI-RSC-003`     | Clicking "Clear all subscriptions" opens a confirmation dialog                                    | Dialog appears with title "Clear all subscriptions?" and a count of subscriptions        |
| `UI-RSC-004`     | Confirmation dialog shows correct subscription count                                              | Dialog body contains the exact number of subscriptions the user has                      |
| `UI-RSC-005`     | Clicking "Cancel" in the confirmation dialog dismisses it without clearing                        | Dialog closes, subscription list is unchanged                                            |
| `UI-RSC-006`     | Pressing Escape dismisses the confirmation dialog without clearing                                | Dialog closes, subscription list is unchanged                                            |
| `UI-RSC-007`     | Clicking "Clear all" in the confirmation dialog clears all subscriptions                          | Dialog closes, success toast appears, subscription list is now empty                     |
| `UI-RSC-008`     | After clearing, the subscription list shows the empty state                                       | Empty state message is visible, "Clear all" button is hidden                             |
| `UI-RSC-009`     | After clearing, success toast displays correct count (e.g., "Cleared 5 subscriptions")            | Toast message contains the cleared count                                                 |
| `UI-RSC-010`     | After clearing, refreshing the page shows the empty subscription list                             | Subscription list remains empty after reload                                             |
| `UI-RSC-011`     | After clearing, navigating to a previously-watched repo shows the watch button in "Watch" state   | Watch button is in unsubscribed state                                                    |
| `UI-RSC-012`     | Simulate API error during clear (intercept and return 500)                                        | Dialog closes, error toast appears, subscription list is unchanged                       |
| `UI-RSC-013`     | Clicking "Clear all" shows the button in loading/disabled state while the request is in flight     | Button shows spinner, is non-interactive during the operation                             |
| `UI-RSC-014`     | Confirmation dialog displays singular "1 repository" when only one subscription exists            | Dialog body reads "1 repository" not "1 repositories"                                    |
| `UI-RSC-015`     | After clearing and re-watching a repo, the subscriptions page shows the new subscription          | New subscription appears in the list                                                     |

### TUI Integration Tests

| Test ID          | Test Description                                                                           | Expected Result                                                        |
|------------------|--------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| `TUI-RSC-001`    | Clear-all action is available on the subscriptions screen when subscriptions exist           | Keyboard shortcut or command palette entry is available                 |
| `TUI-RSC-002`    | Clear-all action shows confirmation prompt with subscription count                          | Prompt displays "Clear all {N} subscriptions? [y/N]"                   |
| `TUI-RSC-003`    | Confirming with "y" clears all subscriptions and shows success message                      | Status message: "Cleared {N} subscriptions", list updates to empty     |
| `TUI-RSC-004`    | Declining with "n" or empty input cancels the operation                                     | Subscriptions remain unchanged, no API call made                       |
| `TUI-RSC-005`    | Clear-all is not available (or is a no-op) when the subscription list is empty              | No prompt shown, or prompt indicates nothing to clear                  |
| `TUI-RSC-006`    | After clearing, navigating away and back shows the empty subscription list                  | Subscription screen shows empty state on re-entry                      |

### Load & Boundary Tests

| Test ID          | Test Description                                                                  | Expected Result                                                                |
|------------------|-----------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `LOAD-RSC-001`   | Clear 1,000 subscriptions in a single request                                      | `200`, `{ "cleared_count": 1000 }`, completes within 30 seconds               |
| `LOAD-RSC-002`   | Clear 5,000 subscriptions in a single request                                      | `200`, `{ "cleared_count": 5000 }`, completes within 30 seconds               |
| `LOAD-RSC-003`   | Clear 10,000 subscriptions (maximum reasonable bound)                               | `200`, `{ "cleared_count": 10000 }`, completes within 30 seconds              |
| `LOAD-RSC-004`   | Attempt to clear 10,001 subscriptions (one above max reasonable bound)              | `200`, `{ "cleared_count": 10001 }` — no artificial cap, but operation time is logged |
| `LOAD-RSC-005`   | 5 concurrent clear requests from the same user                                      | One returns a non-zero count, others return `{ "cleared_count": 0 }`. No errors. No negative watcher counts. |
| `LOAD-RSC-006`   | Rate limiting engages after 10 requests in 1 minute                                 | 11th request returns `429` with `Retry-After` header                           |
| `LOAD-RSC-007`   | Clear subscriptions from 10 different users concurrently                             | All succeed independently. No cross-user interference. Watcher counts are correct. |
| `LOAD-RSC-008`   | After clearing 100 subscriptions, verify all 100 repos' watcher counts decremented   | Each of the 100 repositories has `num_watches` decremented by exactly 1        |

# NOTIFICATION_FANOUT_PIPELINE

Specification for NOTIFICATION_FANOUT_PIPELINE.

## High-Level User POV

When something happens on Codeplane that is relevant to a user — someone assigns them to an issue, comments on their landing request, reviews their code, shares a workspace, or completes a workflow they initiated — the user is automatically and immediately notified. They do not need to poll, manually refresh, or check each repository individually. The notification arrives in their inbox across every connected client — web UI, CLI, TUI, desktop, and editor — within seconds of the triggering event.

The notification fanout pipeline is the invisible engine that makes Codeplane's collaboration feel real-time. A single event, such as a comment on a busy issue, can generate notifications for many people simultaneously: the issue author, all current assignees, anyone @mentioned in the comment body, and everyone watching the repository. Each of these recipients receives a personalized, contextual notification with a clear subject line that tells them exactly what happened and where, like "New comment on issue #42: Fix broken auth flow" along with a preview of the comment body. The only person excluded is the actor who triggered the event — no one needs to be told about their own action.

Users control whether they receive notifications through a simple toggle in their notification preferences. If a user has disabled notifications, the pipeline silently skips them, ensuring no unwanted noise. Users who watch repositories opt in to a broader stream of activity and receive notifications for events on issues and landing requests across that repository, not just events that directly involve them.

The pipeline supports eight distinct trigger scenarios that cover the core collaboration lifecycle: issue assignment, issue comments, landing request reviews, landing request comments, landing request changes pushed, workspace failure status changes, workspace sharing, and workflow run completion. Each trigger has a carefully defined audience — for example, when changes are pushed to a landing request, only previous reviewers are notified (since they need to know the code they reviewed has changed), whereas when a workspace fails, only the owner is notified.

@mentions in comment bodies are resolved to real users and those users are added to the notification audience. This means a user who has never interacted with an issue can still be pulled into the conversation when someone types @their-username in a comment. Unknown @mentions are silently ignored — there is no error, no broken link, no ghost notification.

The experience is designed to be resilient. If the system fails to notify one user in a batch of fifty, the other forty-nine still receive their notifications. If the real-time delivery channel hiccups, the notification is still persisted in the database and appears the next time the user checks their inbox. The user never sees an incomplete or broken notification state — the worst case is a brief delay, not data loss.

## Acceptance Criteria

### Trigger Events

- [ ] A notification is created for each assignee (minus the actor) when users are assigned to an issue.
- [ ] A notification is created for the issue author, all current assignees, all @mentioned users, and all repository watchers (minus the commenter) when a comment is posted on an issue.
- [ ] A notification is created for the landing request author (minus the reviewer) when a landing request receives a review.
- [ ] A notification is created for the landing request author, all @mentioned users, and all repository watchers (minus the commenter) when a comment is posted on a landing request.
- [ ] A notification is created for all previous reviewers of a landing request (minus the pusher) when new changes are pushed to that landing request.
- [ ] A notification is created for the workspace owner when a workspace transitions to a `"failed"` status.
- [ ] No notification is created for workspace status transitions other than `"failed"` (e.g., `"running"`, `"stopped"`, `"suspended"`).
- [ ] A notification is created for each shared-with user (minus the sharer) when a workspace is shared.
- [ ] A notification is created for the workflow run initiator when a workflow run reaches a terminal status (`success`, `failure`, `cancelled`).

### Recipient Resolution

- [ ] The actor who triggers the event is always excluded from the notification audience.
- [ ] Recipients are deduplicated — a user who is both an assignee and a repo watcher receives exactly one notification per event.
- [ ] Repository watchers are included in the audience for issue-assigned, issue-commented, landing-request-commented, and landing-request-changes-pushed events.
- [ ] Repository watchers are paginated during collection at a page size of 200. Repositories with thousands of watchers must be fully traversed.
- [ ] @mentions in comment bodies are parsed using the pattern `@username` where `username` matches `[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?`.
- [ ] @mention resolution is case-insensitive (e.g., `@Alice` and `@alice` resolve to the same user).
- [ ] @mentions that do not correspond to an existing user are silently ignored.
- [ ] Duplicate @mentions within the same comment body produce only one notification.
- [ ] Previous reviewers on a landing request are collected by paging through all reviews at a page size of 100.

### User Preferences

- [ ] Users with `email_notifications_enabled` set to `false` do not receive any notifications from the fanout pipeline.
- [ ] The preference check is performed per-recipient at fanout time, not cached.
- [ ] If a user disables notifications between the triggering event and the fanout execution, they do not receive the notification.

### Notification Content

- [ ] The `subject` field is a human-readable sentence describing the event.
- [ ] The `subject` field does not exceed 255 characters. Titles that would push the subject past 255 characters are truncated.
- [ ] Issue comment and landing request comment notifications include a `body` preview truncated to 200 characters, with `"..."` appended if truncated.
- [ ] Non-comment events (assignments, reviews, status changes, sharing) have an empty string `""` body.
- [ ] Each notification has a `source_type` matching one of the seven defined types: `issue`, `issue_comment`, `landing_request`, `lr_review`, `lr_comment`, `workspace`, `workflow_run`.
- [ ] Each notification has a `source_id` pointing to the originating entity.
- [ ] Workflow run completed notifications render `"success"` as `"succeeded"` in the subject.

### Delivery

- [ ] Each notification is persisted to the database before any real-time delivery attempt.
- [ ] After persistence, a PostgreSQL NOTIFY event is emitted on the user's notification channel (`user_notifications_{userId}`).
- [ ] The PG NOTIFY payload is a JSON object containing `user_id` and `notification_id`.
- [ ] PG NOTIFY failures do not cause the fanout to fail — they are best-effort.
- [ ] Individual recipient failures do not abort the fanout for remaining recipients.
- [ ] A fanout that fails entirely still returns a success result (the method is best-effort).

### Edge Cases

- [ ] An event with zero recipients after deduplication and actor exclusion creates zero notifications and returns success.
- [ ] An event where the only recipient is the actor creates zero notifications.
- [ ] A comment body with zero @mentions still fans out to the other recipient categories.
- [ ] A comment body containing only invalid @mentions resolves zero mentioned users.
- [ ] A comment body that is empty string produces an empty body preview.
- [ ] A comment body that is exactly 200 characters is not truncated and has no `"..."` appended.
- [ ] A comment body that is 201 characters is truncated to 200 characters with `"..."` appended.
- [ ] An issue with zero assignees produces notifications only for repo watchers (minus the actor).
- [ ] A repository with zero watchers produces no watcher-sourced notifications.
- [ ] A landing request with zero previous reviewers produces zero notifications from the changes-pushed event.
- [ ] Concurrent fanout operations for the same triggering event produce duplicate notifications. Idempotency is not a current requirement but should be called out.

### Boundary Constraints

- [ ] Notification subject max length: 255 characters.
- [ ] Notification body preview max length: 200 characters (before `"..."` suffix).
- [ ] @mention username min length: 1 character (single alphanumeric).
- [ ] @mention username allowed characters: alphanumeric, period, hyphen, underscore. Must start and end with alphanumeric.
- [ ] Watcher page size: 200 per page.
- [ ] Reviewer page size: 100 per page.
- [ ] Maximum fanout recipients per event: unbounded (limited only by total watchers + assignees + mentions).

### Definition of Done

- [ ] All eight event handler methods are implemented and tested.
- [ ] Fanout is wired into all relevant server route handlers (issues, landings, workflows, workspaces).
- [ ] Notifications created by the pipeline are visible in the inbox (web UI, CLI, TUI).
- [ ] Real-time SSE delivery works for connected clients.
- [ ] User notification preference is respected.
- [ ] All E2E tests pass.
- [ ] Observability metrics and logging are in place.

## Design

### API Shape

The notification fanout pipeline is not a user-facing API surface — it has no dedicated HTTP endpoint. Instead, it is invoked server-side by the route handlers for the triggering domains. The pipeline writes to the same `notifications` table and PG NOTIFY channels consumed by the existing notification list and streaming endpoints.

**Triggering Integration Points:**

| Route Handler | HTTP Method & Path | Fanout Method Called |
|---|---|---|
| Issue assignee update | `PATCH /api/repos/:owner/:repo/issues/:number` | `onIssueAssigned()` |
| Issue comment create | `POST /api/repos/:owner/:repo/issues/:number/comments` | `onIssueCommented()` |
| LR review create | `POST /api/repos/:owner/:repo/landings/:number/reviews` | `onLRReviewed()` |
| LR comment create | `POST /api/repos/:owner/:repo/landings/:number/comments` | `onLRCommented()` |
| LR changes pushed | Internal event on bookmark/ref update | `onLRChangesPushed()` |
| Workspace status change | Internal event on container state transition | `onWorkspaceStatusChanged()` |
| Workspace share | `POST /api/workspaces/:id/share` | `onWorkspaceShared()` |
| Workflow run complete | Internal event on run status transition | `onWorkflowRunCompleted()` |

**Notification Record Shape (created by the pipeline):**

```json
{
  "id": 12345,
  "user_id": 67,
  "source_type": "issue_comment",
  "source_id": 890,
  "subject": "New comment on issue #42: Fix broken auth flow",
  "body": "I think we should also handle the edge case where the token is expired but the refresh token is still...",
  "status": "unread",
  "read_at": null,
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**PG NOTIFY Payload Shape:**

```json
{
  "user_id": 67,
  "notification_id": 12345
}
```

### SDK Shape

The pipeline is exposed as `NotificationFanoutService` in `@codeplane/sdk`. It is instantiated once in the server's service registry and injected into route handlers.

**Public Methods:**

| Method | Event Input | Recipients |
|---|---|---|
| `onIssueAssigned(event)` | `IssueAssignedEvent` | Assignees + repo watchers − actor |
| `onIssueCommented(event)` | `IssueCommentedEvent` | Issue author + assignees + @mentioned + repo watchers − commenter |
| `onLRReviewed(event)` | `LRReviewedEvent` | LR author − reviewer |
| `onLRCommented(event)` | `LRCommentedEvent` | LR author + @mentioned + repo watchers − commenter |
| `onLRChangesPushed(event)` | `LRChangesPushedEvent` | All previous reviewers − pusher |
| `onWorkspaceStatusChanged(event)` | `WorkspaceStatusChangedEvent` | Workspace owner (only on `"failed"`) |
| `onWorkspaceShared(event)` | `WorkspaceSharedEvent` | Shared-with users − sharer |
| `onWorkflowRunCompleted(event)` | `WorkflowRunCompletedEvent` | Run initiator |

**Exported Helpers:**

| Function | Purpose |
|---|---|
| `parseMentions(text: string): string[]` | Extract deduplicated @username mentions from text |
| `truncateBody(body: string, maxLen?: number): string` | Truncate body preview with `"..."` suffix |

### Web UI Design

The notification fanout pipeline is invisible to the web UI user. Its output is consumed through the existing notification inbox (NOTIFICATION_INBOX_UI) and SSE stream. The following behaviors should be observable from the web UI after fanout fires:

- The unread notification badge in the global header increments in real time when a fanout event targets the current user.
- Clicking the notification badge opens the inbox showing the new notification at the top.
- Each notification displays the correct icon for its `source_type` (issue icon, landing request icon, workspace icon, workflow icon).
- Clicking a notification navigates to the source entity (issue detail, landing request detail, workspace detail, workflow run detail).
- The notification subject and body preview match the templates defined above.

### CLI Command

The CLI does not expose fanout-specific commands. Fanout results are consumed via the existing `notification list` command:

```bash
# See notifications generated by the pipeline
codeplane notification list
codeplane notification list --unread

# Mark a fanout-generated notification as read
codeplane notification read <id>
```

The CLI should display the `source_type` as a readable label (e.g., `[issue]`, `[lr-review]`, `[workspace]`, `[workflow]`) alongside the subject.

### TUI UI

The TUI notification list screen and badge consume fanout-generated notifications via the same API and SSE stream. No TUI-specific changes are required beyond ensuring:

- The TUI notification list displays all seven `source_type` values with appropriate icons.
- The TUI notification badge updates in real time via SSE when a fanout event creates a new notification for the user.
- The TUI detail navigation correctly routes to the source entity screen based on `source_type`.

### Documentation

The following end-user documentation should be written:

**"Understanding Notifications" guide:**
- What events generate notifications (the eight trigger scenarios, described in plain language).
- Who receives notifications for each event type (with examples).
- How @mentions work in comments (syntax, case-insensitivity, unknown usernames ignored).
- How repository watching affects notification volume.
- How to disable notifications via preferences.

**"Notification Preferences" guide:**
- How to toggle notifications on/off.
- What "disabling notifications" means (no new notifications created; existing ones remain visible).
- Where preferences are accessible (web settings, CLI config).

## Permissions & Security

### Authorization

| Action | Required Role |
|---|---|
| Triggering fanout (indirectly via issue comment, review, etc.) | Must have permission to perform the triggering action (e.g., must be a collaborator to comment) |
| Receiving a notification | Any authenticated user who is in the recipient set |
| Reading notifications | Authenticated user (own notifications only) |
| Managing notification preferences | Authenticated user (own preferences only) |

- Anonymous users never receive notifications.
- The fanout pipeline does not perform its own authorization — it trusts that the triggering route handler has already authorized the action.
- Notifications are strictly user-scoped. The pipeline creates notifications with an explicit `user_id`, and the read path filters by the authenticated user's ID. There is no cross-user visibility.

### Rate Limiting

- The fanout pipeline itself is not directly rate-limited (it runs server-side as a consequence of authorized actions).
- The triggering actions are rate-limited at their respective route handlers:
  - Issue comment creation: subject to the issues route rate limit.
  - LR review/comment creation: subject to the landings route rate limit.
  - Workspace sharing: subject to the workspaces route rate limit.
- A safety cap should be enforced: if a single fanout event would generate more than **5,000 notifications** (e.g., a repository with thousands of watchers), the pipeline should log a warning and proceed but consider truncating the watcher set to prevent unbounded write amplification.

### Data Privacy

- Notification subjects may contain issue titles, landing request titles, workspace names, and workflow names. These are visible only to the notification recipient.
- Notification bodies may contain truncated comment text. The 200-character truncation reduces exposure but may still include sensitive content. Users should be aware that commenting on a watched repository creates previews visible to all watchers.
- @mention parsing does not leak user existence — lookups are case-insensitive and failures are silent. An attacker cannot enumerate users by observing notification behavior.
- PG NOTIFY payloads contain only `user_id` and `notification_id` — no sensitive content is transmitted on the notification channel.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|---|---|---|
| `NotificationFanoutTriggered` | When a fanout method begins execution | `event_type` (e.g., `issue_assigned`), `source_type`, `source_id`, `repository_id` (if applicable), `actor_id`, `timestamp` |
| `NotificationFanoutCompleted` | When a fanout method completes | `event_type`, `source_type`, `source_id`, `recipient_count`, `skipped_count` (users with notifications disabled), `duration_ms`, `success` (boolean) |
| `NotificationCreated` | When a single notification is persisted | `notification_id`, `user_id`, `source_type`, `source_id`, `trigger_event_type` |
| `NotificationMentionResolved` | When an @mention is successfully resolved to a user | `mentioned_username`, `resolved_user_id`, `source_type`, `source_id` |

### Funnel Metrics & Success Indicators

| Metric | Definition | Success Threshold |
|---|---|---|
| Fanout-to-inbox visibility rate | % of created notifications that appear in the user's inbox within 5 seconds | ≥ 99.9% |
| Fanout latency (p50 / p95 / p99) | Time from triggering event to last notification persisted | p50 ≤ 100ms, p95 ≤ 500ms, p99 ≤ 2s |
| SSE real-time delivery rate | % of persisted notifications that reach a connected SSE client within 2 seconds | ≥ 99% (for connected clients) |
| Notification opt-out rate | % of eligible recipients skipped due to disabled preferences | Monitor trend; no threshold (informational) |
| Notification engagement rate | % of fanout-created notifications that are eventually marked as read | ≥ 50% within 7 days |
| @mention resolution rate | % of @mentions in comments that resolve to real users | Monitor trend (informs mention UX quality) |
| Fanout error rate | % of fanout invocations that experience any per-recipient failure | ≤ 0.1% |

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Fanout initiated | `info` | `event_type`, `source_type`, `source_id`, `repository_id`, `actor_id` |
| Recipient set computed | `debug` | `event_type`, `source_id`, `total_recipients`, `assignee_count`, `watcher_count`, `mention_count` |
| User preference skipped | `debug` | `user_id`, `source_type`, `source_id`, `reason: "notifications_disabled"` |
| Notification created | `debug` | `notification_id`, `user_id`, `source_type`, `source_id` |
| PG NOTIFY emitted | `debug` | `user_id`, `notification_id`, `channel` |
| PG NOTIFY failed | `warn` | `user_id`, `notification_id`, `error` |
| Recipient creation failed | `warn` | `user_id`, `source_type`, `source_id`, `error` |
| Mention resolution failed | `warn` | `username`, `error` |
| Watcher page fetch failed | `warn` | `repository_id`, `offset`, `error` |
| Fanout completed | `info` | `event_type`, `source_type`, `source_id`, `recipients_notified`, `recipients_skipped`, `duration_ms` |
| Large fanout warning | `warn` | `event_type`, `source_id`, `recipient_count`, `threshold: 5000` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_notification_fanout_total` | Counter | `event_type`, `source_type` | Total fanout invocations |
| `codeplane_notification_fanout_duration_seconds` | Histogram | `event_type`, `source_type` | Duration of fanout execution (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10) |
| `codeplane_notification_fanout_recipients` | Histogram | `event_type`, `source_type` | Number of recipients per fanout (buckets: 0, 1, 5, 10, 25, 50, 100, 500, 1000, 5000) |
| `codeplane_notifications_created_total` | Counter | `source_type` | Total notifications created |
| `codeplane_notification_fanout_skipped_total` | Counter | `source_type`, `reason` | Skipped recipient count (reasons: preference_disabled, user_not_found, creation_failed) |
| `codeplane_notification_pgnotify_total` | Counter | `status` (success, failure) | PG NOTIFY emission count |
| `codeplane_notification_mention_resolved_total` | Counter | `status` (resolved, not_found, error) | @mention resolution count |
| `codeplane_notification_watcher_pages_fetched_total` | Counter | — | Watcher pagination pages fetched |

### Alerts & Runbooks

**Alert: `NotificationFanoutHighErrorRate`**
- **Condition:** `rate(codeplane_notification_fanout_skipped_total{reason="creation_failed"}[5m]) / rate(codeplane_notifications_created_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `warn`-level "Recipient creation failed" entries.
  2. Inspect the database for connection pool exhaustion or write failures (`SELECT * FROM pg_stat_activity WHERE state = 'idle in transaction'`).
  3. Check disk space on the database server — the notifications table may be at capacity.
  4. Verify the `createNotification` SQL query is not deadlocking or timing out.
  5. If the issue is transient (database restart, network blip), confirm error rate recovers within 10 minutes and close the alert.
  6. If persistent, check for schema migration issues or corrupted indexes on the notifications table.

**Alert: `NotificationFanoutHighLatency`**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_notification_fanout_duration_seconds_bucket[5m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. Check the `event_type` label on the metric to identify which event types are slow.
  2. For slow watcher-based events, check `codeplane_notification_fanout_recipients` histogram — a spike in recipients indicates a large repo watcher set.
  3. Query `SELECT count(*) FROM repo_watchers WHERE repository_id = '<id>'` for repositories with high fanout.
  4. Check database query latency for `listRepoWatchers` and `createNotification` queries.
  5. If latency is caused by O(n) sequential DB inserts, this is expected for large fanouts but may need batching as an optimization.
  6. Consider enabling async fanout (move to a background job queue) if latency impacts the triggering request's response time.

**Alert: `NotificationPGNotifyFailureSpike`**
- **Condition:** `rate(codeplane_notification_pgnotify_total{status="failure"}[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. PG NOTIFY failures are non-fatal but degrade real-time delivery (users see notifications on next poll/page load instead of instantly).
  2. Check PostgreSQL logs for NOTIFY-related errors.
  3. Verify the PostgreSQL connection pool is not exhausted.
  4. Check if `pg_notify` is hitting the 8000-byte payload limit (unlikely with the minimal payload shape, but verify).
  5. Check if the PostgreSQL server's NOTIFY queue is backed up.
  6. If the NOTIFY subsystem is degraded, users still receive notifications via polling — this is a degraded-but-functional state.

**Alert: `NotificationFanoutLargeRecipientSet`**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_notification_fanout_recipients_bucket[5m])) > 5000`
- **Severity:** Info
- **Runbook:**
  1. Identify the repository with the large watcher set from the `source_id` in logs.
  2. Evaluate whether the watcher count is legitimate or indicates a bot/spam problem.
  3. Consider implementing a watcher cap or async fanout for repositories with >5000 watchers.
  4. Monitor response time for the triggering endpoint — large synchronous fanouts may cause user-visible latency.

**Alert: `NotificationFanoutZeroCreated`**
- **Condition:** `rate(codeplane_notifications_created_total[15m]) == 0` AND `rate(codeplane_notification_fanout_total[15m]) > 0`
- **Severity:** Critical
- **Runbook:**
  1. Fanout is being triggered but no notifications are being created. This is a total pipeline failure.
  2. Check server logs for `warn`-level creation failures.
  3. Verify the notifications table exists and is writable.
  4. Check if all users have `email_notifications_enabled = false` — unlikely but possible in test environments.
  5. Verify the `createNotification` SQL function signature hasn't changed after a migration.
  6. Roll back any recent database migrations that may have affected the notifications table.

### Error Cases & Failure Modes

| Failure Mode | Impact | Behavior |
|---|---|---|
| Database write failure for one recipient | Degraded (one user misses notification) | Logged at `warn`; other recipients unaffected |
| Database write failure for all recipients | Total fanout failure | Logged at `warn` per recipient; method still returns `Result.ok` |
| PG NOTIFY failure | Degraded real-time delivery | Notification persisted; user sees it on next poll; logged at `warn` |
| User lookup failure during preference check | One recipient skipped | Logged at `warn`; treated as "user not found" |
| @mention username lookup failure | Mentioned user not notified | Logged at `warn`; other recipients unaffected |
| Watcher page fetch failure | Some watchers missed | Logged at `warn`; pagination aborts at failed page |
| Database connection pool exhaustion | All creates fail for duration | Logged at `warn` per attempt; recovers when pool frees |
| Triggering route handler fails before calling fanout | No fanout occurs | No notification; user sees error response from the triggering action |

## Verification

### API Integration Tests

**Trigger → Notification Creation:**

- [ ] `POST /api/repos/:owner/:repo/issues/:number` with assignee change → verify a notification exists for each new assignee via `GET /api/notifications/list`.
- [ ] `POST /api/repos/:owner/:repo/issues/:number/comments` → verify notifications exist for issue author, assignees, and mentioned users.
- [ ] `POST /api/repos/:owner/:repo/landings/:number/reviews` → verify a notification exists for the LR author.
- [ ] `POST /api/repos/:owner/:repo/landings/:number/comments` → verify notifications exist for the LR author and mentioned users.
- [ ] Workspace status transition to `"failed"` → verify a notification exists for the workspace owner.
- [ ] Workspace share action → verify notifications exist for shared-with users.
- [ ] Workflow run completion (success) → verify a notification exists for the run initiator.
- [ ] Workflow run completion (failure) → verify a notification exists for the run initiator with correct status label.
- [ ] Workflow run completion (cancelled) → verify a notification exists for the run initiator with `"cancelled"` in subject.

**Actor Exclusion:**

- [ ] Issue assignee self-assignment → verify no notification is created for the assigning user.
- [ ] Issue comment by the issue author → verify the author does not receive a notification from their own comment.
- [ ] LR review by the LR author → verify the author does not receive a notification.
- [ ] LR comment by the LR author → verify the author does not receive a notification from their own comment.
- [ ] Workspace shared by the workspace owner with themselves in the shared-with list → verify no notification for the sharer.

**Recipient Deduplication:**

- [ ] User is both an issue assignee and a repo watcher → verify they receive exactly one notification per event.
- [ ] User is @mentioned twice in the same comment → verify they receive exactly one notification.
- [ ] User is the issue author, an assignee, @mentioned, and a watcher → verify they receive exactly one notification.

**@Mention Resolution:**

- [ ] Comment with `@validuser` → verify `validuser` receives a notification.
- [ ] Comment with `@ValidUser` (different case) → verify the same user receives a notification (case-insensitive).
- [ ] Comment with `@nonexistent` → verify no error occurs and other recipients still receive notifications.
- [ ] Comment with `@user1 @user2 @user1` (duplicate mention) → verify `user1` receives exactly one notification.
- [ ] Comment with `@a` (single character username) → verify it is resolved if the user exists.
- [ ] Comment with `@user.name`, `@user-name`, `@user_name` → verify all valid patterns are resolved.
- [ ] Comment with `@-invalid` (starts with hyphen) → verify it is not matched by the mention regex.
- [ ] Comment with no @mentions → verify other recipients (author, assignees, watchers) still receive notifications.
- [ ] Comment body that is empty string → verify no mention resolution and no error.

**User Preference Filtering:**

- [ ] User with `email_notifications_enabled: false` is assigned to an issue → verify no notification is created for that user.
- [ ] User disables notifications, then someone comments on their issue → verify no notification is created.
- [ ] User with `email_notifications_enabled: true` (default) is assigned → verify notification is created.
- [ ] One recipient has notifications disabled, another has them enabled → verify only the enabled user receives a notification.

**Repository Watcher Inclusion:**

- [ ] Repository with 3 watchers, issue comment posted → verify all 3 watchers (minus the commenter) receive notifications.
- [ ] Repository with 0 watchers, issue comment posted → verify only direct recipients (author, assignees, mentioned) receive notifications.
- [ ] Repository with 250 watchers (exceeds page size of 200) → verify all 250 watchers are included (pagination works correctly).
- [ ] Repository with 1000 watchers → verify all 1000 are included (multiple pages traversed).

**Notification Content:**

- [ ] Issue assigned notification subject matches pattern `"You were assigned to issue #N: <title>"`.
- [ ] Issue comment notification subject matches pattern `"New comment on issue #N: <title>"`.
- [ ] Issue comment notification body is the first 200 characters of the comment text.
- [ ] Comment body of exactly 200 characters → verify body is stored without `"..."`.
- [ ] Comment body of 201 characters → verify body is stored as first 200 characters + `"..."`.
- [ ] Comment body of 10,000 characters → verify body is truncated to 200 + `"..."`.
- [ ] LR review notification subject includes the review type (e.g., `"approved"`, `"request_changes"`, `"comment"`).
- [ ] Workspace failure notification subject matches `'Workspace "<name>" failed'`.
- [ ] Workspace shared notification subject matches `'Workspace "<name>" was shared with you'`.
- [ ] Workflow completed notification with `status: "success"` → subject contains `"succeeded"`.
- [ ] Workflow completed notification with `status: "failure"` → subject contains `"failure"`.

**Notification Record Integrity:**

- [ ] Every created notification has `status: "unread"` and `read_at: null`.
- [ ] Every created notification has a valid `source_type` from the defined set.
- [ ] Every created notification has a non-null `source_id`.
- [ ] Every created notification has `created_at` and `updated_at` timestamps within 5 seconds of the test execution time.

**Edge Cases:**

- [ ] Issue with empty title → verify notification subject still renders correctly.
- [ ] Issue title with 255 characters → verify notification subject is truncated to 255 characters total.
- [ ] Landing request with no previous reviewers → `onLRChangesPushed` creates zero notifications and returns success.
- [ ] Workspace status change to `"running"` → verify no notification is created.
- [ ] Workspace status change to `"stopped"` → verify no notification is created.
- [ ] Workspace status change to `"failed"` → verify notification is created for the owner.

### SSE Real-Time Delivery Tests

- [ ] Connect to SSE stream, then trigger an issue comment → verify the notification event arrives on the SSE stream within 5 seconds.
- [ ] Connect to SSE stream, trigger multiple events rapidly → verify all notifications arrive and none are lost.
- [ ] Disconnect from SSE, trigger an event, reconnect with `Last-Event-ID` → verify the missed notification is replayed.

### CLI Integration Tests

- [ ] Trigger an issue assignment via API, then run `codeplane notification list` → verify the notification appears in CLI output.
- [ ] Trigger an issue comment via API, then run `codeplane notification list --unread` → verify the notification appears.
- [ ] Trigger an event for a user with notifications disabled, then run `codeplane notification list` → verify no new notification appears.

### E2E Playwright (Web UI) Tests

- [ ] Sign in as User A, assign User B to an issue. Sign in as User B → verify the notification badge shows a new unread count and the inbox contains the assignment notification.
- [ ] Sign in as User A, comment on an issue authored by User B with `@UserC` mentioned. Sign in as User B → verify notification in inbox. Sign in as User C → verify notification in inbox.
- [ ] Sign in as User A, submit a review on User B's landing request. Sign in as User B → verify review notification in inbox.
- [ ] Sign in as User A, disable notifications in preferences. Have User B comment on User A's issue. Verify User A's inbox has no new notification.
- [ ] Trigger a workflow run completion → verify the initiator sees a workflow notification in their inbox.
- [ ] Click on an issue comment notification → verify navigation to the correct issue detail page.
- [ ] Click on a landing request review notification → verify navigation to the correct landing request detail page.
- [ ] Click on a workspace failure notification → verify navigation to the correct workspace detail page.
- [ ] Verify real-time badge update: have User A's inbox open, trigger a comment notification for User A from another session → verify the badge count increments without page refresh.

### Load & Boundary Tests

- [ ] Repository with 5,000 watchers: trigger an issue comment → verify all eligible watchers receive notifications and the fanout completes within 30 seconds.
- [ ] Comment body with 100,000 characters → verify body is truncated to 200 characters and notification is created successfully.
- [ ] Comment body with 50 unique @mentions → verify all 50 are resolved and deduplicated correctly.
- [ ] Rapid-fire 100 issue comments on the same issue within 10 seconds → verify all 100 fanout operations complete and notifications are created for each.
